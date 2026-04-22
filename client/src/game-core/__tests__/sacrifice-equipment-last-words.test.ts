/**
 * Regression: 「献出装备 / 破坏装备」事件路径必须触发装备的 destroy 遗言效果
 *
 * 历史 bug：`useCardOperations.ts:sacrificeEquipment` 直接 dispatch
 * `DISPOSE_EQUIPMENT_CARD { card }`（既无 isDestruction 也无 triggerLastWords），
 * 导致以下两类事件路径下，被献出/破坏的装备的 onDestroyDraw / onDestroyHeal /
 * onDestroyGold / onDestroyClassDraw / onDestroyPermanentDamage / onDestroyPermanentShield /
 * onDestroyEffect / 怪物装备 lastWords 全部静默丢失：
 *
 *   1. 暗影契约「献出装备（破坏任一装备）」(`destroyEquipment:any`)
 *   2. 命运十字路口「破坏下方装备」(`crossroads-destroy-below`)
 *
 * 用户实际报告：`暗影契约 → 献出装备 → 守护之盾(onDestroyDraw:2)` 没有抽 2 张牌。
 *
 * 修复契约：新增 `SACRIFICE_EQUIPMENT_SLOT` action，单一 reducer 内：
 *   - 调 `applyEquipDestroyLastWords` 触发所有遗言效果；
 *   - 检查 hasRevive / hasEquipmentRevive，命中则保留装备并消耗复生次数；
 *   - 否则 enqueue `DISPOSE_EQUIPMENT_CARD { isDestruction: true }`（Perm → 回收袋；
 *     普通 → 坟场），并把后备装备 promote 到主槽。
 *
 * 跟参考实现 `events.ts:discardCurrentLeftForGold+15` 行为对齐。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { GameAction } from '../actions';
import type { EquipmentItem } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeShield(id: string, over?: Partial<GameCardData>): GameCardData {
  return {
    id,
    type: 'shield',
    name: `Shield-${id}`,
    value: 2,
    image: '',
    durability: 2,
    maxDurability: 2,
    armorMax: 2,
    ...(over ?? {}),
  } as GameCardData;
}

function makeWeapon(id: string, over?: Partial<GameCardData>): GameCardData {
  return {
    id,
    type: 'weapon',
    name: `Weapon-${id}`,
    value: 2,
    image: '',
    durability: 2,
    maxDurability: 2,
    ...(over ?? {}),
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// 用户原报告：暗影契约 「献出装备」 破坏「守护之盾」 → 必须抽 2 张牌
// ---------------------------------------------------------------------------

describe('SACRIFICE_EQUIPMENT_SLOT — 触发 destroy 遗言效果', () => {
  it('守护之盾 (onDestroyDraw:2) 被献出 → 从背包抽 2 张牌', () => {
    const guardian = makeShield('guardian', { name: '守护之盾', onDestroyDraw: 2 });
    const draw1 = makeShield('bp-1');
    const draw2 = makeShield('bp-2');
    const draw3 = makeShield('bp-3');
    const state = makeState({
      equipmentSlot1: guardian as EquipmentItem,
      handCards: [],
      backpackItems: [draw1, draw2, draw3] as GameCardData[],
      handLimit: 5,
      maxHandSize: 5,
    });

    const result = drain(state, [
      { type: 'SACRIFICE_EQUIPMENT_SLOT', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.handCards).toHaveLength(2);
    expect(result.state.discardedCards.find(c => c.id === 'guardian')).toBeDefined();
  });

  it('onDestroyHeal 触发回血', () => {
    const healer = makeShield('healer', { name: '治疗之盾', onDestroyHeal: 5 });
    const state = makeState({
      equipmentSlot1: healer as EquipmentItem,
      hp: 10,
      maxHp: 30,
    });

    const result = drain(state, [
      { type: 'SACRIFICE_EQUIPMENT_SLOT', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.hp).toBe(15);
  });

  it('onDestroyGold 触发金币奖励', () => {
    const greedy = makeShield('greedy', { name: '贪婪之盾', onDestroyGold: 7 });
    const state = makeState({
      equipmentSlot1: greedy as EquipmentItem,
      gold: 10,
    });

    const result = drain(state, [
      { type: 'SACRIFICE_EQUIPMENT_SLOT', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.gold).toBe(17);
    expect(result.state.equipmentSlot1).toBeNull();
  });

  it('onDestroyPermanentShield 给该装备栏永久护甲加成', () => {
    const legacy = makeShield('legacy', { name: '传承之盾', onDestroyPermanentShield: 2 });
    const state = makeState({
      equipmentSlot2: legacy as EquipmentItem,
    });
    const beforeShield = state.equipmentSlotBonuses.equipmentSlot2.shield;

    const result = drain(state, [
      { type: 'SACRIFICE_EQUIPMENT_SLOT', slotId: 'equipmentSlot2' } as GameAction,
    ]);

    expect(result.state.equipmentSlotBonuses.equipmentSlot2.shield).toBe(beforeShield + 2);
    expect(result.state.equipmentSlot2).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Revive 路径 —— 与 events.ts:discardCurrentLeftForGold+15 对齐
// ---------------------------------------------------------------------------

describe('SACRIFICE_EQUIPMENT_SLOT — 复生路径', () => {
  it('hasEquipmentRevive 装备被献出 → 复生（durability=1，留在装备栏，equipmentReviveUsed:true）', () => {
    const hammer = makeWeapon('immortal', {
      name: '不灭之锤',
      hasEquipmentRevive: true,
      durability: 2,
      maxDurability: 2,
    });
    const state = makeState({
      equipmentSlot1: hammer as EquipmentItem,
    });

    const result = drain(state, [
      { type: 'SACRIFICE_EQUIPMENT_SLOT', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.equipmentSlot1).not.toBeNull();
    expect(result.state.equipmentSlot1!.id).toBe('immortal');
    expect(result.state.equipmentSlot1!.durability).toBe(1);
    expect((result.state.equipmentSlot1 as any).equipmentReviveUsed).toBe(true);
    expect(result.state.discardedCards.find(c => c.id === 'immortal')).toBeUndefined();
  });

  it('hasEquipmentRevive 已用完，再次献出 → 真破坏（清栏 + onDestroyDraw 触发）', () => {
    const hammer = makeWeapon('immortal', {
      name: '不灭之锤',
      hasEquipmentRevive: true,
      equipmentReviveUsed: true,
      onDestroyDraw: 1,
      durability: 1,
      maxDurability: 2,
    });
    const draw1 = makeShield('bp-1');
    const state = makeState({
      equipmentSlot1: hammer as EquipmentItem,
      handCards: [],
      backpackItems: [draw1] as GameCardData[],
      handLimit: 5,
      maxHandSize: 5,
    });

    const result = drain(state, [
      { type: 'SACRIFICE_EQUIPMENT_SLOT', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.handCards).toHaveLength(1);
    expect(result.state.discardedCards.find(c => c.id === 'immortal')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 后备槽 promote 路径
// ---------------------------------------------------------------------------

describe('SACRIFICE_EQUIPMENT_SLOT — 后备装备 promote', () => {
  it('破坏主槽装备时，最顶部的后备装备升上来', () => {
    const main = makeShield('main', { name: '主盾', onDestroyDraw: 1 });
    const reserve1 = makeShield('reserve-1', { name: '备1' });
    const reserve2 = makeShield('reserve-2', { name: '备2' });
    const draw = makeShield('bp-1');

    const state = makeState({
      equipmentSlot1: main as EquipmentItem,
      equipmentSlot1Reserve: [reserve1, reserve2] as EquipmentItem[],
      handCards: [],
      backpackItems: [draw] as GameCardData[],
      handLimit: 5,
      maxHandSize: 5,
    });

    const result = drain(state, [
      { type: 'SACRIFICE_EQUIPMENT_SLOT', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.equipmentSlot1).not.toBeNull();
    expect(result.state.equipmentSlot1!.id).toBe('reserve-2');
    expect(result.state.equipmentSlot1Reserve).toHaveLength(1);
    expect(result.state.equipmentSlot1Reserve[0].id).toBe('reserve-1');
    expect(result.state.handCards).toHaveLength(1);
    expect(result.state.discardedCards.find(c => c.id === 'main')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Perm 路由 —— 与 perm-routing-on-discard 规则一致
// ---------------------------------------------------------------------------

describe('SACRIFICE_EQUIPMENT_SLOT — Perm 装备进回收袋', () => {
  it('永恒铭刻（recycleDelay=2）的装备被献出 → 回收袋而非坟场', () => {
    const perm = makeShield('perm-shield', {
      name: '永恒铭刻盾',
      recycleDelay: 2,
      onDestroyDraw: 1,
    });
    const draw = makeShield('bp-1');
    const state = makeState({
      equipmentSlot1: perm as EquipmentItem,
      handCards: [],
      backpackItems: [draw] as GameCardData[],
      discardedCards: [],
      permanentMagicRecycleBag: [],
      handLimit: 5,
      maxHandSize: 5,
    });

    const result = drain(state, [
      { type: 'SACRIFICE_EQUIPMENT_SLOT', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === 'perm-shield')).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === 'perm-shield')).toBeUndefined();
    expect(result.state.handCards).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 边界：空槽
// ---------------------------------------------------------------------------

describe('SACRIFICE_EQUIPMENT_SLOT — 边界', () => {
  it('空装备槽 → no-op，不触发任何效果', () => {
    const state = makeState({
      equipmentSlot1: null,
      handCards: [],
      backpackItems: [],
      gold: 10,
      hp: 20,
      maxHp: 30,
    });

    const result = drain(state, [
      { type: 'SACRIFICE_EQUIPMENT_SLOT', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.handCards).toHaveLength(0);
    expect(result.state.gold).toBe(10);
    expect(result.state.hp).toBe(20);
  });
});
