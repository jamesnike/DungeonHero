/**
 * Multiplayer init: starting backpack contract.
 *
 * Verifies that 双人模式 starts with an extra `维度扭曲` (dimensionWarp)
 * permanent magic in the backpack, on top of the apprentice bolt that
 * single-player also gets. Single-player MUST NOT get the warp card.
 *
 * Card definition lives in `createStarterCardPool` (single source of truth);
 * the MP init reducer extracts it by id and clones into `backpackItems`.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { STARTER_CARD_IDS } from '../deck';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function buildSharedDeckOf(n: number): GameCardData[] {
  const out: GameCardData[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `shared-${i}`,
      type: 'magic',
      name: `Shared-${i}`,
      value: 0,
    } as GameCardData);
  }
  return out;
}

describe('Multiplayer init: starting backpack', () => {
  it('MP init backpack contains 学徒法弹 + 维度扭曲', () => {
    const sharedDeck = buildSharedDeckOf(36);
    const state = reduce(createInitialGameState(), {
      type: 'INIT_MULTIPLAYER_GAME',
      sharedDeck,
      role: 'A',
      roomId: 'room-test',
      peerId: 'peer-B',
      totalWins: 0,
      eternalRelics: [],
    }).state;

    const ids = state.backpackItems.map(c => c.id);
    expect(ids).toContain(STARTER_CARD_IDS.apprenticeBolt);
    expect(ids).toContain(STARTER_CARD_IDS.dimensionWarp);
  });

  it('MP init backpack: 维度扭曲 carries the canonical permanent-magic shape', () => {
    const sharedDeck = buildSharedDeckOf(36);
    const state = reduce(createInitialGameState(), {
      type: 'INIT_MULTIPLAYER_GAME',
      sharedDeck,
      role: 'B',
      roomId: 'room-test',
      peerId: 'peer-A',
      totalWins: 0,
      eternalRelics: [],
    }).state;

    const warp = state.backpackItems.find(c => c.id === STARTER_CARD_IDS.dimensionWarp);
    expect(warp).toBeDefined();
    expect(warp!.type).toBe('magic');
    expect(warp!.name).toBe('维度扭曲');
    expect(warp!.magicType).toBe('permanent');
    expect(warp!.recycleDelay).toBe(2);
  });

  it('SP init backpack: NO 维度扭曲 (single-player unchanged)', () => {
    const state = reduce(createInitialGameState(), {
      type: 'INIT_GAME',
      mode: 'single',
      totalWins: 0,
      eternalRelics: [],
    }).state;

    const ids = state.backpackItems.map(c => c.id);
    expect(ids).toContain(STARTER_CARD_IDS.apprenticeBolt);
    expect(ids).not.toContain(STARTER_CARD_IDS.dimensionWarp);
  });
});
