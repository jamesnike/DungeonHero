/**
 * 囊中锋意 (knight:backpack-temp-attack) — Perm 1 magic.
 *
 * On play: opens slot-select. On RESOLVE_MAGIC_SLOT_SELECTION:
 *   buff = floor(state.backpackItems.length / divisor) * echoMultiplier
 *   divisor = 3 (Lv0) / 2 (Lv1)
 *   slotTempAttack[chosenSlot] += buff
 *
 * - Empty slot is allowed (buff still applies; future equipment inherits it).
 * - Always finalizes the magic (consumes the card even at 0 buff).
 * - Echo: this card routes to recycle bag (recycleDelay: 1) on play, never
 *   visiting backpack, so backpack length is constant between echo iterations.
 *   A-class (× echoMultiplier) ≡ C-class (re-read state) numerically.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction, GameCardData } from '../actions';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeCard(idSuffix = 'btatk', upgradeLevel = 0) {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic' as const,
    name: '囊中锋意',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent' as const,
    magicEffect: '永久魔法：选择一个装备栏，背包每 3 张牌 +1 临时攻击。',
    description: 'test',
    knightEffect: 'backpack-temp-attack',
    recycleDelay: 1,
    upgradeLevel,
  };
}

function makeBackpackCard(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: `BP-${id}`,
    value: 0,
    image: '',
  } as unknown as GameCardData;
}

function makeBackpack(n: number): GameCardData[] {
  return Array.from({ length: n }, (_, i) => makeBackpackCard(`bp-${i}`));
}

describe('囊中锋意 主效果: slot-select → floor(backpack.length / divisor) 临时攻击', () => {
  it('PLAY_CARD opens slot-select pendingMagicAction with effect=backpack-temp-attack', () => {
    const card = makeCard('cast');
    const state = makeState({ handCards: [card] });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('backpack-temp-attack');
    expect((result.state.pendingMagicAction as any).step).toBe('slot-select');
  });

  it('Lv0, backpack=9 → floor(9/3)=3 → slotTempAttack +3 on chosen slot', () => {
    const card = makeCard('lv0', 0);
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(9),
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'backpack-temp-attack',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'backpack-temp-attack', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(3);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(0);
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('Lv0, backpack=2 → floor(2/3)=0 → +0 buff but still resolves', () => {
    const card = makeCard('zero', 0);
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(2),
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'backpack-temp-attack',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'backpack-temp-attack', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(0);
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('Lv0, backpack=10 → floor(10/3)=3 (rounding down)', () => {
    const card = makeCard('round', 0);
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(10),
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'backpack-temp-attack',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'backpack-temp-attack', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(3);
  });

  it('Lv1 (divisor=2), backpack=7 → floor(7/2)=3', () => {
    const card = makeCard('lv1', 1);
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(7),
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'backpack-temp-attack',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'backpack-temp-attack', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(3);
  });

  it('Lv1, backpack=8 → floor(8/2)=4 (compared to Lv0 which would be 2)', () => {
    const card = makeCard('lv1-8', 1);
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(8),
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'backpack-temp-attack',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'backpack-temp-attack', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(4);
  });

  it('empty slot allowed: buff still applied to chosen empty slot', () => {
    const card = makeCard('empty', 0);
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(6),
      equipmentSlot1: null,
      equipmentSlot2: null,
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'backpack-temp-attack',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'backpack-temp-attack', slotId: 'equipmentSlot2' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(2);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(0);
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('only the chosen slot is buffed (other slot untouched)', () => {
    const card = makeCard('one-side', 0);
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(9),
      slotTempAttack: { equipmentSlot1: 5, equipmentSlot2: 7 },
      pendingMagicAction: {
        card,
        effect: 'backpack-temp-attack',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'backpack-temp-attack', slotId: 'equipmentSlot2' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(5);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(7 + 3);
  });

  it('echoMultiplier x2: floor(9/3)=3, ×2=6 buff', () => {
    const card = makeCard('echo', 0);
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(9),
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'backpack-temp-attack',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'backpack-temp-attack', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(6);
  });

  it('echoMultiplier x2 with backpack=2 (base=0) → 0×2=0 (zero stays zero)', () => {
    const card = makeCard('echo-zero', 0);
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(2),
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'backpack-temp-attack',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'backpack-temp-attack', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(0);
  });

  it('preserves existing slotTempAttack on the chosen slot (additive)', () => {
    const card = makeCard('add', 0);
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(6),
      slotTempAttack: { equipmentSlot1: 4, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'backpack-temp-attack',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'backpack-temp-attack', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(4 + 2);
  });

  it('end-to-end: PLAY_CARD then RESOLVE_MAGIC_SLOT_SELECTION (full chain)', () => {
    const card = makeCard('e2e', 0);
    const state = makeState({
      phase: 'playerInput',
      handCards: [card],
      backpackItems: makeBackpack(6),
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect((afterPlay.state.pendingMagicAction as any)?.effect).toBe('backpack-temp-attack');
    const afterResolve = drain(afterPlay.state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'backpack-temp-attack', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(afterResolve.state.slotTempAttack?.equipmentSlot1).toBe(2);
    expect(afterResolve.state.pendingMagicAction).toBeNull();
    // Card routed to recycle bag (recycleDelay: 1), not graveyard.
    expect(afterResolve.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
    expect(afterResolve.state.discardedCards.some(c => c.id === card.id)).toBe(false);
  });

  it('clears pendingMagicAction after resolution', () => {
    const card = makeCard('clears', 0);
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(3),
      pendingMagicAction: {
        card,
        effect: 'backpack-temp-attack',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'backpack-temp-attack', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.pendingMagicAction).toBeNull();
  });
});
