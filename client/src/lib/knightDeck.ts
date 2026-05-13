import { type GameCardData } from '@/components/GameCard';
import { CHAOS_DICE_SPELL_DESCRIPTION, CHAOS_DICE_SPELL_MAGIC_EFFECT } from '@/lib/knightChaosDiceCopy';
import type { RngState } from '@/game-core/rng';
import { shuffle as rngShuffle, nextId } from '@/game-core/rng';
import { STARTER_CARD_IDS } from '@/game-core/deck';
import { applyDerivedCardText } from '@/game-core/card-schema/card-text';

// Import images for Knight cards
import holyBladeImage from '@assets/generated_images/holy_light_blade.png';
import swiftDaggerKnightImage from '@assets/generated_images/card_dedupe_weapon_swift_knight.png';
import swiftDaggerSoulHunterImage from '@assets/generated_images/card_dedupe_weapon_swift_soul_hunter.png';
import thunderHammerImage from '@assets/generated_images/thunder_warhammer.png';
import ironTowerShieldImage from '@assets/generated_images/iron_tower_shield.png';
import thornedShieldImage from '@assets/generated_images/thorned_reflect_shield.png';
import guardianShieldImage from '@assets/generated_images/guardian_holy_shield.png';
import knightScholarShieldImage from '@assets/generated_images/knight_scholar_shield.png';
import knightScholarBladeImage from '@assets/generated_images/knight_scholar_blade.png';
import dedupeKnightHeroHolyLightImage from '@assets/generated_images/card_dedupe_knight_hero_magic_holy_light.png';
import dedupeKnightHeroBerserkerImage from '@assets/generated_images/card_dedupe_knight_hero_magic_berserker.png';
import dedupeKnightMagicBloodGreedImage from '@assets/generated_images/card_dedupe_knight_magic_blood_greed.png';
import dedupeKnightMagicDeadPactImage from '@assets/generated_images/card_dedupe_knight_magic_dead_pact.png';
import dedupeKnightMagicArmorPierceImage from '@assets/generated_images/card_dedupe_knight_magic_armor_pierce.png';
import dedupeKnightMagicBattleSpiritImage from '@assets/generated_images/card_dedupe_knight_magic_battle_spirit.png';
import dedupeKnightMagicMissingHpSmiteImage from '@assets/generated_images/card_dedupe_knight_magic_missing_hp_smite.png';
import dedupeKnightMagicGraveNovaImage from '@assets/generated_images/card_dedupe_knight_magic_grave_nova.png';
import dedupeKnightMagicBerserkGambitImage from '@assets/generated_images/card_dedupe_knight_magic_berserk_gambit.png';
import dedupeKnightMagicDeckJudgeImage from '@assets/generated_images/card_dedupe_knight_magic_deck_judge.png';
import dedupeKnightMagicRecycleFlareImage from '@assets/generated_images/card_dedupe_knight_magic_recycle_flare.png';
import dedupeKnightMagicChaosDiceImage from '@assets/generated_images/card_dedupe_knight_magic_chaos_dice.png';
import dedupeKnightMagicFateSightImage from '@assets/generated_images/card_dedupe_knight_magic_fate_sight.png';
import dedupeKnightMagicMirrorCopyImage from '@assets/generated_images/card_dedupe_knight_magic_mirror_copy.png';
import dedupeKnightMagicCleanseDrawImage from '@assets/generated_images/card_dedupe_knight_magic_soft_waterfall.png';
import dedupeKnightMagicRecycleTideImage from '@assets/generated_images/card_dedupe_magic_waterfall_reset.png';
import dedupeKnightMagicPersuadeBladeImage from '@assets/generated_images/card_dedupe_magic_equivalent_exchange.png';
import dedupeKnightMagicArmorStunConvertImage from '@assets/generated_images/card_dedupe_knight_magic_armor_stun_convert.png';
import dedupeKnightMagicOverkillUpgradeImage from '@assets/generated_images/card_dedupe_knight_magic_overkill_upgrade.png';
import dedupeKnightHeroReviveTomeImage from '@assets/generated_images/card_dedupe_knight_hero_magic_revive_tome.png';
import greedCurseImage from '@assets/generated_images/card_curse_greed.png';
import bloodCurseSealImage from '@assets/generated_images/card_curse_blood_seal.png';
import frenzyCurseImage from '@assets/generated_images/card_curse_frenzy.png';
import dedupeMagicUnderworldRelicImage from '@assets/generated_images/card_dedupe_magic_underworld_relic.png';
import dualguardAmuletImage from '@assets/generated_images/chibi_dualguard_amulet.png';
import thunderAmuletSigilImage from '@assets/generated_images/card_dedupe_amulet_thunder_sigil.png';
import knightDeleteDrawAmuletImage from '@assets/generated_images/knight_delete_draw_amulet.png';
import thunderGoldAmuletImage from '@assets/generated_images/knight_thunder_gold_amulet.png';
import starterAmuletDamageDiscoverImage from '@assets/generated_images/starter_amulet_damage_discover.png';
import knightSpellRuneInscriptionAmuletImage from '@assets/generated_images/knight_spell_rune_inscription_amulet.png';
import knightAmuletStunRecycleImage from '@assets/generated_images/knight_amulet_stun_recycle.png';
import knightSoulDevourAmuletImage from '@assets/generated_images/knight_soul_devour_amulet.png';
// TODO(art): replace with dedicated `knight_mirror_copy_summon_amulet.png` once
// artwork lands (the granted 「镜影摹形」 still reuses `dedupeKnightMagicMirrorCopyImage`).
import knightMirrorCopySummonAmuletImage from '@assets/generated_images/knight_mirror_copy_summon_amulet.png';
import potionArcaneInfusionImage from '@assets/generated_images/cute_potion_arcane_infusion.png';
import potionBackpackExpandImage from '@assets/generated_images/cute_potion_backpack_expand.png';
import persuadeHammerImage from '@assets/generated_images/knight_persuade_hammer.png';
import thunderStunHammerImage from '@assets/generated_images/knight_thunder_stun_hammer.png';
import reviveBoneShieldImage from '@assets/generated_images/knight_revive_bone_shield.png';
import evolvingShieldImage from '@assets/generated_images/knight_evolving_shield.png';
import guardianLinkShieldImage from '@assets/generated_images/knight_guardian_link_shield.png';
import salvageAmuletImage from '@assets/generated_images/knight_salvage_amulet.png';
import bloodrageAmuletImage from '@assets/generated_images/knight_bloodrage_amulet.png';
import knightSelfDamageDrawAmuletImage from '@assets/generated_images/knight_self_damage_draw_amulet.png';
import persuadeAuraAmuletImage from '@assets/generated_images/knight_persuade_aura_amulet.png';
import monsterEquipBuffAmuletImage from '@assets/generated_images/knight_monster_equip_buff_amulet.png';
import statSwapPotionImage from '@assets/generated_images/knight_stat_swap_potion.png';
import lifestealPotionImage from '@assets/generated_images/knight_lifesteal_potion.png';
import persuadeScrollAmuletDedupeImage from '@assets/generated_images/knight_persuade_recycle_amulet.png';
import fusionScrollImage from '@assets/generated_images/knight_fusion_scroll.png';
import recallScrollImage from '@assets/generated_images/knight_recall_scroll.png';
import monsterDoomScrollImage from '@assets/generated_images/knight_monster_doom_scroll.png';
import heavyShieldKnightBashImage from '@assets/generated_images/knight_bash_shield.png';
import knightChainPersuadePotionImage from '@assets/generated_images/knight_potion_chain_persuade.png';
import knightVitalityPotionImage from '@assets/generated_images/cute_potion_concentrated_heal.png';
import knightEquipEmpowerPotionImage from '@assets/generated_images/knight_potion_equip_empower.png';
import knightEquipOverclockPotionImage from '@assets/generated_images/knight_potion_equip_overclock.png';
import knightAmplifyPotionImage from '@assets/generated_images/knight_potion_amplify.png';
import knightPotionFrenzyDiscoverImage from '@assets/generated_images/knight_potion_frenzy_discover.png';
import knightExchangeBladeImage from '@assets/generated_images/knight_weapon_exchange_blade.png';
import knightGrowthBladeImage from '@assets/generated_images/knight_growth_blade.png';
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
import dedupeStarterMagicMissileImage from '@assets/generated_images/knight_magic_missile_crossbow.png';
import dedupeStarterThunderStrikeImage from '@assets/generated_images/card_dedupe_starter_thunder_strike.png';
import knightShieldEnduranceImage from '@assets/generated_images/knight_shield_endurance.png';
import knightGrowthShieldImage from '@assets/generated_images/knight_growth_shield.png';
import knightAmuletArmorHalveEndureImage from '@assets/generated_images/knight_amulet_armor_halve_endure.png';
import knightMagicRepairEnrageDiceImage from '@assets/generated_images/knight_magic_repair_enrage_dice.png';
import dedupeMagicUndeathGuardImage from '@assets/generated_images/card_dedupe_magic_undeath_guard.png';
import knightPotionRecycleGrantImage from '@assets/generated_images/card_dedupe_potion_haste_draw.png';
import dedupeMagicArcaneRefineImage from '@assets/generated_images/card_dedupe_magic_arcane_refine.png';
import starterScrollEternalInscribeImage from '@assets/generated_images/starter_scroll_eternal_inscribe.png';
import thunderstrikeBastionShieldImage from '@assets/generated_images/knight_thunderstrike_bastion_shield.png';
import communalDefenseShieldImage from '@assets/generated_images/knight_communal_defense_shield.png';
import knightManualRecycleAmuletImage from '@assets/generated_images/knight_manual_recycle_amulet.png';
import knightMineBuildingImage from '@assets/generated_images/knight_mine_building.png';
import knightKillMineAmuletImage from '@assets/generated_images/knight_kill_mine_amulet.png';
import knightThunderArrayBladeImage from '@assets/generated_images/knight_thunder_array_blade.png';
import knightBarrageShieldImage from '@assets/generated_images/knight_barrage_shield.png';
import graveyardGuardianAmuletImage from '@assets/generated_images/knight_graveyard_guardian_amulet.png';
import dedupeStarterCombatRallyImage from '@assets/generated_images/card_dedupe_starter_combat_rally.png';

// Migrated starter-pool amulets (originally part of `createStarterCardPool`,
// now sourced from the class deck via 「专属护符发现」). These keep their
// original `STARTER_CARD_IDS.X` ids so:
//   - The starter:{id} on-upgrade handlers (in
//     `card-schema/definitions/upgrades.ts`) continue to route correctly.
//   - `STARTER_CARD_IDS` exports stay valid for downstream tests.
//   - `getStarterBaseId()` strips cloned ids back to the canonical key.
import dedupeStarterAmuletLoneImage from '@assets/generated_images/card_dedupe_starter_amulet_lone.png';
import starterAmuletPersuadeDiscountImage from '@assets/generated_images/starter_amulet_persuade_discount.png';
import starterAmuletMissileImage from '@assets/generated_images/starter_amulet_missile.png';
import starterAmuletSwapUpgradeImage from '@assets/generated_images/starter_amulet_swap_upgrade.png';
import starterAmuletStunCapImage from '@assets/generated_images/starter_amulet_stun_cap.png';
import starterAmuletRecycleExpandImage from '@assets/generated_images/starter_amulet_recycle_expand.png';
import starterAmuletDungeonGoldImage from '@assets/generated_images/starter_amulet_dungeon_gold.png';
// 潮愈之符 复用永恒护符·潮涌回春的 PNG（视觉同主题）。
import starterAmuletWaterfallHealImage from '@assets/generated_images/relic_waterfall_heal.png';
import flipLifestealAmuletImage from '@assets/generated_images/knight_flip_lifesteal_amulet.png';
import equipAmuletCapImage from '@assets/generated_images/knight_equip_amulet_cap_amulet.png';
import stunDiscoverAmuletImage from '@assets/generated_images/knight_stun_discover_amulet.png';

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
  // NB: `unique?: boolean` is declared on the parent `GameCardData` (in
  // `@/components/GameCard`) so consumers like `ClassDeck.tsx` and
  // `CardDetailsModal.tsx` can read `card.unique` without narrowing.
}

