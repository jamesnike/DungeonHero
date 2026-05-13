/**
 * Game Core Constants
 *
 * All gameplay-related numeric constants live here. UI-only layout constants
 * remain in game-board/constants.ts.
 */

import type { CardType } from '@/components/GameCard';
import type { CombatState, EquipmentSlotId, SlotPermanentBonus, ActiveAmuletEffects, EquipmentSlotBonusState, ActiveRowSlots, WaterfallAnimationState } from '@/components/game-board/types';
import type { EquipmentBuffSnapshot } from '@/lib/gameStorage';

// ---------------------------------------------------------------------------
// Core game values
// ---------------------------------------------------------------------------

export const INITIAL_HP = 20;
export const INITIAL_GOLD = 10;
export const INITIAL_TURN_COUNT = 1;
export const PERSUADE_COST = 10;
export const MIN_PERSUADE_COST = 2;
export const INITIAL_PERSUADE_LEVEL = 1;
export const INITIAL_STUN_CAP = 10;
export const MAX_PERSUADE_LEVEL = 4;

export const DECK_SIZE = 64;
export const DUNGEON_COLUMN_COUNT = 4;
export const BASE_BACKPACK_CAPACITY = 12;
export const HAND_LIMIT = 7;
export const MAX_AMULET_SLOTS = 2;
export const MAX_SHOP_LEVEL = 3;
export const FLIP_GOLD_REWARD = 4;

/**
 * 装备槽（左/右/怪物装备）的耐久上限硬上限。
 *
 * 任何让 maxDurability 增加的入口（药剂、魔法、入场效果、升级、事件…）
 * 都必须通过 `clampMaxDurability` 夹住，超过 4 的部分静默吸收。
 *
 * 这与 UI 层的显示上限保持一致：
 * - `EquipmentSlot.tsx` `DURABILITY_SEGMENTS = 4`
 * - `GameCard.tsx` `MAX_DURABILITY_DOTS = 4`
 *
 * 如果将来要放宽此上限，必须同时更新两处 UI 常量。
 */
export const DURABILITY_CAP = 4;

/** 把 maxDurability 夹到 [0, DURABILITY_CAP] 范围内。 */
export const clampMaxDurability = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(DURABILITY_CAP, Math.floor(value));
};

/**
 * 判断一次「maxDurability + delta」操作是否会被 cap 完全吸收（增量为 0）。
 * 用于增量入口决定是否要 banner 提示「已达上限」。
 */
export const isMaxDurabilityAtCap = (currentMax: number): boolean =>
  currentMax >= DURABILITY_CAP;

// ---------------------------------------------------------------------------
// Card type groups
// ---------------------------------------------------------------------------

export const SELLABLE_TYPES: readonly CardType[] = ['potion', 'weapon', 'shield', 'amulet', 'magic', 'hero-magic', 'monster'] as const;
export const EQUIPMENT_TYPES: readonly CardType[] = ['weapon', 'shield', 'amulet'] as const;
export const CONSUMABLE_TYPES: readonly CardType[] = ['potion', 'magic', 'hero-magic', 'curse'] as const;

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

export const SHOP_MAX_OFFERINGS = 5;
export const SHOP_REQUIRED_TYPES: CardType[][] = [['weapon'], ['shield'], ['magic'], ['amulet', 'potion']];
export const SHOP_TYPE_PRICES: Partial<Record<CardType, number>> = {
  weapon: 10,
  potion: 9,
  shield: 8,
  amulet: 8,
  magic: 7,
  'hero-magic': 9,
};
export const SHOP_HEAL_COST = 5;
export const SHOP_HEAL_AMOUNT = 5;
export const SHOP_LEVEL_UP_COST = 10;
export const SHOP_SKILL_DISCOVER_COST = 5;
export const SHOP_EQUIP_BOOST_COST = 8;
export const SHOP_REFRESH_COST = 5;

// ---------------------------------------------------------------------------
// Combat balance
// ---------------------------------------------------------------------------

export const BALANCE_ATTACK_BONUS = 3;
export const BALANCE_SHIELD_BONUS = 3;
export const BALANCE_ATTACK_PENALTY = 1;
export const BALANCE_SHIELD_PENALTY = 1;
export const STRENGTH_SELF_DAMAGE = 2;

