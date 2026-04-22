/**
 * Monster Skill Float Reducer — drives the blocking floating-text animation
 * queue used to surface every monster skill trigger to the player.
 *
 * Architecture:
 *
 *   reducer wants to play "怪物 X 触发了 Y 技能"
 *     ↓ enqueueFront TRIGGER_MONSTER_SKILL_FLOAT
 *   TRIGGER reducer:
 *     - push entry onto state.pendingSkillFloats
 *     - first entry: snapshot phase → skillFloatSavedPhase, switch to
 *       'awaitingSkillFloat'
 *     - emit ui:monsterSkillFloat side effect (one-shot signal carrying the
 *       newly enqueued entry; also serves as a log breadcrumb)
 *     - DOES NOT enqueue any follow-up; the pipeline naturally hits the hard
 *       pause check on the new phase
 *   ↓ pipeline.HARD_PAUSE
 *   The UI hook subscribes to `state.pendingSkillFloats[0]` (queue head) and
 *   plays one animation at a time. When the animation completes it dispatches
 *   RELEASE_MONSTER_SKILL_FLOAT { floatId } to pop that entry.
 *   RELEASE reducer:
 *     - drop the matching entry from the queue
 *     - if the queue still has entries, the hook's state subscription will
 *       see the new head and play the next animation automatically
 *     - if empty, restore phase from skillFloatSavedPhase, clear it, and the
 *       pipeline resumes draining whatever was left in the action queue
 *
 * Note: pushing N TRIGGERs in a single drain step (e.g. boss death =
 * lastWords + retaliation + summon) builds a queue of N entries; the player
 * sees them play strictly in order with no other game action interleaved.
 */

import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ReduceResult, SideEffect } from '../reducer';
import { applyPatch, noChange } from '../reducer';
import { nextId } from '../rng';
import {
  getMonsterSkillEntry,
  SKILL_FLOAT_DURATION_MS,
} from '../monsterSkillNames';

export function reduceSkillFloatActions(
  state: GameState,
  action: GameAction,
): ReduceResult | null {
  switch (action.type) {
    case 'TRIGGER_MONSTER_SKILL_FLOAT':
      return reduceTriggerMonsterSkillFloat(state, action);
    case 'RELEASE_MONSTER_SKILL_FLOAT':
      return reduceReleaseMonsterSkillFloat(state, action);
    default:
      return null;
  }
}

function reduceTriggerMonsterSkillFloat(
  state: GameState,
  action: Extract<GameAction, { type: 'TRIGGER_MONSTER_SKILL_FLOAT' }>,
): ReduceResult {
  const entry = getMonsterSkillEntry(action.skillKey);
  const [floatId, rng] = nextId(state.rng, 'skill-float');

  const newFloat = {
    id: floatId,
    monsterId: action.monsterId,
    skillKey: action.skillKey,
    skillName: entry.name,
    kind: entry.kind,
  };

  const wasIdle = state.pendingSkillFloats.length === 0;

  const patch: Partial<GameState> = {
    pendingSkillFloats: [...state.pendingSkillFloats, newFloat],
    rng,
  };

  if (wasIdle) {
    // Capture the phase the game was in BEFORE we hijacked it so we can
    // restore it after the very last release. Don't overwrite an existing
    // saved phase if for any reason we re-enter a non-idle state.
    if (state.phase !== 'awaitingSkillFloat') {
      patch.skillFloatSavedPhase = state.phase;
    }
    patch.phase = 'awaitingSkillFloat';
  }

  const sideEffects: SideEffect[] = [
    {
      event: 'ui:monsterSkillFloat',
      payload: {
        floatId,
        monsterId: action.monsterId,
        skillName: entry.name,
        skillKey: action.skillKey,
        kind: entry.kind,
        durationMs: SKILL_FLOAT_DURATION_MS,
      },
    },
    {
      event: 'log:entry',
      payload: { type: 'combat', message: `怪物技能触发：${entry.name}` },
    },
  ];

  return applyPatch(state, patch, sideEffects);
}

function reduceReleaseMonsterSkillFloat(
  state: GameState,
  action: Extract<GameAction, { type: 'RELEASE_MONSTER_SKILL_FLOAT' }>,
): ReduceResult {
  if (state.pendingSkillFloats.length === 0) {
    // Defensive: spurious release (e.g. hook timer fired after engine reset)
    return noChange(state);
  }

  const remaining = state.pendingSkillFloats.filter(f => f.id !== action.floatId);

  // No-op if the floatId did not match any queued entry. Without this guard a
  // stale release (e.g. dispatched after navigating away) could erroneously
  // reset phase even though the queue is non-empty.
  if (remaining.length === state.pendingSkillFloats.length) {
    return noChange(state);
  }

  if (remaining.length === 0) {
    const restoredPhase = state.skillFloatSavedPhase ?? 'idle';
    return applyPatch(state, {
      pendingSkillFloats: [],
      skillFloatSavedPhase: null,
      phase: restoredPhase,
    });
  }

  return applyPatch(state, { pendingSkillFloats: remaining });
}
