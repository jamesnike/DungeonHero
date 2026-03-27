import { useState, useEffect, useRef, memo, type CSSProperties } from 'react';
import { Card } from '@/components/ui/card';
import {
  Skull,
  Sword,
  Shield,
  Heart,
  Sparkles,
  Zap,
  Scroll,
  Infinity,
  Wand2,
  X,
} from 'lucide-react';
import { initMobileDrag, initMobileDrop } from '../utils/mobileDragDrop';
import { useGameViewport } from '@/contexts/GameViewportContext';
import { FLAT_ASPECT_RATIO } from './game-board/constants';
import {
  EventNameLeftGlyph,
  EventTitleBand,
  eventTitleSideSlotClass,
  MagicNameLeftGlyph,
  MagicTitleBand,
} from './MagicNameFlankIcons';

const MAX_DURABILITY_DOTS = 4;
const BASE_CARD_WIDTH = 180;
const CARD_SCALE_MIN = 0.6;
const CARD_SCALE_MAX = 1.4;
/** 魔法标题：仅当标题区估出来不足约这么多个全角字宽时，才隐藏左侧纹样（与事件卡一致，无卷轴 PNG） */
const MAGIC_TITLE_MIN_CHARS_FOR_GLYPH = 5;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 与 eventTitleSideSlotClass 的 rem 档位一致；用实例缩放估侧栏占位 */
function boardTitleGlyphWouldCrowdName(
  cardWidthPx: number,
  isFlat: boolean,
  isCompact: boolean,
): boolean {
  if (cardWidthPx <= 0) return false;
  const raw = cardWidthPx / BASE_CARD_WIDTH;
  const inst = clamp(raw, CARD_SCALE_MIN, CARD_SCALE_MAX);
  const slotRem = isFlat ? 1.15 : isCompact ? 1.25 : 1.65;
  const slotPx = slotRem * 16 * inst;
  const gutterPx = 10;
  const titlePx = Math.max(0, cardWidthPx - 2 * slotPx - gutterPx);
  const titleFontPx = Math.max(7, 11.5 * inst);
  const cjkCharPx = titleFontPx * 0.92;
  return titlePx < MAGIC_TITLE_MIN_CHARS_FOR_GLYPH * cjkCharPx;
}

export type CardType =
  | 'monster'
  | 'weapon'
  | 'shield'
  | 'potion'
  | 'amulet'
  | 'magic'
  | 'hero-magic'
  | 'event'
  | 'skill'
  | 'coin';

export type EquipmentCardStatModifier = {
  appliesTo: 'weapon' | 'shield' | 'monster';
  modifier: number;
  shieldModifier?: number;
};

export type PotionEffectId =
  | 'heal-5'
  | 'heal-7'
  | 'repair-weapon-2'
  | 'repair-weapon-3'
  | 'boost-both-slots'
  | 'repair-choice'
  | 'draw-backpack-4'
  | 'discover-class-3'
  | 'perm-spell-damage'
  | 'perm-backpack-size'
  | 'left-slot-durability-max+1'
  | 'dice-backpack-expand'
  | 'dice-arcane-infusion'
  | 'heal-14'
  | 'discover-graveyard-magic';

export type AmuletEffectId =
  | 'heal'
  | 'balance'
  | 'life'
  | 'guardian'
  | 'flash'
  | 'strength'
  | 'dual-guard'
  | 'discard-zap'
  | 'flip-gold';

export type AmuletAuraBonus = {
  attack?: number;
  defense?: number;
  maxHp?: number;
};

export type HeroMagicId = 'holy-light' | 'berserker-rage';

export type EventRequirement =
  | { type: 'equipment'; slot: 'left' | 'right'; message?: string }
  | { type: 'equipmentAny'; message?: string }
  | { type: 'amulet'; message?: string }
  | { type: 'hand'; min: number; message?: string }
  | { type: 'cardPool'; pools: Array<'hand' | 'backpack'>; min: number; message?: string }
  | { type: 'graveyard'; min: number; message?: string }
  | { type: 'gold'; min: number; message?: string }
  | { type: 'leftmostIsEnraged'; message?: string };

export type EventEffectExpression = string | string[];

export interface EventDiceRange {
  id: string;
  range: [number, number];
  label: string;
  effect: EventEffectExpression;
}

export interface EventChoiceDefinition {
  id?: string;
  text: string;
  effect?: EventEffectExpression;
  requires?: EventRequirement[];
  diceTable?: EventDiceRange[];
  hint?: string;
  requiresDisabledChoices?: string[];
  requiresDisabledReason?: string;
  skipFlip?: boolean;
}

export type CardFlipDestination = 'backpack' | 'hand' | 'graveyard' | 'stay';

export type CardFlipTarget = {
  toCard: GameCardData;
  destination?: CardFlipDestination;
  banner?: string;
  message?: string;
};

