/**
 * 深层交织 (fate-swap-deep) — 「换出怪物 → 下次劝降概率 +30%」 测试
 *
 * 旧行为（已废弃）：在被换出的怪物身上挂 `_persuadeBoost`（普通 +30%、精英 +15%），
 * 只对劝降那只怪生效。
 *
 * 新行为：换出来的牌如果是怪物（不区分普通/精英），累加全局
 * `persuadeAmuletBonus` +30%。这与 劝降之刃 / 感化之锤 / 翻印之符 / 怀柔之印
 * 共享同一短期 buff，下次劝降按下时清零。
 *
 * 通过 RESOLVE_DUNGEON_CARD_SELECTION 触发 fate-swap reducer 分支
 * (rules/hero.ts case 'fate-swap')。
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

function makeFateSwapDeep(idSuffix = 'fsd'): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic',
    name: '深层交织',
    value: 0,
    image: '',
    magicType: 'permanent',
    magicEffect: '永久魔法：选择地城行一张牌，与牌堆顶 4 张中随机一张交换位置。如果换出来的牌是怪物，则下次劝降概率 +30%。',
    description: 'test',
  } as any;
}

function makeActiveCard(id: string, name: string): GameCardData {
  return {
    id,
    type: 'event' as any,
    name,
    value: 0,
    image: '',
  } as any;
}

function makeMonster(id: string, name: string, opts: Partial<GameCardData> = {}): GameCardData {
  return {
    id,
    type: 'monster',
    name,
    value: 0,
    image: '',
    hp: 10,
    maxHp: 10,
    attack: 3,
    currentLayer: 1,
    hpLayers: 1,
    fury: 1,
    ...opts,
  } as any;
}

describe('深层交织 fate-swap：换出怪物 → 下次劝降概率 +30%', () => {
  it('普通怪物换出 → persuadeAmuletBonus +30', () => {
    const card = makeFateSwapDeep('basic');
    const dungeonCard = makeActiveCard('act-1', '神秘宝箱');
    const incomingMonster = makeMonster('mon-deck', 'Goblin');
    const state = makeState({
      handCards: [card],
      activeCards: [dungeonCard, null, null, null, null] as any,
      remainingDeck: [incomingMonster] as any, // single card → swapIdx 必定为 0
      persuadeAmuletBonus: 0,
      pendingMagicAction: {
        card,
        effect: 'fate-swap',
        step: 'dungeon-select',
        prompt: '选择地城行一张牌',
        deckDepth: 4,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'act-1', targetIndex: 0 } as GameAction,
    ]);
    expect(result.state.persuadeAmuletBonus).toBe(30);
    // 怪物已经换到 active 行
    const cell = (result.state.activeCards as (GameCardData | null)[])[0];
    expect(cell?.id).toBe('mon-deck');
    expect(cell?.type).toBe('monster');
  });

  it('精英怪物换出 → 仍然 +30%（不再精英减半）', () => {
    const card = makeFateSwapDeep('elite');
    const dungeonCard = makeActiveCard('act-elite', '神秘宝箱');
    const eliteMonster = makeMonster('mon-elite', 'Elite Orc', {
      monsterSpecial: 'auto-engage',
    });
    const state = makeState({
      handCards: [card],
      activeCards: [dungeonCard, null, null, null, null] as any,
      remainingDeck: [eliteMonster] as any,
      persuadeAmuletBonus: 0,
      pendingMagicAction: {
        card,
        effect: 'fate-swap',
        step: 'dungeon-select',
        prompt: '选择地城行一张牌',
        deckDepth: 4,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'act-elite', targetIndex: 0 } as GameAction,
    ]);
    expect(result.state.persuadeAmuletBonus).toBe(30);
  });

  it('换出非怪物（事件/装备等）→ persuadeAmuletBonus 不变', () => {
    const card = makeFateSwapDeep('event');
    const dungeonCard = makeActiveCard('act-evt', '神秘宝箱');
    const incomingEvent: GameCardData = {
      id: 'evt-deck',
      type: 'event' as any,
      name: '宝藏',
      value: 0,
      image: '',
    } as any;
    const state = makeState({
      handCards: [card],
      activeCards: [dungeonCard, null, null, null, null] as any,
      remainingDeck: [incomingEvent] as any,
      persuadeAmuletBonus: 0,
      pendingMagicAction: {
        card,
        effect: 'fate-swap',
        step: 'dungeon-select',
        prompt: '选择地城行一张牌',
        deckDepth: 4,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'act-evt', targetIndex: 0 } as GameAction,
    ]);
    expect(result.state.persuadeAmuletBonus).toBe(0);
  });

  it('累加：已有 persuadeAmuletBonus=20，换出怪物 → 50', () => {
    const card = makeFateSwapDeep('accum');
    const dungeonCard = makeActiveCard('act-accum', '宝箱');
    const incomingMonster = makeMonster('mon-accum', 'Slime');
    const state = makeState({
      handCards: [card],
      activeCards: [dungeonCard, null, null, null, null] as any,
      remainingDeck: [incomingMonster] as any,
      persuadeAmuletBonus: 20,
      pendingMagicAction: {
        card,
        effect: 'fate-swap',
        step: 'dungeon-select',
        prompt: '选择地城行一张牌',
        deckDepth: 4,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'act-accum', targetIndex: 0 } as GameAction,
    ]);
    expect(result.state.persuadeAmuletBonus).toBe(50);
  });

  it('换出的怪物身上不应残留 _persuadeBoost（旧机制已废弃）', () => {
    const card = makeFateSwapDeep('no-residue');
    const dungeonCard = makeActiveCard('act-nr', '宝箱');
    const incomingMonster = makeMonster('mon-nr', 'Goblin');
    const state = makeState({
      handCards: [card],
      activeCards: [dungeonCard, null, null, null, null] as any,
      remainingDeck: [incomingMonster] as any,
      persuadeAmuletBonus: 0,
      pendingMagicAction: {
        card,
        effect: 'fate-swap',
        step: 'dungeon-select',
        prompt: '选择地城行一张牌',
        deckDepth: 4,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'act-nr', targetIndex: 0 } as GameAction,
    ]);
    const swappedIn = (result.state.activeCards as (GameCardData | null)[])[0];
    expect((swappedIn as any)?._persuadeBoost ?? 0).toBe(0);
  });
});
