/**
 * 墓语密室 — 「召唤商贩」(`['discoverClassMagic', 'openShop']`) chain.
 *
 * Regression test for a bug where, after picking a card in the discover modal
 * triggered by the first token, the shop never opened because the discover
 * completion handler (`useShopHandlers.handleDiscoverSelect`) unconditionally
 * dispatched `COMPLETE_EVENT` and discarded the remaining `openShop` token in
 * `pendingEventEffects`.
 *
 * The reducer side of the contract is verified here:
 *   1. RESOLVE_EVENT_CHOICE with the 2-token chain pauses at `discoverClassMagic`
 *      and stashes `['openShop']` in `pendingEventEffects`.
 *   2. The hook is expected to dispatch `CONTINUE_EVENT_EFFECTS` (NOT
 *      `COMPLETE_EVENT`) once the discover modal closes — this test asserts
 *      that doing so correctly emits the `openShop` interaction request and
 *      keeps the event card alive for the shop close handler to finalize.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe('墓语密室 召唤商贩 chain — discoverClassMagic → openShop', () => {
  const cryptEventCard = {
    id: 'crypt-1',
    type: 'event' as const,
    name: '墓语密室',
    value: 0,
    eventChoices: [
      {
        id: 'summon-merchant',
        text: '召唤商贩（发现一张专属magic牌，打开商店）',
        effect: ['discoverClassMagic', 'openShop'],
      },
    ],
  };

  it('step 1: RESOLVE_EVENT_CHOICE pauses at discoverClassMagic, stashes openShop in pendingEventEffects', () => {
    const state = makeState({
      currentEventCard: cryptEventCard as any,
      classDeck: [
        { id: 'cm1', type: 'magic' as const, name: 'TestMagic', value: 1 },
      ] as any,
    });

    const result = reduce(state, {
      type: 'RESOLVE_EVENT_CHOICE',
      choiceId: 'summon-merchant',
      choiceText: '召唤商贩',
      effectTokens: ['discoverClassMagic', 'openShop'],
      skipFlip: false,
    });

    // First token is interactive → reducer must emit a request and pause.
    const interactionRequests = result.sideEffects.filter(
      e => e.event === 'event:requestEventInteraction',
    );
    expect(interactionRequests).toHaveLength(1);
    expect((interactionRequests[0]!.payload as { token: string }).token).toBe(
      'discoverClassMagic',
    );

    // openShop must NOT have fired yet — it is parked in pendingEventEffects.
    expect(result.state.pendingEventEffects).toEqual(['openShop']);

    // Reducer must NOT auto-complete the event; the hook must drive
    // continuation once the discover modal resolves.
    expect(result.enqueuedActions.find(a => a.type === 'COMPLETE_EVENT'))
      .toBeUndefined();

    // Event card must still be present so the upcoming openShop step can use it.
    expect(result.state.currentEventCard).not.toBeNull();
  });

  it('step 2: CONTINUE_EVENT_EFFECTS (dispatched by hook after discover completes) emits openShop interaction', () => {
    // Simulate the state that step 1 leaves behind: the discover modal has
    // been resolved by the player, so pendingEventEffects still has openShop.
    const stateAfterDiscover = makeState({
      currentEventCard: cryptEventCard as any,
      pendingEventEffects: ['openShop'],
      pendingEventSkipFlip: false,
    });

    const result = reduce(stateAfterDiscover, { type: 'CONTINUE_EVENT_EFFECTS' });

    // openShop is interactive — must request interaction so the hook opens the shop.
    const openShopRequest = result.sideEffects.find(
      e =>
        e.event === 'event:requestEventInteraction' &&
        (e.payload as { token?: string }).token === 'openShop',
    );
    expect(openShopRequest).toBeDefined();

    // After processing the only remaining token, the queue must be empty.
    expect(result.state.pendingEventEffects).toEqual([]);

    // The event card must remain so the shop-close handler can finalize it.
    expect(result.state.currentEventCard).not.toBeNull();

    // Reducer must NOT auto-complete the event here; the user has to close
    // the shop first.
    expect(result.enqueuedActions.find(a => a.type === 'COMPLETE_EVENT'))
      .toBeUndefined();
  });

  it('regression: dispatching COMPLETE_EVENT directly (the old buggy hook path) loses the openShop step', () => {
    // This codifies *why* the bug occurred: if the hook dispatches
    // COMPLETE_EVENT when pendingEventEffects is non-empty, the shop never
    // opens. Today's hook fix in useShopHandlers.handleDiscoverSelect /
    // handleDiscoverCancel checks pendingEventEffects.length > 0 and
    // dispatches CONTINUE_EVENT_EFFECTS instead.
    const stateAfterDiscover = makeState({
      currentEventCard: cryptEventCard as any,
      pendingEventEffects: ['openShop'],
      pendingEventSkipFlip: false,
    });

    const result = reduce(stateAfterDiscover, {
      type: 'COMPLETE_EVENT',
      skipFlip: false,
    });

    // The buggy path emits no openShop interaction.
    const openShopRequest = result.sideEffects.find(
      e =>
        e.event === 'event:requestEventInteraction' &&
        (e.payload as { token?: string }).token === 'openShop',
    );
    expect(openShopRequest).toBeUndefined();
  });
});
