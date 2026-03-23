import { useState, useEffect, useCallback, useRef } from 'react';

import dragonImage from '@assets/generated_images/cute_chibi_dragon_monster.png';
import skeletonImage from '@assets/generated_images/cute_chibi_skeleton_monster.png';
import goblinImage from '@assets/generated_images/cute_chibi_goblin_monster.png';
import ogreImage from '@assets/generated_images/cute_chibi_ogre_monster.png';
import swordImage from '@assets/generated_images/cute_cartoon_medieval_sword.png';
import axeImage from '@assets/generated_images/cute_cartoon_battle_axe.png';
import daggerImage from '@assets/generated_images/cute_cartoon_dagger.png';
import woodenShieldImage from '@assets/generated_images/cute_wooden_shield.png';
import ironShieldImage from '@assets/generated_images/cute_iron_shield.png';
import heavyShieldImage from '@assets/generated_images/simple_heavy_shield.png';
import potionImage from '@assets/generated_images/cute_cartoon_healing_potion.png';
import lifeAmuletImage from '@assets/generated_images/chibi_life_amulet.png';
import strengthAmuletImage from '@assets/generated_images/chibi_strength_amulet.png';
import guardianAmuletImage from '@assets/generated_images/chibi_guardian_amulet.png';
import skillScrollImage from '@assets/generated_images/chibi_skill_scroll.png';
import eventScrollImage from '@assets/generated_images/chibi_event_scroll.png';
import heroPortrait from '@assets/generated_images/chibi_hero_adventurer_character.png';
import cardBackImage from '@assets/generated_images/card_back_design.png';

const ALL_IMAGES = [
  dragonImage, skeletonImage, goblinImage, ogreImage,
  swordImage, axeImage, daggerImage,
  woodenShieldImage, ironShieldImage, heavyShieldImage,
  potionImage,
  lifeAmuletImage, strengthAmuletImage, guardianAmuletImage,
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

function preloadFonts(): Promise<void> {
  if (document.fonts?.ready) {
    return document.fonts.ready.then(() => undefined);
  }
  return Promise.resolve();
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
    const totalTasks = ALL_IMAGES.length + 1; // +1 for fonts
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
    </div>
  );
}
