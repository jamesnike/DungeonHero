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
            w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 cursor-pointer
            flex flex-col items-center justify-center gap-1
            border-2 transition-all duration-200
            ${isDropTarget ? 'border-destructive border-4 bg-destructive/10' : 'border-border bg-card'}
            hover-elevate active-elevate-2
          `}
          onClick={() => setViewerOpen(true)}
        >
          <Skull className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground hidden sm:inline">Graveyard</span>
          {discardedCards.length > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center p-0 rounded-full text-xs"
            >
              {discardedCards.length}
            </Badge>
          )}
          <Eye className="absolute bottom-1 right-1 w-4 h-4 text-muted-foreground/50" />
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
