/**
 * Card cloning helpers for the "infinite class pool" model.
 *
 * The classDeck is now a static template — discover, draw, purchase, and other
 * "obtain" paths sample from it without consuming. Each obtained card is cloned
 * with a fresh, deterministic id so player piles never share an id with the
 * template (or with each other).
 *
 * The clone id MUST preserve starter-id routing for cards that route through
 * `getStarterBaseId` (see `event-grant-card-id-suffix.mdc`):
 *   - For knight-N ids (route via knightEffect): id is irrelevant, just unique
 *   - For starter-perm-X-pick-N ids (route via starter-id): suffix must strip
 *     back to the original `starter-perm-X` base
 *
 * Using `nextId(rng, '${baseId}-pick-1')` yields `${baseId}-pick-1-{base36}`,
 * which `getStarterBaseId` correctly strips back to `${baseId}` for both
 * families.
 */
import type { GameCardData } from '@/components/GameCard';
import type { RngState } from './rng';
import { nextId } from './rng';
import { getStarterBaseId } from './deck';

/**
 * Clone a class-pool card with a fresh, RNG-derived id. The new id strips
 * back to the same starter base id as the source (so starter-routed cards
 * still play correctly).
 */
export function cloneClassCardWithFreshId(
  card: GameCardData,
  rng: RngState,
): [GameCardData, RngState] {
  const baseId = getStarterBaseId(card.id);
  const [newId, newRng] = nextId(rng, `${baseId}-pick-1`);
  return [{ ...card, id: newId }, newRng];
}

/**
 * Clone a list of class-pool cards in order, threading rng through each call.
 */
export function cloneClassCardsWithFreshIds(
  cards: readonly GameCardData[],
  rng: RngState,
): [GameCardData[], RngState] {
  const cloned: GameCardData[] = [];
  let cur = rng;
  for (const c of cards) {
    const [next, nextRng] = cloneClassCardWithFreshId(c, cur);
    cloned.push(next);
    cur = nextRng;
  }
  return [cloned, cur];
}

/**
 * Sample up to `count` cards from `pool`, with results distinct by `name`.
 * Shuffles via the seeded RNG, then walks in shuffled order collecting only
 * the first occurrence of each name. Returns fewer than `count` if the pool
 * doesn't contain enough distinct names.
 */
export function sampleDistinctByName<T extends { name: string }>(
  pool: readonly T[],
  count: number,
  rng: RngState,
  shuffleFn: <U>(arr: readonly U[], r: RngState) => [U[], RngState],
): [T[], RngState] {
  if (count <= 0 || pool.length === 0) return [[], rng];
  const [shuffled, nextRng] = shuffleFn(pool, rng);
  const picked: T[] = [];
  const seenNames = new Set<string>();
  for (const item of shuffled) {
    if (seenNames.has(item.name)) continue;
    seenNames.add(item.name);
    picked.push(item);
    if (picked.length >= count) break;
  }
  return [picked, nextRng];
}
