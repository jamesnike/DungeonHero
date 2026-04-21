# Auto Draw Reliability Notes

## Symptoms Observed
- After resolving a dungeon card, the backpack counter decreased but the hand size did not increase.
- The issue reproduced intermittently, especially when multiple dungeon cards were cleared quickly.
- Logs showed multiple `draw-request` entries without the expected `draw-success`.

## Root Cause
- Auto-draws were triggered immediately inside `removeCard`. When multiple cards were cleared in quick succession, the draw logic ran back-to-back while the hand animation/flight system still treated cards as "in transit".
- Because draws were synchronous, later calls could pop cards from the backpack when the hand state snapshot still showed the previous size. If the animation failed to queue (e.g., DOM not ready), the fallback timer restored the card, but the user-visible state temporarily showed missing cards, creating the perception that draws were lost.
- There was no pacing between automatic draws, so any hiccup in the animation pipeline compounded quickly.

## Fixes Implemented
1. **Pending Draw Counter** – Each dungeon card removal increments `pendingBackpackDraws`. The counter is only decremented once a card actually completes the hand insertion watchdog, guaranteeing a 1:1 relationship between dungeon resolutions and draws.
2. **Slot Awareness** – The processor waits until both a hand slot and a backpack card are available. If the hand is full or the backpack is empty, the pending counter remains unchanged and the draw is retried automatically when state changes.
3. **Fallback Requeue** – When the insertion watchdog gives up and returns a card to the backpack, it now calls `requestBackpackDraw('hand-insert-retry')` so the originally promised draw is re-attempted instead of being silently dropped.
4. **Logging Enhancements** – Added `auto-trigger`, `auto-blocked`, and `auto-draw-delivered` markers tied to the new counter so any discrepancy can be traced directly from `logBackpackDraw`.
5. **Backpack Snapshots** – Every mutation of `backpackItems` now emits logs such as `backpack-add`, `backpack-store-pending/ready`, `backpack-take`, and `backpack-empty-snapshot`. These include both the state length and the ref length so we can compare what React rendered versus what synchronous logic (auto-draw, removal) saw in the same tick.

## Debug Checklist (if regressions appear)
1. **Console Logs** – Enable DEV logs and confirm that every `auto-trigger` is followed by either an `auto-draw-delivered` entry or an `auto-blocked` reason (`hand-full` / `backpack-empty`). Pending counts should never increase without a corresponding drain later.
2. **Pending Counter** – Inspect `pendingBackpackDraws` via React DevTools; it should trend back to zero once draws catch up.
3. **Hand/Backpack Counts** – While reproducing, keep the hand near the limit and verify that `isHandFull` accurately blocks scheduling (look for `auto-blocked` with `reason: 'hand-full'`). If the backpack drains unexpectedly, inspect the `backpack-add/backpack-take` entries to confirm the ref count matches the visual count.
4. **Animation Fallbacks** – If cards appear in the backpack but not the hand, confirm that `backpackHandFlightFallbacksRef` timers are clearing; stale timers can be reset by calling `clearAllBackpackHandFallbacks()`.

## Repro & Verification Steps
1. Clear multiple dungeon cards quickly (e.g., chain-kill monsters) and confirm that the hand gains exactly one card per removal once space exists, even if animations overlap.
2. Fill the hand to five cards and resolve another dungeon card—no auto draw should occur, logs should show `auto-blocked (hand-full)`, and the pending counter should stay > 0 until space opens.
3. Empty the backpack and resolve a dungeon card—logs should show `auto-blocked (backpack-empty)` while the pending counter stays > 0 until new items are acquired.
4. Run `npm run build` (or dev server) and monitor for `auto-*` log spam; counts should align with actual draws and the pending counter should not diverge.

Following this checklist should prevent the "backpack decrements / hand unchanged" issue from resurfacing. If the behaviour drifts again, start by reviewing the log markers above—they capture each branch of the auto-draw state machine.

## Round 2 — Intermittent "No Draw After Processing Dungeon Card"

### Symptom
- After processing a dungeon card, no auto-draw occurs (hand stays the same)
- Undo + refresh + redo fixes it
- Ignoring and processing the next dungeon card also triggers the draw normally

### Root Cause: "Dead Pending" state

The auto-draw pipeline has two layers of slot-checking that can disagree:

