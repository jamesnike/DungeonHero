import { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo, type ReactNode, type Ref } from 'react';
import type { CSSProperties, DragEvent as ReactDragEvent } from 'react';
import GameHeader from './GameHeader';
import HeroCard from './HeroCard';
import GameCard, { type GameCardData, type CardType } from './GameCard';
import EquipmentSlot from './EquipmentSlot';
import CombatPanel from './CombatPanel';
import { Sword } from 'lucide-react';
import AmuletSlot from './AmuletSlot';
import GraveyardZone from './GraveyardZone';
import HandDisplay from './HandDisplay';
import VictoryDefeatModal from './VictoryDefeatModal';
import DeckViewerModal from './DeckViewerModal';
import EventChoiceModal from './EventChoiceModal';
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
import ShopModal, { type ShopOffering } from './ShopModal';

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
type AmuletItem = GameCardData & { type: 'amulet'; fromSlot?: 'amulet' };
type DragOrigin = 'hand' | 'dungeon' | 'backpack' | 'amulet' | EquipmentSlotId;
type ActiveRowSlots = Array<GameCardData | null>;
type HeroRowDropType = 'event' | 'magic';
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
  | { skillId: HeroSkillId; type: 'monster' };

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

type HeroSkillArrowState = {
  start: { x: number; y: number };
  end: { x: number; y: number };
};

const isHeroRowHighlightCard = (
  card: GameCardData | null,
): card is GameCardData & { type: HeroRowDropType } =>
  Boolean(card && (card.type === 'event' || card.type === 'magic'));

const DUNGEON_COLUMN_COUNT = 5;
const GRAVEYARD_VECTOR_DEFAULT = { offsetX: 60, offsetY: 160 };
const GRID_GAP_CLASS = "gap-y-8 gap-x-12 sm:gap-y-12 sm:gap-x-20";
const HERO_GRID_PADDING_CLASS = "";
const HERO_GAP_VARIABLE_CLASS =
  "[--hero-gap-x:clamp(1rem,3.8vw,2.8rem)] [--hero-gap-y:clamp(0.7rem,2.8vw,1.8rem)] sm:[--hero-gap-x:clamp(1.5rem,3.8vw,3.5rem)] sm:[--hero-gap-y:clamp(1rem,3vw,2.4rem)]";
const DEV_MODE = process.env.NODE_ENV !== 'production';
const DUNGEON_COLUMNS = Array.from({ length: DUNGEON_COLUMN_COUNT }, (_, index) => index);
const MAX_BACKPACK_CAPACITY = 10;
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

