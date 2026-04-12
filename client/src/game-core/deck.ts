/**
 * Deck Creation — all card pool definitions and deck-building logic.
 *
 * Pure TypeScript module, no React dependency. Contains createDeck(),
 * createStarterCardPool(), and related helpers.
 */

import type { GameCardData, EventDiceRange } from '@/components/GameCard';
import { FLIP_GOLD_REWARD } from './constants';
import { getUpgradeTierCount } from '@/lib/monsterRage';

// ---------------------------------------------------------------------------
// Monster images
// ---------------------------------------------------------------------------
import dragonImage from '@assets/generated_images/cute_chibi_dragon_monster.png';
import skeletonImage from '@assets/generated_images/cute_chibi_skeleton_monster.png';
import goblinImage from '@assets/generated_images/cute_chibi_goblin_monster.png';
import ogreImage from '@assets/generated_images/cute_chibi_ogre_monster.png';
import wraithImage from '@assets/generated_images/cute_chibi_wraith_monster.png';
import swarmImage from '@assets/generated_images/cute_chibi_swarm_monster.png';
import golemImage from '@assets/generated_images/cute_chibi_golem_monster.png';
import bugletImage from '@assets/generated_images/cute_chibi_buglet_token.png';
export { default as minionImage } from '@assets/generated_images/chibi_minion_follower.png';
export { bugletImage };

// Re-export images that are also used inline in GameBoard component body
export { goblinImage, forgeHeartAmuletImage };

// ---------------------------------------------------------------------------
// Weapon images
// ---------------------------------------------------------------------------
import swordImage from '@assets/generated_images/cute_cartoon_medieval_sword.png';
import axeImage from '@assets/generated_images/cute_cartoon_battle_axe.png';
import daggerImage from '@assets/generated_images/cute_cartoon_dagger.png';
import daggerWeaponImage from '@assets/generated_images/cute_cartoon_weapon_dagger.png';
import holyBladeImage from '@assets/generated_images/cute_cartoon_holy_blade.png';
import maceImage from '@assets/generated_images/cute_cartoon_mace.png';
import arcaneBladeImage from '@assets/generated_images/arcane_blade_weapon.png';
import warhammerImage from '@assets/generated_images/thunder_warhammer.png';

// ---------------------------------------------------------------------------
// Shield images
// ---------------------------------------------------------------------------
import woodenShieldImage from '@assets/generated_images/cute_wooden_shield.png';
import ironShieldImage from '@assets/generated_images/cute_iron_shield.png';
import heavyShieldImage from '@assets/generated_images/card_dedupe_shield_heavy_main.png';
import bastionShieldImage from '@assets/generated_images/knight_bastion_shield.png';

// ---------------------------------------------------------------------------
// Potion images
// ---------------------------------------------------------------------------
import potionImage from '@assets/generated_images/cute_cartoon_healing_potion.png';
import potionConcentratedHealImage from '@assets/generated_images/cute_potion_concentrated_heal.png';
import potionWeaponRepairImageImport from '@assets/generated_images/cute_potion_weapon_repair.png';
const potionWeaponRepairImage = potionWeaponRepairImageImport;
export { potionWeaponRepairImage };
import potionEquipmentRepairImage from '@assets/generated_images/cute_potion_equipment_repair.png';
import potionBackpackAwakenImage from '@assets/generated_images/card_dedupe_potion_backpack_awaken.png';
import potionInsightClassImage from '@assets/generated_images/card_dedupe_potion_insight.png';
import potionEternalInscribeImage from '@assets/generated_images/card_dedupe_potion_eternal_perm.png';
import potionTwilightImage from '@assets/generated_images/cute_potion_twilight.png';
import potionAmuletToRelicImage from '@assets/generated_images/card_dedupe_magic_underworld_relic.png';
import potionSpellDamageImageImport from '@assets/generated_images/cute_potion_spell_damage.png';
const potionSpellDamageImage = potionSpellDamageImageImport;
export { potionSpellDamageImage };

// ---------------------------------------------------------------------------
// Amulet images
// ---------------------------------------------------------------------------
import lifeAmuletImage from '@assets/generated_images/chibi_life_amulet.png';
import strengthAmuletImage from '@assets/generated_images/chibi_strength_amulet.png';
import dedupeAmuletCatapultImage from '@assets/generated_images/card_dedupe_amulet_catapult.png';
import dedupeAmuletGraveyardStackImage from '@assets/generated_images/card_dedupe_amulet_graveyard_stack.png';
import balanceAmuletImage from '@assets/generated_images/chibi_balance_amulet.png';
import lifestealAmuletImage from '@assets/generated_images/chibi_lifesteal_amulet.png';
import flashAmuletImage from '@assets/generated_images/chibi_flash_amulet.png';
import forgeHeartAmuletImage from '@assets/generated_images/chibi_forge_heart_amulet.png';

// ---------------------------------------------------------------------------
// Skill / Event images (re-exported for use by GameBoard)
// ---------------------------------------------------------------------------
import skillScrollImageImport from '@assets/generated_images/chibi_skill_scroll.png';
import eventScrollImageImport from '@assets/generated_images/chibi_event_scroll.png';
import persuadeScrollCharmImage from '@assets/generated_images/card_dedupe_persuade_scroll_charm.png';
export const skillScrollImage = skillScrollImageImport;
export const eventScrollImage = eventScrollImageImport;

// Deduped art: main deck magic, events, starter pool (unique per card name)
import dedupePotionFlipHealEchoImage from '@assets/generated_images/card_dedupe_potion_flip_heal_echo.png';
import dedupePotionFlipTwilightEchoImage from '@assets/generated_images/card_dedupe_potion_flip_twilight_echo.png';
import dedupeMagicWaterfallResetImage from '@assets/generated_images/card_dedupe_magic_waterfall_reset.png';
import dedupeMagicStormArrowsImage from '@assets/generated_images/card_dedupe_magic_storm_arrows.png';
import dedupeMagicEchoBagImage from '@assets/generated_images/card_dedupe_magic_echo_bag.png';
import dedupeMagicTideArmorImage from '@assets/generated_images/card_dedupe_magic_tide_armor.png';
import dedupeMagicGoldJudgmentImage from '@assets/generated_images/card_dedupe_magic_gold_judgment.png';
import dedupeMagicFullHandSpringImage from '@assets/generated_images/card_dedupe_magic_full_hand_spring.png';
import dedupeMagicEquivalentExchangeImage from '@assets/generated_images/card_dedupe_magic_equivalent_exchange.png';
import dedupeMagicUnderworldRelicImage from '@assets/generated_images/card_dedupe_magic_underworld_relic.png';
import dedupeMagicArcaneRefineImage from '@assets/generated_images/card_dedupe_magic_arcane_refine.png';
import dedupeMagicOmniscienceImage from '@assets/generated_images/card_dedupe_magic_omniscience.png';
import dedupeMagicEventFortifyImage from '@assets/generated_images/card_dedupe_magic_event_fortify.png';
import dedupeMagicStunWaveImage from '@assets/generated_images/card_dedupe_knight_magic_armor_stun_convert.png';
import dedupeMagicShadowSpikeFlipImage from '@assets/generated_images/card_dedupe_magic_shadow_spike_flip.png';
import dedupeMagicChaosImpactFlipImage from '@assets/generated_images/card_dedupe_magic_chaos_impact_flip.png';
import dedupeMagicTimeMirrorFlipImage from '@assets/generated_images/card_dedupe_magic_time_mirror_flip.png';
import dedupeMagicVoidSwapImage from '@assets/generated_images/card_dedupe_magic_void_swap.png';
import dedupeEventFateCrossroadsImage from '@assets/generated_images/card_dedupe_event_fate_crossroads.png';
import dedupeEventSecretVaultImage from '@assets/generated_images/card_dedupe_event_secret_vault.png';
import dedupeEventSecretVaultOpenImage from '@assets/generated_images/card_dedupe_event_secret_vault_open.png';
import dedupeEventShadowPactImage from '@assets/generated_images/card_dedupe_event_shadow_pact.png';
import dedupeEventResonanceForgeImage from '@assets/generated_images/card_dedupe_event_resonance_forge.png';
import dedupeEventGreedyAltarImage from '@assets/generated_images/card_dedupe_event_greedy_altar.png';
import dedupeEventSealAltarBuildingImage from '@assets/generated_images/card_dedupe_event_seal_altar_building.png';
import dedupeEventBattleHonorImage from '@assets/generated_images/card_dedupe_event_battle_honor.png';
import dedupeEventBloodCurseImage from '@assets/generated_images/card_dedupe_event_blood_curse.png';
import dedupeEventCrimsonPactImage from '@assets/generated_images/card_dedupe_event_crimson_pact.png';
import dedupeEventCrimsonPactAwakenedImage from '@assets/generated_images/card_dedupe_event_crimson_pact_awakened.png';
import dedupeEventPotionManuscriptImage from '@assets/generated_images/card_dedupe_event_potion_manuscript.png';
import dedupeEventCryptWhisperImage from '@assets/generated_images/card_dedupe_event_crypt_whisper.png';
import dedupeEventArcaneGuildImage from '@assets/generated_images/card_dedupe_event_arcane_guild.png';
import dedupeEventFateDiceCupImage from '@assets/generated_images/card_dedupe_event_fate_dice_cup.png';
import dedupeEventBladeOfFateBuildingImage from '@assets/generated_images/card_dedupe_event_blade_of_fate_building.png';
import dedupeEventChaosDiceGameImage from '@assets/generated_images/card_dedupe_event_chaos_dice_game.png';
import dedupeEventTimeRiftImage from '@assets/generated_images/card_dedupe_event_time_rift.png';
import dedupeEventCursedDiceImage from '@assets/generated_images/card_dedupe_knight_magic_fortune_wheel.png';
import dedupeEventCursedDiceBuildingImage from '@assets/generated_images/card_dedupe_cursed_stele_building.png';
import dedupeStarterCombatRallyImage from '@assets/generated_images/card_dedupe_starter_combat_rally.png';
import dedupeStarterFineRepairImage from '@assets/generated_images/card_dedupe_starter_fine_repair.png';
import dedupeStarterDiscardDrawImage from '@assets/generated_images/card_dedupe_starter_discard_draw.png';
import dedupeStarterMazeRewindImage from '@assets/generated_images/card_dedupe_starter_maze_rewind.png';
import dedupeStarterWorldSwapImage from '@assets/generated_images/card_dedupe_starter_world_swap.png';
import dedupeMissileBoltTokenImage from '@assets/generated_images/card_dedupe_missile_bolt_token.png';
import dedupeStarterMagicMissileImage from '@assets/generated_images/card_dedupe_starter_magic_missile.png';
import dedupeStarterThunderStrikeImage from '@assets/generated_images/card_dedupe_starter_thunder_strike.png';
import dedupeStarterAmuletLoneImage from '@assets/generated_images/card_dedupe_starter_amulet_lone.png';
import starterAmuletPersuadeDiscountImage from '@assets/generated_images/starter_amulet_persuade_discount.png';
import starterAmuletMissileImage from '@assets/generated_images/starter_amulet_missile.png';
import starterAmuletDamageDiscoverImage from '@assets/generated_images/starter_amulet_damage_discover.png';
import starterAmuletSwapUpgradeImage from '@assets/generated_images/starter_amulet_swap_upgrade.png';
import starterAmuletStunCapImage from '@assets/generated_images/starter_amulet_stun_cap.png';
import starterAmuletRecycleExpandImage from '@assets/generated_images/starter_amulet_recycle_expand.png';
import starterAmuletDungeonGoldImage from '@assets/generated_images/starter_amulet_dungeon_gold.png';
import dedupeStarterBackpackSizePotionImage from '@assets/generated_images/card_dedupe_starter_potion_backpack_size.png';
import dedupeStarterWaterfallDealPotionImage from '@assets/generated_images/card_dedupe_starter_potion_waterfall_deal.png';
import dedupeStarterSlotCapacityPotionImage from '@assets/generated_images/card_dedupe_potion_slot_capacity_starter.png';

export { dedupeMagicUnderworldRelicImage };

// ---------------------------------------------------------------------------
// Starter draft pool images
// ---------------------------------------------------------------------------
import starterBountyBladeImage from '@assets/generated_images/starter_bounty_blade.png';
import starterGhostBladeImage from '@assets/generated_images/starter_ghost_blade.png';
import starterLuckyDaggerImage from '@assets/generated_images/starter_lucky_dagger.png';
import starterWaterfallSwordImage from '@assets/generated_images/starter_waterfall_sword.png';
import starterPersuadeBladeImage from '@assets/generated_images/starter_persuade_blade.png';
import starterGuardianShieldImage from '@assets/generated_images/starter_guardian_shield.png';
import starterLinkShieldImage from '@assets/generated_images/starter_link_shield.png';
import starterScrollArmorImage from '@assets/generated_images/starter_scroll_armor.png';
import starterScrollHealImage from '@assets/generated_images/starter_scroll_heal.png';
import starterScrollSummonImage from '@assets/generated_images/starter_scroll_summon.png';
import starterScrollDimensionImage from '@assets/generated_images/starter_scroll_dimension.png';
import starterScrollReviveImageImport from '@assets/generated_images/starter_scroll_revive.png';
export const starterScrollReviveImage = starterScrollReviveImageImport;
import starterScrollRecallImageImport from '@assets/generated_images/starter_scroll_recall.png';
export const starterScrollRecallImage = starterScrollRecallImageImport;
import starterScrollGamblerImage from '@assets/generated_images/starter_scroll_gambler.png';
import starterScrollUpgradeImageImport from '@assets/generated_images/starter_scroll_upgrade.png';
export const starterScrollUpgradeImage = starterScrollUpgradeImageImport;
import starterScrollFateDeepImage from '@assets/generated_images/starter_scroll_fate_deep.png';
import starterPotionForgeImage from '@assets/generated_images/starter_potion_forge.png';
import starterPotionDurabilityImage from '@assets/generated_images/starter_potion_durability.png';
import starterPotionLifestealImage from '@assets/generated_images/starter_potion_lifesteal.png';
import starterPotionStunImage from '@assets/generated_images/starter_potion_stun.png';
import starterPotionHandLimitImage from '@assets/generated_images/starter_potion_hand_limit.png';
import starterNoviceSwordImage from '@assets/generated_images/starter_novice_sword.png';
import starterImmortalHammerImage from '@assets/generated_images/starter_immortal_hammer.png';
import starterScrollRecycleEchoImage from '@assets/generated_images/starter_scroll_recycle_echo.png';
import starterPotionSpellDamageImage from '@assets/generated_images/starter_potion_spell_damage.png';
import starterScrollEternalInscribeImage from '@assets/generated_images/starter_scroll_eternal_inscribe.png';

