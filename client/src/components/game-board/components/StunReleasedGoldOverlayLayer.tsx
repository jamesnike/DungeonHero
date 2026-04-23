/**
 * StunReleasedGoldOverlayLayer — renders all currently-active 「雷金护符」
 * gold-burst floats as absolutely-positioned children of the game board.
 *
 * Multiple concurrent entries are supported (e.g. 震慑领域 stuns multiple
 * monsters in the same frame → one float per monster, all visible
 * simultaneously). The hook (`useStunReleasedGoldFx`) auto-removes each
 * entry after `STUN_GOLD_FX_DURATION_MS`.
 *
 * Z-INDEX:
 *   The float should sit above combat overlays (bleed, weapon swing, shield
 *   block) but below modals. We place it at z-index 60 — above the
 *   `combat-overlay` layer (z ≈ 30) and the hero-heal overlay (z=41), but
 *   below the monster-skill-float wrapper (z=200) so a concurrent monster
 *   skill announcement still wins focus.
 */
import { memo } from 'react';
import { StunReleasedGoldFloat } from '@/components/effects/StunReleasedGoldFloat';
import type { ActiveStunReleasedGoldFx } from '../hooks/useStunReleasedGoldFx';

export interface StunReleasedGoldOverlayLayerProps {
  active: ActiveStunReleasedGoldFx[];
}

function StunReleasedGoldOverlayLayerInner({ active }: StunReleasedGoldOverlayLayerProps) {
  if (active.length === 0) return null;
  return (
    <>
      {active.map(entry => (
        <div
          key={entry.id}
          className="pointer-events-none"
          style={{
            ...entry.anchorStyle,
            zIndex: 60,
          }}
          aria-hidden={false}
        >
          <StunReleasedGoldFloat goldDelta={entry.goldDelta} />
        </div>
      ))}
    </>
  );
}

export const StunReleasedGoldOverlayLayer = memo(StunReleasedGoldOverlayLayerInner);
