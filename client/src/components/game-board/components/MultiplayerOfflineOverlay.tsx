/**
 * MultiplayerOfflineOverlay — full-screen freeze + bailout when MP is
 * disconnected or has exhausted POST retries.
 *
 * Per design (per user spec): there is **no disconnect timeout**. When
 * the connection drops, the entire game board freezes until either:
 *   1. the connection comes back (overlay auto-dismisses), or
 *   2. the player clicks "开始新的单人游戏" to bail out to single-player.
 *
 * For `sync_failed` (POST retries exhausted), the overlay also offers
 * "立即重试" so the player doesn't have to refresh.
 *
 * Implementation notes:
 *   - The overlay is a `fixed inset-0` div with `pointer-events: auto`
 *     so it captures all clicks behind it (the game board is not
 *     gated by some 'disabled' prop chain, this is the simplest way
 *     to make the entire board un-interactable).
 *   - Backdrop is semi-transparent so the player can still see the
 *     game state behind it (helps confirm "yeah, I really am at the
 *     point where I dropped a card" before reconnecting).
 *   - The "start new single-player game" CTA dispatches the same
 *     action as the lobby's "Single Game" button, so existing flows
 *     handle the rest.
 */

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MultiplayerConnectionPhase } from '@/hooks/useMultiplayerSync';

interface MultiplayerOfflineOverlayProps {
  phase: MultiplayerConnectionPhase;
  errorMessage: string | null;
  onRetryNow: () => void;
  onStartNewSingleGame: () => void;
}

export function MultiplayerOfflineOverlay({
  phase,
  errorMessage,
  onRetryNow,
  onStartNewSingleGame,
}: MultiplayerOfflineOverlayProps) {
  const { t } = useTranslation();

  // Only render when the player should be blocked. Other phases (idle,
  // connecting, syncing, connected) don't freeze the board.
  if (phase !== 'disconnected' && phase !== 'sync_failed') return null;

  const isSyncFailed = phase === 'sync_failed';
  const titleKey = isSyncFailed
    ? 'gameBoard.multiplayerConnection.freezeTitleSyncFailed'
    : 'gameBoard.multiplayerConnection.freezeTitle';
  const descKey = isSyncFailed
    ? 'gameBoard.multiplayerConnection.freezeDescSyncFailed'
    : 'gameBoard.multiplayerConnection.freezeDescDisconnected';

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="mp-offline-title"
      className={cn(
        'fixed inset-0 z-[100] flex items-center justify-center',
        'bg-black/55 backdrop-blur-[2px]',
        // capture all clicks — the board behind us must NOT receive any
        'pointer-events-auto',
      )}
      onClick={ev => ev.stopPropagation()}
    >
      <div
        className={cn(
          'mx-4 w-full max-w-md rounded-2xl',
          'bg-zinc-900 text-white shadow-2xl ring-1 ring-white/10',
          'p-6 sm:p-7',
        )}
      >
        <div className="flex items-center gap-3">
          {/* spinner / warning icon */}
          {isSyncFailed ? (
            <span
              aria-hidden="true"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-orange-500/20 text-orange-400 text-xl"
            >
              !
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-red-500/20"
            >
              <span className="block h-3 w-3 rounded-full bg-red-500 animate-pulse" />
            </span>
          )}
          <h2
            id="mp-offline-title"
            className="text-lg font-semibold tracking-wide"
          >
            {t(titleKey)}
          </h2>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-zinc-300">
          {t(descKey)}
        </p>

        {errorMessage && (
          <p className="mt-2 text-xs text-zinc-500 break-all">
            {t('gameBoard.multiplayerConnection.errorDetail', { detail: errorMessage })}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {isSyncFailed && (
            <Button
              onClick={onRetryNow}
              className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold"
            >
              {t('gameBoard.multiplayerConnection.retryNow')}
            </Button>
          )}
          <Button
            variant={isSyncFailed ? 'outline' : 'default'}
            onClick={onStartNewSingleGame}
            className={cn(
              'w-full',
              !isSyncFailed && 'bg-emerald-500 hover:bg-emerald-400 text-zinc-900 font-semibold',
            )}
          >
            {t('gameBoard.multiplayerConnection.newSingleGame')}
          </Button>
        </div>
      </div>
    </div>
  );
}
