import { memo } from 'react';
import { useShallowGameState, useDispatch } from '@/hooks/useGameEngine';
import { useModalCallbacks } from '../contexts/ModalCallbacksContext';

import DiscoverClassModal from '@/components/DiscoverClassModal';
import GraveyardExileModal from '@/components/GraveyardExileModal';

function DiscoverContainerInner() {
  const cb = useModalCallbacks();
  const dispatch = useDispatch();

  const gs = useShallowGameState(s => ({
    discoverModalOpen: s.discoverModalOpen,
    discoverModalMinimized: s.discoverModalMinimized,
    discoverOptions: s.discoverOptions,
    discoverSourceLabel: s.discoverSourceLabel,
    graveyardDiscoverState: s.graveyardDiscoverState,
    graveyardDiscoverMinimized: s.graveyardDiscoverMinimized,
    ghostBladeExileCards: s.ghostBladeExileCards,
  }));

  // Outside-click / X / ESC on any foldable modal collapses every open
  // foldable modal at once. Each one then has its own bottom pill in
  // FloatingPillsContainer for individual restore.
  const handleMinimizeAll = () => dispatch({ type: 'MINIMIZE_ALL_MODALS' });

  return (
    <>
      <DiscoverClassModal
        open={gs.discoverModalOpen && !gs.discoverModalMinimized}
        cards={gs.discoverOptions}
        onSelect={cb.onDiscoverSelect}
        onCancel={cb.onDiscoverCancel}
        onMinimize={handleMinimizeAll}
        description={
          gs.discoverSourceLabel
            ? `来自「${gs.discoverSourceLabel}」的效果 — 从三张候选卡中挑选一张，其余卡牌会放回 Class Deck。`
            : undefined
        }
      />

      <DiscoverClassModal
        open={Boolean(gs.graveyardDiscoverState) && !gs.graveyardDiscoverMinimized}
        cards={gs.graveyardDiscoverState ?? []}
        onSelect={cb.onGraveyardDiscoverSelect}
        onCancel={cb.onGraveyardDiscoverCancel}
        onMinimize={handleMinimizeAll}
        title="坟场召回"
        description="从坟场随机出现的卡牌中选择一张取回。"
      />

      <GraveyardExileModal
        open={Boolean(gs.ghostBladeExileCards)}
        cards={gs.ghostBladeExileCards ?? []}
        onConfirm={cb.onGhostBladeExileConfirm}
      />
    </>
  );
}

export const DiscoverContainer = memo(DiscoverContainerInner);
