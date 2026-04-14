import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CuteSticker, ALL_STICKER_KEYS } from './MagicNameFlankIcons';

import dragonImage from '@assets/generated_images/cute_chibi_dragon_monster.png';
import skeletonImage from '@assets/generated_images/cute_chibi_skeleton_monster.png';
import goblinImage from '@assets/generated_images/cute_chibi_goblin_monster.png';
import ogreImage from '@assets/generated_images/cute_chibi_ogre_monster.png';
import wraithImage from '@assets/generated_images/cute_chibi_wraith_monster.png';
import minionImage from '@assets/generated_images/chibi_minion_follower.png';
import swordImage from '@assets/generated_images/cute_cartoon_medieval_sword.png';
import axeImage from '@assets/generated_images/cute_cartoon_battle_axe.png';
import daggerImage from '@assets/generated_images/cute_cartoon_dagger.png';
import daggerWeaponImage from '@assets/generated_images/cute_cartoon_weapon_dagger.png';
import holyBladeImage from '@assets/generated_images/cute_cartoon_holy_blade.png';
import maceImage from '@assets/generated_images/cute_cartoon_mace.png';
import woodenShieldImage from '@assets/generated_images/cute_wooden_shield.png';
import ironShieldImage from '@assets/generated_images/cute_iron_shield.png';
import heavyShieldImage from '@assets/generated_images/simple_heavy_shield.png';
import potionImage from '@assets/generated_images/cute_cartoon_healing_potion.png';
import potionConcentratedHealImage from '@assets/generated_images/cute_potion_concentrated_heal.png';
import potionWeaponRepairImage from '@assets/generated_images/cute_potion_weapon_repair.png';
import potionEquipmentRepairImage from '@assets/generated_images/cute_potion_equipment_repair.png';
import potionBackpackDrawImage from '@assets/generated_images/cute_potion_backpack_draw.png';
import potionDiscoverImage from '@assets/generated_images/cute_potion_discover.png';
import potionTwilightImage from '@assets/generated_images/cute_potion_twilight.png';
import potionSpellDamageImage from '@assets/generated_images/cute_potion_spell_damage.png';
import potionArcaneInfusionImage from '@assets/generated_images/cute_potion_arcane_infusion.png';
import potionBackpackExpandImage from '@assets/generated_images/cute_potion_backpack_expand.png';
import lifeAmuletImage from '@assets/generated_images/chibi_life_amulet.png';
import strengthAmuletImage from '@assets/generated_images/chibi_strength_amulet.png';
import guardianAmuletImage from '@assets/generated_images/chibi_guardian_amulet.png';
import balanceAmuletImage from '@assets/generated_images/chibi_balance_amulet.png';
import lifestealAmuletImage from '@assets/generated_images/chibi_lifesteal_amulet.png';
import flashAmuletImage from '@assets/generated_images/chibi_flash_amulet.png';
import dualguardAmuletImage from '@assets/generated_images/chibi_dualguard_amulet.png';
import thunderAmuletImage from '@assets/generated_images/chibi_thunder_amulet.png';
/** Knight class deck arts (large files; not used by LoadingScreen UI but decoded before first draw) */
import knightHolyBladeImage from '@assets/generated_images/holy_light_blade.png';
import knightSwiftDaggerImage from '@assets/generated_images/swift_wind_dagger.png';
import knightThunderHammerImage from '@assets/generated_images/thunder_warhammer.png';
import knightIronTowerShieldImage from '@assets/generated_images/iron_tower_shield.png';
import knightThornedShieldImage from '@assets/generated_images/thorned_reflect_shield.png';
import knightGuardianShieldImage from '@assets/generated_images/guardian_holy_shield.png';
import skillScrollImage from '@assets/generated_images/chibi_skill_scroll.png';
import eventScrollImage from '@assets/generated_images/chibi_event_scroll.png';
import heroPortrait from '@assets/generated_images/chibi_hero_adventurer_character.png';
import cardBackImage from '@assets/generated_images/card_back_design.png';

