/**
 * Equipment-derived shield-reflect surface — per-handler unit tests (PR-3).
 *
 * These tests target `reduceApplyShieldReflect` (the consumer) AFTER the 2
 * inline overclock loops were migrated to the registry. Coverage:
 *
 *   1. dragonBreathRetaliation — REPLAY: enqueues 1 APPLY_DRAGON_BREATH_RETALIATION
 *      per iteration; first iter pushes float + side effect.
 *   2. bossRetaliation — REPLAY: enqueues 1 APPLY_DAMAGE per iteration; first
 *      iter pushes float + log.
 *
 * Plus the inline `combat:equipOverclockTriggered` emit semantics:
 *   - Always emits when overclock active AND reflect went past `damage <= 0`,
 *     even if no monster trait fires.
 *   - Both handlers return `contributedToOverclock: false` (only the inline
 *     emit fires; runner does NOT double-emit).
 *   - Core damage multiplier (`damageTotal = damage × (1+N)`) is preserved.
 *
 * NOTE: the action `APPLY_SHIELD_REFLECT` doesn't carry a source slot. Both
 * handlers read traits from `surfaceCtx.monster` (the target), not from
 * `slotItem`. See `card-schema/equipment-derived/shield-reflect.ts` comment.
 */
import { describe, expect, it } from 'vitest';
import '../card-schema'; // triggers handler registration
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { getEternalRelic } from '@/lib/eternalRelics';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRecycleBag(count: number): GameCardData[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `rb-${i}`,
    type: 'magic' as const,
    name: `Junk-${i}`,
    value: 0,
    image: '',
    magicType: 'instant',
  } as GameCardData));
}

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput',
    ...overrides,
  };
}

function makeOverclockState(relicCount: number, overrides?: Partial<GameState>): GameState {
  return makeState({
    eternalRelics: Array.from({ length: relicCount }, () => getEternalRelic('equip-overclock')),
    permanentMagicRecycleBag: makeRecycleBag(11),
    ...overrides,
  });
}

function placeMonster(state: GameState, monster: GameCardData, slot = 0): GameState {
  const slots: Array<GameCardData | null> = [...state.activeCards];
  slots[slot] = monster;
  return { ...state, activeCards: slots as GameState['activeCards'] };
}

function makeDragonBreathMonster(overrides?: Partial<GameCardData>): GameCardData {
  return {
    id: 'm-dragon',
    type: 'monster',
    name: 'Test Dragon',
    value: 5,
    attack: 5,
    image: '',
    hp: 50,
    maxHp: 50,
    currentLayer: 5,
    fury: 5,
    hpLayers: 5,
    monsterType: 'Dragon',
    dragonDamageRetaliation: 4,
    ...overrides,
  } as GameCardData;
}

function makeBossMonster(overrides?: Partial<GameCardData>): GameCardData {
  return {
    id: 'm-boss',
    type: 'monster',
    name: 'Test Boss',
    value: 5,
    attack: 5,
    image: '',
    hp: 50,
    maxHp: 50,
    currentLayer: 5,
    fury: 5,
    hpLayers: 5,
    bossRetaliationDamage: 3,
    ...overrides,
  } as GameCardData;
}

function makePlainMonster(overrides?: Partial<GameCardData>): GameCardData {
  return {
    id: 'm-plain',
    type: 'monster',
    name: 'Plain Monster',
    value: 1,
    attack: 1,
    image: '',
    hp: 50,
    maxHp: 50,
    currentLayer: 5,
    fury: 5,
    hpLayers: 5,
    ...overrides,
  } as GameCardData;
}

function findOverclockSideEffect(sideEffects: ReadonlyArray<unknown>): { count?: number; surface?: string } | null {
  const found = (sideEffects as Array<{ event?: string; payload?: unknown }>).find(
    s => s.event === 'combat:equipOverclockTriggered',
  );
  return found ? (found.payload as { count?: number; surface?: string }) : null;
}

function countActions(
  enqueued: ReadonlyArray<{ type: string }>,
  type: string,
): number {
  return enqueued.filter(a => a.type === type).length;
}

function countSideEffects(sideEffects: ReadonlyArray<unknown>, event: string): number {
  return (sideEffects as Array<{ event?: string }>).filter(s => s.event === event).length;
}

function countLogsContaining(sideEffects: ReadonlyArray<unknown>, substring: string): number {
  return (sideEffects as Array<{ event?: string; payload?: { message?: string } }>)
    .filter(s => s.event === 'log:entry' && (s.payload?.message ?? '').includes(substring))
    .length;
}

// ---------------------------------------------------------------------------
// Handler 1: dragonBreathRetaliation
// ---------------------------------------------------------------------------

