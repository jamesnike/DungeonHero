export interface DragData {
  type: 'card' | 'equipment';
  data: any;
  clientX?: number;
  clientY?: number;
}

let currentDragData: DragData | null = null;
let dragElement: HTMLElement | null = null;
let dragPreview: HTMLElement | null = null;
let touchTarget: HTMLElement | null = null;

// ---------------------------------------------------------------------------
// HTML5 native drag fallback (Samsung Internet on DeX compat)
// ---------------------------------------------------------------------------
// Some browsers (most notably Samsung Internet running in Samsung DeX desktop
// mode) silently drop *custom* `dataTransfer` MIME types between `dragstart`
// and `drop`. `setData('card', ...)` looks like it succeeds, but `getData('card')`
// at the drop site returns an empty string — so every drop handler falls into
// `if (cardData) { ... }` with nothing and the user sees "拖了能松，但松手没生效".
//
// To stay cross-browser compatible without changing behavior on browsers that
// already work correctly, we mirror the same payload into a tiny module-level
// store on `dragstart` and read from it as a fallback when `dataTransfer`
// returns empty. Touch / mobile drag uses a separate `mobile-drop` event path
// (see initMobileDrag/initMobileDrop) and is unaffected.
// ---------------------------------------------------------------------------
type Html5DragKey = 'card' | 'equipment';
const html5FallbackPayload: Partial<Record<Html5DragKey, string>> = {};

export const setHtml5DragFallback = (key: Html5DragKey, value: string): void => {
  html5FallbackPayload[key] = value;
};

export const getHtml5DragFallback = (key: Html5DragKey): string => {
  return html5FallbackPayload[key] ?? '';
};

export const clearHtml5DragFallback = (): void => {
  delete html5FallbackPayload.card;
  delete html5FallbackPayload.equipment;
};

/**
 * Read drag data from a React DragEvent's `dataTransfer`, falling back to the
 * module-level mirror if `dataTransfer.getData(key)` returns an empty string
 * (Samsung Internet on DeX behavior). Always prefer the live `dataTransfer`
 * value when present so cross-tab / external drops still work normally.
 */
export const readHtml5DragData = (
  e: { dataTransfer: DataTransfer | null } | DragEvent,
  key: Html5DragKey,
): string => {
  const dt = (e as { dataTransfer: DataTransfer | null }).dataTransfer;
  const fromDt = dt ? dt.getData(key) : '';
  if (fromDt) return fromDt;
  return getHtml5DragFallback(key);
};

const DRAG_THRESHOLD = 5;
const HIT_TEST_INTERVAL = 5;
// Long-press detection — must live alongside the drag init because
// `handleTouchStart` calls `e.preventDefault()`, which prevents the browser
// from synthesizing pointerdown / mousedown events that would otherwise feed
// React's `onPointerDown` (where the desktop / pen long-press lives).
// See `card-stamp` social feature: this is the mobile entry point for the
// stamp picker.
const LONG_PRESS_MS = 500;

const reusableMoveDetail: DragData = { type: 'card', data: null, clientX: 0, clientY: 0 };

export interface LongPressEvent {
  clientX: number;
  clientY: number;
  target: Element;
}

