/**
 * Reflect-damage routing onto shield armor — bonus-first + durability tick + break.
 *
 * Tests the rewritten `routeReflectDamageToHero` (rules/combat.ts) which is shared by
 * Golem 岩层反震 / 龙息反击 / 反魔 三条反伤路径.
 *
 * Bug history:
 *   #2 反伤直接扣 base armor，无视 permanentBonus / slotTempArmor / armorBonusDamaged
 *      → 双守护圣盾 / 攻防协律 给的 bonus 都被绕过.
 *   #3 反伤打穿护甲后只重置 armor 字段，**不**扣 durability、**不**走
 *      computeEquipmentBreakEffects → 铁壁塔盾被反魔打完护甲既不耗耐久也不进坟场.
 *
 * Fix: routeReflectDamageToHero 现在镜像 reduceResolveBlock 的护甲会计：
 *   - bonus-first 扣减（先消 permanentBonus + slotTempArmor，再扣 base）
 *   - 护甲打穿 → durability -1; durability=0 → computeEquipmentBreakEffects 路由
 *   - 不破之印 (unbreakableNext / unbreakableUntilWaterfall) 仍然保耐久
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { routeReflectDamageToHero } from '../rules/combat';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as ActiveRowSlots,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    rng: createRng(7),
    ...overrides,
  };
}

function makeShield(over?: Partial<GameCardData>): GameCardData {
  return {
    id: 's', type: 'shield', name: '木盾', value: 5,
    armor: 5, armorMax: 5,
    durability: 3, maxDurability: 3,
    image: '',
    fromSlot: 'equipmentSlot2',
    ...over,
  } as GameCardData;
}

describe('routeReflectDamageToHero — bonus-first armor consumption (bug #2)', () => {
  it('反伤先扣 permanentBonus（双守护圣盾），base armor 不动', () => {
    const shield = makeShield({ armor: 5, armorMax: 5 });
    const state = makeState({
      hp: 20,
      equipmentSlot1: null as any,
      equipmentSlot2: shield as any,
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 0, shield: 0 },
        equipmentSlot2: { damage: 0, shield: 2 }, // 双守护圣盾过 2 次完美格挡 → +2 永久护甲
      } as any,
    });

    const route = routeReflectDamageToHero(state, 2, 'Golem', '反魔');

    const updated = route.patch.equipmentSlot2 as GameCardData;
    expect(updated.armor).toBe(5);              // base 不动
    expect(updated.armorBonusDamaged).toBe(2);  // 2 全部从 bonus 扣
    expect(updated.durability).toBe(3);         // 没打穿 armor，durability 不变
    expect(route.hitSlotId).toBe('equipmentSlot2');
    expect(state.hp).toBe(20);                  // hero hp 不动
  });

  it('反伤先消 slotTempArmor（攻防协律给的临护），base armor 不动', () => {
    const shield = makeShield({ armor: 5, armorMax: 5 });
    const state = makeState({
      hp: 20,
      equipmentSlot1: null as any,
      equipmentSlot2: shield as any,
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 3 } as any, // 攻防协律 +3
    });

    const route = routeReflectDamageToHero(state, 3, 'Golem', '反魔');

    const updated = route.patch.equipmentSlot2 as GameCardData;
    expect(updated.armor).toBe(5);
    expect(updated.armorBonusDamaged).toBe(3);
    expect(updated.durability).toBe(3);
  });

  it('bonus 不够时溢出到 base：dmg 5 > bonus 2 → bonus 全消 + base -3', () => {
    const shield = makeShield({ armor: 5, armorMax: 5 });
    const state = makeState({
      equipmentSlot1: null as any,
      equipmentSlot2: shield as any,
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 0, shield: 0 },
        equipmentSlot2: { damage: 0, shield: 2 },
      } as any,
    });

    const route = routeReflectDamageToHero(state, 5, 'Golem', '反魔');

    const updated = route.patch.equipmentSlot2 as GameCardData;
    expect(updated.armor).toBe(2);              // base 5 - 3 = 2
    expect(updated.armorBonusDamaged).toBe(2);  // bonus 全消
  });

  it('已有 armorBonusDamaged 时，bonusRemaining = max(0, bonusTotal - existing)', () => {
    // 上一回合用 攻防协律 +2 后被怪打了 1 → armorBonusDamaged = 1
    // 本回合再来反伤 1 → 应该消 bonusRemaining (1) → bonus 完全 damaged，base 不动
    const shield = makeShield({ armor: 5, armorMax: 5, armorBonusDamaged: 1 });
    const state = makeState({
      equipmentSlot1: null as any,
      equipmentSlot2: shield as any,
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 2 } as any,
    });

    const route = routeReflectDamageToHero(state, 1, 'Golem', '反魔');

    const updated = route.patch.equipmentSlot2 as GameCardData;
    expect(updated.armor).toBe(5);
    expect(updated.armorBonusDamaged).toBe(2);
    expect(updated.durability).toBe(3);
  });
});

describe('routeReflectDamageToHero — armor depleted ticks durability (bug #3)', () => {
  it('多血层盾：armor 打穿 → durability -1，armor / armorBonusDamaged 重置', () => {
    const shield = makeShield({
      id: 's-multi', name: '多层木盾', value: 3,
      armor: 3, armorMax: 3,
      durability: 3, maxDurability: 3,
    });
    const state = makeState({
      equipmentSlot1: null as any,
      equipmentSlot2: shield as any,
    });

    const route = routeReflectDamageToHero(state, 3, 'Golem', '反魔');

    const updated = route.patch.equipmentSlot2 as GameCardData;
    expect(updated.durability).toBe(2);                       // 血层 -1
    expect(updated.armor).toBeUndefined();                    // armor 字段已剥离 → 下次刷满
    expect(updated.armorBonusDamaged).toBeUndefined();        // bonus 累计也清零
  });

  it('铁壁塔盾 (durability 1) 被反魔打穿 → durability=0 → 入坟场', () => {
    const ironTower: GameCardData = {
      id: 's-iron', type: 'shield', name: '铁壁塔盾', value: 5,
      armor: 5, armorMax: 5,
      durability: 1, maxDurability: 1,
      knightEffect: 'fullBlock',
      image: '',
      fromSlot: 'equipmentSlot2',
    } as GameCardData;
    const state = makeState({
      hp: 20,
      equipmentSlot1: null as any,
      equipmentSlot2: ironTower as any,
    });

    // 直接 reduce 一条 APPLY_ANTI_MAGIC_REFLECT 不存在；用 drain 走 magic-finalize
    // 太重；这里 routeReflectDamageToHero 自己 patch + enqueue，把它走进 drain。
    const route = routeReflectDamageToHero(state, 5, 'Golem', '反魔');

    // 应用 patch 看最终状态
    const finalState = { ...state, ...route.patch };
    expect(finalState.equipmentSlot2).toBeNull();
    expect(finalState.discardedCards.some(c => c.id === 's-iron')).toBe(true);
    expect(route.hitSlotId).toBe('equipmentSlot2');
    expect(state.hp).toBe(20);                                // 反魔被盾完全吸收，hp 不动
  });

  it('反伤超过 currentArmor：溢出被盾完全吸收，hp 不再受额外伤害', () => {
    // 保留旧行为：reflect 路径不让溢出穿到 hero（与无盾兜底分支区分）
    const shield = makeShield({
      id: 's-thin', name: '薄盾', value: 2,
      armor: 2, armorMax: 2,
      durability: 1, maxDurability: 1,
    });
    const state = makeState({
      hp: 20,
      equipmentSlot1: null as any,
      equipmentSlot2: shield as any,
    });

    const route = routeReflectDamageToHero(state, 100, 'Golem', '反魔');

    const finalState = { ...state, ...route.patch };
    expect(finalState.equipmentSlot2).toBeNull();              // 盾被销毁
    expect(finalState.discardedCards.some(c => c.id === 's-thin')).toBe(true);
    // hp 通过 enqueue APPLY_DAMAGE 加伤害？不应该
    const hpDmg = route.enqueuedActions.find(a => a.type === 'APPLY_DAMAGE');
    expect(hpDmg).toBeUndefined();
  });

  it('不破之印 (unbreakableNext) 保耐久 + 重置 armor', () => {
    const ironTower: GameCardData = {
      id: 's-iron', type: 'shield', name: '铁壁塔盾', value: 5,
      armor: 5, armorMax: 5,
      durability: 1, maxDurability: 1,
      knightEffect: 'fullBlock',
      image: '',
      fromSlot: 'equipmentSlot2',
    } as GameCardData;
    const state = makeState({
      equipmentSlot1: null as any,
      equipmentSlot2: ironTower as any,
      unbreakableNext: true,
    });

    const route = routeReflectDamageToHero(state, 5, 'Golem', '反魔');

    const updated = route.patch.equipmentSlot2 as GameCardData;
    expect(updated.durability).toBe(1);                       // 不破之印保住
    expect(updated.armor).toBeUndefined();                    // armor 重置 → 下次刷满
    expect(route.patch.unbreakableNext).toBe(false);          // 一次性消耗
  });
});

describe('routeReflectDamageToHero — 无盾兜底分支不变', () => {
  it('两栏都没护盾 → enqueue APPLY_DAMAGE 走 hero hp', () => {
    const state = makeState({
      hp: 20,
      equipmentSlot1: null as any,
      equipmentSlot2: null as any,
    });

    const route = routeReflectDamageToHero(state, 4, 'Golem', '反魔');

    expect(route.hitSlotId).toBeNull();
    expect(route.enqueuedActions.length).toBe(1);
    expect(route.enqueuedActions[0]).toMatchObject({ type: 'APPLY_DAMAGE', amount: 4 });
  });
});

describe('routeReflectDamageToHero — 端到端通过反魔路径 (drain)', () => {
  it('反魔怪 + 铁壁塔盾 (dur 1) + 玩家施法 → 盾打穿 + 进坟场', () => {
    // 构造一张 magic 卡触发 anti-magic reflect 路径
    // 直接在 hand 放一张 magic 卡，drain RESOLVE_MAGIC
    const ironTower: GameCardData = {
      id: 's-iron', type: 'shield', name: '铁壁塔盾', value: 5,
      armor: 5, armorMax: 5,
      durability: 1, maxDurability: 1,
      knightEffect: 'fullBlock',
      image: '',
      fromSlot: 'equipmentSlot2',
    } as GameCardData;

    const golem: GameCardData = {
      id: 'm-anti', type: 'monster', name: 'Anti-Magic Golem', value: 1,
      hp: 5, maxHp: 5, currentLayer: 1, fury: 1, attack: 0,
      antiMagicReflect: 5,
      image: '',
    } as GameCardData;

    const magicCard: GameCardData = {
      id: 'mg', type: 'magic', name: '魔法弹', value: 1,
      magicEffect: 'damage-1', // 任意非 curse magic
      image: '',
    } as GameCardData;

    const state = makeState({
      hp: 20,
      equipmentSlot1: null as any,
      equipmentSlot2: ironTower as any,
      activeCards: [golem, null, null, null, null] as ActiveRowSlots,
      hand: [magicCard],
    });

    // FINALIZE_MAGIC_CARD 触发反魔循环
    const drained = drain(state, [
      { type: 'FINALIZE_MAGIC_CARD', card: magicCard, dealtDamage: false } as any,
    ]);

    expect(drained.state.equipmentSlot2).toBeNull();
    expect(drained.state.discardedCards.some(c => c.id === 's-iron')).toBe(true);
    expect(drained.state.hp).toBe(20); // 盾完全吸收反魔伤害，hp 不动
  });
});

void reduce; // silence unused import if linter complains
