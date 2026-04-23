/**
 * 天眼审判（Perm 1 magic）— 翻看主牌堆顶 4 张，若其中无怪物则下次劝降率 +N%。
 *
 * 行为契约：
 *   - lvl 0：bonus = +70%
 *   - lvl 1：bonus = +100%
 *   - 加成累加到 `state.persuadeAmuletBonus`（与翻印之符 / 怀柔之印共享同一短期 buff）
 *   - 牌堆顶 4 张里有任何怪物 → 不加成
 *   - 牌堆为空 → 不加成
 *   - 法术回响（structural C）：仅一次 grant，无叠加；banner 提示无额外效果
 *   - 总是 emit `card:fateSightPeekReady` 用于 UI peek 弹窗
 *   - FINALIZE_MAGIC_CARD 由 hook 在弹窗关闭后 dispatch（不在 reducer 里立即 finalize）
 */

import { describe, it, expect } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState, GameCardData } from '../types';

function makeFateSight(level = 0): GameCardData {
  return {
    id: `fate-sight-${level}`,
    type: 'magic',
    name: '天眼审判',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    magicEffect: '透视牌堆顶 4 张，无怪物则获劝降率加成。',
    knightEffect: 'fate-sight',
    recycleDelay: 1,
    upgradeLevel: level,
  } as GameCardData;
}

function makeMonsterCard(id: string): GameCardData {
  return {
    id,
    type: 'monster',
    name: 'Goblin',
    value: 1,
    hp: 1,
    maxHp: 1,
    attack: 1,
  } as unknown as GameCardData;
}

function makePotionCard(id: string): GameCardData {
  return {
    id,
    type: 'potion',
    name: 'Potion',
    value: 1,
  } as unknown as GameCardData;
}

function makeState(overrides: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    ...overrides,
  } as GameState;
}

describe('天眼审判 (fate-sight) — 翻看牌堆顶 4 张 → 劝降率加成', () => {
  it('lvl 0 + 牌堆顶 4 张全非怪物 → persuadeAmuletBonus +70', () => {
    const card = makeFateSight(0);
    const state = makeState({
      handCards: [card] as any,
      remainingDeck: [
        makePotionCard('p1'),
        makePotionCard('p2'),
        makePotionCard('p3'),
        makePotionCard('p4'),
        makeMonsterCard('m-far'), // 第 5 张是怪物，不影响（只看前 4 张）
      ] as any,
      persuadeAmuletBonus: 0,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id }]);
    expect(result.state.persuadeAmuletBonus).toBe(70);
  });

  it('lvl 1 + 牌堆顶 4 张全非怪物 → persuadeAmuletBonus +100', () => {
    const card = makeFateSight(1);
    const state = makeState({
      handCards: [card] as any,
      remainingDeck: [
        makePotionCard('p1'),
        makePotionCard('p2'),
        makePotionCard('p3'),
        makePotionCard('p4'),
      ] as any,
      persuadeAmuletBonus: 0,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id }]);
    expect(result.state.persuadeAmuletBonus).toBe(100);
  });

  it('lvl 0 + 牌堆顶 4 张含怪物 → 无加成', () => {
    const card = makeFateSight(0);
    const state = makeState({
      handCards: [card] as any,
      remainingDeck: [
        makePotionCard('p1'),
        makeMonsterCard('m1'),
        makePotionCard('p2'),
        makePotionCard('p3'),
      ] as any,
      persuadeAmuletBonus: 0,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id }]);
    expect(result.state.persuadeAmuletBonus).toBe(0);
  });

  it('牌堆为空 → 无加成', () => {
    const card = makeFateSight(0);
    const state = makeState({
      handCards: [card] as any,
      remainingDeck: [] as any,
      persuadeAmuletBonus: 0,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id }]);
    expect(result.state.persuadeAmuletBonus).toBe(0);
  });

  it('emit card:fateSightPeekReady（用于 UI peek 弹窗）', () => {
    const card = makeFateSight(0);
    const state = makeState({
      handCards: [card] as any,
      remainingDeck: [
        makePotionCard('p1'),
        makePotionCard('p2'),
        makePotionCard('p3'),
        makePotionCard('p4'),
      ] as any,
      persuadeAmuletBonus: 0,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id }]);
    const peekReady = result.sideEffects.find(s => s.event === 'card:fateSightPeekReady');
    expect(peekReady).toBeDefined();
    if (peekReady && peekReady.event === 'card:fateSightPeekReady') {
      expect(peekReady.payload.peekedCards).toHaveLength(4);
      expect(peekReady.payload.monsterCount).toBe(0);
      expect(peekReady.payload.persuadeBonusGranted).toBe(70);
    }
  });

  it('累加而非覆盖：原 persuadeAmuletBonus 30 + grant 70 → 100', () => {
    const card = makeFateSight(0);
    const state = makeState({
      handCards: [card] as any,
      remainingDeck: [
        makePotionCard('p1'),
        makePotionCard('p2'),
        makePotionCard('p3'),
        makePotionCard('p4'),
      ] as any,
      persuadeAmuletBonus: 30,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id }]);
    expect(result.state.persuadeAmuletBonus).toBe(100);
  });

  it('法术回响（structural C）：bonus 仅 grant 一次（不叠加）', () => {
    const card = makeFateSight(0);
    const state = makeState({
      handCards: [card] as any,
      remainingDeck: [
        makePotionCard('p1'),
        makePotionCard('p2'),
        makePotionCard('p3'),
        makePotionCard('p4'),
      ] as any,
      persuadeAmuletBonus: 0,
      doubleNextMagic: true,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id }]);
    // grant 一次 70%，不是 140%
    expect(result.state.persuadeAmuletBonus).toBe(70);
    expect(result.state.doubleNextMagic).toBe(false);
  });
});
