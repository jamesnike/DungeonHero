export type HeroSkillId =
  | 'armor-pact'
  | 'durability-for-blood'
  | 'blood-strike'
  | 'vitality-well'
  | 'gold-discovery'
  | 'graveyard-recall'
  | 'discard-profit'
  | 'waterfall-heal'
  | 'discard-empower'
  | 'heal-to-damage'
  | 'early-surge'
  | 'shield-wall'
  | 'blood-draw';

export type HeroSkillTarget = 'slot' | 'monster' | null;

export interface HeroSkillDefinition {
  id: HeroSkillId;
  name: string;
  description: string;
  effect: string;
  type: 'active' | 'passive';
  requiresTarget: HeroSkillTarget;
  buttonLabel?: string;
  statusHint?: string;
  initialMaxHpBonus?: number;
  initialGoldBonus?: number;
  initialClassCardDraw?: number;
  initialWaterfallBonus?: number;
}

export const heroSkills: HeroSkillDefinition[] = [
  {
    id: 'armor-pact',
    name: '壁垒献祭',
    description: '强化空装备槽，并可将装备转移过来。',
    effect: '选空槽 +1 永久护甲；若另一槽有装备，则移至该空槽。',
    type: 'active',
    requiresTarget: 'slot',
    buttonLabel: '壁垒献祭',
    statusHint: '选择空槽以获得 +1 永久护甲。',
  },
  {
    id: 'durability-for-blood',
    name: '血换钢魂',
    description: '献出生命，为装备注入额外耐久。',
    effect: '失去 1 生命，选已装备槽 +1 耐久（不超上限）。',
    type: 'active',
    requiresTarget: 'slot',
    buttonLabel: '献血修复',
    statusHint: '选择一个已装备槽位，为其 +1 耐久。',
  },
  {
    id: 'blood-strike',
    name: '血痕一击',
    description: '以自损换取必中重击。',
    effect: '失去 3 生命，对目标造成 3 伤害。',
    type: 'active',
    requiresTarget: 'monster',
    buttonLabel: '血痕一击',
    statusHint: '选择一只怪物，造成 3 点伤害。',
  },
  {
    id: 'vitality-well',
    name: '巨人心力',
    description: '天赋的耐力让旅程更从容。',
    effect: '被动：开局 +8 最大生命，+8 金币。',
    type: 'passive',
    requiresTarget: null,
    initialMaxHpBonus: 8,
    initialGoldBonus: 8,
  },
  {
    id: 'gold-discovery',
    name: '黄金探秘',
    description: '花费金币换取一张专属牌。',
    effect: '花费 6 金币，随机获得一张专属牌放入背包。',
    type: 'active',
    requiresTarget: null,
    buttonLabel: '黄金探秘',
  },
  {
    id: 'graveyard-recall',
    name: '亡灵拾遗',
    description: '牺牲手牌，从坟场召回一张卡牌。',
    effect: '弃两张手牌，从坟场随机 3 选 1 取回一张卡牌。',
    type: 'active',
    requiresTarget: null,
    buttonLabel: '亡灵拾遗',
  },
  {
    id: 'discard-profit',
    name: '弃牌生金',
    description: '每一张弃牌都化为闪闪金币。',
    effect: '被动：每弃掉一张牌，获得 2 金币。',
    type: 'passive',
    requiresTarget: null,
  },
  {
    id: 'waterfall-heal',
    name: '潮涌回春',
    description: '每一波瀑布涌来时恢复生机。',
    effect: '被动：每次瀑布推进时，恢复 5 点生命。',
    type: 'passive',
    requiresTarget: null,
  },
  {
    id: 'discard-empower',
    name: '弃牌赋刃',
    description: '牺牲一张手牌，为武器注入强大力量。',
    effect: '弃一张手牌，选一个装备，下次攻击 +6 伤害。',
    type: 'active',
    requiresTarget: 'slot',
    buttonLabel: '弃牌赋刃',
    statusHint: '选择一个装备，为其下次攻击 +6 伤害。',
  },
  {
    id: 'heal-to-damage',
    name: '愈战愈勇',
    description: '治愈之力转化为杀伐之气。',
    effect: '被动：每累计恢复 5 点生命，右装备栏 +1 永久伤害。',
    type: 'passive',
    requiresTarget: null,
  },
  {
    id: 'early-surge',
    name: '先发制人',
    description: '开局多一波瀑布，并获得额外专属牌。',
    effect: '被动：开局瀑布 +1，抽 3 张专属牌。',
    type: 'passive',
    requiresTarget: null,
    initialWaterfallBonus: 1,
    initialClassCardDraw: 3,
  },
  {
    id: 'shield-wall',
    name: '铁壁之心',
    description: '以盾为剑，化防御为攻势。',
    effect: '对场上所有怪物造成 1 点伤害。被动：只能装备护盾。',
    type: 'active',
    requiresTarget: null,
    buttonLabel: '铁壁之心',
  },
  {
    id: 'blood-draw',
    name: '血契抽牌',
    description: '以血为代价，从背包中汲取力量。',
    effect: '失去 4 生命，从背包抽 2 张牌。',
    type: 'active',
    requiresTarget: null,
    buttonLabel: '血契抽牌',
  },
];

const heroSkillMap: Record<HeroSkillId, HeroSkillDefinition> = heroSkills.reduce(
  (acc, skill) => {
    acc[skill.id] = skill;
    return acc;
  },
  {} as Record<HeroSkillId, HeroSkillDefinition>,
);

export const getHeroSkillById = (id: HeroSkillId | null | undefined): HeroSkillDefinition | null =>
  id ? heroSkillMap[id] ?? null : null;

