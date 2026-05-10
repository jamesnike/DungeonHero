/**
 * Lightweight, fire-and-forget telemetry to /api/game-start (Vercel Serverless Function).
 *
 * Design:
 * - Never awaits the network request. Never throws into the caller.
 * - Uses `keepalive: true` so the request survives page unload.
 * - All errors are silently swallowed — telemetry must NEVER affect game start latency or UX.
 */

import { getOrCreateClientId } from './clientId';

export interface PrevGameSummary {
  gameMode: 'quick' | 'normal';
  turnCount: number;
  outcome: 'death' | 'victory' | 'abandoned';
}

interface PrevGameStateLike {
  gameMode?: 'quick' | 'normal';
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
  if (prev.gameMode !== 'quick' && prev.gameMode !== 'normal') return null;
  const turnCount = typeof prev.turnCount === 'number' ? prev.turnCount : 0;
  if (turnCount === 0 && !prev.gameOver) return null;
  const outcome: PrevGameSummary['outcome'] = prev.gameOver
    ? prev.victory
      ? 'victory'
      : 'death'
    : 'abandoned';
  return {
    gameMode: prev.gameMode,
    turnCount,
    outcome,
  };
}

export function reportGameStart(
  gameMode: 'quick' | 'normal',
  prev: PrevGameSummary | null,
): void {
  try {
    const body = JSON.stringify({
      clientId: getOrCreateClientId(),
      gameMode,
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
