/**
 * 镜影摹形 (knight:mirror-copy) — `nonCopyable` flag enforcement.
 *
 * Cards marked `nonCopyable: true` (回收灵焰 / 专属感召 / 影摹召引符 /
 * 洗册归川) MUST NOT be selectable as mirror-copy targets. Bypass would
 * cause infinite snowball:
 *   - copying 影摹召引符 → 2 amulets stack the streak ×2 per draw, so every
 *     6 draws spawns a new 镜影摹形 → can be re-played to copy the amulet
 *     again, etc.
 *   - copying 专属感召 → another class-deck discover → bottomless class card
 *     supply.
 *   - copying 回收灵焰 / 洗册归川 → duplicate recycle-bag thrash that locks
 *     the recycle pipeline into oscillation.
 *
 * Coverage:
 *   1. `mirror-copy` resolver fizzles when ALL targets are nonCopyable
 *      (empty-target check considers only copyable cards).
 *   2. `mirror-copy` resolver still opens modal when at least 1 copyable
 *      card exists alongside nonCopyable ones (modal will filter the rest).
 *   3. `RESOLVE_MIRROR_COPY` reducer (defense-in-depth) refuses to clone a
 *      nonCopyable card even if a caller bypasses the modal filter.
 *
 * Related:
 *   - `non-copyable-deck-snapshot.test.ts` (data contract)
 *   - `MirrorCopyModal.tsx` (UI filter)
 *   - `mirror-copy-clone-id.test.ts` (positive path: copyable cards work)
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { AmuletItem, EquipmentItem } from '@/components/game-board/types';
import { createStarterDiscoverClassToHandCard } from '../deck';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

function makeMirrorCopyCard(id = 'mirror-copy-1'): GameCardData {
  return {
    id,
    type: 'magic',
    name: '镜影摹形',
    value: 0,
    image: '',
    magicType: 'instant',
    classCard: true,
    knightEffect: 'mirror-copy',
  } as GameCardData;
}

function makePlainHandMagic(id = 'plain-magic-1'): GameCardData {
  return {
    id,
    type: 'magic',
    name: 'Plain Magic',
    value: 0,
    image: '',
    magicType: 'instant',
  } as GameCardData;
}

function makeMirrorCopySummonAmulet(id = 'mcs-1'): AmuletItem {
  return {
    id,
    type: 'amulet',
    name: '影摹召引符',
    value: 1,
    image: '',
    classCard: true,
    unique: true,
    nonCopyable: true,
    amuletEffect: 'mirror-copy-summon',
  } as AmuletItem;
}

function makeRecycleFlareCard(id = 'recycle-flare-1'): GameCardData {
  return {
    id,
    type: 'magic',
    name: '回收灵焰',
    value: 0,
    image: '',
    classCard: true,
    unique: true,
    nonCopyable: true,
    magicType: 'permanent',
    knightEffect: 'recycle-flare',
  } as GameCardData;
}

function makeRecycleTideCard(id = 'recycle-tide-1'): GameCardData {
  return {
    id,
    type: 'magic',
    name: '洗册归川',
    value: 0,
    image: '',
    classCard: true,
    unique: true,
    nonCopyable: true,
    magicType: 'permanent',
    knightEffect: 'recycle-tide',
    recycleDelay: 1,
  } as GameCardData;
}

function makePlainSword(id = 'sword-1'): EquipmentItem {
  return {
    id,
    type: 'weapon',
    name: 'Plain Sword',
    value: 3,
    image: '',
    durability: 2,
    maxDurability: 2,
  } as EquipmentItem;
}

describe('mirror-copy resolver — empty-target check excludes nonCopyable cards', () => {
  it('fizzles when ALL hand cards are nonCopyable (only 专属感召 + 影摹召引符 + 洗册归川)', () => {
    const mirrorCard = makeMirrorCopyCard();
    const ganzhao = createStarterDiscoverClassToHandCard();
    const tide = makeRecycleTideCard();
    const flare = makeRecycleFlareCard();
    const state = makeState({
      handCards: [mirrorCard, ganzhao, tide, flare],
      equipmentSlot1: null,
      equipmentSlot2: null,
      amuletSlots: [],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: mirrorCard.id } as GameAction]);

    // No modal opened, no pending action — directly finalized with fizzle banner.
    expect(result.state.mirrorCopyModal).toBeFalsy();
    expect(result.state.pendingMagicAction).toBeFalsy();
    // 镜影摹形 itself was consumed (left hand) regardless of fizzle.
    expect(result.state.handCards.find(c => c.id === mirrorCard.id)).toBeUndefined();
    // Banner mentions "没有可复制的目标".
    const banners = result.sideEffects.filter(e => e.event === 'ui:banner');
    const fizzleBanner = banners.find(e =>
      String((e.payload as any)?.text ?? '').includes('没有可复制的目标'),
    );
    expect(fizzleBanner).toBeDefined();
  });

  it('fizzles when only nonCopyable amulets are equipped and hand is empty', () => {
    const mirrorCard = makeMirrorCopyCard();
    const amulet = makeMirrorCopySummonAmulet();
    const state = makeState({
      handCards: [mirrorCard],
      amuletSlots: [amulet] as AmuletItem[],
      equipmentSlot1: null,
      equipmentSlot2: null,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: mirrorCard.id } as GameAction]);

    expect(result.state.mirrorCopyModal).toBeFalsy();
    expect(result.state.pendingMagicAction).toBeFalsy();
  });

  it('opens modal-prompt when at least 1 copyable card exists alongside nonCopyable cards', () => {
    const mirrorCard = makeMirrorCopyCard();
    const flare = makeRecycleFlareCard();
    const plain = makePlainHandMagic('plain-1');
    const state = makeState({
      handCards: [mirrorCard, flare, plain],
      amuletSlots: [],
      equipmentSlot1: null,
      equipmentSlot2: null,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: mirrorCard.id } as GameAction]);

    // The reducer sets pendingMagicAction + emits `card:mirrorCopyRequested`
    // side effect; the hook layer is what later opens the actual modal.
    // Assert the reducer-level outcome, not the hook-driven modal state.
    expect((result.state.pendingMagicAction as any)?.effect).toBe('mirror-copy');
    const requestEvents = result.sideEffects.filter(e => e.event === 'card:mirrorCopyRequested');
    expect(requestEvents.length).toBe(1);
  });

  it('opens modal-prompt when only equipment is copyable (hand all nonCopyable, no amulets)', () => {
    const mirrorCard = makeMirrorCopyCard();
    const ganzhao = createStarterDiscoverClassToHandCard();
    const sword = makePlainSword();
    const state = makeState({
      handCards: [mirrorCard, ganzhao],
      equipmentSlot1: sword as EquipmentItem,
      equipmentSlot2: null,
      amuletSlots: [],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: mirrorCard.id } as GameAction]);

    expect((result.state.pendingMagicAction as any)?.effect).toBe('mirror-copy');
    const requestEvents = result.sideEffects.filter(e => e.event === 'card:mirrorCopyRequested');
    expect(requestEvents.length).toBe(1);
  });
});

describe('RESOLVE_MIRROR_COPY reducer — defense-in-depth nonCopyable rejection', () => {
  it('refuses to clone a nonCopyable hand card even if dispatched directly (bypassing modal)', () => {
    const mirrorCard = makeMirrorCopyCard();
    const ganzhao = createStarterDiscoverClassToHandCard();
    const handBefore = [ganzhao];
    const state = makeState({
      handCards: handBefore,
      pendingMagicAction: { card: mirrorCard, effect: 'mirror-copy', step: 'modal-select' } as any,
      mirrorCopyModal: { sourceCardId: mirrorCard.id },
    });

    const result = reduce(state, {
      type: 'RESOLVE_MIRROR_COPY',
      selection: { kind: 'hand', cardId: ganzhao.id },
    });

    // Modal cleared either way (caller intent satisfied).
    expect(result.state.mirrorCopyModal).toBeNull();
    // No clone added — hand still only contains the original 专属感召.
    const ganzhaoCount = result.state.handCards.filter(c => c.name === '专属感召').length;
    expect(ganzhaoCount).toBe(1);
    expect(result.state.handCards.find(c => c.id === ganzhao.id)).toBeDefined();
  });

  it('refuses to clone a nonCopyable amulet (影摹召引符)', () => {
    const mirrorCard = makeMirrorCopyCard();
    const amulet = makeMirrorCopySummonAmulet('mcs-target');
    const state = makeState({
      amuletSlots: [amulet] as AmuletItem[],
      handCards: [],
      pendingMagicAction: { card: mirrorCard, effect: 'mirror-copy', step: 'modal-select' } as any,
      mirrorCopyModal: { sourceCardId: mirrorCard.id },
    });

    const result = reduce(state, {
      type: 'RESOLVE_MIRROR_COPY',
      selection: { kind: 'amulet', index: 0 },
    });

    expect(result.state.mirrorCopyModal).toBeNull();
    // No clone added to hand.
    const mirrorAmuletInHand = result.state.handCards.filter(c => c.name === '影摹召引符');
    expect(mirrorAmuletInHand).toHaveLength(0);
    // Original amulet still in slot.
    expect(result.state.amuletSlots).toHaveLength(1);
  });

  it('still successfully clones a copyable card when target is NOT nonCopyable', () => {
    const mirrorCard = makeMirrorCopyCard();
    const plain = makePlainHandMagic('clone-target');
    const state = makeState({
      handCards: [plain],
      pendingMagicAction: { card: mirrorCard, effect: 'mirror-copy', step: 'modal-select' } as any,
      mirrorCopyModal: { sourceCardId: mirrorCard.id },
    });

    const result = reduce(state, {
      type: 'RESOLVE_MIRROR_COPY',
      selection: { kind: 'hand', cardId: plain.id },
    });

    // Clone added — hand has original + clone.
    const plainClones = result.state.handCards.filter(c => c.name === 'Plain Magic');
    expect(plainClones).toHaveLength(2);
  });
});
