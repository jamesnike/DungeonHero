/**
 * 弃装重铸 (knight:discard-rebuild) — Perm 2 magic.
 *
 * Behavior:
 *   - Acts on all equipment in equipmentSlot1 / equipmentSlot2 — tries to
 *     destroy each piece.
 *   - Equipment with active revive (native monster revive OR
 *     `hasEquipmentRevive` from 复生秘典 / 不朽骨盾) survives at 1 durability
 *     instead of entering the graveyard.
 *   - Each acted-on slot queues a class-deck discover **regardless of whether
 *     the equipment was destroyed or revived**. The first discover is
 *     dispatched immediately via BEGIN_DISCOVER; the rest sit in
 *     `pendingClassDiscoverQueue` and pop sequentially when the modal closes.
 *   - Last-words such as `onDestroyPermanentShield` still fire on actual
 *     destruction because we route through `computeEquipmentBreakEffects`.
 *   - 招灵书印 (delete-draw) hook still uses true-destruction count (excludes
 *     revived) — that hook is about destruction semantics, not "acted on".
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

function makeCard(idSuffix = 'dr'): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic',
    name: '弃装重铸',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    magicEffect: '摧毁全部装备，按摧毁数依次发现专属牌。',
    description: 'test',
    knightEffect: 'discard-rebuild',
    recycleDelay: 2,
  } as GameCardData;
}

function makeWeapon(id: string, overrides: Partial<GameCardData> = {}): GameCardData {
  return {
    id,
    type: 'weapon',
    name: `Sword-${id}`,
    value: 2,
    durability: 2,
    maxDurability: 2,
    ...overrides,
  } as GameCardData;
}

function makeShield(id: string, overrides: Partial<GameCardData> = {}): GameCardData {
  return {
    id,
    type: 'shield',
    name: `Shield-${id}`,
    value: 3,
    durability: 2,
    maxDurability: 2,
    armorMax: 3,
    ...overrides,
  } as GameCardData;
}

function makeClassCard(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: `Class-${id}`,
    value: 0,
    image: '',
    classCard: true,
    magicType: 'instant',
    magicEffect: 'test',
    description: 'class card',
  } as GameCardData;
}

describe('弃装重铸 (knight:discard-rebuild)', () => {
  it('destroys both equipment slots and queues N-1 discovers (one fires immediately)', () => {
    const card = makeCard('both');
    const w = makeWeapon('w1');
    const s = makeShield('s1');
    const classDeck = [
      makeClassCard('c1'),
      makeClassCard('c2'),
      makeClassCard('c3'),
      makeClassCard('c4'),
      makeClassCard('c5'),
    ];
    const state = makeState({
      handCards: [card],
      equipmentSlot1: w as any,
      equipmentSlot2: s as any,
      classDeck,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.equipmentSlot2).toBeNull();
    // Both equipment ended up in the graveyard.
    expect(result.state.discardedCards.some(c => c.id === 'w1')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 's1')).toBe(true);
    // First discover fired (modal open with options drawn from classDeck).
    expect(result.state.discoverModalOpen).toBe(true);
    expect(result.state.discoverOptions.length).toBeGreaterThan(0);
    expect(result.state.discoverSourceLabel).toBe('弃装重铸');
    // Discovered cards land directly in hand (hand-first delivery, mirrors
    // 「专属感召」 / 回炉重造). Both the immediate BEGIN_DISCOVER and queued
    // entries must carry delivery: 'hand-first'.
    expect(result.state.discoverDelivery).toBe('hand-first');
    // Second discover queued for after the first modal closes.
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(1);
    expect(result.state.pendingClassDiscoverQueue[0]).toEqual({
      source: 'discard-rebuild',
      sourceLabel: '弃装重铸',
      delivery: 'hand-first',
    });
    // Card consumed from hand (heads to recycle bag with delay 2).
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
  });

  it('triggers last-words on destroyed equipment (perm slot armor +1)', () => {
    const card = makeCard('lw');
    // 汰换之刃 pattern: onDestroyPermanentShield = 1 ⇒ slot perm armor +1.
    const w = makeWeapon('w-lw', {
      onDestroyPermanentShield: 1,
    });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: w as any,
      equipmentSlot2: null,
      classDeck: [makeClassCard('c1')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBeGreaterThanOrEqual(1);
  });

  it('revival keeps equipment alive but STILL counts toward discover (1 acted slot → 1 discover)', () => {
    const card = makeCard('rev');
    const w = makeWeapon('w-rev', {
      hasEquipmentRevive: true,
      durability: 0,
    });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: w as any,
      equipmentSlot2: null,
      classDeck: [makeClassCard('c1'), makeClassCard('c2')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Equipment revived at 1 durability instead of being destroyed (did NOT
    // enter graveyard).
    expect(result.state.equipmentSlot1).not.toBeNull();
    expect((result.state.equipmentSlot1 as any).durability).toBe(1);
    expect((result.state.equipmentSlot1 as any).equipmentReviveUsed).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'w-rev')).toBe(false);
    // 1 acted-on slot → 1 discover fires immediately, queue is empty.
    expect(result.state.discoverModalOpen).toBe(true);
    expect(result.state.discoverOptions.length).toBeGreaterThan(0);
    expect(result.state.discoverSourceLabel).toBe('弃装重铸');
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(0);
  });

  it('mixed slot: 1 destroyed + 1 revived → 2 discovers (1 fires, 1 queued)', () => {
    const card = makeCard('mix');
    // Slot 1: revive equipment (survives).
    const w = makeWeapon('w-mix', {
      hasEquipmentRevive: true,
      durability: 0,
    });
    // Slot 2: regular shield (gets destroyed).
    const s = makeShield('s-mix');
    const state = makeState({
      handCards: [card],
      equipmentSlot1: w as any,
      equipmentSlot2: s as any,
      classDeck: [makeClassCard('c1'), makeClassCard('c2'), makeClassCard('c3')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Slot 1 revived in place; slot 2 cleared and shield went to graveyard.
    expect(result.state.equipmentSlot1).not.toBeNull();
    expect((result.state.equipmentSlot1 as any).equipmentReviveUsed).toBe(true);
    expect(result.state.equipmentSlot2).toBeNull();
    expect(result.state.discardedCards.some(c => c.id === 's-mix')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'w-mix')).toBe(false);
    // 2 acted slots → 2 discovers total (1 fires, 1 queued).
    expect(result.state.discoverModalOpen).toBe(true);
    expect(result.state.discoverSourceLabel).toBe('弃装重铸');
    expect(result.state.discoverDelivery).toBe('hand-first');
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(1);
    expect(result.state.pendingClassDiscoverQueue[0]).toEqual({
      source: 'discard-rebuild',
      sourceLabel: '弃装重铸',
      delivery: 'hand-first',
    });
  });

  it('both slots revived → 2 discovers, no graveyard entries', () => {
    const card = makeCard('rev2');
    const w = makeWeapon('w-rev2', {
      hasEquipmentRevive: true,
      durability: 0,
    });
    const s = makeShield('s-rev2', {
      hasEquipmentRevive: true,
      durability: 0,
    });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: w as any,
      equipmentSlot2: s as any,
      classDeck: [makeClassCard('c1'), makeClassCard('c2'), makeClassCard('c3')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Both equipment revived; nothing in graveyard.
    expect(result.state.equipmentSlot1).not.toBeNull();
    expect(result.state.equipmentSlot2).not.toBeNull();
    expect(result.state.discardedCards.some(c => c.id === 'w-rev2')).toBe(false);
    expect(result.state.discardedCards.some(c => c.id === 's-rev2')).toBe(false);
    // Still 2 discovers triggered.
    expect(result.state.discoverModalOpen).toBe(true);
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(1);
  });

  it('no equipment → card consumed, no discover, no queue', () => {
    const card = makeCard('empty');
    const state = makeState({
      handCards: [card],
      equipmentSlot1: null,
      equipmentSlot2: null,
      classDeck: [makeClassCard('c1')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
    expect(result.state.discoverModalOpen).toBe(false);
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(0);
  });

  it('closing the discover modal dequeues the next pending discover', () => {
    const queued = makeState({
      classDeck: [makeClassCard('c1'), makeClassCard('c2'), makeClassCard('c3')],
      pendingClassDiscoverQueue: [{ source: 'discard-rebuild', sourceLabel: '弃装重铸' }],
      discoverModalOpen: true,
      discoverOptions: [makeClassCard('c0')],
      discoverSourceLabel: '弃装重铸',
    });

    // Close the modal (mirrors handleDiscoverSelect).
    const after = drain(queued, [
      { type: 'SET_DISCOVER_MODAL', open: false, options: [], sourceLabel: null } as GameAction,
    ]);

    expect(after.state.discoverModalOpen).toBe(true);
    expect(after.state.discoverOptions.length).toBeGreaterThan(0);
    expect(after.state.discoverSourceLabel).toBe('弃装重铸');
    expect(after.state.pendingClassDiscoverQueue).toHaveLength(0);
  });

  it('closing the modal with empty queue does not re-open', () => {
    const empty = makeState({
      pendingClassDiscoverQueue: [],
      discoverModalOpen: true,
      discoverOptions: [makeClassCard('c0')],
    });
    const after = reduce(empty, {
      type: 'SET_DISCOVER_MODAL',
      open: false,
      options: [],
      sourceLabel: null,
    });
    expect(after.state.discoverModalOpen).toBe(false);
    expect(after.enqueuedActions ?? []).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // hand-first delivery — end-to-end: discovered card lands directly in hand
  // (mirrors 「专属感召」 / 回炉重造 UX). Both the immediate discover and the
  // queued one drained on modal close must use the hand-first destination.
  // -------------------------------------------------------------------------

  it('HAND-FIRST E2E: chosen discover card lands in hand (not backpack), and queued discover also delivers hand-first', () => {
    const card = makeCard('hf-e2e');
    const w = makeWeapon('w-hf-1');
    const s = makeShield('s-hf-1');
    const c1 = makeClassCard('c-hf-1');
    const c2 = makeClassCard('c-hf-2');
    const c3 = makeClassCard('c-hf-3');
    const c4 = makeClassCard('c-hf-4');
    const c5 = makeClassCard('c-hf-5');
    const state = makeState({
      handCards: [card],
      equipmentSlot1: w as any,
      equipmentSlot2: s as any,
      classDeck: [c1, c2, c3, c4, c5],
      backpackItems: [],
    });

    // Step 1: cast the spell. First discover modal opens, queue has 1 entry,
    // both should be hand-first.
    const afterCast = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(afterCast.state.discoverModalOpen).toBe(true);
    expect(afterCast.state.discoverDelivery).toBe('hand-first');
    expect(afterCast.state.pendingClassDiscoverQueue).toHaveLength(1);
    expect(afterCast.state.pendingClassDiscoverQueue[0].delivery).toBe('hand-first');

    // Step 2: pick the first discover option. Cloned card should land in hand
    // (hand has plenty of room; backpack should NOT receive it). The drain
    // pops the queued discover, opening a second modal — also hand-first.
    const firstOption = afterCast.state.discoverOptions[0];
    const handBefore = afterCast.state.handCards.length;
    const backpackBefore = afterCast.state.backpackItems.length;
    const afterPick1 = drain(afterCast.state, [
      { type: 'RESOLVE_DISCOVER_SELECTION', cardId: firstOption.id } as GameAction,
    ]);
    expect(afterPick1.state.handCards.length).toBe(handBefore + 1);
    expect(afterPick1.state.backpackItems.length).toBe(backpackBefore);
    // Newly added hand card matches the chosen option (cloned with fresh id,
    // so match by name).
    const newlyInHand = afterPick1.state.handCards[afterPick1.state.handCards.length - 1];
    expect(newlyInHand.name).toBe(firstOption.name);
    // Second discover popped from queue, also hand-first.
    expect(afterPick1.state.discoverModalOpen).toBe(true);
    expect(afterPick1.state.discoverDelivery).toBe('hand-first');
    expect(afterPick1.state.pendingClassDiscoverQueue).toHaveLength(0);

    // Step 3: pick the second discover. Card again lands in hand.
    const secondOption = afterPick1.state.discoverOptions[0];
    const handMid = afterPick1.state.handCards.length;
    const backpackMid = afterPick1.state.backpackItems.length;
    const afterPick2 = drain(afterPick1.state, [
      { type: 'RESOLVE_DISCOVER_SELECTION', cardId: secondOption.id } as GameAction,
    ]);
    expect(afterPick2.state.handCards.length).toBe(handMid + 1);
    expect(afterPick2.state.backpackItems.length).toBe(backpackMid);
    expect(afterPick2.state.discoverModalOpen).toBe(false);
    expect(afterPick2.state.pendingClassDiscoverQueue).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Stacked equipment (reserve) tests — each piece counts independently.
  // -------------------------------------------------------------------------

  it('STACK: slot1 main + 2 reserve, all no revive → 3 pieces destroyed, 3 discovers, slot+reserve cleared', () => {
    const card = makeCard('stack');
    const main = makeWeapon('w-main');
    const r1 = makeWeapon('w-r1');
    const r2 = makeWeapon('w-r2');
    const state = makeState({
      handCards: [card],
      equipmentSlot1: main as any,
      equipmentSlot1Reserve: [r1, r2] as any,
      equipmentSlot2: null,
      equipmentSlot2Reserve: [],
      classDeck: [
        makeClassCard('c1'), makeClassCard('c2'), makeClassCard('c3'),
        makeClassCard('c4'), makeClassCard('c5'),
      ],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // All 3 pieces gone — slot null, reserve empty.
    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.equipmentSlot1Reserve).toHaveLength(0);
    // All 3 in graveyard.
    expect(result.state.discardedCards.some(c => c.id === 'w-main')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'w-r1')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'w-r2')).toBe(true);
    // 3 discovers: 1 fires immediately, 2 queued.
    expect(result.state.discoverModalOpen).toBe(true);
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(2);
  });

  it('STACK: 1 reserve has revive → revived stays in stack at 1 dur, 3 discovers fire (1 active + 2 queued)', () => {
    const card = makeCard('stack-rev');
    const main = makeWeapon('w-main');
    // Reserve middle item has revive.
    const r1 = makeWeapon('w-r1', { hasEquipmentRevive: true, durability: 0 });
    const r2 = makeWeapon('w-r2');
    const state = makeState({
      handCards: [card],
      equipmentSlot1: main as any,
      equipmentSlot1Reserve: [r1, r2] as any, // r2 is top-of-reserve, r1 below
      equipmentSlot2: null,
      classDeck: [
        makeClassCard('c1'), makeClassCard('c2'), makeClassCard('c3'),
        makeClassCard('c4'), makeClassCard('c5'),
      ],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Stack visual order top→bottom = [main, r2, r1]. main destroyed,
    // r2 destroyed, r1 revived → only r1 survives. After top-down compaction
    // r1 becomes new main (only survivor).
    expect(result.state.equipmentSlot1).not.toBeNull();
    expect((result.state.equipmentSlot1 as any).id).toBe('w-r1');
    expect((result.state.equipmentSlot1 as any).durability).toBe(1);
    expect((result.state.equipmentSlot1 as any).equipmentReviveUsed).toBe(true);
    expect(result.state.equipmentSlot1Reserve).toHaveLength(0);
    // Destroyed pieces in graveyard.
    expect(result.state.discardedCards.some(c => c.id === 'w-main')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'w-r2')).toBe(true);
    // Revived piece NOT in graveyard.
    expect(result.state.discardedCards.some(c => c.id === 'w-r1')).toBe(false);
    // 3 acted-on pieces → 3 discovers (1 fires, 2 queued).
    expect(result.state.discoverModalOpen).toBe(true);
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(2);
  });

  it('STACK: main + reserve all have revive → all revive in original positions, 3 discovers', () => {
    const card = makeCard('stack-all-rev');
    const main = makeWeapon('w-main', { hasEquipmentRevive: true, durability: 0 });
    const r1 = makeWeapon('w-r1', { hasEquipmentRevive: true, durability: 0 });
    const r2 = makeWeapon('w-r2', { hasEquipmentRevive: true, durability: 0 });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: main as any,
      equipmentSlot1Reserve: [r1, r2] as any,
      equipmentSlot2: null,
      classDeck: [
        makeClassCard('c1'), makeClassCard('c2'), makeClassCard('c3'),
        makeClassCard('c4'), makeClassCard('c5'),
      ],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Original stack visual order: [w-main (main), w-r2 (top reserve), w-r1 (bottom reserve)]
    // All survive in original positions:
    //   main = w-main, reserve = [w-r1, w-r2]  (storage order: bottom-first)
    expect((result.state.equipmentSlot1 as any).id).toBe('w-main');
    expect((result.state.equipmentSlot1 as any).durability).toBe(1);
    expect(result.state.equipmentSlot1Reserve).toHaveLength(2);
    expect((result.state.equipmentSlot1Reserve[0] as any).id).toBe('w-r1');
    expect((result.state.equipmentSlot1Reserve[1] as any).id).toBe('w-r2');
    // None in graveyard.
    expect(result.state.discardedCards.some(c => c.id === 'w-main')).toBe(false);
    expect(result.state.discardedCards.some(c => c.id === 'w-r1')).toBe(false);
    expect(result.state.discardedCards.some(c => c.id === 'w-r2')).toBe(false);
    // 3 pieces acted on → 3 discovers.
    expect(result.state.discoverModalOpen).toBe(true);
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(2);
  });

  it('STACK PROMOTE: main destroyed + 1 reserve revives → reserve auto-promotes to main slot', () => {
    // Minimal 2-piece scenario explicitly verifying the user-facing contract:
    // when 弃装重铸 destroys the upper-layer (main) and the lower layer
    // (reserve) has revive, the revived reserve is automatically promoted
    // up into the main slot — it does NOT linger in reserve while main is null.
    const card = makeCard('promote-2piece');
    const main = makeWeapon('w-main'); // no revive → destroyed
    const r1 = makeWeapon('w-r1', { hasEquipmentRevive: true, durability: 0 });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: main as any,
      equipmentSlot1Reserve: [r1] as any, // single reserve item
      equipmentSlot2: null,
      classDeck: Array.from({ length: 5 }, (_, i) => makeClassCard(`c${i}`)),
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // r1 promoted from reserve → main slot, alive at 1 dur, revive consumed.
    expect(result.state.equipmentSlot1).not.toBeNull();
    expect((result.state.equipmentSlot1 as any).id).toBe('w-r1');
    expect((result.state.equipmentSlot1 as any).durability).toBe(1);
    expect((result.state.equipmentSlot1 as any).equipmentReviveUsed).toBe(true);
    // Reserve is now empty (no item left behind).
    expect(result.state.equipmentSlot1Reserve).toHaveLength(0);
    // Old main is in the graveyard.
    expect(result.state.discardedCards.some(c => c.id === 'w-main')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'w-r1')).toBe(false);
    // 2 acted-on pieces → 2 discovers.
    expect(result.state.discoverModalOpen).toBe(true);
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(1);
  });

  it('STACK PROMOTE: main destroyed + middle reserve destroyed + bottom reserve revives → bottom promotes to main', () => {
    // Verify promote-up works across multiple destroyed layers, not just an
    // adjacent one. The bottom-most surviving piece skips over a destroyed
    // middle layer to fill the main slot.
    const card = makeCard('promote-skip');
    const main = makeWeapon('w-main'); // destroyed
    const r1 = makeWeapon('w-r1', { hasEquipmentRevive: true, durability: 0 }); // bottom of reserve, revives
    const r2 = makeWeapon('w-r2'); // top of reserve, destroyed
    const state = makeState({
      handCards: [card],
      equipmentSlot1: main as any,
      equipmentSlot1Reserve: [r1, r2] as any, // r2 = top, r1 = bottom
      equipmentSlot2: null,
      classDeck: Array.from({ length: 5 }, (_, i) => makeClassCard(`c${i}`)),
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Stack visual top→bottom = [main, r2, r1]. Only r1 survives.
    // It compacts up past the destroyed r2 to become the new main.
    expect((result.state.equipmentSlot1 as any).id).toBe('w-r1');
    expect((result.state.equipmentSlot1 as any).durability).toBe(1);
    expect(result.state.equipmentSlot1Reserve).toHaveLength(0);
  });

  it('STACK PROMOTE: main revives + top reserve destroyed + bottom reserve revives → bottom fills the gap (main stays main)', () => {
    // When main itself revives, it stays as main — but a destroyed middle
    // layer is still "filled" by the surviving bottom layer compacting up.
    const card = makeCard('promote-mid-gap');
    const main = makeWeapon('w-main', { hasEquipmentRevive: true, durability: 0 }); // revives
    const r1 = makeWeapon('w-r1', { hasEquipmentRevive: true, durability: 0 }); // bottom, revives
    const r2 = makeWeapon('w-r2'); // top reserve, destroyed
    const state = makeState({
      handCards: [card],
      equipmentSlot1: main as any,
      equipmentSlot1Reserve: [r1, r2] as any, // r2 = top, r1 = bottom
      equipmentSlot2: null,
      classDeck: Array.from({ length: 5 }, (_, i) => makeClassCard(`c${i}`)),
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Stack visual top→bottom = [main(rev), r2(destroyed), r1(rev)].
    // Survivors top-down = [main, r1]. main stays main, r1 fills the
    // single reserve slot (was bottom-of-reserve, now sole reserve = top).
    expect((result.state.equipmentSlot1 as any).id).toBe('w-main');
    expect((result.state.equipmentSlot1 as any).equipmentReviveUsed).toBe(true);
    expect(result.state.equipmentSlot1Reserve).toHaveLength(1);
    expect((result.state.equipmentSlot1Reserve[0] as any).id).toBe('w-r1');
    expect(result.state.discardedCards.some(c => c.id === 'w-r2')).toBe(true);
  });

  it('STACK: both slots stacked, mixed → discover count = total piece count', () => {
    const card = makeCard('two-slots');
    // Slot 1: main + 1 reserve (both no revive) = 2 pieces
    const m1 = makeWeapon('w-m1');
    const r1 = makeWeapon('w-r1');
    // Slot 2: main + 2 reserve (all no revive) = 3 pieces
    const m2 = makeShield('s-m2');
    const sr1 = makeShield('s-r1');
    const sr2 = makeShield('s-r2');
    const state = makeState({
      handCards: [card],
      equipmentSlot1: m1 as any,
      equipmentSlot1Reserve: [r1] as any,
      equipmentSlot2: m2 as any,
      equipmentSlot2Reserve: [sr1, sr2] as any,
      classDeck: Array.from({ length: 10 }, (_, i) => makeClassCard(`c${i}`)),
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Both slots fully cleared.
    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.equipmentSlot1Reserve).toHaveLength(0);
    expect(result.state.equipmentSlot2).toBeNull();
    expect(result.state.equipmentSlot2Reserve).toHaveLength(0);
    // All 5 in graveyard.
    expect(result.state.discardedCards.filter(c =>
      ['w-m1', 'w-r1', 's-m2', 's-r1', 's-r2'].includes(c.id),
    )).toHaveLength(5);
    // 5 acted-on pieces → 5 discovers (1 fires + 4 queued).
    expect(result.state.discoverModalOpen).toBe(true);
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(4);
  });

  // -------------------------------------------------------------------------
  // Monster equipment (persuaded monsters) — should be treated identically.
  // -------------------------------------------------------------------------

  it('MONSTER: monster equip in main slot, no revive → destroyed, sent to graveyard with currentLayer reset to 1', () => {
    const card = makeCard('mon');
    const monsterEquip: GameCardData = {
      id: 'mon-main',
      type: 'monster',
      name: 'Goblin-Equip',
      value: 3,
      image: '',
      hp: 5,
      maxHp: 5,
      attack: 3,
      durability: 2,
      maxDurability: 2,
      currentLayer: 2,
      fury: 2,
    } as GameCardData;
    const state = makeState({
      handCards: [card],
      equipmentSlot1: monsterEquip as any,
      equipmentSlot2: null,
      classDeck: [makeClassCard('c1'), makeClassCard('c2')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.equipmentSlot1).toBeNull();
    const inGrave = result.state.discardedCards.find(c => c.id === 'mon-main') as any;
    expect(inGrave).toBeDefined();
    // Per monster-graveyard-layer-reset rule: currentLayer must be 1 in grave.
    expect(inGrave.currentLayer).toBe(1);
    // 1 piece acted → 1 discover.
    expect(result.state.discoverModalOpen).toBe(true);
  });

  it('MONSTER: monster equip in main slot with native hasRevive → revives at 1 dur, marks reviveUsed', () => {
    const card = makeCard('mon-rev');
    const monsterEquip: GameCardData = {
      id: 'mon-rev-main',
      type: 'monster',
      name: 'Phoenix-Equip',
      value: 3,
      image: '',
      hp: 5,
      maxHp: 5,
      attack: 3,
      durability: 2,
      maxDurability: 2,
      hasRevive: true,
      reviveUsed: false,
    } as GameCardData;
    const state = makeState({
      handCards: [card],
      equipmentSlot1: monsterEquip as any,
      equipmentSlot2: null,
      classDeck: [makeClassCard('c1'), makeClassCard('c2')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.equipmentSlot1).not.toBeNull();
    const slot = result.state.equipmentSlot1 as any;
    expect(slot.id).toBe('mon-rev-main');
    expect(slot.durability).toBe(1);
    expect(slot.reviveUsed).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'mon-rev-main')).toBe(false);
    // 1 piece acted → 1 discover (revive still counts).
    expect(result.state.discoverModalOpen).toBe(true);
  });

  it('MONSTER: monster equip in RESERVE → also processed (destroyed if no revive)', () => {
    const card = makeCard('mon-res');
    const main = makeWeapon('w-main');
    const monsterReserve: GameCardData = {
      id: 'mon-res-r1',
      type: 'monster',
      name: 'Goblin-Reserve',
      value: 3,
      image: '',
      hp: 5,
      maxHp: 5,
      attack: 3,
      durability: 2,
      maxDurability: 2,
      currentLayer: 1,
    } as GameCardData;
    const state = makeState({
      handCards: [card],
      equipmentSlot1: main as any,
      equipmentSlot1Reserve: [monsterReserve] as any,
      equipmentSlot2: null,
      classDeck: [makeClassCard('c1'), makeClassCard('c2'), makeClassCard('c3')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.equipmentSlot1Reserve).toHaveLength(0);
    expect(result.state.discardedCards.some(c => c.id === 'w-main')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'mon-res-r1')).toBe(true);
    // 2 pieces acted → 2 discovers.
    expect(result.state.discoverModalOpen).toBe(true);
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(1);
  });

  it('MONSTER: wraith-haunt last-words on monster equip → other slot gets the haunt damage bonus', () => {
    const card = makeCard('mon-haunt');
    const wraith: GameCardData = {
      id: 'mon-wraith',
      type: 'monster',
      name: 'Wraith-Equip',
      value: 3,
      image: '',
      hp: 5,
      maxHp: 5,
      attack: 3,
      durability: 2,
      maxDurability: 2,
      lastWords: 'wraith-haunt-3',
    } as GameCardData;
    const otherShield = makeShield('s-other');
    const state = makeState({
      handCards: [card],
      equipmentSlot1: wraith as any,
      equipmentSlot2: otherShield as any,
      classDeck: [makeClassCard('c1'), makeClassCard('c2'), makeClassCard('c3')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Wraith destroyed, shield destroyed too. wraith-haunt-3 should give
    // slot2 (other slot at time of cast) +3 damage bonus before it's cleared.
    expect(result.state.equipmentSlotBonuses.equipmentSlot2.damage).toBeGreaterThanOrEqual(3);
  });

  it('STACK: reserve item with onDestroyPermanentDamage → its slot gets the perm-damage bonus', () => {
    const card = makeCard('lw-reserve');
    const main = makeWeapon('w-main');
    // Reserve item with onDestroyPermanentDamage: 2 → slot1 perm damage +2.
    const r1 = makeWeapon('w-r1', { onDestroyPermanentDamage: 2 });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: main as any,
      equipmentSlot1Reserve: [r1] as any,
      equipmentSlot2: null,
      classDeck: [makeClassCard('c1'), makeClassCard('c2')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.equipmentSlot1Reserve).toHaveLength(0);
    // Reserve item's last-words fired: slot1 perm damage +2.
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.damage).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // 残骸回收符 (equipment-salvage amulet) — every destroyed weapon/shield is
  // independently rescued back to hand with maxDur-N. Mirrors standard
  // `computeEquipmentBreakEffects` salvage semantics.
  // -------------------------------------------------------------------------

  function makeSalvageAmulet(idSuffix = '1'): GameCardData {
    return {
      id: `a-salvage-${idSuffix}`,
      type: 'amulet',
      name: '残骸回收符',
      value: 0,
      image: '',
      amuletEffect: 'equipment-salvage',
    } as GameCardData;
  }

  it('SALVAGE: 1 amulet + 1 weapon (maxDur 2) → returns to hand with maxDur 1, NOT in graveyard, discover STILL fires', () => {
    const card = makeCard('salvage-1');
    const w = makeWeapon('w-salv', { durability: 2, maxDurability: 2 });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: w as any,
      equipmentSlot2: null,
      amuletSlots: [makeSalvageAmulet()] as any,
      classDeck: [makeClassCard('c1'), makeClassCard('c2')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Slot cleared.
    expect(result.state.equipmentSlot1).toBeNull();
    // Card NOT in graveyard — salvage rescued it.
    expect(result.state.discardedCards.some(c => c.id === 'w-salv')).toBe(false);
    // Card IS in hand with durability 1 / maxDurability 1 (= 2 - 1 salvage amulet).
    const salvaged = result.state.handCards.find(c => c.id === 'w-salv');
    expect(salvaged).toBeDefined();
    expect((salvaged as any).durability).toBe(1);
    expect((salvaged as any).maxDurability).toBe(1);
    // Discover STILL triggered (per design: card text 「每件装备发现 1 张专属牌」).
    expect(result.state.discoverModalOpen).toBe(true);
    expect(result.state.discoverSourceLabel).toBe('弃装重铸');
  });

  it('SALVAGE: 2 amulets + weapon maxDur 3 → maxDur drops to 1 (3-2)', () => {
    const card = makeCard('salvage-2x');
    const w = makeWeapon('w-2x', { durability: 3, maxDurability: 3 });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: w as any,
      equipmentSlot2: null,
      amuletSlots: [makeSalvageAmulet('a'), makeSalvageAmulet('b')] as any,
      classDeck: [makeClassCard('c1')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const salvaged = result.state.handCards.find(c => c.id === 'w-2x');
    expect(salvaged).toBeDefined();
    expect((salvaged as any).durability).toBe(1);
    expect((salvaged as any).maxDurability).toBe(1);
  });

  it('SALVAGE UNDERFLOW: maxDur 1 + 1 amulet → newMaxDur=0 → REMOVED entirely (not in hand, not in graveyard)', () => {
    const card = makeCard('salvage-underflow');
    const w = makeWeapon('w-uf', { durability: 1, maxDurability: 1 });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: w as any,
      equipmentSlot2: null,
      amuletSlots: [makeSalvageAmulet()] as any,
      classDeck: [makeClassCard('c1')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Slot cleared.
    expect(result.state.equipmentSlot1).toBeNull();
    // Card removed entirely — neither in hand nor graveyard.
    expect(result.state.handCards.some(c => c.id === 'w-uf')).toBe(false);
    expect(result.state.discardedCards.some(c => c.id === 'w-uf')).toBe(false);
    // Discover STILL fires.
    expect(result.state.discoverModalOpen).toBe(true);
  });

  it('SALVAGE: monster equipment IS salvageable (parity with weapon/shield)', () => {
    // 历史：早期 discard-rebuild 的 salvage 分支只收 weapon|shield，怪物装备会
    // 直接进坟场（这里曾断言 `discardedCards.some(... 'mon-no-salv') === true`）。
    // 现已对齐 `computeEquipmentBreakEffects` / `reduceDisposeEquipmentCard`：
    // 怪物装备也按 maxDur-N 回手牌，并累加 salvageReduction 持久化 cap 减少。
    // 详见 `equipment-salvage-monster.test.ts` 的 6. discard-rebuild + monster 块。
    const card = makeCard('salvage-mon');
    const monsterEquip: GameCardData = {
      id: 'mon-no-salv',
      type: 'monster',
      name: 'Goblin-Equip',
      value: 3,
      image: '',
      hp: 5,
      maxHp: 5,
      attack: 3,
      durability: 2,
      maxDurability: 2,
      fury: 2,
      hpLayers: 2,
      currentLayer: 1,
    } as GameCardData;
    const state = makeState({
      handCards: [card],
      equipmentSlot1: monsterEquip as any,
      equipmentSlot2: null,
      amuletSlots: [makeSalvageAmulet()] as any,
      classDeck: [makeClassCard('c1')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Slot cleared.
    expect(result.state.equipmentSlot1).toBeNull();
    // Did NOT enter graveyard — salvage rescued it.
    expect(result.state.discardedCards.some(c => c.id === 'mon-no-salv')).toBe(false);
    // IS in hand with reduced cap and salvageReduction tracked.
    const salvaged = result.state.handCards.find(c => c.id === 'mon-no-salv');
    expect(salvaged).toBeDefined();
    expect((salvaged as any).type).toBe('monster');
    expect((salvaged as any).maxDurability).toBe(1);
    expect((salvaged as any).durability).toBe(1);
    expect((salvaged as any).salvageReduction).toBe(1);
    // Discover STILL fires (per design: 「每件装备发现 1 张专属牌」).
    expect(result.state.discoverModalOpen).toBe(true);
  });

  it('SALVAGE + Perm equipment: salvage SKIPPED, Perm routes to recycle bag (Perm priority)', () => {
    const card = makeCard('salvage-perm');
    // Perm-flagged weapon (recycleDelay > 0 simulates 永恒铭刻 effect).
    const permWeapon = makeWeapon('w-perm', {
      durability: 1,
      maxDurability: 1,
      recycleDelay: 2,
    });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: permWeapon as any,
      equipmentSlot2: null,
      amuletSlots: [makeSalvageAmulet()] as any,
      classDeck: [makeClassCard('c1')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Slot cleared.
    expect(result.state.equipmentSlot1).toBeNull();
    // Perm-priority: card went to recycle bag, NOT consumed by salvage.
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'w-perm')).toBe(true);
    // NOT in hand (salvage skipped) and NOT in graveyard (Perm routing).
    expect(result.state.handCards.some(c => c.id === 'w-perm')).toBe(false);
    expect(result.state.discardedCards.some(c => c.id === 'w-perm')).toBe(false);
  });

  it('SALVAGE STACK: main + 2 reserve all weapons + 1 salvage amulet → all 3 returned to hand independently', () => {
    const card = makeCard('salvage-stack');
    const main = makeWeapon('w-sm', { durability: 2, maxDurability: 2 });
    const r1 = makeWeapon('w-sr1', { durability: 2, maxDurability: 2 });
    const r2 = makeWeapon('w-sr2', { durability: 2, maxDurability: 2 });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: main as any,
      equipmentSlot1Reserve: [r1, r2] as any,
      equipmentSlot2: null,
      amuletSlots: [makeSalvageAmulet()] as any,
      classDeck: Array.from({ length: 5 }, (_, i) => makeClassCard(`c${i}`)),
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Slot fully cleared.
    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.equipmentSlot1Reserve).toHaveLength(0);
    // All 3 pieces independently salvaged — none in graveyard, all in hand with maxDur 1.
    expect(result.state.discardedCards.some(c => ['w-sm', 'w-sr1', 'w-sr2'].includes(c.id))).toBe(false);
    for (const id of ['w-sm', 'w-sr1', 'w-sr2']) {
      const salvaged = result.state.handCards.find(c => c.id === id);
      expect(salvaged, `${id} should be in hand`).toBeDefined();
      expect((salvaged as any).durability).toBe(1);
      expect((salvaged as any).maxDurability).toBe(1);
    }
    // 3 acted-on pieces → 3 discovers (1 fires + 2 queued).
    expect(result.state.discoverModalOpen).toBe(true);
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(2);
  });

  it('SALVAGE + revive: revived piece stays in slot, separate destroyed piece gets salvaged', () => {
    const card = makeCard('salvage-mix');
    const w = makeWeapon('w-rev-here', { hasEquipmentRevive: true, durability: 0 });
    const s = makeShield('s-salv-here', { durability: 2, maxDurability: 2 });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: w as any,
      equipmentSlot2: s as any,
      amuletSlots: [makeSalvageAmulet()] as any,
      classDeck: [makeClassCard('c1'), makeClassCard('c2'), makeClassCard('c3')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Slot 1: revived in place at 1 dur.
    expect((result.state.equipmentSlot1 as any)?.id).toBe('w-rev-here');
    expect((result.state.equipmentSlot1 as any)?.durability).toBe(1);
    // Slot 2: destroyed AND salvaged → not in slot, in hand at maxDur 1.
    expect(result.state.equipmentSlot2).toBeNull();
    const salvaged = result.state.handCards.find(c => c.id === 's-salv-here');
    expect(salvaged).toBeDefined();
    expect((salvaged as any).maxDurability).toBe(1);
    expect(result.state.discardedCards.some(c => c.id === 's-salv-here')).toBe(false);
    // 2 acted-on pieces → 2 discovers (1 fires + 1 queued).
    expect(result.state.discoverModalOpen).toBe(true);
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // 引雷阵锋 (mineDamageBoostPerDur > 0) — destroyed weapon's remaining
  // durability accumulates into globalMineDamageBonus. Mirrors standard
  // `computeEquipmentBreakEffects` mine-boost behavior.
  // -------------------------------------------------------------------------

  it('MINE BOOST: weapon with mineDamageBoostPerDur=2, durability=2 destroyed → globalMineDamageBonus +=4', () => {
    const card = makeCard('mine-1');
    const blade = makeWeapon('w-blade', {
      durability: 2,
      maxDurability: 2,
      mineDamageBoostPerDur: 2,
    });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: blade as any,
      equipmentSlot2: null,
      classDeck: [makeClassCard('c1')],
      globalMineDamageBonus: 5, // pre-existing bonus
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // 5 (existing) + 2 dur × 2 boost = 9.
    expect(result.state.globalMineDamageBonus).toBe(9);
    expect(result.state.discardedCards.some(c => c.id === 'w-blade')).toBe(true);
  });

  it('MINE BOOST + SALVAGE: bonus accumulates BEFORE salvage rescues card (full original dur counted)', () => {
    const card = makeCard('mine-salv');
    const blade = makeWeapon('w-blade-salv', {
      durability: 2,
      maxDurability: 3,
      mineDamageBoostPerDur: 2,
    });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: blade as any,
      equipmentSlot2: null,
      amuletSlots: [makeSalvageAmulet()] as any,
      classDeck: [makeClassCard('c1')],
      globalMineDamageBonus: 0,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // 0 + 2 dur × 2 boost = 4. Mine boost runs even when salvage rescues.
    expect(result.state.globalMineDamageBonus).toBe(4);
    // Salvaged to hand with maxDur 2 (3 - 1 salvage amulet), durability 1.
    const salvaged = result.state.handCards.find(c => c.id === 'w-blade-salv');
    expect(salvaged).toBeDefined();
    expect((salvaged as any).maxDurability).toBe(2);
    expect((salvaged as any).durability).toBe(1);
  });

  it('MINE BOOST + REVIVE: revived equipment does NOT trigger mine boost (no durability consumed)', () => {
    const card = makeCard('mine-rev');
    const blade = makeWeapon('w-blade-rev', {
      durability: 0,
      maxDurability: 2,
      mineDamageBoostPerDur: 3,
      hasEquipmentRevive: true,
    });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: blade as any,
      equipmentSlot2: null,
      classDeck: [makeClassCard('c1')],
      globalMineDamageBonus: 10,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Equipment revived (NOT destroyed) → mine boost does NOT trigger.
    expect(result.state.globalMineDamageBonus).toBe(10);
    expect(result.state.equipmentSlot1).not.toBeNull();
    expect((result.state.equipmentSlot1 as any).equipmentReviveUsed).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 招灵书印 (delete-draw) interaction — salvaged equipment is NOT counted
  // as "destroyed" because the card was rescued, not removed. Matches the
  // standard `computeEquipmentBreakEffects` semantics.
  // -------------------------------------------------------------------------

  it('SALVAGE excludes 招灵书印 trigger (salvaged piece NOT counted as destroyed)', () => {
    const card = makeCard('salvage-no-deletedraw');
    const w = makeWeapon('w-no-dd', { durability: 2, maxDurability: 2 });
    const deleteDrawAmulet: GameCardData = {
      id: 'a-delete-draw',
      type: 'amulet',
      name: '招灵书印',
      value: 0,
      image: '',
      amuletEffect: 'delete-draw',
    } as GameCardData;
    const state = makeState({
      handCards: [card],
      equipmentSlot1: w as any,
      equipmentSlot2: null,
      amuletSlots: [makeSalvageAmulet(), deleteDrawAmulet] as any,
      classDeck: [makeClassCard('c1')],
      backpackItems: [
        makeWeapon('bp-1'),
        makeWeapon('bp-2'),
        makeWeapon('bp-3'),
        makeWeapon('bp-4'),
      ] as any,
    });
    const handBefore = state.handCards.length;

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Salvage rescued the weapon → no destruction → 招灵书印 does NOT fire.
    // After: -1 (弃装重铸 leaves hand) + 1 (salvaged weapon) = handBefore.
    expect(result.state.handCards.length).toBe(handBefore);
    expect(result.state.handCards.some(c => c.id === 'w-no-dd')).toBe(true);
  });
});
