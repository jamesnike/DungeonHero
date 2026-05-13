/**
 * Equipment-derived effect registry — infrastructure tests (PR-1).
 *
 * Verifies the runner mechanics WITHOUT touching any production handler:
 *   - First-iteration always called
 *   - Replay iterations only when `fired: true` AND overclock active
 *   - `isFirstIteration` flag toggles correctly
 *   - RNG threading across iterations + across handlers
 *   - Patch / sideEffects / enqueuedActions accumulate
 *   - `combat:equipOverclockTriggered` fires once per surface (not once per handler)
 *   - `surfaceLabel` mapping correct for all 4 surfaces
 *   - Registration order preserved; clear isolates tests
 *
 * No production handlers are registered until PR-2; tests register their own
 * stub handlers and clean up via `__clearEquipmentDerivedHandlers` per test.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  __clearEquipmentDerivedHandlers,
  getEquipmentDerivedRegistrySize,
  getRegisteredEquipmentDerivedHandlerIds,
  registerEquipmentDerivedHandler,
  registerEquipmentDerivedHandlers,
  runEquipmentDerivedHandlers,
} from '../card-schema/equipment-derived';
import type {
  AttackCtx,
  BlockCtx,
  DurabilityLossCtx,
  EquipmentDerivedHandler,
  ShieldReflectCtx,
} from '../card-schema/equipment-derived';
import { createInitialGameState } from '../state';
import { createEmptyAmuletEffects } from '../constants';
import { nextInt } from '../rng';
import { getEternalRelic } from '@/lib/eternalRelics';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { SideEffect } from '../reducer';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveAmuletEffects } from '@/components/game-board/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput',
    ...overrides,
  };
}

function makeRecycleBag(count: number, prefix = 'rb'): GameCardData[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    type: 'magic' as const,
    name: `Junk-${i}`,
    value: 0,
    image: '',
    magicType: 'instant',
  } as GameCardData));
}

function makeOverclockState(relicCount: number): GameState {
  return makeState({
    eternalRelics: Array.from({ length: relicCount }, () => getEternalRelic('equip-overclock')),
    permanentMagicRecycleBag: makeRecycleBag(11), // > 10 to activate aura
  });
}

function makeWeaponSlotItem(): GameCardData {
  return {
    id: 'w1',
    type: 'weapon',
    name: 'Test Weapon',
    value: 1,
    image: '',
    durability: 3,
    maxDurability: 3,
  } as GameCardData;
}

function makeMonster(id = 'm1'): GameCardData {
  return {
    id,
    type: 'monster',
    name: 'Test Monster',
    value: 0,
    image: '',
    attack: 2,
    hp: 5,
    maxHp: 5,
  } as GameCardData;
}

function makeAttackCtxBase(state: GameState): {
  state: GameState;
  slotItem: GameCardData;
  slotId: 'equipmentSlot1';
  patch: Partial<GameState>;
  sideEffects: SideEffect[];
  enqueuedActions: GameAction[];
  rng: GameState['rng'];
  surface: 'attack';
  surfaceCtx: AttackCtx;
} {
  const target = makeMonster();
  return {
    state,
    slotItem: makeWeaponSlotItem(),
    slotId: 'equipmentSlot1',
    patch: {},
    sideEffects: [],
    enqueuedActions: [],
    rng: state.rng,
    surface: 'attack',
    surfaceCtx: {
      targetMonster: target,
      workingMonster: target,
      monsterDefeated: false,
      finalDamage: 3,
      baseDamage: 2,
      isCrit: false,
      overkillHitCount: 0,
      weaponDestroyed: false,
      isMonsterEquip: false,
      isBuildingTarget: false,
      attackEffectiveLifesteal: 0,
      amuletEffects: createEmptyAmuletEffects() as ActiveAmuletEffects,
    },
  };
}

function makeDurabilityLossCtxBase(state: GameState): {
  state: GameState;
  slotItem: GameCardData;
  slotId: 'equipmentSlot1';
  patch: Partial<GameState>;
  sideEffects: SideEffect[];
  enqueuedActions: GameAction[];
  rng: GameState['rng'];
  surface: 'durability-loss';
  surfaceCtx: DurabilityLossCtx;
} {
  const item = makeWeaponSlotItem();
  return {
    state,
    slotItem: item,
    slotId: 'equipmentSlot1',
    patch: {},
    sideEffects: [],
    enqueuedActions: [],
    rng: state.rng,
    surface: 'durability-loss',
    surfaceCtx: {
      prevDur: 3,
      newDur: 2,
      durLost: 1,
      isMonsterEquip: false,
      otherSlotId: 'equipmentSlot2',
      otherItem: null,
      updatedItem: { ...item, durability: 2 } as GameCardData,
    },
  };
}

function makeBlockCtxBase(state: GameState): {
  state: GameState;
  slotItem: GameCardData;
  slotId: 'equipmentSlot1';
  patch: Partial<GameState>;
  sideEffects: SideEffect[];
  enqueuedActions: GameAction[];
  rng: GameState['rng'];
  surface: 'block';
  surfaceCtx: BlockCtx;
} {
  return {
    state,
    slotItem: { ...makeWeaponSlotItem(), type: 'shield' } as GameCardData,
    slotId: 'equipmentSlot1',
    patch: {},
    sideEffects: [],
    enqueuedActions: [],
    rng: state.rng,
    surface: 'block',
    surfaceCtx: {
      monster: makeMonster(),
      blockSlotId: 'equipmentSlot1',
      isPerfectBlock: true,
      isFullBlockShield: false,
      isMonsterEquipShield: false,
      storedCap: 3,
      pendingBlockAttackValue: 2,
      amuletEffects: createEmptyAmuletEffects() as ActiveAmuletEffects,
      reflectDmg: 0,
      reflectSourceName: '',
    },
  };
}

function makeShieldReflectCtxBase(state: GameState): {
  state: GameState;
  slotItem: GameCardData;
  slotId: 'equipmentSlot1';
  patch: Partial<GameState>;
  sideEffects: SideEffect[];
  enqueuedActions: GameAction[];
  rng: GameState['rng'];
  surface: 'shield-reflect';
  surfaceCtx: ShieldReflectCtx;
} {
  return {
    state,
    slotItem: { ...makeWeaponSlotItem(), type: 'shield' } as GameCardData,
    slotId: 'equipmentSlot1',
    patch: {},
    sideEffects: [],
    enqueuedActions: [],
    rng: state.rng,
    surface: 'shield-reflect',
    surfaceCtx: {
      monster: makeMonster(),
      damageBase: 2,
      sourceName: 'Test Shield',
      layersBefore: 1,
    },
  };
}

afterEach(() => {
  __clearEquipmentDerivedHandlers();
});

// ---------------------------------------------------------------------------
// Section 1: Empty registry & basic firing semantics
// ---------------------------------------------------------------------------

describe('runEquipmentDerivedHandlers — empty registry', () => {
  it('returns fired:false with no side effects when nothing is registered', () => {
    const state = makeState();
    const ctx = makeAttackCtxBase(state);
    const result = runEquipmentDerivedHandlers('attack', ctx);

    expect(result.fired).toBe(false);
    expect(result.firedHandlerCount).toBe(0);
    expect(result.overclockExtra).toBe(0);
    expect(ctx.sideEffects).toHaveLength(0);
    expect(ctx.enqueuedActions).toHaveLength(0);
    expect(Object.keys(ctx.patch)).toHaveLength(0);
  });

  it('returns fired:false even with overclock active, when nothing is registered', () => {
    const state = makeOverclockState(2);
    const ctx = makeAttackCtxBase(state);
    const result = runEquipmentDerivedHandlers('attack', ctx);

    expect(result.fired).toBe(false);
    expect(result.firedHandlerCount).toBe(0);
    expect(result.overclockExtra).toBe(2); // aura is reported even if no fire
    expect(ctx.sideEffects).toHaveLength(0); // no overclock side effect because nothing fired
  });
});

describe('runEquipmentDerivedHandlers — single handler, no overclock', () => {
  it('handler returning fired:true is called exactly once; no overclock side effect', () => {
    const calls: Array<{ isFirst: boolean }> = [];
    const handler: EquipmentDerivedHandler<'attack'> = (ctx) => {
      calls.push({ isFirst: ctx.isFirstIteration });
      ctx.patch.gold = (ctx.patch.gold ?? ctx.state.gold ?? 0) + 1;
      return { fired: true };
    };
    registerEquipmentDerivedHandler('attack', 'test:handler', handler);

    const state = makeState({ gold: 10 });
    const ctx = makeAttackCtxBase(state);
    const result = runEquipmentDerivedHandlers('attack', ctx);

    expect(calls).toHaveLength(1);
    expect(calls[0].isFirst).toBe(true);
    expect(result.fired).toBe(true);
    expect(result.firedHandlerCount).toBe(1);
    expect(result.overclockExtra).toBe(0);
    expect(ctx.patch.gold).toBe(11);
    expect(ctx.sideEffects).toHaveLength(0); // no overclock side effect
  });

  it('handler returning fired:false is NOT replayed even with overclock active', () => {
    const calls: number[] = [];
    const handler: EquipmentDerivedHandler<'attack'> = (ctx) => {
      calls.push(ctx.isFirstIteration ? 1 : 2);
      return { fired: false };
    };
    registerEquipmentDerivedHandler('attack', 'test:noop', handler);

    const state = makeOverclockState(3); // overclockExtra = 3
    const ctx = makeAttackCtxBase(state);
    const result = runEquipmentDerivedHandlers('attack', ctx);

    expect(calls).toEqual([1]); // only first iteration
    expect(result.fired).toBe(false);
    expect(ctx.sideEffects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Section 2: Overclock replay semantics
// ---------------------------------------------------------------------------

describe('runEquipmentDerivedHandlers — overclock replay', () => {
  it('handler firing on first iteration is replayed N more times for ×N overclock', () => {
    const calls: Array<{ isFirst: boolean }> = [];
    const handler: EquipmentDerivedHandler<'attack'> = (ctx) => {
      calls.push({ isFirst: ctx.isFirstIteration });
      ctx.patch.gold = (ctx.patch.gold ?? ctx.state.gold ?? 0) + 1;
      return { fired: true };
    };
    registerEquipmentDerivedHandler('attack', 'test:gold-plus-one', handler);

    const state = makeOverclockState(2); // overclockExtra = 2
    state.gold = 10;
    const ctx = makeAttackCtxBase(state);
    const result = runEquipmentDerivedHandlers('attack', ctx);

    expect(calls).toHaveLength(3); // 1 first + 2 replay
    expect(calls.map(c => c.isFirst)).toEqual([true, false, false]);
    expect(ctx.patch.gold).toBe(13); // 10 + 1 + 1 + 1
    expect(result.fired).toBe(true);
    expect(result.firedHandlerCount).toBe(1);
    expect(result.overclockExtra).toBe(2);

    // Exactly one overclock side effect per surface (not per handler)
    const overclockSides = ctx.sideEffects.filter(
      se => se.event === 'combat:equipOverclockTriggered',
    );
    expect(overclockSides).toHaveLength(1);
    expect(overclockSides[0].payload).toEqual({ surface: 'attack', count: 2 });
  });

  it('overclock side effect fires only when at least one handler fired', () => {
    const handlerNoop: EquipmentDerivedHandler<'attack'> = () => ({ fired: false });
    registerEquipmentDerivedHandler('attack', 'test:noop', handlerNoop);

    const state = makeOverclockState(2);
    const ctx = makeAttackCtxBase(state);
    runEquipmentDerivedHandlers('attack', ctx);

    expect(ctx.sideEffects.filter(s => s.event === 'combat:equipOverclockTriggered'))
      .toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Section 3: Multiple handlers — registration order, isolated firing
// ---------------------------------------------------------------------------

describe('runEquipmentDerivedHandlers — multiple handlers', () => {
  it('iterates handlers in registration order', () => {
    const order: string[] = [];
    const mk = (id: string): EquipmentDerivedHandler<'attack'> => (ctx) => {
      if (ctx.isFirstIteration) order.push(id);
      return { fired: true };
    };
    registerEquipmentDerivedHandler('attack', 'A', mk('A'));
    registerEquipmentDerivedHandler('attack', 'B', mk('B'));
    registerEquipmentDerivedHandler('attack', 'C', mk('C'));

    const state = makeState();
    const ctx = makeAttackCtxBase(state);
    runEquipmentDerivedHandlers('attack', ctx);

    expect(order).toEqual(['A', 'B', 'C']);
  });

  it('one fired + one not-fired → only fired handler is replayed; one overclock side effect', () => {
    const aCalls: boolean[] = []; // captures isFirstIteration values
    const bCalls: boolean[] = [];
    registerEquipmentDerivedHandler('attack', 'A', (ctx) => {
      aCalls.push(ctx.isFirstIteration);
      return { fired: true };
    });
    registerEquipmentDerivedHandler('attack', 'B', (ctx) => {
      bCalls.push(ctx.isFirstIteration);
      return { fired: false };
    });

    const state = makeOverclockState(2);
    const ctx = makeAttackCtxBase(state);
    const result = runEquipmentDerivedHandlers('attack', ctx);

    expect(aCalls).toEqual([true, false, false]); // 1 + 2 replay
    expect(bCalls).toEqual([true]); // first only, no replay
    expect(result.firedHandlerCount).toBe(1);

    const overclockSides = ctx.sideEffects.filter(
      se => se.event === 'combat:equipOverclockTriggered',
    );
    expect(overclockSides).toHaveLength(1);
  });

  it('two fired handlers share one overclock side effect (not two)', () => {
    registerEquipmentDerivedHandler('attack', 'A', () => ({ fired: true }));
    registerEquipmentDerivedHandler('attack', 'B', () => ({ fired: true }));

    const state = makeOverclockState(1);
    const ctx = makeAttackCtxBase(state);
    const result = runEquipmentDerivedHandlers('attack', ctx);

    expect(result.firedHandlerCount).toBe(2);

    const overclockSides = ctx.sideEffects.filter(
      se => se.event === 'combat:equipOverclockTriggered',
    );
    expect(overclockSides).toHaveLength(1);
    expect(overclockSides[0].payload).toEqual({ surface: 'attack', count: 1 });
  });
});

// ---------------------------------------------------------------------------
// Section 4: Side effects, enqueued actions, patch accumulation
// ---------------------------------------------------------------------------

describe('runEquipmentDerivedHandlers — accumulators', () => {
  it('side effects pushed every iteration accumulate (caller controls dedup via isFirstIteration)', () => {
    const handler: EquipmentDerivedHandler<'attack'> = (ctx) => {
      ctx.sideEffects.push({
        event: 'combat:heroHeal',
        payload: { amount: 1, sourceId: 'test' },
      });
      return { fired: true };
    };
    registerEquipmentDerivedHandler('attack', 'test:heal', handler);

    const state = makeOverclockState(2);
    const ctx = makeAttackCtxBase(state);
    runEquipmentDerivedHandlers('attack', ctx);

    const healSides = ctx.sideEffects.filter(s => s.event === 'combat:heroHeal');
    expect(healSides).toHaveLength(3); // 1 + 2 replay (per-trigger semantic)
  });

  it('side effects gated on isFirstIteration fire exactly once', () => {
    const handler: EquipmentDerivedHandler<'attack'> = (ctx) => {
      if (ctx.isFirstIteration) {
        ctx.sideEffects.push({
          event: 'log:entry',
          payload: { message: 'banner once', kind: 'info' },
        });
      }
      ctx.enqueuedActions.push({ type: 'HEAL', amount: 1 } as GameAction);
      return { fired: true };
    };
    registerEquipmentDerivedHandler('attack', 'test:gated-log', handler);

    const state = makeOverclockState(3);
    const ctx = makeAttackCtxBase(state);
    runEquipmentDerivedHandlers('attack', ctx);

    expect(ctx.sideEffects.filter(s => s.event === 'log:entry')).toHaveLength(1);
    // HEAL fires every iteration (per-trigger semantic)
    expect(ctx.enqueuedActions.filter(a => a.type === 'HEAL')).toHaveLength(4);
  });

  it('enqueued actions accumulate every iteration', () => {
    const handler: EquipmentDerivedHandler<'attack'> = (ctx) => {
      ctx.enqueuedActions.push({ type: 'HEAL', amount: 2 } as GameAction);
      return { fired: true };
    };
    registerEquipmentDerivedHandler('attack', 'test:heal-action', handler);

    const state = makeOverclockState(1);
    const ctx = makeAttackCtxBase(state);
    runEquipmentDerivedHandlers('attack', ctx);

    expect(ctx.enqueuedActions).toHaveLength(2); // 1 + 1 replay
  });
});

// ---------------------------------------------------------------------------
// Section 5: RNG threading
// ---------------------------------------------------------------------------

describe('runEquipmentDerivedHandlers — RNG threading', () => {
  it('RNG advances across iterations within one handler', () => {
    const rolls: number[] = [];
    const handler: EquipmentDerivedHandler<'attack'> = (ctx) => {
      const [v, r2] = nextInt(ctx.rng, 1, 100);
      ctx.rng = r2;
      rolls.push(v);
      return { fired: true };
    };
    registerEquipmentDerivedHandler('attack', 'test:roll', handler);

    const state = makeOverclockState(2);
    const ctx = makeAttackCtxBase(state);
    const result = runEquipmentDerivedHandlers('attack', ctx);

    expect(rolls).toHaveLength(3);
    expect(new Set(rolls).size).toBeGreaterThan(1); // values differ → RNG actually advanced
    expect(result.rng).not.toEqual(state.rng);
  });

  it('RNG threads across handlers within an iteration', () => {
    let aRng: GameState['rng'] | null = null;
    let bSawRng: GameState['rng'] | null = null;
    registerEquipmentDerivedHandler('attack', 'A', (ctx) => {
      const [, r2] = nextInt(ctx.rng, 1, 100);
      aRng = r2;
      ctx.rng = r2;
      return { fired: true };
    });
    registerEquipmentDerivedHandler('attack', 'B', (ctx) => {
      bSawRng = ctx.rng;
      return { fired: true };
    });

    const state = makeState(); // overclock off — only first iteration
    const ctx = makeAttackCtxBase(state);
    runEquipmentDerivedHandlers('attack', ctx);

    expect(aRng).not.toBeNull();
    expect(bSawRng).not.toBeNull();
    expect(bSawRng).toEqual(aRng); // B sees A's advanced RNG
  });

  it('same seed produces identical roll sequence across runs', () => {
    const handler: EquipmentDerivedHandler<'attack'> = (ctx) => {
      const [v, r2] = nextInt(ctx.rng, 1, 1_000_000);
      ctx.rng = r2;
      ctx.enqueuedActions.push({ type: 'HEAL', amount: v } as GameAction);
      return { fired: true };
    };

    const collect = (): number[] => {
      __clearEquipmentDerivedHandlers();
      registerEquipmentDerivedHandler('attack', 'test:roll', handler);
      const state = makeOverclockState(2);
      state.rng = { seed: 12345, state: 12345 };
      const ctx = makeAttackCtxBase(state);
      runEquipmentDerivedHandlers('attack', ctx);
      return ctx.enqueuedActions
        .filter((a): a is { type: 'HEAL'; amount: number } => a.type === 'HEAL')
        .map(a => a.amount);
    };

    const run1 = collect();
    const run2 = collect();
    expect(run1).toEqual(run2);
    expect(run1).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Section 6: All 4 surface labels
// ---------------------------------------------------------------------------

describe('runEquipmentDerivedHandlers — surface labels in side effect payload', () => {
  it('attack → "attack"', () => {
    registerEquipmentDerivedHandler('attack', 'h', () => ({ fired: true }));
    const state = makeOverclockState(1);
    const ctx = makeAttackCtxBase(state);
    runEquipmentDerivedHandlers('attack', ctx);
    expect(
      ctx.sideEffects.find(s => s.event === 'combat:equipOverclockTriggered')?.payload,
    ).toEqual({ surface: 'attack', count: 1 });
  });

  it('block → "block"', () => {
    registerEquipmentDerivedHandler('block', 'h', () => ({ fired: true }));
    const state = makeOverclockState(1);
    const ctx = makeBlockCtxBase(state);
    runEquipmentDerivedHandlers('block', ctx);
    expect(
      ctx.sideEffects.find(s => s.event === 'combat:equipOverclockTriggered')?.payload,
    ).toEqual({ surface: 'block', count: 1 });
  });

  it('shield-reflect → "shieldReflect" (camelCased to match existing payload literals)', () => {
    registerEquipmentDerivedHandler('shield-reflect', 'h', () => ({ fired: true }));
    const state = makeOverclockState(1);
    const ctx = makeShieldReflectCtxBase(state);
    runEquipmentDerivedHandlers('shield-reflect', ctx);
    expect(
      ctx.sideEffects.find(s => s.event === 'combat:equipOverclockTriggered')?.payload,
    ).toEqual({ surface: 'shieldReflect', count: 1 });
  });

  it('durability-loss → "durability" (truncated to match existing payload literals)', () => {
    registerEquipmentDerivedHandler('durability-loss', 'h', () => ({ fired: true }));
    const state = makeOverclockState(1);
    const ctx = makeDurabilityLossCtxBase(state);
    runEquipmentDerivedHandlers('durability-loss', ctx);
    expect(
      ctx.sideEffects.find(s => s.event === 'combat:equipOverclockTriggered')?.payload,
    ).toEqual({ surface: 'durability', count: 1 });
  });
});

// ---------------------------------------------------------------------------
// Section 7: Per-surface ctx is type-safe (compile-time + runtime smoke)
// ---------------------------------------------------------------------------

describe('runEquipmentDerivedHandlers — ctx threading per surface', () => {
  it('attack handlers can read and mutate AttackCtx fields', () => {
    let observed: { defeated: boolean; damage: number; equip: boolean } | null = null;
    registerEquipmentDerivedHandler('attack', 'observe', (ctx) => {
      observed = {
        defeated: ctx.surfaceCtx.monsterDefeated,
        damage: ctx.surfaceCtx.finalDamage,
        equip: ctx.surfaceCtx.isMonsterEquip,
      };
      return { fired: true };
    });

    const state = makeState();
    const ctx = makeAttackCtxBase(state);
    runEquipmentDerivedHandlers('attack', ctx);

    expect(observed).toEqual({ defeated: false, damage: 3, equip: false });
  });

  it('durability-loss handlers can mutate updatedItem across iterations', () => {
    const handler: EquipmentDerivedHandler<'durability-loss'> = (ctx) => {
      ctx.surfaceCtx.updatedItem = {
        ...ctx.surfaceCtx.updatedItem,
        attack: ((ctx.surfaceCtx.updatedItem as { attack?: number }).attack ?? 0) + 1,
      } as GameCardData;
      return { fired: true };
    };
    registerEquipmentDerivedHandler('durability-loss', 'bleed', handler);

    const state = makeOverclockState(2);
    const ctx = makeDurabilityLossCtxBase(state);
    runEquipmentDerivedHandlers('durability-loss', ctx);

    expect((ctx.surfaceCtx.updatedItem as { attack?: number }).attack).toBe(3);
  });

  it('block handlers see isPerfectBlock from surfaceCtx', () => {
    let perfect: boolean | null = null;
    registerEquipmentDerivedHandler('block', 'h', (ctx) => {
      perfect = ctx.surfaceCtx.isPerfectBlock;
      return { fired: true };
    });

    const state = makeState();
    const ctx = makeBlockCtxBase(state);
    runEquipmentDerivedHandlers('block', ctx);

    expect(perfect).toBe(true);
  });

  it('shield-reflect handlers see damageBase from surfaceCtx', () => {
    let dmg: number | null = null;
    registerEquipmentDerivedHandler('shield-reflect', 'h', (ctx) => {
      dmg = ctx.surfaceCtx.damageBase;
      return { fired: true };
    });

    const state = makeState();
    const ctx = makeShieldReflectCtxBase(state);
    runEquipmentDerivedHandlers('shield-reflect', ctx);

    expect(dmg).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Section 8: Registration / clear / introspection
// ---------------------------------------------------------------------------

describe('registry introspection', () => {
  it('starts empty in PR-1 (no production handlers registered yet)', () => {
    expect(getEquipmentDerivedRegistrySize('attack')).toBe(0);
    expect(getEquipmentDerivedRegistrySize('block')).toBe(0);
    expect(getEquipmentDerivedRegistrySize('shield-reflect')).toBe(0);
    expect(getEquipmentDerivedRegistrySize('durability-loss')).toBe(0);
  });

  it('register + size + ids work and are isolated per surface', () => {
    registerEquipmentDerivedHandler('attack', 'a1', () => ({ fired: false }));
    registerEquipmentDerivedHandler('attack', 'a2', () => ({ fired: false }));
    registerEquipmentDerivedHandler('block', 'b1', () => ({ fired: false }));

    expect(getEquipmentDerivedRegistrySize('attack')).toBe(2);
    expect(getEquipmentDerivedRegistrySize('block')).toBe(1);
    expect(getEquipmentDerivedRegistrySize('shield-reflect')).toBe(0);
    expect(getRegisteredEquipmentDerivedHandlerIds('attack')).toEqual(['a1', 'a2']);
    expect(getRegisteredEquipmentDerivedHandlerIds('block')).toEqual(['b1']);
  });

  it('bulk register preserves order', () => {
    registerEquipmentDerivedHandlers('attack', [
      { id: 'x', handler: () => ({ fired: false }) },
      { id: 'y', handler: () => ({ fired: false }) },
      { id: 'z', handler: () => ({ fired: false }) },
    ]);
    expect(getRegisteredEquipmentDerivedHandlerIds('attack')).toEqual(['x', 'y', 'z']);
  });

  it('register with same id replaces prior handler (Map semantics)', () => {
    let calls = 0;
    registerEquipmentDerivedHandler('attack', 'dup', () => {
      calls += 100; // first version
      return { fired: false };
    });
    registerEquipmentDerivedHandler('attack', 'dup', () => {
      calls += 1; // second version replaces
      return { fired: false };
    });

    const state = makeState();
    const ctx = makeAttackCtxBase(state);
    runEquipmentDerivedHandlers('attack', ctx);

    expect(calls).toBe(1); // only second version ran
    expect(getEquipmentDerivedRegistrySize('attack')).toBe(1);
  });

  it('__clearEquipmentDerivedHandlers(surface) clears only that surface', () => {
    registerEquipmentDerivedHandler('attack', 'a', () => ({ fired: false }));
    registerEquipmentDerivedHandler('block', 'b', () => ({ fired: false }));
    __clearEquipmentDerivedHandlers('attack');

    expect(getEquipmentDerivedRegistrySize('attack')).toBe(0);
    expect(getEquipmentDerivedRegistrySize('block')).toBe(1);
  });

  it('__clearEquipmentDerivedHandlers() with no args clears all surfaces', () => {
    registerEquipmentDerivedHandler('attack', 'a', () => ({ fired: false }));
    registerEquipmentDerivedHandler('block', 'b', () => ({ fired: false }));
    registerEquipmentDerivedHandler('shield-reflect', 'r', () => ({ fired: false }));
    registerEquipmentDerivedHandler('durability-loss', 'd', () => ({ fired: false }));

    __clearEquipmentDerivedHandlers();

    expect(getEquipmentDerivedRegistrySize('attack')).toBe(0);
    expect(getEquipmentDerivedRegistrySize('block')).toBe(0);
    expect(getEquipmentDerivedRegistrySize('shield-reflect')).toBe(0);
    expect(getEquipmentDerivedRegistrySize('durability-loss')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Section 9: isLastIteration + overclockExtra ctx fields
// ---------------------------------------------------------------------------

describe('runEquipmentDerivedHandlers — isLastIteration + overclockExtra', () => {
  it('overclock=0 → only iteration is both first AND last; overclockExtra=0', () => {
    const observed: Array<{ first: boolean; last: boolean; oc: number }> = [];
    registerEquipmentDerivedHandler('attack', 'h', (ctx) => {
      observed.push({
        first: ctx.isFirstIteration,
        last: ctx.isLastIteration,
        oc: ctx.overclockExtra,
      });
      return { fired: true };
    });

    const state = makeState();
    const ctx = makeAttackCtxBase(state);
    runEquipmentDerivedHandlers('attack', ctx);

    expect(observed).toEqual([{ first: true, last: true, oc: 0 }]);
  });

  it('overclock=2 → iter 0 first/notLast, iter 1 mid, iter 2 notFirst/last; overclockExtra=2', () => {
    const observed: Array<{ first: boolean; last: boolean; oc: number }> = [];
    registerEquipmentDerivedHandler('attack', 'h', (ctx) => {
      observed.push({
        first: ctx.isFirstIteration,
        last: ctx.isLastIteration,
        oc: ctx.overclockExtra,
      });
      return { fired: true };
    });

    const state = makeOverclockState(2);
    const ctx = makeAttackCtxBase(state);
    runEquipmentDerivedHandlers('attack', ctx);

    expect(observed).toEqual([
      { first: true, last: false, oc: 2 },
      { first: false, last: false, oc: 2 },
      { first: false, last: true, oc: 2 },
    ]);
  });

  it('overclock=1 → iter 0 first/notLast, iter 1 notFirst/last (both edges in 2-iter run)', () => {
    const observed: Array<{ first: boolean; last: boolean }> = [];
    registerEquipmentDerivedHandler('attack', 'h', (ctx) => {
      observed.push({ first: ctx.isFirstIteration, last: ctx.isLastIteration });
      return { fired: true };
    });

    const state = makeOverclockState(1);
    const ctx = makeAttackCtxBase(state);
    runEquipmentDerivedHandlers('attack', ctx);

    expect(observed).toEqual([
      { first: true, last: false },
      { first: false, last: true },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Section 10: contributedToOverclock — opt-out semantics
// ---------------------------------------------------------------------------

describe('runEquipmentDerivedHandlers — contributedToOverclock opt-out', () => {
  it('handler returning contributedToOverclock:false on every iter suppresses surface side effect', () => {
    registerEquipmentDerivedHandler('attack', 'opted-out', () => ({
      fired: true,
      contributedToOverclock: false,
    }));

    const state = makeOverclockState(2);
    const ctx = makeAttackCtxBase(state);
    runEquipmentDerivedHandlers('attack', ctx);

    expect(ctx.sideEffects.filter(s => s.event === 'combat:equipOverclockTriggered'))
      .toHaveLength(0);
  });

  it('handler that opts in on a later iter (rescue scenario) → side effect emitted', () => {
    let callIdx = 0;
    registerEquipmentDerivedHandler('attack', 'rescue', () => {
      const i = callIdx++;
      // First two iterations: did not contribute. Third iteration: contributed (rescue).
      return { fired: true, contributedToOverclock: i === 2 };
    });

    const state = makeOverclockState(2); // 1 + 2 = 3 iterations
    const ctx = makeAttackCtxBase(state);
    runEquipmentDerivedHandlers('attack', ctx);

    const overclockSides = ctx.sideEffects.filter(
      s => s.event === 'combat:equipOverclockTriggered',
    );
    expect(overclockSides).toHaveLength(1);
    expect(overclockSides[0].payload).toEqual({ surface: 'attack', count: 2 });
  });

  it('default (no contributedToOverclock field) behaves as `fired` — emits side effect', () => {
    registerEquipmentDerivedHandler('attack', 'h', () => ({ fired: true }));

    const state = makeOverclockState(1);
    const ctx = makeAttackCtxBase(state);
    runEquipmentDerivedHandlers('attack', ctx);

    expect(ctx.sideEffects.filter(s => s.event === 'combat:equipOverclockTriggered'))
      .toHaveLength(1);
  });

  it('mixed: handler A contributes, handler B does not → still emits (any-handler semantics)', () => {
    registerEquipmentDerivedHandler('attack', 'A', () => ({
      fired: true,
      contributedToOverclock: true,
    }));
    registerEquipmentDerivedHandler('attack', 'B', () => ({
      fired: true,
      contributedToOverclock: false,
    }));

    const state = makeOverclockState(1);
    const ctx = makeAttackCtxBase(state);
    runEquipmentDerivedHandlers('attack', ctx);

    expect(ctx.sideEffects.filter(s => s.event === 'combat:equipOverclockTriggered'))
      .toHaveLength(1);
  });

  it('contributedToOverclock=true with overclock=0 → no side effect (overclock not active)', () => {
    registerEquipmentDerivedHandler('attack', 'h', () => ({
      fired: true,
      contributedToOverclock: true,
    }));

    const state = makeState(); // no overclock
    const ctx = makeAttackCtxBase(state);
    runEquipmentDerivedHandlers('attack', ctx);

    expect(ctx.sideEffects.filter(s => s.event === 'combat:equipOverclockTriggered'))
      .toHaveLength(0);
  });
});
