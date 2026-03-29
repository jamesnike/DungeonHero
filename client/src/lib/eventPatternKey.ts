/** Stable visual key for Event card glyphs (CuteSticker branch keys). */

function hashName(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export type EventPatternCardRef = {
  type: string;
  name: string;
};

const EVENT_NAME_TO_KEY: Record<string, string> = {
  命运十字路口: 'evt-fate-crossroads',
  秘藏宝库: 'evt-vault',
  '秘藏宝库（已开启）': 'evt-vault',
  暗影契约: 'evt-shadow-pact',
  共鸣熔炉: 'evt-resonance-forge',
  破坏祭坛: 'evt-greed-altar',
  战血荣誉: 'evt-honor-echo',
  血咒仪式: 'evt-blood-curse-rite',
  双重燃烧: 'evt-crimson-pact',
  '双重燃烧（觉醒）': 'evt-crimson-pact',
  墓语密室: 'evt-tomb-chamber',
  奇术商会: 'evt-arcane-guild',
  命运骰盅: 'evt-fate-dice-cup',
  混沌骰局: 'evt-chaos-dice-game',
  '封印卷轴（翻转示例）': 'evt-seal-demo',
  冥途幻变: 'evt-nether-veil',
};

export function resolveEventPatternKey(card: EventPatternCardRef): string | null {
  if (card.type !== 'event') return null;
  return EVENT_NAME_TO_KEY[card.name] ?? `evt-fallback-${hashName(card.name) % 12}`;
}

export function isEventCardType(type: string): boolean {
  return type === 'event';
}
