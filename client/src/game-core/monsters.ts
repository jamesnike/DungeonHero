/**
 * Monsters Domain — pure logic for monster rewards, persuasion, and targeting.
 */

import type { GameCardData } from '@/components/GameCard';
import type {
  EquipmentSlotId,
  EquipmentItem,
  MonsterRewardEffect,
  MonsterRewardOption,
  MonsterRewardDrop,
  ActiveRowSlots,
  SlotPermanentBonus,
  EquipmentRepairTarget,
} from '@/components/game-board/types';
import type { GameState } from './types';
import type { RngState } from './rng';
import { nextInt, nextBool, nextId, nextRandom } from './rng';
import { PERSUADE_COST, INITIAL_HP, BASE_BACKPACK_CAPACITY, HAND_LIMIT } from './constants';
import { flattenActiveRowSlots } from './helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasRepairableEquipment(state: GameState): boolean {
  for (const slotId of ['equipmentSlot1', 'equipmentSlot2'] as const) {
    const item = state[slotId];
    if (!item) continue;
    const maxDur = item.maxDurability ?? item.durability ?? 0;
    if (maxDur <= 0) continue;
    if ((item.durability ?? maxDur) < maxDur) return true;
  }
  return false;
}

function isUpgradeableCard(card: GameCardData): boolean {
  const TYPES = new Set(['magic', 'weapon', 'shield', 'potion', 'amulet', 'monster']);
  if (!TYPES.has(card.type)) return false;
  return (card.maxUpgradeLevel ?? 0) > 0;
}

function isCardAtMaxUpgrade(card: GameCardData): boolean {
  return (card.upgradeLevel ?? 0) >= (card.maxUpgradeLevel ?? 0);
}

function slotLabel(slotId: EquipmentSlotId): string {
  return slotId === 'equipmentSlot1' ? '左侧装备栏' : '右侧装备栏';
}

function bonusLabel(bonusType: keyof SlotPermanentBonus): string {
  return bonusType === 'damage' ? '伤害' : '护甲';
}

// ---------------------------------------------------------------------------
// Monster reward generation
// ---------------------------------------------------------------------------

