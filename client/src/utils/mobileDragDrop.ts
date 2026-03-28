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
const HIT_TEST_INTERVAL = 3;

export const initMobileDrag = (
  element: HTMLElement,
  data: DragData | (() => DragData),
  onDragStart?: () => void,
  onDragEnd?: () => void
) => {
  let lastTouchPoint: { x: number; y: number } | null = null;
  let startPoint: { x: number; y: number } | null = null;
  let dragStarted = false;
  let rafId: number | null = null;
  let previewHalfW = 0;
  let previewHalfH = 0;
  let hitTestCounter = 0;

  const resolveData = (): DragData => typeof data === 'function' ? data() : data;

  const beginDrag = (touchX: number, touchY: number) => {
    dragStarted = true;
    currentDragData = { ...resolveData() };
    dragElement = element;

    const rect = element.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    previewHalfW = w / 2;
    previewHalfH = h / 2;

    dragPreview = element.cloneNode(true) as HTMLElement;

    dragPreview.classList.remove('w-full', 'h-full');

    dragPreview.style.cssText =
      `width:${w}px;height:${h}px;max-width:${w}px;max-height:${h}px;` +
      'position:fixed;left:0;top:0;pointer-events:none;opacity:0.8;z-index:9999;' +
      'box-sizing:border-box;will-change:transform;contain:layout style paint;' +
      'transition:none;backface-visibility:hidden;';

    dragPreview.style.transform =
      `translate3d(${touchX - previewHalfW}px, ${touchY - previewHalfH}px, 0) scale(1.05)`;

    lastTouchPoint = { x: touchX, y: touchY };

    document.body.appendChild(dragPreview);

    element.classList.add('opacity-50');

    onDragStart?.();
  };

  const handleTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    startPoint = { x: touch.clientX, y: touch.clientY };
    lastTouchPoint = { x: touch.clientX, y: touch.clientY };
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

    dragPreview.style.transform =
      `translate3d(${pendingTouchX - previewHalfW}px, ${pendingTouchY - previewHalfH}px, 0) scale(1.05)`;

    hitTestCounter++;
    if (hitTestCounter % HIT_TEST_INTERVAL === 0) {
      dragPreview.style.visibility = 'hidden';
      const elementUnder = document.elementFromPoint(pendingTouchX, pendingTouchY) as HTMLElement;
      dragPreview.style.visibility = '';

      touchTarget = elementUnder;

      if (currentDragData) {
        document.dispatchEvent(new CustomEvent('mobile-drag-move', {
          detail: { ...currentDragData, clientX: pendingTouchX, clientY: pendingTouchY },
        }));
      }
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    e.preventDefault();

    const touch = e.touches[0];

    if (!dragStarted && startPoint) {
      const dx = touch.clientX - startPoint.x;
      const dy = touch.clientY - startPoint.y;
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
        return;
      }
      beginDrag(touch.clientX, touch.clientY);
    }

    if (!dragPreview) return;

    pendingTouchX = touch.clientX;
    pendingTouchY = touch.clientY;
    lastTouchPoint = { x: touch.clientX, y: touch.clientY };

    if (!moveScheduled) {
      moveScheduled = true;
      rafId = requestAnimationFrame(processTouchMove);
    }
  };
  
  const handleTouchEnd = (e: TouchEvent) => {
    e.preventDefault();

    if (!dragStarted) {
      startPoint = null;
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
      const finalPoint = lastTouchPoint ?? (touch ? { x: touch.clientX, y: touch.clientY } : null);
      if (finalPoint) {
        touchTarget = document.elementFromPoint(finalPoint.x, finalPoint.y) as HTMLElement;
      }
      dragPreview.remove();
      dragPreview = null;
    }
    
    element.classList.remove('opacity-50');
    
    if (touchTarget && currentDragData) {
      const touch = e.changedTouches[0];
      const dropPoint = lastTouchPoint ?? (touch ? { x: touch.clientX, y: touch.clientY } : null);
      const detail: DragData & { _handled?: boolean } = dropPoint
        ? { ...currentDragData, clientX: dropPoint.x, clientY: dropPoint.y }
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
    lastTouchPoint = null;
    startPoint = null;
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
