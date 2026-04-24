import { Card } from '@/components/ui/card';
import { Eye, Skull } from 'lucide-react';
import React, { memo, useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CardBackDialogContent } from "@/components/ui/CardBackDialogContent";
import { Badge } from '@/components/ui/badge';
import { GameCardData } from './GameCard';
import {
  EventPatternPreview,
  MagicSpellPreview,
  isEventCardType,
  isMagicSpellCardType,
} from './MagicNameFlankIcons';
import { initMobileDrop, type DragData } from '../utils/mobileDragDrop';
import StackedCardPile from './StackedCardPile';
import { cn } from '@/lib/utils';
import { useGameViewport } from '@/contexts/GameViewportContext';
import { FLAT_ASPECT_RATIO } from './game-board/constants';
import { captureModalOriginFromEvent } from '@/lib/modalOriginAnchor';
import { useDialogOriginAnchor } from '@/hooks/use-dialog-origin-anchor';

interface GraveyardZoneProps {
  onDrop?: (item: any) => void;
  isDropTarget?: boolean;
  discardedCards: GameCardData[];
  shouldHighlight?: boolean;
  onCardSelect?: (card: GameCardData) => void;
  compact?: boolean;
  compactStyle?: React.CSSProperties;
}

function GraveyardZoneInner({ onDrop, isDropTarget, discardedCards, shouldHighlight = false, onCardSelect, compact = false, compactStyle }: GraveyardZoneProps) {
  const gameViewport = useGameViewport();
  const isFlat = gameViewport.width / gameViewport.height > FLAT_ASPECT_RATIO;
  const [dragDepth, setDragDepth] = React.useState(0);
  const isOver = dragDepth > 0;
  const [viewerOpen, setViewerOpen] = useState(false);
  const graveyardRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef<HTMLButtonElement>(null);
  const isReadyToReceive = shouldHighlight && isDropTarget;
  const isHoverActive = isReadyToReceive && isOver;
  // Touch devices (primary pointer = coarse). On touch, the wider invisible
  // `hitExtension` is disabled so the outer button never covers neighbouring
  // elements (e.g. the right equipment slot). Mouse-driven HTML5 drag keeps
  // the wider hit area for pointer precision.
  const [isTouchDevice] = useState(() =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );
  const originRefCallback = useDialogOriginAnchor();

  /** Capture cell rect → modal grows from this position. */
  const handleOpenViewer = (e: React.MouseEvent<HTMLElement>) => {
    captureModalOriginFromEvent(e);
    setViewerOpen(true);
  };
  
  // Set up mobile drop support (full card)
  useEffect(() => {
    if (!graveyardRef.current || !onDrop) return;
    
    const cleanup = initMobileDrop(
      graveyardRef.current,
      (dragData) => {
        onDrop(dragData.data);
      },
      ['card', 'equipment']
    );
    
    return cleanup;
  }, [onDrop]);

  // Mobile drop registration. On touch the outer button has no hit-extension
  // (see `hitExtension` below), so it exactly matches the visible strip.
  useEffect(() => {
    if (!compact || !compactRef.current || !onDrop) return;

    const cleanup = initMobileDrop(
      compactRef.current,
      (dragData) => {
        onDrop(dragData.data);
      },
      ['card', 'equipment']
    );

    return cleanup;
  }, [compact, onDrop]);

  // Mobile: mirror onDragEnter/onDragLeave by tracking touch position over the
  // compact button so the scale-up "drop target" effect also works on touch.
  useEffect(() => {
    if (!compact || !isDropTarget) {
      setDragDepth(0);
      return;
    }

    let inside = false;
    const handleMobileMove = (e: Event) => {
      const detail = (e as CustomEvent).detail as DragData | undefined;
      if (!detail || (detail.type !== 'card' && detail.type !== 'equipment')) return;
      const el = compactRef.current;
      if (!el) return;
      const cx = detail.clientX;
      const cy = detail.clientY;
      if (typeof cx !== 'number' || typeof cy !== 'number') return;
      const rect = el.getBoundingClientRect();
      const within = cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
      if (within !== inside) {
        inside = within;
        setDragDepth(within ? 1 : 0);
      }
    };
    const handleMobileEnd = () => {
      if (inside) {
        inside = false;
        setDragDepth(0);
      }
    };

    document.addEventListener('mobile-drag-move', handleMobileMove);
    document.addEventListener('mobile-drag-end', handleMobileEnd);
    return () => {
      document.removeEventListener('mobile-drag-move', handleMobileMove);
      document.removeEventListener('mobile-drag-end', handleMobileEnd);
    };
  }, [compact, isDropTarget]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (isDropTarget) {
      setDragDepth(prev => prev + 1);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (isDropTarget && dragDepth === 0) {
      setDragDepth(1);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (isDropTarget) {
      setDragDepth(prev => Math.max(0, prev - 1));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragDepth(0);
    const cardData = e.dataTransfer.getData('card');
    const equipmentData = e.dataTransfer.getData('equipment');
    
    if (cardData) {
      onDrop?.(JSON.parse(cardData));
    } else if (equipmentData) {
      onDrop?.(JSON.parse(equipmentData));
    }
  };

  // Group cards by type for display
  const groupedCards = discardedCards.reduce((acc, card) => {
    if (!acc[card.type]) {
      acc[card.type] = [];
    }
    acc[card.type].push(card);
    return acc;
  }, {} as Record<string, GameCardData[]>);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'monster': return 'bg-destructive/20 text-destructive';
      case 'weapon': return 'bg-amber-500/20 text-amber-600';
      case 'shield': return 'bg-blue-500/20 text-blue-600';
      case 'potion': return 'bg-green-500/20 text-green-600';
      case 'coin': return 'bg-yellow-500/20 text-yellow-600';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <>
      {compact ? (() => {
        // Visible strip stays narrow (flush with the screen's right edge),
        // but the drop hit-area is widened leftward via a transparent outer
        // button so cards register as accepted before being dragged most of
        // the way past the screen edge. The visible strip is rendered as a
        // right-aligned inner span and owns the visual styling.
        //
        // The extension is ONLY applied while a drop-eligible card is being
        // dragged — otherwise the wider invisible area would intercept
        // clicks meant for active-row cards underneath the right edge.
        const stripWidth =
          typeof compactStyle?.width === 'number' ? compactStyle.width : 22;
        const stripHeight =
          typeof compactStyle?.height === 'number' ? compactStyle.height : 100;
        // Always apply a small baseline so the narrow visible strip is easier
        // to click. While a drop-eligible card is being dragged on a mouse
        // device we widen further for drop precision.
        const HIT_EXTENSION_BASE = 12;
        const dragExtension = isDropTarget && !isTouchDevice
          ? Math.max(48, Math.round(stripHeight * 0.4))
          : 0;
        const hitExtension = Math.max(HIT_EXTENSION_BASE, dragExtension);
        const outerStyle: React.CSSProperties = {
          ...compactStyle,
          width: stripWidth + hitExtension,
        };
        const innerStyle: React.CSSProperties = { width: stripWidth, height: '100%' };

        return (
          <button
            ref={compactRef}
            onClick={handleOpenViewer}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            data-testid="graveyard-zone-compact"
            className="group relative flex items-stretch justify-end bg-transparent border-0 p-0 cursor-pointer"
            style={outerStyle}
          >
            <span
              className={cn(
                'flex flex-col items-center justify-center rounded-l-lg border border-r-0 transition-all duration-150',
                // Mirror the BackpackZone compact button's drag-feedback rules
                // (no extra `shouldHighlight` gate) so the slight scale-up on
                // hover fires under the same droppable condition.
                isDropTarget && isOver
                  ? 'border-destructive bg-destructive/30 text-white ring-2 ring-destructive/60 scale-110'
                  : isDropTarget
                    ? 'border-primary/50 bg-slate-600/30 text-slate-200 animate-pulse'
                    : 'border-slate-400/30 bg-slate-700/20 text-slate-300/70 group-hover:bg-slate-600/30 group-hover:border-slate-400/50'
              )}
              style={innerStyle}
            >
              <Skull className="w-4 h-4" />
              {discardedCards.length > 0 && (
                <span className="mt-0.5 px-1 rounded text-[10px] font-bold leading-none text-white bg-slate-500/90 ring-1 ring-slate-200/70 shadow-sm">
                  {discardedCards.length}
                </span>
              )}
            </span>
          </button>
        );
      })() : (
        <Card
          ref={graveyardRef}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleOpenViewer}
          data-testid="graveyard-zone"
          className={cn(
            // overflow-visible：让 StackedCardPile 的"一摞牌"溢出 cell 上沿，
            // 给"卡牌堆叠 + 顶层抬起"的物理感。原来是 overflow-hidden 把 stack 整个剪掉。
            'relative h-full w-full cursor-pointer overflow-visible border-2 border-card-border bg-gradient-to-br from-slate-950/80 via-slate-900/50 to-zinc-900/30 transition-[border-color,ring,box-shadow] duration-200',
            isReadyToReceive && !isHoverActive && 'border-dashed border-primary animate-pulse',
            isHoverActive && 'ring-4 ring-destructive/60 animate-pulse scale-105 ring-destructive bg-destructive/20',
            !isDropTarget && 'hover:scale-[1.01]'
          )}
        >
          {isFlat ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-200">
              <span className="text-[8px] sm:text-[10px] font-semibold uppercase tracking-wide">Graveyard</span>
              <span className="font-mono font-bold text-lg">{discardedCards.length}</span>
            </div>
          ) : (
            <>
              <StackedCardPile 
                count={discardedCards.length} 
                className="rounded-xl" 
                variant="muted"
                label="Graveyard"
              />
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-1 sm:p-3">
                <div className="flex items-center justify-between text-[8px] sm:text-[10px] uppercase tracking-wide text-slate-200">
                  <span className="font-semibold">Graveyard</span>
                  <Badge variant="outline" className="bg-black/40 text-white font-mono text-[9px] sm:text-sm px-1 sm:px-2 py-0 sm:py-0.5">
                    {discardedCards.length}
                  </Badge>
                </div>
                <div className="flex items-center justify-end gap-1 sm:gap-2 text-white/90">
                  <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="text-[9px] sm:text-[11px] font-medium">View</span>
                </div>
              </div>
            </>
          )}
        </Card>
      )}

      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <CardBackDialogContent
          ref={originRefCallback}
          variant="muted"
          contentMotion="origin"
          className="w-[min(90vw,42rem)]"
          bodyClassName="max-h-[85vh] overflow-y-auto"
          data-testid="graveyard-viewer-modal"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Skull className="w-6 h-6" />
              Graveyard ({discardedCards.length} cards)
            </DialogTitle>
            <DialogDescription className="text-white/70">
              All used, sold, and discarded cards
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {Object.keys(groupedCards).length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No cards in graveyard yet</p>
            ) : (
              Object.entries(groupedCards).map(([type, cards]) => (
                <div key={type}>
                  <h3 className="font-semibold mb-2 capitalize flex items-center gap-2">
                    <Badge className={getTypeColor(type)}>
                      {type}s ({(cards as GameCardData[]).length})
                    </Badge>
                  </h3>
                  <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                    {(cards as GameCardData[]).map((card: GameCardData, idx: number) => (
                      <Card 
                        key={`${card.id}-${idx}`}
                        className={`p-2 border-2 border-card-border overflow-hidden ${onCardSelect ? 'cursor-pointer hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none' : ''}`.trim()}
                        onClick={() => onCardSelect?.(card)}
                        role={onCardSelect ? 'button' : undefined}
                        tabIndex={onCardSelect ? 0 : undefined}
                        onKeyDown={event => {
                          if (!onCardSelect) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onCardSelect(card);
                          }
                        }}
                      >
                        <div className="relative aspect-square bg-gradient-to-b from-muted to-card overflow-hidden rounded-sm mb-1">
                          {isMagicSpellCardType(card.type) ? (
                            <MagicSpellPreview
                              card={card}
                              aspect="none"
                              lazyImage
                              className="absolute inset-0 h-full w-full rounded-sm"
                            />
                          ) : isEventCardType(card.type) ? (
                            <EventPatternPreview
                              card={card}
                              aspect="none"
                              lazyImage
                              className="absolute inset-0 h-full w-full rounded-sm"
                            />
                          ) : (
                            card.image && (
                              <img
                                src={card.image}
                                alt={card.name}
                                loading="lazy"
                                decoding="async"
                                fetchPriority="low"
                                className="h-full w-full object-cover"
                              />
                            )
                          )}
                          <div className="absolute top-0 right-0 bg-background/95 rounded-bl px-1">
                            <span className="font-mono font-bold text-xs">{card.value}</span>
                          </div>
                        </div>
                        <p className="text-xs text-center font-medium truncate">{card.name}</p>
                      </Card>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardBackDialogContent>
      </Dialog>
    </>
  );
}

export default memo(GraveyardZoneInner);
