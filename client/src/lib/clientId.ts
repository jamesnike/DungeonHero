/**
 * Anonymous, persistent per-browser client id.
 *
 * Stored in `localStorage` under `dh_client_id`. UUID v4 from `crypto.randomUUID()`
 * if available, otherwise a timestamped pseudo-random fallback. Defaults to the
 * literal string `'anon'` if `localStorage` is unavailable (private browsing,
 * Safari quota errors, etc.) so callers always get a stable string back.
 *
 * Used by:
 * - lib/telemetry.ts          — `/api/game-start` reportGameStart()
 * - lib/cardStamps.ts         — `/api/card-stamps` postStamp()
 *
 * Extracted from `lib/telemetry.ts` so the cardStamps module can reuse the same
 * id without an import cycle.
 */

const CLIENT_ID_KEY = 'dh_client_id';

export function getOrCreateClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return 'anon';
  }
}
