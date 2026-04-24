import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CuteSticker, ALL_STICKER_KEYS } from './MagicNameFlankIcons';
import { ALL_CARD_IMAGE_URLS } from '@/lib/cardImageUrls';

// `heroPortrait` is rendered in this component's JSX; the rest of the bulk
// card preloading happens via `ALL_CARD_IMAGE_URLS` (glob-driven, see
// `cardImageUrls.ts`). Do NOT re-add per-card `import x from '@assets/...'`
// statements here — they were the source of preload-coverage drift.
import heroPortrait from '@assets/generated_images/chibi_hero_adventurer_character.png';

// Every PNG in `attached_assets/generated_images/*.png` is preloaded via the
// glob in `cardImageUrls.ts`. Adding a per-image `import` here is no longer
// necessary — and is actively forbidden, because the manual list always drifts
// (we audited at one point and ~70% of knight class deck art / ~37% of the
// main dungeon deck art was missing, which manifested as the discover modal
// "卡" lag the player reported).
const ALL_IMAGES = ALL_CARD_IMAGE_URLS;

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
  // Combat: hero rising-hearts heal (HeroCard only)
  'combat-overlay__shape--hero-heal-heart',
  // Combat: blood-splatter damage shared by HeroCard + GameCard (monsters)
  'combat-overlay__shape--card-bleed-splash',
  'combat-overlay__shape--card-bleed-drop',
  // Combat: defeat — handled by Lottie + dh-card-wrapper[data-defeat] keyframes (warmed below)
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
    // Warm the monster-death card-level keyframe (selector-driven via attribute).
    const defeatEl = document.createElement('div');
    defeatEl.className = 'dh-card-wrapper';
    defeatEl.setAttribute('data-defeat', 'true');
    defeatEl.style.animationDuration = '1ms';
    defeatEl.style.animationDelay = '0s';
    defeatEl.style.animationIterationCount = '1';
    container.appendChild(defeatEl);
    document.body.appendChild(container);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container.remove();
        resolve();
      });
    });
  });
}

/**
 * Pre-fetch the monster death Lottie JSON so the first kill animates without a
 * network/parse hitch. Fire-and-forget — warm cache only, no gating of progress.
 * Matches the lazy import inside GameCard.tsx.
 *
 * NOTE: Damage hits used to share this asset via a sibling MonsterDamageLottie
 * component, but reusing the death explosion for a non-fatal "hit" had an
 * unfixable artifact: the asset's first frames already include darker smoke
 * pixels around the bright core, so the damage overlay visually washed the
 * card grey for its whole duration. Damage now uses the same shared
 * blood-splatter as the hero (`combat-overlay__shape--card-bleed-*`) and
 * no longer needs Lottie warming here.
 */
function warmMonsterDeathLottie(): void {
  void import('@/components/effects/MonsterDeathLottie').catch(() => {
    // Lottie failure should not block app boot; the GameCard Suspense fallback handles it.
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
    warmMonsterDeathLottie();

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
