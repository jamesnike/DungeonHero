/**
 * useStunReleasedGoldFx — drives the non-blocking 「雷金护符」visual that
 * fires whenever a stun is converted into gold + immediate un-stun by the
 * stun-gold amulet.
 *
 * Behavior:
 *
 *   1. Subscribes to `combat:stunReleasedByGoldAmulet` side effects emitted
 *      from `economy.ts:maybeEnqueueStunGold`.
 *
 *   2. On each emit, captures the current monster cell rect (so the float
 *      stays anchored even if the monster card moves later — e.g. a
 *      subsequent waterfall promotion) and pushes a new active entry with a
 *      unique id + the gold delta.
 *
 *   3. Auto-removes the entry after `STUN_GOLD_FX_DURATION_MS` (~1400ms),
 *      matching the longest CSS keyframe in `index.css` (the rising "+N G"
 *      text). Multiple concurrent floats are supported (e.g. 震慑领域 stuns
 *      several monsters in the same frame → one float per monster, all
 *      visible simultaneously).
 *
 * NON-BLOCKING:
 *   Unlike `useMonsterSkillFloats`, this hook does NOT pause the game
 *   pipeline. The reducer enqueues MODIFY_GOLD + UPDATE_MONSTER_CARD
 *   { isStunned: false } in the same frame; combat continues immediately
 *   while the visual plays out as a pure UI effect.
 *
 * FALLBACK ANCHOR:
 *   If the monster cell ref is missing (animation was scheduled before the
 *   row mounted, or cell was removed mid-animation), we fall back to a
 *   centered fixed position so the player still sees the gold burst.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { useGameEvent } from '@/hooks/useGameEngine';

export const STUN_GOLD_FX_DURATION_MS = 1400;

export interface ActiveStunReleasedGoldFx {
  id: string;
  monsterId: string;
  goldDelta: number;
  /** Anchor style: absolute on top of monster cell when located, else centered fallback. */
  anchorStyle: CSSProperties;
}

interface UseStunReleasedGoldFxArgs {
  monsterCellRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
}

let nextLocalId = 0;

export function useStunReleasedGoldFx({
  monsterCellRefs,
}: UseStunReleasedGoldFxArgs): ActiveStunReleasedGoldFx[] {
  const [active, setActive] = useState<ActiveStunReleasedGoldFx[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeEntry = useCallback((id: string) => {
    setActive(prev => prev.filter(e => e.id !== id));
    const t = timersRef.current.get(id);
    if (t != null) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
  }, []);

  useGameEvent('combat:stunReleasedByGoldAmulet', ({ monsterId, goldDelta }) => {
    if (goldDelta <= 0) return;
    const id = `stun-gold-fx-${++nextLocalId}`;
    const anchorStyle = computeAnchorStyle(monsterCellRefs.current[monsterId] ?? null);
    setActive(prev => [...prev, { id, monsterId, goldDelta, anchorStyle }]);
    const t = setTimeout(() => removeEntry(id), STUN_GOLD_FX_DURATION_MS);
    timersRef.current.set(id, t);
  });

  useEffect(() => {
    return () => {
      // Snapshot map at cleanup time to satisfy react-hooks/exhaustive-deps:
      // the ref's `.current` could be reassigned in StrictMode double-mount,
      // but cleanup needs the value as it was when the effect ran.
      const timers = timersRef.current;
      timers.forEach(t => clearTimeout(t));
      timers.clear();
    };
  }, []);

  return active;
}

function computeAnchorStyle(cellEl: HTMLDivElement | null): CSSProperties {
  // Mirrors `useMonsterSkillFloats.computeAnchorStyle`: viewport-fixed so the
  // overlay layer doesn't need to share a transform / scroll context with the
  // game board.
  if (!cellEl) {
    return {
      position: 'fixed',
      left: '50%',
      top: '40%',
      transform: 'translate(-50%, -50%)',
    };
  }
  const cellRect = cellEl.getBoundingClientRect();
  if (cellRect.width === 0 || cellRect.height === 0) {
    return {
      position: 'fixed',
      left: '50%',
      top: '40%',
      transform: 'translate(-50%, -50%)',
    };
  }
  // Anchor at the center of the monster cell. The float component itself
  // uses `transform: translate(-50%, -50%)` in CSS to center on the anchor.
  const left = cellRect.left + cellRect.width / 2;
  const top = cellRect.top + cellRect.height / 2;
  return {
    position: 'fixed',
    left,
    top,
  };
}
