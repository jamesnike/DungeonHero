import { useCallback, useRef } from 'react';
import { consumePendingModalOrigin } from '@/lib/modalOriginAnchor';

/**
 * Wires a Radix DialogContent so its open/close zoom animation grows from a
 * pending "origin rect" (typically the cell that was clicked to open the
 * modal). See `lib/modalOriginAnchor.ts` for the producer side.
 *
 * Returns a ref callback you pass directly to `<DialogContent ref={...}>`.
 * The callback runs synchronously during commit (before the browser starts
 * the open animation), reads the pending origin via
 * `consumePendingModalOrigin()`, and writes `transformOrigin` directly on
 * the element. This guarantees the very first painted frame of the
 * `data-[state=open]:zoom-in-*` animation already uses the correct origin —
 * avoiding the visible "default-center → snap-to-origin" flash you'd get
 * from a useLayoutEffect/useEffect-based approach.
 *
 * Pair with `contentMotion="origin"` on `DialogContent`. If no origin rect
 * was set (e.g. modal opened programmatically), `transformOrigin` is left
 * unset and the default centered zoom plays — no regressions.
 */
export function useDialogOriginAnchor() {
  // Track the last element so we can re-apply on open/close transitions if
  // Radix re-uses the same DOM node across animation phases. (Radix unmounts
  // content after close-out, so the ref callback fires fresh on reopen and
  // a new origin is consumed each time.)
  const lastElRef = useRef<HTMLDivElement | null>(null);

  return useCallback((el: HTMLDivElement | null) => {
    lastElRef.current = el;
    if (!el) return;
    const rect = consumePendingModalOrigin();
    if (!rect) return;
    const dialogRect = el.getBoundingClientRect();
    if (dialogRect.width <= 0 || dialogRect.height <= 0) return;
    const cellCenterX = rect.x + rect.width / 2;
    const cellCenterY = rect.y + rect.height / 2;
    // Percentage transform-origin relative to the dialog's own box. Values
    // can fall outside [0, 100] when the cell is far from the modal — that's
    // valid CSS and produces the desired "scale outward from cell" effect.
    const xPct = ((cellCenterX - dialogRect.left) / dialogRect.width) * 100;
    const yPct = ((cellCenterY - dialogRect.top) / dialogRect.height) * 100;
    el.style.transformOrigin = `${xPct.toFixed(2)}% ${yPct.toFixed(2)}%`;
  }, []);
}
