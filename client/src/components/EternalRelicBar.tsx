import { useRef, useState } from 'react';
import type { EternalRelic } from '@/game-core/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface EternalRelicBarProps {
  relics: EternalRelic[];
  onRelicClick: (relic: EternalRelic) => void;
}

const RELIC_ICON_SIZE = 44;
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
                  className="dh-eternal-relic-sticker touch-none"
                  style={{
                    width: RELIC_ICON_SIZE,
                    height: RELIC_ICON_SIZE,
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
                    draggable={false}
                    style={{
                      WebkitTouchCallout: 'none',
                      WebkitUserSelect: 'none',
                      WebkitUserDrag: 'none',
                    } as React.CSSProperties}
                    onContextMenu={(e) => e.preventDefault()}
                  />
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
