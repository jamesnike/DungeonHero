/**
 * 迷宫回溯 (starter:reshuffle / return-dungeon-bottom) — stack-pop regression.
 *
 * Bug: when the player picked the active-row top card via 迷宫回溯, the
 * reducer set the slot to `null` and pushed the picked card to the bottom of
 * `remainingDeck`, but it did NOT touch `activeCardStacks[col]`. Any card
 * stacked beneath (e.g. a 幽灵建筑 pushed to the stack-bottom by a previous
 * waterfall drop) was orphaned: visually the slot looked empty, the next
 * waterfall drop covered the ghost with a fresh card, and the ghost
 * effectively "vanished alongside the picked card" from the player's view.
 *
 * Fix: mirror the `COMPLETE_EVENT` / `removeCard` pattern — when a stack
 * exists below the cleared slot, promote the stack-top into the slot
 * instead of leaving it null.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { STARTER_CARD_IDS } from '../deck';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] } as any,
    ...overrides,
  };
}

function makeReshuffleCard(suffix = '-pick-1'): GameCardData {
  return {
    id: `${STARTER_CARD_IDS.reshuffle}${suffix}`,
    type: 'magic',
    name: '迷宫回溯',
    value: 0,
    image: '',
    magicType: 'permanent',
    description: 'test',
    recycleDelay: 1,
    maxUpgradeLevel: 2,
  } as GameCardData;
}

function makeMonster(id: string, hp = 5): GameCardData {
  return {
    id,
    type: 'monster',
    name: `Mob-${id}`,
    value: 1,
    image: '',
    hp,
    maxHp: hp,
    attack: 1,
  } as GameCardData;
}

function makeGhostBuilding(id: string, name = '增幅祭坛'): GameCardData {
  return {
    id,
    type: 'building' as any,
    name,
    value: 0,
    image: '',
    isGhost: true,
    hp: 2,
    maxHp: 2,
  } as GameCardData;
}

describe('迷宫回溯 — 堆叠在下层的卡牌（含幽灵建筑）应弹回顶层', () => {
  // ---------- Player-pick path (2+ active cards → pendingMagicAction) ----------

  it('玩家从多张地城牌中选中带堆叠列 → 顶层入牌堆底，下层幽灵建筑弹起填回', () => {
    const card = makeReshuffleCard('-pick-1');
    const topMonster = makeMonster('m-top');
    const otherMonster = makeMonster('m-other');
    const ghost = makeGhostBuilding('ghost-altar');

    const state = makeState({
      handCards: [card],
      activeCards: [topMonster, otherMonster, null, null, null] as any,
      activeCardStacks: { 0: [ghost] },
      remainingDeck: [] as any,
    });

    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('return-dungeon-bottom');

    result = drain(result.state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'm-top', targetIndex: 0 } as GameAction,
    ]);

    expect((result.state.activeCards as any[])[0]?.id).toBe('ghost-altar');
    expect(result.state.activeCardStacks[0]).toBeUndefined();

    const deck = result.state.remainingDeck as any[];
    expect(deck.map(c => c?.id)).toEqual(['m-top']);
    expect(deck.find(c => c?.id === 'ghost-altar')).toBeUndefined();
  });

  it('玩家选中带多层堆叠列 → 仅弹起最上层一张，余下保持在 stack', () => {
    const card = makeReshuffleCard('-pick-2');
    const topMonster = makeMonster('m-top-2');
    const otherMonster = makeMonster('m-other-2');
    const stackedMid = makeMonster('m-mid-2');
    const stackedGhost = makeGhostBuilding('ghost-bottom-2');

    const state = makeState({
      handCards: [card],
      activeCards: [topMonster, otherMonster, null, null, null] as any,
      activeCardStacks: { 0: [stackedGhost, stackedMid] },
      remainingDeck: [] as any,
    });

    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    result = drain(result.state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'm-top-2', targetIndex: 0 } as GameAction,
    ]);

    expect((result.state.activeCards as any[])[0]?.id).toBe('m-mid-2');
    expect(result.state.activeCardStacks[0]?.map(c => c.id)).toEqual(['ghost-bottom-2']);

    const deck = result.state.remainingDeck as any[];
    expect(deck.map(c => c?.id)).toEqual(['m-top-2']);
  });

  it('玩家选中没有堆叠的列 → 该列变 null（保持原行为）', () => {
    const card = makeReshuffleCard('-pick-3');
    const m1 = makeMonster('m-only');
    const filler = makeMonster('m-filler');

    const state = makeState({
      handCards: [card],
      activeCards: [m1, filler, null, null, null] as any,
      activeCardStacks: {},
      remainingDeck: [] as any,
    });

    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    result = drain(result.state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'm-only', targetIndex: 0 } as GameAction,
    ]);

    expect((result.state.activeCards as any[])[0]).toBeNull();
    expect(result.state.activeCardStacks[0]).toBeUndefined();
    const deck = result.state.remainingDeck as any[];
    expect(deck.map(c => c?.id)).toEqual(['m-only']);
  });

  // ---------- Auto-resolve path (1 active card → schema short-circuit) ----------

  it('自动解析（地城仅 1 张）+ 该列下方有幽灵建筑 → 顶层入牌堆底，幽灵弹起', () => {
    const card = makeReshuffleCard('-pick-4');
    const topMonster = makeMonster('m-only-top');
    const ghost = makeGhostBuilding('ghost-altar-2');

    const state = makeState({
      handCards: [card],
      activeCards: [topMonster, null, null, null, null] as any,
      activeCardStacks: { 0: [ghost] },
      remainingDeck: [] as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.pendingMagicAction).toBeNull();
    expect((result.state.activeCards as any[])[0]?.id).toBe('ghost-altar-2');
    expect(result.state.activeCardStacks[0]).toBeUndefined();

    const deck = result.state.remainingDeck as any[];
    expect(deck.map(c => c?.id)).toEqual(['m-only-top']);
    expect(deck.find(c => c?.id === 'ghost-altar-2')).toBeUndefined();
  });
});
