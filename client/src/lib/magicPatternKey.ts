/** Stable visual key for Magic / Hero Magic pattern strip (image memory). */

const STARTER_ID_TO_KEY: Record<string, string> = {
  'starter-perm-weapon-burst': 'battle-rally',
  'starter-perm-repair-one': 'master-repair',
  'starter-perm-discard-draw': 'out-with-old',
  'starter-perm-reshuffle': 'labyrinth-retreat',
  'starter-perm-dungeon-swap': 'world-swap',
  'starter-perm-active-row-flip': 'active-row-flip',
  'starter-perm-heal-two': 'blessing-wind',
  'starter-perm-survey-action': 'survey-action',
};

const KNIGHT_EFFECT_TO_KEY: Record<string, string> = {
  'blood-greed': 'knight-blood-greed',
  'armor-strike': 'knight-armor-strike',
  'missing-hp-smite': 'knight-missing-hp-smite',
  'grave-nova': 'knight-grave-nova',
  'berserk-gambit': 'knight-berserk-gambit',
  'battle-spirit': 'knight-battle-spirit',
  'recycle-flare': 'knight-recycle-flare',
  'death-ward': 'knight-death-ward',
  'chaos-dice': 'knight-chaos-dice',
  'graveyard-recall': 'knight-graveyard-recall',
  'greed-curse': 'knight-greed-curse',
  'honor-sweep': 'knight-honor-sweep',
  'armor-stun-convert': 'knight-armor-stun-convert',
  'overkill-upgrade': 'knight-overkill-upgrade',
  'transform-repair': 'knight-transform-repair',
  'transform-grant': 'knight-transform-grant',
  'weapon-sweep': 'knight-weapon-sweep',
  'persuade-discount': 'mercy-decree',
  'stun-wave': 'stun-domain',
  'stat-swap': 'knight-stat-swap',
  'missile-bolt': 'magic-bolt',
  'missile-storm': 'missile-storm',
  'graveyard-discover-equip-amulet': 'graveyard-discover-relic',
  'flip-back-active': 'knight-blood-oath-scroll',
  'temp-attack-double': 'knight-temp-attack-double',
};

const NAME_TO_KEY: Record<string, string> = {
  瀑流重置: 'waterfall-reset',
  风暴箭雨: 'storm-rain',
  回响行囊: 'echo-bag',
  潮涌铸甲: 'bulwark-ram',
  点金裁决: 'blood-gold-debt',
  涌泉满手: 'eternal-mend',
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
  乾坤一翻: 'active-row-flip',
  哥布林的戏法: 'goblin-trick',
  血咒之印: 'curse-seal',
  战血横扫: 'knight-honor-sweep',
  法术回响: 'spell-echo',
  血金术: 'blood-gold-rite',
  奇术轮转: 'guild-hand-recycle',
  战血之印: 'war-blood-seal',
  秘典检索: 'tome-search',
  圣光秘术: 'hero-holy-light',
  狂战秘典: 'hero-berserker-rage',
  复生秘典: 'hero-revive-blessing',
  浴血贪念: 'knight-blood-greed',
  铠甲贯刺: 'knight-armor-strike',
  残血终焉: 'knight-missing-hp-smite',
  坟火新星: 'knight-grave-nova',
  孤注一掷: 'knight-berserk-gambit',
  战意激发: 'knight-battle-spirit',
  回收灵焰: 'knight-recycle-flare',
  不灭守护: 'knight-death-ward',
  混沌骰运: 'knight-chaos-dice',
  冥途拾遗: 'knight-graveyard-recall',
  贪婪诅咒: 'knight-greed-curse',
  护甲凝雷: 'knight-armor-stun-convert',
  万象探知: 'dungeon-insight',
  蜕变修复: 'knight-transform-repair',
  蜕变赋灵: 'knight-transform-grant',
  利刃风暴: 'knight-weapon-sweep',
  奥术风暴: 'arcane-storm',
  装备附魔: 'equipment-enchant',
  祭坛秘术: 'altar-ritual',
  劝降祝福: 'persuade-boost',
  赏金裁决: 'bounty-spell',
  命运挪移: 'crossroads-left-swap',
  墓语遗愿: 'crypt-deathwish',
  回收轮转: 'guild-recycle-reshuffle',
  等价交换: 'equivalent-exchange',
  怀柔令: 'mercy-decree',
  秘法精炼: 'arcane-refine',
  天机铸炼: 'celestial-forge',
  震慑领域: 'stun-domain',
  增幅: 'amplify-magic',
  铸甲术: 'armor-craft',
  维度扭曲: 'dimension-warp',
  不灭赐福: 'undying-blessing',
  回收术: 'recall-equip',
  魔法飞弹: 'magic-missile',
  赌徒之计: 'gambler-ploy',
  回收余韵: 'recycle-echo',
  深层交织: 'deep-weave',
  雷震击: 'thunder-strike',
  精华萃取: 'essence-extract',
  治愈术: 'healing-art',
  专属召唤: 'class-summon',
  升级卷轴: 'upgrade-scroll',
  天眼审判: 'divine-eye',
  紧急回收: 'emergency-recall',
  锋刃侧击: 'blade-flank',
  锋芒倍增: 'knight-temp-attack-double',
  固壁侧守: 'wall-flank-guard',
  际遇轮盘: 'fortune-wheel',
  血契抽引: 'blood-pact-draw',
  锻造赌运: 'forge-gamble',
  血祭裁决: 'blood-sacrifice',
  亡者之契: 'undead-pact',
  命数裁断: 'fate-decree',
  魔物融合: 'monster-fusion',
  镜影摹形: 'mirror-copy',
  符位开辟: 'amulet-expand',
  永恒铭刻: 'eternal-inscription',
  灭世裁决: 'hero-monster-doom',
  时空镜像: 'spacetime-mirror',
  奥术护盾: 'arcane-shield',
  回响残页: 'echo-remnant',
  墓语回响: 'crypt-echo',
  虚空置换: 'void-swap',
  威压之令: 'monster-attack-debuff',
  颠倒乾坤: 'knight-stat-swap',
  归袋抽引: 'recycle-fetch',
  魔弹: 'magic-bolt',
  魔弹风暴: 'missile-storm',
  破印遗物: 'graveyard-discover-relic',
  血誓回卷: 'knight-blood-oath-scroll',
  查阅动作: 'survey-action',
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
  curseEffect?: string;
  isCurse?: boolean;
};

