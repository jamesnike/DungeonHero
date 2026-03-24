import { useState, useEffect, useCallback, useRef } from 'react';

import dragonImage from '@assets/generated_images/cute_chibi_dragon_monster.png';
import skeletonImage from '@assets/generated_images/cute_chibi_skeleton_monster.png';
import goblinImage from '@assets/generated_images/cute_chibi_goblin_monster.png';
import ogreImage from '@assets/generated_images/cute_chibi_ogre_monster.png';
import wraithImage from '@assets/generated_images/cute_chibi_wraith_monster.png';
import swordImage from '@assets/generated_images/cute_cartoon_medieval_sword.png';
import axeImage from '@assets/generated_images/cute_cartoon_battle_axe.png';
import daggerImage from '@assets/generated_images/cute_cartoon_dagger.png';
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
import skillScrollImage from '@assets/generated_images/chibi_skill_scroll.png';
import eventScrollImage from '@assets/generated_images/chibi_event_scroll.png';
import heroPortrait from '@assets/generated_images/chibi_hero_adventurer_character.png';
import cardBackImage from '@assets/generated_images/card_back_design.png';

const ALL_IMAGES = [
  dragonImage, skeletonImage, goblinImage, ogreImage, wraithImage,
  swordImage, axeImage, daggerImage,
  woodenShieldImage, ironShieldImage, heavyShieldImage,
  potionImage, potionConcentratedHealImage, potionWeaponRepairImage,
  potionEquipmentRepairImage, potionBackpackDrawImage, potionDiscoverImage,
  potionTwilightImage, potionSpellDamageImage, potionArcaneInfusionImage,
  potionBackpackExpandImage,
  lifeAmuletImage, strengthAmuletImage, guardianAmuletImage,
  balanceAmuletImage, lifestealAmuletImage, flashAmuletImage,
  dualguardAmuletImage, thunderAmuletImage,
  skillScrollImage, eventScrollImage,
  heroPortrait, cardBackImage,
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
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
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
  'animate-card-remove',
  'combat-overlay__shape--bleed',
  'combat-overlay__shape--bleed-ring',
  'combat-overlay__shape--heal',
  'combat-overlay__shape--heal-rise',
  'combat-overlay__shape--heal-ring',
  'animate-preview-drop',
  'animate-preview-graveyard',
  'animate-active-landing',
  'animate-preview-deal',
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

  useEffect(() => {
    let cancelled = false;
    // +1 fonts, +1 CSS animation warm, +1 canvas warm
    const totalTasks = ALL_IMAGES.length + 3;
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

    return () => { cancelled = true; };
  }, [handleComplete]);

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
