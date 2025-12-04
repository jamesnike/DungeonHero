import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { Card } from '@/components/ui/card';
import { Skull, Sword, Shield, Heart, Sparkles, Zap, Scroll, Infinity } from 'lucide-react';
import { initMobileDrag, initMobileDrop } from '../utils/mobileDragDrop';

const MAX_DURABILITY_DOTS = 4;
const BASE_CARD_WIDTH = 180;
const CARD_SCALE_MIN = 0.6;
const CARD_SCALE_MAX = 1.4;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type CardType =
  | 'monster'
  | 'weapon'
  | 'shield'
  | 'potion'
  | 'amulet'
  | 'magic'
  | 'event'
  | 'skill'
  | 'coin';

export type PotionEffectId =
  | 'heal-5'
  | 'heal-7'
  | 'repair-weapon-2'
  | 'repair-weapon-3'
  | 'repair-equipment-2'
  | 'draw-backpack-3'
  | 'discover-class';

export type AmuletEffectId = 'heal' | 'balance' | 'life' | 'guardian' | 'flash' | 'strength';

export type AmuletAuraBonus = {
  attack?: number;
  defense?: number;
  maxHp?: number;
};

export type EventRequirement =
  | { type: 'equipment'; slot: 'left' | 'right'; message?: string }
  | { type: 'equipmentAny'; message?: string }
  | { type: 'amulet'; message?: string }
  | { type: 'hand'; min: number; message?: string }
  | { type: 'cardPool'; pools: Array<'hand' | 'backpack'>; min: number; message?: string }
  | { type: 'graveyard'; min: number; message?: string };

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
}

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
  skillType?: 'instant' | 'permanent'; // For class skills
  skillEffect?: string; // Description of skill effect
  eventChoices?: EventChoiceDefinition[]; // For event cards
  isCurse?: boolean;
  // Monster-specific properties
  attack?: number; // Monster attack value
  hp?: number; // Monster current HP
  maxHp?: number; // Monster original HP
  fury?: number; // Fury (formerly hpLayers) - number of rage layers
  hpLayers?: number; // Deprecated: kept for compatibility, aliases to fury
  currentLayer?: number; // Deprecated: kept for compatibility, mapped from fury
  layerShift?: number; // Visual shift amount (0-4)
  // Equipment durability
  durability?: number; // Current durability for weapons/shields
  maxDurability?: number; // Maximum durability for weapons/shields
  // Class card properties
  classCard?: boolean; // Marks as a class card
  description?: string; // Card effect description
  potionEffect?: PotionEffectId;
}

interface GameCardProps {
  card: GameCardData;
  onDragStart?: (card: GameCardData) => void;
  onDragEnd?: () => void;
  onWeaponDrop?: (weapon: any) => void;
  isWeaponDropTarget?: boolean;
  className?: string;
  onClick?: () => void;
  disableInteractions?: boolean;
  amuletDescriptionVariant?: 'default' | 'topThird';
  bleedAnimation?: boolean;
  weaponSwingAnimation?: boolean;
  shieldBlockAnimation?: boolean;
  isEngaged?: boolean;
  weaponSwingVariant?: number;
  shieldBlockVariant?: number;
}

