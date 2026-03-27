// Mobile drag and drop utility for touch devices
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
  let previewWidth = 0;
  let previewHeight = 0;

  const resolveData = (): DragData => typeof data === 'function' ? data() : data;

  const beginDrag = (touchX: number, touchY: number) => {
    dragStarted = true;
    currentDragData = { ...resolveData() };
    dragElement = element;

    const rect = element.getBoundingClientRect();
    const originalWidth = rect.width;
    const originalHeight = rect.height;
    previewWidth = originalWidth;
    previewHeight = originalHeight;

    dragPreview = element.cloneNode(true) as HTMLElement;

    dragPreview.classList.remove('w-full', 'h-full');

    dragPreview.style.width = `${originalWidth}px`;
    dragPreview.style.height = `${originalHeight}px`;
    dragPreview.style.maxWidth = `${originalWidth}px`;
    dragPreview.style.maxHeight = `${originalHeight}px`;
    dragPreview.style.position = 'fixed';
    dragPreview.style.pointerEvents = 'none';
    dragPreview.style.opacity = '0.8';
    dragPreview.style.zIndex = '9999';
    dragPreview.style.transform = 'scale(1.05)';
    dragPreview.style.transition = 'none';
    dragPreview.style.boxSizing = 'border-box';
    dragPreview.style.willChange = 'transform';
    dragPreview.style.contain = 'layout style paint';

    dragPreview.style.left = `${touchX - originalWidth / 2}px`;
    dragPreview.style.top = `${touchY - originalHeight / 2}px`;
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
  };

  let pendingTouchX = 0;
  let pendingTouchY = 0;
  let moveScheduled = false;

  const processTouchMove = () => {
    moveScheduled = false;
    rafId = null;

    if (!dragPreview) return;

    dragPreview.style.left = `${pendingTouchX - previewWidth / 2}px`;
    dragPreview.style.top = `${pendingTouchY - previewHeight / 2}px`;

    dragPreview.style.display = 'none';
    const elementUnder = document.elementFromPoint(pendingTouchX, pendingTouchY) as HTMLElement;
    dragPreview.style.display = '';

    touchTarget = elementUnder;

    if (currentDragData) {
      document.dispatchEvent(new CustomEvent('mobile-drag-move', {
        detail: { ...currentDragData, clientX: pendingTouchX, clientY: pendingTouchY },
      }));
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
    if (moveScheduled) {
      processTouchMove();
    }
    
    if (dragPreview) {
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
