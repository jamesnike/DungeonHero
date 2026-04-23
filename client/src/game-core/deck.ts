/**
 * Deck Creation — all card pool definitions and deck-building logic.
 *
 * Pure TypeScript module, no React dependency. Contains createDeck(),
 * createStarterCardPool(), and related helpers.
 */

import type { GameCardData, EventDiceRange } from '@/components/GameCard';
import { FLIP_GOLD_REWARD } from './constants';
import { getUpgradeTierCount } from '@/lib/monsterRage';
import type { RngState } from './rng';
import { nextInt, nextBool, shuffle as rngShuffle, pickRandom, nextId } from './rng';

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
import thunderStrikeAmuletImage from '@assets/generated_images/knight_thunder_strike_amulet.png';

// ---------------------------------------------------------------------------
// Potion images
// ---------------------------------------------------------------------------
import potionImage from '@assets/generated_images/cute_cartoon_healing_potion.png';
import potionConcentratedHealImage from '@assets/generated_images/cute_potion_concentrated_heal.png';
import potionWeaponRepairImageImport from '@assets/generated_images/cute_potion_weapon_repair.png';
const potionWeaponRepairImage = potionWeaponRepairImageImport;
export { potionWeaponRepairImage };
import potionEquipmentRepairImage from '@assets/generated_images/cute_potion_equipment_repair.png';
import potionShieldFortifyImage from '@assets/generated_images/knight_potion_shield_fortify.png';
import flipLifestealAmuletImage from '@assets/generated_images/knight_flip_lifesteal_amulet.png';
import equipAmuletCapImage from '@assets/generated_images/knight_equip_amulet_cap_amulet.png';
import stunDiscoverAmuletImage from '@assets/generated_images/knight_stun_discover_amulet.png';
import potionBackpackAwakenImage from '@assets/generated_images/card_dedupe_potion_backpack_awaken.png';
import potionInsightClassImage from '@assets/generated_images/card_dedupe_potion_insight.png';
import potionEternalInscribeImage from '@assets/generated_images/card_dedupe_potion_eternal_perm.png';
import potionTwilightImage from '@assets/generated_images/cute_potion_twilight.png';
import potionAmuletToRelicImage from '@assets/generated_images/potion_amulet_to_relic.png';
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
import arcSealAmuletImage from '@assets/generated_images/knight_arc_seal_amulet.png';

// ---------------------------------------------------------------------------
// Skill / Event images (re-exported for use by GameBoard)
// ---------------------------------------------------------------------------
import skillScrollImageImport from '@assets/generated_images/chibi_skill_scroll.png';
import eventScrollImageImport from '@assets/generated_images/chibi_event_scroll.png';
import discoverClassToHandImage from '@assets/generated_images/relic_waterfall_discover.png';
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
import dedupeMagicWeaponManualImage from '@assets/generated_images/card_dedupe_knight_magic_battle_spirit.png';
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

