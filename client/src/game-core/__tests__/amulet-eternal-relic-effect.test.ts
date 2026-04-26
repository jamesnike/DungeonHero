/**
 * 永恒护符携带 amuletEffect → 效果必须继续生效（regression）
 *
 * Bug 起因：
 *   - 玩家用「护符永铸药」（potionEffect: 'amulet-to-eternal-relic'）把
 *     「赎血召牌符」（amuletEffect: 'self-damage-draw'）转换成永恒护符。
 *   - 转换 reducer 把 amulet 从 `amuletSlots` 移除，新建一条 `EternalRelic`
 *     塞进 `state.eternalRelics`，并保留 `amuletEffect` / `amuletAuraBonus`。
 *   - 但所有 reducer 路径都只调 `computeAmuletEffects(state.amuletSlots)`，
 *     没把 eternalRelics 上的 amuletEffect 折叠进来 → 转换后效果完全失效。
 *
 * 修复：
 *   - 引入 `computeAmuletEffectsForState(state)`，内部自动把
 *     `eternalRelics.filter(r => r.amuletEffect)` 转成 amulet card shape
 *     合并进 `computeAmuletEffects` 的 list。所有 reducer 调用方统一切换。
 *
 * 这个文件钉死的不变量：
 *   - 任何带 `amuletEffect` 的 `EternalRelic` 在 reducer 里跟 `amuletSlots`
 *     里同 effect 的 amulet **行为完全一致**（叠加 / 触发条件 / 受手牌上限约束）。
 *
 * 以「赎血召牌符」(self-damage-draw) 作为代表被试：它走 `reduceApplyDamage`
 * 入口的完整 amuletEffects 链路，是这次 bug 最容易复现的路径。其它 amulet
 * 走相同的 `computeAmuletEffectsForState`，行为一致由这条统一替换保证。
 *
 * 配套 `amulet-self-damage-draw.test.ts`：那个文件覆盖 amulet 在 amuletSlots
 * 里的所有 case（基本触发、N=2、护盾抵消、空背包、手牌上限等），这里只复现
 * 「卡在 eternalRelics 里」一组关键 case 来 pin 永恒护符路径。
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState, GameCardData } from '../types';
import { initialCombatState, HAND_LIMIT } from '../constants';
import { computeAmuletEffectsForState } from '../equipment';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    ...overrides,
  };
}

const FILLER = (id: string): GameCardData => ({
  id,
  type: 'magic',
  name: 'Filler',
  value: 0,
  image: '',
} as any);

const SDD_RELIC = (id: string) => ({
  id: `amulet-eternal-${id}` as any,
  name: '永恒·赎血召牌符',
  description: '永久生效：每次自伤抽 1 张牌',
  image: '',
  amuletEffect: 'self-damage-draw' as const,
});

describe('永恒护符携带 amuletEffect — 效果必须继续生效', () => {
  describe('computeAmuletEffectsForState merges eternal relic amuletEffect', () => {
    it('relic 在 eternalRelics（amuletSlots 为空）→ selfDamageDrawCount = 1', () => {
      const state = makeState({
        amuletSlots: [],
        eternalRelics: [SDD_RELIC('1')] as any,
      });
      const fx = computeAmuletEffectsForState(state);
      expect(fx.selfDamageDrawCount).toBe(1);
    });

    it('1 件在 amuletSlots + 1 件在 eternalRelics → selfDamageDrawCount = 2', () => {
      const state = makeState({
        amuletSlots: [{
          id: 'a-in-slot',
          type: 'amulet',
          name: '赎血召牌符',
          value: 0,
          image: '',
          amuletEffect: 'self-damage-draw',
        }] as any,
        eternalRelics: [SDD_RELIC('relic1')] as any,
      });
      const fx = computeAmuletEffectsForState(state);
      expect(fx.selfDamageDrawCount).toBe(2);
    });

    it('relic 没有 amuletEffect（普通 relic）→ 不影响 amuletEffects', () => {
      const state = makeState({
        amuletSlots: [],
        eternalRelics: [{
          id: 'waterfall-heal',
          name: '瀑流愈疗',
          description: '',
          image: '',
        }] as any,
      });
      const fx = computeAmuletEffectsForState(state);
      expect(fx.selfDamageDrawCount).toBe(0);
    });
  });

  describe('e2e: relic 上的 self-damage-draw 通过 APPLY_DAMAGE 实际触发', () => {
    it('赎血召牌符（已永铸 → 在 eternalRelics）→ 自伤 3 点抽 1 张牌', () => {
      const backpack = [FILLER('bp1'), FILLER('bp2'), FILLER('bp3')];
      const state = makeState({
        hp: 20,
        amuletSlots: [],
        eternalRelics: [SDD_RELIC('1')] as any,
        backpackItems: backpack as any,
        handCards: [],
      });

      const result = drain(state, [
        { type: 'APPLY_DAMAGE', amount: 3, source: 'test', selfInflicted: true } as any,
      ]);

      expect(result.state.hp).toBe(17);
      expect(result.state.handCards.length).toBe(1);
      expect(result.state.backpackItems.length).toBe(2);
    });

    it('叠加 ×2（两件都在 eternalRelics）→ 一次自伤抽 2 张', () => {
      const backpack = [FILLER('bp1'), FILLER('bp2'), FILLER('bp3'), FILLER('bp4')];
      const state = makeState({
        hp: 20,
        amuletSlots: [],
        eternalRelics: [SDD_RELIC('1'), SDD_RELIC('2')] as any,
        backpackItems: backpack as any,
        handCards: [],
      });

      const result = drain(state, [
        { type: 'APPLY_DAMAGE', amount: 2, source: 'test', selfInflicted: true } as any,
      ]);

      expect(result.state.hp).toBe(18);
      expect(result.state.handCards.length).toBe(2);
      expect(result.state.backpackItems.length).toBe(2);
    });

    it('混合（1 件在 amuletSlots + 1 件在 eternalRelics）→ 一次自伤抽 2 张', () => {
      const backpack = [FILLER('bp1'), FILLER('bp2'), FILLER('bp3')];
      const state = makeState({
        hp: 20,
        amuletSlots: [{
          id: 'a-in-slot',
          type: 'amulet',
          name: '赎血召牌符',
          value: 0,
          image: '',
          amuletEffect: 'self-damage-draw',
        }] as any,
        eternalRelics: [SDD_RELIC('1')] as any,
        backpackItems: backpack as any,
        handCards: [],
      });

      const result = drain(state, [
        { type: 'APPLY_DAMAGE', amount: 2, source: 'test', selfInflicted: true } as any,
      ]);

      expect(result.state.hp).toBe(18);
      expect(result.state.handCards.length).toBe(2);
      expect(result.state.backpackItems.length).toBe(1);
    });

    it('护盾完全抵消时不触发（appliedDamage = 0）— relic 路径同样满足', () => {
      const backpack = [FILLER('bp1'), FILLER('bp2')];
      const state = makeState({
        hp: 20,
        tempShield: 5,
        amuletSlots: [],
        eternalRelics: [SDD_RELIC('1')] as any,
        backpackItems: backpack as any,
        handCards: [],
      });

      const result = drain(state, [
        { type: 'APPLY_DAMAGE', amount: 3, source: 'test', selfInflicted: true } as any,
      ]);

      expect(result.state.hp).toBe(20);
      expect(result.state.tempShield).toBe(2);
      expect(result.state.handCards.length).toBe(0);
      expect(result.state.backpackItems.length).toBe(2);
    });

    it('非 selfInflicted（怪物攻击）不触发 — relic 路径同样满足', () => {
      const backpack = [FILLER('bp1'), FILLER('bp2')];
      const state = makeState({
        hp: 20,
        amuletSlots: [],
        eternalRelics: [SDD_RELIC('1')] as any,
        backpackItems: backpack as any,
        handCards: [],
      });

      const result = drain(state, [
        { type: 'APPLY_DAMAGE', amount: 3, source: 'monster', selfInflicted: false } as any,
      ]);

      expect(result.state.hp).toBe(17);
      expect(result.state.handCards.length).toBe(0);
      expect(result.state.backpackItems.length).toBe(2);
    });

    it('受手牌上限约束 — 已满则抽不出来（relic 路径）', () => {
      const backpack = [FILLER('bp1'), FILLER('bp2')];
      const fullHand = Array.from({ length: HAND_LIMIT }, (_, i) => FILLER(`h${i}`));
      const state = makeState({
        hp: 20,
        amuletSlots: [],
        eternalRelics: [SDD_RELIC('1'), SDD_RELIC('2')] as any,
        backpackItems: backpack as any,
        handCards: fullHand as any,
      });

      const result = drain(state, [
        { type: 'APPLY_DAMAGE', amount: 3, source: 'test', selfInflicted: true } as any,
      ]);

      expect(result.state.hp).toBe(17);
      expect(result.state.handCards.length).toBe(HAND_LIMIT);
      expect(result.state.backpackItems.length).toBe(2);
    });
  });

  describe('e2e: 端到端模拟「护符永铸药」转换路径', () => {
    it('转换前 amuletSlots 有效 → 转换后 eternalRelics 同样有效（行为一致）', () => {
      const backpack = [FILLER('bp1'), FILLER('bp2'), FILLER('bp3'), FILLER('bp4')];

      // 阶段 1：amulet 还在 amuletSlots 里 — 自伤抽 1 张
      const beforeState = makeState({
        hp: 20,
        amuletSlots: [{
          id: 'a1',
          type: 'amulet',
          name: '赎血召牌符',
          value: 0,
          image: '',
          amuletEffect: 'self-damage-draw',
        }] as any,
        eternalRelics: [],
        backpackItems: [...backpack] as any,
        handCards: [],
      });
      const beforeResult = drain(beforeState, [
        { type: 'APPLY_DAMAGE', amount: 2, source: 'test', selfInflicted: true } as any,
      ]);
      expect(beforeResult.state.handCards.length).toBe(1);

      // 阶段 2：模拟「护符永铸药」转换 — amulet 从 slots 移到 eternalRelics
      const afterConvertState = makeState({
        hp: 20,
        amuletSlots: [],
        eternalRelics: [{
          id: 'amulet-eternal-converted-1',
          name: '永恒·赎血召牌符',
          description: '',
          image: '',
          amuletEffect: 'self-damage-draw',
        }] as any,
        backpackItems: [...backpack] as any,
        handCards: [],
      });
      const afterResult = drain(afterConvertState, [
        { type: 'APPLY_DAMAGE', amount: 2, source: 'test', selfInflicted: true } as any,
      ]);

      // 关键不变量：行为完全一致 — 抽牌数量、HP 变化都跟转换前一样
      expect(afterResult.state.handCards.length).toBe(beforeResult.state.handCards.length);
      expect(afterResult.state.hp).toBe(beforeResult.state.hp);
      expect(afterResult.state.backpackItems.length).toBe(beforeResult.state.backpackItems.length);
    });
  });
});
