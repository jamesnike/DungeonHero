import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Skull, Sword, Shield, Heart, Sparkles, Zap, Scroll } from 'lucide-react';
import { initMobileDrag } from '../utils/mobileDragDrop';

export type CardType = 'monster' | 'weapon' | 'shield' | 'potion' | 'amulet' | 'magic' | 'event' | 'skill' | 'coin';

export type AmuletEffectId = 'heal' | 'balance' | 'life' | 'guardian' | 'flash' | 'strength';

export type AmuletAuraBonus = {
  attack?: number;
  defense?: number;
  maxHp?: number;
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
  skillType?: 'instant' | 'permanent'; // For class skills
  skillEffect?: string; // Description of skill effect
  eventChoices?: { text: string; effect: string }[]; // For event cards
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
  const cardRef = useRef<HTMLDivElement>(null);
  const totalDurabilityDots = Math.max(card.maxDurability ?? card.durability ?? 0, 0);
  const currentDurability = Math.max(card.durability ?? 0, 0);
  const engagedMonster = isEngaged && card.type === 'monster';

  // Set up mobile drag support
  useEffect(() => {
    if (disableInteractions || !cardRef.current) return;
    
    const cleanup = initMobileDrag(
      cardRef.current,
      { type: 'card', data: card },
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
  }, [card, onDragStart, onDragEnd, disableInteractions]);

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

  const getCardIcon = () => {
    switch (card.type) {
      case 'monster':
        return <Skull className="w-6 h-6 text-destructive" />;
      case 'weapon':
        return <Sword className="w-6 h-6 text-amber-500" />;
      case 'shield':
        return <Shield className="w-6 h-6 text-blue-500" />;
      case 'potion':
        return <Heart className="w-6 h-6 text-green-500" />;
      case 'amulet':
        return <Sparkles className="w-6 h-6 text-purple-500" />;
      case 'magic':
        return <Zap className="w-6 h-6 text-cyan-500" />;
      case 'event':
        return <Scroll className="w-6 h-6 text-violet-500" />;
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
      className={`
        w-full h-full
        cursor-pointer active:cursor-grabbing
        transition-all duration-200 ease-out
        ${isDragging 
          ? 'opacity-60 scale-95 -rotate-6 -translate-y-2' 
          : 'hover:scale-105 hover:-translate-y-1 hover:rotate-1'
        }
        ${card.type === 'monster' && isWeaponDropTarget ? 'ring-4 ring-primary scale-105' : ''}
        ${engagedMonster ? 'engaged-monster' : ''}
        ${className}
      `}
      style={{
        filter: isDragging ? 'brightness(1.1)' : 'none',
        // transform handled by GameBoard wrapper for fury sliding
      }}
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
              <div className="absolute top-1.5 left-1.5 right-1.5 text-[12px] sm:text-[13px] leading-tight font-semibold text-black text-center px-1.5 py-0.5 tracking-wide pointer-events-none select-none drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]">
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
                      <Sword className="w-5 h-5 text-red-500 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" />
                    </div>
                    <span className="font-black text-xl text-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]">
                      {card.attack ?? card.value}
                    </span>
                  </div>
                </div>
                
                {/* HP - Top Right */}
                <div className="absolute top-1 right-1 flex flex-col items-end gap-0">
                  <div className="relative group flex items-center">
                    <span className="font-black text-xl text-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)] mr-1">
                      {card.hp ?? card.value}
                    </span>
                    <div>
                      <Heart className="w-5 h-5 text-red-500 fill-red-500 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" />
                    </div>
                  </div>

                  {/* HP Layers Indicator - Below HP */}
                  {card.hpLayers && card.hpLayers > 1 && (
                    <div className="flex gap-0.5 mt-1">
                      {[...Array(card.hpLayers)].map((_, i) => (
                        <div 
                          key={i}
                          className={`w-2 h-2 rounded-full border border-black shadow-sm ${
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
                        <Sword className="w-5 h-5 text-amber-400 fill-amber-400 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" />
                      ) : (
                        <Shield className="w-5 h-5 text-blue-400 fill-blue-400 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" />
                      )}
                    </div>
                    <span className="font-black text-xl text-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]">
                      {card.value}
                    </span>
                  </div>
                </div>

                {/* Durability - Top Right */}
                {(card.durability !== undefined || card.maxDurability !== undefined) && totalDurabilityDots > 0 && (
                  <div className="absolute top-1.5 right-1.5 flex flex-col items-end">
                    <div className="flex gap-0.5">
                      {Array.from({ length: totalDurabilityDots }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-2 h-2 rounded-full border shadow-sm ${
                            i < currentDurability
                              ? 'bg-amber-400 border-amber-500 shadow-amber-500/40'
                              : 'bg-slate-800/60 border-slate-600'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {card.type === 'potion' && (
              <div className="absolute bottom-2 w-full flex justify-center">
                <div className="relative group flex items-center">
                  <span className="font-black text-xl text-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)] mr-1">
                    +{card.value}
                  </span>
                  <Heart className="w-5 h-5 text-green-500 fill-green-500 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" />
                </div>
              </div>
            )}
          </div>
          
          {/* Text Area */}
          <div className={`flex-1 p-1 flex flex-col items-center justify-start bg-card text-center overflow-hidden relative`}>
            <h3 className="font-serif font-semibold text-xs leading-tight mb-1 w-full truncate px-1" title={card.name}>
              {card.name}
            </h3>
            
            {/* Magic Effect */}
            {card.type === 'magic' && (
              <div className="w-full text-[10px] leading-tight text-muted-foreground px-1 overflow-y-auto">
                {card.magicEffect || card.description}
              </div>
            )}

            {/* Amulet Effect */}
            {card.type === 'amulet' && amuletEffectText && !showAmuletOverlay && (
              <div className="w-full text-[10px] leading-tight text-muted-foreground px-1">
                {amuletEffectText}
              </div>
            )}

            {/* Event Choices */}
            {card.type === 'event' && card.eventChoices && (
              <div className="w-full flex flex-col gap-0.5 px-1 pr-0.5 max-h-20 overflow-y-auto">
                {card.eventChoices.map((choice, idx) => (
                  <div
                    key={idx}
                    className="text-[9px] leading-tight text-muted-foreground text-left break-words"
                  >
                    • {choice.text}
                  </div>
                ))}
              </div>
            )}
            
            {/* Footer type indicator - Icon */}
            <div className="absolute bottom-1 right-1 opacity-50 hover:opacity-100 transition-opacity">
              {getCardIcon()}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
