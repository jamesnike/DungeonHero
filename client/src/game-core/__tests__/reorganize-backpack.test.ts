/**
 * 整顿背囊 (knight:reorganize-backpack) — Perm 2 magic.
 *
 * Main effect (PLAY_CARD):
 *   - Permanently +1 to backpackCapacityModifier.
 *   - Opens a 'reorganize-backpack' / 'multi-select' pendingMagicAction with
 *     `maxSelections = min(3, newCapacity - currentBackpackCount)`.
 *   - If maxSelections === 0 (backpack still has no room after +1) → finalize
 *     immediately, no selection prompt.
 *
 * RESOLVE_PUSH_TO_BACKPACK_TOP:
 *   - Each selection is { source: 'hand' | 'amulet' | 'equipment', id: string }.
 *   - Caps to pending.maxSelections; ignores duplicates and unknown ids.
 *   - Refuses to push the played card itself, even if it appears in the
 *     selections (defense-in-depth).
 *   - Equipment / amulet removal does NOT trigger break flow / salvage / gold.
 *   - Cards land at the END of backpackItems in selection order, so the
 *     last selected ends up at the array tail (conceptual "top"). Order
 *     within the array is preserved.
 *   - Empty selection array is allowed (player skips placement, keeps +1).
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { BASE_BACKPACK_CAPACITY } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { AmuletItem, EquipmentItem } from '@/components/game-board/types';
// Importing this barrel registers all card definitions including
// `knight:reorganize-backpack`.
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeCard(idSuffix = 'rb') {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic' as const,
    name: '整顿背囊',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent' as const,
    magicEffect: '背包上限 +1；选至多 3 张牌放回背包顶部。',
    description: 'test',
    knightEffect: 'reorganize-backpack',
    recycleDelay: 2,
  };
}

function makeFiller(id: string, name = `Filler-${id}`) {
  return {
    id,
    type: 'magic' as const,
    name,
    value: 0,
    image: '',
  };
}

function makeAmulet(id: string, name = `Amulet-${id}`): AmuletItem {
  return {
    id,
    type: 'amulet' as const,
    name,
    value: 0,
    image: '',
  } as unknown as AmuletItem;
}

function makeEquipment(id: string, name = `Eq-${id}`): EquipmentItem {
  return {
    id,
    type: 'weapon' as const,
    name,
    value: 3,
    durability: 3,
    maxDurability: 3,
  } as unknown as EquipmentItem;
}

// ---------------------------------------------------------------------------
// Main resolver (PLAY_CARD)
// ---------------------------------------------------------------------------

describe('整顿背囊 main resolver (PLAY_CARD)', () => {
  it('+1 capacity and opens multi-select prompt with maxSelections capped by room', () => {
    const card = makeCard('open');
    // BASE_BACKPACK_CAPACITY is 15; with modifier 0 and 1 backpack item we
    // have plenty of room after +1 — maxSelections should hit the 3 cap.
    const state = makeState({
      handCards: [card, makeFiller('h1'), makeFiller('h2')],
      backpackItems: [makeFiller('bp1')] as any,
      backpackCapacityModifier: 0,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.backpackCapacityModifier).toBe(1);
    expect(result.state.pendingMagicAction).not.toBeNull();
    const pending = result.state.pendingMagicAction as any;
    expect(pending.effect).toBe('reorganize-backpack');
    expect(pending.step).toBe('multi-select');
    expect(pending.maxSelections).toBe(3);
  });

  it('caps maxSelections to remaining room when only 1 free slot remains', () => {
    const card = makeCard('cap');
    // Pick a negative modifier so that `newCap = max(1, BASE + mod + 1) = 3`.
    // Then fill backpack with 2 items so room after +1 = 3 - 2 = 1, which
    // forces maxSelections to be capped at 1 (below the regular cap of 3).
    const modifier = 2 - BASE_BACKPACK_CAPACITY; // makes BASE + mod = 2 → newCap after +1 = 3
    const filled = [makeFiller('bp0'), makeFiller('bp1')];
    const state = makeState({
      handCards: [card],
      backpackItems: filled as any,
      backpackCapacityModifier: modifier,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.backpackCapacityModifier).toBe(modifier + 1);
    const pending = result.state.pendingMagicAction as any;
    expect(pending).not.toBeNull();
    expect(pending.maxSelections).toBe(1);
  });

  it('finalizes immediately when no room exists even after +1', () => {
    const card = makeCard('full');
    // Squeeze capacity to the floor: pick a modifier so that newCap after the
    // +1 is still clamped to 1 by `max(1, ...)`. Using `-(BASE + 5)` keeps it
    // safely below the floor regardless of BASE_BACKPACK_CAPACITY tweaks.
    // Filling backpack with 1 item leaves room = 0 → resolver should finalize.
    const modifier = -(BASE_BACKPACK_CAPACITY + 5);
    const state = makeState({
      handCards: [card],
      backpackItems: [makeFiller('bp0')] as any,
      backpackCapacityModifier: modifier,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.backpackCapacityModifier).toBe(modifier + 1);
    expect(result.state.pendingMagicAction).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RESOLVE_PUSH_TO_BACKPACK_TOP — confirmation step
// ---------------------------------------------------------------------------

describe('整顿背囊 RESOLVE_PUSH_TO_BACKPACK_TOP', () => {
  function pendingState(card: ReturnType<typeof makeCard>, overrides: Partial<GameState>, maxSelections = 3) {
    return makeState({
      ...overrides,
      pendingMagicAction: {
        card,
        effect: 'reorganize-backpack',
        step: 'multi-select',
        maxSelections,
        prompt: 'pick up to N',
      } as any,
    });
  }

  it('hand selection: removes from hand and appends to backpack tail', () => {
    const card = makeCard('hand-1');
    const h1 = makeFiller('h1', 'Alpha');
    const h2 = makeFiller('h2', 'Beta');
    const state = pendingState(card, {
      handCards: [card, h1, h2],
      backpackItems: [makeFiller('bp0', 'BP0')] as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_PUSH_TO_BACKPACK_TOP', selections: [{ source: 'hand', id: 'h1' }] } as GameAction,
    ]);
    expect(result.state.handCards.find(c => c.id === 'h1')).toBeUndefined();
    expect(result.state.handCards.find(c => c.id === 'h2')).toBeDefined();
    // h1 appended at tail (conceptual "top").
    const bp = result.state.backpackItems;
    expect(bp[bp.length - 1].id).toBe('h1');
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('amulet selection: removes from amuletSlots and appends to backpack', () => {
    const card = makeCard('amulet-1');
    const a1 = makeAmulet('a1');
    const state = pendingState(card, {
      handCards: [card],
      amuletSlots: [a1] as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_PUSH_TO_BACKPACK_TOP', selections: [{ source: 'amulet', id: 'a1' }] } as GameAction,
    ]);
    expect((result.state.amuletSlots as any[]).find(c => c?.id === 'a1')).toBeUndefined();
    expect(result.state.backpackItems[result.state.backpackItems.length - 1].id).toBe('a1');
  });

  it('equipment selection: clears slot and appends; NO break flow runs', () => {
    const card = makeCard('eq-1');
    const eq1 = makeEquipment('e1', 'Sword');
    const state = pendingState(card, {
      handCards: [card],
      equipmentSlot1: eq1,
      equipmentSlot2: null,
    });
    const result = drain(state, [
      { type: 'RESOLVE_PUSH_TO_BACKPACK_TOP', selections: [{ source: 'equipment', id: 'equipmentSlot1' }] } as GameAction,
    ]);
    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.backpackItems[result.state.backpackItems.length - 1].id).toBe('e1');
    // No durability mutation, no last-words actions enqueued: durability of
    // pushed card matches the original (no -1, no break).
    const pushed = result.state.backpackItems[result.state.backpackItems.length - 1] as any;
    expect(pushed.durability).toBe(3);
  });

  it('mixed sources: 1 hand + 1 amulet + 1 equipment in selection order', () => {
    const card = makeCard('mix');
    const state = pendingState(card, {
      handCards: [card, makeFiller('h1', 'H1')],
      amuletSlots: [makeAmulet('a1')] as any,
      equipmentSlot1: makeEquipment('e1', 'Sword'),
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_PUSH_TO_BACKPACK_TOP',
        selections: [
          { source: 'hand', id: 'h1' },
          { source: 'amulet', id: 'a1' },
          { source: 'equipment', id: 'equipmentSlot1' },
        ],
      } as GameAction,
    ]);
    const bp = result.state.backpackItems;
    // Last 3 entries should be h1, a1, e1 in selection order; e1 ends up at tail.
    expect(bp.slice(-3).map(c => c.id)).toEqual(['h1', 'a1', 'e1']);
    expect(result.state.handCards.find(c => c.id === 'h1')).toBeUndefined();
    expect((result.state.amuletSlots as any[]).find(c => c?.id === 'a1')).toBeUndefined();
    expect(result.state.equipmentSlot1).toBeNull();
  });

  it('caps selection list to maxSelections (extras silently dropped)', () => {
    const card = makeCard('cap-extra');
    const state = pendingState(
      card,
      {
        handCards: [card, makeFiller('h1'), makeFiller('h2'), makeFiller('h3'), makeFiller('h4')],
      },
      2, // pretend resolver computed maxSelections = 2
    );
    const result = drain(state, [
      {
        type: 'RESOLVE_PUSH_TO_BACKPACK_TOP',
        selections: [
          { source: 'hand', id: 'h1' },
          { source: 'hand', id: 'h2' },
          { source: 'hand', id: 'h3' },
          { source: 'hand', id: 'h4' },
        ],
      } as GameAction,
    ]);
    const bp = result.state.backpackItems;
    expect(bp.slice(-2).map(c => c.id)).toEqual(['h1', 'h2']);
    expect(result.state.handCards.find(c => c.id === 'h3')).toBeDefined();
    expect(result.state.handCards.find(c => c.id === 'h4')).toBeDefined();
  });

  it('refuses to push the played card itself even if it appears in selections', () => {
    const card = makeCard('self');
    const state = pendingState(card, {
      handCards: [card, makeFiller('h1')],
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_PUSH_TO_BACKPACK_TOP',
        selections: [
          { source: 'hand', id: card.id },
          { source: 'hand', id: 'h1' },
        ],
      } as GameAction,
    ]);
    const bp = result.state.backpackItems;
    // Only h1 should have been pushed; the played card is consumed by FINALIZE.
    expect(bp.find(c => c.id === card.id)).toBeUndefined();
    expect(bp.find(c => c.id === 'h1')).toBeDefined();
  });

  it('empty selection array: no cards moved, pending cleared, +1 capacity stays', () => {
    const card = makeCard('skip');
    const state = pendingState(card, {
      handCards: [card, makeFiller('h1')],
      // Simulate that the resolver already incremented the modifier, since
      // this reducer is called *after* the resolver's patch is applied.
      backpackCapacityModifier: 1,
    });
    const result = drain(state, [
      { type: 'RESOLVE_PUSH_TO_BACKPACK_TOP', selections: [] } as GameAction,
    ]);
    expect(result.state.handCards.find(c => c.id === 'h1')).toBeDefined();
    expect(result.state.pendingMagicAction).toBeNull();
    expect(result.state.backpackCapacityModifier).toBe(1);
  });

  it('duplicate selections of the same id+source are deduped', () => {
    const card = makeCard('dup');
    const state = pendingState(card, {
      handCards: [card, makeFiller('h1')],
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_PUSH_TO_BACKPACK_TOP',
        selections: [
          { source: 'hand', id: 'h1' },
          { source: 'hand', id: 'h1' },
        ],
      } as GameAction,
    ]);
    const bp = result.state.backpackItems;
    expect(bp.filter(c => c.id === 'h1')).toHaveLength(1);
  });

  it('unknown ids are silently skipped (no crash, no spurious moves)', () => {
    const card = makeCard('unknown');
    const state = pendingState(card, {
      handCards: [card, makeFiller('h1')],
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_PUSH_TO_BACKPACK_TOP',
        selections: [
          { source: 'hand', id: 'does-not-exist' },
          { source: 'amulet', id: 'a-missing' },
          { source: 'equipment', id: 'equipmentSlot1' }, // slot is null
        ],
      } as GameAction,
    ]);
    expect(result.state.pendingMagicAction).toBeNull();
    // Only valid selections result in pushes — none here.
    const bp = result.state.backpackItems;
    expect(bp.find(c => c.id === 'h1')).toBeUndefined();
  });

  it('strips `fromSlot` from equipment / amulet cards pushed back to backpack', () => {
    // Regression: previously the reducer pushed slot items as-is, retaining
    // their `fromSlot: 'equipmentSlotN' | 'amulet'` metadata. After the cards
    // travelled through backpack → hand, GameBoard.handleCardToSlot's
    // `isCardFromEquipmentSlot(card)` guard saw the stale `fromSlot` and
    // rejected the drop — the slot looked empty but the card could never be
    // re-equipped (and amulets carrying `fromSlot: 'amulet'` were treated as
    // "still in amulet slot" by other flows).
    const card = makeCard('strip');
    const eq1 = { ...makeEquipment('e1', 'Sword'), fromSlot: 'equipmentSlot1' as const };
    const eq2 = { ...makeEquipment('e2', 'Shield'), fromSlot: 'equipmentSlot2' as const };
    const am1 = { ...makeAmulet('a1'), fromSlot: 'amulet' as const };
    const state = pendingState(card, {
      handCards: [card],
      equipmentSlot1: eq1 as EquipmentItem,
      equipmentSlot2: eq2 as EquipmentItem,
      amuletSlots: [am1] as any,
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_PUSH_TO_BACKPACK_TOP',
        selections: [
          { source: 'equipment', id: 'equipmentSlot1' },
          { source: 'equipment', id: 'equipmentSlot2' },
          { source: 'amulet', id: 'a1' },
        ],
      } as GameAction,
    ]);
    const bp = result.state.backpackItems;
    const pushedE1 = bp.find(c => c.id === 'e1') as any;
    const pushedE2 = bp.find(c => c.id === 'e2') as any;
    const pushedA1 = bp.find(c => c.id === 'a1') as any;
    expect(pushedE1).toBeDefined();
    expect(pushedE2).toBeDefined();
    expect(pushedA1).toBeDefined();
    expect(pushedE1.fromSlot).toBeUndefined();
    expect(pushedE2.fromSlot).toBeUndefined();
    expect(pushedA1.fromSlot).toBeUndefined();
  });

  it('played card lands in recycle bag (Perm) after resolution finalizes', () => {
    // In real flow, PLAY_CARD removes the card from hand BEFORE the resolver
    // runs, so we mirror that by setting handCards to [] in the pending state.
    // FINALIZE_MAGIC_CARD then routes the played Perm card to the recycle bag.
    const card = makeCard('consume');
    const state = pendingState(card, {
      handCards: [],
    });
    const result = drain(state, [
      { type: 'RESOLVE_PUSH_TO_BACKPACK_TOP', selections: [] } as GameAction,
    ]);
    expect(result.state.permanentMagicRecycleBag.some((c: any) => c.id === card.id)).toBe(true);
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
    expect(result.state.pendingMagicAction).toBeNull();
  });
});
