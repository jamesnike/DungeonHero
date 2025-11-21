import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Skull, Sword, Shield, Heart, Sparkles, Zap, Scroll } from 'lucide-react';
import { initMobileDrag } from '../utils/mobileDragDrop';

export type CardType = 'monster' | 'weapon' | 'shield' | 'potion' | 'amulet' | 'magic' | 'event';

export interface GameCardData {
  id: string;
  type: CardType;
  name: string;
  value: number;
  image?: string;
  effect?: 'health' | 'attack' | 'defense'; // For amulets
  magicType?: 'instant' | 'permanent'; // For magic cards
  magicEffect?: string; // Description of magic effect
  eventChoices?: { text: string; effect: string }[]; // For event cards
  // Monster-specific properties
  attack?: number; // Monster attack value
  hp?: number; // Monster current HP
  maxHp?: number; // Monster original HP
  hpLayers?: number; // Number of HP layers (1-3)
  currentLayer?: number; // Current layer (starts at 1)
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
}

export default function GameCard({ card, onDragStart, onDragEnd, onWeaponDrop, isWeaponDropTarget, className = '' }: GameCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Set up mobile drag support
  useEffect(() => {
    if (!cardRef.current) return;
    
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
  }, [card, onDragStart, onDragEnd]);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('card', JSON.stringify(card));
    onDragStart?.(card);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    onDragEnd?.();
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (card.type === 'monster') {
      e.preventDefault();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
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
        return <Skull className="w-8 h-8 text-destructive" />;
      case 'weapon':
        return <Sword className="w-8 h-8 text-amber-500" />;
      case 'shield':
        return <Shield className="w-8 h-8 text-blue-500" />;
      case 'potion':
        return <Heart className="w-8 h-8 text-green-500" />;
      case 'amulet':
        return <Sparkles className="w-8 h-8 text-purple-500" />;
      case 'magic':
        return <Zap className="w-8 h-8 text-cyan-500" />;
      case 'event':
        return <Scroll className="w-8 h-8 text-violet-500" />;
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

  // Calculate visual shift based on layer damage
  const getLayerShift = () => {
    if (card.type !== 'monster' || !card.hpLayers || !card.currentLayer) return 0;
    // Each depleted layer shifts the card right
    const depletedLayers = (card.currentLayer || 1) - 1;
    return depletedLayers * 15; // 15px per layer
  };

  return (
    <div
      ref={cardRef}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`
        w-full h-full
        cursor-grab active:cursor-grabbing
        transition-all duration-200 ease-out
        ${isDragging 
          ? 'opacity-60 scale-95 -rotate-6 -translate-y-2' 
          : 'hover:scale-105 hover:-translate-y-1 hover:rotate-1'
        }
        ${card.type === 'monster' && isWeaponDropTarget ? 'ring-4 ring-primary scale-105' : ''}
        ${className}
      `}
      style={{
        filter: isDragging ? 'brightness(1.1)' : 'none',
        transform: card.type === 'monster' ? `translateX(${getLayerShift()}px)` : undefined,
      }}
      data-testid={`card-${card.type}-${card.id}`}
    >
      <Card className={`
        w-full h-full border-4 ${getCardBorderColor()} overflow-hidden
        transition-shadow duration-200
        ${isDragging ? 'shadow-2xl' : 'shadow-lg hover:shadow-xl'}
        ${card.type === 'event' ? 'shadow-violet-500/30 shadow-xl' : ''}
      `}>
        <div className="h-full flex flex-col">
          <div className="relative h-[60%] bg-gradient-to-b from-muted to-card overflow-hidden">
            {card.image && (
              <img 
                src={card.image} 
                alt={card.name}
                className="w-full h-full object-cover"
              />
            )}
            <div className="absolute top-2 right-2">
              {getCardIcon()}
            </div>
            {/* For monsters, show attack and HP; for others show value */}
            {card.type === 'monster' && card.attack !== undefined && card.hp !== undefined ? (
              <>
                {/* HP Layers in background */}
                {card.hpLayers && card.hpLayers > 1 && (
                  <div className="absolute inset-0 flex items-center justify-end pr-12 pointer-events-none">
                    <div className="flex gap-1">
                      {[...Array(card.hpLayers)].map((_, i) => (
                        <div 
                          key={i} 
                          className={`text-6xl font-bold ${
                            i < (card.currentLayer || 1) - 1 
                              ? 'text-muted/20' 
                              : 'text-foreground/10'
                          }`}
                        >
                          {card.hpLayers - i}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Attack value (sword icon) */}
                <div className="absolute top-2 left-2">
                  <div className="bg-background/90 backdrop-blur-sm rounded px-2 py-1 flex items-center gap-1">
                    <Sword className="w-4 h-4 text-amber-500" />
                    <span className="font-mono font-bold text-sm" data-testid={`card-attack-${card.id}`}>
                      {card.attack}
                    </span>
                  </div>
                </div>
                
                {/* HP value (heart icon) */}
                <div className="absolute bottom-2 left-2">
                  <div className="bg-background/90 backdrop-blur-sm rounded px-2 py-1 flex items-center gap-1">
                    <Heart className="w-4 h-4 text-red-500" />
                    <span className="font-mono font-bold text-sm" data-testid={`card-hp-${card.id}`}>
                      {card.hp}/{card.maxHp}
                    </span>
                  </div>
                </div>
                
                {/* HP Layer dots */}
                {card.hpLayers && (
                  <div className="absolute bottom-2 right-2 flex gap-1">
                    {[...Array(card.hpLayers)].map((_, i) => (
                      <div 
                        key={i}
                        className={`w-2 h-2 rounded-full ${
                          i < (card.currentLayer || 1) 
                            ? 'bg-red-500' 
                            : 'bg-muted/30'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Durability background numbers for weapons/shields */}
                {(card.type === 'weapon' || card.type === 'shield') && card.durability && card.maxDurability && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="flex gap-2">
                      {[...Array(card.maxDurability)].map((_, i) => (
                        <div 
                          key={i} 
                          className={`text-5xl font-bold ${
                            i < card.durability
                              ? 'text-foreground/10' 
                              : 'text-muted/5'
                          }`}
                        >
                          {card.maxDurability - i}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Value indicator */}
                <div className="absolute top-2 left-2">
                  <div className="bg-background/80 backdrop-blur-sm rounded-full w-8 h-8 flex items-center justify-center">
                    <span className="font-mono font-bold text-sm" data-testid={`card-value-${card.id}`}>
                      {card.value}
                    </span>
                  </div>
                </div>
                
                {/* Durability indicator for weapons/shields */}
                {(card.type === 'weapon' || card.type === 'shield') && card.durability && card.maxDurability && (
                  <div className="absolute bottom-2 left-2">
                    <div className="bg-background/90 backdrop-blur-sm rounded px-2 py-1 flex items-center gap-1">
                      <Shield className="w-3 h-3 text-blue-500" />
                      <span className="font-mono font-bold text-xs" data-testid={`card-durability-${card.id}`}>
                        {card.durability}/{card.maxDurability}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          
          <div className="h-[40%] p-1 flex flex-col items-start justify-between bg-card">
            <h3 className="font-serif font-semibold text-xs text-center w-full" data-testid={`card-name-${card.id}`}>
              {card.name}
            </h3>
            
            {/* Yu-Gi-Oh style card effect description */}
            <div className="flex-1 w-full px-1 overflow-y-auto">
              <p className="text-[10px] leading-tight text-muted-foreground text-center">
                {/* Monster descriptions */}
                {card.type === 'monster' && (
                  <>ATK: {card.attack} | HP: {card.hp}<br/>
                  {card.hpLayers && card.hpLayers > 1 && `Has ${card.hpLayers} HP layers. `}
                  A fearsome {card.name.toLowerCase()} that blocks your path.</>
                )}
                
                {/* Weapon descriptions */}
                {card.type === 'weapon' && (
                  <>DMG: {card.value} | Uses: {card.durability || 1}<br/>
                  {card.healOnKill && `Heals ${card.healOnKill} HP on kill. `}
                  {card.description || `Deals ${card.value} damage to monsters.`}</>
                )}
                
                {/* Shield descriptions */}
                {card.type === 'shield' && (
                  <>DEF: {card.value} | Uses: {card.durability || 1}<br/>
                  {card.damageReflect && `Reflects ${card.damageReflect} damage. `}
                  {card.description || `Blocks ${card.value} damage from attacks.`}</>
                )}
                
                {/* Potion descriptions */}
                {card.type === 'potion' && (
                  <>Healing: +{card.value} HP<br/>
                  Restores your health when consumed. Use wisely in battle.</>
                )}
                
                {/* Amulet descriptions */}
                {card.type === 'amulet' && (
                  <>Bonus: +{card.value} {card.effect}<br/>
                  {card.description || 
                    (card.effect === 'health' ? 'Increases maximum health.' :
                     card.effect === 'attack' ? 'Boosts weapon damage.' :
                     'Enhances shield defense.')}</>
                )}
                
                {/* Magic card descriptions */}
                {card.type === 'magic' && (
                  <>Type: {card.magicType || 'Instant'}<br/>
                  {card.magicEffect || card.description || 'Powerful magical effect.'}</>
                )}
                
                {/* Event descriptions */}
                {card.type === 'event' && (
                  <>Event Card<br/>
                  {card.description || 'Make a choice that will affect your journey.'}</>
                )}
              </p>
            </div>
            
            <p className="text-[10px] text-muted-foreground/70 text-center w-full border-t pt-0.5">
              [{card.type.toUpperCase()}{card.classCard ? ' • KNIGHT' : ''}]
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
