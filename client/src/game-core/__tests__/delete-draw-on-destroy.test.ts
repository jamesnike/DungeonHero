/**
 * 招灵书印 (`amuletEffect: 'delete-draw'`) — destruction-trigger coverage.
 *
 * Effect (current):
 *   For every card the trigger fires on, both equipment slots gain
 *   `+1 temp attack`, `+1 temp armor`, and the player gains `+2 gold`.
 *   Stacks linearly with M 招灵书印 equipped, every fire is `× M`.
 *
 * Contract:
 *   - totalProcs = N × M
 *     N = non-self destroyed cards (excludes 招灵书印 itself in the destroy list)
 *     M = surviving 招灵书印 count (post-destruction snapshot)
 *   - Natural durability decay in combat does NOT count as destruction.
 *     (Not covered here; only forced-destroy paths are wired.)
 *   - Per proc: both equipment slots gain +1 temp attack, +1 temp armor;
 *     player gains +2 gold.
 *
 * (The effect id `delete-draw` is the legacy name from when the amulet drew
 *  cards from the backpack on delete — kept for save-compat. The current
 *  effect no longer draws cards.)
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

const DELETE_DRAW_AMULET: GameCardData = {
  id: 'amu-delete-draw',
  type: 'amulet',
  name: '招灵书印',
  value: 1,
  image: '',
  amuletEffect: 'delete-draw',
} as any;

const DELETE_DRAW_AMULET_2: GameCardData = {
  ...DELETE_DRAW_AMULET,
  id: 'amu-delete-draw-2',
} as any;

function makePlainAmulet(id: string, name = `Amulet-${id}`): GameCardData {
  return {
    id, type: 'amulet', name, value: 1, image: '',
    amuletEffect: 'gold-burn',
  } as any;
}

function makeWeapon(id: string, durability = 2): GameCardData {
  return {
    id, type: 'weapon', name: `Weapon-${id}`, value: 3, image: '',
    durability, maxDurability: durability,
  } as any;
}

function makeBp(id: string): GameCardData {
  return { id, type: 'magic', name: `BP-${id}`, value: 0, image: '' } as any;
}

function sumAction(actions: readonly any[], type: string, slotId?: string): number {
  return actions
    .filter((a: any) => a.type === type && (slotId === undefined || a.slotId === slotId))
    .reduce((acc: number, a: any) => acc + (a.delta ?? 0), 0);
}

/**
 * For a result, return the inferred procs count by inspecting
 * MODIFY_SLOT_TEMP_ATTACK on equipmentSlot1. Returns 0 if no proc was fired.
 */
function inferProcs(result: any): number {
  return sumAction(result.enqueuedActions ?? [], 'MODIFY_SLOT_TEMP_ATTACK', 'equipmentSlot1');
}

function expectSoulSealProcs(result: any, procs: number): void {
  const actions = result.enqueuedActions ?? [];
  expect(sumAction(actions, 'MODIFY_SLOT_TEMP_ATTACK', 'equipmentSlot1')).toBe(procs);
  expect(sumAction(actions, 'MODIFY_SLOT_TEMP_ATTACK', 'equipmentSlot2')).toBe(procs);
  expect(sumAction(actions, 'MODIFY_SLOT_TEMP_ARMOR', 'equipmentSlot1')).toBe(procs);
  expect(sumAction(actions, 'MODIFY_SLOT_TEMP_ARMOR', 'equipmentSlot2')).toBe(procs);
  const goldDelta = actions
    .filter((a: any) => a.type === 'MODIFY_GOLD' && a.source === 'amulet:delete-draw')
    .reduce((acc: number, a: any) => acc + a.delta, 0);
  expect(goldDelta).toBe(procs * 2);
}

function findAmuletLog(result: any): any | undefined {
  return result.sideEffects?.find?.(
    (e: any) =>
      e.event === 'log:entry' &&
      (e.payload as any)?.type === 'amulet' &&
      String((e.payload as any)?.message ?? '').includes('招灵书印'),
  );
}

// ---------------------------------------------------------------------------
// Event: removeAllAmulets
// ---------------------------------------------------------------------------

