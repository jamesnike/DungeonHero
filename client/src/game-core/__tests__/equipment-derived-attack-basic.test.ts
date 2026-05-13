/**
 * Equipment-derived attack surface — basic handlers (PR-4a) tests.
 *
 * Covers the 7 effects migrated from `combat.ts:reducePerformHeroAttack`:
 *   1. heal-on-attack
 *   2. draw-on-attack
 *   3. boss-retaliation-attack (monster trait, on-hit)
 *   4. heal-on-kill
 *   5. kill-gold-scaling (MULTIPLY semantic — gold delta)
 *   6. dragon-breath-retaliation-attack (monster trait, on-hit-not-kill)
 *   7. post-attack-hand-recycle
 *
 * Plus:
 *   - Inline `combat:equipOverclockTriggered` emit (one per attack, gated on
 *     overclockExtra > 0 AND at least one handler fired).
 *   - Registry `only` filter — single handler isolated per call site.
 *   - Original enqueue ordering preserved (HEAL drains before subsequent
 *     APPLY_DAMAGE).
 *
 * NOTE: tests target the actual `PERFORM_HERO_ATTACK` reducer entry to verify
 * the ENTIRE pipeline works, not just the handlers in isolation. Mocking the
 * reducer entry would miss ordering / runner-call site issues.
 */
