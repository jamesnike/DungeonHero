/**
 * Equipment-derived attack surface — overkill / post-attack handlers (PR-4b).
 *
 * Covers the 4 effects migrated from `combat.ts:reducePerformHeroAttack`:
 *   1. overkill-lifesteal — gates on overkillHitCount > 0 + lifesteal > 0
 *   2. overkill-draw — pure side-effect emit (no log)
 *   3. overkill-amplify-missile — REPLAY (1 log + 1+N AMPLIFY)
 *   4. post-attack-spell-damage — RNG target pick (iter 1 only); replay
 *      re-targets cached monster via surfaceCtx.postAttackSpellTarget
 *
 * NOTE: tests target the actual `PERFORM_HERO_ATTACK` reducer entry to verify
 * the ENTIRE pipeline works (single overclock emit, target caching, etc.).
 */
import { describe, expect, it } from 'vitest';
import '../card-schema';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { getEternalRelic } from '@/lib/eternalRelics';
import { createRng } from '../rng';
import { runEquipmentDerivedHandlers } from '../card-schema/equipment-derived/registry';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';

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

function makeMonster(overrides?: Partial<GameCardData>): GameCardData {
  return {
    id: 'm1',
    type: 'monster',
    name: 'Test Monster',
    value: 3,
    attack: 3,
    image: '',
    hp: 1,
    maxHp: 1,
    currentLayer: 1,
    fury: 1,
    hpLayers: 1,
    ...overrides,
  } as GameCardData;
}

function makeWeapon(overrides?: Partial<GameCardData>): GameCardData {
  return {
    id: 'w1',
    type: 'weapon',
    name: 'TestSword',
    value: 100,
    image: '',
    durability: 5,
    maxDurability: 5,
    fromSlot: 'equipmentSlot1',
    ...overrides,
  } as GameCardData;
}

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput',
    combatState: { ...initialCombatState, heroAttacksRemaining: 99, engagedMonsterIds: [] },
    hp: 30,
    maxHp: 30,
    rng: createRng(42),
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

function withWeaponAndMonster(
  state: GameState,
  weapon: GameCardData,
  monster: GameCardData,
  monsterSlot = 0,
): GameState {
  const slots: Array<GameCardData | null> = [...state.activeCards];
  slots[monsterSlot] = monster;
  return {
    ...state,
    equipmentSlot1: weapon as EquipmentItem,
    activeCards: slots as unknown as ActiveRowSlots,
  };
}

function withMultipleMonsters(
  state: GameState,
  weapon: GameCardData,
  monsters: GameCardData[],
): GameState {
  const slots: Array<GameCardData | null> = [...state.activeCards];
  monsters.forEach((m, i) => { slots[i] = m; });
  return {
    ...state,
    equipmentSlot1: weapon as EquipmentItem,
    activeCards: slots as unknown as ActiveRowSlots,
  };
}

function countActions(enq: ReadonlyArray<{ type: string }>, type: string, predicate?: (a: any) => boolean): number {
  return enq.filter(a => a.type === type && (!predicate || predicate(a))).length;
}

function countSideEffects(side: ReadonlyArray<unknown>, event: string): number {
  return (side as Array<{ event?: string }>).filter(s => s.event === event).length;
}

function countLogsContaining(side: ReadonlyArray<unknown>, sub: string): number {
  return (side as Array<{ event?: string; payload?: { message?: string } }>)
    .filter(s => s.event === 'log:entry' && (s.payload?.message ?? '').includes(sub)).length;
}

function findOverclockEmits(side: ReadonlyArray<unknown>): Array<{ surface?: string; count?: number }> {
  return (side as Array<{ event?: string; payload?: { surface?: string; count?: number } }>)
    .filter(s => s.event === 'combat:equipOverclockTriggered')
    .map(s => s.payload ?? {});
}

// ---------------------------------------------------------------------------
// 1. overkill-lifesteal
// ---------------------------------------------------------------------------

