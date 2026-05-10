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

/**
 * Prefix registry for parameterized on-enter-hand effect ids (e.g. `add-bolt-bp:N`).
 * Keys are the literal prefix INCLUDING trailing colon (e.g. `'add-bolt-bp:'`).
 * Looked up after exact-match fails. Mirrors `on-equip.ts:prefixRegistry`.
 */
const prefixRegistry = new Map<string, OnEnterHandHandler>();

export function registerOnEnterHand(id: string, handler: OnEnterHandHandler): void {
  registry.set(id, handler);
}

export function registerOnEnterHandAll(entries: Array<{ id: string; handler: OnEnterHandHandler }>): void {
  for (const { id, handler } of entries) {
    registry.set(id, handler);
  }
}

/**
 * Register a handler keyed by id prefix (e.g. `'add-bolt-bp:'`). The effect id
 * `'add-bolt-bp:N'` will dispatch here when no exact-match handler exists.
 */
export function registerOnEnterHandPrefix(prefix: string, handler: OnEnterHandHandler): void {
  prefixRegistry.set(prefix, handler);
}

/**
 * Look up and execute an on-enter-hand effect. Returns true if a handler was found.
 * Resolution order: exact match → prefix match.
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

  let handler = registry.get(effectId);
  if (!handler) {
    prefixRegistry.forEach((prefixHandler, prefix) => {
      if (!handler && effectId.startsWith(prefix)) {
        handler = prefixHandler;
      }
    });
  }
  if (!handler) {
    console.warn('[on-enter-hand] no handler registered for', effectId, 'on card', card.id);
    return false;
  }

  // Trace fire — pairs with `[on-enter-hand] enqueue` traces from
  // `postProcessHandEntries`. If a card shows up in a bug report as
  // "drawn but on-hand effect didn't fire", a missing fire trace next to
  // a present enqueue trace pinpoints the lost-trigger scenario (most
  // likely cause: pipeline overflow + undo wiping `state.actionQueue`).
  // See `docs/auto-draw-debug.md` "Round 4".
  console.debug('[on-enter-hand] fire', { effectId, cardId: card.id, cardName: card.name });
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
    case 'stun-cap-bonus-2':
      return '上手：+2% 击晕上限';
    case 'on-hand-heal-1':
      return '上手：+1 生命';
    case 'event-grant-onhand-temp-armor-1':
      return '上手：随机一栏 +1 临护甲';
    default:
      // 「奥能裂变」outcome 3 — `add-bolt-bp:N` parameterized prefix label.
      if (effectId.startsWith('add-bolt-bp:')) {
        const n = parseInt(effectId.replace('add-bolt-bp:', ''), 10) || 1;
        return `上手：背包 +${n} 「魔弹」`;
      }
      return null;
  }
}
