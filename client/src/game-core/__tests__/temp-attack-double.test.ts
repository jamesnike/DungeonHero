/**
 * 锋芒倍增 (knight:temp-attack-double) — Perm 1 magic.
 *
 * On play: opens slot-select. On RESOLVE_MAGIC_SLOT_SELECTION:
 *   slotTempAttack[slotId] = (cur + 1 * echoMultiplier) * 2
 *
 * Empty slots are valid targets (mirrors weapon-burst / weapon-manual).
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
// Importing this barrel registers all card definitions including
// `knight:temp-attack-double`.
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeCard(idSuffix = 'tad') {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic' as const,
    name: '锋芒倍增',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent' as const,
    magicEffect: '临时攻击 +1 后翻倍。',
    description: 'test',
    knightEffect: 'temp-attack-double',
    recycleDelay: 1,
  };
}

describe('锋芒倍增 主效果: slot-select → (cur+1)*2', () => {
  it('PLAY_CARD opens slot-select pendingMagicAction', () => {
    const card = makeCard('cast');
    const state = makeState({ handCards: [card] });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('temp-attack-double');
    expect((result.state.pendingMagicAction as any).step).toBe('slot-select');
  });

  it('empty slot at +0 → +1 → ×2 = 2', () => {
    const card = makeCard('empty');
    const state = makeState({
      handCards: [card],
      equipmentSlot1: null,
      equipmentSlot2: null,
      pendingMagicAction: { card, effect: 'temp-attack-double', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-double', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(2);
    expect(result.state.slotTempAttack?.equipmentSlot2 ?? 0).toBe(0);
  });

  it('slot already at +3 → +4 → ×2 = 8 (entire temp attack doubles)', () => {
    const card = makeCard('three');
    const state = makeState({
      handCards: [card],
      slotTempAttack: { equipmentSlot1: 3, equipmentSlot2: 0 },
      pendingMagicAction: { card, effect: 'temp-attack-double', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-double', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(8);
  });

  it('only the chosen slot is affected', () => {
    const card = makeCard('one-side');
    const state = makeState({
      handCards: [card],
      slotTempAttack: { equipmentSlot1: 1, equipmentSlot2: 5 },
      pendingMagicAction: { card, effect: 'temp-attack-double', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-double', slotId: 'equipmentSlot2' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(1);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(12);
  });

  it('echoMultiplier doubles the +1 additive before the ×2 multiplication: (1 + 2) × 2 = 6', () => {
    const card = makeCard('echo');
    const state = makeState({
      handCards: [card],
      slotTempAttack: { equipmentSlot1: 1, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'temp-attack-double',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-double', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(6);
  });

  it('clears pendingMagicAction after resolution', () => {
    const card = makeCard('clears');
    const state = makeState({
      handCards: [card],
      pendingMagicAction: { card, effect: 'temp-attack-double', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-double', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.pendingMagicAction).toBeNull();
  });
});
