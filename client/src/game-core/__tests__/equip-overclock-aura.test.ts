/**
 * 永恒护符·装备超频 (`equip-overclock`) — stackable aura effect.
 *
 * Granted by the unique class potion 「装备超频药」
 * (`potionEffect: 'grant-eternal-relic-equip-overclock'`).
 *
 * Aura active iff:
 *   - hero holds at least one `equip-overclock` relic, AND
 *   - `state.permanentMagicRecycleBag.length > 10` (i.e. 11+ cards).
 *
 * When active, equipment-slot derived effects fire **(1 + N) times** where
 *   `N = countEternalRelics(state.eternalRelics, 'equip-overclock')`.
 *
 * Covered surfaces:
 *   - onEquipEffect handler runs (1 + N) times
 *   - lastWords totalTriggers = 1 + lastWordsExtraTriggerCount + N
 *     (additive with `墓园守卫` `lastWordsExtraTriggerCount`)
 *   - hero-attack derived effects (heal-on-attack, overkill bonuses, kill
 *     rewards, post-attack spell damage, post-attack hand recycle, dragon
 *     retaliation) fire (1 + N) times
 *   - block-derived effects (reflect, dragon retaliation from shield,
 *     perfect-block rewards, shield-reflect dmg) fire (1 + N) times
 *   - durability-loss derived effects (mine boost, bleed, golem reflect)
 *     fire (1 + N) times; durability tick itself does NOT repeat.
 *
 * Explicitly NOT repeated:
 *   - the weapon swing damage itself
 *   - the block judgement itself
 *   - hand-card effects, amulet effects, monster `enterEffect`,
 *     building/row-level effects.
 *
 * Per `pipeline-input-continuation.mdc`: all dispatch chains run with
 * `phase: 'playerInput'` so safety net + drain semantics match real combat.
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import {
  isEquipOverclockActive,
  equipOverclockExtraTriggers,
} from '../rules/equipment-overclock';
import {
  computeEquipmentBreakEffects,
} from '../rules/equipment-effects';
import {
  hasEternalRelic,
  getEternalRelic,
  countEternalRelics,
  STACKABLE_RELIC_IDS,
} from '@/lib/eternalRelics';
import { createEmptyAmuletEffects } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots } from '@/components/game-board/types';
import '../card-schema';

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

function makeOverclockPotion(id = 'pot-overclock'): GameCardData {
  return {
    id,
    type: 'potion' as const,
    name: '装备超频药',
    value: 1,
    image: '',
    classCard: true,
    unique: true,
    potionEffect: 'grant-eternal-relic-equip-overclock',
  } as GameCardData;
}

function makeOverclockRelic() {
  return getEternalRelic('equip-overclock');
}

function makeOverclockRelics(count: number) {
  return Array.from({ length: count }, () => makeOverclockRelic());
}

// ---------------------------------------------------------------------------
// Section 1: helper (live aura check, stackable)
// ---------------------------------------------------------------------------

describe('isEquipOverclockActive + equipOverclockExtraTriggers — stackable matrix', () => {
  it('×0 relics → not active, extra triggers = 0', () => {
    const s = makeState({ permanentMagicRecycleBag: makeRecycleBag(20) });
    expect(isEquipOverclockActive(s)).toBe(false);
    expect(equipOverclockExtraTriggers(s)).toBe(0);
  });

  it('×1 relic + bag=10 → not active, extra = 0 (strict > 10)', () => {
    const s = makeState({
      eternalRelics: makeOverclockRelics(1),
      permanentMagicRecycleBag: makeRecycleBag(10),
    });
    expect(isEquipOverclockActive(s)).toBe(false);
    expect(equipOverclockExtraTriggers(s)).toBe(0);
  });

  it('×1 relic + bag=11 → active, extra = 1', () => {
    const s = makeState({
      eternalRelics: makeOverclockRelics(1),
      permanentMagicRecycleBag: makeRecycleBag(11),
    });
    expect(isEquipOverclockActive(s)).toBe(true);
    expect(equipOverclockExtraTriggers(s)).toBe(1);
  });

  it('×2 relics + bag=11 → active, extra = 2', () => {
    const s = makeState({
      eternalRelics: makeOverclockRelics(2),
      permanentMagicRecycleBag: makeRecycleBag(11),
    });
    expect(isEquipOverclockActive(s)).toBe(true);
    expect(equipOverclockExtraTriggers(s)).toBe(2);
  });

  it('×3 relics + bag=11 → active, extra = 3', () => {
    const s = makeState({
      eternalRelics: makeOverclockRelics(3),
      permanentMagicRecycleBag: makeRecycleBag(11),
    });
    expect(isEquipOverclockActive(s)).toBe(true);
    expect(equipOverclockExtraTriggers(s)).toBe(3);
  });

  it('×3 relics + bag=10 → aura off → extra = 0 (stack count irrelevant)', () => {
    const s = makeState({
      eternalRelics: makeOverclockRelics(3),
      permanentMagicRecycleBag: makeRecycleBag(10),
    });
    expect(isEquipOverclockActive(s)).toBe(false);
    expect(equipOverclockExtraTriggers(s)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Section 2: potion → relic grant is stackable (end-to-end PLAY_CARD path)
// ---------------------------------------------------------------------------

describe('装备超频药 — potion stacks the relic on each drink', () => {
  it('drinking N times stacks N copies in eternalRelics', () => {
    let state = makeState({
      eternalRelics: [],
      handCards: [],
      permanentMagicRecycleBag: [],
    });

    for (let i = 1; i <= 3; i++) {
      const c = makeOverclockPotion(`p${i}`);
      state = { ...state, handCards: [c] };
      const r = reduce(state, { type: 'RESOLVE_POTION', cardId: c.id, card: c });
      state = r.state;

      expect(hasEternalRelic(state.eternalRelics ?? [], 'equip-overclock')).toBe(true);
      expect(countEternalRelics(state.eternalRelics ?? [], 'equip-overclock')).toBe(i);
    }
  });

  it("'equip-overclock' is registered in STACKABLE_RELIC_IDS", () => {
    expect(STACKABLE_RELIC_IDS.has('equip-overclock')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Section 3: lastWords additive stacking with 墓园守卫 + relic stack count
// ---------------------------------------------------------------------------

describe('lastWords — additive stacking: relic count + 墓园守卫', () => {
  function makeGoldWeapon(): GameCardData {
    return {
      id: 'w1',
      type: 'weapon',
      name: 'GoldBlade',
      value: 2,
      durability: 0,
      maxDurability: 1,
      onDestroyGold: 5,
    } as GameCardData;
  }

  function runBreak(state: GameState, lastWordsExtraTriggerCount = 0) {
    const weapon = makeGoldWeapon();
    const ae = { ...createEmptyAmuletEffects(), lastWordsExtraTriggerCount };
    return computeEquipmentBreakEffects(
      { ...state, equipmentSlot1: weapon as any, gold: 100 },
      'equipmentSlot1',
      weapon,
      ae,
    );
  }

  it('no relic, no 墓园守卫 → gold +5 (1 trigger)', () => {
    const state = makeState({});
    const r = runBreak(state, 0);
    expect(r.patch.gold).toBe(105);
  });

  it('relic ×1 (active), no 墓园守卫 → gold +10 (2 triggers)', () => {
    const state = makeState({
      eternalRelics: makeOverclockRelics(1),
      permanentMagicRecycleBag: makeRecycleBag(11),
    });
    const r = runBreak(state, 0);
    expect(r.patch.gold).toBe(110);
    const triggered = r.sideEffects.find(e => e.event === 'combat:equipOverclockTriggered');
    expect(triggered).toBeDefined();
    expect((triggered as any).payload).toMatchObject({ surface: 'lastWords', count: 1 });
  });

  it('relic ×1 + 墓园守卫 ×1 → gold +15 (3 triggers, additive)', () => {
    const state = makeState({
      eternalRelics: makeOverclockRelics(1),
      permanentMagicRecycleBag: makeRecycleBag(11),
    });
    const r = runBreak(state, 1);
    expect(r.patch.gold).toBe(115);
  });

  it('relic ×2 + 墓园守卫 ×1 → gold +20 (4 triggers, 1 + 1 + 2)', () => {
    const state = makeState({
      eternalRelics: makeOverclockRelics(2),
      permanentMagicRecycleBag: makeRecycleBag(11),
    });
    const r = runBreak(state, 1);
    expect(r.patch.gold).toBe(120);
    const triggered = r.sideEffects.find(e => e.event === 'combat:equipOverclockTriggered');
    expect(triggered).toBeDefined();
    expect((triggered as any).payload).toMatchObject({ surface: 'lastWords', count: 2 });
  });

  it('relic ×3 (active), no 墓园守卫 → gold +20 (4 triggers)', () => {
    const state = makeState({
      eternalRelics: makeOverclockRelics(3),
      permanentMagicRecycleBag: makeRecycleBag(11),
    });
    const r = runBreak(state, 0);
    expect(r.patch.gold).toBe(120);
    const triggered = r.sideEffects.find(e => e.event === 'combat:equipOverclockTriggered');
    expect((triggered as any).payload).toMatchObject({ surface: 'lastWords', count: 3 });
  });

  it('relic ×3 + bag=10 (aura off) → gold +5 (relic stack irrelevant)', () => {
    const state = makeState({
      eternalRelics: makeOverclockRelics(3),
      permanentMagicRecycleBag: makeRecycleBag(10),
    });
    const r = runBreak(state, 0);
    expect(r.patch.gold).toBe(105);
  });
});

// ---------------------------------------------------------------------------
// Section 4: hero attack — healOnAttack vampiric heal stacks (1 + N)
// ---------------------------------------------------------------------------

describe('hero attack — vampiric heal scales with relic stacks', () => {
  function makeHealWeapon(): GameCardData {
    return {
      id: 'w-heal',
      type: 'weapon',
      name: 'VampireBlade',
      value: 3,
      durability: 4,
      maxDurability: 4,
      healOnAttack: 2,
    } as GameCardData;
  }

  function makeMonster(): GameCardData {
    return {
      id: 'm1',
      type: 'monster',
      name: 'Skel',
      value: 1,
      attack: 1,
      hp: 100,
      maxHp: 100,
      fury: 1,
      currentLayer: 1,
    } as GameCardData;
  }

  function runAttack(opts: { relics: number; bag: number; startingHp: number }) {
    const weapon = makeHealWeapon();
    const monster = makeMonster();
    const state = makeState({
      equipmentSlot1: weapon as any,
      activeCards: [monster, null, null, null, null] as unknown as ActiveRowSlots,
      hp: opts.startingHp,
      maxHp: 50,
      eternalRelics: makeOverclockRelics(opts.relics),
      permanentMagicRecycleBag: makeRecycleBag(opts.bag),
      combatState: {
        ...createInitialGameState().combatState,
        currentTurn: 'hero',
        heroAttacksRemaining: 1,
        engagedMonsterIds: [monster.id],
      },
    });
    return drain(state, [
      { type: 'PERFORM_HERO_ATTACK', slotId: 'equipmentSlot1', targetMonsterId: monster.id } as GameAction,
    ]);
  }

  it('×0 relics: heal +2 (1 trigger)', () => {
    const r = runAttack({ relics: 0, bag: 11, startingHp: 10 });
    expect(r.state.hp).toBe(12);
  });

  it('×1 relic + bag=11: heal +4 (2 triggers)', () => {
    const r = runAttack({ relics: 1, bag: 11, startingHp: 10 });
    expect(r.state.hp).toBe(14);
    expect(r.sideEffects.some(e =>
      e.event === 'combat:equipOverclockTriggered'
      && (e as any).payload.surface === 'attack'
      && (e as any).payload.count === 1,
    )).toBe(true);
  });

  it('×2 relics + bag=11: heal +6 (3 triggers)', () => {
    const r = runAttack({ relics: 2, bag: 11, startingHp: 10 });
    expect(r.state.hp).toBe(16);
    expect(r.sideEffects.some(e =>
      e.event === 'combat:equipOverclockTriggered'
      && (e as any).payload.surface === 'attack'
      && (e as any).payload.count === 2,
    )).toBe(true);
  });

  it('×1 relic + bag=10 (aura off): heal +2 (1 trigger)', () => {
    const r = runAttack({ relics: 1, bag: 10, startingHp: 10 });
    expect(r.state.hp).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Section 5: killGoldScaling fires (1 + N) times on overclocked kill
// ---------------------------------------------------------------------------

describe('killGoldScaling scales with relic stacks', () => {
  function makeGoldWeapon(): GameCardData {
    return {
      id: 'w-gold',
      type: 'weapon',
      name: 'GoldHunter',
      value: 50,
      durability: 4,
      maxDurability: 4,
      killGoldScaling: true,
      killGoldCounter: 3,
    } as GameCardData;
  }

  function makeWeakMonster(): GameCardData {
    return {
      id: 'm-weak',
      type: 'monster',
      name: 'Buglet',
      value: 1,
      attack: 1,
      hp: 1,
      maxHp: 1,
      fury: 1,
      currentLayer: 1,
    } as GameCardData;
  }

  function runKill(opts: { relics: number; bag: number }) {
    const weapon = makeGoldWeapon();
    const monster = makeWeakMonster();
    const state = makeState({
      equipmentSlot1: weapon as any,
      activeCards: [monster, null, null, null, null] as unknown as ActiveRowSlots,
      hp: 20,
      maxHp: 20,
      gold: 100,
      eternalRelics: makeOverclockRelics(opts.relics),
      permanentMagicRecycleBag: makeRecycleBag(opts.bag),
      combatState: {
        ...createInitialGameState().combatState,
        currentTurn: 'hero',
        heroAttacksRemaining: 1,
        engagedMonsterIds: [monster.id],
      },
    });
    return drain(state, [
      { type: 'PERFORM_HERO_ATTACK', slotId: 'equipmentSlot1', targetMonsterId: monster.id } as GameAction,
    ]);
  }

  it('×0 relics: +3 gold', () => {
    const r = runKill({ relics: 0, bag: 11 });
    expect(r.state.gold).toBe(103);
  });

  it('×1 relic + bag=11: +6 gold (2 triggers)', () => {
    const r = runKill({ relics: 1, bag: 11 });
    expect(r.state.gold).toBe(106);
  });

  it('×3 relics + bag=11: +12 gold (4 triggers)', () => {
    const r = runKill({ relics: 3, bag: 11 });
    expect(r.state.gold).toBe(112);
  });

  it('×3 relics + bag=10 (aura off): +3 gold', () => {
    const r = runKill({ relics: 3, bag: 10 });
    expect(r.state.gold).toBe(103);
  });
});

// ---------------------------------------------------------------------------
// Section 6: aura deactivates immediately when bag drops to ≤10
// ---------------------------------------------------------------------------

describe('aura deactivates immediately when bag drops to ≤10', () => {
  it('toggling bag size flips active-state synchronously (live aura check)', () => {
    const baseState = makeState({
      eternalRelics: makeOverclockRelics(2),
      permanentMagicRecycleBag: makeRecycleBag(11),
    });
    expect(isEquipOverclockActive(baseState)).toBe(true);
    expect(equipOverclockExtraTriggers(baseState)).toBe(2);

    const dropped = { ...baseState, permanentMagicRecycleBag: makeRecycleBag(10) };
    expect(isEquipOverclockActive(dropped)).toBe(false);
    expect(equipOverclockExtraTriggers(dropped)).toBe(0);

    const refilled = { ...dropped, permanentMagicRecycleBag: makeRecycleBag(12) };
    expect(isEquipOverclockActive(refilled)).toBe(true);
    expect(equipOverclockExtraTriggers(refilled)).toBe(2);

    // Re-running same computation across the toggled states uses live state.
    const weapon: GameCardData = {
      id: 'w-gold',
      type: 'weapon',
      name: 'GoldBlade',
      value: 2,
      durability: 0,
      maxDurability: 1,
      onDestroyGold: 5,
    } as GameCardData;
    const ae = createEmptyAmuletEffects();

    // bag=11, relic ×2: 3 triggers → 15 gold
    const onState = { ...baseState, equipmentSlot1: weapon as any, gold: 0 };
    const onResult = computeEquipmentBreakEffects(onState, 'equipmentSlot1', weapon, ae);
    expect(onResult.patch.gold).toBe(15);

    // bag=10, relic ×2: aura off, 1 trigger → 5 gold
    const offState = { ...dropped, equipmentSlot1: weapon as any, gold: 0 };
    const offResult = computeEquipmentBreakEffects(offState, 'equipmentSlot1', weapon, ae);
    expect(offResult.patch.gold).toBe(5);
  });
});
