/**
 * Game Core Helpers
 *
 * Pure utility functions used across multiple game domains. None of these
 * depend on React or DOM — they operate on plain data.
 */

import type { GameCardData, CardType, EquipmentCardStatModifier, AmuletEffectId } from '@/components/GameCard';
import { isPermRecycleEquipment } from '@/components/GameCard';
import type {
  ActiveRowSlots,
  EquipmentSlotId,
  EquipmentRepairTarget,
  HeroRowDropType,
  SlotPermanentBonus,
  GridMetrics,
  WaterfallDiscardDestination,
} from '@/components/game-board/types';
import {
  DUNGEON_COLUMN_COUNT,
  DUNGEON_COLUMNS,
  SHOP_TYPE_PRICES,
  BALANCE_ATTACK_BONUS,
  BALANCE_ATTACK_PENALTY,
  BALANCE_SHIELD_BONUS,
  BALANCE_SHIELD_PENALTY,
} from './constants';

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

export const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(Math.max(value, min), max);

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const getRandomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

export const formatRepairTargetLabel = (targets: EquipmentRepairTarget[]): string => {
  if (targets.includes('monster')) return '装备';
  if (targets.includes('weapon') && targets.includes('shield')) return '武器或护盾';
  return targets[0] === 'shield' ? '护盾' : '武器';
};

export const describeSlotLabel = (slotId: EquipmentSlotId): '左侧装备栏' | '右侧装备栏' =>
  slotId === 'equipmentSlot1' ? '左侧装备栏' : '右侧装备栏';

export const describeBonusLabel = (bonusType: keyof SlotPermanentBonus): '伤害' | '护甲' =>
  bonusType === 'damage' ? '伤害' : '护甲';

// ---------------------------------------------------------------------------
// Slot / Drag helpers
// ---------------------------------------------------------------------------

export const normalizeHeroEquipmentSlotFromDrag = (
  raw: string | undefined | null,
): EquipmentSlotId | undefined => {
  if (raw === 'equipmentSlot1' || raw === 'slot-equipment-1') return 'equipmentSlot1';
  if (raw === 'equipmentSlot2' || raw === 'slot-equipment-2') return 'equipmentSlot2';
  return undefined;
};

// ---------------------------------------------------------------------------
// Card helpers
// ---------------------------------------------------------------------------

export const isBackpackRestrictedCard = (card: GameCardData | null): boolean =>
  Boolean(
    card &&
      (card.type === 'magic' ||
        card.type === 'hero-magic' ||
        card.type === 'potion' ||
        card.type === 'building' ||
        card.isPermanentEvent),
  );

export const isHeroRowHighlightCard = (
  card: GameCardData | null,
): card is GameCardData & { type: HeroRowDropType } =>
  Boolean(
    card &&
    (card.type === 'event' ||
      card.type === 'magic' ||
      card.type === 'hero-magic' ||
      card.type === 'potion' ||
      (card.type === 'building' && card.eventChoices)),
  );

export const getShopPrice = (card: GameCardData): number => {
  if (SHOP_TYPE_PRICES[card.type] !== undefined) {
    return SHOP_TYPE_PRICES[card.type] as number;
  }
  return Math.max(5, card.value || 5);
};

// ---------------------------------------------------------------------------
// Active row helpers
// ---------------------------------------------------------------------------

export const fillActiveRowSlots = (cards: GameCardData[]): ActiveRowSlots => {
  const slots: ActiveRowSlots = Array.from({ length: DUNGEON_COLUMN_COUNT }, () => null);
  cards.forEach((card, index) => {
    if (index < DUNGEON_COLUMN_COUNT) {
      slots[index] = card;
    }
  });
  return slots;
};

export const flattenActiveRowSlots = (slots: ActiveRowSlots): GameCardData[] =>
  slots.filter((card): card is GameCardData => Boolean(card));

export const countActiveRowSlots = (slots: ActiveRowSlots): number =>
  slots.reduce((count, card) => (card ? count + 1 : count), 0);

/** Count non-null, non-ghost cards in the active row (ghost cards are transparent to waterfall) */
export const countActiveRowSlotsExcludeGhost = (slots: ActiveRowSlots): number =>
  slots.reduce((count, card) => (card && !card.isGhost ? count + 1 : count), 0);

export const getEmptyColumns = (slots: ActiveRowSlots): number[] =>
  DUNGEON_COLUMNS.filter(i => !slots[i]);

/** Columns that are truly empty OR occupied only by a ghost card (transparent to waterfall) */
export const getEmptyOrGhostColumns = (slots: ActiveRowSlots): number[] =>
  DUNGEON_COLUMNS.filter(i => !slots[i] || slots[i]?.isGhost);

