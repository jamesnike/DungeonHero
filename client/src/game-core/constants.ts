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
export const BASE_BACKPACK_CAPACITY = 10;
export const HAND_LIMIT = 6;
export const MAX_AMULET_SLOTS = 2;
export const MAX_SHOP_LEVEL = 3;
export const FLIP_GOLD_REWARD = 4;

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
export const SHOP_SKILL_DISCOVER_COST = 10;
export const SHOP_EQUIP_BOOST_COST = 10;

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
  '最终之敌：击败后将变身为 Boss；被瀑流从预览挤出时不进坟场，置于牌堆底（不打乱牌序）。';

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

export const createEmptyAmuletEffects = (): ActiveAmuletEffects => ({
  aura: { attack: 0, defense: 0, maxHp: 0 },
  hasHeal: false,
  hasBalance: false,
  lifeOverkillBonus: 0,
  hasCatapult: false,
  hasFlash: false,
  hasStrength: false,
  hasDualGuard: false,
  hasDiscardShock: false,
  flipZapCount: 0,
  hasFlipGold: false,
  hasRecycleForge: false,
  hasLoneCard: false,
  hasEquipmentSalvage: false,
  hasBloodrageAttack: false,
  hasPersuadeOnTempAttack: false,
  persuadeOnTempAttackBonus: 0,
  hasPersuadeGrantRecycleFetch: false,
  persuadeGrantRecycleFetchCount: 0,
  hasDamageClassDiscover: false,
  hasPersuadeGraveyardStack: false,
  hasStunRecycleToHand: false,
  hasMonsterKillUpgrade: false,
  hasAttackPersuadeDiscount: false,
  hasCardGainMissile: false,
  hasSwapUpgrade: false,
  hasStunUpgradeCap: false,
  hasRecycleBackpackExpand: false,
  hasDungeonGold: false,
  hasArmorHalveEndure: false,
  hasMonsterEquipBuff: false,
  hasEndTurnDraw: false,
  hasLastWordsMonsterDebuff: false,
  stunRateBoost: 0,
  hasStunGold: false,
});

// ---------------------------------------------------------------------------
// Dev flag
// ---------------------------------------------------------------------------

export const DEV_MODE = process.env.NODE_ENV !== 'production';
