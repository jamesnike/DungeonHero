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

describe('招灵书印 (amulet: delete-draw)', () => {
  describe('via CONFIRM_DELETE_CARD (the runtime shop/event delete entry point)', () => {
    it('enqueues a 2-card backpack draw on a single-amulet "delete" of a hand card', () => {
      const target = makeHandCard('h-1');
      const state = makeState({
        amuletSlots: [DELETE_DRAW_AMULET] as any,
        handCards: [target, makeHandCard('h-keep')] as any,
        backpackItems: [makeBackpackCard('bp-1'), makeBackpackCard('bp-2'), makeBackpackCard('bp-3')] as any,
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

      const drawAction = result.enqueuedActions.find(
        (a: any) => a.type === 'DRAW_CARDS' && a.source === 'backpack',
      );
      expect(drawAction).toBeDefined();
      expect((drawAction as any)?.count).toBe(2);

      const amuletLog = result.sideEffects.find(
        e =>
          e.event === 'log:entry' &&
          (e.payload as any)?.type === 'amulet' &&
          String((e.payload as any)?.message ?? '').includes('招灵书印'),
      );
      expect(amuletLog).toBeDefined();
    });

    it('stacks linearly: 2 amulets → 4-card backpack draw per delete', () => {
      const target = makeHandCard('h-1');
      const state = makeState({
        amuletSlots: [DELETE_DRAW_AMULET, DELETE_DRAW_AMULET_2] as any,
        handCards: [target] as any,
        backpackItems: [
          makeBackpackCard('bp-1'),
          makeBackpackCard('bp-2'),
          makeBackpackCard('bp-3'),
          makeBackpackCard('bp-4'),
          makeBackpackCard('bp-5'),
        ] as any,
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

      const drawAction = result.enqueuedActions.find(
        (a: any) => a.type === 'DRAW_CARDS' && a.source === 'backpack',
      );
      expect(drawAction).toBeDefined();
      expect((drawAction as any)?.count).toBe(4);
    });

    it('does NOT enqueue a draw when the keyword is "discard-only" (弃置 ≠ 删除)', () => {
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

      const drawAction = result.enqueuedActions.find(
        (a: any) => a.type === 'DRAW_CARDS' && a.source === 'backpack',
      );
      expect(drawAction).toBeUndefined();
    });

    it('does NOT enqueue a draw when the keyword is "recycle-only" (回收 ≠ 删除)', () => {
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

      const drawAction = result.enqueuedActions.find(
        (a: any) => a.type === 'DRAW_CARDS' && a.source === 'backpack',
      );
      expect(drawAction).toBeUndefined();
    });

    it('does NOT enqueue a draw when the amulet is not equipped', () => {
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

      const drawAction = result.enqueuedActions.find(
        (a: any) => a.type === 'DRAW_CARDS' && a.source === 'backpack',
      );
      expect(drawAction).toBeUndefined();
    });

    it('end-to-end: shop delete + 2 backpack cards available → both land in hand', () => {
      const target = makeHandCard('h-1');
      const bp1 = makeBackpackCard('bp-1');
      const bp2 = makeBackpackCard('bp-2');
      const state = makeState({
        amuletSlots: [DELETE_DRAW_AMULET] as any,
        handCards: [target] as any,
        backpackItems: [bp1, bp2] as any,
        cardActionContext: {
          mode: 'shop',
          keyword: 'delete',
          requiredCount: 1,
          remainingCount: 1,
        },
      });

      const result = drain(state, [
        { type: 'CONFIRM_DELETE_CARD', cardId: 'h-1', source: 'hand' },
      ] as any);

      expect((result.state.handCards as any[]).find(c => c.id === 'h-1')).toBeUndefined();
      expect((result.state.handCards as any[]).find(c => c.id === 'bp-1')).toBeDefined();
      expect((result.state.handCards as any[]).find(c => c.id === 'bp-2')).toBeDefined();
      expect(result.state.backpackItems).toHaveLength(0);
    });
  });

  describe('via DELETE_CARD (the canonical zone-removal primitive)', () => {
    it('enqueues a 2-card backpack draw on a single-amulet delete', () => {
      const target = makeHandCard('h-1');
      const state = makeState({
        amuletSlots: [DELETE_DRAW_AMULET] as any,
        handCards: [target] as any,
        backpackItems: [makeBackpackCard('bp-1'), makeBackpackCard('bp-2')] as any,
      });

      const result = reduce(state, {
        type: 'DELETE_CARD',
        cardId: 'h-1',
        source: 'hand',
        destination: 'graveyard',
      } as any);

      const drawAction = result.enqueuedActions.find(
        (a: any) => a.type === 'DRAW_CARDS' && a.source === 'backpack',
      );
      expect(drawAction).toBeDefined();
      expect((drawAction as any)?.count).toBe(2);
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

      const drawAction = result.enqueuedActions.find(
        (a: any) => a.type === 'DRAW_CARDS' && a.source === 'backpack',
      );
      expect(drawAction).toBeUndefined();
    });
  });
});
