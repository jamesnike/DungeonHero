import { memo } from 'react';
import { cn } from '@/lib/utils';

interface MultiplayerPortalOverlayProps {
  /**
   * `compact` = NarrowSidebar variant (right-edge thin strip). Smaller,
   * less intrusive overlay so the count badge stays readable.
   */
  compact?: boolean;
}

/**
 * Visual marker rendered on top of the GraveyardZone in 2-player mode.
 * Tells the player "this is the teleport portal — squeezed-out cards in
 * waterfall fly here and get teleported to your opponent (they do NOT
 * actually enter the graveyard)".
 *
 * Pure CSS (no images): purple/cyan glow ring + slow spin + soft pulse.
 * Respects `prefers-reduced-motion` (animations disabled, static glow only).
 */
function MultiplayerPortalOverlayInner({ compact = false }: MultiplayerPortalOverlayProps) {
  return (
    <div
      className={cn('mp-portal-overlay', compact && 'mp-portal-overlay--compact')}
      aria-hidden="true"
      data-testid="multiplayer-portal-overlay"
    >
      <div className="mp-portal-overlay-inner" />
    </div>
  );
}

export const MultiplayerPortalOverlay = memo(MultiplayerPortalOverlayInner);
