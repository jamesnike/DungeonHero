/**
 * Regression: User-reported bug —
 *   墓园守卫 (Perm) + 残骸回收符 + Iron Shield (graveyard-to-hand) +
 *   wooden shield 顶替 iron shield → only 1 graveyard card lands in hand.
 *
 * Expected: 墓园守卫's `lastWordsExtraTriggerCount` should make
 *   `graveyard-to-hand` fire 2 times (1 base + 1 extra), pulling 2 cards
 *   from the graveyard to the hand. Combined with 残骸回收符's salvage
 *   path, the iron shield itself returns to hand with maxDur -1.
 *
 * Root cause hypothesis: `reduceDisposeEquipmentCard` salvage early-returns
 * call `applyPatch(state, patch, sideEffects)` WITHOUT passing
 * `enqueuedActions` — which drops:
 *
 *   1. `ADD_TO_RECYCLE_BAG` actions queued by `graveyard-to-hand` /
 *      `graveyard-event-to-hand` when hand becomes full mid-loop.
 *   2. `DRAW_CARDS` / `DRAW_CLASS_TO_BACKPACK` actions for `discard-hand-3` /
 *      `skeletonLastWordsDiscard` lastWords on monster-as-equipment cards.
 *   3. `TRIGGER_MONSTER_SKILL_FLOAT` skill float UI events.
 *
 * The salvage path comments at line 1878-1883 explicitly document fixing
 * the patch.handCards clobbering bug — but the parallel issue of dropping
 * enqueuedActions was not addressed.
 *
 * Per `pipeline-input-continuation.mdc`: tests use `phase: 'playerInput'`.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, EquipmentItem, AmuletItem } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as ActiveRowSlots,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    rng: createRng(42),
    phase: 'playerInput' as any,
    ...overrides,
  };
}

function makeSalvageAmulet(): AmuletItem {
  return {
    id: 'a-salv-1',
    type: 'amulet',
    name: '残骸回收符',
    value: 0,
    image: '',
    amuletEffect: 'equipment-salvage',
  } as unknown as AmuletItem;
}

function makeGraveyardGuardianAmulet(perm = false): AmuletItem {
  // Perm: Add `recycleDelay > 0` like 永恒铭刻药 / 附魔祭坛 does.
  // 墓园守卫 should still aggregate `lastWordsExtraTriggerCount` even when Perm.
  const base: any = {
    id: 'a-guard-1',
    type: 'amulet',
    name: '墓园守卫',
    value: 1,
    image: '',
    amuletEffect: 'last-words-extra-trigger',
  };
  if (perm) base.recycleDelay = 2;
  return base as AmuletItem;
}

function makeIronShield(): GameCardData {
  return {
    id: 'iron-1',
    type: 'shield',
    name: 'Iron Shield',
    value: 0,
    image: '',
    durability: 3,
    maxDurability: 3,
    armorMax: 2,
    onDestroyEffect: 'graveyard-to-hand',
  } as GameCardData;
}

describe('Iron Shield + 残骸回收符 + 墓园守卫 (Perm) — full last-words multi-trigger', () => {
  it('2 cards in graveyard, empty hand → BOTH grave cards in hand + salvaged shield (墓园守卫 doubles trigger)', () => {
    const ironShield = makeIronShield();
    const grave1: GameCardData = {
      id: 'spell-A',
      type: 'magic',
      name: 'Spell A',
      value: 0,
      image: '',
    } as GameCardData;
    const grave2: GameCardData = {
      id: 'spell-B',
      type: 'magic',
      name: 'Spell B',
      value: 0,
      image: '',
    } as GameCardData;

    const state = makeState({
      equipmentSlot1: ironShield as EquipmentItem,
      amuletSlots: [
        makeSalvageAmulet(),
        makeGraveyardGuardianAmulet(true), // Perm
        null,
        null,
        null,
      ] as any,
      handCards: [],
      discardedCards: [grave1, grave2],
    });

    const r = reduce(state, {
      type: 'DISPOSE_EQUIPMENT_CARD',
      card: ironShield,
      isDestruction: true,
      triggerLastWords: true,
      fromSlotId: 'equipmentSlot1',
    });
    const final = drain(r.state, r.enqueuedActions ?? []).state;

    // Salvage applied — shield in hand with maxDur -1.
    const salvaged = final.handCards.find(c => c.id === 'iron-1');
    expect(salvaged).toBeDefined();
    expect(salvaged?.maxDurability).toBe(2);

    // 墓园守卫: BOTH grave cards should be in hand (2 triggers).
    expect(final.handCards.find(c => c.id === 'spell-A')).toBeDefined();
    expect(final.handCards.find(c => c.id === 'spell-B')).toBeDefined();

    // Both removed from grave.
    expect(final.discardedCards.find(c => c.id === 'spell-A')).toBeUndefined();
    expect(final.discardedCards.find(c => c.id === 'spell-B')).toBeUndefined();
  });

  it('hand near limit + 2 cards in grave → 1 lands in hand, 2nd routes to recycle bag (NOT vanishes)', () => {
    // This is the real-world scenario: hand has 1 free spot. Iter 1 lands in
    // hand, Iter 2 should route to recycle bag (NOT vanish from existence).
    // Prior bug: salvage early-return drops enqueuedActions → ADD_TO_RECYCLE_BAG
    // for iter 2's pick is silently dropped, the picked card vanishes.
    const ironShield = makeIronShield();
    const grave1: GameCardData = {
      id: 'spell-A',
      type: 'magic',
      name: 'Spell A',
      value: 0,
      image: '',
    } as GameCardData;
    const grave2: GameCardData = {
      id: 'spell-B',
      type: 'magic',
      name: 'Spell B',
      value: 0,
      image: '',
    } as GameCardData;

    // Fill hand to limit-1 (HAND_LIMIT=7 → 6 fillers leaves exactly 1 free
    // spot) so iter 1 can land but iter 2 must overflow to recycle bag.
    const filler = Array.from({ length: 6 }, (_, i): GameCardData => ({
      id: `filler-${i}`,
      type: 'magic',
      name: `Filler ${i}`,
      value: 0,
      image: '',
    } as GameCardData));

    const state = makeState({
      equipmentSlot1: ironShield as EquipmentItem,
      amuletSlots: [
        makeSalvageAmulet(),
        makeGraveyardGuardianAmulet(true),
        null,
        null,
        null,
      ] as any,
      handCards: filler,
      discardedCards: [grave1, grave2],
    });

    const r = reduce(state, {
      type: 'DISPOSE_EQUIPMENT_CARD',
      card: ironShield,
      isDestruction: true,
      triggerLastWords: true,
      fromSlotId: 'equipmentSlot1',
    });
    const final = drain(r.state, r.enqueuedActions ?? []).state;

    // Both grave cards must EXIST somewhere (hand or recycle bag).
    // STRICT: neither may vanish.
    const findCard = (id: string) => ({
      inHand: final.handCards.some(c => c.id === id),
      inRecycle: final.permanentMagicRecycleBag.some(c => c.id === id),
      inGrave: final.discardedCards.some(c => c.id === id),
    });
    const a = findCard('spell-A');
    const b = findCard('spell-B');

    // Both must be accounted for somewhere.
    expect(a.inHand || a.inRecycle || a.inGrave).toBe(true);
    expect(b.inHand || b.inRecycle || b.inGrave).toBe(true);

    // Iter 1's pick lands in hand (since hand had 1 free spot).
    // Iter 2's pick must route to recycle bag (hand is now full).
    // → exactly 1 of {A, B} in hand, the other in recycle bag.
    const inHandCount = (a.inHand ? 1 : 0) + (b.inHand ? 1 : 0);
    const inRecycleCount = (a.inRecycle ? 1 : 0) + (b.inRecycle ? 1 : 0);
    expect(inHandCount).toBe(1);
    expect(inRecycleCount).toBe(1);

    // Neither remains in graveyard (both were picked).
    expect(a.inGrave).toBe(false);
    expect(b.inGrave).toBe(false);

    // Salvaged shield in hand (replacing one of the filler slots since
    // salvage doesn't check hand limit).
    expect(final.handCards.find(c => c.id === 'iron-1')).toBeDefined();
    expect(final.handCards.find(c => c.id === 'iron-1')?.maxDurability).toBe(2);
  });

  it('non-Perm 墓园守卫 + Iron Shield: same multi-trigger behavior', () => {
    // Sanity check: behavior must be identical whether 墓园守卫 is Perm or not
    // (the Perm flag affects routing on recycle/destroy of the AMULET itself,
    // not its `last-words-extra-trigger` aggregation).
    const ironShield = makeIronShield();
    const grave1: GameCardData = {
      id: 'spell-A',
      type: 'magic',
      name: 'Spell A',
      value: 0,
      image: '',
    } as GameCardData;
    const grave2: GameCardData = {
      id: 'spell-B',
      type: 'magic',
      name: 'Spell B',
      value: 0,
      image: '',
    } as GameCardData;

    const state = makeState({
      equipmentSlot1: ironShield as EquipmentItem,
      amuletSlots: [
        makeSalvageAmulet(),
        makeGraveyardGuardianAmulet(false), // non-Perm
        null,
        null,
        null,
      ] as any,
      handCards: [],
      discardedCards: [grave1, grave2],
    });

    const r = reduce(state, {
      type: 'DISPOSE_EQUIPMENT_CARD',
      card: ironShield,
      isDestruction: true,
      triggerLastWords: true,
      fromSlotId: 'equipmentSlot1',
    });
    const final = drain(r.state, r.enqueuedActions ?? []).state;

    expect(final.handCards.find(c => c.id === 'iron-1')).toBeDefined();
    expect(final.handCards.find(c => c.id === 'spell-A')).toBeDefined();
    expect(final.handCards.find(c => c.id === 'spell-B')).toBeDefined();
  });
});
