import React, { memo, useState, type CSSProperties } from 'react';
import { Dices } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import GraveyardZone from '@/components/GraveyardZone';
import ClassDeck from '@/components/ClassDeck';
import DiceRoller from '@/components/DiceRoller';
import type { GameCardData } from '@/components/GameCard';
import { useGameState } from '@/hooks/useGameEngine';

interface NarrowSidebarProps {
  narrowSidebarPositions: { row1Y: number; row2Y: number; row3Y: number };
  gridCardSize: { width: number; height: number } | null;
  handleGraveyardDropStable: (e: any) => void;
  graveyardDropEnabled: boolean;
  shouldHighlightGraveyard: boolean;
  onCardSelect: (card: GameCardData) => void;
}

export const NarrowSidebar = memo(function NarrowSidebar({
  narrowSidebarPositions,
  gridCardSize,
  handleGraveyardDropStable,
  graveyardDropEnabled,
  shouldHighlightGraveyard,
  onCardSelect,
}: NarrowSidebarProps) {
  const [narrowDiceModalOpen, setNarrowDiceModalOpen] = useState(false);
  const discardedCards = useGameState(s => s.discardedCards);
  const classDeck = useGameState(s => s.classDeck);

  const cardH = gridCardSize?.height ?? 100;
  const stripW = Math.max(18, Math.round(cardH * 0.14));
  const stripStyle: CSSProperties = { width: stripW, height: cardH };

  return (
    <>
      <button
        onClick={() => setNarrowDiceModalOpen(true)}
        className="fixed z-40 flex flex-col items-center justify-center rounded-l-lg border border-r-0 border-rose-400/30 bg-rose-800/20 text-rose-300/70 hover:bg-rose-700/30 hover:border-rose-400/50 transition-all duration-150"
        style={{ ...stripStyle, right: 0, top: narrowSidebarPositions.row1Y, transform: 'translateY(-50%)' }}
      >
        <Dices className="w-4 h-4" />
      </button>

      <div className="fixed z-40" style={{ right: 0, top: narrowSidebarPositions.row2Y, transform: 'translateY(-50%)' }}>
        <GraveyardZone
          compact
          compactStyle={stripStyle}
          onDrop={handleGraveyardDropStable}
          isDropTarget={graveyardDropEnabled}
          shouldHighlight={shouldHighlightGraveyard}
          discardedCards={discardedCards}
          onCardSelect={onCardSelect}
        />
      </div>

      <div className="fixed z-40" style={{ right: 0, top: narrowSidebarPositions.row3Y, transform: 'translateY(-50%)' }}>
        <ClassDeck
          compact
          compactStyle={stripStyle}
          classCards={classDeck}
          deckName="Knight Deck"
          onCardSelect={onCardSelect}
        />
      </div>

      <Dialog open={narrowDiceModalOpen} onOpenChange={setNarrowDiceModalOpen}>
        <DialogContent className="max-w-sm flex flex-col items-center gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Dices className="w-6 h-6" />
              Chaos Dice
            </DialogTitle>
            <DialogDescription>Roll the d20</DialogDescription>
          </DialogHeader>
          <div className="w-[220px] h-[220px]">
            <DiceRoller
              className="w-full h-full"
              scaleMultiplier={1}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});

export default NarrowSidebar;
