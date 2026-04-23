/**
 * 招灵书印 (delete-draw amulet) — destruction-trigger coverage.
 *
 * Extends the original "delete keyword" trigger to fire whenever an effect
 * forcibly destroys cards: Event amulet/equipment destruction, 灭世裁决,
 * 弃装重铸, 幽魂瀑流, etc.
 *
 * Contract:
 *   - drawCount = N × 2 × M
 *     N = non-self destroyed cards (excludes 招灵书印 itself in the destroy list)
 *     M = surviving 招灵书印 count (post-destruction snapshot)
 *   - Natural durability decay in combat does NOT count as destruction.
 *     (Not covered here; only forced-destroy paths are wired.)
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

function findDrawAction(result: any): any | undefined {
  return result.enqueuedActions?.find?.(
    (a: any) => a.type === 'DRAW_CARDS' && a.source === 'backpack',
  );
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
  it('destroys all amulets including 招灵书印 → surviving=0 → no draw', () => {
    const state = makeState({
      amuletSlots: [DELETE_DRAW_AMULET, makePlainAmulet('a-1')] as any,
      backpackItems: [makeBp('bp-1'), makeBp('bp-2'), makeBp('bp-3')] as any,
    });

    const result = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'removeAllAmulets',
    } as any);

    expect(findDrawAction(result)).toBeUndefined();
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

    const drawAction = findDrawAction(result);
    expect(drawAction).toBeDefined();
    // N=1 (1 plain amulet destroyed) × 2 × M=1 (surviving 招灵书印) = 2
    expect(drawAction.count).toBe(2);
    expect(findAmuletLog(result)).toBeDefined();
  });

  it('overflow destroys 招灵书印 itself → surviving=0 → no draw', () => {
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

    expect(findDrawAction(result)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Event: amuletsToGold+10 (and CONVERT_AMULETS_TO_GOLD)
// ---------------------------------------------------------------------------

describe('招灵书印 — Event: amuletsToGold+10 / CONVERT_AMULETS_TO_GOLD', () => {
  it('converts all amulets including 招灵书印 → surviving=0 → no draw', () => {
    const state = makeState({
      amuletSlots: [DELETE_DRAW_AMULET, makePlainAmulet('a-1')] as any,
      backpackItems: [makeBp('bp-1')] as any,
    });

    const result = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'amuletsToGold+10',
    } as any);

    expect(findDrawAction(result)).toBeUndefined();
  });

  it('CONVERT_AMULETS_TO_GOLD action: same — no draw because nothing survives', () => {
    const state = makeState({
      amuletSlots: [DELETE_DRAW_AMULET, makePlainAmulet('a-1')] as any,
      backpackItems: [makeBp('bp-1')] as any,
    });

    const result = reduce(state, {
      type: 'CONVERT_AMULETS_TO_GOLD',
      amountPer: 10,
    } as any);

    expect(findDrawAction(result)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Equipment: SACRIFICE_EQUIPMENT_SLOT (destroyEquipment:any event entry)
// ---------------------------------------------------------------------------

describe('招灵书印 — SACRIFICE_EQUIPMENT_SLOT (destroyEquipment:any)', () => {
  it('destroying 1 equipment with 1 招灵书印 equipped → draw 2', () => {
    const state = makeState({
      amuletSlots: [DELETE_DRAW_AMULET] as any,
      equipmentSlot1: makeWeapon('w-1') as any,
      backpackItems: [makeBp('bp-1'), makeBp('bp-2')] as any,
    });

    const result = reduce(state, {
      type: 'SACRIFICE_EQUIPMENT_SLOT',
      slotId: 'equipmentSlot1',
    } as any);

    const drawAction = findDrawAction(result);
    expect(drawAction).toBeDefined();
    expect(drawAction.count).toBe(2); // N=1 × 2 × M=1
    expect(findAmuletLog(result)).toBeDefined();
  });

  it('linear stacking: 2 招灵书印 → draw 4 per equipment destroyed', () => {
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

    const drawAction = findDrawAction(result);
    expect(drawAction).toBeDefined();
    expect(drawAction.count).toBe(4); // N=1 × 2 × M=2
  });

  it('revived equipment does NOT count as destroyed → no draw', () => {
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

    expect(findDrawAction(result)).toBeUndefined();
    // Equipment was revived, not destroyed.
    expect(result.state.equipmentSlot1).not.toBeNull();
    expect((result.state.equipmentSlot1 as any).reviveUsed).toBe(true);
  });

  it('no 招灵书印 equipped → no draw', () => {
    const state = makeState({
      amuletSlots: [],
      equipmentSlot1: makeWeapon('w-1') as any,
      backpackItems: [makeBp('bp-1')] as any,
    });

    const result = reduce(state, {
      type: 'SACRIFICE_EQUIPMENT_SLOT',
      slotId: 'equipmentSlot1',
    } as any);

    expect(findDrawAction(result)).toBeUndefined();
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

    const drawAction = findDrawAction(result);
    expect(drawAction).toBeDefined();
    expect(drawAction.count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Event: discardAllLeftForGold+10 (multi-destroy in one event)
// ---------------------------------------------------------------------------

describe('招灵书印 — Event: discardAllLeftForGold+10 (multi-destroy)', () => {
  it('per-card scaling: destroying 2 equipment → draw 4 (N=2 × 2 × M=1)', () => {
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

    const drawAction = findDrawAction(result);
    expect(drawAction).toBeDefined();
    expect(drawAction.count).toBe(4); // N=2 × 2 × M=1
  });
});

// ---------------------------------------------------------------------------
// End-to-end: drain pipeline; cards actually land in hand
// ---------------------------------------------------------------------------

describe('招灵书印 — end-to-end via drain', () => {
  it('SACRIFICE_EQUIPMENT_SLOT: destroyed equipment + 2 cards drawn into hand', () => {
    const state = makeState({
      amuletSlots: [DELETE_DRAW_AMULET] as any,
      equipmentSlot1: makeWeapon('w-1') as any,
      backpackItems: [makeBp('bp-1'), makeBp('bp-2')] as any,
      handCards: [] as any,
    });

    const result = drain(state, [
      { type: 'SACRIFICE_EQUIPMENT_SLOT', slotId: 'equipmentSlot1' },
    ] as any);

    expect(result.state.equipmentSlot1).toBeNull();
    expect((result.state.handCards as any[]).find(c => c.id === 'bp-1')).toBeDefined();
    expect((result.state.handCards as any[]).find(c => c.id === 'bp-2')).toBeDefined();
    expect(result.state.backpackItems).toHaveLength(0);
  });
});
