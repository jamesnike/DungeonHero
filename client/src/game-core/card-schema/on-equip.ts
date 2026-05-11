/**
 * On-Equip Effect Registry
 *
 * Handles effects that trigger when a weapon/shield is first equipped to a slot.
 * Separate from the main CardEffect pipeline because equip effects receive
 * slot-specific context (which slot the card was placed in).
 */

import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { SideEffect } from '../reducer';
import type { GameCardData } from '@/components/GameCard';
import type { EquipmentSlotId } from '@/components/game-board/types';
import { equipOverclockExtraTriggers } from '../rules/equipment-overclock';

export type OnEquipHandler = (
  state: GameState,
  card: GameCardData,
  slotId: EquipmentSlotId,
  patch: Partial<GameState>,
  sideEffects: SideEffect[],
  enqueuedActions: GameAction[],
) => void;

const registry = new Map<string, OnEquipHandler>();

/**
 * Prefix registry for parameterized on-equip effect ids (e.g. `spawn-mine:N`).
 * Keys are the literal prefix INCLUDING trailing colon (e.g. `'spawn-mine:'`).
 * Looked up after exact-match fails. This allows `card.onEquipEffect = 'spawn-mine:1'`
 * to dispatch to a single handler that parses its own parameter.
 */
const prefixRegistry = new Map<string, OnEquipHandler>();

export function registerOnEquip(id: string, handler: OnEquipHandler): void {
  registry.set(id, handler);
}

export function registerOnEquipAll(entries: Array<{ id: string; handler: OnEquipHandler }>): void {
  for (const { id, handler } of entries) {
    registry.set(id, handler);
  }
}

/**
 * Register a handler keyed by id prefix (e.g. `'spawn-mine:'`). The effect id
 * `'spawn-mine:N'` will dispatch here when no exact-match handler exists.
 */
export function registerOnEquipPrefix(prefix: string, handler: OnEquipHandler): void {
  prefixRegistry.set(prefix, handler);
}

/**
 * Look up and execute an on-equip effect. Returns true if a handler was found.
 * Resolution order: exact match → prefix match.
 */
export function executeOnEquip(
  state: GameState,
  card: GameCardData,
  slotId: EquipmentSlotId,
  patch: Partial<GameState>,
  sideEffects: SideEffect[],
  enqueuedActions: GameAction[],
): boolean {
  const effectId = (card as any).onEquipEffect as string | undefined;
  if (!effectId) return false;

  const handler = registry.get(effectId);
  if (handler) {
    handler(state, card, slotId, patch, sideEffects, enqueuedActions);
    // 永恒护符·装备超频 aura (stackable): fire onEquip handler N extra times
    // where N = count of `equip-overclock` relics held, when recycle bag > 15.
    // Reuses the same patch / sideEffects / enqueuedActions accumulators so
    // all derived side-effects multiply by (1 + N).
    const extra = equipOverclockExtraTriggers(state);
    for (let i = 0; i < extra; i++) {
      handler(state, card, slotId, patch, sideEffects, enqueuedActions);
    }
    if (extra > 0) {
      sideEffects.push({
        event: 'combat:equipOverclockTriggered',
        payload: { surface: 'onEquip', count: extra },
      });
    }
    return true;
  }

  let matchedPrefixHandler: OnEquipHandler | undefined;
  prefixRegistry.forEach((prefixHandler, prefix) => {
    if (!matchedPrefixHandler && effectId.startsWith(prefix)) {
      matchedPrefixHandler = prefixHandler;
    }
  });
  if (matchedPrefixHandler) {
    matchedPrefixHandler(state, card, slotId, patch, sideEffects, enqueuedActions);
    const extra = equipOverclockExtraTriggers(state);
    for (let i = 0; i < extra; i++) {
      matchedPrefixHandler(state, card, slotId, patch, sideEffects, enqueuedActions);
    }
    if (extra > 0) {
      sideEffects.push({
        event: 'combat:equipOverclockTriggered',
        payload: { surface: 'onEquip', count: extra },
      });
    }
    return true;
  }

  return false;
}

export function getOnEquipRegistrySize(): number {
  return registry.size + prefixRegistry.size;
}
