/**
 * Waterfall Domain — pure logic for the waterfall (card cascade) mechanic.
 *
 * The waterfall is the core mechanic: when the dungeon row has empty slots,
 * preview cards drop down, displaced cards are discarded, and new cards are
 * dealt from the deck into the preview row.
 */

import type { GameCardData } from '@/components/GameCard';
import type {
  ActiveRowSlots,
  WaterfallPlan,
  WaterfallDiscardDestination,
} from '@/components/game-board/types';
import type { GameState } from './types';
import { DUNGEON_COLUMN_COUNT, DUNGEON_COLUMNS } from './constants';
import { getWaterfallPreviewDiscardDestination, flattenActiveRowSlots, getEmptyOrGhostColumns } from './helpers';

// ---------------------------------------------------------------------------
// Plan the waterfall sequence (pure)
// ---------------------------------------------------------------------------

export function planWaterfall(
  previewCards: ActiveRowSlots,
  activeCards: ActiveRowSlots,
  remainingDeck: GameCardData[],
): WaterfallPlan | null {
  const emptySlots = DUNGEON_COLUMNS.filter(i => !activeCards[i]);
  if (emptySlots.length === 0) return null;

  const dropCards: GameCardData[] = [];
  const dropPreviewIndices: number[] = [];
  const dropTargetSlots: number[] = [];

  for (const targetSlot of emptySlots) {
    const previewCard = previewCards[targetSlot];
    if (previewCard) {
      dropCards.push(previewCard);
      dropPreviewIndices.push(targetSlot);
      dropTargetSlots.push(targetSlot);
    }
  }

  let discardCard: GameCardData | null = null;
  let discardPreviewIndex: number | null = null;
  let discardDestination: WaterfallDiscardDestination = 'graveyard';

  const filledPreviewIndices = DUNGEON_COLUMNS.filter(i => Boolean(previewCards[i]));
  const nonDropPreviewCards = filledPreviewIndices.filter(
    i => !dropPreviewIndices.includes(i),
  );
  if (nonDropPreviewCards.length > 0) {
    const leftmostRemaining = nonDropPreviewCards[0];
    discardCard = previewCards[leftmostRemaining];
    discardPreviewIndex = leftmostRemaining;
    discardDestination = getWaterfallPreviewDiscardDestination(discardCard);
  }

  const deckCopy = [...remainingDeck];
  const dealCount = Math.min(DUNGEON_COLUMN_COUNT, deckCopy.length);
  const newPreviewCards: GameCardData[] = deckCopy.slice(0, dealCount);
  const nextRemainingDeck = deckCopy.slice(dealCount);

  const shouldDeclareVictory =
    nextRemainingDeck.length === 0 &&
    newPreviewCards.every(c => c === null) &&
    flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster').length === 0;

  return {
    dropCards,
    dropPreviewIndices,
    dropTargetSlots,
    discardCard,
    discardPreviewIndex,
    discardDestination,
    nextPreviewCards: newPreviewCards,
    nextRemainingDeck,
    shouldDeclareVictory,
  };
}

// ---------------------------------------------------------------------------
// Apply waterfall drop (preview → active row)
// ---------------------------------------------------------------------------

export function applyWaterfallDrop(
  activeCards: ActiveRowSlots,
  drops: Array<{ card: GameCardData; targetSlot: number }>,
): ActiveRowSlots {
  const result = [...activeCards] as ActiveRowSlots;
  for (const { card, targetSlot } of drops) {
    result[targetSlot] = card;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Increment waterfall turn counter for rage
// ---------------------------------------------------------------------------

export function incrementTurnCountForWaterfall(state: GameState): Partial<GameState> {
  return { turnCount: state.turnCount + 1 };
}

// ---------------------------------------------------------------------------
// Waterfall discard side-effects
// ---------------------------------------------------------------------------

export interface WaterfallDiscardEffect {
  type: string;
  amount: number;
  description: string;
}

export function getWaterfallDiscardEffect(
  card: GameCardData,
): WaterfallDiscardEffect | null {
  if (!card.waterfallEffect) return null;
  return card.waterfallEffect as WaterfallDiscardEffect;
}

/**
 * Apply the effect of a card being pushed out of the preview row by the waterfall.
 * Returns a state patch.
 */
export function applyWaterfallEffect(
  state: GameState,
  effect: WaterfallDiscardEffect,
): Partial<GameState> {
  switch (effect.type) {
    case 'damage':
      return { hp: Math.max(0, state.hp - effect.amount) };

    case 'goldLoss':
      return { gold: Math.max(0, state.gold - effect.amount) };

    case 'turnBoost':
      return { turnCount: state.turnCount + effect.amount };

    case 'bonusDecay': {
      const decay = effect.amount;
      return {
        permanentMaxHpBonus: Math.max(0, state.permanentMaxHpBonus - decay),
        permanentSpellDamageBonus: state.permanentSpellDamageBonus - decay,
        equipmentSlotBonuses: {
          equipmentSlot1: {
            damage: Math.max(0, state.equipmentSlotBonuses.equipmentSlot1.damage - decay),
            shield: Math.max(0, state.equipmentSlotBonuses.equipmentSlot1.shield - decay),
          },
          equipmentSlot2: {
            damage: Math.max(0, state.equipmentSlotBonuses.equipmentSlot2.damage - decay),
            shield: Math.max(0, state.equipmentSlotBonuses.equipmentSlot2.shield - decay),
          },
        },
      };
    }

    case 'boostRowMonsterAttack': {
      const boost = effect.amount;
      const newActiveCards = state.activeCards.map(card => {
        if (!card || card.type !== 'monster') return card;
        return {
          ...card,
          attack: (card.attack ?? card.value) + boost,
          value: card.value + boost,
          tempAttackBoost: (card.tempAttackBoost ?? 0) + boost,
        };
      }) as ActiveRowSlots;
      return { activeCards: newActiveCards };
    }

    case 'destroyAllEquipment':
      return {
        equipmentSlot1: null,
        equipmentSlot2: null,
        equipmentSlot1Reserve: [],
        equipmentSlot2Reserve: [],
      };

    case 'spellDecay':
      return {
        permanentSpellDamageBonus: state.permanentSpellDamageBonus - effect.amount,
      };

    case 'destroyAllAmuletsAndDiscardHand':
      // Curses are immune to forced discard — they remain in hand.
      return {
        amuletSlots: [],
        handCards: state.handCards.filter(c => c.type === 'curse'),
      };

    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Per-waterfall resets
// ---------------------------------------------------------------------------

export function waterfallResetsPure(state: GameState): Partial<GameState> {
  return {
    unbreakableUntilWaterfall: {},
    slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
    slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
    waveDiscardCount: 0,
    turnDamageTaken: 0,
    heroSkillUsedThisWave: false,
    extraSkillsUsedThisWave: [],
    magicCardsPlayedThisTurn: 0,
    damageMagicPlayedThisTurn: 0,
  };
}
