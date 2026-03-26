import type { GameCardData } from '@/components/GameCard';

const MAX_RAGE_LAYERS = 4;

export type MonsterRageRule = {
  base: number;
  interval: number;
};

export type MonsterUpgrade = {
  waterfallLevel: number;
  attackBonus: number;
  hpBonus: number;
  specialAbility?: string;
  specialDesc?: string;
};

const MONSTER_RAGE_RULES: Record<string, MonsterRageRule> = {
  Dragon: { base: 2, interval: 4 },
  Skeleton: { base: 1, interval: 4 },
  Goblin: { base: 1, interval: 4 },
  Ogre: { base: 1, interval: 3 },
  Wraith: { base: 1, interval: 4 },
};

const MONSTER_UPGRADES: Record<string, MonsterUpgrade[]> = {
  Dragon:   [
    { waterfallLevel: 4, attackBonus: 2, hpBonus: 3 },
    { waterfallLevel: 8, attackBonus: 4, hpBonus: 6 },
    { waterfallLevel: 12, attackBonus: 6, hpBonus: 9, specialAbility: 'dragon-bleed-destroy', specialDesc: '流血破甲：每失去一个血层，破坏耐久度 > 剩余血层数的装备' },
  ],
  Skeleton: [
    { waterfallLevel: 3, attackBonus: 2, hpBonus: 1 },
    { waterfallLevel: 7, attackBonus: 4, hpBonus: 2 },
    { waterfallLevel: 11, attackBonus: 6, hpBonus: 3, specialAbility: 'skeleton-no-layer-cost', specialDesc: '不朽之骨：复生后攻击不消耗血层' },
  ],
  Goblin:   [
    { waterfallLevel: 3, attackBonus: 1, hpBonus: 2 },
    { waterfallLevel: 7, attackBonus: 2, hpBonus: 4 },
    { waterfallLevel: 11, attackBonus: 3, hpBonus: 6, specialAbility: 'goblin-steal-scale', specialDesc: '贪婪强化：每偷到X金币，攻击力和生命值 +X' },
  ],
  Ogre:     [
    { waterfallLevel: 5, attackBonus: 1, hpBonus: 3 },
    { waterfallLevel: 9, attackBonus: 2, hpBonus: 6 },
    { waterfallLevel: 13, attackBonus: 3, hpBonus: 9, specialAbility: 'ogre-enter-discard', specialDesc: '蛮力震慑：入场时随机弃掉玩家一张手牌' },
  ],
  Wraith:   [
    { waterfallLevel: 4, attackBonus: 2, hpBonus: 2 },
    { waterfallLevel: 8, attackBonus: 4, hpBonus: 4 },
    { waterfallLevel: 12, attackBonus: 6, hpBonus: 6, specialAbility: 'wraith-death-heal', specialDesc: '怨灵祝福：死亡时同行其他怪物生命值 +4' },
  ],
};

const normalizeTurn = (turn: number): number => {
  if (!Number.isFinite(turn)) {
    return 1;
  }
  return Math.max(1, Math.floor(turn));
};

const calculateFromRule = (rule: MonsterRageRule, turn: number): number => {
  const normalizedTurn = normalizeTurn(turn);
  const rawValue = rule.base + Math.floor(normalizedTurn / rule.interval);
  return Math.min(MAX_RAGE_LAYERS, rawValue);
};

export const getMonsterRageRule = (monsterName: string): MonsterRageRule | null => {
  return MONSTER_RAGE_RULES[monsterName] ?? null;
};

export const getMonsterUpgrades = (monsterType: string): MonsterUpgrade[] => {
  return MONSTER_UPGRADES[monsterType] ?? [];
};

export const getActiveUpgrade = (monsterType: string, waterfall: number): MonsterUpgrade | null => {
  const upgrades = MONSTER_UPGRADES[monsterType];
  if (!upgrades) return null;
  const normalized = normalizeTurn(waterfall);
  let active: MonsterUpgrade | null = null;
  for (const u of upgrades) {
    if (normalized >= u.waterfallLevel) active = u;
  }
  return active;
};

export const calculateMonsterRage = (monsterName: string, turn: number): number | null => {
  const rule = getMonsterRageRule(monsterName);
  if (!rule) {
    return null;
  }
  return calculateFromRule(rule, turn);
};

export const applyMonsterRage = (card: GameCardData, turn: number): GameCardData => {
  if (card.type !== 'monster') {
    return card;
  }
  const monsterType = card.monsterType ?? card.name;
  const rule = getMonsterRageRule(monsterType);
  if (!rule) {
    return card;
  }
  const normalizedTurn = normalizeTurn(turn);
  const rage = calculateFromRule(rule, normalizedTurn);

  const baseAtk = card.baseAttack ?? card.attack ?? card.value ?? 0;
  const baseHp = card.baseHp ?? card.maxHp ?? card.hp ?? card.value ?? 0;
  const upgrade = getActiveUpgrade(monsterType, normalizedTurn);
  const bonusAtk = upgrade?.attackBonus ?? 0;
  const bonusHp = upgrade?.hpBonus ?? 0;

  const result: GameCardData = {
    ...card,
    baseAttack: baseAtk,
    baseHp,
    attack: baseAtk + bonusAtk,
    value: baseAtk + bonusAtk,
    hp: baseHp + bonusHp,
    maxHp: baseHp + bonusHp,
    fury: rage,
    hpLayers: rage,
    currentLayer: rage,
    rageTurn: normalizedTurn,
  };

  if (upgrade?.specialAbility) {
    switch (upgrade.specialAbility) {
      case 'ogre-enter-discard':
        result.ogreEnterDiscard = true;
        break;
      case 'dragon-bleed-destroy':
        result.dragonBleedDestroy = true;
        break;
      case 'skeleton-no-layer-cost':
        result.skeletonNoLayerCost = true;
        break;
      case 'wraith-death-heal':
        result.wraithDeathHeal = 4;
        break;
      case 'goblin-steal-scale':
        result.goblinStealScale = true;
        break;
    }
  }

  return result;
};
