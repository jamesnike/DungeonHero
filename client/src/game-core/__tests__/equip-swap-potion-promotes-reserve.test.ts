/**
 * 置换药剂 (equip-swap potion) must promote a slot's topmost reserve when
 * the slot's main item is removed by the swap.
 *
 * Bug: same class as the equipment-break reserve-disappearing bug. The
 * potion sets `patch[otherSlotId] = null` (the OTHER slot, after its main
 * is moved into the chosenSlot) — or `patch[chosenSlotId] = null` if the
 * other slot is empty. In either case, if the cleared slot still had
 * reserve cards, those cards remained in `equipmentSlotXReserve` but the
 * UI (`EquipmentSlot.tsx`) only renders the reserve stack when the main
 * item is truthy, so the reserve "disappeared" visually.
 *
 * Fix: both the schema executor (`applyEquipSwapToSlot` in
 * card-schema/executors.ts) and the legacy resolver (`applyEquipSwap` in
 * rules/potion-effects.ts) now call `clearSlotAndPromoteReserve` to
 * promote the topmost reserve into the cleared slot — same helper used
 * by all 5 equipment-break paths.
 *
 * Routing note: RESOLVE_POTION dispatch tries the schema engine first
 * (executeCardEffects in rules/cards.ts:759); since equip-swap is
 * registered as `potion:equip-swap` in card-schema/definitions/potions.ts,
 * the schema path is the live one. The legacy `applyEquipSwap` is kept
 * in sync as a defensive parallel implementation per the
 * shared-effect-id-impact-check rule.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import type { GameAction } from '../actions';
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

function makeEquipSwapPotion(): GameCardData {
  return {
    id: 'p-equip-swap',
    type: 'potion',
    name: '置换药剂',
    value: 0,
    image: '',
    description: '使用时选择一个装备回到手牌；若另一栏有装备，则换到该位置。',
    potionEffect: 'equip-swap',
  } as GameCardData;
}

describe('置换药剂 — single-slot path promotes reserve', () => {
  it('only one slot has equipment + 1 reserve → main returns to hand, reserve promotes into the now-empty slot', () => {
    const main: GameCardData = {
      id: 'w-main', type: 'weapon', name: '主武器', value: 3, image: '',
      durability: 2, maxDurability: 2,
    };
    const reserve: GameCardData = {
      id: 'w-reserve', type: 'weapon', name: '备用武器', value: 1, image: '',
      durability: 2, maxDurability: 2,
    };
    const potion = makeEquipSwapPotion();
    const state = makeState({
      handCards: [potion],
      equipmentSlot1: main as EquipmentItem,
      equipmentSlot1Reserve: [reserve] as EquipmentItem[],
      equipmentSlot2: null,
      equipmentSlot2Reserve: [],
    });

    const result = drain(state, [{ type: 'RESOLVE_POTION', card: potion } as GameAction]);
    const finalState = result.state;

    // The reserve must have promoted into slot 1 — not vanished.
    expect(finalState.equipmentSlot1).not.toBeNull();
    expect(finalState.equipmentSlot1!.id).toBe('w-reserve');
    expect(finalState.equipmentSlot1Reserve).toEqual([]);

    // The main must be back in hand.
    expect(finalState.handCards.some(c => c.id === 'w-main')).toBe(true);
  });

  it('only one slot has equipment + TWO reserves → topmost reserve promotes, the other stays in reserve', () => {
    const main: GameCardData = {
      id: 'w-main', type: 'weapon', name: '主武器', value: 3, image: '',
      durability: 2, maxDurability: 2,
    };
    const r1: GameCardData = {
      id: 'w-bottom', type: 'weapon', name: '底层备用', value: 1, image: '',
      durability: 1, maxDurability: 1,
    };
    const r2: GameCardData = {
      id: 'w-top', type: 'weapon', name: '顶层备用', value: 4, image: '',
      durability: 4, maxDurability: 4,
    };
    const potion = makeEquipSwapPotion();
    const state = makeState({
      handCards: [potion],
      equipmentSlot1: main as EquipmentItem,
      // reserve[reserve.length - 1] is the visually-topmost item.
      equipmentSlot1Reserve: [r1, r2] as EquipmentItem[],
      equipmentSlot2: null,
      equipmentSlot2Reserve: [],
    });

    const result = drain(state, [{ type: 'RESOLVE_POTION', card: potion } as GameAction]);
    const finalState = result.state;

    expect(finalState.equipmentSlot1!.id).toBe('w-top');
    expect(finalState.equipmentSlot1Reserve).toHaveLength(1);
    expect(finalState.equipmentSlot1Reserve[0].id).toBe('w-bottom');
    expect(finalState.handCards.some(c => c.id === 'w-main')).toBe(true);
  });

  it('only slot 2 has equipment + reserve → reserve promotes into slot 2 (mirror coverage of the slot-1 path)', () => {
    const main: GameCardData = {
      id: 's-main', type: 'shield', name: '主盾', value: 2, image: '',
      durability: 2, maxDurability: 2, armorMax: 2, armor: 2,
    };
    const reserve: GameCardData = {
      id: 's-reserve', type: 'shield', name: '备用盾', value: 1, image: '',
      durability: 1, maxDurability: 1, armorMax: 1,
    };
    const potion = makeEquipSwapPotion();
    const state = makeState({
      handCards: [potion],
      equipmentSlot1: null,
      equipmentSlot1Reserve: [],
      equipmentSlot2: main as EquipmentItem,
      equipmentSlot2Reserve: [reserve] as EquipmentItem[],
    });

    const result = drain(state, [{ type: 'RESOLVE_POTION', card: potion } as GameAction]);
    const finalState = result.state;

    expect(finalState.equipmentSlot2).not.toBeNull();
    expect(finalState.equipmentSlot2!.id).toBe('s-reserve');
    expect(finalState.equipmentSlot2Reserve).toEqual([]);
    expect(finalState.handCards.some(c => c.id === 's-main')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Two-slot path — covers the historical bug where pendingPotionAction.effect
  // was set to 'perm-slot-damage+1' (copy-paste leftover) instead of
  // 'equip-swap'. After the player picked a slot, RESOLVE_EQUIPMENT_CHOICE was
  // routed to the perm-slot-damage+1 case in resolvePendingPotion, so the
  // chosen slot got "+1 permanent attack" instead of being swapped to hand.
  //
  // The single-slot path above never went through pendingPotionAction (it
  // calls applyEquipSwap directly), so it didn't catch the bug.
  // ---------------------------------------------------------------------------

  it('two slots have equipment → request slot picker; pendingPotionAction.effect must be "equip-swap" (not "perm-slot-damage+1")', () => {
    const left: GameCardData = {
      id: 'w-left', type: 'weapon', name: '左武器', value: 3, image: '',
      durability: 2, maxDurability: 2,
    };
    const right: GameCardData = {
      id: 'w-right', type: 'weapon', name: '右武器', value: 4, image: '',
      durability: 3, maxDurability: 3,
    };
    const potion = makeEquipSwapPotion();
    const state = makeState({
      handCards: [potion],
      equipmentSlot1: left as EquipmentItem,
      equipmentSlot2: right as EquipmentItem,
    });

    const result = drain(state, [{ type: 'RESOLVE_POTION', card: potion } as GameAction]);
    const finalState = result.state;

    expect(finalState.pendingPotionAction).not.toBeNull();
    expect(finalState.pendingPotionAction?.effect).toBe('equip-swap');
    expect(finalState.equipmentSlot1?.id).toBe('w-left');
    expect(finalState.equipmentSlot2?.id).toBe('w-right');
    expect(finalState.equipmentSlotBonuses.equipmentSlot1.damage).toBe(0);
    expect(finalState.equipmentSlotBonuses.equipmentSlot2.damage).toBe(0);
  });

  it('two slots have equipment, player picks LEFT → left returns to hand, right moves to left slot', () => {
    const left: GameCardData = {
      id: 'w-left', type: 'weapon', name: '左武器', value: 3, image: '',
      durability: 2, maxDurability: 2,
    };
    const right: GameCardData = {
      id: 'w-right', type: 'weapon', name: '右武器', value: 4, image: '',
      durability: 3, maxDurability: 3,
    };
    const potion = makeEquipSwapPotion();
    const state = makeState({
      handCards: [potion],
      equipmentSlot1: left as EquipmentItem,
      equipmentSlot2: right as EquipmentItem,
    });

    const result = drain(state, [
      { type: 'RESOLVE_POTION', card: potion } as GameAction,
      { type: 'RESOLVE_EQUIPMENT_CHOICE', slotId: 'equipmentSlot1', context: { flowId: 'equip-swap' } } as GameAction,
    ]);
    const finalState = result.state;

    expect(finalState.equipmentSlot1?.id).toBe('w-right');
    expect(finalState.equipmentSlot2).toBeNull();
    expect(finalState.handCards.some(c => c.id === 'w-left')).toBe(true);
    expect(finalState.pendingPotionAction).toBeNull();
    expect(finalState.equipmentSlotBonuses.equipmentSlot1.damage).toBe(0);
  });

  it('two slots have equipment, player picks RIGHT → right returns to hand, left moves to right slot', () => {
    const left: GameCardData = {
      id: 'w-left', type: 'weapon', name: '左武器', value: 3, image: '',
      durability: 2, maxDurability: 2,
    };
    const right: GameCardData = {
      id: 'w-right', type: 'weapon', name: '右武器', value: 4, image: '',
      durability: 3, maxDurability: 3,
    };
    const potion = makeEquipSwapPotion();
    const state = makeState({
      handCards: [potion],
      equipmentSlot1: left as EquipmentItem,
      equipmentSlot2: right as EquipmentItem,
    });

    const result = drain(state, [
      { type: 'RESOLVE_POTION', card: potion } as GameAction,
      { type: 'RESOLVE_EQUIPMENT_CHOICE', slotId: 'equipmentSlot2', context: { flowId: 'equip-swap' } } as GameAction,
    ]);
    const finalState = result.state;

    expect(finalState.equipmentSlot1).toBeNull();
    expect(finalState.equipmentSlot2?.id).toBe('w-left');
    expect(finalState.handCards.some(c => c.id === 'w-right')).toBe(true);
    expect(finalState.pendingPotionAction).toBeNull();
    expect(finalState.equipmentSlotBonuses.equipmentSlot2.damage).toBe(0);
  });

  it('only one slot has equipment, NO reserve → slot becomes null (preserves baseline behavior)', () => {
    const main: GameCardData = {
      id: 'w-lonely', type: 'weapon', name: '孤独武器', value: 3, image: '',
      durability: 2, maxDurability: 2,
    };
    const potion = makeEquipSwapPotion();
    const state = makeState({
      handCards: [potion],
      equipmentSlot1: main as EquipmentItem,
      equipmentSlot1Reserve: [],
      equipmentSlot2: null,
      equipmentSlot2Reserve: [],
    });

    const result = drain(state, [{ type: 'RESOLVE_POTION', card: potion } as GameAction]);
    const finalState = result.state;

    expect(finalState.equipmentSlot1).toBeNull();
    expect(finalState.equipmentSlot1Reserve).toEqual([]);
    expect(finalState.handCards.some(c => c.id === 'w-lonely')).toBe(true);
  });
});
