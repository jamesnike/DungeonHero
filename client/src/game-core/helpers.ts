/**
 * Game Core Helpers
 *
 * Pure utility functions used across multiple game domains. None of these
 * depend on React or DOM — they operate on plain data.
 */

import type { GameCardData, CardType, EquipmentCardStatModifier, AmuletEffectId } from '@/components/GameCard';
import { isPermRecycleEquipment } from '@/components/GameCard';
import type { RngState } from './rng';
import { shuffle as rngShuffle } from './rng';
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
  PERSUADE_COST,
} from './constants';
import type { GameState, EternalRelic } from './types';
import { computeAmuletEffects } from './equipment';
import { getEquipmentSlotsWithSuppressedTempAttack } from './buildingAura';

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

export const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(Math.max(value, min), max);

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

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

export const isDamageableTarget = (card: GameCardData | null | undefined): card is GameCardData =>
  Boolean(card && (card.type === 'monster' || card.type === 'building'));

export const isBackpackRestrictedCard = (card: GameCardData | null): boolean =>
  Boolean(
    card &&
      (card.type === 'magic' ||
        card.type === 'hero-magic' ||
        card.type === 'potion' ||
        card.type === 'curse' ||
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
// Building slot sync (fate-blade / amplify-altar release charge repair)
// ---------------------------------------------------------------------------

const RELEASE_CHARGE_BUILDING_NAMES = ['命运之刃', '增幅祭坛'];

/**
 * When a release-charge building (命运之刃 / 增幅祭坛) moves to a new slot,
 * update `_fateBladeLastSlot` to the current index and optionally grant
 * `hasReleaseCharge` if it didn't already have one. Returns a new array if
 * any card was patched, or `null` if nothing changed.
 */
export function syncBuildingSlotsPure(activeCards: ActiveRowSlots): ActiveRowSlots | null {
  let changed = false;
  let result: ActiveRowSlots | null = null;

  for (const buildingName of RELEASE_CHARGE_BUILDING_NAMES) {
    const idx = activeCards.findIndex(c => c?.name === buildingName && c.type === 'building');
    if (idx === -1) continue;
    const card = activeCards[idx]!;
    if (card._fateBladeLastSlot === idx) continue;

    if (!result) result = [...activeCards] as ActiveRowSlots;
    result[idx] = {
      ...card,
      hasReleaseCharge: true,
      _fateBladeLastSlot: idx,
    };
    changed = true;
  }

  return changed ? result : null;
}

// ---------------------------------------------------------------------------
// Amplify (按卡名累计的增幅加成)
// ---------------------------------------------------------------------------

/**
 * 单步把 `amount` 点增幅加成应用到一张卡上（不可变更新，返回新对象）。
 *  - 武器/怪物卡：value += amount
 *  - 护盾：armorMax += amount, value += amount
 *  - 带 scalingDamage 的伤害魔法（叠刺）：scalingDamage += amount
 *  - 其它魔法：仅更新 amplifyBonus（damage 计算路径会读取 amplifyBonus）
 *  - 其它类型：原样返回
 *
 * `amplifyBonus` 在所有可增幅类型上都会同步累加，作为展示与持久化跟踪。
 */
export function applyAmplifyToCard<T extends GameCardData>(card: T, amount: number): T {
  if (!amount) return card;
  if (card.type === 'weapon' || card.type === 'monster') {
    return { ...card, value: card.value + amount, amplifyBonus: (card.amplifyBonus ?? 0) + amount };
  }
  if (card.type === 'shield') {
    const oldArmor = card.armorMax ?? card.value;
    return {
      ...card,
      armorMax: oldArmor + amount,
      value: card.value + amount,
      amplifyBonus: (card.amplifyBonus ?? 0) + amount,
    };
  }
  if (card.type === 'magic') {
    if (card.scalingDamage != null) {
      return {
        ...card,
        scalingDamage: (card.scalingDamage ?? 0) + amount,
        amplifyBonus: (card.amplifyBonus ?? 0) + amount,
      };
    }
    return { ...card, amplifyBonus: (card.amplifyBonus ?? 0) + amount };
  }
  return card;
}

/**
 * 在卡牌"创建"时（运行时工厂如 createMagicBoltCard / createGreedCurseCard 等），
 * 根据当前 `amplifiedCardBonus` map 应用按卡名累计的增幅加成。如果该卡名从未被增幅，
 * 直接返回原卡。
 *
 * 注意：此 helper **只**应用 map 中存储的总量，与卡上现有的 amplifyBonus 不叠加 —
 * 工厂返回的新卡 amplifyBonus 通常为 undefined/0，所以叠加结果就是 map 中的值。
 */
export function applyAmplifyOnCreate<T extends GameCardData>(
  card: T,
  amplifiedCardBonus: Record<string, number> | undefined | null,
): T {
  if (!amplifiedCardBonus) return card;
  const amount = amplifiedCardBonus[card.name] ?? 0;
  if (!amount) return card;
  return applyAmplifyToCard(card, amount);
}

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

/**
 * Curses are a top-level card type (`type: 'curse'`). They cannot be recycled,
 * discarded to the graveyard, or removed by any forced-discard effect — the
 * only way to remove a curse from the player's collection is to play it.
 */
export function isCurseCard(card: GameCardData | null | undefined): boolean {
  return Boolean(card && card.type === 'curse');
}

/** 手牌弃回时进入回收袋（而非坟场）的牌，与 useCardOperations 路由一致。 */
export function isRecyclableFromHand(card: GameCardData | null | undefined): boolean {
  // Curses can never be recycled or discarded — they're locked to backpack/hand.
  if (isCurseCard(card)) return false;
  // 凡化咒已剥离 Perm — 即使 magicType 仍为 permanent 也按非 Perm 处理（进坟场）
  if (card?.permStripped) return false;
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
 * 诅咒牌永远不会被随机弃回（无法离开手牌/背包）。
 */
export function pickRandomHandCardsForDiscardPreferGraveyard(
  hand: GameCardData[],
  count: number,
  rng: RngState,
): [GameCardData[], RngState] {
  if (count <= 0 || hand.length === 0) return [[], rng];
  const eligible = hand.filter(c => !isCurseCard(c));
  if (eligible.length === 0) return [[], rng];
  const n = Math.min(count, eligible.length);
  const graveyardFirst = eligible.filter(c => !isRecyclableFromHand(c));
  const recycleRest = eligible.filter(c => isRecyclableFromHand(c));
  const [g, rng2] = rngShuffle(graveyardFirst, rng);
  const [r, rng3] = rngShuffle(recycleRest, rng2);
  return [[...g, ...r].slice(0, n), rng3];
}

/**
 * 玩家自选弃回 — 计算「可被玩家选择弃回的手牌列表」。
 *
 * 排除：诅咒牌（与 pickRandomHandCardsForDiscardPreferGraveyard 一致）、
 * 以及触发本次效果的源卡牌本身（避免「弃自己抽自己」的悖论）。
 * 不排序——UI 按当前手牌顺序展示即可，玩家自行选择。
 */
export function getEligibleHandDiscardCards(
  hand: GameCardData[],
  sourceCardId: string | null,
): GameCardData[] {
  return hand.filter(c => !isCurseCard(c) && (sourceCardId == null || c.id !== sourceCardId));
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
  // 凡化咒已剥离 Perm — 直接进坟场
  if (card.permStripped) return 'graveyard';
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
  | 'monster-equipment'
  | 'event'
  | 'building';

export function getCardPlayCategory(card: GameCardData): CardPlayCategory {
  const t: CardType = card.type;
  if (t === 'magic') {
    // 凡化咒已剥离 Perm — 即使 magicType 仍为 permanent 也按 instant 分类（影响动画/弃置去向）
    if (card.permStripped) return 'instant-magic';
    return card.magicType === 'permanent' ? 'perm-magic' : 'instant-magic';
  }
  if (t === 'hero-magic') return 'hero-magic';
  if (t === 'weapon') return 'weapon';
  if (t === 'shield') return 'shield';
  if (t === 'amulet') return 'amulet';
  if (t === 'potion') return 'potion';
  if (t === 'monster') return 'monster-equipment';
  if (t === 'event') return 'event';
  if (t === 'building') return 'building';
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
 *
 * @deprecated Manual reversal is no longer required at amulet-removal sites.
 * The reducer pipeline runs `postProcessAmuletAura` after every action that
 * mutates `amuletSlots`, which automatically diffs aura signatures and
 * applies the temp attack/armor delta. Kept for backward compatibility with
 * external callers and tests.
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

/**
 * Aura "signature" of an amulet collection — the count of strength + balance
 * amulets.  These are the only amuletEffects that contribute to
 * slotTempAttack / slotTempArmor (the other auras live in computed display
 * state, not in the temp slot values).
 *
 * Used by the reducer pipeline (`postProcessAmuletAura`) to detect aura
 * changes between actions and apply the corresponding delta automatically.
 */
export interface AmuletAuraSignature {
  strength: number;
  balance: number;
}

export function computeAmuletAuraSignature(
  amulets: readonly { amuletEffect?: AmuletEffectId }[] | null | undefined,
): AmuletAuraSignature {
  const sig: AmuletAuraSignature = { strength: 0, balance: 0 };
  if (!amulets) return sig;
  for (const a of amulets) {
    if (!a) continue;
    if (a.amuletEffect === 'strength') sig.strength += 1;
    else if (a.amuletEffect === 'balance') sig.balance += 1;
  }
  return sig;
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
    'stun-cap-strike',
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

// ---------------------------------------------------------------------------
// computeDamageMagicDisplayPure — UI 用：动态展示伤害 magic 卡牌当下的 base + amplifyBonus
//
// 仅作 raw_base_plus_amplify：不含 spellDamageBonus / 法术回响 / 等其他增益。
// 与 reducer 实际造成伤害的公式（getSpellDamage(base+amp) * echo）刻意保持简洁，
// 让玩家在手牌上一眼看出"本卡当下底子伤害"。
//
// 返回：
//   { mode: 'replace', text, amplifyBonus } —— 用 text 整段替换原描述
//   { mode: 'suffix', amplifyBonus }       —— 保留原描述，仅追加 (+N)（amp = 0 时调用方应跳过追加）
//   null                                    —— 该卡不参与此 UI（保持原描述）
// ---------------------------------------------------------------------------

export type DamageMagicDisplay =
  | { mode: 'replace'; text: string; amplifyBonus: number }
  | { mode: 'suffix'; amplifyBonus: number }
  | null;

export interface DamageMagicDisplayState {
  hp: number;
  maxHp: number;
  gold: number;
  // 雷涌一击 (knight:stun-cap-strike) 用：base = ceil(stunCap / divisor)。
  // 旧 caller 不传时按 0 处理（界面会显示 0 法伤，符合"晕上限 0% 时无威胁"语义）。
  stunCap?: number;
}

export function computeDamageMagicDisplayPure(
  card: GameCardData,
  state: DamageMagicDisplayState,
): DamageMagicDisplay {
  if (card.type !== 'magic') return null;
  const amp = card.amplifyBonus ?? 0;

  // ---------- Group B：固定 base + amp ----------

  if (card.knightEffect === 'missile-bolt') {
    const dmg = 1 + amp;
    return { mode: 'replace', text: `选择一个怪物，造成 ${dmg} 点法术伤害。`, amplifyBonus: amp };
  }

  if (card.name === '风暴箭雨') {
    const dmg = 3 + amp;
    return { mode: 'replace', text: `对激活行的每个怪物造成 ${dmg} 点伤害。攻击对象越多越好。`, amplifyBonus: amp };
  }

  if (card.name === '混沌冲击') {
    const dmg = 3 + amp;
    return { mode: 'replace', text: `对一个怪物造成 ${dmg} 点伤害。超杀：抽 2 张牌。(可超手牌上限)`, amplifyBonus: amp };
  }

  if (card.knightEffect === 'overkill-upgrade') {
    const dmg = 3 + amp;
    return { mode: 'replace', text: `永久：对一个怪物造成 ${dmg} 点伤害。超杀：升级一张牌。`, amplifyBonus: amp };
  }

  if (card.knightEffect === 'grave-nova') {
    const dmg = 3 + amp;
    return { mode: 'replace', text: `永久：当此牌被弃置时，对当前行所有怪物造成 ${dmg} 点伤害。`, amplifyBonus: amp };
  }

  if (card.magicEffect === 'bounty-spell-damage') {
    const dmg = 5 + amp;
    return { mode: 'replace', text: `永久魔法（Perm 1）：选择一个怪物，造成 ${dmg} 点法术伤害，获得等同于造成伤害的金币。`, amplifyBonus: amp };
  }

  if (card.name === '雷震击') {
    const stunDmgPerHit = [1, 2, 3];
    const stunChances = [20, 40, 60];
    const lvl = card.upgradeLevel ?? 0;
    const perHit = (stunDmgPerHit[lvl] ?? 1) + amp;
    const stunPct = stunChances[lvl] ?? 20;
    return {
      mode: 'replace',
      text: `对一个怪物造成 ${perHit} 点法术伤害 2 次，每次有 ${stunPct}% 概率击晕目标。`,
      amplifyBonus: amp,
    };
  }

  if (card.magicEffect === 'storm-volley-recycle') {
    const dmg = 1 + amp;
    return {
      mode: 'replace',
      text: `对激活行所有怪物造成 ${dmg} 点伤害，每击中一个怪物，从回收袋随机抽 1 张牌加入手牌。`,
      amplifyBonus: amp,
    };
  }

  if (card.knightEffect === 'fate-sight') {
    const baseDamages = [3, 4];
    const lvl = card.upgradeLevel ?? 0;
    const base = baseDamages[lvl] ?? 3;
    const dmg = base + amp;
    return {
      mode: 'replace',
      text: `永久：造成 ${dmg} 点伤害，翻看主牌堆顶 3 张牌，每有一张怪物牌，20% 概率击晕目标。`,
      amplifyBonus: amp,
    };
  }

  // ---------- Group C：状态相关 base + amp ----------

  // 雷涌一击：base = ⌈stunCap / divisor⌉；divisor 由升级等级决定（lvl0=4, lvl1=3）。
  // 显示的 stun 概率 = min(60, stunCap)，与 reducer 实际行为一致。
  if (card.knightEffect === 'stun-cap-strike') {
    const divisors = [4, 3];
    const lvl = card.upgradeLevel ?? 0;
    const div = divisors[lvl] ?? 3;
    const stunCap = state.stunCap ?? 0;
    const base = Math.ceil(stunCap / div);
    const dmg = base + amp;
    const stunPct = Math.min(60, stunCap);
    return {
      mode: 'replace',
      text: `永久：对一个怪物造成 ${dmg} 点法术伤害（晕上限 ${stunCap}% / ÷${div}），${stunPct}% 击晕，然后抽 1 张牌。`,
      amplifyBonus: amp,
    };
  }


  if (card.name === '点金裁决') {
    const dmg = state.gold + amp;
    return { mode: 'replace', text: `对任意怪物造成 ${dmg} 点伤害，并恢复等量生命。`, amplifyBonus: amp };
  }

  if (card.knightEffect === 'missing-hp-smite') {
    const smitePcts = [50, 100, 150];
    const lvl = card.upgradeLevel ?? 0;
    const pct = smitePcts[lvl] ?? 50;
    const missingHp = Math.max(0, state.maxHp - state.hp);
    const scaledDmg = Math.floor(missingHp * pct / 100);
    const dmg = scaledDmg + amp;
    return {
      mode: 'replace',
      text: `永久：对一名怪物造成 ${dmg} 点伤害（已损失生命 ${pct}%）。`,
      amplifyBonus: amp,
    };
  }

  // ---------- Group D：保留原描述，只追加 (+N) ----------
  // - armor-strike / temp-attack-strike / weapon-sweep：base 由玩家选槽决定
  // - blood-sacrifice-strike：用静态描述「失去一半生命；伤害 ＝ 失去血量 ×2」
  //   即可表达，不再做动态数值替换
  if (
    card.knightEffect === 'armor-strike' ||
    card.knightEffect === 'temp-attack-strike' ||
    card.knightEffect === 'weapon-sweep' ||
    card.knightEffect === 'blood-sacrifice-strike'
  ) {
    return { mode: 'suffix', amplifyBonus: amp };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Persuade — pure computation helpers
// ---------------------------------------------------------------------------

export function getPersuadeEffectiveCostPure(state: GameState, card?: GameCardData): number {
  const costReduction = (state.persuadeDiscount as any)?.costReduction ?? 0;
  const permCostMod = (state as any).persuadeCostModifier ?? 0;
  let cost = Math.max(0, PERSUADE_COST + permCostMod - costReduction);
  if ((state as any).persuadeSameTargetCostHalve && card && (state as any).lastPersuadeTargetId === card.id) {
    cost = Math.floor(cost / 2);
  }
  return cost;
}

// ---------------------------------------------------------------------------
// Sweep — pure wave-damage computation
// ---------------------------------------------------------------------------

export function computeHonorSweepWaveDamagePure(
  state: GameState,
  slotId: EquipmentSlotId,
): number {
  const slotItem = (slotId === 'equipmentSlot1'
    ? state.equipmentSlot1
    : state.equipmentSlot2) as GameCardData | null;
  if (!slotItem || (slotItem.type !== 'weapon' && slotItem.type !== 'monster')) return 0;

  const ae = computeAmuletEffects(state.amuletSlots as GameCardData[]);
  const isMonsterEquip = slotItem.type === 'monster';
  const rawWeaponValue = isMonsterEquip ? (slotItem.attack ?? slotItem.value) : slotItem.value;
  const goblinGoldPowerActive =
    isMonsterEquip && Boolean((slotItem as any).eliteLowGoldPower && state.gold >= 30);
  const weaponValue = goblinGoldPowerActive ? rawWeaponValue * 2 : rawWeaponValue;

  const bonuses = (state as any).equipmentSlotBonuses ?? {};
  const slotDamageBonus = bonuses[slotId]?.damage ?? 0;

  let slotTempAttackBonus = ((state as any).slotTempAttack ?? {})[slotId] ?? 0;
  const suppressed = getEquipmentSlotsWithSuppressedTempAttack(
    state.activeCards,
    state.equipmentSlot1,
    state.equipmentSlot2,
  );
  if (suppressed.has(slotId)) slotTempAttackBonus = 0;

  const slotBerserkBonus = ((state as any).berserkTurnBuff ?? {})[slotId] ?? 0;
  const attackBonus = ae.aura?.attack ?? 0;

  const base = Math.max(
    0,
    weaponValue + attackBonus + slotDamageBonus + slotBerserkBonus + slotTempAttackBonus,
  );
  return computeSpellDamagePure(state, base);
}

// ---------------------------------------------------------------------------
// Spell / Armor / Attack pure computations (used by reducers and hooks)
// ---------------------------------------------------------------------------

export function computeSpellDamagePure(state: GameState, baseDamage: number): number {
  return Math.max(0, baseDamage + ((state as any).permanentSpellDamageBonus ?? 0));
}

export function computeDefenseBonusPure(state: GameState): number {
  const ae = computeAmuletEffects(state.amuletSlots as GameCardData[]);
  const ironSkin = ((state as any).permanentSkills ?? []).includes('Iron Skin') ? 1 : 0;
  const shieldMaster = (state as any).shieldMasterBonus ?? 0;
  const defensiveStance = (state as any).defensiveStanceActive ? 1 : 0;
  return (ae.aura?.defense ?? 0) + ironSkin + shieldMaster + defensiveStance;
}

export function computeSlotArmorValuePure(
  state: GameState,
  slotId: import('@/components/game-board/types').EquipmentSlotId,
): number {
  const slotItem = (slotId === 'equipmentSlot1'
    ? state.equipmentSlot1
    : state.equipmentSlot2) as GameCardData | null;
  if (!slotItem || (slotItem.type !== 'shield' && slotItem.type !== 'monster')) return 0;

  const bonuses = (state as any).equipmentSlotBonuses ?? {};
  const slotShieldBonus = bonuses[slotId]?.shield ?? 0;
  const rawSlotTemp = ((state as any).slotTempArmor ?? {})[slotId] ?? 0;
  const defBonus = computeDefenseBonusPure(state);
  const bonusDamaged = (slotItem as any).armorBonusDamaged ?? 0;

  if (slotItem.type === 'monster') {
    const baseArmor = slotItem.hp ?? slotItem.value;
    return Math.max(0, baseArmor + defBonus + slotShieldBonus + rawSlotTemp - bonusDamaged);
  }

  const baseArmorMax = (slotItem as any).armorMax ?? slotItem.value;
  const permanentBonus = Math.max(0, defBonus + slotShieldBonus);
  const storedBaseArmor = Math.min((slotItem as any).armor ?? baseArmorMax, baseArmorMax);
  const effectiveBonus = Math.max(0, permanentBonus + rawSlotTemp - bonusDamaged);
  const currentArmor = storedBaseArmor + effectiveBonus;
  const effectiveArmorMax = baseArmorMax + permanentBonus + rawSlotTemp;
  return Math.min(currentArmor, effectiveArmorMax);
}

// ---------------------------------------------------------------------------
// Persuade — pure computation helpers
// ---------------------------------------------------------------------------

export function computePersuadeSuccessRatePure(state: GameState, monster: GameCardData): number {
  const eq1 = state.equipmentSlot1 as GameCardData | null;
  const eq2 = state.equipmentSlot2 as GameCardData | null;
  const bonuses = (state as any).equipmentSlotBonuses ?? {};

  let heroWeaponDmg = 0;
  for (const slot of [eq1, eq2]) {
    if (slot && (slot.type === 'weapon' || slot.type === 'monster')) {
      heroWeaponDmg += slot.attack ?? slot.value ?? 0;
    }
  }
  heroWeaponDmg += bonuses.equipmentSlot1?.damage ?? 0;
  heroWeaponDmg += bonuses.equipmentSlot2?.damage ?? 0;

  const ae = computeAmuletEffects(state.amuletSlots as GameCardData[]);
  heroWeaponDmg += ae.aura.attack;

  const heroHp = state.hp;
  const heroSpell = (state as any).permanentSpellDamageBonus ?? 0;
  const heroEffectiveDmg = Math.max(1, heroWeaponDmg + heroSpell * 0.4);

  const mAtk = monster.attack ?? monster.value;
  const mHp = monster.hp ?? monster.value;
  const mLayers = monster.hpLayers ?? monster.fury ?? 1;
  const isElite = Boolean(monster.monsterSpecial || monster.bossPhase);

  const monsterToughness = mHp * mLayers;
  const turnsToKill = monsterToughness / heroEffectiveDmg;
  const turnsToBeKilled = heroHp / Math.max(1, mAtk);
  const dominance = turnsToBeKilled / Math.max(0.1, turnsToKill);

  const logDom = Math.log2(Math.max(0.01, dominance));
  let rate = 40 + logDom * 8.75;

  if (isElite) rate -= 15;

  const isHighLayer = mLayers >= 3;
  if (isHighLayer) rate -= 15;

  const bonusScale = isHighLayer ? 0.5 : 1;

  const liveMonster = (state.activeCards as GameCardData[]).find(c => c?.id === monster.id);
  if ((liveMonster ?? monster).isStunned) {
    rate += 10 * bonusScale;
  }

  const persuadeBoost = (monster as any)._persuadeBoost ?? 0;
  rate += persuadeBoost * bonusScale;

  const discountBonus = (state.persuadeDiscount as any)?.rateBonus ?? 0;
  rate += discountBonus * bonusScale;

  rate += (state as any).persuadeAmuletBonus * bonusScale;

  // Permanent persuade bonus (e.g. monster-loot persuadeRateBonus rewards).
  // Unlike persuadeAmuletBonus, this is NEVER consumed by a persuade attempt,
  // so it always contributes — but it still respects the high-layer
  // bonusScale to match the existing persuade-bonus balance.
  rate += ((state as any).permanentPersuadeBonus ?? 0) * bonusScale;

  const relics = (state.eternalRelics ?? []) as EternalRelic[];
  if (relics.some(r => r.id === 'chain-persuade')) {
    if ((state as any).lastPersuadeTargetId && (state as any).lastPersuadeTargetId === monster.id) {
      rate += 15 * ((state as any).consecutivePersuadeCount ?? 0);
    }
  }

  const raceBonus = (state as any).persuadeRaceBonus ?? {};
  if (monster.monsterType && raceBonus[monster.monsterType]) {
    rate += raceBonus[monster.monsterType];
  }

  const pLevel = (state as any).persuadeLevel ?? 1;
  rate += (pLevel - 1) * 5;

  for (const [eSlot, slotId] of [[eq1, 'equipmentSlot1'], [eq2, 'equipmentSlot2']] as const) {
    if (eSlot && eSlot.type === 'monster' && (eSlot as any).goblinStealEquip) {
      const eReserve = slotId === 'equipmentSlot1'
        ? (state as any).equipmentSlot1Reserve
        : (state as any).equipmentSlot2Reserve;
      if (eReserve && eReserve.length > 0) {
        rate += 30;
      }
    }
  }

  const maxRate = isHighLayer ? 60 : 75;
  const clamped = Math.max(5, Math.min(maxRate, rate));
  return Math.round(clamped / 5) * 5;
}
