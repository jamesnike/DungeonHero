import { useSyncExternalStore } from 'react';

const MIN_SCALE = 0.82;
const MAX_SCALE = 1.0;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function getScale() {
  if (typeof window === 'undefined') return 1;
  const raw = Math.min(window.innerWidth / 1280, window.innerHeight / 800);
  // Gentle curve: compress the range so small screens only shrink slightly.
  // raw=0.5 → 0.82, raw=0.75 → 0.91, raw=1.0 → 1.0, raw=1.5 → 1.18
  const scaled = 1 + (raw - 1) * 0.36;
  return clamp(scaled, MIN_SCALE, MAX_SCALE);
}

let cachedScale = getScale();

function subscribe(cb: () => void) {
  const onResize = () => {
    const next = getScale();
    if (next !== cachedScale) {
      cachedScale = next;
      cb();
    }
  };
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}

function getSnapshot() {
  return cachedScale;
}

function getServerSnapshot() {
  return 1;
}

export function useOverlayScale(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