/** Starter card pool images (used by CardDraftModal at game start) */
import starterCombatRallyImage from '@assets/generated_images/card_dedupe_starter_combat_rally.png';
import starterFineRepairImage from '@assets/generated_images/card_dedupe_starter_fine_repair.png';
import starterDiscardDrawImage from '@assets/generated_images/card_dedupe_starter_discard_draw.png';
import starterMazeRewindImage from '@assets/generated_images/card_dedupe_starter_maze_rewind.png';
import starterWorldSwapImage from '@assets/generated_images/card_dedupe_starter_world_swap.png';
import starterNoviceSwordImage from '@assets/generated_images/starter_novice_sword.png';
import starterScrollArmorImage from '@assets/generated_images/starter_scroll_armor.png';
import starterBountyBladeImage from '@assets/generated_images/starter_bounty_blade.png';
import starterGhostBladeImage from '@assets/generated_images/starter_ghost_blade.png';
import starterLuckyDaggerImage from '@assets/generated_images/starter_lucky_dagger.png';
import starterWaterfallSwordImage from '@assets/generated_images/starter_waterfall_sword.png';
import starterPersuadeBladeImage from '@assets/generated_images/starter_persuade_blade.png';
import starterImmortalHammerImage from '@assets/generated_images/starter_immortal_hammer.png';
import starterGuardianShieldImage from '@assets/generated_images/starter_guardian_shield.png';
import starterLinkShieldImage from '@assets/generated_images/starter_link_shield.png';
import starterScrollHealImage from '@assets/generated_images/starter_scroll_heal.png';
import starterPotionForgeImage from '@assets/generated_images/starter_potion_forge.png';
import starterPotionDurabilityImage from '@assets/generated_images/starter_potion_durability.png';
import starterScrollSummonImage from '@assets/generated_images/starter_scroll_summon.png';
import starterScrollDimensionImage from '@assets/generated_images/starter_scroll_dimension.png';
import starterAmuletLoneImage from '@assets/generated_images/card_dedupe_starter_amulet_lone.png';
import starterAmuletPersuadeDiscountImage from '@assets/generated_images/starter_amulet_persuade_discount.png';
import starterAmuletMissileImage from '@assets/generated_images/starter_amulet_missile.png';
import starterAmuletDamageDiscoverImage from '@assets/generated_images/starter_amulet_damage_discover.png';
import starterAmuletSwapUpgradeImage from '@assets/generated_images/starter_amulet_swap_upgrade.png';
import starterAmuletStunCapImage from '@assets/generated_images/starter_amulet_stun_cap.png';
import starterAmuletRecycleExpandImage from '@assets/generated_images/starter_amulet_recycle_expand.png';
import starterAmuletDungeonGoldImage from '@assets/generated_images/starter_amulet_dungeon_gold.png';
import starterScrollReviveImage from '@assets/generated_images/starter_scroll_revive.png';
import starterScrollRecallImage from '@assets/generated_images/starter_scroll_recall.png';
import starterMagicMissileImage from '@assets/generated_images/card_dedupe_starter_magic_missile.png';
import starterScrollGamblerImage from '@assets/generated_images/starter_scroll_gambler.png';
import starterScrollRecycleEchoImage from '@assets/generated_images/starter_scroll_recycle_echo.png';
import starterPotionSpellDamageImage from '@assets/generated_images/starter_potion_spell_damage.png';
import starterPotionLifestealImage from '@assets/generated_images/starter_potion_lifesteal.png';
import starterPotionStunImage from '@assets/generated_images/starter_potion_stun.png';
import starterSlotCapacityPotionImage from '@assets/generated_images/card_dedupe_potion_slot_capacity_starter.png';
import starterScrollUpgradeImage from '@assets/generated_images/starter_scroll_upgrade.png';
import starterScrollEternalInscribeImage from '@assets/generated_images/starter_scroll_eternal_inscribe.png';
import starterScrollFateDeepImage from '@assets/generated_images/starter_scroll_fate_deep.png';
import starterPotionHandLimitImage from '@assets/generated_images/starter_potion_hand_limit.png';
import starterBackpackSizePotionImage from '@assets/generated_images/card_dedupe_starter_potion_backpack_size.png';
import starterWaterfallDealPotionImage from '@assets/generated_images/card_dedupe_starter_potion_waterfall_deal.png';
import starterThunderStrikeImage from '@assets/generated_images/card_dedupe_starter_thunder_strike.png';