describe('overkill-lifesteal handler', () => {
  it('overclock=2 + overkill triggered → 3 HEAL each of (lifesteal × hitCount)', () => {
    const m = makeMonster({ hp: 1, maxHp: 1 });
    // overkillDraw triggers overkillHitCount += 1 inside reducer when overkill happens;
    // permanentSpellLifesteal provides the lifesteal amount.
    const w = makeWeapon({ value: 100, overkillDraw: 1 });
    const state = withWeaponAndMonster(
      makeOverclockState(2, { permanentSpellLifesteal: 4 }),
      w, m,
    );
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    });

    const heals = result.enqueuedActions.filter(
      a => a.type === 'HEAL' && (a as any).source === 'overkill-lifesteal' && (a as any).amount === 4,
    );
    expect(heals).toHaveLength(3); // (1 + 2)
    expect(countLogsContaining(result.sideEffects, '超杀吸血：恢复 4 生命')).toBe(1);
  });

  it('does not fire when no overkill happens', () => {
    const m = makeMonster({ hp: 100, maxHp: 100 });
    const w = makeWeapon({ value: 1, overkillDraw: 1 });
    const state = withWeaponAndMonster(
      makeOverclockState(2, { permanentSpellLifesteal: 4 }),
      w, m,
    );
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    });

    expect(
      result.enqueuedActions.filter(a => a.type === 'HEAL' && (a as any).source === 'overkill-lifesteal'),
    ).toHaveLength(0);
  });

  it('does not fire when lifesteal = 0 even with overkill', () => {
    const m = makeMonster({ hp: 1, maxHp: 1 });
    const w = makeWeapon({ value: 100, overkillDraw: 1 });
    const state = withWeaponAndMonster(makeOverclockState(2), w, m);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    });

    expect(
      result.enqueuedActions.filter(a => a.type === 'HEAL' && (a as any).source === 'overkill-lifesteal'),
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. overkill-draw
// ---------------------------------------------------------------------------

describe('overkill-draw handler', () => {
  it('overclock=2 + overkill → 3 equipment:drawFromBackpack side effects', () => {
    const m = makeMonster({ hp: 1, maxHp: 1 });
    const w = makeWeapon({ value: 100, overkillDraw: 2 });
    const state = withWeaponAndMonster(makeOverclockState(2), w, m);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    });

    const drawFx = (result.sideEffects as any[]).filter(
      s => s.event === 'equipment:drawFromBackpack' && s.payload?.source === 'overkill' && s.payload?.count === 2,
    );
    expect(drawFx).toHaveLength(3);
  });

  it('does not push log on any iteration (hook handles UI)', () => {
    const m = makeMonster({ hp: 1, maxHp: 1 });
    const w = makeWeapon({ value: 100, overkillDraw: 1 });
    const state = withWeaponAndMonster(makeOverclockState(2), w, m);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    });

    expect(countLogsContaining(result.sideEffects, '超杀抽牌')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. overkill-amplify-missile
// ---------------------------------------------------------------------------

describe('overkill-amplify-missile handler', () => {
  it('overclock=2 + overkill → 3 AMPLIFY actions + 1 log', () => {
    const m = makeMonster({ hp: 1, maxHp: 1 });
    const w = makeWeapon({ value: 100, overkillAmplifyMissile: 2 });
    const state = withWeaponAndMonster(makeOverclockState(2), w, m);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    });

    const amplifies = result.enqueuedActions.filter(
      a => a.type === 'AMPLIFY_CARDS_BY_NAME'
        && (a as any).cardName === '魔弹'
        && (a as any).amount === 2,
    );
    expect(amplifies).toHaveLength(3);
    expect(countLogsContaining(result.sideEffects, '所有「魔弹」+2 增幅')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4. post-attack-spell-damage (奥术之刃)
// ---------------------------------------------------------------------------

describe('post-attack-spell-damage handler', () => {
  it('overclock=0 → 1 DEAL_DAMAGE_TO_MONSTER + 1 side effect + 1 log', () => {
    const target = makeMonster({ id: 'tgt', hp: 100, maxHp: 100 });
    const w = makeWeapon({ value: 1, postAttackSpellDamage: 5 });
    const state = withWeaponAndMonster(makeState(), w, target);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'tgt',
    });

    const dmgs = result.enqueuedActions.filter(
      a => a.type === 'DEAL_DAMAGE_TO_MONSTER'
        && (a as any).source === 'arcane-blade-spell'
        && (a as any).damage === 5,
    );
    expect(dmgs).toHaveLength(1);
    expect(countSideEffects(result.sideEffects, 'combat:arcaneBladeSpell')).toBe(1);
    expect(countLogsContaining(result.sideEffects, '附魔：对')).toBe(1);
  });

  it('overclock=2 → 3 DEAL_DAMAGE_TO_MONSTER all targeting the SAME monster + 1 side effect + 1 log', () => {
    const target = makeMonster({ id: 'tgt', hp: 100, maxHp: 100, currentLayer: 5, fury: 5, hpLayers: 5 });
    const w = makeWeapon({ value: 1, postAttackSpellDamage: 5 });
    const state = withWeaponAndMonster(makeOverclockState(2), w, target);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'tgt',
    });

    const dmgs = result.enqueuedActions.filter(
      a => a.type === 'DEAL_DAMAGE_TO_MONSTER'
        && (a as any).source === 'arcane-blade-spell'
        && (a as any).damage === 5,
    );
    expect(dmgs).toHaveLength(3);
    // Single side effect + log on iter 1 only.
    expect(countSideEffects(result.sideEffects, 'combat:arcaneBladeSpell')).toBe(1);
    expect(countLogsContaining(result.sideEffects, '附魔：对')).toBe(1);
    // All 3 actions target the same cached monster id.
    const targetIds = new Set(dmgs.map(d => (d as any).monsterId));
    expect(targetIds.size).toBe(1);
  });

  it('with multiple monsters on board: iter-1 picks one (deterministic per RNG seed), iter 2..N reuse same target', () => {
    const m1 = makeMonster({ id: 'm-a', name: 'A', hp: 100, maxHp: 100, currentLayer: 5, fury: 5, hpLayers: 5 });
    const m2 = makeMonster({ id: 'm-b', name: 'B', hp: 100, maxHp: 100, currentLayer: 5, fury: 5, hpLayers: 5 });
    const w = makeWeapon({ value: 1, postAttackSpellDamage: 3 });
    const state = withMultipleMonsters(makeOverclockState(2), w, [m1, m2]);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm-a',
    });

    const spellDmgs = result.enqueuedActions.filter(
      a => a.type === 'DEAL_DAMAGE_TO_MONSTER' && (a as any).source === 'arcane-blade-spell',
    );
    expect(spellDmgs).toHaveLength(3); // (1 + 2)
    const targetIds = new Set(spellDmgs.map(d => (d as any).monsterId));
    expect(targetIds.size).toBe(1); // all same
  });

  it('does not fire when no postAttackSpellDamage on weapon', () => {
    const m = makeMonster({ hp: 100, maxHp: 100 });
    const w = makeWeapon({ value: 1 });
    const state = withWeaponAndMonster(makeOverclockState(2), w, m);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    });

    expect(
      result.enqueuedActions.filter(a => a.type === 'DEAL_DAMAGE_TO_MONSTER' && (a as any).source === 'arcane-blade-spell'),
    ).toHaveLength(0);
  });

  it('enqueues BEGIN_COMBAT for the target if not already engaged', () => {
    const m = makeMonster({ id: 'tgt', hp: 100, maxHp: 100, currentLayer: 5, fury: 5, hpLayers: 5 });
    const w = makeWeapon({ value: 1, postAttackSpellDamage: 3 });
    // engagedMonsterIds: [] — neither `m1` (= primary target via PERFORM_HERO_ATTACK)
    // nor `tgt` (= spell damage target, same monster) is engaged at start.
    const state = withWeaponAndMonster(makeState(), w, m);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'tgt',
    });

    // BEGIN_COMBAT is also enqueued by the safety net at DEAL_DAMAGE entry,
    // so we just check at least one BEGIN_COMBAT was enqueued for tgt.
    const begins = result.enqueuedActions.filter(
      a => a.type === 'BEGIN_COMBAT' && (a as any).monster?.id === 'tgt',
    );
    expect(begins.length).toBeGreaterThanOrEqual(1);
  });

  it('RNG determinism: same seed → same target across runs', () => {
    const m1 = makeMonster({ id: 'm-a', name: 'A', hp: 100, maxHp: 100, currentLayer: 5, fury: 5, hpLayers: 5 });
    const m2 = makeMonster({ id: 'm-b', name: 'B', hp: 100, maxHp: 100, currentLayer: 5, fury: 5, hpLayers: 5 });
    const m3 = makeMonster({ id: 'm-c', name: 'C', hp: 100, maxHp: 100, currentLayer: 5, fury: 5, hpLayers: 5 });
    const w = makeWeapon({ value: 1, postAttackSpellDamage: 3 });

    const state1 = withMultipleMonsters(makeState({ rng: createRng(123) }), w, [m1, m2, m3]);
    const r1 = reduce(state1, { type: 'PERFORM_HERO_ATTACK', slotId: 'equipmentSlot1', targetMonsterId: 'm-a' });

    const state2 = withMultipleMonsters(makeState({ rng: createRng(123) }), w, [m1, m2, m3]);
    const r2 = reduce(state2, { type: 'PERFORM_HERO_ATTACK', slotId: 'equipmentSlot1', targetMonsterId: 'm-a' });

    const target1 = (r1.enqueuedActions.find(a => a.type === 'DEAL_DAMAGE_TO_MONSTER' && (a as any).source === 'arcane-blade-spell') as any)?.monsterId;
    const target2 = (r2.enqueuedActions.find(a => a.type === 'DEAL_DAMAGE_TO_MONSTER' && (a as any).source === 'arcane-blade-spell') as any)?.monsterId;
    expect(target1).toBeDefined();
    expect(target1).toBe(target2);
  });
});