export const getFilledPreviewColumns = (slots: ActiveRowSlots): number[] =>
  DUNGEON_COLUMNS.filter(i => Boolean(slots[i]));

export const findSlotIndexByCardId = (slots: ActiveRowSlots, cardId: string): number =>
  slots.findIndex(card => card?.id === cardId);

// ---------------------------------------------------------------------------
// Card metadata sanitization
// ---------------------------------------------------------------------------

export const sanitizeCardMetadata = <T extends GameCardData>(card: T): T => {
  const { fromSlot, ...rest } = card as T & { fromSlot?: string };
  return { ...rest } as T;
};

export const sanitizeCardList = <T extends GameCardData>(cards: T[]): T[] =>
  cards.map(card => sanitizeCardMetadata(card));

export const sanitizeSlotRow = (slots: ActiveRowSlots): ActiveRowSlots =>
  slots.map(card => (card ? sanitizeCardMetadata(card) : null));

// ---------------------------------------------------------------------------
// Hand discard: recycle bag vs graveyard (must match discardCardToGraveyard)
// ---------------------------------------------------------------------------

/** 手牌弃回时进入回收袋（而非坟场）的牌，与 useCardOperations 路由一致。 */
export function isRecyclableFromHand(card: GameCardData | null | undefined): boolean {
  return Boolean(
    card &&
      ((card.type === 'magic' && card.magicType === 'permanent') ||
        card.isPermanentEvent ||
        isPermRecycleEquipment(card) ||
        (card.recycleDelay != null && card.recycleDelay > 0)),
  );
}

/**
 * 效果要求随机弃回手牌时：优先弃可进坟场的牌，不足时再弃会进回收袋的牌（各组内仍随机）。
 */