export function resolveMagicPatternKey(card: MagicPatternCardRef): string | null {
  if (card.type === 'hero-magic') {
    if (card.heroMagicId === 'holy-light') return 'hero-holy-light';
    if (card.heroMagicId === 'berserker-rage') return 'hero-berserker-rage';
    if (card.heroMagicId === 'revive-blessing') return 'hero-revive-blessing';
    if (card.heroMagicId === 'monster-doom') return 'hero-monster-doom';
    return NAME_TO_KEY[card.name] ?? `fallback-${hashName(card.name) % 12}`;
  }
  if (card.type === 'curse') {
    if (card.curseEffect === 'greed-curse') return 'knight-greed-curse';
    return 'curse-seal';
  }
  if (card.type !== 'magic') return null;

  if (card.magicEffect === 'curse') return 'curse-seal';
  if (card.magicEffect === 'honor-blood') return 'war-blood-seal';
  if (card.magicEffect === 'honor-sweep') return 'knight-honor-sweep';
  if (card.magicEffect === 'double-next-magic') return 'spell-echo';
  if (card.magicEffect === 'arcane-storm-magic-count') return 'arcane-storm';
  if (card.magicEffect === 'equipment-enchant-discard') return 'equipment-enchant';
  if (card.magicEffect === 'altar-discard-discover') return 'altar-ritual';
  if (card.magicEffect === 'persuade-boost-draw') return 'persuade-boost';
  if (card.magicEffect === 'bounty-spell-damage') return 'bounty-spell';
  if (card.magicEffect === 'storm-volley-recycle') return 'storm-volley';
  if (card.magicEffect === 'equalize-temp-attack-armor') return 'spacetime-mirror';
  if (card.magicEffect === 'weapon-manual') return 'weapon-manual';
  if (card.magicEffect === 'arcane-shield-stun-cap') return 'arcane-shield';
  if (card.magicEffect === 'swap-backpack-recycle') return 'void-swap';
  if (card.magicEffect === 'active-row-monster-attack-debuff') return 'monster-attack-debuff';
  if (card.magicEffect === 'amplify-target') return 'amplify-target';
  if (card.magicEffect === 'backpack-magic-discover') return 'tome-search';
  if (card.magicEffect === 'crossroads-left-swap') return 'crossroads-left-swap';
  if (card.magicEffect === 'guild-hand-recycle') return 'guild-hand-recycle';
  if (card.magicEffect === 'guild-recycle-reshuffle') return 'guild-recycle-reshuffle';

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
