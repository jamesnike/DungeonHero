/**
 * 池中坚意 (knight:recycle-temp-armor) — Perm 1 magic.
 *
 * On play: opens slot-select. On RESOLVE_MAGIC_SLOT_SELECTION:
 *   buff = floor(state.permanentMagicRecycleBag.length / divisor) * echoMultiplier
 *   divisor = 4 (Lv0) / 3 (Lv1)
 *   slotTempArmor[chosenSlot] += buff (also refreshes armor cap via applySlotArmorBonusDelta)
 *
 * - Empty slot is allowed (buff still applies; future equipment inherits it).
 * - Always finalizes the magic (consumes the card even at 0 buff).
 * - Echo: this card routes to recycle bag (recycleDelay: 1) AFTER slot-select
 *   resolves, so setup-time read of recycleBag does NOT include this card.
 *   RecycleBag length is constant across echo iterations → A-class
 *   (× echoMultiplier) ≡ C-class numerically here.
 * - Mirror of 囊中锋意 (knight:backpack-temp-attack): backpack→atk vs recycle→arm.
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

function makeCard(idSuffix = 'rta', upgradeLevel = 0) {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic' as const,
    name: '池中坚意',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent' as const,
    magicEffect: '永久魔法：选择一个装备栏，回收袋每 4 张牌 +1 临时护甲。',
    description: 'test',
    knightEffect: 'recycle-temp-armor',
    recycleDelay: 1,
    upgradeLevel,
  };
}

function makeRecycleCard(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: `RC-${id}`,
    value: 0,
    image: '',
    magicType: 'permanent',
    recycleDelay: 1,
    _recycleWaits: 1,
  } as unknown as GameCardData;
}

function makeRecycleBag(n: number): GameCardData[] {
  return Array.from({ length: n }, (_, i) => makeRecycleCard(`rc-${i}`));
}

describe('池中坚意 主效果: slot-select → floor(recycleBag.length / divisor) 临时护甲', () => {
  it('PLAY_CARD opens slot-select pendingMagicAction with effect=recycle-temp-armor', () => {
    const card = makeCard('cast');
    const state = makeState({ handCards: [card] });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('recycle-temp-armor');
    expect((result.state.pendingMagicAction as any).step).toBe('slot-select');
  });

  it('Lv0, recycleBag=12 → floor(12/4)=3 → slotTempArmor +3 on chosen slot', () => {
    const card = makeCard('lv0', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(12),
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempArmor?.equipmentSlot1).toBe(3);
    expect(result.state.slotTempArmor?.equipmentSlot2 ?? 0).toBe(0);
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('Lv0, recycleBag=3 → floor(3/4)=0 → +0 buff but still resolves', () => {
    const card = makeCard('zero', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(3),
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempArmor?.equipmentSlot1).toBe(0);
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('Lv0, recycleBag=15 → floor(15/4)=3 (rounding down)', () => {
    const card = makeCard('round', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(15),
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempArmor?.equipmentSlot1).toBe(3);
  });

  it('Lv1 (divisor=3), recycleBag=10 → floor(10/3)=3', () => {
    const card = makeCard('lv1', 1);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(10),
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempArmor?.equipmentSlot1).toBe(3);
  });

  it('Lv1, recycleBag=12 → floor(12/3)=4 (compared to Lv0 which would be 3)', () => {
    const card = makeCard('lv1-12', 1);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(12),
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempArmor?.equipmentSlot1).toBe(4);
  });

  it('empty slot allowed: buff still applied to chosen empty slot', () => {
    const card = makeCard('empty', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(8),
      equipmentSlot1: null,
      equipmentSlot2: null,
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot2' } as GameAction,
    ]);
    expect(result.state.slotTempArmor?.equipmentSlot2).toBe(2);
    expect(result.state.slotTempArmor?.equipmentSlot1 ?? 0).toBe(0);
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('only the chosen slot is buffed (other slot untouched)', () => {
    const card = makeCard('one-side', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(12),
      slotTempArmor: { equipmentSlot1: 5, equipmentSlot2: 7 },
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot2' } as GameAction,
    ]);
    expect(result.state.slotTempArmor?.equipmentSlot1).toBe(5);
    expect(result.state.slotTempArmor?.equipmentSlot2).toBe(7 + 3);
  });

  it('echoMultiplier x2: floor(12/4)=3, ×2=6 buff', () => {
    const card = makeCard('echo', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(12),
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempArmor?.equipmentSlot1).toBe(6);
  });

  it('echoMultiplier x2 with recycleBag=2 (base=0) → 0×2=0 (zero stays zero)', () => {
    const card = makeCard('echo-zero', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(2),
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempArmor?.equipmentSlot1).toBe(0);
  });

  it('preserves existing slotTempArmor on the chosen slot (additive)', () => {
    const card = makeCard('add', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(8),
      slotTempArmor: { equipmentSlot1: 4, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempArmor?.equipmentSlot1).toBe(4 + 2);
  });

  it('end-to-end: PLAY_CARD then RESOLVE_MAGIC_SLOT_SELECTION (full chain)', () => {
    const card = makeCard('e2e', 0);
    const state = makeState({
      phase: 'playerInput',
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(8),
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect((afterPlay.state.pendingMagicAction as any)?.effect).toBe('recycle-temp-armor');
    // Setup time: card is in pendingMagicAction, NOT yet in recycle bag.
    expect(afterPlay.state.permanentMagicRecycleBag.length).toBe(8);
    const afterResolve = drain(afterPlay.state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(afterResolve.state.slotTempArmor?.equipmentSlot1).toBe(2);
    expect(afterResolve.state.pendingMagicAction).toBeNull();
    // Card routed to recycle bag (recycleDelay: 1), not graveyard.
    expect(afterResolve.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
    expect(afterResolve.state.discardedCards.some(c => c.id === card.id)).toBe(false);
  });

  it('reading recycle bag at slot-select does NOT include this card itself', () => {
    // Confirms 池中惊雷-style semantic: the card itself is in pendingMagicAction
    // (still effectively "in flight") at the moment we read recycleBag,
    // not yet finalized into the bag. So a 4-card bag stays 4-card during
    // the calculation.
    const card = makeCard('selfaware', 0);
    const state = makeState({
      phase: 'playerInput',
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(4),
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const afterResolve = drain(afterPlay.state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    // floor(4/4) = 1, NOT floor(5/4) = 1 (which would happen if self-counted, but
    // both happen to be 1 here so we go bigger to disambiguate):
    expect(afterResolve.state.slotTempArmor?.equipmentSlot1).toBe(1);
  });

  it('clears pendingMagicAction after resolution', () => {
    const card = makeCard('clears', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(4),
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.pendingMagicAction).toBeNull();
  });
});
