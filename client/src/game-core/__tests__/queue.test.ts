import { describe, expect, it } from 'vitest';
import {
  enqueue,
  enqueueMany,
  enqueueFront,
  dequeue,
  peek,
  isEmpty,
  clear,
  size,
} from '../queue';
import type { GameAction } from '../actions';

const noop: GameAction = { type: 'NO_OP' };
const startTurn: GameAction = { type: 'START_TURN' };
const endTurn: GameAction = { type: 'END_TURN', heroTurnLayerLossIds: [] };

describe('queue', () => {
  it('enqueue adds to the end', () => {
    const q = enqueue([noop], startTurn);
    expect(q).toEqual([noop, startTurn]);
  });

  it('enqueueMany adds all items to the end', () => {
    const q = enqueueMany([noop], [startTurn, endTurn]);
    expect(q).toEqual([noop, startTurn, endTurn]);
  });

  it('enqueueMany with empty array returns same array', () => {
    const original = [noop];
    const q = enqueueMany(original, []);
    expect(q).toBe(original);
  });

  it('enqueueFront adds to the beginning', () => {
    const q = enqueueFront([endTurn], [noop, startTurn]);
    expect(q).toEqual([noop, startTurn, endTurn]);
  });

  it('dequeue removes and returns the first item', () => {
    const [action, remaining] = dequeue([startTurn, endTurn]);
    expect(action).toEqual(startTurn);
    expect(remaining).toEqual([endTurn]);
  });

  it('dequeue from empty returns undefined', () => {
    const [action, remaining] = dequeue([]);
    expect(action).toBeUndefined();
    expect(remaining).toEqual([]);
  });

  it('peek returns the first item without removing', () => {
    const q = [startTurn, endTurn];
    expect(peek(q)).toEqual(startTurn);
    expect(q.length).toBe(2);
  });

  it('isEmpty returns true for empty array', () => {
    expect(isEmpty([])).toBe(true);
    expect(isEmpty([noop])).toBe(false);
  });

  it('clear returns empty array', () => {
    expect(clear()).toEqual([]);
  });

  it('size returns queue length', () => {
    expect(size([])).toBe(0);
    expect(size([noop, startTurn])).toBe(2);
  });
});