1. `processPendingAutoDraws` (in `useEventSystem`) checks `engine.getState().handCards.length` — always current
2. `drawFromBackpackToHand` (in `useCardOperations`) was checking `handCardsRef.current.length` — potentially stale

When these disagreed, `processPendingAutoDraws` saw "slots available" and called `drawFromBackpackToHand`, which saw "no slots" (stale ref) and returned `null`. The pending counter stayed positive but **no effect dependency changed**, so the effect never re-fired. The draw was silently lost.

Why the ref could be stale: `handCardsRef` was synced via `useEffect` (post-render), but auto-draw effects in `useEventSystem` (registered at line ~957 in GameBoard) ran **before** the sync effect (registered at line ~6153). Flight completions, delivery guard callbacks, and other async hand modifications could leave the ref out of sync.

Why "next card works": processing the next card calls `setAutoDrawTrigger(v => v + 1)`, changing an effect dependency, re-triggering the effect. By then the ref is usually in sync.

### Fixes Applied

1. **Single source of truth for hand size**: `drawFromBackpackToHand` now reads hand size from `engine.getState().handCards.length` instead of `handCardsRef.current.length`. Both layers now use the same authoritative source.

2. **All exit paths forfeit pending draws**: Previously, the `null`-draw and backpack-empty paths did `break` without zeroing `pendingAutoDrawsRef`, creating a "zombie" counter that blocked future draws if no dependency changed. Now all three exit paths (`hand-full`, `backpack-empty`, `null-draw`) set `pendingAutoDrawsRef.current = 0`.

3. **Render-time ref sync**: `handCardsRef.current = handCards` is now assigned during render (before effects) in addition to the existing `useEffect`. This ensures all effects see the current value regardless of registration order.

4. **Stable `processPendingAutoDraws`**: Dependencies changed from `[handCards.length]` to `[]` since the function body reads everything from `engine.getState()` and refs.

---

## Round 3 — Stacked Card Promotion Skips Auto-Draw

### Root Cause

