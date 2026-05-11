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
// 3) Displacement / sacrifice destroy path (computeEquipmentDisplacementLastWords)
//    — same canonical helper now used by waterfall destroyAllEquipment,
//    SACRIFICE_EQUIPMENT_SLOT (命运十字路口 / 暗影契约), 贪婪祭坛 sacrifice tokens.
//    Previously this section tested the now-deleted applyEquipDestroyLastWords
//    parallel implementation.
// ---------------------------------------------------------------------------

describe('雷震守护盾 last-words: computeEquipmentDisplacementLastWords path', () => {
  it('grants +8 stunCap when destroyed via displacement / sacrifice', () => {
    const shield = makeShield();
    const state = makeState({ stunCap: 30 });
    const result = computeEquipmentDisplacementLastWords(
      state,
      'equipmentSlot1' as EquipmentSlotId,
      shield as any,
      createEmptyAmuletEffects(),
    );
    expect(result.patch.stunCap).toBe(38);
    expect(result.sideEffects.some(e =>
      e.event === 'log:entry' && (e.payload as any)?.message?.includes('击晕上限 +8%'),
    )).toBe(true);
  });

  it('caps at 100% in displacement path too', () => {
    const shield = makeShield();
    const state = makeState({ stunCap: 95 });
    const result = computeEquipmentDisplacementLastWords(
      state,
      'equipmentSlot1' as EquipmentSlotId,
      shield as any,
      createEmptyAmuletEffects(),
    );
    expect(result.patch.stunCap).toBe(100);
  });

  it('does not enqueue any extra action (last-words is purely a stunCap mutation)', () => {
    const shield = makeShield();
    const state = makeState({ stunCap: 0 });
    const result = computeEquipmentDisplacementLastWords(
      state,
      'equipmentSlot1' as EquipmentSlotId,
      shield as any,
      createEmptyAmuletEffects(),
    );
    expect(result.enqueuedActions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4) Upgraded shields: L1 grants +10%, L2 revives first then grants +10%
// ---------------------------------------------------------------------------

describe('雷震守护盾 upgraded — L1 stunCap+10 last-words', () => {
  it('L1 (stunCap+10): grants +10 stunCap when destroyed (under cap)', () => {
    const shield = makeShield({ onDestroyEffect: 'stunCap+10' });
    const state = makeState({ equipmentSlot1: shield as any, stunCap: 50 });
    const { patch, sideEffects } = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      shield as any,
      createEmptyAmuletEffects(),
    );
    expect(patch.stunCap).toBe(60);
    expect(sideEffects.some(e =>
      e.event === 'log:entry' && (e.payload as any)?.message?.includes('击晕上限 +10%'),
    )).toBe(true);
  });
});

describe('雷震守护盾 upgraded — L2 revive then last-words', () => {
  it('L2 first destruction: revive (durability restored, equipmentReviveUsed=true) AND fires stunCap+10 last-words', () => {
    // canonical computeEquipmentBreakEffects 顺序：先 fire onDestroyEffect（stunCap+10），
    // 再做 revive 检查。所以即使 revive 接住了 broken self，stunCap 也已经 +10。
    const shield = makeShield({
      onDestroyEffect: 'stunCap+10',
      hasEquipmentRevive: true,
      durability: 0,
      maxDurability: 1,
    });
    const state = makeState({ equipmentSlot1: shield as any, stunCap: 30 });
    const { patch } = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      shield as any,
      createEmptyAmuletEffects(),
    );
    const revivedItem = (patch as any).equipmentSlot1 as any;
    expect(revivedItem).toBeTruthy();
    expect(revivedItem.equipmentReviveUsed).toBe(true);
    expect(revivedItem.durability).toBeGreaterThan(0);
    expect(patch.stunCap).toBe(40);
  });

  it('L2 second destruction (after revive used): grants +10 stunCap', () => {
    const shield = makeShield({
      onDestroyEffect: 'stunCap+10',
      hasEquipmentRevive: true,
      equipmentReviveUsed: true,
      durability: 0,
      maxDurability: 1,
    });
    const state = makeState({ equipmentSlot1: shield as any, stunCap: 30 });
    const { patch, sideEffects } = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      shield as any,
      createEmptyAmuletEffects(),
    );
    expect(patch.stunCap).toBe(40);
    expect(sideEffects.some(e =>
      e.event === 'log:entry' && (e.payload as any)?.message?.includes('击晕上限 +10%'),
    )).toBe(true);
  });
});
