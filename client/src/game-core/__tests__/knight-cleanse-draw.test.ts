/**
 * 净册涌泉 (knight:cleanse-draw) — Perm 1 magic.
 *
 * Behavior:
 *   - PLAY_CARD always sets `pendingMagicAction { effect: 'cleanse-draw',
 *     step: 'cleanse-draw-select', echoRemaining, data.drawCount }` and emits
 *     a `card:cleanseDrawRequested` side effect.
 *   - Damage / draws / hand mutation happen in the hook layer; the hook calls
 *     `requestCardAction('delete', 1, { handOnly: true })` and dispatches
 *     `DRAW_CARDS source='backpack'` after each pick.
 *   - drawCount = [3, 4, 5][upgradeLevel] — Perm 1 with maxUpgradeLevel = 2.
 *   - Echo (Spell Echo, Category B): the resolver writes
 *     `echoRemaining = echoMultiplier`. The hook drives the loop; this test
 *     file covers the reducer-side state, not the hook loop itself.
 *   - Stacks with 招灵书印 (`amuletEffect: 'delete-draw'`): once the user
 *     picks a card and CONFIRM_DELETE_CARD fires with kw='delete', the amulet
 *     enqueues an additional 2N backpack draw (separate effect, separate
 *     source). This file verifies that stacking still works.
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
    magicEffect: '删 1 张手牌，从背包抽 N 张（升 0/1/2 → 3/4/5）。',
    description: '永久：选择一张手牌删除（手牌为空则跳过），然后从背包抽 3 张牌。',
    knightEffect: 'cleanse-draw',
    recycleDelay: 1,
    maxUpgradeLevel: 2,
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
// PLAY_CARD — sets pendingMagicAction + emits side effect (lvl 0 / 1 / 2)
// ---------------------------------------------------------------------------

describe('净册涌泉 PLAY_CARD', () => {
  it('lvl 0 → drawCount = 3, pending effect = cleanse-draw', () => {
    const card = makeCleanseCard('lvl0', { upgradeLevel: 0 });
    const state = makeState({ handCards: [card] as any });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const pending = result.state.pendingMagicAction as any;
    expect(pending?.effect).toBe('cleanse-draw');
    expect(pending?.step).toBe('cleanse-draw-select');
    expect(pending?.data?.drawCount).toBe(3);
    expect(pending?.echoRemaining).toBe(1);

    const payload = findCleanseEvent(result.sideEffects);
    expect(payload).toBeDefined();
    expect(payload.drawCount).toBe(3);
    expect(payload.echoRemaining).toBe(1);
    expect(payload.card.id).toBe(card.id);

    expect(result.state.handCards.find((c: any) => c.id === card.id)).toBeUndefined();
  });

  it('lvl 1 → drawCount = 4', () => {
    const card = makeCleanseCard('lvl1', { upgradeLevel: 1 });
    const state = makeState({ handCards: [card] as any });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const pending = result.state.pendingMagicAction as any;
    expect(pending?.data?.drawCount).toBe(4);

    const payload = findCleanseEvent(result.sideEffects);
    expect(payload?.drawCount).toBe(4);
  });

  it('lvl 2 → drawCount = 5', () => {
    const card = makeCleanseCard('lvl2', { upgradeLevel: 2 });
    const state = makeState({ handCards: [card] as any });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const pending = result.state.pendingMagicAction as any;
    expect(pending?.data?.drawCount).toBe(5);

    const payload = findCleanseEvent(result.sideEffects);
    expect(payload?.drawCount).toBe(5);
  });

  it('plays even with empty hand (resolver does NOT pre-check; hook handles empty-hand draw-only)', () => {
    // The card itself is in handCards as the only card. After PLAY_CARD removes
    // it, hand is empty — but the resolver still sets up cleanseDrawRequested
    // because the hook owns the empty-hand "draw only" branch.
    const card = makeCleanseCard('emptyhand');
    const state = makeState({ handCards: [card] as any });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const payload = findCleanseEvent(result.sideEffects);
    expect(payload).toBeDefined();
    expect(payload.drawCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Echo (doubleNextMagic) — echoRemaining = 2
// ---------------------------------------------------------------------------

describe('净册涌泉 法术回响 (Spell Echo, Category B)', () => {
  it('with doubleNextMagic active → echoRemaining = 2, hook will loop twice', () => {
    const card = makeCleanseCard('echo', { upgradeLevel: 0 });
    const state = makeState({
      handCards: [card] as any,
      doubleNextMagic: true,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const pending = result.state.pendingMagicAction as any;
    expect(pending?.echoRemaining).toBe(2);
    expect(pending?.data?.drawCount).toBe(3);

    const payload = findCleanseEvent(result.sideEffects);
    expect(payload?.echoRemaining).toBe(2);

    // doubleNextMagic flag should be consumed by the engine.
    expect(result.state.doubleNextMagic).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// End-to-end: simulate hook loop (CONFIRM_DELETE_CARD → DRAW_CARDS → FINALIZE)
// ---------------------------------------------------------------------------

describe('净册涌泉 end-to-end (simulated hook loop)', () => {
  it('PLAY → CONFIRM_DELETE_CARD removes the picked hand card', () => {
    const card = makeCleanseCard('e2e');
    const target = makeFiller('hand-victim');
    const deckCards = [makeFiller('deck-1'), makeFiller('deck-2')];
    const state = makeState({
      handCards: [card, target] as any,
      remainingDeck: deckCards as any,
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

  it('PLAY → CONFIRM_DELETE → DRAW_CARDS backpack=3 → 3 cards land in hand from backpack', () => {
    const card = makeCleanseCard('full', { upgradeLevel: 0 });
    const target = makeFiller('hand-victim');
    const bp1 = makeFiller('bp-1');
    const bp2 = makeFiller('bp-2');
    const bp3 = makeFiller('bp-3');
    const bp4 = makeFiller('bp-4');
    const state = makeState({
      handCards: [card, target] as any,
      backpackItems: [bp1, bp2, bp3, bp4] as any,
      cardActionContext: {
        mode: 'event',
        keyword: 'delete',
        requiredCount: 1,
        remainingCount: 1,
        handOnly: true,
      } as any,
    });

    const after = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
      { type: 'CONFIRM_DELETE_CARD', cardId: target.id, source: 'hand' } as GameAction,
      { type: 'DRAW_CARDS', count: 3, source: 'backpack' } as GameAction,
      { type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false } as GameAction,
    ]);

    // 3 backpack cards moved into hand (which exact 3 depends on backpack-draw
    // ordering — assert by count, not identity, to avoid coupling to the impl).
    const drawnInHand = (after.state.handCards as any[]).filter(c => c.id.startsWith('bp-'));
    expect(drawnInHand.length).toBe(3);
    // Backpack down by 3.
    expect((after.state.backpackItems as any[]).filter(c => c.id.startsWith('bp-')).length).toBe(1);
    // Pending magic cleared, card sent to recycle bag (Perm 1).
    expect(after.state.pendingMagicAction).toBeNull();
    expect(
      (after.state.permanentMagicRecycleBag as any[] | undefined)?.some(c => c.id === card.id)
      ?? (after.state.recycleBag as any[] | undefined)?.some(c => c.id === card.id),
    ).toBe(true);
  });

  it('lvl 2 end-to-end: 5 cards drawn from backpack after one delete', () => {
    const card = makeCleanseCard('lvl2-e2e', { upgradeLevel: 2 });
    const target = makeFiller('hand-victim');
    const backpackCards = [
      makeFiller('bp-1'),
      makeFiller('bp-2'),
      makeFiller('bp-3'),
      makeFiller('bp-4'),
      makeFiller('bp-5'),
      makeFiller('bp-6'),
    ];
    const state = makeState({
      handCards: [card, target] as any,
      backpackItems: backpackCards as any,
      cardActionContext: {
        mode: 'event',
        keyword: 'delete',
        requiredCount: 1,
        remainingCount: 1,
        handOnly: true,
      } as any,
    });

    const after = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
      { type: 'CONFIRM_DELETE_CARD', cardId: target.id, source: 'hand' } as GameAction,
      { type: 'DRAW_CARDS', count: 5, source: 'backpack' } as GameAction,
      { type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false } as GameAction,
    ]);

    expect((after.state.handCards as any[]).filter(c => c.id.startsWith('bp-')).length).toBe(5);
    expect((after.state.backpackItems as any[]).filter(c => c.id.startsWith('bp-')).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Stacking with 招灵书印 (amulet: delete-draw) — independent additive draws
// ---------------------------------------------------------------------------

describe('净册涌泉 × 招灵书印 stacking', () => {
  it('CONFIRM_DELETE_CARD on a hand card while wearing 招灵书印 enqueues a separate backpack draw', () => {
    // The cleanse-draw magic itself does NOT enqueue the 2 backpack draws
    // (the hook does). What we verify here: the existing 招灵书印 amulet
    // still fires on the kw='delete' confirm coming from cleanse-draw's
    // hand picker, on top of whatever the hook will then dispatch.
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

    const backpackDraw = result.enqueuedActions.find(
      (a: any) => a.type === 'DRAW_CARDS' && a.source === 'backpack',
    );
    expect(backpackDraw).toBeDefined();
    expect((backpackDraw as any)?.count).toBe(2);
  });
});