`useEventSystem` maintains its own `processedDungeonCardIdsRef` (separate from GameBoard's). When a dungeon card is processed, its ID is added to this set to prevent duplicate auto-draw registration.

When the Graveyard Amulet (`hasPersuadeGraveyardStack`) stacks previously-processed cards from the graveyard below a monster, those cards retain their original IDs. After the top card is removed (stack pop), the graveyard card is promoted to the active row. When the player later processes this promoted card, `registerDungeonCardProcessed` finds the ID already in the set and returns early — no `pendingAutoDrawsRef++`, no `setAutoDrawTrigger`, no auto-draw.

The `slot-cleared` backup path is also blocked because it uses the same `registerDungeonCardProcessed` function.

### Why "next card works"

Processing the next card increments `autoDrawTrigger`, but the real issue is that `pendingAutoDrawsRef` was never incremented for the stacked card, so there's nothing queued. The auto-draw that does trigger is for the next card's own processing.

### Fixes Applied

1. **Unregister promoted card IDs**: When stack pop promotes a card to the active row, its ID is removed from `processedDungeonCardIdsRef` via `unregisterProcessedCardId(nextCard.id)`. This ensures re-promoted cards are treated as fresh for auto-draw purposes.

2. **Sync dual refs on reset**: `useEventSystem`'s `processedDungeonCardIdsRef` is now cleared (`clearAllProcessedCardIds()`) alongside GameBoard's ref during new game, hydration, and undo.

---

## Round 4 — On-Enter-Hand Trigger Lost in Pipeline Overflow + Undo

### Symptom

A 三牌惊雷 (`onEnterHandEffect: 'three-card-thunder-onhand'`) was visibly drawn into the player's hand, but the on-enter-hand 1-spell-damage effect never fired. The bug was reported once and could not be reproduced; no save file or console log was retained.

User-reported context: the player had just performed an `undo` and immediately before that, a long combo chain (hero skill → magic echo → equipment cascade → on-enter-hand triggers) had resolved.

### Static Audit Result (no code-level fix)

The static path for on-enter-hand triggers is correct end-to-end:

- `knightDeck.ts` declares `onEnterHandEffect: 'three-card-thunder-onhand'` correctly.
- `postProcessHandEntries` in `reducer.ts` enqueues `TRIGGER_ON_ENTER_HAND` for every newly-added hand card with the field set (and without `_skipOnEnterHand`).
- `executeOnEnterHand` in `card-schema/on-enter-hand.ts` looks up the registered handler and runs it.
- All 7 on-enter-hand cards' unit tests pass (`three-card-thunder.test.ts`, `on-enter-hand.test.ts`, `blood-oath-scroll.test.ts`, `survey-action.test.ts`, `frenzy-curse.test.ts`).

### Most-Likely Root Cause: Pipeline Overflow + Undo Combo

`pipeline.drain` had a hard cap of `MAX_STEPS = 200` actions per dispatch, with the overflow log gated behind `DEV_MODE`. In a long late-game combo, the cap can be hit silently — the leftover queue (including any `TRIGGER_ON_ENTER_HAND` enqueued by `postProcessHandEntries`) stays in `state.actionQueue`, draining best-effort on the next dispatch.

If the player triggers `undo` before the next dispatch drains, `engine.popUndoCheckpoint` calls `replaceState` with a snapshot whose `actionQueue` is empty (snapshots are taken at "stable" moments, after the queue drained). The pending `TRIGGER_ON_ENTER_HAND` is overwritten and lost forever, with zero feedback to the player.

### Mitigation Applied (this round, defensive only)

1. **Raised `MAX_STEPS` from 200 to 500** in `client/src/game-core/pipeline.ts`. Observed real-game chains stay under 300; 500 gives ~2.5× headroom while still catching genuine infinite loops in seconds.
2. **Always-on overflow logging**: dropped the `DEV_MODE` guard. `[pipeline] Safety limit reached (...)` now appears in every console regardless of build, so bug-report screenshots will capture it.
3. **`pipeline:overflow` SideEffect**: emitted by `drain` whenever it hits the cap. Payload includes `stepsProcessed`, `remainingQueueLength`, and `headActionTypes` (first 5 leftover action.type strings) for diagnostic value.
4. **`overflowed: boolean` on `PipelineResult`**: lets the engine and tests programmatically detect the condition.
5. **UI banner**: `useEventSystem.ts` listens for `pipeline:overflow` and dispatches `SET_HERO_SKILL_BANNER` plus a `system`-type log entry, so the player sees a non-blocking warning when a chain is truncated.
6. **Diagnostic traces**: `console.debug('[on-enter-hand] enqueue', ...)` in `postProcessHandEntries` and `console.debug('[on-enter-hand] fire', ...)` in `executeOnEnterHand`. A future bug report showing "enqueue without fire" definitively confirms the lost-trigger scenario.

### Diagnostic Signals (for the next time this surfaces)

When a player reports "上手 effect didn't fire":

1. Ask for a console screenshot. Look for `[pipeline] Safety limit reached`.
2. Look for matched `[on-enter-hand] enqueue` and `[on-enter-hand] fire` lines for the offending card. If `enqueue` appears without `fire`, the trigger was lost.
3. Ask whether they used `undo` between the card entering hand and the next action.
4. Check for the on-screen banner "效果链过长被截断..." in their session.

### Tests Added

`client/src/game-core/__tests__/pipeline-overflow.test.ts` covers:

- 600-step queue truncates with `overflowed: true` + `pipeline:overflow` SideEffect.
- 250-step queue finishes cleanly (within new 500 cap).
- 501-step queue truncates by exactly 1 (boundary).
- Overflow event payload reports the actual head action types.
- Leftover queue continues draining on the next `drain` call.
- **Documented repro of the bug** (case D, intentionally not a fix): after overflow leaves a `TRIGGER_ON_ENTER_HAND` in `actionQueue`, restoring an undo snapshot wipes it.

### Phase 2 (Not Done — Future Work)

The defensive measures above make the bug *visible* but do not *prevent* it. A real fix needs:

- A card-level `_onEnterHandTriggered` flag set when the effect successfully fires, persisted across undo snapshots.
- An audit of every hand-exit path (`PLAY_CARD`, `DISCARD_CARD`, equip, etc.) to clear the flag at the right moment so re-entries still trigger.
- Or alternatively, persist `actionQueue` across undo snapshots — but that has its own correctness issues (replaying an already-applied action).

This is scoped as a separate change because it touches `shared-effect-id-impact-check` — all 7 on-enter-hand cards must be re-validated, not just 三牌惊雷.
