/**
 * Cards Domain — pure logic for deck, hand, graveyard, and backpack operations.
 */

import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots } from '@/components/game-board/types';
import type { GameState } from './types';
import { HAND_LIMIT, BASE_BACKPACK_CAPACITY, DUNGEON_COLUMN_COUNT, clampMaxDurability } from './constants';
import { isBackpackRestrictedCard, flattenActiveRowSlots, isRecyclableFromHand } from './helpers';
import { applyMonsterRage } from '@/lib/monsterRage';
import type { RngState } from './rng';
import { nextInt, shuffle as rngShuffle } from './rng';

// ---------------------------------------------------------------------------
// Hand operations
// ---------------------------------------------------------------------------

export function getEffectiveHandLimit(state: GameState): number {
  return HAND_LIMIT + (state.handLimitBonus ?? 0);
}

export function canAddToHand(state: GameState): boolean {
  return state.handCards.length < getEffectiveHandLimit(state);
}

export function addCardToHand(state: GameState, card: GameCardData): Partial<GameState> {
  const limit = getEffectiveHandLimit(state);
  if (state.handCards.length >= limit) {
    return {};
  }
  const primed = primeMonsterAsEquipment(card, state.gameMode === 'quick');
  return { handCards: [...state.handCards, primed] };
}

export function removeCardFromHand(state: GameState, cardId: string): Partial<GameState> {
  const filtered = state.handCards.filter(c => c.id !== cardId);
  if (filtered.length === state.handCards.length) return {};
  return { handCards: filtered };
}

// ---------------------------------------------------------------------------
// Backpack operations
// ---------------------------------------------------------------------------

export function getEffectiveBackpackCapacity(state: GameState): number {
  return BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier;
}

export function addCardToBackpackPure(
  state: GameState,
  card: GameCardData,
): Partial<GameState> {
  const primed = primeMonsterAsEquipment(card, state.gameMode === 'quick');
  if (isBackpackRestrictedCard(primed)) {
    return { backpackItems: [...state.backpackItems, primed] };
  }
  const capacity = getEffectiveBackpackCapacity(state);
  if (state.backpackItems.length >= capacity) {
    return {
      permanentMagicRecycleBag: [...state.permanentMagicRecycleBag, primed],
    };
  }
  return { backpackItems: [...state.backpackItems, primed] };
}

export function removeCardFromBackpack(state: GameState, cardId: string): Partial<GameState> {
  const filtered = state.backpackItems.filter(c => c.id !== cardId);
  if (filtered.length === state.backpackItems.length) return {};
  return { backpackItems: filtered };
}

/**
 * Draw a random card from backpack to hand. Returns the drawn card and state patch.
 */
export function drawFromBackpackToHandPure(
  state: GameState,
  options?: { avoidCardIds?: string[] },
): { card: GameCardData | null; patch: Partial<GameState> } {
  const limit = getEffectiveHandLimit(state);
  if (state.handCards.length >= limit || state.backpackItems.length === 0) {
    return { card: null, patch: {} };
  }

  let pool = state.backpackItems;
  if (options?.avoidCardIds?.length) {
    const avoidSet = new Set(options.avoidCardIds);
    const filtered = pool.filter(c => !avoidSet.has(c.id));
    if (filtered.length > 0) pool = filtered;
  }

  const [index, rng] = nextInt(state.rng, 0, pool.length - 1);
  const card = pool[index];

  return {
    card,
    patch: {
      handCards: [...state.handCards, card],
      backpackItems: state.backpackItems.filter(c => c.id !== card.id),
      rng,
    },
  };
}

/**
 * Draw multiple cards from backpack to hand.
 */
export function drawMultipleFromBackpack(
  state: GameState,
  count: number,
  options?: { ignoreLimit?: boolean },
): { cards: GameCardData[]; patch: Partial<GameState> } {
  const cards: GameCardData[] = [];
  let currentHand = [...state.handCards];
  let currentBackpack = [...state.backpackItems];
  const limit = options?.ignoreLimit ? Infinity : getEffectiveHandLimit(state);
  let rng = state.rng;

  for (let i = 0; i < count; i++) {
    if (currentHand.length >= limit || currentBackpack.length === 0) break;
    const [index, nextRng] = nextInt(rng, 0, currentBackpack.length - 1);
    rng = nextRng;
    const card = currentBackpack[index];
    cards.push(card);
    currentHand.push(card);
    currentBackpack = currentBackpack.filter((_, j) => j !== index);
  }

  if (cards.length === 0) {
    return { cards: [], patch: {} };
  }

  return {
    cards,
    patch: {
      handCards: currentHand,
      backpackItems: currentBackpack,
      rng,
    },
  };
}

// ---------------------------------------------------------------------------
// Monster stat reset for graveyard
// ---------------------------------------------------------------------------

