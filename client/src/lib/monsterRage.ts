import type { GameCardData } from '@/components/GameCard';

const MAX_RAGE_LAYERS = 4;

export type MonsterRageRule = {
  base: number;
  interval: number;
};

const MONSTER_RAGE_RULES: Record<string, MonsterRageRule> = {
  Dragon: { base: 2, interval: 3 },
  Skeleton: { base: 1, interval: 4 },
  Goblin: { base: 1, interval: 4 },
  Ogre: { base: 1, interval: 2 },
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
  const rule = getMonsterRageRule(card.name);
  if (!rule) {
    return card;
  }
  const normalizedTurn = normalizeTurn(turn);
  const rage = calculateFromRule(rule, normalizedTurn);
  return {
    ...card,
    fury: rage,
    hpLayers: rage,
    currentLayer: rage,
    rageTurn: normalizedTurn,
  };
};