import cursedSteleBuildingImage from '@assets/generated_images/card_dedupe_cursed_stele_building.png';
import knightEquipEmpowerPotionImage from '@assets/generated_images/knight_potion_equip_empower.png';
import bastionShieldImage from '@assets/generated_images/knight_bastion_shield.png';
import sealBladeImage from '@assets/generated_images/knight_seal_blade.png';
import persuadeRecycleAmuletImage from '@assets/generated_images/knight_persuade_recycle_amulet.png';
import thunderStrikeAmuletImage from '@assets/generated_images/knight_thunder_strike_amulet.png';

const ALL_IMAGES = [
  dragonImage, skeletonImage, goblinImage, ogreImage, wraithImage, minionImage,
  swordImage, axeImage, daggerImage, daggerWeaponImage, holyBladeImage, maceImage,
  woodenShieldImage, ironShieldImage, heavyShieldImage,
  potionImage, potionConcentratedHealImage, potionWeaponRepairImage,
  potionEquipmentRepairImage, potionBackpackDrawImage, potionDiscoverImage,
  potionTwilightImage, potionSpellDamageImage, potionArcaneInfusionImage,
  potionBackpackExpandImage,
  lifeAmuletImage, strengthAmuletImage, guardianAmuletImage,
  balanceAmuletImage, lifestealAmuletImage, flashAmuletImage,
  dualguardAmuletImage, thunderAmuletImage,
  knightHolyBladeImage,
  knightSwiftDaggerImage,
  knightThunderHammerImage,
  knightIronTowerShieldImage,
  knightThornedShieldImage,
  knightGuardianShieldImage,
  skillScrollImage, eventScrollImage,
  heroPortrait, cardBackImage,
  // Starter card pool
  starterCombatRallyImage, starterFineRepairImage, starterDiscardDrawImage,
  starterMazeRewindImage, starterWorldSwapImage, starterNoviceSwordImage,
  starterScrollArmorImage, starterBountyBladeImage, starterGhostBladeImage,
  starterLuckyDaggerImage, starterWaterfallSwordImage, starterPersuadeBladeImage,
  starterImmortalHammerImage, starterGuardianShieldImage, starterLinkShieldImage,
  starterScrollHealImage, starterPotionForgeImage, starterPotionDurabilityImage,
  starterScrollSummonImage, starterScrollDimensionImage, starterAmuletLoneImage,
  starterAmuletPersuadeDiscountImage, starterAmuletMissileImage,
  starterAmuletDamageDiscoverImage, starterAmuletSwapUpgradeImage,
  starterAmuletStunCapImage, starterAmuletRecycleExpandImage,
  starterAmuletDungeonGoldImage, starterScrollReviveImage, starterScrollRecallImage,
  starterMagicMissileImage, starterScrollGamblerImage, starterScrollRecycleEchoImage,
  starterPotionSpellDamageImage, starterPotionLifestealImage, starterPotionStunImage,
  starterSlotCapacityPotionImage, starterScrollUpgradeImage,
  starterScrollEternalInscribeImage, starterScrollFateDeepImage,
  starterPotionHandLimitImage, starterBackpackSizePotionImage,
  starterWaterfallDealPotionImage, starterThunderStrikeImage,
  cursedSteleBuildingImage, knightEquipEmpowerPotionImage,
  bastionShieldImage, sealBladeImage, persuadeRecycleAmuletImage,
  thunderStrikeAmuletImage,
];