export interface GameCardData {
  id: string;
  type: CardType;
  name: string;
  value: number;
  image?: string;
  effect?: 'health' | 'attack' | 'defense'; // Legacy amulet bonuses
  amuletEffect?: AmuletEffectId;
  amuletAuraBonus?: AmuletAuraBonus;
  magicType?: 'instant' | 'permanent'; // For magic cards
  magicEffect?: string; // Description of magic effect
  heroMagicId?: HeroMagicId;
  heroMagicEffect?: string;
  skillType?: 'instant' | 'permanent'; // For class skills
  skillEffect?: string; // Description of skill effect
  eventChoices?: EventChoiceDefinition[]; // For event cards
  isCurse?: boolean;
  // Monster-specific properties
  monsterType?: string; // Base type for rage lookup (Dragon, Skeleton, etc.)
  monsterSpecial?: string; // Special champion ability tag (ember-fury, bone-regen, etc.)
  specialAttackBoost?: number; // Cumulative attack boost from bleedEffect
  hasRevive?: boolean; // Monster revives once at 1 HP layer on first death
  reviveUsed?: boolean; // Whether the revive has already been consumed
  lastWords?: string; // Death trigger effect ID (fires on actual death, not revive)
  bleedEffect?: string; // Bleed keyword: triggers on every layer lost (e.g. 'attack+1', 'attack+3')
  eliteRegenHeroTurn?: boolean; // Elite dragon: restore 1 layer if hero turn ends without layer loss
  enterEffect?: string; // On-enter keyword: triggers when card enters the active dungeon row
  eliteDoubleAttack?: boolean; // Elite ogre: 50% chance to attack twice
  onAttackEffect?: string; // On-attack keyword: triggers every time this monster attacks (e.g. 'steal-gold-2')
  eliteLowGoldPower?: boolean; // Elite goblin: double attack & HP when player gold <= 10
  lowGoldBuffActive?: boolean; // Whether the low-gold buff is currently applied
  attack?: number; // Monster attack value
  hp?: number; // Monster current HP
  maxHp?: number; // Monster original HP
  fury?: number; // Fury (formerly hpLayers) - number of rage layers
  hpLayers?: number; // Deprecated: kept for compatibility, aliases to fury
  currentLayer?: number; // Deprecated: kept for compatibility, mapped from fury
  rageTurn?: number; // Turn number used to calculate rage
  layerShift?: number; // Visual shift amount (0-4)
  waterfallEffect?: { type: string; amount: number; description: string };
  baseAttack?: number; // Original attack before waterfall upgrades
  baseHp?: number; // Original HP before waterfall upgrades
  // Equipment durability
  durability?: number; // Current durability for weapons/shields
  maxDurability?: number; // Maximum durability for weapons/shields
  weaponDurabilitySaveChance?: number; // % chance to not consume durability on attack
  damageReflect?: number; // Damage reflected back to attacker when blocking
  shieldPerfectBlockSaveChance?: number; // % chance to save durability on perfect block
  reflectHalfDamage?: boolean; // Reflect half of incoming attack damage back to attacker
  // Class card properties
  classCard?: boolean; // Marks as a class card
  /** 损毁或强制弃置时进入回收袋，经 recycleDelay 次瀑流回背包（与永久法术共用回收区） */
  permEquipment?: boolean;
  description?: string; // Card effect description
  potionEffect?: PotionEffectId;
  flipTarget?: CardFlipTarget;
  _flipBackCard?: GameCardData;
  scalingDamage?: number; // Self-scaling damage for permanent magic cards
  recycleDelay?: number; // Waterfalls to wait in recycle bag before restoring (default 1)
  _recycleWaits?: number; // Internal: remaining waterfalls before this card leaves the recycle bag
  onDestroyHeal?: number; // Heal this amount when equipment is destroyed
  onDestroyGold?: number; // Gain this much gold when equipment is destroyed
  onDiscardDamage?: number; // Base spell damage dealt to random monster when discarded
  critChance?: number; // % chance to deal double damage on attack
  restoreDurabilityOnKill?: boolean; // Restore full durability when killing a monster
  healOnAttack?: number; // Heal this amount each time this weapon attacks
  healOnKill?: number; // Heal this amount when this weapon kills a monster
  waterfallAttackBoost?: number; // Increase weapon's own attack by this amount each waterfall
  isMinionCard?: boolean;
  // Boss monster properties
  isFinalMonster?: boolean; // Last monster in the deck — transforms into boss on defeat
  bossPhase?: boolean; // Monster has transformed into boss form
  bossRetaliationDamage?: number; // Direct damage to hero (ignoring shields) each time boss takes a hit
  bossLastStandAura?: boolean; // At 1 layer: +5 atk & heal 8 HP per monster turn end
  bossLayerCap?: boolean; // (deprecated) Max 1 layer loss per hero turn
  bossFuryDiceChance?: boolean; // Boss: 50% chance to skip layer loss on attack (dice roll)
  // Tier-3 waterfall upgrade abilities
  ogreEnterDiscard?: boolean; // Ogre tier-3: randomly discard a player hand card on enter
  dragonBleedDestroy?: boolean; // Dragon tier-3: on layer loss, destroy equipment with durability > remaining layers
  skeletonNoLayerCost?: boolean; // Skeleton tier-3: after revive, attacks don't consume layers
  skeletonNoLayerCostActive?: boolean; // Set to true once skeleton revives with tier-3 ability
  wraithDeathHeal?: number; // Wraith tier-3: on death, same-row monsters gain this much HP
  goblinStealScale?: boolean; // Goblin tier-3: +X atk/hp per X gold stolen
  goblinHasStolen?: boolean; // Tracks if this goblin successfully stole gold
  /** 本局随机指定的一只哥布林；仅该实例死亡且未偷金时掉落「哥布林的戏法」 */
  goblinTrickCarrier?: boolean;
  // Permanent event properties
  isPermanentEvent?: boolean; // Stays in dungeon after effect; recyclable like perm magic
  hasReleaseCharge?: boolean; // Gained on appearance or position change; consumed on effect use
  _fateBladeLastSlot?: number; // Internal: last known active row slot index for position tracking
}

/** 叠伤永久法术：仅显示叠刺层数（随使用次数增加），不含永久法术加成 / 法术回响 */
export function formatScalingSpellDamageLine(scalingBase: number): string {
  return `当下 ${scalingBase} 点`;
}

export function isPermRecycleEquipment(card: GameCardData | null | undefined): boolean {
  return Boolean(
    card && (card.type === 'weapon' || card.type === 'shield') && card.permEquipment,
  );
}

/** 背包列表等：`永久` 或 `永久 2`（recycleDelay > 1 时带数字） */
export function getMagicSubtypeBracketLabel(card: GameCardData): string | null {
  if (isPermRecycleEquipment(card)) {
    const d = card.recycleDelay ?? 1;
    return d > 1 ? `永久装备 ${d}` : '永久装备';
  }
  if (card.type !== 'magic' || !card.magicType) return null;
  if (card.magicType === 'instant') return '即时';
  if (card.magicType === 'permanent') {
    const d = card.recycleDelay ?? 1;
    return d > 1 ? `永久 ${d}` : '永久';
  }
  return card.magicType;
}

interface GameCardProps {
  card: GameCardData;
  onDragStart?: (card: GameCardData) => void;
  onDragEnd?: (event?: React.DragEvent) => void;
  onWeaponDrop?: (weapon: any) => void;
  isWeaponDropTarget?: boolean;
  className?: string;
  onClick?: () => void;
  disableInteractions?: boolean;
  amuletDescriptionVariant?: 'default' | 'topThird';
  bleedAnimation?: boolean;
  weaponSwingAnimation?: boolean;
  shieldBlockAnimation?: boolean;
  defeatAnimation?: boolean;
  isEngaged?: boolean;
  weaponSwingVariant?: number;
  shieldBlockVariant?: number;
  equipmentStatModifier?: EquipmentCardStatModifier | null;
  showExhaustedOverlay?: boolean;
}

