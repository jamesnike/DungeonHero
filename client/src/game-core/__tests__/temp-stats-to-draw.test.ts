/**
 * 战势化符 (knight:temp-stats-to-draw) — Perm 1 magic.
 *
 * On play: opens slot-select. On RESOLVE_MAGIC_SLOT_SELECTION:
 *   pool = slotTempAttack[slotId] + slotTempArmor[slotId]
 *   drawCount = floor(pool / 3) * echoMultiplier
 *   draw `drawCount` cards from backpack (capped by hand limit / backpack size)
 *
 * - Empty slot is allowed (pool = 0 → 0 cards, still resolves)
 * - Always finalizes the magic (consumes the card even at 0 draws)
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

function makeCard(idSuffix = 'tstd') {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic' as const,
    name: '战势化符',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent' as const,
    magicEffect: '永久魔法：选择一个装备栏，按 (临时攻击+临时护甲)÷3 抽牌。',
    description: 'test',
    knightEffect: 'temp-stats-to-draw',
    recycleDelay: 1,
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

describe('战势化符 主效果: slot-select → floor((tempAtk+tempArm)/3) 抽牌', () => {
  it('PLAY_CARD opens slot-select pendingMagicAction', () => {
    const card = makeCard('cast');
    const state = makeState({ handCards: [card] });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('temp-stats-to-draw');
    expect((result.state.pendingMagicAction as any).step).toBe('slot-select');
  });

  it('empty slot, no temp stats → draws 0 but still resolves', () => {
    const card = makeCard('zero');
    const state = makeState({
      handCards: [card],
      backpackItems: [makeBackpackCard('bp-1'), makeBackpackCard('bp-2')],
      equipmentSlot1: null,
      equipmentSlot2: null,
      pendingMagicAction: { card, effect: 'temp-stats-to-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-stats-to-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.backpackItems.length).toBe(2);
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('pool = 5 (atk 3 + arm 2) → floor(5/3) = 1 card drawn', () => {
    const card = makeCard('p5');
    const state = makeState({
      handCards: [card],
      backpackItems: [makeBackpackCard('bp-a'), makeBackpackCard('bp-b'), makeBackpackCard('bp-c')],
      slotTempAttack: { equipmentSlot1: 3, equipmentSlot2: 0 },
      slotTempArmor: { equipmentSlot1: 2, equipmentSlot2: 0 },
      pendingMagicAction: { card, effect: 'temp-stats-to-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-stats-to-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.backpackItems.length).toBe(2);
    const drawnIds = result.state.handCards.map(c => c.id).filter(id => id.startsWith('bp-'));
    expect(drawnIds.length).toBe(1);
  });

  it('pool = 6 (atk 4 + arm 2) → floor(6/3) = 2 cards drawn', () => {
    const card = makeCard('p6');
    const state = makeState({
      handCards: [card],
      backpackItems: [
        makeBackpackCard('bp-a'),
        makeBackpackCard('bp-b'),
        makeBackpackCard('bp-c'),
        makeBackpackCard('bp-d'),
      ],
      slotTempAttack: { equipmentSlot1: 4, equipmentSlot2: 0 },
      slotTempArmor: { equipmentSlot1: 2, equipmentSlot2: 0 },
      pendingMagicAction: { card, effect: 'temp-stats-to-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-stats-to-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.backpackItems.length).toBe(2);
    const drawnIds = result.state.handCards.map(c => c.id).filter(id => id.startsWith('bp-'));
    expect(drawnIds.length).toBe(2);
  });

  it('pool = 9 (atk 5 + arm 4) → floor(9/3) = 3 cards drawn', () => {
    const card = makeCard('p9');
    const bp = Array.from({ length: 5 }, (_, i) => makeBackpackCard(`bp-${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: bp,
      slotTempAttack: { equipmentSlot1: 5, equipmentSlot2: 99 },
      slotTempArmor: { equipmentSlot1: 4, equipmentSlot2: 99 },
      pendingMagicAction: { card, effect: 'temp-stats-to-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-stats-to-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.backpackItems.length).toBe(2);
    const drawnIds = result.state.handCards.map(c => c.id).filter(id => id.startsWith('bp-'));
    expect(drawnIds.length).toBe(3);
  });

  it('only the chosen slot is read (other slot has 99/99, drawn from chosen=2/4)', () => {
    const card = makeCard('one-side');
    const state = makeState({
      handCards: [card],
      backpackItems: [makeBackpackCard('bp-a'), makeBackpackCard('bp-b'), makeBackpackCard('bp-c')],
      slotTempAttack: { equipmentSlot1: 99, equipmentSlot2: 2 },
      slotTempArmor: { equipmentSlot1: 99, equipmentSlot2: 4 },
      pendingMagicAction: { card, effect: 'temp-stats-to-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-stats-to-draw', slotId: 'equipmentSlot2' } as GameAction,
    ]);
    // pool = 2 + 4 = 6 → 2 cards
    const drawnIds = result.state.handCards.map(c => c.id).filter(id => id.startsWith('bp-'));
    expect(drawnIds.length).toBe(2);
  });

  it('echoMultiplier x2: pool=6 → base 2 → 4 cards drawn', () => {
    const card = makeCard('echo');
    const bp = Array.from({ length: 6 }, (_, i) => makeBackpackCard(`bp-e${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: bp,
      slotTempAttack: { equipmentSlot1: 4, equipmentSlot2: 0 },
      slotTempArmor: { equipmentSlot1: 2, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'temp-stats-to-draw',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-stats-to-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.backpackItems.length).toBe(2);
    const drawnIds = result.state.handCards.map(c => c.id).filter(id => id.startsWith('bp-e'));
    expect(drawnIds.length).toBe(4);
  });

  it('echoMultiplier x2, pool=2 → base 0 → 0 cards (zero stays zero after multiply)', () => {
    const card = makeCard('echo-zero');
    const state = makeState({
      handCards: [card],
      backpackItems: [makeBackpackCard('bp-z')],
      slotTempAttack: { equipmentSlot1: 1, equipmentSlot2: 0 },
      slotTempArmor: { equipmentSlot1: 1, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'temp-stats-to-draw',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-stats-to-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.backpackItems.length).toBe(1);
  });

  it('backpack runs dry early: pool=12 → wants 4, only 2 in bp → draws 2 then stops', () => {
    const card = makeCard('dry');
    const state = makeState({
      handCards: [card],
      backpackItems: [makeBackpackCard('bp-x'), makeBackpackCard('bp-y')],
      slotTempAttack: { equipmentSlot1: 6, equipmentSlot2: 0 },
      slotTempArmor: { equipmentSlot1: 6, equipmentSlot2: 0 },
      pendingMagicAction: { card, effect: 'temp-stats-to-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-stats-to-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.backpackItems.length).toBe(0);
    const drawnIds = result.state.handCards.map(c => c.id).filter(id => id.startsWith('bp-'));
    expect(drawnIds.length).toBe(2);
  });

  it('does not modify slotTempAttack / slotTempArmor (read-only on stats)', () => {
    const card = makeCard('readonly');
    const state = makeState({
      handCards: [card],
      backpackItems: [makeBackpackCard('bp-r1'), makeBackpackCard('bp-r2')],
      slotTempAttack: { equipmentSlot1: 4, equipmentSlot2: 0 },
      slotTempArmor: { equipmentSlot1: 2, equipmentSlot2: 0 },
      pendingMagicAction: { card, effect: 'temp-stats-to-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-stats-to-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(4);
    expect(result.state.slotTempArmor?.equipmentSlot1).toBe(2);
  });

  it('clears pendingMagicAction after resolution', () => {
    const card = makeCard('clears');
    const state = makeState({
      handCards: [card],
      pendingMagicAction: { card, effect: 'temp-stats-to-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-stats-to-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.pendingMagicAction).toBeNull();
  });
});
