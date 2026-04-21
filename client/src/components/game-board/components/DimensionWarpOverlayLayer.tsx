/**
 * DimensionWarpOverlayLayer — paints the 维度扭曲 swap choreography over the
 * active-row cell + the preview-row cell directly above it.
 *
 * IMPORTANT — asymmetric front/back faces, by design:
 *   - "active overlay"  starts at the active cell, ends at the preview cell.
 *       front (rotateY 0°)   = GameCard(activeCard)            (face-up)
 *       back  (rotateY 180°) = PreviewCardBack(activeCard)     (typed back)
 *   - "preview overlay" starts at the preview cell, ends at the active cell.
 *       front (rotateY 0°)   = PreviewCardBack(previewCard)    (typed back)
 *       back  (rotateY 180°) = GameCard(previewCard)           (revealed face)
 *
 * Both overlays rotate 0° → 180° (NOT 360°) and translate to the swapped
 * position. At rotateY = 180° the back face is what's visible — and that
 * face is exactly what the underlying cell renders after the swap (the
 * active cell now holds previewCard face-up; the preview cell now holds
 * activeCard as a typed back). When the overlay unmounts, the underlying
 * cell content is visually identical to what the overlay was showing on its
 * back, so the hand-off is seamless.
 *
 * Choreography (sequential, matches "同时翻转，然后互换位置"):
 *   t = 0-350 ms : both cards rotateY 0° → 180° in place
 *                  → active overlay: GameCard → PreviewCardBack (hides itself)
 *                  → preview overlay: PreviewCardBack → GameCard (reveals!)
 *   t = 350-750ms: both cards translate to the swapped cell position
 *                  (rotation held at 180°)
 *   t = ~800 ms  : overlays unmount; cells underneath take over.
 */
import { memo, useEffect, useState, type ReactNode } from 'react';
import GameCard from '@/components/GameCard';
import { PreviewCardBack } from './PreviewRow';
import type { DimensionWarpFlight } from '../hooks/useDimensionWarpAnimation';

export interface DimensionWarpOverlayLayerProps {
  dimensionWarps: DimensionWarpFlight[];
}

interface FlipFaceProps {
  /** What's painted at rotateY 0°. */
  front: ReactNode;
  /** What's painted at rotateY 180°. */
  back: ReactNode;
}

/**
 * Two stacked faces, both `backface-visibility: hidden`, with the back
 * pre-rotated 180°. Parent applies the rotateY transform on the wrapper.
 */
function FlipFace({ front, back }: FlipFaceProps) {
  return (
    <>
      <div className="absolute inset-0 dh-backface-hidden">{front}</div>
      <div
        className="absolute inset-0 dh-backface-hidden"
        style={{ transform: 'rotateY(180deg)' }}
      >
        {back}
      </div>
    </>
  );
}

interface DimensionWarpItemProps {
  warp: DimensionWarpFlight;
}

function DimensionWarpItem({ warp }: DimensionWarpItemProps) {
  // Two phases driven by setTimeout, mirroring the timing in
  // useDimensionWarpAnimation. Using state + CSS transitions instead of RAF
  // because the choreography is fully time-driven (no per-frame math needed).
  const [phase, setPhase] = useState<'idle' | 'flip' | 'translate'>('idle');

  useEffect(() => {
    // Phase 1 (flip in place) starts on next tick so the initial rotateY(0)
    // commits first, otherwise the transition may be skipped.
    const t1 = window.setTimeout(() => setPhase('flip'), 0);
    // Phase 2 (translate) starts after the flip finishes (~350ms).
    const t2 = window.setTimeout(() => setPhase('translate'), 350);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  const { activeRect, previewRect, activeCard, previewCard } = warp;

  // Translation deltas for the two overlays: active goes (active → preview),
  // preview goes (preview → active). Both rects are viewport-space rects from
  // `getBoundingClientRect()`, so we can subtract directly.
  const dx = previewRect.left - activeRect.left;
  const dy = previewRect.top - activeRect.top;

  const inTranslatePhase = phase === 'translate';
  const activeTranslate = inTranslatePhase
    ? `translate(${dx}px, ${dy}px)`
    : 'translate(0px, 0px)';
  const previewTranslate = inTranslatePhase
    ? `translate(${-dx}px, ${-dy}px)`
    : 'translate(0px, 0px)';

  // Both overlays rotate 0° → 180° during phase 'flip' and stay there during
  // 'translate'. At 180° the back face is showing — which matches the
  // underlying cell's post-swap render exactly (see file header).
  const rotateDeg = phase === 'idle' ? 0 : 180;

  // Wrapper transition: the wrapper handles `translate` only. Since translate
  // changes only during the 'translate' phase, transition the wrapper with a
  // translate-tuned curve. Rotation is animated on the inner div with its own
  // transition.
  const wrapperTransition = 'transform 400ms cubic-bezier(0.65, 0, 0.35, 1)';
  // Inner transition: handles rotateY only. The flip duration is 350ms (eased
  // in-out so the edge-on midpoint feels weighted); we leave the same
  // transition value during 'translate' phase but rotateDeg doesn't change
  // there so it's a no-op.
  const innerTransition = 'transform 350ms ease-in-out';

  return (
    <>
      {/* Active card overlay: starts at active cell, ends at preview cell.
          Front = GameCard(activeCard), Back = PreviewCardBack(activeCard). */}
      <div
        className="pointer-events-none fixed dh-perspective"
        style={{
          left: activeRect.left,
          top: activeRect.top,
          width: activeRect.width,
          height: activeRect.height,
          zIndex: 91,
          transform: activeTranslate,
          transition: wrapperTransition,
        }}
        aria-hidden
      >
        <div
          className="absolute inset-0 dh-preserve-3d"
          style={{
            transform: `rotateY(${rotateDeg}deg)`,
            transition: innerTransition,
          }}
        >
          <FlipFace
            front={<GameCard card={activeCard} disableInteractions />}
            back={<PreviewCardBack card={activeCard} />}
          />
        </div>
      </div>

      {/* Preview card overlay: starts at preview cell, ends at active cell.
          Front = PreviewCardBack(previewCard), Back = GameCard(previewCard). */}
      <div
        className="pointer-events-none fixed dh-perspective"
        style={{
          left: previewRect.left,
          top: previewRect.top,
          width: previewRect.width,
          height: previewRect.height,
          zIndex: 91,
          transform: previewTranslate,
          transition: wrapperTransition,
        }}
        aria-hidden
      >
        <div
          className="absolute inset-0 dh-preserve-3d"
          style={{
            transform: `rotateY(${rotateDeg}deg)`,
            transition: innerTransition,
          }}
        >
          <FlipFace
            front={<PreviewCardBack card={previewCard} />}
            back={<GameCard card={previewCard} disableInteractions hideEventChoices />}
          />
        </div>
      </div>
    </>
  );
}

function DimensionWarpOverlayLayerInner({ dimensionWarps }: DimensionWarpOverlayLayerProps) {
  if (dimensionWarps.length === 0) return null;
  return (
    <>
      {dimensionWarps.map(warp => (
        <DimensionWarpItem key={warp.id} warp={warp} />
      ))}
    </>
  );
}

export const DimensionWarpOverlayLayer = memo(DimensionWarpOverlayLayerInner);
