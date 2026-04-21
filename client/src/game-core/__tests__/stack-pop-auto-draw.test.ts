/**
 * Regression: auto-draw + on-enter-hand chain when a dungeon card is removed
 * via "stack-pop" (the slot stays occupied because a stacked card is promoted
 * into it).
 *
 * Bug history (introduced by GameBoard.tsx refactor in 1.2.3.7):
 * Before the refactor, `removeCard` in GameBoard.tsx imperatively called
 * `registerDungeonCardProcessed(cardToRemove.id, 'remove-card')` whenever a
 * dungeon card was removed (regardless of whether a stacked card popped up
 * underneath). After the refactor, that call was deleted in favor of the
 * reducer's `postProcessActiveCards` slot-clear detection — which only fires
 * when `prev && !curr` (the slot becomes null).
 *
 * In the stack-pop case, the slot stays non-null (filled with the next
 * stacked card). `postProcessActiveCards` correctly skipped the swarm-spawn
 * branch BUT silently dropped the auto-draw registration, so:
 *
 *   1. `pendingAutoDrawCount` never incremented → no backpack→hand draw.
 *   2. Cards in the backpack never reached the hand → their
 *      `onEnterHandEffect` (e.g. 三牌惊雷 上手) never fired.
 *
 * `rules/events.ts` `COMPLETE_EVENT` already handled this case explicitly
 * (search for "Stack pop keeps the slot occupied" in events.ts). The fix
 * mirrors that pattern in `GameBoard.tsx removeCard`'s stack-pop branch:
 * dispatch `REGISTER_DUNGEON_CARD_PROCESSED` for the just-removed card so
 * auto-draw fires on the popped-stack path too.
 *
 * This test simulates the exact reducer-side action sequence the new hook
 * dispatches, then asserts on the observable contract:
 *   • backpack auto-draws into hand,
 *   • the on-enter-hand effect fires on the drawn card.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots } from '@/components/game-board/types';
import type { GameCardData } from '@/components/GameCard';
// Importing this barrel registers the on-enter-hand handler used below.
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeMonster(id: string, hp = 10): GameCardData {
  return {
    id,
    type: 'monster' as const,
    name: `M${id}`,
    value: hp,
    hp,
    maxHp: hp,
    attack: 0,
  } as GameCardData;
}

function makeThunderCard(idSuffix = 'tct'): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic',
    name: '三牌惊雷',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    knightEffect: 'three-card-thunder',
    onEnterHandEffect: 'three-card-thunder-onhand',
    recycleDelay: 2,
  } as unknown as GameCardData;
}

function activeRowOf(...cards: (GameCardData | null)[]): ActiveRowSlots {
  const row: (GameCardData | null)[] = [null, null, null, null, null];
  for (let i = 0; i < cards.length && i < 5; i++) row[i] = cards[i];
  return row as unknown as ActiveRowSlots;
}

/**
 * Reproduce the action sequence that GameBoard.tsx `removeCard` dispatches
 * when killing a dungeon card that has another card stacked beneath it.
 *
 * Mirrors:
 *   1. `dispatch({ type: 'UPDATE_ACTIVE_CARDS', updater: prev => { ...pop... } })`
 *   2. `dispatch({ type: 'SET_ACTIVE_CARD_STACKS', stacks })`
 *   3. `dispatch({ type: 'REGISTER_DUNGEON_CARD_PROCESSED', cardId, source })`
 *      — the line that was missing before the fix.
 *
 * (We skip the DISCARD_OWNED_CARD step because we don't care about graveyard
 * routing here — only the auto-draw side of the contract.)
 */
