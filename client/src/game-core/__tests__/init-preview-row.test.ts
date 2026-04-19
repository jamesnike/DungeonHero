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

  /**
   * Quick-mode monster layout invariants:
   *   • Every non-overlapping 4-card chunk holds at most 1 monster.
   *   • The first 12 cards contain no elite monsters.
   *   • The back 18 cards contain at least 1 monster (the leftover).
   * The full deck-of-record is `[previewCards, activeCards, ...remainingDeck]`
   * because INIT_GAME has already dealt the first two rows from the head.
   */
  it('quick mode: each 4-card chunk has at most 1 monster', () => {
    const violations: Array<{ seed: number; chunkIdx: number; count: number }> = [];
    for (let seed = 1; seed <= 200; seed++) {
      const state = makeStateWithSeed(seed);
      const result = reduce(state, {
        type: 'INIT_GAME',
        mode: 'quick',
        totalWins: 0,
        eternalRelics: [],
      });
      const fullDeck = [
        ...result.state.previewCards,
        ...result.state.activeCards,
        ...result.state.remainingDeck,
      ];
      const numChunks = Math.floor(fullDeck.length / 4);
      for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
        const start = chunkIdx * 4;
        let monsterCount = 0;
        for (let i = start; i < start + 4; i++) {
          if (fullDeck[i]?.type === 'monster') monsterCount++;
        }
        if (monsterCount > 1) {
          // The leftover monster intentionally lands in one chunk that is
          // fully inside the back-18 region (snapped to the next chunk
          // boundary); that single chunk may have 2 monsters.
          const rawBack18Start = Math.max(0, fullDeck.length - 18);
          const back18ChunkStart = Math.max(rawBack18Start, Math.ceil(rawBack18Start / 4) * 4);
          const isBack18 = start >= back18ChunkStart;
          if (!isBack18 || monsterCount > 2) {
            violations.push({ seed, chunkIdx, count: monsterCount });
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('quick mode: first 12 cards contain no elite monsters', () => {
    const violations: Array<{ seed: number; pos: number; name: string }> = [];
    for (let seed = 1; seed <= 200; seed++) {
      const state = makeStateWithSeed(seed);
      const result = reduce(state, {
        type: 'INIT_GAME',
        mode: 'quick',
        totalWins: 0,
        eternalRelics: [],
      });
      const fullDeck = [
        ...result.state.previewCards,
        ...result.state.activeCards,
        ...result.state.remainingDeck,
      ];
      for (let i = 0; i < Math.min(12, fullDeck.length); i++) {
        if (fullDeck[i]?.monsterSpecial) {
          violations.push({ seed, pos: i, name: fullDeck[i]!.name });
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('quick mode: back 18 cards contain at least 1 monster when total monsters > chunk count', () => {
    const violations: Array<{ seed: number; deckLen: number; monsterTotal: number }> = [];
    for (let seed = 1; seed <= 200; seed++) {
      const state = makeStateWithSeed(seed);
      const result = reduce(state, {
        type: 'INIT_GAME',
        mode: 'quick',
        totalWins: 0,
        eternalRelics: [],
      });
      const fullDeck = [
        ...result.state.previewCards,
        ...result.state.activeCards,
        ...result.state.remainingDeck,
      ];
      const monsterTotal = fullDeck.filter(c => c?.type === 'monster').length;
      const numChunks = Math.floor(fullDeck.length / 4);
      // Only a meaningful invariant when there's a leftover monster.
      if (monsterTotal <= numChunks) continue;
      const back18Start = Math.max(0, fullDeck.length - 18);
      const back18Monsters = fullDeck
        .slice(back18Start)
        .filter(c => c?.type === 'monster').length;
      if (back18Monsters < 1) {
        violations.push({ seed, deckLen: fullDeck.length, monsterTotal });
      }
    }
    expect(violations).toEqual([]);
  });
});
