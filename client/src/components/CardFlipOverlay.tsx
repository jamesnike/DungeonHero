import { useEffect, useState } from 'react';

import GameCard from './GameCard';
import type { EventTransformState } from './game-board/types';

export default function CardFlipOverlay({ state }: { state: EventTransformState }) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const flipTimer = window.setTimeout(() => setFlipped(true), 350);
    const completeTimer = window.setTimeout(() => {
      state.onComplete();
    }, 1200);
    return () => {
      window.clearTimeout(flipTimer);
      window.clearTimeout(completeTimer);
    };
  }, [state]);

  const message = state.message ?? '卷轴正在翻转成新的形态…';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xs sm:max-w-sm text-center space-y-4">
        <div
          className="relative mx-auto h-[260px] sm:h-[320px] w-[170px] sm:w-[220px] rounded-xl border border-primary/40 bg-gradient-to-br from-pink-500/20 via-purple-600/10 to-black/40 p-4 shadow-2xl dh-perspective"
        >
          <div
            className="absolute inset-4 transition-transform duration-700 ease-in-out dh-preserve-3d"
            style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
          >
            <div className="absolute inset-0 dh-backface-hidden">
              <GameCard card={state.fromCard} disableInteractions />
            </div>
            <div className="absolute inset-0 dh-backface-hidden" style={{ transform: 'rotateY(180deg)' }}>
              <GameCard card={state.toCard} disableInteractions />
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

