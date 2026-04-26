/**
 * 增幅 → 装备护盾 / 怪物装备的当前 armor 自动 +amount
 *
 * 单计数器护甲模型 (`shield-armor-vs-durability.mdc`) 下，amplify 把
 * 基础上限（shield: armorMax / monster: hp）+= amount，cap 也跟着涨。
 * 但单纯 bump cap 不会让玩家立刻看到护甲变化——必须把 `armor` 一起
 * 推上去，跟 "装备时 / 加永久护甲 / 加临时护甲 立刻 +X" 对称。
 *
 * 这条规则覆盖：
 *   1. shield 在槽位中、armor 已损（< 旧 cap）→ 增幅后 armor += amount
 *   2. monster 装备 在槽位中、armor 已损 → 同上
 *   3. shield 在槽位中、armor === undefined（满 cap）→ 增幅后 armor 仍 undefined
 *      （下次读取自动 = 新 cap，依赖 getSlotCurrentArmor 的 fallback）
 *   4. 不影响非装备 zone（hand / backpack / graveyard 里的同名卡只 bump 上限，
 *      armor 字段是装备专属，不存在）
 *   5. amount > 1 也按 amount 给（不是固定 +1）
 *   6. weapon 不受影响（applySlotArmorBonusDelta 内部对非 shield/monster no-op）
 *
 * fixture 用 `phase: 'playerInput'` 走真实 dispatch 链，符合
 * `pipeline-input-continuation.mdc` 的要求。
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { EquipmentItem } from '@/components/game-board/types';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

describe('AMPLIFY_CARDS_BY_NAME — armor refill on equipped shield/monster', () => {
  it('shield with damaged armor: amplify +1 bumps current armor by 1, capped at new cap', () => {
    const shield = {
      id: 'sh-1',
      type: 'shield' as const,
      name: '盾牌',
      value: 4,
      armorMax: 4,
      durability: 2,
      maxDurability: 2,
      armor: 2, // already damaged
      fromSlot: 'equipmentSlot1' as const,
    };
    const state = makeState({ equipmentSlot1: shield as EquipmentItem });

    const result = reduce(state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: '盾牌', amount: 1 });

    const slot = result.state.equipmentSlot1!;
    expect(slot.armorMax).toBe(5);
    expect(slot.value).toBe(5);
    expect(slot.amplifyBonus).toBe(1);
    expect(slot.armor).toBe(3); // 2 + 1, sub-cap (cap is 5)
  });

  it('shield with undefined armor (at full cap): amplify keeps armor undefined, next read = new cap', () => {
    const shield = {
      id: 'sh-1',
      type: 'shield' as const,
      name: '盾牌',
      value: 4,
      armorMax: 4,
      durability: 2,
      maxDurability: 2,
      // armor: undefined ⇒ at full cap
      fromSlot: 'equipmentSlot1' as const,
    };
    const state = makeState({ equipmentSlot1: shield as EquipmentItem });

    const result = reduce(state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: '盾牌', amount: 2 });

    const slot = result.state.equipmentSlot1!;
    expect(slot.armorMax).toBe(6);
    // armor stays undefined — getSlotCurrentArmor will resolve to new cap = 6
    expect(slot.armor).toBeUndefined();
  });

  it('monster equipment with damaged armor: amplify +1 bumps current armor by 1', () => {
    const monsterEquip = {
      id: 'm-eq-1',
      type: 'monster' as const,
      name: 'Goblin',
      monsterType: 'Goblin',
      value: 3,
      attack: 3,
      baseAttack: 3,
      hp: 4,
      maxHp: 4,
      baseHp: 4,
      durability: 2,
      maxDurability: 4,
      armor: 1, // damaged
      fury: 1,
      hpLayers: 1,
      currentLayer: 1,
      rageTurn: 10,
      fromSlot: 'equipmentSlot2' as const,
    };
    const state = makeState({ equipmentSlot2: monsterEquip as EquipmentItem });

    const result = reduce(state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: 'Goblin', amount: 1 });

    const slot = result.state.equipmentSlot2!;
    expect(slot.hp).toBe(5);
    expect(slot.attack).toBe(4);
    expect(slot.amplifyBonus).toBe(1);
    expect(slot.armor).toBe(2); // 1 + 1, sub-cap (cap is 5)
  });

  it('monster equipment with undefined armor: amplify keeps armor undefined', () => {
    const monsterEquip = {
      id: 'm-eq-1',
      type: 'monster' as const,
      name: 'Goblin',
      monsterType: 'Goblin',
      value: 3,
      attack: 3,
      baseAttack: 3,
      hp: 4,
      maxHp: 4,
      baseHp: 4,
      durability: 2,
      maxDurability: 4,
      // armor: undefined ⇒ at full cap
      fury: 1,
      hpLayers: 1,
      currentLayer: 1,
      rageTurn: 10,
      fromSlot: 'equipmentSlot1' as const,
    };
    const state = makeState({ equipmentSlot1: monsterEquip as EquipmentItem });

    const result = reduce(state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: 'Goblin', amount: 1 });

    const slot = result.state.equipmentSlot1!;
    expect(slot.hp).toBe(5);
    expect(slot.armor).toBeUndefined();
  });

  it('amount > 1: shield armor bumps by full amount (not capped at +1)', () => {
    const shield = {
      id: 'sh-1',
      type: 'shield' as const,
      name: '盾牌',
      value: 5,
      armorMax: 5,
      durability: 2,
      maxDurability: 2,
      armor: 1, // very damaged
      fromSlot: 'equipmentSlot1' as const,
    };
    const state = makeState({ equipmentSlot1: shield as EquipmentItem });

    const result = reduce(state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: '盾牌', amount: 3 });

    const slot = result.state.equipmentSlot1!;
    expect(slot.armorMax).toBe(8);
    expect(slot.armor).toBe(4); // 1 + 3 = 4, sub-cap (cap = 8)
  });

  it('armor refill respects new cap: amplify never pushes armor above (base + perm + temp)', () => {
    const shield = {
      id: 'sh-1',
      type: 'shield' as const,
      name: '盾牌',
      value: 4,
      armorMax: 4,
      durability: 2,
      maxDurability: 2,
      armor: 4, // already at old cap
      fromSlot: 'equipmentSlot1' as const,
    };
    const state = makeState({ equipmentSlot1: shield as EquipmentItem });

    const result = reduce(state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: '盾牌', amount: 2 });

    const slot = result.state.equipmentSlot1!;
    expect(slot.armorMax).toBe(6);
    expect(slot.armor).toBe(6); // 4 + 2 = 6, hits new cap exactly
  });

  it('amplify also works when slot has perm + temp armor bonuses (cap = base + perm + temp)', () => {
    const shield = {
      id: 'sh-1',
      type: 'shield' as const,
      name: '盾牌',
      value: 3,
      armorMax: 3,
      durability: 2,
      maxDurability: 2,
      armor: 2, // damaged
      fromSlot: 'equipmentSlot1' as const,
    };
    const state = makeState({
      equipmentSlot1: shield as EquipmentItem,
      equipmentSlotBonuses: {
        equipmentSlot1: { attack: 0, shield: 2, amuletShieldBonus: 0 },
        equipmentSlot2: { attack: 0, shield: 0, amuletShieldBonus: 0 },
      },
      slotTempArmor: { equipmentSlot1: 1, equipmentSlot2: 0 },
    });

    // Old cap = 3 (base) + 2 (perm) + 1 (temp) = 6, armor was 2 (damaged)
    const result = reduce(state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: '盾牌', amount: 1 });

    const slot = result.state.equipmentSlot1!;
    expect(slot.armorMax).toBe(4);
    // New cap = 4 (base) + 2 (perm) + 1 (temp) = 7
    // armor: 2 + 1 (amplify delta) = 3, sub-cap (7)
    expect(slot.armor).toBe(3);
  });

  it('amplify does NOT add armor field to non-equipped same-name cards (hand/backpack)', () => {
    const handShield = {
      id: 'h-sh',
      type: 'shield' as const,
      name: '盾牌',
      value: 3,
      armorMax: 3,
    };
    const backpackShield = {
      id: 'bp-sh',
      type: 'shield' as const,
      name: '盾牌',
      value: 3,
      armorMax: 3,
    };
    const state = makeState({
      handCards: [handShield as any],
      backpackItems: [backpackShield as any],
    });

    const result = reduce(state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: '盾牌', amount: 1 });

    const handCard = result.state.handCards[0];
    const bpCard = result.state.backpackItems[0];
    expect(handCard.armorMax).toBe(4);
    expect(bpCard.armorMax).toBe(4);
    expect((handCard as { armor?: number }).armor).toBeUndefined();
    expect((bpCard as { armor?: number }).armor).toBeUndefined();
  });

  it('weapon amplify is unaffected (no armor field; helper no-ops on non-shield/non-monster)', () => {
    const weapon = {
      id: 'w-1',
      type: 'weapon' as const,
      name: '长剑',
      value: 3,
      durability: 2,
      maxDurability: 2,
      fromSlot: 'equipmentSlot1' as const,
    };
    const state = makeState({ equipmentSlot1: weapon as EquipmentItem });

    const result = reduce(state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: '长剑', amount: 2 });

    const slot = result.state.equipmentSlot1!;
    expect(slot.value).toBe(5);
    expect(slot.amplifyBonus).toBe(2);
    expect((slot as { armor?: number }).armor).toBeUndefined();
  });

  it('amplify slot1 and slot2 with same name independently refills both armor counters', () => {
    const shieldL = {
      id: 'sh-L',
      type: 'shield' as const,
      name: '盾牌',
      value: 4,
      armorMax: 4,
      durability: 2,
      maxDurability: 2,
      armor: 1,
      fromSlot: 'equipmentSlot1' as const,
    };
    const shieldR = {
      id: 'sh-R',
      type: 'shield' as const,
      name: '盾牌',
      value: 4,
      armorMax: 4,
      durability: 2,
      maxDurability: 2,
      armor: 3,
      fromSlot: 'equipmentSlot2' as const,
    };
    const state = makeState({
      equipmentSlot1: shieldL as EquipmentItem,
      equipmentSlot2: shieldR as EquipmentItem,
    });

    const result = reduce(state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: '盾牌', amount: 1 });

    expect(result.state.equipmentSlot1!.armor).toBe(2); // 1 + 1
    expect(result.state.equipmentSlot2!.armor).toBe(4); // 3 + 1
    expect(result.state.equipmentSlot1!.armorMax).toBe(5);
    expect(result.state.equipmentSlot2!.armorMax).toBe(5);
  });
});
