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

export const initMobileDrag = (
  element: HTMLElement,
  data: DragData,
  onDragStart?: () => void,
  onDragEnd?: () => void
) => {
  let lastTouchPoint: { x: number; y: number } | null = null;
  // Touch event handlers
  const handleTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    
    // Store the drag data
    currentDragData = { ...data };
    dragElement = element;
    
    // Get the original element's dimensions before cloning
    const rect = element.getBoundingClientRect();
    const originalWidth = rect.width;
    const originalHeight = rect.height;
    
    // Create a visual drag preview
    dragPreview = element.cloneNode(true) as HTMLElement;
    
    // Remove classes that might cause size expansion
    dragPreview.classList.remove('w-full', 'h-full');
    
    // Set explicit dimensions to prevent expansion
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
    
    // Position the preview at touch location
    const touch = e.touches[0];
    dragPreview.style.left = `${touch.clientX - originalWidth / 2}px`;
    dragPreview.style.top = `${touch.clientY - originalHeight / 2}px`;
    lastTouchPoint = { x: touch.clientX, y: touch.clientY };
    
    document.body.appendChild(dragPreview);
    
    // Add dragging class to original element
    element.classList.add('opacity-50');
    
    // Call drag start callback
    onDragStart?.();
  };
  
  const handleTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    
    if (!dragPreview) return;
    
    const touch = e.touches[0];
    lastTouchPoint = { x: touch.clientX, y: touch.clientY };
    
    // Get preview dimensions (use getBoundingClientRect for accurate size)
    const previewRect = dragPreview.getBoundingClientRect();
    
    // Update preview position
    dragPreview.style.left = `${touch.clientX - previewRect.width / 2}px`;
    dragPreview.style.top = `${touch.clientY - previewRect.height / 2}px`;
    
    // Find element under touch point (excluding the preview)
    dragPreview.style.display = 'none';
    const elementUnder = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement;
    dragPreview.style.display = '';
    
    // Update touch target for drop detection
    touchTarget = elementUnder;
    
    // Add hover effect to drop zones
    const dropZones = document.querySelectorAll('[data-drop-zone]');
    dropZones.forEach(zone => {
      if (zone.contains(elementUnder)) {
        zone.classList.add('ring-4', 'ring-primary');
      } else {
        zone.classList.remove('ring-4', 'ring-primary');
      }
    });
  };
  
  const handleTouchEnd = (e: TouchEvent) => {
    e.preventDefault();
    
    // Clean up preview
    if (dragPreview) {
      dragPreview.remove();
      dragPreview = null;
    }
    
    // Remove dragging class
    element.classList.remove('opacity-50');
    
    // Clear hover effects
    const dropZones = document.querySelectorAll('[data-drop-zone]');
    dropZones.forEach(zone => {
      zone.classList.remove('ring-4', 'ring-primary');
    });
    
    // Trigger drop if over a valid drop zone
    if (touchTarget && currentDragData) {
      const touch = e.changedTouches[0];
      const dropPoint = lastTouchPoint ?? (touch ? { x: touch.clientX, y: touch.clientY } : null);
      const detail: DragData = dropPoint
        ? { ...currentDragData, clientX: dropPoint.x, clientY: dropPoint.y }
        : { ...currentDragData };
      // Find the closest drop zone
      const dropZone = touchTarget.closest('[data-drop-zone]') as HTMLElement;
      
      if (dropZone) {
        // Create a custom drop event
        const dropEvent = new CustomEvent('mobile-drop', {
          detail,
          bubbles: true
        });
        dropZone.dispatchEvent(dropEvent);
      }
    }
    
    // Clean up
    currentDragData = null;
    dragElement = null;
    touchTarget = null;
    lastTouchPoint = null;
    
    // Call drag end callback
    onDragEnd?.();
  };
  
  // Add touch event listeners
  element.addEventListener('touchstart', handleTouchStart, { passive: false });
  element.addEventListener('touchmove', handleTouchMove, { passive: false });
  element.addEventListener('touchend', handleTouchEnd, { passive: false });
  
  // Return cleanup function
  return () => {
    element.removeEventListener('touchstart', handleTouchStart);
    element.removeEventListener('touchmove', handleTouchMove);
    element.removeEventListener('touchend', handleTouchEnd);
  };
};

export const initMobileDrop = (
  element: HTMLElement,
  onDrop: (data: DragData) => void,
  acceptTypes?: string[]
) => {
  // Mark as drop zone
  element.setAttribute('data-drop-zone', 'true');
  if (acceptTypes) {
    element.setAttribute('data-accept-types', acceptTypes.join(','));
  }
  
  // Handle mobile drop events
  const handleMobileDrop = (e: CustomEvent) => {
    const dragData = e.detail as DragData;
    
    // Check if this drop zone accepts this type
    if (acceptTypes && !acceptTypes.includes(dragData.type)) {
      return;
    }
    
    onDrop(dragData);
  };
  
  element.addEventListener('mobile-drop', handleMobileDrop as EventListener);
  
  // Return cleanup function
  return () => {
    element.removeAttribute('data-drop-zone');
    element.removeAttribute('data-accept-types');
    element.removeEventListener('mobile-drop', handleMobileDrop as EventListener);
  };
};