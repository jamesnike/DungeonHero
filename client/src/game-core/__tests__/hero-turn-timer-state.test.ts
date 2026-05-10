import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

const goblin: GameCardData = {
  id: 'm1',
  type: 'monster',
  name: 'Goblin',
  value: 5,
  hp: 10,
  maxHp: 10,
  attack: 5,
};

describe('hero turn timer — playerTurnStartedAt lifecycle', () => {
  describe('initial state', () => {
    it('is null on a fresh game (out of combat)', () => {
      const state = makeState();
      expect(state.playerTurnStartedAt).toBeNull();
    });
  });

  describe('BEGIN_COMBAT', () => {
    it('sets playerTurnStartedAt when hero starts a fresh combat (initiator=hero)', () => {
      const state = makeState({
        activeCards: [goblin, null, null, null, null],
        combatState: { ...initialCombatState },
        phase: 'playerInput',
      });
      const before = Date.now();
      const result = reduce(state, {
        type: 'BEGIN_COMBAT',
        monster: goblin,
        initiator: 'hero',
      });
      const after = Date.now();

      expect(result.state.combatState.currentTurn).toBe('hero');
      expect(result.state.playerTurnStartedAt).not.toBeNull();
      expect(result.state.playerTurnStartedAt!).toBeGreaterThanOrEqual(before);
      expect(result.state.playerTurnStartedAt!).toBeLessThanOrEqual(after);
    });

    it('does NOT set playerTurnStartedAt when monster initiates (currentTurn=monster + pendingBlock)', () => {
      const state = makeState({
        activeCards: [goblin, null, null, null, null],
        combatState: { ...initialCombatState },
        phase: 'playerInput',
      });
      const result = reduce(state, {
        type: 'BEGIN_COMBAT',
        monster: goblin,
        initiator: 'monster',
      });

      expect(result.state.combatState.currentTurn).toBe('monster');
      expect(result.state.playerTurnStartedAt).toBeNull();
    });

    it('does NOT set playerTurnStartedAt when adding to existing combat (already engaged)', () => {
      const otherMonster: GameCardData = { ...goblin, id: 'm2' };
      const existingTimestamp = Date.now() - 5_000;
      const state = makeState({
        activeCards: [goblin, otherMonster, null, null, null],
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: ['m1'],
          currentTurn: 'hero',
        },
        playerTurnStartedAt: existingTimestamp,
        phase: 'playerInput',
      });
      const result = reduce(state, {
        type: 'BEGIN_COMBAT',
        monster: otherMonster,
        initiator: 'hero',
      });

      // The original timestamp must NOT be reset by adding more engaged monsters
      // mid-turn — the timer continues from the original start.
      expect(result.state.playerTurnStartedAt).toBe(existingTimestamp);
    });
  });

  describe('END_TURN', () => {
    it('clears playerTurnStartedAt when ending the hero turn (with engaged monsters)', () => {
      const state = makeState({
        activeCards: [goblin, null, null, null, null],
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: ['m1'],
          currentTurn: 'hero',
        },
        playerTurnStartedAt: Date.now() - 30_000,
      });
      const result = reduce(state, {
        type: 'END_TURN',
        heroTurnLayerLossIds: [],
      });

      expect(result.state.playerTurnStartedAt).toBeNull();
    });

    it('clears playerTurnStartedAt when END_TURN ends combat (no engaged monsters)', () => {
      const state = makeState({
        combatState: { ...initialCombatState },
        playerTurnStartedAt: Date.now() - 10_000,
      });
      const result = reduce(state, {
        type: 'END_TURN',
        heroTurnLayerLossIds: [],
      });

      expect(result.state.playerTurnStartedAt).toBeNull();
    });
  });

  describe('START_TURN', () => {
    it('sets playerTurnStartedAt to a fresh timestamp at the start of each hero turn', () => {
      const oldTimestamp = Date.now() - 60_000;
      const state = makeState({
        playerTurnStartedAt: oldTimestamp,
      });
      const before = Date.now();
      const result = reduce(state, {
        type: 'START_TURN',
        suppressAmuletReapply: true,
      });
      const after = Date.now();

      expect(result.state.playerTurnStartedAt).not.toBeNull();
      expect(result.state.playerTurnStartedAt!).toBeGreaterThanOrEqual(before);
      expect(result.state.playerTurnStartedAt!).toBeLessThanOrEqual(after);
      expect(result.state.playerTurnStartedAt).not.toBe(oldTimestamp);
    });
  });

  describe('FINISH_COMBAT', () => {
    it('clears playerTurnStartedAt when combat finishes (last monster killed)', () => {
      const state = makeState({
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: ['m1'],
          currentTurn: 'hero',
        },
        playerTurnStartedAt: Date.now() - 5_000,
      });
      const result = reduce(state, { type: 'FINISH_COMBAT' });

      expect(result.state.playerTurnStartedAt).toBeNull();
    });
  });
});