/**
 * Reset a monster's attack / HP / fury back to its "entering active row" state
 * by clearing all combat-acquired modifiers and re-applying rage from base stats.
 * Non-monster cards pass through unchanged.
 *
 * Additionally pins `currentLayer` to 1 so any subsequent resurrection /
 * graveyard-fetch (boss enrage summon, future revive effects, etc.) brings the
 * monster back as a single-layer threat regardless of how many layers its rage
 * tier would otherwise grant. The cap (`fury` / `hpLayers`) is preserved.
 */
export function resetMonsterForGraveyard(card: GameCardData, isQuickMode = false): GameCardData {
  if (card.type !== 'monster') return card;

  const cleaned: GameCardData = {
    ...card,
    specialAttackBoost: 0,
    tempAttackBoost: 0,
    tempHpBoost: 0,
    lowGoldBuffActive: false,
    reviveUsed: false,
    durability: undefined,
    maxDurability: undefined,
  };

  const raged = applyMonsterRage(cleaned, cleaned.rageTurn ?? 1, isQuickMode);
  return { ...raged, currentLayer: 1 };
}

/**
 * Reset a weapon/shield's transient combat state when it heads to the
 * graveyard, so future graveyard-fetch effects (e.g. Iron Shield's
 * `graveyard-to-hand` last words) recover a fresh, full-durability copy.
 *
 * Non-equipment cards pass through unchanged. Monster equipment is intentionally
 * skipped — it goes through `resetMonsterForGraveyard`, which strips
 * `durability`/`maxDurability` to revert it back to its monster card form.
 *
 * Reset rules (mirrors the salvage / perm-recycle paths):
 *   - `durability` → `maxDurability`
 *   - strip `armor` / `armorBonusDamaged` (re-derived on next equip from
 *     `armorMax * durability`, matching `repairDurabilityPure`)
 *   - strip `reviveUsed` / `equipmentReviveUsed` / `wraithRebirthUsed` so a
 *     fresh card regains its revive
 *   - strip `fromSlot` (slot routing metadata, never persisted off-slot)
 */
export function resetEquipmentForGraveyard(card: GameCardData): GameCardData {
  if (card.type !== 'weapon' && card.type !== 'shield') return card;

  const {
    fromSlot: _fromSlot,
    armor: _armor,
    armorBonusDamaged: _armorBonusDamaged,
    reviveUsed: _reviveUsed,
    equipmentReviveUsed: _equipmentReviveUsed,
    wraithRebirthUsed: _wraithRebirthUsed,
    ...rest
  } = card as GameCardData & Record<string, unknown>;

  const reset: GameCardData = { ...(rest as GameCardData) };
  if (reset.maxDurability != null) {
    reset.durability = reset.maxDurability;
  }
  return reset;
}

/**
 * Combined "card heads to graveyard" reset. Routes monsters through the
 * monster reset and weapons/shields through the equipment reset. Other types
 * pass through unchanged.
 */
export function resetCardForGraveyard(card: GameCardData, isQuickMode = false): GameCardData {
  if (card.type === 'monster') return resetMonsterForGraveyard(card, isQuickMode);
  if (card.type === 'weapon' || card.type === 'shield') return resetEquipmentForGraveyard(card);
  return card;
}

/**
 * Ensure a monster card is "equipment-shaped" before it lands in hand /
 * backpack / recycle bag. Mirrors what `persuadeSuccessPatch` does for the
 * persuade flow:
 *   1. Strip combat-acquired buffs/debuffs via `resetMonsterForGraveyard`
 *      (consistent with the graveyard recovery path) so the card represents
 *      its baseline equipment form.
 *   2. Seed `durability` / `maxDurability` from the monster's fury / hp
 *      layers so the UI (`CardDetailsModal.isMonsterEquipment`, `GameCard`)
 *      treats it as a monster equipment.
 *
 * Non-monster cards and monsters that already carry durability are returned
 * unchanged.
 */
export function primeMonsterAsEquipment(
  card: GameCardData,
  isQuickMode = false,
): GameCardData {
  if (card.type !== 'monster') return card;
  if (card.durability != null && card.maxDurability != null) return card;

  const reset = resetMonsterForGraveyard(card, isQuickMode);
  const rawBase = reset.fury ?? reset.hpLayers ?? 1;
  const base = clampMaxDurability(rawBase);
  return { ...reset, durability: base, maxDurability: base };
}

// ---------------------------------------------------------------------------
// Graveyard operations
// ---------------------------------------------------------------------------

export function addToGraveyardPure(
  state: GameState,
  card: GameCardData,
): Partial<GameState> {
  return {
    discardedCards: [...state.discardedCards, resetCardForGraveyard(card, state.gameMode === 'quick')],
  };
}

// ---------------------------------------------------------------------------
// Discard all hand cards
// ---------------------------------------------------------------------------

