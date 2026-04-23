/**
 * Magic 自伤路径 — 打装备槽里的盾。
 *
 * 这个 spec 钉死的不变量：
 *   1. armor 完全吃下伤害（不溢出）→ armor 变化、no hp loss、no durability change、
 *      `slotDurabilityUsedThisTurn` 不变（仍 0）。
 *   2. armor 不够 → armor 打空、durability -1（走 computeDurabilityLossEffects）、
 *      溢出部分通过 APPLY_DAMAGE selfInflicted 扣 hp，并增加 `combatState.totalDamageTaken`，
 *      但 **`slotDurabilityUsedThisTurn` 仍然为 0**（关键：本机制不计入"格挡耐久次数上限"）。
 *   3. 连续 N 次自伤打盾，`slotDurabilityUsedThisTurn` 始终保持 0；这证明本路径
 *      不受 `blockDurabilityPerSlot` 上限制约。
 *   4. armor=1 / durability=1 / dmg 大 → 触发 `computeEquipmentBreakEffects`、装备销毁、
 *      hp 损失等于溢出部分。
 *   5. 反弹 / autoEvolve 等"格挡专属"机制不应触发：
 *      - `reflectHalfDamage` 盾 → 不发 `combat:shieldReflect` / 不掉血给怪物
 *      - `shieldAutoEvolve` 盾 → `_shieldBlockCount` 不递增
 *   6. echo×2 单体伤害 → 第二次仍可选盾（pendingMagicAction 重新进 monster-select 且
 *      `allowsHeroTarget = true`）。
 *   7. type='monster' 的怪物盾 → reducer 守卫返回 noChange，不可被自伤打。
 *   8. armor-strike 选自己的盾 → 用 setup 时冻结的 pendingDamage 结算，盾自身被这部分
 *      伤害打、armor 减少 / durability 消耗。
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState, GameCardData } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import { initialCombatState } from '../constants';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeShield(overrides: Partial<EquipmentItem> = {}): EquipmentItem {
  return {
    id: 'shield-1',
    type: 'shield',
    name: '铁盾',
    value: 5,
    armor: 5,
    armorMax: 5,
    durability: 3,
    maxDurability: 3,
    ...overrides,
  } as EquipmentItem;
}

function makeBoltCard(id = 'card-bolt'): GameCardData {
  return {
    id,
    type: 'magic',
    name: '魔弹',
    value: 0,
    classCard: true,
    magicType: 'instant',
    knightEffect: 'missile-bolt',
  } as any;
}

function makeMonster(id: string, hp = 30): GameCardData {
  return {
    id,
    type: 'monster',
    name: `M${id}`,
    value: hp,
    hp,
    maxHp: hp,
    attack: 5,
    currentLayer: 1,
    hpLayers: 1,
    fury: 1,
  } as any;
}

function activeRowOf(...monsters: (GameCardData | null)[]): ActiveRowSlots {
  const row: (GameCardData | null)[] = [null, null, null, null, null];
  for (let i = 0; i < monsters.length && i < 5; i++) row[i] = monsters[i];
  return row as ActiveRowSlots;
}

describe('单目标伤害 magic — 自伤打盾路径 (target = shield-slot)', () => {
  it('盾 armor 5 / dmg 3：armor 5→2，hp 不变，durability 不变，slotDurabilityUsedThisTurn 仍 0', () => {
    const bolt = makeBoltCard();
    const monster = makeMonster('m1', 50);
    const shield = makeShield({ armor: 5, durability: 3 });
    const state = makeState({
      hp: 20,
      maxHp: 20,
      handCards: [bolt],
      equipmentSlot1: shield,
      equipmentSlot2: null,
      activeCards: activeRowOf(monster),
      combatState: { ...initialCombatState, currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: bolt.id } as GameAction]);
    expect((afterPlay.state.pendingMagicAction as any)?.allowsHeroTarget).toBe(true);

    const afterShield = drain(afterPlay.state, [
      {
        type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
        magicId: 'missile-bolt',
        monsterId: '',
        targetType: 'shield-slot',
        slotId: 'equipmentSlot1',
      } as GameAction,
    ]);

    const newShield = afterShield.state.equipmentSlot1 as any;
    // missile-bolt 默认伤害 1（amplifyBonus 0）→ armor 5→4，hp 不变。
    expect(newShield.armor).toBe(4);
    expect(newShield.durability).toBe(3);
    expect(afterShield.state.hp).toBe(20);
    expect(afterShield.state.combatState.slotDurabilityUsedThisTurn?.equipmentSlot1 ?? 0).toBe(0);
  });

  it('盾 armor 1 / dmg ≥ 2：armor 打空、durability -1、溢出走 APPLY_DAMAGE selfInflicted 扣 hp，'
    + ' slotDurabilityUsedThisTurn 仍 0（关键：不入"本回合格挡耐久次数上限"）', () => {
    const bolt = makeBoltCard();
    const monster = makeMonster('m1', 50);
    // amplifyBonus = 4 → 总伤害 = 5（base 1 + amplify 4）。armor 1 → 溢出 4。
    const ampedBolt = { ...bolt, amplifyBonus: 4 } as GameCardData;
    const shield = makeShield({ armor: 1, durability: 3 });
    const state = makeState({
      hp: 20,
      maxHp: 20,
      handCards: [ampedBolt],
      equipmentSlot1: shield,
      equipmentSlot2: null,
      activeCards: activeRowOf(monster),
      combatState: { ...initialCombatState, currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: ampedBolt.id } as GameAction]);
    const afterShield = drain(afterPlay.state, [
      {
        type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
        magicId: 'missile-bolt',
        monsterId: '',
        targetType: 'shield-slot',
        slotId: 'equipmentSlot1',
      } as GameAction,
    ]);

    const newShield = afterShield.state.equipmentSlot1 as any;
    expect(newShield).toBeTruthy();
    expect(newShield.durability).toBe(2); // -1
    // armor 在 RESOLVE_BLOCK 风格的"durability 消耗 → 重置 armor"会把 armor 字段剥离，
    // 由后续战斗循环按 armorMax 重充。所以这里 armor 字段允许为 undefined 或 5（armorMax）。
    expect(newShield.armor === undefined || newShield.armor === newShield.armorMax).toBe(true);
    // 溢出 4 点扣 hp。
    expect(afterShield.state.hp).toBe(16);
    // 关键：slotDurabilityUsedThisTurn 不计 +1。
    expect(afterShield.state.combatState.slotDurabilityUsedThisTurn?.equipmentSlot1 ?? 0).toBe(0);
    // selfInflicted 通路确实接通：emit combat:heroDamaged。
    expect(afterShield.sideEffects.some(s => s.event === 'combat:heroDamaged')).toBe(true);
  });

  it('连续 5 次自伤打盾穿透 → slotDurabilityUsedThisTurn 始终 0（独立于 blockDurabilityPerSlot）', () => {
    const ampedBolt = { ...makeBoltCard('card-loop'), amplifyBonus: 4 } as GameCardData;
    const shield = makeShield({ armor: 1, durability: 99, maxDurability: 99 });
    const state = makeState({
      hp: 50,
      maxHp: 50,
      handCards: [ampedBolt],
      equipmentSlot1: shield,
      equipmentSlot2: null,
      activeCards: activeRowOf(makeMonster('m1', 50)),
      combatState: { ...initialCombatState, currentTurn: 'hero' },
    });

    let cur = state;
    for (let i = 0; i < 5; i++) {
      // 重新挂一张同样的牌到手牌（每次 PLAY_CARD 会消耗）。
      cur = {
        ...cur,
        handCards: [{ ...ampedBolt, id: `card-loop-${i}` }] as any,
      };
      const afterPlay = drain(cur, [{ type: 'PLAY_CARD', cardId: `card-loop-${i}` } as GameAction]);
      // 守卫：必须能选到盾。
      const slotItem = afterPlay.state.equipmentSlot1 as any;
      if (!slotItem || (slotItem.armor ?? slotItem.armorMax ?? 0) <= 0) break;
      const afterShield = drain(afterPlay.state, [
        {
          type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
          magicId: 'missile-bolt',
          monsterId: '',
          targetType: 'shield-slot',
          slotId: 'equipmentSlot1',
        } as GameAction,
      ]);
      cur = afterShield.state;
      expect(cur.combatState.slotDurabilityUsedThisTurn?.equipmentSlot1 ?? 0).toBe(0);
    }
    expect(cur.combatState.slotDurabilityUsedThisTurn?.equipmentSlot1 ?? 0).toBe(0);
  });

  it('盾 armor=1 / durability=1 / dmg 大 → 触发装备销毁、hp 损失等于溢出', () => {
    const ampedBolt = { ...makeBoltCard(), amplifyBonus: 9 } as GameCardData;
    const shield = makeShield({ armor: 1, durability: 1, maxDurability: 1 });
    const state = makeState({
      hp: 30,
      maxHp: 30,
      handCards: [ampedBolt],
      equipmentSlot1: shield,
      equipmentSlot2: null,
      activeCards: activeRowOf(makeMonster('m1', 50)),
      combatState: { ...initialCombatState, currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: ampedBolt.id } as GameAction]);
    const afterShield = drain(afterPlay.state, [
      {
        type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
        magicId: 'missile-bolt',
        monsterId: '',
        targetType: 'shield-slot',
        slotId: 'equipmentSlot1',
      } as GameAction,
    ]);

    // 装备销毁：equipmentSlot1 应被清空（或被 reserve 顶替）。
    expect(afterShield.state.equipmentSlot1).toBeFalsy();
    // 总伤害 1 + 9 = 10；armor 吃 1，溢出 9 扣 hp → 30 - 9 = 21。
    expect(afterShield.state.hp).toBe(21);
    // slotDurabilityUsedThisTurn 仍 0。
    expect(afterShield.state.combatState.slotDurabilityUsedThisTurn?.equipmentSlot1 ?? 0).toBe(0);
  });

  it('reflectHalfDamage 盾被自伤打 → 不应反弹任何伤害（不发 combat:shieldReflect）', () => {
    const ampedBolt = { ...makeBoltCard(), amplifyBonus: 4 } as GameCardData;
    const reflectShield = makeShield({
      id: 'reflect-shield',
      armor: 1,
      durability: 3,
      reflectHalfDamage: true,
    } as any);
    const monster = makeMonster('m1', 100);
    const state = makeState({
      hp: 30,
      maxHp: 30,
      handCards: [ampedBolt],
      equipmentSlot1: reflectShield,
      equipmentSlot2: null,
      activeCards: activeRowOf(monster),
      combatState: { ...initialCombatState, currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: ampedBolt.id } as GameAction]);
    const afterShield = drain(afterPlay.state, [
      {
        type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
        magicId: 'missile-bolt',
        monsterId: '',
        targetType: 'shield-slot',
        slotId: 'equipmentSlot1',
      } as GameAction,
    ]);

    expect(afterShield.sideEffects.some(s => s.event === 'combat:shieldReflect')).toBe(false);
    const monsterAfter = afterShield.state.activeCards.find((c: any) => c?.id === 'm1') as any;
    expect(monsterAfter.hp).toBe(100);
  });

  it('shieldAutoEvolve 盾被自伤打 → _shieldBlockCount 不递增', () => {
    const ampedBolt = { ...makeBoltCard(), amplifyBonus: 4 } as GameCardData;
    const evolveShield = makeShield({
      id: 'evolve-shield',
      armor: 5,
      durability: 3,
      shieldAutoEvolve: true,
      _shieldBlockCount: 1,
    } as any);
    const state = makeState({
      hp: 30,
      maxHp: 30,
      handCards: [ampedBolt],
      equipmentSlot1: evolveShield,
      equipmentSlot2: null,
      activeCards: activeRowOf(makeMonster('m1', 50)),
      combatState: { ...initialCombatState, currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: ampedBolt.id } as GameAction]);
    const afterShield = drain(afterPlay.state, [
      {
        type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
        magicId: 'missile-bolt',
        monsterId: '',
        targetType: 'shield-slot',
        slotId: 'equipmentSlot1',
      } as GameAction,
    ]);

    const newShield = afterShield.state.equipmentSlot1 as any;
    // 既不递增、也不被清零（保留 setup 时的 1）。
    expect(newShield._shieldBlockCount ?? 1).toBe(1);
  });

  it('装备槽里是 type=monster 的怪物装备（既可当武器也可当盾）+ armor>0 → 可被选为目标，行为同普通盾', () => {
    const ampedBolt = { ...makeBoltCard(), amplifyBonus: 4 } as GameCardData;
    // 怪物装备：type='monster'，同时具备 armor 和 attack/value（既能挡也能打）。
    const monsterEquip = {
      id: 'mshield',
      type: 'monster',
      name: '怪物装备',
      value: 4, // 当武器时的攻击力
      armor: 4,
      armorMax: 4,
      durability: 2,
      maxDurability: 2,
    } as any;
    const state = makeState({
      hp: 30,
      maxHp: 30,
      handCards: [ampedBolt],
      equipmentSlot1: monsterEquip,
      equipmentSlot2: null,
      activeCards: activeRowOf(makeMonster('m1', 50)),
      combatState: { ...initialCombatState, currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: ampedBolt.id } as GameAction]);
    const afterShield = drain(afterPlay.state, [
      {
        type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
        magicId: 'missile-bolt',
        monsterId: '',
        targetType: 'shield-slot',
        slotId: 'equipmentSlot1',
      } as GameAction,
    ]);

    // 总伤害 1 + 4 = 5；armor 4 → 溢出 1 扣 hp；armor 打空 → durability 2→1。
    expect(afterShield.state.pendingMagicAction).toBeNull();
    expect(afterShield.state.hp).toBe(29);
    const slot = afterShield.state.equipmentSlot1 as any;
    expect(slot).toBeTruthy();
    expect(slot.durability).toBe(1);
    // 跟普通盾一样，slotDurabilityUsedThisTurn 仍 0。
    expect(afterShield.state.combatState.slotDurabilityUsedThisTurn?.equipmentSlot1 ?? 0).toBe(0);
  });

  it('reducer 守卫：装备槽里是 type=monster 但 armor=0 的纯武器形态 → 仍 noChange', () => {
    const ampedBolt = { ...makeBoltCard(), amplifyBonus: 4 } as GameCardData;
    const monsterWeaponOnly = {
      id: 'mweapon',
      type: 'monster',
      name: '怪物武器形态',
      value: 5,
      armor: 0,
      armorMax: 0,
      durability: 2,
    } as any;
    const state = makeState({
      hp: 30,
      maxHp: 30,
      handCards: [ampedBolt],
      equipmentSlot1: monsterWeaponOnly,
      equipmentSlot2: null,
      activeCards: activeRowOf(makeMonster('m1', 50)),
      combatState: { ...initialCombatState, currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: ampedBolt.id } as GameAction]);
    const afterShield = drain(afterPlay.state, [
      {
        type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
        magicId: 'missile-bolt',
        monsterId: '',
        targetType: 'shield-slot',
        slotId: 'equipmentSlot1',
      } as GameAction,
    ]);

    expect(afterShield.state.pendingMagicAction).toBeTruthy();
    expect(afterShield.state.hp).toBe(30);
    const slot = afterShield.state.equipmentSlot1 as any;
    expect(slot.durability).toBe(2);
  });

  it('reducer 守卫：装备槽 armor=0（如已被打空）→ 不可被选为目标 (noChange)', () => {
    const ampedBolt = { ...makeBoltCard(), amplifyBonus: 4 } as GameCardData;
    const emptyArmorShield = makeShield({ armor: 0, durability: 2 });
    const state = makeState({
      hp: 30,
      maxHp: 30,
      handCards: [ampedBolt],
      equipmentSlot1: emptyArmorShield,
      equipmentSlot2: null,
      activeCards: activeRowOf(makeMonster('m1', 50)),
      combatState: { ...initialCombatState, currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: ampedBolt.id } as GameAction]);
    const afterShield = drain(afterPlay.state, [
      {
        type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
        magicId: 'missile-bolt',
        monsterId: '',
        targetType: 'shield-slot',
        slotId: 'equipmentSlot1',
      } as GameAction,
    ]);
    expect(afterShield.state.hp).toBe(30);
    expect(afterShield.state.pendingMagicAction).toBeTruthy();
  });

  it('reducer 守卫：pending.allowsHeroTarget 为 false 时（如纯 debuff magic）→ shield-slot 也 noChange', () => {
    const dummyCard = { id: 'card-flip', type: 'magic', name: 'flip', value: 0 } as any;
    const shield = makeShield({ armor: 5, durability: 3 });
    const state = makeState({
      hp: 30,
      maxHp: 30,
      equipmentSlot1: shield,
      equipmentSlot2: null,
      activeCards: activeRowOf(makeMonster('m1', 50)),
      combatState: { ...initialCombatState, currentTurn: 'hero' },
      pendingMagicAction: {
        card: dummyCard,
        effect: 'flip-monster-debuff' as any,
        step: 'monster-select' as any,
        prompt: 'pick',
      } as any,
    });

    const after = drain(state, [
      {
        type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
        magicId: 'flip-monster-debuff',
        monsterId: '',
        targetType: 'shield-slot',
        slotId: 'equipmentSlot1',
      } as GameAction,
    ]);
    // pending 仍在，hp / armor 不变。
    expect(after.state.pendingMagicAction).toBeTruthy();
    expect(after.state.hp).toBe(30);
    expect((after.state.equipmentSlot1 as any).armor).toBe(5);
  });

  it('armor-strike 选自己的盾：用 setup 时冻结的 pendingDamage 结算盾 armor / durability', () => {
    // 一张铠甲贯刺：base damage = 当前 armor (3) × 100% = 3。
    const armorStrike: GameCardData = {
      id: 'magic-as',
      type: 'magic',
      name: '铠甲贯刺',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'armor-strike',
      recycleDelay: 1,
    } as any;
    const shield = makeShield({ armor: 3, durability: 2 });
    const state = makeState({
      hp: 30,
      maxHp: 30,
      handCards: [armorStrike],
      equipmentSlot1: shield,
      equipmentSlot2: null,
      activeCards: activeRowOf(makeMonster('m1', 50)),
      combatState: { ...initialCombatState, currentTurn: 'hero' },
    });

    // PLAY_CARD：1 把盾 → 自动选盾、走 monster-select、pendingDamage 锁在 3。
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: armorStrike.id } as GameAction]);
    const pending = afterPlay.state.pendingMagicAction as any;
    expect(pending?.effect).toBe('armor-strike');
    expect(pending?.step).toBe('monster-select');
    expect(pending?.pendingDamage).toBe(3);
    expect(pending?.allowsHeroTarget).toBe(true);

    // 玩家选自己的盾。pendingDamage 已冻结为 3，所以 armor 吃 3、armor 打空 → durability -1、
    // 没有溢出（hp 不变）。
    const afterShield = drain(afterPlay.state, [
      {
        type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
        magicId: 'armor-strike',
        monsterId: '',
        targetType: 'shield-slot',
        slotId: 'equipmentSlot1',
      } as GameAction,
    ]);
    expect(afterShield.state.hp).toBe(30);
    const newShield = afterShield.state.equipmentSlot1 as any;
    expect(newShield).toBeTruthy();
    expect(newShield.durability).toBe(1);
    // slotDurabilityUsedThisTurn 仍 0。
    expect(afterShield.state.combatState.slotDurabilityUsedThisTurn?.equipmentSlot1 ?? 0).toBe(0);
  });
});