export function pickRandomHandCardsForDiscardPreferGraveyard(
  hand: GameCardData[],
  count: number,
): GameCardData[] {
  if (count <= 0 || hand.length === 0) return [];
  const n = Math.min(count, hand.length);
  const graveyardFirst = hand.filter(c => !isRecyclableFromHand(c));
  const recycleRest = hand.filter(c => isRecyclableFromHand(c));
  const shuffleInPlace = <T,>(a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const g = shuffleInPlace([...graveyardFirst]);
  const r = shuffleInPlace([...recycleRest]);
  return [...g, ...r].slice(0, n);
}

// ---------------------------------------------------------------------------
// Grid layout metrics (pure computation, used by both core and UI)
// ---------------------------------------------------------------------------

export const getGridMetricsForWidth = (width: number): GridMetrics => {
  if (width <= 430) {
    return { gapX: 6, gapY: 10, padding: 2, cardFontScale: 1.15, cardStatScale: 1.2, cardIconScale: 1.15, cardDotSize: 6, heroFontScale: 0.85 };
  }
  if (width <= 640) {
    return { gapX: 10, gapY: 14, padding: 4, cardFontScale: 1.08, cardStatScale: 1.08, cardIconScale: 1.08, cardDotSize: 6, heroFontScale: 0.9 };
  }
  if (width <= 1024) {
    return { gapX: 16, gapY: 18, padding: 6, cardFontScale: 1, cardStatScale: 1, cardIconScale: 1, cardDotSize: 7, heroFontScale: 1 };
  }
  return { gapX: 24, gapY: 26, padding: 8, cardFontScale: 1, cardStatScale: 1, cardIconScale: 1, cardDotSize: 7, heroFontScale: 1.05 };
};

// ---------------------------------------------------------------------------
// Waterfall helpers
// ---------------------------------------------------------------------------

export function getWaterfallPreviewDiscardDestination(
  card: GameCardData | null | undefined,
): WaterfallDiscardDestination {
  if (!card) return 'graveyard';
  if (card.type === 'monster' && card.isFinalMonster && !card.bossPhase) return 'deck';
  const wfx = card.waterfallEffect;
  if (wfx && (card.type === 'monster' || card.type === 'event') && wfx.type === 'returnToDeck') {
    return 'deck';
  }
  const isPerm =
    (card.type === 'magic' && card.magicType === 'permanent') ||
    card.type === 'amulet' ||
    card.isPermanentEvent ||
    isPermRecycleEquipment(card) ||
    (card.recycleDelay != null && card.recycleDelay > 0);
  if (isPerm) return 'recycle-bag';
  return 'graveyard';
}

// ---------------------------------------------------------------------------
// Dev logging helpers
// ---------------------------------------------------------------------------

const DEV = process.env.NODE_ENV !== 'production';

export const logWaterfall = (phase: string, payload?: Record<string, unknown>): void => {
  if (DEV) console.debug(`[Waterfall] ${phase}`, payload);
};

export const logWaterfallInvariant = (
  condition: boolean,
  label: string,
  payload?: Record<string, unknown>,
): void => {
  if (!condition && DEV) console.warn(`[Waterfall][Invariant] ${label}`, payload);
};

export const logHeroMagic = (...args: unknown[]): void => {
  if (DEV) console.debug('[HeroMagic]', ...args);
};

export const logBackpackDraw = (tag: string, payload?: unknown): void => {
  if (!DEV) return;
  if (typeof payload === 'undefined') {
    console.debug('[BackpackDraw]', tag);
  } else {
    console.debug('[BackpackDraw]', tag, payload);
  }
};

// ---------------------------------------------------------------------------
// 转型 (Transformation) — card play category
// ---------------------------------------------------------------------------

export type CardPlayCategory =
  | 'instant-magic'
  | 'perm-magic'
  | 'hero-magic'
  | 'weapon'
  | 'shield'
  | 'amulet'
  | 'potion'
  | 'monster-equipment';

export function getCardPlayCategory(card: GameCardData): CardPlayCategory {
  const t: CardType = card.type;
  if (t === 'magic') {
    return card.magicType === 'permanent' ? 'perm-magic' : 'instant-magic';
  }
  if (t === 'hero-magic') return 'hero-magic';
  if (t === 'weapon') return 'weapon';
  if (t === 'shield') return 'shield';
  if (t === 'amulet') return 'amulet';
  if (t === 'potion') return 'potion';
  if (t === 'monster') return 'monster-equipment';
  return 'instant-magic';
}

// ---------------------------------------------------------------------------
// Amulet aura reversal helpers
// ---------------------------------------------------------------------------

export interface AmuletAuraReversal {
  tempAttackDelta: { equipmentSlot1: number; equipmentSlot2: number };
  tempArmorDelta: { equipmentSlot1: number; equipmentSlot2: number };
}

/**
 * Compute the slotTempAttack / slotTempArmor deltas needed to reverse the
 * aura effects of the given amulets.  Caller should apply both deltas after
 * clearing the amulet slots.
 */
export function computeAmuletAuraReversal(
  amulets: readonly { amuletEffect?: AmuletEffectId }[],
): AmuletAuraReversal {
  const result: AmuletAuraReversal = {
    tempAttackDelta: { equipmentSlot1: 0, equipmentSlot2: 0 },
    tempArmorDelta: { equipmentSlot1: 0, equipmentSlot2: 0 },
  };
  for (const a of amulets) {
    if (a.amuletEffect === 'strength') {
      result.tempAttackDelta.equipmentSlot1 -= 4;
      result.tempAttackDelta.equipmentSlot2 -= 4;
    }
    if (a.amuletEffect === 'balance') {
      result.tempAttackDelta.equipmentSlot1 -= BALANCE_ATTACK_BONUS;
      result.tempAttackDelta.equipmentSlot2 += BALANCE_ATTACK_PENALTY;
      result.tempArmorDelta.equipmentSlot1 += BALANCE_SHIELD_PENALTY;
      result.tempArmorDelta.equipmentSlot2 -= BALANCE_SHIELD_BONUS;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// isDamageMagic — checks if a magic card deals damage (for Amplify targeting)
// ---------------------------------------------------------------------------

export function isDamageMagic(card: GameCardData): boolean {
  if (card.type !== 'magic') return false;
  if (card.scalingDamage != null) return true;
  if (card.onDiscardDamage != null && card.onDiscardDamage > 0) return true;
  const damageKnightEffects = [
    'missile-bolt',
    'armor-strike',
    'missing-hp-smite',
    'blood-sacrifice-strike',
    'grave-nova',
    'fate-sight',
    'temp-attack-strike',
    'weapon-sweep',
    'overkill-upgrade',
  ];
  if (card.knightEffect && damageKnightEffects.includes(card.knightEffect)) return true;
  const damageEffects = [
    'storm-volley-recycle',
    'arcane-storm-magic-count',
    'bounty-spell-damage',
  ];
  if (card.magicEffect && damageEffects.includes(card.magicEffect)) return true;
  const damageNames = [
    '风暴箭雨', '点金裁决', '混沌冲击', '箭雨余韵', '魔弹', '雷震击', '赏金裁决',
  ];
  if (damageNames.includes(card.name)) return true;
  return false;
}
