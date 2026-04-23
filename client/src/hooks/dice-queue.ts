/**
 * FIFO queue helper for the event dice modal.
 *
 * Background: the dice modal in `useEventSystem.ts` is a single-slot UI
 * (`eventDiceModal` state + `eventDiceResolverRef`). When two dice requests
 * fire in the same reduce/drain tick (e.g. 雷震击 stun dice and 骸生
 * bone-regen dice on the same hit), the second one would otherwise overwrite
 * the first — the first dice's resolver is orphaned and its RESOLVE_DICE
 * never fires (so the monster never gets stunned regardless of RNG).
 *
 * This factory wraps the show / complete / cancel lifecycle into a tiny pure
 * state machine so it is trivially unit-testable. The hook injects a
 * `show` callback that knows how to render the dice modal and a `resolve`
 * function in the entry that the hook calls when the player clicks.
 *
 * Lifecycle:
 *   enqueue(config) → if idle, calls show(entry); else queues entry
 *   complete(outcome) → resolves the active entry, then flushes next queued
 *   cancel() → resolves active + all queued entries with null, clears queue
 */

export interface DiceQueueEntry<TConfig, TOutcome> {
  config: TConfig;
  resolve: (outcome: TOutcome | null) => void;
}

export interface DiceQueue<TConfig, TOutcome> {
  /** Push a request; returns a Promise that resolves when this entry completes (or null on cancel). */
  enqueue: (config: TConfig) => Promise<TOutcome | null>;
  /** Player completed the active dice with `outcome`. Auto-flushes the next queued entry. */
  complete: (outcome: TOutcome | null) => void;
  /** Drop the active dice and any queued ones, resolving each with null. */
  cancel: () => void;
  /** True iff there is no active dice waiting on a resolver. */
  isIdle: () => boolean;
  /** Test-only: number of queued entries (excluding the active one). */
  pendingCount: () => number;
}

export function createDiceQueue<TConfig, TOutcome>(
  show: (entry: DiceQueueEntry<TConfig, TOutcome>) => void,
): DiceQueue<TConfig, TOutcome> {
  let activeResolver: ((o: TOutcome | null) => void) | null = null;
  const queue: Array<DiceQueueEntry<TConfig, TOutcome>> = [];

  function flushIfIdle(): void {
    if (activeResolver !== null) return;
    const next = queue.shift();
    if (!next) return;
    activeResolver = next.resolve;
    show(next);
  }

  function enqueue(config: TConfig): Promise<TOutcome | null> {
    return new Promise<TOutcome | null>(resolve => {
      queue.push({ config, resolve });
      flushIfIdle();
    });
  }

  function complete(outcome: TOutcome | null): void {
    const r = activeResolver;
    activeResolver = null;
    r?.(outcome);
    // RESOLVE_DICE side effects may have synchronously called enqueue() to
    // chain a follow-up dice (e.g. stun-strike hit #2). That call already
    // pushed onto `queue` and tried flushIfIdle() — but at THAT moment
    // activeResolver was still set (we cleared it above before invoking r),
    // so the chain entry is sitting in queue. Flush now to pick it up
    // (or any earlier-queued bone-regen, which gets FIFO priority).
    flushIfIdle();
  }

  function cancel(): void {
    const r = activeResolver;
    activeResolver = null;
    r?.(null);
    while (queue.length > 0) {
      const next = queue.shift()!;
      next.resolve(null);
    }
  }

  function isIdle(): boolean {
    return activeResolver === null;
  }

  function pendingCount(): number {
    return queue.length;
  }

  return { enqueue, complete, cancel, isIdle, pendingCount };
}
