/**
 * INIT_GAME bakes the chosen final monster as Boss.
 *
 * Verifies the post-`bakeFinalBoss` invariant: the last monster in the deck
 * (the "最终之敌") is born as a Boss directly at deck-init time, carrying
 * `bossPhase: true` + `isFinalMonster: true` + `bossEnrageGraveyardSummon: 4`
 * + `hasRevive: true, reviveUsed: false` + `(Boss)` name suffix.
 *
 * The transform-on-defeat path that used to apply these on the first
 * `MONSTER_DEFEATED` is gone; the chosen monster ships pre-baked.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';

function makeStateWithSeed(seed: number): GameState {
  return { ...createInitialGameState(), rng: createRng(seed) };
}

function findFinalMonster(state: GameState): GameCardData | null {
  const all: Array<GameCardData | null> = [
    ...state.previewCards,
    ...state.activeCards,
    ...state.remainingDeck,
  ];
  return all.find((c): c is GameCardData => Boolean(c?.isFinalMonster)) ?? null;
}

describe('INIT_GAME bakes final monster as Boss', () => {
  it.each(['normal', 'quick'] as const)(
    '%s mode: final monster carries Boss properties from start (across many seeds)',
    (mode) => {
      const violations: Array<{ seed: number; reason: string }> = [];
      for (let seed = 1; seed <= 50; seed++) {
        const state = makeStateWithSeed(seed);
        const result = reduce(state, {
          type: 'INIT_GAME',
          mode,
          totalWins: 0,
          eternalRelics: [],
        });
        const final = findFinalMonster(result.state);
        if (!final) {
          violations.push({ seed, reason: 'no final monster found' });
          continue;
        }
        if (final.type !== 'monster') {
          violations.push({ seed, reason: `final.type=${final.type}` });
        }
        if (final.bossPhase !== true) {
          violations.push({ seed, reason: 'bossPhase !== true' });
        }
        if (final.isFinalMonster !== true) {
          violations.push({ seed, reason: 'isFinalMonster !== true' });
        }
        if (final.bossEnrageGraveyardSummon !== 4) {
          violations.push({ seed, reason: `bossEnrageGraveyardSummon=${final.bossEnrageGraveyardSummon}` });
        }
        if (final.hasRevive !== true) {
          violations.push({ seed, reason: 'hasRevive !== true' });
        }
        if (final.reviveUsed !== false) {
          violations.push({ seed, reason: `reviveUsed=${final.reviveUsed}` });
        }
        if (!final.name.endsWith('(Boss)')) {
          violations.push({ seed, reason: `name="${final.name}" missing (Boss) suffix` });
        }
      }
      expect(violations).toEqual([]);
    },
  );

  it('exactly one card is the final-monster Boss', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = makeStateWithSeed(seed);
      const result = reduce(state, {
        type: 'INIT_GAME',
        mode: 'normal',
        totalWins: 0,
        eternalRelics: [],
      });
      const all: Array<GameCardData | null> = [
        ...result.state.previewCards,
        ...result.state.activeCards,
        ...result.state.remainingDeck,
      ];
      const finalMonsters = all.filter((c): c is GameCardData => Boolean(c?.isFinalMonster));
      expect(finalMonsters.length, `seed=${seed}`).toBe(1);
      expect(finalMonsters[0].bossPhase, `seed=${seed}`).toBe(true);
    }
  });
});
