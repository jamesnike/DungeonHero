import { useState, useEffect, useMemo, useRef } from 'react';
import GameBoard from '@/components/GameBoard';
import { GameViewportProvider } from '@/contexts/GameViewportContext';
import {
  MIN_ASPECT_RATIO,
  MAX_ASPECT_RATIO,
} from '@/components/game-board/constants';

function getViewportSize() {
  if (typeof window === 'undefined') return { w: 1280, h: 800 };
  const vp = window.visualViewport;
  return {
    w: vp?.width ?? window.innerWidth,
    h: vp?.height ?? window.innerHeight,
  };
}

function useConstrainedViewport() {
  const [size, setSize] = useState(getViewportSize);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const update = () => setSize(getViewportSize());
    const onResize = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(update, 150);
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useMemo(() => {
    const { w, h } = size;
    const ratio = w / h;
    if (ratio > MAX_ASPECT_RATIO) {
      return { width: Math.floor(h * MAX_ASPECT_RATIO), height: h, viewportHeight: h };
    }
    if (ratio < MIN_ASPECT_RATIO) {
      return { width: w, height: Math.floor(w / MIN_ASPECT_RATIO), viewportHeight: h };
    }
    return { width: w, height: h, viewportHeight: h };
  }, [size]);
}

export default function Home() {
  const { width, height, viewportHeight } = useConstrainedViewport();

  return (
    <div className="w-screen flex items-center justify-center overflow-hidden"
      style={{ height: viewportHeight, backgroundColor: '#404040' }}
    >
      <GameViewportProvider width={width} height={height}>
        <div style={{ width, height }} className="relative overflow-hidden">
          <GameBoard />
        </div>
      </GameViewportProvider>
    </div>
  );
}
