/**
 * Equipment-derived durability-loss surface — per-handler unit tests (PR-2).
 *
 * These tests target `computeDurabilityLossEffects` (the consumer) AFTER the
 * 4 inline overclock loops were migrated to the registry. Coverage:
 *
 *   1. mineDamageBoost — replay semantic, log/banner per iteration
 *   2. bleedAttackBonus — cumulative attack across iterations, single log
 *      with anticipated final value
 *   3. wraithRebirth — rolls per iteration, probabilities match original,
 *      `contributedToOverclock` opt-out for first-roll success
 *   4. golemLayerLossReflect — pre-multiply on iter 1, target picked once
 *
 * Plus end-to-end checks that:
 *   - Existing inline non-overclocked branches (dragon-bleed-destroy, swarm-
 *     elite, armor strip) still work after the refactor
 *   - `combat:equipOverclockTriggered` emission matches original semantics
 *   - RNG threading is deterministic
 */
import { describe, expect, it } from 'vitest';
import '../card-schema'; // triggers handler registration
import { computeDurabilityLossEffects } from '../rules/equipment-effects';
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
    permanentMagicRecycleBag: makeRecycleBag(11), // > 10 to activate aura
    ...overrides,
  });
}

function makeMineWeapon(overrides?: Partial<GameCardData>): GameCardData {
  return {
    id: 'w-mine',
    type: 'weapon',
    name: '引雷阵锋',
    value: 2,
    image: '',
    durability: 3,
    maxDurability: 3,
    mineDamageBoostPerDur: 2,
    ...overrides,
  } as GameCardData;
}

function makeBleedMonsterEquip(overrides?: Partial<GameCardData>): GameCardData {
  return {
    id: 'm-bleed',
    type: 'monster',
    name: 'Test Dragon',
    value: 4,
    attack: 4,
    image: '',
    durability: 3,
    maxDurability: 3,
    monsterType: 'Dragon',
    bleedEffect: true,
    ...overrides,
  } as GameCardData;
}

function makeWraithMonsterEquip(overrides?: Partial<GameCardData>): GameCardData {
  return {
    id: 'm-wraith',
    type: 'monster',
    name: 'Test Wraith',
    value: 3,
    attack: 3,
    image: '',
    durability: 2,
    maxDurability: 4,
    monsterType: 'Wraith',
    monsterSpecial: 'wraith-rebirth',
    ...overrides,
  } as GameCardData;
}

function makeGolemMonsterEquip(overrides?: Partial<GameCardData>): GameCardData {
  return {
    id: 'm-golem',
    type: 'monster',
    name: 'Test Golem',
    value: 3,
    attack: 3,
    image: '',
    durability: 4,
    maxDurability: 4,
    monsterType: 'Golem',
    golemLayerLossReflect: 2,
    ...overrides,
  } as GameCardData;
}

function makeMonsterInActiveRow(id: string, name: string): GameCardData {
  return {
    id,
    type: 'monster',
    name,
    value: 0,
    image: '',
    attack: 1,
    hp: 5,
    maxHp: 5,
  } as GameCardData;
}

function withMonstersInActiveRow(state: GameState, monsters: GameCardData[]): GameState {
  // ActiveRowSlots is a flat 4-slot array (DUNGEON_COLUMN_COUNT). Fill from
  // the left, pad with null.
  const length = state.activeCards.length;
  const slots: Array<GameCardData | null> = Array.from({ length }, (_, i) => monsters[i] ?? null);
  return { ...state, activeCards: slots as GameState['activeCards'] };
}

function findOverclockSideEffect(sideEffects: ReadonlyArray<unknown>): { count?: number; surface?: string } | null {
  const found = (sideEffects as Array<{ event?: string; payload?: unknown }>).find(
    s => s.event === 'combat:equipOverclockTriggered',
  );
  return found ? (found.payload as { count?: number; surface?: string }) : null;
}

function logMessages(sideEffects: ReadonlyArray<unknown>): string[] {
  return (sideEffects as Array<{ event?: string; payload?: { message?: string } }>)
    .filter(s => s.event === 'log:entry')
    .map(s => s.payload?.message ?? '');
}

