/**
 * INIT_GAME preview row monster cap tests.
 *
 * Verifies that the preview row never starts with more than 2 monsters,
 * regardless of RNG seed. (Bug report: occasionally see 3 monsters in
 * preview row at the very first turn.)
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import type { GameState } from '../types';

function makeStateWithSeed(seed: number): GameState {
  return { ...createInitialGameState(), rng: createRng(seed) };
}

describe('INIT_GAME preview row composition', () => {
  it('preview row has at most 2 monsters across many seeds (normal mode)', () => {
    const violations: Array<{ seed: number; count: number; names: string[] }> = [];
    for (let seed = 1; seed <= 200; seed++) {
      const state = makeStateWithSeed(seed);
      const result = reduce(state, {
        type: 'INIT_GAME',
        mode: 'normal',
        totalWins: 0,
        eternalRelics: [],
      });
      const previewMonsters = result.state.previewCards.filter(
        c => c?.type === 'monster',
      );
      if (previewMonsters.length > 2) {
        violations.push({
          seed,
          count: previewMonsters.length,
          names: previewMonsters.map(m => m!.name),
        });
      }
    }
    expect(violations).toEqual([]);
  });

  it('preview row has at most 2 monsters across many seeds (quick mode)', () => {
    const violations: Array<{ seed: number; count: number; names: string[] }> = [];
    for (let seed = 1; seed <= 200; seed++) {
      const state = makeStateWithSeed(seed);
      const result = reduce(state, {
        type: 'INIT_GAME',
        mode: 'quick',
        totalWins: 0,
        eternalRelics: [],
      });
      const previewMonsters = result.state.previewCards.filter(
        c => c?.type === 'monster',
      );
      if (previewMonsters.length > 2) {
        violations.push({
          seed,
          count: previewMonsters.length,
          names: previewMonsters.map(m => m!.name),
        });
      }
    }
    expect(violations).toEqual([]);
  });

  it('active row has at most 2 monsters across many seeds (normal mode)', () => {
    const violations: Array<{ seed: number; count: number }> = [];
    for (let seed = 1; seed <= 200; seed++) {
      const state = makeStateWithSeed(seed);
      const result = reduce(state, {
        type: 'INIT_GAME',
        mode: 'normal',
        totalWins: 0,
        eternalRelics: [],
      });
      const activeMonsters = result.state.activeCards.filter(
        c => c?.type === 'monster',
      );
      if (activeMonsters.length > 2) {
        violations.push({ seed, count: activeMonsters.length });
      }
    }
    expect(violations).toEqual([]);
  });
});
