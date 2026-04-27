/**
 * Card Text Formatter Registry
 *
 * Derives a card's display strings (`description`, `shortDescription`,
 * `magicEffect`) from its current state — `upgradeLevel`, identity, and
 * optionally relevant `GameState` — instead of having every on-upgrade
 * handler imperatively rewrite those fields.
 *
 * The historical pattern was: each handler in
 * `card-schema/definitions/upgrades.ts` had to remember to `upgraded.description = ...`
 * after touching numeric fields. Cards that had `maxUpgradeLevel > 0` but no
 * registered handler at all (e.g. `怀柔令` `knight:persuade-discount`,
 * knight-class `紧急回收` `knight:recall-equipment`, `查阅动作`,
 * `锐意鼓舞`) only got `upgradeLevel++` — their UI text never refreshed.
 *
 * The derived layer fixes both shapes:
 *   - Cards with no handler get a formatter and now have correct upgraded text.
 *   - Cards with a handler can have the description-building moved into a
 *     formatter (Phase 2), shrinking the handler to numeric mutations only.
 *
 * Routing mirrors `on-upgrade.ts:resolveUpgradeEffectId`:
 *   1. monster                                              → 'monster:default'
 *   2. starter base id (only if a formatter is registered)  → 'starter:{id}'
 *   3. knightEffect                                         → 'knight:{ke}'
 *   4. amuletEffect                                         → 'amulet:{ae}'
 *
 * The "starter takes precedence ONLY if registered" rule is intentional and
 * matches `on-upgrade.ts`: many starter cards are themselves amulets and
 * carry both a starter base id AND an `amuletEffect`. Their formatters live
 * under `starter:{id}`, not `amulet:{ae}`. Routing starter first when
 * registered preserves that behavior; falling through when not registered
 * lets generic knight / amulet formatters apply to non-starter cards.
 */

import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import { getStarterBaseId } from '../deck';

export interface CardText {
  description?: string;
  shortDescription?: string;
  magicEffect?: string;
}

export type CardTextFormatter = (
  card: GameCardData,
  state?: GameState,
) => CardText | null;

const registry = new Map<string, CardTextFormatter>();

export function registerCardText(id: string, fn: CardTextFormatter): void {
  registry.set(id, fn);
}

export function registerCardTextAll(
  entries: Array<{ id: string; fn: CardTextFormatter }>,
): void {
  for (const { id, fn } of entries) {
    registry.set(id, fn);
  }
}

export function resolveCardTextId(card: GameCardData): string | null {
  if (card.type === 'monster') return 'monster:default';

  const starterId = getStarterBaseId(card.id);
  if (starterId && registry.has(`starter:${starterId}`)) {
    return `starter:${starterId}`;
  }

  const ke = (card as { knightEffect?: string }).knightEffect;
  if (ke) return `knight:${ke}`;

  const ae = (card as { amuletEffect?: string }).amuletEffect;
  if (ae) return `amulet:${ae}`;

  return null;
}

/**
 * Compute the display text for a card. Returns `null` when no formatter is
 * registered for the resolved id, leaving the caller free to keep whatever
 * description fields the card already had (e.g. the imperative text written
 * by an on-upgrade handler, or the static text from deck construction).
 */
export function computeCardText(
  card: GameCardData,
  state?: GameState,
): CardText | null {
  const id = resolveCardTextId(card);
  if (!id) return null;

  const fn = registry.get(id);
  if (!fn) return null;

  return fn(card, state);
}

/**
 * Apply derived card text to a single card. Returns a shallow copy with
 * `description` / `shortDescription` / `magicEffect` overwritten by the
 * registered formatter's output (only fields the formatter sets), or the
 * original card when no formatter is registered or the formatter returns
 * `null`.
 *
 * Used by deck construction (`createDeck`, `createStarterCardPool`,
 * `generateKnightDeck`, and a handful of standalone card factories) to make
 * formatter-derived text the single source of truth at level 0 — the same
 * way `applyUpgrade` overwrites text after each upgrade.
 */
export function applyDerivedCardText(
  card: GameCardData,
  state?: GameState,
): GameCardData {
  const text = computeCardText(card, state);
  if (!text) return card;
  const updated: GameCardData = { ...card };
  if (text.description !== undefined) updated.description = text.description;
  if (text.shortDescription !== undefined) updated.shortDescription = text.shortDescription;
  if (text.magicEffect !== undefined) updated.magicEffect = text.magicEffect;
  return updated;
}

export function getCardTextRegistrySize(): number {
  return registry.size;
}
