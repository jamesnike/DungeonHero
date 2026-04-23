import { memo } from 'react';
import { useShallowGameState, useDispatch } from '@/hooks/useGameEngine';
import { useModalCallbacks } from '../contexts/ModalCallbacksContext';
import { useModalUI } from '../contexts/ModalUIContext';
import { PERSUADE_COST } from '@/game-core/constants';

import MonsterRewardModal from '@/components/MonsterRewardModal';
import MonsterPersuadeModal, { type PersuadePhase } from '@/components/MonsterPersuadeModal';

function RewardContainerInner() {
  const cb = useModalCallbacks();
  const ui = useModalUI();
  const dispatch = useDispatch();

  const gs = useShallowGameState(s => ({
    activeMonsterReward: s.activeMonsterReward,
    monsterRewardMinimized: s.monsterRewardMinimized,
    monsterDefeatAnimationActive: s.monsterDefeatAnimationIds.length > 0,
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
          // Gate on the engine-side defeat-animation flag, not the React-state
          // mirror in `ui.isDefeatAnimationPlaying`. Both fields are kept in
          // sync (engine is the source of truth, React useState is cleared by
          // the same setTimeout that dispatches END_MONSTER_DEFEAT_ANIMATION),
          // but only the engine flag is updated atomically with
          // `activeMonsterReward` in the same `useSyncExternalStore` snapshot.
          // Reading the React mirror here re-introduced a one-frame race on
          // mobile where `activeMonsterReward` flipped truthy in render N and
          // the gate flag flipped in render N+1, opening the Radix Dialog
          // for one frame and triggering the visible flash.
          open={!gs.monsterRewardMinimized && !gs.monsterDefeatAnimationActive}
          monsterName={gs.activeMonsterReward.monsterName}
          options={gs.activeMonsterReward.options.map(option => ({
            id: option.id,
            title: option.title,
            description: option.description,
            detail: option.detail,
          }))}
          onSelect={cb.onMonsterRewardSelect}
          onMinimize={() => dispatch({ type: 'MINIMIZE_ALL_MODALS' })}
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
