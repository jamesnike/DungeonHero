import { useState } from 'react';
import GameCard, { type GameCardData } from './GameCard';

interface HandDisplayProps {
  handCards: GameCardData[];
  onPlayCard?: (card: GameCardData, target?: any) => void;
  onDragCardFromHand?: (card: GameCardData) => void;
  onDragEndFromHand?: () => void;
  maxHandSize?: number;
}

export default function HandDisplay({ 
  handCards, 
  onPlayCard,
  onDragCardFromHand,
  onDragEndFromHand,
  maxHandSize = 7
}: HandDisplayProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isDraggingCard, setIsDraggingCard] = useState(false);

  const handleDragStart = (card: GameCardData) => {
    setIsDraggingCard(true);
    onDragCardFromHand?.(card);
  };

  const handleDragEnd = () => {
    setIsDraggingCard(false);
    onDragEndFromHand?.();
  };

  // Simplified card sizing - use fixed sizes that work on mobile
  const cardHeight = 140; // Fixed height for mobile compatibility
  const cardWidth = cardHeight * 0.714; // Maintain aspect ratio (5:7)
  const visibleHeight = cardHeight * 0.66; // Show 2/3 of card height
  
  return (
    <div 
      className="fixed bottom-0 left-0 right-0 pointer-events-none"
      style={{ 
        height: `${visibleHeight}px`,
        zIndex: 50,
        overflow: hoveredIndex !== null ? 'visible' : 'hidden'
      }}
    >
      <div className="relative h-full w-full flex items-center justify-center">
        <div className="relative" style={{ height: `${cardHeight}px`, width: '100%' }}>
          {handCards.map((card, index) => {
            const isHovered = hoveredIndex === index;
            
            // Position cards centered with overlap, push down to show only 2/3
            const totalWidth = handCards.length * cardWidth * 0.4;
            const startX = -totalWidth / 2;
            const cardX = startX + (index * cardWidth * 0.4);
            const pushDown = cardHeight * 0.34; // Push down by 1/3 of card height
            const hoverLift = isHovered ? -pushDown - 10 : 0; // Lift to show full card
            
            return (
              <div
                key={card.id}
                className="absolute pointer-events-auto transition-all duration-200 ease-out"
                style={{
                  left: '50%',
                  top: `${pushDown}px`,
                  transform: `translateX(${cardX}px) translateY(${hoverLift}px) ${isHovered ? 'scale(1.08)' : 'scale(1)'}`,
                  zIndex: isHovered ? 100 : index + 1,
                  height: `${cardHeight}px`,
                  width: `${cardWidth}px`,
                }}
                onMouseEnter={() => !isDraggingCard && setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                data-testid={`hand-card-${index}`}
              >
                <GameCard
                  card={card}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  className={isHovered ? 'shadow-2xl' : 'shadow-lg'}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}