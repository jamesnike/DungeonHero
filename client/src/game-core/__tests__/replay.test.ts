import { describe, expect, it } from 'vitest';
import { reduce, applyPatch } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import { createRng } from '../rng';
import { initialCombatState } from '../constants';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe('replay', () => {
  it('SEED_RNG resets the PRNG to a deterministic state', () => {
    const state = makeState();
    const result = reduce(state, { type: 'SEED_RNG', seed: 42 });
    expect(result.state.rng.seed).toBe(42);
    expect(result.state.rng.state).toBe(42);
  });

  it('identical seed + action sequence produces identical final state', () => {
    const seed = 12345;

    const actions: GameAction[] = [
      { type: 'SEED_RNG', seed },
      { type: 'SET_GAME_FLAGS', patch: { hp: 20, gold: 10 } },
      { type: 'DEAL_DAMAGE', damage: 5 },
      { type: 'ADD_GOLD', amount: 3 },
      { type: 'DEAL_DAMAGE', damage: 2 },
    ];

    function replay(actions: GameAction[]): GameState {
      let state = makeState();
      for (const action of actions) {
        const result = reduce(state, action);
        state = result.state;
      }
      return state;
    }

    const run1 = replay(actions);
    const run2 = replay(actions);

    expect(run1.hp).toBe(run2.hp);
    expect(run1.gold).toBe(run2.gold);
    expect(run1.rng).toEqual(run2.rng);
    expect(run1).toEqual(run2);
  });

  it('different seeds produce different RNG states after same actions', () => {
    const actions1: GameAction[] = [{ type: 'SEED_RNG', seed: 111 }];
    const actions2: GameAction[] = [{ type: 'SEED_RNG', seed: 222 }];

    let s1 = makeState();
    for (const a of actions1) s1 = reduce(s1, a).state;

    let s2 = makeState();
    for (const a of actions2) s2 = reduce(s2, a).state;

    expect(s1.rng.seed).not.toBe(s2.rng.seed);
    expect(s1.rng.state).not.toBe(s2.rng.state);
  });

  it('DRAW_CARDS with seeded RNG is deterministic', () => {
    const backpack = [
      { id: 'c1', name: 'Card 1', type: 'monster' as const, value: 3, attack: 3, hp: 3 },
      { id: 'c2', name: 'Card 2', type: 'monster' as const, value: 4, attack: 4, hp: 4 },
      { id: 'c3', name: 'Card 3', type: 'monster' as const, value: 5, attack: 5, hp: 5 },
    ];

    function run(seed: number) {
      let state = makeState({
        rng: createRng(seed),
        backpackItems: [...backpack],
        handCards: [],
      });
      const result = reduce(state, { type: 'DRAW_CARDS', count: 1 });
      return result.state;
    }

    const r1 = run(42);
    const r2 = run(42);
    expect(r1.handCards.map(c => c.id)).toEqual(r2.handCards.map(c => c.id));
    expect(r1.rng).toEqual(r2.rng);
  });

  it('OPEN_SHOP with seeded RNG produces deterministic offerings', () => {
    const classDeck = Array.from({ length: 10 }, (_, i) => ({
      id: `cls-${i}`,
      name: `Class Card ${i}`,
      type: 'monster' as const,
      value: 3 + i,
      attack: 3 + i,
      hp: 3 + i,
    }));

    function run(seed: number) {
      let state = makeState({
        rng: createRng(seed),
        classDeck,
        shopLevel: 1,
      });
      return reduce(state, { type: 'OPEN_SHOP' }).state;
    }

    const r1 = run(99);
    const r2 = run(99);
    expect(r1.shopOfferings.map(o => o.card.id)).toEqual(r2.shopOfferings.map(o => o.card.id));
    expect(r1.rng).toEqual(r2.rng);
  });
});
