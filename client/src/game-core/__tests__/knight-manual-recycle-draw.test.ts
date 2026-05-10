/**
 * 「循手之符」(amulet: `manual-recycle-draw`)
 *
 * 玩家每"手动"拖卡到回收袋累计 +1（每件等装备独立 +1）。累计达 3 张 →
 * 从背包抽 1 张牌；进度归 0（surplus 不滚存，与 积蓄之符 一致）。
 *
 * 仅"手动事件"触发：
 *   - ADD_TO_RECYCLE_BAG 带 `waitsOverride: 1`（装备栏 / 护符栏拖卡）
 *   - DISCARD_OWNED_CARD 带 `forceRecycleBag + waitsOverride: 1` → reducer 透传给
 *     enqueued ADD_TO_RECYCLE_BAG（手牌拖卡）
 *
 * 系统层不算：
 *   - 出牌自动入袋（出 Perm 卡）
 *   - 装备销毁、护符销毁、瀑流溢出
 *   - 「专属召唤」/「汰旧迎新」/「洗册待回」等系统弃手牌
 *
 * 多件叠加跨阈值仍只抽 1 张（单触发模式）。
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

const MANUAL_DRAW_AMULET: GameCardData = {
  id: 'amu-manual-recycle-draw',
  type: 'amulet',
  name: '循手之符',
  value: 1,
  image: '',
  amuletEffect: 'manual-recycle-draw',
} as any;

const MANUAL_DRAW_AMULET_2: GameCardData = {
  ...MANUAL_DRAW_AMULET,
  id: 'amu-manual-recycle-draw-2',
} as any;

const MANUAL_DRAW_AMULET_3: GameCardData = {
  ...MANUAL_DRAW_AMULET,
  id: 'amu-manual-recycle-draw-3',
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

function makePermMagic(id: string, recycleDelay = 2): GameCardData {
  return {
    id,
    type: 'magic',
    name: `Perm-${id}`,
    value: 0,
    image: '',
    magicType: 'permanent',
    recycleDelay,
  } as any;
}

function makeWeapon(id: string): GameCardData {
  return {
    id,
    type: 'weapon',
    name: `Weapon-${id}`,
    value: 1,
    image: '',
    durability: 1,
    maxDurability: 1,
  } as any;
}

describe('循手之符 (amulet: manual-recycle-draw)', () => {
  describe('单件 amulet：每 3 张手动拖入触发抽 1', () => {
    it('第 1、2 次手动拖入只累计进度，不抽牌', () => {
      const card = makePermMagic('m1');
      const state = makeState({
        amuletSlots: [MANUAL_DRAW_AMULET] as any,
        backpackItems: [makeBackpackCard('bp-1'), makeBackpackCard('bp-2')] as any,
      });

      const r1 = processAction(state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card,
        waitsOverride: 1,
      } as GameAction);

      expect(r1.state.manualRecycleProgress).toBe(1);
      expect(r1.state.handCards.length).toBe(0);

      const r2 = processAction(r1.state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card: makePermMagic('m2'),
        waitsOverride: 1,
      } as GameAction);

      expect(r2.state.manualRecycleProgress).toBe(2);
      expect(r2.state.handCards.length).toBe(0);
    });

    it('第 3 次手动拖入触发：从背包抽 1 张牌，进度归 0', () => {
      const state = makeState({
        amuletSlots: [MANUAL_DRAW_AMULET] as any,
        manualRecycleProgress: 2,
        backpackItems: [makeBackpackCard('bp-1')] as any,
      });

      const result = processAction(state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card: makePermMagic('m1'),
        waitsOverride: 1,
      } as GameAction);

      expect(result.state.manualRecycleProgress).toBe(0);
      expect(result.state.handCards.length).toBe(1);
      expect(result.state.handCards[0].id).toBe('bp-1');
      expect(result.state.backpackItems.length).toBe(0);
    });

    it('触发时发出 amulet log', () => {
      const state = makeState({
        amuletSlots: [MANUAL_DRAW_AMULET] as any,
        manualRecycleProgress: 2,
        backpackItems: [makeBackpackCard('bp-1')] as any,
      });

      const result = processAction(state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card: makePermMagic('m1'),
        waitsOverride: 1,
      } as GameAction);

      const log = result.sideEffects.find(
        e =>
          e.event === 'log:entry' &&
          (e.payload as any)?.type === 'amulet' &&
          String((e.payload as any)?.message ?? '').includes('循手之符'),
      );
      expect(log).toBeDefined();
    });

    it('amuletSlots 上的 _counterDisplay 跟随进度刷新', () => {
      const state = makeState({
        amuletSlots: [MANUAL_DRAW_AMULET] as any,
        backpackItems: [makeBackpackCard('bp-1')] as any,
      });

      const r1 = processAction(state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card: makePermMagic('m1'),
        waitsOverride: 1,
      } as GameAction);

      const slot = r1.state.amuletSlots.find(
        s => s?.amuletEffect === 'manual-recycle-draw',
      ) as any;
      expect(slot?._counterDisplay).toBe('1/3');
    });
  });

  describe('系统层路径不计数', () => {
    it('不传 waitsOverride（出牌自动入袋）→ 进度不变', () => {
      const state = makeState({
        amuletSlots: [MANUAL_DRAW_AMULET] as any,
        manualRecycleProgress: 2,
        backpackItems: [makeBackpackCard('bp-1')] as any,
      });

      const result = processAction(state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card: makePermMagic('m1'),
      } as GameAction);

      expect(result.state.manualRecycleProgress).toBe(2);
      expect(result.state.handCards.length).toBe(0);
    });

    it('系统层连续 3 次入袋不触发抽牌', () => {
      let state: GameState = makeState({
        amuletSlots: [MANUAL_DRAW_AMULET] as any,
        backpackItems: [makeBackpackCard('bp-1'), makeBackpackCard('bp-2')] as any,
      });

      for (let i = 1; i <= 3; i++) {
        const r = processAction(state, {
          type: 'ADD_TO_RECYCLE_BAG',
          card: makePermMagic(`sys-${i}`),
        } as GameAction);
        state = r.state;
      }

      expect(state.manualRecycleProgress).toBe(0);
      expect(state.handCards.length).toBe(0);
    });
  });

  describe('多件叠加（每件 +1，跨阈值仍只抽 1）', () => {
    it('2 件装备一次拖入 → 进度 +2', () => {
      const state = makeState({
        amuletSlots: [MANUAL_DRAW_AMULET, MANUAL_DRAW_AMULET_2] as any,
        backpackItems: [makeBackpackCard('bp-1')] as any,
      });

      const result = processAction(state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card: makePermMagic('m1'),
        waitsOverride: 1,
      } as GameAction);

      expect(result.state.manualRecycleProgress).toBe(2);
      expect(result.state.handCards.length).toBe(0);
    });

    it('3 件装备一次拖入 → 立即触发，进度归 0，抽 1 张', () => {
      const state = makeState({
        amuletSlots: [MANUAL_DRAW_AMULET, MANUAL_DRAW_AMULET_2, MANUAL_DRAW_AMULET_3] as any,
        backpackItems: [makeBackpackCard('bp-1'), makeBackpackCard('bp-2')] as any,
      });

      const result = processAction(state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card: makePermMagic('m1'),
        waitsOverride: 1,
      } as GameAction);

      expect(result.state.manualRecycleProgress).toBe(0);
      expect(result.state.handCards.length).toBe(1);
      expect(result.state.backpackItems.length).toBe(1);
    });

    it('2 件装备：进度 = 2 时再 +2 → 跨阈值，仍只抽 1 张（surplus 不滚存）', () => {
      const state = makeState({
        amuletSlots: [MANUAL_DRAW_AMULET, MANUAL_DRAW_AMULET_2] as any,
        manualRecycleProgress: 2,
        backpackItems: [makeBackpackCard('bp-1'), makeBackpackCard('bp-2')] as any,
      });

      const result = processAction(state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card: makePermMagic('m1'),
        waitsOverride: 1,
      } as GameAction);

      expect(result.state.manualRecycleProgress).toBe(0);
      expect(result.state.handCards.length).toBe(1);
      expect(result.state.backpackItems.length).toBe(1);
    });
  });

  describe('手牌路径（DISCARD_OWNED_CARD forceRecycleBag + waitsOverride）', () => {
    it('forceRecycleBag + waitsOverride: 1 透传至 ADD_TO_RECYCLE_BAG → 算手动事件', () => {
      const card = makePermMagic('h1');
      const state = makeState({
        amuletSlots: [MANUAL_DRAW_AMULET] as any,
        handCards: [card] as any,
        manualRecycleProgress: 2,
        backpackItems: [makeBackpackCard('bp-1')] as any,
      });

      const result = processAction(state, {
        type: 'DISCARD_OWNED_CARD',
        card,
        owner: 'player',
        forceRecycleBag: true,
        waitsOverride: 1,
      } as GameAction);

      expect(result.state.manualRecycleProgress).toBe(0);
      expect(result.state.handCards.find(c => c.id === 'bp-1')).toBeDefined();
      expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'h1')).toBeDefined();
    });

    it('forceRecycleBag 但无 waitsOverride（系统层弃手牌）→ 不算手动', () => {
      const card = makePermMagic('h1');
      const state = makeState({
        amuletSlots: [MANUAL_DRAW_AMULET] as any,
        handCards: [card] as any,
        manualRecycleProgress: 2,
        backpackItems: [makeBackpackCard('bp-1')] as any,
      });

      const result = processAction(state, {
        type: 'DISCARD_OWNED_CARD',
        card,
        owner: 'player',
        forceRecycleBag: true,
      } as GameAction);

      // 进度不变（仍是 2），背包卡未被抽到手牌（手牌只剩原来的 h1，没新增 bp-1）
      expect(result.state.manualRecycleProgress).toBe(2);
      expect(result.state.handCards.find(c => c.id === 'bp-1')).toBeUndefined();
      expect(result.state.backpackItems.length).toBe(1);
    });
  });

  describe('与「积蓄之符」共存', () => {
    it('两个 amulet 同时计数（不互相覆盖 _counterDisplay / progress）', () => {
      const RECYCLE_EXPAND: GameCardData = {
        id: 'amu-recycle-expand',
        type: 'amulet',
        name: '积蓄之符',
        value: 0,
        image: '',
        amuletEffect: 'recycle-backpack-expand',
      } as any;

      const state = makeState({
        amuletSlots: [MANUAL_DRAW_AMULET, RECYCLE_EXPAND] as any,
        backpackItems: [makeBackpackCard('bp-1')] as any,
      });

      const result = processAction(state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card: makePermMagic('m1'),
        waitsOverride: 1,
      } as GameAction);

      expect(result.state.manualRecycleProgress).toBe(1);
      expect(result.state.recycleBackpackProgress).toBe(1);

      const manualSlot = result.state.amuletSlots.find(
        s => s?.amuletEffect === 'manual-recycle-draw',
      ) as any;
      const expandSlot = result.state.amuletSlots.find(
        s => s?.amuletEffect === 'recycle-backpack-expand',
      ) as any;
      expect(manualSlot?._counterDisplay).toBe('1/3');
      expect(expandSlot?._counterDisplay).toBe('1/8');
    });
  });

  describe('未装备时不计数', () => {
    it('无 amulet → 进度不变，不抽牌', () => {
      const state = makeState({
        amuletSlots: [null, null, null] as any,
        backpackItems: [makeBackpackCard('bp-1')] as any,
      });

      const result = processAction(state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card: makePermMagic('m1'),
        waitsOverride: 1,
      } as GameAction);

      expect(result.state.manualRecycleProgress).toBe(0);
      expect(result.state.handCards.length).toBe(0);
    });
  });

  describe('背包空时触发不报错（抽 0 张）', () => {
    it('背包为空，触发抽牌时不报错，进度仍归 0', () => {
      const state = makeState({
        amuletSlots: [MANUAL_DRAW_AMULET] as any,
        manualRecycleProgress: 2,
        backpackItems: [] as any,
      });

      const result = processAction(state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card: makePermMagic('m1'),
        waitsOverride: 1,
      } as GameAction);

      expect(result.state.manualRecycleProgress).toBe(0);
      expect(result.state.handCards.length).toBe(0);
    });
  });

  describe('整链：装备/护符栏拖入回收袋路径与手牌拖入路径都触发', () => {
    it('装备槽 → 回收袋（直接 ADD_TO_RECYCLE_BAG with waitsOverride）算手动', () => {
      const weapon = makeWeapon('w1');
      const state = makeState({
        amuletSlots: [MANUAL_DRAW_AMULET] as any,
        equipmentSlot1: { ...weapon, fromSlot: 'equipmentSlot1' } as any,
        manualRecycleProgress: 2,
        backpackItems: [makeBackpackCard('bp-1')] as any,
      });

      const result = processAction(state, {
        type: 'ADD_TO_RECYCLE_BAG',
        card: weapon,
        waitsOverride: 1,
      } as GameAction);

      expect(result.state.manualRecycleProgress).toBe(0);
      expect(result.state.handCards.length).toBe(1);
    });
  });
});
