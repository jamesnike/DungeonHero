import type { CardType } from '../GameCard';
import type {
  CombatState,
  EquipmentSlotId,
  SlotPermanentBonus,
  WaterfallAnimationState,
} from './types';

export const INITIAL_HP = 20;
export const INITIAL_GOLD = 10;
export const INITIAL_TURN_COUNT = 1;

export const SELLABLE_TYPES = ['potion', 'weapon', 'shield', 'amulet', 'magic', 'hero-magic'] as const;
export const EQUIPMENT_TYPES = ['weapon', 'shield', 'amulet'] as const;
export const CONSUMABLE_TYPES = ['potion', 'magic', 'hero-magic', 'curse'] as const;

export const MAX_AMULET_SLOTS = 2;
export const DECK_SIZE = 64;

export const SLOT_LABEL_MAP: Record<EquipmentSlotId, '左侧装备栏' | '右侧装备栏'> = {
  equipmentSlot1: '左侧装备栏',
  equipmentSlot2: '右侧装备栏',
};

export const HERO_GRID_PADDING_CLASS = '';
export const HERO_GAP_VARIABLE_CLASS =
  '[--hero-gap-x:clamp(1rem,3.8vw,2.8rem)] [--hero-gap-y:clamp(0.7rem,2.8vw,1.8rem)] sm:[--hero-gap-x:clamp(1.5rem,3.8vw,3.5rem)] sm:[--hero-gap-y:clamp(1rem,3vw,2.4rem)]';

export const DEV_MODE = process.env.NODE_ENV !== 'production';

export const DUNGEON_COLUMN_COUNT = 4;
export const GRAVEYARD_VECTOR_DEFAULT = { offsetX: 60, offsetY: 160 };
export const MONSTER_RAGE_COLUMN_BORDER_PX = 1;
export const MONSTER_CARD_BORDER_PX = 4;
export const MONSTER_RAGE_BASE_TRANSLATE_PX = 6;
export const MONSTER_RAGE_TRANSLATE_ADJUST_PX =
  MONSTER_CARD_BORDER_PX > MONSTER_RAGE_COLUMN_BORDER_PX
    ? MONSTER_CARD_BORDER_PX - MONSTER_RAGE_COLUMN_BORDER_PX
    : 0;

export const DUNGEON_COLUMNS = Array.from({ length: DUNGEON_COLUMN_COUNT }, (_, index) => index);

export const BASE_BACKPACK_CAPACITY = 10;
export const HAND_LIMIT = 6;
export const ELITE_MONSTER_NAMES = ['Elder Dragon', 'Bone Overlord', 'Goblin Warlock', 'Ogre Juggernaut'] as const;
export const ELITE_MONSTER_NAME_SET = new Set<string>(ELITE_MONSTER_NAMES);
export const ELITE_MONSTER_DISCARD_WARNING = '弃置到坟场时会触发混沌骰子效果。';

export const HAND_INSERTION_RETRY_INTERVAL_MS = 150;
export const HAND_INSERTION_MAX_RETRIES = 5;
export const HERO_ROW_BACKPACK_INDEX = 4;

export const BALANCE_ATTACK_BONUS = 3;
export const BALANCE_SHIELD_BONUS = 3;
export const STRENGTH_SELF_DAMAGE = 2;

export const COMBAT_ANIMATION_DURATION = 1200;
export const COMBAT_ANIMATION_STAGGER = 180;

export const SHOP_MAX_OFFERINGS = 6;
export const SHOP_REQUIRED_TYPES: CardType[][] = [['weapon'], ['shield'], ['magic'], ['amulet', 'potion']];
export const SHOP_TYPE_PRICES: Partial<Record<CardType, number>> = {
  weapon: 10,
  potion: 9,
  shield: 8,
  amulet: 8,
  magic: 7,
  'hero-magic': 9,
};
export const COMBAT_PANEL_DEFAULT_WIDTH = 170;
export const COMBAT_PANEL_DEFAULT_HEIGHT = 320;
export const COMBAT_PANEL_EDGE_PADDING = 12;
export const COMBAT_PANEL_DEFAULT_POSITION_CLASS =
  'top-2 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 sm:top-4';

export const WATERFALL_DROP_DURATION = 650;
export const WATERFALL_DISCARD_DURATION = 450;
export const WATERFALL_DEAL_DURATION = 550;
export const WATERFALL_REVEAL_DURATION = 400;
export const CLASS_FLIGHT_BASE_DURATION = 900;
export const CLASS_FLIGHT_VARIANCE = 250;
export const CLASS_FLIGHT_STAGGER = 110;
export const CLASS_FLIGHT_ARC_MIN = 40;
export const CLASS_FLIGHT_ARC_VARIANCE = 35;

export const initialCombatState: CombatState = {
  engagedMonsterIds: [],
  initiator: null,
  currentTurn: 'hero',
  heroAttacksThisTurn: {
    equipmentSlot1: false,
    equipmentSlot2: false,
  },
  heroAttacksRemaining: 2,
  heroDamageThisTurn: {},
  monsterAttackQueue: [],
  pendingBlock: null,
  slotBlocksThisTurn: {
    equipmentSlot1: false,
    equipmentSlot2: false,
  },
  slotDurabilityUsedThisTurn: {
    equipmentSlot1: 0,
    equipmentSlot2: 0,
  },
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

export const STARTER_CARD_IDS = {
  weaponBurst: 'starter-perm-weapon-burst',
  repairOne: 'starter-perm-repair-one',
  healTwo: 'starter-perm-heal-two',
  discardDraw: 'starter-perm-discard-draw',
  reshuffle: 'starter-perm-reshuffle',
  dungeonSwap: 'starter-perm-dungeon-swap',
  trainingBlade: 'starter-weapon-training-blade',
  immortalHammer: 'starter-weapon-immortal-hammer',
} as const;

export const BACKPACK_FLIGHT_BASE_DURATION = 700;
export const BACKPACK_FLIGHT_VARIANCE = 250;
export const BACKPACK_FLIGHT_STAGGER = 80;
export const BACKPACK_FLIGHT_ARC_MIN = 30;
export const BACKPACK_FLIGHT_ARC_VARIANCE = 45;
export const BACKPACK_FLIGHT_FALLBACK_BUFFER = 200;

export const MIN_ASPECT_RATIO = 9 / 16;
export const MAX_ASPECT_RATIO = 21 / 9;
export const FLAT_ASPECT_RATIO = 1.8;
