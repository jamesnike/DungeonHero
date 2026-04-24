/**
 * Per-click "origin anchor" passed from a cell click to its modal.
 *
 * Why a module-scoped singleton instead of props/context:
 *   The click handler that opens a modal (BackpackZone, ClassDeck cell,
 *   GameHeader deck button) is structurally far away from the modal that
 *   actually renders (BackpackViewerModal in CardViewerContainer, etc.).
 *   Threading a DOMRect through ~3 contexts and 5+ files for a pure UI
 *   visual flourish is not worth it. The handler captures the rect and
 *   stashes it here; the modal consumes it on mount via its ref callback.
 *
 * The pending value is consumed (cleared) on read so that:
 *   - A subsequent open without a click (programmatic) falls back to the
 *     default centered scale, avoiding stale anchors.
 *   - At most one consumer reads any given anchor.
 */

let pendingOriginRect: DOMRect | null = null;

export function setPendingModalOrigin(rect: DOMRect | null): void {
  pendingOriginRect = rect;
}

export function consumePendingModalOrigin(): DOMRect | null {
  const r = pendingOriginRect;
  pendingOriginRect = null;
  return r;
}

/**
 * Convenience helper for click handlers: capture the rect from a mouse/touch
 * event's currentTarget and stash it. Returns nothing; intended to be called
 * inline with the existing open handler.
 */
export function captureModalOriginFromEvent(
  event: { currentTarget: Element | null },
): void {
  const target = event.currentTarget;
  if (!target || typeof (target as Element).getBoundingClientRect !== 'function') {
    setPendingModalOrigin(null);
    return;
  }
  setPendingModalOrigin((target as Element).getBoundingClientRect());
}
