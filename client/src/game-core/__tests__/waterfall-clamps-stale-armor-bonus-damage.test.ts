/**
 * Bug #1: 攻防协律 +N 临护被旧 armorBonusDamaged 吃掉
 *
 * Repro: shield with permBonus=0, previously had slotTempArmor=N, got hit
 * (consuming N from bonus → armorBonusDamaged=N). Waterfall reset slotTempArmor
 * to 0 but armorBonusDamaged=N persisted. Next turn, 攻防协律 grants
 * slotTempArmor=M; the new temp got silently swallowed because
 * `bonusRemaining = max(0, bonusTotal - armorBonusDamaged) = max(0, M - N)` was 0
 * whenever N >= M.
 *
 * Fix (rules/waterfall.ts reduceApplyWaterfallTurnReset): right after
 * slotTempArmor resets to 0, clamp each shield slot's armorBonusDamaged down to
 * its permanent shield bonus. The portion that exceeded permBonus represented
 * damage to slotTempArmor that is now itself gone, so tracking it further would
 * keep eating future temp grants.
 *
 * This is the minimal-touch fix:
 *   - 1 reducer modified, no consumption-site changes
 *   - mid-turn block tracking unaffected (clamp only fires on turn boundary)
 *   - leftover damage that was attributable to permBonus is preserved
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
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
    rng: createRng(11),
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

describe('waterfall reset — clamp stale armorBonusDamaged to permBonus (bug #1)', () => {
  it('permBonus=0 + leftover armorBonusDamaged > 0 → clamp 到 0（field 删除）', () => {
    const shield = makeShield({ armor: 5, armorMax: 5, armorBonusDamaged: 3 });
    const state = makeState({
      equipmentSlot1: null as any,
      equipmentSlot2: shield as any,
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 } as any,
    });

    const result = reduce(state, { type: 'WATERFALL_TURN_RESET' } as any);

    const updated = result.state.equipmentSlot2 as GameCardData;
    expect(updated.armorBonusDamaged).toBeUndefined();
    expect(updated.armor).toBe(5);
    expect(updated.durability).toBe(3);
  });

  it('permBonus=2 + armorBonusDamaged=3 (临护吃了 1) → clamp 到 2（保留 perm 那部分损耗）', () => {
    const shield = makeShield({ armor: 5, armorMax: 5, armorBonusDamaged: 3 });
    const state = makeState({
      equipmentSlot1: null as any,
      equipmentSlot2: shield as any,
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 0, shield: 0 },
        equipmentSlot2: { damage: 0, shield: 2 },
      } as any,
    });

    const result = reduce(state, { type: 'WATERFALL_TURN_RESET' } as any);

    const updated = result.state.equipmentSlot2 as GameCardData;
    expect(updated.armorBonusDamaged).toBe(2);
  });

  it('permBonus=2 + armorBonusDamaged=2 (刚好打完 perm) → 不动', () => {
    const shield = makeShield({ armor: 5, armorMax: 5, armorBonusDamaged: 2 });
    const state = makeState({
      equipmentSlot1: null as any,
      equipmentSlot2: shield as any,
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 0, shield: 0 },
        equipmentSlot2: { damage: 0, shield: 2 },
      } as any,
    });

    const result = reduce(state, { type: 'WATERFALL_TURN_RESET' } as any);

    const updated = result.state.equipmentSlot2 as GameCardData;
    expect(updated.armorBonusDamaged).toBe(2);
  });

  it('armorBonusDamaged=0 → no-op，patch 里不出现该 slot', () => {
    const shield = makeShield({ armor: 5, armorMax: 5 });
    const state = makeState({
      equipmentSlot1: null as any,
      equipmentSlot2: shield as any,
    });

    const result = reduce(state, { type: 'WATERFALL_TURN_RESET' } as any);

    const updated = result.state.equipmentSlot2 as GameCardData;
    expect(updated.armorBonusDamaged ?? 0).toBe(0);
  });

  it('两栏都有 stale armorBonusDamaged → 同时 clamp', () => {
    const left = makeShield({ id: 'l', name: '左盾', armorBonusDamaged: 5, fromSlot: 'equipmentSlot1' });
    const right = makeShield({ id: 'r', name: '右盾', armorBonusDamaged: 4, fromSlot: 'equipmentSlot2' });
    const state = makeState({
      equipmentSlot1: left as any,
      equipmentSlot2: right as any,
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 0, shield: 1 },
        equipmentSlot2: { damage: 0, shield: 0 },
      } as any,
    });

    const result = reduce(state, { type: 'WATERFALL_TURN_RESET' } as any);

    expect((result.state.equipmentSlot1 as GameCardData).armorBonusDamaged).toBe(1);
    expect((result.state.equipmentSlot2 as GameCardData).armorBonusDamaged).toBeUndefined();
  });

  it('怪物装备形态同样适用', () => {
    const monsterShield: GameCardData = {
      id: 'm-shield', type: 'monster', name: 'Rock', value: 4,
      hp: 4, maxHp: 4, attack: 0,
      armor: 4, armorMax: 4,
      durability: 2, maxDurability: 2,
      armorBonusDamaged: 6,
      image: '',
      fromSlot: 'equipmentSlot2',
    } as GameCardData;
    const state = makeState({
      equipmentSlot1: null as any,
      equipmentSlot2: monsterShield as any,
    });

    const result = reduce(state, { type: 'WATERFALL_TURN_RESET' } as any);

    const updated = result.state.equipmentSlot2 as GameCardData;
    expect(updated.armorBonusDamaged).toBeUndefined();
  });

  it('weapon slot (非盾) → 不动', () => {
    const blade: GameCardData = {
      id: 'w', type: 'weapon', name: '剑', value: 3,
      durability: 5, maxDurability: 5,
      image: '',
      fromSlot: 'equipmentSlot1',
    } as GameCardData;
    const state = makeState({
      equipmentSlot1: blade as any,
      equipmentSlot2: null as any,
    });

    const result = reduce(state, { type: 'WATERFALL_TURN_RESET' } as any);

    expect(result.state.equipmentSlot1).toBe(blade);
  });
});

describe('end-to-end: 攻防协律 +N 临护现在能在瀑流后正常显示', () => {
  it('repro 场景：上回合临护被打消，瀑流后再加新临护，新临护应该完整生效', () => {
    // 起始：shield armor 5/5/3，permBonus=0，没有 stale armorBonusDamaged
    // 上一回合用 临时护甲 +3 后被怪物打了 3 → 模拟到 armorBonusDamaged=3 的状态
    const shield: GameCardData = {
      id: 's', type: 'shield', name: '木盾', value: 5,
      armor: 5, armorMax: 5,
      durability: 3, maxDurability: 3,
      armorBonusDamaged: 3,
      image: '',
      fromSlot: 'equipmentSlot2',
    } as GameCardData;
    const state = makeState({
      equipmentSlot1: null as any,
      equipmentSlot2: shield as any,
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 } as any,
    });

    // 瀑流 reset → stale armorBonusDamaged 应被 clamp
    const afterReset = reduce(state, { type: 'WATERFALL_TURN_RESET' } as any);
    expect((afterReset.state.equipmentSlot2 as GameCardData).armorBonusDamaged).toBeUndefined();

    // 现在模拟下一回合用 攻防协律 +2 临护
    const withTempArmor = {
      ...afterReset.state,
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 2 },
    };
    // 用 routeReflectDamageToHero 验证 currentArmor 计算（最直接的 bonus-first 公式）
    // 反伤 1 → 应该全部从 bonus 扣，base 不动
    const route = routeReflectDamageToHero(withTempArmor, 1, 'Test', 'reflect');
    const updated = route.patch.equipmentSlot2 as GameCardData;
    // 关键断言：base armor 没变（如果没 clamp，新 +2 临护会被 stale 吃光，反伤直接打 base → armor=4）
    expect(updated.armor).toBe(5);
    expect(updated.armorBonusDamaged).toBe(1);
  });
});

void drain; // silence unused if linter complains
