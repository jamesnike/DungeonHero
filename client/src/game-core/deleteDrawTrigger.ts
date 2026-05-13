/**
 * 招灵书印 (`amuletEffect: 'delete-draw'`) — trigger helper.
 *
 * Effect (current design):
 *   For every card the trigger fires on, both equipment slots gain
 *   `+1 temp attack`, `+1 temp armor`, and the player gains `+2 gold`.
 *   Stacks linearly (`amulet-stacking-design.mdc`, Linear ×N category):
 *   with M 招灵书印 equipped + N triggering events, total procs = `N × M`,
 *   producing `+procs / +procs / +2×procs` to both slots / both slots / gold.
 *
 * (The effect id `delete-draw` is the legacy name from when the amulet drew
 *  cards from the backpack on delete — kept for save-compat. The current
 *  effect no longer draws cards.)
 *
 * Two trigger paths:
 *   1. **Destruction** (this file's `maybeTriggerDeleteDrawForDestroy`):
 *      Event 摧毁护符 / 摧毁装备, 灭世裁决, 弃装重铸, 幽魂瀑流 destroy-amulets,
 *      destroyEquipment:any, etc. Natural durability decay in combat does
 *      NOT count.
 *   2. **「删除」keyword** (inline in `rules/cards.ts:reduceDeleteCard` and
 *      `rules/shop.ts:reduceConfirmDeleteCard`): shop / event card deletion
 *      via `CONFIRM_DELETE_CARD` / `DELETE_CARD` with `kw === 'delete'`.
 *
 * Self-exclude rule (destruction path only): a 招灵书印 in the destroy list
 * does NOT count toward N, and a 招灵书印 destroyed in the same event has no
 * chance to fire its own proc (M is the post-destruction surviving count).
 *
 * Caller contract:
 *   - Pass the cards being destroyed in `destroyedCards`
 *     (revived equipment is NOT destroyed → exclude from this list).
 *   - Pass post-destruction surviving amulet slots in `survivingAmuletSlots`.
 *     For equipment-only destruction, this is just `state.amuletSlots`.
 *     For amulet-destruction paths, this is `state.amuletSlots` minus the
 *     destroyed amulet cards.
 *   - The helper pushes the proc actions
 *     (`MODIFY_SLOT_TEMP_ATTACK` ×2, `MODIFY_SLOT_TEMP_ARMOR` ×2,
 *     `MODIFY_GOLD` ×1) and a single log entry on trigger.
 */

import type { GameCardData } from '@/components/GameCard';
import type { GameAction } from './actions';
import type { SideEffect } from './reducer';

function isDeleteDrawAmulet(card: GameCardData): boolean {
  return card?.type === 'amulet' && (card as any)?.amuletEffect === 'delete-draw';
}

/**
 * Enqueue the proc actions for `totalProcs` 招灵书印 fires.
 *
 * Per proc: both slots +1 temp attack, both slots +1 temp armor, gold +2.
 * Batched as a single MODIFY_* per slot/field with `delta = totalProcs`.
 *
 * `MODIFY_SLOT_TEMP_ARMOR` is the canonical entry for slot temp armor —
 * its reducer calls `applySlotArmorBonusDelta` so the armor cap moves in
 * lockstep with `slotTempArmor` (single-counter armor model,
 * `shield-armor-vs-durability.mdc`). Do not bypass this action to mutate
 * `slotTempArmor` directly here.
 */
export function enqueueSoulSealProcs(args: {
  totalProcs: number;
  enqueuedActions: GameAction[];
  sideEffects: SideEffect[];
  logMessage: string;
}): void {
  const { totalProcs, enqueuedActions, sideEffects, logMessage } = args;
  if (totalProcs <= 0) return;

  enqueuedActions.push({ type: 'MODIFY_SLOT_TEMP_ATTACK', slotId: 'equipmentSlot1', delta: totalProcs });
  enqueuedActions.push({ type: 'MODIFY_SLOT_TEMP_ATTACK', slotId: 'equipmentSlot2', delta: totalProcs });
  enqueuedActions.push({ type: 'MODIFY_SLOT_TEMP_ARMOR', slotId: 'equipmentSlot1', delta: totalProcs });
  enqueuedActions.push({ type: 'MODIFY_SLOT_TEMP_ARMOR', slotId: 'equipmentSlot2', delta: totalProcs });
  enqueuedActions.push({
    type: 'MODIFY_GOLD',
    delta: totalProcs * 2,
    source: 'amulet:delete-draw',
  });

  sideEffects.push({
    event: 'log:entry',
    payload: {
      type: 'amulet',
      message: logMessage,
    },
  });
}

export function maybeTriggerDeleteDrawForDestroy(args: {
  destroyedCards: ReadonlyArray<GameCardData>;
  survivingAmuletSlots: ReadonlyArray<GameCardData>;
  sideEffects: SideEffect[];
  enqueuedActions: GameAction[];
  reasonLabel: string;
}): void {
  const { destroyedCards, survivingAmuletSlots, sideEffects, enqueuedActions, reasonLabel } = args;

  // Self-exclude: 招灵书印 in the destroy list does NOT count toward N
  // (and its own destruction does NOT generate a proc).
  const nonSelfDestroyed = destroyedCards.filter(c => !isDeleteDrawAmulet(c));
  const N = nonSelfDestroyed.length;
  if (N === 0) return;

  // Surviving 招灵书印 count is the multiplier. A 招灵书印 destroyed in
  // this same event has no chance to fire its own proc.
  const M = survivingAmuletSlots.filter(isDeleteDrawAmulet).length;
  if (M === 0) return;

  const totalProcs = N * M;
  const goldGain = totalProcs * 2;
  enqueueSoulSealProcs({
    totalProcs,
    enqueuedActions,
    sideEffects,
    logMessage: `招灵书印：${reasonLabel}（${N} 张），左右装备栏临时攻击+${totalProcs}/临时护甲+${totalProcs}，金币+${goldGain}`,
  });
}

/**
 * Trigger 招灵书印 on a single 「删除」keyword event
 * (CONFIRM_DELETE_CARD / DELETE_CARD with `kw === 'delete'`).
 *
 * The 「删除」keyword only targets player-chosen cards in shop / event modals
 * (hand / backpack / class deck) — never the equipped amulets themselves —
 * so there is no self-destruction concern. M is just the currently equipped
 * 招灵书印 count.
 *
 * @param cardLabel Name of the card being deleted (for log).
 * @param amuletCount Currently equipped 招灵书印 count (`ae.deleteDrawCount`).
 */
export function maybeTriggerDeleteDrawForDelete(args: {
  cardLabel: string;
  amuletCount: number;
  sideEffects: SideEffect[];
  enqueuedActions: GameAction[];
}): void {
  const { cardLabel, amuletCount, sideEffects, enqueuedActions } = args;
  if (amuletCount <= 0) return;

  const totalProcs = amuletCount;
  const goldGain = totalProcs * 2;
  enqueueSoulSealProcs({
    totalProcs,
    enqueuedActions,
    sideEffects,
    logMessage: `招灵书印：删除「${cardLabel}」，左右装备栏临时攻击+${totalProcs}/临时护甲+${totalProcs}，金币+${goldGain}`,
  });
}
