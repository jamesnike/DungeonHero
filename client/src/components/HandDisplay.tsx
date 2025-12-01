import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import GameCard, { type GameCardData } from './GameCard';

const CARD_RATIO = 0.76;
const CARD_VISIBLE_FRACTION = 0.58;

const getCardHeight = () => {
  if (typeof window === 'undefined') return 180;
  
  // This fallback logic mimics the GameBoard logic if cardSize prop is missing
  const isMd = window.innerWidth >= 768;
  const isSm = window.innerWidth >= 640;
  
  const paddingX = isMd ? 32 : 16; 
  const containerMaxWidth = 1350;
  const availableWidth = Math.min(window.innerWidth - paddingX, containerMaxWidth);
  
  const gapX = isSm ? 40 : 24;
  
  const gridCardWidth = (availableWidth - (5 * gapX)) / 6;
  // Use the ratio to determine height, as grid cells likely follow content or auto height
  // If grid cells are constrained by height (flex-grow h-full), this might mismatch,
  // but passing explicit cardSize prop solves that.
  const gridCardHeight = gridCardWidth / CARD_RATIO;
  
  return gridCardHeight;
};

interface HandDisplayProps {
  handCards: GameCardData[];
  onPlayCard?: (card: GameCardData, target?: any) => void;
  onDragCardFromHand?: (card: GameCardData) => void;
  onDragEndFromHand?: () => void;
  maxHandSize?: number;
  cardSize?: { width: number, height: number }; // New prop for synchronization
  disableAnimations?: boolean;
}

export default function HandDisplay({ 
  handCards, 
  onPlayCard,
  onDragCardFromHand,
  onDragEndFromHand,
  maxHandSize = 7,
  cardSize,
  disableAnimations = false,
}: HandDisplayProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [calculatedCardHeight, setCalculatedCardHeight] = useState<number>(getCardHeight);

  // Use the prop cardSize if available, otherwise fallback to calculation
  const effectiveCardHeight = cardSize ? cardSize.height : calculatedCardHeight;
  const effectiveCardWidth = cardSize ? cardSize.width : effectiveCardHeight * CARD_RATIO;

  useEffect(() => {
    // Only listen to resize if we don't have explicit cardSize passed from parent
    if (!cardSize) {
      const handleResize = () => setCalculatedCardHeight(getCardHeight());
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [cardSize]);

  const forceStopDragging = useCallback(() => {
    setHoveredIndex(null);
    setIsDraggingCard(prev => {
      if (prev) {
        onDragEndFromHand?.();
      }
      return false;
    });
  }, [onDragEndFromHand]);

  useEffect(() => {
    if (!disableAnimations) {
      return;
    }
    forceStopDragging();
  }, [disableAnimations, forceStopDragging]);

  useEffect(() => {
    if (!isDraggingCard) {
      return;
    }
    const handleGlobalPointerUp = () => {
      forceStopDragging();
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);
    window.addEventListener('dragend', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
      window.removeEventListener('dragend', handleGlobalPointerUp);
    };
  }, [isDraggingCard, forceStopDragging]);

  useEffect(() => {
    if (!isDraggingCard) {
      return;
    }
    forceStopDragging();
  }, [handCards.length, isDraggingCard, forceStopDragging]);

  const handleDragStart = (card: GameCardData) => {
    if (disableAnimations) return;
    setIsDraggingCard(true);
    onDragCardFromHand?.(card);
  };

  const handleDragEnd = () => {
    forceStopDragging();
  };

  const cardWidth = effectiveCardWidth;
  const cardHeight = effectiveCardHeight;
  
  const visibleHeight = cardHeight * CARD_VISIBLE_FRACTION;
  const hiddenHeight = cardHeight - visibleHeight;
  const handZoneHeight = visibleHeight + 24;
  const hoverLift = hiddenHeight + 24;
  const totalCardHeight = cardHeight + hoverLift;
  
  const maybeActivateHover = (_event: ReactMouseEvent<HTMLDivElement>, index: number) => {
    if (disableAnimations || isDraggingCard || hoveredIndex === index) {
      return;
    }
    setHoveredIndex(index);
  };

  return (
    <div 
      className="relative flex items-end justify-center w-full px-4 pb-1 overflow-visible pointer-events-none z-30"
      style={{ height: handZoneHeight }}
    >
      <div 
        className="relative w-full max-w-5xl pointer-events-none"
        style={{ height: cardHeight }}
      >
        <div className="absolute inset-0 flex items-end justify-center pointer-events-none">
          {handCards.map((card, index) => {
            const isHovered = hoveredIndex === index;
            const totalWidth = handCards.length * cardWidth * 0.5;
            const startX = -totalWidth / 2;
            const cardX = startX + (index * cardWidth * 0.5);
            
            const hoverClass = disableAnimations ? '' : 'transition-all duration-200 ease-out';

            return (
              <div
                key={card.id}
                className="absolute pointer-events-none"
                style={{
                  transform: `translateX(${cardX}px)`,
                  zIndex: isHovered ? 200 : index + 2,
                  height: `${cardHeight}px`,
                  width: `${cardWidth}px`,
                }}
              >
                <div
                  className={`h-full w-full flex items-end justify-center ${hoverClass} ${disableAnimations ? 'pointer-events-none' : 'pointer-events-auto'}`.trim()}
                  style={{
                    transform: disableAnimations
                      ? `translateY(${hiddenHeight}px) scale(1)`
                      : `translateY(${isHovered ? 0 : hiddenHeight}px) ${isHovered ? 'scale(1.05)' : 'scale(1)'}`,
                  }}
                  onMouseEnter={(event) => {
                    maybeActivateHover(event, index);
                  }}
                  onMouseMove={(event) => {
                    maybeActivateHover(event, index);
                  }}
                  onMouseLeave={() => {
                    if (disableAnimations) return;
                    setHoveredIndex(null);
                  }}
                  data-testid={`hand-card-${index}`}
                >
                  <GameCard
                    card={card}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    className={isHovered ? 'shadow-2xl' : 'shadow-lg'}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
