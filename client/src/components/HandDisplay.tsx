import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import GameCard, { type GameCardData } from './GameCard';
import { HAND_LIMIT, FLAT_ASPECT_RATIO } from './game-board/constants';
import { useGameViewport } from '@/contexts/GameViewportContext';

const CARD_RATIO = 0.76;
const CARD_VISIBLE_FRACTION = 0.58;

const getCardHeight = (vpWidth: number) => {
  if (vpWidth <= 0) return 180;

  const isMd = vpWidth >= 768;
  const isSm = vpWidth >= 640;

  const paddingX = isMd ? 32 : 16;
  const containerMaxWidth = 1350;
  const availableWidth = Math.min(vpWidth - paddingX, containerMaxWidth);

  const gapX = isSm ? 40 : 24;

  const gridCardWidth = (availableWidth - (5 * gapX)) / 6;
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
  onCardClick?: (card: GameCardData) => void;
}

export default function HandDisplay({ 
  handCards, 
  onPlayCard,
  onDragCardFromHand,
  onDragEndFromHand,
  maxHandSize = HAND_LIMIT,
  cardSize,
  disableAnimations = false,
  onCardClick,
  spellDamageContextBonus = 0,
  spellEchoNextMagic = false,
}: HandDisplayProps) {
  const gameViewport = useGameViewport();
  const isFlat = gameViewport.width / gameViewport.height > FLAT_ASPECT_RATIO;
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [calculatedCardHeight, setCalculatedCardHeight] = useState<number>(() => getCardHeight(gameViewport.width));
  const [isCompactHand, setIsCompactHand] = useState<boolean>(gameViewport.width < 640);

  const effectiveCardHeight = cardSize ? cardSize.height : calculatedCardHeight;
  const effectiveCardWidth = cardSize ? cardSize.width : effectiveCardHeight * CARD_RATIO;

  const hoveredIndexRef = useRef<number | null>(null);
  const cardOuterRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cardInnerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const layoutRef = useRef({ hiddenHeight: 0, disableAnimations: false, isDragging: false });

  useEffect(() => {
    if (!cardSize) {
      setCalculatedCardHeight(getCardHeight(gameViewport.width));
    }
  }, [cardSize, gameViewport.width]);

  useEffect(() => {
    setIsCompactHand(gameViewport.width < 640);
  }, [gameViewport.width]);

  const onDragEndFromHandRef = useRef(onDragEndFromHand);
  onDragEndFromHandRef.current = onDragEndFromHand;

  const clearHoverDOM = useCallback(() => {
    const idx = hoveredIndexRef.current;
    if (idx !== null) {
      const outer = cardOuterRefs.current[idx];
      const inner = cardInnerRefs.current[idx];
      if (outer) outer.style.zIndex = String(idx + 2);
      if (inner) inner.style.transform = `translateY(${layoutRef.current.hiddenHeight}px) scale(1)`;
      hoveredIndexRef.current = null;
    }
  }, []);

  const forceStopDragging = useCallback(() => {
    clearHoverDOM();
    setIsDraggingCard(prev => {
      if (prev) {
        onDragEndFromHandRef.current?.();
      }
      return false;
    });
  }, [clearHoverDOM]);

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
    const handleGlobalDragEnd = () => {
      forceStopDragging();
    };
    window.addEventListener('dragend', handleGlobalDragEnd);
    return () => {
      window.removeEventListener('dragend', handleGlobalDragEnd);
    };
  }, [isDraggingCard, forceStopDragging]);

  const prevHandLengthRef = useRef(handCards.length);
  useEffect(() => {
    const prevLength = prevHandLengthRef.current;
    prevHandLengthRef.current = handCards.length;
    if (!isDraggingCard || handCards.length === prevLength) {
      return;
    }
    forceStopDragging();
  }, [handCards.length, isDraggingCard, forceStopDragging]);

  const handleDragStart = useCallback((card: GameCardData) => {
    if (layoutRef.current.disableAnimations) return;
    setIsDraggingCard(true);
    onDragCardFromHand?.(card);
  }, [onDragCardFromHand]);

  const handleDragEnd = useCallback(() => {
    forceStopDragging();
  }, [forceStopDragging]);

  const cardWidth = effectiveCardWidth;
  const cardHeight = effectiveCardHeight;
  
  const visibleFraction = isCompactHand ? 0.68 : CARD_VISIBLE_FRACTION;
  const visibleHeight = cardHeight * visibleFraction;
  const hiddenHeight = cardHeight - visibleHeight;
  const handZoneHeight = visibleHeight + 24;
  const horizontalStepFactor = isCompactHand ? 0.65 : 0.82;

  layoutRef.current.hiddenHeight = hiddenHeight;
  layoutRef.current.disableAnimations = disableAnimations;
  layoutRef.current.isDragging = isDraggingCard;

  const applyHoverToDOM = useCallback((index: number) => {
    const outer = cardOuterRefs.current[index];
    const inner = cardInnerRefs.current[index];
    if (outer) outer.style.zIndex = '200';
    if (inner) inner.style.transform = 'translateY(0px) scale(1.08)';
  }, []);

  useLayoutEffect(() => {
    const idx = hoveredIndexRef.current;
    if (idx !== null && !layoutRef.current.disableAnimations) {
      applyHoverToDOM(idx);
    }
  });

  const activateHover = useCallback((index: number) => {
    if (layoutRef.current.disableAnimations || layoutRef.current.isDragging) return;
    if (hoveredIndexRef.current === index) return;

    clearHoverDOM();
    applyHoverToDOM(index);
    hoveredIndexRef.current = index;
  }, [clearHoverDOM, applyHoverToDOM]);

  const deactivateHover = useCallback(() => {
    if (layoutRef.current.disableAnimations) return;
    clearHoverDOM();
  }, [clearHoverDOM]);

  return (
    <div 
      className={`relative flex items-end justify-center w-full px-4 overflow-visible pointer-events-none z-30 ${isFlat ? 'pb-0' : 'pb-1'}`}
      style={{ height: handZoneHeight }}
    >
      <div 
        className="relative w-full max-w-5xl pointer-events-none"
        style={{ height: cardHeight, transform: `translateX(${Math.round(cardWidth * 0.15)}px)` }}
      >
        <div className="absolute inset-0 flex items-end justify-center pointer-events-none">
          {handCards.map((card, index) => {
            const totalWidth = handCards.length * cardWidth * horizontalStepFactor;
            const startX = -totalWidth / 2;
            const cardX = startX + (index * cardWidth * horizontalStepFactor);

            return (
              <div
                key={card.id}
                ref={el => { cardOuterRefs.current[index] = el; }}
                className="absolute pointer-events-none"
                style={{
                  transform: `translateX(${cardX}px)`,
                  zIndex: index + 2,
                  height: `${cardHeight}px`,
                  width: `${cardWidth}px`,
                  willChange: 'transform',
                  backfaceVisibility: 'hidden' as const,
                }}
              >
                <div
                  ref={el => { cardInnerRefs.current[index] = el; }}
                  className={`h-full w-full flex items-end justify-center ${disableAnimations ? 'pointer-events-none' : 'pointer-events-auto'}`.trim()}
                  style={{
                    transform: `translateY(${hiddenHeight}px) scale(1)`,
                    willChange: 'transform',
                    transition: disableAnimations ? 'none' : 'transform 200ms ease-out',
                  }}
                  onMouseEnter={() => activateHover(index)}
                  onMouseMove={() => activateHover(index)}
                  onMouseLeave={deactivateHover}
                  data-testid={`hand-card-${index}`}
                >
                  <GameCard
                    card={card}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onClick={() => onCardClick?.(card)}
                    className="shadow-lg"
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
