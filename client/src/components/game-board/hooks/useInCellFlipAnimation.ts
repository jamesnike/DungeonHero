/**
 * useInCellFlipAnimation — manages in-place flip animations triggered by
 * `card:flippedInCell` side effects (emitted from `reduceApplyCardFlip` for
 * `destination === 'stay'` flips).
 *
 * The reducer updates `state.activeCards[cellIndex]` to the new card
 * synchronously; this hook captures the cell's viewport rect at the time of
 * the flip and exposes a transient `inCellFlips` array that the
 * `InCellFlipOverlayLayer` paints on top of the cell to play the 3D flip.
 *
 * The overlay covers the cell during the animation, so the underlying
 * "post-flip" card (already rendered in `ActiveCell`) is hidden until the
 * flip completes.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useGameEvent } from '@/hooks/useGameEngine';
import type { GameCardData } from '@/components/GameCard';

/** Total visible duration: 350ms idle + 700ms rotateY + 50ms safety buffer. */
const FLIP_ANIMATION_DURATION_MS = 1100;

export interface InCellFlip {
  id: string;
  cellIndex: number;
  fromCard: GameCardData;
  toCard: GameCardData;
  rect: { left: number; top: number; width: number; height: number };
}

export function useInCellFlipAnimation(
  activeCellRefs: MutableRefObject<Array<HTMLDivElement | null>>,
) {
  const [inCellFlips, setInCellFlips] = useState<InCellFlip[]>([]);
  const timeoutsRef = useRef<Set<number>>(new Set());

  const removeFlip = useCallback((id: string) => {
    setInCellFlips(prev => prev.filter(f => f.id !== id));
  }, []);

  useGameEvent('card:flippedInCell', ({ cellIndex, fromCard, toCard }) => {
    const cellEl = activeCellRefs.current[cellIndex];
    if (!cellEl) return;
    const r = cellEl.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;

    const id = `incell-flip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const flip: InCellFlip = {
      id,
      cellIndex,
      fromCard,
      toCard,
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
    };
    setInCellFlips(prev => [...prev, flip]);

    const handle = window.setTimeout(() => {
      timeoutsRef.current.delete(handle);
      removeFlip(id);
    }, FLIP_ANIMATION_DURATION_MS);
    timeoutsRef.current.add(handle);
  });

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach(h => window.clearTimeout(h));
      timeouts.clear();
    };
  }, []);

  return { inCellFlips };
}
