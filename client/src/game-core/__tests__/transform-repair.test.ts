/**
 * 回归：蜕变修复 (knightEffect: 'transform-repair') 的「转型」触发判定。
 *
 * Bug：magic-effects.ts 的 case 'transform-repair' 创建 pendingMagicAction 时
 * 既没有计算 transformTriggered，也没有透传 echoMultiplier，导致 hero.ts
 * 在 RESOLVE_MAGIC_SLOT_SELECTION 时 (pending as any).transformTriggered 永远为
 * undefined，「转型」分支永远不进入；同样回响 ×2 也无法翻倍 +3 临时攻击。
 *
 * 必须在 PLAY 阶段（magic-effects.ts）就完成 transformTriggered 判定并写入
 * pendingMagicAction：本卡的 RESOLVE_MAGIC 末尾会 enqueue
 * APPLY_TRANSFORM_CATEGORY，待玩家选完槽位后 hero.ts 再读时
 * lastPlayedCardCategory 已被覆盖为本卡自身类别（perm-magic）。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { EquipmentItem } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] } as any,
    slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
    ...overrides,
  };
}

function makeTransformRepairCard(suffix = ''): GameCardData {
  return {
    id: `knight-transform-repair${suffix}`,
    type: 'magic',
    name: '蜕变修复',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    magicEffect: '修复 1 耐久，转型 +3(递增) 临时攻击。',
    knightEffect: 'transform-repair',
    transformBonus: '给该装备栏 +3 临时攻击（每次触发后数值 +1）',
  } as GameCardData;
}

function makeWeapon(id: string, durability = 2, maxDurability = 4): EquipmentItem {
  return {
    id,
    type: 'weapon',
    name: `Sword-${id}`,
    value: 3,
    image: '',
    durability,
    maxDurability,
  } as EquipmentItem;
}

describe('蜕变修复 (transform-repair) — 转型触发', () => {
  it('上一张牌为 event（不同类）→ 转型触发，装备栏 +3 临时攻击 + 修耐久', () => {
    const card = makeTransformRepairCard('-1');
    const weapon = makeWeapon('w1', 2, 4);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: weapon,
      lastPlayedCardCategory: 'event',
      transformChainPrevCategory: 'event',
    });

    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // 玩家此时应在 slot-select 阶段，且 transformTriggered 已写入 pending。
    const pending = result.state.pendingMagicAction as any;
    expect(pending).not.toBeNull();
    expect(pending.effect).toBe('transform-repair');
    expect(pending.transformTriggered).toBe(true);
    expect(pending.echoMultiplier).toBe(1);

    // 玩家选择左装备栏 → 转型生效。
    result = drain(result.state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(3);
    expect(result.state.equipmentSlot1?.durability).toBe(3);
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('上一张牌也是 perm-magic（同类）→ 转型不触发，仅修耐久', () => {
    const card = makeTransformRepairCard('-2');
    const weapon = makeWeapon('w2', 2, 4);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: weapon,
      lastPlayedCardCategory: 'perm-magic',
      transformChainPrevCategory: 'perm-magic',
    });

    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const pending = result.state.pendingMagicAction as any;
    expect(pending.transformTriggered).toBe(false);

    result = drain(result.state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.slotTempAttack?.equipmentSlot1 ?? 0).toBe(0);
    expect(result.state.equipmentSlot1?.durability).toBe(3);
  });

  it('首次出牌（lastPlayedCardCategory 为 null）→ 转型不触发', () => {
    const card = makeTransformRepairCard('-3');
    const weapon = makeWeapon('w3', 2, 4);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: weapon,
      lastPlayedCardCategory: null,
      transformChainPrevCategory: null,
    });

    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const pending = result.state.pendingMagicAction as any;
    expect(pending.transformTriggered).toBe(false);

    result = drain(result.state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.slotTempAttack?.equipmentSlot1 ?? 0).toBe(0);
  });

  it('回响×2 时 transform-repair：耐久 +2 且转型临时攻击 +6', () => {
    const card = makeTransformRepairCard('-4');
    const weapon = makeWeapon('w4', 1, 5);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: weapon,
      lastPlayedCardCategory: 'event',
      transformChainPrevCategory: 'event',
      doubleNextMagic: true,
    });

    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const pending = result.state.pendingMagicAction as any;
    expect(pending.transformTriggered).toBe(true);
    expect(pending.echoMultiplier).toBe(2);

    result = drain(result.state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.equipmentSlot1?.durability).toBe(3);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(6);
  });

  it('多次触发：_transformRepairTriggers 累加，下次基础值 +1', () => {
    const card = makeTransformRepairCard('-5');
    (card as any)._transformRepairTriggers = 2;
    const weapon = makeWeapon('w5', 1, 5);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: weapon,
      lastPlayedCardCategory: 'event',
      transformChainPrevCategory: 'event',
    });

    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    result = drain(result.state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(5);
  });
});
