/**
 * 乾坤一翻 — Preview Row 翻面拓展测试
 *
 * 覆盖：
 *   1) 0 active 可翻 + 1 preview 卡背 → 自动结算翻 preview，previewRevealedEarly[idx]=true。
 *   2) Preview-only auto-resolve 也触发所有 7 个翻转计数器（flip-gold / persuade-on-flip /
 *      flipDebuffMonsterId / _flipRepairBuff / flip-overkill-lifesteal / flip-zap /
 *      amplifyOnFlip）—— 抽样验证关键几个。
 *   3) RESOLVE_DUNGEON_CARD_SELECTION 选 preview 卡背 → 同样翻面 + 触发计数器。
 *   4) Echo ×2：1 active + 1 preview → 第一次选完后 pendingMagicAction 仍存在，
 *      可继续选第二个。两次都翻成功。
 *   5) waterfall (drop+deal) 后 previewRevealedEarly 复位。
 *   6) 已经被翻过的 preview 格不再算可选目标。
 *   7) Resolver：active+preview 都没有 → consumed + banner，没有翻面也没有计数器触发。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { STARTER_CARD_IDS } from '../deck';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, EquipmentItem, AmuletItem } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

let pickCounter = 100;
function makePactCard(): GameCardData {
  pickCounter += 1;
  return {
    id: `${STARTER_CARD_IDS.activeRowFlip}-pick-${pickCounter}`,
    type: 'magic',
    name: '乾坤一翻',
    value: 0,
    image: '',
    magicType: 'permanent',
    description: '',
    recycleDelay: 2,
    maxUpgradeLevel: 0,
  } as GameCardData;
}

function makeMonster(id: string, attack = 4, hp = 5): GameCardData {
  return {
    id, type: 'monster', name: `mon-${id}`, value: hp,
    hp, maxHp: hp, attack, fury: 1, currentLayer: 1,
  } as GameCardData;
}

function makeFlippablePotion(id: string): GameCardData {
  return {
    id, type: 'potion', name: `pot-${id}`, value: 0,
    flipTarget: {
      toCard: { id: `${id}-flipped`, type: 'potion', name: `flipped-${id}`, value: 0 } as GameCardData,
      destination: 'stay',
    },
  } as GameCardData;
}

// Generic "preview row card-back" — the resolver doesn't read flipTarget for
// preview targets, so any non-null card with a stable id is enough.
function makePreviewCard(id: string): GameCardData {
  return { id, type: 'monster', name: `prev-${id}`, value: 1, hp: 1, maxHp: 1, attack: 1 } as GameCardData;
}

function makeAmulet(amuletEffect: string, id: string, name: string): AmuletItem {
  return { id, type: 'amulet', name, value: 0, amuletEffect } as AmuletItem;
}

const EMPTY_ROW: ActiveRowSlots = [null, null, null, null, null];

// ---------------------------------------------------------------------------
// 1) Auto-resolve: 0 active + 1 preview → preview 翻面
// ---------------------------------------------------------------------------

describe('乾坤一翻 — preview-row 自动结算', () => {
  it('active 行无可翻 + preview 行只有 1 张卡背 → 翻 preview 那张，置 previewRevealedEarly[idx]=true', () => {
    const card = makePactCard();
    const previewCard = makePreviewCard('prev-1');
    const state = makeState({
      handCards: [card] as any,
      activeCards: EMPTY_ROW,
      previewCards: [null, null, previewCard, null, null] as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.previewRevealedEarly?.[2]).toBe(true);
    expect(result.state.previewRevealedEarly?.[0]).toBe(false);
    // Preview cell card itself is unchanged — only the visibility flag toggled.
    expect((result.state.previewCards as any[])[2]?.id).toBe('prev-1');
    // pending should be cleared (auto-resolved, not prompting).
    expect(result.state.pendingMagicAction).toBeNull();
    // Custom side effect fired so UI can animate the reveal.
    const ev = result.sideEffects.find(e => e.event === 'card:previewRevealedEarly');
    expect(ev).toBeDefined();
    expect((ev!.payload as any).cellIndex).toBe(2);
  });

  it('active 行有 1 张可正向翻 + preview 行有 1 张卡背 → 2 个目标，弹 pendingMagicAction（不自动结算）', () => {
    const card = makePactCard();
    const fwd = makeFlippablePotion('fwd-1');
    const previewCard = makePreviewCard('prev-2');
    const state = makeState({
      handCards: [card] as any,
      activeCards: [fwd, null, null, null, null] as any,
      previewCards: [null, previewCard, null, null, null] as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('flip-active-card');
    expect((result.state.pendingMagicAction as any).step).toBe('dungeon-select');
    // 仍处于卡背状态
    expect(result.state.previewRevealedEarly?.[1]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2) 翻转计数器（抽样：flip-gold / persuade-on-flip / flipDebuffMonsterId）
// ---------------------------------------------------------------------------

describe('乾坤一翻 preview 翻面 — 触发翻转计数器', () => {
  it('flip-gold (熔炉之心) ×1 → preview 翻面后金币 +FLIP_GOLD_REWARD (4)', () => {
    const card = makePactCard();
    const previewCard = makePreviewCard('prev-fg');
    const fg = makeAmulet('flip-gold', 'amu-fg', '熔炉之心');
    const state = makeState({
      handCards: [card] as any,
      activeCards: EMPTY_ROW,
      previewCards: [previewCard, null, null, null, null] as any,
      amuletSlots: [fg] as any,
      gold: 100,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.gold).toBe(104);
    expect(result.state.previewRevealedEarly?.[0]).toBe(true);
  });

  it('flip-gold ×2 stacking → preview 翻面后金币 +8 (4×2)', () => {
    const card = makePactCard();
    const previewCard = makePreviewCard('prev-fg2');
    const fg1 = makeAmulet('flip-gold', 'amu-fg-1', '熔炉之心');
    const fg2 = makeAmulet('flip-gold', 'amu-fg-2', '熔炉之心');
    const state = makeState({
      handCards: [card] as any,
      activeCards: EMPTY_ROW,
      previewCards: [previewCard, null, null, null, null] as any,
      amuletSlots: [fg1, fg2] as any,
      gold: 50,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.gold).toBe(58);
  });

  it('persuade-on-flip (翻印之符) → preview 翻面后 persuadeAmuletBonus +10', () => {
    const card = makePactCard();
    const previewCard = makePreviewCard('prev-pf');
    const persuadeAmu = makeAmulet('persuade-on-flip', 'amu-pf', '翻印之符');
    const state = makeState({
      handCards: [card] as any,
      activeCards: EMPTY_ROW,
      previewCards: [previewCard, null, null, null, null] as any,
      amuletSlots: [persuadeAmu] as any,
      persuadeAmuletBonus: 0,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.persuadeAmuletBonus).toBe(10);
  });

  it('flipDebuffMonsterId 已设 → preview 翻面后目标怪物 attack -1', () => {
    const card = makePactCard();
    const previewCard = makePreviewCard('prev-debuff');
    const monster = makeMonster('m-target', 4, 5);
    const state = makeState({
      handCards: [card] as any,
      activeCards: [null, null, monster, null, null] as any,
      previewCards: [previewCard, null, null, null, null] as any,
      flipDebuffMonsterId: 'm-target',
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.previewRevealedEarly?.[0]).toBe(true);
    const updatedMonster = (result.state.activeCards as any[])[2];
    expect(updatedMonster?.attack).toBe(3);
  });

  it('_flipRepairBuff 装备 → preview 翻面后 +1 耐久（不超 max）', () => {
    const card = makePactCard();
    const previewCard = makePreviewCard('prev-repair');
    const sword: EquipmentItem = {
      id: 'w1', type: 'weapon', name: 'Sword', value: 2,
      durability: 1, maxDurability: 3, _flipRepairBuff: true,
    } as EquipmentItem;
    const state = makeState({
      handCards: [card] as any,
      activeCards: EMPTY_ROW,
      previewCards: [previewCard, null, null, null, null] as any,
      equipmentSlot1: sword as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect((result.state.equipmentSlot1 as any)?.durability).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 3) RESOLVE_DUNGEON_CARD_SELECTION 路径（player 选 preview）
// ---------------------------------------------------------------------------

describe('乾坤一翻 — preview 选择路径（pending dungeon-select）', () => {
  it('2+ 目标 → pending → 选 preview 卡背 → 翻面 + 触发计数器', () => {
    const card = makePactCard();
    const fwd = makeFlippablePotion('fwd-pick');
    const prev = makePreviewCard('prev-pick');
    const fg = makeAmulet('flip-gold', 'amu-fg-sel', '熔炉之心');
    const state = makeState({
      handCards: [card] as any,
      activeCards: [fwd, null, null, null, null] as any,
      previewCards: [null, null, prev, null, null] as any,
      amuletSlots: [fg] as any,
      gold: 100,
    });

    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(r1.state.pendingMagicAction).not.toBeNull();
    expect((r1.state.pendingMagicAction as any).effect).toBe('flip-active-card');

    const r2 = drain({ ...r1.state, phase: 'idle' } as GameState, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'prev-pick', targetIndex: 2 } as GameAction,
    ]);

    expect(r2.state.previewRevealedEarly?.[2]).toBe(true);
    expect(r2.state.gold).toBe(104);
    // 没有回响 → pending 清空。
    expect(r2.state.pendingMagicAction).toBeNull();
    // active fwd potion 没被翻（玩家选了 preview）
    expect((r2.state.activeCards as any[])[0]?.id).toBe('fwd-pick');
  });
});

// ---------------------------------------------------------------------------
// 4) 回响 ×2：1 active + 1 preview → 两次选择都生效
// ---------------------------------------------------------------------------

describe('乾坤一翻 — echo ×2 + preview', () => {
  it('doubleNextMagic：第一次选 preview，第二次仍弹窗，可选 active', () => {
    const card = makePactCard();
    const fwd = makeFlippablePotion('fwd-echo');
    const prev = makePreviewCard('prev-echo');
    const fg = makeAmulet('flip-gold', 'amu-fg-echo', '熔炉之心');
    const state = makeState({
      handCards: [card] as any,
      activeCards: [fwd, null, null, null, null] as any,
      previewCards: [null, prev, null, null, null] as any,
      amuletSlots: [fg] as any,
      doubleNextMagic: true,
      gold: 0,
    });

    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(r1.state.pendingMagicAction).not.toBeNull();
    expect((r1.state.pendingMagicAction as any).echoRemaining).toBe(2);

    // 选 preview 卡背
    const r2 = drain({ ...r1.state, phase: 'idle' } as GameState, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'prev-echo', targetIndex: 1 } as GameAction,
    ]);
    expect(r2.state.previewRevealedEarly?.[1]).toBe(true);
    expect(r2.state.gold).toBe(4);
    // 还有一次回响，且 active 行的 fwd 仍可翻 → pending 还在
    expect(r2.state.pendingMagicAction).not.toBeNull();
    expect((r2.state.pendingMagicAction as any).echoRemaining).toBe(1);

    // 第二次选 active 行可正向翻的 potion
    const r3 = drain({ ...r2.state, phase: 'idle' } as GameState, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'fwd-echo', targetIndex: 0 } as GameAction,
    ]);
    // active 0 已被翻面（flipTarget.toCard.id === 'fwd-echo-flipped'）
    expect((r3.state.activeCards as any[])[0]?.id).toBe('fwd-echo-flipped');
    // 第二次翻又给 +4 金币（active 翻经过 APPLY_CARD_FLIP → reduceApplyCardFlip 内部
    // 已调 applyFlipCounters，不能重复）
    expect(r3.state.gold).toBe(8);
    expect(r3.state.pendingMagicAction).toBeNull();
  });

  it('echo 重弹窗逻辑：preview 已翻面后该格不算「还有可翻」目标', () => {
    const card = makePactCard();
    const prev1 = makePreviewCard('p-only-1');
    const state = makeState({
      handCards: [card] as any,
      activeCards: EMPTY_ROW,
      previewCards: [prev1, null, null, null, null] as any,
      doubleNextMagic: true,
    });

    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    // 只有 1 个目标 → 自动结算（即使有 echo，也没第二个目标可选）
    expect(r1.state.previewRevealedEarly?.[0]).toBe(true);
    // pending 应该没有（没第二个可翻的目标 → 不重弹）
    expect(r1.state.pendingMagicAction).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5) Waterfall reset
// ---------------------------------------------------------------------------

describe('乾坤一翻 — waterfall 复位 previewRevealedEarly', () => {
  it('APPLY_WATERFALL_DROP：drop 走的 preview 格对应 revealed 复位', () => {
    const droppedPreview = makePreviewCard('p-drop');
    const state = makeState({
      previewCards: [droppedPreview, null, null, null, null] as any,
      previewRevealedEarly: [true, false, false, false, false],
      activeCards: EMPTY_ROW,
      pendingWaterfallPlan: {
        dropPreviewIndices: [0],
        dropTargetSlots: [0],
        resolvedDropCards: [droppedPreview],
        nextPreviewCards: [],
        nextRemainingDeck: [],
        newPreviewStacks: {},
        discardPreviewIndex: null,
        discardDestination: null,
        shouldDeclareVictory: false,
      } as any,
    });

    const result = reduce(state, { type: 'APPLY_WATERFALL_DROP' } as GameAction);
    expect(result.state.previewRevealedEarly?.[0]).toBe(false);
    expect((result.state.previewCards as any[])[0]).toBeNull();
    expect((result.state.activeCards as any[])[0]?.id).toBe('p-drop');
  });

  it('APPLY_WATERFALL_DEAL：发新卡后所有 revealed 全清', () => {
    const newCard = makePreviewCard('new-1');
    const state = makeState({
      previewCards: EMPTY_ROW,
      previewRevealedEarly: [true, true, false, true, false],
      pendingWaterfallPlan: {
        dropPreviewIndices: [],
        dropTargetSlots: [],
        resolvedDropCards: [],
        nextPreviewCards: [newCard],
        nextRemainingDeck: [],
        newPreviewStacks: {},
        discardPreviewIndex: null,
        discardDestination: null,
        shouldDeclareVictory: false,
      } as any,
    });

    const result = reduce(state, { type: 'APPLY_WATERFALL_DEAL' } as GameAction);
    expect(result.state.previewRevealedEarly).toEqual([false, false, false, false, false]);
  });
});

// ---------------------------------------------------------------------------
// 6) 已翻面的 preview 不再算可选目标
// ---------------------------------------------------------------------------

describe('乾坤一翻 — 已翻面的 preview 不可重选', () => {
  it('preview[0] 已 revealed + active 无可翻 → resolver 报"没有可翻"', () => {
    const card = makePactCard();
    const previewCard = makePreviewCard('p-already');
    const state = makeState({
      handCards: [card] as any,
      activeCards: EMPTY_ROW,
      previewCards: [previewCard, null, null, null, null] as any,
      previewRevealedEarly: [true, false, false, false, false],
      gold: 100,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    // 0 valid → consumed + banner，不应再次翻面
    expect(result.state.pendingMagicAction).toBeNull();
    expect(result.state.previewRevealedEarly?.[0]).toBe(true);
    // 金币没增加（没有翻转触发）
    expect(result.state.gold).toBe(100);
  });
});
