/**
 * On-Upgrade Effect Registry
 *
 * Handles per-card upgrade transformations triggered by UPGRADE_CARD.
 * Mirrors `on-equip.ts`: cards register a handler keyed by an upgrade
 * effect id derived from card identity (monster type, starter base id,
 * amuletEffect, knightEffect).
 *
 * Handlers receive a mutable `upgraded` copy whose `upgradeLevel` is
 * already set to `newLevel` and mutate fields in place
 * (description, magicEffect, value, durability, recycleDelay, etc.).
 */

import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import { getStarterBaseId } from '../deck';

export type OnUpgradeHandler = (
  upgraded: GameCardData,
  newLevel: number,
  state: GameState,
) => void;

const registry = new Map<string, OnUpgradeHandler>();

export function registerOnUpgrade(id: string, handler: OnUpgradeHandler): void {
  registry.set(id, handler);
}

export function registerOnUpgradeAll(entries: Array<{ id: string; handler: OnUpgradeHandler }>): void {
  for (const { id, handler } of entries) {
    registry.set(id, handler);
  }
}

/**
 * Map a card's identity to a canonical upgrade effect id.
 *
 * Priority order:
 *   1. card.type === 'monster'                              → 'monster:default'
 *   2. starter base id (only if a handler is registered)    → 'starter:{id}'
 *   3. knightEffect                                         → 'knight:{ke}'
 *   4. amuletEffect                                         → 'amulet:{ae}'
 *
 * Important: starter takes precedence ONLY when a handler is actually
 * registered for that starter id. This is because `getStarterBaseId`
 * always returns a non-empty string (e.g. `'knight-3'` for a knight card
 * passes through unchanged), so without the registry check, the starter
 * branch would short-circuit unconditionally and every `knight:*` /
 * `amulet:*` handler would become dead code. The registry check lets
 * non-starter cards (knight class cards, runtime-upgraded amulets, etc.)
 * fall through to their own routing branch.
 *
 * Why "starter preferred over amulet" matters: many starter cards are
 * themselves amulets and carry both a starter base id AND an `amuletEffect`
 * (e.g. lone-card-amulet, attack-persuade-amulet). Their upgrade handlers
 * are registered under `starter:{id}`, NOT under `amulet:{ae}`. Routing
 * starter first preserves their existing behavior.
 */
export function resolveUpgradeEffectId(card: GameCardData): string | null {
  if (card.type === 'monster') return 'monster:default';

  const starterId = getStarterBaseId(card.id);
  if (starterId && registry.has(`starter:${starterId}`)) {
    return `starter:${starterId}`;
  }

  const ke = (card as any).knightEffect as string | undefined;
  if (ke) return `knight:${ke}`;

  const ae = (card as any).amuletEffect as string | undefined;
  if (ae) return `amulet:${ae}`;

  return null;
}

/**
 * Look up and execute an upgrade handler. Returns true if a handler ran.
 * Cards without a registered upgrade behavior are no-ops (only `upgradeLevel`
 * is incremented by the caller).
 */
export function executeOnUpgrade(
  upgraded: GameCardData,
  newLevel: number,
  state: GameState,
): boolean {
  const id = resolveUpgradeEffectId(upgraded);
  if (!id) return false;

  const handler = registry.get(id);
  if (!handler) return false;

  handler(upgraded, newLevel, state);
  return true;
}

export function getOnUpgradeRegistrySize(): number {
  return registry.size;
}
