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
import { buildSharedDeck } from '@/lib/multiplayerSharedDeck';

function makeStateWithSeed(seed: number): GameState {
  return { ...createInitialGameState(), rng: createRng(seed) };
}

describe('INIT_GAME preview row composition', () => {
  it('preview row has at most 2 monsters across many seeds', () => {
    const violations: Array<{ seed: number; count: number; names: string[] }> = [];
    for (let seed = 1; seed <= 200; seed++) {
      const state = makeStateWithSeed(seed);
      const result = reduce(state, {
        type: 'INIT_GAME',
        mode: 'single',
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

  it('active row has at most 2 monsters across many seeds', () => {
    const violations: Array<{ seed: number; count: number }> = [];
    for (let seed = 1; seed <= 200; seed++) {
      const state = makeStateWithSeed(seed);
      const result = reduce(state, {
        type: 'INIT_GAME',
        mode: 'single',
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
   * Monster-layout invariants (single & multiplayer share these rules):
   *   • Every non-overlapping 4-card chunk holds at most 1 monster.
   *   • The first 16 cards contain no elite monsters.
   *   • The back 18 cards contain at least 1 monster (the leftover).
   * The full deck-of-record is `[previewCards, activeCards, ...remainingDeck]`
   * because INIT_GAME has already dealt the first two rows from the head.
   */
  it('each 4-card chunk has at most 1 monster', () => {
    const violations: Array<{ seed: number; chunkIdx: number; count: number }> = [];
    for (let seed = 1; seed <= 200; seed++) {
      const state = makeStateWithSeed(seed);
      const result = reduce(state, {
        type: 'INIT_GAME',
        mode: 'single',
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

  it('first 16 cards contain no elite monsters (Wraith is the explicit exception)', () => {
    // Elite Wraith is allowed in [0,16) — the Wraith-pull step in
    // `rules/init.ts` deliberately overrides the elite-push rule for Wraith
    // so the player encounters Wraith early enough for the 幽魂净化 clearance
    // loop to engage. All other elite monster types must still be pushed
    // back.
    const violations: Array<{ seed: number; pos: number; name: string }> = [];
    for (let seed = 1; seed <= 200; seed++) {
      const state = makeStateWithSeed(seed);
      const result = reduce(state, {
        type: 'INIT_GAME',
        mode: 'single',
        totalWins: 0,
        eternalRelics: [],
      });
      const fullDeck = [
        ...result.state.previewCards,
        ...result.state.activeCards,
        ...result.state.remainingDeck,
      ];
      for (let i = 0; i < Math.min(16, fullDeck.length); i++) {
        const card = fullDeck[i];
        if (card?.monsterSpecial && card.monsterType !== 'Wraith') {
          violations.push({ seed, pos: i, name: card.name });
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('all Wraiths land in deck positions 9..16 of deckWithClassEvents (= indices [8, 16) = remainingDeck[4..12))', () => {
    // `deckWithClassEvents[8..16)` in init.ts coordinates corresponds to the
    // procedural-dungeon flat sequence remainingDeck[4..12) — the active row
    // is the fixed Buglet+Events tutorial row and is NOT part of
    // deckWithClassEvents, and the previewCards (chunk 0) sit at indices
    // 0..3. Both non-elite and elite Wraiths must land in indices 8..15
    // (inclusive) = positions 9..16 (1-indexed inclusive).
    const violations: Array<{
      seed: number;
      pos: number;
      name: string;
      special: boolean;
    }> = [];
    let runsWithAnyWraith = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const state = makeStateWithSeed(seed);
      const result = reduce(state, {
        type: 'INIT_GAME',
        mode: 'single',
        totalWins: 0,
        eternalRelics: [],
      });
      // Reconstruct deckWithClassEvents = preview + remainingDeck.
      const deckWithClassEvents = [
        ...result.state.previewCards,
        ...result.state.remainingDeck,
      ];
      let foundWraithInRun = false;
      for (let i = 0; i < deckWithClassEvents.length; i++) {
        const c = deckWithClassEvents[i];
        if (c?.type === 'monster' && c.monsterType === 'Wraith') {
          foundWraithInRun = true;
          if (i < 8 || i >= 16) {
            violations.push({
              seed,
              pos: i,
              name: c.name,
              special: !!c.monsterSpecial,
            });
          }
        }
      }
      if (foundWraithInRun) runsWithAnyWraith++;
    }
    expect(violations).toEqual([]);
    // Sanity: across 200 seeds with 6-of-7 monster types chosen per run,
    // ~6/7 ≈ 86% of runs should contain at least one Wraith. If we suddenly
    // had zero wraith-bearing runs, the invariant would be vacuously
    // satisfied and the test useless — so guard against that.
    expect(runsWithAnyWraith).toBeGreaterThan(100);
  });

  it('multiplayer shared deck mirrors the Wraith-pull invariant', () => {
    // The multiplayer shared-deck builder uses an independent verbatim port
    // of the layout block, so we need a separate assertion to keep both
    // paths in sync. Same coordinate system: the full shared deck is the
    // analogue of `deckWithClassEvents`, so all Wraiths must land in [8, 16).
    const violations: Array<{
      seed: number;
      pos: number;
      name: string;
      special: boolean;
    }> = [];
    let runsWithAnyWraith = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { deck } = buildSharedDeck(seed);
      let foundWraithInRun = false;
      for (let i = 0; i < deck.length; i++) {
        const c = deck[i];
        if (c?.type === 'monster' && c.monsterType === 'Wraith') {
          foundWraithInRun = true;
          if (i < 8 || i >= 16) {
            violations.push({
              seed,
              pos: i,
              name: c.name,
              special: !!c.monsterSpecial,
            });
          }
        }
      }
      if (foundWraithInRun) runsWithAnyWraith++;
    }
    expect(violations).toEqual([]);
    expect(runsWithAnyWraith).toBeGreaterThan(100);
  });

  it('back 18 cards contain at least 1 monster when total monsters > chunk count', () => {
    const violations: Array<{ seed: number; deckLen: number; monsterTotal: number }> = [];
    for (let seed = 1; seed <= 200; seed++) {
      const state = makeStateWithSeed(seed);
      const result = reduce(state, {
        type: 'INIT_GAME',
        mode: 'single',
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
