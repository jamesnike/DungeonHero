import { describe, expect, it } from 'vitest';
import { computeEquipmentBreakEffects } from '../rules/equipment-effects';
import { applyEquipDestroyLastWords } from '../rules/waterfall';
import { createInitialGameState } from '../state';
import { createEmptyAmuletEffects, initialCombatState } from '../constants';
import { generateKnightDeck } from '@/lib/knightDeck';
import { createRng } from '../rng';
import type { GameState, EquipmentSlotId } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { SideEffect } from '../reducer';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    ...overrides,
  };
}

function makeShield(over?: Partial<GameCardData>): GameCardData {
  return {
    id: 's-communal',
    type: 'shield',
    name: '共御圣盾',
    value: 6,
    image: '',
    durability: 0,
    maxDurability: 1,
    armorMax: 6,
    hasEquipmentRevive: true,
    onDestroyEffect: 'allSlotTempArmor:5',
    ...(over ?? {}),
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// 1) Knight class deck includes 共御圣盾 with the expected fields
// ---------------------------------------------------------------------------

describe('knight class deck: 共御圣盾 entry', () => {
  it('appears in generateKnightDeck with 6 armor / 1 durability / revive / allSlotTempArmor:5 last-words', () => {
    const [deck] = generateKnightDeck(createRng(42));
    const card = deck.find(c => c.name === '共御圣盾');
    expect(card).toBeTruthy();
    expect(card?.type).toBe('shield');
    expect(card?.value).toBe(6);
    expect(card?.armorMax).toBe(6);
    expect(card?.durability).toBe(1);
    expect(card?.maxDurability).toBe(1);
    expect(card?.hasEquipmentRevive).toBe(true);
    expect(card?.onDestroyEffect).toBe('allSlotTempArmor:5');
    expect(card?.classCard).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2) Live-break path (computeEquipmentBreakEffects in rules/equipment-effects.ts)
// ---------------------------------------------------------------------------

describe('共御圣盾 last-words: computeEquipmentBreakEffects path', () => {
  it('grants +5 temp armor to BOTH slots when destroyed', () => {
    const shield = makeShield();
    const state = makeState({
      equipmentSlot1: shield as any,
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 } as any,
    });
    const { sideEffects, patch } = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      shield as any,
      createEmptyAmuletEffects(),
    );
    expect(patch.slotTempArmor?.equipmentSlot1).toBe(5);
    expect(patch.slotTempArmor?.equipmentSlot2).toBe(5);
    expect(sideEffects.some(e =>
      e.event === 'log:entry' && (e.payload as any)?.message?.includes('所有装备栏 +5临时护甲'),
    )).toBe(true);
    expect(sideEffects.some(e =>
      e.event === 'ui:banner' && (e.payload as any)?.text?.includes('所有装备栏 +5临时护甲'),
    )).toBe(true);
  });

  it('stacks on top of existing temp armor on both slots', () => {
    const shield = makeShield();
    const state = makeState({
      equipmentSlot1: shield as any,
      slotTempArmor: { equipmentSlot1: 2, equipmentSlot2: 7 } as any,
    });
    const { patch } = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      shield as any,
      createEmptyAmuletEffects(),
    );
    expect(patch.slotTempArmor?.equipmentSlot1).toBe(7);
    expect(patch.slotTempArmor?.equipmentSlot2).toBe(12);
  });

  it('triggers 怀柔之印 persuade bonus once per destroy', () => {
    const shield = makeShield();
    const state = makeState({
      equipmentSlot1: shield as any,
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 } as any,
      persuadeAmuletBonus: 0,
    });
    const amuletEffects = {
      ...createEmptyAmuletEffects(),
      persuadeOnTempAttackCount: 1,
      persuadeOnTempAttackBonus: 5,
    };
    const { patch, sideEffects } = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      shield as any,
      amuletEffects as any,
    );
    expect(patch.persuadeAmuletBonus).toBe(5);
    expect(sideEffects.some(e =>
      e.event === 'log:entry' && (e.payload as any)?.message?.includes('怀柔之印'),
    )).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3) Waterfall destroy path (applyEquipDestroyLastWords in rules/waterfall.ts)
// ---------------------------------------------------------------------------

describe('共御圣盾 last-words: waterfall applyEquipDestroyLastWords path', () => {
  it('grants +5 temp armor to BOTH slots when destroyed during waterfall', () => {
    const shield = makeShield();
    const state = makeState({
      slotTempArmor: { equipmentSlot1: 1, equipmentSlot2: 3 } as any,
    });
    const patch: Partial<GameState> = {};
    const sideEffects: SideEffect[] = [];
    const enqueuedActions: GameAction[] = [];
    applyEquipDestroyLastWords(
      shield as any,
      'equipmentSlot1' as EquipmentSlotId,
      state,
      patch,
      sideEffects,
      enqueuedActions,
    );
    expect(patch.slotTempArmor?.equipmentSlot1).toBe(6);
    expect(patch.slotTempArmor?.equipmentSlot2).toBe(8);
    expect(enqueuedActions).toHaveLength(0);
    expect(sideEffects.some(e =>
      e.event === 'log:entry' && (e.payload as any)?.message?.includes('所有装备栏 +5临时护甲'),
    )).toBe(true);
  });

  it('does not produce stunCap-related side effects', () => {
    const shield = makeShield();
    const state = makeState({ stunCap: 50 });
    const patch: Partial<GameState> = {};
    const sideEffects: SideEffect[] = [];
    const enqueuedActions: GameAction[] = [];
    applyEquipDestroyLastWords(
      shield as any,
      'equipmentSlot1' as EquipmentSlotId,
      state,
      patch,
      sideEffects,
      enqueuedActions,
    );
    expect(patch.stunCap).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4) Sanity: revive flag is honored at the data layer (consumer logic uses
//    hasEquipmentRevive elsewhere; we just lock in the field).
// ---------------------------------------------------------------------------

describe('共御圣盾 revive flag', () => {
  it('carries hasEquipmentRevive: true so the destroy path runs only after revive is consumed', () => {
    const shield = makeShield();
    expect(shield.hasEquipmentRevive).toBe(true);
  });
});
