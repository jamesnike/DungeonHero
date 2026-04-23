import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makePotion() {
  return {
    id: 'potion-stat-swap-test',
    type: 'potion' as const,
    name: '乾坤颠倒药',
    value: 0,
    image: '',
    classCard: true,
    potionEffect: 'swap-slot-damage-shield' as const,
  };
}

// 乾坤颠倒药：玩家选择一个装备栏；选中栏的
//   永久攻击 ↔ 永久护甲（equipmentSlotBonuses[slot].damage ↔ shield）
//   临时攻击 ↔ 临时护甲（slotTempAttack[slot] ↔ slotTempArmor[slot]）
describe('乾坤颠倒药 (swap-slot-damage-shield) 玩家选择装备栏 + 永久&临时互换', () => {
  it('Step 1: PLAY → 进入 slot-select pending；不立即互换', () => {
    const card = makePotion();
    const state = makeState({
      handCards: [card] as any,
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 5, shield: 2 },
        equipmentSlot2: { damage: 3, shield: 7 },
      },
      slotTempAttack: { equipmentSlot1: 1, equipmentSlot2: 4 },
      slotTempArmor: { equipmentSlot1: 6, equipmentSlot2: 0 },
    });

    const result = reduce(state, { type: 'RESOLVE_POTION', cardId: card.id, card: card as any });

    expect(result.state.pendingPotionAction).not.toBeNull();
    expect(result.state.pendingPotionAction?.effect).toBe('swap-slot-damage-shield');
    expect((result.state.pendingPotionAction as any)?.step).toBe('slot-select');
    // 数值未变
    expect(result.state.equipmentSlotBonuses.equipmentSlot1).toEqual({ damage: 5, shield: 2 });
    expect(result.state.equipmentSlotBonuses.equipmentSlot2).toEqual({ damage: 3, shield: 7 });
    expect(result.state.slotTempAttack.equipmentSlot1).toBe(1);
    expect(result.state.slotTempAttack.equipmentSlot2).toBe(4);
    expect(result.state.slotTempArmor.equipmentSlot1).toBe(6);
    expect(result.state.slotTempArmor.equipmentSlot2).toBe(0);
  });

  it('选左栏 → 仅左栏永久攻击/护甲 + 临时攻击/护甲互换；右栏不动', () => {
    const card = makePotion();
    const state = makeState({
      handCards: [card] as any,
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 5, shield: 2 },
        equipmentSlot2: { damage: 3, shield: 7 },
      },
      slotTempAttack: { equipmentSlot1: 1, equipmentSlot2: 4 },
      slotTempArmor: { equipmentSlot1: 6, equipmentSlot2: 0 },
    });

    const r = drain(state, [
      { type: 'RESOLVE_POTION', cardId: card.id, card: card as any } as GameAction,
      { type: 'RESOLVE_EQUIPMENT_CHOICE', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    // 左栏：5↔2、1↔6
    expect(r.state.equipmentSlotBonuses.equipmentSlot1).toEqual({ damage: 2, shield: 5 });
    expect(r.state.slotTempAttack.equipmentSlot1).toBe(6);
    expect(r.state.slotTempArmor.equipmentSlot1).toBe(1);
    // 右栏不动
    expect(r.state.equipmentSlotBonuses.equipmentSlot2).toEqual({ damage: 3, shield: 7 });
    expect(r.state.slotTempAttack.equipmentSlot2).toBe(4);
    expect(r.state.slotTempArmor.equipmentSlot2).toBe(0);
    // pending 已清空
    expect(r.state.pendingPotionAction).toBeNull();
  });

  it('选右栏 → 仅右栏永久攻击/护甲 + 临时攻击/护甲互换；左栏不动', () => {
    const card = makePotion();
    const state = makeState({
      handCards: [card] as any,
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 5, shield: 2 },
        equipmentSlot2: { damage: 3, shield: 7 },
      },
      slotTempAttack: { equipmentSlot1: 1, equipmentSlot2: 4 },
      slotTempArmor: { equipmentSlot1: 6, equipmentSlot2: 0 },
    });

    const r = drain(state, [
      { type: 'RESOLVE_POTION', cardId: card.id, card: card as any } as GameAction,
      { type: 'RESOLVE_EQUIPMENT_CHOICE', slotId: 'equipmentSlot2' } as GameAction,
    ]);

    // 右栏：3↔7、4↔0
    expect(r.state.equipmentSlotBonuses.equipmentSlot2).toEqual({ damage: 7, shield: 3 });
    expect(r.state.slotTempAttack.equipmentSlot2).toBe(0);
    expect(r.state.slotTempArmor.equipmentSlot2).toBe(4);
    // 左栏不动
    expect(r.state.equipmentSlotBonuses.equipmentSlot1).toEqual({ damage: 5, shield: 2 });
    expect(r.state.slotTempAttack.equipmentSlot1).toBe(1);
    expect(r.state.slotTempArmor.equipmentSlot1).toBe(6);
    expect(r.state.pendingPotionAction).toBeNull();
  });

  it('选中栏全部为 0 时静默通过：互换后仍为 0', () => {
    const card = makePotion();
    const state = makeState({
      handCards: [card] as any,
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 0, shield: 0 },
        equipmentSlot2: { damage: 3, shield: 7 },
      },
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 4 },
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
    });

    const r = drain(state, [
      { type: 'RESOLVE_POTION', cardId: card.id, card: card as any } as GameAction,
      { type: 'RESOLVE_EQUIPMENT_CHOICE', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(r.state.equipmentSlotBonuses.equipmentSlot1).toEqual({ damage: 0, shield: 0 });
    expect(r.state.slotTempAttack.equipmentSlot1).toBe(0);
    expect(r.state.slotTempArmor.equipmentSlot1).toBe(0);
    expect(r.state.pendingPotionAction).toBeNull();
  });

  it('空装备栏（无 item）也可被选中：仅互换 slot-level 数值', () => {
    const card = makePotion();
    const state = makeState({
      handCards: [card] as any,
      equipmentSlot1: null,
      equipmentSlot2: null,
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 4, shield: 1 },
        equipmentSlot2: { damage: 0, shield: 0 },
      },
      slotTempAttack: { equipmentSlot1: 2, equipmentSlot2: 0 },
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
    });

    const r = drain(state, [
      { type: 'RESOLVE_POTION', cardId: card.id, card: card as any } as GameAction,
      { type: 'RESOLVE_EQUIPMENT_CHOICE', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(r.state.equipmentSlotBonuses.equipmentSlot1).toEqual({ damage: 1, shield: 4 });
    expect(r.state.slotTempAttack.equipmentSlot1).toBe(0);
    expect(r.state.slotTempArmor.equipmentSlot1).toBe(2);
    expect(r.state.pendingPotionAction).toBeNull();
  });

  // ----------------------------------------------------------------------------------------------
  // armorBonusDamaged 处理（"先减、再加"语义）：
  // 选中栏的护甲方向 perm.shield + temp.armor 是共享伤害池，由装备 item 上的 armorBonusDamaged 累计。
  // Phase A 把 perm.shield 减到 0 时，按 temp-first 损耗归因把 damaged 一并清掉；
  // Phase B 再加新护甲时不会被旧 damaged 拖累——新护甲是"满的"。
  // ----------------------------------------------------------------------------------------------
  it('shield item 上的 armorBonusDamaged：换进来的新永久护甲是"满的"，不被旧 damaged 啃', () => {
    const card = makePotion();
    const shield = {
      id: 'sh-1',
      type: 'shield' as const,
      name: 'TestShield',
      value: 2,
      armor: 2,
      armorMax: 2,
      durability: 3,
      maxDurability: 3,
      armorBonusDamaged: 3, // 旧 perm.shield(=4) 这一血层已经被打掉 3 点
    };
    const state = makeState({
      handCards: [card] as any,
      equipmentSlot1: shield as any,
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 3, shield: 4 },
        equipmentSlot2: { damage: 0, shield: 0 },
      },
      slotTempAttack: { equipmentSlot1: 2, equipmentSlot2: 0 },
      slotTempArmor: { equipmentSlot1: 1, equipmentSlot2: 0 },
    });

    const r = drain(state, [
      { type: 'RESOLVE_POTION', cardId: card.id, card: card as any } as GameAction,
      { type: 'RESOLVE_EQUIPMENT_CHOICE', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    // 字面互换：3↔4、2↔1
    expect(r.state.equipmentSlotBonuses.equipmentSlot1).toEqual({ damage: 4, shield: 3 });
    expect(r.state.slotTempAttack.equipmentSlot1).toBe(1);
    expect(r.state.slotTempArmor.equipmentSlot1).toBe(2);

    // damaged 计数被清掉：phase A 减到 0 时 temp-first 归因把它带走，phase B 再加新护甲是 fresh。
    const newShield = r.state.equipmentSlot1 as any;
    expect(newShield.armorBonusDamaged ?? 0).toBe(0);
  });

  it('shield item 没有 armorBonusDamaged 字段：不会无中生有写一个 0', () => {
    const card = makePotion();
    const shield = {
      id: 'sh-2',
      type: 'shield' as const,
      name: 'CleanShield',
      value: 2,
      armor: 2,
      armorMax: 2,
      durability: 3,
      maxDurability: 3,
    };
    const state = makeState({
      handCards: [card] as any,
      equipmentSlot1: shield as any,
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 3, shield: 4 },
        equipmentSlot2: { damage: 0, shield: 0 },
      },
      slotTempAttack: { equipmentSlot1: 2, equipmentSlot2: 0 },
      slotTempArmor: { equipmentSlot1: 1, equipmentSlot2: 0 },
    });

    const r = drain(state, [
      { type: 'RESOLVE_POTION', cardId: card.id, card: card as any } as GameAction,
      { type: 'RESOLVE_EQUIPMENT_CHOICE', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(r.state.equipmentSlotBonuses.equipmentSlot1).toEqual({ damage: 4, shield: 3 });
    const newShield = r.state.equipmentSlot1 as any;
    expect('armorBonusDamaged' in newShield).toBe(false);
  });

  it('weapon 槽（不参与 armor 池）：互换不动 item，不写 armorBonusDamaged', () => {
    const card = makePotion();
    const weapon = {
      id: 'wp-1',
      type: 'weapon' as const,
      name: 'TestWeapon',
      value: 5,
      attack: 5,
      durability: 3,
      maxDurability: 3,
    };
    const state = makeState({
      handCards: [card] as any,
      equipmentSlot1: weapon as any,
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 3, shield: 4 },
        equipmentSlot2: { damage: 0, shield: 0 },
      },
      slotTempAttack: { equipmentSlot1: 2, equipmentSlot2: 0 },
      slotTempArmor: { equipmentSlot1: 1, equipmentSlot2: 0 },
    });

    const r = drain(state, [
      { type: 'RESOLVE_POTION', cardId: card.id, card: card as any } as GameAction,
      { type: 'RESOLVE_EQUIPMENT_CHOICE', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    // 字面互换照常
    expect(r.state.equipmentSlotBonuses.equipmentSlot1).toEqual({ damage: 4, shield: 3 });
    expect(r.state.slotTempAttack.equipmentSlot1).toBe(1);
    expect(r.state.slotTempArmor.equipmentSlot1).toBe(2);
    // 武器 item 自身不动
    const newWeapon = r.state.equipmentSlot1 as any;
    expect(newWeapon.id).toBe('wp-1');
    expect('armorBonusDamaged' in newWeapon).toBe(false);
  });
});
