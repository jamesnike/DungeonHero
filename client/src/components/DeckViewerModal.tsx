import { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { type GameCardData } from './GameCard';
import { Skull, Sword, Shield, Heart, Sparkles, Zap, Scroll, Wand2 } from 'lucide-react';

const DEV_MODE = process.env.NODE_ENV !== 'production';

interface DeckViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  remainingCards: GameCardData[];
  onCardSelect?: (card: GameCardData) => void;
}

export default function DeckViewerModal({ open, onOpenChange, remainingCards, onCardSelect }: DeckViewerModalProps) {
  const cardsByType = {
    monster: remainingCards.filter(c => c.type === 'monster'),
    weapon: remainingCards.filter(c => c.type === 'weapon'),
    shield: remainingCards.filter(c => c.type === 'shield'),
    potion: remainingCards.filter(c => c.type === 'potion'),
    amulet: remainingCards.filter(c => c.type === 'amulet'),
    skill: remainingCards.filter(c => c.type === 'skill'),
    magic: remainingCards.filter(c => c.type === 'magic'),
    event: remainingCards.filter(c => c.type === 'event'),
  };

  useEffect(() => {
    if (!DEV_MODE || !open) return;
    const counts = remainingCards.reduce<Record<string, number>>((acc, card) => {
      acc[card.type] = (acc[card.type] ?? 0) + 1;
      return acc;
    }, {});
    // eslint-disable-next-line no-console
    console.debug('[DeckViewerModal] remaining card counts', counts);
  }, [open, remainingCards]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'monster':
        return <Skull className="w-5 h-5 text-primary" />;
      case 'weapon':
        return <Sword className="w-5 h-5 text-amber-500" />;
      case 'shield':
        return <Shield className="w-5 h-5 text-blue-500" />;
      case 'potion':
        return <Heart className="w-5 h-5 text-destructive" />;
      case 'amulet':
        return <Sparkles className="w-5 h-5 text-purple-500" />;
      case 'skill':
        return <Zap className="w-5 h-5 text-cyan-500" />;
      case 'magic':
        return <Wand2 className="w-5 h-5 text-emerald-400" />;
      case 'event':
        return <Scroll className="w-5 h-5 text-violet-500" />;
      default:
        return null;
    }
  };

  const getTypeLabel = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1) + 's';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" data-testid="deck-viewer-modal">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Remaining Deck</DialogTitle>
          <DialogDescription>
            {remainingCards.length} cards left in the deck
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {Object.entries(cardsByType).map(([type, cards]) => (
            cards.length > 0 && (
              <div key={type} className="space-y-3">
                <div className="flex items-center gap-2">
                  {getIcon(type)}
                  <h3 className="font-semibold">{getTypeLabel(type)}</h3>
                  <Badge variant="outline" className="font-mono">
                    {cards.length}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-6 gap-2">
                  {cards.map((card) => (
                    <Card
                      key={card.id}
                      className={`p-2 flex flex-col items-center gap-1 bg-muted/50 hover-elevate ${onCardSelect ? 'cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none' : ''}`.trim()}
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
                      {card.image && (
                        <div className="w-full aspect-square rounded overflow-hidden bg-gradient-to-b from-muted to-card">
                          <img
                            src={card.image}
                            alt={card.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="text-center w-full">
                        <p className="text-[10px] font-medium truncate">{card.name}</p>
                        <Badge variant="outline" className="text-xs">
                          {card.value}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )
          ))}
          
          {remainingCards.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>The deck is empty. Victory is near!</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
