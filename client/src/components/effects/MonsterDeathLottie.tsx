import Lottie from 'lottie-react';
import deathExplosion from '@/assets/monster-death-explosion.json';

interface MonsterDeathLottieProps {
  onComplete?: () => void;
}

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export function MonsterDeathLottie({ onComplete }: MonsterDeathLottieProps) {
  if (prefersReducedMotion()) {
    return null;
  }

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 30,
        overflow: 'visible',
      }}
    >
      <Lottie
        animationData={deathExplosion}
        loop={false}
        autoplay
        onComplete={onComplete}
        rendererSettings={{ preserveAspectRatio: 'xMidYMid slice' }}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '160%',
          height: '160%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

export default MonsterDeathLottie;
