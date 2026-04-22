/**
 * Regression: 血怒战符 (bloodrage-attack) 给装备栏加的「临时攻击」必须在 waterfall 时清零。
 *
 * Bug 根因：
 *   `computeDamage`(combat.ts) 历史上把 bloodrage 触发的 +N 加成写到了
 *   `state.berserkTurnBuff`——这是 per-turn 字段，由 `START_TURN` /
 *   `RESET_TURN_STATE` 清零，但 **不在 waterfall 重置列表里**。
 *
 *   而 UI 上 `tempAttackBonus = slotTempAttack + berserkTurnBuff` 是合并显示的，
 *   所以玩家看到的「+N 临时攻击」在 waterfall 时只清掉了 `slotTempAttack` 那部分，
 *   bloodrage 那部分继续挂着。
 *
 * 修复：bloodrage 改写到 `slotTempAttack`——跟卡面文案「临时攻击」语义对齐，
 *      自然进入 `waterfallResetsPure` 的清零范围。
 *      `berserkTurnBuff` 字段保留给 `berserk-gambit`（狂血豪赌）等卡面写
 *      「本回合 +X 伤害」的「per-turn」buff 使用。
 *
 * 这个 spec 钉死的不变量：
 *   1. 自伤命中 + 装备血怒战符：+3 加成进 `slotTempAttack`，**不进** `berserkTurnBuff`。
 *   2. waterfall 一触发：`slotTempAttack` 归零（连带 bloodrage 加成一起清掉）。
 *   3. N 张血怒战符叠加 → 每件 +3，总 +3×N。
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState, GameCardData } from '../types';
import { initialCombatState } from '../constants';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeWeapon(id: string, slotKey: 'equipmentSlot1' | 'equipmentSlot2' = 'equipmentSlot1'): GameCardData {
  return {
    id,
    type: 'weapon',
    name: `Weapon-${slotKey}`,
    value: 3,
    durability: 4,
    maxDurability: 4,
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

function makeMonster(id: string): GameCardData {
  return {
    id,
    type: 'monster',
    name: 'Goblin',
    value: 30,
    hp: 30,
    maxHp: 30,
    attack: 5,
    currentLayer: 3,
    hpLayers: 3,
    fury: 3,
  } as any;
}

describe('血怒战符 — 写 slotTempAttack（不写 berserkTurnBuff），waterfall 时清零', () => {
  it('自伤 → bloodrage +3 加成进 slotTempAttack；berserkTurnBuff 保持不变', () => {
    const state = makeState({
      hp: 30,
      maxHp: 30,
      equipmentSlot1: makeWeapon('w1', 'equipmentSlot1') as any,
      equipmentSlot2: makeWeapon('w2', 'equipmentSlot2') as any,
      amuletSlots: [makeBloodrageAmulet()] as any,
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      berserkTurnBuff: { equipmentSlot1: 0, equipmentSlot2: 0 } as any,
    });

    const after = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 5, source: 'test', selfInflicted: true } as any,
    ]);

    expect(after.state.slotTempAttack.equipmentSlot1).toBe(3);
    expect(after.state.slotTempAttack.equipmentSlot2).toBe(3);
    expect(after.state.berserkTurnBuff.equipmentSlot1).toBe(0);
    expect(after.state.berserkTurnBuff.equipmentSlot2).toBe(0);
  });

  it('叠加 N 张血怒战符：bloodrage 加成 = 3 × N，全写到 slotTempAttack', () => {
    const state = makeState({
      hp: 30,
      maxHp: 30,
      equipmentSlot1: makeWeapon('w1', 'equipmentSlot1') as any,
      equipmentSlot2: makeWeapon('w2', 'equipmentSlot2') as any,
      amuletSlots: [
        makeBloodrageAmulet('br-1'),
        makeBloodrageAmulet('br-2'),
        makeBloodrageAmulet('br-3'),
      ] as any,
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      berserkTurnBuff: { equipmentSlot1: 0, equipmentSlot2: 0 } as any,
    });

    const after = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 3, source: 'test', selfInflicted: true } as any,
    ]);

    expect(after.state.slotTempAttack.equipmentSlot1).toBe(9);
    expect(after.state.slotTempAttack.equipmentSlot2).toBe(9);
    expect(after.state.berserkTurnBuff.equipmentSlot1).toBe(0);
    expect(after.state.berserkTurnBuff.equipmentSlot2).toBe(0);
  });

  it('waterfall 触发：bloodrage 加成（在 slotTempAttack 里）被清零', () => {
    const previewMonster = makeMonster('preview-m1');
    const previewCards = [previewMonster, null, null, null, null] as any;
    const activeCards = [null, null, null, null, null] as any;

    const state = makeState({
      hp: 30,
      maxHp: 30,
      equipmentSlot1: makeWeapon('w1', 'equipmentSlot1') as any,
      equipmentSlot2: makeWeapon('w2', 'equipmentSlot2') as any,
      amuletSlots: [makeBloodrageAmulet()] as any,
      slotTempAttack: { equipmentSlot1: 9, equipmentSlot2: 9 },
      previewCards,
      activeCards,
      remainingDeck: [] as any,
      combatState: { ...initialCombatState, currentTurn: 'hero' },
    });

    const after = reduce(state, { type: 'TRIGGER_WATERFALL' } as any);

    expect(after.state.slotTempAttack.equipmentSlot1).toBe(0);
    expect(after.state.slotTempAttack.equipmentSlot2).toBe(0);
  });

  it('berserk-gambit / ADD_BERSERK_BUFF 仍然写到 berserkTurnBuff（不受本次重构影响）', () => {
    const state = makeState({
      berserkTurnBuff: { equipmentSlot1: 0, equipmentSlot2: 0 } as any,
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
    });

    const after = reduce(state, { type: 'ADD_BERSERK_BUFF', amount: 4 } as any);

    expect(after.state.berserkTurnBuff.equipmentSlot1).toBe(4);
    expect(after.state.berserkTurnBuff.equipmentSlot2).toBe(4);
    expect(after.state.slotTempAttack.equipmentSlot1).toBe(0);
    expect(after.state.slotTempAttack.equipmentSlot2).toBe(0);
  });
});
