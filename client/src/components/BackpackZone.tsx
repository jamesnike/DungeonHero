import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import StackedCardPile from './StackedCardPile';
import { initMobileDrop } from '../utils/mobileDragDrop';
import { cn } from '@/lib/utils';
import { GameCardData } from './GameCard';

interface BackpackZoneProps {
  backpackCount: number;
  onDrop?: (card: GameCardData) => void;
  isDropTarget?: boolean;
  canDraw: boolean;
  isHandFull: boolean;
  onDraw?: () => void;
  onOpenViewer?: () => void;
  maxCapacity?: number;
}

const DEFAULT_MAX_CAPACITY = 10;

export default function BackpackZone({
  backpackCount,
  onDrop,
  isDropTarget,
  canDraw,
  isHandFull,
  onDraw,
  onOpenViewer,
  maxCapacity = DEFAULT_MAX_CAPACITY,
}: BackpackZoneProps) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragDepth, setDragDepth] = useState(0);
  const isOver = dragDepth > 0;

  useEffect(() => {
    if (!dropRef.current || !onDrop) return;

    const cleanup = initMobileDrop(
      dropRef.current,
      (dragData) => {
        if (dragData.type === 'card') {
          onDrop(dragData.data as GameCardData);
        }
      },
      ['card']
    );

    return cleanup;
  }, [onDrop]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (isDropTarget) {
      setDragDepth((prev) => prev + 1);
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
      setDragDepth((prev) => Math.max(0, prev - 1));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragDepth(0);
    const cardData = e.dataTransfer.getData('card');
    if (cardData) {
      onDrop?.(JSON.parse(cardData));
    }
  };

  const drawDisabled = !canDraw || backpackCount === 0 || isHandFull;
  const statusLabel = !canDraw
    ? '处理地下城以激活'
    : isHandFull
      ? '手牌已满'
      : backpackCount === 0
        ? '背包为空'
        : '可抽一张牌';

  return (
    <Card
      ref={dropRef}
      data-testid="slot-backpack"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'relative h-full w-full border-2 border-dashed border-border bg-gradient-to-br from-amber-900/40 via-amber-800/20 to-yellow-700/10 p-3 transition-all duration-200 flex flex-col gap-3',
        isDropTarget && 'border-primary border-4 bg-primary/10 animate-pulse',
        isDropTarget && isOver && 'ring-4 ring-primary bg-primary/20 scale-[1.01]'
      )}
    >
      <div
        className="relative flex-1 cursor-pointer rounded-xl border border-white/10 bg-black/10 transition hover:bg-black/20"
        onClick={onOpenViewer}
      >
        <StackedCardPile
          count={backpackCount}
          className="rounded-xl"
          label="Backpack"
          variant="muted"
        />
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-1 sm:p-2 text-white/90">
          <div className="flex items-center justify-between dh-hero-small uppercase tracking-wide">
            <span className="font-semibold">Backpack</span>
            <Badge className="bg-black/50 text-white font-mono dh-hero-chip px-1 sm:px-2">
              {backpackCount}/{maxCapacity}
            </Badge>
          </div>
          <div className="flex items-center justify-end dh-hero-chip font-medium">
            查看内容
          </div>
        </div>
      </div>

      <Button
        variant="secondary"
        disabled={drawDisabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!drawDisabled) {
            onDraw?.();
          }
        }}
        className="w-full font-semibold tracking-wide dh-hero-chip"
      >
        抽牌
      </Button>

      <p className="text-center dh-hero-small font-medium text-muted-foreground">
        {statusLabel}
      </p>
    </Card>
  );
}