export function pruneEventChoicesToThree(
  card: GameCardData,
  rng: RngState,
): [GameCardData, RngState] {
  let cur = rng;

  if (card.type !== 'event' || !card.eventChoices) {
    if (card.flipTarget?.toCard?.type === 'event') {
      const [innerCard, rngI] = pruneEventChoicesToThree(card.flipTarget.toCard, cur);
      cur = rngI;
      return [
        {
          ...card,
          flipTarget: {
            ...card.flipTarget,
            toCard: innerCard,
          },
        },
        cur,
      ];
    }
    return [card, cur];
  }

  const fallbackChoices = card.eventChoices.filter(c => c.requiresDisabledChoices?.length);
  let choices = card.eventChoices.filter(c => !c.requiresDisabledChoices?.length);

  if (choices.length > 3) {
    const [shuffledChoices, rngS] = rngShuffle(choices, cur);
    cur = rngS;
    choices = [shuffledChoices[0], shuffledChoices[1], shuffledChoices[2]];
  }

  choices = choices.map(choice => {
    if (!choice.diceTable || choice.diceTable.length <= 3) return choice;
    const [shuffledDice, rngD] = rngShuffle(choice.diceTable, cur);
    cur = rngD;
    const picked: EventDiceRange[] = [
      { ...shuffledDice[0], range: [1, 7] },
      { ...shuffledDice[1], range: [8, 14] },
      { ...shuffledDice[2], range: [15, 20] },
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
    const [innerCard, rngI] = pruneEventChoicesToThree(result.flipTarget.toCard, cur);
    cur = rngI;
    result = {
      ...result,
      flipTarget: {
        ...result.flipTarget,
        toCard: innerCard,
      },
    };
  }

  return [result, cur];
}

// ---------------------------------------------------------------------------
// createDeck
// ---------------------------------------------------------------------------

export function createDeck(
  mode: 'normal' | 'quick' = 'normal',
  rng?: RngState,
): [GameCardData[], RngState] {
  const deck: GameCardData[] = [];
  let id = 0;
  const isQuick = mode === 'quick';

  // Seeded RNG threading. If no rng is passed (legacy call sites), fall back to
  // a fresh seed based on the time so we still don't crash but get a deterministic
  // run for that single call.
  let cur: RngState = rng ?? { seed: Date.now() | 0, state: Date.now() | 0 };
  const randInt = (min: number, max: number): number => {
    const [v, next] = nextInt(cur, min, max);
    cur = next;
    return v;
  };
  const randShuffle = <T>(arr: readonly T[]): T[] => {
    const [v, next] = rngShuffle(arr, cur);
    cur = next;
    return v;
  };
  const randPick = <T>(arr: readonly T[]): T => {
    const [v, next] = pickRandom(arr, cur);
    cur = next;
    return v;
  };
  const randBool = (p = 0.5): boolean => {
    const [v, next] = nextBool(cur, p);
    cur = next;
    return v;
  };

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
      do { idx = randInt(0, pool.length - 1); } while (used.has(idx));
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
        minAttack: 3, maxAttack: 4,
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

    const monsterCount = isQuick ? 7 : 21;
    for (let i = 0; i < monsterCount; i++) {
      const monsterType = monsterTypes[i % monsterTypes.length];
      const attack = randInt(monsterType.minAttack, monsterType.maxAttack);
      const hp = randInt(monsterType.minHp, monsterType.maxHp);
      const fury = randInt(monsterType.minFury, monsterType.maxFury);
      
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
        ...(monsterType.name === 'Goblin' ? { onAttackEffect: 'steal-gold-5' } : {}),
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
      Skeleton: { tag: 'bone-regen',     desc: '虚骨再生：每次失去血层后，40%概率恢复一层。' },
      Wraith:   { tag: 'wraith-rebirth', desc: '幽魂重生：血层降至1时，30%概率血层全满。' },
      Ogre:     { tag: 'ogre-crit',      desc: '蛮力暴击：攻击时50%概率双倍伤害。\n狂暴连击：70%概率攻击两次。' },
      Goblin:   { tag: 'goblin-elite',   desc: '窃宝精英：怪物回合结束掷骰，自身下方每有1张牌，成功率 +25%（最高100%），成功则偷走玩家1件装备或护符并堆叠在自身下方。' },
      Swarm:    { tag: 'swarm-elite',    desc: '虫母：每次受到伤害时，将激活行一张非怪物牌替换为小虫子。' },
      Golem:    { tag: 'golem-elite',   desc: '岩石护体：每次最多受到 5 点伤害。' },
    };

    // Quick mode: only 3 randomly chosen types get elites (as additional monster cards)
    let eliteTypes = Object.keys(monstersByType);
    if (isQuick) {
      eliteTypes = randShuffle(eliteTypes).slice(0, 3);
      for (const type of eliteTypes) {
        const monsterType = monsterTypes.find(mt => mt.name === type)!;
        const attack = randInt(monsterType.minAttack, monsterType.maxAttack);
        const hp = randInt(monsterType.minHp, monsterType.maxHp);
        const fury = randInt(monsterType.minFury, monsterType.maxFury);
        const eliteCard: GameCardData = {
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
          ...(monsterType.name === 'Goblin' ? { onAttackEffect: 'steal-gold-5' } : {}),
          ...(monsterType.name === 'Swarm' ? { swarmSpawn: true, description: '虫群：场上有虫群怪物时，每移除一张地城牌，在该位置生成一只小虫子。' } : {}),
          ...(monsterType.name === 'Golem' ? { antiMagicReflect: 2, description: '反魔：玩家每使用一张法术牌，对玩家造成 2 点伤害。' } : {}),
        };
        deck.push(eliteCard);
        (monstersByType[type] ??= []).push(eliteCard);
      }
    }

    for (const [type, monsters] of Object.entries(monstersByType)) {
      if (isQuick && !eliteTypes.includes(type)) continue;
      const spec = specialMap[type];
      if (!spec || !monsters.length) continue;
      const chosen = randPick(monsters);
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
        chosen.onAttackEffect = 'steal-gold-8';
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
    if (goblinsForTrick.length > 0 && (!isQuick || randBool(0.5))) {
      const trickCarrier = randPick(goblinsForTrick);
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
  const selectedWeapons = randShuffle(weaponTypes).slice(0, 6);

  for (let i = 0; i < 6; i++) {
    const weaponType = selectedWeapons[i];
    const value = randInt(2, 6);
    const durability = randInt(1, 4);
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
      card.durability = randInt(2, 3);
      card.maxDurability = card.durability;
      card.ghostBladeExile = true;
      card.description = '每次攻击后，可从坟场选择卡牌移除出游戏。';
    }
    if (weaponType.name === 'Mace') {
      card.value = randInt(1, 2);
      card.durability = randInt(2, 3);
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
      card.value = randInt(4, 6);
      card.durability = 1;
      card.maxDurability = 1;
      card.waterfallAttackBoost = 1;
      card.onDestroyGold = 4;
      card.description = '每次瀑流触发时，攻击力 +1。遗言：获得 4 金币。';
    }
    if (weaponType.name === '奥术之刃') {
      card.value = randInt(1, 2);
      const abDurability = randInt(2, 3);
      card.durability = abDurability;
      card.maxDurability = abDurability;
      card.postAttackSpellDamage = 1;
      card.description = '攻击后，随机对一个怪物造成 1 点法术伤害（受法术伤害加成）。';
    }
    if (weaponType.name === '战锤') {
      card.value = randInt(1, 3);
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
      durability = randInt(1, 2);
    } else if (shieldType.name === 'Iron Shield') {
      durability = randInt(1, 3);
    } else if (shieldType.name === '壁垒之盾') {
      durability = 2;
    } else {
      durability = randInt(1, 2);
    }
    let shieldValue = shieldType.value;
    if (shieldType.name === '壁垒之盾') {
      shieldValue = randInt(1, 2);
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
      card.onDestroyEffect = 'graveyard-to-hand';
      card.description = '遗言：随机获得一张坟场的牌，移到手牌。';
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
      shortDescription: '+5 生命；翻转为永久魔法',
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
          shortDescription: '使用 +2 生命',
        },
        destination: 'stay',
        banner: '治疗药水翻转成"治愈余韵"！',
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
      shortDescription: '+14 生命',
    },
    {
      type: 'potion',
      name: '装备修复剂',
      value: 6,
      image: potionWeaponRepairImage,
      potionEffect: 'repair-choice',
      description: '左右装备都恢复2点耐久 或 左右装备都耐久上限+1。',
      shortDescription: '二选一：双栏 +2 耐久 / 双栏耐久上限 +1',
    },
    {
      type: 'potion',
      name: '双锋淬液',
      value: 7,
      image: potionEquipmentRepairImage,
      potionEffect: 'boost-both-slots',
      description: '左右装备栏永久伤害+1，护甲+1。',
      shortDescription: '双栏永久 +1 伤害 +1 护甲',
    },
    {
      type: 'potion',
      name: '背包觉醒药',
      value: 5,
      image: potionBackpackAwakenImage,
      potionEffect: 'draw-backpack-4',
      description: '从背包随机抽最多4张牌到手牌；手牌上限+1后若仍有空位，再抽1张。背包容量+1。',
      shortDescription: '从背包抽至多 4 张；手牌上限+1，背包+1',
    },
    {
      type: 'potion',
      name: '洞察药剂',
      value: 6,
      image: potionInsightClassImage,
      potionEffect: 'discover-class-3',
      description: '获得三张职业卡牌。',
      shortDescription: '获得 3 张职业卡',
    },
    {
      type: 'potion',
      name: '魔法平衡药剂',
      value: 0,
      image: potionTwilightImage,
      potionEffect: 'discover-graveyard-magic',
      description: '从墓地发现一张魔法卡（3选1），随后翻到另一面。',
      shortDescription: '坟场发现 1 张魔法（3 选 1）；翻面',
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
          shortDescription: '从背包抽 1 张；永久法伤 +1',
        },
        destination: 'stay',
        banner: '药剂翻转成"余烬回响"！',
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
      shortDescription: '为一张手牌赋予 Perm 2',
    },
    {
      type: 'potion',
      name: '遗赠淬炼药',
      value: 6,
      image: potionEquipmentRepairImage,
      potionEffect: 'grant-lastwords-slot-temp-buff',
      description: '选择一个装备，使其获得遗言：该装备栏 +3 临时攻击 +3 临时护甲。',
      shortDescription: '为一件装备赋予遗言：该栏 +3 攻 +3 护',
    },
    {
      type: 'potion',
      name: '护符永铸药',
      value: 0,
      image: potionAmuletToRelicImage,
      potionEffect: 'amulet-to-eternal-relic',
      description: '选择一个护符栏中的护符，将其转化为永恒护符（移除护符，效果永久生效）。',
      shortDescription: '一枚护符 → 永恒护符',
    },
    {
      type: 'potion',
      name: '回合汲取药',
      value: 5,
      image: potionImage,
      potionEffect: 'grant-amulet-end-turn-draw',
      description: '获得永久护符「回合汲取」：每次结束英雄回合时，从背包抽 1 张牌。',
      shortDescription: '获得永久护符：回合结束抽 1 张',
    },
    {
      type: 'potion',
      name: '雷震淬刃药',
      value: 6,
      image: starterPotionStunImage,
      potionEffect: 'grant-weapon-stun-chance+40',
      description: '选择装备栏中的一个武器或怪物装备，永久击晕率 +40%。',
      shortDescription: '一把武器/怪物装备永久 +40% 击晕率',
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
      shortDescription: '所有回血效果翻倍',
      amuletEffect: 'heal',
    },
    {
      type: 'amulet',
      name: 'Balance Amulet',
      value: 5,
      image: balanceAmuletImage,
      description: '左边装备栏临时攻击+3临时护甲-1，右边装备栏临时护甲+3临时攻击-1',
      shortDescription: '左栏 +3攻 -1护；右栏 +3护 -1攻',
      amuletEffect: 'balance',
    },
    {
      type: 'amulet',
      name: 'Life Amulet',
      value: 5,
      image: lifestealAmuletImage,
      description: '超杀吸血+4。',
      shortDescription: '超杀吸血 +4',
      amuletEffect: 'life',
    },
    {
      type: 'amulet',
      name: 'Catapult Amulet',
      value: 5,
      image: dedupeAmuletCatapultImage,
      description: '每弃置1张牌，抽2张牌。',
      shortDescription: '每弃置 1 张，抽 2 张',
      amuletEffect: 'catapult',
    },
    {
      type: 'amulet',
      name: 'Flash Amulet',
      value: 5,
      image: flashAmuletImage,
      description: '所有装备攻击力减半，攻击次数+1',
      shortDescription: '装备攻击减半；攻击次数 +1',
      amuletEffect: 'flash',
    },
    {
      type: 'amulet',
      name: 'Strength Amulet',
      value: 5,
      image: strengthAmuletImage,
      description: '所有装备栏临时攻击+4，每攻击一次，失去2血',
      shortDescription: '全栏 +4 临时攻；每次攻击 -2 生命',
      amuletEffect: 'strength',
    },
    {
      type: 'amulet',
      name: 'Graveyard Amulet',
      value: 5,
      image: dedupeAmuletGraveyardStackImage,
      description: '劝降成功时，在原怪物格堆叠2张墓地随机牌。',
      shortDescription: '劝降成功时该格堆叠 2 张坟场牌',
      amuletEffect: 'persuade-graveyard-stack',
    },
    {
      type: 'amulet',
      name: '雷击护符',
      value: 5,
      image: thunderStrikeAmuletImage,
      description: '光环：所有击晕率 +20%（仍受击晕上限约束）。',
      shortDescription: '光环：击晕率 +20%',
      amuletEffect: 'stun-rate-boost',
    },
    {
      type: 'amulet',
      name: '弧能之符',
      value: 5,
      image: arcSealAmuletImage,
      description: '每翻转一张牌，对激活行随机怪物造成 1 点法术伤害。多张可叠加。',
      shortDescription: '每翻转 1 张牌：随机怪物 1 法伤',
      amuletEffect: 'flip-zap',
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
    magicEffect: '将激活行的所有卡牌（含堆叠牌，幽灵建筑除外）置于牌堆底，然后触发瀑布。'
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
    shortDescription: '坟场随机取至多 3 张入背包',
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
    shortDescription: '劝降费用永久 -2；下次成功率 +10%',
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
    shortDescription: '升级至多 2 张手牌中的魔法',
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
    shortDescription: '透视牌堆顶 5 张，按类型获得永久增益',
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
    shortDescription: '透视牌堆顶 3 张：每张 Event 给装备 +1 耐久上限+1 耐久',
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '震慑领域',
    value: 0,
    image: dedupeMagicStunWaveImage,
    magicType: 'instant',
    magicEffect: '击晕上限 +5%。对激活行所有怪物 60% 击晕。',
    description: '一次性：击晕上限 +5%。对激活行所有怪物 60% 击晕。',
    shortDescription: '击晕上限 +5%；全场怪物 60% 击晕',
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
    description: '一次性魔法：选择一张装备栏或手牌中的装备/伤害魔法，生成一张永久魔法（Perm 1）对其进行增幅（武器攻击+1，护盾护甲+1，伤害魔法伤害+1）。',
    shortDescription: '生成 Perm 1 增幅一张装备/伤害魔法',
  });

  // 兵器谱：选择一个装备栏，本回合该装备栏攻击次数 +2（独立于全局额外攻击次数；
  // 即使该栏为空也可生效，会附着在该栏上等待装备进入）。
  // 上手关键词：当此卡进入手牌时（抽牌、坟场/回收袋/装备栏回手等），随机一个
  // 装备栏临时攻击 +2。克隆/复制/初始发牌等不触发。
  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '兵器谱',
    value: 0,
    image: dedupeMagicWeaponManualImage,
    magicType: 'instant',
    magicEffect: 'weapon-manual',
    description: '一次性魔法：选择一个装备栏，本回合该装备栏攻击次数 +2。\n上手：随机一个装备栏临时攻击 +2。',
    shortDescription: '本回合所选栏攻击 +2 次；上手随机栏 +2 临时攻',
    onEnterHandEffect: 'weapon-manual-onhand',
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
    shortDescription: '打开时向左平移；选项后翻为「命运挪移」',
    specialTrigger: '打开时向左平移；正下方为装备/护符时破坏获得效果',
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
        magicType: 'instant',
        magicEffect: 'crossroads-left-swap',
        description: '一次性：将地城行最左边的两张牌交换位置。',
        shortDescription: '地城行最左 2 张互换',
      },
      destination: 'stay',
      banner: '命运十字路口翻转为「命运挪移」！',
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
    shortDescription: '选项后翻为「秘藏宝库（已开启）」',
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
    shortDescription: '选项后翻为「暗影之刺」永久魔法',
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
        shortDescription: '伤害 ＝ 叠刺层数；用后 +1 层',
        scalingDamage: 1,
      },
      destination: 'stay',
      message: '暗影契约翻转为「暗影之刺」！',
    },
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '共鸣熔炉',
    value: 0,
    image: dedupeEventResonanceForgeImage,
    description: '选择选项后翻转为「熔炉之心」护符。',
    shortDescription: '选项后翻为「熔炉之心」护符',
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
        shortDescription: `每翻转 1 张牌：+${FLIP_GOLD_REWARD} 金币`,
        amuletEffect: 'flip-gold',
      },
      destination: 'stay',
      banner: '共鸣熔炉翻转为「熔炉之心」！',
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
    shortDescription: '选项后翻为「破印遗物」一次性魔法',
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
        shortDescription: '坟场发现 1 张装备或护符（3 选 1）',
      },
      destination: 'stay',
      message: '破坏祭坛翻转为「破印遗物」！',
      banner: '破坏祭坛翻转为「破印遗物」！',
    },
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '战血荣誉',
    value: 0,
    image: dedupeEventBattleHonorImage,
    description: '结算后，此卡右侧格子上的所有怪物将被激怒（进入交战）。',
    shortDescription: '结算后右侧所有怪物激怒',
    specialTrigger: '左边第一格是激怒怪，结算后右侧所有怪物激怒',
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
        text: '战血横扫（翻转为即时法术）',
        effect: 'flipToHonorSweepMagic',
        hint: '翻转为「战血横扫」：选武器对激活行所有怪物造成等同攻击力的法术伤害，每击杀一个怪物升级一张牌',
        requires: [
          {
            type: 'leftmostIsEnraged',
            message:
              '地城激活行从左起第一个有牌的格子必须是怪物，且该怪物已与英雄交战；左侧空列不占用此判定。',
          },
        ],
      },
      { text: '强化意志（击晕上限 +10%，翻转为即时魔法）', effect: ['stunCap+10', 'flipToMonsterAttackDebuff'], hint: '击晕上限 +10%，翻转为即时魔法：激活行怪物攻击-3' },
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
    shortDescription: '选项后翻为「双重燃烧（觉醒）」',
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
        shortDescription: '上方为魔法牌时触发共鸣翻转',
        specialTrigger: '预览行正上方是魔法牌时触发共鸣',
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

  const potionManuscriptId = `event-${id++}`;
  deck.push({
    id: potionManuscriptId,
    type: 'event',
    name: '药剂遗稿',
    value: 0,
    image: dedupeEventPotionManuscriptImage,
    description: '所有选项都会让本卡翻面：翻转后留在地城原格，需自行取用。',
    shortDescription: '所有选项都翻转；翻后留原格',
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
      { text: '翻转成两张「升级卷轴」', effect: 'flipToTwoUpgradeScrolls', hint: '翻转为两张一次性升级卷轴堆叠在原格' },
    ],
    // Static placeholder so the "翻转" badge shows on this card while it sits
    // in the active row (`hasFlipTarget = Boolean(card.flipTarget)` in
    // GameCard.tsx). All 7 options unconditionally flip to a different card
    // and `destination: 'stay'`; the actual `flipTarget` is patched onto
    // `currentEventCard` at choice resolution time (see flipTo* branch in
    // `events.ts`), then COMPLETE_EVENT picks it up and enqueues
    // APPLY_CARD_FLIP. The placeholder name flags this to the player from
    // the modal preview.
    flipTarget: {
      toCard: {
        id: `${potionManuscriptId}-flip-placeholder`,
        type: 'magic',
        name: '翻转结果由选项决定',
        value: 0,
        image: skillScrollImage,
        magicType: 'instant',
        description: '处理时根据所选选项翻转为对应卡牌，留在地城原格。',
        shortDescription: '翻转目标取决于选项',
      },
      destination: 'stay',
    },
  });

  const cryptId = `event-${id++}`;
  deck.push({
    id: cryptId,
    type: 'event',
    name: '墓语密室',
    value: 0,
    image: dedupeEventCryptWhisperImage,
    description: '左右两侧都是怪物时，翻转为「墓语回响」；否则翻转为「墓语遗愿」。翻转后留在地城原位。',
    shortDescription: '依两侧是否为怪物翻为不同卡；翻后留原位',
    specialTrigger: '左右两侧都是怪物',
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
    // Static placeholder so the "翻转" badge shows on this card while it sits
    // in the active row (`hasFlipTarget = Boolean(card.flipTarget)` in
    // GameCard.tsx). At resolution time, `handleCardToHero` (GameBoard.tsx)
    // overrides this with the actual context-dependent target — either
    // 「墓语回响」 (both neighbors are monsters) or 「墓语遗愿」 (otherwise).
    // Both branches use `destination: 'stay'`, mirroring this placeholder.
    flipTarget: {
      toCard: {
        id: `${cryptId}-flip-placeholder`,
        type: 'magic',
        name: '墓语遗愿',
        value: 0,
        image: skillScrollImage,
        magicType: 'instant',
        magicEffect: 'crypt-deathwish',
        description: '即时魔法：选择一个装备，触发其遗言效果 2 次，抽 1 张牌。',
        shortDescription: '触发一件装备的遗言效果 2 次；抽 1 张',
      },
      destination: 'stay',
    },
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
    shortDescription: '掷骰后翻为「命运之刃」建筑',
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
        shortDescription: '出场/换位释放：依右邻牌摧毁/打 2 层血/抽 2 张',
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
    description: '掷骰后翻转为「混沌冲击」即时魔法。',
    shortDescription: '掷骰后翻为「混沌冲击」即时魔法',
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
        magicType: 'instant',
        magicEffect: '对一个怪物造成 3 点伤害。超杀：抽 2 张牌。(可超手牌上限)',
        description: '对一个怪物造成 3 点伤害。超杀：抽 2 张牌。(可超手牌上限)',
        shortDescription: '3 点伤害；超杀抽 2 张',
      },
      destination: 'stay',
      message: '混沌骰局翻转为混沌冲击！',
    },
  });

  const volleyDiceId = `event-${id++}`;
  deck.push({
    id: volleyDiceId,
    type: 'event',
    name: '弹幕骰局',
    value: 0,
    image: dedupeStarterMagicMissileImage,
    description: '掷骰决定弹幕赐福，结束后翻转为「弹幕之符」留在地城原格。',
    shortDescription: '掷骰获得弹幕赐福；翻为「弹幕之符」留在原格',
    eventChoices: [
      {
        text: '掷出不同结果：4魔弹/瀑流增幅护符/法强超杀+1/魔弹击晕护符/魔弹抽牌护符/Lv1魔法飞弹。',
        hint: '约 17% 概率触发任一结果',
        diceTable: [
          { id: 'volley-bolts', range: [1, 4], label: '获得 4 张「魔弹」（满手时入背包/回收袋）', effect: 'gainBolts:4' },
          { id: 'volley-amplify-relic', range: [5, 7], label: '永恒护符·瀑流增幅魔弹：每次瀑流，所有「魔弹」永久增幅 +1', effect: 'grantMissileWaterfallAmplify' },
          { id: 'volley-spell', range: [8, 10], label: '法术伤害 +1，超杀吸血 +1', effect: ['spellDamage+1', 'spellLifesteal+1'] },
          { id: 'volley-stun-relic', range: [11, 13], label: '永恒护符·震荡弹幕：所有「魔弹」造成伤害后 20% 击晕（受击晕上限影响）', effect: 'grantMissileStun20' },
          { id: 'volley-draw-relic', range: [14, 16], label: '永恒护符·汲取弹幕：所有「魔弹」造成伤害后抽 1 张牌', effect: 'grantMissileDraw1' },
          { id: 'volley-knight-missile', range: [17, 20], label: '获得 1 张 Lv1「魔法飞弹」（放入背包）', effect: 'grantKnightMagicMissileLv1' },
        ],
      },
    ],
    flipTarget: {
      toCard: {
        id: `${volleyDiceId}-flip`,
        type: 'amulet',
        name: '弹幕之符',
        value: 0,
        image: starterAmuletMissileImage,
        amuletEffect: 'card-gain-missile',
        description: '每从坟场或专属卡池获得一次牌（同时获得多张算一次），将一张「魔弹」加入手牌。手牌已满时不生成。',
        shortDescription: '每次从坟场/专属池获牌：入手 1 张「魔弹」',
      },
      destination: 'stay',
      message: '弹幕骰局翻转为「弹幕之符」，留在地城原格！',
    },
  });

  const timeRiftId = `event-${id++}`;
  deck.push({
    id: timeRiftId,
    type: 'event',
    name: '时空收缩',
    value: 0,
    image: dedupeEventTimeRiftImage,
    description: '掷骰，若结果为「时空收缩」或「时空侵蚀」则翻转为「时空镜像」永久魔法。',
    shortDescription: '掷骰；特定结果翻为「时空镜像」',
    eventChoices: [
      {
        text: '掷出不同结果：锋刃祝福/时空收缩/空间代价。',
        hint: '35% 锋刃祝福 / 35% 时空收缩 / 30% 空间代价',
        diceTable: [
          { id: 'rift-burst', range: [1, 7], label: '锋刃祝福：所有装备栏临时攻击+4', effect: 'allSlotTempAttack:4', skipFlip: true },
          { id: 'rift-shrink', range: [8, 14], label: '时空收缩：Waterfall 进度 -2', effect: 'turnCount-2' },
          { id: 'rift-cost', range: [15, 20], label: '空间代价：背包 -2，激活法术回响', effect: ['backpackSize-2', 'flipToDoubleNextMagic'], skipFlip: true },
          { id: 'rift-shoplevel', range: [1, 10], label: '时空侵蚀：商店等级 -1，劝降等级-1', effect: ['shopLevel-1', 'persuadeLevel-1'] },
          { id: 'rift-monsteratk', range: [11, 20], label: '时空压缩：激活行怪物攻击力 -3', effect: 'activeRowMonsterAttack-3', skipFlip: true },
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
        shortDescription: '该栏临时攻 +2；临时攻/护拉平',
        recycleDelay: 2,
      },
      destination: 'stay',
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
    shortDescription: '选项后翻为「奥术风暴」或「奥术护盾」',
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
      {
        id: 'arcane-purify',
        text: '净化奥能（删除至多 2 张牌，跳过翻转）',
        effect: 'deleteCard:2',
        hint: '从手牌或背包中删除至多 2 张卡牌，本次不翻转',
        requires: [{ type: 'cardPool', pools: ['hand', 'backpack'], min: 1, message: '需要至少 1 张可删除的卡牌' }],
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
        shortDescription: '伤害 ＝ 已使用魔法数；用后计数清零',
        recycleDelay: 1,
      },
      destination: 'stay',
      message: '奥术回廊翻转为「奥术风暴」！',
    },
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '劝降祭典',
    value: 0,
    image: persuadeScrollCharmImage,
    description: '若装备着怀柔之印或劝降归袋符，将升级它们。',
    shortDescription: '升级劝降相关护符',
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
    shortDescription: '掷骰后翻为「诅咒碑」建筑',
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
        buildingAura: 'stacked-magic-immune',
        isGhost: true,
        fury: 1,
        hpLayers: 1,
        currentLayer: 1,
        hp: 5,
        maxHp: 5,
        description:
          '建筑（血量 5）：光环——堆叠在诅咒碑之上的怪物不受玩家魔法伤害。可被攻击摧毁。',
        shortDescription: '光环：堆叠之上的怪物免疫法术伤害',
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
    shortDescription: '激活行有装备时可翻为「装备附魔」',
    specialTrigger: '激活行有至少 1 张装备',
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
        magicType: 'instant',
        magicEffect: 'equipment-enchant-discard',
        description: '一次性魔法：弃置手牌中一张装备，将其攻击/护甲值随机附加到装备栏的某件装备上，并使该装备耐久上限+1、耐久+1。',
        shortDescription: '弃 1 张手牌装备，将数值附加到一件装备上 +1 耐久上限/耐久',
      },
      destination: 'stay',
      message: '战备工坊翻转为「装备附魔」！',
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
    shortDescription: '下方有堆叠时消耗它并驻留；可翻为「祭坛秘术」',
    specialTrigger: '下方有堆叠牌时消耗它并驻留',
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
        text: '翻转为「祭坛秘术」一次性法术',
        effect: 'noop',
        hint: '该牌翻转为一次性法术：弃回至多 2 张手牌，发现 1 张专属 Magic 卡',
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
        magicEffect: 'altar-discard-discover',
        description: '一次性法术：弃回至多 2 张手牌，发现 1 张专属 Magic 卡。',
        shortDescription: '弃回至多 2 张手牌，发现 1 张专属 Magic',
      },
      destination: 'stay',
      message: '附魔祭坛翻转为「祭坛秘术」！',
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
    shortDescription: '掷骰：为一张手牌赋予侧击/转型',
    eventChoices: [
      {
        id: 'shrine-roll-dice',
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
      {
        text: '失去 5 生命 离开',
        effect: 'hp-5',
        hint: '当无手牌、无法掷骰赋能时可选',
        requiresDisabledChoices: ['shrine-roll-dice'],
        requiresDisabledReason: '仍可掷出赋能骰',
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
    shortDescription: '增幅一张牌为祭坛，或复制已增幅的牌',
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
  // Event #22: 翻转之契 (Pact of Reversal)
  // 命运反转，万物皆可翻面。本身右上角无翻转图标 —— 选项 3/4 通过 flipTo* token
  // 让事件卡转化为新卡（放入背包/手牌），其它选项选完即消耗。
  // ---------------------------------------------------------------------------
  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '翻转之契',
    value: 0,
    image: eventScrollImage,
    description: '命运反转，万物皆可翻面。选择一种翻转之力。',
    shortDescription: '命运反转，万物皆可翻面',
    eventChoices: [
      {
        text: '万象齐转（翻转激活行所有可翻转/已翻转的牌）',
        effect: 'flipAllActiveRow',
        hint: '从左到右依次翻转激活行所有右上角带「翻转/已翻转」图标的牌',
      },
      {
        text: '掌握技艺（获得起始背包的「乾坤一翻」放入背包）',
        effect: 'grantActiveRowFlip',
        hint: '获得 1 张起始永久魔法「乾坤一翻」（选择当前行一张可翻转或已翻转的卡牌，将其翻转）',
      },
      {
        text: '凝结翻印（翻转为护符「翻印之符」放入背包）',
        effect: 'flipToFlipPersuadeAmulet',
        hint: '翻转为新护符「翻印之符」：每翻转一张牌，下一次劝降成功率 +10%（叠加，劝降一次后清空）',
      },
      {
        text: '凝结震慑（翻转为一次性魔法「翻覆震慑」放入背包）',
        effect: 'flipToFlipMonsterDebuffMagic',
        hint: '翻转为新一次性魔法「翻覆震慑」：选择一个怪物，到下次瀑流前，每翻转一张牌该怪物攻击力 -1',
      },
      {
        text: '铭刻技艺（赋予一张手牌：每次上手击晕上限 +3%）',
        effect: 'grantHandStunCapBonus',
        hint: '选择一张手牌，永久赋予其上手效果：进入手牌时击晕上限 +3%（永久，跟随该卡）',
        requires: [{ type: 'hand', min: 1, message: '需要至少 1 张手牌' }],
      },
      {
        text: '熔铸耐久（选一件装备：每翻转一次该装备恢复 1 耐久）',
        effect: 'grantEquipFlipRepairBuff',
        hint: '选择一件装备（含 reserve），永久赋予其词条：每次翻转触发时该装备恢复 1 耐久',
        requires: [{ type: 'equipmentAny', message: '需要至少一件装备' }],
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
    shortDescription: '选择一项奖励',
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
        hint: '劝降等级 +1，获得永久魔法「劝降祝福」（Perm 1）：下次劝降成功率 +15%，抽 1 张牌',
      },
      {
        text: '赏金猎场（商店等级+1，获得「赏金裁决」永久魔法）',
        effect: ['shopLevel+1', 'grantBountySpellMagic'],
        hint: '商店等级 +1，获得永久魔法「赏金裁决」（Perm 1）：选择一个怪物造成 5 点法术伤害，获得等同于造成伤害的金币',
      },
    ],
  });

  const deckLimits: Partial<Record<GameCardData['type'], number>> = isQuick
    ? { magic: 4, amulet: 4, potion: 4, shield: 3, weapon: 4, event: 11 }
    : { magic: 7, amulet: 5, potion: 6, shield: 5, weapon: 6 };

  for (const [type, limit] of Object.entries(deckLimits) as [GameCardData['type'], number][]) {
    const indices = deck.reduce<number[]>((acc, c, i) => { if (c.type === type) acc.push(i); return acc; }, []);
    if (indices.length <= limit) continue;
    const shuffledIndices = randShuffle(indices);
    const removeSet = new Set(shuffledIndices.slice(limit));
    for (let i = deck.length - 1; i >= 0; i--) {
      if (removeSet.has(i)) deck.splice(i, 1);
    }
  }

  return [randShuffle(deck), cur];
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
  activeRowFlip: 'starter-perm-active-row-flip',
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
  bothSlotsShieldPotion: 'starter-potion-both-slots-shield',
  stunStrike: 'starter-perm-stun-strike',
  attackPersuadeAmulet: 'starter-amulet-attack-persuade',
  cardGainMissileAmulet: 'starter-amulet-card-gain-missile',
  damageClassDiscoverAmulet: 'starter-amulet-damage-class-discover',
  swapUpgradeAmulet: 'starter-amulet-swap-upgrade',
  stunUpgradeCapAmulet: 'starter-amulet-stun-upgrade-cap',
  recycleBackpackExpandAmulet: 'starter-amulet-recycle-backpack-expand',
  dungeonGoldAmulet: 'starter-amulet-dungeon-gold',
  recycleDrawMagic: 'starter-perm-recycle-draw',
  surveyAction: 'starter-perm-survey-action',
  missileForgeBlade: 'starter-weapon-missile-forge-blade',
  bountyGoldBlade: 'starter-weapon-bounty-gold-blade',
  rushAttackBlade: 'starter-weapon-rush-attack-blade',
  legacyShield: 'starter-shield-legacy',
  spiritGuardShield: 'starter-shield-spirit-guard',
  flipOverkillLifestealAmulet: 'starter-amulet-flip-overkill-lifesteal',
  equipAmuletCapAmulet: 'starter-amulet-equip-amulet-cap',
  stunAttemptDiscoverAmulet: 'starter-amulet-stun-attempt-discover',
  transformStreakStrike: 'starter-perm-transform-streak-strike',
  flankSlotTempAttack: 'starter-perm-flank-slot-temp-attack',
  deckTopSwapGold: 'starter-perm-deck-top-swap-gold',
  discoverClassToHand: 'starter-perm-discover-class-to-hand',
} as const;

/**
 * Strip runtime-instance suffixes from a card id so it matches the
 * registered `STARTER_CARD_IDS.X` value used as a routing key in
 * `resolvePermanentMagic` / `card-schema/registry`.
 *
 * Recognized suffix shapes (each optional, applied in order):
 *   `-pick-{N}`              — knightDeck / shop discover (pure-digit counter)
 *   `-pick-{N}-{base36}`     — discover-pick reissues
 *   `-evt-{N}`               — event grant (counter only)
 *   `-evt-{N}-{base36}`      — event grant via nextId (most common runtime form)
 *   `-disc-{N}`              — event-driven discover seed (counter only)
 *   `-disc-{N}-{base36}`     — event-driven discover seed via nextId
 *
 * The leading `-N` digit segment is required so we don't accidentally
 * strip card-id segments that happen to contain `-disc` (e.g.
 * `'curse-discard-hand'`) or `-pick` substrings.
 *
 * History: previously the regex was `-pick-\d+$` and `-evt-\d+-[a-z0-9]+$`,
 * which silently failed for several event-grant code paths
 * (grantStarterStunStrike / WeaponBurst / TempArmor used `-evt`,
 * flipToUndyingBlessing used `-pick` + base36 letters,
 * discoverStarterMagic used `-disc` which had no strip rule at all).
 * The relaxed form below tolerates all those variants while keeping the
 * digit-segment guard against false positives.
 */
export function getStarterBaseId(cardId: string): string {
  return cardId
    .replace(/-pick-\d+(-[a-z0-9]+)?$/, '')
    .replace(/-evt-\d+(-[a-z0-9]+)?$/, '')
    .replace(/-disc-\d+(-[a-z0-9]+)?$/, '');
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
    shortDescription: '使用 +2 生命',
  };
}

