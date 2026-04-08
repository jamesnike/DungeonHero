/**
 * PreviewRow — renders the top row of preview cards (DUNGEON_COLUMN_COUNT cards + DiceRoller).
 *
 * Pure render component: all data and callbacks come via props.
 */

import type { CSSProperties } from 'react';
import GameCard from '@/components/GameCard';
import type { GameCardData } from '@/components/GameCard';
import DiceRoller from '@/components/DiceRoller';
import { DUNGEON_COLUMNS } from '../constants';
import type { ActiveRowSlots, WaterfallAnimationState } from '../types';

export interface PreviewRowProps {
  previewCards: ActiveRowSlots;
  previewCardStacks: Record<number, GameCardData[]>;
  waterfallAnimation: WaterfallAnimationState;
  previewGraveyardVectors: Record<number, { offsetX: number; offsetY: number }>;
  previewDeckReturnVectors: Record<number, { offsetX: number; offsetY: number }>;
  graveyardVectorDefault: { offsetX: number; offsetY: number };
  deckReturnVectorDefault: { offsetX: number; offsetY: number };
  cellWrapperClass: string;
  cellInnerClass: string;
  stageScale: number;
  setPreviewCellRef: (index: number, el: HTMLDivElement | null) => void;
  onCardClick: (card: GameCardData) => void;
}

export default function PreviewRow({
  previewCards,
  previewCardStacks,
  waterfallAnimation,
  previewGraveyardVectors,
  previewDeckReturnVectors,
  graveyardVectorDefault,
  deckReturnVectorDefault,
  cellWrapperClass,
  cellInnerClass,
  stageScale,
  setPreviewCellRef,
  onCardClick,
}: PreviewRowProps) {
  return (
    <>
      {DUNGEON_COLUMNS.map((index) => {
        const card = previewCards[index];
        const isDroppingPreview = waterfallAnimation.droppingSlots.includes(index);
        const isDiscardingPreview = waterfallAnimation.discardSlot === index;
        const isDealingPreview = waterfallAnimation.dealingSlots.includes(index);
        const isDeckReturnDiscard =
          isDiscardingPreview && waterfallAnimation.discardDestination === 'deck';
        const flyVector = isDeckReturnDiscard
          ? (previewDeckReturnVectors[index] ?? deckReturnVectorDefault)
          : (previewGraveyardVectors[index] ?? graveyardVectorDefault);

        const previewAnimationStyle: CSSProperties & Record<`--${string}`, string> =
          isDeckReturnDiscard
            ? {
                '--deck-return-offset-x': `${flyVector.offsetX}px`,
                '--deck-return-offset-y': `${flyVector.offsetY}px`,
              }
            : {
                '--graveyard-offset-x': `${flyVector.offsetX}px`,
                '--graveyard-offset-y': `${flyVector.offsetY}px`,
              };

        const previewAnimationClass = [
          isDroppingPreview ? 'animate-preview-drop' : '',
          isDiscardingPreview && !isDeckReturnDiscard ? 'animate-preview-graveyard' : '',
          isDiscardingPreview && isDeckReturnDiscard ? 'animate-preview-deck-return' : '',
          isDealingPreview ? 'animate-preview-deal' : '',
        ]
          .filter(Boolean)
          .join(' ');

        const stackedCards = previewCardStacks[index] ?? [];
        const hasStack = stackedCards.length > 0;

        return card ? (
          <div
            key={`preview-${index}`}
            className={`opacity-60 ${cellWrapperClass}${hasStack ? ' relative overflow-visible' : ''}`}
            data-testid={`preview-card-${index}`}
            ref={(el) => setPreviewCellRef(index, el)}
          >
            <div
              className={`${cellInnerClass} ${previewAnimationClass}`.trim()}
              style={previewAnimationStyle}
            >
              {hasStack && (
                <div className="absolute inset-0 z-10 pointer-events-none">
                  {stackedCards.map((stackCard, sIdx) => {
                    const offsetStep = 8;
                    const y = -(stackedCards.length - sIdx) * offsetStep;
                    return (
                      <div
                        key={stackCard.id}
                        className="absolute inset-0 rounded-md overflow-hidden"
                        style={{
                          zIndex: sIdx,
                          transform: `translateY(${y}%)`,
                          opacity: 0.4 - sIdx * 0.1,
                          filter: 'brightness(0.6)',
                          padding: 'var(--dh-card-padding, 0.25rem)',
                        }}
                      >
                        <GameCard card={stackCard} disableInteractions />
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="relative" style={{ zIndex: hasStack ? stackedCards.length + 1 : undefined }}>
                <GameCard
                  card={card}
                  disableInteractions
                  onClick={() => onCardClick(card)}
                />
              </div>
              {hasStack && (
                <div className="absolute top-[-8px] right-[-8px] z-40 bg-amber-500 text-white rounded-full w-6 h-6 flex items-center justify-center border-2 border-background shadow-md font-bold text-xs pointer-events-none">
                  {stackedCards.length + 1}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            key={`preview-empty-${index}`}
            className={cellWrapperClass}
            ref={(el) => setPreviewCellRef(index, el)}
          >
            <div className={cellInnerClass} style={previewAnimationStyle} />
          </div>
        );
      })}

      {/* DiceRoller in last column */}
      <div className={cellWrapperClass}>
        <div className={cellInnerClass}>
          <DiceRoller className="w-full h-full" scaleMultiplier={stageScale} />
        </div>
      </div>
    </>
  );
}
