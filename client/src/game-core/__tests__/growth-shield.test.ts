/**
 * 「生长之盾」专属护盾测试
 *
 * 覆盖：
 *   1. amplifyOnFlip：装备时每次卡牌翻转触发 AMPLIFY_CARDS_BY_NAME(name, +2)，
 *      所有同名副本（含手牌/职业牌组等）累计获得 +2 护甲与护甲上限。
 *   2. amplifyOnFlip：未装备（仅在手牌/坟场）时不触发。
 *   3. amplifyOnFlip：左右两个槽位都装备同名时仅触发一次（去重）。
 *   4. graveyard-event-to-hand 遗言：从坟场随机抽出一张 Event 到手牌；
 *      非 Event 卡不会被选中；坟场无 Event 时静默失败（不抽卡）。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { computeEquipmentBreakEffects } from '../rules/equipment-effects';
import { computeAmuletEffects } from '../equipment';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import { createRng } from '../rng';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeGrowthShield(idSuffix = 'gs', overrides: Partial<GameCardData> = {}): EquipmentItem {
  return {
    id: `shield-${idSuffix}`,
    type: 'shield',
    name: '生长之盾',
    value: 1,
    image: '',
    durability: 3,
    maxDurability: 3,
    armorMax: 1,
    amplifyOnFlip: true,
    onDestroyEffect: 'graveyard-event-to-hand',
    ...overrides,
  } as EquipmentItem;
}

function makeFlippablePotion(id: string): GameCardData {
  return {
    id, type: 'potion', name: `pot-${id}`, value: 0, image: '',
    flipTarget: {
      toCard: { id: `${id}-flipped`, type: 'potion', name: 'flipped', value: 0, image: '' } as GameCardData,
      destination: 'graveyard',
    },
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// amplifyOnFlip
// ---------------------------------------------------------------------------

describe('生长之盾 — amplifyOnFlip', () => {
  it('equipped: each forward flip enqueues AMPLIFY_CARDS_BY_NAME(+2) for the shield name', () => {
    const equipped = makeGrowthShield('eq');
    const fwd = makeFlippablePotion('p-flip');
    const state = makeState({
      activeCards: [fwd, null, null, null, null] as ActiveRowSlots,
      equipmentSlot1: equipped,
    });

    const result = reduce(state, { type: 'APPLY_CARD_FLIP', card: fwd, cellIndex: 0 } as GameAction);
    const amplifyActions = result.enqueuedActions.filter(a => a.type === 'AMPLIFY_CARDS_BY_NAME');
    expect(amplifyActions).toHaveLength(1);
    expect((amplifyActions[0] as any).cardName).toBe('生长之盾');
    expect((amplifyActions[0] as any).amount).toBe(2);
  });

  it('equipped: after pipeline drain, the shield armorMax/value have been bumped by +2 and amplifyBonus tracked', () => {
    const equipped = makeGrowthShield('eq2');
    const fwd = makeFlippablePotion('p-flip2');
    const state = makeState({
      activeCards: [fwd, null, null, null, null] as ActiveRowSlots,
      equipmentSlot1: equipped,
      rng: createRng(7),
    });

    const result = drain(state, [{ type: 'APPLY_CARD_FLIP', card: fwd, cellIndex: 0 } as GameAction]);
    const slot = result.state.equipmentSlot1 as any;
    expect(slot.value).toBe(3);
    expect(slot.armorMax).toBe(3);
    expect(slot.amplifyBonus).toBe(2);
    expect(result.state.amplifiedCardBonus['生长之盾']).toBe(2);
  });

  it('not equipped: a copy sitting only in hand does NOT trigger amplification on flip', () => {
    const inHand = makeGrowthShield('hand');
    const fwd = makeFlippablePotion('p-flip3');
    const state = makeState({
      activeCards: [fwd, null, null, null, null] as ActiveRowSlots,
      handCards: [inHand as unknown as GameCardData],
    });

    const result = reduce(state, { type: 'APPLY_CARD_FLIP', card: fwd, cellIndex: 0 } as GameAction);
    const amplifyActions = result.enqueuedActions.filter(a => a.type === 'AMPLIFY_CARDS_BY_NAME');
    expect(amplifyActions).toHaveLength(0);
  });

  it('both slots holding the same-name shield: only one amplify action enqueued (deduped)', () => {
    const a = makeGrowthShield('a');
    const b = makeGrowthShield('b');
    const fwd = makeFlippablePotion('p-dup');
    const state = makeState({
      activeCards: [fwd, null, null, null, null] as ActiveRowSlots,
      equipmentSlot1: a,
      equipmentSlot2: b,
    });

    const result = reduce(state, { type: 'APPLY_CARD_FLIP', card: fwd, cellIndex: 0 } as GameAction);
    const amplifyActions = result.enqueuedActions.filter(a2 => a2.type === 'AMPLIFY_CARDS_BY_NAME');
    expect(amplifyActions).toHaveLength(1);
    expect((amplifyActions[0] as any).cardName).toBe('生长之盾');
  });
});

// ---------------------------------------------------------------------------
// graveyard-event-to-hand last words
// ---------------------------------------------------------------------------

function makeEvent(id: string, name = `event-${id}`): GameCardData {
  return { id, type: 'event', name, value: 0, image: '' } as GameCardData;
}

describe('生长之盾 — graveyard-event-to-hand 遗言', () => {
  it('on destroy: a random Event card from graveyard is moved to hand (computeEquipmentBreakEffects)', () => {
    const evt = makeEvent('e1', '神秘事件');
    const mob: GameCardData = { id: 'mob1', type: 'monster', name: 'mob', value: 0, hp: 0, maxHp: 5, attack: 2, image: '' } as GameCardData;
    const shield = makeGrowthShield('br1', { durability: 1, maxDurability: 1 });
    const state = makeState({
      rng: createRng(42),
      equipmentSlot1: shield,
      discardedCards: [mob, evt],
    });
    const ae = computeAmuletEffects(state.amuletSlots);

    const breakResult = computeEquipmentBreakEffects(state, 'equipmentSlot1', shield as GameCardData, ae);

    expect(breakResult.patch.handCards).toBeDefined();
    expect(breakResult.patch.handCards!.some(c => c.id === evt.id)).toBe(true);
    expect(breakResult.patch.discardedCards).toBeDefined();
    expect(breakResult.patch.discardedCards!.some(c => c.id === evt.id)).toBe(false);
    expect(breakResult.patch.discardedCards!.some(c => c.id === mob.id)).toBe(true);
  });

  it('on destroy: when graveyard contains no Event cards, last-words silently fails (hand untouched, mob still there)', () => {
    const mob: GameCardData = { id: 'mob2', type: 'monster', name: 'mob', value: 0, hp: 0, maxHp: 5, attack: 2, image: '' } as GameCardData;
    const shield = makeGrowthShield('br2', { durability: 1, maxDurability: 1 });
    const state = makeState({
      rng: createRng(42),
      equipmentSlot1: shield,
      discardedCards: [mob],
    });
    const ae = computeAmuletEffects(state.amuletSlots);

    const breakResult = computeEquipmentBreakEffects(state, 'equipmentSlot1', shield as GameCardData, ae);

    // Hand was not modified — no Event was eligible to move.
    expect(breakResult.patch.handCards).toBeUndefined();
    // Mob still in graveyard; only the broken shield itself was added on top.
    expect(breakResult.patch.discardedCards!.some(c => c.id === mob.id)).toBe(true);
    expect(breakResult.patch.discardedCards!.some(c => c.id === shield.id)).toBe(true);
  });

  it('on destroy: only Event cards are eligible — non-event cards (e.g. potion) are skipped even if present', () => {
    const evt = makeEvent('e-ok', '可选事件');
    const potion: GameCardData = { id: 'p-no', type: 'potion', name: 'pot', value: 0, image: '' } as GameCardData;
    const mob: GameCardData = { id: 'mob3', type: 'monster', name: 'mob', value: 0, hp: 0, maxHp: 5, attack: 2, image: '' } as GameCardData;
    const shield = makeGrowthShield('br3', { durability: 1, maxDurability: 1 });
    const state = makeState({
      rng: createRng(7),
      equipmentSlot1: shield,
      discardedCards: [potion, mob, evt],
    });
    const ae = computeAmuletEffects(state.amuletSlots);

    const breakResult = computeEquipmentBreakEffects(state, 'equipmentSlot1', shield as GameCardData, ae);

    expect(breakResult.patch.handCards!.some(c => c.id === evt.id)).toBe(true);
    expect(breakResult.patch.handCards!.some(c => c.id === potion.id)).toBe(false);
    expect(breakResult.patch.discardedCards!.some(c => c.id === potion.id)).toBe(true);
    expect(breakResult.patch.discardedCards!.some(c => c.id === mob.id)).toBe(true);
  });
});
