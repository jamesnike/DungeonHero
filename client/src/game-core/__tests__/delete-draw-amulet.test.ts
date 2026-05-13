/**
 * 招灵书印 (`amuletEffect: 'delete-draw'`) — 「删除」keyword trigger path.
 *
 * Effect (current):
 *   For every card the trigger fires on, both equipment slots gain
 *   `+1 temp attack`, `+1 temp armor`, and the player gains `+2 gold`.
 *   Stacks linearly: with M 招灵书印 equipped, every fire is `× M`.
 *
 * (The effect id `delete-draw` is the legacy name from when the amulet drew
 *  cards from the backpack on delete — kept for save-compat. The current
 *  effect no longer draws cards.)
 *
 * This file covers the 「删除」keyword path:
 *   - CONFIRM_DELETE_CARD with kw === 'delete' (shop / event)
 *   - DELETE_CARD (the canonical zone-removal primitive)
 *
 * The destruction trigger path (events / 灭世裁决 / 弃装重铸 / 瀑流) lives in
 * `delete-draw-on-destroy.test.ts`.
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

function makeBackpackCard(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: `Magic-${id}`,
    value: 0,
    image: '',
  } as any;
}

function makeHandCard(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: `Hand-${id}`,
    value: 0,
    image: '',
  } as any;
}

// ---------------------------------------------------------------------------
// Helpers for asserting the new effect (slot temp atk/armor + gold)
// ---------------------------------------------------------------------------

function sumAction(actions: readonly any[], type: string, slotId?: string): number {
  return actions
    .filter(a => a.type === type && (slotId === undefined || a.slotId === slotId))
    .reduce((acc, a) => acc + (a.delta ?? 0), 0);
}

function findAmuletLog(result: any): any | undefined {
  return result.sideEffects.find(
    (e: any) =>
      e.event === 'log:entry' &&
      (e.payload as any)?.type === 'amulet' &&
      String((e.payload as any)?.message ?? '').includes('招灵书印'),
  );
}

function findAnySoulSealAction(result: any): boolean {
  return (result.enqueuedActions ?? []).some(
    (a: any) =>
      a.type === 'MODIFY_SLOT_TEMP_ATTACK' ||
      a.type === 'MODIFY_SLOT_TEMP_ARMOR' ||
      (a.type === 'MODIFY_GOLD' && a.source === 'amulet:delete-draw'),
  );
}

/**
 * Assert the proc actions for `procs` 招灵书印 fires.
 * Each proc: +1 atk to both slots, +1 armor to both slots, +2 gold.
 */
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

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe('招灵书印 (amulet: delete-draw)', () => {
  describe('via CONFIRM_DELETE_CARD (the runtime shop/event delete entry point)', () => {
    it('enqueues 1× proc (+1/+1/+2) on a single-amulet "delete" of a hand card', () => {
      const target = makeHandCard('h-1');
      const state = makeState({
        amuletSlots: [DELETE_DRAW_AMULET] as any,
        handCards: [target, makeHandCard('h-keep')] as any,
        backpackItems: [makeBackpackCard('bp-1')] as any,
        cardActionContext: {
          mode: 'shop',
          keyword: 'delete',
          requiredCount: 1,
          remainingCount: 1,
        },
      });

      const result = reduce(state, {
        type: 'CONFIRM_DELETE_CARD',
        cardId: 'h-1',
        source: 'hand',
      } as any);

      expectSoulSealProcs(result, 1);
      expect(findAmuletLog(result)).toBeDefined();
    });

    it('stacks linearly: 2 amulets → 2× proc (+2/+2/+4) per delete', () => {
      const target = makeHandCard('h-1');
      const state = makeState({
        amuletSlots: [DELETE_DRAW_AMULET, DELETE_DRAW_AMULET_2] as any,
        handCards: [target] as any,
        backpackItems: [makeBackpackCard('bp-1')] as any,
        cardActionContext: {
          mode: 'shop',
          keyword: 'delete',
          requiredCount: 1,
          remainingCount: 1,
        },
      });

      const result = reduce(state, {
        type: 'CONFIRM_DELETE_CARD',
        cardId: 'h-1',
        source: 'hand',
      } as any);

      expectSoulSealProcs(result, 2);
    });

    it('does NOT fire when the keyword is "discard-only" (弃置 ≠ 删除)', () => {
      const target = makeHandCard('h-1');
      const state = makeState({
        amuletSlots: [DELETE_DRAW_AMULET] as any,
        handCards: [target] as any,
        backpackItems: [makeBackpackCard('bp-1')] as any,
        cardActionContext: {
          mode: 'shop',
          keyword: 'discard-only',
          requiredCount: 1,
          remainingCount: 1,
        },
      });

      const result = reduce(state, {
        type: 'CONFIRM_DELETE_CARD',
        cardId: 'h-1',
        source: 'hand',
      } as any);

      expect(findAnySoulSealAction(result)).toBe(false);
    });

    it('does NOT fire when the keyword is "recycle-only" (回收 ≠ 删除)', () => {
      const target = makeHandCard('h-1');
      const state = makeState({
        amuletSlots: [DELETE_DRAW_AMULET] as any,
        handCards: [target] as any,
        backpackItems: [makeBackpackCard('bp-1')] as any,
        cardActionContext: {
          mode: 'shop',
          keyword: 'recycle-only',
          requiredCount: 1,
          remainingCount: 1,
        },
      });

      const result = reduce(state, {
        type: 'CONFIRM_DELETE_CARD',
        cardId: 'h-1',
        source: 'hand',
      } as any);

      expect(findAnySoulSealAction(result)).toBe(false);
    });

    it('does NOT fire when the amulet is not equipped', () => {
      const target = makeHandCard('h-1');
      const state = makeState({
        amuletSlots: [] as any,
        handCards: [target] as any,
        backpackItems: [makeBackpackCard('bp-1')] as any,
        cardActionContext: {
          mode: 'shop',
          keyword: 'delete',
          requiredCount: 1,
          remainingCount: 1,
        },
      });

      const result = reduce(state, {
        type: 'CONFIRM_DELETE_CARD',
        cardId: 'h-1',
        source: 'hand',
      } as any);

      expect(findAnySoulSealAction(result)).toBe(false);
    });

    it('end-to-end: shop delete + follow-up procs all land on state', () => {
      const target = makeHandCard('h-1');
      const state = makeState({
        amuletSlots: [DELETE_DRAW_AMULET] as any,
        handCards: [target] as any,
        backpackItems: [] as any,
        cardActionContext: {
          mode: 'shop',
          keyword: 'delete',
          requiredCount: 1,
          remainingCount: 1,
        },
        gold: 10,
      });

      // Mirror real engine.dispatch flow: top-level reduce() for the
      // user-facing action (CONFIRM_DELETE_CARD bypasses isInputContinuation),
      // then drain the follow-up actions it enqueues (which are whitelisted
      // continuation actions: MODIFY_SLOT_TEMP_ATTACK / MODIFY_SLOT_TEMP_ARMOR
      // / MODIFY_GOLD).
      const top = reduce(state, {
        type: 'CONFIRM_DELETE_CARD',
        cardId: 'h-1',
        source: 'hand',
      } as any);
      const result = drain(
        { ...top.state, phase: 'playerInput' as any },
        top.enqueuedActions,
      );

      expect((result.state.handCards as any[]).find(c => c.id === 'h-1')).toBeUndefined();
      expect(result.state.slotTempAttack.equipmentSlot1).toBe(1);
      expect(result.state.slotTempAttack.equipmentSlot2).toBe(1);
      expect(result.state.slotTempArmor.equipmentSlot1).toBe(1);
      expect(result.state.slotTempArmor.equipmentSlot2).toBe(1);
      expect(result.state.gold).toBe(12);
    });
  });

  describe('via DELETE_CARD (the canonical zone-removal primitive)', () => {
    it('enqueues 1× proc on a single-amulet delete', () => {
      const target = makeHandCard('h-1');
      const state = makeState({
        amuletSlots: [DELETE_DRAW_AMULET] as any,
        handCards: [target] as any,
        backpackItems: [makeBackpackCard('bp-1')] as any,
      });

      const result = reduce(state, {
        type: 'DELETE_CARD',
        cardId: 'h-1',
        source: 'hand',
        destination: 'graveyard',
      } as any);

      expectSoulSealProcs(result, 1);
    });

    it('does not fire when no card was actually deleted (no-op short-circuit)', () => {
      const state = makeState({
        amuletSlots: [DELETE_DRAW_AMULET] as any,
        handCards: [] as any,
        backpackItems: [makeBackpackCard('bp-1')] as any,
      });

      const result = reduce(state, {
        type: 'DELETE_CARD',
        cardId: 'missing',
        source: 'hand',
        destination: 'graveyard',
      } as any);

      expect(findAnySoulSealAction(result)).toBe(false);
    });
  });
});
