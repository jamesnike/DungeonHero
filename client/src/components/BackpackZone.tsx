import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Backpack as BackpackIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StackedCardPile from './StackedCardPile';
import { initMobileDrop } from '../utils/mobileDragDrop';
import { cn } from '@/lib/utils';
import { GameCardData } from './GameCard';
import { useGameViewport } from '@/contexts/GameViewportContext';
import { FLAT_ASPECT_RATIO } from './game-board/constants';

interface BackpackZoneProps {
  backpackCount: number;
  capacity: number;
  onDrop?: (card: GameCardData) => void;
  isDropTarget?: boolean;
  onOpenViewer?: () => void;
  compact?: boolean;
  compactStyle?: CSSProperties;
}

function BackpackZoneInner({
  backpackCount,
  capacity,
  onDrop,
  isDropTarget,
  onOpenViewer,
  compact = false,
  compactStyle,
}: BackpackZoneProps) {
  const gameViewport = useGameViewport();
  const isFlat = gameViewport.width / gameViewport.height > FLAT_ASPECT_RATIO;
  const dropRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    if (!compact || !compactRef.current || !onDrop) return;
    const cleanup = initMobileDrop(
      compactRef.current,
      (dragData) => {
        if (dragData.type === 'card') {
          onDrop(dragData.data as GameCardData);
        }
      },
      ['card']
    );
    return cleanup;
  }, [compact, onDrop]);

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

  if (compact) {
    return (
      <button
        ref={compactRef}
        onClick={onOpenViewer}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid="slot-backpack-compact"
        className={cn(
          'relative flex flex-col items-center justify-center rounded-l-lg border border-r-0 transition-all duration-150',
          isDropTarget && isOver
            ? 'border-amber-300 bg-amber-500/30 text-white ring-2 ring-amber-400/60 scale-110'
            : isDropTarget
              ? 'border-primary/50 bg-amber-700/30 text-amber-200 animate-pulse'
              : 'border-amber-400/30 bg-amber-800/20 text-amber-200/80 hover:bg-amber-700/30 hover:border-amber-400/50'
        )}
        style={compactStyle}
      >
        <BackpackIcon className="w-4 h-4" />
        {backpackCount > 0 && (
          <span className="mt-0.5 text-[9px] font-bold leading-none text-amber-100">
            {backpackCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <Card
      ref={dropRef}
      data-testid="slot-backpack"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onOpenViewer}
      className={cn(
        'relative h-full w-full cursor-pointer overflow-hidden border-2 border-dashed border-border bg-gradient-to-br from-amber-900/40 via-amber-800/20 to-yellow-700/10 transition-[border-color,background-color,transform] duration-200',
        isDropTarget && 'border-primary border-4 bg-primary/10 animate-pulse',
        isDropTarget && isOver && 'ring-4 ring-primary bg-primary/20 scale-[1.01]',
        !isDropTarget && 'hover:scale-[1.01]'
      )}
    >
      {isFlat ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/90">
          <span className="dh-hero-small font-semibold uppercase tracking-wide">Backpack</span>
          <span className="font-mono font-bold text-lg">{backpackCount}</span>
        </div>
      ) : (
        <>
          <StackedCardPile
            count={backpackCount}
            className="rounded-xl"
            label="Backpack"
            variant="muted"
          />
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-1 sm:p-3 text-white/90">
            <div className="flex items-center justify-between dh-hero-small uppercase tracking-wide">
              <span className="font-semibold">Backpack</span>
              <Badge className="bg-black/50 text-white font-mono dh-hero-chip px-1 sm:px-2">
                {backpackCount}
              </Badge>
            </div>
            <div className="flex items-center justify-end dh-hero-chip font-medium">
              查看内容
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

export default memo(BackpackZoneInner);
