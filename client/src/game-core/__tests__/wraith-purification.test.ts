/**
 * Tests for the 永恒护符·幽魂净化 (wraith-purification) flow:
 *  1. `CHECK_WRAITH_PURIFICATION` only grants the relic when zero live wraiths
 *     remain across active row, preview row, and the remaining deck — and is
 *     idempotent once granted.
 *  2. `MONSTER_DEFEATED` enqueues `CHECK_WRAITH_PURIFICATION` after a wraith
 *     dies (and not for non-wraith kills).
 *  3. `END_TURN` decrements `_recycleWaits` on a random floor(N/2)-sized
 *     subset of the recycle bag when (and only when) the relic is held.
 *     Cards whose counter hits 0 are immediately restored to the backpack
 *     (subject to capacity + 「置顶」prepend rules).
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import type { GameState } from '../types';
import { initialCombatState, BASE_BACKPACK_CAPACITY } from '../constants';
import { getEternalRelic, hasEternalRelic } from '@/lib/eternalRelics';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeWraith(overrides: Record<string, unknown> = {}) {
  return {
    id: 'w1',
    type: 'monster' as const,
    name: 'Wraith',
    value: 5,
    hp: 0,
    maxHp: 10,
    attack: 5,
    monsterType: 'Wraith',
    currentLayer: 0,
    fury: 1,
    hpLayers: 1,
    ...overrides,
  };
}

function makeNonWraith(overrides: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    type: 'monster' as const,
    name: 'Goblin',
    value: 5,
    hp: 0,
    maxHp: 10,
    attack: 5,
    monsterType: 'Goblin',
    currentLayer: 0,
    fury: 1,
    hpLayers: 1,
    ...overrides,
  };
}

function makeRecycleCard(id: string, name: string, extras: Record<string, unknown> = {}) {
  return {
    id,
    type: 'magic' as const,
    name,
    value: 0,
    ...extras,
  };
}

// ---------------------------------------------------------------------------
// CHECK_WRAITH_PURIFICATION
// ---------------------------------------------------------------------------

describe('CHECK_WRAITH_PURIFICATION', () => {
  it('grants the wraith-purification relic when no wraiths remain anywhere', () => {
    const state = makeState({
      activeCards: [null, null, null, null, null] as any,
      previewCards: [null, null, null, null, null] as any,
      remainingDeck: [],
      eternalRelics: [],
    });

    const result = reduce(state, { type: 'CHECK_WRAITH_PURIFICATION' });

    expect(hasEternalRelic(result.state.eternalRelics ?? [], 'wraith-purification')).toBe(true);
    expect(result.state.wraithPassiveEnabled).toBe(true);
    expect(result.sideEffects.some(e => e.event === 'combat:wraithPurified')).toBe(true);
    expect(result.sideEffects.some(e => e.event === 'ui:banner')).toBe(true);
  });

  it('does not grant when a live wraith is still in the active row', () => {
    const slots = Array.from({ length: 5 }, () => null) as any;
    slots[0] = makeWraith({ id: 'w-active', defeatProcessed: false });
    const state = makeState({
      activeCards: slots,
      previewCards: [null, null, null, null, null] as any,
      remainingDeck: [],
    });

    const result = reduce(state, { type: 'CHECK_WRAITH_PURIFICATION' });

    expect(result.state).toBe(state);
    expect(hasEternalRelic(result.state.eternalRelics ?? [], 'wraith-purification')).toBe(false);
  });

  it('treats a defeatProcessed wraith as gone and grants the relic', () => {
    // The killed wraith is still sitting in `activeCards` (mid-removal) but
    // marked `defeatProcessed`. Purification must fire immediately, not on the
    // next defeat.
    const slots = Array.from({ length: 5 }, () => null) as any;
    slots[0] = makeWraith({ id: 'w-dying', defeatProcessed: true });
    const state = makeState({
      activeCards: slots,
      previewCards: [null, null, null, null, null] as any,
      remainingDeck: [],
    });

    const result = reduce(state, { type: 'CHECK_WRAITH_PURIFICATION' });

    expect(hasEternalRelic(result.state.eternalRelics ?? [], 'wraith-purification')).toBe(true);
    expect(result.sideEffects.some(e => e.event === 'combat:wraithPurified')).toBe(true);
  });

  it('does not grant when a wraith is still in the preview row', () => {
    const preview = Array.from({ length: 5 }, () => null) as any;
    preview[2] = makeWraith({ id: 'w-preview' });
    const state = makeState({
      activeCards: [null, null, null, null, null] as any,
      previewCards: preview,
      remainingDeck: [],
    });

    const result = reduce(state, { type: 'CHECK_WRAITH_PURIFICATION' });

    expect(result.state).toBe(state);
  });

  it('does not grant when a wraith is still in the remaining deck', () => {
    const state = makeState({
      activeCards: [null, null, null, null, null] as any,
      previewCards: [null, null, null, null, null] as any,
      remainingDeck: [makeWraith({ id: 'w-deck' })] as any,
    });

    const result = reduce(state, { type: 'CHECK_WRAITH_PURIFICATION' });

    expect(result.state).toBe(state);
  });

  it('is idempotent — does nothing if relic is already granted', () => {
    const state = makeState({
      activeCards: [null, null, null, null, null] as any,
      previewCards: [null, null, null, null, null] as any,
      remainingDeck: [],
      eternalRelics: [getEternalRelic('wraith-purification')],
    });

    const result = reduce(state, { type: 'CHECK_WRAITH_PURIFICATION' });

    expect(result.state).toBe(state);
    expect(result.sideEffects).toEqual([]);
    expect((result.state.eternalRelics ?? []).filter(r => r.id === 'wraith-purification')).toHaveLength(1);
  });

  it('ignores non-wraith monsters when scanning live cards', () => {
    const slots = Array.from({ length: 5 }, () => null) as any;
    slots[0] = makeNonWraith({ id: 'g-active' });
    const state = makeState({
      activeCards: slots,
      previewCards: [null, null, null, null, null] as any,
      remainingDeck: [],
    });

    const result = reduce(state, { type: 'CHECK_WRAITH_PURIFICATION' });

    expect(hasEternalRelic(result.state.eternalRelics ?? [], 'wraith-purification')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MONSTER_DEFEATED → enqueue CHECK_WRAITH_PURIFICATION
// ---------------------------------------------------------------------------

describe('MONSTER_DEFEATED → CHECK_WRAITH_PURIFICATION enqueue', () => {
  it('enqueues CHECK_WRAITH_PURIFICATION when a wraith is killed', () => {
    const wraith = makeWraith({ id: 'w1' });
    const slots = Array.from({ length: 5 }, () => null) as any;
    slots[0] = wraith;
    const state = makeState({
      activeCards: slots,
      combatState: { ...initialCombatState, engagedMonsterIds: ['w1'] },
    });

    const result = reduce(state, { type: 'MONSTER_DEFEATED', monsterId: 'w1' });

    expect(result.enqueuedActions.some(a => a.type === 'CHECK_WRAITH_PURIFICATION')).toBe(true);
  });

  it('does not enqueue CHECK_WRAITH_PURIFICATION for non-wraith kills', () => {
    const goblin = makeNonWraith({ id: 'g1' });
    const slots = Array.from({ length: 5 }, () => null) as any;
    slots[0] = goblin;
    const state = makeState({
      activeCards: slots,
      combatState: { ...initialCombatState, engagedMonsterIds: ['g1'] },
    });

    const result = reduce(state, { type: 'MONSTER_DEFEATED', monsterId: 'g1' });

    expect(result.enqueuedActions.some(a => a.type === 'CHECK_WRAITH_PURIFICATION')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// END_TURN — wraith-purification recycle-bag flush
// ---------------------------------------------------------------------------

describe('END_TURN with wraith-purification relic', () => {
  it('decrements _recycleWaits on floor(N/2) random cards; ready ones (waits=1 → 0) restore to backpack', () => {
    // 4 cards in the bag, all with _recycleWaits=1. floor(4/2) = 2 selected,
    // each goes 1 → 0 → ready → restored to backpack. The other 2 stay in the
    // bag with _recycleWaits=1 untouched.
    const recycleCards = [
      makeRecycleCard('r1', '魔弹', { _recycleWaits: 1 }),
      makeRecycleCard('r2', '烈焰术', { _recycleWaits: 1 }),
      makeRecycleCard('r3', '冰刺', { _recycleWaits: 1 }),
      makeRecycleCard('r4', '雷霆', { _recycleWaits: 1 }),
    ];
    const state = makeState({
      eternalRelics: [getEternalRelic('wraith-purification')],
      permanentMagicRecycleBag: recycleCards as any,
      backpackItems: [],
      backpackCapacityModifier: 0,
      activeCards: [null, null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero' },
    });

    const result = reduce(state, { type: 'END_TURN', heroTurnLayerLossIds: [] });

    // 2 selected → ready → in backpack; 2 untouched → still in bag.
    expect(result.state.backpackItems).toHaveLength(2);
    expect(result.state.permanentMagicRecycleBag).toHaveLength(2);
    // Restored cards: _recycleWaits stripped.
    expect((result.state.backpackItems as any[]).every(c => c._recycleWaits === undefined)).toBe(true);
    // Bag survivors: _recycleWaits=1 unchanged (because they were untouched, not -1'd).
    expect((result.state.permanentMagicRecycleBag as any[]).every(c => c._recycleWaits === 1)).toBe(true);
    // Banner mentions both counts.
    expect(
      result.sideEffects.some(
        e =>
          e.event === 'ui:banner' &&
          /幽魂净化.*2 张瀑流计时 -1.*2 张洗回背包/.test((e.payload as { text: string }).text),
      ),
    ).toBe(true);
  });

  it('decrements selected cards from waits=2 to waits=1 (no restore yet) when none reach 0', () => {
    // All 4 cards at waits=2 → selected 2 go to waits=1 (still in bag, not ready).
    const recycleCards = [
      makeRecycleCard('r1', '魔弹', { _recycleWaits: 2 }),
      makeRecycleCard('r2', '烈焰术', { _recycleWaits: 2 }),
      makeRecycleCard('r3', '冰刺', { _recycleWaits: 2 }),
      makeRecycleCard('r4', '雷霆', { _recycleWaits: 2 }),
    ];
    const state = makeState({
      eternalRelics: [getEternalRelic('wraith-purification')],
      permanentMagicRecycleBag: recycleCards as any,
      backpackItems: [],
      backpackCapacityModifier: 0,
      activeCards: [null, null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero' },
    });

    const result = reduce(state, { type: 'END_TURN', heroTurnLayerLossIds: [] });

    // Nothing restored (no card hit 0); all 4 still in bag.
    expect(result.state.backpackItems).toHaveLength(0);
    expect(result.state.permanentMagicRecycleBag).toHaveLength(4);
    // Two cards at waits=1, two at waits=2.
    const waitsCounts = (result.state.permanentMagicRecycleBag as any[])
      .map(c => c._recycleWaits)
      .sort();
    expect(waitsCounts).toEqual([1, 1, 2, 2]);
    // No restore animation (waterfall:recycleRestored) because nothing moved to backpack.
    expect(
      result.sideEffects.some(e => e.event === 'waterfall:recycleRestored'),
    ).toBe(false);
    // Banner still fires (2 cards still got the -1 effect).
    expect(
      result.sideEffects.some(
        e => e.event === 'ui:banner' && /幽魂净化.*2 张牌瀑流计时 -1/.test((e.payload as { text: string }).text),
      ),
    ).toBe(true);
  });

  it('1 card in bag → floor(1/2) = 0 selected → noop, no banner, no log', () => {
    // Boundary case the user explicitly chose: literal floor, no rounding up to 1.
    const recycleCards = [makeRecycleCard('r1', '魔弹', { _recycleWaits: 1 })];
    const state = makeState({
      eternalRelics: [getEternalRelic('wraith-purification')],
      permanentMagicRecycleBag: recycleCards as any,
      backpackItems: [],
      activeCards: [null, null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero' },
    });

    const result = reduce(state, { type: 'END_TURN', heroTurnLayerLossIds: [] });

    // Bag unchanged.
    expect(result.state.permanentMagicRecycleBag).toHaveLength(1);
    expect((result.state.permanentMagicRecycleBag as any[])[0]._recycleWaits).toBe(1);
    expect(result.state.backpackItems).toHaveLength(0);
    // No purification banner / log entries fired.
    expect(
      result.sideEffects.some(
        e => e.event === 'ui:banner' && /幽魂净化/.test((e.payload as { text: string }).text),
      ),
    ).toBe(false);
  });

  it('does NOT touch the recycle bag when relic is not held', () => {
    const recycleCards = [
      makeRecycleCard('r1', '魔弹', { _recycleWaits: 1 }),
      makeRecycleCard('r2', '烈焰术', { _recycleWaits: 1 }),
    ];
    const state = makeState({
      eternalRelics: [],
      permanentMagicRecycleBag: recycleCards as any,
      backpackItems: [],
      activeCards: [null, null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero' },
    });

    const result = reduce(state, { type: 'END_TURN', heroTurnLayerLossIds: [] });

    expect(result.state.permanentMagicRecycleBag).toHaveLength(2);
    expect(result.state.backpackItems).toHaveLength(0);
    expect((result.state.permanentMagicRecycleBag as any[]).every(c => c._recycleWaits === 1)).toBe(true);
  });

  it('full backpack: ready cards stay in bag as overflow, surviving with _recycleWaits stripped', () => {
    const cap = BASE_BACKPACK_CAPACITY;
    const fullBackpack = Array.from({ length: cap }, (_, i) =>
      makeRecycleCard(`bp${i}`, `Item ${i}`),
    );
    // 4 cards all at waits=1 → 2 selected → both ready → backpack full → both overflow into bag.
    const recycleCards = [
      makeRecycleCard('r1', '魔弹', { _recycleWaits: 1 }),
      makeRecycleCard('r2', '烈焰术', { _recycleWaits: 1 }),
      makeRecycleCard('r3', '冰刺', { _recycleWaits: 1 }),
      makeRecycleCard('r4', '雷霆', { _recycleWaits: 1 }),
    ];

    const state = makeState({
      eternalRelics: [getEternalRelic('wraith-purification')],
      permanentMagicRecycleBag: recycleCards as any,
      backpackItems: fullBackpack as any,
      backpackCapacityModifier: 0,
      activeCards: [null, null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero' },
    });

    const result = reduce(state, { type: 'END_TURN', heroTurnLayerLossIds: [] });

    // Backpack stays at cap; all 4 recycle cards remain in bag (2 ready overflow + 2 untouched).
    expect(result.state.backpackItems).toHaveLength(cap);
    expect(result.state.permanentMagicRecycleBag).toHaveLength(4);
    // Overflow log fired (2 ready cards couldn't fit).
    expect(
      result.sideEffects.some(
        e =>
          e.event === 'log:entry' &&
          /幽魂净化：背包已满/.test((e.payload as { type: string; message: string }).message),
      ),
    ).toBe(true);
  });

  it('does nothing when relic is held but bag is empty', () => {
    const state = makeState({
      eternalRelics: [getEternalRelic('wraith-purification')],
      permanentMagicRecycleBag: [],
      backpackItems: [],
      activeCards: [null, null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero' },
    });

    const result = reduce(state, { type: 'END_TURN', heroTurnLayerLossIds: [] });

    expect(result.state.permanentMagicRecycleBag).toHaveLength(0);
    expect(result.state.backpackItems).toHaveLength(0);
    expect(
      result.sideEffects.some(
        e => e.event === 'ui:banner' && /幽魂净化/.test((e.payload as { text: string }).text),
      ),
    ).toBe(false);
  });

  it('preserves order of untouched cards in the bag', () => {
    // 5 cards → floor(5/2) = 2 selected for -1; 3 untouched. The 3 untouched
    // must appear in the bag in their original relative order (no shuffle).
    const recycleCards = [
      makeRecycleCard('r1', 'A', { _recycleWaits: 3 }),
      makeRecycleCard('r2', 'B', { _recycleWaits: 3 }),
      makeRecycleCard('r3', 'C', { _recycleWaits: 3 }),
      makeRecycleCard('r4', 'D', { _recycleWaits: 3 }),
      makeRecycleCard('r5', 'E', { _recycleWaits: 3 }),
    ];
    const state = makeState({
      eternalRelics: [getEternalRelic('wraith-purification')],
      permanentMagicRecycleBag: recycleCards as any,
      backpackItems: [],
      backpackCapacityModifier: 0,
      activeCards: [null, null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero' },
    });

    const result = reduce(state, { type: 'END_TURN', heroTurnLayerLossIds: [] });

    // Nothing restored (waits 3 → either 2 or unchanged 3, none ≤ 0).
    expect(result.state.backpackItems).toHaveLength(0);
    expect(result.state.permanentMagicRecycleBag).toHaveLength(5);
    // 2 cards at waits=2 (selected), 3 cards at waits=3 (untouched).
    const waits = (result.state.permanentMagicRecycleBag as any[])
      .map(c => c._recycleWaits)
      .sort();
    expect(waits).toEqual([2, 2, 3, 3, 3]);
  });

  it('respects topOnRecycleRestore: ready 「置顶」cards prepend to backpack[0]', () => {
    // 4 cards in bag, ALL topOnRecycleRestore, all waits=1. floor(4/2)=2
    // selected; both are guaranteed top-cards → 2 ready → prepend to
    // backpack[0..1]. Existing backpack ['bp1','bp2'] shifts to [2..3].
    // Making all cards top avoids the "which of N were selected" RNG
    // dependency for this assertion.
    const recycleCards = [
      makeRecycleCard('r1', '置顶A', { _recycleWaits: 1, topOnRecycleRestore: true }),
      makeRecycleCard('r2', '置顶B', { _recycleWaits: 1, topOnRecycleRestore: true }),
      makeRecycleCard('r3', '置顶C', { _recycleWaits: 1, topOnRecycleRestore: true }),
      makeRecycleCard('r4', '置顶D', { _recycleWaits: 1, topOnRecycleRestore: true }),
    ];
    const existingBackpack = [makeRecycleCard('bp1', '原有1'), makeRecycleCard('bp2', '原有2')];
    const state = makeState({
      eternalRelics: [getEternalRelic('wraith-purification')],
      permanentMagicRecycleBag: recycleCards as any,
      backpackItems: existingBackpack as any,
      backpackCapacityModifier: 0,
      activeCards: [null, null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero' },
    });

    const result = reduce(state, { type: 'END_TURN', heroTurnLayerLossIds: [] });

    // 2 selected → ready → prepend; 2 untouched → stay in bag.
    expect(result.state.backpackItems).toHaveLength(4);
    expect(result.state.permanentMagicRecycleBag).toHaveLength(2);
    // 原有 bp1 / bp2 必须被推到末尾两位。
    expect((result.state.backpackItems as any[])[2].id).toBe('bp1');
    expect((result.state.backpackItems as any[])[3].id).toBe('bp2');
    // 前两位是 restored 的置顶卡（具体顺序取决于 RNG，但都来自 r1..r4）。
    expect((result.state.backpackItems as any[])[0].id).toMatch(/^r[1-4]$/);
    expect((result.state.backpackItems as any[])[1].id).toMatch(/^r[1-4]$/);
    // restoredToBackpackTop side effect emitted (card:promotedToDeckTop).
    expect(
      result.sideEffects.some(e => e.event === 'card:promotedToDeckTop'),
    ).toBe(true);
  });

  it('uses state.rng for selection (deterministic with same seed)', () => {
    // Same setup, same seed → same selection. Verifies RNG is threaded through
    // and `patch.rng` is updated (not Math.random or anything stateless).
    const buildState = () => {
      const recycleCards = [
        makeRecycleCard('r1', 'A', { _recycleWaits: 1 }),
        makeRecycleCard('r2', 'B', { _recycleWaits: 1 }),
        makeRecycleCard('r3', 'C', { _recycleWaits: 1 }),
        makeRecycleCard('r4', 'D', { _recycleWaits: 1 }),
      ];
      return makeState({
        rng: createRng(42),
        eternalRelics: [getEternalRelic('wraith-purification')],
        permanentMagicRecycleBag: recycleCards as any,
        backpackItems: [],
        backpackCapacityModifier: 0,
        activeCards: [null, null, null, null, null] as any,
        combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero' },
      });
    };

    const r1 = reduce(buildState(), { type: 'END_TURN', heroTurnLayerLossIds: [] });
    const r2 = reduce(buildState(), { type: 'END_TURN', heroTurnLayerLossIds: [] });

    // Same seed → identical selection result.
    expect((r1.state.backpackItems as any[]).map(c => c.id).sort()).toEqual(
      (r2.state.backpackItems as any[]).map(c => c.id).sort(),
    );
    // RNG must advance (not equal to seed-init state).
    expect(r1.state.rng).not.toEqual(buildState().rng);
  });
});

// ---------------------------------------------------------------------------
// INIT_GAME — auto-grant wraith-purification when the deck contains no Wraith
// ---------------------------------------------------------------------------

describe('INIT_GAME → auto-grant wraith-purification when no Wraith in deck', () => {
  function makeStateWithSeed(seed: number): GameState {
    return { ...createInitialGameState(), rng: createRng(seed) };
  }

  function deckHasWraith(s: GameState): boolean {
    const all = [...s.previewCards, ...s.activeCards, ...s.remainingDeck];
    return all.some(
      c => !!c && c.type === 'monster' && c.monsterType === 'Wraith',
    );
  }

  it('relic-presence and wraithPassiveEnabled exactly mirror "deck has no Wraith" across many seeds', () => {
    const mismatches: Array<{
      seed: number;
      deckHasWraith: boolean;
      hasRelic: boolean;
      passiveFlag: boolean;
    }> = [];

    for (let seed = 1; seed <= 200; seed++) {
      const state = makeStateWithSeed(seed);
      const result = reduce(state, {
        type: 'INIT_GAME',
        mode: 'single',
        totalWins: 0,
        eternalRelics: [],
      });
      const wraithInDeck = deckHasWraith(result.state);
      const hasRelic = hasEternalRelic(
        result.state.eternalRelics ?? [],
        'wraith-purification',
      );
      const passiveFlag = result.state.wraithPassiveEnabled === true;

      const expectedGrant = !wraithInDeck;
      if (hasRelic !== expectedGrant || passiveFlag !== expectedGrant) {
        mismatches.push({
          seed,
          deckHasWraith: wraithInDeck,
          hasRelic,
          passiveFlag,
        });
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('does not duplicate the relic if the caller-supplied eternalRelics already contains it', () => {
    // Find a seed whose generated deck contains no Wraith so the grant path
    // would normally fire. The first 5 seeds are virtually guaranteed to
    // include at least one wraith-less run (6 monster types chosen from 7).
    let noWraithSeed = -1;
    for (let seed = 1; seed <= 50; seed++) {
      const state = makeStateWithSeed(seed);
      const result = reduce(state, {
        type: 'INIT_GAME',
        mode: 'single',
        totalWins: 0,
        eternalRelics: [],
      });
      if (!deckHasWraith(result.state)) {
        noWraithSeed = seed;
        break;
      }
    }
    expect(noWraithSeed).toBeGreaterThan(0);

    const state = makeStateWithSeed(noWraithSeed);
    const result = reduce(state, {
      type: 'INIT_GAME',
      mode: 'single',
      totalWins: 0,
      // Caller already supplies wraith-purification (e.g. resume from save) —
      // the init path must not double-add.
      eternalRelics: [getEternalRelic('wraith-purification')],
    });

    const wraithRelics = (result.state.eternalRelics ?? []).filter(
      r => r.id === 'wraith-purification',
    );
    expect(wraithRelics).toHaveLength(1);
    expect(result.state.wraithPassiveEnabled).toBe(true);
  });

  it('does not emit the celebration popup side effect at game start', () => {
    // Even on a wraith-less seed, INIT_GAME should not fire `combat:wraithPurified`
    // (that event triggers the "永恒护符·幽魂净化已解锁！" popup designed for the
    // mid-game grant after killing the last wraith).
    for (let seed = 1; seed <= 50; seed++) {
      const state = makeStateWithSeed(seed);
      const result = reduce(state, {
        type: 'INIT_GAME',
        mode: 'single',
        totalWins: 0,
        eternalRelics: [],
      });
      expect(
        result.sideEffects.some(e => e.event === 'combat:wraithPurified'),
      ).toBe(false);
    }
  });
});
