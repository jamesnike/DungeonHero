import { useState, useEffect, useMemo } from 'react';
import GameBoard from '@/components/GameBoard';
import { GameViewportProvider } from '@/contexts/GameViewportContext';
import {
  MIN_ASPECT_RATIO,
  MAX_ASPECT_RATIO,
} from '@/components/game-board/constants';

function useConstrainedViewport() {
  const [size, setSize] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));

  useEffect(() => {
    const onResize = () =>
      setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return useMemo(() => {
    const { w, h } = size;
    const ratio = w / h;
    if (ratio > MAX_ASPECT_RATIO) {
      return { width: Math.floor(h * MAX_ASPECT_RATIO), height: h };
    }
    if (ratio < MIN_ASPECT_RATIO) {
      return { width: w, height: Math.floor(w / MIN_ASPECT_RATIO) };
    }
    return { width: w, height: h };
  }, [size]);
}

export default function Home() {
  const { width, height } = useConstrainedViewport();

  return (
    <div className="w-screen h-screen flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: '#404040' }}
    >
      <GameViewportProvider width={width} height={height}>
        <div style={{ width, height }} className="relative overflow-hidden">
          <GameBoard />
        </div>
      </GameViewportProvider>
    </div>
  );
}
