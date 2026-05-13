/**
 * Regression: equipment displaced from a slot + 残骸回收符 (equipment-salvage)
 * equipped → both effects must apply. The salvage path in
 * `reduceDisposeEquipmentCard` (cards.ts) historically wrote
 *
 *   patch.handCards = [...state.handCards, salvaged]
 *
 * which clobbered any prior `patch.handCards` written by the upstream
 * `computeEquipmentDisplacementLastWords` step (line 1835). That made
 * three classes of equipment lastWords silently lose their hand-bound
 * cards whenever the player had 残骸回收符 equipped during a
 * displacement event:
 *
 *   1. `onDestroyEffect: 'graveyard-event-to-hand'`   — 生长之盾 (1 / 3 events)
 *   2. `onDestroyEffect: 'graveyard-to-hand'`         — Iron Shield (1 random card)
 *   3. `lastWordsGainBolt > 0`                        — 奥能裂变-affected equipment (魔弹)
 *
 * User-visible symptom (生长之盾 case): "shield 回到了手上，却没有触发遗言"
 * — the shield correctly returned to hand via salvage, but the picked
 * Event from grave neither landed in hand nor stayed in grave (vanished).
 *
 * Same overwrite-bug pattern as documented in
 * `equipment-effects.ts:computeEquipmentBreakEffects` lines 909-913,
 * which was previously fixed by reading `patch.handCards ?? state.handCards`.
 * Same fix applied to `cards.ts:1876` here. See also `magic-effects.ts:4103`
 * (discard-rebuild salvage) which already uses the correct pattern.
 *
 * Per `pipeline-input-continuation.mdc`: tests use `phase: 'playerInput'`
 * (the real in-game state) so the disposition router gating fires.
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

function makeSalvageAmulet(idSuffix = '1'): AmuletItem {
  return {
    id: `a-salv-${idSuffix}`,
    type: 'amulet',
    name: '残骸回收符',
    value: 0,
    image: '',
    amuletEffect: 'equipment-salvage',
  } as unknown as AmuletItem;
}

describe('DISPOSE_EQUIPMENT_CARD + 残骸回收符 — lastWords hand additions preserved', () => {
  it('生长之盾 displaced: shield salvaged AND grave Event lands in hand', () => {
    const growthShield: GameCardData = {
      id: 'gs-1',
      type: 'shield',
      name: '生长之盾',
      value: 2,
      image: '',
      durability: 3,
      maxDurability: 3,
      armorMax: 2,
      onDestroyEffect: 'graveyard-event-to-hand',
      onDestroyEventCount: 1,
    } as GameCardData;
    const grave: GameCardData = {
      id: 'ev-1',
      type: 'event',
      name: 'Test Event',
      value: 0,
      image: '',
    } as GameCardData;

    const state = makeState({
      equipmentSlot1: growthShield as EquipmentItem,
      amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
      handCards: [],
      discardedCards: [grave],
    });

    const r = reduce(state, {
      type: 'DISPOSE_EQUIPMENT_CARD',
      card: growthShield,
      isDestruction: true,
      triggerLastWords: true,
      fromSlotId: 'equipmentSlot1',
    });
    const final = drain(r.state, r.enqueuedActions ?? []).state;

    // Salvage applied — shield in hand with maxDur reduced.
    const salvaged = final.handCards.find(c => c.id === 'gs-1');
    expect(salvaged).toBeDefined();
    expect(salvaged?.maxDurability).toBe(2);
    expect(salvaged?.durability).toBe(1);

    // lastWords applied — Event picked from grave is in hand.
    expect(final.handCards.find(c => c.id === 'ev-1')).toBeDefined();

    // Event removed from graveyard.
    expect(final.discardedCards.find(c => c.id === 'ev-1')).toBeUndefined();
  });

  it('生长之盾 L2 displaced: salvaged + 3 events landed in hand (full grave)', () => {
    // L2 picks 3 events. All 3 must land in hand alongside the salvaged shield.
    const growthShieldL2: GameCardData = {
      id: 'gs-2',
      type: 'shield',
      name: '生长之盾',
      value: 2,
      image: '',
      durability: 3,
      maxDurability: 3,
      armorMax: 2,
      onDestroyEffect: 'graveyard-event-to-hand',
      onDestroyEventCount: 3,
    } as GameCardData;
    const ev1: GameCardData = { id: 'e1', type: 'event', name: 'Ev1', value: 0, image: '' } as GameCardData;
    const ev2: GameCardData = { id: 'e2', type: 'event', name: 'Ev2', value: 0, image: '' } as GameCardData;
    const ev3: GameCardData = { id: 'e3', type: 'event', name: 'Ev3', value: 0, image: '' } as GameCardData;

    const state = makeState({
      equipmentSlot1: growthShieldL2 as EquipmentItem,
      amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
      handCards: [],
      discardedCards: [ev1, ev2, ev3],
    });

    const r = reduce(state, {
      type: 'DISPOSE_EQUIPMENT_CARD',
      card: growthShieldL2,
      isDestruction: true,
      triggerLastWords: true,
      fromSlotId: 'equipmentSlot1',
    });
    const final = drain(r.state, r.enqueuedActions ?? []).state;

    expect(final.handCards.find(c => c.id === 'gs-2')).toBeDefined();
    expect(final.handCards.find(c => c.id === 'e1')).toBeDefined();
    expect(final.handCards.find(c => c.id === 'e2')).toBeDefined();
    expect(final.handCards.find(c => c.id === 'e3')).toBeDefined();
    // grave drained
    expect(final.discardedCards.find(c => c.type === 'event')).toBeUndefined();
  });

  it('Iron Shield (graveyard-to-hand) displaced: shield salvaged AND grave card in hand', () => {
    const ironShield: GameCardData = {
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
    const pickable: GameCardData = {
      id: 'spell-1',
      type: 'magic',
      name: 'Some Spell',
      value: 0,
      image: '',
    } as GameCardData;

    const state = makeState({
      equipmentSlot1: ironShield as EquipmentItem,
      amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
      handCards: [],
      discardedCards: [pickable],
    });

    const r = reduce(state, {
      type: 'DISPOSE_EQUIPMENT_CARD',
      card: ironShield,
      isDestruction: true,
      triggerLastWords: true,
      fromSlotId: 'equipmentSlot1',
    });
    const final = drain(r.state, r.enqueuedActions ?? []).state;

    // Salvage applied — shield in hand.
    expect(final.handCards.find(c => c.id === 'iron-1')).toBeDefined();
    expect(final.handCards.find(c => c.id === 'iron-1')?.maxDurability).toBe(2);
    // lastWords applied — picked card from grave in hand.
    expect(final.handCards.find(c => c.id === 'spell-1')).toBeDefined();
    // Picked card removed from grave.
    expect(final.discardedCards.find(c => c.id === 'spell-1')).toBeUndefined();
  });

  it('lastWordsGainBolt displaced: shield salvaged AND 魔弹 cards land in hand', () => {
    // 奥能裂变 outcome 1 stamps `lastWordsGainBolt: N` on equipment.
    // On destruction, applyGainMagicBolts adds N 魔弹 to hand (with overflow
    // routing to backpack/recycle bag). With 残骸回收符, both effects must apply.
    const enchantedBlade: GameCardData = {
      id: 'w-bolt',
      type: 'weapon',
      name: '奥能淬炼武器',
      value: 3,
      image: '',
      durability: 2,
      maxDurability: 2,
      lastWordsGainBolt: 2,
    } as GameCardData;

    const state = makeState({
      equipmentSlot1: enchantedBlade as EquipmentItem,
      amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
      handCards: [],
    });

    const r = reduce(state, {
      type: 'DISPOSE_EQUIPMENT_CARD',
      card: enchantedBlade,
      isDestruction: true,
      triggerLastWords: true,
      fromSlotId: 'equipmentSlot1',
    });
    const final = drain(r.state, r.enqueuedActions ?? []).state;

    // Salvage applied — weapon in hand.
    const salvaged = final.handCards.find(c => c.id === 'w-bolt');
    expect(salvaged).toBeDefined();
    expect(salvaged?.maxDurability).toBe(1);

    // lastWords applied — 2 魔弹 added to hand alongside the salvaged weapon.
    const bolts = final.handCards.filter(c => c.name?.includes('魔弹') || c.id?.includes('bolt'));
    // At least 2 entries beyond the salvaged blade (whose name does not contain 魔弹).
    const handMissiles = final.handCards.filter(c => c.id !== 'w-bolt');
    expect(handMissiles.length).toBe(2);
    void bolts; // alternate detection variant for documentation
  });
});
