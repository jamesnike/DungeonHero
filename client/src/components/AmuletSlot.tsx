import { Card } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { initMobileDrop } from '../utils/mobileDragDrop';
import GameCard, { GameCardData } from './GameCard';

const BASE_AMULET_WIDTH = 220;
const AMULET_SCALE_MIN = 0.7;
const AMULET_SCALE_MAX = 1.3;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface AmuletSlotProps {
  amulets: (GameCardData & { type: 'amulet' })[];
  maxSlots?: number;
  onDrop?: (card: any) => void;
  isDropTarget?: boolean;
  onDragStart?: (card: GameCardData) => void;
  onDragEnd?: () => void;
  onCardClick?: (card: GameCardData) => void;
  scaleMultiplier?: number;
}

export default function AmuletSlot({
  amulets,
  maxSlots = 2,
  onDrop,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onCardClick,
  scaleMultiplier = 1,
}: AmuletSlotProps) {
  const [dragDepth, setDragDepth] = React.useState(0);
  const isOver = dragDepth > 0;
  const amuletRef = useRef<HTMLDivElement>(null);
  const [slotScale, setSlotScale] = useState(1);
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

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const target = amuletRef.current;
    if (!target) {
      return;
    }
    const updateScale = () => {
      const { width } = target.getBoundingClientRect();
      if (!width) return;
      setSlotScale(prev => {
        const next = clamp(width / BASE_AMULET_WIDTH, AMULET_SCALE_MIN, AMULET_SCALE_MAX);
        return Math.abs(prev - next) > 0.01 ? next : prev;
      });
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const appliedSlotScale = clamp(
    slotScale * scaleMultiplier,
    AMULET_SCALE_MIN * Math.min(1, scaleMultiplier),
    AMULET_SCALE_MAX * Math.max(1, scaleMultiplier),
  );

  return (
    <div 
      ref={amuletRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative h-full w-full rounded-xl transition-all duration-200 ease-out ${dropStateClass}`}
      data-testid="slot-amulet"
      style={{ '--dh-hero-instance-scale': appliedSlotScale.toString() } as CSSProperties}
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
                  onClick={() => onCardClick?.(card)}
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
          <div className="h-full flex flex-col items-center justify-center gap-2 p-2">
            <Sparkles className="dh-hero-icon text-muted-foreground" />
            <span className="dh-hero-chip text-muted-foreground font-medium">
              Amulet
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
