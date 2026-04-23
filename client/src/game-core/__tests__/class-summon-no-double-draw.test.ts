/**
 * Regression: 专属召唤 不能多抽职业卡（曾经的 double-draw bug）
 *
 * 修复前 bug：`finalizeClassSummon` 同时做了两件等价的事：
 *   1. enqueue 一条 DRAW_CLASS_TO_BACKPACK { count: 1 }
 *   2. push 一条 'card:classDrawRequested' side effect
 * 而 useCardPlayHandlers 监听 'card:classDrawRequested' 后会再 dispatch 一次
 * DRAW_CLASS_TO_BACKPACK { count: 1 }。结果每次专属召唤实际抽 2 张职业卡，
 * 玩家观感会随背包剩余空位浮动（可见 0 / 1 / 2 张）：
 *   - 背包剩余 ≥ 2 → 看到 2 张（"弃 2 张得 2 张"）
 *   - 背包剩余 = 1 → 看到 1 张（第二张静默溢出到回收袋）
 *   - 背包剩余 = 0 → 看到 0 张（两张都进回收袋）（"弃 1 张没获得"）
 *
 * 修复：
 *   - 移除 finalizeClassSummon 里多余的 'card:classDrawRequested' side effect
 *   - 移除 useCardPlayHandlers 里对应的监听
 *   - 移除 event-bus.ts 里 'card:classDrawRequested' 的类型声明
 * 抽卡动画走 reduceDrawClassToBackpack 自带的 'cards:classDrawn' side effect。
 *
 * 这个测试只能验证 reducer 端的「enqueue 数量 + side effect 不再发出」。
 * Hook 端的 useGameEvent 监听是 React 层的，不在 vitest reducer 测试覆盖范围；
 * 但只要 'card:classDrawRequested' 不再被 emit、且 GameEventMap 里也删掉了
 * 这个 key，就不可能存在 hook 监听器再触发第二次抽牌——root cause 已被根除。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeClassSummonInstant(id = 'cs-1'): GameCardData {
  return {
    id,
    type: 'magic',
    name: '专属召唤',
    value: 0,
    image: '',
    magicType: 'instant',
    magicEffect: '即时魔法：弃回至多 2 张牌，获得一张职业专属卡。',
  } as GameCardData;
}

function makeClassSummonPermanent(id = 'cs-perm-1'): GameCardData {
  return {
    id,
    type: 'magic',
    name: '专属召唤',
    value: 0,
    image: '',
    magicType: 'permanent',
    magicEffect: '永久魔法：弃回至多 2 张牌，获得一张职业专属卡。',
    recycleDelay: 2,
  } as GameCardData;
}

function makeFiller(id: string, name = `Filler-${id}`): GameCardData {
  return { id, type: 'magic', name, value: 0, image: '' } as GameCardData;
}

function makeKnightTemplate(id: string, name: string): GameCardData {
  return { id, type: 'magic', name, value: 0, image: '' } as GameCardData;
}

describe('专属召唤：不能多抽职业卡（double-draw 回归）', () => {
  it('auto 路径（弃 1 张可弃手牌）：仅获得 1 张职业卡，且不再 emit card:classDrawRequested', () => {
    const cs = makeClassSummonInstant();
    const filler = makeFiller('f1');
    const tmpl = makeKnightTemplate('knight-test-1', 'TestKnightCard');
    const state = makeState({
      handCards: [cs, filler],
      backpackItems: [],
      classDeck: [tmpl] as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: cs.id } as GameAction]);

    // 弃 1 张（filler 进坟场）
    expect(result.state.discardedCards.find(c => c.id === 'f1')).toBeDefined();

    // 关键断言：仅 1 张职业卡进背包（修复前是 2 张，或 1 张 + 1 张溢出到回收袋）
    expect(result.state.backpackItems).toHaveLength(1);
    expect(result.state.backpackItems[0].name).toBe('TestKnightCard');

    // 关键断言：不再 emit 已被废弃的 'card:classDrawRequested' side effect
    const hasOldEvent = result.sideEffects.some(
      se => (se as any).event === 'card:classDrawRequested',
    );
    expect(hasOldEvent).toBe(false);
  });

  it('auto 路径（手牌只剩专属召唤本身，弃 0 张）：仍然只获得 1 张职业卡', () => {
    const cs = makeClassSummonInstant();
    const tmpl = makeKnightTemplate('knight-test-2', 'TestKnightCard');
    const state = makeState({
      handCards: [cs],
      backpackItems: [],
      classDeck: [tmpl] as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: cs.id } as GameAction]);

    expect(result.state.backpackItems).toHaveLength(1);
    expect(result.state.backpackItems[0].name).toBe('TestKnightCard');

    const hasOldEvent = result.sideEffects.some(
      se => (se as any).event === 'card:classDrawRequested',
    );
    expect(hasOldEvent).toBe(false);
  });

  it('modal 路径（弃 2 张）：仅获得 1 张职业卡，且不再 emit card:classDrawRequested', () => {
    const cs = makeClassSummonInstant();
    const f1 = makeFiller('f1');
    const f2 = makeFiller('f2');
    const tmpl = makeKnightTemplate('knight-test-3', 'TestKnightCard');
    const state = makeState({
      handCards: [cs, f1, f2],
      backpackItems: [],
      classDeck: [tmpl] as any,
    });

    // ≥ 2 张可弃手牌 → 弹出 modal
    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: cs.id } as GameAction]);
    expect(r1.state.pendingHandDiscardSelection).not.toBeNull();
    expect(r1.state.pendingHandDiscardSelection!.subEffect).toBe('class-summon');

    // 玩家选 2 张确认弃回
    const r2 = drain(r1.state, [
      { type: 'RESOLVE_HAND_DISCARD_SELECTION', cardIds: ['f1', 'f2'] } as GameAction,
    ]);

    // 关键断言：仅 1 张职业卡进背包
    expect(r2.state.backpackItems).toHaveLength(1);
    expect(r2.state.backpackItems[0].name).toBe('TestKnightCard');

    // 不再 emit 已被废弃的 side effect
    const hasOldEvent = r2.sideEffects.some(
      se => (se as any).event === 'card:classDrawRequested',
    );
    expect(hasOldEvent).toBe(false);
  });

  it('permanent 升级版 modal 路径：仅获得 1 张职业卡', () => {
    const cs = makeClassSummonPermanent();
    const f1 = makeFiller('f1');
    const f2 = makeFiller('f2');
    const tmpl = makeKnightTemplate('knight-test-4', 'TestKnightCard');
    const state = makeState({
      handCards: [cs, f1, f2],
      backpackItems: [],
      classDeck: [tmpl] as any,
    });

    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: cs.id } as GameAction]);
    expect(r1.state.pendingHandDiscardSelection).not.toBeNull();

    const r2 = drain(r1.state, [
      { type: 'RESOLVE_HAND_DISCARD_SELECTION', cardIds: ['f1', 'f2'] } as GameAction,
    ]);

    expect(r2.state.backpackItems).toHaveLength(1);
    expect(r2.state.backpackItems[0].name).toBe('TestKnightCard');

    const hasOldEvent = r2.sideEffects.some(
      se => (se as any).event === 'card:classDrawRequested',
    );
    expect(hasOldEvent).toBe(false);
  });

  it('背包接近满时（剩 1 空位）：仅 1 张职业卡进背包，不会因 double-draw 把第 2 张溢出到回收袋', () => {
    const cs = makeClassSummonInstant();
    const f1 = makeFiller('f1');
    const tmpl = makeKnightTemplate('knight-test-5', 'TestKnightCard');
    // 背包容量默认 ≥ 6，填 5 张让剩余空位 = 1
    const fillers = Array.from({ length: 5 }, (_, i) =>
      makeFiller(`bp-${i}`, `BP${i}`),
    );
    const state = makeState({
      handCards: [cs, f1],
      backpackItems: fillers,
      classDeck: [tmpl] as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: cs.id } as GameAction]);

    // 修复前：double-draw 会让 1 张进背包 + 1 张溢出到回收袋
    // 修复后：只有 1 张进背包，回收袋不应有 TestKnightCard
    expect(result.state.backpackItems.filter(c => c.name === 'TestKnightCard')).toHaveLength(1);
    expect(
      result.state.permanentMagicRecycleBag.filter(c => c.name === 'TestKnightCard'),
    ).toHaveLength(0);
  });
});
