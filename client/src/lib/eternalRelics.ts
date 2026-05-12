import type { EternalRelic, EternalRelicId } from '@/game-core/types';
import type { RngState } from '@/game-core/rng';
import { shuffle as rngShuffle } from '@/game-core/rng';

import relicWaterfallDiscoverImage from '@assets/generated_images/relic_waterfall_discover.png';
import relicWaterfallHealImage from '@assets/generated_images/relic_waterfall_heal.png';
import relicVitalityWellImage from '@assets/generated_images/chibi_forge_heart_amulet.png';
import relicDiscardProfitImage from '@assets/generated_images/relic_discard_profit.png';
import relicHealToDamageImage from '@assets/generated_images/relic_heal_to_damage.png';
import relicEarlySurgeImage from '@assets/generated_images/relic_early_surge.png';
import relicShieldWallImage from '@assets/generated_images/relic_shield_wall.png';
import relicSummonMinionImage from '@assets/generated_images/chibi_minion_follower.png';
import relicBulwarkAttackImage from '@assets/generated_images/relic_bulwark_attack.png';
import relicBulwarkArmorImage from '@assets/generated_images/relic_bulwark_armor.png';
import relicChainPersuadeImage from '@assets/generated_images/knight_potion_chain_persuade.png';
import relicRecycleShuffleImage from '@assets/generated_images/relic_recycle_shuffle.png';
import relicEquipEmpowerImage from '@assets/generated_images/knight_potion_equip_empower.png';
import relicWraithPurificationImage from '@assets/generated_images/cute_chibi_wraith_monster.png';
import relicPersuadeSameHalveImage from '@assets/generated_images/relic_persuade_same_halve.png';
import relicPersuadeRaceBonusImage from '@assets/generated_images/relic_persuade_race_bonus.png';
import relicPersuadeDurabilityImage from '@assets/generated_images/relic_persuade_durability.png';
import relicEquipOverclockImage from '@assets/generated_images/knight_potion_equip_overclock.png';
import relicSummonFrenzyImage from '@assets/generated_images/knight_potion_frenzy_discover.png';

