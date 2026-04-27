/**
 * Manual recycle: `_recycleWaits` 覆盖
 *
 * 当玩家手动把卡拖入「回收袋（背包位置）」时，进回收袋后的 `_recycleWaits` 一律
 * 设为 1，覆盖卡牌自身的 `recycleDelay`（包括 Perm 系列的 2、3 等）。
 *
 * 数据流：
 *   - 装备栏 / 护符栏拖入：`addPermanentMagicToRecycleBag(card, { waitsOverride: 1 })`
 *     → `ADD_TO_RECYCLE_BAG` action 带 `waitsOverride: 1`
 *   - 手牌拖入：`discardCardToGraveyard(card, { forceRecycleBag: true, waitsOverride: 1 })`
 *     → `DISCARD_OWNED_CARD` action 带 `waitsOverride: 1`
 *     → reducer 透传给 enqueue 的 `ADD_TO_RECYCLE_BAG`
 *
 * 系统层路径（出牌自回收 / 装备销毁 / 护符销毁 / 瀑流溢出 / 其它效果）一律不传
 * `waitsOverride`，让卡按原有 `recycleDelay` 等待。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { SideEffect } from '../reducer';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

/**
 * 同 `transform-discard-recycle.test.ts` 里的 helper：模拟 engine.dispatch →
 * 直接 reduce 玩家输入 action，再把 enqueued follow-up drain 一遍。
 */
function processAction(
  state: GameState,
  action: GameAction,
): { state: GameState; sideEffects: SideEffect[] } {
  const reduced = reduce(state, action);
  let next: GameState = {
    ...reduced.state,
    actionQueue: [...reduced.enqueuedActions, ...reduced.state.actionQueue],
  };
  const allSideEffects: SideEffect[] = [...reduced.sideEffects];
  if (next.actionQueue.length > 0) {
    const drained = drain(next, next.actionQueue);
    next = { ...drained.state, actionQueue: drained.queue };
    allSideEffects.push(...drained.sideEffects);
  }
  return { state: next, sideEffects: allSideEffects };
}

function makePermMagic(id: string, recycleDelay = 2): GameCardData {
  return {
    id,
    type: 'magic' as const,
    name: `Perm-${id}`,
    value: 0,
    image: '',
    magicType: 'permanent',
    recycleDelay,
  } as GameCardData;
}

function makePermAmulet(id: string, recycleDelay = 2): GameCardData {
  return {
    id,
    type: 'amulet' as const,
    name: `PermAmulet-${id}`,
    value: 0,
    image: '',
    recycleDelay,
  } as GameCardData;
}

