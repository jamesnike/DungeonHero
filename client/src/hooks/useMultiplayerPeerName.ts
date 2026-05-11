/**
 * useMultiplayerPeerName — resolve a peer's display name from
 * `player_profiles` keyed by their `auth.users.id`.
 *
 * RLS background: the `player_profiles_select_room_peer` policy
 * (see `supabase/migrations/20260510_multiplayer_rooms.sql`) lets
 * authenticated clients read the row of any player they currently share
 * a `rooms` row with. So as long as the caller is signed in (anonymous
 * auth) and `peerId` is the other side of their active room, this query
 * succeeds without any extra server endpoint.
 *
 * Caching: results are memoized in a module-level Map, so re-mounting
 * the consumer (e.g. badge unmount/remount on phase flicker) does not
 * re-issue the query. The cache key is `peerId` — display names are not
 * expected to change mid-session in practice (the lobby commits the
 * name on create/join only).
 *
 * Failure modes (all return `null`):
 *   - Supabase env vars missing in the build (single-player only)
 *   - peerId === null (no multiplayer session yet)
 *   - Profile row exists but `display_name` is null/empty (legacy room
 *     created before name was required)
 *   - RLS blocks the read (caller is not in a room with peerId — only
 *     happens if state.multiplayerSession is desynced from server,
 *     which is itself a bug worth surfacing somewhere else)
 *
 * The caller is responsible for showing a fallback ("对手" / "Peer")
 * when this hook returns null. We deliberately do NOT return the
 * fallback string from here — that's a presentation concern and the
 * hook stays free of i18n.
 */

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';

/**
 * Cached lookups. `null` value is a "negative cache" entry — we already
 * tried and got nothing back, don't re-issue the query for this peerId.
 */
const peerNameCache = new Map<string, string | null>();

function getCached(peerId: string | null): string | null {
  if (!peerId) return null;
  return peerNameCache.get(peerId) ?? null;
}

export function useMultiplayerPeerName(peerId: string | null): string | null {
  // Lazy init from cache so re-mounts (badge appears/disappears on phase
  // flicker) don't show "对手" → "Alice" flash.
  const [name, setName] = useState<string | null>(() => getCached(peerId));

  useEffect(() => {
    if (!peerId) {
      setName(null);
      return;
    }

    if (peerNameCache.has(peerId)) {
      setName(peerNameCache.get(peerId) ?? null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const supa = getSupabaseClient();
      if (!supa) {
        // No multiplayer transport configured — cache miss as null so we
        // don't keep re-trying the same peerId.
        peerNameCache.set(peerId, null);
        if (!cancelled) setName(null);
        return;
      }

      try {
        const { data, error } = await supa
          .from('player_profiles')
          .select('display_name')
          .eq('id', peerId)
          .maybeSingle();

        if (cancelled) return;

        const raw =
          !error && data && typeof data.display_name === 'string'
            ? data.display_name.trim()
            : '';
        const value = raw.length > 0 ? raw : null;
        peerNameCache.set(peerId, value);
        setName(value);
      } catch {
        // Network failure / supabase client transient error. Don't
        // cache — let a future re-mount retry. Surface as null for now.
        if (!cancelled) setName(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [peerId]);

  return name;
}
