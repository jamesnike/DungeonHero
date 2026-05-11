/**
 * Knight Deck Unique-Card Snapshot — exact-set assertion of which cards in
 * the knight class deck carry `unique: true`.
 *
 * This is a "red-line" data snapshot (rule:
 * `card-data-to-ui-tag-coverage.mdc`). It is intentionally a strict equality
 * check on the SORTED set of unique card names, not a count or `toContain`.
 *
 * Why this test exists:
 *
 *   `5091261 ea version 1.2.7` silently dropped `unique: true` from 12 cards
 *   while adding a big new mine/thunder system. The 13 new tests in that
 *   commit all passed, the existing `unique-class-card-lock.test.ts` (which
 *   tests lock LOGIC) also passed, and the regression only surfaced when a
 *   player opened the class-deck modal and saw the badge missing on every
 *   formerly-unique card.
 *
 *   This test would have failed immediately, with each missing name
 *   pinpointed by the `toEqual` diff, before the commit ever landed.
 *
 * Maintenance contract:
 *
 *   When adding a new unique class card → expand the `EXPECTED_UNIQUE_NAMES`
 *   array. When deliberately removing the unique tag from a card (e.g.
 *   "X is now allowed in multiple copies") → remove the name. Any change
 *   to this array MUST be justified in the PR description so reviewers can
 *   verify the design intent matches.
 *
 *   Do NOT replace `toEqual` with `toContain`, `toHaveLength`, or
 *   `toMatchSnapshot()` — those let breakage slip through (count stays the
 *   same when one card is swapped for another; auto-snapshot updates on
 *   `-u` defeat the purpose).
 */

import { describe, expect, it } from 'vitest';
import { generateKnightDeck } from '@/lib/knightDeck';
import { createRng } from '../rng';

/**
 * Sorted list of every card name in the knight class deck that should carry
 * `unique: true`. Sorted alphabetically (by JS string compare) so this array
 * minimises merge conflicts when adding/removing cards.
 *
 * Last reviewed: 2026-05-09 (regression repair after `5091261 ea version 1.2.7`).
 */
const EXPECTED_UNIQUE_NAMES = [
  '利刃风暴',
  '回收灵焰',
  '回炉重造',
  '固壁侧守',
  '圣光秘术',
  '复生秘典',
  '墓园守卫',
  '影摹召引符',
  '弹幕护盾',
  '战狂诅咒',
  '永恒之器',
  '殒雷符',
  '洗册归川',
  '灭世裁决',
  '狂战秘典',
  '紧急回收',
  '蓄能裂击',
  '装备超频药',
  '连环转律',
].sort();

describe('Knight deck unique-card snapshot', () => {
  it('exact set of unique class cards matches expected list', () => {
    const [deck] = generateKnightDeck(createRng(0));
    const actualUniqueNames = deck
      .filter(c => c.unique === true)
      .map(c => c.name)
      .sort();

    // ⚠️ Stop before "fixing" this assertion:
    //   - If a card is missing from `actualUniqueNames`, someone deleted
    //     `unique: true,` from it — restore the line in `knightDeck.ts`.
    //   - If a card is extra, someone added a new unique card — extend
    //     `EXPECTED_UNIQUE_NAMES` above and justify in the PR.
    //   - Do NOT silently update the expected array to make CI green.
    expect(actualUniqueNames).toEqual(EXPECTED_UNIQUE_NAMES);
  });

  it('every unique card is also a class card', () => {
    // Business invariant: `unique` only makes sense for class-pool cards
    // (the lock keyed by `getStarterBaseId` only fires when the card is
    // sampled from the infinite class template). A unique non-class card
    // would silently never lock, defeating the design.
    const [deck] = generateKnightDeck(createRng(0));
    const violations = deck
      .filter(c => c.unique === true && c.classCard !== true)
      .map(c => c.name);
    expect(violations).toEqual([]);
  });

  it('snapshot is deterministic across rng seeds', () => {
    // The unique tag is intrinsic to each card definition, not affected by
    // shuffle order or counter assignment. Verifying with multiple seeds
    // catches accidental coupling to rng state.
    const [d1] = generateKnightDeck(createRng(0));
    const [d2] = generateKnightDeck(createRng(42));
    const [d3] = generateKnightDeck(createRng(999));

    const names = (d: typeof d1) => d.filter(c => c.unique === true).map(c => c.name).sort();

    expect(names(d1)).toEqual(EXPECTED_UNIQUE_NAMES);
    expect(names(d2)).toEqual(EXPECTED_UNIQUE_NAMES);
    expect(names(d3)).toEqual(EXPECTED_UNIQUE_NAMES);
  });

  it('non-unique class cards do not have the unique flag stuck to undefined leaking truthy', () => {
    // Defensive: in TS `card.unique` is `boolean | undefined`. The renderer
    // uses `card.unique === true` (not just `card.unique`) but if anyone
    // ever introduces a stray `unique: 1` / `unique: 'true'` / `unique: {}`
    // by typo, this catches it.
    const [deck] = generateKnightDeck(createRng(0));
    for (const card of deck) {
      if ('unique' in card && card.unique !== undefined) {
        expect(card.unique).toBe(true);
      }
    }
  });
});
