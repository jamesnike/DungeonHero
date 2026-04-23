/**
 * 祭坛秘术 翻回 → 再翻 → 使用 流程测试
 *
 * 复现 user 报告的 bug：
 *   1. 附魔祭坛 (event) 在 active row
 *   2. 玩家选 altar-flip 选项 → 翻成 祭坛秘术 (magic) — 同一格
 *   3. 玩家用 乾坤一翻 (flip-active-card) → 翻回 附魔祭坛 — 同一格
 *   4. 玩家再用 乾坤一翻 (flip-active-card) → 翻成 祭坛秘术 — 同一格
 *   5. 玩家把 祭坛秘术 拖到 hero (RESOLVE_MAGIC) → 弹出弃牌 modal
 *   6. 玩家确认弃 2 张 (RESOLVE_HAND_DISCARD_SELECTION)
 *
 * 期望：祭坛秘术 应该正常 finalize（FINALIZE_MAGIC_CARD → ADD_TO_GRAVEYARD）。
 *
 * Bug 表现：祭坛秘术 卡在 active row，没去坟场。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { reduce } from '../reducer';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

/** Helper: dispatch an action like GameEngine does — reduce + drain enqueued. */
function dispatch(state: GameState, action: GameAction): GameState {
  const result = reduce(state, action);
  const drained = drain(result.state, result.enqueuedActions ?? []);
  return drained.state;
}

function makeFiller(id: string, name = `Filler-${id}`): GameCardData {
  return {
    id,
    type: 'magic' as const,
    name,
    value: 0,
    image: '',
  } as GameCardData;
}

// 重建 deck.ts 里 附魔祭坛 的最小 fixture（只保留触发 altar-flip 路径所需字段）。
function makeAltarEvent(id = 'altar-evt-1'): GameCardData {
  return {
    id,
    type: 'event' as const,
    name: '附魔祭坛',
    value: 0,
    image: '',
    description: 'test',
    stayIfStacked: true,
    eventChoices: [
      {
        id: 'altar-flip',
        text: '翻转',
        effect: 'noop',
      },
    ],
    flipTarget: {
      toCard: {
        id: `${id}-flip`,
        type: 'magic' as const,
        name: '祭坛秘术',
        value: 0,
        image: '',
        magicType: 'instant',
        magicEffect: 'altar-discard-discover',
        description: 'test',
      } as GameCardData,
      destination: 'stay',
      message: '附魔祭坛翻转为祭坛秘术！',
    },
  } as unknown as GameCardData;
}

