/**
 * 弃装重铸 (knight:discard-rebuild) — Perm 2 magic.
 *
 * Behavior:
 *   - Destroys all equipment in equipmentSlot1 / equipmentSlot2.
 *   - Equipment with active revive (native monster revive OR
 *     `hasEquipmentRevive` from 复生秘典 / 不朽骨盾) survives at 1 durability
 *     and is NOT counted as destroyed.
 *   - Each genuinely-destroyed piece queues a class-deck discover. The first
 *     discover is dispatched immediately via BEGIN_DISCOVER; the rest sit in
 *     `pendingClassDiscoverQueue` and pop sequentially when the modal closes.
 *   - Last-words such as `onDestroyPermanentShield` still fire because we
 *     route through `computeEquipmentBreakEffects`.
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
    // Second discover queued for after the first modal closes.
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(1);
    expect(result.state.pendingClassDiscoverQueue[0]).toEqual({
      source: 'discard-rebuild',
      sourceLabel: '弃装重铸',
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

  it('revival keeps equipment alive and does NOT count as destroyed', () => {
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

    // Equipment revived at 1 durability instead of being destroyed.
    expect(result.state.equipmentSlot1).not.toBeNull();
    expect((result.state.equipmentSlot1 as any).durability).toBe(1);
    expect((result.state.equipmentSlot1 as any).equipmentReviveUsed).toBe(true);
    // No discover triggered (0 destroyed).
    expect(result.state.discoverModalOpen).toBe(false);
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(0);
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
});