export const initMobileDrag = (
  element: HTMLElement,
  data: DragData | (() => DragData),
  onDragStart?: () => void,
  onDragEnd?: () => void,
  /**
   * Fires after `LONG_PRESS_MS` of stationary touch if the user has neither
   * lifted their finger nor moved past `DRAG_THRESHOLD`. When it fires we
   * also suppress the upcoming `touchend` "tap" emulation so the click that
   * normally dismisses popovers / advances modals doesn't immediately undo
   * whatever the long-press just opened.
   */
  onLongPress?: (event: LongPressEvent) => void,
) => {
  let startX = 0;
  let startY = 0;
  let lastTouchX = 0;
  let lastTouchY = 0;
  let hasLastTouch = false;
  let dragStarted = false;
  let rafId: number | null = null;
  let hitTestCounter = 0;
  let originCenterX = 0;
  let originCenterY = 0;
  let dragCellEl: HTMLElement | null = null;
  let cachedRect: DOMRect | null = null;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressFired = false;

  const cancelLongPressTimer = () => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const resolveData = (): DragData => typeof data === 'function' ? data() : data;

  const beginDrag = (touchX: number, touchY: number) => {
    dragStarted = true;
    currentDragData = { ...resolveData() };
    dragElement = element;

    const rect = cachedRect || element.getBoundingClientRect();
    cachedRect = null;
    originCenterX = rect.left + rect.width / 2;
    originCenterY = rect.top + rect.height / 2;

    dragCellEl = element.closest('.dh-grid-cell') as HTMLElement | null;
    if (dragCellEl) dragCellEl.style.zIndex = '9999';

    element.style.transition = 'none';
    element.classList.add('mobile-dragging');
    element.style.transform = `translate3d(${touchX - originCenterX}px, ${touchY - originCenterY}px, 0) scale(1.05)`;

    dragPreview = element;

    lastTouchX = touchX;
    lastTouchY = touchY;
    hasLastTouch = true;

    onDragStart?.();
  };

  const handleTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
    hasLastTouch = true;
    dragStarted = false;
    hitTestCounter = 0;
    longPressFired = false;

    cachedRect = element.getBoundingClientRect();

    element.style.transition = 'transform 80ms ease-out';
    element.style.transform = 'scale(1.03)';

    // Schedule long-press fire if user holds without moving past DRAG_THRESHOLD.
    // Cancelled by touchmove >threshold or touchend below.
    if (onLongPress) {
      cancelLongPressTimer();
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        // Defensive: only fire if drag hasn't started — the move handler
        // already cancels this timer once it crosses the drag threshold,
        // so this is belt-and-suspenders.
        if (dragStarted) return;
        longPressFired = true;
        // Restore the pre-press scale so the card doesn't sit "pressed"
        // while the picker is open (visually weird).
        element.style.transition = 'transform 80ms ease-out';
        element.style.transform = '';
        onLongPress({ clientX: startX, clientY: startY, target: element });
      }, LONG_PRESS_MS);
    }
  };

  let pendingTouchX = 0;
  let pendingTouchY = 0;
  let moveScheduled = false;

  const processTouchMove = () => {
    moveScheduled = false;
    rafId = null;

    if (!dragPreview) return;

    const dx = pendingTouchX - originCenterX;
    const dy = pendingTouchY - originCenterY;
    dragPreview.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.05)`;

    hitTestCounter++;
    if (hitTestCounter % HIT_TEST_INTERVAL === 0) {
      dragPreview.style.visibility = 'hidden';
      const elementUnder = document.elementFromPoint(pendingTouchX, pendingTouchY) as HTMLElement;
      dragPreview.style.visibility = '';

      touchTarget = elementUnder;

      if (currentDragData) {
        reusableMoveDetail.type = currentDragData.type;
        reusableMoveDetail.data = currentDragData.data;
        reusableMoveDetail.clientX = pendingTouchX;
        reusableMoveDetail.clientY = pendingTouchY;
        document.dispatchEvent(new CustomEvent('mobile-drag-move', {
          detail: reusableMoveDetail,
        }));
      }
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    e.preventDefault();

    // Long-press already fired — swallow further movement so we don't slide
    // into drag mode under the picker.
    if (longPressFired) return;

    const touch = e.touches[0];
    const tx = touch.clientX;
    const ty = touch.clientY;

    if (!dragStarted) {
      const dx = tx - startX;
      const dy = ty - startY;
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) {
        return;
      }
      // Crossed drag threshold — definitely not a long-press.
      cancelLongPressTimer();
      beginDrag(tx, ty);
    }

    if (!dragPreview) return;

    pendingTouchX = tx;
    pendingTouchY = ty;
    lastTouchX = tx;
    lastTouchY = ty;

    if (!moveScheduled) {
      moveScheduled = true;
      rafId = requestAnimationFrame(processTouchMove);
    }
  };
  
  const restoreElement = () => {
    if (dragCellEl) {
      dragCellEl.style.zIndex = '';
      dragCellEl = null;
    }
    element.classList.remove('mobile-dragging');
    element.style.transition = '';
    element.style.transform = 'none';
    element.style.opacity = '1';
    element.style.visibility = '';
  };

  const handleTouchEnd = (e: TouchEvent) => {
    e.preventDefault();

    // Always clear the timer on release.
    cancelLongPressTimer();

    // Long-press fired during this gesture — suppress the tap-emulating
    // click so we don't immediately dismiss the picker we just opened.
    if (longPressFired) {
      longPressFired = false;
      hasLastTouch = false;
      element.style.transition = '';
      element.style.transform = '';
      return;
    }

    if (!dragStarted) {
      hasLastTouch = false;
      element.style.transition = '';
      element.style.transform = '';
      element.click();
      return;
    }

    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    if (dragPreview) {
      dragPreview.style.visibility = 'hidden';
      const touch = e.changedTouches[0];
      const fx = hasLastTouch ? lastTouchX : (touch ? touch.clientX : 0);
      const fy = hasLastTouch ? lastTouchY : (touch ? touch.clientY : 0);
      if (fx || fy) {
        touchTarget = document.elementFromPoint(fx, fy) as HTMLElement;
      }
      restoreElement();
      dragPreview = null;
    }
    
    if (touchTarget && currentDragData) {
      const touch = e.changedTouches[0];
      const dpx = hasLastTouch ? lastTouchX : (touch ? touch.clientX : undefined);
      const dpy = hasLastTouch ? lastTouchY : (touch ? touch.clientY : undefined);
      const detail: DragData & { _handled?: boolean } = dpx !== undefined
        ? { ...currentDragData, clientX: dpx, clientY: dpy }
        : { ...currentDragData };

      const globalEvent = new CustomEvent('mobile-drag-end', {
        detail,
      });
      document.dispatchEvent(globalEvent);

      if (!detail._handled) {
        const dropZone = touchTarget.closest('[data-drop-zone]') as HTMLElement;
        if (dropZone) {
          const dropEvent = new CustomEvent('mobile-drop', {
            detail,
            bubbles: true
          });
          dropZone.dispatchEvent(dropEvent);
        }
      }
    }
    
    currentDragData = null;
    dragElement = null;
    touchTarget = null;
    hasLastTouch = false;
    dragStarted = false;
    moveScheduled = false;
    
    onDragEnd?.();

    requestAnimationFrame(() => {
      element.style.transform = '';
      element.style.opacity = '';
    });
  };
  
  element.addEventListener('touchstart', handleTouchStart, { passive: false });
  element.addEventListener('touchmove', handleTouchMove, { passive: false });
  element.addEventListener('touchend', handleTouchEnd, { passive: false });
  
  return () => {
    element.removeEventListener('touchstart', handleTouchStart);
    element.removeEventListener('touchmove', handleTouchMove);
    element.removeEventListener('touchend', handleTouchEnd);
    if (rafId !== null) cancelAnimationFrame(rafId);
    cachedRect = null;
  };
};

export const initMobileDrop = (
  element: HTMLElement,
  onDrop: (data: DragData) => void,
  acceptTypes?: string[]
) => {
  element.setAttribute('data-drop-zone', 'true');
  if (acceptTypes) {
    element.setAttribute('data-accept-types', acceptTypes.join(','));
  }
  
  const handleMobileDrop = (e: CustomEvent) => {
    const dragData = e.detail as DragData;
    
    if (acceptTypes && !acceptTypes.includes(dragData.type)) {
      return;
    }
    
    e.stopPropagation();
    onDrop(dragData);
  };
  
  element.addEventListener('mobile-drop', handleMobileDrop as EventListener);
  
  return () => {
    element.removeAttribute('data-drop-zone');
    element.removeAttribute('data-accept-types');
    element.removeEventListener('mobile-drop', handleMobileDrop as EventListener);
  };
};