export default function GameCard({
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
  isEngaged = false,
  weaponSwingVariant = 0,
  shieldBlockVariant = 0,
}: GameCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [cardScale, setCardScale] = useState(1);
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
  const isPermanentMagicCard = card.type === 'magic' && card.magicType === 'permanent';
  const healingPotionEffects: PotionEffectId[] = ['heal-5', 'heal-7'];
  const isHealingPotion =
    isPotionCard && (!card.potionEffect || healingPotionEffects.includes(card.potionEffect));
  const potionDescription =
    isPotionCard && !isHealingPotion ? card.description ?? null : null;

  const isEquipmentCard = card.type === 'weapon' || card.type === 'shield';
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

    const updateScale = () => {
      const { width } = target.getBoundingClientRect();
      if (!width) {
        return;
      }
      setCardScale(prev => {
        const next = clamp(width / BASE_CARD_WIDTH, CARD_SCALE_MIN, CARD_SCALE_MAX);
        return Math.abs(prev - next) > 0.01 ? next : prev;
      });
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(target);

    return () => observer.disconnect();
  }, []);

  // Set up mobile drag support
  useEffect(() => {
    if (disableInteractions || !cardRef.current) return;
    
    const cleanup = initMobileDrag(
      cardRef.current,
      { type: mobileDragType, data: card },
      () => {
        setIsDragging(true);
        onDragStart?.(card);
      },
      () => {
        setIsDragging(false);
        onDragEnd?.();
      }
    );
    
    return cleanup;
  }, [card, onDragStart, onDragEnd, disableInteractions, mobileDragType]);

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
    if ((card.type === 'weapon' || card.type === 'shield') && 'fromSlot' in card && (card as any).fromSlot) {
      e.dataTransfer.setData('equipment', JSON.stringify(card));
    }
    onDragStart?.(card);
  };

  const handleDragEnd = () => {
    if (disableInteractions) return;
    setIsDragging(false);
    onDragEnd?.();
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (disableInteractions) return;
    if (card.type === 'monster') {
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
      case 'event':
        return <Scroll className="dh-card__icon text-violet-500" />;
    }
  };

  const getCardBorderColor = () => {
    // Class cards get golden border
    if (card.classCard) {
      return 'border-yellow-600 shadow-yellow-500/20';
    }
    
    switch (card.type) {
      case 'monster':
        return 'border-red-900';
      case 'weapon':
        return 'border-amber-900';
      case 'shield':
        return 'border-blue-900';
      case 'potion':
        return 'border-green-900';
      case 'amulet':
        return 'border-purple-900';
      case 'magic':
        return 'border-cyan-900';
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
  const showCombatOverlay = showBleedOverlay || showWeaponSwing || showShieldBlock;

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
        transition-all duration-200 ease-out
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
        ${card.type === 'event' ? 'shadow-violet-500/30 shadow-xl' : ''}
      `}>
        <div className="h-full flex flex-col">
          {/* Image Area - takes up different heights based on card type */}
          <div className={`relative ${
            ['event'].includes(card.type) ? 'h-[55%]' : 'h-[75%]'
          } bg-gradient-to-b from-muted to-card overflow-hidden transition-all`}>
            {card.image && (
              <img 
                src={card.image} 
                alt={card.name}
                draggable={false}
                className="w-full h-full object-cover select-none"
              />
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
                    <span
                      className="combat-overlay__shape combat-overlay__shape--bleed-drip"
                      data-stagger="1"
                    />
                    <span
                      className="combat-overlay__shape combat-overlay__shape--bleed-ring"
                      data-stagger="2"
                    />
                  </>
                )}
                {showWeaponSwing && (
                  <>
                    <span className="combat-overlay__shape combat-overlay__shape--swing" />
                    <span
                      className="combat-overlay__shape combat-overlay__shape--swing-echo"
                      data-stagger="1"
                    />
                    <span
                      className="combat-overlay__shape combat-overlay__shape--swing-spark"
                      data-stagger="2"
                    />
                  </>
                )}
                {showShieldBlock && (
                  <>
                    <span className="combat-overlay__shape combat-overlay__shape--block" />
                    <span
                      className="combat-overlay__shape combat-overlay__shape--block-ripple"
                      data-stagger="1"
                    />
                    <span
                      className="combat-overlay__shape combat-overlay__shape--block-spark"
                      data-stagger="2"
                    />
                  </>
                )}
              </div>
            )}
            
            {/* Card Type Icon - Moved to footer */}

            {/* STAT OVERLAYS */}
            {card.type === 'monster' && (
              <>
                {/* Attack - Top Left */}
                <div className="absolute top-1 left-1">
                  <div className="relative group flex items-center">
                    <div className="mr-1">
                      <Sword className="dh-card__icon text-red-500 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" />
                    </div>
                    <span className="dh-card__stat font-black text-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]">
                      {card.attack ?? card.value}
                    </span>
                  </div>
                </div>
                
                {/* HP - Top Right */}
                <div className="absolute top-1 right-1 flex flex-col items-end gap-0">
                  <div className="relative group flex items-center">
                    <span className="dh-card__stat font-black text-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)] mr-1">
                      {card.hp ?? card.value}
                    </span>
                    <div>
                      <Heart className="dh-card__icon text-red-500 fill-red-500 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" />
                    </div>
                  </div>

                  {/* HP Layers Indicator - Below HP */}
                  {card.hpLayers && card.hpLayers > 1 && (
                    <div className="flex gap-0.5 mt-1">
                      {[...Array(card.hpLayers)].map((_, i) => (
                        <div 
                          key={i}
                          className={`dh-card__layer-dot rounded-full border border-black shadow-sm ${
                            i < (card.currentLayer || 1) 
                              ? 'bg-red-500' 
                              : 'bg-gray-400'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {(card.type === 'weapon' || card.type === 'shield') && (
              <>
                {/* Attack/Defense Value - Top Left */}
                <div className="absolute top-1 left-1">
                  <div className="relative group flex items-center">
                    <div className="mr-1">
                      {card.type === 'weapon' ? (
                        <Sword className="dh-card__icon text-amber-400 fill-amber-400 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" />
                      ) : (
                        <Shield className="dh-card__icon text-blue-400 fill-blue-400 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" />
                      )}
                    </div>
                    <span className="dh-card__stat font-black text-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]">
                      {card.value}
                    </span>
                  </div>
                </div>

                {/* Durability - Top Right */}
                {(card.durability !== undefined || card.maxDurability !== undefined) && totalDurabilityDots > 0 && (
                  <div className="absolute top-1.5 right-1.5 flex flex-col items-end">
                    <div className="flex gap-0.5">
                      {Array.from({ length: totalDurabilityDots }).map((_, i) => {
                        const dotValue = i + 1;
                        const isFilled = dotValue <= currentDurability;
                        const dotClasses = [
                          'dh-card__durability-dot rounded-full border shadow-sm transition-colors',
                          isFilled
                            ? 'bg-amber-400 border-amber-500 shadow-amber-500/40'
                            : 'bg-slate-800/50 border-slate-600 opacity-50',
                        ]
                          .filter(Boolean)
                          .join(' ');
                        return (
                          <div
                            key={dotValue}
                            className={dotClasses}
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
          <div className="flex-1 p-1 flex flex-col items-center justify-start bg-card text-center overflow-hidden relative">
            <h3 className="dh-card__name font-serif font-semibold mb-1 w-full truncate px-1" title={card.name}>
              {card.name}
            </h3>
            
            {/* Magic Effect */}
            {card.type === 'magic' && (
              <div className="dh-card__body-text w-full text-muted-foreground px-1 overflow-y-auto">
                {card.magicEffect || card.description}
              </div>
            )}

            {/* Amulet Effect */}
            {card.type === 'amulet' && amuletEffectText && !showAmuletOverlay && (
              <div className="dh-card__body-text w-full text-muted-foreground px-1">
                {amuletEffectText}
              </div>
            )}
            {isPotionCard && potionDescription && (
              <div className="dh-card__body-text w-full text-muted-foreground px-1">
                {potionDescription}
              </div>
            )}

            {/* Event Choices */}
            {card.type === 'event' && card.eventChoices && (
              <div className="w-full flex flex-col gap-0.5 px-1 pr-0.5 max-h-20 overflow-y-auto">
                {card.eventChoices.map((choice, idx) => (
                  <div
                    key={idx}
                    className="dh-card__caption text-muted-foreground text-left break-words"
                  >
                    • {choice.text}
                  </div>
                ))}
              </div>
            )}
            
            {/* Footer type indicator - Icon */}
            <div className="absolute bottom-1 right-1 flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
              {isPermanentMagicCard && (
                <span className="dh-card__caption flex items-center gap-0.5 rounded-sm border border-cyan-400/60 bg-cyan-900/80 px-1 py-0.5 font-bold uppercase tracking-wide text-cyan-50 shadow-sm">
                  <Infinity className="dh-icon-inline" />
                  Perm
                </span>
              )}
              {getCardIcon()}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
