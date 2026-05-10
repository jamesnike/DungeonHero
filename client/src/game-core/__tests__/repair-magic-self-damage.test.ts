/**
 * Regression: 精工修复 (starter:repairOne) and 战血之印 (magic:honor-blood) must
 * actually deal self-damage when the player has 2+ repairable equipment slots
 * (the most common case — both weapon and shield equipped).
 *
 * Bug history:
 *   `resolveRepairOne` and `resolveHonorBlood` push APPLY_DAMAGE
 *   (selfInflicted) into `enqueuedActions` BEFORE branching on
 *   `repairableSlots.length`. The 0-slot and 1-slot branches both correctly
 *   pass `enqueuedActions` to `applyPatch`, but the 2+-slot interactive
 *   branch was returning `applyPatch(state, patch, sideEffects)` — dropping
 *   the APPLY_DAMAGE action on the floor. Players with 2+ damaged equipment
 *   (~the only realistic time to play these cards) lost no HP.
 *
 *   Fix: pass `enqueuedActions` in the multi-slot branch too.
 *
 *   APPLY_DAMAGE is in `pipeline.ts isInputContinuation` whitelist, so it
 *   drains correctly even though `pendingMagicAction` puts the phase into
 *   `awaitingMagicTarget`.
 *
 * Tests use `phase: 'playerInput'` per `pipeline-input-continuation.mdc` —
 * the default `'idle'` phase bypasses the input-continuation gate and would
 * mask drain-strand bugs that real games hit.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { EquipmentItem } from '@/components/game-board/types';
import { STARTER_CARD_IDS } from '../deck';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

function makeWeapon(overrides: Record<string, unknown> = {}): EquipmentItem {
  return {
    id: 'w1',
    type: 'weapon' as const,
    name: 'Test Sword',
    value: 4,
    durability: 1,
    maxDurability: 3,
    ...overrides,
  } as EquipmentItem;
}

function makeShield(overrides: Record<string, unknown> = {}): EquipmentItem {
  return {
    id: 's1',
    type: 'shield' as const,
    name: 'Test Shield',
    value: 3,
    durability: 1,
    maxDurability: 3,
    ...overrides,
  } as EquipmentItem;
}

// Card ids must match `getStarterBaseId`'s strip pattern (-pick-{N} / -evt-{N} /
// -disc-{N}) so the card-schema registry routes them to `starter:repairOne`.
// Plain suffixes like `-cast` would silently no-op. See
// `event-grant-card-id-suffix.mdc`.
let pickCounter = 100;
function nextPick(): number {
  return pickCounter++;
}

function makeRepairOneCard(upgradeLevel: 0 | 1 | 2 = 0) {
  return {
    id: `${STARTER_CARD_IDS.repairOne}-pick-${nextPick()}`,
    type: 'magic' as const,
    name: '精工修复',
    value: 0,
    image: '',
    magicType: 'permanent' as const,
    recycleDelay: 1,
    upgradeLevel,
  };
}

function makeHonorBloodCard() {
  return {
    id: `honor-blood-pick-${nextPick()}`,
    type: 'magic' as const,
    name: '战血之印',
    value: 0,
    image: '',
    magicType: 'permanent' as const,
    magicEffect: 'honor-blood',
    recycleDelay: 1,
  };
}

describe('精工修复 (starter:repairOne) — self-damage on multi-slot interactive branch', () => {
  it('2 repairable slots → opens slot-select pendingMagicAction AND drains 2 HP', () => {
    const card = makeRepairOneCard();
    const state = makeState({
      handCards: [card],
      hp: 20,
      maxHp: 30,
      equipmentSlot1: makeWeapon({ durability: 1, maxDurability: 3 }),
      equipmentSlot2: makeShield({ durability: 1, maxDurability: 3 }),
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Pending action should be set so player can pick a slot
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('repair-one');
    expect((result.state.pendingMagicAction as any).step).toBe('slot-select');

    // Critical: HP must drop by 2 (the cost of upgrade-level 0 精工修复).
    // Pre-fix this was 20 (no damage applied) because the multi-slot branch
    // returned applyPatch(...) without enqueuedActions.
    expect(result.state.hp).toBe(18);
  });

  it('upgrade level 1 (-1 HP) with 2 repairable slots — drains 1 HP', () => {
    const card = makeRepairOneCard(1);
    const state = makeState({
      handCards: [card],
      hp: 20,
      maxHp: 30,
      equipmentSlot1: makeWeapon({ durability: 1, maxDurability: 3 }),
      equipmentSlot2: makeShield({ durability: 1, maxDurability: 3 }),
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.pendingMagicAction).not.toBeNull();
    expect(result.state.hp).toBe(19);
  });

  it('1 repairable slot — auto-resolve, also drains 2 HP (existing behavior)', () => {
    const card = makeRepairOneCard();
    const state = makeState({
      handCards: [card],
      hp: 20,
      maxHp: 30,
      equipmentSlot1: makeWeapon({ durability: 1, maxDurability: 3 }),
      equipmentSlot2: null,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Auto-resolves (no pending), repairs and drains
    expect(result.state.pendingMagicAction).toBeNull();
    expect(result.state.hp).toBe(18);
    expect((result.state.equipmentSlot1 as EquipmentItem).durability).toBe(2);
  });

  it('0 repairable slots (both at full / no equipment) — still drains HP (existing)', () => {
    const card = makeRepairOneCard();
    const state = makeState({
      handCards: [card],
      hp: 20,
      maxHp: 30,
      equipmentSlot1: null,
      equipmentSlot2: null,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.hp).toBe(18);
  });

  it('after picking the slot in multi-slot branch, durability is repaired (no double-damage)', () => {
    const card = makeRepairOneCard();
    const state = makeState({
      handCards: [card],
      hp: 20,
      maxHp: 30,
      equipmentSlot1: makeWeapon({ durability: 1, maxDurability: 3 }),
      equipmentSlot2: makeShield({ durability: 1, maxDurability: 3 }),
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(afterPlay.state.hp).toBe(18);

    const afterPick = drain(afterPlay.state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'repair-one', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    // Damage should NOT double-apply on slot resolution
    expect(afterPick.state.hp).toBe(18);
    expect((afterPick.state.equipmentSlot1 as EquipmentItem).durability).toBe(2);
    expect(afterPick.state.pendingMagicAction).toBeNull();
  });
});

describe('战血之印 (magic:honor-blood) — self-damage on multi-slot interactive branch', () => {
  it('2 repairable slots → opens slot-select pendingMagicAction AND drains 1 HP', () => {
    const card = makeHonorBloodCard();
    const state = makeState({
      handCards: [card],
      hp: 20,
      maxHp: 30,
      equipmentSlot1: makeWeapon({ durability: 1, maxDurability: 3 }),
      equipmentSlot2: makeShield({ durability: 1, maxDurability: 3 }),
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('repair-one');

    // Same root-cause bug as 精工修复 — verify the multi-slot branch drains HP.
    expect(result.state.hp).toBe(19);
  });

  it('1 repairable slot — auto-resolve, drains 1 HP', () => {
    const card = makeHonorBloodCard();
    const state = makeState({
      handCards: [card],
      hp: 20,
      maxHp: 30,
      equipmentSlot1: makeWeapon({ durability: 1, maxDurability: 3 }),
      equipmentSlot2: null,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.pendingMagicAction).toBeNull();
    expect(result.state.hp).toBe(19);
    expect((result.state.equipmentSlot1 as EquipmentItem).durability).toBe(2);
  });
});
