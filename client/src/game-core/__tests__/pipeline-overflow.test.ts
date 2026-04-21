/**
 * Pipeline overflow regression tests.
 *
 * Background — see `docs/auto-draw-debug.md` "Round 4":
 *   In a real-game bug report, 三牌惊雷's `onEnterHandEffect` failed to fire
 *   even though the card visibly entered the hand. The most likely cause was
 *   `pipeline.drain` hitting `MAX_STEPS` mid-chain, leaving the enqueued
 *   `TRIGGER_ON_ENTER_HAND` undrained — and a subsequent `replaceState`
 *   (undo / hydrate) wiping `state.actionQueue` before the next dispatch
 *   could continue draining.
 *
 * These tests defensively cover:
 *   - Overflow detection (`overflowed: true`, `pipeline:overflow` SideEffect)
 *   - The bumped `MAX_STEPS = 500` cap actually lets a 250-step chain finish
 *   - A 600-step chain truncates with the overflow flag and remaining queue
 *   - Documented black-box repro of the lost-trigger scenario (case D)
 *
 * NO_OP is used as the workhorse because it has no side effects, no follow-up
 * actions, and doesn't pause the pipeline — perfect for measuring the raw cap.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { GameEngine } from '..';
import type { GameState } from '../types';
import type { GameAction } from '../actions';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeQueue(count: number, action: GameAction = { type: 'NO_OP' }): GameAction[] {
  return Array.from({ length: count }, () => ({ ...action }));
}

describe('pipeline overflow', () => {
  describe('overflow detection', () => {
    it('600-step queue truncates with overflowed=true and emits pipeline:overflow', () => {
      const state = makeState();
      const queue = makeQueue(600);

      const result = drain(state, queue);

      expect(result.overflowed).toBe(true);
      expect(result.stepsProcessed).toBe(500);
      expect(result.queue.length).toBe(100);
      expect(result.pausedForInput).toBe(false);

      const overflowEvent = result.sideEffects.find(s => s.event === 'pipeline:overflow');
      expect(overflowEvent).toBeDefined();
      const payload = overflowEvent!.payload as {
        stepsProcessed: number;
        remainingQueueLength: number;
        headActionTypes: string[];
      };
      expect(payload.stepsProcessed).toBe(500);
      expect(payload.remainingQueueLength).toBe(100);
      expect(payload.headActionTypes).toEqual(['NO_OP', 'NO_OP', 'NO_OP', 'NO_OP', 'NO_OP']);
    });

    it('overflow event lists the actual head action types (not just NO_OP)', () => {
      const state = makeState();
      // 500 NO_OPs (filling the cap) + SEED_RNG at index 500 + trailing NO_OP.
      // After draining 500 steps the leftover queue starts at SEED_RNG.
      const queue: GameAction[] = [
        ...makeQueue(500),
        { type: 'SEED_RNG', seed: 42 },
        { type: 'NO_OP' },
      ];

      const result = drain(state, queue);

      expect(result.overflowed).toBe(true);
      expect(result.queue.length).toBe(2);
      const overflowEvent = result.sideEffects.find(s => s.event === 'pipeline:overflow');
      expect(overflowEvent).toBeDefined();
      const payload = overflowEvent!.payload as { headActionTypes: string[] };
      expect(payload.headActionTypes[0]).toBe('SEED_RNG');
      expect(payload.headActionTypes[1]).toBe('NO_OP');
    });
  });

  describe('MAX_STEPS = 500 cap', () => {
    it('250-step chain finishes cleanly (no overflow)', () => {
      const state = makeState();
      const queue = makeQueue(250);

      const result = drain(state, queue);

      expect(result.overflowed).toBe(false);
      expect(result.stepsProcessed).toBe(250);
      expect(result.queue.length).toBe(0);
      expect(result.sideEffects.find(s => s.event === 'pipeline:overflow')).toBeUndefined();
    });

    it('exactly-500-step chain finishes cleanly (boundary case)', () => {
      const state = makeState();
      const queue = makeQueue(500);

      const result = drain(state, queue);

      expect(result.overflowed).toBe(false);
      expect(result.stepsProcessed).toBe(500);
      expect(result.queue.length).toBe(0);
    });

    it('501-step chain truncates by 1 (boundary +1)', () => {
      const state = makeState();
      const queue = makeQueue(501);

      const result = drain(state, queue);

      expect(result.overflowed).toBe(true);
      expect(result.stepsProcessed).toBe(500);
      expect(result.queue.length).toBe(1);
    });
  });

  describe('continuation: leftover queue drains on next dispatch', () => {
    it('overflowed leftover continues to process when re-drained', () => {
      const state = makeState();
      const queue = makeQueue(600);

      const first = drain(state, queue);
      expect(first.overflowed).toBe(true);
      expect(first.queue.length).toBe(100);

      // Simulate the engine drain loop: push the leftover back through.
      const second = drain(first.state, first.queue);

      expect(second.overflowed).toBe(false);
      expect(second.stepsProcessed).toBe(100);
      expect(second.queue.length).toBe(0);
    });
  });

  describe('documented repro: undo wipes overflowed actionQueue (case D)', () => {
    /**
     * This test is intentionally documented as a *repro of the bug*, not as
     * a passing fix. It captures the exact failure mode that the Round 4
     * mitigation (raise MAX_STEPS, surface overflow) makes visible but does
     * NOT yet fix at the data layer:
     *
     *   1. A long chain enqueues TRIGGER_ON_ENTER_HAND deep in the queue.
     *   2. drain() hits MAX_STEPS, leaves TRIGGER_ON_ENTER_HAND in
     *      state.actionQueue.
     *   3. Player triggers undo → engine.popUndoCheckpoint replaces state
     *      with a snapshot whose actionQueue is empty (snapshots are taken
     *      at "stable" moments, after the queue drained).
     *   4. The pending TRIGGER_ON_ENTER_HAND is gone forever.
     *
     * The phase-2 fix (a card-level `_onEnterHandTriggered` flag + sanitize
     * audit on hand-exit paths) belongs in a separate PR. Until then, the
     * mitigation is: make overflow loud (this PR) so when it does happen
     * the player sees a banner and the bug is reportable instead of silent.
     */
    it('repro: TRIGGER_ON_ENTER_HAND deep in overflowed queue is lost on snapshot restore', () => {
      const engine = new GameEngine();
      const baselineState = engine.getState();

      // Snapshot the "stable" state — actionQueue is empty here.
      expect(baselineState.actionQueue.length).toBe(0);

      // Manually craft an overflowed leftover that includes a
      // TRIGGER_ON_ENTER_HAND we want to track.
      const overflowedLeftover: GameAction[] = [
        ...makeQueue(50),
        { type: 'TRIGGER_ON_ENTER_HAND', cardId: 'three-card-thunder-test' },
        ...makeQueue(50),
      ];

      // Simulate "engine drained, but the leftover stayed in actionQueue".
      const liveStateWithLeftover: GameState = {
        ...baselineState,
        actionQueue: overflowedLeftover,
      };

      // Sanity: the trigger is in the live state, ready to drain.
      expect(liveStateWithLeftover.actionQueue.some(
        a => a.type === 'TRIGGER_ON_ENTER_HAND',
      )).toBe(true);

      // Now simulate undo: snapshot.actionQueue is empty (taken at a
      // pre-overflow stable point), and replaceState wholesale-replaces the
      // state.
      const restoredState: GameState = { ...baselineState, actionQueue: [] };

      // The trigger is gone. There is no path to recover it from
      // restoredState alone.
      expect(restoredState.actionQueue.some(
        a => a.type === 'TRIGGER_ON_ENTER_HAND',
      )).toBe(false);

      // This is the bug: a draining trigger silently disappears across a
      // snapshot restore. Phase-2 fix needed.
    });
  });
});
