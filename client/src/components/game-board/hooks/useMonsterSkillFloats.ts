/**
 * useMonsterSkillFloats — drives the blocking monster-skill floating-text
 * animation queue (see `rules/skill-float.ts` for the reducer contract).
 *
 * Behavior:
 *
 *   1. Subscribe to `state.pendingSkillFloats[0]` (the head of the queue).
 *      The reducer guarantees that while the queue is non-empty the engine
 *      is in `phase === 'awaitingSkillFloat'` and the pipeline hard-pauses
 *      everything else, so we just need to focus on rendering ONE entry.
 *
 *   2. When the head changes to a new entry, capture the current monster
 *      cell rect (so the float stays anchored even if the monster card
 *      moves later in the queue) and schedule a `RELEASE_MONSTER_SKILL_FLOAT`
 *      after `SKILL_FLOAT_DURATION_MS`. The reducer pops the head; if more
 *      entries remain the queue head changes and the cycle repeats.
 *
 *   3. If for some reason the monster cell has no DOM ref (e.g. the float
 *      was attributed to an equipped monster, or the row already advanced
 *      past it before the UI got around to rendering), we fall back to a
 *      centered position so the player still sees the skill name. We never
 *      skip the release — the pipeline pause MUST clear.
 *
 * Returns the active float's render data, or `null` when nothing is queued.
 */
import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { useDispatch, useGameState } from '@/hooks/useGameEngine';
import { SKILL_FLOAT_DURATION_MS, type MonsterSkillKey } from '@/game-core/monsterSkillNames';

export interface ActiveMonsterSkillFloat {
  id: string;
  monsterId: string;
  skillKey: MonsterSkillKey;
  /** Anchor style: absolute on top of monster cell when located, else centered fallback. */
  anchorStyle: CSSProperties;
}

interface UseMonsterSkillFloatsArgs {
  monsterCellRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
}

export function useMonsterSkillFloats({
  monsterCellRefs,
}: UseMonsterSkillFloatsArgs): ActiveMonsterSkillFloat | null {
  const head = useGameState(s => s.pendingSkillFloats[0] ?? null);
  const dispatch = useDispatch();

  const [active, setActive] = useState<ActiveMonsterSkillFloat | null>(null);
  const lastHeadIdRef = useRef<string | null>(null);
  const releaseTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!head) {
      lastHeadIdRef.current = null;
      setActive(null);
      if (releaseTimeoutRef.current != null) {
        window.clearTimeout(releaseTimeoutRef.current);
        releaseTimeoutRef.current = null;
      }
      return;
    }
    if (lastHeadIdRef.current === head.id) return;
    lastHeadIdRef.current = head.id;

    const anchorStyle = computeAnchorStyle(
      monsterCellRefs.current[head.monsterId] ?? null,
    );
    setActive({
      id: head.id,
      monsterId: head.monsterId,
      skillKey: head.skillKey,
      anchorStyle,
    });

    if (releaseTimeoutRef.current != null) {
      window.clearTimeout(releaseTimeoutRef.current);
    }
    const floatId = head.id;
    releaseTimeoutRef.current = window.setTimeout(() => {
      releaseTimeoutRef.current = null;
      dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    }, SKILL_FLOAT_DURATION_MS);
  }, [head, monsterCellRefs, dispatch]);

  useEffect(() => {
    return () => {
      if (releaseTimeoutRef.current != null) {
        window.clearTimeout(releaseTimeoutRef.current);
        releaseTimeoutRef.current = null;
      }
    };
  }, []);

  return active;
}

function computeAnchorStyle(cellEl: HTMLDivElement | null): CSSProperties {
  // Viewport-fixed positioning lets the overlay layer render anywhere in the
  // DOM tree without caring about its parent's transform/scroll context.
  // Mirrors the InCellFlipOverlayLayer pattern.
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
  const left = cellRect.left + cellRect.width / 2;
  const top = cellRect.top;
  return {
    position: 'fixed',
    left,
    top,
  };
}
