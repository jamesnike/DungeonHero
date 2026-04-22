/**
 * Regression: 自动销毁 / 转化 amulet 时的 Perm 路由
 *
 * 历史 bug：以下四个路径直接把所有 amulet 推进 graveyard，
 * 不区分是否 Perm（永恒铭刻 设的 `recycleDelay > 0` / native `permEquipment` /
 * 其它 cardHasPermFlag 条件）：
 *
 *   1. waterfall.ts: `destroyAllAmuletsAndDiscardHand`（诅咒骰局 被挤出时摧毁所有护符）
 *   2. events.ts: `amuletCapacity-1`（事件降低护符栏上限，溢出的旧护符）
 *   3. events.ts: `amuletsToGold+10`（事件「护符换金币」）
 *   4. cards.ts:  `CONVERT_AMULETS_TO_GOLD`（系统/技能「护符转化为金币」）
 *
 * 修复契约（与 events.ts:removeAllAmulets 已有契约一致）：
 *   - cardHasPermFlag(amulet) === true → ADD_TO_RECYCLE_BAG
 *   - 其它 amulet → graveyard
 *   - permStripped: true 视为非 Perm（凡化咒契约）
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { GameAction } from '../actions';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeAmulet(id: string, over?: Partial<GameCardData>): GameCardData {
  return {
    id,
    type: 'amulet',
    name: `Amulet-${id}`,
    value: 5,
    image: '',
    amuletEffect: 'stun-rate-boost' as any,
    ...(over ?? {}),
  } as GameCardData;
}

const permAmulet = (id: string) => makeAmulet(id, { recycleDelay: 2 });

// ---------------------------------------------------------------------------
// 1. 诅咒骰局 (destroyAllAmuletsAndDiscardHand)
// ---------------------------------------------------------------------------

describe('诅咒骰局 destroyAllAmuletsAndDiscardHand — Perm 护符进回收袋', () => {
  it('Perm amulet (recycleDelay=2) 进回收袋；普通 amulet 进坟场', () => {
    const discardCard: any = {
      id: 'curse-dice-1',
      type: 'event',
      name: '诅咒骰局',
      value: 0,
      waterfallEffect: { type: 'destroyAllAmuletsAndDiscardHand', amount: 0 },
    };
    const perm = permAmulet('amu-perm');
    const plain = makeAmulet('amu-plain');
    const state = makeState({
      amuletSlots: [perm, plain] as any,
      handCards: [],
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const result = drain(state, [
      { type: 'APPLY_WATERFALL_DISCARD_EFFECTS', discardCard, nextRemainingDeck: [] } as GameAction,
    ]);

    expect(result.state.amuletSlots).toHaveLength(0);
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'amu-perm')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'amu-perm')).toBeUndefined();
    expect(result.state.discardedCards.find(c => c.id === 'amu-plain')).toBeDefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'amu-plain')).toBeUndefined();
  });

  it('两枚 Perm amulet 都进回收袋', () => {
    const discardCard: any = {
      id: 'curse-dice-1',
      type: 'event',
      name: '诅咒骰局',
      value: 0,
      waterfallEffect: { type: 'destroyAllAmuletsAndDiscardHand', amount: 0 },
    };
    const state = makeState({
      amuletSlots: [permAmulet('p1'), permAmulet('p2')] as any,
      handCards: [],
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const result = drain(state, [
      { type: 'APPLY_WATERFALL_DISCARD_EFFECTS', discardCard, nextRemainingDeck: [] } as GameAction,
    ]);

    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'p1')).toBeDefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'p2')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'p1')).toBeUndefined();
    expect(result.state.discardedCards.find(c => c.id === 'p2')).toBeUndefined();
  });

  it('permStripped 的 amulet 即使带 recycleDelay 也算非 Perm，进坟场', () => {
    const discardCard: any = {
      id: 'curse-dice-1',
      type: 'event',
      name: '诅咒骰局',
      value: 0,
      waterfallEffect: { type: 'destroyAllAmuletsAndDiscardHand', amount: 0 },
    };
    const stripped = makeAmulet('amu-stripped', { recycleDelay: 2, permStripped: true } as any);
    const state = makeState({
      amuletSlots: [stripped] as any,
      handCards: [],
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const result = drain(state, [
      { type: 'APPLY_WATERFALL_DISCARD_EFFECTS', discardCard, nextRemainingDeck: [] } as GameAction,
    ]);

    expect(result.state.discardedCards.find(c => c.id === 'amu-stripped')).toBeDefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'amu-stripped')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. amuletCapacity-1 溢出
// ---------------------------------------------------------------------------

describe('amuletCapacity-1 溢出 — Perm 护符进回收袋', () => {
  it('护符栏上限 -1，最旧的 Perm amulet 被挤出 → 进回收袋', () => {
    const perm = permAmulet('amu-perm-old');
    const plain = makeAmulet('amu-plain-new');
    const state = makeState({
      maxAmuletSlots: 2,
      amuletSlots: [perm, plain] as any, // 最旧 = index 0
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const result = drain(state, [
      { type: 'APPLY_EVENT_EFFECT', token: 'amuletCapacity-1' } as GameAction,
    ]);

    expect(result.state.maxAmuletSlots).toBe(1);
    expect(result.state.amuletSlots.find(a => a?.id === 'amu-plain-new')).toBeDefined();
    expect(result.state.amuletSlots.find(a => a?.id === 'amu-perm-old')).toBeUndefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'amu-perm-old')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'amu-perm-old')).toBeUndefined();
  });

  it('护符栏上限 -1，最旧普通 amulet 被挤出 → 进坟场（不进回收袋）', () => {
    const plain = makeAmulet('amu-plain-old');
    const keeper = makeAmulet('amu-keep');
    const state = makeState({
      maxAmuletSlots: 2,
      amuletSlots: [plain, keeper] as any,
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const result = drain(state, [
      { type: 'APPLY_EVENT_EFFECT', token: 'amuletCapacity-1' } as GameAction,
    ]);

    expect(result.state.maxAmuletSlots).toBe(1);
    expect(result.state.amuletSlots.find(a => a?.id === 'amu-keep')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'amu-plain-old')).toBeDefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'amu-plain-old')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. amuletsToGold+10 (event token)
// ---------------------------------------------------------------------------

describe('amuletsToGold+10 — Perm 护符进回收袋', () => {
  it('1 Perm + 1 普通 → 普通进坟场，Perm 进回收袋，金币照付', () => {
    const perm = permAmulet('amu-perm');
    const plain = makeAmulet('amu-plain');
    const state = makeState({
      amuletSlots: [perm, plain] as any,
      gold: 10,
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const result = drain(state, [
      { type: 'APPLY_EVENT_EFFECT', token: 'amuletsToGold+10' } as GameAction,
    ]);

    expect(result.state.gold).toBe(10 + 10 * 2);
    expect(result.state.amuletSlots).toHaveLength(0);
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'amu-perm')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'amu-plain')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'amu-perm')).toBeUndefined();
  });

  it('全部 Perm → 全部进回收袋', () => {
    const state = makeState({
      amuletSlots: [permAmulet('p1'), permAmulet('p2')] as any,
      gold: 0,
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const result = drain(state, [
      { type: 'APPLY_EVENT_EFFECT', token: 'amuletsToGold+10' } as GameAction,
    ]);

    expect(result.state.gold).toBe(20);
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'p1')).toBeDefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'p2')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'p1')).toBeUndefined();
    expect(result.state.discardedCards.find(c => c.id === 'p2')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. CONVERT_AMULETS_TO_GOLD (system action)
// ---------------------------------------------------------------------------

describe('CONVERT_AMULETS_TO_GOLD — Perm 护符进回收袋', () => {
  it('1 Perm + 1 普通 → 普通进坟场，Perm 进回收袋', () => {
    const perm = permAmulet('amu-perm');
    const plain = makeAmulet('amu-plain');
    const state = makeState({
      amuletSlots: [perm, plain] as any,
      gold: 0,
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const result = drain(state, [
      { type: 'CONVERT_AMULETS_TO_GOLD', amountPer: 8 } as GameAction,
    ]);

    expect(result.state.gold).toBe(16);
    expect(result.state.amuletSlots).toHaveLength(0);
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'amu-perm')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'amu-plain')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'amu-perm')).toBeUndefined();
  });

  it('全部 Perm → 全部进回收袋（不进坟场）', () => {
    const state = makeState({
      amuletSlots: [permAmulet('p1'), permAmulet('p2')] as any,
      gold: 5,
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const result = drain(state, [
      { type: 'CONVERT_AMULETS_TO_GOLD', amountPer: 5 } as GameAction,
    ]);

    expect(result.state.gold).toBe(15);
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'p1')).toBeDefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'p2')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'p1')).toBeUndefined();
    expect(result.state.discardedCards.find(c => c.id === 'p2')).toBeUndefined();
  });

  it('空护符栏 → no-op', () => {
    const state = makeState({
      amuletSlots: [] as any,
      gold: 100,
    });
    const r = reduce(state, { type: 'CONVERT_AMULETS_TO_GOLD', amountPer: 10 } as GameAction);
    expect(r.state.gold).toBe(100);
  });
});
