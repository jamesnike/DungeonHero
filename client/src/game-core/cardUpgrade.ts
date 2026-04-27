import type { GameCardData } from '@/components/GameCard';
import type { EquipmentItem, AmuletItem } from '@/components/game-board/types';
import type { GameState } from './types';
import { executeOnUpgrade } from './card-schema/on-upgrade';
import { computeCardText } from './card-schema/card-text';
// Side-effect imports: register all upgrade handlers and text formatters.
import './card-schema/definitions/upgrades';
import './card-schema/definitions/card-text';

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

  // Derived display layer: any formatter registered for this card overrides
  // whatever description fields the handler imperatively set. Cards with no
  // handler at all (e.g. 怀柔令, knight-class 紧急回收, 查阅动作, 锐意鼓舞)
  // pick up their upgraded text from this step alone — the handler-less gap
  // that previously left UI text frozen at level 0.
  const text = computeCardText(upgraded, state);
  if (text) {
    if (text.description !== undefined) upgraded.description = text.description;
    if (text.shortDescription !== undefined) upgraded.shortDescription = text.shortDescription;
    if (text.magicEffect !== undefined) upgraded.magicEffect = text.magicEffect;
  }

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