const getShopPrice = (card: GameCardData): number => {
  if (SHOP_TYPE_PRICES[card.type] !== undefined) {
    return SHOP_TYPE_PRICES[card.type] as number;
  }
  return Math.max(5, card.value || 5);
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
        minAttack: 2, maxAttack: 3,
        minHp: 3, maxHp: 5,
        minFury: 2, maxFury: 3
      },
      { 
        name: 'Goblin', 
        image: goblinImage, 
        minAttack: 2, maxAttack: 3,
        minHp: 3, maxHp: 4,
        minFury: 1, maxFury: 2
      },
      { 
        name: 'Ogre', 
        image: ogreImage, 
        minAttack: 3, maxAttack: 4,
        minHp: 5, maxHp: 7,
        minFury: 2, maxFury: 3
      },
    ];

    // 16 monsters total for heavier encounters
    for (let i = 0; i < 16; i++) {
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
  
  for (let i = 0; i < 8; i++) {
    const weaponType = weaponTypes[i % weaponTypes.length];
    // Balanced weapon values: 2-6
    const value = Math.floor(Math.random() * 5) + 2;
    // Random durability 1-3
    const durability = Math.floor(Math.random() * 3) + 1;
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
  
  // 3-4 shields of each type (8 total)
  for (let i = 0; i < 8; i++) {
    const shieldType = shieldTypes[i % shieldTypes.length];
    // Random durability 1-3
    const durability = Math.floor(Math.random() * 3) + 1;
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

  // Potions (2-5 range, 12 total for balanced healing)
  const potionTypes = [
    'Health Potion', 'Healing Elixir', 'Restorative Brew'
  ];
  
  // Reduced to 8 potions with slightly higher values for balance
  for (let i = 0; i < 8; i++) {
    const potionName = potionTypes[i % potionTypes.length];
    deck.push({
      id: `potion-${id++}`,
      type: 'potion',
      name: potionName,
      value: Math.floor(Math.random() * 4) + 3, // 3-6 HP instead of 2-5
      image: potionImage,
    });
  }

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
      description: '有护盾时候，免疫掉血',
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

  // Event cards (4 total)
  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: 'Mysterious Shrine',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: 'Pray (+3 Max HP)', effect: 'maxhp+3' },
      { text: 'Donate (Lose 5 Gold, Heal Full)', effect: 'gold-5,fullheal' },
      { text: '发现一张Class Card（发现）', effect: 'discoverClass' },
      { text: 'Leave', effect: 'none' }
    ]
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: 'Wandering Merchant',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: 'Buy Potion (5 Gold for Heal 3)', effect: 'gold-5,heal+3' },
      { text: 'Buy Weapon (8 Gold for Random Weapon)', effect: 'gold-8,weapon' },
      { text: '发现一张Class Card（发现）', effect: 'discoverClass' },
      { text: '打开商店', effect: 'openShop' },
      { text: 'Decline', effect: 'none' }
    ]
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: 'Dark Altar',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: 'Blood Pact (Lose 3 HP, Empower weapon)', effect: 'hp-3,bloodEmpower' },
      { text: 'Sacrifice Gold (Lose 10 Gold, Heal 5 HP)', effect: 'gold-10,heal+5' },
      { text: '发现一张Class Card（发现）', effect: 'discoverClass' },
      { text: 'Walk Away', effect: 'none' }
    ]
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: 'Ancient Tome',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: 'Read It (Take 2 Damage, Gain Permanent Skill)', effect: 'hp-2,permanentskill' },
      { text: 'Sell It (Gain 7 Gold)', effect: 'gold+7' },
      { text: '发现一张Class Card（发现）', effect: 'discoverClass' },
      { text: 'Ignore It', effect: 'none' }
    ]
  });

  // New Gold-focused Event Cards (replacing coin cards)
  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: 'Treasure Chest',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: 'Open Carefully (Gain 8 Gold)', effect: 'gold+8' },
      { text: 'Force Open (50% chance: 15 Gold or Take 3 Damage)', effect: 'random:gold+15,hp-3' },
      { text: '发现一张Class Card（发现）', effect: 'discoverClass' },
      { text: '打开商店', effect: 'openShop' },
      { text: 'Leave It', effect: 'none' }
    ]
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: 'Goblin Thief',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: 'Fight (Take 2 Damage, Gain 10 Gold)', effect: 'hp-2,gold+10' },
      { text: 'Bribe (Lose 3 Gold, Avoid Combat)', effect: 'gold-3' },
      { text: '发现一张Class Card（发现）', effect: 'discoverClass' },
      { text: 'Run Away', effect: 'none' }
    ]
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: 'Hidden Cache',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: 'Take Gold (Gain 6 Gold)', effect: 'gold+6' },
      { text: 'Take All (Gain 12 Gold, Monster Appears)', effect: 'gold+12,spawnmonster' },
      { text: '发现一张Class Card（发现）', effect: 'discoverClass' },
      { text: 'Leave Quietly', effect: 'none' }
    ]
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: 'Lucky Coin',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: 'Make a Wish (Gain 5 Gold)', effect: 'gold+5' },
      { text: 'Flip It (50% chance: Double Gold or Nothing)', effect: 'random:gold+10,none' },
      { text: '发现一张Class Card（发现）', effect: 'discoverClass' },
      { text: 'Keep It (Gain 3 Gold)', effect: 'gold+3' }
    ]
  });

  return deck.sort(() => Math.random() - 0.5);
}

