import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Eye, Layers } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GameCardData } from './GameCard';

interface ClassDeckProps {
  classCards?: GameCardData[];
  className?: string;
  deckName?: string;
}

export default function ClassDeck({ 
  classCards = [], 
  className = '',
  deckName = 'Knight Deck'
}: ClassDeckProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  
  // Create stacked cards visual effect
  const renderCardStack = () => {
    const hasCards = classCards.length > 0;
    const topCard = hasCards ? classCards[0] : null;
    
    return (
      <div className="relative w-full h-full">
        {/* Base card shadows for stack effect */}
        {hasCards && classCards.length > 2 && (
          <div 
            className="absolute inset-0 bg-gradient-to-b from-primary/5 to-primary/10 rounded-lg"
            style={{ transform: 'translateY(4px) translateX(2px)' }}
          />
        )}
        {hasCards && classCards.length > 1 && (
          <div 
            className="absolute inset-0 bg-gradient-to-b from-primary/10 to-primary/15 rounded-lg"
            style={{ transform: 'translateY(2px) translateX(1px)' }}
          />
        )}
        
        {/* Top card or empty state */}
        <div className="relative w-full h-full bg-gradient-to-b from-primary/15 to-primary/20 rounded-lg border-2 border-primary/30 flex flex-col items-center justify-center p-2">
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
                <Shield className="w-8 h-8 text-primary mb-1" />
                <span className="text-xs font-medium text-primary">{deckName}</span>
              </div>
            </>
          ) : (
            <>
              {/* Empty deck state */}
              <Shield className="w-8 h-8 text-primary/50 mb-1" />
              <span className="text-xs font-medium text-primary/70">{deckName}</span>
              <span className="text-xs text-muted-foreground">Empty</span>
            </>
          )}
        </div>
        
        {/* Card count badge */}
        {classCards.length > 0 && (
          <Badge 
            variant="default"
            className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center p-0 rounded-full text-xs bg-primary"
          >
            {classCards.length}
          </Badge>
        )}
        
        {/* View indicator */}
        <Eye className="absolute bottom-1 right-1 w-4 h-4 text-primary/30" />
      </div>
    );
  };
  
  // Group cards by type for viewer
  const groupedCards = classCards.reduce((acc, card) => {
    const type = card.skillType || card.type || 'other';
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(card);
    return acc;
  }, {} as Record<string, GameCardData[]>);
  
  return (
    <>
      <Card 
        className={`
          relative cursor-pointer transition-all duration-200
          hover-elevate active-elevate-2
          bg-card border-2 border-card-border
          ${className}
        `}
        onClick={() => setViewerOpen(true)}
        data-testid="class-deck"
      >
        <div className="w-full h-full p-2">
          {renderCardStack()}
        </div>
      </Card>

      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="class-deck-viewer-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-6 h-6" />
              {deckName} ({classCards.length} cards)
            </DialogTitle>
            <DialogDescription>
              Class-specific abilities and skills
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {classCards.length === 0 ? (
              <div className="text-center py-8">
                <Shield className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
                <p className="text-muted-foreground">No class cards yet</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Class cards will be added as you progress
                </p>
              </div>
            ) : (
              Object.entries(groupedCards).map(([type, cards]) => (
                <div key={type}>
                  <h3 className="font-semibold mb-2 capitalize flex items-center gap-2">
                    <Badge variant="secondary">
                      {type} ({cards.length})
                    </Badge>
                  </h3>
                  <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                    {cards.map((card, idx) => (
                      <Card 
                        key={`${card.id}-${idx}`}
                        className="p-2 border-2 border-card-border overflow-hidden"
                      >
                        <div className="relative aspect-square bg-gradient-to-b from-primary/10 to-primary/5 overflow-hidden rounded-sm mb-1">
                          {card.image && (
                            <img 
                              src={card.image} 
                              alt={card.name}
                              className="w-full h-full object-cover"
                            />
                          )}
                          {card.skillType && (
                            <Badge 
                              variant="outline" 
                              className="absolute top-0 left-0 text-xs px-1 py-0"
                            >
                              {card.skillType}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-center font-medium truncate">{card.name}</p>
                        {card.skillEffect && (
                          <p className="text-xs text-center text-muted-foreground truncate">
                            {card.skillEffect}
                          </p>
                        )}
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