describe('招灵书印 — Event: removeAllAmulets', () => {
  it('destroys all amulets including 招灵书印 → surviving=0 → no proc', () => {
    const state = makeState({
      amuletSlots: [DELETE_DRAW_AMULET, makePlainAmulet('a-1')] as any,
      backpackItems: [makeBp('bp-1'), makeBp('bp-2'), makeBp('bp-3')] as any,
    });

    const result = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'removeAllAmulets',
    } as any);

    expect(inferProcs(result)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Event: amuletCapacity-1 overflow
// ---------------------------------------------------------------------------

describe('招灵书印 — Event: amuletCapacity-1 overflow', () => {
  it('overflow destroys the OLD-most amulet → if 招灵书印 survives, fires once', () => {
    // Order matters: amuletSlots[0] = oldest (gets evicted first).
    // We want 招灵书印 to be at the END (newest) so it survives.
    const oldAmulet = makePlainAmulet('a-old');
    const state = makeState({
      maxAmuletSlots: 2,
      amuletSlots: [oldAmulet, DELETE_DRAW_AMULET] as any,
      backpackItems: [makeBp('bp-1'), makeBp('bp-2')] as any,
    });

    const result = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'amuletCapacity-1',
    } as any);

    // N=1 (1 plain amulet destroyed) × M=1 (surviving 招灵书印) = 1 proc
    expectSoulSealProcs(result, 1);
    expect(findAmuletLog(result)).toBeDefined();
  });

  it('overflow destroys 招灵书印 itself → surviving=0 → no proc', () => {
    // 招灵书印 at index 0 = oldest = evicted.
    const state = makeState({
      maxAmuletSlots: 2,
      amuletSlots: [DELETE_DRAW_AMULET, makePlainAmulet('a-2')] as any,
      backpackItems: [makeBp('bp-1')] as any,
    });

    const result = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'amuletCapacity-1',
    } as any);

    expect(inferProcs(result)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Event: amuletsToGold+10 (and CONVERT_AMULETS_TO_GOLD)
// ---------------------------------------------------------------------------

describe('招灵书印 — Event: amuletsToGold+10 / CONVERT_AMULETS_TO_GOLD', () => {
  it('converts all amulets including 招灵书印 → surviving=0 → no proc', () => {
    const state = makeState({
      amuletSlots: [DELETE_DRAW_AMULET, makePlainAmulet('a-1')] as any,
      backpackItems: [makeBp('bp-1')] as any,
    });

    const result = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'amuletsToGold+10',
    } as any);

    expect(inferProcs(result)).toBe(0);
  });

  it('CONVERT_AMULETS_TO_GOLD action: same — no proc because nothing survives', () => {
    const state = makeState({
      amuletSlots: [DELETE_DRAW_AMULET, makePlainAmulet('a-1')] as any,
      backpackItems: [makeBp('bp-1')] as any,
    });

    const result = reduce(state, {
      type: 'CONVERT_AMULETS_TO_GOLD',
      amountPer: 10,
    } as any);

    expect(inferProcs(result)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Equipment: SACRIFICE_EQUIPMENT_SLOT (destroyEquipment:any event entry)
// ---------------------------------------------------------------------------

describe('招灵书印 — SACRIFICE_EQUIPMENT_SLOT (destroyEquipment:any)', () => {
  it('destroying 1 equipment with 1 招灵书印 equipped → 1 proc', () => {
    const state = makeState({
      amuletSlots: [DELETE_DRAW_AMULET] as any,
      equipmentSlot1: makeWeapon('w-1') as any,
      backpackItems: [makeBp('bp-1'), makeBp('bp-2')] as any,
    });

    const result = reduce(state, {
      type: 'SACRIFICE_EQUIPMENT_SLOT',
      slotId: 'equipmentSlot1',
    } as any);

    expectSoulSealProcs(result, 1); // N=1 × M=1
    expect(findAmuletLog(result)).toBeDefined();
  });

  it('linear stacking: 2 招灵书印 → 2 procs per equipment destroyed', () => {
    const state = makeState({
      amuletSlots: [DELETE_DRAW_AMULET, DELETE_DRAW_AMULET_2] as any,
      equipmentSlot1: makeWeapon('w-1') as any,
      backpackItems: [
        makeBp('bp-1'), makeBp('bp-2'), makeBp('bp-3'), makeBp('bp-4'),
      ] as any,
    });

    const result = reduce(state, {
      type: 'SACRIFICE_EQUIPMENT_SLOT',
      slotId: 'equipmentSlot1',
    } as any);

    expectSoulSealProcs(result, 2); // N=1 × M=2
  });

  it('revived equipment does NOT count as destroyed → no proc', () => {
    const monsterEquip: GameCardData = {
      id: 'm-1', type: 'monster', name: 'Phoenix', value: 3, image: '',
      durability: 2, maxDurability: 2,
      hasRevive: true, reviveUsed: false,
    } as any;

    const state = makeState({
      amuletSlots: [DELETE_DRAW_AMULET] as any,
      equipmentSlot1: monsterEquip,
      backpackItems: [makeBp('bp-1')] as any,
    });

    const result = reduce(state, {
      type: 'SACRIFICE_EQUIPMENT_SLOT',
      slotId: 'equipmentSlot1',
    } as any);

    expect(inferProcs(result)).toBe(0);
    // Equipment was revived, not destroyed.
    expect(result.state.equipmentSlot1).not.toBeNull();
    expect((result.state.equipmentSlot1 as any).reviveUsed).toBe(true);
  });

  it('no 招灵书印 equipped → no proc', () => {
    const state = makeState({
      amuletSlots: [],
      equipmentSlot1: makeWeapon('w-1') as any,
      backpackItems: [makeBp('bp-1')] as any,
    });

    const result = reduce(state, {
      type: 'SACRIFICE_EQUIPMENT_SLOT',
      slotId: 'equipmentSlot1',
    } as any);

    expect(inferProcs(result)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Event: discardCurrentLeftForGold+15
// ---------------------------------------------------------------------------

describe('招灵书印 — Event: discardCurrentLeftForGold+15', () => {
  it('destroys current left equipment → fires when 招灵书印 equipped', () => {
    const state = makeState({
      amuletSlots: [DELETE_DRAW_AMULET] as any,
      equipmentSlot1: makeWeapon('w-1') as any,
      backpackItems: [makeBp('bp-1'), makeBp('bp-2')] as any,
    });

    const result = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'discardCurrentLeftForGold+15',
    } as any);

    expectSoulSealProcs(result, 1);
  });
});

// ---------------------------------------------------------------------------
// Event: discardAllLeftForGold+10 (multi-destroy in one event)
// ---------------------------------------------------------------------------

describe('招灵书印 — Event: discardAllLeftForGold+10 (multi-destroy)', () => {
  it('per-card scaling: destroying 2 equipment → 2 procs (N=2 × M=1)', () => {
    const state = makeState({
      amuletSlots: [DELETE_DRAW_AMULET] as any,
      equipmentSlot1: makeWeapon('w-1') as any,
      equipmentSlot1Reserve: [makeWeapon('w-1-r')] as any,
      backpackItems: [
        makeBp('bp-1'), makeBp('bp-2'), makeBp('bp-3'), makeBp('bp-4'),
      ] as any,
    });

    const result = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'discardAllLeftForGold+10',
    } as any);

    expectSoulSealProcs(result, 2); // N=2 × M=1
  });
});

// ---------------------------------------------------------------------------
// End-to-end: drain pipeline; buffs actually land on state
// ---------------------------------------------------------------------------

describe('招灵书印 — end-to-end via drain', () => {
  it('SACRIFICE_EQUIPMENT_SLOT: destroyed equipment + temp atk/armor + gold land on state', () => {
    const state = makeState({
      amuletSlots: [DELETE_DRAW_AMULET] as any,
      equipmentSlot1: makeWeapon('w-1') as any,
      backpackItems: [makeBp('bp-1'), makeBp('bp-2')] as any,
      handCards: [] as any,
      gold: 5,
      // phase=playerInput so the follow-up MODIFY_* actions drain in this
      // call (per pipeline-input-continuation.mdc).
      phase: 'playerInput' as any,
    });

    const result = drain(state, [
      { type: 'SACRIFICE_EQUIPMENT_SLOT', slotId: 'equipmentSlot1' },
    ] as any);

    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.slotTempAttack.equipmentSlot1).toBe(1);
    expect(result.state.slotTempAttack.equipmentSlot2).toBe(1);
    expect(result.state.slotTempArmor.equipmentSlot1).toBe(1);
    expect(result.state.slotTempArmor.equipmentSlot2).toBe(1);
    expect(result.state.gold).toBe(7);
  });
});
