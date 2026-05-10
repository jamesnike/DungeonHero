/**
 * 时空镜像 (equalize-temp-attack-armor) — 新语义：
 *
 * 选择一个装备栏，临时攻击 +2，然后使得
 *   (临时攻击 + 永久攻击) 与 (临时护甲 + 永久护甲) 相等
 * 通过增加较低一方的「临时」值（永远只增不减）。
 *
 * 「永久攻击」= state.equipmentSlotBonuses[slotId].damage（来自怪物奖励、
 *   装甲铸蚀、池中坚意 等永久槽位加成；不含装备本身的 base value）
 * 「永久护甲」= state.equipmentSlotBonuses[slotId].shield（同口径）
 *
 * 三个 LIVE/DEAD 实现都要保持新语义（按 shared-effect-id-impact-check 规则）：
 *   - LIVE: client/src/game-core/card-schema/definitions/magic.ts (单栏自动 + 多栏起 pendingMagicAction)
 *   - LIVE: client/src/game-core/rules/hero.ts (RESOLVE_MAGIC_SLOT_SELECTION 完成步骤)
 *   - DEAD/legacy: client/src/game-core/rules/magic-effects.ts (engineResult ?? 后备)
 *
 * 测试通过 RESOLVE_MAGIC 触发 schema engine（LIVE 单栏分支），通过
 * RESOLVE_MAGIC_SLOT_SELECTION 触发 hero.ts（LIVE 多栏分支）。
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState, GameCardData } from '../types';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

function makeMirrorCard(id = 'mirror-1'): GameCardData {
  return {
    id,
    type: 'magic',
    name: '时空镜像',
    value: 0,
    magicType: 'permanent',
    magicEffect: 'equalize-temp-attack-armor',
    recycleDelay: 2,
  } as any;
}

function makeWeapon(id: string, attack = 3): GameCardData {
  return {
    id,
    type: 'weapon',
    name: `Weapon-${id}`,
    value: attack,
    durability: 4,
    maxDurability: 4,
  } as any;
}

function makeShield(id: string, value = 3): GameCardData {
  return {
    id,
    type: 'shield',
    name: `Shield-${id}`,
    value,
    armorMax: value,
    armor: value,
    durability: 3,
    maxDurability: 3,
  } as any;
}

describe('时空镜像 — 比较 (临时+永久) 攻防总和并拉平较低一方临时值', () => {
  // ============================================================
  // 单栏自动分支（schema resolver in magic.ts）
  // ============================================================
  describe('单栏自动 (1 装备栏)', () => {
    it('无永久加成、无既有临时值 → 临时攻 +2, 临时护补到 2 (退化为旧语义)', () => {
      const card = makeMirrorCard();
      const state = makeState({
        handCards: [card],
        equipmentSlot1: makeWeapon('w1') as any,
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
      });
      const after = drain(state, [
        { type: 'RESOLVE_MAGIC', cardId: card.id, card } as any,
      ]);
      expect(after.state.slotTempAttack.equipmentSlot1).toBe(2);
      expect(after.state.slotTempArmor.equipmentSlot1).toBe(2);
    });

    it('永久攻击 5、永久护甲 0 → 临时攻 +2 后总攻 7, 总护 0 → 临时护补 +7', () => {
      const card = makeMirrorCard();
      const state = makeState({
        handCards: [card],
        equipmentSlot1: makeWeapon('w1') as any,
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 5, shield: 0 },
          equipmentSlot2: { damage: 0, shield: 0 },
        },
      });
      const after = drain(state, [
        { type: 'RESOLVE_MAGIC', cardId: card.id, card } as any,
      ]);
      expect(after.state.slotTempAttack.equipmentSlot1).toBe(2);
      expect(after.state.slotTempArmor.equipmentSlot1).toBe(7);
      // 验证总和相等
      const totalAtk = (after.state.slotTempAttack.equipmentSlot1 ?? 0)
        + (after.state.equipmentSlotBonuses.equipmentSlot1?.damage ?? 0);
      const totalArm = (after.state.slotTempArmor.equipmentSlot1 ?? 0)
        + (after.state.equipmentSlotBonuses.equipmentSlot1?.shield ?? 0);
      expect(totalAtk).toBe(totalArm);
    });

    it('永久护甲 5、永久攻击 0 → 临时攻 +2 后总攻 2, 总护 5 → 临时攻再 +3 (共 +5)', () => {
      const card = makeMirrorCard();
      const state = makeState({
        handCards: [card],
        equipmentSlot1: makeShield('s1') as any,
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 0, shield: 5 },
          equipmentSlot2: { damage: 0, shield: 0 },
        },
      });
      const after = drain(state, [
        { type: 'RESOLVE_MAGIC', cardId: card.id, card } as any,
      ]);
      expect(after.state.slotTempAttack.equipmentSlot1).toBe(5);
      expect(after.state.slotTempArmor.equipmentSlot1).toBe(0);
    });

    it('永久攻击 5、永久护甲 5 (已平衡) → 临时攻 +2 后总攻 7, 总护 5 → 临时护补 +2', () => {
      const card = makeMirrorCard();
      const state = makeState({
        handCards: [card],
        equipmentSlot1: makeWeapon('w1') as any,
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 5, shield: 5 },
          equipmentSlot2: { damage: 0, shield: 0 },
        },
      });
      const after = drain(state, [
        { type: 'RESOLVE_MAGIC', cardId: card.id, card } as any,
      ]);
      expect(after.state.slotTempAttack.equipmentSlot1).toBe(2);
      expect(after.state.slotTempArmor.equipmentSlot1).toBe(2);
      const totalAtk = 2 + 5;
      const totalArm = (after.state.slotTempArmor.equipmentSlot1 ?? 0) + 5;
      expect(totalAtk).toBe(totalArm);
    });

    it('既有 临时攻 5/临时护 3 + 永久 0/0 → 临时攻 +2 后总攻 7, 总护 3 → 临时护补 +4', () => {
      const card = makeMirrorCard();
      const state = makeState({
        handCards: [card],
        equipmentSlot1: makeWeapon('w1') as any,
        slotTempAttack: { equipmentSlot1: 5, equipmentSlot2: 0 },
        slotTempArmor: { equipmentSlot1: 3, equipmentSlot2: 0 },
      });
      const after = drain(state, [
        { type: 'RESOLVE_MAGIC', cardId: card.id, card } as any,
      ]);
      expect(after.state.slotTempAttack.equipmentSlot1).toBe(7);
      expect(after.state.slotTempArmor.equipmentSlot1).toBe(7);
    });

    it('既有 临时攻 0/临时护 0 + 永久 2/8 → 临时攻 +2 后总攻 4, 总护 8 → 临时攻再 +4 (共 +6)', () => {
      const card = makeMirrorCard();
      const state = makeState({
        handCards: [card],
        equipmentSlot1: makeWeapon('w1') as any,
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 2, shield: 8 },
          equipmentSlot2: { damage: 0, shield: 0 },
        },
      });
      const after = drain(state, [
        { type: 'RESOLVE_MAGIC', cardId: card.id, card } as any,
      ]);
      expect(after.state.slotTempAttack.equipmentSlot1).toBe(6);
      expect(after.state.slotTempArmor.equipmentSlot1).toBe(0);
    });
  });

  // ============================================================
  // 多栏交互分支（hero.ts RESOLVE_MAGIC_SLOT_SELECTION）
  // ============================================================
  describe('多栏 pendingMagicAction → RESOLVE_MAGIC_SLOT_SELECTION', () => {
    it('两栏都有装备 → schema resolver 起 pendingMagicAction，玩家选 slot1 → hero.ts 完成结算', () => {
      const card = makeMirrorCard();
      const state = makeState({
        handCards: [card],
        equipmentSlot1: makeWeapon('w1') as any,
        equipmentSlot2: makeShield('s1') as any,
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 0, shield: 5 },
          equipmentSlot2: { damage: 0, shield: 0 },
        },
      });
      // Step 1: PLAY → RESOLVE_MAGIC schema resolver 起 pendingMagicAction
      const afterStart = drain(state, [
        { type: 'RESOLVE_MAGIC', cardId: card.id, card } as any,
      ]);
      expect(afterStart.state.pendingMagicAction).toBeDefined();
      expect((afterStart.state.pendingMagicAction as any)?.effect).toBe('equalize-temp-attack-armor');
      expect(afterStart.state.slotTempAttack.equipmentSlot1).toBe(0);

      // Step 2: 玩家选 slot1（perm armor 5, perm atk 0）
      const after = drain(afterStart.state, [
        { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: card.id, slotId: 'equipmentSlot1' } as any,
      ]);
      expect(after.state.slotTempAttack.equipmentSlot1).toBe(5);
      expect(after.state.slotTempArmor.equipmentSlot1).toBe(0);
    });

    it('多栏 + 选 slot2 → 仅 slot2 改变，slot1 不动', () => {
      const card = makeMirrorCard();
      const state = makeState({
        handCards: [card],
        equipmentSlot1: makeWeapon('w1') as any,
        equipmentSlot2: makeShield('s1') as any,
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 5, shield: 0 },
          equipmentSlot2: { damage: 0, shield: 5 },
        },
      });
      const afterStart = drain(state, [
        { type: 'RESOLVE_MAGIC', cardId: card.id, card } as any,
      ]);
      const after = drain(afterStart.state, [
        { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: card.id, slotId: 'equipmentSlot2' } as any,
      ]);
      expect(after.state.slotTempAttack.equipmentSlot1).toBe(0);
      expect(after.state.slotTempArmor.equipmentSlot1).toBe(0);
      expect(after.state.slotTempAttack.equipmentSlot2).toBe(5);
      expect(after.state.slotTempArmor.equipmentSlot2).toBe(0);
    });
  });

  // ============================================================
  // 法术回响（echo×2）
  // ============================================================
  describe('法术回响 (echoMultiplier = 2)', () => {
    it('单栏自动 + 回响 → atkBoost = 4 (+ perm 比较照常)', () => {
      const card = makeMirrorCard();
      const state = makeState({
        handCards: [card],
        equipmentSlot1: makeWeapon('w1') as any,
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 0, shield: 10 },
          equipmentSlot2: { damage: 0, shield: 0 },
        },
        doubleNextMagic: true,
      });
      const after = drain(state, [
        { type: 'RESOLVE_MAGIC', cardId: card.id, card } as any,
      ]);
      // 临时攻 +4，总攻 = 4，总护 = 10 → 临时攻再 +6 = 10
      expect(after.state.slotTempAttack.equipmentSlot1).toBe(10);
      expect(after.state.slotTempArmor.equipmentSlot1).toBe(0);
      // 回响 flag 被消耗
      expect(after.state.doubleNextMagic).toBe(false);
    });
  });

  // ============================================================
  // 边界
  // ============================================================
  describe('边界', () => {
    it('两栏都空 → banner 「没有装备可选择」、不动 temp', () => {
      const card = makeMirrorCard();
      const state = makeState({
        handCards: [card],
        equipmentSlot1: null,
        equipmentSlot2: null,
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
      });
      const after = drain(state, [
        { type: 'RESOLVE_MAGIC', cardId: card.id, card } as any,
      ]);
      expect(after.state.slotTempAttack.equipmentSlot1).toBe(0);
      expect(after.state.slotTempAttack.equipmentSlot2).toBe(0);
      expect(after.state.slotTempArmor.equipmentSlot1).toBe(0);
      expect(after.state.slotTempArmor.equipmentSlot2).toBe(0);
    });
  });
});
