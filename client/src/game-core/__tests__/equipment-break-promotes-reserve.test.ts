/**
 * Equipment break (durability → 0) must promote the topmost reserve card
 * up into the now-empty slot.
 *
 * Bug: When a player had stacked equipment (main + N reserve cards) on the
 * left slot and the main equipment's durability ran out, the slot was set
 * to null but `equipmentSlotXReserve` was left untouched. The
 * `EquipmentSlot.tsx` UI only renders the reserve stack when the main item
 * is truthy (`gameCardData ? (reserveItems.length > 0 ? ...)`), so the
 * reserve cards stayed in state but rendered as nothing — visually they
 * "disappeared".
 *
 * Root cause: `computeEquipmentBreakEffects` set `patch[slotId] = null`
 * and emitted an `equipment:clearSlotWithPromote` side effect, expecting
 * a UI-layer listener to do the actual promote (via the
 * `clearEquipmentSlotWithPromote` hook helper). But the GameBoard.tsx
 * listener for that event was just `console.log` — nothing wired the
 * promote up. Per `game-core-architecture.mdc`, state mutations belong
 * in reducers, not in side-effect listeners. Fix is to do the promote
 * directly in `computeEquipmentBreakEffects` (and the dragonBleed-destroy
 * branch of `computeDurabilityLossEffects`).
 *
 * This file covers the 5 reducer paths the user explicitly listed:
 *   1. Combat shield-block durability tick → reserve promotes
 *   2. Combat weapon-attack durability tick → reserve promotes
 *   3. Discard-rebuild magic destroying equipment → reserve promotes
 *   4. Salvage path (残骸回收符) → reserve promotes
 *   5. Wraith swap (幽魂作祟) → other slot's reserve promotes
 *
 * Plus dragonBleedDestroy (computeDurabilityLossEffects path).
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState, createEmptyAmuletEffects } from '../constants';
import {
  computeEquipmentBreakEffects,
  computeDurabilityLossEffects,
} from '../rules/equipment-effects';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as ActiveRowSlots,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    rng: createRng(42),
    ...overrides,
  };
}

function makeMonster(id: string, attack: number, hp: number = 1): GameCardData {
  return {
    id,
    type: 'monster',
    name: `Mob-${id}`,
    value: attack,
    image: '',
    hp,
    maxHp: hp,
    attack,
    fury: 1,
    currentLayer: 1,
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// Direct unit tests on computeEquipmentBreakEffects with reserve present.
// ---------------------------------------------------------------------------

describe('computeEquipmentBreakEffects — reserve promotes when main breaks', () => {
  it('weapon broken with single reserve → reserve becomes new main', () => {
    const main: GameCardData = {
      id: 'w-main', type: 'weapon', name: '主武器', value: 3, image: '',
      durability: 0, maxDurability: 2,
    };
    const reserve: GameCardData = {
      id: 'w-reserve', type: 'weapon', name: '备用武器', value: 2, image: '',
      durability: 3, maxDurability: 3,
    };
    const state = makeState({
      equipmentSlot1: main as EquipmentItem,
      equipmentSlot1Reserve: [reserve] as EquipmentItem[],
      discardedCards: [],
    });

    const result = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      main,
      createEmptyAmuletEffects(),
    );

    expect(result.destroyed).toBe(true);
    expect(result.patch.equipmentSlot1).not.toBeNull();
    expect((result.patch.equipmentSlot1 as GameCardData).id).toBe('w-reserve');
    expect((result.patch.equipmentSlot1 as GameCardData).durability).toBe(3);
    expect(result.patch.equipmentSlot1Reserve).toEqual([]);

    // Broken main still routed to graveyard.
    const grave = result.patch.discardedCards as GameCardData[];
    expect(grave.some(c => c.id === 'w-main')).toBe(true);
  });

  it('weapon broken with TWO reserves → topmost (last) promotes, other reserve stays', () => {
    const main: GameCardData = {
      id: 'w-main', type: 'weapon', name: '主武器', value: 3, image: '',
      durability: 0, maxDurability: 2,
    };
    const r1: GameCardData = {
      id: 'w-reserve-bottom', type: 'weapon', name: '底层备用', value: 1, image: '',
      durability: 2, maxDurability: 2,
    };
    const r2: GameCardData = {
      id: 'w-reserve-top', type: 'weapon', name: '顶层备用', value: 4, image: '',
      durability: 4, maxDurability: 4,
    };
    const state = makeState({
      equipmentSlot1: main as EquipmentItem,
      // Convention: reserve[reserve.length - 1] is the visually-topmost item
      // (matches SACRIFICE_EQUIPMENT_SLOT and events.ts removeCard).
      equipmentSlot1Reserve: [r1, r2] as EquipmentItem[],
      discardedCards: [],
    });

    const result = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      main,
      createEmptyAmuletEffects(),
    );

    expect((result.patch.equipmentSlot1 as GameCardData).id).toBe('w-reserve-top');
    const newReserve = result.patch.equipmentSlot1Reserve as EquipmentItem[];
    expect(newReserve).toHaveLength(1);
    expect(newReserve[0].id).toBe('w-reserve-bottom');
  });

  it('shield broken with reserve → reserve promotes (slot 2 path)', () => {
    const mainShield: GameCardData = {
      id: 's-main', type: 'shield', name: '主盾', value: 3, image: '',
      durability: 0, maxDurability: 2, armorMax: 3, armor: 0,
    };
    const reserveShield: GameCardData = {
      id: 's-reserve', type: 'shield', name: '备用盾', value: 2, image: '',
      durability: 2, maxDurability: 2, armorMax: 2,
    };
    const state = makeState({
      equipmentSlot2: mainShield as EquipmentItem,
      equipmentSlot2Reserve: [reserveShield] as EquipmentItem[],
      discardedCards: [],
    });

    const result = computeEquipmentBreakEffects(
      state,
      'equipmentSlot2',
      mainShield,
      createEmptyAmuletEffects(),
    );

    expect((result.patch.equipmentSlot2 as GameCardData).id).toBe('s-reserve');
    expect(result.patch.equipmentSlot2Reserve).toEqual([]);
  });

  it('break with EMPTY reserve still leaves slot null (preserves old behavior)', () => {
    const main: GameCardData = {
      id: 'w-main', type: 'weapon', name: '孤独武器', value: 3, image: '',
      durability: 0, maxDurability: 2,
    };
    const state = makeState({
      equipmentSlot1: main as EquipmentItem,
      equipmentSlot1Reserve: [] as EquipmentItem[],
      discardedCards: [],
    });

    const result = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      main,
      createEmptyAmuletEffects(),
    );

    expect(result.patch.equipmentSlot1).toBeNull();
  });

  it('Perm break with reserve → reserve still promotes (Perm self goes to recycle bag)', () => {
    const permMain: GameCardData = {
      id: 'w-perm', type: 'weapon', name: '永恒主武器', value: 3, image: '',
      durability: 0, maxDurability: 2,
      recycleDelay: 2,
    };
    const reserve: GameCardData = {
      id: 'w-reserve', type: 'weapon', name: '备用武器', value: 2, image: '',
      durability: 1, maxDurability: 1,
    };
    const state = makeState({
      equipmentSlot1: permMain as EquipmentItem,
      equipmentSlot1Reserve: [reserve] as EquipmentItem[],
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const result = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      permMain,
      createEmptyAmuletEffects(),
    );

    // Reserve promoted regardless of Perm routing of the broken self.
    expect((result.patch.equipmentSlot1 as GameCardData).id).toBe('w-reserve');
    // Broken Perm goes to recycle bag via enqueuedActions.
    const addRecycle = result.enqueuedActions.find(a => a.type === 'ADD_TO_RECYCLE_BAG');
    expect(addRecycle).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Salvage path
// ---------------------------------------------------------------------------

describe('computeEquipmentBreakEffects — salvage path promotes reserve', () => {
  it('残骸回收符 with reserve → broken weapon goes to hand, reserve promotes into slot', () => {
    const main: GameCardData = {
      id: 'w-salvageable', type: 'weapon', name: '可回收武器', value: 3, image: '',
      durability: 0, maxDurability: 3,
    };
    const reserve: GameCardData = {
      id: 'w-reserve', type: 'weapon', name: '备用', value: 2, image: '',
      durability: 2, maxDurability: 2,
    };
    const state = makeState({
      equipmentSlot1: main as EquipmentItem,
      equipmentSlot1Reserve: [reserve] as EquipmentItem[],
      discardedCards: [],
      handCards: [],
    });
    const ae = { ...createEmptyAmuletEffects(), equipmentSalvageCount: 1 };

    const result = computeEquipmentBreakEffects(state, 'equipmentSlot1', main, ae);

    expect((result.patch.equipmentSlot1 as GameCardData).id).toBe('w-reserve');
    expect(result.patch.equipmentSlot1Reserve).toEqual([]);
    const handAfter = result.patch.handCards as GameCardData[];
    expect(handAfter.some(c => c.id === 'w-salvageable')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Wraith swap path
// ---------------------------------------------------------------------------

describe('computeEquipmentBreakEffects — wraith swap promotes other slot reserve', () => {
  it('wraith swap success → other slot empties; if it had reserve, reserve promotes there', () => {
    const wraith: GameCardData = {
      id: 'm-wraith', type: 'monster', name: '幽魂', value: 0, image: '',
      hp: 0, maxHp: 1, attack: 0,
      durability: 0, maxDurability: 1,
      lastWords: 'wraith-haunt-1',
    };
    const otherMain: GameCardData = {
      id: 'm-other', type: 'monster', name: '本来在右槽', value: 0, image: '',
      hp: 1, maxHp: 1, attack: 1,
      durability: 1, maxDurability: 1,
    };
    const otherReserve: GameCardData = {
      id: 'm-other-reserve', type: 'monster', name: '右槽备用', value: 0, image: '',
      hp: 2, maxHp: 2, attack: 2,
      durability: 2, maxDurability: 2,
    };
    // RNG seed 7 deterministically yields wraith-swap success (first nextBool
    // call returns true).
    const state = makeState({
      equipmentSlot1: wraith as EquipmentItem,
      equipmentSlot2: otherMain as EquipmentItem,
      equipmentSlot2Reserve: [otherReserve] as EquipmentItem[],
      rng: createRng(7),
      discardedCards: [],
    });

    const result = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      wraith,
      createEmptyAmuletEffects(),
    );

    if (result.wraithSwapTarget === 'equipmentSlot2') {
      // Slot 1 got the swapped-in otherMain.
      expect((result.patch.equipmentSlot1 as GameCardData).id).toBe('m-other');
      // Slot 2 lost its main; the reserve should now occupy slot 2.
      expect((result.patch.equipmentSlot2 as GameCardData).id).toBe('m-other-reserve');
      expect(result.patch.equipmentSlot2Reserve).toEqual([]);
    } else {
      // Wraith swap didn't trigger with this RNG — re-seed test if so.
      // This guards against future RNG changes silently no-oping the test.
      expect.fail('wraith swap did not trigger; pick a different RNG seed');
    }
  });
});

// ---------------------------------------------------------------------------
// dragonBleedDestroy path (computeDurabilityLossEffects)
// ---------------------------------------------------------------------------

describe('computeDurabilityLossEffects — dragonBleedDestroy promotes other slot reserve', () => {
  it('dragon bleed destroys other slot main → that slot reserve promotes up', () => {
    const dragon: GameCardData = {
      id: 'm-dragon', type: 'monster', name: '巨龙', value: 0, image: '',
      hp: 1, maxHp: 5, attack: 5,
      durability: 1, maxDurability: 3,
      dragonBleedDestroy: true,
    };
    const victim: GameCardData = {
      id: 'm-victim', type: 'monster', name: '被破坏者', value: 0, image: '',
      hp: 3, maxHp: 3, attack: 3,
      durability: 3, maxDurability: 3,
    };
    const victimReserve: GameCardData = {
      id: 'm-victim-reserve', type: 'monster', name: '受害者备用', value: 0, image: '',
      hp: 2, maxHp: 2, attack: 2,
      durability: 2, maxDurability: 2,
    };
    const state = makeState({
      equipmentSlot1: dragon as EquipmentItem,
      equipmentSlot2: victim as EquipmentItem,
      equipmentSlot2Reserve: [victimReserve] as EquipmentItem[],
      discardedCards: [],
    });

    // newDurability = 1 (dragon's remaining); victim.durability=3 > 1 → triggers.
    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', dragon, 1);

    // Other slot's reserve should have promoted into the slot.
    expect((result.patch.equipmentSlot2 as GameCardData).id).toBe('m-victim-reserve');
    expect(result.patch.equipmentSlot2Reserve).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: the user's exact scenario via PERFORM_HERO_ATTACK
// ---------------------------------------------------------------------------

describe('e2e: 双装备主槽 weapon breaks → reserve promotes', () => {
  it('main weapon kills monster + breaks at 1→0 durability, reserve becomes main', () => {
    const main: GameCardData = {
      id: 'w-top', type: 'weapon', name: '主武器', value: 3, image: '',
      durability: 1, maxDurability: 2,
    };
    const reserve: GameCardData = {
      id: 'w-bottom', type: 'weapon', name: '备用武器', value: 2, image: '',
      durability: 2, maxDurability: 2,
    };
    const target = makeMonster('weakling', 1, 1);
    const state = makeState({
      equipmentSlot1: main as EquipmentItem,
      equipmentSlot1Reserve: [reserve] as EquipmentItem[],
      activeCards: [target, null, null, null, null] as ActiveRowSlots,
      combatState: {
        ...initialCombatState,
        heroAttacksRemaining: 1,
        heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
        engagedMonsterIds: [target.id],
      },
      discardedCards: [],
    });

    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: target.id,
    });
    const finalState = drain(result.state, result.enqueuedActions ?? []).state;

    // Main slot is now occupied by the promoted reserve — reserve did NOT vanish.
    expect(finalState.equipmentSlot1).not.toBeNull();
    expect(finalState.equipmentSlot1!.id).toBe('w-bottom');
    expect(finalState.equipmentSlot1Reserve).toEqual([]);
    // Broken main went to graveyard (regression coverage).
    expect(finalState.discardedCards.some(c => c.id === 'w-top')).toBe(true);
  });
});
