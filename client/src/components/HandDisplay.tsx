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

  // Responsive card sizing based on viewport
  const cardHeight = 80; // Base height in pixels
  const cardWidth = cardHeight * 0.714; // Maintain aspect ratio (5:7)
  
  return (
    <div 
      className="absolute inset-0 pointer-events-none"
      style={{ 
        zIndex: 50,
        overflow: hoveredIndex !== null ? 'visible' : 'hidden'
      }}
    >
      <div className="relative h-full w-full flex items-end justify-center pb-1">
        <div className="relative flex items-center justify-center">
          {handCards.map((card, index) => {
            const isHovered = hoveredIndex === index;
            
            // Position cards centered with overlap
            const totalWidth = handCards.length * cardWidth * 0.5;
            const startX = -totalWidth / 2;
            const cardX = startX + (index * cardWidth * 0.5);
            const baseY = isHovered ? -20 : 0; // Lift on hover
            
            return (
              <div
                key={card.id}
                className="absolute pointer-events-auto transition-all duration-200 ease-out"
                style={{
                  transform: `translateX(${cardX}px) translateY(${baseY}px) ${isHovered ? 'scale(1.1)' : 'scale(1)'}`,
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