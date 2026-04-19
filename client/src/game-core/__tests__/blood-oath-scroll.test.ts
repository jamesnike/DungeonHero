/**
 * 血誓回卷 (blood oath scroll) tests
 *
 * Covers:
 *   1. Main effect: lose 3 HP and flip a chosen "已翻转" active-row card back to its original.
 *   2. Auto-resolve when exactly one flipped card is in active row (no UI step).
 *   3. play_full_cost_noop semantics: still costs 3 HP and finalizes when no
 *      flipped target exists.
 *   4. dungeon-select branch: with 2+ flipped targets, RESOLVE_DUNGEON_CARD_SELECTION
 *      replaces the chosen cell with the saved _flipBackCard.
 *   5. 上手: blood-oath-scroll-onhand heals 1 HP, capped at maxHp.
 *   6. End-to-end ADD_CARD_TO_HAND triggers heal automatically via the pipeline.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { INITIAL_HP } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
// Importing this barrel registers the on-enter-hand handler and any card
// definitions; resolveKnightPermanentMagic is called via routing.
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeBloodOathScroll(idSuffix = 'bos'): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic',
    name: '血誓回卷',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    magicEffect: '将一张已翻转的牌翻回去。',
    knightEffect: 'flip-back-active',
    onEnterHandEffect: 'blood-oath-scroll-onhand',
    description: 'test',
    recycleDelay: 2,
  } as any;
}

/** Helper: a "post-flip" active-row card with `_flipBackCard` pointing at the original. */
function makeFlippedCard(idSuffix: string, name: string, originalName: string): GameCardData {
  const original: GameCardData = {
    id: `${idSuffix}-orig`,
    type: 'event' as any,
    name: originalName,
    value: 0,
    image: '',
  } as any;
  return {
    id: idSuffix,
    type: 'event' as any,
    name,
    value: 0,
    image: '',
    _flipBackCard: original,
  } as any;
}

// ---------------------------------------------------------------------------
// 上手 handler
// ---------------------------------------------------------------------------

