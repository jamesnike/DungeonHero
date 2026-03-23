# Auto Draw Reliability Notes

## Symptoms Observed
- After resolving a dungeon card, the backpack counter decreased but the hand size did not increase.
- The issue reproduced intermittently, especially when multiple dungeon cards were cleared quickly.
- Logs showed multiple `draw-request` entries without the expected `draw-success`.

## Root Cause
- Auto-draws were triggered immediately inside `removeCard`. When multiple cards were cleared in quick succession, the draw logic ran back-to-back while the hand animation/flight system still treated cards as “in transit”.
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

Following this checklist should prevent the “backpack decrements / hand unchanged” issue from resurfacing. If the behaviour drifts again, start by reviewing the log markers above—they capture each branch of the auto-draw state machine. 

