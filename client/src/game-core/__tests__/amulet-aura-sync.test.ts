/**
 * Regression: amulet aura must sync to slotTempAttack/slotTempArmor whenever
 * `amuletSlots` is mutated.
 *
 * Bug history: when an amulet was destroyed mid-turn (e.g. by Crossroads
 * 命运十字路口 destroying the strength amulet beneath it), the +4 temporary
 * attack from the strength amulet aura stayed active until the next
 * waterfall. Each amulet-removal site had to remember to call
 * `computeAmuletAuraReversal` manually; some sites (wraith destroy amulet,
 * crossroads destroy below, recall-equipment, etc.) did not, leaving stale
 * auras.
 *
 * Fix: `postProcessAmuletAura` in reducer.ts is run after every action and
 * automatically diffs the strength/balance signature of `amuletSlots` to
 * apply the corresponding slotTempAttack/slotTempArmor delta — making aura
 * tracking purely derived from amulet presence.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import {
  BALANCE_ATTACK_BONUS,
  BALANCE_ATTACK_PENALTY,
  BALANCE_SHIELD_BONUS,
  BALANCE_SHIELD_PENALTY,
} from '../constants';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

const strengthAmulet = {
  id: 'strength-1',
  type: 'amulet' as const,
  name: '力量护符',
  value: 0,
  amuletEffect: 'strength',
};

const balanceAmulet = {
  id: 'balance-1',
  type: 'amulet' as const,
  name: '均衡护符',
  value: 0,
  amuletEffect: 'balance',
};

const heartAmulet = {
  id: 'heart-1',
  type: 'amulet' as const,
  name: '生命护符',
  value: 0,
  amuletEffect: 'life',
};

describe('postProcessAmuletAura — automatic aura ↔ amulet sync', () => {
  describe('removal via UPDATE_AMULET_SLOTS', () => {
    it('removes strength aura (+4/+4 attack) when strength amulet is removed', () => {
      const state = makeState({
        amuletSlots: [strengthAmulet] as any,
        slotTempAttack: { equipmentSlot1: 4, equipmentSlot2: 4 },
        amuletAuraAppliedThisWave: true,
      });

      const result = reduce(state, {
        type: 'UPDATE_AMULET_SLOTS',
        updater: prev => prev.slice(0, -1),
      });

      expect(result.state.amuletSlots).toHaveLength(0);
      expect(result.state.slotTempAttack.equipmentSlot1).toBe(0);
      expect(result.state.slotTempAttack.equipmentSlot2).toBe(0);
    });

    it('removes balance aura (attack/armor) when balance amulet is removed', () => {
      const state = makeState({
        amuletSlots: [balanceAmulet] as any,
        slotTempAttack: { equipmentSlot1: BALANCE_ATTACK_BONUS, equipmentSlot2: -BALANCE_ATTACK_PENALTY },
        slotTempArmor: { equipmentSlot1: -BALANCE_SHIELD_PENALTY, equipmentSlot2: BALANCE_SHIELD_BONUS },
        amuletAuraAppliedThisWave: true,
      });

      const result = reduce(state, {
        type: 'UPDATE_AMULET_SLOTS',
        updater: prev => prev.slice(0, -1),
      });

      expect(result.state.amuletSlots).toHaveLength(0);
      expect(result.state.slotTempAttack.equipmentSlot1).toBe(0);
      expect(result.state.slotTempAttack.equipmentSlot2).toBe(0);
      expect(result.state.slotTempArmor.equipmentSlot1).toBe(0);
      expect(result.state.slotTempArmor.equipmentSlot2).toBe(0);
    });

    it('preserves non-aura temp bonuses while reversing aura', () => {
      // 10 = 6 (other temp) + 4 (strength aura)
      const state = makeState({
        amuletSlots: [strengthAmulet] as any,
        slotTempAttack: { equipmentSlot1: 10, equipmentSlot2: 10 },
        amuletAuraAppliedThisWave: true,
      });

      const result = reduce(state, {
        type: 'UPDATE_AMULET_SLOTS',
        updater: prev => prev.slice(0, -1),
      });

      expect(result.state.slotTempAttack.equipmentSlot1).toBe(6);
      expect(result.state.slotTempAttack.equipmentSlot2).toBe(6);
    });

    it('does not modify temp slots when removing a non-aura amulet (e.g. life)', () => {
      const state = makeState({
        amuletSlots: [heartAmulet] as any,
        slotTempAttack: { equipmentSlot1: 7, equipmentSlot2: 3 },
      });

      const result = reduce(state, {
        type: 'UPDATE_AMULET_SLOTS',
        updater: prev => prev.slice(0, -1),
      });

      expect(result.state.slotTempAttack.equipmentSlot1).toBe(7);
      expect(result.state.slotTempAttack.equipmentSlot2).toBe(3);
    });
  });

  describe('removal via REMOVE_AMULET', () => {
    it('reverses strength aura when REMOVE_AMULET targets the strength amulet', () => {
      const state = makeState({
        amuletSlots: [strengthAmulet, heartAmulet] as any,
        slotTempAttack: { equipmentSlot1: 4, equipmentSlot2: 4 },
      });

      const result = reduce(state, { type: 'REMOVE_AMULET', cardId: 'strength-1' });

      expect(result.state.amuletSlots).toHaveLength(1);
      expect(result.state.slotTempAttack.equipmentSlot1).toBe(0);
      expect(result.state.slotTempAttack.equipmentSlot2).toBe(0);
    });

    it('does not modify temp slots when REMOVE_AMULET targets a non-aura amulet', () => {
      const state = makeState({
        amuletSlots: [strengthAmulet, heartAmulet] as any,
        slotTempAttack: { equipmentSlot1: 4, equipmentSlot2: 4 },
      });

      const result = reduce(state, { type: 'REMOVE_AMULET', cardId: 'heart-1' });

      expect(result.state.amuletSlots).toHaveLength(1);
      expect(result.state.slotTempAttack.equipmentSlot1).toBe(4);
      expect(result.state.slotTempAttack.equipmentSlot2).toBe(4);
    });
  });

  describe('addition via UPDATE_AMULET_SLOTS', () => {
    it('applies strength aura (+4/+4 attack) immediately when strength amulet is added', () => {
      const state = makeState({
        amuletSlots: [],
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      });

      const result = reduce(state, {
        type: 'UPDATE_AMULET_SLOTS',
        updater: () => [strengthAmulet] as any,
      });

      expect(result.state.amuletSlots).toHaveLength(1);
      expect(result.state.slotTempAttack.equipmentSlot1).toBe(4);
      expect(result.state.slotTempAttack.equipmentSlot2).toBe(4);
    });

    it('applies balance aura immediately when balance amulet is added', () => {
      const state = makeState({
        amuletSlots: [],
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
      });

      const result = reduce(state, {
        type: 'UPDATE_AMULET_SLOTS',
        updater: () => [balanceAmulet] as any,
      });

      expect(result.state.slotTempAttack.equipmentSlot1).toBe(BALANCE_ATTACK_BONUS);
      expect(result.state.slotTempAttack.equipmentSlot2).toBe(-BALANCE_ATTACK_PENALTY);
      expect(result.state.slotTempArmor.equipmentSlot1).toBe(-BALANCE_SHIELD_PENALTY);
      expect(result.state.slotTempArmor.equipmentSlot2).toBe(BALANCE_SHIELD_BONUS);
    });
  });

  describe('removal via DELETE_CARD action (no double-reversal)', () => {
    it('reverses strength aura exactly once when DELETE_CARD removes the amulet', () => {
      const state = makeState({
        amuletSlots: [strengthAmulet] as any,
        slotTempAttack: { equipmentSlot1: 10, equipmentSlot2: 10 },
        discardedCards: [],
      });

      const result = reduce(state, {
        type: 'DELETE_CARD',
        cardId: 'strength-1',
        source: 'amulet',
        destination: 'graveyard',
      });

      expect(result.state.amuletSlots).toHaveLength(0);
      // 10 - 4 (aura reversal) = 6 — NOT 2 (which would be double-reversal)
      expect(result.state.slotTempAttack.equipmentSlot1).toBe(6);
      expect(result.state.slotTempAttack.equipmentSlot2).toBe(6);
    });
  });

  describe('removal via removeAllAmulets event token (no double-reversal)', () => {
    it('reverses strength aura exactly once when removeAllAmulets is applied', () => {
      const state = makeState({
        amuletSlots: [strengthAmulet, heartAmulet] as any,
        slotTempAttack: { equipmentSlot1: 10, equipmentSlot2: 10 },
        discardedCards: [],
      });

      const result = reduce(state, {
        type: 'APPLY_EVENT_EFFECT',
        token: 'removeAllAmulets',
      });

      expect(result.state.amuletSlots).toHaveLength(0);
      // 10 - 4 (aura reversal) = 6 — NOT 2 (which would be double-reversal)
      expect(result.state.slotTempAttack.equipmentSlot1).toBe(6);
      expect(result.state.slotTempAttack.equipmentSlot2).toBe(6);
    });
  });

  describe('multiple aura amulets', () => {
    it('reverses both auras when both strength and balance amulets are removed at once', () => {
      const state = makeState({
        amuletSlots: [strengthAmulet, balanceAmulet] as any,
        slotTempAttack: {
          equipmentSlot1: 4 + BALANCE_ATTACK_BONUS,
          equipmentSlot2: 4 - BALANCE_ATTACK_PENALTY,
        },
        slotTempArmor: {
          equipmentSlot1: -BALANCE_SHIELD_PENALTY,
          equipmentSlot2: BALANCE_SHIELD_BONUS,
        },
      });

      const result = reduce(state, {
        type: 'UPDATE_AMULET_SLOTS',
        updater: () => [],
      });

      expect(result.state.slotTempAttack.equipmentSlot1).toBe(0);
      expect(result.state.slotTempAttack.equipmentSlot2).toBe(0);
      expect(result.state.slotTempArmor.equipmentSlot1).toBe(0);
      expect(result.state.slotTempArmor.equipmentSlot2).toBe(0);
    });
  });

  describe('waterfall pipeline interactions', () => {
    it('WATERFALL_TURN_RESET does not double-reverse strength aura (amulet count unchanged)', () => {
      const state = makeState({
        amuletSlots: [strengthAmulet] as any,
        slotTempAttack: { equipmentSlot1: 4, equipmentSlot2: 4 },
        amuletAuraAppliedThisWave: true,
      });

      const result = reduce(state, { type: 'WATERFALL_TURN_RESET' } as any);

      expect(result.state.slotTempAttack.equipmentSlot1).toBe(0);
      expect(result.state.slotTempAttack.equipmentSlot2).toBe(0);
      expect(result.state.amuletSlots).toHaveLength(1);
    });

    it('WATERFALL_TURN_RESET does not double-reverse balance aura (amulet count unchanged)', () => {
      const state = makeState({
        amuletSlots: [balanceAmulet] as any,
        slotTempAttack: { equipmentSlot1: BALANCE_ATTACK_BONUS, equipmentSlot2: -BALANCE_ATTACK_PENALTY },
        slotTempArmor: { equipmentSlot1: -BALANCE_SHIELD_PENALTY, equipmentSlot2: BALANCE_SHIELD_BONUS },
        amuletAuraAppliedThisWave: true,
      });

      const result = reduce(state, { type: 'WATERFALL_TURN_RESET' } as any);

      expect(result.state.slotTempAttack.equipmentSlot1).toBe(0);
      expect(result.state.slotTempAttack.equipmentSlot2).toBe(0);
      expect(result.state.slotTempArmor.equipmentSlot1).toBe(0);
      expect(result.state.slotTempArmor.equipmentSlot2).toBe(0);
      expect(result.state.amuletSlots).toHaveLength(1);
    });

    it('APPLY_WATERFALL_EFFECTS re-stamps strength aura without double-application', () => {
      const reset = reduce(
        makeState({
          amuletSlots: [strengthAmulet] as any,
          slotTempAttack: { equipmentSlot1: 4, equipmentSlot2: 4 },
          amuletAuraAppliedThisWave: true,
        }),
        { type: 'WATERFALL_TURN_RESET' } as any,
      );

      const effects = reduce(reset.state, { type: 'APPLY_WATERFALL_EFFECTS' } as any);

      expect(effects.state.slotTempAttack.equipmentSlot1).toBe(4);
      expect(effects.state.slotTempAttack.equipmentSlot2).toBe(4);
    });

    it('APPLY_WATERFALL_EFFECTS re-stamps balance aura without double-application', () => {
      const reset = reduce(
        makeState({
          amuletSlots: [balanceAmulet] as any,
          slotTempAttack: { equipmentSlot1: BALANCE_ATTACK_BONUS, equipmentSlot2: -BALANCE_ATTACK_PENALTY },
          slotTempArmor: { equipmentSlot1: -BALANCE_SHIELD_PENALTY, equipmentSlot2: BALANCE_SHIELD_BONUS },
          amuletAuraAppliedThisWave: true,
        }),
        { type: 'WATERFALL_TURN_RESET' } as any,
      );

      const effects = reduce(reset.state, { type: 'APPLY_WATERFALL_EFFECTS' } as any);

      expect(effects.state.slotTempAttack.equipmentSlot1).toBe(BALANCE_ATTACK_BONUS);
      expect(effects.state.slotTempAttack.equipmentSlot2).toBe(-BALANCE_ATTACK_PENALTY);
      expect(effects.state.slotTempArmor.equipmentSlot1).toBe(-BALANCE_SHIELD_PENALTY);
      expect(effects.state.slotTempArmor.equipmentSlot2).toBe(BALANCE_SHIELD_BONUS);
    });

    it('APPLY_WATERFALL_EFFECTS stamps strength aura on top of existing non-aura temp attack', () => {
      // Simulates: 6 of temp attack came from a non-aura source (e.g. magic
      // spell), then waterfall reset zeros it, then APPLY_WATERFALL_EFFECTS
      // adds the +4 strength aura. After both, only the aura should be in
      // the temp slots (non-aura buffs are wave-local and reset).
      const state = makeState({
        amuletSlots: [strengthAmulet] as any,
        slotTempAttack: { equipmentSlot1: 10, equipmentSlot2: 6 },
        amuletAuraAppliedThisWave: true,
      });
      const reset = reduce(state, { type: 'WATERFALL_TURN_RESET' } as any);
      expect(reset.state.slotTempAttack.equipmentSlot1).toBe(0);

      const effects = reduce(reset.state, { type: 'APPLY_WATERFALL_EFFECTS' } as any);
      expect(effects.state.slotTempAttack.equipmentSlot1).toBe(4);
      expect(effects.state.slotTempAttack.equipmentSlot2).toBe(4);
    });

    it('full cycle: equip strength mid-wave → waterfall reset+effects preserves aura', () => {
      // Start of wave with no amulets, then equip strength mid-wave
      let state = makeState({
        amuletSlots: [],
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        amuletAuraAppliedThisWave: true,
      });

      // Equip strength amulet mid-wave — aura applied immediately by post-processor
      state = reduce(state, {
        type: 'UPDATE_AMULET_SLOTS',
        updater: () => [strengthAmulet] as any,
      }).state;
      expect(state.slotTempAttack.equipmentSlot1).toBe(4);
      expect(state.slotTempAttack.equipmentSlot2).toBe(4);

      // Next waterfall: reset zeros temps, effects re-stamps aura
      state = reduce(state, { type: 'WATERFALL_TURN_RESET' } as any).state;
      expect(state.slotTempAttack.equipmentSlot1).toBe(0);
      state = reduce(state, { type: 'APPLY_WATERFALL_EFFECTS' } as any).state;
      expect(state.slotTempAttack.equipmentSlot1).toBe(4);
      expect(state.slotTempAttack.equipmentSlot2).toBe(4);
    });

    it('destroyAllAmuletsAndDiscardHand waterfall discard effect reverses strength aura exactly once', () => {
      // Simulates the discardCard waterfall effect that destroys all amulets
      // (a card with `waterfallEffect: { type: 'destroyAllAmuletsAndDiscardHand' }`
      // gets pushed off the bottom of the dungeon during waterfall planning).
      // Pipeline runs APPLY_WATERFALL_DISCARD_EFFECTS first, then
      // WATERFALL_TURN_RESET + APPLY_WATERFALL_EFFECTS.
      const discardCard: any = {
        id: 'discard-1',
        type: 'monster',
        name: '护符破坏者',
        value: 1,
        waterfallEffect: { type: 'destroyAllAmuletsAndDiscardHand', amount: 0 },
      };
      let state = makeState({
        amuletSlots: [strengthAmulet] as any,
        slotTempAttack: { equipmentSlot1: 4, equipmentSlot2: 4 },
        amuletAuraAppliedThisWave: true,
        discardedCards: [],
        handCards: [],
      });

      // Step 1: discard effect destroys the amulet
      state = reduce(state, {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard,
        nextRemainingDeck: [],
      } as any).state;
      expect(state.amuletSlots).toHaveLength(0);
      // Aura must be reversed exactly once: 4 - 4 = 0 (NOT -4 from double-reversal)
      expect(state.slotTempAttack.equipmentSlot1).toBe(0);
      expect(state.slotTempAttack.equipmentSlot2).toBe(0);

      // Step 2: WATERFALL_TURN_RESET zeros temps (already zero)
      state = reduce(state, { type: 'WATERFALL_TURN_RESET' } as any).state;
      expect(state.slotTempAttack.equipmentSlot1).toBe(0);

      // Step 3: APPLY_WATERFALL_EFFECTS — no amulets, nothing to stamp
      state = reduce(state, { type: 'APPLY_WATERFALL_EFFECTS' } as any).state;
      expect(state.slotTempAttack.equipmentSlot1).toBe(0);
      expect(state.slotTempAttack.equipmentSlot2).toBe(0);
    });

    it('destroyAllAmuletsAndDiscardHand waterfall discard effect reverses balance aura exactly once', () => {
      const discardCard: any = {
        id: 'discard-1',
        type: 'monster',
        name: '护符破坏者',
        value: 1,
        waterfallEffect: { type: 'destroyAllAmuletsAndDiscardHand', amount: 0 },
      };
      let state = makeState({
        amuletSlots: [balanceAmulet] as any,
        slotTempAttack: { equipmentSlot1: BALANCE_ATTACK_BONUS, equipmentSlot2: -BALANCE_ATTACK_PENALTY },
        slotTempArmor: { equipmentSlot1: -BALANCE_SHIELD_PENALTY, equipmentSlot2: BALANCE_SHIELD_BONUS },
        amuletAuraAppliedThisWave: true,
        discardedCards: [],
        handCards: [],
      });

      state = reduce(state, {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard,
        nextRemainingDeck: [],
      } as any).state;

      expect(state.amuletSlots).toHaveLength(0);
      expect(state.slotTempAttack.equipmentSlot1).toBe(0);
      expect(state.slotTempAttack.equipmentSlot2).toBe(0);
      expect(state.slotTempArmor.equipmentSlot1).toBe(0);
      expect(state.slotTempArmor.equipmentSlot2).toBe(0);
    });

    it('turnBoost waterfall discard effect does not double-apply aura (amulets unchanged)', () => {
      // The turnBoost case manually resets+re-stamps aura inline. With the
      // post-processor in place, since amuletSlots reference is unchanged
      // (turnBoost doesn't touch it), the post-processor must NOT fire.
      const discardCard: any = {
        id: 'discard-1',
        type: 'monster',
        name: '推进者',
        value: 1,
        waterfallEffect: { type: 'turnBoost', amount: 1 },
      };
      const state = makeState({
        amuletSlots: [strengthAmulet] as any,
        slotTempAttack: { equipmentSlot1: 10, equipmentSlot2: 4 },
        amuletAuraAppliedThisWave: true,
        discardedCards: [],
      });

      const result = reduce(state, {
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard,
        nextRemainingDeck: [],
      } as any);

      // turnBoost zeros temps then re-stamps strength aura: +4/+4 only
      expect(result.state.slotTempAttack.equipmentSlot1).toBe(4);
      expect(result.state.slotTempAttack.equipmentSlot2).toBe(4);
      expect(result.state.amuletAuraAppliedThisWave).toBe(true);
    });
  });
});
