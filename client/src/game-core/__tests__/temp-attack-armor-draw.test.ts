/**
 * 攻防协律 (knight:temp-attack-armor-draw) — Perm 1 magic.
 *
 * On play: opens slot-select. On RESOLVE_MAGIC_SLOT_SELECTION:
 *   slotTempAttack[slotId] += N * echo
 *   slotTempArmor[slotId]  += N * echo
 *   draw 1 * echo cards from backpack
 *
 * N = 2 / 4 / 6 by upgradeLevel 0 / 1 / 2.
 * Empty slots are valid targets (mirrors weapon-burst / temp-attack-double).
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

function makeCard(idSuffix = 'taad', upgradeLevel = 0) {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic' as const,
    name: '攻防协律',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent' as const,
    magicEffect: '永久魔法：选择一个装备栏，+2 临时攻击 +2 临时护甲，抽 1 张牌。',
    description: 'test',
    knightEffect: 'temp-attack-armor-draw',
    recycleDelay: 1,
    maxUpgradeLevel: 2,
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

describe('攻防协律 主效果: slot-select → +N 临攻/+N 临护 + 抽 1', () => {
  it('PLAY_CARD opens slot-select pendingMagicAction', () => {
    const card = makeCard('cast');
    const state = makeState({ handCards: [card] });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('temp-attack-armor-draw');
    expect((result.state.pendingMagicAction as any).step).toBe('slot-select');
  });

  it('Lv0: empty slot → +2 temp atk, +2 temp arm, draws 1 card', () => {
    const card = makeCard('lv0');
    const bp = [makeBackpackCard('bp-1')];
    const state = makeState({
      handCards: [card],
      backpackItems: bp,
      equipmentSlot1: null,
      equipmentSlot2: null,
      pendingMagicAction: { card, effect: 'temp-attack-armor-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-armor-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(2);
    expect(result.state.slotTempArmor?.equipmentSlot1).toBe(2);
    expect(result.state.slotTempAttack?.equipmentSlot2 ?? 0).toBe(0);
    expect(result.state.slotTempArmor?.equipmentSlot2 ?? 0).toBe(0);
    expect(result.state.handCards.some(c => c.id === 'bp-1')).toBe(true);
    expect(result.state.backpackItems.length).toBe(0);
  });

  it('Lv1: +4 / +4 (stacks on existing temp values)', () => {
    const card = makeCard('lv1', 1);
    const state = makeState({
      handCards: [card],
      backpackItems: [makeBackpackCard('bp-2')],
      slotTempAttack: { equipmentSlot1: 1, equipmentSlot2: 0 },
      slotTempArmor: { equipmentSlot1: 3, equipmentSlot2: 0 },
      pendingMagicAction: { card, effect: 'temp-attack-armor-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-armor-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(5);
    expect(result.state.slotTempArmor?.equipmentSlot1).toBe(7);
  });

  it('Lv2: +6 / +6', () => {
    const card = makeCard('lv2', 2);
    const state = makeState({
      handCards: [card],
      backpackItems: [makeBackpackCard('bp-3')],
      pendingMagicAction: { card, effect: 'temp-attack-armor-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-armor-draw', slotId: 'equipmentSlot2' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(6);
    expect(result.state.slotTempArmor?.equipmentSlot2).toBe(6);
    expect(result.state.slotTempAttack?.equipmentSlot1 ?? 0).toBe(0);
    expect(result.state.slotTempArmor?.equipmentSlot1 ?? 0).toBe(0);
  });

  it('only the chosen slot is affected', () => {
    const card = makeCard('one-side');
    const state = makeState({
      handCards: [card],
      backpackItems: [makeBackpackCard('bp-4')],
      slotTempAttack: { equipmentSlot1: 1, equipmentSlot2: 5 },
      slotTempArmor: { equipmentSlot1: 2, equipmentSlot2: 0 },
      pendingMagicAction: { card, effect: 'temp-attack-armor-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-armor-draw', slotId: 'equipmentSlot2' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(1);
    expect(result.state.slotTempArmor?.equipmentSlot1).toBe(2);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(7);
    expect(result.state.slotTempArmor?.equipmentSlot2).toBe(2);
  });

  it('echoMultiplier x2: Lv0 → +4/+4 + 2 cards drawn', () => {
    const card = makeCard('echo-lv0');
    const bp = [makeBackpackCard('bp-e1'), makeBackpackCard('bp-e2'), makeBackpackCard('bp-e3')];
    const state = makeState({
      handCards: [card],
      backpackItems: bp,
      pendingMagicAction: {
        card,
        effect: 'temp-attack-armor-draw',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-armor-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(4);
    expect(result.state.slotTempArmor?.equipmentSlot1).toBe(4);
    expect(result.state.backpackItems.length).toBe(1);
    const drawnIds = result.state.handCards.map(c => c.id).filter(id => id.startsWith('bp-e'));
    expect(drawnIds.length).toBe(2);
  });

  it('echoMultiplier x2 at Lv2: +12/+12 + 2 cards', () => {
    const card = makeCard('echo-lv2', 2);
    const state = makeState({
      handCards: [card],
      backpackItems: [makeBackpackCard('bp-e4'), makeBackpackCard('bp-e5')],
      pendingMagicAction: {
        card,
        effect: 'temp-attack-armor-draw',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-armor-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(12);
    expect(result.state.slotTempArmor?.equipmentSlot1).toBe(12);
    expect(result.state.backpackItems.length).toBe(0);
  });

  it('empty backpack: stats still apply, just no card drawn', () => {
    const card = makeCard('empty-bp');
    const state = makeState({
      handCards: [card],
      backpackItems: [],
      pendingMagicAction: { card, effect: 'temp-attack-armor-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-armor-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(2);
    expect(result.state.slotTempArmor?.equipmentSlot1).toBe(2);
    expect(result.state.backpackItems.length).toBe(0);
  });

  it('clears pendingMagicAction after resolution', () => {
    const card = makeCard('clears');
    const state = makeState({
      handCards: [card],
      backpackItems: [makeBackpackCard('bp-c')],
      pendingMagicAction: { card, effect: 'temp-attack-armor-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-armor-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.pendingMagicAction).toBeNull();
  });

  // Regression: user's exact scenario via PLAY_CARD chain.
  // Main-deck Iron Shield (value=3 base), amplified to armorMax=8,
  // equipmentSlotBonuses.shield = 1 (perm shield bonus),
  // armor=4 (damaged), use 攻防协律 Lv0 (+2/+2).
  // Expected after: armor=6, cap=8+1+2=11, displayed as "6/11".
  // User-reported bug: armor displayed as 11 (i.e., armor was refilled to cap).
  it('user scenario: main-deck Iron Shield amplified to 8, perm+1, armor=4 → +2 armor (not refilled)', () => {
    const card = makeCard('user-scenario');
    const ironShield = {
      id: 'iron-main-1',
      type: 'shield' as const,
      name: 'Iron Shield',
      value: 8,
      image: '',
      armor: 4,
      armorMax: 8,
      durability: 2,
      maxDurability: 2,
      onDestroyEffect: 'graveyard-to-hand',
      amplifyBonus: 5,
    };
    const state = makeState({
      handCards: [card],
      backpackItems: [makeBackpackCard('bp-user')],
      equipmentSlot1: ironShield as any,
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 0, shield: 1 },
        equipmentSlot2: { damage: 0, shield: 0 },
      },
      pendingMagicAction: { card, effect: 'temp-attack-armor-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-armor-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempArmor?.equipmentSlot1).toBe(2);
    expect((result.state.equipmentSlot1 as any)?.armor).toBe(6);
    expect((result.state.equipmentSlot1 as any)?.armorMax).toBe(8);
  });
});
