import type { GameCardData } from '@/components/GameCard';

const MAX_RAGE_LAYERS = 4;

export type MonsterRageRule = {
  base: number;
  interval: number;
  minInterval?: number;
};

export type MonsterUpgrade = {
  waterfallLevel: number;
  attackBonus: number;
  hpBonus: number;
  specialAbility?: string;
  specialDesc?: string;
};

const MONSTER_RAGE_RULES: Record<string, MonsterRageRule> = {
  Dragon: { base: 2, interval: 5 },
  Skeleton: { base: 1, interval: 4 },
  Goblin: { base: 1, interval: 4 },
  Ogre: { base: 1, interval: 3, minInterval: 3 },
  Wraith: { base: 1, interval: 4 },
  Swarm: { base: 2, interval: 5 },
  Buglet: { base: 1, interval: 6 },
  Golem: { base: 1, interval: 4 },
};

const MONSTER_UPGRADES: Record<string, MonsterUpgrade[]> = {
  Dragon:   [
    { waterfallLevel: 4, attackBonus: 4, hpBonus: 5, specialAbility: 'dragon-attack-no-layer-cost', specialDesc: '龙鳞：上回合掉过血层时，本次攻击不消耗血层' },
    { waterfallLevel: 8, attackBonus: 8, hpBonus: 12, specialAbility: 'dragon-damage-retaliation', specialDesc: '龙鳞 + 龙息：每受到一次伤害，对玩家造成 3 点法术伤害' },
    { waterfallLevel: 12, attackBonus: 12, hpBonus: 20, specialAbility: 'dragon-all', specialDesc: '龙鳞 + 龙息 + 破甲：每失去一个血层，破坏耐久度 > 剩余血层数的装备' },
  ],
  Skeleton: [
    { waterfallLevel: 3, attackBonus: 5, hpBonus: 3, specialAbility: 'skeleton-no-layer-cost', specialDesc: '无尽：复生后攻击不消耗血层' },
    { waterfallLevel: 7, attackBonus: 9, hpBonus: 6, specialAbility: 'skeleton-last-words-discard', specialDesc: '无尽 + 撕牌：随机弃回玩家 1 张手牌' },
    { waterfallLevel: 11, attackBonus: 15, hpBonus: 12, specialAbility: 'skeleton-re-revive', specialDesc: '无尽 + 撕牌 + 轮回：同行其他怪物被击败时，若本骷髅已复生过，再次获得复生' },
  ],
  Goblin:   [
    { waterfallLevel: 3, attackBonus: 3, hpBonus: 5, specialAbility: 'goblin-steal-card', specialDesc: '窃牌：攻击时随机偷走一张手牌，堆叠在自身下方' },
    { waterfallLevel: 7, attackBonus: 5, hpBonus: 10, specialAbility: 'goblin-steal-heal', specialDesc: '窃牌 + 疗养：回合结束时，自身下方每有1张牌，15%概率恢复1血层' },
    { waterfallLevel: 11, attackBonus: 7, hpBonus: 17, specialAbility: 'goblin-steal-scale', specialDesc: '窃牌 + 疗养 + 贪敛：每偷到X金币，攻击力和生命值 +X' },
  ],
  Ogre:     [
    { waterfallLevel: 5, attackBonus: 3, hpBonus: 5, specialAbility: 'ogre-stun', specialDesc: '震晕：攻击时30%概率击晕玩家（装备栏和护符栏冻结一回合）' },
    { waterfallLevel: 9, attackBonus: 6, hpBonus: 9, specialAbility: 'ogre-stun-double', specialDesc: '震晕 + 连击：攻击时70%概率再攻击一次' },
    { waterfallLevel: 13, attackBonus: 9, hpBonus: 15, specialAbility: 'ogre-all', specialDesc: '震慑 + 震晕 + 连击' },
  ],
  Wraith:   [
    { waterfallLevel: 4, attackBonus: 3, hpBonus: 4, specialAbility: 'wraith-aura-attack', specialDesc: '光环：每个怪物回合结束时，激活行所有怪物攻击力 +2' },
    { waterfallLevel: 8, attackBonus: 6, hpBonus: 9, specialAbility: 'wraith-death-spread', specialDesc: '光环 + 传魂：死亡时同行其他怪物生命值 +4，并让随机一个激活行怪物获得此遗言' },
    { waterfallLevel: 12, attackBonus: 9, hpBonus: 16, specialAbility: 'wraith-curse', specialDesc: '光环 + 传魂 + 诅咒：每个怪物回合结束时，使激活行所有怪物激怒，并随机摧毁一个护符' },
  ],
  Swarm:    [
    { waterfallLevel: 4, attackBonus: 2, hpBonus: 5, specialAbility: 'swarm-horde-rage', specialDesc: '虫群集结：当激活行怪物≥3时，所有怪物被激怒，并+3攻击+3血量' },
    { waterfallLevel: 8, attackBonus: 4, hpBonus: 10, specialAbility: 'swarm-corrode', specialDesc: '虫群集结 + 腐蚀甲壳：攻击时，格挡护盾立刻-1耐久度（不计入格挡耐久次数）' },
    { waterfallLevel: 12, attackBonus: 6, hpBonus: 17, specialAbility: 'swarm-buglet-shield', specialDesc: '虫群集结 + 腐蚀甲壳 + 虫盾：激活行有小虫子时，受到的伤害为0' },
  ],
  Buglet:   [
    { waterfallLevel: 4, attackBonus: 2, hpBonus: 1, specialAbility: 'buglet-last-words-heal', specialDesc: '遗念：死亡时，激活行其他所有小虫子恢复1血层' },
    { waterfallLevel: 8, attackBonus: 3, hpBonus: 2, specialAbility: 'buglet-last-words-heal', specialDesc: '遗念：死亡时，激活行其他所有小虫子恢复1血层' },
    { waterfallLevel: 12, attackBonus: 4, hpBonus: 3, specialAbility: 'buglet-last-words-heal', specialDesc: '遗念：死亡时，激活行其他所有小虫子恢复1血层' },
  ],
  Golem:    [
    { waterfallLevel: 4, attackBonus: 3, hpBonus: 5, specialAbility: 'golem-spell-resist', specialDesc: '抗性：受到的法术伤害减少50%' },
    { waterfallLevel: 8, attackBonus: 5, hpBonus: 9, specialAbility: 'golem-layer-loss-reflect', specialDesc: '抗性 + 反震：每次掉1血层，对玩家造成 3×已损失血层 点伤害' },
    { waterfallLevel: 12, attackBonus: 8, hpBonus: 16, specialAbility: 'golem-spell-growth', specialDesc: '抗性 + 反震 + 吞噬：每个怪物回合结束时，反魔伤害+1，反震系数+1' },
  ],
};

