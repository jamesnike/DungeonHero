/**
 * Bug regression: Golem layer-loss reflect must fire AFTER the shield-break
 * routing has fully resolved. Previously the reflect was computed inline in
 * `reduceDecrementFury`, which runs RIGHT AFTER reduceResolveBlock applies
 * its patch — but BEFORE the shield-reflect (DEAL_DAMAGE_TO_MONSTER) path
 * that was enqueued in the same RESOLVE_BLOCK call. The user-reported bug:
 *
 *   "Golem 攻击我的时候，已经击破了我的护盾，但是同时因为掉血层而触发的反震
 *    却还在 对已经破坏的护盾造成伤害。应该是先结算其他伤害，Golem 攻击，
 *    护盾没了，然后再触发反震"
 *
 * Fix: Extract the layer-loss reflect into a dedicated action
 * `RESOLVE_GOLEM_LAYER_REFLECT` that is enqueued from `reduceResolveBlock`
 * AFTER the shield-reflect to Golem (so Golem's HP is already updated, and
 * the reflect can correctly route to the now-broken shield slot → hero).
 *
 * This test fixes the action order to:
 *   APPLY_DAMAGE (overflow)
 *   DECREMENT_FURY (Golem layer count down — no inline reflect)
 *   DEAL_DAMAGE_TO_MONSTER (shield reflect, optional)
 *   RESOLVE_GOLEM_LAYER_REFLECT (Golem reflect — fires LAST, sees latest state)
 *   ADVANCE_MONSTER_TURN
 *
 * Invariant: at the time the Golem reflect routes, the player's broken shield
 * slot is already null in state, so `routeReflectDamageToHero` correctly
 * routes the reflect to the hero (not to a phantom slot).
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as ActiveRowSlots,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    rng: createRng(7),
    phase: 'playerInput',
    ...overrides,
  };
}

describe('Golem layer-loss reflect after shield break (regression)', () => {
  it('routes reflect to hero when shield breaks during the same block — not to the broken slot', () => {
    // Setup: Golem with 2 layers, 2 attack, golemLayerLossReflect=3.
    // Player has a 2/1 shield (armor=2, durability=1) in slot1.
    // When Golem attacks:
    //  1. Block: shield armor 2→0, durability 1→0, shield destroyed.
    //  2. APPLY_DAMAGE: 0 overflow.
    //  3. DECREMENT_FURY: Golem layer 2→1.
    //  4. DEAL_DAMAGE_TO_MONSTER (shield reflect): N/A (shield has no reflect).
    //  5. RESOLVE_GOLEM_LAYER_REFLECT: Golem reflect 3 dmg.
    //     Shield slot is already null → routes to hero → hp 30→27.
    //  6. ADVANCE_MONSTER_TURN.
    const golem: GameCardData = {
      id: 'm1',
      type: 'monster',
      name: 'Golem',
      value: 5,
      hp: 10,
      maxHp: 10,
      attack: 2,
      currentLayer: 2,
      fury: 2,
      hpLayers: 2,
      golemLayerLossReflect: 3,
      image: '',
    };
    const shield: GameCardData = {
      id: 's1',
      type: 'shield',
      name: 'Wooden Shield',
      value: 2,
      armor: 2,
      armorMax: 2,
      durability: 1,
      maxDurability: 1,
      image: '',
      fromSlot: 'equipmentSlot1',
    };

    const slots = [golem, null, null, null, null] as ActiveRowSlots;
    const state = makeState({
      activeCards: slots,
      equipmentSlot1: shield as any,
      equipmentSlot2: null as any,
      hp: 30,
      maxHp: 30,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'monster',
        pendingBlock: {
          monsterId: 'm1',
          attackValue: 2,
          monsterName: 'Golem',
        },
      },
      phase: 'awaitingBlock',
    });

    const result = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' },
    ]);

    // Shield destroyed.
    expect(result.state.equipmentSlot1).toBeNull();
    // Hero took the reflect damage (3) — NOT the broken shield.
    expect(result.state.hp).toBe(27);
    // Golem layer dropped 2→1.
    const finalGolem = result.state.activeCards.find(c => c?.id === 'm1') as GameCardData | undefined;
    expect(finalGolem).toBeDefined();
    expect(finalGolem!.currentLayer).toBe(1);

    // Side-effect verification: combat:golemReflect emitted with hitSlotId=null
    // (no shield absorbed it).
    const reflectEvents = result.sideEffects.filter(e => e.event === 'combat:golemReflect');
    expect(reflectEvents.length).toBe(1);
    const reflectPayload = reflectEvents[0].payload as { damage: number; hitSlotId: string | null };
    expect(reflectPayload.damage).toBe(3);
    expect(reflectPayload.hitSlotId).toBeNull();

    // Order check: combat:golemReflect MUST fire AFTER equipment:destroyed
    // (shield-break event). This is the user-reported requirement: shield gone
    // first, THEN reflect — both for state correctness AND so the UI can play
    // the shield-break animation FIRST and the reflect (shockwave) animation
    // second instead of overlapping them.
    const indexOfBreak = result.sideEffects.findIndex(e => e.event === 'equipment:destroyed');
    const indexOfReflect = result.sideEffects.findIndex(e => e.event === 'combat:golemReflect');
    if (indexOfBreak >= 0) {
      expect(indexOfReflect).toBeGreaterThan(indexOfBreak);
    }
  });

  it('routes reflect to surviving slot2 shield when slot1 broke from the attack', () => {
    // Setup: Golem 2 layer 2 attack reflect=3.
    // slot1 has 2/1 shield (will break).
    // slot2 has 5/2 shield (will absorb the reflect).
    const golem: GameCardData = {
      id: 'm1', type: 'monster', name: 'Golem', value: 5,
      hp: 10, maxHp: 10, attack: 2,
      currentLayer: 2, fury: 2, hpLayers: 2,
      golemLayerLossReflect: 3,
      image: '',
    };
    const shield1: GameCardData = {
      id: 's1', type: 'shield', name: 'Weak Shield', value: 2,
      armor: 2, armorMax: 2, durability: 1, maxDurability: 1,
      image: '', fromSlot: 'equipmentSlot1',
    };
    const shield2: GameCardData = {
      id: 's2', type: 'shield', name: 'Strong Shield', value: 5,
      armor: 5, armorMax: 5, durability: 2, maxDurability: 2,
      image: '', fromSlot: 'equipmentSlot2',
    };

    const state = makeState({
      activeCards: [golem, null, null, null, null] as ActiveRowSlots,
      equipmentSlot1: shield1 as any,
      equipmentSlot2: shield2 as any,
      hp: 30, maxHp: 30,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'monster',
        pendingBlock: {
          monsterId: 'm1', attackValue: 2, monsterName: 'Golem',
        },
      },
      phase: 'awaitingBlock',
    });

    const result = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' },
    ]);

    expect(result.state.equipmentSlot1).toBeNull();
    // Slot2 shield should absorb the 3 reflect damage (5→2 armor, durability untouched).
    const remaining = result.state.equipmentSlot2 as GameCardData | null;
    expect(remaining).not.toBeNull();
    expect(remaining!.armor).toBe(2);
    expect(remaining!.durability).toBe(2);
    // Hero hp untouched.
    expect(result.state.hp).toBe(30);

    // Verify hitSlotId points to slot2.
    const reflectEvents = result.sideEffects.filter(e => e.event === 'combat:golemReflect');
    expect(reflectEvents.length).toBe(1);
    const payload = reflectEvents[0].payload as { hitSlotId: string | null };
    expect(payload.hitSlotId).toBe('equipmentSlot2');
  });

  it('skips reflect entirely if Golem dies from shield reflect before its turn completes', () => {
    // Edge case: Golem at 1 layer, 1 hp, reflect=3. Shield reflects 5 to Golem.
    // Golem dies BEFORE RESOLVE_GOLEM_LAYER_REFLECT can fire.
    const golem: GameCardData = {
      id: 'm1', type: 'monster', name: 'Golem', value: 5,
      hp: 1, maxHp: 10, attack: 2,
      currentLayer: 1, fury: 1, hpLayers: 1,
      golemLayerLossReflect: 3,
      image: '',
    };
    const reflectShield: GameCardData = {
      id: 's1', type: 'shield', name: 'Thorn Shield', value: 5,
      armor: 5, armorMax: 5, durability: 2, maxDurability: 2,
      shieldReflectDamage: 5, // reflects 5 to attacker
      image: '', fromSlot: 'equipmentSlot1',
    };

    const state = makeState({
      activeCards: [golem, null, null, null, null] as ActiveRowSlots,
      equipmentSlot1: reflectShield as any,
      equipmentSlot2: null as any,
      hp: 30, maxHp: 30,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'monster',
        pendingBlock: {
          monsterId: 'm1', attackValue: 2, monsterName: 'Golem',
        },
      },
      phase: 'awaitingBlock',
    });

    const result = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' },
    ]);

    // Hero takes nothing (Golem died, no layer-loss reflect).
    expect(result.state.hp).toBe(30);
    // No combat:golemReflect emitted because Golem was already defeated when
    // RESOLVE_GOLEM_LAYER_REFLECT ran (or because layer didn't actually drop).
    const reflectEvents = result.sideEffects.filter(e => e.event === 'combat:golemReflect');
    expect(reflectEvents.length).toBe(0);
  });
});
