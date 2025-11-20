import { Card } from '@/components/ui/card';
import { Skull, Eye } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from '@/components/ui/badge';
import { GameCardData } from './GameCard';

interface GraveyardZoneProps {
  onDrop?: (item: any) => void;
  isDropTarget?: boolean;
  discardedCards: GameCardData[];
}

export default function GraveyardZone({ onDrop, isDropTarget, discardedCards }: GraveyardZoneProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
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

  // Get the top card for display
  const topCard = discardedCards.length > 0 ? discardedCards[discardedCards.length - 1] : null;

  // Render card stack visualization with enhanced thickness
  const renderCardStack = () => {
    const hasCards = discardedCards.length > 0;
    const stackDepth = Math.min(discardedCards.length, 10); // Cap at 10 for performance
    
    return (
      <div className="relative w-full h-full">
        {/* Enhanced stack effect - render multiple shadow layers based on card count */}
        {hasCards && [...Array(Math.floor(stackDepth / 2))].map((_, i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-lg"
            style={{
              background: `linear-gradient(to bottom, hsl(var(--destructive) / ${0.02 + i * 0.02}), hsl(var(--destructive) / ${0.04 + i * 0.02}))`,
              transform: `translateY(${(i + 1) * 2}px) translateX(${(i + 1) * 1}px)`,
              boxShadow: `0 ${i + 1}px ${(i + 1) * 2}px rgba(0, 0, 0, 0.1)`,
              zIndex: -i - 1
            }}
          />
        ))}
        
        {/* Top card or empty state */}
        <div className={`
          relative w-full h-full rounded-lg border-2 flex flex-col items-center justify-center p-2
          ${isDropTarget ? 'bg-destructive/20 border-destructive' : 'bg-gradient-to-b from-muted/40 to-muted/60 border-muted-foreground/30'}
        `}>
          {hasCards && topCard ? (
            <>
              {/* Show top card image if available */}
              {topCard.image && (
                <div className="absolute inset-2 opacity-30">
                  <img 
                    src={topCard.image} 
                    alt={topCard.name}
                    className="w-full h-full object-cover rounded"
                  />
                </div>
              )}
              <div className="relative z-10 text-center">
                <Skull className="w-8 h-8 text-muted-foreground mb-1" />
                <span className="text-xs font-medium text-muted-foreground">Graveyard</span>
              </div>
            </>
          ) : (
            <>
              {/* Empty graveyard state */}
              <Skull className="w-8 h-8 text-muted-foreground/50 mb-1" />
              <span className="text-xs font-medium text-muted-foreground/70">Graveyard</span>
              <span className="text-xs text-muted-foreground/50">Empty</span>
            </>
          )}
        </div>
        
        {/* Card count badge */}
        {discardedCards.length > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center p-0 rounded-full text-xs"
          >
            {discardedCards.length}
          </Badge>
        )}
        
        {/* View indicator */}
        <Eye className="absolute bottom-1 right-1 w-4 h-4 text-muted-foreground/30" />
      </div>
    );
  };

  return (
    <>
      <div 
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="relative"
        data-testid="graveyard-zone"
      >
        <Card 
          className={`
            cursor-pointer transition-all duration-200
            hover-elevate active-elevate-2
            border-2 bg-card
            ${isDropTarget ? 'border-destructive border-4' : 'border-card-border'}
          `}
          onClick={() => setViewerOpen(true)}
        >
          <div className="w-full h-full p-2">
            {renderCardStack()}
          </div>
        </Card>
      </div>

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
                        className="p-2 border-2 border-card-border overflow-hidden"
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
