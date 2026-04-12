import { type GameCardData } from '@/components/GameCard';
import { CHAOS_DICE_SPELL_DESCRIPTION, CHAOS_DICE_SPELL_MAGIC_EFFECT } from '@/lib/knightChaosDiceCopy';

// Import images for Knight cards
import holyBladeImage from '@assets/generated_images/holy_light_blade.png';
import swiftDaggerKnightImage from '@assets/generated_images/card_dedupe_weapon_swift_knight.png';
import swiftDaggerSoulHunterImage from '@assets/generated_images/card_dedupe_weapon_swift_soul_hunter.png';
import thunderHammerImage from '@assets/generated_images/thunder_warhammer.png';
import ironTowerShieldImage from '@assets/generated_images/iron_tower_shield.png';
import thornedShieldImage from '@assets/generated_images/thorned_reflect_shield.png';
import guardianShieldImage from '@assets/generated_images/guardian_holy_shield.png';
import dedupeKnightHeroHolyLightImage from '@assets/generated_images/card_dedupe_knight_hero_magic_holy_light.png';
import dedupeKnightHeroBerserkerImage from '@assets/generated_images/card_dedupe_knight_hero_magic_berserker.png';
import dedupeKnightMagicBloodGreedImage from '@assets/generated_images/card_dedupe_knight_magic_blood_greed.png';
import dedupeKnightMagicDeadPactImage from '@assets/generated_images/card_dedupe_knight_magic_dead_pact.png';
import dedupeKnightMagicArmorPierceImage from '@assets/generated_images/card_dedupe_knight_magic_armor_pierce.png';
import dedupeKnightMagicMissingHpSmiteImage from '@assets/generated_images/card_dedupe_knight_magic_missing_hp_smite.png';
import dedupeKnightMagicGraveNovaImage from '@assets/generated_images/card_dedupe_knight_magic_grave_nova.png';
import dedupeKnightMagicBerserkGambitImage from '@assets/generated_images/card_dedupe_knight_magic_berserk_gambit.png';
import dedupeKnightMagicDeckJudgeImage from '@assets/generated_images/card_dedupe_knight_magic_deck_judge.png';
import dedupeKnightMagicRecycleFlareImage from '@assets/generated_images/card_dedupe_knight_magic_recycle_flare.png';
import dedupeKnightMagicChaosDiceImage from '@assets/generated_images/card_dedupe_knight_magic_chaos_dice.png';
import dedupeKnightMagicFateSightImage from '@assets/generated_images/card_dedupe_knight_magic_fate_sight.png';
import dedupeKnightMagicMirrorCopyImage from '@assets/generated_images/card_dedupe_knight_magic_mirror_copy.png';
import dedupeKnightMagicArmorStunConvertImage from '@assets/generated_images/card_dedupe_knight_magic_armor_stun_convert.png';
import dedupeKnightMagicOverkillUpgradeImage from '@assets/generated_images/card_dedupe_knight_magic_overkill_upgrade.png';
import dedupeKnightHeroReviveTomeImage from '@assets/generated_images/card_dedupe_knight_hero_magic_revive_tome.png';
import dedupeKnightMagicGreedCurseImage from '@assets/generated_images/card_dedupe_knight_magic_greed_curse.png';
import dedupeMagicUnderworldRelicImage from '@assets/generated_images/card_dedupe_magic_underworld_relic.png';
import dualguardAmuletImage from '@assets/generated_images/chibi_dualguard_amulet.png';
import thunderAmuletSigilImage from '@assets/generated_images/card_dedupe_amulet_thunder_sigil.png';
import starterAmuletDamageDiscoverImage from '@assets/generated_images/starter_amulet_damage_discover.png';
import knightAmuletStunRecycleImage from '@assets/generated_images/knight_amulet_stun_recycle.png';
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
import persuadeScrollAmuletDedupeImage from '@assets/generated_images/card_dedupe_persuade_scroll_amulet.png';
import fusionScrollImage from '@assets/generated_images/knight_fusion_scroll.png';
import recallScrollImage from '@assets/generated_images/knight_recall_scroll.png';
import monsterDoomScrollImage from '@assets/generated_images/knight_monster_doom_scroll.png';
import heavyShieldKnightBashImage from '@assets/generated_images/card_dedupe_shield_heavy_knight_bash.png';
import knightChainPersuadePotionImage from '@assets/generated_images/knight_potion_chain_persuade.png';
import knightEquipEmpowerPotionImage from '@assets/generated_images/knight_potion_equip_empower.png';
import knightExchangeBladeImage from '@assets/generated_images/knight_weapon_exchange_blade.png';
import knightRageCleaveImage from '@assets/generated_images/knight_weapon_rage_cleave.png';
import dedupeKnightMagicFortuneWheelImage from '@assets/generated_images/card_dedupe_knight_magic_fortune_wheel.png';
import knightScrollTransformGrantImage from '@assets/generated_images/knight_scroll_transform_grant.png';
import knightScrollTransformRepairImage from '@assets/generated_images/knight_scroll_transform_repair.png';
import knightScrollBladeStormImage from '@assets/generated_images/knight_scroll_blade_storm.png';
import knightScrollBladeFlankImage from '@assets/generated_images/knight_scroll_blade_flank.png';
import knightScrollFortifyFlankImage from '@assets/generated_images/knight_scroll_fortify_flank.png';
import knightScrollBagFetchImage from '@assets/generated_images/knight_scroll_bag_fetch.png';
import knightMagicBloodDrawImage from '@assets/generated_images/knight_magic_blood_draw.png';
import knightWeaponResonanceBladeImage from '@assets/generated_images/knight_weapon_resonance_blade.png';
import knightShieldEnduranceImage from '@assets/generated_images/knight_shield_endurance.png';
import knightAmuletArmorHalveEndureImage from '@assets/generated_images/knight_amulet_armor_halve_endure.png';
import knightMagicRepairEnrageDiceImage from '@assets/generated_images/knight_magic_repair_enrage_dice.png';
import dedupeMagicUndeathGuardImage from '@assets/generated_images/card_dedupe_magic_undeath_guard.png';
import knightPotionRecycleGrantImage from '@assets/generated_images/card_dedupe_potion_haste_draw.png';
import dedupeMagicArcaneRefineImage from '@assets/generated_images/card_dedupe_magic_arcane_refine.png';

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
    description: '入场：恢复 3 点生命。每次攻击时恢复 2 点生命。',
    onEquipEffect: 'heal-3',
    healOnAttack: 2,
    durability: 2,
    maxDurability: 2,
  });

  pushCard({
    type: 'weapon',
    name: '疾风短剑',
    value: 4,
    image: swiftDaggerKnightImage,
    classCard: true,
    description: '入场：所有装备栏临时攻击 +2。用此武器杀死怪物时耐久度回满。',
    onEquipEffect: 'all-temp-attack-2',
    durability: 2,
    maxDurability: 2,
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
    durability: 1,
    maxDurability: 1,
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
    armorMax: 5,
    permEquipment: true,
    knightEffect: 'fullBlock',
  });

  pushCard({
    type: 'shield',
    name: '棘刺反盾',
    value: 4,
    image: thornedShieldImage,
    classCard: true,
    description: '格挡时反弹一半的攻击伤害给攻击者（向上取整），并加上该装备栏的永久攻击和临时攻击。',
    reflectHalfDamage: true,
    durability: 2,
    maxDurability: 2,
    armorMax: 4,
  });

  pushCard({
    type: 'shield',
    name: '守护圣盾',
    value: 3,
    image: guardianShieldImage,
    classCard: true,
    description: '完美格挡时，50% 概率不消耗耐久（掷骰判定）。',
    shieldPerfectBlockSaveChance: 50,
    durability: 2,
    maxDurability: 2,
    armorMax: 3,
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
    image: thunderAmuletSigilImage,
    classCard: true,
    description: '每弃置一张牌到坟场，对激活行随机怪物造成 1 点伤害。',
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
    description: '选择一项效果：护符上限+1 / 左装备栏+1 / 右装备栏+1 / 背包+3。',
    potionEffect: 'dice-backpack-expand',
  });

  // === HERO MAGIC (2 cards) ===
  pushCard({
    type: 'hero-magic',
    name: '圣光秘术',
    value: 0,
    image: dedupeKnightHeroHolyLightImage,
    classCard: true,
    description: '第一次使用时解锁圣光；已掌握时充满数值槽，可手动发动。',
    heroMagicId: 'holy-light',
    heroMagicEffect: '英雄魔法：解锁或触发圣光。',
  });

  pushCard({
    type: 'hero-magic',
    name: '狂战秘典',
    value: 0,
    image: dedupeKnightHeroBerserkerImage,
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
    image: dedupeKnightMagicBloodGreedImage,
    classCard: true,
    description: '一次性：获得等同当前已损失生命的金币，将“贪婪诅咒”放入背包。',
    magicType: 'instant',
    magicEffect: '获得金币，生成贪婪诅咒。',
    knightEffect: 'blood-greed',
    maxUpgradeLevel: 1,
  });

  pushCard({
    type: 'magic',
    name: '亡者之契',
    value: 0,
    image: dedupeKnightMagicDeadPactImage,
    classCard: true,
    description: '一次性：从坟场发现两张怪物牌，加入手牌。',
    magicType: 'instant',
    magicEffect: '从坟场发现两张怪物牌。',
    knightEffect: 'monster-recruit',
  });

  pushCard({
    type: 'magic',
    name: '铠甲贯刺',
    value: 0,
    image: dedupeKnightMagicArmorPierceImage,
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
    image: dedupeKnightMagicMissingHpSmiteImage,
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
    image: dedupeKnightMagicGraveNovaImage,
    classCard: true,
    description: '永久：当此牌被弃置时，对当前行所有怪物造成 3 点伤害。',
    magicType: 'permanent',
    magicEffect: '被弃置时爆炸伤害。',
    knightEffect: 'grave-nova',
    maxUpgradeLevel: 1,
  });

  pushCard({
    type: 'magic',
    name: '孤注一掷',
    value: 0,
    image: dedupeKnightMagicBerserkGambitImage,
    classCard: true,
    description: '一次性：生命降至 1，每个武器栏可多攻击一次。',
    magicType: 'instant',
    magicEffect: '降血换取每栏额外攻击。',
    knightEffect: 'berserk-gambit',
    maxUpgradeLevel: 3,
  });

  pushCard({
    type: 'magic',
    name: '命数裁断',
    value: 0,
    image: dedupeKnightMagicDeckJudgeImage,
    classCard: true,
    description:
      '一次性：翻看主牌堆顶 6 张牌；每有一张怪物牌须删除一张牌，每有一张 Event 左右装备栏临时攻击+2，每有一张装备则装备耐久+1，每有一张 Magic 永久法术伤害+1，每有一张 Potion +2HP。',
    magicType: 'instant',
    magicEffect: '透视牌堆顶并依类型获得增益/惩罚。',
    knightEffect: 'deck-judge-delete',
  });

  pushCard({
    type: 'magic',
    name: '回收灵焰',
    value: 0,
    image: dedupeKnightMagicRecycleFlareImage,
    classCard: true,
    description: '永久：回收袋洗回背包（所有牌剩余瀑流 -1），然后抽 2 张牌。(可超手牌上限)',
    magicType: 'permanent',
    magicEffect: '回收袋归位并抽牌。',
    knightEffect: 'recycle-flare',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'magic',
    name: '混沌骰运',
    value: 0,
    image: dedupeKnightMagicChaosDiceImage,
    classCard: true,
    description: CHAOS_DICE_SPELL_DESCRIPTION,
    magicType: 'permanent',
    magicEffect: CHAOS_DICE_SPELL_MAGIC_EFFECT,
    knightEffect: 'chaos-dice',
  });

  pushCard({
    type: 'magic',
    name: '天眼审判',
    value: 0,
    image: dedupeKnightMagicFateSightImage,
    classCard: true,
    description: '永久：造成 3 点伤害，翻看主牌堆顶 3 张牌，每有一张怪物牌，20% 概率击晕目标。',
    magicType: 'permanent',
    magicEffect: '造成伤害并透视牌堆，可能击晕目标。',
    knightEffect: 'fate-sight',
    recycleDelay: 2,
    maxUpgradeLevel: 1,
  });


  // === NEW WEAPONS (2 cards) ===
  pushCard({
    type: 'weapon',
    name: '感化之锤',
    value: 2,
    image: persuadeHammerImage,
    classCard: true,
    description: '每次攻击一次，下次劝降成功概率 +20%（精英 +10%）。',
    persuadeBoostOnHit: 20,
    persuadeBoostOnHitElite: 10,
    durability: 3,
    maxDurability: 3,
  });

  pushCard({
    type: 'weapon',
    name: '雷击碎骨锤',
    value: 3,
    image: thunderStunHammerImage,
    classCard: true,
    description: '击晕率60%。攻击已击晕的怪物时造成双倍伤害。',
    weaponStunChance: 60,
    doubleDamageOnStunned: true,
    durability: 2,
    maxDurability: 2,
  });

  pushCard({
    type: 'weapon',
    name: '噬魂猎刃',
    value: 5,
    image: swiftDaggerSoulHunterImage,
    classCard: true,
    description: '超杀：将回收袋 2 张牌移到手上。',
    overkillRecycleToHand: 2,
    durability: 2,
    maxDurability: 2,
  });

  // === NEW SHIELDS (3 cards) ===
  pushCard({
    type: 'shield',
    name: '不朽骨盾',
    value: 3,
    image: reviveBoneShieldImage,
    classCard: true,
    description: '复生（首次摧毁恢复 1 耐久）。遗言：该装备栏永久伤害 +1。',
    hasEquipmentRevive: true,
    onDestroyPermanentDamage: 1,
    durability: 2,
    maxDurability: 2,
    armorMax: 3,
  });

  pushCard({
    type: 'shield',
    name: '进化甲壁',
    value: 5,
    image: evolvingShieldImage,
    classCard: true,
    description: '格挡 3 次后自动升级（护甲 +2、耐久 +1、耐久上限 +1）。',
    shieldBlockAutoUpgradeCount: 3,
    durability: 2,
    maxDurability: 2,
    armorMax: 5,
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
    armorMax: 4,
  });

  // === NEW AMULETS (3 cards) ===
  pushCard({
    type: 'amulet',
    name: '残骸回收符',
    value: 1,
    image: salvageAmuletImage,
    classCard: true,
    description: '装备摧毁时，改为回到手牌，耐久上限-1（减到0时从游戏里删掉），耐久回到1。',
    amuletEffect: 'equipment-salvage',
  });

  pushCard({
    type: 'amulet',
    name: '血怒战符',
    value: 1,
    image: bloodrageAmuletImage,
    classCard: true,
    description: '每次对自己造成伤害时，所有装备栏临时攻击 +2。',
    amuletEffect: 'bloodrage-attack',
  });

  pushCard({
    type: 'amulet',
    name: '怀柔之印',
    value: 1,
    image: persuadeAuraAmuletImage,
    classCard: true,
    description: '每获得一次临时攻击加成，下一次劝降率 +5%。',
    amuletEffect: 'persuade-on-temp-attack',
  });

  pushCard({
    type: 'amulet',
    name: '劝降归袋符',
    value: 1,
    image: persuadeScrollAmuletDedupeImage,
    classCard: true,
    description: '每劝降成功一次，将一张「归袋抽引」加入手牌（一次性：从回收袋随机 1 张牌加入手牌）。',
    amuletEffect: 'persuade-grant-recycle-fetch',
  });

  pushCard({
    type: 'amulet',
    name: '战伤刻印',
    value: 1,
    image: starterAmuletDamageDiscoverImage,
    classCard: true,
    description: '每造成 10 次伤害（武器、护符、法术等任意来源对怪物造成伤害均计数），发现一张专属牌。',
    amuletEffect: 'damage-class-discover',
  });

  pushCard({
    type: 'amulet',
    name: '晕锤归袋符',
    value: 1,
    image: knightAmuletStunRecycleImage,
    classCard: true,
    description: '每击晕一次怪物，从回收袋随机取回两张牌到手牌。',
    amuletEffect: 'stun-recycle-to-hand',
  });

  pushCard({
    type: 'amulet',
    name: '磐石坚守符',
    value: 1,
    image: knightAmuletArmorHalveEndureImage,
    classCard: true,
    description: '每回合格挡耐久上限 +1。',
    amuletEffect: 'armor-halve-endure',
  });

  pushCard({
    type: 'amulet',
    name: '驯兽铸印',
    value: 1,
    image: persuadeAuraAmuletImage,
    classCard: true,
    description: '每次装备一个怪物时，选择：该装备栏永久攻击 +1 或 永久护甲 +1。',
    amuletEffect: 'monster-equip-buff',
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
    description: '超杀吸血 +1，生命上限 +6。',
    potionEffect: 'spell-lifesteal+1-maxhp+6',
  });

  // === NEW INSTANT MAGIC ===
  pushCard({
    type: 'magic',
    name: '魔物融合',
    value: 0,
    image: fusionScrollImage,
    classCard: true,
    description: '一次性：融合装备栏中同种族的怪物装备——2个融合为该种族的精英怪物装备（4耐久），3个Skeleton融合为「骷髅王」。融合后加入手牌。',
    magicType: 'instant',
    magicEffect: '融合装备栏中同种族的怪物装备。',
    knightEffect: 'monster-fusion',
  });

  pushCard({
    type: 'magic',
    name: '镜影摹形',
    value: 0,
    image: dedupeKnightMagicMirrorCopyImage,
    classCard: true,
    description: '一次性：选择左/右装备栏、护符栏或手牌中的一张牌，化身为该牌的复制并加入手牌。',
    magicType: 'instant',
    magicEffect: '选择一张牌，成为该牌的复制。',
    knightEffect: 'mirror-copy',
  });

  pushCard({
    type: 'magic',
    name: '蜕变赋灵',
    value: 0,
    image: knightScrollTransformGrantImage,
    classCard: true,
    description: '一次性：选择一张手牌，赋予「转型：随机获得坟场一张魔法卡」。',
    magicType: 'instant',
    magicEffect: '选择一张手牌赋予转型效果。',
    knightEffect: 'transform-grant',
  });

  pushCard({
    type: 'magic',
    name: '符位开辟',
    value: 0,
    image: salvageAmuletImage,
    classCard: true,
    description: '一次性：护符栏上限 +1。',
    magicType: 'instant',
    magicEffect: '护符栏上限 +1。',
    knightEffect: 'amulet-expand',
  });

  pushCard({
    type: 'magic',
    name: '不灭守护',
    value: 0,
    image: dedupeMagicUndeathGuardImage,
    classCard: true,
    description: '一次性：只能在受到致命伤害时打出，抵消该次伤害。',
    magicType: 'instant',
    magicEffect: '濒死时抵消致死伤害。',
    knightEffect: 'death-ward',
    maxUpgradeLevel: 2,
  });

  // === NEW PERMANENT MAGIC (2 cards) ===
  pushCard({
    type: 'magic',
    name: '护甲凝雷',
    value: 0,
    image: dedupeKnightMagicArmorStunConvertImage,
    classCard: true,
    description: '永久：选择一个护盾，每 1 点护甲值使击晕上限 +1%。',
    magicType: 'permanent',
    magicEffect: '护甲转化为击晕上限。',
    knightEffect: 'armor-stun-convert',
    maxUpgradeLevel: 1,
  });

  pushCard({
    type: 'magic',
    name: '淬炼冲击',
    value: 0,
    image: dedupeKnightMagicOverkillUpgradeImage,
    classCard: true,
    description: '永久：对一个怪物造成 3 点伤害。超杀：升级一张牌。',
    magicType: 'permanent',
    magicEffect: '造成 3 点伤害，超杀升级一张牌。',
    knightEffect: 'overkill-upgrade',
    recycleDelay: 1,
  });

  pushCard({
    type: 'magic',
    name: '紧急回收',
    value: 0,
    image: recallScrollImage,
    classCard: true,
    description: '永久：失去 2 点生命，回手一张牌，抽 1 张牌。',
    magicType: 'permanent',
    magicEffect: '失去 2 HP，回手一张牌，抽 1 张牌。',
    knightEffect: 'recall-equipment',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'magic',
    name: '锋刃侧击',
    value: 0,
    image: knightScrollBladeFlankImage,
    classCard: true,
    description: '永久：选择一个装备栏，对一个随机怪物造成该装备栏临时攻击的伤害。侧击：40% 击晕。',
    magicType: 'permanent',
    magicEffect: '临时攻击转化为伤害，侧击击晕。',
    knightEffect: 'temp-attack-strike',
    flankEffect: '40% 概率击晕目标',
    recycleDelay: 1,
  });

  pushCard({
    type: 'magic',
    name: '固壁侧守',
    value: 0,
    image: knightScrollFortifyFlankImage,
    classCard: true,
    description: '永久：选择一个装备，+3（每次使用后数值 +1）临时护甲。侧击：赋予该装备复生。',
    magicType: 'permanent',
    magicEffect: '+3(递增) 临时护甲，侧击赋予复生。',
    knightEffect: 'flank-fortify',
    flankEffect: '赋予该装备复生',
    recycleDelay: 1,
  });

  pushCard({
    type: 'magic',
    name: '利刃风暴',
    value: 0,
    image: knightScrollBladeStormImage,
    classCard: true,
    description:
      '永久：选择一把武器，对激活行所有怪物造成等同于该武器攻击力的法术伤害（不耗耐久），然后该武器栏临时攻击 -3。',
    magicType: 'permanent',
    magicEffect: '武器攻击力横扫全场，临时攻击 -3。',
    knightEffect: 'weapon-sweep',
    recycleDelay: 1,
  });

  pushCard({
    type: 'magic',
    name: '蜕变修复',
    value: 0,
    image: knightScrollTransformRepairImage,
    classCard: true,
    description: '永久：选择一个装备，恢复 1 耐久。转型：给该装备栏 +3 临时攻击（每次触发后数值 +1）。',
    magicType: 'permanent',
    magicEffect: '修复 1 耐久，转型 +3(递增) 临时攻击。',
    knightEffect: 'transform-repair',
    transformBonus: '给该装备栏 +3 临时攻击（每次触发后数值 +1）',
  });

  pushCard({
    type: 'magic',
    name: '际遇轮盘',
    value: 0,
    image: dedupeKnightMagicFortuneWheelImage,
    classCard: true,
    description: '永久：掷骰——25% 发现一张专属魔法卡，25% 抽 2 张牌，25% 删 1 张牌，25% 下次劝降概率 +20%。',
    magicType: 'permanent',
    magicEffect: '掷骰触发四种随机效果之一。',
    knightEffect: 'fortune-wheel',
    recycleDelay: 1,
  });

  pushCard({
    type: 'magic',
    name: '血契抽引',
    value: 0,
    image: knightMagicBloodDrawImage,
    classCard: true,
    description: '永久：失去 1 点生命，抽 3 张牌。',
    magicType: 'permanent',
    magicEffect: '失去 1 HP，抽 3 张牌。',
    knightEffect: 'blood-draw',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'magic',
    name: '锻造赌运',
    value: 0,
    image: knightMagicRepairEnrageDiceImage,
    classCard: true,
    description: '永久：选择一个装备和一个怪物，掷骰——80% 该装备 +1 耐久，20% 该怪物 -1 血层并激怒。',
    magicType: 'permanent',
    magicEffect: '掷骰：80% 修复装备，20% 怪物减层激怒。',
    knightEffect: 'repair-enrage-dice',
  });

  pushCard({
    type: 'magic',
    name: '血祭裁决',
    value: 0,
    image: dedupeKnightMagicMissingHpSmiteImage,
    classCard: true,
    description: '永久：选择一个怪物，失去一半剩余生命值，对该怪物造成失去血量 ×2 的伤害。',
    magicType: 'permanent',
    magicEffect: '失去半血，造成双倍伤害。',
    knightEffect: 'blood-sacrifice-strike',
  });

  // === NEW HERO MAGIC (2 cards) ===
  pushCard({
    type: 'hero-magic',
    name: '灭世裁决',
    value: 0,
    image: monsterDoomScrollImage,
    classCard: true,
    description: '装备的怪物数量为数值条（上限 4）。释放：摧毁所有装备，每摧毁一个装备对激活行所有怪物 -2攻/-2血上限（每个血层都减）。',
    heroMagicId: 'monster-doom',
    heroMagicEffect: '英雄魔法：解锁或触发灭世裁决。',
  });

  pushCard({
    type: 'hero-magic',
    name: '复生秘典',
    value: 0,
    image: dedupeKnightHeroReviveTomeImage,
    classCard: true,
    description: '每对自己造成 3 次伤害充满数值条。释放：失去 3 点生命，选择一个装备赋予复生（首次毁坏时以 1 耐久复活）。',
    heroMagicId: 'revive-blessing',
    heroMagicEffect: '英雄魔法：解锁或触发复生祝福。',
  });

  // === CLASS SHIELD ===
  pushCard({
    type: 'shield',
    name: '猛击之盾',
    value: 2,
    image: heavyShieldKnightBashImage,
    classCard: true,
    description: '可拖动到怪物上猛击（不造成伤害），5%×护甲值 概率击晕。每回合不限次数，有耐久即可使用。',
    durability: 4,
    maxDurability: 4,
    armorMax: 2,
    shieldBashStunRate: 5,
    shieldBashUnlimited: true,
  });

  pushCard({
    type: 'shield',
    name: '坚韧磐盾',
    value: 3,
    image: knightShieldEnduranceImage,
    classCard: true,
    description: '该护盾每回合可消耗的耐久上限 +1（怪物回合最多消耗 2 耐久）。怪物攻击该护盾后死亡时，耐久度回满。',
    equipBlockDurabilityBonus: 1,
    shieldRefillOnMonsterDeath: true,
    durability: 3,
    maxDurability: 3,
    armorMax: 3,
  });

  // === CLASS POTION ===
  pushCard({
    type: 'potion',
    name: '连劝秘药',
    value: 0,
    image: knightChainPersuadePotionImage,
    classCard: true,
    description: '获得永恒护符：连续劝降同一个怪物时，每次累计成功概率 +15%。',
    potionEffect: 'perm-persuade-consecutive',
  });

  pushCard({
    type: 'potion',
    name: '铸锋药剂',
    value: 0,
    image: knightEquipEmpowerPotionImage,
    classCard: true,
    description: '获得永久护符：当装备上装备时，该装备栏获得 3 临时攻击和 3 临时护甲。',
    potionEffect: 'perm-equip-empower',
  });

  pushCard({
    type: 'potion',
    name: '唤回秘药',
    value: 0,
    image: knightPotionRecycleGrantImage,
    classCard: true,
    description: '选择一张手牌，赋予「转型：从回收袋随机取 1 张牌加入手牌」。',
    potionEffect: 'transform-recycle-grant',
  });

  // === CLASS WEAPONS ===
  pushCard({
    type: 'weapon',
    name: '汰换之刃',
    value: 2,
    image: knightExchangeBladeImage,
    classCard: true,
    description: '入场：该装备栏永久攻击 +1。遗言：该装备栏永久护甲 +1。',
    durability: 3,
    maxDurability: 3,
    onEquipEffect: 'perm-slot-damage+1',
    onDestroyPermanentShield: 1,
  });

  pushCard({
    type: 'weapon',
    name: '怒斩之刃',
    value: 4,
    image: knightRageCleaveImage,
    classCard: true,
    description: '该武器每回合可攻击 2 次（攻击次数 +1）。每次攻击时，所有怪物攻击力 -1。',
    durability: 3,
    maxDurability: 3,
    weaponExtraAttack: 1,
    onAttackDebuffAllMonsterAttack: 1,
  });

  pushCard({
    type: 'weapon',
    name: '共鸣之刃',
    value: 4,
    image: knightWeaponResonanceBladeImage,
    classCard: true,
    description: '每次攻击时，给另一个装备栏 +2 临时攻击，并恢复其装备 1 点耐久。',
    onAttackBuffOtherSlotTempAttack: 2,
    onAttackRepairOtherSlot: 1,
    durability: 2,
    maxDurability: 2,
  });

  pushCard({
    type: 'magic',
    name: '精华萃取',
    value: 0,
    image: dedupeMagicArcaneRefineImage,
    classCard: true,
    magicType: 'permanent',
    magicEffect: '永久魔法：移除一张手牌（从游戏中删除），根据移除的牌类型获得装备栏永久加成。',
    description: '移除一张手牌。一次性魔法→左栏攻击+1；装备→右栏攻击+1；护符→右栏护甲+1；怪物/药水→左栏护甲+1。',
    knightEffect: 'essence-extract',
    recycleDelay: 2,
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

/** 劝降归袋符：劝降成功时加入手牌的一次性魔法。 */
export const createPersuadeRecycleFetchMagicCard = (): KnightCardData => ({
  id: createDynamicKnightCardId('persuade-recycle-fetch'),
  type: 'magic',
  name: '归袋抽引',
  value: 0,
  image: knightScrollBagFetchImage,
  classCard: true,
  description: '一次性：从回收袋随机 1 张牌加入手牌。',
  magicType: 'instant',
  magicEffect: '从回收袋随机 1 张牌加入手牌。',
  knightEffect: 'recycle-random-to-hand',
});

export const createGraveyardRecallCard = (): GameCardData => {
  const id = createDynamicKnightCardId('graveyard-recall');
  return {
    id,
    type: 'magic',
    name: '冥途拾遗',
    value: 0,
    image: dedupeMagicUnderworldRelicImage,
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
  image: dedupeKnightMagicGreedCurseImage,
  classCard: true,
  description: '永久：使用或弃置时失去 3 金币，瀑布后才能再次使用。',
  magicType: 'permanent',
  magicEffect: '使用或弃置失去 3 金币。',
  knightEffect: 'greed-curse',
  isCurse: true,
});