const FLAVOR_TEXTS = [
  'Sharpening swords...',
  'Brewing potions...',
  'Waking the dragon...',
  'Shuffling the dungeon deck...',
  'Polishing shields...',
  'Training the hero...',
  'Lighting torches...',
  'Setting traps...',
];

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };

    const timer = setTimeout(done, 8000);

    const img = new Image();
    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(done, done);
      } else {
        done();
      }
    };
    img.onerror = done;
    img.src = src;

    if (img.complete) {
      clearTimeout(timer);
      done();
    }
  });
}

const FONT_LOAD_SPECS = [
  '400 16px Lato', '700 16px Lato', '300 16px Lato', 'italic 400 16px Lato',
  '400 16px Cinzel', '500 16px Cinzel', '600 16px Cinzel', '700 16px Cinzel',
  '400 16px "Roboto Mono"', '500 16px "Roboto Mono"',
  '600 16px "Roboto Mono"', '700 16px "Roboto Mono"',
];

function preloadFonts(): Promise<void> {
  if (!document.fonts?.load) {
    return document.fonts?.ready
      ? document.fonts.ready.then(() => undefined)
      : Promise.resolve();
  }
  const loads = FONT_LOAD_SPECS.map((spec) =>
    document.fonts.load(spec).catch(() => undefined),
  );
  return Promise.all(loads).then(() => undefined);
}

const WARM_ANIMATION_CLASSES = [
  // Card lifecycle
  'animate-card-remove',
  'animate-damage-flash',
  'animate-heal-glow',
  // Preview / waterfall
  'animate-preview-drop',
  'animate-preview-graveyard',
  'animate-preview-deck-return',
  'animate-active-landing',
  'animate-preview-deal',
  // Modal
  'animate-modal-fade-in',
  'animate-modal-slide-in',
  // Combat: bleed
  'combat-overlay__shape--bleed',
  'combat-overlay__shape--bleed-drip',
  'combat-overlay__shape--bleed-ring',
  // Combat: weapon swing
  'combat-overlay__shape--swing',
  'combat-overlay__shape--swing-echo',
  'combat-overlay__shape--swing-spark',
  // Combat: shield block
  'combat-overlay__shape--block',
  'combat-overlay__shape--block-ripple',
  'combat-overlay__shape--block-spark',
  // Combat: heal
  'combat-overlay__shape--heal',
  'combat-overlay__shape--heal-rise',
  'combat-overlay__shape--heal-ring',
  // Combat: defeat
  'combat-overlay__shape--defeat',
  'combat-overlay__shape--defeat-burst',
  'combat-overlay__shape--defeat-fade',
];

function warmCssAnimations(): Promise<void> {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    container.style.cssText =
      'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;opacity:0';
    WARM_ANIMATION_CLASSES.forEach((cls) => {
      const el = document.createElement('div');
      el.className = cls;
      el.style.animationDuration = '1ms';
      el.style.animationDelay = '0s';
      el.style.animationIterationCount = '1';
      container.appendChild(el);
    });
    document.body.appendChild(container);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container.remove();
        resolve();
      });
    });
  });
}

function warmCanvas2D(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const c = document.createElement('canvas');
      c.width = 220;
      c.height = 220;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFA5A5';
        ctx.beginPath();
        ctx.arc(110, 110, 80, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2B1F33';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = 'bold 40px "Roboto Mono"';
        ctx.fillStyle = '#fff';
        ctx.fillText('20', 90, 120);
      }
    } catch {
      // ignore
    }
    resolve();
  });
}

interface LoadingScreenProps {
  onReady: () => void;
}

