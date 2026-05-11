/**
 * MultiplayerConnectionBadge — top-right indicator while in multiplayer.
 *
 * Layout: [colored dot] [peer display name]
 *
 * The dot color encodes the connection phase:
 *   • connected            → green steady dot
 *   • connecting / syncing → amber pulsing dot
 *   • sync_failed          → orange dot
 *   • disconnected         → red dot
 *
 * `idle` (single-player) → renders nothing.
 *
 * The text label is the *peer's* display name (resolved via
 * `useMultiplayerPeerName` in the parent) so the player always sees who
 * they're connected to. Fallback string is shown when the name hasn't
 * been resolved yet (first-frame race) or the peer has no profile name.
 *
 * The badge is purely informational. The freeze overlay
 * (`MultiplayerOfflineOverlay`) is the one that gates input — this badge
 * is just so the player has continuous awareness of connectivity even
 * when no overlay is open (e.g. during the brief `syncing` phase right
 * after a waterfall, which doesn't freeze the board).
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { MultiplayerConnectionPhase } from '@/hooks/useMultiplayerSync';

interface MultiplayerConnectionBadgeProps {
  phase: MultiplayerConnectionPhase;
  /**
   * Peer's display name resolved from `player_profiles`. Pass `null`
   * when not yet loaded / unavailable; the badge will substitute a
   * neutral fallback.
   */
  peerName: string | null;
}

export function MultiplayerConnectionBadge({
  phase,
  peerName,
}: MultiplayerConnectionBadgeProps) {
  const { t } = useTranslation();
  if (phase === 'idle') return null;

  const dotColor =
    phase === 'connected'
      ? 'bg-emerald-400'
      : phase === 'connecting' || phase === 'syncing'
        ? 'bg-amber-400 animate-pulse'
        : phase === 'sync_failed'
          ? 'bg-orange-500'
          : 'bg-red-500'; // disconnected

  const trimmed = peerName?.trim() ?? '';
  const label =
    trimmed.length > 0
      ? trimmed
      : t('gameBoard.multiplayerConnection.peerFallback');

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-none flex items-center gap-1.5 rounded-full',
        'bg-black/55 backdrop-blur-sm px-2.5 py-1',
        'text-[11px] leading-none font-medium text-white shadow-sm',
        'select-none max-w-[180px]',
      )}
    >
      <span className={cn('h-2 w-2 rounded-full shrink-0', dotColor)} />
      <span className="truncate">{label}</span>
    </div>
  );
}