const RELIC_REGISTRY: Record<EternalRelicId, EternalRelic> = {
  'waterfall-discover': {
    id: 'waterfall-discover',
    name: '永恒护符·探秘',
    description: '每次瀑流推进时，发现一张职业专属卡。',
    image: relicWaterfallDiscoverImage,
  },
  'waterfall-heal': {
    id: 'waterfall-heal',
    name: '永恒护符·潮涌回春',
    description: '每次瀑流推进时，恢复 4 点生命。',
    image: relicWaterfallHealImage,
  },
  'vitality-well': {
    id: 'vitality-well',
    name: '永恒护符·巨人心力',
    description: '开局 +8 最大生命，+8 金币。',
    image: relicVitalityWellImage,
    initialMaxHpBonus: 8,
    initialGoldBonus: 8,
  },
  'discard-profit': {
    id: 'discard-profit',
    name: '永恒护符·弃牌生金',
    description: '每弃回一张牌，获得 2 金币；开局商店等级为 1。',
    image: relicDiscardProfitImage,
    initialShopLevel: 1,
  },
  'heal-to-damage': {
    id: 'heal-to-damage',
    name: '永恒护符·愈战愈勇',
    description: '每累计恢复 5 点生命，左右装备栏各 +1 永久伤害。',
    image: relicHealToDamageImage,
  },
  'early-surge': {
    id: 'early-surge',
    name: '永恒护符·先发制人',
    description: '开局瀑流 +1，抽 3 张专属牌。',
    image: relicEarlySurgeImage,
    initialWaterfallBonus: 1,
    initialClassCardDraw: 3,
  },
  'shield-wall': {
    id: 'shield-wall',
    name: '永恒护符·雷盾心法',
    description: '不能装备武器，+1 永久法术伤害。',
    image: relicShieldWallImage,
    initialSpellDamageBonus: 1,
  },
  'summon-minion': {
    id: 'summon-minion',
    name: '永恒护符·随从召唤',
    description: '开局获得小随从，每次用小随从击杀怪物，小随从攻击 +1、防御 +1。',
    image: relicSummonMinionImage,
  },
  'bulwark-attack': {
    id: 'bulwark-attack',
    name: '永恒护符·瀑流铸剑',
    description: '被动：每次攻击时，该装备栏临时攻击 +2。（可叠加）',
    image: relicBulwarkAttackImage,
  },
  'bulwark-armor': {
    id: 'bulwark-armor',
    name: '永恒护符·格挡铸甲',
    description: '被动：每次格挡时，该装备栏获得 2 点临时护甲。（可叠加）',
    image: relicBulwarkArmorImage,
  },
  'chain-persuade': {
    id: 'chain-persuade',
    name: '永恒护符·连劝秘药',
    description: '连续劝降同一个怪物时，每次累计成功概率 +15%。',
    image: relicChainPersuadeImage,
  },
  'recycle-shuffle': {
    id: 'recycle-shuffle',
    name: '永恒护符·回收轮转',
    description: '瀑流推进时，回收袋洗回背包（所有牌剩余瀑流 -1，就绪的牌回背包）。',
    image: relicRecycleShuffleImage,
  },
  'equip-empower': {
    id: 'equip-empower',
    name: '永恒护符·铸锋药剂',
    description: '当装备上装备时，该装备栏获得 3 临时攻击和 3 临时护甲。',
    image: relicEquipEmpowerImage,
  },
  'wraith-purification': {
    id: 'wraith-purification',
    name: '永恒护符·幽魂净化',
    description: '每当玩家回合结束时，回收袋中半数（向下取整）的牌瀑流计时 -1。',
    image: relicWraithPurificationImage,
  },
  'persuade-same-halve': {
    id: 'persuade-same-halve',
    name: '永恒护符·连劝减半',
    description: '连续劝降同一怪物，第二次费用减半。',
    image: relicPersuadeSameHalveImage,
  },
  'persuade-race-bonus': {
    id: 'persuade-race-bonus',
    name: '永恒护符·种族怀柔',
    description: 'Skeleton/Wraith 劝降成功率 +20%。',
    image: relicPersuadeRaceBonusImage,
  },
  'persuade-durability-bonus': {
    id: 'persuade-durability-bonus',
    name: '永恒护符·劝降耐久',
    description: '劝降成功的怪物起始耐久 +1。',
    image: relicPersuadeDurabilityImage,
  },
  'end-turn-draw': {
    id: 'end-turn-draw',
    name: '永恒护符·回合汲取',
    description: '每次结束英雄回合时，从背包抽 1 张牌。',
    image: relicEarlySurgeImage,
    amuletEffect: 'end-turn-draw',
  },
  'missile-amplify-on-waterfall': {
    id: 'missile-amplify-on-waterfall',
    name: '永恒护符·瀑流增幅魔弹',
    description: '每次瀑流推进时，所有「魔弹」永久增幅 +1。',
    image: relicWaterfallDiscoverImage,
  },
  'missile-stun-20': {
    id: 'missile-stun-20',
    name: '永恒护符·震荡弹幕',
    description: '所有「魔弹」造成伤害后有 20% 概率击晕目标（受击晕上限影响）。',
    image: relicShieldWallImage,
  },
  'missile-draw-1': {
    id: 'missile-draw-1',
    name: '永恒护符·汲取弹幕',
    description: '所有「魔弹」造成伤害后从背包抽 1 张牌。',
    image: relicEarlySurgeImage,
  },
  'waterfall-draw-2': {
    id: 'waterfall-draw-2',
    name: '永恒护符·瀑流汲取',
    description: '每次瀑流推进时，从背包抽 2 张牌。',
    image: relicEarlySurgeImage,
  },
  'equip-overclock': {
    id: 'equip-overclock',
    name: '永恒护符·装备超频',
    description: '光环（可叠加）：每持有一份「装备超频」，回收袋牌数 > 10 时装备效果额外多触发 1 次（不重复挥击/格挡本身）；牌数 ≤ 10 立即失效。',
    image: relicEquipOverclockImage,
  },
  'summon-frenzy': {
    id: 'summon-frenzy',
    name: '永恒护符·狂热发现',
    description: '光环（可叠加）：每持有一份「狂热发现」，使用「专属感召」时若背包牌数 > 10，则额外多触发 1 次发现；牌数 ≤ 10 立即失效。',
    image: relicSummonFrenzyImage,
  },
};

export function getEternalRelic(id: EternalRelicId): EternalRelic {
  return RELIC_REGISTRY[id];
}

export function getStartingRelics(): EternalRelic[] {
  // `waterfall-discover` (永恒护符·探秘) was previously included here. It
  // has been removed from the starting set in favor of the opening-hand
  // 「专属感召」 perm-1 magic (see `createStarterDiscoverClassToHandCard`
  // in `game-core/deck.ts`). The relic registry entry is intentionally
  // retained so other paths (e.g. 「护符永铸药」 converting an equipped
  // amulet, save migrations) still resolve cleanly.
  return [
    RELIC_REGISTRY['recycle-shuffle'],
    RELIC_REGISTRY['waterfall-draw-2'],
  ];
}

export function hasEternalRelic(relics: EternalRelic[], id: EternalRelicId): boolean {
  return relics.some(r => r.id === id);
}

