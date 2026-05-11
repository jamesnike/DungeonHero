import React, { memo, type CSSProperties, type Ref } from 'react';
import GraveyardZone from '@/components/GraveyardZone';
import ClassDeck from '@/components/ClassDeck';
import BackpackZone from '@/components/BackpackZone';
import type { GameCardData } from '@/components/GameCard';
import { useGameState } from '@/hooks/useGameEngine';

interface NarrowSidebarProps {
  narrowSidebarPositions: { row1Y: number; row2Y: number; row3Y: number };
  gridCardSize: { width: number; height: number } | null;
  handleGraveyardDropStable: (e: any) => void;
  graveyardDropEnabled: boolean;
  shouldHighlightGraveyard: boolean;
  onCardSelect: (card: GameCardData) => void;
  backpackDropEnabled: boolean;
  onBackpackDrop: (card: GameCardData) => void;
  onBackpackOpenViewer: () => void;
  backpackCapacity: number;
  /** Ref to the compact backpack button — used as the source position
   *  for backpack→hand draw flights when in narrow layout. */
  compactBackpackCellRef?: Ref<HTMLButtonElement>;
}

export const NarrowSidebar = memo(function NarrowSidebar({
  narrowSidebarPositions,
  gridCardSize,
  handleGraveyardDropStable,
  graveyardDropEnabled,
  shouldHighlightGraveyard,
  onCardSelect,
  backpackDropEnabled,
  onBackpackDrop,
  onBackpackOpenViewer,
  backpackCapacity,
  compactBackpackCellRef,
}: NarrowSidebarProps) {
  const discardedCards = useGameState(s => s.discardedCards);
  const classDeck = useGameState(s => s.classDeck);
  const acquiredUniqueClassCardIds = useGameState(s => s.acquiredUniqueClassCardIds);
  const backpackCount = useGameState(s => s.backpackItems.length);
  const recycleCount = useGameState(s => s.permanentMagicRecycleBag.length);
  const multiplayerActive = useGameState(s => s.multiplayerSession !== null);

  const cardH = gridCardSize?.height ?? 100;
  const stripW = Math.max(18, Math.round(cardH * 0.14));
  const stripStyle: CSSProperties = { width: stripW, height: cardH };

  return (
    <>
      <div className="fixed z-40" style={{ right: 0, top: narrowSidebarPositions.row1Y, transform: 'translateY(-50%)' }}>
        <ClassDeck
          compact
          compactStyle={stripStyle}
          classCards={classDeck}
          acquiredUniqueClassCardIds={acquiredUniqueClassCardIds}
          onCardSelect={onCardSelect}
        />
      </div>

      <div className="fixed z-40" style={{ right: 0, top: narrowSidebarPositions.row2Y, transform: 'translateY(-50%)' }}>
        <GraveyardZone
          compact
          compactStyle={stripStyle}
          onDrop={handleGraveyardDropStable}
          isDropTarget={graveyardDropEnabled}
          shouldHighlight={shouldHighlightGraveyard}
          discardedCards={discardedCards}
          onCardSelect={onCardSelect}
          multiplayerActive={multiplayerActive}
        />
      </div>

      <div className="fixed z-40" style={{ right: 0, top: narrowSidebarPositions.row3Y, transform: 'translateY(-50%)' }}>
        <BackpackZone
          compact
          compactStyle={stripStyle}
          backpackCount={backpackCount}
          recycleCount={recycleCount}
          capacity={backpackCapacity}
          isDropTarget={backpackDropEnabled}
          onDrop={onBackpackDrop}
          onOpenViewer={onBackpackOpenViewer}
          compactCellRef={compactBackpackCellRef}
        />
      </div>
    </>
  );
});

export default NarrowSidebar;
