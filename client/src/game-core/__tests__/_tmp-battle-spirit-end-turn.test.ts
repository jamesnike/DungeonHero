/**
 * Reproduction test: 战意激发 bonus should persist after END_TURN → next hero turn.
 *
 * User reported the bonus disappears after one hero turn ends, but the bonus is
 * supposed to persist until the next waterfall.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe('battle-spirit bonus across hero turn boundary', () => {
  it('survives END_TURN (no engaged monsters) → START_TURN', () => {
    const weapon = { id: 'sword', type: 'weapon' as const, name: 'Sword', value: 5, attack: 3, durability: 3 } as any;
    const state = makeState({
      equipmentSlot1: weapon,
      slotBattleSpiritBonus: { equipmentSlot1: 1 } as any,
      slotBattleSpiritUsed: { equipmentSlot1: 1 } as any,
      activeCards: [null, null, null, null, null],
      combatState: { ...initialCombatState, currentTurn: 'hero' },
      phase: 'playerInput',
    });

    const r1 = drain(state, [{ type: 'END_TURN', heroTurnLayerLossIds: [] } as GameAction]);
    expect((r1.state.slotBattleSpiritBonus as any).equipmentSlot1).toBe(1);

    const r2 = drain(r1.state, [{ type: 'START_TURN' } as GameAction]);
    expect((r2.state.slotBattleSpiritBonus as any).equipmentSlot1).toBe(1);
    expect(r2.state.slotBattleSpiritUsed).toEqual({});
  });

  it('survives full END_TURN → ADVANCE → APPLY_MONSTER_TURN_END_EFFECTS → START_TURN cycle (engaged monster, take damage)', () => {
    const weapon = { id: 'sword', type: 'weapon' as const, name: 'Sword', value: 5, attack: 3, durability: 3 } as any;
    const monster = {
      id: 'm1', type: 'monster' as const, name: 'Goblin', value: 1,
      hp: 5, maxHp: 5, attack: 1,
      currentLayer: 1, fury: 1, hpLayers: 1,
    } as any;
    let state = makeState({
      equipmentSlot1: weapon,
      slotBattleSpiritBonus: { equipmentSlot1: 1 } as any,
      slotBattleSpiritUsed: { equipmentSlot1: 1 } as any,
      activeCards: [monster, null, null, null, null],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
      },
      phase: 'playerInput',
      hp: 30,
      maxHp: 30,
    });

    let result = drain(state, [{ type: 'END_TURN', heroTurnLayerLossIds: [] } as GameAction]);
    state = result.state;

    if (state.phase === 'awaitingBlock') {
      result = drain(state, [{ type: 'RESOLVE_BLOCK', choice: 'take' } as GameAction]);
      state = result.state;
    }

    expect((state.slotBattleSpiritBonus as any).equipmentSlot1).toBe(1);
  });

  it('survives full play → END_TURN → next turn end-to-end', async () => {
    // Simulate end-to-end: play battle-spirit card → resolve slot → END_TURN cycle.
    const weapon = { id: 'sword', type: 'weapon' as const, name: 'Sword', value: 5, attack: 3, durability: 3 } as any;
    const battleSpiritCard = {
      id: 'bs-1',
      instanceId: 'bs-1',
      type: 'magic' as const,
      name: '战意激发',
      value: 0,
      knightEffect: 'battle-spirit',
      upgradeLevel: 0,
      cost: 0,
    } as any;

    let state = makeState({
      equipmentSlot1: weapon,
      handCards: [battleSpiritCard],
      activeCards: [null, null, null, null, null],
      combatState: { ...initialCombatState, currentTurn: 'hero' },
      phase: 'playerInput',
      hp: 30,
      maxHp: 30,
      gold: 100,
    });

    // Play card
    let result = drain(state, [
      { type: 'PLAY_CARD', cardId: 'bs-1' } as GameAction,
    ]);
    state = result.state;
    console.log('After PLAY_CARD:', {
      phase: state.phase,
      pendingMagicAction: state.pendingMagicAction ? {
        effect: (state.pendingMagicAction as any).effect,
        step: (state.pendingMagicAction as any).step,
      } : null,
      handCount: state.handCards.length,
    });

    // Should be at slot-select stage
    expect(state.pendingMagicAction).not.toBeNull();
    expect((state.pendingMagicAction as any)?.effect).toBe('battle-spirit');

    // Resolve slot selection
    result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'battle-spirit', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    state = result.state;
    console.log('After RESOLVE_MAGIC_SLOT_SELECTION:', {
      slotBattleSpiritBonus: state.slotBattleSpiritBonus,
      pendingMagicAction: state.pendingMagicAction,
      phase: state.phase,
    });
    expect((state.slotBattleSpiritBonus as any).equipmentSlot1).toBe(1);

    // END_TURN
    result = drain(state, [{ type: 'END_TURN', heroTurnLayerLossIds: [] } as GameAction]);
    state = result.state;
    console.log('After END_TURN:', {
      phase: state.phase,
      slotBattleSpiritBonus: state.slotBattleSpiritBonus,
    });
    expect((state.slotBattleSpiritBonus as any).equipmentSlot1).toBe(1);
  });
});