function GameCardInner({
  card,
  onDragStart,
  onDragEnd,
  onWeaponDrop,
  isWeaponDropTarget,
  className = '',
  onClick,
  disableInteractions = false,
  amuletDescriptionVariant = 'default',
  bleedAnimation = false,
  weaponSwingAnimation = false,
  shieldBlockAnimation = false,
  defeatAnimation = false,
  isEngaged = false,
  weaponSwingVariant = 0,
  shieldBlockVariant = 0,
  equipmentStatModifier = null,
  showExhaustedOverlay = false,
}: GameCardProps) {
  const gameViewport = useGameViewport();
  const isCompact = gameViewport.width < 500;
  const isFlat = gameViewport.width / gameViewport.height > FLAT_ASPECT_RATIO;
  const [isDragging, setIsDragging] = useState(false);
  const [cardScale, setCardScale] = useState(1);
  const [cardWidthPx, setCardWidthPx] = useState(BASE_CARD_WIDTH);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const durabilityCapacity = Math.max(card.maxDurability ?? card.durability ?? 0, 0);
  const totalDurabilityDots = Math.min(MAX_DURABILITY_DOTS, durabilityCapacity);
  const currentDurability = Math.min(
    totalDurabilityDots,
    Math.max(card.durability ?? 0, 0),
  );
  const engagedMonster = isEngaged && card.type === 'monster';
  const isPotionCard = card.type === 'potion';
  const isMagicLikeCard = card.type === 'magic' || card.type === 'hero-magic';
  const isEventCard = card.type === 'event';
  const isTitleBandCard = isMagicLikeCard || isEventCard;
  const isPermanentMagicCard = card.type === 'magic' && card.magicType === 'permanent';
  const permRecycleWaterfalls = card.recycleDelay ?? 1;
  /** 永久法术：卡面始终显示 PERM + 瀑流计数（含 1）；永驻事件、永久装备仍仅在 >1 时显示数字 */
  const showPermMagicRecycleNumber = isPermanentMagicCard;
  const showPermEventRecycleNumber = Boolean(card.isPermanentEvent) && permRecycleWaterfalls > 1;
  const showPermEquipmentRecycleNumber = permRecycleWaterfalls > 1;
  const healingPotionEffects: PotionEffectId[] = ['heal-5', 'heal-7'];
  const isHealingPotion =
    isPotionCard && (!card.potionEffect || healingPotionEffects.includes(card.potionEffect));
  const potionDescription =
    isPotionCard && !isHealingPotion ? card.description ?? null : null;

  const isEquipmentCard = card.type === 'weapon' || card.type === 'shield' || (card.type === 'monster' && 'fromSlot' in card);
  const mobileDragType =
    isEquipmentCard && 'fromSlot' in card && (card as any)?.fromSlot ? 'equipment' : 'card';

  useEffect(() => {
    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') {
      return;
    }
    const target = cardRef.current;
    if (!target) {
      return;
    }

    let rafId: number | null = null;
    const updateScale = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const { width } = target.getBoundingClientRect();
        if (!width) return;
        setCardWidthPx(prevW => (Math.abs(prevW - width) > 0.5 ? width : prevW));
        setCardScale(prev => {
          const next = clamp(width / BASE_CARD_WIDTH, CARD_SCALE_MIN, CARD_SCALE_MAX);
          return Math.abs(prev - next) > 0.01 ? next : prev;
        });
      });
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(target);

    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  /** 魔法 / 事件标题条：极窄时只显示标题，避免左侧纹样挤占 */
  const hideTitleBandSideGlyph =
    isTitleBandCard && boardTitleGlyphWouldCrowdName(cardWidthPx, isFlat, isCompact);

  const cardRef2 = useRef(card);
  cardRef2.current = card;
  const onDragStartRef = useRef(onDragStart);
  onDragStartRef.current = onDragStart;
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  useEffect(() => {
    if (disableInteractions || !cardRef.current) return;
    
    const cleanup = initMobileDrag(
      cardRef.current,
      () => ({ type: mobileDragType, data: cardRef2.current }),
      () => {
        setIsDragging(true);
        onDragStartRef.current?.(cardRef2.current);
      },
      () => {
        setIsDragging(false);
        onDragEndRef.current?.();
      }
    );
    
    return cleanup;
  }, [disableInteractions, mobileDragType]);

  // Enable mobile weapon drops when a monster card is a valid drop target
  useEffect(() => {
    if (disableInteractions || !cardRef.current) return;
    if (card.type !== 'monster' || !onWeaponDrop) return;

    const cleanup = initMobileDrop(
      cardRef.current,
      dragData => {
        if (!isWeaponDropTarget) return;
        if (dragData.type !== 'equipment') return;
        onWeaponDrop?.(dragData.data);
      },
      ['equipment'],
    );

    return cleanup;
  }, [card, onWeaponDrop, disableInteractions, isWeaponDropTarget]);

  const handleDragStart = (e: React.DragEvent) => {
    if (disableInteractions) return;
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('card', JSON.stringify(card));
    if ((card.type === 'weapon' || card.type === 'shield' || card.type === 'monster') && 'fromSlot' in card && (card as any).fromSlot) {
      e.dataTransfer.setData('equipment', JSON.stringify(card));
    }
    onDragStart?.(card);
  };

  const handleDragEnd = (e?: React.DragEvent) => {
    if (disableInteractions) return;
    setIsDragging(false);
    onDragEnd?.(e);
  };

  const equipmentSlotSurface =
    (card.type === 'weapon' || card.type === 'shield' || card.type === 'monster') &&
    'fromSlot' in card &&
    typeof (card as { fromSlot?: string }).fromSlot === 'string' &&
    (card as { fromSlot: string }).fromSlot.startsWith('slot-equipment');

  const handleDragOver = (e: React.DragEvent) => {
    if (disableInteractions) return;
    if (card.type === 'monster' || equipmentSlotSurface) {
      e.preventDefault();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (disableInteractions) return;
    if (card.type === 'monster') {
      e.preventDefault();
      const equipmentData = e.dataTransfer.getData('equipment');
      if (equipmentData) {
        const weapon = JSON.parse(equipmentData);
        onWeaponDrop?.(weapon);
      }
    }
  };

  // Handle double tap for mobile devices
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (disableInteractions || !onClick) return;
    
    const touch = e.changedTouches[0];
    const currentTime = Date.now();
    const currentX = touch.clientX;
    const currentY = touch.clientY;
    
    if (lastTapRef.current) {
      const timeDiff = currentTime - lastTapRef.current.time;
      const xDiff = Math.abs(currentX - lastTapRef.current.x);
      const yDiff = Math.abs(currentY - lastTapRef.current.y);
      
      // Check if it's a double tap (within 300ms and 50px distance)
      if (timeDiff < 300 && xDiff < 50 && yDiff < 50) {
        e.preventDefault();
        onClick();
        lastTapRef.current = null; // Reset to prevent triple tap
        return;
      }
    }
    
    // Store this tap for potential double tap detection
    lastTapRef.current = { time: currentTime, x: currentX, y: currentY };
    
    // Clear the stored tap after a delay to prevent accidental double taps
    setTimeout(() => {
      lastTapRef.current = null;
    }, 300);
  };

  const getCardIcon = () => {
    switch (card.type) {
      case 'monster':
        return <Skull className="dh-card__icon text-destructive" />;
      case 'weapon':
        return <Sword className="dh-card__icon text-amber-500" />;
      case 'shield':
        return <Shield className="dh-card__icon text-blue-500" />;
      case 'potion':
        return <Heart className="dh-card__icon text-green-500" />;
      case 'amulet':
        return <Sparkles className="dh-card__icon text-purple-500" />;
      case 'magic':
        return <Zap className="dh-card__icon text-cyan-500" />;
      case 'hero-magic':
        return <Wand2 className="dh-card__icon text-rose-500" />;
      case 'event':
        return <Scroll className="dh-card__icon text-violet-700" />;
    }
  };

  const getCardBorderColor = () => {
    // Class cards get golden border
    if (card.classCard) {
      return 'border-yellow-600 shadow-yellow-500/20';
    }
    
    switch (card.type) {
      case 'monster':
        if (card.bossPhase) return 'border-red-500 shadow-red-500/40 shadow-lg';
        if (card.isFinalMonster) return 'border-red-600 shadow-red-500/20';
        return 'border-red-900';
      case 'weapon':
        return 'border-amber-900';
      case 'shield':
        return 'border-blue-900';
      case 'potion':
        return 'border-emerald-800';
      case 'amulet':
        return 'border-violet-900';
      case 'magic':
        return 'border-cyan-900';
      case 'hero-magic':
        return 'border-rose-900';
      case 'event':
        return 'border-violet-700';
      default:
        return 'border-card-border';
    }
  };