export function generateKnightDeck(rng: RngState): [KnightCardData[], RngState] {
  const deck: KnightCardData[] = [];
  let id = 0;
  let currentRng = rng;

  const knightNextId = () => `knight-${id++}`;
  const pushCard = (card: Omit<KnightCardData, 'id'>) => {
    deck.push({ ...card, id: knightNextId() });
  };

  // === WEAPONS (3 cards) ===
  pushCard({
    type: 'weapon',
    name: '圣光之刃',
    value: 6,
    image: holyBladeImage,
    classCard: true,
    description: '入场：恢复 3 点生命。每次攻击时恢复 2 点生命。',
    shortDescription: '入场+3生命；攻击+2生命',
    onEquipEffect: 'heal-3',
    healOnAttack: 2,
    durability: 2,
    maxDurability: 2,
    knightEffect: 'holy-blade',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'weapon',
    name: '疾风短剑',
    value: 3,
    image: swiftDaggerKnightImage,
    classCard: true,
    description: '入场：所有装备栏临时攻击 +2。用此武器杀死怪物时耐久度回满。',
    shortDescription: '入场全栏 +2 临时攻；杀怪回满耐久',
    onEquipEffect: 'all-temp-attack-2',
    durability: 2,
    maxDurability: 2,
    restoreDurabilityOnKill: true,
    knightEffect: 'swift-dagger',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'weapon',
    name: '碎雷战锤',
    value: 3,
    image: thunderHammerImage,
    classCard: true,
    description: '每次攻击永久增加该装备栏 +1 伤害。',
    shortDescription: '每次攻击该栏永久 +1 伤害',
    weaponBonus: 1,
    durability: 1,
    maxDurability: 1,
    knightEffect: 'thunder-hammer',
    maxUpgradeLevel: 2,
  });

  // === SHIELDS (3 cards) ===
  pushCard({
    type: 'shield',
    name: '铁壁塔盾',
    value: 5,
    image: ironTowerShieldImage,
    classCard: true,
    description: '完全格挡一次攻击的全部伤害，无论攻击力多高。损毁后进入回收袋。',
    shortDescription: '完全格挡一次攻击的全部伤害',
    durability: 1,
    maxDurability: 1,
    armorMax: 5,
    permEquipment: true,
    knightEffect: 'fullBlock',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'shield',
    name: '棘刺反盾',
    value: 4,
    image: thornedShieldImage,
    classCard: true,
    description: '格挡时反弹一半的攻击伤害给攻击者（向上取整），并加上该装备栏的永久攻击和临时攻击。',
    shortDescription: '格挡时反弹一半伤害+本栏攻击',
    reflectHalfDamage: true,
    durability: 2,
    maxDurability: 2,
    armorMax: 4,
    knightEffect: 'thorned-shield',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'shield',
    name: '守护圣盾',
    value: 3,
    image: guardianShieldImage,
    classCard: true,
    description: '完美格挡时（攻击≤护甲值），50% 概率本次格挡不消耗护甲值（掷骰判定）。',
    shortDescription: '完美格挡时 50% 不耗护甲值',
    shieldPerfectBlockArmorSaveChance: 50,
    durability: 2,
    maxDurability: 2,
    armorMax: 3,
    knightEffect: 'guardian-shield',
    maxUpgradeLevel: 2,
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
    shortDescription: '完美格挡时该装备栏永久护甲+1',
    amuletEffect: 'dual-guard',
  });

  pushCard({
    type: 'amulet',
    name: '雷霆符印',
    value: 1,
    image: thunderAmuletSigilImage,
    classCard: true,
    description: '每弃置一张牌到坟场，对激活行随机怪物造成 3 点伤害。',
    shortDescription: '每弃置 1 张，对随机怪物造成 3 伤',
    amuletEffect: 'discard-zap',
  });

  // 殒雷符（unique）：每击杀一只怪物，立刻在该 cell 生成 2 个「地雷」幽灵建筑。
  // 跟「布雷术」生成的同款（每个 5 点纯伤、ghost、踩到即触发 + 进坟场，受「引雷阵锋」
  // globalMineDamageBonus 加成）。任何来源击杀都触发（武器 / magic / 反震 /
  // 遗言伤害 / 地雷自己），cell 已被占（stack-pop / swarm-buglet / 瀑流后续）
  // 时 2 个地雷堆叠在上面（顶层为最新地雷，stack 包含原 occupant + 第一枚地雷）。
  // 后续怪物落到该 cell 时，waterfall.ts 的「同 cell 堆叠地雷连环引爆」逻辑
  // 自动让 2 枚地雷依次触发并依次结算伤害。
  // 触发实现：reducer.ts postProcessActiveCards step 3.5 检测
  // `prev?.defeatProcessed === true && curr !== prev`，与 swarm spawn 同 pattern。
  pushCard({
    type: 'amulet',
    name: '殒雷符',
    value: 1,
    image: knightKillMineAmuletImage,
    classCard: true,
    unique: true,
    description: '每击杀一只怪物，立刻在该位置生成 2 个「地雷」（每个 5 点纯伤，受「引雷阵锋」加成；该位置已有卡时堆叠在上）。',
    shortDescription: '击杀怪物 → 该位置生成 2 个地雷',
    amuletEffect: 'kill-cell-mine',
  });

  // 灵魂吞噬（unique）：每次受到伤害（HP 实际减少时），可从坟场放逐 1 张卡。
  // 复用「虚灵刀」的 ghost blade exile 弹窗机制（GraveyardExileModal +
  // BEGIN_GHOST_BLADE_EXILE reducer），只是 banner / log 文案换成「灵魂吞噬放逐...」。
  // 触发点：reduceApplyDamage 在 result.appliedDamage > 0 时 emit
  // combat:ghostBladeExile（payload.source='amulet'）。完美格挡 / tempShield 全收 /
  // 不灭守护抵消 等 appliedDamage===0 场景天然不触发。坟场为空时静默跳过。
  pushCard({
    type: 'amulet',
    name: '灵魂吞噬',
    value: 1,
    image: knightSoulDevourAmuletImage,
    classCard: true,
    unique: true,
    description: '每次受到伤害（HP 实际减少时），可从坟场选择 1 张卡牌移除出游戏。被盾完美格挡时不触发。',
    shortDescription: '受伤时，可从坟场放逐卡',
    amuletEffect: 'soul-devour',
  });

  // === POTIONS (2 cards) ===
  pushCard({
    type: 'potion',
    name: '奥术灌注',
    value: 0,
    image: potionArcaneInfusionImage,
    classCard: true,
    description: '掷骰 D20：1-7 翻倍左装备栏的永久攻击与永久护甲；8-14 翻倍右装备栏的永久攻击与永久护甲；15-20 翻倍永久法术伤害与超杀吸血。',
    shortDescription: '掷骰：左/右装备栏永久攻防 或 法术伤害与超杀吸血 翻倍',
    potionEffect: 'dice-arcane-infusion',
  });

  pushCard({
    type: 'potion',
    name: '无尽背袋灵药',
    value: 0,
    image: potionBackpackExpandImage,
    classCard: true,
    description: '选择一项效果：护符上限+1 / 左装备栏+1 / 右装备栏+1 / 背包+3。',
    shortDescription: '四选一：护符 / 左栏 / 右栏 / 背包 扩容',
    potionEffect: 'dice-backpack-expand',
  });

  // === HERO MAGIC (2 cards) ===
  pushCard({
    type: 'hero-magic',
    name: '圣光秘术',
    value: 0,
    image: dedupeKnightHeroHolyLightImage,
    classCard: true,
    unique: true,
    description: '第一次使用时解锁圣光；已掌握时充满数值槽，可手动发动。',
    shortDescription: '解锁圣光；已掌握时充满数值槽',
    heroMagicId: 'holy-light',
    heroMagicEffect: '英雄魔法：解锁或触发圣光。',
  });

  pushCard({
    type: 'hero-magic',
    name: '狂战秘典',
    value: 0,
    image: dedupeKnightHeroBerserkerImage,
    classCard: true,
    unique: true,
    description: '第一次使用时解锁狂战；已掌握时充满数值槽，可手动发动。',
    shortDescription: '解锁狂战；已掌握时充满数值槽',
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
    shortDescription: '获得 ＝ 已损失生命的金币；生成贪婪诅咒',
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
    description: '一次性：从坟场随机获得两张怪物牌，加入手牌。',
    shortDescription: '从坟场随机获得 2 张怪物牌',
    magicType: 'instant',
    magicEffect: '从坟场随机获得两张怪物牌。',
    knightEffect: 'monster-recruit',
  });

  pushCard({
    type: 'magic',
    name: '铠甲贯刺',
    value: 0,
    image: dedupeKnightMagicArmorPierceImage,
    classCard: true,
    description: '永久：选择一件护甲装备，对目标怪物造成等同护甲值 100% 的伤害。',
    shortDescription: '一件护甲值 100% 转化为伤害',
    magicType: 'permanent',
    magicEffect: '护甲值 100% 转化为伤害。',
    knightEffect: 'armor-strike',
    maxUpgradeLevel: 1,
  });

  pushCard({
    type: 'magic',
    name: '残血终焉',
    value: 0,
    image: dedupeKnightMagicMissingHpSmiteImage,
    classCard: true,
    description: '永久：对一名怪物造成等同当前已损失生命值 50% 的伤害。',
    shortDescription: '伤害 ＝ 已损失生命 50%',
    magicType: 'permanent',
    magicEffect: '以失去生命 50% 为伤害。',
    knightEffect: 'missing-hp-smite',
    maxUpgradeLevel: 2,
  });

  // 血誓回卷：永久（Perm 2）。失去 3 HP，选择 active row 中一张「已翻转」卡牌
  // （即被 _flipBackCard 标记的翻面后状态），将其翻回原始形态。
  // 上手：恢复 1 HP（受 maxHp 限制）。
  pushCard({
    type: 'magic',
    name: '血誓回卷',
    value: 0,
    image: dedupeKnightHeroReviveTomeImage,
    classCard: true,
    description: '永久：失去 3 生命，选择当前行一张「已翻转」卡牌，将其翻回原始形态。\n上手：恢复 1 生命。',
    shortDescription: '失去 3 生命，翻回 1 张已翻转卡；上手 +1 生命',
    magicType: 'permanent',
    magicEffect: '将一张已翻转的牌翻回去。',
    knightEffect: 'flip-back-active',
    onEnterHandEffect: 'blood-oath-scroll-onhand',
    recycleDelay: 2,
    maxUpgradeLevel: 0,
  });

  // 永恒之器：永久（Perm 2）。失去 3 HP，生命上限永久 +3。无目标，立即结算。
  // Echo: -HP 与 +maxHp 双双按 echoMultiplier 等比放大（与 血誓回卷 一致）。
  // 自伤走 APPLY_DAMAGE selfInflicted（同 血誓回卷 / 血金术）：可被护盾抵消、
  // 可被 death-ward 救场、亦可在 hp ≤ cost 时致死，跟现有自伤卡语义对齐。
  pushCard({
    type: 'magic',
    name: '永恒之器',
    value: 0,
    image: dedupeKnightHeroReviveTomeImage,
    classCard: true,
    unique: true,
    description: '永久：失去 3 生命，生命上限永久 +3。',
    shortDescription: '失去 3 生命，生命上限永久 +3',
    magicType: 'permanent',
    magicEffect: '永久魔法：失去 3 生命，生命上限永久 +3。',
    knightEffect: 'eternal-vessel',
    recycleDelay: 2,
    maxUpgradeLevel: 0,
  });

  pushCard({
    type: 'magic',
    name: '坟火新星',
    value: 0,
    image: dedupeKnightMagicGraveNovaImage,
    classCard: true,
    description: '永久：当此牌被弃置时，对当前行所有怪物造成 3 点伤害。',
    shortDescription: '弃置时对当前行所有怪物 3 伤',
    magicType: 'permanent',
    magicEffect: '被弃置时爆炸伤害。',
    knightEffect: 'grave-nova',
    maxUpgradeLevel: 1,
  });

  // 三牌惊雷 (Perm 2)：若打出时背包正好有 3 张牌，对所有怪物造成 9 点法术伤害；
  // 否则消耗本牌但不造成任何伤害（play_full_cost_noop）。
  // 上手：每次此牌进入手牌时，对所有怪物各造成 1 点法术伤害。
  pushCard({
    type: 'magic',
    name: '三牌惊雷',
    value: 0,
    image: dedupeKnightMagicGraveNovaImage,
    classCard: true,
    description: '永久：若背包正好有 3 张牌，对所有怪物造成 9 点法术伤害。\n上手：对所有怪物各造成 1 点法术伤害。',
    shortDescription: '背包恰 3 张时全场 9 法伤；上手全场 1 法伤',
    magicType: 'permanent',
    magicEffect: '背包恰好 3 张时全场 9 点法伤；上手全场 1 点法伤。',
    knightEffect: 'three-card-thunder',
    onEnterHandEffect: 'three-card-thunder-onhand',
    recycleDelay: 2,
    maxUpgradeLevel: 0,
  });

  // 整顿背囊 (Perm 2)：背包上限永久 +2，然后从手牌/护符栏/装备栏中至多
  // 选 3 张牌放回背包顶部（受新背包剩余空间约束，可以一张都不选）。
  // 装备/护符直接被取走，不触发 lastWords / 转金币 / 任何破损流程。
  pushCard({
    type: 'magic',
    name: '整顿背囊',
    value: 0,
    image: potionBackpackExpandImage,
    classCard: true,
    description: '永久：背包上限 +2，然后从手牌、护符栏或装备栏中选择至多 3 张牌放回背包顶部。装备/护符不会触发任何破损或转化效果。',
    shortDescription: '背包+2；至多 3 张牌放回背包顶部',
    magicType: 'permanent',
    magicEffect: '背包上限 +2；选至多 3 张牌放回背包顶部。',
    knightEffect: 'reorganize-backpack',
    recycleDelay: 2,
    maxUpgradeLevel: 0,
  });

  pushCard({
    type: 'magic',
    name: '孤注一掷',
    value: 0,
    image: dedupeKnightMagicBerserkGambitImage,
    classCard: true,
    description: '一次性：生命降至 1，每个武器栏可多攻击2 次。',
    shortDescription: '生命降至 1；每个武器栏多攻击2 次',
    magicType: 'instant',
    magicEffect: '降血换取每栏额外攻击。',
    knightEffect: 'berserk-gambit',
    maxUpgradeLevel: 3,
  });

  pushCard({
    type: 'magic',
    name: '战意激发',
    value: 0,
    image: dedupeKnightMagicBattleSpiritImage,
    classCard: true,
    description: '一次性：选择一个装备栏，本回合（持续到下次瀑流）该栏每英雄回合可多攻击 1 次，且每怪物回合格挡耐久上限 +1。',
    shortDescription: '本回合：所选装备栏多攻击 1 次、格挡耐久 +1',
    magicType: 'instant',
    magicEffect: '选定装备栏激发战意。',
    knightEffect: 'battle-spirit',
    maxUpgradeLevel: 1,
  });

  pushCard({
    type: 'magic',
    name: '命数裁断',
    value: 0,
    image: dedupeKnightMagicDeckJudgeImage,
    classCard: true,
    description:
      '一次性：翻看主牌堆顶 6 张牌；每有一张怪物牌须删除一张牌，每有一张 Event 左右装备栏临时攻击+2，每有一张装备则装备耐久+1，每有一张 Magic 永久法术伤害+1，每有一张 Potion +2HP。',
    shortDescription: '透视牌堆顶 6 张，按类型获得增益或惩罚',
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
    unique: true,
    nonCopyable: true,
    description: '永久：回收袋洗回背包（所有牌剩余瀑流 -1），然后抽 1 张牌。(可超手牌上限)',
    shortDescription: '回收袋剩余瀑流 -1；抽 1 张',
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
    shortDescription: '掷骰：五种随机效果之一',
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
    description: '永久：翻看主牌堆顶 4 张牌，如果其中没有怪物牌，则下次劝降成功率 +70%。',
    shortDescription: '翻 4 张：无怪物 → 下次劝降率 +70%',
    magicType: 'permanent',
    magicEffect: '透视牌堆顶 4 张，无怪物则获劝降率加成。',
    knightEffect: 'fate-sight',
    recycleDelay: 1,
    maxUpgradeLevel: 1,
  });


  // === NEW WEAPONS (2 cards) ===
  pushCard({
    type: 'weapon',
    name: '感化之锤',
    value: 2,
    image: persuadeHammerImage,
    classCard: true,
    description: '每次攻击一次，下次劝降成功概率 +20%。',
    shortDescription: '每次攻击下次劝降率 +20%',
    persuadeBoostOnHit: 20,
    durability: 3,
    maxDurability: 3,
    knightEffect: 'persuade-hammer',
    maxUpgradeLevel: 1,
  });

  pushCard({
    type: 'weapon',
    name: '雷击碎骨锤',
    value: 3,
    image: thunderStunHammerImage,
    classCard: true,
    description: '入场：击晕上限 +5%。击晕率60%。攻击击晕的怪物时造成双倍伤害（先判定击晕，本次击晕也会触发翻倍）。',
    shortDescription: '入场击晕上限 +5%；击晕率 60%；击晕怪物伤害翻倍（含本次击晕）',
    weaponStunChance: 60,
    doubleDamageOnStunned: true,
    onEquipEffect: 'stunCap+5',
    durability: 2,
    maxDurability: 2,
    knightEffect: 'thunder-stun-hammer',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'weapon',
    name: '噬魂猎刃',
    value: 5,
    image: swiftDaggerSoulHunterImage,
    classCard: true,
    description: '超杀：将回收袋 2 张牌移到手上。',
    shortDescription: '超杀：回收袋 2 张牌入手',
    overkillRecycleToHand: 2,
    durability: 2,
    maxDurability: 2,
    knightEffect: 'soul-hunter-blade',
    maxUpgradeLevel: 2,
  });

  // 引雷阵锋：每消耗 1 点耐久，将「全场地雷伤害 +N」累加到 globalMineDamageBonus
  // —— 永久不撤销（修复耐久不撤销 bonus、武器损毁也保留）。配合「布雷术」/
  // 「地雷」（card_dedupe_knight_magic_grave_nova）使用：玩家用本武器攻击 → 耐久
  // 减少 → 全场已存在 + 之后生成的所有地雷被怪物触发时伤害都按新 bonus 算。
  // - 升级缩放：lvl 0 → 2，lvl 1 → 2，lvl 2 → 3。
  // - 升级幅度：lvl 0 (3 攻 / 2 耐) → lvl 1 (3 攻 / 3 耐) → lvl 2 (3 攻 / 3 耐 +
  //   bonus 2 → 3)。
  // - 触发覆盖路径：computeDurabilityLossEffects（武器攻击 tick / 盾自伤）+
  //   蓄能裂击 + 等价交换 + MODIFY_EQUIPMENT_DURABILITY（负 delta）。
  pushCard({
    type: 'weapon',
    name: '引雷阵锋',
    value: 3,
    image: knightThunderArrayBladeImage,
    classCard: true,
    description: '每消耗 1 点耐久，全场地雷伤害永久 +2（不撤销）。',
    shortDescription: '耐久 -1：全场地雷伤害永久 +2',
    knightEffect: 'thunder-array-blade',
    mineDamageBoostPerDur: 2,
    durability: 2,
    maxDurability: 2,
    maxUpgradeLevel: 2,
  });

  // === NEW SHIELDS (3 cards) ===
  pushCard({
    type: 'shield',
    name: '不朽骨盾',
    value: 3,
    image: reviveBoneShieldImage,
    classCard: true,
    description: '复生（首次摧毁恢复 1 耐久）。遗言：该装备栏永久伤害 +1。',
    shortDescription: '复生 1 次；遗言：本栏永久 +1 伤害',
    hasEquipmentRevive: true,
    onDestroyPermanentDamage: 1,
    durability: 2,
    maxDurability: 2,
    armorMax: 3,
    knightEffect: 'revive-bone-shield',
    maxUpgradeLevel: 1,
  });

  pushCard({
    type: 'shield',
    name: '进化甲壁',
    value: 3,
    image: evolvingShieldImage,
    classCard: true,
    description: '格挡 4 次后自动升级（护甲 +2、耐久 +1、耐久上限 +1）。',
    shortDescription: '格挡 4 次后自动升级',
    shieldBlockAutoUpgradeCount: 4,
    durability: 2,
    maxDurability: 2,
    armorMax: 3,
    knightEffect: 'evolving-shield',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'shield',
    name: '守望者之盾',
    value: 4,
    image: guardianLinkShieldImage,
    classCard: true,
    description: '格挡时，另一个装备栏获得临时护甲（等同此盾护甲值）。',
    shortDescription: '格挡时另一栏 +临时护甲（＝本盾护甲）',
    blockGrantTempArmorToOther: true,
    durability: 2,
    maxDurability: 2,
    armorMax: 4,
    knightEffect: 'guardian-link-shield',
    maxUpgradeLevel: 2,
  });

  // 雷震守护盾 — 高护甲、低耐久；摧毁时永久击晕上限 +8%（封顶 100%）。\
  // 复用既有 stunCap+N 解析约定：onDestroyEffect: 'stunCap+8' 由四条遗言路径统一识别。\
  pushCard({
    type: 'shield',
    name: '雷震守护盾',
    value: 8,
    image: thunderstrikeBastionShieldImage,
    classCard: true,
    description: '遗言：击晕上限 +8%（封顶 100%）。',
    shortDescription: '遗言：击晕上限 +8%',
    onDestroyEffect: 'stunCap+8',
    durability: 1,
    maxDurability: 1,
    armorMax: 8,
    knightEffect: 'thunder-guard-shield',
    maxUpgradeLevel: 2,
  });

  // 共御圣盾 — 复生 + 双段遗言：1 耐久、复生一次后才进入遗言；\
  // 摧毁时所有装备栏 +4 临时护甲。复用既有 allSlotTempArmor:N 事件令牌约定，\
  // 在四条遗言摧毁路径中统一解析。\
  pushCard({
    type: 'shield',
    name: '共御圣盾',
    value: 6,
    image: communalDefenseShieldImage,
    classCard: true,
    description: '复生（首次摧毁恢复 1 耐久）。遗言：所有装备栏 +4 临时护甲。',
    shortDescription: '复生 1 次；遗言：全栏 +4 临时护甲',
    hasEquipmentRevive: true,
    onDestroyEffect: 'allSlotTempArmor:4',
    durability: 1,
    maxDurability: 1,
    armorMax: 6,
    knightEffect: 'communal-defense-shield',
    maxUpgradeLevel: 2,
  });

  // 生长之盾 — 装备时每次卡牌翻转触发一次按卡名累计的 +1 增幅；
  // 遗言：从坟场随机抽出一张 Event 加入手牌（无 Event 则静默失败）。
  pushCard({
    type: 'shield',
    name: '生长之盾',
    value: 2,
    image: knightGrowthShieldImage,
    classCard: true,
    description: '装备时：每发生一次卡牌翻转，该护盾增幅一次（按卡名累计 +1 护甲）。遗言：从坟场随机抽出一张 Event 加入手牌。',
    shortDescription: '每次卡牌翻转 +1 护甲；遗言：随机入手 1 张坟场 Event',
    amplifyOnFlip: true,
    onDestroyEffect: 'graveyard-event-to-hand',
    durability: 4,
    maxDurability: 4,
    armorMax: 2,
    knightEffect: 'growth-shield',
    maxUpgradeLevel: 2,
  });

  // 弹幕护盾 — 完美格挡时直接将 2 张「魔弹」加入手牌（手牌已满则静默丢弃）。
  // 走 createMagicBoltCard + applyAmplifyOnCreate（与魔弹连弩 / 魔法飞弹 / 弹幕之符 一致），
  // 让新生成的「魔弹」继承当前 amplifiedCardBonus['魔弹'] 累计加成。
  // 实现位置：rules/combat.ts 完美格挡判定块（dual-guard 之后、blockGrantTempArmorToOther 之前）。
  // 升级：L1 护甲 4→6（耐久不变，效果不变）；L2 perfectBlockSpawnMissiles 2→3（护甲/耐久不变）。
  pushCard({
    type: 'shield',
    name: '弹幕护盾',
    value: 4,
    image: knightBarrageShieldImage,
    classCard: true,
    unique: true,
    description: '完美格挡时，将 2 张「魔弹」直接加入手牌（手牌已满则静默丢弃），新生成的魔弹会继承全局魔弹增幅。',
    shortDescription: '完美格挡 → 入手 2 张魔弹',
    perfectBlockSpawnMissiles: 2,
    durability: 3,
    maxDurability: 3,
    armorMax: 4,
    knightEffect: 'barrage-shield',
    maxUpgradeLevel: 2,
  });

  // 智者圣盾 — 4 护甲 / 2 耐久。入场：从背包抽 2 张牌（onEquipEffect: 'draw-2'）。
  // 遗言：从背包抽 2 张牌（onDestroyDraw: 2）。两条都走标准
  // 「DRAW_CARDS source: 'backpack'」入口：
  //   - 入场：equipment.ts 注册的 'draw-2' 处理器（PLAY_CARD / EQUIP_FROM_HAND
  //     / 拖动入栏 三条路径都走 executeOnEquip，自动尊重背包「置顶」优先级）。
  //   - 遗言：equipment-effects.ts:428 既有 onDestroyDraw 累加路径，cards.ts:1734 /
  //     1850 enqueue DRAW_CARDS。同 starter「守护之盾」(STARTER_CARD_IDS.guardianShield)
  //     的成熟基建。
  // 升级：L1 onEquipEffect 'draw-2' → 'draw-3'，onDestroyDraw 2 → 3（护甲 / 耐久不变）。
  pushCard({
    type: 'shield',
    name: '智者圣盾',
    value: 4,
    image: knightScholarShieldImage,
    classCard: true,
    description: '入场：从背包抽 2 张牌。遗言：从背包抽 2 张牌。',
    shortDescription: '入场抽 2 张；遗言抽 2 张',
    onEquipEffect: 'draw-2',
    onDestroyDraw: 2,
    durability: 2,
    maxDurability: 2,
    armorMax: 4,
    knightEffect: 'scholar-shield',
    maxUpgradeLevel: 1,
  });

  // === NEW AMULETS (3 cards) ===
  pushCard({
    type: 'amulet',
    name: '残骸回收符',
    value: 1,
    image: salvageAmuletImage,
    classCard: true,
    description: '装备摧毁时，改为回到手牌，耐久上限-1（减到0时从游戏里删掉），耐久回到1。',
    shortDescription: '装备摧毁改为回手牌，耐久上限 -1',
    amuletEffect: 'equipment-salvage',
  });

  pushCard({
    type: 'amulet',
    name: '血怒战符',
    value: 1,
    image: bloodrageAmuletImage,
    classCard: true,
    description: '每次对自己造成伤害时，所有装备栏临时攻击 +3。',
    shortDescription: '每次自伤，全栏 +3 临时攻击',
    amuletEffect: 'bloodrage-attack',
  });

  pushCard({
    type: 'amulet',
    name: '赎血召牌符',
    value: 1,
    image: knightSelfDamageDrawAmuletImage,
    classCard: true,
    description: '每次对自己造成伤害时，从背包随机抽 2 张牌（受手牌上限约束）。',
    shortDescription: '每次自伤，从背包抽 2 张牌',
    amuletEffect: 'self-damage-draw',
  });

  pushCard({
    type: 'amulet',
    name: '怀柔之印',
    value: 1,
    image: persuadeAuraAmuletImage,
    classCard: true,
    description: '每获得一次临时攻击或临时护甲加成，下一次劝降率 +10%。',
    shortDescription: '每次获得临时攻/护，下次劝降率 +10%',
    amuletEffect: 'persuade-on-temp-attack',
    maxUpgradeLevel: 1,
  });

  pushCard({
    type: 'amulet',
    name: '劝降归袋符',
    value: 1,
    image: persuadeScrollAmuletDedupeImage,
    classCard: true,
    description: '每劝降一次，将一张「归袋抽引」加入手牌（一次性：从回收袋随机 1 张牌加入手牌）。',
    shortDescription: '每次劝降，入手 1 张「归袋抽引」',
    amuletEffect: 'persuade-grant-recycle-fetch',
    maxUpgradeLevel: 1,
  });

  pushCard({
    type: 'amulet',
    name: '咒纹刻印',
    value: 1,
    image: knightSpellRuneInscriptionAmuletImage,
    classCard: true,
    description: '每使用 5 张瞬发魔法（Instant magic），发现一张专属牌。',
    shortDescription: '每使用 5 张瞬发魔法，发现 1 张专属',
    amuletEffect: 'magic-class-discover',
  });

  pushCard({
    type: 'amulet',
    name: '晕锤归袋符',
    value: 1,
    image: knightAmuletStunRecycleImage,
    classCard: true,
    description: '每击晕一次怪物，从回收袋随机取回两张牌到手牌。',
    shortDescription: '每击晕怪物 1 次，回收袋 2 张牌入手',
    amuletEffect: 'stun-recycle-to-hand',
  });

  pushCard({
    type: 'amulet',
    name: '磐石坚守符',
    value: 1,
    image: knightAmuletArmorHalveEndureImage,
    classCard: true,
    description: '每回合格挡耐久上限 +1。',
    shortDescription: '每回合格挡耐久上限 +1',
    amuletEffect: 'armor-halve-endure',
  });

  pushCard({
    type: 'amulet',
    name: '驯兽铸印',
    value: 1,
    image: monsterEquipBuffAmuletImage,
    classCard: true,
    description: '每次装备一个怪物时，该装备栏永久攻击 +1，永久护甲 +1，并立即恢复 1 点耐久（不超过耐久上限）。',
    shortDescription: '装备怪物时本栏永久 +1 攻 / +1 护 / 恢复 1 耐久',
    amuletEffect: 'monster-equip-buff',
  });

  pushCard({
    type: 'amulet',
    name: '雷金护符',
    value: 1,
    image: thunderGoldAmuletImage,
    classCard: true,
    description: '每击晕一次怪物，金币 +10，然后移除该怪物的击晕状态。同时击晕多个怪物，则按怪物数量多次触发。',
    shortDescription: '每击晕怪物 1 次，金币 +10 并解除击晕',
    amuletEffect: 'stun-gold',
  });

  pushCard({
    type: 'amulet',
    name: '招灵书印',
    value: 1,
    image: knightDeleteDrawAmuletImage,
    classCard: true,
    description: '每删除或销毁一张牌（含护符/装备被事件、魔法、瀑流销毁），从背包随机抽 2 张牌。',
    shortDescription: '每删除/销毁 1 张牌，背包抽 2 张',
    amuletEffect: 'delete-draw',
  });

  // 墓园守卫：装备的遗言额外多触发 1 次（含自然破损与顶替/弃装重铸/灵魂置换 等）。
  // 多个本护符线性叠加：N 个 → 每次基础触发都会再多触发 N 次（共 1 + N 次）。
  // 与「墓语遗愿」等已经按次叠加的机制兼容（每次基础触发都按 1 + N 放大）。
  pushCard({
    type: 'amulet',
    name: '墓园守卫',
    value: 1,
    image: graveyardGuardianAmuletImage,
    classCard: true,
    unique: true,
    description: '装备的遗言每次触发时，额外多触发 1 次（多张本护符线性叠加）。',
    shortDescription: '装备遗言每次多触发 1 次',
    amuletEffect: 'last-words-extra-trigger',
  });

  // 循手之符 — 每"手动"拖卡到回收袋累计：2 张抽 1。
  // 仅手动事件（waitsOverride === 1 标记）触发：
  //   - 装备栏 / 护符栏 → 回收袋（拖动）
  //   - 手牌 → 回收袋（拖动）
  // 不算的事件（系统层路径）：
  //   - 出 Perm 卡后自动入袋（如 净册涌泉 / 凡化咒 / 战血之印 等）
  //   - 装备耐久归零进回收袋（永恒铭刻装备）
  //   - 护符被事件 / 容量缩减销毁进回收袋
  //   - 瀑流溢出
  //   - 「专属召唤」/「汰旧迎新」/「洗册待回」等 magic 卡的"系统层弃手牌"
  // 多件叠加跨阈值仍只抽 1 张（与 积蓄之符 一致），无升级。
  pushCard({
    type: 'amulet',
    name: '循手之符',
    value: 1,
    image: knightManualRecycleAmuletImage,
    classCard: true,
    description: '每手动拖动 2 张牌到回收袋，从背包抽 1 张牌。仅"手动拖动"触发，出牌自回收 / 装备销毁 / 瀑流溢出等系统路径不算。',
    shortDescription: '每手动拖 2 张到回收袋，背包抽 1 张',
    amuletEffect: 'manual-recycle-draw',
  });

  // 影摹召引符 (unique) — 每抽 12 张「背包 → 手牌」抽牌（含 standard draw +
  // PROCESS_AUTO_DRAWS + waterfall-draw-2 + 各 resolver 直调）入手一张
  // 「镜影摹形」。streak 字段：state.mirrorCopySummonStreak（达 12 后 %= 12）。
  // 入手卡走 createMirrorCopySummonCard(rng) 生成，knightEffect: 'mirror-copy' 既有 resolver 处理交互流程。
  // 多份叠加：每次抽牌 +N（progress counter ×N stacking），unique=true 限制牌库内 1 张。
  pushCard({
    type: 'amulet',
    name: '影摹召引符',
    value: 1,
    image: knightMirrorCopySummonAmuletImage,
    classCard: true,
    unique: true,
    nonCopyable: true,
    description: '每抽 12 张牌，将一张「镜影摹形」加入手牌。',
    shortDescription: '每抽 12 张，入手 1 张「镜影摹形」',
    amuletEffect: 'mirror-copy-summon',
  });

  // === MIGRATED STARTER AMULETS (12 cards) ===
  //
  // These were previously in `createStarterCardPool` (game-core/deck.ts) and
  // available via the first-row 「护符发现」 event tied to `discoverStarterAmulet`.
  // They have been moved into the class deck so the first-row event now
  // discovers a class amulet (「专属护符发现」 → `discoverClassAmulet`).
  //
  // ID-stability contract:
  //   - We push these directly into `deck` (bypassing `pushCard`) so the
  //     existing `STARTER_CARD_IDS.X` ids are preserved verbatim.
  //   - On-upgrade handlers in `card-schema/definitions/upgrades.ts` are
  //     registered under `starter:${STARTER_CARD_IDS.X}`. Because
  //     `getStarterBaseId(card.id)` strips clone suffixes back to the
  //     starter id, those handlers continue to fire correctly even after
  //     `cloneClassCardWithFreshId` rewrites the id.
  //   - `unique` flag stays `undefined` (none of these are unique).
  //
  // Each amulet is run through `applyDerivedCardText` so that
  // `description` / `shortDescription` / `magicEffect` come from the
  // registered formatter (mirroring what `createStarterCardPool` does for
  // the starter pool, since these cards' formatters are keyed under
  // `starter:${STARTER_CARD_IDS.X}`).
  //
  // Behavior is unchanged — the cards still resolve via the same
  // `amuletEffect: '<id>'` registry entries in `equipment.ts`.
  const pushAmulet = (card: GameCardData) => {
    deck.push(applyDerivedCardText(card) as KnightCardData);
  };
  pushAmulet({
    id: STARTER_CARD_IDS.loneCardAmulet,
    type: 'amulet',
    name: '孤注之符',
    value: 0,
    image: dedupeStarterAmuletLoneImage,
    classCard: true,
    amuletEffect: 'lone-card',
    shortDescription: '瀑流时若背包仅 1 张：获得 1 张职业牌',
  });

  pushAmulet({
    id: STARTER_CARD_IDS.attackPersuadeAmulet,
    type: 'amulet',
    name: '降服之符',
    value: 0,
    image: starterAmuletPersuadeDiscountImage,
    classCard: true,
    amuletEffect: 'attack-persuade-discount',
    shortDescription: '每次攻击下次劝降费用 -3（可叠加）',
  });

  pushAmulet({
    id: STARTER_CARD_IDS.cardGainMissileAmulet,
    type: 'amulet',
    name: '弹幕之符',
    value: 0,
    image: starterAmuletMissileImage,
    classCard: true,
    amuletEffect: 'card-gain-missile',
    shortDescription: '每次从坟场获牌：入手 2 张「魔弹」',
  });

  pushAmulet({
    id: STARTER_CARD_IDS.damageClassDiscoverAmulet,
    type: 'amulet',
    name: '战痕之符',
    value: 0,
    image: starterAmuletDamageDiscoverImage,
    classCard: true,
    amuletEffect: 'damage-class-discover',
    shortDescription: '每造成 8 次伤害：发现 1 张专属',
  });

  pushAmulet({
    id: STARTER_CARD_IDS.swapUpgradeAmulet,
    type: 'amulet',
    name: '流转之符',
    value: 0,
    image: starterAmuletSwapUpgradeImage,
    classCard: true,
    amuletEffect: 'swap-upgrade',
    description: '每交换 3 次位置，升级 1 张牌。',
    shortDescription: '每交换 3 次位置：升级 1 张牌',
  });

  pushAmulet({
    id: STARTER_CARD_IDS.stunUpgradeCapAmulet,
    type: 'amulet',
    name: '震慑之符',
    value: 0,
    image: starterAmuletStunCapImage,
    classCard: true,
    amuletEffect: 'stun-upgrade-cap',
  });

  pushAmulet({
    id: STARTER_CARD_IDS.recycleBackpackExpandAmulet,
    type: 'amulet',
    name: '积蓄之符',
    value: 0,
    image: starterAmuletRecycleExpandImage,
    classCard: true,
    amuletEffect: 'recycle-backpack-expand',
    shortDescription: '每回收 8 张牌：背包上限 +3',
  });

  pushAmulet({
    id: STARTER_CARD_IDS.dungeonGoldAmulet,
    type: 'amulet',
    name: '拾荒之符',
    value: 0,
    image: starterAmuletDungeonGoldImage,
    classCard: true,
    amuletEffect: 'dungeon-gold',
    shortDescription: '每处理 1 张地城牌：+1 金币',
  });

  pushAmulet({
    id: STARTER_CARD_IDS.waterfallHealAmulet,
    type: 'amulet',
    name: '潮愈之符',
    value: 0,
    image: starterAmuletWaterfallHealImage,
    classCard: true,
    amuletEffect: 'waterfall-heal',
    description: '每次瀑流推进时，恢复 ⌊回收袋张数 ÷ 4⌋ 点生命（多个叠加：每件独立计算）。计算发生在牌洗回背包之前。',
    shortDescription: '每次瀑流：恢复 ⌊回收袋÷4⌋ 生命（叠加）',
  });

  pushAmulet({
    id: STARTER_CARD_IDS.flipOverkillLifestealAmulet,
    type: 'amulet',
    name: '翻血之符',
    value: 0,
    image: flipLifestealAmuletImage,
    classCard: true,
    amuletEffect: 'flip-overkill-lifesteal',
    description: '每翻转 5 张牌，超杀吸血永久 +1。',
    shortDescription: '每翻转 5 张牌：超杀吸血永久 +1',
  });

  pushAmulet({
    id: STARTER_CARD_IDS.equipAmuletCapAmulet,
    type: 'amulet',
    name: '集甲之符',
    value: 0,
    image: equipAmuletCapImage,
    classCard: true,
    amuletEffect: 'equip-amulet-cap',
    description: '每装备 6 个装备，护符栏上限 +1。',
    shortDescription: '每装备 6 件装备：护符栏上限 +1',
  });

  pushAmulet({
    id: STARTER_CARD_IDS.stunAttemptDiscoverAmulet,
    type: 'amulet',
    name: '眩学之符',
    value: 0,
    image: stunDiscoverAmuletImage,
    classCard: true,
    amuletEffect: 'stun-attempt-discover',
    description: '每尝试击晕 4 次，发现一张专属牌。',
    shortDescription: '每尝试击晕 4 次：发现 1 张专属',
  });

  // === NEW POTIONS (2 cards) ===
  pushCard({
    type: 'potion',
    name: '乾坤颠倒药',
    value: 0,
    image: statSwapPotionImage,
    classCard: true,
    description: '选择一个装备栏，将其永久攻击与永久护甲互换，临时攻击与临时护甲也互换。',
    shortDescription: '选一栏：永久&临时攻击/护甲互换',
    potionEffect: 'swap-slot-damage-shield',
  });

  pushCard({
    type: 'potion',
    name: '暗夜吸血药',
    value: 0,
    image: lifestealPotionImage,
    classCard: true,
    description: '超杀吸血 +1，生命上限 +6。',
    shortDescription: '超杀吸血 +1；生命上限 +6',
    potionEffect: 'spell-lifesteal+1-maxhp+6',
  });

  pushCard({
    type: 'potion',
    name: '装备超频药',
    value: 1,
    image: knightEquipOverclockPotionImage,
    classCard: true,
    unique: true,
    description: '一次性：获得永恒护符「装备超频」。光环：当回收袋牌数 > 10 时，装备槽中的装备效果额外触发 1 次；牌数 ≤ 10 立即失效。',
    shortDescription: '获得永恒护符「装备超频」',
    potionEffect: 'grant-eternal-relic-equip-overclock',
  });

  // === NEW INSTANT MAGIC ===
  pushCard({
    type: 'magic',
    name: '魔物融合',
    value: 0,
    image: fusionScrollImage,
    classCard: true,
    description: '一次性：从装备栏 / 手牌 / 背包中选择同种族的怪物装备进行融合——2个同种族融合为该种族的Lv3精英怪物装备（4耐久），3个Skeleton融合为「骷髅王」。被消耗的怪物全部进入坟场，融合产物加入手牌。',
    shortDescription: '选择同种族怪物装备进行融合',
    magicType: 'instant',
    magicEffect: '从装备栏 / 手牌 / 背包选择同种族怪物装备融合。',
    knightEffect: 'monster-fusion',
  });

  pushCard({
    type: 'magic',
    name: '镜影摹形',
    value: 0,
    image: dedupeKnightMagicMirrorCopyImage,
    classCard: true,
    description: '一次性：选择左/右装备栏、护符栏或手牌中的一张牌，化身为该牌的复制并加入手牌。',
    shortDescription: '化身为所选牌的复制入手',
    magicType: 'instant',
    magicEffect: '选择一张牌，成为该牌的复制。',
    knightEffect: 'mirror-copy',
  });

  // 回炉重造 (unique Instant magic): 失去 ⌊hp/2⌋ HP，强制将所有手牌（含诅咒、
  // 含 Perm 牌）经 DELETE_CARD（destination: 'graveyard'）送入坟场——和 Shop
  // 「删除」(`kw='delete'`) 语义一致：绕过 perm-routing-on-discard 的回收袋分流，
  // 自然触发「招灵书印」(delete-draw amulet)、不触发 APPLY_DISCARD_EFFECTS。
  // 然后按 N = 被删张数 链式发现等量专属牌（BEGIN_DISCOVER + pendingClassDiscoverQueue），
  // 全部以 delivery: 'hand-first' 直接进入手牌（hand 满才回退到背包 → 回收袋）。
  // 不参与法术回响（resolver 忽略 echoMultiplier；isEchoTriggered 时 banner 提示
  // 「本卡不参与回响」，doubleNextMagic 仍被引擎前置消费）。
  pushCard({
    type: 'magic',
    name: '回炉重造',
    value: 0,
    image: dedupeKnightMagicCleanseDrawImage,
    classCard: true,
    unique: true,
    description: '一次性：失去 ⌊当前生命 ÷ 2⌋ 点生命，删除所有手牌（含诅咒，强制送入坟场），然后发现等量的专属牌（直接加入手牌）。',
    shortDescription: '失去半血；删除全部手牌；发现等量专属牌进入手牌',
    magicType: 'instant',
    magicEffect: '即时魔法：失去半血，删除手牌，发现等量专属牌（直接进入手牌）。',
    knightEffect: 'forge-reborn',
  });

  pushCard({
    type: 'magic',
    name: '蜕变赋灵',
    value: 0,
    image: knightScrollTransformGrantImage,
    classCard: true,
    description: '一次性：选择一张手牌，赋予「转型：失去 3 点生命，随机获得坟场一张魔法卡」。',
    shortDescription: '为一张手牌赋予转型效果',
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
    shortDescription: '护符栏上限 +1',
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
    shortDescription: '濒死时抵消该次致命伤害',
    magicType: 'instant',
    magicEffect: '濒死时抵消致死伤害。',
    knightEffect: 'death-ward',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'magic',
    name: '永恒铭刻',
    value: 0,
    image: starterScrollEternalInscribeImage,
    classCard: true,
    description: '一次性使用，选择一张没有 Perm 属性的手牌，赋予 Perm 3（被移除后经 3 次瀑流返回背包）。',
    shortDescription: '为一张手牌赋予 Perm 3',
    magicType: 'instant',
    magicEffect: '即时魔法：选择一张没有 Perm 属性的手牌，赋予 Perm 3。',
    knightEffect: 'perm-grant',
  });

  pushCard({
    type: 'magic',
    name: '凡化咒',
    value: 0,
    image: dedupeMagicArcaneRefineImage,
    classCard: true,
    description: '一次性：移除手牌中所有卡牌的 Perm 属性（包括永久魔法、永久装备、Perm N 计数）。',
    shortDescription: '清除全部手牌的 Perm 属性',
    magicType: 'instant',
    magicEffect: '即时魔法：清除所有手牌的 Perm 属性。',
    knightEffect: 'strip-perm-hand',
  });

  // === NEW PERMANENT MAGIC (2 cards) ===
  pushCard({
    type: 'magic',
    name: '护甲凝雷',
    value: 0,
    image: dedupeKnightMagicArmorStunConvertImage,
    classCard: true,
    description: '永久：选择一个护盾，每 1 点护甲值使击晕上限 +1%。',
    shortDescription: '所选护盾每 1 护甲，击晕上限 +1%',
    magicType: 'permanent',
    magicEffect: '护甲转化为击晕上限。',
    knightEffect: 'armor-stun-convert',
    maxUpgradeLevel: 1,
  });

  // 雷涌一击 (Perm 1)：对一个怪物造成 ⌈击晕上限/4⌉ 点法术伤害（基于 state.stunCap，
  // 升 1 后改为 ⌈击晕上限/3⌉），单次 60% 击晕（与所有击晕一致受 stunCap 上限约束），
  // 然后抽 1 张牌。回响：伤害 ×N，抽牌 ×N，击晕掷骰仍只发生一次。
  pushCard({
    type: 'magic',
    name: '雷涌一击',
    value: 0,
    image: dedupeStarterThunderStrikeImage,
    classCard: true,
    description: '永久：对一个怪物造成 ⌈击晕上限/4⌉ 点法术伤害，60% 击晕（受击晕上限约束），然后抽 1 张牌。',
    shortDescription: '⌈晕上限/4⌉ 法伤；60% 晕；抽 1',
    magicType: 'permanent',
    magicEffect: '电涌：晕上限 1/4 法伤 + 60% 晕 + 抽 1。',
    knightEffect: 'stun-cap-strike',
    recycleDelay: 1,
    maxUpgradeLevel: 1,
  });

  // 弃装重铸 (Perm 2)：对所有装备生效——左右栏的主装备 + 每一件下层 reserve
  // 都算独立一件。每件独立判定复生：没复生就摧毁（遗言照常触发），复生的
  // 留在原层 1 耐久。每一件（含复生）都触发一次专属发现，依次弹窗。
  pushCard({
    type: 'magic',
    name: '弃装重铸',
    value: 0,
    image: dedupeKnightMagicGraveNovaImage,
    classCard: true,
    description:
      '永久：对左右装备栏每一件装备（含下层叠加）独立生效——没复生的摧毁，复生的留在原层 1 耐久。每件装备发现一张专属牌（依次弹窗）。装备的遗言照常触发。',
    shortDescription: '摧毁所有装备，每件装备（含下层）：发现 1 张专属牌',
    magicType: 'permanent',
    magicEffect: '对所有装备（含下层 reserve）各发现一张专属牌，并尝试摧毁；复生在原层 1 耐久。',
    knightEffect: 'discard-rebuild',
    recycleDelay: 2,
    maxUpgradeLevel: 0,
  });

  pushCard({
    type: 'magic',
    name: '盾影双噬',
    value: 0,
    image: dedupeKnightMagicArmorPierceImage,
    classCard: true,
    description: '永久：选择一件护甲装备，对当前行所有怪物各造成 50% 护甲值的法术伤害，然后该装备耐久 -1。',
    shortDescription: '50% 护甲法伤全场；该装备耐久 -1',
    magicType: 'permanent',
    magicEffect: '护甲值 50% 伤害全场，装备耐久 -1。',
    knightEffect: 'armor-double-strike',
    recycleDelay: 1,
    maxUpgradeLevel: 2,
  });

  // 连环转律 (唯一)：造成 X 点法术伤害，X 为此前连续转型的次数（含本牌）。
  // 同类型连出会断链 → 0 伤害。resolver 在 card-schema/definitions/magic.ts 的
  // `knight:transform-streak-strike` 处理（按 knightEffect 路由，跳过 magicEffect）。
  pushCard({
    type: 'magic',
    name: '连环转律',
    value: 0,
    image: dedupeStarterCombatRallyImage,
    classCard: true,
    unique: true,
    description: '造成 X 点法术伤害，X 为此前连续转型的次数（含本牌）。同类型连出会断链。',
    shortDescription: '伤害 ＝ 连续转型次数',
    magicType: 'permanent',
    magicEffect: '伤害 = 连续转型链长度，同类型断链。',
    knightEffect: 'transform-streak-strike',
    recycleDelay: 2,
    maxUpgradeLevel: 0,
  });

  pushCard({
    type: 'magic',
    name: '淬炼冲击',
    value: 0,
    image: dedupeKnightMagicOverkillUpgradeImage,
    classCard: true,
    description: '永久：对一个怪物造成 3 点伤害。超杀：升级一张牌。',
    shortDescription: '3 点伤害；超杀升级 1 张牌',
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
    unique: true,
    description: '永久：失去 2 点生命，回手一张牌，抽 1 张牌。',
    shortDescription: '失去 2 生命，回手 1 张，抽 1 张',
    magicType: 'permanent',
    magicEffect: '失去 2 HP，回手一张牌，抽 1 张牌。',
    knightEffect: 'recall-equipment',
    maxUpgradeLevel: 2,
  });

  // 净册涌泉 (Perm 1)：选择一张手牌删除（手牌为空则跳过），然后从坟场发现一张牌
  // （三选一），加入手牌。触发的删除走 CONFIRM_DELETE_CARD（kw='delete'），
  // 与「招灵书印」护符 (delete-draw) 能够叠加：每次删除还会额外从背包抽 2 张。
  // 法术回响（B 类）：连续触发 N 次「删 1 + 坟场发现 1」。
  pushCard({
    type: 'magic',
    name: '净册涌泉',
    value: 0,
    image: dedupeKnightMagicCleanseDrawImage,
    classCard: true,
    description: '永久：选择一张手牌删除（手牌为空则跳过），从坟场发现一张牌（三选一），加入手牌。',
    shortDescription: '删 1 张手牌；坟场发现 1 张（3 选 1）',
    magicType: 'permanent',
    magicEffect: '删 1 张手牌；坟场发现一张牌（3 选 1）加入手牌。',
    knightEffect: 'cleanse-draw',
    recycleDelay: 1,
  });

  // 洗册归川 (Perm 1)：将背包所有牌移入永久魔法回收袋；然后整袋瀑流 -1，
  // 已就绪的（_recycleWaits ≤ 0）洗回背包。刚从背包进入的牌默认 waits=1，
  // 经此次 -1 后立即回背包（净效果：背包圆圈往返一圈），同时把回收袋里
  // 已有的永久魔法卡推进一步。法术回响（C 类）：连跑两次没有额外效果。
  pushCard({
    type: 'magic',
    name: '洗册归川',
    value: 0,
    image: dedupeKnightMagicRecycleTideImage,
    classCard: true,
    unique: true,
    nonCopyable: true,
    description: '永久：将背包所有牌移入回收袋；然后回收袋瀑流 -1，已就绪的牌洗回背包。',
    shortDescription: '背包→回收袋；回收袋瀑流 -1，就绪回背包',
    magicType: 'permanent',
    magicEffect: '永久魔法：背包→回收袋；瀑流 -1，已就绪的牌回背包。',
    knightEffect: 'recycle-tide',
    recycleDelay: 1,
    maxUpgradeLevel: 0,
  });

  // 辞剑相易 (Perm 1)：将「下次劝降率」转化为左右装备栏各 ⌈X/3⌉ 临时攻击。
  // X 必须严格等于英雄卡角标 “下次劝降 +X%” 的显示值（GameBoard.tsx:8263 /
  // HeroCard.tsx:54），即四个分量之和：
  //   X = persuadeAmuletBonus            (临时；护符 / 部分 magic / equipment 累积；清空)
  //     + persuadeDiscount.rateBonus     (临时；event 际遇轮盘 / 部分 magic 给的；清 rateBonus
  //                                       但保留 costReduction)
  //     + permanentPersuadeBonus         (永久；保留；来源：怪物战利品 persuadeRateBonus)
  //     + (persuadeLevel - 1) * 5        (永久；保留；来源：persuadeLevel+1 系事件
  //                                       例如 威压交涉 / 永誓低吟 / 怀柔圣殿)
  // 法术回响（C 类）跑第二次时，临时部分已经被清，X 退化成「permanentPersuadeBonus +
  // (persuadeLevel - 1) * 5」；若玩家有任一永久加成，第二次仍能转化出额外临时攻击。
  pushCard({
    type: 'magic',
    name: '辞剑相易',
    value: 0,
    image: dedupeKnightMagicPersuadeBladeImage,
    classCard: true,
    description: '永久：将「下次劝降 +X%」转化为左右装备栏各 ⌈X/3⌉ 临时攻击，并清空临时劝降率（永久部分保留）。',
    shortDescription: '下次劝降 +X% → 双栏各 ⌈X/3⌉ 临攻；清临时',
    magicType: 'permanent',
    magicEffect: '永久魔法：下次劝降 +X% 转化成双栏各 ⌈X/3⌉ 临时攻击；清空临时劝降加成。',
    knightEffect: 'persuade-to-temp-attack',
    recycleDelay: 1,
    maxUpgradeLevel: 0,
  });

  pushCard({
    type: 'magic',
    name: '锋刃侧击',
    value: 0,
    image: knightScrollBladeFlankImage,
    classCard: true,
    description: '永久：选择一个装备栏，对一个随机怪物造成（该装备栏永久攻击 + 临时攻击）的伤害。侧击：40% 击晕。',
    shortDescription: '该栏永久攻击+临时攻击作伤害；侧击 40% 击晕',
    magicType: 'permanent',
    magicEffect: '永久攻击+临时攻击转化为伤害，侧击击晕。',
    knightEffect: 'temp-attack-strike',
    flankEffect: '40% 概率击晕目标',
    recycleDelay: 1,
  });

  pushCard({
    type: 'magic',
    name: '锋芒倍增',
    value: 0,
    image: knightScrollBladeFlankImage,
    classCard: true,
    description: '永久：选择一个装备栏，临时攻击 +1，然后该栏临时攻击翻倍。',
    shortDescription: '该栏临时攻击 +1 后翻倍',
    magicType: 'permanent',
    magicEffect: '临时攻击 +1 后翻倍。',
    knightEffect: 'temp-attack-double',
    recycleDelay: 1,
  });

  // 池中坚意 (Perm 1)：选择一个装备栏（允许空槽），按 floor(回收袋牌数 / divisor) 加永久护甲。
  // - divisor = 4 (Lv0) / 3 (Lv1)
  // - 这张卡从手牌打出 → 进回收袋（recycleDelay: 1）；slot-select 结算时本卡仍在
  //   pendingMagicAction（不在 recycleBag），所以读到的回收袋数不含本卡——与
  //   「池中惊雷」(recycle-bolt) 同语义。
  // - Echo C 类（重读 state）和 A 类（× echoMultiplier）此处数值等价（slot-select
  //   结算之间 recycleBag 不变）。实现走 A 类单次乘 × echoMultiplier，与 囊中锋意
  //   / temp-attack-double 同 pattern。
  // - 跟 装甲铸蚀（event-armor-etch）同口径：buff 写到 equipmentSlotBonuses[slotId]
  //   .shield（永久护甲槽位加成），跨瀑流 / 跨回合不清零，空槽选了之后该栏永久
  //   保留这份加成，未来装备进来仍生效。
  // - 修改 equipmentSlotBonuses[slotId].shield 后必须调 applySlotArmorBonusDelta
  //   让 armor 立即刷到新 cap（详见 shield-armor-vs-durability.mdc）。
  // - knightEffect id `recycle-temp-armor` 是历史命名，语义已改为永久护甲；
  //   不重命名以减少跨文件改动面（types union / 测试 / formatter / upgrades）。
  pushCard({
    type: 'magic',
    name: '池中坚意',
    value: 0,
    image: knightScrollFortifyFlankImage,
    classCard: true,
    description: '永久：选择一个装备栏，回收袋每 4 张牌 +1 永久护甲。',
    shortDescription: '所选栏 +回收袋数÷4 永久护甲',
    magicType: 'permanent',
    magicEffect: '永久魔法：选择一个装备栏，回收袋每 4 张牌 +1 永久护甲。',
    knightEffect: 'recycle-temp-armor',
    recycleDelay: 1,
    maxUpgradeLevel: 1,
  });

  // 囊中锋意 (Perm 1)：选择一个装备栏（允许空槽），按 floor(背包牌数 / divisor) × 2 加临时攻击。
  // - divisor = 3 (Lv0) / 2 (Lv1)，每满 divisor 张牌 +2 临时攻击
  // - 这张卡从手牌打出 → 进回收袋（recycleDelay: 1），不经背包，
  //   所以 setup → resolve 中间 backpackItems.length 不会变化；
  //   Echo C 类（重读 state）和 A 类（× echoMultiplier）此处数值等价。
  //   实现走 A 类单次乘 × echoMultiplier，与现有 slot-select pattern 对齐。
  // - 与「囊中惊雷」(backpack-bolt) 配套——前者把背包数转伤害，本卡转临时攻击。
  pushCard({
    type: 'magic',
    name: '囊中锋意',
    value: 0,
    image: knightScrollBladeStormImage,
    classCard: true,
    description: '永久：选择一个装备栏，背包每 3 张牌 +2 临时攻击。',
    shortDescription: '所选栏 +背包数÷3×2 临时攻击',
    magicType: 'permanent',
    magicEffect: '永久魔法：选择一个装备栏，背包每 3 张牌 +2 临时攻击。',
    knightEffect: 'backpack-temp-attack',
    recycleDelay: 1,
    maxUpgradeLevel: 1,
  });

  // 攻防协律 (Perm 1)：选择一个装备栏，+2 临时攻击 + +2 临时护甲，并抽 1 张牌。
  // 升级数值：Lv0 +2/+2，Lv1 +4/+4，Lv2 +6/+6（抽牌固定 1 张）。
  // Echo (A 类)：攻防加成与抽牌都 ×echoMultiplier。
  pushCard({
    type: 'magic',
    name: '攻防协律',
    value: 0,
    image: dedupeKnightMagicBattleSpiritImage,
    classCard: true,
    description: '永久：选择一个装备栏，+2 临时攻击 +2 临时护甲，抽 1 张牌。升级1：+4/+4。升级2：+6/+6。',
    shortDescription: '所选栏 +2 临攻 +2 临护；抽 1（Lv1: +4/+4 / Lv2: +6/+6）',
    magicType: 'permanent',
    magicEffect: '永久魔法：选择一个装备栏，+2 临时攻击 +2 临时护甲，抽 1 张牌。',
    knightEffect: 'temp-attack-armor-draw',
    recycleDelay: 1,
    maxUpgradeLevel: 2,
  });

  // 战势化符 (Perm 1)：选择一个装备栏，按 floor((临攻+临护)/3) 抽牌。
  // 公式：drawCount = floor((slotTempAttack + slotTempArmor) / 3) * echoMultiplier
  // - 不分别计算（合并为 pool 再 ÷3，所以 2+2=4 → 1 张，5+1=6 → 2 张）
  // - 0 临时值也允许结算（消耗这张 magic）；空槽也允许选
  // - Echo (A 类)：最终抽牌数 ×echoMultiplier
  // - 不设升级
  pushCard({
    type: 'magic',
    name: '战势化符',
    value: 0,
    image: knightScrollBagFetchImage,
    classCard: true,
    description: '永久：选择一个装备栏，每有 3 点（临时攻击 + 临时护甲）抽 1 张牌。',
    shortDescription: '所选栏 (临攻+临护)÷3 张牌',
    magicType: 'permanent',
    magicEffect: '永久魔法：选择一个装备栏，按 (临时攻击+临时护甲)÷3 抽牌。',
    knightEffect: 'temp-stats-to-draw',
    recycleDelay: 1,
  });

  // 囊中惊雷 (Perm 1)：选择一个目标，造成 floor(背包剩余卡牌数 × pct%) 法术伤害。
  // pct 由升级等级决定（lvl 0 → 50%，lvl 1 → 75%，lvl 2 → 100%）。
  // - 单目标伤害 magic，遵循 missing-hp-smite / stun-cap-strike 同款 pattern：
  //   始终弹出 monster picker，玩家可选 hero / 盾自伤（allowsHeroTarget: true）。
  // - 算式：base = floor(state.backpackItems.length * pct / 100)；
  //   totalDmg = computeSpellDamagePure(state, base + amplifyBonus) * echoMultiplier。
  // - 附加：每造成 3 点法伤额外抽 1 张牌（floor(totalDmg / 3)）。
  //   按计算总伤算（溢杀也算）；hero / 盾自伤也触发抽牌；
  //   Echo (A 类) 后 totalDmg 已含 ×N，抽牌自然按 ×N 后总伤计算。
  //   阈值固定 3，不随升级变化。抽牌走 backpack（draw-cards-defaults-to-backpack.mdc）。
  // - Echo (A 类)：单次结算，伤害 ×echoMultiplier。
  // - 与 missile-bolt / apprentice-bolt / stun-cap-strike 共用 monster-select 路径
  //   （hero.ts:reduceMagicMonsterSelection）；isSpellDamage=true。
  pushCard({
    type: 'magic',
    name: '囊中惊雷',
    value: 0,
    image: knightScrollBagFetchImage,
    classCard: true,
    description: '永久：对一个目标造成等同于背包剩余卡牌数 50% 的法术伤害（向下取整）。每造成 3 点伤害额外抽 1 张牌。',
    shortDescription: '背包数 × 50% 法伤；每 3 伤害抽 1',
    magicType: 'permanent',
    magicEffect: '永久魔法：选择一个目标，造成背包数 × 50% 法伤；每 3 伤害抽 1 张牌。',
    knightEffect: 'backpack-bolt',
    recycleDelay: 1,
    maxUpgradeLevel: 2,
  });

  // 池中惊雷 (Perm 1)：选择一个目标，造成 floor(回收袋卡牌数 × pct%) 法术伤害。
  // 与 囊中惊雷（backpack-bolt）成对照——前者数背包，本卡数回收袋。
  // pct 由升级等级决定（lvl 0 → 100%，lvl 1 → 125%，lvl 2 → 150%）。
  // - 单目标伤害 magic，allowsHeroTarget: true（玩家可选 hero / 盾自伤）。
  // - 算式：base = floor(state.permanentMagicRecycleBag.length * pct / 100)；
  //   totalDmg = computeSpellDamagePure(state, base + amplifyBonus) * echoMultiplier。
  // - Echo (A 类)：单次结算，伤害 ×echoMultiplier。
  // - 注意：本卡自己被打出后会进回收袋（recycleDelay: 1）；setup 时本卡仍在 hand
  //   还没进 recycleBag，因此当下读到的 recycleBag 不含本卡——这跟 囊中惊雷 算
  //   背包时不含本卡是同样的语义。
  pushCard({
    type: 'magic',
    name: '池中惊雷',
    value: 0,
    image: dedupeKnightMagicRecycleTideImage,
    classCard: true,
    description: '永久：对一个目标造成等同于回收袋卡牌数 100% 的法术伤害（向下取整）。',
    shortDescription: '回收袋数 × 100% 法伤',
    magicType: 'permanent',
    magicEffect: '永久魔法：选择一个目标，造成回收袋数 × 100% 法伤。',
    knightEffect: 'recycle-bolt',
    recycleDelay: 1,
    maxUpgradeLevel: 2,
  });

  // 囊量震慑 (Perm 1)：击晕上限 +floor(背包上限 / divisor) 个百分点。
  // - 「背包上限」= getEffectiveBackpackCapacity(state) = BASE_BACKPACK_CAPACITY (12)
  //   + state.backpackCapacityModifier。**不是**当前背包剩余卡数。
  // - divisor 由升级等级决定：lvl 0 → 3；lvl 1 → 2。
  //   背包上限 12 时：Lv0 → +4%，Lv1 → +6%。背包上限 24 时：Lv0 → +8%，Lv1 → +12%。
  // - stunCap 全局封顶 100%（与「眩晕药剂」/「奥术护盾」一致），溢出静默吸收。
  // - 非交互：直接 patch.stunCap，不弹窗、不选目标。
  // - Echo (A 类)：本卡是 hand-card → recycleBag（recycleDelay: 1），背包上限不会
  //   在本次 reduce 步骤里变化，所以 A 类（×echoMultiplier 单次结算）和 C 类
  //   （重读 state 多次结算）数值等价；用 A 类。
  // - 与 雷涌一击 (stun-cap-strike) 的区别：那张是「读 stunCap 转法伤」，本卡反向
  //   「写 stunCap」——一来一回构成完整的击晕上限循环。
  pushCard({
    type: 'magic',
    name: '囊量震慑',
    value: 0,
    image: knightScrollBladeStormImage,
    classCard: true,
    description: '永久：击晕上限增加 floor(背包上限 / 3)%。',
    shortDescription: '击晕上限 +背包上限÷3 %',
    magicType: 'permanent',
    magicEffect: '永久魔法：击晕上限 +背包上限÷3 %。',
    knightEffect: 'backpack-cap-stun',
    recycleDelay: 1,
    maxUpgradeLevel: 1,
  });

  // 囊中生机 (Perm 1)：恢复 floor(背包上限 / divisor) 点生命。
  // - divisor = 4 (Lv0) / 3 (Lv1)。背包上限 12 时：Lv0 +3 / Lv1 +4。
  // - 「背包上限」= max(1, BASE_BACKPACK_CAPACITY (12) + backpackCapacityModifier)，
  //   不是当前 backpackItems.length——跟 囊量震慑 (backpack-cap-stun) 同口径。
  // - HEAL action 自带 clamp 到 maxHp，溢出静默吸收（满血时本卡照常消耗）。
  // - Echo (A 类)：×echoMultiplier 单次结算；背包上限在本次 reduce 步骤内不变，
  //   A/C 等价。
  // - 与 囊量震慑（buff/控制）成对照：本卡走治疗路径。
  pushCard({
    type: 'magic',
    name: '囊中生机',
    value: 0,
    image: knightScrollBagFetchImage,
    classCard: true,
    description: '永久：恢复 floor(背包上限 / 4) 点生命。',
    shortDescription: '恢复 背包上限÷4 生命',
    magicType: 'permanent',
    magicEffect: '永久魔法：恢复 背包上限÷4 点生命。',
    knightEffect: 'backpack-cap-heal',
    recycleDelay: 1,
    maxUpgradeLevel: 1,
  });

  // 布雷术 (Perm 2 → 升级 Perm 1)：在 active row 的随机「空位 OR 含 ghost 建筑
  // 的格子」生成一个「地雷」幽灵建筑。当怪物瀑流落到该 slot 时，地雷从下层触
  // 发，对该怪物造成 5 点纯陷阱伤害（不受 amplify / 法伤加成），随后地雷进坟场
  // （怪物正常占据 slot）。
  // - 选位规则：空位 + ghost 格 合并随机抽（uniform pool）；落到 ghost 格时
  //   原 ghost 沉到 activeCardStacks[col] 末尾、新地雷成为顶层。
  // - 全无可用位置（怪物 / 事件 / 非 ghost 建筑占满）→ fizzle，卡照常进回收袋。
  // - Echo (A 类，allow_same_cell)：生成 echoMultiplier 个地雷；候选池不剔除已选
  //   slot，所以多枚 echo 可堆在同一 cell（每多一层就把上一层地雷推到 stack 下层）。
  // - 非怪物（event / 其它 building）落到地雷 slot 时不触发，按普通 ghost
  //   building 同款被推到下层堆叠（mine 不消耗）。
  // - 升级：lvl 0 recycleDelay = 2；lvl 1 recycleDelay = 1（PERM 2 ↔ PERM 1）。
  pushCard({
    type: 'magic',
    name: '布雷术',
    value: 0,
    image: dedupeKnightMagicGraveNovaImage,
    classCard: true,
    description: '永久：在激活行的随机空位或含幽灵建筑的格子生成一个「地雷」（幽灵建筑）。落到幽灵建筑上时原建筑被堆到下层。当怪物落到地雷格时，对该怪物造成 5 点纯伤害后地雷进坟场。',
    shortDescription: '空位/幽灵格生成地雷：怪物落入受 5 点纯伤',
    magicType: 'permanent',
    magicEffect: '永久魔法：随机空位或幽灵格生成地雷，怪物落入受 5 点纯伤。',
    knightEffect: 'lay-mine',
    recycleDelay: 2,
    maxUpgradeLevel: 1,
  });

  // 淬铸迁位 (Perm 1)：选择一个装备栏的装备进行增幅一次（同名卡按 NAME 全场 +1）；
  // 若另一装备栏为空，把所选装备从原栏移到空位（原栏的预备位会自动晋升）。
  // - 只能选择有装备的栏；空槽点击会被 reducer 拒绝且不消耗这张 magic（玩家可重选）。
  // - Echo (A 类)：增幅 amount = 1 × echoMultiplier（多次叠加），「移到空位」最多发生 1 次
  //   （第二轮时另一栏不再为空，自然不再移动）。
  // - 不设升级。
  pushCard({
    type: 'magic',
    name: '淬铸迁位',
    value: 0,
    image: knightAmplifyPotionImage,
    classCard: true,
    magicType: 'permanent',
    knightEffect: 'amplify-equipment-shift',
    recycleDelay: 1,
    maxUpgradeLevel: 1,
  });

  // 蓄能裂击 (Perm 2)：选择一个装备，耐久上限 +1，耐久 +1；
  // 若 +1 后该装备的当前耐久 == 4，则从激活行随机一个怪物造成 1 血层伤害，
  // 并立即将该装备耐久 -3（即使没怪物可打也照扣）。
  // 触发条件用「+1 后当前耐久 == 4」，比 maxDurability == 4 更直观。
  // Echo (A 类)：整套效果重复 echoMultiplier 次（每次重新读取耐久与怪物列表）。
  // 空槽 / 没有耐久概念的装备 → 直接拒绝并提示，不消耗这张 magic。
  pushCard({
    type: 'magic',
    name: '蓄能裂击',
    value: 0,
    image: knightScrollBladeStormImage,
    classCard: true,
    unique: true,
    description: '永久：选择一件装备，耐久上限 +1，耐久 +1。如果加完后该装备耐久为 4，则随机一只激活行的怪物受到 1 血层伤害，并立即将该装备耐久 -3。',
    shortDescription: '选装备 +1 上限/耐久；若至 4 耐久，敌人 -1 血层、装备 -3',
    magicType: 'permanent',
    magicEffect: '永久魔法：装备 +1 上限/耐久；若达到 4 耐久则随机敌人 -1 血层、装备 -3。',
    knightEffect: 'durability-charge-burst',
    recycleDelay: 2,
  });

  pushCard({
    type: 'magic',
    name: '固壁侧守',
    value: 0,
    image: knightScrollFortifyFlankImage,
    classCard: true,
    unique: true,
    description: '永久：选择一个装备，+1（每次使用后数值 +1）临时护甲。侧击：赋予该装备复生。',
    shortDescription: '+1(递增) 临时护甲；侧击赋予复生',
    magicType: 'permanent',
    magicEffect: '+1(递增) 临时护甲，侧击赋予复生。',
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
    unique: true,
    description:
      '永久：选择一把武器，对激活行所有怪物造成等同于该武器攻击力的法术伤害（不耗耐久），然后该武器栏临时攻击 -3。',
    shortDescription: '武器攻击力法伤全场；该栏临时攻击 -3',
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
    description: '永久：选择一个装备，恢复 1 耐久。侧击：给该装备栏 +1 临时攻击（每次触发后数值 +1）。',
    shortDescription: '装备 +1 耐久；侧击 +1(递增) 临时攻击',
    magicType: 'permanent',
    magicEffect: '修复 1 耐久，侧击 +1(递增) 临时攻击。',
    knightEffect: 'transform-repair',
    flankEffect: '给该装备栏 +1 临时攻击（每次触发后数值 +1）',
  });

  pushCard({
    type: 'magic',
    name: '际遇轮盘',
    value: 0,
    image: dedupeKnightMagicFortuneWheelImage,
    classCard: true,
    description: '永久：掷骰——25% 发现一张专属魔法卡，25% 抽 2 张牌，25% 至多删 1 张牌，25% 下次劝降概率 +20%。',
    shortDescription: '掷骰：四种随机效果之一',
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
    description: '永久：失去 3 点生命，抽 3 张牌。',
    shortDescription: '失去 3 生命，抽 3 张',
    magicType: 'permanent',
    magicEffect: '失去 3 HP，抽 3 张牌。',
    knightEffect: 'blood-draw',
    maxUpgradeLevel: 2,
  });

  // 地震泉涌 (Perm 1)：失去 1 HP（自伤，触发 血怒战符 / 复生赐福 /
  // self-damage-draw / 护甲吸血 / totalDamageTaken 等所有自伤联动），
  // 然后从背包抽 floor(stunCap / 10) 张牌。
  // - HP 自伤走 APPLY_DAMAGE selfInflicted（与 血契抽引 / 血祭裁决 同条管线）
  // - 抽牌受手牌上限约束（drawMultipleFromBackpack 默认行为）
  // - Echo (A 类，与 血契抽引 一致)：HP 损失 ×echoMultiplier、抽牌 ×echoMultiplier
  // - 击晕上限 < 10（floor(stunCap/10) == 0）：仍消耗 magic、仍掉 HP、0 抽
  // - 不设升级
  pushCard({
    type: 'magic',
    name: '地震泉涌',
    value: 0,
    image: knightMagicBloodDrawImage,
    classCard: true,
    description: '永久：失去 1 点生命，从背包抽 (击晕上限 ÷ 10) 张牌（向下取整）。',
    shortDescription: '失 1 HP；抽 击晕上限÷10 张',
    magicType: 'permanent',
    magicEffect: '失去 1 HP，从背包抽 floor(击晕上限/10) 张牌。',
    knightEffect: 'quake-stun-draw',
    recycleDelay: 1,
  });

  // 清囊重启 (Perm 1)：弃回所有手牌（curse 留手），从背包抽 N 张牌
  // （N = 3 / 4 / 5，对应升级 0 / 1 / 2）。手牌为空也仍正常抽 N 张。
  // 弃回走标准 DISCARD_OWNED_CARD：非 Perm 进坟场、Perm/被永恒铭刻过的进
  // 回收袋；触发 catapult / discard-zap / onDiscardDraw / 雷霆符印 等弃置联动。
  pushCard({
    type: 'magic',
    name: '清囊重启',
    value: 0,
    image: knightMagicBloodDrawImage,
    classCard: true,
    description: '永久：弃回所有手牌（诅咒除外），然后从背包抽 3 张牌。',
    shortDescription: '弃回所有手牌；从背包抽 3 张',
    magicType: 'permanent',
    magicEffect: '弃回全部手牌，从背包抽 N 张（升 0/1/2 → 3/4/5）。',
    knightEffect: 'hand-purge-redraw',
    recycleDelay: 1,
    maxUpgradeLevel: 2,
  });

  // 洗册待回 (Perm 1)：把所有可回收手牌（curse 除外）洗入回收袋；从背包抽 X+N 张牌
  // （X = 入回收袋的张数；N = 1 / 2 by upgrade level）。
  // - 与「清囊重启」(hand-purge-redraw) 对照：那张走 DISCARD_OWNED_CARD（非 Perm 进
  //   坟场、Perm 进回收袋）；本卡**强制**所有可回收手牌进回收袋（让它们以后还能
  //   通过 waterfall 回到背包），故意绕过 onDiscardDraw / catapult / discard-zap
  //   等"主动弃手牌"语义——这是"洗"不是"弃"。
  // - 抽牌量动态：X+N。X=0（手牌空）时仍抽 N 张。
  // - 升级：N 由 [1, 2][upgradeLevel] 决定。
  // - 法术回响（C 类雪球）：每次迭代重读 hand
  //     iter 1: 移走 X1 → 抽 X1+N → 手牌现 X1+N
  //     iter 2: 移走 X1+N → 抽 X1+2N → 手牌现 X1+2N
  //   resolver 内手动循环 echoMultiplier 次，模拟 hand/backpack/rng 演化。
  // - 抽牌路由：默认 background → 走 backpack（per draw-cards-defaults-to-backpack.mdc）。
  //   resolver 直接调 drawMultipleFromBackpack 并 emit card:drawnToHand 事件。
  // - 与「奇术轮转」(magic:guild-hand-recycle)、「虚空置换」(swap-backpack-recycle) 区别：
  //   * 奇术轮转：手牌→回收袋后从「回收袋」抽 2 张（数量固定）
  //   * 虚空置换：背包/回收袋整体对换
  //   * 本卡：手牌→回收袋后从「背包」抽 X+N 张（动态量）
  pushCard({
    type: 'magic',
    name: '洗册待回',
    value: 0,
    image: dedupeKnightMagicRecycleTideImage,
    classCard: true,
    description: '永久：将所有手牌（诅咒除外，共 X 张）洗入回收袋，然后从背包抽 X+1 张牌。',
    shortDescription: '手牌入回收袋；从背包抽 X+1',
    magicType: 'permanent',
    magicEffect: '永久魔法：手牌洗入回收袋（共 X 张），从背包抽 X+N 张（升 0/1 → 1/2）。',
    knightEffect: 'hand-recycle-redraw',
    recycleDelay: 1,
    maxUpgradeLevel: 1,
  });

  // 修裂启示 (Perm 1)：选择一件装备，每点缺失耐久（maxDur - cur）抽 2 张牌。
  // - 公式：drawCount = (maxDurability - durability) * 2 * echoMultiplier
  // - 空槽 / 没有耐久概念的装备 → 拒绝，magic 不消耗
  // - 装备满耐久（缺 0）→ magic 仍消耗，0 抽，banner 提示「耐久未损」
  // - Echo (A 类)：最终抽牌数 ×echoMultiplier
  // - 抽牌受手牌上限约束（标准 drawFromBackpackToHandPure 行为）
  // - 不设升级
  pushCard({
    type: 'magic',
    name: '修裂启示',
    value: 0,
    image: knightScrollBladeStormImage,
    classCard: true,
    description: '永久：选择一件装备，每有 1 点缺失耐久（耐久上限 - 当前耐久）抽 2 张牌。',
    shortDescription: '选装备；每缺 1 耐久抽 2 张',
    magicType: 'permanent',
    magicEffect: '永久魔法：选择一件装备，按缺失耐久 ×2 抽牌。',
    knightEffect: 'gear-rift-draw',
    recycleDelay: 1,
  });

  pushCard({
    type: 'magic',
    name: '锻造赌运',
    value: 0,
    image: knightMagicRepairEnrageDiceImage,
    classCard: true,
    description: '永久：选择一个装备和一个怪物，掷骰——80% 该装备 +1 耐久，20% 该怪物 -1 血层并激怒。',
    shortDescription: '掷骰：80% 装备 +1 耐久 / 20% 怪物 -1 血层并激怒',
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
    shortDescription: '失去一半生命；伤害 ＝ 失去血量 ×2',
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
    unique: true,
    description: '装备的怪物数量为数值条（上限 2）。释放：摧毁所有装备（含下层叠加，每件独立判定复生），每摧毁一件对激活行所有怪物 -2攻/-2血上限（每个血层都减）。',
    shortDescription: '装备怪物充能；释放摧毁全部装备（含下层）并削弱全场',
    heroMagicId: 'monster-doom',
    heroMagicEffect: '英雄魔法：解锁或触发灭世裁决。',
  });

  pushCard({
    type: 'hero-magic',
    name: '复生秘典',
    value: 0,
    image: dedupeKnightHeroReviveTomeImage,
    classCard: true,
    unique: true,
    description: '每对自己造成 3 次伤害充满数值条。释放：失去 3 点生命，选择一个装备赋予复生（首次毁坏时以 1 耐久复活）。',
    shortDescription: '自伤 3 次充能；释放赋予一件装备复生',
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
    shortDescription: '猛击：5%×护甲 概率击晕；每回合不限次数',
    durability: 4,
    maxDurability: 4,
    armorMax: 2,
    shieldBashStunRate: 5,
    shieldBashUnlimited: true,
    knightEffect: 'shield-bash',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'shield',
    name: '坚韧磐盾',
    value: 3,
    image: knightShieldEnduranceImage,
    classCard: true,
    description: '该护盾每回合可消耗的耐久上限 +1（怪物回合最多消耗 2 耐久）。怪物攻击该护盾后死亡时，耐久度恢复 1。',
    shortDescription: '每回合格挡耐久上限 +1；怪物死亡时回 1 耐久',
    equipBlockDurabilityBonus: 1,
    shieldRefillOnMonsterDeath: true,
    durability: 3,
    maxDurability: 3,
    armorMax: 3,
    knightEffect: 'endurance-shield',
    maxUpgradeLevel: 2,
  });

  // === CLASS POTION ===
  pushCard({
    type: 'potion',
    name: '连劝秘药',
    value: 0,
    image: knightChainPersuadePotionImage,
    classCard: true,
    description: '获得永恒护符：连续劝降同一个怪物时，每次累计成功概率 +15%。',
    shortDescription: '获得永恒护符：连续劝降同怪物 +15% 累计',
    potionEffect: 'perm-persuade-consecutive',
  });

  pushCard({
    type: 'potion',
    name: '铸锋药剂',
    value: 0,
    image: knightEquipEmpowerPotionImage,
    classCard: true,
    description: '获得永久护符：当装备上装备时，该装备栏获得 3 临时攻击和 3 临时护甲。',
    shortDescription: '获得永久护符：装备上装备时本栏 +3 攻 +3 护',
    potionEffect: 'perm-equip-empower',
  });

  // 狂热发现 (class potion, stackable):
  // 获得永恒护符·狂热发现。每持有一份，使用「专属感召」时若 backpack.length > 10
  // 则 +1 额外发现（per-stack 累加；额外发现走与 echo 同一条 pendingClassDiscoverQueue
  // 路径，叠加而非互斥）。该 Potion 不加 unique → 牌池可多份 → 喝多瓶 = 多份护符
  // (stackable: true 在 schema/executors.ts 处理；ui badge 走 STACKABLE_RELIC_IDS)。
  pushCard({
    type: 'potion',
    name: '狂热发现',
    value: 0,
    image: knightPotionFrenzyDiscoverImage,
    classCard: true,
    description: '获得永恒护符「狂热发现」。光环（可叠加）：每持有一份，使用「专属感召」时若背包牌数 > 10，则额外多触发 1 次发现；牌数 ≤ 10 立即失效。',
    shortDescription: '获得永恒护符「狂热发现」',
    potionEffect: 'grant-eternal-relic-summon-frenzy',
  });

  pushCard({
    type: 'potion',
    name: '唤回秘药',
    value: 0,
    image: knightPotionRecycleGrantImage,
    classCard: true,
    description: '选择一张手牌，赋予「转型：选择一张手牌弃回，从回收袋随机取 1 张牌加入手牌」。',
    shortDescription: '为一张手牌赋予转型：弃 1 张·回收袋取 1 张',
    potionEffect: 'transform-recycle-grant',
  });

  pushCard({
    type: 'potion',
    name: '活力秘药',
    value: 0,
    image: knightVitalityPotionImage,
    classCard: true,
    description: '恢复 12 点生命，抽 2 张牌。',
    shortDescription: '+12 生命；抽 2 张牌',
    potionEffect: 'heal-12-draw-2',
  });

  pushCard({
    type: 'potion',
    name: '增幅秘药',
    value: 0,
    image: knightAmplifyPotionImage,
    classCard: true,
    description: '选择一张装备/伤害魔法（装备栏 / 手牌 / 背包均可），生成一张永久魔法（Perm 1）对其进行增幅（武器攻击+1，护盾护甲+1，伤害魔法伤害+1）。',
    shortDescription: '生成 Perm 1 增幅一张装备/伤害魔法（含背包）',
    potionEffect: 'amplify-target-wide',
  });

  // === CLASS WEAPONS ===
  pushCard({
    type: 'weapon',
    name: '汰换之刃',
    value: 2,
    image: knightExchangeBladeImage,
    classCard: true,
    description: '入场：该装备栏永久攻击 +1。遗言：该装备栏永久护甲 +1。',
    shortDescription: '入场本栏永久 +1 攻；遗言本栏永久 +1 护',
    durability: 3,
    maxDurability: 3,
    onEquipEffect: 'perm-slot-damage+1',
    onDestroyPermanentShield: 1,
    knightEffect: 'exchange-blade',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'weapon',
    name: '怒斩之刃',
    value: 4,
    image: knightRageCleaveImage,
    classCard: true,
    description: '该武器每回合可攻击 2 次（攻击次数 +1）。每次攻击时，所有怪物攻击力 -2。',
    shortDescription: '每回合攻击 2 次；每次攻击全场怪物 -2 攻',
    durability: 3,
    maxDurability: 3,
    weaponExtraAttack: 1,
    onAttackDebuffAllMonsterAttack: 2,
    knightEffect: 'rage-cleave',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'weapon',
    name: '共鸣之刃',
    value: 4,
    image: knightWeaponResonanceBladeImage,
    classCard: true,
    description: '每次攻击时，给另一个装备栏 +2 临时攻击，并恢复其装备 1 点耐久。',
    shortDescription: '每次攻击：另一栏 +2 临时攻 +1 耐久',
    onAttackBuffOtherSlotTempAttack: 2,
    onAttackRepairOtherSlot: 1,
    durability: 2,
    maxDurability: 2,
    knightEffect: 'resonance-blade',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'weapon',
    name: '魔弹连弩',
    value: 1,
    image: dedupeStarterMagicMissileImage,
    classCard: true,
    description: '每次攻击后，所有「魔弹」获得 +1 增幅，并将一张同步增幅的「魔弹」加入背包。',
    shortDescription: '每次攻击：所有魔弹 +1 增幅；背包 +1 张魔弹',
    durability: 3,
    maxDurability: 3,
    onAttackAmplifyMissileGenerate: true,
    knightEffect: 'magic-missile-crossbow',
    maxUpgradeLevel: 2,
  });

  pushCard({
    type: 'weapon',
    name: '生长之刃',
    value: 1,
    image: knightGrowthBladeImage,
    classCard: true,
    description: '上手：该武器增幅一次（攻击 +1，按卡名累计；所有同名「生长之刃」共享）。',
    shortDescription: '上手 +1 攻击（按卡名累计）',
    durability: 3,
    maxDurability: 3,
    onEnterHandEffect: 'growth-blade-onhand',
    knightEffect: 'growth-blade',
    maxUpgradeLevel: 2,
  });

  // 智者之刃 — 4 攻 / 3 耐久。每次攻击从背包抽 2 张牌（drawOnAttack: 2）。
  // 由 combat.ts:reducePerformHeroAttack 的 drawOnAttack 触发分支消费，与 healOnAttack
  // 同语义：fork 攻击（每次 PERFORM_HERO_ATTACK 都触发）+ 装备超频（overclockExtra 复用）。
  // 走标准 DRAW_CARDS source: 'backpack'（draw-cards-defaults-to-backpack 规则），
  // 自动尊重背包置顶优先级。
  // 升级：L1 4攻 / 4 耐久（drawOnAttack 不变）；L2 4攻 / 4 耐久 / drawOnAttack 2 → 3。
  // 图片复用 圣光之刃 的 holy_light_blade.png（光明长刃同主题，零新图片包袱）。
  pushCard({
    type: 'weapon',
    name: '智者之刃',
    value: 4,
    image: knightScholarBladeImage,
    classCard: true,
    description: '每次攻击：从背包抽 2 张牌。',
    shortDescription: '每次攻击抽 2 张',
    drawOnAttack: 2,
    durability: 3,
    maxDurability: 3,
    knightEffect: 'scholar-blade',
    maxUpgradeLevel: 2,
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
    shortDescription: '移除一张手牌，按类型获得装备栏永久加成',
    knightEffect: 'essence-extract',
    recycleDelay: 2,
  });

  // Lv1 魔法飞弹（专属池版本）— 复用 starter 的 dispatch（getStarterBaseId 会把 -pick-\d+ 后缀剥离回 starter-perm-magic-missile）。
  deck.push({
    id: 'starter-perm-magic-missile-pick-901',
    type: 'magic',
    name: '魔法飞弹',
    value: 0,
    image: dedupeStarterMagicMissileImage,
    classCard: true,
    magicType: 'permanent',
    magicEffect: '永久魔法：手上加入 3 张一次性「魔弹」。',
    description: '加入 3 张一次性「魔弹」到手牌（每张可对一个怪物造成 1 点法术伤害）。',
    shortDescription: '手上加入 3 张「魔弹」',
    upgradeLevel: 1,
    maxUpgradeLevel: 2,
  });

  // 魔弹风暴 — 即时魔法：将坟场所有「魔弹」逐一发射，每枚随机攻击激活行一个怪物
  deck.push({
    id: 'knight-instant-missile-storm-pick-902',
    type: 'magic',
    name: '魔弹风暴',
    value: 0,
    image: dedupeStarterMagicMissileImage,
    classCard: true,
    magicType: 'instant',
    knightEffect: 'missile-storm',
    magicEffect: '即时魔法：坟场中每张「魔弹」对随机怪物造成 1 点法术伤害（依次发射）。',
    description: '坟场中每有一张「魔弹」，便从坟场调动一枚向随机怪物发射 1 点法术伤害，依次连射；不消耗坟场中的魔弹。',
    shortDescription: '坟场每张「魔弹」对随机怪物 1 法伤',
  });

  // 战狂诅咒 — 诅咒：使用时失去 1 生命、抽 1 张牌，使用后回到背包；
  // 上手时随机一个装备栏临时攻击 +1。
  // 与其他诅咒一致：无法被回收或弃置，FINALIZE_MAGIC_CARD 走 curse 分支直接回袋。
  pushCard({
    type: 'curse',
    name: '战狂诅咒',
    value: 0,
    image: frenzyCurseImage,
    classCard: true,
    unique: true,
    description: '诅咒：使用时失去 1 生命，抽 1 张牌，使用后回到背包；上手时随机一个装备栏 +1 临时攻击；无法被回收或弃置。',
    shortDescription: '使用 -1 生命抽 1 张回背包；上手随机一栏 +1 临时攻',
    curseEffect: 'frenzy-curse',
    onEnterHandEffect: 'frenzy-curse-onhand',
  });

  let shuffledDeck: KnightCardData[];
  [shuffledDeck, currentRng] = rngShuffle(deck, currentRng) as [KnightCardData[], RngState];
  // Run every card through `applyDerivedCardText` (mirrors what `createDeck`
  // and `createStarterCardPool` do at the end of their builders). Without
  // this final pass, knight cards whose source omits `description` /
  // `shortDescription` / `magicEffect` literals (e.g. 淬铸迁位) ship with
  // those fields `undefined` and the card-details modal renders blank;
  // cards whose source has stale literals diverge from the formatter's
  // current output (caught by `card-text-deck-parity.test.ts`).
  // Routing safety: every knight card here has either a `knightEffect` or
  // an `amuletEffect` (or a starter id), which take priority over
  // `magicEffect` in `resolveEffectId`, so a formatter-injected
  // `magicEffect` cannot short-circuit dispatch. `applyDerivedCardText` is
  // idempotent, so the early `pushAmulet` call above (which already runs
  // it) is safe to re-process here.
  const finalDeck = shuffledDeck.map(c => applyDerivedCardText(c) as KnightCardData);
  return [finalDeck, currentRng];
}