// ---------------------------------------------------------------------------
// patchPersistedMainDeckWeaponImage
// ---------------------------------------------------------------------------

export function patchPersistedMainDeckWeaponImage(card: GameCardData): GameCardData {
  if (card.type !== 'weapon') return card;
  switch (card.name) {
    case 'Dagger':
      return { ...card, image: daggerWeaponImage, daggerSelfDestructDiscover: true, critChance: undefined };
    case '虚灵刀':
    case 'Swift Blade':
      return { ...card, name: '虚灵刀', image: starterGhostBladeImage, ghostBladeExile: true, description: card.description || '每次攻击后，可从坟场选择卡牌移除出游戏。' };
    case 'Holy Blade':
      return { ...card, image: holyBladeImage };
    case 'Mace':
      return { ...card, image: maceImage };
    case '战锤':
      return { ...card, image: warhammerImage, weaponStunChance: card.weaponStunChance ?? 40, onEquipEffect: card.onEquipEffect || 'stunCap+5', description: card.description || '入场：击晕上限 +5%。击晕率 40%。' };
    default:
      return card;
  }
}

// ---------------------------------------------------------------------------
// pruneEventChoicesToThree
// ---------------------------------------------------------------------------

export function pruneEventChoicesToThree(card: GameCardData): GameCardData {
  if (card.type !== 'event' || !card.eventChoices) {
    if (card.flipTarget?.toCard?.type === 'event') {
      return {
        ...card,
        flipTarget: {
          ...card.flipTarget,
          toCard: pruneEventChoicesToThree(card.flipTarget.toCard),
        },
      };
    }
    return card;
  }

  const fallbackChoices = card.eventChoices.filter(c => c.requiresDisabledChoices?.length);
  let choices = card.eventChoices.filter(c => !c.requiresDisabledChoices?.length);

  if (choices.length > 3) {
    const indices = Array.from({ length: choices.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    choices = [choices[indices[0]], choices[indices[1]], choices[indices[2]]];
  }

  choices = choices.map(choice => {
    if (!choice.diceTable || choice.diceTable.length <= 3) return choice;
    const dIndices = Array.from({ length: choice.diceTable.length }, (_, i) => i);
    for (let i = dIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dIndices[i], dIndices[j]] = [dIndices[j], dIndices[i]];
    }
    const picked: EventDiceRange[] = [
      { ...choice.diceTable[dIndices[0]], range: [1, 7] },
      { ...choice.diceTable[dIndices[1]], range: [8, 14] },
      { ...choice.diceTable[dIndices[2]], range: [15, 20] },
    ];
    return { ...choice, diceTable: picked, hint: `35% ${picked[0].label} / 35% ${picked[1].label} / 30% ${picked[2].label}` };
  });

  const remainingIds = new Set(choices.map(c => c.id).filter(Boolean));
  const resolvedFallbacks = fallbackChoices.map(choice => {
    const filtered = choice.requiresDisabledChoices!.filter(id => remainingIds.has(id));
    if (filtered.length === 0) {
      const { requiresDisabledChoices: _a, requiresDisabledReason: _b, ...rest } = choice;
      return rest;
    }
    return { ...choice, requiresDisabledChoices: filtered };
  });
  choices = [...choices, ...resolvedFallbacks];

  let result: GameCardData = { ...card, eventChoices: choices };

  if (result.flipTarget?.toCard?.type === 'event') {
    result = {
      ...result,
      flipTarget: {
        ...result.flipTarget,
        toCard: pruneEventChoicesToThree(result.flipTarget.toCard),
      },
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// createDeck
// ---------------------------------------------------------------------------

export function createDeck(): GameCardData[] {
  const deck: GameCardData[] = [];
  let id = 0;

    const monsterPrefixes: Record<string, string[]> = {
      Dragon: ['Ancient', 'Crimson', 'Shadow', 'Storm', 'Frost', 'Ember', 'Iron', 'Void', 'Thunder', 'Ashen', 'Feral', 'Dread'],
      Skeleton: ['Cursed', 'Hollow', 'Grim', 'Wailing', 'Pale', 'Rotting', 'Vengeful', 'Shattered', 'Forsaken', 'Silent', 'Risen', 'Ghastly'],
      Goblin: ['Sly', 'Wicked', 'Cunning', 'Savage', 'Sneaky', 'Vile', 'Rabid', 'Twisted', 'Crafty', 'Foul', 'Rogue', 'Mad'],
      Ogre: ['Brutal', 'Stone', 'Hulking', 'Iron', 'Scarred', 'Raging', 'Titan', 'Gnarled', 'Vicious', 'Dusk', 'Wrathful', 'Blight'],
      Wraith: ['Phantom', 'Spectral', 'Haunting', 'Ethereal', 'Abyssal', 'Twilight', 'Hollow', 'Veiled', 'Mourning', 'Sinister', 'Fading', 'Drifting'],
      Swarm: ['Chittering', 'Hive', 'Burrowing', 'Writhing', 'Scuttling', 'Plague', 'Festering', 'Crawling', 'Venomous', 'Ravenous', 'Swarming', 'Teeming'],
      Golem: ['Ancient', 'Stone', 'Crystal', 'Rune', 'Iron', 'Jade', 'Obsidian', 'Marble', 'Granite', 'Arcane', 'Mithril', 'Adamant'],
    };
    const usedPrefixes: Record<string, Set<number>> = {};

    const pickPrefix = (typeName: string): string => {
      const pool = monsterPrefixes[typeName];
      if (!pool) return typeName;
      if (!usedPrefixes[typeName]) usedPrefixes[typeName] = new Set();
      const used = usedPrefixes[typeName];
      if (used.size >= pool.length) used.clear();
      let idx: number;
      do { idx = Math.floor(Math.random() * pool.length); } while (used.has(idx));
      used.add(idx);
      return `${pool[idx]} ${typeName}`;
    };

    const monsterTypes = [
      { 
        name: 'Dragon',
        image: dragonImage,
        minAttack: 4, maxAttack: 6,
        minHp: 6, maxHp: 7,
        minFury: 3, maxFury: 4,
        waterfallEffect: { type: 'turnBoost' as const, amount: 4, description: '被挤出时：waterfall 次数 +4（影响后续怪物血层）' },
      },
      { 
        name: 'Skeleton', 
        image: skeletonImage, 
        minAttack: 5, maxAttack: 7,
        minHp: 1, maxHp: 3,
        minFury: 2, maxFury: 4,
        waterfallEffect: { type: 'damage' as const, amount: 8, description: '被挤出时：对英雄造成 8 点伤害' },
      },
      { 
        name: 'Goblin', 
        image: goblinImage, 
        minAttack: 2, maxAttack: 3,
        minHp: 3, maxHp: 4,
        minFury: 1, maxFury: 4,
        waterfallEffect: { type: 'goldLoss' as const, amount: 6, description: '被挤出时：失去 6 金币' },
      },
      { 
        name: 'Ogre',
        image: ogreImage,
        minAttack: 4, maxAttack: 5,
        minHp: 4, maxHp: 5,
        minFury: 2, maxFury: 4,
        waterfallEffect: { type: 'bonusDecay' as const, amount: 1, description: '被挤出时：所有永久伤害/护甲/法术加成 -1' },
      },
      { 
        name: 'Wraith',
        image: wraithImage,
        minAttack: 3, maxAttack: 5,
        minHp: 3, maxHp: 4,
        minFury: 2, maxFury: 3,
        waterfallEffect: {
          type: 'returnToDeck' as const,
          amount: 0,
          description: '被挤出时：不进入坟场，随机插入剩余牌堆某一位置。',
        },
      },
      {
        name: 'Swarm',
        image: swarmImage,
        minAttack: 2, maxAttack: 4,
        minHp: 6, maxHp: 9,
        minFury: 2, maxFury: 2,
        waterfallEffect: { type: 'swarmInfest' as const, amount: 3, description: '被挤出时：在主牌堆顶加入 3 只小虫子' },
      },
      {
        name: 'Golem',
        image: golemImage,
        minAttack: 3, maxAttack: 5,
        minHp: 5, maxHp: 7,
        minFury: 2, maxFury: 3,
        waterfallEffect: { type: 'spellDecay' as const, amount: 2, description: '被挤出时：永久法术伤害加成 -2' },
      },
    ];

    // 21 monsters total (3 per type, 7 races)
    for (let i = 0; i < 21; i++) {
      const monsterType = monsterTypes[i % monsterTypes.length];
      const attack = Math.floor(Math.random() * (monsterType.maxAttack - monsterType.minAttack + 1)) + monsterType.minAttack;
      const hp = Math.floor(Math.random() * (monsterType.maxHp - monsterType.minHp + 1)) + monsterType.minHp;
      const fury = Math.floor(Math.random() * (monsterType.maxFury - monsterType.minFury + 1)) + monsterType.minFury;
      
      deck.push({
        id: `monster-${id++}`,
        type: 'monster',
        name: pickPrefix(monsterType.name),
        monsterType: monsterType.name,
        value: attack,
        attack: attack,
        hp: hp,
        maxHp: hp,
        baseAttack: attack,
        baseHp: hp,
        fury: fury,
        hpLayers: fury,
        currentLayer: fury,
        image: monsterType.image,
        waterfallEffect: monsterType.waterfallEffect,
        upgradeLevel: 0,
        maxUpgradeLevel: getUpgradeTierCount(monsterType.name),
        ...(monsterType.name === 'Skeleton' ? { hasRevive: true } : {}),
        ...(monsterType.name === 'Dragon' ? { bleedEffect: 'attack+2' } : {}),
        ...(monsterType.name === 'Ogre' ? { enterEffect: 'auto-engage' } : {}),
        ...(monsterType.name === 'Wraith' ? { lastWords: 'wraith-haunt-2' } : {}),
        ...(monsterType.name === 'Goblin' ? { onAttackEffect: 'steal-gold-3' } : {}),
        ...(monsterType.name === 'Swarm' ? { swarmSpawn: true, description: '虫群：场上有虫群怪物时，每移除一张地城牌，在该位置生成一只小虫子。' } : {}),
        ...(monsterType.name === 'Golem' ? { antiMagicReflect: 2, description: '反魔：玩家每使用一张法术牌，对玩家造成 2 点伤害。' } : {}),
      });
    }

    const monstersByType: Record<string, GameCardData[]> = {};
    deck.filter(c => c.type === 'monster').forEach(m => {
      const mt = m.monsterType!;
      (monstersByType[mt] ??= []).push(m);
    });
    const specialMap: Record<string, { tag: string; desc: string; lastWords?: string }> = {
      Dragon:   { tag: 'ember-fury',     desc: '精英流血：每失去一个血层，攻击力+3。\n龙息庇护：Hero回合未掉血层，为激活行另一个怪物恢复1血层。' },
      Skeleton: { tag: 'bone-regen',     desc: '虚骨再生：每次失去血层后，50%概率恢复一层。' },
      Wraith:   { tag: 'wraith-rebirth', desc: '幽魂重生：血层降至1时，30%概率血层全满。' },
      Ogre:     { tag: 'ogre-crit',      desc: '蛮力暴击：攻击时50%概率双倍伤害。\n狂暴连击：70%概率攻击两次。' },
      Goblin:   { tag: 'goblin-elite',   desc: '窃宝精英：自身下方每有1张牌，15%概率偷走玩家装备或护符，堆叠在自身下方。' },
      Swarm:    { tag: 'swarm-elite',    desc: '虫母：每次受到伤害时，将激活行一张非怪物牌替换为小虫子。' },
      Golem:    { tag: 'golem-elite',   desc: '岩石护体：每次最多受到 5 点伤害。' },
    };
    for (const [type, monsters] of Object.entries(monstersByType)) {
      const spec = specialMap[type];
      if (!spec || !monsters.length) continue;
      const chosen = monsters[Math.floor(Math.random() * monsters.length)];
      chosen.monsterSpecial = spec.tag;
      chosen.monsterSpecialDesc = spec.desc;
      chosen.description = spec.desc;
      if (spec.lastWords) {
        chosen.lastWords = spec.lastWords;
      }
      if (type === 'Dragon') {
        chosen.bleedEffect = 'attack+3';
        chosen.eliteHealOtherMonster = true;
        chosen.waterfallEffect = { type: 'turnBoost', amount: 6, description: '被挤出时：waterfall 次数 +6（影响后续怪物血层）' };
      }
      if (type === 'Ogre') {
        chosen.eliteDoubleAttack = true;
        chosen.waterfallEffect = { type: 'bonusDecay', amount: 3, description: '被挤出时：所有永久伤害/护甲/法术加成 -3' };
      }
      if (type === 'Wraith') {
        chosen.lastWords = 'wraith-haunt-4';
      }
      if (type === 'Goblin') {
        chosen.goblinStealEquip = true;
        chosen.waterfallEffect = { type: 'goldLoss', amount: 12, description: '被挤出时：失去 12 金币' };
      }
      if (type === 'Skeleton') {
        chosen.waterfallEffect = { type: 'damage', amount: 15, description: '被挤出时：对英雄造成 15 点伤害' };
      }
      if (type === 'Swarm') {
        chosen.waterfallEffect = { type: 'swarmInfest', amount: 5, description: '被挤出时：在主牌堆顶加入 5 只小虫子' };
      }
      if (type === 'Golem') {
        chosen.maxDamagePerHit = 5;
        chosen.waterfallEffect = { type: 'spellDecay', amount: 3, description: '被挤出时：永久法术伤害加成 -3' };
      }
    }

    const goblinsForTrick = deck.filter(
      (c): c is GameCardData => c.type === 'monster' && c.monsterType === 'Goblin',
    );
    if (goblinsForTrick.length > 0) {
      const trickCarrier = goblinsForTrick[Math.floor(Math.random() * goblinsForTrick.length)];
      trickCarrier.goblinTrickCarrier = true;
    }

  // Weapon variety with improved values (2-6 range) — 7 candidates, pick 6
  const weaponTypes = [
    { name: 'Holy Blade', image: holyBladeImage },
    { name: 'Sword', image: axeImage },
    { name: 'Dagger', image: daggerWeaponImage },
    { name: 'Mace', image: maceImage },
    { name: '虚灵刀', image: starterGhostBladeImage },
    { name: '奥术之刃', image: arcaneBladeImage },
    { name: '战锤', image: warhammerImage },
  ];
  const selectedWeapons = [...weaponTypes].sort(() => Math.random() - 0.5).slice(0, 6);
  
  for (let i = 0; i < 6; i++) {
    const weaponType = selectedWeapons[i];
    const value = Math.floor(Math.random() * 5) + 2;
    const durability = Math.floor(Math.random() * 4) + 1;
    const card: GameCardData = {
      id: `weapon-${id++}`,
      type: 'weapon',
      name: weaponType.name,
      value: value,
      image: weaponType.image,
      durability: durability,
      maxDurability: durability,
    };
    if (weaponType.name === 'Holy Blade') {
      card.onEquipEffect = 'spell-lifesteal+1';
      card.overkillDraw = 1;
      card.description = '入场：超杀吸血 +1。超杀：抽 1 张牌。';
      card.durability = 2;
      card.maxDurability = 2;
    }
    if (weaponType.name === '虚灵刀') {
      card.durability = Math.floor(Math.random() * 2) + 2;
      card.maxDurability = card.durability;
      card.ghostBladeExile = true;
      card.description = '每次攻击后，可从坟场选择卡牌移除出游戏。';
    }
    if (weaponType.name === 'Mace') {
      card.value = Math.floor(Math.random() * 2) + 1;
      card.durability = Math.floor(Math.random() * 2) + 2;
      card.maxDurability = card.durability;
      card.description = '入场：该装备栏临时攻击 +2。攻击后掷骰：50% 概率不消耗耐久。';
      card.weaponDurabilitySaveChance = 50;
      card.onEquipEffect = 'temp-attack-2';
    }
    if (weaponType.name === 'Dagger') {
      card.value = Math.min(card.value, 3);
      card.durability = 2;
      card.maxDurability = 2;
      card.daggerSelfDestructDiscover = true;
      card.onEquipEffect = 'persuade-bonus-10';
      card.description = '入场：下次劝降成功率 +10%。攻击后，可自毁来发现专属牌。';
    }
    if (weaponType.name === 'Sword') {
      card.value = Math.floor(Math.random() * 3) + 4;
      card.durability = 1;
      card.maxDurability = 1;
      card.waterfallAttackBoost = 1;
      card.onDestroyGold = 4;
      card.description = '每次瀑流触发时，攻击力 +1。遗言：获得 4 金币。';
    }
    if (weaponType.name === '奥术之刃') {
      card.value = Math.floor(Math.random() * 2) + 1;
      const abDurability = Math.floor(Math.random() * 2) + 2;
      card.durability = abDurability;
      card.maxDurability = abDurability;
      card.postAttackSpellDamage = 1;
      card.description = '攻击后，随机对一个怪物造成 1 点法术伤害（受法术伤害加成）。';
    }
    if (weaponType.name === '战锤') {
      card.value = Math.floor(Math.random() * 3) + 1;
      card.durability = 2;
      card.maxDurability = 2;
      card.weaponStunChance = 40;
      card.onEquipEffect = 'stunCap+5';
      card.description = '入场：击晕上限 +5%。击晕率 40%。';
    }
    
    deck.push(card);
  }

  // Shield variety (2-4 range for balance) with different images per value
  const shieldTypes = [
    { name: 'Wooden Shield', value: 2, image: woodenShieldImage },
    { name: 'Iron Shield', value: 3, image: ironShieldImage },
    { name: 'Heavy Shield', value: 4, image: heavyShieldImage },
    { name: '壁垒之盾', value: 0, image: bastionShieldImage },
  ];
  
  // 2 shields of each type (8 total)
  for (let i = 0; i < 8; i++) {
    const shieldType = shieldTypes[i % shieldTypes.length];
    let durability: number;
    if (shieldType.name === 'Wooden Shield') {
      durability = Math.floor(Math.random() * 2) + 1; // 1-2
    } else if (shieldType.name === 'Iron Shield') {
      durability = Math.floor(Math.random() * 3) + 1; // 1-3
    } else if (shieldType.name === '壁垒之盾') {
      durability = 2;
    } else {
      durability = Math.floor(Math.random() * 2) + 1; // 1-2
    }
    let shieldValue = shieldType.value;
    if (shieldType.name === '壁垒之盾') {
      shieldValue = Math.floor(Math.random() * 2) + 1; // 1-2
    }
    const card: GameCardData = {
      id: `shield-${id++}`,
      type: 'shield',
      name: shieldType.name,
      value: shieldValue,
      image: shieldType.image,
      durability: durability,
      maxDurability: durability,
      armorMax: shieldValue,
    };
    if (shieldType.name === 'Heavy Shield') {
      card.damageReflect = 1;
      card.onDestroyClassDraw = 1;
      card.description = '格挡时反弹 1 点伤害给攻击者（受装备栏永久伤害加成影响）。遗言：获得 1 张专属卡。';
    }
    if (shieldType.name === 'Wooden Shield') {
      card.onDestroyHeal = 3;
      card.description = '遗言：恢复 3 点生命。';
    }
    if (shieldType.name === 'Iron Shield') {
      card.onEquipEffect = 'graveyard-to-hand';
      card.description = '入场：随机获得一张坟场的牌，移到手牌。';
    }
    if (shieldType.name === '壁垒之盾') {
      card.onEquipEffect = 'temp-armor-3';
      card.description = '入场：该装备栏临时护甲 +3。';
    }
    deck.push(card);
  }

  // Potions - bespoke utility set (6 total)
  const potionCards: Omit<GameCardData, 'id'>[] = [
    {
      type: 'potion',
      name: '治疗药水',
      value: 5,
      image: potionImage,
      potionEffect: 'heal-5',
      description: '立即回复5点生命，随后翻转为永久魔法。',
      flipTarget: {
        toCard: {
          id: 'potion-flip-heal',
          type: 'magic',
          name: '治愈余韵',
          value: 0,
          image: dedupePotionFlipHealEchoImage,
          magicType: 'permanent',
          magicEffect: '永久魔法：使用时立即回复 2 点生命。',
          description: '使用时立即回复 2 点生命。使用后回到回收袋，瀑流后可再次使用。',
        },
        destination: 'backpack',
        banner: '治疗药水翻转成"治愈余韵"，已放入背包。',
        message: '药水瓶中浮现淡淡的治愈光芒…',
      },
    },
    {
      type: 'potion',
      name: '浓缩治疗药水',
      value: 7,
      image: potionConcentratedHealImage,
      potionEffect: 'heal-14',
      description: '立即回复14点生命。',
    },
    {
      type: 'potion',
      name: '装备修复剂',
      value: 6,
      image: potionWeaponRepairImage,
      potionEffect: 'repair-choice',
      description: '左右装备都恢复2点耐久 或 左右装备都耐久上限+1。',
    },
    {
      type: 'potion',
      name: '双锋淬液',
      value: 7,
      image: potionEquipmentRepairImage,
      potionEffect: 'boost-both-slots',
      description: '左右装备栏永久伤害+1，护甲+1。',
    },
    {
      type: 'potion',
      name: '背包觉醒药',
      value: 5,
      image: potionBackpackAwakenImage,
      potionEffect: 'draw-backpack-4',
      description: '从背包随机抽最多4张牌到手牌；手牌上限+1后若仍有空位，再抽1张。背包容量+1。',
    },
    {
      type: 'potion',
      name: '洞察药剂',
      value: 6,
      image: potionInsightClassImage,
      potionEffect: 'discover-class-3',
      description: '获得三张职业卡牌。',
    },
    {
      type: 'potion',
      name: '魔法平衡药剂',
      value: 0,
      image: potionTwilightImage,
      potionEffect: 'discover-graveyard-magic',
      description: '从墓地发现一张魔法卡（3选1），随后翻到另一面。',
      flipTarget: {
        toCard: {
          id: 'potion-flip-twilight',
          type: 'magic',
          name: '余烬回响',
          value: 0,
          image: dedupePotionFlipTwilightEchoImage,
          magicType: 'instant',
          magicEffect: '使用时从背包抽 1 张手牌，并永久法术伤害 +1。',
          description: '使用时从背包抽 1 张手牌，并永久法术伤害 +1。',
        },
        destination: 'backpack',
        banner: '药剂翻转成"余烬回响"，已放入背包。',
        message: '药剂残瓶翻转出新的符文光芒…',
      },
    },
    {
      type: 'potion',
      name: '永恒铭刻药',
      value: 6,
      image: potionEternalInscribeImage,
      potionEffect: 'grant-perm-2',
      description: '选择一张没有 Perm 属性的手牌，赋予 Perm 2（被移除后进入回收袋，经 2 次瀑流返回背包）。',
    },
    {
      type: 'potion',
      name: '遗赠淬炼药',
      value: 6,
      image: potionEquipmentRepairImage,
      potionEffect: 'grant-lastwords-slot-temp-buff',
      description: '选择一个装备，使其获得遗言：该装备栏 +3 临时攻击 +3 临时护甲。',
    },
    {
      type: 'potion',
      name: '护符永铸药',
      value: 0,
      image: potionAmuletToRelicImage,
      potionEffect: 'amulet-to-eternal-relic',
      description: '选择一个护符栏中的护符，将其转化为永恒护符（移除护符，效果永久生效）。',
    },
    {
      type: 'potion',
      name: '回合汲取药',
      value: 5,
      image: potionImage,
      potionEffect: 'grant-amulet-end-turn-draw',
      description: '获得永久护符「回合汲取」：每次结束英雄回合时，从背包抽 1 张牌。',
    },
  ];

  potionCards.forEach(card => {
    deck.push({
      ...card,
      id: `potion-${id++}`,
    });
  });

  // Amulets (6 unique cards)
  const amuletCards: Omit<GameCardData, 'id'>[] = [
    {
      type: 'amulet',
      name: 'Heal Amulet',
      value: 5,
      image: lifeAmuletImage,
      description: '所有回血效果翻倍',
      amuletEffect: 'heal',
    },
    {
      type: 'amulet',
      name: 'Balance Amulet',
      value: 5,
      image: balanceAmuletImage,
      description: '左边装备栏临时攻击+3临时护甲-1，右边装备栏临时护甲+3临时攻击-1',
      amuletEffect: 'balance',
    },
    {
      type: 'amulet',
      name: 'Life Amulet',
      value: 5,
      image: lifestealAmuletImage,
      description: '超杀吸血+4。',
      amuletEffect: 'life',
    },
    {
      type: 'amulet',
      name: 'Catapult Amulet',
      value: 5,
      image: dedupeAmuletCatapultImage,
      description: '每弃置1张牌，抽2张牌。',
      amuletEffect: 'catapult',
    },
    {
      type: 'amulet',
      name: 'Flash Amulet',
      value: 5,
      image: flashAmuletImage,
      description: '所有装备攻击力减半，攻击次数+1',
      amuletEffect: 'flash',
    },
    {
      type: 'amulet',
      name: 'Strength Amulet',
      value: 5,
      image: strengthAmuletImage,
      description: '所有装备栏临时攻击+4，每攻击一次，失去2血',
      amuletEffect: 'strength',
    },
    {
      type: 'amulet',
      name: 'Graveyard Amulet',
      value: 5,
      image: dedupeAmuletGraveyardStackImage,
      description: '劝降成功时，在原怪物格堆叠2张墓地随机牌。',
      amuletEffect: 'persuade-graveyard-stack',
    },
    {
      type: 'amulet',
      name: '雷击护符',
      value: 5,
      image: strengthAmuletImage,
      description: '光环：所有击晕率 +20%（仍受击晕上限约束）。',
      amuletEffect: 'stun-rate-boost',
    },
  ];

  amuletCards.forEach(amulet => {
    deck.push({
      ...amulet,
      id: `amulet-${id++}`,
    });
  });

  // Magic cards (all instant effects)
  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '瀑流重置',
    value: 0,
    image: dedupeMagicWaterfallResetImage,
    magicType: 'instant',
    magicEffect: '将激活行的所有卡牌置于牌堆底（不打乱其余牌序），然后触发瀑布。'
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '风暴箭雨',
    value: 0,
    image: dedupeMagicStormArrowsImage,
    magicType: 'instant',
    magicEffect: '对激活行的每个怪物造成 3 点伤害。攻击对象越多越好。'
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '回响行囊',
    value: 0,
    image: dedupeMagicEchoBagImage,
    magicType: 'instant',
    magicEffect: '弃回至多 2 张手牌，从坟场发现 2 张牌，再从背包抽 2 张牌。(可超手牌上限)'
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '潮涌铸甲',
    value: 0,
    image: dedupeMagicTideArmorImage,
    magicType: 'instant',
    magicEffect: '2选1获得永恒护符：瀑流铸剑（每次攻击该栏临时攻击+2）或格挡铸甲（每次格挡该栏临时护甲+2）。可叠加。'
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '点金裁决',
    value: 0,
    image: dedupeMagicGoldJudgmentImage,
    magicType: 'instant',
    magicEffect: '对任意怪物造成等同于当前金币数量的伤害，并恢复等量生命。'
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '涌泉满手',
    value: 0,
    image: dedupeMagicFullHandSpringImage,
    magicType: 'instant',
    magicEffect: '恢复 8 点生命，手牌补充到上限（从背包抽牌）。'
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '等价交换',
    value: 0,
    image: dedupeMagicEquivalentExchangeImage,
    magicType: 'instant',
    magicEffect: '选择一件装备和一个非Boss怪物，互换它们的耐久与血层数。',
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '冥途拾遗',
    value: 0,
    image: dedupeMagicUnderworldRelicImage,
    magicType: 'instant',
    magicEffect: '坟场随机取回 3 张牌。',
    description: '一次性：从坟场随机取回至多 3 张牌加入背包（不能取回自己）。',
    knightEffect: 'graveyard-recall',
    maxUpgradeLevel: 3,
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '怀柔令',
    value: 0,
    image: persuadeScrollCharmImage,
    magicType: 'instant',
    magicEffect: '劝降费用永久 -2，下次成功率 +10%。',
    description: '一次性：劝降费用永久降低 2 金币，下次劝降成功率 +10%。',
    knightEffect: 'persuade-discount',
    maxUpgradeLevel: 2,
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '秘法精炼',
    value: 0,
    image: dedupeMagicArcaneRefineImage,
    magicType: 'instant',
    magicEffect: '升级手牌中至多 2 张魔法牌。',
    description: '一次性：选择手牌中至多 2 张可升级的魔法牌，各升级一次。',
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '万象探知',
    value: 0,
    image: dedupeMagicOmniscienceImage,
    magicType: 'instant',
    magicEffect: '翻看主牌堆顶 5 张牌，根据卡牌类型获得永久增益。',
    description: '一次性：翻看牌堆顶 5 张牌。怪物→随机装备栏攻击+1，装备→随机装备栏护甲+1，魔法→法强+1，护符→超杀吸血+1，药水→击晕上限+5%。',
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '天机铸炼',
    value: 0,
    image: dedupeMagicEventFortifyImage,
    magicType: 'instant',
    magicEffect: '选择一件装备，翻看牌堆顶 3 张牌，其中有 X 张事件牌，则该装备耐久上限 +X 并恢复 X 点耐久。',
    description: '一次性：选择一件装备，翻看牌堆顶 3 张牌。每有一张事件牌，该装备耐久度上限 +1 并恢复 1 点耐久。',
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '震慑领域',
    value: 0,
    image: dedupeMagicStunWaveImage,
    magicType: 'instant',
    magicEffect: '击晕上限 +10%。对激活行所有怪物 60% 击晕。',
    description: '一次性：击晕上限 +10%。对激活行所有怪物 60% 击晕。',
    knightEffect: 'stun-wave',
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '增幅',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: 'amplify-card',
    description: '一次性魔法：选择一张装备栏或手牌中的装备/伤害魔法，生成一张永久魔法（Perm 2）对其进行增幅（武器攻击+1，护盾护甲+1，伤害魔法伤害+1）。',
  });

  // Event cards
  const crossroadsId = `event-${id++}`;
  deck.push({
    id: crossroadsId,
    type: 'event',
    name: '命运十字路口',
    value: 0,
    image: dedupeEventFateCrossroadsImage,
    description: '打开时向左平移至被阻挡位置。若正下方有装备或护符，可破坏它并获得全部效果。选择任意选项后翻转为「命运挪移」。',
    eventChoices: [
      { text: '倾听命运的低语（发现2张专属卡）', effect: 'drawClass2', hint: '获得 2 张职业牌放入背包' },
      { text: '与命运商贩交谈（商店等级+1 并 打开商店）', effect: ['shopLevel+1', 'openShop'], hint: '商店等级+1 并立刻开启商店' },
      { text: '献祭体魄（永久 +8 生命上限）', effect: 'maxhpperm+8', hint: '上限提升会保留整局' },
      { text: '拓展行囊（背包上限 +5）', effect: 'backpackSize+5', hint: '背包容量永久增加 5' },
      { text: '选择一张牌升级', effect: 'upgradeCard', hint: '从所有可升级的牌中选择一张进行升级' },
      {
        text: '净化杂质（删 2 张牌）',
        effect: 'deleteCard:2',
        requires: [{ type: 'cardPool', pools: ['hand', 'backpack'], min: 2, message: '需要至少 2 张可删除的卡牌' }],
      },
    ],
    flipTarget: {
      toCard: {
        id: `${crossroadsId}-flip-left-swap`,
        type: 'magic',
        name: '命运挪移',
        value: 0,
        image: skillScrollImage,
        magicType: 'permanent',
        magicEffect: 'crossroads-left-swap',
        description: '永久魔法（Perm 2）：将地城行最左边的两张牌交换位置。',
        recycleDelay: 2,
      },
      destination: 'backpack',
      banner: '命运十字路口翻转为「命运挪移」，已放入背包。',
    },
  });

  const vaultId = `event-${id++}`;
  deck.push({
    id: vaultId,
    type: 'event',
    name: '秘藏宝库',
    value: 0,
    image: dedupeEventSecretVaultImage,
    description: '选择选项后翻转为「秘藏宝库（已开启）」，可重复使用。',
    eventChoices: [
      {
        text: '搜刮遗物（获得两张专属卡，随机弃回两张手牌）',
        effect: ['drawClass2', 'randomDiscardHand:2'],
        hint: '专属卡放入背包，随机弃回两张手牌',
        requires: [{ type: 'hand', min: 2, message: '需要至少 2 张手牌' }],
      },
      {
        text: '翻找黄金（掷骰决定收益）',
        hint: '30% +20金 / 30% +30金 / 40% -10金',
        diceTable: [
          { id: 'vault-gold20', range: [1, 6], label: '+20 金币', effect: 'gold+20' },
          { id: 'vault-gold30', range: [7, 12], label: '+30 金币', effect: 'gold+30' },
          { id: 'vault-gold-10', range: [13, 20], label: '-10 金币', effect: 'gold-10' },
        ],
      },
      {
        text: '翻出药剂（掷骰决定效果）',
        hint: '30% 恢复5HP / 30% 恢复10HP / 40% 受到8点伤害',
        diceTable: [
          { id: 'vault-heal5', range: [1, 6], label: '恢复 5 HP', effect: 'heal+5' },
          { id: 'vault-heal10', range: [7, 12], label: '恢复 10 HP', effect: 'heal+10' },
          { id: 'vault-dmg8', range: [13, 20], label: '受到 8 点伤害', effect: 'hp-8' },
        ],
      },
      {
        text: '寻找怀柔之道（掷骰决定劝降效果）',
        hint: '60% 下一次劝降免费 / 40% 下一次劝降成功率-10%',
        diceTable: [
          { id: 'vault-persuade-free', range: [1, 12], label: '下一次劝降免费', effect: 'persuadeNextFree' },
          { id: 'vault-persuade-penalty', range: [13, 20], label: '下一次劝降成功率 -10%', effect: 'persuadeNextRatePenalty:10' },
        ],
      },
      {
        text: '激励锋芒（掷骰为装备附加临时攻击）',
        hint: '60% 所有装备栏临时攻击力+4 / 40% 受到5伤害',
        diceTable: [
          { id: 'vault-burst4', range: [1, 12], label: '所有装备栏临时攻击力 +4', effect: 'allSlotTempAttack:4' },
          { id: 'vault-burst-fail', range: [13, 20], label: '受到 5 点伤害', effect: 'hp-5' },
        ],
      },
    ],
    flipTarget: {
      toCard: {
        id: `${vaultId}-flip`,
        type: 'event',
        name: '秘藏宝库（已开启）',
        value: 0,
        image: dedupeEventSecretVaultOpenImage,
        eventChoices: [
          { text: '翻阅卷轴（抽 3 张牌）', effect: 'drawHeroCards:3' },
          { text: '联络商贩（商店等级 +1，劝降等级 +1）', effect: ['shopLevel+1', 'persuadeLevel+1'], hint: '商店等级与劝降等级各 +1' },
          { text: '召唤商队（金币+10 且 打开商店）', effect: ['gold+10', 'openShop'], hint: '获得 10 金币并立刻开启商店' },
          { text: '深入探索（受 4 伤害，翻转回去）', effect: 'vault-flipback', hint: '受到 4 点伤害，宝库翻转回未开启状态' },
          { text: '展示权威（劝降等级 +1，击晕上限+10%）', effect: ['persuadeLevel+1', 'stunCap+10'], hint: '劝降更强怪物，击晕概率上限 +10%' },
          { text: '护甲加持（所有装备栏 临时护甲+4）', effect: 'allSlotTempArmor:4', hint: '所有装备栏获得 4 点临时护甲' },
        ],
      },
      destination: 'stay',
      message: '秘藏宝库翻转为已开启状态！',
    },
  });

  const shadowPactId = `event-${id++}`;
  deck.push({
    id: shadowPactId,
    type: 'event',
    name: '暗影契约',
    value: 0,
    image: dedupeEventShadowPactImage,
    description: '选择选项后翻转为「暗影之刺」永久魔法（扩展手牌选项除外）。',
    eventChoices: [
      { text: '签下血约（受到 8 点伤害）', effect: 'hp-8' },
      {
        id: 'shadow-pact-equip',
        text: '献出装备（破坏任一装备）',
        effect: 'destroyEquipment:any',
        hint: '会要求你选择左或右装备',
        requires: [{ type: 'equipmentAny', message: '需要至少一件装备' }],
      },
      { id: 'shadow-pact-gold', text: '支付赎金（损失 15 金币）', effect: 'gold-15', requires: [{ type: 'gold', min: 15, message: '需要至少 15 金币' }] },
      { text: '扩展手牌（手牌上限 +1，背包上限 +3，跳过翻转）', effect: ['handLimit+1', 'backpackSize+3'], skipFlip: true },
      { id: 'shadow-pact-shop', text: '贬低商贩（商店等级 -1）', effect: 'shopLevel-1', requires: [{ type: 'shopLevel', min: 1, message: '商店等级已为 0' }] },
      { id: 'shadow-pact-persuade', text: '削弱威慑（劝降等级 -1）', effect: 'persuadeLevel-1', requires: [{ type: 'persuadeLevel', min: 2, message: '劝降等级已为最低' }] },
      {
        text: '血之代价（失去 8 点生命）',
        effect: 'hp-8',
        hint: '当其他有条件的选项都无法选择时可用',
        requiresDisabledChoices: ['shadow-pact-equip', 'shadow-pact-gold', 'shadow-pact-shop', 'shadow-pact-persuade'],
        requiresDisabledReason: '仍有其他有条件的选项可用',
      },
    ],
    flipTarget: {
      toCard: {
        id: `${shadowPactId}-flip`,
        type: 'magic',
        name: '暗影之刺',
        value: 0,
        image: dedupeMagicShadowSpikeFlipImage,
        magicType: 'permanent',
        magicEffect: '永久：对怪造成伤害；用后叠刺+1，回回收袋。',
        description: '每用过一次叠刺+1；卡面数字为叠刺层数。',
        scalingDamage: 1,
      },
      destination: 'backpack',
      message: '暗影契约翻转为「暗影之刺」，已放入背包。',
    },
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '共鸣熔炉',
    value: 0,
    image: dedupeEventResonanceForgeImage,
    description: '选择选项后翻转为「熔炉之心」护符。',
    eventChoices: [
      { text: '左槽淬火（左槽永久伤害 +2，恢复2耐久）', effect: ['slotLeftDamage+2', 'repairSlot:left:2'] },
      { text: '右槽固化（右槽永久护甲 +2，恢复2耐久）', effect: ['slotRightDefense+2', 'repairSlot:right:2'] },
      { text: '翻转轨道（左右装备互换，各+1耐久上限，各恢复1耐久）', effect: ['swapEquipmentSlots', 'slotLeftDurMax+1', 'slotRightDurMax+1', 'repairSlot:both:1'] },
      { text: '左槽铸盾（左槽永久护甲 +2，恢复2耐久）', effect: ['slotLeftDefense+2', 'repairSlot:left:2'] },
      { text: '右槽磨刃（右槽永久伤害 +2，恢复2耐久）', effect: ['slotRightDamage+2', 'repairSlot:right:2'] },
    ],
    flipTarget: {
      toCard: {
        id: 'amulet-flip-gold',
        type: 'amulet',
        name: '熔炉之心',
        value: 0,
        image: forgeHeartAmuletImage,
        description: `每有一张牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。可熔炉灵焰`,
        amuletEffect: 'flip-gold',
      },
      destination: 'backpack',
      banner: '共鸣熔炉翻转为「熔炉之心」，已放入背包。',
    },
  });

  const greedyAltarEventId = `event-${id++}`;
  deck.push({
    id: greedyAltarEventId,
    type: 'event',
    name: '破坏祭坛',
    value: 0,
    image: dedupeEventGreedyAltarImage,
    description: '选择选项后翻转为「破印遗物」一次性魔法。',
    eventChoices: [
      {
        id: 'greedy-left',
        text: '献祭所有左手装备（每个 +10 金币）',
        effect: 'discardAllLeftForGold+10',
        requires: [{ type: 'equipment', slot: 'left', message: '左侧装备栏为空' }],
      },
      {
        id: 'greedy-right',
        text: '献祭所有右手装备（每个 +10 金币）',
        effect: 'discardAllRightForGold+10',
        requires: [{ type: 'equipment', slot: 'right', message: '右侧装备栏为空' }],
      },
      {
        id: 'greedy-amulet',
        text: '粉碎所有护符（每个 +10 金币）',
        effect: 'amuletsToGold+10',
        requires: [{ type: 'amulet', message: '需要至少一个护符' }],
      },
      {
        id: 'greedy-blood',
        text: '献血离开（掉 8 HP）',
        effect: 'hp-8',
        hint: '仅当其他献祭方式全部不可用时可选',
        requiresDisabledChoices: ['greedy-left', 'greedy-right', 'greedy-amulet'],
        requiresDisabledReason: '仍有其他献祭方式可用',
      },
      {
        id: 'greedy-delete',
        text: '焚毁卡牌（选择至多 3 张牌删除，每张 -3 金币）',
        effect: 'deleteCardForGold:3:-3',
        hint: '选择至多 3 张卡牌永久删除，每删 1 张消耗 3 金币',
        requires: [{ type: 'cardPool', pools: ['hand', 'backpack'], min: 1, message: '需要至少 1 张可删除的卡牌' }],
      },
      {
        id: 'greedy-discard-all',
        text: '弃回所有手牌（每张 +5 金币）',
        effect: 'discardAllHandForGold:5',
        hint: '弃回所有手牌并为每张获得 5 金币',
        requires: [{ type: 'hand', min: 1, message: '需要至少 1 张手牌' }],
      },
    ],
    waterfallEffect: { type: 'destroyAllEquipment', amount: 0, description: '被挤出时：破坏玩家所有装备' },
    flipTarget: {
      toCard: {
        id: `${greedyAltarEventId}-flip`,
        type: 'magic',
        name: '破印遗物',
        value: 0,
        image: dedupeEventGreedyAltarImage,
        magicType: 'instant',
        knightEffect: 'graveyard-discover-equip-amulet',
        magicEffect: '一次性：从坟场发现一张装备或护符（三选一）。',
        description: '从坟场发现一张装备或护符（三选一），加入背包。',
      },
      destination: 'backpack',
      message: '破坏祭坛翻转为「破印遗物」！',
      banner: '破坏祭坛翻转为「破印遗物」，已放入背包。',
    },
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '战血荣誉',
    value: 0,
    image: dedupeEventBattleHonorImage,
    description: '结算后，此卡右侧格子上的所有怪物将被激怒（进入交战）。',
    eventChoices: [
      { text: '整理呼吸（回复 8 HP，超杀吸血+1）', effect: ['heal+8', 'spellLifesteal+1'] },
      { text: '回收战利品（金币 +15，打开商店）', effect: ['gold+15', 'openShop'] },
      { text: '唤醒底牌（获得底部三张专属卡）', effect: 'classBottom+3' },
      {
        text: '战血铭刻（翻转为永久法术）',
        effect: 'flipToHonorBloodMagic',
        hint: '翻转为「战血之印」：打出失去 1 生命并选一件装备 +1 耐久；被弃时将激活行所有怪物攻击力 -2',
        requires: [
          {
            type: 'leftmostIsEnraged',
            message:
              '地城激活行从左起第一个有牌的格子必须是怪物，且该怪物已与英雄交战；左侧空列不占用此判定。',
          },
        ],
      },
      {
        text: '战血横扫（翻转为永久法术）',
        effect: 'flipToHonorSweepMagic',
        hint: '翻转为「战血横扫」：选武器对激活行怪造成等同攻击力的多轮法术伤害（不耗耐久），该栏临时攻击 -5；可升级增加轮数',
        requires: [
          {
            type: 'leftmostIsEnraged',
            message:
              '地城激活行从左起第一个有牌的格子必须是怪物，且该怪物已与英雄交战；左侧空列不占用此判定。',
          },
        ],
      },
      { text: '强化意志（击晕上限 +10%，翻转为永久魔法）', effect: ['stunCap+10', 'flipToMonsterAttackDebuff'], hint: '击晕上限 +10%，翻转为 Perm 1 魔法：激活行怪物攻击-2' },
      { text: '选择至多两张牌升级', effect: 'upgradeCard:2', hint: '从所有可升级的牌中选择至多两张进行升级' },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '血咒仪式',
    value: 0,
    image: dedupeEventBloodCurseImage,
    eventChoices: [
      {
        id: 'curse-flip',
        text: '翻转卷轴（获得血咒）',
        effect: 'flipToCurse',
        hint: '事件卡本身会翻转成永久诅咒并进入背包',
      },
      {
        id: 'curse-discard-hand',
        text: '献祭手牌（手牌全部弃回）',
        effect: 'discardHandAll',
        requires: [{ type: 'hand', min: 1, message: '需要至少 1 张手牌' }],
      },
      {
        id: 'curse-hand-all-recycle',
        text: '缚咒收纳（所有手牌移入回收袋）',
        effect: 'handAllToRecycleBag',
        requires: [{ type: 'hand', min: 1, message: '需要至少 1 张手牌' }],
        hint: '全部手牌进入永久魔法回收袋（含不可回收牌）',
      },
      {
        id: 'curse-pack-shrink',
        text: '束缚空间（背包容量 -4）',
        effect: 'backpackSize-4',
        hint: '背包容量永久降低 4，超过的卡牌会被随机放入回收袋',
      },
      {
        id: 'curse-hand-shrink',
        text: '封印牌位（手牌上限 -1，翻转为武器）',
        effect: ['handLimit-1', 'flipToCurseWeapon'],
        hint: '手牌上限永久降低 1，翻转为 2攻1耐久武器（入场：耐久度上限+1）',
      },
      {
        id: 'curse-atk-recall',
        text: '血蚀锋刃（所有装备栏永久攻击 -1，翻转成「回收术」）',
        effect: ['allSlotDamage-1', 'flipToRecallEquip'],
        hint: '左右装备栏永久伤害各 -1，事件卡翻转为「回收术」永久魔法放入背包',
      },
      {
        id: 'curse-def-blessing',
        text: '血蚀铠甲（所有装备栏永久护甲 -1，翻转成「不灭赐福」）',
        effect: ['allSlotShield-1', 'flipToUndyingBlessing'],
        hint: '左右装备栏永久护甲各 -1，事件卡翻转为「不灭赐福」永久魔法放入背包',
      },
    ],
    waterfallEffect: { type: 'boostRowMonsterAttack', amount: 5, description: '被挤出时：所有怪物攻击 +5' },
  });

  const crimsonPactId = `event-${id++}`;
  deck.push({
    id: crimsonPactId,
    type: 'event',
    name: '双重燃烧',
    value: 0,
    image: dedupeEventCrimsonPactImage,
    description: '选择选项后翻转为「双重燃烧（觉醒）」。',
    eventChoices: [
      { text: '血价交易（-2 HP，发现专属）', effect: 'hp-2,discoverClass' },
      {
        text: '捐献财富（-4 金币，商店等级 +1）',
        effect: 'gold-4,shopLevel+1',
        requires: [{ type: 'gold', min: 4, message: '需要至少 4 金币' }],
      },
      {
        text: '焚尽旧物（随机弃回 2 张手牌，法伤 +1）',
        effect: ['randomDiscardHand:2', 'spellDamage+1'],
        requires: [{ type: 'hand', min: 2, message: '需要至少 2 张手牌' }],
      },
      { text: '血魂灌注（-3 血上限，超杀吸血 +1）', effect: 'maxhpperm-3,spellLifesteal+1', hint: '永久减少 3 点最大生命值，换取超杀吸血' },
      { text: '行囊交锋（-2 背包上限，劝降等级 +1）', effect: 'backpackSize-2,persuadeLevel+1', hint: '背包缩小但可劝降更强的怪物' },
    ],
    flipTarget: {
      toCard: {
        id: `${crimsonPactId}-flip`,
        type: 'event',
        name: '双重燃烧（觉醒）',
        value: 0,
        image: dedupeEventCrimsonPactAwakenedImage,
        description: '使用后进入墓地。若预览行正上方是魔法牌，触发魔法共鸣，翻转为「虚空置换」永久魔法。',
        eventChoices: [
          { text: '鲜血献祭（-6 HP，发现专属）', effect: 'hp-6,discoverClass' },
          {
            text: '黄金燃祭（-12 金币，商店等级 +1）',
            effect: 'gold-12,shopLevel+1',
            requires: [{ type: 'gold', min: 12, message: '需要至少 12 金币' }],
          },
          {
            text: '灵魂焚烧（随机弃回 4 张手牌，法伤 +1）',
            effect: ['randomDiscardHand:4', 'spellDamage+1'],
            requires: [{ type: 'hand', min: 4, message: '需要至少 4 张手牌' }],
          },
          { text: '觉醒血魂（-8 血上限，超杀吸血 +1）', effect: 'maxhpperm-8,spellLifesteal+1', hint: '永久减少 8 点最大生命值，换取超杀吸血' },
          { text: '觉醒行囊（-5 背包上限，劝降等级 +1）', effect: 'backpackSize-5,persuadeLevel+1', hint: '背包大幅缩小但可劝降更强的怪物' },
        ],
      },
      destination: 'stay',
      message: '双重燃烧觉醒！代价更高，但仍可反复使用。',
    },
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '药剂遗稿',
    value: 0,
    image: dedupeEventPotionManuscriptImage,
    eventChoices: [
      { text: '翻转成「回响残页」', effect: 'flipToDiscardDrawMagic', hint: '翻转为永久魔法：被弃回时，抽 2 张牌' },
      { text: '翻转成「纸灰药剂」', effect: 'flipToPaperAsh', hint: '翻转为永久法术伤害 +2、最大生命值 -5 的药剂' },
      { text: '翻转成「淬炼药剂」', effect: 'flipToLeftDurabilityPotion', hint: '翻转为左装备栏耐久上限 +2 的药剂（翻转后为右装备栏耐久上限 +2）' },
      { text: '翻转成「置换药剂」', effect: 'flipToEquipSwapPotion', hint: '翻转为药水：选择一个装备回手，若另一栏有装备则换到该位置' },
      { text: '翻转成「扩容药剂」', effect: 'flipToHandLimitPotion', hint: '翻转为药水：永久手牌上限 +1' },
      {
        text: '翻转成「灵思药剂」',
        effect: 'flipToClassMagicDiscoverPotion',
        hint: '翻转为药水：使用时从专属牌堆发现一张魔法牌（三选一）',
      },
      { text: '获得两张「升级卷轴」', effect: 'grantTwoUpgradeScrolls', hint: '直接获得两张一次性升级卷轴放入背包' },
    ],
  });

  const cryptId = `event-${id++}`;
  deck.push({
    id: cryptId,
    type: 'event',
    name: '墓语密室',
    value: 0,
    image: dedupeEventCryptWhisperImage,
    description: '左右两侧都是怪物时，翻转为「墓语回响」；否则翻转为「墓语遗愿」。',
    eventChoices: [
      {
        text: '净化杂质（删 3 张牌）',
        effect: 'deleteCard:3',
        requires: [
          {
            type: 'cardPool',
            pools: ['hand', 'backpack'],
            min: 3,
            message: '需要至少 3 张可删除的卡牌',
          },
        ],
      },
      {
        text: '坟场召回（召回2次）',
        effect: ['graveyardDiscover', 'graveyardDiscover'],
        requires: [{ type: 'graveyard', min: 1, message: '坟场中没有可召回的卡牌' }],
      },
      { text: '召唤商贩（发现一张专属magic牌，打开商店）', effect: ['discoverClassMagic', 'openShop'] },
      { text: '空间扩展（背包上限 +5）', effect: 'backpackSize+5' },
      { text: '强化意志（发现专属武器，击晕上限 +10%）', effect: ['stunCap+10', 'discoverClassWeapon'], hint: '发现一张专属武器，击晕概率上限 +10%' },
      { text: '威压交涉（劝降等级+1，劝降费用 -2）', effect: ['persuadeLevel+1', 'persuadeCost-2'], hint: '劝降等级提升，费用永久减少 2' },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '奇术商会',
    value: 0,
    image: dedupeEventArcaneGuildImage,
    eventChoices: [
      { text: '思绪翻涌（获得2张专属牌，加入手上）', effect: 'drawClassToHand:2', hint: '从专属牌堆抽 2 张直接加入手牌' },
      { text: '扩张人脉（商店等级 +1，打开商店）', effect: ['shopLevel+1', 'openShop'] },
      {
        text: '挖掘遗物（坟场发现 2 张）',
        effect: ['graveyardDiscover', 'graveyardDiscover'],
        requires: [{ type: 'graveyard', min: 1, message: '坟场中没有可召回的卡牌' }],
      },
      { text: '翻转商会卷轴', effect: 'guildFlipToMagic', hint: '翻转为永久魔法「血金术」，放入背包' },
      { text: '展示权威（劝降等级 +1，下次劝降免费）', effect: ['persuadeLevel+1', 'persuadeNextFree'], hint: '劝降更强怪物，下次劝降不花金币' },
      { text: '整合回收袋（回收袋洗回背包）', effect: 'recycleToBackpack', hint: '回收袋所有牌剩余瀑流 -1，就绪的牌回背包，获得「回收轮转」魔法' },
      { text: '翻转为「奇术轮转」', effect: 'guildFlipToHandRecycleMagic', hint: '翻转为永久魔法：所有手牌移入回收袋，再从回收袋随机 2 张移到手上' },
    ],
  });

  const fateDiceId = `event-${id++}`;
  deck.push({
    id: fateDiceId,
    type: 'event',
    name: '命运骰盅',
    value: 0,
    image: dedupeEventFateDiceCupImage,
    description: '掷骰后翻转为「命运之刃」建筑。',
    eventChoices: [
      {
        text: '掷出不同结果：金币+10并打开商店/商店等级+1并永久劝降费用-2/法术伤害+1并超杀吸血+1/摧毁所有护符/发现两张专属卡，然后翻转成"命运之刃"。',
        hint: '20% 触发不同奖励或惩罚',
        diceTable: [
          { id: 'dice11-shop', range: [1, 4], label: '金币+10，打开商店', effect: ['gold+10', 'openShop'] },
          { id: 'dice11-level', range: [5, 8], label: '商店等级 +1，永久劝降费用-2', effect: ['shopLevel+1', 'persuadeCost-2'] },
          { id: 'dice11-spell', range: [9, 12], label: '法术伤害 +1，超杀吸血+1', effect: ['spellDamage+1', 'spellLifesteal+1'] },
          { id: 'dice11-amulets', range: [13, 16], label: '摧毁所有护符', effect: 'removeAllAmulets' },
          { id: 'dice11-discover', range: [17, 20], label: '发现两张专属卡', effect: 'drawClass2' },
          { id: 'dice11-lifesteal', range: [1, 10], label: '超杀吸血 +2', effect: 'spellLifesteal+2' },
          { id: 'dice11-swapslots', range: [11, 20], label: '交换左右装备，各恢复1耐久', effect: ['swapEquipmentSlots', 'repairSlot:both:1'] },
        ],
      },
    ],
    flipTarget: {
      toCard: {
        id: `${fateDiceId}-flip`,
        type: 'building',
        name: '命运之刃',
        value: 0,
        image: dedupeEventBladeOfFateBuildingImage,
        isGhost: true,
        fury: 1,
        hpLayers: 1,
        currentLayer: 1,
        hp: 3,
        maxHp: 3,
        description:
          '建筑：仅血量与血层，不攻击；可被伤害直至毁坏后进坟场。从手牌打出时失去 5 点生命。出场或换位时获得一次释放机会：右侧为药水/武器/护盾/事件则摧毁并送入坟场；右侧为怪物则激怒，直接打掉 2 层血（可击杀）；右侧无牌则从背包抽 2 张牌。',
        eventChoices: [
          { text: '释放命运之刃', hint: '对右侧相邻卡牌造成效果（事件会进坟场）', effect: 'fate-dice-strike' },
        ],
      },
      destination: 'stay',
      message: '命运骰盅翻转为命运之刃！',
    },
  });

  const chaosDiceId = `event-${id++}`;
  deck.push({
    id: chaosDiceId,
    type: 'event',
    name: '混沌骰局',
    value: 0,
    image: dedupeEventChaosDiceGameImage,
    description: '掷骰后翻转为「混沌冲击」永久魔法。',
    eventChoices: [
      {
        text: '20%掷出不同结果：金币+10并打开商店/背包加入一张诅咒/删除2张牌/获得2张专属卡/回收袋洗回背包并抽2张牌，并翻转为"混沌冲击"。',
        hint: '20% 概率触发不同命运',
        diceTable: [
          { id: 'dice12-shop', range: [1, 4], label: '金币+10，打开商店', effect: ['gold+10', 'openShop'] },
          { id: 'dice12-curse', range: [5, 8], label: '背包加入一张诅咒', effect: 'addCurse' },
          {
            id: 'dice12-delete',
            range: [9, 12],
            label: '删除 2 张牌',
            effect: 'deleteCard:2',
          },
          { id: 'dice12-class', range: [13, 16], label: '获得 2 张专属卡', effect: 'drawClass2' },
          { id: 'dice12-draw', range: [17, 20], label: '回收袋洗回背包，抽 2 张牌', effect: ['recycleToBackpack', 'drawHeroCards:2'] },
          { id: 'dice12-persuade-cost', range: [1, 20], label: '下一次劝降费用 +10', effect: 'persuadeNextCostIncrease:10' },
          { id: 'dice12-upgrade', range: [1, 20], label: '选择一张牌升级', effect: 'upgradeCard' },
        ],
      },
    ],
    flipTarget: {
      toCard: {
        id: `${chaosDiceId}-flip`,
        type: 'magic',
        name: '混沌冲击',
        value: 0,
        image: dedupeMagicChaosImpactFlipImage,
        magicType: 'permanent',
        magicEffect: '永久魔法：对一个怪物造成 3 点伤害。超杀：抽 2 张牌。(可超手牌上限)',
        description: '对一个怪物造成 3 点伤害。超杀：抽 2 张牌。(可超手牌上限)',
      },
      destination: 'backpack',
      message: '混沌骰局翻转为混沌冲击！',
    },
  });

  const timeRiftId = `event-${id++}`;
  deck.push({
    id: timeRiftId,
    type: 'event',
    name: '时空收缩',
    value: 0,
    image: dedupeEventTimeRiftImage,
    description: '掷骰后翻转为「时空镜像」永久魔法。',
    eventChoices: [
      {
        text: '掷出不同结果：锋刃祝福/时空收缩/空间代价。',
        hint: '35% 锋刃祝福 / 35% 时空收缩 / 30% 空间代价',
        diceTable: [
          { id: 'rift-burst', range: [1, 7], label: '锋刃祝福：所有装备栏临时攻击+4', effect: 'allSlotTempAttack:4' },
          { id: 'rift-shrink', range: [8, 14], label: '时空收缩：Waterfall 进度 -2', effect: 'turnCount-2' },
          { id: 'rift-cost', range: [15, 20], label: '空间代价：背包 -2，激活法术回响', effect: ['backpackSize-2', 'flipToDoubleNextMagic'] },
          { id: 'rift-shoplevel', range: [1, 10], label: '时空侵蚀：商店等级 -1，劝降等级-1', effect: ['shopLevel-1', 'persuadeLevel-1'] },
          { id: 'rift-monsteratk', range: [11, 20], label: '时空压缩：激活行怪物攻击力 -3', effect: 'activeRowMonsterAttack-3' },
        ],
      },
    ],
    flipTarget: {
      toCard: {
        id: `${timeRiftId}-flip`,
        type: 'magic',
        name: '时空镜像',
        value: 0,
        image: dedupeMagicTimeMirrorFlipImage,
        magicType: 'permanent',
        magicEffect: 'equalize-temp-attack-armor',
        description: '永久魔法（Perm 2）：选择一个装备栏，临时攻击 +2，然后使得临时攻击和临时护甲相等（增加较低的一方）。',
        recycleDelay: 2,
      },
      destination: 'backpack',
      message: '时空收缩翻转为时空镜像！',
    },
  });

  const arcaneCorridorId = `event-${id++}`;
  deck.push({
    id: arcaneCorridorId,
    type: 'event',
    name: '奥术回廊',
    value: 0,
    image: skillScrollImage,
    description: '选择选项后翻转为「奥术风暴」或「奥术护盾」。',
    eventChoices: [
      {
        text: '法术回响（下一张Magic触发两次）',
        effect: 'flipToDoubleNextMagic',
        hint: '直接激活法术回响：下一张法术的效果将触发两次，翻转为「奥术风暴」',
      },
      {
        text: '发现一张专属Magic卡',
        effect: 'discoverClassMagic',
        hint: '从专属牌堆发现一张魔法/英雄魔法牌（三选一），翻转为「奥术风暴」',
      },
      {
        text: '获得1张专属Hero Magic',
        effect: 'drawClassHeroMagic:1',
        hint: '从专属牌堆抽取1张英雄魔法卡放入背包，翻转为「奥术风暴」',
      },
      {
        id: 'arcane-starter-magic',
        text: '发现一张起始背包的Magic卡',
        effect: ['discoverStarterMagic', 'flipToArcaneShield'],
        hint: '从起始背包候选魔法池中发现一张（三选一），翻转为「奥术护盾」',
        skipFlip: true,
      },
      {
        id: 'arcane-graveyard-magic',
        text: '发现一张坟场的Magic卡',
        effect: ['graveyardDiscoverMagic', 'flipToArcaneShield'],
        hint: '从坟场中发现一张魔法卡加入背包，翻转为「奥术护盾」',
        requires: [{ type: 'graveyard', min: 1, message: '坟场中没有卡牌' }],
        skipFlip: true,
      },
      {
        id: 'arcane-recycle-magic',
        text: '回收袋至多2张Magic移到手上',
        effect: ['recycleBagMagicToHand:2', 'flipToArcaneShield'],
        hint: '从回收袋中取出至多2张魔法卡加入手牌，翻转为「奥术护盾」',
        skipFlip: true,
      },
    ],
    flipTarget: {
      toCard: {
        id: `${arcaneCorridorId}-flip`,
        type: 'magic',
        name: '奥术风暴',
        value: 0,
        image: skillScrollImage,
        magicType: 'permanent',
        magicEffect: 'arcane-storm-magic-count',
        description: '永久魔法（Perm 1）：造成 X 点伤害，X = 已使用的魔法卡数量。使用后计数清零。',
        recycleDelay: 1,
      },
      destination: 'backpack',
      message: '奥术回廊翻转为「奥术风暴」，已放入背包。',
    },
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '劝降祭典',
    value: 0,
    image: persuadeScrollCharmImage,
    description: '若装备着怀柔之印或劝降归袋符，将升级它们。',
    eventChoices: [
      {
        text: '掷出劝降骰：劝降等级+1/劝降费用-2/连劝减半/种族加成/耐久增强',
        hint: '20% 概率触发不同劝降增强',
        effect: 'upgradePersuadeAmulets',
        diceTable: [
          { id: 'persuade-dice-level', range: [1, 4], label: '劝降等级 +1', effect: 'persuadeLevel+1' },
          { id: 'persuade-dice-cost', range: [5, 8], label: '劝降费用永久 -2', effect: 'persuadeCost-2' },
          { id: 'persuade-dice-same-halve', range: [9, 12], label: '连续劝降同一怪物，第二次费用减半', effect: 'persuadeSameTargetCostHalve' },
          { id: 'persuade-dice-race', range: [13, 16], label: 'Skeleton/Wraith 劝降率 +20%', effect: 'persuadeRaceBonus:Skeleton,Wraith:20' },
          { id: 'persuade-dice-durability', range: [17, 20], label: '劝降成功的怪物起始耐久 +1', effect: 'persuadeSuccessDurabilityBonus+1' },
        ],
      },
    ],
  });

  const cursedDiceId = `event-${id++}`;
  deck.push({
    id: cursedDiceId,
    type: 'event',
    name: '诅咒骰局',
    value: 0,
    image: dedupeEventCursedDiceImage,
    description: '掷骰后翻转为「诅咒碑」建筑。',
    waterfallEffect: { type: 'destroyAllAmuletsAndDiscardHand', amount: 0, description: '被挤出时：摧毁所有护符，弃回所有手牌' },
    eventChoices: [
      {
        text: '掷出诅咒骰：装备攻击减半/法伤减半/装备护甲减半/超杀吸血-3/护符上限-1',
        hint: '20% 概率触发不同惩罚，然后翻转为「诅咒碑」',
        diceTable: [
          { id: 'cursed-dice-atk-halve', range: [1, 4], label: '所有装备栏永久攻击加成减半', effect: 'halveSlotDamageBonus' },
          { id: 'cursed-dice-spell-halve', range: [5, 8], label: '法术伤害加成减半', effect: 'halveSpellDamageBonus' },
          { id: 'cursed-dice-armor-halve', range: [9, 12], label: '所有装备栏永久护甲加成减半', effect: 'halveSlotShieldBonus' },
          { id: 'cursed-dice-lifesteal-loss', range: [13, 16], label: '超杀吸血 -3', effect: 'spellLifesteal-3' },
          { id: 'cursed-dice-amulet-cap', range: [17, 20], label: '护符栏上限 -1', effect: 'amuletCapacity-1' },
        ],
      },
    ],
    flipTarget: {
      toCard: {
        id: `${cursedDiceId}-flip`,
        type: 'building',
        name: '诅咒碑',
        value: 0,
        image: dedupeEventCursedDiceBuildingImage,
        buildingAura: 'adjacent-magic-immune',
        isGhost: true,
        fury: 1,
        hpLayers: 1,
        currentLayer: 1,
        hp: 8,
        maxHp: 8,
        description:
          '建筑（血量 8）：光环——左右相邻格中的怪物不受玩家魔法伤害。可被攻击摧毁。',
      },
      destination: 'stay',
      message: '诅咒骰局翻转为诅咒碑！',
      banner: '诅咒骰局翻转为「诅咒碑」',
    },
  });

  // ---------------------------------------------------------------------------
  // Event #16: 战备工坊 (Arsenal Workshop)
  // ---------------------------------------------------------------------------
  const arsenalWorkshopId = `event-${id++}`;
  deck.push({
    id: arsenalWorkshopId,
    type: 'event',
    name: '战备工坊',
    value: 0,
    image: skillScrollImage,
    description: '翻转条件：激活行有至少 1 张装备牌时，翻转为「装备附魔」。',
    eventChoices: [
      {
        id: 'arsenal-left-dur',
        text: '左装备栏：耐久上限+1，恢复2点耐久',
        effect: ['slotLeftDurMax+1', 'repairSlot:left:2'],
        hint: '左装备栏的装备 +1 耐久上限并恢复 2 点耐久',
        requires: [{ type: 'equipment', slot: 'left', message: '左装备栏没有装备' }],
      },
      {
        id: 'arsenal-right-dur',
        text: '右装备栏：耐久上限+1，恢复2点耐久',
        effect: ['slotRightDurMax+1', 'repairSlot:right:2'],
        hint: '右装备栏的装备 +1 耐久上限并恢复 2 点耐久',
        requires: [{ type: 'equipment', slot: 'right', message: '右装备栏没有装备' }],
      },
      {
        id: 'arsenal-swap',
        text: '左右装备互换，各自+1耐久',
        effect: ['swapEquipmentSlots', 'repairSlot:both:1'],
        hint: '交换左右装备位置，各恢复 1 点耐久',
        requires: [{ type: 'equipmentAny', message: '至少需要一件装备' }],
      },
      {
        id: 'arsenal-left-extra',
        text: '左装备栏本回合攻击次数+1',
        effect: 'slotLeftExtraAttack',
        hint: '左装备栏本回合可多攻击一次',
      },
      {
        id: 'arsenal-right-extra',
        text: '右装备栏本回合攻击次数+1',
        effect: 'slotRightExtraAttack',
        hint: '右装备栏本回合可多攻击一次',
      },
      {
        id: 'arsenal-discard-equip',
        text: '弃置所有手牌装备，每张换一张专属装备',
        effect: 'discardHandEquipForClassEquip',
        hint: '弃置手牌中所有装备卡，每弃置一张从专属牌堆获得一张装备',
      },
    ],
    flipTarget: {
      toCard: {
        id: `${arsenalWorkshopId}-flip`,
        type: 'magic',
        name: '装备附魔',
        value: 0,
        image: skillScrollImage,
        magicType: 'permanent',
        magicEffect: 'equipment-enchant-discard',
        description: '永久魔法（Perm 2）：弃置手牌中一张装备，将其攻击/护甲值随机附加到装备栏的某件装备上。',
        recycleDelay: 2,
      },
      destination: 'backpack',
      message: '战备工坊翻转为「装备附魔」，已放入背包。',
    },
    flipCondition: 'activeRowEquipment:1',
  });

  // ---------------------------------------------------------------------------
  // Event #18: 附魔祭坛 (Enchantment Altar)
  // ---------------------------------------------------------------------------
  const enchantAltarId = `event-${id++}`;
  deck.push({
    id: enchantAltarId,
    type: 'event',
    name: '附魔祭坛',
    value: 0,
    image: skillScrollImage,
    description: '若此牌下方有堆叠牌，处理后将消耗下方牌并驻留。可翻转为「祭坛秘术」。',
    stayIfStacked: true,
    eventChoices: [
      {
        id: 'altar-shop',
        text: '商店等级+1，打开商店',
        effect: ['shopLevel+1', 'openShop'],
        hint: '商店等级提升 1 级，并立即打开商店',
        skipFlip: true,
      },
      {
        id: 'altar-flank',
        text: '选择手牌赋予「侧击：抽1张牌」',
        effect: 'grantFlankDraw:1',
        hint: '选择一张手牌，赋予侧击效果（打出时处于手牌最左/最右位置时抽1张牌）',
        requires: [{ type: 'hand', min: 1, message: '需要至少 1 张手牌' }],
        skipFlip: true,
      },
      {
        id: 'altar-amulet-perm',
        text: '选择护符赋予 Perm 2',
        effect: 'grantAmuletPerm',
        hint: '选择一个护符，赋予 Perm 2（被移除后经 2 次瀑流返回背包）',
        requires: [{ type: 'amulet', message: '没有已装备的护符' }],
        skipFlip: true,
      },
      {
        id: 'altar-transform-gold',
        text: '选择手牌赋予「转型：+3金币」',
        effect: 'grantTransformGold:3',
        hint: '选择一张手牌，赋予转型效果（打出前一张牌类型不同时获得 3 金币）',
        requires: [{ type: 'hand', min: 1, message: '需要至少 1 张手牌' }],
        skipFlip: true,
      },
      {
        id: 'altar-flip',
        text: '翻转为「祭坛秘术」即时魔法',
        effect: 'noop',
        hint: '该牌翻转为一次性魔法：发现 1 张专属 Magic 卡',
      },
    ],
    flipTarget: {
      toCard: {
        id: `${enchantAltarId}-flip`,
        type: 'magic',
        name: '祭坛秘术',
        value: 0,
        image: skillScrollImage,
        magicType: 'instant',
        magicEffect: 'altar-discover-class-magic',
        description: '一次性魔法：发现 1 张专属 Magic 卡。',
      },
      destination: 'backpack',
      message: '附魔祭坛翻转为「祭坛秘术」，已放入背包。',
    },
  });

  // ---------------------------------------------------------------------------
  // Event #19: 赋能神殿 (Empowerment Shrine)
  // ---------------------------------------------------------------------------
  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '赋能神殿',
    value: 0,
    image: dedupeEventResonanceForgeImage,
    description: '掷骰子，为一张手牌赋予侧击或转型效果。',
    eventChoices: [
      {
        text: '掷出赋能骰：侧击劝降-1/侧击击晕+5%/转型抽2/转型回2血/侧击伤害5',
        hint: '随机赋予一张手牌新的侧击或转型效果',
        effect: 'noop',
        requires: [{ type: 'hand', min: 1, message: '需要至少 1 张手牌' }],
        diceTable: [
          { id: 'shrine-flank-persuade', range: [1, 4] as [number, number], label: '侧击：劝降费用永久 -1', effect: 'grantFlankPersuadeCost:1' },
          { id: 'shrine-flank-stun', range: [5, 8] as [number, number], label: '侧击：击晕上限 +5%', effect: 'grantFlankStunCap:5' },
          { id: 'shrine-transform-draw', range: [9, 12] as [number, number], label: '转型：抽 2 张牌', effect: 'grantTransformDraw:2' },
          { id: 'shrine-transform-heal', range: [13, 16] as [number, number], label: '转型：恢复 2 HP', effect: 'grantTransformHeal:2' },
          { id: 'shrine-flank-damage', range: [17, 20] as [number, number], label: '侧击：对随机怪物造成 5 点伤害', effect: 'grantFlankDamage:5' },
        ],
      },
    ],
  });

  // ---------------------------------------------------------------------------
  // Event #20: 增幅仪式 (Amplification Ritual)
  // ---------------------------------------------------------------------------
  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '增幅仪式',
    value: 0,
    image: dedupeEventResonanceForgeImage,
    description: '可将一张牌增幅为祭坛，或复制已增幅的卡牌。',
    eventChoices: [
      {
        id: 'amplify-equip',
        text: '选择装备栏的一件装备，增幅为祭坛',
        effect: 'amplify-altar-from-equip',
        hint: '选择一个装备栏的装备，该装备获得增幅标记，事件翻转为增幅祭坛（幽灵建筑）',
        requires: [{ type: 'equipmentAny', message: '没有已装备的装备' }],
      },
      {
        id: 'amplify-hand',
        text: '选择手牌中的装备或魔法，增幅为祭坛',
        effect: 'amplify-altar-from-hand',
        hint: '选择一张手牌（装备或即时魔法），该牌获得增幅标记，事件翻转为增幅祭坛',
        requires: [{ type: 'hand', min: 1, message: '需要至少 1 张手牌' }],
      },
      {
        id: 'amplify-discover',
        text: '发现专属牌（装备或魔法），增幅为祭坛',
        effect: 'amplify-altar-discover-class',
        hint: '从专属牌堆发现一张装备或即时魔法，加入手牌并获得增幅标记，事件翻转为增幅祭坛',
      },
      {
        id: 'amplify-graveyard',
        text: '发现坟场牌（装备或魔法），增幅为祭坛',
        effect: 'amplify-altar-discover-graveyard',
        hint: '从坟场发现一张装备或即时魔法，加入手牌并获得增幅标记，事件翻转为增幅祭坛',
        requires: [{ type: 'graveyard', min: 1, message: '坟场中没有可用的卡牌' }],
      },
      {
        id: 'amplify-copy',
        text: '复制手牌中的一张已增幅牌',
        effect: 'amplify-copy-upgraded',
        hint: '选择手牌中一张已升级过的牌，生成一份副本加入手牌',
        requires: [{ type: 'handUpgraded', min: 1, message: '手牌中没有已增幅的卡牌' }],
        skipFlip: true,
      },
    ],
  });

  // ---------------------------------------------------------------------------
  // Event #21: 英雄试炼 (Hero's Trial)
  // ---------------------------------------------------------------------------
  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '英雄试炼',
    value: 0,
    image: dedupeEventBattleHonorImage,
    description: '选择一项奖励。',
    eventChoices: [
      {
        text: '战鼓激励（金币+15，获得Lv1「战斗鼓舞」）',
        effect: ['gold+15', 'grantStarterWeaponBurst'],
        hint: '获得 15 金币，并获得一张 Lv1 永久魔法「战斗鼓舞」放入背包',
      },
      {
        text: '铸甲军械（抽3张牌，获得Lv1「铸甲术」）',
        effect: ['drawHeroCards:3', 'grantStarterTempArmor'],
        hint: '从背包抽 3 张牌，并获得 Lv1「铸甲术」',
      },
      {
        text: '雷霆试炼（击晕上限+10%，获得Lv1「雷震击」）',
        effect: ['stunCap+10', 'grantStarterStunStrike'],
        hint: '击晕上限提升 10%，并获得一张 Lv1 永久魔法「雷震击」放入背包',
      },
      {
        text: '怀柔圣殿（劝降等级+1，获得「劝降祝福」永久魔法）',
        effect: ['persuadeLevel+1', 'grantPersuadeBoostMagic'],
        hint: '劝降等级 +1，获得永久魔法「劝降祝福」（Perm 1）：下次劝降成功率 +15%（精英 +10%），抽 1 张牌',
      },
      {
        text: '赏金猎场（商店等级+1，获得「赏金裁决」永久魔法）',
        effect: ['shopLevel+1', 'grantBountySpellMagic'],
        hint: '商店等级 +1，获得永久魔法「赏金裁决」（Perm 1）：选择一个怪物造成 5 点法术伤害，获得等同于造成伤害的金币',
      },
    ],
  });

  const deckLimits: Partial<Record<GameCardData['type'], number>> = {
    magic: 7,
    amulet: 5,
    potion: 6,
    shield: 5,
    weapon: 6,
  };

  for (const [type, limit] of Object.entries(deckLimits) as [GameCardData['type'], number][]) {
    const indices = deck.reduce<number[]>((acc, c, i) => { if (c.type === type) acc.push(i); return acc; }, []);
    if (indices.length <= limit) continue;
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const removeSet = new Set(indices.slice(limit));
    for (let i = deck.length - 1; i >= 0; i--) {
      if (removeSet.has(i)) deck.splice(i, 1);
    }
  }

  return deck.sort(() => Math.random() - 0.5);
}

