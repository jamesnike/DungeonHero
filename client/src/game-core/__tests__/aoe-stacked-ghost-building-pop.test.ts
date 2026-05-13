/**
 * AOE on stacked ghost buildings — should kill only the top layer and let the
 * card stacked beneath it pop up into the slot.
 *
 * User-reported bug: when a column has multiple stacked 幽灵建筑 (top in
 * `activeCards[col]`, the rest in `activeCardStacks[col]`), an AOE spell like
 * 风暴箭雨 should:
 *   1. Damage only the top-layer ghost (AOE iterates `flattenActiveRowSlots`
 *      which only sees top cards — already correct).
 *   2. When the top dies, promote the next card from `activeCardStacks[col]`
 *      into the slot ("stack-pop") instead of orphaning it.
 *
 * Root cause: combat reducer's BUILDING-defeat branches unconditionally set
 * `activeCards[idx] = null` without consulting `activeCardStacks[idx]`.
 *   - `reduceDealDamageToMonster` (DEAL_DAMAGE_TO_MONSTER) → AOE / spell damage
 *   - `PERFORM_HERO_ATTACK` building branch → weapon overkill on building
 * Both bypass the stack-pop logic that already exists in the `removeCard` hook
 * (`GameBoard.tsx:5681-5722`), `reduceDungeonCardSelection 'return-dungeon-bottom'`
 * (`rules/hero.ts:3184-3219`), and `reduceCompleteEvent` (`rules/events.ts`).
 *
 * Fix: mirror the existing stack-pop pattern in the two combat-reducer building
 * branches. Swarm-source override is preserved (when a swarm monster is on the
 * row, slot still goes to null so a Buglet can spawn — same as the hook).
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput',
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] } as any,
    ...overrides,
  };
}

// Ghost building modeled after 增幅祭坛 / 命运之刃 / 地雷 (hp 2 / hpLayers 1).
function makeGhostBuilding(id: string, name = '增幅祭坛', hp = 2): GameCardData {
  return {
    id,
    type: 'building' as any,
    name,
    value: 0,
    image: '',
    isGhost: true,
    fury: 1,
    hpLayers: 1,
    currentLayer: 1,
    hp,
    maxHp: hp,
  } as GameCardData;
}

function makeStormVolley(idSuffix = '-1'): GameCardData {
  return {
    id: `storm-volley${idSuffix}`,
    type: 'magic',
    name: '风暴箭雨',
    value: 0,
    image: '',
    magicType: 'instant',
    magicEffect: 'storm-volley',
    description: '对激活行所有怪物造成 3 点伤害。命中 3+ 只时翻转为「箭雨余韵」。',
  } as GameCardData;
}

const heroAttackAction = (
  slotId: 'equipmentSlot1' | 'equipmentSlot2',
  targetId: string,
): GameAction =>
  ({ type: 'PERFORM_HERO_ATTACK', slotId, targetMonsterId: targetId } as any);

describe('风暴箭雨 / AOE 击杀堆叠的幽灵建筑：仅打掉最上层，下层自动 pop 上来', () => {
  it('AOE 击杀顶层幽灵建筑 → activeCardStacks 中下一张幽灵建筑弹起填回 slot', () => {
    const top = makeGhostBuilding('ghost-top', '增幅祭坛');
    const stacked = makeGhostBuilding('ghost-stack', '命运之刃');
    const storm = makeStormVolley();

    const state = makeState({
      handCards: [storm],
      activeCards: [top, null, null, null, null] as any,
      activeCardStacks: { 0: [stacked] },
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: storm.id } as GameAction,
    ]);

    // 顶层幽灵建筑被毁、下层弹起填回 slot
    expect((result.state.activeCards as any[])[0]?.id).toBe(stacked.id);
    expect(result.state.activeCardStacks[0]).toBeUndefined();

    // 被毁的顶层进坟场
    expect(result.state.discardedCards.some(c => c.id === top.id)).toBe(true);
    // 下层 NOT 进坟场（它现在在 active row 顶层）
    expect(result.state.discardedCards.some(c => c.id === stacked.id)).toBe(false);

    // 顶层 building 被毁 side effect 应该有发
    expect(result.sideEffects.some(e => e.event === 'combat:buildingDestroyed')).toBe(true);
  });

  it('AOE 击杀顶层幽灵建筑 → 多层 stack 时仅弹起最上一层，余下保留', () => {
    const top = makeGhostBuilding('ghost-top', '增幅祭坛');
    const stackedMid = makeGhostBuilding('ghost-mid', '命运之刃');
    const stackedBottom = makeGhostBuilding('ghost-bottom', '诅咒碑');
    const storm = makeStormVolley();

    const state = makeState({
      handCards: [storm],
      activeCards: [top, null, null, null, null] as any,
      // stack 语义：next-to-pop 在末尾，stackedMid 弹起
      activeCardStacks: { 0: [stackedBottom, stackedMid] },
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: storm.id } as GameAction,
    ]);

    expect((result.state.activeCards as any[])[0]?.id).toBe(stackedMid.id);
    expect(result.state.activeCardStacks[0]?.map(c => c.id)).toEqual([stackedBottom.id]);
    expect(result.state.discardedCards.some(c => c.id === top.id)).toBe(true);
  });

  it('AOE 击杀顶层幽灵建筑 → 没 stack 时 slot 变 null（保持原行为）', () => {
    const top = makeGhostBuilding('ghost-only', '增幅祭坛');
    const storm = makeStormVolley();

    const state = makeState({
      handCards: [storm],
      activeCards: [top, null, null, null, null] as any,
      activeCardStacks: {},
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: storm.id } as GameAction,
    ]);

    expect((result.state.activeCards as any[])[0]).toBeNull();
    expect(result.state.discardedCards.some(c => c.id === top.id)).toBe(true);
  });

  it('武器 PERFORM_HERO_ATTACK 击杀顶层幽灵建筑 → 下层 stack 自动 pop 起来', () => {
    const top = makeGhostBuilding('ghost-top-w', '增幅祭坛');
    const stacked = makeGhostBuilding('ghost-stack-w', '命运之刃');
    const weapon = {
      id: 'w', type: 'weapon' as const, name: '巨剑', value: 10,
      durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
    };

    const state = makeState({
      hp: 10,
      equipmentSlot1: weapon as any,
      activeCards: [top, null, null, null, null] as any,
      activeCardStacks: { 0: [stacked] },
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: [],
        currentTurn: 'hero',
        heroAttacksRemaining: 2,
      } as any,
    });

    const result = drain(state, [heroAttackAction('equipmentSlot1', 'ghost-top-w')]);

    expect((result.state.activeCards as any[])[0]?.id).toBe(stacked.id);
    expect(result.state.activeCardStacks[0]).toBeUndefined();
    expect(result.state.discardedCards.some(c => c.id === top.id)).toBe(true);
    expect(result.sideEffects.some(e => e.event === 'combat:buildingDestroyed')).toBe(true);
  });

  it('AOE 击杀顶层幽灵建筑 + 同行有 Swarm 怪 → slot 留空给 Buglet 生成（保留 stack）', () => {
    // Swarm 优先级高于 stack-pop（参考 GameBoard.tsx removeCard 的 swarmSourcePresent
    // 判断 + rules/events.ts COMPLETE_EVENT 的同款覆盖）。Swarm 怪占用 slot 1，
    // ghost building 在 slot 0；ghost-stack 留在 activeCardStacks[0] 等 Buglet 死掉后
    // 自然弹起。
    const top = makeGhostBuilding('ghost-top-s', '增幅祭坛');
    const stacked = makeGhostBuilding('ghost-stack-s', '命运之刃');
    const swarmMonster = {
      id: 'swarm-m', type: 'monster' as const, name: 'Swarm Mom', value: 5,
      hp: 5, maxHp: 5, attack: 1, swarmSpawn: true,
    } as GameCardData;
    const storm = makeStormVolley('-s');

    const state = makeState({
      handCards: [storm],
      activeCards: [top, swarmMonster, null, null, null] as any,
      activeCardStacks: { 0: [stacked] },
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: storm.id } as GameAction,
    ]);

    // slot 0 上是新生成的 Buglet（不是弹起的 stacked ghost）
    const slot0 = (result.state.activeCards as any[])[0];
    expect(slot0).not.toBeNull();
    expect(slot0?.id).not.toBe(stacked.id); // 不是弹起的 ghost
    expect(slot0?.isBuglet).toBe(true);

    // 原 stack 保留（Buglet 死后会弹起）
    expect(result.state.activeCardStacks[0]?.map(c => c.id)).toEqual([stacked.id]);

    // 顶层 building 入坟场
    expect(result.state.discardedCards.some(c => c.id === top.id)).toBe(true);
  });
});
