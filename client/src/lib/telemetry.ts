/**
 * Lightweight, fire-and-forget telemetry to /api/game-start (Vercel Serverless Function).
 *
 * Design:
 * - Never awaits the network request. Never throws into the caller.
 * - Uses `keepalive: true` so the request survives page unload.
 * - All errors are silently swallowed — telemetry must NEVER affect game start latency or UX.
 */

import { getOrCreateClientId } from './clientId';

/**
 * Wire-format game mode (what we actually send to /api/game-start).
 *
 * Stays as the legacy `'quick' | 'normal'` enum so the existing Postgres
 * `game_starts.game_mode CHECK(...)` constraint and accumulated analytics
 * data remain valid without a coordinated DB migration. The client only
 * has `'single' | 'multiplayer'` internally — both map to `'quick'` on the
 * wire so historical analytics stay comparable. `'normal'` is a legacy DB
 * value that we never emit anymore.
 */
export type WireGameMode = 'quick' | 'normal';

/** Internal `GameState['gameMode']` shape — kept loose so this module doesn't
 *  pull in the heavy `game-core` types. */
export type ClientGameMode = 'single' | 'multiplayer';

function toWireMode(_mode: ClientGameMode): WireGameMode {
  // Both internal modes use the same deck rules; report as 'quick' on the
  // wire to preserve compatibility with the legacy DB CHECK constraint.
  return 'quick';
}

export interface PrevGameSummary {
  gameMode: WireGameMode;
  turnCount: number;
  outcome: 'death' | 'victory' | 'abandoned';
}

interface PrevGameStateLike {
  gameMode?: ClientGameMode;
  turnCount?: number;
  gameOver?: boolean;
  victory?: boolean;
  /** Indicates the previous run never actually got past the initial setup (no real game to summarize). */
  showSkillSelection?: boolean;
}

/**
 * Build a PrevGameSummary from the previous game's engine state.
 * Returns null if the previous "run" was just the empty initial state with no real progress.
 *
 * Pass `engine.getState()` here BEFORE calling clearGameState() / initGame().
 */
export function summarizePrevGame(prev: PrevGameStateLike | null | undefined): PrevGameSummary | null {
  if (!prev) return null;
  if (prev.gameMode !== 'single' && prev.gameMode !== 'multiplayer') return null;
  const turnCount = typeof prev.turnCount === 'number' ? prev.turnCount : 0;
  if (turnCount === 0 && !prev.gameOver) return null;
  const outcome: PrevGameSummary['outcome'] = prev.gameOver
    ? prev.victory
      ? 'victory'
      : 'death'
    : 'abandoned';
  return {
    gameMode: toWireMode(prev.gameMode),
    turnCount,
    outcome,
  };
}

export function reportGameStart(
  gameMode: ClientGameMode,
  prev: PrevGameSummary | null,
): void {
  try {
    const body = JSON.stringify({
      clientId: getOrCreateClientId(),
      gameMode: toWireMode(gameMode),
      prev,
    });
    void fetch('/api/game-start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* swallow */
  }
}
