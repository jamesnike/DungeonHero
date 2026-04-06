/**
 * Monsters Domain — pure logic for monster rewards, persuasion, and targeting.
 */

import type { GameCardData } from '@/components/GameCard';
import type {
  EquipmentSlotId,
  MonsterRewardEffect,
  MonsterRewardOption,
  MonsterRewardDrop,
  ActiveRowSlots,
} from '@/components/game-board/types';
import type { GameState } from './types';
import { PERSUADE_COST, INITIAL_HP } from './constants';
import { flattenActiveRowSlots } from './helpers';

// ---------------------------------------------------------------------------
// Monster reward generation
// ---------------------------------------------------------------------------

export function generateMonsterRewardOptions(monster: GameCardData): MonsterRewardOption[] {
  if (monster.isBuglet) {
    const amount = 2 + Math.floor(Math.random() * 2);
    return [{
      id: `reward-gold-${monster.id}`,
      title: '战利品',
      description: `获得 ${amount} 金币`,
      effect: { type: 'gold', amount },
    }];
  }

  const options: MonsterRewardOption[] = [];
  const layers = monster.fury ?? monster.hpLayers ?? 1;
  const isElite = Boolean(monster.monsterSpecial);
  const isBoss = Boolean(monster.bossPhase);

  const goldAmount = isBoss ? 25 : isElite ? 15 : 5 + layers * 2;
  options.push({
    id: `reward-gold-${monster.id}`,
    title: '战利品',
    description: `获得 ${goldAmount} 金币`,
    effect: { type: 'gold', amount: goldAmount },
  });

  const healAmount = isBoss ? 15 : isElite ? 10 : 3 + layers;
  options.push({
    id: `reward-heal-${monster.id}`,
    title: '战后休整',
    description: `恢复 ${healAmount} 点生命`,
    effect: { type: 'heal', amount: healAmount },
  });

  if (isBoss) {
    options.push({
      id: `reward-maxhp-${monster.id}`,
      title: '生命精华',
      description: '永久最大生命 +5',
      effect: { type: 'maxHp', amount: 5 },
    });
    options.push({
      id: `reward-spell-${monster.id}`,
      title: '奥术精华',
      description: '永久法术伤害 +2',
      effect: { type: 'spellDamage', amount: 2 },
    });
  } else if (isElite) {
    const bonusType: 'damage' | 'shield' = Math.random() < 0.5 ? 'damage' : 'shield';
    const slotId: EquipmentSlotId = Math.random() < 0.5 ? 'equipmentSlot1' : 'equipmentSlot2';
    const slotLabel = slotId === 'equipmentSlot1' ? '左' : '右';
    const bonusLabel = bonusType === 'damage' ? '伤害' : '护甲';
    options.push({
      id: `reward-slot-${monster.id}`,
      title: `${slotLabel}槽${bonusLabel}强化`,
      description: `${slotLabel}装备栏永久${bonusLabel} +2`,
      effect: { type: 'slotBonus', slotId, bonusType, amount: 2 },
    });
  }

  if (!isBoss) {
    options.push({
      id: `reward-discover-${monster.id}`,
      title: '职业探索',
      description: '发现一张专属卡',
      effect: { type: 'discoverClass' },
    });
  }

  if (layers >= 3 || isElite) {
    options.push({
      id: `reward-repair-${monster.id}`,
      title: '装备修复',
      description: '恢复所有装备 2 点耐久',
      effect: { type: 'repair', amount: 2, targets: ['weapon', 'shield', 'monster'] },
    });
  }

  if (Math.random() < 0.15) {
    options.push({
      id: `reward-spell-${monster.id}`,
      title: '奥术精华',
      description: '永久法术伤害 +1',
      effect: { type: 'spellDamage', amount: 1 },
    });
  }

  if (Math.random() < 0.15) {
    options.push({
      id: `reward-lifesteal-${monster.id}`,
      title: '超杀吸血 +1',
      description: '汲取超杀的力量，将溢出伤害转化为治疗。',
      effect: { type: 'spellLifesteal', amount: 1 },
    });
  }

  if (Math.random() < 0.15) {
    options.push({
      id: `reward-stuncap-${monster.id}`,
      title: '击晕上限 +5%',
      description: '强化精神力，提高击晕怪物的概率上限。',
      effect: { type: 'stunCap', amount: 5 },
    });
  }

  return options;
}

// ---------------------------------------------------------------------------
// Apply monster reward
// ---------------------------------------------------------------------------

