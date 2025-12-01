import { Card } from '@/components/ui/card';
import { Eye, Skull } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from '@/components/ui/badge';
import { GameCardData } from './GameCard';
import { initMobileDrop } from '../utils/mobileDragDrop';
import StackedCardPile from './StackedCardPile';
import { cn } from '@/lib/utils';

interface GraveyardZoneProps {
  onDrop?: (item: any) => void;
  isDropTarget?: boolean;
  discardedCards: GameCardData[];
  shouldHighlight?: boolean;
  onCardSelect?: (card: GameCardData) => void;
}

export default function GraveyardZone({ onDrop, isDropTarget, discardedCards, shouldHighlight = false, onCardSelect }: GraveyardZoneProps) {
  const [dragDepth, setDragDepth] = React.useState(0);
  const isOver = dragDepth > 0;
  const [viewerOpen, setViewerOpen] = useState(false);
  const graveyardRef = useRef<HTMLDivElement>(null);
  const isHighlightActive = shouldHighlight && isDropTarget && isOver;
  
  // Set up mobile drop support
  useEffect(() => {
    if (!graveyardRef.current || !onDrop) return;
    
    const cleanup = initMobileDrop(
      graveyardRef.current,
      (dragData) => {
        // Handle both card and equipment drops
        onDrop(dragData.data);
      },
      ['card', 'equipment'] // Accept both card and equipment drops
    );
    
    return cleanup;
  }, [onDrop]);
  
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
      <Card
        ref={graveyardRef}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => setViewerOpen(true)}
        data-testid="graveyard-zone"
        className={cn(
          'relative h-full w-full cursor-pointer overflow-hidden border-2 border-card-border bg-gradient-to-br from-slate-950/80 via-slate-900/50 to-zinc-900/30 transition-all duration-200',
          isHighlightActive && 'ring-4 ring-destructive/60 animate-pulse',
          isHighlightActive && 'scale-105 ring-destructive bg-destructive/20',
          !isDropTarget && 'hover:scale-[1.01]'
        )}
      >
        <StackedCardPile 
          count={discardedCards.length} 
          className="rounded-xl" 
          variant="muted"
          label="Graveyard"
        />
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-200">
            <span className="font-semibold">Graveyard</span>
            <Badge variant="outline" className="bg-black/40 text-white font-mono text-sm px-2 py-0.5">
              {discardedCards.length}
            </Badge>
          </div>
          <div className="flex items-center justify-end gap-2 text-white/90">
            <Eye className="w-4 h-4" />
            <span className="text-[11px] font-medium">View</span>
          </div>
        </div>
      </Card>

      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="graveyard-viewer-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Skull className="w-6 h-6" />
              Graveyard ({discardedCards.length} cards)
            </DialogTitle>
            <DialogDescription>
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
                          {card.image && (
                            <img 
                              src={card.image} 
                              alt={card.name}
                              className="w-full h-full object-cover"
                            />
                          )}
                          <div className="absolute top-0 right-0 bg-background/80 backdrop-blur-sm rounded-bl px-1">
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
        </DialogContent>
      </Dialog>
    </>
  );
}
