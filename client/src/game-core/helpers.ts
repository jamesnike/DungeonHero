/**
 * Game Core Helpers
 *
 * Pure utility functions used across multiple game domains. None of these
 * depend on React or DOM — they operate on plain data.
 */

import type { GameCardData, EquipmentCardStatModifier } from '@/components/GameCard';
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
import { DUNGEON_COLUMN_COUNT, DUNGEON_COLUMNS, SHOP_TYPE_PRICES } from './constants';

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

export const getEmptyColumns = (slots: ActiveRowSlots): number[] =>
  DUNGEON_COLUMNS.filter(i => !slots[i]);

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
        (card.type === 'amulet' && card.recycleDelay != null) ||
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
    isPermRecycleEquipment(card);
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
