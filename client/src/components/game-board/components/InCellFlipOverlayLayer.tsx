/**
 * InCellFlipOverlayLayer — paints a 3D rotateY flip animation directly over
 * the active-row cell where a `destination: 'stay'` flip happened. The
 * underlying cell already shows the post-flip card; this overlay covers it
 * for ~1.1s while the front (fromCard) flips around to reveal the back
 * (toCard).
 *
 * Pure presentational — receives `inCellFlips` from `useInCellFlipAnimation`.
 */
import { memo, useEffect, useState } from 'react';
import GameCard from '@/components/GameCard';
import type { InCellFlip } from '../hooks/useInCellFlipAnimation';

export interface InCellFlipOverlayLayerProps {
  inCellFlips: InCellFlip[];
}

function InCellFlipItem({ flip }: { flip: InCellFlip }) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setFlipped(true), 350);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      className="pointer-events-none fixed dh-perspective"
      style={{
        left: flip.rect.left,
        top: flip.rect.top,
        width: flip.rect.width,
        height: flip.rect.height,
        zIndex: 90,
      }}
      aria-hidden
    >
      <div
        className="absolute inset-0 transition-transform duration-700 ease-in-out dh-preserve-3d"
        style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        <div className="absolute inset-0 dh-backface-hidden">
          <GameCard card={flip.fromCard} disableInteractions />
        </div>
        <div
          className="absolute inset-0 dh-backface-hidden"
          style={{ transform: 'rotateY(180deg)' }}
        >
          <GameCard card={flip.toCard} disableInteractions />
        </div>
      </div>
    </div>
  );
}

function InCellFlipOverlayLayerInner({ inCellFlips }: InCellFlipOverlayLayerProps) {
  if (inCellFlips.length === 0) return null;
  return (
    <>
      {inCellFlips.map(flip => (
        <InCellFlipItem key={flip.id} flip={flip} />
      ))}
    </>
  );
}

export const InCellFlipOverlayLayer = memo(InCellFlipOverlayLayerInner);
