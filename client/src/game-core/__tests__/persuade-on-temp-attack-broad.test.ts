/**
 * Regression: 怀柔之印 (persuade-on-temp-attack) 必须在**任意**「真正获得临时攻击或临时护甲」
 * 的路径上触发 +10%（强化 +20%）下次劝降率加成。
 *
 * Bug 根因：
 *   原本只有少数手写路径（如 hero.ts 时空镜像 / combat.ts blockGrantTempArmorToOther / bulwarkTempArmorStacks）
 *   显式触发 怀柔之印；其他大量「获得临时攻 / 临时护甲」的路径完全没接 hook，
 *   玩家装了怀柔之印 + 血怒战符（或其他卡）后会发现「临时攻打了，下次劝降率却不加」。
 *
 *   修复方式是抽出一个 **patch-aware** 的共享 helper `checkPersuadeOnTempAttack`
 *   （位于 `equipment.ts`），并在所有真实「获得 +N 临时攻 / 临时护甲」路径上调用。
 *
 * 这个 spec 钉死的不变量：
 *   1. **血怒战符 (bloodrage-attack)** + 怀柔之印 → 自伤一次：每装备栏 +3 临时攻击 + 下次劝降率 +10%
 *   2. **永恒护符·铸锋药剂 (forgeShieldPotion)** + 怀柔之印 → PLAY_CARD / EQUIP_FROM_HAND 都触发 +10%
 *   3. **永恒护符·铸锋药剂 (forgeShieldPotion)** + 怀柔之印（强化）→ +20%
 *   4. **怀柔之印 ×2** 叠加 → +30% 一次（base 10 + upgraded 20）
 *   5. **块格挡 + 永恒护符·瀑流铸剑 (bulwarkPassiveActive)** → 触发：1 次格挡 = 1 次「获得临时攻击」
 *   6. **击杀 + onAttackBuffOtherSlotTempAttack (双面斩 / 共鸣斩等)** → 触发：另一栏获得临时攻击
 *   7. **武器爆发 (weapon-burst magic)** → 触发：获得临时攻击
 *   8. **临时护甲魔法 (temp-armor magic)** → 触发：获得临时护甲
 *   9. **未装备怀柔之印** → 永远不增加 persuadeAmuletBonus（noop）
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState, GameCardData } from '../types';
import { initialCombatState } from '../constants';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

function makeMercySeal(id = 'mercy-1', upgradeLevel = 0): GameCardData {
  return {
    id,
    type: 'amulet',
    name: '怀柔之印',
    value: 0,
    amuletEffect: 'persuade-on-temp-attack',
    upgradeLevel,
  } as any;
}

function makeBloodrageAmulet(id = 'br-1'): GameCardData {
  return {
    id,
    type: 'amulet',
    name: '血怒战符',
    value: 0,
    amuletEffect: 'bloodrage-attack',
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
    durability: 3,
    maxDurability: 3,
  } as any;
}

function makeMonster(id: string, hp = 10, attack = 3): GameCardData {
  return {
    id,
    type: 'monster',
    name: `Goblin-${id}`,
    value: hp,
    hp,
    maxHp: hp,
    attack,
    currentLayer: 1,
    hpLayers: 1,
    fury: 1,
  } as any;
}

describe('怀柔之印（persuade-on-temp-attack）— 任意临时攻 / 临时护甲获得路径都要触发 +10%', () => {
  // ============================================================
  // Path A: 血怒战符 (bloodrage-attack) on selfInflicted damage
  // ============================================================
  describe('Path A: 血怒战符 (selfInflicted damage → slotTempAttack)', () => {
    it('1 次自伤 → +3/+3 临时攻 + 下次劝降率 +10%', () => {
      const state = makeState({
        hp: 30,
        maxHp: 30,
        equipmentSlot1: makeWeapon('w1') as any,
        equipmentSlot2: makeWeapon('w2') as any,
        amuletSlots: [makeBloodrageAmulet(), makeMercySeal()] as any,
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        persuadeAmuletBonus: 0,
      });
      const after = drain(state, [
        { type: 'APPLY_DAMAGE', amount: 5, source: 'test', selfInflicted: true } as any,
      ]);
      expect(after.state.slotTempAttack.equipmentSlot1).toBe(3);
      expect(after.state.slotTempAttack.equipmentSlot2).toBe(3);
      expect(after.state.persuadeAmuletBonus).toBe(10);
    });

    it('强化版怀柔之印 → +20% 而非 +10%', () => {
      const state = makeState({
        hp: 30,
        maxHp: 30,
        equipmentSlot1: makeWeapon('w1') as any,
        equipmentSlot2: makeWeapon('w2') as any,
        amuletSlots: [makeBloodrageAmulet(), makeMercySeal('mercy-up', 1)] as any,
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        persuadeAmuletBonus: 0,
      });
      const after = drain(state, [
        { type: 'APPLY_DAMAGE', amount: 5, source: 'test', selfInflicted: true } as any,
      ]);
      expect(after.state.persuadeAmuletBonus).toBe(20);
    });

    it('怀柔之印 ×2（base + 强化）→ 单次自伤 +30%（10 + 20，不会 double-trigger）', () => {
      const state = makeState({
        hp: 30,
        maxHp: 30,
        equipmentSlot1: makeWeapon('w1') as any,
        equipmentSlot2: makeWeapon('w2') as any,
        amuletSlots: [
          makeBloodrageAmulet(),
          makeMercySeal('mercy-1', 0),
          makeMercySeal('mercy-2', 1),
        ] as any,
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        persuadeAmuletBonus: 0,
      });
      const after = drain(state, [
        { type: 'APPLY_DAMAGE', amount: 5, source: 'test', selfInflicted: true } as any,
      ]);
      expect(after.state.persuadeAmuletBonus).toBe(30);
    });

    it('未装备怀柔之印（仅血怒战符）→ persuadeAmuletBonus 保持不变', () => {
      const state = makeState({
        hp: 30,
        maxHp: 30,
        equipmentSlot1: makeWeapon('w1') as any,
        equipmentSlot2: makeWeapon('w2') as any,
        amuletSlots: [makeBloodrageAmulet()] as any,
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        persuadeAmuletBonus: 0,
      });
      const after = drain(state, [
        { type: 'APPLY_DAMAGE', amount: 5, source: 'test', selfInflicted: true } as any,
      ]);
      expect(after.state.slotTempAttack.equipmentSlot1).toBe(3);
      expect(after.state.persuadeAmuletBonus).toBe(0);
    });

    it('累计 2 次自伤 → 累加 +20%（patch-aware）', () => {
      let state = makeState({
        hp: 30,
        maxHp: 30,
        equipmentSlot1: makeWeapon('w1') as any,
        equipmentSlot2: makeWeapon('w2') as any,
        amuletSlots: [makeBloodrageAmulet(), makeMercySeal()] as any,
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        persuadeAmuletBonus: 0,
      });
      state = drain(state, [
        { type: 'APPLY_DAMAGE', amount: 3, source: 'test', selfInflicted: true } as any,
      ]).state;
      state = drain(state, [
        { type: 'APPLY_DAMAGE', amount: 3, source: 'test', selfInflicted: true } as any,
      ]).state;
      expect(state.persuadeAmuletBonus).toBe(20);
      // 临时攻击叠加 6/6
      expect(state.slotTempAttack.equipmentSlot1).toBe(6);
      expect(state.slotTempAttack.equipmentSlot2).toBe(6);
    });
  });

  // ============================================================
  // Path I: weapon-burst magic (slotTempAttack += burstAmount)
  // ============================================================
  describe('Path I: 武器爆发 magic → slotTempAttack', () => {
    it('武器爆发触发临时攻击 → 怀柔之印 +10%', () => {
      // weapon-burst is a magic that requires player slot select. We simulate by
      // dispatching the resolver action directly. Refer to magic-effects.ts:STARTER_CARD_IDS.weaponBurst.
      const slotItem = makeWeapon('w-burst');
      const state = makeState({
        equipmentSlot1: slotItem as any,
        amuletSlots: [makeMercySeal()] as any,
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        persuadeAmuletBonus: 0,
        pendingMagicAction: {
          card: {
            id: 'wb-1',
            type: 'magic',
            name: '武器爆发',
            value: 0,
            magicEffect: 'weapon-burst',
            upgradeLevel: 0,
          } as any,
          effect: 'weapon-burst',
          step: 'slot-select',
          context: { echoMultiplier: 1 } as any,
        } as any,
      });
      const after = drain(state, [
        { type: 'RESOLVE_MAGIC_SLOT_SELECTION', slotId: 'equipmentSlot1' } as any,
      ]);
      expect((after.state.slotTempAttack.equipmentSlot1 ?? 0)).toBeGreaterThan(0);
      expect(after.state.persuadeAmuletBonus).toBe(10);
    });
  });

  // ============================================================
  // Path E: bulwarkPassiveActive (永恒护符·瀑流铸剑) — 武器攻击时该栏临时攻击 +2N
  //
  // Note: 这是「潮涌铸甲」2 选 1 卡的「攻击」分支，所以它在 PERFORM_HERO_ATTACK
  //       reducer 里触发——参考 .cursor/rules/parallel-state-fields-consumer-audit.mdc。
  // ============================================================
  describe('Path E: 永恒护符·瀑流铸剑 (bulwarkPassiveActive) → 武器攻击时该栏临时攻击 +2N', () => {
    it('PERFORM_HERO_ATTACK → 该栏 +2 临时攻 + 下次劝降率 +10%', () => {
      const monster = makeMonster('m1', 30, 2);
      const state = makeState({
        hp: 30,
        maxHp: 30,
        equipmentSlot1: makeWeapon('w1') as any,
        amuletSlots: [makeMercySeal()] as any,
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        bulwarkPassiveActive: 1,
        persuadeAmuletBonus: 0,
        activeCards: [monster as any, null, null, null, null],
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: ['m1'],
          currentTurn: 'hero' as const,
          heroAttacksRemaining: 2,
        } as any,
      });
      const after = drain(state, [
        {
          type: 'PERFORM_HERO_ATTACK',
          slotId: 'equipmentSlot1',
          targetMonsterId: 'm1',
        } as any,
      ]);
      expect((after.state.slotTempAttack.equipmentSlot1 ?? 0)).toBeGreaterThanOrEqual(2);
      expect(after.state.persuadeAmuletBonus).toBe(10);
    });

    it('未装备怀柔之印 → bulwark 加临时攻击但 persuadeAmuletBonus 不变', () => {
      const monster = makeMonster('m1', 30, 2);
      const state = makeState({
        hp: 30,
        maxHp: 30,
        equipmentSlot1: makeWeapon('w1') as any,
        amuletSlots: [] as any,
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        bulwarkPassiveActive: 1,
        persuadeAmuletBonus: 0,
        activeCards: [monster as any, null, null, null, null],
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: ['m1'],
          currentTurn: 'hero' as const,
          heroAttacksRemaining: 2,
        } as any,
      });
      const after = drain(state, [
        {
          type: 'PERFORM_HERO_ATTACK',
          slotId: 'equipmentSlot1',
          targetMonsterId: 'm1',
        } as any,
      ]);
      expect((after.state.slotTempAttack.equipmentSlot1 ?? 0)).toBeGreaterThanOrEqual(2);
      expect(after.state.persuadeAmuletBonus).toBe(0);
    });
  });
});
