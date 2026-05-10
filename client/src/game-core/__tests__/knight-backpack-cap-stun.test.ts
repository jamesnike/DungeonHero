/**
 * 囊量震慑 (knight:backpack-cap-stun) — Perm 1 magic.
 *
 * Behavior:
 *   - PLAY_CARD: non-interactive. Computes delta = floor(backpackCapacity / divisor),
 *     applies stunCap += delta (× echoMultiplier on echo), capped at 100.
 *   - divisor by upgradeLevel: Lv0 → 4, Lv1 → 3.
 *   - "背包上限" = BASE_BACKPACK_CAPACITY (12) + state.backpackCapacityModifier.
 *     **NOT** state.backpackItems.length.
 *   - stunCap globally capped at 100; surplus silently absorbed (consistent with
 *     眩晕药剂 / 奥术护盾).
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
import { BASE_BACKPACK_CAPACITY } from '../constants';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput' as any,
    ...overrides,
  };
}

function makeCard(idSuffix = 'bc', extras: Record<string, any> = {}): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic',
    name: '囊量震慑',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    knightEffect: 'backpack-cap-stun',
    recycleDelay: 1,
    maxUpgradeLevel: 1,
    ...extras,
  } as GameCardData;
}

describe('囊量震慑 (knight:backpack-cap-stun)', () => {
  describe('Lv 0 (divisor 4)', () => {
    it('default backpack capacity 12 → +floor(12/4) = +3 stun cap', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        stunCap: 10,
        backpackCapacityModifier: 0,
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      expect(result.state.stunCap).toBe(13);
    });

    it('expanded capacity 18 → +floor(18/4) = +4 stun cap', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        stunCap: 0,
        backpackCapacityModifier: 6,
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      expect(result.state.stunCap).toBe(4);
    });

    it('capacity rounds DOWN (floor): 15 / 4 = 3', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        stunCap: 0,
        backpackCapacityModifier: 3,
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      expect(result.state.stunCap).toBe(3);
    });
  });

  describe('Lv 1 (divisor 3)', () => {
    it('default capacity 12 → +floor(12/3) = +4 stun cap', () => {
      const card = makeCard('bc1', { upgradeLevel: 1 });
      const state = makeState({
        handCards: [card] as any,
        stunCap: 5,
        backpackCapacityModifier: 0,
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      expect(result.state.stunCap).toBe(9);
    });

    it('expanded capacity 24 → +floor(24/3) = +8 stun cap', () => {
      const card = makeCard('bc1', { upgradeLevel: 1 });
      const state = makeState({
        handCards: [card] as any,
        stunCap: 10,
        backpackCapacityModifier: 12,
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      expect(result.state.stunCap).toBe(18);
    });
  });

  describe('100% cap', () => {
    it('stunCap already 99 + delta 4 → clamped at 100', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        stunCap: 99,
        backpackCapacityModifier: 4,
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      // capacity = 16, floor(16/4) = 4, but clamped: 99 + 4 → min(100, 103) = 100
      expect(result.state.stunCap).toBe(100);
    });

    it('stunCap already 100 → unchanged', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        stunCap: 100,
        backpackCapacityModifier: 0,
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      expect(result.state.stunCap).toBe(100);
    });
  });

  describe('uses 背包上限, not 背包剩余卡数', () => {
    it('backpack ITEMS empty but capacity 12 → still +3', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        stunCap: 0,
        backpackItems: [] as any, // 0 items
        backpackCapacityModifier: 0, // capacity = 12
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      expect(result.state.stunCap).toBe(3); // floor(12 / 4)
    });

    it('backpack ITEMS full (12 items) but capacity 12 → still +3 (not based on items)', () => {
      const card = makeCard();
      const fillers: GameCardData[] = [];
      for (let i = 0; i < BASE_BACKPACK_CAPACITY; i++) {
        fillers.push({ id: `f${i}`, type: 'magic', name: 'F', value: 0, image: '' } as GameCardData);
      }
      const state = makeState({
        handCards: [card] as any,
        stunCap: 0,
        backpackItems: fillers as any,
        backpackCapacityModifier: 0,
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      expect(result.state.stunCap).toBe(3);
    });
  });

  describe('Echo (A 类) ×N (state.doubleNextMagic = true)', () => {
    it('echoMultiplier=2: capacity 12 / 4 = 3, ×2 = +6', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        stunCap: 10,
        backpackCapacityModifier: 0,
        doubleNextMagic: true,
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      expect(result.state.stunCap).toBe(16);
      // doubleNextMagic 在消耗后应被清零
      expect(result.state.doubleNextMagic).toBe(false);
    });

    it('echo ×2 + already-high cap: 95 + 6 → clamped at 100', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        stunCap: 95,
        backpackCapacityModifier: 0,
        doubleNextMagic: true,
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      expect(result.state.stunCap).toBe(100);
    });
  });

  describe('source card routing', () => {
    it('Perm 1 → goes to permanentMagicRecycleBag with _recycleWaits = 1', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        stunCap: 0,
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      const inBag = result.state.permanentMagicRecycleBag.find(c => c.id === card.id);
      expect(inBag).toBeDefined();
      expect((inBag as GameCardData & { _recycleWaits?: number })._recycleWaits).toBe(1);
      expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
    });

    it('still removed from hand even when stunCap is already 100 (no-op effect)', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        stunCap: 100,
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
      expect(result.state.permanentMagicRecycleBag.find(c => c.id === card.id)).toBeDefined();
    });
  });

  describe('log + banner', () => {
    it('emits log:entry with magic type containing 「囊量震慑」', () => {
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        stunCap: 0,
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      const log = result.sideEffects.find(
        e =>
          e.event === 'log:entry' &&
          (e.payload as any)?.type === 'magic' &&
          String((e.payload as any)?.message ?? '').includes('囊量震慑'),
      );
      expect(log).toBeDefined();
    });
  });

  describe('boundary', () => {
    it('totalGain = 0 (capacity 0) does not write stunCap (no patch)', () => {
      // Practically capacity can't be < BASE (12) without a negative modifier,
      // but contract: when totalGain === 0 we skip the patch. Validate via
      // very small divisor not applicable here; instead simulate negative modifier.
      const card = makeCard();
      const state = makeState({
        handCards: [card] as any,
        stunCap: 50,
        backpackCapacityModifier: -BASE_BACKPACK_CAPACITY, // capacity = 0
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      // floor(0 / 4) = 0, no change
      expect(result.state.stunCap).toBe(50);
    });
  });
});
