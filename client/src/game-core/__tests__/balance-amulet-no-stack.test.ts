/**
 * Regression: Balance/Strength amulet aura must not stack across turns.
 *
 * Bug: After waterfall applied balance (+3/-1), the next START_TURN within
 * the same wave would re-apply it, producing +6/-2 (then +9/-3, ...). The
 * user noticed it after blocking once because that triggers the
 * monster→hero turn transition.
 *
 * Fix: gate START_TURN's safety-net aura re-apply on
 * `state.amuletAuraAppliedThisWave`, which is set true by the waterfall
 * pipeline and reset to false only by WATERFALL_TURN_RESET.
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

const balanceAmulet = {
  id: 'balance-1',
  type: 'amulet' as const,
  name: '均衡护符',
  value: 0,
  amuletEffect: 'balance',
};

const strengthAmulet = {
  id: 'strength-1',
  type: 'amulet' as const,
  name: '力量护符',
  value: 0,
  amuletEffect: 'strength',
};

describe('Balance amulet aura stacking regression', () => {
  it('START_TURN does not re-apply balance aura when already applied this wave', () => {
    // Simulate post-waterfall state: balance aura already in temp slots,
    // flag set by APPLY_WATERFALL_EFFECTS.
    const state = makeState({
      amuletSlots: [balanceAmulet] as any,
      slotTempAttack: { equipmentSlot1: BALANCE_ATTACK_BONUS, equipmentSlot2: -BALANCE_ATTACK_PENALTY },
      slotTempArmor: { equipmentSlot1: -BALANCE_SHIELD_PENALTY, equipmentSlot2: BALANCE_SHIELD_BONUS },
      amuletAuraAppliedThisWave: true,
    });

    const result = reduce(state, { type: 'START_TURN' });

    expect(result.state.slotTempAttack.equipmentSlot1).toBe(BALANCE_ATTACK_BONUS);
    expect(result.state.slotTempAttack.equipmentSlot2).toBe(-BALANCE_ATTACK_PENALTY);
    expect(result.state.slotTempArmor.equipmentSlot1).toBe(-BALANCE_SHIELD_PENALTY);
    expect(result.state.slotTempArmor.equipmentSlot2).toBe(BALANCE_SHIELD_BONUS);
  });

  it('START_TURN does not re-apply strength aura when already applied this wave', () => {
    const state = makeState({
      amuletSlots: [strengthAmulet] as any,
      slotTempAttack: { equipmentSlot1: 4, equipmentSlot2: 4 },
      amuletAuraAppliedThisWave: true,
    });

    const result = reduce(state, { type: 'START_TURN' });

    expect(result.state.slotTempAttack.equipmentSlot1).toBe(4);
    expect(result.state.slotTempAttack.equipmentSlot2).toBe(4);
  });

  it('START_TURN applies balance aura when flag is false (safety-net path)', () => {
    const state = makeState({
      amuletSlots: [balanceAmulet] as any,
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
      amuletAuraAppliedThisWave: false,
    });

    const result = reduce(state, { type: 'START_TURN' });

    expect(result.state.slotTempAttack.equipmentSlot1).toBe(BALANCE_ATTACK_BONUS);
    expect(result.state.slotTempAttack.equipmentSlot2).toBe(-BALANCE_ATTACK_PENALTY);
    expect(result.state.slotTempArmor.equipmentSlot1).toBe(-BALANCE_SHIELD_PENALTY);
    expect(result.state.slotTempArmor.equipmentSlot2).toBe(BALANCE_SHIELD_BONUS);
    expect(result.state.amuletAuraAppliedThisWave).toBe(true);
  });

  it('WATERFALL_TURN_RESET clears the flag and zeros temps', () => {
    const state = makeState({
      slotTempAttack: { equipmentSlot1: BALANCE_ATTACK_BONUS, equipmentSlot2: -BALANCE_ATTACK_PENALTY },
      slotTempArmor: { equipmentSlot1: -BALANCE_SHIELD_PENALTY, equipmentSlot2: BALANCE_SHIELD_BONUS },
      amuletAuraAppliedThisWave: true,
    });

    const result = reduce(state, { type: 'WATERFALL_TURN_RESET' } as any);

    expect(result.state.slotTempAttack.equipmentSlot1).toBe(0);
    expect(result.state.slotTempAttack.equipmentSlot2).toBe(0);
    expect(result.state.slotTempArmor.equipmentSlot1).toBe(0);
    expect(result.state.slotTempArmor.equipmentSlot2).toBe(0);
    expect(result.state.amuletAuraAppliedThisWave).toBe(false);
  });

  it('APPLY_WATERFALL_EFFECTS restores balance aura and sets flag', () => {
    // Simulate the WATERFALL_TURN_RESET → APPLY_WATERFALL_EFFECTS sequence.
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
    expect(effects.state.amuletAuraAppliedThisWave).toBe(true);
  });

  it('full cycle: waterfall → multiple START_TURNs do not stack balance aura', () => {
    let state = makeState({
      amuletSlots: [balanceAmulet] as any,
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
      amuletAuraAppliedThisWave: false,
    });

    // Waterfall pipeline
    state = reduce(state, { type: 'WATERFALL_TURN_RESET' } as any).state;
    state = reduce(state, { type: 'APPLY_WATERFALL_EFFECTS' } as any).state;

    // First START_TURN of the wave
    state = reduce(state, { type: 'START_TURN' }).state;
    expect(state.slotTempAttack.equipmentSlot1).toBe(BALANCE_ATTACK_BONUS);
    expect(state.slotTempAttack.equipmentSlot2).toBe(-BALANCE_ATTACK_PENALTY);

    // Subsequent START_TURNs (after monster turn cycles within same wave)
    // — the bug would have left these at +6/-2, +9/-3, ...
    state = reduce(state, { type: 'START_TURN' }).state;
    state = reduce(state, { type: 'START_TURN' }).state;
    state = reduce(state, { type: 'START_TURN' }).state;

    expect(state.slotTempAttack.equipmentSlot1).toBe(BALANCE_ATTACK_BONUS);
    expect(state.slotTempAttack.equipmentSlot2).toBe(-BALANCE_ATTACK_PENALTY);
    expect(state.slotTempArmor.equipmentSlot1).toBe(-BALANCE_SHIELD_PENALTY);
    expect(state.slotTempArmor.equipmentSlot2).toBe(BALANCE_SHIELD_BONUS);
  });

  it('full cycle: waterfall → multiple START_TURNs do not stack strength aura', () => {
    let state = makeState({
      amuletSlots: [strengthAmulet] as any,
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      amuletAuraAppliedThisWave: false,
    });

    state = reduce(state, { type: 'WATERFALL_TURN_RESET' } as any).state;
    state = reduce(state, { type: 'APPLY_WATERFALL_EFFECTS' } as any).state;

    state = reduce(state, { type: 'START_TURN' }).state;
    state = reduce(state, { type: 'START_TURN' }).state;
    state = reduce(state, { type: 'START_TURN' }).state;

    // Without the fix, this would be 16 (+4 stacked four times)
    expect(state.slotTempAttack.equipmentSlot1).toBe(4);
    expect(state.slotTempAttack.equipmentSlot2).toBe(4);
  });

  it('aura is preserved across waterfall (zeroed then re-applied — net no change)', () => {
    let state = makeState({
      amuletSlots: [strengthAmulet] as any,
      slotTempAttack: { equipmentSlot1: 4, equipmentSlot2: 4 },
      amuletAuraAppliedThisWave: true,
    });

    state = reduce(state, { type: 'WATERFALL_TURN_RESET' } as any).state;
    expect(state.slotTempAttack.equipmentSlot1).toBe(0);

    state = reduce(state, { type: 'APPLY_WATERFALL_EFFECTS' } as any).state;
    expect(state.slotTempAttack.equipmentSlot1).toBe(4);
    expect(state.slotTempAttack.equipmentSlot2).toBe(4);
    expect(state.amuletAuraAppliedThisWave).toBe(true);
  });
});
