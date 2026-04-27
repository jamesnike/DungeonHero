import { createContext, useContext } from 'react';
import type { GameCardData } from '@/components/GameCard';
import type { MirrorCopySelection, AmplifySelection, MonsterFusionSelection } from '@/game-core/types';
import type { EquipmentSlotId } from '../types';
import type { CardSource } from '@/components/CardDeletionModal';
import type { BackpackReorganizeSelection } from '@/components/BackpackReorganizeModal';

export interface ModalCallbacks {
  onCardSelect: (card: GameCardData) => void;

  onShopPurchase: (cardId: string) => void;
  onShopClose: () => void;
  onShopMinimize: () => void;
  onShopHealRequest: () => void;
  onShopLevelUpRequest: () => void;
  onShopDeleteRequest: () => void;
  onShopSkillDiscoverRequest: () => void;
  onShopEquipAttackRequest: () => void;
  onShopEquipArmorRequest: () => void;
  onShopRefreshRequest: () => void;
  onShopSkillSelect: (skillId: string) => void;

  onEventChoice: (choiceIndex: number) => void;
  onEventMinimize: () => void;
  onDiceRollResult: (value: number) => void;
  onDiceModalClose: () => void;
  onMagicChoice: (choiceId: string) => void;
  onEquipmentPromptSelect: (slotId: EquipmentSlotId) => void;
  onEquipmentPromptCancel: () => void;

  onDiscoverSelect: (cardId: string) => void;
  onDiscoverCancel: () => void;
  onGraveyardDiscoverSelect: (cardId: string) => void;
  onGraveyardDiscoverCancel: () => void;
  onGhostBladeExileConfirm: (selectedIds: string[]) => void;

  onMonsterRewardSelect: (optionId: string) => void;
  onPersuadeConfirm: () => void;
  onPersuadeDiceResult: (value: number) => void;
  onPersuadeClose: () => void;

  onDeleteModalChange: (open: boolean) => void;
  onDeleteCardConfirm: (cardId: string, source: CardSource) => void;
  onBatchDeleteConfirm?: (selections: Array<{ cardId: string; source: CardSource }>) => void;
  onDetailsModalChange: (open: boolean) => void;
  onHeroDetailsChange: (open: boolean) => void;

  onUpgradeModalChange: (open: boolean) => void;
  onCardUpgrade: (cardId: string) => void;

  onHandMagicUpgradeSelect: (cardIds: string[]) => void;
  onHandMagicUpgradeClose: () => void;
  onMirrorCopyConfirm: (selection: MirrorCopySelection) => void;
  onMirrorCopyCancel: () => void;
  onMonsterFusionConfirm: (selection: MonsterFusionSelection) => void;
  onMonsterFusionCancel: () => void;
  onAmplifyConfirm: (selection: AmplifySelection) => void;
  onAmplifyCancel: () => void;
  onEventAmplifyHandConfirm: (cardId: string) => void;
  onEventAmplifyHandCancel: () => void;
  onPermGrantConfirm: (cardId: string) => void;
  onPermGrantCancel: () => void;
  onBackpackReorganizeConfirm: (selections: BackpackReorganizeSelection[]) => void;
  onHandDiscardSelectionConfirm: (cardIds: string[]) => void;

  onCancelHeroMagicAction: () => void;
  onCancelPotionAction: () => void;
  onPotionChoiceSelection: (choice: 'repair' | 'upgrade') => void;

  /** 不灭守护自动触发后，玩家点「知道了」按钮的关闭回调（无选项）。 */
  onDismissDeathWardNotice: () => void;
  onDaggerSelfDestructConfirm: () => void;
  onDaggerSelfDestructDecline: () => void;
  onSkillSelection: (skillId: string) => void;
  onCardDraftComplete: (selectedCards: GameCardData[]) => void;
  onRestart: () => void;
  onEndHeroTurn: () => void;
  onUndo: () => void;
  onGameOverMinimize: () => void;
  onWraithPassiveUnlockChange: (open: boolean) => void;
  onDeckViewerChange: (open: boolean) => void;
  onBackpackViewerChange: (open: boolean) => void;
}

const ModalCallbacksContext = createContext<ModalCallbacks | null>(null);

export function useModalCallbacks(): ModalCallbacks {
  const ctx = useContext(ModalCallbacksContext);
  if (!ctx) throw new Error('useModalCallbacks must be used within ModalCallbacksProvider');
  return ctx;
}

export const ModalCallbacksProvider = ModalCallbacksContext.Provider;
