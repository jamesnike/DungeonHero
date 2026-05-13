/**
 * Equipment-derived block surface handlers (PR-5).
 *
 * Covers 6 handlers migrated from `combat.ts:reduceResolveBlock`:
 *   1. dual-guard-armor — perfect block + amulet dualGuardCount.
 *      Each iter +dualGuard permanent shield bonus to slot.
 *   2. perfect-block-max-hp-gain — perfect block + slot.shieldPerfectBlockMaxHpGain.
 *      Each iter += gain to permanentMaxHpBonus.
 *   3. perfect-block-spawn-missiles — perfect block + slot.perfectBlockSpawnMissiles.
 *      AGGREGATE: iter 1 spawns base × (1+N) bolts. Iter 2..N no-op.
 *   4. block-grant-temp-armor-to-other — slot.blockGrantTempArmorToOther.
 *      Each iter += grantBase to slotTempArmor[other].
 *   5. dragon-breath-shield-retaliation — monster equip + dragonDamageRetaliation.
 *      Iter 1 RNG-pick target; iter 2..N reuse cached target.
 *   6. shield-reflect-on-block — surfaceCtx.reflectDmg > 0.
 *      Each iter enqueues 1 DEAL_DAMAGE shield-reflect targeting the
 *      attacking monster.
 *
 * Tests target the actual `RESOLVE_BLOCK` reducer entry to verify the entire
 * pipeline (single overclock emit, target caching, etc.).
 */
import { describe, expect, it } from 'vitest';
import '../card-schema';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState, HAND_LIMIT } from '../constants';
import { getEternalRelic } from '@/lib/eternalRelics';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRecycleBag(count: number): GameCardData[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `rb-${i}`,
    type: 'magic',
    name: `J-${i}`,
    value: 0,
    image: '',
    magicType: 'instant',
  } as GameCardData));
}

function makeMonster(over: Partial<GameCardData> = {}): GameCardData {
  return {
    id: 'm1',
    type: 'monster',
    name: 'Goblin',
    value: 5,
    image: '',
    hp: 10,
    maxHp: 10,
    attack: 5,
    currentLayer: 1,
    fury: 1,
    hpLayers: 1,
    ...over,
  } as GameCardData;
}

function makeShield(over: Partial<GameCardData> = {}): EquipmentItem {
  return {
    id: 's1',
    type: 'shield',
    name: 'TestShield',
    value: 5,
    image: '',
    armor: 5,
    armorMax: 5,
    durability: 3,
    maxDurability: 3,
    ...over,
  } as EquipmentItem;
}

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as ActiveRowSlots,
    combatState: { ...initialCombatState },
    ...overrides,
  };
}

function setupBlockState(
  monster: GameCardData,
  shield: EquipmentItem,
  over: Partial<GameState> = {},
  seed = 1,
): GameState {
  return makeState({
    rng: createRng(seed),
    activeCards: [monster, null, null, null, null] as ActiveRowSlots,
    equipmentSlot1: shield,
    handCards: [],
    hp: 30,
    maxHp: 30,
    combatState: {
      ...initialCombatState,
      engagedMonsterIds: [monster.id],
      currentTurn: 'monster',
      pendingBlock: {
        monsterId: monster.id,
        attackValue: monster.attack ?? monster.value,
        monsterName: monster.name,
      },
    },
    ...over,
  });
}

function withOverclock(state: GameState, n: number): GameState {
  return {
    ...state,
    eternalRelics: Array.from({ length: n }, () => getEternalRelic('equip-overclock')),
    permanentMagicRecycleBag: makeRecycleBag(11),
  };
}

function fillerCards(len: number): GameCardData[] {
  return Array.from({ length: len }, (_, i) => ({
    id: `f-${i}`,
    type: 'magic',
    name: `F-${i}`,
    value: 0,
    image: '',
  } as GameCardData));
}

function logsContaining(side: ReadonlyArray<unknown>, sub: string): number {
  return (side as Array<{ event?: string; payload?: { message?: string } }>)
    .filter(s => s.event === 'log:entry' && (s.payload?.message ?? '').includes(sub)).length;
}

function findOverclockEmits(side: ReadonlyArray<unknown>): Array<{ surface?: string; count?: number }> {
  return (side as Array<{ event?: string; payload?: { surface?: string; count?: number } }>)
    .filter(s => s.event === 'combat:equipOverclockTriggered')
    .map(s => s.payload ?? {});
}

// ---------------------------------------------------------------------------
// 1. dual-guard-armor
// ---------------------------------------------------------------------------

