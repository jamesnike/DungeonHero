/**
 * Regression: 雷击护符 (`stun-rate-boost` amulet) 必须对所有"卡牌自带击晕效
 * 果"的法术也生效，而不只是武器/盾击/侧击。
 *
 * 原 bug：装了雷击护符（+20% 击晕率）但使用 雷震击 / 雷涌一击 / 震慑领域
 * 时击晕率没有拿到加成，因为这些 magic resolver 在计算 stunPct 时直接用
 * 写死的百分比 `Math.min(rawStunPct, state.stunCap)`，没有把
 * `computeAmuletEffects(...).stunRateBoost` 加进去。
 *
 * 此测试覆盖 reducer 端：在装备一/二/三张雷击护符时，stun dice subtitle
 * 中的 `XX%` 与 `stunPct` context 字段必须随之上调（仍受 stunCap 约束）。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots } from '@/components/game-board/types';
import { STARTER_CARD_IDS } from '../deck';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeStunStrike(idSuffix = 1) {
  return {
    id: `${STARTER_CARD_IDS.stunStrike}-pick-${idSuffix}`,
    type: 'magic' as const,
    name: '雷震击',
    value: 0,
    image: '',
    magicType: 'permanent' as const,
    magicEffect: '永久魔法：对一个怪物造成 1 点伤害 2 次，每次 20% 击晕。',
    description: '对一个怪物造成 1 点法术伤害 2 次，每次有 20% 概率击晕目标。',
    recycleDelay: 1,
    maxUpgradeLevel: 2,
  };
}

function makeMonster(id: string) {
  return {
    id,
    type: 'monster' as const,
    name: 'Goblin',
    value: 1,
    hp: 10,
    maxHp: 10,
    attack: 0,
    currentLayer: 1,
    fury: 1,
    hpLayers: 1,
  };
}

function makeStunAmulet(idSuffix = 1) {
  return {
    id: `amulet-stun-${idSuffix}`,
    type: 'amulet' as const,
    name: '雷击护符',
    value: 5,
    image: '',
    amuletEffect: 'stun-rate-boost' as const,
  };
}

function activeRowOf(...monsters: any[]): ActiveRowSlots {
  const row: any[] = [null, null, null, null, null];
  for (let i = 0; i < monsters.length && i < 5; i++) row[i] = monsters[i];
  return row as unknown as ActiveRowSlots;
}

function getStunDicePct(allEffects: any[]): number | undefined {
  const stunDice = allEffects.find(
    e => e.event === 'ui:requestDice'
      && (e.payload as any)?.context?.flowId === 'hero-stun',
  );
  return (stunDice as any)?.payload?.context?.stunPct;
}

describe('雷击护符 (stun-rate-boost) — 法术类击晕也要吃护符加成', () => {
  it('雷震击 baseline (no amulet, stunCap=100): stunPct = 20', () => {
    const card = makeStunStrike(1);
    const state = makeState({
      handCards: [card] as any,
      stunCap: 100,
      amuletSlots: [] as any,
      activeCards: activeRowOf(makeMonster('m1')) as any,
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(afterPlay.state, [
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'stun-strike', monsterId: 'm1' } as GameAction,
    ]);
    const all = [...afterPlay.sideEffects, ...result.sideEffects];
    expect(getStunDicePct(all)).toBe(20);
  });

  it('雷震击 + 1 雷击护符 (stunCap=100): stunPct = 20 + 20 = 40', () => {
    const card = makeStunStrike(2);
    const state = makeState({
      handCards: [card] as any,
      stunCap: 100,
      amuletSlots: [makeStunAmulet(1)] as any,
      activeCards: activeRowOf(makeMonster('m1')) as any,
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(afterPlay.state, [
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'stun-strike', monsterId: 'm1' } as GameAction,
    ]);
    const all = [...afterPlay.sideEffects, ...result.sideEffects];
    expect(getStunDicePct(all)).toBe(40);
  });

  it('雷震击 + 3 雷击护符 (stunCap=100): stunPct = 20 + 60 = 80', () => {
    const card = makeStunStrike(3);
    const state = makeState({
      handCards: [card] as any,
      stunCap: 100,
      amuletSlots: [makeStunAmulet(1), makeStunAmulet(2), makeStunAmulet(3)] as any,
      activeCards: activeRowOf(makeMonster('m1')) as any,
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(afterPlay.state, [
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'stun-strike', monsterId: 'm1' } as GameAction,
    ]);
    const all = [...afterPlay.sideEffects, ...result.sideEffects];
    expect(getStunDicePct(all)).toBe(80);
  });

  it('雷震击 + 雷击护符 仍受 stunCap 约束: stunCap=30, +20% amulet → stunPct = min(40, 30) = 30', () => {
    const card = makeStunStrike(4);
    const state = makeState({
      handCards: [card] as any,
      stunCap: 30,
      amuletSlots: [makeStunAmulet(1)] as any,
      activeCards: activeRowOf(makeMonster('m1')) as any,
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(afterPlay.state, [
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'stun-strike', monsterId: 'm1' } as GameAction,
    ]);
    const all = [...afterPlay.sideEffects, ...result.sideEffects];
    expect(getStunDicePct(all)).toBe(30);
  });
});