export default function LoadingScreen({ onReady }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [flavorIdx, setFlavorIdx] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const calledReady = useRef(false);

  const handleComplete = useCallback(() => {
    if (calledReady.current) return;
    calledReady.current = true;
    setFadeOut(true);
    setTimeout(onReady, 600);
  }, [onReady]);

  useEffect(() => {
    const interval = setInterval(() => {
      setFlavorIdx((i) => (i + 1) % FLAVOR_TEXTS.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  const stickerWarmRef = useRef(false);
  const [stickersRendered, setStickersRendered] = useState(false);

  useEffect(() => {
    if (stickerWarmRef.current) return;
    stickerWarmRef.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setStickersRendered(true);
      });
    });
  }, []);

  const stickerSvgs = useMemo(
    () =>
      ALL_STICKER_KEYS.map((k) => (
        <svg key={k} viewBox="0 0 32 32" width="1" height="1">
          <CuteSticker k={k} />
        </svg>
      )),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    // +1 fonts, +1 CSS animation warm, +1 canvas warm, +1 sticker SVG warm
    const totalTasks = ALL_IMAGES.length + 4;
    let completed = 0;

    const tick = () => {
      if (cancelled) return;
      completed++;
      setProgress(Math.round((completed / totalTasks) * 100));
      if (completed >= totalTasks) {
        handleComplete();
      }
    };

    ALL_IMAGES.forEach((src) => {
      preloadImage(src).then(tick);
    });
    preloadFonts().then(tick);
    warmCssAnimations().then(tick);
    warmCanvas2D().then(tick);

    if (stickersRendered) {
      tick();
    }

    return () => { cancelled = true; };
  }, [handleComplete, stickersRendered]);

  return (
    <div className={`loading-screen ${fadeOut ? 'loading-screen--fade-out' : ''}`}>
      <div className="loading-screen__content">
        <div className="loading-screen__hero-glow" />

        <img
          src={heroPortrait}
          alt="Hero"
          className="loading-screen__hero"
        />

        <h1 className="loading-screen__title">Dungeon Hero</h1>

        <div className="loading-screen__bar-track">
          <div
            className="loading-screen__bar-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="loading-screen__percent">{progress}%</p>

        <p className="loading-screen__flavor">{FLAVOR_TEXTS[flavorIdx]}</p>
      </div>
      {/* Hidden sticker SVGs — forces browser to parse & cache all SVG paths */}
      <div aria-hidden style={{ position: 'absolute', top: -9999, left: -9999, width: 1, height: 1, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
        {stickerSvgs}
      </div>
      {/* Hidden font-rendering probes to force browser to rasterize all weights */}
      <div aria-hidden style={{ position: 'absolute', top: -9999, left: -9999, opacity: 0, pointerEvents: 'none' }}>
        <span style={{ fontFamily: 'Lato, sans-serif', fontWeight: 300 }}>x</span>
        <span style={{ fontFamily: 'Lato, sans-serif', fontWeight: 400 }}>x</span>
        <span style={{ fontFamily: 'Lato, sans-serif', fontWeight: 700 }}>x</span>
        <span style={{ fontFamily: 'Lato, sans-serif', fontWeight: 400, fontStyle: 'italic' }}>x</span>
        <span style={{ fontFamily: 'Cinzel, serif', fontWeight: 400 }}>x</span>
        <span style={{ fontFamily: 'Cinzel, serif', fontWeight: 500 }}>x</span>
        <span style={{ fontFamily: 'Cinzel, serif', fontWeight: 600 }}>x</span>
        <span style={{ fontFamily: 'Cinzel, serif', fontWeight: 700 }}>x</span>
        <span style={{ fontFamily: '"Roboto Mono", monospace', fontWeight: 400 }}>x</span>
        <span style={{ fontFamily: '"Roboto Mono", monospace', fontWeight: 500 }}>x</span>
        <span style={{ fontFamily: '"Roboto Mono", monospace', fontWeight: 600 }}>x</span>
        <span style={{ fontFamily: '"Roboto Mono", monospace', fontWeight: 700 }}>x</span>
      </div>
    </div>
  );
}
