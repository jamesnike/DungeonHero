import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as NativePointerEvent,
} from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import * as BoardConstants from '../constants';

type DragSession = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

export function useBoardInteractions(isCombatPanelVisible: boolean) {
  const [combatPanelPosition, setCombatPanelPosition] = useState<{ x: number; y: number } | null>(null);
  const [combatPanelSize, setCombatPanelSize] = useState({ width: 0, height: 0 });
  const [isCombatPanelDragging, setIsCombatPanelDragging] = useState(false);

  const combatPanelWrapperRef = useRef<HTMLDivElement | null>(null);
  const combatPanelDragSessionRef = useRef<DragSession | null>(null);
  const combatPanelHasCustomPositionRef = useRef(false);
  const combatPanelWindowListenersRef = useRef<{
    move: (event: NativePointerEvent) => void;
    up: (event: NativePointerEvent) => void;
  } | null>(null);

  const clampCombatPanelPosition = useCallback(
    (x: number, y: number, size?: { width: number; height: number }) => {
      if (typeof window === 'undefined') {
        return { x, y };
      }
      const width = size?.width || combatPanelSize.width || BoardConstants.COMBAT_PANEL_DEFAULT_WIDTH;
      const height = size?.height || combatPanelSize.height || BoardConstants.COMBAT_PANEL_DEFAULT_HEIGHT;
      const maxX = Math.max(
        BoardConstants.COMBAT_PANEL_EDGE_PADDING,
        window.innerWidth - width - BoardConstants.COMBAT_PANEL_EDGE_PADDING,
      );
      const maxY = Math.max(
        BoardConstants.COMBAT_PANEL_EDGE_PADDING,
        window.innerHeight - height - BoardConstants.COMBAT_PANEL_EDGE_PADDING,
      );
      return {
        x: Math.min(Math.max(BoardConstants.COMBAT_PANEL_EDGE_PADDING, x), maxX),
        y: Math.min(Math.max(BoardConstants.COMBAT_PANEL_EDGE_PADDING, y), maxY),
      };
    },
    [combatPanelSize.height, combatPanelSize.width],
  );

  const computeDefaultCombatPanelPosition = useCallback(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    const viewportWidth = window.innerWidth;
    const width = combatPanelSize.width || BoardConstants.COMBAT_PANEL_DEFAULT_WIDTH;
    const height = combatPanelSize.height || BoardConstants.COMBAT_PANEL_DEFAULT_HEIGHT;
    const top =
      viewportWidth < 640
        ? BoardConstants.COMBAT_PANEL_EDGE_PADDING
        : BoardConstants.COMBAT_PANEL_EDGE_PADDING * 2;
    const left =
      viewportWidth < 640
        ? (viewportWidth - width) / 2
        : viewportWidth - width - BoardConstants.COMBAT_PANEL_EDGE_PADDING * 2;
    return clampCombatPanelPosition(left, top, { width, height });
  }, [clampCombatPanelPosition, combatPanelSize.height, combatPanelSize.width]);

  const teardownCombatPanelDrag = useCallback(() => {
    if (typeof window !== 'undefined' && combatPanelWindowListenersRef.current) {
      window.removeEventListener('pointermove', combatPanelWindowListenersRef.current.move);
      window.removeEventListener('pointerup', combatPanelWindowListenersRef.current.up);
      window.removeEventListener('pointercancel', combatPanelWindowListenersRef.current.up);
    }
    combatPanelWindowListenersRef.current = null;
    combatPanelDragSessionRef.current = null;
    setIsCombatPanelDragging(false);
  }, []);

  useEffect(() => {
    return () => {
      teardownCombatPanelDrag();
    };
  }, [teardownCombatPanelDrag]);

  useEffect(() => {
    if (!isCombatPanelVisible) {
      teardownCombatPanelDrag();
    }
  }, [isCombatPanelVisible, teardownCombatPanelDrag]);

  useLayoutEffect(() => {
    if (!isCombatPanelVisible) {
      return;
    }
    setCombatPanelPosition(prev => {
      if (prev) {
        return prev;
      }
      const next = computeDefaultCombatPanelPosition();
      return next ?? prev;
    });
  }, [computeDefaultCombatPanelPosition, isCombatPanelVisible]);

  useLayoutEffect(() => {
    if (!isCombatPanelVisible) {
      return;
    }
    const target = combatPanelWrapperRef.current;
    if (!target) {
      return;
    }
    const updateSize = () => {
      const rect = target.getBoundingClientRect();
      setCombatPanelSize(prev => {
        if (Math.abs(prev.width - rect.width) < 0.5 && Math.abs(prev.height - rect.height) < 0.5) {
          return prev;
        }
        return { width: rect.width, height: rect.height };
      });
    };
    updateSize();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      setCombatPanelSize(prev => {
        if (Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5) {
          return prev;
        }
        return { width, height };
      });
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [isCombatPanelVisible]);

  useEffect(() => {
    if (!isCombatPanelVisible) {
      return;
    }
    setCombatPanelPosition(prev => {
      if (!prev) {
        return prev;
      }
      const clamped = clampCombatPanelPosition(prev.x, prev.y);
      if (Math.abs(clamped.x - prev.x) < 0.5 && Math.abs(clamped.y - prev.y) < 0.5) {
        return prev;
      }
      return clamped;
    });
  }, [clampCombatPanelPosition, combatPanelSize.height, combatPanelSize.width, isCombatPanelVisible]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleResize = () => {
      if (!isCombatPanelVisible) {
        return;
      }
      setCombatPanelPosition(prev => {
        if (!prev || !combatPanelHasCustomPositionRef.current) {
          return computeDefaultCombatPanelPosition() ?? prev;
        }
        const clamped = clampCombatPanelPosition(prev.x, prev.y);
        if (Math.abs(clamped.x - prev.x) < 0.5 && Math.abs(clamped.y - prev.y) < 0.5) {
          return prev;
        }
        return clamped;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampCombatPanelPosition, computeDefaultCombatPanelPosition, isCombatPanelVisible]);

  const handleCombatPanelPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isCombatPanelVisible) {
        return;
      }
      if (event.pointerType === 'touch') {
        event.preventDefault();
      }
      const target = combatPanelWrapperRef.current;
      const surface = target?.parentElement;
      if (!target || !surface) {
        return;
      }
      const surfaceRect = surface.getBoundingClientRect();
      const resolvedPosition = combatPanelPosition ?? computeDefaultCombatPanelPosition();
      const pointerSession: DragSession = {
        pointerId: event.nativeEvent.pointerId,
        startX: event.nativeEvent.clientX,
        startY: event.nativeEvent.clientY,
        originX: resolvedPosition ? resolvedPosition.x : BoardConstants.COMBAT_PANEL_EDGE_PADDING,
        originY: resolvedPosition ? resolvedPosition.y : BoardConstants.COMBAT_PANEL_EDGE_PADDING,
      };
      combatPanelDragSessionRef.current = pointerSession;
      combatPanelHasCustomPositionRef.current = true;
      setIsCombatPanelDragging(true);
      const handlePointerMove = (nativeEvent: NativePointerEvent) => {
        if (!combatPanelDragSessionRef.current || nativeEvent.pointerId !== pointerSession.pointerId) {
          return;
        }
        nativeEvent.preventDefault();
        const deltaX = nativeEvent.clientX - pointerSession.startX;
        const deltaY = nativeEvent.clientY - pointerSession.startY;
        const nextPosition = clampCombatPanelPosition(pointerSession.originX + deltaX, pointerSession.originY + deltaY);
        setCombatPanelPosition(prev => {
          if (prev && Math.abs(prev.x - nextPosition.x) < 0.5 && Math.abs(prev.y - nextPosition.y) < 0.5) {
            return prev;
          }
          return nextPosition;
        });
      };
      const handlePointerUp = (nativeEvent: NativePointerEvent) => {
        if (!combatPanelDragSessionRef.current || nativeEvent.pointerId !== pointerSession.pointerId) {
          return;
        }
        nativeEvent.preventDefault();
        teardownCombatPanelDrag();
      };
      combatPanelWindowListenersRef.current = {
        move: handlePointerMove,
        up: handlePointerUp,
      };
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [
      clampCombatPanelPosition,
      combatPanelPosition,
      computeDefaultCombatPanelPosition,
      isCombatPanelVisible,
      teardownCombatPanelDrag,
    ],
  );

  const combatPanelStyle = useMemo<React.CSSProperties>(() => {
    const style: React.CSSProperties = {
      '--combat-panel-width': 'clamp(135px, 11vw, 170px)',
      width: 'min(var(--combat-panel-width), calc(100% - 1.5rem))',
    };
    if (combatPanelPosition) {
      style.left = `${combatPanelPosition.x}px`;
      style.top = `${combatPanelPosition.y}px`;
    }
    return style;
  }, [combatPanelPosition]);

  const combatPanelWrapperClassName = useMemo(
    () =>
      [
        'pointer-events-auto fixed z-40 combat-panel-wrapper',
        isCombatPanelDragging ? 'combat-panel-wrapper--dragging' : '',
        combatPanelPosition ? '' : BoardConstants.COMBAT_PANEL_DEFAULT_POSITION_CLASS,
      ]
        .filter(Boolean)
        .join(' '),
    [combatPanelPosition, isCombatPanelDragging],
  );

  return {
    combatPanelPosition,
    combatPanelSize,
    combatPanelWrapperRef,
    combatPanelWrapperClassName,
    combatPanelStyle,
    isCombatPanelDragging,
    handleCombatPanelPointerDown,
  };
}
