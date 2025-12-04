import { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo, type ReactNode, type Ref } from 'react';
import type { CSSProperties, DragEvent as ReactDragEvent } from 'react';
import GameHeader from './GameHeader';
import HeroCard from './HeroCard';
import GameCard, {
  type CardType,
  type EventChoiceDefinition,
  type EventDiceRange,
  type EventEffectExpression,
  type GameCardData,
} from './GameCard';
import EquipmentSlot from './EquipmentSlot';
import CombatPanel from './CombatPanel';
import { Sword } from 'lucide-react';
import AmuletSlot from './AmuletSlot';
import GraveyardZone from './GraveyardZone';
import HandDisplay from './HandDisplay';
import VictoryDefeatModal from './VictoryDefeatModal';
import DeckViewerModal from './DeckViewerModal';
import EventChoiceModal, { type EventChoiceAvailability } from './EventChoiceModal';
import EventDiceModal from './EventDiceModal';
import EquipmentSelectModal from './EquipmentSelectModal';
import DiceRoller from './DiceRoller';
import ClassDeck from './ClassDeck';
import HeroSkillSelection from './HeroSkillSelection';
import BackpackZone from './BackpackZone';
import BackpackViewerModal from './BackpackViewerModal';
// import { useToast } from '@/hooks/use-toast'; // Disabled toast notifications
import { generateKnightDeck, createKnightDiscoveryEvents, type KnightCardData } from '@/lib/knightDeck';
import { getHeroSkillById, type HeroSkillDefinition, type HeroSkillId } from '@/lib/heroSkills';
import { getRandomHero, type HeroVariant } from '@/lib/heroes';
import { clearGameState, loadGameState, saveGameState, type PersistedGameState } from '@/lib/gameStorage';
import CardDetailsModal from './CardDetailsModal';
import DiscoverClassModal from './DiscoverClassModal';
import CardDeletionModal from './CardDeletionModal';
import ShopModal, { type ShopOffering } from './ShopModal';
import { initMobileDrop, type DragData } from '../utils/mobileDragDrop';

// Cute chibi-style monster images
import dragonImage from '@assets/generated_images/cute_chibi_dragon_monster.png';
import skeletonImage from '@assets/generated_images/cute_chibi_skeleton_monster.png';
import goblinImage from '@assets/generated_images/cute_chibi_goblin_monster.png';
import ogreImage from '@assets/generated_images/cute_chibi_ogre_monster.png';

// Cute cartoon weapon images
import swordImage from '@assets/generated_images/cute_cartoon_medieval_sword.png';
import axeImage from '@assets/generated_images/cute_cartoon_battle_axe.png';
import daggerImage from '@assets/generated_images/cute_cartoon_dagger.png';

// Cute cartoon shields (different tiers) - NEW Q-version style
import woodenShieldImage from '@assets/generated_images/cute_wooden_shield.png';
import ironShieldImage from '@assets/generated_images/cute_iron_shield.png';
import heavyShieldImage from '@assets/generated_images/simple_heavy_shield.png';

// Cute cartoon potion
import potionImage from '@assets/generated_images/cute_cartoon_healing_potion.png';

// Amulet images
import lifeAmuletImage from '@assets/generated_images/chibi_life_amulet.png';
import strengthAmuletImage from '@assets/generated_images/chibi_strength_amulet.png';
import guardianAmuletImage from '@assets/generated_images/chibi_guardian_amulet.png';

// Skill and Event images
import skillScrollImage from '@assets/generated_images/chibi_skill_scroll.png';
import eventScrollImage from '@assets/generated_images/chibi_event_scroll.png';

const INITIAL_HP = 20;
const INITIAL_GOLD = 10;
const SELLABLE_TYPES = ['potion', 'weapon', 'shield', 'amulet', 'magic'] as const;
const EQUIPMENT_TYPES = ['weapon', 'shield', 'amulet'] as const;
const CONSUMABLE_TYPES = ['potion', 'magic'] as const;
const MAX_AMULET_SLOTS = 2;
const DECK_SIZE = 64; // Updated: 54 + 6 skills + 4 events = 64
type BlockTarget = EquipmentSlotId | 'hero';

type CombatInitiator = 'hero' | 'monster';

type CombatState = {
  engagedMonsterIds: string[];
  initiator: CombatInitiator | null;
  currentTurn: CombatInitiator;
  heroAttacksThisTurn: Record<EquipmentSlotId, boolean>;
  heroAttacksRemaining: number;
  heroDamageThisTurn: Record<string, number>;
  monsterAttackQueue: string[];
  pendingBlock: null | {
    monsterId: string;
    attackValue: number;
    monsterName: string;
  };
};

const initialCombatState: CombatState = {
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
};

type EquipmentSlotId = 'equipmentSlot1' | 'equipmentSlot2';
type EquipmentItem = GameCardData & { type: 'weapon' | 'shield'; fromSlot?: EquipmentSlotId };
type EquipmentRepairTarget = 'weapon' | 'shield';

const formatRepairTargetLabel = (targets: EquipmentRepairTarget[]) => {
  if (targets.includes('weapon') && targets.includes('shield')) {
    return '武器或护盾';
  }
  return targets[0] === 'shield' ? '护盾' : '武器';
};
type AmuletItem = GameCardData & { type: 'amulet'; fromSlot?: 'amulet' };
type DragOrigin = 'hand' | 'dungeon' | 'backpack' | 'amulet' | EquipmentSlotId;
type ActiveRowSlots = Array<GameCardData | null>;
type HeroRowDropType = 'event' | 'magic' | 'potion';
type GraveyardVector = { offsetX: number; offsetY: number };
type PreviewAnimationStyle = CSSProperties & {
  '--graveyard-offset-x'?: string;
  '--graveyard-offset-y'?: string;
};

type SlotPermanentBonus = {
  damage: number;
  shield: number;
};

type EquipmentSlotBonusState = Record<EquipmentSlotId, SlotPermanentBonus>;

type EventDiceModalState = {
  title: string;
  subtitle?: string;
  entries: EventDiceRange[];
  rolledValue: number | null;
  highlightedId: string | null;
};

type EquipmentPromptState = {
  prompt: string;
  subtext?: string;
};

type EventTransformState = {
  fromCard: GameCardData;
  toCard: GameCardData;
  onComplete: () => void;
};

type CardActionContext = {
  mode: 'shop' | 'event';
  action: 'delete' | 'discard';
  requiredCount: number;
  remainingCount: number;
  title?: string;
  description?: string;
};

const createEmptySlotBonusState = (): EquipmentSlotBonusState => ({
  equipmentSlot1: { damage: 0, shield: 0 },
  equipmentSlot2: { damage: 0, shield: 0 },
});
type DungeonDropAssignment = {
  previewIndex: number;
  card: GameCardData;
  slotIndex: number;
};

type HeroFramePosition = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type HeroRowSlotConfig = {
  id: string;
  dropZone: 'backpack' | 'other';
  render: () => ReactNode;
  wrapperClassName?: string;
  innerClassName?: string;
  innerRef?: Ref<HTMLDivElement>;
};

type PendingHeroSkillAction =
  | { skillId: HeroSkillId; type: 'slot' }
  | { skillId: HeroSkillId; type: 'monster'; baseDamage?: number };

type PendingMagicAction =
  | {
      card: GameCardData;
      effect: 'bulwark-slam';
      step: 'slot-select';
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'bulwark-slam';
      step: 'monster-select';
      slotId: EquipmentSlotId;
      pendingDamage: number;
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'blood-reckoning';
      step: 'monster-select';
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'eternal-repair';
      step: 'slot-select';
      prompt: string;
    };

type PendingPotionAction =
  | {
      card: GameCardData;
      effect: 'repair-equipment';
      amount: number;
      allowedTypes: EquipmentRepairTarget[];
      step: 'slot-select';
      prompt: string;
    };

type HeroSkillArrowState = {
  start: { x: number; y: number };
  end: { x: number; y: number };
};

type GridMetrics = {
  gapX: number;
  gapY: number;
  padding: number;
  cardFontScale: number;
  cardStatScale: number;
  cardIconScale: number;
  cardDotSize: number;
  heroFontScale: number;
};

const isHeroRowHighlightCard = (
  card: GameCardData | null,
): card is GameCardData & { type: HeroRowDropType } =>
  Boolean(card && (card.type === 'event' || card.type === 'magic' || card.type === 'potion'));

const DUNGEON_COLUMN_COUNT = 5;
const GRAVEYARD_VECTOR_DEFAULT = { offsetX: 60, offsetY: 160 };
const MONSTER_RAGE_COLUMN_BORDER_PX = 1;
const MONSTER_CARD_BORDER_PX = 4;
const MONSTER_RAGE_TRANSLATE_ADJUST_PX =
  MONSTER_CARD_BORDER_PX > MONSTER_RAGE_COLUMN_BORDER_PX
    ? MONSTER_CARD_BORDER_PX - MONSTER_RAGE_COLUMN_BORDER_PX
    : 0;
const HERO_GRID_PADDING_CLASS = "";
const HERO_GAP_VARIABLE_CLASS =
  "[--hero-gap-x:clamp(1rem,3.8vw,2.8rem)] [--hero-gap-y:clamp(0.7rem,2.8vw,1.8rem)] sm:[--hero-gap-x:clamp(1.5rem,3.8vw,3.5rem)] sm:[--hero-gap-y:clamp(1rem,3vw,2.4rem)]";
const DEV_MODE = process.env.NODE_ENV !== 'production';
const DUNGEON_COLUMNS = Array.from({ length: DUNGEON_COLUMN_COUNT }, (_, index) => index);
const BASE_BACKPACK_CAPACITY = 10;
const HERO_ROW_BACKPACK_INDEX = 4;
const HERO_ROW_CLASS_DECK_INDEX = 5;
const BALANCE_ATTACK_BONUS = 3;
const BALANCE_SHIELD_BONUS = 3;
const FLASH_ATTACK_PENALTY = 3;
const STRENGTH_SELF_DAMAGE = 3;
const COMBAT_ANIMATION_DURATION = 1200;
const COMBAT_ANIMATION_STAGGER = 180;
const SHOP_MAX_OFFERINGS = 6;
const SHOP_REQUIRED_TYPES: CardType[] = ['weapon', 'shield', 'magic', 'amulet'];
const SHOP_TYPE_PRICES: Partial<Record<CardType, number>> = {
  weapon: 10,
  shield: 8,
  magic: 7,
  amulet: 6,
};
const SHOP_LEVEL_DISCOUNT_STEP = 0.1;
const pointInsideRect = (rect: DOMRect | null, clientX: number, clientY: number) =>
  Boolean(
    rect &&
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom,
  );
const isBackpackRestrictedCard = (card: GameCardData | null) =>
  Boolean(card && (card.type === 'magic' || card.type === 'potion'));

const getBaseShopPrice = (card: GameCardData): number => {
  if (SHOP_TYPE_PRICES[card.type] !== undefined) {
    return SHOP_TYPE_PRICES[card.type] as number;
  }
  return Math.max(5, card.value || 5);
};

const getShopDiscountFactor = (level: number): number => Math.max(0, 1 - level * SHOP_LEVEL_DISCOUNT_STEP);

const getShopDiscountPercent = (level: number): number =>
  Math.max(0, Math.round(level * SHOP_LEVEL_DISCOUNT_STEP * 100));

const getShopPrice = (card: GameCardData, level: number): number => {
  const basePrice = getBaseShopPrice(card);
  const discounted = Math.floor(basePrice * getShopDiscountFactor(level));
  return Math.max(1, discounted);
};

const getGridMetricsForWidth = (width: number): GridMetrics => {
  if (width <= 430) {
    return {
      gapX: 6,
      gapY: 10,
      padding: 2,
      cardFontScale: 1.15,
      cardStatScale: 1.2,
      cardIconScale: 1.15,
      cardDotSize: 9,
      heroFontScale: 0.85,
    };
  }
  if (width <= 640) {
    return {
      gapX: 10,
      gapY: 14,
      padding: 4,
      cardFontScale: 1.08,
      cardStatScale: 1.08,
      cardIconScale: 1.08,
      cardDotSize: 8,
      heroFontScale: 0.9,
    };
  }
  if (width <= 1024) {
    return {
      gapX: 16,
      gapY: 18,
      padding: 6,
      cardFontScale: 1,
      cardStatScale: 1,
      cardIconScale: 1,
      cardDotSize: 7,
      heroFontScale: 1,
    };
  }
  return {
    gapX: 24,
    gapY: 26,
    padding: 8,
    cardFontScale: 1,
    cardStatScale: 1,
    cardIconScale: 1,
    cardDotSize: 7,
    heroFontScale: 1.05,
  };
};

const createEmptyActiveRow = (): ActiveRowSlots =>
  Array.from({ length: DUNGEON_COLUMN_COUNT }, () => null);

const fillActiveRowSlots = (cards: GameCardData[]): ActiveRowSlots => {
  const slots = createEmptyActiveRow();
  cards.forEach((card, index) => {
    if (index < DUNGEON_COLUMN_COUNT) {
      slots[index] = card;
    }
  });
  return slots;
};

const flattenActiveRowSlots = (slots: ActiveRowSlots): GameCardData[] =>
  slots.filter((card): card is GameCardData => Boolean(card));

const countActiveRowSlots = (slots: ActiveRowSlots): number =>
  slots.reduce((count, card) => (card ? count + 1 : count), 0);

const sanitizeCardMetadata = <T extends GameCardData>(card: T): T => {
  const { fromSlot, ...rest } = card as T & { fromSlot?: string };
  return { ...rest } as T;
};

const sanitizeCardList = <T extends GameCardData>(cards: T[]): T[] =>
  cards.map(card => sanitizeCardMetadata(card));

const sanitizeSlotRow = (slots: ActiveRowSlots): ActiveRowSlots =>
  slots.map(card => (card ? sanitizeCardMetadata(card) : null));

const getEmptyColumns = (slots: ActiveRowSlots): number[] =>
  DUNGEON_COLUMNS.filter(columnIndex => !slots[columnIndex]);

const getFilledPreviewColumns = (slots: ActiveRowSlots): number[] =>
  DUNGEON_COLUMNS.filter(columnIndex => Boolean(slots[columnIndex]));

type AmuletAuraTotals = {
  attack: number;
  defense: number;
  maxHp: number;
};

type ActiveAmuletEffects = {
  aura: AmuletAuraTotals;
  hasHeal: boolean;
  hasBalance: boolean;
  hasLife: boolean;
  hasGuardian: boolean;
  hasFlash: boolean;
  hasStrength: boolean;
};

const createEmptyAmuletEffects = (): ActiveAmuletEffects => ({
  aura: {
    attack: 0,
    defense: 0,
    maxHp: 0,
  },
  hasHeal: false,
  hasBalance: false,
  hasLife: false,
  hasGuardian: false,
  hasFlash: false,
  hasStrength: false,
});

const logWaterfallInvariant = (
  condition: boolean,
  label: string,
  payload?: Record<string, unknown>,
) => {
  if (condition || !DEV_MODE) {
    return;
  }
  console.warn(`[Waterfall][Invariant] ${label}`, payload);
};

const findSlotIndexByCardId = (slots: ActiveRowSlots, cardId: string): number =>
  slots.findIndex(card => card?.id === cardId);