// ---------------------------------------------------------------------------
// Monster text
// ---------------------------------------------------------------------------

export const FINAL_MONSTER_MARK_DESCRIPTION =
  '最终之敌（Boss）：自带 亡灵召唤 + 复生；被瀑流从预览挤出时不进坟场，置于牌堆底（不打乱牌序）。';

export const ELITE_MONSTER_NAMES = ['Elder Dragon', 'Bone Overlord', 'Goblin Warlock', 'Ogre Juggernaut'] as const;
export const ELITE_MONSTER_NAME_SET = new Set<string>(ELITE_MONSTER_NAMES);

// ---------------------------------------------------------------------------
// Default / initial compound values
// ---------------------------------------------------------------------------

export const DUNGEON_COLUMNS = Array.from({ length: DUNGEON_COLUMN_COUNT }, (_, i) => i);

export const initialCombatState: CombatState = {
  engagedMonsterIds: [],
  initiator: null,
  currentTurn: 'hero',
  heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
  heroAttacksRemaining: 2,
  heroDamageThisTurn: {},
  monsterAttackQueue: [],
  pendingBlock: null,
  slotBlocksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
  slotDurabilityUsedThisTurn: { equipmentSlot1: 0, equipmentSlot2: 0 },
};

export const initialWaterfallAnimationState: WaterfallAnimationState = {
  phase: 'idle',
  isActive: false,
  droppingSlots: [],
  landingSlots: [],
  discardSlot: null,
  discardDestination: 'graveyard',
  portalSlots: [],
  dealingSlots: [],
  sequenceId: null,
};

export const createEmptySlotBonusState = (): EquipmentSlotBonusState => ({
  equipmentSlot1: { damage: 0, shield: 0 },
  equipmentSlot2: { damage: 0, shield: 0 },
});

export const createEmptyEquipmentBuffState = (): EquipmentBuffSnapshot => ({
  equipmentSlot1: 0,
  equipmentSlot2: 0,
});

export const createEmptyActiveRow = (): ActiveRowSlots =>
  Array.from({ length: DUNGEON_COLUMN_COUNT }, () => null);

export const createEmptyPreviewRevealedEarly = (): boolean[] =>
  Array.from({ length: DUNGEON_COLUMN_COUNT }, () => false);

export const createEmptyAmuletEffects = (): ActiveAmuletEffects => ({
  aura: { attack: 0, defense: 0, maxHp: 0 },
  healCount: 0,
  balanceCount: 0,
  lifeOverkillBonus: 0,
  catapultCount: 0,
  flashCount: 0,
  strengthCount: 0,
  dualGuardCount: 0,
  discardShockCount: 0,
  flipZapCount: 0,
  flipGoldCount: 0,
  recycleForgeCount: 0,
  loneCardCount: 0,
  equipmentSalvageCount: 0,
  bloodrageAttackCount: 0,
  selfDamageDrawCount: 0,
  persuadeOnTempAttackCount: 0,
  persuadeOnTempAttackBonus: 0,
  persuadeGrantRecycleFetchCount: 0,
  persuadeGrantRecycleFetchTotal: 0,
  damageClassDiscoverCount: 0,
  persuadeGraveyardStackCount: 0,
  stunRecycleToHandCount: 0,
  monsterKillUpgradeCount: 0,
  attackPersuadeDiscountCount: 0,
  cardGainMissileCount: 0,
  swapUpgradeCount: 0,
  stunUpgradeCapCount: 0,
  stunUpgradeCapBonus: 0,
  recycleBackpackExpandCount: 0,
  dungeonGoldCount: 0,
  waterfallHealCount: 0,
  armorHalveEndureCount: 0,
  monsterEquipBuffCount: 0,
  endTurnDrawCount: 0,
  lastWordsMonsterDebuffCount: 0,
  stunRateBoost: 0,
  stunGoldCount: 0,
  deleteDrawCount: 0,
  lastWordsExtraTriggerCount: 0,
  killCellMineCount: 0,
  manualRecycleDrawCount: 0,
  mirrorCopySummonCount: 0,
  soulDevourCount: 0,
});

// ---------------------------------------------------------------------------
// Dev flag
// ---------------------------------------------------------------------------

export const DEV_MODE = process.env.NODE_ENV !== 'production';
