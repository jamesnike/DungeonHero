/**
 * REPRO: 生长之盾 displaced from slot + 残骸回收符 equipped → user reports
 * "生长之盾 回到手牌但没触发遗言（坟场 Event 没进手牌）".
 *
 * Hypothesis: cards.ts:1876 `patch.handCards = [...state.handCards, salvaged]`
 * overwrites prior patch.handCards written by computeEquipmentDisplacementLastWords
 * (which adds the picked Event). Same overwrite-bug pattern as
 * equipment-effects.ts comment lines 909-913.
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

describe('REPRO: 生长之盾 displaced + 残骸回收符', () => {
  it('lastWords picked event reaches hand AND shield returns to hand (both must apply)', () => {
    const growthShield: GameCardData = {
      id: 'gs-1', type: 'shield', name: '生长之盾', value: 2, image: '',
      durability: 3, maxDurability: 3, armorMax: 2,
      onDestroyEffect: 'graveyard-event-to-hand',
      onDestroyEventCount: 1,
    } as GameCardData;
    const ev: GameCardData = { id: 'ev-1', type: 'event', name: 'Test Event', value: 0, image: '' } as GameCardData;
    const salvageAmulet = {
      id: 'a-salv', type: 'amulet', name: '残骸回收符', value: 0, image: '',
      amuletEffect: 'equipment-salvage',
    } as unknown as AmuletItem;
    const replacement: GameCardData = {
      id: 'shield-2', type: 'shield', name: 'New Shield', value: 1, image: '',
      durability: 2, maxDurability: 2, armorMax: 1,
    } as GameCardData;

    const state = makeState({
      equipmentSlot1: growthShield as EquipmentItem,
      equipmentSlot2: null,
      amuletSlots: [salvageAmulet, null, null, null, null] as any,
      handCards: [replacement] as any,
      discardedCards: [ev],
    });

    // Player plays the new shield on the same slot as growth shield → displacement
    const r = reduce(state, { type: 'PLAY_CARD', cardId: 'shield-2', target: { slotId: 'equipmentSlot1' } as any } as any);
    const final = drain(r.state, r.enqueuedActions ?? []).state;

    console.log('Final hand:', final.handCards.map(c => c.name));
    console.log('Final slot1:', (final.equipmentSlot1 as any)?.name);
    console.log('Final grave:', final.discardedCards.map(c => c.name));

    // 生长之盾 returned to hand via salvage (maxDur reduced by 1)
    const salvagedShield = final.handCards.find(c => c.id === 'gs-1');
    expect(salvagedShield).toBeDefined();
    expect(salvagedShield?.maxDurability).toBe(2);

    // Event from grave should ALSO be in hand (lastWords graveyard-event-to-hand)
    const eventInHand = final.handCards.find(c => c.id === 'ev-1');
    expect(eventInHand).toBeDefined();

    // Event removed from graveyard
    expect(final.discardedCards.find(c => c.id === 'ev-1')).toBeUndefined();
  });
});
