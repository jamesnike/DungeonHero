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

  // Calculate fan arrangement with responsive sizing
  const calculateCardTransform = (index: number, total: number, cardWidth: number) => {
    if (total === 0) return { rotate: 0, translateX: 0, translateY: 0 };
    
    const centerIndex = (total - 1) / 2;
    const offset = index - centerIndex;
    
    // Calculate rotation - spread cards in an arc
    const maxRotation = Math.min(20, total * 3); // Max 20 degrees, or 3 degrees per card
    const rotationStep = maxRotation / Math.max(1, total - 1);
    const rotation = offset * rotationStep;
    
    // Calculate horizontal spread based on actual card width
    const overlap = 0.3; // 30% overlap
    const horizontalSpacing = cardWidth * (1 - overlap);
    const translateX = offset * horizontalSpacing;
    
    // Calculate vertical position (cards at edges slightly lower)
    // Cards should be slightly elevated at the edges for arc effect
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


  // Responsive calculations based on viewport width
  // Card height matches the active cards in GameBoard
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  
  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Calculate responsive card height (matching GameBoard active cards)
  const calculateCardHeight = () => {
    // clamp(140px, 21vw, 280px) logic
    const vwHeight = viewportWidth * 0.21;
    return Math.max(140, Math.min(vwHeight, 280));
  };
  
  const cardHeightPixels = calculateCardHeight();
  const visiblePortion = 2/3; // Show 2/3 of card when not hovered
  const containerHeight = cardHeightPixels * visiblePortion;
  const bottomOffset = cardHeightPixels * (1 - visiblePortion);
  
  return (
    <>
      {/* Main Hand Display - Show 2/3 of cards with overflow hidden */}
      <div 
        className="fixed left-0 right-0 pointer-events-none"
        style={{ 
          bottom: '0px', 
          height: `${containerHeight}px`, 
          zIndex: 20,
          overflow: 'hidden' // Hide the bottom 1/3 of cards
        }}
      >
        <div className="relative h-full flex items-end justify-center">
          {/* Cards container with perspective - positioned to show cards from bottom */}
          <div 
            ref={containerRef}
            className="relative"
            style={{ 
              perspective: '1000px',
              transformStyle: 'preserve-3d',
              bottom: `-${bottomOffset}px`, // Lift cards so 2/3 shows
            }}
          >
            {handCards.map((card, index) => {
              const cardWidth = cardHeightPixels * 0.714; // Width based on aspect ratio
              const transform = calculateCardTransform(index, handCards.length, cardWidth);
              const isHovered = hoveredIndex === index;
              
              // When hovered, lift card enough to show fully above clip area
              const hoverLift = bottomOffset + 20; // Extra 20px for full visibility
              
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
                      translateY(${isHovered ? -hoverLift : transform.translateY}px)
                      rotate(${transform.rotate}deg)
                      scale(${isHovered ? 1.08 : 1})
                    `,
                    zIndex: isHovered ? 100 : index + 1,
                    transformOrigin: 'bottom center',
                    filter: isHovered ? 'brightness(1.1)' : 'none',
                    height: `${cardHeightPixels}px`,
                    width: `${cardHeightPixels * 0.714}px`, // Maintain aspect ratio (5:7)
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