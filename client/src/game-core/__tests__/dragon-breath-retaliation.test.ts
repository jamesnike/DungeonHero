/**
 * Dragon Breath Retaliation — full pipeline coverage.
 *
 * Pins two contracts that the player-facing experience depends on but that
 * historically drifted apart across the three damage entry points:
 *
 *   1. The `reflect:dragonBreath` skill-float animation (the floating
 *      "反击·龙息" banner above the dragon) MUST appear regardless of which
 *      reducer triggered the retaliation:
 *        - DEAL_DAMAGE_TO_MONSTER  (magic, reflects, etc.)  ✅ baseline
 *        - APPLY_SHIELD_REFLECT    (shield reflect → dragon)
 *        - PERFORM_HERO_ATTACK     (weapon hit → dragon)    ← regression target
 *
 *   2. The damage MUST actually land on the hero (via
 *      APPLY_DRAGON_BREATH_RETALIATION → routeReflectDamageToHero). The
 *      `combat:dragonBreathRetaliation` side effect is animation-only and is
 *      consumed by `useCombatActions` for the orb projectile + bleed visual;
 *      without the enqueued APPLY_DRAGON_BREATH_RETALIATION action the hero
 *      would take 0 damage from a dragon hit by a weapon.
 *
 * The fixture deliberately uses `phase: 'playerInput'` so the pipeline drain
 * gating (`isInputContinuation` in pipeline.ts) matches real gameplay rather
 * than the misleading `'idle'` default of `createInitialGameState()`.
 *
 * See:
 *   - .cursor/rules/pipeline-input-continuation.mdc
 *   - .cursor/rules/shared-effect-id-impact-check.mdc
 *   - .cursor/rules/monster-damage-engagement.mdc
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as ActiveRowSlots,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    rng: createRng(42),
    phase: 'playerInput',
    ...overrides,
  };
}

function makeDragon(id: string): GameCardData {
  return {
    id,
    type: 'monster',
    name: `Dragon-${id}`,
    value: 4,
    image: '',
    hp: 10,
    maxHp: 10,
    attack: 4,
    fury: 1,
    currentLayer: 1,
    dragonDamageRetaliation: 3,
  } as GameCardData;
}

function makeWeapon(id: string, attack: number, durability = 5): GameCardData {
  return {
    id,
    type: 'weapon',
    name: `Sword-${id}`,
    value: attack,
    image: '',
    durability,
    maxDurability: durability,
  } as GameCardData;
}

describe('Dragon Breath retaliation — PERFORM_HERO_ATTACK path (weapon → dragon)', () => {
  it('enqueues reflect:dragonBreath skill float so the "反击·龙息" banner animates', () => {
    const dragon = makeDragon('d1');
    const sword = makeWeapon('w1', 4);
    const state = makeState({
      hp: 30,
      equipmentSlot1: sword as EquipmentItem,
      activeCards: [dragon, null, null, null, null] as ActiveRowSlots,
      combatState: {
        ...initialCombatState,
        heroAttacksRemaining: 1,
        heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
        engagedMonsterIds: [dragon.id],
      },
    });

    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: dragon.id,
    });

    expect(result.enqueuedActions ?? []).toContainEqual(
      expect.objectContaining({
        type: 'TRIGGER_MONSTER_SKILL_FLOAT',
        monsterId: dragon.id,
        skillKey: 'reflect:dragonBreath',
      }),
    );
  });

  it('enqueues APPLY_DRAGON_BREATH_RETALIATION so the hero actually takes damage', () => {
    const dragon = makeDragon('d2');
    const sword = makeWeapon('w2', 4);
    const state = makeState({
      hp: 30,
      equipmentSlot1: sword as EquipmentItem,
      activeCards: [dragon, null, null, null, null] as ActiveRowSlots,
      combatState: {
        ...initialCombatState,
        heroAttacksRemaining: 1,
        heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
        engagedMonsterIds: [dragon.id],
      },
    });

    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: dragon.id,
    });

    expect(result.enqueuedActions ?? []).toContainEqual(
      expect.objectContaining({
        type: 'APPLY_DRAGON_BREATH_RETALIATION',
        monsterId: dragon.id,
        damage: 3,
      }),
    );
  });

  it('end-to-end: float lands in queue first (HARD_PAUSE), then on release hero hp drops', () => {
    const dragon = makeDragon('d3');
    const sword = makeWeapon('w3', 4);
    const state = makeState({
      hp: 30,
      equipmentSlot1: sword as EquipmentItem,
      activeCards: [dragon, null, null, null, null] as ActiveRowSlots,
      combatState: {
        ...initialCombatState,
        heroAttacksRemaining: 1,
        heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
        engagedMonsterIds: [dragon.id],
      },
    });

    // Phase 1: dispatch attack + drain. The pipeline must hard-pause on the
    // skill float so the player gets a chance to read "反击·龙息" before the
    // damage lands. APPLY_DRAGON_BREATH_RETALIATION should still be parked
    // in the action queue, hp untouched.
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: dragon.id,
    });
    const drained = drain(result.state, result.enqueuedActions ?? []);
    const pausedState = drained.state;

    expect(pausedState.phase).toBe('awaitingSkillFloat');
    expect(pausedState.hp).toBe(30);
    expect(
      pausedState.pendingSkillFloats.some(
        f => f.monsterId === dragon.id && f.skillKey === 'reflect:dragonBreath',
      ),
    ).toBe(true);
    expect(
      drained.queue.some(a => a.type === 'APPLY_DRAGON_BREATH_RETALIATION'),
    ).toBe(true);

    // Phase 2: simulate the UI releasing the float. Pipeline resumes,
    // APPLY_DRAGON_BREATH_RETALIATION runs, hero hp drops by 3.
    const floatId = pausedState.pendingSkillFloats[0]!.id;
    const released = reduce(pausedState, {
      type: 'RELEASE_MONSTER_SKILL_FLOAT',
      floatId,
    });
    const finalState = drain(released.state, [
      ...(released.enqueuedActions ?? []),
      ...drained.queue,
    ]).state;

    expect(finalState.hp).toBe(27);
    expect(finalState.phase).not.toBe('awaitingSkillFloat');
  });

  it('stunned dragon does NOT retaliate (regression guard for stun gate)', () => {
    const dragon = { ...makeDragon('d4'), isStunned: true } as GameCardData;
    const sword = makeWeapon('w4', 4);
    const state = makeState({
      hp: 30,
      equipmentSlot1: sword as EquipmentItem,
      activeCards: [dragon, null, null, null, null] as ActiveRowSlots,
      combatState: {
        ...initialCombatState,
        heroAttacksRemaining: 1,
        heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
        engagedMonsterIds: [dragon.id],
      },
    });

    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: dragon.id,
    });
    const finalState = drain(result.state, result.enqueuedActions ?? []).state;

    expect(finalState.hp).toBe(30);
    expect(
      finalState.pendingSkillFloats.some(
        f => f.skillKey === 'reflect:dragonBreath',
      ),
    ).toBe(false);
  });
});

describe('Dragon Breath retaliation — APPLY_SHIELD_REFLECT path (shield reflect → dragon)', () => {
  it('enqueues reflect:dragonBreath skill float when a shield reflect hits a dragon', () => {
    const dragon = makeDragon('d5');
    const state = makeState({
      hp: 30,
      activeCards: [dragon, null, null, null, null] as ActiveRowSlots,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: [dragon.id],
      },
    });

    const result = reduce(state, {
      type: 'APPLY_SHIELD_REFLECT',
      monsterId: dragon.id,
      damage: 2,
      sourceName: '盾击反弹',
    });

    expect(result.enqueuedActions ?? []).toContainEqual(
      expect.objectContaining({
        type: 'TRIGGER_MONSTER_SKILL_FLOAT',
        monsterId: dragon.id,
        skillKey: 'reflect:dragonBreath',
      }),
    );
    expect(result.enqueuedActions ?? []).toContainEqual(
      expect.objectContaining({
        type: 'APPLY_DRAGON_BREATH_RETALIATION',
        monsterId: dragon.id,
        damage: 3,
      }),
    );
  });
});