function dispatchStackPopRemoval(
  state: GameState,
  removedCardId: string,
  slotIdx: number,
): { state: GameState; sideEffects: any[] } {
  const stack = state.activeCardStacks[slotIdx] ?? [];
  if (stack.length === 0) {
    throw new Error('Test setup error: no stack at slotIdx');
  }
  const promoted = stack[stack.length - 1];
  const remaining = stack.slice(0, -1);
  const newStacks = { ...state.activeCardStacks };
  if (remaining.length === 0) {
    delete newStacks[slotIdx];
  } else {
    newStacks[slotIdx] = remaining;
  }

  // The hook fires `REGISTER_DUNGEON_CARD_PROCESSED` (which only bumps
  // `pendingAutoDrawCount`); a React effect in `useEventSystem` then notices
  // the counter change and dispatches `PROCESS_AUTO_DRAWS`. We replay both
  // here so the test exercises the full backpack→hand draw chain end-to-end.
  return drain(state, [
    {
      type: 'UPDATE_ACTIVE_CARDS',
      updater: (prev: ActiveRowSlots) => {
        const next = [...prev] as ActiveRowSlots;
        next[slotIdx] = promoted;
        return next;
      },
    } as GameAction,
    { type: 'SET_ACTIVE_CARD_STACKS', stacks: newStacks } as GameAction,
    {
      type: 'REGISTER_DUNGEON_CARD_PROCESSED',
      cardId: removedCardId,
      source: 'slot-cleared',
    } as GameAction,
    { type: 'PROCESS_AUTO_DRAWS' } as GameAction,
  ]);
}

describe('Stack-pop dungeon removal — auto-draw + on-enter-hand chain', () => {
  it('auto-draws from backpack to hand when the killed dungeon card is on top of a stack', () => {
    const topMonster = makeMonster('top-1');
    const stackedMonster = makeMonster('stacked-1');
    const filler: GameCardData = {
      id: 'filler-1',
      type: 'magic',
      name: 'Filler',
      value: 0,
      image: '',
    } as GameCardData;

    const state = makeState({
      activeCards: activeRowOf(topMonster),
      activeCardStacks: { 0: [stackedMonster] },
      backpackItems: [filler] as GameCardData[],
      handCards: [],
    });

    const result = dispatchStackPopRemoval(state, topMonster.id, 0);

    expect(result.state.activeCards[0]?.id).toBe(stackedMonster.id);
    expect(result.state.activeCardStacks[0]).toBeUndefined();

    expect(result.state.processedDungeonCardIds).toContain(topMonster.id);

    expect(result.state.handCards.find(c => c.id === filler.id)).toBeDefined();
    expect(result.state.backpackItems.find(c => c.id === filler.id)).toBeUndefined();
    expect(result.state.pendingAutoDrawCount).toBe(0);
  });

  it('fires 三牌惊雷 上手 when it is auto-drawn from backpack on a stack-pop kill', () => {
    const topMonster = makeMonster('top-2');
    const stackedMonster = makeMonster('stacked-2');
    const m1 = makeMonster('m1', 10);
    const thunderCard = makeThunderCard('stack-pop');

    const state = makeState({
      activeCards: activeRowOf(topMonster, m1),
      activeCardStacks: { 0: [stackedMonster] },
      backpackItems: [thunderCard] as GameCardData[],
      handCards: [],
    });

    const result = dispatchStackPopRemoval(state, topMonster.id, 0);

    expect(result.state.handCards.find(c => c.id === thunderCard.id)).toBeDefined();

    const monsterAfter = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(monsterAfter?.hp).toBe(9);

    const stackedAfter = result.state.activeCards.find(c => c?.id === stackedMonster.id) as { hp: number } | undefined;
    expect(stackedAfter?.hp).toBe(stackedMonster.hp! - 1);
  });

  it('does NOT double-register if the card id is already in processedDungeonCardIds', () => {
    const topMonster = makeMonster('top-3');
    const stackedMonster = makeMonster('stacked-3');
    const filler: GameCardData = {
      id: 'filler-3',
      type: 'magic',
      name: 'Filler',
      value: 0,
      image: '',
    } as GameCardData;

    const state = makeState({
      activeCards: activeRowOf(topMonster),
      activeCardStacks: { 0: [stackedMonster] },
      backpackItems: [filler] as GameCardData[],
      handCards: [],
      processedDungeonCardIds: [topMonster.id],
    });

    const result = dispatchStackPopRemoval(state, topMonster.id, 0);

    const occurrences = result.state.processedDungeonCardIds.filter(id => id === topMonster.id).length;
    expect(occurrences).toBe(1);
    expect(result.state.handCards.find(c => c.id === filler.id)).toBeUndefined();
  });
});
