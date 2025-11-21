import { useState, useRef, useEffect } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate fan arrangement
  const calculateCardTransform = (index: number, total: number) => {
    if (total === 0) return { rotate: 0, translateX: 0, translateY: 0 };
    
    const centerIndex = (total - 1) / 2;
    const offset = index - centerIndex;
    
    // Calculate rotation - spread cards in an arc
    const maxRotation = Math.min(20, total * 3); // Max 20 degrees, or 3 degrees per card
    const rotationStep = maxRotation / Math.max(1, total - 1);
    const rotation = offset * rotationStep;
    
    // Calculate horizontal spread
    const cardWidth = 120; // Approximate card width in pixels
    const overlap = 0.3; // 30% overlap
    const horizontalSpacing = cardWidth * (1 - overlap);
    const translateX = offset * horizontalSpacing;
    
    // Calculate vertical position (cards at edges slightly lower)
    const translateY = Math.abs(offset) * Math.abs(offset) * 2;
    
    return {
      rotate: rotation,
      translateX: translateX,
      translateY: translateY
    };
  };

  const handleDragStart = (card: GameCardData) => {
    setIsDraggingCard(true);
    onDragCardFromHand?.(card);
  };

  const handleDragEnd = () => {
    setIsDraggingCard(false);
    onDragEndFromHand?.();
  };


  return (
    <>
      {/* Main Hand Display - Show 2/3 of cards, allow overflow on hover */}
      <div 
        className="fixed left-0 right-0 pointer-events-none"
        style={{ 
          bottom: '0px', 
          height: '120px', 
          zIndex: 20,
          overflow: hoveredIndex !== null ? 'visible' : 'hidden'
        }}
      >
        <div className="relative h-full flex items-end justify-center">
          {/* Cards container with perspective */}
          <div 
            ref={containerRef}
            className="relative"
            style={{ 
              perspective: '1000px',
              transformStyle: 'preserve-3d'
            }}
          >
            {handCards.map((card, index) => {
              const transform = calculateCardTransform(index, handCards.length);
              const isHovered = hoveredIndex === index;
              
              return (
                <div
                  key={card.id}
                  className={`
                    absolute pointer-events-auto
                    transition-all duration-200 ease-out
                  `}
                  style={{
                    transform: `
                      translateX(${transform.translateX}px)
                      translateY(${isHovered ? -70 : transform.translateY + 50}px)
                      rotate(${transform.rotate}deg)
                      scale(${isHovered ? 1.08 : 1})
                    `,
                    zIndex: isHovered ? 100 : index + 1,
                    transformOrigin: 'bottom center',
                    filter: isHovered ? 'brightness(1.1)' : 'none',
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

    </>
  );
}