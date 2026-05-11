import { describe, expect, it } from 'vitest';
import { computeEquipmentBreakEffects, computeEquipmentDisplacementLastWords } from '../rules/equipment-effects';
import { createInitialGameState } from '../state';
import { createEmptyAmuletEffects, initialCombatState } from '../constants';
import { generateKnightDeck } from '@/lib/knightDeck';
import { createRng } from '../rng';
import type { GameState, EquipmentSlotId } from '../types';
import type { GameCardData } from '@/components/GameCard';
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
    onDestroyEffect: 'allSlotTempArmor:4',
    ...(over ?? {}),
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// 1) Knight class deck includes 共御圣盾 with the expected fields
// ---------------------------------------------------------------------------

describe('knight class deck: 共御圣盾 entry', () => {
  it('appears in generateKnightDeck with 6 armor / 1 durability / revive / allSlotTempArmor:4 last-words / upgrade routing', () => {
    const [deck] = generateKnightDeck(createRng(42));
    const card = deck.find(c => c.name === '共御圣盾');
    expect(card).toBeTruthy();
    expect(card?.type).toBe('shield');
    expect(card?.value).toBe(6);
    expect(card?.armorMax).toBe(6);
    expect(card?.durability).toBe(1);
    expect(card?.maxDurability).toBe(1);
    expect(card?.hasEquipmentRevive).toBe(true);
    expect(card?.onDestroyEffect).toBe('allSlotTempArmor:4');
    expect(card?.classCard).toBe(true);
    expect((card as any)?.knightEffect).toBe('communal-defense-shield');
    expect((card as any)?.maxUpgradeLevel).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2) Live-break path (computeEquipmentBreakEffects in rules/equipment-effects.ts)
// ---------------------------------------------------------------------------

describe('共御圣盾 last-words: computeEquipmentBreakEffects path', () => {
  it('grants +4 temp armor to BOTH slots when destroyed', () => {
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
    expect(patch.slotTempArmor?.equipmentSlot1).toBe(4);
    expect(patch.slotTempArmor?.equipmentSlot2).toBe(4);
    expect(sideEffects.some(e =>
      e.event === 'log:entry' && (e.payload as any)?.message?.includes('所有装备栏 +4临时护甲'),
    )).toBe(true);
    expect(sideEffects.some(e =>
      e.event === 'ui:banner' && (e.payload as any)?.text?.includes('所有装备栏 +4临时护甲'),
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
    expect(patch.slotTempArmor?.equipmentSlot1).toBe(6);
    expect(patch.slotTempArmor?.equipmentSlot2).toBe(11);
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
// 3) Displacement / sacrifice destroy path (computeEquipmentDisplacementLastWords)
//    — same canonical helper used by waterfall destroyAllEquipment,
//    SACRIFICE_EQUIPMENT_SLOT, 贪婪祭坛 sacrifice tokens. Previously this
//    section tested the now-deleted applyEquipDestroyLastWords parallel.
// ---------------------------------------------------------------------------

describe('共御圣盾 last-words: computeEquipmentDisplacementLastWords path', () => {
  it('grants +4 temp armor to BOTH slots when destroyed via displacement / sacrifice', () => {
    const shield = makeShield();
    const state = makeState({
      slotTempArmor: { equipmentSlot1: 1, equipmentSlot2: 3 } as any,
    });
    const result = computeEquipmentDisplacementLastWords(
      state,
      'equipmentSlot1' as EquipmentSlotId,
      shield as any,
      createEmptyAmuletEffects(),
    );
    expect(result.patch.slotTempArmor?.equipmentSlot1).toBe(5);
    expect(result.patch.slotTempArmor?.equipmentSlot2).toBe(7);
    expect(result.enqueuedActions).toHaveLength(0);
    expect(result.sideEffects.some(e =>
      e.event === 'log:entry' && (e.payload as any)?.message?.includes('所有装备栏 +4临时护甲'),
    )).toBe(true);
  });

  it('does not produce stunCap-related side effects', () => {
    const shield = makeShield();
    const state = makeState({ stunCap: 50 });
    const result = computeEquipmentDisplacementLastWords(
      state,
      'equipmentSlot1' as EquipmentSlotId,
      shield as any,
      createEmptyAmuletEffects(),
    );
    expect(result.patch.stunCap).toBeUndefined();
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
