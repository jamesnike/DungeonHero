/**
 * Action Queue — manages the ordered queue of pending game actions.
 *
 * Actions are processed FIFO. High-level actions (like END_TURN) may
 * enqueue multiple sub-actions that are resolved sequentially.
 *
 * All functions are pure — they take a queue array and return a new one.
 */

import type { GameAction } from './actions';

// ---------------------------------------------------------------------------
// Pure queue operations
// ---------------------------------------------------------------------------

/** Add a single action to the end of the queue. */
export function enqueue(queue: GameAction[], action: GameAction): GameAction[] {
  return [...queue, action];
}

/** Add multiple actions to the end of the queue (preserving order). */
export function enqueueMany(queue: GameAction[], actions: GameAction[]): GameAction[] {
  if (actions.length === 0) return queue;
  return [...queue, ...actions];
}

/** Add multiple actions to the FRONT of the queue (for immediate sub-steps). */
export function enqueueFront(queue: GameAction[], actions: GameAction[]): GameAction[] {
  if (actions.length === 0) return queue;
  return [...actions, ...queue];
}

/** Remove and return the first action. Returns [action, remainingQueue]. */
export function dequeue(queue: GameAction[]): [GameAction | undefined, GameAction[]] {
  if (queue.length === 0) return [undefined, queue];
  return [queue[0], queue.slice(1)];
}

/** Peek at the next action without removing it. */
export function peek(queue: GameAction[]): GameAction | undefined {
  return queue[0];
}

/** True if the queue has no pending actions. */
export function isEmpty(queue: GameAction[]): boolean {
  return queue.length === 0;
}

/** Clear all actions from the queue. */
export function clear(): GameAction[] {
  return [];
}

/** Return the number of pending actions. */
export function size(queue: GameAction[]): number {
  return queue.length;
}
