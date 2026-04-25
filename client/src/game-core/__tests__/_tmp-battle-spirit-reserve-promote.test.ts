/**
 * Reproduction test: user reports that with battle-spirit + reserve stack:
 *   1. Slot 1 has main weapon A
 *   2. Slot 1 reserve has weapon B
 *   3. Battle-spirit grants slot1 +1 extra attack/turn (slot total 1+1 = 2)
 *   4. Player attacks 2 times with A, A breaks
 *   5. B promotes to slot 1
 *   6. User claims B can still attack 1 more time — should NOT be allowed
 *
 * The bug only reproduces when weaponA has its own `weaponExtraAttack` (e.g.
 * `怒斩之刃`). Then the priority order at line 2218–2222 picks `usingWeaponExtra`
 * over `usingBattleSpiritExtra` for attack 2, so `slotBattleSpiritUsed[slot1]`
 * stays at 0. After weaponA breaks and weaponB promotes, weaponB has no
 * `weaponExtraAttack` (or has fresh budget), so attack 3 falls through to
 * `usingBattleSpiritExtra` because `slotBattleSpiritUsed[slot1] = 0 < 1`.
 * Result: slot1 attacks 3 times in one hero turn instead of the intended 2.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), rng: createRng(42), ...overrides };
}

function performAttack(state: GameState, slotId: 'equipmentSlot1' | 'equipmentSlot2', targetId: string): GameState {
  const r = reduce(state, {
    type: 'PERFORM_HERO_ATTACK',
    slotId,
    targetMonsterId: targetId,
  } as GameAction);
  return drain(r.state, r.enqueuedActions ?? []).state;
}

describe('battle-spirit + reserve promote: extra attack must NOT carry to promoted weapon', () => {
  it('REGRESSION: weaponA with weaponExtraAttack consumes BS bonus implicitly so promoted weaponB cannot attack again', () => {
    // weaponA = 怒斩之刃 style (durability 2, weaponExtraAttack 1)
    const weaponA: EquipmentItem = {
      id: 'wA', type: 'weapon', name: '怒斩之刃', value: 5, image: '',
      attack: 5, durability: 2, maxDurability: 2,
      weaponExtraAttack: 1,
    } as any;
    // weaponB = plain weapon, no extras
    const weaponB: EquipmentItem = {
      id: 'wB', type: 'weapon', name: 'WeaponB', value: 4, image: '',
      attack: 4, durability: 3, maxDurability: 3,
    } as any;
    const monster = {
      id: 'm1', type: 'monster' as const, name: 'Goblin', value: 1, image: '',
      hp: 100, maxHp: 100, attack: 1,
      currentLayer: 1, fury: 1, hpLayers: 1,
    } as any;

    let state = makeState({
      equipmentSlot1: weaponA,
      equipmentSlot1Reserve: [weaponB],
      slotBattleSpiritBonus: { equipmentSlot1: 1 } as any,
      slotBattleSpiritUsed: {} as any,
      activeCards: [monster, null, null, null, null] as ActiveRowSlots,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
        heroAttacksRemaining: 2,
      },
      phase: 'playerInput',
      hp: 30,
      maxHp: 30,
    });

    state = performAttack(state, 'equipmentSlot1', 'm1');
    console.log('[Attack 1 - base]', {
      heroAttacksRemaining: state.combatState.heroAttacksRemaining,
      heroAttacksThisTurn: state.combatState.heroAttacksThisTurn,
      slotBattleSpiritUsed: state.slotBattleSpiritUsed,
      weaponExtraAttackUsed: state.weaponExtraAttackUsed,
      slot1Name: (state.equipmentSlot1 as any)?.name,
      slot1Dur: (state.equipmentSlot1 as any)?.durability,
      monsterHp: (state.activeCards[0] as any)?.hp,
    });

    state = performAttack(state, 'equipmentSlot1', 'm1');
    console.log('[Attack 2 - weaponExtra fires (priority over BS)]', {
      heroAttacksRemaining: state.combatState.heroAttacksRemaining,
      heroAttacksThisTurn: state.combatState.heroAttacksThisTurn,
      slotBattleSpiritUsed: state.slotBattleSpiritUsed,
      weaponExtraAttackUsed: state.weaponExtraAttackUsed,
      slot1Name: (state.equipmentSlot1 as any)?.name,
      slot1Dur: (state.equipmentSlot1 as any)?.durability,
      slot1Reserve: state.equipmentSlot1Reserve?.map((c: any) => c?.name),
      monsterHp: (state.activeCards[0] as any)?.hp,
    });

    // After 2 attacks, weaponA broke, weaponB promoted
    expect((state.equipmentSlot1 as any)?.id).toBe('wB');

    // The bug: slotBattleSpiritUsed is still 0 because weaponExtra had priority
    // (this is the user-perceived bug — BS bonus should have been consumed once
    //  the slot used its 1 extra attack)
    console.log('[After promote] slotBattleSpiritUsed expected: 1 (BS should be consumed). Got:', state.slotBattleSpiritUsed);

    const monsterHpBefore = (state.activeCards[0] as any)?.hp;
    state = performAttack(state, 'equipmentSlot1', 'm1');
    const monsterHpAfter = (state.activeCards[0] as any)?.hp;
    console.log('[Attack 3 attempt - promoted weaponB]', {
      heroAttacksRemaining: state.combatState.heroAttacksRemaining,
      slotBattleSpiritUsed: state.slotBattleSpiritUsed,
      weaponExtraAttackUsed: state.weaponExtraAttackUsed,
      slot1Name: (state.equipmentSlot1 as any)?.name,
      slot1Dur: (state.equipmentSlot1 as any)?.durability,
      monsterHpBefore,
      monsterHpAfter,
      damageWasDealt: monsterHpBefore !== monsterHpAfter,
    });

    // EXPECTED: no third attack (BS bonus was conceptually used by the slot's
    // extra attack #2, even though tracked as weaponExtra)
    expect(monsterHpAfter).toBe(monsterHpBefore);
    expect((state.equipmentSlot1 as any)?.durability).toBe(3);
  });

  it('control: weaponA without weaponExtraAttack — BS extra fires correctly, attack 3 blocked', () => {
    const weaponA: EquipmentItem = {
      id: 'wA', type: 'weapon', name: 'PlainWeaponA', value: 5, image: '',
      attack: 5, durability: 2, maxDurability: 2,
    } as any;
    const weaponB: EquipmentItem = {
      id: 'wB', type: 'weapon', name: 'WeaponB', value: 4, image: '',
      attack: 4, durability: 3, maxDurability: 3,
    } as any;
    const monster = {
      id: 'm1', type: 'monster' as const, name: 'Goblin', value: 1, image: '',
      hp: 100, maxHp: 100, attack: 1,
      currentLayer: 1, fury: 1, hpLayers: 1,
    } as any;

    let state = makeState({
      equipmentSlot1: weaponA,
      equipmentSlot1Reserve: [weaponB],
      slotBattleSpiritBonus: { equipmentSlot1: 1 } as any,
      slotBattleSpiritUsed: {} as any,
      activeCards: [monster, null, null, null, null] as ActiveRowSlots,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
        heroAttacksRemaining: 2,
      },
      phase: 'playerInput',
      hp: 30,
      maxHp: 30,
    });

    state = performAttack(state, 'equipmentSlot1', 'm1');
    state = performAttack(state, 'equipmentSlot1', 'm1');
    expect((state.equipmentSlot1 as any)?.id).toBe('wB');
    expect((state.slotBattleSpiritUsed as any).equipmentSlot1).toBe(1);

    const monsterHpBefore = (state.activeCards[0] as any)?.hp;
    state = performAttack(state, 'equipmentSlot1', 'm1');
    expect((state.activeCards[0] as any)?.hp).toBe(monsterHpBefore);
  });
});