describe('dual-guard-armor handler', () => {
  it('overclock=2 + perfect block + 2 dual-guard amulets → +6 permanent shield bonus (2 × 3 iters)', () => {
    const monster = makeMonster({ id: 'm', attack: 1 });
    const shield = makeShield();
    const mkDual = (id: string) => ({
      id, type: 'amulet', name: '双守护', value: 0, image: '', amuletEffect: 'dual-guard',
    } as GameCardData);
    const state = withOverclock(setupBlockState(monster, shield, {
      amuletSlots: [mkDual('a-dg-1'), mkDual('a-dg-2'), null, null, null] as any,
    }), 2);

    const before = state.equipmentSlotBonuses.equipmentSlot1.shield;
    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });
    const after = result.state.equipmentSlotBonuses.equipmentSlot1.shield;

    expect(after - before).toBe(6); // dualGuardCount=2 × (1 + overclock=2) = 6
    expect(logsContaining(result.sideEffects, '双守护圣盾使该栏永久护甲 +6')).toBe(1);
  });

  it('non-perfect block: does not fire even with dualGuard', () => {
    const monster = makeMonster({ id: 'm', attack: 100 });
    const shield = makeShield({ value: 1, armorMax: 1, armor: 1 });
    const dualAmulet = {
      id: 'a-dg', type: 'amulet', name: '双守护', value: 0, image: '', amuletEffect: 'dual-guard',
    } as GameCardData;
    const state = setupBlockState(monster, shield, {
      amuletSlots: [dualAmulet, null, null, null, null] as any,
    });

    const before = state.equipmentSlotBonuses.equipmentSlot1.shield;
    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 2. perfect-block-max-hp-gain (砺心之盾)
// ---------------------------------------------------------------------------

describe('perfect-block-max-hp-gain handler', () => {
  it('overclock=2 + perfect block + gain=4 → +12 permanentMaxHpBonus (4 × 3 iters)', () => {
    const monster = makeMonster({ id: 'm', attack: 1 });
    const shield = makeShield({ shieldPerfectBlockMaxHpGain: 4 });
    const state = withOverclock(setupBlockState(monster, shield), 2);

    const before = state.permanentMaxHpBonus ?? 0;
    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });

    expect((result.state.permanentMaxHpBonus ?? 0) - before).toBe(12);
    expect(logsContaining(result.sideEffects, '永久生命值上限 +12')).toBe(1);
  });

  it('overclock=0: +4 once', () => {
    const monster = makeMonster({ id: 'm', attack: 1 });
    const shield = makeShield({ shieldPerfectBlockMaxHpGain: 4 });
    const state = setupBlockState(monster, shield);

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });
    expect(result.state.permanentMaxHpBonus ?? 0).toBe(4);
    expect(logsContaining(result.sideEffects, '永久生命值上限 +4')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. perfect-block-spawn-missiles (弹幕护盾) — aggregate semantic
// ---------------------------------------------------------------------------

describe('perfect-block-spawn-missiles handler', () => {
  it('overclock=2 + perfect block + spawn=2 → spawns 6 bolts (2 × 3) into hand', () => {
    const monster = makeMonster({ id: 'm', attack: 1 });
    const shield = makeShield({ perfectBlockSpawnMissiles: 2 });
    const state = withOverclock(setupBlockState(monster, shield), 2);

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });
    const bolts = result.state.handCards.filter(c => c.name === '魔弹');
    expect(bolts).toHaveLength(6);
    expect(logsContaining(result.sideEffects, '完美格挡：获得 6 张「魔弹」')).toBe(1);
  });

  it('overclock=2 + perfect block + spawn=2 + handRoom=3 → 3 bolts (silent overflow log)', () => {
    const monster = makeMonster({ id: 'm', attack: 1 });
    const shield = makeShield({ perfectBlockSpawnMissiles: 2 });
    const state = withOverclock(setupBlockState(monster, shield, {
      handCards: fillerCards(HAND_LIMIT - 3),
    }), 2);

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });
    const bolts = result.state.handCards.filter(c => c.name === '魔弹');
    expect(bolts).toHaveLength(3);
    expect(logsContaining(result.sideEffects, '完美格挡：获得 3 张「魔弹」')).toBe(1);
    expect(logsContaining(result.sideEffects, '少入 3 张')).toBe(1); // 6 wanted - 3 spawned
  });
});

// ---------------------------------------------------------------------------
// 4. block-grant-temp-armor-to-other (守望者链接)
// ---------------------------------------------------------------------------

