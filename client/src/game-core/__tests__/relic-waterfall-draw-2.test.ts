/**
 * 永恒护符·瀑流汲取（waterfall-draw-2）：每次瀑流推进时，从背包抽 2 张牌。
 *
 * 关键不变量：
 * - 抽牌走 backpack（与 `.cursor/rules/draw-cards-defaults-to-backpack.mdc` 一致）。
 * - 抽到的卡名写入 log（玩家可看到具体抽了什么）。
 * - 没装备此护符时不抽牌、不写 log。
 * - 回收袋当波恢复的卡这一波就能被抽到（与 `recycle-shuffle` 起始护符联动）。
 * - 背包不足/手牌满时不报错、走 fallback log。
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { getEternalRelic } from '@/lib/eternalRelics';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeBackpackCard(i: number, name?: string): GameCardData {
  return {
    id: `bp-${i}`,
    type: 'magic',
    name: name ?? `测试卡 ${i}`,
    value: 1,
  };
}

function getLogMessages(sideEffects: ReadonlyArray<{ event: string; payload: unknown }>): string[] {
  return sideEffects
    .filter(e => e.event === 'log:entry')
    .map(e => (e.payload as { message: string }).message);
}

describe('永恒护符·瀑流汲取 (waterfall-draw-2)', () => {
  it('真的把 2 张牌从背包搬到手牌（同一 reduce step 内）', () => {
    const state = makeState({
      eternalRelics: [getEternalRelic('waterfall-draw-2')],
      backpackItems: [
        makeBackpackCard(1, '火球术'),
        makeBackpackCard(2, '冰锥术'),
        makeBackpackCard(3, '闪电链'),
      ],
      handCards: [],
    });

    const result = reduce(state, { type: 'APPLY_WATERFALL_EFFECTS' });

    expect(result.state.handCards.length).toBe(2);
    expect(result.state.backpackItems.length).toBe(1);
  });

  it('log 里包含「永恒护符·瀑流汲取」前缀和具体卡名', () => {
    const state = makeState({
      eternalRelics: [getEternalRelic('waterfall-draw-2')],
      backpackItems: [
        makeBackpackCard(1, '火球术'),
        makeBackpackCard(2, '冰锥术'),
      ],
      handCards: [],
    });

    const result = reduce(state, { type: 'APPLY_WATERFALL_EFFECTS' });
    const logs = getLogMessages(result.sideEffects ?? []);

    const drawLog = logs.find(m => m.includes('永恒护符·瀑流汲取'));
    expect(drawLog).toBeDefined();
    // 实际抽到的两张卡（背包只有这两张，必然全抽中）
    expect(drawLog).toContain('火球术');
    expect(drawLog).toContain('冰锥术');
  });

  it('为每张抽到的卡 emit 一条 card:drawnToHand 事件（UI 动画用）', () => {
    const state = makeState({
      eternalRelics: [getEternalRelic('waterfall-draw-2')],
      backpackItems: [makeBackpackCard(1), makeBackpackCard(2), makeBackpackCard(3)],
      handCards: [],
    });

    const result = reduce(state, { type: 'APPLY_WATERFALL_EFFECTS' });
    const drawnEvents = (result.sideEffects ?? []).filter(e => e.event === 'card:drawnToHand');

    expect(drawnEvents).toHaveLength(2);
    for (const evt of drawnEvents) {
      expect((evt.payload as { source: string }).source).toBe('backpack');
    }
  });

  it('未持有此护符时既不抽牌也不写 log', () => {
    const state = makeState({
      eternalRelics: [],
      backpackItems: [makeBackpackCard(1), makeBackpackCard(2)],
      handCards: [],
    });

    const result = reduce(state, { type: 'APPLY_WATERFALL_EFFECTS' });
    const logs = getLogMessages(result.sideEffects ?? []);

    expect(result.state.handCards.length).toBe(0);
    expect(result.state.backpackItems.length).toBe(2);
    expect(logs.find(m => m.includes('永恒护符·瀑流汲取'))).toBeUndefined();
  });

  it('背包为空时 emit fallback log，不报错', () => {
    const state = makeState({
      eternalRelics: [getEternalRelic('waterfall-draw-2')],
      backpackItems: [],
      handCards: [],
    });

    const result = reduce(state, { type: 'APPLY_WATERFALL_EFFECTS' });
    const logs = getLogMessages(result.sideEffects ?? []);

    expect(result.state.handCards.length).toBe(0);
    expect(logs.find(m => m.includes('背包无可抽卡'))).toBeDefined();
  });

  it('背包仅 1 张时也只写 1 张的 log（fallback 不触发）', () => {
    const state = makeState({
      eternalRelics: [getEternalRelic('waterfall-draw-2')],
      backpackItems: [makeBackpackCard(1, '独苗卡')],
      handCards: [],
    });

    const result = reduce(state, { type: 'APPLY_WATERFALL_EFFECTS' });
    const logs = getLogMessages(result.sideEffects ?? []);

    expect(result.state.handCards.length).toBe(1);
    const drawLog = logs.find(m => m.includes('永恒护符·瀑流汲取'));
    expect(drawLog).toBeDefined();
    expect(drawLog).toContain('独苗卡');
    expect(drawLog).toContain('1 张');
  });

  it('回收袋当波恢复的卡这一波就能被抽到（与 recycle-shuffle 联动）', () => {
    // 模拟：背包空，回收袋里有 1 张已就绪（_recycleWaits=1）的卡。
    // 走 APPLY_WATERFALL_EFFECTS：recycle bag tick 把它放回背包，然后
    // waterfall-draw-2 应能立刻把它抽到手牌。
    const restoredCard: GameCardData = {
      id: 'recycled-1',
      type: 'magic',
      name: '复返之卡',
      value: 1,
      magicType: 'permanent',
      recycleDelay: 1,
      _recycleWaits: 1,
    };

    const state = makeState({
      eternalRelics: [getEternalRelic('waterfall-draw-2')],
      backpackItems: [],
      handCards: [],
      permanentMagicRecycleBag: [restoredCard],
    });

    const result = reduce(state, { type: 'APPLY_WATERFALL_EFFECTS' });
    const logs = getLogMessages(result.sideEffects ?? []);

    expect(result.state.handCards.map(c => c.id)).toContain('recycled-1');
    const drawLog = logs.find(m => m.includes('永恒护符·瀑流汲取'));
    expect(drawLog).toContain('复返之卡');
  });
});
