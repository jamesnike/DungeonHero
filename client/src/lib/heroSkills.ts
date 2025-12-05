export type HeroSkillId =
  | 'armor-pact'
  | 'durability-for-blood'
  | 'blood-strike'
  | 'vitality-well';

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
}

export const heroSkills: HeroSkillDefinition[] = [
  {
    id: 'armor-pact',
    name: '壁垒献祭',
    description: '弃掉当前手牌，强化一个空的装备槽。',
    effect: '须有手牌：弃掉手牌，选空槽 +1 永久护甲。',
    type: 'active',
    requiresTarget: 'slot',
    buttonLabel: '弃牌强化',
    statusHint: '选择空槽以获得 +1 永久护甲。',
  },
  {
    id: 'durability-for-blood',
    name: '血换钢魂',
    description: '献出生命，为装备注入额外耐久。',
    effect: '失去 2 生命，选已装备槽 +1 耐久（不超上限）。',
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
    effect: '被动：开局 +8 最大生命。',
    type: 'passive',
    requiresTarget: null,
    initialMaxHpBonus: 8,
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

