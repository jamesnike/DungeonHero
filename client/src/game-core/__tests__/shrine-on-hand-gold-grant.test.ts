/**
 * 赋能神殿「上手：金币 +2」(grantHandOnHandGold:2) — end-to-end coverage.
 *
 * Mirrors the existing 上手回血 (`grantHandOnHandHeal:1` / `on-hand-heal-1`) flow:
 *   - PermGrantModal sourceType: 'on-hand-gold-grant'
 *   - onEnterHandEffect id: 'on-hand-gold-2'
 *   - Resolver writes the keyword + immediately enqueues +2 gold (because the
 *     card is already in hand; without this nudge the on-enter trigger would
 *     not fire until the next discard / re-draw)
 *   - Each subsequent ADD_CARD_TO_HAND fires +2 gold via TRIGGER_ON_ENTER_HAND
 *   - Eligibility (modal filter) excludes cards already carrying any
 *     `onEnterHandEffect` keyword — prevents clobbering 兵器谱 / 血誓回卷 / 等
 *
 * Per `pipeline-input-continuation.mdc` the fixture uses `phase: 'playerInput'`
 * so any TRIGGER_ON_ENTER_HAND follow-up actions drain on the same dispatch.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

/**
 * Mirror real engine.dispatch behavior: top-level action goes through reduce()
 * (bypassing isInputContinuation gate), then any enqueuedActions drain through
 * the normal pipeline. This matches what useCardPlayHandlers / PermGrantModal
 * actually do (dispatch the RESOLVE_PERM_GRANT, then drain follow-ups).
 *
 * Pure `drain([resolveAction])` would strand RESOLVE_PERM_GRANT under
 * phase: 'playerInput' because it's not in the isInputContinuation whitelist
 * (it's a top-level user action, not an internal follow-up).
 */
function dispatchAndDrain(state: GameState, action: GameAction) {
  const r = reduce(state, action);
  if (r.enqueuedActions.length === 0) return r;
  const drained = drain(r.state, r.enqueuedActions);
  return { ...drained, sideEffects: [...r.sideEffects, ...drained.sideEffects] };
}

const handMagic = (id: string, overrides?: Partial<GameCardData>): GameCardData => ({
  id,
  type: 'magic' as const,
  name: 'Bolt',
  value: 0,
  ...overrides,
});

describe('赋能神殿 — grantHandOnHandGold:2 (上手：金币 +2)', () => {
  // -------------------------------------------------------------------------
  // RESOLVE_PERM_GRANT — write keyword + immediate trigger
  // -------------------------------------------------------------------------
  it('RESOLVE_PERM_GRANT writes onEnterHandEffect: on-hand-gold-2 AND immediately +2 gold', () => {
    const target = handMagic('t-onhand', { name: 'TargetMagic' });
    const filler = handMagic('filler', { name: 'FillerMagic' });
    const state = makeState({
      handCards: [target, filler],
      gold: 100,
      permGrantModal: { sourceCardId: 'event-grant', sourceType: 'on-hand-gold-grant' },
    });
    const result = dispatchAndDrain(state, { type: 'RESOLVE_PERM_GRANT', targetCardId: 't-onhand' } as GameAction);
    const updated = result.state.handCards.find(c => c.id === 't-onhand') as GameCardData & { onEnterHandEffect?: string };
    expect(updated?.onEnterHandEffect).toBe('on-hand-gold-2');
    // Immediate trigger: gold should have gone from 100 → 102.
    expect(result.state.gold).toBe(102);
    // The modal is consumed by the resolver.
    expect(result.state.permGrantModal).toBeNull();
  });

  it('RESOLVE_PERM_GRANT does NOT clobber filler card without the keyword', () => {
    const target = handMagic('t-onhand');
    const filler = handMagic('filler');
    const state = makeState({
      handCards: [target, filler],
      gold: 50,
      permGrantModal: { sourceCardId: 'event-grant', sourceType: 'on-hand-gold-grant' },
    });
    const result = dispatchAndDrain(state, { type: 'RESOLVE_PERM_GRANT', targetCardId: 't-onhand' } as GameAction);
    const fillerAfter = result.state.handCards.find(c => c.id === 'filler') as GameCardData & { onEnterHandEffect?: string };
    expect(fillerAfter?.onEnterHandEffect).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // TRIGGER_ON_ENTER_HAND — every subsequent re-entry fires +2 gold
  // -------------------------------------------------------------------------
  it('TRIGGER_ON_ENTER_HAND on a card with on-hand-gold-2 fires +2 gold', () => {
    const card = handMagic('hand-1', { onEnterHandEffect: 'on-hand-gold-2' });
    const state = makeState({ handCards: [card], gold: 7 });
    const result = drain(state, [
      { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction,
    ]);
    expect(result.state.gold).toBe(9);
  });

  it('TRIGGER_ON_ENTER_HAND fires every time the card re-enters hand (idempotent +2 per fire)', () => {
    const card = handMagic('hand-1', { onEnterHandEffect: 'on-hand-gold-2' });
    let state = makeState({ handCards: [card], gold: 0 });
    state = drain(state, [{ type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction]).state;
    state = drain(state, [{ type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction]).state;
    state = drain(state, [{ type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction]).state;
    expect(state.gold).toBe(6);
  });

  it('TRIGGER_ON_ENTER_HAND emits log + banner side effects', () => {
    const card = handMagic('hand-1', { name: 'BoltX', onEnterHandEffect: 'on-hand-gold-2' });
    const state = makeState({ handCards: [card], gold: 0 });
    const result = reduce(state, { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction);
    expect(result.sideEffects).toContainEqual(
      expect.objectContaining({
        event: 'log:entry',
        payload: expect.objectContaining({ message: expect.stringContaining('BoltX 上手：金币 +2') }),
      }),
    );
    expect(result.sideEffects).toContainEqual(
      expect.objectContaining({
        event: 'ui:banner',
        payload: expect.objectContaining({ text: expect.stringContaining('+2 金币') }),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // ADD_CARD_TO_HAND auto-fires the on-enter trigger via the pipeline
  // -------------------------------------------------------------------------
  it('ADD_CARD_TO_HAND auto-fires the on-hand-gold-2 trigger via postProcessHandEntries', () => {
    const card = handMagic('drawn-card', { onEnterHandEffect: 'on-hand-gold-2' });
    const state = makeState({ handCards: [], gold: 0 });
    const result = drain(state, [
      { type: 'ADD_CARD_TO_HAND', card } as GameAction,
    ]);
    expect(result.state.handCards.find(c => c.id === 'drawn-card')).toBeDefined();
    expect(result.state.gold).toBe(2);
  });

  it('ADD_CARD_TO_HAND with _skipOnEnterHand does NOT fire the trigger (cloned/dealt cards)', () => {
    const card = handMagic('clone-card', {
      onEnterHandEffect: 'on-hand-gold-2',
      _skipOnEnterHand: true,
    });
    const state = makeState({ handCards: [], gold: 5 });
    const result = drain(state, [
      { type: 'ADD_CARD_TO_HAND', card } as GameAction,
    ]);
    expect(result.state.gold).toBe(5);
  });
});
