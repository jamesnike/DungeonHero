/**
 * 暗影契约 — 「召唤夜市（打开商店，跳过翻转）」regression test.
 *
 * Bug: 玩家点「召唤夜市」(`effect: 'openShop'`, `skipFlip: true`)，商店开了关上以后，
 * 卡牌还是翻转成了「暗影之刺」永久魔法 —— 跳过翻转没生效。
 *
 * 根因：
 *   1. `processEffectsInline` 处理 `openShop` 时，把事件停车：写入
 *      `pendingEventSkipFlip: true` 到 state，不 enqueue COMPLETE_EVENT。
 *   2. 关商店时 `useShopHandlers.handleShopClose` 调 `completeCurrentEvent()` ——
 *      它读的是 hook 内部的 `skipEventFlipRef`（**永远是 false**），
 *      忽略了 state 里那个 `pendingEventSkipFlip: true`。
 *   3. 派发 `COMPLETE_EVENT { skipFlip: false }` → 翻转触发。
 *
 * 修复：`handleShopClose` 在 `currentEventCard != null` 时改成 dispatch
 *   `CONTINUE_EVENT_EFFECTS`，让 reducer 的 `processEffectsInline` 用
 *   `state.pendingEventSkipFlip` 收尾，正确 honor「跳过翻转」语义。
 *
 * 本 reducer-level test 验证 contract：
 *   step 1：RESOLVE_EVENT_CHOICE { openShop, skipFlip: true } parks event 时
 *           `pendingEventSkipFlip` 必须设为 true。
 *   step 2：CONTINUE_EVENT_EFFECTS（hook 关商店后 dispatch）必须 enqueue
 *           `COMPLETE_EVENT { skipFlip: true }` —— 不是 false。
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe('暗影契约 召唤夜市 — openShop with skipFlip:true', () => {
  const shadowPactCard = {
    id: 'shadow-pact-1',
    type: 'event' as const,
    name: '暗影契约',
    value: 0,
    eventChoices: [
      {
        text: '召唤夜市（打开商店，跳过翻转）',
        effect: 'openShop',
        skipFlip: true,
      },
    ],
    flipTarget: {
      toCard: {
        id: 'shadow-pact-1-flip',
        type: 'magic' as const,
        name: '暗影之刺',
        value: 0,
        magicType: 'permanent' as const,
      },
      destination: 'stay' as const,
      message: 'flip',
    },
  };

  it('step 1: RESOLVE_EVENT_CHOICE { openShop, skipFlip: true } parks event with pendingEventSkipFlip=true', () => {
    const state = makeState({
      currentEventCard: shadowPactCard as any,
    });

    const result = reduce(state, {
      type: 'RESOLVE_EVENT_CHOICE',
      choiceId: '0',
      choiceText: '召唤夜市',
      effectTokens: ['openShop'],
      skipFlip: true,
    });

    // openShop is interactive → reducer emits request and parks the event.
    const openShopRequest = result.sideEffects.find(
      e =>
        e.event === 'event:requestEventInteraction' &&
        (e.payload as { token?: string }).token === 'openShop',
    );
    expect(openShopRequest).toBeDefined();

    // Critical: skipFlip stashed in state for the shop-close handler to honor.
    expect(result.state.pendingEventSkipFlip).toBe(true);

    // No tokens left after the only one was the interactive openShop.
    expect(result.state.pendingEventEffects).toEqual([]);

    // Event card still alive — shop hasn't closed yet.
    expect(result.state.currentEventCard).not.toBeNull();

    // Reducer must NOT enqueue COMPLETE_EVENT here — the hook drives finalization
    // after the shop closes.
    expect(result.enqueuedActions.find(a => a.type === 'COMPLETE_EVENT'))
      .toBeUndefined();
  });

  it('step 2: CONTINUE_EVENT_EFFECTS (hook-dispatched after shop close) enqueues COMPLETE_EVENT with skipFlip=true', () => {
    // State that step 1 leaves behind, after the player has been browsing
    // the shop and just closed it.
    const stateAfterShop = makeState({
      currentEventCard: shadowPactCard as any,
      pendingEventEffects: [],
      pendingEventSkipFlip: true, // ← parked from step 1
    });

    const result = reduce(stateAfterShop, { type: 'CONTINUE_EVENT_EFFECTS' });

    const completeEvent = result.enqueuedActions.find(a => a.type === 'COMPLETE_EVENT');
    expect(completeEvent).toBeDefined();
    expect((completeEvent as { skipFlip: boolean }).skipFlip).toBe(true);

    // pendingEventSkipFlip must be cleared so the next event starts fresh.
    expect(result.state.pendingEventSkipFlip).toBe(false);
  });

  it('regression: the old buggy hook path (completeCurrentEvent → COMPLETE_EVENT { skipFlip: false }) flips the card', () => {
    // Codifies WHY the bug occurred: if handleShopClose dispatches
    // COMPLETE_EVENT { skipFlip: false } directly (the bug), the card flips
    // into 暗影之刺 via enqueued APPLY_CARD_FLIP. Today's fix routes through
    // CONTINUE_EVENT_EFFECTS, which reads pendingEventSkipFlip=true from
    // state and emits COMPLETE_EVENT with skipFlip: true → no flip.
    const stateAfterShop = makeState({
      currentEventCard: shadowPactCard as any,
      pendingEventEffects: [],
      pendingEventSkipFlip: true,
    });

    const buggyResult = reduce(stateAfterShop, {
      type: 'COMPLETE_EVENT',
      skipFlip: false,
    });

    // Buggy path: flip is enqueued.
    expect(
      buggyResult.enqueuedActions.find(a => a.type === 'APPLY_CARD_FLIP'),
    ).toBeDefined();

    // Correct path: same starting state, but go through CONTINUE_EVENT_EFFECTS
    // first (which is what handleShopClose now dispatches). Drain enqueued
    // COMPLETE_EVENT — it must NOT flip.
    const continueResult = reduce(stateAfterShop, { type: 'CONTINUE_EVENT_EFFECTS' });
    const completeAction = continueResult.enqueuedActions.find(a => a.type === 'COMPLETE_EVENT');
    expect(completeAction).toBeDefined();
    expect((completeAction as { skipFlip: boolean }).skipFlip).toBe(true);

    // Apply the COMPLETE_EVENT on the post-CONTINUE state to verify no flip.
    const finalResult = reduce(continueResult.state, completeAction as any);
    expect(
      finalResult.enqueuedActions.find(a => a.type === 'APPLY_CARD_FLIP'),
    ).toBeUndefined();
  });

  it('shop opened without skipFlip choice (e.g. 命运十字路口 openShop branch) still flips as designed', () => {
    // Sanity: my fix must not over-skip flips. If the choice didn't request
    // skipFlip, pendingEventSkipFlip stays false and the flip happens.
    const otherEventCard = {
      ...shadowPactCard,
      id: 'other-event',
      name: '命运十字路口',
    };
    const stateAfterShop = makeState({
      currentEventCard: otherEventCard as any,
      pendingEventEffects: [],
      pendingEventSkipFlip: false, // ← choice didn't set skipFlip
    });

    const result = reduce(stateAfterShop, { type: 'CONTINUE_EVENT_EFFECTS' });

    const completeEvent = result.enqueuedActions.find(a => a.type === 'COMPLETE_EVENT');
    expect(completeEvent).toBeDefined();
    expect((completeEvent as { skipFlip: boolean }).skipFlip).toBe(false);
  });
});
