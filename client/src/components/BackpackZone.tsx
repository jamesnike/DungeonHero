import { memo, useEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import { Backpack as BackpackIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StackedCardPile from './StackedCardPile';
import { initMobileDrop, type DragData } from '../utils/mobileDragDrop';
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
  /**
   * Optional ref forwarded to the compact-mode button element so callers
   * (e.g. backpack→hand flight animation) can read its DOM rect when the
   * full-size hero-row backpack cell is not mounted (narrow layout).
   */
  compactCellRef?: Ref<HTMLButtonElement>;
}

function BackpackZoneInner({
  backpackCount,
  capacity,
  onDrop,
  isDropTarget,
  onOpenViewer,
  compact = false,
  compactStyle,
  compactCellRef,
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

  // Mobile: mirror onDragEnter/onDragLeave by tracking touch position over the
  // compact button so the scale-up "drop target" effect also works on touch.
  useEffect(() => {
    if (!compact || !isDropTarget) {
      setDragDepth(0);
      return;
    }

    let inside = false;
    const handleMobileMove = (e: Event) => {
      const detail = (e as CustomEvent).detail as DragData | undefined;
      if (!detail || detail.type !== 'card') return;
      const el = compactRef.current;
      if (!el) return;
      const cx = detail.clientX;
      const cy = detail.clientY;
      if (typeof cx !== 'number' || typeof cy !== 'number') return;
      const rect = el.getBoundingClientRect();
      const within = cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
      if (within !== inside) {
        inside = within;
        setDragDepth(within ? 1 : 0);
      }
    };
    const handleMobileEnd = () => {
      if (inside) {
        inside = false;
        setDragDepth(0);
      }
    };

    document.addEventListener('mobile-drag-move', handleMobileMove);
    document.addEventListener('mobile-drag-end', handleMobileEnd);
    return () => {
      document.removeEventListener('mobile-drag-move', handleMobileMove);
      document.removeEventListener('mobile-drag-end', handleMobileEnd);
    };
  }, [compact, isDropTarget]);

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
    // The visible "strip" is intentionally narrow (so it sits flush against
    // the screen's right edge), but a narrow strip is hard to hit while
    // dragging. We expand the drop hit-area leftward by giving the outer
    // button a larger transparent width; the visible strip is rendered as
    // a right-aligned inner span so the look stays exactly the same.
    //
    // The extension is ONLY applied while a drop-eligible card is being
    // dragged — otherwise the wider invisible area would intercept clicks
    // meant for hero/active-row cards underneath the right screen edge.
    const stripWidth =
      typeof compactStyle?.width === 'number' ? compactStyle.width : 22;
    const stripHeight =
      typeof compactStyle?.height === 'number' ? compactStyle.height : 100;
    const hitExtension = isDropTarget
      ? Math.max(48, Math.round(stripHeight * 0.4))
      : 0;
    const outerStyle: CSSProperties = {
      ...compactStyle,
      width: stripWidth + hitExtension,
    };
    const innerStyle: CSSProperties = { width: stripWidth, height: '100%' };

    return (
      <button
        ref={(el) => {
          compactRef.current = el;
          if (typeof compactCellRef === 'function') {
            compactCellRef(el);
          } else if (compactCellRef) {
            (compactCellRef as React.MutableRefObject<HTMLButtonElement | null>).current = el;
          }
        }}
        onClick={onOpenViewer}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid="slot-backpack-compact"
        className="group relative flex items-stretch justify-end bg-transparent border-0 p-0 cursor-pointer"
        style={outerStyle}
      >
        <span
          className={cn(
            'flex flex-col items-center justify-center rounded-l-lg border border-r-0 transition-all duration-150',
            isDropTarget && isOver
              ? 'border-amber-300 bg-amber-500/30 text-white ring-2 ring-amber-400/60 scale-110'
              : isDropTarget
                ? 'border-primary/50 bg-amber-700/30 text-amber-200 animate-pulse'
                : 'border-amber-400/30 bg-amber-800/20 text-amber-200/80 group-hover:bg-amber-700/30 group-hover:border-amber-400/50'
          )}
          style={innerStyle}
        >
          <BackpackIcon className="w-4 h-4" />
          {backpackCount > 0 && (
            <span className="mt-0.5 px-1 rounded text-[10px] font-bold leading-none text-white bg-amber-500/90 ring-1 ring-amber-200/70 shadow-sm">
              {backpackCount}
            </span>
          )}
        </span>
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
