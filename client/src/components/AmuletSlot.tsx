import { Card } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import React, { useEffect, useMemo, useRef } from 'react';
import { initMobileDrop } from '../utils/mobileDragDrop';
import GameCard, { GameCardData } from './GameCard';

interface AmuletSlotProps {
  amulets: (GameCardData & { type: 'amulet' })[];
  maxSlots?: number;
  onDrop?: (card: any) => void;
  isDropTarget?: boolean;
  onDragStart?: (card: GameCardData) => void;
  onDragEnd?: () => void;
}

export default function AmuletSlot({
  amulets,
  maxSlots = 2,
  onDrop,
  isDropTarget,
  onDragStart,
  onDragEnd,
}: AmuletSlotProps) {
  const [dragDepth, setDragDepth] = React.useState(0);
  const isOver = dragDepth > 0;
  const amuletRef = useRef<HTMLDivElement>(null);
  const effectiveMaxSlots = Math.max(1, maxSlots);

  const preparedAmulets = useMemo(() => {
    return amulets
      .slice(-effectiveMaxSlots)
      .map(card => ({ ...card, fromSlot: 'amulet' as const }));
  }, [amulets, effectiveMaxSlots]);
  const hasAmulets = preparedAmulets.length > 0;
  const isStackedView = preparedAmulets.length >= 2;
  
  // Set up mobile drop support
  useEffect(() => {
    if (!amuletRef.current || !onDrop) return;
    
    const cleanup = initMobileDrop(
      amuletRef.current,
      (dragData) => {
        if (dragData.type === 'card' && dragData.data.type === 'amulet') {
          onDrop(dragData.data);
        }
      },
      ['card'] // Accept card drops
    );
    
    return cleanup;
  }, [onDrop]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (isDropTarget) {
      setDragDepth(prev => prev + 1);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (isDropTarget && dragDepth === 0) {
      setDragDepth(1);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (isDropTarget) {
      setDragDepth(prev => Math.max(0, prev - 1));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragDepth(0);
    const cardData = e.dataTransfer.getData('card');
    if (cardData) {
      const card = JSON.parse(cardData);
      if (card.type === 'amulet') {
        onDrop?.(card);
      }
    }
  };

  const getEffectIcon = () => {
    // Used for empty state only
    return <Sparkles className="w-8 h-8 sm:w-12 sm:h-12 md:w-16 md:h-16 text-muted-foreground mb-2" />;
  };

  const getStackTransform = (index: number): React.CSSProperties => {
    if (!isStackedView) {
      return { zIndex: 10 };
    }

    const isTopCard = index === preparedAmulets.length - 1;

    if (isTopCard) {
      return {
        zIndex: 30,
        transform: 'translateY(28%)',
      };
    }

    return {
      zIndex: 20,
      transform: 'translateY(-6%)',
    };
  };

  const dropStateClass = isDropTarget
    ? isOver
      ? 'ring-4 ring-primary bg-primary/20 scale-[1.02]'
      : 'ring-2 ring-primary/50 bg-primary/10'
    : 'border border-muted/40';

  return (
    <div 
      ref={amuletRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative h-full w-full rounded-xl transition-all duration-200 ease-out ${dropStateClass}`}
      data-testid="slot-amulet"
    >
      {hasAmulets ? (
        <div className="relative h-full w-full overflow-visible">
          {preparedAmulets.map((card, index) => {
            const isTopCard = index === preparedAmulets.length - 1;
            return (
              <div
                key={card.id}
                className="absolute inset-0"
                style={getStackTransform(index)}
              >
                <GameCard 
                  card={card}
                  onDragStart={(dragCard) => onDragStart?.(dragCard)}
                  onDragEnd={onDragEnd}
                  amuletDescriptionVariant={!isTopCard && isStackedView ? 'topThird' : undefined}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <Card className={`
          h-full w-full border-4 border-dashed overflow-hidden
          transition-all duration-200
          ${isDropTarget ? 'border-primary animate-pulse bg-primary/10' : 'border-muted bg-muted/20'}
          ${isDropTarget && isOver ? 'scale-105 ring-4 ring-primary bg-primary/20' : ''}
        `}>
          <div className="h-full flex flex-col items-center justify-center p-2">
            <Sparkles className="w-8 h-8 sm:w-12 sm:h-12 md:w-16 md:h-16 text-muted-foreground mb-2" />
            <span className="text-[8px] sm:text-xs md:text-sm text-muted-foreground font-semibold">
              Amulet
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
