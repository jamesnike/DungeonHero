import { Card } from '@/components/ui/card';
import { ScrollText, Minimize2, Maximize2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, useCallback, useLayoutEffect, useMemo, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

export type LogEntryType =
  | 'combat'
  | 'damage'
  | 'heal'
  | 'equip'
  | 'potion'
  | 'magic'
  | 'event'
  | 'amulet'
  | 'waterfall'
  | 'shop'
  | 'monster'
  | 'skill'
  | 'gold'
  | 'system';

export interface LogEntry {
  id: number;
  type: LogEntryType;
  message: string;
  timestamp: number;
}

const LOG_TYPE_COLORS: Record<LogEntryType, string> = {
  combat: 'text-red-400',
  damage: 'text-orange-400',
  heal: 'text-emerald-400',
  equip: 'text-blue-400',
  potion: 'text-green-400',
  magic: 'text-cyan-400',
  event: 'text-violet-400',
  amulet: 'text-amber-400',
  waterfall: 'text-sky-400',
  shop: 'text-yellow-400',
  monster: 'text-red-500',
  skill: 'text-rose-400',
  gold: 'text-yellow-300',
  system: 'text-gray-400',
};

const LOG_TYPE_LABELS: Record<LogEntryType, string> = {
  combat: 'Combat',
  damage: 'Damage',
  heal: 'Heal',
  equip: 'Equip',
  potion: 'Potion',
  magic: 'Magic',
  event: 'Event',
  amulet: 'Amulet',
  waterfall: 'Wave',
  shop: 'Shop',
  monster: 'Monster',
  skill: 'Skill',
  gold: 'Gold',
  system: 'System',
};

interface GameLogPanelProps {
  entries: LogEntry[];
  onClear?: () => void;
  stageScale?: number;
}

const BASE_PANEL_WIDTH = 320;
const PANEL_MIN_SCALE = 0.65;
const PANEL_MAX_SCALE = 1.75;
const EDGE_PADDING = 12;
const DEFAULT_WIDTH_CSS = 'clamp(180px, 16vw, 260px)';
const MINIMIZED_WIDTH_CSS = 'clamp(80px, 7vw, 110px)';

export default function GameLogPanel({
  entries,
  onClear,
  stageScale = 1,
}: GameLogPanelProps) {
  const [minimized, setMinimized] = useState(true);
  const [panelScale, setPanelScale] = useState(1);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hasCustomPositionRef = useRef(false);
  const dragSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const windowListenersRef = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevEntryCountRef = useRef(entries.length);

  useEffect(() => {
    if (minimized || typeof window === 'undefined') return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setMinimized(true);
      }
    };
    window.addEventListener('pointerdown', handleClickOutside, true);
    return () => window.removeEventListener('pointerdown', handleClickOutside, true);
  }, [minimized]);

  useEffect(() => {
    if (entries.length > prevEntryCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    prevEntryCountRef.current = entries.length;
  }, [entries.length]);

  const reversedEntries = useMemo(() => [...entries].reverse(), [entries]);

  useEffect(() => {
    const target = cardRef.current;
    if (!target || typeof ResizeObserver === 'undefined') return;
    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
    const update = () => {
      const w = target.getBoundingClientRect().width;
      if (!w) return;
      setPanelScale(prev => {
        const next = clamp(w / BASE_PANEL_WIDTH, PANEL_MIN_SCALE, PANEL_MAX_SCALE);
        return Math.abs(prev - next) > 0.01 ? next : prev;
      });
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(target);
    return () => obs.disconnect();
  }, []);

  const combinedScale = useMemo(() => {
    const raw = panelScale * stageScale;
    return Math.min(PANEL_MAX_SCALE, Math.max(PANEL_MIN_SCALE, raw));
  }, [panelScale, stageScale]);

  const clampPosition = useCallback(
    (x: number, y: number, size?: { width: number; height: number }) => {
      if (typeof window === 'undefined') return { x, y };
      const w = size?.width || panelSize.width || 200;
      const h = size?.height || panelSize.height || 300;
      return {
        x: Math.max(EDGE_PADDING, Math.min(window.innerWidth - w - EDGE_PADDING, x)),
        y: Math.max(EDGE_PADDING, Math.min(window.innerHeight - h - EDGE_PADDING, y)),
      };
    },
    [panelSize.width, panelSize.height],
  );

  const computeDefaultPosition = useCallback(() => {
    if (typeof window === 'undefined') return null;
    const w = panelSize.width || 200;
    const h = panelSize.height || 40;
    const left = EDGE_PADDING;
    const top = 54;
    return clampPosition(left, top, { width: w, height: h });
  }, [clampPosition, panelSize.width, panelSize.height]);

  const teardownDrag = useCallback(() => {
    if (typeof window !== 'undefined' && windowListenersRef.current) {
      window.removeEventListener('pointermove', windowListenersRef.current.move);
      window.removeEventListener('pointerup', windowListenersRef.current.up);
      window.removeEventListener('pointercancel', windowListenersRef.current.up);
    }
    windowListenersRef.current = null;
    dragSessionRef.current = null;
    setIsDragging(false);
  }, []);

  useEffect(() => () => teardownDrag(), [teardownDrag]);

  useLayoutEffect(() => {
    setPosition(prev => {
      if (prev) return prev;
      return computeDefaultPosition() ?? prev;
    });
  }, [computeDefaultPosition]);

  useLayoutEffect(() => {
    const target = wrapperRef.current;
    if (!target) return;
    const update = () => {
      const rect = target.getBoundingClientRect();
      setPanelSize(prev => {
        if (Math.abs(prev.width - rect.width) < 0.5 && Math.abs(prev.height - rect.height) < 0.5) return prev;
        return { width: rect.width, height: rect.height };
      });
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setPanelSize(prev => {
        if (Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5) return prev;
        return { width, height };
      });
    });
    obs.observe(target);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    setPosition(prev => {
      if (!prev) return prev;
      const clamped = clampPosition(prev.x, prev.y);
      if (Math.abs(clamped.x - prev.x) < 0.5 && Math.abs(clamped.y - prev.y) < 0.5) return prev;
      return clamped;
    });
  }, [clampPosition]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setPosition(prev => {
        if (!prev || !hasCustomPositionRef.current) return computeDefaultPosition() ?? prev;
        const clamped = clampPosition(prev.x, prev.y);
        if (Math.abs(clamped.x - prev.x) < 0.5 && Math.abs(clamped.y - prev.y) < 0.5) return prev;
        return clamped;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampPosition, computeDefaultPosition]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.pointerType !== 'touch') return;
      if (dragSessionRef.current) return;
      const resolvedPosition = position ?? computeDefaultPosition();
      if (!resolvedPosition) return;
      if (!position) setPosition(resolvedPosition);
      event.preventDefault();
      event.stopPropagation();
      const session = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: resolvedPosition.x,
        originY: resolvedPosition.y,
      };
      dragSessionRef.current = session;
      hasCustomPositionRef.current = true;
      setIsDragging(true);
      const handleMove = (e: PointerEvent) => {
        if (!dragSessionRef.current || e.pointerId !== session.pointerId) return;
        e.preventDefault();
        const dx = e.clientX - session.startX;
        const dy = e.clientY - session.startY;
        const next = clampPosition(session.originX + dx, session.originY + dy);
        setPosition(prev => {
          if (prev && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5) return prev;
          return next;
        });
      };
      const handleUp = (e: PointerEvent) => {
        if (!dragSessionRef.current || e.pointerId !== session.pointerId) return;
        e.preventDefault();
        teardownDrag();
      };
      windowListenersRef.current = { move: handleMove, up: handleUp };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', handleUp);
    },
    [clampPosition, computeDefaultPosition, position, teardownDrag],
  );

  const wrapperStyle = useMemo<CSSProperties>(() => {
    const style: CSSProperties = {
      width: minimized ? MINIMIZED_WIDTH_CSS : DEFAULT_WIDTH_CSS,
    };
    if (position) {
      style.left = `${position.x}px`;
      style.top = `${position.y}px`;
    }
    return style;
  }, [minimized, position]);

  const wrapperClassName = useMemo(
    () =>
      [
        'pointer-events-auto fixed z-40 game-log-panel-wrapper',
        isDragging ? 'combat-panel-wrapper--dragging' : '',
        position ? '' : 'top-4 left-4',
      ]
        .filter(Boolean)
        .join(' '),
    [position, isDragging],
  );

  if (minimized) {
    return (
      <div ref={wrapperRef} className={wrapperClassName} style={wrapperStyle}>
        <Card
          ref={cardRef}
          className={`relative z-10 w-full border border-primary/25 bg-card/95 shadow-lg combat-panel cursor-pointer${isDragging ? ' combat-panel--dragging' : ''}`}
          style={{ '--dh-combat-panel-scale': combinedScale.toString() } as CSSProperties}
          onClick={() => setMinimized(false)}
        >
          <div
            className={`p-2 flex items-center gap-2 combat-panel__drag-handle${isDragging ? ' combat-panel__drag-handle--active' : ''}`}
            onPointerDown={handlePointerDown}
            aria-grabbed={isDragging}
          >
            <Maximize2 className="combat-panel__icon text-muted-foreground flex-shrink-0" />
            <span className="combat-panel__summary text-muted-foreground truncate flex-1">
              Log ({entries.length})
            </span>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className={wrapperClassName} style={wrapperStyle}>
      <Card
        ref={cardRef}
        className={`relative z-10 w-full border border-primary/25 bg-card/95 shadow-lg combat-panel${isDragging ? ' combat-panel--dragging' : ''}`}
        style={{ '--dh-combat-panel-scale': combinedScale.toString() } as CSSProperties}
      >
        <div className="flex flex-col" style={{ maxHeight: 'min(40vh, 320px)' }}>
          <div
            className={`combat-panel__drag-handle flex items-center justify-between gap-1.5 px-2 py-1.5${isDragging ? ' combat-panel__drag-handle--active' : ''}`}
            onPointerDown={handlePointerDown}
            aria-grabbed={isDragging}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <ScrollText className="combat-panel__icon text-muted-foreground flex-shrink-0" />
              <span className="combat-panel__label uppercase tracking-wide text-muted-foreground">
                Game Log
              </span>
              <span className="combat-panel__badge text-muted-foreground font-mono px-1 py-0.5 rounded bg-muted/60">
                {entries.length}
              </span>
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {onClear && entries.length > 0 && (
                <button
                  type="button"
                  className="rounded-md p-1 hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                  onClick={onClear}
                  title="Clear log"
                >
                  <Trash2 className="combat-panel__icon" />
                </button>
              )}
              <button
                type="button"
                className="rounded-md p-1 hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                onClick={() => setMinimized(true)}
                title="Minimize log panel"
              >
                <Minimize2 className="combat-panel__icon" />
              </button>
            </div>
          </div>

          <div className="h-px mx-2 bg-gradient-to-r from-transparent via-border to-transparent" />

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5 game-log-scroll">
            {entries.length === 0 ? (
              <p className="combat-panel__stat text-muted-foreground text-center py-4">No events yet</p>
            ) : (
              reversedEntries.map(entry => (
                <div key={entry.id} className="flex gap-1.5 items-start leading-tight">
                  <span className={`combat-panel__badge font-semibold flex-shrink-0 pt-px ${LOG_TYPE_COLORS[entry.type]}`}>
                    {LOG_TYPE_LABELS[entry.type]}
                  </span>
                  <span className="combat-panel__stat text-foreground/80 break-words min-w-0">
                    {entry.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
