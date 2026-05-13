/**
 * Hero turn timer — pause when an active-row monster becomes stunned.
 *
 * Feature: while ANY monster on the active row has `isStunned: true`, the
 * hero turn countdown freezes (`playerTurnPausedAt` is set to the moment
 * the stun appeared). When all stuns clear, the timer **resets to its full
 * duration** (60s normal / 120s boss): `playerTurnStartedAt` is shifted to
 * a fresh `Date.now()` and `playerTurnPausedAt` is cleared.
 *
 * The transition logic lives in `postProcessTurnTimerPause` in `reducer.ts`
 * and runs after every action's reduce step, so any code path that
 * mutates `isStunned` (UPDATE_MONSTER_CARD, direct activeCards patch,
 * monster removal, processMonsterTurn auto-recovery) automatically
 * participates.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots } from '@/components/game-board/types';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeMonster(id: string, opts: Partial<GameCardData> = {}): GameCardData {
  return {
    id,
    type: 'monster',
    name: `Monster-${id}`,
    value: 5,
    hp: 10,
    maxHp: 10,
    attack: 5,
    ...opts,
  };
}

function makeActiveRow(...cards: (GameCardData | null)[]): ActiveRowSlots {
  const row: (GameCardData | null)[] = [null, null, null, null, null];
  for (let i = 0; i < cards.length && i < 5; i += 1) row[i] = cards[i];
  return row as ActiveRowSlots;
}

const TURN_STARTED_LONG_AGO = Date.now() - 30_000;

// ---------------------------------------------------------------------------
// 1. Stun appears → timer pauses (playerTurnPausedAt set)
// ---------------------------------------------------------------------------

describe('hero turn timer — pause on stun appearance', () => {
  it('UPDATE_MONSTER_CARD setting isStunned=true sets playerTurnPausedAt to now', () => {
    const monster = makeMonster('m1');
    const state = makeState({
      activeCards: makeActiveRow(monster),
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
      playerTurnStartedAt: TURN_STARTED_LONG_AGO,
      playerTurnPausedAt: null,
      phase: 'playerInput',
    });

    const before = Date.now();
    const result = reduce(state, {
      type: 'UPDATE_MONSTER_CARD',
      monsterId: 'm1',
      patch: { isStunned: true },
    });
    const after = Date.now();

    expect(result.state.playerTurnStartedAt).toBe(TURN_STARTED_LONG_AGO);
    expect(result.state.playerTurnPausedAt).not.toBeNull();
    expect(result.state.playerTurnPausedAt!).toBeGreaterThanOrEqual(before);
    expect(result.state.playerTurnPausedAt!).toBeLessThanOrEqual(after);
  });

  it('non-engaged stunned monster also pauses the timer (engagement is not required)', () => {
    // Monster m1 is the engaged one; m2 is on the active row but not engaged.
    // Stunning m2 should still pause the timer (per design — "any active row
    // stunned monster pauses").
    const m1 = makeMonster('m1');
    const m2 = makeMonster('m2');
    const state = makeState({
      activeCards: makeActiveRow(m1, m2),
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
      playerTurnStartedAt: TURN_STARTED_LONG_AGO,
      playerTurnPausedAt: null,
      phase: 'playerInput',
    });

    const result = reduce(state, {
      type: 'UPDATE_MONSTER_CARD',
      monsterId: 'm2',
      patch: { isStunned: true },
    });

    expect(result.state.playerTurnPausedAt).not.toBeNull();
  });

  it('does NOT pause when the timer is not active (playerTurnStartedAt === null)', () => {
    const monster = makeMonster('m1');
    const state = makeState({
      activeCards: makeActiveRow(monster),
      combatState: { ...initialCombatState }, // no engaged monsters, currentTurn='hero' default
      playerTurnStartedAt: null,
      playerTurnPausedAt: null,
      phase: 'playerInput',
    });

    const result = reduce(state, {
      type: 'UPDATE_MONSTER_CARD',
      monsterId: 'm1',
      patch: { isStunned: true },
    });

    // Timer not active → pause field stays null even though monster is now stunned.
    expect(result.state.playerTurnPausedAt).toBeNull();
  });

  it('idempotent: a second stun mutation while already paused does NOT reset the pause timestamp', () => {
    const m1 = makeMonster('m1', { isStunned: true });
    const m2 = makeMonster('m2');
    const originalPausedAt = Date.now() - 10_000;
    const state = makeState({
      activeCards: makeActiveRow(m1, m2),
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
      playerTurnStartedAt: TURN_STARTED_LONG_AGO,
      playerTurnPausedAt: originalPausedAt,
      phase: 'playerInput',
    });

    // Stun a second monster — timer was already paused, the freeze moment
    // should NOT advance (otherwise stunning more monsters would erase the
    // remaining time the player saw frozen).
    const result = reduce(state, {
      type: 'UPDATE_MONSTER_CARD',
      monsterId: 'm2',
      patch: { isStunned: true },
    });

    expect(result.state.playerTurnPausedAt).toBe(originalPausedAt);
  });
});

// ---------------------------------------------------------------------------
// 2. All stuns clear → timer resets to full duration
// ---------------------------------------------------------------------------

describe('hero turn timer — resume (full reset) on stun clear', () => {
  it('UPDATE_MONSTER_CARD setting isStunned=false on the only stunned monster resets playerTurnStartedAt and clears pausedAt', () => {
    const monster = makeMonster('m1', { isStunned: true });
    const state = makeState({
      activeCards: makeActiveRow(monster),
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
      playerTurnStartedAt: TURN_STARTED_LONG_AGO,
      playerTurnPausedAt: Date.now() - 5_000,
      phase: 'playerInput',
    });

    const before = Date.now();
    const result = reduce(state, {
      type: 'UPDATE_MONSTER_CARD',
      monsterId: 'm1',
      patch: { isStunned: false },
    });
    const after = Date.now();

    expect(result.state.playerTurnPausedAt).toBeNull();
    // playerTurnStartedAt is reset to a fresh Date.now() — the player gets a
    // brand-new full-duration countdown window per design.
    expect(result.state.playerTurnStartedAt).not.toBeNull();
    expect(result.state.playerTurnStartedAt).not.toBe(TURN_STARTED_LONG_AGO);
    expect(result.state.playerTurnStartedAt!).toBeGreaterThanOrEqual(before);
    expect(result.state.playerTurnStartedAt!).toBeLessThanOrEqual(after);
  });

  it('does NOT clear pause when only ONE of multiple stunned monsters is unstunned', () => {
    const m1 = makeMonster('m1', { isStunned: true });
    const m2 = makeMonster('m2', { isStunned: true });
    const originalPausedAt = Date.now() - 5_000;
    const state = makeState({
      activeCards: makeActiveRow(m1, m2),
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1', 'm2'], currentTurn: 'hero' },
      playerTurnStartedAt: TURN_STARTED_LONG_AGO,
      playerTurnPausedAt: originalPausedAt,
      phase: 'playerInput',
    });

    const result = reduce(state, {
      type: 'UPDATE_MONSTER_CARD',
      monsterId: 'm1',
      patch: { isStunned: false },
    });

    // m2 still stunned → pause stays in effect, original timestamp preserved.
    expect(result.state.playerTurnPausedAt).toBe(originalPausedAt);
    expect(result.state.playerTurnStartedAt).toBe(TURN_STARTED_LONG_AGO);
  });
});

// ---------------------------------------------------------------------------
// 3. Stunned monster removed from active row → counts as un-stun
// ---------------------------------------------------------------------------

describe('hero turn timer — pause clears when stunned monster leaves active row', () => {
  it('directly removing the stunned monster from activeCards resets the timer', () => {
    const monster = makeMonster('m1', { isStunned: true });
    const state = makeState({
      activeCards: makeActiveRow(monster),
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
      playerTurnStartedAt: TURN_STARTED_LONG_AGO,
      playerTurnPausedAt: Date.now() - 5_000,
      phase: 'playerInput',
    });

    // Simulate "monster removed" via UPDATE_ACTIVE_CARDS replacing the slot
    // with null. Any path that nukes the stunned monster from the row
    // (kill, event flip, magic destroy, etc.) goes through some reducer
    // that mutates activeCards — postProcess detects the transition.
    const result = reduce(state, {
      type: 'UPDATE_ACTIVE_CARDS',
      updater: (cards) => {
        const next: (GameCardData | null)[] = [...cards];
        next[0] = null;
        return next as ActiveRowSlots;
      },
    });

    expect(result.state.playerTurnPausedAt).toBeNull();
    expect(result.state.playerTurnStartedAt).not.toBe(TURN_STARTED_LONG_AGO);
  });
});

// ---------------------------------------------------------------------------
// 4. Pause field cleared whenever timer becomes inactive
// ---------------------------------------------------------------------------

describe('hero turn timer — pause field tracks playerTurnStartedAt nulling', () => {
  it('END_TURN clears playerTurnPausedAt alongside playerTurnStartedAt', () => {
    const monster = makeMonster('m1', { isStunned: true });
    const state = makeState({
      activeCards: makeActiveRow(monster),
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
      playerTurnStartedAt: TURN_STARTED_LONG_AGO,
      playerTurnPausedAt: Date.now() - 5_000,
    });

    const result = reduce(state, {
      type: 'END_TURN',
      heroTurnLayerLossIds: [],
    });

    expect(result.state.playerTurnStartedAt).toBeNull();
    expect(result.state.playerTurnPausedAt).toBeNull();
  });

  it('FORCE_END_HERO_TURN clears playerTurnPausedAt alongside playerTurnStartedAt', () => {
    const monster = makeMonster('m1', { isStunned: true });
    const state = makeState({
      activeCards: makeActiveRow(monster),
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
      playerTurnStartedAt: TURN_STARTED_LONG_AGO,
      playerTurnPausedAt: Date.now() - 5_000,
      phase: 'playerInput',
    });

    const result = reduce(state, {
      type: 'FORCE_END_HERO_TURN',
      heroTurnLayerLossIds: [],
    });

    expect(result.state.playerTurnStartedAt).toBeNull();
    expect(result.state.playerTurnPausedAt).toBeNull();
  });

  it('FINISH_COMBAT clears playerTurnPausedAt alongside playerTurnStartedAt', () => {
    // FINISH_COMBAT mostly empties the active row anyway, but be defensive
    // in case a future code path keeps a stunned non-engaged monster around
    // when combat ends.
    const state = makeState({
      activeCards: makeActiveRow(),
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
      playerTurnStartedAt: TURN_STARTED_LONG_AGO,
      playerTurnPausedAt: Date.now() - 5_000,
    });

    const result = reduce(state, { type: 'FINISH_COMBAT' });

    expect(result.state.playerTurnStartedAt).toBeNull();
    expect(result.state.playerTurnPausedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. START_TURN with a pre-existing stunned monster on the row
// ---------------------------------------------------------------------------

describe('hero turn timer — fresh hero turn with stunned monster already on row', () => {
  it('START_TURN immediately sets playerTurnPausedAt when active row already has a stunned monster', () => {
    // Scenario: player stunned a non-engaged monster last turn, ended turn,
    // monster turn ran (only engaged monsters un-stun automatically — see
    // combat.ts `processMonsterTurn`), so the stun persists into the new
    // hero turn. The new hero turn should start in the paused state.
    const stunnedMonster = makeMonster('m1', { isStunned: true });
    const state = makeState({
      activeCards: makeActiveRow(stunnedMonster),
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero' },
      playerTurnStartedAt: null,
      playerTurnPausedAt: null,
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
    expect(result.state.playerTurnPausedAt).not.toBeNull();
    // Both timestamps were set in the same step → freeze value ≈ full duration.
    expect(
      result.state.playerTurnPausedAt! - result.state.playerTurnStartedAt!,
    ).toBeLessThanOrEqual(50);
  });
});

// ---------------------------------------------------------------------------
// 6. End-to-end: pause persists across drain steps; un-stun resets
// ---------------------------------------------------------------------------

describe('hero turn timer — end-to-end with drain pipeline', () => {
  it('drain([UPDATE_MONSTER_CARD stun=true, ...other actions...]) leaves pause intact', () => {
    const monster = makeMonster('m1');
    const state = makeState({
      activeCards: makeActiveRow(monster),
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
      playerTurnStartedAt: TURN_STARTED_LONG_AGO,
      playerTurnPausedAt: null,
      phase: 'playerInput',
    });

    const drained = drain(state, [
      { type: 'UPDATE_MONSTER_CARD', monsterId: 'm1', patch: { isStunned: true } },
      // Simulate some unrelated follow-up (a heal, a log entry) — pause must persist.
      { type: 'HEAL', amount: 1, source: 'test' },
    ]);

    expect(drained.state.playerTurnPausedAt).not.toBeNull();
    expect(drained.state.playerTurnStartedAt).toBe(TURN_STARTED_LONG_AGO);
  });

  it('drain([stun=true, ..., stun=false]) ends with un-paused, fresh playerTurnStartedAt', () => {
    const monster = makeMonster('m1');
    const state = makeState({
      activeCards: makeActiveRow(monster),
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
      playerTurnStartedAt: TURN_STARTED_LONG_AGO,
      playerTurnPausedAt: null,
      phase: 'playerInput',
    });

    const before = Date.now();
    const drained = drain(state, [
      { type: 'UPDATE_MONSTER_CARD', monsterId: 'm1', patch: { isStunned: true } },
      { type: 'UPDATE_MONSTER_CARD', monsterId: 'm1', patch: { isStunned: false } },
    ]);
    const after = Date.now();

    expect(drained.state.playerTurnPausedAt).toBeNull();
    expect(drained.state.playerTurnStartedAt).not.toBe(TURN_STARTED_LONG_AGO);
    expect(drained.state.playerTurnStartedAt!).toBeGreaterThanOrEqual(before);
    expect(drained.state.playerTurnStartedAt!).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// 7. Page-reload-equivalent: state restored mid-pause stays paused
// ---------------------------------------------------------------------------

describe('hero turn timer — restored mid-pause state behaves correctly', () => {
  it('a state hydrated with playerTurnPausedAt set continues to behave as paused (no spontaneous reset)', () => {
    // Simulate a hydrate: state has monster stunned + paused. Apply a no-op
    // action; pause must NOT auto-clear (the monster is still stunned).
    const monster = makeMonster('m1', { isStunned: true });
    const restoredPausedAt = Date.now() - 3_600_000; // 1 hour ago
    const state = makeState({
      activeCards: makeActiveRow(monster),
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
      playerTurnStartedAt: restoredPausedAt - 5_000, // pause started 5s into the turn, 1 hour ago
      playerTurnPausedAt: restoredPausedAt,
      phase: 'playerInput',
    });

    const result = reduce(state, { type: 'NO_OP' });

    // Pause field is preserved; playerTurnStartedAt is preserved.
    // Even though the wall-clock advanced 1 hour, the displayed remaining
    // time (computed from the frozen pausedAt) is unchanged.
    expect(result.state.playerTurnPausedAt).toBe(restoredPausedAt);
    expect(result.state.playerTurnStartedAt).toBe(restoredPausedAt - 5_000);
  });
});