describe('blood-oath-scroll-onhand handler', () => {
  it('heals 1 HP when triggered', () => {
    const card = makeBloodOathScroll('onhand-1');
    const state = makeState({
      handCards: [card],
      hp: 10,
    });
    const result = drain(state, [
      { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction,
    ]);
    expect(result.state.hp).toBe(11);
  });

  it('respects maxHp cap (no overheal)', () => {
    // maxHp is computed dynamically as INITIAL_HP + bonuses; with a fresh
    // state and no bonuses, INITIAL_HP IS the cap. Putting hp at the cap should
    // make the +1 heal a no-op.
    const card = makeBloodOathScroll('onhand-cap');
    const state = makeState({
      handCards: [card],
      hp: INITIAL_HP,
    });
    const result = drain(state, [
      { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction,
    ]);
    expect(result.state.hp).toBe(INITIAL_HP);
  });

  it('fires automatically when ADD_CARD_TO_HAND adds the card (pipeline)', () => {
    const card = makeBloodOathScroll('onhand-pipeline');
    const state = makeState({
      handCards: [],
      hp: 5,
    });
    const result = drain(state, [{ type: 'ADD_CARD_TO_HAND', card } as GameAction]);
    expect(result.state.handCards.some(c => c.id === card.id)).toBe(true);
    expect(result.state.hp).toBe(6);
  });

  it('does NOT trigger heal for cloned/copied cards (_skipOnEnterHand: true)', () => {
    const card = { ...makeBloodOathScroll('onhand-clone'), _skipOnEnterHand: true } as any;
    const state = makeState({ handCards: [], hp: 5 });
    const result = drain(state, [{ type: 'ADD_CARD_TO_HAND', card } as GameAction]);
    expect(result.state.hp).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 主效果: lose 3 HP + flip back
// ---------------------------------------------------------------------------

describe('血誓回卷 主效果 (flip-back-active)', () => {
  it('auto-resolves when exactly one flipped card is in active row: lose 3 HP and flip back', () => {
    const card = makeBloodOathScroll('main-1');
    const flipped = makeFlippedCard('flip-1', '宝箱（已开启）', '神秘宝箱');
    const state = makeState({
      handCards: [card],
      hp: 20,
      // place flipped card in cell index 2; rest empty.
      activeCards: [null, null, flipped, null, null] as any,
    });
    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    // HP cost applied (3 self-damage, no armor by default).
    expect(result.state.hp).toBeLessThanOrEqual(20 - 3);
    // The flipped cell is now replaced by the saved original.
    const cell = (result.state.activeCards as (GameCardData | null)[])[2];
    expect(cell?.id).toBe('flip-1-orig');
    expect(cell?.name).toBe('神秘宝箱');
    // Card no longer in hand (consumed / went to perm recycle).
    expect(result.state.handCards.some(c => c.id === card.id)).toBe(false);
    // No pending magic action (auto-resolved).
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('opens dungeon-select when 2+ flipped cards exist', () => {
    const card = makeBloodOathScroll('main-multi');
    const flippedA = makeFlippedCard('flip-A', '宝箱（已开启）', '神秘宝箱');
    const flippedB = makeFlippedCard('flip-B', '骰盅（已开启）', '命运骰盅');
    const state = makeState({
      handCards: [card],
      hp: 20,
      activeCards: [flippedA, null, null, flippedB, null] as any,
    });
    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('flip-back-active');
    expect((result.state.pendingMagicAction as any).step).toBe('dungeon-select');
    // HP cost was already applied at cast time (before selection).
    expect(result.state.hp).toBeLessThanOrEqual(20 - 3);
  });

  it('RESOLVE_DUNGEON_CARD_SELECTION replaces the chosen flipped cell with its _flipBackCard', () => {
    const card = makeBloodOathScroll('main-pick');
    const flippedA = makeFlippedCard('flip-A2', '宝箱（已开启）', '神秘宝箱');
    const flippedB = makeFlippedCard('flip-B2', '骰盅（已开启）', '命运骰盅');
    const state = makeState({
      handCards: [card],
      hp: 20,
      activeCards: [flippedA, null, null, flippedB, null] as any,
      pendingMagicAction: {
        card,
        effect: 'flip-back-active',
        step: 'dungeon-select',
        prompt: '选择一张已翻转卡牌。',
      } as any,
    });

    const result = drain(state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'flip-B2', targetIndex: 3 } as GameAction,
    ]);
    const cell = (result.state.activeCards as (GameCardData | null)[])[3];
    expect(cell?.id).toBe('flip-B2-orig');
    expect(cell?.name).toBe('命运骰盅');
    // The other flipped card is untouched.
    const cellA = (result.state.activeCards as (GameCardData | null)[])[0];
    expect(cellA?.id).toBe('flip-A2');
    // Pending action cleared.
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('rejects selecting a non-flipped card and keeps pending action open', () => {
    const card = makeBloodOathScroll('main-bad');
    const flipped = makeFlippedCard('flip-good', '宝箱（已开启）', '神秘宝箱');
    const monster: GameCardData = {
      id: 'mon-1',
      type: 'monster',
      name: 'Goblin',
      value: 3,
      image: '',
    } as any;
    const state = makeState({
      handCards: [card],
      activeCards: [flipped, monster, null, null, null] as any,
      pendingMagicAction: {
        card,
        effect: 'flip-back-active',
        step: 'dungeon-select',
        prompt: '...',
      } as any,
    });

    const result = drain(state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'mon-1', targetIndex: 1 } as GameAction,
    ]);
    // Pending stays — monster is not a flipped target.
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('flip-back-active');
    // Flipped card untouched.
    const cell0 = (result.state.activeCards as (GameCardData | null)[])[0];
    expect(cell0?.id).toBe('flip-good');
  });

  it('play_full_cost_noop: with no flipped targets, still costs 3 HP and finalizes', () => {
    const card = makeBloodOathScroll('main-empty');
    const monster: GameCardData = {
      id: 'mon-2',
      type: 'monster',
      name: 'Goblin',
      value: 3,
      image: '',
    } as any;
    const state = makeState({
      handCards: [card],
      hp: 20,
      activeCards: [monster, null, null, null, null] as any,
    });
    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    expect(result.state.hp).toBeLessThanOrEqual(20 - 3);
    // No pending action; card consumed.
    expect(result.state.pendingMagicAction).toBeNull();
    expect(result.state.handCards.some(c => c.id === card.id)).toBe(false);
  });

  it('does NOT target cards that have a flipTarget themselves (i.e. not yet flipped)', () => {
    const card = makeBloodOathScroll('main-source');
    // A card *with* flipTarget is the pre-flip source — UI defines it as
    // "未翻转" so we should ignore it. Even if it also somehow has _flipBackCard
    // (sanity check), the rule excludes it.
    const sourceCard: GameCardData = {
      id: 'pre-flip',
      type: 'event' as any,
      name: '神秘宝箱',
      value: 0,
      image: '',
      flipTarget: { toCard: { id: 'opened', type: 'event' as any, name: '宝箱（已开启）', value: 0, image: '' } } as any,
      _flipBackCard: { id: 'should-not-target', type: 'event' as any, name: 'whatever', value: 0, image: '' } as any,
    } as any;
    const state = makeState({
      handCards: [card],
      hp: 20,
      activeCards: [sourceCard, null, null, null, null] as any,
    });
    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);
    // Should fall into the no-target branch: cost paid, no flip happened.
    expect(result.state.hp).toBeLessThanOrEqual(20 - 3);
    const cell = (result.state.activeCards as (GameCardData | null)[])[0];
    expect(cell?.id).toBe('pre-flip');
  });
});
