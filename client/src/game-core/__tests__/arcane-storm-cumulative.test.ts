/**
 * 奥术风暴 (arcane-storm-magic-count) 累计计数 lifecycle 测试。
 *
 * 设计契约：
 *   - X = arcaneStormMagicCount = 自上次「使用奥术风暴」/「瀑流」起累计的非自身魔法卡数。
 *   - 不计入奥术风暴自身那一次出牌。
 *   - 跨 START_TURN / RESET_TURN_STATE **不**清零（这是 fix 的关键）。
 *   - 「使用后清零」：使用完一次（无论是否打中、是否 fizzle）后置 0。
 *   - 「瀑流也清零」：WATERFALL_TURN_RESET 时置 0。
 *
 * 历史 bug：之前 resolver 读的是 magicCardsPlayedThisTurn，被 START_TURN 每回合清零，
 * 导致「累计」语义无效。新增独立字段 arcaneStormMagicCount 以解耦两个消费方
 * （奥术护盾 = 本回合，奥术风暴 = 累计）。
 */
import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots } from '@/components/game-board/types';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function arcaneStormCard(id = 'storm-1'): GameCardData {
  return {
    id,
    type: 'magic',
    name: '奥术风暴',
    value: 0,
    magicType: 'permanent',
    magicEffect: 'arcane-storm-magic-count',
    recycleDelay: 1,
  } as GameCardData;
}

/** 一张「无副作用」的 magic 卡：double-next-magic 只置 doubleNextMagic flag。 */
function noopMagicCard(id: string, name = '占位魔法'): GameCardData {
  return {
    id,
    type: 'magic',
    name,
    value: 0,
    magicType: 'instant',
    magicEffect: 'double-next-magic',
  } as GameCardData;
}

function activeRowOf(...monsters: any[]): ActiveRowSlots {
  const row: any[] = [null, null, null, null, null];
  for (let i = 0; i < monsters.length && i < 5; i++) row[i] = monsters[i];
  return row as unknown as ActiveRowSlots;
}

function makeDummyMonster(id = 'mst-1') {
  return {
    id,
    type: 'monster' as const,
    name: 'Goblin',
    value: 0,
    hp: 100,
    maxHp: 100,
    attack: 1,
    currentLayer: 1,
    fury: 1,
  };
}

describe('arcaneStormMagicCount — increment', () => {
  it('打出非奥术风暴的 magic 卡：arcaneStormMagicCount += 1', () => {
    const card = noopMagicCard('m1');
    const state = makeState({
      handCards: [card],
      arcaneStormMagicCount: 0,
      magicCardsPlayedThisTurn: 0,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: 'm1' } as GameAction]);
    expect(result.state.arcaneStormMagicCount).toBe(1);
    expect(result.state.magicCardsPlayedThisTurn).toBe(1);
  });

  it('连打 3 张 magic：arcaneStormMagicCount = 3（累计）', () => {
    const cards = [noopMagicCard('m1'), noopMagicCard('m2'), noopMagicCard('m3')];
    let state = makeState({ handCards: cards, arcaneStormMagicCount: 0 });
    for (const c of cards) {
      state = drain(state, [{ type: 'PLAY_CARD', cardId: c.id } as GameAction]).state;
    }
    expect(state.arcaneStormMagicCount).toBe(3);
  });

  it('打出奥术风暴自身：arcaneStormMagicCount **不** +1（不含自身）', () => {
    const storm = arcaneStormCard();
    const state = makeState({
      handCards: [storm],
      arcaneStormMagicCount: 5,
      activeCards: activeRowOf(makeDummyMonster()) as any,
    });
    // PLAY_CARD → resolver 设置 pendingMagicAction，等待目标选择。
    // 此时 arcaneStormMagicCount 不应 +1（engine 预处理跳过自身）。
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id } as GameAction]);
    expect(result.state.magicCardsPlayedThisTurn).toBe(1);
    expect(result.state.arcaneStormMagicCount).toBe(5);
    expect(result.state.pendingMagicAction).not.toBeNull();
  });
});

