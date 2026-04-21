/**
 * Tests for the dice request FIFO queue used by useEventSystem to prevent
 * concurrent dice requests from clobbering each other.
 *
 * Real bug this prevents:
 *   When 雷震击 (stun-strike) hit a 虚骨再生 (bone-regen) Skeleton, the
 *   reducer emitted both ui:requestDice (hero-stun) and combat:boneRegenCheck
 *   in the same drain. Both listeners called requestDiceOutcome
 *   synchronously; the single-slot impl let bone-regen overwrite stun's
 *   resolver — stun's RESOLVE_DICE never fired and the monster was never
 *   stunned regardless of RNG.
 *
 * The queue ensures:
 *   - First request shows immediately (FIFO front)
 *   - Concurrent requests are queued and shown one-by-one as the player
 *     resolves each
 *   - RESOLVE_DICE chains (stun-strike's hit #2, etc.) keep working — they
 *     enqueue behind any already-queued dice
 *   - cancelDiceModal drops everything (active + queued) so spurious dice
 *     don't pop up after the player closes the modal
 */
import { describe, it, expect, vi } from 'vitest';
import { createDiceQueue } from '../dice-queue';

type Cfg = { id: string };
type Outcome = { tag: string };

describe('createDiceQueue', () => {
  it('shows the first request immediately and queues subsequent ones (FIFO)', () => {
    const shown: Cfg[] = [];
    const q = createDiceQueue<Cfg, Outcome>(entry => shown.push(entry.config));

    void q.enqueue({ id: 'a' });
    void q.enqueue({ id: 'b' });
    void q.enqueue({ id: 'c' });

    expect(shown.map(c => c.id)).toEqual(['a']);
    expect(q.isIdle()).toBe(false);
    expect(q.pendingCount()).toBe(2);

    q.complete({ tag: 'a-done' });
    expect(shown.map(c => c.id)).toEqual(['a', 'b']);
    expect(q.pendingCount()).toBe(1);

    q.complete({ tag: 'b-done' });
    expect(shown.map(c => c.id)).toEqual(['a', 'b', 'c']);
    expect(q.pendingCount()).toBe(0);

    q.complete({ tag: 'c-done' });
    expect(shown.map(c => c.id)).toEqual(['a', 'b', 'c']);
    expect(q.isIdle()).toBe(true);
  });

  it('resolves each enqueue Promise with the outcome passed to complete()', async () => {
    const q = createDiceQueue<Cfg, Outcome>(() => {});

    const p1 = q.enqueue({ id: 'first' });
    const p2 = q.enqueue({ id: 'second' });

    q.complete({ tag: 'one' });
    await expect(p1).resolves.toEqual({ tag: 'one' });

    q.complete({ tag: 'two' });
    await expect(p2).resolves.toEqual({ tag: 'two' });
  });

  it('regression: stun-strike + bone-regen scenario (concurrent enqueue, then chain on first complete)', async () => {
    // Models the real bug:
    //   1) 雷震击 reducer emits ui:requestDice (stun #1) → enqueue
    //   2) DEAL_DAMAGE_TO_MONSTER drain emits combat:boneRegenCheck → enqueue
    //   3) Player completes stun #1 → reducer chains stun #2 via RESOLVE_DICE
    //      → listener calls enqueue inside the complete() callback (synchronous chain)
    //   4) Player completes bone-regen → no chain
    //   5) Player completes stun #2 → no chain
    // Expected order shown to player: stun#1, bone-regen, stun#2.
    const shown: string[] = [];
    const q = createDiceQueue<Cfg, Outcome>(entry => shown.push(entry.config.id));

    const stun1 = q.enqueue({ id: 'stun#1' });
    const boneRegen = q.enqueue({ id: 'bone-regen' });

    expect(shown).toEqual(['stun#1']);

    // Simulate the chain: when stun#1 completes, the RESOLVE_DICE reducer
    // chain triggers a follow-up ui:requestDice (stun #2). The listener
    // synchronously enqueues it as part of the dispatch flow that runs
    // AFTER complete() finishes its own auto-flush.
    let stun2: Promise<Outcome | null> | null = null;
    const completeWithChain = (outcome: Outcome) => {
      q.complete(outcome);
      // Mimic the dispatch(RESOLVE_DICE) → listener → enqueue call that
      // happens after complete() returns in handleDiceRollResult.
      stun2 = q.enqueue({ id: 'stun#2' });
    };

    completeWithChain({ tag: 'stun#1-done' });
    // After completing stun#1: bone-regen auto-flushed (since it was queued
    // ahead of the chain), and stun#2 is queued behind it.
    expect(shown).toEqual(['stun#1', 'bone-regen']);
    expect(q.pendingCount()).toBe(1);

    q.complete({ tag: 'bone-regen-done' });
    expect(shown).toEqual(['stun#1', 'bone-regen', 'stun#2']);
    expect(q.pendingCount()).toBe(0);

    q.complete({ tag: 'stun#2-done' });
    expect(q.isIdle()).toBe(true);

    await expect(stun1).resolves.toEqual({ tag: 'stun#1-done' });
    await expect(boneRegen).resolves.toEqual({ tag: 'bone-regen-done' });
    await expect(stun2!).resolves.toEqual({ tag: 'stun#2-done' });
  });

  it('chain enqueue from within the show callback still gets queued (no recursive flush)', () => {
    // Defensive: if the show callback synchronously enqueues another dice
    // (it should not happen in practice, but if it did, we mustn't recurse
    // into show). The queue should record the second entry and process it
    // after the first completes.
    const shown: string[] = [];
    let firstShown = false;
    const q = createDiceQueue<Cfg, Outcome>(entry => {
      shown.push(entry.config.id);
      if (!firstShown) {
        firstShown = true;
        void q.enqueue({ id: 'inside-show' });
      }
    });

    void q.enqueue({ id: 'outer' });
    expect(shown).toEqual(['outer']);
    expect(q.pendingCount()).toBe(1);

    q.complete({ tag: 'outer-done' });
    expect(shown).toEqual(['outer', 'inside-show']);
  });

  it('cancel resolves the active resolver AND every queued resolver with null, then queue is empty', async () => {
    const q = createDiceQueue<Cfg, Outcome>(() => {});

    const p1 = q.enqueue({ id: 'a' });
    const p2 = q.enqueue({ id: 'b' });
    const p3 = q.enqueue({ id: 'c' });

    expect(q.pendingCount()).toBe(2);

    q.cancel();

    await expect(p1).resolves.toBeNull();
    await expect(p2).resolves.toBeNull();
    await expect(p3).resolves.toBeNull();
    expect(q.isIdle()).toBe(true);
    expect(q.pendingCount()).toBe(0);
  });

  it('cancel followed by enqueue starts fresh', () => {
    const shown: string[] = [];
    const q = createDiceQueue<Cfg, Outcome>(entry => shown.push(entry.config.id));

    void q.enqueue({ id: 'a' });
    void q.enqueue({ id: 'b' });
    q.cancel();

    void q.enqueue({ id: 'fresh' });
    expect(shown).toEqual(['a', 'fresh']);
  });

  it('complete on an idle queue is a no-op (does not throw, does not flush a non-existent next)', () => {
    const show = vi.fn();
    const q = createDiceQueue<Cfg, Outcome>(show);
    expect(() => q.complete({ tag: 'spurious' })).not.toThrow();
    expect(show).not.toHaveBeenCalled();
  });

  it('completing the active dice while none queued leaves the queue idle', async () => {
    const q = createDiceQueue<Cfg, Outcome>(() => {});
    const p = q.enqueue({ id: 'lone' });
    q.complete({ tag: 'lone-done' });
    await expect(p).resolves.toEqual({ tag: 'lone-done' });
    expect(q.isIdle()).toBe(true);
    expect(q.pendingCount()).toBe(0);
  });
});
