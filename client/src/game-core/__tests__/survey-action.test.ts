/**
 * 查阅动作 (Survey Action) — Starter Perm 1 magic tests
 *
 * Covers:
 *   1. Main effect: draws 1 card from backpack on PLAY_CARD.
 *   2. Echo (doubleNextMagic) doubles the draw count.
 *   3. Empty backpack → no draws but card still finalizes.
 *   4. 上手: random slot gains slotTempAttack +1 (default level).
 *   5. 上手 upgrade level 1 → +2 instead of +1.
 *   6. End-to-end ADD_CARD_TO_HAND triggers 上手 via the pipeline.
 *   7. _skipOnEnterHand: true (clones / copies) does NOT trigger 上手.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import { createRng } from '../rng';
import { STARTER_CARD_IDS } from '../deck';
// Importing this barrel registers the on-enter-hand handler.
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

// id 必须使用 getStarterBaseId 能 strip 的后缀（-pick-N），否则
// resolvePermanentMagic 的 starter 路由匹配不到 STARTER_CARD_IDS.surveyAction。
let _seq = 0;
function makeSurveyAction(_idSuffix = 'survey', overrides: Partial<GameCardData> = {}): GameCardData {
  _seq += 1;
  return {
    id: `${STARTER_CARD_IDS.surveyAction}-pick-${_seq}`,
    type: 'magic',
    name: '查阅动作',
    value: 0,
    image: '',
    magicType: 'permanent',
    magicEffect: '永久魔法：从背包抽 1 张牌。',
    description: 'test',
    recycleDelay: 1,
    onEnterHandEffect: 'survey-action-onhand',
    ...overrides,
  } as any;
}

function makeBackpackFiller(idSuffix: string): GameCardData {
  return {
    id: `bp-${idSuffix}`,
    type: 'potion',
    name: `背包卡${idSuffix}`,
    value: 0,
    image: '',
  } as any;
}

// ---------------------------------------------------------------------------
// 主效果：抽牌
// ---------------------------------------------------------------------------

describe('查阅动作 主效果 (从背包抽 1 张)', () => {
  it('draws exactly 1 card from backpack to hand on PLAY_CARD', () => {
    const card = makeSurveyAction('main-1');
    const fillers = [makeBackpackFiller('a'), makeBackpackFiller('b'), makeBackpackFiller('c')];
    const state = makeState({
      handCards: [card],
      backpackItems: fillers,
      handSize: 10,
    });
    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);
    const drawnInHand = result.state.handCards.filter(c => c.id.startsWith('bp-')).length;
    expect(drawnInHand).toBe(1);
    expect(result.state.backpackItems.length).toBe(2);
    expect(result.state.handCards.some(c => c.id === card.id)).toBe(false);
  });

  it('still finalizes when backpack is empty (no draws but no error)', () => {
    const card = makeSurveyAction('main-empty');
    const state = makeState({
      handCards: [card],
      backpackItems: [],
    });
    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);
    expect(result.state.handCards.some(c => c.id === card.id)).toBe(false);
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('echo (doubleNextMagic) doubles draws (1 → 2)', () => {
    const card = makeSurveyAction('echo');
    const fillers = Array.from({ length: 5 }, (_, i) => makeBackpackFiller(`e${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: fillers,
      handSize: 10,
      doubleNextMagic: true,
    });
    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);
    const drawnInHand = result.state.handCards.filter(c => c.id.startsWith('bp-')).length;
    expect(drawnInHand).toBe(2);
  });

  it('does NOT scale the draw count with upgradeLevel (only on-hand buff scales)', () => {
    const card = makeSurveyAction('lv1', { upgradeLevel: 1 } as any);
    const fillers = Array.from({ length: 5 }, (_, i) => makeBackpackFiller(`u${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: fillers,
      handSize: 10,
    });
    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);
    const drawnInHand = result.state.handCards.filter(c => c.id.startsWith('bp-')).length;
    expect(drawnInHand).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 上手
// ---------------------------------------------------------------------------

describe('查阅动作 上手 (survey-action-onhand)', () => {
  it('adds +1 to slotTempAttack of one random slot at base level', () => {
    const card = makeSurveyAction('onhand-base');
    const state = makeState({
      handCards: [card],
      rng: createRng(42),
    });
    const result = reduce(state, { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction);
    const left = result.state.slotTempAttack?.equipmentSlot1 ?? 0;
    const right = result.state.slotTempAttack?.equipmentSlot2 ?? 0;
    expect(left + right).toBe(1);
    expect(left === 1 || right === 1).toBe(true);
  });

  it('adds +2 instead of +1 when upgradeLevel >= 1', () => {
    const card = makeSurveyAction('onhand-lv1', { upgradeLevel: 1 } as any);
    const state = makeState({
      handCards: [card],
      rng: createRng(7),
    });
    const result = reduce(state, { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction);
    const left = result.state.slotTempAttack?.equipmentSlot1 ?? 0;
    const right = result.state.slotTempAttack?.equipmentSlot2 ?? 0;
    expect(left + right).toBe(2);
    expect(left === 2 || right === 2).toBe(true);
  });

  it('advances rng when picking the slot', () => {
    const card = makeSurveyAction('onhand-rng');
    const initialRng = createRng(123);
    const state = makeState({ handCards: [card], rng: initialRng });
    const result = reduce(state, { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction);
    expect(result.state.rng).not.toBe(initialRng);
  });

  it('fires automatically via pipeline when ADD_CARD_TO_HAND adds the card', () => {
    const card = makeSurveyAction('onhand-pipeline');
    const state = makeState({ handCards: [], rng: createRng(99) });
    const result = drain(state, [{ type: 'ADD_CARD_TO_HAND', card } as GameAction]);
    expect(result.state.handCards.some(c => c.id === card.id)).toBe(true);
    const left = result.state.slotTempAttack?.equipmentSlot1 ?? 0;
    const right = result.state.slotTempAttack?.equipmentSlot2 ?? 0;
    expect(left + right).toBe(1);
  });

  it('does NOT trigger for cards marked _skipOnEnterHand: true (clones / copies)', () => {
    const card = { ...makeSurveyAction('onhand-clone'), _skipOnEnterHand: true } as any;
    const state = makeState({ handCards: [], rng: createRng(99) });
    const result = drain(state, [{ type: 'ADD_CARD_TO_HAND', card } as GameAction]);
    const left = result.state.slotTempAttack?.equipmentSlot1 ?? 0;
    const right = result.state.slotTempAttack?.equipmentSlot2 ?? 0;
    expect(left + right).toBe(0);
  });

  it('stacks with existing slotTempAttack rather than overwriting it', () => {
    const card = makeSurveyAction('onhand-stack');
    const state = makeState({
      handCards: [card],
      rng: createRng(1),
      slotTempAttack: { equipmentSlot1: 3, equipmentSlot2: 5 },
    });
    const result = reduce(state, { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction);
    const left = result.state.slotTempAttack?.equipmentSlot1 ?? 0;
    const right = result.state.slotTempAttack?.equipmentSlot2 ?? 0;
    // Total should be 3 + 5 + 1 = 9 (the random slot gained +1).
    expect(left + right).toBe(9);
  });
});
