/**
 * 囊中生机 (knight:backpack-cap-heal) — Perm 1 magic.
 *
 * Behavior:
 *   - PLAY_CARD: non-interactive. Computes heal = floor(backpackCapacity / divisor)
 *     × echoMultiplier; enqueues HEAL action.
 *   - divisor by upgradeLevel: Lv0 → 4, Lv1 → 3.
 *   - "背包上限" = max(1, BASE_BACKPACK_CAPACITY (12) + state.backpackCapacityModifier).
 *     **NOT** state.backpackItems.length (mirror of 囊量震慑 backpack-cap-stun).
 *   - HEAL action clamps hp to maxHp (= INITIAL_HP + permanentMaxHpBonus + aura.maxHp);
 *     over-heal silently absorbed. Card still consumed at full HP.
 *   - Echo (A 类): single resolve × echoMultiplier; backpack capacity is stable
 *     within one reduce step so A/C are equivalent.
 *   - Card itself goes to permanentMagicRecycleBag with _recycleWaits = 1
 *     (recycleDelay: 1).
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import { INITIAL_HP } from '../constants';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput' as any,
    ...overrides,
  };
}

function makeCard(idSuffix = 'bch', extras: Record<string, any> = {}): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic',
    name: '囊中生机',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    knightEffect: 'backpack-cap-heal',
    recycleDelay: 1,
    maxUpgradeLevel: 1,
    ...extras,
  } as GameCardData;
}

describe('囊中生机 (knight:backpack-cap-heal)', () => {
  describe('Lv 0 (divisor 4)', () => {
    it('default backpack capacity 12, hp 5 → heal +floor(12/4) = +3 → hp 8', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        hp: 5,
        backpackCapacityModifier: 0,
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
      expect(result.state.hp).toBe(8);
    });

    it('expanded capacity 18, hp 1 → heal +floor(18/4) = +4 → hp 5', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        hp: 1,
        backpackCapacityModifier: 6,
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
      expect(result.state.hp).toBe(5);
    });

    it('rounds DOWN (floor): capacity 15, hp 0 → +floor(15/4) = +3 → hp 3', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        hp: 0,
        backpackCapacityModifier: 3,
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
      expect(result.state.hp).toBe(3);
    });

    it('shrunk capacity 8, hp 5 → +floor(8/4) = +2 → hp 7', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        hp: 5,
        backpackCapacityModifier: -4,
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
      expect(result.state.hp).toBe(7);
    });
  });

  describe('Lv 1 (divisor 3)', () => {
    it('default capacity 12, hp 5 → heal +floor(12/3) = +4 → hp 9', () => {
      const card = makeCard('bch1', { upgradeLevel: 1 });
      const state = makeState({
        handCards: [card] as any,
        hp: 5,
        backpackCapacityModifier: 0,
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
      expect(result.state.hp).toBe(9);
    });

    it('expanded capacity 24, hp 1 → heal +floor(24/3) = +8 → hp 9', () => {
      const card = makeCard('bch1', { upgradeLevel: 1 });
      const state = makeState({
        handCards: [card] as any,
        hp: 1,
        backpackCapacityModifier: 12,
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
      expect(result.state.hp).toBe(9);
    });

    it('Lv1 vs Lv0 at capacity 12: Lv1 heals 4 vs Lv0 heals 3 (divisor 3 vs 4)', () => {
      const cardLv0 = makeCard('lv0');
      const stateLv0 = makeState({
        handCards: [cardLv0] as any,
        hp: 1,
        backpackCapacityModifier: 0,
      });
      const resLv0 = drain(stateLv0, [{ type: 'PLAY_CARD', cardId: cardLv0.id } as GameAction]);
      expect(resLv0.state.hp).toBe(4);

      const cardLv1 = makeCard('lv1', { upgradeLevel: 1 });
      const stateLv1 = makeState({
        handCards: [cardLv1] as any,
        hp: 1,
        backpackCapacityModifier: 0,
      });
      const resLv1 = drain(stateLv1, [{ type: 'PLAY_CARD', cardId: cardLv1.id } as GameAction]);
      expect(resLv1.state.hp).toBe(5);
    });
  });

  describe('maxHp clamp (over-heal silently absorbed)', () => {
    it('hp at maxHp → heal does nothing visible; card still consumed', () => {
      const card = makeCard();
      const maxHp = INITIAL_HP; // permanentMaxHpBonus = 0, no aura
      const state = makeState({
        handCards: [card] as any,
        hp: maxHp,
        backpackCapacityModifier: 0,
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
      expect(result.state.hp).toBe(maxHp); // clamped
      // Card consumed → no longer in hand, lands in recycle bag
      expect(result.state.handCards.some(c => c.id === card.id)).toBe(false);
      expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
    });

    it('partial over-heal: hp = maxHp - 1, heal = 4 → clamped to maxHp', () => {
      const card = makeCard('lv1', { upgradeLevel: 1 });
      const maxHp = INITIAL_HP;
      const state = makeState({
        handCards: [card] as any,
        hp: maxHp - 1,
        backpackCapacityModifier: 0, // capacity 12, divisor 3 → +4
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
      expect(result.state.hp).toBe(maxHp);
    });
  });

  describe('echo', () => {
    it('echoMultiplier 2 doubles heal: capacity 12 / 4 = 3, ×2 = 6', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        hp: 1,
        backpackCapacityModifier: 0,
        doubleNextMagic: true, // engine consumes this and sets echoMultiplier=2
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
      expect(result.state.hp).toBe(7); // 1 + 6
    });

    it('echo with capacity 4, divisor 4 → base 1, ×2 = 2', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        hp: 0,
        backpackCapacityModifier: -8, // capacity = max(1, 12-8) = 4
        doubleNextMagic: true,
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
      expect(result.state.hp).toBe(2); // 0 + 1*2
    });

    it('echo zero stays zero: capacity 3, divisor 4 → base 0, ×2 = 0', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        hp: 5,
        backpackCapacityModifier: -9, // capacity = max(1, 3) = 3
        doubleNextMagic: true,
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
      expect(result.state.hp).toBe(5); // 0 heal
    });
  });

  describe('uses 背包上限, not 背包剩余卡数', () => {
    it('backpack ITEMS empty but capacity 12 → still heal +3', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        hp: 1,
        backpackItems: [] as any, // 0 items
        backpackCapacityModifier: 0, // capacity = 12
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
      expect(result.state.hp).toBe(4); // 1 + 3
    });

    it('backpack ITEMS full but capacity 12 → still heal +3 (capacity not items)', () => {
      const card = makeCard();
      const fillerItems = Array.from({ length: 11 }, (_, i) => ({
        id: `b-${i}`,
        type: 'magic',
        name: 'Filler',
        value: 0,
        image: '',
      })) as GameCardData[];
      const state = makeState({
        handCards: [card] as any,
        hp: 1,
        backpackItems: fillerItems as any,
        backpackCapacityModifier: 0,
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
      expect(result.state.hp).toBe(4); // capacity 12 → +3, not 11/12 things
    });
  });

  describe('routing & finalize', () => {
    it('card goes to permanentMagicRecycleBag (recycleDelay: 1), not graveyard', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        hp: 5,
        backpackCapacityModifier: 0,
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
      expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
      expect(result.state.discardedCards.some(c => c.id === card.id)).toBe(false);
    });

    it('floor 0 heal still consumes the card (zero-cap edge)', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        hp: 5,
        backpackCapacityModifier: -11, // capacity = max(1, 1) = 1; floor(1/4) = 0
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
      expect(result.state.hp).toBe(5); // no heal
      expect(result.state.handCards.some(c => c.id === card.id)).toBe(false);
      expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
    });
  });
});