describe('Manual recycle: `_recycleWaits` 覆盖', () => {
  describe('ADD_TO_RECYCLE_BAG', () => {
    it('waitsOverride: 1 + recycleDelay: 2 → _recycleWaits === 1', () => {
      const card = makePermMagic('m1', 2);
      const state = makeState();

      const result = processAction(state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card,
        waitsOverride: 1,
      } as GameAction);

      const inBag = result.state.permanentMagicRecycleBag.find(c => c.id === 'm1');
      expect(inBag).toBeDefined();
      expect((inBag as GameCardData & { _recycleWaits?: number })._recycleWaits).toBe(1);
    });

    it('waitsOverride: 1 + recycleDelay: 3 → _recycleWaits === 1（覆盖更高的 delay）', () => {
      const card = makePermMagic('m1', 3);
      const state = makeState();

      const result = processAction(state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card,
        waitsOverride: 1,
      } as GameAction);

      const inBag = result.state.permanentMagicRecycleBag.find(c => c.id === 'm1');
      expect((inBag as GameCardData & { _recycleWaits?: number })._recycleWaits).toBe(1);
    });

    it('不传 waitsOverride + recycleDelay: 2 → _recycleWaits === 2（原有行为）', () => {
      const card = makePermMagic('m1', 2);
      const state = makeState();

      const result = processAction(state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card,
      } as GameAction);

      const inBag = result.state.permanentMagicRecycleBag.find(c => c.id === 'm1');
      expect((inBag as GameCardData & { _recycleWaits?: number })._recycleWaits).toBe(2);
    });

    it('不传 waitsOverride + 无 recycleDelay → _recycleWaits === 1（默认行为）', () => {
      const card: GameCardData = {
        id: 'm1',
        type: 'magic' as const,
        name: 'NoDelay',
        value: 0,
        image: '',
      } as GameCardData;
      const state = makeState();

      const result = processAction(state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card,
      } as GameAction);

      const inBag = result.state.permanentMagicRecycleBag.find(c => c.id === 'm1');
      expect((inBag as GameCardData & { _recycleWaits?: number })._recycleWaits).toBe(1);
    });
  });

  describe('DISCARD_OWNED_CARD（手牌拖入回收袋路径）', () => {
    it('forceRecycleBag + waitsOverride: 1 → 进回收袋且 _recycleWaits === 1', () => {
      const permCard = makePermMagic('h1', 2);
      const state = makeState({
        handCards: [permCard],
      });

      const result = processAction(state, {
        type: 'DISCARD_OWNED_CARD',
        card: permCard,
        owner: 'player',
        forceRecycleBag: true,
        waitsOverride: 1,
      } as GameAction);

      expect(result.state.discardedCards.find(c => c.id === 'h1')).toBeUndefined();
      const inBag = result.state.permanentMagicRecycleBag.find(c => c.id === 'h1');
      expect(inBag).toBeDefined();
      expect((inBag as GameCardData & { _recycleWaits?: number })._recycleWaits).toBe(1);
    });

    it('forceRecycleBag 无 waitsOverride → 进回收袋且 _recycleWaits === recycleDelay (2)', () => {
      const permCard = makePermMagic('h1', 2);
      const state = makeState({
        handCards: [permCard],
      });

      const result = processAction(state, {
        type: 'DISCARD_OWNED_CARD',
        card: permCard,
        owner: 'player',
        forceRecycleBag: true,
      } as GameAction);

      const inBag = result.state.permanentMagicRecycleBag.find(c => c.id === 'h1');
      expect(inBag).toBeDefined();
      expect((inBag as GameCardData & { _recycleWaits?: number })._recycleWaits).toBe(2);
    });

    it('Perm 卡（无 forceRecycleBag）+ waitsOverride: 1 → 自动路由到回收袋且 _recycleWaits === 1', () => {
      // isRecyclableFromHand 命中 → reducer 自动走回收袋分支，waitsOverride 透传
      const permCard = makePermMagic('h1', 2);
      const state = makeState({
        handCards: [permCard],
      });

      const result = processAction(state, {
        type: 'DISCARD_OWNED_CARD',
        card: permCard,
        owner: 'player',
        waitsOverride: 1,
      } as GameAction);

      const inBag = result.state.permanentMagicRecycleBag.find(c => c.id === 'h1');
      expect(inBag).toBeDefined();
      expect((inBag as GameCardData & { _recycleWaits?: number })._recycleWaits).toBe(1);
    });
  });

  describe('Perm 护符栏拖入回收袋路径（ADD_TO_RECYCLE_BAG 直接 dispatch）', () => {
    it('永恒铭刻 amulet (recycleDelay: 2) + waitsOverride: 1 → _recycleWaits === 1', () => {
      const permAmulet = makePermAmulet('a1', 2);
      const state = makeState();

      const result = processAction(state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card: permAmulet,
        waitsOverride: 1,
      } as GameAction);

      const inBag = result.state.permanentMagicRecycleBag.find(c => c.id === 'a1');
      expect(inBag).toBeDefined();
      expect((inBag as GameCardData & { _recycleWaits?: number })._recycleWaits).toBe(1);
    });
  });

  describe('生命周期：1 次瀑流即可回到背包', () => {
    it('waitsOverride: 1 进入回收袋 → 1 次 processRecycleBag 后落回背包', async () => {
      // 直接验证瀑流递减语义：_recycleWaits=1，processRecycleBag 后变成 0 → ready
      // 这里我们手工模拟瀑流的核心循环（来自 cards.ts processRecycleBag）。
      const permCard = makePermMagic('m1', 2);
      const state = makeState();

      const afterRecycle = processAction(state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card: permCard,
        waitsOverride: 1,
      } as GameAction);

      const inBag = afterRecycle.state.permanentMagicRecycleBag.find(c => c.id === 'm1');
      expect((inBag as GameCardData & { _recycleWaits?: number })._recycleWaits).toBe(1);

      // 模拟一次瀑流递减（与 cards.ts processRecycleBag 一致：waits - 1）
      const decrementedWaits =
        ((inBag as GameCardData & { _recycleWaits?: number })._recycleWaits ?? 1) - 1;
      expect(decrementedWaits).toBeLessThanOrEqual(0);
    });

    it('对照：不传 waitsOverride（recycleDelay: 2）→ 1 次瀑流后还需再等 1 次', () => {
      const permCard = makePermMagic('m1', 2);
      const state = makeState();

      const afterRecycle = processAction(state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card: permCard,
      } as GameAction);

      const inBag = afterRecycle.state.permanentMagicRecycleBag.find(c => c.id === 'm1');
      const waits = (inBag as GameCardData & { _recycleWaits?: number })._recycleWaits ?? 1;
      expect(waits).toBe(2);
      // 一次瀑流递减后仍 > 0 → 还要再等
      expect(waits - 1).toBe(1);
    });
  });
});
