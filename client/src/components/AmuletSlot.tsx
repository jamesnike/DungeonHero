import { Card } from '@/components/ui/card';
import { Sparkles, Heart, Sword, Shield } from 'lucide-react';

interface AmuletSlotProps {
  amulet: { 
    name: string; 
    value: number; 
    image?: string; 
    type: 'amulet'; 
    effect: 'health' | 'attack' | 'defense';
  } | null;
  onDrop?: (card: any) => void;
  isDropTarget?: boolean;
}

export default function AmuletSlot({ amulet, onDrop, isDropTarget }: AmuletSlotProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const cardData = e.dataTransfer.getData('card');
    if (cardData) {
      const card = JSON.parse(cardData);
      if (card.type === 'amulet') {
        onDrop?.(card);
      }
    }
  };

  const getEffectIcon = () => {
    if (!amulet) return <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground" />;
    switch (amulet.effect) {
      case 'health':
        return <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />;
      case 'attack':
        return <Sword className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />;
      case 'defense':
        return <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />;
    }
  };

  const getEffectLabel = () => {
    if (!amulet) return null;
    switch (amulet.effect) {
      case 'health':
        return `+${amulet.value} Max HP`;
      case 'attack':
        return `+${amulet.value} ATK`;
      case 'defense':
        return `+${amulet.value} DEF`;
    }
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ 
        width: 'clamp(80px, 12vw, 160px)', 
        height: 'clamp(112px, 16.8vw, 224px)' 
      }}
      data-testid="slot-amulet"
    >
      <Card className={`
        w-full h-full border-4 border-dashed overflow-hidden
        transition-all duration-200
        ${amulet ? 'border-purple-900 bg-purple-950/20' : 'border-muted bg-muted/20'}
        ${isDropTarget ? 'scale-105 border-primary animate-pulse' : ''}
      `}>
        <div className="h-full flex flex-col items-center justify-center p-2">
          {amulet ? (
            <>
              {amulet.image && (
                <img 
                  src={amulet.image} 
                  alt={amulet.name}
                  className="w-full h-[60%] object-contain mb-2"
                />
              )}
              <div className="flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded px-2 py-1">
                {getEffectIcon()}
                <span className="text-xs sm:text-sm font-bold">{getEffectLabel()}</span>
              </div>
              <span className="text-[8px] sm:text-xs text-center mt-1 text-muted-foreground line-clamp-1">
                {amulet.name}
              </span>
            </>
          ) : (
            <>
              <Sparkles className="w-8 h-8 sm:w-12 sm:h-12 md:w-16 md:h-16 text-muted-foreground mb-2" />
              <span className="text-[8px] sm:text-xs md:text-sm text-muted-foreground font-semibold">
                Amulet
              </span>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