export function applyMonsterRewardPure(
  state: GameState,
  reward: MonsterRewardOption,
): Partial<GameState> {
  const effect = reward.effect;

  switch (effect.type) {
    case 'gold':
      return { gold: state.gold + effect.amount };

    case 'heal': {
      const maxHp = INITIAL_HP + state.permanentMaxHpBonus;
      return { hp: Math.min(maxHp, state.hp + effect.amount) };
    }

    case 'maxHp':
      return { permanentMaxHpBonus: state.permanentMaxHpBonus + effect.amount };

    case 'spellDamage':
      return { permanentSpellDamageBonus: state.permanentSpellDamageBonus + effect.amount };

    case 'spellLifesteal':
      return { permanentSpellLifesteal: state.permanentSpellLifesteal + effect.amount };

    case 'stunCap':
      return { stunCap: Math.min(100, state.stunCap + effect.amount) };

    case 'backpackCapacity':
      return { backpackCapacityModifier: state.backpackCapacityModifier + effect.amount };

    case 'slotBonus': {
      const slotId = effect.slotId;
      const bonusType = effect.bonusType;
      const amount = effect.amount;
      return {
        equipmentSlotBonuses: {
          ...state.equipmentSlotBonuses,
          [slotId]: {
            ...state.equipmentSlotBonuses[slotId],
            [bonusType]: (state.equipmentSlotBonuses[slotId]?.[bonusType] ?? 0) + amount,
          },
        },
      };
    }

    case 'drawBackpack':
      return {};

    case 'discoverClass':
    case 'discoverGraveyard':
      return {};

    case 'repair':
      return {};

    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Queue / dequeue monster rewards
// ---------------------------------------------------------------------------

export function queueMonsterRewardPure(
  state: GameState,
  drop: MonsterRewardDrop,
): Partial<GameState> {
  if (state.activeMonsterReward) {
    return {
      monsterRewardQueue: [...state.monsterRewardQueue, drop],
    };
  }
  return {
    activeMonsterReward: drop,
    selectedMonsterRewards: null,
  };
}

export function dequeueMonsterRewardPure(
  state: GameState,
): Partial<GameState> {
  if (state.monsterRewardQueue.length === 0) {
    return {
      activeMonsterReward: null,
      selectedMonsterRewards: null,
    };
  }
  const [next, ...rest] = state.monsterRewardQueue;
  return {
    monsterRewardQueue: rest,
    activeMonsterReward: next,
    selectedMonsterRewards: null,
  };
}

// ---------------------------------------------------------------------------
// Persuasion
// ---------------------------------------------------------------------------

export function canPersuade(state: GameState): boolean {
  const effectiveCost = Math.max(0, PERSUADE_COST + (state.persuadeCostModifier ?? 0));
  return state.gold >= effectiveCost;
}

export function computePersuadeRate(
  monster: GameCardData,
  weaponPersuadeBoost: number = 0,
): number {
  const baseLayers = monster.fury ?? monster.hpLayers ?? 1;
  const currentLayers = monster.currentLayer ?? baseLayers;
  const layersLost = baseLayers - currentLayers;
  const isElite = Boolean(monster.monsterSpecial);

  let baseRate = 20 + layersLost * 15;
  if (isElite) baseRate = Math.floor(baseRate * 0.6);
  if (monster.bossPhase) baseRate = 0;

  const cardBoost = (monster as any)._persuadeBoost ?? 0;
  return Math.min(100, Math.max(0, baseRate + weaponPersuadeBoost + cardBoost));
}

export function persuadeSuccessPatch(
  state: GameState,
  monster: GameCardData,
  targetSlotId: EquipmentSlotId,
): Partial<GameState> {
  const monsterEquip: GameCardData = {
    ...monster,
    type: 'monster',
    durability: monster.currentLayer ?? monster.fury ?? 1,
    maxDurability: monster.fury ?? monster.hpLayers ?? 1,
  };

  const activeCards = state.activeCards.map(c =>
    c?.id === monster.id ? null : c,
  ) as ActiveRowSlots;

  return {
    gold: state.gold - Math.max(0, PERSUADE_COST + (state.persuadeCostModifier ?? 0)),
    activeCards,
    ...(targetSlotId === 'equipmentSlot1'
      ? { equipmentSlot1: monsterEquip }
      : { equipmentSlot2: monsterEquip }),
  };
}

// ---------------------------------------------------------------------------
// Monster card update helper
// ---------------------------------------------------------------------------

export function updateMonsterInActiveRow(
  activeCards: ActiveRowSlots,
  monsterId: string,
  updater: (card: GameCardData) => GameCardData,
): ActiveRowSlots {
  return activeCards.map(card => {
    if (!card || card.id !== monsterId) return card;
    return updater(card);
  }) as ActiveRowSlots;
}

// ---------------------------------------------------------------------------
// Get engaged monster cards from active row
// ---------------------------------------------------------------------------

export function getEngagedMonsterCards(
  activeCards: ActiveRowSlots,
  engagedMonsterIds: string[],
): GameCardData[] {
  return flattenActiveRowSlots(activeCards).filter(
    c => c.type === 'monster' && engagedMonsterIds.includes(c.id),
  );
}
