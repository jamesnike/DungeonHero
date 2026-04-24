/**
 * Card Execution Engine — processes a CardDefinition's effects pipeline.
 *
 * Entry points:
 *   - executeCardEffects(state, card) — generic (potions, etc.)
 *   - executeMagicCardEffects(state, card, target?) — magic/hero-magic
 *     with pre-processing (curse, counter, echo).
 *
 * If the card is not registered, returns null so the caller can fall back
 * to the legacy handler.
 */

import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ReduceResult, SideEffect } from '../reducer';
import { applyPatch } from '../reducer';
import type { GameCardData } from '@/components/GameCard';
import type { ExecutionContext, CardEffect, MagicContext } from './types';
import { getCardDefinition } from './registry';
import { getExecutor } from './executors';
import { getCustomHandler } from './custom-handlers';

/**
 * Try to execute a card via the card-schema engine (generic).
 */
export function executeCardEffects(
  state: GameState,
  card: GameCardData,
): ReduceResult | null {
  const def = getCardDefinition(card);
  if (!def) return null;

  const ctx: ExecutionContext = {
    state,
    card,
    patch: {},
    sideEffects: [],
    enqueuedActions: [],
  };

  for (const effect of def.effects) {
    executeEffect(ctx, effect);
    if (ctx.halt) break;
  }

  return applyPatch(ctx.state, ctx.patch, ctx.sideEffects, ctx.enqueuedActions);
}

/**
 * Execute a magic/hero-magic card with pre-processing (curse, counter, echo).
 *
 * Pre-processing is applied before individual effect lookup:
 *   1. Curse handling (returns early)
 *   2. Magic counter increment
 *   3. Echo/double-next computation
 *
 * @returns ReduceResult if the card is registered, null otherwise.
 */
export function executeMagicCardEffects(
  state: GameState,
  card: GameCardData,
  target?: string,
  isFlank?: boolean,
): ReduceResult | null {
  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};
  const enqueuedActions: GameAction[] = [];

  // --- Pre-processing: Curse handling ---
  // Curses (`card.type === 'curse'`) bypass the magic counter / echo / definition
  // pipeline entirely. Their effect is hard-coded and after resolution the card
  // returns to the backpack (FINALIZE_MAGIC_CARD has dedicated curse routing).
  if (card.type === 'curse') {
    const curseEffect = card.curseEffect ?? ((card as any).knightEffect === 'greed-curse' ? 'greed-curse' : 'blood-curse');
    if (curseEffect === 'greed-curse') {
      enqueuedActions.push({ type: 'MODIFY_GOLD', delta: -3, source: 'greed-curse' });
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: '贪婪诅咒消耗了 3 金币。' } });
      sideEffects.push({ event: 'ui:banner', payload: { text: '贪婪诅咒消耗了 3 金币。' } });
    } else if (curseEffect === 'frenzy-curse') {
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 1, source: 'frenzy-curse', selfInflicted: true });
      enqueuedActions.push({ type: 'DRAW_FROM_BACKPACK', count: 1 } as GameAction);
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: '战狂诅咒：失去 1 生命，抽 1 张牌。' } });
      sideEffects.push({ event: 'ui:banner', payload: { text: '战狂诅咒：失去 1 生命，抽 1 张牌！' } });
    } else {
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 3, source: 'blood-curse', selfInflicted: true });
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: '血咒吸取了 3 点生命。' } });
      sideEffects.push({ event: 'ui:banner', payload: { text: '血咒吸取了 3 点生命。' } });
    }
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Pre-processing: Magic counter ---
  if (card.type === 'magic') {
    patch.magicCardsPlayedThisTurn = (state.magicCardsPlayedThisTurn ?? 0) + 1;
    // arcane-storm 专用累计：不含奥术风暴自身那张（X = 此前累计的魔法卡数）。
    if (card.magicEffect !== 'arcane-storm-magic-count') {
      patch.arcaneStormMagicCount = (state.arcaneStormMagicCount ?? 0) + 1;
    }
  }

  // --- Pre-processing: Echo ---
  // Spell Echo (法术回响) consumption rules:
  //   * Only non-`double-next-magic` magic cards can be echoed (prevents stacking).
  //   * Playing `double-next-magic` while echo is already active just refreshes the flag,
  //     no stacking. We still log a hint so the player understands no extra trigger occurred.
  const isEchoTriggered = !!(state.doubleNextMagic && card.type === 'magic' && card.magicEffect !== 'double-next-magic');
  if (isEchoTriggered) {
    patch.doubleNextMagic = false;
    sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `法术回响：${card.name} 的效果将触发两次！` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `法术回响！${card.name} 效果触发两次！` } });
  } else if (state.doubleNextMagic && card.type === 'magic' && card.magicEffect === 'double-next-magic') {
    sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `法术回响：${card.name} 不会被回响触发，已刷新回响状态。` } });
  }
  const echoMultiplier = isEchoTriggered ? 2 : 1;
  const echoTag = isEchoTriggered ? '（回响×2）' : '';

  // --- Look up the card definition ---
  const def = getCardDefinition(card);
  if (!def) return null;

  // --- Resolver path: full-control handler (complex magic effects) ---
  if (def.resolver) {
    return def.resolver(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered, target, isFlank);
  }

  // --- Declarative path: effects pipeline ---
  const ctx: ExecutionContext = {
    state: { ...state, ...patch } as GameState,
    card,
    patch,
    sideEffects,
    enqueuedActions,
    magic: { echoMultiplier, echoTag, isEchoTriggered },
  };

  for (const effect of def.effects) {
    executeEffect(ctx, effect);
    if (ctx.halt) break;
  }

  return applyPatch(state, ctx.patch, ctx.sideEffects, ctx.enqueuedActions);
}

function executeEffect(ctx: ExecutionContext, effect: CardEffect): void {
  if (effect.type === 'custom') {
    const handler = getCustomHandler(effect.handlerId);
    if (handler) {
      handler(ctx);
    } else if (typeof console !== 'undefined') {
      console.warn(`[card-engine] No custom handler: ${effect.handlerId}`);
    }
    return;
  }

  const executor = getExecutor(effect.type);
  if (!executor) {
    if (typeof console !== 'undefined') {
      console.warn(`[card-engine] No executor for effect type: ${effect.type}`);
    }
    return;
  }
  executor(ctx, effect);
}
