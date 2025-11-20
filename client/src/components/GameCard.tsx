import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skull, Sword, Shield, Heart, Coins, Sparkles, Zap, Calendar } from 'lucide-react';

export type CardType = 'monster' | 'weapon' | 'shield' | 'potion' | 'coin' | 'amulet' | 'skill' | 'event';

export interface GameCardData {
  id: string;
  type: CardType;
  name: string;
  value: number;
  image?: string;
  effect?: 'health' | 'attack' | 'defense'; // For amulets
  skillType?: 'instant' | 'permanent'; // For skill cards
  skillEffect?: string; // Description of skill effect
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
      case 'coin':
        return <Coins className="w-8 h-8 text-yellow-500" />;
      case 'amulet':
        return <Sparkles className="w-8 h-8 text-purple-500" />;
      case 'skill':
        return <Zap className="w-8 h-8 text-cyan-500" />;
      case 'event':
        return <Calendar className="w-8 h-8 text-pink-500" />;
    }
  };

  const getCardBorderColor = () => {
    switch (card.type) {
      case 'monster':
        return 'border-red-900';
      case 'weapon':
        return 'border-amber-900';
      case 'shield':
        return 'border-blue-900';
      case 'potion':
        return 'border-green-900';
      case 'coin':
        return 'border-yellow-900';
      case 'amulet':
        return 'border-purple-900';
      case 'skill':
        return 'border-cyan-900';
      case 'event':
        return 'border-pink-900';
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
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`
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
        width: 'clamp(100px, 15vw, 200px)', 
        height: 'clamp(140px, 21vw, 280px)',
        filter: isDragging ? 'brightness(1.1)' : 'none',
        transform: card.type === 'monster' ? `translateX(${getLayerShift()}px)` : undefined,
      }}
      data-testid={`card-${card.type}-${card.id}`}
    >
      <Card className={`
        w-full h-full border-4 ${getCardBorderColor()} overflow-hidden
        transition-shadow duration-200
        ${isDragging ? 'shadow-2xl' : 'shadow-lg hover:shadow-xl'}
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
          
          <div className="h-[40%] p-2 flex flex-col items-center justify-center bg-card">
            <h3 className="font-serif font-semibold text-sm md:text-base text-center" data-testid={`card-name-${card.id}`}>
              {card.name}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {card.type.charAt(0).toUpperCase() + card.type.slice(1)}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
