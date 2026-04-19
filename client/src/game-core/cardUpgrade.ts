import type { GameCardData } from '@/components/GameCard';
import type { EquipmentItem, AmuletItem } from '@/components/game-board/types';
import type { GameState } from './types';
import { executeOnUpgrade } from './card-schema/on-upgrade';
// Side-effect import: registers all upgrade handlers in the on-upgrade registry.
import './card-schema/definitions/upgrades';

export interface UpgradeCardResult {
  patch: Partial<GameState>;
  upgradedName: string;
}

function applyUpgrade(card: GameCardData, state: GameState): { card: GameCardData; name: string } | null {
  const currentLevel = card.upgradeLevel ?? 0;
  const maxLevel = card.maxUpgradeLevel ?? 0;
  if (currentLevel >= maxLevel) return null;
  const newLevel = currentLevel + 1;

  const upgraded: GameCardData = { ...card, upgradeLevel: newLevel };
  executeOnUpgrade(upgraded, newLevel, state);

  return { card: upgraded, name: upgraded.name };
}

export function upgradeCardPure(state: GameState, cardId: string): UpgradeCardResult {
  let upgradedName = '';

  const mapCard = (card: GameCardData): GameCardData => {
    if (card.id !== cardId) return card;
    const result = applyUpgrade(card, state);
    if (!result) return card;
    upgradedName = result.name;
    return result.card;
  };

  const patch: Partial<GameState> = {
    handCards: state.handCards.map(mapCard),
    equipmentSlot1: state.equipmentSlot1 ? mapCard(state.equipmentSlot1) as EquipmentItem : null,
    equipmentSlot2: state.equipmentSlot2 ? mapCard(state.equipmentSlot2) as EquipmentItem : null,
    amuletSlots: state.amuletSlots.map(mapCard) as AmuletItem[],
    backpackItems: state.backpackItems.map(mapCard),
    permanentMagicRecycleBag: state.permanentMagicRecycleBag.map(mapCard),
    heroSkillBanner: `「${upgradedName || '卡牌'}」升级成功！`,
  };

  if (state.upgradeModalMaxCount == null) {
    patch.upgradeModalOpen = false;
  }

  return { patch, upgradedName };
}