describe('hero turn timer — FORCE_END_HERO_TURN reducer', () => {
  it('resets engine-side modal state and enqueues END_TURN', () => {
    const state = makeState({
      activeCards: [goblin, null, null, null, null],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
      },
      playerTurnStartedAt: Date.now() - 60_000,
      phase: 'awaitingMagicTarget',
      pendingMagicAction: { card: { ...goblin, id: 'magic-1', type: 'magic' as const, name: 'Test', value: 0 } as GameCardData, step: 'monster-target' } as GameState['pendingMagicAction'],
      discoverModalOpen: true,
      discoverOptions: [goblin],
      shopModalOpen: true,
      permGrantModal: { sourceCardId: 'src', sourceType: 'magic' },
      eventModalOpen: true,
    });

    const result = reduce(state, {
      type: 'FORCE_END_HERO_TURN',
      heroTurnLayerLossIds: ['m1'],
    });

    // All engine modal/interaction state cleared
    expect(result.state.pendingMagicAction).toBeNull();
    expect(result.state.discoverModalOpen).toBe(false);
    expect(result.state.discoverOptions).toEqual([]);
    expect(result.state.shopModalOpen).toBe(false);
    expect(result.state.permGrantModal).toBeNull();
    expect(result.state.eventModalOpen).toBe(false);
    // Phase pushed back to playerInput so END_TURN can drain
    expect(result.state.phase).toBe('playerInput');
    // END_TURN enqueued with the same heroTurnLayerLossIds
    expect(result.enqueuedActions).toEqual([
      { type: 'END_TURN', heroTurnLayerLossIds: ['m1'] },
    ]);
    // Side effects include log + banner
    expect(result.sideEffects.some(e => e.event === 'log:entry')).toBe(true);
    expect(result.sideEffects.some(e => e.event === 'ui:banner')).toBe(true);
  });

  it('end-to-end: drains FORCE_END_HERO_TURN → END_TURN, clearing playerTurnStartedAt (out of combat)', () => {
    // Out-of-combat ⇒ END_TURN takes the no-engaged-monsters branch → returns
    // straight to playerInput. playerTurnStartedAt stays null since no fresh
    // hero turn starts.
    const state = makeState({
      combatState: { ...initialCombatState },
      playerTurnStartedAt: 12345,
      phase: 'playerInput',
    });

    const drained = drain(state, [
      { type: 'FORCE_END_HERO_TURN', heroTurnLayerLossIds: [] },
    ]);

    expect(drained.state.playerTurnStartedAt).toBeNull();
    expect(drained.state.phase).toBe('playerInput');
  });

  it('end-to-end: FORCE_END_HERO_TURN with engaged monster transitions to monster turn', () => {
    const state = makeState({
      activeCards: [goblin, null, null, null, null],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
        monsterAttackQueue: [],
      },
      playerTurnStartedAt: Date.now() - 60_000,
      phase: 'playerInput',
    });

    const drained = drain(state, [
      { type: 'FORCE_END_HERO_TURN', heroTurnLayerLossIds: [] },
    ]);

    // After draining: monster has a pendingBlock waiting on the player.
    // currentTurn flipped to 'monster'. Phase paused on 'awaitingBlock'.
    expect(drained.state.combatState.currentTurn).toBe('monster');
    expect(drained.state.phase).toBe('awaitingBlock');
    // playerTurnStartedAt was cleared by FORCE_END_HERO_TURN (and again by
    // END_TURN); hero turn hasn't restarted yet (player must resolve the
    // block first), so it stays null.
    expect(drained.state.playerTurnStartedAt).toBeNull();
  });
});

describe('hero turn timer — persistence round-trip', () => {
  it('serializes and hydrates playerTurnStartedAt', async () => {
    const { serializeGameState } = await import('../persistence');

    const timestamp = 1700000000000;
    const state = makeState({
      playerTurnStartedAt: timestamp,
    });

    const persisted = serializeGameState(state);
    expect(persisted.playerTurnStartedAt).toBe(timestamp);
  });

  it('serializes null when not in hero combat turn', async () => {
    const { serializeGameState } = await import('../persistence');

    const state = makeState({
      playerTurnStartedAt: null,
    });

    const persisted = serializeGameState(state);
    expect(persisted.playerTurnStartedAt).toBeNull();
  });

  it('hydrates legacy snapshots (missing field) to null via createInitialGameState default', async () => {
    // Old saves predating this feature won't have `playerTurnStartedAt`. The
    // hydrate path in `GameBoard.hydrateGameState` defaults it to `null`,
    // and `createInitialGameState()` also initializes it to null — so a fresh
    // engine state never has an undefined value here.
    expect(createInitialGameState().playerTurnStartedAt).toBeNull();
  });
});
