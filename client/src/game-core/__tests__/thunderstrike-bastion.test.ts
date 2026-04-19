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
    id: 's-thunder',
    type: 'shield',
    name: '雷震守护盾',
    value: 8,
    image: '',
    durability: 0,
    maxDurability: 1,
    armorMax: 8,
    onDestroyEffect: 'stunCap+8',
    ...(over ?? {}),
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// 1) Knight class deck includes 雷震守护盾 with the expected fields
// ---------------------------------------------------------------------------

describe('knight class deck: 雷震守护盾 entry', () => {
  it('appears in generateKnightDeck with 8 armor / 1 durability / stunCap+8 last-words', () => {
    const [deck] = generateKnightDeck(createRng(123));
    const card = deck.find(c => c.name === '雷震守护盾');
    expect(card).toBeTruthy();
    expect(card?.type).toBe('shield');
    expect(card?.value).toBe(8);
    expect(card?.armorMax).toBe(8);
    expect(card?.durability).toBe(1);
    expect(card?.maxDurability).toBe(1);
    expect(card?.onDestroyEffect).toBe('stunCap+8');
    expect(card?.classCard).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2) Live-break path (computeEquipmentBreakEffects in rules/equipment-effects.ts)
// ---------------------------------------------------------------------------

describe('雷震守护盾 last-words: computeEquipmentBreakEffects path', () => {
  it('grants +8 stunCap when destroyed (under 100% cap)', () => {
    const shield = makeShield();
    const state = makeState({
      equipmentSlot1: shield as any,
      stunCap: 50,
    });
    const { sideEffects, patch } = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      shield as any,
      createEmptyAmuletEffects(),
    );
    expect(patch.stunCap).toBe(58);
    expect(sideEffects.some(e =>
      e.event === 'log:entry' && (e.payload as any)?.message?.includes('击晕上限 +8%'),
    )).toBe(true);
    expect(sideEffects.some(e =>
      e.event === 'ui:banner' && (e.payload as any)?.text?.includes('击晕上限 +8%'),
    )).toBe(true);
  });

  it('caps at 100% when destroyed near the cap', () => {
    const shield = makeShield();
    const state = makeState({
      equipmentSlot1: shield as any,
      stunCap: 95,
    });
    const { patch } = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      shield as any,
      createEmptyAmuletEffects(),
    );
    expect(patch.stunCap).toBe(100);
  });

  it('leaves stunCap untouched when already at 100%', () => {
    const shield = makeShield();
    const state = makeState({
      equipmentSlot1: shield as any,
      stunCap: 100,
    });
    const { patch } = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      shield as any,
      createEmptyAmuletEffects(),
    );
    // No-op: don't decrease, don't reset to 100 (still 100 either way).
    expect(patch.stunCap ?? state.stunCap).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// 3) Waterfall destroy path (applyEquipDestroyLastWords in rules/waterfall.ts)
// ---------------------------------------------------------------------------

describe('雷震守护盾 last-words: waterfall applyEquipDestroyLastWords path', () => {
  it('grants +8 stunCap when destroyed during waterfall', () => {
    const shield = makeShield();
    const state = makeState({ stunCap: 30 });
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
    expect(patch.stunCap).toBe(38);
    expect(sideEffects.some(e =>
      e.event === 'log:entry' && (e.payload as any)?.message?.includes('击晕上限 +8%'),
    )).toBe(true);
  });

  it('caps at 100% in waterfall path too', () => {
    const shield = makeShield();
    const state = makeState({ stunCap: 95 });
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
    expect(patch.stunCap).toBe(100);
  });

  it('does not enqueue any extra action (last-words is purely a stunCap mutation)', () => {
    const shield = makeShield();
    const state = makeState({ stunCap: 0 });
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
    expect(enqueuedActions).toHaveLength(0);
  });
});