describe('祭坛秘术: flip → unflip → flip → use', () => {
  it('repro: 附魔祭坛 翻成 祭坛秘术，flip back，再 flip forward，使用后应进坟场', () => {
    const altarEvt = makeAltarEvent();
    const h1 = makeFiller('h1');
    const h2 = makeFiller('h2');
    const h3 = makeFiller('h3');

    // 把 附魔祭坛 直接放到 active row 的第 0 格。
    const initialActive = [altarEvt, null, null, null] as GameState['activeCards'];

    let s = makeState({
      handCards: [h1, h2, h3],
      activeCards: initialActive,
      classDeck: [
        { id: 'cd1', type: 'magic', name: 'CD1', value: 0, image: '' },
        { id: 'cd2', type: 'magic', name: 'CD2', value: 0, image: '' },
        { id: 'cd3', type: 'magic', name: 'CD3', value: 0, image: '' },
      ] as any,
    });

    // Step 1: 触发 event flip — 直接 dispatch APPLY_CARD_FLIP 模拟 COMPLETE_EVENT 的下游。
    s = dispatch(s, { type: 'APPLY_CARD_FLIP', card: altarEvt, cellIndex: 0 } as GameAction);

    // 验证 active row 第 0 格现在是 祭坛秘术
    let slot0 = s.activeCards[0];
    expect(slot0).not.toBeNull();
    expect(slot0?.name).toBe('祭坛秘术');
    expect(slot0?.id).toBe(`${altarEvt.id}-flip`);
    const altarMagicId = slot0!.id;
    // 关键断言 #1：第一次 flip 后，magic 卡上必须有 _flipBackCard 指回 附魔祭坛
    expect((slot0 as any)._flipBackCard).toBeDefined();
    expect((slot0 as any)._flipBackCard.id).toBe(altarEvt.id);

    // Step 2: 模拟 乾坤一翻 (flip-active-card) — 翻回 附魔祭坛
    // 设置 pendingMagicAction，然后 RESOLVE_DUNGEON_CARD_SELECTION
    s = {
      ...s,
      pendingMagicAction: {
        card: { id: 'qiankun', name: '乾坤一翻', type: 'magic' } as GameCardData,
        effect: 'flip-active-card',
        step: 'dungeon-select',
        prompt: '',
        echoRemaining: 1,
      } as any,
    };
    s = dispatch(s, { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: altarMagicId } as GameAction);

    slot0 = s.activeCards[0];
    expect(slot0).not.toBeNull();
    expect(slot0?.name).toBe('附魔祭坛');
    expect(slot0?.id).toBe(altarEvt.id);
    const restoredEvtId = slot0!.id;

    // Step 3: 再次 乾坤一翻 — 翻成 祭坛秘术
    // 此时 active row 是 附魔祭坛 (event)，有 flipTarget；走 path (a)
    s = {
      ...s,
      pendingMagicAction: {
        card: { id: 'qiankun-2', name: '乾坤一翻', type: 'magic' } as GameCardData,
        effect: 'flip-active-card',
        step: 'dungeon-select',
        prompt: '',
        echoRemaining: 1,
      } as any,
    };
    s = dispatch(s, { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: restoredEvtId } as GameAction);

    slot0 = s.activeCards[0];
    expect(slot0).not.toBeNull();
    expect(slot0?.name).toBe('祭坛秘术');
    expect(slot0?.id).toBe(`${altarEvt.id}-flip`);

    const altarMagicCard = slot0!;

    // Step 4: 拖到 hero —— RESOLVE_MAGIC（dungeon 路径）
    s = dispatch(s, { type: 'RESOLVE_MAGIC', cardId: altarMagicCard.id, card: altarMagicCard } as GameAction);

    // 应该弹出 pendingHandDiscardSelection（手上有 3 张普通卡，足够 ≥ 2）
    expect(s.pendingHandDiscardSelection).not.toBeNull();

    // Step 5: 玩家确认弃 2 张
    s = dispatch(s, { type: 'RESOLVE_HAND_DISCARD_SELECTION', cardIds: ['h1', 'h2'] } as GameAction);

    // 关键断言：祭坛秘术 应该已进入 discardedCards
    // (activeCards 的清理由 UI 层在收到 card:magicFinalized 时做，不在 reducer 内)
    expect(s.discardedCards.find(c => c.id === altarMagicCard.id)).toBeDefined();
  });

  it('repro v2 (with undo): 翻成祭坛秘术 → qiankun back-flip → 撤销 → 使用祭坛秘术 → 应进坟场', () => {
    const altarEvt = makeAltarEvent();
    const h1 = makeFiller('h1');
    const h2 = makeFiller('h2');
    const h3 = makeFiller('h3');

    const initialActive = [altarEvt, null, null, null] as GameState['activeCards'];

    let s = makeState({
      handCards: [h1, h2, h3],
      activeCards: initialActive,
      classDeck: [
        { id: 'cd1', type: 'magic', name: 'CD1', value: 0, image: '' },
        { id: 'cd2', type: 'magic', name: 'CD2', value: 0, image: '' },
        { id: 'cd3', type: 'magic', name: 'CD3', value: 0, image: '' },
      ] as any,
    });

    // Step 1: 触发 event flip → 祭坛秘术 in slot 0
    s = dispatch(s, { type: 'APPLY_CARD_FLIP', card: altarEvt, cellIndex: 0 } as GameAction);

    let slot0 = s.activeCards[0];
    expect(slot0?.name).toBe('祭坛秘术');
    const altarMagicId = slot0!.id;

    // 关键：保存"撤销点"——这是 handleCardToHero 调用 pushUndoSnapshot 时
    // 保存的 snapshot（即 RESOLVE_MAGIC qiankun 之前的 state）。
    const undoSnapshot = s;

    // Step 2: 用 qiankun back-flip → 附魔祭坛
    s = {
      ...s,
      pendingMagicAction: {
        card: { id: 'qiankun', name: '乾坤一翻', type: 'magic' } as GameCardData,
        effect: 'flip-active-card',
        step: 'dungeon-select',
        prompt: '',
        echoRemaining: 1,
      } as any,
    };
    s = dispatch(s, { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: altarMagicId } as GameAction);

    expect(s.activeCards[0]?.name).toBe('附魔祭坛');

    // Step 3: 撤销 → state 恢复到 step 1 之后（祭坛秘术 in slot 0）
    s = undoSnapshot;
    expect(s.activeCards[0]?.name).toBe('祭坛秘术');
    expect((s.activeCards[0] as any)?._flipBackCard).toBeDefined();

    // Step 4: 拖 祭坛秘术 到 hero
    const altarMagicCard = s.activeCards[0]!;
    s = dispatch(s, { type: 'RESOLVE_MAGIC', cardId: altarMagicCard.id, card: altarMagicCard } as GameAction);

    expect(s.pendingHandDiscardSelection).not.toBeNull();

    // Step 5: 确认弃 2 张
    s = dispatch(s, { type: 'RESOLVE_HAND_DISCARD_SELECTION', cardIds: ['h1', 'h2'] } as GameAction);

    expect(s.discardedCards.find(c => c.id === altarMagicCard.id)).toBeDefined();
  });
});
