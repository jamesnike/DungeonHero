/**
 * 影摹召引符 (`mirror-copy-summon` amulet) — unique class amulet.
 *
 * Behavior contract:
 *   - Each equipped 影摹召引符 adds N to `state.mirrorCopySummonStreak`
 *     per drawn card on the "standard draw" paths (DRAW_CARDS source:
 *     backpack|deck, plus DRAW_FROM_BACKPACK).
 *   - When streak >= 8, fire `Math.floor(streak/8)` triggers; each trigger
 *     grants 1 「镜影摹形」 card (`knightEffect: 'mirror-copy'`) to hand.
 *     Streak then `%= 8` to keep the remainder.
 *   - `combat:mirrorCopySummonTriggered` side effect carries `{ count, threshold }`.
 *   - Granted card uses `ADD_CARDS_TO_HAND` (whitelisted in pipeline so it
 *     drains in `phase: 'playerInput'`).
 *   - `recycleBag` source on DRAW_CARDS does NOT count (that path doesn't
 *     deliver to hand — it restores recycle bag → backpack).
 *
 * End-to-end coverage (per `testing.mdc` — exercise the full dispatch chain
 * a real user would trigger, in `phase: 'playerInput'` per
 * `pipeline-input-continuation.mdc`):
 *   - 7 draws → streak = 7, no grant.
 *   - 8th draw (total) → 1 grant, streak = 0, side effect fires.
 *   - Single 9-card draw → 1 grant, remainder = 1.
 *   - 2 amulets equipped → 4 draws trigger 1 grant.
 *   - `recycleBag` source doesn't increment streak.
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { AmuletItem } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput',
    handLimitBonus: 50,
    ...overrides,
  };
}

function makeMirrorCopySummonAmulet(id = 'mcs-1'): AmuletItem {
  return {
    id,
    type: 'amulet' as const,
    name: '影摹召引符',
    value: 1,
    image: '',
    classCard: true,
    unique: true,
    amuletEffect: 'mirror-copy-summon',
  } as AmuletItem;
}

function makePlainCard(id: string): GameCardData {
  return {
    id,
    type: 'magic' as const,
    name: `Plain-${id}`,
    value: 0,
    image: '',
    magicType: 'instant',
  } as GameCardData;
}

function makeBackpack(count: number, prefix = 'bp'): GameCardData[] {
  return Array.from({ length: count }, (_, i) => makePlainCard(`${prefix}-${i}`));
}

describe('影摹召引符 (mirror-copy-summon) — end-to-end', () => {
  it('1 amulet + 7 backpack draws → streak = 7, no grant', () => {
    const state = makeState({
      amuletSlots: [makeMirrorCopySummonAmulet()] as AmuletItem[],
      backpackItems: makeBackpack(10),
      handCards: [],
    });

    const result = drain(state, [
      { type: 'DRAW_CARDS', count: 7, source: 'backpack' } as GameAction,
    ]);

    expect(result.state.mirrorCopySummonStreak).toBe(7);
    expect(result.state.handCards.find(c => (c as GameCardData & { knightEffect?: string }).knightEffect === 'mirror-copy')).toBeUndefined();
    expect(result.sideEffects.some(e => e.event === 'combat:mirrorCopySummonTriggered')).toBe(false);
  });

  it('1 amulet + 8 backpack draws → streak resets to 0, 1 mirror-copy granted, side effect fires', () => {
    const state = makeState({
      amuletSlots: [makeMirrorCopySummonAmulet()] as AmuletItem[],
      backpackItems: makeBackpack(12),
      handCards: [],
    });

    const result = drain(state, [
      { type: 'DRAW_CARDS', count: 8, source: 'backpack' } as GameAction,
    ]);

    expect(result.state.mirrorCopySummonStreak).toBe(0);
    const grantedInHand = result.state.handCards.filter(
      c => (c as GameCardData & { knightEffect?: string }).knightEffect === 'mirror-copy',
    );
    expect(grantedInHand).toHaveLength(1);
    expect(grantedInHand[0].name).toBe('镜影摹形');

    const triggered = result.sideEffects.find(e => e.event === 'combat:mirrorCopySummonTriggered');
    expect(triggered).toBeDefined();
    expect((triggered?.payload as { count: number; threshold: number }).count).toBe(1);
    expect((triggered?.payload as { count: number; threshold: number }).threshold).toBe(8);
  });

  it('1 amulet + sequential 7 then 1 draws → cumulative streak triggers exactly once on 8th draw', () => {
    let state = makeState({
      amuletSlots: [makeMirrorCopySummonAmulet()] as AmuletItem[],
      backpackItems: makeBackpack(15),
      handCards: [],
    });

    // 7 draws → no trigger yet.
    let r = drain(state, [{ type: 'DRAW_CARDS', count: 7, source: 'backpack' } as GameAction]);
    state = r.state;
    expect(state.mirrorCopySummonStreak).toBe(7);
    expect(state.handCards.find(c => (c as GameCardData & { knightEffect?: string }).knightEffect === 'mirror-copy')).toBeUndefined();

    // 1 more draw → streak crosses threshold, grants 1.
    r = drain(state, [{ type: 'DRAW_CARDS', count: 1, source: 'backpack' } as GameAction]);
    state = r.state;
    expect(state.mirrorCopySummonStreak).toBe(0);
    const granted = state.handCards.filter(
      c => (c as GameCardData & { knightEffect?: string }).knightEffect === 'mirror-copy',
    );
    expect(granted).toHaveLength(1);
  });

  it('1 amulet + single 9-card draw → 1 grant, remainder = 1', () => {
    const state = makeState({
      amuletSlots: [makeMirrorCopySummonAmulet()] as AmuletItem[],
      backpackItems: makeBackpack(12),
      handCards: [],
    });

    const result = drain(state, [
      { type: 'DRAW_CARDS', count: 9, source: 'backpack' } as GameAction,
    ]);

    expect(result.state.mirrorCopySummonStreak).toBe(1);
    const granted = result.state.handCards.filter(
      c => (c as GameCardData & { knightEffect?: string }).knightEffect === 'mirror-copy',
    );
    expect(granted).toHaveLength(1);

    const triggered = result.sideEffects.find(e => e.event === 'combat:mirrorCopySummonTriggered');
    expect((triggered?.payload as { count: number }).count).toBe(1);
  });

  it('1 amulet + single 17-card draw → 2 grants (16/8 = 2), remainder = 1', () => {
    const state = makeState({
      amuletSlots: [makeMirrorCopySummonAmulet()] as AmuletItem[],
      backpackItems: makeBackpack(20),
      handCards: [],
    });

    const result = drain(state, [
      { type: 'DRAW_CARDS', count: 17, source: 'backpack' } as GameAction,
    ]);

    expect(result.state.mirrorCopySummonStreak).toBe(1);
    const granted = result.state.handCards.filter(
      c => (c as GameCardData & { knightEffect?: string }).knightEffect === 'mirror-copy',
    );
    expect(granted).toHaveLength(2);

    const triggered = result.sideEffects.find(e => e.event === 'combat:mirrorCopySummonTriggered');
    expect((triggered?.payload as { count: number }).count).toBe(2);
  });

  it('2 amulets (stacking ×2) + 4 backpack draws → 1 grant (4 × 2 = 8)', () => {
    const state = makeState({
      // Directly seed 2 amulets to bypass the unique-card lock (eternal-relic
      // edge case: a relic could carry the same effectId, doubling effective N).
      amuletSlots: [
        makeMirrorCopySummonAmulet('mcs-1'),
        makeMirrorCopySummonAmulet('mcs-2'),
      ] as AmuletItem[],
      maxAmuletSlots: 2,
      backpackItems: makeBackpack(10),
      handCards: [],
    });

    const result = drain(state, [
      { type: 'DRAW_CARDS', count: 4, source: 'backpack' } as GameAction,
    ]);

    expect(result.state.mirrorCopySummonStreak).toBe(0);
    const granted = result.state.handCards.filter(
      c => (c as GameCardData & { knightEffect?: string }).knightEffect === 'mirror-copy',
    );
    expect(granted).toHaveLength(1);
  });

  it('DRAW_FROM_BACKPACK (sword overkill / amulet draw path) also increments streak', () => {
    const state = makeState({
      amuletSlots: [makeMirrorCopySummonAmulet()] as AmuletItem[],
      backpackItems: makeBackpack(12),
      handCards: [],
    });

    const result = drain(state, [
      { type: 'DRAW_FROM_BACKPACK', count: 8 } as GameAction,
    ]);

    expect(result.state.mirrorCopySummonStreak).toBe(0);
    const granted = result.state.handCards.filter(
      c => (c as GameCardData & { knightEffect?: string }).knightEffect === 'mirror-copy',
    );
    expect(granted).toHaveLength(1);
  });

  it('DRAW_CARDS source: deck (waterfall turn refill / "draw N from deck" cards) increments streak', () => {
    const state = makeState({
      amuletSlots: [makeMirrorCopySummonAmulet()] as AmuletItem[],
      remainingDeck: makeBackpack(12, 'deck'),
      handCards: [],
    });

    const result = drain(state, [
      { type: 'DRAW_CARDS', count: 8, source: 'deck' } as GameAction,
    ]);

    expect(result.state.mirrorCopySummonStreak).toBe(0);
    const granted = result.state.handCards.filter(
      c => (c as GameCardData & { knightEffect?: string }).knightEffect === 'mirror-copy',
    );
    expect(granted).toHaveLength(1);
  });

  it('DRAW_CARDS source: recycleBag does NOT increment streak (cards go to backpack, not hand)', () => {
    const recycleCard = {
      ...makePlainCard('rec-1'),
      magicType: 'permanent' as const,
      recycleDelay: 1,
      _recycleWaits: 1,
    } as GameCardData;
    const state = makeState({
      amuletSlots: [makeMirrorCopySummonAmulet()] as AmuletItem[],
      permanentMagicRecycleBag: [recycleCard],
      backpackItems: [],
      handCards: [],
    });

    const result = drain(state, [
      { type: 'DRAW_CARDS', count: 8, source: 'recycleBag' } as GameAction,
    ]);

    // recycleBag source restores cards to backpack (not hand) → not a "draw to hand" event.
    expect(result.state.mirrorCopySummonStreak).toBe(0);
    expect(
      result.state.handCards.find(c => (c as GameCardData & { knightEffect?: string }).knightEffect === 'mirror-copy'),
    ).toBeUndefined();
  });

  it('no amulet equipped → streak never moves, no grant', () => {
    const state = makeState({
      amuletSlots: [] as AmuletItem[],
      backpackItems: makeBackpack(12),
      handCards: [],
    });

    const result = drain(state, [
      { type: 'DRAW_CARDS', count: 10, source: 'backpack' } as GameAction,
    ]);

    expect(result.state.mirrorCopySummonStreak).toBe(0);
    expect(
      result.state.handCards.find(c => (c as GameCardData & { knightEffect?: string }).knightEffect === 'mirror-copy'),
    ).toBeUndefined();
    expect(result.sideEffects.some(e => e.event === 'combat:mirrorCopySummonTriggered')).toBe(false);
  });
});
