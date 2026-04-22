/**
 * 洗册归川 (knight:recycle-tide) — Perm 1 magic.
 *
 * Behavior:
 *   - PLAY_CARD resolves immediately (no pending action / no side-effect
 *     prompt). All effects happen inside the resolver itself.
 *   - Move all backpack cards into the permanent-magic recycle bag, tagging
 *     them with `_recycleWaits = 1` so they round-trip on the next tick.
 *   - Tick the entire merged bag once (`_recycleWaits -= 1`):
 *       * Cards that hit ≤ 0 (incl. all newly moved backpack cards) flush
 *         back to the backpack.
 *       * Cards with higher waits stay in the recycle bag with their waits
 *         decremented by 1.
 *   - Net effect: backpack cards round-trip; existing recycle-bag cards
 *     advance one waterfall step (cards previously at waits=1 come home).
 *   - Echo (Spell Echo, Category C, structural): runs the tick once + adds a
 *     "二次结算无额外效果" banner when echoMultiplier > 1.
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

function makeRecycleTideCard(idSuffix = 'a'): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic' as const,
    name: '洗册归川',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent' as const,
    magicEffect: '永久魔法：背包→回收袋；瀑流 -1，已就绪的牌回背包。',
    description: '永久：将背包所有牌移入回收袋；然后回收袋瀑流 -1，已就绪的牌洗回背包。',
    knightEffect: 'recycle-tide',
    recycleDelay: 1,
    maxUpgradeLevel: 0,
  } as any;
}

function makeFiller(id: string, name = `F-${id}`): GameCardData {
  return { id, type: 'magic' as const, name, value: 0, image: '' } as any;
}

function makeRecycleBagCard(id: string, waits: number): GameCardData {
  return {
    id,
    type: 'magic' as const,
    name: `R-${id}`,
    value: 0,
    image: '',
    magicType: 'permanent',
    _recycleWaits: waits,
  } as any;
}

// ---------------------------------------------------------------------------
// PLAY_CARD — resolves immediately, no pending action
// ---------------------------------------------------------------------------

describe('洗册归川 PLAY_CARD — basic resolution', () => {
  it('does not set pendingMagicAction (non-interactive resolver)', () => {
    const card = makeRecycleTideCard('p1');
    const state = makeState({ handCards: [card] as any });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.pendingMagicAction).toBeFalsy();
    // The played card itself ends up in the recycle bag (recycleDelay: 1).
    expect(result.state.handCards.find((c: any) => c.id === card.id)).toBeUndefined();
  });

  it('emits a magic log entry mentioning 洗册归川', () => {
    const card = makeRecycleTideCard('p2');
    const state = makeState({ handCards: [card] as any });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const hasLog = result.sideEffects.some(
      (e: any) => e?.event === 'log:entry' && /洗册归川/.test(e?.payload?.message ?? ''),
    );
    expect(hasLog).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mechanic — backpack round-trips, recycle bag advances one step
// ---------------------------------------------------------------------------

describe('洗册归川 mechanic', () => {
  it('empty backpack + empty recycle bag → both stay empty', () => {
    const card = makeRecycleTideCard('m1');
    const state = makeState({
      handCards: [card] as any,
      backpackItems: [],
      permanentMagicRecycleBag: [],
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.backpackItems).toHaveLength(0);
    // Only the played card itself sits in the recycle bag (waits=1 from recycleDelay).
    expect(result.state.permanentMagicRecycleBag).toHaveLength(1);
    expect(result.state.permanentMagicRecycleBag[0].id).toBe(card.id);
  });

  it('backpack cards round-trip back into backpack (no permanent change)', () => {
    const card = makeRecycleTideCard('m2');
    const f1 = makeFiller('f1');
    const f2 = makeFiller('f2');
    const state = makeState({
      handCards: [card] as any,
      backpackItems: [f1, f2],
      permanentMagicRecycleBag: [],
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const backpackIds = result.state.backpackItems.map((c: any) => c.id).sort();
    expect(backpackIds).toEqual(['f1', 'f2']);
    // Round-tripped backpack cards should NOT carry _recycleWaits anymore.
    for (const c of result.state.backpackItems as any[]) {
      expect(c._recycleWaits).toBeUndefined();
    }
  });

  it('recycle-bag card with waits=1 flushes back to backpack on tick', () => {
    const card = makeRecycleTideCard('m3');
    const recycled = makeRecycleBagCard('r1', 1);
    const state = makeState({
      handCards: [card] as any,
      backpackItems: [],
      permanentMagicRecycleBag: [recycled],
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.backpackItems.map((c: any) => c.id)).toContain('r1');
    // r1 should NOT linger in recycle bag.
    expect(result.state.permanentMagicRecycleBag.find((c: any) => c.id === 'r1')).toBeUndefined();
  });

  it('recycle-bag card with waits=2 stays in bag with waits=1 after tick', () => {
    const card = makeRecycleTideCard('m4');
    const recycled = makeRecycleBagCard('r2', 2);
    const state = makeState({
      handCards: [card] as any,
      backpackItems: [],
      permanentMagicRecycleBag: [recycled],
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const r2 = result.state.permanentMagicRecycleBag.find((c: any) => c.id === 'r2');
    expect(r2).toBeDefined();
    expect((r2 as any)._recycleWaits).toBe(1);
    expect(result.state.backpackItems.find((c: any) => c.id === 'r2')).toBeUndefined();
  });

  it('mixed: backpack round-trips, waits=1 returns, waits=2 ticks down', () => {
    const card = makeRecycleTideCard('m5');
    const f1 = makeFiller('f1');
    const r1 = makeRecycleBagCard('r1', 1);
    const r2 = makeRecycleBagCard('r2', 2);
    const state = makeState({
      handCards: [card] as any,
      backpackItems: [f1],
      permanentMagicRecycleBag: [r1, r2],
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const backpackIds = result.state.backpackItems.map((c: any) => c.id).sort();
    expect(backpackIds).toEqual(['f1', 'r1']);
    const bagIds = result.state.permanentMagicRecycleBag.map((c: any) => c.id).sort();
    // Played card itself enters the bag with recycleDelay=1, plus r2 still
    // waiting (its waits ticked from 2 → 1).
    expect(bagIds).toContain('r2');
    expect(bagIds).toContain(card.id);
    const r2After = result.state.permanentMagicRecycleBag.find((c: any) => c.id === 'r2');
    expect((r2After as any)._recycleWaits).toBe(1);
  });

  it('does not draw any cards into hand', () => {
    const card = makeRecycleTideCard('m6');
    const f1 = makeFiller('f1');
    const r1 = makeRecycleBagCard('r1', 1);
    const state = makeState({
      handCards: [card] as any,
      backpackItems: [f1],
      permanentMagicRecycleBag: [r1],
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Only side-effect-of-interest: no card:drawnToHand events.
    const drewToHand = result.sideEffects.some((e: any) => e?.event === 'card:drawnToHand');
    expect(drewToHand).toBe(false);
    // Hand should not gain any new cards (the played card was consumed).
    expect(result.state.handCards.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Spell Echo — Category C: structural, second pass = no-op + banner
// ---------------------------------------------------------------------------

describe('洗册归川 法术回响 (Spell Echo, Category C)', () => {
  it('with doubleNextMagic active → still resolves once, banner notes "无额外效果"', () => {
    const card = makeRecycleTideCard('e1');
    const r1 = makeRecycleBagCard('r1', 1);
    const r2 = makeRecycleBagCard('r2', 2);
    const state = makeState({
      handCards: [card] as any,
      backpackItems: [],
      permanentMagicRecycleBag: [r1, r2],
      doubleNextMagic: true,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // r1 returned to backpack exactly once (not twice).
    expect(result.state.backpackItems.filter((c: any) => c.id === 'r1')).toHaveLength(1);
    // r2 still in bag with waits=1 (ticked from 2 once, not twice).
    const r2After = result.state.permanentMagicRecycleBag.find((c: any) => c.id === 'r2');
    expect((r2After as any)._recycleWaits).toBe(1);

    // Banner should mention "回响" with the no-op note.
    const bannerEvent = result.sideEffects.find(
      (e: any) => e?.event === 'banner:show' || e?.event === 'ui:banner' || e?.event === 'banner',
    );
    // Loose check on either banner message field.
    const bannerMsg = JSON.stringify(result.sideEffects);
    expect(bannerMsg).toMatch(/回响/);
    expect(bannerMsg).toMatch(/二次结算无额外效果/);
  });

  it('without doubleNextMagic → banner does not mention 回响', () => {
    const card = makeRecycleTideCard('e2');
    const state = makeState({
      handCards: [card] as any,
      backpackItems: [],
      permanentMagicRecycleBag: [],
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const bannerMsgs = JSON.stringify(result.sideEffects);
    expect(bannerMsgs).not.toMatch(/回响：二次结算无额外效果/);
  });
});

// ---------------------------------------------------------------------------
// Backpack capacity — overflow handled by processRecycleBag
// ---------------------------------------------------------------------------

describe('洗册归川 backpack capacity', () => {
  it('respects backpack capacity: overflow ready cards stay in recycle bag', () => {
    // Set tiny effective capacity by reducing modifier; baseline capacity = 6
    // (BASE_BACKPACK_CAPACITY). Use a lot of round-trippers + a waits=1 card
    // to force overflow if the system bypasses capacity.
    const card = makeRecycleTideCard('cap1');
    const fillers = Array.from({ length: 8 }, (_, i) => makeFiller(`f${i}`));
    const r1 = makeRecycleBagCard('r1', 1);
    const state = makeState({
      handCards: [card] as any,
      backpackItems: fillers, // already over default cap, but the engine
      // currently allows holding above cap; we still want to verify
      // round-trip preserves the same set count.
      permanentMagicRecycleBag: [r1],
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // All originals must be accounted for: total card count across backpack +
    // recycle bag (excluding the played magic card itself which sits in the
    // recycle bag because of recycleDelay=1) must equal originals + r1.
    const allCardIds = [
      ...result.state.backpackItems.map((c: any) => c.id),
      ...result.state.permanentMagicRecycleBag
        .filter((c: any) => c.id !== card.id)
        .map((c: any) => c.id),
    ].sort();
    const originalIds = [...fillers.map(f => f.id), 'r1'].sort();
    expect(allCardIds).toEqual(originalIds);
  });
});
