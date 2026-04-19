import { memo } from 'react';
import { useShallowGameState } from '@/hooks/useGameEngine';
import { useModalCallbacks } from '../contexts/ModalCallbacksContext';
import { useModalUI } from '../contexts/ModalUIContext';
import { PERSUADE_COST } from '@/game-core/constants';

import MonsterRewardModal from '@/components/MonsterRewardModal';
import MonsterPersuadeModal, { type PersuadePhase } from '@/components/MonsterPersuadeModal';

function RewardContainerInner() {
  const cb = useModalCallbacks();
  const ui = useModalUI();

  const gs = useShallowGameState(s => ({
    activeMonsterReward: s.activeMonsterReward,
    persuadeState: s.persuadeState,
    persuadeLevel: s.persuadeLevel,
    persuadeCostModifier: s.persuadeCostModifier,
    persuadeDiscount: s.persuadeDiscount,
    persuadeSameTargetCostHalve: s.persuadeSameTargetCostHalve,
    lastPersuadeTargetId: s.lastPersuadeTargetId,
    gold: s.gold,
  }));

  const persuadeOpen = Boolean(gs.persuadeState);
  const persuadeMonster = gs.persuadeState?.monster ?? null;
  const persuadeThreshold = gs.persuadeState?.threshold ?? 0;
  const persuadeSuccessRate = gs.persuadeState?.successRate ?? 0;
  const persuadeTargetLabel = gs.persuadeState ? '背包' : '';
  const persuadePhase: PersuadePhase = (gs.persuadeState?.phase as PersuadePhase) ?? 'confirm';
  const persuadeDiceValue = gs.persuadeState?.diceValue ?? null;
  const persuadeSuccess = gs.persuadeState?.success ?? null;

  const persuadeCost = (() => {
    let c = Math.max(0, PERSUADE_COST + gs.persuadeCostModifier - (gs.persuadeDiscount?.costReduction ?? 0));
    if (gs.persuadeState?.monster && gs.persuadeSameTargetCostHalve && gs.lastPersuadeTargetId === gs.persuadeState.monster.id) {
      c = Math.floor(c / 2);
    }
    return c;
  })();

  return (
    <>
      {gs.activeMonsterReward && (
        <MonsterRewardModal
          open
          monsterName={gs.activeMonsterReward.monsterName}
          options={gs.activeMonsterReward.options.map(option => ({
            id: option.id,
            title: option.title,
            description: option.description,
            detail: option.detail,
          }))}
          onSelect={cb.onMonsterRewardSelect}
        />
      )}

      <MonsterPersuadeModal
        open={persuadeOpen}
        monster={persuadeMonster}
        gold={gs.gold}
        cost={persuadeCost}
        threshold={persuadeThreshold}
        successRate={persuadeSuccessRate}
        targetLabel={persuadeTargetLabel}
        phase={persuadePhase}
        diceValue={persuadeDiceValue}
        success={persuadeSuccess}
        autoRollTrigger={ui.persuadeRollKey}
        persuadeLevel={gs.persuadeLevel}
        onConfirm={cb.onPersuadeConfirm}
        onDiceResult={cb.onPersuadeDiceResult}
        onClose={cb.onPersuadeClose}
      />
    </>
  );
}

export const RewardContainer = memo(RewardContainerInner);
