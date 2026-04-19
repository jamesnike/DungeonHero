import React, { memo } from 'react';
import GameCard from '@/components/GameCard';
import type { GameCardData } from '@/components/GameCard';
import { useGameState } from '@/hooks/useGameEngine';
import { DUNGEON_COLUMNS } from '../constants';
import type { GraveyardVector, WaterfallAnimationState } from '../types';
import { getPreviewAnimationProps, getStackedCardStyle } from '../utils/animation-helpers';

const EMPTY_ARRAY: GameCardData[] = [];

interface PreviewCellProps {
  index: number;
  waterfallAnimation: WaterfallAnimationState;
  graveyardVectors: Record<number, GraveyardVector>;
  deckReturnVectors: Record<number, GraveyardVector>;
  cellWrapperClass: string;
  cellInnerClass: string;
  onCellRef: (index: number, el: HTMLDivElement | null) => void;
  onCardClick: (card: GameCardData) => void;
}

const PreviewCell = memo(function PreviewCell({
  index,
  waterfallAnimation,
  graveyardVectors,
  deckReturnVectors,
  cellWrapperClass,
  cellInnerClass,
  onCellRef,
  onCardClick,
}: PreviewCellProps) {
  const card = useGameState(s => s.previewCards[index]);
  const stackedCards = useGameState(s => s.previewCardStacks[index] ?? EMPTY_ARRAY);

  const { style: animStyle, className: animClass, isAnimating } =
    getPreviewAnimationProps(index, waterfallAnimation, graveyardVectors, deckReturnVectors);

  const hasStack = stackedCards.length > 0;

  if (!card) {
    return (
      <div
        key={`preview-empty-${index}`}
        className={cellWrapperClass}
        ref={el => onCellRef(index, el)}
      >
        <div className={cellInnerClass} style={animStyle} />
      </div>
    );
  }

  return (
    <div
      key={`preview-${index}`}
      className={`opacity-60 ${cellWrapperClass}${hasStack ? ' relative overflow-visible' : ''}`}
      data-testid={`preview-card-${index}`}
      ref={el => onCellRef(index, el)}
    >
      <div
        className={`${cellInnerClass} ${hasStack ? 'relative' : ''} ${animClass}`.trim()}
        style={animStyle}
      >
        {hasStack && stackedCards.map((stackCard, sIdx) => {
          if (isAnimating) {
            return (
              <div
                key={stackCard.id}
                className="absolute inset-0 pointer-events-none"
                style={{ zIndex: -1, opacity: 0, padding: 'var(--dh-card-padding, 0.25rem)' }}
              >
                <GameCard card={stackCard} disableInteractions hideEventChoices />
              </div>
            );
          }
          return (
            <div
              key={stackCard.id}
              className="absolute inset-0 rounded-md overflow-hidden pointer-events-none"
              style={getStackedCardStyle(stackedCards.length, sIdx)}
            >
              <GameCard card={stackCard} disableInteractions hideEventChoices />
            </div>
          );
        })}
        <GameCard
          card={card}
          className={hasStack ? 'relative z-[5]' : ''}
          disableInteractions
          hideEventChoices
          onClick={() => onCardClick(card)}
        />
        {hasStack && (
          <div className="absolute top-[-4px] right-[-4px] z-40 bg-amber-500 text-white rounded-full w-5 h-5 flex items-center justify-center border-2 border-background shadow-md font-bold text-xs pointer-events-none">
            {stackedCards.length + 1}
          </div>
        )}
      </div>
    </div>
  );
});

interface PreviewRowProps {
  waterfallAnimation: WaterfallAnimationState;
  graveyardVectors: Record<number, GraveyardVector>;
  deckReturnVectors: Record<number, GraveyardVector>;
  cellWrapperClass: string;
  cellInnerClass: string;
  onCellRef: (index: number, el: HTMLDivElement | null) => void;
  onCardClick: (card: GameCardData) => void;
}

export const PreviewRow = memo(function PreviewRow({
  waterfallAnimation,
  graveyardVectors,
  deckReturnVectors,
  cellWrapperClass,
  cellInnerClass,
  onCellRef,
  onCardClick,
}: PreviewRowProps) {
  return (
    <>
      {DUNGEON_COLUMNS.map((index) => (
        <PreviewCell
          key={index}
          index={index}
          waterfallAnimation={waterfallAnimation}
          graveyardVectors={graveyardVectors}
          deckReturnVectors={deckReturnVectors}
          cellWrapperClass={cellWrapperClass}
          cellInnerClass={cellInnerClass}
          onCellRef={onCellRef}
          onCardClick={onCardClick}
        />
      ))}
    </>
  );
});

export default PreviewRow;
