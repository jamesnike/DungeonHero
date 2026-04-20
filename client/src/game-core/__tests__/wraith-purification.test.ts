/**
 * Tests for the 永恒护符·幽魂净化 (wraith-purification) flow:
 *  1. `CHECK_WRAITH_PURIFICATION` only grants the relic when zero live wraiths
 *     remain across active row, preview row, and the remaining deck — and is
 *     idempotent once granted.
 *  2. `MONSTER_DEFEATED` enqueues `CHECK_WRAITH_PURIFICATION` after a wraith
 *     dies (and not for non-wraith kills).
 *  3. `END_TURN` flushes the permanent magic recycle bag back into the backpack
 *     when (and only when) the relic is held, respecting backpack capacity.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
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
  it('flushes all recycle-bag cards back to the backpack', () => {
    const recycleCards = [
      makeRecycleCard('r1', '魔弹'),
      makeRecycleCard('r2', '烈焰术'),
      makeRecycleCard('r3', '冰刺', { _recycleWaits: 2 }),
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

    expect(result.state.permanentMagicRecycleBag).toHaveLength(0);
    expect(result.state.backpackItems).toHaveLength(3);
    const restored = result.state.backpackItems as any[];
    // Internal `_recycleWaits` bookkeeping must be stripped on restore.
    expect(restored.every(c => c._recycleWaits === undefined)).toBe(true);
    expect(restored.map(c => c.id).sort()).toEqual(['r1', 'r2', 'r3']);
    expect(
      result.sideEffects.some(
        e => e.event === 'ui:banner' && /幽魂净化/.test((e.payload as { text: string }).text),
      ),
    ).toBe(true);
  });

  it('does NOT flush the recycle bag when relic is not held', () => {
    const recycleCards = [makeRecycleCard('r1', '魔弹')];
    const state = makeState({
      eternalRelics: [],
      permanentMagicRecycleBag: recycleCards as any,
      backpackItems: [],
      activeCards: [null, null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero' },
    });

    const result = reduce(state, { type: 'END_TURN', heroTurnLayerLossIds: [] });

    expect(result.state.permanentMagicRecycleBag).toHaveLength(1);
    expect(result.state.backpackItems).toHaveLength(0);
  });

  it('keeps overflow in the recycle bag when backpack is at capacity', () => {
    const cap = BASE_BACKPACK_CAPACITY;
    // Fill backpack to capacity exactly.
    const fullBackpack = Array.from({ length: cap }, (_, i) =>
      makeRecycleCard(`bp${i}`, `Item ${i}`),
    );
    const recycleCards = [
      makeRecycleCard('r1', '魔弹'),
      makeRecycleCard('r2', '烈焰术'),
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

    expect(result.state.backpackItems).toHaveLength(cap);
    expect(result.state.permanentMagicRecycleBag).toHaveLength(2);
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
});
