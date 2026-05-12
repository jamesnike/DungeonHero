/**
 * 「生长之盾」专属护盾测试
 *
 * 覆盖：
 *   1. amplifyOnFlip：装备时每次卡牌翻转触发 AMPLIFY_CARDS_BY_NAME(name, +1)，
 *      所有同名副本（含手牌/职业牌组等）累计获得 +1 护甲与护甲上限。
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
    value: 2,
    image: '',
    durability: 3,
    maxDurability: 3,
    armorMax: 2,
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
  it('equipped: each forward flip enqueues AMPLIFY_CARDS_BY_NAME(+1) for the shield name', () => {
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
    expect((amplifyActions[0] as any).amount).toBe(1);
  });

  it('equipped: after pipeline drain, the shield armorMax/value have been bumped by +1 and amplifyBonus tracked', () => {
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
    expect(slot.amplifyBonus).toBe(1);
    expect(result.state.amplifiedCardBonus['生长之盾']).toBe(1);
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
// amplifyOnFlip — reverse flips (back-flip via _flipBackCard)
//
// Back-flips don't go through APPLY_CARD_FLIP, so each path that performs a
// back-flip must call applyFlipCounters explicitly. These tests cover the 3
// known back-flip paths:
//
//   1. 血誓回卷 single-target auto-resolve (rules/magic-effects.ts case 'flip-back-active')
//   2. 血誓回卷 multi-target selection (rules/hero.ts case 'flip-back-active')
//   3. 翻转之契 flipAllActiveRow event token (events.ts)
//
// Regression: 生长之盾 装备时 Event 牌「被翻回去」（back-flip）原本不触发增幅。
// ---------------------------------------------------------------------------

/** Helper: a "post-flip" active-row card with `_flipBackCard` pointing at the original. */
function makeBackFlippedCard(idSuffix: string, name: string, originalName: string): GameCardData {
  const original: GameCardData = {
    id: `${idSuffix}-orig`, type: 'event' as any, name: originalName, value: 0, image: '',
  } as GameCardData;
  return {
    id: idSuffix, type: 'event' as any, name, value: 0, image: '',
    _flipBackCard: original,
  } as GameCardData;
}

function makeBloodOathScroll(idSuffix: string): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic',
    name: '血誓回卷',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    magicEffect: '将一张已翻转的牌翻回去。',
    knightEffect: 'flip-back-active',
    onEnterHandEffect: 'blood-oath-scroll-onhand',
    description: 'test',
    recycleDelay: 2,
  } as any;
}