// Class card discovery events for the main deck
export function createKnightDiscoveryEvents(): GameCardData[] {
  const events: GameCardData[] = [];
  // Discovery events removed to keep total event count at 12 while preserving API surface.
  return events;
}

/** 劝降归袋符：劝降时加入手牌的一次性魔法。 */
export const createPersuadeRecycleFetchMagicCard = (rng: RngState): [KnightCardData, RngState] => {
  const [id, nextRng] = nextId(rng, 'persuade-recycle-fetch');
  return [{
    id,
    type: 'magic',
    name: '归袋抽引',
    value: 0,
    image: knightScrollBagFetchImage,
    classCard: true,
    description: '一次性：从回收袋随机 1 张牌加入手牌。',
    shortDescription: '回收袋随机 1 张入手',
    magicType: 'instant',
    magicEffect: '从回收袋随机 1 张牌加入手牌。',
    knightEffect: 'recycle-random-to-hand',
  }, nextRng];
};

/**
 * 影摹召引符：每抽 8 张牌时产出的「镜影摹形」一次性魔法卡。
 *
 * 与 1132–1143 那张牌库内的「镜影摹形」字段保持一致，仅 id 走 runtime nextId 生成。
 * `knightEffect: 'mirror-copy'` 已注册于 card-schema/definitions/magic.ts（interactive flow），
 * 玩家拖到英雄 / 出牌时自动走 mirror-copy 选择 modal → 复制选中卡入手。
 *
 * id 前缀 `mirror-copy-summon` 不依赖 `getStarterBaseId` strip（卡走 knightEffect
 * 优先级路由，不走 starter-id），因此不需要 `-pick-N` / `-evt-N` / `-disc-N` 后缀。
 */