const formatAuraBonusText = (bonus?: AmuletAuraBonus | null) => {
  if (!bonus) {
    return null;
  }
  const parts: string[] = [];
  if (typeof bonus.attack === 'number' && bonus.attack !== 0) {
    parts.push(`攻击 +${bonus.attack}`);
  }
  if (typeof bonus.defense === 'number' && bonus.defense !== 0) {
    parts.push(`护甲 +${bonus.defense}`);
  }
  if (typeof bonus.maxHp === 'number' && bonus.maxHp !== 0) {
    parts.push(`最大生命 +${bonus.maxHp}`);
  }
  return parts.length > 0 ? parts.join(' / ') : null;
};

const amuletEffectText =
  card.type === 'amulet'
    ? card.description ||
      formatAuraBonusText(card.amuletAuraBonus) ||
      (card.effect && typeof card.value === 'number' ? `+${card.value} ${card.effect}` : null)
    : null;

  const showAmuletOverlay =
    card.type === 'amulet' && amuletEffectText && amuletDescriptionVariant === 'topThird';

  // Calculate visual shift based on layer damage - DEPRECATED in favor of GameBoard visualization
  const getLayerShift = () => {
    return 0; // Handled by GameBoard wrapper now
  };

  const showBleedOverlay = Boolean(bleedAnimation);
  const showWeaponSwing = Boolean(weaponSwingAnimation);
  const showShieldBlock = Boolean(shieldBlockAnimation);
  const showDefeatOverlay = Boolean(defeatAnimation);
  const showCombatOverlay = showBleedOverlay || showWeaponSwing || showShieldBlock || showDefeatOverlay;
  const isMagicCard = isMagicLikeCard;
  const isTextOnlyCard = isEventCard || isMagicCard;
  const isThemedImageCard = card.type === 'amulet' || card.type === 'potion';
  const cornerDecoClass =
    card.type === 'amulet'
      ? 'dh-card-deco--amulet'
      : card.type === 'potion'
        ? 'dh-card-deco--potion'
        : card.type === 'monster'
          ? 'dh-card-deco--monster'
          : card.type === 'weapon'
            ? 'dh-card-deco--weapon'
            : card.type === 'shield'
              ? 'dh-card-deco--shield'
              : '';
  const hasCornerDeco = Boolean(cornerDecoClass);
  const insetFrameBorderClass = (() => {
    if (!hasCornerDeco) return '';
    switch (card.type) {
      case 'monster':
        return 'border-red-300/30';
      case 'weapon':
        return 'border-amber-500/40';
      case 'shield':
        return 'border-blue-500/40';
      case 'potion':
        return 'border-emerald-500/40';
      case 'amulet':
        return 'border-violet-400/45';
      default:
        return '';
    }
  })();
  const cardImageHeightClass = isThemedImageCard ? 'h-[60%]' : 'h-[65%]';
  const hasFlipTarget = Boolean(card.flipTarget);

  const cardImageBackdropClass = (() => {
    if (isThemedImageCard) {
      return card.type === 'amulet' ? 'bg-violet-200/30' : 'bg-emerald-200/30';
    }
    switch (card.type) {
      case 'monster':
        return 'bg-red-50/45';
      case 'weapon':
        return 'bg-amber-200/30';
      case 'shield':
        return 'bg-blue-300/36';
      default:
        return 'bg-gradient-to-b from-muted to-card';
    }
  })();

  const cardTextAreaBgClass = (() => {
    switch (card.type) {
      case 'amulet':
        return 'bg-violet-200/30';
      case 'potion':
        return 'bg-emerald-200/30';
      case 'monster':
        return 'bg-red-50/45';
      case 'weapon':
        return 'bg-amber-200/30';
      case 'shield':
        return 'bg-blue-300/36';
      default:
        return 'bg-card';
    }
  })();

  const cardImageWrapperClassName = [
    'relative',
    hasCornerDeco ? 'z-[1]' : '',
    cardImageHeightClass,
    isThemedImageCard
      ? 'overflow-hidden flex items-center justify-center'
      : 'overflow-hidden flex items-end justify-center',
    cardImageBackdropClass,
  ]
    .filter(Boolean)
    .join(' ');
  const cardImageClassName = isThemedImageCard
    ? 'select-none w-auto max-h-[80%] max-w-[80%] object-contain opacity-70'
    : 'select-none w-auto max-h-[82%] max-w-[82%] object-contain';

  const modSpacer = '';
  const equipmentStatModifierText =
    equipmentStatModifier &&
    (card.type === 'weapon' || card.type === 'shield' || card.type === 'monster') &&
    equipmentStatModifier.appliesTo === card.type &&
    equipmentStatModifier.modifier !== 0
      ? `${equipmentStatModifier.modifier > 0 ? '+' : '-'}${modSpacer}${Math.abs(
          equipmentStatModifier.modifier,
        )}`
      : null;
  const equipmentShieldModifierText =
    equipmentStatModifier &&
    card.type === 'monster' &&
    equipmentStatModifier.appliesTo === 'monster' &&
    (equipmentStatModifier.shieldModifier ?? 0) !== 0
      ? `${(equipmentStatModifier.shieldModifier ?? 0) > 0 ? '+' : '-'}${modSpacer}${Math.abs(
          equipmentStatModifier.shieldModifier ?? 0,
        )}`
      : null;
  const equipmentStatModifierColor = 'text-emerald-600';

  const monsterAttackModifier = (() => {
    if (card.type !== 'monster') return 0;
    const current = card.attack ?? card.value;
    const boost = card.specialAttackBoost ?? 0;
    const baseBeforeEffects = card.lowGoldBuffActive
      ? Math.floor(current / 2) - boost
      : current - boost;
    return current - baseBeforeEffects;
  })();
  const monsterAttackBase = (card.attack ?? card.value) - monsterAttackModifier;

  const monsterHpModifier = (() => {
    if (card.type !== 'monster') return 0;
    const currentMax = card.maxHp ?? card.hp ?? 0;
    if (card.lowGoldBuffActive) return Math.floor(currentMax / 2);
    return 0;
  })();
  const monsterHpBase = Math.max(0, (card.hp ?? card.value) - monsterHpModifier);

  return (
    <div
      ref={cardRef}
      draggable={!disableInteractions}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={onClick}
      onTouchEnd={handleTouchEnd}
      className={`
        dh-card-wrapper
        w-full h-full
        cursor-pointer active:cursor-grabbing
        transition-[transform,opacity,filter] duration-200 ease-out
        touch-none
        ${isDragging 
          ? 'opacity-60 scale-95 -rotate-6 -translate-y-2' 
          : 'hover:scale-105 hover:-translate-y-1 hover:rotate-1'
        }
        ${card.type === 'monster' && isWeaponDropTarget ? 'scale-105' : ''}
        ${engagedMonster ? 'engaged-monster' : ''}
        ${className}
      `}
      style={{
        filter: isDragging ? 'brightness(1.1)' : 'none',
        // transform handled by GameBoard wrapper for fury sliding
        '--dh-card-instance-scale': cardScale.toString(),
      } as CSSProperties}
      data-engaged={engagedMonster ? 'true' : undefined}
      data-testid={`card-${card.type}-${card.id}`}
    >
      <Card className={`
        w-full h-full border-4 ${getCardBorderColor()} overflow-hidden
        transition-shadow duration-200
        ${isDragging ? 'shadow-2xl' : 'shadow-lg hover:shadow-xl'}
        ${isEventCard ? 'shadow-violet-500/30 shadow-xl' : ''}
      `}>
        <div className="h-full flex flex-col relative">
          {hasFlipTarget && (
            <div className={`dh-card__flip-badge ${isCompact || isFlat ? 'dh-card__flip-badge--compact' : ''}`} title="处理后会翻面">
              翻转
            </div>
          )}

          {isTextOnlyCard ? (
            /* ========== EVENT / MAGIC: full-height text layout with decorative edges ========== */
            <div className={`h-full flex flex-col relative overflow-hidden ${
              isEventCard
                ? 'bg-gradient-to-b from-violet-50 to-violet-200/85'
                : card.type === 'hero-magic'
                  ? 'bg-gradient-to-b from-rose-50 to-rose-200/85'
                  : 'bg-gradient-to-b from-sky-50 to-cyan-100/90'
            }`}>
              {/* Decorative corner ornaments */}
              <div className={`absolute inset-0 pointer-events-none ${
                isEventCard ? 'dh-card-deco--event' : 'dh-card-deco--magic'
              }`} />

              {/* Outer inset frame (inside card, behind content) */}
              <div className={`absolute pointer-events-none rounded-sm ${
                isEventCard
                  ? `${isCompact ? 'inset-[3px]' : 'inset-[6px]'} border border-violet-400/45`
                  : card.type === 'hero-magic'
                    ? `${isCompact ? 'inset-[3px]' : 'inset-[6px]'} border border-rose-400/45`
                    : `${isCompact ? 'inset-[3px]' : 'inset-[6px]'} border border-cyan-500/35`
              }`} />

              {/* Type label banner at top */}
              <div className={`relative z-10 flex items-center justify-center gap-1.5 py-1.5 ${isCompact ? 'px-0.5' : 'px-2'} ${
                isEventCard
                  ? 'bg-violet-300/55'
                  : card.type === 'hero-magic'
                    ? 'bg-rose-300/55'
                    : 'bg-cyan-200/60'
              }`}>
                {getCardIcon()}
                {isFlat ? (
                  <span className={`dh-card__caption font-bold truncate max-w-[80%] ${
                    isEventCard
                      ? 'text-violet-950'
                      : card.type === 'hero-magic'
                        ? 'text-rose-950'
                        : 'text-cyan-950'
                  }`}>
                    {card.name}
                  </span>
                ) : !isCompact ? (
                  <span className={`dh-card__caption font-bold uppercase tracking-widest ${
                    isEventCard
                      ? 'text-violet-950'
                      : card.type === 'hero-magic'
                        ? 'text-rose-950'
                        : 'text-cyan-950'
                  }`}>
                    {isEventCard ? 'Event' : card.type === 'hero-magic' ? 'Hero Magic' : 'Magic'}
                  </span>
                ) : null}
                {(isPermanentMagicCard || card.isPermanentEvent) && (
                  <span className={`dh-card__caption flex items-center rounded-sm border border-cyan-300/50 bg-cyan-800/50 font-bold uppercase tracking-wide text-cyan-50 shadow-sm ${isCompact || isFlat ? 'gap-0 px-0.5 py-0' : 'gap-0.5 px-1 py-0.5'}`}>
                    <Infinity className={isCompact || isFlat ? 'dh-icon-inline--compact' : 'dh-icon-inline'} />
                    <span className="tabular-nums leading-none">{permRecycleWaterfalls}</span>
                  </span>
                )}
              </div>

              {/* Divider line */}
              <div
                className={`h-px ${isCompact ? 'mx-1' : 'mx-3'} ${
                  isTitleBandCard ? '-mb-px' : ''
                } ${
                  isEventCard
                    ? 'bg-gradient-to-r from-transparent via-violet-500/40 to-transparent'
                    : card.type === 'hero-magic'
                      ? 'bg-gradient-to-r from-transparent via-rose-500/40 to-transparent'
                      : 'bg-gradient-to-r from-transparent via-cyan-600/35 to-transparent'
                }`}
              />

              {/* Card name (magic / hero-magic: fused band — wash + flanks + title) */}
              {isMagicLikeCard ? (
                <MagicTitleBand card={card} compact={isCompact} isFlat={isFlat}>
                  {hideTitleBandSideGlyph ? (
                    <h3
                      className={`dh-card__name relative z-20 isolate flex w-full min-w-0 items-center justify-center truncate bg-white/22 px-1.5 py-0 text-center font-serif font-bold leading-snug ${
                        card.type === 'hero-magic' ? 'text-rose-950' : 'text-cyan-950'
                      }`}
                      title={card.name}
                    >
                      {card.name}
                    </h3>
                  ) : (
                    <div className="flex min-h-[calc(1.3rem*var(--dh-card-instance-scale,1))] w-full min-w-0 flex-1 items-stretch sm:min-h-[calc(1.4rem*var(--dh-card-instance-scale,1))]">
                      <div
                        className={`relative z-0 flex shrink-0 items-center justify-center ${eventTitleSideSlotClass(isFlat, isCompact)}`}
                      >
                        <MagicNameLeftGlyph card={card} compact={isCompact} isFlat={isFlat} />
                      </div>
                      <h3
                        className={`dh-card__name relative z-20 isolate flex min-w-0 flex-1 items-center justify-center truncate border-x border-transparent bg-white/22 px-1 py-0 text-center font-serif font-bold leading-snug ${
                          card.type === 'hero-magic' ? 'text-rose-950' : 'text-cyan-950'
                        }`}
                        title={card.name}
                      >
                        {card.name}
                      </h3>
                      <div
                        className={`relative z-0 shrink-0 ${eventTitleSideSlotClass(isFlat, isCompact)}`}
                        aria-hidden
                      />
                    </div>
                  )}
                </MagicTitleBand>
              ) : isEventCard ? (
                <EventTitleBand card={card} compact={isCompact} isFlat={isFlat}>
                  {hideTitleBandSideGlyph ? (
                    <div className="flex min-h-[calc(1.3rem*var(--dh-card-instance-scale,1))] w-full min-w-0 flex-1 items-stretch sm:min-h-[calc(1.4rem*var(--dh-card-instance-scale,1))]">
                      <h3
                        className="dh-card__name relative z-20 isolate flex w-full min-w-0 items-center justify-center truncate bg-white/22 px-1.5 py-0 text-center font-serif font-bold leading-snug text-violet-950"
                        title={card.name}
                      >
                        {card.name}
                      </h3>
                    </div>
                  ) : (
                    <div className="flex min-h-[calc(1.3rem*var(--dh-card-instance-scale,1))] w-full min-w-0 flex-1 items-stretch sm:min-h-[calc(1.4rem*var(--dh-card-instance-scale,1))]">
                      <div
                        className={`relative z-0 flex shrink-0 items-center justify-center ${eventTitleSideSlotClass(isFlat, isCompact)}`}
                      >
                        <EventNameLeftGlyph card={card} compact={isCompact} isFlat={isFlat} />
                      </div>
                      <h3
                        className="dh-card__name relative z-20 isolate flex min-w-0 flex-1 items-center justify-center truncate border-x border-transparent bg-white/22 px-1 py-0 text-center font-serif font-bold leading-snug text-violet-950"
                        title={card.name}
                      >
                        {card.name}
                      </h3>
                      <div
                        className={`relative z-0 shrink-0 ${eventTitleSideSlotClass(isFlat, isCompact)}`}
                        aria-hidden
                      />
                    </div>
                  )}
                </EventTitleBand>
              ) : (
                <div
                  className={`relative z-10 flex items-center justify-center text-center ${
                    isCompact ? 'px-0.5 py-1 min-h-[1.85rem]' : 'px-2 py-1.5 min-h-[2.35rem]'
                  }`}
                >
                  <h3
                    className={`dh-card__name w-full truncate px-0.5 font-serif font-bold ${
                      isEventCard ? 'text-violet-950' : card.type === 'hero-magic' ? 'text-rose-950' : 'text-cyan-950'
                    }`}
                    title={card.name}
                  >
                    {card.name}
                  </h3>
                </div>
              )}

              {/* Thin separator (aligned with wide body column) */}
              <div
                className={`h-px ${isCompact ? 'mx-0.5' : 'mx-1'} ${
                  isTitleBandCard ? '-mt-1' : ''
                } ${
                  isEventCard
                    ? 'bg-gradient-to-r from-transparent via-violet-500/35 to-transparent'
                    : card.type === 'hero-magic'
                      ? 'bg-gradient-to-r from-transparent via-rose-500/35 to-transparent'
                      : 'bg-gradient-to-r from-transparent via-cyan-600/30 to-transparent'
                }`}
              />

              {/* Description / choices area - fills remaining space (tight horizontal inset vs card) */}
              <div
                className={`relative z-10 flex-1 min-h-0 overflow-y-auto ${
                  isCompact ? 'px-0' : 'px-0.5'
                } pt-1 pb-1.5`}
              >
                <div
                  className={`h-full min-h-0 ${
                    isCompact ? 'px-0.5 py-1' : 'px-1 py-1'
                  } rounded-md border border-transparent bg-white/92`}
                >
                  {isMagicLikeCard && (
                    <div className="dh-card__event-option w-full text-left leading-snug text-zinc-900">
                      {card.scalingDamage != null ? (
                        <span className="block font-semibold text-cyan-950 dark:text-cyan-100">
                          {formatScalingSpellDamageLine(card.scalingDamage)}
                        </span>
                      ) : (
                        <>
                          {card.description || card.magicEffect || card.heroMagicEffect}
                        </>
                      )}
                    </div>
                  )}
                  {isEventCard && card.eventChoices && (
                    <div className="w-full flex flex-col gap-1">
                      {card.eventChoices.map((choice, idx) => (
                        <div
                          key={idx}
                          className="dh-card__event-option text-left break-words leading-snug text-zinc-900"
                        >
                          <span className="text-violet-600 mr-0.5">◆</span> {choice.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom decorative bar */}
              <div className={`h-px mx-1 ${
                isEventCard
                  ? 'bg-gradient-to-r from-transparent via-violet-500/40 to-transparent'
                  : card.type === 'hero-magic'
                    ? 'bg-gradient-to-r from-transparent via-rose-500/40 to-transparent'
                    : 'bg-gradient-to-r from-transparent via-cyan-600/35 to-transparent'
              }`} />
              <div className={`relative z-10 flex items-center justify-center py-1 ${
                isEventCard
                  ? 'bg-violet-300/45'
                  : card.type === 'hero-magic'
                    ? 'bg-rose-300/45'
                    : 'bg-cyan-200/50'
              }`}>
                {getCardIcon()}
              </div>
            </div>
          ) : (
            /* ========== STANDARD CARD LAYOUT (monsters, weapons, shields, potions, amulets) ========== */
            <>
              {hasCornerDeco && (
                <div
                  className={`absolute inset-0 pointer-events-none z-0 ${cornerDecoClass}`}
                  aria-hidden
                />
              )}
              {hasCornerDeco && insetFrameBorderClass && (
                <div
                  className={`absolute pointer-events-none rounded-sm ${
                    isCompact ? 'inset-[3px]' : 'inset-[6px]'
                  } border ${insetFrameBorderClass}`}
                  aria-hidden
                />
              )}
              {/* Image Area */}
              <div className={cardImageWrapperClassName}>
                {card.image && (
                  <img 
                    src={card.image} 
                    alt={card.name}
                    draggable={false}
                    className={cardImageClassName}
                  />
                )}
                {card.type === 'monster' && card.bossPhase && (
                  <div className="absolute inset-0 pointer-events-none border-2 border-red-500/50 rounded-sm bg-red-500/5" />
                )}
                {card.type === 'monster' && (card.isFinalMonster || card.bossPhase) && (
                  <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
                    <div className={`dh-card__caption text-center font-black tracking-widest text-white py-0.5 ${
                      card.bossPhase
                        ? 'bg-red-600/90'
                        : 'bg-red-600/70'
                    }`}>
                      {card.bossPhase ? 'BOSS' : '最终之敌'}
                    </div>
                  </div>
                )}
                {(card.type === 'weapon' || card.type === 'shield') && card.permEquipment && (
                  <div className="absolute top-1 right-1 z-10 pointer-events-none">
                    <span
                      className={`dh-card__caption flex items-center rounded-sm border border-cyan-300/50 bg-cyan-800/50 font-bold uppercase tracking-wide text-cyan-50 shadow-sm ${
                        isCompact ? 'gap-0 px-0.5 py-0' : 'gap-0.5 px-1 py-0.5'
                      }`}
                    >
                      <Infinity className="dh-icon-inline--compact shrink-0" aria-hidden />
                      <span className="tabular-nums leading-none">{permRecycleWaterfalls}</span>
                    </span>
                  </div>
                )}
                {showAmuletOverlay && (
                  <div className="dh-card__body-text absolute top-1.5 left-1.5 right-1.5 font-semibold text-black text-center px-1.5 py-0.5 tracking-wide pointer-events-none select-none drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]">
                    {amuletEffectText}
                  </div>
                )}
                {showCombatOverlay && (
                  <div
                    className="combat-overlay"
                    data-swing-variant={showWeaponSwing ? weaponSwingVariant : undefined}
                    data-block-variant={showShieldBlock ? shieldBlockVariant : undefined}
                  >
                    {showBleedOverlay && (
                      <>
                        <span className="combat-overlay__shape combat-overlay__shape--bleed" />
                        <span className="combat-overlay__shape combat-overlay__shape--bleed-drip" data-stagger="1" />
                        <span className="combat-overlay__shape combat-overlay__shape--bleed-ring" data-stagger="2" />
                      </>
                    )}
                    {showWeaponSwing && (
                      <>
                        <span className="combat-overlay__shape combat-overlay__shape--swing" />
                        <span className="combat-overlay__shape combat-overlay__shape--swing-echo" data-stagger="1" />
                        <span className="combat-overlay__shape combat-overlay__shape--swing-spark" data-stagger="2" />
                      </>
                    )}
                    {showShieldBlock && (
                      <>
                        <span className="combat-overlay__shape combat-overlay__shape--block" />
                        <span className="combat-overlay__shape combat-overlay__shape--block-ripple" data-stagger="1" />
                        <span className="combat-overlay__shape combat-overlay__shape--block-spark" data-stagger="2" />
                      </>
                    )}
                    {showDefeatOverlay && (
                      <>
                        <span className="combat-overlay__shape combat-overlay__shape--defeat" />
                        <span className="combat-overlay__shape combat-overlay__shape--defeat-burst" data-stagger="1" />
                        <span className="combat-overlay__shape combat-overlay__shape--defeat-fade" data-stagger="2" />
                      </>
                    )}
                  </div>
                )}

                {/* STAT OVERLAYS */}
                {card.type === 'monster' && (
                  <>
                    <div className="absolute top-1 left-1">
                      <div className="relative group flex items-center">
                        {!isCompact && (
                          <div className="mr-1">
                            <Sword className={`dh-card__icon drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ${
                              monsterAttackModifier > 0 ? 'text-orange-500' : 'text-red-500'
                            }`} />
                          </div>
                        )}
                        <div className="flex items-baseline gap-0">
                          <span className="dh-card__stat font-black text-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]">
                            {monsterAttackBase}
                          </span>
                          {monsterAttackModifier > 0 && (
                            <span className="dh-card__stat font-black text-orange-600 drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]">
                              +{monsterAttackModifier}
                            </span>
                          )}
                          {equipmentStatModifierText && (
                            <span className={`dh-card__stat font-black ${equipmentStatModifierColor} drop-shadow-[0_0_6px_rgba(0,0,0,0.6)]`}>
                              {equipmentStatModifierText}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="absolute top-1 right-1 flex flex-col items-end gap-0">
                      <div className="relative group flex items-center">
                        <div className="flex items-baseline gap-0 mr-1">
                          <span className="dh-card__stat font-black text-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]">
                            {monsterHpBase}
                          </span>
                          {monsterHpModifier > 0 && (
                            <span className="dh-card__stat font-black text-emerald-600 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]">
                              +{monsterHpModifier}
                            </span>
                          )}
                          {equipmentShieldModifierText && (
                            <span className={`dh-card__stat font-black ${equipmentStatModifierColor} drop-shadow-[0_0_6px_rgba(0,0,0,0.6)]`}>
                              {equipmentShieldModifierText}
                            </span>
                          )}
                        </div>
                        {!isCompact && (
                          <div>
                            <Heart className={`dh-card__icon fill-red-500 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ${
                              monsterHpModifier > 0 || equipmentShieldModifierText ? 'text-emerald-500' : 'text-red-500'
                            }`} />
                          </div>
                        )}
                      </div>
                      {card.hpLayers && card.hpLayers > 1 && (
                        <div className={`flex ${isCompact ? 'gap-px mt-0.5' : 'gap-0.5 mt-1'}`}>
                          {[...Array(card.hpLayers)].map((_, i) => (
                            <div 
                              key={i}
                              className={`${isCompact ? 'dh-card__layer-dot--compact' : 'dh-card__layer-dot'} rounded-full border border-black shadow-sm ${
                                i < (card.currentLayer || 1) ? 'bg-red-500' : 'bg-gray-400'
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    {card.lowGoldBuffActive && (
                      <div className="dh-card__lowgold-glow" />
                    )}
                  </>
                )}

                {(card.type === 'weapon' || card.type === 'shield') && (
                  <>
                    <div className="absolute top-1 left-1">
                      <div className="relative group flex items-center">
                        {!isCompact && (
                          <div className="mr-1">
                            {card.type === 'weapon' ? (
                              <Sword className="dh-card__icon text-amber-400 fill-amber-400 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" />
                            ) : (
                              <Shield className="dh-card__icon text-blue-400 fill-blue-400 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" />
                            )}
                          </div>
                        )}
                        <div className="flex items-baseline gap-0">
                          <span className="dh-card__stat font-black text-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]">
                            {card.value}
                          </span>
                          {equipmentStatModifierText && (
                            <span className={`dh-card__stat font-black ${equipmentStatModifierColor} drop-shadow-[0_0_6px_rgba(0,0,0,0.6)] text-lg`}>
                              {equipmentStatModifierText}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {(card.durability !== undefined || card.maxDurability !== undefined) && totalDurabilityDots > 0 && (
                      <div className={`absolute ${isCompact ? 'top-1 right-1' : 'top-1.5 right-1.5'} flex flex-col items-end`}>
                        <div className={`flex ${isCompact ? 'gap-px' : 'gap-0.5'}`}>
                          {Array.from({ length: totalDurabilityDots }).map((_, i) => {
                            const dotValue = i + 1;
                            const isFilled = dotValue <= currentDurability;
                            return (
                              <div
                                key={dotValue}
                                className={`dh-card__durability-dot rounded-full border shadow-sm transition-colors ${
                                  isFilled
                                    ? 'bg-amber-400 border-amber-500 shadow-amber-500/40'
                                    : 'bg-slate-800/50 border-slate-600 opacity-50'
                                }`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {isPotionCard && isHealingPotion && (
                  <div className="absolute bottom-2 w-full flex justify-center">
                    <div className="relative group flex items-center">
                      <span className="dh-card__stat font-black text-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)] mr-1">
                        +{card.value}
                      </span>
                      <Heart className="dh-card__icon text-green-500 fill-green-500 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" />
                    </div>
                  </div>
                )}
              </div>
              
              {/* Text Area */}
              <div
                className={`flex-1 ${isCompact ? 'p-0.5' : 'p-1'} flex flex-col items-center justify-start text-center overflow-hidden relative ${hasCornerDeco ? 'z-[1] ' : ''}${cardTextAreaBgClass}`}
              >
                <h3 className={`dh-card__name font-serif font-semibold w-full truncate ${isCompact ? 'px-0' : 'px-1'} ${
                  isThemedImageCard ? 'text-gray-900' : ''
                }`} title={card.name}>
                  {card.name}
                </h3>

                {card.type === 'monster' && (card.monsterSpecial || card.hasRevive || card.lastWords || card.bleedEffect || card.enterEffect || card.onAttackEffect || card.ogreEnterDiscard || card.dragonBleedDestroy || card.skeletonNoLayerCostActive || card.wraithDeathHeal || card.goblinStealScale) && (
                  <div className="dh-card__keyword-row">
                    {card.monsterSpecial && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--elite" title={card.description ?? '精英怪物'}>精英</span>
                    )}
                    {card.hasRevive && (
                      <span className={`dh-card__keyword-tag ${card.reviveUsed ? 'dh-card__keyword-tag--revive-used' : 'dh-card__keyword-tag--revive'}`}
                        title={card.reviveUsed ? '复生已触发' : '首次死亡时以1血层复生'}>
                        {card.reviveUsed ? '已复生' : '复生'}
                      </span>
                    )}
                    {card.lastWords && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title="死亡时触发遗言效果">遗言</span>
                    )}
                    {card.bleedEffect && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title={`流血：每失去一个血层，攻击力+${card.bleedEffect.replace('attack+', '')}`}>流血</span>
                    )}
                    {card.enterEffect && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--enter" title="入场时触发效果">入场</span>
                    )}
                    {card.onAttackEffect && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--onattack" title="动手：每次攻击时触发">动手</span>
                    )}
                    {card.ogreEnterDiscard && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--enter" title="蛮力震慑：入场时随机弃掉一张手牌">震慑</span>
                    )}
                    {card.dragonBleedDestroy && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title="流血破甲：失去血层时破坏高耐久装备">破甲</span>
                    )}
                    {card.skeletonNoLayerCostActive && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--revive" title="不朽之骨：攻击不消耗血层">不朽</span>
                    )}
                    {card.wraithDeathHeal != null && card.wraithDeathHeal > 0 && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title={`怨灵祝福：死亡时同行怪物生命+${card.wraithDeathHeal}`}>祝福</span>
                    )}
                    {card.goblinStealScale && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--onattack" title="贪婪强化：偷到金币后攻击力和生命值同步增长">贪婪</span>
                    )}
                  </div>
                )}

                {(card.type === 'weapon' || card.type === 'shield') && card.description && (
                  <div className={`dh-card__body-text w-full text-gray-800 ${isCompact ? 'px-0' : 'px-1'} leading-tight`}>
                    {card.description}
                  </div>
                )}

                {card.type === 'amulet' && amuletEffectText && !showAmuletOverlay && (
                  <div className={`dh-card__body-text w-full text-gray-800 ${isCompact ? 'px-0' : 'px-1'}`}>
                    {amuletEffectText}
                  </div>
                )}
                {isPotionCard && potionDescription && (
                  <div className={`dh-card__body-text w-full text-gray-800 ${isCompact ? 'px-0' : 'px-1'}`}>
                    {potionDescription}
                  </div>
                )}
                
                <div className="absolute bottom-1 right-1 flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
                  {getCardIcon()}
                </div>
              </div>
            </>
          )}
          {showExhaustedOverlay && isDragging && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/10 pointer-events-none">
              <X className="w-4/5 h-4/5 text-red-500/40 stroke-[3]" />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function arePropsEqual(prev: GameCardProps, next: GameCardProps): boolean {
  if (prev.card !== next.card) {
    const a = prev.card;
    const b = next.card;
    if (
      a.id !== b.id ||
      a.name !== b.name ||
      a.attack !== b.attack ||
      a.hp !== b.hp ||
      a.value !== b.value ||
      a.durability !== b.durability ||
      a.maxDurability !== b.maxDurability ||
      a.currentLayer !== b.currentLayer ||
      a.hpLayers !== b.hpLayers ||
      a.fury !== b.fury ||
      a.image !== b.image ||
      a.type !== b.type ||
      a.permEquipment !== b.permEquipment ||
      a.recycleDelay !== b.recycleDelay ||
      a.description !== b.description ||
      a.magicEffect !== b.magicEffect ||
      a.scalingDamage !== b.scalingDamage ||
      a.specialAttackBoost !== b.specialAttackBoost ||
      a.maxHp !== b.maxHp ||
      a.hasRevive !== b.hasRevive ||
      a.reviveUsed !== b.reviveUsed ||
      a.bleedEffect !== b.bleedEffect ||
      a.onAttackEffect !== b.onAttackEffect ||
      a.lowGoldBuffActive !== b.lowGoldBuffActive ||
      a.ogreEnterDiscard !== b.ogreEnterDiscard ||
      a.dragonBleedDestroy !== b.dragonBleedDestroy ||
      a.skeletonNoLayerCostActive !== b.skeletonNoLayerCostActive ||
      a.wraithDeathHeal !== b.wraithDeathHeal ||
      a.goblinStealScale !== b.goblinStealScale ||
      a.goblinHasStolen !== b.goblinHasStolen ||
      a.goblinTrickCarrier !== b.goblinTrickCarrier ||
      a.hasReleaseCharge !== b.hasReleaseCharge
    ) {
      return false;
    }
  }
  return (
    prev.className === next.className &&
    prev.isWeaponDropTarget === next.isWeaponDropTarget &&
    prev.disableInteractions === next.disableInteractions &&
    prev.amuletDescriptionVariant === next.amuletDescriptionVariant &&
    prev.bleedAnimation === next.bleedAnimation &&
    prev.weaponSwingAnimation === next.weaponSwingAnimation &&
    prev.shieldBlockAnimation === next.shieldBlockAnimation &&
    prev.defeatAnimation === next.defeatAnimation &&
    prev.isEngaged === next.isEngaged &&
    prev.weaponSwingVariant === next.weaponSwingVariant &&
    prev.shieldBlockVariant === next.shieldBlockVariant &&
    prev.equipmentStatModifier === next.equipmentStatModifier &&
    prev.showExhaustedOverlay === next.showExhaustedOverlay
  );
}

const GameCard = memo(GameCardInner, arePropsEqual);
export default GameCard;
