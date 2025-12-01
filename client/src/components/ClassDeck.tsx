import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Eye } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GameCardData } from './GameCard';
import StackedCardPile from './StackedCardPile';
import { cn } from '@/lib/utils';

interface ClassDeckProps {
  classCards?: GameCardData[];
  className?: string;
  deckName?: string;
  onCardSelect?: (card: GameCardData) => void;
}

export default function ClassDeck({ 
  classCards = [], 
  className = '',
  deckName = 'Knight Deck',
  onCardSelect,
}: ClassDeckProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  
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
        className={cn(
          'relative h-full w-full cursor-pointer overflow-hidden border-2 border-card-border bg-gradient-to-br from-indigo-950/70 via-indigo-900/40 to-indigo-800/30 transition-all duration-200 hover:scale-[1.01]',
          className
        )}
        onClick={() => setViewerOpen(true)}
        data-testid="class-deck"
      >
        <StackedCardPile 
          count={classCards.length} 
          className="rounded-xl"
          variant="bright"
          label={deckName}
        />
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-indigo-100">
            <span className="font-semibold flex items-center gap-1">
              <Shield className="w-3 h-3" />
              {deckName}
            </span>
            <Badge variant="outline" className="bg-black/30 text-white font-mono text-sm px-2 py-0.5">
              {classCards.length}
            </Badge>
          </div>
          <div className="flex items-center justify-end gap-2 text-indigo-100">
            <Eye className="w-4 h-4" />
            <span className="text-[11px] font-medium">Browse</span>
          </div>
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