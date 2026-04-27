import { useMemo, useRef, useState } from 'react';
import type { EternalRelic } from '@/game-core/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { dedupeRelics, getRelicStackedSuffix } from '@/lib/eternalRelics';
import { useGameViewport } from '@/contexts/GameViewportContext';

interface EternalRelicBarProps {
  relics: EternalRelic[];
  onRelicClick: (relic: EternalRelic, count: number) => void;
}

const RELIC_ICON_BASE_SIZE = 44;
const RELIC_REFERENCE_WIDTH = 1280;
const RELIC_REFERENCE_HEIGHT = 800;
const RELIC_SCALE_MIN = 0.6;
const RELIC_SCALE_MAX = 1.25;
const LONG_PRESS_DELAY_MS = 400;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export default function EternalRelicBar({ relics, onRelicClick }: EternalRelicBarProps) {
  const [openRelicId, setOpenRelicId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);
  const gameViewport = useGameViewport();

  const deduped = useMemo(() => dedupeRelics(relics), [relics]);

  // Scale icons + badge + gap with the constrained game viewport. Reference is
  // 44 px @ 1280×800; both axes are factored in (min ratio, gentle curve) so
  // very flat / short displays don't crowd the hero row, and very large
  // displays don't waste the relic art.
  const { iconSize, badgeSize, badgeFontSize, gapPx } = useMemo(() => {
    const widthRatio = gameViewport.width / RELIC_REFERENCE_WIDTH;
    const heightRatio = gameViewport.height / RELIC_REFERENCE_HEIGHT;
    const raw = Math.min(widthRatio, heightRatio);
    const scale = clamp(1 + (raw - 1) * 0.6, RELIC_SCALE_MIN, RELIC_SCALE_MAX);
    const size = Math.round(RELIC_ICON_BASE_SIZE * scale);
    return {
      iconSize: size,
      badgeSize: Math.max(14, Math.round(size * (18 / RELIC_ICON_BASE_SIZE))),
      badgeFontSize: Math.max(9, Math.round(size * (10 / RELIC_ICON_BASE_SIZE))),
      gapPx: Math.max(4, Math.round(size * (6 / RELIC_ICON_BASE_SIZE))),
    };
  }, [gameViewport.width, gameViewport.height]);

  if (deduped.length === 0) return null;

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

  const handleClick = (relic: EternalRelic, count: number, e: React.MouseEvent) => {
    if (longPressedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressedRef.current = false;
      return;
    }
    onRelicClick(relic, count);
  };

  return (
    <div className="flex-shrink-0 relative w-full flex justify-center pointer-events-none" style={{ height: 0 }}>
      <div
        className="absolute flex items-center pointer-events-auto z-20"
        style={{ bottom: 0, transform: 'translateY(50%)', gap: gapPx }}
      >
        <TooltipProvider delayDuration={200}>
          {deduped.map(({ relic, count }) => {
            const stackedSuffix = getRelicStackedSuffix(relic.id, count);
            return (
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
                    className="dh-eternal-relic-sticker touch-none relative"
                    style={{
                      width: iconSize,
                      height: iconSize,
                      WebkitTouchCallout: 'none',
                      WebkitUserSelect: 'none',
                    }}
                    onClick={(e) => handleClick(relic, count, e)}
                    onPointerDown={(e) => handlePointerDown(e, relic.id)}
                    onPointerUp={handlePointerEnd}
                    onPointerCancel={handlePointerEnd}
                    onPointerLeave={handlePointerEnd}
                    onMouseEnter={() => handleMouseEnter(relic.id)}
                    onMouseLeave={handleMouseLeave}
                    onContextMenu={(e) => e.preventDefault()}
                    data-testid={`eternal-relic-${relic.id}`}
                    data-stack-count={count}
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
                    {count > 1 && (
                      <span
                        className="absolute -top-1 -right-1 px-1 rounded-full bg-amber-500 text-white font-bold text-center border border-amber-200/70 shadow-[0_0_4px_rgba(0,0,0,0.5)] pointer-events-none"
                        data-testid={`eternal-relic-stack-${relic.id}`}
                        style={{
                          minWidth: badgeSize,
                          height: badgeSize,
                          fontSize: badgeFontSize,
                          lineHeight: `${badgeSize}px`,
                        }}
                      >
                        ×{count}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px]">
                  <p className="font-semibold text-amber-300 text-xs">{relic.name}</p>
                  <p className="text-xs text-muted-foreground">{relic.description}</p>
                  {stackedSuffix && (
                    <p className="text-xs text-amber-200 mt-1 font-medium">{stackedSuffix}</p>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </div>
    </div>
  );
}
