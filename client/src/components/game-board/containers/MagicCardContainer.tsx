import { memo } from 'react';
import { useShallowGameState } from '@/hooks/useGameEngine';
import { useModalCallbacks } from '../contexts/ModalCallbacksContext';

import HandMagicUpgradeModal from '@/components/HandMagicUpgradeModal';
import MirrorCopyModal from '@/components/MirrorCopyModal';
import AmplifyModal from '@/components/AmplifyModal';
import PermGrantModal from '@/components/PermGrantModal';
import BackpackReorganizeModal from '@/components/BackpackReorganizeModal';
import HandDiscardSelectionModal from '@/components/HandDiscardSelectionModal';
import type { GameCardData } from '@/components/GameCard';
import { getEligibleHandDiscardCards } from '@/game-core/helpers';

function MagicCardContainerInner() {
  const cb = useModalCallbacks();

  const gs = useShallowGameState(s => ({
    handMagicUpgradeModal: s.handMagicUpgradeModal,
    mirrorCopyModal: s.mirrorCopyModal,
    amplifyModal: s.amplifyModal,
    eventAmplifyHandPicker: s.eventAmplifyHandPicker,
    permGrantModal: s.permGrantModal,
    pendingMagicAction: s.pendingMagicAction,
    pendingHandDiscardSelection: s.pendingHandDiscardSelection,
    handCards: s.handCards,
    equipmentSlot1: s.equipmentSlot1,
    equipmentSlot2: s.equipmentSlot2,
    amuletSlots: s.amuletSlots,
    backpackItems: s.backpackItems,
  }));

  // 整顿背囊：仅当 pendingMagicAction 处于 'reorganize-backpack' / 'multi-select'
  // 步骤时打开多选弹窗。手牌列表过滤掉「正在结算的这张牌」本身（防御性，
  // 因 PLAY_CARD 已经把它从手牌移除）。
  const reorganizePending =
    gs.pendingMagicAction
    && gs.pendingMagicAction.effect === 'reorganize-backpack'
    && gs.pendingMagicAction.step === 'multi-select'
      ? gs.pendingMagicAction
      : null;

  return (
    <>
      <HandMagicUpgradeModal
        open={Boolean(gs.handMagicUpgradeModal)}
        onClose={cb.onHandMagicUpgradeClose}
        handCards={gs.handCards}
        sourceCardId={gs.handMagicUpgradeModal?.sourceCardId ?? null}
        onUpgrade={cb.onHandMagicUpgradeSelect}
      />

      <MirrorCopyModal
        open={Boolean(gs.mirrorCopyModal)}
        onClose={cb.onMirrorCopyCancel}
        equipmentSlot1={gs.equipmentSlot1}
        equipmentSlot2={gs.equipmentSlot2}
        amuletSlots={gs.amuletSlots}
        handCards={gs.handCards}
        onConfirm={cb.onMirrorCopyConfirm}
      />

      <AmplifyModal
        open={Boolean(gs.amplifyModal)}
        onClose={cb.onAmplifyCancel}
        equipmentSlot1={gs.equipmentSlot1}
        equipmentSlot2={gs.equipmentSlot2}
        handCards={gs.handCards}
        backpackItems={gs.amplifyModal?.scope === 'wide' ? gs.backpackItems : undefined}
        onConfirm={cb.onAmplifyConfirm}
      />

      <AmplifyModal
        open={Boolean(gs.eventAmplifyHandPicker)}
        onClose={cb.onEventAmplifyHandCancel}
        equipmentSlot1={null}
        equipmentSlot2={null}
        handCards={gs.handCards}
        onConfirm={(selection) => {
          if (selection.kind === 'hand') cb.onEventAmplifyHandConfirm(selection.cardId);
        }}
      />

      <PermGrantModal
        open={Boolean(gs.permGrantModal)}
        onClose={cb.onPermGrantCancel}
        handCards={gs.handCards}
        amuletSlots={gs.amuletSlots}
        sourceCardId={gs.permGrantModal?.sourceCardId ?? null}
        sourceType={gs.permGrantModal?.sourceType ?? 'magic'}
        onConfirm={cb.onPermGrantConfirm}
      />

      {reorganizePending && (
        <BackpackReorganizeModal
          open
          prompt={reorganizePending.prompt}
          maxSelections={reorganizePending.maxSelections}
          handCards={gs.handCards.filter(c => c.id !== reorganizePending.card.id)}
          amuletCards={gs.amuletSlots.filter((c): c is NonNullable<typeof c> => Boolean(c)) as GameCardData[]}
          equipmentSlot1={(gs.equipmentSlot1 as GameCardData | null) ?? null}
          equipmentSlot2={(gs.equipmentSlot2 as GameCardData | null) ?? null}
          onConfirm={cb.onBackpackReorganizeConfirm}
        />
      )}

      {gs.pendingHandDiscardSelection && (
        <HandDiscardSelectionModal
          open
          title={gs.pendingHandDiscardSelection.title}
          prompt={gs.pendingHandDiscardSelection.prompt}
          requiredCount={gs.pendingHandDiscardSelection.count}
          eligibleHandCards={getEligibleHandDiscardCards(
            gs.handCards as GameCardData[],
            gs.pendingHandDiscardSelection.sourceCardId,
          )}
          onConfirm={cb.onHandDiscardSelectionConfirm}
        />
      )}
    </>
  );
}

export const MagicCardContainer = memo(MagicCardContainerInner);
