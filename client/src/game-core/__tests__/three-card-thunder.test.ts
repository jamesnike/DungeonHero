/**
 * 三牌惊雷 (knight:three-card-thunder) — Perm 2 magic.
 *
 * Main effect (PLAY_CARD):
 *   - If state.backpackItems.length === 3:
 *       deal 9 spell damage (with permanent spell-damage bonus + amplifyBonus)
 *       to every monster in the active row.
 *   - Otherwise:
 *       card is consumed (full-cost no-op), no damage dealt.
 *   - If 0 monsters present (and condition met), no damage.
 *
 * On-enter-hand effect (TRIGGER_ON_ENTER_HAND):
 *   - Deals 1 spell damage to every monster in the active row, every time
 *     the card enters the hand (e.g. ADD_CARD_TO_HAND from any source that
 *     doesn't set _skipOnEnterHand).
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots } from '@/components/game-board/types';
// Importing this barrel registers all card definitions and on-enter-hand
// handlers, including `knight:three-card-thunder` and
// `three-card-thunder-onhand`.
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeCard(idSuffix = 'tct') {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic' as const,
    name: '三牌惊雷',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent' as const,
    magicEffect: '背包恰好 3 张时全场 9 点法伤；上手全场 1 点法伤。',
    description: 'test',
    knightEffect: 'three-card-thunder',
    onEnterHandEffect: 'three-card-thunder-onhand',
    recycleDelay: 2,
  };
}

function makeMonster(id: string, hp = 50) {
  return {
    id,
    type: 'monster' as const,
    name: `M${id}`,
    value: hp,
    hp,
    maxHp: hp,
    attack: 0,
  };
}

function makeFiller(id: string) {
  return {
    id,
    type: 'magic' as const,
    name: 'Filler',
    value: 0,
    image: '',
  };
}

function activeRowOf(...monsters: ReturnType<typeof makeMonster>[]): ActiveRowSlots {
  const row: (ReturnType<typeof makeMonster> | null)[] = [null, null, null, null, null];
  for (let i = 0; i < monsters.length && i < 5; i++) row[i] = monsters[i];
  return row as unknown as ActiveRowSlots;
}

// ---------------------------------------------------------------------------
// Main effect (PLAY_CARD)
// ---------------------------------------------------------------------------

describe('三牌惊雷 main effect (PLAY_CARD)', () => {
  it('backpack has exactly 3 cards: deals 9 damage to every monster', () => {
    const card = makeCard('hit');
    const state = makeState({
      handCards: [card],
      backpackItems: [makeFiller('a'), makeFiller('b'), makeFiller('c')] as any,
      activeCards: activeRowOf(makeMonster('m1', 50), makeMonster('m2', 50), makeMonster('m3', 50)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const monsters = result.state.activeCards.filter(c => c?.type === 'monster') as Array<{ id: string; hp: number }>;
    expect(monsters.find(m => m.id === 'm1')?.hp).toBe(41);
    expect(monsters.find(m => m.id === 'm2')?.hp).toBe(41);
    expect(monsters.find(m => m.id === 'm3')?.hp).toBe(41);
    // Card is consumed (moved out of hand).
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
  });

  it('backpack has 2 cards: card is consumed but NO damage is dealt', () => {
    const card = makeCard('two');
    const state = makeState({
      handCards: [card],
      backpackItems: [makeFiller('a'), makeFiller('b')] as any,
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const m = result.state.activeCards.find(c => c?.id === 'm1');
    expect(m?.hp).toBe(50);
    // Card consumed.
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
  });

  it('backpack has 4 cards: card is consumed but NO damage is dealt', () => {
    const card = makeCard('four');
    const state = makeState({
      handCards: [card],
      backpackItems: [makeFiller('a'), makeFiller('b'), makeFiller('c'), makeFiller('d')] as any,
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(50);
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
  });

  it('backpack has 0 cards: card is consumed but NO damage is dealt', () => {
    const card = makeCard('empty-bp');
    const state = makeState({
      handCards: [card],
      backpackItems: [] as any,
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(50);
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
  });

  it('backpack has 3 cards but no monsters: card consumed, no damage, no crash', () => {
    const card = makeCard('no-mons');
    const state = makeState({
      handCards: [card],
      backpackItems: [makeFiller('a'), makeFiller('b'), makeFiller('c')] as any,
      activeCards: [null, null, null, null, null] as unknown as ActiveRowSlots,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
  });

  it('permanentSpellDamageBonus is applied: 9 + bonus damage per monster', () => {
    const card = makeCard('bonus');
    const state = makeState({
      handCards: [card],
      backpackItems: [makeFiller('a'), makeFiller('b'), makeFiller('c')] as any,
      activeCards: activeRowOf(makeMonster('m1', 50)),
      permanentSpellDamageBonus: 2,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(39);
  });
});

// ---------------------------------------------------------------------------
// On-enter-hand effect
// ---------------------------------------------------------------------------

describe('三牌惊雷 on-enter-hand effect', () => {
  it('TRIGGER_ON_ENTER_HAND: deals 1 spell damage to every monster', () => {
    const card = makeCard('onhand-1');
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(makeMonster('m1', 10), makeMonster('m2', 10)),
    });
    const result = drain(state, [
      { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction,
    ]);
    const monsters = result.state.activeCards.filter(c => c?.type === 'monster') as Array<{ id: string; hp: number }>;
    expect(monsters.find(m => m.id === 'm1')?.hp).toBe(9);
    expect(monsters.find(m => m.id === 'm2')?.hp).toBe(9);
  });

  it('TRIGGER_ON_ENTER_HAND with no monsters: no damage, no crash', () => {
    const card = makeCard('onhand-empty');
    const state = makeState({
      handCards: [card],
      activeCards: [null, null, null, null, null] as unknown as ActiveRowSlots,
    });
    const result = drain(state, [
      { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction,
    ]);
    // Nothing to assert beyond "no throw" — but verify state is intact.
    expect(result.state.handCards.find(c => c.id === card.id)).toBeDefined();
  });

  it('on-enter-hand applies permanentSpellDamageBonus: deals 1 + bonus per monster', () => {
    const card = makeCard('onhand-bonus');
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(makeMonster('m1', 10)),
      permanentSpellDamageBonus: 3,
    });
    const result = drain(state, [
      { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction,
    ]);
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(6);
  });
});
