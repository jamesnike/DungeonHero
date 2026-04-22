/**
 * Sequential blocking — pipeline-level integration test for the monster-skill
 * float queue.
 *
 * Design note: TRIGGER actions are themselves `isHardPauseContinuation`, so a
 * reducer that enqueues 3 TRIGGERs followed by a downstream action will
 * drain ALL THREE TRIGGERs synchronously in one pipeline step, build a
 * `pendingSkillFloats` queue of 3, then HARD-pause before the downstream
 * action. The "sequential animation" part is enforced at the UI layer: the
 * hook subscribes to `state.pendingSkillFloats[0]` and only plays one
 * animation at a time, dispatching RELEASE to pop the head between plays.
 *
 * What we verify here:
 *
 *   1. Three TRIGGERs followed by a downstream action: pipeline drains the
 *      three TRIGGERs into the float queue, then pauses BEFORE the
 *      downstream action. The player sees the floats one-at-a-time via the
 *      UI's queue-head subscription.
 *   2. The downstream action is NEVER processed before the queue empties.
 *   3. After the FINAL release the saved phase is restored and the
 *      downstream action drains.
 *   4. Side-effecting actions arriving while the queue is non-empty stay
 *      queued (HARD_PAUSE_PHASES overrides isInputContinuation).
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe('skill-float pipeline blocking — sequential animation order', () => {
  it('three TRIGGERs followed by a downstream action: queue all three floats, pause before downstream, then UI drains them one at a time', () => {
    const state = makeState({ phase: 'playerInput', hp: 10 });
    const hpBefore = state.hp;

    const queue: GameAction[] = [
      { type: 'TRIGGER_MONSTER_SKILL_FLOAT', monsterId: 'm1', skillKey: 'death:lastWords:discardHand' },
      { type: 'TRIGGER_MONSTER_SKILL_FLOAT', monsterId: 'm1', skillKey: 'death:lastWords:wraithHaunt' },
      { type: 'TRIGGER_MONSTER_SKILL_FLOAT', monsterId: 'm1', skillKey: 'death:lastWords:skeleton' },
      { type: 'HEAL', amount: 1 },
    ];

    // Drain — all three TRIGGERs process (they're hard-pause continuations);
    // pipeline pauses on the HEAL because phase is awaitingSkillFloat and
    // HEAL is not a hard-pause continuation.
    let result = drain(state, queue);
    expect(result.pausedForInput).toBe(true);
    expect(result.state.phase).toBe('awaitingSkillFloat');
    expect(result.state.pendingSkillFloats.length).toBe(3);
    expect(result.state.pendingSkillFloats.map((f) => f.skillKey)).toEqual([
      'death:lastWords:discardHand',
      'death:lastWords:wraithHaunt',
      'death:lastWords:skeleton',
    ]);
    expect(result.state.skillFloatSavedPhase).toBe('playerInput');
    expect(result.queue.length).toBe(1);
    expect(result.queue[0].type).toBe('HEAL');
    expect(result.state.hp).toBe(hpBefore); // HEAL did not run yet

    // UI plays float #1, dispatches RELEASE for its id.
    const firstId = result.state.pendingSkillFloats[0].id;
    result = drain(result.state, [
      { type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId: firstId },
      ...result.queue,
    ]);
    // Queue still has 2 floats → phase stays locked, HEAL stays queued.
    expect(result.state.pendingSkillFloats.length).toBe(2);
    expect(result.state.phase).toBe('awaitingSkillFloat');
    expect(result.queue.length).toBe(1);
    expect(result.queue[0].type).toBe('HEAL');
    expect(result.state.hp).toBe(hpBefore);

    // UI plays float #2.
    const secondId = result.state.pendingSkillFloats[0].id;
    expect(result.state.pendingSkillFloats[0].skillKey).toBe('death:lastWords:wraithHaunt');
    result = drain(result.state, [
      { type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId: secondId },
      ...result.queue,
    ]);
    expect(result.state.pendingSkillFloats.length).toBe(1);
    expect(result.state.phase).toBe('awaitingSkillFloat');
    expect(result.queue.length).toBe(1);
    expect(result.state.hp).toBe(hpBefore);

    // UI plays float #3 — final release. Phase restores and the HEAL drains.
    const thirdId = result.state.pendingSkillFloats[0].id;
    expect(result.state.pendingSkillFloats[0].skillKey).toBe('death:lastWords:skeleton');
    result = drain(result.state, [
      { type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId: thirdId },
      ...result.queue,
    ]);
    expect(result.state.pendingSkillFloats.length).toBe(0);
    expect(result.state.phase).toBe('playerInput');
    expect(result.state.skillFloatSavedPhase).toBeNull();
    expect(result.queue.length).toBe(0);
    expect(result.state.hp).toBe(hpBefore + 1); // HEAL finally ran
  });

  it('a reducer-enqueued chain that mixes TRIGGER + downstream action does NOT leak the downstream past the pause', () => {
    // Important regression: HEAL should NOT process in the same drain as the
    // TRIGGER that precedes it. The test above uses TRIGGERs back-to-back; this
    // one specifically pairs ONE TRIGGER with ONE downstream action.
    const state = makeState({ phase: 'playerInput', hp: 10 });
    const queue: GameAction[] = [
      { type: 'TRIGGER_MONSTER_SKILL_FLOAT', monsterId: 'm1', skillKey: 'attack:bossRetaliation' },
      { type: 'HEAL', amount: 5 },
    ];

    const result = drain(state, queue);
    expect(result.state.phase).toBe('awaitingSkillFloat');
    expect(result.state.hp).toBe(10); // HEAL did NOT process
    expect(result.queue.length).toBe(1);
    expect(result.queue[0].type).toBe('HEAL');
  });

  it('non-skill-float actions that arrive in the queue while paused stay queued (HARD pause is not a normal input pause)', () => {
    // A HEAL action sitting at the head of the queue should keep the pipeline
    // hard-paused even though HEAL is normally an `isInputContinuation`. This
    // is the entire point of HARD_PAUSE_PHASES — the float must not be
    // interrupted by side-effecting follow-ups.
    let state = makeState({ phase: 'playerInput' });
    state = drain(state, [
      { type: 'TRIGGER_MONSTER_SKILL_FLOAT', monsterId: 'm', skillKey: 'enter:auto-engage' },
      { type: 'HEAL', amount: 99 },
    ]).state;

    // Now state.phase is awaitingSkillFloat with HEAL queued. Drain again
    // (simulating any additional dispatch trying to advance the queue).
    const result = drain(state, [{ type: 'HEAL', amount: 99 }]);
    expect(result.pausedForInput).toBe(true);
    expect(result.state.phase).toBe('awaitingSkillFloat');
    expect(result.queue.length).toBe(1);
    expect(result.queue[0].type).toBe('HEAL');
  });
});
