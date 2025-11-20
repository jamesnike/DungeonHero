import { Card } from '@/components/ui/card';
import { Hand } from 'lucide-react';
import GameCard, { type GameCardData } from './GameCard';

interface HandAreaProps {
  handCards: GameCardData[];
  onDropToHand?: (card: GameCardData) => void;
  onDragCardFromHand?: (card: GameCardData) => void;
  onDragEndFromHand?: () => void;
  isDropTarget?: boolean;
  maxHandSize?: number;
}

export default function HandArea({ 
  handCards, 
  onDropToHand, 
  onDragCardFromHand,
  onDragEndFromHand,
  isDropTarget,
  maxHandSize = 5 
}: HandAreaProps) {
  const handleDragOver = (e: React.DragEvent) => {
    if (handCards.length < maxHandSize) {
      e.preventDefault();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const cardData = e.dataTransfer.getData('card');
    if (cardData && handCards.length < maxHandSize) {
      const card = JSON.parse(cardData);
      onDropToHand?.(card);
    }
  };

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t-2 border-card-border shadow-2xl"
      style={{ height: 'clamp(140px, 18vh, 240px)' }}
    >
      <div className="h-full px-4 py-2 lg:px-8">
        {/* Hand header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Hand className="w-5 h-5 text-primary" />
            <span className="font-bold text-lg">Hand</span>
            <span className="text-muted-foreground">({handCards.length}/{maxHandSize})</span>
          </div>
          {handCards.length === 0 && (
            <p className="text-sm text-muted-foreground">Drag cards here to save them for later</p>
          )}
        </div>

        {/* Hand cards area */}
        <div 
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`
            h-[calc(100%-2rem)] rounded-lg border-2 transition-all duration-200
            ${isDropTarget && handCards.length < maxHandSize 
              ? 'border-primary border-dashed bg-primary/10' 
              : 'border-transparent'
            }
          `}
        >
          {handCards.length > 0 ? (
            <div className="flex gap-3 p-2 h-full items-center overflow-x-auto">
              {handCards.map((card) => (
                <div key={card.id} style={{ flexShrink: 0 }}>
                  <GameCard
                    card={card}
                    onDragStart={onDragCardFromHand}
                    onDragEnd={onDragEndFromHand}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Hand className="w-12 h-12 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-sm text-muted-foreground">
                  {handCards.length < maxHandSize 
                    ? "Your hand is empty - drag cards here to save them" 
                    : "Hand is full (5 card limit)"
                  }
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}