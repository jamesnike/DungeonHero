import type { HeroMagicId } from '@/components/GameCard';

const clampNumber = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
};

export type HeroMagicChargeSource = 'damage-taken' | 'weapon-attack';

export interface HeroMagicDefinition {
  id: HeroMagicId;
  name: string;
  description: string;
  cardEffect: string;
  gaugeMax: number;
  chargeHint: string;
  chargeSource: HeroMagicChargeSource;
}

export interface HeroMagicRuntimeState {
  id: HeroMagicId;
  unlocked: boolean;
  gauge: number;
  usedThisWave: boolean;
}

export type HeroMagicState = Record<HeroMagicId, HeroMagicRuntimeState>;

export const heroMagicDefinitions: HeroMagicDefinition[] = [
  {
    id: 'holy-light',
    name: '圣光',
    description: '第一次使用学习圣光技能，之后可立即发动：回满生命，或净化一个怪物的怒气层数。',
    cardEffect: '回满生命 或 消除一个怪物的所有怒气层。',
    gaugeMax: 10,
    chargeHint: '每受到 1 点伤害 +1 圣光值（上限 10）。',
    chargeSource: 'damage-taken',
  },
  {
    id: 'berserker-rage',
    name: '狂战',
    description: '第一次使用学习狂战技能，之后可立即发动：本回合武器多攻击一次，且不消耗耐久。',
    cardEffect: '本回合获得一次额外武器攻击，且不消耗耐久。',
    gaugeMax: 10,
    chargeHint: '每次武器攻击 +1 狂战值（上限 10）。',
    chargeSource: 'weapon-attack',
  },
];

const heroMagicDefinitionMap: Record<HeroMagicId, HeroMagicDefinition> = heroMagicDefinitions.reduce(
  (acc, definition) => {
    acc[definition.id] = definition;
    return acc;
  },
  {} as Record<HeroMagicId, HeroMagicDefinition>,
);

export const HERO_MAGIC_IDS = heroMagicDefinitions.map(definition => definition.id);

export const getHeroMagicDefinition = (id: HeroMagicId): HeroMagicDefinition => heroMagicDefinitionMap[id];

export const createInitialHeroMagicState = (): HeroMagicState => {
  return HERO_MAGIC_IDS.reduce<HeroMagicState>((state, id) => {
    state[id] = {
      id,
      unlocked: false,
      gauge: 0,
      usedThisWave: false,
    };
    return state;
  }, {} as HeroMagicState);
};

export const sanitizeHeroMagicState = (rawState?: Partial<HeroMagicState>): HeroMagicState => {
  const fallback = createInitialHeroMagicState();
  if (!rawState) {
    return fallback;
  }

  const sanitized = { ...fallback };
  HERO_MAGIC_IDS.forEach(id => {
    const definition = heroMagicDefinitionMap[id];
    const source = rawState[id];
    sanitized[id] = {
      id,
      unlocked: Boolean(source?.unlocked),
      gauge: clampNumber(source?.gauge ?? 0, 0, definition.gaugeMax),
      usedThisWave: Boolean(source?.usedThisWave),
    };
  });

  return sanitized;
};

