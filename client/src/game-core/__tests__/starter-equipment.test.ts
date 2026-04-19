import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { createEmptyAmuletEffects } from '../constants';
import { computeEquipmentBreakEffects } from '../rules/equipment-effects';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import { initialCombatState } from '../constants';
// Ensure card-schema registries (on-equip handlers) are loaded.
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1) 魔弹冶刃 — overkillAmplifyMissile
// ---------------------------------------------------------------------------

describe('starter weapon: 魔弹冶刃 (overkillAmplifyMissile)', () => {
  it('amplifies all 魔弹 by overkillHitCount on overkill', () => {
    const weapon = {
      id: 'w-mfb', type: 'weapon' as const, name: '魔弹冶刃', value: 5,
      durability: 2, maxDurability: 2, overkillAmplifyMissile: 1,
      fromSlot: 'equipmentSlot1' as const,
    };
    const monster = {
      id: 'm1', type: 'monster' as const, name: 'Goblin', value: 1,
      hp: 1, maxHp: 1, attack: 1,
    };
    const handBolt = { id: 'hb', type: 'magic' as const, name: '魔弹', value: 0 };
    const state = makeState({
      equipmentSlot1: weapon as any,
      activeCards: [monster, null, null, null, null] as any,
      handCards: [handBolt] as any,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
      } as any,
    });
    const drained = drain(state, [
      { type: 'PERFORM_HERO_ATTACK', slotId: 'equipmentSlot1', targetMonsterId: 'm1' },
    ] as any);
    expect(drained.state.amplifiedCardBonus['魔弹']).toBeGreaterThanOrEqual(1);
    const updatedHandBolt = drained.state.handCards.find(c => c.id === 'hb');
    expect(updatedHandBolt?.amplifyBonus).toBeGreaterThanOrEqual(1);
  });

  it('does NOT amplify when there is no overkill', () => {
    const weapon = {
      id: 'w-mfb', type: 'weapon' as const, name: '魔弹冶刃', value: 1,
      durability: 2, maxDurability: 2, overkillAmplifyMissile: 1,
      fromSlot: 'equipmentSlot1' as const,
    };
    const monster = {
      id: 'm1', type: 'monster' as const, name: 'Tank', value: 5,
      hp: 10, maxHp: 10, attack: 1,
    };
    const handBolt = { id: 'hb', type: 'magic' as const, name: '魔弹', value: 0 };
    const state = makeState({
      equipmentSlot1: weapon as any,
      activeCards: [monster, null, null, null, null] as any,
      handCards: [handBolt] as any,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
      } as any,
    });
    const drained = drain(state, [
      { type: 'PERFORM_HERO_ATTACK', slotId: 'equipmentSlot1', targetMonsterId: 'm1' },
    ] as any);
    expect(drained.state.amplifiedCardBonus['魔弹'] ?? 0).toBe(0);
    const updatedHandBolt = drained.state.handCards.find(c => c.id === 'hb');
    expect(updatedHandBolt?.amplifyBonus ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2) 赏金之剑 — onEquipEffect 'gold+6'
// ---------------------------------------------------------------------------

describe('starter weapon: 赏金之剑 (gold+6 on equip)', () => {
  it('grants +6 gold when played from hand', () => {
    const weapon = {
      id: 'w-bgb', type: 'weapon' as const, name: '赏金之剑', value: 2, image: '',
      durability: 2, maxDurability: 2, onEquipEffect: 'gold+6',
    };
    const state = makeState({ handCards: [weapon] as any, equipmentSlot1: null, gold: 10 });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: 'w-bgb' } as GameAction]);
    expect(result.state.gold).toBe(16);
    expect(result.state.equipmentSlot1?.id).toBe('w-bgb');
  });
});

// ---------------------------------------------------------------------------
// 3) 足锡冲锋 — onEquipEffect 'temp-attack-3'
// ---------------------------------------------------------------------------

describe('starter weapon: 足锡冲锋 (temp-attack-3 on equip)', () => {
  it('grants +3 temp attack to the equipped slot', () => {
    const weapon = {
      id: 'w-rab', type: 'weapon' as const, name: '足锡冲锋', value: 1, image: '',
      durability: 2, maxDurability: 2, onEquipEffect: 'temp-attack-3',
    };
    const state = makeState({ handCards: [weapon] as any, equipmentSlot1: null, equipmentSlot2: null });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: 'w-rab' } as GameAction]);
    // PLAY_CARD picks the empty slot — assert at least one slot got the +3.
    const t1 = result.state.slotTempAttack?.equipmentSlot1 ?? 0;
    const t2 = result.state.slotTempAttack?.equipmentSlot2 ?? 0;
    expect(t1 + t2).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 4) 遗愿重盾 — onDestroyEffect 'slot-temp-armor-3'
// ---------------------------------------------------------------------------

describe('starter shield: 遗愿重盾 (slot-temp-armor-3 on destroy)', () => {
  it('grants +3 temp armor to the slot via computeEquipmentBreakEffects', () => {
    const shield = {
      id: 's-leg', type: 'shield' as const, name: '遗愿重盾', value: 3, image: '',
      durability: 0, maxDurability: 2, armorMax: 3, onDestroyEffect: 'slot-temp-armor-3',
    };
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
    expect(patch.slotTempArmor?.equipmentSlot1).toBe(3);
    expect(patch.slotTempArmor?.equipmentSlot2 ?? 0).toBe(0);
    expect(sideEffects.some(e => e.event === 'log:entry' && (e.payload as any)?.message?.includes('+3临时护甲'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5) 灵潢守盾 — waterfallTempArmor
// ---------------------------------------------------------------------------

describe('starter shield: 灵潢守盾 (waterfallTempArmor)', () => {
  it('grants +N temp armor to the wearing slot on waterfall turn reset', () => {
    const shield = {
      id: 's-spg', type: 'shield' as const, name: '灵潢守盾', value: 2, image: '',
      durability: 3, maxDurability: 3, armorMax: 2, waterfallTempArmor: 2,
    };
    const state = makeState({
      equipmentSlot2: shield as any,
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 5 } as any, // pre-existing should be reset by waterfall
    });
    const result = reduce(state, { type: 'WATERFALL_TURN_RESET' } as GameAction);
    // Waterfall first resets temp armor to 0, then our handler adds +2.
    expect(result.state.slotTempArmor?.equipmentSlot2).toBe(2);
    expect(result.state.slotTempArmor?.equipmentSlot1).toBe(0);
  });

  it('does nothing for slots without waterfallTempArmor', () => {
    const shield = {
      id: 's-other', type: 'shield' as const, name: '普通盾', value: 2, image: '',
      durability: 3, maxDurability: 3, armorMax: 2,
    };
    const state = makeState({
      equipmentSlot2: shield as any,
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 } as any,
    });
    const result = reduce(state, { type: 'WATERFALL_TURN_RESET' } as GameAction);
    expect(result.state.slotTempArmor?.equipmentSlot2 ?? 0).toBe(0);
  });
});