function bannerTexts(sideEffects: ReadonlyArray<unknown>): string[] {
  return (sideEffects as Array<{ event?: string; payload?: { text?: string } }>)
    .filter(s => s.event === 'ui:banner')
    .map(s => s.payload?.text ?? '');
}

// ---------------------------------------------------------------------------
// Handler 1: mineDamageBoost
// ---------------------------------------------------------------------------

describe('mineDamageBoost handler — replay semantic', () => {
  it('overclock=0 → 1 call: globalMineDamageBonus += perDur×durLost, 1 log + 1 banner', () => {
    const state = makeState({ globalMineDamageBonus: 0 });
    const weapon = makeMineWeapon({ durability: 3 });
    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', weapon, 2);

    // perDur=2, durLost = 3-2 = 1 → +2 boost
    expect(result.patch.globalMineDamageBonus).toBe(2);
    expect(logMessages(result.sideEffects).filter(m => m.includes('雷震共鸣'))).toHaveLength(1);
    expect(bannerTexts(result.sideEffects).filter(t => t.includes('地雷伤害'))).toHaveLength(1);
    expect(findOverclockSideEffect(result.sideEffects)).toBeNull();
  });

  it('overclock=2 → 1+2=3 calls: boost = 2 * 3 = 6, 3 logs + 3 banners + overclock side effect', () => {
    const state = makeOverclockState(2, { globalMineDamageBonus: 0 });
    const weapon = makeMineWeapon({ durability: 3 });
    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', weapon, 2);

    expect(result.patch.globalMineDamageBonus).toBe(6); // 2 * (1+2)
    expect(logMessages(result.sideEffects).filter(m => m.includes('雷震共鸣'))).toHaveLength(3);
    expect(bannerTexts(result.sideEffects).filter(t => t.includes('地雷伤害'))).toHaveLength(3);

    const overclock = findOverclockSideEffect(result.sideEffects);
    expect(overclock).toEqual({ surface: 'durability', count: 2 });
  });

  it('does not fire when mineDamageBoostPerDur is missing', () => {
    const state = makeOverclockState(2);
    const weapon = makeMineWeapon({ mineDamageBoostPerDur: undefined });
    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', weapon, 2);

    expect(result.patch.globalMineDamageBonus).toBeUndefined();
    expect(logMessages(result.sideEffects)).toHaveLength(0);
  });

  it('does not fire when durLost <= 0 (newDur >= prevDur)', () => {
    const state = makeOverclockState(2);
    const weapon = makeMineWeapon({ durability: 2 });
    // newDur=2 == prevDur=2 → durLost = 0
    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', weapon, 2);

    expect(result.patch.globalMineDamageBonus).toBeUndefined();
    expect(findOverclockSideEffect(result.sideEffects)).toBeNull();
  });

  it('chains across reads — iter 2 sees iter 1 patch value', () => {
    const state = makeOverclockState(1, { globalMineDamageBonus: 5 });
    const weapon = makeMineWeapon({ durability: 3 }); // perDur=2, durLost=1
    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', weapon, 2);

    // 5 + 2 + 2 = 9
    expect(result.patch.globalMineDamageBonus).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// Handler 2: bleedAttackBonus
// ---------------------------------------------------------------------------

describe('bleedAttackBonus handler — multiply via replay', () => {
  it('overclock=0 → +3 attack, single log with anticipated total', () => {
    const state = makeState();
    const monster = makeBleedMonsterEquip({ durability: 3 });
    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', monster, 2);

    expect(result.updatedItem.attack).toBe(7); // 4 + 3
    expect(result.updatedItem.value).toBe(7);
    expect(result.updatedItem.specialAttackBoost).toBe(3);

    const bleedLogs = logMessages(result.sideEffects).filter(m => m.includes('流血'));
    expect(bleedLogs).toHaveLength(1);
    expect(bleedLogs[0]).toContain('+3');
    expect(bleedLogs[0]).toContain('当前 7');
  });

  it('overclock=2 → cumulative +9 attack, single log saying "+9 (当前 13)"', () => {
    const state = makeOverclockState(2);
    const monster = makeBleedMonsterEquip({ durability: 3 });
    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', monster, 2);

    // 4 base + 3 * (1+2) = 4 + 9 = 13
    expect(result.updatedItem.attack).toBe(13);
    expect(result.updatedItem.value).toBe(13);
    expect(result.updatedItem.specialAttackBoost).toBe(9);

    const bleedLogs = logMessages(result.sideEffects).filter(m => m.includes('流血'));
    expect(bleedLogs).toHaveLength(1); // single log on first iteration
    expect(bleedLogs[0]).toContain('+9');
    expect(bleedLogs[0]).toContain('当前 13');

    expect(findOverclockSideEffect(result.sideEffects)).toEqual({
      surface: 'durability',
      count: 2,
    });
  });

  it('does not fire on non-monster equipment', () => {
    const state = makeOverclockState(2);
    // Weapon with bleedEffect (shouldn't be a real card but tests the gate)
    const weapon = {
      ...makeMineWeapon({ mineDamageBoostPerDur: undefined }),
      bleedEffect: true,
    } as GameCardData;
    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', weapon, 2);

    expect(result.updatedItem.attack ?? 0).toBe(0); // no bleed bonus on non-monster
    expect(logMessages(result.sideEffects).filter(m => m.includes('流血'))).toHaveLength(0);
  });

  it('does not fire when bleedEffect is not set', () => {
    const state = makeOverclockState(2);
    const monster = makeBleedMonsterEquip({ bleedEffect: undefined });
    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', monster, 2);

    expect(result.updatedItem.attack).toBe(4); // unchanged
    expect(logMessages(result.sideEffects).filter(m => m.includes('流血'))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Handler 3: wraithRebirth
// ---------------------------------------------------------------------------

describe('wraithRebirth handler — extra-rolls via replay', () => {
  it('does not fire when newDur > 1', () => {
    const state = makeOverclockState(2);
    const monster = makeWraithMonsterEquip({ durability: 3 });
    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', monster, 2);

    expect(result.updatedItem.durability).toBe(2); // not refilled
    expect(result.updatedItem.wraithRebirthUsed).toBeUndefined();
    expect(logMessages(result.sideEffects).filter(m => m.includes('重生'))).toHaveLength(0);
  });

  it('does not fire when wraithRebirthUsed is already set', () => {
    const state = makeOverclockState(2);
    const monster = makeWraithMonsterEquip({
      durability: 2,
      wraithRebirthUsed: true,
    });
    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', monster, 1);

    expect(result.updatedItem.durability).toBe(1); // not refilled
    expect(logMessages(result.sideEffects).filter(m => m.includes('重生'))).toHaveLength(0);
  });

  it('always sets wraithRebirthUsed=true after sequence (success or failure)', () => {
    // Try 16 different RNG seeds — some will succeed, some will fail on overclock=0.
    // All must end with wraithRebirthUsed=true.
    for (let seed = 1; seed <= 16; seed++) {
      const state = makeState({ rng: { seed, state: seed } });
      const monster = makeWraithMonsterEquip({ durability: 2 });
      const result = computeDurabilityLossEffects(state, 'equipmentSlot1', monster, 1);
      expect(result.updatedItem.wraithRebirthUsed).toBe(true);
    }
  });

  it('overclock=2 → up to 3 rolls; refills durability to maxDur on any success', () => {
    // Use a seed where the first roll fails to verify rescue path.
    // We'll search for a seed where iter 1 fails AND a later iter succeeds.
    let foundRescueCase = false;
    for (let seed = 1; seed <= 50; seed++) {
      const state = makeOverclockState(2, { rng: { seed, state: seed } });
      const monster = makeWraithMonsterEquip({ durability: 2 });
      const result = computeDurabilityLossEffects(state, 'equipmentSlot1', monster, 1);

      const succeeded = result.updatedItem.durability === 4; // maxDur = 4
      if (!succeeded) continue;

      // Check whether rescue happened: a rescue log mentions "装备超频补救".
      const successLog = logMessages(result.sideEffects).find(m => m.includes('耐久回满'));
      const wasRescue = successLog?.includes('装备超频补救') ?? false;
      if (wasRescue) {
        foundRescueCase = true;
        // Rescue case → overclock side effect must be emitted (handler returns
        // `contributedToOverclock: true` for rescues).
        expect(findOverclockSideEffect(result.sideEffects)).not.toBeNull();
        break;
      }
    }
    expect(foundRescueCase, 'expected to find a rescue case in 50 seeds').toBe(true);
  });

  it('overclock=2 + first-roll success → no overclock side effect (UX matches original)', () => {
    // Find a seed where iter 1 succeeds — overclock should NOT emit.
    let foundFirstSuccess = false;
    for (let seed = 1; seed <= 50; seed++) {
      const state = makeOverclockState(2, { rng: { seed, state: seed } });
      const monster = makeWraithMonsterEquip({ durability: 2 });
      const result = computeDurabilityLossEffects(state, 'equipmentSlot1', monster, 1);

      const succeeded = result.updatedItem.durability === 4;
      if (!succeeded) continue;

      const successLog = logMessages(result.sideEffects).find(m => m.includes('耐久回满'));
      const wasFirstSuccess = !(successLog?.includes('装备超频补救') ?? false);
      if (wasFirstSuccess) {
        foundFirstSuccess = true;
        // First-roll success → overclock contribution is `false` per handler.
        // No mineboost / bleed / golem fired so no other contribution either.
        expect(findOverclockSideEffect(result.sideEffects)).toBeNull();
        break;
      }
    }
    expect(foundFirstSuccess, 'expected to find a first-success case in 50 seeds').toBe(true);
  });

  it('overclock=2 + all rolls fail → log "重生失败！（装备超频×2 补救也未触发）", no overclock side effect', () => {
    // Find a seed where all 3 rolls fail.
    let foundAllFail = false;
    for (let seed = 1; seed <= 200; seed++) {
      const state = makeOverclockState(2, { rng: { seed, state: seed } });
      const monster = makeWraithMonsterEquip({ durability: 2 });
      const result = computeDurabilityLossEffects(state, 'equipmentSlot1', monster, 1);

      const allFailed = result.updatedItem.durability === 1;
      if (!allFailed) continue;

      foundAllFail = true;
      const failLog = logMessages(result.sideEffects).find(m => m.includes('重生失败'));
      expect(failLog).toBeDefined();
      expect(failLog).toContain('装备超频×2');
      // No rescue happened → no overclock side effect (matches original UX).
      expect(findOverclockSideEffect(result.sideEffects)).toBeNull();
      // Still set used flag.
      expect(result.updatedItem.wraithRebirthUsed).toBe(true);
      break;
    }
    expect(foundAllFail, 'expected to find an all-fail case in 200 seeds').toBe(true);
  });

  it('overclock=0 + failure → log "重生失败！（50%）"', () => {
    // Find a seed where the single roll fails.
    for (let seed = 1; seed <= 50; seed++) {
      const state = makeState({ rng: { seed, state: seed } });
      const monster = makeWraithMonsterEquip({ durability: 2 });
      const result = computeDurabilityLossEffects(state, 'equipmentSlot1', monster, 1);

      if (result.updatedItem.durability === 4) continue; // succeeded, skip

      const failLog = logMessages(result.sideEffects).find(m => m.includes('重生失败'));
      expect(failLog).toContain('50%');
      expect(failLog).not.toContain('装备超频');
      return;
    }
    throw new Error('Could not find a failure case in 50 seeds');
  });

  it('rng state advances deterministically for same seed', () => {
    const stateA = makeOverclockState(2, { rng: { seed: 12345, state: 12345 } });
    const stateB = makeOverclockState(2, { rng: { seed: 12345, state: 12345 } });
    const monsterA = makeWraithMonsterEquip({ durability: 2 });
    const monsterB = makeWraithMonsterEquip({ durability: 2 });

    const resultA = computeDurabilityLossEffects(stateA, 'equipmentSlot1', monsterA, 1);
    const resultB = computeDurabilityLossEffects(stateB, 'equipmentSlot1', monsterB, 1);

    expect(resultA.rng).toEqual(resultB.rng);
    expect(resultA.updatedItem.durability).toBe(resultB.updatedItem.durability);
  });
});

// ---------------------------------------------------------------------------
// Handler 4: golemLayerLossReflect
// ---------------------------------------------------------------------------

describe('golemLayerLossReflect handler — pre-multiply on iter 1', () => {
  it('overclock=0 → reflect = perLayer × lostDur, target picked from active row', () => {
    const baseState = makeState();
    const target = makeMonsterInActiveRow('m-target-1', 'Active Monster');
    const state = withMonstersInActiveRow(baseState, [target]);
    const golem = makeGolemMonsterEquip({ durability: 4 }); // maxDur=4, newDur=2 → lostDur=2

    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', golem, 2);

    expect(result.golemReflectDamage).toBeDefined();
    expect(result.golemReflectDamage?.targetId).toBe('m-target-1');
    expect(result.golemReflectDamage?.damage).toBe(4); // 2 (perLayer) * 2 (lostDur) = 4
    expect(result.golemReflectDamage?.slotId).toBe('equipmentSlot1');

    const golemLogs = logMessages(result.sideEffects).filter(m => m.includes('反震'));
    expect(golemLogs).toHaveLength(1);
    expect(golemLogs[0]).toContain('2×2 = 4');
  });

  it('overclock=2 → damage pre-multiplied by (1+2)=3, single log with ×3 notation', () => {
    const baseState = makeOverclockState(2);
    const target = makeMonsterInActiveRow('m-target-2', 'Active Monster');
    const state = withMonstersInActiveRow(baseState, [target]);
    const golem = makeGolemMonsterEquip({ durability: 4 });

    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', golem, 2);

    // 2 (perLayer) * 2 (lostDur) * 3 (1+overclock) = 12
    expect(result.golemReflectDamage?.damage).toBe(12);
    expect(result.golemReflectDamage?.targetId).toBe('m-target-2');

    const golemLogs = logMessages(result.sideEffects).filter(m => m.includes('反震'));
    expect(golemLogs).toHaveLength(1); // single log (not 3)
    expect(golemLogs[0]).toContain('2×2×3 = 12');

    expect(findOverclockSideEffect(result.sideEffects)).toEqual({
      surface: 'durability',
      count: 2,
    });
  });

  it('does not fire when no monsters in active row', () => {
    const state = makeOverclockState(2); // empty active row
    const golem = makeGolemMonsterEquip({ durability: 4 });
    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', golem, 2);

    expect(result.golemReflectDamage).toBeUndefined();
    expect(logMessages(result.sideEffects).filter(m => m.includes('反震'))).toHaveLength(0);
  });

  it('does not fire when lostDur <= 0 (newDur >= maxDur)', () => {
    const baseState = makeOverclockState(2);
    const target = makeMonsterInActiveRow('m-t', 'Foo');
    const state = withMonstersInActiveRow(baseState, [target]);
    const golem = makeGolemMonsterEquip({ durability: 4, maxDurability: 4 });
    // newDur=4 == maxDur → lostDur=0
    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', golem, 4);

    expect(result.golemReflectDamage).toBeUndefined();
  });

  it('target picked deterministically from rng (no extra picks on overclock)', () => {
    const baseStateA = makeOverclockState(2, { rng: { seed: 100, state: 100 } });
    const baseStateB = makeOverclockState(2, { rng: { seed: 100, state: 100 } });
    const monsters = [
      makeMonsterInActiveRow('a', 'A'),
      makeMonsterInActiveRow('b', 'B'),
      makeMonsterInActiveRow('c', 'C'),
    ];
    const stateA = withMonstersInActiveRow(baseStateA, monsters);
    const stateB = withMonstersInActiveRow(baseStateB, monsters);

    const golemA = makeGolemMonsterEquip({ durability: 4 });
    const golemB = makeGolemMonsterEquip({ durability: 4 });

    const resA = computeDurabilityLossEffects(stateA, 'equipmentSlot1', golemA, 2);
    const resB = computeDurabilityLossEffects(stateB, 'equipmentSlot1', golemB, 2);

    expect(resA.golemReflectDamage?.targetId).toBe(resB.golemReflectDamage?.targetId);
    expect(resA.rng).toEqual(resB.rng);
  });
});

// ---------------------------------------------------------------------------
// Inline (NOT migrated) — regression: dragon-bleed-destroy + swarm-elite still work
// ---------------------------------------------------------------------------

describe('inline non-overclocked: dragon-bleed-destroy', () => {
  it('destroys other slot when its durability > self.newDurability', () => {
    const dragon: GameCardData = {
      id: 'm-dragon',
      type: 'monster',
      name: 'Test Dragon',
      value: 4,
      attack: 4,
      image: '',
      durability: 3,
      maxDurability: 3,
      monsterType: 'Dragon',
      dragonBleedDestroy: true,
    } as GameCardData;
    const other: GameCardData = {
      id: 'w-other',
      type: 'weapon',
      name: 'High-Dur Sword',
      value: 1,
      image: '',
      durability: 4,
      maxDurability: 4,
    } as GameCardData;
    const state = makeState({ equipmentSlot2: other });
    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', dragon, 1);

    expect(result.patch.equipmentSlot2).toBeNull();
    const destroyed = (result.sideEffects as Array<{ event?: string }>).filter(
      s => s.event === 'equipment:destroyed',
    );
    expect(destroyed).toHaveLength(1);
  });

  it('does not destroy other slot when its durability <= self.newDurability', () => {
    const dragon: GameCardData = {
      id: 'm-dragon',
      type: 'monster',
      name: 'Test Dragon',
      value: 4,
      attack: 4,
      image: '',
      durability: 3,
      maxDurability: 3,
      monsterType: 'Dragon',
      dragonBleedDestroy: true,
    } as GameCardData;
    const other: GameCardData = {
      id: 'w-other',
      type: 'weapon',
      name: 'Low-Dur',
      value: 1,
      image: '',
      durability: 1,
      maxDurability: 1,
    } as GameCardData;
    const state = makeState({ equipmentSlot2: other });
    // self goes 3 → 2; other.dur (1) is NOT > 2 → no destroy
    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', dragon, 2);

    expect(result.patch.equipmentSlot2).toBeUndefined();
  });
});

describe('inline non-overclocked: swarm-elite', () => {
  it('replaces other slot with buglet on durability loss', () => {
    const swarm: GameCardData = {
      id: 'm-swarm',
      type: 'monster',
      name: 'Test Swarm',
      value: 3,
      attack: 3,
      image: '',
      durability: 3,
      maxDurability: 3,
      monsterType: 'Swarm',
      monsterSpecial: 'swarm-elite',
    } as GameCardData;
    const other: GameCardData = {
      id: 'w-other-2',
      type: 'weapon',
      name: 'Other Weapon',
      value: 1,
      image: '',
      durability: 2,
      maxDurability: 2,
    } as GameCardData;
    const state = makeState({ equipmentSlot2: other });
    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', swarm, 2);

    const newOther = result.patch.equipmentSlot2 as GameCardData | null | undefined;
    expect(newOther).toBeDefined();
    expect(newOther?.id).not.toBe('w-other-2'); // replaced
    expect(newOther?.durability).toBe(1);
    expect(newOther?.maxDurability).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: combined handlers (mine + bleed on a monster equip)
// ---------------------------------------------------------------------------

describe('combined handlers — multiple registered effects fire in same call', () => {
  it('mine+bleed on monster equip → both contribute, single overclock side effect', () => {
    const state = makeOverclockState(1, { globalMineDamageBonus: 0 });
    const monster: GameCardData = {
      ...makeBleedMonsterEquip({ durability: 3 }),
      mineDamageBoostPerDur: 2, // also has mine boost
    } as GameCardData;

    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', monster, 2);

    // mine: 2 perDur * 1 durLost * (1+1)=2 calls = +4 boost
    expect(result.patch.globalMineDamageBonus).toBe(4);
    // bleed: 4 base + 3 * (1+1) = 4 + 6 = 10 attack
    expect(result.updatedItem.attack).toBe(10);

    // Single overclock side effect (despite 2 handlers contributing)
    const overclockEffects = (result.sideEffects as Array<{ event?: string }>).filter(
      s => s.event === 'combat:equipOverclockTriggered',
    );
    expect(overclockEffects).toHaveLength(1);
  });
});
