import { Card } from '@/components/ui/card';
import { Eye, Skull } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
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
import cardBackImage from '@assets/generated_images/card_back_design.png';

interface GraveyardZoneProps {
  onDrop?: (item: any) => void;
  isDropTarget?: boolean;
  discardedCards: GameCardData[];
}

export default function GraveyardZone({ onDrop, isDropTarget, discardedCards }: GraveyardZoneProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const graveyardRef = useRef<HTMLDivElement>(null);
  
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

  // Render card stack visualization with card backs
  const renderCardStack = () => {
    const cardCount = discardedCards.length;
    const hasCards = cardCount > 0;
    // Show max 5 card layers for visual effect
    const visibleStackDepth = Math.min(cardCount, 5);
    
    return (
      <div className="relative w-full h-full">
        {/* Card stack effect - render multiple card backs */}
        {hasCards && [...Array(visibleStackDepth)].map((_, i) => {
          const isTopCard = i === visibleStackDepth - 1;
          const offset = (visibleStackDepth - 1 - i) * 2; // Reverse order so top card is last
          
          return (
            <div
              key={i}
              className="absolute inset-0"
              style={{
                transform: `translateY(${offset}px) translateX(${offset * 0.5}px)`,
                zIndex: i
              }}
            >
              <img 
                src={cardBackImage}
                alt=""
                className={`w-full h-full object-cover rounded-lg ${
                  isTopCard ? '' : 'brightness-90'
                }`}
                style={{
                  filter: isTopCard ? '' : `brightness(${0.9 - (visibleStackDepth - 1 - i) * 0.05})`
                }}
              />
            </div>
          );
        })}
        
        {/* Empty state - show a single semi-transparent card back */}
        {!hasCards && (
          <img 
            src={cardBackImage}
            alt=""
            className="w-full h-full object-cover rounded-lg opacity-30"
          />
        )}
        
        {/* Overlay with card count */}
        <div className={`
          absolute inset-0 flex items-center justify-center rounded-lg
          ${isDropTarget ? 'bg-destructive/40 ring-4 ring-destructive' : ''}
        `}>
          {/* Dark overlay to make count visible */}
          {hasCards && (
            <div className="absolute inset-0 bg-black/40 rounded-lg" />
          )}
          
          {/* Card count display */}
          <div className="relative z-10 text-center">
            {hasCards ? (
              <div className="text-6xl font-bold text-white drop-shadow-2xl">
                {cardCount}
              </div>
            ) : (
              <div className="text-lg font-medium text-muted-foreground/70">
                Empty
              </div>
            )}
          </div>
        </div>
        
        {/* Click indicator */}
        <div className="absolute bottom-2 right-2 bg-black/50 rounded-full p-1">
          <Eye className="w-3 h-3 text-white/70" />
        </div>
      </div>
    );
  };

  return (
    <>
      <div 
        ref={graveyardRef}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="cursor-pointer transition-all duration-200 hover:scale-105"
        style={{ 
          width: 'clamp(100px, 15vw, 200px)', 
          height: 'clamp(140px, 21vw, 280px)' 
        }}
        onClick={() => setViewerOpen(true)}
        data-testid="graveyard-zone"
      >
        {renderCardStack()}
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
