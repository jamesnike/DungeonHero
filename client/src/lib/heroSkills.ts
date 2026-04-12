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
  | 'blood-draw'
  | 'summon-minion'
  | 'vanguard-swap';

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
  /** Starting shop level (0 = default). Applied when the skill is chosen at run start. */
  initialShopLevel?: number;
  /** Added to backpack capacity modifier at run start when this skill is chosen first. */
  initialBackpackCapacityBonus?: number;
  /** Added to hand limit (with HAND_LIMIT) when this skill is chosen at run start. */
  initialHandLimitBonus?: number;
  /** Added to permanent spell damage bonus at run start when this skill is chosen. */
  initialSpellDamageBonus?: number;
  /** Number of cards drawn from backpack to hand at run start. */
  initialHandDraw?: number;
}

export const heroSkills: HeroSkillDefinition[] = [
  {
    id: 'armor-pact',
    name: '虚位铸甲',
    description: '强化空装备槽，并可将装备转移过来。',
    effect: '选空槽 +1 永久护甲；若另一槽有装备，则移至该空槽。',
    type: 'active',
    requiresTarget: 'slot',
    buttonLabel: '虚位铸甲',
    statusHint: '选择空槽以获得 +1 永久护甲。',
  },
  {
    id: 'durability-for-blood',
    name: '血换钢魂',
    description: '失去 1 生命，恢复1点装备耐久。',
    effect: '失去 1 生命，恢复1点装备耐久。',
    type: 'active',
    requiresTarget: 'slot',
    buttonLabel: '献血修复',
    statusHint: '选择一个已装备槽位，为其 +1 耐久。',
  },
  {
    id: 'blood-strike',
    name: '血痕一击',
    description: '以自损换取必中重击。',
    effect: '失去 2 生命，对目标造成 3 伤害。',
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
    description: '花费金币换取一张专属牌；开局背包上限 +2。',
    effect: '花费 6 金币，随机获得一张专属牌放入背包；开局背包上限 +2。',
    type: 'active',
    requiresTarget: null,
    buttonLabel: '黄金探秘',
    initialBackpackCapacityBonus: 2,
  },
  {
    id: 'graveyard-recall',
    name: '亡灵拾遗',
    description: '弃回两张手牌，从坟场发现一张卡牌，加入手牌。',
    effect: '弃回两张手牌，从坟场发现一张卡牌，加入手牌。',
    type: 'active',
    requiresTarget: null,
    buttonLabel: '亡灵拾遗',
  },
  {
    id: 'discard-profit',
    name: '弃牌生金',
    description: '每一张弃牌都化为闪闪金币；开局商店等级为 1。',
    effect: '被动：每弃回一张牌，获得 2 金币；开局商店等级为 1。',
    type: 'passive',
    requiresTarget: null,
    initialShopLevel: 1,
  },
  {
    id: 'waterfall-heal',
    name: '潮涌回春',
    description: '每一波瀑布涌来时恢复生机。',
    effect: '被动：每次瀑布推进时，恢复 4 点生命。',
    type: 'passive',
    requiresTarget: null,
  },
  {
    id: 'discard-empower',
    name: '噬血砺锋',
    description: '随机弃回一张手牌，选一个装备，下次攻击 +2 伤害 且 吸血。',
    effect: '随机弃回一张手牌，选一个装备，下次攻击 +2 伤害 且 吸血。',
    type: 'active',
    requiresTarget: 'slot',
    buttonLabel: '噬血砺锋',
    statusHint: '选择一个装备：下次攻击 +2 伤害 且 吸血。',
  },
  {
    id: 'heal-to-damage',
    name: '愈战愈勇',
    description: '治愈之力转化为杀伐之气。',
    effect: '被动：每累计恢复 5 点生命，左右装备栏各 +1 永久伤害；开局背包内有「治愈余韵」。',
    type: 'passive',
    requiresTarget: null,
  },
  {
    id: 'early-surge',
    name: '先发制人',
    description: '开局多两波瀑布，并获得额外专属牌。',
    effect: '被动：开局瀑布 +2，抽 3 张专属牌。',
    type: 'passive',
    requiresTarget: null,
    initialWaterfallBonus: 2,
    initialClassCardDraw: 3,
  },
  {
    id: 'shield-wall',
    name: '雷盾心法',
    description: "被动：开局拥有'雷霆符印'，不能装备武器，+1 永久法术伤害",
    effect: "被动：开局拥有'雷霆符印'，不能装备武器，+1 永久法术伤害",
    type: 'passive',
    requiresTarget: null,
    initialSpellDamageBonus: 1,
  },
  {
    id: 'blood-draw',
    name: '血契抽牌',
    description: '以血为代价，从背包中汲取力量；开局手牌上限 +1。',
    effect: '被动：开局手牌上限 +1。主动：失去 3 生命，从背包抽 2 张牌。',
    type: 'active',
    requiresTarget: null,
    buttonLabel: '血契抽牌',
    initialHandLimitBonus: 1,
  },
  {
    id: 'summon-minion',
    name: '随从召唤',
    description: '被动：开局获得小随从 (每次用小随从击杀怪物，小随从攻击 +1、防御 +1)',
    effect: '被动：开局获得小随从 (每次用小随从击杀怪物，小随从攻击 +1、防御 +1)',
    type: 'passive',
    requiresTarget: null,
  },
  {
    id: 'vanguard-swap',
    name: '先锋换阵',
    description: '调换地城行最左两张卡牌的位置；开局从背包抽 2 张手牌。',
    effect: '主动：将地城行最左两张卡牌交换位置（需至少 2 张）。被动：开局抽 2 张手牌。',
    type: 'active',
    requiresTarget: null,
    buttonLabel: '先锋换阵',
    initialHandDraw: 2,
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

