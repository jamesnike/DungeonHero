import type { EternalRelic, EternalRelicId } from '@/game-core/types';

import relicWaterfallDiscoverImage from '@assets/generated_images/card_dedupe_magic_underworld_relic.png';
import relicWaterfallHealImage from '@assets/generated_images/card_dedupe_knight_magic_soft_waterfall.png';
import relicVitalityWellImage from '@assets/generated_images/chibi_forge_heart_amulet.png';
import relicDiscardProfitImage from '@assets/generated_images/cute_cartoon_gold_coins.png';
import relicHealToDamageImage from '@assets/generated_images/starter_waterfall_sword.png';
import relicEarlySurgeImage from '@assets/generated_images/card_dedupe_starter_potion_waterfall_deal.png';
import relicShieldWallImage from '@assets/generated_images/chibi_thunder_amulet.png';
import relicSummonMinionImage from '@assets/generated_images/chibi_minion_follower.png';
import relicBulwarkAttackImage from '@assets/generated_images/magical_sword_weapon_card.png';
import relicBulwarkArmorImage from '@assets/generated_images/card_dedupe_magic_tide_armor.png';
import relicChainPersuadeImage from '@assets/generated_images/knight_potion_chain_persuade.png';
import relicRecycleShuffleImage from '@assets/generated_images/starter_amulet_recycle_expand.png';
import relicEquipEmpowerImage from '@assets/generated_images/knight_potion_equip_empower.png';

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
    description: '开局瀑流 +2，抽 3 张专属牌。',
    image: relicEarlySurgeImage,
    initialWaterfallBonus: 2,
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
    description: '开局获得小随从，每次击杀怪物，小随从攻击 +1、防御 +1。',
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
    description: '连续两次劝降同一个怪物时，成功概率 +15%。',
    image: relicChainPersuadeImage,
  },
  'recycle-shuffle': {
    id: 'recycle-shuffle',
    name: '永恒护符·回收轮转',
    description: '战斗结束或瀑流推进时，将回收袋中的卡牌洗入背包。',
    image: relicRecycleShuffleImage,
  },
  'equip-empower': {
    id: 'equip-empower',
    name: '永恒护符·铸锋药剂',
    description: '当装备上装备时，该装备栏获得 3 临时攻击和 3 临时护甲。',
    image: relicEquipEmpowerImage,
  },
};

export function getEternalRelic(id: EternalRelicId): EternalRelic {
  return RELIC_REGISTRY[id];
}

export function getStartingRelics(): EternalRelic[] {
  return [RELIC_REGISTRY['waterfall-discover'], RELIC_REGISTRY['recycle-shuffle']];
}

export function hasEternalRelic(relics: EternalRelic[], id: EternalRelicId): boolean {
  return relics.some(r => r.id === id);
}

const CARD_ONLY_RELICS = new Set<EternalRelicId>(['bulwark-attack', 'bulwark-armor', 'chain-persuade', 'recycle-shuffle', 'equip-empower']);

export function getSelectableRelics(exclude: EternalRelicId[]): EternalRelic[] {
  const excludeSet = new Set(exclude);
  return Object.values(RELIC_REGISTRY).filter(r => !excludeSet.has(r.id) && !CARD_ONLY_RELICS.has(r.id));
}

export function sampleRelics(count: number, exclude: EternalRelicId[]): EternalRelic[] {
  const pool = getSelectableRelics(exclude);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