// ---------------------------------------------------------------------------
// Starter card IDs
// ---------------------------------------------------------------------------

export const STARTER_CARD_IDS = {
  weaponBurst: 'starter-perm-weapon-burst',
  repairOne: 'starter-perm-repair-one',
  reshuffle: 'starter-perm-reshuffle',
  discardDraw: 'starter-perm-discard-draw',
  dungeonSwap: 'starter-perm-dungeon-swap',
  trainingBlade: 'starter-weapon-training-blade',
  shieldWallStarter: 'starter-shield-shield-wall',
  healEcho: 'starter-perm-heal-echo',
  ghostBladeStarter: 'starter-weapon-ghost-blade',
  tempArmor: 'starter-perm-temp-armor',
  bountyBlade: 'starter-weapon-bounty-blade',
  ghostBlade2: 'starter-weapon-ghost-blade-2',
  luckyDagger: 'starter-weapon-lucky-dagger',
  waterfallSword: 'starter-weapon-waterfall-sword',
  persuadeBlade: 'starter-weapon-persuade-blade',
  immortalHammer: 'starter-weapon-immortal-hammer',
  guardianShield: 'starter-shield-guardian',
  linkShield: 'starter-shield-link',
  healMagic: 'starter-instant-heal',
  forgeDamagePotion: 'starter-potion-forge-damage',
  durabilityPotion: 'starter-potion-durability',
  classSummon: 'starter-instant-class-summon',
  dimensionWarp: 'starter-perm-dimension-warp',
  loneCardAmulet: 'starter-amulet-lone-card',
  undyingBlessing: 'starter-perm-undying-blessing',
  recallEquip: 'starter-perm-recall-equip',
  magicMissile: 'starter-perm-magic-missile',
  gamblerGambit: 'starter-perm-gambler-gambit',
  spellDmgPotion: 'starter-potion-spell-damage',
  spellLifestealPotion: 'starter-potion-spell-lifesteal',
  stunPotion: 'starter-potion-stun',
  slotCapacityPotion: 'starter-potion-slot-capacity',
  upgradeScroll: 'starter-instant-upgrade',
  fateSwapDeep: 'starter-perm-fate-swap-deep',
  handLimitPotion: 'starter-potion-hand-limit',
  backpackSizePotion: 'starter-potion-backpack-size-2',
  waterfallDealPotion: 'starter-potion-waterfall-deal',
  stunStrike: 'starter-perm-stun-strike',
  attackPersuadeAmulet: 'starter-amulet-attack-persuade',
  cardGainMissileAmulet: 'starter-amulet-card-gain-missile',
  damageClassDiscoverAmulet: 'starter-amulet-damage-class-discover',
  swapUpgradeAmulet: 'starter-amulet-swap-upgrade',
  stunUpgradeCapAmulet: 'starter-amulet-stun-upgrade-cap',
  recycleBackpackExpandAmulet: 'starter-amulet-recycle-backpack-expand',
  dungeonGoldAmulet: 'starter-amulet-dungeon-gold',
  permGrantMagic: 'starter-instant-perm-grant',
  recycleDrawMagic: 'starter-perm-recycle-draw',
} as const;

