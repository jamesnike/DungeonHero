/**
 * 盾影双噬 (knight:armor-double-strike) — Perm 1 magic.
 *
 * On play:
 *   - 0 shields/monster-equips equipped → cancel, no damage, no durability change.
 *   - 1 shield/monster-equip equipped   → auto-pick that slot, deal damage, -1 durability.
 *   - 2 shields/monster-equips equipped → open slot-select pendingMagicAction.
 *
 * On RESOLVE_MAGIC_SLOT_SELECTION (after slot-select):
 *   - Slot's full armor value × armorPct% = perTargetDamage (spell damage).
 *   - EVERY monster in the active row receives one hit (no random subset).
 *   - Selected slot loses 1 durability; if it would hit 0, the standard
 *     equipment break flow runs (last-words / revive / salvage).
 *
 * Upgrade level: 0 → 50%, 1 → 75%, 2 → 100%.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
// Importing this barrel registers all card definitions including
// `knight:armor-double-strike`.
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeCard(idSuffix = 'ads', upgradeLevel?: number) {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic' as const,
    name: '盾影双噬',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent' as const,
    magicEffect: '护甲值 50% 伤害随机两怪，盾耐久 -1。',
    description: 'test',
    knightEffect: 'armor-double-strike',
    recycleDelay: 1,
    ...(upgradeLevel !== undefined ? { upgradeLevel } : {}),
  };
}

function makeShield(overrides: Record<string, unknown> = {}): EquipmentItem {
  return {
    id: 's1',
    type: 'shield' as const,
    name: 'Test Shield',
    value: 4,
    armorMax: 4,
    durability: 3,
    maxDurability: 3,
    ...overrides,
  } as EquipmentItem;
}

function makeMonster(id: string, hp: number) {
  return {
    id,
    type: 'monster' as const,
    name: `M${id}`,
    value: hp,
    hp,
    maxHp: hp,
    attack: 0,
  };
}

function activeRowOf(...monsters: ReturnType<typeof makeMonster>[]): ActiveRowSlots {
  const row: (ReturnType<typeof makeMonster> | null)[] = [null, null, null, null, null];
  for (let i = 0; i < monsters.length && i < 5; i++) row[i] = monsters[i];
  return row as unknown as ActiveRowSlots;
}

describe('盾影双噬 (armor-double-strike) initial dispatch', () => {
  it('with 0 shields equipped: cancels, no pendingMagicAction, no damage', () => {
    const card = makeCard('zero');
    const monster = makeMonster('m1', 50);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: null,
      equipmentSlot2: null,
      activeCards: activeRowOf(monster),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).toBeNull();
    const m = result.state.activeCards.find(c => c?.id === 'm1');
    expect(m?.hp).toBe(50);
  });

  it('with 1 shield equipped: auto-picks and resolves immediately', () => {
    const card = makeCard('one');
    const shield = makeShield({ value: 4, armorMax: 4 });
    const monster = makeMonster('m1', 50);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: shield,
      equipmentSlot2: null,
      activeCards: activeRowOf(monster),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).toBeNull();
    // Single monster hit once for floor(4 * 0.5) = 2 damage.
    const m = result.state.activeCards.find(c => c?.id === 'm1');
    expect(m?.hp).toBe(48);
    // Shield durability 3 → 2.
    expect(result.state.equipmentSlot1?.durability).toBe(2);
  });

  it('with 2 shields equipped: opens slot-select pendingMagicAction', () => {
    const card = makeCard('two');
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeShield({ id: 's1' }),
      equipmentSlot2: makeShield({ id: 's2' }),
      activeCards: activeRowOf(makeMonster('m1', 20)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('armor-double-strike');
    expect((result.state.pendingMagicAction as any).step).toBe('slot-select');
  });
});

describe('盾影双噬 RESOLVE_MAGIC_SLOT_SELECTION', () => {
  it('hits ALL monsters for floor(armor * 50%) each (no random subset)', () => {
    const card = makeCard('two-hit');
    const shield = makeShield({ id: 's1', value: 6, armorMax: 6, durability: 3 });
    const m1 = makeMonster('m1', 50);
    const m2 = makeMonster('m2', 50);
    const m3 = makeMonster('m3', 50);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: shield,
      equipmentSlot2: makeShield({ id: 's2' }),
      activeCards: activeRowOf(m1, m2, m3),
      pendingMagicAction: {
        card,
        effect: 'armor-double-strike',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'armor-double-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    // ALL three monsters should have lost floor(6 * 0.5) = 3 hp.
    const survivors = result.state.activeCards.filter(c => c?.type === 'monster') as Array<{ id: string; hp: number }>;
    const hits = survivors.filter(s => s.hp === 47);
    const misses = survivors.filter(s => s.hp === 50);
    expect(hits.length).toBe(3);
    expect(misses.length).toBe(0);
    // Shield durability 3 → 2.
    expect(result.state.equipmentSlot1?.durability).toBe(2);
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('with only 1 monster: hits it once, still consumes durability', () => {
    const card = makeCard('one-mon');
    const shield = makeShield({ value: 8, armorMax: 8, durability: 2 });
    const monster = makeMonster('m1', 100);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: shield,
      equipmentSlot2: makeShield({ id: 's2' }),
      activeCards: activeRowOf(monster),
      pendingMagicAction: {
        card,
        effect: 'armor-double-strike',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'armor-double-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    // floor(8 * 0.5) = 4 damage, applied once.
    const m = result.state.activeCards.find(c => c?.id === 'm1');
    expect(m?.hp).toBe(96);
    // Durability 2 → 1.
    expect(result.state.equipmentSlot1?.durability).toBe(1);
  });

  it('with 0 monsters: no damage but durability still drops by 1', () => {
    const card = makeCard('no-mon');
    const shield = makeShield({ value: 4, armorMax: 4, durability: 3 });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: shield,
      equipmentSlot2: makeShield({ id: 's2' }),
      activeCards: [null, null, null, null, null] as unknown as ActiveRowSlots,
      pendingMagicAction: {
        card,
        effect: 'armor-double-strike',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'armor-double-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.equipmentSlot1?.durability).toBe(2);
  });

  it('shield at 1 durability: full break flow runs (slot cleared)', () => {
    const card = makeCard('break');
    const shield = makeShield({ id: 's1', value: 4, armorMax: 4, durability: 1, maxDurability: 3 });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: shield,
      equipmentSlot2: makeShield({ id: 's2' }),
      activeCards: activeRowOf(makeMonster('m1', 50)),
      pendingMagicAction: {
        card,
        effect: 'armor-double-strike',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'armor-double-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.equipmentSlot1).toBeNull();
  });

  it('upgrade level 1: damage uses 75% instead of 50%', () => {
    const card = makeCard('upg', 1);
    const shield = makeShield({ value: 8, armorMax: 8, durability: 2 });
    const monster = makeMonster('m1', 100);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: shield,
      equipmentSlot2: makeShield({ id: 's2' }),
      activeCards: activeRowOf(monster),
      pendingMagicAction: {
        card,
        effect: 'armor-double-strike',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'armor-double-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    // floor(8 * 0.75) = 6 damage, single hit (only 1 monster).
    const m = result.state.activeCards.find(c => c?.id === 'm1');
    expect(m?.hp).toBe(94);
  });
});
