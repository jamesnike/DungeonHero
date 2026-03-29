import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect,
  useMemo,
  type ReactNode,
  type Ref,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { CSSProperties, DragEvent as ReactDragEvent } from 'react';
import { useGameViewport } from '@/contexts/GameViewportContext';
import GameHeader from './GameHeader';
import HeroCard from './HeroCard';
import GameCard, {
  type CardType,
  type EventChoiceDefinition,
  type EventDiceRange,
  type EventEffectExpression,
  type GameCardData,
  type EquipmentCardStatModifier,
  type HeroMagicId,
  isPermRecycleEquipment,
} from './GameCard';
import EquipmentSlot from './EquipmentSlot';
// CombatPanel removed — only the standalone End Hero Turn button is used
import GameLogPanel, { type LogEntry, type LogEntryType } from './GameLogPanel';
import { Sword, Swords, Calendar, Undo2, Wrench, ShoppingBag } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import MonsterRewardModal from '@/components/MonsterRewardModal';
import HeroDetailsModal from './HeroDetailsModal';
import { useOverlayScale } from '@/hooks/use-overlay-scale';
import { usePerformanceMode } from '@/contexts/PerformanceModeContext';
// import { useToast } from '@/hooks/use-toast'; // Disabled toast notifications
import { HAND_LIMIT, FLAT_ASPECT_RATIO } from './game-board/constants';
import {
  generateKnightDeck,
  createKnightDiscoveryEvents,
  createGreedCurseCard,
  createGraveyardRecallCard,
  type KnightCardData,
} from '@/lib/knightDeck';
import { getHeroSkillById, heroSkills as allHeroSkills, type HeroSkillDefinition, type HeroSkillId } from '@/lib/heroSkills';
import {
  HERO_MAGIC_IDS,
  createInitialHeroMagicState,
  getHeroMagicDefinition,
  sanitizeHeroMagicState,
  type HeroMagicRuntimeState,
  type HeroMagicState,
} from '@/lib/heroMagic';
import { getRandomHero, type HeroVariant } from '@/lib/heroes';
import { clearGameState, loadGameState, saveGameState, saveUndoStack, loadUndoStack, clearUndoStorage, saveGameLog, loadGameLog, clearGameLogStorage, type PersistedGameState } from '@/lib/gameStorage';
import { applyMonsterRage } from '@/lib/monsterRage';
import CardDetailsModal from './CardDetailsModal';
import DiscoverClassModal from './DiscoverClassModal';
import CardDeletionModal from './CardDeletionModal';
import ShopModal, { type ShopOffering } from './ShopModal';
import ShopSkillSelectModal from './ShopSkillSelectModal';
import CardFlipOverlay from './CardFlipOverlay';
import { type DragData } from '../utils/mobileDragDrop';
import type {
  ActiveAmuletEffects,
  ActiveRowSlots,
  AmuletItem,
  BackpackDrawRequest,
  BackpackHandFlight,
  BlockTarget,
  DirectedCombatFxFlight,
  DiscardShockFlight,
  CardActionContext,
  ClassDeckFlight,
  CombatInitiator,
  CombatState,
  DiscardFlight,
  DeathWardPromptState,
  DragOrigin,
  DungeonDropAssignment,
  EquipmentItem,
  EquipmentRepairTarget,
  EquipmentSlotBonusState,
  EquipmentSlotId,
  EquipmentSlotStatModifier,
  EventDiceModalState,
  EventTransformState,
  EquipmentPromptState,
  GraveyardVector,
  GridMetrics,
  HeroFramePosition,
  HeroMagicActivationOrigin,
  HeroRowDropType,
  HeroRowSlotConfig,
  HeroSkillArrowState,
  MonsterRageInset,
  MonsterRewardDrop,
  MonsterRewardEffect,
  MonsterRewardOption,
  PendingHandInsertion,
  PendingHeroMagicAction,
  PendingHeroSkillAction,
  PendingMagicAction,
  PendingPotionAction,
  Point,
  SlotPermanentBonus,
  SwordVector,
  UndoSnapshot,
  UndoTransientState,
  WaterfallAnimationState,
  WaterfallDiscardDestination,
  WaterfallPlan,
} from './game-board/types';

// Cute chibi-style monster images
import dragonImage from '@assets/generated_images/cute_chibi_dragon_monster.png';
import skeletonImage from '@assets/generated_images/cute_chibi_skeleton_monster.png';
import goblinImage from '@assets/generated_images/cute_chibi_goblin_monster.png';
import ogreImage from '@assets/generated_images/cute_chibi_ogre_monster.png';
import wraithImage from '@assets/generated_images/cute_chibi_wraith_monster.png';
import minionImage from '@assets/generated_images/chibi_minion_follower.png';

// Cute cartoon weapon images
import swordImage from '@assets/generated_images/cute_cartoon_medieval_sword.png';
import axeImage from '@assets/generated_images/cute_cartoon_battle_axe.png';
import daggerImage from '@assets/generated_images/cute_cartoon_dagger.png';
import daggerWeaponImage from '@assets/generated_images/cute_cartoon_weapon_dagger.png';
import holyBladeImage from '@assets/generated_images/cute_cartoon_holy_blade.png';
import maceImage from '@assets/generated_images/cute_cartoon_mace.png';

// Cute cartoon shields (different tiers) - NEW Q-version style
import woodenShieldImage from '@assets/generated_images/cute_wooden_shield.png';
import ironShieldImage from '@assets/generated_images/cute_iron_shield.png';
import heavyShieldImage from '@assets/generated_images/simple_heavy_shield.png';

// Potion images
import potionImage from '@assets/generated_images/cute_cartoon_healing_potion.png';
import potionConcentratedHealImage from '@assets/generated_images/cute_potion_concentrated_heal.png';
import potionWeaponRepairImage from '@assets/generated_images/cute_potion_weapon_repair.png';
import potionEquipmentRepairImage from '@assets/generated_images/cute_potion_equipment_repair.png';
import potionBackpackDrawImage from '@assets/generated_images/cute_potion_backpack_draw.png';
import potionDiscoverImage from '@assets/generated_images/cute_potion_discover.png';
import potionTwilightImage from '@assets/generated_images/cute_potion_twilight.png';
import potionSpellDamageImage from '@assets/generated_images/cute_potion_spell_damage.png';

// Amulet images
import lifeAmuletImage from '@assets/generated_images/chibi_life_amulet.png';
import strengthAmuletImage from '@assets/generated_images/chibi_strength_amulet.png';
import guardianAmuletImage from '@assets/generated_images/chibi_guardian_amulet.png';
import balanceAmuletImage from '@assets/generated_images/chibi_balance_amulet.png';
import lifestealAmuletImage from '@assets/generated_images/chibi_lifesteal_amulet.png';
import flashAmuletImage from '@assets/generated_images/chibi_flash_amulet.png';

// Skill and Event images
import skillScrollImage from '@assets/generated_images/chibi_skill_scroll.png';
import eventScrollImage from '@assets/generated_images/chibi_event_scroll.png';

const INITIAL_HP = 20;
const INITIAL_GOLD = 10;
const INITIAL_TURN_COUNT = 1;

/** 与 initGame 中「最终之敌」角标一致（开局标在整副主牌顺序里最后一只怪上） */
const FINAL_MONSTER_MARK_DESCRIPTION =
  '最终之敌：击败后将变身为 Boss；被瀑流从预览挤出时不进坟场，置于牌堆底（不打乱牌序）。';

const SELLABLE_TYPES = ['potion', 'weapon', 'shield', 'amulet', 'magic', 'hero-magic', 'monster'] as const;
const EQUIPMENT_TYPES = ['weapon', 'shield', 'amulet'] as const;
const CONSUMABLE_TYPES = ['potion', 'magic', 'hero-magic'] as const;
const MAX_AMULET_SLOTS = 2;
const DECK_SIZE = 64; // Updated: 54 + 6 skills + 4 events = 64

const formatRepairTargetLabel = (targets: EquipmentRepairTarget[]) => {
  if (targets.includes('monster')) {
    return '装备';
  }
  if (targets.includes('weapon') && targets.includes('shield')) {
    return '武器或护盾';
  }
  return targets[0] === 'shield' ? '护盾' : '武器';
};

const describeSlotLabel = (slotId: EquipmentSlotId): '左侧装备栏' | '右侧装备栏' =>
  slotId === 'equipmentSlot1' ? '左侧装备栏' : '右侧装备栏';

/** 装备栏拖拽用 slot-equipment-1/2；战斗状态用 equipmentSlot1/2 */
const normalizeHeroEquipmentSlotFromDrag = (
  raw: string | undefined | null,
): EquipmentSlotId | undefined => {
  if (raw === 'equipmentSlot1' || raw === 'slot-equipment-1') return 'equipmentSlot1';
  if (raw === 'equipmentSlot2' || raw === 'slot-equipment-2') return 'equipmentSlot2';
  return undefined;
};

const describeBonusLabel = (bonusType: keyof SlotPermanentBonus): '伤害' | '护甲' =>
  bonusType === 'damage' ? '伤害' : '护甲';

const createEmptySlotBonusState = (): EquipmentSlotBonusState => ({
  equipmentSlot1: { damage: 0, shield: 0 },
  equipmentSlot2: { damage: 0, shield: 0 },
});

const createEmptyEquipmentBuffState = (): Record<EquipmentSlotId, number> => ({
  equipmentSlot1: 0,
  equipmentSlot2: 0,
});

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

const DUNGEON_COLUMN_COUNT = 5;
const GRAVEYARD_VECTOR_DEFAULT = { offsetX: 60, offsetY: 160 };
const DECK_RETURN_VECTOR_DEFAULT = { offsetX: -72, offsetY: -188 };
const MONSTER_RAGE_COLUMN_BORDER_PX = 1;
const MONSTER_CARD_BORDER_PX = 4;
const MONSTER_RAGE_BASE_TRANSLATE_PX = 6;
const MONSTER_RAGE_TRANSLATE_ADJUST_PX =
  MONSTER_CARD_BORDER_PX > MONSTER_RAGE_COLUMN_BORDER_PX
    ? MONSTER_CARD_BORDER_PX - MONSTER_RAGE_COLUMN_BORDER_PX
    : 0;
const HERO_GRID_PADDING_CLASS = "";
const HERO_GAP_VARIABLE_CLASS =
  "[--hero-gap-x:clamp(1rem,3.8vw,2.8rem)] [--hero-gap-y:clamp(0.7rem,2.8vw,1.8rem)] sm:[--hero-gap-x:clamp(1.5rem,3.8vw,3.5rem)] sm:[--hero-gap-y:clamp(1rem,3vw,2.4rem)]";
const HERO_GAP_VARIABLE_CLASS_FLAT =
  "[--hero-gap-x:clamp(0.3rem,1vw,0.8rem)] [--hero-gap-y:clamp(0.1rem,0.4vw,0.3rem)] sm:[--hero-gap-x:clamp(0.4rem,1.2vw,1rem)] sm:[--hero-gap-y:clamp(0.1rem,0.5vw,0.4rem)]";
const DEV_MODE = process.env.NODE_ENV !== 'production';
const logHeroMagic = (...args: unknown[]) => {
  if (!DEV_MODE) {
    return;
  }
  console.debug('[HeroMagic]', ...args);
};
const logBackpackDraw = (tag: string, payload?: unknown) => {
  if (!DEV_MODE) {
    return;
  }
  if (typeof payload === 'undefined') {
    console.debug('[BackpackDraw]', tag);
  } else {
    console.debug('[BackpackDraw]', tag, payload);
  }
};
const DUNGEON_COLUMNS = Array.from({ length: DUNGEON_COLUMN_COUNT }, (_, index) => index);
const BASE_BACKPACK_CAPACITY = 10;
const HERO_ROW_AMULET_INDEX = 0;
const HERO_ROW_EQUIPMENT_1_INDEX = 1;
const HERO_ROW_HERO_INDEX = 2;
const HERO_ROW_EQUIPMENT_2_INDEX = 3;
const HERO_ROW_BACKPACK_INDEX = 4;
const HERO_ROW_CLASS_DECK_INDEX = 5;
const DIRECTED_REFLECT_PROJECTILE_SIZE = 50;
const DIRECTED_RETALIATION_PROJECTILE_SIZE = 52;
const DISCARD_SHOCK_FLIGHT_BASE_DURATION = 520;
const DISCARD_SHOCK_FLIGHT_VARIANCE = 140;
const DISCARD_SHOCK_ARC_MIN = 36;
const DISCARD_SHOCK_ARC_VARIANCE = 52;
const DISCARD_SHOCK_PROJECTILE_SIZE = 56;
const BALANCE_ATTACK_BONUS = 3;
const BALANCE_SHIELD_BONUS = 3;
const BALANCE_ATTACK_PENALTY = 1;
const BALANCE_SHIELD_PENALTY = 1;
const FLASH_ATTACK_PENALTY = 3;
const STRENGTH_SELF_DAMAGE = 2;
const COMBAT_ANIMATION_DURATION = 1200;
const COMBAT_ANIMATION_STAGGER = 180;
/** 格挡动画与反弹动画之间的间隔（ms） */
const COMBAT_BLOCK_TO_REFLECT_MS = 220;
/** 护盾反弹特效时长，与 index.css shield-reflect-* 大致对齐 */
const SHIELD_REFLECT_ANIM_MS = 1020;
/** Boss 反噬特效时长，与 boss-retaliation-* 大致对齐 */
const BOSS_RETALIATION_ANIM_MS = 920;
const DEFEAT_ANIMATION_DURATION = 950;
const SHOP_MAX_OFFERINGS = 5;
const SHOP_REQUIRED_TYPES: CardType[] = ['weapon', 'shield', 'magic', 'amulet'];
const SHOP_TYPE_PRICES: Partial<Record<CardType, number>> = {
  weapon: 10,
  shield: 8,
  magic: 7,
  'hero-magic': 9,
  amulet: 6,
};
const SHOP_HEAL_COST = 5;
const SHOP_HEAL_AMOUNT = 5;
const SHOP_LEVEL_UP_COST = 10;
const MAX_SHOP_LEVEL = 3;
const SHOP_SKILL_DISCOVER_COST = 10;
const COMBAT_PANEL_DEFAULT_WIDTH = 170;
const COMBAT_PANEL_DEFAULT_HEIGHT = 320;
const COMBAT_PANEL_EDGE_PADDING = 12;
const COMBAT_PANEL_DEFAULT_POSITION_CLASS =
  'top-2 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 sm:top-4';
const pointInsideRect = (rect: DOMRect | null, clientX: number, clientY: number) =>
  Boolean(
    rect &&
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom,
  );
const isBackpackRestrictedCard = (card: GameCardData | null) =>
  Boolean(card && (card.type === 'magic' || card.type === 'hero-magic' || card.type === 'potion' || card.isPermanentEvent));

const getShopPrice = (card: GameCardData): number => {
  if (SHOP_TYPE_PRICES[card.type] !== undefined) {
    return SHOP_TYPE_PRICES[card.type] as number;
  }
  return Math.max(5, card.value || 5);
};

const isHeroRowHighlightCard = (
  card: GameCardData | null,
): card is GameCardData & { type: HeroRowDropType } =>
  Boolean(
    card &&
      (card.type === 'event' ||
        card.type === 'magic' ||
        card.type === 'hero-magic' ||
        card.type === 'potion'),
  );

const getGridMetricsForWidth = (width: number): GridMetrics => {
  if (width <= 430) {
    return {
      gapX: 6,
      gapY: 10,
      padding: 2,
      cardFontScale: 1.15,
      cardStatScale: 1.2,
      cardIconScale: 1.15,
      cardDotSize: 6,
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
      cardDotSize: 6,
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

const FLIP_GOLD_REWARD = 3;

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
  hasDualGuard: false,
  hasDiscardShock: false,
  hasFlipGold: false,
  hasRecycleForge: false,
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

const WATERFALL_DROP_DURATION = 650;
const WATERFALL_DISCARD_DURATION = 450;
const WATERFALL_DEAL_DURATION = 550;

function getWaterfallPreviewDiscardDestination(
  card: GameCardData | null | undefined,
): WaterfallDiscardDestination {
  if (!card) return 'graveyard';
  if (card.type === 'monster' && card.isFinalMonster && !card.bossPhase) return 'deck';
  const wfx = card.waterfallEffect;
  if (wfx && (card.type === 'monster' || card.type === 'event') && wfx.type === 'returnToDeck') {
    return 'deck';
  }
  return 'graveyard';
}
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
  discardDestination: 'graveyard',
  dealingSlots: [],
  sequenceId: null,
};
const clamp = (value: number, min = 0, max = 1) => Math.min(Math.max(value, min), max);
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const getRandomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const BACKPACK_FLIGHT_BASE_DURATION = 600;
const BACKPACK_FLIGHT_VARIANCE = 200;
const BACKPACK_FLIGHT_STAGGER = 70;
const BACKPACK_FLIGHT_ARC_MIN = 30;
const BACKPACK_FLIGHT_ARC_VARIANCE = 45;
const BACKPACK_FLIGHT_FALLBACK_BUFFER = 200;
const HAND_DELIVERY_GUARD_EXTRA_BUFFER = 500;
const HAND_DELIVERY_GUARD_DELAY =
  BACKPACK_FLIGHT_BASE_DURATION +
  BACKPACK_FLIGHT_VARIANCE +
  BACKPACK_FLIGHT_FALLBACK_BUFFER +
  HAND_DELIVERY_GUARD_EXTRA_BUFFER;

// Discard flight: hand/board → graveyard or backpack (reverse of draw)
const DISCARD_FLIGHT_BASE_DURATION = 600;
const DISCARD_FLIGHT_VARIANCE = 200;
const DISCARD_FLIGHT_ARC_MIN = 30;
const DISCARD_FLIGHT_ARC_VARIANCE = 45;

/** After load/undo, re-bind art by English weapon name so Dagger ≠ Swift Blade (old saves stored the same image URL for both). */
function patchPersistedMainDeckWeaponImage(card: GameCardData): GameCardData {
  if (card.type !== 'weapon') return card;
  switch (card.name) {
    case 'Dagger':
      return { ...card, image: daggerWeaponImage };
    case 'Swift Blade':
      return { ...card, image: daggerImage };
    case 'Holy Blade':
      return { ...card, image: holyBladeImage };
    case 'Mace':
      return { ...card, image: maceImage };
    default:
      return card;
  }
}

function createDeck(): GameCardData[] {
  const deck: GameCardData[] = [];
  let id = 0;

    const monsterPrefixes: Record<string, string[]> = {
      Dragon: ['Ancient', 'Crimson', 'Shadow', 'Storm', 'Frost', 'Ember', 'Iron', 'Void', 'Thunder', 'Ashen', 'Feral', 'Dread'],
      Skeleton: ['Cursed', 'Hollow', 'Grim', 'Wailing', 'Pale', 'Rotting', 'Vengeful', 'Shattered', 'Forsaken', 'Silent', 'Risen', 'Ghastly'],
      Goblin: ['Sly', 'Wicked', 'Cunning', 'Savage', 'Sneaky', 'Vile', 'Rabid', 'Twisted', 'Crafty', 'Foul', 'Rogue', 'Mad'],
      Ogre: ['Brutal', 'Stone', 'Hulking', 'Iron', 'Scarred', 'Raging', 'Titan', 'Gnarled', 'Vicious', 'Dusk', 'Wrathful', 'Blight'],
      Wraith: ['Phantom', 'Spectral', 'Haunting', 'Ethereal', 'Abyssal', 'Twilight', 'Hollow', 'Veiled', 'Mourning', 'Sinister', 'Fading', 'Drifting'],
    };
    const usedPrefixes: Record<string, Set<number>> = {};

    const pickPrefix = (typeName: string): string => {
      const pool = monsterPrefixes[typeName];
      if (!pool) return typeName;
      if (!usedPrefixes[typeName]) usedPrefixes[typeName] = new Set();
      const used = usedPrefixes[typeName];
      if (used.size >= pool.length) used.clear();
      let idx: number;
      do { idx = Math.floor(Math.random() * pool.length); } while (used.has(idx));
      used.add(idx);
      return `${pool[idx]} ${typeName}`;
    };

    // Monster variety with attack/HP separation and fury (formerly layers)
    const monsterTypes = [
      { 
        name: 'Dragon',
        image: dragonImage,
        minAttack: 4, maxAttack: 6,
        minHp: 6, maxHp: 8,
        minFury: 3, maxFury: 4,
        waterfallEffect: { type: 'turnBoost' as const, amount: 4, description: '被挤出时：waterfall 次数 +4（影响后续怪物血层）' },
      },
      { 
        name: 'Skeleton', 
        image: skeletonImage, 
        minAttack: 5, maxAttack: 7,
        minHp: 1, maxHp: 3,
        minFury: 2, maxFury: 4,
        waterfallEffect: { type: 'damage' as const, amount: 8, description: '被挤出时：对英雄造成 8 点伤害' },
      },
      { 
        name: 'Goblin', 
        image: goblinImage, 
        minAttack: 2, maxAttack: 3,
        minHp: 3, maxHp: 4,
        minFury: 1, maxFury: 4,
        waterfallEffect: { type: 'goldLoss' as const, amount: 6, description: '被挤出时：失去 6 金币' },
      },
      { 
        name: 'Ogre',
        image: ogreImage,
        minAttack: 3, maxAttack: 4,
        minHp: 5, maxHp: 6,
        minFury: 2, maxFury: 4,
        waterfallEffect: { type: 'bonusDecay' as const, amount: 1, description: '被挤出时：所有永久伤害/护甲/法术加成 -1' },
      },
      { 
        name: 'Wraith',
        image: wraithImage,
        minAttack: 3, maxAttack: 5,
        minHp: 3, maxHp: 5,
        minFury: 2, maxFury: 3,
        waterfallEffect: {
          type: 'returnToDeck' as const,
          amount: 0,
          description: '被挤出时：不进入坟场，随机插入剩余牌堆某一位置。',
        },
      },
    ];

    // 15 monsters total (3 per type)
    for (let i = 0; i < 15; i++) {
      const monsterType = monsterTypes[i % monsterTypes.length];
      const attack = Math.floor(Math.random() * (monsterType.maxAttack - monsterType.minAttack + 1)) + monsterType.minAttack;
      const hp = Math.floor(Math.random() * (monsterType.maxHp - monsterType.minHp + 1)) + monsterType.minHp;
      const fury = Math.floor(Math.random() * (monsterType.maxFury - monsterType.minFury + 1)) + monsterType.minFury;
      
      deck.push({
        id: `monster-${id++}`,
        type: 'monster',
        name: pickPrefix(monsterType.name),
        monsterType: monsterType.name,
        value: attack,
        attack: attack,
        hp: hp,
        maxHp: hp,
        baseAttack: attack,
        baseHp: hp,
        fury: fury,
        hpLayers: fury,
        currentLayer: fury,
        image: monsterType.image,
        waterfallEffect: monsterType.waterfallEffect,
        ...(monsterType.name === 'Skeleton' ? { hasRevive: true } : {}),
        ...(monsterType.name === 'Dragon' ? { bleedEffect: 'attack+2' } : {}),
        ...(monsterType.name === 'Ogre' ? { enterEffect: 'auto-engage' } : {}),
        ...(monsterType.name === 'Wraith' ? { lastWords: 'wraith-haunt-2' } : {}),
        ...(monsterType.name === 'Goblin' ? { onAttackEffect: 'steal-gold-3' } : {}),
      });
    }

    const monstersByType: Record<string, GameCardData[]> = {};
    deck.filter(c => c.type === 'monster').forEach(m => {
      const mt = m.monsterType!;
      (monstersByType[mt] ??= []).push(m);
    });
    const specialMap: Record<string, { tag: string; desc: string; lastWords?: string }> = {
      Dragon:   { tag: 'ember-fury',     desc: '精英流血：每失去一个血层，攻击力+3。\nHero回合未掉血层则恢复一层。' },
      Skeleton: { tag: 'bone-regen',     desc: '虚骨再生：每次失去血层后，50%概率恢复一层。', lastWords: 'discard-hand-3' },
      Wraith:   { tag: 'wraith-rebirth', desc: '幽魂重生：血层降至1时，50%概率血层全满。' },
      Ogre:     { tag: 'ogre-crit',      desc: '蛮力暴击：攻击时50%概率双倍伤害。\n狂暴连击：70%概率攻击两次。' },
      Goblin:   { tag: 'goblin-elite',   desc: '动手：偷取6金币。\n玩家金币≤10时，攻击力与血量翻倍。' },
    };
    for (const [type, monsters] of Object.entries(monstersByType)) {
      const spec = specialMap[type];
      if (!spec || !monsters.length) continue;
      const chosen = monsters[Math.floor(Math.random() * monsters.length)];
      chosen.monsterSpecial = spec.tag;
      chosen.description = spec.desc;
      if (spec.lastWords) {
        chosen.lastWords = spec.lastWords;
      }
      if (type === 'Dragon') {
        chosen.bleedEffect = 'attack+3';
        chosen.eliteRegenHeroTurn = true;
        chosen.waterfallEffect = { type: 'turnBoost', amount: 6, description: '被挤出时：waterfall 次数 +6（影响后续怪物血层）' };
      }
      if (type === 'Ogre') {
        chosen.eliteDoubleAttack = true;
        chosen.waterfallEffect = { type: 'bonusDecay', amount: 2, description: '被挤出时：所有永久伤害/护甲/法术加成 -2' };
      }
      if (type === 'Wraith') {
        chosen.lastWords = 'wraith-haunt-4';
      }
      if (type === 'Goblin') {
        chosen.onAttackEffect = 'steal-gold-6';
        chosen.eliteLowGoldPower = true;
        chosen.waterfallEffect = { type: 'goldLoss', amount: 12, description: '被挤出时：失去 12 金币' };
      }
      if (type === 'Skeleton') {
        chosen.waterfallEffect = { type: 'damage', amount: 15, description: '被挤出时：对英雄造成 15 点伤害' };
      }
    }

    const goblinsForTrick = deck.filter(
      (c): c is GameCardData => c.type === 'monster' && c.monsterType === 'Goblin',
    );
    if (goblinsForTrick.length > 0) {
      const trickCarrier = goblinsForTrick[Math.floor(Math.random() * goblinsForTrick.length)];
      trickCarrier.goblinTrickCarrier = true;
    }

  // Weapon variety with improved values (2-6 range)
  const weaponTypes = [
    { name: 'Holy Blade', image: holyBladeImage },
    { name: 'Sword', image: axeImage },
    { name: 'Dagger', image: daggerWeaponImage },
    { name: 'Mace', image: maceImage },
    { name: 'Swift Blade', image: daggerImage },
    { name: 'Sword', image: axeImage },
  ];
  
  for (let i = 0; i < 6; i++) {
    const weaponType = weaponTypes[i % weaponTypes.length];
    const value = Math.floor(Math.random() * 5) + 2;
    const durability = Math.floor(Math.random() * 4) + 1;
    const card: GameCardData = {
      id: `weapon-${id++}`,
      type: 'weapon',
      name: weaponType.name,
      value: value,
      image: weaponType.image,
      durability: durability,
      maxDurability: durability,
    };
    if (weaponType.name === 'Holy Blade') {
      card.healOnKill = 2;
      card.description = '击杀怪物时回复 2 点生命。';
      const hbDurability = Math.floor(Math.random() * 3) + 2;
      card.durability = hbDurability;
      card.maxDurability = hbDurability;
    }
    if (weaponType.name === 'Swift Blade') {
      card.durability = Math.floor(Math.random() * 3) + 2;
      card.maxDurability = card.durability;
    }
    if (weaponType.name === 'Mace') {
      card.value = Math.floor(Math.random() * 2) + 1;
      card.durability = Math.floor(Math.random() * 2) + 3;
      card.maxDurability = card.durability;
      card.description = '攻击后掷骰：50% 概率不消耗耐久。';
      card.weaponDurabilitySaveChance = 50;
    }
    if (weaponType.name === 'Dagger') {
      card.value = Math.min(card.value, 3);
      card.durability = Math.min(card.durability!, 2);
      card.maxDurability = card.durability;
      card.critChance = 50;
      card.description = '攻击时 50% 概率造成双倍伤害。';
    }
    if (weaponType.name === 'Sword') {
      card.value = Math.floor(Math.random() * 3) + 4;
      card.durability = 1;
      card.maxDurability = 1;
      card.waterfallAttackBoost = 1;
      card.description = '每次瀑流触发时，攻击力 +1。';
    }
    
    deck.push(card);
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
    const durability = Math.floor(Math.random() * 4) + 1;
    const card: GameCardData = {
      id: `shield-${id++}`,
      type: 'shield',
      name: shieldType.name,
      value: shieldType.value,
      image: shieldType.image,
      durability: durability,
      maxDurability: durability,
    };
    if (shieldType.name === 'Heavy Shield') {
      card.damageReflect = 1;
      card.description = '格挡时反弹 1 点伤害给攻击者（受装备栏永久伤害加成影响）。';
      card.durability = Math.floor(Math.random() * 3) + 2;
      card.maxDurability = card.durability;
    }
    if (shieldType.name === 'Wooden Shield') {
      card.onDestroyHeal = 3;
      card.description = '毁坏时恢复 3 点生命。';
    }
    if (shieldType.name === 'Iron Shield') {
      card.onDestroyGold = 3;
      card.description = '毁坏时获得 3 金币。';
    }
    deck.push(card);
  }

  // Potions - bespoke utility set (6 total)
  const potionCards: Omit<GameCardData, 'id'>[] = [
    {
      type: 'potion',
      name: '治疗药水',
      value: 5,
      image: potionImage,
      potionEffect: 'heal-5',
      description: '立即回复5点生命，随后翻转为永久魔法。',
      flipTarget: {
        toCard: {
          id: 'potion-flip-heal',
          type: 'magic',
          name: '治愈余韵',
          value: 0,
          image: skillScrollImage,
          magicType: 'permanent',
          magicEffect: '永久魔法：使用时立即回复 2 点生命。',
          description: '使用时立即回复 2 点生命。使用后回到回收袋，瀑流后可再次使用。',
        },
        destination: 'backpack',
        banner: '治疗药水翻转成"治愈余韵"，已放入背包。',
        message: '药水瓶中浮现淡淡的治愈光芒…',
      },
    },
    {
      type: 'potion',
      name: '浓缩治疗药水',
      value: 7,
      image: potionConcentratedHealImage,
      potionEffect: 'heal-14',
      description: '立即回复14点生命。',
    },
    {
      type: 'potion',
      name: '装备修复剂',
      value: 6,
      image: potionWeaponRepairImage,
      potionEffect: 'repair-choice',
      description: '恢复3点耐久 或 耐久上限+2。',
    },
    {
      type: 'potion',
      name: '双锋淬液',
      value: 7,
      image: potionEquipmentRepairImage,
      potionEffect: 'boost-both-slots',
      description: '左右装备栏永久伤害+1，护甲+1。',
    },
    {
      type: 'potion',
      name: '背包觉醒药',
      value: 5,
      image: potionBackpackDrawImage,
      potionEffect: 'draw-backpack-4',
      description: '从背包随机抽最多4张牌到手牌；手牌上限+1后若仍有空位，再抽1张。背包容量+1。',
    },
    {
      type: 'potion',
      name: '洞察药剂',
      value: 6,
      image: potionDiscoverImage,
      potionEffect: 'discover-class-3',
      description: '获得三张职业卡牌。',
    },
    {
      type: 'potion',
      name: '魔法平衡药剂',
      value: 0,
      image: potionTwilightImage,
      potionEffect: 'discover-graveyard-magic',
      description: '从墓地发现一张魔法卡（3选1），随后翻到另一面。',
      flipTarget: {
        toCard: {
          id: 'potion-flip-twilight',
          type: 'magic',
          name: '余烬回响',
          value: 0,
          image: skillScrollImage,
          magicType: 'instant',
          magicEffect: '使用时从背包抽 1 张手牌，并永久法术伤害 +1。',
          description: '使用时从背包抽 1 张手牌，并永久法术伤害 +1。',
        },
        destination: 'backpack',
        banner: '药剂翻转成“余烬回响”，已放入背包。',
        message: '药剂残瓶翻转出新的符文光芒…',
      },
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
      image: balanceAmuletImage,
      description: '左边Equipment攻击+3护甲-1，右边Equipment护甲+3攻击-1',
      amuletEffect: 'balance',
    },
    {
      type: 'amulet',
      name: 'Life Amulet',
      value: 5,
      image: lifestealAmuletImage,
      description: '攻击时，若伤害超出怪物血量，回复 4 点生命。',
      amuletEffect: 'life',
    },
    {
      type: 'amulet',
      name: 'Guardian Amulet',
      value: 5,
      image: guardianAmuletImage,
      description: '有护盾格挡时，超出格挡的伤害最多为 6 点。',
      amuletEffect: 'guardian',
    },
    {
      type: 'amulet',
      name: 'Flash Amulet',
      value: 5,
      image: flashAmuletImage,
      description: '所有Equipment攻击力-3，攻击两次',
      amuletEffect: 'flash',
    },
    {
      type: 'amulet',
      name: 'Strength Amulet',
      value: 5,
      image: strengthAmuletImage,
      description: '所有Equipment 攻击+4，每攻击一次，掉2点血',
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
    name: '瀑流重置',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: '将激活行的所有卡牌置于牌堆底（不打乱其余牌序），然后触发瀑布。'
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '风暴箭雨',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: '对激活行的每个怪物造成 3 点伤害。'
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '回响行囊',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: '弃置至多 2 张手牌，从坟场发现 2 张牌，再从背包抽 2 张牌。(可超手牌上限)'
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '壁垒猛击',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: '获得被动技能：之后每次瀑流计数增加时，随机一侧装备栏永久护甲 +1。'
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '血债清算',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: '对任意怪物造成等同于当前金币数量的伤害，并恢复等量生命。'
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '永恒修复',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: '选择一件武器或随从，在下个瀑流之前使用不消耗耐久。'
  });

  // Event cards rewritten (first six)
  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '命运十字路口',
    value: 0,
    image: eventScrollImage,
    description: '打开时向左平移至被阻挡位置。若正下方有装备或护符，可破坏它并获得全部效果。',
    eventChoices: [
      { text: '倾听命运的低语（发现专属卡）', effect: 'discoverClass', hint: '立即进行发现流程' },
      { text: '与命运商贩交谈（打开商店）', effect: 'openShop', hint: '立刻开启商店' },
      { text: '献祭体魄（永久 +3 生命上限）', effect: 'maxhpperm+3', hint: '上限提升会保留整局' },
    ],
  });

  const vaultId = `event-${id++}`;
  deck.push({
    id: vaultId,
    type: 'event',
    name: '秘藏宝库',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      {
        text: '搜刮遗物（获得两张专属卡，随机弃两张手牌）',
        effect: ['drawClass2', 'randomDiscardHand:2'],
        hint: '专属卡放入背包，随机弃置两张手牌',
        requires: [{ type: 'hand', min: 2, message: '需要至少 2 张手牌' }],
      },
      {
        text: '翻找黄金（掷骰决定收益）',
        hint: '25% +10金 / 25% +20金 / 25% -10金 / 25% -10金且弃1手牌',
        diceTable: [
          { id: 'vault-gold10', range: [1, 5], label: '+10 金币', effect: 'gold+10' },
          { id: 'vault-gold20', range: [6, 10], label: '+20 金币', effect: 'gold+20' },
          { id: 'vault-gold-10', range: [11, 15], label: '-10 金币', effect: 'gold-10' },
          { id: 'vault-gold-10d', range: [16, 20], label: '-10 金币，弃 1 手牌', effect: 'gold-10,randomDiscardHand:1' },
        ],
      },
      {
        text: '翻出药剂（掷骰决定效果）',
        hint: '30% 恢复5HP / 30% 恢复10HP / 40% 受到8点伤害',
        diceTable: [
          { id: 'vault-heal5', range: [1, 6], label: '恢复 5 HP', effect: 'heal+5' },
          { id: 'vault-heal10', range: [7, 12], label: '恢复 10 HP', effect: 'heal+10' },
          { id: 'vault-dmg8', range: [13, 20], label: '受到 8 点伤害', effect: 'hp-8' },
        ],
      },
    ],
    flipTarget: {
      toCard: {
        id: `${vaultId}-flip`,
        type: 'event',
        name: '秘藏宝库（已开启）',
        value: 0,
        image: eventScrollImage,
        eventChoices: [
          { text: '翻阅卷轴（抽 2 张牌）', effect: 'drawHeroCards:2' },
          { text: '联络商贩（商店等级 +1）', effect: 'shopLevel+1' },
          { text: '召唤商队（打开商店）', effect: 'openShop' },
          { text: '深入探索（受 3 伤害，瀑流+1，翻转回去）', effect: 'vault-flipback', hint: '受到 3 点伤害，瀑流计数 +1，宝库翻转回未开启状态' },
        ],
      },
      destination: 'stay',
      message: '秘藏宝库翻转为已开启状态！',
    },
  });

  const shadowPactId = `event-${id++}`;
  deck.push({
    id: shadowPactId,
    type: 'event',
    name: '暗影契约',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: '签下血约（受到 8 点伤害）', effect: 'hp-8' },
      {
        text: '献出装备（破坏任一装备）',
        effect: 'destroyEquipment:any',
        hint: '会要求你选择左或右装备',
        requires: [{ type: 'equipmentAny', message: '需要至少一件装备' }],
      },
      { text: '支付赎金（损失 15 金币）', effect: 'gold-15' },
      { text: '扩展手牌（手牌上限 +1，跳过翻转）', effect: 'handLimit+1', skipFlip: true },
    ],
    flipTarget: {
      toCard: {
        id: `${shadowPactId}-flip`,
        type: 'magic',
        name: '暗影之刺',
        value: 0,
        image: skillScrollImage,
        magicType: 'permanent',
        magicEffect: '永久：对怪造成伤害；用后叠刺+1，回回收袋。',
        description: '每用过一次叠刺+1；卡面数字为叠刺层数。',
        scalingDamage: 1,
      },
      destination: 'backpack',
      message: '暗影契约翻转为「暗影之刺」，已放入背包。',
    },
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
    flipTarget: {
      toCard: {
        id: 'amulet-flip-gold',
        type: 'amulet',
        name: '熔炉之心',
        value: 0,
        image: balanceAmuletImage,
        description: `每有一张牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。可熔炉灵焰`,
        amuletEffect: 'flip-gold',
      },
      destination: 'backpack',
      banner: '共鸣熔炉翻转为「熔炉之心」，已放入背包。',
    },
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
        text: '献血离开（掉 8 HP）',
        effect: 'hp-8',
        hint: '仅当其他献祭方式全部不可用时可选',
        requiresDisabledChoices: ['greedy-left', 'greedy-right', 'greedy-amulet'],
        requiresDisabledReason: '仍有其他献祭方式可用',
      },
    ],
    waterfallEffect: { type: 'destroyAllEquipment', amount: 0, description: '被挤出时：破坏玩家所有装备' },
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '战血荣誉',
    value: 0,
    image: eventScrollImage,
    description: '选择一项奖励。结算后，此卡右侧格子上的所有怪物将被激怒（进入交战）。',
    eventChoices: [
      { text: '整理呼吸（回复 8 HP）', effect: 'heal+8' },
      { text: '回收战利品（金币 +15）', effect: 'gold+15' },
      { text: '唤醒底牌（获得底部两张专属卡）', effect: 'classBottom+2' },
      {
        text: '战血铭刻（翻转为永久法术）',
        effect: 'flipToHonorBloodMagic',
        hint: '翻转为「战血之印」：打出失去 1 生命并选一件装备 +1 耐久；被弃时对激活行每只怪造成 1 伤害',
        requires: [
          {
            type: 'leftmostIsEnraged',
            message:
              '地城激活行从左起第一个有牌的格子必须是怪物，且该怪物已与英雄交战；左侧空列不占用此判定。',
          },
        ],
      },
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
        hint: '背包容量永久降低 4，超过的卡牌会被随机放入回收袋',
      },
    ],
    waterfallEffect: { type: 'boostRowMonsterAttack', amount: 3, description: '被挤出时：所有怪物攻击 +3' },
  });

  const crimsonPactId = `event-${id++}`;
  deck.push({
    id: crimsonPactId,
    type: 'event',
    name: '深红契约',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: '血价交易（-2 HP，发现专属）', effect: 'hp-2,discoverClass' },
      {
        text: '捐献财富（-4 金币，商店等级 +1）',
        effect: 'gold-4,shopLevel+1',
        requires: [{ type: 'gold', min: 4, message: '需要至少 4 金币' }],
      },
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
    flipTarget: {
      toCard: {
        id: `${crimsonPactId}-flip`,
        type: 'event',
        name: '深红契约（觉醒）',
        value: 0,
        image: eventScrollImage,
        eventChoices: [
          { text: '鲜血献祭（-6 HP，发现专属）', effect: 'hp-6,discoverClass' },
          {
            text: '黄金燃祭（-12 金币，商店等级 +1）',
            effect: 'gold-12,shopLevel+1',
            requires: [{ type: 'gold', min: 12, message: '需要至少 12 金币' }],
          },
          {
            text: '灵魂焚烧（弃至多 4 张手牌，法伤 +1）',
            effect: ['randomDiscardHand:4', 'spellDamage+1'],
          },
        ],
      },
      destination: 'stay',
      message: '深红契约觉醒！代价更高，但仍可反复使用。',
    },
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '折页遗稿',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: '研读残页（抽 2 张牌）', effect: 'drawHeroCards:2' },
      { text: '翻转成「纸灰药剂」', effect: 'flipToPaperAsh', hint: '翻转为永久法术伤害 +2 的药剂' },
      { text: '翻转成「淬炼药剂」', effect: 'flipToLeftDurabilityPotion', hint: '翻转为左装备栏耐久上限 +1 的药剂' },
    ],
  });

  const cryptId = `event-${id++}`;
  deck.push({
    id: cryptId,
    type: 'event',
    name: '墓语密室',
    value: 0,
    image: eventScrollImage,
    description: '若左右两侧都是怪物，可获得翻转效果。',
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
      { text: '空间扩展（背包上限 +2）', effect: 'backpackSize+2' },
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
      { text: '翻转商会卷轴', effect: 'guildFlipToMagic', hint: '翻转为永久魔法「血金术」，放入背包' },
    ],
  });

  const fateDiceId = `event-${id++}`;
  deck.push({
    id: fateDiceId,
    type: 'event',
    name: '命运骰盅',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      {
        text: '掷出不同结果：打开商店/商店等级+1/法术伤害+1/摧毁所有护符/发现一张专属卡，然后翻转成"命运之刃"。',
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
    flipTarget: {
      toCard: {
        id: `${fateDiceId}-flip`,
        type: 'event',
        name: '命运之刃',
        value: 0,
        image: eventScrollImage,
        isPermanentEvent: true,
        description: '永驻型事件。从手牌打出时失去 5 点生命。出场或换位时获得一次释放机会：右侧为药水/武器/护盾/事件则摧毁并送入坟场；右侧为怪物则激怒，直接打掉 2 层血（可击杀）；右侧无牌则从背包抽 2 张牌。可手动拖入回收袋。',
        eventChoices: [
          { text: '释放命运之刃', hint: '对右侧相邻卡牌造成效果（事件会进坟场）', effect: 'fate-dice-strike' },
        ],
      },
      destination: 'stay',
      message: '命运骰盅翻转为命运之刃！',
    },
  });

  const chaosDiceId = `event-${id++}`;
  deck.push({
    id: chaosDiceId,
    type: 'event',
    name: '混沌骰局',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      {
        text: '20%掷出不同结果：打开商店/背包加入一张诅咒/删除1张牌/获得2张专属卡/抽2张牌，并翻转为"混沌冲击"。',
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
    flipTarget: {
      toCard: {
        id: `${chaosDiceId}-flip`,
        type: 'magic',
        name: '混沌冲击',
        value: 0,
        image: skillScrollImage,
        magicType: 'permanent',
        magicEffect: '永久魔法：对一个怪物造成 3 点伤害。若恰好减掉一个血层，额外抽 2 张牌。(可超手牌上限)',
        description: '对一个怪物造成 3 点伤害。若恰好减掉一个血层，额外抽 2 张牌。(可超手牌上限)',
      },
      destination: 'backpack',
      message: '混沌骰局翻转为混沌冲击！',
    },
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '裂隙契约',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      {
        text: '掷出不同结果：锋刃祝福/时空收缩/空间代价。',
        hint: '35% 锋刃祝福 / 35% 时空收缩 / 30% 空间代价',
        diceTable: [
          { id: 'rift-burst', range: [1, 7], label: '锋刃祝福：武器下次攻击 +4', effect: 'equipBurst+4' },
          { id: 'rift-shrink', range: [8, 14], label: '时空收缩：Waterfall 进度 -2', effect: 'turnCount-2' },
          { id: 'rift-cost', range: [15, 20], label: '空间代价：背包 -2，获得法术回响', effect: ['backpackSize-2', 'flipToDoubleNextMagic'] },
        ],
      },
    ],
  });

  return deck.sort(() => Math.random() - 0.5);
}

const STARTER_CARD_IDS = {
  weaponBurst: 'starter-perm-weapon-burst',
  repairOne: 'starter-perm-repair-one',
  reshuffle: 'starter-perm-reshuffle',
  discardDraw: 'starter-perm-discard-draw',
  dungeonSwap: 'starter-perm-dungeon-swap',
  trainingBlade: 'starter-weapon-training-blade',
  /** 选择「雷盾心法」时替换新手短剑 */
  shieldWallStarter: 'starter-shield-shield-wall',
  /** 选择「愈战愈勇」时加入背包，与药水翻转的治愈余韵效果相同 */
  healEcho: 'starter-perm-heal-echo',
} as const;

function createStarterHealEchoCard(): GameCardData {
  return {
    id: STARTER_CARD_IDS.healEcho,
    type: 'magic',
    name: '治愈余韵',
    value: 0,
    image: skillScrollImage,
    magicType: 'permanent',
    magicEffect: '永久魔法：使用时立即回复 2 点生命。',
    description: '使用时立即回复 2 点生命。使用后回到回收袋，瀑流后可再次使用。',
  };
}

function createStarterBackpack(): GameCardData[] {
  return [
    {
      id: STARTER_CARD_IDS.weaponBurst,
      type: 'magic',
      name: '战斗鼓舞',
      value: 0,
      image: skillScrollImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：选择一个装备栏，使其装备的下一次攻击 +3。',
      description: '选择一个装备栏，使其中装备的下一次攻击临时 +3。',
    },
    {
      id: STARTER_CARD_IDS.repairOne,
      type: 'magic',
      name: '精工修复',
      value: 0,
      image: skillScrollImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：选择一个装备，恢复 1 点耐久。',
      description: '精准地修补武器或护盾，恢复 1 点耐久值。',
      recycleDelay: 1,
    },
    {
      id: STARTER_CARD_IDS.discardDraw,
      type: 'magic',
      name: '汰旧迎新',
      value: 0,
      image: skillScrollImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：弃 1 张手牌到回收袋，从背包抽 2 张牌。',
      description: '弃置 1 张手牌到回收袋，从背包抽取 2 张新牌。',
      recycleDelay: 1,
    },
    {
      id: STARTER_CARD_IDS.reshuffle,
      type: 'magic',
      name: '迷宫回溯',
      value: 0,
      image: skillScrollImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：选择一张地城卡牌，置于牌堆底（不打乱牌堆）。',
      description: '将一张地城卡牌放到牌堆最底部。',
      recycleDelay: 2,
    },
    {
      id: STARTER_CARD_IDS.dungeonSwap,
      type: 'magic',
      name: '乾坤挪移',
      value: 0,
      image: skillScrollImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：将地城行最左和最右的卡牌对换位置。',
      description: '扭转地城秩序，将最左与最右的卡牌互换。',
      recycleDelay: 2,
    },
    {
      id: STARTER_CARD_IDS.trainingBlade,
      type: 'weapon',
      name: '新手短剑',
      value: 2,
      image: swordImage,
      durability: 2,
      maxDurability: 2,
    },
  ];
}

export default function GameBoard() {
  const gameViewport = useGameViewport();
  const overlayZoom = useOverlayScale();
  const { isLowPerf } = usePerformanceMode();
  const lowPerfRef = useRef(false);
  lowPerfRef.current = isLowPerf;
  const animSpeed = useCallback((ms: number) => lowPerfRef.current ? Math.round(ms * 0.45) : ms, []);
  // const { toast } = useToast(); // Disabled toast notifications
  const [hp, setHp] = useState(INITIAL_HP);
  const hpRef = useRef(INITIAL_HP);
  hpRef.current = hp;
  const [gold, setGold] = useState(INITIAL_GOLD);
  const goldRef = useRef(INITIAL_GOLD);
  goldRef.current = gold;
  const [turnCount, setTurnCount] = useState(INITIAL_TURN_COUNT);
  const [shopLevel, setShopLevel] = useState(0);
  const [previewCards, setPreviewCards] = useState<ActiveRowSlots>(createEmptyActiveRow()); // Preview row slots
  const [activeCards, setActiveCards] = useState<ActiveRowSlots>(createEmptyActiveRow());
  const [remainingDeck, setRemainingDeck] = useState<GameCardData[]>([]);
  const [equipmentSlot1, setEquipmentSlot1] = useState<EquipmentItem | null>(null);
  const [equipmentSlot2, setEquipmentSlot2] = useState<EquipmentItem | null>(null);
  const [equipmentSlot1Reserve, setEquipmentSlot1Reserve] = useState<EquipmentItem[]>([]);
  const [equipmentSlot2Reserve, setEquipmentSlot2Reserve] = useState<EquipmentItem[]>([]);
  const [equipmentSlotCapacity, setEquipmentSlotCapacity] = useState<Record<EquipmentSlotId, number>>({
    equipmentSlot1: 1,
    equipmentSlot2: 1,
  });
  const [maxAmuletSlots, setMaxAmuletSlots] = useState(MAX_AMULET_SLOTS);
  const undoStackRef = useRef<UndoSnapshot[]>(
    (loadUndoStack() as any[]).filter((s: any) => s?.gameState && s?.transient) as UndoSnapshot[],
  );
  const [undoCount, setUndoCount] = useState(() => undoStackRef.current.length);
  const undoGuardRef = useRef(false);
  /** 每次 hydrate / 新开局递增；格挡等异步结算在 await 后若发现过期则立刻放弃，避免撤销后仍写入旧闭包数据 */
  const combatAsyncEpochRef = useRef(0);
  const [amuletSlots, setAmuletSlots] = useState<AmuletItem[]>([]);
  const amuletSlotsRef = useRef<AmuletItem[]>(amuletSlots);
  useLayoutEffect(() => {
    amuletSlotsRef.current = amuletSlots;
  }, [amuletSlots]);
  useLayoutEffect(() => {
    const el = headerWrapperRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      setHeaderHeight(prev => (Math.abs(prev - h) < 0.5 ? prev : h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
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
        case 'dual-guard':
          state.hasDualGuard = true;
          break;
        case 'discard-zap':
          state.hasDiscardShock = true;
          break;
        case 'flip-gold':
          state.hasFlipGold = true;
          break;
        case 'recycle-forge':
          state.hasRecycleForge = true;
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
  const backpackItemsRef = useRef<GameCardData[]>([]);
  const [permanentMagicRecycleBag, setPermanentMagicRecycleBag] = useState<GameCardData[]>([]); // Perm magic waiting for waterfall
  const [backpackCapacityModifier, setBackpackCapacityModifier] = useState(0);
  const backpackCapacity = Math.max(1, BASE_BACKPACK_CAPACITY + backpackCapacityModifier);
  const [backpackViewerOpen, setBackpackViewerOpen] = useState(false);
  const [heroDetailsOpen, setHeroDetailsOpen] = useState(false);
  const [classDeckFlights, setClassDeckFlights] = useState<ClassDeckFlight[]>([]);
  const [discoverModalOpen, setDiscoverModalOpen] = useState(false);
  const [discoverOptions, setDiscoverOptions] = useState<GameCardData[]>([]);
  const [shopModalOpen, setShopModalOpen] = useState(false);
  const [shopModalMinimized, setShopModalMinimized] = useState(false);
  const [shopOfferings, setShopOfferings] = useState<ShopOffering[]>([]);
  const [shopSourceEvent, setShopSourceEvent] = useState<GameCardData | null>(null);
  const [shopDeleteUsed, setShopDeleteUsed] = useState(false);
  const [shopHealUsed, setShopHealUsed] = useState(false);
  const [shopLevelUpUsed, setShopLevelUpUsed] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [cardActionContext, setCardActionContext] = useState<CardActionContext | null>(null);
  const cardActionResolverRef = useRef<(() => void) | null>(null);
  const cardActionRemainingRef = useRef(0);
  const deletingCardIdsRef = useRef(new Set<string>());
  const adjustShopLevel = useCallback((delta: number) => {
    if (!delta) return;
    setShopLevel(prev => Math.min(MAX_SHOP_LEVEL, Math.max(0, Math.floor(prev + delta))));
  }, []);
  const [cardsPlayed, setCardsPlayed] = useState(0);
  const [recycleForgePlayCount, setRecycleForgePlayCount] = useState(0);
  const recycleForgePlayCountRef = useRef(0);
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
  const [monsterDefeatStates, setMonsterDefeatStates] = useState<Record<string, boolean>>({});
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
  const [directedCombatFxFlights, setDirectedCombatFxFlights] = useState<DirectedCombatFxFlight[]>([]);
  const [heroVariant, setHeroVariant] = useState<HeroVariant>(() => getRandomHero());
  const [isCombatPanelMinimized, setIsCombatPanelMinimized] = useState(true);
  const [combatPanelPosition, setCombatPanelPosition] = useState<{ x: number; y: number } | null>(null);
  const [combatPanelSize, setCombatPanelSize] = useState({ width: 0, height: 0 });
  const [isCombatPanelDragging, setIsCombatPanelDragging] = useState(false);
  const combatPanelWrapperRef = useRef<HTMLDivElement | null>(null);
  const combatPanelDragSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const combatPanelHasCustomPositionRef = useRef(false);
  const combatPanelWindowListenersRef = useRef<{
    move: (event: PointerEvent) => void;
    up: (event: PointerEvent) => void;
  } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const gameSurfaceRef = useRef<HTMLDivElement | null>(null);
  const headerWrapperRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(48);
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
  const directedCombatFxFlightsRef = useRef<DirectedCombatFxFlight[]>([]);
  const directedCombatFxElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const directedCombatFxFlightAnimationRef = useRef<number | null>(null);
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
        }, animSpeed(COMBAT_ANIMATION_DURATION));
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
        }, animSpeed(COMBAT_ANIMATION_DURATION));
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
        }, animSpeed(COMBAT_ANIMATION_DURATION));
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
        }, animSpeed(COMBAT_ANIMATION_DURATION));
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
      if (directedCombatFxFlightAnimationRef.current !== null) {
        cancelAnimationFrame(directedCombatFxFlightAnimationRef.current);
      }
    };
  }, []);
  const heroCellRef = useRef<HTMLDivElement>(null);
  const heroRowCellRefs = useRef<Array<HTMLDivElement | null>>(Array(6).fill(null));
  const monsterCellRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [monsterRageInsets, setMonsterRageInsets] = useState<Record<string, MonsterRageInset>>({});
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
  const deckFlyTargetRef = useRef<HTMLButtonElement | null>(null);
  const heroFrameBoundsRef = useRef<DOMRect | null>(null);
  const heroFrameDropIntentRef = useRef(false);
  const draggedCardRef = useRef<GameCardData | null>(null);
  const handleCardToHeroRef = useRef<((card: GameCardData) => void) | null>(null);
  const heroSkillButtonRef = useRef<HTMLButtonElement | null>(null);
  const [heroRowFrameDropActive, setHeroRowFrameDropActive] = useState(false);
  const classDeckFlightsRef = useRef<ClassDeckFlight[]>([]);
  const classDeckFlightAnimationRef = useRef<number | null>(null);
  const classDeckFlightElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [backpackHandFlights, setBackpackHandFlights] = useState<BackpackHandFlight[]>([]);
  const backpackHandFlightsRef = useRef<BackpackHandFlight[]>([]);
  const backpackHandFlightAnimationRef = useRef<number | null>(null);
  const backpackFlightElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [discardShockFlights, setDiscardShockFlights] = useState<DiscardShockFlight[]>([]);
  /** 弃牌雷击队列/弹道未结束时禁止玩家操作（与最小化 Event/Shop 合并为 fullBoardInteractionLocked） */
  const [discardShockInteractionLocked, setDiscardShockInteractionLocked] = useState(false);
  const discardShockFlightsRef = useRef<DiscardShockFlight[]>([]);
  const discardShockFlightAnimationRef = useRef<number | null>(null);
  const discardShockElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  // Discard flight animation (hand → graveyard / backpack)
  const [discardFlights, setDiscardFlights] = useState<DiscardFlight[]>([]);
  const discardFlightsRef = useRef<DiscardFlight[]>([]);
  const discardFlightAnimationRef = useRef<number | null>(null);
  const discardFlightElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const discardFlightResolveMapRef = useRef<Map<string, () => void>>(new Map());
  /** 多次弃牌雷击：排队，上一发飞行完全结束后再发下一发 */
  const discardShockProcQueueRef = useRef<{ showBanner: boolean }[]>([]);
  const discardShockSeqInFlightRef = useRef(false);
  const flushDiscardShockQueueRef = useRef<() => void>(() => {});
  const applyDiscardShockHitRef = useRef<(flight: DiscardShockFlight) => void>(() => {});
  const beginCombatRef = useRef<(monster: GameCardData, initiator: CombatInitiator) => void>(() => {});
  const activeCardsLatestRef = useRef<ActiveRowSlots>(activeCards);
  activeCardsLatestRef.current = activeCards;
  const backpackHandFlightFallbacksRef = useRef<Map<string, number>>(new Map());
  const pendingHandDeliveryGuardsRef = useRef<
    Map<string, { card: GameCardData; timeoutId: number | null }>
  >(new Map());
  const pendingAutoDrawsRef = useRef(0);
  const skipNextEventAutoDrawRef = useRef(false);
  const skipEventFlipRef = useRef(false);
  const storingCardIdsRef = useRef<Set<string>>(new Set());
  const previousActiveCardsRef = useRef<ActiveRowSlots>(createEmptyActiveRow());
  const freshGameStartRef = useRef(false);
  const processedDungeonCardIdsRef = useRef<Set<string>>(new Set());
  const heroTurnLayerLossIdsRef = useRef<Set<string>>(new Set());
  const pendingDefeatIdsRef = useRef<Set<string>>(new Set());
  const goblinStolenIdsRef = useRef<Set<string>>(new Set());
  const monsterRewardQueuedInstanceIdsRef = useRef<Set<string>>(new Set());
  const [heroFramePosition, setHeroFramePosition] = useState<HeroFramePosition | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const lastPersistedStateRef = useRef<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number>(gameViewport.width);
  const isFlat = gameViewport.width / gameViewport.height > FLAT_ASPECT_RATIO;
  const gridMetrics = useMemo(() => {
    const base = getGridMetricsForWidth(viewportWidth);
    if (isFlat) {
      return { ...base, gapY: Math.max(1, Math.round(base.gapY * 0.15)) };
    }
    return base;
  }, [viewportWidth, isFlat]);
  const stageScale = useMemo(() => {
    return clamp(viewportWidth / 1280, 0.75, 1.6);
  }, [viewportWidth]);
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
      '--dh-stage-scale': stageScale.toString(),
    } as CSSProperties;
  }, [gridMetrics, stageScale]);
  
  // Track grid card size for synchronization with hand
  const gridCellRef = useRef<HTMLDivElement | null>(null);
  const [gridCardSize, setGridCardSize] = useState<{width: number, height: number} | undefined>(undefined);
  const gridCardSizeRef = useRef(gridCardSize);
  const isCompactViewport = gameViewport.width < 500;
  const rageStripWidth = useMemo(() => {
    if (!gridCardSize?.width) {
      return isCompactViewport ? 9 : 14;
    }
    if (isCompactViewport) {
      return Math.max(5, Math.min(9, gridCardSize.width * 0.04));
    }
    return Math.max(8, Math.min(14, gridCardSize.width * 0.05));
  }, [gridCardSize, isCompactViewport]);
  const overlayScale = useMemo(() => {
    if (!gridCardSize?.width) {
      return 1;
    }
    const baseWidth = 180;
    const scale = gridCardSize.width / baseWidth;
    return clamp(scale, 0.65, 1.3);
  }, [gridCardSize]);
  useEffect(() => { gridCardSizeRef.current = gridCardSize; }, [gridCardSize]);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--dh-rage-strip-width', `${rageStripWidth}px`);
  }, [rageStripWidth]);
  const monsterCardSignature = useMemo(
    () =>
      activeCards
        .map(card => (card && card.type === 'monster' ? card.id : ''))
        .join('|'),
    [activeCards],
  );
  const measureMonsterRageInsets = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const entries = Object.entries(monsterCellRefs.current);
    if (!entries.length) {
      setMonsterRageInsets(prev => (Object.keys(prev).length ? {} : prev));
      return;
    }
    const next: Record<string, MonsterRageInset> = {};
    let hasInset = false;
    entries.forEach(([monsterId, cellEl]) => {
      if (!cellEl) {
        return;
      }
      const styles = window.getComputedStyle(cellEl);
      const inset: MonsterRageInset = {
        top: parseFloat(styles.paddingTop) || 0,
        bottom: parseFloat(styles.paddingBottom) || 0,
        left: parseFloat(styles.paddingLeft) || 0,
        right: parseFloat(styles.paddingRight) || 0,
      };
      next[monsterId] = inset;
      hasInset = true;
    });
    setMonsterRageInsets(prev => {
      if (!hasInset) {
        return Object.keys(prev).length ? {} : prev;
      }
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        return next;
      }
      for (const key of nextKeys) {
        const prevInset = prev[key];
        const nextInset = next[key];
        if (
          !prevInset ||
          Math.abs(prevInset.top - nextInset.top) > 0.5 ||
          Math.abs(prevInset.bottom - nextInset.bottom) > 0.5 ||
          Math.abs(prevInset.left - nextInset.left) > 0.5 ||
          Math.abs(prevInset.right - nextInset.right) > 0.5
        ) {
          return next;
        }
      }
      return prev;
    });
  }, []);
  const getMonsterRageOverlayStyle = useCallback(
    (monsterId: string): CSSProperties => {
      const inset = monsterRageInsets[monsterId];
      const fallback = gridMetrics.padding;
      const top = inset?.top ?? fallback;
      const bottom = inset?.bottom ?? fallback;
      const left = inset?.left ?? fallback;
      const right = inset?.right ?? fallback;
      return {
        top: `${top}px`,
        bottom: `${bottom}px`,
        left: `${left}px`,
        right: `${right}px`,
      };
    },
    [monsterRageInsets, gridMetrics.padding],
  );
  const handAreaRef = useRef<HTMLDivElement | null>(null);
  const [waterfallAnimation, setWaterfallAnimation] = useState<WaterfallAnimationState>(initialWaterfallAnimationState);
  const [previewGraveyardVectors, setPreviewGraveyardVectors] = useState<Record<number, GraveyardVector>>({});
  const [previewDeckReturnVectors, setPreviewDeckReturnVectors] = useState<Record<number, GraveyardVector>>({});
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
    },
    [],
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

  const updatePreviewToDeckVector = useCallback((slotIndex: number | null) => {
    if (slotIndex === null) return;
    const previewCell = previewCellRefs.current[slotIndex];
    const deckEl = deckFlyTargetRef.current;
    if (!previewCell || !deckEl) return;
    const previewRect = previewCell.getBoundingClientRect();
    const deckRect = deckEl.getBoundingClientRect();
    const vector: GraveyardVector = {
      offsetX: deckRect.left + deckRect.width / 2 - (previewRect.left + previewRect.width / 2),
      offsetY: deckRect.top + deckRect.height / 2 - (previewRect.top + previewRect.height / 2),
    };
    setPreviewDeckReturnVectors(prev => {
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

  const waterfallDiscardFlyRef = useRef<{
    slot: number | null;
    destination: WaterfallDiscardDestination;
  }>({ slot: null, destination: 'graveyard' });

  useEffect(() => {
    waterfallDiscardFlyRef.current = {
      slot: waterfallAnimation.discardSlot,
      destination: waterfallAnimation.discardDestination,
    };
  }, [waterfallAnimation.discardSlot, waterfallAnimation.discardDestination]);

  useEffect(() => {
    logWaterfall('animation-state', {
      phase: waterfallAnimation.phase,
      isActive: waterfallAnimation.isActive,
      droppingSlots: waterfallAnimation.droppingSlots,
      landingSlots: waterfallAnimation.landingSlots,
      discardSlot: waterfallAnimation.discardSlot,
      discardDestination: waterfallAnimation.discardDestination,
      dealingSlots: waterfallAnimation.dealingSlots,
      sequenceId: waterfallAnimation.sequenceId,
    });
  }, [waterfallAnimation]);
  useEffect(() => {
    draggedCardRef.current = draggedCard;
  }, [draggedCard]);

  useEffect(() => {
    const bladeIdx = activeCards.findIndex(c => c?.name === '命运之刃' && c.isPermanentEvent);
    if (bladeIdx === -1) return;
    const blade = activeCards[bladeIdx]!;
    if (blade._fateBladeLastSlot !== bladeIdx) {
      const shouldGrantCharge = !blade.hasReleaseCharge;
      setActiveCards(prev => {
        const next = [...prev] as typeof prev;
        const idx = next.findIndex(c => c?.name === '命运之刃' && c.isPermanentEvent);
        if (idx === -1) return prev;
        const card = next[idx]!;
        if (card._fateBladeLastSlot === idx) return prev;
        next[idx] = {
          ...card,
          hasReleaseCharge: shouldGrantCharge ? true : card.hasReleaseCharge,
          _fateBladeLastSlot: idx,
        };
        return next;
      });
    }
  }, [activeCards]);

  useEffect(() => {
    setViewportWidth(gameViewport.width);
  }, [gameViewport.width]);

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
    measureMonsterRageInsets();
  }, [
    measureMonsterRageInsets,
    monsterCardSignature,
    gridMetrics.padding,
    gridCardSize?.width,
    gridCardSize?.height,
  ]);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleResize = () => measureMonsterRageInsets();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [measureMonsterRageInsets]);

  useLayoutEffect(() => {
    const slot = waterfallAnimation.discardSlot;
    if (slot === null) return;
    if (waterfallAnimation.discardDestination === 'deck') {
      updatePreviewToDeckVector(slot);
    } else {
      updatePreviewToGraveyardVector(slot);
    }
  }, [
    waterfallAnimation.discardSlot,
    waterfallAnimation.discardDestination,
    updatePreviewToDeckVector,
    updatePreviewToGraveyardVector,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      const { slot, destination } = waterfallDiscardFlyRef.current;
      if (slot === null) return;
      if (destination === 'deck') {
        updatePreviewToDeckVector(slot);
      } else {
        updatePreviewToGraveyardVector(slot);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updatePreviewToDeckVector, updatePreviewToGraveyardVector]);

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
  const [turnDamageTaken, setTurnDamageTaken] = useState(0);
  const [deckViewerOpen, setDeckViewerOpen] = useState(false);

  const [gameLogEntries, setGameLogEntries] = useState<LogEntry[]>(() => {
    const saved = loadGameLog();
    return saved ? (saved.entries as LogEntry[]) : [];
  });
  const gameLogIdRef = useRef<number>(loadGameLog()?.nextId ?? 0);
  const addGameLog = useCallback((type: LogEntryType, message: string) => {
    const id = ++gameLogIdRef.current;
    setGameLogEntries(prev => {
      const next = [...prev, { id, type, message, timestamp: Date.now() }];
      saveGameLog(next, gameLogIdRef.current);
      return next;
    });
  }, []);
  const clearGameLog = useCallback(() => {
    setGameLogEntries([]);
    gameLogIdRef.current = 0;
    clearGameLogStorage();
  }, []);
  const [discardedCards, setDiscardedCards] = useState<GameCardData[]>([]);
  const discardedCardsRef = useRef<GameCardData[]>([]);
  const [waveDiscardCount, setWaveDiscardCount] = useState(0);
  const [handCards, setHandCards] = useState<GameCardData[]>([]); // Hand system - max 7 cards
  const handCardsRef = useRef<GameCardData[]>([]);
  const deletableCardCount = handCards.length + backpackItems.length + permanentMagicRecycleBag.length;
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
  const [eventModalMinimized, setEventModalMinimized] = useState(false);
  const eventChoiceProcessingRef = useRef(false);
  /** Event / Shop 最小化时冻结主界面操作（与弃牌雷击共用 fullBoardInteractionLocked） */
  const minimizedModalLocksBoard =
    (eventModalOpen && eventModalMinimized) || (shopModalOpen && shopModalMinimized);
  const fullBoardInteractionLocked =
    discardShockInteractionLocked || minimizedModalLocksBoard;
  const fullBoardInteractionLockedRef = useRef(false);
  fullBoardInteractionLockedRef.current = fullBoardInteractionLocked;
  /** Subset used only for End Hero Turn; updated later when modal/targeting flags are known */
  const endHeroTurnGuardRef = useRef(false);
  const [currentEventCard, setCurrentEventCard] = useState<GameCardData | null>(null);
  const [permanentMaxHpBonus, setPermanentMaxHpBonus] = useState(0);
  const [permanentSpellDamageBonus, setPermanentSpellDamageBonus] = useState(0);
  const [handLimitBonus, setHandLimitBonus] = useState(0);
  const [heroMagicState, setHeroMagicState] = useState<HeroMagicState>(() =>
    createInitialHeroMagicState(),
  );
  const [eventDiceModal, setEventDiceModal] = useState<EventDiceModalState | null>(null);
  const [eventDiceRollKey, setEventDiceRollKey] = useState(0);
  const eventDiceResolverRef = useRef<((entry: EventDiceRange | null) => void) | null>(null);
  const [equipmentPrompt, setEquipmentPrompt] = useState<EquipmentPromptState | null>(null);
  const equipmentPromptResolverRef = useRef<((slot: EquipmentSlotId | null) => void) | null>(null);
  const [eventTransformState, setEventTransformState] = useState<EventTransformState | null>(null);
  const [graveyardDiscoverState, setGraveyardDiscoverState] = useState<GameCardData[] | null>(null);
  const graveyardDiscoverResolverRef = useRef<((card: GameCardData | null) => void) | null>(null);
  /** 坟场三选一取回目的地：亡灵拾遗优先入手牌，其余默认背包 */
  const graveyardDiscoverDeliveryRef = useRef<'backpack' | 'hand-first'>('backpack');
  const suppressDeathWardRef = useRef(false);
  
  // Hero class system state
  const [heroClass] = useState<'knight' | 'mage' | 'rogue'>('knight'); // Default to Knight
  const [classCardsInHand, setClassCardsInHand] = useState<KnightCardData[]>([]);
  const [selectedHeroSkill, setSelectedHeroSkill] = useState<string | null>(null); // Selected Knight skill
  const selectedHeroSkillRef = useRef<string | null>(selectedHeroSkill);
  selectedHeroSkillRef.current = selectedHeroSkill;
  const [extraHeroSkills, setExtraHeroSkills] = useState<HeroSkillId[]>([]);
  const [extraSkillsUsedThisWave, setExtraSkillsUsedThisWave] = useState<Set<string>>(() => new Set());
  const [shopSkillSelectOpen, setShopSkillSelectOpen] = useState(false);
  const [shopSkillOptions, setShopSkillOptions] = useState<HeroSkillDefinition[]>([]);
  const [shopSkillDiscoverUsed, setShopSkillDiscoverUsed] = useState(false);
  const healAccumulatorRef = useRef(0);
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
  const [unbreakableUntilWaterfall, setUnbreakableUntilWaterfall] = useState<Record<EquipmentSlotId, boolean>>(
    { equipmentSlot1: false, equipmentSlot2: false },
  );
  const [bulwarkPassiveActive, setBulwarkPassiveActive] = useState(0);
  const bulwarkPassiveRef = useRef(0);
  bulwarkPassiveRef.current = bulwarkPassiveActive;
  const [defensiveStanceActive, setDefensiveStanceActive] = useState(false); // Damage reduction this turn
  const [slotAttackBursts, setSlotAttackBursts] = useState<Record<EquipmentSlotId, number>>(
    () => createEmptyEquipmentBuffState(),
  );
  /** 噬血砺锋：该装备槽下一次攻击按实际扣血吸血（经 healHero，治疗护符会翻倍） */
  const [nextAttackLifestealSlot, setNextAttackLifestealSlot] = useState<EquipmentSlotId | null>(null);
  const [berserkTurnBuff, setBerserkTurnBuff] = useState<Record<EquipmentSlotId, number>>(
    () => createEmptyEquipmentBuffState(),
  );
  const [extraAttackCharges, setExtraAttackCharges] = useState(0);
  const [doubleNextMagic, setDoubleNextMagic] = useState(false);
  const [combatState, setCombatState] = useState<CombatState>(initialCombatState);
  const engagedMonsterIdsRef = useRef<string[]>(initialCombatState.engagedMonsterIds);
  engagedMonsterIdsRef.current = combatState.engagedMonsterIds;
  const isMonsterEngaged = (monsterId: string) => combatState.engagedMonsterIds.includes(monsterId);
  /** 怪物回合或等待格挡：手牌应与地城格一样不可操作，仅可用格挡按钮 */
  const handLockedForMonsterPhase = useMemo(
    () =>
      combatState.engagedMonsterIds.length > 0 &&
      (combatState.currentTurn === 'monster' || Boolean(combatState.pendingBlock)),
    [combatState.engagedMonsterIds, combatState.currentTurn, combatState.pendingBlock],
  );
  const handLockedForMonsterPhaseRef = useRef(false);
  handLockedForMonsterPhaseRef.current = handLockedForMonsterPhase;
  const [swordVectors, setSwordVectors] = useState<Record<string, SwordVector>>({});
  const [equipmentSlotBonuses, setEquipmentSlotBonuses] = useState<EquipmentSlotBonusState>(() => createEmptySlotBonusState());
  const [heroSkillUsedThisWave, setHeroSkillUsedThisWave] = useState(false);
  const [pendingHeroSkillAction, setPendingHeroSkillAction] = useState<PendingHeroSkillAction | null>(null);
  const [pendingHeroMagicAction, setPendingHeroMagicAction] = useState<PendingHeroMagicAction | null>(null);
  const [pendingMagicAction, setPendingMagicAction] = useState<PendingMagicAction | null>(null);
  const echoRemainingRef = useRef(0);
  const echoTotalRef = useRef(0);
  const [pendingPotionAction, setPendingPotionAction] = useState<PendingPotionAction | null>(null);
  const [deathWardPrompt, setDeathWardPrompt] = useState<DeathWardPromptState | null>(null);
  const [monsterRewardQueue, setMonsterRewardQueue] = useState<MonsterRewardDrop[]>([]);
  const [activeMonsterReward, setActiveMonsterReward] = useState<MonsterRewardDrop | null>(null);
  const [heroSkillBanner, setHeroSkillBanner] = useState<string | null>(null);
  const monsterRewardPreviewCacheRef = useRef<Record<string, MonsterRewardOption[]>>({});
  const [selectedMonsterRewards, setSelectedMonsterRewards] = useState<MonsterRewardOption[] | null>(null);
  const [berserkerRageActive, setBerserkerRageActive] = useState(false);
  const [berserkerSlotUsed, setBerserkerSlotUsed] = useState<Record<string, boolean>>({});

  const ensureCardInHand = useCallback((card: GameCardData) => {
    setHandCards(prev => {
      if (prev.some(existing => existing.id === card.id)) {
        return prev;
      }
      logBackpackDraw('hand-insert', {
        cardId: card.id,
        name: card.name,
        prevHandSize: prev.length,
        nextHandSize: prev.length + 1,
      });
      const next = [...prev, card];
      handCardsRef.current = next;
      return next;
    });
  }, []);

  const clearBackpackHandFallback = useCallback((cardId: string) => {
    const fallbackTimers = backpackHandFlightFallbacksRef.current;
    const timeoutId = fallbackTimers.get(cardId);
    if (timeoutId !== undefined && typeof window !== 'undefined') {
      window.clearTimeout(timeoutId);
    }
    fallbackTimers.delete(cardId);
    logBackpackDraw('fallback-clear', { cardId, remainingTimers: fallbackTimers.size });
  }, []);

  const clearAllBackpackHandFallbacks = useCallback(() => {
    if (typeof window !== 'undefined') {
      backpackHandFlightFallbacksRef.current.forEach(timeoutId => {
        window.clearTimeout(timeoutId);
      });
    }
    backpackHandFlightFallbacksRef.current.clear();
    logBackpackDraw('fallback-clear-all');
  }, []);

  const clearAllHandDeliveryGuards = useCallback(() => {
    if (typeof window !== 'undefined') {
      pendingHandDeliveryGuardsRef.current.forEach(entry => {
        if (entry.timeoutId !== null) {
          window.clearTimeout(entry.timeoutId);
        }
      });
    }
    pendingHandDeliveryGuardsRef.current.clear();
    logBackpackDraw('hand-guard-clear-all');
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;

      animationDelayTimeoutsRef.current.forEach(id => clearTimeout(id));
      animationDelayTimeoutsRef.current = [];

      if (heroBleedTimeoutRef.current) {
        clearTimeout(heroBleedTimeoutRef.current);
        heroBleedTimeoutRef.current = null;
      }

      for (const timeouts of Object.values(monsterBleedTimeoutsRef.current)) {
        timeouts.forEach(id => clearTimeout(id));
      }
      monsterBleedTimeoutsRef.current = {};

      for (const timeouts of Object.values(weaponSwingTimeoutsRef.current)) {
        timeouts.forEach(id => clearTimeout(id));
      }
      weaponSwingTimeoutsRef.current = { equipmentSlot1: [], equipmentSlot2: [] };

      for (const timeouts of Object.values(shieldBlockTimeoutsRef.current)) {
        timeouts.forEach(id => clearTimeout(id));
      }
      shieldBlockTimeoutsRef.current = { equipmentSlot1: [], equipmentSlot2: [] };

      if (directedCombatFxFlightAnimationRef.current !== null) {
        cancelAnimationFrame(directedCombatFxFlightAnimationRef.current);
        directedCombatFxFlightAnimationRef.current = null;
      }
      directedCombatFxFlightsRef.current = [];
      setDirectedCombatFxFlights([]);
      directedCombatFxElementMapRef.current.clear();

      clearWaterfallTimeouts();

      pendingHandDeliveryGuardsRef.current.forEach(entry => {
        ensureCardInHand(entry.card);
      });
      clearAllHandDeliveryGuards();
      clearAllBackpackHandFallbacks();

      if (classDeckFlightAnimationRef.current !== null) {
        cancelAnimationFrame(classDeckFlightAnimationRef.current);
        classDeckFlightAnimationRef.current = null;
      }
      if (backpackHandFlightAnimationRef.current !== null) {
        cancelAnimationFrame(backpackHandFlightAnimationRef.current);
        backpackHandFlightAnimationRef.current = null;
      }
      if (discardShockFlightAnimationRef.current !== null) {
        cancelAnimationFrame(discardShockFlightAnimationRef.current);
        discardShockFlightAnimationRef.current = null;
      }

      for (const flight of discardShockFlightsRef.current) {
        if (!flight.delivered) {
          applyDiscardShockHitRef.current(flight);
        }
      }
      discardShockFlightsRef.current = [];
      setDiscardShockFlights([]);
      discardShockElementMapRef.current.clear();
      discardShockProcQueueRef.current = [];
      discardShockSeqInFlightRef.current = false;

      for (const flight of backpackHandFlightsRef.current) {
        if (!flight.delivered) {
          ensureCardInHand(flight.card);
        }
      }
      backpackHandFlightsRef.current = [];
      setBackpackHandFlights([]);

      classDeckFlightsRef.current = [];
      setClassDeckFlights([]);

      setHeroBleedActive(false);
      setMonsterBleedStates({});
      setWeaponSwingStates({ equipmentSlot1: 0, equipmentSlot2: 0 });
      setShieldBlockStates({ equipmentSlot1: 0, equipmentSlot2: 0 });
      setTakingDamage(false);
      setHealing(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [clearWaterfallTimeouts, clearAllBackpackHandFallbacks, clearAllHandDeliveryGuards, ensureCardInHand]);

  const scheduleBackpackHandFallback = useCallback(
    (card: GameCardData) => {
      if (typeof window === 'undefined') {
        ensureCardInHand(card);
        return;
      }

      clearBackpackHandFallback(card.id);

      const fallbackDelay = animSpeed(
        BACKPACK_FLIGHT_BASE_DURATION +
        BACKPACK_FLIGHT_VARIANCE +
        BACKPACK_FLIGHT_FALLBACK_BUFFER);

      const timeoutId = window.setTimeout(() => {
        backpackHandFlightFallbacksRef.current.delete(card.id);
        logBackpackDraw('fallback-fire', { cardId: card.id });
        ensureCardInHand(card);
      }, fallbackDelay);

      backpackHandFlightFallbacksRef.current.set(card.id, timeoutId);
      logBackpackDraw('fallback-scheduled', {
        cardId: card.id,
        delay: fallbackDelay,
        pendingTimers: backpackHandFlightFallbacksRef.current.size,
      });
    },
    [clearBackpackHandFallback, ensureCardInHand],
  );

  const scheduleHandDeliveryGuard = useCallback(
    (card: GameCardData) => {
      if (typeof window === 'undefined') {
        return;
      }
      const snapshot = sanitizeCardMetadata(card);
      const guards = pendingHandDeliveryGuardsRef.current;
      const existing = guards.get(snapshot.id);
      if (existing && existing.timeoutId !== null) {
        window.clearTimeout(existing.timeoutId);
      }
      const timeoutId = window.setTimeout(() => {
        guards.delete(snapshot.id);
        setHandCards(prev => {
          if (prev.some(existingCard => existingCard.id === snapshot.id)) {
            return prev;
          }
          logBackpackDraw('hand-guard-reinsert', {
            cardId: snapshot.id,
            name: snapshot.name,
          });
          return [...prev, snapshot];
        });
      }, HAND_DELIVERY_GUARD_DELAY);
      guards.set(snapshot.id, { card: snapshot, timeoutId });
      logBackpackDraw('hand-guard-scheduled', {
        cardId: snapshot.id,
        delay: HAND_DELIVERY_GUARD_DELAY,
        pending: guards.size,
      });
    },
    [setHandCards],
  );

  const queueCardIntoHand = (card: GameCardData) => {
    scheduleHandDeliveryGuard(card);
    const animated = triggerBackpackHandFlight(card);
    logBackpackDraw('queue-card', {
      cardId: card.id,
      name: card.name,
      animated,
    });
    if (!animated) {
      ensureCardInHand(card);
      return;
    }
    scheduleBackpackHandFallback(card);
  };

  useEffect(() => {
    if (pendingHandDeliveryGuardsRef.current.size === 0) {
      return;
    }
    const guards = pendingHandDeliveryGuardsRef.current;
    handCards.forEach(card => {
      const pending = guards.get(card.id);
      if (!pending) {
        return;
      }
      if (pending.timeoutId !== null && typeof window !== 'undefined') {
        window.clearTimeout(pending.timeoutId);
      }
      guards.delete(card.id);
      logBackpackDraw('hand-guard-confirm', { cardId: card.id });
    });
  }, [handCards]);

  useEffect(() => {
    return () => {
      clearAllHandDeliveryGuards();
    };
  }, [clearAllHandDeliveryGuards]);

  const consumeClassCardFromHand = useCallback((cardId: string) => {
    setClassCardsInHand(prev => prev.filter(card => card.id !== cardId));
  }, []);

  const findDeathWardCard = useCallback(
    (): { card: GameCardData; source: 'hand' | 'backpack' } | null => {
      const fromHand = handCards.find(
        candidate => (candidate as KnightCardData | undefined)?.knightEffect === 'death-ward',
      );
      if (fromHand) {
        return { card: fromHand, source: 'hand' };
      }
      const fromBackpack = backpackItems.find(
        candidate => (candidate as KnightCardData | undefined)?.knightEffect === 'death-ward',
      );
      if (fromBackpack) {
        return { card: fromBackpack, source: 'backpack' };
      }
      return null;
    },
    [backpackItems, handCards],
  );

  useEffect(() => {
    if (activeMonsterReward || monsterRewardQueue.length === 0) {
      return;
    }
    setActiveMonsterReward(monsterRewardQueue[0]);
    setMonsterRewardQueue(prev => prev.slice(1));
  }, [activeMonsterReward, monsterRewardQueue]);
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
    if (!graveyardDiscoverState) {
      graveyardDiscoverDeliveryRef.current = 'backpack';
      if (graveyardDiscoverResolverRef.current) {
        graveyardDiscoverResolverRef.current(null);
        graveyardDiscoverResolverRef.current = null;
      }
    }
  }, [graveyardDiscoverState]);

  const clearBerserkTurnBuff = useCallback(() => {
    setBerserkTurnBuff(createEmptyEquipmentBuffState());
  }, []);

  const addBerserkTurnBuff = useCallback((amount: number) => {
    if (!amount) {
      return;
    }
    setBerserkTurnBuff(prev => ({
      equipmentSlot1: (prev.equipmentSlot1 ?? 0) + amount,
      equipmentSlot2: (prev.equipmentSlot2 ?? 0) + amount,
    }));
  }, []);

  const grantExtraAttackCharges = useCallback((amount: number) => {
    if (amount <= 0) {
      return;
    }
    setExtraAttackCharges(prev => prev + amount);
  }, []);

  const consumeExtraAttackCharge = useCallback(() => {
    setExtraAttackCharges(prev => Math.max(0, prev - 1));
  }, []);

  const resetHeroSkillForNewWave = useCallback(() => {
    setHeroSkillUsedThisWave(false);
    setExtraSkillsUsedThisWave(new Set());
    setPendingHeroSkillAction(null);
    setPendingHeroMagicAction(null);
    setHeroSkillBanner(null);
    setPendingMagicAction(null);
    setPendingPotionAction(null);
    clearAllBackpackHandFallbacks();
    setHeroMagicState(prev => {
      const next = { ...prev };
      HERO_MAGIC_IDS.forEach(id => {
        const current = next[id];
        next[id] = current
          ? { ...current, usedThisWave: false }
          : {
              id,
              unlocked: false,
              gauge: 0,
              usedThisWave: false,
            };
      });
      return next;
    });
    setBerserkerRageActive(false);
    setBerserkerSlotUsed({});
    setUnbreakableUntilWaterfall({ equipmentSlot1: false, equipmentSlot2: false });
  }, [clearAllBackpackHandFallbacks]);

  useEffect(() => {
    setTurnDamageTaken(0);
    clearBerserkTurnBuff();
    setExtraAttackCharges(0);
  }, [turnCount, clearBerserkTurnBuff]);

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
      let padding = Math.max(16, Math.min(38, width * 0.019));
      if (isFlat) {
        padding = Math.max(4, Math.min(12, width * 0.008));
      }
      const border = Math.max(isFlat ? 1.5 : 2.5, padding * 0.32);
      const ring = Math.max(isFlat ? 2 : 4, padding * 0.5);
      const shadow = Math.max(isFlat ? 10 : 24, padding * (isFlat ? 2 : 3.5));
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
  }, [isFlat]);
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
  const isCombatPanelVisible = combatState.engagedMonsterIds.length > 0;
  const clampCombatPanelPosition = useCallback(
    (x: number, y: number, size?: { width: number; height: number }) => {
      const width = size?.width || combatPanelSize.width || COMBAT_PANEL_DEFAULT_WIDTH;
      const height = size?.height || combatPanelSize.height || COMBAT_PANEL_DEFAULT_HEIGHT;
      const maxX = Math.max(COMBAT_PANEL_EDGE_PADDING, gameViewport.width - width - COMBAT_PANEL_EDGE_PADDING);
      const maxY = Math.max(COMBAT_PANEL_EDGE_PADDING, gameViewport.height - height - COMBAT_PANEL_EDGE_PADDING);
      return {
        x: Math.min(Math.max(COMBAT_PANEL_EDGE_PADDING, x), maxX),
        y: Math.min(Math.max(COMBAT_PANEL_EDGE_PADDING, y), maxY),
      };
    },
    [combatPanelSize.height, combatPanelSize.width, gameViewport.width, gameViewport.height],
  );
  const computeDefaultCombatPanelPosition = useCallback(() => {
    const vpWidth = gameViewport.width;
    const vpHeight = gameViewport.height;
    const width = combatPanelSize.width || COMBAT_PANEL_DEFAULT_WIDTH;
    const height = combatPanelSize.height || COMBAT_PANEL_DEFAULT_HEIGHT;
    const undoBottom = 16;
    const undoButtonHeight = 44;
    const gap = 8;
    const top = vpHeight - undoBottom - undoButtonHeight - gap - height;
    const left = vpWidth - width - 16;
    return clampCombatPanelPosition(left, top, { width, height });
  }, [clampCombatPanelPosition, combatPanelSize.height, combatPanelSize.width, gameViewport.width, gameViewport.height]);
  const teardownCombatPanelDrag = useCallback(() => {
    if (typeof window !== 'undefined' && combatPanelWindowListenersRef.current) {
      window.removeEventListener('pointermove', combatPanelWindowListenersRef.current.move);
      window.removeEventListener('pointerup', combatPanelWindowListenersRef.current.up);
      window.removeEventListener('pointercancel', combatPanelWindowListenersRef.current.up);
    }
    combatPanelWindowListenersRef.current = null;
    combatPanelDragSessionRef.current = null;
    setIsCombatPanelDragging(false);
  }, []);
  useEffect(() => {
    return () => {
      teardownCombatPanelDrag();
    };
  }, [teardownCombatPanelDrag]);
  useEffect(() => {
    if (!isCombatPanelVisible) {
      teardownCombatPanelDrag();
      setIsCombatPanelMinimized(true);
    }
  }, [isCombatPanelVisible, teardownCombatPanelDrag]);
  useLayoutEffect(() => {
    if (!isCombatPanelVisible) {
      return;
    }
    setCombatPanelPosition(prev => {
      if (prev) {
        return prev;
      }
      const next = computeDefaultCombatPanelPosition();
      return next ?? prev;
    });
  }, [computeDefaultCombatPanelPosition, isCombatPanelVisible]);
  useLayoutEffect(() => {
    if (!isCombatPanelVisible) {
      return;
    }
    const target = combatPanelWrapperRef.current;
    if (!target) {
      return;
    }
    const updateSize = () => {
      const rect = target.getBoundingClientRect();
      setCombatPanelSize(prev => {
        if (Math.abs(prev.width - rect.width) < 0.5 && Math.abs(prev.height - rect.height) < 0.5) {
          return prev;
        }
        return { width: rect.width, height: rect.height };
      });
    };
    updateSize();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      setCombatPanelSize(prev => {
        if (Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5) {
          return prev;
        }
        return { width, height };
      });
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [isCombatPanelVisible, isCombatPanelMinimized]);
  useEffect(() => {
    if (!isCombatPanelVisible) {
      return;
    }
    setCombatPanelPosition(prev => {
      if (!prev) {
        return prev;
      }
      const clamped = clampCombatPanelPosition(prev.x, prev.y);
      if (Math.abs(clamped.x - prev.x) < 0.5 && Math.abs(clamped.y - prev.y) < 0.5) {
        return prev;
      }
      return clamped;
    });
  }, [clampCombatPanelPosition, combatPanelSize.height, combatPanelSize.width, isCombatPanelVisible]);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleResize = () => {
      if (!isCombatPanelVisible) {
        return;
      }
      setCombatPanelPosition(prev => {
        if (!prev || !combatPanelHasCustomPositionRef.current) {
          return computeDefaultCombatPanelPosition() ?? prev;
        }
        const clamped = clampCombatPanelPosition(prev.x, prev.y);
        if (Math.abs(clamped.x - prev.x) < 0.5 && Math.abs(clamped.y - prev.y) < 0.5) {
          return prev;
        }
        return clamped;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampCombatPanelPosition, computeDefaultCombatPanelPosition, isCombatPanelVisible]);
  const handleCombatPanelPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isCombatPanelVisible) {
        return;
      }
      if (event.button !== 0 && event.pointerType !== 'touch') {
        return;
      }
      if (combatPanelDragSessionRef.current) {
        return;
      }
      const resolvedPosition = combatPanelPosition ?? computeDefaultCombatPanelPosition();
      if (!resolvedPosition) {
        return;
      }
      if (!combatPanelPosition) {
        setCombatPanelPosition(resolvedPosition);
      }
      event.preventDefault();
      event.stopPropagation();
      const session = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: resolvedPosition.x,
        originY: resolvedPosition.y,
      };
      combatPanelDragSessionRef.current = session;
      combatPanelHasCustomPositionRef.current = true;
      setIsCombatPanelDragging(true);
      const handlePointerMove = (nativeEvent: PointerEvent) => {
        if (!combatPanelDragSessionRef.current || nativeEvent.pointerId !== session.pointerId) {
          return;
        }
        nativeEvent.preventDefault();
        const deltaX = nativeEvent.clientX - session.startX;
        const deltaY = nativeEvent.clientY - session.startY;
        const nextPosition = clampCombatPanelPosition(session.originX + deltaX, session.originY + deltaY);
        setCombatPanelPosition(prev => {
          if (prev && Math.abs(prev.x - nextPosition.x) < 0.5 && Math.abs(prev.y - nextPosition.y) < 0.5) {
            return prev;
          }
          return nextPosition;
        });
      };
      const handlePointerUp = (nativeEvent: PointerEvent) => {
        if (!combatPanelDragSessionRef.current || nativeEvent.pointerId !== session.pointerId) {
          return;
        }
        nativeEvent.preventDefault();
        teardownCombatPanelDrag();
      };
      combatPanelWindowListenersRef.current = {
        move: handlePointerMove,
        up: handlePointerUp,
      };
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [
      clampCombatPanelPosition,
      combatPanelPosition,
      computeDefaultCombatPanelPosition,
      isCombatPanelVisible,
      teardownCombatPanelDrag,
    ],
  );
  const combatPanelStyle = useMemo<CSSProperties>(() => {
    const scaledMin = Math.round(135 * stageScale);
    const scaledMax = Math.round(170 * stageScale);
    const style: CSSProperties & Record<`--${string}`, string> = {
        '--combat-panel-width': `clamp(${scaledMin}px, ${11 * stageScale}vw, ${scaledMax}px)`,
        width: 'min(var(--combat-panel-width), calc(100% - 1.5rem))',
    };
    if (combatPanelPosition) {
      style.left = `${combatPanelPosition.x}px`;
      style.top = `${combatPanelPosition.y}px`;
    }
    return style;
  }, [combatPanelPosition, stageScale]);
  const combatPanelWrapperClassName = useMemo(
    () =>
      [
        fullBoardInteractionLocked ? 'pointer-events-none' : 'pointer-events-auto',
        'absolute z-40 combat-panel-wrapper',
        isCombatPanelDragging ? 'combat-panel-wrapper--dragging' : '',
        combatPanelPosition ? '' : COMBAT_PANEL_DEFAULT_POSITION_CLASS,
      ]
        .filter(Boolean)
        .join(' '),
    [combatPanelPosition, isCombatPanelDragging, fullBoardInteractionLocked],
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

  const getRepairableEquipmentSlots = useCallback(
    (allowedTypes: EquipmentRepairTarget[] = ['weapon', 'shield', 'monster']): EquipmentSlotId[] => {
      const slots: EquipmentSlotId[] = [];
      (['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]).forEach(slotId => {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          return;
        }
        if (!allowedTypes.includes(slotItem.type)) {
          return;
        }
        const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
        if (maxDurability <= 0) {
          return;
        }
        const currentDurability = slotItem.durability ?? maxDurability;
        if (currentDurability < maxDurability) {
          slots.push(slotId);
        }
      });
      return slots;
    },
    [equipmentSlot1, equipmentSlot2],
  );

  const createMonsterRewardOptionId = () => `monster-reward-${Math.random().toString(36).slice(2)}`;

  const generateMonsterRewardOptions = (monster: GameCardData): MonsterRewardOption[] => {
    const isElite = Boolean(monster.monsterSpecial);
    const options: MonsterRewardOption[] = [];
    const usedKeys = new Set<string>();
    const pushOption = (option?: MonsterRewardOption | null) => {
      if (!option) {
        return;
      }
      const key = `${option.effect.type}-${option.detail ?? option.title}`;
      if (usedKeys.has(key)) {
        return;
      }
      usedKeys.add(key);
      options.push(option);
    };

    const createSlotBonusOption = (): MonsterRewardOption => {
      const slotId = Math.random() < 0.5 ? 'equipmentSlot1' : 'equipmentSlot2';
      const bonusType: keyof SlotPermanentBonus = Math.random() < 0.5 ? 'damage' : 'shield';
      const amount = 1;
      const slotLabel = describeSlotLabel(slotId);
      const statLabel = describeBonusLabel(bonusType);
      return {
        id: createMonsterRewardOptionId(),
        title: `${slotLabel} +${amount} ${statLabel}`,
        description: '永久强化该装备槽位的基础属性。',
        detail: '持久增益',
        effect: { type: 'slotBonus', slotId, bonusType, amount },
      };
    };

    const createGoldOption = (): MonsterRewardOption => {
      const amount = getRandomInt(5, 8);
      return {
        id: createMonsterRewardOptionId(),
        title: `获得 ${amount} 金币`,
        description: '拾取战场上散落的金币。',
        detail: '即时奖励',
        effect: { type: 'gold', amount },
      };
    };

    const createHealOption = (): MonsterRewardOption | null => {
      if (hp >= maxHp) {
        return null;
      }
      const amount = getRandomInt(2, 4);
      return {
        id: createMonsterRewardOptionId(),
        title: `回复 ${amount} 点生命`,
        description: '抚平战斗中留下的伤痕。',
        detail: '即时治疗',
        effect: { type: 'heal', amount },
      };
    };

    const createRepairOption = (): MonsterRewardOption | null => {
      if (!getRepairableEquipmentSlots().length) {
        return null;
      }
      return {
        id: createMonsterRewardOptionId(),
        title: '修复 1 点耐久',
        description: '选择一件武器或护盾，恢复 1 点耐久值。',
        detail: '装备保养',
        effect: { type: 'repair', amount: 1, targets: ['weapon', 'shield', 'monster'] },
      };
    };

    const createDrawOption = (): MonsterRewardOption | null => {
      const handTotal = handCards.length + backpackHandFlights.length;
      if (backpackItems.length === 0 || handTotal >= effectiveHandLimit) {
        return null;
      }
      const amount = 1;
      return {
        id: createMonsterRewardOptionId(),
        title: '从背包抽 1 张牌',
        description: '快速检索背包里的资源。',
        detail: '资源调度',
        effect: { type: 'drawBackpack', amount },
      };
    };

    const createDiscoverOption = (): MonsterRewardOption | null => {
      if (!isElite) return null;
      if (classDeck.length === 0 || backpackItems.length >= backpackCapacity) {
        return null;
      }
      return {
        id: createMonsterRewardOptionId(),
        title: '发现一张专属牌',
        description: '从职业卡牌中挑选新的战术手段。',
        detail: '精英掉落',
        effect: { type: 'discoverClass' },
      };
    };

    const createGraveyardDiscoverOption = (): MonsterRewardOption | null => {
      if (!isElite) return null;
      if (discardedCards.length === 0 || backpackItems.length >= backpackCapacity) {
        return null;
      }
      return {
        id: createMonsterRewardOptionId(),
        title: '发现一张坟场牌',
        description: '从坟场中挑选一张卡牌放入背包。',
        detail: '精英掉落',
        effect: { type: 'discoverGraveyard' },
      };
    };

    const createMaxHpOption = (): MonsterRewardOption => {
      const amount = Math.random() < 0.5 ? 2 : 3;
      return {
        id: createMonsterRewardOptionId(),
        title: `最大生命 +${amount}`,
        description: '淬炼体魄，扩张体能上限。',
        detail: '永久增益',
        effect: { type: 'maxHp', amount },
      };
    };

    const createBackpackCapacityOption = (): MonsterRewardOption => {
      return {
        id: createMonsterRewardOptionId(),
        title: '背包上限 +1',
        description: '扩展背包空间，容纳更多物资。',
        detail: '永久增益',
        effect: { type: 'backpackCapacity', amount: 1 },
      };
    };

    const createSpellDamageOption = (): MonsterRewardOption => {
      return {
        id: createMonsterRewardOptionId(),
        title: '法术伤害 +1',
        description: '聚焦奥术，让法术造成更多伤害。',
        detail: '永久增益',
        effect: { type: 'spellDamage', amount: 1 },
      };
    };

    pushOption(createSlotBonusOption());
    pushOption(createSlotBonusOption());
    pushOption(createGoldOption());
    pushOption(createHealOption());
    pushOption(createRepairOption());
    pushOption(createDrawOption());
    pushOption(createDiscoverOption());
    pushOption(createGraveyardDiscoverOption());
    pushOption(createMaxHpOption());
    if (Math.random() < 0.3) {
      pushOption(createSpellDamageOption());
    }
    if (Math.random() < 0.15) {
      pushOption(createBackpackCapacityOption());
    }

    const pool = [...options];
    const selected: MonsterRewardOption[] = [];
    while (selected.length < 2 && pool.length > 0) {
      const index = Math.floor(Math.random() * pool.length);
      const [option] = pool.splice(index, 1);
      if (option) {
        selected.push(option);
      }
    }
    while (selected.length < 2) {
      selected.push(createGoldOption());
    }
    return selected;
  };

  const getMonsterRewardsPreview = useCallback(
    (monster: GameCardData): MonsterRewardOption[] => {
      const cached = monsterRewardPreviewCacheRef.current[monster.id];
      if (cached) {
        return cached;
      }
      const generated = generateMonsterRewardOptions(monster);
      monsterRewardPreviewCacheRef.current = {
        ...monsterRewardPreviewCacheRef.current,
        [monster.id]: generated,
      };
      return generated;
    },
    [generateMonsterRewardOptions],
  );

  const forgetMonsterRewardsPreview = useCallback((monsterId: string) => {
    if (!monsterRewardPreviewCacheRef.current[monsterId]) {
      return;
    }
    const next = { ...monsterRewardPreviewCacheRef.current };
    delete next[monsterId];
    monsterRewardPreviewCacheRef.current = next;
  }, []);

  const handleCardClick = useCallback(
    (card: GameCardData) => {
      if (fullBoardInteractionLockedRef.current) return;
      setSelectedCard(card);
      if (card.type === 'monster') {
        const preview = getMonsterRewardsPreview(card);
        setSelectedMonsterRewards(preview);
      } else {
        setSelectedMonsterRewards(null);
      }
      setDetailsModalOpen(true);
    },
    [getMonsterRewardsPreview],
  );

  const handleDetailsModalChange = useCallback((open: boolean) => {
    setDetailsModalOpen(open);
    if (!open) {
      setSelectedMonsterRewards(null);
    }
  }, []);

  /**
   * 单次伤害可连续击穿多层：每层先扣光当前 hp，再掉一层并回满（含 attack+ 流血叠攻）。
   * 溢出伤害继续穿透下一层，直到伤害耗尽、怪物死亡或达到 maxLayerLoss 上限。
   */
  const damageMonsterWithLayerOverflow = (
    monster: GameCardData,
    damage: number,
    maxLayerLoss?: number,
  ): GameCardData => {
    if (damage <= 0) {
      return monster;
    }
    if (!monster.maxHp || monster.hp == null) {
      return {
        ...monster,
        hp: Math.max(0, (monster.hp || monster.value) - damage),
        value: Math.max(0, (monster.hp || monster.value) - damage),
      };
    }

    const startLayer = monster.currentLayer ?? monster.hpLayers ?? monster.fury ?? 1;
    let m = monster;
    let d = damage;

    while (d > 0) {
      const layers = m.currentLayer ?? m.hpLayers ?? m.fury ?? 1;
      const hpNow = m.hp ?? 0;
      if (layers <= 0 || hpNow <= 0) {
        break;
      }

      if (maxLayerLoss != null && startLayer - layers >= maxLayerLoss) {
        return {
          ...m,
          hp: Math.max(0, hpNow - d),
        };
      }

      if (d < hpNow) {
        return {
          ...m,
          hp: hpNow - d,
        };
      }

      d -= hpNow;
      const layerBefore = layers;
      const newLayer = layerBefore - 1;

      let attackBoost = 0;
      if (m.bleedEffect?.startsWith('attack+') && newLayer > 0) {
        const perLayer = parseInt(m.bleedEffect.replace('attack+', ''), 10) || 0;
        attackBoost = perLayer;
      }

      const maxHp = m.maxHp ?? hpNow;
      m = {
        ...m,
        currentLayer: newLayer,
        hp: newLayer > 0 ? maxHp : 0,
        attack: (m.attack ?? m.value) + attackBoost,
        value: m.value + attackBoost,
        specialAttackBoost: (m.specialAttackBoost ?? 0) + attackBoost,
      };
    }

    return m;
  };

  /** 本次伤害是否恰好打掉 1 个血层（含击杀最后一层）。 */
  const chaosStrikeRemovedExactlyOneLayer = (monster: GameCardData, rawDamage: number): boolean => {
    if (rawDamage <= 0) return false;
    if (!monster.maxHp || monster.hp == null) return false;
    const layersBefore = monster.currentLayer ?? monster.hpLayers ?? monster.fury ?? 1;
    const preview = damageMonsterWithLayerOverflow(monster, rawDamage);
    const layersAfter = preview.currentLayer ?? 0;
    return layersBefore - layersAfter === 1;
  };

  const checkHollowSkeletonRestore = async (
    monsterId: string,
    monsterName: string,
    layersBefore: number,
    layersAfter: number,
    force?: boolean,
  ) => {
    if (!force && (layersAfter <= 0 || layersAfter >= layersBefore)) return;
    const result = await requestDiceOutcome({
      title: monsterName,
      subtitle: '虚骨再生',
      entries: [
        { id: 'restore', range: [1, 10] as [number, number], label: '恢复 1 层血层', effect: 'none' },
        { id: 'fail', range: [11, 20] as [number, number], label: '再生失败', effect: 'none' },
      ],
    });
    if (result?.id === 'restore') {
      updateMonsterCard(monsterId, card => ({
        ...card,
        currentLayer: (card.currentLayer ?? 0) + 1,
        hp: card.maxHp ?? card.hp ?? 0,
      }));
      addGameLog('combat', `${monsterName} 的虚骨再生了一层！`);
      setHeroSkillBanner(`${monsterName} 恢复了 1 层血层！`);
    } else {
      addGameLog('combat', `${monsterName} 的再生尝试失败。`);
    }
  };

  const checkWraithRebirth = async (
    monsterId: string,
    monsterName: string,
    monsterFury: number,
    layersBefore: number,
    layersAfter: number,
  ) => {
    if (layersAfter !== 1 || layersBefore <= 1) return;
    const result = await requestDiceOutcome({
      title: monsterName,
      subtitle: '幽魂重生',
      entries: [
        { id: 'rebirth', range: [1, 10] as [number, number], label: '血层全部回满！', effect: 'none' },
        { id: 'fail', range: [11, 20] as [number, number], label: '重生失败', effect: 'none' },
      ],
    });
    if (result?.id === 'rebirth') {
      updateMonsterCard(monsterId, card => ({
        ...card,
        currentLayer: monsterFury,
        hp: card.maxHp ?? card.hp ?? 0,
      }));
      addGameLog('combat', `${monsterName} 的幽魂之力爆发，血层全部回满！`);
      setHeroSkillBanner(`${monsterName} 血层全部回满了！`);
    } else {
      addGameLog('combat', `${monsterName} 的重生尝试失败。`);
    }
  };

  const dealDamageToMonster = (
    monster: GameCardData,
    damage: number,
    options?: { animationDelay?: number; pulses?: number },
  ) => {
    if (damage <= 0) {
      return;
    }

    const layersBefore = monster.currentLayer ?? monster.fury ?? 1;
    const updatedMonster = damageMonsterWithLayerOverflow(monster, damage);
    const baseDelay = options?.animationDelay ?? 0;
    const pulses = Math.max(1, options?.pulses ?? 1);
    for (let i = 0; i < pulses; i += 1) {
      triggerMonsterBleedAnimation(monster.id, baseDelay + i * Math.floor(COMBAT_ANIMATION_STAGGER / 2));
    }

    // Boss retaliation: direct damage to hero per hit (ignores shields)
    if (monster.bossRetaliationDamage && monster.bossRetaliationDamage > 0) {
      const retDmg = monster.bossRetaliationDamage;
      setHp(prev => {
        const newHp = Math.max(0, prev - retDmg);
        if (newHp === 0) {
          addGameLog('system', '英雄阵亡，游戏结束');
          setGameOver(true);
          setVictory(false);
        }
        return newHp;
      });
      addHeroMagicGauge('holy-light', 1);
      addGameLog('combat', `${monster.name} 反噬：造成 ${retDmg} 点直接伤害！`);
    }

    const monsterDefeated =
      (updatedMonster.currentLayer ?? 0) <= 0 || (updatedMonster.hp ?? 0) <= 0;
    if (monsterDefeated) {
      handleMonsterDefeated(monster);
    } else {
      updateMonsterCard(monster.id, () => updatedMonster);
      const layersAfter = updatedMonster.currentLayer ?? 0;
      if (layersAfter < layersBefore) {
        heroTurnLayerLossIdsRef.current.add(monster.id);
      }
      if (monster.bleedEffect && layersAfter < layersBefore) {
        const newAttack = updatedMonster.attack ?? updatedMonster.value;
        const perLayer = parseInt((monster.bleedEffect ?? '').replace('attack+', ''), 10) || 0;
        addGameLog('combat', `${monster.name} 触发流血：攻击力+${perLayer * (layersBefore - layersAfter)}，当前 ${newAttack}！`);
        setHeroSkillBanner(`${monster.name} 流血！攻击力升至 ${newAttack}！`);
      }
      if (monster.dragonBleedDestroy && layersAfter < layersBefore && layersAfter > 0) {
        dragonBleedDestroyEquipment(monster.name, layersAfter);
      }
      if (monster.monsterSpecial === 'bone-regen') {
        void checkHollowSkeletonRestore(monster.id, monster.name, layersBefore, layersAfter);
      }
      if (monster.monsterSpecial === 'wraith-rebirth') {
        void checkWraithRebirth(monster.id, monster.name, monster.fury ?? monster.hpLayers ?? 1, layersBefore, layersAfter);
      }
    }
  };

  type ShieldReflectOutcome = {
    shouldApplyBossRetaliation: boolean;
    bossRetaliationDamage: number;
    bossName: string;
  };

  const applyBossRetaliationDamage = (monsterName: string, retDmg: number) => {
    if (retDmg <= 0) return;
    setHp(prev => {
      const newHp = Math.max(0, prev - retDmg);
      if (newHp === 0) {
        addGameLog('system', '英雄阵亡，游戏结束');
        setGameOver(true);
        setVictory(false);
      }
      return newHp;
    });
    addHeroMagicGauge('holy-light', 1);
    addGameLog('combat', `${monsterName} 反噬：造成 ${retDmg} 点直接伤害！`);
  };

  /** 护盾反弹结算（不含格挡/反弹/反噬前置动画；仅受装备栏永久伤害加成，不受法术伤害加成） */
  const applyShieldReflectDamage = (
    monsterSnapshot: GameCardData,
    baseReflectDamage: number,
    sourceName: string,
  ): ShieldReflectOutcome => {
    const noop: ShieldReflectOutcome = {
      shouldApplyBossRetaliation: false,
      bossRetaliationDamage: 0,
      bossName: monsterSnapshot.name,
    };
    if (baseReflectDamage <= 0 || pendingDefeatIdsRef.current.has(monsterSnapshot.id)) {
      return noop;
    }
    const scaledDamage = Math.max(0, baseReflectDamage);

    let hpBeforeReflect = 0;
    let defeatedByReflect = false;
    let layersBeforeReflect = 0;
    let layersAfterReflect = 0;
    let damagedSnapshot: GameCardData | null = null;

    updateMonsterCard(monsterSnapshot.id, card => {
      if ((card.currentLayer ?? 0) <= 0 || (card.hp ?? 0) <= 0) {
        return card;
      }
      hpBeforeReflect = card.hp ?? 0;
      layersBeforeReflect = card.currentLayer ?? card.fury ?? 1;
      const damaged = damageMonsterWithLayerOverflow(card, scaledDamage);
      layersAfterReflect = damaged.currentLayer ?? 0;
      damagedSnapshot = damaged;
      if ((damaged.currentLayer ?? 0) <= 0 || (damaged.hp ?? 0) <= 0) {
        defeatedByReflect = true;
      }
      return damaged;
    });

    addGameLog('combat', `${sourceName} 反弹了 ${scaledDamage} 点伤害给 ${monsterSnapshot.name}`);

    const baseDelay = 0;
    const pulses = Math.max(1, Math.min(4, 1 + (layersBeforeReflect - layersAfterReflect)));
    for (let i = 0; i < pulses; i += 1) {
      triggerMonsterBleedAnimation(monsterSnapshot.id, baseDelay + i * Math.floor(COMBAT_ANIMATION_STAGGER / 2));
    }

    const retDmg = monsterSnapshot.bossRetaliationDamage ?? 0;
    const hpAfterReflect =
      damagedSnapshot == null ? hpBeforeReflect : (damagedSnapshot as GameCardData).hp ?? 0;
    const dealtReflect =
      defeatedByReflect ||
      layersAfterReflect < layersBeforeReflect ||
      hpAfterReflect !== hpBeforeReflect;
    const shouldApplyBossRetaliation =
      !defeatedByReflect && retDmg > 0 && dealtReflect && Boolean(monsterSnapshot.bossRetaliationDamage);

    if (defeatedByReflect) {
      handleMonsterDefeated(monsterSnapshot);
      return {
        shouldApplyBossRetaliation: false,
        bossRetaliationDamage: retDmg,
        bossName: monsterSnapshot.name,
      };
    }

    if (layersAfterReflect < layersBeforeReflect && damagedSnapshot != null) {
      const afterReflectCard: GameCardData = damagedSnapshot;
      if (monsterSnapshot.bleedEffect) {
        const newAttack = afterReflectCard.attack ?? afterReflectCard.value ?? 0;
        const perLayer = parseInt((monsterSnapshot.bleedEffect ?? '').replace('attack+', ''), 10) || 0;
        addGameLog(
          'combat',
          `${monsterSnapshot.name} 触发流血：攻击力+${perLayer * (layersBeforeReflect - layersAfterReflect)}，当前 ${newAttack}！`,
        );
        setHeroSkillBanner(`${monsterSnapshot.name} 流血！攻击力升至 ${newAttack}！`);
      }
      if (monsterSnapshot.dragonBleedDestroy && layersAfterReflect > 0) {
        dragonBleedDestroyEquipment(monsterSnapshot.name, layersAfterReflect);
      }
      if (monsterSnapshot.monsterSpecial === 'bone-regen') {
        void checkHollowSkeletonRestore(
          monsterSnapshot.id,
          monsterSnapshot.name,
          layersBeforeReflect,
          layersAfterReflect,
        );
      }
      if (monsterSnapshot.monsterSpecial === 'wraith-rebirth') {
        void checkWraithRebirth(
          monsterSnapshot.id,
          monsterSnapshot.name,
          monsterSnapshot.fury ?? monsterSnapshot.hpLayers ?? 1,
          layersBeforeReflect,
          layersAfterReflect,
        );
      }
    }

    return {
      shouldApplyBossRetaliation,
      bossRetaliationDamage: retDmg,
      bossName: monsterSnapshot.name,
    };
  };

  const applyDiscardShockHit = useCallback(
    (flight: DiscardShockFlight) => {
      const row = activeCardsLatestRef.current;
      const monster = flattenActiveRowSlots(row).find(
        (c): c is GameCardData =>
          Boolean(c && c.type === 'monster' && c.id === flight.targetMonsterId),
      );
      if (!monster) {
        return;
      }
      if (flight.damage > 0 && !engagedMonsterIdsRef.current.includes(monster.id)) {
        beginCombatRef.current(monster, 'hero');
      }
      undoStackRef.current = [];
      setUndoCount(0);
      clearUndoStorage();
      addGameLog('amulet', `弃牌雷击对 ${monster.name} 造成 ${flight.damage} 点伤害`);
      dealDamageToMonster(monster, flight.damage, { pulses: flight.pulses });
      if (flight.showBanner) {
        setHeroSkillBanner(`${monster.name} 被弃牌雷击击中，受到 ${flight.damage} 点伤害。`);
      }
    },
    [addGameLog, clearUndoStorage, dealDamageToMonster, setHeroSkillBanner],
  );
  applyDiscardShockHitRef.current = applyDiscardShockHit;

  const syncDiscardShockInteractionLock = useCallback(() => {
    const busy =
      discardShockProcQueueRef.current.length > 0 ||
      discardShockSeqInFlightRef.current ||
      discardShockFlightsRef.current.length > 0;
    setDiscardShockInteractionLocked(busy);
  }, []);

  const syncDiscardShockInteractionLockRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    syncDiscardShockInteractionLockRef.current = syncDiscardShockInteractionLock;
  }, [syncDiscardShockInteractionLock]);

  const updateDiscardShockFlightAnimation = useCallback(
    (timestamp: number) => {
      const flights = discardShockFlightsRef.current;
      if (!flights.length) {
        discardShockFlightAnimationRef.current = null;
        syncDiscardShockInteractionLockRef.current();
        return;
      }

      let hasActive = false;
      const toHit: DiscardShockFlight[] = [];
      let hasCompleted = false;
      const projectileSize = DISCARD_SHOCK_PROJECTILE_SIZE;

      for (let i = 0; i < flights.length; i++) {
        const flight = flights[i];
        const elapsed = timestamp - flight.startTime;
        let progress: number;
        if (elapsed < 0) {
          hasActive = true;
          progress = 0;
        } else {
          progress = clamp(elapsed / flight.duration);
        }
        flight.progress = progress;
        if (progress < 1) {
          hasActive = true;
          if (!flight.delivered && progress >= 0.88) {
            toHit.push(flight);
            flight.delivered = true;
          }
        } else {
          if (!flight.delivered) {
            toHit.push(flight);
            flight.delivered = true;
          }
          hasCompleted = true;
        }

        const el = discardShockElementMapRef.current.get(flight.id);
        if (el) {
          const eased = easeInOutCubic(clamp(progress));
          const x = flight.start.x + (flight.end.x - flight.start.x) * eased;
          const linearY = flight.start.y + (flight.end.y - flight.start.y) * eased;
          const arcOffset = Math.sin(Math.PI * eased) * flight.arcHeight;
          const y = linearY - arcOffset;
          const scale = 0.78 + eased * 0.35;
          const fadeIn = eased < 0.08 ? clamp(eased / 0.08) : 1;
          const fadeOut = eased > 0.88 ? clamp(1 - (eased - 0.88) / 0.12) : 1;
          el.style.transform = `translate(${x - projectileSize / 2}px, ${y - projectileSize / 2}px) scale(${scale})`;
          el.style.opacity = String(fadeIn * fadeOut);
        }
      }

      toHit.forEach(f => applyDiscardShockHit(f));

      if (hasCompleted) {
        const prevLen = flights.length;
        const remaining = flights.filter(f => f.progress < 1);
        discardShockFlightsRef.current = remaining;
        setDiscardShockFlights(remaining);
        if (remaining.length < prevLen) {
          discardShockSeqInFlightRef.current = false;
          queueMicrotask(() => {
            flushDiscardShockQueueRef.current();
            syncDiscardShockInteractionLockRef.current();
          });
        }
      }

      if (hasActive && discardShockFlightsRef.current.length > 0) {
        discardShockFlightAnimationRef.current = window.requestAnimationFrame(updateDiscardShockFlightAnimation);
      } else {
        discardShockFlightAnimationRef.current = null;
        syncDiscardShockInteractionLockRef.current();
      }
    },
    [applyDiscardShockHit],
  );

  const startDiscardShockFlightAnimation = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (discardShockFlightAnimationRef.current !== null) return;
    discardShockFlightAnimationRef.current = window.requestAnimationFrame(updateDiscardShockFlightAnimation);
  }, [updateDiscardShockFlightAnimation]);

  const tryStartDiscardShockFlight = useCallback(
    (targetMonsterId: string, damage: number, pulses: number, showBanner: boolean): boolean => {
      if (typeof window === 'undefined') return false;
      const surfaceEl = gameSurfaceRef.current;
      const amuletCell = heroRowCellRefs.current[HERO_ROW_AMULET_INDEX];
      const monsterCell = monsterCellRefs.current[targetMonsterId];
      if (!surfaceEl || !amuletCell || !monsterCell) {
        return false;
      }
      const surfaceRect = surfaceEl.getBoundingClientRect();
      const amuletRect = amuletCell.getBoundingClientRect();
      const monsterRect = monsterCell.getBoundingClientRect();
      const baseTime = performance.now();
      const start: Point = {
        x:
          amuletRect.left +
          amuletRect.width / 2 -
          surfaceRect.left +
          (Math.random() - 0.5) * 10,
        y:
          amuletRect.top +
          amuletRect.height / 2 -
          surfaceRect.top +
          (Math.random() - 0.5) * 8,
      };
      const end: Point = {
        x:
          monsterRect.left +
          monsterRect.width / 2 -
          surfaceRect.left +
          (Math.random() - 0.5) * 14,
        y:
          monsterRect.top +
          monsterRect.height / 2 -
          surfaceRect.top +
          (Math.random() - 0.5) * 14,
      };
      const zapAmulet = amuletSlots.find(a => a.amuletEffect === 'discard-zap');
      const flight: DiscardShockFlight = {
        id: `discard-shock-${targetMonsterId}-${baseTime}`,
        targetMonsterId,
        start,
        end,
        startTime: baseTime,
        duration: animSpeed(DISCARD_SHOCK_FLIGHT_BASE_DURATION + Math.random() * DISCARD_SHOCK_FLIGHT_VARIANCE),
        progress: 0,
        arcHeight: DISCARD_SHOCK_ARC_MIN + Math.random() * DISCARD_SHOCK_ARC_VARIANCE,
        damage,
        pulses,
        projectileImage: zapAmulet?.image,
        showBanner,
      };
      discardShockFlightsRef.current = [...discardShockFlightsRef.current, flight];
      setDiscardShockFlights(discardShockFlightsRef.current);
      startDiscardShockFlightAnimation();
      return true;
    },
    [amuletSlots, startDiscardShockFlightAnimation],
  );

  const updateDirectedCombatFxFlightAnimation = useCallback((timestamp: number) => {
    const flights = directedCombatFxFlightsRef.current;
    if (!flights.length) {
      directedCombatFxFlightAnimationRef.current = null;
      return;
    }
    for (let i = 0; i < flights.length; i++) {
      const flight = flights[i];
      const elapsed = timestamp - flight.startTime;
      const progress = elapsed < 0 ? 0 : clamp(elapsed / flight.duration);
      flight.progress = progress;
      const projectileSize =
        flight.kind === 'shield-reflect'
          ? DIRECTED_REFLECT_PROJECTILE_SIZE
          : DIRECTED_RETALIATION_PROJECTILE_SIZE;
      const el = directedCombatFxElementMapRef.current.get(flight.id);
      if (el) {
        const eased = easeInOutCubic(clamp(progress));
        const x = flight.start.x + (flight.end.x - flight.start.x) * eased;
        const linearY = flight.start.y + (flight.end.y - flight.start.y) * eased;
        const arcOffset = Math.sin(Math.PI * eased) * flight.arcHeight;
        const y = linearY - arcOffset;
        const scale = 0.78 + eased * 0.35;
        const fadeIn = eased < 0.08 ? clamp(eased / 0.08) : 1;
        const fadeOut = eased > 0.88 ? clamp(1 - (eased - 0.88) / 0.12) : 1;
        el.style.transform = `translate(${x - projectileSize / 2}px, ${y - projectileSize / 2}px) scale(${scale})`;
        el.style.opacity = String(fadeIn * fadeOut);
      }
    }
    const remaining = flights.filter(f => f.progress < 1);
    if (remaining.length !== flights.length) {
      directedCombatFxFlightsRef.current = remaining;
      setDirectedCombatFxFlights(remaining);
    }
    if (remaining.length > 0) {
      directedCombatFxFlightAnimationRef.current = window.requestAnimationFrame(updateDirectedCombatFxFlightAnimation);
    } else {
      directedCombatFxFlightAnimationRef.current = null;
    }
  }, []);

  const startDirectedCombatFxFlightAnimation = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (directedCombatFxFlightAnimationRef.current !== null) return;
    directedCombatFxFlightAnimationRef.current = window.requestAnimationFrame(updateDirectedCombatFxFlightAnimation);
  }, [updateDirectedCombatFxFlightAnimation]);

  const tryStartShieldReflectDirectedFx = useCallback(
    (slotId: EquipmentSlotId, monsterId: string): boolean => {
      if (typeof window === 'undefined') return false;
      const surfaceEl = gameSurfaceRef.current;
      const equipIdx =
        slotId === 'equipmentSlot1' ? HERO_ROW_EQUIPMENT_1_INDEX : HERO_ROW_EQUIPMENT_2_INDEX;
      const equipCell = heroRowCellRefs.current[equipIdx];
      const monsterCell = monsterCellRefs.current[monsterId];
      if (!surfaceEl || !equipCell || !monsterCell) {
        return false;
      }
      const surfaceRect = surfaceEl.getBoundingClientRect();
      const startRect = equipCell.getBoundingClientRect();
      const endRect = monsterCell.getBoundingClientRect();
      const baseTime = performance.now();
      const start: Point = {
        x: startRect.left + startRect.width / 2 - surfaceRect.left + (Math.random() - 0.5) * 8,
        y: startRect.top + startRect.height / 2 - surfaceRect.top + (Math.random() - 0.5) * 8,
      };
      const end: Point = {
        x: endRect.left + endRect.width / 2 - surfaceRect.left + (Math.random() - 0.5) * 12,
        y: endRect.top + endRect.height / 2 - surfaceRect.top + (Math.random() - 0.5) * 12,
      };
      const flight: DirectedCombatFxFlight = {
        id: `shield-reflect-${monsterId}-${baseTime}`,
        kind: 'shield-reflect',
        start,
        end,
        startTime: baseTime,
        duration: animSpeed(Math.max(380, SHIELD_REFLECT_ANIM_MS - 80 + Math.random() * 60)),
        progress: 0,
        arcHeight: 32 + Math.random() * 48,
      };
      directedCombatFxFlightsRef.current = [...directedCombatFxFlightsRef.current, flight];
      setDirectedCombatFxFlights(directedCombatFxFlightsRef.current);
      startDirectedCombatFxFlightAnimation();
      return true;
    },
    [startDirectedCombatFxFlightAnimation],
  );

  const tryStartBossRetaliationDirectedFx = useCallback(
    (monsterId: string): boolean => {
      if (typeof window === 'undefined') return false;
      const surfaceEl = gameSurfaceRef.current;
      const monsterCell = monsterCellRefs.current[monsterId];
      const heroCell = heroRowCellRefs.current[HERO_ROW_HERO_INDEX];
      if (!surfaceEl || !monsterCell || !heroCell) {
        return false;
      }
      const surfaceRect = surfaceEl.getBoundingClientRect();
      const startRect = monsterCell.getBoundingClientRect();
      const endRect = heroCell.getBoundingClientRect();
      const baseTime = performance.now();
      const start: Point = {
        x: startRect.left + startRect.width / 2 - surfaceRect.left + (Math.random() - 0.5) * 10,
        y: startRect.top + startRect.height / 2 - surfaceRect.top + (Math.random() - 0.5) * 10,
      };
      const end: Point = {
        x: endRect.left + endRect.width / 2 - surfaceRect.left + (Math.random() - 0.5) * 10,
        y: endRect.top + endRect.height / 2 - surfaceRect.top + (Math.random() - 0.5) * 10,
      };
      const flight: DirectedCombatFxFlight = {
        id: `boss-retaliation-${monsterId}-${baseTime}`,
        kind: 'boss-retaliation',
        start,
        end,
        startTime: baseTime,
        duration: animSpeed(Math.max(360, BOSS_RETALIATION_ANIM_MS - 80 + Math.random() * 50)),
        progress: 0,
        arcHeight: 36 + Math.random() * 52,
      };
      directedCombatFxFlightsRef.current = [...directedCombatFxFlightsRef.current, flight];
      setDirectedCombatFxFlights(directedCombatFxFlightsRef.current);
      startDirectedCombatFxFlightAnimation();
      return true;
    },
    [startDirectedCombatFxFlightAnimation],
  );

  const runShieldReflectBossRetaliationSequence = async (
    m: GameCardData,
    rawReflectDmg: number,
    sourceName: string,
    slotId: EquipmentSlotId,
  ) => {
    if (rawReflectDmg <= 0) return;
    await new Promise<void>(r => setTimeout(r, animSpeed(COMBAT_BLOCK_TO_REFLECT_MS)));
    tryStartShieldReflectDirectedFx(slotId, m.id);
    await new Promise<void>(r => setTimeout(r, animSpeed(SHIELD_REFLECT_ANIM_MS)));
    const outcome = applyShieldReflectDamage(m, rawReflectDmg, sourceName);
    if (outcome.shouldApplyBossRetaliation && outcome.bossRetaliationDamage > 0) {
      tryStartBossRetaliationDirectedFx(m.id);
      await new Promise<void>(r => setTimeout(r, animSpeed(BOSS_RETALIATION_ANIM_MS)));
      applyBossRetaliationDamage(outcome.bossName, outcome.bossRetaliationDamage);
    }
  };

  const flushDiscardShockQueue = useCallback(() => {
    const bumpLock = () => {
      syncDiscardShockInteractionLockRef.current();
    };
    if (discardShockSeqInFlightRef.current) {
      bumpLock();
      return;
    }
    const queue = discardShockProcQueueRef.current;
    if (queue.length === 0) {
      bumpLock();
      return;
    }

    if (!amuletSlotsRef.current.some(s => s?.amuletEffect === 'discard-zap')) {
      discardShockProcQueueRef.current = [];
      bumpLock();
      return;
    }
    const monsters = flattenActiveRowSlots(activeCardsLatestRef.current).filter(
      (c): c is GameCardData => Boolean(c && c.type === 'monster'),
    );
    if (monsters.length === 0) {
      discardShockProcQueueRef.current = [];
      bumpLock();
      return;
    }

    const { showBanner } = queue.shift()!;
    const target = monsters[Math.floor(Math.random() * monsters.length)];
    const dmg = Math.max(0, 1 + permanentSpellDamageBonus);

    discardShockSeqInFlightRef.current = true;
    const started = tryStartDiscardShockFlight(target.id, dmg, 2, showBanner);
    if (!started) {
      discardShockSeqInFlightRef.current = false;
      undoStackRef.current = [];
      setUndoCount(0);
      clearUndoStorage();
      if (dmg > 0 && !engagedMonsterIdsRef.current.includes(target.id)) {
        beginCombatRef.current(target, 'hero');
      }
      addGameLog('amulet', `弃牌雷击对 ${target.name} 造成 ${dmg} 点伤害`);
      dealDamageToMonster(target, dmg, { pulses: 2 });
      if (showBanner) {
        setHeroSkillBanner(`${target.name} 被弃牌雷击击中，受到 ${dmg} 点伤害。`);
      }
      queueMicrotask(() => {
        flushDiscardShockQueueRef.current();
        syncDiscardShockInteractionLockRef.current();
      });
    } else {
      bumpLock();
    }
  }, [
    addGameLog,
    clearUndoStorage,
    dealDamageToMonster,
    permanentSpellDamageBonus,
    setHeroSkillBanner,
    setUndoCount,
    tryStartDiscardShockFlight,
  ]);

  useLayoutEffect(() => {
    flushDiscardShockQueueRef.current = flushDiscardShockQueue;
  }, [flushDiscardShockQueue]);

  const dragonBleedDestroyEquipment = (monsterName: string, remainingLayers: number) => {
    const destroySlot = (slotId: 'equipmentSlot1' | 'equipmentSlot2', item: EquipmentItem | null) => {
      if (!item) return false;
      const dur = item.durability ?? 0;
      if (dur > remainingLayers) {
        if (slotId === 'equipmentSlot1') setEquipmentSlot1(null);
        else setEquipmentSlot2(null);
        disposeOwnedEquipmentCard(item as GameCardData, { isDestruction: true });
        addGameLog('combat', `${monsterName} 流血破甲：破坏了「${item.name}」（耐久 ${dur} > 血层 ${remainingLayers}）！`);
        return true;
      }
      return false;
    };
    const d1 = destroySlot('equipmentSlot1', equipmentSlot1);
    const d2 = destroySlot('equipmentSlot2', equipmentSlot2);
    if (d1 || d2) {
      setHeroSkillBanner(`${monsterName} 流血破甲！高耐久装备被破坏！`);
    }
  };

  const triggerDiscardShock = useCallback(() => {
    if (!amuletSlotsRef.current.some(s => s?.amuletEffect === 'discard-zap')) {
      return;
    }
    const monsters = flattenActiveRowSlots(activeCardsLatestRef.current).filter(
      (c): c is GameCardData => Boolean(c && c.type === 'monster'),
    );
    if (monsters.length === 0) {
      return;
    }
    const showBanner =
      !pendingHeroSkillAction && !pendingMagicAction && !pendingPotionAction;
    discardShockProcQueueRef.current.push({ showBanner });
    flushDiscardShockQueueRef.current();
    syncDiscardShockInteractionLockRef.current();
  }, [pendingHeroSkillAction, pendingMagicAction, pendingPotionAction]);

  const syncMonsterRewardQueuedInstanceIdsRef = useCallback(
    (queue: MonsterRewardDrop[], active: MonsterRewardDrop | null) => {
      const next = new Set<string>();
      (queue ?? []).forEach(d => {
        if (d.monsterInstanceId) next.add(d.monsterInstanceId);
      });
      if (active?.monsterInstanceId) next.add(active.monsterInstanceId);
      monsterRewardQueuedInstanceIdsRef.current = next;
    },
    [],
  );

  const queueMonsterReward = useCallback(
    (monster: GameCardData) => {
      const options = getMonsterRewardsPreview(monster);
      if (!options.length) {
        return;
      }
      const mid = monster.id;
      if (mid && monsterRewardQueuedInstanceIdsRef.current.has(mid)) {
        return;
      }
      if (mid) {
        monsterRewardQueuedInstanceIdsRef.current.add(mid);
      }
      setMonsterRewardQueue(prev => [
        ...prev,
        {
          monsterInstanceId: mid,
          monsterName: monster.name ?? '神秘怪物',
          options,
        },
      ]);
    },
    [getMonsterRewardsPreview],
  );

  const getActiveCombatMonster = (): GameCardData | null => {
    const engaged = getEngagedMonsterCards();
    return engaged.length > 0 ? engaged[0] : null;
  };

  const finishCombat = () => {
    addGameLog('combat', '战斗结束');
    setCombatState(initialCombatState);
    setBerserkerSlotUsed({});
  };

  const executeLastWords = async (monster: GameCardData) => {
    const effect = monster.lastWords;
    if (!effect) return;

    if (effect === 'discard-hand-3') {
      undoStackRef.current = [];
      setUndoCount(0);
      clearUndoStorage();
      const currentHand = handCardsRef.current;
      const discardCount = Math.min(3, currentHand.length);
      if (discardCount <= 0) {
        addGameLog('combat', `${monster.name} 的遗言：随机弃置手牌，但玩家没有手牌。`);
        return;
      }
      const indices = Array.from({ length: currentHand.length }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      const toDiscard = indices.slice(0, discardCount).map(i => currentHand[i]);
      const flights = toDiscard.map(dc => ({
        card: dc,
        promise: triggerDiscardFlight(dc, isRecyclableFromHand(dc) && dc.type !== 'amulet' ? 'recycle-bag' : 'graveyard'),
      }));
      const discardIds = new Set(toDiscard.map(c => c.id));
      handCardsRef.current = handCardsRef.current.filter(c => !discardIds.has(c.id));
      setHandCards(handCardsRef.current);
      await Promise.all(flights.map(f => f.promise));
      flights.forEach(f => discardCardToGraveyard(f.card, { owner: 'player' }));
      const names = toDiscard.map(c => c.name);
      addGameLog('combat', `${monster.name} 的遗言：随机弃置了 ${discardCount} 张手牌（${names.join('、')}）`);
      setHeroSkillBanner(`${monster.name} 的遗言：弃置了 ${names.join('、')}！`);
    }

    if (effect.startsWith('wraith-haunt-')) {
      undoStackRef.current = [];
      setUndoCount(0);
      clearUndoStorage();
      const atkBoost = parseInt(effect.replace('wraith-haunt-', ''), 10) || 2;
      setActiveCards(prev => {
        const otherMonsters: string[] = [];
        const occupiedIndices: number[] = [];
        const occupiedCards: (GameCardData | null)[] = [];

        for (let i = 0; i < prev.length; i++) {
          const c = prev[i];
          if (!c || c.id === monster.id) continue;
          occupiedIndices.push(i);
          occupiedCards.push(c);
          if (c.type === 'monster') {
            otherMonsters.push(c.name);
          }
        }

        if (occupiedIndices.length === 0) return prev;

        const fisherYatesShuffle = <T,>(arr: T[]): T[] => {
          const a = [...arr];
          for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
          }
          return a;
        };
        let shuffled = fisherYatesShuffle(occupiedCards);
        if (occupiedCards.length >= 2) {
          const isSameOrder = shuffled.every((c, i) => c === occupiedCards[i]);
          if (isSameOrder) shuffled = fisherYatesShuffle(occupiedCards);
        }
        const next = [...prev] as (GameCardData | null)[];
        for (let i = 0; i < occupiedIndices.length; i++) {
          let card = shuffled[i];
          if (card && card.type === 'monster') {
            card = {
              ...card,
              attack: (card.attack ?? card.value) + atkBoost,
              specialAttackBoost: (card.specialAttackBoost ?? 0) + atkBoost,
            };
          }
          next[occupiedIndices[i]] = card;
        }
        return next as typeof prev;
      });

      const parts: string[] = [];
      const otherMons = activeCards.filter(c => c && c.id !== monster.id && c.type === 'monster');
      if (otherMons.length > 0) {
        parts.push(`同行怪物攻击力 +${atkBoost}`);
      }
      parts.push('同行卡牌位置打乱');
      addGameLog('combat', `${monster.name} 的遗言：${parts.join('，')}！`);
      setHeroSkillBanner(`${monster.name} 的遗言：${parts.join('，')}！`);
    }
  };

  const handleMonsterDefeated = (monster: GameCardData) => {
    if (pendingDefeatIdsRef.current.has(monster.id)) return;

    // Final monster transforms into boss on first defeat
    if (monster.isFinalMonster && !monster.bossPhase) {
      const fullHp = monster.maxHp ?? monster.hp ?? monster.value ?? 0;
      const layers = monster.fury ?? monster.hpLayers ?? 2;
      const bossCard: GameCardData = {
        ...monster,
        bossPhase: true,
        currentLayer: layers,
        hp: fullHp,
        hasRevive: true,
        reviveUsed: false,
        bossRetaliationDamage: 3,
        bossLastStandAura: true,
        bossFuryDiceChance: true,
        description: [
          '反噬：每次受到伤害，对英雄造成 3 点直接伤害（无视护盾）',
          '复生：首次被击杀后以 1 血层复活',
          '暴走光环：血层为 1 时，每个怪物回合结束 +5 攻击，恢复 1 血层',
          '韧性：攻击后 50% 概率不掉血层（掷骰判定）',
        ].join('\n'),
      };
      if (monster.lastWords) {
        executeLastWords(monster);
      }
      updateMonsterCard(monster.id, () => bossCard);
      setCombatState(prev => {
        const remaining = prev.engagedMonsterIds.filter(id => id !== monster.id);
        if (remaining.length === 0) return { ...initialCombatState };
        return { ...prev, engagedMonsterIds: remaining };
      });
      triggerEventTransform(monster, bossCard, 'Boss 降临！');
      addGameLog('combat', `${monster.name} 变身为 Boss！`);
      setHeroSkillBanner(`${monster.name} 暴走变身！`);
      return;
    }

    if (monster.hasRevive && !monster.reviveUsed) {
      if (monster.lastWords) {
        executeLastWords(monster);
      }
      const fullHp = monster.maxHp ?? monster.hp ?? monster.value ?? 0;
      const activateNoLayerCost = !!monster.skeletonNoLayerCost;
      updateMonsterCard(monster.id, card => ({
        ...card,
        currentLayer: 1,
        hp: fullHp,
        reviveUsed: true,
        ...(activateNoLayerCost ? { skeletonNoLayerCostActive: true } : {}),
      }));
      addGameLog('combat', `${monster.name} 触发了复生，以 1 血层重新站了起来！`);
      if (activateNoLayerCost) {
        addGameLog('combat', `${monster.name} 不朽之骨：复生后攻击不再消耗血层！`);
      }
      setHeroSkillBanner(`${monster.name} 复生了！`);
      return;
    }

    pendingDefeatIdsRef.current.add(monster.id);

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

    setMonsterDefeatStates(prev => ({ ...prev, [monster.id]: true }));
    addGameLog('combat', `${monster.name} 被击败！`);

    if (selectedHeroSkillRef.current === 'summon-minion') {
      const buffMinion = (card: GameCardData): GameCardData => ({
        ...card,
        attack: (card.attack ?? card.value) + 1,
        value: (card.attack ?? card.value) + 1,
        hp: (card.hp ?? 1) + 1,
        maxHp: (card.maxHp ?? card.hp ?? 1) + 1,
      });
      let found = false;
      setBackpackItems(prev => {
        const idx = prev.findIndex(c => c.isMinionCard);
        if (idx === -1) return prev;
        found = true;
        const updated = [...prev];
        updated[idx] = buffMinion(updated[idx]);
        return updated;
      });
      if (!found) {
        setHandCards(prev => {
          const idx = prev.findIndex(c => c.isMinionCard);
          if (idx === -1) return prev;
          found = true;
          const updated = [...prev];
          updated[idx] = buffMinion(updated[idx]);
          return updated;
        });
      }
      if (!found) {
        setEquipmentSlot1(prev => {
          if (prev && (prev as GameCardData).isMinionCard) {
            found = true;
            return { ...buffMinion(prev as GameCardData), type: 'monster' as const } as EquipmentItem;
          }
          return prev;
        });
      }
      if (!found) {
        setEquipmentSlot2(prev => {
          if (prev && (prev as GameCardData).isMinionCard) {
            found = true;
            return { ...buffMinion(prev as GameCardData), type: 'monster' as const } as EquipmentItem;
          }
          return prev;
        });
      }
      if (!found) {
        const buffReserve = (prev: EquipmentItem[]) => {
          const idx = prev.findIndex(c => (c as GameCardData).isMinionCard);
          if (idx === -1) return prev;
          found = true;
          const updated = [...prev];
          updated[idx] = { ...buffMinion(updated[idx]), type: 'monster' as const } as EquipmentItem;
          return updated;
        };
        setEquipmentSlot1Reserve(buffReserve);
        if (!found) setEquipmentSlot2Reserve(buffReserve);
      }
      if (found) {
        addGameLog('skill', '随从成长：攻击 +1、防御 +1');
      }
    }

    if (monster.lastWords) {
      executeLastWords(monster);
    }

    if (monster.wraithDeathHeal && monster.wraithDeathHeal > 0) {
      const healAmount = monster.wraithDeathHeal;
      setActiveCards(prev => {
        const buffedNames: string[] = [];
        const next = prev.map(c => {
          if (!c || c.id === monster.id || c.type !== 'monster') return c;
          const newHp = Math.min((c.hp ?? 0) + healAmount, (c.maxHp ?? c.hp ?? 0) + healAmount);
          const newMaxHp = Math.max(c.maxHp ?? 0, newHp);
          buffedNames.push(c.name);
          return { ...c, hp: newHp, maxHp: newMaxHp };
        }) as ActiveRowSlots;
        if (buffedNames.length > 0) {
          addGameLog('combat', `${monster.name} 怨灵祝福：${buffedNames.join('、')} 生命值 +${healAmount}！`);
          setHeroSkillBanner(`${monster.name} 怨灵祝福！同行怪物生命 +${healAmount}！`);
        }
        return next;
      });
    }

    const latestMonster = activeCards.find(c => c?.id === monster.id) ?? monster;
    const shouldFlipGoblin =
      latestMonster.monsterType === 'Goblin' &&
      !latestMonster.goblinHasStolen &&
      !goblinStolenIdsRef.current.has(monster.id) &&
      Boolean(latestMonster.goblinTrickCarrier);

    setTimeout(() => {
      pendingDefeatIdsRef.current.delete(monster.id);
      goblinStolenIdsRef.current.delete(monster.id);
      setMonsterDefeatStates(prev => {
        const next = { ...prev };
        delete next[monster.id];
        return next;
      });
      setMonstersDefeated(prev => prev + 1);
      removeCard(monster.id, false);

      if (shouldFlipGoblin) {
        const goblinMagic: GameCardData = {
          id: `goblin-trick-${Date.now()}`,
          type: 'magic',
          name: '哥布林的戏法',
          value: 0,
          image: goblinImage,
          magicType: 'permanent',
          magicEffect: '永久魔法：将所有其他手牌洗入回收袋，然后从背包抽取等量的牌。',
          description: '使用后将手中所有其他牌（包括非永久牌）洗入回收袋，再从背包随机抽取相同数量的新牌。回收袋中的牌将在下次瀑流时回到背包。',
        };
        triggerEventTransform(monster, goblinMagic, '哥布林的秘密！');
        addCardToBackpack(goblinMagic);
        addGameLog('combat', `${monster.name} 没偷到金币，死后留下了「哥布林的戏法」！`);
        setHeroSkillBanner(`${monster.name} 留下了隐藏的「哥布林的戏法」！`);
      }
      addToGraveyard(monster);
      queueMonsterReward(monster);
      setSelectedMonsterRewards(prev => (selectedCard?.id === monster.id ? null : prev));
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
    }, animSpeed(DEFEAT_ANIMATION_DURATION));
  };

  const updateMonsterCard = (monsterId: string, updater: (monster: GameCardData) => GameCardData) => {
    setActiveCards(prev =>
      prev.map(card => (card?.id === monsterId ? updater(card) : card))
    );
  };

  const decrementMonsterFury = (monster: GameCardData) => {
    if (monster.skeletonNoLayerCostActive) {
      addGameLog('combat', `${monster.name} 不朽之骨：攻击不消耗血层！`);
      return;
    }
    const currentLayer = monster.currentLayer ?? monster.hpLayers ?? monster.fury ?? 1;
    const nextLayer = currentLayer - 1;

    if (nextLayer <= 0) {
      handleMonsterDefeated(monster);
      if (!pendingDefeatIdsRef.current.has(monster.id) && monster.monsterSpecial === 'bone-regen') {
        void checkHollowSkeletonRestore(monster.id, monster.name, currentLayer, nextLayer, true);
      }
      return;
    }

    if (monster.bleedEffect?.startsWith('attack+')) {
      const perLayer = parseInt(monster.bleedEffect.replace('attack+', ''), 10) || 0;
      const newAttack = (monster.attack ?? monster.value) + perLayer;
      const newValue = monster.value + perLayer;
      const newBoost = (monster.specialAttackBoost ?? 0) + perLayer;
      updateMonsterCard(monster.id, (card) => ({
        ...card,
        currentLayer: nextLayer,
        hp: card.maxHp,
        attack: newAttack,
        value: newValue,
        specialAttackBoost: newBoost,
      }));
      addGameLog('combat', `${monster.name} 触发流血：攻击力+${perLayer}，当前 ${newAttack}！`);
      setHeroSkillBanner(`${monster.name} 流血！攻击力升至 ${newAttack}！`);
    } else {
      updateMonsterCard(monster.id, (card) => ({
        ...card,
        currentLayer: nextLayer,
        hp: card.maxHp,
      }));
    }

    if (monster.monsterSpecial === 'bone-regen') {
      void checkHollowSkeletonRestore(monster.id, monster.name, currentLayer, nextLayer);
    }
    if (monster.monsterSpecial === 'wraith-rebirth') {
      void checkWraithRebirth(monster.id, monster.name, monster.fury ?? monster.hpLayers ?? 1, currentLayer, nextLayer);
    }
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
    addGameLog('combat', `与 ${monster.name} 进入战斗（HP: ${monster.hp ?? monster.value}${(monster.currentLayer ?? 1) > 1 ? ` ×${monster.currentLayer}层` : ''}）`);
    setCombatState(prev => {
      // Filter out dying/dead monsters whose defeat animation is still playing.
      // Without this, stale IDs cause beginCombat to treat a fresh engagement as
      // "adding to existing combat", skipping the heroAttacksThisTurn reset.
      const liveEngagedIds = prev.engagedMonsterIds.filter(
        id => !pendingDefeatIdsRef.current.has(id),
      );
      const alreadyEngaged = liveEngagedIds.includes(monster.id);
      const nextEngaged = alreadyEngaged ? liveEngagedIds : [...liveEngagedIds, monster.id];

      if (liveEngagedIds.length === 0) {
        if (initiator === 'monster') {
          return {
            ...prev,
            engagedMonsterIds: nextEngaged,
            initiator,
            currentTurn: 'monster',
            heroAttacksThisTurn: {
              equipmentSlot1: false,
              equipmentSlot2: false,
            },
            heroAttacksRemaining: 2,
            heroDamageThisTurn: {},
            monsterAttackQueue: [],
            pendingBlock: {
              monsterId: monster.id,
              attackValue: monster.attack ?? monster.value,
              monsterName: monster.name,
            },
          };
        }
        return {
          ...prev,
          engagedMonsterIds: nextEngaged,
          initiator,
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
      }

      if (initiator === 'monster') {
        if (prev.currentTurn === 'hero' && !prev.pendingBlock) {
          return {
            ...prev,
            engagedMonsterIds: nextEngaged,
            currentTurn: 'monster',
            monsterAttackQueue: prev.monsterAttackQueue,
            pendingBlock: {
              monsterId: monster.id,
              attackValue: monster.attack ?? monster.value,
              monsterName: monster.name,
            },
          };
        }
        return {
          ...prev,
          engagedMonsterIds: nextEngaged,
          monsterAttackQueue: [...prev.monsterAttackQueue, monster.id],
        };
      }

      return {
        ...prev,
        engagedMonsterIds: nextEngaged,
        initiator: prev.initiator ?? initiator,
      };
    });
  };
  beginCombatRef.current = beginCombat;

  const applyHeroKillEffects = (monsterHp: number) => {
    if (vampiricNextAttack) {
      const healAmount = Math.floor(monsterHp / 2);
      if (healAmount > 0) {
        healHero(healAmount);
      }
      setVampiricNextAttack(false);
    }
  };

  const performHeroAttack = async (slotId: EquipmentSlotId, targetMonster: GameCardData) => {
    if (combatState.currentTurn !== 'hero') {
      return;
    }

    const slotAlreadyAttacked = combatState.heroAttacksThisTurn[slotId];
    const hasBaseAttack = combatState.heroAttacksRemaining > 0;
    const canUseBerserkerExtra = berserkerRageActive && slotAlreadyAttacked && !berserkerSlotUsed[slotId];
    const needsExtraCharge = slotAlreadyAttacked || !hasBaseAttack;
    if (needsExtraCharge && !canUseBerserkerExtra && extraAttackCharges <= 0) {
      return;
    }
    if (!needsExtraCharge && !hasBaseAttack) {
      return;
    }
    const usingBerserkerExtra = needsExtraCharge && canUseBerserkerExtra;
    const usingExtraCharge = needsExtraCharge && !usingBerserkerExtra && extraAttackCharges > 0;

    const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
    if (!slotItem || (slotItem.type !== 'weapon' && slotItem.type !== 'monster')) {
      return;
    }

    const isMonsterEquip = slotItem.type === 'monster';
    const weaponValue = isMonsterEquip ? (slotItem.attack ?? slotItem.value) : slotItem.value;
    const slotDamageBonus = getEquipmentSlotBonus(slotId, 'damage');
    const appliedNextBonus = nextWeaponBonus;
    const slotBurstBonus = slotAttackBursts[slotId] ?? 0;
    const discardEmpowerLifestealThisAttack = nextAttackLifestealSlot === slotId;
    const slotBerserkBonus = berserkTurnBuff[slotId] ?? 0;
    const balanceBonus = amuletEffects.hasBalance && slotId === 'equipmentSlot1' ? BALANCE_ATTACK_BONUS : 0;
    const balancePenalty = amuletEffects.hasBalance && slotId === 'equipmentSlot2' ? BALANCE_ATTACK_PENALTY : 0;
    const flashPenalty = amuletEffects.hasFlash ? FLASH_ATTACK_PENALTY : 0;
    const baseDamage = Math.max(
      0,
      weaponValue +
        attackBonus +
        slotDamageBonus +
        slotBerserkBonus +
        appliedNextBonus +
        slotBurstBonus +
        balanceBonus -
        balancePenalty -
        flashPenalty,
    );
    let isCrit = false;
    if (slotItem.critChance) {
      const threshold = Math.round((slotItem.critChance / 100) * 20);
      const critResult = await requestDiceOutcome({
        title: slotItem.name,
        subtitle: '暴击判定',
        entries: [
          { id: 'crit', range: [1, threshold] as [number, number], label: '暴击！双倍伤害！', effect: 'none' },
          { id: 'normal', range: [threshold + 1, 20] as [number, number], label: '正常攻击', effect: 'none' },
        ],
      });
      isCrit = critResult?.id === 'crit';
    }
    const finalDamage = isCrit ? baseDamage * 2 : baseDamage;
    const attackIterations = amuletEffects.hasFlash ? 2 : 1;

    addHeroMagicGauge('berserker-rage', attackIterations);

    if (appliedNextBonus > 0) {
      setNextWeaponBonus(0);
    }
    if (slotBurstBonus > 0) {
      setSlotAttackBursts(prev => ({
        ...prev,
        [slotId]: 0,
      }));
    }

    if (isCrit) {
      addGameLog('combat', `暴击！${slotItem.name} 造成双倍伤害！`);
      setHeroSkillBanner(`暴击！双倍伤害！`);
    }
    addGameLog('combat', `使用 ${slotItem.name}(${slotItem.value}攻) 攻击 ${targetMonster.name}，伤害 ${finalDamage}${attackIterations > 1 ? ` ×${attackIterations}` : ''}`);

    if (slotItem.healOnAttack) {
      const totalHeal = slotItem.healOnAttack * attackIterations;
      healHero(totalHeal);
      addGameLog('heal', `${slotItem.name} 攻击恢复了 ${totalHeal} 点生命`);
    }

    let workingMonster = targetMonster;
    let monsterDefeated = false;
    let totalRecordedDamage = 0;
    let discardEmpowerLifestealHpSum = 0;
    let overflowHealing = 0;
    let strengthHits = 0;
    const layersBeforeAttack = targetMonster.currentLayer ?? targetMonster.fury ?? 1;

    for (let i = 0; i < attackIterations; i += 1) {
      const iterationDelay = i * COMBAT_ANIMATION_STAGGER;
      triggerWeaponSwingAnimation(slotId, iterationDelay, { echoes: 2 });
      totalRecordedDamage += finalDamage;
      if (amuletEffects.hasStrength) {
        strengthHits += 1;
      }
      if (finalDamage <= 0) {
        continue;
      }

      const layerBeforeHit = workingMonster.currentLayer ?? workingMonster.fury ?? 1;
      const monsterHpBefore = workingMonster.hp ?? workingMonster.value;
      if (discardEmpowerLifestealThisAttack) {
        discardEmpowerLifestealHpSum += Math.min(finalDamage, monsterHpBefore);
      }
      const updatedMonster = damageMonsterWithLayerOverflow(workingMonster, finalDamage, 2);
      triggerMonsterBleedAnimation(targetMonster.id, iterationDelay);
      triggerMonsterBleedAnimation(
        targetMonster.id,
        iterationDelay + Math.floor(COMBAT_ANIMATION_STAGGER / 2),
      );

      // Boss retaliation: direct damage to hero per hit (ignores shields)
      if (workingMonster.bossRetaliationDamage && workingMonster.bossRetaliationDamage > 0) {
        const retDmg = workingMonster.bossRetaliationDamage;
        setHp(prev => {
          const newHp = Math.max(0, prev - retDmg);
          if (newHp === 0) {
            addGameLog('system', '英雄阵亡，游戏结束');
            setGameOver(true);
            setVictory(false);
          }
          return newHp;
        });
        addHeroMagicGauge('holy-light', 1);
        addGameLog('combat', `${targetMonster.name} 反噬：造成 ${retDmg} 点直接伤害！`);
      }

      if (amuletEffects.hasLife && !overflowHealing) {
        if (finalDamage > monsterHpBefore) {
          overflowHealing = 4;
        }
      }

      workingMonster = updatedMonster;
      const layerAfterHit = updatedMonster.currentLayer ?? 1;
      if (layerAfterHit < layerBeforeHit) {
        heroTurnLayerLossIdsRef.current.add(targetMonster.id);
      }
      const remainingLayers = layerAfterHit;

      if (remainingLayers <= 0) {
        if (targetMonster.hasRevive && !targetMonster.reviveUsed) {
          handleMonsterDefeated(targetMonster);
          workingMonster = {
            ...workingMonster,
            currentLayer: 1,
            hp: workingMonster.maxHp ?? workingMonster.hp ?? 0,
            reviveUsed: true,
            ...(targetMonster.skeletonNoLayerCost ? { skeletonNoLayerCostActive: true } : {}),
          };
        } else {
          applyHeroKillEffects(monsterHpBefore);
          handleMonsterDefeated(targetMonster);
          monsterDefeated = true;
          break;
        }
      }
    }

    if (discardEmpowerLifestealThisAttack) {
      if (discardEmpowerLifestealHpSum > 0) {
        healHero(discardEmpowerLifestealHpSum, { healLogVariant: 'discard-empower-lifesteal' });
      }
      setNextAttackLifestealSlot(null);
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
      heroAttacksRemaining:
        prev.heroAttacksRemaining > 0 ? Math.max(0, prev.heroAttacksRemaining - 1) : prev.heroAttacksRemaining,
      heroAttacksThisTurn: {
        ...prev.heroAttacksThisTurn,
        [slotId]: true,
      },
      heroDamageThisTurn: {
        ...prev.heroDamageThisTurn,
        [targetMonster.id]: (prev.heroDamageThisTurn[targetMonster.id] || 0) + totalRecordedDamage,
      },
    }));

    if (usingExtraCharge) {
      consumeExtraAttackCharge();
    }

    if (usingBerserkerExtra) {
      setBerserkerSlotUsed(prev => ({ ...prev, [slotId]: true }));
    }

    const killRestoresDurability = monsterDefeated && slotItem.restoreDurabilityOnKill && !!slotItem.maxDurability;
    if (!usingBerserkerExtra && !unbreakableUntilWaterfall[slotId] && !killRestoresDurability) {
      let skipDurabilityLoss = false;
      const saveChance = slotItem.weaponDurabilitySaveChance;
      if (saveChance && saveChance > 0 && !unbreakableNext) {
        const threshold = Math.round((saveChance / 100) * 20);
        const result = await requestDiceOutcome({
          title: slotItem.name,
          subtitle: '耐久判定',
          entries: [
            { id: 'save', range: [1, threshold] as [number, number], label: '耐久保留！', effect: 'none' },
            { id: 'lose', range: [threshold + 1, 20] as [number, number], label: '耐久 -1', effect: 'none' },
          ],
        });
        if (result?.id === 'save') {
          skipDurabilityLoss = true;
          addGameLog('equip', `${slotItem.name} 幸运地保住了耐久！`);
        }
      }

      if (!skipDurabilityLoss) {
        const weaponDurability = slotItem.durability ?? 1;
        if (weaponDurability <= 1 && !unbreakableNext) {
          addGameLog('equip', `${slotItem.name} 损坏了`);
          if (slotItem.onDestroyHeal) {
            healHero(slotItem.onDestroyHeal);
            addGameLog('equip', `${slotItem.name} 毁坏时恢复了 ${slotItem.onDestroyHeal} 点生命`);
          }
          if (slotItem.onDestroyGold) {
            setGold(prev => prev + slotItem.onDestroyGold!);
            addGameLog('equip', `${slotItem.name} 毁坏时获得了 ${slotItem.onDestroyGold} 金币`);
          }
          disposeOwnedEquipmentCard({ ...slotItem }, { isDestruction: true });
          clearEquipmentSlotWithPromote(slotId);
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
      }
    }

    const knightSlotItem = slotItem as GameCardData & { weaponBonus?: number; healOnKill?: number };
    if (knightSlotItem.weaponBonus) {
      const bonusGain = knightSlotItem.weaponBonus * attackIterations;
      setEquipmentSlotBonus(slotId, 'damage', cur => cur + bonusGain);
      addGameLog('equip', `${slotItem.name} 永久伤害 +${bonusGain}（该装备栏）`);
    }

    if (monsterDefeated && knightSlotItem.healOnKill) {
      healHero(knightSlotItem.healOnKill);
      addGameLog('heal', `${slotItem.name} 击杀回复 ${knightSlotItem.healOnKill} 点生命`);
    }

    if (monsterDefeated && slotItem.restoreDurabilityOnKill && slotItem.maxDurability) {
      setEquipmentSlotById(slotId, { ...slotItem, durability: slotItem.maxDurability });
      addGameLog('equip', `${slotItem.name} 击杀后耐久度回满！`);
      setHeroSkillBanner(`${slotItem.name} 耐久度回满！`);
    }

    if (!monsterDefeated) {
      updateMonsterCard(targetMonster.id, () => workingMonster);
      const layersAfterAttack = workingMonster.currentLayer ?? 0;
      if (layersAfterAttack < layersBeforeAttack) {
        heroTurnLayerLossIdsRef.current.add(targetMonster.id);
      }
      if (targetMonster.bleedEffect && layersAfterAttack < layersBeforeAttack) {
        const newAttack = workingMonster.attack ?? workingMonster.value;
        const perLayer = parseInt((targetMonster.bleedEffect ?? '').replace('attack+', ''), 10) || 0;
        addGameLog('combat', `${targetMonster.name} 触发流血：攻击力+${perLayer * (layersBeforeAttack - layersAfterAttack)}，当前 ${newAttack}！`);
        setHeroSkillBanner(`${targetMonster.name} 流血！攻击力升至 ${newAttack}！`);
      }
      if (targetMonster.dragonBleedDestroy && layersAfterAttack < layersBeforeAttack && layersAfterAttack > 0) {
        dragonBleedDestroyEquipment(targetMonster.name, layersAfterAttack);
      }
      if (targetMonster.monsterSpecial === 'bone-regen') {
        void checkHollowSkeletonRestore(targetMonster.id, targetMonster.name, layersBeforeAttack, layersAfterAttack);
      }
      if (targetMonster.monsterSpecial === 'wraith-rebirth') {
        void checkWraithRebirth(targetMonster.id, targetMonster.name, targetMonster.fury ?? targetMonster.hpLayers ?? 1, layersBeforeAttack, layersAfterAttack);
      }
    }
  };

  const endHeroTurn = () => {
    if (endHeroTurnGuardRef.current) return;
    pushUndoSnapshot();
    const engagedMonsters = getEngagedMonsterCards();
    if (engagedMonsters.length === 0) {
      finishCombat();
      return;
    }

    engagedMonsters.forEach(monster => {
      if (monster.eliteRegenHeroTurn && !heroTurnLayerLossIdsRef.current.has(monster.id)) {
        const currentLayer = monster.currentLayer ?? monster.fury ?? 1;
        const maxLayers = monster.fury ?? monster.hpLayers ?? 1;
        if (currentLayer < maxLayers) {
          const restoredLayer = currentLayer + 1;
          updateMonsterCard(monster.id, (card) => ({
            ...card,
            currentLayer: restoredLayer,
            hp: card.maxHp ?? monster.maxHp ?? card.hp ?? 0,
          }));
          addGameLog('combat', `${monster.name} 未受到血层伤害，恢复了一个血层！当前 ${restoredLayer} 层。`);
          setHeroSkillBanner(`${monster.name} 恢复了一个血层！`);
          return;
        }
      }
      updateMonsterCard(monster.id, (card) => {
        const fullHp = card.maxHp ?? monster.maxHp ?? card.hp ?? monster.hp ?? 0;
        return {
          ...card,
          hp: fullHp,
        };
      });
    });

    heroTurnLayerLossIdsRef.current.clear();
    setBerserkerSlotUsed({});

    const drawnCard = drawFromBackpackToHand();
    if (drawnCard) {
      addGameLog('combat', `回合结束，从背包抽取了一张牌：${drawnCard.name}。`);
    }

    const sortedMonsters = [...engagedMonsters].sort((a, b) => {
      const idxA = activeCards.findIndex(c => c?.id === a.id);
      const idxB = activeCards.findIndex(c => c?.id === b.id);
      return idxA - idxB;
    });

    setCombatState(prev => ({
      ...prev,
      currentTurn: 'monster',
      heroAttacksThisTurn: {
        equipmentSlot1: false,
        equipmentSlot2: false,
      },
      heroAttacksRemaining: 2,
      heroDamageThisTurn: {},
      monsterAttackQueue: sortedMonsters.map(monster => monster.id),
      pendingBlock: null,
    }));
  };

  const resolveBlockChoice = async (target: BlockTarget) => {
    if (!combatState.pendingBlock) {
      return;
    }
    if (fullBoardInteractionLockedRef.current) {
      return;
    }

    const epoch = combatAsyncEpochRef.current;
    const stale = () => combatAsyncEpochRef.current !== epoch;

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

    if (monster.monsterSpecial === 'ogre-crit') {
      const result = await requestDiceOutcome({
        title: monster.name,
        subtitle: '暴击判定',
        entries: [
          { id: 'crit', range: [1, 10] as [number, number], label: '双倍伤害！', effect: 'none' },
          { id: 'normal', range: [11, 20] as [number, number], label: '正常伤害', effect: 'none' },
        ],
      });
      if (result?.id === 'crit') {
        remainingDamage *= 2;
        addGameLog('combat', `${monster.name} 暴击！伤害翻倍为 ${remainingDamage}！`);
        setHeroSkillBanner(`${monster.name} 暴击了！伤害翻倍！`);
      }
    }
    if (stale()) {
      return;
    }

    addGameLog('monster', `${monster.name} 发动攻击（${remainingDamage}伤害）`);

    let blockedWithShield = false;
    let reflectDmg = 0;
    let reflectSourceName = '';
    let reflectBlockSlotId: EquipmentSlotId | null = null;
    if (target !== 'hero') {
      const blockSlotId = target as EquipmentSlotId;
      const slotItem = blockSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (slotItem && (slotItem.type === 'shield' || slotItem.type === 'monster')) {
        blockedWithShield = true;
        const knightShield = slotItem as GameCardData & { knightEffect?: string };
        const isFullBlockShield = knightShield.knightEffect === 'fullBlock';

        if (isFullBlockShield) {
          triggerShieldBlockAnimation(blockSlotId);
          addGameLog('combat', `${slotItem.name} 完全格挡了 ${remainingDamage} 点伤害！`);
          setHeroSkillBanner(`${slotItem.name} 完全格挡！`);
          remainingDamage = 0;
        } else {
          const baseArmor = slotItem.type === 'monster' ? (slotItem.hp ?? slotItem.value) : slotItem.value;
          const slotShieldBonus = getEquipmentSlotBonus(blockSlotId, 'shield');
          const balanceBonus = amuletEffects.hasBalance && blockSlotId === 'equipmentSlot2' ? BALANCE_SHIELD_BONUS : 0;
          const balanceShieldPenalty = amuletEffects.hasBalance && blockSlotId === 'equipmentSlot1' ? BALANCE_SHIELD_PENALTY : 0;
          const shieldValue = Math.max(0, baseArmor + defenseBonus + slotShieldBonus + balanceBonus - balanceShieldPenalty);
          triggerShieldBlockAnimation(blockSlotId);
          const blocked = Math.min(remainingDamage, shieldValue);
          remainingDamage = Math.max(0, remainingDamage - shieldValue);
          addGameLog('combat', `${slotItem.name} 格挡了 ${blocked} 点伤害`);
        }

        if (slotItem.reflectHalfDamage && monster) {
          reflectDmg = Math.ceil(pendingBlock.attackValue / 2);
          reflectSourceName = slotItem.name;
          reflectBlockSlotId = blockSlotId;
        } else if (slotItem.damageReflect && slotItem.damageReflect > 0 && monster) {
          const slotDamageBonus = getEquipmentSlotBonus(blockSlotId, 'damage');
          reflectDmg = slotItem.damageReflect + slotDamageBonus;
          reflectSourceName = slotItem.name;
          reflectBlockSlotId = blockSlotId;
        }

        // 铁壁塔盾等完全格挡：视为完美格挡（护甲未与攻击力逐项比较），可触发双守护圣盾与守护圣盾耐久判定
        const isPerfectBlockThisShield = isFullBlockShield || remainingDamage === 0;

        if (isPerfectBlockThisShield && amuletEffects.hasDualGuard) {
          setEquipmentSlotBonus(blockSlotId, 'shield', cur => cur + 1);
          const newBonus = getEquipmentSlotBonus(blockSlotId, 'shield') + 1;
          addGameLog('combat', `完美格挡！双守护圣盾使该栏永久护甲 +1（当前 +${newBonus}）`);
          setHeroSkillBanner(`完美格挡！该装备栏永久护甲 +1！`);
        }

        if (!unbreakableUntilWaterfall[blockSlotId]) {
          let skipShieldDurabilityLoss = false;
          const perfectBlock = isPerfectBlockThisShield;
          const saveChance = slotItem.shieldPerfectBlockSaveChance;
          if (perfectBlock && saveChance && saveChance > 0 && !unbreakableNext) {
            const threshold = Math.round((saveChance / 100) * 20);
            const result = await requestDiceOutcome({
              title: slotItem.name,
              subtitle: '完美格挡 — 耐久判定',
              entries: [
                { id: 'save', range: [1, threshold] as [number, number], label: '耐久保留！', effect: 'none' },
                { id: 'lose', range: [threshold + 1, 20] as [number, number], label: '耐久 -1', effect: 'none' },
              ],
            });
            if (result?.id === 'save') {
              skipShieldDurabilityLoss = true;
              addGameLog('equip', `${slotItem.name} 完美格挡，幸运保住了耐久！`);
            }
          }
          if (stale()) {
            return;
          }

          if (!skipShieldDurabilityLoss) {
            const shieldDurability = slotItem.durability ?? 1;
            if (shieldDurability <= 1 && !unbreakableNext) {
              addGameLog('equip', `${slotItem.name} 损坏了`);
              if (slotItem.onDestroyHeal) {
                healHero(slotItem.onDestroyHeal);
                addGameLog('equip', `${slotItem.name} 毁坏时恢复了 ${slotItem.onDestroyHeal} 点生命`);
              }
              if (slotItem.onDestroyGold) {
                setGold(prev => prev + slotItem.onDestroyGold!);
                addGameLog('equip', `${slotItem.name} 毁坏时获得了 ${slotItem.onDestroyGold} 金币`);
              }
              disposeOwnedEquipmentCard({ ...slotItem }, { isDestruction: true });
              clearEquipmentSlotWithPromote(blockSlotId);
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
      }
    }

    if (remainingDamage > 0) {
      applyDamage(remainingDamage, 'combat', { blockedWithShield });
    }

    if (monster.onAttackEffect?.startsWith('steal-gold-')) {
      const stealTarget = parseInt(monster.onAttackEffect.replace('steal-gold-', ''), 10) || 0;
      if (stealTarget > 0) {
        const actualStolen = Math.min(stealTarget, gold);
        setGold(prev => Math.max(0, prev - stealTarget));
        addGameLog('combat', `${monster.name} 动手偷走了 ${stealTarget} 金币！`);
        setHeroSkillBanner(`${monster.name} 偷走了 ${stealTarget} 金币！`);
        if (actualStolen > 0) {
          goblinStolenIdsRef.current.add(monster.id);
          updateMonsterCard(monster.id, card => ({ ...card, goblinHasStolen: true }));
        }
        if (monster.goblinStealScale && actualStolen > 0) {
          updateMonsterCard(monster.id, card => ({
            ...card,
            attack: (card.attack ?? card.value) + actualStolen,
            value: card.value + actualStolen,
            hp: (card.hp ?? 0) + actualStolen,
            maxHp: (card.maxHp ?? 0) + actualStolen,
          }));
          addGameLog('combat', `${monster.name} 贪婪强化：攻击力 +${actualStolen}，生命值 +${actualStolen}！`);
        }
      }
    }

    if (monster.eliteDoubleAttack && !pendingBlock.isFollowUpAttack) {
      const doubleResult = await requestDiceOutcome({
        title: monster.name,
        subtitle: '连击判定',
        entries: [
          { id: 'double', range: [1, 14] as [number, number], label: '再攻击一次！', effect: 'none' },
          { id: 'single', range: [15, 20] as [number, number], label: '本次仅一击', effect: 'none' },
        ],
      });
      if (stale()) {
        return;
      }
      if (doubleResult?.id === 'double') {
        addGameLog('combat', `${monster.name} 发动连击！再次攻击！`);
        setHeroSkillBanner(`${monster.name} 连击！再来一次！`);
        if (reflectDmg > 0 && reflectBlockSlotId) {
          await runShieldReflectBossRetaliationSequence(
            monster,
            reflectDmg,
            reflectSourceName,
            reflectBlockSlotId,
          );
        }
        if (stale()) {
          return;
        }
        setCombatState(prev => ({
          ...prev,
          pendingBlock: {
            monsterId: monster.id,
            attackValue: monster.attack ?? monster.value,
            monsterName: monster.name,
            isFollowUpAttack: true,
          },
        }));
        return;
      }
    }

    if (monster.bossFuryDiceChance) {
      const diceResult = await requestDiceOutcome({
        title: monster.name,
        subtitle: '韧性判定',
        entries: [
          { id: 'skip', range: [1, 10] as [number, number], label: '韧性发动，不掉血层！', effect: 'none' },
          { id: 'lose', range: [11, 20] as [number, number], label: '正常掉血层', effect: 'none' },
        ],
      });
      if (stale()) {
        return;
      }
      if (diceResult?.id === 'skip') {
        addGameLog('combat', `${monster.name} 韧性发动，本次攻击不掉血层！`);
      } else {
        decrementMonsterFury(monster);
      }
    } else {
      decrementMonsterFury(monster);
    }

    if (reflectDmg > 0 && reflectBlockSlotId && !pendingDefeatIdsRef.current.has(monster.id)) {
      await runShieldReflectBossRetaliationSequence(
        monster,
        reflectDmg,
        reflectSourceName,
        reflectBlockSlotId,
      );
    }

    if (stale()) {
      return;
    }

    setCombatState(prev => ({
      ...prev,
      pendingBlock:
        prev.pendingBlock?.monsterId === pendingBlock.monsterId
          ? null
          : prev.pendingBlock,
    }));
  };

  const effectiveHandLimit = HAND_LIMIT + handLimitBonus;
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
  const heroDetailsStats = {
    hp,
    maxHp,
    gold,
    attackBonus,
    defenseBonus,
    spellDamageBonus: permanentSpellDamageBonus,
    tempShield,
    permanentMaxHpBonus,
  };
  const monsterRewardPreviewForModal = useMemo(() => {
    if (selectedCard?.type !== 'monster' || !selectedMonsterRewards?.length) {
      return null;
    }
    return selectedMonsterRewards.map(option => ({
      id: option.id,
      title: option.title,
      description: option.description,
      detail: option.detail,
    }));
  }, [selectedCard, selectedMonsterRewards]);
  const heroDetailsSkills = useMemo(() => {
    const skills: HeroSkillDefinition[] = [];
    if (selectedHeroSkillDef) skills.push(selectedHeroSkillDef);
    for (const id of extraHeroSkills) {
      const def = getHeroSkillById(id);
      if (def) skills.push(def);
    }
    return skills;
  }, [selectedHeroSkillDef, extraHeroSkills]);
  const getSpellDamage = useCallback(
    (baseDamage: number) => Math.max(0, baseDamage + permanentSpellDamageBonus),
    [permanentSpellDamageBonus],
  );

  const triggerGraveNova = useCallback(() => {
    const monsters = flattenActiveRowSlots(activeCardsLatestRef.current).filter(
      (card): card is GameCardData => Boolean(card && card.type === 'monster'),
    );
    if (!monsters.length) {
      setHeroSkillBanner('殉烈爆鸣没有目标。');
      return;
    }
    const dmg = getSpellDamage(3);
    addGameLog('combat', `殉烈爆鸣：对 ${monsters.map(m => m.name).join('、')} 各造成 ${dmg} 点法术伤害`);
    monsters.forEach(monster => {
      dealDamageToMonster(monster, dmg, { pulses: 2 });
    });
    setHeroSkillBanner(`殉烈爆鸣释放，对所有怪物造成 ${dmg} 点伤害！`);
  }, [addGameLog, dealDamageToMonster, getSpellDamage, setHeroSkillBanner]);
  const healHero = useCallback(
    (
      baseAmount: number,
      options?: { healLogVariant?: 'default' | 'discard-empower-lifesteal' },
    ) => {
      const multiplier = amuletEffects.hasHeal ? 2 : 1;
      const adjustedAmount = Math.max(0, Math.floor(baseAmount * multiplier));
      if (adjustedAmount <= 0) {
        return 0;
      }

      const currentHp = hpRef.current;
      const actualHeal = Math.min(adjustedAmount, Math.max(0, maxHp - currentHp));
      if (actualHeal > 0) {
        hpRef.current = currentHp + actualHeal;
      }

      setHp(prev => Math.min(maxHp, prev + adjustedAmount));

      if (actualHeal > 0) {
        setHealing(true);
        setTimeout(() => setHealing(false), 1200);
        setTotalHealed(prev => prev + actualHeal);
        const healSuffix = amuletEffects.hasHeal ? '（治疗加倍）' : '';
        if (options?.healLogVariant === 'discard-empower-lifesteal') {
          addGameLog('heal', `噬血砺锋：吸血回复 ${actualHeal} 点生命${healSuffix}`);
        } else {
          addGameLog('heal', `英雄回复 ${actualHeal} 点生命${healSuffix}`);
        }

        if (selectedHeroSkillRef.current === 'heal-to-damage') {
          const prevAccum = healAccumulatorRef.current;
          const newAccum = prevAccum + actualHeal;
          const bonusGained = Math.floor(newAccum / 5) - Math.floor(prevAccum / 5);
          healAccumulatorRef.current = newAccum;
          if (bonusGained > 0) {
            setEquipmentSlotBonuses(prev => ({
              ...prev,
              equipmentSlot1: {
                ...prev.equipmentSlot1,
                damage: prev.equipmentSlot1.damage + bonusGained,
              },
              equipmentSlot2: {
                ...prev.equipmentSlot2,
                damage: prev.equipmentSlot2.damage + bonusGained,
              },
            }));
            addGameLog('skill', `愈战愈勇：本次实际治疗 ${actualHeal}（累计 ${prevAccum} → ${newAccum}），左右装备栏各永久伤害 +${bonusGained}`);
          }
        }
      }

      return actualHeal;
    },
    [amuletEffects.hasHeal, maxHp, addGameLog],
  );

  const updateHeroMagicStateById = useCallback(
    (id: HeroMagicId, updater: (state: HeroMagicRuntimeState) => HeroMagicRuntimeState) => {
      setHeroMagicState(prev => {
        const current =
          prev[id] ??
          ({
            id,
            unlocked: false,
            gauge: 0,
            usedThisWave: false,
          } as HeroMagicRuntimeState);
        const next = updater(current);
        if (
          next.unlocked === current.unlocked &&
          next.gauge === current.gauge &&
          next.usedThisWave === current.usedThisWave
        ) {
          return prev;
        }
        const updated = {
          ...prev,
          [id]: next,
        };
        logHeroMagic('state-update', { id, prev: current, next });
        return updated;
      });
    },
    [],
  );

  const unlockHeroMagic = useCallback(
    (id: HeroMagicId) => {
      updateHeroMagicStateById(id, current =>
        current.unlocked ? current : { ...current, unlocked: true, gauge: 0, usedThisWave: false },
      );
    },
    [updateHeroMagicStateById],
  );

  const addHeroMagicGauge = useCallback(
    (id: HeroMagicId, amount: number) => {
      if (amount <= 0) {
        return;
      }
      const definition = getHeroMagicDefinition(id);
      updateHeroMagicStateById(id, current => {
        if (!current.unlocked) {
          return current;
        }
        const nextGauge = Math.min(definition.gaugeMax, current.gauge + amount);
        if (nextGauge === current.gauge) {
          return current;
        }
        return { ...current, gauge: nextGauge };
      });
    },
    [updateHeroMagicStateById],
  );

  const resetHeroMagicGauge = useCallback(
    (id: HeroMagicId) => {
      updateHeroMagicStateById(id, current => {
        if (current.gauge === 0) {
          return current;
        }
        return { ...current, gauge: 0 };
      });
    },
    [updateHeroMagicStateById],
  );

  const setHeroMagicUsedThisWave = useCallback(
    (id: HeroMagicId, used: boolean) => {
      updateHeroMagicStateById(id, current => {
        if (current.usedThisWave === used) {
          return current;
        }
        return { ...current, usedThisWave: used };
      });
    },
    [updateHeroMagicStateById],
  );

  const completeHeroMagicActivation = useCallback(
    (id: HeroMagicId, origin: HeroMagicActivationOrigin) => {
      resetHeroMagicGauge(id);
      if (origin === 'gauge') {
        setHeroMagicUsedThisWave(id, true);
      }
      logHeroMagic('activation-complete', { id, origin });
    },
    [resetHeroMagicGauge, setHeroMagicUsedThisWave],
  );

  const applyBerserkerRageEffect = useCallback(
    (origin: HeroMagicActivationOrigin) => {
      setBerserkerRageActive(true);
      setBerserkerSlotUsed({});
      completeHeroMagicActivation('berserker-rage', origin);
      logHeroMagic('berserker-trigger', { origin });
      setHeroSkillBanner('狂战发动：直到下次瀑布前，每个武器栏每回合可多攻击一次，且不消耗耐久。');
    },
    [completeHeroMagicActivation, setHeroSkillBanner],
  );

  const startHeroMagicActivation = useCallback(
    (id: HeroMagicId, origin: HeroMagicActivationOrigin) => {
      if (pendingHeroMagicAction) {
        setHeroSkillBanner('请先完成当前的英雄魔法动作。');
        return false;
      }

      const status = heroMagicState[id];
      if (!status || !status.unlocked) {
        setHeroSkillBanner('尚未掌握该英雄魔法。');
        return false;
      }

      if (origin === 'gauge') {
        const definition = getHeroMagicDefinition(id);
        if (status.gauge < definition.gaugeMax) {
          setHeroSkillBanner(
            `${definition.name} 仍在充能 (${status.gauge}/${definition.gaugeMax})。`,
          );
          return false;
        }
        if (status.usedThisWave) {
          setHeroSkillBanner(`${definition.name} 已在本波使用。`);
          return false;
        }
        if (pendingHeroSkillAction || pendingMagicAction || pendingPotionAction) {
          setHeroSkillBanner('请先完成当前的操作。');
          return false;
        }
      }

      switch (id) {
        case 'holy-light':
          setPendingHeroMagicAction({
            id: 'holy-light',
            step: 'choice',
            origin,
            prompt: '选择圣光效果：回满血 或 净化一个怪物的怒气。',
          });
          setHeroSkillBanner('选择圣光效果：回满血 或 净化一个怪物的怒气。');
          return true;
        case 'berserker-rage':
          applyBerserkerRageEffect(origin);
          return true;
        default:
          return false;
      }
    },
    [
      heroMagicState,
      pendingHeroMagicAction,
      pendingHeroSkillAction,
      pendingMagicAction,
      pendingPotionAction,
      applyBerserkerRageEffect,
      setHeroSkillBanner,
      setPendingHeroMagicAction,
    ],
  );

  const resolveHolyLightChoice = useCallback(
    (choice: 'heal' | 'purge') => {
      if (!pendingHeroMagicAction || pendingHeroMagicAction.id !== 'holy-light') {
        return;
      }
      const origin = pendingHeroMagicAction.origin;

      if (choice === 'heal') {
        const healed = healHero(maxHp);
        const banner = healed > 0 ? `圣光恢复了 ${healed} 点生命。` : '生命已满，圣光充能被清空。';
        addGameLog('magic', `圣光发动（回满生命）：${banner}`);
        setHeroSkillBanner(banner);
        setPendingHeroMagicAction(null);
        completeHeroMagicActivation('holy-light', origin);
      } else {
        const monsters = flattenActiveRowSlots(activeCards).filter(c => c?.type === 'monster');
        if (monsters.length === 0) {
          addGameLog('magic', '圣光净化失败：场上没有怪物。');
          setHeroSkillBanner('场上没有怪物可以净化。');
          setPendingHeroMagicAction(null);
          completeHeroMagicActivation('holy-light', origin);
        } else if (monsters.length === 1) {
          updateMonsterCard(monsters[0].id, current => ({
            ...current,
            fury: 0,
            hpLayers: 1,
            currentLayer: 1,
            hp: current.maxHp ?? current.hp ?? current.value ?? 0,
          }));
          addGameLog('magic', `圣光发动（净化怒气）：${monsters[0].name} 的怒气被净化！`);
          setHeroSkillBanner(`${monsters[0].name} 的怒气被圣光净化！`);
          setPendingHeroMagicAction(null);
          completeHeroMagicActivation('holy-light', origin);
        } else {
          setPendingHeroMagicAction({
            id: 'holy-light',
            step: 'monster-select',
            origin,
            prompt: '选择一个怪物以净化其怒气。',
          });
          setHeroSkillBanner('选择一个怪物以净化其怒气。');
        }
      }
    },
    [
      activeCards,
      completeHeroMagicActivation,
      healHero,
      maxHp,
      pendingHeroMagicAction,
      setHeroSkillBanner,
      setPendingHeroMagicAction,
      updateMonsterCard,
    ],
  );

  const handleHolyLightMonsterCleanse = useCallback(
    (monster: GameCardData) => {
      if (!pendingHeroMagicAction || pendingHeroMagicAction.id !== 'holy-light') {
        return false;
      }
      if (pendingHeroMagicAction.step !== 'monster-select') {
        return false;
      }
      if (monster.type !== 'monster') {
        setHeroSkillBanner('请选择一个怪物。');
        return false;
      }

      updateMonsterCard(monster.id, current => ({
        ...current,
        fury: 0,
        hpLayers: 1,
        currentLayer: 1,
        hp: current.maxHp ?? current.hp ?? current.value ?? 0,
      }));
      addGameLog('magic', `圣光发动（净化怒气）：${monster.name} 的怒气被净化！`);
      setHeroSkillBanner(`${monster.name} 的怒气被圣光净化！`);
      setPendingHeroMagicAction(null);
      completeHeroMagicActivation('holy-light', pendingHeroMagicAction.origin);
      return true;
    },
    [
      addGameLog,
      completeHeroMagicActivation,
      pendingHeroMagicAction,
      setHeroSkillBanner,
      setPendingHeroMagicAction,
      updateMonsterCard,
    ],
  );
  
  const takeRandomCardsFromBackpack = (count: number): GameCardData[] => {
    if (count <= 0) {
      return [];
    }
    const source = backpackItemsRef.current;
    if (!source.length) {
      logBackpackDraw('backpack-empty-snapshot', {
        requested: count,
        pendingAutoDraws: pendingAutoDrawsRef.current,
      });
      return [];
    }
    const pool = [...source];
    const drawTotal = Math.min(count, pool.length);
    if (drawTotal <= 0) {
      return [];
    }
    const drawnCards: GameCardData[] = [];
    for (let i = 0; i < drawTotal; i += 1) {
      const randomIndex = Math.floor(Math.random() * pool.length);
      const [card] = pool.splice(randomIndex, 1);
      if (card) {
        drawnCards.push(card);
      }
    }
    backpackItemsRef.current = pool;
    const drawnIds = new Set(drawnCards.map(c => c.id));
    setBackpackItems(prev => {
      const result = prev.filter(c => !drawnIds.has(c.id));
      backpackItemsRef.current = result;
      return result;
    });
    logBackpackDraw('backpack-take', {
      requested: count,
      delivered: drawnCards.length,
      prevCount: source.length,
      nextCount: pool.length,
    });
    return drawnCards;
  };

  // Auto-draw mechanism - draw random backpack cards to hand
  const drawFromBackpackToHand = (): GameCardData | null => {
    const flightsCount = backpackHandFlightsRef.current.length;
    const availableSlots = Math.max(0, effectiveHandLimit - (handCards.length + flightsCount));
    logBackpackDraw('draw-request', {
      handSize: handCards.length,
      flights: flightsCount,
      availableSlots,
      backpackStateCount: backpackItems.length,
      backpackRefCount: backpackItemsRef.current.length,
    });
    if (availableSlots <= 0) {
      return null; // Hand full
    }

    const [drawnCard] = takeRandomCardsFromBackpack(1);
    if (!drawnCard) {
      logBackpackDraw('draw-empty');
      return null;
    }

    queueCardIntoHand(drawnCard);
    logBackpackDraw('draw-success', {
      cardId: drawnCard.id,
      name: drawnCard.name,
      remainingBackpack: backpackItemsRef.current.length,
    });
    return drawnCard;
  };

  const processPendingAutoDraws = useCallback(() => {
    if (pendingAutoDrawsRef.current <= 0) {
      return;
    }

    while (pendingAutoDrawsRef.current > 0) {
      const flightsCount = backpackHandFlightsRef.current.length;
      logBackpackDraw('auto-draw-loop', {
        pending: pendingAutoDrawsRef.current,
        handSize: handCards.length,
        flights: flightsCount,
        backpackCount: backpackItemsRef.current.length,
      });
      const availableSlots = Math.max(0, effectiveHandLimit - (handCards.length + flightsCount));
      if (availableSlots <= 0) {
        logBackpackDraw('auto-draw-blocked-hand-full', {
          pending: pendingAutoDrawsRef.current,
          handSize: handCards.length,
          flights: flightsCount,
        });
        break;
      }

      if (backpackItemsRef.current.length === 0) {
        logBackpackDraw('auto-draw-blocked-empty', {
          pending: pendingAutoDrawsRef.current,
          backpackCount: backpackItemsRef.current.length,
        });
        pendingAutoDrawsRef.current = 0;
        break;
      }

      const drawn = drawFromBackpackToHand();
      if (!drawn) {
        logBackpackDraw('auto-draw-blocked-null', {
          pending: pendingAutoDrawsRef.current,
          backpackCount: backpackItemsRef.current.length,
        });
        pendingAutoDrawsRef.current = 0;
        break;
      }

      pendingAutoDrawsRef.current -= 1;
      logBackpackDraw('auto-draw-delivered', {
        cardId: drawn.id,
        pending: pendingAutoDrawsRef.current,
        backpackCount: backpackItemsRef.current.length,
      });
    }
  }, [handCards.length]);

  useEffect(() => {
    processPendingAutoDraws();
  }, [backpackItems.length, handCards.length, processPendingAutoDraws]);

  const enqueueAutoDraw = useCallback(
    (source: 'remove-card' | 'slot-cleared' | 'backpack-store', cardId: string) => {
      const flightsCount = backpackHandFlightsRef.current.length;
      const availableSlots = Math.max(0, effectiveHandLimit - (handCards.length + flightsCount));
      if (availableSlots <= 0) {
        logBackpackDraw('auto-draw-blocked-hand-full', {
          source,
          cardId,
          pending: pendingAutoDrawsRef.current,
          handSize: handCards.length,
          flights: flightsCount,
        });
        return;
      }

      if (backpackItemsRef.current.length === 0) {
        logBackpackDraw('auto-draw-skipped-backpack-empty', {
          source,
          cardId,
          pending: pendingAutoDrawsRef.current,
        });
        return;
      }

      pendingAutoDrawsRef.current += 1;
      logBackpackDraw('auto-draw-enqueued', {
        source,
        cardId,
        pending: pendingAutoDrawsRef.current,
      });
      processPendingAutoDraws();
    },
    [handCards.length, processPendingAutoDraws],
  );

  const registerDungeonCardProcessed = useCallback(
    (cardId: string | null | undefined, source: 'remove-card' | 'slot-cleared' | 'backpack-store') => {
      if (!cardId || gameOver || victory) {
        return;
      }
      if (processedDungeonCardIdsRef.current.has(cardId)) {
        return;
      }
      processedDungeonCardIdsRef.current.add(cardId);
      logBackpackDraw('dungeon-processed', { cardId, source });
      enqueueAutoDraw(source, cardId);
    },
    [enqueueAutoDraw, gameOver, victory],
  );

  useEffect(() => {
    const prevSlots = previousActiveCardsRef.current;
    const isInitialSetup = prevSlots.every(s => s === null);
    const isFreshGame = isInitialSetup && freshGameStartRef.current;
    if (isFreshGame) {
      freshGameStartRef.current = false;
    }
    const newlyLandedMonsters: GameCardData[] = [];
    for (let column = 0; column < DUNGEON_COLUMN_COUNT; column += 1) {
      const prevCard = prevSlots[column];
      const nextCard = activeCards[column];
      if (prevCard && !nextCard) {
        if (storingCardIdsRef.current.has(prevCard.id)) {
          logBackpackDraw('slot-cleared-deferred', { cardId: prevCard.id });
          continue;
        }
        registerDungeonCardProcessed(prevCard.id, 'slot-cleared');
      }
      if ((isFreshGame || !isInitialSetup) && !prevCard && nextCard && nextCard.type === 'monster' && (nextCard.enterEffect || nextCard.ogreEnterDiscard)) {
        newlyLandedMonsters.push(nextCard);
      }
    }
    previousActiveCardsRef.current = activeCards;

    if (newlyLandedMonsters.length > 0) {
      for (const monster of newlyLandedMonsters) {
        if (monster.enterEffect === 'auto-engage') {
          const rowMonsters = activeCards.filter(c => c && c.type === 'monster') as GameCardData[];
          const names = rowMonsters.map(m => m.name);
          addGameLog('combat', `${monster.name} 入场：整行怪物进入激怒状态！（${names.join('、')}）`);
          setHeroSkillBanner(`${monster.name} 入场！全体怪物激怒！`);
          for (const m of rowMonsters) {
            beginCombat(m, 'hero');
          }
        }
        if (monster.ogreEnterDiscard && handCards.length > 0) {
          const discardIdx = Math.floor(Math.random() * handCards.length);
          const discarded = handCards[discardIdx];
          setHandCards(prev => prev.filter((_, i) => i !== discardIdx));
          discardCardToGraveyard(discarded);
          addGameLog('combat', `${monster.name} 蛮力震慑：随机弃掉了手牌「${discarded.name}」！`);
          setHeroSkillBanner(`${monster.name} 震慑！弃掉了「${discarded.name}」！`);
        }
      }
    }

    if (isFreshGame || !isInitialSetup) {
      const isLowGold = gold <= 10;
      setActiveCards(prev => {
        let changed = false;
        const next = prev.map(card => {
          if (!card || card.type !== 'monster' || !card.eliteLowGoldPower) return card;
          if (isLowGold && !card.lowGoldBuffActive) {
            changed = true;
            addGameLog('combat', `${card.name} 感受到了贪婪的力量！攻击力与血量翻倍！`);
            setHeroSkillBanner(`${card.name} 贪婪强化！攻击力与血量翻倍！`);
            return {
              ...card,
              attack: (card.attack ?? card.value) * 2,
              value: card.value * 2,
              hp: (card.hp ?? 0) * 2,
              maxHp: (card.maxHp ?? 0) * 2,
              lowGoldBuffActive: true,
            };
          }
          return card;
        });
        return changed ? next : prev;
      });
    }
  }, [activeCards, registerDungeonCardProcessed]);

  useEffect(() => {
    if (storingCardIdsRef.current.size === 0) {
      return;
    }
    const readyIds: string[] = [];
    storingCardIdsRef.current.forEach(cardId => {
      if (backpackItems.some(card => card.id === cardId)) {
        readyIds.push(cardId);
      }
    });
    if (!readyIds.length) {
      return;
    }
    readyIds.forEach(cardId => {
      storingCardIdsRef.current.delete(cardId);
      logBackpackDraw('backpack-store-ready', { cardId });
      registerDungeonCardProcessed(cardId, 'backpack-store');
    });
  }, [backpackItems, registerDungeonCardProcessed]);

  const addPermanentMagicToRecycleBag = useCallback(
    (card: GameCardData) => {
      const sanitized = sanitizeCardMetadata(card);
      let payload: GameCardData = sanitized;
      if (isPermRecycleEquipment(sanitized)) {
        const maxD = sanitized.maxDurability ?? sanitized.durability ?? 1;
        payload = { ...sanitized, durability: maxD, maxDurability: maxD };
      }
      const withWaits: GameCardData = { ...payload, _recycleWaits: payload.recycleDelay ?? 1 };
      setPermanentMagicRecycleBag(prev => {
        const filtered = prev.filter(existing => existing.id !== withWaits.id);
        return [...filtered, withWaits];
      });
      addGameLog('deck', `「${card.name}」→ 回收袋`);
    },
    [addGameLog, setPermanentMagicRecycleBag],
  );

  const restorePermanentMagicFromRecycleBag = useCallback(() => {
    const currentBag = permanentMagicRecycleBag;
    if (!currentBag.length) return 0;

    const readyCards: GameCardData[] = [];
    const waitingCards: GameCardData[] = [];
    for (const card of currentBag) {
      const waits = (card._recycleWaits ?? 1) - 1;
      if (waits <= 0) {
        readyCards.push(card);
      } else {
        waitingCards.push({ ...card, _recycleWaits: waits });
      }
    }

    const currentBackpackLength = backpackItemsRef.current.length;
    const availableSlots = Math.max(0, backpackCapacity - currentBackpackLength);
    const cardsToRestore = readyCards.slice(0, availableSlots).map(card => sanitizeCardMetadata(card));
    const restoredCount = cardsToRestore.length;

    const remainingReady = readyCards.slice(restoredCount);
    setPermanentMagicRecycleBag([...remainingReady, ...waitingCards]);

    if (!restoredCount) return 0;

    addGameLog('deck', `回收袋返还 ${restoredCount} 张牌：${cardsToRestore.map(c => c.name).join('、')}`);

    backpackItemsRef.current = [...backpackItemsRef.current, ...cardsToRestore];
    setBackpackItems(prev => {
      const next = [...prev, ...cardsToRestore];
      backpackItemsRef.current = next;
      return next;
    });

    return restoredCount;
  }, [addGameLog, backpackCapacity, permanentMagicRecycleBag]);

  const tickRecycleForge = () => {
    if (!amuletSlotsRef.current.some(s => s?.amuletEffect === 'recycle-forge')) return;
    const next = recycleForgePlayCountRef.current + 1;
    recycleForgePlayCountRef.current = next;
    setRecycleForgePlayCount(next);
    if (next % 5 === 0) {
      const restored = restorePermanentMagicFromRecycleBag();
      const drawn = takeRandomCardsFromBackpack(Math.min(2, backpackItemsRef.current.length));
      drawn.forEach(c => queueCardIntoHand(c));
      const parts: string[] = [];
      parts.push(restored > 0 ? `回收熔炉：回收袋返还 ${restored} 张牌` : '回收熔炉：回收袋为空');
      if (drawn.length > 0) parts.push(`抽到 ${drawn.map(c => c.name).join('、')}`);
      setHeroSkillBanner(parts.join('，') + '。');
      addGameLog('amulet', `回收熔炉触发（${next} 张牌已使用）：${parts.join('，')}。`);
    }
  };

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
      setBackpackItems(prev => {
        const next = [...drawnCards, ...prev];
        if (next.length <= backpackCapacity) return next;
        next.slice(backpackCapacity).forEach(c => addToGraveyard(c));
        return next.slice(0, backpackCapacity);
      });

      if (DEV_MODE) {
        console.debug('[ClassDeckDraw]', {
          source,
          requested: count,
          delivered: drawLimit,
          filtered: Boolean(filter),
          filterFallback: Boolean(filter && filteredPool.length === 0),
        });
      }

      if (drawnCards.length > 0) {
        addGameLog(
          'skill',
          `获得专属卡（${source}）：${drawnCards.map(c => c.name).join('、')}`,
        );
      }

      return drawnCards;
    },
    [addGameLog, backpackItems.length, classDeck],
  );

  const returnCardsToClassDeck = useCallback((cards: GameCardData[]) => {
    if (!cards.length) return;
    setClassDeck(prev => [...prev, ...cards].sort(() => Math.random() - 0.5));
  }, []);

  const beginDiscoverFlow = useCallback(
    (source: string): boolean => {
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

      addGameLog(
        'skill',
        `发现专属卡（${source}）：候选 ${options.map(c => `「${c.name}」`).join('、')}`,
      );

      if (DEV_MODE) {
        console.debug('[Discover] Started discover flow', { source, available, optionIds: Array.from(optionIds) });
      }

      return true;
    },
    [addGameLog, classDeck],
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
        offerings.push({ card: picked, price: getShopPrice(picked), sold: false });
      }
    });

    while (offerings.length < maxOfferings) {
      const picked = takeRandomCard();
      if (!picked) {
        break;
      }
      offerings.push({ card: picked, price: getShopPrice(picked), sold: false });
    }

    return offerings;
  }, [classDeck, shopLevel]);

  const startShopFlow = useCallback(
    (eventCard: GameCardData | null): boolean => {
      if (!eventCard) {
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
      setShopHealUsed(false);
      setShopLevelUpUsed(false);
      setShopSkillDiscoverUsed(false);
      setDeleteModalOpen(false);
      setShopModalOpen(true);
      setShopModalMinimized(false);
      setEventModalOpen(false);
      setEventModalMinimized(false);
      return true;
    },
    [generateShopOfferings],
  );


  const updateClassDeckFlightAnimation = useCallback((timestamp: number) => {
    const flights = classDeckFlightsRef.current;
    if (!flights.length) {
      classDeckFlightAnimationRef.current = null;
      return;
    }

    let hasActive = false;
    let hasCompleted = false;
    const cardW = gridCardSizeRef.current?.width ?? 140;
    const cardH = gridCardSizeRef.current?.height ?? 210;

    for (let i = 0; i < flights.length; i++) {
      const flight = flights[i];
      const elapsed = timestamp - flight.startTime;
      let progress: number;
      if (elapsed < 0) {
        hasActive = true;
        progress = 0;
      } else {
        progress = clamp(elapsed / flight.duration);
      }
      flight.progress = progress;
      if (progress < 1) {
        hasActive = true;
      } else {
        hasCompleted = true;
      }

      const el = classDeckFlightElementMapRef.current.get(flight.id);
      if (el) {
        const eased = easeInOutCubic(clamp(progress));
        const x = flight.start.x + (flight.end.x - flight.start.x) * eased;
        const linearY = flight.start.y + (flight.end.y - flight.start.y) * eased;
        const arcOffset = Math.sin(Math.PI * eased) * flight.arcHeight;
        const y = linearY - arcOffset;
        const scale = 0.85 + eased * 0.2;
        const fadeIn = eased < 0.12 ? clamp(eased / 0.12) : 1;
        const fadeOut = eased > 0.88 ? clamp(1 - (eased - 0.88) / 0.12) : 1;
        const rotate = Math.sin(eased * Math.PI * 1.2) * 5;
        el.style.transform = `translate(${x - cardW / 2}px, ${y - cardH / 2}px) scale(${scale}) rotate(${rotate}deg)`;
        el.style.opacity = String(fadeIn * fadeOut);
      }
    }

    if (hasCompleted) {
      const remaining = flights.filter(f => f.progress < 1);
      classDeckFlightsRef.current = remaining;
      setClassDeckFlights(remaining);
    }

    if (hasActive && classDeckFlightsRef.current.length > 0) {
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
        startTime: baseTime + index * animSpeed(CLASS_FLIGHT_STAGGER),
        duration: animSpeed(CLASS_FLIGHT_BASE_DURATION + Math.random() * CLASS_FLIGHT_VARIANCE),
        progress: 0,
        arcHeight: CLASS_FLIGHT_ARC_MIN + Math.random() * CLASS_FLIGHT_ARC_VARIANCE,
      };
    });

    classDeckFlightsRef.current = [...classDeckFlightsRef.current, ...newFlights];
    setClassDeckFlights(classDeckFlightsRef.current);
    startClassDeckFlightAnimation();
  }, [startClassDeckFlightAnimation]);

  const handleDiscoverFallback = useCallback((): boolean => {
    const fallback = drawClassCardsToBackpack(1, 'discover-fallback');
    if (fallback.length) {
      triggerClassDeckFlight(fallback);
      return true;
    }
    return false;
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
    clearUndoStack();
    setEventDiceModal(prev => {
      if (!prev) return prev;
      const matched =
        prev.entries.find(entry => value >= entry.range[0] && value <= entry.range[1]) ??
        prev.entries[prev.entries.length - 1] ??
        null;

      const context = prev.subtitle ? `${prev.title}（${prev.subtitle}）` : prev.title;
      addGameLog('event', `${context} 掷骰：${value} → ${matched?.label ?? '无效果'}`);

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
    const nearCompleteCards: GameCardData[] = [];
    let hasCompleted = false;
    const cardW = gridCardSizeRef.current?.width ?? 140;
    const cardH = gridCardSizeRef.current?.height ?? 210;

    for (let i = 0; i < flights.length; i++) {
      const flight = flights[i];
      const elapsed = timestamp - flight.startTime;
      let progress: number;
      if (elapsed < 0) {
        hasActive = true;
        progress = 0;
      } else {
        progress = clamp(elapsed / flight.duration);
      }
      flight.progress = progress;
      if (progress < 1) {
        hasActive = true;
        if (!flight.delivered && progress >= 0.85) {
          nearCompleteCards.push(flight.card);
          flight.delivered = true;
        }
      } else {
        if (!flight.delivered) {
          completedCards.push(flight.card);
          flight.delivered = true;
        }
        hasCompleted = true;
      }

      const el = backpackFlightElementMapRef.current.get(flight.id);
      if (el) {
        const eased = easeInOutCubic(clamp(progress));
        const x = flight.start.x + (flight.end.x - flight.start.x) * eased;
        const linearY = flight.start.y + (flight.end.y - flight.start.y) * eased;
        const arcOffset = Math.sin(Math.PI * eased) * flight.arcHeight;
        const y = linearY - arcOffset;
        const scale = 0.9 + eased * 0.15;
        const fadeIn = eased < 0.1 ? clamp(eased / 0.1) : 1;
        const fadeOut = eased > 0.85 ? clamp(1 - (eased - 0.85) / 0.15) : 1;
        el.style.transform = `translate(${x - cardW / 2}px, ${y - cardH / 2}px) scale(${scale})`;
        el.style.opacity = String(fadeIn * fadeOut);
      }
    }

    const cardsToDeliver = [...nearCompleteCards, ...completedCards];
    if (cardsToDeliver.length) {
      logBackpackDraw('flight-complete', {
        completedCount: completedCards.length,
        nearCompleteCount: nearCompleteCards.length,
        remainingFlights: flights.length,
      });
      cardsToDeliver.forEach(card => {
        clearBackpackHandFallback(card.id);
        ensureCardInHand(card);
      });
    }

    if (hasCompleted) {
      const remaining = flights.filter(f => f.progress < 1);
      backpackHandFlightsRef.current = remaining;
      setBackpackHandFlights(remaining);
    }

    if (hasActive && backpackHandFlightsRef.current.length > 0) {
      backpackHandFlightAnimationRef.current = window.requestAnimationFrame(updateBackpackHandFlightAnimation);
    } else {
      backpackHandFlightAnimationRef.current = null;
    }
  }, [clearBackpackHandFallback, ensureCardInHand]);

  const startBackpackHandFlightAnimation = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (backpackHandFlightAnimationRef.current !== null) return;
    backpackHandFlightAnimationRef.current = window.requestAnimationFrame(updateBackpackHandFlightAnimation);
  }, [updateBackpackHandFlightAnimation]);

  const triggerBackpackHandFlight = useCallback(
    (card: GameCardData): boolean => {
      if (typeof window === 'undefined') return false;

      if (backpackHandFlightsRef.current.some(f => f.card.id === card.id)) {
        logBackpackDraw('flight-skip', { reason: 'duplicate-card', cardId: card.id });
        return false;
      }

      const surfaceEl = gameSurfaceRef.current;
      const backpackCell = heroRowCellRefs.current[HERO_ROW_BACKPACK_INDEX];
      const handContainer = handAreaRef.current;

      if (!surfaceEl || !backpackCell || !handContainer) {
        logBackpackDraw('flight-skip', { reason: 'missing-dom' });
        return false;
      }

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
        duration: animSpeed(BACKPACK_FLIGHT_BASE_DURATION + Math.random() * BACKPACK_FLIGHT_VARIANCE),
        progress: 0,
        arcHeight: BACKPACK_FLIGHT_ARC_MIN + Math.random() * BACKPACK_FLIGHT_ARC_VARIANCE,
      };

      backpackHandFlightsRef.current = [...backpackHandFlightsRef.current, flight];
      setBackpackHandFlights(backpackHandFlightsRef.current);
      startBackpackHandFlightAnimation();
      logBackpackDraw('flight-start', {
        cardId: card.id,
        flights: backpackHandFlightsRef.current.length,
      });

      return true;
    },
    [startBackpackHandFlightAnimation],
  );

  // ─── Discard flight animation (hand → graveyard / backpack) ───────────────
  const updateDiscardFlightAnimation = useCallback((timestamp: number) => {
    const flights = discardFlightsRef.current;
    if (!flights.length) {
      discardFlightAnimationRef.current = null;
      return;
    }
    let hasActive = false;
    let hasCompleted = false;
    const cardW = gridCardSizeRef.current?.width ?? 140;
    const cardH = gridCardSizeRef.current?.height ?? 210;

    for (const flight of flights) {
      const elapsed = timestamp - flight.startTime;
      const progress = elapsed < 0 ? 0 : clamp(elapsed / flight.duration);
      flight.progress = progress;
      if (progress < 1) {
        hasActive = true;
      } else {
        if (!flight.delivered) {
          flight.delivered = true;
          hasCompleted = true;
          const resolve = discardFlightResolveMapRef.current.get(flight.id);
          discardFlightResolveMapRef.current.delete(flight.id);
          resolve?.();
        }
      }
      const el = discardFlightElementMapRef.current.get(flight.id);
      if (el) {
        const eased = easeInOutCubic(clamp(progress));
        const x = flight.start.x + (flight.end.x - flight.start.x) * eased;
        const linearY = flight.start.y + (flight.end.y - flight.start.y) * eased;
        const arcOffset = Math.sin(Math.PI * eased) * flight.arcHeight;
        const y = linearY - arcOffset;
        const scale = 1.0 - eased * 0.25;
        const fadeIn = eased < 0.1 ? clamp(eased / 0.1) : 1;
        const fadeOut = eased > 0.85 ? clamp(1 - (eased - 0.85) / 0.15) : 1;
        el.style.transform = `translate(${x - cardW / 2}px, ${y - cardH / 2}px) scale(${scale})`;
        el.style.opacity = String(fadeIn * fadeOut);
      }
    }
    if (hasCompleted) {
      const remaining = flights.filter(f => f.progress < 1);
      discardFlightsRef.current = remaining;
      setDiscardFlights(remaining);
    }
    if (hasActive && discardFlightsRef.current.length > 0) {
      discardFlightAnimationRef.current = window.requestAnimationFrame(updateDiscardFlightAnimation);
    } else {
      discardFlightAnimationRef.current = null;
    }
  }, []);

  const startDiscardFlightAnimation = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (discardFlightAnimationRef.current !== null) return;
    discardFlightAnimationRef.current = window.requestAnimationFrame(updateDiscardFlightAnimation);
  }, [updateDiscardFlightAnimation]);

  const triggerDiscardFlight = useCallback(
    (card: GameCardData, destination: 'graveyard' | 'recycle-bag'): Promise<void> => {
      if (typeof window === 'undefined') return Promise.resolve();
      const surfaceEl = gameSurfaceRef.current;
      const targetEl = destination === 'graveyard'
        ? graveyardCellRef.current
        : heroRowCellRefs.current[HERO_ROW_BACKPACK_INDEX];
      if (!surfaceEl || !targetEl) return Promise.resolve();

      const surfaceRect = surfaceEl.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();

      const cardEl = surfaceEl.querySelector(
        `[data-testid="card-${card.type}-${card.id}"]`,
      ) as HTMLElement | null;
      const sourceRect = cardEl?.getBoundingClientRect() ?? handAreaRef.current?.getBoundingClientRect();
      if (!sourceRect) return Promise.resolve();

      const start: Point = {
        x: sourceRect.left + sourceRect.width / 2 - surfaceRect.left,
        y: sourceRect.top + sourceRect.height / 2 - surfaceRect.top,
      };
      const end: Point = {
        x: targetRect.left + targetRect.width / 2 - surfaceRect.left + (Math.random() - 0.5) * 12,
        y: targetRect.top + targetRect.height / 2 - surfaceRect.top + (Math.random() - 0.5) * 8,
      };

      const baseTime = performance.now();
      const flight: DiscardFlight = {
        id: `discard-flight-${card.id}-${baseTime}`,
        card,
        start,
        end,
        startTime: baseTime,
        duration: animSpeed(DISCARD_FLIGHT_BASE_DURATION + Math.random() * DISCARD_FLIGHT_VARIANCE),
        progress: 0,
        arcHeight: DISCARD_FLIGHT_ARC_MIN + Math.random() * DISCARD_FLIGHT_ARC_VARIANCE,
      };

      return new Promise<void>(resolve => {
        discardFlightResolveMapRef.current.set(flight.id, resolve);
        discardFlightsRef.current = [...discardFlightsRef.current, flight];
        setDiscardFlights(discardFlightsRef.current);
        startDiscardFlightAnimation();
      });
    },
    [startDiscardFlightAnimation],
  );
  // ─── end discard flight ─────────────────────────────────────────────────────

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
      turnCount,
      shopLevel,
      monstersDefeated,
      cardsPlayed,
      recycleForgePlayCount,
      totalDamageTaken,
      totalHealed,
      healAccumulator: healAccumulatorRef.current,
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
      equipmentSlot1Reserve: sanitizeCardList(equipmentSlot1Reserve),
      equipmentSlot2Reserve: sanitizeCardList(equipmentSlot2Reserve),
      equipmentSlotCapacity: { ...equipmentSlotCapacity },
      maxAmuletSlots,
      amuletSlots: sanitizeCardList(amuletSlots),
      backpackItems: sanitizeCardList(backpackItems),
      permanentMagicRecycleBag: sanitizeCardList(permanentMagicRecycleBag),
      classDeck: sanitizeCardList(classDeck),
      classCardsInHand: sanitizeCardList(classCardsInHand),
      selectedHeroSkill,
      extraHeroSkills: [...extraHeroSkills],
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
      heroMagicState: sanitizeHeroMagicState(heroMagicState),
      turnDamageTaken,
      berserkTurnBuff: {
        equipmentSlot1: berserkTurnBuff.equipmentSlot1 ?? 0,
        equipmentSlot2: berserkTurnBuff.equipmentSlot2 ?? 0,
      },
      extraAttackCharges,
      combatState: {
        engagedMonsterIds: combatState.engagedMonsterIds,
        initiator: combatState.initiator,
        currentTurn: combatState.currentTurn,
        heroAttacksThisTurn: { ...combatState.heroAttacksThisTurn },
        heroAttacksRemaining: combatState.heroAttacksRemaining,
        heroDamageThisTurn: { ...combatState.heroDamageThisTurn },
        monsterAttackQueue: [...combatState.monsterAttackQueue],
        pendingBlock: combatState.pendingBlock ? { ...combatState.pendingBlock } : null,
      },
      tempShield,
      nextWeaponBonus,
      nextShieldBonus,
      slotAttackBursts: {
        equipmentSlot1: slotAttackBursts.equipmentSlot1 ?? 0,
        equipmentSlot2: slotAttackBursts.equipmentSlot2 ?? 0,
      },
      nextAttackLifestealSlot,
      vampiricNextAttack,
      unbreakableNext,
      unbreakableUntilWaterfall,
      bulwarkPassiveActive,
      defensiveStanceActive,
      doubleNextMagic,
      berserkerRageActive,
      berserkerSlotUsed,
      heroSkillUsedThisWave,
      extraSkillsUsedThisWave: Array.from(extraSkillsUsedThisWave),
      handLimitBonus,
      drawPending,
      waveDiscardCount,
      resolvingDungeonCardId,
      currentEventCard,
      eventModalOpen,
      eventModalMinimized,
    };
  }, [
    hp,
    gold,
    turnCount,
    shopLevel,
    monstersDefeated,
    cardsPlayed,
    recycleForgePlayCount,
    totalDamageTaken,
    totalHealed,
    previewCards,
    activeCards,
    remainingDeck,
    discardedCards,
    handCards,
    equipmentSlot1,
    equipmentSlot2,
    equipmentSlot1Reserve,
    equipmentSlot2Reserve,
    equipmentSlotCapacity,
    maxAmuletSlots,
    amuletSlots,
    backpackItems,
    permanentMagicRecycleBag,
    turnDamageTaken,
    berserkTurnBuff,
    extraAttackCharges,
    classDeck,
    classCardsInHand,
    selectedHeroSkill,
    extraHeroSkills,
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
    heroMagicState,
    combatState,
    tempShield,
    nextWeaponBonus,
    nextShieldBonus,
    slotAttackBursts,
    nextAttackLifestealSlot,
    vampiricNextAttack,
    unbreakableNext,
    unbreakableUntilWaterfall,
    bulwarkPassiveActive,
    defensiveStanceActive,
    doubleNextMagic,
    berserkerRageActive,
    berserkerSlotUsed,
    heroSkillUsedThisWave,
    extraSkillsUsedThisWave,
    handLimitBonus,
    drawPending,
    waveDiscardCount,
    resolvingDungeonCardId,
    currentEventCard,
    eventModalOpen,
    eventModalMinimized,
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
    if (!gameOver) {
      return;
    }
    clearAllBackpackHandFallbacks();
    backpackHandFlightsRef.current = [];
    backpackFlightElementMapRef.current.clear();
    setBackpackHandFlights([]);
    if (discardShockFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(discardShockFlightAnimationRef.current);
      discardShockFlightAnimationRef.current = null;
    }
    discardShockFlightsRef.current = [];
    discardShockElementMapRef.current.clear();
    setDiscardShockFlights([]);
    discardShockProcQueueRef.current = [];
    discardShockSeqInFlightRef.current = false;
  }, [gameOver, clearAllBackpackHandFallbacks]);

  useEffect(() => {
    return () => {
      clearWaterfallTimeouts();
      clearAllBackpackHandFallbacks();
    };
  }, [clearWaterfallTimeouts, clearAllBackpackHandFallbacks]);

  useEffect(() => {
    return () => {
      if (classDeckFlightAnimationRef.current !== null) {
        window.cancelAnimationFrame(classDeckFlightAnimationRef.current);
      }
      if (backpackHandFlightAnimationRef.current !== null) {
        window.cancelAnimationFrame(backpackHandFlightAnimationRef.current);
      }
      if (discardShockFlightAnimationRef.current !== null) {
        window.cancelAnimationFrame(discardShockFlightAnimationRef.current);
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

  // Safety net: prune stale engaged IDs whose cards no longer exist on the board
  // and whose defeat timeout already fired (not in pendingDefeatIds).
  useEffect(() => {
    if (combatState.engagedMonsterIds.length === 0) return;
    const staleIds = combatState.engagedMonsterIds.filter(
      id =>
        !activeCards.some(c => c?.id === id) &&
        !pendingDefeatIdsRef.current.has(id),
    );
    if (staleIds.length === 0) return;
    setCombatState(prev => {
      const remaining = prev.engagedMonsterIds.filter(id => !staleIds.includes(id));
      if (remaining.length === prev.engagedMonsterIds.length) return prev;
      if (remaining.length === 0) return { ...initialCombatState };
      return { ...prev, engagedMonsterIds: remaining };
    });
  }, [combatState.engagedMonsterIds, activeCards]);

  const prevTurnRef = useRef(combatState.currentTurn);
  useEffect(() => {
    if (prevTurnRef.current === 'monster' && combatState.currentTurn === 'hero') {
      setBerserkerSlotUsed({});
      heroTurnLayerLossIdsRef.current.clear();

      // Boss Last Stand Aura: when at 1 layer, +5 atk and heal 8 HP per monster turn end
      const engagedIds = combatState.engagedMonsterIds;
      setActiveCards(prev => {
        let changed = false;
        const next = prev.map(card => {
          if (!card || !engagedIds.includes(card.id)) return card;
          if (!card.bossLastStandAura) return card;
          if ((card.currentLayer ?? 1) !== 1) return card;
          changed = true;
          const newAttack = (card.attack ?? card.value ?? 0) + 5;
          const newValue = (card.value ?? 0) + 5;
          const newLayer = (card.currentLayer ?? 1) + 1;
          const fullHp = card.maxHp ?? card.hp ?? 0;
          addGameLog('combat', `${card.name} 暴走光环：攻击 +5，恢复至 ${newLayer} 血层！`);
          setHeroSkillBanner(`${card.name} 暴走光环发动！`);
          return {
            ...card,
            attack: newAttack,
            value: newValue,
            hp: fullHp,
            currentLayer: newLayer,
          };
        });
        return changed ? (next as typeof prev) : prev;
      });
    }
    prevTurnRef.current = combatState.currentTurn;
  }, [combatState.currentTurn]);

  useEffect(() => {
    const isLowGold = gold <= 10;
    setActiveCards(prev => {
      let changed = false;
      const next = prev.map(card => {
        if (!card || card.type !== 'monster' || !card.eliteLowGoldPower) return card;
        if (isLowGold && !card.lowGoldBuffActive) {
          changed = true;
          addGameLog('combat', `${card.name} 感受到了贪婪的力量！攻击力与血量翻倍！`);
          setHeroSkillBanner(`${card.name} 贪婪强化！攻击力与血量翻倍！`);
          return {
            ...card,
            attack: (card.attack ?? card.value) * 2,
            value: card.value * 2,
            hp: (card.hp ?? 0) * 2,
            maxHp: (card.maxHp ?? 0) * 2,
            lowGoldBuffActive: true,
          };
        }
        if (!isLowGold && card.lowGoldBuffActive) {
          changed = true;
          addGameLog('combat', `${card.name} 的贪婪强化消退了。`);
          return {
            ...card,
            attack: Math.floor((card.attack ?? card.value) / 2),
            value: Math.floor(card.value / 2),
            hp: Math.ceil((card.hp ?? 0) / 2),
            maxHp: Math.floor((card.maxHp ?? 0) / 2),
            lowGoldBuffActive: false,
          };
        }
        return card;
      });
      return changed ? next : prev;
    });
  }, [gold, addGameLog]);

  const initGame = () => {
    combatAsyncEpochRef.current += 1;
    setCombatState(initialCombatState);
    setHeroVariant(getRandomHero());
    clearAllHandDeliveryGuards();
    processedDungeonCardIdsRef.current.clear();
    previousActiveCardsRef.current = createEmptyActiveRow();
    freshGameStartRef.current = true;
    const newDeck = createDeck();
    // Add Knight discovery events to main deck
    const knightEvents = createKnightDiscoveryEvents();
    const deckWithClassEvents = [...newDeck, ...knightEvents].sort(() => Math.random() - 0.5);

    // Balance monster distribution: roughly equal monsters per half, elites only in second half
    {
      const halfSize = Math.floor(deckWithClassEvents.length / 2);
      const eliteMonsters = deckWithClassEvents.filter(c => c.monsterSpecial);
      const nonEliteMonsters = deckWithClassEvents.filter(c => c.type === 'monster' && !c.monsterSpecial);
      const nonMonsters = deckWithClassEvents.filter(c => c.type !== 'monster');

      const totalMonsters = eliteMonsters.length + nonEliteMonsters.length;
      const firstHalfMonsterCount = Math.min(Math.floor(totalMonsters / 2), nonEliteMonsters.length);

      const firstHalf = [
        ...nonEliteMonsters.slice(0, firstHalfMonsterCount),
        ...nonMonsters.slice(0, halfSize - firstHalfMonsterCount),
      ];
      const secondHalf = [
        ...nonEliteMonsters.slice(firstHalfMonsterCount),
        ...eliteMonsters,
        ...nonMonsters.slice(halfSize - firstHalfMonsterCount),
      ];

      firstHalf.sort(() => Math.random() - 0.5);
      secondHalf.sort(() => Math.random() - 0.5);
      deckWithClassEvents.splice(0, deckWithClassEvents.length, ...firstHalf, ...secondHalf);
    }

    // Balance monster density: at most 2 monsters per non-overlapping chunk of 5 cards
    {
      const MAX_MONSTERS_PER_CHUNK = 2;
      const CHUNK = 5;
      for (let start = 0; start + CHUNK <= deckWithClassEvents.length; start += CHUNK) {
        const chunkEnd = start + CHUNK;
        const monsterIndices: number[] = [];
        for (let j = start; j < chunkEnd; j++) {
          if (deckWithClassEvents[j].type === 'monster') monsterIndices.push(j);
        }
        while (monsterIndices.length > MAX_MONSTERS_PER_CHUNK) {
          const excessIdx = monsterIndices.pop()!;
          let swapTarget = -1;
          for (let k = chunkEnd; k < deckWithClassEvents.length; k++) {
            if (deckWithClassEvents[k].type !== 'monster') { swapTarget = k; break; }
          }
          if (swapTarget === -1) {
            for (let k = start - 1; k >= 0; k--) {
              if (deckWithClassEvents[k].type !== 'monster') { swapTarget = k; break; }
            }
          }
          if (swapTarget >= 0) {
            const tmp = deckWithClassEvents[excessIdx];
            deckWithClassEvents[excessIdx] = deckWithClassEvents[swapTarget];
            deckWithClassEvents[swapTarget] = tmp;
          } else {
            break;
          }
        }
      }
    }

    // Guarantee at least one monster among the last 3 cards of the deck
    {
      const len = deckWithClassEvents.length;
      if (len >= 3) {
        const tail = deckWithClassEvents.slice(len - 3);
        const hasMonsterInTail = tail.some(c => c.type === 'monster');
        if (!hasMonsterInTail) {
          // Find the latest monster earlier in the deck (search from end, skip last 3)
          let swapIdx = -1;
          for (let i = len - 4; i >= 0; i--) {
            if (deckWithClassEvents[i].type === 'monster') {
              swapIdx = i;
              break;
            }
          }
          if (swapIdx >= 0) {
            const targetIdx = len - 1 - Math.floor(Math.random() * 3);
            const tmp = deckWithClassEvents[swapIdx];
            deckWithClassEvents[swapIdx] = deckWithClassEvents[targetIdx];
            deckWithClassEvents[targetIdx] = tmp;
          }
        }
      }
    }

    let lastMonsterDeckIndex = -1;
    for (let mi = deckWithClassEvents.length - 1; mi >= 0; mi -= 1) {
      if (deckWithClassEvents[mi].type === 'monster') {
        lastMonsterDeckIndex = mi;
        break;
      }
    }

    // Initialize with 10 cards total: 5 for preview, 5 for active
    const initialPreview = fillActiveRowSlots(deckWithClassEvents.slice(0, 5)).map((card, slotIdx) => {
      if (!card) return null;
      const raged = applyMonsterRage(card, INITIAL_TURN_COUNT + 1);
      if (slotIdx === lastMonsterDeckIndex && raged.type === 'monster') {
        return { ...raged, isFinalMonster: true, description: FINAL_MONSTER_MARK_DESCRIPTION };
      }
      return raged;
    }) as ActiveRowSlots; // Top row (preview) - rage at turnCount+1 since they drop on next waterfall
    const initialActive = fillActiveRowSlots(deckWithClassEvents.slice(5, 10)).map((card, slotIdx) => {
      if (!card) return null;
      const deckIndex = 5 + slotIdx;
      const raged = applyMonsterRage(card, INITIAL_TURN_COUNT);
      if (deckIndex === lastMonsterDeckIndex && raged.type === 'monster') {
        return { ...raged, isFinalMonster: true, description: FINAL_MONSTER_MARK_DESCRIPTION };
      }
      return raged;
    }) as ActiveRowSlots; // Middle row (active)
    setPreviewCards(initialPreview);
    setActiveCards(initialActive);
    const initialRemaining = deckWithClassEvents.slice(10).map((card, k) => {
      const deckIndex = 10 + k;
      if (deckIndex === lastMonsterDeckIndex && card.type === 'monster') {
        return { ...card, isFinalMonster: true, description: FINAL_MONSTER_MARK_DESCRIPTION };
      }
      return card;
    });
    setRemainingDeck(initialRemaining);
    setHp(INITIAL_HP);
    setGold(INITIAL_GOLD);
    setShopLevel(0);
    setTurnCount(INITIAL_TURN_COUNT);
    setEquipmentSlot1(null);
    setEquipmentSlot2(null);
    setEquipmentSlot1Reserve([]);
    setEquipmentSlot2Reserve([]);
    setEquipmentSlotCapacity({ equipmentSlot1: 1, equipmentSlot2: 1 });
    setMaxAmuletSlots(MAX_AMULET_SLOTS);
    setAmuletSlots([]);
    const starterBackpack = createStarterBackpack();
    setBackpackItems(starterBackpack);
    setPermanentMagicRecycleBag([]);
    setBackpackCapacityModifier(0);
    setTurnDamageTaken(0);
    clearBerserkTurnBuff();
    setExtraAttackCharges(0);
    setBackpackHandFlights([]);
    backpackHandFlightsRef.current = [];
    backpackFlightElementMapRef.current.clear();
    if (typeof window !== 'undefined' && backpackHandFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(backpackHandFlightAnimationRef.current);
      backpackHandFlightAnimationRef.current = null;
    }
    setDiscardShockFlights([]);
    discardShockFlightsRef.current = [];
    discardShockElementMapRef.current.clear();
    discardShockProcQueueRef.current = [];
    discardShockSeqInFlightRef.current = false;
    if (typeof window !== 'undefined' && discardShockFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(discardShockFlightAnimationRef.current);
      discardShockFlightAnimationRef.current = null;
    }
    clearAllBackpackHandFallbacks();
    setBackpackViewerOpen(false);
    setHandCards([]);
    setCardsPlayed(0);
    setRecycleForgePlayCount(0);
    recycleForgePlayCountRef.current = 0;
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
    setHeroMagicState(createInitialHeroMagicState());
    setBerserkerRageActive(false);
    setBerserkerSlotUsed({});
    setMonsterRewardQueue([]);
    setActiveMonsterReward(null);
    monsterRewardQueuedInstanceIdsRef.current.clear();
    setTempShield(0);
    setEventModalOpen(false);
    setEventModalMinimized(false);
    setCurrentEventCard(null);
    setPendingMagicAction(null);
    setHandLimitBonus(0);
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
    setUnbreakableUntilWaterfall({ equipmentSlot1: false, equipmentSlot2: false });
    setBulwarkPassiveActive(0);
    setDefensiveStanceActive(false);
    setSlotAttackBursts({ equipmentSlot1: 0, equipmentSlot2: 0 });
    setNextAttackLifestealSlot(null);
    setDoubleNextMagic(false);
    
    // Reset equipment slot bonuses
    resetEquipmentSlotBonuses();
    
    // Reset and show skill selection
    setSelectedHeroSkill(null);
    setExtraHeroSkills([]);
    setExtraSkillsUsedThisWave(new Set());
    setShopSkillDiscoverUsed(false);
    setShopSkillSelectOpen(false);
    setShopSkillOptions([]);
    setShowSkillSelection(true);
    resetHeroSkillForNewWave();
  };

  const hydrateGameState = (snapshot: PersistedGameState) => {
    combatAsyncEpochRef.current += 1;
    const mapSlots = (slots?: Array<GameCardData | null>): ActiveRowSlots => {
      const next = createEmptyActiveRow();
      if (!Array.isArray(slots)) {
        return next;
      }
      for (let i = 0; i < Math.min(slots.length, DUNGEON_COLUMN_COUNT); i += 1) {
        const c = slots[i] ?? null;
        next[i] = c ? patchPersistedMainDeckWeaponImage(c) : null;
      }
      return next;
    };

    const mapEquipment = (card: GameCardData | null, slotId: EquipmentSlotId): EquipmentItem | null => {
      if (!card) return null;
      const patched = patchPersistedMainDeckWeaponImage(card);
      if (patched.type !== 'weapon' && patched.type !== 'shield' && patched.type !== 'monster') {
        return null;
      }
      return { ...patched, fromSlot: slotId } as EquipmentItem;
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

    clearAllHandDeliveryGuards();
    processedDungeonCardIdsRef.current.clear();
    previousActiveCardsRef.current = createEmptyActiveRow();

    setHp(snapshot.hp ?? INITIAL_HP);
    setGold(snapshot.gold ?? INITIAL_GOLD);
    setTurnCount(snapshot.turnCount ?? INITIAL_TURN_COUNT);
    setShopLevel(typeof snapshot.shopLevel === 'number' ? Math.min(MAX_SHOP_LEVEL, snapshot.shopLevel) : 0);
    setMonstersDefeated(snapshot.monstersDefeated ?? 0);
    setCardsPlayed(snapshot.cardsPlayed ?? 0);
    setRecycleForgePlayCount(snapshot.recycleForgePlayCount ?? 0);
    recycleForgePlayCountRef.current = snapshot.recycleForgePlayCount ?? 0;
    setTotalDamageTaken(snapshot.totalDamageTaken ?? 0);
    setTotalHealed(snapshot.totalHealed ?? 0);
    healAccumulatorRef.current = snapshot.healAccumulator ?? 0;
    setGameOver(Boolean(snapshot.gameOver));
    setVictory(Boolean(snapshot.victory));
    setPendingMagicAction(null);
    lastWaterfallSequenceRef.current = null;

    setPreviewCards(mapSlots(snapshot.previewCards));
    setActiveCards(mapSlots(snapshot.activeCards));
    setRemainingDeck(
      Array.isArray(snapshot.remainingDeck)
        ? snapshot.remainingDeck.map(patchPersistedMainDeckWeaponImage)
        : [],
    );
    setDiscardedCards(
      Array.isArray(snapshot.discardedCards)
        ? snapshot.discardedCards.map(patchPersistedMainDeckWeaponImage)
        : [],
    );
    setHandCards(
      Array.isArray(snapshot.handCards) ? snapshot.handCards.map(patchPersistedMainDeckWeaponImage) : [],
    );
    setEquipmentSlot1(mapEquipment(snapshot.equipmentSlot1 ?? null, 'equipmentSlot1'));
    setEquipmentSlot2(mapEquipment(snapshot.equipmentSlot2 ?? null, 'equipmentSlot2'));
    setEquipmentSlot1Reserve(
      Array.isArray(snapshot.equipmentSlot1Reserve)
        ? snapshot.equipmentSlot1Reserve.map(c =>
            ({
              ...patchPersistedMainDeckWeaponImage(c),
              type: c.type as 'weapon' | 'shield' | 'monster',
              fromSlot: 'equipmentSlot1' as const,
            }) as EquipmentItem,
          )
        : [],
    );
    setEquipmentSlot2Reserve(
      Array.isArray(snapshot.equipmentSlot2Reserve)
        ? snapshot.equipmentSlot2Reserve.map(c =>
            ({
              ...patchPersistedMainDeckWeaponImage(c),
              type: c.type as 'weapon' | 'shield' | 'monster',
              fromSlot: 'equipmentSlot2' as const,
            }) as EquipmentItem,
          )
        : [],
    );
    if (snapshot.equipmentSlotCapacity) {
      setEquipmentSlotCapacity({
        equipmentSlot1: (snapshot.equipmentSlotCapacity as any).equipmentSlot1 ?? 1,
        equipmentSlot2: (snapshot.equipmentSlotCapacity as any).equipmentSlot2 ?? 1,
      });
    }
    setMaxAmuletSlots(snapshot.maxAmuletSlots ?? MAX_AMULET_SLOTS);
    setAmuletSlots(mapAmulets(snapshot.amuletSlots));
    setBackpackItems(
      Array.isArray(snapshot.backpackItems)
        ? snapshot.backpackItems.map(patchPersistedMainDeckWeaponImage)
        : [],
    );
    setTurnDamageTaken(snapshot.turnDamageTaken ?? 0);
    setBerserkTurnBuff(
      snapshot.berserkTurnBuff
        ? {
            equipmentSlot1: snapshot.berserkTurnBuff.equipmentSlot1 ?? 0,
            equipmentSlot2: snapshot.berserkTurnBuff.equipmentSlot2 ?? 0,
          }
        : createEmptyEquipmentBuffState(),
    );
    setExtraAttackCharges(snapshot.extraAttackCharges ?? 0);
    setPermanentMagicRecycleBag(
      Array.isArray(snapshot.permanentMagicRecycleBag)
        ? snapshot.permanentMagicRecycleBag.map(patchPersistedMainDeckWeaponImage)
        : [],
    );

    setClassDeck(Array.isArray(snapshot.classDeck) ? snapshot.classDeck : []);
    setClassCardsInHand(Array.isArray(snapshot.classCardsInHand) ? snapshot.classCardsInHand : []);
    setSelectedHeroSkill(snapshot.selectedHeroSkill ?? null);
    setExtraHeroSkills(Array.isArray((snapshot as any).extraHeroSkills) ? (snapshot as any).extraHeroSkills : []);
    setShowSkillSelection(
      typeof snapshot.showSkillSelection === 'boolean' ? snapshot.showSkillSelection : true,
    );
    setHeroVariant(snapshot.heroVariant ?? getRandomHero());

    setPermanentSkills(Array.isArray(snapshot.permanentSkills) ? snapshot.permanentSkills : []);
    setPermanentMaxHpBonus(snapshot.permanentMaxHpBonus ?? 0);
    setPermanentSpellDamageBonus(snapshot.permanentSpellDamageBonus ?? 0);
    setBackpackCapacityModifier(snapshot.backpackCapacityModifier ?? 0);
    setHeroMagicState(sanitizeHeroMagicState(snapshot.heroMagicState));
    setEquipmentSlotBonuses(mapEquipmentBonuses(snapshot.equipmentSlotBonuses));
    setWeaponMasterBonus(snapshot.weaponMasterBonus ?? 0);
    setShieldMasterBonus(snapshot.shieldMasterBonus ?? 0);

    setDrawPending(Boolean(snapshot.drawPending));
    setWaveDiscardCount(snapshot.waveDiscardCount ?? 0);
    setResolvingDungeonCardId(snapshot.resolvingDungeonCardId ?? null);
    setCurrentEventCard(snapshot.currentEventCard ?? null);
    setEventModalOpen(snapshot.eventModalOpen ?? false);
    setEventModalMinimized(snapshot.eventModalMinimized ?? false);
    if (snapshot.currentEventCard && snapshot.resolvingDungeonCardId) {
      eventResolutionRef.current = { cardId: snapshot.resolvingDungeonCardId, source: 'dungeon' };
    } else if (snapshot.currentEventCard) {
      eventResolutionRef.current = { cardId: null, source: 'hand' };
    } else {
      eventResolutionRef.current = { cardId: null, source: null };
    }
    setBerserkerRageActive(snapshot.berserkerRageActive ?? false);
    setBerserkerSlotUsed(snapshot.berserkerSlotUsed ?? {});

    if (snapshot.combatState && snapshot.combatState.engagedMonsterIds.length > 0) {
      setCombatState({
        engagedMonsterIds: snapshot.combatState.engagedMonsterIds,
        initiator: snapshot.combatState.initiator ?? null,
        currentTurn: snapshot.combatState.currentTurn ?? 'hero',
        heroAttacksThisTurn: snapshot.combatState.heroAttacksThisTurn ?? {
          equipmentSlot1: false,
          equipmentSlot2: false,
        },
        heroAttacksRemaining: snapshot.combatState.heroAttacksRemaining ?? 2,
        heroDamageThisTurn: snapshot.combatState.heroDamageThisTurn ?? {},
        monsterAttackQueue: snapshot.combatState.monsterAttackQueue ?? [],
        pendingBlock: snapshot.combatState.pendingBlock ?? null,
      });
    } else {
      setCombatState(initialCombatState);
    }

    setHeroSkillUsedThisWave(Boolean(snapshot.heroSkillUsedThisWave));
    setExtraSkillsUsedThisWave(
      new Set(Array.isArray(snapshot.extraSkillsUsedThisWave) ? snapshot.extraSkillsUsedThisWave : []),
    );
    setHandLimitBonus(snapshot.handLimitBonus ?? 0);
    setPendingHeroSkillAction(null);
    setHeroSkillBanner(null);
    setHeroSkillArrow(null);
    setSwordVectors({});
    setTempShield(snapshot.tempShield ?? 0);
    setNextWeaponBonus(snapshot.nextWeaponBonus ?? 0);
    setNextShieldBonus(snapshot.nextShieldBonus ?? 0);
    setSlotAttackBursts(
      snapshot.slotAttackBursts
        ? {
            equipmentSlot1: snapshot.slotAttackBursts.equipmentSlot1 ?? 0,
            equipmentSlot2: snapshot.slotAttackBursts.equipmentSlot2 ?? 0,
          }
        : { equipmentSlot1: 0, equipmentSlot2: 0 },
    );
    {
      const s = snapshot.nextAttackLifestealSlot;
      setNextAttackLifestealSlot(s === 'equipmentSlot1' || s === 'equipmentSlot2' ? s : null);
    }
    setVampiricNextAttack(Boolean(snapshot.vampiricNextAttack));
    setUnbreakableNext(Boolean(snapshot.unbreakableNext));
    setUnbreakableUntilWaterfall(
      snapshot.unbreakableUntilWaterfall ?? { equipmentSlot1: false, equipmentSlot2: false },
    );
    setBulwarkPassiveActive(Number(snapshot.bulwarkPassiveActive) || 0);
    setDoubleNextMagic(Boolean(snapshot.doubleNextMagic));
    setDefensiveStanceActive(Boolean(snapshot.defensiveStanceActive));
    setTakingDamage(false);
    setHealing(false);

    // Cancel combat animation timeouts and reset visual states
    animationDelayTimeoutsRef.current.forEach(id => clearTimeout(id));
    animationDelayTimeoutsRef.current = [];
    if (heroBleedTimeoutRef.current) {
      clearTimeout(heroBleedTimeoutRef.current);
      heroBleedTimeoutRef.current = null;
    }
    for (const timeouts of Object.values(monsterBleedTimeoutsRef.current)) {
      timeouts.forEach(id => clearTimeout(id));
    }
    monsterBleedTimeoutsRef.current = {};
    for (const timeouts of Object.values(weaponSwingTimeoutsRef.current)) {
      timeouts.forEach(id => clearTimeout(id));
    }
    weaponSwingTimeoutsRef.current = { equipmentSlot1: [], equipmentSlot2: [] };
    for (const timeouts of Object.values(shieldBlockTimeoutsRef.current)) {
      timeouts.forEach(id => clearTimeout(id));
    }
    shieldBlockTimeoutsRef.current = { equipmentSlot1: [], equipmentSlot2: [] };

    setHeroBleedActive(false);
    setMonsterBleedStates({});
    setWeaponSwingStates({ equipmentSlot1: 0, equipmentSlot2: 0 });
    setShieldBlockStates({ equipmentSlot1: 0, equipmentSlot2: 0 });
    setRemovingCards(new Set());
    setMonsterDefeatStates({});

    // Clear stale tracking refs
    storingCardIdsRef.current.clear();
    pendingAutoDrawsRef.current = 0;
    skipNextEventAutoDrawRef.current = false;
    skipEventFlipRef.current = false;
    heroTurnLayerLossIdsRef.current.clear();
    pendingDefeatIdsRef.current.clear();

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
    classDeckFlightElementMapRef.current.clear();
    if (classDeckFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(classDeckFlightAnimationRef.current);
      classDeckFlightAnimationRef.current = null;
    }
    setBackpackHandFlights([]);
    backpackHandFlightsRef.current = [];
    backpackFlightElementMapRef.current.clear();
    if (backpackHandFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(backpackHandFlightAnimationRef.current);
      backpackHandFlightAnimationRef.current = null;
    }
    setDiscardShockFlights([]);
    discardShockFlightsRef.current = [];
    discardShockElementMapRef.current.clear();
    discardShockProcQueueRef.current = [];
    discardShockSeqInFlightRef.current = false;
    if (discardShockFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(discardShockFlightAnimationRef.current);
      discardShockFlightAnimationRef.current = null;
    }
    if (directedCombatFxFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(directedCombatFxFlightAnimationRef.current);
      directedCombatFxFlightAnimationRef.current = null;
    }
    directedCombatFxFlightsRef.current = [];
    setDirectedCombatFxFlights([]);
    directedCombatFxElementMapRef.current.clear();
    clearAllBackpackHandFallbacks();
  };

  const MAX_UNDO_STACK = 10;
  const persistedStateRef = useRef(persistedState);
  persistedStateRef.current = persistedState;

  const transientState = useMemo<UndoTransientState>(() => ({
    monsterRewardQueue,
    activeMonsterReward,
    selectedMonsterRewards,
    pendingMagicAction,
    pendingPotionAction,
    pendingHeroSkillAction,
    pendingHeroMagicAction,
    shopModalOpen,
    shopModalMinimized,
    shopOfferings,
    shopSourceEvent,
    shopDeleteUsed,
    shopHealUsed,
    shopLevelUpUsed,
    shopSkillDiscoverUsed,
    shopSkillSelectOpen,
    shopSkillOptions,
    discoverModalOpen,
    discoverOptions,
    deleteModalOpen,
    deathWardPrompt,
    equipmentPrompt,
    graveyardDiscoverState,
    cardActionContext,
    gameLogEntries,
    monsterRewardPreviewCache: monsterRewardPreviewCacheRef.current,
  }), [
    monsterRewardQueue, activeMonsterReward, selectedMonsterRewards,
    pendingMagicAction, pendingPotionAction, pendingHeroSkillAction, pendingHeroMagicAction,
    shopModalOpen, shopModalMinimized, shopOfferings, shopSourceEvent, shopDeleteUsed, shopHealUsed, shopLevelUpUsed, shopSkillDiscoverUsed, shopSkillSelectOpen, shopSkillOptions,
    discoverModalOpen, discoverOptions, deleteModalOpen,
    deathWardPrompt, equipmentPrompt, graveyardDiscoverState, cardActionContext,
    gameLogEntries,
  ]);
  const transientStateRef = useRef(transientState);
  transientStateRef.current = transientState;

  const pushUndoSnapshot = useCallback(() => {
    if (undoGuardRef.current) return;
    undoGuardRef.current = true;
    Promise.resolve().then(() => { undoGuardRef.current = false; });

    const snapshot: UndoSnapshot = {
      gameState: JSON.parse(JSON.stringify(persistedStateRef.current)),
      transient: JSON.parse(JSON.stringify(transientStateRef.current)),
    };
    const stack = undoStackRef.current;
    stack.push(snapshot);
    if (stack.length > MAX_UNDO_STACK) {
      stack.splice(0, stack.length - MAX_UNDO_STACK);
    }
    setUndoCount(stack.length);
    saveUndoStack(stack);
  }, []);

  const clearUndoStack = useCallback(() => {
    undoStackRef.current = [];
    setUndoCount(0);
    clearUndoStorage();
  }, []);

  /** Per-card discard hooks (弃牌获利、卡牌 onDiscardDamage、雷霆符印等)，与是否进墓地/回收袋无关 */
  const applyDiscardSideEffects = useCallback(
    (card: GameCardData, owner: 'player' | 'dungeon') => {
      if (owner === 'player' && selectedHeroSkillRef.current === 'discard-profit') {
        setGold(prev => prev + 2);
        addGameLog('gold', `弃牌获利：弃置「${card.name}」获得 2 金币`);
      }
      if (owner === 'player' && card.type === 'magic' && card.magicEffect === 'honor-blood') {
        const monsters = flattenActiveRowSlots(activeCards).filter(
          (c): c is GameCardData => Boolean(c && c.type === 'monster'),
        );
        if (monsters.length > 0) {
          clearUndoStack();
          const honorDiscardDmg = getSpellDamage(1);
          monsters.forEach((monster, index) => {
            if (!isMonsterEngaged(monster.id)) {
              beginCombat(monster, 'hero');
            }
            const animationDelay = index * Math.floor(COMBAT_ANIMATION_STAGGER * 0.75);
            dealDamageToMonster(monster, honorDiscardDmg, { animationDelay, pulses: 1 });
          });
          addGameLog('magic', `${card.name} 被弃：对激活行每只怪物造成 ${honorDiscardDmg} 点伤害`);
          setHeroSkillBanner(`${card.name} 被弃，对场上每只怪物造成 ${honorDiscardDmg} 点伤害！`);
        }
      } else if (card.onDiscardDamage) {
        const monsters = flattenActiveRowSlots(activeCards).filter(
          (c): c is GameCardData => Boolean(c && c.type === 'monster'),
        );
        if (monsters.length > 0) {
          clearUndoStack();
          const target = monsters[Math.floor(Math.random() * monsters.length)];
          const dmg = getSpellDamage(card.onDiscardDamage);
          dealDamageToMonster(target, dmg, { pulses: 2 });
          addGameLog('magic', `${card.name} 被弃：对 ${target.name} 造成 ${dmg} 点法术伤害`);
          setHeroSkillBanner(`${card.name} 被弃，对 ${target.name} 造成了 ${dmg} 点伤害！`);
        }
      }
      if (owner === 'player' && card.onDiscardDraw && card.onDiscardDraw > 0) {
        const drawCount = card.onDiscardDraw;
        const drawnNames: string[] = [];
        for (let i = 0; i < drawCount; i++) {
          const drawn = drawFromBackpackToHand();
          if (drawn) drawnNames.push(drawn.name);
        }
        if (drawnNames.length > 0) {
          addGameLog('magic', `${card.name} 被弃：从背包抽取了 ${drawnNames.join('、')}`);
          setHeroSkillBanner(`${card.name} 被弃，抽取了 ${drawnNames.join('、')}！`);
        } else {
          addGameLog('magic', `${card.name} 被弃：背包为空，未能抽牌`);
        }
      }
      triggerDiscardShock();
    },
    [
      activeCards,
      addGameLog,
      beginCombat,
      clearUndoStack,
      dealDamageToMonster,
      drawFromBackpackToHand,
      getSpellDamage,
      isMonsterEngaged,
      setGold,
      setHeroSkillBanner,
      triggerDiscardShock,
    ],
  );

  const handleUndo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    if (fullBoardInteractionLockedRef.current) return;
    const entry = stack.pop()!;
    setUndoCount(stack.length);
    saveUndoStack(stack);

    // Cancel any in-progress waterfall animations
    clearWaterfallTimeouts();
    waterfallPlanRef.current = null;
    waterfallTimeoutsRef.current = [];
    waterfallLockRef.current = false;
    waterfallPendingRef.current = false;
    setWaterfallAnimation(initialWaterfallAnimationState);

    // Cancel all in-flight combat animation timeouts
    animationDelayTimeoutsRef.current.forEach(id => clearTimeout(id));
    animationDelayTimeoutsRef.current = [];
    if (heroBleedTimeoutRef.current) {
      clearTimeout(heroBleedTimeoutRef.current);
      heroBleedTimeoutRef.current = null;
    }
    for (const timeouts of Object.values(monsterBleedTimeoutsRef.current)) {
      timeouts.forEach(id => clearTimeout(id));
    }
    monsterBleedTimeoutsRef.current = {};
    for (const timeouts of Object.values(weaponSwingTimeoutsRef.current)) {
      timeouts.forEach(id => clearTimeout(id));
    }
    weaponSwingTimeoutsRef.current = { equipmentSlot1: [], equipmentSlot2: [] };
    for (const timeouts of Object.values(shieldBlockTimeoutsRef.current)) {
      timeouts.forEach(id => clearTimeout(id));
    }
    shieldBlockTimeoutsRef.current = { equipmentSlot1: [], equipmentSlot2: [] };

    if (discardShockFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(discardShockFlightAnimationRef.current);
      discardShockFlightAnimationRef.current = null;
    }
    if (directedCombatFxFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(directedCombatFxFlightAnimationRef.current);
      directedCombatFxFlightAnimationRef.current = null;
    }
    directedCombatFxFlightsRef.current = [];
    setDirectedCombatFxFlights([]);
    directedCombatFxElementMapRef.current.clear();
    discardShockFlightsRef.current = [];
    discardShockElementMapRef.current.clear();
    setDiscardShockFlights([]);
    discardShockProcQueueRef.current = [];
    discardShockSeqInFlightRef.current = false;
    setDiscardShockInteractionLocked(false);

    // Reset visual animation states
    setHeroBleedActive(false);
    setMonsterBleedStates({});
    setWeaponSwingStates({ equipmentSlot1: 0, equipmentSlot2: 0 });
    setShieldBlockStates({ equipmentSlot1: 0, equipmentSlot2: 0 });
    setRemovingCards(new Set());
    setMonsterDefeatStates({});

    // Clear stale tracking refs
    storingCardIdsRef.current.clear();
    pendingAutoDrawsRef.current = 0;
    skipNextEventAutoDrawRef.current = false;
    skipEventFlipRef.current = false;
    heroTurnLayerLossIdsRef.current.clear();
    pendingDefeatIdsRef.current.clear();

    // Close UI-only modals that aren't part of the snapshot
    setBackpackViewerOpen(false);
    setDeckViewerOpen(false);
    setDetailsModalOpen(false);
    setHeroDetailsOpen(false);
    setEventDiceModal(null);

    // Restore transient state from snapshot
    const t = entry.transient;
    setMonsterRewardQueue(t.monsterRewardQueue);
    setActiveMonsterReward(t.activeMonsterReward);
    syncMonsterRewardQueuedInstanceIdsRef(t.monsterRewardQueue ?? [], t.activeMonsterReward ?? null);
    setSelectedMonsterRewards(t.selectedMonsterRewards);
    setPendingMagicAction(t.pendingMagicAction);
    setPendingPotionAction(t.pendingPotionAction);
    setPendingHeroSkillAction(t.pendingHeroSkillAction);
    setPendingHeroMagicAction(t.pendingHeroMagicAction);
    setShopModalOpen(t.shopModalOpen);
    setShopModalMinimized(t.shopModalMinimized);
    setShopOfferings(t.shopOfferings);
    setShopSourceEvent(t.shopSourceEvent);
    setShopDeleteUsed(t.shopDeleteUsed);
    setShopHealUsed(t.shopHealUsed);
    setShopLevelUpUsed(t.shopLevelUpUsed);
    setShopSkillDiscoverUsed(t.shopSkillDiscoverUsed);
    setShopSkillSelectOpen(t.shopSkillSelectOpen);
    setShopSkillOptions(t.shopSkillOptions);
    setDiscoverModalOpen(t.discoverModalOpen);
    setDiscoverOptions(t.discoverOptions);
    setDeleteModalOpen(t.deleteModalOpen);
    setDeathWardPrompt(t.deathWardPrompt);
    setEquipmentPrompt(t.equipmentPrompt);
    setGraveyardDiscoverState(t.graveyardDiscoverState);
    if (t.graveyardDiscoverState && t.activeMonsterReward) {
      const doneId = t.activeMonsterReward.monsterInstanceId;
      graveyardDiscoverResolverRef.current = () => {
        if (doneId) monsterRewardQueuedInstanceIdsRef.current.delete(doneId);
        setActiveMonsterReward(null);
      };
    }
    setCardActionContext(t.cardActionContext);
    cardActionRemainingRef.current = t.cardActionContext?.remainingCount ?? 0;
    deletingCardIdsRef.current.clear();
    setGameLogEntries(t.gameLogEntries);
    monsterRewardPreviewCacheRef.current = t.monsterRewardPreviewCache;

    // Restore core game state
    hydrateGameState(entry.gameState);
  }, [clearWaterfallTimeouts, syncMonsterRewardQueuedInstanceIdsRef]);

  const handleNewGame = () => {
    clearGameState();
    lastPersistedStateRef.current = null;
    clearUndoStack();
    clearGameLog();
    initGame();
    setIsHydrated(true);
  };

  // Handle skill selection
  const handleSkillSelection = (skillId: string) => {
    resetHeroSkillForNewWave();
    const definition = getHeroSkillById(skillId as HeroSkillId);
    setSelectedHeroSkill(skillId);
    setShowSkillSelection(false);
    addGameLog('system', `选择英雄技能：${definition?.name ?? skillId}`);
    
    const initialBonus = definition?.initialMaxHpBonus ?? 0;
    if (initialBonus) {
      addGameLog('system', `开局加成：最大生命 +${initialBonus}`);
      // 巨人心力等：仅此开局天赋在抬上限的同时视为满血（战利品/事件等只加上限不回血）
      setHp(INITIAL_HP + initialBonus);
    }
    const initialGold = definition?.initialGoldBonus ?? 0;
    if (initialGold) {
      setGold(prev => prev + initialGold);
      addGameLog('gold', `开局加成：金币 +${initialGold}`);
    }
    const initialWaterfall = definition?.initialWaterfallBonus ?? 0;
    if (initialWaterfall) {
      setTurnCount(prev => prev + initialWaterfall);
      addGameLog('system', `开局加成：瀑流回合 +${initialWaterfall}`);
    }
    const initialDraw = definition?.initialClassCardDraw ?? 0;
    if (initialDraw) {
      const drawn = drawClassCardsToBackpack(initialDraw, 'early-surge');
      if (drawn.length > 0) {
        addGameLog('skill', `开局加成：预抽 ${drawn.length} 张职业牌`);
        triggerClassDeckFlight(drawn);
      }
    }
    const initialShopLv = definition?.initialShopLevel;
    if (initialShopLv != null && initialShopLv > 0) {
      setShopLevel(Math.min(MAX_SHOP_LEVEL, initialShopLv));
      addGameLog('shop', `开局加成：商店等级 ${Math.min(MAX_SHOP_LEVEL, initialShopLv)}`);
    }
    const initialBackpackCap = definition?.initialBackpackCapacityBonus ?? 0;
    if (initialBackpackCap) {
      setBackpackCapacityModifier(prev => prev + initialBackpackCap);
      addGameLog('skill', `开局加成：背包上限 +${initialBackpackCap}`);
    }
    // 开局天赋的手牌加成必须覆盖旧值，不能叠在存档/上一局残留的 handLimitBonus 上
    const initialHandLimit = definition?.initialHandLimitBonus ?? 0;
    setHandLimitBonus(initialHandLimit);
    if (initialHandLimit) {
      addGameLog('skill', `开局加成：手牌上限 +${initialHandLimit}`);
    }
    const initialSpellDmg = definition?.initialSpellDamageBonus ?? 0;
    if (initialSpellDmg) {
      setPermanentSpellDamageBonus(prev => prev + initialSpellDmg);
      addGameLog('skill', `开局加成：永久法术伤害 +${initialSpellDmg}`);
    }
    const initialHandDraw = definition?.initialHandDraw ?? 0;
    if (initialHandDraw) {
      for (let i = 0; i < initialHandDraw; i++) {
        const drawn = drawFromBackpackToHand();
        if (drawn) addGameLog('skill', `开局加成：抽到手牌「${drawn.name}」`);
      }
    }
    if (skillId === 'summon-minion') {
      const minionCard: GameCardData = {
        id: 'summon-minion-card',
        type: 'monster',
        name: '小随从',
        value: 1,
        attack: 1,
        hp: 1,
        hpLayers: 4,
        fury: 4,
        currentLayer: 4,
        maxHp: 1,
        image: minionImage,
        description: '忠诚的小随从，可装备。每击杀一只怪物，攻击 +1、防御 +1。',
        isMinionCard: true,
      };
      addCardToBackpack(minionCard);
      addGameLog('skill', '开局加成：获得小随从');
    }
    if (skillId === 'heal-to-damage') {
      addCardToBackpack(createStarterHealEchoCard());
      addGameLog('skill', '愈战愈勇：开局获得永久魔法「治愈余韵」');
    }
    if (skillId === 'shield-wall') {
      const thunderSeal = classDeck.find(
        c => c.type === 'amulet' && (c as GameCardData).amuletEffect === 'discard-zap',
      );

      const starterShield: GameCardData = {
        id: STARTER_CARD_IDS.shieldWallStarter,
        type: 'shield',
        name: '新手圆盾',
        value: 2,
        image: woodenShieldImage,
        durability: 2,
        maxDurability: 2,
      };
      setBackpackItems(prev => {
        let next = prev.filter(c => c.id !== STARTER_CARD_IDS.weaponBurst);
        if (next.some(c => c.id === STARTER_CARD_IDS.trainingBlade)) {
          next = next.map(c => (c.id === STARTER_CARD_IDS.trainingBlade ? starterShield : c));
        }
        return next;
      });

      if (thunderSeal) {
        setClassDeck(prev => prev.filter(c => c.id !== thunderSeal.id));
        addCardToBackpack(thunderSeal);
        triggerClassDeckFlight([thunderSeal]);
      }

      addGameLog(
        'skill',
        thunderSeal
          ? '雷盾心法：已移除「战斗鼓舞」；「新手短剑」已替换为 2 护甲、2 耐久的护盾；已从职业牌堆将「雷霆符印」放入背包。'
          : '雷盾心法：已移除「战斗鼓舞」；「新手短剑」已替换为 2 护甲、2 耐久的护盾。',
      );
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
    if (!slotItem || (slotItem.type !== 'shield' && slotItem.type !== 'monster')) {
      return 0;
    }
    const baseArmor = slotItem.type === 'monster' ? (slotItem.hp ?? slotItem.value) : slotItem.value;
    const slotShieldBonus = getEquipmentSlotBonus(slotId, 'shield');
    const balanceBonus = amuletEffects.hasBalance && slotId === 'equipmentSlot2' ? BALANCE_SHIELD_BONUS : 0;
    const balanceShieldPenalty = amuletEffects.hasBalance && slotId === 'equipmentSlot1' ? BALANCE_SHIELD_PENALTY : 0;
    return Math.max(0, baseArmor + defenseBonus + slotShieldBonus + balanceBonus - balanceShieldPenalty);
  };

  const getEquipmentSlotStatModifier = (slotId: EquipmentSlotId): EquipmentSlotStatModifier | null => {
    const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
    if (!slotItem) {
      return null;
    }

    if (slotItem.type === 'weapon') {
      const slotDamageBonus = getEquipmentSlotBonus(slotId, 'damage');
      const slotBurstBonus = slotAttackBursts[slotId] ?? 0;
      const slotBerserkBonus = berserkTurnBuff[slotId] ?? 0;
      const balanceBonus =
        amuletEffects.hasBalance && slotId === 'equipmentSlot1' ? BALANCE_ATTACK_BONUS : 0;
      const balancePenalty =
        amuletEffects.hasBalance && slotId === 'equipmentSlot2' ? BALANCE_ATTACK_PENALTY : 0;
      const flashPenalty = amuletEffects.hasFlash ? FLASH_ATTACK_PENALTY : 0;
      const modifier =
        attackBonus +
        slotDamageBonus +
        nextWeaponBonus +
        slotBurstBonus +
        slotBerserkBonus +
        balanceBonus -
        balancePenalty -
        flashPenalty;

      return {
        appliesTo: 'weapon',
        modifier,
      };
    }

    if (slotItem.type === 'shield') {
      const slotShieldBonus = getEquipmentSlotBonus(slotId, 'shield');
      const balanceBonus =
        amuletEffects.hasBalance && slotId === 'equipmentSlot2' ? BALANCE_SHIELD_BONUS : 0;
      const balancePenalty =
        amuletEffects.hasBalance && slotId === 'equipmentSlot1' ? BALANCE_SHIELD_PENALTY : 0;
      const modifier = defenseBonus + slotShieldBonus + balanceBonus - balancePenalty;

      return {
        appliesTo: 'shield',
        modifier,
      };
    }

    if (slotItem.type === 'monster') {
      const slotDamageBonus = getEquipmentSlotBonus(slotId, 'damage');
      const slotBurstBonus = slotAttackBursts[slotId] ?? 0;
      const slotBerserkBonus = berserkTurnBuff[slotId] ?? 0;
      const balanceAttackBonus =
        amuletEffects.hasBalance && slotId === 'equipmentSlot1' ? BALANCE_ATTACK_BONUS : 0;
      const balanceAttackPenalty =
        amuletEffects.hasBalance && slotId === 'equipmentSlot2' ? BALANCE_ATTACK_PENALTY : 0;
      const flashPenalty = amuletEffects.hasFlash ? FLASH_ATTACK_PENALTY : 0;
      const modifier =
        attackBonus +
        slotDamageBonus +
        nextWeaponBonus +
        slotBurstBonus +
        slotBerserkBonus +
        balanceAttackBonus -
        balanceAttackPenalty -
        flashPenalty;

      const slotShieldBonus = getEquipmentSlotBonus(slotId, 'shield');
      const balanceShieldBonus =
        amuletEffects.hasBalance && slotId === 'equipmentSlot2' ? BALANCE_SHIELD_BONUS : 0;
      const balanceShieldPenalty =
        amuletEffects.hasBalance && slotId === 'equipmentSlot1' ? BALANCE_SHIELD_PENALTY : 0;
      const shieldModifier = defenseBonus + slotShieldBonus + balanceShieldBonus - balanceShieldPenalty;

      return {
        appliesTo: 'monster' as const,
        modifier,
        shieldModifier,
      };
    }

    return null;
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

  const applyBulwarkPassiveShieldIncrement = () => {
    const slots: EquipmentSlotId[] = ['equipmentSlot1', 'equipmentSlot2'];
    const slot = slots[Math.floor(Math.random() * slots.length)]!;
    setEquipmentSlotBonus(slot, 'shield', cur => cur + 1);
    const label = slot === 'equipmentSlot1' ? '左' : '右';
    addGameLog('magic', `壁垒猛击被动：随机加到${label}装备栏，永久护甲 +1`);
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
    return Boolean(slotItem && (slotItem.type === 'shield' || slotItem.type === 'monster'));
  };

  const setEquipmentSlotById = (id: EquipmentSlotId, item: EquipmentItem | null) => {
    const itemWithSlot = item ? { ...item, fromSlot: id } : null;
    if (id === 'equipmentSlot1') setEquipmentSlot1(itemWithSlot);
    else setEquipmentSlot2(itemWithSlot);
  };

  const clearEquipmentSlotById = (id: EquipmentSlotId) => setEquipmentSlotById(id, null);

  const clearEquipmentSlotWithPromote = (id: EquipmentSlotId) => {
    const reserve = id === 'equipmentSlot1' ? equipmentSlot1Reserve : equipmentSlot2Reserve;
    if (reserve.length > 0) {
      const promoted = reserve[reserve.length - 1];
      setEquipmentSlotById(id, promoted);
      setEquipmentReserve(id, reserve.slice(0, -1));
    } else {
      clearEquipmentSlotById(id);
    }
  };

  const getEquipmentReserve = (id: EquipmentSlotId) =>
    id === 'equipmentSlot1' ? equipmentSlot1Reserve : equipmentSlot2Reserve;

  const setEquipmentReserve = (id: EquipmentSlotId, items: EquipmentItem[]) => {
    if (id === 'equipmentSlot1') setEquipmentSlot1Reserve(items);
    else setEquipmentSlot2Reserve(items);
  };

  const swapEquipmentToTop = (slotId: EquipmentSlotId, reserveIndex: number) => {
    pushUndoSnapshot();
    const slotSetter = slotId === 'equipmentSlot1' ? setEquipmentSlot1 : setEquipmentSlot2;
    const reserveSetter = slotId === 'equipmentSlot1' ? setEquipmentSlot1Reserve : setEquipmentSlot2Reserve;
    let swappedInName = '';
    let swappedOutName = '';

    reserveSetter(prevReserve => {
      if (reserveIndex < 0 || reserveIndex >= prevReserve.length) return prevReserve;
      const promoted = prevReserve[reserveIndex];
      swappedInName = promoted.name;
      const updatedReserve = [...prevReserve];
      updatedReserve.splice(reserveIndex, 1);

      slotSetter(prevActive => {
        swappedOutName = prevActive?.name ?? '空槽';
        if (prevActive) {
          updatedReserve.push(prevActive);
        }
        return { ...promoted, fromSlot: slotId } as EquipmentItem;
      });

      return updatedReserve;
    });

    addGameLog('equip', `装备切换：${swappedInName} 替换 ${swappedOutName}（${slotId === 'equipmentSlot1' ? '左' : '右'}槽）`);
  };

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
        } else if (requirement.type === 'gold') {
          if (gold < requirement.min) {
            return {
              disabled: true,
              reason: requirement.message ?? `需要至少 ${requirement.min} 金币`,
            };
          }
        } else if (requirement.type === 'leftmostIsEnraged') {
          const leftmostCard = activeCards.find(c => c != null);
          const isEnragedMonster = leftmostCard &&
            leftmostCard.type === 'monster' &&
            isMonsterEngaged(leftmostCard.id);
          if (!isEnragedMonster) {
            return { disabled: true, reason: requirement.message ?? '需要最左边的卡牌是一个激怒的怪物' };
          }
        }
      }
      return { disabled: false };
    },
    [activeCards, amuletSlots.length, backpackItems.length, combatState.engagedMonsterIds, discardedCards.length, equipmentSlot1, equipmentSlot2, gold, handCards.length, resolvingDungeonCardId],
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
      if (slot.item?.type === 'weapon' || slot.item?.type === 'monster') return slot as { id: EquipmentSlotId; item: EquipmentItem };
    }
    return null;
  };

  const findShieldSlot = (): { id: EquipmentSlotId; item: EquipmentItem } | null => {
    for (const slot of getEquipmentSlots()) {
      if (slot.item?.type === 'shield' || slot.item?.type === 'monster') return slot as { id: EquipmentSlotId; item: EquipmentItem };
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
          addGameLog('system', '胜利！地牢已被征服！');
          setVictory(true);
          setGameOver(true);
          setActiveCards(createEmptyActiveRow());
          setCardsPlayed(0);
          setDrawPending(false);
          return prevRemaining;
        }

        const newCards = prevRemaining.slice(0, cardsToDraw);
        if (newCards.length > 0) {
          addGameLog('deck', `翻开 ${newCards.length} 张地牢牌：${newCards.map(c => c.name).join('、')}`);
        }
        const nextSlots = createEmptyActiveRow();
        const drawSpawnTurn = turnCount;

        if (carriedSlot) {
          const targetIndex = carriedSlot.index >= 0 ? carriedSlot.index : 0;
          nextSlots[targetIndex] = carriedSlot.card;
        }

        let insertIndex = 0;
        for (let col = 0; col < DUNGEON_COLUMN_COUNT; col++) {
          if (!nextSlots[col] && insertIndex < newCards.length) {
            nextSlots[col] = applyMonsterRage(newCards[insertIndex++], drawSpawnTurn);
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          sessionId:'debug-session',
          runId:'run3',
          hypothesisId:'M',
          location:'GameBoard.tsx:addToGraveyard',
          message:'Added to graveyard',
          data:{
            cardId:sanitized.id,
            cardType:sanitized.type,
            prevSize:prev.length,
            nextSize:prev.length + 1
          },
          timestamp:Date.now()
        })
      }).catch(()=>{});
      // #endregion
      const next = [...prev, sanitized];
      discardedCardsRef.current = next;
      return next;
    });
    addGameLog('deck', `「${card.name}」→ 坟场`);
  }

  /**
   * 装备离场统一入口。
   * - 挤位、主动弃置等 → 视同弃置，触发弃牌获利 / onDiscardDamage / 雷霆符印。
   * - 耐久归零毁坏 → 不算弃置，仅进坟场/回收袋，不触发弃置副作用。
   */
  function disposeOwnedEquipmentCard(card: GameCardData, options?: { isDestruction?: boolean }) {
    if (isPermRecycleEquipment(card)) {
      addPermanentMagicToRecycleBag(card);
    } else {
      addToGraveyard(card);
    }
    if (!options?.isDestruction) {
      applyDiscardSideEffects(card, 'player');
    }
  }

  const discardCardToGraveyard = useCallback(
    (card: GameCardData | null | undefined, options?: { owner?: 'player' | 'dungeon'; forceGraveyard?: boolean }) => {
      if (!card) {
        return;
      }
      const owner = options?.owner ?? 'dungeon';
      const isGraveNovaCard =
        (card as KnightCardData | undefined)?.knightEffect === 'grave-nova';
      if (owner === 'player' && isGraveNovaCard) {
        triggerGraveNova();
        addPermanentMagicToRecycleBag(card);
      } else if (!options?.forceGraveyard && isRecyclableFromHand(card) && card.type !== 'amulet') {
        addPermanentMagicToRecycleBag(card);
      } else {
        addToGraveyard(card);
      }
      applyDiscardSideEffects(card, owner);
    },
    [addPermanentMagicToRecycleBag, addToGraveyard, applyDiscardSideEffects, triggerGraveNova],
  );

  const createCurseCard = (sourceCard?: GameCardData): GameCardData => ({
    id: `curse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'magic',
    name: '血咒之印',
    value: 0,
    image: sourceCard?.image ?? eventScrollImage,
    description: '永久魔法：使用和弃置时，都失去 3 点生命值。',
    magicType: 'permanent',
    magicEffect: 'curse',
    isCurse: true,
  });

  const addCardToBackpack = useCallback(
    (card: GameCardData, options?: { toBottom?: boolean; pendingDungeonCardId?: string }) => {
      const sanitized = { ...card };
      if (options?.pendingDungeonCardId) {
        storingCardIdsRef.current.add(options.pendingDungeonCardId);
        logBackpackDraw('backpack-store-pending', {
          cardId: options.pendingDungeonCardId,
          pending: storingCardIdsRef.current.size,
        });
      }
      const eager = options?.toBottom
        ? [...backpackItemsRef.current, sanitized]
        : [sanitized, ...backpackItemsRef.current];
      backpackItemsRef.current = eager.length <= backpackCapacity
        ? eager
        : eager.slice(0, backpackCapacity);
      setBackpackItems(prev => {
        const next = options?.toBottom ? [...prev, sanitized] : [sanitized, ...prev];
        let finalList: GameCardData[];
        if (next.length <= backpackCapacity) {
          finalList = next;
        } else {
          const kept = next.slice(0, backpackCapacity);
          next.slice(backpackCapacity).forEach(overflowCard => addToGraveyard(overflowCard));
          finalList = kept;
        }
        backpackItemsRef.current = finalList;
        logBackpackDraw('backpack-add', {
          cardId: sanitized.id,
          fromDungeon: Boolean(options?.pendingDungeonCardId),
          toBottom: Boolean(options?.toBottom),
          prevLength: prev.length,
          nextLength: finalList.length,
          overflow: Math.max(0, next.length - finalList.length),
        });
        return finalList;
      });
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

  useEffect(() => {
    backpackItemsRef.current = backpackItems;
  }, [backpackItems]);

  useEffect(() => {
    discardedCardsRef.current = discardedCards;
  }, [discardedCards]);

  useEffect(() => {
    handCardsRef.current = handCards;
  }, [handCards]);

  const triggerEventTransform = useCallback(
    (fromCard: GameCardData, toCard: GameCardData, message?: string) =>
      new Promise<void>(resolve => {
        setEventTransformState({
          fromCard,
          toCard,
          message,
          onComplete: () => {
            resolve();
            setEventTransformState(null);
          },
        });
      }),
    [],
  );

  const applyCardFlip = useCallback(
    async (card: GameCardData, cellIndex?: number): Promise<boolean> => {
      const flip = card.flipTarget;
      if (!flip) return false;

      const destination = flip.destination ?? 'graveyard';
      addGameLog('event', `卡牌转化：${card.name} → ${flip.toCard.name}`);
      await triggerEventTransform(card, flip.toCard, flip.message);
      if (flip.banner) {
        setHeroSkillBanner(flip.banner);
      }

      if (destination === 'stay') {
        const idx = cellIndex ?? activeCards.findIndex(c => c?.id === card.id);
        if (idx !== -1) {
          const cardWithFlip: GameCardData = { ...card };
          const placedCard: GameCardData = {
            ...flip.toCard,
            _flipBackCard: cardWithFlip,
            ...(flip.toCard.isPermanentEvent ? { hasReleaseCharge: true, _fateBladeLastSlot: idx } : {}),
          };
          setActiveCards(prev => {
            const next = [...prev];
            next[idx] = placedCard;
            return next;
          });
        }
      } else if (destination === 'backpack') {
        addCardToBackpack(flip.toCard);
      } else if (destination === 'hand') {
        ensureCardInHand(flip.toCard);
      } else {
        addToGraveyard(flip.toCard);
      }

      if (amuletEffects.hasFlipGold) {
        setGold(prev => prev + FLIP_GOLD_REWARD);
        addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
      }

      return true;
    },
    [activeCards, addCardToBackpack, addGameLog, addToGraveyard, amuletEffects.hasFlipGold, ensureCardInHand, setHeroSkillBanner, triggerEventTransform],
  );

  const sacrificeEquipment = useCallback(
    (slotId: EquipmentSlotId): boolean => {
      const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (!slotItem) {
        return false;
      }
      if (isPermRecycleEquipment(slotItem)) {
        addPermanentMagicToRecycleBag(slotItem);
      } else {
        addToGraveyard(slotItem);
      }
      const reserve = slotId === 'equipmentSlot1' ? equipmentSlot1Reserve : equipmentSlot2Reserve;
      if (reserve.length > 0) {
        const promoted = reserve[reserve.length - 1];
        setEquipmentSlotById(slotId, promoted);
        setEquipmentReserve(slotId, reserve.slice(0, -1));
      } else {
        clearEquipmentSlotById(slotId);
      }
      return true;
    },
    [
      addPermanentMagicToRecycleBag,
      addToGraveyard,
      clearEquipmentSlotById,
      equipmentSlot1,
      equipmentSlot2,
      equipmentSlot1Reserve,
      equipmentSlot2Reserve,
    ],
  );

  const swapEquipmentSlots = useCallback(() => {
    const left = equipmentSlot1;
    const right = equipmentSlot2;
    setEquipmentSlotById('equipmentSlot1', right ? { ...right } : null);
    setEquipmentSlotById('equipmentSlot2', left ? { ...left } : null);
    const leftRes = [...equipmentSlot1Reserve];
    const rightRes = [...equipmentSlot2Reserve];
    setEquipmentSlot1Reserve(rightRes);
    setEquipmentSlot2Reserve(leftRes);
  }, [equipmentSlot1, equipmentSlot2, equipmentSlot1Reserve, equipmentSlot2Reserve]);

  const convertAmuletsToGold = useCallback(
    (amountPer: number) => {
      if (!amuletSlots.length) return 0;
      const payout = amountPer * amuletSlots.length;
      addGameLog('amulet', `${amuletSlots.length} 枚护符转化为 ${payout} 金币`);
      amuletSlots.forEach(amulet => addToGraveyard(amulet));
      setAmuletSlots([]);
      setGold(prev => prev + payout);
      return payout;
    },
    [addGameLog, addToGraveyard, amuletSlots, setAmuletSlots, setGold],
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
      setBackpackItems(prev => {
        const next = [...cards, ...prev];
        if (next.length <= backpackCapacity) return next;
        next.slice(backpackCapacity).forEach(c => addToGraveyard(c));
        return next.slice(0, backpackCapacity);
      });
      addGameLog('skill', `从职业牌组底部获得 ${takeCount} 张牌：${cards.map(c => c.name).join('、')}`);
      triggerClassDeckFlight(cards);
      return cards;
    },
    [addGameLog, addToGraveyard, backpackCapacity, backpackItems.length, classDeck, setBackpackItems, setClassDeck, triggerClassDeckFlight],
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
        addGameLog('system', '胜利！地牢已被征服！');
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
      discardDestination: 'graveyard',
      dealingSlots: plan.nextPreviewCards.map((_, idx) => idx),
      sequenceId: prev.sequenceId,
    }));

    setPreviewCards(fillActiveRowSlots(plan.nextPreviewCards).map(card =>
      card ? applyMonsterRage(card, turnCount + 1) : null,
    ) as ActiveRowSlots);

    logWaterfall('deal-start', {
      nextPreviewCount: plan.nextPreviewCards.length,
      shouldDeclareVictory: plan.shouldDeclareVictory,
    });

    queueWaterfallTimeout(() => {
      resetWaterfallAnimation();
    }, animSpeed(WATERFALL_DEAL_DURATION), 'deal-phase-complete');
  };

  const handleWaterfallDiscardComplete = () => {
    const plan = waterfallPlanRef.current;
    if (!plan) {
      resetWaterfallAnimation();
      return;
    }

    if (plan.discardCard) {
      const previewCol =
        plan.discardPreviewIndex != null ? String(plan.discardPreviewIndex + 1) : '?';
      addGameLog(
        'waterfall',
        `瀑流挤掉：「${plan.discardCard.name}」（预览第 ${previewCol} 列 · ${plan.discardCard.type}）`,
      );
      /** 尚未变身 Boss 的「最终之敌」被挤出时不进坟场，置于 remaining 牌堆底（不打乱牌序） */
      const tryReturnFinalMonsterPrecursorToDeck = (card: GameCardData): boolean => {
        if (card.type !== 'monster' || !card.isFinalMonster || card.bossPhase) {
          return false;
        }
        addGameLog('waterfall', `${card.name}（最终之敌）被挤出，置于牌堆底以待决战`);
        plan.nextRemainingDeck.push(card);
        setHeroSkillBanner(`${card.name} 隐入牌堆……终局之战尚未到来。`);
        return true;
      };
      const waterfallDiscardToGraveyardUnlessFinal = (card: GameCardData) => {
        if (!tryReturnFinalMonsterPrecursorToDeck(card)) {
          addToGraveyard(card);
        }
      };
      const wfx = plan.discardCard.waterfallEffect;
      if (wfx && (plan.discardCard.type === 'monster' || plan.discardCard.type === 'event')) {
        const cardName = plan.discardCard.name;
        switch (wfx.type) {
          case 'returnToDeck': {
            const back = plan.discardCard!;
            const isWraith = back.type === 'monster' && back.monsterType === 'Wraith';
            if (isWraith) {
              const insertIdx = Math.floor(Math.random() * (plan.nextRemainingDeck.length + 1));
              plan.nextRemainingDeck.splice(insertIdx, 0, back);
              addGameLog('waterfall', `${cardName} 化为幽影，随机回到剩余牌堆某处`);
              setHeroSkillBanner(`${cardName} 化为幽影，消散在牌堆深处……`);
            } else {
              addGameLog('waterfall', `${cardName} 化为幽影，置于牌堆底`);
              plan.nextRemainingDeck.push(back);
              setHeroSkillBanner(`${cardName} 化为幽影，置于牌堆底。`);
            }
            break;
          }
          case 'bonusDecay':
            addGameLog('waterfall', `${cardName} 诅咒削弱装备/法术加成 -${wfx.amount}`);
            (['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]).forEach(slotId => {
              (['damage', 'shield'] as (keyof SlotPermanentBonus)[]).forEach(bonusType => {
                setEquipmentSlotBonus(slotId, bonusType, v => v - wfx.amount);
              });
            });
            setPermanentSpellDamageBonus(prev => prev - wfx.amount);
            setHeroSkillBanner(`${cardName} 的诅咒削弱了你的装备与法术加成！`);
            waterfallDiscardToGraveyardUnlessFinal(plan.discardCard);
            break;
          case 'goldLoss':
            addGameLog('waterfall', `${cardName} 偷走 ${wfx.amount} 金币`);
            setGold(prev => Math.max(0, prev - wfx.amount));
            setHeroSkillBanner(`${cardName} 逃跑时偷走了 ${wfx.amount} 金币！`);
            waterfallDiscardToGraveyardUnlessFinal(plan.discardCard);
            break;
          case 'damage':
            addGameLog('waterfall', `${cardName} 临死反扑，造成 ${wfx.amount} 点伤害`);
            applyDamage(wfx.amount);
            setHeroSkillBanner(`${cardName} 临死反扑，造成 ${wfx.amount} 点伤害！`);
            waterfallDiscardToGraveyardUnlessFinal(plan.discardCard);
            break;
          case 'turnBoost':
            addGameLog('waterfall', `${cardName} 龙息加速 waterfall +${wfx.amount}`);
            setTurnCount(prev => prev + wfx.amount);
            for (let bi = 0; bi < bulwarkPassiveRef.current; bi++) {
              applyBulwarkPassiveShieldIncrement();
            }
            setHeroSkillBanner(`${cardName} 的龙息加速了 waterfall 进程 +${wfx.amount}！`);
            waterfallDiscardToGraveyardUnlessFinal(plan.discardCard);
            break;
          case 'boostRowMonsterAttack': {
            const boost = wfx.amount;
            const boosted: string[] = [];
            setActiveCards(prev =>
              prev.map(card => {
                if (card?.type === 'monster') {
                  boosted.push(card.name);
                  return { ...card, attack: (card.attack ?? card.value ?? 0) + boost, value: (card.value ?? 0) + boost };
                }
                return card;
              }) as ActiveRowSlots,
            );
            if (boosted.length > 0) {
              addGameLog('waterfall', `${cardName} 被挤出，所有怪物攻击 +${boost}：${boosted.join('、')}`);
              setHeroSkillBanner(`${cardName} 的血咒强化了所有怪物！攻击 +${boost}！`);
            } else {
              addGameLog('waterfall', `${cardName} 被挤出，但没有怪物可强化。`);
            }
            waterfallDiscardToGraveyardUnlessFinal(plan.discardCard);
            break;
          }
          case 'destroyAllEquipment': {
            const destroyed: string[] = [];
            (['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]).forEach(slotId => {
              const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
              if (slotItem) {
                destroyed.push(slotItem.name);
                disposeOwnedEquipmentCard({ ...slotItem }, { isDestruction: true });
              }
              const reserve = slotId === 'equipmentSlot1' ? equipmentSlot1Reserve : equipmentSlot2Reserve;
              reserve.forEach(r => {
                destroyed.push(r.name);
                disposeOwnedEquipmentCard({ ...r }, { isDestruction: true });
              });
              clearEquipmentSlotById(slotId);
              setEquipmentReserve(slotId, []);
            });
            if (destroyed.length > 0) {
              addGameLog('waterfall', `${cardName} 被挤出，破坏了所有装备：${destroyed.join('、')}`);
              setHeroSkillBanner(`${cardName} 的贪婪吞噬了你的所有装备！`);
            } else {
              addGameLog('waterfall', `${cardName} 被挤出，但没有装备可破坏。`);
            }
            waterfallDiscardToGraveyardUnlessFinal(plan.discardCard);
            break;
          }
          default:
            if (!tryReturnFinalMonsterPrecursorToDeck(plan.discardCard)) {
              discardCardToGraveyard(plan.discardCard);
            }
            break;
        }
      } else {
        if (!tryReturnFinalMonsterPrecursorToDeck(plan.discardCard)) {
          discardCardToGraveyard(plan.discardCard);
        }
      }
    }

    logWaterfall('discard-complete', {
      discardedCardId: plan.discardCard?.id ?? null,
    });

    setWaterfallAnimation(prev => ({
      ...prev,
      discardSlot: null,
      discardDestination: 'graveyard',
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
      discardDestination: plan.discardDestination,
      sequenceId: prev.sequenceId,
    }));

    queueWaterfallTimeout(() => {
      setWaterfallAnimation(prev => ({
        ...prev,
        landingSlots: [],
        sequenceId: prev.sequenceId,
      }));
    }, animSpeed(Math.max(200, WATERFALL_DROP_DURATION - 200)), 'landing-clear');

    if (plan.discardCard) {
      queueWaterfallTimeout(() => {
        handleWaterfallDiscardComplete();
      }, animSpeed(WATERFALL_DISCARD_DURATION), 'drop-to-discard');
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

    (['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]).forEach(slotId => {
      const item = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (item?.waterfallAttackBoost) {
        const newValue = (item.value ?? 0) + item.waterfallAttackBoost;
        setEquipmentSlotById(slotId, { ...item, value: newValue });
        addGameLog('equip', `${item.name} 瀑流强化：攻击力 +${item.waterfallAttackBoost}（${newValue}）`);
      }
    });

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
    const emptyColumnSet = new Set(emptyColumns);

    let dropAssignments: DungeonDropAssignment[] = [];
    const unusedPreview = new Set(previewIndices);

    if (cascadeFullDrop) {
      dropAssignments = previewIndices
        .map(previewIndex => {
          const card = previewCards[previewIndex];
          return card ? { previewIndex, card, slotIndex: previewIndex } : null;
        })
        .filter((assignment): assignment is DungeonDropAssignment => Boolean(assignment));
      unusedPreview.clear();
    } else {
      // Each preview card falls straight down to its own column if the slot below is empty;
      // if the slot below is occupied, the card is blocked.
      for (const previewIndex of previewIndices) {
        if (!emptyColumnSet.has(previewIndex)) continue;
        const card = previewCards[previewIndex];
        if (!card) continue;
        dropAssignments.push({ previewIndex, card, slotIndex: previewIndex });
        unusedPreview.delete(previewIndex);
      }

      // Late game: if preview has fewer than 5 cards and all blocked cards
      // can fit into remaining empty active slots, redirect them instead of discarding.
      if (unusedPreview.size > 0 && filledPreviewCount < DUNGEON_COLUMN_COUNT) {
        const usedSlots = new Set(dropAssignments.map(a => a.slotIndex));
        const remainingEmpty = emptyColumns.filter(col => !usedSlots.has(col)).sort((a, b) => a - b);
        if (remainingEmpty.length >= unusedPreview.size) {
          const blockedIndices = Array.from(unusedPreview).sort((a, b) => a - b);
          let emptyIdx = 0;
          for (const previewIndex of blockedIndices) {
            const card = previewCards[previewIndex];
            if (!card) continue;
            dropAssignments.push({ previewIndex, card, slotIndex: remainingEmpty[emptyIdx] });
            unusedPreview.delete(previewIndex);
            emptyIdx++;
          }
        }
      }
    }

    const dropCount = dropAssignments.length;

    logWaterfall('drop-plan', {
      emptySlots: emptyColumns,
      previewIndices,
      filledPreviewCount,
      dropCount,
      blockedPreview: Array.from(unusedPreview),
      previewSnapshot: previewIndices.map(index => previewCards[index]?.id ?? null),
      assignments: dropAssignments.map(({ previewIndex, slotIndex }) => ({
        previewIndex,
        slotIndex,
      })),
    });

    if (dropAssignments.length === 0 && previewIndices.length === 0 && remainingDeck.length === 0) {
      releaseWaterfallLock('no-preview-cards-no-deck');
      return;
    }

    waterfallPendingRef.current = false;
    const sequenceId = ++waterfallSequenceRef.current;
    if (selectedHeroSkillRef.current === 'waterfall-heal') {
      const baseHeal = 4;
      healHero(baseHeal);
      const healAmount = amuletEffects.hasHeal ? baseHeal * 2 : baseHeal;
      addGameLog('skill', `潮涌回春：瀑布推进，恢复 ${healAmount} 点生命${amuletEffects.hasHeal ? '（治疗加倍）' : ''}`);
    }
    setTurnCount(prev => prev + 1);
    addGameLog('waterfall', `第 ${turnCount + 1} 波开始，${dropCount} 张新卡牌`);
    for (let bi = 0; bi < bulwarkPassiveRef.current; bi++) {
      applyBulwarkPassiveShieldIncrement();
    }
    const recycledCards = restorePermanentMagicFromRecycleBag();
    if (recycledCards > 0) {
      logWaterfall('recycle-restore', { restored: recycledCards });
    }

    logWaterfall('trigger', {
      emptySlots: emptyColumns,
      filledPreviewCount,
      dropCount,
      sequenceId,
      assignments: dropAssignments.map(({ previewIndex, slotIndex }) => ({ previewIndex, slotIndex })),
    });

    const dropPreviewIndices = dropAssignments.map(pair => pair.previewIndex);
    const dropTargetSlots = dropAssignments.map(pair => pair.slotIndex);
    const spawnTurn = turnCount + 1;
    const resolvedDropCards = dropAssignments.map(pair => applyMonsterRage(pair.card, spawnTurn));

    const remainingPreviewOrdered = Array.from(unusedPreview).sort((a, b) => b - a);
    // Never discard the final monster (future boss) — pick a different card
    const discardPreviewIndex =
      remainingPreviewOrdered.find(idx => !previewCards[idx]?.isFinalMonster) ?? null;
    const discardCard =
      discardPreviewIndex !== null ? previewCards[discardPreviewIndex] : null;

    // If the final monster is blocked but protected from discard, force-drop it
    if (discardPreviewIndex !== null) {
      unusedPreview.delete(discardPreviewIndex);
    }
    for (const blockedIdx of Array.from(unusedPreview)) {
      const card = previewCards[blockedIdx];
      if (!card?.isFinalMonster) continue;
      const usedSlots = new Set([
        ...dropAssignments.map(a => a.slotIndex),
        ...activeCards.map((c, i) => (c ? i : -1)).filter(i => i >= 0),
      ]);
      for (let slot = 0; slot < DUNGEON_COLUMN_COUNT; slot++) {
        if (!usedSlots.has(slot)) {
          dropAssignments.push({ previewIndex: blockedIdx, card, slotIndex: slot });
          unusedPreview.delete(blockedIdx);
          break;
        }
      }
    }

    const stuckFinalMonsters: GameCardData[] = [];
    for (const stuckIdx of Array.from(unusedPreview)) {
      const card = previewCards[stuckIdx];
      if (card?.isFinalMonster) {
        stuckFinalMonsters.push(card);
        unusedPreview.delete(stuckIdx);
        addGameLog('waterfall', `${card.name}（最终之敌）无法入场，返回牌堆顶等待决战`);
        setHeroSkillBanner(`${card.name} 隐入牌堆……终局之战尚未到来。`);
      }
    }

    const effectiveDeck = [...stuckFinalMonsters, ...remainingDeck];
    const nextPreviewCards = effectiveDeck.slice(0, 5);
    const nextRemainingDeck = effectiveDeck.slice(5);
    const shouldDeclareVictory =
      nextPreviewCards.length === 0 && effectiveDeck.length === 0;

    const planDiscardCard = cascadeFullDrop ? null : discardCard;
    const planDiscardPreviewIndex = cascadeFullDrop ? null : discardPreviewIndex;
    const planDiscardDestination = getWaterfallPreviewDiscardDestination(planDiscardCard);

    waterfallPlanRef.current = {
      dropCards: resolvedDropCards,
      dropPreviewIndices,
      dropTargetSlots,
      discardCard: planDiscardCard,
      discardPreviewIndex: planDiscardPreviewIndex,
      discardDestination: planDiscardDestination,
      nextPreviewCards,
      nextRemainingDeck,
      shouldDeclareVictory,
    };
    cascadeResetWaterfallRef.current = false;
    resetHeroSkillForNewWave();

    setWaterfallAnimation({
      phase: resolvedDropCards.length > 0 ? 'dropping' : discardCard ? 'discarding' : 'dealing',
      isActive: true,
      droppingSlots: resolvedDropCards.length > 0 ? dropPreviewIndices : [],
      landingSlots: [],
      discardSlot: resolvedDropCards.length === 0 ? discardPreviewIndex : null,
      discardDestination: planDiscardDestination,
      dealingSlots: [],
      sequenceId,
    });

    if (resolvedDropCards.length > 0) {
      queueWaterfallTimeout(handleWaterfallDropComplete, animSpeed(WATERFALL_DROP_DURATION), 'drop-phase-timeout');
    } else if (discardCard) {
      queueWaterfallTimeout(handleWaterfallDiscardComplete, animSpeed(WATERFALL_DISCARD_DURATION), 'discard-phase-timeout');
    } else {
      startWaterfallDeal();
    }
  };

  // Remove card from active cards (add to graveyard automatically)
  const removeCard = (
    cardId: string,
    addToGraveyardAutomatically: boolean = true,
    options?: { skipAutoDraw?: boolean },
  ) => {
    logWaterfall('remove-request', {
      cardId,
      pendingBefore: pendingDungeonRemovalsRef.current,
    });
    // Find the card to add to graveyard if needed
    const slotIndex = findSlotIndexByCardId(activeCards, cardId);
    const cardToRemove = slotIndex >= 0 ? activeCards[slotIndex] : null;

    if (slotIndex === -1) {
      return;
    }

    if (addToGraveyardAutomatically && cardToRemove) {
      addToGraveyard(cardToRemove);
    }

    if (cardToRemove && !options?.skipAutoDraw) {
      registerDungeonCardProcessed(cardToRemove.id, 'remove-card');
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
            addGameLog('system', '胜利！地牢已被征服！');
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
      addGameLog('magic', `${card.type === 'hero-magic' ? '英雄魔法' : '魔法'}：${card.name}${options?.banner ? ` — ${options.banner}` : ''}`);
      if (options?.banner) {
        setHeroSkillBanner(options.banner);
      }

      if (card.type === 'hero-magic') {
        logHeroMagic('finalize-card', { cardId: card.id, name: card.name });
      }

      if (isPermanentMagicCard(card)) {
        addPermanentMagicToRecycleBag(card);
      } else {
        addToGraveyard(card);
      }

      removeCard(card.id, false);
      setPendingMagicAction(null);
      echoRemainingRef.current = 0;
    },
    [addGameLog, addPermanentMagicToRecycleBag, addToGraveyard, removeCard],
  );

  const finalizePotionCard = useCallback(
    async (card: GameCardData, options?: { banner?: string }) => {
      if (options?.banner) {
        setHeroSkillBanner(options.banner);
      }
      setPendingPotionAction(current => (current && current.card.id === card.id ? null : current));
      if (card.flipTarget) {
        await applyCardFlip(card);
      } else {
        addToGraveyard(card);
      }
    },
    [addToGraveyard, applyCardFlip, setHeroSkillBanner],
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
      addGameLog('potion', `修复 ${slotItem.name} 耐久 +${gained}（${currentDurability} → ${repairedDurability}）`);
      const banner = `${slotItem.name} 耐久 +${gained}`;
      void finalizePotionCard(card, { banner });
      return true;
    },
    [addGameLog, equipmentSlot1, equipmentSlot2, finalizePotionCard, setEquipmentSlotById, setHeroSkillBanner],
  );

  const repairEquipmentDurability = useCallback(
    async (amount: number, allowedTypes: EquipmentRepairTarget[]): Promise<boolean> => {
      const repairableSlots = getRepairableEquipmentSlots(allowedTypes);
      if (!repairableSlots.length) {
        setHeroSkillBanner('当前没有需要修复的装备。');
        return false;
      }

      let targetSlot: EquipmentSlotId | null = repairableSlots.length === 1 ? repairableSlots[0] : null;
      if (!targetSlot) {
        targetSlot = await requestEquipmentSelection({
          prompt: `选择一个${formatRepairTargetLabel(allowedTypes)}恢复${amount}点耐久`,
          subtext: '只能选择已损耗耐久的装备。',
        });
      }

      if (!targetSlot) {
        setHeroSkillBanner('请选择要修复的装备。');
        return false;
      }

      if (!repairableSlots.includes(targetSlot)) {
        setHeroSkillBanner('该装备当前无法修复。');
        return false;
      }

      const slotItem = targetSlot === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (!slotItem) {
        setHeroSkillBanner('该槽位没有装备。');
        return false;
      }

      const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
      if (maxDurability <= 0) {
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
      setEquipmentSlotById(targetSlot, { ...slotItem, durability: repairedDurability });
      setHeroSkillBanner(`${slotItem.name} 耐久 +${gained}`);
      return true;
    },
    [
      equipmentSlot1,
      equipmentSlot2,
      getRepairableEquipmentSlots,
      requestEquipmentSelection,
      setEquipmentSlotById,
      setHeroSkillBanner,
    ],
  );

  const handlePotionConsumption = useCallback(
    async (card: GameCardData) => {
      addGameLog('potion', `使用药水：${card.name}`);
      const effect = card.potionEffect;

      const resolveHeal = async (healAmount: number) => {
        const actualHeal = healHero(healAmount);
        const banner = actualHeal > 0 ? `回复${actualHeal}点生命。` : '生命已满。';
        await finalizePotionCard(card, { banner });
      };

      if (!effect || effect === 'heal-5' || effect === 'heal-14') {
        await resolveHeal(effect === 'heal-14' ? 14 : effect === 'heal-5' ? 5 : card.value ?? 0);
        return;
      }

      if (effect === 'perm-spell-damage') {
        setPermanentSpellDamageBonus(prev => prev + 1);
        addGameLog('potion', '药水效果：永久法术伤害 +1');
        await finalizePotionCard(card, { banner: '永久法术伤害 +1。' });
        return;
      }

      if (effect === 'perm-spell-damage-2') {
        setPermanentSpellDamageBonus(prev => prev + 2);
        addGameLog('potion', '药水效果：永久法术伤害 +2');
        await finalizePotionCard(card, { banner: '永久法术伤害 +2。' });
        return;
      }

      if (effect === 'perm-backpack-size') {
        setBackpackCapacityModifier(prev => prev + 1);
        enforceBackpackCapacity();
        addGameLog('potion', '药水效果：背包容量永久 +1');
        await finalizePotionCard(card, { banner: '背包容量永久 +1。' });
        return;
      }

      if (effect === 'dice-arcane-infusion') {
        const diceResult = await requestDiceOutcome({
          title: card.name,
          subtitle: '掷骰决定翻倍目标',
          entries: [
            { id: 'ai-l-dmg', range: [1, 4] as [number, number], label: '左装备栏伤害翻倍', effect: 'none' },
            { id: 'ai-l-shd', range: [5, 8] as [number, number], label: '左装备栏护甲翻倍', effect: 'none' },
            { id: 'ai-r-dmg', range: [9, 12] as [number, number], label: '右装备栏伤害翻倍', effect: 'none' },
            { id: 'ai-r-shd', range: [13, 16] as [number, number], label: '右装备栏护甲翻倍', effect: 'none' },
            { id: 'ai-spell', range: [17, 20] as [number, number], label: '法术伤害加成翻倍', effect: 'none' },
          ],
        });
        if (!diceResult) return;
        let banner = diceResult.label;
        if (diceResult.id === 'ai-l-dmg') {
          const cur = getEquipmentSlotBonus('equipmentSlot1', 'damage');
          setEquipmentSlotBonus('equipmentSlot1', 'damage', cur * 2);
          banner = `左装备栏伤害加成：+${cur} → +${cur * 2}`;
          addGameLog('potion', `奥术灌注：左装备栏永久伤害 ${cur} → ${cur * 2}`);
        } else if (diceResult.id === 'ai-l-shd') {
          const cur = getEquipmentSlotBonus('equipmentSlot1', 'shield');
          setEquipmentSlotBonus('equipmentSlot1', 'shield', cur * 2);
          banner = `左装备栏护甲加成：+${cur} → +${cur * 2}`;
          addGameLog('potion', `奥术灌注：左装备栏永久护甲 ${cur} → ${cur * 2}`);
        } else if (diceResult.id === 'ai-r-dmg') {
          const cur = getEquipmentSlotBonus('equipmentSlot2', 'damage');
          setEquipmentSlotBonus('equipmentSlot2', 'damage', cur * 2);
          banner = `右装备栏伤害加成：+${cur} → +${cur * 2}`;
          addGameLog('potion', `奥术灌注：右装备栏永久伤害 ${cur} → ${cur * 2}`);
        } else if (diceResult.id === 'ai-r-shd') {
          const cur = getEquipmentSlotBonus('equipmentSlot2', 'shield');
          setEquipmentSlotBonus('equipmentSlot2', 'shield', cur * 2);
          banner = `右装备栏护甲加成：+${cur} → +${cur * 2}`;
          addGameLog('potion', `奥术灌注：右装备栏永久护甲 ${cur} → ${cur * 2}`);
        } else if (diceResult.id === 'ai-spell') {
          const cur = permanentSpellDamageBonus;
          setPermanentSpellDamageBonus(cur * 2);
          banner = `法术伤害加成：+${cur} → +${cur * 2}`;
          addGameLog('potion', `奥术灌注：永久法术伤害 ${cur} → ${cur * 2}`);
        }
        await finalizePotionCard(card, { banner });
        return;
      }

      if (effect === 'dice-backpack-expand') {
        const diceResult = await requestDiceOutcome({
          title: card.name,
          subtitle: '掷骰决定灵药效果',
          entries: [
            { id: 'bp-amulet', range: [1, 5] as [number, number], label: '护符上限 +1', effect: 'amuletCapacity+1' },
            { id: 'bp-left', range: [6, 10] as [number, number], label: '左装备栏容量 +1', effect: 'equipSlot1Capacity+1' },
            { id: 'bp-right', range: [11, 15] as [number, number], label: '右装备栏容量 +1', effect: 'equipSlot2Capacity+1' },
            { id: 'bp-bag', range: [16, 20] as [number, number], label: '背包容量 +3', effect: 'backpackSize+3' },
          ],
        });
        if (!diceResult) return;
        const rolledEffect = normalizeEventEffect(diceResult.effect)[0];
        if (rolledEffect === 'amuletCapacity+1') {
          setMaxAmuletSlots(prev => prev + 1);
        } else if (rolledEffect === 'equipSlot1Capacity+1') {
          setEquipmentSlotCapacity(prev => ({ ...prev, equipmentSlot1: prev.equipmentSlot1 + 1 }));
        } else if (rolledEffect === 'equipSlot2Capacity+1') {
          setEquipmentSlotCapacity(prev => ({ ...prev, equipmentSlot2: prev.equipmentSlot2 + 1 }));
        } else if (rolledEffect === 'backpackSize+3') {
          setBackpackCapacityModifier(prev => prev + 3);
        }
        addGameLog('potion', `灵药效果：${diceResult.label}`);
        await finalizePotionCard(card, { banner: diceResult.label });
        return;
      }

      if (effect === 'boost-both-slots') {
        setEquipmentSlotBonus('equipmentSlot1', 'damage', cur => cur + 1);
        setEquipmentSlotBonus('equipmentSlot1', 'shield', cur => cur + 1);
        setEquipmentSlotBonus('equipmentSlot2', 'damage', cur => cur + 1);
        setEquipmentSlotBonus('equipmentSlot2', 'shield', cur => cur + 1);
        addGameLog('potion', '双锋淬液：左右装备栏永久伤害+1，护甲+1');
        await finalizePotionCard(card, { banner: '左右装备栏永久伤害+1，护甲+1！' });
        return;
      }

      if (effect === 'left-slot-durability-max+1') {
        const leftSlot = equipmentSlot1;
        if (!leftSlot || !leftSlot.durability) {
          await finalizePotionCard(card, { banner: '左装备栏没有装备，药剂失效。' });
          return;
        }
        const maxDur = leftSlot.maxDurability ?? leftSlot.durability ?? 0;
        setEquipmentSlotById('equipmentSlot1', { ...leftSlot, maxDurability: maxDur + 1 });
        addGameLog('potion', `淬炼药剂：${leftSlot.name} 耐久上限 +1（${maxDur} → ${maxDur + 1}）`);
        await finalizePotionCard(card, { banner: `${leftSlot.name} 耐久上限 +1！` });
        return;
      }

      if (effect === 'right-slot-durability-max+1') {
        const rightSlot = equipmentSlot2;
        if (!rightSlot || !rightSlot.durability) {
          await finalizePotionCard(card, { banner: '右装备栏没有装备，药剂失效。' });
          return;
        }
        const maxDur = rightSlot.maxDurability ?? rightSlot.durability ?? 0;
        setEquipmentSlotById('equipmentSlot2', { ...rightSlot, maxDurability: maxDur + 1 });
        addGameLog('potion', `淬炼药剂（右）：${rightSlot.name} 耐久上限 +1（${maxDur} → ${maxDur + 1}）`);
        await finalizePotionCard(card, { banner: `${rightSlot.name} 耐久上限 +1！` });
        return;
      }

      if (effect === 'repair-choice') {
        const allowedTypes: EquipmentRepairTarget[] = ['weapon', 'shield', 'monster'];
        const matchingSlots = getEquipmentSlots().filter(slot => {
          const slotType = slot.item?.type;
          return Boolean(slotType && allowedTypes.includes(slotType));
        });
        if (!matchingSlots.length) {
          await finalizePotionCard(card, { banner: '没有装备武器或护盾，药剂失效。' });
          return;
        }
        const prompt = '选择修复剂效果';
        setPendingPotionAction({
          card,
          effect: 'repair-choice',
          step: 'choice',
          prompt,
        });
        setHeroSkillBanner(prompt);
        return;
      }

      if (
        effect === 'repair-weapon-2' ||
        effect === 'repair-weapon-3'
      ) {
        let repairAmount = effect === 'repair-weapon-3' ? 3 : 2;
        let allowedTypes: EquipmentRepairTarget[] = ['weapon', 'shield', 'monster'];

        const targetLabel = formatRepairTargetLabel(allowedTypes);
        const matchingSlots = getEquipmentSlots().filter(slot => {
          const slotType = slot.item?.type;
          return Boolean(slotType && allowedTypes.includes(slotType));
        });

        if (!matchingSlots.length) {
          await finalizePotionCard(card, { banner: `没有装备${targetLabel}，药剂失效。` });
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
          await finalizePotionCard(card, { banner: `所有${targetLabel}已满耐久。` });
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

      if (effect === 'draw-backpack-4') {
        setBackpackCapacityModifier(prev => prev + 1);
        setHandLimitBonus(prev => prev + 1);
        const newHandLimit = effectiveHandLimit + 1;
        const handOccupancyTowardLimit = () =>
          handCards.filter(c => c.id !== card.id).length + backpackHandFlightsRef.current.length;
        let draws = 0;
        for (let i = 0; i < 4; i += 1) {
          if (handOccupancyTowardLimit() >= newHandLimit) break;
          const [drawnCard] = takeRandomCardsFromBackpack(1);
          if (!drawnCard) break;
          queueCardIntoHand(drawnCard);
          draws += 1;
        }
        let bonusDraws = 0;
        if (handOccupancyTowardLimit() < newHandLimit && backpackItemsRef.current.length > 0) {
          const [extraCard] = takeRandomCardsFromBackpack(1);
          if (extraCard) {
            queueCardIntoHand(extraCard);
            bonusDraws = 1;
          }
        }
        const totalDraws = draws + bonusDraws;
        const parts: string[] = [];
        if (totalDraws > 0) parts.push(`从背包抽出${totalDraws}张牌`);
        parts.push('背包上限 +1', '手牌上限 +1');
        const banner = parts.join('，') + '。';
        addGameLog('potion', `药水效果：${parts.join('，')}`);
        await finalizePotionCard(card, { banner });
        return;
      }

      if (effect === 'discover-graveyard-magic') {
        const magicCards = discardedCards.filter(c => c.type === 'magic' || c.type === 'hero-magic');
        if (magicCards.length === 0) {
          addGameLog('potion', '药水效果：墓地中没有魔法卡。');
          await finalizePotionCard(card, { banner: '墓地中没有魔法卡。' });
          return;
        }
        const shuffled = [...magicCards].sort(() => Math.random() - 0.5);
        const options = shuffled.slice(0, Math.min(3, shuffled.length));
        const selected = await new Promise<GameCardData | null>(resolve => {
          graveyardDiscoverResolverRef.current = c => {
            resolve(c);
            graveyardDiscoverResolverRef.current = null;
          };
          setGraveyardDiscoverState(options);
        });
        if (amuletEffects.hasBalance && card.flipTarget) {
          card = {
            ...card,
            flipTarget: {
              toCard: {
                id: `backpack-magic-discover-${Date.now()}`,
                type: 'magic',
                name: '秘典检索',
                value: 0,
                image: skillScrollImage,
                magicType: 'permanent',
                magicEffect: 'backpack-magic-discover',
                description: '隐藏效果：天平护符与暮光药剂共鸣，翻转为此卡。永久魔法：从背包中发现一张魔法牌加入手牌。',
              },
              destination: 'backpack',
              banner: '天平之力共鸣，药剂翻转成了「秘典检索」！',
              message: '天平符文闪烁，药剂变幻为新的形态…',
            },
          };
        }
        if (selected) {
          addGameLog('potion', `药水效果：从墓地发现魔法卡「${selected.name}」`);
          await finalizePotionCard(card, { banner: `从墓地取回了「${selected.name}」！` });
        } else {
          addGameLog('potion', '药水效果：放弃了墓地发现。');
          await finalizePotionCard(card, { banner: '放弃了墓地发现。' });
        }
        return;
      }

      if (effect === 'discover-class-3') {
        const drawn = drawClassCardsToBackpack(3, 'potion-discover-3');
        if (drawn.length > 0) {
          triggerClassDeckFlight(drawn);
          addGameLog('potion', `药水效果：获得 ${drawn.length} 张职业卡`);
          await finalizePotionCard(card, { banner: `获得了 ${drawn.length} 张职业卡！` });
        } else {
          addGameLog('potion', '药水效果：职业卡牌不可用');
          await finalizePotionCard(card, { banner: '职业卡牌不可用。' });
        }
        return;
      }

      await resolveHeal(card.value ?? 0);
    },
    [
      addGameLog,
      beginDiscoverFlow,
      drawClassCardsToBackpack,
      drawFromBackpackToHand,
      equipmentSlot1,
      equipmentSlot2,
      finalizePotionCard,
      getEquipmentSlots,
      handleDiscoverFallback,
      healHero,
      enforceBackpackCapacity,
      resolvePotionRepairForSlot,
      setBackpackCapacityModifier,
      setHeroSkillBanner,
      setPermanentSpellDamageBonus,
      setPendingPotionAction,
      triggerClassDeckFlight,
    ],
  );

  const finalizeEventResolution = (options?: { removeFromDungeon?: boolean }) => {
    const resolution = eventResolutionRef.current;
    if (resolution.source === 'dungeon' && resolution.cardId) {
      if (options?.removeFromDungeon !== false) {
        const shouldSkipAutoDraw = skipNextEventAutoDrawRef.current;
        skipNextEventAutoDrawRef.current = false;
        removeCard(resolution.cardId, false, shouldSkipAutoDraw ? { skipAutoDraw: true } : undefined);
      }
      setResolvingDungeonCardId(prev => (prev === resolution.cardId ? null : prev));
    }

    eventResolutionRef.current = { cardId: null, source: null };
  };

  const completeCurrentEvent = useCallback(async () => {
    if (!currentEventCard) return;
    const cardToComplete = currentEventCard;
    const shouldSkipFlip = skipEventFlipRef.current;
    skipEventFlipRef.current = false;
    setEventModalOpen(false);
    setEventModalMinimized(false);
    setCurrentEventCard(null);
    const hasFlip = !!cardToComplete.flipTarget && !shouldSkipFlip;
    const flipDest = hasFlip ? (cardToComplete.flipTarget!.destination ?? 'graveyard') : 'graveyard';
    const isStayFlip = hasFlip && flipDest === 'stay';
    if (hasFlip && flipDest !== 'graveyard') {
      skipNextEventAutoDrawRef.current = true;
    }
    const cellIndex = isStayFlip
      ? activeCards.findIndex(c => c?.id === cardToComplete.id)
      : -1;
    finalizeEventResolution({ removeFromDungeon: !isStayFlip });
    if (hasFlip) {
      await applyCardFlip(cardToComplete, isStayFlip ? cellIndex : undefined);
    } else {
      addToGraveyard(cardToComplete);
    }
  }, [addToGraveyard, applyCardFlip, currentEventCard, finalizeEventResolution]);

  const handleDiscoverSelect = useCallback(
    async (cardId: string) => {
      pushUndoSnapshot();
      if (!discoverOptions.length) return;
      const selectedCard = discoverOptions.find(card => card.id === cardId);
      const remainingCards = discoverOptions.filter(card => card.id !== cardId);

      setDiscoverModalOpen(false);
      setDiscoverOptions([]);

      if (remainingCards.length) {
        returnCardsToClassDeck(remainingCards);
      }

      if (selectedCard) {
        addGameLog('skill', `发现专属卡：选入「${selectedCard.name}」`);
        if (backpackItems.length >= backpackCapacity) {
          addToGraveyard(selectedCard);
          addGameLog('skill', `背包已满，「${selectedCard.name}」进入墓地`);
        } else {
          setBackpackItems(prev => [selectedCard, ...prev]);
          triggerClassDeckFlight([selectedCard]);
        }
      }

      await completeCurrentEvent();
    },
    [
      addGameLog,
      addToGraveyard,
      backpackItems.length,
      backpackCapacity,
      completeCurrentEvent,
      discoverOptions,
      returnCardsToClassDeck,
      triggerClassDeckFlight,
    ],
  );

  const handleShopPurchase = useCallback(
    (cardId: string) => {
      pushUndoSnapshot();
      setShopOfferings(prev => {
        const offeringIndex = prev.findIndex(entry => entry.card.id === cardId);
        if (offeringIndex === -1) {
          return prev;
        }

        const offering = prev[offeringIndex];
        if (offering.sold) {
          return prev;
        }

        if (goldRef.current < offering.price) {
          return prev;
        }

        if (backpackItemsRef.current.length >= backpackCapacity) {
          return prev;
        }

        const purchasedCard = { ...offering.card };
        addGameLog('shop', `商店：购买「${purchasedCard.name}」（-${offering.price} 金币）`);
        setGold(value => value - offering.price);
        setClassDeck(deck => deck.filter(card => card.id !== purchasedCard.id));
        setBackpackItems(items => [purchasedCard, ...items]);
        triggerClassDeckFlight([purchasedCard]);

        const next = [...prev];
        next[offeringIndex] = { ...offering, sold: true };
        return next;
      });
    },
    [addGameLog, backpackCapacity, triggerClassDeckFlight],
  );

  const handleShopClose = useCallback(async () => {
    pushUndoSnapshot();
    addGameLog('shop', '离开商店');
    setShopModalOpen(false);
    setShopModalMinimized(false);
    setShopOfferings([]);
    setShopSourceEvent(null);
    setDeleteModalOpen(false);
    setCardActionContext(null);
    cardActionResolverRef.current = null;
    await completeCurrentEvent();
  }, [addGameLog, completeCurrentEvent]);

  const requestCardAction = useCallback(
    (
      action: 'delete' | 'discard',
      count: number,
      options?: {
        title?: string;
        description?: string;
        handOnly?: boolean;
        discardToRecycleBag?: boolean;
      },
    ) => {
      const pool = options?.handOnly ? handCards.length : deletableCardCount;
      if (pool < count) {
        setHeroSkillBanner(options?.description ?? '当前没有足够的卡牌可供选择。');
        return Promise.resolve(false);
      }
      return new Promise<boolean>(resolve => {
        cardActionResolverRef.current = () => {
          resolve(true);
          cardActionResolverRef.current = null;
        };
        cardActionRemainingRef.current = count;
        deletingCardIdsRef.current.clear();
        setCardActionContext({
          mode: 'event',
          action,
          requiredCount: count,
          remainingCount: count,
          title: options?.title,
          description: options?.description,
          handOnly: options?.handOnly,
          discardToRecycleBag: options?.discardToRecycleBag,
        });
        setDeleteModalOpen(true);
      });
    },
    [deletableCardCount, handCards.length, setHeroSkillBanner],
  );

  const requestGraveyardSelection = useCallback(
    (
      maxOptions: number,
      opts?: { delivery?: 'backpack' | 'hand-first' },
    ) => {
      if (!discardedCards.length) {
        setHeroSkillBanner('坟场中没有可取回的卡牌。');
        return Promise.resolve<GameCardData | null>(null);
      }
      clearUndoStack();
      graveyardDiscoverDeliveryRef.current =
        opts?.delivery === 'hand-first' ? 'hand-first' : 'backpack';
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
    [clearUndoStack, discardedCards, setHeroSkillBanner],
  );

  const handleGraveyardDiscoverSelect = useCallback(
    (cardId: string) => {
      pushUndoSnapshot();
      if (!graveyardDiscoverState) {
        return;
      }
      const selected = graveyardDiscoverState.find(card => card.id === cardId);
      if (!selected) {
        return;
      }
      setDiscardedCards(prev => {
        const next = prev.filter(card => card.id !== cardId);
        discardedCardsRef.current = next;
        return next;
      });
      const delivery = graveyardDiscoverDeliveryRef.current;
      const flightsCount = backpackHandFlightsRef.current.length;
      const handRoom = Math.max(0, effectiveHandLimit - (handCards.length + flightsCount));
      const toHand =
        delivery === 'hand-first' && handRoom > 0 && !handCards.some(c => c.id === selected.id);
      if (toHand) {
        ensureCardInHand(selected);
        addGameLog('event', `坟场发现：入手牌「${selected.name}」`);
        setHeroSkillBanner(`「${selected.name}」已加入手牌。`);
      } else {
        addCardToBackpack(selected);
        addGameLog(
          'event',
          delivery === 'hand-first'
            ? `坟场发现：手牌已满，「${selected.name}」进入背包`
            : `坟场发现：选入背包「${selected.name}」`,
        );
        if (delivery === 'hand-first') {
          setHeroSkillBanner(`手牌已满，「${selected.name}」已进入背包。`);
        }
      }
      setGraveyardDiscoverState(null);
      graveyardDiscoverResolverRef.current?.(selected);
      graveyardDiscoverResolverRef.current = null;
    },
    [
      addCardToBackpack,
      addGameLog,
      effectiveHandLimit,
      ensureCardInHand,
      graveyardDiscoverState,
      handCards,
      setHeroSkillBanner,
    ],
  );

  const handleShopDeleteRequest = useCallback(() => {
    pushUndoSnapshot();
    if (shopDeleteUsed || deletableCardCount === 0) {
      return;
    }
    cardActionRemainingRef.current = 1;
    deletingCardIdsRef.current.clear();
    setCardActionContext({
      mode: 'shop',
      action: 'delete',
      requiredCount: 1,
      remainingCount: 1,
      title: '选择要删除的卡牌',
      description: '从手牌、背包或回收袋中删除 1 张卡牌，将其送入坟场。',
    });
    setDeleteModalOpen(true);
  }, [deletableCardCount, shopDeleteUsed]);

  const handleShopHealRequest = useCallback(() => {
    pushUndoSnapshot();
    if (shopHealUsed || goldRef.current < SHOP_HEAL_COST || hp >= maxHp) return;
    addGameLog('shop', `商店：治疗（-${SHOP_HEAL_COST} 金币，+${SHOP_HEAL_AMOUNT} HP）`);
    setGold(prev => prev - SHOP_HEAL_COST);
    healHero(SHOP_HEAL_AMOUNT);
    setShopHealUsed(true);
    setHeroSkillBanner(`花费 ${SHOP_HEAL_COST} 金币恢复了 ${SHOP_HEAL_AMOUNT} 点生命。`);
  }, [addGameLog, healHero, hp, maxHp, setHeroSkillBanner, shopHealUsed]);

  const handleShopLevelUpRequest = useCallback(() => {
    pushUndoSnapshot();
    if (shopLevelUpUsed || goldRef.current < SHOP_LEVEL_UP_COST || shopLevel >= MAX_SHOP_LEVEL) return;
    addGameLog('shop', `商店：升级等级（-${SHOP_LEVEL_UP_COST} 金币）`);
    setGold(prev => prev - SHOP_LEVEL_UP_COST);
    setShopLevel(prev => Math.min(MAX_SHOP_LEVEL, prev + 1));
    setShopLevelUpUsed(true);
    setHeroSkillBanner(`花费 ${SHOP_LEVEL_UP_COST} 金币，商店等级提升了！`);
  }, [addGameLog, setHeroSkillBanner, shopLevelUpUsed, shopLevel]);

  const handleShopSkillDiscoverRequest = useCallback(() => {
    if (shopSkillDiscoverUsed || goldRef.current < SHOP_SKILL_DISCOVER_COST) return;
    const ownedSkills = new Set<string>([
      ...(selectedHeroSkill ? [selectedHeroSkill] : []),
      ...extraHeroSkills,
    ]);
    const available = allHeroSkills.filter(s => !ownedSkills.has(s.id));
    if (available.length < 3) return;
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    const options = shuffled.slice(0, 3);
    pushUndoSnapshot();
    setGold(prev => prev - SHOP_SKILL_DISCOVER_COST);
    setShopSkillOptions(options);
    setShopSkillSelectOpen(true);
    setShopSkillDiscoverUsed(true);
    addGameLog('shop', `商店：英雄技能三选一（-${SHOP_SKILL_DISCOVER_COST} 金币）`);
  }, [addGameLog, extraHeroSkills, selectedHeroSkill, shopSkillDiscoverUsed]);

  const handleShopSkillSelect = useCallback((skillId: string) => {
    pushUndoSnapshot();
    const skillDef = getHeroSkillById(skillId as HeroSkillId);
    setExtraHeroSkills(prev => [...prev, skillId as HeroSkillId]);
    setShopSkillSelectOpen(false);
    setShopSkillOptions([]);
    addGameLog('shop', `商店：习得英雄技能「${skillDef?.name ?? skillId}」`);
    addGameLog('skill', `学习了新的英雄技能：${skillDef?.name ?? skillId}`);
    setHeroSkillBanner(`学习了「${skillDef?.name ?? skillId}」！`);

    if (!skillDef) return;

    // Apply "opening" bonuses immediately even though we're mid-game
    const hpBonus = skillDef.initialMaxHpBonus ?? 0;
    if (hpBonus) {
      setPermanentMaxHpBonus(prev => prev + hpBonus);
      setHp(prev => prev + hpBonus);
      addGameLog('skill', `技能加成：最大生命 +${hpBonus}，恢复 ${hpBonus} 生命`);
    }
    const goldBonus = skillDef.initialGoldBonus ?? 0;
    if (goldBonus) {
      setGold(prev => prev + goldBonus);
      addGameLog('gold', `技能加成：金币 +${goldBonus}`);
    }
    const waterfallBonus = skillDef.initialWaterfallBonus ?? 0;
    if (waterfallBonus) {
      setTurnCount(prev => prev + waterfallBonus);
      addGameLog('system', `技能加成：瀑流回合 +${waterfallBonus}`);
    }
    const classDraw = skillDef.initialClassCardDraw ?? 0;
    if (classDraw) {
      const drawn = drawClassCardsToBackpack(classDraw, 'shop-skill-draw');
      if (drawn.length > 0) {
        addGameLog('skill', `技能加成：预抽 ${drawn.length} 张职业牌`);
        triggerClassDeckFlight(drawn);
      }
    }
    const shopLvBonus = skillDef.initialShopLevel;
    if (shopLvBonus != null && shopLvBonus > 0) {
      setShopLevel(prev => {
        const next = Math.min(MAX_SHOP_LEVEL, Math.max(prev, shopLvBonus));
        if (next > prev) {
          addGameLog('shop', `技能加成：商店等级提升至 Lv.${next}`);
        }
        return next;
      });
    }
    const backpackCap = skillDef.initialBackpackCapacityBonus ?? 0;
    if (backpackCap) {
      setBackpackCapacityModifier(prev => prev + backpackCap);
      addGameLog('skill', `技能加成：背包上限 +${backpackCap}`);
    }
    const handLimit = skillDef.initialHandLimitBonus ?? 0;
    if (handLimit) {
      setHandLimitBonus(prev => prev + handLimit);
      addGameLog('skill', `技能加成：手牌上限 +${handLimit}`);
    }
    const spellDmg = skillDef.initialSpellDamageBonus ?? 0;
    if (spellDmg) {
      setPermanentSpellDamageBonus(prev => prev + spellDmg);
      addGameLog('skill', `技能加成：永久法术伤害 +${spellDmg}`);
    }
    const shopHandDraw = skillDef.initialHandDraw ?? 0;
    if (shopHandDraw) {
      for (let i = 0; i < shopHandDraw; i++) {
        const drawn = drawFromBackpackToHand();
        if (drawn) addGameLog('skill', `技能加成：抽到手牌「${drawn.name}」`);
      }
    }
    if (skillId === 'summon-minion') {
      const minionCard: GameCardData = {
        id: `summon-minion-card-${Date.now()}`,
        type: 'monster',
        name: '小随从',
        value: 1,
        attack: 1,
        hp: 1,
        hpLayers: 4,
        fury: 4,
        currentLayer: 4,
        maxHp: 1,
        image: minionImage,
        description: '忠诚的小随从，可装备。每击杀一只怪物，攻击 +1、防御 +1。',
        isMinionCard: true,
      };
      addCardToBackpack(minionCard);
      addGameLog('skill', '技能加成：获得小随从');
    }
    if (skillId === 'heal-to-damage') {
      addCardToBackpack(createStarterHealEchoCard());
      addGameLog('skill', '愈战愈勇：获得永久魔法「治愈余韵」');
    }
  }, [addGameLog, setHeroSkillBanner, addCardToBackpack, drawClassCardsToBackpack, triggerClassDeckFlight]);

  const wasDraggedFromHand = (cardId: string) =>
    draggedCardSource === 'hand' && draggedCard?.id === cardId;

  const isCardFromHand = (card: GameCardData | string) => {
    const cardId = typeof card === 'string' ? card : card.id;
    return handCards.some(c => c.id === cardId) || wasDraggedFromHand(cardId);
  };

  const consumeCardFromHand = (card: GameCardData | string): boolean => {
    const cardId = typeof card === 'string' ? card : card.id;
    const draggedFromHand = wasDraggedFromHand(cardId);
    const existsInHand = handCards.some(c => c.id === cardId);

    if (!existsInHand && !draggedFromHand) {
      return false;
    }

    // Cancel any pending delivery guard / flight fallback so the card
    // cannot be re-inserted into the hand after consumption.
    const guard = pendingHandDeliveryGuardsRef.current.get(cardId);
    if (guard?.timeoutId !== null && guard?.timeoutId !== undefined && typeof window !== 'undefined') {
      window.clearTimeout(guard.timeoutId);
    }
    pendingHandDeliveryGuardsRef.current.delete(cardId);
    clearBackpackHandFallback(cardId);

    setHandCards(prev => {
      if (!prev.some(c => c.id === cardId)) {
        return prev;
      }
      const next = prev.filter(c => c.id !== cardId);
      handCardsRef.current = next;
      return next;
    });

    if (draggedFromHand) {
      setDraggedCard(null);
      setDraggedCardSource(current => (current === 'hand' ? null : current));
    }
    return true;
  };

  const discardAllHandCards = useCallback(async () => {
    const snapshot = [...handCardsRef.current];
    if (!snapshot.length) return;
    const flights = snapshot.map(card => ({
      card,
      promise: triggerDiscardFlight(card, isRecyclableFromHand(card) && card.type !== 'amulet' ? 'recycle-bag' : 'graveyard'),
    }));
    handCardsRef.current = [];
    setHandCards([]);
    await Promise.all(flights.map(f => f.promise));
    flights.forEach(f => discardCardToGraveyard(f.card, { owner: 'player' }));
  }, [discardCardToGraveyard, triggerDiscardFlight]);

  const drawCardsFromBackpack = (count: number) => {
    if (count <= 0) {
      return 0;
    }

    const availableHandSlots = Math.max(0, effectiveHandLimit - (handCards.length + backpackHandFlightsRef.current.length));
    if (availableHandSlots <= 0) {
      return 0;
    }

    const drawLimit = Math.min(count, availableHandSlots);
    const drawnCards = takeRandomCardsFromBackpack(drawLimit);
    if (!drawnCards.length) {
      return 0;
    }

    drawnCards.forEach(queueCardIntoHand);
    return drawnCards.length;
  };

  const applyMonsterReward = useCallback(
    async (option: MonsterRewardOption): Promise<boolean> => {
      const eff = option.effect;
      switch (eff.type) {
        case 'slotBonus': {
          const { slotId, bonusType, amount } = eff;
          setEquipmentSlotBonus(slotId, bonusType, value => value + amount);
          addGameLog('combat', `战利品：${describeSlotLabel(slotId)}永久 ${describeBonusLabel(bonusType)} +${amount}`);
          setHeroSkillBanner(`${describeSlotLabel(slotId)}永久 ${describeBonusLabel(bonusType)} +${amount}`);
          return true;
        }
        case 'gold': {
          setGold(prev => prev + eff.amount);
          addGameLog('combat', `战利品：获得 ${eff.amount} 金币`);
          setHeroSkillBanner(`获得 ${eff.amount} 金币。`);
          return true;
        }
        case 'heal': {
          const healed = healHero(eff.amount);
          addGameLog('combat', `战利品：回复 ${healed} 点生命`);
          setHeroSkillBanner(healed > 0 ? `回复 ${healed} 点生命。` : '生命已满，治疗溢出。');
          return true;
        }
        case 'repair': {
          addGameLog('combat', `战利品：修复装备耐久 +${eff.amount}`);
          return repairEquipmentDurability(eff.amount, eff.targets);
        }
        case 'drawBackpack': {
          const drawn = drawCardsFromBackpack(eff.amount);
          if (drawn > 0) {
            addGameLog('combat', `战利品：从背包抽出 ${drawn} 张牌`);
            setHeroSkillBanner(`从背包抽出了 ${drawn} 张牌。`);
            return true;
          }
          setHeroSkillBanner('无法抽牌：背包为空或手牌已满。');
          return false;
        }
        case 'discoverClass': {
          const started = beginDiscoverFlow('monster-reward');
          if (started) {
            addGameLog('combat', '战利品：发现一张专属牌');
            setHeroSkillBanner('发现了一张专属牌！');
            return true;
          }
          const fallbackSuccess = handleDiscoverFallback();
          if (fallbackSuccess) {
            addGameLog('combat', '战利品：发现失败，补一张牌');
            setHeroSkillBanner('职业卡不可用，改为补一张。');
            return true;
          }
          setGold(prev => prev + 3);
          addGameLog('combat', '战利品：发现失败，转化为 3 金币');
          setHeroSkillBanner('职业牌不可用，转化为 3 金币奖励。');
          return true;
        }
        case 'discoverGraveyard': {
          if (discardedCards.length === 0) {
            setGold(prev => prev + 3);
            addGameLog('combat', '战利品：坟场为空，转化为 3 金币');
            setHeroSkillBanner('坟场为空，转化为 3 金币奖励。');
            return true;
          }
          const selected = await requestGraveyardSelection(3);
          if (selected) {
            addGameLog('combat', `战利品：从坟场取回「${selected.name}」`);
            setHeroSkillBanner(`从坟场取回了「${selected.name}」！`);
          } else {
            addGameLog('combat', '战利品：放弃坟场取回');
          }
          return true;
        }
        case 'maxHp': {
          const amount = eff.amount;
          const newMaxHp = maxHp + amount;
          setPermanentMaxHpBonus(prev => prev + amount);
          setHp(prev => Math.min(newMaxHp, prev));
          addGameLog('combat', `战利品：最大生命永久 +${amount}`);
          setHeroSkillBanner(`最大生命永久 +${amount}`);
          return true;
        }
        case 'spellDamage': {
          const amount = eff.amount;
          setPermanentSpellDamageBonus(prev => prev + amount);
          addGameLog('combat', `战利品：法术伤害永久 +${amount}`);
          setHeroSkillBanner(`法术伤害永久 +${amount}`);
          return true;
        }
        case 'backpackCapacity': {
          const amount = eff.amount;
          setBackpackCapacityModifier(prev => prev + amount);
          addGameLog('combat', `战利品：背包上限永久 +${amount}`);
          setHeroSkillBanner(`背包上限永久 +${amount}`);
          return true;
        }
        default:
          return false;
      }
    },
    [
      addGameLog,
      beginDiscoverFlow,
      drawCardsFromBackpack,
      handleDiscoverFallback,
      healHero,
      maxHp,
      repairEquipmentDurability,
      setEquipmentSlotBonus,
      setGold,
      setHeroSkillBanner,
      setHp,
      setPermanentMaxHpBonus,
      setPermanentSpellDamageBonus,
      discardedCards,
      requestGraveyardSelection,
    ],
  );

  const handleMonsterRewardSelection = useCallback(
    async (optionId: string) => {
      pushUndoSnapshot();
      if (!activeMonsterReward) {
        return;
      }
      const selected = activeMonsterReward.options.find(option => option.id === optionId);
      if (!selected) {
        return;
      }
      addGameLog(
        'monster',
        `战利品〔${activeMonsterReward.monsterName}〕：选择「${selected.title}」`,
      );
      const resolved = await applyMonsterReward(selected);
      if (!resolved) {
        return;
      }
      const doneId = activeMonsterReward.monsterInstanceId;
      if (doneId) {
        monsterRewardQueuedInstanceIdsRef.current.delete(doneId);
      }
      setActiveMonsterReward(null);
    },
    [activeMonsterReward, addGameLog, applyMonsterReward],
  );

  const handleDeleteCardConfirm = useCallback(
    async (cardId: string, source: 'hand' | 'backpack' | 'recycleBag') => {
      if (deletingCardIdsRef.current.has(cardId)) return;
      deletingCardIdsRef.current.add(cardId);

      pushUndoSnapshot();
      let cardToDelete: GameCardData | null = null;

      if (source === 'hand') {
        cardToDelete = handCards.find(card => card.id === cardId) ?? null;
        if (!cardToDelete) {
          deletingCardIdsRef.current.delete(cardId);
          return;
        }
      } else if (source === 'backpack') {
        cardToDelete = backpackItems.find(card => card.id === cardId) ?? null;
        if (!cardToDelete) {
          deletingCardIdsRef.current.delete(cardId);
          return;
        }
      } else {
        cardToDelete = permanentMagicRecycleBag.find(card => card.id === cardId) ?? null;
        if (!cardToDelete) {
          deletingCardIdsRef.current.delete(cardId);
          return;
        }
      }

      const isDiscardAction = cardActionContext?.action === 'discard';

      const flightDest: 'graveyard' | 'recycle-bag' = isDiscardAction
        && cardActionContext?.discardToRecycleBag ? 'recycle-bag' : 'graveyard';
      const flightP = triggerDiscardFlight(cardToDelete, flightDest);

      if (source === 'hand') {
        const removed = consumeCardFromHand(cardToDelete!);
        if (!removed) {
          deletingCardIdsRef.current.delete(cardId);
          return;
        }
      } else if (source === 'backpack') {
        setBackpackItems(prev => prev.filter(card => card.id !== cardId));
      } else {
        setPermanentMagicRecycleBag(prev => prev.filter(card => card.id !== cardId));
      }

      cardActionRemainingRef.current = Math.max(0, cardActionRemainingRef.current - 1);
      const remaining = cardActionRemainingRef.current;

      if (cardActionContext?.mode === 'event') {
        if (remaining <= 0) {
          setDeleteModalOpen(false);
          setCardActionContext(null);
          const resolver = cardActionResolverRef.current;
          cardActionResolverRef.current = null;
          resolver?.();
        } else {
          setCardActionContext(context => (context ? { ...context, remainingCount: remaining } : context));
        }
      } else if (cardActionContext?.mode === 'shop') {
        setShopDeleteUsed(true);
        setDeleteModalOpen(false);
        setCardActionContext(null);
      } else {
        setDeleteModalOpen(false);
      }

      await flightP;

      const delLabel = isDiscardAction ? '弃置' : '删除';
      if (cardActionContext?.mode === 'shop') {
        addGameLog('shop', `商店：${isDiscardAction ? '弃牌' : '删牌'}「${cardToDelete.name}」`);
      } else if (cardActionContext?.mode === 'event') {
        addGameLog('event', `事件：${delLabel}「${cardToDelete.name}」`);
      } else {
        addGameLog('system', `${delLabel}卡牌：${cardToDelete.name}`);
      }
      if (!isDiscardAction) {
        addToGraveyard(cardToDelete);
      } else {
        const recycleBagDiscard =
          cardActionContext?.mode === 'event' &&
          Boolean(cardActionContext.discardToRecycleBag);
        if (recycleBagDiscard) {
          addPermanentMagicToRecycleBag(cardToDelete);
          applyDiscardSideEffects(cardToDelete, 'player');
        } else {
          discardCardToGraveyard(cardToDelete, { owner: 'player' });
        }
      }
    },
    [
      addGameLog,
      addPermanentMagicToRecycleBag,
      addToGraveyard,
      applyDiscardSideEffects,
      backpackItems,
      cardActionContext,
      consumeCardFromHand,
      discardCardToGraveyard,
      handCards,
      permanentMagicRecycleBag,
      triggerDiscardFlight,
    ],
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

  function handleHeroMagicCard(card: GameCardData) {
    const heroMagicId = card.heroMagicId as HeroMagicId | undefined;
    if (!heroMagicId) {
      finalizeMagicCard(card, { banner: '无法识别的英雄魔法卡。' });
      return;
    }

    const definition = getHeroMagicDefinition(heroMagicId);
    const status = heroMagicState[heroMagicId];
    logHeroMagic('card-play', {
      cardId: card.id,
      name: card.name,
      heroMagicId,
      status,
      fromHand: handCards.some(candidate => candidate.id === card.id),
      inBackpack: backpackItems.some(candidate => candidate.id === card.id),
    });

    if (!status || !status.unlocked) {
      unlockHeroMagic(heroMagicId);
      resetHeroMagicGauge(heroMagicId);
      logHeroMagic('unlock-request', {
        heroMagicId,
        nextState: { unlocked: true, gauge: 0, usedThisWave: false },
      });
      setHeroSkillBanner(`${definition.name} 技能已掌握！`);
      finalizeMagicCard(card, { banner: `${definition.name} 技能已掌握！` });
      return;
    }

    updateHeroMagicStateById(heroMagicId, current => ({
      ...current,
      gauge: definition.gaugeMax,
      usedThisWave: false,
    }));
    logHeroMagic('card-fill-gauge', {
      heroMagicId,
      readyState: status,
    });
    setHeroSkillBanner(`${definition.name} 数值槽已充满，可以手动发动！`);
    finalizeMagicCard(card, { banner: `${definition.name} 数值槽已充满！` });
  }

  const handleKnightInstantMagic = (card: KnightCardData): boolean => {
    if (!card.classCard || !card.knightEffect) {
      return false;
    }

    switch (card.knightEffect) {
      case 'blood-greed': {
        const goldEarned = Math.max(0, maxHp - hp);
        if (goldEarned > 0) {
          setGold(prev => prev + goldEarned);
        }
        addCardToBackpack(createGreedCurseCard(), { toBottom: true });
        consumeClassCardFromHand(card.id);

        let shopOpened = false;
        // 必须用塞入「贪婪」后的容量：若仍用旧的 backpackItems.length，会在「刚好差一格满」时误开商店，导致界面有钱但背包已满、购买按钮全灰。
        if (backpackItemsRef.current.length < backpackCapacity) {
          const offerings = generateShopOfferings();
          if (offerings.length > 0) {
            setShopOfferings(offerings);
            setShopSourceEvent(card);
            setShopDeleteUsed(false);
            setShopHealUsed(false);
            setShopLevelUpUsed(false);
            setShopSkillDiscoverUsed(false);
            setDeleteModalOpen(false);
            setShopModalOpen(true);
            setShopModalMinimized(false);
            shopOpened = true;
          }
        }

        const baseBanner = goldEarned > 0
          ? `嗜血贪欲让你获得 ${goldEarned} 金币（已损失生命），并将“贪婪”塞入背包。`
          : '当前满血，贪欲只留下“贪婪”。';
        finalizeMagicCard(card, {
          banner: shopOpened ? `${baseBanner}商店已开启！` : baseBanner,
        });
        return true;
      }
      case 'berserk-gambit': {
        const hpLoss = Math.max(0, hp - 1);
        if (hpLoss > 0) {
          applyDamage(hpLoss);
        }
        addBerserkTurnBuff(4);
        grantExtraAttackCharges(1);
        consumeClassCardFromHand(card.id);
        finalizeMagicCard(card, {
          banner: '狂血豪赌发动：本回合装备 +4 伤害并获得一次额外攻击机会。',
        });
        return true;
      }
      case 'death-ward': {
        setHeroSkillBanner('命悬一线会在你受到致死伤害时自动触发，无需主动打出。');
        return true;
      }
      case 'graveyard-recall': {
        consumeClassCardFromHand(card.id);
        void resolveGraveyardRecall(card);
        return true;
      }
      default:
        return false;
    }
  };

  const handleKnightPermanentMagic = (card: KnightCardData): boolean => {
    if (!card.classCard || !card.knightEffect) {
      return false;
    }

    switch (card.knightEffect) {
      case 'armor-strike': {
        const shieldSlots = getEquipmentSlots().filter(slot => slot.item?.type === 'shield' || slot.item?.type === 'monster');
        consumeClassCardFromHand(card.id);
        if (shieldSlots.length === 0) {
          finalizeMagicCard(card, { banner: '没有可转化为伤害的护甲。' });
          return true;
        }
        if (shieldSlots.length === 1) {
          const slotId = shieldSlots[0].id;
          const armorValue = calculateSlotArmorValue(slotId);
          if (armorValue <= 0) {
            finalizeMagicCard(card, { banner: '该盾牌目前没有可用的护甲。' });
            return true;
          }
          const monsters = flattenActiveRowSlots(activeCards).filter(c => c?.type === 'monster');
          if (monsters.length === 1) {
            const totalDamage = getSpellDamage(armorValue);
            if (!isMonsterEngaged(monsters[0].id)) beginCombat(monsters[0], 'hero');
            dealDamageToMonster(monsters[0], totalDamage, { pulses: 2 });
            finalizeMagicCard(card, { banner: `御甲破击造成 ${totalDamage} 点伤害。` });
            return true;
          }
          setPendingMagicAction({
            card,
            effect: 'armor-strike',
            step: 'monster-select',
            slotId,
            pendingDamage: armorValue,
            prompt: `选择一个怪物，承受 ${getSpellDamage(armorValue)} 点护甲伤害。`,
          });
          setHeroSkillBanner('选择一个怪物承受你的护甲一击。');
          return true;
        }
        setPendingMagicAction({
          card,
          effect: 'armor-strike',
          step: 'slot-select',
          prompt: '选择一个盾牌槽，将其护甲值转化为伤害。',
        });
        setHeroSkillBanner('选择一个盾牌，将护甲值转化为伤害。');
        return true;
      }
      case 'missing-hp-smite': {
        const monsters = flattenActiveRowSlots(activeCards).filter(c => c?.type === 'monster');
        consumeClassCardFromHand(card.id);
        if (monsters.length === 0) {
          finalizeMagicCard(card, { banner: '当前没有可攻击的怪物。' });
          return true;
        }
        if (monsters.length === 1) {
          const missingHp = Math.max(0, maxHp - hp);
          if (missingHp <= 0) {
            finalizeMagicCard(card, { banner: '你处于满血状态，没有造成伤害。' });
            return true;
          }
          const totalDamage = getSpellDamage(missingHp);
          if (!isMonsterEngaged(monsters[0].id)) beginCombat(monsters[0], 'hero');
          dealDamageToMonster(monsters[0], totalDamage, { pulses: 2 });
          finalizeMagicCard(card, { banner: `残血裁决释放 ${totalDamage} 点伤害。` });
          return true;
        }
        setPendingMagicAction({
          card,
          effect: 'missing-hp-smite',
          step: 'monster-select',
          prompt: '选择一个怪物，承受你缺失生命的伤害。',
        });
        setHeroSkillBanner('选择一个怪物，承受你缺失生命的伤害。');
        return true;
      }
      case 'grave-nova': {
        consumeClassCardFromHand(card.id);
        finalizeMagicCard(card, { banner: '殉烈爆鸣就绪：当它被弃置时会爆裂。' });
        return true;
      }
      case 'recycle-flare': {
        consumeClassCardFromHand(card.id);
        const restored = restorePermanentMagicFromRecycleBag();
        const drawnCards = takeRandomCardsFromBackpack(Math.min(2, backpackItemsRef.current.length));
        drawnCards.forEach(c => queueCardIntoHand(c));
        const draws = drawnCards.length;
        const bannerParts: string[] = [];
        bannerParts.push(
          restored > 0 ? `回收袋返还 ${restored} 张牌。` : '回收袋里没有等待的卡牌。',
        );
        bannerParts.push(draws > 0 ? `抽到了 ${draws} 张牌。` : '没有抽到卡牌。');

        const hasForgeHeart = amuletSlotsRef.current.some(a => a?.amuletEffect === 'flip-gold');
        if (hasForgeHeart) {
          setAmuletSlots(prev => prev.filter(slot => slot?.amuletEffect !== 'flip-gold'));
          const recycleForgeAmulet: GameCardData = {
            id: `amulet-recycle-forge-${Date.now()}`,
            type: 'amulet',
            name: '回收熔炉',
            value: 0,
            image: balanceAmuletImage,
            description: '每从手牌里使用 5 张牌，将回收袋里的卡牌放回背包，然后抽 2 张牌。(可超手牌上限)',
            amuletEffect: 'recycle-forge',
          };
          queueCardIntoHand(recycleForgeAmulet);
          bannerParts.push('熔炉之心消散，回收灵焰翻转为「回收熔炉」加入手牌！');
          addGameLog('amulet', '回收灵焰与熔炉之心共鸣：熔炉之心消散，「回收熔炉」加入手牌！');
        }

        finalizeMagicCard(card, { banner: bannerParts.join(' ') });
        return true;
      }
      case 'chaos-dice': {
        consumeClassCardFromHand(card.id);
        void resolveChaosDice(card);
        return true;
      }
      default:
        return false;
    }
  };

  const resolveGraveyardRecall = async (card: GameCardData) => {
    clearUndoStack();
    const eligible = discardedCards.filter(c => c.id !== card.id);
    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    const recalled = shuffled.slice(0, Math.min(3, shuffled.length));

    recalled.forEach(c => {
      setDiscardedCards(prev => prev.filter(dc => dc.id !== c.id));
      addCardToBackpack(c);
    });

    const banner = recalled.length > 0
      ? `冥途拾遗从坟场召回了 ${recalled.length} 张牌：${recalled.map(c => c.name).join('、')}`
      : '坟场中没有可召回的卡牌。';

    addGameLog('magic', `魔法：${card.name} — ${banner}`);
    setHeroSkillBanner(banner);
    removeCard(card.id, false);
    setPendingMagicAction(null);

    if (card.flipTarget) {
      await applyCardFlip(card);
    } else {
      addToGraveyard(card);
    }
  };

  const resolveChaosDice = async (card: GameCardData) => {
    clearUndoStack();
    const diceResult = await requestDiceOutcome({
      title: '混沌骰运',
      subtitle: '掷出混沌之力',
      entries: [
        { id: 'chaos-1', range: [1, 4] as [number, number], label: '装备回手（满则回收袋）', effect: 'none' },
        { id: 'chaos-2', range: [5, 8] as [number, number], label: '发现 1 张专属（三选一）', effect: 'none' },
        { id: 'chaos-3', range: [9, 12] as [number, number], label: '临时混沌商店', effect: 'none' },
        { id: 'chaos-4', range: [13, 16] as [number, number], label: '雷击：随机 1 怪，基础伤 3（双段）', effect: 'none' },
        { id: 'chaos-5', range: [17, 20] as [number, number], label: '弃 2 抽 2', effect: 'none' },
      ],
    });
    if (!diceResult) {
      finalizeMagicCard(card, { banner: '混沌骰运已取消。' });
      return;
    }
    let banner = '混沌骰运没有产生任何效果。';

    switch (diceResult.id) {
      case 'chaos-1': {
        const equipmentSlots = getEquipmentSlots();
        let returned = 0;
        let toHand = 0;
        let toRecycle = 0;
        let handLoad = handCards.length + backpackHandFlightsRef.current.length;
        equipmentSlots.forEach(slot => {
          const allItems = [
            ...(slot.item ? [slot.item] : []),
            ...getEquipmentReserve(slot.id),
          ];
          clearEquipmentSlotById(slot.id);
          setEquipmentReserve(slot.id, []);
          allItems.forEach(item => {
            const sanitized = sanitizeCardMetadata(item);
            if (handLoad < effectiveHandLimit) {
              queueCardIntoHand(sanitized);
              handLoad += 1;
              toHand += 1;
            } else {
              addPermanentMagicToRecycleBag(sanitized);
              toRecycle += 1;
            }
            returned += 1;
          });
        });
        if (returned > 0) {
          addGameLog(
            'magic',
            `混沌骰运：收回 ${returned} 件装备（手牌 +${toHand}，回收袋 +${toRecycle}）。`,
          );
          if (toRecycle > 0 && toHand > 0) {
            banner = `混沌骰运：${toHand} 件回手牌，${toRecycle} 件因手牌已满进入回收袋（瀑流后回背包）。`;
          } else if (toRecycle > 0) {
            banner = `混沌骰运：${toRecycle} 件装备因手牌已满进入回收袋（瀑流后回背包）。`;
          } else {
            banner = `混沌骰运：${returned} 件装备回到了手牌。`;
          }
        } else {
          banner = '混沌骰运尝试归还装备，但你没有已装备的武器或盾牌。';
        }
        break;
      }
      case 'chaos-2': {
        const started = beginDiscoverFlow('chaos-dice');
        banner = started ? '混沌骰运：发现 1 张专属（三选一）。' : '混沌骰运想要发现卡牌，但卡组已耗尽。';
        break;
      }
      case 'chaos-3': {
        if (backpackItems.length >= backpackCapacity) {
          banner = '背包已满，混沌商店无法开启。';
          break;
        }
        const offerings = generateShopOfferings();
        if (!offerings.length) {
          banner = '混沌商店空无一物。';
          break;
        }
        setShopOfferings(offerings);
        setShopSourceEvent(card);
        setShopDeleteUsed(false);
        setShopHealUsed(false);
        setShopLevelUpUsed(false);
        setShopSkillDiscoverUsed(false);
        setDeleteModalOpen(false);
        setShopModalOpen(true);
        setShopModalMinimized(false);
        banner = '混沌骰运开启了一家临时商店！';
        break;
      }
      case 'chaos-4': {
        const monsters = flattenActiveRowSlots(activeCards).filter(
          (entry): entry is GameCardData => Boolean(entry && entry.type === 'monster'),
        );
        if (!monsters.length) {
          banner = '没有怪物可以承受混沌雷击。';
          break;
        }
        const target = monsters[getRandomInt(0, monsters.length - 1)];
        if (!isMonsterEngaged(target.id)) {
          beginCombat(target, 'hero');
        }
        const burstDamage = getSpellDamage(3);
        dealDamageToMonster(target, burstDamage, { pulses: 2 });
        dealDamageToMonster(target, burstDamage, {
          pulses: 2,
          animationDelay: Math.floor(COMBAT_ANIMATION_STAGGER / 2),
        });
        banner = `${target.name} 被混沌雷击连续打中，累计受到 ${burstDamage * 2} 点伤害！`;
        break;
      }
      case 'chaos-5': {
        const success = await requestCardAction('discard', 2, {
          title: '混沌骰运：弃 2 抽 2',
          description: '选择 2 张牌弃置（可来自手牌或背包）。',
        });
        if (!success) {
          banner = '没有足够的牌可供弃置，混沌骰运安静下来。';
          break;
        }
        const drawnNames: string[] = [];
        for (let i = 0; i < 2; i += 1) {
          const [drawnCard] = takeRandomCardsFromBackpack(1);
          if (!drawnCard) break;
          queueCardIntoHand(drawnCard);
          drawnNames.push(drawnCard.name);
        }
        banner = drawnNames.length > 0
          ? `你弃置了 2 张牌，从背包抽到了「${drawnNames.join('」「')}」。`
          : '你弃置了 2 张牌，但背包为空，未能抽牌。';
        break;
      }
      default:
        break;
    }

    finalizeMagicCard(card, { banner });
  };

  // Function to handle skill card effects - Defined early to be available for other handlers
  async function handleSkillCard(card: GameCardData) {
    const knightCard = card as KnightCardData;
    
    if (card.isCurse && knightCard.knightEffect === 'greed-curse') {
      setGold(prev => Math.max(0, prev - 3));
      finalizeMagicCard(card, { banner: '贪婪诅咒消耗了 3 金币。' });
      return;
    }
    if (card.isCurse) {
      applyDamage(3);
      finalizeMagicCard(card, { banner: '血咒吸取了 3 点生命。' });
      return;
    }

    const isEchoTriggered = doubleNextMagic && card.type === 'magic' && card.magicEffect !== 'double-next-magic';
    if (isEchoTriggered) {
      setDoubleNextMagic(false);
      addGameLog('magic', `法术回响：${card.name} 的效果将触发两次！`);
      setHeroSkillBanner(`法术回响！${card.name} 效果触发两次！`);
    }
    const echoMultiplier = isEchoTriggered ? 2 : 1;

    if (card.magicEffect === 'honor-blood') {
      applyDamage(1);
      const repairableSlots = getEquipmentSlots().filter(slot => {
        if (!slot.item) return false;
        const maxDurability = slot.item.maxDurability ?? slot.item.durability ?? 0;
        const currentDurability = slot.item.durability ?? maxDurability;
        return maxDurability > 0 && currentDurability < maxDurability;
      });
      if (repairableSlots.length === 0) {
        finalizeMagicCard(card, { banner: '战血之印：失去 1 点生命；没有可恢复耐久的装备。' });
        return;
      }
      if (repairableSlots.length === 1) {
        const repairAmount = 1 * echoMultiplier;
        const slot = repairableSlots[0];
        const slotItem = slot.item!;
        const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
        const currentDurability = slotItem.durability ?? maxDurability;
        setEquipmentSlotById(slot.id, {
          ...slotItem,
          durability: Math.min(maxDurability, currentDurability + repairAmount),
        });
        finalizeMagicCard(card, {
          banner: `战血之印：失去 1 点生命，${slotItem.name} 恢复 ${repairAmount} 点耐久。${isEchoTriggered ? '（回响×2）' : ''}`,
        });
        return;
      }
      setPendingMagicAction({
        card,
        effect: 'repair-one',
        step: 'slot-select',
        prompt: `战血之印：选择一件装备恢复 ${1 * echoMultiplier} 点耐久。`,
        echoMultiplier,
      });
      setHeroSkillBanner(
        `战血之印失去 1 点生命，请选择一件装备恢复 ${1 * echoMultiplier} 点耐久。${isEchoTriggered ? '（回响×2）' : ''}`,
      );
      return;
    }

     if (card.type === 'hero-magic') {
       handleHeroMagicCard(card);
       return;
     }
    
    if (card.magicType === 'instant') {
      if (handleKnightInstantMagic(knightCard)) {
        return;
      }
      // Execute instant skill effect
      switch (card.name) {
        // Base game skills
        case '瀑流重置': {
          cascadeResetWaterfallRef.current = true;
          const activeRowCards = flattenActiveRowSlots(activeCards).filter(c => c.id !== card.id);
          if (activeRowCards.length > 0) {
            setActiveCards(createEmptyActiveRow());
            setRemainingDeck(prev => [...prev, ...activeRowCards]);
            queueWaterfallTimeout(() => {
              triggerWaterfall();
            }, 50);
          } else {
            triggerWaterfall();
          }
          finalizeMagicCard(card, { banner: '瀑流重置：当前波次已置于牌堆底。' });
          return;
        }
        case '风暴箭雨': {
          const monsters = flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster');
          if (monsters.length === 0) {
            finalizeMagicCard(card, { banner: '风暴箭雨无效（没有怪物）。' });
            return;
          }
          const volleyDamage = getSpellDamage(3) * echoMultiplier;
          monsters.forEach((monster, index) => {
            if (!isMonsterEngaged(monster.id)) {
              beginCombat(monster, 'hero');
            }
            const animationDelay = index * Math.floor(COMBAT_ANIMATION_STAGGER * 0.75);
            dealDamageToMonster(monster, volleyDamage, { animationDelay, pulses: 2 });
          });
          if (monsters.length >= 4) {
            const flippedCard: GameCardData = {
              id: `${card.id}-flip-storm-volley`,
              type: 'magic',
              name: '箭雨余韵',
              value: 0,
              image: skillScrollImage,
              magicType: 'permanent',
              magicEffect: 'storm-volley-recycle',
              description: '对激活行所有怪物造成 1 点伤害，每击中一个怪物，从回收袋随机抽 1 张牌加入手牌。',
            };
            addGameLog('magic', `风暴箭雨命中 ${monsters.length} 只怪物，翻转为「箭雨余韵」！`);
            removeCard(card.id, false);
            setPendingMagicAction(null);
            await triggerEventTransform(card, flippedCard, '风暴箭雨翻转为「箭雨余韵」');
            addCardToBackpack(flippedCard);
            setHeroSkillBanner(`风暴箭雨命中 ${monsters.length} 只怪物，对每只造成 ${volleyDamage} 点伤害！翻转为「箭雨余韵」！`);
            return;
          }
          finalizeMagicCard(card, { banner: `风暴箭雨对每只怪物造成 ${volleyDamage} 点伤害！${isEchoTriggered ? '（回响×2）' : ''}` });
          return;
        }
        case '回响行囊': {
          const echoDiscard = 2 * echoMultiplier;
          const echoDiscover = 2 * echoMultiplier;
          const echoDraw = 2 * echoMultiplier;
          const wasPlayedFromHand = handCards.some(c => c.id === card.id);
          const actualHandCount = handCards.length - (wasPlayedFromHand ? 1 : 0);
          const discardCount = Math.min(echoDiscard, actualHandCount);
          const bannerParts: string[] = [];

          // --- Phase 1: Discard (fully resolve before continuing) ---
          if (discardCount > 0) {
            if (actualHandCount <= echoDiscard) {
              const cardsToDiscard = handCards.filter(c => c.id !== card.id);
              const flights = cardsToDiscard.map(hc => ({
                card: hc,
                promise: triggerDiscardFlight(hc, isRecyclableFromHand(hc) && hc.type !== 'amulet' ? 'recycle-bag' : 'graveyard'),
              }));
              const discardIds = new Set(cardsToDiscard.map(c => c.id));
              handCardsRef.current = handCardsRef.current.filter(c => !discardIds.has(c.id));
              setHandCards(handCardsRef.current);
              await Promise.all(flights.map(f => f.promise));
              flights.forEach(f => discardCardToGraveyard(f.card, { owner: 'player' }));
              bannerParts.push(`弃置了 ${cardsToDiscard.length} 张手牌。`);
            } else {
              const success = await requestCardAction('discard', echoDiscard, {
                title: `回响行囊：弃置手牌${isEchoTriggered ? '（回响×2）' : ''}`,
                description: `选择 ${echoDiscard} 张手牌弃置。`,
                handOnly: true,
              });
              if (!success) {
                finalizeMagicCard(card, { banner: '回响行囊取消。' });
                return;
              }
              bannerParts.push(`弃置了 ${echoDiscard} 张手牌。`);
            }
          } else {
            bannerParts.push('没有手牌可弃。');
          }

          // Yield a microtask so React flushes state from the discard phase;
          // discardedCardsRef is also eagerly updated so the snapshot below is fresh.
          await new Promise<void>(r => { setTimeout(r, 0); });

          // --- Phase 2: Discover (use fresh graveyard via ref) ---
          let discovered = 0;
          const selectedDiscoverIds = new Set<string>();
          graveyardDiscoverDeliveryRef.current = 'hand-first';

          for (let di = 0; di < echoDiscover; di++) {
            const freshGraveyard = discardedCardsRef.current;
            const available = freshGraveyard.filter(c => !selectedDiscoverIds.has(c.id));
            if (available.length === 0) break;

            const shuffled = [...available].sort(() => Math.random() - 0.5);
            const options = shuffled.slice(0, Math.min(3, shuffled.length));

            const selected = await new Promise<GameCardData | null>(resolve => {
              graveyardDiscoverResolverRef.current = selectedCard => {
                resolve(selectedCard);
                graveyardDiscoverResolverRef.current = null;
              };
              setGraveyardDiscoverState(options);
            });

            if (selected) {
              selectedDiscoverIds.add(selected.id);
              discovered++;
            } else {
              break;
            }
          }

          if (discovered > 0) {
            bannerParts.push(`从坟场发现了 ${discovered} 张牌。`);
          } else if (discardedCardsRef.current.length === 0) {
            bannerParts.push('坟场为空。');
          }

          // Yield so React flushes discover state before drawing
          await new Promise<void>(r => { setTimeout(r, 0); });

          // --- Phase 3: Draw (after discover is fully resolved) ---
          const drawnCards = takeRandomCardsFromBackpack(echoDraw);
          drawnCards.forEach(c => queueCardIntoHand(c));
          if (drawnCards.length > 0) {
            bannerParts.push(`从背包抽了 ${drawnCards.length} 张牌。`);
          } else {
            bannerParts.push('背包为空。');
          }

          if (isEchoTriggered) bannerParts.push('（回响×2）');
          finalizeMagicCard(card, { banner: bannerParts.join(' ') });
          return;
        }
        case '壁垒猛击': {
          const newStacks = bulwarkPassiveActive + 1;
          setBulwarkPassiveActive(newStacks);
          if (!permanentSkills.includes('壁垒猛击')) {
            setPermanentSkills(prev => [...prev, '壁垒猛击']);
          }
          const stackLabel = newStacks > 1 ? `（×${newStacks}层）` : '';
          addGameLog('magic', `壁垒猛击激活${stackLabel}：之后每次瀑流，随机一侧装备栏永久护甲 +${newStacks}`);
          finalizeMagicCard(card, { banner: `壁垒猛击激活${stackLabel}！之后每次瀑流，随机装备栏永久护甲 +1 触发 ${newStacks} 次。` });
          return;
        }
        case '血债清算': {
          const monsters = flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster');
          if (monsters.length === 0) {
            finalizeMagicCard(card, { banner: '血债清算无效（没有怪物）。' });
            return;
          }
          if (monsters.length === 1) {
            const totalDamage = getSpellDamage(gold) * echoMultiplier;
            if (!isMonsterEngaged(monsters[0].id)) beginCombat(monsters[0], 'hero');
            dealDamageToMonster(monsters[0], totalDamage, { pulses: 2 });
            const healed = healHero(totalDamage);
            const healText = healed > 0 ? `，恢复 ${healed} 点生命` : '';
            finalizeMagicCard(card, { banner: `血债清算造成 ${totalDamage} 点伤害${healText}！${isEchoTriggered ? '（回响×2）' : ''}` });
            return;
          }
          setPendingMagicAction({
            card,
            effect: 'blood-reckoning',
            step: 'monster-select',
            echoMultiplier,
            prompt: `选择一个怪物，造成 ${getSpellDamage(gold) * echoMultiplier} 点伤害并恢复等量生命。${isEchoTriggered ? '（回响×2）' : ''}`,
          });
          setHeroSkillBanner('血债清算就绪，请选择目标怪物。');
          return;
        }
        case '永恒修复': {
          const isWeaponSlot = (slot: { id: string; item: GameCardData | null }) =>
            slot.item != null && (slot.item.type === 'weapon' || slot.item.type === 'monster');
          const weaponSlots = getEquipmentSlots().filter(isWeaponSlot);
          if (weaponSlots.length === 0) {
            finalizeMagicCard(card, { banner: '永恒修复无效（没有已装备的武器或随从）。' });
            return;
          }
          if (weaponSlots.length === 1 && echoMultiplier <= 1) {
            const slot = weaponSlots[0];
            setUnbreakableUntilWaterfall(prev => ({ ...prev, [slot.id]: true }));
            addGameLog('magic', `${slot.item!.name} 在下个瀑流前使用不消耗耐久。`);
            finalizeMagicCard(card, { banner: `${slot.item!.name} 获得永恒修复（瀑流前不消耗耐久）。` });
            return;
          }
          const eternalEchoLabel = echoMultiplier > 1 ? `（回响：第 1/${echoMultiplier} 次）` : '';
          setPendingMagicAction({
            card,
            effect: 'eternal-repair',
            step: 'slot-select',
            prompt: `选择一件武器或随从，瀑流前使用不消耗耐久。${eternalEchoLabel}`,
            echoRemaining: echoMultiplier,
          });
          setHeroSkillBanner(`请选择要赋予永恒修复的武器或随从。${eternalEchoLabel}`);
          return;
        }
          
        // Knight weapon enhancement skills
        case 'Sharpening Stone':
          setWeaponMasterBonus(prev => prev + 1);
          addGameLog('skill', '磨刀石：永久武器伤害 +1');
          break;
        case 'Dual Strike':
          addGameLog('skill', '双重打击：下次攻击双倍');
          break;
        case 'Weapon Surge':
          setNextWeaponBonus(prev => prev + 3);
          addGameLog('skill', '武器强化：下次武器伤害 +3');
          break;
        case 'Battle Ready': {
          const weaponCards = classDeck.filter(c => c.type === 'weapon');
          if (weaponCards.length > 0) {
            clearUndoStack();
            const weapon = weaponCards[Math.floor(Math.random() * weaponCards.length)];
            setClassCardsInHand(prev => [...prev, weapon as KnightCardData]);
            setClassDeck(prev => prev.filter(c => c.id !== weapon.id));
            addGameLog('skill', `战备就绪：从职业牌组抽取武器「${weapon.name}」`);
          } else {
            addGameLog('skill', '战备就绪：职业牌组没有武器');
          }
          break;
        }
          
        // Knight defensive skills
        case 'Shield Wall':
          setNextShieldBonus(prev => prev + 2);
          setShieldMasterBonus(prev => prev + 2);
          addGameLog('skill', '盾墙：下次护盾 +2，永久护盾 +2');
          break;
        case 'Defensive Stance':
          setDefensiveStanceActive(true);
          addGameLog('skill', '防御姿态：激活');
          break;
        case 'Iron Defense':
          setTempShield(prev => prev + 5);
          addGameLog('skill', '铁壁防御：临时护盾 +5');
          break;
          
        // Knight blood skills
        case 'Blood Sacrifice':
          if (hp > 3) {
            applyDamage(3);
            setNextWeaponBonus(prev => prev + 3);
            addGameLog('skill', '鲜血献祭：失去 3 点生命，下次武器伤害 +3');
          }
          break;
        case 'Vampiric Strike':
          setVampiricNextAttack(true);
          addGameLog('skill', '吸血打击：下次攻击吸取生命');
          break;
        case 'Blood for Power':
          if (hp > 5) {
            applyDamage(5);
            setGold(prev => prev + 10);
            addGameLog('skill', '以血换力：失去 5 点生命，获得 10 金币');
          }
          break;
        case 'Crimson Shield':
          if (hp > 2) {
            applyDamage(2);
            setTempShield(prev => prev + 6);
            addGameLog('skill', '血色之盾：失去 2 点生命，临时护盾 +6');
          }
          break;
        case 'Life Transfer':
          if (hp > 3) {
            applyDamage(3);
            setNextWeaponBonus(prev => prev + 3);
            addGameLog('skill', '生命转移：失去 3 点生命，下次武器伤害 +3');
          }
          break;
          
        // Knight durability skills
        case 'Reinforced Equipment':
          setUnbreakableNext(true);
          addGameLog('skill', '强化装备：下次使用装备不消耗耐久');
          break;
        case 'Repair Kit':
          addGameLog('skill', '修理套件');
          break;
        case 'Spare Weapons':
          addGameLog('skill', '备用武器');
          break;
        case 'Emergency Repair': {
          const slots = getEquipmentSlots();
          slots.forEach(slot => {
            if (slot.item && slot.item.durability) {
              const repaired = { ...slot.item, durability: Math.min(slot.item.maxDurability || 3, slot.item.durability + 2) };
              setEquipmentSlotById(slot.id, repaired);
            }
          });
          addGameLog('skill', '紧急修复：所有装备耐久 +2');
          break;
        }
        case 'Salvage':
          addGameLog('skill', '废物利用');
          break;
        case 'Field Maintenance': {
          const allSlots = getEquipmentSlots();
          allSlots.forEach(slot => {
            if (slot.item && slot.item.durability) {
              const maintained = { ...slot.item, durability: slot.item.durability + 1, maxDurability: (slot.item.maxDurability || slot.item.durability) + 1 };
              setEquipmentSlotById(slot.id, maintained);
            }
          });
          addGameLog('skill', '野战维护：所有装备耐久 +1 且上限 +1');
          break;
        }
        case '余烬回响': {
          setPermanentSpellDamageBonus(prev => prev + echoMultiplier);
          const emberParts: string[] = [];
          emberParts.push(`法术伤害永久 +${echoMultiplier}。`);
          for (let i = 0; i < echoMultiplier; i++) {
            const drawn = drawFromBackpackToHand();
            if (drawn) emberParts.push(`抽了 1 张牌（${drawn.name}）。`);
          }
          if (isEchoTriggered) emberParts.push('（回响×2）');
          finalizeMagicCard(card, { banner: emberParts.join(' ') });
          return;
        }
        case '秘典检索': {
          const bpMagics = backpackItems.filter(c => c.type === 'magic');
          if (bpMagics.length === 0) {
            finalizeMagicCard(card, { banner: '背包中没有魔法牌，秘典检索无效。' });
            return;
          }
          const shuffledBp = [...bpMagics].sort(() => Math.random() - 0.5);
          const discoverOptions = shuffledBp.slice(0, Math.min(3, shuffledBp.length));
          if (discoverOptions.length === 1) {
            const pick = discoverOptions[0];
            setBackpackItems(prev => prev.filter(c => c.id !== pick.id));
            ensureCardInHand(pick);
            addGameLog('magic', `秘典检索：从背包取出「${pick.name}」加入手牌。`);
            finalizeMagicCard(card, { banner: `从背包取出「${pick.name}」！` });
            return;
          }
          const selected = await new Promise<GameCardData | null>(resolve => {
            graveyardDiscoverResolverRef.current = c => {
              resolve(c);
              graveyardDiscoverResolverRef.current = null;
            };
            setGraveyardDiscoverState(discoverOptions);
          });
          if (selected) {
            setBackpackItems(prev => prev.filter(c => c.id !== selected.id));
            ensureCardInHand(selected);
            addGameLog('magic', `秘典检索：从背包取出「${selected.name}」加入手牌。`);
            finalizeMagicCard(card, { banner: `从背包取出「${selected.name}」！` });
          } else {
            finalizeMagicCard(card, { banner: '放弃了秘典检索。' });
          }
          return;
        }
        case '混沌冲击': {
          const chaosMons = flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster');
          if (chaosMons.length === 0) {
            finalizeMagicCard(card, { banner: '混沌冲击无效（没有怪物）。' });
            return;
          }
          if (chaosMons.length === 1 && echoMultiplier <= 1) {
            const target = chaosMons[0];
            if (!isMonsterEngaged(target.id)) beginCombat(target, 'hero');
            const chaosDamage = getSpellDamage(3);
            const removedExactlyOneLayer = chaosStrikeRemovedExactlyOneLayer(target, chaosDamage);
            dealDamageToMonster(target, chaosDamage);
            if (removedExactlyOneLayer) {
              const drawn = drawCardsFromBackpack(2);
              finalizeMagicCard(card, { banner: `混沌冲击对 ${target.name} 造成 ${chaosDamage} 伤害，恰好减去一层！额外抽 ${drawn} 张牌。` });
            } else {
              finalizeMagicCard(card, { banner: `混沌冲击对 ${target.name} 造成 ${chaosDamage} 点伤害。` });
            }
          } else {
            const chaosDamage = getSpellDamage(3);
            const chaosEchoLabel = echoMultiplier > 1 ? `（回响：第 1/${echoMultiplier} 次）` : '';
            setPendingMagicAction({
              card,
              effect: 'chaos-strike',
              step: 'monster-select',
              prompt: `选择一个怪物，对其造成 ${chaosDamage} 点伤害。${chaosEchoLabel}`,
              data: {},
              echoRemaining: echoMultiplier,
            });
            setHeroSkillBanner(`选择一个怪物，对其造成 3 点伤害。${chaosEchoLabel}`);
          }
          return;
        }
      }
      
      // Handle class card removal
      if (knightCard.classCard) {
        consumeClassCardFromHand(card.id);
      }
      
      addToGraveyard(card);
      removeCard(card.id, false);
    } else if (card.magicType === 'permanent') {
      if (handleKnightPermanentMagic(knightCard)) {
        return;
      }
      if (card.name === '哥布林的戏法') {
        const otherHandCards = handCards.filter(c => c.id !== card.id);
        const count = otherHandCards.length;
        if (count === 0) {
          finalizeMagicCard(card, { banner: '手中没有其他牌可以刷新。' });
          return;
        }
        for (const hc of otherHandCards) {
          const sanitized = sanitizeCardMetadata(hc);
          sanitized._recycleWaits = sanitized.recycleDelay ?? 1;
          setPermanentMagicRecycleBag(prev => [...prev.filter(e => e.id !== sanitized.id), sanitized]);
          applyDiscardSideEffects(hc, 'player');
        }
        setHandCards(prev => prev.filter(c => c.id === card.id));
        const drawn: GameCardData[] = [];
        for (let i = 0; i < count; i++) {
          const [d] = takeRandomCardsFromBackpack(1);
          if (d) drawn.push(d);
        }
        if (drawn.length > 0) {
          for (const d of drawn) queueCardIntoHand(d);
        }
        addGameLog('magic', `哥布林的戏法：${count} 张手牌洗入回收袋，抽了 ${drawn.length} 张新牌。`);
        finalizeMagicCard(card, { banner: `哥布林的戏法：刷新了 ${count} 张手牌！` });
        return;
      }
      switch (card.id) {
        case STARTER_CARD_IDS.weaponBurst: {
          const weaponSlots = getEquipmentSlots().filter(slot => slot.item?.type === 'weapon' || slot.item?.type === 'monster');
          if (weaponSlots.length === 0) {
            finalizeMagicCard(card, { banner: '当前没有可以强化的武器。' });
            return;
          }
          if (weaponSlots.length === 1) {
            const burstAmount = 3 * echoMultiplier;
            const slotId = weaponSlots[0].id;
            setSlotAttackBursts(prev => ({
              ...prev,
              [slotId]: (prev[slotId] ?? 0) + burstAmount,
            }));
            finalizeMagicCard(card, {
              banner: `${weaponSlots[0].item!.name} 的下一次攻击将额外造成 ${burstAmount} 点伤害。${isEchoTriggered ? '（回响×2）' : ''}`,
            });
            return;
          }
          setPendingMagicAction({
            card,
            effect: 'weapon-burst',
            step: 'slot-select',
            prompt: `选择一个武器，使其下一次攻击 +${3 * echoMultiplier}。`,
            echoMultiplier,
          });
          setHeroSkillBanner(`选择一个武器，使其下一次攻击 +${3 * echoMultiplier}。`);
          return;
        }
        case STARTER_CARD_IDS.repairOne: {
          const repairableSlots = getEquipmentSlots().filter(slot => {
            if (!slot.item) {
              return false;
            }
            const maxDurability = slot.item.maxDurability ?? slot.item.durability ?? 0;
            const currentDurability = slot.item.durability ?? maxDurability;
            return maxDurability > 0 && currentDurability < maxDurability;
          });
          if (repairableSlots.length === 0) {
            finalizeMagicCard(card, { banner: '所有装备都处于满耐久状态。' });
            return;
          }
          if (repairableSlots.length === 1) {
            const repairAmount = 1 * echoMultiplier;
            const slot = repairableSlots[0];
            const slotItem = slot.item!;
            const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
            const currentDurability = slotItem.durability ?? maxDurability;
            setEquipmentSlotById(slot.id, {
              ...slotItem,
              durability: Math.min(maxDurability, currentDurability + repairAmount),
            });
            finalizeMagicCard(card, { banner: `${slotItem.name} 恢复了 ${repairAmount} 点耐久。${isEchoTriggered ? '（回响×2）' : ''}` });
            return;
          }
          setPendingMagicAction({
            card,
            effect: 'repair-one',
            step: 'slot-select',
            prompt: `选择一件装备恢复 ${1 * echoMultiplier} 点耐久。`,
            echoMultiplier,
          });
          setHeroSkillBanner(`选择一件装备恢复 ${1 * echoMultiplier} 点耐久。`);
          return;
        }
        case STARTER_CARD_IDS.discardDraw: {
          const discardCount = 1 * echoMultiplier;
          const drawCount = 2 * echoMultiplier;
          const wasPlayedFromHand = handCards.some(c => c.id === card.id);
          const actualHandCount = handCards.length - (wasPlayedFromHand ? 1 : 0);
          const echoTag = isEchoTriggered ? '（回响×2）' : '';

          const finishTideDraws = () => {
            for (let di = 0; di < drawCount; di++) {
              const [drawnCard] = takeRandomCardsFromBackpack(1);
              if (drawnCard) {
                queueCardIntoHand(drawnCard);
              }
            }
          };

          if (actualHandCount === 0) {
            finalizeMagicCard(card, { banner: `没有手牌可弃。${echoTag}` });
            finishTideDraws();
            return;
          }

          if (actualHandCount <= discardCount) {
            const others = handCards.filter(c => c.id !== card.id);
            const victims = others.slice(0, Math.min(discardCount, others.length));
            const flights = victims.map(hc => ({
              card: hc,
              promise: triggerDiscardFlight(hc, 'recycle-bag'),
            }));
            const victimIds = new Set(victims.map(v => v.id));
            handCardsRef.current = handCardsRef.current.filter(c => !victimIds.has(c.id) && c.id !== card.id);
            setHandCards(handCardsRef.current);
            await Promise.all(flights.map(f => f.promise));
            flights.forEach(f => {
              addPermanentMagicToRecycleBag(f.card);
              applyDiscardSideEffects(f.card, 'player');
            });
            finalizeMagicCard(card, {
              banner: `自动弃置 ${actualHandCount} 张手牌到回收袋。${echoTag}`,
            });
            finishTideDraws();
            return;
          }

          void requestCardAction('discard', discardCount, {
            title: `汰旧迎新：选择 ${discardCount} 张手牌弃置到回收袋${echoTag}`,
            description: `选择 ${discardCount} 张手牌弃置到回收袋。`,
            handOnly: true,
            discardToRecycleBag: true,
          }).then(discardSuccess => {
            if (!discardSuccess) {
              finalizeMagicCard(card, { banner: '弃牌取消。' });
              return;
            }
            const drawnNames: string[] = [];
            for (let di = 0; di < drawCount; di++) {
              const [drawnCard] = takeRandomCardsFromBackpack(1);
              if (drawnCard) {
                queueCardIntoHand(drawnCard);
                drawnNames.push(drawnCard.name);
              }
            }
            finalizeMagicCard(card, { banner: `弃置 ${discardCount} 张手牌到回收袋。${echoTag}` });
            if (drawnNames.length > 0) {
              setHeroSkillBanner(
                `弃置 ${discardCount} 张手牌到回收袋，从背包抽到 ${drawnNames.join('、')}。${echoTag}`,
              );
            } else {
              setHeroSkillBanner(
                `弃置 ${discardCount} 张手牌到回收袋，但背包为空或手牌已满。${echoTag}`,
              );
            }
          });
          return;
        }
        case STARTER_CARD_IDS.reshuffle: {
          const dungeonCards = flattenActiveRowSlots(activeCards);
          if (dungeonCards.length === 0) {
            finalizeMagicCard(card, { banner: '当前没有可置于牌堆底的地城卡牌。' });
            return;
          }
          if (dungeonCards.length === 1 && echoMultiplier <= 1) {
            const target = dungeonCards[0];
            removeCard(target.id, false);
            const sanitizedCard = sanitizeCardMetadata(target);
            setRemainingDeck(prev => [...prev, sanitizedCard]);
            finalizeMagicCard(card, { banner: `${target.name} 已置于牌堆底。` });
            return;
          }
          echoRemainingRef.current = echoMultiplier;
          echoTotalRef.current = echoMultiplier;
          const echoLabel = echoMultiplier > 1 ? `（回响：第 1/${echoMultiplier} 次）` : '';
          setPendingMagicAction({
            card,
            effect: 'return-dungeon-bottom',
            step: 'dungeon-select',
            prompt: `选择一张地城卡牌，置于牌堆底。${echoLabel}`,
            echoRemaining: echoMultiplier,
          });
          setHeroSkillBanner(`选择一张地城卡牌，置于牌堆底。${echoLabel}`);
          return;
        }
        case STARTER_CARD_IDS.dungeonSwap: {
          let leftIdx = -1;
          let rightIdx = -1;
          for (let i = 0; i < activeCards.length; i++) {
            if (activeCards[i] != null) {
              if (leftIdx === -1) leftIdx = i;
              rightIdx = i;
            }
          }
          if (leftIdx === -1 || leftIdx === rightIdx) {
            finalizeMagicCard(card, { banner: '乾坤挪移无效（地城行剩余卡牌不足 2 张）。' });
            return;
          }
          const leftCard = activeCards[leftIdx]!;
          const rightCard = activeCards[rightIdx]!;
          for (let swapI = 0; swapI < echoMultiplier; swapI++) {
            setActiveCards(prev => {
              const next = [...prev] as ActiveRowSlots;
              const tmp = next[leftIdx];
              next[leftIdx] = next[rightIdx];
              next[rightIdx] = tmp;
              return next;
            });
          }
          const swapBanner = echoMultiplier > 1
            ? `乾坤挪移 ×${echoMultiplier}：${leftCard.name} ↔ ${rightCard.name}（回响）`
            : `${leftCard.name} ↔ ${rightCard.name} 位置互换！`;
          addGameLog('magic', `乾坤挪移：${leftCard.name} 与 ${rightCard.name} 互换 ${echoMultiplier} 次。`);
          finalizeMagicCard(card, { banner: swapBanner });
          return;
        }
        case 'potion-flip-heal':
        case STARTER_CARD_IDS.healEcho: {
          const healed = healHero(2 * echoMultiplier);
          const banner = healed > 0
            ? `治愈余韵生效，恢复 ${healed} 点生命。${isEchoTriggered ? '（回响×2）' : ''}`
            : '生命值已满，治愈余韵未生效。';
          finalizeMagicCard(card, { banner });
          return;
        }
        case 'guild-blood-gold': {
          applyDamage(1 * echoMultiplier);
          setGold(prev => prev + 2 * echoMultiplier);
          addGameLog('magic', `血金术：受到 ${1 * echoMultiplier} 点伤害，获得 ${2 * echoMultiplier} 金币`);
          finalizeMagicCard(card, { banner: `血金术：以 ${1 * echoMultiplier} 点生命换取 ${2 * echoMultiplier} 金币。${isEchoTriggered ? '（回响×2）' : ''}` });
          return;
        }
        default: {
          if (card.magicEffect === 'storm-volley-recycle') {
            const svMonsters = flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster');
            if (svMonsters.length === 0) {
              finalizeMagicCard(card, { banner: '箭雨余韵无效（没有怪物）。' });
              return;
            }
            const svDamage = getSpellDamage(1) * echoMultiplier;
            svMonsters.forEach((monster, index) => {
              if (!isMonsterEngaged(monster.id)) {
                beginCombat(monster, 'hero');
              }
              const animationDelay = index * Math.floor(COMBAT_ANIMATION_STAGGER * 0.75);
              dealDamageToMonster(monster, svDamage, { animationDelay, pulses: 1 });
            });
            const hitCount = svDamage > 0 ? svMonsters.length : 0;
            const availableBag = permanentMagicRecycleBag.filter(c => c.id !== card.id);
            const drawCount = Math.min(hitCount, availableBag.length);
            const shuffled = [...availableBag].sort(() => Math.random() - 0.5);
            const drawn = shuffled.slice(0, drawCount);
            const drawnIds = new Set(drawn.map(c => c.id));
            if (drawn.length > 0) {
              setPermanentMagicRecycleBag(prev => prev.filter(c => !drawnIds.has(c.id)));
              drawn.forEach(c => ensureCardInHand(c));
              addGameLog('deck', `从回收袋抽取 ${drawn.length} 张牌：${drawn.map(c => c.name).join('、')}`);
            }
            const drawnNames = drawn.map(c => c.name).join('、');
            const svBanner = drawn.length > 0
              ? `箭雨余韵命中 ${hitCount} 只怪物，造成 ${svDamage} 点伤害！从回收袋抽取：${drawnNames}。${isEchoTriggered ? '（回响×2）' : ''}`
              : `箭雨余韵命中 ${hitCount} 只怪物，造成 ${svDamage} 点伤害！回收袋无可抽取的牌。${isEchoTriggered ? '（回响×2）' : ''}`;
            finalizeMagicCard(card, { banner: svBanner });
            return;
          }
          if (card.id.includes('flip-crypt-echo')) {
            const healed = healHero(3 * echoMultiplier);
            const banner = healed > 0
              ? `墓语回响生效，恢复 ${healed} 点生命。${isEchoTriggered ? '（回响×2）' : ''}`
              : '生命值已满，墓语回响未回复生命。';
            finalizeMagicCard(card, { banner });
            return;
          }
          if (card.scalingDamage != null) {
            const strikeBase = card.scalingDamage;
            const currentDamage = getSpellDamage(strikeBase) * echoMultiplier;
            const monsters = flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster');
            if (monsters.length === 0) {
              finalizeMagicCard(card, { banner: `${card.name}无效（没有怪物）。` });
              return;
            }
            const nextBase = strikeBase + 1;
            const updatedCard: GameCardData = {
              ...card,
              scalingDamage: nextBase,
              magicEffect: `下一击叠刺 ${nextBase}`,
            };
            if (monsters.length === 1) {
              if (!isMonsterEngaged(monsters[0].id)) beginCombat(monsters[0], 'hero');
              dealDamageToMonster(monsters[0], currentDamage, { pulses: 2 });
              addPermanentMagicToRecycleBag(updatedCard);
              removeCard(card.id, false);
              setPendingMagicAction(null);
              addGameLog(
                'magic',
                `${card.name}：对 ${monsters[0].name} 造成 ${currentDamage} 点（下一击叠刺 ${nextBase}）`,
              );
              setHeroSkillBanner(`${card.name} 下一击叠刺 ${nextBase}`);
              return;
            }
            setPendingMagicAction({
              card: updatedCard,
              effect: 'scaling-damage',
              step: 'monster-select',
              pendingDamage: strikeBase,
              echoMultiplier,
              prompt: `选择目标（本刺叠刺 ${strikeBase}）`,
            });
            setHeroSkillBanner(`${card.name} 请选择目标 · 本刺叠刺 ${strikeBase}`);
            return;
          }
          if (card.magicEffect === 'double-next-magic') {
            setDoubleNextMagic(true);
            finalizeMagicCard(card, { banner: '法术回响已激活！下一张法术的效果将触发两次。' });
            return;
          }
          finalizeMagicCard(card, { banner: card.magicEffect || '永久魔法生效。' });
          return;
        }
      }
    } else if (card.skillType === 'permanent') {
      // Add permanent skill effect
      setPermanentSkills(prev => [...prev, card.skillEffect || card.name]);
      
      // Handle Knight permanent skills
      if (card.name === 'Berserker Rage' || card.name === 'Battle Frenzy') {
        // These are calculated in attackBonus
      }
      
      if (knightCard.classCard) {
        consumeClassCardFromHand(card.id);
      }
      
      addToGraveyard(card);
      removeCard(card.id, false);
    }
  };

  function handleSellCard(item: any) {
    pushUndoSnapshot();
    const itemType = item.type as CardType;

    if (item.isPermanentEvent) {
      const isDungeon = activeCards.some(c => c?.id === item.id);
      const isHand = handCards.some(c => c.id === item.id);
      discardCardToGraveyard(item as GameCardData, { owner: 'player', forceGraveyard: true });
      if (isDungeon) {
        removeCard(item.id, false);
      } else if (isHand) {
        consumeCardFromHand(item as GameCardData);
      }
      addGameLog('event', `${item.name} 已弃入墓地。`);
      setHeroSkillBanner(`${item.name} 已弃入墓地。`);
      resetDragState();
      return;
    }

    // Only allow selling defined card types
    if (!isSellableType(itemType) || item.isCurse) {
      return;
    }
    
    addGameLog('shop', `弃置 ${item.name}`);

    const sellItem = item as GameCardData & { fromSlot?: string };
    const slotFromCard = normalizeHeroEquipmentSlotFromDrag(sellItem.fromSlot);
    const slotFromDragSession = normalizeHeroEquipmentSlotFromDrag(
      typeof draggedCardSource === 'string' ? draggedCardSource : null,
    );
    const immediateOrigin: DragOrigin | null =
      sellItem.fromSlot === 'amulet'
        ? 'amulet'
        : slotFromCard
          ? slotFromCard
          : draggedCardSource === 'amulet'
            ? 'amulet'
            : slotFromDragSession
              ? slotFromDragSession
              : draggedCardSource === 'hand' ||
                  draggedCardSource === 'backpack' ||
                  draggedCardSource === 'dungeon'
                ? draggedCardSource
                : null;

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

    const sanitizedCard = sanitizeCardMetadata(sellItem);
    discardCardToGraveyard(sanitizedCard, { owner: 'player', forceGraveyard: true });

    switch (fallbackOrigin) {
      case 'equipmentSlot1':
      case 'equipmentSlot2':
        clearEquipmentSlotWithPromote(fallbackOrigin);
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
    (damage: number, source: 'combat' | 'general' = 'general', opts?: { blockedWithShield?: boolean }) => {
      let remainingDamage = Math.max(0, Math.floor(damage));
      if (remainingDamage <= 0) {
        return 0;
      }

      const hadShieldProtection = opts?.blockedWithShield ?? false;

      let shieldAbsorbed = 0;
      setTempShield(prev => {
        if (prev <= 0 || remainingDamage <= 0) {
          return prev;
        }
        shieldAbsorbed = Math.min(prev, remainingDamage);
        remainingDamage -= shieldAbsorbed;
        return prev - shieldAbsorbed;
      });

      if (remainingDamage <= 0) {
        addGameLog('combat', `临时护盾吸收了 ${shieldAbsorbed} 点伤害`);
        return 0;
      }

      if (
        !suppressDeathWardRef.current &&
        !deathWardPrompt &&
        remainingDamage >= hp
      ) {
        const wardCandidate = findDeathWardCard();
        if (wardCandidate) {
          setDeathWardPrompt({
            ...wardCandidate,
            pendingDamage: remainingDamage,
            sourceType: source,
          });
          setHeroSkillBanner('命悬一线准备发动，是否消耗它来抵消致命伤害？');
          return 0;
        }
      }

      if (amuletEffects.hasGuardian && hadShieldProtection && source === 'combat' && remainingDamage > 6) {
        const reduced = remainingDamage - 6;
        remainingDamage = 6;
        addGameLog('amulet', `守护护符：超出格挡的伤害被限制为 6（减免了 ${reduced} 点）`);
      }

      setTakingDamage(true);
      setTimeout(() => setTakingDamage(false), 200);
      triggerHeroBleedAnimation();

      let appliedDamage = 0;
      setHp(prev => {
        const newHp = Math.max(0, prev - remainingDamage);
        appliedDamage = prev - newHp;
        if (newHp === 0) {
          addGameLog('system', '英雄阵亡，游戏结束');
          setGameOver(true);
          setVictory(false);
        }
        return newHp;
      });

      addHeroMagicGauge('holy-light', 1);

      if (appliedDamage > 0) {
        setTotalDamageTaken(prev => prev + appliedDamage);
        setTurnDamageTaken(prev => prev + appliedDamage);
        addGameLog('damage', `英雄受到 ${appliedDamage} 点伤害`);
      }

      return appliedDamage;
    },
    [
      addGameLog,
      amuletEffects.hasGuardian,
      deathWardPrompt,
      equipmentSlot1,
      equipmentSlot2,
      findDeathWardCard,
      hp,
      setHeroSkillBanner,
      tempShield,
      triggerHeroBleedAnimation,
    ],
  );

  const cancelHeroSkillAction = useCallback(() => {
    setPendingHeroSkillAction(null);
    setHeroSkillBanner(null);
    setHeroSkillArrow(null);
  }, []);

  const cancelHeroMagicAction = useCallback(() => {
    setPendingHeroMagicAction(null);
    setHeroSkillBanner(null);
  }, []);

  const cancelPotionAction = useCallback(() => {
    if (pendingPotionAction) {
      void finalizePotionCard(pendingPotionAction.card, { banner: '取消使用药剂。' });
    }
    setPendingPotionAction(null);
    setHeroSkillBanner(null);
  }, [finalizePotionCard, pendingPotionAction]);

  const markSkillUsed = useCallback((skillId: HeroSkillId) => {
    if (skillId === selectedHeroSkill) {
      setHeroSkillUsedThisWave(true);
    } else {
      setExtraSkillsUsedThisWave(prev => { const next = new Set(prev); next.add(skillId); return next; });
    }
  }, [selectedHeroSkill]);

  const handleHeroSkillUse = useCallback(async (overrideSkillId?: HeroSkillId) => {
    pushUndoSnapshot();
    const skillDef = overrideSkillId ? getHeroSkillById(overrideSkillId) : selectedHeroSkillDef;
    const isExtraSkill = !!overrideSkillId;
    if (!skillDef) {
      setHeroSkillBanner(null);
      return;
    }
    if (skillDef.type === 'passive') {
      setHeroSkillBanner('Passive skill is always active.');
      return;
    }
    if (isExtraSkill) {
      if (extraSkillsUsedThisWave.has(overrideSkillId)) {
        setHeroSkillBanner('该技能本波已使用。');
        return;
      }
    } else if (heroSkillUsedThisWave) {
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

    addGameLog('skill', `使用英雄技能：${skillDef.name}`);
    switch (skillDef.id) {
      case 'armor-pact': {
        const emptySlots: EquipmentSlotId[] = [];
        if (!equipmentSlot1) emptySlots.push('equipmentSlot1');
        if (!equipmentSlot2) emptySlots.push('equipmentSlot2');
        if (emptySlots.length === 0) {
          setHeroSkillBanner('需要至少一个空装备槽才能发动。');
          return;
        }
        if (emptySlots.length === 1) {
          const emptySlot = emptySlots[0];
          setEquipmentSlotBonus(emptySlot, 'shield', current => current + 1);
          const otherSlot: EquipmentSlotId = emptySlot === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
          const otherItem = otherSlot === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
          if (otherItem) {
            setEquipmentSlotById(emptySlot, otherItem);
            setEquipmentSlotById(otherSlot, null);
            addGameLog('skill', `虚位铸甲：「${otherItem.name}」移至强化槽位`);
          }
          markSkillUsed(skillDef.id);
          setHeroSkillBanner('装备槽永久护甲 +1。');
          break;
        }
        setPendingHeroSkillAction({ skillId: 'armor-pact', type: 'slot' });
        setHeroSkillBanner(skillDef.statusHint ?? '选择空槽以获得 +1 永久护甲。');
        break;
      }
      case 'durability-for-blood': {
        if (!equipmentSlot1 && !equipmentSlot2) {
          setHeroSkillBanner('Equip a weapon or shield before reinforcing.');
          return;
        }
        const repairableHeroSlots: { id: EquipmentSlotId; item: NonNullable<typeof equipmentSlot1> }[] = [];
        if (equipmentSlot1) {
          const maxD = equipmentSlot1.maxDurability ?? equipmentSlot1.durability ?? 0;
          const curD = equipmentSlot1.durability ?? maxD;
          if (maxD > 0 && curD < maxD) repairableHeroSlots.push({ id: 'equipmentSlot1', item: equipmentSlot1 });
        }
        if (equipmentSlot2) {
          const maxD = equipmentSlot2.maxDurability ?? equipmentSlot2.durability ?? 0;
          const curD = equipmentSlot2.durability ?? maxD;
          if (maxD > 0 && curD < maxD) repairableHeroSlots.push({ id: 'equipmentSlot2', item: equipmentSlot2 });
        }
        if (repairableHeroSlots.length === 0) {
          setHeroSkillBanner('No equipment needs repair.');
          return;
        }
        if (repairableHeroSlots.length === 1) {
          const slot = repairableHeroSlots[0];
          const maxDurability = slot.item.maxDurability ?? slot.item.durability ?? 0;
          const currentDurability = slot.item.durability ?? maxDurability;
          setEquipmentSlotById(slot.id, { ...slot.item, durability: Math.min(maxDurability, currentDurability + 1) });
          applyDamage(1);
          markSkillUsed(skillDef.id);
          setHeroSkillBanner('Durability increased by 1.');
          break;
        }
        setPendingHeroSkillAction({ skillId: 'durability-for-blood', type: 'slot' });
        setHeroSkillBanner(skillDef.statusHint ?? 'Select an equipped slot to repair.');
        break;
      }
      case 'blood-strike': {
        const monsters = flattenActiveRowSlots(activeCards).filter(c => c?.type === 'monster');
        if (monsters.length === 0) {
          setHeroSkillBanner('No monsters available to strike.');
          return;
        }
        if (monsters.length === 1) {
          if (!isMonsterEngaged(monsters[0].id)) beginCombat(monsters[0], 'hero');
          applyDamage(3);
          const heroSkillDamage = getSpellDamage(3);
          dealDamageToMonster(monsters[0], heroSkillDamage, { pulses: 2 });
          markSkillUsed(skillDef.id);
          setHeroSkillBanner(`Crimson Strike dealt ${heroSkillDamage} damage.`);
          break;
        }
        setPendingHeroSkillAction({ skillId: 'blood-strike', type: 'monster', baseDamage: 3 });
        setHeroSkillBanner(`Select a monster to deal ${getSpellDamage(3)} damage.`);
        break;
      }
      case 'gold-discovery': {
        const cost = 6;
        if (gold < cost) {
          setHeroSkillBanner(`金币不足！需要 ${cost} 金币（当前 ${gold}）。`);
          return;
        }
        if (classDeck.length === 0) {
          setHeroSkillBanner('专属牌堆已空，无法发动。');
          return;
        }
        setGold(prev => prev - cost);
        const drawn = drawClassCardsToBackpack(1, 'gold-discovery');
        if (drawn.length > 0) {
          triggerClassDeckFlight(drawn);
          markSkillUsed(skillDef.id);
          setHeroSkillBanner(`花费 ${cost} 金币，获得了「${drawn[0].name}」！`);
          addGameLog('skill', `黄金探秘：花费 ${cost} 金币，获得「${drawn[0].name}」`);
        } else {
          setGold(prev => prev + cost);
          setHeroSkillBanner('背包已满或专属牌不可用，金币已退回。');
        }
        break;
      }
      case 'graveyard-recall': {
        if (handCards.length < 2) {
          setHeroSkillBanner(`手牌不足！需要至少 2 张手牌（当前 ${handCards.length}）。`);
          return;
        }
        if (discardedCards.length === 0) {
          setHeroSkillBanner('坟场中没有可召回的卡牌。');
          return;
        }
        const discardSuccess = await requestCardAction('discard', 2, {
          title: '亡灵拾遗：弃 2 张手牌',
          description: '选择 2 张手牌弃置，随后从坟场召回一张卡牌。',
          handOnly: true,
        });
        if (!discardSuccess) {
          setHeroSkillBanner('亡灵拾遗已取消。');
          return;
        }
        const selected = await requestGraveyardSelection(3, { delivery: 'hand-first' });
        if (selected) {
          addGameLog('skill', `亡灵拾遗：从坟场召回「${selected.name}」`);
        } else {
          setHeroSkillBanner('放弃了坟场召回。');
        }
        markSkillUsed(skillDef.id);
        break;
      }
      case 'blood-draw': {
        applyDamage(3);
        const drawnNames: string[] = [];
        for (let i = 0; i < 2; i++) {
          const drawn = drawFromBackpackToHand();
          if (drawn) drawnNames.push(drawn.name);
        }
        markSkillUsed(skillDef.id);
        if (drawnNames.length > 0) {
          setHeroSkillBanner(`失去 3 生命，抽到「${drawnNames.join('」「')}」！`);
          addGameLog('skill', `血契抽牌：失去 3 生命，抽到「${drawnNames.join('」「')}」`);
        } else {
          setHeroSkillBanner('失去 3 生命，但背包为空或手牌已满。');
          addGameLog('skill', '血契抽牌：失去 3 生命，未能抽牌');
        }
        break;
      }
      case 'discard-empower': {
        if (handCards.length === 0) {
          setHeroSkillBanner('需要至少 1 张手牌才能发动。');
          return;
        }
        if (!equipmentSlot1 && !equipmentSlot2) {
          setHeroSkillBanner('需要至少一个装备才能发动。');
          return;
        }
        clearUndoStack();
        const discarded = handCards[Math.floor(Math.random() * handCards.length)];
        discardCardToGraveyard(discarded, { owner: 'player' });
        setHandCards(prev => prev.filter(c => c.id !== discarded.id));
        addGameLog('skill', `噬血砺锋：弃置「${discarded.name}」`);
        const equippedSlots: EquipmentSlotId[] = [];
        if (equipmentSlot1) equippedSlots.push('equipmentSlot1');
        if (equipmentSlot2) equippedSlots.push('equipmentSlot2');
        if (equippedSlots.length === 1) {
          const slotId = equippedSlots[0];
          const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
          setSlotAttackBursts(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + 2 }));
          setNextAttackLifestealSlot(slotId);
          markSkillUsed(skillDef.id);
          setHeroSkillBanner(`${slotItem!.name} 的下次攻击 +2 伤害 且 吸血！`);
          addGameLog('skill', `噬血砺锋：${slotItem!.name} 下次攻击 +2 且吸血`);
          break;
        }
        setPendingHeroSkillAction({ skillId: 'discard-empower', type: 'slot' });
        setHeroSkillBanner(skillDef.statusHint ?? '选择一个装备：下次攻击 +2 伤害 且 吸血。');
        break;
      }
      case 'vanguard-swap': {
        let firstIdx = -1;
        let secondIdx = -1;
        for (let i = 0; i < activeCards.length; i++) {
          if (activeCards[i] != null) {
            if (firstIdx === -1) { firstIdx = i; }
            else if (secondIdx === -1) { secondIdx = i; break; }
          }
        }
        if (firstIdx === -1 || secondIdx === -1) {
          setHeroSkillBanner('先锋换阵无效（地城行卡牌不足 2 张）。');
          return;
        }
        const cardA = activeCards[firstIdx]!;
        const cardB = activeCards[secondIdx]!;
        setActiveCards(prev => {
          const next = [...prev] as ActiveRowSlots;
          const tmp = next[firstIdx];
          next[firstIdx] = next[secondIdx];
          next[secondIdx] = tmp;
          return next;
        });
        markSkillUsed(skillDef.id);
        setHeroSkillBanner(`${cardA.name} ↔ ${cardB.name} 位置互换！`);
        addGameLog('skill', `先锋换阵：${cardA.name} 与 ${cardB.name} 互换位置。`);
        break;
      }
      default:
        break;
    }
  }, [
    activeCards,
    addGameLog,
    applyDamage,
    beginCombat,
    classDeck,
    dealDamageToMonster,
    drawClassCardsToBackpack,
    drawFromBackpackToHand,
    equipmentSlot1,
    equipmentSlot2,
    extraSkillsUsedThisWave,
    gold,
    heroSkillUsedThisWave,
    handCards,
    discardCardToGraveyard,
    isMonsterEngaged,
    discardedCards,
    markSkillUsed,
    pendingHeroSkillAction,
    requestGraveyardSelection,
    selectedHeroSkillDef,
    setEquipmentSlotBonus,
    setEquipmentSlotById,
    setHandCards,
    setSlotAttackBursts,
    triggerClassDeckFlight,
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
          setHeroSkillBanner('请选择一个空的装备槽。');
          return;
        }
        setEquipmentSlotBonus(slotId, 'shield', current => current + 1);
        const otherSlot: EquipmentSlotId = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
        const otherItem = otherSlot === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (otherItem) {
          setEquipmentSlotById(slotId, otherItem);
          setEquipmentSlotById(otherSlot, null);
        }
        markSkillUsed(pendingHeroSkillAction.skillId);
        setPendingHeroSkillAction(null);
        setHeroSkillBanner('装备槽永久护甲 +1。');
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
        applyDamage(1);
        markSkillUsed(pendingHeroSkillAction.skillId);
        setPendingHeroSkillAction(null);
        setHeroSkillBanner('Durability increased by 1.');
        setHeroSkillArrow(null);
      }

      if (pendingHeroSkillAction.skillId === 'discard-empower') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          setHeroSkillBanner('请选择有装备的槽位。');
          return;
        }
        setSlotAttackBursts(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + 2 }));
        setNextAttackLifestealSlot(slotId);
        markSkillUsed(pendingHeroSkillAction.skillId);
        setPendingHeroSkillAction(null);
        setHeroSkillBanner(`${slotItem.name} 的下次攻击 +2 伤害 且 吸血！`);
        setHeroSkillArrow(null);
        addGameLog('skill', `噬血砺锋：${slotItem.name} 下次攻击 +2 且吸血`);
      }
    },
    [
      addGameLog,
      applyDamage,
      equipmentSlot1,
      equipmentSlot2,
      markSkillUsed,
      pendingHeroSkillAction,
      setEquipmentSlotBonus,
      setEquipmentSlotById,
      setSlotAttackBursts,
    ],
  );

  const handleMagicSlotSelection = useCallback(
    (slotId: EquipmentSlotId) => {
      if (!pendingMagicAction || pendingMagicAction.step !== 'slot-select') {
        return;
      }

      if (pendingMagicAction.effect === 'weapon-burst') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem || (slotItem.type !== 'weapon' && slotItem.type !== 'monster')) {
          setHeroSkillBanner('请选择一个已装备的武器。');
          return;
        }
        const burstAmount = 3 * (pendingMagicAction.echoMultiplier ?? 1);
        setSlotAttackBursts(prev => ({
          ...prev,
          [slotId]: (prev[slotId] ?? 0) + burstAmount,
        }));
        finalizeMagicCard(pendingMagicAction.card, {
          banner: `${slotItem.name} 的下一次攻击将额外造成 ${burstAmount} 点伤害。${(pendingMagicAction.echoMultiplier ?? 1) > 1 ? '（回响×2）' : ''}`,
        });
        return;
      }

      if (pendingMagicAction.effect === 'repair-one') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          setHeroSkillBanner('该槽位没有可修复的装备。');
          return;
        }
        const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
        const currentDurability = slotItem.durability ?? maxDurability;
        if (maxDurability === 0) {
          setHeroSkillBanner('这件装备无法修复。');
          return;
        }
        if (currentDurability >= maxDurability) {
          setHeroSkillBanner('该装备已经处于满耐久。');
          return;
        }
        const repairAmount = 1 * (pendingMagicAction.echoMultiplier ?? 1);
        setEquipmentSlotById(slotId, {
          ...slotItem,
          durability: Math.min(maxDurability, currentDurability + repairAmount),
        });
        const repairBanner =
          pendingMagicAction.card.magicEffect === 'honor-blood'
            ? `战血之印：${slotItem.name} 恢复 ${repairAmount} 点耐久。${(pendingMagicAction.echoMultiplier ?? 1) > 1 ? '（回响×2）' : ''}`
            : `${slotItem.name} 恢复了 ${repairAmount} 点耐久。${(pendingMagicAction.echoMultiplier ?? 1) > 1 ? '（回响×2）' : ''}`;
        finalizeMagicCard(pendingMagicAction.card, { banner: repairBanner });
        return;
      }

      if (pendingMagicAction.effect === 'armor-strike') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem || (slotItem.type !== 'shield' && slotItem.type !== 'monster')) {
          setHeroSkillBanner('请选择一面盾牌来转化护甲。');
          return;
        }
        const armorValue = calculateSlotArmorValue(slotId);
        if (armorValue <= 0) {
          setHeroSkillBanner('该盾牌目前没有可用的护甲。');
          return;
        }
        const monsters = flattenActiveRowSlots(activeCards).filter(c => c?.type === 'monster');
        if (monsters.length === 1) {
          const totalDamage = getSpellDamage(armorValue);
          if (!isMonsterEngaged(monsters[0].id)) beginCombat(monsters[0], 'hero');
          dealDamageToMonster(monsters[0], totalDamage, { pulses: 2 });
          finalizeMagicCard(pendingMagicAction.card, { banner: `御甲破击造成 ${totalDamage} 点伤害。` });
          return;
        }
        const totalDamage = getSpellDamage(armorValue);
        setPendingMagicAction({
          card: pendingMagicAction.card,
          effect: 'armor-strike',
          step: 'monster-select',
          slotId,
          pendingDamage: armorValue,
          prompt: `选择一个怪物，承受 ${totalDamage} 点护甲伤害。`,
        });
        setHeroSkillBanner('选择一个怪物承受你的护甲一击。');
        return;
      }

      if (pendingMagicAction.effect === 'eternal-repair') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          setHeroSkillBanner('该装备栏为空。');
          return;
        }
        if (slotItem.type !== 'weapon' && slotItem.type !== 'monster') {
          setHeroSkillBanner('永恒修复只能对武器或随从使用。');
          return;
        }
        setUnbreakableUntilWaterfall(prev => ({ ...prev, [slotId]: true }));
        addGameLog('magic', `${slotItem.name} 在下个瀑流前使用不消耗耐久。`);

        const echoRemaining = (pendingMagicAction.echoRemaining ?? 1) - 1;
        if (echoRemaining > 0) {
          const isWeaponSlot = (s: { id: string; item: GameCardData | null }) =>
            s.id !== slotId && s.item != null && (s.item.type === 'weapon' || s.item.type === 'monster');
          const otherWeaponSlots = getEquipmentSlots().filter(isWeaponSlot);
          if (otherWeaponSlots.length > 0) {
            const totalEcho = (pendingMagicAction.echoRemaining ?? 1);
            const echoLabel = `（回响：第 ${totalEcho - echoRemaining + 1}/${totalEcho} 次）`;
            setPendingMagicAction({
              card: pendingMagicAction.card,
              effect: 'eternal-repair',
              step: 'slot-select',
              prompt: `${slotItem.name} 已获得永恒修复。继续选择下一把武器。${echoLabel}`,
              echoRemaining,
            });
            setHeroSkillBanner(`${slotItem.name} 已获得永恒修复。继续选择下一把。${echoLabel}`);
            return;
          }
        }
        finalizeMagicCard(pendingMagicAction.card, {
          banner: `${slotItem.name} 获得永恒修复（瀑流前不消耗耐久）。`,
        });
      }
    },
    [
      activeCards,
      beginCombat,
      calculateSlotArmorValue,
      dealDamageToMonster,
      equipmentSlot1,
      equipmentSlot2,
      getSpellDamage,
      finalizeMagicCard,
      isMonsterEngaged,
      pendingMagicAction,
      setEquipmentSlotById,
      setSlotAttackBursts,
      setHeroSkillBanner,
    ],
  );

  const handlePotionChoiceSelection = useCallback(
    (value: string) => {
      if (!pendingPotionAction || pendingPotionAction.effect !== 'repair-choice') {
        return;
      }
      const card = pendingPotionAction.card;
      const allowedTypes: EquipmentRepairTarget[] = ['weapon', 'shield', 'monster'];

      if (value === 'repair') {
        const repairableSlots = getEquipmentSlots().filter(slot => {
          const item = slot.item;
          if (!item || !item.type || !allowedTypes.includes(item.type)) return false;
          const maxDur = item.maxDurability ?? item.durability ?? 0;
          const curDur = item.durability ?? maxDur;
          return maxDur > 0 && curDur < maxDur;
        });
        if (!repairableSlots.length) {
          void finalizePotionCard(card, { banner: '所有装备已满耐久，修复无效。' });
          setPendingPotionAction(null);
          return;
        }
        if (repairableSlots.length === 1) {
          resolvePotionRepairForSlot(repairableSlots[0].id, card, 3, allowedTypes);
          setPendingPotionAction(null);
          return;
        }
        const prompt = '选择一件装备恢复3点耐久。';
        setPendingPotionAction({
          card,
          effect: 'repair-choice-repair',
          amount: 3,
          allowedTypes,
          step: 'slot-select',
          prompt,
        });
        setHeroSkillBanner(prompt);
      } else if (value === 'upgrade') {
        const equipSlots = getEquipmentSlots().filter(slot => {
          const item = slot.item;
          return Boolean(item && item.type && allowedTypes.includes(item.type));
        });
        if (!equipSlots.length) {
          void finalizePotionCard(card, { banner: '没有可升级的装备。' });
          setPendingPotionAction(null);
          return;
        }
        if (equipSlots.length === 1) {
          const slot = equipSlots[0];
          const slotItem = slot.item!;
          const maxDur = slotItem.maxDurability ?? slotItem.durability ?? 0;
          setEquipmentSlotById(slot.id, { ...slotItem, maxDurability: maxDur + 2 });
          addGameLog('potion', `${slotItem.name} 耐久上限 +2（${maxDur} → ${maxDur + 2}）`);
          void finalizePotionCard(card, { banner: `${slotItem.name} 耐久上限 +2` });
          setPendingPotionAction(null);
          return;
        }
        const prompt = '选择一件装备提升耐久上限。';
        setPendingPotionAction({
          card,
          effect: 'repair-choice-upgrade',
          allowedTypes,
          step: 'slot-select',
          prompt,
        });
        setHeroSkillBanner(prompt);
      }
    },
    [addGameLog, finalizePotionCard, getEquipmentSlots, pendingPotionAction, resolvePotionRepairForSlot, setEquipmentSlotById, setHeroSkillBanner],
  );

  const handlePotionSlotSelection = useCallback(
    (slotId: EquipmentSlotId) => {
      if (!pendingPotionAction || pendingPotionAction.step !== 'slot-select') {
        return;
      }

      if (pendingPotionAction.effect === 'repair-equipment' || pendingPotionAction.effect === 'repair-choice-repair') {
        const succeeded = resolvePotionRepairForSlot(
          slotId,
          pendingPotionAction.card,
          pendingPotionAction.amount,
          pendingPotionAction.allowedTypes,
        );
        if (succeeded) {
          setPendingPotionAction(null);
        }
        return;
      }

      if (pendingPotionAction.effect === 'repair-choice-upgrade') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          setHeroSkillBanner('该槽位目前没有装备。');
          return;
        }
        if (!slotItem.type || !pendingPotionAction.allowedTypes.includes(slotItem.type)) {
          setHeroSkillBanner('请选择一件装备。');
          return;
        }
        const maxDur = slotItem.maxDurability ?? slotItem.durability ?? 0;
        setEquipmentSlotById(slotId, { ...slotItem, maxDurability: maxDur + 2 });
        addGameLog('potion', `${slotItem.name} 耐久上限 +2（${maxDur} → ${maxDur + 2}）`);
        void finalizePotionCard(pendingPotionAction.card, { banner: `${slotItem.name} 耐久上限 +2` });
        setPendingPotionAction(null);
      }
    },
    [addGameLog, equipmentSlot1, equipmentSlot2, finalizePotionCard, resolvePotionRepairForSlot, pendingPotionAction, setEquipmentSlotById, setHeroSkillBanner],
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

      markSkillUsed(pendingHeroSkillAction.skillId);
      setPendingHeroSkillAction(null);
      setHeroSkillBanner(`Crimson Strike dealt ${heroSkillDamage} damage.`);
      setHeroSkillArrow(null);
    },
    [
      applyDamage,
      dealDamageToMonster,
      getSpellDamage,
      markSkillUsed,
      pendingHeroSkillAction,
    ],
  );

  const handleMagicMonsterSelection = useCallback(
    (monster: GameCardData) => {
      if (!pendingMagicAction || pendingMagicAction.step !== 'monster-select') {
        return;
      }

      if (pendingMagicAction.effect === 'armor-strike') {
        const baseDamage = pendingMagicAction.pendingDamage;
        if (baseDamage <= 0) {
          finalizeMagicCard(pendingMagicAction.card, { banner: '护甲一击没有造成伤害。' });
          return;
        }
        const totalDamage = getSpellDamage(baseDamage);
        if (!isMonsterEngaged(monster.id)) {
          beginCombat(monster, 'hero');
        }
        dealDamageToMonster(monster, totalDamage, { pulses: 2 });
        finalizeMagicCard(pendingMagicAction.card, {
          banner: `御甲破击造成 ${totalDamage} 点伤害。`,
        });
        return;
      }

      if (pendingMagicAction.effect === 'blood-reckoning') {
        const echo = pendingMagicAction.echoMultiplier ?? 1;
        const totalDamage = getSpellDamage(goldRef.current) * echo;
        if (!isMonsterEngaged(monster.id)) {
          beginCombat(monster, 'hero');
        }
        dealDamageToMonster(monster, totalDamage, { pulses: 2 });
        const healed = healHero(totalDamage);
        const healText = healed > 0 ? `，恢复 ${healed} 点生命` : '';
        finalizeMagicCard(pendingMagicAction.card, {
          banner: `血债清算造成 ${totalDamage} 点伤害${healText}！${echo > 1 ? '（回响×2）' : ''}`,
        });
        return;
      }

      if (pendingMagicAction.effect === 'missing-hp-smite') {
        const missingHp = Math.max(0, maxHp - hp);
        if (missingHp <= 0) {
          finalizeMagicCard(pendingMagicAction.card, { banner: '你处于满血状态，没有造成伤害。' });
          return;
        }
        const totalDamage = getSpellDamage(missingHp);
        if (!isMonsterEngaged(monster.id)) {
          beginCombat(monster, 'hero');
        }
        dealDamageToMonster(monster, totalDamage, { pulses: 2 });
        finalizeMagicCard(pendingMagicAction.card, {
          banner: `残血裁决释放 ${totalDamage} 点伤害。`,
        });
        return;
      }

      if (pendingMagicAction.effect === 'scaling-damage') {
        const strikeBase = pendingMagicAction.pendingDamage ?? 1;
        const echo = pendingMagicAction.echoMultiplier ?? 1;
        const totalDamage = getSpellDamage(strikeBase) * echo;
        if (!isMonsterEngaged(monster.id)) {
          beginCombat(monster, 'hero');
        }
        dealDamageToMonster(monster, totalDamage, { pulses: 2 });
        const updatedCard = pendingMagicAction.card;
        addPermanentMagicToRecycleBag(updatedCard);
        removeCard(updatedCard.id, false);
        setPendingMagicAction(null);
        const nextBase = updatedCard.scalingDamage ?? strikeBase + 1;
        addGameLog(
          'magic',
          `${updatedCard.name}：对 ${monster.name} 造成 ${totalDamage} 点（下一击叠刺 ${nextBase}）`,
        );
        setHeroSkillBanner(`${updatedCard.name} 下一击叠刺 ${nextBase}`);
        return;
      }

      if (pendingMagicAction.effect === 'chaos-strike') {
        if (!isMonsterEngaged(monster.id)) {
          beginCombat(monster, 'hero');
        }
        const chaosDamage = getSpellDamage(3);
        const removedExactlyOneLayer = chaosStrikeRemovedExactlyOneLayer(monster, chaosDamage);
        dealDamageToMonster(monster, chaosDamage);
        let chaosBanner: string;
        if (removedExactlyOneLayer) {
          const drawn = drawCardsFromBackpack(2);
          chaosBanner = `混沌冲击对 ${monster.name} 造成 ${chaosDamage} 伤害，恰好减去一层！额外抽 ${drawn} 张牌。`;
        } else {
          chaosBanner = `混沌冲击对 ${monster.name} 造成 ${chaosDamage} 点伤害。`;
        }
        addGameLog('magic', chaosBanner);

        const echoRemaining = (pendingMagicAction.echoRemaining ?? 1) - 1;
        if (echoRemaining > 0) {
          const remainingMonsters = flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster');
          if (remainingMonsters.length > 0) {
            const totalEcho = (pendingMagicAction.echoRemaining ?? 1);
            const echoLabel = `（回响：第 ${totalEcho - echoRemaining + 1}/${totalEcho} 次）`;
            setPendingMagicAction({
              card: pendingMagicAction.card,
              effect: 'chaos-strike',
              step: 'monster-select',
              prompt: `${chaosBanner} 继续选择目标。${echoLabel}`,
              data: {},
              echoRemaining,
            });
            setHeroSkillBanner(`${chaosBanner} 继续选择目标。${echoLabel}`);
            return;
          }
        }
        finalizeMagicCard(pendingMagicAction.card, { banner: chaosBanner });
        return;
      }

    },
    [
      activeCards,
      addGameLog,
      addPermanentMagicToRecycleBag,
      beginCombat,
      chaosStrikeRemovedExactlyOneLayer,
      dealDamageToMonster,
      drawCardsFromBackpack,
      finalizeMagicCard,
      getSpellDamage,
      healHero,
      hp,
      isMonsterEngaged,
      maxHp,
      pendingMagicAction,
      removeCard,
      setHeroSkillBanner,
    ],
  );

  const handleDeathWardConfirm = useCallback(() => {
    pushUndoSnapshot();
    if (!deathWardPrompt) {
      return;
    }
    const { card, source } = deathWardPrompt;
    if (source === 'hand') {
      consumeCardFromHand(card);
      consumeClassCardFromHand(card.id);
    } else {
      setBackpackItems(prev => prev.filter(item => item.id !== card.id));
    }
    finalizeMagicCard(card, { banner: '命悬一线发动，抵消了致命伤害。' });
    setHeroSkillBanner('命悬一线护佑了你。');
    setDeathWardPrompt(null);
  }, [
    consumeCardFromHand,
    consumeClassCardFromHand,
    deathWardPrompt,
    finalizeMagicCard,
    setBackpackItems,
    setHeroSkillBanner,
  ]);

  const handleDeathWardDecline = useCallback(() => {
    pushUndoSnapshot();
    if (!deathWardPrompt) {
      return;
    }
    const { pendingDamage, sourceType } = deathWardPrompt;
    setDeathWardPrompt(null);
    suppressDeathWardRef.current = true;
    try {
      applyDamage(pendingDamage, sourceType);
    } finally {
      suppressDeathWardRef.current = false;
    }
  }, [applyDamage, deathWardPrompt]);

  const handleDungeonCardSelection = useCallback(
    (card: GameCardData) => {
      if (!pendingMagicAction || pendingMagicAction.step !== 'dungeon-select') {
        return;
      }
      if (echoRemainingRef.current <= 0) {
        return;
      }
      if (
        pendingMagicAction.effect !== 'return-dungeon-bottom' &&
        pendingMagicAction.effect !== 'shuffle-dungeon'
      ) {
        return;
      }
      const isActiveCard = activeCards.some(activeCard => activeCard?.id === card.id);
      if (!isActiveCard) {
        setHeroSkillBanner('请选择当前地城中的卡牌。');
        return;
      }

      removeCard(card.id, false);
      const sanitizedCard = sanitizeCardMetadata(card);
      setRemainingDeck(prev => [...prev, sanitizedCard]);
      addGameLog('magic', `${card.name} 已置于牌堆底。`);

      echoRemainingRef.current -= 1;
      const echoLeft = echoRemainingRef.current;
      if (echoLeft > 0) {
        const remainingDungeonCards = activeCards.filter(c => c != null && c.id !== card.id);
        if (remainingDungeonCards.length > 0) {
          const total = echoTotalRef.current;
          const currentRound = total - echoLeft + 1;
          const echoLabel = `（回响：第 ${currentRound}/${total} 次）`;
          setPendingMagicAction({
            card: pendingMagicAction.card,
            effect: 'return-dungeon-bottom',
            step: 'dungeon-select',
            prompt: `选择一张地城卡牌，置于牌堆底。${echoLabel}`,
            echoRemaining: echoLeft,
          });
          setHeroSkillBanner(`${card.name} 已置于牌堆底。继续选择下一张。${echoLabel}`);
          return;
        }
        addGameLog('magic', '回响：地城中没有更多卡牌可选。');
      }

      finalizeMagicCard(pendingMagicAction.card, {
        banner: `${card.name} 已置于牌堆底。`,
      });
    },
    [
      activeCards,
      addGameLog,
      finalizeMagicCard,
      pendingMagicAction,
      removeCard,
      setHeroSkillBanner,
      setPendingMagicAction,
      setRemainingDeck,
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
      if (pendingHeroMagicAction?.step === 'monster-select') {
        if (handleHolyLightMonsterCleanse(monster)) {
          return;
        }
      }
      if (pendingHeroSkillAction?.type === 'monster') {
        handleHeroSkillMonsterSelection(monster);
      }
    },
    [
      handleHeroSkillMonsterSelection,
      handleHolyLightMonsterCleanse,
      handleMagicMonsterSelection,
      pendingHeroMagicAction,
      pendingHeroSkillAction,
      pendingMagicAction,
    ],
  );

  function handleWeaponToMonster(weapon: any, monster: GameCardData) {
    if (fullBoardInteractionLockedRef.current) return;
    // 与手牌一致：怪物回合或等待格挡时不允许拖武器攻击，否则 performHeroAttack 会因 currentTurn !== 'hero' 静默返回（0 伤害、无日志）
    if (handLockedForMonsterPhaseRef.current) {
      setHeroSkillBanner('当前无法用武器攻击（怪物回合或需先格挡）。');
      return;
    }
    pushUndoSnapshot();
    const slotId = normalizeHeroEquipmentSlotFromDrag(weapon.fromSlot);
    if (!slotId) {
      return;
    }

    const slotAlreadyAttacked = combatState.heroAttacksThisTurn[slotId];
    const hasBaseAttack = combatState.heroAttacksRemaining > 0;
    const canUseBerserkerExtra = berserkerRageActive && slotAlreadyAttacked && !berserkerSlotUsed[slotId];
    const needsExtraCharge = slotAlreadyAttacked || !hasBaseAttack;
    if (needsExtraCharge && !canUseBerserkerExtra && extraAttackCharges <= 0) {
      return;
    }

    if (!isMonsterEngaged(monster.id)) {
      beginCombat(monster, 'hero');
    }

    performHeroAttack(slotId, monster);
  };

  function handleCardToHero(card: GameCardData) {
    if (fullBoardInteractionLockedRef.current) return;
    pushUndoSnapshot();
    if (isCardFromEquipmentSlot(card)) {
      // Equipped items can only attack monsters or be discarded.
      return;
    }
    if (isEquipmentCard(card)) {
      return; // equipment cannot be played directly on hero
    }
    // Check if card is from hand (play normally) or from dungeon (purchase)
    const isFromHand = isCardFromHand(card);
    const isFromBackpack = backpackItems.some(backpackCard => backpackCard.id === card.id);

    // Route spent hand cards to graveyard/recycle immediately after play
    const recordHandCardConsumption = (spentCard: GameCardData) => {
      if (spentCard.type === 'potion') {
        addToGraveyard(spentCard);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            sessionId:'debug-session',
            runId:'run3',
            hypothesisId:'M',
            location:'GameBoard.tsx:recordHandCardConsumption',
            message:'Potion routed to graveyard',
            data:{cardId:spentCard.id, cardType:spentCard.type},
            timestamp:Date.now()
          })
        }).catch(()=>{});
        // #endregion
        return;
      }
      if (spentCard.type === 'magic' || spentCard.type === 'hero-magic') {
        // Routing handled exclusively by handleSkillCard / finalizeMagicCard
        // to avoid double graveyard/recycle-bag insertions.
        return;
      }
      if (spentCard.type === 'event') {
        addToGraveyard(spentCard);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            sessionId:'debug-session',
            runId:'run3',
            hypothesisId:'M',
            location:'GameBoard.tsx:recordHandCardConsumption',
            message:'Event routed to graveyard',
            data:{cardId:spentCard.id, cardType:spentCard.type},
            timestamp:Date.now()
          })
        }).catch(()=>{});
        // #endregion
      }
    };
    
    if (isFromHand) {
      if (!consumeCardFromHand(card)) {
        resetDragState();
        return;
      }

      if (card.isPermanentEvent) {
        const emptySlots: number[] = [];
        for (let i = 0; i < DUNGEON_COLUMN_COUNT; i++) {
          if (activeCards[i] == null) emptySlots.push(i);
        }
        if (emptySlots.length > 0) {
          const targetSlot = emptySlots[Math.floor(Math.random() * emptySlots.length)];
          setActiveCards(prev => {
            const next = [...prev] as typeof prev;
            next[targetSlot] = { ...card, hasReleaseCharge: true, _fateBladeLastSlot: targetSlot };
            return next;
          });
          addGameLog('event', `${card.name} 被放置到地城第 ${targetSlot + 1} 列。`);
          if (card.name === '命运之刃') {
            applyDamage(5, 'general');
            addGameLog('event', '命运之刃：从手牌打出，失去 5 点生命。');
            setHeroSkillBanner(`${card.name} 出现在地城中！失去 5 点生命。`);
          } else {
            setHeroSkillBanner(`${card.name} 出现在地城中！`);
          }
        } else {
          discardCardToGraveyard(card, { owner: 'player' });
          addGameLog('event', `${card.name}：地城没有空位，进入墓地。`);
          setHeroSkillBanner(`地城没有空位，${card.name} 进入墓地。`);
        }
        resetDragState();
        return;
      }

      recordHandCardConsumption(card);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          sessionId:'debug-session',
          runId:'run3',
          hypothesisId:'N',
          location:'GameBoard.tsx:handleCardToHero',
          message:'Hand card consumed',
          data:{
            cardId:card.id,
            cardType:card.type,
            heroFrameDropIntent:heroFrameDropIntentRef.current
          },
          timestamp:Date.now()
        })
      }).catch(()=>{});
      // #endregion

      tickRecycleForge();

      if (card.type === 'monster') {
        beginCombat(card, 'monster');
      } else if (card.type === 'potion') {
        void handlePotionConsumption(card);
      } else if (card.type === 'magic' || card.type === 'hero-magic') {
        handleSkillCard(card);
      } else if (card.type === 'event') {
        startEventResolution(null, 'hand');
        setCurrentEventCard(card);
        eventChoiceProcessingRef.current = false;
        setEventModalOpen(true);
        resetDragState();
        return;
      }
    } else {
      if (isFromBackpack) {
        setBackpackItems(prev => prev.filter(c => c.id !== card.id));

        if (card.isPermanentEvent) {
          const emptySlots: number[] = [];
          for (let i = 0; i < DUNGEON_COLUMN_COUNT; i++) {
            if (activeCards[i] == null) emptySlots.push(i);
          }
          if (emptySlots.length > 0) {
            const targetSlot = emptySlots[Math.floor(Math.random() * emptySlots.length)];
            setActiveCards(prev => {
              const next = [...prev] as typeof prev;
              next[targetSlot] = { ...card, hasReleaseCharge: true, _fateBladeLastSlot: targetSlot };
              return next;
            });
            addGameLog('event', `${card.name} 被放置到地城第 ${targetSlot + 1} 列。`);
            setHeroSkillBanner(`${card.name} 出现在地城中！`);
          } else {
            discardCardToGraveyard(card, { owner: 'player' });
            addGameLog('event', `${card.name}：地城没有空位，进入墓地。`);
            setHeroSkillBanner(`地城没有空位，${card.name} 进入墓地。`);
          }
          resetDragState();
          return;
        }

        if (card.type === 'potion') {
          void handlePotionConsumption(card);
        } else if (card.type === 'magic' || card.type === 'hero-magic') {
          handleSkillCard(card);
        } else if (card.type === 'event') {
          startEventResolution(null, 'hand');
          setCurrentEventCard(card);
          eventChoiceProcessingRef.current = false;
          setEventModalOpen(true);
          resetDragState();
          return;
        }
        resetDragState();
        return;
      }
      // Purchasing from dungeon - auto-equip/use
      if (card.type === 'potion') {
        void handlePotionConsumption(card);
        removeCard(card.id, false);
      } else if (card.type === 'magic' || card.type === 'hero-magic') {
        handleSkillCard(card);
        removeCard(card.id, false);
      } else if (card.type === 'event') {
        const freshBladeCard = card.isPermanentEvent
          ? activeCards.find(c => c?.id === card.id) ?? card
          : card;
        if (freshBladeCard.isPermanentEvent && !freshBladeCard.hasReleaseCharge) {
          setHeroSkillBanner('命运之刃暂无释放次数。');
          resetDragState();
          return;
        }
        let eventCard = card;
        if (card.name === '命运十字路口') {
          const currentIdx = activeCards.findIndex(c => c?.id === card.id);
          if (currentIdx > 0) {
            let targetIdx = currentIdx;
            for (let i = currentIdx - 1; i >= 0; i--) {
              if (activeCards[i] != null) break;
              targetIdx = i;
            }
            if (targetIdx !== currentIdx) {
              setActiveCards(prev => {
                const next = [...prev] as ActiveRowSlots;
                next[targetIdx] = prev[currentIdx];
                next[currentIdx] = null;
                return next;
              });
              addGameLog('event', `命运十字路口向左平移至第 ${targetIdx + 1} 列`);
            }
          }
          const finalIdx = (() => {
            const idx = activeCards.findIndex(c => c?.id === card.id);
            if (idx <= 0) return idx;
            let t = idx;
            for (let i = idx - 1; i >= 0; i--) {
              if (activeCards[i] != null) break;
              t = i;
            }
            return t;
          })();
          const belowMapping: Record<number, { type: 'equipment'; slotId: EquipmentSlotId } | { type: 'amulet' } | null> = {
            0: { type: 'amulet' },
            1: { type: 'equipment', slotId: 'equipmentSlot1' },
            2: null,
            3: { type: 'equipment', slotId: 'equipmentSlot2' },
            4: null,
          };
          const below = finalIdx >= 0 ? belowMapping[finalIdx] ?? null : null;
          let canDestroy = false;
          let destroyLabel = '';
          if (below?.type === 'equipment') {
            const slotItem = below.slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
            if (slotItem) {
              canDestroy = true;
              destroyLabel = `破坏下方装备「${slotItem.name}」，获得全部效果`;
            }
          } else if (below?.type === 'amulet') {
            if (amuletSlots.length > 0) {
              canDestroy = true;
              destroyLabel = `破坏下方护符「${amuletSlots[amuletSlots.length - 1].name}」，获得全部效果`;
            }
          }
          if (canDestroy && card.eventChoices) {
            eventCard = {
              ...card,
              eventChoices: [
                ...card.eventChoices,
                {
                  text: destroyLabel,
                  effect: 'crossroads-destroy-below',
                  hint: '破坏正下方的装备或护符，同时获得全部三项效果',
                },
              ],
            };
          }
        }
        if (eventCard.name === '墓语密室' && eventCard.eventChoices) {
          const cryptIdx = activeCards.findIndex(c => c?.id === eventCard.id);
          const leftCard = cryptIdx > 0 ? activeCards[cryptIdx - 1] : null;
          const rightCard = cryptIdx >= 0 && cryptIdx < DUNGEON_COLUMN_COUNT - 1 ? activeCards[cryptIdx + 1] : null;
          const bothMonsters = leftCard?.type === 'monster' && rightCard?.type === 'monster';
          const reasonParts: string[] = [];
          if (!leftCard || leftCard.type !== 'monster') reasonParts.push('左侧不是怪物');
          if (!rightCard || rightCard.type !== 'monster') reasonParts.push('右侧不是怪物');
          if (bothMonsters) {
            const flipTarget = {
              toCard: {
                id: `${eventCard.id}-flip-crypt-echo`,
                type: 'magic' as const,
                name: '墓语回响',
                value: 0,
                image: skillScrollImage,
                magicType: 'permanent' as const,
                magicEffect: '永久魔法：使用时回复 3 点生命。被弃置时从背包抽 3 张牌。',
                description: '使用时回复 3 点生命。被弃置时从背包抽 3 张牌。',
                onDiscardDraw: 3,
              },
              destination: 'backpack' as const,
              banner: '墓语密室翻转为「墓语回响」，已放入背包。',
            };
            eventCard = {
              ...eventCard,
              flipTarget,
              eventChoices: [...eventCard.eventChoices],
            };
          } else {
            const choice: EventChoiceDefinition = {
              text: '两侧皆为怪物（获得翻转效果）',
              effect: 'crypt-all-effects',
              hint: reasonParts.join('，'),
              requires: [{ type: 'hand', min: 999, message: reasonParts.join('，') }],
            };
            eventCard = {
              ...eventCard,
              eventChoices: [...eventCard.eventChoices, choice],
            };
          }
        }
        startEventResolution(eventCard.id, 'dungeon');
        setCurrentEventCard(eventCard);
        eventChoiceProcessingRef.current = false;
        setEventModalOpen(true);
        resetDragState();
        return;
      } else if (card.type === 'monster') {
        beginCombat(card, 'monster');
      } else {
        // Other card types go to backpack
        if (canCardGoToBackpack(card) && backpackItems.length < backpackCapacity) {
          const isDungeonCard = activeCards.some(slotCard => slotCard?.id === card.id);
          addCardToBackpack(card, {
            pendingDungeonCardId: isDungeonCard ? card.id : undefined,
          });
    // // toast({ title: 'Item Stored!', description: `${card.name} added to backpack` });
          if (isDungeonCard) {
            removeCard(card.id, false, { skipAutoDraw: true });
          } else {
            removeCard(card.id, false);
          }
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
  handleCardToHeroRef.current = handleCardToHero;

  const isEquipmentCard = (card: GameCardData) =>
    (EQUIPMENT_TYPES as readonly CardType[]).includes(card.type);
  const isConsumableCard = (card: GameCardData) =>
    (CONSUMABLE_TYPES as readonly CardType[]).includes(card.type);
  const isPermanentMagicCard = (
    card: GameCardData | null | undefined,
  ): card is GameCardData => Boolean(card && card.type === 'magic' && card.magicType === 'permanent');
  const isRecyclableFromHand = (card: GameCardData | null | undefined): boolean =>
    Boolean(
      card &&
        ((card.type === 'magic' && card.magicType === 'permanent') ||
          card.type === 'amulet' ||
          card.isPermanentEvent ||
          isPermRecycleEquipment(card)),
    );
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
    return Boolean(normalizeHeroEquipmentSlotFromDrag(origin));
  };

  function handleCardToSlot(card: GameCardData, slotId: string) {
    if (fullBoardInteractionLockedRef.current) return;
    pushUndoSnapshot();
    if (slotId === 'slot-amulet') {
      if (handLockedForMonsterPhaseRef.current) return;
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

        if (!alreadyEquipped && next.length >= maxAmuletSlots) {
          displacedAmulet = next.shift() ?? null;
        }

        const updated = [...next, { ...card, fromSlot: 'amulet' } as AmuletItem];
        return updated.slice(-maxAmuletSlots);
      });

      addGameLog('amulet', `装备护符：${card.name}`);
      if (card.amuletEffect === 'recycle-forge') {
        recycleForgePlayCountRef.current = 0;
        setRecycleForgePlayCount(0);
      }
      if (displacedAmulet !== null) {
        const displaced = displacedAmulet as AmuletItem;
        addGameLog('amulet', `卸下护符：${displaced.name}`);
        discardCardToGraveyard(displaced, { owner: 'player' });
      }

      if (isCardFromHand(card)) {
        if (!consumeCardFromHand(card)) {
          return;
        }
        tickRecycleForge();
      } else if (backpackItems.some(c => c.id === card.id)) {
        setBackpackItems(prev => prev.filter(c => c.id !== card.id));
      } else {
        removeCard(card.id, false);
      }

      resetDragState();
    } else if (slotId === 'slot-backpack') {
      if (isCardFromEquipmentSlot(card)) {
        resetDragState();
        return;
      }
      if (handCards.some(c => c.id === card.id)) {
        if (isRecyclableFromHand(card)) {
          if (!consumeCardFromHand(card)) {
            resetDragState();
            return;
          }
          if (card.isCurse && (card as any).knightEffect === 'greed-curse') {
            setGold(prev => Math.max(0, prev - 3));
            addGameLog('magic', `弃置「${card.name}」回到回收袋（贪婪诅咒消耗了 3 金币）。`);
            setHeroSkillBanner(`${card.name} 已弃置回回收袋，失去 3 金币。`);
          } else if (card.isCurse) {
            applyDamage(3);
            addGameLog('magic', `弃置「${card.name}」回到回收袋（血咒吸取了 3 点生命）。`);
            setHeroSkillBanner(`${card.name} 已弃置回回收袋，失去 3 点生命。`);
          } else {
            addGameLog('magic', `弃置「${card.name}」回到回收袋。`);
            setHeroSkillBanner(`${card.name} 已弃置回回收袋。`);
          }
          if (card.type === 'amulet') {
            addPermanentMagicToRecycleBag(card);
            applyDiscardSideEffects(card, 'player');
          } else {
            discardCardToGraveyard(card, { owner: 'player' });
          }
          resetDragState();
          return;
        }
        return;
      }

      const isDungeonPermEvent = card.isPermanentEvent && activeCards.some(c => c?.id === card.id);
      if (isDungeonPermEvent) {
        removeCard(card.id, false);
        discardCardToGraveyard(card, { owner: 'player' });
        addGameLog('event', `${card.name} 已弃置回回收袋。`);
        setHeroSkillBanner(`${card.name} 已弃置回回收袋。`);
        resetDragState();
        return;
      }

      if (!canCardGoToBackpack(card)) {
        return;
      }

      // Check if backpack is full
      if (backpackItems.length >= backpackCapacity) {
    // // toast({ title: 'Backpack Full!', description: 'Maximum 15 items', variant: 'destructive' });
        return;
      }

      const cardWithOrigin = card as GameCardData & { fromSlot?: DragOrigin };
      const fromAmuletSlot =
        cardWithOrigin.fromSlot === 'amulet' || amuletSlots.some(slot => slot?.id === card.id);
      if (fromAmuletSlot) {
        addPermanentMagicToRecycleBag(card);
        applyDiscardSideEffects(card, 'player');
        setAmuletSlots(prev => prev.filter(slot => slot?.id !== card.id));
        addGameLog('magic', `弃置护符「${card.name}」回到回收袋。`);
        setHeroSkillBanner(`${card.name} 已弃置回回收袋。`);
        resetDragState();
        return;
      }
      
      const isDungeonCard = activeCards.some(slot => slot?.id === card.id);
      addCardToBackpack(card, {
        pendingDungeonCardId: isDungeonCard ? card.id : undefined,
      });
      if (isDungeonCard) {
        removeCard(card.id, false, { skipAutoDraw: true });
      } else {
        removeCard(card.id, false);
      }
      resetDragState();
    } else if (slotId.startsWith('slot-equipment')) {
      const equipSlot: EquipmentSlotId = slotId === 'slot-equipment-1' ? 'equipmentSlot1' : 'equipmentSlot2';
      const equippedItem = equipSlot === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      
      const isMonsterFromHand = card.type === 'monster' && (isCardFromHand(card) || backpackItems.some(b => b.id === card.id));

      if (card.type === 'monster' && !isMonsterFromHand) {
        beginCombat(card, 'monster');
        resetDragState();
        return;
      }

      if (isCardFromEquipmentSlot(card)) {
        resetDragState();
        return;
      }

      if (card.type !== 'weapon' && card.type !== 'shield' && !isMonsterFromHand) {
        return;
      }

      if (selectedHeroSkillRef.current === 'shield-wall' && card.type === 'weapon') {
        setHeroSkillBanner('雷盾心法：不能装备武器！');
        resetDragState();
        return;
      }

      const slotCap = equipmentSlotCapacity[equipSlot];
      const reserve = getEquipmentReserve(equipSlot);
      const totalEquipped = (equippedItem ? 1 : 0) + reserve.length;

      if (totalEquipped < slotCap) {
        if (equippedItem) {
          setEquipmentReserve(equipSlot, [...reserve, equippedItem]);
        }
      } else {
        if (equippedItem && equippedItem.id !== card.id) {
          if (reserve.length > 0) {
            disposeOwnedEquipmentCard(reserve[0]);
            addGameLog('equip', `卸下 ${reserve[0].name}`);
            const newReserve = reserve.slice(1);
            setEquipmentReserve(equipSlot, equippedItem ? [...newReserve, equippedItem] : newReserve);
          } else {
            disposeOwnedEquipmentCard(equippedItem);
            addGameLog('equip', `卸下 ${equippedItem.name}`);
          }
        }
      }

      let equipCard: EquipmentItem;
      if (isMonsterFromHand) {
        const monsterAttack = card.attack ?? card.value;
        const monsterArmor = card.hp ?? card.value;
        const monsterMaxDurability = card.hpLayers ?? card.fury ?? 1;
        const monsterInitialDurability = card.isMinionCard ? monsterMaxDurability : 1;
        equipCard = {
          ...card,
          type: 'monster' as const,
          value: monsterAttack,
          attack: monsterAttack,
          hp: monsterArmor,
          durability: monsterInitialDurability,
          maxDurability: monsterMaxDurability,
        } as EquipmentItem;
        addGameLog('equip', `装备怪物 ${card.name}（${monsterAttack}攻 / ${monsterArmor}防 / ${monsterInitialDurability}/${monsterMaxDurability}耐久）`);
      } else {
        const base = { ...card } as EquipmentItem;
        const maxD = base.maxDurability ?? base.durability;
        equipCard =
          maxD != null && maxD > 0
            ? { ...base, durability: maxD, maxDurability: maxD }
            : base;
        const durNote =
          equipCard.maxDurability != null && equipCard.maxDurability > 0
            ? `（耐久 ${equipCard.durability}/${equipCard.maxDurability}）`
            : '';
        addGameLog(
          'equip',
          `装备 ${card.name}（${card.type === 'weapon' ? `${card.value}攻` : `${card.value}防`}）${durNote}`,
        );
      }
      setEquipmentSlotById(equipSlot, equipCard);
    // // toast({ 
        // title: `${card.type === 'weapon' ? 'Weapon' : 'Shield'} Equipped!`,
        // description: card.durability ? `${card.durability}/${card.maxDurability} uses` : undefined
      // });
      if (isCardFromHand(card)) {
        if (!consumeCardFromHand(card)) {
          return;
        }
        tickRecycleForge();
      } else {
        removeCard(card.id, false);
      }
      resetDragState();
    }
  };

  const handleEventChoice = async (choiceIndex: number) => {
    if (eventChoiceProcessingRef.current) return;
    pushUndoSnapshot();
    if (!currentEventCard || !currentEventCard.eventChoices) return;
    
    const choice = currentEventCard.eventChoices[choiceIndex];
    if (!choice) return;

    if (eventChoiceStates[choiceIndex]?.disabled) {
      return;
    }
    eventChoiceProcessingRef.current = true;

    addGameLog('event', `事件「${currentEventCard.name}」：选择「${choice.text}」`);

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
        addGameLog('event', `事件效果：受到 ${damage} 点伤害`);
        applyDamage(damage);
      } else if (effect.startsWith('heal+')) {
        const healAmount = parseInt(effect.replace('heal+', ''), 10);
        addGameLog('event', `事件效果：回复 ${healAmount} 点生命`);
        healHero(healAmount);
      } else if (effect === 'fullheal') {
        addGameLog('event', '事件效果：完全治愈');
        healHero(maxHp);
      } else if (effect.startsWith('gold-')) {
        const goldLost = parseInt(effect.replace('gold-', ''), 10);
        const actualLoss = Math.min(goldLost, gold);
        if (actualLoss > 0) {
          setGold(prev => Math.max(0, prev - goldLost));
        }
        if (actualLoss < goldLost) {
          addGameLog('event', `事件效果：失去 ${actualLoss} 金币（金币不足，应扣 ${goldLost}）`);
        } else {
          addGameLog('event', `事件效果：失去 ${goldLost} 金币`);
        }
      } else if (effect.startsWith('gold+')) {
        const goldGain = parseInt(effect.replace('gold+', ''), 10);
        addGameLog('event', `事件效果：获得 ${goldGain} 金币`);
        setGold(prev => prev + goldGain);
      } else if (effect.startsWith('maxhpperm+')) {
        const bonus = parseInt(effect.replace('maxhpperm+', ''), 10);
        if (!Number.isNaN(bonus)) {
          addGameLog('event', `事件效果：最大生命永久 +${bonus}`);
          setPermanentMaxHpBonus(prev => prev + bonus);
        }
      } else if (effect === 'weapon') {
        const weaponValue = Math.floor(Math.random() * 3) + 3;
        console.debug('[Event] Placeholder weapon reward', weaponValue);
      } else if (effect === 'permanentskill') {
        const randomSkill = ['Iron Skin', 'Weapon Master'][Math.floor(Math.random() * 2)];
        addGameLog('event', `事件效果：获得永久技能 ${randomSkill}`);
        setPermanentSkills(prev => [...prev, randomSkill]);
      } else if (effect === 'flipToCurse') {
        if (currentEventCard) {
          const curseCard = createCurseCard(currentEventCard);
          await triggerEventTransform(currentEventCard, curseCard);
          skipNextEventAutoDrawRef.current = true;
          addCardToBackpack(curseCard);
          addGameLog('event', '事件效果：卷轴转化为血咒');
          setHeroSkillBanner('卷轴翻转化为血咒，潜入了你的背包。');
          if (amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'addCurse') {
        const curseCard = createCurseCard(currentEventCard || undefined);
        skipNextEventAutoDrawRef.current = true;
        addCardToBackpack(curseCard);
        addGameLog('event', '事件效果：获得一张血咒');
        setHeroSkillBanner('一张血咒潜入了你的背包。');
      } else if (effect === 'discardHandAll') {
        const hadCards = handCards.length;
        await discardAllHandCards();
        addGameLog('event', `事件效果：弃掉全部手牌（${hadCards} 张）`);
        if (hadCards > 0) {
          setHeroSkillBanner('你弃掉了全部手牌。');
        } else {
          setHeroSkillBanner('没有手牌可以弃掉。');
        }
      } else if (effect.startsWith('backpackSize-')) {
        const reduction = Math.abs(parseInt(effect.replace('backpackSize-', ''), 10)) || 0;
        if (reduction > 0) {
          const newCapacity = Math.max(1, backpackCapacity - reduction);
          setBackpackCapacityModifier(prev => prev - reduction);

          const currentItems = backpackItemsRef.current;
          const overflow = currentItems.length - newCapacity;
          if (overflow > 0) {
            const indices = currentItems.map((_, i) => i);
            for (let i = indices.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [indices[i], indices[j]] = [indices[j], indices[i]];
            }
            const evictedIndices = new Set(indices.slice(0, overflow));
            const evicted = indices.slice(0, overflow).map(i => currentItems[i]);
            const remaining = currentItems.filter((_, i) => !evictedIndices.has(i));

            backpackItemsRef.current = remaining;
            setBackpackItems(remaining);

            const flights = evicted.map(card => ({
              card,
              promise: triggerDiscardFlight(card, 'recycle-bag'),
            }));
            await Promise.all(flights.map(f => f.promise));
            flights.forEach(f => addPermanentMagicToRecycleBag(f.card));

            addGameLog('event', `事件效果：背包容量永久 -${reduction}，${evicted.length} 张多余的牌放入回收袋`);
            setHeroSkillBanner(`背包容量降低 ${reduction}，${evicted.map(c => c.name).join('、')} 被放入回收袋。`);
          } else {
            addGameLog('event', `事件效果：背包容量永久 -${reduction}`);
            setHeroSkillBanner(`背包容量永久降低 ${reduction}。`);
          }
        }
      } else if (effect.startsWith('backpackSize+')) {
        const increase = parseInt(effect.replace('backpackSize+', ''), 10) || 0;
        if (increase > 0) {
          addGameLog('event', `事件效果：背包容量永久 +${increase}`);
          setBackpackCapacityModifier(prev => prev + increase);
          setHeroSkillBanner(`背包容量永久增加 ${increase}。`);
        }
      } else if (effect === 'equipBurst+4') {
        const weaponSlots = getEquipmentSlots().filter(slot => slot.item?.type === 'weapon' || slot.item?.type === 'monster');
        if (weaponSlots.length === 0) {
          setHeroSkillBanner('当前没有装备武器，无法施加祝福。');
        } else if (weaponSlots.length === 1) {
          const slotId = weaponSlots[0].id;
          setSlotAttackBursts(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + 4 }));
          addGameLog('event', `事件效果：${weaponSlots[0].item!.name} 下次攻击 +4`);
          setHeroSkillBanner(`${weaponSlots[0].item!.name} 的下次攻击将额外造成 4 点伤害！`);
        } else {
          const selected = await requestEquipmentSelection({
            prompt: '选择一把武器接受锋刃祝福',
            subtext: '该武器下次攻击将额外 +4 伤害。',
          });
          if (selected) {
            const slotItem = selected === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
            if (slotItem?.type === 'weapon' || slotItem?.type === 'monster') {
              setSlotAttackBursts(prev => ({ ...prev, [selected]: (prev[selected] ?? 0) + 4 }));
              addGameLog('event', `事件效果：${slotItem.name} 下次攻击 +4`);
              setHeroSkillBanner(`${slotItem.name} 的下次攻击将额外造成 4 点伤害！`);
            } else {
              setHeroSkillBanner('所选装备不是武器。');
            }
          }
        }
      } else if (effect === 'turnCount-2') {
        addGameLog('event', '事件效果：Waterfall 进度 -2');
        setTurnCount(prev => Math.max(1, prev - 2));
        setHeroSkillBanner('时空收缩：怪物成长进度回退了 2 步！');
      } else if (effect === 'flipToDoubleNextMagic') {
        if (currentEventCard) {
          const doubleCard: GameCardData = {
            id: `double-magic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'magic',
            name: '法术回响',
            value: 0,
            image: skillScrollImage,
            magicType: 'permanent',
            magicEffect: 'double-next-magic',
            description: '永久魔法：使用后，下一张法术的效果将触发两次。',
          };
          await triggerEventTransform(currentEventCard, doubleCard, '契约裂隙涌出回响之力…');
          skipNextEventAutoDrawRef.current = true;
          addCardToBackpack(doubleCard);
          addGameLog('event', '事件效果：获得「法术回响」');
          setHeroSkillBanner('裂隙中浮现了「法术回响」，已放入背包。');
          if (amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'crypt-all-effects') {
        const deleteSuccess = await requestCardAction('delete', 1, {
          title: '墓语密室：删除 1 张卡牌',
          description: '被删除的卡牌会被送入坟场，永久离开你的牌库。',
        });
        if (deleteSuccess) {
          addGameLog('event', '墓语密室（全效）：删除了 1 张卡牌');
        } else {
          addGameLog('event', '墓语密室（全效）：未删除卡牌');
        }
        const selected = await requestGraveyardSelection(3);
        if (selected) {
          addGameLog('event', `墓语密室（全效）：从坟场召回 ${selected.name}`);
        }
        setBackpackCapacityModifier(prev => prev + 2);
        addGameLog('event', '墓语密室（全效）：背包上限 +2');
        addGameLog('shop', '墓语密室（全效）：开启商店');
        const started = startShopFlow(currentEventCard);
        if (started) {
          eventResolutionDeferred = true;
          break;
        }
      } else if (effect === 'crossroads-destroy-below') {
        if (currentEventCard && resolvingDungeonCardId) {
          const cardIdx = activeCards.findIndex(c => c?.id === resolvingDungeonCardId);
          const belowMap: Record<number, { type: 'equipment'; slotId: EquipmentSlotId } | { type: 'amulet' } | null> = {
            0: { type: 'amulet' },
            1: { type: 'equipment', slotId: 'equipmentSlot1' },
            2: null,
            3: { type: 'equipment', slotId: 'equipmentSlot2' },
            4: null,
          };
          const below = cardIdx >= 0 ? belowMap[cardIdx] ?? null : null;
          if (below?.type === 'equipment') {
            const slotItem = below.slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
            if (slotItem) {
              addGameLog('event', `命运十字路口：破坏了下方装备「${slotItem.name}」`);
              disposeOwnedEquipmentCard(slotItem, { isDestruction: true });
              clearEquipmentSlotById(below.slotId);
              const reserve = below.slotId === 'equipmentSlot1' ? equipmentSlot1Reserve : equipmentSlot2Reserve;
              if (reserve.length > 0) {
                const promoted = reserve[reserve.length - 1];
                setEquipmentSlotById(below.slotId, promoted);
                setEquipmentReserve(below.slotId, reserve.slice(0, -1));
              }
              setHeroSkillBanner(`破坏了「${slotItem.name}」！获得全部三项效果！`);
            }
          } else if (below?.type === 'amulet' && amuletSlots.length > 0) {
            const topAmulet = amuletSlots[amuletSlots.length - 1];
            addGameLog('event', `命运十字路口：破坏了下方护符「${topAmulet.name}」`);
            addToGraveyard(topAmulet);
            setAmuletSlots(prev => prev.slice(0, -1));
            setHeroSkillBanner(`破坏了「${topAmulet.name}」！获得全部三项效果！`);
          }
          setPermanentMaxHpBonus(prev => prev + 3);
          addGameLog('event', '命运十字路口：最大生命永久 +3');
          const started = startShopFlow(currentEventCard);
          if (started) {
            eventResolutionDeferred = true;
          }
          addGameLog('event', '命运十字路口：发现职业牌');
          const discoverStarted = beginDiscoverFlow('discoverClass');
          if (discoverStarted) {
            eventResolutionDeferred = true;
          } else {
            handleDiscoverFallback();
          }
        }
      } else if (effect === 'guildFlipToMagic') {
        if (currentEventCard) {
          const bloodGoldCard: GameCardData = {
            id: 'guild-blood-gold',
            type: 'magic',
            name: '血金术',
            value: 0,
            image: skillScrollImage,
            magicType: 'permanent',
            magicEffect: '永久魔法：受到 1 点伤害，获得 2 金币。',
            description: '以鲜血换取黄金，奇术商会的禁忌手段。',
          };
          await triggerEventTransform(currentEventCard, bloodGoldCard, '奇术商会翻转为「血金术」…');
          skipNextEventAutoDrawRef.current = true;
          addCardToBackpack(bloodGoldCard);
          addGameLog('event', '事件效果：获得「血金术」');
          setHeroSkillBanner('商会卷轴翻转为「血金术」，已放入背包。');
          if (amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'flipToPaperAsh') {
        if (currentEventCard) {
          const paperAshPotion: GameCardData = {
            id: `paper-ash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'potion',
            name: '纸灰药剂',
            value: 0,
            image: potionSpellDamageImage,
            description: '使用时永久让法术伤害 +2。',
            potionEffect: 'perm-spell-damage-2',
          };
          await triggerEventTransform(currentEventCard, paperAshPotion, '残页翻转，药香浮现…');
          skipNextEventAutoDrawRef.current = true;
          addCardToBackpack(paperAshPotion);
          addGameLog('event', '事件效果：遗稿翻转成了「纸灰药剂」');
          setHeroSkillBanner('遗稿翻转成了纸灰药剂，已放入背包。');
          if (amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'flipToLeftDurabilityPotion') {
        if (currentEventCard) {
          const flipPotionId = `right-dur-potion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const durabilityPotion: GameCardData = {
            id: `left-dur-potion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'potion',
            name: '淬炼药剂',
            value: 0,
            image: potionWeaponRepairImage,
            description: '使用时左装备栏的装备耐久上限 +1。翻转后为右装备栏耐久上限 +1 的药剂。',
            potionEffect: 'left-slot-durability-max+1',
            flipTarget: {
              toCard: {
                id: flipPotionId,
                type: 'potion',
                name: '淬炼药剂（右）',
                value: 0,
                image: potionWeaponRepairImage,
                description: '使用时右装备栏的装备耐久上限 +1。',
                potionEffect: 'right-slot-durability-max+1',
              },
              destination: 'backpack',
              banner: '淬炼药剂翻转，右侧淬炼之力凝结…',
            },
          };
          await triggerEventTransform(currentEventCard, durabilityPotion, '残页翻转，淬炼之力凝结…');
          skipNextEventAutoDrawRef.current = true;
          addCardToBackpack(durabilityPotion);
          addGameLog('event', '事件效果：遗稿翻转成了「淬炼药剂」');
          setHeroSkillBanner('遗稿翻转成了淬炼药剂，已放入背包。');
          if (amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'flipToHonorBloodMagic') {
        if (currentEventCard) {
          const honorBloodCard: GameCardData = {
            id: `honor-blood-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'magic',
            name: '战血之印',
            value: 0,
            image: skillScrollImage,
            magicType: 'permanent',
            magicEffect: 'honor-blood',
            description:
              '永久魔法：打出时失去 1 点生命，选择一件装备恢复 1 点耐久（法术回响时恢复 2）。被弃置时对激活行每只怪物各造成 1 点伤害。',
          };
          await triggerEventTransform(currentEventCard, honorBloodCard, '战血荣誉翻转为「战血之印」…');
          skipNextEventAutoDrawRef.current = true;
          addCardToBackpack(honorBloodCard);
          addGameLog('event', '事件效果：战血荣誉翻转成了「战血之印」');
          setHeroSkillBanner('战血荣誉翻转为战血之印，已放入背包。');
          if (amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'handLimit+1') {
        setHandLimitBonus(prev => prev + 1);
        addGameLog('event', '事件效果：手牌上限 +1');
        setHeroSkillBanner(`手牌上限提升至 ${effectiveHandLimit + 1}。`);
      } else if (effect === 'amuletCapacity+1') {
        setMaxAmuletSlots(prev => prev + 1);
        addGameLog('event', '事件效果：护符上限 +1');
        setHeroSkillBanner(`护符上限提升至 ${maxAmuletSlots + 1}。`);
      } else if (effect === 'equipSlot1Capacity+1') {
        setEquipmentSlotCapacity(prev => ({ ...prev, equipmentSlot1: prev.equipmentSlot1 + 1 }));
        addGameLog('event', '事件效果：左装备栏容量 +1');
        setHeroSkillBanner('左装备栏现在可以装备多件装备了！');
      } else if (effect === 'equipSlot2Capacity+1') {
        setEquipmentSlotCapacity(prev => ({ ...prev, equipmentSlot2: prev.equipmentSlot2 + 1 }));
        addGameLog('event', '事件效果：右装备栏容量 +1');
        setHeroSkillBanner('右装备栏现在可以装备多件装备了！');
      } else if (effect.startsWith('shopLevel+')) {
        const amount = parseInt(effect.replace('shopLevel+', ''), 10) || 1;
        setShopLevel(prev => {
          const next = Math.min(MAX_SHOP_LEVEL, Math.max(0, prev + amount));
          if (next === prev) {
            addGameLog('shop', `商店等级已达上限 Lv.${MAX_SHOP_LEVEL}，无法继续提升`);
            setHeroSkillBanner(`商店等级已满（Lv.${MAX_SHOP_LEVEL}）！`);
            return prev;
          }
          addGameLog('shop', `商店等级提升至 Lv.${next}`);
          setHeroSkillBanner(`商店等级提升到 Lv.${next}`);
          return next;
        });
      } else if (effect.startsWith('spellDamage+')) {
        const amount = parseInt(effect.replace('spellDamage+', ''), 10) || 1;
        setPermanentSpellDamageBonus(prev => {
          const next = prev + amount;
          addGameLog('event', `事件效果：法术伤害永久 +${amount}`);
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
      } else if (effect.startsWith('randomDiscardHand:')) {
        clearUndoStack();
        const count = parseInt(effect.replace('randomDiscardHand:', ''), 10) || 1;
        const currentHand = handCards.filter(c => c.id !== currentEventCard?.id);
        const toDiscardCount = Math.min(count, currentHand.length);
        const indices = new Set<number>();
        while (indices.size < toDiscardCount) {
          indices.add(Math.floor(Math.random() * currentHand.length));
        }
        const cardsToDiscard = Array.from(indices).map(idx => currentHand[idx]);
        const flights = cardsToDiscard.map(dc => ({
          card: dc,
          promise: triggerDiscardFlight(dc, isRecyclableFromHand(dc) && dc.type !== 'amulet' ? 'recycle-bag' : 'graveyard'),
        }));
        const discardIds = new Set(cardsToDiscard.map(c => c.id));
        handCardsRef.current = handCardsRef.current.filter(c => !discardIds.has(c.id));
        setHandCards(handCardsRef.current);
        await Promise.all(flights.map(f => f.promise));
        flights.forEach(f => discardCardToGraveyard(f.card, { owner: 'player' }));
        const discardedNames = cardsToDiscard.map(c => c.name);
        if (discardedNames.length > 0) {
          addGameLog('event', `随机弃置手牌：${discardedNames.join('、')}`);
          setHeroSkillBanner(`随机弃置了 ${discardedNames.join('、')}。`);
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
          addGameLog('event', `事件效果：从坟场召回 ${selected.name}`);
          setHeroSkillBanner(`你从坟场带回了 ${selected.name}。`);
        } else {
          setHeroSkillBanner('坟场中没有可召回的卡牌。');
        }
      } else if (effect.startsWith('drawHeroCards:')) {
        const drawCount = parseInt(effect.replace('drawHeroCards:', ''), 10) || 1;
        const drawn = drawCardsFromBackpack(drawCount);
        if (drawn > 0) {
          addGameLog('event', `事件效果：从背包抽 ${drawn} 张牌`);
          setHeroSkillBanner(`从背包抽到了 ${drawn} 张牌。`);
        } else {
          setHeroSkillBanner('背包为空或手牌已满，无法抽牌。');
        }
      } else if (effect === 'removeAllAmulets') {
        if (amuletSlots.length) {
          addGameLog('event', `事件效果：粉碎 ${amuletSlots.length} 枚护符`);
          amuletSlots.forEach(amulet => addToGraveyard(amulet));
          setAmuletSlots([]);
          setHeroSkillBanner('所有护符都被粉碎了。');
        } else {
          setHeroSkillBanner('你没有佩戴护符。');
        }
      } else if (effect === 'destroyEquipment:any') {
        const slotsWithItems = getEquipmentSlots().filter(slot => slot.item);
        if (!slotsWithItems.length) {
          addGameLog('event', '事件效果：无装备可破坏');
          continue;
        }
        if (slotsWithItems.length === 1) {
          addGameLog('event', `事件效果：破坏装备「${slotsWithItems[0].item!.name}」`);
          sacrificeEquipment(slotsWithItems[0].id);
        } else {
          const selected = await requestEquipmentSelection({
            prompt: '选择要破坏的装备',
            subtext: '左或右装备栏至少保留一件。',
          });
          if (selected) {
            const destroyedItem = selected === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
            addGameLog('event', `事件效果：破坏装备「${destroyedItem?.name ?? '未知'}」`);
            sacrificeEquipment(selected);
          }
        }
      } else if (effect === 'slotLeftDamage+1') {
        addGameLog('event', '事件效果：左槽永久伤害 +1');
        setEquipmentSlotBonus('equipmentSlot1', 'damage', value => value + 1);
      } else if (effect === 'slotRightDefense+1') {
        addGameLog('event', '事件效果：右槽永久护甲 +1');
        setEquipmentSlotBonus('equipmentSlot2', 'shield', value => value + 1);
      } else if (effect === 'swapEquipmentSlots') {
        addGameLog('event', '事件效果：交换左右装备槽');
        swapEquipmentSlots();
      } else if (effect === 'discardLeftForGold+15') {
        if (sacrificeEquipment('equipmentSlot1')) {
          addGameLog('event', '事件效果：献祭左槽装备获得 15 金币');
          setGold(prev => prev + 15);
        }
      } else if (effect === 'discardRightForGold+15') {
        if (sacrificeEquipment('equipmentSlot2')) {
          addGameLog('event', '事件效果：献祭右槽装备获得 15 金币');
          setGold(prev => prev + 15);
        }
      } else if (effect === 'amuletsToGold+10') {
        addGameLog('event', '事件效果：护符转化为金币');
        convertAmuletsToGold(10);
      } else if (effect === 'classBottom+2') {
        addGameLog('event', '事件效果：职业牌组底 2 张入包');
        gainClassDeckBottomCards(2);
      } else if (effect === 'drawKnight3') {
        const drawn = drawClassCardsToBackpack(3, 'drawKnight3');
        addGameLog('event', `事件效果：抽取 ${drawn.length} 张职业牌`);
        triggerClassDeckFlight(drawn);
      } else if (effect === 'equipKnight') {
        const equipmentCards = classDeck.filter(c => c.type === 'weapon' || c.type === 'shield');
        if (equipmentCards.length > 0) {
          const equipment = equipmentCards[Math.floor(Math.random() * equipmentCards.length)];
          addGameLog('event', `事件效果：随机装备 ${equipment.name}`);
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
          addGameLog('event', `事件效果：打出技能 ${skill.name}`);
          setClassDeck(prev => prev.filter(c => c.id !== skill.id));
          handleSkillCard(skill);
        }
      } else if (effect === 'weaponUpgrade' || effect === 'weaponUpgrade2') {
        const upgradAmount = effect === 'weaponUpgrade2' ? 2 : 2;
        addGameLog('event', `事件效果：武器攻击力 +${upgradAmount}`);
        if (equipmentSlot1?.type === 'weapon') {
          setEquipmentSlot1(prev => (prev ? { ...prev, value: prev.value + upgradAmount } : null));
        } else if (equipmentSlot2?.type === 'weapon') {
          setEquipmentSlot2(prev => (prev ? { ...prev, value: prev.value + upgradAmount } : null));
        }
      } else if (effect === 'shieldUpgrade2') {
        addGameLog('event', '事件效果：盾牌防御力 +2');
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
            addGameLog('event', `事件效果：从坟场恢复盾牌「${shield.name}」并装备至左槽`);
          } else if (!equipmentSlot2) {
            setEquipmentSlot2(restoredShield);
            addGameLog('event', `事件效果：从坟场恢复盾牌「${shield.name}」并装备至右槽`);
          } else {
            addGameLog('event', '事件效果：没有空槽位，无法恢复盾牌');
          }
          setDiscardedCards(prev => prev.filter(c => c.id !== shield.id));
        } else {
          addGameLog('event', '事件效果：坟场没有盾牌可恢复');
        }
      } else if (effect.startsWith('tempShield+')) {
        const shieldGain = parseInt(effect.replace('tempShield+', ''), 10);
        addGameLog('event', `事件效果：临时护盾 +${shieldGain}`);
        setTempShield(prev => prev + shieldGain);
      } else if (effect === 'bloodEmpower') {
        const empoweredSlot = findWeaponSlot();
        if (empoweredSlot?.item) {
          const empoweredWeapon: EquipmentItem = {
            ...empoweredSlot.item,
            value: empoweredSlot.item.value + 2,
          };
          addGameLog('event', `事件效果：${empoweredSlot.item.name} 攻击 +2`);
          setEquipmentSlotById(empoweredSlot.id, empoweredWeapon);
        } else {
          addGameLog('event', '事件效果：无武器，获得 5 金币');
          setGold(prev => prev + 5);
        }
      } else if (effect === 'draw2') {
        const drawn = drawClassCardsToBackpack(2, 'draw2');
        addGameLog('event', `事件效果：抽取 ${drawn.length} 张职业牌`);
        triggerClassDeckFlight(drawn);
      } else if (effect === 'drawClass2') {
        const drawn = drawClassCardsToBackpack(2, 'drawClass2');
        addGameLog('event', `事件效果：抽取 ${drawn.length} 张职业牌`);
        triggerClassDeckFlight(drawn);
      } else if (effect === 'drawKnight1') {
        const drawn = drawClassCardsToBackpack(1, 'drawKnight1');
        addGameLog('event', `事件效果：抽取 ${drawn.length} 张职业牌`);
        triggerClassDeckFlight(drawn);
      } else if (effect === 'drawKnight4') {
        const drawn = drawClassCardsToBackpack(4, 'drawKnight4');
        addGameLog('event', `事件效果：抽取 ${drawn.length} 张职业牌`);
        triggerClassDeckFlight(drawn);
      } else if (effect === 'drawSkill') {
        const drawn = drawClassCardsToBackpack(1, 'drawSkill', card => card.type === 'skill');
        addGameLog('event', `事件效果：抽取技能牌 ${drawn.length} 张`);
        triggerClassDeckFlight(drawn);
      } else if (effect === 'drawEquipment') {
        const drawn = drawClassCardsToBackpack(
          2,
          'drawEquipment',
          card => card.type === 'weapon' || card.type === 'shield',
        );
        addGameLog('event', `事件效果：抽取装备牌 ${drawn.length} 张`);
        triggerClassDeckFlight(drawn);
      } else if (effect === 'discoverClass') {
        addGameLog('event', '事件效果：发现职业牌');
        const started = beginDiscoverFlow(effect);
        if (started) {
          eventResolutionDeferred = true;
          break;
        } else {
          handleDiscoverFallback();
        }
      } else if (effect === 'openShop') {
        addGameLog('shop', '事件效果：开启商店');
        const started = startShopFlow(currentEventCard);
        if (started) {
          eventResolutionDeferred = true;
          break;
        }
      } else if (effect === 'repairAll') {
        addGameLog('event', '事件效果：全部装备耐久回满');
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
      } else if (effect === 'repairAllDurability+1') {
        addGameLog('event', '事件效果：所有装备耐久 +1');
        const repairSlots = getEquipmentSlots();
        let repaired = 0;
        repairSlots.forEach(slot => {
          if (slot.item && slot.item.durability != null && slot.item.maxDurability != null) {
            if (slot.item.durability < slot.item.maxDurability) {
              setEquipmentSlotById(slot.id, {
                ...slot.item,
                durability: Math.min(slot.item.maxDurability, slot.item.durability + 1),
              });
              repaired++;
            }
          }
        });
        setHeroSkillBanner(repaired > 0 ? `所有装备耐久 +1。` : '没有装备需要修复。');
      } else if (effect === 'destroyAllEquipment') {
        addGameLog('event', '事件效果：摧毁所有装备');
        const destroySlots = getEquipmentSlots();
        let destroyed = 0;
        destroySlots.forEach(slot => {
          const reserve = getEquipmentReserve(slot.id);
          reserve.forEach(r => disposeOwnedEquipmentCard(r, { isDestruction: true }));
          setEquipmentReserve(slot.id, []);
          if (slot.item) {
            disposeOwnedEquipmentCard(slot.item, { isDestruction: true });
            clearEquipmentSlotById(slot.id);
            destroyed++;
          }
          destroyed += reserve.length;
        });
        if (destroyed > 0) {
          setHeroSkillBanner('所有装备都被摧毁了！');
        } else {
          setHeroSkillBanner('你没有装备可以被摧毁。');
        }
      } else if (effect === 'flipBackToGraveyardRecall') {
        const newCard = createGraveyardRecallCard();
        addCardToBackpack(newCard);
        addGameLog('event', '事件效果：翻转回原始法术「冥途拾遗」');
        setHeroSkillBanner('卷轴翻转回了「冥途拾遗」，已放入背包。');
      } else if (effect === 'vault-flipback') {
        const eventCardSnapshot = currentEventCard;
        const cellIdx = activeCards.findIndex(c => c?.id === eventCardSnapshot.id);

        setEventModalOpen(false);
        setEventModalMinimized(false);
        setCurrentEventCard(null);
        finalizeEventResolution({ removeFromDungeon: false });

        const damage = 3;
        setHp(prev => Math.max(0, prev - damage));
        addHeroMagicGauge('holy-light', 1);
        addGameLog('event', `秘藏宝库深入探索：受到 ${damage} 点伤害`);

        const flipBack = eventCardSnapshot._flipBackCard;

        if (cellIdx !== -1 && flipBack) {
          setActiveCards(prev => {
            const next = [...prev];
            next[cellIdx] = { ...flipBack };
            return next;
          });
          addGameLog('event', '秘藏宝库翻转回未开启状态');
        }

        setTurnCount(prev => prev + 1);
        addGameLog('event', '瀑流计数 +1');
        for (let bi = 0; bi < bulwarkPassiveRef.current; bi++) {
          applyBulwarkPassiveShieldIncrement();
        }

        setHeroSkillBanner(`深入探索！受到 ${damage} 点伤害，瀑流计数 +1！`);
        eventResolutionDeferred = true;
        break;
      } else if (effect === 'fate-dice-strike') {
        const eventCardSnapshot = currentEventCard;
        const resId = eventResolutionRef.current?.cardId;
        const cellIdx = resId
          ? activeCards.findIndex(c => c?.id === resId)
          : activeCards.findIndex(c => c?.id === eventCardSnapshot.id);
        const rightIdx = cellIdx >= 0 ? cellIdx + 1 : -1;
        const rightCard = rightIdx >= 0 && rightIdx < DUNGEON_COLUMN_COUNT ? activeCards[rightIdx] : null;
        const isPerm = eventCardSnapshot.isPermanentEvent;

        setEventModalOpen(false);
        setEventModalMinimized(false);
        setCurrentEventCard(null);
        finalizeEventResolution({ removeFromDungeon: false });

        if (
          rightCard &&
          (rightCard.type === 'potion' ||
            rightCard.type === 'weapon' ||
            rightCard.type === 'shield' ||
            rightCard.type === 'event')
        ) {
          addGameLog('event', `命运之刃破坏了 ${rightCard.name}`);
          removeCard(rightCard.id, true);
          setHeroSkillBanner(`命运之刃破坏了 ${rightCard.name}！`);
          if (!isPerm) {
            const flipBack = eventCardSnapshot._flipBackCard;
            if (cellIdx !== -1 && flipBack) {
              const restored = { ...flipBack };
              setActiveCards(prev => {
                const next = [...prev];
                next[cellIdx] = restored;
                return next;
              });
              addGameLog('event', '命运之刃翻转回命运骰盅');
            } else if (cellIdx !== -1) {
              removeCard(eventCardSnapshot.id, true);
            }
          }
        } else if (rightCard && rightCard.type === 'monster') {
          if (!isMonsterEngaged(rightCard.id)) {
            beginCombat(rightCard, 'hero');
          }
          const layersBefore = rightCard.currentLayer ?? rightCard.fury ?? 1;
          const hpNow = rightCard.hp ?? 0;
          const maxHpLayer = rightCard.maxHp ?? hpNow;
          // 当前层血量 + 一整层 maxHp：等价于连续击穿两层（仅剩一层时等同击杀）
          const strikeDamage = hpNow + maxHpLayer;
          const updatedMonster = damageMonsterWithLayerOverflow(rightCard, strikeDamage);
          const defeatedByBlade =
            (updatedMonster.currentLayer ?? 0) <= 0 || (updatedMonster.hp ?? 0) <= 0;
          const layersAfter = updatedMonster.currentLayer ?? 0;
          const layersStripped = Math.max(0, layersBefore - layersAfter);

          if (rightCard.bossRetaliationDamage && rightCard.bossRetaliationDamage > 0) {
            const retDmg = rightCard.bossRetaliationDamage;
            setHp(prev => {
              const newHp = Math.max(0, prev - retDmg);
              if (newHp === 0) {
                addGameLog('system', '英雄阵亡，游戏结束');
                setGameOver(true);
                setVictory(false);
              }
              return newHp;
            });
            addHeroMagicGauge('holy-light', 1);
            addGameLog('combat', `${rightCard.name} 反噬：造成 ${retDmg} 点直接伤害！`);
          }

          const pulseCount = Math.max(1, Math.min(4, layersStripped || 1));
          for (let i = 0; i < pulseCount; i += 1) {
            triggerMonsterBleedAnimation(rightCard.id, i * Math.floor(COMBAT_ANIMATION_STAGGER / 2));
          }

          if (defeatedByBlade) {
            updateMonsterCard(rightCard.id, () => updatedMonster);
            handleMonsterDefeated(rightCard);
            addGameLog('event', `命运之刃击杀了 ${rightCard.name}！`);
            setHeroSkillBanner(`命运之刃击杀了 ${rightCard.name}！`);
          } else {
            updateMonsterCard(rightCard.id, () => updatedMonster);
            if (layersAfter < layersBefore) {
              heroTurnLayerLossIdsRef.current.add(rightCard.id);
            }
            if (rightCard.bleedEffect && layersAfter < layersBefore) {
              const newAttack = updatedMonster.attack ?? updatedMonster.value;
              const perLayer = parseInt((rightCard.bleedEffect ?? '').replace('attack+', ''), 10) || 0;
              addGameLog(
                'combat',
                `${rightCard.name} 触发流血：攻击力+${perLayer * (layersBefore - layersAfter)}，当前 ${newAttack}！`,
              );
              setHeroSkillBanner(`${rightCard.name} 流血！攻击力升至 ${newAttack}！`);
            }
            if (rightCard.dragonBleedDestroy && layersAfter < layersBefore && layersAfter > 0) {
              dragonBleedDestroyEquipment(rightCard.name, layersAfter);
            }
            if (rightCard.monsterSpecial === 'bone-regen') {
              void checkHollowSkeletonRestore(rightCard.id, rightCard.name, layersBefore, layersAfter);
            }
            if (rightCard.monsterSpecial === 'wraith-rebirth') {
              void checkWraithRebirth(
                rightCard.id,
                rightCard.name,
                rightCard.fury ?? rightCard.hpLayers ?? 1,
                layersBefore,
                layersAfter,
              );
            }
            addGameLog(
              'event',
              `命运之刃对 ${rightCard.name} 打掉 ${layersStripped} 层血（共 2 层穿透结算，可一次击杀）！`,
            );
            setHeroSkillBanner(`命运之刃对 ${rightCard.name} 打掉 ${layersStripped} 层血！`);
          }
          if (!isPerm && cellIdx !== -1) {
            removeCard(eventCardSnapshot.id, true);
          }
        } else {
          const drawnNames: string[] = [];
          for (let i = 0; i < 2; i++) {
            const drawn = drawFromBackpackToHand();
            if (drawn) drawnNames.push(drawn.name);
          }
          if (drawnNames.length > 0) {
            addGameLog('event', `命运之刃：右侧无牌，从背包抽取了 ${drawnNames.join('、')}`);
            setHeroSkillBanner(`右侧无牌，命运之刃抽取了 ${drawnNames.join('、')}。`);
          } else {
            addGameLog('event', '命运之刃：右侧无牌且背包为空');
            setHeroSkillBanner('右侧没有卡牌，背包也没有牌可以抽取。');
          }
          if (!isPerm && cellIdx !== -1) {
            removeCard(eventCardSnapshot.id, true);
          }
        }

        if (isPerm && cellIdx !== -1) {
          setActiveCards(prev => {
            const next = [...prev] as typeof prev;
            const card = next[cellIdx];
            if (card?.name === '命运之刃' && card.isPermanentEvent) {
              next[cellIdx] = { ...card, hasReleaseCharge: false };
            }
            return next;
          });
        }

        eventResolutionDeferred = true;
      }
    }
    
    if (eventResolutionDeferred) {
      eventChoiceProcessingRef.current = false;
      return;
    }

    if (currentEventCard?.name === '战血荣誉' && resolvingDungeonCardId) {
      const cellIdx = activeCards.findIndex(c => c?.id === resolvingDungeonCardId);
      if (cellIdx !== -1 && cellIdx < activeCards.length - 1) {
        const rightMonsters: GameCardData[] = [];
        for (let i = cellIdx + 1; i < activeCards.length; i++) {
          const card = activeCards[i];
          if (card && card.type === 'monster') {
            rightMonsters.push(card);
          }
        }
        if (rightMonsters.length > 0) {
          rightMonsters.forEach(monster => {
            if (!isMonsterEngaged(monster.id)) {
              beginCombat(monster, 'hero');
            }
          });
          const names = rightMonsters.map(m => m.name).join('、');
          addGameLog('event', `战血荣誉激怒了右侧的怪物：${names}`);
          setHeroSkillBanner(`战血荣誉激怒了 ${names}！`);
        }
      }
    }

    if (choice.skipFlip && currentEventCard?.flipTarget) {
      skipEventFlipRef.current = true;
    }

    await completeCurrentEvent();
    eventChoiceProcessingRef.current = false;
  };

  const handlePlayCardFromHand = async (card: GameCardData, target?: any) => {
    if (fullBoardInteractionLockedRef.current || handLockedForMonsterPhaseRef.current) return;
    pushUndoSnapshot();
    if (!consumeCardFromHand(card)) {
      return;
    }

    // Process the card play based on its type
    if (card.type === 'potion') {
      await handlePotionConsumption(card);
    } else if (card.type === 'weapon' || card.type === 'shield') {
      const emptySlot = !equipmentSlot1 ? 'equipmentSlot1' : !equipmentSlot2 ? 'equipmentSlot2' : null;
      if (emptySlot) {
        setEquipmentSlotById(emptySlot, { ...card } as EquipmentItem);
        addGameLog('equip', `手牌装备：${card.name}（${card.type === 'weapon' ? `${card.value}攻` : `${card.value}防`}）至${emptySlot === 'equipmentSlot1' ? '左' : '右'}槽`);
      } else {
        addGameLog('equip', `装备失败：没有空槽位（${card.name}）`);
      }
    }
    // More card types can be handled here
  };

  const handleBackpackClick = () => {
    if (playerTargetingActive || fullBoardInteractionLockedRef.current) return;
    setBackpackViewerOpen(true);
  };

  const heroSkillTargeting = Boolean(pendingHeroSkillAction);
  const heroSkillSlotTargeting = pendingHeroSkillAction?.type === 'slot';
  const heroSkillMonsterTargeting = pendingHeroSkillAction?.type === 'monster';
  const heroMagicTargeting = Boolean(pendingHeroMagicAction);
  const heroMagicMonsterTargeting = pendingHeroMagicAction?.step === 'monster-select';
  const magicTargeting = Boolean(pendingMagicAction);
  const magicSlotTargeting = pendingMagicAction?.step === 'slot-select';
  const magicMonsterTargeting = pendingMagicAction?.step === 'monster-select';
  const magicDungeonTargeting = pendingMagicAction?.step === 'dungeon-select';
  const potionTargeting = Boolean(pendingPotionAction);
  const potionSlotTargeting = pendingPotionAction?.step === 'slot-select';
  const playerTargetingActive =
    heroSkillTargeting || heroMagicTargeting || magicTargeting || potionTargeting;
  const slotTargetingActive =
    heroSkillSlotTargeting || Boolean(magicSlotTargeting) || Boolean(potionSlotTargeting);
  const monsterTargetingActive =
    heroSkillMonsterTargeting || heroMagicMonsterTargeting || Boolean(magicMonsterTargeting);
  const dungeonTargetingActive = Boolean(magicDungeonTargeting);
  const heroSkillSlotLabel =
    pendingHeroSkillAction?.skillId === 'armor-pact'
      ? '+1 Armor'
      : pendingHeroSkillAction?.skillId === 'durability-for-blood'
        ? '+1 Durability'
        : pendingHeroSkillAction?.skillId === 'discard-empower'
          ? '+2 & 吸血'
          : 'Select Slot';
  const slotTargetingLabel = heroSkillSlotTargeting
    ? heroSkillSlotLabel
    : magicSlotTargeting
      ? pendingMagicAction?.prompt
      : potionSlotTargeting
        ? pendingPotionAction?.prompt
        : undefined;
  const heroSkillPrompt = pendingHeroMagicAction?.prompt
    ? pendingHeroMagicAction.prompt
    : pendingPotionAction?.prompt
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
    if (selectedHeroSkillDef.id === 'armor-pact') {
      if (equipmentSlot1 && equipmentSlot2) return '没有空装备槽，无法发动虚位铸甲。';
    }
    if (selectedHeroSkillDef.id === 'discard-empower') {
      if (handCards.length === 0) return '需要至少 1 张手牌。';
      if (!equipmentSlot1 && !equipmentSlot2) return '需要至少一个装备。';
    }
    return undefined;
  })();
  const heroMagicUiState = useMemo(() => {
    return HERO_MAGIC_IDS.map(id => {
      const definition = getHeroMagicDefinition(id);
      const status =
        heroMagicState[id] ??
        ({
          id,
          unlocked: false,
          gauge: 0,
          usedThisWave: false,
        } as HeroMagicRuntimeState);
      const lockedReason = status.unlocked ? undefined : '通过英雄魔法卡解锁';
      const insufficientCharge =
        status.unlocked && status.gauge < definition.gaugeMax
          ? `需要 ${definition.gaugeMax} 能量`
          : undefined;
      const usedReason = status.usedThisWave ? '本波已使用' : undefined;
      const waterfallReason = waterfallActive ? '等待瀑布动画结束' : undefined;
      const busyReason =
        pendingHeroMagicAction ||
        pendingHeroSkillAction ||
        pendingMagicAction ||
        pendingPotionAction
          ? '完成当前动作后再试'
          : undefined;
      const ready =
        status.unlocked &&
        status.gauge >= definition.gaugeMax &&
        !status.usedThisWave &&
        !waterfallActive &&
        !pendingHeroMagicAction &&
        !pendingHeroSkillAction &&
        !pendingMagicAction &&
        !pendingPotionAction;
      const disabledReason =
        lockedReason ?? insufficientCharge ?? usedReason ?? waterfallReason ?? busyReason;
      return {
        id,
        name: definition.name,
        gauge: status.gauge,
        gaugeMax: definition.gaugeMax,
        unlocked: status.unlocked,
        ready,
        usedThisWave: status.usedThisWave,
        chargeHint: definition.chargeHint,
        disabledReason,
      };
    }).filter(magic => magic.unlocked);
  }, [
    heroMagicState,
    pendingHeroMagicAction,
    pendingHeroSkillAction,
    pendingMagicAction,
    pendingPotionAction,
    waterfallActive,
  ]);

  const heroMagicChoicePrompt =
    pendingHeroMagicAction?.step === 'choice'
      ? { id: pendingHeroMagicAction.id, prompt: pendingHeroMagicAction.prompt }
      : null;

  const potionChoiceDialogOpen =
    pendingPotionAction?.effect === 'repair-choice' && pendingPotionAction.step === 'choice';

  const modalOverlayBlocksEndHeroTurn =
    gameOver ||
    showSkillSelection ||
    backpackViewerOpen ||
    deckViewerOpen ||
    discoverModalOpen ||
    Boolean(graveyardDiscoverState) ||
    (shopModalOpen && !shopModalMinimized) ||
    shopSkillSelectOpen ||
    deleteModalOpen ||
    detailsModalOpen ||
    heroDetailsOpen ||
    (eventModalOpen && !eventModalMinimized) ||
    Boolean(eventDiceModal) ||
    Boolean(equipmentPrompt) ||
    Boolean(eventTransformState) ||
    Boolean(activeMonsterReward) ||
    Boolean(deathWardPrompt) ||
    potionChoiceDialogOpen;

  const endHeroTurnDisabled =
    fullBoardInteractionLocked || modalOverlayBlocksEndHeroTurn || playerTargetingActive;
  endHeroTurnGuardRef.current = endHeroTurnDisabled;

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

  const extraHeroSkillInfos = useMemo(() => {
    if (showSkillSelection || extraHeroSkills.length === 0) return [];
    return extraHeroSkills.map(skillId => {
      const def = getHeroSkillById(skillId);
      if (!def) return null;
      const used = extraSkillsUsedThisWave.has(skillId);
      return {
        skillId,
        name: def.name,
        effect: def.effect,
        buttonLabel: def.type === 'active' ? def.buttonLabel ?? def.name : undefined,
        isPassive: def.type === 'passive',
        isReady: def.type === 'active' && !used && !waterfallActive && !playerTargetingActive,
        isUsed: def.type === 'active' ? used : false,
        disabledReason: used ? '该技能本波已使用。' : waterfallActive ? '等待瀑流结束。' : undefined,
      };
    }).filter(Boolean) as { skillId: string; name: string; effect?: string; buttonLabel?: string; isPassive?: boolean; isReady?: boolean; isUsed?: boolean; disabledReason?: string }[];
  }, [showSkillSelection, extraHeroSkills, extraSkillsUsedThisWave, waterfallActive, playerTargetingActive]);

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
    if (pendingPotionAction.effect === 'repair-choice-upgrade') {
      return true;
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
    if (fullBoardInteractionLockedRef.current) return;
    if (heroSkillTargeting) {
      cancelHeroSkillAction();
      return;
    }
    handleHeroSkillUse();
  }, [heroSkillTargeting, cancelHeroSkillAction, handleHeroSkillUse]);

  const handleExtraHeroSkillButtonClick = useCallback((skillId: string) => {
    if (fullBoardInteractionLockedRef.current) return;
    if (heroSkillTargeting) {
      cancelHeroSkillAction();
      return;
    }
    handleHeroSkillUse(skillId as HeroSkillId);
  }, [heroSkillTargeting, cancelHeroSkillAction, handleHeroSkillUse]);

  const handleHeroMagicTrigger = useCallback(
    (id: HeroMagicId) => {
      if (fullBoardInteractionLockedRef.current) return;
      pushUndoSnapshot();
      startHeroMagicActivation(id, 'gauge');
    },
    [startHeroMagicActivation],
  );

  const handleHeroMagicChoice = useCallback(
    (choice: 'heal' | 'purge') => {
      if (fullBoardInteractionLockedRef.current) return;
      pushUndoSnapshot();
      resolveHolyLightChoice(choice);
    },
    [resolveHolyLightChoice],
  );

  const heroFrameHoverLogCountRef = useRef(0);
  const heroFrameEnableLogCountRef = useRef(0);
  const heroFrameHitTestLogCountRef = useRef(0);
  const heroFrameStateLogCountRef = useRef(0);
  const heroFrameDragOverLogCountRef = useRef(0);
  const heroFrameDropCalcLogCountRef = useRef(0);

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
  const isSpellCard = card.type === 'magic' || card.type === 'hero-magic' || card.type === 'potion';
    if (
      (waterfallAnimation.isActive && !isSpellCard) ||
      targetingActive ||
      fullBoardInteractionLockedRef.current ||
      handLockedForMonsterPhaseRef.current
    )
      return;
    heroFrameHoverLogCountRef.current = 0;
    heroFrameEnableLogCountRef.current = 0;
    heroFrameHitTestLogCountRef.current = 0;
    heroFrameStateLogCountRef.current = 0;
    heroFrameDragOverLogCountRef.current = 0;
    heroFrameDropCalcLogCountRef.current = 0;
    setDraggedCard(card);
    draggedCardRef.current = card;
    setDraggedCardSource('hand');
    startDragSession();
    // Card stays in hand until successfully dropped
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        sessionId:'debug-session',
        runId:'run2',
        hypothesisId:'K',
        location:'GameBoard.tsx:handleDragCardFromHand',
        message:'Drag from hand started',
        data:{cardId:card.id, cardType:card.type, waterfallActive:waterfallAnimation.isActive, targetingActive},
        timestamp:Date.now()
      })
    }).catch(()=>{});
    // #endregion
  };

  const handleDragEndFromHand = (event?: React.DragEvent) => {
    if (draggedCardSource !== 'hand') {
      heroFrameDropIntentRef.current = false;
      setDraggedCard(null);
      setDraggedCardSource(current => (current === 'hand' ? null : current));
      setHeroRowDropState(null);
      return;
    }

    const clientX = event?.clientX ?? null;
    const clientY = event?.clientY ?? null;
    let insideHeroFrame: boolean | null = null;
    let usedFallbackPos = false;

    if (
      clientX !== null &&
      clientY !== null &&
      draggedCardRef.current &&
      isHeroRowHighlightCard(draggedCardRef.current)
    ) {
      if (!heroFrameBoundsRef.current) {
        updateHeroFrameBounds();
      }
      insideHeroFrame = isPointInsideHeroRowDropArea(clientX, clientY, draggedCardRef.current);
    }

    if (
      insideHeroFrame !== true &&
      lastGlobalDragPosRef.current &&
      draggedCardRef.current &&
      isHeroRowHighlightCard(draggedCardRef.current)
    ) {
      const { x, y } = lastGlobalDragPosRef.current;
      if (!heroFrameBoundsRef.current) {
        updateHeroFrameBounds();
      }
      insideHeroFrame = isPointInsideHeroRowDropArea(x, y, draggedCardRef.current);
      usedFallbackPos = true;
    }

    const dropAccepted =
      insideHeroFrame === true &&
      draggedCardRef.current &&
      isHeroRowHighlightCard(draggedCardRef.current);

    if (heroFrameDropCalcLogCountRef.current < 6) {
      heroFrameDropCalcLogCountRef.current += 1;
      fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          sessionId:'debug-session',
          runId:'run4',
          hypothesisId:'T',
          location:'GameBoard.tsx:handleDragEndFromHand',
          message:'Drop calc',
          data:{
            insideHeroFrame,
            usedFallbackPos,
            heroFrameBounds: heroFrameBoundsRef.current ? {
              left: heroFrameBoundsRef.current.left,
              top: heroFrameBoundsRef.current.top,
              right: heroFrameBoundsRef.current.right,
              bottom: heroFrameBoundsRef.current.bottom,
              width: heroFrameBoundsRef.current.width,
              height: heroFrameBoundsRef.current.height,
            } : null,
            lastGlobal:lastGlobalDragPosRef.current,
            clientX,
            clientY,
            dropAccepted,
            heroFrameDropEnabled,
            heroRowMagicDropActive,
            draggedCardId:draggedCardRef.current?.id,
            draggedCardType:draggedCardRef.current?.type
          },
          timestamp:Date.now()
        })
      }).catch(()=>{});
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        sessionId:'debug-session',
        runId:'run4',
        hypothesisId:'O',
        location:'GameBoard.tsx:handleDragEndFromHand',
        message: dropAccepted ? 'Drop accepted' : 'Drop rejected',
        data:{
          dropAccepted,
          heroFrameDropIntent:heroFrameDropIntentRef.current,
          draggedCardId:draggedCardRef.current?.id,
          draggedCardType:draggedCardRef.current?.type,
          isHighlightCard: isHeroRowHighlightCard(draggedCardRef.current),
          insideHeroFrame,
          usedFallbackPos,
          clientX,
          clientY,
          lastGlobal: lastGlobalDragPosRef.current,
          heroRowDropState
        },
        timestamp:Date.now()
      })
    }).catch(()=>{});
    // #endregion

    if (dropAccepted && draggedCardRef.current) {
      heroFrameDropIntentRef.current = true;
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
    if (
      waterfallAnimation.isActive ||
      playerTargetingActive ||
      fullBoardInteractionLockedRef.current
    )
      return;
    heroFrameHoverLogCountRef.current = 0;
    heroFrameEnableLogCountRef.current = 0;
    heroFrameHitTestLogCountRef.current = 0;
    heroFrameStateLogCountRef.current = 0;
    heroFrameDragOverLogCountRef.current = 0;
    heroFrameDropCalcLogCountRef.current = 0;
    setDraggedCard(card);
    draggedCardRef.current = card;
    setDraggedCardSource('dungeon');
    setIsDraggingFromDungeon(true);
    setIsDraggingToHand(true);
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
  const isDefeatAnimationPlaying = Object.keys(monsterDefeatStates).length > 0;
  const eventPendingLocked = eventModalMinimized && eventModalOpen && !!currentEventCard;
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
    viewportWidth,
    gameViewport.height,
  ]);
  const draggedCardIsSpell =
    draggedCard?.type === 'magic' || draggedCard?.type === 'hero-magic' || draggedCard?.type === 'potion';
  const heroRowInteractionLocked =
    playerTargetingActive ||
    isDefeatAnimationPlaying ||
    fullBoardInteractionLocked ||
    (isWaterfallLocked && !draggedCardIsSpell);
  const heroCardDropHighlight =
    !heroRowInteractionLocked &&
    canCardDropOnHero(draggedCard) &&
    !isHeroRowHighlightCard(draggedCard);
  const heroRowMagicDropActive =
    !heroRowInteractionLocked && isHeroRowHighlightCard(draggedCard);
  const canSellDraggedCard =
    draggedCard
      ? ((isSellableType(draggedCard.type) && !draggedCard.isCurse && !(draggedCard.type === 'monster' && !draggedCard.isMinionCard))
        || draggedCard.isPermanentEvent === true)
      : false;
  const canSellDraggedEquipment =
    draggedEquipment && draggedEquipment.type
      ? isSellableType(draggedEquipment.type as CardType)
      : false;
  const graveyardDropEnabled =
    !isWaterfallLocked &&
    !isDefeatAnimationPlaying &&
    !playerTargetingActive &&
    !fullBoardInteractionLocked &&
    (canSellDraggedCard || canSellDraggedEquipment);
  const shouldHighlightGraveyard = graveyardDropEnabled && isDragSessionActive;
  const heroRowMagicDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    const card = draggedCardRef.current;
    if (!card || !isHeroRowHighlightCard(card)) return;
    event.preventDefault();
  };
  const heroRowMagicDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const card = draggedCardRef.current;
    if (!card || !isHeroRowHighlightCard(card)) return;
    event.preventDefault();
    event.stopPropagation();
    handleCardToHero(card);
  };
  const getHeroRowMagicDropHandlers = (
    slot: 'backpack' | 'other'
  ): {
    onDragOver?: (event: ReactDragEvent<HTMLDivElement>) => void;
    onDrop?: (event: ReactDragEvent<HTMLDivElement>) => void;
  } => {
    if (slot === 'backpack') {
      return {};
    }
    return {
      onDragOver: heroRowMagicDragOver,
      onDrop: heroRowMagicDrop,
    };
  };
  const heroFrameDropEnabled =
    heroRowMagicDropActive ||
    ((draggedCardSource === 'hand' || draggedCardSource === 'dungeon') && isHeroRowHighlightCard(draggedCard));

  const lastGlobalDragPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      lastGlobalDragPosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('dragover', handleGlobalDragOver, true);
    return () => {
      window.removeEventListener('dragover', handleGlobalDragOver, true);
    };
  }, []);
  const isPointInsideHeroRowDropArea = useCallback(
    (clientX: number, clientY: number, card: GameCardData | null) => {
      if (!card || !isHeroRowHighlightCard(card)) {
        return false;
      }

      const frameRect =
        heroFrameRef.current?.getBoundingClientRect() ??
        (updateHeroFrameBounds(), heroFrameBoundsRef.current);

      const insideFrame = pointInsideRect(frameRect, clientX, clientY);

      let insideBackpack = false;
      if (isBackpackRestrictedCard(card)) {
        const backpackCell = heroRowCellRefs.current[HERO_ROW_BACKPACK_INDEX];
        const backpackRect = backpackCell?.getBoundingClientRect() ?? null;
        insideBackpack = pointInsideRect(backpackRect, clientX, clientY);
      }

      if (heroFrameHitTestLogCountRef.current < 6) {
        heroFrameHitTestLogCountRef.current += 1;
        fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            sessionId:'debug-session',
            runId:'run4',
            hypothesisId:'R',
            location:'GameBoard.tsx:isPointInsideHeroRowDropArea',
            message:'Hit test',
            data:{
              clientX,
              clientY,
              cardId:card.id,
              cardType:card.type,
              frameRect: frameRect ? {
                left: frameRect.left, top: frameRect.top, right: frameRect.right, bottom: frameRect.bottom, width: frameRect.width, height: frameRect.height
              } : null,
              insideFrame,
              insideBackpack
            },
            timestamp:Date.now()
          })
        }).catch(()=>{});
      }
      if (!insideFrame) {
        return false;
      }

      if (insideBackpack) {
        return false;
      }

      return true;
    },
    [updateHeroFrameBounds],
  );
  useEffect(() => {
    if (!heroFrameDropEnabled) {
      setHeroRowFrameDropActive(false);
      heroFrameDropIntentRef.current = false;
      if (heroFrameEnableLogCountRef.current < 4) {
        heroFrameEnableLogCountRef.current += 1;
        fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            sessionId:'debug-session',
            runId:'run4',
            hypothesisId:'Q',
            location:'GameBoard.tsx:heroFrameEffect',
            message:'Hero frame disabled',
            data:{
              heroFrameDropEnabled,
              heroRowMagicDropActive,
              draggedCardSource,
              draggedCardType:draggedCard?.type
            },
            timestamp:Date.now()
          })
        }).catch(()=>{});
      }
      return;
    }

    if (heroFrameEnableLogCountRef.current < 4) {
      heroFrameEnableLogCountRef.current += 1;
      fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          sessionId:'debug-session',
          runId:'run4',
          hypothesisId:'Q',
          location:'GameBoard.tsx:heroFrameEffect',
          message:'Hero frame enabled',
          data:{
            heroFrameDropEnabled,
            heroRowMagicDropActive,
            draggedCardSource,
            draggedCardType:draggedCard?.type
          },
          timestamp:Date.now()
        })
      }).catch(()=>{});
    }

    // Immediately show frame highlight when enabled
    const logHeroFrameState = (active: boolean) => {
      if (heroFrameStateLogCountRef.current < 6) {
        heroFrameStateLogCountRef.current += 1;
        fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            sessionId:'debug-session',
            runId:'run4',
            hypothesisId:'S',
            location:'GameBoard.tsx:heroFrameState',
            message:'Frame state set',
            data:{active},
            timestamp:Date.now()
          })
        }).catch(()=>{});
      }
    };

    setHeroRowFrameDropActive(false);
    logHeroFrameState(false);

    const setFrameActive = (active: boolean) => {
      setHeroRowFrameDropActive(prev => {
        if (prev === active) return prev;
        logHeroFrameState(active);
        return active;
      });
    };

    const handleWindowDragOver = (event: WindowEventMap['dragover']) => {
      if (heroFrameDragOverLogCountRef.current < 4) {
        heroFrameDragOverLogCountRef.current += 1;
        fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            sessionId:'debug-session',
            runId:'run4',
            hypothesisId:'S',
            location:'GameBoard.tsx:handleWindowDragOver',
            message:'Dragover fired',
            data:{
              clientX:event.clientX,
              clientY:event.clientY,
              heroFrameDropEnabled
            },
            timestamp:Date.now()
          })
        }).catch(()=>{});
      }
      lastGlobalDragPosRef.current = { x: event.clientX, y: event.clientY };
      const card = draggedCardRef.current;
      if (!card || !isHeroRowHighlightCard(card)) {
        heroFrameDropIntentRef.current = false;
        return;
      }
      const insideHeroFrame = isPointInsideHeroRowDropArea(event.clientX, event.clientY, card);
      if (heroFrameHoverLogCountRef.current < 6) {
        heroFrameHoverLogCountRef.current += 1;
        fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            sessionId:'debug-session',
            runId:'run4',
            hypothesisId:'P',
            location:'GameBoard.tsx:handleWindowDragOver',
            message:'Hero frame hover',
            data:{
              cardId:card.id,
              cardType:card.type,
              insideHeroFrame,
              clientX:event.clientX,
              clientY:event.clientY,
              heroFrameDropEnabled,
              heroRowMagicDropActive,
              frameRect: heroFrameRef.current ? (() => {
                const r = heroFrameRef.current!.getBoundingClientRect();
                return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height };
              })() : null
            },
            timestamp:Date.now()
          })
        }).catch(()=>{});
      }
      if (insideHeroFrame) {
        event.preventDefault();
        heroFrameDropIntentRef.current = true;
        setHeroRowDropState(prev => prev !== card.type ? (card.type as HeroRowDropType) : prev);
        setFrameActive(true);
      } else {
        heroFrameDropIntentRef.current = false;
        setHeroRowDropState(prev => prev !== null ? null : prev);
        setFrameActive(false);
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
      handleCardToHeroRef.current?.(card);
      setFrameActive(false);
      heroFrameDropIntentRef.current = false;
    };

    window.addEventListener('dragover', handleWindowDragOver, true);
    window.addEventListener('drop', handleWindowDrop, true);

    const surfaceElement = gameSurfaceRef.current;
    if (surfaceElement) {
      surfaceElement.addEventListener('dragover', handleWindowDragOver, true);
      surfaceElement.addEventListener('drop', handleWindowDrop, true);
    }

    return () => {
      window.removeEventListener('dragover', handleWindowDragOver, true);
      window.removeEventListener('drop', handleWindowDrop, true);
      if (surfaceElement) {
        surfaceElement.removeEventListener('dragover', handleWindowDragOver, true);
        surfaceElement.removeEventListener('drop', handleWindowDrop, true);
      }
      setFrameActive(false);
      heroFrameDropIntentRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroFrameDropEnabled, isPointInsideHeroRowDropArea]);
  // Mobile: track touch position during drag to update hero row highlight,
  // and intercept drop via the global mobile-drag-end event.
  useEffect(() => {
    if (!heroFrameDropEnabled) return;

    const handleMobileDragMove = (e: Event) => {
      const detail = (e as CustomEvent).detail as DragData;
      if (detail.type !== 'card') return;
      const card = detail.data as GameCardData | undefined;
      if (!card || !isHeroRowHighlightCard(card)) return;
      const cx = typeof detail.clientX === 'number' ? detail.clientX : null;
      const cy = typeof detail.clientY === 'number' ? detail.clientY : null;
      if (cx === null || cy === null) return;
      if (!heroFrameBoundsRef.current) updateHeroFrameBounds();
      const inside = isPointInsideHeroRowDropArea(cx, cy, card);
      if (inside) {
        heroFrameDropIntentRef.current = true;
        setHeroRowDropState(prev => prev !== (card.type as HeroRowDropType) ? (card.type as HeroRowDropType) : prev);
        setHeroRowFrameDropActive(prev => prev || true);
      } else {
        heroFrameDropIntentRef.current = false;
        setHeroRowDropState(prev => prev !== null ? null : prev);
        setHeroRowFrameDropActive(prev => prev ? false : prev);
      }
    };

    const handleMobileDragEnd = (e: Event) => {
      const detail = (e as CustomEvent).detail as DragData & { _handled?: boolean };
      if (detail.type !== 'card') return;
      const card = detail.data as GameCardData | undefined;
      if (!card || !isHeroRowHighlightCard(card)) {
        setHeroRowFrameDropActive(false);
        heroFrameDropIntentRef.current = false;
        return;
      }
      const cx = typeof detail.clientX === 'number' ? detail.clientX : null;
      const cy = typeof detail.clientY === 'number' ? detail.clientY : null;
      if (cx !== null && cy !== null) {
        if (!heroFrameBoundsRef.current) updateHeroFrameBounds();
        const inside = isPointInsideHeroRowDropArea(cx, cy, card);
        if (inside) {
          detail._handled = true;
          handleCardToHeroRef.current?.(card);
        }
      }
      setHeroRowFrameDropActive(false);
      setHeroRowDropState(null);
      heroFrameDropIntentRef.current = false;
    };

    document.addEventListener('mobile-drag-move', handleMobileDragMove);
    document.addEventListener('mobile-drag-end', handleMobileDragEnd);
    return () => {
      document.removeEventListener('mobile-drag-move', handleMobileDragMove);
      document.removeEventListener('mobile-drag-end', handleMobileDragEnd);
      setHeroRowFrameDropActive(false);
      heroFrameDropIntentRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroFrameDropEnabled, isPointInsideHeroRowDropArea, updateHeroFrameBounds]);
  const canMonsterTargetShieldSlot = (slotItem: EquipmentItem | null) =>
    Boolean(slotItem && slotItem.type === 'shield' && draggedCard?.type === 'monster');
  const equipmentSlot1MonsterTarget =
    !isWaterfallLocked &&
    !isDefeatAnimationPlaying &&
    !playerTargetingActive &&
    !fullBoardInteractionLocked &&
    canMonsterTargetShieldSlot(equipmentSlot1);
  const equipmentSlot2MonsterTarget =
    !isWaterfallLocked &&
    !isDefeatAnimationPlaying &&
    !playerTargetingActive &&
    !fullBoardInteractionLocked &&
    canMonsterTargetShieldSlot(equipmentSlot2);
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
          disabled={disabled || fullBoardInteractionLocked}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled && !fullBoardInteractionLocked) {
              resolveBlockChoice(target);
            }
          }}
          className={`block-button pointer-events-auto shadow-2xl transition flex flex-col items-center gap-1 ${
            disabled
              ? 'block-button--disabled'
              : 'block-button--active'
          }`}
          style={{ '--dh-overlay-scale': (overlayScale * stageScale).toString() } as CSSProperties}
        >
          <span className="block-button__label">{label}</span>
          <span className="block-button__meta">Damage: {pendingBlock.attackValue}</span>
        </button>
      </div>
    );
  };
  const draggingMonsterFromHand = Boolean(
    draggedCard && draggedCard.type === 'monster' && (isCardFromHand(draggedCard) || backpackItems.some(b => b.id === draggedCard.id)),
  );
  const draggingEquipmentCard = Boolean(
    draggedCard && (draggedCard.type === 'weapon' || draggedCard.type === 'shield' || draggingMonsterFromHand),
  );
  const equipmentSlotDropAvailable =
    !isWaterfallLocked &&
    !isDefeatAnimationPlaying &&
    !playerTargetingActive &&
    !fullBoardInteractionLocked &&
    draggingEquipmentCard;
  const equipmentSlot1DropAvailable = equipmentSlotDropAvailable;
  const equipmentSlot2DropAvailable = equipmentSlotDropAvailable;
  const equipmentSlot1StatModifier = getEquipmentSlotStatModifier('equipmentSlot1');
  const equipmentSlot2StatModifier = getEquipmentSlotStatModifier('equipmentSlot2');
  const heroRowSlots: HeroRowSlotConfig[] = [
    {
      id: 'hero-row-amulet',
      dropZone: 'other',
      render: () => (
        <AmuletSlot
          amulets={amuletSlots}
          maxSlots={maxAmuletSlots}
          scaleMultiplier={stageScale}
          dimForCombatLock={handLockedForMonsterPhase}
          disableAnimations={isWaterfallLocked || fullBoardInteractionLocked || handLockedForMonsterPhase}
          onDrop={(card) => {
                if (isWaterfallLocked || isDefeatAnimationPlaying || playerTargetingActive || fullBoardInteractionLocked || handLockedForMonsterPhase) return;
            handleCardToSlot(card, 'slot-amulet');
          }}
          onDragStart={(card) => {
                if (isWaterfallLocked || isDefeatAnimationPlaying || playerTargetingActive || fullBoardInteractionLocked || handLockedForMonsterPhase) return;
            setDraggedCard(card);
            setDraggedEquipment(null);
            setDraggedCardSource('amulet');
            startDragSession();
          }}
          onDragEnd={() => {
            setDraggedCard(null);
            setDraggedCardSource((current) => (current === 'amulet' ? null : current));
          }}
          isDropTarget={
            !isWaterfallLocked &&
            !isDefeatAnimationPlaying &&
            !playerTargetingActive &&
            !fullBoardInteractionLocked &&
            !handLockedForMonsterPhase &&
            draggedCard?.type === 'amulet'
          }
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
            reserveItems={equipmentSlot1Reserve}
            slotCapacity={equipmentSlotCapacity.equipmentSlot1}
            onSwapToTop={(rIdx) => swapEquipmentToTop('equipmentSlot1', rIdx)}
            statModifier={equipmentSlot1StatModifier}
            scaleMultiplier={stageScale}
            permanentDamageBonus={getEquipmentSlotBonus('equipmentSlot1', 'damage')}
            permanentShieldBonus={getEquipmentSlotBonus('equipmentSlot1', 'shield')}
            weaponSwingAnimation={Boolean(weaponSwingStates.equipmentSlot1)}
            weaponSwingVariant={weaponSwingVariant.equipmentSlot1}
            shieldBlockAnimation={Boolean(shieldBlockStates.equipmentSlot1)}
            shieldBlockVariant={shieldBlockVariant.equipmentSlot1}
            isExhaustedThisTurn={
              engagedMonsters.some(m => !monsterDefeatStates[m.id]) &&
              combatState.heroAttacksThisTurn.equipmentSlot1 &&
              extraAttackCharges <= 0 &&
              (!berserkerRageActive || Boolean(berserkerSlotUsed.equipmentSlot1))
            }
            isUnbreakable={unbreakableUntilWaterfall.equipmentSlot1}
            onDrop={(card) => {
              if (isWaterfallLocked || isDefeatAnimationPlaying || playerTargetingActive || fullBoardInteractionLocked) return;
              handleCardToSlot(card, 'slot-equipment-1');
            }}
            onDragStart={(equipment) => {
              if (isWaterfallLocked || isDefeatAnimationPlaying || playerTargetingActive || fullBoardInteractionLocked) return;
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
            scaleMultiplier={stageScale}
            onDrop={(card) => {
              if (
                (isWaterfallLocked && card.type !== 'magic') ||
                playerTargetingActive ||
                fullBoardInteractionLocked
              ) {
                return;
              }
              handleCardToHero(card);
            }}
            isDropTarget={heroCardDropHighlight}
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
            extraHeroSkillInfos={extraHeroSkillInfos}
            heroSkillMessage={heroSkillPrompt}
            onHeroSkillClick={
              heroSkillInfo && selectedHeroSkillDef?.type === 'active'
                ? handleHeroSkillButtonClick
                : undefined
            }
            onHeroSkillCancel={heroSkillTargeting ? cancelHeroSkillAction : undefined}
            onExtraHeroSkillClick={handleExtraHeroSkillButtonClick}
            heroSkillButtonRef={heroSkillButtonRef}
            heroMagicInfo={heroMagicUiState}
            onHeroMagicTrigger={handleHeroMagicTrigger}
            heroMagicChoice={null}
            onHeroMagicChoice={undefined}
            onHeroMagicCancel={undefined}
            potionChoice={null}
            onPotionChoice={undefined}
            onPotionCancel={undefined}
            spellDamageBonus={permanentSpellDamageBonus}
            onHeroClick={
              playerTargetingActive || fullBoardInteractionLocked
                ? undefined
                : () => {
                    setHeroDetailsOpen(true);
                  }
            }
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
            reserveItems={equipmentSlot2Reserve}
            slotCapacity={equipmentSlotCapacity.equipmentSlot2}
            onSwapToTop={(rIdx) => swapEquipmentToTop('equipmentSlot2', rIdx)}
            statModifier={equipmentSlot2StatModifier}
            scaleMultiplier={stageScale}
            permanentDamageBonus={getEquipmentSlotBonus('equipmentSlot2', 'damage')}
            permanentShieldBonus={getEquipmentSlotBonus('equipmentSlot2', 'shield')}
            weaponSwingAnimation={Boolean(weaponSwingStates.equipmentSlot2)}
            weaponSwingVariant={weaponSwingVariant.equipmentSlot2}
            shieldBlockAnimation={Boolean(shieldBlockStates.equipmentSlot2)}
            shieldBlockVariant={shieldBlockVariant.equipmentSlot2}
            isExhaustedThisTurn={
              engagedMonsters.some(m => !monsterDefeatStates[m.id]) &&
              combatState.heroAttacksThisTurn.equipmentSlot2 &&
              extraAttackCharges <= 0 &&
              (!berserkerRageActive || Boolean(berserkerSlotUsed.equipmentSlot2))
            }
            isUnbreakable={unbreakableUntilWaterfall.equipmentSlot2}
            onDrop={(card) => {
              if (isWaterfallLocked || isDefeatAnimationPlaying || playerTargetingActive || fullBoardInteractionLocked) return;
              handleCardToSlot(card, 'slot-equipment-2');
            }}
            onDragStart={(equipment) => {
              if (isWaterfallLocked || isDefeatAnimationPlaying || playerTargetingActive || fullBoardInteractionLocked) return;
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
          capacity={backpackCapacity}
          onDrop={(card) => {
            if (isWaterfallLocked || isDefeatAnimationPlaying || playerTargetingActive || fullBoardInteractionLocked) return;
            handleCardToSlot(card, 'slot-backpack');
          }}
          isDropTarget={
            !isWaterfallLocked &&
            !isDefeatAnimationPlaying &&
            !playerTargetingActive &&
            !fullBoardInteractionLocked &&
            draggedCard !== null &&
            !draggedEquipment &&
            (
              (backpackItems.length < backpackCapacity &&
              canCardGoToBackpack(draggedCard) &&
              !handCards.some(c => c.id === draggedCard.id))
              ||
              (handCards.some(c => c.id === draggedCard.id) &&
              isRecyclableFromHand(draggedCard))
              ||
              (draggedCardSource === 'dungeon' && draggedCard.isPermanentEvent === true)
            )
          }
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
    handLockedForMonsterPhase && engagedMonsters.length > 0,
  );
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
    <div ref={gameSurfaceRef} className="h-full w-full bg-background flex flex-col relative overflow-hidden" style={{ ...gridStyleVars, ...(minimizedModalLocksBoard ? { pointerEvents: 'none' } : {}) } as React.CSSProperties}>
      {/* Header - Fixed height */}
      <div className="flex-shrink-0" ref={headerWrapperRef}>
        <GameHeader
          hp={hp}
          maxHp={maxHp}
          gold={gold}
          cardsRemaining={getRemainingCards()}
          turnCount={turnCount}
          shopLevel={shopLevel}
          deckFlyTargetRef={deckFlyTargetRef}
          onDeckClick={() => {
            if (fullBoardInteractionLocked) return;
            setDeckViewerOpen(true);
          }}
          onNewGame={handleNewGame}
        />
      </div>
      
      {/* Main game area - Flexible height */}
      <div className={`flex-grow min-h-0 w-full px-2 relative z-10 ${isFlat ? 'py-0' : 'py-3 md:py-4'} md:px-4`}>
        <div className={`flex flex-col h-full ${isFlat ? 'gap-0' : 'gap-3'}`}>
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
            const isDeckReturnDiscard =
              isDiscardingPreview && waterfallAnimation.discardDestination === 'deck';
            const flyVector = isDeckReturnDiscard
              ? (previewDeckReturnVectors[index] ?? DECK_RETURN_VECTOR_DEFAULT)
              : (previewGraveyardVectors[index] ?? GRAVEYARD_VECTOR_DEFAULT);
            const previewAnimationStyle: CSSProperties & Record<`--${string}`, string> = isDeckReturnDiscard
              ? {
                  '--deck-return-offset-x': `${flyVector.offsetX}px`,
                  '--deck-return-offset-y': `${flyVector.offsetY}px`,
                }
              : {
                  '--graveyard-offset-x': `${flyVector.offsetX}px`,
                  '--graveyard-offset-y': `${flyVector.offsetY}px`,
                };
            const previewAnimationClass = [
              isDroppingPreview ? 'animate-preview-drop' : '',
              isDiscardingPreview && !isDeckReturnDiscard ? 'animate-preview-graveyard' : '',
              isDiscardingPreview && isDeckReturnDiscard ? 'animate-preview-deck-return' : '',
              isDealingPreview ? 'animate-preview-deal' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return card ? (
              <div 
                key={`preview-${index}`}
                className={`opacity-60 ${cellWrapperClass}`}
                data-testid={`preview-card-${index}`}
                ref={el => setPreviewCellRef(index, el)}
              >
                <div 
                  className={`${cellInnerClass} ${previewAnimationClass}`.trim()}
                  style={previewAnimationStyle}
                >
                  <GameCard
                    card={card}
                    disableInteractions
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
          <div className={cellWrapperClass}>
            <div className={cellInnerClass}>
              <DiceRoller 
                onRoll={(value) => console.log('Rolled:', value)}
                className="w-full h-full"
                scaleMultiplier={stageScale}
              />
            </div>
          </div>

          {/* Row 2: Active Row - 5 cards + GraveyardZone */}
          {[0, 1, 2, 3, 4].map((index) => {
            const card = activeCards[index];
            const colWidth = rageStripWidth;
            const isEngagedMonster = Boolean(card && card.type === 'monster' && isMonsterEngaged(card.id));
            const isResolvingCard = resolvingDungeonCardId === card?.id;
            const isEventPendingCell = isResolvingCard && eventPendingLocked;
            const isMonsterTurnLock =
              showMonsterAttackIndicator ||
              isWaterfallLocked ||
              isDefeatAnimationPlaying ||
              fullBoardInteractionLocked;
            const monsterTargetHighlight = Boolean(
              monsterTargetingActive && card && card.type === 'monster',
            );
            const dungeonTargetHighlight =
              dungeonTargetingActive &&
              (pendingMagicAction?.effect === 'return-dungeon-bottom' ||
                pendingMagicAction?.effect === 'shuffle-dungeon');
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
                  playerTargetingActive || fullBoardInteractionLocked
                    ? undefined
                    : (weapon) => handleWeaponToMonster(weapon, card)
                }
                isWeaponDropTarget={
                  !playerTargetingActive &&
                  !fullBoardInteractionLocked &&
                  !handLockedForMonsterPhase &&
                  (draggedEquipment?.type === 'weapon' || draggedEquipment?.type === 'monster') &&
                  card.type === 'monster'
                }
                bleedAnimation={Boolean(monsterBleedStates[card.id])}
                defeatAnimation={Boolean(monsterDefeatStates[card.id])}
                className={`${removingCards.has(card.id) ? 'animate-card-remove' : 'shadow-lg'} ${
                  (isMonsterTurnLock && !monsterTargetHighlight && !dungeonTargetHighlight) ||
                  (isResolvingCard && !isEventPendingCell)
                    ? 'opacity-60 pointer-events-none'
                    : ''
                } ${
                  monsterTargetHighlight ? 'monster-target-highlight animate-pulse' : ''
                } ${dungeonTargetHighlight ? 'dungeon-target-highlight animate-pulse' : ''}`.trim()}
                isEngaged={isEngagedMonster}
                onClick={() => {
                  if (isEventPendingCell) {
                    setEventModalMinimized(false);
                    return;
                  }
                  if (dungeonTargetingActive) {
                    handleDungeonCardSelection(card);
                    return;
                  }
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

            const rageBaseTranslate = isCompactViewport ? 1 : MONSTER_RAGE_BASE_TRANSLATE_PX;
            const monsterTranslateX = isMonster
              ? rageBaseTranslate +
                (monsterLayerValue > 0
                  ? Math.max(
                      (monsterLayerValue - 1) * colWidth + MONSTER_RAGE_TRANSLATE_ADJUST_PX,
                      0,
                    )
                  : 0)
              : 0;

            const activeCellWrapper = isMonster
              ? `${cellWrapperClass} relative overflow-visible`
              : cellWrapperClass;

            return (
              <div 
                key={`active-${index}`}
                className={`${activeCellWrapper}${isEventPendingCell ? ' event-pending-cell' : ''}${card?.hasReleaseCharge ? ' fate-blade-charged' : ''}`}
                style={isEventPendingCell ? { pointerEvents: 'auto' } : undefined}
              >
                {isMonster && (
                  <div
                    className="absolute z-0 flex flex-row-reverse overflow-hidden rounded-md bg-destructive/10"
                    style={getMonsterRageOverlayStyle(card.id)}
                  >
                    {[1, 2, 3, 4].map((num) => {
                      const isActiveLayer = monsterLayerValue > 0 && num === monsterLayerValue;
                      const stripsToLeft = num - 1;
                      const stripOffsetPx = stripsToLeft * colWidth;
                      const furyColumnClasses = [
                        'monster-rage-column h-full flex items-center justify-center border-l border-border/20 font-mono font-bold transition-colors',
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
                      isMonster && monsterTranslateX > 0
                        ? `translateX(-${monsterTranslateX}px)`
                        : 'none',
                  }}
                >
                  {gameCardNode}
                  {isEventPendingCell && (
                    <div
                      className="absolute inset-0 z-30 flex items-center justify-center rounded-md cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEventModalMinimized(false);
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEventModalMinimized(false);
                      }}
                    >
                      <div className="absolute inset-0 rounded-md ring-2 ring-pink-500 animate-pulse" />
                      <div className="bg-pink-600/90 rounded-full px-2.5 py-1 flex items-center gap-1 shadow-lg">
                        <Calendar className="w-3 h-3 text-white" />
                        <span className="text-white text-xs font-bold">待处理</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          
          {/* Row 2, Col 6: GraveyardZone */}
          <div className={cellWrapperClass}>
            <div className={cellInnerClass} ref={setGraveyardRef}>
              <GraveyardZone
                onDrop={(card) => {
                  if (isWaterfallLocked || isDefeatAnimationPlaying || playerTargetingActive || fullBoardInteractionLocked) return;
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
                className={`hero-row-frame ${isFlat ? HERO_GAP_VARIABLE_CLASS_FLAT : HERO_GAP_VARIABLE_CLASS}`}
                style={heroFrameOverlayStyle}
              />
            </div>
            {classDeckFlights.length > 0 && (
              <div className="pointer-events-none absolute inset-0 z-20">
                {classDeckFlights.map(flight => {
                  const cardWidth = gridCardSize?.width ?? 140;
                  const cardHeight = gridCardSize?.height ?? 210;
                  return (
                    <div
                      key={flight.id}
                      ref={el => {
                        if (el) classDeckFlightElementMapRef.current.set(flight.id, el);
                        else classDeckFlightElementMapRef.current.delete(flight.id);
                      }}
                      className="absolute class-flight-card"
                      style={{
                        width: cardWidth,
                        height: cardHeight,
                        opacity: 0,
                        willChange: 'transform, opacity',
                        contain: 'layout style',
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
      <div ref={handAreaRef} className={`flex-shrink-0 relative w-full px-2 md:px-6 ${isFlat ? 'pb-0' : 'pb-4'}`}>
        <HandDisplay
          handCards={handCards}
          onPlayCard={handlePlayCardFromHand}
          onDragCardFromHand={handleDragCardFromHand}
          onDragEndFromHand={handleDragEndFromHand}
          maxHandSize={effectiveHandLimit}
          cardSize={gridCardSize} // Pass the measured size to HandDisplay
          disableAnimations={isWaterfallLocked || fullBoardInteractionLocked || handLockedForMonsterPhase}
          dimForCombatLock={handLockedForMonsterPhase}
          onCardClick={handleCardClick}
        />
      </div>

      {/* CombatPanel removed — End Hero Turn button lives in the top-right overlay below */}
      <GameLogPanel
        entries={gameLogEntries}
        onClear={clearGameLog}
        stageScale={stageScale}
      />

      {/* Discard flights: hand → graveyard / backpack */}
      {discardFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-30">
          {discardFlights.map(flight => {
            const cardWidth = gridCardSize?.width ?? 140;
            const cardHeight = gridCardSize?.height ?? 210;
            return (
              <div
                key={flight.id}
                ref={el => {
                  if (el) discardFlightElementMapRef.current.set(flight.id, el);
                  else discardFlightElementMapRef.current.delete(flight.id);
                }}
                className="absolute"
                style={{
                  width: cardWidth,
                  height: cardHeight,
                  opacity: 0,
                  willChange: 'transform, opacity',
                  contain: 'layout style',
                }}
              >
                <GameCard card={flight.card} disableInteractions />
              </div>
            );
          })}
        </div>
      )}

      {backpackHandFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-30">
          {backpackHandFlights.map(flight => {
            const cardWidth = gridCardSize?.width ?? 140;
            const cardHeight = gridCardSize?.height ?? 210;
            return (
              <div
                key={flight.id}
                ref={el => {
                  if (el) backpackFlightElementMapRef.current.set(flight.id, el);
                  else backpackFlightElementMapRef.current.delete(flight.id);
                }}
                className="absolute"
                style={{
                  width: cardWidth,
                  height: cardHeight,
                  opacity: 0,
                  willChange: 'transform, opacity',
                  contain: 'layout style',
                }}
              >
                <GameCard card={flight.card} disableInteractions />
              </div>
            );
          })}
        </div>
      )}

      {discardShockFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[35]">
          {discardShockFlights.map(flight => (
            <div
              key={flight.id}
              ref={el => {
                if (el) discardShockElementMapRef.current.set(flight.id, el);
                else discardShockElementMapRef.current.delete(flight.id);
              }}
              className="absolute rounded-full border-2 border-amber-300/90 bg-amber-500/20 shadow-[0_0_16px_rgba(251,191,36,0.9)] overflow-hidden ring-2 ring-yellow-200/40"
              style={{
                width: DISCARD_SHOCK_PROJECTILE_SIZE,
                height: DISCARD_SHOCK_PROJECTILE_SIZE,
                opacity: 0,
                willChange: 'transform, opacity',
                contain: 'layout style',
              }}
            >
              {flight.projectileImage ? (
                <img src={flight.projectileImage} alt="" className="h-full w-full object-cover" draggable={false} />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-600" />
              )}
            </div>
          ))}
        </div>
      )}

      {directedCombatFxFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[36]">
          {directedCombatFxFlights.map(flight => {
            const sz =
              flight.kind === 'shield-reflect'
                ? DIRECTED_REFLECT_PROJECTILE_SIZE
                : DIRECTED_RETALIATION_PROJECTILE_SIZE;
            const isReflect = flight.kind === 'shield-reflect';
            return (
              <div
                key={flight.id}
                ref={el => {
                  if (el) directedCombatFxElementMapRef.current.set(flight.id, el);
                  else directedCombatFxElementMapRef.current.delete(flight.id);
                }}
                className={
                  isReflect
                    ? 'absolute rounded-full border-2 border-amber-400/95 bg-gradient-to-br from-amber-200/95 via-yellow-400/90 to-orange-500/90 shadow-[0_0_18px_rgba(251,191,36,0.95)] ring-2 ring-amber-100/50'
                    : 'absolute rounded-full border-2 border-rose-800/95 bg-gradient-to-br from-rose-300/95 via-red-600/90 to-red-950/95 shadow-[0_0_22px_rgba(220,38,38,0.85)] ring-2 ring-rose-200/45'
                }
                style={{
                  width: sz,
                  height: sz,
                  opacity: 0,
                  willChange: 'transform, opacity',
                  contain: 'layout style',
                }}
              />
            );
          })}
        </div>
      )}

      {/* Event-pending floating restore button */}
      {eventModalOpen && eventModalMinimized && (
        <div
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-pink-600/90 px-5 py-2.5 shadow-lg cursor-pointer select-none event-pending-restore-btn hover:bg-pink-600 transition-colors"
          style={{ pointerEvents: 'auto' }}
          onClick={() => setEventModalMinimized(false)}
          onTouchEnd={(e) => {
            e.preventDefault();
            setEventModalMinimized(false);
          }}
        >
          <Calendar className="w-4 h-4 text-white" />
          <span className="text-white text-sm font-semibold whitespace-nowrap">
            {currentEventCard?.name ?? '事件'} — 点击恢复
          </span>
        </div>
      )}

      {/* Shop-minimized floating restore button */}
      {shopModalOpen && shopModalMinimized && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-amber-600/90 px-5 py-2.5 shadow-lg cursor-pointer select-none hover:bg-amber-600 transition-colors ${
            eventModalOpen && eventModalMinimized ? 'bottom-32' : 'bottom-20'
          }`}
          style={{ pointerEvents: 'auto' }}
          onClick={() => setShopModalMinimized(false)}
          onTouchEnd={(e) => {
            e.preventDefault();
            setShopModalMinimized(false);
          }}
        >
          <ShoppingBag className="w-4 h-4 text-white" />
          <span className="text-white text-sm font-semibold whitespace-nowrap">
            商店 — 点击恢复
          </span>
        </div>
      )}

      {deathWardPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" style={{ pointerEvents: 'auto' }}>
          <div className="w-full max-w-2xl space-y-6 rounded-lg bg-card p-10 text-center shadow-2xl max-h-[95vh] overflow-y-auto" style={{ zoom: overlayZoom }}>
            <div className="space-y-1">
              <p className="text-lg font-semibold">命悬一线</p>
              <p className="text-sm text-muted-foreground">
                正在受到 {deathWardPrompt.pendingDamage} 点致命伤害，是否打出{' '}
                {deathWardPrompt.card.name}？
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
                onClick={handleDeathWardConfirm}
              >
                抵消伤害
              </button>
              <button
                className="rounded-md border border-border px-4 py-2"
                onClick={handleDeathWardDecline}
              >
                放弃
              </button>
            </div>
          </div>
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
        capacity={backpackCapacity}
        recycleCards={permanentMagicRecycleBag}
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
        description="从坟场随机出现的卡牌中选择一张取回。"
      />

      <ShopModal
        open={shopModalOpen && !shopModalMinimized}
        offerings={shopOfferings}
        gold={gold}
        backpackCount={backpackItems.length}
        backpackCapacity={backpackCapacity}
        shopLevel={shopLevel}
        canDeleteCard={canDeleteCardInShop}
        deleteDisabledReason={shopDeleteDisabledReason}
        onDeleteRequest={handleShopDeleteRequest}
        onBuy={handleShopPurchase}
        onFinish={handleShopClose}
        onMinimize={() => setShopModalMinimized(true)}
        sourceEventName={shopSourceEvent?.name ?? undefined}
        hp={hp}
        maxHp={maxHp}
        healCost={SHOP_HEAL_COST}
        shopHealUsed={shopHealUsed}
        onHealRequest={handleShopHealRequest}
        shopLevelUpCost={SHOP_LEVEL_UP_COST}
        shopLevelUpUsed={shopLevelUpUsed}
        onShopLevelUpRequest={handleShopLevelUpRequest}
        shopSkillDiscoverCost={SHOP_SKILL_DISCOVER_COST}
        shopSkillDiscoverUsed={shopSkillDiscoverUsed}
        canDiscoverSkill={(() => {
          const ownedCount = (selectedHeroSkill ? 1 : 0) + extraHeroSkills.length;
          return allHeroSkills.length - ownedCount >= 3;
        })()}
        discoverSkillDisabledReason={
          allHeroSkills.length - ((selectedHeroSkill ? 1 : 0) + extraHeroSkills.length) < 3
            ? '已学习太多技能，没有足够的未学技能可供选择。'
            : undefined
        }
        onShopSkillDiscoverRequest={handleShopSkillDiscoverRequest}
      />

      <ShopSkillSelectModal
        open={shopSkillSelectOpen}
        options={shopSkillOptions}
        onSelect={handleShopSkillSelect}
      />

      {eventTransformState && <CardFlipOverlay state={eventTransformState} />}

      <CardDeletionModal
        open={deleteModalOpen}
        onOpenChange={handleDeleteModalOpenChange}
        handCards={handCards}
        backpackCards={backpackItems}
        recycleBagCards={permanentMagicRecycleBag}
        onDeleteCard={handleDeleteCardConfirm}
        title={cardActionContext?.title}
        description={cardActionContext?.description}
        requiredCount={cardActionContext?.requiredCount}
        remainingCount={cardActionContext?.remainingCount}
        handOnly={cardActionContext?.handOnly}
      />

      <CardDetailsModal 
        card={selectedCard}
        open={detailsModalOpen}
        onOpenChange={handleDetailsModalChange}
        currentTurn={turnCount}
        monsterRewards={monsterRewardPreviewForModal ?? undefined}
      />

      <HeroDetailsModal
        open={heroDetailsOpen}
        onOpenChange={setHeroDetailsOpen}
        heroVariant={heroVariant}
        stats={heroDetailsStats}
        heroSkills={heroDetailsSkills}
        permanentSkills={permanentSkills}
        permanentSkillStacks={{ '壁垒猛击': bulwarkPassiveActive }}
        heroMagicInfo={heroMagicUiState}
        capacityLimits={{
          hand: effectiveHandLimit,
          backpack: backpackCapacity,
          amuletSlots: maxAmuletSlots,
          equipmentSlotLeft: equipmentSlotCapacity.equipmentSlot1,
          equipmentSlotRight: equipmentSlotCapacity.equipmentSlot2,
        }}
      />

      {activeMonsterReward && (
        <MonsterRewardModal
          open
          monsterName={activeMonsterReward.monsterName}
          options={activeMonsterReward.options.map(option => ({
            id: option.id,
            title: option.title,
            description: option.description,
            detail: option.detail,
          }))}
          onSelect={handleMonsterRewardSelection}
        />
      )}

      {/* Event Choice Modal */}
      <EventChoiceModal
        open={eventModalOpen && !eventModalMinimized}
        eventCard={currentEventCard}
        onChoice={handleEventChoice}
        choiceStates={eventChoiceStates}
        onMinimize={() => setEventModalMinimized(true)}
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
      
      {heroMagicChoicePrompt && (
        <Dialog open onOpenChange={(open) => { if (!open) cancelHeroMagicAction(); }}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sword className="w-5 h-5 text-amber-500" />
                圣光
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 pt-2">
              <Button
                variant="outline"
                className="h-auto w-full justify-start p-4 text-left"
                onClick={() => handleHeroMagicChoice('heal')}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-emerald-600">回满生命</span>
                  <span className="text-xs text-muted-foreground">立即将生命值恢复至上限。</span>
                </div>
              </Button>
              <Button
                variant="outline"
                className="h-auto w-full justify-start p-4 text-left"
                onClick={() => handleHeroMagicChoice('purge')}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-sky-600">净化怒气</span>
                  <span className="text-xs text-muted-foreground">选择一个怪物，将其怒气层数清零（血层归 1，生命回满）。</span>
                </div>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {potionChoiceDialogOpen && (
        <Dialog open onOpenChange={(open) => { if (!open) cancelPotionAction(); }}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-emerald-500" />
                装备修复剂
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 pt-2">
              <Button
                variant="outline"
                className="h-auto w-full justify-start p-4 text-left"
                onClick={() => handlePotionChoiceSelection('repair')}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">恢复 3 点耐久</span>
                  <span className="text-xs text-muted-foreground">选择一件装备，恢复其耐久值。</span>
                </div>
              </Button>
              <Button
                variant="outline"
                className="h-auto w-full justify-start p-4 text-left"
                onClick={() => handlePotionChoiceSelection('upgrade')}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">耐久上限 +2</span>
                  <span className="text-xs text-muted-foreground">选择一件装备，永久提升其耐久上限 +2（不恢复耐久）。</span>
                </div>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Hero Skill Selection Modal */}
      <HeroSkillSelection
        isOpen={showSkillSelection}
        onSelectSkill={handleSkillSelection}
      />

      {/* Top-right: End Hero Turn button */}
      {isCombatPanelVisible && combatState.currentTurn === 'hero' && !gameOver && !showSkillSelection && (
        <div
          className="absolute right-4 z-[9999]"
          style={{
            top: `${headerHeight + 8}px`,
            pointerEvents: 'none',
            transform: `scale(${stageScale})`,
            transformOrigin: 'top right',
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); endHeroTurn(); }}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={endHeroTurnDisabled}
            style={{ pointerEvents: endHeroTurnDisabled ? 'none' : 'auto' }}
            className={`end-hero-turn-btn flex items-center gap-2 rounded-full px-5 py-2.5 shadow-lg transition-all select-none font-bold ${
              !endHeroTurnDisabled
                ? 'bg-amber-500 text-white hover:bg-amber-600 active:scale-95'
                : 'bg-amber-500/40 text-white/40 cursor-not-allowed'
            }`}
          >
            <Swords className="w-5 h-5" />
            <span className="text-sm">End Hero Turn</span>
          </button>
        </div>
      )}

      {/* Bottom-right controls: undo */}
      <div className="absolute bottom-4 right-4 z-[9999] flex flex-col items-end" style={{ pointerEvents: 'none' }}>
        {!gameOver && !showSkillSelection && (
          <div
            style={{
              pointerEvents: 'none',
              transform: `scale(${stageScale})`,
              transformOrigin: 'bottom right',
            }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); handleUndo(); }}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={undoCount === 0 || fullBoardInteractionLocked}
              style={{ pointerEvents: fullBoardInteractionLocked ? 'none' : 'auto' }}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2.5 shadow-lg transition-all select-none ${
                undoCount > 0
                  ? 'bg-slate-700/90 text-white hover:bg-slate-600 active:scale-95'
                  : 'bg-slate-700/40 text-white/40 cursor-not-allowed'
              }`}
            >
              <Undo2 className="w-4 h-4" />
              <span className="text-sm font-medium">撤销</span>
              {undoCount > 0 && (
                <span className="bg-white/20 rounded-full px-1.5 py-0.5 text-xs">{undoCount}</span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
