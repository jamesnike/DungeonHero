/**
 * 净册涌泉 (knight:cleanse-draw) — Perm 1 magic.
 *
 * Behavior:
 *   - PLAY_CARD always sets `pendingMagicAction { effect: 'cleanse-draw',
 *     step: 'cleanse-draw-select', echoRemaining }` and emits a
 *     `card:cleanseDrawRequested` side effect.
 *   - Hand pick (delete) + graveyard discover (3-pick-1 into hand) happen in
 *     the hook layer; the hook calls `requestCardAction('delete', 1, { handOnly: true })`
 *     then `requestGraveyardSelection(3, { delivery: 'hand-first' })` per
 *     iteration.
 *   - No upgrade scaling — single-shot effect regardless of upgradeLevel.
 *   - Echo (Spell Echo, Category B): the resolver writes
 *     `echoRemaining = echoMultiplier`. The hook drives the loop; this test
 *     file covers the reducer-side state, not the hook loop itself.
 *   - Stacks with 招灵书印 (`amuletEffect: 'delete-draw'`): once the user
 *     picks a card and CONFIRM_DELETE_CARD fires with kw='delete', the amulet
 *     enqueues a separate buff/gold proc (+1 temp atk / +1 temp armor to both
 *     slots, +2 gold per equipped copy). This file verifies the stack point
 *     still fires.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeCleanseCard(idSuffix = 'a', extras: Record<string, any> = {}): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic' as const,
    name: '净册涌泉',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent' as const,
    magicEffect: '删 1 张手牌；坟场发现一张牌（3 选 1）加入手牌。',
    description: '永久：选择一张手牌删除（手牌为空则跳过），从坟场发现一张牌（三选一），加入手牌。',
    knightEffect: 'cleanse-draw',
    recycleDelay: 1,
    ...extras,
  } as any;
}

function makeFiller(id: string, name = `F-${id}`): GameCardData {
  return {
    id,
    type: 'magic' as const,
    name,
    value: 0,
    image: '',
  } as any;
}

const DELETE_DRAW_AMULET: GameCardData = {
  id: 'amu-delete-draw',
  type: 'amulet',
  name: '招灵书印',
  value: 1,
  image: '',
  amuletEffect: 'delete-draw',
} as any;

function findCleanseEvent(sideEffects: any[]) {
  return sideEffects.find(e => e?.event === 'card:cleanseDrawRequested')?.payload;
}

// ---------------------------------------------------------------------------
// PLAY_CARD — sets pendingMagicAction + emits side effect
// ---------------------------------------------------------------------------

describe('净册涌泉 PLAY_CARD', () => {
  it('emits cleanseDrawRequested side effect with echoRemaining=1; pending step set', () => {
    const card = makeCleanseCard('basic');
    const state = makeState({ handCards: [card] as any });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const pending = result.state.pendingMagicAction as any;
    expect(pending?.effect).toBe('cleanse-draw');
    expect(pending?.step).toBe('cleanse-draw-select');
    expect(pending?.echoRemaining).toBe(1);

    const payload = findCleanseEvent(result.sideEffects);
    expect(payload).toBeDefined();
    expect(payload.echoRemaining).toBe(1);
    expect(payload.card.id).toBe(card.id);
    // No drawCount — graveyard discover replaces the backpack draw.
    expect((payload as any).drawCount).toBeUndefined();

    expect(result.state.handCards.find((c: any) => c.id === card.id)).toBeUndefined();
  });

  it('plays even with empty hand (resolver does NOT pre-check; hook handles empty-hand discover-only)', () => {
    // The card itself is in handCards as the only card. After PLAY_CARD removes
    // it, hand is empty — but the resolver still sets up cleanseDrawRequested
    // because the hook owns the empty-hand "discover only" branch.
    const card = makeCleanseCard('emptyhand');
    const state = makeState({ handCards: [card] as any });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const payload = findCleanseEvent(result.sideEffects);
    expect(payload).toBeDefined();
    expect(payload.echoRemaining).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Echo (doubleNextMagic) — echoRemaining = 2
// ---------------------------------------------------------------------------

describe('净册涌泉 法术回响 (Spell Echo, Category B)', () => {
  it('with doubleNextMagic active → echoRemaining = 2, hook will loop twice', () => {
    const card = makeCleanseCard('echo');
    const state = makeState({
      handCards: [card] as any,
      doubleNextMagic: true,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const pending = result.state.pendingMagicAction as any;
    expect(pending?.echoRemaining).toBe(2);

    const payload = findCleanseEvent(result.sideEffects);
    expect(payload?.echoRemaining).toBe(2);

    // doubleNextMagic flag should be consumed by the engine.
    expect(result.state.doubleNextMagic).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// End-to-end: simulate hook loop
//   PLAY_CARD → CONFIRM_DELETE_CARD → REQUEST_GRAVEYARD_SELECTION →
//   RESOLVE_GRAVEYARD_SELECTION (delivery: 'hand-first') → FINALIZE
// ---------------------------------------------------------------------------

describe('净册涌泉 end-to-end (simulated hook loop)', () => {
  it('PLAY → CONFIRM_DELETE_CARD removes the picked hand card', () => {
    const card = makeCleanseCard('e2e');
    const target = makeFiller('hand-victim');
    const state = makeState({
      handCards: [card, target] as any,
      cardActionContext: {
        mode: 'event',
        keyword: 'delete',
        requiredCount: 1,
        remainingCount: 1,
        handOnly: true,
      } as any,
    });

    // Hook would: PLAY_CARD → user picks 'hand-victim' → CONFIRM_DELETE_CARD
    const after = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
      { type: 'CONFIRM_DELETE_CARD', cardId: target.id, source: 'hand' } as GameAction,
    ]);

    expect((after.state.handCards as any[]).find(c => c.id === target.id)).toBeUndefined();
    expect((after.state.handCards as any[]).find(c => c.id === card.id)).toBeUndefined();
  });

  it('PLAY → CONFIRM_DELETE → graveyard discover → selected card lands in hand', () => {
    const card = makeCleanseCard('full');
    const target = makeFiller('hand-victim');
    // 3 cards in graveyard so requestGraveyardSelection can present 3 options.
    const grave1 = makeFiller('grave-1');
    const grave2 = makeFiller('grave-2');
    const grave3 = makeFiller('grave-3');
    const state = makeState({
      handCards: [card, target] as any,
      discardedCards: [grave1, grave2, grave3] as any,
      cardActionContext: {
        mode: 'event',
        keyword: 'delete',
        requiredCount: 1,
        remainingCount: 1,
        handOnly: true,
      } as any,
    });

    // Step 1: PLAY + CONFIRM_DELETE — emit cleanseDrawRequested.
    const afterDelete = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
      { type: 'CONFIRM_DELETE_CARD', cardId: target.id, source: 'hand' } as GameAction,
    ]);

    // Hook would now: requestGraveyardSelection(3, { delivery: 'hand-first' }).
    // In the real game this is a top-level engine.dispatch — bypassing the
    // pipeline's INPUT_PHASES gate. We mirror that by calling reduce() directly,
    // then drain any enqueuedActions through the pipeline.
    const requestResult = reduce(afterDelete.state, {
      type: 'REQUEST_GRAVEYARD_SELECTION',
      maxOptions: 3,
      delivery: 'hand-first',
    } as any);
    const afterRequest = drain(requestResult.state, requestResult.enqueuedActions);

    const options = afterRequest.state.graveyardDiscoverState ?? [];
    expect(options.length).toBe(3);
    const chosenId = options[0]!.id;

    // Hook would then: user clicks one → RESOLVE_GRAVEYARD_SELECTION (hand-first)
    const afterResolve = drain(afterRequest.state, [
      { type: 'RESOLVE_GRAVEYARD_SELECTION', cardIds: [chosenId], context: { delivery: 'hand-first' } } as GameAction,
      { type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false } as GameAction,
    ]);

    // Selected graveyard card landed in hand.
    expect((afterResolve.state.handCards as any[]).some(c => c.id === chosenId)).toBe(true);
    // Selected card removed from graveyard.
    expect((afterResolve.state.discardedCards as any[]).some(c => c.id === chosenId)).toBe(false);

    // Pending magic cleared, card sent to recycle bag (Perm 1).
    expect(afterResolve.state.pendingMagicAction).toBeNull();
    expect(
      (afterResolve.state.permanentMagicRecycleBag as any[] | undefined)?.some(c => c.id === card.id)
      ?? (afterResolve.state.recycleBag as any[] | undefined)?.some(c => c.id === card.id),
    ).toBe(true);
  });

  it('graveyard empty: REQUEST_GRAVEYARD_SELECTION sets banner and skips discover state', () => {
    const card = makeCleanseCard('empty-grave');
    const state = makeState({
      handCards: [card] as any,
      discardedCards: [] as any,
    });

    const afterPlay = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    // Same top-level dispatch pattern as the previous test: the hook calls
    // requestGraveyardSelection which reduce()s top-level, bypassing the
    // INPUT_PHASES gate. With graveyard empty the reducer takes the early
    // `eligible.length === 0` branch and just posts a banner.
    const requestResult = reduce(afterPlay.state, {
      type: 'REQUEST_GRAVEYARD_SELECTION',
      maxOptions: 3,
      delivery: 'hand-first',
    } as any);
    const afterRequest = drain(requestResult.state, requestResult.enqueuedActions);

    const after = drain(afterRequest.state, [
      { type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false } as GameAction,
    ]);

    // No discover state set when graveyard is empty.
    expect(after.state.graveyardDiscoverState ?? []).toEqual([]);
    // Banner posted.
    expect(after.state.heroSkillBanner ?? '').toContain('坟场');
    // Card still cycled to recycle bag.
    expect(after.state.pendingMagicAction).toBeNull();
    expect(
      (after.state.permanentMagicRecycleBag as any[] | undefined)?.some(c => c.id === card.id)
      ?? (after.state.recycleBag as any[] | undefined)?.some(c => c.id === card.id),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stacking with 招灵书印 (amulet: delete-draw) — independent additive draws
// ---------------------------------------------------------------------------

describe('净册涌泉 × 招灵书印 stacking', () => {
  it('CONFIRM_DELETE_CARD on a hand card while wearing 招灵书印 enqueues the buff/gold proc', () => {
    // The cleanse-draw magic itself discovers from graveyard. What we verify
    // here: the existing 招灵书印 amulet still fires on the kw='delete' confirm
    // coming from cleanse-draw's hand picker, completely independently of
    // the magic effect — but now its effect is +1 temp atk / +1 temp armor
    // to both slots and +2 gold (rather than a backpack draw).
    const target = makeFiller('hand-victim');
    const state = makeState({
      handCards: [target] as any,
      amuletSlots: [DELETE_DRAW_AMULET] as any,
      backpackItems: [makeFiller('bp-1'), makeFiller('bp-2'), makeFiller('bp-3')] as any,
      cardActionContext: {
        mode: 'event',
        keyword: 'delete',
        requiredCount: 1,
        remainingCount: 1,
        handOnly: true,
      } as any,
    });

    const result = reduce(state, {
      type: 'CONFIRM_DELETE_CARD',
      cardId: target.id,
      source: 'hand',
    } as any);

    const actions = result.enqueuedActions ?? [];
    const sum = (type: string, slotId?: string) =>
      actions
        .filter((a: any) => a.type === type && (slotId === undefined || a.slotId === slotId))
        .reduce((acc: number, a: any) => acc + (a.delta ?? 0), 0);

    // 1 delete × 1 amulet = 1 proc.
    expect(sum('MODIFY_SLOT_TEMP_ATTACK', 'equipmentSlot1')).toBe(1);
    expect(sum('MODIFY_SLOT_TEMP_ATTACK', 'equipmentSlot2')).toBe(1);
    expect(sum('MODIFY_SLOT_TEMP_ARMOR', 'equipmentSlot1')).toBe(1);
    expect(sum('MODIFY_SLOT_TEMP_ARMOR', 'equipmentSlot2')).toBe(1);
    const goldDelta = actions
      .filter((a: any) => a.type === 'MODIFY_GOLD' && a.source === 'amulet:delete-draw')
      .reduce((acc: number, a: any) => acc + a.delta, 0);
    expect(goldDelta).toBe(2);
  });
});
