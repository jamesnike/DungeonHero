/**
 * Goblin 「窃宝」(elite steal): the stolen card must not carry stale
 * `fromSlot: 'equipmentSlot1' | 'equipmentSlot2' | 'amulet'` after landing
 * in `activeCardStacks` / popping back into the active row on goblin death.
 *
 * Bug history:
 *   User reported "Goblin 窃宝 偷到的装备牌没法儿再拖到背包或 Hero Row 获得"。
 *   Root cause: `flow.pickedItem` is sourced from `state.equipmentSlot1/2` or
 *   `state.amuletSlots` (see `rules/turn.ts:507-553`), so it carries the
 *   slot-bound `fromSlot` from when the player equipped it. The reducer in
 *   `rules/economy.ts:reduceResolveDice` pushed the card as-is into
 *   `activeCardStacks[colIndex]`. After the goblin died, the stack-pop
 *   mechanism placed the still-`fromSlot`-tagged card into the active row.
 *   When the player tried to drag it to the backpack or hero equipment slot,
 *   `GameBoard.handleCardToSlot`'s `isCardFromEquipmentSlot(card)` guard
 *   saw the stale `fromSlot` and silently `return`ed — making the card
 *   permanently un-recoverable.
 *
 *   Fix: strip `fromSlot` at the point of stacking (the card is moving from
 *   "equipment slot owner" to "dungeon stack owner"). See
 *   `card-fromslot-bookkeeping-on-move.mdc`.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState, PendingMonsterEndDice } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots, EquipmentItem, AmuletItem } from '@/components/game-board/types';
import type { GameCardData } from '@/components/GameCard';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as unknown as ActiveRowSlots,
    combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'monster' } as any,
    phase: 'awaitingDice' as any,
    ...overrides,
  };
}

function makeGoblin(id = 'goblin-1'): GameCardData {
  return {
    id,
    type: 'monster',
    name: `Goblin ${id}`,
    value: 3,
    image: '',
    hp: 3,
    maxHp: 5,
    attack: 3,
    currentLayer: 1,
    fury: 2,
    hpLayers: 2,
  } as GameCardData;
}

function makeWeapon(id = 'w-stolen'): EquipmentItem {
  return {
    id,
    type: 'weapon',
    name: 'Iron Sword',
    value: 3,
    image: '',
    durability: 2,
    maxDurability: 3,
    fromSlot: 'equipmentSlot1',
  } as unknown as EquipmentItem;
}

function makeShield(id = 's-stolen'): EquipmentItem {
  return {
    id,
    type: 'shield',
    name: 'Iron Shield',
    value: 2,
    image: '',
    durability: 2,
    maxDurability: 2,
    armor: undefined,
    fromSlot: 'equipmentSlot2',
  } as unknown as EquipmentItem;
}

function makeAmulet(id = 'a-stolen'): AmuletItem {
  return {
    id,
    type: 'amulet',
    name: 'Strength Amulet',
    value: 0,
    image: '',
    amuletEffect: 'strength' as any,
    fromSlot: 'amulet',
  } as unknown as AmuletItem;
}

function buildStealFlow(opts: {
  goblin: GameCardData;
  colIndex: number;
  pickedItem: GameCardData;
  pickedSource: 'equip' | 'amulet';
  pickedSlotId?: 'equipmentSlot1' | 'equipmentSlot2' | null;
}): PendingMonsterEndDice {
  return {
    kind: 'goblin-steal',
    goblinId: opts.goblin.id,
    goblinName: opts.goblin.name,
    colIndex: opts.colIndex,
    stackCount: 4,
    predeterminedRoll: 1,
    threshold: 20,
    success: true,
    pickedSource: opts.pickedSource,
    pickedSlotId: opts.pickedSlotId ?? null,
    pickedItem: opts.pickedItem,
  } as PendingMonsterEndDice;
}

function resolveSteal(state: GameState, goblin: GameCardData): GameState {
  const result = reduce(state, {
    type: 'RESOLVE_DICE',
    value: 1,
    outcomeId: 'steal',
    context: {
      flowId: 'goblin-steal',
      monsterId: goblin.id,
      monsterName: goblin.name,
      stackCount: 4,
    },
  } as GameAction);
  return result.state;
}

describe('Goblin 窃宝: stolen card must not retain fromSlot', () => {
  it('equipmentSlot1 weapon stolen → stacked card has no fromSlot', () => {
    const goblin = makeGoblin();
    const colIndex = 2;
    const activeCards = [null, null, goblin, null, null] as unknown as ActiveRowSlots;
    const weapon = makeWeapon('w-1');
    expect((weapon as any).fromSlot).toBe('equipmentSlot1');

    const state = makeState({
      activeCards,
      equipmentSlot1: weapon,
      pendingMonsterEndDiceQueue: [
        buildStealFlow({
          goblin,
          colIndex,
          pickedItem: weapon as unknown as GameCardData,
          pickedSource: 'equip',
          pickedSlotId: 'equipmentSlot1',
        }),
      ],
    });

    const after = resolveSteal(state, goblin);

    expect(after.equipmentSlot1).toBeNull();
    const stack = after.activeCardStacks[colIndex] ?? [];
    expect(stack).toHaveLength(1);
    const stolen = stack[0] as GameCardData & { fromSlot?: unknown };
    expect(stolen.id).toBe('w-1');
    expect(stolen.name).toBe('Iron Sword');
    expect(stolen.fromSlot).toBeUndefined();
  });

  it('equipmentSlot2 shield stolen → stacked card has no fromSlot', () => {
    const goblin = makeGoblin();
    const colIndex = 0;
    const activeCards = [goblin, null, null, null, null] as unknown as ActiveRowSlots;
    const shield = makeShield('s-1');
    expect((shield as any).fromSlot).toBe('equipmentSlot2');

    const state = makeState({
      activeCards,
      equipmentSlot2: shield,
      pendingMonsterEndDiceQueue: [
        buildStealFlow({
          goblin,
          colIndex,
          pickedItem: shield as unknown as GameCardData,
          pickedSource: 'equip',
          pickedSlotId: 'equipmentSlot2',
        }),
      ],
    });

    const after = resolveSteal(state, goblin);

    expect(after.equipmentSlot2).toBeNull();
    const stack = after.activeCardStacks[colIndex] ?? [];
    expect(stack).toHaveLength(1);
    const stolen = stack[0] as GameCardData & { fromSlot?: unknown };
    expect(stolen.id).toBe('s-1');
    expect(stolen.fromSlot).toBeUndefined();
  });

  it('amulet stolen → stacked card has no fromSlot', () => {
    const goblin = makeGoblin();
    const colIndex = 3;
    const activeCards = [null, null, null, goblin, null] as unknown as ActiveRowSlots;
    const amulet = makeAmulet('a-1');
    expect((amulet as any).fromSlot).toBe('amulet');

    const state = makeState({
      activeCards,
      amuletSlots: [amulet] as AmuletItem[],
      pendingMonsterEndDiceQueue: [
        buildStealFlow({
          goblin,
          colIndex,
          pickedItem: amulet as unknown as GameCardData,
          pickedSource: 'amulet',
          pickedSlotId: null,
        }),
      ],
    });

    const after = resolveSteal(state, goblin);

    expect(after.amuletSlots.some(a => a.id === 'a-1')).toBe(false);
    const stack = after.activeCardStacks[colIndex] ?? [];
    expect(stack).toHaveLength(1);
    const stolen = stack[0] as GameCardData & { fromSlot?: unknown };
    expect(stolen.id).toBe('a-1');
    expect(stolen.fromSlot).toBeUndefined();
  });

  it('combat:goblinStealCard side effect carries the stripped card (no fromSlot)', () => {
    const goblin = makeGoblin();
    const colIndex = 1;
    const activeCards = [null, goblin, null, null, null] as unknown as ActiveRowSlots;
    const weapon = makeWeapon('w-side');

    const state = makeState({
      activeCards,
      equipmentSlot1: weapon,
      pendingMonsterEndDiceQueue: [
        buildStealFlow({
          goblin,
          colIndex,
          pickedItem: weapon as unknown as GameCardData,
          pickedSource: 'equip',
          pickedSlotId: 'equipmentSlot1',
        }),
      ],
    });

    const result = reduce(state, {
      type: 'RESOLVE_DICE',
      value: 1,
      outcomeId: 'steal',
      context: {
        flowId: 'goblin-steal',
        monsterId: goblin.id,
        monsterName: goblin.name,
        stackCount: 4,
      },
    } as GameAction);

    const sideEffect = result.sideEffects.find(s => s.event === 'combat:goblinStealCard');
    expect(sideEffect).toBeDefined();
    const payload = sideEffect!.payload as { card: GameCardData & { fromSlot?: unknown } };
    expect(payload.card.id).toBe('w-side');
    expect(payload.card.fromSlot).toBeUndefined();
  });

  it('failed steal → no card moved, no fromSlot leak (regression guard)', () => {
    const goblin = makeGoblin();
    const colIndex = 2;
    const activeCards = [null, null, goblin, null, null] as unknown as ActiveRowSlots;
    const weapon = makeWeapon('w-fail');

    const failFlow: PendingMonsterEndDice = {
      kind: 'goblin-steal',
      goblinId: goblin.id,
      goblinName: goblin.name,
      colIndex,
      stackCount: 1,
      predeterminedRoll: 20,
      threshold: 5,
      success: false,
      pickedSource: null,
      pickedSlotId: null,
      pickedItem: null,
    } as PendingMonsterEndDice;

    const state = makeState({
      activeCards,
      equipmentSlot1: weapon,
      pendingMonsterEndDiceQueue: [failFlow],
    });

    const after = resolveSteal(state, goblin);

    // Failure path: equipment stays put, no stack entry created.
    expect(after.equipmentSlot1?.id).toBe('w-fail');
    expect((after.equipmentSlot1 as any)?.fromSlot).toBe('equipmentSlot1');
    expect(after.activeCardStacks[colIndex] ?? []).toHaveLength(0);
  });
});
