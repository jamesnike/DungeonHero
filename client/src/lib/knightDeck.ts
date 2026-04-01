import { type GameCardData } from '@/components/GameCard';
import { CHAOS_DICE_SPELL_DESCRIPTION, CHAOS_DICE_SPELL_MAGIC_EFFECT } from '@/lib/knightChaosDiceCopy';

// Import images for Knight cards
import holyBladeImage from '@assets/generated_images/holy_light_blade.png';
import swiftDaggerImage from '@assets/generated_images/swift_wind_dagger.png';
import thunderHammerImage from '@assets/generated_images/thunder_warhammer.png';
import ironTowerShieldImage from '@assets/generated_images/iron_tower_shield.png';
import thornedShieldImage from '@assets/generated_images/thorned_reflect_shield.png';
import guardianShieldImage from '@assets/generated_images/guardian_holy_shield.png';
import skillScrollImage from '@assets/generated_images/chibi_skill_scroll.png';
import dualguardAmuletImage from '@assets/generated_images/chibi_dualguard_amulet.png';
import thunderAmuletImage from '@assets/generated_images/chibi_thunder_amulet.png';
import potionArcaneInfusionImage from '@assets/generated_images/cute_potion_arcane_infusion.png';
import potionBackpackExpandImage from '@assets/generated_images/cute_potion_backpack_expand.png';
import persuadeHammerImage from '@assets/generated_images/knight_persuade_hammer.png';
import thunderStunHammerImage from '@assets/generated_images/knight_thunder_stun_hammer.png';
import reviveBoneShieldImage from '@assets/generated_images/knight_revive_bone_shield.png';
import evolvingShieldImage from '@assets/generated_images/knight_evolving_shield.png';
import guardianLinkShieldImage from '@assets/generated_images/knight_guardian_link_shield.png';
import salvageAmuletImage from '@assets/generated_images/knight_salvage_amulet.png';
import bloodrageAmuletImage from '@assets/generated_images/knight_bloodrage_amulet.png';
import persuadeAuraAmuletImage from '@assets/generated_images/knight_persuade_aura_amulet.png';
import statSwapPotionImage from '@assets/generated_images/knight_stat_swap_potion.png';
import lifestealPotionImage from '@assets/generated_images/knight_lifesteal_potion.png';
import persuadeScrollImage from '@assets/generated_images/knight_persuade_scroll.png';
import fusionScrollImage from '@assets/generated_images/knight_fusion_scroll.png';
import recallScrollImage from '@assets/generated_images/knight_recall_scroll.png';
import monsterDoomScrollImage from '@assets/generated_images/knight_monster_doom_scroll.png';

export interface KnightCardData extends GameCardData {
  classCard: true;
  description: string;
  knightEffect?: string;
  weaponBonus?: number;
  shieldBonus?: number;
  healOnKill?: number;
  damageReflect?: number;
  permanentBuff?: string;
  tempBuff?: string;
}

