/**
 * 蜕变修复 (knightEffect: 'transform-repair') 「侧击」触发判定。
 *
 * 历史背景：早期实现挂在「转型」上（同类→不同类切换时触发），现已迁移为「侧击」
 * 触发——放在手牌最左 / 最右位置打出时生效。卡面 / 文案 / 触发条件全部统一到
 * flankEffect / `_flankRepairTriggers` / `pendingMagicAction.flankTriggered` 系统。
 *
 * `magic-effects.ts` 的 case 'transform-repair' 在创建 `pendingMagicAction` 时把
 * `flankTriggered: !!isFlank` 透传进去（isFlank 由 `reducePlayCard` 计算并经
 * RESOLVE_MAGIC.isFlank → resolveKnightPermanentMagic.isFlank 传入），等玩家
 * 选完槽位后由 `hero.ts` `RESOLVE_MAGIC_SLOT_SELECTION` 读取并应用。
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
    phase: 'playerInput',
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
    magicEffect: '修复 1 耐久，侧击 +1(递增) 临时攻击。',
    knightEffect: 'transform-repair',
    flankEffect: '给该装备栏 +1 临时攻击（每次触发后数值 +1）',
  } as GameCardData;
}

function makeFiller(id: string): GameCardData {
  return {
    id,
    type: 'magic' as const,
    name: `Filler-${id}`,
    value: 0,
    image: '',
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

describe('蜕变修复 (transform-repair) — 侧击触发', () => {
  it('源卡在最左（leftmost flank）→ 侧击触发，装备栏 +1 临时攻击 + 修耐久', () => {
    const card = makeTransformRepairCard('-1');
    const filler1 = makeFiller('f1');
    const filler2 = makeFiller('f2');
    const weapon = makeWeapon('w1', 2, 4);
    const state = makeState({
      handCards: [card, filler1, filler2],
      equipmentSlot1: weapon,
    });

    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const pending = result.state.pendingMagicAction as any;
    expect(pending).not.toBeNull();
    expect(pending.effect).toBe('transform-repair');
    expect(pending.flankTriggered).toBe(true);
    expect(pending.echoMultiplier).toBe(1);

    result = drain(result.state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(1);
    expect(result.state.equipmentSlot1?.durability).toBe(3);
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('源卡在最右（rightmost flank）→ 侧击触发，装备栏 +1 临时攻击 + 修耐久', () => {
    const card = makeTransformRepairCard('-1b');
    const filler1 = makeFiller('f1');
    const filler2 = makeFiller('f2');
    const weapon = makeWeapon('w1b', 2, 4);
    const state = makeState({
      handCards: [filler1, filler2, card],
      equipmentSlot1: weapon,
    });

    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const pending = result.state.pendingMagicAction as any;
    expect(pending.flankTriggered).toBe(true);

    result = drain(result.state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(1);
    expect(result.state.equipmentSlot1?.durability).toBe(3);
  });

  it('源卡在中间位置（非 flank）→ 侧击不触发，仅修耐久', () => {
    const card = makeTransformRepairCard('-2');
    const filler1 = makeFiller('f1');
    const filler2 = makeFiller('f2');
    const weapon = makeWeapon('w2', 2, 4);
    const state = makeState({
      handCards: [filler1, card, filler2],
      equipmentSlot1: weapon,
    });

    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const pending = result.state.pendingMagicAction as any;
    expect(pending.flankTriggered).toBe(false);

    result = drain(result.state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.slotTempAttack?.equipmentSlot1 ?? 0).toBe(0);
    expect(result.state.equipmentSlot1?.durability).toBe(3);
  });

  it('回响×2 时侧击触发：耐久 +2 且临时攻击 +2', () => {
    const card = makeTransformRepairCard('-4');
    const filler = makeFiller('f1');
    const weapon = makeWeapon('w4', 1, 5);
    const state = makeState({
      handCards: [card, filler],
      equipmentSlot1: weapon,
      doubleNextMagic: true,
    });

    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const pending = result.state.pendingMagicAction as any;
    expect(pending.flankTriggered).toBe(true);
    expect(pending.echoMultiplier).toBe(2);

    result = drain(result.state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.equipmentSlot1?.durability).toBe(3);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(2);
  });

  it('多次触发：_flankRepairTriggers 累加，下次基础值 +1', () => {
    const card = makeTransformRepairCard('-5');
    (card as any)._flankRepairTriggers = 2;
    const filler = makeFiller('f1');
    const weapon = makeWeapon('w5', 1, 5);
    const state = makeState({
      handCards: [card, filler],
      equipmentSlot1: weapon,
    });

    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    result = drain(result.state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(3);
  });
});
