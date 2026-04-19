import { memo } from 'react';
import { useShallowGameState } from '@/hooks/useGameEngine';
import { useModalCallbacks } from '../contexts/ModalCallbacksContext';

import DiscoverClassModal from '@/components/DiscoverClassModal';
import GraveyardExileModal from '@/components/GraveyardExileModal';

function DiscoverContainerInner() {
  const cb = useModalCallbacks();

  const gs = useShallowGameState(s => ({
    discoverModalOpen: s.discoverModalOpen,
    discoverOptions: s.discoverOptions,
    discoverSourceLabel: s.discoverSourceLabel,
    graveyardDiscoverState: s.graveyardDiscoverState,
    ghostBladeExileCards: s.ghostBladeExileCards,
  }));

  return (
    <>
      <DiscoverClassModal
        open={gs.discoverModalOpen}
        cards={gs.discoverOptions}
        onSelect={cb.onDiscoverSelect}
        onCancel={cb.onDiscoverCancel}
        description={
          gs.discoverSourceLabel
            ? `来自「${gs.discoverSourceLabel}」的效果 — 从三张候选卡中挑选一张，其余卡牌会放回 Class Deck。`
            : undefined
        }
      />

      <DiscoverClassModal
        open={Boolean(gs.graveyardDiscoverState)}
        cards={gs.graveyardDiscoverState ?? []}
        onSelect={cb.onGraveyardDiscoverSelect}
        onCancel={cb.onGraveyardDiscoverCancel}
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
