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

const STRIP_SELECTORS = '.combat-overlay, .dh-card__lowgold-glow, .dh-card__flip-badge, .engaged-monster-aura';

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
  let previewHalfW = 0;
  let previewHalfH = 0;
  let hitTestCounter = 0;
  let preparedPreview: HTMLElement | null = null;

  const resolveData = (): DragData => typeof data === 'function' ? data() : data;

  const preparePreview = () => {
    const w = element.offsetWidth;
    const h = element.offsetHeight;
    previewHalfW = w / 2;
    previewHalfH = h / 2;

    const clone = element.cloneNode(true) as HTMLElement;
    clone.classList.remove('w-full', 'h-full');
    clone.classList.add('drag-preview');

    const junk = clone.querySelectorAll(STRIP_SELECTORS);
    for (let i = junk.length - 1; i >= 0; i--) junk[i].remove();

    clone.style.cssText =
      `width:${w}px;height:${h}px;max-width:${w}px;max-height:${h}px;` +
      'position:fixed;left:0;top:0;pointer-events:none;opacity:0;z-index:9999;' +
      'box-sizing:border-box;will-change:transform;contain:layout style paint;' +
      'backface-visibility:hidden;' +
      'transform:translate3d(-9999px,-9999px,0);';

    document.body.appendChild(clone);
    preparedPreview = clone;
  };

  const beginDrag = (touchX: number, touchY: number) => {
    dragStarted = true;
    currentDragData = { ...resolveData() };
    dragElement = element;

    if (preparedPreview) {
      dragPreview = preparedPreview;
      preparedPreview = null;
      dragPreview.style.opacity = '0.8';
    } else {
      const w = element.offsetWidth;
      const h = element.offsetHeight;
      previewHalfW = w / 2;
      previewHalfH = h / 2;

      dragPreview = element.cloneNode(true) as HTMLElement;
      dragPreview.classList.remove('w-full', 'h-full');
      dragPreview.classList.add('drag-preview');
      const junk = dragPreview.querySelectorAll(STRIP_SELECTORS);
      for (let i = junk.length - 1; i >= 0; i--) junk[i].remove();
      dragPreview.style.cssText =
        `width:${w}px;height:${h}px;max-width:${w}px;max-height:${h}px;` +
        'position:fixed;left:0;top:0;pointer-events:none;opacity:0.8;z-index:9999;' +
        'box-sizing:border-box;will-change:transform;contain:layout style paint;' +
        'backface-visibility:hidden;';
      document.body.appendChild(dragPreview);
    }

    dragPreview.style.transform =
      `translate3d(${touchX - previewHalfW}px, ${touchY - previewHalfH}px, 0) scale(1.05)`;

    lastTouchX = touchX;
    lastTouchY = touchY;
    hasLastTouch = true;

    element.classList.add('opacity-50');

    onDragStart?.();
  };

  const cleanupPreparedPreview = () => {
    if (preparedPreview) {
      preparedPreview.remove();
      preparedPreview = null;
    }
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

    cleanupPreparedPreview();
    preparePreview();
  };

  let pendingTouchX = 0;
  let pendingTouchY = 0;
  let moveScheduled = false;

  const processTouchMove = () => {
    moveScheduled = false;
    rafId = null;

    if (!dragPreview) return;

    dragPreview.style.transform =
      `translate3d(${pendingTouchX - previewHalfW}px, ${pendingTouchY - previewHalfH}px, 0) scale(1.05)`;

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
  
  const handleTouchEnd = (e: TouchEvent) => {
    e.preventDefault();

    if (!dragStarted) {
      cleanupPreparedPreview();
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
      dragPreview.remove();
      dragPreview = null;
    }
    
    element.classList.remove('opacity-50');
    
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
    cleanupPreparedPreview();
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
