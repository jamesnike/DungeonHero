/**
 * Card Registry — maps effectId strings to CardDefinition objects.
 *
 * resolveEffectId bridges the legacy dispatch keys (potionEffect,
 * magicEffect, knightEffect, heroMagicId, card.name) to a single
 * canonical effectId used for lookup.
 */

import type { GameCardData } from '@/components/GameCard';
import type { CardDefinition } from './types';
import { getStarterBaseId } from '../deck';

const registry = new Map<string, CardDefinition>();

export function registerCard(def: CardDefinition): void {
  if (registry.has(def.effectId)) {
    console.warn(`[card-registry] Duplicate effectId: ${def.effectId}`);
  }
  registry.set(def.effectId, def);
}

export function registerCards(defs: CardDefinition[]): void {
  for (const def of defs) {
    registerCard(def);
  }
}

export function getCardDefinition(card: GameCardData): CardDefinition | null {
  const id = resolveEffectId(card);
  if (id) {
    const def = registry.get(id);
    if (def) return def;
  }

  // Fallback chain for magic cards when primary effectId (e.g. starter:xxx) doesn't match
  if (card.type === 'magic' || card.type === 'skill') {
    if (card.name) {
      const nameDef = registry.get(`card:${card.name}`);
      if (nameDef) return nameDef;
    }
    if ((card as any).scalingDamage != null) {
      const scalingDef = registry.get('magic:scaling-damage');
      if (scalingDef) return scalingDef;
    }
  }

  return null;
}

export function getCardDefinitionById(effectId: string): CardDefinition | null {
  return registry.get(effectId) ?? null;
}

export function hasCardDefinition(card: GameCardData): boolean {
  const id = resolveEffectId(card);
  return id ? registry.has(id) : false;
}

/**
 * Map a card's legacy dispatch keys to a canonical effectId.
 *
 * Priority order (mirrors routing in magic-effects.ts):
 *   1. potionEffect → "potion:{potionEffect}"
 *   2. hero-magic   → "hero-magic:{heroMagicId}" or "hero-magic:generic"
 *   3. knightEffect → "knight:{knightEffect}"
 *   4. magicEffect  → "magic:{magicEffect}"
 *   5. starterBaseId → "starter:{starterId}"
 *   6. card.name    → "card:{name}"
 *   7. scalingDamage → "magic:scaling-damage"
 *
 * For potions with no potionEffect, returns "potion:heal" (default heal).
 */
export function resolveEffectId(card: GameCardData): string | null {
  if (card.type === 'potion') {
    const pe = card.potionEffect as string | undefined;
    return pe ? `potion:${pe}` : 'potion:heal';
  }

  if (card.type === 'hero-magic') {
    const hm = card.heroMagicId as string | undefined;
    return hm ? `hero-magic:${hm}` : 'hero-magic:generic';
  }

  const ke = (card as any).knightEffect as string | undefined;
  if (ke) return `knight:${ke}`;

  if (card.magicEffect) return `magic:${card.magicEffect}`;

  if (card.type === 'magic') {
    const starterId = getStarterBaseId(card.id);
    if (starterId) return `starter:${starterId}`;
  }

  if (card.type === 'magic' || card.type === 'skill') {
    return `card:${card.name}`;
  }

  if ((card as any).scalingDamage != null) {
    return 'magic:scaling-damage';
  }

  return null;
}

/** For testing / inspection. */
export function getRegistrySize(): number {
  return registry.size;
}

export function getAllRegisteredIds(): string[] {
  return Array.from(registry.keys());
}
