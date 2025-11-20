import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skull, Sword, Shield, Heart, Coins, Sparkles } from 'lucide-react';

export type CardType = 'monster' | 'weapon' | 'shield' | 'potion' | 'coin' | 'amulet';

export interface GameCardData {
  id: string;
  type: CardType;
  name: string;
  value: number;
  image?: string;
  effect?: 'health' | 'attack' | 'defense'; // For amulets
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
      default:
        return 'border-card-border';
    }
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
            <div className="absolute top-2 left-2">
              <div className="bg-background/80 backdrop-blur-sm rounded-full w-8 h-8 flex items-center justify-center">
                <span className="font-mono font-bold text-sm" data-testid={`card-value-${card.id}`}>
                  {card.value}
                </span>
              </div>
            </div>
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
