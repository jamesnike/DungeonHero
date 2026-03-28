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

const DRAG_THRESHOLD = 10;
const HIT_TEST_INTERVAL = 5;

const reusableMoveDetail: DragData = { type: 'card', data: null, clientX: 0, clientY: 0 };

export const initMobileDrag = (
  element: HTMLElement,
  data: DragData | (() => DragData),
  onDragStart?: () => void,
  onDragEnd?: () => void
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

  const resolveData = (): DragData => typeof data === 'function' ? data() : data;

  const beginDrag = (touchX: number, touchY: number) => {
    dragStarted = true;
    currentDragData = { ...resolveData() };
    dragElement = element;

    const rect = element.getBoundingClientRect();
    originCenterX = rect.left + rect.width / 2;
    originCenterY = rect.top + rect.height / 2;

    dragCellEl = element.closest('.dh-grid-cell') as HTMLElement | null;
    if (dragCellEl) dragCellEl.style.zIndex = '9999';

    element.style.zIndex = '9999';
    element.style.position = 'relative';
    element.style.opacity = '0.8';
    element.style.pointerEvents = 'none';
    element.style.willChange = 'transform';
    element.style.transition = 'none';
    element.style.backfaceVisibility = 'hidden';

    const dx = touchX - originCenterX;
    const dy = touchY - originCenterY;
    element.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.05)`;

    dragPreview = element;

    lastTouchX = touchX;
    lastTouchY = touchY;
    hasLastTouch = true;

    requestAnimationFrame(() => onDragStart?.());
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

    const touch = e.touches[0];
    const tx = touch.clientX;
    const ty = touch.clientY;

    if (!dragStarted) {
      const dx = tx - startX;
      const dy = ty - startY;
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) {
        return;
      }
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
    element.style.zIndex = '';
    element.style.position = '';
    element.style.opacity = '';
    element.style.pointerEvents = '';
    element.style.willChange = '';
    element.style.transition = '';
    element.style.backfaceVisibility = '';
    element.style.transform = '';
    element.style.visibility = '';
  };

  const handleTouchEnd = (e: TouchEvent) => {
    e.preventDefault();

    if (!dragStarted) {
      hasLastTouch = false;
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
  };
  
  element.addEventListener('touchstart', handleTouchStart, { passive: false });
  element.addEventListener('touchmove', handleTouchMove, { passive: false });
  element.addEventListener('touchend', handleTouchEnd, { passive: false });
  
  return () => {
    element.removeEventListener('touchstart', handleTouchStart);
    element.removeEventListener('touchmove', handleTouchMove);
    element.removeEventListener('touchend', handleTouchEnd);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
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
