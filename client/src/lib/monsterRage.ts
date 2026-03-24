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
};

const MONSTER_RAGE_RULES: Record<string, MonsterRageRule> = {
  Dragon: { base: 2, interval: 3 },
  Skeleton: { base: 1, interval: 4 },
  Goblin: { base: 1, interval: 4 },
  Ogre: { base: 1, interval: 2 },
  Wraith: { base: 1, interval: 3 },
};

const MONSTER_UPGRADES: Record<string, MonsterUpgrade[]> = {
  Dragon:   [{ waterfallLevel: 4, attackBonus: 2, hpBonus: 3 }, { waterfallLevel: 8, attackBonus: 4, hpBonus: 6 }],
  Skeleton: [{ waterfallLevel: 3, attackBonus: 2, hpBonus: 1 }, { waterfallLevel: 7, attackBonus: 4, hpBonus: 2 }],
  Goblin:   [{ waterfallLevel: 3, attackBonus: 1, hpBonus: 2 }, { waterfallLevel: 7, attackBonus: 2, hpBonus: 4 }],
  Ogre:     [{ waterfallLevel: 5, attackBonus: 1, hpBonus: 3 }, { waterfallLevel: 9, attackBonus: 2, hpBonus: 6 }],
  Wraith:   [{ waterfallLevel: 4, attackBonus: 2, hpBonus: 2 }, { waterfallLevel: 8, attackBonus: 4, hpBonus: 4 }],
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

  return {
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
};