// ---------------------------------------------------------------------------
// createStarterDiscoverClassToHandCard — opening-hand Perm 1 magic.
// On play: open class-deck discover (3-of-N) and place the chosen card
// directly into hand (falls back to backpack → recycle bag if hand is full).
// recycleDelay: 1 (Perm 1). The actual discover/delivery is wired by the
// `STARTER_CARD_IDS.discoverClassToHand` branch in `resolvePermanentMagic`,
// which emits `card:discoverRequested` with `delivery: 'hand-first'`.
// ---------------------------------------------------------------------------

export function createStarterDiscoverClassToHandCard(): GameCardData {
  return {
    id: STARTER_CARD_IDS.discoverClassToHand,
    type: 'magic',
    name: '专属感召',
    value: 0,
    image: discoverClassToHandImage,
    magicType: 'permanent',
    magicEffect: '永久魔法：发现一张专属牌，直接进入手牌。',
    description: '发现一张专属牌（三选一），直接进入手牌（手牌已满则进背包，背包已满则进回收袋）。使用后回到回收袋，1 次瀑流后可再次使用。',
    shortDescription: '发现 1 张专属牌进手牌',
    recycleDelay: 1,
  };
}

export function createMagicBoltCard(rng: RngState): [GameCardData, RngState] {
  const [id, nextRng] = nextId(rng, 'missile-bolt');
  const card: GameCardData = {
    id,
    type: 'magic',
    name: '魔弹',
    value: 0,
    image: dedupeMissileBoltTokenImage,
    magicType: 'instant',
    knightEffect: 'missile-bolt',
    magicEffect: '一次性：选择一个怪物，造成 1 点法术伤害。',
    description: '选择一个怪物，造成 1 点法术伤害。',
    shortDescription: '对一个怪物造成 1 法伤',
  } as GameCardData;
  return [card, nextRng];
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
      shortDescription: '所选栏 +2 临时攻',
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
      shortDescription: '失去 2 生命；一件装备 +1 耐久',
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
      shortDescription: '弃 1 张手牌入回收袋；抽 2 张',
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
      shortDescription: '一张地城牌置于牌堆底',
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
      shortDescription: '地城行最左与最右互换',
      recycleDelay: 2,
      maxUpgradeLevel: 2,
    },
    {
      // 乾坤一翻 — Perm 2. Choose an active-row card whose face can change
      // (has flipTarget OR _flipBackCard) and flip it to the other side.
      // No legal target → still consumed (play_full_cost_noop, mirrors 血誓回卷).
      // 不设 `magicEffect`：避免被 `resolveEffectId` 短路到 `magic:<long-text>`
      // 而错过 card-schema/definitions/magic.ts 中
      // `starter:starter-perm-active-row-flip` resolver。
      id: STARTER_CARD_IDS.activeRowFlip,
      type: 'magic',
      name: '乾坤一翻',
      value: 0,
      image: dedupeStarterWorldSwapImage,
      magicType: 'permanent',
      description: '选择当前行一张可翻转或已翻转的卡牌，将其翻转到另一面。',
      shortDescription: '翻转激活行一张可翻牌',
      recycleDelay: 2,
      maxUpgradeLevel: 0,
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
      magicEffect: '永久魔法：选择一个装备栏，+2 临时护甲。升级1：+4。升级2：+6。',
      description: '选择一个装备栏，+2 临时护甲。升级1：+4。升级2：+6。',
      shortDescription: '所选栏 +2 临时护（Lv1: +4 / Lv2: +6）',
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
      shortDescription: '每击杀怪物 +金币（首次 +2，递增）',
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
      shortDescription: '攻击后可从坟场移除 1 张牌',
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
      shortDescription: '50% 暴击；50% 不耗耐久',
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
      shortDescription: '每次瀑流攻击 +1',
    },
    {
      id: STARTER_CARD_IDS.persuadeBlade,
      type: 'weapon',
      name: '劝降之刃',
      value: 1,
      image: starterPersuadeBladeImage,
      durability: 2,
      maxDurability: 2,
      persuadeBoostOnHit: 15,
      description: '每攻击一次，下次劝降成功概率 +15%。',
      shortDescription: '每次攻击下次劝降率 +15%',
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
      shortDescription: '20% 击晕；复生 1 次',
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
      shortDescription: '遗言：抽 2 张',
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
      shortDescription: '入场：另一栏装备 +1 耐久',
    },
    {
      id: STARTER_CARD_IDS.missileForgeBlade,
      type: 'weapon',
      name: '魔弹冶刃',
      value: 2,
      image: starterPersuadeBladeImage,
      durability: 2,
      maxDurability: 2,
      overkillAmplifyMissile: 1,
      description: '超杀：所有「魔弹」永久增幅 +1（每次超杀触发一次）。',
      shortDescription: '超杀：所有「魔弹」永久 +1 增幅',
    },
    {
      id: STARTER_CARD_IDS.bountyGoldBlade,
      type: 'weapon',
      name: '赏金之剑',
      value: 2,
      image: starterBountyBladeImage,
      durability: 2,
      maxDurability: 2,
      onEquipEffect: 'gold+6',
      description: '入场：金币 +6。',
      shortDescription: '入场 +6 金币',
    },
    {
      id: STARTER_CARD_IDS.rushAttackBlade,
      type: 'weapon',
      name: '足锡冲锋',
      value: 1,
      image: starterNoviceSwordImage,
      durability: 2,
      maxDurability: 2,
      onEquipEffect: 'temp-attack-3',
      description: '入场：该装备栏临时攻击 +3。',
      shortDescription: '入场本栏 +3 临时攻',
    },
    {
      id: STARTER_CARD_IDS.legacyShield,
      type: 'shield',
      name: '遗愿重盾',
      value: 3,
      image: starterGuardianShieldImage,
      durability: 2,
      maxDurability: 2,
      armorMax: 3,
      onDestroyEffect: 'slot-temp-armor-3',
      description: '遗言：该装备栏临时护甲 +3。',
      shortDescription: '遗言：本栏 +3 临时护',
    },
    {
      id: STARTER_CARD_IDS.spiritGuardShield,
      type: 'shield',
      name: '灵潢守盾',
      value: 2,
      image: starterLinkShieldImage,
      durability: 3,
      maxDurability: 3,
      armorMax: 2,
      waterfallTempArmor: 2,
      description: '每次瀑流，该装备栏临时护甲 +2。',
      shortDescription: '每次瀑流本栏 +2 临时护',
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
      shortDescription: '+5 生命',
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
      shortDescription: '所选栏永久 +2 伤害',
    },
    {
      id: STARTER_CARD_IDS.durabilityPotion,
      type: 'potion',
      name: '耐久补剂',
      value: 0,
      image: starterPotionDurabilityImage,
      potionEffect: 'perm-equipment-durability-max+2',
      description: '选择一个装备，耐久上限 +2。',
      shortDescription: '一件装备耐久上限 +2',
    },
    {
      id: STARTER_CARD_IDS.classSummon,
      type: 'magic',
      name: '专属召唤',
      value: 0,
      image: starterScrollSummonImage,
      magicType: 'instant',
      magicEffect: '即时魔法：弃回至多 2 张牌，获得一张职业专属卡。',
      description: '弃回至多 2 张手牌，获得一张职业专属卡。手牌不足 2 张时仍可使用。',
      shortDescription: '弃回至多 2 张手牌，获得 1 张职业牌',
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
      shortDescription: '一张地城牌与正上方预览牌互换',
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
      shortDescription: '瀑流时若背包仅 1 张：获得 1 张职业牌',
    },
    {
      id: STARTER_CARD_IDS.attackPersuadeAmulet,
      type: 'amulet',
      name: '降服之符',
      value: 0,
      image: starterAmuletPersuadeDiscountImage,
      amuletEffect: 'attack-persuade-discount',
      description: '每攻击一次，下次劝降费用 -3（可叠加）。',
      shortDescription: '每次攻击下次劝降费用 -3（可叠加）',
    },
    {
      id: STARTER_CARD_IDS.cardGainMissileAmulet,
      type: 'amulet',
      name: '弹幕之符',
      value: 0,
      image: starterAmuletMissileImage,
      amuletEffect: 'card-gain-missile',
      description: '每从坟场或专属卡池获得一次牌（同时获得多张算一次），将一张「魔弹」加入手牌。手牌已满时不生成。',
      shortDescription: '每次从坟场/专属池获牌：入手 1 张「魔弹」',
    },
    {
      id: STARTER_CARD_IDS.damageClassDiscoverAmulet,
      type: 'amulet',
      name: '战痕之符',
      value: 0,
      image: starterAmuletDamageDiscoverImage,
      amuletEffect: 'damage-class-discover',
      description: '每造成 8 次伤害（武器、护符、法术等任意来源），发现一张专属牌。',
      shortDescription: '每造成 8 次伤害：发现 1 张专属',
    },
    {
      id: STARTER_CARD_IDS.swapUpgradeAmulet,
      type: 'amulet',
      name: '流转之符',
      value: 0,
      image: starterAmuletSwapUpgradeImage,
      amuletEffect: 'swap-upgrade',
      description: '每交换 3 次位置，升级 1 张牌。',
      shortDescription: '每交换 3 次位置：升级 1 张牌',
    },
    {
      id: STARTER_CARD_IDS.stunUpgradeCapAmulet,
      type: 'amulet',
      name: '震慑之符',
      value: 0,
      image: starterAmuletStunCapImage,
      amuletEffect: 'stun-upgrade-cap',
      description: '每击晕一次怪物，击晕上限 +5%。',
      shortDescription: '每击晕怪物 1 次：击晕上限 +5%',
    },
    {
      id: STARTER_CARD_IDS.recycleBackpackExpandAmulet,
      type: 'amulet',
      name: '积蓄之符',
      value: 0,
      image: starterAmuletRecycleExpandImage,
      amuletEffect: 'recycle-backpack-expand',
      description: '每回收 8 张牌，背包上限 +3。',
      shortDescription: '每回收 8 张牌：背包上限 +3',
    },
    {
      id: STARTER_CARD_IDS.dungeonGoldAmulet,
      type: 'amulet',
      name: '拾荒之符',
      value: 0,
      image: starterAmuletDungeonGoldImage,
      amuletEffect: 'dungeon-gold',
      description: '每处理 1 张地城牌，金币 +1。',
      shortDescription: '每处理 1 张地城牌：+1 金币',
    },
    {
      id: STARTER_CARD_IDS.flipOverkillLifestealAmulet,
      type: 'amulet',
      name: '翻血之符',
      value: 0,
      image: flipLifestealAmuletImage,
      amuletEffect: 'flip-overkill-lifesteal',
      description: '每翻转 5 张牌，超杀吸血永久 +1。',
      shortDescription: '每翻转 5 张牌：超杀吸血永久 +1',
    },
    {
      id: STARTER_CARD_IDS.equipAmuletCapAmulet,
      type: 'amulet',
      name: '集甲之符',
      value: 0,
      image: equipAmuletCapImage,
      amuletEffect: 'equip-amulet-cap',
      description: '每装备 6 个装备，护符栏上限 +1。',
      shortDescription: '每装备 6 件装备：护符栏上限 +1',
    },
    {
      id: STARTER_CARD_IDS.stunAttemptDiscoverAmulet,
      type: 'amulet',
      name: '眩学之符',
      value: 0,
      image: stunDiscoverAmuletImage,
      amuletEffect: 'stun-attempt-discover',
      description: '每尝试击晕 6 次，发现一张专属牌。',
      shortDescription: '每尝试击晕 6 次：发现 1 张专属',
    },
    {
      id: STARTER_CARD_IDS.undyingBlessing,
      type: 'magic',
      name: '不灭赐福',
      value: 0,
      image: starterScrollReviveImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：选择一个装备，赋予其复生（首次毁坏时以 1 耐久复生），然后失去 2 点生命。',
      description: '赋予装备复生能力，失去 2 点生命。已复生的装备可再次赋予。',
      shortDescription: '一件装备获得复生；失去 2 生命',
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
      shortDescription: '回手 1 张装备/护符；抽 1 张',
      knightEffect: 'recall-equipment',
    },
    {
      id: STARTER_CARD_IDS.magicMissile,
      type: 'magic',
      name: '魔法飞弹',
      value: 0,
      image: dedupeStarterMagicMissileImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：手上加入 2 张一次性「魔弹」。',
      description: '加入 2 张一次性「魔弹」到手牌（每张可对一个怪物造成 1 点法术伤害）。',
      shortDescription: '手上加入 2 张「魔弹」',
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
      shortDescription: '-1 生命；+1 金币；抽 1 张',
      maxUpgradeLevel: 2,
    },
    {
      id: STARTER_CARD_IDS.recycleDrawMagic,
      type: 'magic',
      name: '回收余韵',
      value: 0,
      image: starterScrollRecycleEchoImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：使用：将回收袋洗回背包（所有牌剩余瀑流 -1，就绪的牌回背包）。被回收时，从背包抽 1 张牌。',
      description: '使用：将回收袋洗回背包（所有牌剩余瀑流 -1，就绪的牌回背包）。被回收时，从背包抽 1 张牌。',
      shortDescription: '回收袋剩余瀑流 -1；被回收时抽 1 张',
      recycleDelay: 1,
      onDiscardDraw: 1,
      maxUpgradeLevel: 2,
    },
    {
      // 查阅动作 (Survey Action) — 起始背包 Perm 1：从背包抽 2 张牌。
      // 上手：随机一个装备栏 临时攻击 +1（升级后 +2）。
      id: STARTER_CARD_IDS.surveyAction,
      type: 'magic',
      name: '查阅动作',
      value: 0,
      image: dedupeStarterDiscardDrawImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：从背包抽 2 张牌。',
      description: '从背包抽 2 张牌。\n上手：随机一个装备栏 临时攻击 +1。',
      shortDescription: '抽 2 张；上手随机一栏 +1 临时攻',
      recycleDelay: 1,
      onEnterHandEffect: 'survey-action-onhand',
      maxUpgradeLevel: 1,
    },
    {
      id: STARTER_CARD_IDS.spellDmgPotion,
      type: 'potion',
      name: '法伤药水',
      value: 0,
      image: starterPotionSpellDamageImage,
      potionEffect: 'perm-spell-damage',
      description: '永久法术伤害 +1。',
      shortDescription: '永久法伤 +1',
    },
    {
      id: STARTER_CARD_IDS.spellLifestealPotion,
      type: 'potion',
      name: '超杀吸血药',
      value: 0,
      image: starterPotionLifestealImage,
      potionEffect: 'perm-spell-lifesteal+1',
      description: '永久超杀吸血 +1。',
      shortDescription: '永久超杀吸血 +1',
    },
    {
      id: STARTER_CARD_IDS.stunPotion,
      type: 'potion',
      name: '眩晕药剂',
      value: 0,
      image: starterPotionStunImage,
      potionEffect: 'perm-stun-cap+10',
      description: '击晕上限 +10%。',
      shortDescription: '击晕上限 +10%',
    },
    {
      id: STARTER_CARD_IDS.slotCapacityPotion,
      type: 'potion',
      name: '扩容药剂',
      value: 0,
      image: dedupeStarterSlotCapacityPotionImage,
      potionEffect: 'perm-slot-capacity+1',
      description: '选择一个装备栏，可装备上限 +1。',
      shortDescription: '所选栏装备上限 +1',
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
      shortDescription: '升级 1 张牌',
    },
    {
      id: STARTER_CARD_IDS.fateSwapDeep,
      type: 'magic',
      name: '深层交织',
      value: 0,
      image: starterScrollFateDeepImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：选择地城行一张牌，与牌堆顶 4 张中随机一张交换位置。如果换出来的牌是怪物，则下次劝降概率 +30%。',
      description: '深入命运：与即将到来的 4 张牌之一交换，换出怪物时提升下次劝降概率。',
      shortDescription: '与牌堆顶 4 张随机一张互换；换出怪物时下次劝降率 +30%',
    },
    {
      id: STARTER_CARD_IDS.handLimitPotion,
      type: 'potion',
      name: '手牌扩容药',
      value: 0,
      image: starterPotionHandLimitImage,
      potionEffect: 'perm-hand-limit+1',
      description: '手牌上限 +1。',
      shortDescription: '手牌上限 +1',
    },
    {
      id: STARTER_CARD_IDS.backpackSizePotion,
      type: 'potion',
      name: '空间拓展药',
      value: 0,
      image: dedupeStarterBackpackSizePotionImage,
      potionEffect: 'perm-backpack-size+3',
      description: '背包上限 +3。',
      shortDescription: '背包上限 +3',
    },
    {
      id: STARTER_CARD_IDS.bothSlotsShieldPotion,
      type: 'potion',
      name: '盾坚药',
      value: 0,
      image: potionShieldFortifyImage,
      potionEffect: 'perm-both-slots-shield+1',
      description: '左右装备栏永久护甲 +1。',
      shortDescription: '双栏永久 +1 护甲',
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
      shortDescription: '1 法伤 ×2；每次 20% 击晕',
      recycleDelay: 1,
      maxUpgradeLevel: 2,
    },
    {
      // 不设 `magicEffect`：避免被 `resolveEffectId` 短路到 `magic:<long-text>`。
      // 走 starter-id 路径，由 card-schema/definitions/magic.ts 的
      // `starter:starter-perm-transform-streak-strike` resolver 处理。
      id: STARTER_CARD_IDS.transformStreakStrike,
      type: 'magic',
      name: '连环转律',
      value: 0,
      image: dedupeStarterCombatRallyImage,
      magicType: 'permanent',
      description: '造成 X 点法术伤害，X 为此前连续转型的次数（含本牌）。同类型连出会断链。',
      shortDescription: '伤害 ＝ 连续转型次数',
      recycleDelay: 2,
      maxUpgradeLevel: 0,
    },
    {
      // 同上：不设 `magicEffect`，走 starter-id 路径。
      id: STARTER_CARD_IDS.flankSlotTempAttack,
      type: 'magic',
      name: '锐意鼓舞',
      value: 0,
      image: dedupeStarterCombatRallyImage,
      magicType: 'permanent',
      description: '左装备栏 +3 临时攻击；侧击则改为右装备栏 +3。升级 1：+5。',
      shortDescription: '左栏 +3 临时攻；侧击改右栏 +3',
      recycleDelay: 1,
      maxUpgradeLevel: 1,
    },
    {
      // 同上：不设 `magicEffect`，走 starter-id 路径。
      id: STARTER_CARD_IDS.deckTopSwapGold,
      type: 'magic',
      name: '运势博弈',
      value: 0,
      image: dedupeStarterWorldSwapImage,
      magicType: 'permanent',
      description: '与牌堆顶交换一张当前行卡牌；同类型奖励 +10 金币，否则 -1。然后抽 1 张牌。',
      shortDescription: '与牌堆顶互换 1 张；同类 +10 金币；抽 1 张',
      recycleDelay: 2,
      maxUpgradeLevel: 0,
    },
  ];
}

// ---------------------------------------------------------------------------
// Buglet (小虫子) — Swarm-spawned token monster
// ---------------------------------------------------------------------------

let bugletCounter = 0;

/** 双重燃烧（觉醒）在预览行正上方为魔法牌时额外翻转的 Perm1 魔法 */
export function createCrimsonVoidSwapMagic(rng: RngState): [GameCardData, RngState] {
  const [id, nextRng] = nextId(rng, 'void-swap');
  const card: GameCardData = {
    id,
    type: 'magic',
    name: '虚空置换',
    value: 0,
    image: dedupeMagicVoidSwapImage,
    magicType: 'permanent',
    magicEffect: 'swap-backpack-recycle',
    description: '永久魔法：将背包与永久魔法回收袋内的所有牌对换（瀑流延迟 1）。',
    shortDescription: '背包与永久魔法回收袋全部互换',
    recycleDelay: 1,
    maxUpgradeLevel: 1,
  };
  return [card, nextRng];
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
