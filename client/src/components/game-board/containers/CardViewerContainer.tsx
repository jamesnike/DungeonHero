import { memo, useMemo } from 'react';
import { useShallowGameState } from '@/hooks/useGameEngine';
import { useModalCallbacks } from '../contexts/ModalCallbacksContext';
import { useModalUI } from '../contexts/ModalUIContext';
import { BASE_BACKPACK_CAPACITY } from '@/game-core/constants';

import DeckViewerModal from '@/components/DeckViewerModal';
import BackpackViewerModal from '@/components/BackpackViewerModal';
import CardDetailsModal from '@/components/CardDetailsModal';
import CardUpgradeModal from '@/components/CardUpgradeModal';
import CardDeletionModal from '@/components/CardDeletionModal';

import type { GameCardData } from '@/components/GameCard';

function CardViewerContainerInner() {
  const cb = useModalCallbacks();
  const ui = useModalUI();

  const gs = useShallowGameState(s => ({
    remainingDeck: s.remainingDeck,
    backpackItems: s.backpackItems,
    permanentMagicRecycleBag: s.permanentMagicRecycleBag,
    turnCount: s.turnCount,
    deleteModalOpen: s.deleteModalOpen,
    cardActionContext: s.cardActionContext,
    handCards: s.handCards,
    upgradeModalOpen: s.upgradeModalOpen,
    upgradeModalMaxCount: s.upgradeModalMaxCount,
    equipmentSlot1: s.equipmentSlot1,
    equipmentSlot2: s.equipmentSlot2,
    equipmentSlot1Reserve: s.equipmentSlot1Reserve,
    equipmentSlot2Reserve: s.equipmentSlot2Reserve,
    amuletSlots: s.amuletSlots,
    selectedMonsterRewards: s.selectedMonsterRewards,
    backpackCapacityModifier: s.backpackCapacityModifier,
    acquiredUniqueClassCardIds: s.acquiredUniqueClassCardIds,
  }));

  const currentTurn = gs.turnCount;
  const backpackCapacity = Math.max(1, BASE_BACKPACK_CAPACITY + gs.backpackCapacityModifier);

  const flatEquipmentCards: GameCardData[] = (
    [gs.equipmentSlot1, ...gs.equipmentSlot1Reserve, gs.equipmentSlot2, ...gs.equipmentSlot2Reserve] as (GameCardData | null)[]
  ).filter(Boolean) as GameCardData[];
  const flatAmuletCards: GameCardData[] = gs.amuletSlots;

  const monsterRewardPreview = useMemo(() => {
    if (ui.selectedCard?.type !== 'monster' || !gs.selectedMonsterRewards?.length) return undefined;
    return gs.selectedMonsterRewards.map(option => ({
      id: option.id,
      title: option.title,
      description: option.description,
      detail: option.detail,
    }));
  }, [ui.selectedCard, gs.selectedMonsterRewards]);

  return (
    <>
      <DeckViewerModal
        open={ui.deckViewerOpen}
        onOpenChange={cb.onDeckViewerChange}
        remainingCards={gs.remainingDeck}
        onCardSelect={cb.onCardSelect}
      />

      <BackpackViewerModal
        open={ui.backpackViewerOpen}
        onOpenChange={cb.onBackpackViewerChange}
        cards={gs.backpackItems}
        capacity={backpackCapacity}
        recycleCards={gs.permanentMagicRecycleBag}
        onCardSelect={cb.onCardSelect}
      />

      <CardDetailsModal
        card={ui.selectedCard}
        open={ui.detailsModalOpen}
        onOpenChange={cb.onDetailsModalChange}
        currentTurn={currentTurn}
        monsterRewards={monsterRewardPreview}
        acquiredUniqueClassCardIds={gs.acquiredUniqueClassCardIds}
      />

      <CardDeletionModal
        open={gs.deleteModalOpen}
        onOpenChange={cb.onDeleteModalChange}
        handCards={gs.handCards}
        backpackCards={gs.backpackItems}
        recycleBagCards={gs.permanentMagicRecycleBag}
        equipmentCards={flatEquipmentCards}
        amuletCards={flatAmuletCards}
        keyword={gs.cardActionContext?.keyword}
        onDeleteCard={cb.onDeleteCardConfirm}
        title={gs.cardActionContext?.title}
        description={gs.cardActionContext?.description}
        requiredCount={gs.cardActionContext?.requiredCount}
        remainingCount={gs.cardActionContext?.remainingCount}
        handOnly={gs.cardActionContext?.handOnly}
        selectionMode={gs.cardActionContext?.selectionMode}
        maxCount={gs.cardActionContext?.maxCount}
        onBatchConfirm={cb.onBatchDeleteConfirm}
      />

      <CardUpgradeModal
        open={gs.upgradeModalOpen}
        onOpenChange={cb.onUpgradeModalChange}
        maxUpgrades={gs.upgradeModalMaxCount}
        handCards={gs.handCards}
        backpackItems={gs.backpackItems}
        equipmentSlot1={gs.equipmentSlot1}
        equipmentSlot2={gs.equipmentSlot2}
        amuletSlots={gs.amuletSlots}
        onUpgrade={cb.onCardUpgrade}
      />
    </>
  );
}

export const CardViewerContainer = memo(CardViewerContainerInner);
