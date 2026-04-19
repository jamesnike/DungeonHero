/**
 * On-Enter-Hand Effect Registry (上手 keyword)
 *
 * Handles effects that trigger when a card enters the hand from any source
 * EXCEPT: initial deal, clone/copy effects, or any path that explicitly
 * marks the card with `_skipOnEnterHand: true`.
 *
 * Trigger detection happens in the reducer's post-processing layer (see
 * `postProcessHandEntries` in `reducer.ts`), which compares the previous and
 * next handCards by id. Newly-added cards with `onEnterHandEffect` set and
 * without `_skipOnEnterHand` flag enqueue a `TRIGGER_ON_ENTER_HAND` action.
 *
 * The handler signature mirrors `OnEquipHandler` — handlers mutate the patch
 * / sideEffects / enqueuedActions, never the state directly.
 */

import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { SideEffect } from '../reducer';
import type { GameCardData } from '@/components/GameCard';

export type OnEnterHandHandler = (
  state: GameState,
  card: GameCardData,
  patch: Partial<GameState>,
  sideEffects: SideEffect[],
  enqueuedActions: GameAction[],
) => void;

const registry = new Map<string, OnEnterHandHandler>();

export function registerOnEnterHand(id: string, handler: OnEnterHandHandler): void {
  registry.set(id, handler);
}

export function registerOnEnterHandAll(entries: Array<{ id: string; handler: OnEnterHandHandler }>): void {
  for (const { id, handler } of entries) {
    registry.set(id, handler);
  }
}

/**
 * Look up and execute an on-enter-hand effect. Returns true if a handler was found.
 */
export function executeOnEnterHand(
  state: GameState,
  card: GameCardData,
  patch: Partial<GameState>,
  sideEffects: SideEffect[],
  enqueuedActions: GameAction[],
): boolean {
  const effectId = card.onEnterHandEffect;
  if (!effectId) return false;

  const handler = registry.get(effectId);
  if (!handler) return false;

  handler(state, card, patch, sideEffects, enqueuedActions);
  return true;
}

export function getOnEnterHandRegistrySize(): number {
  return registry.size;
}

/**
 * UI helper: short label shown in the 「上手」 keyword tag on cards.
 * Returns a brief Chinese summary of what triggers when the card enters hand.
 *
 * Returns `null` if the card has no `onEnterHandEffect` set, or if the effect
 * id is unknown (renderers should fall back to hiding the tag in that case).
 *
 * Keep these strings short — they appear inside a small pill-shaped tag in
 * `GameCard.tsx`. Detailed wording belongs in the card's `description` /
 * `shortDescription`.
 */
export function getOnEnterHandShortLabel(card: GameCardData): string | null {
  const effectId = card.onEnterHandEffect;
  if (!effectId) return null;
  switch (effectId) {
    case 'weapon-manual-onhand':
      return '上手：随机一栏 +2 临时攻';
    case 'blood-oath-scroll-onhand':
      return '上手：+1 生命';
    case 'survey-action-onhand': {
      const buffByLevel = [1, 2];
      const bonus = buffByLevel[card.upgradeLevel ?? 0] ?? 1;
      return `上手：随机一栏 +${bonus} 临时攻`;
    }
    case 'three-card-thunder-onhand':
      return '上手：全场 1 法伤';
    case 'frenzy-curse-onhand':
      return '上手：随机一栏 +1 临时攻';
    case 'growth-blade-onhand':
      return '上手：同名 +2 攻击';
    case 'stun-cap-bonus-3':
      return '上手：+3% 击晕上限';
    default:
      return null;
  }
}
