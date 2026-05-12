/**
 * Feature: 击杀建筑（含幽灵建筑）时，伤害超过血量也应触发超杀。
 *
 * Background: 历史上 PERFORM_HERO_ATTACK 用 `if (!isBuildingTarget)` gate 跳过
 * overkill 计算；DEAL_DAMAGE_TO_MONSTER 的 building 早返分支也压根不算超杀。
 * 这导致：用大伤害武器或法术超杀建筑（增幅祭坛 / 命运之刃 / 诅咒碑 / 地雷 /
 * 破印祭坛）时——
 *   - 没有「超杀！」log
 *   - 生命之符 / 永久超杀吸血 不回血
 *   - 圣光之刃 (overkillDraw) 不抽牌
 *   - 噬魂猎刃 (overkillRecycleToHand) 不回收回手牌
 *   - 魔弹冶刃 (overkillAmplifyMissile) 不增幅魔弹
 *
 * Fix: 解除 gate；建筑跟怪物同样按 hp 判超额伤害。
 *   - PERFORM_HERO_ATTACK：所有 5 条衍生效果（lifesteal + 4 个武器字段）
 *   - DEAL_DAMAGE_TO_MONSTER（法术 / 直伤）：只触发 log + lifesteal（武器衍生
 *     效果不属于法术路径，按现有架构不在这里触发）
 *   - APPLY_SHIELD_REFLECT：原本就没 gate，行为不变（已有覆盖 in
 *     overkill-all-paths.test.ts）
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState, HAND_LIMIT } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput',
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    ...overrides,
  };
}

const lifeAmulet = () => ({
  id: 'a-life',
  type: 'amulet' as const,
  name: '生命之符',
  value: 0,
  amuletEffect: 'life',
});

// 幽灵建筑：增幅祭坛风格（hp 2 / hpLayers 1）
function makeGhostBuilding(id = 'b-ghost', hp = 2): GameCardData {
  return {
    id,
    type: 'building' as any,
    name: '增幅祭坛',
    value: 0,
    image: '',
    isGhost: true,
    fury: 1,
    hpLayers: 1,
    currentLayer: 1,
    hp,
    maxHp: hp,
  } as GameCardData;
}

// 非幽灵建筑：破印祭坛风格（hp 6）
function makeNonGhostBuilding(id = 'b-seal', hp = 6): GameCardData {
  return {
    id,
    type: 'building' as any,
    name: '破印祭坛',
    value: 0,
    image: '',
    fury: 1,
    hpLayers: 1,
    currentLayer: 1,
    hp,
    maxHp: hp,
  } as GameCardData;
}

const heroAttackAction = (
  slotId: 'equipmentSlot1' | 'equipmentSlot2',
  targetId: string,
): GameAction =>
  ({ type: 'PERFORM_HERO_ATTACK', slotId, targetMonsterId: targetId } as any);

// ---------------------------------------------------------------------------
// PERFORM_HERO_ATTACK on building
// ---------------------------------------------------------------------------

describe('overkill on building — PERFORM_HERO_ATTACK', () => {
  it('ghost building: overkill log fires when damage > hp (即使没装超杀效果)', () => {
    const weapon = {
      id: 'w', type: 'weapon' as const, name: '巨剑', value: 10,
      durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
    };
    const state = makeState({
      hp: 10,
      equipmentSlot1: weapon as any,
      activeCards: [makeGhostBuilding('b1', 2), null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
    });
    const drained = drain(state, [heroAttackAction('equipmentSlot1', 'b1')]);

    const overkillLog = drained.sideEffects.find(
      e => e.event === 'log:entry' && (e.payload as any)?.message?.startsWith('超杀！'),
    );
    expect(overkillLog).toBeDefined();
    expect((overkillLog!.payload as any).message).toContain('巨剑');
    expect((overkillLog!.payload as any).message).toContain('增幅祭坛');
    // damage 10 - hp 2 = 8 点超额
    expect((overkillLog!.payload as any).message).toContain('8');
    // 建筑被毁坏
    expect(drained.sideEffects.some(e => e.event === 'combat:buildingDestroyed')).toBe(true);
  });

  it('non-ghost building (破印祭坛): overkill log fires when damage > hp', () => {
    const weapon = {
      id: 'w', type: 'weapon' as const, name: '巨剑', value: 10,
      durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
    };
    const state = makeState({
      hp: 10,
      equipmentSlot1: weapon as any,
      activeCards: [makeNonGhostBuilding('b1', 6), null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
    });
    const drained = drain(state, [heroAttackAction('equipmentSlot1', 'b1')]);

    const overkillLog = drained.sideEffects.find(
      e => e.event === 'log:entry' && (e.payload as any)?.message?.startsWith('超杀！'),
    );
    expect(overkillLog).toBeDefined();
    expect((overkillLog!.payload as any).message).toContain('破印祭坛');
    // damage 10 - hp 6 = 4 点超额
    expect((overkillLog!.payload as any).message).toContain('4');
    expect(drained.sideEffects.some(e => e.event === 'combat:buildingDestroyed')).toBe(true);
  });

  it('exact-kill on building: 伤害 == hp 不触发超杀', () => {
    const weapon = {
      id: 'w', type: 'weapon' as const, name: '匕首', value: 2,
      durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
    };
    const state = makeState({
      hp: 10,
      equipmentSlot1: weapon as any,
      amuletSlots: [lifeAmulet() as any],
      activeCards: [makeGhostBuilding('b1', 2), null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
    });
    const drained = drain(state, [heroAttackAction('equipmentSlot1', 'b1')]);

    const overkillLog = drained.sideEffects.find(
      e => e.event === 'log:entry' && (e.payload as any)?.message?.startsWith('超杀！'),
    );
    expect(overkillLog).toBeUndefined();
    // 建筑仍然被毁坏
    expect(drained.sideEffects.some(e => e.event === 'combat:buildingDestroyed')).toBe(true);
    // 没回血
    expect(drained.state.hp).toBe(10);
  });

  it('partial damage on building: 不超杀，no log，建筑存活扣 hp', () => {
    const weapon = {
      id: 'w', type: 'weapon' as const, name: '匕首', value: 2,
      durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
    };
    const state = makeState({
      hp: 10,
      equipmentSlot1: weapon as any,
      amuletSlots: [lifeAmulet() as any],
      activeCards: [makeNonGhostBuilding('b1', 6), null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
    });
    const drained = drain(state, [heroAttackAction('equipmentSlot1', 'b1')]);

    const overkillLog = drained.sideEffects.find(
      e => e.event === 'log:entry' && (e.payload as any)?.message?.startsWith('超杀！'),
    );
    expect(overkillLog).toBeUndefined();
    // 建筑存活：hp 6 - 2 = 4
    const building = (drained.state.activeCards as any[]).find(c => c?.id === 'b1');
    expect(building).toBeDefined();
    expect(building.hp).toBe(4);
    // 没回血
    expect(drained.state.hp).toBe(10);
  });

  it('life amulet heals on building overkill (lifeOverkillBonus = 3)', () => {
    const weapon = {
      id: 'w', type: 'weapon' as const, name: '巨剑', value: 10,
      durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
    };
    const state = makeState({
      hp: 10,
      equipmentSlot1: weapon as any,
      amuletSlots: [lifeAmulet() as any],
      activeCards: [makeGhostBuilding('b1', 2), null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
    });
    const drained = drain(state, [heroAttackAction('equipmentSlot1', 'b1')]);
    expect(drained.state.hp).toBe(13);
  });

  it('life amulet stacks with permanentSpellLifesteal on building overkill', () => {
    const weapon = {
      id: 'w', type: 'weapon' as const, name: '巨剑', value: 10,
      durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
    };
    const state = makeState({
      hp: 10,
      equipmentSlot1: weapon as any,
      amuletSlots: [lifeAmulet() as any],
      permanentSpellLifesteal: 3,
      activeCards: [makeGhostBuilding('b1', 2), null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
    });
    const drained = drain(state, [heroAttackAction('equipmentSlot1', 'b1')]);
    // lifesteal 3 (life amulet) + 3 (permanent) = 6 → 10 + 6 = 16
    expect(drained.state.hp).toBe(16);
  });

  it('overkillDraw on building: emits drawFromBackpack side effect', () => {
    const weapon = {
      id: 'w', type: 'weapon' as const, name: '试样', value: 10,
      durability: 5, maxDurability: 5, overkillDraw: 1,
      fromSlot: 'equipmentSlot1' as const,
    };
    const state = makeState({
      equipmentSlot1: weapon as any,
      activeCards: [makeGhostBuilding('b1', 2), null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
    });
    const drained = drain(state, [heroAttackAction('equipmentSlot1', 'b1')]);
    const evt = drained.sideEffects.find(
      e => e.event === 'equipment:drawFromBackpack' && (e.payload as any)?.source === 'overkill',
    );
    expect(evt).toBeDefined();
    expect((evt!.payload as any).count).toBe(1);
  });

  it('overkillRecycleToHand on building: cards land in hand', () => {
    const recycledMagic = { id: 'rm1', type: 'magic' as const, name: 'BoltA', value: 0, _recycleWaits: 1 };
    const recycledMagic2 = { id: 'rm2', type: 'magic' as const, name: 'BoltB', value: 0, _recycleWaits: 5 };
    const weapon = {
      id: 'w', type: 'weapon' as const, name: '噬魂猎刃', value: 10,
      durability: 5, maxDurability: 5, overkillRecycleToHand: 2,
      fromSlot: 'equipmentSlot1' as const,
    };
    const state = makeState({
      equipmentSlot1: weapon as any,
      activeCards: [makeGhostBuilding('b1', 2), null, null, null, null] as any,
      permanentMagicRecycleBag: [recycledMagic, recycledMagic2] as any,
      handCards: [] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
    });
    const drained = drain(state, [heroAttackAction('equipmentSlot1', 'b1')]);
    expect(drained.state.handCards).toHaveLength(2);
    expect(drained.state.permanentMagicRecycleBag).toHaveLength(0);
    for (const c of drained.state.handCards as any[]) {
      expect(c._recycleWaits).toBeUndefined();
    }
  });

  it('overkillRecycleToHand on building: respects HAND_LIMIT, overflows to backpack', () => {
    const recycled = (id: string) => ({ id, type: 'magic' as const, name: id, value: 0, _recycleWaits: 1 });
    const weapon = {
      id: 'w', type: 'weapon' as const, name: '噬魂猎刃', value: 10,
      durability: 5, maxDurability: 5, overkillRecycleToHand: 4,
      fromSlot: 'equipmentSlot1' as const,
    };
    const filledHand = Array.from({ length: HAND_LIMIT - 1 }, (_, i) => ({
      id: `h${i}`, type: 'magic' as const, name: `H${i}`, value: 0,
    }));
    const state = makeState({
      equipmentSlot1: weapon as any,
      activeCards: [makeGhostBuilding('b1', 2), null, null, null, null] as any,
      permanentMagicRecycleBag: [recycled('rm1'), recycled('rm2'), recycled('rm3'), recycled('rm4')] as any,
      handCards: filledHand as any,
      backpackItems: [] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
    });
    const drained = drain(state, [heroAttackAction('equipmentSlot1', 'b1')]);
    expect(drained.state.handCards).toHaveLength(HAND_LIMIT);
    expect(drained.state.backpackItems).toHaveLength(3);
    expect(drained.state.permanentMagicRecycleBag).toHaveLength(0);
  });

  it('overkillAmplifyMissile on building: enqueues AMPLIFY_CARDS_BY_NAME', () => {
    const missile = { id: 'b-bolt', type: 'magic' as const, name: '魔弹', value: 0 };
    const weapon = {
      id: 'w', type: 'weapon' as const, name: '魔弹冶刃', value: 10,
      durability: 5, maxDurability: 5, overkillAmplifyMissile: 1,
      fromSlot: 'equipmentSlot1' as const,
    };
    const state = makeState({
      equipmentSlot1: weapon as any,
      activeCards: [makeGhostBuilding('b1', 2), null, null, null, null] as any,
      handCards: [missile] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
    });
    const drained = drain(state, [heroAttackAction('equipmentSlot1', 'b1')]);
    const handMissile = (drained.state.handCards as any[]).find(c => c.id === 'b-bolt');
    expect(handMissile).toBeDefined();
    expect(handMissile.amplifyBonus ?? 0).toBeGreaterThan(0);
  });

  it('NO lifesteal when damage does not overkill the building', () => {
    const weapon = {
      id: 'w', type: 'weapon' as const, name: '匕首', value: 2,
      durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
    };
    const state = makeState({
      hp: 10,
      equipmentSlot1: weapon as any,
      amuletSlots: [lifeAmulet() as any],
      activeCards: [makeNonGhostBuilding('b1', 6), null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
    });
    const drained = drain(state, [heroAttackAction('equipmentSlot1', 'b1')]);
    expect(drained.state.hp).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// DEAL_DAMAGE_TO_MONSTER (spell / direct damage path) on building
// ---------------------------------------------------------------------------

describe('overkill on building — DEAL_DAMAGE_TO_MONSTER (spell path)', () => {
  it('ghost building: overkill log fires on spell overkill', () => {
    const state = makeState({
      hp: 10,
      activeCards: [makeGhostBuilding('b1', 2), null, null, null, null] as any,
    });
    const drained = drain(state, [
      { type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: 'b1', damage: 10, source: '魔弹', isSpellDamage: true } as any,
    ]);
    const overkillLog = drained.sideEffects.find(
      e => e.event === 'log:entry' && (e.payload as any)?.message?.startsWith('超杀！'),
    );
    expect(overkillLog).toBeDefined();
    expect((overkillLog!.payload as any).message).toContain('魔弹');
    expect((overkillLog!.payload as any).message).toContain('增幅祭坛');
    expect((overkillLog!.payload as any).message).toContain('8');
    // 建筑被摧毁
    expect(drained.sideEffects.some(e => e.event === 'combat:buildingDestroyed')).toBe(true);
  });

  it('non-ghost building (破印祭坛): overkill log fires on spell overkill', () => {
    const state = makeState({
      hp: 10,
      activeCards: [makeNonGhostBuilding('b1', 6), null, null, null, null] as any,
    });
    const drained = drain(state, [
      { type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: 'b1', damage: 10, source: '魔弹', isSpellDamage: true } as any,
    ]);
    const overkillLog = drained.sideEffects.find(
      e => e.event === 'log:entry' && (e.payload as any)?.message?.startsWith('超杀！'),
    );
    expect(overkillLog).toBeDefined();
    expect((overkillLog!.payload as any).message).toContain('破印祭坛');
    expect((overkillLog!.payload as any).message).toContain('4');
  });

  it('life amulet heals when spell overkills a building', () => {
    const state = makeState({
      hp: 10,
      amuletSlots: [lifeAmulet() as any],
      activeCards: [makeGhostBuilding('b1', 2), null, null, null, null] as any,
    });
    const drained = drain(state, [
      { type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: 'b1', damage: 10, source: '魔弹', isSpellDamage: true } as any,
    ]);
    expect(drained.state.hp).toBe(13);
  });

  it('exact-kill spell on building: damage == hp 不触发超杀', () => {
    const state = makeState({
      hp: 10,
      amuletSlots: [lifeAmulet() as any],
      activeCards: [makeGhostBuilding('b1', 2), null, null, null, null] as any,
    });
    const drained = drain(state, [
      { type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: 'b1', damage: 2, source: '魔弹', isSpellDamage: true } as any,
    ]);
    const overkillLog = drained.sideEffects.find(
      e => e.event === 'log:entry' && (e.payload as any)?.message?.startsWith('超杀！'),
    );
    expect(overkillLog).toBeUndefined();
    expect(drained.state.hp).toBe(10);
    // 建筑仍被毁坏
    expect(drained.sideEffects.some(e => e.event === 'combat:buildingDestroyed')).toBe(true);
  });

  it('partial spell damage on building: 不超杀，no log，建筑存活扣 hp', () => {
    const state = makeState({
      hp: 10,
      amuletSlots: [lifeAmulet() as any],
      activeCards: [makeNonGhostBuilding('b1', 6), null, null, null, null] as any,
    });
    const drained = drain(state, [
      { type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: 'b1', damage: 3, source: '魔弹', isSpellDamage: true } as any,
    ]);
    const overkillLog = drained.sideEffects.find(
      e => e.event === 'log:entry' && (e.payload as any)?.message?.startsWith('超杀！'),
    );
    expect(overkillLog).toBeUndefined();
    const building = (drained.state.activeCards as any[]).find(c => c?.id === 'b1');
    expect(building).toBeDefined();
    expect(building.hp).toBe(3);
    expect(drained.state.hp).toBe(10);
  });

  it('lifesteal stacks: life amulet + permanentSpellLifesteal on spell overkill', () => {
    const state = makeState({
      hp: 10,
      amuletSlots: [lifeAmulet() as any],
      permanentSpellLifesteal: 2,
      activeCards: [makeGhostBuilding('b1', 2), null, null, null, null] as any,
    });
    const drained = drain(state, [
      { type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: 'b1', damage: 10, source: '魔弹', isSpellDamage: true } as any,
    ]);
    // 3 (life amulet) + 2 (permanent) = 5 → 10 + 5 = 15
    expect(drained.state.hp).toBe(15);
  });
});
