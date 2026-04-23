/**
 * Monster equipment armor refresh on durability tick.
 *
 * 玩家报告的 bug：monster 装备攻击后耐久 -1，但护甲值仍然保持上一次格挡之后
 * 被啃到的残值，没有"按新血层重置"。比如一只 7攻 7护甲 2耐久 的装备，先被
 * 用作护盾吃了一次伤害（armor 7→4），再用作武器攻击一次（durability 2→1），
 * 此时显示应该是 7攻 7护甲 1耐久（armor 回满，因为这是新血层）。旧逻辑下
 * 还显示 7攻 4护甲 1耐久，护盾下次格挡也会从 4 起算 —— 跟护盾装备的行为
 * 不一致。
 *
 * 修复：computeDurabilityLossEffects 在返回 updatedItem 之前，对 monster
 * 装备 strip `armor` / `armorBonusDamaged`，让下一次读取走 baseArmorMax
 * (= hp ?? value) + 永久/临时护甲加成 的回满路径。这跟 combat.ts shield-
 * block 路径里"armor 打穿后重新洗牌"的语义对齐，覆盖所有 caller：
 * - 武器攻击 durability tick (combat.ts ~L2745)
 * - 护盾格挡 durability tick (combat.ts ~L3437，原本就有外层手动 strip，
 *   现在变成 redundant 但安全)
 * - shield-self-damage (shield-self-damage.ts ~L213，同上)
 *
 * 不变量验证：
 *   1. monster 装备攻击后 durability 减 1，armor 字段被剥离 → 下次读取回满
 *   2. monster 装备攻击后 armorBonusDamaged 字段也被剥离 → perm/temp 加成
 *      的"已被消耗"账本清零，新血层重新走 perm + temp 全额
 *   3. 非 monster 类型不受影响（早返回路径已经覆盖）
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { computeDurabilityLossEffects } from '../rules/equipment-effects';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as ActiveRowSlots,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    rng: createRng(42),
    ...overrides,
  };
}

function makeTargetMonster(id: string, hp: number = 5): GameCardData {
  return {
    id,
    type: 'monster',
    name: `Target-${id}`,
    value: 0,
    image: '',
    hp,
    maxHp: hp,
    attack: 0,
    fury: 1,
    currentLayer: 1,
  } as GameCardData;
}

function makeMonsterEquip(overrides: Record<string, unknown> = {}): EquipmentItem {
  // 7 attack, 7 armor (= hp), 2 durability — matches 玩家给的例子的 baseline
  return {
    id: 'me-7-7-2',
    type: 'monster',
    name: 'Test Beast',
    value: 7,
    image: '',
    attack: 7,
    hp: 7,
    maxHp: 7,
    fury: 2,
    durability: 2,
    maxDurability: 2,
    currentLayer: 1,
    ...overrides,
  } as unknown as EquipmentItem;
}

// ---------------------------------------------------------------------------
// Direct unit test on computeDurabilityLossEffects — cheapest assertion that
// the strip happens regardless of which caller invokes it.
// ---------------------------------------------------------------------------

describe('computeDurabilityLossEffects — monster equip armor refresh on tick', () => {
  it('strips chipped armor field from updatedItem so next read refills to baseArmorMax', () => {
    const equip: GameCardData = {
      ...makeMonsterEquip(),
      armor: 4, // 之前格挡被啃到 4
    } as unknown as GameCardData;

    const state = makeState({ equipmentSlot1: equip as EquipmentItem });

    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', equip, 1);

    // armor 字段必须被剥离，下次格挡读到的就是 baseArmorMax (hp=7) + bonuses
    expect((result.updatedItem as any).armor).toBeUndefined();
    // durability 已经按入参更新
    expect(result.updatedItem.durability).toBe(1);
    // attack / hp / 其它身份字段不动
    expect((result.updatedItem as any).attack).toBe(7);
    expect((result.updatedItem as any).hp).toBe(7);
  });

  it('also strips armorBonusDamaged so perm/temp bonus pool resets for new layer', () => {
    const equip: GameCardData = {
      ...makeMonsterEquip(),
      armor: 4,
      armorBonusDamaged: 3, // 之前共享池里 perm/temp 已被啃 3
    } as unknown as GameCardData;

    const state = makeState({ equipmentSlot1: equip as EquipmentItem });

    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', equip, 1);

    expect((result.updatedItem as any).armor).toBeUndefined();
    expect((result.updatedItem as any).armorBonusDamaged).toBeUndefined();
  });

  it('non-monster type (weapon) returns updatedItem unchanged (early return)', () => {
    // 普通武器没有 armor 字段，不该被这条规则影响。
    const sword: GameCardData = {
      id: 'w1', type: 'weapon', name: 'Sword', value: 4, image: '',
      durability: 2, maxDurability: 3,
    };
    const state = makeState({ equipmentSlot1: sword as EquipmentItem });

    const result = computeDurabilityLossEffects(state, 'equipmentSlot1', sword, 1);

    // updatedItem 就是 sword + new durability，没有任何 monster-equip 处理
    expect(result.updatedItem.durability).toBe(1);
    expect((result.updatedItem as any).type).toBe('weapon');
  });
});

// ---------------------------------------------------------------------------
// End-to-end: PERFORM_HERO_ATTACK with monster equipment that has chipped
// armor → after attack ticks durability, slot's armor field is stripped so
// next combat read sees baseArmorMax + perm + temp.
// ---------------------------------------------------------------------------

describe('PERFORM_HERO_ATTACK e2e: monster equip 7攻 7护甲 2耐久 (chipped to 4 armor)', () => {
  it('after attack: durability 2→1, armor field stripped (next read refills to 7)', () => {
    const beast = {
      ...makeMonsterEquip({ id: 'me-attack' }),
      armor: 4, // 之前被格挡啃到的残值
    } as unknown as EquipmentItem;
    const target = makeTargetMonster('victim', 100); // 大血怪，吃 7 伤害不死

    const state = makeState({
      equipmentSlot1: beast,
      activeCards: [target, null, null, null, null] as ActiveRowSlots,
      combatState: {
        ...initialCombatState,
        heroAttacksRemaining: 1,
        heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
        engagedMonsterIds: [target.id],
      },
    });

    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: target.id,
    });
    const finalState = drain(result.state, result.enqueuedActions ?? []).state;

    const finalEquip = finalState.equipmentSlot1 as any;
    expect(finalEquip).not.toBeNull();
    expect(finalEquip.durability).toBe(1);
    // 关键断言：armor 字段必须被剥离，下次读取从 hp=7 起算
    expect(finalEquip.armor).toBeUndefined();
    expect(finalEquip.armorBonusDamaged).toBeUndefined();
    // 攻击力身份字段不动
    expect(finalEquip.attack).toBe(7);
    expect(finalEquip.hp).toBe(7);
  });

  it('with perm + temp armor bonus: armorBonusDamaged also stripped so bonus pool refills', () => {
    const beast = {
      ...makeMonsterEquip({ id: 'me-bonus' }),
      armor: 2, // base armor 啃到 2
      armorBonusDamaged: 3, // perm+temp 共享池被啃 3
    } as unknown as EquipmentItem;
    const target = makeTargetMonster('victim2', 100);

    const state = makeState({
      equipmentSlot1: beast,
      activeCards: [target, null, null, null, null] as ActiveRowSlots,
      combatState: {
        ...initialCombatState,
        heroAttacksRemaining: 1,
        heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
        engagedMonsterIds: [target.id],
      },
      // 额外加 perm 护甲 +2、temp 护甲 +1 在该栏
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 0, shield: 2 },
        equipmentSlot2: { damage: 0, shield: 0 },
      },
      slotTempArmor: { equipmentSlot1: 1, equipmentSlot2: 0 },
    });

    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: target.id,
    });
    const finalState = drain(result.state, result.enqueuedActions ?? []).state;

    const finalEquip = finalState.equipmentSlot1 as any;
    expect(finalEquip).not.toBeNull();
    expect(finalEquip.durability).toBe(1);
    expect(finalEquip.armor).toBeUndefined();
    expect(finalEquip.armorBonusDamaged).toBeUndefined();
    // 永久/临时加成本身没动
    expect(finalState.equipmentSlotBonuses.equipmentSlot1.shield).toBe(2);
    expect(finalState.slotTempArmor?.equipmentSlot1).toBe(1);
  });
});