export const createMirrorCopySummonCard = (rng: RngState): [KnightCardData, RngState] => {
  const [id, nextRng] = nextId(rng, 'mirror-copy-summon');
  return [{
    id,
    type: 'magic',
    name: '镜影摹形',
    value: 0,
    image: dedupeKnightMagicMirrorCopyImage,
    classCard: true,
    description: '一次性：选择左/右装备栏、护符栏或手牌中的一张牌，化身为该牌的复制并加入手牌。',
    shortDescription: '化身为所选牌的复制入手',
    magicType: 'instant',
    magicEffect: '选择一张牌，成为该牌的复制。',
    knightEffect: 'mirror-copy',
  }, nextRng];
};

export const createGraveyardRecallCard = (rng: RngState): [GameCardData, RngState] => {
  const [id, nextRng] = nextId(rng, 'graveyard-recall');
  return [{
    id,
    type: 'magic',
    name: '冥途拾遗',
    value: 0,
    image: dedupeMagicUnderworldRelicImage,
    description: '一次性：从坟场随机取回至多 3 张牌加入背包（不能取回自己）。',
    shortDescription: '坟场随机取至多 3 张入背包',
    magicType: 'instant',
    magicEffect: '坟场随机取回 3 张牌。',
    knightEffect: 'graveyard-recall',
    maxUpgradeLevel: 3,
  }, nextRng];
};