describe('生长之盾 — amplifyOnFlip on reverse flips (back-flip)', () => {
  it('血誓回卷 single-target auto-resolve: back-flipping an Event triggers amplify (+1)', () => {
    const equipped = makeGrowthShield('rev1');
    const scroll = makeBloodOathScroll('rev1');
    const flipped = makeBackFlippedCard('flipped-1', '宝箱（已开启）', '神秘宝箱');
    const state = makeState({
      handCards: [scroll],
      hp: 20,
      activeCards: [null, null, flipped, null, null] as ActiveRowSlots,
      equipmentSlot1: equipped,
      rng: createRng(11),
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: scroll.id } as GameAction]);

    // Sanity: back-flip happened.
    const cell = (result.state.activeCards as (GameCardData | null)[])[2];
    expect(cell?.id).toBe('flipped-1-orig');

    // Shield amplifyBonus / armorMax bumped via the AMPLIFY_CARDS_BY_NAME pipeline.
    const slot = result.state.equipmentSlot1 as any;
    expect(slot.amplifyBonus).toBe(1);
    expect(slot.armorMax).toBe(3);
    expect(slot.value).toBe(3);
    expect(result.state.amplifiedCardBonus['生长之盾']).toBe(1);
  });

  it('血誓回卷 multi-target selection (RESOLVE_DUNGEON_CARD_SELECTION): back-flip triggers amplify (+1)', () => {
    const equipped = makeGrowthShield('rev2');
    const scroll = makeBloodOathScroll('rev2');
    const flippedA = makeBackFlippedCard('flippedA', '宝箱（已开启）', '神秘宝箱');
    const flippedB = makeBackFlippedCard('flippedB', '骰盅（已开启）', '命运骰盅');
    const state = makeState({
      handCards: [scroll],
      hp: 20,
      activeCards: [flippedA, null, null, flippedB, null] as ActiveRowSlots,
      equipmentSlot1: equipped,
      rng: createRng(13),
      pendingMagicAction: {
        card: scroll,
        effect: 'flip-back-active',
        step: 'dungeon-select',
        prompt: '选择一张已翻转卡牌。',
      } as any,
    });

    const result = drain(state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'flippedB', targetIndex: 3 } as GameAction,
    ]);

    // Sanity: chosen cell back-flipped.
    const cell = (result.state.activeCards as (GameCardData | null)[])[3];
    expect(cell?.id).toBe('flippedB-orig');
    expect(cell?.name).toBe('命运骰盅');
    // Other flipped card untouched.
    const cellA = (result.state.activeCards as (GameCardData | null)[])[0];
    expect(cellA?.id).toBe('flippedA');

    // Shield amplifyBonus bumped exactly once (one back-flip happened).
    const slot = result.state.equipmentSlot1 as any;
    expect(slot.amplifyBonus).toBe(1);
    expect(slot.armorMax).toBe(3);
    expect(result.state.amplifiedCardBonus['生长之盾']).toBe(1);
  });

  it('翻转之契 flipAllActiveRow: back-flips bump amplify once per back-flipped card', () => {
    const equipped = makeGrowthShield('rev3');
    const backA = makeBackFlippedCard('back-A', '宝箱（已开启）', '神秘宝箱');
    const backB = makeBackFlippedCard('back-B', '骰盅（已开启）', '命运骰盅');
    const state = makeState({
      activeCards: [backA, null, backB, null, null] as ActiveRowSlots,
      equipmentSlot1: equipped,
      rng: createRng(17),
    });

    const result = drain(state, [
      { type: 'APPLY_EVENT_EFFECT', token: 'flipAllActiveRow' } as GameAction,
    ]);

    // Sanity: both cells back-flipped to their originals.
    const cells = result.state.activeCards as (GameCardData | null)[];
    expect(cells[0]?.id).toBe('back-A-orig');
    expect(cells[2]?.id).toBe('back-B-orig');

    // Shield amplifyBonus bumped twice (two back-flips happened).
    const slot = result.state.equipmentSlot1 as any;
    expect(slot.amplifyBonus).toBe(2);
    expect(slot.armorMax).toBe(4);
    expect(slot.value).toBe(4);
    expect(result.state.amplifiedCardBonus['生长之盾']).toBe(2);
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

// ---------------------------------------------------------------------------
// Upgrade-driven amplifyOnFlipAmount: L1+ shields trigger AMPLIFY_CARDS_BY_NAME
// with amount=2 instead of 1.
// ---------------------------------------------------------------------------

describe('生长之盾 — amplifyOnFlipAmount (升级 1/2)', () => {
  it('equipped with amplifyOnFlipAmount=2: each forward flip enqueues AMPLIFY_CARDS_BY_NAME(amount=2)', () => {
    const equipped = makeGrowthShield('eq-l1', { amplifyOnFlipAmount: 2 } as any);
    const fwd = makeFlippablePotion('p-flip-l1');
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

  it('equipped with amplifyOnFlipAmount=2 + drain: shield value/armorMax/amplifyBonus jump by +2 per flip', () => {
    const equipped = makeGrowthShield('eq-l1b', { amplifyOnFlipAmount: 2 } as any);
    const fwd = makeFlippablePotion('p-flip-l1b');
    const state = makeState({
      activeCards: [fwd, null, null, null, null] as ActiveRowSlots,
      equipmentSlot1: equipped,
      rng: createRng(11),
    });

    const result = drain(state, [{ type: 'APPLY_CARD_FLIP', card: fwd, cellIndex: 0 } as GameAction]);
    const slot = result.state.equipmentSlot1 as any;
    expect(slot.amplifyBonus).toBe(2);
    expect(slot.value).toBe(4);
    expect(slot.armorMax).toBe(4);
    expect(result.state.amplifiedCardBonus['生长之盾']).toBe(2);
  });

  it('mixed slots (L0 in slot1, L2 amplifyOnFlipAmount=2 in slot2): dedup picks max amount → +2', () => {
    const lowSlot = makeGrowthShield('mixed-low');
    const highSlot = makeGrowthShield('mixed-high', { amplifyOnFlipAmount: 2 } as any);
    const fwd = makeFlippablePotion('p-mix');
    const state = makeState({
      activeCards: [fwd, null, null, null, null] as ActiveRowSlots,
      equipmentSlot1: lowSlot,
      equipmentSlot2: highSlot,
    });

    const result = reduce(state, { type: 'APPLY_CARD_FLIP', card: fwd, cellIndex: 0 } as GameAction);
    const amplifyActions = result.enqueuedActions.filter(a => a.type === 'AMPLIFY_CARDS_BY_NAME');
    expect(amplifyActions).toHaveLength(1);
    expect((amplifyActions[0] as any).cardName).toBe('生长之盾');
    expect((amplifyActions[0] as any).amount).toBe(2);
  });

  it('amplifyOnFlipAmount missing or 1 keeps legacy behavior (amount=1)', () => {
    const equipped = makeGrowthShield('legacy');
    const fwd = makeFlippablePotion('p-legacy');
    const state = makeState({
      activeCards: [fwd, null, null, null, null] as ActiveRowSlots,
      equipmentSlot1: equipped,
    });

    const result = reduce(state, { type: 'APPLY_CARD_FLIP', card: fwd, cellIndex: 0 } as GameAction);
    const amplifyActions = result.enqueuedActions.filter(a => a.type === 'AMPLIFY_CARDS_BY_NAME');
    expect(amplifyActions).toHaveLength(1);
    expect((amplifyActions[0] as any).amount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Upgrade-driven onDestroyEventCount: L2 shield pulls 3 events on destroy
// instead of 1.
// ---------------------------------------------------------------------------

describe('生长之盾 — onDestroyEventCount (升级 2)', () => {
  it('on destroy with onDestroyEventCount=3: 3 distinct Event cards move from graveyard to hand', () => {
    const e1 = makeEvent('e1', '事件A');
    const e2 = makeEvent('e2', '事件B');
    const e3 = makeEvent('e3', '事件C');
    const e4 = makeEvent('e4', '事件D');
    const mob: GameCardData = { id: 'mob-l2', type: 'monster', name: 'mob', value: 0, hp: 0, maxHp: 5, attack: 2, image: '' } as GameCardData;
    const shield = makeGrowthShield('br-l2', {
      durability: 1,
      maxDurability: 1,
      onDestroyEventCount: 3,
    } as any);
    const state = makeState({
      rng: createRng(99),
      equipmentSlot1: shield,
      discardedCards: [e1, e2, e3, e4, mob],
    });
    const ae = computeAmuletEffects(state.amuletSlots);

    const breakResult = computeEquipmentBreakEffects(state, 'equipmentSlot1', shield as GameCardData, ae);

    const hand = breakResult.patch.handCards ?? [];
    const grave = breakResult.patch.discardedCards ?? [];
    const eventIdsInHand = hand.filter(c => c.type === 'event').map(c => c.id);
    expect(eventIdsInHand.length).toBe(3);
    // All picked ids must be distinct (no duplicates).
    expect(new Set(eventIdsInHand).size).toBe(3);
    // Each picked event is removed from graveyard.
    for (const id of eventIdsInHand) {
      expect(grave.some(c => c.id === id)).toBe(false);
    }
    // Mob still in graveyard; 4th event remained.
    expect(grave.some(c => c.id === mob.id)).toBe(true);
    expect(grave.filter(c => c.type === 'event').length).toBe(1);
  });

  it('on destroy with onDestroyEventCount=3 but only 1 Event in graveyard: silently truncates to that 1 (no error)', () => {
    const evt = makeEvent('e-only', '唯一事件');
    const mob: GameCardData = { id: 'mob-l2b', type: 'monster', name: 'mob', value: 0, hp: 0, maxHp: 5, attack: 2, image: '' } as GameCardData;
    const shield = makeGrowthShield('br-l2b', {
      durability: 1,
      maxDurability: 1,
      onDestroyEventCount: 3,
    } as any);
    const state = makeState({
      rng: createRng(101),
      equipmentSlot1: shield,
      discardedCards: [evt, mob],
    });
    const ae = computeAmuletEffects(state.amuletSlots);

    const breakResult = computeEquipmentBreakEffects(state, 'equipmentSlot1', shield as GameCardData, ae);

    expect(breakResult.patch.handCards!.some(c => c.id === evt.id)).toBe(true);
    // Only 1 event entered hand; no duplicate or crash.
    expect(breakResult.patch.handCards!.filter(c => c.type === 'event').length).toBe(1);
    expect(breakResult.patch.discardedCards!.some(c => c.id === mob.id)).toBe(true);
    expect(breakResult.patch.discardedCards!.some(c => c.id === evt.id)).toBe(false);
  });

  it('on destroy with onDestroyEventCount=3 but no Event in graveyard: hand untouched, last-words silent (parity with base)', () => {
    const mob: GameCardData = { id: 'mob-l2c', type: 'monster', name: 'mob', value: 0, hp: 0, maxHp: 5, attack: 2, image: '' } as GameCardData;
    const shield = makeGrowthShield('br-l2c', {
      durability: 1,
      maxDurability: 1,
      onDestroyEventCount: 3,
    } as any);
    const state = makeState({
      rng: createRng(103),
      equipmentSlot1: shield,
      discardedCards: [mob],
    });
    const ae = computeAmuletEffects(state.amuletSlots);

    const breakResult = computeEquipmentBreakEffects(state, 'equipmentSlot1', shield as GameCardData, ae);

    expect(breakResult.patch.handCards).toBeUndefined();
    expect(breakResult.patch.discardedCards!.some(c => c.id === mob.id)).toBe(true);
    expect(breakResult.patch.discardedCards!.some(c => c.id === shield.id)).toBe(true);
  });
});
