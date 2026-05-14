/**
 * Regression: 狂战士之怒（berserker-rage）必须「直到下次瀑流」才结束，
 * 而不是在每个 hero 回合 START_TURN 被偷偷清掉。
 *
 * Bug 根因：
 *   `reduceStartTurn`（rules/turn.ts）一度在每个 hero 回合开始时把
 *   `berserkerRageActive: false` 写进 patch。而:
 *     - 卡面（heroMagic.ts:44）写：「直到下次瀑布前，每个Hero回合里
 *       每个武器栏可多攻击一次」
 *     - GAME_MECHANICS.md §14.2 写：「持续到下次瀑流」
 *     - banner（cards.ts reduceApplyBerserkerRage）写：「直到下次瀑布前」
 *     - persistence.ts 把它列为持久化字段（跨存档保留 = 长生命周期）
 *   设计意图明显是「until next waterfall」长生命周期 buff，但 START_TURN
 *   的 reset 把它当成了「per-turn」短生命周期字段——两者矛盾。
 *
 *   后果：玩家激活 狂战 后只在激活当回合享受到额外攻击 + 不消耗耐久，
 *   ENT_TURN → 怪物回合 → START_TURN 之后就全部失效了——即使下个 hero
 *   回合还在战斗中、即使后续开了新战斗。
 *
 * 修复：
 *   1. 移除 `reduceStartTurn` patch 中的 `berserkerRageActive: false`。
 *      `berserkerSlotUsed: {}` 仍保留——它是「per-turn 每栏只能用一次」
 *      短生命周期字段，必须按 hero 回合重置。
 *   2. 把 `berserkerRageActive: false` + `berserkerSlotUsed: {}` 加进
 *      `waterfallResetsPure`（waterfall.ts），与 `unbreakableUntilWaterfall`
 *      同生命周期。
 *
 * 这个 spec 钉死的不变量：
 *   1. 激活 狂战 后 `berserkerRageActive === true`、`berserkerSlotUsed` 空。
 *   2. END_TURN → START_TURN 一轮后 `berserkerRageActive` 仍然 true，
 *      `berserkerSlotUsed` 被清回 `{}`（允许下回合再用 1 次额外攻击）。
 *   3. FINISH_COMBAT 之后（结束当前战斗）`berserkerRageActive` 仍然 true，
 *      跟着玩家进入下一个战斗。
 *   4. TRIGGER_WATERFALL 触发后 `berserkerRageActive === false`、
 *      `berserkerSlotUsed === {}`。
 */
import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { waterfallResetsPure } from '../waterfall';
import type { GameState, GameCardData } from '../types';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeMonster(id: string): GameCardData {
  return {
    id,
    type: 'monster',
    name: 'Goblin',
    value: 30,
    hp: 30,
    maxHp: 30,
    attack: 5,
    currentLayer: 1,
    hpLayers: 1,
    fury: 1,
  } as any;
}