export const createGreedCurseCard = (rng: RngState): [KnightCardData, RngState] => {
  const [id, nextRng] = nextId(rng, 'greed');
  return [{
    id,
    type: 'curse',
    name: '贪婪诅咒',
    value: 0,
    image: greedCurseImage,
    classCard: true,
    description: '诅咒：使用时失去 3 金币，使用后回到背包；无法被回收或弃置。',
    shortDescription: '使用失去 3 金币后回背包',
    curseEffect: 'greed-curse',
  }, nextRng];
};

/**
 * 地雷建筑（布雷术 spawn 出来的 ghost building）。
 *
 * 字段语义：
 *   - `type: 'building'` + `isGhost: true`：标准 ghost building，瀑流时会被怪物
 *     压到下层 stack；waterfall reducer 在「displaced ghost 有 mineDamage」时
 *     会改走「触发伤害 + 进坟场」分支，不会塞回 activeCardStacks。
 *   - `mineDamage: 5`：从下层触发对刚落下的怪物造成 5 点纯伤害（不走 amplify
 *     / spell-damage bonus）。
 *   - `hp: 1` / `maxHp: 1`：跟现有 ghost building (增幅祭坛/诅咒碑) 同款占位
 *     字段，避免 UI 渲染时缺字段崩溃。地雷不能被英雄主动攻击（活跃行 building
 *     攻击路径需要怪物 attack 字段，此处保留但不会被使用）。
 *   - 图片使用专属 `knightMineBuildingImage`（地雷建筑独有）。
 */
export const createMineBuilding = (rng: RngState): [GameCardData, RngState] => {
  const [id, nextRng] = nextId(rng, 'mine');
  return [{
    id,
    type: 'building',
    name: '地雷',
    value: 0,
    image: knightMineBuildingImage,
    classCard: true,
    isGhost: true,
    mineDamage: 5,
    hp: 1,
    maxHp: 1,
    description: '幽灵建筑：当怪物瀑流落到本格时，对该怪物造成 5 点纯伤害，地雷进入坟场。',
    shortDescription: '怪物落入：5 点纯伤后进坟场',
  } as GameCardData, nextRng];
};