import { useLayoutEffect, useState, type RefObject } from 'react';

interface FitOptions {
  /** Fraction of the viewport the element is allowed to occupy (0..1). Default 0.95. */
  padding?: number;
  /** Lower bound for the returned scale. Default 0.4. */
  minScale?: number;
  /** Upper bound for the returned scale. Default 1. */
  maxScale?: number;
}

/**
 * Returns a scale (suitable for CSS `zoom`) that ensures the referenced
 * element fits inside the viewport. The element is measured via its layout
 * box (`offsetWidth`/`offsetHeight`), which CSS `zoom` does not affect, so
 * applying the returned value back to an ancestor will not feed back into
 * the measurement.
 */
export function useFitToViewport(
  ref: RefObject<HTMLElement | null>,
  opts: FitOptions = {},
): number {
  const { padding = 0.95, minScale = 0.4, maxScale = 1 } = opts;
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;

    let raf = 0;

    const measure = () => {
      raf = 0;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w <= 0 || h <= 0) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const sx = (vw * padding) / w;
      const sy = (vh * padding) / h;
      const next = Math.max(
        minScale,
        Math.min(maxScale, Math.min(sx, sy)),
      );
      setScale(prev => (Math.abs(prev - next) < 0.005 ? prev : next));
    };

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(measure);
    };

    measure();

    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    window.addEventListener('resize', schedule);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [ref, padding, minScale, maxScale]);

  return scale;
}
