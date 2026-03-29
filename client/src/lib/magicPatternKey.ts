/** Stable visual key for Magic / Hero Magic pattern strip (image memory). */

const STARTER_ID_TO_KEY: Record<string, string> = {
  'starter-perm-weapon-burst': 'battle-rally',
  'starter-perm-repair-one': 'master-repair',
  'starter-perm-discard-draw': 'out-with-old',
  'starter-perm-reshuffle': 'labyrinth-retreat',
  'starter-perm-dungeon-swap': 'world-swap',
  'starter-perm-heal-two': 'blessing-wind',
};

const KNIGHT_EFFECT_TO_KEY: Record<string, string> = {
  'blood-greed': 'knight-blood-greed',
  'armor-strike': 'knight-armor-strike',
  'missing-hp-smite': 'knight-missing-hp-smite',
  'grave-nova': 'knight-grave-nova',
  'berserk-gambit': 'knight-berserk-gambit',
  'recycle-flare': 'knight-recycle-flare',
  'death-ward': 'knight-death-ward',
  'chaos-dice': 'knight-chaos-dice',
  'graveyard-recall': 'knight-graveyard-recall',
  'greed-curse': 'knight-greed-curse',
};

const NAME_TO_KEY: Record<string, string> = {
  瀑流重置: 'waterfall-reset',
  风暴箭雨: 'storm-rain',
  回响行囊: 'echo-bag',
  壁垒猛击: 'bulwark-ram',
  血债清算: 'blood-gold-debt',
  永恒修复: 'eternal-mend',
  治愈余韵: 'heal-echo',
  余烬回响: 'ember-echo',
  暗影之刺: 'shadow-spike',
  箭雨余韵: 'storm-volley',
  混沌冲击: 'chaos-strike',
  战斗鼓舞: 'battle-rally',
  精工修复: 'master-repair',
  汰旧迎新: 'out-with-old',
  祝福之风: 'blessing-wind',
  迷宫回溯: 'labyrinth-retreat',
  乾坤挪移: 'world-swap',
  哥布林的戏法: 'goblin-trick',
  血咒之印: 'curse-seal',
  法术回响: 'spell-echo',
  血金术: 'blood-gold-rite',
  战血之印: 'war-blood-seal',
  秘典检索: 'tome-search',
  圣光秘术: 'hero-holy-light',
  狂战秘典: 'hero-berserker-rage',
  浴血贪念: 'knight-blood-greed',
  铠甲贯刺: 'knight-armor-strike',
  残血终焉: 'knight-missing-hp-smite',
  坟火新星: 'knight-grave-nova',
  孤注一掷: 'knight-berserk-gambit',
  回收灵焰: 'knight-recycle-flare',
  不灭守护: 'knight-death-ward',
  混沌骰运: 'knight-chaos-dice',
  冥途拾遗: 'knight-graveyard-recall',
  贪婪诅咒: 'knight-greed-curse',
};

function hashName(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export type MagicPatternCardRef = {
  type: string;
  name: string;
  id?: string;
  magicEffect?: string;
  heroMagicId?: string;
  knightEffect?: string;
  isCurse?: boolean;
};

export function resolveMagicPatternKey(card: MagicPatternCardRef): string | null {
  if (card.type === 'hero-magic') {
    if (card.heroMagicId === 'holy-light') return 'hero-holy-light';
    if (card.heroMagicId === 'berserker-rage') return 'hero-berserker-rage';
    return NAME_TO_KEY[card.name] ?? `fallback-${hashName(card.name) % 12}`;
  }
  if (card.type !== 'magic') return null;

  if (card.magicEffect === 'curse') return 'curse-seal';
  if (card.magicEffect === 'honor-blood') return 'war-blood-seal';
  if (card.magicEffect === 'double-next-magic') return 'spell-echo';

  const ke = card.knightEffect;
  if (ke && KNIGHT_EFFECT_TO_KEY[ke]) {
    return KNIGHT_EFFECT_TO_KEY[ke];
  }

  if (card.id && STARTER_ID_TO_KEY[card.id]) {
    return STARTER_ID_TO_KEY[card.id];
  }

  const byName = NAME_TO_KEY[card.name];
  if (byName) return byName;

  return `fallback-${hashName(card.name) % 12}`;
}
