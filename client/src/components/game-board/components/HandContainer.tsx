import { memo, useMemo } from 'react';
import { useShallowGameState } from '@/hooks/useGameEngine';
import HandDisplay from '@/components/HandDisplay';
import { HAND_LIMIT } from '@/components/game-board/constants';
import type { GameCardData } from '@/components/GameCard';

interface HandContainerProps {
  handAreaRef: React.Ref<HTMLDivElement>;
  isFlat: boolean;
  onPlayCard: (card: GameCardData, target?: any) => void;
  onDragCardFromHand: (card: GameCardData) => void;
  onDragEndFromHand: (event?: React.DragEvent) => void;
  onCardClick: (card: GameCardData) => void;
  gridCardSize: { width: number; height: number };
  isWaterfallLocked: boolean;
  fullBoardInteractionLocked: boolean;
}

function HandContainerInner({
  handAreaRef,
  isFlat,
  onPlayCard,
  onDragCardFromHand,
  onDragEndFromHand,
  onCardClick,
  gridCardSize,
  isWaterfallLocked,
  fullBoardInteractionLocked,
}: HandContainerProps) {
  const { handCards, handLimitBonus, combatState } = useShallowGameState(s => ({
    handCards: s.handCards,
    handLimitBonus: s.handLimitBonus,
    combatState: s.combatState,
  }));

  const effectiveHandLimit = HAND_LIMIT + handLimitBonus;
  const handLockedForMonsterPhase = useMemo(
    () =>
      combatState.engagedMonsterIds.length > 0 &&
      (combatState.currentTurn === 'monster' || Boolean(combatState.pendingBlock)),
    [combatState.engagedMonsterIds, combatState.currentTurn, combatState.pendingBlock],
  );

  return (
    <div ref={handAreaRef} className={`flex-shrink-0 relative w-full px-2 md:px-6 ${isFlat ? 'pb-0' : 'pb-4'}`}>
      <HandDisplay
        handCards={handCards}
        onPlayCard={onPlayCard}
        onDragCardFromHand={onDragCardFromHand}
        onDragEndFromHand={onDragEndFromHand}
        maxHandSize={effectiveHandLimit}
        cardSize={gridCardSize}
        disableAnimations={isWaterfallLocked || fullBoardInteractionLocked || handLockedForMonsterPhase}
        dimForCombatLock={handLockedForMonsterPhase}
        onCardClick={onCardClick}
      />
    </div>
  );
}

export default memo(HandContainerInner);
