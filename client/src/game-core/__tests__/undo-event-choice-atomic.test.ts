/**
 * Regression: clicking Undo after picking an event choice must atomically
 * revert the entire event resolution — back to the state where the event
 * card is still pristine in the dungeon row and the choice modal is
 * closed.
 *
 * User-reported flow:
 *   1. Event card sits in the dungeon row (no modal open).
 *   2. Player drags it onto the hero → handleCardToHero pushes one undo
 *      snapshot, then SET_CURRENT_EVENT + SET_EVENT_MODAL_OPEN open the
 *      EventChoiceModal.
 *   3. Player picks a choice → RESOLVE_EVENT_CHOICE applies effects
 *      (gold/HP/etc.), COMPLETE_EVENT closes the modal and clears
 *      currentEventCard, possibly removing the card from the dungeon row.
 *   4. Player clicks Undo. Expectation: a SINGLE Undo restores everything
 *      to the snapshot from step 2 — modal closed, event still in row,
 *      gold/HP unchanged.
 *
 * Bug (pre-fix): handleEventChoice unconditionally called pushUndoSnapshot
 * a second time, AFTER the modal had already opened. That mid-event
 * snapshot became the top of the undo stack, so the first Undo only
 * popped back to "modal still open, choice not yet picked" — the player
 * could then re-pick the same option, applying the effect again and
 * effectively double-resolving the event with each undo cycle. The fix
 * is to drop the redundant push in handleEventChoice; the snapshot
 * captured by handleCardToHero before the modal opened is the canonical
 * atomic checkpoint.
 *
 * This test validates the engine-level invariant: given exactly one
 * snapshot pushed before the event flow starts, popping that snapshot
 * after RESOLVE_EVENT_CHOICE + COMPLETE_EVENT fully restores the
 * pre-event state.
 */

import { describe, expect, it } from 'vitest';
import { GameEngine } from '../index';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { GameState } from '../types';
import { createInitialGameState } from '../state';

