import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import { initialCombatState } from '../constants';
// Registers the new `potion:grant-weapon-stun-chance+40` definition.
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    ...overrides,
  };
}

const POTION = {
  id: 'p-stun',
  type: 'potion' as const,
  name: '雷震淬刃药',
  value: 6,
  image: '',
  potionEffect: 'grant-weapon-stun-chance+40' as any,
};

const SWORD = {
  id: 'w-sword',
  type: 'weapon' as const,
  name: 'Sword',
  value: 3,
  image: '',
  durability: 3,
  maxDurability: 3,
};

const SHIELD = {
  id: 's-shield',
  type: 'shield' as const,
  name: 'Shield',
  value: 2,
  image: '',
  durability: 3,
  maxDurability: 3,
};

describe('PLAY_CARD with grant-weapon-stun-chance+40 potion', () => {
  it('auto-applies +40% to the only equipped weapon', () => {
    const state = makeState({
      handCards: [POTION] as any,
      equipmentSlot1: { ...SWORD } as any,
      equipmentSlot2: null,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: 'p-stun' } as GameAction]);
    const slot1 = result.state.equipmentSlot1 as any;
    expect(slot1?.weaponStunChance).toBe(40);
    expect(result.state.handCards.length).toBe(0);
    expect(result.state.pendingPotionAction).toBeFalsy();
  });

  it('stacks additively on top of existing weaponStunChance', () => {
    const state = makeState({
      handCards: [POTION] as any,
      equipmentSlot1: { ...SWORD, weaponStunChance: 20 } as any,
      equipmentSlot2: null,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: 'p-stun' } as GameAction]);
    const slot1 = result.state.equipmentSlot1 as any;
    expect(slot1?.weaponStunChance).toBe(60);
  });

  it('skips a shield in the only equipped slot (no eligible weapon)', () => {
    const state = makeState({
      handCards: [POTION] as any,
      equipmentSlot1: { ...SHIELD } as any,
      equipmentSlot2: null,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: 'p-stun' } as GameAction]);
    const slot1 = result.state.equipmentSlot1 as any;
    expect(slot1?.weaponStunChance ?? 0).toBe(0);
    expect(result.state.pendingPotionAction).toBeFalsy();
    expect(result.state.handCards.length).toBe(0);
  });

  it('prompts for slot selection when both slots have weapons', () => {
    const state = makeState({
      handCards: [POTION] as any,
      equipmentSlot1: { ...SWORD, id: 'w1' } as any,
      equipmentSlot2: { ...SWORD, id: 'w2', name: 'Axe' } as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: 'p-stun' } as GameAction]);
    expect(result.state.pendingPotionAction).toBeTruthy();
    expect(result.state.pendingPotionAction?.effect).toBe('grant-weapon-stun-chance+40');
    expect(result.state.pendingPotionAction?.step).toBe('slot-select');
    const slot1 = result.state.equipmentSlot1 as any;
    const slot2 = result.state.equipmentSlot2 as any;
    expect(slot1?.weaponStunChance ?? 0).toBe(0);
    expect(slot2?.weaponStunChance ?? 0).toBe(0);
  });

  it('applies +40% to the chosen slot after RESOLVE_EQUIPMENT_CHOICE', () => {
    const state = makeState({
      handCards: [POTION] as any,
      equipmentSlot1: { ...SWORD, id: 'w1' } as any,
      equipmentSlot2: { ...SWORD, id: 'w2', name: 'Axe' } as any,
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: 'p-stun' } as GameAction]);
    expect(afterPlay.state.pendingPotionAction).toBeTruthy();

    const afterChoice = drain(afterPlay.state, [{
      type: 'RESOLVE_EQUIPMENT_CHOICE',
      slotId: 'equipmentSlot2',
    } as GameAction]);
    const slot1 = afterChoice.state.equipmentSlot1 as any;
    const slot2 = afterChoice.state.equipmentSlot2 as any;
    expect(slot1?.weaponStunChance ?? 0).toBe(0);
    expect(slot2?.weaponStunChance).toBe(40);
    expect(afterChoice.state.pendingPotionAction).toBeFalsy();
  });

  it('only weapons (not shields) are eligible when both slots are filled', () => {
    const state = makeState({
      handCards: [POTION] as any,
      equipmentSlot1: { ...SWORD, id: 'w1' } as any,
      equipmentSlot2: { ...SHIELD, id: 's1' } as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: 'p-stun' } as GameAction]);
    const slot1 = result.state.equipmentSlot1 as any;
    const slot2 = result.state.equipmentSlot2 as any;
    expect(slot1?.weaponStunChance).toBe(40);
    expect(slot2?.weaponStunChance ?? 0).toBe(0);
    expect(result.state.pendingPotionAction).toBeFalsy();
  });
});
