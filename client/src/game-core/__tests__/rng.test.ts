import { describe, expect, it } from 'vitest';
import { createRng, nextRandom, nextInt, nextBool, shuffle, pickRandom, nextId } from '../rng';

describe('rng', () => {
  describe('determinism', () => {
    it('produces identical sequences from the same seed', () => {
      const rng1 = createRng(42);
      const rng2 = createRng(42);

      const [v1a, s1a] = nextRandom(rng1);
      const [v2a, s2a] = nextRandom(rng2);
      expect(v1a).toBe(v2a);
      expect(s1a).toEqual(s2a);

      const [v1b] = nextRandom(s1a);
      const [v2b] = nextRandom(s2a);
      expect(v1b).toBe(v2b);
    });

    it('produces different sequences from different seeds', () => {
      const [v1] = nextRandom(createRng(1));
      const [v2] = nextRandom(createRng(2));
      expect(v1).not.toBe(v2);
    });
  });

  describe('nextRandom', () => {
    it('returns values in [0, 1)', () => {
      let rng = createRng(123);
      for (let i = 0; i < 1000; i++) {
        const [v, next] = nextRandom(rng);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
        rng = next;
      }
    });

    it('preserves the original seed', () => {
      const rng = createRng(999);
      const [, next] = nextRandom(rng);
      expect(next.seed).toBe(999);
      const [, next2] = nextRandom(next);
      expect(next2.seed).toBe(999);
    });
  });

  describe('nextInt', () => {
    it('returns values in [min, max]', () => {
      let rng = createRng(7);
      for (let i = 0; i < 200; i++) {
        const [v, next] = nextInt(rng, 3, 10);
        expect(v).toBeGreaterThanOrEqual(3);
        expect(v).toBeLessThanOrEqual(10);
        expect(Number.isInteger(v)).toBe(true);
        rng = next;
      }
    });

    it('returns exact value when min === max', () => {
      const [v] = nextInt(createRng(42), 5, 5);
      expect(v).toBe(5);
    });
  });

  describe('nextBool', () => {
    it('returns booleans', () => {
      let rng = createRng(55);
      let trueCount = 0;
      const n = 1000;
      for (let i = 0; i < n; i++) {
        const [v, next] = nextBool(rng);
        expect(typeof v).toBe('boolean');
        if (v) trueCount++;
        rng = next;
      }
      expect(trueCount).toBeGreaterThan(n * 0.3);
      expect(trueCount).toBeLessThan(n * 0.7);
    });
  });

  describe('shuffle', () => {
    it('returns a permutation of the input', () => {
      const arr = [1, 2, 3, 4, 5, 6, 7, 8];
      const [shuffled] = shuffle(arr, createRng(42));
      expect(shuffled).toHaveLength(arr.length);
      expect(shuffled.sort()).toEqual(arr.sort());
    });

    it('does not mutate the original array', () => {
      const arr = [1, 2, 3];
      const copy = [...arr];
      shuffle(arr, createRng(1));
      expect(arr).toEqual(copy);
    });

    it('is deterministic', () => {
      const arr = [1, 2, 3, 4, 5];
      const [a] = shuffle(arr, createRng(42));
      const [b] = shuffle(arr, createRng(42));
      expect(a).toEqual(b);
    });
  });

  describe('pickRandom', () => {
    it('picks an element from the array', () => {
      const arr = ['a', 'b', 'c'];
      const [v] = pickRandom(arr, createRng(10));
      expect(arr).toContain(v);
    });
  });

  describe('nextId', () => {
    it('produces a string with the given prefix', () => {
      const [id] = nextId(createRng(42), 'card');
      expect(id.startsWith('card-')).toBe(true);
    });

    it('is deterministic', () => {
      const [a] = nextId(createRng(42), 'x');
      const [b] = nextId(createRng(42), 'x');
      expect(a).toBe(b);
    });
  });
});