export default function GameBoard() {
  // const { toast } = useToast(); // Disabled toast notifications
  const [hp, setHp] = useState(INITIAL_HP);
  const [gold, setGold] = useState(INITIAL_GOLD);
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
  const [canDrawFromBackpack, setCanDrawFromBackpack] = useState(false);
  const [backpackViewerOpen, setBackpackViewerOpen] = useState(false);
  const [classDeckFlights, setClassDeckFlights] = useState<ClassDeckFlight[]>([]);
  const [discoverModalOpen, setDiscoverModalOpen] = useState(false);
  const [discoverOptions, setDiscoverOptions] = useState<GameCardData[]>([]);
  const [shopModalOpen, setShopModalOpen] = useState(false);
  const [shopOfferings, setShopOfferings] = useState<ShopOffering[]>([]);
  const [shopSourceEvent, setShopSourceEvent] = useState<GameCardData | null>(null);
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
  const [isDraggingToHand, setIsDraggingToHand] = useState(false); // Show hand acquisition zone
  const [isDraggingFromDungeon, setIsDraggingFromDungeon] = useState(false); // Track if dragging from dungeon
  const [permanentSkills, setPermanentSkills] = useState<string[]>([]); // Track permanent skill effects
  const [tempShield, setTempShield] = useState(0); // Temporary shield from skills
  const [classDeck, setClassDeck] = useState<GameCardData[]>([]); // Class deck cards
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [currentEventCard, setCurrentEventCard] = useState<GameCardData | null>(null);
  
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
  const [heroSkillBanner, setHeroSkillBanner] = useState<string | null>(null);
  const cellWrapperClass = "flex w-full h-full";
  const cellInnerClass = "flex w-full h-full p-0.5 sm:p-1";
  const updateHeroRowDropHighlight = useCallback((card: GameCardData | null) => {
    setHeroRowDropState(isHeroRowHighlightCard(card) ? card.type : null);
  }, [setHeroRowDropState]);
  const waterfallActive = waterfallAnimation.isActive;
  const selectedHeroSkillDef = useMemo<HeroSkillDefinition | null>(
    () => getHeroSkillById(selectedHeroSkill as HeroSkillId | null | undefined),
    [selectedHeroSkill],
  );
  const resetHeroSkillForNewWave = useCallback(() => {
    setHeroSkillUsedThisWave(false);
    setPendingHeroSkillAction(null);
    setHeroSkillBanner(null);
    setPendingMagicAction(null);
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
      applyDamage(remainingDamage);
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
      drawnCard = next.pop() ?? null;
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

  const drawClassCardsToBackpack = useCallback(
    (count: number, source: string, filter?: (card: GameCardData) => boolean): GameCardData[] => {
      if (count <= 0) return [];
      if (classDeck.length === 0) return [];

      const availableSlots = MAX_BACKPACK_CAPACITY - backpackItems.length;
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
      if (backpackItems.length >= MAX_BACKPACK_CAPACITY) {
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
        offerings.push({ card: picked, price: getShopPrice(picked), sold: false });
      }
    });

    while (offerings.length < SHOP_MAX_OFFERINGS) {
      const picked = takeRandomCard();
      if (!picked) {
        break;
      }
      offerings.push({ card: picked, price: getShopPrice(picked), sold: false });
    }

    return offerings;
  }, [classDeck]);

  const startShopFlow = useCallback(
    (eventCard: GameCardData | null): boolean => {
      if (!eventCard) {
        return false;
      }

      if (backpackItems.length >= MAX_BACKPACK_CAPACITY) {
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

  const persistedState = useMemo<PersistedGameState>(() => {
    return {
      version: 1 as const,
      timestamp: 0,
      hp,
      gold,
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
    };
  }, [
    hp,
    gold,
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
    setEquipmentSlot1(null);
    setEquipmentSlot2(null);
    setAmuletSlots([]);
    setBackpackItems([]);
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

  const addToGraveyard = (card: GameCardData) => {
    const sanitized = sanitizeCardForGraveyard(card);
    setDiscardedCards(prev => {
      if (prev.some(c => c.id === sanitized.id)) {
        return prev;
      }
      setWaveDiscardCount(count => count + 1);
      return [...prev, sanitized];
    });
  };

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
      if (plan.shouldDeclareVictory) {
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
        if (backpackItems.length >= MAX_BACKPACK_CAPACITY) {
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

        if (backpackItems.length >= MAX_BACKPACK_CAPACITY) {
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
    completeCurrentEvent();
  }, [completeCurrentEvent]);

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

  const finalizeInstantMagicCard = useCallback(
    (card: GameCardData, options?: { banner?: string }) => {
      if (options?.banner) {
        setHeroSkillBanner(options.banner);
      }
      addToGraveyard(card);
      removeCard(card.id, false);
      setPendingMagicAction(null);
    },
    [addToGraveyard, removeCard],
  );

  // Function to handle skill card effects - Defined early to be available for other handlers
  function handleSkillCard(card: GameCardData) {
    const knightCard = card as KnightCardData;
    
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
          finalizeInstantMagicCard(card, { banner: 'Cascade Reset shuffles the current wave.' });
          break;
        }
        case 'Tempest Volley': {
          const monsters = flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster');
          if (monsters.length === 0) {
            finalizeInstantMagicCard(card, { banner: 'Tempest Volley fizzled (no monsters).' });
            break;
          }
          monsters.forEach((monster, index) => {
            if (!isMonsterEngaged(monster.id)) {
              beginCombat(monster, 'hero');
            }
            const animationDelay = index * Math.floor(COMBAT_ANIMATION_STAGGER * 0.75);
            dealDamageToMonster(monster, 3, { animationDelay, pulses: 2 });
          });
          finalizeInstantMagicCard(card, { banner: 'Tempest Volley strikes every foe!' });
          break;
        }
        case 'Echo Satchel': {
          const drawsRequested = waveDiscardCount;
          if (drawsRequested <= 0) {
            finalizeInstantMagicCard(card, { banner: 'Echo Satchel had no cards to echo.' });
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
          finalizeInstantMagicCard(card, { banner });
          break;
        }
        case 'Bulwark Slam': {
          const shields = getEquipmentSlots().filter(slot => slot.item?.type === 'shield');
          if (shields.length === 0) {
            finalizeInstantMagicCard(card, { banner: 'Bulwark Slam fizzled (no shields equipped).' });
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
            finalizeInstantMagicCard(card, { banner: 'No monsters available for Blood Reckoning.' });
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
            finalizeInstantMagicCard(card, { banner: 'All equipment is already at full durability.' });
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
    (damage: number) => {
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

      if (amuletEffects.hasGuardian && hadShieldProtection) {
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
        setPendingHeroSkillAction({ skillId: 'blood-strike', type: 'monster' });
        setHeroSkillBanner(selectedHeroSkillDef.statusHint ?? 'Select a monster to deal 3 damage.');
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
    pendingHeroSkillAction,
    selectedHeroSkillDef,
    setHandCards,
    waterfallActive,
  ]);


  const handleHeroSkillSlotSelection = useCallback(
    (slotId: EquipmentSlotId) => {
      if (!pendingHeroSkillAction || pendingHeroSkillAction.type !== 'slot') {
        return;
      }

      if (pendingHeroSkillAction.skillId === 'armor-pact') {
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
        const damage = calculateSlotArmorValue(slotId);
        if (damage <= 0) {
          setHeroSkillBanner('Select a shield with armor to use Bulwark Slam.');
          return;
        }
        setPendingMagicAction({
          card: pendingMagicAction.card,
          effect: 'bulwark-slam',
          step: 'monster-select',
          slotId,
          pendingDamage: damage,
          prompt: `Select a monster to take ${damage} damage.`,
        });
        setHeroSkillBanner(`Bulwark Slam armed for ${damage} damage.`);
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
        finalizeInstantMagicCard(pendingMagicAction.card, {
          banner: `${slotItem.name} is fully repaired.`,
        });
      }
    },
    [
      calculateSlotArmorValue,
      equipmentSlot1,
      equipmentSlot2,
      finalizeInstantMagicCard,
      pendingMagicAction,
      setEquipmentSlotById,
    ],
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
      dealDamageToMonster(monster, 3, { pulses: 2 });

      setHeroSkillUsedThisWave(true);
      setPendingHeroSkillAction(null);
      setHeroSkillBanner('Crimson Strike dealt 3 damage.');
      setHeroSkillArrow(null);
    },
    [
      applyDamage,
      dealDamageToMonster,
      pendingHeroSkillAction,
    ],
  );

  const handleMagicMonsterSelection = useCallback(
    (monster: GameCardData) => {
      if (!pendingMagicAction || pendingMagicAction.step !== 'monster-select') {
        return;
      }

      if (pendingMagicAction.effect === 'bulwark-slam') {
        const damage = pendingMagicAction.pendingDamage;
        if (damage <= 0) {
          setHeroSkillBanner('Bulwark Slam needs armor to deal damage.');
          return;
        }
        if (!isMonsterEngaged(monster.id)) {
          beginCombat(monster, 'hero');
        }
        dealDamageToMonster(monster, damage, {
          animationDelay: Math.floor(COMBAT_ANIMATION_STAGGER / 2),
          pulses: 2,
        });
        finalizeInstantMagicCard(pendingMagicAction.card, {
          banner: `Bulwark Slam dealt ${damage} damage.`,
        });
        return;
      }

      if (pendingMagicAction.effect === 'blood-reckoning') {
        const missingHp = Math.max(0, maxHp - hp);
        if (missingHp <= 0) {
          finalizeInstantMagicCard(pendingMagicAction.card, {
            banner: 'You are at full HP. Blood Reckoning dealt no damage.',
          });
          return;
        }
        if (!isMonsterEngaged(monster.id)) {
          beginCombat(monster, 'hero');
        }
        dealDamageToMonster(monster, missingHp, { pulses: 2 });
        finalizeInstantMagicCard(pendingMagicAction.card, {
          banner: `Blood Reckoning dealt ${missingHp} damage.`,
        });
      }
    },
    [
      beginCombat,
      dealDamageToMonster,
      finalizeInstantMagicCard,
      hp,
      isMonsterEngaged,
      maxHp,
      pendingMagicAction,
      setHeroSkillBanner,
    ],
  );

  const handleSlotTargetSelection = useCallback(
    (slotId: EquipmentSlotId) => {
      if (pendingMagicAction?.step === 'slot-select') {
        handleMagicSlotSelection(slotId);
        return;
      }
      if (pendingHeroSkillAction?.type === 'slot') {
        handleHeroSkillSlotSelection(slotId);
      }
    },
    [handleHeroSkillSlotSelection, handleMagicSlotSelection, pendingHeroSkillAction, pendingMagicAction],
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
        healHero(card.value);
        addToGraveyard(card);
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
        // Auto-use potion for healing
        healHero(card.value);
    // // toast({ title: 'Healed!', description: `+${healAmount} HP` });
        removeCard(card.id);
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

  const isEquipmentCard = (card: GameCardData) => (EQUIPMENT_TYPES as readonly CardType[]).includes(card.type);
  const isConsumableCard = (card: GameCardData) => (CONSUMABLE_TYPES as readonly CardType[]).includes(card.type);
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
      if (backpackItems.length >= 10) {
    // // toast({ title: 'Backpack Full!', description: 'Maximum 10 items', variant: 'destructive' });
        return;
      }

      const cardWithOrigin = card as GameCardData & { fromSlot?: DragOrigin };
      const fromAmuletSlot =
        cardWithOrigin.fromSlot === 'amulet' || amuletSlots.some(slot => slot?.id === card.id);
      if (fromAmuletSlot) {
        setAmuletSlots(prev => prev.filter(slot => slot?.id !== card.id));
      }
      
      // Add card to bottom of backpack (unshift for LIFO)
      setBackpackItems(prev => [card, ...prev]);
    // // toast({ title: 'Item Stored!', description: `${backpackItems.length + 1}/10 items in backpack` });
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

  function handleEventChoice(choiceIndex: number) {
    if (!currentEventCard || !currentEventCard.eventChoices) return;
    
    const choice = currentEventCard.eventChoices[choiceIndex];
    const effects = choice.effect.split(',');
    let eventResolutionDeferred = false;
    
    for (const effect of effects) {
      if (effect === 'none') continue;
      
      if (effect.startsWith('hp-')) {
        const damage = parseInt(effect.replace('hp-', ''));
        applyDamage(damage);
    // // toast({ title: 'Damage Taken', description: `-${damage} HP`, variant: 'destructive' });
      } else if (effect.startsWith('heal+')) {
        const healAmount = parseInt(effect.replace('heal+', ''));
        healHero(healAmount);
    // // toast({ title: 'Healed!', description: `+${actualHeal} HP` });
      } else if (effect === 'fullheal') {
        healHero(maxHp);
    // // toast({ title: 'Full Heal!', description: `Restored to ${maxHp} HP` });
      } else if (effect.startsWith('gold-')) {
        const goldLost = parseInt(effect.replace('gold-', ''));
        if (gold >= goldLost) {
          setGold(prev => prev - goldLost);
    // // toast({ title: 'Gold Spent', description: `-${goldLost} Gold` });
        } else {
    // // toast({ title: 'Not Enough Gold!', variant: 'destructive' });
          setEventModalOpen(false);
          setCurrentEventCard(null);
          finalizeEventResolution({ removeFromDungeon: false });
          return;
        }
      } else if (effect.startsWith('gold+')) {
        const goldGain = parseInt(effect.replace('gold+', ''));
        setGold(prev => prev + goldGain);
    // // toast({ title: 'Gold Gained!', description: `+${goldGain} Gold` });
      } else if (effect.startsWith('maxhp+')) {
        const hpGain = parseInt(effect.replace('maxhp+', ''));
        // This would need a permanent max HP modifier
    // // toast({ title: 'Max HP Increased!', description: `+${hpGain} Max HP` });
      } else if (effect === 'weapon') {
        // Create a random weapon
        const weaponValue = Math.floor(Math.random() * 3) + 3; // 3-5 value
    // // toast({ title: 'Weapon Received!', description: `Got a weapon (${weaponValue} damage)` });
        // Would need to add weapon to inventory
      } else if (effect === 'permanentskill') {
        const randomSkill = ['Iron Skin', 'Weapon Master'][Math.floor(Math.random() * 2)];
        setPermanentSkills(prev => [...prev, randomSkill]);
    // // toast({ title: 'Skill Learned!', description: randomSkill });
      }
      
      // Knight discovery events
      else if (effect === 'drawKnight3') {
        const drawn = drawClassCardsToBackpack(3, 'drawKnight3');
        triggerClassDeckFlight(drawn);
      } else if (effect === 'equipKnight') {
        // Draw and immediately equip a Knight equipment
        const equipmentCards = classDeck.filter(c => c.type === 'weapon' || c.type === 'shield');
        if (equipmentCards.length > 0) {
          const equipment = equipmentCards[Math.floor(Math.random() * equipmentCards.length)];
          // Auto-equip to empty slot or first slot
          if (!equipmentSlot1) {
            setEquipmentSlot1({ ...equipment } as EquipmentItem);
          } else if (!equipmentSlot2) {
            setEquipmentSlot2({ ...equipment } as EquipmentItem);
          }
          setClassDeck(prev => prev.filter(c => c.id !== equipment.id));
    // // toast({ title: 'Knight Equipment!', description: `Equipped ${equipment.name}!` });
        }
      } else if (effect === 'useKnightSkill') {
        // Draw and use a Knight skill immediately
        const skillCards = classDeck.filter(c => c.type === 'skill' && c.skillType === 'instant');
        if (skillCards.length > 0) {
          const skill = skillCards[Math.floor(Math.random() * skillCards.length)];
          setClassDeck(prev => prev.filter(c => c.id !== skill.id));
          handleSkillCard(skill);
        }
      }
      
      // Knight class-specific event effects
      else if (effect === 'weaponUpgrade' || effect === 'weaponUpgrade2') {
        // Upgrade current weapon
        const upgradAmount = effect === 'weaponUpgrade2' ? 2 : 2;
        if (equipmentSlot1?.type === 'weapon') {
          setEquipmentSlot1(prev => prev ? { ...prev, value: prev.value + upgradAmount } : null);
    // // toast({ title: 'Weapon Upgraded!', description: `+${upgradAmount} damage to ${equipmentSlot1.name}!` });
        } else if (equipmentSlot2?.type === 'weapon') {
          setEquipmentSlot2(prev => prev ? { ...prev, value: prev.value + upgradAmount } : null);
    // // toast({ title: 'Weapon Upgraded!', description: `+${upgradAmount} damage to ${equipmentSlot2.name}!` });
        }
      } else if (effect === 'shieldUpgrade2') {
        // Upgrade current shield
        if (equipmentSlot1?.type === 'shield') {
          setEquipmentSlot1(prev => prev ? { ...prev, value: prev.value + 2 } : null);
    // // toast({ title: 'Shield Upgraded!', description: `+2 defense to ${equipmentSlot1.name}!` });
        } else if (equipmentSlot2?.type === 'shield') {
          setEquipmentSlot2(prev => prev ? { ...prev, value: prev.value + 2 } : null);
    // // toast({ title: 'Shield Upgraded!', description: `+2 defense to ${equipmentSlot2.name}!` });
        }
      } else if (effect === 'restoreShield') {
        // Restore a shield from graveyard
        const shields = discardedCards.filter(c => c.type === 'shield');
        if (shields.length > 0) {
          const shield = shields[shields.length - 1]; // Get most recent
          const restoredShield: EquipmentItem = {
            ...shield,
            type: 'shield',
            durability: 3,
            maxDurability: 3
          };
          if (!equipmentSlot1) {
            setEquipmentSlot1(restoredShield);
          } else if (!equipmentSlot2) {
            setEquipmentSlot2(restoredShield);
          }
          setDiscardedCards(prev => prev.filter(c => c.id !== shield.id));
    // // toast({ title: 'Shield Restored!', description: `${shield.name} restored from graveyard!` });
        }
      } else if (effect.startsWith('tempShield+')) {
        const shieldGain = parseInt(effect.replace('tempShield+', ''));
        setTempShield(prev => prev + shieldGain);
    // // toast({ title: 'Temporary Shield!', description: `+${shieldGain} shield value!` });
      } else if (effect === 'bloodEmpower') {
        const empoweredSlot = findWeaponSlot();
        if (empoweredSlot?.item) {
          const empoweredWeapon: EquipmentItem = { ...empoweredSlot.item, value: empoweredSlot.item.value + 2 };
          setEquipmentSlotById(empoweredSlot.id, empoweredWeapon);
        } else {
          // No weapon to empower, refund with gold so the choice still feels rewarding
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
          card => card.type === 'weapon' || card.type === 'shield'
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
        // Repair all equipment
        const slots = getEquipmentSlots();
        slots.forEach(slot => {
          if (slot.item) {
            const repaired = { 
              ...slot.item, 
              durability: slot.item.maxDurability || 3,
              maxDurability: slot.item.maxDurability || 3
            };
            setEquipmentSlotById(slot.id, repaired);
          }
        });
    // // toast({ title: 'Equipment Repaired!', description: 'All equipment restored to full durability!' });
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
      healHero(card.value);
    // // toast({ title: 'Healed!', description: `+${healAmount} HP` });
      addToGraveyard(card);
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
  const playerTargetingActive = heroSkillTargeting || magicTargeting;
  const slotTargetingActive = heroSkillSlotTargeting || Boolean(magicSlotTargeting);
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
      : undefined;
  const heroSkillPrompt = pendingMagicAction?.prompt
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
    if ((waterfallAnimation.isActive && card.type !== 'magic') || targetingActive) return;
    setDraggedCard(card);
    setDraggedCardSource('hand');
    updateHeroRowDropHighlight(card);
    startDragSession();
    // Card stays in hand until successfully dropped
  };

  const handleDragEndFromHand = () => {
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
  const draggedCardIsMagic = draggedCard?.type === 'magic';
  const heroRowInteractionLocked =
    playerTargetingActive || (isWaterfallLocked && !draggedCardIsMagic);
  const heroCardDropHighlight =
    !heroRowInteractionLocked &&
    canCardDropOnHero(draggedCard) &&
    !isHeroRowHighlightCard(draggedCard);
  const heroRowMagicDropActive =
    !heroRowInteractionLocked && isHeroRowHighlightCard(draggedCard);
  const canSellDraggedCard = draggedCard ? isSellableType(draggedCard.type) : false;
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
  useEffect(() => {
    const dragged = draggedCard;
    const isEventOrMagic = isHeroRowHighlightCard(dragged);
    const frameDropEnabled =
      isEventOrMagic &&
      !playerTargetingActive &&
      (dragged?.type === 'event' ? !isWaterfallLocked : true);

    if (!frameDropEnabled) {
      setHeroRowFrameDropActive(false);
      return;
    }

    const ensureBounds = () => {
      if (!heroFrameBoundsRef.current) {
        updateHeroFrameBounds();
      }
      return heroFrameBoundsRef.current;
    };

    const pointInsideRect = (rect: DOMRect, clientX: number, clientY: number) =>
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;

    const setFrameActive = (active: boolean) => {
      setHeroRowFrameDropActive(prev => (prev === active ? prev : active));
    };

    const handleWindowDragOver = (event: WindowEventMap['dragover']) => {
      const bounds = ensureBounds();
      if (!bounds) return;
      if (pointInsideRect(bounds, event.clientX, event.clientY)) {
        event.preventDefault();
        setFrameActive(true);
      } else {
        setFrameActive(false);
      }
    };

    const handleWindowDrop = (event: WindowEventMap['drop']) => {
      const bounds = ensureBounds();
      const card = draggedCardRef.current;
      if (!bounds || !card || !isHeroRowHighlightCard(card)) {
        setFrameActive(false);
        return;
      }

      const insideHeroFrame = pointInsideRect(bounds, event.clientX, event.clientY);
      if (!insideHeroFrame) {
        setFrameActive(false);
        return;
      }

      if (card.type === 'magic') {
        const backpackCell = heroRowCellRefs.current[HERO_ROW_BACKPACK_INDEX];
        const backpackRect = backpackCell?.getBoundingClientRect();
        const insideBackpack =
          backpackRect && pointInsideRect(backpackRect, event.clientX, event.clientY);
        if (insideBackpack) {
          setFrameActive(false);
          return;
        }
      }

      event.preventDefault();
      event.stopPropagation();
      handleCardToHero(card);
      setFrameActive(false);
    };

    window.addEventListener('dragover', handleWindowDragOver, true);
    window.addEventListener('drop', handleWindowDrop, true);

    return () => {
      window.removeEventListener('dragover', handleWindowDragOver, true);
      window.removeEventListener('drop', handleWindowDrop, true);
      setFrameActive(false);
    };
  }, [
    draggedCard,
    handleCardToHero,
    playerTargetingActive,
    isWaterfallLocked,
    updateHeroFrameBounds,
  ]);
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
            heroSkillHighlight={slotTargetingActive}
            heroSkillLabel={slotTargetingLabel}
            onClick={
              slotTargetingActive
                ? () => handleSlotTargetSelection('equipmentSlot1')
                : undefined
            }
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
            heroSkillHighlight={slotTargetingActive}
            heroSkillLabel={slotTargetingLabel}
            onClick={
              slotTargetingActive
                ? () => handleSlotTargetSelection('equipmentSlot2')
                : undefined
            }
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
    <div ref={gameSurfaceRef} className="h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Header - Fixed height */}
      <div className="flex-shrink-0">
        <GameHeader 
          hp={hp} 
          maxHp={maxHp} 
          gold={gold} 
          cardsRemaining={getRemainingCards()}
          monstersDefeated={monstersDefeated}
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
                className={`game-grid grid mx-auto h-full max-w-[1350px] ${GRID_GAP_CLASS}`}
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
            const colWidth = 20; // Width of each fury column
            const isEngagedMonster = Boolean(card && card.type === 'monster' && isMonsterEngaged(card.id));
            const isResolvingCard = resolvingDungeonCardId === card?.id;
            const isMonsterTurnLock = showMonsterAttackIndicator || isWaterfallLocked;
            const monsterTargetHighlight = Boolean(
              monsterTargetingActive && card && card.type === 'monster',
            );
            
            return card ? (
              <div 
                key={`active-${index}`}
                className={`${cellWrapperClass} relative overflow-visible`}
              >
                {/* Fury Columns Background - Only for monsters */}
                {card.type === 'monster' && (
                  <div className="absolute inset-0 z-0 flex flex-row-reverse overflow-hidden rounded-md bg-destructive/10">
                    {[1, 2, 3].map((num) => (
                      <div 
                        key={num} 
                        className="h-full flex items-center justify-center border-l border-border/20 bg-destructive/20 text-destructive font-mono font-bold text-lg"
                        style={{ width: `${colWidth}px` }}
                      >
                        {num}
                      </div>
                    ))}
                    {/* Fill the rest of the space */}
                    <div className="flex-1 bg-background/50" />
                  </div>
                )}

                <div 
                  ref={card?.type === 'monster' ? registerMonsterCellRef(card.id) : undefined}
                  className={`${cellInnerClass} relative z-20 transition-transform duration-300 ease-out`}
                  style={{
                    transform: card.type === 'monster' && card.currentLayer
                      ? `translateX(-${Math.min(3, card.currentLayer) * colWidth}px)`
                      : 'none'
                  }}
                >
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
                      } ${monsterTargetHighlight ? 'ring-4 ring-amber-400 animate-pulse' : ''}`.trim()}
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
                </div>
              </div>
            ) : (
              <div 
                key={`active-empty-${index}`} 
                className={cellWrapperClass}
              />
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

      <ShopModal
        open={shopModalOpen}
        offerings={shopOfferings}
        gold={gold}
        backpackCount={backpackItems.length}
        backpackCapacity={MAX_BACKPACK_CAPACITY}
        onBuy={handleShopPurchase}
        onFinish={handleShopClose}
        sourceEventName={shopSourceEvent?.name ?? undefined}
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
      />
      
      {/* Hero Skill Selection Modal */}
      <HeroSkillSelection
        isOpen={showSkillSelection}
        onSelectSkill={handleSkillSelection}
      />
    </div>
  );
}
