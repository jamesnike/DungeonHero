/**
 * Test-only helpers for the action pipeline.
 *
 * Why this file exists:
 *
 *   The reducer-side monster-skill float queue (see `rules/skill-float.ts`)
 *   intentionally HARD-pauses the action pipeline whenever a monster skill
 *   triggers, so the player physically cannot do anything until they have
 *   seen the floating-text animation. The pipeline only resumes after the
 *   UI hook dispatches `RELEASE_MONSTER_SKILL_FLOAT`.
 *
 *   Most reducer tests just call `drain(state, [...actions])` and assert on
 *   the final state. With the float queue in place, the drain stops at the
 *   first TRIGGER and the rest of the queued actions never run. Tests that
 *   exercise paths involving monster skills (lastWords, revive,
 *   wraithDestroyAmulet, auto-engage, etc.) need a way to advance the queue
 *   without spinning up a full React UI hook.
 *
 *   `drainAutoReleasingFloats` is that bridge: drain → if floats queued, pop
 *   the head → drain again → repeat until the queue is empty AND no floats
 *   are pending. It mimics what `useMonsterSkillFloats` does in the real
 *   game, just synchronously and without timers.
 *
 *   DO NOT use this in production code. Production goes through the React
 *   hook so the player sees each animation. Tests use this so they can keep
 *   asserting on final-state outcomes.
 */
import { drain, type PipelineResult } from '../pipeline';
import type { GameState } from '../types';
import type { GameAction } from '../actions';

const MAX_RELEASE_ITERATIONS = 200;

export function drainAutoReleasingFloats(
  state: GameState,
  queue: GameAction[],
): PipelineResult {
  let result = drain(state, queue);
  let iterations = 0;
  while (result.state.pendingSkillFloats.length > 0) {
    if (++iterations > MAX_RELEASE_ITERATIONS) {
      throw new Error(
        `[drainAutoReleasingFloats] Too many iterations — float queue did ` +
          `not drain after ${MAX_RELEASE_ITERATIONS} releases. Probable ` +
          `infinite trigger loop. Pending: ${JSON.stringify(
            result.state.pendingSkillFloats.slice(0, 5).map((f) => f.skillKey),
          )}`,
      );
    }
    const head = result.state.pendingSkillFloats[0];
    const next = drain(result.state, [
      { type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId: head.id },
      ...result.queue,
    ]);
    result = {
      state: next.state,
      queue: next.queue,
      sideEffects: [...result.sideEffects, ...next.sideEffects],
      stepsProcessed: result.stepsProcessed + next.stepsProcessed,
      pausedForInput: next.pausedForInput,
      overflowed: result.overflowed || next.overflowed,
    };
  }
  return result;
}