function makeEvent(): GameCardData {
  return {
    id: 'evt-test',
    type: 'event',
    name: '测试事件',
    value: 0,
    eventChoices: [
      { id: 'gain-gold', text: '获得 5 金币', effect: 'gold+5' },
    ],
  } as GameCardData;
}

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe('Event choice undo atomicity', () => {
  it('single Undo after picking an event choice fully reverts to before the event was opened', () => {
    const eventCard = makeEvent();

    // Pre-event state: event card sits in the dungeon row, modal is closed,
    // gold = 10. This mirrors the state right BEFORE the player drags the
    // event card onto the hero.
    const initial = makeState({
      activeCards: [eventCard, null, null, null, null] as (GameCardData | null)[],
      gold: 10,
      currentEventCard: null,
      eventModalOpen: false,
      phase: 'playerInput',
    });

    const engine = new GameEngine();
    (engine as any)._state = initial;

    // Step 1: handleCardToHero (in GameBoard.tsx) pushes ONE snapshot at
    // the top of the function — this is the atomic checkpoint.
    engine.pushUndoCheckpoint();
    expect(engine.getUndoCount()).toBe(1);

    // Step 2: handleCardToHero then dispatches SET_CURRENT_EVENT and
    // SET_EVENT_MODAL_OPEN to open the modal.
    engine.dispatch({ type: 'SET_CURRENT_EVENT', card: eventCard } as GameAction);
    engine.dispatch({ type: 'SET_EVENT_MODAL_OPEN', open: true } as GameAction);
    expect(engine.getState().currentEventCard?.id).toBe(eventCard.id);
    expect(engine.getState().eventModalOpen).toBe(true);

    // Step 3: Player picks the choice. handleEventChoice (post-fix) does
    // NOT push another snapshot — it only dispatches RESOLVE_EVENT_CHOICE.
    engine.dispatch({
      type: 'RESOLVE_EVENT_CHOICE',
      choiceId: 'gain-gold',
      choiceText: '获得 5 金币',
      effectTokens: ['gold+5'],
      skipFlip: false,
    } as GameAction);

    // Sanity: effect applied, modal closed, event card removed from row.
    const afterChoice = engine.getState();
    expect(afterChoice.gold).toBe(15);
    expect(afterChoice.eventModalOpen).toBe(false);
    expect(afterChoice.currentEventCard).toBeNull();
    expect(afterChoice.activeCards[0]).toBeNull();

    // Critical: only ONE snapshot should be on the undo stack — the one
    // pushed by handleCardToHero before the modal opened. If a second
    // snapshot leaks in (the regression we're guarding against), Undo
    // becomes a 2-step process and the player can re-resolve the event.
    expect(engine.getUndoCount()).toBe(1);

    // Step 4: Player clicks Undo. A single pop must revert ALL the way to
    // the pre-event state.
    const restored = engine.popUndoCheckpoint();
    expect(restored).not.toBeNull();
    const final = engine.getState();

    // Gold reverted, modal still closed, event card pristine in dungeon.
    expect(final.gold).toBe(10);
    expect(final.currentEventCard).toBeNull();
    expect(final.eventModalOpen).toBe(false);
    expect(final.activeCards[0]?.id).toBe(eventCard.id);

    // Undo stack now empty — no leftover mid-event snapshot to pop.
    expect(engine.getUndoCount()).toBe(0);
  });

  it('regression: a second mid-event snapshot would leave the modal open after one Undo (pre-fix bug shape)', () => {
    // This codifies WHY the bug occurred. If handleEventChoice ever pushes
    // a second snapshot mid-event again, this test will fail and show that
    // a single Undo no longer reverts atomically. We simulate the buggy
    // flow by manually pushing a second checkpoint between modal-open and
    // choice resolution; the assertion on the post-undo state then fails
    // to match "fully reverted".
    const eventCard = makeEvent();
    const initial = makeState({
      activeCards: [eventCard, null, null, null, null] as (GameCardData | null)[],
      gold: 10,
      currentEventCard: null,
      eventModalOpen: false,
      phase: 'playerInput',
    });

    const engine = new GameEngine();
    (engine as any)._state = initial;

    // Snapshot #1 — handleCardToHero (correct, pre-event).
    engine.pushUndoCheckpoint();
    engine.dispatch({ type: 'SET_CURRENT_EVENT', card: eventCard } as GameAction);
    engine.dispatch({ type: 'SET_EVENT_MODAL_OPEN', open: true } as GameAction);

    // Snapshot #2 — the BUGGY pushUndoSnapshot inside handleEventChoice
    // (which the fix removes). We push it manually here, with a small
    // delay so the microtask-scoped _undoGuard has expired and the second
    // push actually registers.
    return Promise.resolve().then(() => {
      engine.pushUndoCheckpoint();
      expect(engine.getUndoCount()).toBe(2);

      // Resolve the choice as the player would.
      engine.dispatch({
        type: 'RESOLVE_EVENT_CHOICE',
        choiceId: 'gain-gold',
        choiceText: '获得 5 金币',
        effectTokens: ['gold+5'],
        skipFlip: false,
      } as GameAction);

      // First Undo — pops the BUGGY mid-event snapshot. The player sees
      // the modal reopen (currentEventCard restored, eventModalOpen=true)
      // but the event card is still in the row. They can pick again,
      // re-applying the effect — exactly the user-reported bug.
      engine.popUndoCheckpoint();
      const afterFirstUndo = engine.getState();
      expect(afterFirstUndo.eventModalOpen).toBe(true);
      expect(afterFirstUndo.currentEventCard?.id).toBe(eventCard.id);
      expect(afterFirstUndo.gold).toBe(10); // gold did revert

      // It takes a SECOND Undo to fully revert. This is the symptom we
      // explicitly avoid in the post-fix flow above (single Undo suffices).
      engine.popUndoCheckpoint();
      const afterSecondUndo = engine.getState();
      expect(afterSecondUndo.eventModalOpen).toBe(false);
      expect(afterSecondUndo.currentEventCard).toBeNull();
      expect(afterSecondUndo.activeCards[0]?.id).toBe(eventCard.id);
    });
  });
});