export function discardAllHandCardsPure(
  state: GameState,
): { discarded: GameCardData[]; patch: Partial<GameState> } {
  // Curses are immune to forced discard — they stay in hand.
  const hand = [...state.handCards];
  const kept = hand.filter(c => c.type === 'curse');
  const discarded = hand.filter(c => c.type !== 'curse');
  const recycled = discarded.filter(c => isRecyclableFromHand(c));
  const toGrave = discarded.filter(c => !isRecyclableFromHand(c));
  const patch: Partial<GameState> = {
    handCards: kept,
    discardedCards: [...state.discardedCards, ...toGrave.map(c => resetCardForGraveyard(c, state.gameMode === 'quick'))],
  };
  if (recycled.length > 0) {
    patch.permanentMagicRecycleBag = [
      ...state.permanentMagicRecycleBag,
      ...recycled.map(c => {
        const primed = primeMonsterAsEquipment(c, state.gameMode === 'quick');
        return { ...primed, _recycleWaits: primed.recycleDelay ?? 2 } as GameCardData;
      }),
    ];
  }
  return { discarded, patch };
}

// ---------------------------------------------------------------------------
// Remove card from active dungeon row
// ---------------------------------------------------------------------------

export function removeCardFromActiveRow(
  activeCards: ActiveRowSlots,
  cardId: string,
): ActiveRowSlots {
  return activeCards.map(card => (card?.id === cardId ? null : card)) as ActiveRowSlots;
}

export function updateCardInActiveRow(
  activeCards: ActiveRowSlots,
  cardId: string,
  updater: (card: GameCardData) => GameCardData,
): ActiveRowSlots {
  return activeCards.map(card => {
    if (!card || card.id !== cardId) return card;
    return updater(card);
  }) as ActiveRowSlots;
}

// ---------------------------------------------------------------------------
// Class deck operations
// ---------------------------------------------------------------------------

export function drawClassCardsToBackpackPure(
  state: GameState,
  count: number,
): { cards: GameCardData[]; patch: Partial<GameState> } {
  if (state.classDeck.length === 0) {
    return { cards: [], patch: {} };
  }

  const drawn = state.classDeck.slice(0, Math.min(count, state.classDeck.length));
  const remaining = state.classDeck.slice(drawn.length);

  return {
    cards: drawn,
    patch: {
      classDeck: remaining,
      backpackItems: [...state.backpackItems, ...drawn],
    },
  };
}

export function returnCardsToClassDeckPure(
  state: GameState,
  cards: GameCardData[],
): Partial<GameState> {
  if (cards.length === 0) return {};
  return {
    classDeck: [...state.classDeck, ...cards],
  };
}

// ---------------------------------------------------------------------------
// Recycle bag (permanent magic / perm equipment)
// ---------------------------------------------------------------------------

export function addToRecycleBag(
  state: GameState,
  card: GameCardData,
): Partial<GameState> {
  const primed = primeMonsterAsEquipment(card, state.gameMode === 'quick');
  return {
    permanentMagicRecycleBag: [...state.permanentMagicRecycleBag, primed],
  };
}

export function processRecycleBag(
  state: GameState,
): { restored: GameCardData[]; remaining: GameCardData[]; patch: Partial<GameState> } {
  const ready: GameCardData[] = [];
  const stillWaiting: GameCardData[] = [];

  // Decrement-first semantics (matches design_guidelines.md, GAME_MECHANICS.md, and
  // every other recycle-bag iteration in the codebase): subtract 1 from each card's
  // remaining waterfalls, then cards with `_recycleWaits <= 0` become ready to return.
  for (const card of state.permanentMagicRecycleBag) {
    const waits = (card._recycleWaits ?? 1) - 1;
    if (waits <= 0) {
      const { _recycleWaits: _omit, ...clean } = card as GameCardData & { _recycleWaits?: number };
      ready.push(clean as GameCardData);
    } else {
      stillWaiting.push({ ...card, _recycleWaits: waits });
    }
  }

  const capacity = getEffectiveBackpackCapacity(state);
  const availableSlots = Math.max(0, capacity - state.backpackItems.length);
  const toRestore = ready.slice(0, availableSlots);
  const overflow = ready.slice(availableSlots);

  return {
    restored: toRestore,
    remaining: [...overflow, ...stillWaiting],
    patch: {
      permanentMagicRecycleBag: [...overflow, ...stillWaiting],
      backpackItems: [...state.backpackItems, ...toRestore],
    },
  };
}

// ---------------------------------------------------------------------------
// Deck operations
// ---------------------------------------------------------------------------

export function shuffleDeck(deck: GameCardData[], rng: RngState): [GameCardData[], RngState] {
  return rngShuffle(deck, rng);
}

export function drawFromDeck(
  deck: GameCardData[],
  count: number,
): { drawn: GameCardData[]; remaining: GameCardData[] } {
  const drawn = deck.slice(0, Math.min(count, deck.length));
  const remaining = deck.slice(drawn.length);
  return { drawn, remaining };
}
