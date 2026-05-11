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
 *   - 调 `computeEquipmentDisplacementLastWords` 触发所有遗言效果
 *     （canonical helper，覆盖 spawn-mine-empty / lastWordsSlotTempBuff /
 *     lastWordsMaxHpBoost / lastWordsGainBolt / graveyard-event-to-hand /
 *     怪物 lastWords / 「墓园守卫」多次触发 / 「绝响之符」per-trigger debuff /
 *     「装备超频」额外触发 / 「怀柔之印」persuade boost 等全部）；
 *   - 检查 hasRevive / hasEquipmentRevive，命中则保留装备并消耗复生次数；
 *   - 否则 enqueue `DISPOSE_EQUIPMENT_CARD { isDestruction: true }`（Perm → 回收袋；
 *     普通 → 坟场），并把后备装备 promote 到主槽。
 *
 * 跟参考实现 `events.ts:discardCurrentLeftForGold+15` 行为对齐
 * （后者也已迁移到 `computeEquipmentDisplacementLastWords`）。
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

  it('onDestroyHeal 触发回血（emit equipment:lastWordsHeal 副作用）', () => {
    // 注：canonical computeEquipmentDisplacementLastWords 对 onDestroyHeal 不直接
    // patch state.hp / enqueue HEAL，而是 emit `equipment:lastWordsHeal` 副作用。
    // 真实游戏里 GameBoard.tsx 的 useGameEvent('equipment:lastWordsHeal') 监听器
    // 会调 healHero(amount) → dispatch HEAL，state.hp 在那一步才变。
    // 这跟 computeEquipmentBreakEffects（自然耐久归零）保持完全一致，避免历史上
    // applyEquipDestroyLastWords 直接 enqueue HEAL 造成的两份实现 drift。
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
    const healSe = result.sideEffects.find(
      se => se.event === 'equipment:lastWordsHeal'
        && (se.payload as { itemName?: string }).itemName === '治疗之盾',
    );
    expect(healSe).toBeDefined();
    expect((healSe!.payload as { amount: number }).amount).toBe(5);
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

// ---------------------------------------------------------------------------
// 回归 (bug history)：殉雷遗盾被命运十字路口破坏时遗言不触发
//
// 历史 bug：reduceSacrificeEquipmentSlot 之前调的是 waterfall.ts 里的残缺
// applyEquipDestroyLastWords，只支持 9 个 onDestroyEffect 分支
// (onDestroyHeal/Gold/Draw/ClassDraw/PermanentDamage/PermanentShield +
//  graveyard-to-hand / stunCap+N / allSlotTempArmor:N)。
//
// spawn-mine-empty / slot-temp-armor-3 / graveyard-event-to-hand /
// lastWordsSlotTempBuff (遗赠淬炼药多层) / lastWordsMaxHpBoost (附魔祭坛多层) /
// lastWordsGainBolt (奥能裂变多层) / 怪物 lastWords (wraith-haunt / wraithDeathHeal /
// skeleton / discard-hand-3) / 「墓园守卫」N+1 次触发 / 「绝响之符」per-trigger
// 全部 fizzle 到 log entry。
//
// 修复：迁移到 canonical computeEquipmentDisplacementLastWords helper，跟
// computeEquipmentBreakEffects 共用同一 applyOneEquipmentLastWordsIteration 内核。
// ---------------------------------------------------------------------------

describe('SACRIFICE_EQUIPMENT_SLOT — onDestroyEffect 完整覆盖（回归）', () => {
  it('殉雷遗盾 (onDestroyEffect: spawn-mine-empty) 被破坏 → active row 空位生成「地雷」', () => {
    const monster = {
      id: 'm-1', type: 'monster', name: 'M', value: 1, image: '',
      hp: 1, maxHp: 1, attack: 1, fury: 1, currentLayer: 1, hpLayers: 1,
    } as GameCardData;
    const shield = makeShield('s-mine', {
      name: '殉雷遗盾',
      onDestroyEffect: 'spawn-mine-empty',
      durability: 1,
      maxDurability: 2,
      armorMax: 3,
    });
    const state = makeState({
      equipmentSlot1: shield as EquipmentItem,
      activeCards: [monster, null, null, null, null] as any,
      phase: 'playerInput' as any,
    });

    const result = drain(state, [
      { type: 'SACRIFICE_EQUIPMENT_SLOT', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    // 装备已经销毁
    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.discardedCards.find(c => c.id === 's-mine')).toBeDefined();

    // 关键断言：active row 某个空位被生成了地雷（type=building / mineDamage=5）
    const activeAfter = result.state.activeCards as readonly (GameCardData | null)[];
    const mineCount = activeAfter.filter(c =>
      c?.type === 'building' && c.name === '地雷' && (c as any).mineDamage === 5,
    ).length;
    expect(mineCount).toBe(1);

    // slot 0 上的怪物没被覆盖
    expect(activeAfter[0]?.id).toBe('m-1');
  });

  it('onDestroyEffect: slot-temp-armor-3 → 该装备栏 +3 临时护甲（历史 bug 也漏过）', () => {
    const shield = makeShield('s-legacy', {
      name: '遗愿重盾',
      onDestroyEffect: 'slot-temp-armor-3',
    });
    const state = makeState({
      equipmentSlot1: shield as EquipmentItem,
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 } as any,
    });

    const result = drain(state, [
      { type: 'SACRIFICE_EQUIPMENT_SLOT', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.slotTempArmor.equipmentSlot1).toBe(3);
  });

  it('lastWordsSlotTempBuff (遗赠淬炼药 2 层) → 该装备栏 +6 临时攻击 +6 临时护甲', () => {
    const shield = makeShield('s-buff', {
      name: 'BuffShield',
      lastWordsSlotTempBuff: 2,
    });
    const state = makeState({
      equipmentSlot1: shield as EquipmentItem,
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 } as any,
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 } as any,
    });

    const result = drain(state, [
      { type: 'SACRIFICE_EQUIPMENT_SLOT', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.slotTempAttack.equipmentSlot1).toBe(6);
    expect(result.state.slotTempArmor.equipmentSlot1).toBe(6);
  });

  it('「墓园守卫」amulet (lastWordsExtraTriggerCount=1) → 遗言触发 2 次', () => {
    // 用 onDestroyDraw 验证多次触发（每次抽 1 张 → 总共 2 张）
    const shield = makeShield('s-extra', {
      name: 'ExtraShield',
      onDestroyDraw: 1,
    });
    const tomb1 = makeShield('bp-1');
    const tomb2 = makeShield('bp-2');
    // 「墓园守卫」amulet
    const graveGuard = {
      id: 'a-grave-guard',
      type: 'amulet',
      name: '墓园守卫',
      value: 0,
      image: '',
      amuletEffect: 'last-words-extra-trigger',
    } as GameCardData;

    const state = makeState({
      equipmentSlot1: shield as EquipmentItem,
      amuletSlots: [graveGuard] as any,
      handCards: [],
      backpackItems: [tomb1, tomb2] as GameCardData[],
      handLimit: 5,
      maxHandSize: 5,
    });

    const result = drain(state, [
      { type: 'SACRIFICE_EQUIPMENT_SLOT', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    // 1 base trigger + 1 extra = 2 次，抽了 2 张
    expect(result.state.handCards).toHaveLength(2);
  });
});
