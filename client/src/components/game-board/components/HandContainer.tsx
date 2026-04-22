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
    // 总 padding（pb-7 = 28px / md:pb-8 = 32px）= 原 pb-4 (16px) + GameBoard 主游戏区被去掉的 pt-3/pt-4 (12/16px)。
    // 把那段 12-16px 高度从 boardRef 那边"接回"到手牌容器这边，所以 boardRef 实际可用高度
    // 与改动前完全一致，grid 单元格和 Preview/Active/Hero 卡尺寸都不变；
    // 同时把这段额外空间全部放在手牌**下方**（pb 而不是 pt），所以手牌本身也跟着整体上移
    // 12-16px，与上面的 Preview/Active/Hero 行一起向上偏移，菜单栏与手牌底部之间的多余空隙被压缩。
    <div ref={handAreaRef} className={`flex-shrink-0 relative w-full px-2 md:px-6 ${isFlat ? 'pb-0' : 'pb-7 md:pb-8'}`}>
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