describe('berserker-rage 生命周期：直到下次瀑流', () => {
  it('激活：APPLY_BERSERKER_RAGE 设置 berserkerRageActive=true、berserkerSlotUsed={}', () => {
    const state = makeState();
    const result = reduce(state, { type: 'APPLY_BERSERKER_RAGE', origin: 'gauge' } as any);
    expect(result.state.berserkerRageActive).toBe(true);
    expect(result.state.berserkerSlotUsed).toEqual({});
  });

  it('END_TURN 不重置 berserkerRageActive（buff 保持），但 berserkerSlotUsed 清空（允许下回合再用一次）', () => {
    const monster = makeMonster('m1');
    const state = makeState({
      berserkerRageActive: true,
      berserkerSlotUsed: { equipmentSlot1: true },
      activeCards: [monster, null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [monster.id], currentTurn: 'hero' },
    });
    const result = reduce(state, { type: 'END_TURN', heroTurnLayerLossIds: [] } as any);
    expect(result.state.berserkerRageActive).toBe(true); // ← 关键：buff 必须保留
    expect(result.state.berserkerSlotUsed).toEqual({}); // 每回合 reset 是 OK 的
  });

  it('START_TURN 不重置 berserkerRageActive（这是修复的核心）', () => {
    // 模拟：玩家激活 狂战 后已经过了一个 hero 回合（berserkerSlotUsed 还残留），
    // 现在新的 hero 回合开始 → buff 必须仍然 active，slot 用量必须被清回 {}。
    const state = makeState({
      berserkerRageActive: true,
      berserkerSlotUsed: { equipmentSlot1: true },
    });
    const result = reduce(state, { type: 'START_TURN' });
    expect(result.state.berserkerRageActive).toBe(true); // ← 关键：buff 必须保留
    expect(result.state.berserkerSlotUsed).toEqual({}); // 新回合，每栏的额外攻击重新可用
  });

  it('FINISH_COMBAT（战斗结束）不重置 berserkerRageActive—— buff 跟随玩家进入下一个战斗', () => {
    const state = makeState({
      berserkerRageActive: true,
      berserkerSlotUsed: { equipmentSlot1: true },
      combatState: { ...initialCombatState, engagedMonsterIds: ['some-monster-id'] },
    });
    const result = reduce(state, { type: 'FINISH_COMBAT' } as any);
    expect(result.state.berserkerRageActive).toBe(true); // ← 关键：跨战斗保留
    expect(result.state.berserkerSlotUsed).toEqual({}); // 战斗结束清掉 slot 用量是 OK 的
  });

  it('END_TURN → START_TURN 端到端：buff 在多个 hero 回合间持续生效', () => {
    const monster = makeMonster('m1');
    let state = makeState({
      berserkerRageActive: true,
      berserkerSlotUsed: {},
      activeCards: [monster, null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [monster.id], currentTurn: 'hero' },
    });

    // 模拟玩家用了第一回合的额外攻击：berserkerSlotUsed.equipmentSlot1 = true
    state = { ...state, berserkerSlotUsed: { equipmentSlot1: true } };

    // END_TURN
    state = reduce(state, { type: 'END_TURN', heroTurnLayerLossIds: [] } as any).state;
    expect(state.berserkerRageActive).toBe(true);

    // START_TURN（新的 hero 回合）
    state = reduce(state, { type: 'START_TURN' }).state;
    expect(state.berserkerRageActive).toBe(true); // ← 仍 active
    expect(state.berserkerSlotUsed).toEqual({}); // ← slot 用量重置，可再用 1 次

    // 再走一轮 END_TURN → START_TURN，buff 仍然要保留
    state = { ...state, berserkerSlotUsed: { equipmentSlot1: true, equipmentSlot2: true } };
    state = reduce(state, { type: 'END_TURN', heroTurnLayerLossIds: [] } as any).state;
    state = reduce(state, { type: 'START_TURN' }).state;
    expect(state.berserkerRageActive).toBe(true); // ← 永远保留直到 waterfall
    expect(state.berserkerSlotUsed).toEqual({});
  });

  it('waterfallResetsPure 把 berserkerRageActive 清回 false、berserkerSlotUsed 清回 {}', () => {
    const state = makeState({
      berserkerRageActive: true,
      berserkerSlotUsed: { equipmentSlot1: true, equipmentSlot2: true },
    });
    const patch = waterfallResetsPure(state);
    expect(patch.berserkerRageActive).toBe(false);
    expect(patch.berserkerSlotUsed).toEqual({});
  });

  it('TRIGGER_WATERFALL（端到端）：buff 在 waterfall 时被清掉', () => {
    const monster = makeMonster('preview-m1');
    const previewCards = [monster, null, null, null, null] as any;
    const activeCards = [null, null, null, null, null] as any;

    const state = makeState({
      berserkerRageActive: true,
      berserkerSlotUsed: { equipmentSlot1: true },
      previewCards,
      activeCards,
      remainingDeck: [] as any,
      combatState: { ...initialCombatState, currentTurn: 'hero' },
    });

    const after = reduce(state, { type: 'TRIGGER_WATERFALL' } as any);
    expect(after.state.berserkerRageActive).toBe(false);
    expect(after.state.berserkerSlotUsed).toEqual({});
  });

  it('完整链：激活 → END_TURN → START_TURN（×2）→ TRIGGER_WATERFALL', () => {
    // 端到端覆盖完整生命周期，确保任何中间步骤都不会偷偷重置 buff。
    const monster = makeMonster('m1');
    const previewMonster = makeMonster('preview-m');

    let state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      previewCards: [previewMonster, null, null, null, null] as any,
      remainingDeck: [] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [monster.id], currentTurn: 'hero' },
    });

    // 1. 激活
    state = reduce(state, { type: 'APPLY_BERSERKER_RAGE', origin: 'gauge' } as any).state;
    expect(state.berserkerRageActive).toBe(true);

    // 2. 第 1 个 hero 回合用了 slot1 的额外攻击
    state = { ...state, berserkerSlotUsed: { equipmentSlot1: true } };

    // 3. END_TURN → START_TURN（buff 必须保留）
    state = reduce(state, { type: 'END_TURN', heroTurnLayerLossIds: [] } as any).state;
    state = reduce(state, { type: 'START_TURN' }).state;
    expect(state.berserkerRageActive).toBe(true);
    expect(state.berserkerSlotUsed).toEqual({});

    // 4. 再走一轮（buff 仍要保留）
    state = { ...state, berserkerSlotUsed: { equipmentSlot2: true } };
    state = reduce(state, { type: 'END_TURN', heroTurnLayerLossIds: [] } as any).state;
    state = reduce(state, { type: 'START_TURN' }).state;
    expect(state.berserkerRageActive).toBe(true);

    // 5. 终于触发 waterfall —— buff 现在必须清掉
    state = reduce(state, { type: 'TRIGGER_WATERFALL' } as any).state;
    expect(state.berserkerRageActive).toBe(false);
    expect(state.berserkerSlotUsed).toEqual({});
  });
});
