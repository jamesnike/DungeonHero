/**
 * Custom Handlers — escape hatch for potion effects too complex to express
 * declaratively in the CardEffect pipeline.
 *
 * These will be refactored into proper CardEffect primitives over time.
 */

import type { ExecutionContext } from './types';
import type { GameCardData } from '@/components/GameCard';
import type { EquipmentRepairTarget } from '@/components/game-board/types';
import { HAND_LIMIT } from '../constants';
import { drawMultipleFromBackpack } from '../cards';
import type { GameState } from '../types';
import { formatRepairTargetLabel } from '../helpers';

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function log(ctx: ExecutionContext, type: string, message: string) {
  ctx.sideEffects.push({ event: 'log:entry', payload: { type, message } });
}

function banner(ctx: ExecutionContext, text: string) {
  ctx.sideEffects.push({ event: 'ui:banner', payload: { text } });
}

// ---------------------------------------------------------------------------
// Registry of custom handlers
// ---------------------------------------------------------------------------

type CustomHandler = (ctx: ExecutionContext) => void;

const customHandlers = new Map<string, CustomHandler>();

export function registerCustomHandler(id: string, handler: CustomHandler): void {
  customHandlers.set(id, handler);
}

export function getCustomHandler(id: string): CustomHandler | undefined {
  return customHandlers.get(id);
}

// ---------------------------------------------------------------------------
// draw-backpack-4: +1 backpack, +1 hand limit, draw up to 5
// ---------------------------------------------------------------------------

registerCustomHandler('potion:draw-backpack-4', (ctx) => {
  const card = ctx.card;
  ctx.patch.backpackCapacityModifier = (ctx.state.backpackCapacityModifier ?? 0) + 1;
  ctx.patch.handLimitBonus = (ctx.state.handLimitBonus ?? 0) + 1;
  const newHandLimit = HAND_LIMIT + (ctx.state.handLimitBonus ?? 0) + 1;
  const currentHandSize = ctx.state.handCards.filter(c => c.id !== card.id).length;
  const maxDraws = Math.min(5, newHandLimit - currentHandSize);

  if (maxDraws > 0) {
    const mergedState = { ...ctx.state, ...ctx.patch } as GameState;
    const { cards: drawn, patch: drawPatch } = drawMultipleFromBackpack(mergedState, maxDraws);
    if (drawn.length > 0) {
      Object.assign(ctx.patch, drawPatch);
      for (const d of drawn) {
        ctx.sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: d.id, source: 'backpack' } });
      }
      const parts: string[] = [];
      parts.push(`从背包抽出${drawn.length}张牌`);
      parts.push('背包上限 +1', '手牌上限 +1');
      log(ctx, 'potion', `药水效果：${parts.join('，')}`);
      banner(ctx, parts.join('，') + '。');
    } else {
      log(ctx, 'potion', '药水效果：背包上限 +1，手牌上限 +1');
      banner(ctx, '背包上限 +1，手牌上限 +1。');
    }
  } else {
    log(ctx, 'potion', '药水效果：背包上限 +1，手牌上限 +1');
    banner(ctx, '背包上限 +1，手牌上限 +1。');
  }

  ctx.enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
});

// ---------------------------------------------------------------------------
// repair-choice: repair or upgrade equipment
// ---------------------------------------------------------------------------

registerCustomHandler('potion:repair-choice', (ctx) => {
  const card = ctx.card;
  const allowedTypes: EquipmentRepairTarget[] = ['weapon', 'shield', 'monster'];

  const matchingSlots: Array<{ id: 'equipmentSlot1' | 'equipmentSlot2'; item: GameCardData }> = [];
  for (const slotId of ['equipmentSlot1', 'equipmentSlot2'] as const) {
    const item = ctx.state[slotId] as GameCardData | null;
    if (item && allowedTypes.includes(item.type as EquipmentRepairTarget)) {
      matchingSlots.push({ id: slotId, item });
    }
  }

  if (matchingSlots.length === 0) {
    banner(ctx, '没有装备武器或护盾，药剂失效。');
    ctx.enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return;
  }

  ctx.patch.pendingPotionAction = {
    card,
    effect: 'repair-choice' as any,
    step: 'choice' as any,
    prompt: '选择修复剂效果',
  };
  ctx.patch.heroSkillBanner = '选择修复剂效果';
});

// ---------------------------------------------------------------------------
// repair (generic): delegates to UI via side effects
// ---------------------------------------------------------------------------

registerCustomHandler('potion:repair', (ctx) => {
  const card = ctx.card;
  ctx.sideEffects.push({ event: 'card:potionRepair' as any, payload: { card, amount: card.value } });
  ctx.sideEffects.push({ event: 'card:potionResolved' as any, payload: { card } });
});
