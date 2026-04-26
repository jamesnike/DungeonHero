/**
 * 永恒护符·回合汲取（`end-turn-draw`）— end-of-hero-turn auto-draw regression.
 *
 * Bug 历史：
 *   - 1.2.2 之前的实现：`useCombatActions.endHeroTurn` hook 自己调
 *     `drawFromBackpackToHand()` 处理 `回合汲取药` 授予的永恒护符。
 *   - 1.2.2 后 `endHeroTurn` 迁移成 `dispatch({ type: 'END_TURN' })`，hook
 *     里那段抽牌代码被删除，但**没有**搬到 `reduceEndTurn` 这边 → 玩家
 *     喝完药完全看不到效果。
 *
 * 修复：在 `reduceEndTurn` 末尾通过 `computeAmuletEffectsForState(state)` 读
 *      `endTurnDrawCount`（>0 时）enqueue 一条 `DRAW_CARDS source: 'backpack'`
 *      （见 `draw-cards-defaults-to-backpack.mdc`）。
 *
 * 这个文件钉死的不变量：
 *   1. 持有永恒护符·回合汲取（在 `eternalRelics`）→ END_TURN 后从背包抽 1 张到手牌。
 *   2. N 件叠加（多张同 effect 的 amulet 永铸 / 或 amulet+relic 混合）→ 抽 N 张。
 *   3. 不持有 → END_TURN 不抽牌。
 *   4. 背包空 / 手牌满 → 不抽（受 `DRAW_CARDS source:'backpack'` reducer 既有
 *      边界覆盖；这里只 sanity check 不抽到鬼牌、不爆 hand limit）。
 *   5. amuletSlots 形态（未永铸）也通过同一路径生效，跟永铸形态行为一致。
 *
 * Phase fixture 要点（参考 `pipeline-input-continuation.mdc`）：
 *   - 必须用 `phase: 'playerInput'` 触发 reducer，而不是默认 `'idle'`
 *     （`'idle'` 不在 `INPUT_PHASES`，drain 行为跟真实游戏不一致）。
 *   - `DRAW_CARDS` 已在 `pipeline.ts isInputContinuation` 白名单里，所以无论
 *     END_TURN 之后 `phase='monsterTurn'` 还是 `phase='playerInput'`（无怪物时）
 *     都会被 drain 处理。
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState, GameCardData } from '../types';
import type { GameAction } from '../actions';
import { initialCombatState, HAND_LIMIT } from '../constants';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    phase: 'playerInput',
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

const END_TURN_DRAW_RELIC = (id: string) => ({
  id: `end-turn-draw-${id}` as any,
  name: '永恒护符·回合汲取',
  description: '每次结束英雄回合时，从背包抽 1 张牌。',
  image: '',
  amuletEffect: 'end-turn-draw' as const,
});

const END_TURN_DRAW_AMULET = (id: string): GameCardData => ({
  id,
  type: 'amulet',
  name: '回合汲取符',
  value: 0,
  image: '',
  amuletEffect: 'end-turn-draw',
} as any);

describe('永恒护符·回合汲取 — END_TURN 自动抽牌', () => {
  it('持有 1 件（在 eternalRelics）→ END_TURN 后从背包抽 1 张到手牌', () => {
    const state = makeState({
      hp: 20,
      eternalRelics: [END_TURN_DRAW_RELIC('1')] as any,
      backpackItems: [FILLER('bp1'), FILLER('bp2')] as any,
      handCards: [],
    });

    const result = drain(state, [
      { type: 'END_TURN', heroTurnLayerLossIds: [] } as GameAction,
    ]);

    expect(result.state.handCards.length).toBe(1);
    expect(result.state.backpackItems.length).toBe(1);
  });

  it('持有 1 件（在 amuletSlots，未永铸）→ END_TURN 后同样抽 1 张', () => {
    const state = makeState({
      hp: 20,
      amuletSlots: [END_TURN_DRAW_AMULET('a1')] as any,
      eternalRelics: [],
      backpackItems: [FILLER('bp1'), FILLER('bp2')] as any,
      handCards: [],
    });

    const result = drain(state, [
      { type: 'END_TURN', heroTurnLayerLossIds: [] } as GameAction,
    ]);

    expect(result.state.handCards.length).toBe(1);
    expect(result.state.backpackItems.length).toBe(1);
  });

  it('叠加 ×2（两件都在 eternalRelics）→ 抽 2 张', () => {
    const state = makeState({
      hp: 20,
      eternalRelics: [END_TURN_DRAW_RELIC('1'), END_TURN_DRAW_RELIC('2')] as any,
      backpackItems: [FILLER('bp1'), FILLER('bp2'), FILLER('bp3')] as any,
      handCards: [],
    });

    const result = drain(state, [
      { type: 'END_TURN', heroTurnLayerLossIds: [] } as GameAction,
    ]);

    expect(result.state.handCards.length).toBe(2);
    expect(result.state.backpackItems.length).toBe(1);
  });

  it('混合（1 件在 amuletSlots + 1 件在 eternalRelics）→ 抽 2 张', () => {
    const state = makeState({
      hp: 20,
      amuletSlots: [END_TURN_DRAW_AMULET('a1')] as any,
      eternalRelics: [END_TURN_DRAW_RELIC('1')] as any,
      backpackItems: [FILLER('bp1'), FILLER('bp2'), FILLER('bp3')] as any,
      handCards: [],
    });

    const result = drain(state, [
      { type: 'END_TURN', heroTurnLayerLossIds: [] } as GameAction,
    ]);

    expect(result.state.handCards.length).toBe(2);
    expect(result.state.backpackItems.length).toBe(1);
  });

  it('不持有 → END_TURN 不抽牌（基线对照）', () => {
    const state = makeState({
      hp: 20,
      eternalRelics: [],
      amuletSlots: [],
      backpackItems: [FILLER('bp1'), FILLER('bp2')] as any,
      handCards: [],
    });

    const result = drain(state, [
      { type: 'END_TURN', heroTurnLayerLossIds: [] } as GameAction,
    ]);

    expect(result.state.handCards.length).toBe(0);
    expect(result.state.backpackItems.length).toBe(2);
  });

  it('背包空 → END_TURN 不抽牌（DRAW_CARDS reducer 边界）', () => {
    const state = makeState({
      hp: 20,
      eternalRelics: [END_TURN_DRAW_RELIC('1')] as any,
      backpackItems: [],
      handCards: [],
    });

    const result = drain(state, [
      { type: 'END_TURN', heroTurnLayerLossIds: [] } as GameAction,
    ]);

    expect(result.state.handCards.length).toBe(0);
    expect(result.state.backpackItems.length).toBe(0);
  });

  it('手牌已满 → END_TURN 不抽牌（受 hand-limit 约束）', () => {
    const fullHand = Array.from({ length: HAND_LIMIT }, (_, i) => FILLER(`h${i}`));
    const state = makeState({
      hp: 20,
      eternalRelics: [END_TURN_DRAW_RELIC('1')] as any,
      backpackItems: [FILLER('bp1'), FILLER('bp2')] as any,
      handCards: fullHand as any,
    });

    const result = drain(state, [
      { type: 'END_TURN', heroTurnLayerLossIds: [] } as GameAction,
    ]);

    expect(result.state.handCards.length).toBe(HAND_LIMIT);
    expect(result.state.backpackItems.length).toBe(2);
  });

  it('战斗中（有 engaged 怪物）→ END_TURN 同样抽牌（draw 排在 monster turn 之前）', () => {
    const monster = {
      id: 'm1',
      type: 'monster' as const,
      name: 'Goblin',
      value: 1,
      hp: 5,
      maxHp: 5,
      attack: 0, // attack=0 → 无 pending block，直接走完 monster turn
      currentLayer: 1,
      fury: 1,
      hpLayers: 1,
    } as any;
    const state = makeState({
      hp: 20,
      eternalRelics: [END_TURN_DRAW_RELIC('1')] as any,
      backpackItems: [FILLER('bp1'), FILLER('bp2')] as any,
      handCards: [],
      activeCards: [monster, null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });

    const result = drain(state, [
      { type: 'END_TURN', heroTurnLayerLossIds: [] } as GameAction,
    ]);

    // 即使后面 phase 切到 monsterTurn / awaitingBlock，DRAW_CARDS 已经在
    // skill float / ADVANCE_MONSTER_TURN 之前 drain 完成。
    expect(result.state.handCards.length).toBe(1);
    expect(result.state.backpackItems.length).toBe(1);
  });
});
