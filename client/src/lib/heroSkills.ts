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
    name: 'Bulwark Offering',
    description: 'Abandon your current hand to empower a shield slot.',
    effect: 'Discard all hand cards, then choose an equipment slot to gain +1 permanent armor.',
    type: 'active',
    requiresTarget: 'slot',
    buttonLabel: 'Discard & Fortify',
    statusHint: 'Select a slot to gain +1 permanent armor.',
  },
  {
    id: 'durability-for-blood',
    name: 'Blood-for-Steel',
    description: 'Offer your vitality to reinforce equipment.',
    effect: 'Lose 2 HP, then pick an occupied slot to grant its equipment +1 durability (up to its max).',
    type: 'active',
    requiresTarget: 'slot',
    buttonLabel: 'Reinforce Gear',
    statusHint: 'Choose an equipped slot to repair it (+1 durability).',
  },
  {
    id: 'blood-strike',
    name: 'Crimson Strike',
    description: 'Wound yourself to unleash a guaranteed strike.',
    effect: 'Lose 3 HP to deal 3 damage to a chosen monster.',
    type: 'active',
    requiresTarget: 'monster',
    buttonLabel: 'Crimson Strike',
    statusHint: 'Select a monster to deal 3 damage.',
  },
  {
    id: 'vitality-well',
    name: 'Titan Vitality',
    description: 'Innate endurance bolsters your journey.',
    effect: 'Start the adventure with +8 maximum HP (passive).',
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