const normalizeTurn = (turn: number): number => {
  if (!Number.isFinite(turn)) {
    return 1;
  }
  return Math.max(1, Math.floor(turn));
};

const calculateFromRule = (rule: MonsterRageRule, turn: number, isQuickMode = false): number => {
  const normalizedTurn = normalizeTurn(turn);
  const effectiveInterval = isQuickMode ? Math.max(rule.minInterval ?? 1, rule.interval - 1) : rule.interval;
  const rawValue = rule.base + Math.floor(normalizedTurn / effectiveInterval);
  return Math.min(MAX_RAGE_LAYERS, rawValue);
};

export const getMonsterRageRule = (monsterName: string): MonsterRageRule | null => {
  return MONSTER_RAGE_RULES[monsterName] ?? null;
};

export const getMonsterUpgrades = (monsterType: string): MonsterUpgrade[] => {
  return MONSTER_UPGRADES[monsterType] ?? [];
};

export const getUpgradeTierCount = (monsterType: string): number => {
  return (MONSTER_UPGRADES[monsterType] ?? []).length;
};

export const getUpgradeTierByLevel = (monsterType: string, level: number): MonsterUpgrade | null => {
  const upgrades = MONSTER_UPGRADES[monsterType];
  if (!upgrades || level < 1 || level > upgrades.length) return null;
  return upgrades[level - 1];
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

export const getWaterfallUpgradeLevel = (monsterType: string, waterfall: number): number => {
  const upgrades = MONSTER_UPGRADES[monsterType];
  if (!upgrades) return 0;
  const normalized = normalizeTurn(waterfall);
  let level = 0;
  for (const u of upgrades) {
    if (normalized >= u.waterfallLevel) level++;
  }
  return level;
};

export const calculateMonsterRage = (monsterName: string, turn: number, isQuickMode = false): number | null => {
  const rule = getMonsterRageRule(monsterName);
  if (!rule) {
    return null;
  }
  return calculateFromRule(rule, turn, isQuickMode);
};

const applySpecialAbility = (result: GameCardData, ability: string): void => {
  switch (ability) {
    case 'ogre-stun':
      result.ogreStun = true;
      break;
    case 'ogre-stun-double':
      result.ogreStun = true;
      result.eliteDoubleAttack = true;
      break;
    case 'ogre-all':
      result.ogreEnterDiscard = true;
      result.ogreStun = true;
      result.eliteDoubleAttack = true;
      break;
    case 'ogre-enter-discard':
      result.ogreEnterDiscard = true;
      break;
    case 'dragon-attack-no-layer-cost':
      result.dragonAttackNoLayerCost = true;
      break;
    case 'dragon-damage-retaliation':
      result.dragonAttackNoLayerCost = true;
      result.dragonDamageRetaliation = 3;
      break;
    case 'dragon-all':
      result.dragonAttackNoLayerCost = true;
      result.dragonDamageRetaliation = 3;
      result.dragonBleedDestroy = true;
      break;
    case 'skeleton-no-layer-cost':
      result.skeletonNoLayerCost = true;
      break;
    case 'skeleton-last-words-discard':
      result.skeletonNoLayerCost = true;
      result.skeletonLastWordsDiscard = true;
      break;
    case 'skeleton-re-revive':
      result.skeletonNoLayerCost = true;
      result.skeletonLastWordsDiscard = true;
      result.skeletonReRevive = true;
      break;
    case 'wraith-aura-attack':
      result.wraithAuraAttack = 2;
      break;
    case 'wraith-death-spread':
      result.wraithAuraAttack = 2;
      result.wraithDeathHealSpread = 4;
      break;
    case 'wraith-curse':
      result.wraithAuraAttack = 2;
      result.wraithDeathHealSpread = 4;
      result.wraithTurnEnrage = true;
      result.wraithDestroyAmulet = true;
      break;
    case 'goblin-steal-card':
      result.goblinStealCard = true;
      break;
    case 'goblin-steal-heal':
      result.goblinStealCard = true;
      result.goblinStackHeal = true;
      break;
    case 'goblin-steal-scale':
      result.goblinStealCard = true;
      result.goblinStackHeal = true;
      result.goblinStealScale = true;
      break;
    case 'swarm-horde-rage':
      result.swarmHordeRage = true;
      break;
    case 'swarm-corrode':
      result.swarmHordeRage = true;
      result.swarmCorrode = true;
      break;
    case 'swarm-buglet-shield':
      result.swarmHordeRage = true;
      result.swarmCorrode = true;
      result.swarmBugletShield = true;
      break;
    case 'buglet-last-words-heal':
      result.bugletLastWordsHeal = true;
      break;
    case 'golem-spell-resist':
      result.spellDamageReduction = 0.5;
      break;
    case 'golem-layer-loss-reflect':
      result.spellDamageReduction = 0.5;
      result.golemLayerLossReflect = 3;
      break;
    case 'golem-spell-growth':
      result.spellDamageReduction = 0.5;
      result.golemLayerLossReflect = 3;
      result.golemSpellGrowth = 1;
      break;
  }
};

export const applyMonsterRage = (card: GameCardData, turn: number, isQuickMode = false): GameCardData => {
  if (card.type !== 'monster') {
    return card;
  }
  const monsterType = card.monsterType ?? card.name;
  const rule = getMonsterRageRule(monsterType);
  if (!rule) {
    return card;
  }
  const normalizedTurn = normalizeTurn(turn);
  const rage = calculateFromRule(rule, normalizedTurn, isQuickMode);

  const baseAtk = card.baseAttack ?? card.attack ?? card.value ?? 0;
  const baseHp = card.baseHp ?? card.maxHp ?? card.hp ?? card.value ?? 0;

  const waterfallLevel = getWaterfallUpgradeLevel(monsterType, normalizedTurn);
  const manualLevel = card.upgradeLevel ?? 0;
  const effectiveLevel = Math.max(waterfallLevel, manualLevel);
  const upgrade = getUpgradeTierByLevel(monsterType, effectiveLevel);

  const bonusAtk = upgrade?.attackBonus ?? 0;
  const bonusHp = upgrade?.hpBonus ?? 0;
  const bleedBoost = card.specialAttackBoost ?? 0;

  const result: GameCardData = {
    ...card,
    baseAttack: baseAtk,
    baseHp,
    attack: baseAtk + bonusAtk + bleedBoost,
    value: baseAtk + bonusAtk + bleedBoost,
    hp: baseHp + bonusHp,
    maxHp: baseHp + bonusHp,
    fury: rage,
    hpLayers: rage,
    currentLayer: rage,
    rageTurn: normalizedTurn,
    upgradeLevel: effectiveLevel,
    maxUpgradeLevel: getUpgradeTierCount(monsterType),
  };

  if (upgrade?.specialAbility) {
    applySpecialAbility(result, upgrade.specialAbility);
  }

  return result;
};

export const applyMonsterUpgradeLevel = (card: GameCardData, newLevel: number): GameCardData => {
  if (card.type !== 'monster') return card;
  const monsterType = card.monsterType ?? card.name;
  const tier = getUpgradeTierByLevel(monsterType, newLevel);

  const baseAtk = card.baseAttack ?? card.attack ?? card.value ?? 0;
  const baseHp = card.baseHp ?? card.maxHp ?? card.hp ?? card.value ?? 0;
  const bleedBoost = card.specialAttackBoost ?? 0;
  const bonusAtk = tier?.attackBonus ?? 0;
  const bonusHp = tier?.hpBonus ?? 0;

  const result: GameCardData = {
    ...card,
    attack: baseAtk + bonusAtk + bleedBoost,
    value: baseAtk + bonusAtk + bleedBoost,
    hp: baseHp + bonusHp,
    maxHp: baseHp + bonusHp,
    upgradeLevel: newLevel,
  };

  if (tier?.specialAbility) {
    applySpecialAbility(result, tier.specialAbility);
  }
  if (tier?.specialDesc) {
    result.monsterSpecialDesc = tier.specialDesc;
  }

  return result;
};
