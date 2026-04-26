// ---------------------------------------------------------------------------
// Unique class-card lock helpers
// ---------------------------------------------------------------------------
//
// Cards in the class pool tagged with `unique: true` are "唯一" cards: once
// the player obtains an instance for the run, every future class-pool
// sampling path (discover / draw / event grants / shop refresh) must filter
// them out so the same base card cannot be obtained twice.
//
// The class pool is an *infinite template* — every sampled card is cloned
// with a fresh ID via `cloneClassCardWithFreshId`. We therefore key the lock
// by `getStarterBaseId(card.id)` (the stable starter base ID like
// `knight-3`) rather than the cloned instance ID.
//
// Lifecycle:
//   - Written when a unique card actually lands in player possession (hand /
//     backpack / equipment slot / amulet slot / recycle bag).
//   - Reset on `INIT_GAME` (per-run lock; not cross-run).
//   - Persisted mid-run by `persistence.ts` so reloads keep the lock.
//
// Filter contract:
//   - Discover candidates and shop offerings shown but not selected do *not*
//     count as acquired — the card never reaches the lock until it lands.
//   - Once locked, subsequent sampling paths skip the card entirely. Shop
//     offerings already on display when the lock is set remain visible but
//     `purchaseFromShopPure` rejects them so the player cannot acquire a
//     second copy.

import type { GameCardData } from '@/components/GameCard';
import type { GameState } from './types';
import { getStarterBaseId } from './deck';

/**
 * Read the current set of acquired unique base IDs, preferring values from
 * an in-flight reducer patch over the committed state. Always returns a
 * fresh `Set` so callers can mutate freely without touching state.
 */
function readAcquired(state: GameState, patch?: Partial<GameState>): Set<string> {
  return new Set(patch?.acquiredUniqueClassCardIds ?? state.acquiredUniqueClassCardIds ?? []);
}

/**
 * True when the card is tagged `unique: true` and its base ID is already
 * recorded as acquired this run. Cards without the `unique` flag never lock.
 */
export function isUniqueLocked(card: GameCardData, acquired: Set<string>): boolean {
  if (card.unique !== true) return false;
  return acquired.has(getStarterBaseId(card.id));
}

/**
 * Filter a class-pool collection to exclude any unique cards the player has
 * already acquired this run. Always returns a new array (safe to mutate).
 * Pass the in-flight reducer `patch` so back-to-back acquisitions in the
 * same reduce step see each other's writes.
 */
export function filterAvailableClassPool<T extends GameCardData>(
  pool: readonly T[],
  state: GameState,
  patch?: Partial<GameState>,
): T[] {
  const acquired = readAcquired(state, patch);
  if (acquired.size === 0) return [...pool];
  return pool.filter(c => !isUniqueLocked(c, acquired));
}

/**
 * Mark the card as acquired (idempotent). No-op if the card is not tagged
 * `unique: true`, or if its base ID is already recorded. Mutates `patch` in
 * place so the caller can keep accumulating reducer patch fields.
 */
export function markUniqueAcquired(
  card: GameCardData,
  state: GameState,
  patch: Partial<GameState>,
): void {
  if (card.unique !== true) return;
  const baseId = getStarterBaseId(card.id);
  const list = patch.acquiredUniqueClassCardIds ?? state.acquiredUniqueClassCardIds ?? [];
  if (list.includes(baseId)) return;
  patch.acquiredUniqueClassCardIds = [...list, baseId];
}

/**
 * Convenience wrapper that marks every card in the iterable. Each call is
 * still idempotent — duplicates within the same iterable are absorbed.
 */
export function markManyUniqueAcquired(
  cards: readonly GameCardData[],
  state: GameState,
  patch: Partial<GameState>,
): void {
  for (const c of cards) markUniqueAcquired(c, state, patch);
}