/**
 * Count how many copies of a given relic id are present in `relics`.
 *
 * Used by stackable relics (currently `chain-persuade`, `equip-empower`,
 * `end-turn-draw`) — each successive use of the granting potion pushes another
 * copy into `state.eternalRelics`, and consumers multiply their magnitude by
 * the count returned here.
 */
export function countEternalRelics(relics: EternalRelic[], id: EternalRelicId): number {
  let n = 0;
  for (const r of relics) if (r.id === id) n++;
  return n;
}

/**
 * Set of relic ids whose granting potions are stackable. The set is used by
 * the bar UI to decide whether to display a `×N` stack badge and by the detail
 * modal to append a per-stack bonus description. Granting code itself reads
 * the `stackable` flag on the `grantEternalRelic` CardEffect — keep these two
 * sources of truth in sync when adding a new stackable potion.
 */
export const STACKABLE_RELIC_IDS: ReadonlySet<EternalRelicId> = new Set<EternalRelicId>([
  'chain-persuade',
  'equip-empower',
  'end-turn-draw',
  'equip-overclock',
  'summon-frenzy',
]);

export function isRelicStackable(id: EternalRelicId): boolean {
  return STACKABLE_RELIC_IDS.has(id);
}

export interface DedupedRelic {
  relic: EternalRelic;
  count: number;
}

/**
 * Group `relics` by id, preserving first-occurrence order. Stackable relics
 * (`STACKABLE_RELIC_IDS`) collapse into a single entry with `count > 1`;
 * non-stackable relics always show count=1 even if duplicates somehow exist
 * (defensive — the granting path normally blocks dupes for them).
 *
 * Used by the `EternalRelicBar` to render one icon per relic id with an
 * optional `×N` badge instead of N visually identical icons.
 */
export function dedupeRelics(relics: EternalRelic[]): DedupedRelic[] {
  const order: string[] = [];
  const map = new Map<string, DedupedRelic>();
  for (const r of relics) {
    const key = r.id;
    const existing = map.get(key);
    if (existing) {
      if (isRelicStackable(r.id)) existing.count += 1;
    } else {
      order.push(key);
      map.set(key, { relic: r, count: 1 });
    }
  }
  return order.map(k => map.get(k)!);
}

/**
 * Render a human-readable stacked description for a relic.
 *
 * Returns a string suffix (NOT including the base `relic.description`) that
 * shows the player the *current* aggregate magnitude after stacking, e.g.
 *   - chain-persuade ×2 → "（已叠加 ×2，连续劝降每次累计 +30%）"
 *   - equip-empower ×3 → "（已叠加 ×3，装备时该栏 +9 临时攻击 / +9 临时护甲）"
 *   - end-turn-draw ×2 → "（已叠加 ×2，每回合结束抽 2 张）"
 *
 * Returns empty string when count <= 1 (or when the relic has no stack-aware
 * description).
 */
export function getRelicStackedSuffix(id: EternalRelicId, count: number): string {
  if (count <= 1) return '';
  switch (id) {
    case 'chain-persuade':
      return `（已叠加 ×${count}，连续劝降每次累计 +${15 * count}%）`;
    case 'equip-empower':
      return `（已叠加 ×${count}，装备时该栏 +${3 * count} 临时攻击 / +${3 * count} 临时护甲）`;
    case 'end-turn-draw':
      return `（已叠加 ×${count}，每回合结束抽 ${count} 张）`;
    case 'equip-overclock':
      return `（已叠加 ×${count}，回收袋牌数 > 15 时装备效果额外触发 ${count} 次）`;
    case 'summon-frenzy':
      return `（已叠加 ×${count}，背包牌数 > 10 时「专属感召」额外触发 ${count} 次）`;
    default:
      return `（已叠加 ×${count}）`;
  }
}

const CARD_ONLY_RELICS = new Set<EternalRelicId>(['bulwark-attack', 'bulwark-armor', 'chain-persuade', 'recycle-shuffle', 'equip-empower', 'wraith-purification', 'persuade-same-halve', 'persuade-race-bonus', 'persuade-durability-bonus', 'end-turn-draw', 'missile-amplify-on-waterfall', 'missile-stun-20', 'missile-draw-1', 'waterfall-draw-2', 'equip-overclock', 'summon-frenzy']);

export function getSelectableRelics(exclude: EternalRelicId[]): EternalRelic[] {
  const excludeSet = new Set(exclude);
  return Object.values(RELIC_REGISTRY).filter(r => !excludeSet.has(r.id) && !CARD_ONLY_RELICS.has(r.id));
}

export function sampleRelics(count: number, exclude: EternalRelicId[], rng: RngState): [EternalRelic[], RngState] {
  const pool = getSelectableRelics(exclude);
  const [shuffled, nextRng] = rngShuffle(pool, rng);
  return [shuffled.slice(0, count), nextRng];
}
