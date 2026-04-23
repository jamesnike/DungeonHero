/**
 * Regression: Skeleton tier-2+ has lastWords `discard-hand-1` (随机弃 1 张
 * 手牌) plus `hasRevive`. After killing it the discard fires and the
 * skeleton revives — the player should still be able to undo back to the
 * pre-attack state.
 *
 * Old bug: `applyLastWordsToPatch` set `patch.undoCount = 0` after the
 * discard. This left `_undoStack` intact but desynced the UI bookkeeping
 * field, so the undo button (which gates on `gs.undoCount === 0`) showed
 * disabled even though the snapshot was still on the stack.
 *
 * Fix: don't touch `undoCount` from the reducer — the engine's
 * `_syncUndoCountField` keeps it in lockstep with the actual stack
 * length on every push/pop.
 */

import { describe, expect, it } from 'vitest';
import { GameEngine } from '../index';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { GameState } from '../types';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';

function makeSkeleton(id: string): GameCardData {
  return {
    id,
    type: 'monster',
    name: 'Skeleton',
    monsterType: 'Skeleton',
    value: 5,
    attack: 5,
    hp: 1,
    maxHp: 1,
    baseAttack: 5,
    baseHp: 1,
    fury: 1,
    hpLayers: 1,
    currentLayer: 1,
    hasRevive: true,
    skeletonLastWordsDiscard: true,
  } as GameCardData;
}

function makeWeapon(): GameCardData {
  return {
    id: 'test-sword',
    type: 'weapon',
    name: 'Sword',
    value: 0,
    attack: 99,
    durability: 5,
    maxDurability: 5,
  } as GameCardData;
}

function makeHandCard(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: 'Spell',
    value: 0,
  } as GameCardData;
}

describe('Undo after skeleton last-words discard', () => {
  it('keeps undoCount in lockstep with the real stack length', () => {
    const engine = new GameEngine();
    const skeleton = makeSkeleton('sk1');
    const handCard = makeHandCard('h1');

    const initial = createInitialGameState();
    const state: GameState = {
      ...initial,
      activeCards: [skeleton, null, null, null] as (GameCardData | null)[],
      handCards: [handCard],
      equipmentSlot1: makeWeapon() as any,
      equipmentSlot2: null,
      combatState: { ...initialCombatState, currentTurn: 'hero', engagedMonsterIds: [skeleton.id] },
      phase: 'playerInput',
    };
    (engine as any)._state = state;

    expect(engine.getUndoCount()).toBe(0);
    expect(engine.getState().undoCount).toBe(0);

    // Step 1: handleWeaponToMonster pushUndoSnapshot before dispatching.
    engine.pushUndoCheckpoint();
    expect(engine.getUndoStack().length).toBe(1);
    expect(engine.getState().undoCount).toBe(1);

    // Step 2: kill skeleton → triggers `discard-hand-1` last words →
    // skeleton then revives via `hasRevive`. Old bug: this branch wrote
    // `patch.undoCount = 0` so the UI undo button disabled itself.
    engine.dispatch({
      type: 'DEAL_DAMAGE_TO_MONSTER',
      monsterId: skeleton.id,
      damage: 99,
      source: 'weapon',
    } as GameAction);

    const stateAfterKill = engine.getState();
    // Discard fired on the hand card.
    expect(stateAfterKill.handCards.find(c => c.id === 'h1')).toBeUndefined();
    // Skeleton revived (still on board, `reviveUsed` flipped).
    const revived = (stateAfterKill.activeCards as (GameCardData | null)[]).find(c => c?.id === skeleton.id);
    expect(revived).toBeTruthy();
    expect((revived as any).reviveUsed).toBe(true);

    // The real undo stack must still be length 1 — the snapshot pushed
    // before the attack is intact and ready to pop.
    expect(engine.getUndoStack().length).toBe(1);
    // And `state.undoCount` (the UI bookkeeping mirror) must match —
    // otherwise the undo button shows as disabled.
    expect(engine.getState().undoCount).toBe(1);
  });

  it('actually undoes back to the pre-attack state (skeleton alive, hand restored)', () => {
    const engine = new GameEngine();
    const skeleton = makeSkeleton('sk2');
    const handCard = makeHandCard('h2');

    const initial = createInitialGameState();
    const state: GameState = {
      ...initial,
      activeCards: [skeleton, null, null, null] as (GameCardData | null)[],
      handCards: [handCard],
      equipmentSlot1: makeWeapon() as any,
      equipmentSlot2: null,
      combatState: { ...initialCombatState, currentTurn: 'hero', engagedMonsterIds: [skeleton.id] },
      phase: 'playerInput',
    };
    (engine as any)._state = state;

    engine.pushUndoCheckpoint();
    engine.dispatch({
      type: 'DEAL_DAMAGE_TO_MONSTER',
      monsterId: skeleton.id,
      damage: 99,
      source: 'weapon',
    } as GameAction);

    // Pop the snapshot — handUndo path.
    const restored = engine.popUndoCheckpoint();
    expect(restored).toBeTruthy();

    const after = engine.getState();
    // Hand card restored.
    expect(after.handCards.find(c => c.id === 'h2')).toBeTruthy();
    // Skeleton alive on the row, `reviveUsed` not set.
    const sk = (after.activeCards as (GameCardData | null)[]).find(c => c?.id === skeleton.id);
    expect(sk).toBeTruthy();
    expect((sk as any).reviveUsed).toBeFalsy();
    expect(sk!.hp).toBe(1);
    // Stack is now empty, so undoCount is 0.
    expect(engine.getUndoCount()).toBe(0);
    expect(after.undoCount).toBe(0);
  });
});
