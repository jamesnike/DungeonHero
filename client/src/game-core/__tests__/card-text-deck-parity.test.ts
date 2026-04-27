/**
 * Card text formatter — deck-construction wiring smoke test.
 *
 * Phase 3 of the derived-card-text plan made the formatter the source of
 * truth for `description` / `shortDescription` / `magicEffect` at deck
 * construction time: every deck-building helper (`createDeck`,
 * `createStarterCardPool`, `generateKnightDeck`, plus standalone factories)
 * runs each card through `applyDerivedCardText` before returning, so any
 * card whose effect id has a registered formatter ends up with text the
 * formatter computed (not whatever literal happened to be in the source).
 *
 * This test guards two pieces of that contract:
 *
 *   1. The formatter registry is populated by the time deck construction
 *      runs (catches future regressions like a circular import that ends up
 *      with an empty registry — the tautology of `card.description ===
 *      formatter(card).description` would silently still hold, but
 *      `covered.length === 0` would surface it loudly here).
 *
 *   2. For every covered card, the constructed card's text fields agree
 *      with the formatter output at the card's actual `upgradeLevel`. This
 *      mostly fails closed: if `applyDerivedCardText` ever returns
 *      something other than the formatter output, the disagreement shows
 *      up here with a precise card-id breakdown.
 *
 * It does NOT check the raw source-code literal vs. formatter — that would
 * require source parsing or a bypass flag. The Phase 1 test
 * `card-text-formatter.test.ts` is the canonical source-of-truth check for
 * each individual formatter's output.
 */

import { describe, expect, it } from 'vitest';
import type { GameCardData } from '@/components/GameCard';
import { createRng } from '../rng';
import { createDeck, createStarterCardPool, createCrimsonVoidSwapMagic } from '../deck';
import {
  generateKnightDeck,
  createGraveyardRecallCard,
  createPersuadeRecycleFetchMagicCard,
} from '@/lib/knightDeck';

// Side-effect imports: register all upgrade handlers + card-text formatters.
import '../card-schema';
import '../cardUpgrade';

import { computeCardText, resolveCardTextId } from '../card-schema/card-text';

interface ParityCase {
  source: string;
  card: GameCardData;
}

function collectCards(): ParityCase[] {
  const cases: ParityCase[] = [];
  let rng = createRng(123);

  const [deck, rngAfterDeck] = createDeck('normal', rng);
  rng = rngAfterDeck;
  for (const card of deck) cases.push({ source: 'createDeck', card });

  for (const card of createStarterCardPool()) {
    cases.push({ source: 'createStarterCardPool', card });
  }

  const [knightDeck, rngAfterKnight] = generateKnightDeck(rng);
  rng = rngAfterKnight;
  for (const card of knightDeck) cases.push({ source: 'generateKnightDeck', card });

  const [graveyardRecall, rngAfterGr] = createGraveyardRecallCard(rng);
  rng = rngAfterGr;
  cases.push({ source: 'createGraveyardRecallCard', card: graveyardRecall });

  const [persuadeFetch, rngAfterPf] = createPersuadeRecycleFetchMagicCard(rng);
  rng = rngAfterPf;
  cases.push({ source: 'createPersuadeRecycleFetchMagicCard', card: persuadeFetch });

  const [voidSwap] = createCrimsonVoidSwapMagic(rng);
  cases.push({ source: 'createCrimsonVoidSwapMagic', card: voidSwap });

  return cases;
}

describe('card text formatter — deck construction wiring', () => {
  const cases = collectCards();
  const covered = cases.filter(({ card }) => {
    const id = resolveCardTextId(card);
    return id != null && computeCardText(card) != null;
  });

  it('formatter registry is populated when deck construction runs', () => {
    // A safe lower bound: we know there are far more than 20 cards covered
    // (the registry has ~75 entries today), but pin a conservative floor so
    // the test fails loudly if registration silently regressed (e.g. by a
    // circular import) instead of being tautologically green.
    expect(covered.length).toBeGreaterThan(20);
  });

  it('formatter coverage spans both starter pool and knight pool', () => {
    // Per the plan, monster cards in `createDeck` are intentionally out of
    // scope (their stat numbers come from `card.attack` / `card.hp` /
    // `card.durability` directly, not from a formatter). Coverage is
    // expected on the two pools that do carry starter / knight / amulet
    // effect ids.
    const sources = new Set(covered.map(c => c.source));
    expect(sources.has('createStarterCardPool')).toBe(true);
    expect(sources.has('generateKnightDeck')).toBe(true);
  });

  it('constructed card text agrees with the formatter output at its declared upgradeLevel', () => {
    const mismatches: Array<{
      source: string;
      cardId: string;
      cardName: string;
      formatterId: string;
      field: 'description' | 'shortDescription' | 'magicEffect';
      formatter: string | undefined;
      constructed: string | undefined;
    }> = [];

    for (const { source, card } of cases) {
      const formatterId = resolveCardTextId(card);
      if (!formatterId) continue;

      const text = computeCardText(card);
      if (!text) continue;

      const fields: Array<'description' | 'shortDescription' | 'magicEffect'> = [
        'description',
        'shortDescription',
        'magicEffect',
      ];
      for (const field of fields) {
        const formatter = text[field];
        if (formatter === undefined) continue;
        const constructed = (card as Record<string, unknown>)[field] as string | undefined;
        if (formatter !== constructed) {
          mismatches.push({
            source,
            cardId: card.id,
            cardName: card.name,
            formatterId,
            field,
            formatter,
            constructed,
          });
        }
      }
    }

    if (mismatches.length > 0) {
      const lines = mismatches.map(
        m =>
          `  • [${m.source}] "${m.cardName}" (${m.cardId}, formatter=${m.formatterId})\n` +
          `      field: ${m.field}\n` +
          `      formatter:    ${JSON.stringify(m.formatter)}\n` +
          `      constructed:  ${JSON.stringify(m.constructed)}`,
      );
      throw new Error(
        `Found ${mismatches.length} card(s) where the constructed card disagreed ` +
          `with the registered formatter:\n${lines.join('\n')}\n\n` +
          `applyDerivedCardText is supposed to overwrite these fields with the ` +
          `formatter output during deck construction. If it didn't, either the ` +
          `formatter is misregistered or applyDerivedCardText skipped the field.`,
      );
    }

    expect(mismatches).toEqual([]);
  });
});