describe('arcaneStormMagicCount — START_TURN / RESET_TURN_STATE 不重置（关键 fix）', () => {
  it('START_TURN：magicCardsPlayedThisTurn 清零，arcaneStormMagicCount 保留', () => {
    const state = makeState({
      arcaneStormMagicCount: 4,
      magicCardsPlayedThisTurn: 4,
    });
    const result = reduce(state, { type: 'START_TURN' });
    expect(result.state.magicCardsPlayedThisTurn).toBe(0);
    expect(result.state.arcaneStormMagicCount).toBe(4);
  });

  it('RESET_TURN_STATE：magicCardsPlayedThisTurn 清零，arcaneStormMagicCount 保留', () => {
    const state = makeState({
      arcaneStormMagicCount: 7,
      magicCardsPlayedThisTurn: 7,
    });
    const result = reduce(state, { type: 'RESET_TURN_STATE' });
    expect(result.state.magicCardsPlayedThisTurn).toBe(0);
    expect(result.state.arcaneStormMagicCount).toBe(7);
  });

  it('跨 START_TURN 累计场景：打 2 张 → START_TURN → 再打 2 张 → 总累计 = 4', () => {
    const cards = [noopMagicCard('m1'), noopMagicCard('m2'), noopMagicCard('m3'), noopMagicCard('m4')];
    let state = makeState({ handCards: cards });
    state = drain(state, [{ type: 'PLAY_CARD', cardId: 'm1' } as GameAction]).state;
    state = drain(state, [{ type: 'PLAY_CARD', cardId: 'm2' } as GameAction]).state;
    expect(state.arcaneStormMagicCount).toBe(2);
    expect(state.magicCardsPlayedThisTurn).toBe(2);

    state = drain(state, [{ type: 'START_TURN' } as GameAction]).state;
    expect(state.arcaneStormMagicCount).toBe(2);
    expect(state.magicCardsPlayedThisTurn).toBe(0);

    state = drain(state, [{ type: 'PLAY_CARD', cardId: 'm3' } as GameAction]).state;
    state = drain(state, [{ type: 'PLAY_CARD', cardId: 'm4' } as GameAction]).state;
    expect(state.arcaneStormMagicCount).toBe(4);
    expect(state.magicCardsPlayedThisTurn).toBe(2);
  });
});

describe('arcaneStormMagicCount — waterfall 清零', () => {
  it('WATERFALL_TURN_RESET 把 arcaneStormMagicCount 清零', () => {
    const state = makeState({
      arcaneStormMagicCount: 6,
      magicCardsPlayedThisTurn: 6,
    });
    const result = reduce(state, { type: 'WATERFALL_TURN_RESET' });
    expect(result.state.arcaneStormMagicCount).toBe(0);
    expect(result.state.magicCardsPlayedThisTurn).toBe(0);
  });
});

describe('arcaneStormMagicCount — 使用后清零', () => {
  it('fizzle 路径（X = 0 且无 spell bonus）：arcaneStormMagicCount = 0 → 仍然清零', () => {
    const storm = arcaneStormCard();
    const state = makeState({
      handCards: [storm],
      arcaneStormMagicCount: 0,
      permanentSpellDamageBonus: 0,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id } as GameAction]);
    expect(result.state.arcaneStormMagicCount).toBe(0);
    // pendingMagicAction 应该是 null（fizzle 不弹窗）
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('选定目标后：arcaneStormMagicCount 重置为 0', () => {
    const storm = arcaneStormCard();
    const state = makeState({
      handCards: [storm],
      activeCards: activeRowOf(makeDummyMonster('mst-1')) as any,
      arcaneStormMagicCount: 3,
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect(result.state.arcaneStormMagicCount).toBe(3);
    // sanity check：pending 是 arcane-storm + monster-select
    expect((result.state.pendingMagicAction as any)?.effect).toBe('arcane-storm');
    expect((result.state.pendingMagicAction as any)?.step).toBe('monster-select');

    result = drain(result.state, [
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'arcane-storm', monsterId: 'mst-1' } as any,
    ]);
    expect(result.state.arcaneStormMagicCount).toBe(0);
  });
});

describe('arcaneStormMagicCount — 与奥术护盾解耦（不互相干扰）', () => {
  it('打 magic 卡时两个字段都 +1，但生命周期独立', () => {
    const card = noopMagicCard('m1');
    const state = makeState({ handCards: [card] });
    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: 'm1' } as GameAction]);
    expect(r1.state.magicCardsPlayedThisTurn).toBe(1);
    expect(r1.state.arcaneStormMagicCount).toBe(1);

    const r2 = reduce(r1.state, { type: 'START_TURN' });
    // 奥术护盾依赖的字段被清零（保持原行为）
    expect(r2.state.magicCardsPlayedThisTurn).toBe(0);
    // 奥术风暴累计字段保留
    expect(r2.state.arcaneStormMagicCount).toBe(1);
  });
});