describe('block-grant-temp-armor-to-other handler', () => {
  it('overclock=2 + slot1 has blockGrantTempArmorToOther=true → slot2 +grantBase × 3', () => {
    const monster = makeMonster({ id: 'm', attack: 1 });
    const shield = makeShield({
      armorMax: 4,
      armor: 4,
      value: 4,
      blockGrantTempArmorToOther: true,
    });
    const state = withOverclock(setupBlockState(monster, shield), 2);

    const before = state.slotTempArmor?.equipmentSlot2 ?? 0;
    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });

    // grantBase = storedCap = 4 (base 4 + perm 0 + temp 0). Each iter +4 → 12 total.
    expect((result.state.slotTempArmor?.equipmentSlot2 ?? 0) - before).toBe(12);
    expect(logsContaining(result.sideEffects, '右装备栏临时护甲 +12')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5. dragon-breath-shield-retaliation
// ---------------------------------------------------------------------------

describe('dragon-breath-shield-retaliation handler', () => {
  it('overclock=2 + monster shield with dragonDamageRetaliation → 3 DEAL_DAMAGE on same target', () => {
    const attacker = makeMonster({ id: 'attacker', attack: 1 });
    const otherMonster = makeMonster({ id: 'other', name: 'Other', attack: 5 });
    const dragonShield = makeShield({
      type: 'monster' as any,
      hp: 5,
      maxHp: 5,
      dragonDamageRetaliation: 1,
    });
    const state = withOverclock(setupBlockState(attacker, dragonShield, {
      activeCards: [attacker, otherMonster, null, null, null] as ActiveRowSlots,
    }), 2);

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });
    const dragonDmgs = result.enqueuedActions.filter(
      a => a.type === 'DEAL_DAMAGE_TO_MONSTER'
        && (a as any).source === 'dragon-breath-reflect'
        && (a as any).damage === 2,
    );
    expect(dragonDmgs).toHaveLength(3);
    const targetIds = new Set(dragonDmgs.map(d => (d as any).monsterId));
    expect(targetIds.size).toBe(1); // all same target
    expect(logsContaining(result.sideEffects, '龙息：对')).toBe(1); // single log
  });
});

// ---------------------------------------------------------------------------
// 6. shield-reflect-on-block
// ---------------------------------------------------------------------------

describe('shield-reflect-on-block handler', () => {
  it('overclock=2 + shield with damageReflect=3 → 3 DEAL_DAMAGE shield-reflect', () => {
    const monster = makeMonster({ id: 'm', attack: 1, hp: 100, maxHp: 100, currentLayer: 5, fury: 5, hpLayers: 5 });
    const shield = makeShield({ damageReflect: 3 });
    const state = withOverclock(setupBlockState(monster, shield), 2);

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });
    const reflects = result.enqueuedActions.filter(
      a => a.type === 'DEAL_DAMAGE_TO_MONSTER'
        && (a as any).source === 'shield-reflect'
        && (a as any).monsterId === 'm',
    );
    expect(reflects).toHaveLength(3); // (1 + 2)
    expect(logsContaining(result.sideEffects, '反射了 3 点伤害')).toBe(1); // single log
  });

  it('overclock=0 + damageReflect=3 → exactly 1 DEAL_DAMAGE + 1 log', () => {
    const monster = makeMonster({ id: 'm', attack: 1, hp: 100, maxHp: 100, currentLayer: 5, fury: 5, hpLayers: 5 });
    const shield = makeShield({ damageReflect: 3 });
    const state = setupBlockState(monster, shield);

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });
    const reflects = result.enqueuedActions.filter(
      a => a.type === 'DEAL_DAMAGE_TO_MONSTER' && (a as any).source === 'shield-reflect',
    );
    expect(reflects).toHaveLength(1);
    expect(logsContaining(result.sideEffects, '反射了 3 点伤害')).toBe(1);
  });

  it('damageReflect=0: no reflect actions enqueued', () => {
    const monster = makeMonster({ id: 'm', attack: 1 });
    const shield = makeShield();
    const state = withOverclock(setupBlockState(monster, shield), 2);

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });
    const reflects = result.enqueuedActions.filter(
      a => a.type === 'DEAL_DAMAGE_TO_MONSTER' && (a as any).source === 'shield-reflect',
    );
    expect(reflects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Single overclock emit per RESOLVE_BLOCK regardless of how many handlers fire
// ---------------------------------------------------------------------------

describe('inline overclock emit — block surface emits exactly once per resolve', () => {
  it('multiple handlers fire (perfect-block-max-hp + reflect) → exactly 1 emit', () => {
    const monster = makeMonster({ id: 'm', attack: 1, hp: 100, maxHp: 100, currentLayer: 5, fury: 5, hpLayers: 5 });
    const shield = makeShield({
      shieldPerfectBlockMaxHpGain: 2,
      damageReflect: 1,
    });
    const state = withOverclock(setupBlockState(monster, shield), 2);

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });
    const emits = findOverclockEmits(result.sideEffects);
    expect(emits).toHaveLength(1);
    expect(emits[0]).toEqual({ surface: 'block', count: 2 });
  });
});
