/**
 * Swarm passive (`swarmSpawn`) regression: when a dungeon event card is
 * removed from the active row by `COMPLETE_EVENT` (e.g. 墓语密室 flipping into
 * 墓语遗愿, sending the card to the hand and clearing its slot), and a Swarm
 * monster is present elsewhere on the row, a Buglet must spawn at the cleared
 * slot.
 *
 * Prior bug: the swarm-spawn logic lived in the `removeCard` hook in
 * `GameBoard.tsx`, but `reduceCompleteEvent` cleared the slot directly in the
 * reducer. By the time the `event:cardRemoved` side effect reached the hook,
 * the slot was already empty and `removeCard` returned early — the swarm
 * passive never fired.
 *
 * Fix: centralised swarm-spawn into `postProcessActiveCards` in the reducer,
 * which fires whenever ANY action clears a non-Buglet card from a dungeon
 * slot and leaves it empty (event resolution, magic, combat, manual remove).
 *
 * Swarm wins over stack-pop (updated): the player intent (per
 * CARD_POOL_REFERENCE.md "每移除一张地城牌，在该位置生成一只小虫子") is that
 * ANY dungeon-card removal triggers swarm spawn — including stack-pop.
 * Both `reduceCompleteEvent` (events.ts) and `removeCard` (GameBoard.tsx)
 * detect Swarm presence and force a slot-clear when present, leaving the
 * stacked card untouched at the top of `activeCardStacks` so it pops up
 * naturally after the spawned Buglet is later defeated.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeSwarmMonster(id: string = 'swarm-1'): GameCardData {
  return {
    id,
    type: 'monster',
    name: '虫群战士',
    value: 5,
    hp: 8,
    maxHp: 8,
    attack: 5,
    swarmSpawn: true,
    monsterType: 'Swarm',
  } as GameCardData;
}

function makeEventCard(id: string = 'evt-1'): GameCardData {
  return {
    id,
    type: 'event',
    name: '墓语密室',
    value: 0,
  } as GameCardData;
}

describe('Swarm passive — buglet spawn on COMPLETE_EVENT slot clear', () => {
  it('spawns a buglet when an event card is removed from the active row and a Swarm monster is present', () => {
    const eventCard = makeEventCard();
    const swarm = makeSwarmMonster();
    const slots = Array.from({ length: 5 }, () => null) as any;
    slots[0] = eventCard;
    slots[1] = swarm;

    const state = makeState({
      activeCards: slots,
      currentEventCard: eventCard,
    });

    const result = reduce(state, { type: 'COMPLETE_EVENT', skipFlip: true });

    const slotAfter = result.state.activeCards[0];
    expect(slotAfter).not.toBeNull();
    expect(slotAfter?.isBuglet).toBe(true);
    expect(slotAfter?.type).toBe('monster');

    expect(result.state.activeCards[1]?.id).toBe(swarm.id);

    expect(
      result.sideEffects.some(
        e =>
          e.event === 'combat:autoEngage' &&
          (e.payload as { monsterId: string }).monsterId === slotAfter?.id,
      ),
    ).toBe(true);

    expect(
      result.enqueuedActions.some(a => a.type === 'CHECK_HORDE_SWARM'),
    ).toBe(true);
  });

  it('does NOT spawn a buglet when no Swarm monster is present', () => {
    const eventCard = makeEventCard();
    const slots = Array.from({ length: 5 }, () => null) as any;
    slots[0] = eventCard;

    const state = makeState({
      activeCards: slots,
      currentEventCard: eventCard,
    });

    const result = reduce(state, { type: 'COMPLETE_EVENT', skipFlip: true });

    expect(result.state.activeCards[0]).toBeNull();
    expect(
      result.sideEffects.some(e => e.event === 'combat:autoEngage'),
    ).toBe(false);
  });

  it('does NOT spawn a buglet when the removed card was itself a Buglet', () => {
    const buglet: GameCardData = {
      id: 'buglet-1',
      type: 'monster',
      name: '小虫子',
      value: 2,
      hp: 2,
      maxHp: 2,
      attack: 2,
      isBuglet: true,
    } as GameCardData;
    const swarm = makeSwarmMonster();
    const slots = Array.from({ length: 5 }, () => null) as any;
    slots[0] = buglet;
    slots[1] = swarm;

    const state = makeState({ activeCards: slots });

    const result = reduce(state, {
      type: 'UPDATE_ACTIVE_CARDS',
      updater: (prev: any) => {
        const next = [...prev];
        next[0] = null;
        return next;
      },
    } as any);

    expect(result.state.activeCards[0]).toBeNull();
  });

  it('spawns a buglet AT the slot when a stacked card is below, leaving the stacked card on top of activeCardStacks', () => {
    // Swarm wins over stack-pop: per design, every dungeon-card removal
    // triggers swarm spawn — including when the slot would have stack-popped.
    // The buglet appears at the slot, and the stacked card stays in the
    // stack (ready to pop after the buglet is later defeated).
    const eventCard = makeEventCard();
    const swarm = makeSwarmMonster();
    const stackedCard: GameCardData = {
      id: 'stacked-1',
      type: 'monster',
      name: '堆叠怪物',
      value: 3,
      hp: 5,
      maxHp: 5,
      attack: 3,
    } as GameCardData;
    const slots = Array.from({ length: 5 }, () => null) as any;
    slots[0] = eventCard;
    slots[1] = swarm;

    const state = makeState({
      activeCards: slots,
      currentEventCard: eventCard,
      activeCardStacks: { 0: [stackedCard] },
    });

    const result = reduce(state, { type: 'COMPLETE_EVENT', skipFlip: true });

    const slotAfter = result.state.activeCards[0];
    expect(slotAfter).not.toBeNull();
    expect(slotAfter?.isBuglet).toBe(true);
    expect(slotAfter?.id).not.toBe(stackedCard.id);

    expect(result.state.activeCardStacks[0]).toBeDefined();
    expect(result.state.activeCardStacks[0]).toHaveLength(1);
    expect(result.state.activeCardStacks[0]?.[0]?.id).toBe(stackedCard.id);

    expect(
      result.sideEffects.some(
        e =>
          e.event === 'combat:autoEngage' &&
          (e.payload as { monsterId: string }).monsterId === slotAfter?.id,
      ),
    ).toBe(true);

    expect(result.state.processedDungeonCardIds).not.toContain(eventCard.id);
  });

  it('does NOT spawn when the only Swarm monster is stunned', () => {
    const eventCard = makeEventCard();
    const swarm = { ...makeSwarmMonster(), isStunned: true } as GameCardData;
    const slots = Array.from({ length: 5 }, () => null) as any;
    slots[0] = eventCard;
    slots[1] = swarm;

    const state = makeState({
      activeCards: slots,
      currentEventCard: eventCard,
    });

    const result = reduce(state, { type: 'COMPLETE_EVENT', skipFlip: true });

    expect(result.state.activeCards[0]).toBeNull();
  });

  it('GameBoard removeCard path: swarm spawn replaces stack-pop, stacked card stays in activeCardStacks', () => {
    // Mirrors what `removeCard` in GameBoard.tsx now dispatches when a
    // Swarm monster is present on the row: UPDATE_ACTIVE_CARDS with
    // slot[col] = null, NO SET_ACTIVE_CARD_STACKS (stacks unchanged),
    // NO REGISTER_DUNGEON_CARD_PROCESSED (postProcess step 3 will skip
    // step 4 register because curr=buglet after spawn). Asserts the
    // reducer-side contract the hook fix relies on.
    const topMonster: GameCardData = {
      id: 'top-monster',
      type: 'monster',
      name: 'Top',
      value: 4,
      hp: 4,
      maxHp: 4,
      attack: 2,
    } as GameCardData;
    const stackedMonster: GameCardData = {
      id: 'stacked-monster',
      type: 'monster',
      name: 'Stacked',
      value: 3,
      hp: 3,
      maxHp: 3,
      attack: 2,
    } as GameCardData;
    const swarm = makeSwarmMonster();
    const slots = Array.from({ length: 5 }, () => null) as any;
    slots[0] = topMonster;
    slots[1] = swarm;

    const state = makeState({
      activeCards: slots,
      activeCardStacks: { 0: [stackedMonster] },
    });

    const result = reduce(state, {
      type: 'UPDATE_ACTIVE_CARDS',
      updater: (prev: any) => {
        const next = [...prev];
        next[0] = null;
        return next;
      },
    } as any);

    const slotAfter = result.state.activeCards[0];
    expect(slotAfter).not.toBeNull();
    expect(slotAfter?.isBuglet).toBe(true);

    expect(result.state.activeCardStacks[0]).toBeDefined();
    expect(result.state.activeCardStacks[0]).toHaveLength(1);
    expect(result.state.activeCardStacks[0]?.[0]?.id).toBe(stackedMonster.id);

    expect(result.state.processedDungeonCardIds).not.toContain(topMonster.id);
  });

  it('does NOT count the buglet as a "processed dungeon card" for auto-draw / dungeon-gold amulet', () => {
    const eventCard = makeEventCard();
    const swarm = makeSwarmMonster();
    const slots = Array.from({ length: 5 }, () => null) as any;
    slots[0] = eventCard;
    slots[1] = swarm;

    const state = makeState({
      activeCards: slots,
      currentEventCard: eventCard,
    });

    const result = reduce(state, { type: 'COMPLETE_EVENT', skipFlip: true });

    expect(result.state.processedDungeonCardIds).not.toContain(eventCard.id);
    expect(
      result.enqueuedActions.some(
        a =>
          a.type === 'REGISTER_DUNGEON_CARD_PROCESSED' && a.cardId === eventCard.id,
      ),
    ).toBe(false);
  });
});
