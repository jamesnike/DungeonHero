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
 * This stays as the legacy `'quick' | 'normal'` enum so the existing Postgres
 * `game_starts.game_mode CHECK(...)` constraint and accumulated analytics
 * data remain valid without a coordinated DB migration. Internally the game
 * uses `'single' | 'multiplayer'`; both modes today share the same underlying
 * deck rules (formerly "quick mode"), so we map both → `'quick'` on the wire.
 *
 * When the server eventually grows a real `'multiplayer'` enum value
 * (alongside a DB CHECK update), revisit `toWireMode` below.
 */
export type WireGameMode = 'quick' | 'normal';

/** Internal `GameState['gameMode']` shape — kept loose so this module doesn't
 *  pull in the heavy `game-core` types. */
export type ClientGameMode = 'single' | 'multiplayer' | 'quick' | 'normal';

function toWireMode(mode: ClientGameMode): WireGameMode {
  // Both 'single' and 'multiplayer' use the legacy "quick" deck rules; report
  // them both as 'quick' so historical analytics stay comparable.
  if (mode === 'normal') return 'normal';
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
  if (
    prev.gameMode !== 'quick' &&
    prev.gameMode !== 'normal' &&
    prev.gameMode !== 'single' &&
    prev.gameMode !== 'multiplayer'
  ) return null;
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