export function getStarterBaseId(cardId: string): string {
  return cardId.replace(/-pick-\d+$/, '').replace(/-evt-\d+-[a-z0-9]+$/, '');
}

// ---------------------------------------------------------------------------
// createStarterHealEchoCard
// ---------------------------------------------------------------------------

export function createStarterHealEchoCard(): GameCardData {
  return {
    id: STARTER_CARD_IDS.healEcho,
    type: 'magic',
    name: '治愈余韵',
    value: 0,
    image: dedupePotionFlipHealEchoImage,
    magicType: 'permanent',
    magicEffect: '永久魔法：使用时立即回复 2 点生命。',
    description: '使用时立即回复 2 点生命。使用后回到回收袋，瀑流后可再次使用。',
  };
}

export function createMagicBoltCard(): GameCardData {
  return {
    id: `missile-bolt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'magic',
    name: '魔弹',
    value: 0,
    image: dedupeMissileBoltTokenImage,
    magicType: 'instant',
    knightEffect: 'missile-bolt',
    magicEffect: '一次性：选择一个怪物，造成 2 点法术伤害。',
    description: '选择一个怪物，造成 2 点法术伤害。',
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// createStarterCardPool
// ---------------------------------------------------------------------------

export function createStarterCardPool(): GameCardData[] {
  return [
    {
      id: STARTER_CARD_IDS.weaponBurst,
      type: 'magic',
      name: '战斗鼓舞',
      value: 0,
      image: dedupeStarterCombatRallyImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：选择一个装备栏，临时攻击力 +2。',
      description: '选择一个装备栏，临时攻击力 +2（瀑流后重置）。',
      maxUpgradeLevel: 2,
    },
    {
      id: STARTER_CARD_IDS.repairOne,
      type: 'magic',
      name: '精工修复',
      value: 0,
      image: dedupeStarterFineRepairImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：失去 2 点生命，选择一个装备恢复 1 点耐久。',
      description: '失去 2 点生命，选择一个装备恢复 1 点耐久。',
      recycleDelay: 1,
      maxUpgradeLevel: 2,
    },
    {
      id: STARTER_CARD_IDS.discardDraw,
      type: 'magic',
      name: '汰旧迎新',
      value: 0,
      image: dedupeStarterDiscardDrawImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：将 1 张手牌移到回收袋，从背包抽 2 张牌。',
      description: '将 1 张手牌移到回收袋，从背包抽取 2 张新牌。',
      recycleDelay: 1,
      maxUpgradeLevel: 2,
    },
    {
      id: STARTER_CARD_IDS.reshuffle,
      type: 'magic',
      name: '迷宫回溯',
      value: 0,
      image: dedupeStarterMazeRewindImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：选择一张地城卡牌，置于牌堆底（不打乱牌堆）。',
      description: '将一张地城卡牌放到牌堆最底部。',
      recycleDelay: 3,
      maxUpgradeLevel: 2,
    },
    {
      id: STARTER_CARD_IDS.dungeonSwap,
      type: 'magic',
      name: '乾坤挪移',
      value: 0,
      image: dedupeStarterWorldSwapImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：将地城行最左和最右的卡牌对换位置。',
      description: '扭转地城秩序，将最左与最右的卡牌互换。',
      recycleDelay: 2,
      maxUpgradeLevel: 2,
    },
    {
      id: STARTER_CARD_IDS.trainingBlade,
      type: 'weapon',
      name: '新手短剑',
      value: 3,
      image: starterNoviceSwordImage,
      durability: 2,
      maxDurability: 2,
      maxUpgradeLevel: 2,
    },
    {
      id: STARTER_CARD_IDS.tempArmor,
      type: 'magic',
      name: '铸甲术',
      value: 0,
      image: starterScrollArmorImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：选择一个装备栏，+2 临时护甲。',
      description: '选择一个装备栏，+2 临时护甲。',
      maxUpgradeLevel: 2,
    },
    {
      id: STARTER_CARD_IDS.bountyBlade,
      type: 'weapon',
      name: '赏金之刃',
      value: 2,
      image: starterBountyBladeImage,
      durability: 2,
      maxDurability: 2,
      killGoldScaling: true,
      killGoldCounter: 2,
      description: '每击杀一个怪物获得金币（首次+2，之后每次递增）。',
    },
    {
      id: STARTER_CARD_IDS.ghostBlade2,
      type: 'weapon',
      name: '虚灵刀',
      value: 2,
      image: starterGhostBladeImage,
      durability: 2,
      maxDurability: 2,
      ghostBladeExile: true,
      description: '每次攻击后，可从坟场选择卡牌移除出游戏。',
    },
    {
      id: STARTER_CARD_IDS.luckyDagger,
      type: 'weapon',
      name: '幸运匕首',
      value: 2,
      image: starterLuckyDaggerImage,
      durability: 1,
      maxDurability: 1,
      critChance: 50,
      weaponDurabilitySaveChance: 50,
      description: '50% 暴击（双倍伤害），50% 不消耗耐久。',
    },
    {
      id: STARTER_CARD_IDS.waterfallSword,
      type: 'weapon',
      name: '瀑流之刃',
      value: 4,
      image: starterWaterfallSwordImage,
      durability: 1,
      maxDurability: 1,
      waterfallAttackBoost: 1,
      description: '每次瀑流攻击力+1。初始攻击力高但耐久仅1。',
    },
    {
      id: STARTER_CARD_IDS.persuadeBlade,
      type: 'weapon',
      name: '劝降之刃',
      value: 1,
      image: starterPersuadeBladeImage,
      durability: 2,
      maxDurability: 2,
      persuadeBoostOnHit: 20,
      persuadeBoostOnHitElite: 10,
      description: '每攻击一次，下次劝降成功概率 +20%（精英 +10%）。',
    },
    {
      id: STARTER_CARD_IDS.immortalHammer,
      type: 'weapon',
      name: '不灭之锤',
      value: 2,
      image: starterImmortalHammerImage,
      durability: 2,
      maxDurability: 2,
      weaponStunChance: 20,
      hasEquipmentRevive: true,
      description: '20% 击晕。复生：首次毁坏时以 1 耐久复生。',
    },
    {
      id: STARTER_CARD_IDS.guardianShield,
      type: 'shield',
      name: '守护之盾',
      value: 2,
      image: starterGuardianShieldImage,
      durability: 2,
      maxDurability: 2,
      armorMax: 2,
      onDestroyDraw: 2,
      description: '遗言：从背包抽 2 张牌。',
    },
    {
      id: STARTER_CARD_IDS.linkShield,
      type: 'shield',
      name: '连携之盾',
      value: 1,
      image: starterLinkShieldImage,
      durability: 3,
      maxDurability: 3,
      onEquipEffect: 'other-slot-durability+1',
      description: '入场：另一个装备栏的装备 +1 耐久。',
    },
    {
      id: STARTER_CARD_IDS.healMagic,
      type: 'magic',
      name: '治愈术',
      value: 0,
      image: starterScrollHealImage,
      magicType: 'instant',
      magicEffect: '即时魔法：回复 5 点生命。',
      description: '一次性使用，立即回复 5 点生命。',
      maxUpgradeLevel: 2,
    },
    {
      id: STARTER_CARD_IDS.forgeDamagePotion,
      type: 'potion',
      name: '锻造强化',
      value: 0,
      image: starterPotionForgeImage,
      potionEffect: 'perm-slot-damage+2',
      description: '选择一个装备栏，永久伤害 +2。',
    },
    {
      id: STARTER_CARD_IDS.durabilityPotion,
      type: 'potion',
      name: '耐久补剂',
      value: 0,
      image: starterPotionDurabilityImage,
      potionEffect: 'perm-equipment-durability-max+2',
      description: '选择一个装备，耐久上限 +2。',
    },
    {
      id: STARTER_CARD_IDS.classSummon,
      type: 'magic',
      name: '专属召唤',
      value: 0,
      image: starterScrollSummonImage,
      magicType: 'instant',
      magicEffect: '即时魔法：弃回 2 张牌，获得一张职业专属卡。',
      description: '弃回 2 张牌，获得一张职业专属卡。',
      maxUpgradeLevel: 1,
    },
    {
      id: STARTER_CARD_IDS.dimensionWarp,
      type: 'magic',
      name: '维度扭曲',
      value: 0,
      image: starterScrollDimensionImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：选择一张地城行卡牌，与正上方预览行卡牌互换位置。',
      description: '将地城行的一张牌和它正上方预览行的牌互换。',
      recycleDelay: 2,
      maxUpgradeLevel: 2,
    },
    {
      id: STARTER_CARD_IDS.loneCardAmulet,
      type: 'amulet',
      name: '孤注之符',
      value: 0,
      image: dedupeStarterAmuletLoneImage,
      amuletEffect: 'lone-card',
      description: '每次瀑流时（回收前），若背包卡牌数量为 1，获得一张职业专属牌。',
    },
    {
      id: STARTER_CARD_IDS.attackPersuadeAmulet,
      type: 'amulet',
      name: '降服之符',
      value: 0,
      image: starterAmuletPersuadeDiscountImage,
      amuletEffect: 'attack-persuade-discount',
      description: '每攻击一次，下次劝降费用 -3（可叠加）。',
    },
    {
      id: STARTER_CARD_IDS.cardGainMissileAmulet,
      type: 'amulet',
      name: '弹幕之符',
      value: 0,
      image: starterAmuletMissileImage,
      amuletEffect: 'card-gain-missile',
      description: '每从坟场或专属卡池获得一次牌（同时获得多张算一次），将一张「魔弹」加入手牌。',
    },
    {
      id: STARTER_CARD_IDS.damageClassDiscoverAmulet,
      type: 'amulet',
      name: '战痕之符',
      value: 0,
      image: starterAmuletDamageDiscoverImage,
      amuletEffect: 'damage-class-discover',
      description: '每造成 10 次伤害（武器、护符、法术等任意来源），发现一张专属牌。',
    },
    {
      id: STARTER_CARD_IDS.swapUpgradeAmulet,
      type: 'amulet',
      name: '流转之符',
      value: 0,
      image: starterAmuletSwapUpgradeImage,
      amuletEffect: 'swap-upgrade',
      description: '每交换 3 次位置，升级 1 张牌。',
    },
    {
      id: STARTER_CARD_IDS.stunUpgradeCapAmulet,
      type: 'amulet',
      name: '震慑之符',
      value: 0,
      image: starterAmuletStunCapImage,
      amuletEffect: 'stun-upgrade-cap',
      description: '每击晕一次怪物，击晕上限 +5%。',
    },
    {
      id: STARTER_CARD_IDS.recycleBackpackExpandAmulet,
      type: 'amulet',
      name: '积蓄之符',
      value: 0,
      image: starterAmuletRecycleExpandImage,
      amuletEffect: 'recycle-backpack-expand',
      description: '每回收 10 张牌，背包上限 +3。',
    },
    {
      id: STARTER_CARD_IDS.dungeonGoldAmulet,
      type: 'amulet',
      name: '拾荒之符',
      value: 0,
      image: starterAmuletDungeonGoldImage,
      amuletEffect: 'dungeon-gold',
      description: '每处理 1 张地城牌，金币 +1。',
    },
    {
      id: STARTER_CARD_IDS.undyingBlessing,
      type: 'magic',
      name: '不灭赐福',
      value: 0,
      image: starterScrollReviveImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：选择一个装备，赋予其复生（首次毁坏时以 1 耐久复生）。',
      description: '赋予装备复生能力。已复生的装备可再次赋予。',
      recycleDelay: 2,
      maxUpgradeLevel: 1,
    },
    {
      id: STARTER_CARD_IDS.recallEquip,
      type: 'magic',
      name: '回收术',
      value: 0,
      image: starterScrollRecallImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：回手一张牌，抽 1 张牌。',
      description: '回手一张牌（从装备栏或护符栏选择），然后抽 1 张牌。',
    },
    {
      id: STARTER_CARD_IDS.magicMissile,
      type: 'magic',
      name: '魔法飞弹',
      value: 0,
      image: dedupeStarterMagicMissileImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：手上加入 2 张一次性「魔弹」。',
      description: '加入 2 张一次性「魔弹」到手牌（每张可对一个怪物造成 2 点法术伤害）。',
      maxUpgradeLevel: 2,
    },
    {
      id: STARTER_CARD_IDS.gamblerGambit,
      type: 'magic',
      name: '赌徒之计',
      value: 0,
      image: starterScrollGamblerImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：失去 1 点生命，获得 1 金币，从背包抽 1 张牌。',
      description: '失去 1 点生命，获得 1 金币，从背包抽 1 张牌。',
      maxUpgradeLevel: 2,
    },
    {
      id: STARTER_CARD_IDS.recycleDrawMagic,
      type: 'magic',
      name: '回收余韵',
      value: 0,
      image: starterScrollRecycleEchoImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：被回收时，从背包抽 1 张牌。',
      description: '被回收时，从背包抽 1 张牌。',
      recycleDelay: 1,
      onDiscardDraw: 1,
      maxUpgradeLevel: 2,
    },
    {
      id: STARTER_CARD_IDS.spellDmgPotion,
      type: 'potion',
      name: '法伤药水',
      value: 0,
      image: starterPotionSpellDamageImage,
      potionEffect: 'perm-spell-damage+2',
      description: '永久法术伤害 +2。',
    },
    {
      id: STARTER_CARD_IDS.spellLifestealPotion,
      type: 'potion',
      name: '超杀吸血药',
      value: 0,
      image: starterPotionLifestealImage,
      potionEffect: 'perm-spell-lifesteal+2',
      description: '永久超杀吸血 +2。',
    },
    {
      id: STARTER_CARD_IDS.stunPotion,
      type: 'potion',
      name: '眩晕药剂',
      value: 0,
      image: starterPotionStunImage,
      potionEffect: 'perm-stun-cap+10',
      description: '击晕上限 +10%。',
    },
    {
      id: STARTER_CARD_IDS.slotCapacityPotion,
      type: 'potion',
      name: '扩容药剂',
      value: 0,
      image: dedupeStarterSlotCapacityPotionImage,
      potionEffect: 'perm-slot-capacity+1',
      description: '选择一个装备栏，可装备上限 +1。',
    },
    {
      id: STARTER_CARD_IDS.upgradeScroll,
      type: 'magic',
      name: '升级卷轴',
      value: 0,
      image: starterScrollUpgradeImage,
      magicType: 'instant',
      magicEffect: '即时魔法：升级一张牌。',
      description: '一次性使用，选择一张牌进行升级。',
    },
    {
      id: STARTER_CARD_IDS.permGrantMagic,
      type: 'magic',
      name: '永恒铭刻',
      value: 0,
      image: starterScrollEternalInscribeImage,
      magicType: 'instant',
      magicEffect: '即时魔法：选择一张没有 Perm 属性的手牌，赋予 Perm 2。',
      description: '一次性使用，选择一张手牌赋予 Perm 2（被移除后经 2 次瀑流返回背包）。',
    },
    {
      id: STARTER_CARD_IDS.fateSwapDeep,
      type: 'magic',
      name: '深层交织',
      value: 0,
      image: starterScrollFateDeepImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：选择地城行一张牌，与牌堆顶 5 张中随机一张交换位置。如果换出来的牌是怪物，则其劝降概率 +30%（精英 +15%）。',
      description: '深入命运：与即将到来的 5 张牌之一交换，换出怪物时提升劝降概率。',
    },
    {
      id: STARTER_CARD_IDS.handLimitPotion,
      type: 'potion',
      name: '手牌扩容药',
      value: 0,
      image: starterPotionHandLimitImage,
      potionEffect: 'perm-hand-limit+1',
      description: '手牌上限 +1。',
    },
    {
      id: STARTER_CARD_IDS.backpackSizePotion,
      type: 'potion',
      name: '空间拓展药',
      value: 0,
      image: dedupeStarterBackpackSizePotionImage,
      potionEffect: 'perm-backpack-size+5',
      description: '背包上限 +5。',
    },
    {
      id: STARTER_CARD_IDS.waterfallDealPotion,
      type: 'potion',
      name: '瀑流增幅药',
      value: 0,
      image: dedupeStarterWaterfallDealPotionImage,
      potionEffect: 'perm-waterfall-deal+1',
      description: '永久：每次瀑流发牌数 +1。多出的牌堆叠在预览行的非怪物格子上。',
    },
    {
      id: STARTER_CARD_IDS.stunStrike,
      type: 'magic',
      name: '雷震击',
      value: 0,
      image: dedupeStarterThunderStrikeImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：对一个怪物造成 1 点伤害 2 次，每次 20% 击晕。',
      description: '对一个怪物造成 1 点法术伤害 2 次，每次有 20% 概率击晕目标。',
      recycleDelay: 1,
      maxUpgradeLevel: 2,
    },
  ];
}

// ---------------------------------------------------------------------------
// Buglet (小虫子) — Swarm-spawned token monster
// ---------------------------------------------------------------------------

let bugletCounter = 0;

/** 双重燃烧（觉醒）在预览行正上方为魔法牌时额外翻转的 Perm1 魔法 */
export function createCrimsonVoidSwapMagic(): GameCardData {
  return {
    id: `void-swap-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'magic',
    name: '虚空置换',
    value: 0,
    image: dedupeMagicVoidSwapImage,
    magicType: 'permanent',
    magicEffect: 'swap-backpack-recycle',
    description: '永久魔法：将背包与永久魔法回收袋内的所有牌对换（瀑流延迟 1）。',
    recycleDelay: 1,
    maxUpgradeLevel: 1,
  };
}

export function createBugletCard(): GameCardData {
  const bugletId = `buglet-${Date.now()}-${bugletCounter++}`;
  return {
    id: bugletId,
    type: 'monster',
    name: '小虫子',
    monsterType: 'Buglet',
    value: 2,
    attack: 2,
    hp: 1,
    maxHp: 1,
    baseAttack: 2,
    baseHp: 1,
    fury: 1,
    hpLayers: 1,
    currentLayer: 1,
    image: bugletImage,
    isBuglet: true,
    upgradeLevel: 0,
    maxUpgradeLevel: getUpgradeTierCount('Buglet'),
  };
}