// ---------------------------------------------------------------------------
// Single overclock emit per attack regardless of how many overkill handlers
// fire
// ---------------------------------------------------------------------------

describe('inline overclock emit — overkill handlers only emit once total', () => {
  it('lifesteal + draw + amplify all fire → exactly 1 emit', () => {
    const m = makeMonster({ hp: 1, maxHp: 1 });
    const w = makeWeapon({
      value: 100,
      overkillDraw: 1,
      overkillAmplifyMissile: 1,
    });
    const state = withWeaponAndMonster(
      makeOverclockState(2, { permanentSpellLifesteal: 3 }),
      w, m,
    );
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    });

    const emits = findOverclockEmits(result.sideEffects);
    expect(emits).toHaveLength(1);
    expect(emits[0]).toEqual({ surface: 'attack', count: 2 });
  });
});

// ---------------------------------------------------------------------------
// Direct registry tests — `only` filter isolates each handler
// ---------------------------------------------------------------------------

describe('runEquipmentDerivedHandlers — `only` filter for overkill IDs', () => {
  it('only fires the named handler when filter is set', () => {
    const w = makeWeapon({ value: 100, overkillDraw: 2, overkillAmplifyMissile: 2 });
    const baseState = makeOverclockState(2);
    const surfaceCtx = {
      targetMonster: makeMonster(), workingMonster: makeMonster(),
      monsterDefeated: true, finalDamage: 100, baseDamage: 100,
      isCrit: false, overkillHitCount: 1, weaponDestroyed: false,
      isMonsterEquip: false, isBuildingTarget: false, attackEffectiveLifesteal: 0,
      amuletEffects: { flashCount: 0, strengthCount: 0, lifeOverkillBonus: 0 } as any,
    };

    const enq: any[] = [];
    const side: any[] = [];
    runEquipmentDerivedHandlers('attack', {
      state: baseState, slotItem: w, slotId: 'equipmentSlot1',
      patch: {}, sideEffects: side, enqueuedActions: enq,
      rng: baseState.rng, surface: 'attack', surfaceCtx,
    }, { only: ['overkill-amplify-missile'] });

    // Only AMPLIFY actions, no draw side effects.
    expect(enq.filter(a => a.type === 'AMPLIFY_CARDS_BY_NAME')).toHaveLength(3);
    expect(side.filter(s => s.event === 'equipment:drawFromBackpack')).toHaveLength(0);
  });
});