describe('dragonBreathRetaliation handler — replay semantic', () => {
  it('overclock=0 → 1 APPLY_DRAGON_BREATH_RETALIATION + 1 float + 1 side effect', () => {
    const state = placeMonster(makeState({ hp: 30 }), makeDragonBreathMonster());
    const result = reduce(state, {
      type: 'APPLY_SHIELD_REFLECT',
      monsterId: 'm-dragon',
      damage: 2,
      sourceName: 'TestShield',
    });

    expect(countActions(result.enqueuedActions, 'APPLY_DRAGON_BREATH_RETALIATION')).toBe(1);
    expect(countActions(result.enqueuedActions, 'TRIGGER_MONSTER_SKILL_FLOAT')).toBe(1);
    expect(countSideEffects(result.sideEffects, 'combat:dragonBreathRetaliation')).toBe(1);
    expect(findOverclockSideEffect(result.sideEffects)).toBeNull();
  });

  it('overclock=2 → 3 APPLY_DRAGON_BREATH_RETALIATION + 1 float + 1 side effect (one-shot UX cues)', () => {
    const state = placeMonster(
      makeOverclockState(2, { hp: 50 }),
      makeDragonBreathMonster(),
    );
    const result = reduce(state, {
      type: 'APPLY_SHIELD_REFLECT',
      monsterId: 'm-dragon',
      damage: 2,
      sourceName: 'TestShield',
    });

    // (1+2)=3 retaliation actions, but only 1 float and 1 side effect.
    expect(countActions(result.enqueuedActions, 'APPLY_DRAGON_BREATH_RETALIATION')).toBe(3);
    expect(countActions(result.enqueuedActions, 'TRIGGER_MONSTER_SKILL_FLOAT')).toBe(1);
    expect(countSideEffects(result.sideEffects, 'combat:dragonBreathRetaliation')).toBe(1);
  });

  it('does not fire when monster has no dragonDamageRetaliation', () => {
    const state = placeMonster(
      makeOverclockState(2, { hp: 50 }),
      makePlainMonster(),
    );
    const result = reduce(state, {
      type: 'APPLY_SHIELD_REFLECT',
      monsterId: 'm-plain',
      damage: 2,
      sourceName: 'TestShield',
    });

    expect(countActions(result.enqueuedActions, 'APPLY_DRAGON_BREATH_RETALIATION')).toBe(0);
  });

  it('does not fire when monster is stunned', () => {
    const state = placeMonster(
      makeOverclockState(2, { hp: 50 }),
      makeDragonBreathMonster({ isStunned: true }),
    );
    const result = reduce(state, {
      type: 'APPLY_SHIELD_REFLECT',
      monsterId: 'm-dragon',
      damage: 2,
      sourceName: 'TestShield',
    });

    expect(countActions(result.enqueuedActions, 'APPLY_DRAGON_BREATH_RETALIATION')).toBe(0);
  });

  it('does not fire when reflect kills the monster (defeated branch)', () => {
    // Lethal damage (50+ to a 50hp monster with current layer 1) → defeated → dragon-breath gated
    const state = placeMonster(
      makeOverclockState(2, { hp: 30 }),
      makeDragonBreathMonster({ currentLayer: 1, hp: 5, maxHp: 5, fury: 1, hpLayers: 1 }),
    );
    const result = reduce(state, {
      type: 'APPLY_SHIELD_REFLECT',
      monsterId: 'm-dragon',
      damage: 100, // overkill
      sourceName: 'TestShield',
    });

    expect(countActions(result.enqueuedActions, 'APPLY_DRAGON_BREATH_RETALIATION')).toBe(0);
    expect(countActions(result.enqueuedActions, 'MONSTER_DEFEATED')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Handler 2: bossRetaliation
// ---------------------------------------------------------------------------

describe('bossRetaliation handler — replay semantic', () => {
  it('overclock=0 → 1 APPLY_DAMAGE + 1 float + 1 log line', () => {
    const state = placeMonster(makeState({ hp: 30 }), makeBossMonster());
    const result = reduce(state, {
      type: 'APPLY_SHIELD_REFLECT',
      monsterId: 'm-boss',
      damage: 2,
      sourceName: 'TestShield',
    });

    const damageActions = result.enqueuedActions.filter(
      a => a.type === 'APPLY_DAMAGE' && (a as { amount?: number }).amount === 3,
    );
    expect(damageActions).toHaveLength(1);
    expect(countLogsContaining(result.sideEffects, '反噬')).toBe(1);
  });

  it('overclock=2 → 3 APPLY_DAMAGE + 1 float + 1 log line (one-shot)', () => {
    const state = placeMonster(makeOverclockState(2, { hp: 50 }), makeBossMonster());
    const result = reduce(state, {
      type: 'APPLY_SHIELD_REFLECT',
      monsterId: 'm-boss',
      damage: 2,
      sourceName: 'TestShield',
    });

    const damageActions = result.enqueuedActions.filter(
      a => a.type === 'APPLY_DAMAGE' && (a as { amount?: number }).amount === 3,
    );
    expect(damageActions).toHaveLength(3); // (1+2)
    expect(countLogsContaining(result.sideEffects, '反噬')).toBe(1); // single log
  });

  it('does not fire when monster has no bossRetaliationDamage', () => {
    const state = placeMonster(
      makeOverclockState(2, { hp: 50 }),
      makePlainMonster(),
    );
    const result = reduce(state, {
      type: 'APPLY_SHIELD_REFLECT',
      monsterId: 'm-plain',
      damage: 2,
      sourceName: 'TestShield',
    });

    const damageActions = result.enqueuedActions.filter(a => a.type === 'APPLY_DAMAGE');
    expect(damageActions).toHaveLength(0);
  });

  it('does not fire when monster is stunned', () => {
    const state = placeMonster(
      makeOverclockState(2, { hp: 50 }),
      makeBossMonster({ isStunned: true }),
    );
    const result = reduce(state, {
      type: 'APPLY_SHIELD_REFLECT',
      monsterId: 'm-boss',
      damage: 2,
      sourceName: 'TestShield',
    });

    const damageActions = result.enqueuedActions.filter(a => a.type === 'APPLY_DAMAGE');
    expect(damageActions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Combined handlers — both fire on monster with both traits
// ---------------------------------------------------------------------------

describe('combined: monster with both dragonDamageRetaliation AND bossRetaliationDamage', () => {
  it('overclock=2 → both handlers fire 3 times each, single overclock side effect emit', () => {
    const monster: GameCardData = {
      ...makeDragonBreathMonster(),
      bossRetaliationDamage: 3,
    } as GameCardData;
    const state = placeMonster(makeOverclockState(2, { hp: 50 }), monster);
    const result = reduce(state, {
      type: 'APPLY_SHIELD_REFLECT',
      monsterId: 'm-dragon',
      damage: 2,
      sourceName: 'TestShield',
    });

    // Both handlers fire 3 times each.
    expect(countActions(result.enqueuedActions, 'APPLY_DRAGON_BREATH_RETALIATION')).toBe(3);
    expect(
      result.enqueuedActions.filter(
        a => a.type === 'APPLY_DAMAGE' && (a as { amount?: number }).amount === 3,
      ),
    ).toHaveLength(3);

    // Exactly one overclock side effect (inline emit, not double-emitted by runner).
    expect(countSideEffects(result.sideEffects, 'combat:equipOverclockTriggered')).toBe(1);
    expect(findOverclockSideEffect(result.sideEffects)).toEqual({
      surface: 'shieldReflect',
      count: 2,
    });
  });
});

// ---------------------------------------------------------------------------
// Inline overclock side-effect emission — preserves original UX
// ---------------------------------------------------------------------------

describe('inline combat:equipOverclockTriggered emit — always when overclock active', () => {
  it('overclock=2 + plain monster (no dragon, no boss) → still emits (core damage × (1+N))', () => {
    const state = placeMonster(
      makeOverclockState(2, { hp: 50 }),
      makePlainMonster(),
    );
    const result = reduce(state, {
      type: 'APPLY_SHIELD_REFLECT',
      monsterId: 'm-plain',
      damage: 2,
      sourceName: 'TestShield',
    });

    expect(countSideEffects(result.sideEffects, 'combat:equipOverclockTriggered')).toBe(1);
  });

  it('overclock=0 + dragon monster → no emit (overclock not active)', () => {
    const state = placeMonster(makeState({ hp: 30 }), makeDragonBreathMonster());
    const result = reduce(state, {
      type: 'APPLY_SHIELD_REFLECT',
      monsterId: 'm-dragon',
      damage: 2,
      sourceName: 'TestShield',
    });

    expect(countSideEffects(result.sideEffects, 'combat:equipOverclockTriggered')).toBe(0);
  });

  it('damage <= 0 early return → no emit even with overclock active', () => {
    const state = placeMonster(makeOverclockState(2, { hp: 50 }), makeDragonBreathMonster());
    const result = reduce(state, {
      type: 'APPLY_SHIELD_REFLECT',
      monsterId: 'm-dragon',
      damage: 0,
      sourceName: 'TestShield',
    });

    expect(countSideEffects(result.sideEffects, 'combat:equipOverclockTriggered')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Core damage multiplier — preserves original (1 + overclock) scaling
// ---------------------------------------------------------------------------

describe('core damage multiplier — damage × (1 + overclockExtra)', () => {
  it('overclock=2 → reflect log shows multiplied damage with (装备超频×3) suffix', () => {
    const state = placeMonster(makeOverclockState(2, { hp: 50 }), makePlainMonster());
    const result = reduce(state, {
      type: 'APPLY_SHIELD_REFLECT',
      monsterId: 'm-plain',
      damage: 2,
      sourceName: 'TestShield',
    });

    // damageTotal = 2 * 3 = 6
    expect(countLogsContaining(result.sideEffects, '反弹了 6 点伤害')).toBe(1);
    expect(countLogsContaining(result.sideEffects, '装备超频×3')).toBe(1);
  });

  it('overclock=0 → reflect log shows base damage without suffix', () => {
    const state = placeMonster(makeState({ hp: 30 }), makePlainMonster());
    const result = reduce(state, {
      type: 'APPLY_SHIELD_REFLECT',
      monsterId: 'm-plain',
      damage: 2,
      sourceName: 'TestShield',
    });

    expect(countLogsContaining(result.sideEffects, '反弹了 2 点伤害')).toBe(1);
    expect(countLogsContaining(result.sideEffects, '装备超频')).toBe(0);
  });
});