export function generateMonsterRewardOptions(
  monster: GameCardData,
  state: GameState,
  rng: RngState,
): [MonsterRewardOption[], RngState] {
  let r = rng;
  const mkId = (): string => { const [id, next] = nextId(r, 'monster-reward'); r = next; return id; };

  if (monster.isBuglet) {
    const [amount, r2] = nextInt(r, 2, 3); r = r2;
    return [[{ id: mkId(), title: `获得 ${amount} 金币`, description: '小虫子身上掉落的零星金币。', detail: '即时奖励', effect: { type: 'gold', amount } }], r];
  }

  const isElite = Boolean(monster.monsterSpecial);
  const maxHp = INITIAL_HP + state.permanentMaxHpBonus;
  const backpackCapacity = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier);
  const effectiveHandLimit = HAND_LIMIT + (state.handLimitBonus ?? 0);

  const options: MonsterRewardOption[] = [];
  const usedKeys = new Set<string>();
  const pushOption = (option?: MonsterRewardOption | null) => {
    if (!option) return;
    const key = `${option.effect.type}-${option.detail ?? option.title}`;
    if (usedKeys.has(key)) return;
    usedKeys.add(key);
    options.push(option);
  };

  const createSlotBonusOption = (): MonsterRewardOption => {
    const [pickSlot, r2] = nextBool(r); r = r2;
    const slotId: EquipmentSlotId = pickSlot ? 'equipmentSlot1' : 'equipmentSlot2';
    const [pickDamage, r3] = nextBool(r); r = r3;
    const bt: keyof SlotPermanentBonus = pickDamage ? 'damage' : 'shield';
    return { id: mkId(), title: `${slotLabel(slotId)} +1 ${bonusLabel(bt)}`, description: '永久强化该装备槽位的基础属性。', detail: '持久增益', effect: { type: 'slotBonus', slotId, bonusType: bt, amount: 1 } };
  };

  const createGoldOption = (): MonsterRewardOption => {
    const [amount, r2] = nextInt(r, 5, 8); r = r2;
    return { id: mkId(), title: `获得 ${amount} 金币`, description: '拾取战场上散落的金币。', detail: '即时奖励', effect: { type: 'gold', amount } };
  };

  const createHealOption = (): MonsterRewardOption | null => {
    if (state.hp >= maxHp) return null;
    const [amount, r2] = nextInt(r, 2, 4); r = r2;
    return { id: mkId(), title: `回复 ${amount} 点生命`, description: '抚平战斗中留下的伤痕。', detail: '即时治疗', effect: { type: 'heal', amount } };
  };

  const createRepairOption = (): MonsterRewardOption | null => {
    if (!hasRepairableEquipment(state)) return null;
    return { id: mkId(), title: '修复 1 点耐久', description: '选择一件武器或护盾，恢复 1 点耐久值。', detail: '装备保养', effect: { type: 'repair', amount: 1, targets: ['weapon', 'shield', 'monster'] as EquipmentRepairTarget[] } };
  };

  const createDrawOption = (): MonsterRewardOption | null => {
    if (state.backpackItems.length === 0 || state.handCards.length >= effectiveHandLimit) return null;
    return { id: mkId(), title: '从背包抽 2 张牌', description: '快速检索背包里的资源。', detail: '资源调度', effect: { type: 'drawBackpack', amount: 2 } };
  };

  const createDiscoverOption = (): MonsterRewardOption | null => {
    if (state.classDeck.length === 0 || state.backpackItems.length >= backpackCapacity) return null;
    return { id: mkId(), title: '发现一张专属牌', description: '从职业卡牌中挑选新的战术手段。', detail: isElite ? '精英掉落' : '稀有掉落', effect: { type: 'discoverClass' } };
  };

  const createGraveyardDiscoverOption = (): MonsterRewardOption | null => {
    if (state.discardedCards.length === 0 || state.backpackItems.length >= backpackCapacity) return null;
    return { id: mkId(), title: '发现一张坟场牌', description: '从坟场中挑选一张卡牌放入背包。', detail: isElite ? '精英掉落' : '稀有掉落', effect: { type: 'discoverGraveyard' } };
  };

  const createMaxHpOption = (): MonsterRewardOption => {
    const [pickTwo, r2] = nextBool(r); r = r2;
    const amount = pickTwo ? 2 : 3;
    return { id: mkId(), title: `最大生命 +${amount}`, description: '淬炼体魄，扩张体能上限。', detail: '永久增益', effect: { type: 'maxHp', amount } };
  };

  const createBackpackCapacityOption = (): MonsterRewardOption =>
    ({ id: mkId(), title: '背包上限 +1', description: '扩展背包空间，容纳更多物资。', detail: '永久增益', effect: { type: 'backpackCapacity', amount: 1 } });

  const createSpellDamageOption = (): MonsterRewardOption =>
    ({ id: mkId(), title: '法术伤害 +1', description: '聚焦奥术，让法术造成更多伤害。', detail: '永久增益', effect: { type: 'spellDamage', amount: 1 } });

  const createSpellLifestealOption = (): MonsterRewardOption =>
    ({ id: mkId(), title: '超杀吸血 +1', description: '汲取超杀的力量，将溢出伤害转化为治疗。', detail: '永久增益', effect: { type: 'spellLifesteal', amount: 1 } });

  const createStunCapOption = (): MonsterRewardOption =>
    ({ id: mkId(), title: '击晕上限 +5%', description: '强化精神力，提高击晕怪物的概率上限。', detail: '永久增益', effect: { type: 'stunCap', amount: 5 } });

  const createUpgradeOption = (): MonsterRewardOption | null => {
    const hasUpgradeable =
      state.handCards.some(c => isUpgradeableCard(c) && !isCardAtMaxUpgrade(c))
      || [state.equipmentSlot1, state.equipmentSlot2].some(c => c != null && isUpgradeableCard(c) && !isCardAtMaxUpgrade(c))
      || state.amuletSlots.some(c => c != null && isUpgradeableCard(c) && !isCardAtMaxUpgrade(c));
    if (!hasUpgradeable) return null;
    return { id: mkId(), title: '升级一张牌', description: '选择一张可升级的卡牌，提升其品质。', detail: '战术强化', effect: { type: 'upgradeCard' } };
  };

  pushOption(createSlotBonusOption());
  pushOption(createSlotBonusOption());
  pushOption(createGoldOption());
  pushOption(createHealOption());
  pushOption(createRepairOption());
  pushOption(createDrawOption());
  { let proc: boolean; if (!isElite) { [proc, r] = nextBool(r, 0.10); } else { proc = true; } if (proc) pushOption(createDiscoverOption()); }
  pushOption(createGraveyardDiscoverOption());
  pushOption(createMaxHpOption());
  { const [proc, r2] = nextBool(r, 0.25); r = r2; if (proc) pushOption(createUpgradeOption()); }
  { const [proc, r2] = nextBool(r, 0.15); r = r2; if (proc) pushOption(createSpellDamageOption()); }
  { const [proc, r2] = nextBool(r, 0.15); r = r2; if (proc) pushOption(createSpellLifestealOption()); }
  { const [proc, r2] = nextBool(r, 0.15); r = r2; if (proc) pushOption(createStunCapOption()); }
  { const [proc, r2] = nextBool(r, 0.15); r = r2; if (proc) pushOption(createBackpackCapacityOption()); }
  {
    const [proc, r2] = nextBool(r, 0.15); r = r2;
    if (proc) {
      pushOption({ id: mkId(), title: '劝降成功率 +5%', description: '提升交涉能力，劝降怪物的成功率提高。', detail: '永久增益', effect: { type: 'persuadeRateBonus', amount: 5 } });
    }
  }
  {
    const [proc, r2] = nextBool(r, 0.03); r = r2;
    if (!state.statSwapCardObtained && proc) {
      pushOption({ id: mkId(), title: '获得魔法卡「颠倒乾坤」', description: '永久魔法（Perm 2）：选择一个怪物，将其攻击和血量上限对换。侧击：50% 击晕。', detail: '极稀有掉落', effect: { type: 'grantStatSwapCard' } });
    }
  }

  // Weighted selection without replacement: discoverClass is boosted so it wins
  // the random pick more often when present in the pool. discoverGraveyard uses
  // the default weight (slightly reduced from its previous boosted weight).
  const getRewardWeight = (opt: MonsterRewardOption): number => {
    if (opt.effect.type === 'discoverClass') return 3;
    return 1;
  };

  const pool = [...options];
  const selected: MonsterRewardOption[] = [];
  while (selected.length < 2 && pool.length > 0) {
    const totalWeight = pool.reduce((sum, opt) => sum + getRewardWeight(opt), 0);
    const [roll, r2] = nextRandom(r); r = r2;
    let target = roll * totalWeight;
    let chosenIdx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      target -= getRewardWeight(pool[i]);
      if (target <= 0) { chosenIdx = i; break; }
    }
    const [option] = pool.splice(chosenIdx, 1);
    if (option) selected.push(option);
  }
  while (selected.length < 2) {
    selected.push(createGoldOption());
  }
  return [selected, r];
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
    monsterRewardMinimized: false,
  };
}

export function dequeueMonsterRewardPure(
  state: GameState,
): Partial<GameState> {
  if (state.monsterRewardQueue.length === 0) {
    return {
      activeMonsterReward: null,
      selectedMonsterRewards: null,
      monsterRewardMinimized: false,
    };
  }
  const [next, ...rest] = state.monsterRewardQueue;
  return {
    monsterRewardQueue: rest,
    activeMonsterReward: next,
    selectedMonsterRewards: null,
    monsterRewardMinimized: false,
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
      ? { equipmentSlot1: monsterEquip as EquipmentItem }
      : { equipmentSlot2: monsterEquip as EquipmentItem }),
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
