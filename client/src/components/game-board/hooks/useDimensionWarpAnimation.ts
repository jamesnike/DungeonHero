/**
 * useDimensionWarpAnimation — manages the 维度扭曲 (Dimension Warp) swap
 * choreography triggered by the `hero:dimensionWarp` side effect.
 *
 * Choreography (sequential, matches user spec "同时翻转，然后互换位置"):
 *   t = 0     ms : both overlays mounted at their original cells.
 *                  Active overlay shows GameCard(activeCard) face-up;
 *                  Preview overlay shows PreviewCardBack(previewCard) typed back.
 *   t = 0-350 ms : both overlays rotateY 0° → 180° in place. After this:
 *                  Active overlay shows PreviewCardBack(activeCard) (typed back);
 *                  Preview overlay shows GameCard(previewCard) (revealed face).
 *   t = 350-750ms: both overlays translate to each other's cell while staying
 *                  at rotateY 180°.
 *   t = ~800 ms  : overlays unmount. The cells underneath already render the
 *                  exact same content (active cell = revealed previewCard,
 *                  preview cell = typed back of activeCard), so the hand-off
 *                  is visually seamless.
 *
 * The reducer applies the swap synchronously before this hook fires, so by
 * the time the overlays come down the cells underneath already render the
 * new contents — the player only ever sees the choreography on top.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useGameEvent } from '@/hooks/useGameEngine';
import type { GameCardData } from '@/components/GameCard';

/** Total wall-clock duration matching the choreography above + 50ms safety buffer. */
export const DIMENSION_WARP_ANIMATION_DURATION_MS = 800;

export interface DimensionWarpFlight {
  id: string;
  cellIndex: number;
  activeCard: GameCardData;
  previewCard: GameCardData;
  /** Active-row cell rect captured at trigger time (viewport-space). */
  activeRect: { left: number; top: number; width: number; height: number };
  /** Preview-row cell rect captured at trigger time (viewport-space). */
  previewRect: { left: number; top: number; width: number; height: number };
}

export function useDimensionWarpAnimation(
  activeCellRefs: MutableRefObject<Array<HTMLDivElement | null>>,
  previewCellRefs: MutableRefObject<Array<HTMLDivElement | null>>,
) {
  const [warps, setWarps] = useState<DimensionWarpFlight[]>([]);
  const timeoutsRef = useRef<Set<number>>(new Set());

  const removeWarp = useCallback((id: string) => {
    setWarps(prev => prev.filter(w => w.id !== id));
  }, []);

  useGameEvent('hero:dimensionWarp', ({ cellIndex, activeCard, previewCard }) => {
    const activeCell = activeCellRefs.current[cellIndex];
    const previewCell = previewCellRefs.current[cellIndex];
    if (!activeCell || !previewCell) return;
    const aRect = activeCell.getBoundingClientRect();
    const pRect = previewCell.getBoundingClientRect();
    if (aRect.width === 0 || aRect.height === 0) return;
    if (pRect.width === 0 || pRect.height === 0) return;

    const id = `dim-warp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const flight: DimensionWarpFlight = {
      id,
      cellIndex,
      activeCard,
      previewCard,
      activeRect: { left: aRect.left, top: aRect.top, width: aRect.width, height: aRect.height },
      previewRect: { left: pRect.left, top: pRect.top, width: pRect.width, height: pRect.height },
    };
    setWarps(prev => [...prev, flight]);

    const handle = window.setTimeout(() => {
      timeoutsRef.current.delete(handle);
      removeWarp(id);
    }, DIMENSION_WARP_ANIMATION_DURATION_MS);
    timeoutsRef.current.add(handle);
  });

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach(h => window.clearTimeout(h));
      timeouts.clear();
    };
  }, []);

  return { dimensionWarps: warps };
}