export function generateKnightDeck(): KnightCardData[] {
  const deck: KnightCardData[] = [];
  let id = 0;

  const nextId = () => `knight-${id++}`;
  const pushCard = (card: Omit<KnightCardData, 'id'>) => {
    deck.push({ ...card, id: nextId() });
  };

  // === WEAPONS (3 cards) ===
  pushCard({
    type: 'weapon',
    name: '圣光之刃',
    value: 6,
    image: holyBladeImage,
    classCard: true,
    description: '每次攻击时恢复 2 点生命。',
    healOnAttack: 2,
    durability: 2,
    maxDurability: 2,
  });

  pushCard({
    type: 'weapon',
    name: '疾风短剑',
    value: 4,
    image: swiftDaggerImage,
    classCard: true,
    description: '用此武器杀死怪物时耐久度回满。',
    durability: 3,
    maxDurability: 3,
    restoreDurabilityOnKill: true,
  });

  pushCard({
    type: 'weapon',
    name: '碎雷战锤',
    value: 3,
    image: thunderHammerImage,
    classCard: true,
    description: '每次攻击永久增加该装备栏 +1 伤害。',
    weaponBonus: 1,
    durability: 2,
    maxDurability: 2,
  });

  // === SHIELDS (3 cards) ===
  pushCard({
    type: 'shield',
    name: '铁壁塔盾',
    value: 5,
    image: ironTowerShieldImage,
    classCard: true,
    description: '完全格挡一次攻击的全部伤害，无论攻击力多高。损毁后进入回收袋。',
    durability: 1,
    maxDurability: 1,
    permEquipment: true,
    knightEffect: 'fullBlock',
  });

  pushCard({
    type: 'shield',
    name: '棘刺反盾',
    value: 4,
    image: thornedShieldImage,
    classCard: true,
    description: '格挡时反弹一半的攻击伤害给攻击者（向上取整）。',
    reflectHalfDamage: true,
    durability: 2,
    maxDurability: 2,
  });

  pushCard({
    type: 'shield',
    name: '守护圣盾',
    value: 3,
    image: guardianShieldImage,
    classCard: true,
    description: '完美格挡时，70% 概率不消耗耐久（掷骰判定）。',
    shieldPerfectBlockSaveChance: 70,
    durability: 2,
    maxDurability: 2,
  });

  // === AMULETS (2 cards) ===
  pushCard({
    type: 'amulet',
    name: '双守护圣盾',
    value: 1,
    image: dualguardAmuletImage,
    classCard: true,
    description:
      '护盾完美格挡时（护甲值≥攻击力），该装备栏永久护甲+1。「铁壁塔盾」的完全格挡视为完美格挡。',
    amuletEffect: 'dual-guard',
  });

  pushCard({
    type: 'amulet',
    name: '雷霆符印',
    value: 1,
    image: thunderAmuletImage,
    classCard: true,
    description: '每弃一张牌到坟场，对激活行随机怪物造成 1 点伤害。',
    amuletEffect: 'discard-zap',
  });

  // === POTIONS (2 cards) ===
  pushCard({
    type: 'potion',
    name: '奥术灌注',
    value: 0,
    image: potionArcaneInfusionImage,
    classCard: true,
    description: '掷骰：选中的永久加成翻倍（左伤害/左护甲/右伤害/右护甲/法术伤害）。',
    potionEffect: 'dice-arcane-infusion',
  });

  pushCard({
    type: 'potion',
    name: '无尽背袋灵药',
    value: 0,
    image: potionBackpackExpandImage,
    classCard: true,
    description: '掷骰决定效果：25% 护符上限+1 / 25% 左装备栏+1 / 25% 右装备栏+1 / 25% 背包+3。',
    potionEffect: 'dice-backpack-expand',
  });

  // === HERO MAGIC (2 cards) ===
  pushCard({
    type: 'hero-magic',
    name: '圣光秘术',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '第一次使用时解锁圣光；已掌握时充满数值槽，可手动发动。',
    heroMagicId: 'holy-light',
    heroMagicEffect: '英雄魔法：解锁或触发圣光。',
  });

  pushCard({
    type: 'hero-magic',
    name: '狂战秘典',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '第一次使用时解锁狂战；已掌握时充满数值槽，可手动发动。',
    heroMagicId: 'berserker-rage',
    heroMagicEffect: '英雄魔法：解锁或触发狂战。',
  });

  // === ARCANE MAGIC (8 cards) ===
  pushCard({
    type: 'magic',
    name: '浴血贪念',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '一次性：获得等同当前已损失生命的金币，将“贪婪诅咒”放入背包。',
    magicType: 'instant',
    magicEffect: '获得金币，生成贪婪诅咒。',
    knightEffect: 'blood-greed',
    maxUpgradeLevel: 1,
  });

  pushCard({
    type: 'magic',
    name: '铠甲贯刺',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '永久：选择一件护甲装备，对目标怪物造成等同护甲值 50% 的伤害。',
    magicType: 'permanent',
    magicEffect: '护甲值 50% 转化为伤害。',
    knightEffect: 'armor-strike',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'magic',
    name: '残血终焉',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '永久：对一名怪物造成等同当前已损失生命值 50% 的伤害。',
    magicType: 'permanent',
    magicEffect: '以失去生命 50% 为伤害。',
    knightEffect: 'missing-hp-smite',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'magic',
    name: '坟火新星',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '永久：当此牌被弃置时，对当前行所有怪物造成 3 点伤害。',
    magicType: 'permanent',
    magicEffect: '被弃置时爆炸伤害。',
    knightEffect: 'grave-nova',
  });

  pushCard({
    type: 'magic',
    name: '孤注一掷',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '一次性：生命降至 1，每个武器栏可多攻击一次。',
    magicType: 'instant',
    magicEffect: '降血换取每栏额外攻击。',
    knightEffect: 'berserk-gambit',
    maxUpgradeLevel: 3,
  });

  pushCard({
    type: 'magic',
    name: '回收灵焰',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '永久：将回收袋里的卡牌放回背包，然后抽 2 张牌。(可超手牌上限)',
    magicType: 'permanent',
    magicEffect: '回收袋归位并抽牌。',
    knightEffect: 'recycle-flare',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'magic',
    name: '不灭守护',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '一次性：只能在受到致命伤害时打出，抵消该次伤害。',
    magicType: 'instant',
    magicEffect: '濒死时抵消致死伤害。',
    knightEffect: 'death-ward',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'magic',
    name: '混沌骰运',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: CHAOS_DICE_SPELL_DESCRIPTION,
    magicType: 'permanent',
    magicEffect: CHAOS_DICE_SPELL_MAGIC_EFFECT,
    knightEffect: 'chaos-dice',
  });

  // === GRAVEYARD RECALL (1 card) ===
  const graveyardRecallId = nextId();
  deck.push({
    id: graveyardRecallId,
    type: 'magic',
    name: '冥途拾遗',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '一次性：从坟场随机取回至多 3 张牌加入背包（不能取回自己）。',
    magicType: 'instant',
    magicEffect: '坟场随机取回 3 张牌。',
    knightEffect: 'graveyard-recall',
    maxUpgradeLevel: 3,
  });

  // === NEW WEAPONS (2 cards) ===
  pushCard({
    type: 'weapon',
    name: '感化之锤',
    value: 2,
    image: persuadeHammerImage,
    classCard: true,
    description: '每次攻击某个怪物，增加该怪物劝降概率 +20%（精英 +10%）。',
    persuadeBoostOnHit: 20,
    persuadeBoostOnHitElite: 10,
    durability: 4,
    maxDurability: 4,
  });

  pushCard({
    type: 'weapon',
    name: '雷击碎骨锤',
    value: 3,
    image: thunderStunHammerImage,
    classCard: true,
    description: '击晕率额外 +15%。攻击已击晕的怪物时造成双倍伤害。',
    stunBonusChance: 15,
    doubleDamageOnStunned: true,
    durability: 3,
    maxDurability: 3,
  });

  // === NEW SHIELDS (3 cards) ===
  pushCard({
    type: 'shield',
    name: '不朽骨盾',
    value: 2,
    image: reviveBoneShieldImage,
    classCard: true,
    description: '复生（首次摧毁恢复 1 耐久）。摧毁时该装备栏永久伤害 +1。',
    hasEquipmentRevive: true,
    onDestroyPermanentDamage: 1,
    durability: 4,
    maxDurability: 4,
  });

  pushCard({
    type: 'shield',
    name: '进化甲壁',
    value: 5,
    image: evolvingShieldImage,
    classCard: true,
    description: '格挡 4 次后自动升级（护甲 +2、耐久回满、上限 +1）。',
    shieldBlockAutoUpgradeCount: 4,
    durability: 2,
    maxDurability: 2,
  });

  pushCard({
    type: 'shield',
    name: '守望者之盾',
    value: 4,
    image: guardianLinkShieldImage,
    classCard: true,
    description: '格挡时，另一个装备栏获得临时护甲（等同此盾护甲值）。',
    blockGrantTempArmorToOther: true,
    durability: 2,
    maxDurability: 2,
  });

  // === NEW AMULETS (3 cards) ===
  pushCard({
    type: 'amulet',
    name: '残骸回收符',
    value: 1,
    image: salvageAmuletImage,
    classCard: true,
    description: '装备摧毁时，改为回到手牌（耐久归零但不进坟场）。',
    amuletEffect: 'equipment-salvage',
  });

  pushCard({
    type: 'amulet',
    name: '血怒战符',
    value: 1,
    image: bloodrageAmuletImage,
    classCard: true,
    description: '每次失去生命时，所有装备栏临时攻击 +3。',
    amuletEffect: 'bloodrage-attack',
  });

  pushCard({
    type: 'amulet',
    name: '怀柔之印',
    value: 1,
    image: persuadeAuraAmuletImage,
    classCard: true,
    description: '每获得一次临时攻击加成，激活行所有怪物劝降率 +5%。',
    amuletEffect: 'persuade-on-temp-attack',
  });

  // === NEW POTIONS (2 cards) ===
  pushCard({
    type: 'potion',
    name: '乾坤颠倒药',
    value: 0,
    image: statSwapPotionImage,
    classCard: true,
    description: '随机选择左或右装备栏，将其永久伤害与永久护甲数值互换。',
    potionEffect: 'swap-slot-damage-shield',
  });

  pushCard({
    type: 'potion',
    name: '暗夜吸血药',
    value: 0,
    image: lifestealPotionImage,
    classCard: true,
    description: '法术吸血 +1，生命上限 +6。',
    potionEffect: 'spell-lifesteal+1-maxhp+6',
  });

  // === NEW INSTANT MAGIC (2 cards) ===
  pushCard({
    type: 'magic',
    name: '怀柔令',
    value: 0,
    image: persuadeScrollImage,
    classCard: true,
    description: '一次性：劝降费用降低 3 金币，成功率 +10%（持续到下次劝降）。',
    magicType: 'instant',
    magicEffect: '劝降费用 -3，成功率 +10%。',
    knightEffect: 'persuade-discount',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'magic',
    name: '魔物融合',
    value: 0,
    image: fusionScrollImage,
    classCard: true,
    description: '一次性：融合同种怪物——2只融合为精英，3只融合为骷髅王（隐藏Boss）。不同种怪物不能融合。',
    magicType: 'instant',
    magicEffect: '选择激活行同种怪物进行融合。',
    knightEffect: 'monster-fusion',
  });

  // === NEW PERMANENT MAGIC (1 card) ===
  pushCard({
    type: 'magic',
    name: '紧急回收',
    value: 0,
    image: recallScrollImage,
    classCard: true,
    description: '永久：失去 2 点生命，选择一个装备回到手牌。',
    magicType: 'permanent',
    magicEffect: '失去 2 HP，装备回手。',
    knightEffect: 'recall-equipment',
    maxUpgradeLevel: 2,
  });

  // === NEW HERO MAGIC (1 card) ===
  pushCard({
    type: 'hero-magic',
    name: '灭世裁决',
    value: 0,
    image: monsterDoomScrollImage,
    classCard: true,
    description: '装备的怪物数量为数值条（上限 6）。释放：摧毁所有装备，每摧毁一个装备对激活行所有怪物 -2攻/-2血上限（每个血层都减）。',
    heroMagicId: 'monster-doom',
    heroMagicEffect: '英雄魔法：解锁或触发灭世裁决。',
  });

  // Shuffle the deck
  return deck.sort(() => Math.random() - 0.5);
}

// Class card discovery events for the main deck
export function createKnightDiscoveryEvents(): GameCardData[] {
  const events: GameCardData[] = [];
  // Discovery events removed to keep total event count at 12 while preserving API surface.
  return events;
}

const createDynamicKnightCardId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createGraveyardRecallCard = (): KnightCardData => {
  const id = createDynamicKnightCardId('graveyard-recall');
  return {
    id,
    type: 'magic',
    name: '冥途拾遗',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '一次性：从坟场随机取回至多 3 张牌加入背包（不能取回自己）。',
    magicType: 'instant',
    magicEffect: '坟场随机取回 3 张牌。',
    knightEffect: 'graveyard-recall',
    maxUpgradeLevel: 3,
  };
};

export const createGreedCurseCard = (): KnightCardData => ({
  id: createDynamicKnightCardId('greed'),
  type: 'magic',
  name: '贪婪诅咒',
  value: 0,
  image: skillScrollImage,
  classCard: true,
  description: '永久：使用或弃置时失去 3 金币，瀑布后才能再次使用。',
  magicType: 'permanent',
  magicEffect: '使用或弃置失去 3 金币。',
  knightEffect: 'greed-curse',
  isCurse: true,
});