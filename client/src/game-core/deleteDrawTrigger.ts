/**
 * 招灵书印 (delete-draw amulet) — destruction-trigger helper.
 *
 * Background:
 * `招灵书印` historically only fired through the `delete` keyword on
 * `CONFIRM_DELETE_CARD` / `DELETE_CARD` (shop / 净册涌泉 etc.) — a narrow path
 * that excluded the much more common 「破坏卡」semantic where Events / 魔法 /
 * 瀑流 forcibly destroy amulets or equipment.
 *
 * Per design (rule: delete-draw triggers on destruction):
 *   - "destruction" = an effect forcibly removes a card from active play
 *     (Event 摧毁护符 / 摧毁装备, 灭世裁决, 弃装重铸, 幽魂瀑流 destroy-amulets,
 *     destroyEquipment:any, etc.). Natural durability decay in combat does
 *     NOT count.
 *   - For each destruction event, fire `招灵书印`:
 *       drawCount = N × (2 × M)
 *     where:
 *       N = number of cards destroyed in this event,
 *           **excluding** any 招灵书印 itself in the destroy list (self-exclude)
 *       M = surviving 招灵书印 amulet count (post-destruction snapshot).
 *           A 招灵书印 destroyed in this event cannot fire its own ability.
 *
 * Caller contract:
 *   - Pass the cards that are actually being destroyed in `destroyedCards`
 *     (revived equipment is NOT destroyed → exclude from this list).
 *   - Pass the post-destruction surviving amulet slots in `survivingAmuletSlots`.
 *     For equipment-only destruction, this is just `state.amuletSlots`.
 *     For amulet-destruction paths, this is `state.amuletSlots` minus the
 *     destroyed amulet cards.
 *   - The helper pushes one `DRAW_CARDS` action and one log entry on trigger.
 */

import type { GameCardData } from '@/components/GameCard';
import type { GameAction } from './actions';
import type { SideEffect } from './reducer';

function isDeleteDrawAmulet(card: GameCardData): boolean {
  return card?.type === 'amulet' && (card as any)?.amuletEffect === 'delete-draw';
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
  // (and its own destruction does NOT generate a draw).
  const nonSelfDestroyed = destroyedCards.filter(c => !isDeleteDrawAmulet(c));
  const N = nonSelfDestroyed.length;
  if (N === 0) return;

  // Surviving 招灵书印 count is the multiplier. A 招灵书印 destroyed in
  // this same event has no chance to fire its own draw.
  const M = survivingAmuletSlots.filter(isDeleteDrawAmulet).length;
  if (M === 0) return;

  const drawCount = N * 2 * M;
  if (drawCount <= 0) return;

  enqueuedActions.push({ type: 'DRAW_CARDS', count: drawCount, source: 'backpack' });
  sideEffects.push({
    event: 'log:entry',
    payload: {
      type: 'amulet',
      message: `招灵书印：${reasonLabel}（${N} 张），从背包抽 ${drawCount} 张牌`,
    },
  });
}
