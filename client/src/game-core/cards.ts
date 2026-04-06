/**
 * Cards Domain — pure logic for deck, hand, graveyard, and backpack operations.
 */

import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots } from '@/components/game-board/types';
import type { GameState } from './types';
import { HAND_LIMIT, BASE_BACKPACK_CAPACITY, DUNGEON_COLUMN_COUNT } from './constants';
import { isBackpackRestrictedCard, flattenActiveRowSlots } from './helpers';

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
  return { handCards: [...state.handCards, card] };
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
  if (isBackpackRestrictedCard(card)) {
    return { backpackItems: [...state.backpackItems, card] };
  }
  const capacity = getEffectiveBackpackCapacity(state);
  if (state.backpackItems.length >= capacity) {
    return { discardedCards: [...state.discardedCards, card] };
  }
  return { backpackItems: [...state.backpackItems, card] };
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

  const index = Math.floor(Math.random() * pool.length);
  const card = pool[index];

  return {
    card,
    patch: {
      handCards: [...state.handCards, card],
      backpackItems: state.backpackItems.filter(c => c.id !== card.id),
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

  for (let i = 0; i < count; i++) {
    if (currentHand.length >= limit || currentBackpack.length === 0) break;
    const index = Math.floor(Math.random() * currentBackpack.length);
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
    },
  };
}

// ---------------------------------------------------------------------------
// Graveyard operations
// ---------------------------------------------------------------------------

export function addToGraveyardPure(
  state: GameState,
  card: GameCardData,
): Partial<GameState> {
  return {
    discardedCards: [...state.discardedCards, card],
  };
}

// ---------------------------------------------------------------------------
// Discard all hand cards
// ---------------------------------------------------------------------------

export function discardAllHandCardsPure(
  state: GameState,
): { discarded: GameCardData[]; patch: Partial<GameState> } {
  const hand = [...state.handCards];
  return {
    discarded: hand,
    patch: {
      handCards: [],
      discardedCards: [...state.discardedCards, ...hand],
    },
  };
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
  return {
    permanentMagicRecycleBag: [...state.permanentMagicRecycleBag, card],
  };
}

export function processRecycleBag(
  state: GameState,
): { restored: GameCardData[]; remaining: GameCardData[]; patch: Partial<GameState> } {
  const ready: GameCardData[] = [];
  const stillWaiting: GameCardData[] = [];

  for (const card of state.permanentMagicRecycleBag) {
    const waits = card._recycleWaits ?? 0;
    if (waits <= 0) {
      ready.push(card);
    } else {
      stillWaiting.push({ ...card, _recycleWaits: waits - 1 });
    }
  }

  return {
    restored: ready,
    remaining: stillWaiting,
    patch: {
      permanentMagicRecycleBag: stillWaiting,
      backpackItems: [...state.backpackItems, ...ready],
    },
  };
}

// ---------------------------------------------------------------------------
// Deck operations
// ---------------------------------------------------------------------------

export function shuffleDeck(deck: GameCardData[]): GameCardData[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function drawFromDeck(
  deck: GameCardData[],
  count: number,
): { drawn: GameCardData[]; remaining: GameCardData[] } {
  const drawn = deck.slice(0, Math.min(count, deck.length));
  const remaining = deck.slice(drawn.length);
  return { drawn, remaining };
}
