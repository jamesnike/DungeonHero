import { useRef, useState } from 'react';
import type { EternalRelic } from '@/game-core/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface EternalRelicBarProps {
  relics: EternalRelic[];
  onRelicClick: (relic: EternalRelic) => void;
}

const RELIC_ICON_SIZE = 32;
const LONG_PRESS_DELAY_MS = 400;

export default function EternalRelicBar({ relics, onRelicClick }: EternalRelicBarProps) {
  const [openRelicId, setOpenRelicId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);

  if (relics.length === 0) return null;

  const cancelLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent, relicId: string) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    cancelLongPressTimer();
    longPressedRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressedRef.current = true;
      setOpenRelicId(relicId);
      longPressTimerRef.current = null;
    }, LONG_PRESS_DELAY_MS);
  };

  const handlePointerEnd = (e: React.PointerEvent) => {
    cancelLongPressTimer();
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      if (longPressedRef.current) {
        setOpenRelicId(null);
      }
    }
  };

  const handleMouseEnter = (relicId: string) => {
    setOpenRelicId(relicId);
  };

  const handleMouseLeave = () => {
    setOpenRelicId(prev => (longPressedRef.current ? prev : null));
  };

  const handleClick = (relic: EternalRelic, e: React.MouseEvent) => {
    if (longPressedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressedRef.current = false;
      return;
    }
    onRelicClick(relic);
  };

  return (
    <div className="flex-shrink-0 relative w-full flex justify-center pointer-events-none" style={{ height: 0 }}>
      <div
        className="absolute flex items-center gap-1.5 pointer-events-auto z-20"
        style={{ bottom: 0, transform: 'translateY(50%)' }}
      >
        <TooltipProvider delayDuration={200}>
          {relics.map((relic) => (
            <Tooltip
              key={relic.id}
              open={openRelicId === relic.id}
              onOpenChange={(open) => {
                if (!open) {
                  setOpenRelicId(prev => (prev === relic.id ? null : prev));
                }
              }}
            >
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="relative rounded-full border-2 border-amber-400/70 bg-background/80 shadow-md hover:border-amber-300 hover:scale-110 transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 select-none touch-none"
                  style={{
                    width: RELIC_ICON_SIZE + 8,
                    height: RELIC_ICON_SIZE + 8,
                    padding: 3,
                    WebkitTouchCallout: 'none',
                    WebkitUserSelect: 'none',
                  }}
                  onClick={(e) => handleClick(relic, e)}
                  onPointerDown={(e) => handlePointerDown(e, relic.id)}
                  onPointerUp={handlePointerEnd}
                  onPointerCancel={handlePointerEnd}
                  onPointerLeave={handlePointerEnd}
                  onMouseEnter={() => handleMouseEnter(relic.id)}
                  onMouseLeave={handleMouseLeave}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <img
                    src={relic.image}
                    alt={relic.name}
                    className="w-full h-full rounded-full object-cover pointer-events-none select-none"
                    draggable={false}
                    style={{
                      WebkitTouchCallout: 'none',
                      WebkitUserSelect: 'none',
                      WebkitUserDrag: 'none',
                    } as React.CSSProperties}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                  <div className="absolute inset-0 rounded-full ring-1 ring-amber-500/30 pointer-events-none" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px]">
                <p className="font-semibold text-amber-300 text-xs">{relic.name}</p>
                <p className="text-xs text-muted-foreground">{relic.description}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>
    </div>
  );
}
