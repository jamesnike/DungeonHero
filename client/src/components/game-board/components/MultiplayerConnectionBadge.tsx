/**
 * MultiplayerConnectionBadge — small status indicator (dot + text) shown
 * in the top-right of the game board while in multiplayer mode.
 *
 * Phases:
 *   • connecting / syncing → yellow pulsing dot
 *   • connected            → green steady dot
 *   • sync_failed          → orange dot
 *   • disconnected         → red dot
 *
 * `idle` (single-player) → renders nothing.
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
  retryAttempt: number;
}

const RETRY_TOTAL = 3;

export function MultiplayerConnectionBadge({
  phase,
  retryAttempt,
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

  const labelKey =
    phase === 'connected'
      ? 'gameBoard.multiplayerConnection.phaseConnected'
      : phase === 'connecting'
        ? 'gameBoard.multiplayerConnection.phaseConnecting'
        : phase === 'syncing'
          ? 'gameBoard.multiplayerConnection.phaseSyncing'
          : phase === 'sync_failed'
            ? 'gameBoard.multiplayerConnection.phaseSyncFailed'
            : 'gameBoard.multiplayerConnection.phaseDisconnected';

  const showRetry = phase === 'syncing' && retryAttempt > 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-none flex items-center gap-1.5 rounded-full',
        'bg-black/55 backdrop-blur-sm px-2.5 py-1',
        'text-[11px] leading-none font-medium text-white shadow-sm',
        'select-none',
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', dotColor)} />
      <span>{t(labelKey)}</span>
      {showRetry && (
        <span className="text-amber-200">
          {t('gameBoard.multiplayerConnection.retryAttempt', {
            attempt: retryAttempt + 1,
            total: RETRY_TOTAL,
          })}
        </span>
      )}
    </div>
  );
}
