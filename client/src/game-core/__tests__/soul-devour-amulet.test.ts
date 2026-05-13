/**
 * 灵魂吞噬 (`soul-devour`) — e2e tests.
 *
 * Trigger contract（设计参数 — 跟 user 在 ask-mode 阶段确认过）:
 *   - 任何 APPLY_DAMAGE 动作 result.appliedDamage > 0（即 HP 实际减少）
 *     都触发 `combat:ghostBladeExile` payload `{ source: 'amulet', sourceLabel: '灵魂吞噬' }`。
 *   - 完美格挡（怪物攻击未走到 APPLY_DAMAGE）/ rawDamage===0 / tempShield 全收 /
 *     不灭守护抵消 等 appliedDamage===0 场景天然不触发。
 *   - selfInflicted 与否都触发（玩家自伤、怪物攻击溢出、事件骰扣血、护符自伤
 *     都覆盖 —— 设计上不区分来源）。
 *   - 没装备护符不触发。
 *   - 触发频率无限制（每次 APPLY_DAMAGE 都触发，跟虚灵刀「每次攻击都触发」对齐）。
 *
 * 注：这里仅测 reducer 层 emit 行为；从 emit 到弹窗 → 玩家选择 → 卡入
 * `ghostBladeExileCards` 的链路由 `useShopHandlers.triggerGhostBladeExile` +
 * `BEGIN_GHOST_BLADE_EXILE` reducer 处理（已经被「虚灵刀」实测覆盖，靠
 * payload 类型 + sourceLabel 保证两种 source 复用同一条流程）。
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState, GameCardData } from '../types';
import { initialCombatState } from '../constants';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    // INPUT_PHASES 下 isInputContinuation 才生效；测真实游戏行为请显式设
    // 'playerInput'（参考 pipeline-input-continuation.mdc）。
    phase: 'playerInput' as GameState['phase'],
    ...overrides,
  };
}

const SOUL_DEVOUR = (id: string): GameCardData => ({
  id,
  type: 'amulet',
  name: '灵魂吞噬',
  value: 1,
  image: '',
  amuletEffect: 'soul-devour',
  classCard: true,
  unique: true,
} as any);

function findGhostBladeEmits(sideEffects: ReadonlyArray<any>) {
  return sideEffects.filter(s => s.event === 'combat:ghostBladeExile');
}

describe('灵魂吞噬 (soul-devour) — APPLY_DAMAGE 触发', () => {
  it('appliedDamage > 0 + amulet 装备 → emit combat:ghostBladeExile（source=amulet）', () => {
    const state = makeState({
      hp: 20,
      amuletSlots: [SOUL_DEVOUR('a1')] as any,
    });

    const result = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 3, source: 'monster' } as any,
    ]);

    expect(result.state.hp).toBe(17); // HP 实际减了
    const emits = findGhostBladeEmits(result.sideEffects);
    expect(emits).toHaveLength(1);
    expect(emits[0].payload).toEqual({
      source: 'amulet',
      sourceLabel: '灵魂吞噬',
    });
  });

  it('selfInflicted 自伤也触发（设计：不区分来源，只看 HP 是否实际减少）', () => {
    const state = makeState({
      hp: 20,
      amuletSlots: [SOUL_DEVOUR('a1')] as any,
    });

    const result = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 2, source: 'self', selfInflicted: true } as any,
    ]);

    expect(result.state.hp).toBe(18);
    const emits = findGhostBladeEmits(result.sideEffects);
    expect(emits).toHaveLength(1);
    expect(emits[0].payload).toEqual({
      source: 'amulet',
      sourceLabel: '灵魂吞噬',
    });
  });

  it('rawDamage = 0 → 不 emit（什么都没发生）', () => {
    const state = makeState({
      hp: 20,
      amuletSlots: [SOUL_DEVOUR('a1')] as any,
    });

    const result = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 0, source: 'noop' } as any,
    ]);

    expect(result.state.hp).toBe(20);
    expect(findGhostBladeEmits(result.sideEffects)).toHaveLength(0);
  });

  it('tempShield 全收 → appliedDamage === 0 → 不 emit', () => {
    const state = makeState({
      hp: 20,
      tempShield: 5,
      amuletSlots: [SOUL_DEVOUR('a1')] as any,
    });

    const result = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 3, source: 'monster' } as any,
    ]);

    expect(result.state.hp).toBe(20);
    expect(result.state.tempShield).toBe(2);
    expect(findGhostBladeEmits(result.sideEffects)).toHaveLength(0);
  });

  it('tempShield 部分抵消，溢出仍打到 HP → 触发', () => {
    const state = makeState({
      hp: 20,
      tempShield: 2,
      amuletSlots: [SOUL_DEVOUR('a1')] as any,
    });

    const result = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 5, source: 'monster' } as any,
    ]);

    expect(result.state.hp).toBe(17); // 20 - (5-2) = 17
    expect(result.state.tempShield).toBe(0);
    const emits = findGhostBladeEmits(result.sideEffects);
    expect(emits).toHaveLength(1);
    expect(emits[0].payload.source).toBe('amulet');
  });

  it('不灭守护抵消致死伤害 → appliedDamage === 0 → 不 emit', () => {
    // 不灭守护从手牌里寻找（ward 卡需有 magicEffect/knightEffect = 'death-ward'）。
    const wardCard = {
      id: 'ward-1',
      type: 'magic',
      name: '不灭守护',
      value: 0,
      image: '',
      magicEffect: 'death-ward',
    } as any as GameCardData;

    const state = makeState({
      hp: 5,
      handCards: [wardCard] as any,
      amuletSlots: [SOUL_DEVOUR('a1')] as any,
    });

    const result = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 999, source: 'monster' } as any,
    ]);

    // 不灭守护抵消 → HP 不变（仍为 5），ward 卡进坟场
    expect(result.state.hp).toBe(5);
    expect(result.state.handCards.find(c => c.id === 'ward-1')).toBeUndefined();
    expect(findGhostBladeEmits(result.sideEffects)).toHaveLength(0);
  });

  it('未装备护符 → 即使 HP 减了也不 emit', () => {
    const state = makeState({
      hp: 20,
      amuletSlots: [],
    });

    const result = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 3, source: 'monster' } as any,
    ]);

    expect(result.state.hp).toBe(17);
    expect(findGhostBladeEmits(result.sideEffects)).toHaveLength(0);
  });

  it('每次受伤都触发（无频率限制）—— 连续两次 APPLY_DAMAGE → 两次 emit', () => {
    const state = makeState({
      hp: 20,
      amuletSlots: [SOUL_DEVOUR('a1')] as any,
    });

    // 模拟连续两次受伤（如玩家在同一回合内被多次攻击）
    const r1 = reduce(state, { type: 'APPLY_DAMAGE', amount: 2, source: 'm1' } as any);
    const r2 = reduce(r1.state, { type: 'APPLY_DAMAGE', amount: 2, source: 'm2' } as any);

    expect(r2.state.hp).toBe(16);
    expect(findGhostBladeEmits(r1.sideEffects)).toHaveLength(1);
    expect(findGhostBladeEmits(r2.sideEffects)).toHaveLength(1);
  });
});

describe('combat:ghostBladeExile payload 兼容性', () => {
  // payload 的 source / sourceLabel 是新加字段；虚灵刀路径已经升级。
  // 这条 regression 保证未来如果有人去掉 source 字段，类型层面立即报错。
  it('payload 类型固定为 { source: "weapon" | "amulet"; sourceLabel: string }', () => {
    const state = makeState({
      hp: 20,
      amuletSlots: [SOUL_DEVOUR('a1')] as any,
    });
    const result = reduce(state, { type: 'APPLY_DAMAGE', amount: 1, source: 'test' } as any);
    const emit = findGhostBladeEmits(result.sideEffects)[0];
    expect(emit).toBeDefined();
    expect(typeof emit.payload.source).toBe('string');
    expect(['weapon', 'amulet']).toContain(emit.payload.source);
    expect(typeof emit.payload.sourceLabel).toBe('string');
    expect(emit.payload.sourceLabel.length).toBeGreaterThan(0);
  });
});