import { describe, expect, it } from 'vitest';
import '../card-schema'; // triggers handler registration
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { getEternalRelic } from '@/lib/eternalRelics';
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
    hp: 10,
    maxHp: 10,
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
    value: 5,
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
): GameState {
  const slots: Array<GameCardData | null> = [...state.activeCards];
  slots[0] = monster;
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
// 1. heal-on-attack
// ---------------------------------------------------------------------------

describe('heal-on-attack handler', () => {
  it('overclock=0 → 1 HEAL + 1 log', () => {
    const w = makeWeapon({ healOnAttack: 2 });
    const state = withWeaponAndMonster(makeState(), w, makeMonster());
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    });

    expect(countActions(result.enqueuedActions, 'HEAL', a => a.source === 'heal-on-attack')).toBe(1);
    expect(countLogsContaining(result.sideEffects, '攻击恢复了 2 点生命')).toBe(1);
    expect(findOverclockEmits(result.sideEffects)).toHaveLength(0);
  });

  it('overclock=2 → 3 HEAL + 1 log + 1 inline overclock emit', () => {
    const w = makeWeapon({ healOnAttack: 2 });
    const state = withWeaponAndMonster(makeOverclockState(2), w, makeMonster());
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    });

    expect(countActions(result.enqueuedActions, 'HEAL', a => a.source === 'heal-on-attack')).toBe(3);
    expect(countLogsContaining(result.sideEffects, '攻击恢复了 2 点生命')).toBe(1);
    const emits = findOverclockEmits(result.sideEffects);
    expect(emits).toHaveLength(1);
    expect(emits[0]).toEqual({ surface: 'attack', count: 2 });
  });

  it('does not fire when slotItem.healOnAttack is undefined', () => {
    const w = makeWeapon();
    const state = withWeaponAndMonster(makeOverclockState(2), w, makeMonster());
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    });

    expect(countActions(result.enqueuedActions, 'HEAL', a => a.source === 'heal-on-attack')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. draw-on-attack
// ---------------------------------------------------------------------------

describe('draw-on-attack handler', () => {
  it('overclock=2 → 3 DRAW_CARDS (count=2 each) + 1 log', () => {
    const w = makeWeapon({ drawOnAttack: 2 });
    const state = withWeaponAndMonster(makeOverclockState(2), w, makeMonster());
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    });

    const drawCount = result.enqueuedActions.filter(
      a => a.type === 'DRAW_CARDS' && (a as any).source === 'backpack' && (a as any).count === 2,
    ).length;
    expect(drawCount).toBe(3);
    expect(countLogsContaining(result.sideEffects, '从背包抽 2 张牌')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. boss-retaliation-attack
// ---------------------------------------------------------------------------

describe('boss-retaliation-attack handler', () => {
  it('overclock=2 → 3 APPLY_DAMAGE (=3) + 1 float + 1 log when boss survives', () => {
    const boss = makeMonster({ id: 'b1', name: 'Boss', bossRetaliationDamage: 3, hp: 100, maxHp: 100, currentLayer: 5, fury: 5, hpLayers: 5 });
    const w = makeWeapon({ value: 1 });
    const state = withWeaponAndMonster(makeOverclockState(2), w, boss);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'b1',
    });

    expect(
      result.enqueuedActions.filter(
        a => a.type === 'APPLY_DAMAGE' && (a as any).amount === 3 && (a as any).source === 'combat',
      ),
    ).toHaveLength(3);
    expect(countLogsContaining(result.sideEffects, '反噬：造成 3 点直接伤害')).toBe(1);
  });

  it('does not fire when monster is stunned', () => {
    const boss = makeMonster({ id: 'b1', bossRetaliationDamage: 3, isStunned: true, hp: 100, maxHp: 100, currentLayer: 5, fury: 5, hpLayers: 5 });
    const w = makeWeapon({ value: 1 });
    const state = withWeaponAndMonster(makeOverclockState(2), w, boss);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'b1',
    });

    expect(
      result.enqueuedActions.filter(a => a.type === 'APPLY_DAMAGE' && (a as any).source === 'combat'),
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. heal-on-kill
// ---------------------------------------------------------------------------

describe('heal-on-kill handler', () => {
  it('overclock=2 → 3 HEAL when attack kills monster', () => {
    const m = makeMonster({ hp: 1, maxHp: 1 });
    const w = makeWeapon({ value: 100, healOnKill: 5 });
    const state = withWeaponAndMonster(makeOverclockState(2), w, m);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    });

    expect(countActions(result.enqueuedActions, 'HEAL', a => a.source === 'heal-on-kill')).toBe(3);
    expect(countLogsContaining(result.sideEffects, '击杀回复 5 点生命')).toBe(1);
  });

  it('does not fire when monster survives', () => {
    const m = makeMonster({ hp: 100, maxHp: 100 });
    const w = makeWeapon({ value: 1, healOnKill: 5 });
    const state = withWeaponAndMonster(makeOverclockState(2), w, m);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    });

    expect(countActions(result.enqueuedActions, 'HEAL', a => a.source === 'heal-on-kill')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. kill-gold-scaling (MULTIPLY)
// ---------------------------------------------------------------------------

describe('kill-gold-scaling handler — MULTIPLY semantic', () => {
  it('overclock=2 → gold +6 (=2 × (1+2)), counter ticks once', () => {
    const m = makeMonster({ hp: 1, maxHp: 1 });
    const w = makeWeapon({ value: 100, killGoldScaling: true, killGoldCounter: 2 });
    const state = withWeaponAndMonster(makeOverclockState(2, { gold: 0 }), w, m);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    });

    expect(result.state.gold).toBe(6); // 2 × (1+2)
    // Counter +1 (one shot, regardless of overclock count)
    const slot = result.state.equipmentSlot1 as GameCardData | null;
    expect(slot?.killGoldCounter).toBe(3);
    expect(countLogsContaining(result.sideEffects, '赏金：击杀获得 2 金币')).toBe(1);
  });

  it('overclock=0 → gold +2, counter ticks once', () => {
    const m = makeMonster({ hp: 1, maxHp: 1 });
    const w = makeWeapon({ value: 100, killGoldScaling: true, killGoldCounter: 2 });
    const state = withWeaponAndMonster(makeState({ gold: 0 }), w, m);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    });

    expect(result.state.gold).toBe(2);
    const slot = result.state.equipmentSlot1 as GameCardData | null;
    expect(slot?.killGoldCounter).toBe(3);
  });

  it('does not fire when monster survives', () => {
    const m = makeMonster({ hp: 100, maxHp: 100 });
    const w = makeWeapon({ value: 1, killGoldScaling: true, killGoldCounter: 2 });
    const state = withWeaponAndMonster(makeOverclockState(2, { gold: 0 }), w, m);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    });

    expect(result.state.gold).toBe(0);
    const slot = result.state.equipmentSlot1 as GameCardData | null;
    expect(slot?.killGoldCounter).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 6. dragon-breath-retaliation-attack
// ---------------------------------------------------------------------------

describe('dragon-breath-retaliation-attack handler', () => {
  it('overclock=2 → 3 APPLY_DRAGON_BREATH_RETALIATION + 1 float + 1 side effect when dragon survives', () => {
    const dragon = makeMonster({
      id: 'd1', name: 'Dragon', monsterType: 'Dragon',
      dragonDamageRetaliation: 4, hp: 50, maxHp: 50, currentLayer: 3, fury: 3, hpLayers: 3,
    });
    const w = makeWeapon({ value: 1 });
    const state = withWeaponAndMonster(makeOverclockState(2), w, dragon);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'd1',
    });

    expect(countActions(result.enqueuedActions, 'APPLY_DRAGON_BREATH_RETALIATION')).toBe(3);
    expect(countSideEffects(result.sideEffects, 'combat:dragonBreathRetaliation')).toBe(1);
  });

  it('does not fire when dragon is killed by attack (gates on !monsterDefeated)', () => {
    const dragon = makeMonster({
      id: 'd1', name: 'Dragon',
      dragonDamageRetaliation: 4, hp: 1, maxHp: 1, currentLayer: 1, fury: 1, hpLayers: 1,
    });
    const w = makeWeapon({ value: 100 });
    const state = withWeaponAndMonster(makeOverclockState(2), w, dragon);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'd1',
    });

    expect(countActions(result.enqueuedActions, 'APPLY_DRAGON_BREATH_RETALIATION')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. post-attack-hand-recycle
// ---------------------------------------------------------------------------

describe('post-attack-hand-recycle handler', () => {
  it('overclock=2 → 3 combat:postAttackHandRecycle side effects', () => {
    const w = makeWeapon({ postAttackHandRecycle: true });
    const state = withWeaponAndMonster(makeOverclockState(2), w, makeMonster());
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    });

    expect(countSideEffects(result.sideEffects, 'combat:postAttackHandRecycle')).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Inline overclock emit — single emit per attack regardless of how many
// handlers fire
// ---------------------------------------------------------------------------

describe('inline combat:equipOverclockTriggered emit — single per attack', () => {
  it('multiple handlers fire (heal + draw + dragon) → exactly 1 emit', () => {
    const dragon = makeMonster({
      id: 'd1', monsterType: 'Dragon',
      dragonDamageRetaliation: 2, hp: 50, maxHp: 50, currentLayer: 3, fury: 3, hpLayers: 3,
    });
    const w = makeWeapon({ value: 1, healOnAttack: 1, drawOnAttack: 1 });
    const state = withWeaponAndMonster(makeOverclockState(2), w, dragon);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'd1',
    });

    const emits = findOverclockEmits(result.sideEffects);
    expect(emits).toHaveLength(1);
    expect(emits[0]).toEqual({ surface: 'attack', count: 2 });
  });

  it('overclock active but no handlers fire → no emit', () => {
    const w = makeWeapon();
    const state = withWeaponAndMonster(makeOverclockState(2), w, makeMonster());
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
    });

    expect(findOverclockEmits(result.sideEffects)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Registry `only` filter — direct unit test
// ---------------------------------------------------------------------------

describe('runEquipmentDerivedHandlers — `only` filter', () => {
  it('only fires the handler whose id matches the filter', () => {
    const w = makeWeapon({ healOnAttack: 1, drawOnAttack: 1 });
    const baseState = makeOverclockState(2);
    const baseSurface = {
      targetMonster: makeMonster(), workingMonster: makeMonster(),
      monsterDefeated: false, finalDamage: 1, baseDamage: 1,
      isCrit: false, overkillHitCount: 0, weaponDestroyed: false,
      isMonsterEquip: false, isBuildingTarget: false, attackEffectiveLifesteal: 0,
      amuletEffects: { flashCount: 0, strengthCount: 0, lifeOverkillBonus: 0 } as any,
    };

    // Filter to only `heal-on-attack` — should fire 3 HEALs but ZERO DRAW_CARDS.
    const enq: any[] = [];
    const side: any[] = [];
    runEquipmentDerivedHandlers('attack', {
      state: baseState, slotItem: w, slotId: 'equipmentSlot1',
      patch: {}, sideEffects: side, enqueuedActions: enq,
      rng: baseState.rng, surface: 'attack', surfaceCtx: baseSurface,
    }, { only: ['heal-on-attack'] });

    expect(enq.filter(a => a.type === 'HEAL')).toHaveLength(3);
    expect(enq.filter(a => a.type === 'DRAW_CARDS')).toHaveLength(0);
  });

  it('without `only` filter: all matching handlers fire (heal + draw)', () => {
    const w = makeWeapon({ healOnAttack: 1, drawOnAttack: 1 });
    const baseState = makeOverclockState(2);
    const baseSurface = {
      targetMonster: makeMonster(), workingMonster: makeMonster(),
      monsterDefeated: false, finalDamage: 1, baseDamage: 1,
      isCrit: false, overkillHitCount: 0, weaponDestroyed: false,
      isMonsterEquip: false, isBuildingTarget: false, attackEffectiveLifesteal: 0,
      amuletEffects: { flashCount: 0, strengthCount: 0, lifeOverkillBonus: 0 } as any,
    };

    const enq: any[] = [];
    const side: any[] = [];
    runEquipmentDerivedHandlers('attack', {
      state: baseState, slotItem: w, slotId: 'equipmentSlot1',
      patch: {}, sideEffects: side, enqueuedActions: enq,
      rng: baseState.rng, surface: 'attack', surfaceCtx: baseSurface,
    });

    expect(enq.filter(a => a.type === 'HEAL')).toHaveLength(3);
    expect(enq.filter(a => a.type === 'DRAW_CARDS')).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Ordering: HEAL must drain BEFORE boss-retaliation APPLY_DAMAGE
// ---------------------------------------------------------------------------

describe('enqueue order preservation', () => {
  it('heal-on-attack HEAL precedes boss-retaliation APPLY_DAMAGE', () => {
    const boss = makeMonster({
      id: 'b1', bossRetaliationDamage: 3,
      hp: 100, maxHp: 100, currentLayer: 5, fury: 5, hpLayers: 5,
    });
    const w = makeWeapon({ value: 1, healOnAttack: 5 });
    const state = withWeaponAndMonster(makeOverclockState(2), w, boss);
    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'b1',
    });

    const firstHealIdx = result.enqueuedActions.findIndex(
      a => a.type === 'HEAL' && (a as any).source === 'heal-on-attack',
    );
    const firstBossDmgIdx = result.enqueuedActions.findIndex(
      a => a.type === 'APPLY_DAMAGE' && (a as any).amount === 3 && (a as any).source === 'combat',
    );
    expect(firstHealIdx).toBeGreaterThanOrEqual(0);
    expect(firstBossDmgIdx).toBeGreaterThanOrEqual(0);
    expect(firstHealIdx).toBeLessThan(firstBossDmgIdx);
  });
});
