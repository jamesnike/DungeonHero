import { describe, expect, it } from 'vitest';
import { drain, processStep } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe('pipeline', () => {
  describe('processStep', () => {
    it('processes a single action and returns updated state', () => {
      const state = makeState({ hp: 15 });
      const queue: GameAction[] = [
        { type: 'APPLY_DAMAGE', amount: 5, source: 'test' },
      ];

      const result = processStep(state, queue);
      expect(result.state.hp).toBe(10);
      expect(result.queue.length).toBe(0);
    });

    it('returns unchanged state for empty queue', () => {
      const state = makeState();
      const result = processStep(state, []);
      expect(result.state).toBe(state);
    });

    it('prepends follow-up actions to the front of the queue', () => {
      const monster = {
        id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5,
        hp: 10, maxHp: 10, attack: 5,
      };
      const state = makeState({
        activeCards: [monster, null, null, null, null],
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: ['m1'],
          currentTurn: 'hero',
        },
      });
      const queue: GameAction[] = [
        { type: 'END_TURN', heroTurnLayerLossIds: [] },
        { type: 'NO_OP' },
      ];

      const result = processStep(state, queue);
      // END_TURN should enqueue ADVANCE_MONSTER_TURN before NO_OP
      expect(result.queue[0]?.type).toBe('ADVANCE_MONSTER_TURN');
      expect(result.queue[result.queue.length - 1]?.type).toBe('NO_OP');
    });
  });

  describe('drain', () => {
    it('processes all actions until queue is empty', () => {
      const state = makeState({ hp: 20 });
      const queue: GameAction[] = [
        { type: 'APPLY_DAMAGE', amount: 3, source: 'test1' },
        { type: 'APPLY_DAMAGE', amount: 2, source: 'test2' },
      ];

      const result = drain(state, queue);
      expect(result.state.hp).toBe(15);
      expect(result.queue.length).toBe(0);
      expect(result.stepsProcessed).toBe(2);
      expect(result.pausedForInput).toBe(false);
    });

    it('pauses at awaitingBlock phase', () => {
      const monster = {
        id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5,
        hp: 10, maxHp: 10, attack: 5,
      };
      const state = makeState({
        activeCards: [monster, null, null, null, null],
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: ['m1'],
          currentTurn: 'monster',
          monsterAttackQueue: ['m1'],
          pendingBlock: null,
        },
      });
      const queue: GameAction[] = [
        { type: 'ADVANCE_MONSTER_TURN' },
        { type: 'NO_OP' },
      ];

      const result = drain(state, queue);
      // Should have processed ADVANCE_MONSTER_TURN (sets pendingBlock → awaitingBlock)
      // then paused before NO_OP
      expect(result.state.phase).toBe('awaitingBlock');
      expect(result.pausedForInput).toBe(true);
      expect(result.queue.length).toBeGreaterThan(0);
    });

    it('handles NO_OP actions gracefully', () => {
      const state = makeState();
      const queue: GameAction[] = [
        { type: 'NO_OP' },
        { type: 'NO_OP' },
      ];

      const result = drain(state, queue);
      expect(result.stepsProcessed).toBe(2);
      expect(result.queue.length).toBe(0);
    });

    it('accumulates side effects across steps', () => {
      const state = makeState({ hp: 20 });
      const queue: GameAction[] = [
        { type: 'APPLY_DAMAGE', amount: 3, source: 'test1' },
        { type: 'HEAL', amount: 1, source: 'test2' },
      ];

      const result = drain(state, queue);
      expect(result.sideEffects.length).toBeGreaterThan(0);
      const events = result.sideEffects.map(e => e.event);
      expect(events).toContain('combat:heroDamaged');
      expect(events).toContain('combat:heroHealed');
    });
  });
});
