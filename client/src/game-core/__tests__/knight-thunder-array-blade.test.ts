/**
 * 引雷阵锋 (knight:thunder-array-blade) — Knight class weapon.
 *
 * Behavior:
 *   - 3 attack / 2 durability (lvl 0).
 *   - 每消耗 1 点耐久 → state.globalMineDamageBonus += mineDamageBoostPerDur。
 *   - 累加永久不撤销（修复耐久 / 武器损毁都不扣回）。
 *   - 全场所有「地雷」(mineDamage > 0) 被怪物触发时，实际伤害 =
 *     mineDamage + globalMineDamageBonus。
 *   - 升级：lvl 0 (3/2 +2) → lvl 1 (3/3 +2) → lvl 2 (3/3 +3)。
 *
 * Tests cover the full impact matrix:
 *   1. Helper accumulateMineDamageBoost (unit)
 *   2. PERFORM_HERO_ATTACK 武器耐久 -1 → bonus +2
 *   3. 武器破坏的最后一点耐久也累加 bonus
 *   4. 修复耐久（MODIFY_EQUIPMENT_DURABILITY +1）不撤销 bonus
 *   5. MODIFY_EQUIPMENT_DURABILITY 负 delta 也累加 bonus
 *   6. 蓄能裂击 -3 耐久 → bonus +6
 *   7. 等价交换（soul-swap）耐久下降 → bonus 累加
 *   8. 地雷触发时实际伤害 = mineDamage + globalMineDamageBonus
 *   9. 修复耐久后再损耗，新耐久损失继续累加 bonus（不双计）
 *   10. 升级：lvl 0/1/2 stats / mineDamageBoostPerDur
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { GameEngine } from '../index';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import { initialCombatState } from '../constants';
import { accumulateMineDamageBoost } from '../rules/equipment-effects';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import type { GameCardData } from '@/components/GameCard';
import type { SideEffect } from '../reducer';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as unknown as ActiveRowSlots,
    combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero' } as any,
    phase: 'playerInput' as any,
    rng: createRng(42),
    ...overrides,
  };
}

function makeWeapon(overrides: Partial<GameCardData> = {}): GameCardData {
  return {
    id: 'w-thunder-array-blade',
    type: 'weapon',
    name: '引雷阵锋',
    value: 3,
    image: '',
    classCard: true,
    knightEffect: 'thunder-array-blade',
    mineDamageBoostPerDur: 2,
    durability: 2,
    maxDurability: 2,
    maxUpgradeLevel: 2,
    upgradeLevel: 0,
    ...overrides,
  } as GameCardData;
}

function makeMonster(id: string, hp = 50, attack = 0, extras: Record<string, any> = {}): GameCardData {
  return {
    id,
    type: 'monster',
    name: `M-${id}`,
    value: hp,
    image: '',
    hp,
    maxHp: hp,
    attack,
    currentLayer: 1,
    hpLayers: 1,
    fury: 1,
    ...extras,
  } as GameCardData;
}

function makeMine(id: string, mineDamage = 5): GameCardData {
  return {
    id,
    type: 'building',
    name: '地雷',
    value: 0,
    image: '',
    isGhost: true,
    mineDamage,
    hp: 1,
    maxHp: 1,
  } as GameCardData;
}

function activeRowOf(...cards: (GameCardData | null)[]): ActiveRowSlots {
  const row: (GameCardData | null)[] = [null, null, null, null, null];
  for (let i = 0; i < cards.length && i < 5; i++) row[i] = cards[i];
  return row as unknown as ActiveRowSlots;
}

// ---------------------------------------------------------------------------
// 1) Helper unit: accumulateMineDamageBoost
// ---------------------------------------------------------------------------

describe('accumulateMineDamageBoost helper', () => {
  it('武器有 mineDamageBoostPerDur=2 + durLost=1 → patch.globalMineDamageBonus +=2', () => {
    const state = makeState({ globalMineDamageBonus: 5 });
    const weapon = makeWeapon();
    const patch: Partial<GameState> = {};
    const sideEffects: SideEffect[] = [];

    accumulateMineDamageBoost(state, weapon, 1, patch, sideEffects);

    expect(patch.globalMineDamageBonus).toBe(7); // 5 + 1*2
    expect(sideEffects.length).toBeGreaterThan(0);
  });

  it('durLost=3, perDur=2 → 一次 +6（按净损失计）', () => {
    const state = makeState({ globalMineDamageBonus: 0 });
    const weapon = makeWeapon();
    const patch: Partial<GameState> = {};
    const sideEffects: SideEffect[] = [];

    accumulateMineDamageBoost(state, weapon, 3, patch, sideEffects);

    expect(patch.globalMineDamageBonus).toBe(6);
  });

  it('武器没有 mineDamageBoostPerDur → no-op', () => {
    const state = makeState({ globalMineDamageBonus: 5 });
    const otherWeapon: GameCardData = {
      id: 'w-other', type: 'weapon', name: 'Other', value: 3, image: '',
      durability: 2, maxDurability: 2,
    };
    const patch: Partial<GameState> = {};
    const sideEffects: SideEffect[] = [];

    accumulateMineDamageBoost(state, otherWeapon, 1, patch, sideEffects);

    expect(patch.globalMineDamageBonus).toBeUndefined();
    expect(sideEffects).toHaveLength(0);
  });

  it('durLost=0 → no-op（修复 / dur 不变）', () => {
    const state = makeState({ globalMineDamageBonus: 5 });
    const weapon = makeWeapon();
    const patch: Partial<GameState> = {};
    const sideEffects: SideEffect[] = [];

    accumulateMineDamageBoost(state, weapon, 0, patch, sideEffects);

    expect(patch.globalMineDamageBonus).toBeUndefined();
    expect(sideEffects).toHaveLength(0);
  });

  it('durLost 负数 → no-op（保护性，理论上不该出现）', () => {
    const state = makeState({ globalMineDamageBonus: 5 });
    const weapon = makeWeapon();
    const patch: Partial<GameState> = {};
    const sideEffects: SideEffect[] = [];

    accumulateMineDamageBoost(state, weapon, -1, patch, sideEffects);

    expect(patch.globalMineDamageBonus).toBeUndefined();
  });

  it('多次累加：patch 中已有 globalMineDamageBonus → 继续往上加（patch-aware）', () => {
    const state = makeState({ globalMineDamageBonus: 0 });
    const weapon = makeWeapon();
    const patch: Partial<GameState> = { globalMineDamageBonus: 4 }; // 之前的累加
    const sideEffects: SideEffect[] = [];

    accumulateMineDamageBoost(state, weapon, 1, patch, sideEffects);

    // 4 + 1*2 = 6（不读 state.globalMineDamageBonus）
    expect(patch.globalMineDamageBonus).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// 2) PERFORM_HERO_ATTACK — weapon attack tick accumulates bonus
// ---------------------------------------------------------------------------

describe('引雷阵锋 PERFORM_HERO_ATTACK：武器耐久 -1 → bonus +2', () => {
  it('攻击未杀怪 → 武器耐久 2 → 1，globalMineDamageBonus 0 → 2', () => {
    const blade = makeWeapon({ durability: 2, maxDurability: 2 });
    const target = makeMonster('m1', 50, 0);
    const state = makeState({
      equipmentSlot1: blade as EquipmentItem,
      activeCards: activeRowOf(target),
      combatState: {
        ...initialCombatState,
        heroAttacksRemaining: 1,
        heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
        engagedMonsterIds: [target.id],
      } as any,
      globalMineDamageBonus: 0,
    });

    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: target.id,
    });
    const finalState = drain(result.state, result.enqueuedActions ?? []).state;

    expect(finalState.equipmentSlot1?.durability).toBe(1);
    expect(finalState.globalMineDamageBonus).toBe(2);
  });

  it('攻击 2 次（第二次破武器）→ bonus 累计 +4（每次 +2）', () => {
    const blade = makeWeapon({ durability: 2, maxDurability: 2 });
    const target = makeMonster('m1', 100, 0);
    const state = makeState({
      equipmentSlot1: blade as EquipmentItem,
      activeCards: activeRowOf(target),
      combatState: {
        ...initialCombatState,
        heroAttacksRemaining: 5,
        heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
        engagedMonsterIds: [target.id],
      } as any,
      globalMineDamageBonus: 0,
    });

    // 第 1 次攻击
    const r1 = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: target.id,
    });
    const s1 = drain(r1.state, r1.enqueuedActions ?? []).state;
    expect(s1.equipmentSlot1?.durability).toBe(1);
    expect(s1.globalMineDamageBonus).toBe(2);

    // 重置 heroAttacksThisTurn 以允许第 2 次攻击
    const s1b: GameState = {
      ...s1,
      combatState: {
        ...s1.combatState,
        heroAttacksRemaining: 5,
        heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
      } as any,
    };

    // 第 2 次攻击 — 武器破坏（durability 1 → 0 + computeEquipmentBreakEffects）
    const r2 = reduce(s1b, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: target.id,
    });
    const s2 = drain(r2.state, r2.enqueuedActions ?? []).state;

    // 武器栏空（被破坏）
    expect(s2.equipmentSlot1).toBeNull();
    // 但 bonus 累计达到 +4（每次攻击 +2，包括最后那一击）
    expect(s2.globalMineDamageBonus).toBe(4);
    // 武器进了坟场
    expect(s2.discardedCards.some(c => c.id === 'w-thunder-array-blade')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3) Mine trigger reads globalMineDamageBonus
// ---------------------------------------------------------------------------

describe('引雷阵锋 + 地雷：触发时实际伤害 = mineDamage + globalMineDamageBonus', () => {
  function setupMineDropFixture(overrides: Partial<GameState> = {}): GameState {
    const mine = makeMine('mine-trigger', 5);
    const monster = makeMonster('m-fall', 30, 3);
    return makeState({
      activeCards: activeRowOf(null, null, mine, null, null),
      previewCards: [null, null, monster, null, null] as unknown as ActiveRowSlots,
      pendingWaterfallPlan: {
        dropAssignments: [{ previewIndex: 2, card: monster, slotIndex: 2 }],
        resolvedDropCards: [monster],
        dropPreviewIndices: [2],
        dropTargetSlots: [2],
        discardCard: null,
        discardPreviewIndex: null,
        discardDestination: 'graveyard',
        nextPreviewCards: [],
        nextRemainingDeck: [],
        newPreviewStacks: {},
        shouldDeclareVictory: false,
        stuckFinalMonsters: [],
        rng: createRng(1),
      } as any,
      ...overrides,
    });
  }

  it('globalMineDamageBonus = 0 → 怪物受 5 伤害（base mine damage）', () => {
    const state = setupMineDropFixture({ globalMineDamageBonus: 0 });
    const engine = new GameEngine(state);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });

    let mineEvent: any = null;
    engine.on('combat:mineTriggered', payload => { mineEvent = payload; });

    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });

    const finalState = engine.getState();
    expect((finalState.activeCards as any[])[2]?.hp).toBe(25); // 30 - 5
    expect(mineEvent.damage).toBe(5);
  });

  it('globalMineDamageBonus = 4 → 怪物受 9 伤害（5 + 4）', () => {
    const state = setupMineDropFixture({ globalMineDamageBonus: 4 });
    const engine = new GameEngine(state);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });

    let mineEvent: any = null;
    engine.on('combat:mineTriggered', payload => { mineEvent = payload; });

    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });

    const finalState = engine.getState();
    expect((finalState.activeCards as any[])[2]?.hp).toBe(21); // 30 - 9
    expect(mineEvent.damage).toBe(9);
  });

  it('end-to-end: 引雷阵锋攻击 1 次（bonus +2）→ 之后地雷触发 = 7 伤', () => {
    const blade = makeWeapon({ durability: 2, maxDurability: 2 });
    const initialMonster = makeMonster('m-init', 100, 0);
    const state = makeState({
      equipmentSlot1: blade as EquipmentItem,
      activeCards: activeRowOf(initialMonster),
      combatState: {
        ...initialCombatState,
        heroAttacksRemaining: 1,
        heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
        engagedMonsterIds: [initialMonster.id],
      } as any,
      globalMineDamageBonus: 0,
    });

    // 第一步：用武器攻击一次 → bonus +2
    const r1 = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: initialMonster.id,
    });
    const afterAttack = drain(r1.state, r1.enqueuedActions ?? []).state;
    expect(afterAttack.globalMineDamageBonus).toBe(2);

    // 第二步：构造一个地雷在 slot 2，瀑流落怪物
    const mine = makeMine('mine-after', 5);
    const fallMonster = makeMonster('m-fall', 30, 0);
    const dropState: GameState = {
      ...afterAttack,
      activeCards: activeRowOf(null, null, mine, null, null),
      previewCards: [null, null, fallMonster, null, null] as unknown as ActiveRowSlots,
      pendingWaterfallPlan: {
        dropAssignments: [{ previewIndex: 2, card: fallMonster, slotIndex: 2 }],
        resolvedDropCards: [fallMonster],
        dropPreviewIndices: [2],
        dropTargetSlots: [2],
        discardCard: null,
        discardPreviewIndex: null,
        discardDestination: 'graveyard',
        nextPreviewCards: [],
        nextRemainingDeck: [],
        newPreviewStacks: {},
        shouldDeclareVictory: false,
        stuckFinalMonsters: [],
        rng: createRng(1),
      } as any,
    };

    const engine = new GameEngine(dropState);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });
    let mineEvent: any = null;
    engine.on('combat:mineTriggered', p => { mineEvent = p; });

    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });

    const finalState = engine.getState();
    // 30 - (5 + 2) = 23
    expect((finalState.activeCards as any[])[2]?.hp).toBe(23);
    expect(mineEvent.damage).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// 4) Repair does NOT undo the bonus
// ---------------------------------------------------------------------------

describe('引雷阵锋：修复耐久不撤销已累加的 bonus', () => {
  it('损耗 1 点（bonus +2）→ MODIFY_EQUIPMENT_DURABILITY +1（修复）→ bonus 仍 = 2', () => {
    const blade = makeWeapon({ durability: 1, maxDurability: 2 });
    const state = makeState({
      equipmentSlot1: blade as EquipmentItem,
      globalMineDamageBonus: 2, // 假设已经攻击过一次
    });

    const result = reduce(state, {
      type: 'MODIFY_EQUIPMENT_DURABILITY',
      slotId: 'equipmentSlot1',
      delta: 1,
    });

    expect(result.state.equipmentSlot1?.durability).toBe(2);
    expect(result.state.globalMineDamageBonus).toBe(2); // 不撤销
  });
});

// ---------------------------------------------------------------------------
// 5) MODIFY_EQUIPMENT_DURABILITY with negative delta
// ---------------------------------------------------------------------------

describe('引雷阵锋：MODIFY_EQUIPMENT_DURABILITY 负 delta → bonus 累加', () => {
  it('delta -1 → bonus +2', () => {
    const blade = makeWeapon({ durability: 2, maxDurability: 2 });
    const state = makeState({
      equipmentSlot1: blade as EquipmentItem,
      globalMineDamageBonus: 0,
    });

    const result = reduce(state, {
      type: 'MODIFY_EQUIPMENT_DURABILITY',
      slotId: 'equipmentSlot1',
      delta: -1,
    });

    expect(result.state.equipmentSlot1?.durability).toBe(1);
    expect(result.state.globalMineDamageBonus).toBe(2);
  });

  it('delta -2 → bonus +4（净损失 2 个耐久）', () => {
    const blade = makeWeapon({ durability: 3, maxDurability: 3 });
    const state = makeState({
      equipmentSlot1: blade as EquipmentItem,
      globalMineDamageBonus: 0,
    });

    const result = reduce(state, {
      type: 'MODIFY_EQUIPMENT_DURABILITY',
      slotId: 'equipmentSlot1',
      delta: -2,
    });

    expect(result.state.globalMineDamageBonus).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 6) durability-charge-burst (蓄能裂击) accumulates bonus
// ---------------------------------------------------------------------------

describe('引雷阵锋 + 蓄能裂击：耐久 -3 → bonus +6', () => {
  it('蓄能裂击在已满耐久武器（4/4）上 → 触发 → 耐久 -3 → bonus += 6', () => {
    // 蓄能裂击：先 +1 耐久 / 上限（已满则不变），耐久达 4 触发，伤害随机怪 + 自身耐久 -3。
    // 引雷阵锋满耐久 4 时（升级后 maxDur=3，那不可能 4）—— 用一把临时高耐武器测。
    // 这里直接用 maxDurability=4 的引雷阵锋 fixture（升级到 lvl 1+ 也最多 3，所以
    // 用一个"假设"的高耐武器；测的是 mineDamageBoostPerDur 字段在 dur loss 时
    // 的累加机制，不依赖 thunder-array-blade 的具体 maxDurability cap）。
    const fakeHighDurBlade = makeWeapon({ durability: 4, maxDurability: 4 });
    const monster = makeMonster('m-burst', 100, 0);
    const card: GameCardData = {
      id: 'magic-charge-burst',
      type: 'magic',
      name: '蓄能裂击',
      value: 0,
      image: '',
      classCard: true,
      magicType: 'permanent',
      knightEffect: 'durability-charge-burst',
      upgradeLevel: 0,
    } as GameCardData;

    const state = makeState({
      equipmentSlot1: fakeHighDurBlade as EquipmentItem,
      activeCards: activeRowOf(monster),
      handCards: [card],
      pendingMagicAction: {
        card,
        effect: 'durability-charge-burst',
        step: 'slot-select',
        prompt: '...',
      } as any,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: [monster.id],
      } as any,
      globalMineDamageBonus: 0,
    });

    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'durability-charge-burst', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    // 蓄能裂击触发：装备耐久 4 → 4（已满，maxDur 不变）→ 触发后 -3 → 1
    expect(result.state.equipmentSlot1?.durability).toBe(1);
    // 耐久从 4 降到 1，净损失 3 → bonus += 3*2 = 6
    expect(result.state.globalMineDamageBonus).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// 7) Soul-swap (等价交换) accumulates bonus when weapon dur drops
// ---------------------------------------------------------------------------

describe('引雷阵锋 + 等价交换：武器耐久 → 怪物血层（耐久下降时累加 bonus）', () => {
  it('武器 dur=3，怪物 currentLayer=1 → 交换后 dur=1 → 净损失 2 → bonus +4', () => {
    const blade = makeWeapon({ durability: 3, maxDurability: 3 });
    // 怪物血层 1，跟武器交换后武器变 1 耐久
    const monster = makeMonster('m-swap', 30, 0, { currentLayer: 1, hpLayers: 3 });
    const card: GameCardData = {
      id: 'magic-soul-swap',
      type: 'magic',
      name: '等价交换',
      value: 0,
      image: '',
      classCard: true,
      magicType: 'permanent',
      knightEffect: 'soul-swap',
      upgradeLevel: 0,
    } as GameCardData;

    const state = makeState({
      equipmentSlot1: blade as EquipmentItem,
      activeCards: activeRowOf(monster),
      handCards: [card],
      globalMineDamageBonus: 0,
    });

    // 走 reducer：等价交换 单装备 + 单怪物 时直接执行（不进 pendingMagicAction）
    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    // 武器耐久 3 → 1（怪物 currentLayer=1）
    expect(result.state.equipmentSlot1?.durability).toBe(1);
    // bonus 累加：净损失 2 * 2 = 4
    expect(result.state.globalMineDamageBonus).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 8) Repair-then-loss does not double-count
// ---------------------------------------------------------------------------

describe('引雷阵锋：修复后再损耗不会双计', () => {
  it('攻击 -1（bonus +2）→ 修复 +1（bonus 不变）→ 攻击 -1（bonus +2 → 4）', () => {
    const blade = makeWeapon({ durability: 2, maxDurability: 2 });
    const target = makeMonster('m-repeat', 100, 0);
    const state = makeState({
      equipmentSlot1: blade as EquipmentItem,
      activeCards: activeRowOf(target),
      combatState: {
        ...initialCombatState,
        heroAttacksRemaining: 5,
        heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
        engagedMonsterIds: [target.id],
      } as any,
      globalMineDamageBonus: 0,
    });

    // 攻击 1 → bonus +2
    const r1 = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: target.id,
    });
    const s1 = drain(r1.state, r1.enqueuedActions ?? []).state;
    expect(s1.globalMineDamageBonus).toBe(2);

    // 修复 +1 → bonus 不变
    const r2 = reduce(s1, {
      type: 'MODIFY_EQUIPMENT_DURABILITY',
      slotId: 'equipmentSlot1',
      delta: 1,
    });
    expect(r2.state.equipmentSlot1?.durability).toBe(2);
    expect(r2.state.globalMineDamageBonus).toBe(2);

    // 攻击 2（重置 heroAttacksThisTurn）→ bonus +2 → 4
    const s2: GameState = {
      ...r2.state,
      combatState: {
        ...r2.state.combatState,
        heroAttacksRemaining: 5,
        heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
      } as any,
    };
    const r3 = reduce(s2, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: target.id,
    });
    const s3 = drain(r3.state, r3.enqueuedActions ?? []).state;
    expect(s3.globalMineDamageBonus).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 9) Upgrade behavior (lvl 0 → lvl 1 → lvl 2)
// ---------------------------------------------------------------------------

describe('引雷阵锋 升级：lvl 0 → 1 → 2 stats / mineDamageBoostPerDur', () => {
  it('lvl 0：3 攻 / 2 耐 / mineDamageBoostPerDur=2', () => {
    const blade = makeWeapon();
    expect(blade.value).toBe(3);
    expect(blade.maxDurability).toBe(2);
    expect((blade as any).mineDamageBoostPerDur).toBe(2);
    expect(blade.upgradeLevel ?? 0).toBe(0);
  });

  it('lvl 0 → 1：攻 / boost 不变；耐久 2/2 → 3/3', () => {
    const blade = makeWeapon();
    const state = makeState({ handCards: [blade] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: blade.id });

    const upgraded = result.state.handCards.find(c => c.id === blade.id) as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.value).toBe(3); // 攻击不变
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(3); // preserve+delta：原 2/2 → 3/3
    expect(upgraded.mineDamageBoostPerDur).toBe(2); // boost 仍是 2
  });

  it('lvl 1 → 2：攻 / 耐 不变；mineDamageBoostPerDur 2 → 3', () => {
    const blade = makeWeapon({ upgradeLevel: 1, durability: 3, maxDurability: 3, mineDamageBoostPerDur: 2 });
    const state = makeState({ handCards: [blade] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: blade.id });

    const upgraded = result.state.handCards.find(c => c.id === blade.id) as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(3);
    expect(upgraded.maxDurability).toBe(3); // 不变
    expect(upgraded.durability).toBe(3); // 不变
    expect(upgraded.mineDamageBoostPerDur).toBe(3);
  });

  it('lvl 2 攻击 1 次 → bonus +3（不是 +2）', () => {
    const blade = makeWeapon({ upgradeLevel: 2, durability: 3, maxDurability: 3, mineDamageBoostPerDur: 3 });
    const target = makeMonster('m-l2', 100, 0);
    const state = makeState({
      equipmentSlot1: blade as EquipmentItem,
      activeCards: activeRowOf(target),
      combatState: {
        ...initialCombatState,
        heroAttacksRemaining: 1,
        heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
        engagedMonsterIds: [target.id],
      } as any,
      globalMineDamageBonus: 0,
    });

    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: target.id,
    });
    const finalState = drain(result.state, result.enqueuedActions ?? []).state;

    expect(finalState.globalMineDamageBonus).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 10) Card identity assertions (deck definition correctness)
// ---------------------------------------------------------------------------

describe('引雷阵锋 卡牌定义', () => {
  it('knightEffect routes to knight:thunder-array-blade upgrade handler', () => {
    const blade = makeWeapon();
    // 升级一次确认 handler 被调用（如果 handler 没找到，maxDurability 不会从 2 涨到 3）
    const state = makeState({ handCards: [blade] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: blade.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.maxDurability).toBe(3);
  });
});