const logWaterfall = (phase: string, payload?: Record<string, unknown>) => {
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[Waterfall] ${phase}`, payload);
  }
};

type WaterfallPhase = 'idle' | 'dropping' | 'discarding' | 'dealing';

type WaterfallAnimationState = {
  phase: WaterfallPhase;
  isActive: boolean;
  droppingSlots: number[];
  landingSlots: number[];
  discardSlot: number | null;
  dealingSlots: number[];
  sequenceId: number | null;
};

type WaterfallPlan = {
  dropCards: GameCardData[];
  dropPreviewIndices: number[];
  dropTargetSlots: number[];
  discardCard: GameCardData | null;
  discardPreviewIndex: number | null;
  nextPreviewCards: GameCardData[];
  nextRemainingDeck: GameCardData[];
  shouldDeclareVictory: boolean;
};

const WATERFALL_DROP_DURATION = 650;
const WATERFALL_DISCARD_DURATION = 450;
const WATERFALL_DEAL_DURATION = 550;
const CLASS_FLIGHT_BASE_DURATION = 900;
const CLASS_FLIGHT_VARIANCE = 250;
const CLASS_FLIGHT_STAGGER = 110;
const CLASS_FLIGHT_ARC_MIN = 40;
const CLASS_FLIGHT_ARC_VARIANCE = 35;

const initialWaterfallAnimationState: WaterfallAnimationState = {
  phase: 'idle',
  isActive: false,
  droppingSlots: [],
  landingSlots: [],
  discardSlot: null,
  dealingSlots: [],
  sequenceId: null,
};
type SwordVector = { left: number; top: number; angle: number; length: number };
type Point = { x: number; y: number };
type ClassDeckFlight = {
  id: string;
  card: GameCardData;
  start: Point;
  end: Point;
  startTime: number;
  duration: number;
  progress: number;
  arcHeight: number;
};

const clamp = (value: number, min = 0, max = 1) => Math.min(Math.max(value, min), max);
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

type BackpackHandFlight = {
  id: string;
  card: GameCardData;
  start: Point;
  end: Point;
  startTime: number;
  duration: number;
  progress: number;
  arcHeight: number;
};

const BACKPACK_FLIGHT_BASE_DURATION = 700;
const BACKPACK_FLIGHT_VARIANCE = 250;
const BACKPACK_FLIGHT_STAGGER = 80;
const BACKPACK_FLIGHT_ARC_MIN = 30;
const BACKPACK_FLIGHT_ARC_VARIANCE = 45;

function createDeck(): GameCardData[] {
  const deck: GameCardData[] = [];
  let id = 0;

    // Monster variety with attack/HP separation and fury (formerly layers)
    const monsterTypes = [
      { 
        name: 'Dragon', 
        image: dragonImage, 
        minAttack: 4, maxAttack: 6,
        minHp: 7, maxHp: 10,
        minFury: 3, maxFury: 4
      },
      { 
        name: 'Skeleton', 
        image: skeletonImage, 
        minAttack: 5, maxAttack: 7,
        minHp: 1, maxHp: 3,
        minFury: 2, maxFury: 4
      },
      { 
        name: 'Goblin', 
        image: goblinImage, 
        minAttack: 2, maxAttack: 3,
        minHp: 3, maxHp: 4,
        minFury: 1, maxFury: 4
      },
      { 
        name: 'Ogre', 
        image: ogreImage, 
        minAttack: 3, maxAttack: 4,
        minHp: 5, maxHp: 7,
        minFury: 2, maxFury: 4
      },
    ];

    // 12 monsters total for lighter encounters
    for (let i = 0; i < 12; i++) {
      const monsterType = monsterTypes[i % monsterTypes.length];
      const attack = Math.floor(Math.random() * (monsterType.maxAttack - monsterType.minAttack + 1)) + monsterType.minAttack;
      const hp = Math.floor(Math.random() * (monsterType.maxHp - monsterType.minHp + 1)) + monsterType.minHp;
      const fury = Math.floor(Math.random() * (monsterType.maxFury - monsterType.minFury + 1)) + monsterType.minFury;
      
      deck.push({
        id: `monster-${id++}`,
        type: 'monster',
        name: monsterType.name,
        value: attack, // Keep value for backwards compatibility
        attack: attack,
        hp: hp,
        maxHp: hp,
        fury: fury,
        hpLayers: fury, // Backwards compat
        currentLayer: fury, // Initialize currentLayer to max fury for visual sliding logic
        image: monsterType.image,
      });
    }

  // Weapon variety with improved values (2-6 range)
  const weaponTypes = [
    { name: 'Sword', image: swordImage },
    { name: 'Axe', image: axeImage },
    { name: 'Dagger', image: daggerImage },
    { name: 'Mace', image: swordImage }, // Reuse sword
    { name: 'Spear', image: daggerImage }, // Reuse dagger
  ];
  
  for (let i = 0; i < 6; i++) {
    const weaponType = weaponTypes[i % weaponTypes.length];
    // Balanced weapon values: 2-6
    const value = Math.floor(Math.random() * 5) + 2;
    // Random durability 1-4
    const durability = Math.floor(Math.random() * 4) + 1;
    deck.push({
      id: `weapon-${id++}`,
      type: 'weapon',
      name: weaponType.name,
      value: value,
      image: weaponType.image,
      durability: durability,
      maxDurability: durability,
    });
  }

  // Shield variety (2-4 range for balance) with different images per value
  const shieldTypes = [
    { name: 'Wooden Shield', value: 2, image: woodenShieldImage },
    { name: 'Iron Shield', value: 3, image: ironShieldImage },
    { name: 'Heavy Shield', value: 4, image: heavyShieldImage },
  ];
  
  // 2 shields of each type (6 total)
  for (let i = 0; i < 6; i++) {
    const shieldType = shieldTypes[i % shieldTypes.length];
    // Random durability 1-4
    const durability = Math.floor(Math.random() * 4) + 1;
    deck.push({
      id: `shield-${id++}`,
      type: 'shield',
      name: shieldType.name,
      value: shieldType.value,
      image: shieldType.image,
      durability: durability,
      maxDurability: durability,
    });
  }

  // Potions - bespoke utility set (6 total)
  const potionCards: GameCardData[] = [
    {
      type: 'potion',
      name: '治疗药水',
      value: 5,
      image: potionImage,
      potionEffect: 'heal-5',
      description: '立即回复5点生命。',
    },
    {
      type: 'potion',
      name: '浓缩治疗药水',
      value: 7,
      image: potionImage,
      potionEffect: 'heal-7',
      description: '立即回复7点生命。',
    },
    {
      type: 'potion',
      name: '武器修复剂',
      value: 6,
      image: potionImage,
      potionEffect: 'repair-weapon-2',
      description: '选择一个装备的武器，恢复2点耐久。',
    },
    {
      type: 'potion',
      name: '高级修复剂',
      value: 7,
      image: potionImage,
      potionEffect: 'repair-equipment-2',
      description: '选择一个武器或护盾，恢复2点耐久。',
    },
    {
      type: 'potion',
      name: '背包觉醒药',
      value: 5,
      image: potionImage,
      potionEffect: 'draw-backpack-3',
      description: '从背包顶部抽最多3张牌到手牌。',
    },
    {
      type: 'potion',
      name: '洞察药剂',
      value: 6,
      image: potionImage,
      potionEffect: 'discover-class',
      description: '发现一张职业卡牌。',
    },
  ];

  potionCards.forEach(card => {
    deck.push({
      ...card,
      id: `potion-${id++}`,
    });
  });

  // Gold Event Cards - Replaced coin cards with gold-giving events
  // These 4 events are focused on gaining gold through choices
  // Amulets (6 unique cards)
  const amuletCards: Omit<GameCardData, 'id'>[] = [
    {
      type: 'amulet',
      name: 'Heal Amulet',
      value: 5,
      image: lifeAmuletImage,
      description: '所有回血效果翻倍',
      amuletEffect: 'heal',
    },
    {
      type: 'amulet',
      name: 'Balance Amulet',
      value: 5,
      image: guardianAmuletImage,
      description: '左边Equipment攻击+3，右边Equipment护甲+3',
      amuletEffect: 'balance',
    },
    {
      type: 'amulet',
      name: 'Life Amulet',
      value: 5,
      image: lifeAmuletImage,
      description: '攻击时候，超出对方血量的伤害，为自己回血',
      amuletEffect: 'life',
    },
    {
      type: 'amulet',
      name: 'Guardian Amulet',
      value: 5,
      image: guardianAmuletImage,
      description: '有护盾时候，超过格挡的部分不损失血',
      amuletEffect: 'guardian',
    },
    {
      type: 'amulet',
      name: 'Flash Amulet',
      value: 5,
      image: strengthAmuletImage,
      description: '所有Equipment攻击力-3，攻击两次',
      amuletEffect: 'flash',
    },
    {
      type: 'amulet',
      name: 'Strength Amulet',
      value: 5,
      image: strengthAmuletImage,
      description: '所有Equipment 攻击+4，每攻击一次，掉3点血',
      amuletEffect: 'strength',
      amuletAuraBonus: {
        attack: 4,
      },
    },
  ];

  amuletCards.forEach(amulet => {
    deck.push({
      ...amulet,
      id: `amulet-${id++}`,
    });
  });

  // Magic cards (all instant effects)
  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: 'Cascade Reset',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: 'Shuffle all active row cards back into the deck, then trigger a waterfall.'
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: 'Tempest Volley',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: 'Deal 3 damage to every monster in the active row.'
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: 'Echo Satchel',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: 'Draw cards from your backpack equal to cards discarded since the last waterfall.'
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: 'Bulwark Slam',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: 'Choose a shield slot and deal its armor value as damage to a monster.'
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: 'Blood Reckoning',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: 'Deal damage equal to your missing HP to a monster of your choice.'
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: 'Eternal Repair',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: 'Choose an equipped item and restore it to full durability.'
  });

  // Event cards rewritten (first six)
  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '命运十字路口',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: '倾听命运的低语（发现专属卡）', effect: 'discoverClass', hint: '立即进行发现流程' },
      { text: '与命运商贩交谈（打开商店）', effect: 'openShop', hint: '立刻开启商店' },
      { text: '献祭体魄（永久 +3 生命上限）', effect: 'maxhpperm+3', hint: '上限提升会保留整局' },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '秘藏宝库',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: '搜刮遗物（获得两张专属卡）', effect: 'drawClass2', hint: '立刻放入背包' },
      {
        text: '逐层翻找黄金（掷骰 5-14 金币）',
        hint: '展示掷骰动画，并映射为金币奖励',
        diceTable: [
          { id: 'gold-5', range: [1, 2], label: '+5 金币', effect: 'gold+5' },
          { id: 'gold-6', range: [3, 4], label: '+6 金币', effect: 'gold+6' },
          { id: 'gold-7', range: [5, 6], label: '+7 金币', effect: 'gold+7' },
          { id: 'gold-8', range: [7, 8], label: '+8 金币', effect: 'gold+8' },
          { id: 'gold-9', range: [9, 10], label: '+9 金币', effect: 'gold+9' },
          { id: 'gold-10', range: [11, 12], label: '+10 金币', effect: 'gold+10' },
          { id: 'gold-11', range: [13, 14], label: '+11 金币', effect: 'gold+11' },
          { id: 'gold-12', range: [15, 16], label: '+12 金币', effect: 'gold+12' },
          { id: 'gold-13', range: [17, 18], label: '+13 金币', effect: 'gold+13' },
          { id: 'gold-14', range: [19, 20], label: '+14 金币', effect: 'gold+14' },
        ],
      },
      {
        text: '翻出治疗药剂（掷骰 2-6 治疗）',
        hint: '示意掷骰并标出对应治疗值',
        diceTable: [
          { id: 'heal-2', range: [1, 4], label: '恢复 2 HP', effect: 'heal+2' },
          { id: 'heal-3', range: [5, 8], label: '恢复 3 HP', effect: 'heal+3' },
          { id: 'heal-4', range: [9, 12], label: '恢复 4 HP', effect: 'heal+4' },
          { id: 'heal-5', range: [13, 16], label: '恢复 5 HP', effect: 'heal+5' },
          { id: 'heal-6', range: [17, 20], label: '恢复 6 HP', effect: 'heal+6' },
        ],
      },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '暗影契约',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: '签下血约（受到 5 点伤害）', effect: 'hp-5' },
      {
        text: '献出装备（破坏任一装备）',
        effect: 'destroyEquipment:any',
        hint: '会要求你选择左或右装备',
        requires: [{ type: 'equipmentAny', message: '需要至少一件装备' }],
      },
      { text: '支付赎金（损失 10 金币）', effect: 'gold-10' },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '共鸣熔炉',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: '左槽淬火（左槽永久伤害 +1）', effect: 'slotLeftDamage+1' },
      { text: '右槽固化（右槽永久护甲 +1）', effect: 'slotRightDefense+1' },
      { text: '翻转轨道（左右装备互换）', effect: 'swapEquipmentSlots' },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '贪婪祭坛',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      {
        id: 'greedy-left',
        text: '献祭左手装备（金币 +15）',
        effect: 'discardLeftForGold+15',
        requires: [{ type: 'equipment', slot: 'left', message: '左侧装备栏为空' }],
      },
      {
        id: 'greedy-right',
        text: '献祭右手装备（金币 +15）',
        effect: 'discardRightForGold+15',
        requires: [{ type: 'equipment', slot: 'right', message: '右侧装备栏为空' }],
      },
      {
        id: 'greedy-amulet',
        text: '粉碎所有护符（每个 +10 金币）',
        effect: 'amuletsToGold+10',
        requires: [{ type: 'amulet', message: '需要至少一个护符' }],
      },
      {
        id: 'greedy-blood',
        text: '献血离开（掉 5 HP）',
        effect: 'hp-5',
        hint: '仅当其他献祭方式全部不可用时可选',
        requiresDisabledChoices: ['greedy-left', 'greedy-right', 'greedy-amulet'],
        requiresDisabledReason: '仍有其他献祭方式可用',
      },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '荣誉回响',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: '整理呼吸（回复 5 HP）', effect: 'heal+5' },
      { text: '回收战利品（金币 +20）', effect: 'gold+20' },
      { text: '唤醒底牌（获得底部两张专属卡）', effect: 'classBottom+2' },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '血咒仪式',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      {
        id: 'curse-flip',
        text: '翻转卷轴（获得血咒）',
        effect: 'flipToCurse',
        hint: '事件卡本身会翻转成永久诅咒并进入背包',
      },
      {
        id: 'curse-discard-hand',
        text: '献祭手牌（手牌全弃）',
        effect: 'discardHandAll',
        requires: [{ type: 'hand', min: 1, message: '需要至少 1 张手牌' }],
      },
      {
        id: 'curse-pack-shrink',
        text: '束缚空间（背包容量 -4）',
        effect: 'backpackSize-4',
        hint: '背包容量永久降低 4，超过的卡牌会被丢弃',
      },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '深红契约',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: '血价交易（-2 HP，发现专属）', effect: 'hp-2,discoverClass' },
      { text: '捐献财富（-4 金币，商店等级 +1）', effect: 'gold-4,shopLevel+1' },
      {
        text: '焚尽旧物（弃 2 张牌，法伤 +1）',
        effect: ['discardCards:2', 'spellDamage+1'],
        requires: [
          {
            type: 'cardPool',
            pools: ['hand', 'backpack'],
            min: 2,
            message: '需要至少 2 张可弃置的卡牌',
          },
        ],
      },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '墓语密室',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      {
        text: '净化杂质（删 1 张牌）',
        effect: 'deleteCard:1',
        requires: [
          {
            type: 'cardPool',
            pools: ['hand', 'backpack'],
            min: 1,
            message: '需要至少 1 张可删除的卡牌',
          },
        ],
      },
      {
        text: '坟场召回（随机 3 选 1）',
        effect: 'graveyardDiscover',
        requires: [{ type: 'graveyard', min: 1, message: '坟场中没有可召回的卡牌' }],
      },
      { text: '召唤商贩（打开商店）', effect: 'openShop' },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '奇术商会',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: '思绪翻涌（抽 2 张牌）', effect: 'drawHeroCards:2' },
      { text: '扩张人脉（商店等级 +1）', effect: 'shopLevel+1' },
      {
        text: '挖掘遗物（坟场发现 1 张）',
        effect: 'graveyardDiscover',
        requires: [{ type: 'graveyard', min: 1, message: '坟场中没有可召回的卡牌' }],
      },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '命运骰盅',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      {
        text: '掷动命运骰子',
        hint: '20% 触发不同奖励或惩罚',
        diceTable: [
          { id: 'dice11-shop', range: [1, 4], label: '打开商店', effect: 'openShop' },
          { id: 'dice11-level', range: [5, 8], label: '商店等级 +1', effect: 'shopLevel+1' },
          { id: 'dice11-spell', range: [9, 12], label: '法术伤害 +1', effect: 'spellDamage+1' },
          { id: 'dice11-amulets', range: [13, 16], label: '摧毁所有护符', effect: 'removeAllAmulets' },
          { id: 'dice11-discover', range: [17, 20], label: '发现一张专属卡', effect: 'discoverClass' },
        ],
      },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '混沌骰局',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      {
        text: '掷出混沌结果',
        hint: '20% 概率触发不同命运',
        diceTable: [
          { id: 'dice12-shop', range: [1, 4], label: '打开商店', effect: 'openShop' },
          { id: 'dice12-curse', range: [5, 8], label: '背包加入一张诅咒', effect: 'addCurse' },
          {
            id: 'dice12-delete',
            range: [9, 12],
            label: '删除 1 张牌',
            effect: 'deleteCard:1',
          },
          { id: 'dice12-class', range: [13, 16], label: '获得 2 张专属卡', effect: 'drawClass2' },
          { id: 'dice12-draw', range: [17, 20], label: '抽 2 张牌', effect: 'drawHeroCards:2' },
        ],
      },
    ],
  });

  return deck.sort(() => Math.random() - 0.5);
}

export default function GameBoard() {
  // const { toast } = useToast(); // Disabled toast notifications
  const [hp, setHp] = useState(INITIAL_HP);
  const [gold, setGold] = useState(INITIAL_GOLD);
  const [shopLevel, setShopLevel] = useState(0);
  const [previewCards, setPreviewCards] = useState<ActiveRowSlots>(createEmptyActiveRow()); // Preview row slots
  const [activeCards, setActiveCards] = useState<ActiveRowSlots>(createEmptyActiveRow());
  const [remainingDeck, setRemainingDeck] = useState<GameCardData[]>([]);
  const [equipmentSlot1, setEquipmentSlot1] = useState<EquipmentItem | null>(null);
  const [equipmentSlot2, setEquipmentSlot2] = useState<EquipmentItem | null>(null);
  const [amuletSlots, setAmuletSlots] = useState<AmuletItem[]>([]);
  const amuletEffects = useMemo<ActiveAmuletEffects>(() => {
    return amuletSlots.reduce<ActiveAmuletEffects>((state, slot) => {
      if (!slot) {
        return state;
      }
      switch (slot.amuletEffect) {
        case 'heal':
          state.hasHeal = true;
          break;
        case 'balance':
          state.hasBalance = true;
          break;
        case 'life':
          state.hasLife = true;
          break;
        case 'guardian':
          state.hasGuardian = true;
          break;
        case 'flash':
          state.hasFlash = true;
          break;
        case 'strength':
          state.hasStrength = true;
          break;
      }
      const bonus = slot.amuletAuraBonus;
      if (bonus) {
        if (typeof bonus.attack === 'number') {
          state.aura.attack += bonus.attack;
        }
        if (typeof bonus.defense === 'number') {
          state.aura.defense += bonus.defense;
        }
        if (typeof bonus.maxHp === 'number') {
          state.aura.maxHp += bonus.maxHp;
        }
      }
      if (typeof slot.value === 'number' && slot.effect) {
        if (slot.effect === 'attack' && !(bonus && typeof bonus.attack === 'number')) {
          state.aura.attack += slot.value;
        }
        if (slot.effect === 'defense' && !(bonus && typeof bonus.defense === 'number')) {
          state.aura.defense += slot.value;
        }
        if (slot.effect === 'health' && !(bonus && typeof bonus.maxHp === 'number')) {
          state.aura.maxHp += slot.value;
        }
      }
      return state;
    }, createEmptyAmuletEffects());
  }, [amuletSlots]);
  const [backpackItems, setBackpackItems] = useState<GameCardData[]>([]); // Full card storage LIFO stack
  const [backpackCapacityModifier, setBackpackCapacityModifier] = useState(0);
  const backpackCapacity = Math.max(1, BASE_BACKPACK_CAPACITY + backpackCapacityModifier);
  const [canDrawFromBackpack, setCanDrawFromBackpack] = useState(false);
  const [backpackViewerOpen, setBackpackViewerOpen] = useState(false);
  const [classDeckFlights, setClassDeckFlights] = useState<ClassDeckFlight[]>([]);
  const [discoverModalOpen, setDiscoverModalOpen] = useState(false);
  const [discoverOptions, setDiscoverOptions] = useState<GameCardData[]>([]);
  const [shopModalOpen, setShopModalOpen] = useState(false);
  const [shopOfferings, setShopOfferings] = useState<ShopOffering[]>([]);
  const [shopSourceEvent, setShopSourceEvent] = useState<GameCardData | null>(null);
  const [shopDeleteUsed, setShopDeleteUsed] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [cardActionContext, setCardActionContext] = useState<CardActionContext | null>(null);
  const cardActionResolverRef = useRef<(() => void) | null>(null);
  const shopDiscountPercent = getShopDiscountPercent(shopLevel);
  const adjustShopLevel = useCallback((delta: number) => {
    if (!delta) return;
    setShopLevel(prev => Math.max(0, Math.floor(prev + delta)));
  }, []);
  const [cardsPlayed, setCardsPlayed] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [victory, setVictory] = useState(false);
  const [draggedCard, setDraggedCard] = useState<GameCardData | null>(null);
  const [draggedCardSource, setDraggedCardSource] = useState<DragOrigin | null>(null);
  const [heroRowDropState, setHeroRowDropState] = useState<HeroRowDropType | null>(null);
  const [draggedEquipment, setDraggedEquipment] = useState<any | null>(null);
  const [isDragSessionActive, setIsDragSessionActive] = useState(false);
  const [drawPending, setDrawPending] = useState(false);
  const [removingCards, setRemovingCards] = useState<Set<string>>(new Set());
  const [takingDamage, setTakingDamage] = useState(false);
  const [healing, setHealing] = useState(false);
  const [heroBleedActive, setHeroBleedActive] = useState(false);
  const [monsterBleedStates, setMonsterBleedStates] = useState<Record<string, number>>({});
  const [weaponSwingStates, setWeaponSwingStates] = useState<Record<EquipmentSlotId, number>>({
    equipmentSlot1: 0,
    equipmentSlot2: 0,
  });
  const [shieldBlockStates, setShieldBlockStates] = useState<Record<EquipmentSlotId, number>>({
    equipmentSlot1: 0,
    equipmentSlot2: 0,
  });
  const [weaponSwingVariant, setWeaponSwingVariant] = useState<Record<EquipmentSlotId, 0 | 1>>({
    equipmentSlot1: 0,
    equipmentSlot2: 0,
  });
  const [shieldBlockVariant, setShieldBlockVariant] = useState<Record<EquipmentSlotId, 0 | 1>>({
    equipmentSlot1: 0,
    equipmentSlot2: 0,
  });
  const [heroVariant, setHeroVariant] = useState<HeroVariant>(() => getRandomHero());
  const boardRef = useRef<HTMLDivElement>(null);
  const gameSurfaceRef = useRef<HTMLDivElement | null>(null);
  const gridWrapperRef = useRef<HTMLDivElement | null>(null);
  const animationDelayTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const heroBleedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monsterBleedTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({});
  const weaponSwingTimeoutsRef = useRef<Record<EquipmentSlotId, ReturnType<typeof setTimeout>[]>>({
    equipmentSlot1: [],
    equipmentSlot2: [],
  });
  const shieldBlockTimeoutsRef = useRef<Record<EquipmentSlotId, ReturnType<typeof setTimeout>[]>>({
    equipmentSlot1: [],
    equipmentSlot2: [],
  });
  const scheduleAnimationStart = useCallback((fn: () => void, delay = 0) => {
    const run = () => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => fn());
      } else {
        fn();
      }
    };
    if (delay <= 0) {
      run();
      return;
    }
    const timeoutId = setTimeout(() => {
      animationDelayTimeoutsRef.current = animationDelayTimeoutsRef.current.filter(id => id !== timeoutId);
      run();
    }, delay);
    animationDelayTimeoutsRef.current.push(timeoutId);
  }, []);
  const triggerHeroBleedAnimation = useCallback(
    (delay = 0) => {
      if (heroBleedTimeoutRef.current) {
        clearTimeout(heroBleedTimeoutRef.current);
        heroBleedTimeoutRef.current = null;
      }
      setHeroBleedActive(false);
      const start = () => {
        setHeroBleedActive(true);
        heroBleedTimeoutRef.current = setTimeout(() => {
          setHeroBleedActive(false);
          heroBleedTimeoutRef.current = null;
        }, COMBAT_ANIMATION_DURATION);
      };
      scheduleAnimationStart(start, delay);
    },
    [scheduleAnimationStart],
  );
  const triggerMonsterBleedAnimation = useCallback(
    (monsterId: string, delay = 0) => {
      if (!monsterId) return;
      scheduleAnimationStart(() => {
        setMonsterBleedStates(prev => ({
          ...prev,
          [monsterId]: (prev[monsterId] ?? 0) + 1,
        }));
        const timeoutId = setTimeout(() => {
          setMonsterBleedStates(prev => {
            const current = prev[monsterId];
            if (!current) {
              return prev;
            }
            if (current <= 1) {
              const next = { ...prev };
              delete next[monsterId];
              return next;
            }
            return {
              ...prev,
              [monsterId]: current - 1,
            };
          });
          monsterBleedTimeoutsRef.current[monsterId] =
            (monsterBleedTimeoutsRef.current[monsterId] || []).filter(id => id !== timeoutId);
          if (!monsterBleedTimeoutsRef.current[monsterId]?.length) {
            delete monsterBleedTimeoutsRef.current[monsterId];
          }
        }, COMBAT_ANIMATION_DURATION);
        monsterBleedTimeoutsRef.current[monsterId] = [
          ...(monsterBleedTimeoutsRef.current[monsterId] || []),
          timeoutId,
        ];
      }, delay);
    },
    [scheduleAnimationStart],
  );
  const startWeaponSwingPulse = useCallback(
    (slotId: EquipmentSlotId, delay = 0) => {
      scheduleAnimationStart(() => {
        setWeaponSwingStates(prev => ({
          ...prev,
          [slotId]: (prev[slotId] ?? 0) + 1,
        }));
        const timeoutId = setTimeout(() => {
          setWeaponSwingStates(prev => {
            const current = prev[slotId] ?? 0;
            const nextCount = Math.max(0, current - 1);
            return {
              ...prev,
              [slotId]: nextCount,
            };
          });
          weaponSwingTimeoutsRef.current[slotId] = (weaponSwingTimeoutsRef.current[slotId] || []).filter(
            id => id !== timeoutId,
          );
        }, COMBAT_ANIMATION_DURATION);
        weaponSwingTimeoutsRef.current[slotId] = [
          ...(weaponSwingTimeoutsRef.current[slotId] || []),
          timeoutId,
        ];
      }, delay);
    },
    [scheduleAnimationStart],
  );
  const startShieldBlockPulse = useCallback(
    (slotId: EquipmentSlotId, delay = 0) => {
      scheduleAnimationStart(() => {
        setShieldBlockStates(prev => ({
          ...prev,
          [slotId]: (prev[slotId] ?? 0) + 1,
        }));
        const timeoutId = setTimeout(() => {
          setShieldBlockStates(prev => {
            const current = prev[slotId] ?? 0;
            const nextCount = Math.max(0, current - 1);
            return {
              ...prev,
              [slotId]: nextCount,
            };
          });
          shieldBlockTimeoutsRef.current[slotId] = (shieldBlockTimeoutsRef.current[slotId] || []).filter(
            id => id !== timeoutId,
          );
        }, COMBAT_ANIMATION_DURATION);
        shieldBlockTimeoutsRef.current[slotId] = [
          ...(shieldBlockTimeoutsRef.current[slotId] || []),
          timeoutId,
        ];
      }, delay);
    },
    [scheduleAnimationStart],
  );
  const triggerWeaponSwingAnimation = useCallback(
    (slotId: EquipmentSlotId, delay = 0, options?: { echoes?: number }) => {
      const echoes = Math.max(1, options?.echoes ?? 1);
      for (let i = 0; i < echoes; i += 1) {
        startWeaponSwingPulse(slotId, delay + i * Math.floor(COMBAT_ANIMATION_STAGGER / 2));
      }
      setWeaponSwingVariant(prev => ({
        ...prev,
        [slotId]: prev[slotId] === 0 ? 1 : 0,
      }));
    },
    [startWeaponSwingPulse],
  );
  const triggerShieldBlockAnimation = useCallback(
    (slotId: EquipmentSlotId, delay = 0, options?: { echoes?: number }) => {
      const echoes = Math.max(1, options?.echoes ?? 2);
      for (let i = 0; i < echoes; i += 1) {
        startShieldBlockPulse(slotId, delay + i * Math.floor(COMBAT_ANIMATION_STAGGER / 2));
      }
      setShieldBlockVariant(prev => ({
        ...prev,
        [slotId]: prev[slotId] === 0 ? 1 : 0,
      }));
    },
    [startShieldBlockPulse],
  );
  useEffect(() => {
    return () => {
      if (heroBleedTimeoutRef.current) {
        clearTimeout(heroBleedTimeoutRef.current);
      }
      animationDelayTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      Object.values(monsterBleedTimeoutsRef.current).forEach(timeouts => {
        timeouts.forEach(timeout => clearTimeout(timeout));
      });
      Object.values(weaponSwingTimeoutsRef.current).forEach(timeouts => {
        timeouts.forEach(timeout => clearTimeout(timeout));
      });
      Object.values(shieldBlockTimeoutsRef.current).forEach(timeouts => {
        timeouts.forEach(timeout => clearTimeout(timeout));
      });
    };
  }, []);
  const heroCellRef = useRef<HTMLDivElement>(null);
  const heroRowCellRefs = useRef<Array<HTMLDivElement | null>>(Array(6).fill(null));
  const monsterCellRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const waterfallPlanRef = useRef<WaterfallPlan | null>(null);
  const waterfallTimeoutsRef = useRef<number[]>([]);
  const waterfallLockRef = useRef(false);
  const cascadeResetWaterfallRef = useRef(false);
  const pendingDungeonRemovalsRef = useRef(0);
  const waterfallPendingRef = useRef(false);
  const waterfallSequenceRef = useRef(0);
  const lastWaterfallSequenceRef = useRef<number | null>(null);
  const previewCellRefs = useRef<Array<HTMLDivElement | null>>([]);
  const graveyardCellRef = useRef<HTMLDivElement | null>(null);
  const heroFrameBoundsRef = useRef<DOMRect | null>(null);
  const heroFrameDropIntentRef = useRef(false);
  const draggedCardRef = useRef<GameCardData | null>(null);
  const heroSkillButtonRef = useRef<HTMLButtonElement | null>(null);
  const [heroRowFrameDropActive, setHeroRowFrameDropActive] = useState(false);
  const classDeckFlightsRef = useRef<ClassDeckFlight[]>([]);
  const classDeckFlightAnimationRef = useRef<number | null>(null);
  const [backpackHandFlights, setBackpackHandFlights] = useState<BackpackHandFlight[]>([]);
  const backpackHandFlightsRef = useRef<BackpackHandFlight[]>([]);
  const backpackHandFlightAnimationRef = useRef<number | null>(null);
  const [heroFramePosition, setHeroFramePosition] = useState<HeroFramePosition | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const lastPersistedStateRef = useRef<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number>(
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  );
  const gridMetrics = useMemo(() => getGridMetricsForWidth(viewportWidth), [viewportWidth]);
  const gridStyleVars = useMemo(() => {
    return {
      '--dh-grid-gap-x': `${gridMetrics.gapX}px`,
      '--dh-grid-gap-y': `${gridMetrics.gapY}px`,
      '--dh-card-padding': `${gridMetrics.padding}px`,
      '--dh-card-font-scale': gridMetrics.cardFontScale.toString(),
      '--dh-card-stat-scale': gridMetrics.cardStatScale.toString(),
      '--dh-card-icon-scale': gridMetrics.cardIconScale.toString(),
      '--dh-card-dot-size': `${gridMetrics.cardDotSize}px`,
      '--dh-hero-font-scale': gridMetrics.heroFontScale.toString(),
    } as CSSProperties;
  }, [gridMetrics]);
  
  // Track grid card size for synchronization with hand
  const gridCellRef = useRef<HTMLDivElement | null>(null);
  const [gridCardSize, setGridCardSize] = useState<{width: number, height: number} | undefined>(undefined);
  const handAreaRef = useRef<HTMLDivElement | null>(null);
  const [waterfallAnimation, setWaterfallAnimation] = useState<WaterfallAnimationState>(initialWaterfallAnimationState);
  const [previewGraveyardVectors, setPreviewGraveyardVectors] = useState<Record<number, GraveyardVector>>({});
  const [heroSkillArrow, setHeroSkillArrow] = useState<HeroSkillArrowState | null>(null);
  const setPreviewCellRef = useCallback((index: number, el: HTMLDivElement | null) => {
    previewCellRefs.current[index] = el;
    if (index === 0) {
      gridCellRef.current = el;
    }
  }, []);
  const setGraveyardRef = useCallback((el: HTMLDivElement | null) => {
    graveyardCellRef.current = el;
  }, []);
  const updateHeroFramePosition = useCallback(() => {
    const container = gridWrapperRef.current;
    const firstCell = heroRowCellRefs.current[0];
    const lastCell = heroRowCellRefs.current[heroRowCellRefs.current.length - 1];
    if (!container || !firstCell || !lastCell) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const firstRect = firstCell.getBoundingClientRect();
    const lastRect = lastCell.getBoundingClientRect();
    const nextPosition = {
      left: firstRect.left - containerRect.left,
      top: firstRect.top - containerRect.top,
      width: lastRect.right - firstRect.left,
      height: firstRect.height,
    };
    setHeroFramePosition(prev => {
      if (
        prev &&
        Math.abs(prev.left - nextPosition.left) < 0.5 &&
        Math.abs(prev.top - nextPosition.top) < 0.5 &&
        Math.abs(prev.width - nextPosition.width) < 0.5 &&
        Math.abs(prev.height - nextPosition.height) < 0.5
      ) {
        return prev;
      }
      return nextPosition;
    });
  }, []);
  const registerHeroRowCellRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      heroRowCellRefs.current[index] = el;
      updateHeroFramePosition();
    },
    [updateHeroFramePosition],
  );
  const updatePreviewToGraveyardVector = useCallback((slotIndex: number | null) => {
    if (slotIndex === null) return;
    const previewCell = previewCellRefs.current[slotIndex];
    const graveyardCell = graveyardCellRef.current;
    if (!previewCell || !graveyardCell) return;
    const previewRect = previewCell.getBoundingClientRect();
    const graveyardRect = graveyardCell.getBoundingClientRect();
    const vector: GraveyardVector = {
      offsetX:
        graveyardRect.left + graveyardRect.width / 2 - (previewRect.left + previewRect.width / 2),
      offsetY:
        graveyardRect.top + graveyardRect.height / 2 - (previewRect.top + previewRect.height / 2),
    };
    setPreviewGraveyardVectors(prev => {
      const previous = prev[slotIndex];
      if (
        previous &&
        Math.abs(previous.offsetX - vector.offsetX) < 1 &&
        Math.abs(previous.offsetY - vector.offsetY) < 1
      ) {
        return prev;
      }
      return { ...prev, [slotIndex]: vector };
    });
  }, []);

  useEffect(() => {
    logWaterfall('animation-state', {
      phase: waterfallAnimation.phase,
      isActive: waterfallAnimation.isActive,
      droppingSlots: waterfallAnimation.droppingSlots,
      landingSlots: waterfallAnimation.landingSlots,
      discardSlot: waterfallAnimation.discardSlot,
      dealingSlots: waterfallAnimation.dealingSlots,
      sequenceId: waterfallAnimation.sequenceId,
    });
  }, [waterfallAnimation]);
  useEffect(() => {
    draggedCardRef.current = draggedCard;
  }, [draggedCard]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleViewportResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, []);

  useEffect(() => {
    const target = gridCellRef.current;
    if (!target) return;

    const updateSize = () => {
      if (!gridCellRef.current) return;
      const { width, height } = gridCellRef.current.getBoundingClientRect();
      setGridCardSize(prev => {
        if (prev && prev.width === width && prev.height === height) {
          return prev;
        }
        return { width, height };
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(target);

    return () => resizeObserver.disconnect();
  }, [previewCards]); // Re-measure if layout shifts (though grid is stable)

  useLayoutEffect(() => {
    if (waterfallAnimation.discardSlot !== null) {
      updatePreviewToGraveyardVector(waterfallAnimation.discardSlot);
    }
  }, [waterfallAnimation.discardSlot, updatePreviewToGraveyardVector]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      updatePreviewToGraveyardVector(waterfallAnimation.discardSlot);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updatePreviewToGraveyardVector, waterfallAnimation.discardSlot]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => updateHeroFramePosition();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateHeroFramePosition]);
  useEffect(() => {
    const sequenceId = waterfallAnimation.sequenceId;
    if (sequenceId === null) {
      return;
    }
    if (lastWaterfallSequenceRef.current === sequenceId) {
      return;
    }
    lastWaterfallSequenceRef.current = sequenceId;
    setWaveDiscardCount(0);
  }, [waterfallAnimation.sequenceId]);

  const queueWaterfallTimeout = useCallback((callback: () => void, delay: number, label?: string) => {
    const id = window.setTimeout(() => {
      if (label) {
        logWaterfall('timeout-fired', { label, id });
      }
      callback();
      waterfallTimeoutsRef.current = waterfallTimeoutsRef.current.filter(storedId => storedId !== id);
    }, delay);
    if (label) {
      logWaterfall('timeout-scheduled', { label, delay, id });
    }
    waterfallTimeoutsRef.current.push(id);
    return id;
  }, []);

  const clearWaterfallTimeouts = useCallback(() => {
    waterfallTimeoutsRef.current.forEach(id => window.clearTimeout(id));
    waterfallTimeoutsRef.current = [];
  }, []);

  // Game statistics
  const [monstersDefeated, setMonstersDefeated] = useState(0);
  const [totalDamageTaken, setTotalDamageTaken] = useState(0);
  const [totalHealed, setTotalHealed] = useState(0);
  const [deckViewerOpen, setDeckViewerOpen] = useState(false);
  const [discardedCards, setDiscardedCards] = useState<GameCardData[]>([]);
  const [waveDiscardCount, setWaveDiscardCount] = useState(0);
  const [handCards, setHandCards] = useState<GameCardData[]>([]); // Hand system - max 7 cards
  const deletableCardCount = handCards.length + backpackItems.length;
  const canDeleteCardInShop = !shopDeleteUsed && deletableCardCount > 0;
  const shopDeleteDisabledReason = shopDeleteUsed
    ? '本次商店的删牌机会已用完。'
    : deletableCardCount === 0
      ? '当前没有可以删除的卡牌。'
      : undefined;
  const [isDraggingToHand, setIsDraggingToHand] = useState(false); // Show hand acquisition zone
  const [isDraggingFromDungeon, setIsDraggingFromDungeon] = useState(false); // Track if dragging from dungeon
  const [permanentSkills, setPermanentSkills] = useState<string[]>([]); // Track permanent skill effects
  const [tempShield, setTempShield] = useState(0); // Temporary shield from skills
  const [classDeck, setClassDeck] = useState<GameCardData[]>([]); // Class deck cards
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [currentEventCard, setCurrentEventCard] = useState<GameCardData | null>(null);
  const [permanentMaxHpBonus, setPermanentMaxHpBonus] = useState(0);
  const [permanentSpellDamageBonus, setPermanentSpellDamageBonus] = useState(0);
  const [eventDiceModal, setEventDiceModal] = useState<EventDiceModalState | null>(null);
  const [eventDiceRollKey, setEventDiceRollKey] = useState(0);
  const eventDiceResolverRef = useRef<(entry: EventDiceRange | null) => void>(null);
  const [equipmentPrompt, setEquipmentPrompt] = useState<EquipmentPromptState | null>(null);
  const equipmentPromptResolverRef = useRef<(slot: EquipmentSlotId | null) => void>(null);
  const [eventTransformState, setEventTransformState] = useState<EventTransformState | null>(null);
  const [graveyardDiscoverState, setGraveyardDiscoverState] = useState<GameCardData[] | null>(null);
  const graveyardDiscoverResolverRef = useRef<((card: GameCardData | null) => void) | null>(null);
  
  // Hero class system state
  const [heroClass] = useState<'knight' | 'mage' | 'rogue'>('knight'); // Default to Knight
  const [classCardsInHand, setClassCardsInHand] = useState<KnightCardData[]>([]);
  const [selectedHeroSkill, setSelectedHeroSkill] = useState<string | null>(null); // Selected Knight skill
  const [showSkillSelection, setShowSkillSelection] = useState(true); // Show skill selection modal on game start
  const [resolvingDungeonCardId, setResolvingDungeonCardId] = useState<string | null>(null);
  const eventResolutionRef = useRef<{ cardId: string | null; source: 'dungeon' | 'hand' | null }>({ cardId: null, source: null });
  
  // Card Details Modal State
  const [selectedCard, setSelectedCard] = useState<GameCardData | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);

  // Knight-specific buffs and states
  const [nextWeaponBonus, setNextWeaponBonus] = useState(0); // Temporary weapon bonus
  const [nextShieldBonus, setNextShieldBonus] = useState(0); // Temporary shield bonus
  const [weaponMasterBonus, setWeaponMasterBonus] = useState(0); // Permanent weapon bonus
  const [shieldMasterBonus, setShieldMasterBonus] = useState(0); // Permanent shield bonus
  const [vampiricNextAttack, setVampiricNextAttack] = useState(false); // Next attack heals
  const [unbreakableNext, setUnbreakableNext] = useState(false); // Next equipment won't break
  const [defensiveStanceActive, setDefensiveStanceActive] = useState(false); // Damage reduction this turn
  const [combatState, setCombatState] = useState<CombatState>(initialCombatState);
  const [swordVectors, setSwordVectors] = useState<Record<string, SwordVector>>({});
  const [equipmentSlotBonuses, setEquipmentSlotBonuses] = useState<EquipmentSlotBonusState>(() => createEmptySlotBonusState());
  const [heroSkillUsedThisWave, setHeroSkillUsedThisWave] = useState(false);
  const [pendingHeroSkillAction, setPendingHeroSkillAction] = useState<PendingHeroSkillAction | null>(null);
  const [pendingMagicAction, setPendingMagicAction] = useState<PendingMagicAction | null>(null);
  const [pendingPotionAction, setPendingPotionAction] = useState<PendingPotionAction | null>(null);
  const [heroSkillBanner, setHeroSkillBanner] = useState<string | null>(null);
  const cellWrapperClass = "flex w-full h-full min-w-0 min-h-0";
  const cellInnerClass = "flex w-full h-full dh-grid-cell";
  const updateHeroRowDropHighlight = useCallback((card: GameCardData | null) => {
    setHeroRowDropState(isHeroRowHighlightCard(card) ? card.type : null);
  }, [setHeroRowDropState]);
  const waterfallActive = waterfallAnimation.isActive;
  const selectedHeroSkillDef = useMemo<HeroSkillDefinition | null>(
    () => getHeroSkillById(selectedHeroSkill as HeroSkillId | null | undefined),
    [selectedHeroSkill],
  );

  useEffect(() => {
    if (!graveyardDiscoverState && graveyardDiscoverResolverRef.current) {
      graveyardDiscoverResolverRef.current(null);
      graveyardDiscoverResolverRef.current = null;
    }
  }, [graveyardDiscoverState]);

  const resetHeroSkillForNewWave = useCallback(() => {
    setHeroSkillUsedThisWave(false);
    setPendingHeroSkillAction(null);
    setHeroSkillBanner(null);
    setPendingMagicAction(null);
    setPendingPotionAction(null);
  }, []);
  useEffect(() => {
    resetHeroSkillForNewWave();
  }, [selectedHeroSkill, resetHeroSkillForNewWave]);
  const heroFrameRef = useRef<HTMLDivElement | null>(null);
  const updateHeroFrameBounds = useCallback(() => {
    heroFrameBoundsRef.current = heroFrameRef.current
      ? heroFrameRef.current.getBoundingClientRect()
      : null;
  }, []);
  const [heroFrameMetrics, setHeroFrameMetrics] = useState({
    padding: 18,
    border: 5,
    ring: 8,
    shadow: 38,
  });
  useLayoutEffect(() => {
    const target = heroFrameRef.current;
    if (!target) return;
    const computeMetrics = () => {
      const width = target.offsetWidth || 0;
      const padding = Math.max(16, Math.min(38, width * 0.019));
      const border = Math.max(2.5, padding * 0.32);
      const ring = Math.max(4, padding * 0.5);
      const shadow = Math.max(24, padding * 3.5);
      setHeroFrameMetrics(prev => {
        if (
          Math.abs(prev.padding - padding) < 0.5 &&
          Math.abs(prev.border - border) < 0.5 &&
          Math.abs(prev.ring - ring) < 0.5 &&
          Math.abs(prev.shadow - shadow) < 0.5
        ) {
          return prev;
        }
        return { padding, border, ring, shadow };
      });
    };
    computeMetrics();
    const resizeObserver = new ResizeObserver(computeMetrics);
    resizeObserver.observe(target);
    return () => resizeObserver.disconnect();
  }, []);
  useLayoutEffect(() => {
    updateHeroFrameBounds();
  }, [heroFramePosition, updateHeroFrameBounds]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => updateHeroFrameBounds();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateHeroFrameBounds]);
  const startDragSession = useCallback(() => {
    setIsDragSessionActive(true);
  }, []);
  const heroFrameHighlightActive = Boolean(heroRowDropState || heroRowFrameDropActive);
  const heroFrameStyle = useMemo<CSSProperties>(() => ({
    borderWidth: `${heroFrameMetrics.border}px`,
    borderStyle: 'solid',
    borderColor: heroFrameHighlightActive ? 'rgba(139,92,246,0.4)' : 'rgba(96,101,129,0.55)',
    boxShadow: heroFrameHighlightActive
      ? `0 0 ${heroFrameMetrics.shadow * 1.1}px rgba(139,92,246,0.55)`
      : `0 0 ${heroFrameMetrics.shadow}px rgba(2,6,23,0.65)`,
    padding: `${heroFrameMetrics.padding}px`,
    outlineWidth: `${heroFrameMetrics.ring}px`,
    outlineStyle: 'solid',
    outlineColor: heroFrameHighlightActive ? 'rgba(139,92,246,0.55)' : 'rgba(99,102,241,0.28)',
    outlineOffset: `-${heroFrameMetrics.border * 0.6}px`,
  }), [heroFrameMetrics, heroFrameHighlightActive]);
  const heroFrameOverlayStyle = useMemo<CSSProperties>(() => {
    if (!heroFramePosition) {
      return { opacity: 0 };
    }
    const gap = heroFrameMetrics.padding;
    return {
      ...heroFrameStyle,
      top: `${heroFramePosition.top - gap}px`,
      left: `${heroFramePosition.left - gap}px`,
      width: `${heroFramePosition.width + gap * 2}px`,
      height: `${heroFramePosition.height + gap * 2}px`,
      opacity: 1,
      pointerEvents: 'none',
      zIndex: heroFrameHighlightActive ? 25 : 5,
    };
  }, [heroFrameMetrics.padding, heroFramePosition, heroFrameStyle, heroFrameHighlightActive]);
  const combatPanelStyle = useMemo<CSSProperties>(
    () =>
      ({
        '--combat-panel-width': 'clamp(135px, 11vw, 170px)',
        width: 'min(var(--combat-panel-width), calc(100% - 1.5rem))',
      }) as CSSProperties,
    [],
  );

  const resetDragState = useCallback(() => {
    setDraggedCard(null);
    setDraggedEquipment(null);
    setDraggedCardSource(null);
    setIsDraggingFromDungeon(false);
    setIsDraggingToHand(false);
    setHeroRowDropState(null);
    setIsDragSessionActive(false);
    heroFrameDropIntentRef.current = false;
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    if (!isDragSessionActive) {
      return;
    }
    const handleGlobalDragEnd = () => {
      resetDragState();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        resetDragState();
      }
    };
    window.addEventListener('dragend', handleGlobalDragEnd);
    window.addEventListener('mouseup', handleGlobalDragEnd);
    window.addEventListener('touchend', handleGlobalDragEnd);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('dragend', handleGlobalDragEnd);
      window.removeEventListener('mouseup', handleGlobalDragEnd);
      window.removeEventListener('touchend', handleGlobalDragEnd);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isDragSessionActive, resetDragState]);

  const startEventResolution = (cardId: string | null, source: 'dungeon' | 'hand') => {
    eventResolutionRef.current = { cardId, source };
    if (source === 'dungeon' && cardId) {
      setResolvingDungeonCardId(cardId);
    }
  };

  const handleCardClick = (card: GameCardData) => {
    setSelectedCard(card);
    setDetailsModalOpen(true);
  };

  // Function to damage a monster and update its HP layers
  const damageMonster = (monster: GameCardData, damage: number): GameCardData => {
    if (!monster.hp || !monster.maxHp) {
      // Fallback for old monsters or simple ones
      return {
        ...monster,
        hp: Math.max(0, (monster.hp || monster.value) - damage),
        value: Math.max(0, (monster.hp || monster.value) - damage)
      };
    }
    
    const currentHp = monster.hp;
    let newHp = currentHp - damage;
    let currentLayer = monster.currentLayer || 1;
    
    if (newHp <= 0) {
      // Damage exceeded HP, reduce fury layer
      if (currentLayer > 0) {
        currentLayer -= 1;
        // Reset HP to max for next layer if still alive
        newHp = currentLayer > 0 ? monster.maxHp : 0;
      }
    }
    
    return {
      ...monster,
      hp: newHp,
      currentLayer: currentLayer,
    };
  };

  const dealDamageToMonster = (
    monster: GameCardData,
    damage: number,
    options?: { animationDelay?: number; pulses?: number },
  ) => {
    if (damage <= 0) {
      return;
    }
    const updatedMonster = damageMonster(monster, damage);
    const baseDelay = options?.animationDelay ?? 0;
    const pulses = Math.max(1, options?.pulses ?? 1);
    for (let i = 0; i < pulses; i += 1) {
      triggerMonsterBleedAnimation(monster.id, baseDelay + i * Math.floor(COMBAT_ANIMATION_STAGGER / 2));
    }
    const monsterDefeated =
      (updatedMonster.currentLayer ?? 0) <= 0 || (updatedMonster.hp ?? 0) <= 0;
    if (monsterDefeated) {
      handleMonsterDefeated(monster);
    } else {
      updateMonsterCard(monster.id, () => updatedMonster);
    }
  };

  const getActiveCombatMonster = (): GameCardData | null => {
    const engaged = getEngagedMonsterCards();
    return engaged.length > 0 ? engaged[0] : null;
  };

  const finishCombat = () => {
    setCombatState(initialCombatState);
  };

  const handleMonsterDefeated = (monster: GameCardData) => {
    const pendingTimeouts = monsterBleedTimeoutsRef.current[monster.id];
    if (pendingTimeouts?.length) {
      pendingTimeouts.forEach(timeout => clearTimeout(timeout));
      delete monsterBleedTimeoutsRef.current[monster.id];
    }
    setMonsterBleedStates(prev => {
      if (!prev[monster.id]) {
        return prev;
      }
      const next = { ...prev };
      delete next[monster.id];
      return next;
    });
    setMonstersDefeated(prev => prev + 1);
    addToGraveyard(monster);
    removeCard(monster.id, false);
    setCombatState(prev => {
      const remaining = prev.engagedMonsterIds.filter(id => id !== monster.id);
      const { [monster.id]: _removedDamage, ...restDamage } = prev.heroDamageThisTurn;
      const pendingBlock =
        prev.pendingBlock?.monsterId === monster.id ? null : prev.pendingBlock;
      const queue = prev.monsterAttackQueue.filter(id => id !== monster.id);

      if (remaining.length === 0) {
        return { ...initialCombatState };
      }

      return {
        ...prev,
        engagedMonsterIds: remaining,
        heroDamageThisTurn: restDamage,
        pendingBlock,
        monsterAttackQueue: queue,
      };
    });
  };

  const updateMonsterCard = (monsterId: string, updater: (monster: GameCardData) => GameCardData) => {
    setActiveCards(prev =>
      prev.map(card => (card?.id === monsterId ? updater(card) : card))
    );
  };

  const decrementMonsterFury = (monster: GameCardData) => {
    const currentLayer = monster.currentLayer ?? monster.hpLayers ?? monster.fury ?? 1;
    const nextLayer = currentLayer - 1;

    if (nextLayer <= 0) {
      handleMonsterDefeated(monster);
      return;
    }

    updateMonsterCard(monster.id, (card) => ({
      ...card,
      currentLayer: nextLayer,
      hp: card.maxHp,
    }));
  };

  const resetHeroTurnUsage = () => {
    setCombatState(prev => ({
      ...prev,
      heroAttacksThisTurn: {
        equipmentSlot1: false,
        equipmentSlot2: false,
      },
      heroAttacksRemaining: 2,
      heroDamageThisTurn: {},
    }));
  };

  const beginCombat = (monster: GameCardData, initiator: CombatInitiator) => {
    setCombatState(prev => {
      const alreadyEngaged = prev.engagedMonsterIds.includes(monster.id);
      const nextEngaged = alreadyEngaged ? prev.engagedMonsterIds : [...prev.engagedMonsterIds, monster.id];

      if (prev.engagedMonsterIds.length === 0) {
        return {
          ...prev,
          engagedMonsterIds: nextEngaged,
          initiator,
          currentTurn: initiator,
          heroAttacksThisTurn: {
            equipmentSlot1: false,
            equipmentSlot2: false,
          },
          heroAttacksRemaining: 2,
          heroDamageThisTurn: {},
          monsterAttackQueue: initiator === 'monster' ? [...nextEngaged] : [],
          pendingBlock: null,
        };
      }

      return {
        ...prev,
        engagedMonsterIds: nextEngaged,
        initiator: prev.initiator ?? initiator,
        monsterAttackQueue:
          initiator === 'monster'
            ? [...prev.monsterAttackQueue, monster.id]
            : prev.monsterAttackQueue,
      };
    });
  };

  const applyHeroKillEffects = (monsterHp: number) => {
    if (vampiricNextAttack) {
      const healAmount = Math.floor(monsterHp / 2);
      if (healAmount > 0) {
        healHero(healAmount);
      }
      setVampiricNextAttack(false);
    }
  };

  const performHeroAttack = (slotId: EquipmentSlotId, targetMonster: GameCardData) => {
    if (combatState.currentTurn !== 'hero') {
      return;
    }

    if (combatState.heroAttacksThisTurn[slotId]) {
      return;
    }

    if (combatState.heroAttacksRemaining <= 0) {
      return;
    }

    const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
    if (!slotItem || slotItem.type !== 'weapon') {
      return;
    }

    const slotDamageBonus = getEquipmentSlotBonus(slotId, 'damage');
    const appliedNextBonus = nextWeaponBonus;
    const balanceBonus = amuletEffects.hasBalance && slotId === 'equipmentSlot1' ? BALANCE_ATTACK_BONUS : 0;
    const flashPenalty = amuletEffects.hasFlash ? FLASH_ATTACK_PENALTY : 0;
    const baseDamage = Math.max(
      0,
      slotItem.value + attackBonus + slotDamageBonus + appliedNextBonus + balanceBonus - flashPenalty,
    );
    const attackIterations = amuletEffects.hasFlash ? 2 : 1;

    if (appliedNextBonus > 0) {
      setNextWeaponBonus(0);
    }

    let workingMonster = targetMonster;
    let monsterDefeated = false;
    let totalRecordedDamage = 0;
    let overflowHealing = 0;
    let strengthHits = 0;

    for (let i = 0; i < attackIterations; i += 1) {
      const iterationDelay = i * COMBAT_ANIMATION_STAGGER;
      triggerWeaponSwingAnimation(slotId, iterationDelay, { echoes: 2 });
      totalRecordedDamage += baseDamage;
      if (amuletEffects.hasStrength) {
        strengthHits += 1;
      }
      if (baseDamage <= 0) {
        continue;
      }

      const monsterHpBefore = workingMonster.hp ?? workingMonster.value;
      const updatedMonster = damageMonster(workingMonster, baseDamage);
      triggerMonsterBleedAnimation(targetMonster.id, iterationDelay);
      triggerMonsterBleedAnimation(
        targetMonster.id,
        iterationDelay + Math.floor(COMBAT_ANIMATION_STAGGER / 2),
      );

      if (amuletEffects.hasLife) {
        const overflow = Math.max(0, baseDamage - monsterHpBefore);
        overflowHealing += overflow;
      }

      workingMonster = updatedMonster;
      const remainingLayers = updatedMonster.currentLayer ?? 1;

      if (remainingLayers <= 0) {
        applyHeroKillEffects(monsterHpBefore);
        handleMonsterDefeated(targetMonster);
        monsterDefeated = true;
        break;
      }
    }

    if (overflowHealing > 0) {
      healHero(overflowHealing);
    }

    if (amuletEffects.hasStrength && strengthHits > 0) {
      applyDamage(strengthHits * STRENGTH_SELF_DAMAGE);
    }

    // Track damage dealt for fury checks
    setCombatState(prev => ({
      ...prev,
      engagedMonsterIds: prev.engagedMonsterIds.includes(targetMonster.id)
        ? prev.engagedMonsterIds
        : [...prev.engagedMonsterIds, targetMonster.id],
      heroAttacksRemaining: Math.max(0, prev.heroAttacksRemaining - 1),
      heroAttacksThisTurn: {
        ...prev.heroAttacksThisTurn,
        [slotId]: true,
      },
      heroDamageThisTurn: {
        ...prev.heroDamageThisTurn,
        [targetMonster.id]: (prev.heroDamageThisTurn[targetMonster.id] || 0) + totalRecordedDamage,
      },
    }));

    const weaponDurability = slotItem.durability ?? 1;
    if (weaponDurability <= 1 && !unbreakableNext) {
      addToGraveyard({ ...slotItem });
      clearEquipmentSlotById(slotId);
    } else {
      const safeDurability = weaponDurability <= 1 ? weaponDurability : weaponDurability - 1;
      setEquipmentSlotById(slotId, {
        ...slotItem,
        durability: unbreakableNext && weaponDurability <= 1 ? weaponDurability : safeDurability,
      });
      if (weaponDurability <= 1 && unbreakableNext) {
        setUnbreakableNext(false);
      }
    }

    if (!monsterDefeated) {
      updateMonsterCard(targetMonster.id, () => workingMonster);
    }
  };

  const endHeroTurn = () => {
    const engagedMonsters = getEngagedMonsterCards();
    if (engagedMonsters.length === 0) {
      finishCombat();
      return;
    }

    engagedMonsters.forEach(monster => {
      updateMonsterCard(monster.id, (card) => {
        const fullHp = card.maxHp ?? monster.maxHp ?? card.hp ?? monster.hp ?? 0;
        return {
          ...card,
          hp: fullHp,
        };
      });
    });

    drawFromBackpackToHand();

    setCombatState(prev => ({
      ...prev,
      currentTurn: 'monster',
      heroAttacksThisTurn: {
        equipmentSlot1: false,
        equipmentSlot2: false,
      },
      heroAttacksRemaining: 2,
      heroDamageThisTurn: {},
      monsterAttackQueue: engagedMonsters.map(monster => monster.id),
      pendingBlock: null,
    }));
  };

  const resolveBlockChoice = (target: BlockTarget) => {
    if (!combatState.pendingBlock) {
      return;
    }

    const pendingBlock = combatState.pendingBlock;
    const monster = activeCards.find(card => card?.id === pendingBlock.monsterId);
    if (!monster) {
      setCombatState(prev => ({
        ...prev,
        pendingBlock: null,
      }));
      advanceMonsterTurn();
      return;
    }

    let remainingDamage = pendingBlock.attackValue;

    if (target !== 'hero') {
      const blockSlotId = target as EquipmentSlotId;
      const slotItem = blockSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (slotItem && slotItem.type === 'shield') {
        const slotShieldBonus = getEquipmentSlotBonus(blockSlotId, 'shield');
        const balanceBonus = amuletEffects.hasBalance && blockSlotId === 'equipmentSlot2' ? BALANCE_SHIELD_BONUS : 0;
        const shieldValue = slotItem.value + defenseBonus + slotShieldBonus + balanceBonus;
        triggerShieldBlockAnimation(blockSlotId);
        remainingDamage = Math.max(0, remainingDamage - shieldValue);

        const shieldDurability = slotItem.durability ?? 1;
        if (shieldDurability <= 1 && !unbreakableNext) {
          addToGraveyard({ ...slotItem });
          clearEquipmentSlotById(blockSlotId);
        } else {
          const nextDurability = shieldDurability <= 1 ? shieldDurability : shieldDurability - 1;
          setEquipmentSlotById(blockSlotId, {
            ...slotItem,
            durability: unbreakableNext && shieldDurability <= 1 ? shieldDurability : nextDurability,
          });
          if (shieldDurability <= 1 && unbreakableNext) {
            setUnbreakableNext(false);
          }
        }
      }
    }

    if (remainingDamage > 0) {
      applyDamage(remainingDamage, 'combat');
    }

    decrementMonsterFury(monster);

    setCombatState(prev => ({
      ...prev,
      pendingBlock: null,
    }));
  };

  const maxHp =
    INITIAL_HP +
    amuletEffects.aura.maxHp +
    permanentMaxHpBonus +
    (permanentSkills.includes('Iron Will') ? 3 : 0) +
    (selectedHeroSkillDef?.initialMaxHpBonus ?? 0);
  const attackBonus = amuletEffects.aura.attack + 
    (permanentSkills.includes('Weapon Master') ? 1 : 0) +
    weaponMasterBonus + // Knight class bonus to all weapons
    (permanentSkills.includes('Berserker Rage') ? Math.floor((maxHp - hp) / 2) : 0) + // +1 per 2 HP missing
    (permanentSkills.includes('Battle Frenzy') && hp < maxHp / 2 ? 2 : 0); // Bonus when low HP
  const defenseBonus = amuletEffects.aura.defense + 
    (permanentSkills.includes('Iron Skin') ? 1 : 0) +
    shieldMasterBonus + // Knight class bonus to all shields
    (defensiveStanceActive ? 1 : 0); // Defensive stance damage reduction
  const getSpellDamage = useCallback(
    (baseDamage: number) => Math.max(0, baseDamage + permanentSpellDamageBonus),
    [permanentSpellDamageBonus],
  );
  const healHero = useCallback(
    (baseAmount: number) => {
      const multiplier = amuletEffects.hasHeal ? 2 : 1;
      const adjustedAmount = Math.max(0, Math.floor(baseAmount * multiplier));
      if (adjustedAmount <= 0) {
        return 0;
      }

      let actualHeal = 0;
      setHp(prev => {
        const newHp = Math.min(maxHp, prev + adjustedAmount);
        actualHeal = newHp - prev;
        return newHp;
      });

      if (actualHeal > 0) {
        setHealing(true);
        setTimeout(() => setHealing(false), 500);
        setTotalHealed(prev => prev + actualHeal);
      }

      return actualHeal;
    },
    [amuletEffects.hasHeal, maxHp],
  );
  
  // Auto-draw mechanism - draw from top of backpack to hand
  const drawFromBackpackToHand = (): GameCardData | null => {
    if (handCards.length >= 7) {
      return null; // Hand full
    }

    let drawnCard: GameCardData | null = null;
    setBackpackItems(prev => {
      if (prev.length === 0) {
        return prev; // Backpack empty
      }
      const next = [...prev];
      drawnCard = next.shift() ?? null;
      return next;
    });

    if (!drawnCard) {
      return null;
    }

    const animated = triggerBackpackHandFlight(drawnCard);
    if (!animated) {
      setHandCards(prev => [...prev, drawnCard!]);
    }
    return drawnCard;
  };

  const returnCardToBackpackBottom = useCallback(
    (card: GameCardData) => {
      setBackpackItems(prev => {
        const { fromSlot, ...cardData } = card as GameCardData & { fromSlot?: DragOrigin };
        const filtered = prev.filter(existing => existing.id !== cardData.id);
        const next = [...filtered, { ...cardData }];
        if (next.length > backpackCapacity) {
          const overflow = next.length - backpackCapacity;
          const kept = next.slice(overflow);
          next.slice(0, overflow).forEach(overflowCard => addToGraveyard(overflowCard));
          return kept;
        }
        return next;
      });
      setCanDrawFromBackpack(true);
    },
    [addToGraveyard, backpackCapacity, setCanDrawFromBackpack],
  );

  const drawClassCardsToBackpack = useCallback(
    (count: number, source: string, filter?: (card: GameCardData) => boolean): GameCardData[] => {
      if (count <= 0) return [];
      if (classDeck.length === 0) return [];

      const availableSlots = backpackCapacity - backpackItems.length;
      if (availableSlots <= 0) return [];

      const filteredPool = filter ? classDeck.filter(filter) : classDeck;
      const pool = filteredPool.length > 0 ? filteredPool : classDeck;
      if (pool.length === 0) return [];

      const drawLimit = Math.min(count, pool.length, availableSlots);
      if (drawLimit <= 0) return [];

      const shuffledPool = [...pool].sort(() => Math.random() - 0.5);
      const drawnCards = shuffledPool.slice(0, drawLimit);
      const drawnIds = new Set(drawnCards.map(card => card.id));

      setClassDeck(prev => prev.filter(card => !drawnIds.has(card.id)));
      setBackpackItems(prev => [...drawnCards, ...prev]);
      setCanDrawFromBackpack(true);

      if (DEV_MODE) {
        console.debug('[ClassDeckDraw]', {
          source,
          requested: count,
          delivered: drawLimit,
          filtered: Boolean(filter),
          filterFallback: Boolean(filter && filteredPool.length === 0),
        });
      }

      return drawnCards;
    },
    [backpackItems.length, classDeck],
  );

  const returnCardsToClassDeck = useCallback((cards: GameCardData[]) => {
    if (!cards.length) return;
    setClassDeck(prev => [...prev, ...cards].sort(() => Math.random() - 0.5));
  }, []);

  const beginDiscoverFlow = useCallback(
    (source: string): boolean => {
      if (backpackItems.length >= backpackCapacity) {
        if (DEV_MODE) {
          console.debug('[Discover] Backpack full, cannot start discover', { source });
        }
        return false;
      }

      if (classDeck.length === 0) {
        if (DEV_MODE) {
          console.debug('[Discover] Class deck empty, cannot start discover', { source });
        }
        return false;
      }

      const available = Math.min(3, classDeck.length);
      const shuffledDeck = [...classDeck].sort(() => Math.random() - 0.5);
      const options = shuffledDeck.slice(0, available);
      const optionIds = new Set(options.map(card => card.id));

      setClassDeck(prev => prev.filter(card => !optionIds.has(card.id)));
      setDiscoverOptions(options);
      setDiscoverModalOpen(true);

      if (DEV_MODE) {
        console.debug('[Discover] Started discover flow', { source, available, optionIds: Array.from(optionIds) });
      }

      return true;
    },
    [backpackItems.length, classDeck],
  );

  const generateShopOfferings = useCallback((): ShopOffering[] => {
    if (!classDeck.length) {
      return [];
    }

    const usedIds = new Set<string>();
    const offerings: ShopOffering[] = [];
    const reducedShopSlots = Math.max(0, SHOP_MAX_OFFERINGS - 1);
    const maxOfferings = Math.max(SHOP_REQUIRED_TYPES.length, reducedShopSlots + shopLevel);

    const takeRandomCard = (filter?: (card: GameCardData) => boolean): GameCardData | null => {
      const pool = classDeck.filter(
        card => !usedIds.has(card.id) && (!filter || filter(card)),
      );
      if (!pool.length) {
        return null;
      }
      const picked = pool[Math.floor(Math.random() * pool.length)];
      usedIds.add(picked.id);
      return picked;
    };

    SHOP_REQUIRED_TYPES.forEach(type => {
      const picked = takeRandomCard(card => card.type === type);
      if (picked) {
        offerings.push({ card: picked, price: getShopPrice(picked, shopLevel), sold: false });
      }
    });

    while (offerings.length < maxOfferings) {
      const picked = takeRandomCard();
      if (!picked) {
        break;
      }
      offerings.push({ card: picked, price: getShopPrice(picked, shopLevel), sold: false });
    }

    return offerings;
  }, [classDeck, shopLevel]);

  const startShopFlow = useCallback(
    (eventCard: GameCardData | null): boolean => {
      if (!eventCard) {
        return false;
      }

      if (backpackItems.length >= backpackCapacity) {
        if (DEV_MODE) {
          console.debug('[Shop] Cannot open shop, backpack full');
        }
        return false;
      }

      const offerings = generateShopOfferings();
      if (!offerings.length) {
        if (DEV_MODE) {
          console.debug('[Shop] Cannot open shop, no class cards available');
        }
        return false;
      }

      setShopOfferings(offerings);
      setShopSourceEvent(eventCard);
      setShopDeleteUsed(false);
      setDeleteModalOpen(false);
      setShopModalOpen(true);
      setEventModalOpen(false);
      return true;
    },
    [backpackItems.length, generateShopOfferings],
  );


  const updateClassDeckFlightAnimation = useCallback((timestamp: number) => {
    const flights = classDeckFlightsRef.current;
    if (!flights.length) {
      classDeckFlightAnimationRef.current = null;
      return;
    }

    let hasActive = false;
    const nextFlights = flights
      .map(flight => {
        const elapsed = timestamp - flight.startTime;
        if (elapsed < 0) {
          hasActive = true;
          return { ...flight, progress: 0 };
        }
        const progress = clamp(elapsed / flight.duration);
        if (progress < 1) {
          hasActive = true;
        }
        return { ...flight, progress };
      })
      .filter(flight => flight.progress < 1);

    classDeckFlightsRef.current = nextFlights;
    setClassDeckFlights(nextFlights);

    if (hasActive && nextFlights.length > 0) {
      classDeckFlightAnimationRef.current = window.requestAnimationFrame(updateClassDeckFlightAnimation);
    } else {
      classDeckFlightAnimationRef.current = null;
    }
  }, []);

  const startClassDeckFlightAnimation = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (classDeckFlightAnimationRef.current !== null) return;
    classDeckFlightAnimationRef.current = window.requestAnimationFrame(updateClassDeckFlightAnimation);
  }, [updateClassDeckFlightAnimation]);

  const triggerClassDeckFlight = useCallback((cards: GameCardData[]) => {
    if (!cards.length || typeof window === 'undefined') return;
    const boardEl = boardRef.current;
    const classDeckCell = heroRowCellRefs.current[HERO_ROW_CLASS_DECK_INDEX];
    const backpackCell = heroRowCellRefs.current[HERO_ROW_BACKPACK_INDEX];

    if (!boardEl || !classDeckCell || !backpackCell) return;

    const boardRect = boardEl.getBoundingClientRect();
    const classRect = classDeckCell.getBoundingClientRect();
    const backpackRect = backpackCell.getBoundingClientRect();
    const baseTime = performance.now();

    const newFlights = cards.map((card, index) => {
      const id = `class-flight-${card.id}-${baseTime}-${index}`;
      const start: Point = {
        x: classRect.left + classRect.width / 2 - boardRect.left + (Math.random() - 0.5) * 26,
        y: classRect.top + classRect.height / 2 - boardRect.top + (Math.random() - 0.5) * 18,
      };
      const end: Point = {
        x: backpackRect.left + backpackRect.width / 2 - boardRect.left + (Math.random() - 0.5) * 18,
        y: backpackRect.top + backpackRect.height / 2 - boardRect.top + (Math.random() - 0.5) * 16,
      };
      return {
        id,
        card,
        start,
        end,
        startTime: baseTime + index * CLASS_FLIGHT_STAGGER,
        duration: CLASS_FLIGHT_BASE_DURATION + Math.random() * CLASS_FLIGHT_VARIANCE,
        progress: 0,
        arcHeight: CLASS_FLIGHT_ARC_MIN + Math.random() * CLASS_FLIGHT_ARC_VARIANCE,
      };
    });

    classDeckFlightsRef.current = [...classDeckFlightsRef.current, ...newFlights];
    setClassDeckFlights(classDeckFlightsRef.current);
    startClassDeckFlightAnimation();
  }, [startClassDeckFlightAnimation]);

  const handleDiscoverFallback = useCallback(() => {
    const fallback = drawClassCardsToBackpack(1, 'discover-fallback');
    if (fallback.length) {
      triggerClassDeckFlight(fallback);
    }
  }, [drawClassCardsToBackpack, triggerClassDeckFlight]);

  const requestDiceOutcome = useCallback(
    (config: { title: string; subtitle?: string; entries: EventDiceRange[] }) => {
      return new Promise<EventDiceRange | null>(resolve => {
        eventDiceResolverRef.current = resolve;
        setEventDiceModal({
          title: config.title,
          subtitle: config.subtitle,
          entries: config.entries,
          rolledValue: null,
          highlightedId: null,
        });
        setEventDiceRollKey(key => key + 1);
      });
    },
    [],
  );

  const handleDiceRollResult = useCallback((value: number) => {
    setEventDiceModal(prev => {
      if (!prev) return prev;
      const matched =
        prev.entries.find(entry => value >= entry.range[0] && value <= entry.range[1]) ??
        prev.entries[prev.entries.length - 1] ??
        null;

      window.setTimeout(() => {
        eventDiceResolverRef.current?.(matched ?? null);
        eventDiceResolverRef.current = null;
        setEventDiceModal(null);
      }, 900);

      return {
        ...prev,
        rolledValue: value,
        highlightedId: matched?.id ?? null,
      };
    });
  }, []);

  const cancelDiceModal = useCallback(() => {
    if (eventDiceResolverRef.current) {
      eventDiceResolverRef.current(null);
      eventDiceResolverRef.current = null;
    }
    setEventDiceModal(null);
  }, []);

  const requestEquipmentSelection = useCallback(
    (prompt: EquipmentPromptState): Promise<EquipmentSlotId | null> => {
      return new Promise(resolve => {
        if (!equipmentSlot1 && !equipmentSlot2) {
          resolve(null);
          return;
        }
        equipmentPromptResolverRef.current = resolve;
        setEquipmentPrompt(prompt);
      });
    },
    [equipmentSlot1, equipmentSlot2],
  );

  const handleEquipmentPromptSelection = useCallback((slot: EquipmentSlotId) => {
    equipmentPromptResolverRef.current?.(slot);
    equipmentPromptResolverRef.current = null;
    setEquipmentPrompt(null);
  }, []);

  const cancelEquipmentPrompt = useCallback(() => {
    if (equipmentPromptResolverRef.current) {
      equipmentPromptResolverRef.current(null);
      equipmentPromptResolverRef.current = null;
    }
    setEquipmentPrompt(null);
  }, []);

  const updateBackpackHandFlightAnimation = useCallback((timestamp: number) => {
    const flights = backpackHandFlightsRef.current;
    if (!flights.length) {
      backpackHandFlightAnimationRef.current = null;
      return;
    }

    let hasActive = false;
    const completedCards: GameCardData[] = [];

    const nextFlights = flights
      .map(flight => {
        const elapsed = timestamp - flight.startTime;
        if (elapsed < 0) {
          hasActive = true;
          return { ...flight, progress: 0 };
        }
        const progress = clamp(elapsed / flight.duration);
        if (progress < 1) {
          hasActive = true;
          return { ...flight, progress };
        }
        completedCards.push(flight.card);
        return { ...flight, progress: 1 };
      })
      .filter(flight => flight.progress < 1);

    backpackHandFlightsRef.current = nextFlights;
    setBackpackHandFlights(nextFlights);

    if (completedCards.length) {
      setHandCards(prev => [...prev, ...completedCards]);
    }

    if (hasActive && nextFlights.length > 0) {
      backpackHandFlightAnimationRef.current = window.requestAnimationFrame(updateBackpackHandFlightAnimation);
    } else {
      backpackHandFlightAnimationRef.current = null;
    }
  }, []);

  const startBackpackHandFlightAnimation = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (backpackHandFlightAnimationRef.current !== null) return;
    backpackHandFlightAnimationRef.current = window.requestAnimationFrame(updateBackpackHandFlightAnimation);
  }, [updateBackpackHandFlightAnimation]);

  const triggerBackpackHandFlight = useCallback(
    (card: GameCardData): boolean => {
      if (typeof window === 'undefined') return false;

      const surfaceEl = gameSurfaceRef.current;
      const backpackCell = heroRowCellRefs.current[HERO_ROW_BACKPACK_INDEX];
      const handContainer = handAreaRef.current;

      if (!surfaceEl || !backpackCell || !handContainer) return false;

      const surfaceRect = surfaceEl.getBoundingClientRect();
      const backpackRect = backpackCell.getBoundingClientRect();
      const handRect = handContainer.getBoundingClientRect();
      const baseTime = performance.now();

      const start: Point = {
        x:
          backpackRect.left +
          backpackRect.width / 2 -
          surfaceRect.left +
          (Math.random() - 0.5) * 18,
        y:
          backpackRect.top +
          backpackRect.height / 2 -
          surfaceRect.top +
          (Math.random() - 0.5) * 12,
      };

      const horizontalSpread = Math.min(handRect.width * 0.5, 160);
      const verticalSpread = Math.min(handRect.height * 0.5, 80);

      const end: Point = {
        x:
          handRect.left +
          handRect.width / 2 -
          surfaceRect.left +
          (Math.random() - 0.5) * horizontalSpread,
        y:
          handRect.top +
          handRect.height / 2 -
          surfaceRect.top +
          (Math.random() - 0.5) * verticalSpread,
      };

      const flight: BackpackHandFlight = {
        id: `backpack-flight-${card.id}-${baseTime}`,
        card,
        start,
        end,
        startTime: baseTime,
        duration: BACKPACK_FLIGHT_BASE_DURATION + Math.random() * BACKPACK_FLIGHT_VARIANCE,
        progress: 0,
        arcHeight: BACKPACK_FLIGHT_ARC_MIN + Math.random() * BACKPACK_FLIGHT_ARC_VARIANCE,
      };

      backpackHandFlightsRef.current = [...backpackHandFlightsRef.current, flight];
      setBackpackHandFlights(backpackHandFlightsRef.current);
      startBackpackHandFlightAnimation();

      return true;
    },
    [startBackpackHandFlightAnimation],
  );

  useEffect(() => {
    const snapshot = loadGameState();
    if (snapshot) {
      hydrateGameState(snapshot);
    } else {
      initGame();
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!DEV_MODE || typeof window === 'undefined') {
      return;
    }
    // Developer helper to manually tweak shop level while playtesting.
    (window as any).__adjustShopLevel = adjustShopLevel;
    return () => {
      if ((window as any).__adjustShopLevel === adjustShopLevel) {
        delete (window as any).__adjustShopLevel;
      }
    };
  }, [adjustShopLevel]);

  const persistedState = useMemo<PersistedGameState>(() => {
    return {
      version: 1 as const,
      timestamp: 0,
      hp,
      gold,
      shopLevel,
      monstersDefeated,
      cardsPlayed,
      totalDamageTaken,
      totalHealed,
      previewCards: sanitizeSlotRow(previewCards),
      activeCards: sanitizeSlotRow(activeCards),
      remainingDeck: sanitizeCardList(remainingDeck),
      discardedCards: sanitizeCardList(discardedCards),
      handCards: sanitizeCardList(handCards),
      equipmentSlot1: equipmentSlot1
        ? (sanitizeCardMetadata(equipmentSlot1) as GameCardData)
        : null,
      equipmentSlot2: equipmentSlot2
        ? (sanitizeCardMetadata(equipmentSlot2) as GameCardData)
        : null,
      amuletSlots: sanitizeCardList(amuletSlots),
      backpackItems: sanitizeCardList(backpackItems),
      canDrawFromBackpack,
      classDeck: sanitizeCardList(classDeck),
      classCardsInHand: sanitizeCardList(classCardsInHand),
      selectedHeroSkill,
      showSkillSelection,
      heroVariant,
      permanentSkills: [...permanentSkills],
      equipmentSlotBonuses: {
        equipmentSlot1: { ...equipmentSlotBonuses.equipmentSlot1 },
        equipmentSlot2: { ...equipmentSlotBonuses.equipmentSlot2 },
      },
      weaponMasterBonus,
      shieldMasterBonus,
      gameOver,
      victory,
      permanentMaxHpBonus,
      permanentSpellDamageBonus,
      backpackCapacityModifier,
    };
  }, [
    hp,
    gold,
    shopLevel,
    monstersDefeated,
    cardsPlayed,
    totalDamageTaken,
    totalHealed,
    previewCards,
    activeCards,
    remainingDeck,
    discardedCards,
    handCards,
    equipmentSlot1,
    equipmentSlot2,
    amuletSlots,
    backpackItems,
    canDrawFromBackpack,
    classDeck,
    classCardsInHand,
    selectedHeroSkill,
    showSkillSelection,
    heroVariant,
    permanentSkills,
    equipmentSlotBonuses,
    weaponMasterBonus,
    shieldMasterBonus,
    gameOver,
    victory,
    permanentMaxHpBonus,
    permanentSpellDamageBonus,
    backpackCapacityModifier,
  ]);

  useEffect(() => {
    if (!isHydrated || gameOver) {
      return;
    }
    const serialized = JSON.stringify(persistedState);
    if (lastPersistedStateRef.current === serialized) {
      return;
    }
    lastPersistedStateRef.current = serialized;
    saveGameState(persistedState);
  }, [persistedState, isHydrated, gameOver]);

  useEffect(() => {
    if (!isHydrated || !gameOver) {
      return;
    }
    clearGameState();
    lastPersistedStateRef.current = null;
  }, [gameOver, isHydrated]);

  useEffect(() => {
    return () => {
      clearWaterfallTimeouts();
    };
  }, [clearWaterfallTimeouts]);

  useEffect(() => {
    return () => {
      if (classDeckFlightAnimationRef.current !== null) {
        window.cancelAnimationFrame(classDeckFlightAnimationRef.current);
      }
      if (backpackHandFlightAnimationRef.current !== null) {
        window.cancelAnimationFrame(backpackHandFlightAnimationRef.current);
      }
    };
  }, []);

  const advanceMonsterTurn = useCallback(() => {
    setCombatState(prev => {
      if (prev.currentTurn !== 'monster' || prev.pendingBlock) {
        return prev;
      }

      const queue = [...prev.monsterAttackQueue];
      while (queue.length > 0) {
        const nextId = queue.shift()!;
        const monster = activeCards.find(card => card?.id === nextId);
        if (monster) {
          return {
            ...prev,
            monsterAttackQueue: queue,
            pendingBlock: {
              monsterId: monster.id,
              attackValue: monster.attack ?? monster.value,
              monsterName: monster.name,
            },
          };
        }
      }

      if (prev.engagedMonsterIds.length === 0) {
        return { ...initialCombatState };
      }

      return {
        ...prev,
        currentTurn: 'hero',
        heroAttacksThisTurn: {
          equipmentSlot1: false,
          equipmentSlot2: false,
        },
        heroAttacksRemaining: 2,
        heroDamageThisTurn: {},
        monsterAttackQueue: [],
      };
    });
  }, [activeCards]);

  useEffect(() => {
    if (combatState.currentTurn !== 'monster') return;
    if (combatState.pendingBlock) return;
    advanceMonsterTurn();
  }, [combatState.currentTurn, combatState.pendingBlock, combatState.monsterAttackQueue, advanceMonsterTurn, activeCards]);

  const initGame = () => {
    setCombatState(initialCombatState);
    setHeroVariant(getRandomHero());
    const newDeck = createDeck();
    // Add Knight discovery events to main deck
    const knightEvents = createKnightDiscoveryEvents();
    const deckWithClassEvents = [...newDeck, ...knightEvents].sort(() => Math.random() - 0.5);
    
    // Initialize with 10 cards total: 5 for preview, 5 for active
    setPreviewCards(fillActiveRowSlots(deckWithClassEvents.slice(0, 5)));  // Top row (preview)
    setActiveCards(fillActiveRowSlots(deckWithClassEvents.slice(5, 10)));  // Middle row (active)
    setRemainingDeck(deckWithClassEvents.slice(10));    // Rest of deck
    setHp(INITIAL_HP);
    setGold(INITIAL_GOLD);
    setShopLevel(0);
    setEquipmentSlot1(null);
    setEquipmentSlot2(null);
    setAmuletSlots([]);
    setBackpackItems([]);
    setBackpackCapacityModifier(0);
    setCanDrawFromBackpack(false);
    setBackpackViewerOpen(false);
    setHandCards([]);
    setCardsPlayed(0);
    setGameOver(false);
    setVictory(false);
    setDrawPending(false);
    setMonstersDefeated(0);
    setTotalDamageTaken(0);
    setTotalHealed(0);
    setDiscardedCards([]);
    setPermanentSkills([]);
    setPermanentMaxHpBonus(0);
    setPermanentSpellDamageBonus(0);
    setTempShield(0);
    setEventModalOpen(false);
    setCurrentEventCard(null);
    setPendingMagicAction(null);
    setWaveDiscardCount(0);
    lastWaterfallSequenceRef.current = null;
    
    // Initialize Knight class deck
    if (heroClass === 'knight') {
      const knightDeck = generateKnightDeck();
      setClassDeck(knightDeck);
      setClassCardsInHand([]);
    }
    
    // Reset Knight-specific states
    setNextWeaponBonus(0);
    setNextShieldBonus(0);
    setWeaponMasterBonus(0); // Will be set after skill selection
    setShieldMasterBonus(0);
    setVampiricNextAttack(false);
    setUnbreakableNext(false);
    setDefensiveStanceActive(false);
    
    // Reset equipment slot bonuses
    resetEquipmentSlotBonuses();
    
    // Reset and show skill selection
    setSelectedHeroSkill(null);
    setShowSkillSelection(true);
    resetHeroSkillForNewWave();
  };

  const hydrateGameState = (snapshot: PersistedGameState) => {
    const mapSlots = (slots?: Array<GameCardData | null>): ActiveRowSlots => {
      const next = createEmptyActiveRow();
      if (!Array.isArray(slots)) {
        return next;
      }
      for (let i = 0; i < Math.min(slots.length, DUNGEON_COLUMN_COUNT); i += 1) {
        next[i] = slots[i] ?? null;
      }
      return next;
    };

    const mapEquipment = (card: GameCardData | null, slotId: EquipmentSlotId): EquipmentItem | null => {
      if (!card) return null;
      if (card.type !== 'weapon' && card.type !== 'shield') {
        return null;
      }
      return { ...card, fromSlot: slotId } as EquipmentItem;
    };

    const mapAmulets = (amulets?: GameCardData[]): AmuletItem[] => {
      if (!Array.isArray(amulets)) return [];
      return amulets
        .filter((card): card is AmuletItem => Boolean(card && card.type === 'amulet'))
        .map(card => ({ ...card, fromSlot: 'amulet' as const }));
    };

    const mapEquipmentBonuses = (
      bonuses?: PersistedGameState['equipmentSlotBonuses'],
    ): EquipmentSlotBonusState => {
      if (!bonuses) {
        return createEmptySlotBonusState();
      }
      return {
        equipmentSlot1: {
          damage: bonuses.equipmentSlot1?.damage ?? 0,
          shield: bonuses.equipmentSlot1?.shield ?? 0,
        },
        equipmentSlot2: {
          damage: bonuses.equipmentSlot2?.damage ?? 0,
          shield: bonuses.equipmentSlot2?.shield ?? 0,
        },
      };
    };

    setHp(snapshot.hp ?? INITIAL_HP);
    setGold(snapshot.gold ?? INITIAL_GOLD);
    setShopLevel(typeof snapshot.shopLevel === 'number' ? snapshot.shopLevel : 0);
    setMonstersDefeated(snapshot.monstersDefeated ?? 0);
    setCardsPlayed(snapshot.cardsPlayed ?? 0);
    setTotalDamageTaken(snapshot.totalDamageTaken ?? 0);
    setTotalHealed(snapshot.totalHealed ?? 0);
    setGameOver(Boolean(snapshot.gameOver));
    setVictory(Boolean(snapshot.victory));
    setPendingMagicAction(null);
    setWaveDiscardCount(0);
    lastWaterfallSequenceRef.current = null;

    setPreviewCards(mapSlots(snapshot.previewCards));
    setActiveCards(mapSlots(snapshot.activeCards));
    setRemainingDeck(Array.isArray(snapshot.remainingDeck) ? snapshot.remainingDeck : []);
    setDiscardedCards(Array.isArray(snapshot.discardedCards) ? snapshot.discardedCards : []);
    setHandCards(Array.isArray(snapshot.handCards) ? snapshot.handCards : []);
    setEquipmentSlot1(mapEquipment(snapshot.equipmentSlot1 ?? null, 'equipmentSlot1'));
    setEquipmentSlot2(mapEquipment(snapshot.equipmentSlot2 ?? null, 'equipmentSlot2'));
    setAmuletSlots(mapAmulets(snapshot.amuletSlots));
    setBackpackItems(Array.isArray(snapshot.backpackItems) ? snapshot.backpackItems : []);
    setCanDrawFromBackpack(Boolean(snapshot.canDrawFromBackpack));

    setClassDeck(Array.isArray(snapshot.classDeck) ? snapshot.classDeck : []);
    setClassCardsInHand(Array.isArray(snapshot.classCardsInHand) ? snapshot.classCardsInHand : []);
    setSelectedHeroSkill(snapshot.selectedHeroSkill ?? null);
    setShowSkillSelection(
      typeof snapshot.showSkillSelection === 'boolean' ? snapshot.showSkillSelection : true,
    );
    setHeroVariant(snapshot.heroVariant ?? getRandomHero());

    setPermanentSkills(Array.isArray(snapshot.permanentSkills) ? snapshot.permanentSkills : []);
    setPermanentMaxHpBonus(snapshot.permanentMaxHpBonus ?? 0);
    setPermanentSpellDamageBonus(snapshot.permanentSpellDamageBonus ?? 0);
    setBackpackCapacityModifier(snapshot.backpackCapacityModifier ?? 0);
    setEquipmentSlotBonuses(mapEquipmentBonuses(snapshot.equipmentSlotBonuses));
    setWeaponMasterBonus(snapshot.weaponMasterBonus ?? 0);
    setShieldMasterBonus(snapshot.shieldMasterBonus ?? 0);

    setDrawPending(false);
    setCombatState(initialCombatState);
    setHeroSkillUsedThisWave(false);
    setPendingHeroSkillAction(null);
    setHeroSkillBanner(null);
    setHeroSkillArrow(null);
    setSwordVectors({});
    setTempShield(0);
    setNextWeaponBonus(0);
    setNextShieldBonus(0);
    setVampiricNextAttack(false);
    setUnbreakableNext(false);
    setDefensiveStanceActive(false);
    setTakingDamage(false);
    setHealing(false);

    clearWaterfallTimeouts();
    waterfallPlanRef.current = null;
    waterfallTimeoutsRef.current = [];
    waterfallLockRef.current = false;
    waterfallPendingRef.current = false;
    waterfallSequenceRef.current = 0;
    pendingDungeonRemovalsRef.current = 0;
    setWaterfallAnimation(initialWaterfallAnimationState);
    setClassDeckFlights([]);
    classDeckFlightsRef.current = [];
    if (classDeckFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(classDeckFlightAnimationRef.current);
      classDeckFlightAnimationRef.current = null;
    }
    setBackpackHandFlights([]);
    backpackHandFlightsRef.current = [];
    if (backpackHandFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(backpackHandFlightAnimationRef.current);
      backpackHandFlightAnimationRef.current = null;
    }
  };

  const handleNewGame = () => {
    clearGameState();
    lastPersistedStateRef.current = null;
    initGame();
    setIsHydrated(true);
  };

  // Handle skill selection
  const handleSkillSelection = (skillId: string) => {
    const definition = getHeroSkillById(skillId as HeroSkillId);
    setSelectedHeroSkill(skillId);
    setShowSkillSelection(false);
    
    const initialBonus = definition?.initialMaxHpBonus ?? 0;
    if (initialBonus) {
      setHp(prev => prev + initialBonus);
    }
  };

  // Equipment slot helpers
  const getEquipmentSlots = (): { id: EquipmentSlotId; item: EquipmentItem | null }[] => {
    return [
      { id: 'equipmentSlot1', item: equipmentSlot1 },
      { id: 'equipmentSlot2', item: equipmentSlot2 }
    ];
  };

  const getEquipmentSlotBonus = (slotId: EquipmentSlotId, bonusType: keyof SlotPermanentBonus): number =>
    equipmentSlotBonuses[slotId][bonusType];

  const calculateSlotArmorValue = (slotId: EquipmentSlotId): number => {
    const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
    if (!slotItem || slotItem.type !== 'shield') {
      return 0;
    }
    const slotShieldBonus = getEquipmentSlotBonus(slotId, 'shield');
    const balanceBonus = amuletEffects.hasBalance && slotId === 'equipmentSlot2' ? BALANCE_SHIELD_BONUS : 0;
    return Math.max(0, slotItem.value + defenseBonus + slotShieldBonus + balanceBonus);
  };

  const setEquipmentSlotBonus = (
    slotId: EquipmentSlotId,
    bonusType: keyof SlotPermanentBonus,
    value: number | ((current: number) => number),
  ) => {
    setEquipmentSlotBonuses(prev => {
      const currentValue = prev[slotId][bonusType];
      const nextValue = typeof value === 'function' ? value(currentValue) : value;
      if (currentValue === nextValue) {
        return prev;
      }
      return {
        ...prev,
        [slotId]: {
          ...prev[slotId],
          [bonusType]: nextValue,
        },
      };
    });
  };

  const resetEquipmentSlotBonuses = () => {
    (['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]).forEach(slotId => {
      (['damage', 'shield'] as (keyof SlotPermanentBonus)[]).forEach(bonusType => {
        setEquipmentSlotBonus(slotId, bonusType, 0);
      });
    });
  };

  const getEngagedMonsterCards = (): GameCardData[] => {
    return combatState.engagedMonsterIds
      .map(id => activeCards.find(card => card?.id === id))
      .filter((card): card is GameCardData => Boolean(card));
  };

  const isMonsterEngaged = (monsterId: string) => combatState.engagedMonsterIds.includes(monsterId);

  const registerMonsterCellRef = (monsterId?: string) => (el: HTMLDivElement | null) => {
    if (!monsterId) return;
    if (el) {
      monsterCellRefs.current[monsterId] = el;
    } else {
      delete monsterCellRefs.current[monsterId];
    }
  };
  const canShieldBlock = (slotId: EquipmentSlotId) => {
    const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
    return Boolean(slotItem && slotItem.type === 'shield');
  };

  const setEquipmentSlotById = (id: EquipmentSlotId, item: EquipmentItem | null) => {
    const itemWithSlot = item ? { ...item, fromSlot: id } : null;
    if (id === 'equipmentSlot1') setEquipmentSlot1(itemWithSlot);
    else setEquipmentSlot2(itemWithSlot);
  };

  const clearEquipmentSlotById = (id: EquipmentSlotId) => setEquipmentSlotById(id, null);

  const normalizeEventEffect = (expression?: EventEffectExpression): string[] => {
    if (!expression) {
      return [];
    }
    const raw = Array.isArray(expression) ? expression : expression.split(',');
    return raw
      .map(token => token.trim())
      .filter(token => token.length > 0);
  };

  const evaluateChoiceRequirements = useCallback(
    (choice?: EventChoiceDefinition): EventChoiceAvailability => {
      if (!choice?.requires?.length) {
        return { disabled: false };
      }
      for (const requirement of choice.requires) {
        if (requirement.type === 'equipment') {
          const slotItem = requirement.slot === 'left' ? equipmentSlot1 : equipmentSlot2;
          if (!slotItem) {
            return {
              disabled: true,
              reason:
                requirement.message ??
                (requirement.slot === 'left' ? '左侧装备栏为空' : '右侧装备栏为空'),
            };
          }
        } else if (requirement.type === 'equipmentAny') {
          if (!equipmentSlot1 && !equipmentSlot2) {
            return { disabled: true, reason: requirement.message ?? '至少需要一件装备' };
          }
        } else if (requirement.type === 'amulet') {
          if (!amuletSlots.length) {
            return { disabled: true, reason: requirement.message ?? '至少需要一个护身符' };
          }
        } else if (requirement.type === 'hand') {
          if (handCards.length < requirement.min) {
            return {
              disabled: true,
              reason: requirement.message ?? `至少需要 ${requirement.min} 张手牌`,
            };
          }
        } else if (requirement.type === 'cardPool') {
          let total = 0;
          if (requirement.pools.includes('hand')) {
            total += handCards.length;
          }
          if (requirement.pools.includes('backpack')) {
            total += backpackItems.length;
          }
          if (total < requirement.min) {
            return {
              disabled: true,
              reason:
                requirement.message ??
                `需要至少 ${requirement.min} 张可用卡牌（手牌/背包）`,
            };
          }
        } else if (requirement.type === 'graveyard') {
          if (discardedCards.length < requirement.min) {
            return {
              disabled: true,
              reason: requirement.message ?? '坟场中没有足够的卡牌',
            };
          }
        }
      }
      return { disabled: false };
    },
    [amuletSlots.length, backpackItems.length, discardedCards.length, equipmentSlot1, equipmentSlot2, handCards.length],
  );

  const eventChoiceStates = useMemo<EventChoiceAvailability[]>(() => {
    if (!currentEventCard?.eventChoices) {
      return [];
    }
    const baseStates = currentEventCard.eventChoices.map(choice => evaluateChoiceRequirements(choice));
    const availabilityLookup: Record<string, boolean> = {};

    currentEventCard.eventChoices.forEach((choice, index) => {
      if (choice.id) {
        availabilityLookup[choice.id] = !(baseStates[index]?.disabled ?? false);
      }
    });

    return currentEventCard.eventChoices.map((choice, index) => {
      const baseState = baseStates[index];
      if (!baseState.disabled && choice.requiresDisabledChoices?.length) {
        const anyActive = choice.requiresDisabledChoices.some(id => availabilityLookup[id]);
        if (anyActive) {
          return {
            disabled: true,
            reason: choice.requiresDisabledReason ?? '其他选项仍可用',
          };
        }
      }
      return baseState;
    });
  }, [currentEventCard, evaluateChoiceRequirements]);

  const findWeaponSlot = (): { id: EquipmentSlotId; item: EquipmentItem } | null => {
    for (const slot of getEquipmentSlots()) {
      if (slot.item?.type === 'weapon') return slot as { id: EquipmentSlotId; item: EquipmentItem };
    }
    return null;
  };

  const findShieldSlot = (): { id: EquipmentSlotId; item: EquipmentItem } | null => {
    for (const slot of getEquipmentSlots()) {
      if (slot.item?.type === 'shield') return slot as { id: EquipmentSlotId; item: EquipmentItem };
    }
    return null;
  };

  useEffect(() => {
    if (!drawPending) return;
    
    const timer = setTimeout(() => {
      let carriedSlot: { card: GameCardData; index: number } | null = null;
      
      // First, capture the unplayed card and its original slot
      setActiveCards(prev => {
        const remaining = flattenActiveRowSlots(prev);
        if (remaining.length === 1) {
          const onlyCard = remaining[0];
          carriedSlot = {
            card: onlyCard,
            index: findSlotIndexByCardId(prev, onlyCard.id),
          };
        } else {
          carriedSlot = null;
        }
        return prev;
      });
      
      // Then update both deck and active cards
      setRemainingDeck(prevRemaining => {
        const occupiedSlots = carriedSlot ? 1 : 0;
        const availableSlots = DUNGEON_COLUMN_COUNT - occupiedSlots;
        const cardsToDraw = Math.min(availableSlots, prevRemaining.length);
        
        if (cardsToDraw === 0 && !carriedSlot) {
          setVictory(true);
          setGameOver(true);
          setActiveCards(createEmptyActiveRow());
          setCardsPlayed(0);
          setDrawPending(false);
          return prevRemaining;
        }

        const newCards = prevRemaining.slice(0, cardsToDraw);
        const nextSlots = createEmptyActiveRow();

        if (carriedSlot) {
          const targetIndex = carriedSlot.index >= 0 ? carriedSlot.index : 0;
          nextSlots[targetIndex] = carriedSlot.card;
        }

        let insertIndex = 0;
        for (let col = 0; col < DUNGEON_COLUMN_COUNT; col++) {
          if (!nextSlots[col] && insertIndex < newCards.length) {
            nextSlots[col] = newCards[insertIndex++];
          }
        }
        
        setActiveCards(nextSlots);
        setCardsPlayed(0);
        setDrawPending(false);
        
        return prevRemaining.slice(cardsToDraw); // Remove drawn cards from deck
      });
    }, 500);
    
    return () => clearTimeout(timer);
  }, [drawPending]);

  const sanitizeCardForGraveyard = (card: GameCardData): GameCardData => {
    const { fromSlot, ...rest } = card as GameCardData & { fromSlot?: string };
    return { ...rest };
  };

  function addToGraveyard(card: GameCardData) {
    const sanitized = sanitizeCardForGraveyard(card);
    setDiscardedCards(prev => {
      if (prev.some(c => c.id === sanitized.id)) {
        return prev;
      }
      setWaveDiscardCount(count => count + 1);
      return [...prev, sanitized];
    });
  }

  const createCurseCard = (sourceCard?: GameCardData): GameCardData => ({
    id: `curse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'magic',
    name: '血咒之印',
    value: 0,
    image: sourceCard?.image ?? eventScrollImage,
    description: '永久魔法：使用时失去 3 点生命值。',
    magicType: 'permanent',
    magicEffect: 'curse',
    isCurse: true,
  });

  const addCardToBackpack = useCallback(
    (card: GameCardData, options?: { toBottom?: boolean }) => {
      const sanitized = { ...card };
      setBackpackItems(prev => {
        const next = options?.toBottom ? [...prev, sanitized] : [sanitized, ...prev];
        if (next.length <= backpackCapacity) {
          return next;
        }
        const kept = next.slice(0, backpackCapacity);
        next.slice(backpackCapacity).forEach(overflowCard => addToGraveyard(overflowCard));
        return kept;
      });
      setCanDrawFromBackpack(true);
    },
    [addToGraveyard, backpackCapacity],
  );

  const enforceBackpackCapacity = useCallback(() => {
    setBackpackItems(prev => {
      if (prev.length <= backpackCapacity) {
        return prev;
      }
      const kept = prev.slice(0, backpackCapacity);
      prev.slice(backpackCapacity).forEach(overflowCard => addToGraveyard(overflowCard));
      return kept;
    });
  }, [addToGraveyard, backpackCapacity]);

  useEffect(() => {
    enforceBackpackCapacity();
  }, [backpackCapacity, enforceBackpackCapacity]);

  const triggerEventTransform = useCallback(
    (fromCard: GameCardData, toCard: GameCardData) =>
      new Promise<void>(resolve => {
        setEventTransformState({
          fromCard,
          toCard,
          onComplete: () => {
            resolve();
            setEventTransformState(null);
          },
        });
      }),
    [],
  );

  const sacrificeEquipment = useCallback(
    (slotId: EquipmentSlotId): boolean => {
      const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (!slotItem) {
        return false;
      }
      addToGraveyard(slotItem);
      clearEquipmentSlotById(slotId);
      return true;
    },
    [addToGraveyard, clearEquipmentSlotById, equipmentSlot1, equipmentSlot2],
  );

  const swapEquipmentSlots = useCallback(() => {
    const left = equipmentSlot1;
    const right = equipmentSlot2;
    setEquipmentSlotById('equipmentSlot1', right ? { ...right } : null);
    setEquipmentSlotById('equipmentSlot2', left ? { ...left } : null);
  }, [equipmentSlot1, equipmentSlot2]);

  const convertAmuletsToGold = useCallback(
    (amountPer: number) => {
      if (!amuletSlots.length) return 0;
      const payout = amountPer * amuletSlots.length;
      amuletSlots.forEach(amulet => addToGraveyard(amulet));
      setAmuletSlots([]);
      setGold(prev => prev + payout);
      return payout;
    },
    [addToGraveyard, amuletSlots, setAmuletSlots, setGold],
  );

  const gainClassDeckBottomCards = useCallback(
    (count: number): GameCardData[] => {
      if (count <= 0 || classDeck.length === 0) {
        return [];
      }
      const availableSlots = backpackCapacity - backpackItems.length;
      if (availableSlots <= 0) {
        return [];
      }
      const takeCount = Math.min(count, availableSlots, classDeck.length);
      if (takeCount <= 0) {
        return [];
      }
      const cards = classDeck.slice(-takeCount);
      setClassDeck(prev => prev.slice(0, prev.length - takeCount));
      setBackpackItems(prev => [...cards, ...prev]);
      setCanDrawFromBackpack(true);
      triggerClassDeckFlight(cards);
      return cards;
    },
    [backpackItems.length, classDeck, setBackpackItems, setCanDrawFromBackpack, setClassDeck, triggerClassDeckFlight],
  );

  const resetWaterfallAnimation = () => {
    clearWaterfallTimeouts();
    waterfallPlanRef.current = null;
    setWaterfallAnimation(initialWaterfallAnimationState);
    waterfallLockRef.current = false;
  };

  const startWaterfallDeal = () => {
    const plan = waterfallPlanRef.current;
    if (!plan) {
      resetWaterfallAnimation();
      return;
    }

    setRemainingDeck(plan.nextRemainingDeck);

    if (plan.nextPreviewCards.length === 0) {
      setPreviewCards(createEmptyActiveRow());
      if (plan.shouldDeclareVictory && countActiveRowSlots(activeCards) === 0) {
        setVictory(true);
        setGameOver(true);
      }
      resetWaterfallAnimation();
      return;
    }

    setWaterfallAnimation(prev => ({
      ...prev,
      phase: 'dealing',
      isActive: true,
      droppingSlots: [],
      landingSlots: [],
      discardSlot: null,
      dealingSlots: plan.nextPreviewCards.map((_, idx) => idx),
      sequenceId: prev.sequenceId,
    }));

    setPreviewCards(fillActiveRowSlots(plan.nextPreviewCards));

    logWaterfall('deal-start', {
      nextPreviewCount: plan.nextPreviewCards.length,
      shouldDeclareVictory: plan.shouldDeclareVictory,
    });

    queueWaterfallTimeout(() => {
      resetWaterfallAnimation();
    }, WATERFALL_DEAL_DURATION, 'deal-phase-complete');
  };

  const handleWaterfallDiscardComplete = () => {
    const plan = waterfallPlanRef.current;
    if (!plan) {
      resetWaterfallAnimation();
      return;
    }

    if (plan.discardCard) {
      addToGraveyard(plan.discardCard);
    }

    logWaterfall('discard-complete', {
      discardedCardId: plan.discardCard?.id ?? null,
    });

    setWaterfallAnimation(prev => ({
      ...prev,
      discardSlot: null,
      isActive: true,
      sequenceId: prev.sequenceId,
    }));

    setPreviewCards(createEmptyActiveRow());
    queueWaterfallTimeout(() => {
      startWaterfallDeal();
    }, 150, 'discard-to-deal-delay');
  };

  const handleWaterfallDropComplete = () => {
    const plan = waterfallPlanRef.current;
    if (!plan) {
      resetWaterfallAnimation();
      return;
    }

    logWaterfall('drop-complete', {
      dropTargetSlots: plan.dropTargetSlots,
      dropCards: plan.dropCards.map(card => card.id),
      discardPlanned: Boolean(plan.discardCard),
    });

    if (plan.dropTargetSlots.length > 0) {
      setActiveCards(prev => {
        const next = [...prev];
        plan.dropTargetSlots.forEach((slotIndex, idx) => {
          const card = plan.dropCards[idx];
          if (typeof slotIndex === 'number') {
            next[slotIndex] = card ?? null;
          }
        });
        return next;
      });
    }

    setWaterfallAnimation(prev => ({
      ...prev,
      phase: plan.discardCard ? 'discarding' : 'dealing',
      isActive: true,
      droppingSlots: [],
      landingSlots: plan.dropTargetSlots,
      discardSlot: plan.discardCard ? plan.discardPreviewIndex : null,
      sequenceId: prev.sequenceId,
    }));

    queueWaterfallTimeout(() => {
      setWaterfallAnimation(prev => ({
        ...prev,
        landingSlots: [],
        sequenceId: prev.sequenceId,
      }));
    }, Math.max(200, WATERFALL_DROP_DURATION - 200), 'landing-clear');

    if (plan.discardCard) {
      queueWaterfallTimeout(() => {
        handleWaterfallDiscardComplete();
      }, WATERFALL_DISCARD_DURATION, 'drop-to-discard');
    } else {
      queueWaterfallTimeout(() => {
        setPreviewCards(createEmptyActiveRow());
        startWaterfallDeal();
      }, 150, 'drop-to-deal-delay');
    }
  };

  // Waterfall mechanism - staged animation + dealing
  const triggerWaterfall = () => {
    if (waterfallLockRef.current || waterfallAnimation.isActive) {
      logWaterfall('trigger-blocked', {
        lock: waterfallLockRef.current,
        animActive: waterfallAnimation.isActive,
      });
      return;
    }

    waterfallLockRef.current = true;

    const releaseWaterfallLock = (reason: string) => {
      waterfallLockRef.current = false;
      logWaterfall('trigger-abort', { reason });
    };

    const baseEmptyColumns = getEmptyColumns(activeCards);
    const forceCascade = cascadeResetWaterfallRef.current;

    if (forceCascade && baseEmptyColumns.length !== DUNGEON_COLUMN_COUNT) {
      releaseWaterfallLock('cascade-row-not-empty');
      queueWaterfallTimeout(triggerWaterfall, 50, 'cascade-reset-retry');
      return;
    }

    const cascadeFullDrop = forceCascade && baseEmptyColumns.length === DUNGEON_COLUMN_COUNT;
    const emptyColumns = cascadeFullDrop ? DUNGEON_COLUMNS : baseEmptyColumns;

    if (emptyColumns.length === 0) {
      releaseWaterfallLock('no-empty-slots');
      return;
    }

    const previewIndices = getFilledPreviewColumns(previewCards);
    const filledPreviewCount = previewIndices.length;
    const fullCascade = cascadeFullDrop || emptyColumns.length === DUNGEON_COLUMN_COUNT;
    const dropCapacity = fullCascade ? filledPreviewCount : Math.max(0, filledPreviewCount - 1);
    let dropCount = cascadeFullDrop
      ? Math.min(DUNGEON_COLUMN_COUNT, filledPreviewCount)
      : Math.min(emptyColumns.length, dropCapacity);

    let dropAssignments: DungeonDropAssignment[] = [];
    const unusedPreview = new Set(previewIndices);
    const usedSlots = new Set<number>();

    logWaterfall('drop-plan-state', {
      emptySlots: emptyColumns,
      previewIndices,
      filledPreviewCount,
      dropCapacity,
      dropCount,
      unusedPreview: Array.from(unusedPreview),
      previewSnapshot: previewIndices.map(index => previewCards[index]?.id ?? null),
    });

    if (cascadeFullDrop) {
      dropAssignments = previewIndices
        .map(previewIndex => {
          const card = previewCards[previewIndex];
          return card ? { previewIndex, card, slotIndex: previewIndex } : null;
        })
        .filter((assignment): assignment is DungeonDropAssignment => Boolean(assignment));
      dropCount = dropAssignments.length;
      unusedPreview.clear();
    } else {
      // Pass 1: column-aligned drops (same column first)
      for (const slotIndex of emptyColumns) {
        if (dropAssignments.length >= dropCount) break;
        if (!unusedPreview.has(slotIndex)) continue;
        const card = previewCards[slotIndex];
        if (!card) continue;
        dropAssignments.push({ previewIndex: slotIndex, card, slotIndex });
        unusedPreview.delete(slotIndex);
        usedSlots.add(slotIndex);
      }

      // Pass 2: fill any remaining drops with leftover preview cards (left-to-right)
      if (dropAssignments.length < dropCount) {
        const remainingSlots = emptyColumns.filter(slot => !usedSlots.has(slot));
        const remainingPreviewIndices = Array.from(unusedPreview).sort((a, b) => a - b);
        for (let i = 0; i < remainingSlots.length && dropAssignments.length < dropCount; i += 1) {
          const slotIndex = remainingSlots[i];
          const previewIndex = remainingPreviewIndices.shift();
          if (previewIndex === undefined) break;
          const card = previewCards[previewIndex];
          if (!card) continue;
          dropAssignments.push({ previewIndex, card, slotIndex });
          unusedPreview.delete(previewIndex);
        }
      }
    }

    logWaterfall('drop-plan-result', {
      assignments: dropAssignments.map(({ previewIndex, slotIndex }) => ({
        previewIndex,
        slotIndex,
      })),
      unusedPreview: Array.from(unusedPreview),
      dropCount,
    });

    if (dropAssignments.length < dropCount) {
      logWaterfall('drop-mismatch', {
        expected: dropCount,
        actual: dropAssignments.length,
        emptySlots: emptyColumns,
        previewIndices,
      });
    }

    if (dropAssignments.length === 0 && previewIndices.length === 0) {
      releaseWaterfallLock('no-preview-cards');
      return;
    }

    waterfallPendingRef.current = false;
    const sequenceId = ++waterfallSequenceRef.current;

    logWaterfall('trigger', {
      emptySlots: emptyColumns,
      filledPreviewCount,
      dropCount,
      sequenceId,
      assignments: dropAssignments.map(({ previewIndex, slotIndex }) => ({ previewIndex, slotIndex })),
    });

    const dropPreviewIndices = dropAssignments.map(pair => pair.previewIndex);
    const dropCards = dropAssignments.map(pair => pair.card);
    const dropTargetSlots = dropAssignments.map(pair => pair.slotIndex);

    const remainingPreviewOrdered = Array.from(unusedPreview).sort((a, b) => b - a);
    const discardPreviewIndex = remainingPreviewOrdered[0] ?? null;
    const discardCard =
      discardPreviewIndex !== null ? previewCards[discardPreviewIndex] : null;

    const nextPreviewCards = remainingDeck.slice(0, 5);
    const nextRemainingDeck = remainingDeck.slice(5);
    const shouldDeclareVictory =
      nextPreviewCards.length === 0 && remainingDeck.length === 0;

    const planDiscardCard = cascadeFullDrop ? null : discardCard;
    const planDiscardPreviewIndex = cascadeFullDrop ? null : discardPreviewIndex;

    waterfallPlanRef.current = {
      dropCards,
      dropPreviewIndices,
      dropTargetSlots,
      discardCard: planDiscardCard,
      discardPreviewIndex: planDiscardPreviewIndex,
      nextPreviewCards,
      nextRemainingDeck,
      shouldDeclareVictory,
    };
    cascadeResetWaterfallRef.current = false;
    resetHeroSkillForNewWave();

    setWaterfallAnimation({
      phase: dropCards.length > 0 ? 'dropping' : discardCard ? 'discarding' : 'dealing',
      isActive: true,
      droppingSlots: dropCards.length > 0 ? dropPreviewIndices : [],
      landingSlots: [],
      discardSlot: dropCards.length === 0 ? discardPreviewIndex : null,
      dealingSlots: [],
      sequenceId,
    });

    if (dropCards.length > 0) {
      queueWaterfallTimeout(handleWaterfallDropComplete, WATERFALL_DROP_DURATION, 'drop-phase-timeout');
    } else if (discardCard) {
      queueWaterfallTimeout(handleWaterfallDiscardComplete, WATERFALL_DISCARD_DURATION, 'discard-phase-timeout');
    } else {
      startWaterfallDeal();
    }
  };

  // Remove card from active cards (add to graveyard automatically)
  const removeCard = (cardId: string, addToGraveyardAutomatically: boolean = true) => {
    logWaterfall('remove-request', {
      cardId,
      pendingBefore: pendingDungeonRemovalsRef.current,
    });
    // Find the card to add to graveyard if needed
    const slotIndex = findSlotIndexByCardId(activeCards, cardId);
    const cardToRemove = slotIndex >= 0 ? activeCards[slotIndex] : null;
    if (addToGraveyardAutomatically && cardToRemove) {
      addToGraveyard(cardToRemove);
    }

    if (cardToRemove) {
      setCanDrawFromBackpack(true);
    }
    
    // Add card to removing set for animation
    setRemovingCards(prev => new Set(prev).add(cardId));
    
    // Delay actual removal for animation
    setTimeout(() => {
      setActiveCards(prev => {
        const index = findSlotIndexByCardId(prev, cardId);
        if (index === -1) {
          return prev;
        }

        const updated = [...prev];
        updated[index] = null;
        const remainingCount = countActiveRowSlots(updated);
        
        // Check if exactly 1 card remains - trigger waterfall
    if (remainingCount === 1) {
      waterfallPendingRef.current = true;
    } else if (remainingCount === 0) {
          // Should not happen with waterfall mechanism, but handle it
      if (remainingDeck.length === 0 && countActiveRowSlots(previewCards) === 0) {
            setVictory(true);
            setGameOver(true);
          }
        }
        
        return updated;
      });
      
      // Clear from removing set
      setRemovingCards(prev => {
        const next = new Set(prev);
        next.delete(cardId);
        return next;
      });

      pendingDungeonRemovalsRef.current = Math.max(0, pendingDungeonRemovalsRef.current - 1);
      logWaterfall('remove-complete', {
        cardId,
        pendingAfter: pendingDungeonRemovalsRef.current,
        waterfallPending: waterfallPendingRef.current,
        lock: waterfallLockRef.current,
      });
      if (pendingDungeonRemovalsRef.current === 0 && waterfallPendingRef.current && !waterfallLockRef.current) {
        logWaterfall('waterfall-ready-post-removal', {
          pendingRemovals: pendingDungeonRemovalsRef.current,
          lock: waterfallLockRef.current,
        });
        // Defer to the main effect to fire the waterfall with fresh state.
      }
    }, 300);
    pendingDungeonRemovalsRef.current += 1;
    logWaterfall('remove-pending-increment', { pending: pendingDungeonRemovalsRef.current });
  };

  const finalizeMagicCard = useCallback(
    (card: GameCardData, options?: { banner?: string }) => {
      if (options?.banner) {
        setHeroSkillBanner(options.banner);
      }

      if (isPermanentMagicCard(card)) {
        returnCardToBackpackBottom(card);
      } else {
      addToGraveyard(card);
      }

      removeCard(card.id, false);
      setPendingMagicAction(null);
    },
    [addToGraveyard, removeCard, returnCardToBackpackBottom],
  );

  const finalizePotionCard = useCallback(
    (card: GameCardData, options?: { banner?: string }) => {
      if (options?.banner) {
        setHeroSkillBanner(options.banner);
      }
      setPendingPotionAction(current => (current && current.card.id === card.id ? null : current));
      addToGraveyard(card);
    },
    [addToGraveyard],
  );

  const resolvePotionRepairForSlot = useCallback(
    (
      slotId: EquipmentSlotId,
      card: GameCardData,
      amount: number,
      allowedTypes: EquipmentRepairTarget[],
    ): boolean => {
      const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (!slotItem) {
        setHeroSkillBanner('该槽位目前没有装备。');
        return false;
      }

      if (!slotItem.type || !allowedTypes.includes(slotItem.type)) {
        const label = formatRepairTargetLabel(allowedTypes);
        setHeroSkillBanner(`请选择一个${label}。`);
        return false;
      }

      const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
      if (maxDurability === 0) {
        setHeroSkillBanner('该装备无法修复。');
        return false;
      }

      const currentDurability = slotItem.durability ?? maxDurability;
      if (currentDurability >= maxDurability) {
        setHeroSkillBanner('该装备已经满耐久。');
        return false;
      }

      const repairedDurability = Math.min(maxDurability, currentDurability + amount);
      const gained = repairedDurability - currentDurability;
      setEquipmentSlotById(slotId, { ...slotItem, durability: repairedDurability });
      const banner = `${slotItem.name} 耐久 +${gained}`;
      finalizePotionCard(card, { banner });
      return true;
    },
    [equipmentSlot1, equipmentSlot2, finalizePotionCard, setEquipmentSlotById, setHeroSkillBanner],
  );

  const handlePotionConsumption = useCallback(
    (card: GameCardData) => {
      const effect = card.potionEffect;

      const resolveHeal = (healAmount: number) => {
        const actualHeal = healHero(healAmount);
        const banner = actualHeal > 0 ? `回复${actualHeal}点生命。` : '生命已满。';
        finalizePotionCard(card, { banner });
      };

      if (!effect || effect === 'heal-5' || effect === 'heal-7') {
        resolveHeal(effect === 'heal-7' ? 7 : effect === 'heal-5' ? 5 : card.value ?? 0);
        return;
      }

      if (
        effect === 'repair-weapon-2' ||
        effect === 'repair-weapon-3' ||
        effect === 'repair-equipment-2'
      ) {
        let repairAmount = effect === 'repair-weapon-3' ? 3 : 2;
        let allowedTypes: EquipmentRepairTarget[] = ['weapon'];

        if (effect === 'repair-equipment-2') {
          allowedTypes = ['weapon', 'shield'];
        }

        const targetLabel = formatRepairTargetLabel(allowedTypes);
        const matchingSlots = getEquipmentSlots().filter(slot => {
          const slotType = slot.item?.type;
          return Boolean(slotType && allowedTypes.includes(slotType));
        });

        if (!matchingSlots.length) {
          finalizePotionCard(card, { banner: `没有装备${targetLabel}，药剂失效。` });
          return;
        }

        const repairableSlots = matchingSlots.filter(slot => {
          const item = slot.item;
          if (!item) {
            return false;
          }
          const maxDurability = item.maxDurability ?? item.durability ?? 0;
          const currentDurability = item.durability ?? maxDurability;
          return maxDurability > 0 && currentDurability < maxDurability;
        });

        if (!repairableSlots.length) {
          finalizePotionCard(card, { banner: `所有${targetLabel}已满耐久。` });
          return;
        }

        if (repairableSlots.length === 1) {
          resolvePotionRepairForSlot(
            repairableSlots[0].id,
            card,
            repairAmount,
            allowedTypes,
          );
          setPendingPotionAction(null);
          return;
        }

        const prompt = `选择一个${targetLabel}恢复${repairAmount}点耐久。`;
        setPendingPotionAction({
          card,
          effect: 'repair-equipment',
          amount: repairAmount,
          allowedTypes,
          step: 'slot-select',
          prompt,
        });
        setHeroSkillBanner(prompt);
        return;
      }

      if (effect === 'draw-backpack-3') {
        let draws = 0;
        for (let i = 0; i < 3; i += 1) {
          const drawn = drawFromBackpackToHand();
          if (!drawn) {
            break;
          }
          draws += 1;
        }
        const banner =
          draws > 0 ? `从背包抽出${draws}张牌。` : '背包为空或手牌已满，无法抽牌。';
        finalizePotionCard(card, { banner });
        return;
      }

      if (effect === 'discover-class') {
        const started = beginDiscoverFlow('potion-discover');
        if (started) {
          finalizePotionCard(card, { banner: '发现了一张职业卡！' });
        } else {
          handleDiscoverFallback();
          finalizePotionCard(card, { banner: '职业卡牌不可用，改为补一张。' });
        }
        return;
      }

      resolveHeal(card.value ?? 0);
    },
    [
      beginDiscoverFlow,
      drawFromBackpackToHand,
      equipmentSlot1,
      equipmentSlot2,
      finalizePotionCard,
      getEquipmentSlots,
      handleDiscoverFallback,
      healHero,
      resolvePotionRepairForSlot,
      setHeroSkillBanner,
      setPendingPotionAction,
    ],
  );

  const finalizeEventResolution = (options?: { removeFromDungeon?: boolean }) => {
    const resolution = eventResolutionRef.current;
    if (resolution.source === 'dungeon' && resolution.cardId) {
      if (options?.removeFromDungeon !== false) {
        removeCard(resolution.cardId, false);
      }
      setResolvingDungeonCardId(prev => (prev === resolution.cardId ? null : prev));
    }

    eventResolutionRef.current = { cardId: null, source: null };
  };

  const completeCurrentEvent = useCallback(() => {
    if (!currentEventCard) return;
    addToGraveyard(currentEventCard);
    setEventModalOpen(false);
    setCurrentEventCard(null);
    finalizeEventResolution();
  }, [addToGraveyard, currentEventCard, finalizeEventResolution]);

  const handleDiscoverSelect = useCallback(
    (cardId: string) => {
      if (!discoverOptions.length) return;
      const selectedCard = discoverOptions.find(card => card.id === cardId);
      const remainingCards = discoverOptions.filter(card => card.id !== cardId);

      setDiscoverModalOpen(false);
      setDiscoverOptions([]);

      if (remainingCards.length) {
        returnCardsToClassDeck(remainingCards);
      }

      if (selectedCard) {
        if (backpackItems.length >= backpackCapacity) {
          returnCardsToClassDeck([selectedCard]);
        } else {
          setBackpackItems(prev => [selectedCard, ...prev]);
          triggerClassDeckFlight([selectedCard]);
        }
      }

      completeCurrentEvent();
    },
    [backpackItems.length, completeCurrentEvent, discoverOptions, returnCardsToClassDeck, triggerClassDeckFlight],
  );

  const handleShopPurchase = useCallback(
    (cardId: string) => {
      setShopOfferings(prev => {
        const offeringIndex = prev.findIndex(entry => entry.card.id === cardId);
        if (offeringIndex === -1) {
          return prev;
        }

        const offering = prev[offeringIndex];
        if (offering.sold) {
          return prev;
        }

        if (gold < offering.price) {
          return prev;
        }

        if (backpackItems.length >= backpackCapacity) {
          return prev;
        }

        const purchasedCard = { ...offering.card };
        setGold(value => value - offering.price);
        setClassDeck(deck => deck.filter(card => card.id !== purchasedCard.id));
        setBackpackItems(items => [purchasedCard, ...items]);
        setCanDrawFromBackpack(true);
        triggerClassDeckFlight([purchasedCard]);

        const next = [...prev];
        next[offeringIndex] = { ...offering, sold: true };
        return next;
      });
    },
    [backpackItems.length, gold, triggerClassDeckFlight],
  );

  const handleShopClose = useCallback(() => {
    setShopModalOpen(false);
    setShopOfferings([]);
    setShopSourceEvent(null);
    setDeleteModalOpen(false);
    setCardActionContext(null);
    cardActionResolverRef.current = null;
    completeCurrentEvent();
  }, [completeCurrentEvent]);

  const requestCardAction = useCallback(
    (action: 'delete' | 'discard', count: number, options?: { title?: string; description?: string }) => {
      if (deletableCardCount < count) {
        setHeroSkillBanner(options?.description ?? '当前没有足够的卡牌可供选择。');
        return Promise.resolve(false);
      }
      return new Promise<boolean>(resolve => {
        cardActionResolverRef.current = () => {
          resolve(true);
          cardActionResolverRef.current = null;
        };
        setCardActionContext({
          mode: 'event',
          action,
          requiredCount: count,
          remainingCount: count,
          title: options?.title,
          description: options?.description,
        });
        setDeleteModalOpen(true);
      });
    },
    [deletableCardCount, setHeroSkillBanner],
  );

  const requestGraveyardSelection = useCallback(
    (maxOptions: number) => {
      if (!discardedCards.length) {
        setHeroSkillBanner('坟场中没有可取回的卡牌。');
        return Promise.resolve<GameCardData | null>(null);
      }
      const shuffled = [...discardedCards].sort(() => Math.random() - 0.5);
      const options = shuffled.slice(0, Math.min(maxOptions, shuffled.length));
      return new Promise<GameCardData | null>(resolve => {
        graveyardDiscoverResolverRef.current = card => {
          resolve(card);
          graveyardDiscoverResolverRef.current = null;
        };
        setGraveyardDiscoverState(options);
      });
    },
    [discardedCards, setHeroSkillBanner],
  );

  const handleGraveyardDiscoverSelect = useCallback(
    (cardId: string) => {
      if (!graveyardDiscoverState) {
        return;
      }
      const selected = graveyardDiscoverState.find(card => card.id === cardId);
      if (!selected) {
        return;
      }
      setDiscardedCards(prev => prev.filter(card => card.id !== cardId));
      addCardToBackpack(selected);
      setGraveyardDiscoverState(null);
      graveyardDiscoverResolverRef.current?.(selected);
      graveyardDiscoverResolverRef.current = null;
    },
    [addCardToBackpack, graveyardDiscoverState],
  );

  const handleShopDeleteRequest = useCallback(() => {
    if (shopDeleteUsed || deletableCardCount === 0) {
      return;
    }
    setCardActionContext({
      mode: 'shop',
      action: 'delete',
      requiredCount: 1,
      remainingCount: 1,
      title: '选择要删除的卡牌',
      description: '从手牌或背包中删除 1 张卡牌，将其送入坟场。',
    });
    setDeleteModalOpen(true);
  }, [deletableCardCount, shopDeleteUsed]);

  const wasDraggedFromHand = (cardId: string) =>
    draggedCardSource === 'hand' && draggedCard?.id === cardId;

  const isCardFromHand = (card: GameCardData | string) => {
    const cardId = typeof card === 'string' ? card : card.id;
    return handCards.some(c => c.id === cardId) || wasDraggedFromHand(cardId);
  };

  const consumeCardFromHand = (card: GameCardData | string): boolean => {
    const cardId = typeof card === 'string' ? card : card.id;
    const draggedFromHand = wasDraggedFromHand(cardId);
    let removed = false;

    setHandCards(prev => {
      const existsInHand = prev.some(c => c.id === cardId);
      if (!existsInHand) {
        return prev;
      }
      removed = true;
      return prev.filter(c => c.id !== cardId);
    });

    if (removed || draggedFromHand) {
      if (draggedFromHand) {
        setDraggedCard(null);
        setDraggedCardSource(current => (current === 'hand' ? null : current));
      }
      return true;
    }

    return false;
  };

  const discardAllHandCards = useCallback(() => {
    setHandCards(prev => {
      if (!prev.length) {
        return prev;
      }
      prev.forEach(card => addToGraveyard(card));
      return [];
    });
  }, [addToGraveyard]);

  const drawCardsFromBackpack = (count: number) => {
    if (count <= 0) {
      return 0;
    }
    let drawn = 0;
    for (let i = 0; i < count; i += 1) {
      const card = drawFromBackpackToHand();
      if (!card) {
        break;
      }
      drawn += 1;
    }
    return drawn;
  };

  const handleDeleteCardConfirm = useCallback(
    (cardId: string, source: 'hand' | 'backpack') => {
      let cardToDelete: GameCardData | null = null;

      if (source === 'hand') {
        cardToDelete = handCards.find(card => card.id === cardId) ?? null;
        if (!cardToDelete) {
          return;
        }
        const removed = consumeCardFromHand(cardToDelete);
        if (!removed) {
          return;
        }
      } else {
        cardToDelete = backpackItems.find(card => card.id === cardId) ?? null;
        if (!cardToDelete) {
          return;
        }
        setBackpackItems(prev => prev.filter(card => card.id !== cardId));
      }

      addToGraveyard(cardToDelete);

      if (cardActionContext?.mode === 'shop') {
        setShopDeleteUsed(true);
        setDeleteModalOpen(false);
        setCardActionContext(null);
        return;
      }

      if (cardActionContext?.mode === 'event') {
        const remaining = Math.max(0, cardActionContext.remainingCount - 1);
        if (remaining <= 0) {
          setDeleteModalOpen(false);
          setCardActionContext(null);
          const resolver = cardActionResolverRef.current;
          cardActionResolverRef.current = null;
          resolver?.();
        } else {
          setCardActionContext(context => (context ? { ...context, remainingCount: remaining } : context));
        }
        return;
      }

      setDeleteModalOpen(false);
    },
    [addToGraveyard, backpackItems, cardActionContext, consumeCardFromHand, handCards],
  );
  const handleDeleteModalOpenChange = useCallback(
    (open: boolean) => {
      if (
        !open &&
        cardActionContext?.mode === 'event' &&
        (cardActionContext.remainingCount ?? 0) > 0
      ) {
        setHeroSkillBanner('请完成卡牌选择才能继续。');
        return;
      }
      setDeleteModalOpen(open);
      if (!open && cardActionContext?.mode === 'shop') {
        setCardActionContext(null);
      }
    },
    [cardActionContext, setHeroSkillBanner],
  );

  useEffect(() => {
    const activeCount = countActiveRowSlots(activeCards);
    const emptySlots = DUNGEON_COLUMN_COUNT - activeCount;
    const shouldCascade = emptySlots >= 4;

    logWaterfall('active-change', {
      activeCount,
      emptySlots,
      shouldCascade,
      pendingRemovals: pendingDungeonRemovalsRef.current,
      waterfallPending: waterfallPendingRef.current,
      lock: waterfallLockRef.current,
      animActive: waterfallAnimation.isActive,
    });

    if (!shouldCascade) {
      if (waterfallPendingRef.current) {
        logWaterfall('waterfall-pending-reset', { reason: 'threshold-not-met' });
      }
      waterfallPendingRef.current = false;
      return;
    }

    if (!waterfallPendingRef.current) {
      waterfallPendingRef.current = true;
      logWaterfall('waterfall-pending-set', { emptySlots });
    }

    if (
      waterfallPendingRef.current &&
      pendingDungeonRemovalsRef.current === 0 &&
      !waterfallLockRef.current &&
      !waterfallAnimation.isActive
    ) {
      logWaterfall('waterfall-trigger-from-effect', { emptySlots });
      waterfallPendingRef.current = false;
      triggerWaterfall();
    }
  }, [activeCards, waterfallAnimation.isActive, triggerWaterfall, resolvingDungeonCardId]);

  // Function to handle skill card effects - Defined early to be available for other handlers
  function handleSkillCard(card: GameCardData) {
    const knightCard = card as KnightCardData;
    
    if (card.isCurse) {
      applyDamage(3);
      finalizeMagicCard(card, { banner: '血咒吸取了 3 点生命。' });
      return;
    }
    
    if (card.magicType === 'instant') {
      // Execute instant skill effect
      switch (card.name) {
        // Base game skills
        case 'Cascade Reset': {
          cascadeResetWaterfallRef.current = true;
          const activeRowCards = flattenActiveRowSlots(activeCards);
          if (activeRowCards.length > 0) {
            setActiveCards(createEmptyActiveRow());
            setRemainingDeck(prev =>
              [...activeRowCards, ...prev].sort(() => Math.random() - 0.5),
            );
            setCanDrawFromBackpack(true);
            queueWaterfallTimeout(() => {
              triggerWaterfall();
            }, 50);
          } else {
            triggerWaterfall();
          }
          finalizeMagicCard(card, { banner: 'Cascade Reset shuffles the current wave.' });
          break;
        }
        case 'Tempest Volley': {
          const monsters = flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster');
          if (monsters.length === 0) {
            finalizeMagicCard(card, { banner: 'Tempest Volley fizzled (no monsters).' });
            break;
          }
          const volleyDamage = getSpellDamage(3);
          monsters.forEach((monster, index) => {
            if (!isMonsterEngaged(monster.id)) {
              beginCombat(monster, 'hero');
            }
            const animationDelay = index * Math.floor(COMBAT_ANIMATION_STAGGER * 0.75);
            dealDamageToMonster(monster, volleyDamage, { animationDelay, pulses: 2 });
          });
          finalizeMagicCard(card, { banner: `Tempest Volley strikes every foe for ${volleyDamage} damage!` });
          break;
        }
        case 'Echo Satchel': {
          const drawsRequested = waveDiscardCount;
          if (drawsRequested <= 0) {
            finalizeMagicCard(card, { banner: 'Echo Satchel had no cards to echo.' });
            break;
          }
          let drawsCompleted = 0;
          let currentHandSize = handCards.length;
          for (let i = 0; i < drawsRequested; i += 1) {
            if (currentHandSize >= 7) {
              break;
            }
            const cardDrawn = drawFromBackpackToHand();
            if (!cardDrawn) {
              break;
            }
            currentHandSize += 1;
            drawsCompleted += 1;
          }
          const banner =
            drawsCompleted > 0
              ? `Echo Satchel drew ${drawsCompleted} card${drawsCompleted > 1 ? 's' : ''} from the backpack.`
              : 'Echo Satchel could not draw (hand full or backpack empty).';
          finalizeMagicCard(card, { banner });
          break;
        }
        case 'Bulwark Slam': {
          const shields = getEquipmentSlots().filter(slot => slot.item?.type === 'shield');
          if (shields.length === 0) {
            finalizeMagicCard(card, { banner: 'Bulwark Slam fizzled (no shields equipped).' });
            break;
          }
          setPendingMagicAction({
            card,
            effect: 'bulwark-slam',
            step: 'slot-select',
            prompt: 'Select a shield slot to convert its armor into damage.',
          });
          setHeroSkillBanner('Bulwark Slam ready. Choose a shield.');
          break;
        }
        case 'Blood Reckoning': {
          const monsters = flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster');
          if (monsters.length === 0) {
            finalizeMagicCard(card, { banner: 'No monsters available for Blood Reckoning.' });
            break;
          }
          setPendingMagicAction({
            card,
            effect: 'blood-reckoning',
            step: 'monster-select',
            prompt: 'Select a monster to suffer your missing HP as damage.',
          });
          setHeroSkillBanner('Blood Reckoning awaits your target.');
          break;
        }
        case 'Eternal Repair': {
          const repairableSlots = getEquipmentSlots().filter(slot => {
            if (!slot.item) return false;
            const maxDurability = slot.item.maxDurability ?? slot.item.durability ?? 0;
            const currentDurability = slot.item.durability ?? maxDurability;
            return maxDurability > 0 && currentDurability < maxDurability;
          });
          if (repairableSlots.length === 0) {
            finalizeMagicCard(card, { banner: 'All equipment is already at full durability.' });
            break;
          }
          setPendingMagicAction({
            card,
            effect: 'eternal-repair',
            step: 'slot-select',
            prompt: 'Select equipment to restore to full durability.',
          });
          setHeroSkillBanner('Choose equipment to repair.');
          break;
        }
          
        // Knight weapon enhancement skills
        case 'Sharpening Stone':
          setWeaponMasterBonus(prev => prev + 1);
          break;
        case 'Dual Strike':
          // Double attack with current weapon
          break;
        case 'Weapon Surge':
          setNextWeaponBonus(prev => prev + 3);
          break;
        case 'Battle Ready':
          // Draw a weapon from class deck
          const weaponCards = classDeck.filter(c => c.type === 'weapon');
          if (weaponCards.length > 0) {
            const weapon = weaponCards[Math.floor(Math.random() * weaponCards.length)];
            setClassCardsInHand(prev => [...prev, weapon as KnightCardData]);
            setClassDeck(prev => prev.filter(c => c.id !== weapon.id));
          }
          break;
          
        // Knight defensive skills
        case 'Shield Wall':
          setNextShieldBonus(prev => prev + 2);
          setShieldMasterBonus(prev => prev + 2);
          break;
        case 'Defensive Stance':
          setDefensiveStanceActive(true);
          break;
        case 'Iron Defense':
          setTempShield(prev => prev + 5);
          break;
          
        // Knight blood skills
        case 'Blood Sacrifice':
          if (hp > 3) {
            applyDamage(3);
            setNextWeaponBonus(prev => prev + 3);
          }
          break;
        case 'Vampiric Strike':
          setVampiricNextAttack(true);
          break;
        case 'Blood for Power':
          if (hp > 5) {
            applyDamage(5);
            setGold(prev => prev + 10);
          }
          break;
        case 'Crimson Shield':
          if (hp > 2) {
            applyDamage(2);
            setTempShield(prev => prev + 6);
          }
          break;
        case 'Life Transfer':
          if (hp > 3) {
            applyDamage(3);
            setNextWeaponBonus(prev => prev + 3);
          }
          break;
          
        // Knight durability skills
        case 'Reinforced Equipment':
          setUnbreakableNext(true);
          break;
        case 'Repair Kit':
          // Would need to select from graveyard
          break;
        case 'Spare Weapons':
          // Equip 2 weapons from backpack
          break;
        case 'Emergency Repair':
          // Restore durability to current equipment
          const slots = getEquipmentSlots();
          slots.forEach(slot => {
            if (slot.item && slot.item.durability) {
              const repaired = { ...slot.item, durability: Math.min(slot.item.maxDurability || 3, slot.item.durability + 2) };
              setEquipmentSlotById(slot.id, repaired);
            }
          });
          break;
        case 'Salvage':
          // Break equipment for gold
          break;
        case 'Field Maintenance':
          // All equipment +1 durability
          const allSlots = getEquipmentSlots();
          allSlots.forEach(slot => {
            if (slot.item && slot.item.durability) {
              const maintained = { ...slot.item, durability: slot.item.durability + 1, maxDurability: (slot.item.maxDurability || slot.item.durability) + 1 };
              setEquipmentSlotById(slot.id, maintained);
            }
          });
          break;
      }
      
      // Handle class card removal
      if (knightCard.classCard) {
        setClassCardsInHand(prev => prev.filter(c => c.id !== card.id));
      }
      
      addToGraveyard(card);
      removeCard(card.id, false);
    } else if (card.skillType === 'permanent') {
      // Add permanent skill effect
      setPermanentSkills(prev => [...prev, card.skillEffect || card.name]);
      
      // Handle Knight permanent skills
      if (card.name === 'Berserker Rage' || card.name === 'Battle Frenzy') {
        // These are calculated in attackBonus
      }
      
      if (knightCard.classCard) {
        setClassCardsInHand(prev => prev.filter(c => c.id !== card.id));
      }
      
      addToGraveyard(card);
      removeCard(card.id, false);
    }
  };

  function handleSellCard(item: any) {
    const itemType = item.type as CardType;
    
    // Only allow selling defined card types
    if (!isSellableType(itemType)) {
      return;
    }
    if (isPermanentMagicCard(item)) {
      setHeroSkillBanner('Permanent magic returns to your backpack and cannot be discarded.');
      resetDragState();
      return;
    }
    
    const sellValue = item.value;
    setGold(prev => prev + sellValue);

    const sellItem = item as GameCardData & { fromSlot?: EquipmentSlotId | 'amulet' };
    const immediateOrigin: DragOrigin | null =
      sellItem.fromSlot === 'amulet'
        ? 'amulet'
        : sellItem.fromSlot === 'equipmentSlot1' || sellItem.fromSlot === 'equipmentSlot2'
          ? sellItem.fromSlot
          : draggedCardSource;

    const fallbackOrigin: DragOrigin | null =
      immediateOrigin ??
      (amuletSlots.some(slot => slot?.id === sellItem.id)
        ? 'amulet'
        : equipmentSlot1?.id === sellItem.id
          ? 'equipmentSlot1'
          : equipmentSlot2?.id === sellItem.id
            ? 'equipmentSlot2'
            : handCards.some(c => c.id === sellItem.id)
              ? 'hand'
              : backpackItems.some(c => c.id === sellItem.id)
                ? 'backpack'
                : null);

    // Add to graveyard with original identity
    const { fromSlot, ...cardToGraveyard } = sellItem;
    addToGraveyard(cardToGraveyard);

    switch (fallbackOrigin) {
      case 'equipmentSlot1':
      case 'equipmentSlot2':
        clearEquipmentSlotById(fallbackOrigin);
        break;
      case 'amulet':
        setAmuletSlots(prev => prev.filter(slot => slot?.id !== sellItem.id));
        break;
      case 'hand':
        consumeCardFromHand(sellItem);
        break;
      case 'backpack':
        setBackpackItems(prev => prev.filter(c => c.id !== sellItem.id));
        break;
      default:
      // Item from dungeon - use removeCard to properly trigger waterfall (don't add to graveyard again)
        removeCard(sellItem.id, false);
      setCardsPlayed(prev => prev + 1);
        break;
    }

    resetDragState();
  };

  const applyDamage = useCallback(
    (damage: number, source: 'combat' | 'general' = 'general') => {
      let remainingDamage = Math.max(0, Math.floor(damage));
      if (remainingDamage <= 0) {
        return 0;
      }

      const hasShieldEquipped =
        Boolean(equipmentSlot1 && equipmentSlot1.type === 'shield') ||
        Boolean(equipmentSlot2 && equipmentSlot2.type === 'shield');
      const hadShieldProtection = tempShield > 0 || hasShieldEquipped;

      setTempShield(prev => {
        if (prev <= 0 || remainingDamage <= 0) {
          return prev;
        }
        const absorbed = Math.min(prev, remainingDamage);
        remainingDamage -= absorbed;
        return prev - absorbed;
      });

      if (remainingDamage <= 0) {
        return 0;
      }

      if (amuletEffects.hasGuardian && hadShieldProtection && source === 'combat') {
        return 0;
      }

      setTakingDamage(true);
      setTimeout(() => setTakingDamage(false), 200);
      triggerHeroBleedAnimation();

      let appliedDamage = 0;
      setHp(prev => {
        const newHp = Math.max(0, prev - remainingDamage);
        appliedDamage = prev - newHp;
        if (newHp === 0) {
          setGameOver(true);
          setVictory(false);
        }
        return newHp;
      });

      if (appliedDamage > 0) {
        setTotalDamageTaken(prev => prev + appliedDamage);
      }

      return appliedDamage;
    },
    [
      amuletEffects.hasGuardian,
      equipmentSlot1,
      equipmentSlot2,
      tempShield,
      triggerHeroBleedAnimation,
    ],
  );

  const cancelHeroSkillAction = useCallback(() => {
    setPendingHeroSkillAction(null);
    setHeroSkillBanner(null);
    setHeroSkillArrow(null);
  }, []);

  const handleHeroSkillUse = useCallback(() => {
    if (!selectedHeroSkillDef) {
      setHeroSkillBanner(null);
      return;
    }
    if (selectedHeroSkillDef.type === 'passive') {
      setHeroSkillBanner('Passive skill is always active.');
      return;
    }
    if (heroSkillUsedThisWave) {
      setHeroSkillBanner('Hero skill already used this wave.');
      return;
    }
    if (pendingHeroSkillAction) {
      setHeroSkillBanner('Finish the current hero skill action first.');
      return;
    }
    if (waterfallActive) {
      setHeroSkillBanner('Wait for the waterfall to finish before using the skill.');
      return;
    }

    switch (selectedHeroSkillDef.id) {
      case 'armor-pact':
        if (handCards.length === 0) {
          setHeroSkillBanner('You need cards in hand to make this offering.');
          return;
        }
        setHandCards(prev => {
          if (prev.length > 0) {
            prev.forEach(card => addToGraveyard(card));
          }
          return [];
        });
        setPendingHeroSkillAction({ skillId: 'armor-pact', type: 'slot' });
        setHeroSkillBanner(selectedHeroSkillDef.statusHint ?? 'Select a slot to gain +1 armor.');
        break;
      case 'durability-for-blood':
        if (!equipmentSlot1 && !equipmentSlot2) {
          setHeroSkillBanner('Equip a weapon or shield before reinforcing.');
          return;
        }
        setPendingHeroSkillAction({ skillId: 'durability-for-blood', type: 'slot' });
        setHeroSkillBanner(selectedHeroSkillDef.statusHint ?? 'Select an equipped slot to repair.');
        break;
      case 'blood-strike':
        if (!activeCards.some(card => card?.type === 'monster')) {
          setHeroSkillBanner('No monsters available to strike.');
          return;
        }
        setPendingHeroSkillAction({ skillId: 'blood-strike', type: 'monster', baseDamage: 3 });
        setHeroSkillBanner(`Select a monster to deal ${getSpellDamage(3)} damage.`);
        break;
      default:
        break;
    }
  }, [
    activeCards,
    addToGraveyard,
    equipmentSlot1,
    equipmentSlot2,
    heroSkillUsedThisWave,
    handCards,
    pendingHeroSkillAction,
    selectedHeroSkillDef,
    setHandCards,
    waterfallActive,
    getSpellDamage,
  ]);


  const handleHeroSkillSlotSelection = useCallback(
    (slotId: EquipmentSlotId) => {
      if (!pendingHeroSkillAction || pendingHeroSkillAction.type !== 'slot') {
        return;
      }

      if (pendingHeroSkillAction.skillId === 'armor-pact') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (slotItem) {
          setHeroSkillBanner('Select an empty slot to gain +1 permanent armor.');
          return;
        }
        setEquipmentSlotBonus(slotId, 'shield', current => current + 1);
        setHeroSkillUsedThisWave(true);
        setPendingHeroSkillAction(null);
        setHeroSkillBanner('Slot armor increased permanently by 1.');
        setHeroSkillArrow(null);
        return;
      }

      if (pendingHeroSkillAction.skillId === 'durability-for-blood') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          setHeroSkillBanner('Equip an item in that slot first.');
          return;
        }
        const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
        const currentDurability = slotItem.durability ?? maxDurability;
        if (maxDurability === 0) {
          setHeroSkillBanner('This item cannot gain durability.');
          return;
        }
        if (currentDurability >= maxDurability) {
          setHeroSkillBanner('That item is already at full durability.');
          return;
        }

        const updatedItem = {
          ...slotItem,
          durability: Math.min(maxDurability, currentDurability + 1),
        };
        setEquipmentSlotById(slotId, updatedItem);
        applyDamage(2);
        setHeroSkillUsedThisWave(true);
        setPendingHeroSkillAction(null);
        setHeroSkillBanner('Durability increased by 1.');
        setHeroSkillArrow(null);
      }
    },
    [
      applyDamage,
      equipmentSlot1,
      equipmentSlot2,
      pendingHeroSkillAction,
      setEquipmentSlotBonus,
      setEquipmentSlotById,
    ],
  );

  const handleMagicSlotSelection = useCallback(
    (slotId: EquipmentSlotId) => {
      if (!pendingMagicAction || pendingMagicAction.step !== 'slot-select') {
        return;
      }

      if (pendingMagicAction.effect === 'bulwark-slam') {
        const baseDamage = calculateSlotArmorValue(slotId);
        if (baseDamage <= 0) {
          setHeroSkillBanner('Select a shield with armor to use Bulwark Slam.');
          return;
        }
        const displayDamage = getSpellDamage(baseDamage);
        setPendingMagicAction({
          card: pendingMagicAction.card,
          effect: 'bulwark-slam',
          step: 'monster-select',
          slotId,
          pendingDamage: baseDamage,
          prompt: `Select a monster to take ${displayDamage} damage.`,
        });
        setHeroSkillBanner(`Bulwark Slam armed for ${displayDamage} damage.`);
        return;
      }

      if (pendingMagicAction.effect === 'eternal-repair') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          setHeroSkillBanner('Equip an item in that slot first.');
          return;
        }
        const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
        const currentDurability = slotItem.durability ?? maxDurability;
        if (maxDurability === 0) {
          setHeroSkillBanner('This equipment has no durability to restore.');
          return;
        }
        if (currentDurability >= maxDurability) {
          setHeroSkillBanner('That equipment is already at full durability.');
          return;
        }
        setEquipmentSlotById(slotId, {
          ...slotItem,
          durability: maxDurability,
        });
        finalizeMagicCard(pendingMagicAction.card, {
          banner: `${slotItem.name} is fully repaired.`,
        });
      }
    },
    [
      calculateSlotArmorValue,
      equipmentSlot1,
      equipmentSlot2,
      getSpellDamage,
      finalizeMagicCard,
      pendingMagicAction,
      setEquipmentSlotById,
    ],
  );

  const handlePotionSlotSelection = useCallback(
    (slotId: EquipmentSlotId) => {
      if (!pendingPotionAction || pendingPotionAction.step !== 'slot-select') {
        return;
      }

      if (pendingPotionAction.effect === 'repair-equipment') {
        const succeeded = resolvePotionRepairForSlot(
          slotId,
          pendingPotionAction.card,
          pendingPotionAction.amount,
          pendingPotionAction.allowedTypes,
        );
        if (succeeded) {
          setPendingPotionAction(null);
        }
      }
    },
    [resolvePotionRepairForSlot, pendingPotionAction, setPendingPotionAction],
  );

  const handleHeroSkillMonsterSelection = useCallback(
    (monster: GameCardData) => {
      if (!pendingHeroSkillAction || pendingHeroSkillAction.type !== 'monster') {
        return;
      }
      if (pendingHeroSkillAction.skillId !== 'blood-strike') {
        return;
      }

      if (!isMonsterEngaged(monster.id)) {
        beginCombat(monster, 'hero');
      }

      applyDamage(3);
      const heroSkillDamage = getSpellDamage(pendingHeroSkillAction.baseDamage ?? 3);
      dealDamageToMonster(monster, heroSkillDamage, { pulses: 2 });

      setHeroSkillUsedThisWave(true);
      setPendingHeroSkillAction(null);
      setHeroSkillBanner(`Crimson Strike dealt ${heroSkillDamage} damage.`);
      setHeroSkillArrow(null);
    },
    [
      applyDamage,
      dealDamageToMonster,
      getSpellDamage,
      pendingHeroSkillAction,
    ],
  );

  const handleMagicMonsterSelection = useCallback(
    (monster: GameCardData) => {
      if (!pendingMagicAction || pendingMagicAction.step !== 'monster-select') {
        return;
      }

      if (pendingMagicAction.effect === 'bulwark-slam') {
        const baseDamage = pendingMagicAction.pendingDamage;
        if (baseDamage <= 0) {
          setHeroSkillBanner('Bulwark Slam needs armor to deal damage.');
          return;
        }
        const totalDamage = getSpellDamage(baseDamage);
        if (!isMonsterEngaged(monster.id)) {
          beginCombat(monster, 'hero');
        }
        dealDamageToMonster(monster, totalDamage, {
          animationDelay: Math.floor(COMBAT_ANIMATION_STAGGER / 2),
          pulses: 2,
        });
        finalizeMagicCard(pendingMagicAction.card, {
          banner: `Bulwark Slam dealt ${totalDamage} damage.`,
        });
        return;
      }

      if (pendingMagicAction.effect === 'blood-reckoning') {
        const missingHp = Math.max(0, maxHp - hp);
        if (missingHp <= 0) {
          finalizeMagicCard(pendingMagicAction.card, {
            banner: 'You are at full HP. Blood Reckoning dealt no damage.',
          });
          return;
        }
        const totalDamage = getSpellDamage(missingHp);
        if (!isMonsterEngaged(monster.id)) {
          beginCombat(monster, 'hero');
        }
        dealDamageToMonster(monster, totalDamage, { pulses: 2 });
        finalizeMagicCard(pendingMagicAction.card, {
          banner: `Blood Reckoning dealt ${totalDamage} damage.`,
        });
      }
    },
    [
      beginCombat,
      dealDamageToMonster,
      finalizeMagicCard,
      getSpellDamage,
      hp,
      isMonsterEngaged,
      maxHp,
      pendingMagicAction,
      setHeroSkillBanner,
    ],
  );

  const handleSlotTargetSelection = useCallback(
    (slotId: EquipmentSlotId) => {
      if (pendingPotionAction?.step === 'slot-select') {
        handlePotionSlotSelection(slotId);
        return;
      }
      if (pendingMagicAction?.step === 'slot-select') {
        handleMagicSlotSelection(slotId);
        return;
      }
      if (pendingHeroSkillAction?.type === 'slot') {
        handleHeroSkillSlotSelection(slotId);
      }
    },
    [
      handleHeroSkillSlotSelection,
      handleMagicSlotSelection,
      handlePotionSlotSelection,
      pendingHeroSkillAction,
      pendingMagicAction,
      pendingPotionAction,
    ],
  );

  const handleMonsterTargetSelection = useCallback(
    (monster: GameCardData) => {
      if (pendingMagicAction?.step === 'monster-select') {
        handleMagicMonsterSelection(monster);
        return;
      }
      if (pendingHeroSkillAction?.type === 'monster') {
        handleHeroSkillMonsterSelection(monster);
      }
    },
    [handleHeroSkillMonsterSelection, handleMagicMonsterSelection, pendingHeroSkillAction, pendingMagicAction],
  );

  function handleWeaponToMonster(weapon: any, monster: GameCardData) {
    const slotId = weapon.fromSlot as EquipmentSlotId | undefined;
    if (!slotId) {
      return;
    }

    if (!isMonsterEngaged(monster.id)) {
      beginCombat(monster, 'hero');
    }

    performHeroAttack(slotId, monster);
  };

  function handleCardToHero(card: GameCardData) {
    if (isCardFromEquipmentSlot(card)) {
      // Equipped items can only attack monsters or be discarded.
      return;
    }
    if (isEquipmentCard(card)) {
      return; // equipment cannot be played directly on hero
    }
    // Check if card is from hand (play normally) or from dungeon (purchase)
    const isFromHand = isCardFromHand(card);
    
    if (isFromHand) {
      if (!consumeCardFromHand(card)) {
        resetDragState();
        return;
      }

      if (card.type === 'monster') {
        beginCombat(card, 'monster');
      } else if (card.type === 'potion') {
        handlePotionConsumption(card);
      } else if (card.type === 'magic') {
        handleSkillCard(card);
      } else if (card.type === 'event') {
        startEventResolution(null, 'hand');
        setCurrentEventCard(card);
        setEventModalOpen(true);
        resetDragState();
        return;
      }
    } else {
      // Purchasing from dungeon - auto-equip/use
      if (card.type === 'potion') {
        handlePotionConsumption(card);
        removeCard(card.id, false);
      } else if (card.type === 'magic') {
        handleSkillCard(card);
        removeCard(card.id, false);
      } else if (card.type === 'event') {
        startEventResolution(card.id, 'dungeon');
        setCurrentEventCard(card);
        setEventModalOpen(true);
        resetDragState();
        return;
      } else if (card.type === 'monster') {
        beginCombat(card, 'monster');
      } else {
        // Other card types go to backpack
        if (canCardGoToBackpack(card) && backpackItems.length < 10) {
          setBackpackItems(prev => [card, ...prev]);
    // // toast({ title: 'Item Stored!', description: `${card.name} added to backpack` });
          removeCard(card.id, false);
        } else {
    // // toast({ 
            // title: 'Backpack Full!', 
            // description: 'Cannot store more items',
            // variant: 'destructive'
          // });
        }
      }
    }
    resetDragState();
  };

  const isEquipmentCard = (card: GameCardData) =>
    (EQUIPMENT_TYPES as readonly CardType[]).includes(card.type);
  const isConsumableCard = (card: GameCardData) =>
    (CONSUMABLE_TYPES as readonly CardType[]).includes(card.type);
  const isPermanentMagicCard = (
    card: GameCardData | null | undefined,
  ): card is GameCardData => Boolean(card && card.type === 'magic' && card.magicType === 'permanent');
  const canCardGoToBackpack = (card: GameCardData) => {
    if (card.type === 'event') return false;
    if (card.type === 'monster') return false;
    return true;
  };
  const canCardDropOnHero = (card: GameCardData | null) => {
    if (!card) return false;
    if (card.type === 'monster') return true;
    if (isConsumableCard(card)) return true;
    if (card.type === 'event') return true;
    return false;
  };
  const isSellableType = (type: CardType) => (SELLABLE_TYPES as readonly CardType[]).includes(type);
  const isCardFromEquipmentSlot = (
    card: GameCardData | null | undefined,
  ): card is GameCardData & { fromSlot: EquipmentSlotId } => {
    if (!card) {
      return false;
    }
    const origin = (card as GameCardData & { fromSlot?: string }).fromSlot;
    return origin === 'equipmentSlot1' || origin === 'equipmentSlot2';
  };

  function handleCardToSlot(card: GameCardData, slotId: string) {
    if (slotId === 'slot-amulet') {
      if (card.type !== 'amulet') {
        return;
      }
      if (isCardFromEquipmentSlot(card)) {
        resetDragState();
        return;
      }

      let displacedAmulet: AmuletItem | null = null;

      setAmuletSlots(prev => {
        const alreadyEquipped = prev.some(slot => slot?.id === card.id);
        const filtered = prev.filter(slot => slot?.id !== card.id);
        const next = [...filtered];

        if (!alreadyEquipped && next.length >= MAX_AMULET_SLOTS) {
          displacedAmulet = next.shift() ?? null;
        }

        const updated = [...next, { ...card, fromSlot: 'amulet' } as AmuletItem];
        return updated.slice(-MAX_AMULET_SLOTS);
      });

      if (displacedAmulet) {
        addToGraveyard(displacedAmulet);
      }

      if (isCardFromHand(card)) {
        if (!consumeCardFromHand(card)) {
          return;
        }
      } else if (backpackItems.some(c => c.id === card.id)) {
        setBackpackItems(prev => prev.filter(c => c.id !== card.id));
      } else {
        removeCard(card.id, false);
      }

      resetDragState();
    } else if (slotId === 'slot-backpack') {
      if (!canCardGoToBackpack(card)) {
        return;
      }
      if (isCardFromEquipmentSlot(card)) {
        resetDragState();
        return;
      }
      // Check if card is coming from hand - prevent dropping back to backpack
      if (handCards.some(c => c.id === card.id)) {
        return;
      }

      // Check if backpack is full
      if (backpackItems.length >= backpackCapacity) {
    // // toast({ title: 'Backpack Full!', description: 'Maximum 10 items', variant: 'destructive' });
        return;
      }

      const cardWithOrigin = card as GameCardData & { fromSlot?: DragOrigin };
      const fromAmuletSlot =
        cardWithOrigin.fromSlot === 'amulet' || amuletSlots.some(slot => slot?.id === card.id);
      if (fromAmuletSlot) {
        setAmuletSlots(prev => prev.filter(slot => slot?.id !== card.id));
      }
      
      addCardToBackpack(card);
      if (!fromAmuletSlot) {
        removeCard(card.id, false);
      }
      resetDragState();
    } else if (slotId.startsWith('slot-equipment')) {
      const equipSlot: EquipmentSlotId = slotId === 'slot-equipment-1' ? 'equipmentSlot1' : 'equipmentSlot2';
      const equippedItem = equipSlot === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      
      if (card.type === 'monster') {
        beginCombat(card, 'monster');
        resetDragState();
        return;
      }

      if (isCardFromEquipmentSlot(card)) {
        resetDragState();
        return;
      }

      if (card.type !== 'weapon' && card.type !== 'shield') {
        return;
      }

      // Equip weapon or shield and immediately discard any displaced item
      // Preserve durability from the card
      if (equippedItem && equippedItem.id !== card.id) {
        addToGraveyard(equippedItem);
      }
      setEquipmentSlotById(equipSlot, { ...card } as EquipmentItem);
    // // toast({ 
        // title: `${card.type === 'weapon' ? 'Weapon' : 'Shield'} Equipped!`,
        // description: card.durability ? `${card.durability}/${card.maxDurability} uses` : undefined
      // });
      if (isCardFromHand(card)) {
        if (!consumeCardFromHand(card)) {
          return;
        }
      } else {
        removeCard(card.id, false);
      }
      resetDragState();
    }
  };

  const handleEventChoice = async (choiceIndex: number) => {
    if (!currentEventCard || !currentEventCard.eventChoices) return;
    
    const choice = currentEventCard.eventChoices[choiceIndex];
    if (!choice) return;

    if (eventChoiceStates[choiceIndex]?.disabled) {
      return;
    }

    const effects = normalizeEventEffect(choice.effect);
    if (choice.diceTable?.length) {
      const diceResult = await requestDiceOutcome({
        title: currentEventCard.name,
        subtitle: choice.text,
        entries: choice.diceTable,
      });
      if (!diceResult) {
        return;
      }
      effects.push(...normalizeEventEffect(diceResult.effect));
    }

    let eventResolutionDeferred = false;
    
    for (const effect of effects) {
      if (effect === 'none') continue;
      
      if (effect.startsWith('hp-')) {
        const damage = parseInt(effect.replace('hp-', ''), 10);
        applyDamage(damage);
      } else if (effect.startsWith('heal+')) {
        const healAmount = parseInt(effect.replace('heal+', ''), 10);
        healHero(healAmount);
      } else if (effect === 'fullheal') {
        healHero(maxHp);
      } else if (effect.startsWith('gold-')) {
        const goldLost = parseInt(effect.replace('gold-', ''), 10);
        if (gold >= goldLost) {
          setGold(prev => prev - goldLost);
        } else {
          setEventModalOpen(false);
          setCurrentEventCard(null);
          finalizeEventResolution({ removeFromDungeon: false });
          return;
        }
      } else if (effect.startsWith('gold+')) {
        const goldGain = parseInt(effect.replace('gold+', ''), 10);
        setGold(prev => prev + goldGain);
      } else if (effect.startsWith('maxhpperm+')) {
        const bonus = parseInt(effect.replace('maxhpperm+', ''), 10);
        if (!Number.isNaN(bonus)) {
          setPermanentMaxHpBonus(prev => prev + bonus);
        }
      } else if (effect === 'weapon') {
        const weaponValue = Math.floor(Math.random() * 3) + 3;
        console.debug('[Event] Placeholder weapon reward', weaponValue);
      } else if (effect === 'permanentskill') {
        const randomSkill = ['Iron Skin', 'Weapon Master'][Math.floor(Math.random() * 2)];
        setPermanentSkills(prev => [...prev, randomSkill]);
      } else if (effect === 'flipToCurse') {
        if (currentEventCard) {
          const curseCard = createCurseCard(currentEventCard);
          await triggerEventTransform(currentEventCard, curseCard);
          addCardToBackpack(curseCard);
          setHeroSkillBanner('卷轴翻转化为血咒，潜入了你的背包。');
        }
      } else if (effect === 'addCurse') {
        const curseCard = createCurseCard(currentEventCard || undefined);
        addCardToBackpack(curseCard);
        setHeroSkillBanner('一张血咒潜入了你的背包。');
      } else if (effect === 'discardHandAll') {
        const hadCards = handCards.length;
        discardAllHandCards();
        if (hadCards > 0) {
          setHeroSkillBanner('你弃掉了全部手牌。');
        } else {
          setHeroSkillBanner('没有手牌可以弃掉。');
        }
      } else if (effect.startsWith('backpackSize-')) {
        const reduction = Math.abs(parseInt(effect.replace('backpackSize-', ''), 10)) || 0;
        if (reduction > 0) {
          setBackpackCapacityModifier(prev => prev - reduction);
          setHeroSkillBanner(`背包容量永久降低 ${reduction}。`);
        }
      } else if (effect.startsWith('shopLevel+')) {
        const amount = parseInt(effect.replace('shopLevel+', ''), 10) || 1;
        setShopLevel(prev => {
          const next = Math.max(0, prev + amount);
          setHeroSkillBanner(`商店等级提升到 Lv.${next}`);
          return next;
        });
      } else if (effect.startsWith('spellDamage+')) {
        const amount = parseInt(effect.replace('spellDamage+', ''), 10) || 1;
        setPermanentSpellDamageBonus(prev => {
          const next = prev + amount;
          setHeroSkillBanner(`法术伤害永久 +${amount}（当前 +${next}）。`);
          return next;
        });
      } else if (effect.startsWith('discardCards:')) {
        const discardCount = parseInt(effect.replace('discardCards:', ''), 10) || 1;
        const success = await requestCardAction('discard', discardCount, {
          title: `弃置 ${discardCount} 张卡牌`,
          description: '从手牌或背包中选择要弃置的卡牌。',
        });
        if (!success) {
          setHeroSkillBanner('没有足够的卡牌可供弃置。');
          break;
        }
      } else if (effect.startsWith('deleteCard')) {
        const [, countText] = effect.split(':');
        const deleteCount = countText ? parseInt(countText, 10) : 1;
        const success = await requestCardAction('delete', deleteCount, {
          title: `删除 ${deleteCount} 张卡牌`,
          description: '被删除的卡牌会被送入坟场，永久离开你的牌库。',
        });
        if (!success) {
          setHeroSkillBanner('没有足够的卡牌可供删除。');
          break;
        }
      } else if (effect === 'graveyardDiscover') {
        const selected = await requestGraveyardSelection(3);
        if (selected) {
          setHeroSkillBanner(`你从坟场带回了 ${selected.name}。`);
        } else {
          setHeroSkillBanner('坟场中没有可召回的卡牌。');
        }
      } else if (effect.startsWith('drawHeroCards:')) {
        const drawCount = parseInt(effect.replace('drawHeroCards:', ''), 10) || 1;
        const drawn = drawCardsFromBackpack(drawCount);
        if (drawn > 0) {
          setHeroSkillBanner(`从背包抽到了 ${drawn} 张牌。`);
        } else {
          setHeroSkillBanner('背包为空或手牌已满，无法抽牌。');
        }
      } else if (effect === 'removeAllAmulets') {
        if (amuletSlots.length) {
          amuletSlots.forEach(amulet => addToGraveyard(amulet));
          setAmuletSlots([]);
          setHeroSkillBanner('所有护符都被粉碎了。');
        } else {
          setHeroSkillBanner('你没有佩戴护符。');
        }
      } else if (effect === 'destroyEquipment:any') {
        const slotsWithItems = getEquipmentSlots().filter(slot => slot.item);
        if (!slotsWithItems.length) {
          continue;
        }
        if (slotsWithItems.length === 1) {
          sacrificeEquipment(slotsWithItems[0].id);
        } else {
          const selected = await requestEquipmentSelection({
            prompt: '选择要破坏的装备',
            subtext: '左或右装备栏至少保留一件。',
          });
          if (selected) {
            sacrificeEquipment(selected);
          }
        }
      } else if (effect === 'slotLeftDamage+1') {
        setEquipmentSlotBonus('equipmentSlot1', 'damage', value => value + 1);
      } else if (effect === 'slotRightDefense+1') {
        setEquipmentSlotBonus('equipmentSlot2', 'shield', value => value + 1);
      } else if (effect === 'swapEquipmentSlots') {
        swapEquipmentSlots();
      } else if (effect === 'discardLeftForGold+15') {
        if (sacrificeEquipment('equipmentSlot1')) {
          setGold(prev => prev + 15);
        }
      } else if (effect === 'discardRightForGold+15') {
        if (sacrificeEquipment('equipmentSlot2')) {
          setGold(prev => prev + 15);
        }
      } else if (effect === 'amuletsToGold+10') {
        convertAmuletsToGold(10);
      } else if (effect === 'classBottom+2') {
        gainClassDeckBottomCards(2);
      } else if (effect === 'drawKnight3') {
        const drawn = drawClassCardsToBackpack(3, 'drawKnight3');
        triggerClassDeckFlight(drawn);
      } else if (effect === 'equipKnight') {
        const equipmentCards = classDeck.filter(c => c.type === 'weapon' || c.type === 'shield');
        if (equipmentCards.length > 0) {
          const equipment = equipmentCards[Math.floor(Math.random() * equipmentCards.length)];
          if (!equipmentSlot1) {
            setEquipmentSlot1({ ...equipment } as EquipmentItem);
          } else if (!equipmentSlot2) {
            setEquipmentSlot2({ ...equipment } as EquipmentItem);
          }
          setClassDeck(prev => prev.filter(c => c.id !== equipment.id));
        }
      } else if (effect === 'useKnightSkill') {
        const skillCards = classDeck.filter(c => c.type === 'skill' && c.skillType === 'instant');
        if (skillCards.length > 0) {
          const skill = skillCards[Math.floor(Math.random() * skillCards.length)];
          setClassDeck(prev => prev.filter(c => c.id !== skill.id));
          handleSkillCard(skill);
        }
      } else if (effect === 'weaponUpgrade' || effect === 'weaponUpgrade2') {
        const upgradAmount = effect === 'weaponUpgrade2' ? 2 : 2;
        if (equipmentSlot1?.type === 'weapon') {
          setEquipmentSlot1(prev => (prev ? { ...prev, value: prev.value + upgradAmount } : null));
        } else if (equipmentSlot2?.type === 'weapon') {
          setEquipmentSlot2(prev => (prev ? { ...prev, value: prev.value + upgradAmount } : null));
        }
      } else if (effect === 'shieldUpgrade2') {
        if (equipmentSlot1?.type === 'shield') {
          setEquipmentSlot1(prev => (prev ? { ...prev, value: prev.value + 2 } : null));
        } else if (equipmentSlot2?.type === 'shield') {
          setEquipmentSlot2(prev => (prev ? { ...prev, value: prev.value + 2 } : null));
        }
      } else if (effect === 'restoreShield') {
        const shields = discardedCards.filter(c => c.type === 'shield');
        if (shields.length > 0) {
          const shield = shields[shields.length - 1];
          const restoredShield: EquipmentItem = {
            ...shield,
            type: 'shield',
            durability: 3,
            maxDurability: 3,
          };
          if (!equipmentSlot1) {
            setEquipmentSlot1(restoredShield);
          } else if (!equipmentSlot2) {
            setEquipmentSlot2(restoredShield);
          }
          setDiscardedCards(prev => prev.filter(c => c.id !== shield.id));
        }
      } else if (effect.startsWith('tempShield+')) {
        const shieldGain = parseInt(effect.replace('tempShield+', ''), 10);
        setTempShield(prev => prev + shieldGain);
      } else if (effect === 'bloodEmpower') {
        const empoweredSlot = findWeaponSlot();
        if (empoweredSlot?.item) {
          const empoweredWeapon: EquipmentItem = {
            ...empoweredSlot.item,
            value: empoweredSlot.item.value + 2,
          };
          setEquipmentSlotById(empoweredSlot.id, empoweredWeapon);
        } else {
          setGold(prev => prev + 5);
        }
      } else if (effect === 'draw2') {
        const drawn = drawClassCardsToBackpack(2, 'draw2');
        triggerClassDeckFlight(drawn);
      } else if (effect === 'drawClass2') {
        const drawn = drawClassCardsToBackpack(2, 'drawClass2');
        triggerClassDeckFlight(drawn);
      } else if (effect === 'drawKnight1') {
        const drawn = drawClassCardsToBackpack(1, 'drawKnight1');
        triggerClassDeckFlight(drawn);
      } else if (effect === 'drawKnight4') {
        const drawn = drawClassCardsToBackpack(4, 'drawKnight4');
        triggerClassDeckFlight(drawn);
      } else if (effect === 'drawSkill') {
        const drawn = drawClassCardsToBackpack(1, 'drawSkill', card => card.type === 'skill');
        triggerClassDeckFlight(drawn);
      } else if (effect === 'drawEquipment') {
        const drawn = drawClassCardsToBackpack(
          2,
          'drawEquipment',
          card => card.type === 'weapon' || card.type === 'shield',
        );
        triggerClassDeckFlight(drawn);
      } else if (effect === 'discoverClass') {
        const started = beginDiscoverFlow(effect);
        if (started) {
          eventResolutionDeferred = true;
          break;
        } else {
          handleDiscoverFallback();
        }
      } else if (effect === 'openShop') {
        const started = startShopFlow(currentEventCard);
        if (started) {
          eventResolutionDeferred = true;
          break;
        }
      } else if (effect === 'repairAll') {
        const slots = getEquipmentSlots();
        slots.forEach(slot => {
          if (slot.item) {
            const repaired = { 
              ...slot.item, 
              durability: slot.item.maxDurability || 3,
              maxDurability: slot.item.maxDurability || 3,
            };
            setEquipmentSlotById(slot.id, repaired);
          }
        });
      }
    }
    
    if (eventResolutionDeferred) {
      return;
    }
    
    completeCurrentEvent();
  };

  const handlePlayCardFromHand = (card: GameCardData, target?: any) => {
    if (!consumeCardFromHand(card)) {
      return;
    }

    // Process the card play based on its type
    if (card.type === 'potion') {
      handlePotionConsumption(card);
    } else if (card.type === 'weapon' || card.type === 'shield') {
      // Handle equipment cards
      const emptySlot = !equipmentSlot1 ? 'equipmentSlot1' : !equipmentSlot2 ? 'equipmentSlot2' : null;
      if (emptySlot) {
        setEquipmentSlotById(emptySlot, { ...card } as EquipmentItem);
    // // toast({ title: `${card.type === 'weapon' ? 'Weapon' : 'Shield'} Equipped!`, description: card.name });
      }
    }
    // More card types can be handled here
  };

  const handleBackpackClick = () => {
    if (playerTargetingActive) return;
    setBackpackViewerOpen(true);
  };

  const handleBackpackDrawClick = () => {
    if (!canDrawFromBackpack || waterfallAnimation.isActive || playerTargetingActive) return;
    drawFromBackpackToHand();
    setCanDrawFromBackpack(false);
  };

  const heroSkillTargeting = Boolean(pendingHeroSkillAction);
  const heroSkillSlotTargeting = pendingHeroSkillAction?.type === 'slot';
  const heroSkillMonsterTargeting = pendingHeroSkillAction?.type === 'monster';
  const magicTargeting = Boolean(pendingMagicAction);
  const magicSlotTargeting = pendingMagicAction?.step === 'slot-select';
  const magicMonsterTargeting = pendingMagicAction?.step === 'monster-select';
  const potionTargeting = Boolean(pendingPotionAction);
  const potionSlotTargeting = pendingPotionAction?.step === 'slot-select';
  const playerTargetingActive = heroSkillTargeting || magicTargeting || potionTargeting;
  const slotTargetingActive =
    heroSkillSlotTargeting || Boolean(magicSlotTargeting) || Boolean(potionSlotTargeting);
  const monsterTargetingActive = heroSkillMonsterTargeting || Boolean(magicMonsterTargeting);
  const heroSkillSlotLabel =
    pendingHeroSkillAction?.skillId === 'armor-pact'
      ? '+1 Armor'
      : pendingHeroSkillAction?.skillId === 'durability-for-blood'
        ? '+1 Durability'
        : 'Select Slot';
  const slotTargetingLabel = heroSkillSlotTargeting
    ? heroSkillSlotLabel
    : magicSlotTargeting
      ? pendingMagicAction?.prompt
      : potionSlotTargeting
        ? pendingPotionAction?.prompt
        : undefined;
  const heroSkillPrompt = pendingPotionAction?.prompt
    ? pendingPotionAction.prompt
    : pendingMagicAction?.prompt
      ? pendingMagicAction.prompt
      : heroSkillTargeting
        ? selectedHeroSkillDef?.statusHint ?? 'Complete the hero skill action.'
        : heroSkillBanner;
  const heroSkillDisabledReason = (() => {
    if (!selectedHeroSkillDef || selectedHeroSkillDef.type === 'passive') return undefined;
    if (heroSkillUsedThisWave) return 'Hero skill already used this wave.';
    if (waterfallActive) return 'Wait for the waterfall to finish.';
    return undefined;
  })();
  const heroSkillInfo =
    !showSkillSelection && selectedHeroSkillDef
      ? {
          name: selectedHeroSkillDef.name,
          effect: selectedHeroSkillDef.effect,
          buttonLabel:
            selectedHeroSkillDef.type === 'active'
              ? selectedHeroSkillDef.buttonLabel ?? 'Use Skill'
              : undefined,
          isPassive: selectedHeroSkillDef.type === 'passive',
          isReady:
            selectedHeroSkillDef.type === 'active' &&
            !heroSkillUsedThisWave &&
            !waterfallActive &&
            !playerTargetingActive,
          isUsed: selectedHeroSkillDef.type === 'active' ? heroSkillUsedThisWave : false,
          isPending: heroSkillTargeting,
          disabledReason: heroSkillDisabledReason,
        }
      : null;

  const isPotionSlotEligible = (slotId: EquipmentSlotId) => {
    if (!potionSlotTargeting || !pendingPotionAction || pendingPotionAction.step !== 'slot-select') {
      return false;
    }
    const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
    if (!slotItem || !slotItem.type) {
      return false;
    }
    if (!pendingPotionAction.allowedTypes.includes(slotItem.type)) {
      return false;
    }
    const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
    const currentDurability = slotItem.durability ?? maxDurability;
    return maxDurability > 0 && currentDurability < maxDurability;
  };

  const equipmentSlot1Highlight =
    slotTargetingActive && (!potionSlotTargeting || isPotionSlotEligible('equipmentSlot1'));
  const equipmentSlot2Highlight =
    slotTargetingActive && (!potionSlotTargeting || isPotionSlotEligible('equipmentSlot2'));

  const handleHeroSkillButtonClick = useCallback(() => {
    if (heroSkillTargeting) {
      cancelHeroSkillAction();
      return;
    }
    handleHeroSkillUse();
  }, [heroSkillTargeting, cancelHeroSkillAction, handleHeroSkillUse]);

  const updateHeroSkillArrowFromMouse = useCallback(
    (clientX?: number, clientY?: number) => {
      if (!heroSkillTargeting) {
        return;
      }
      const boardEl = boardRef.current;
      const buttonEl = heroSkillButtonRef.current;
      if (!boardEl || !buttonEl) {
        setHeroSkillArrow(null);
        return;
      }
      const boardRect = boardEl.getBoundingClientRect();
      const buttonRect = buttonEl.getBoundingClientRect();
      const start = {
        x: buttonRect.left + buttonRect.width / 2 - boardRect.left,
        y: buttonRect.top + buttonRect.height / 2 - boardRect.top,
      };
      const end =
        clientX !== undefined && clientY !== undefined
          ? { x: clientX - boardRect.left, y: clientY - boardRect.top }
          : start;
      setHeroSkillArrow({ start, end });
    },
    [heroSkillTargeting],
  );

  useEffect(() => {
    if (!heroSkillTargeting) {
      setHeroSkillArrow(null);
      return;
    }

    updateHeroSkillArrowFromMouse();

    const handleMouseMove = (event: MouseEvent) => {
      updateHeroSkillArrowFromMouse(event.clientX, event.clientY);
    };
    const handleReposition = () => updateHeroSkillArrowFromMouse();

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [heroSkillTargeting, updateHeroSkillArrowFromMouse]);
  const handleDragCardFromHand = (card: GameCardData) => {
    const targetingActive = playerTargetingActive;
    const isSpellCard = card.type === 'magic' || card.type === 'potion';
    if ((waterfallAnimation.isActive && !isSpellCard) || targetingActive) return;
    setDraggedCard(card);
    setDraggedCardSource('hand');
    updateHeroRowDropHighlight(card);
    startDragSession();
    // Card stays in hand until successfully dropped
  };

  const handleDragEndFromHand = () => {
    if (heroFrameDropIntentRef.current && draggedCardRef.current && isHeroRowHighlightCard(draggedCardRef.current)) {
      heroFrameDropIntentRef.current = false;
      handleCardToHero(draggedCardRef.current);
      return;
    }
    heroFrameDropIntentRef.current = false;
    setDraggedCard(null);
    setDraggedCardSource((current) => (current === 'hand' ? null : current));
    setHeroRowDropState(null);
  };
  
  // Handle drag start from dungeon cards
  const handleDragStartFromDungeon = (card: GameCardData) => {
    if (waterfallAnimation.isActive || playerTargetingActive) return;
    setDraggedCard(card);
    setDraggedCardSource('dungeon');
    setIsDraggingFromDungeon(true);
    setIsDraggingToHand(true); // Show hand acquisition zone
    updateHeroRowDropHighlight(card);
    startDragSession();
  };
  
  // Handle drag end from dungeon  
  const handleDragEndFromDungeon = () => {
    if (heroFrameDropIntentRef.current && draggedCardRef.current && isHeroRowHighlightCard(draggedCardRef.current)) {
      heroFrameDropIntentRef.current = false;
      handleCardToHero(draggedCardRef.current);
      return;
    }
    heroFrameDropIntentRef.current = false;
    setDraggedCard(null);
    setDraggedCardSource((current) => (current === 'dungeon' ? null : current));
    setIsDraggingFromDungeon(false);
    setIsDraggingToHand(false);
    setHeroRowDropState(null);
  };

  const engagedMonsters = getEngagedMonsterCards();
  const isWaterfallLocked = waterfallActive;
  const pendingBlock = combatState.pendingBlock;
  const showBlockButtons = Boolean(pendingBlock);
  useLayoutEffect(() => {
    updateHeroFramePosition();
  }, [
    updateHeroFramePosition,
    previewCards,
    activeCards,
    equipmentSlot1,
    equipmentSlot2,
    amuletSlots,
    backpackItems.length,
    classDeck.length,
    heroVariant,
    showBlockButtons,
  ]);
  const draggedCardIsSpell = draggedCard?.type === 'magic' || draggedCard?.type === 'potion';
  const heroRowInteractionLocked =
    playerTargetingActive || (isWaterfallLocked && !draggedCardIsSpell);
  const heroCardDropHighlight =
    !heroRowInteractionLocked &&
    canCardDropOnHero(draggedCard) &&
    !isHeroRowHighlightCard(draggedCard);
  const heroRowMagicDropActive =
    !heroRowInteractionLocked && isHeroRowHighlightCard(draggedCard);
  const canSellDraggedCard =
    draggedCard ? isSellableType(draggedCard.type) && !isPermanentMagicCard(draggedCard) : false;
  const canSellDraggedEquipment =
    draggedEquipment && draggedEquipment.type
      ? isSellableType(draggedEquipment.type as CardType)
      : false;
  const graveyardDropEnabled =
    !isWaterfallLocked &&
    !playerTargetingActive &&
    (canSellDraggedCard || canSellDraggedEquipment);
  const shouldHighlightGraveyard = graveyardDropEnabled && isDragSessionActive;
  const heroRowMagicDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!heroRowMagicDropActive) return;
    event.preventDefault();
  };
  const heroRowMagicDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!heroRowMagicDropActive || !draggedCard) return;
    event.preventDefault();
    event.stopPropagation();
    handleCardToHero(draggedCard);
  };
  const getHeroRowMagicDropHandlers = (
    slot: 'backpack' | 'other'
  ): {
    onDragOver?: (event: ReactDragEvent<HTMLDivElement>) => void;
    onDrop?: (event: ReactDragEvent<HTMLDivElement>) => void;
  } => {
    if (!heroRowMagicDropActive || slot === 'backpack') {
      return {};
    }
    return {
      onDragOver: heroRowMagicDragOver,
      onDrop: heroRowMagicDrop,
    };
  };
  const heroFrameDropEnabled = heroRowMagicDropActive;
  const isPointInsideHeroRowDropArea = useCallback(
    (clientX: number, clientY: number, card: GameCardData | null) => {
      if (!card || !isHeroRowHighlightCard(card)) {
        return false;
      }

      const frameRect =
        heroFrameRef.current?.getBoundingClientRect() ??
        (updateHeroFrameBounds(), heroFrameBoundsRef.current);

      if (!pointInsideRect(frameRect, clientX, clientY)) {
        return false;
      }

      if (isBackpackRestrictedCard(card)) {
        const backpackCell = heroRowCellRefs.current[HERO_ROW_BACKPACK_INDEX];
        const backpackRect = backpackCell?.getBoundingClientRect() ?? null;
        if (pointInsideRect(backpackRect, clientX, clientY)) {
          return false;
        }
      }

      return true;
    },
    [updateHeroFrameBounds],
  );
  useEffect(() => {
    if (!heroFrameDropEnabled) {
      setHeroRowFrameDropActive(false);
      heroFrameDropIntentRef.current = false;
      return;
    }

    const setFrameActive = (active: boolean) => {
      setHeroRowFrameDropActive(prev => (prev === active ? prev : active));
    };

    const handleWindowDragOver = (event: WindowEventMap['dragover']) => {
      const card = draggedCardRef.current;
      if (!card || !isHeroRowHighlightCard(card)) {
        setFrameActive(false);
        heroFrameDropIntentRef.current = false;
        return;
      }
      const insideHeroFrame = isPointInsideHeroRowDropArea(event.clientX, event.clientY, card);
      if (insideHeroFrame) {
        event.preventDefault();
        setFrameActive(true);
        heroFrameDropIntentRef.current = true;
      } else {
        setFrameActive(false);
        heroFrameDropIntentRef.current = false;
      }
    };

    const handleWindowDrop = (event: WindowEventMap['drop']) => {
      const card = draggedCardRef.current;
      if (!card || !isHeroRowHighlightCard(card)) {
        setFrameActive(false);
        heroFrameDropIntentRef.current = false;
        return;
      }
      const insideHeroFrame = isPointInsideHeroRowDropArea(event.clientX, event.clientY, card);
      if (!insideHeroFrame) {
        setFrameActive(false);
        heroFrameDropIntentRef.current = false;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      handleCardToHero(card);
      setFrameActive(false);
      heroFrameDropIntentRef.current = false;
    };

    window.addEventListener('dragover', handleWindowDragOver, true);
    window.addEventListener('drop', handleWindowDrop, true);

    return () => {
      window.removeEventListener('dragover', handleWindowDragOver, true);
      window.removeEventListener('drop', handleWindowDrop, true);
      setFrameActive(false);
      heroFrameDropIntentRef.current = false;
    };
  }, [handleCardToHero, heroFrameDropEnabled, isPointInsideHeroRowDropArea]);
  const handleMobileHeroDrop = useCallback(
    (dragData: DragData) => {
      if (!heroFrameDropEnabled || dragData.type !== 'card') {
        heroFrameDropIntentRef.current = false;
        return;
      }
      const card = dragData.data as GameCardData | undefined;
      if (!card || !isHeroRowHighlightCard(card)) {
        heroFrameDropIntentRef.current = false;
        return;
      }
      const clientX = typeof dragData.clientX === 'number' ? dragData.clientX : null;
      const clientY = typeof dragData.clientY === 'number' ? dragData.clientY : null;
      if (clientX !== null && clientY !== null) {
        if (!heroFrameBoundsRef.current) {
          updateHeroFrameBounds();
        }
        const insideHeroFrame = isPointInsideHeroRowDropArea(clientX, clientY, card);
        if (!insideHeroFrame) {
          heroFrameDropIntentRef.current = false;
          return;
        }
      }
      handleCardToHero(card);
      heroFrameDropIntentRef.current = false;
    },
    [handleCardToHero, heroFrameDropEnabled, isPointInsideHeroRowDropArea, updateHeroFrameBounds],
  );
  useEffect(() => {
    if (!heroFrameDropEnabled) {
      return;
    }
    const surfaceElement = gameSurfaceRef.current;
    if (!surfaceElement) {
      return;
    }
    const cleanup = initMobileDrop(surfaceElement, handleMobileHeroDrop, ['card']);
    return cleanup;
  }, [handleMobileHeroDrop, heroFrameDropEnabled]);
  const canMonsterTargetShieldSlot = (slotItem: EquipmentItem | null) =>
    Boolean(slotItem && slotItem.type === 'shield' && draggedCard?.type === 'monster');
  const equipmentSlot1MonsterTarget =
    !isWaterfallLocked && !playerTargetingActive && canMonsterTargetShieldSlot(equipmentSlot1);
  const equipmentSlot2MonsterTarget =
    !isWaterfallLocked && !playerTargetingActive && canMonsterTargetShieldSlot(equipmentSlot2);
  const renderBlockButton = (
    target: BlockTarget,
    label: string,
    disabled: boolean = false
  ) => {
    if (!pendingBlock) return null;
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) {
              resolveBlockChoice(target);
            }
          }}
          className={`pointer-events-auto px-6 py-4 rounded-2xl text-base font-semibold shadow-2xl transition flex flex-col items-center gap-1 ${
            disabled
              ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-60'
              : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
          }`}
        >
          <span className="text-lg">{label}</span>
          <span className="text-sm font-normal">Damage: {pendingBlock.attackValue}</span>
        </button>
      </div>
    );
  };
  const draggingEquipmentCard = Boolean(
    draggedCard && (draggedCard.type === 'weapon' || draggedCard.type === 'shield'),
  );
  const equipmentSlotDropAvailable =
    !isWaterfallLocked &&
    !playerTargetingActive &&
    draggingEquipmentCard;
  const equipmentSlot1DropAvailable = equipmentSlotDropAvailable;
  const equipmentSlot2DropAvailable = equipmentSlotDropAvailable;
  const heroRowSlots: HeroRowSlotConfig[] = [
    {
      id: 'hero-row-amulet',
      dropZone: 'other',
      render: () => (
        <AmuletSlot
          amulets={amuletSlots}
          maxSlots={MAX_AMULET_SLOTS}
          onDrop={(card) => {
                if (isWaterfallLocked || playerTargetingActive) return;
            handleCardToSlot(card, 'slot-amulet');
          }}
          onDragStart={(card) => {
                if (isWaterfallLocked || playerTargetingActive) return;
            setDraggedCard(card);
            setDraggedEquipment(null);
            setDraggedCardSource('amulet');
            startDragSession();
          }}
          onDragEnd={() => {
            setDraggedCard(null);
            setDraggedCardSource((current) => (current === 'amulet' ? null : current));
          }}
          isDropTarget={!isWaterfallLocked && draggedCard?.type === 'amulet'}
          onCardClick={handleCardClick}
        />
      ),
    },
    {
      id: 'hero-row-equipment-1',
      dropZone: 'other',
      render: () => (
        <>
          <EquipmentSlot
            type="equipment"
            slotId="slot-equipment-1"
            item={equipmentSlot1}
            permanentDamageBonus={getEquipmentSlotBonus('equipmentSlot1', 'damage')}
            permanentShieldBonus={getEquipmentSlotBonus('equipmentSlot1', 'shield')}
            weaponSwingAnimation={Boolean(weaponSwingStates.equipmentSlot1)}
            weaponSwingVariant={weaponSwingVariant.equipmentSlot1}
            shieldBlockAnimation={Boolean(shieldBlockStates.equipmentSlot1)}
            shieldBlockVariant={shieldBlockVariant.equipmentSlot1}
            onDrop={(card) => {
              if (isWaterfallLocked || playerTargetingActive) return;
              handleCardToSlot(card, 'slot-equipment-1');
            }}
            onDragStart={(equipment) => {
              if (isWaterfallLocked || playerTargetingActive) return;
              setDraggedEquipment(equipment);
              setDraggedCard(null);
              setDraggedCardSource(equipment?.fromSlot ?? 'equipmentSlot1');
              startDragSession();
            }}
            onDragEnd={() => {
              setDraggedEquipment(null);
              setDraggedCardSource((current) => (current === 'equipmentSlot1' ? null : current));
            }}
            isDropTarget={equipmentSlot1DropAvailable}
            isCombatDropTarget={equipmentSlot1MonsterTarget}
            heroSkillHighlight={equipmentSlot1Highlight}
            heroSkillLabel={slotTargetingLabel}
            onClick={
              slotTargetingActive
                ? () => handleSlotTargetSelection('equipmentSlot1')
                : undefined
            }
            onCardClick={handleCardClick}
          />
          {showBlockButtons &&
            renderBlockButton('equipmentSlot1', 'Block (Left)', !canShieldBlock('equipmentSlot1'))}
        </>
      ),
    },
    {
      id: 'hero-row-hero',
      dropZone: 'other',
      innerRef: heroCellRef,
      render: () => (
        <>
          <HeroCard
            hp={hp}
            maxHp={maxHp}
            onDrop={(card) => {
              if ((isWaterfallLocked && card.type !== 'magic') || playerTargetingActive) return;
              handleCardToHero(card);
            }}
            isDropTarget={heroCardDropHighlight}
            equippedWeapon={findWeaponSlot()?.item || null}
            equippedShield={findShieldSlot()?.item || null}
            image={heroVariant.image}
            name={heroVariant.name}
            classTitle={heroVariant.classTitle}
            takingDamage={takingDamage}
            healing={healing}
            bleedAnimation={heroBleedActive}
            showAttackIndicator={
              combatState.engagedMonsterIds.length > 0 && combatState.currentTurn === 'hero'
            }
            heroSkillInfo={heroSkillInfo}
            heroSkillMessage={heroSkillPrompt}
            onHeroSkillClick={
              heroSkillInfo && selectedHeroSkillDef?.type === 'active'
                ? handleHeroSkillButtonClick
                : undefined
            }
            onHeroSkillCancel={heroSkillTargeting ? cancelHeroSkillAction : undefined}
            heroSkillButtonRef={heroSkillButtonRef}
            spellDamageBonus={permanentSpellDamageBonus}
          />
          {showBlockButtons && renderBlockButton('hero', 'Block (Hero)', false)}
        </>
      ),
    },
    {
      id: 'hero-row-equipment-2',
      dropZone: 'other',
      render: () => (
        <>
          <EquipmentSlot
            type="equipment"
            slotId="slot-equipment-2"
            item={equipmentSlot2}
            permanentDamageBonus={getEquipmentSlotBonus('equipmentSlot2', 'damage')}
            permanentShieldBonus={getEquipmentSlotBonus('equipmentSlot2', 'shield')}
            weaponSwingAnimation={Boolean(weaponSwingStates.equipmentSlot2)}
            weaponSwingVariant={weaponSwingVariant.equipmentSlot2}
            shieldBlockAnimation={Boolean(shieldBlockStates.equipmentSlot2)}
            shieldBlockVariant={shieldBlockVariant.equipmentSlot2}
            onDrop={(card) => {
              if (isWaterfallLocked || playerTargetingActive) return;
              handleCardToSlot(card, 'slot-equipment-2');
            }}
            onDragStart={(equipment) => {
              if (isWaterfallLocked || playerTargetingActive) return;
              setDraggedEquipment(equipment);
              setDraggedCard(null);
              setDraggedCardSource(equipment?.fromSlot ?? 'equipmentSlot2');
              startDragSession();
            }}
            onDragEnd={() => {
              setDraggedEquipment(null);
              setDraggedCardSource((current) => (current === 'equipmentSlot2' ? null : current));
            }}
            isDropTarget={equipmentSlot2DropAvailable}
            isCombatDropTarget={equipmentSlot2MonsterTarget}
            heroSkillHighlight={equipmentSlot2Highlight}
            heroSkillLabel={slotTargetingLabel}
            onClick={
              slotTargetingActive
                ? () => handleSlotTargetSelection('equipmentSlot2')
                : undefined
            }
            onCardClick={handleCardClick}
          />
          {showBlockButtons &&
            renderBlockButton('equipmentSlot2', 'Block (Right)', !canShieldBlock('equipmentSlot2'))}
        </>
      ),
    },
    {
      id: 'hero-row-backpack',
      dropZone: 'backpack',
      render: () => (
        <BackpackZone
          backpackCount={backpackItems.length}
          onDrop={(card) => {
            if (isWaterfallLocked || playerTargetingActive) return;
            handleCardToSlot(card, 'slot-backpack');
          }}
          isDropTarget={
            !isWaterfallLocked &&
            !playerTargetingActive &&
            backpackItems.length < 10 &&
            draggedCard !== null &&
            !draggedEquipment &&
            canCardGoToBackpack(draggedCard) &&
            !handCards.some(c => c.id === draggedCard.id)
          }
          canDraw={canDrawFromBackpack && !isWaterfallLocked && !playerTargetingActive}
          isHandFull={handCards.length >= 7}
          onDraw={handleBackpackDrawClick}
          onOpenViewer={handleBackpackClick}
        />
      ),
    },
    {
      id: 'hero-row-class-deck',
      dropZone: 'other',
      innerClassName: 'bg-card-foreground/5 rounded-lg',
      render: () => (
        <ClassDeck
          classCards={classDeck}
          className="w-full h-full"
          deckName="Knight Deck"
          onCardSelect={handleCardClick}
        />
      ),
    },
  ];

  const getRemainingCards = () => remainingDeck.length;
  const showMonsterAttackIndicator = Boolean(
    engagedMonsters.length > 0 &&
      (combatState.currentTurn === 'monster' || combatState.pendingBlock)
  );
  const isCombatPanelVisible = engagedMonsters.length > 0;
  const activeSwordMonsterId = combatState.pendingBlock?.monsterId ?? null;

  const updateSwordVectors = useCallback(() => {
    if (!showMonsterAttackIndicator) {
      setSwordVectors({});
      return;
    }

    const boardEl = boardRef.current;
    const heroEl = heroCellRef.current;
    if (!boardEl || !heroEl) {
      setSwordVectors({});
      return;
    }

    const boardRect = boardEl.getBoundingClientRect();
    const heroRect = heroEl.getBoundingClientRect();
    const heroCenter = {
      x: heroRect.left + heroRect.width / 2,
      y: heroRect.top + heroRect.height / 2,
    };

    const vectors: Record<string, SwordVector> = {};
    combatState.engagedMonsterIds.forEach(monsterId => {
      const monsterEl = monsterCellRefs.current[monsterId];
      if (!monsterEl) return;

      const monsterRect = monsterEl.getBoundingClientRect();
      const monsterCenter = {
        x: monsterRect.left + monsterRect.width / 2,
        y: monsterRect.top + monsterRect.height / 2,
      };

      const dx = heroCenter.x - monsterCenter.x;
      const dy = heroCenter.y - monsterCenter.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (!length) return;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      const midX = (monsterCenter.x + heroCenter.x) / 2 - boardRect.left;
      const midY = (monsterCenter.y + heroCenter.y) / 2 - boardRect.top;

      vectors[monsterId] = {
        left: midX,
        top: midY,
        angle,
        length,
      };
    });

    setSwordVectors(vectors);
  }, [combatState.engagedMonsterIds, showMonsterAttackIndicator, activeCards]);

  useEffect(() => {
    if (!showMonsterAttackIndicator) {
      setSwordVectors({});
      return;
    }

    updateSwordVectors();
    const handleResize = () => updateSwordVectors();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [showMonsterAttackIndicator, updateSwordVectors]);

  return (
    <div ref={gameSurfaceRef} className="h-screen bg-background flex flex-col relative overflow-hidden" style={gridStyleVars}>
      {/* Header - Fixed height */}
      <div className="flex-shrink-0">
        <GameHeader 
          hp={hp} 
          maxHp={maxHp} 
          gold={gold} 
          cardsRemaining={getRemainingCards()}
          monstersDefeated={monstersDefeated}
          shopLevel={shopLevel}
          onDeckClick={() => setDeckViewerOpen(true)}
          onNewGame={handleNewGame}
        />
      </div>
      
      {/* Main game area - Flexible height */}
      <div className="flex-grow min-h-0 w-full px-2 py-3 md:px-4 md:py-4 relative z-10">
        <div className="flex flex-col gap-3 h-full">
          <div
            ref={boardRef}
            className="flex-1 min-h-0 relative flex justify-start lg:justify-center"
          >
            <div ref={gridWrapperRef} className="relative flex-1 w-full">
              {/* 3×6 Card Grid */}
              <div 
                className="game-grid grid mx-auto h-full max-w-[1350px]"
                style={{ 
                  gridAutoRows: 'minmax(0, 1fr)'
                }}>
          {/* Row 1: Preview Row - 5 cards + DiceRoller */}
          {[0, 1, 2, 3, 4].map((index) => {
            const card = previewCards[index];
            const isDroppingPreview = waterfallAnimation.droppingSlots.includes(index);
            const isDiscardingPreview = waterfallAnimation.discardSlot === index;
            const isDealingPreview = waterfallAnimation.dealingSlots.includes(index);
            const discardVector = previewGraveyardVectors[index] ?? GRAVEYARD_VECTOR_DEFAULT;
            const previewAnimationStyle: PreviewAnimationStyle = {
              '--graveyard-offset-x': `${discardVector.offsetX}px`,
              '--graveyard-offset-y': `${discardVector.offsetY}px`,
            };
            const previewAnimationClass = [
              isDroppingPreview ? 'animate-preview-drop' : '',
              isDiscardingPreview ? 'animate-preview-graveyard' : '',
              isDealingPreview ? 'animate-preview-deal' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return card ? (
              <div 
                key={`preview-${index}`}
                className={`opacity-60 pointer-events-none ${cellWrapperClass}`}
                data-testid={`preview-card-${index}`}
                ref={el => setPreviewCellRef(index, el)}
              >
                <div 
                  className={`${cellInnerClass} ${previewAnimationClass}`.trim()}
                  style={previewAnimationStyle}
                >
                  <GameCard
                    card={card}
                    onDragStart={() => {}} // Disabled
                    onDragEnd={() => {}} // Disabled
                    onClick={() => handleCardClick(card)}
                  />
                </div>
              </div>
            ) : (
              <div 
                key={`preview-empty-${index}`} 
                className={cellWrapperClass}
                ref={el => setPreviewCellRef(index, el)}
              >
                <div 
                  className={cellInnerClass}
                  style={previewAnimationStyle}
                />
              </div>
            );
          })}
          
          {/* Row 1, Col 6: DiceRoller */}
          <div className={`${cellWrapperClass} ${heroRowDropState ? 'ring-4 ring-violet-500/70 rounded-lg' : ''}`}>
            <div className={cellInnerClass}>
              <DiceRoller 
                onRoll={(value) => console.log('Rolled:', value)}
                className="w-full h-full"
              />
            </div>
          </div>

          {/* Row 2: Active Row - 5 cards + GraveyardZone */}
          {[0, 1, 2, 3, 4].map((index) => {
            const card = activeCards[index];
            // Calculate responsive fury column width based on card size
            const colWidth = gridCardSize?.width 
              ? Math.max(8, Math.min(14, gridCardSize.width * 0.05))
              : 14; // Fallback to 14px if card size not available
            const isEngagedMonster = Boolean(card && card.type === 'monster' && isMonsterEngaged(card.id));
            const isResolvingCard = resolvingDungeonCardId === card?.id;
            const isMonsterTurnLock = showMonsterAttackIndicator || isWaterfallLocked;
            const monsterTargetHighlight = Boolean(
              monsterTargetingActive && card && card.type === 'monster',
            );
            const monsterLayerValue =
              card && card.type === 'monster'
                ? Math.min(4, Math.max(card.currentLayer ?? card.hpLayers ?? card.fury ?? 0, 0))
                : 0;

            if (!card) {
              return (
                <div 
                  key={`active-empty-${index}`} 
                  className={cellWrapperClass}
                />
              );
            }

            const gameCardNode = (
              <GameCard
                card={card}
                onDragStart={
                  isMonsterTurnLock || playerTargetingActive ? undefined : handleDragStartFromDungeon
                }
                onDragEnd={handleDragEndFromDungeon}
                onWeaponDrop={
                  playerTargetingActive ? undefined : (weapon) => handleWeaponToMonster(weapon, card)
                }
                isWeaponDropTarget={
                  !playerTargetingActive &&
                  draggedEquipment?.type === 'weapon' &&
                  card.type === 'monster'
                }
                bleedAnimation={Boolean(monsterBleedStates[card.id])}
                className={`${removingCards.has(card.id) ? 'animate-card-remove' : 'shadow-lg'} ${
                  (isMonsterTurnLock && !monsterTargetHighlight) || isResolvingCard
                    ? 'opacity-60 pointer-events-none'
                    : ''
                } ${
                  monsterTargetHighlight ? 'monster-target-highlight animate-pulse' : ''
                }`.trim()}
                isEngaged={isEngagedMonster}
                onClick={() => {
                  if (monsterTargetingActive && card.type === 'monster') {
                    handleMonsterTargetSelection(card);
                    return;
                  }
                  if (isMonsterTurnLock || isResolvingCard) return;
                  handleCardClick(card);
                }}
              />
            );

            const isMonster = card.type === 'monster';

            const monsterTranslateX =
              isMonster && monsterLayerValue > 0
                ? Math.max(
                    (monsterLayerValue - 1) * colWidth + MONSTER_RAGE_TRANSLATE_ADJUST_PX,
                    0,
                  )
                : 0;

            const activeCellWrapper = isMonster
              ? `${cellWrapperClass} relative overflow-visible`
              : cellWrapperClass;

            return (
              <div 
                key={`active-${index}`}
                className={activeCellWrapper}
              >
                {isMonster && (
                  <div className="absolute inset-0 z-0 flex flex-row-reverse overflow-hidden rounded-md bg-destructive/10">
                    {[1, 2, 3, 4].map((num) => {
                      const isActiveLayer = monsterLayerValue > 0 && num === monsterLayerValue;
                      const stripsToLeft = num - 1;
                      const stripOffsetPx = stripsToLeft * colWidth;
                      const furyColumnClasses = [
                        'monster-rage-column h-full flex items-center justify-center border-l border-border/20 font-mono font-bold text-lg transition-all',
                        isActiveLayer
                          ? 'bg-destructive/80 text-destructive-foreground shadow-inner shadow-destructive/60'
                          : 'bg-transparent text-destructive/30 opacity-30',
                      ]
                        .filter(Boolean)
                        .join(' ');
                      return (
                        <div
                          key={num}
                          className={furyColumnClasses}
                          style={{ width: `${colWidth}px` }}
                          data-strip-offset={stripOffsetPx}
                        >
                          {num}
                        </div>
                      );
                    })}
                    <div className="flex-1 bg-background/50" />
                  </div>
                )}
                <div
                  ref={isMonster ? registerMonsterCellRef(card.id) : undefined}
                  className={`${cellInnerClass} relative z-20 transition-transform duration-300 ease-out`.trim()}
                  style={{
                    transform:
                      isMonster && monsterLayerValue
                        ? `translateX(-${monsterTranslateX}px)`
                        : 'none',
                  }}
                >
                  {gameCardNode}
                </div>
              </div>
            );
          })}
          
          {/* Row 2, Col 6: GraveyardZone */}
          <div className={`${cellWrapperClass} ${heroRowDropState ? 'ring-4 ring-violet-500/70 rounded-lg' : ''}`}>
            <div className={cellInnerClass} ref={setGraveyardRef}>
              <GraveyardZone
                onDrop={(card) => {
                  if (isWaterfallLocked || playerTargetingActive) return;
                  handleSellCard(card);
                }}
                isDropTarget={graveyardDropEnabled}
                shouldHighlight={shouldHighlightGraveyard}
                discardedCards={discardedCards}
                onCardSelect={handleCardClick}
              />
            </div>
          </div>

          {/* Row 3: Hero Row - 6 slots (Amulet, Equipment×2, Hero, Backpack, ClassDeck) */}
          {heroRowSlots.map((slot, index) => {
            const innerClass = `${cellInnerClass} relative z-10 ${slot.innerClassName ?? ''}`.trim();
            return (
              <div
                key={slot.id}
                className={`${cellWrapperClass} ${slot.wrapperClassName ?? ''}`.trim()}
                ref={registerHeroRowCellRef(index)}
                {...getHeroRowMagicDropHandlers(slot.dropZone)}
              >
                <div className={innerClass} ref={slot.innerRef}>
                  {slot.render()}
                </div>
              </div>
            );
          })}
              </div>
              <div
                ref={heroFrameRef}
                className={`hero-row-frame ${HERO_GAP_VARIABLE_CLASS}`}
                style={heroFrameOverlayStyle}
              />
            </div>
            {classDeckFlights.length > 0 && (
              <div className="pointer-events-none absolute inset-0 z-20">
                {classDeckFlights.map(flight => {
                  const cardWidth = gridCardSize?.width ?? 140;
                  const cardHeight = gridCardSize?.height ?? 210;
                  const eased = easeInOutCubic(clamp(flight.progress));
                  const x = flight.start.x + (flight.end.x - flight.start.x) * eased;
                  const linearY = flight.start.y + (flight.end.y - flight.start.y) * eased;
                  const arcOffset = Math.sin(Math.PI * eased) * flight.arcHeight;
                  const y = linearY - arcOffset;
                  const translateX = x - cardWidth / 2;
                  const translateY = y - cardHeight / 2;
                  const scale = 0.85 + eased * 0.2;
                  const fadeIn = eased < 0.12 ? clamp(eased / 0.12) : 1;
                  const fadeOut = eased > 0.88 ? clamp(1 - (eased - 0.88) / 0.12) : 1;
                  const opacity = fadeIn * fadeOut;
                  const rotate = Math.sin(eased * Math.PI * 1.2) * 5;
                  return (
                    <div
                      key={flight.id}
                      className="absolute class-flight-card"
                      style={{
                        width: cardWidth,
                        height: cardHeight,
                        opacity,
                        transform: `translate(${translateX}px, ${translateY}px) scale(${scale}) rotate(${rotate}deg)`,
                      }}
                    >
                      <GameCard card={flight.card} disableInteractions />
                    </div>
                  );
                })}
              </div>
            )}
            {showMonsterAttackIndicator &&
              Object.entries(swordVectors).map(([monsterId, vector]) => {
                const isActiveSword = activeSwordMonsterId === monsterId;
                return (
                  <div key={`sword-${monsterId}`} className="pointer-events-none absolute inset-0 z-30">
                    <div
                      className={`absolute flex items-center ${isActiveSword ? 'opacity-100 animate-pulse' : 'opacity-30'}`}
                      style={{
                        left: vector.left,
                        top: vector.top,
                        width: vector.length,
                        transform: `translate(-50%, -50%) rotate(${vector.angle}deg)`,
                        transformOrigin: 'center',
                      }}
                    >
                      <div
                        className={`w-full h-1 bg-gradient-to-r from-transparent rounded-full blur-[1px] ${
                          isActiveSword
                            ? 'via-destructive/70 to-destructive'
                            : 'via-destructive/20 to-destructive/20'
                        }`}
                      />
                      <Sword
                        className={`ml-2 w-6 h-6 transform rotate-90 ${
                          isActiveSword
                            ? 'text-destructive drop-shadow-[0_0_14px_rgba(239,68,68,0.9)]'
                            : 'text-destructive/40'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            {isCombatPanelVisible && (
              <div className="pointer-events-none absolute inset-0 z-40">
                <div
                  className="pointer-events-auto absolute top-2 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 sm:top-4"
                  style={combatPanelStyle}
                >
                  <CombatPanel
                    engagedMonsters={engagedMonsters}
                    isActive={isCombatPanelVisible}
                    currentTurn={combatState.currentTurn}
                    heroAttacksRemaining={combatState.heroAttacksRemaining}
                    heroAttacksThisTurn={combatState.heroAttacksThisTurn}
                    pendingBlock={combatState.pendingBlock}
                    monsterAttackQueue={combatState.monsterAttackQueue}
                    onEndHeroTurn={endHeroTurn}
                    equipmentSlot1={equipmentSlot1}
                    equipmentSlot2={equipmentSlot2}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
            {heroSkillArrow && (
              <svg
                className="pointer-events-none absolute inset-0 z-40"
                width="100%"
                height="100%"
              >
                <defs>
                  <marker
                    id="hero-skill-arrowhead"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L8,4 L0,8 z" fill="rgba(139,92,246,0.95)" />
                  </marker>
                </defs>
                <line
                  x1={heroSkillArrow.start.x}
                  y1={heroSkillArrow.start.y}
                  x2={heroSkillArrow.end.x}
                  y2={heroSkillArrow.end.y}
                  stroke="rgba(139,92,246,0.85)"
                  strokeWidth={3}
                  strokeDasharray="6 4"
                  markerEnd="url(#hero-skill-arrowhead)"
                />
                <circle
                  cx={heroSkillArrow.start.x}
                  cy={heroSkillArrow.start.y}
                  r={4}
                  fill="rgba(139,92,246,0.95)"
                />
              </svg>
            )}
      </div>

      {/* Hand Display - Dedicated space */}
      <div ref={handAreaRef} className="flex-shrink-0 relative w-full px-2 pb-4 md:px-6">
        <HandDisplay
          handCards={handCards}
          onPlayCard={handlePlayCardFromHand}
          onDragCardFromHand={handleDragCardFromHand}
          onDragEndFromHand={handleDragEndFromHand}
          maxHandSize={7}
          cardSize={gridCardSize} // Pass the measured size to HandDisplay
          disableAnimations={isWaterfallLocked}
          onCardClick={handleCardClick}
        />
      </div>

      {backpackHandFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-30">
          {backpackHandFlights.map(flight => {
            const cardWidth = gridCardSize?.width ?? 140;
            const cardHeight = gridCardSize?.height ?? 210;
            const eased = easeInOutCubic(clamp(flight.progress));
            const x = flight.start.x + (flight.end.x - flight.start.x) * eased;
            const linearY = flight.start.y + (flight.end.y - flight.start.y) * eased;
            const arcOffset = Math.sin(Math.PI * eased) * flight.arcHeight;
            const y = linearY - arcOffset;
            const translateX = x - cardWidth / 2;
            const translateY = y - cardHeight / 2;
            const scale = 0.9 + eased * 0.15;
            const fadeIn = eased < 0.1 ? clamp(eased / 0.1) : 1;
            const fadeOut = eased > 0.85 ? clamp(1 - (eased - 0.85) / 0.15) : 1;
            const opacity = fadeIn * fadeOut;
            return (
              <div
                key={flight.id}
                className="absolute"
                style={{
                  width: cardWidth,
                  height: cardHeight,
                  opacity,
                  transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
                }}
              >
                <GameCard card={flight.card} disableInteractions />
              </div>
            );
          })}
        </div>
      )}

      <VictoryDefeatModal
        open={gameOver}
        isVictory={victory}
        gold={gold}
        hpRemaining={hp}
        onRestart={handleNewGame}
        monstersDefeated={monstersDefeated}
        damageTaken={totalDamageTaken}
        totalHealed={totalHealed}
      />
      
      <DeckViewerModal
        open={deckViewerOpen}
        onOpenChange={setDeckViewerOpen}
        remainingCards={remainingDeck}
        onCardSelect={handleCardClick}
      />

      <BackpackViewerModal
        open={backpackViewerOpen}
        onOpenChange={setBackpackViewerOpen}
        cards={backpackItems}
        onCardSelect={handleCardClick}
      />

      <DiscoverClassModal
        open={discoverModalOpen}
        cards={discoverOptions}
        onSelect={handleDiscoverSelect}
      />

      <DiscoverClassModal
        open={Boolean(graveyardDiscoverState)}
        cards={graveyardDiscoverState ?? []}
        onSelect={handleGraveyardDiscoverSelect}
        title="坟场召回"
        description="从坟场随机出现的卡牌中选择一张带回背包。"
      />

      <ShopModal
        open={shopModalOpen}
        offerings={shopOfferings}
        gold={gold}
        backpackCount={backpackItems.length}
        backpackCapacity={backpackCapacity}
        shopLevel={shopLevel}
        discountPercent={shopDiscountPercent}
        canDeleteCard={canDeleteCardInShop}
        deleteDisabledReason={shopDeleteDisabledReason}
        onDeleteRequest={handleShopDeleteRequest}
        onBuy={handleShopPurchase}
        onFinish={handleShopClose}
        sourceEventName={shopSourceEvent?.name ?? undefined}
      />

      {eventTransformState && <EventTransformOverlay state={eventTransformState} />}

      <CardDeletionModal
        open={deleteModalOpen}
        onOpenChange={handleDeleteModalOpenChange}
        handCards={handCards}
        backpackCards={backpackItems}
        onDeleteCard={handleDeleteCardConfirm}
        title={cardActionContext?.title}
        description={cardActionContext?.description}
        requiredCount={cardActionContext?.requiredCount}
        remainingCount={cardActionContext?.remainingCount}
      />

      <CardDetailsModal 
        card={selectedCard}
        open={detailsModalOpen}
        onOpenChange={setDetailsModalOpen}
      />

      {/* Event Choice Modal */}
      <EventChoiceModal
        open={eventModalOpen}
        eventCard={currentEventCard}
        onChoice={handleEventChoice}
        choiceStates={eventChoiceStates}
      />

      {eventDiceModal && (
        <EventDiceModal
          open
          title={eventDiceModal.title}
          subtitle={eventDiceModal.subtitle}
          entries={eventDiceModal.entries}
          rolledValue={eventDiceModal.rolledValue}
          resolvedEntryId={eventDiceModal.highlightedId}
          autoRollTrigger={eventDiceRollKey}
          onRollResult={handleDiceRollResult}
          onClose={cancelDiceModal}
        />
      )}

      {equipmentPrompt && (
        <EquipmentSelectModal
          open
          prompt={equipmentPrompt.prompt}
          subtext={equipmentPrompt.subtext}
          leftItem={equipmentSlot1}
          rightItem={equipmentSlot2}
          onSelect={handleEquipmentPromptSelection}
          onCancel={cancelEquipmentPrompt}
        />
      )}
      
      {/* Hero Skill Selection Modal */}
      <HeroSkillSelection
        isOpen={showSkillSelection}
        onSelectSkill={handleSkillSelection}
      />
    </div>
  );
}

function EventTransformOverlay({ state }: { state: EventTransformState }) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const flipTimer = window.setTimeout(() => setFlipped(true), 350);
    const completeTimer = window.setTimeout(() => {
      state.onComplete();
    }, 1200);
    return () => {
      window.clearTimeout(flipTimer);
      window.clearTimeout(completeTimer);
    };
  }, [state]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xs sm:max-w-sm text-center space-y-4">
        <div
          className="relative mx-auto h-[260px] sm:h-[320px] w-[170px] sm:w-[220px] rounded-xl border border-primary/40 bg-gradient-to-br from-pink-500/20 via-purple-600/10 to-black/40 p-4 shadow-2xl dh-perspective"
        >
          <div
            className="absolute inset-4 transition-transform duration-700 ease-in-out dh-preserve-3d"
            style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
          >
            <div className="absolute inset-0 dh-backface-hidden">
              <GameCard card={state.fromCard} disableInteractions />
            </div>
            <div className="absolute inset-0 dh-backface-hidden" style={{ transform: 'rotateY(180deg)' }}>
              <GameCard card={state.toCard} disableInteractions />
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">卷轴正在翻转成新的形态…</p>
      </div>
    </div>
  );
}
