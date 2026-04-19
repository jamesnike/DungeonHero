/**
 * Seeded PRNG — Mulberry32
 *
 * A fast, deterministic pseudo-random number generator carried on GameState.
 * All game-rule randomness must flow through these functions so that replaying
 * the same seed + action sequence produces identical results.
 *
 * Every function is pure: it takes an RngState and returns [result, newRngState].
 */

export interface RngState {
  /** Original seed (preserved for replay identification). */
  seed: number;
  /** Current 32-bit PRNG state (advances with each call). */
  state: number;
}

export function createRng(seed: number): RngState {
  return { seed, state: seed | 0 };
}

/**
 * Produce a uniform float in [0, 1) and advance the state.
 */
export function nextRandom(rng: RngState): [number, RngState] {
  let s = (rng.state + 0x6D2B79F5) | 0;
  s = Math.imul(s ^ (s >>> 15), s | 1);
  s ^= (s + Math.imul(s ^ (s >>> 7), s | 61)) | 0;
  const value = ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  return [value, { seed: rng.seed, state: (s ^ (s >>> 14)) | 0 }];
}

/**
 * Produce a uniform integer in [min, max] (inclusive) and advance the state.
 */
export function nextInt(rng: RngState, min: number, max: number): [number, RngState] {
  const [v, next] = nextRandom(rng);
  return [Math.floor(v * (max - min + 1)) + min, next];
}

/**
 * Produce a boolean with the given probability (default 0.5) and advance state.
 */
export function nextBool(rng: RngState, probability = 0.5): [boolean, RngState] {
  const [v, next] = nextRandom(rng);
  return [v < probability, next];
}

/**
 * Fisher-Yates shuffle — returns a new shuffled array and advanced state.
 */
export function shuffle<T>(arr: readonly T[], rng: RngState): [T[], RngState] {
  const result = [...arr];
  let current = rng;
  for (let i = result.length - 1; i > 0; i--) {
    const [j, next] = nextInt(current, 0, i);
    current = next;
    [result[i], result[j]] = [result[j], result[i]];
  }
  return [result, current];
}

/**
 * Pick a random element from a non-empty array.
 */
export function pickRandom<T>(arr: readonly T[], rng: RngState): [T, RngState] {
  const [idx, next] = nextInt(rng, 0, arr.length - 1);
  return [arr[idx], next];
}

/**
 * Generate a deterministic unique-ish ID string.
 * Uses the RNG state itself as the suffix instead of Date.now()/Math.random().
 */
export function nextId(rng: RngState, prefix: string): [string, RngState] {
  const [v, next] = nextRandom(rng);
  const suffix = Math.abs(v * 0xFFFFFFFF | 0).toString(36);
  return [`${prefix}-${suffix}`, next];
}
