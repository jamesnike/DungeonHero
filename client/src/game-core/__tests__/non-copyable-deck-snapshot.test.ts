/**
 * `nonCopyable` Deck Snapshot — exact-set assertion of which cards in the
 * game carry `nonCopyable: true`.
 *
 * Why this test exists (per `card-data-to-ui-tag-coverage.mdc`):
 *
 *   `nonCopyable` is a "data ↔ UI tag" field consumed by:
 *     - `GameCard.tsx` (3 keyword-tag rendering blocks)
 *     - `MirrorCopyModal.tsx` (filter the modal candidates)
 *     - `mirror-copy` resolver in `rules/magic-effects.ts` and
 *       `card-schema/definitions/magic.ts` (empty-target fizzle check)
 *     - `RESOLVE_MIRROR_COPY` reducer in `rules/cards.ts` (defense-in-depth)
 *
 *   If someone silently drops the flag (e.g. swap nonCopyable for another
 *   field, accidentally omit it on a new copy of one of these 4 cards),
 *   players would suddenly be able to mirror-copy 影摹召引符 → infinite
 *   「镜影摹形」 grants per draw, breaking game balance.
 *
 *   This test red-lines the exact set so any drift gets caught at CI time
 *   instead of "I have 50 镜影摹形 in my hand, this seems wrong" bug
 *   reports from players.
 *
 * Maintenance contract:
 *
 *   When deliberately adding a new nonCopyable card → expand the
 *   `EXPECTED_NON_COPYABLE_NAMES` array. When deliberately removing
 *   the flag from a card → remove the name. Any change MUST be justified
 *   in the PR description.
 *
 *   Do NOT replace `toEqual` with `toContain`/`toHaveLength`/`toMatchSnapshot()`
 *   — those let breakage slip through.
 */

import { describe, expect, it } from 'vitest';
import { generateKnightDeck } from '@/lib/knightDeck';
import { createMirrorCopySummonCard } from '@/lib/knightDeck';
import {
  createStarterDiscoverClassToHandCard,
  createStarterCardPool,
} from '../deck';
import { createRng } from '../rng';

/**
 * Sorted list of every card name in the game (knight class deck +
 * starter card pool + starter card factories) that should carry
 * `nonCopyable: true`.
 *
 * Last reviewed: 2026-05-12 (added 回收余韵 alongside the initial 4 cards).
 */
const EXPECTED_NON_COPYABLE_NAMES = [
  '专属感召',     // starter factory perm-1 magic — copying = extra discover from class deck
  '回收余韵',     // starter pool perm magic (unique) — copying = stacked recycle-bag round-trip + draw
  '回收灵焰',     // knight perm magic — copying = duplicate recycle/draw burst
  '影摹召引符',   // unique knight amulet — copying = double mirror-copy streak each draw
  '洗册归川',     // unique knight perm magic — copying = structural backpack/recycle thrash
].sort();

/**
 * Names sourced from `generateKnightDeck` (i.e. NOT starter cards).
 * Recomputed from the master list so additions stay in one place.
 */
const KNIGHT_DECK_EXPECTED = EXPECTED_NON_COPYABLE_NAMES.filter(
  n => n !== '专属感召' && n !== '回收余韵',
);

describe('Knight deck nonCopyable-card snapshot', () => {
  it('exact set of nonCopyable cards in knight class deck matches expected list', () => {
    const [deck] = generateKnightDeck(createRng(0));
    const actualNames = deck
      .filter(c => c.nonCopyable === true)
      .map(c => c.name)
      .sort();

    // ⚠️ Stop before "fixing" this assertion:
    //   - If a card is missing from the actual list, someone deleted
    //     `nonCopyable: true,` from it — restore the line in `knightDeck.ts`
    //     (or `deck.ts` for starter cards).
    //   - If a card is extra, someone added a new nonCopyable card —
    //     extend `EXPECTED_NON_COPYABLE_NAMES` above and justify in the PR.
    //   - Do NOT silently update the expected array to make CI green.
    //
    // Starter cards (专属感召 / 回收余韵) are produced by `deck.ts` factories /
    // pool, NOT pushed into the knight deck — checked separately below.
    expect(actualNames).toEqual(KNIGHT_DECK_EXPECTED);
  });

  it('createStarterDiscoverClassToHandCard() produces a nonCopyable card (专属感召)', () => {
    const card = createStarterDiscoverClassToHandCard();
    expect(card.name).toBe('专属感召');
    expect(card.nonCopyable).toBe(true);
  });

  it('createStarterCardPool() exposes 回收余韵 with nonCopyable: true', () => {
    const pool = createStarterCardPool();
    const recycleEcho = pool.find(c => c.name === '回收余韵');
    expect(recycleEcho).toBeDefined();
    expect(recycleEcho!.nonCopyable).toBe(true);
  });

  it('createStarterCardPool() — exact set of nonCopyable starter-pool cards', () => {
    // Lock the starter pool's nonCopyable subset to a single card so any
    // accidental addition (e.g. someone marks 战斗鼓舞 nonCopyable in a
    // refactor) is caught immediately.
    const pool = createStarterCardPool();
    const names = pool
      .filter(c => c.nonCopyable === true)
      .map(c => c.name)
      .sort();
    expect(names).toEqual(['回收余韵']);
  });

  it('createMirrorCopySummonCard() does NOT mark 镜影摹形 itself as nonCopyable', () => {
    // The runtime-generated 镜影摹形 (mirror-copy spell) is the COPIER, not a
    // target — it has no reason to be nonCopyable. If someone accidentally
    // adds the flag, mirror-copy would refuse to copy itself (which is
    // mostly fine, but the design intent is "the listed cards are the only
    // nonCopyable ones"). Catch the drift early.
    const [card] = createMirrorCopySummonCard(createRng(0));
    expect(card.name).toBe('镜影摹形');
    expect(card.nonCopyable).toBeFalsy();
  });

  it('snapshot is deterministic across rng seeds', () => {
    // The flag is intrinsic to each card definition, not affected by
    // shuffle order. Verifying with multiple seeds catches accidental
    // coupling to rng state.
    for (const seed of [0, 42, 999]) {
      const [deck] = generateKnightDeck(createRng(seed));
      const names = deck.filter(c => c.nonCopyable === true).map(c => c.name).sort();
      expect(names).toEqual(KNIGHT_DECK_EXPECTED);
    }
  });

  it('non-nonCopyable cards do not have stray truthy values for the flag', () => {
    // Defensive: in TS `card.nonCopyable` is `boolean | undefined`. The
    // renderer/filter use `card.nonCopyable === true` (or coerce via `!`),
    // but if anyone introduces `nonCopyable: 1` / `nonCopyable: 'true'`
    // by typo, this catches it.
    const [deck] = generateKnightDeck(createRng(0));
    for (const card of deck) {
      if ('nonCopyable' in card && (card as any).nonCopyable !== undefined) {
        expect((card as any).nonCopyable).toBe(true);
      }
    }
    // Same for starter pool.
    for (const card of createStarterCardPool()) {
      if ('nonCopyable' in card && (card as any).nonCopyable !== undefined) {
        expect((card as any).nonCopyable).toBe(true);
      }
    }
  });
});
