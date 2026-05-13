/**
 * 雷霆符印 (`amuletEffect: 'discard-zap'`) — 「删除」keyword trigger path.
 *
 * Card text (post-update): "每弃置或删除 1 张牌，对激活行随机怪物造成 3 点伤害。"
 *
 * 雷霆符印 is the explicit exception to the GAME_MECHANICS §1 "delete doesn't
 * trigger side-effect amulets" rule (alongside 招灵书印 — see
 * `delete-draw-amulet.test.ts` for that one).
 *
 * Two delete entry points must both fire the zap:
 *   1. `DELETE_CARD` (rules/cards.ts) — canonical zone-removal primitive.
 *      Used by 净册涌泉 / 回炉重造 / direct programmatic deletes / shop event
 *      deletes that don't go through the modal flow.
 *   2. `CONFIRM_DELETE_CARD` with `kw === 'delete'` (rules/shop.ts) — runtime
 *      shop / event modal delete entry point. Other keywords (discard /
 *      recycle / move-to / discard-recycle) must NOT fire — those are 弃置 /
 *      回收 / 移到 semantics with their own existing 弃置 path that already
 *      goes through `APPLY_DISCARD_EFFECTS` (and that path covers discard-zap).
 *
 * Reducer-side contract: emit `card:discardShock` side effect with
 * `payload.count = ae.discardShockCount`. The hook layer
 * (`useCardOperations` → `GameBoard.flushDiscardShockQueue`) handles target
 * selection from the active row, engagement (`beginCombat`), animation, and
 * damage dispatch — identical pipeline to the existing 弃置 fire path in
 * `reduceApplyDiscardEffects`. So testing the side-effect emission shape is
 * the appropriate seam for the reducer-only layer.
 *
 * Self-exclude rule mirrors `reduceApplyDiscardEffects`: deleting a discard-zap
 * amulet itself does NOT fire any zaps (avoids "destroying my seal pumps my
 * other seals" weirdness).
 *
 * Stacking: linear ×N per `amulet-stacking-design.mdc` "Discrete event ×N"
 * category — N seals → side-effect payload `count: N`, consumer fires N
 * independent zaps (each at a freshly-rolled random monster).
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';

function makeState(overrides?: Partial<GameState>): GameState {
  // phase: 'playerInput' per `pipeline-input-continuation.mdc` so any
  // follow-up actions enqueued by the delete reducer drain in the same call.
  return { ...createInitialGameState(), phase: 'playerInput' as any, ...overrides };
}

const THUNDER_SEAL: GameCardData = {
  id: 'amu-discard-zap',
  type: 'amulet',
  name: '雷霆符印',
  value: 1,
  image: '',
  amuletEffect: 'discard-zap',
} as any;

const THUNDER_SEAL_2: GameCardData = {
  ...THUNDER_SEAL,
  id: 'amu-discard-zap-2',
} as any;

const SOUL_SEAL: GameCardData = {
  id: 'amu-delete-draw',
  type: 'amulet',
  name: '招灵书印',
  value: 1,
  image: '',
  amuletEffect: 'delete-draw',
} as any;

function makeHandCard(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: `Hand-${id}`,
    value: 0,
    image: '',
  } as any;
}

function makeBackpackCard(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: `BP-${id}`,
    value: 0,
    image: '',
  } as any;
}

function findDiscardShock(result: any): any | undefined {
  return (result.sideEffects ?? []).find((e: any) => e.event === 'card:discardShock');
}

function countDiscardShock(result: any): number {
  return (result.sideEffects ?? []).filter((e: any) => e.event === 'card:discardShock').length;
}

// ---------------------------------------------------------------------------
// DELETE_CARD path (the canonical zone-removal primitive)
// ---------------------------------------------------------------------------

describe('雷霆符印 (discard-zap) — fires on DELETE_CARD', () => {
  it('emits 1× card:discardShock with count=1 on a single-amulet hand delete', () => {
    const target = makeHandCard('h-1');
    const state = makeState({
      amuletSlots: [THUNDER_SEAL] as any,
      handCards: [target, makeHandCard('h-keep')] as any,
    });

    const result = reduce(state, {
      type: 'DELETE_CARD',
      cardId: 'h-1',
      source: 'hand',
      destination: 'graveyard',
    } as any);

    const shock = findDiscardShock(result);
    expect(shock).toBeDefined();
    expect(shock.payload.count).toBe(1);
    expect(countDiscardShock(result)).toBe(1);
    // Card actually moved to graveyard.
    expect((result.state.handCards as any[]).find(c => c.id === 'h-1')).toBeUndefined();
    expect((result.state.discardedCards as any[]).find(c => c.id === 'h-1')).toBeDefined();
  });

  it('stacks linearly: 2 amulets → single emission with count=2 (consumer fires 2 zaps)', () => {
    const target = makeHandCard('h-1');
    const state = makeState({
      amuletSlots: [THUNDER_SEAL, THUNDER_SEAL_2] as any,
      handCards: [target] as any,
    });

    const result = reduce(state, {
      type: 'DELETE_CARD',
      cardId: 'h-1',
      source: 'hand',
      destination: 'graveyard',
    } as any);

    const shock = findDiscardShock(result);
    expect(shock).toBeDefined();
    expect(shock.payload.count).toBe(2);
  });

  it('also fires when destination is recycleBag (per "all delete entries trigger")', () => {
    const target = makeBackpackCard('bp-1');
    const state = makeState({
      amuletSlots: [THUNDER_SEAL] as any,
      backpackItems: [target] as any,
    });

    const result = reduce(state, {
      type: 'DELETE_CARD',
      cardId: 'bp-1',
      source: 'backpack',
      destination: 'recycleBag',
    } as any);

    const shock = findDiscardShock(result);
    expect(shock).toBeDefined();
    expect(shock.payload.count).toBe(1);
    expect((result.state.permanentMagicRecycleBag as any[]).find(c => c.id === 'bp-1')).toBeDefined();
  });

  it('does NOT fire when no amulet equipped', () => {
    const target = makeHandCard('h-1');
    const state = makeState({
      amuletSlots: [] as any,
      handCards: [target] as any,
    });

    const result = reduce(state, {
      type: 'DELETE_CARD',
      cardId: 'h-1',
      source: 'hand',
      destination: 'graveyard',
    } as any);

    expect(findDiscardShock(result)).toBeUndefined();
  });

  it('does NOT fire when no card was actually deleted (no-op short-circuit)', () => {
    const state = makeState({
      amuletSlots: [THUNDER_SEAL] as any,
      handCards: [] as any,
    });

    const result = reduce(state, {
      type: 'DELETE_CARD',
      cardId: 'missing',
      source: 'hand',
      destination: 'graveyard',
    } as any);

    expect(findDiscardShock(result)).toBeUndefined();
  });

  it('self-exclude: deleting a discard-zap amulet itself does NOT fire (avoids self-pump loop)', () => {
    const state = makeState({
      amuletSlots: [THUNDER_SEAL, THUNDER_SEAL_2] as any,
    });

    // Delete one of the two thunder seals via DELETE_CARD source='amulet'.
    // Even though 1 thunder seal survives, no zap fires (matches existing
    // 弃置-path self-exclude in `reduceApplyDiscardEffects`).
    const result = reduce(state, {
      type: 'DELETE_CARD',
      cardId: 'amu-discard-zap',
      source: 'amulet',
      destination: 'graveyard',
    } as any);

    expect(findDiscardShock(result)).toBeUndefined();
    // Sanity: the deletion itself happened.
    expect((result.state.amuletSlots as any[]).find(c => c.id === 'amu-discard-zap')).toBeUndefined();
    expect((result.state.amuletSlots as any[]).find(c => c.id === 'amu-discard-zap-2')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// CONFIRM_DELETE_CARD path (shop / event modal entry point)
// ---------------------------------------------------------------------------

describe('雷霆符印 (discard-zap) — fires on CONFIRM_DELETE_CARD with kw="delete"', () => {
  it('emits card:discardShock with count=1 on a single-amulet shop delete', () => {
    const target = makeHandCard('h-1');
    const state = makeState({
      amuletSlots: [THUNDER_SEAL] as any,
      handCards: [target] as any,
      cardActionContext: {
        mode: 'shop',
        keyword: 'delete',
        requiredCount: 1,
        remainingCount: 1,
      } as any,
    });

    const result = reduce(state, {
      type: 'CONFIRM_DELETE_CARD',
      cardId: 'h-1',
      source: 'hand',
    } as any);

    const shock = findDiscardShock(result);
    expect(shock).toBeDefined();
    expect(shock.payload.count).toBe(1);
  });

  it('stacks linearly via CONFIRM_DELETE_CARD: 3 amulets → count=3', () => {
    const THIRD: GameCardData = { ...THUNDER_SEAL, id: 'amu-discard-zap-3' } as any;
    const target = makeHandCard('h-1');
    const state = makeState({
      amuletSlots: [THUNDER_SEAL, THUNDER_SEAL_2, THIRD] as any,
      handCards: [target] as any,
      cardActionContext: {
        mode: 'shop',
        keyword: 'delete',
        requiredCount: 1,
        remainingCount: 1,
      } as any,
    });

    const result = reduce(state, {
      type: 'CONFIRM_DELETE_CARD',
      cardId: 'h-1',
      source: 'hand',
    } as any);

    expect(findDiscardShock(result)?.payload.count).toBe(3);
  });

  it('does NOT fire on kw="discard-only" (弃置 ≠ 删除)', () => {
    // Note: discard-only DOES fire discard-zap via the existing
    // APPLY_DISCARD_EFFECTS path (which is enqueued earlier in the reducer).
    // Here we only assert that the new "kw==='delete'" trigger does NOT
    // double-fire — i.e., no `card:discardShock` is produced *by the
    // CONFIRM_DELETE_CARD reducer itself*. The downstream APPLY_DISCARD_EFFECTS
    // is enqueued, not synchronously emitted, so the side-effects array on
    // this single reduce() call should not contain a discardShock event.
    const target = makeHandCard('h-1');
    const state = makeState({
      amuletSlots: [THUNDER_SEAL] as any,
      handCards: [target] as any,
      cardActionContext: {
        mode: 'shop',
        keyword: 'discard-only',
        requiredCount: 1,
        remainingCount: 1,
      } as any,
    });

    const result = reduce(state, {
      type: 'CONFIRM_DELETE_CARD',
      cardId: 'h-1',
      source: 'hand',
    } as any);

    // No direct discardShock emission from the CONFIRM_DELETE_CARD reducer
    // for the discard-only keyword.
    expect(findDiscardShock(result)).toBeUndefined();
    // Sanity: the discard-only path enqueued APPLY_DISCARD_EFFECTS, which is
    // the canonical 弃置 trigger for discard-zap (covered by other tests).
    const enqueued = result.enqueuedActions ?? [];
    expect(enqueued.some(a => a.type === 'APPLY_DISCARD_EFFECTS')).toBe(true);
  });

  it('does NOT fire on kw="recycle-only" (回收 ≠ 删除)', () => {
    const target = makeHandCard('h-1');
    const state = makeState({
      amuletSlots: [THUNDER_SEAL] as any,
      handCards: [target] as any,
      cardActionContext: {
        mode: 'shop',
        keyword: 'recycle-only',
        requiredCount: 1,
        remainingCount: 1,
      } as any,
    });

    const result = reduce(state, {
      type: 'CONFIRM_DELETE_CARD',
      cardId: 'h-1',
      source: 'hand',
    } as any);

    expect(findDiscardShock(result)).toBeUndefined();
  });

  it('does NOT fire on kw="move-to" (移到 ≠ 删除)', () => {
    const target = makeHandCard('h-1');
    const state = makeState({
      amuletSlots: [THUNDER_SEAL] as any,
      handCards: [target] as any,
      cardActionContext: {
        mode: 'shop',
        keyword: 'move-to',
        moveToDestination: 'graveyard',
        requiredCount: 1,
        remainingCount: 1,
      } as any,
    });

    const result = reduce(state, {
      type: 'CONFIRM_DELETE_CARD',
      cardId: 'h-1',
      source: 'hand',
    } as any);

    expect(findDiscardShock(result)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Combined fire: 雷霆符印 + 招灵书印 should both fire independently on delete
// ---------------------------------------------------------------------------

describe('雷霆符印 + 招灵书印 — both fire on the same delete', () => {
  it('via DELETE_CARD: discardShock side effect AND delete-draw enqueued procs', () => {
    const target = makeHandCard('h-1');
    const state = makeState({
      amuletSlots: [THUNDER_SEAL, SOUL_SEAL] as any,
      handCards: [target] as any,
    });

    const result = reduce(state, {
      type: 'DELETE_CARD',
      cardId: 'h-1',
      source: 'hand',
      destination: 'graveyard',
    } as any);

    // 雷霆符印: side effect emitted with count=1.
    expect(findDiscardShock(result)?.payload.count).toBe(1);

    // 招灵书印: the buff/gold proc actions are enqueued.
    const enqueued = result.enqueuedActions ?? [];
    const goldDelta = enqueued
      .filter((a: any) => a.type === 'MODIFY_GOLD' && a.source === 'amulet:delete-draw')
      .reduce((acc: number, a: any) => acc + a.delta, 0);
    expect(goldDelta).toBe(2);
  });

  it('via CONFIRM_DELETE_CARD kw="delete": both fire', () => {
    const target = makeHandCard('h-1');
    const state = makeState({
      amuletSlots: [THUNDER_SEAL, SOUL_SEAL] as any,
      handCards: [target] as any,
      cardActionContext: {
        mode: 'shop',
        keyword: 'delete',
        requiredCount: 1,
        remainingCount: 1,
      } as any,
    });

    const result = reduce(state, {
      type: 'CONFIRM_DELETE_CARD',
      cardId: 'h-1',
      source: 'hand',
    } as any);

    expect(findDiscardShock(result)?.payload.count).toBe(1);

    const enqueued = result.enqueuedActions ?? [];
    expect(
      enqueued.some(
        (a: any) => a.type === 'MODIFY_GOLD' && a.source === 'amulet:delete-draw',
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// End-to-end via drain() — verify pipeline doesn't strand the side effect.
// (card:discardShock is a SIDE EFFECT, not an action, so it bypasses
// isInputContinuation gating, but verify the chain still completes cleanly
// in `phase: 'playerInput'` per `pipeline-input-continuation.mdc`.)
// ---------------------------------------------------------------------------

describe('end-to-end (drain) — delete chain completes in playerInput phase', () => {
  it('DELETE_CARD chain produces card:discardShock side effect after drain', () => {
    const target = makeHandCard('h-1');
    const state = makeState({
      amuletSlots: [THUNDER_SEAL] as any,
      handCards: [target] as any,
    });

    const result = drain(state, [
      {
        type: 'DELETE_CARD',
        cardId: 'h-1',
        source: 'hand',
        destination: 'graveyard',
      } as GameAction,
    ]);

    // The side effect surfaces in the drained side-effect array.
    expect((result.sideEffects ?? []).some((e: any) => e.event === 'card:discardShock')).toBe(true);
    // And the card actually moved to graveyard.
    expect((result.state.handCards as any[]).find(c => c.id === 'h-1')).toBeUndefined();
    expect((result.state.discardedCards as any[]).find(c => c.id === 'h-1')).toBeDefined();
  });
});
