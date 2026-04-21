/**
 * Event Rules — handles dungeon event actions in the reducer.
 *
 * Covers: START_EVENT, COMPLETE_EVENT, FINALIZE_EVENT, GAIN_CLASS_DECK_BOTTOM_CARDS,
 * APPLY_EVENT_EFFECT.
 *
 * Events are dungeon cards (type: 'event') that present choices to the player.
 * The reducer manages the event lifecycle while delegating complex resolution
 * (dice rolls, UI prompts) to side effects.
 */

import type { GameCardData } from '@/components/GameCard';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ReduceResult, SideEffect } from '../reducer';
import { applyPatch, noChange } from '../reducer';
import { gainClassDeckBottomCardsPure, applySimpleEffect } from '../events';
import { createCrimsonVoidSwapMagic } from '../deck';

export function reduceEventActions(state: GameState, action: GameAction): ReduceResult | null {
  switch (action.type) {
    case 'START_EVENT':
      return reduceStartEvent(state, action);
    case 'COMPLETE_EVENT':
      return reduceCompleteEvent(state, action);
    case 'FINALIZE_EVENT':
      return reduceFinalizeEvent(state);
    case 'GAIN_CLASS_DECK_BOTTOM_CARDS':
      return reduceGainClassDeckBottomCards(state, action);
    case 'APPLY_EVENT_EFFECT':
      return reduceApplyEventEffect(state, action);
    case 'RESOLVE_EVENT_CHOICE':
      return reduceResolveEventChoice(state, action);
    case 'CONTINUE_EVENT_EFFECTS':
      return reduceContinueEventEffects(state);
    case 'SET_CURRENT_EVENT': {
      const result = applyPatch(state, { currentEventCard: action.card });
      // 当事件卡被放入 currentEventCard 时，视为"打出一张事件牌"，触发 transform 链。
      // action.card === null 表示关闭事件 modal，不算 play。
      if (action.card) {
        return {
          ...result,
          enqueuedActions: [
            ...(result.enqueuedActions ?? []),
            { type: 'APPLY_TRANSFORM_CATEGORY', card: action.card },
          ],
        };
      }
      return result;
    }
    case 'RESOLVE_EVENT_GRANT_EQUIP_FLIP_REPAIR':
      return reduceResolveEventGrantEquipFlipRepair(state, action);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// RESOLVE_EVENT_GRANT_EQUIP_FLIP_REPAIR
// 翻转之契 option 6 — mark equipment with `_flipRepairBuff = true`.
// Searches both equipped slots + reserves; idempotent (already-buffed → no-op).
// ---------------------------------------------------------------------------

function reduceResolveEventGrantEquipFlipRepair(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_EVENT_GRANT_EQUIP_FLIP_REPAIR' }>,
): ReduceResult {
  const { equipmentId } = action;
  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};
  let touchedName: string | null = null;

  const tag = (eq: GameCardData | null | undefined): GameCardData | null | undefined => {
    if (!eq || eq.id !== equipmentId) return eq;
    if (eq._flipRepairBuff) { touchedName = eq.name; return eq; }
    touchedName = eq.name;
    return { ...eq, _flipRepairBuff: true };
  };

  const next1 = tag(state.equipmentSlot1);
  if (next1 !== state.equipmentSlot1) patch.equipmentSlot1 = next1 as any;
  const next2 = tag(state.equipmentSlot2);
  if (next2 !== state.equipmentSlot2) patch.equipmentSlot2 = next2 as any;

  if (Array.isArray(state.equipmentSlot1Reserve)) {
    let changed = false;
    const next = state.equipmentSlot1Reserve.map(eq => {
      const r = tag(eq);
      if (r !== eq) changed = true;
      return r as GameCardData;
    });
    if (changed) patch.equipmentSlot1Reserve = next as any;
  }
  if (Array.isArray(state.equipmentSlot2Reserve)) {
    let changed = false;
    const next = state.equipmentSlot2Reserve.map(eq => {
      const r = tag(eq);
      if (r !== eq) changed = true;
      return r as GameCardData;
    });
    if (changed) patch.equipmentSlot2Reserve = next as any;
  }

  if (touchedName) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'event', message: `熔铸耐久：「${touchedName}」获得翻转回耐久词条` },
    });
  } else {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'event', message: `熔铸耐久：未找到目标装备` },
    });
  }

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// START_EVENT
// ---------------------------------------------------------------------------

function reduceStartEvent(
  state: GameState,
  action: Extract<GameAction, { type: 'START_EVENT' }>,
): ReduceResult {
  const { card } = action;
  const sideEffects: SideEffect[] = [];

  const patch: Partial<GameState> = {
    currentEventCard: card,
    phase: 'event' as GameState['phase'],
  };

  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'event', message: `遭遇事件：${card.name}` },
  });
  sideEffects.push({
    event: 'event:started',
    payload: { card },
  });

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// COMPLETE_EVENT
// ---------------------------------------------------------------------------

function reduceCompleteEvent(
  state: GameState,
  action: Extract<GameAction, { type: 'COMPLETE_EVENT' }>,
): ReduceResult {
  if (!state.currentEventCard) return noChange(state);

  const cardToComplete = state.currentEventCard;
  let shouldSkipFlip = action.skipFlip ?? false;

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {
    eventModalOpen: false,
    eventModalMinimized: false,
    currentEventCard: null,
    pendingEventEffects: [],
    pendingEventSkipFlip: false,
  };

  sideEffects.push({
    event: 'event:completed',
    payload: { card: cardToComplete, choiceId: action.choiceId },
  });

  // Evaluate flip conditions
  if (!shouldSkipFlip && cardToComplete.flipCondition) {
    if (cardToComplete.flipCondition.startsWith('activeRowEquipment:')) {
      const minCount = parseInt(cardToComplete.flipCondition.split(':')[1], 10) || 2;
      const equipCount = state.activeCards.filter(
        (c): c is GameCardData => c != null && (c.type === 'weapon' || c.type === 'shield'),
      ).length;
      if (equipCount < minCount) {
        shouldSkipFlip = true;
      }
    }
  }

  // Crimson magic resonance (双重燃烧（觉醒）)
  let crimsonFlipTarget: GameCardData['flipTarget'] | null = null;
  if (cardToComplete.name === '双重燃烧（觉醒）' && !shouldSkipFlip) {
    const idx = state.activeCards.findIndex(c => c?.id === cardToComplete.id);
    if (idx !== -1) {
      const above = state.previewCards[idx];
      if (above && (above.type === 'magic' || above.type === 'hero-magic')) {
        const [voidSwapCard, newRng] = createCrimsonVoidSwapMagic(state.rng);
        patch.rng = newRng;
        crimsonFlipTarget = {
          toCard: voidSwapCard,
          destination: 'stay' as const,
          message: '魔法共鸣…卷轴化为虚空置换！',
          banner: '正上方魔法共鸣：「虚空置换」降临地城！',
        };
      }
    }
  }

  const effectiveFlipTarget = crimsonFlipTarget ?? cardToComplete.flipTarget;
  const hasFlip = !!effectiveFlipTarget && !shouldSkipFlip;
  const flipDest = hasFlip ? (effectiveFlipTarget!.destination ?? 'graveyard') : 'graveyard';
  const isStayFlip = hasFlip && flipDest === 'stay';

  const eventCellIdx = state.activeCards.findIndex(c => c?.id === cardToComplete.id);
  const stacks = state.activeCardStacks ?? {};
  const stackBelow = eventCellIdx >= 0 ? (stacks[eventCellIdx] ?? []) : [];
  const shouldStayOnStack = !hasFlip && !!cardToComplete.stayIfStacked && stackBelow.length > 0;

  const shouldRemoveFromDungeon = !isStayFlip && !shouldStayOnStack;

  // Clear resolving state
  if (state.resolvingDungeonCardId === cardToComplete.id) {
    patch.resolvingDungeonCardId = null;
  }

  // Remove from dungeon if needed
  if (shouldRemoveFromDungeon && eventCellIdx >= 0) {
    const newActiveCards = [...state.activeCards];
    const stackAtIdx = stacks[eventCellIdx] ?? [];
    if (stackAtIdx.length > 0) {
      const nextCard = stackAtIdx[stackAtIdx.length - 1];
      newActiveCards[eventCellIdx] = nextCard;
      const popStacks = { ...stacks };
      const remaining = stackAtIdx.slice(0, -1);
      if (remaining.length === 0) {
        delete popStacks[eventCellIdx];
      } else {
        popStacks[eventCellIdx] = remaining;
      }
      patch.activeCardStacks = popStacks;
      sideEffects.push({ event: 'log:entry', payload: { type: 'system', message: `堆叠揭示：「${nextCard.name}」从第 ${eventCellIdx + 1} 列堆叠中浮现！` } });
      // Stack pop keeps the slot occupied (card→card, not card→null), so
      // postProcessActiveCards won't detect the removal. Explicitly register
      // the completed event card as processed to trigger backpack auto-draw.
      if (!state.processedDungeonCardIds.includes(cardToComplete.id)) {
        enqueuedActions.push({ type: 'REGISTER_DUNGEON_CARD_PROCESSED', cardId: cardToComplete.id, source: 'slot-cleared' });
      }
    } else {
      newActiveCards[eventCellIdx] = null;
    }
    patch.activeCards = newActiveCards;
  }

  // Handle flip
  if (hasFlip && effectiveFlipTarget) {
    const cardForFlip = { ...cardToComplete, flipTarget: effectiveFlipTarget };
    const cellIndex = isStayFlip ? eventCellIdx : undefined;
    enqueuedActions.push({ type: 'APPLY_CARD_FLIP', card: cardForFlip, cellIndex });
  } else if (shouldStayOnStack) {
    // Discard stacked cards to graveyard
    for (const stackCard of stackBelow) {
      patch.discardedCards = [...(patch.discardedCards ?? state.discardedCards), stackCard];
      sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: `祭坛驻留：堆叠牌「${stackCard.name}」被送入坟场` } });
    }
    const newStacks = { ...stacks };
    delete newStacks[eventCellIdx];
    patch.activeCardStacks = newStacks;
    sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: '附魔祭坛驻留在地城中，可再次触发！' } });
    enqueuedActions.push({ type: 'SET_HERO_SKILL_BANNER', message: '附魔祭坛驻留！堆叠牌已消耗。' });
  } else if (!hasFlip) {
    // Send to graveyard
    patch.discardedCards = [...(patch.discardedCards ?? state.discardedCards), cardToComplete];
  }

  // Emit side effect for auto-draw tracking (hook will handle animation/waterfall)
  sideEffects.push({
    event: 'event:cardRemoved' as any,
    payload: {
      cardId: cardToComplete.id,
      cellIndex: eventCellIdx,
      removed: shouldRemoveFromDungeon,
      // Pass the full card so the hook listener can fly the corpse to the
      // graveyard before the slot DOM element disappears.
      card: cardToComplete,
    },
  });

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// FINALIZE_EVENT
// ---------------------------------------------------------------------------

function reduceFinalizeEvent(state: GameState): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {
    currentEventCard: null,
    resolvingDungeonCardId: null,
    phase: 'playing' as GameState['phase'],
  };

  sideEffects.push({
    event: 'event:finalized',
    payload: {},
  });

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// GAIN_CLASS_DECK_BOTTOM_CARDS
// ---------------------------------------------------------------------------

function reduceGainClassDeckBottomCards(
  state: GameState,
  action: Extract<GameAction, { type: 'GAIN_CLASS_DECK_BOTTOM_CARDS' }>,
): ReduceResult {
  const { patch, cards, logs } = gainClassDeckBottomCardsPure(state, action.count);
  const sideEffects: SideEffect[] = logs.map(l => ({
    event: 'log:entry' as const,
    payload: l,
  }));

  if (cards.length > 0) {
    sideEffects.push({
      event: 'event:completed' as const,
      payload: { cardId: 'class-deck-bottom', choiceId: undefined } as any,
    });
  }

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// APPLY_EVENT_EFFECT
// ---------------------------------------------------------------------------

function reduceApplyEventEffect(
  state: GameState,
  action: Extract<GameAction, { type: 'APPLY_EVENT_EFFECT' }>,
): ReduceResult {
  const { patch, logs, asyncActions, emitEvents, enqueuedActions: resultActions, rawSideEffects } = applySimpleEffect(state, action.token);
  const sideEffects: SideEffect[] = logs.map(l => ({
    event: 'log:entry' as const,
    payload: l,
  }));

  if (rawSideEffects) {
    sideEffects.push(...rawSideEffects);
  }

  if (emitEvents) {
    for (const e of emitEvents) {
      sideEffects.push({ event: e.event as any, payload: e.payload });
    }
  }

  if (asyncActions.length > 0) {
    sideEffects.push({
      event: 'event:asyncEffectNeeded' as const,
      payload: { tokens: asyncActions } as any,
    });
  }

  const enqueuedActions = resultActions && resultActions.length > 0 ? resultActions : undefined;
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// Shared: process effect tokens inline, stopping at interactive effects
// ---------------------------------------------------------------------------

function processEffectsInline(
  state: GameState,
  tokens: string[],
  skipFlip: boolean,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const mergedPatch: Partial<GameState> = {};
  let currentState = state;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === 'none') continue;

    const { patch, logs, emitEvents } = applySimpleEffect(currentState, token);

    Object.assign(mergedPatch, patch);
    currentState = { ...currentState, ...patch };

    for (const l of logs) {
      sideEffects.push({ event: 'log:entry', payload: l });
    }

    if (token.startsWith('persuadeNextCostReduction:') || token.startsWith('persuadeNextCostIncrease:') || token === 'persuadeNextFree') {
      sideEffects.push({
        event: 'combat:persuadeDiscountUpdate',
        payload: { newReduction: currentState.persuadeDiscount?.costReduction ?? 0 },
      });
    }

    let hasInteraction = false;
    if (emitEvents) {
      for (const e of emitEvents) {
        sideEffects.push({ event: e.event as any, payload: e.payload });
        if (e.event === 'event:requestEventInteraction') {
          hasInteraction = true;
        }
      }
    }

    if (hasInteraction) {
      mergedPatch.pendingEventEffects = tokens.slice(i + 1);
      mergedPatch.pendingEventSkipFlip = skipFlip;
      return applyPatch(state, mergedPatch, sideEffects);
    }
  }

  // All effects processed — apply 战血荣誉 post-effect logic
  const enqueuedActions: GameAction[] = [];

  if (currentState.currentEventCard?.name === '战血荣誉' && currentState.resolvingDungeonCardId) {
    const cellIdx = currentState.activeCards.findIndex(c => c?.id === currentState.resolvingDungeonCardId);
    if (cellIdx !== -1 && cellIdx < currentState.activeCards.length - 1) {
      const rightMonsters: { id: string; name: string }[] = [];
      for (let j = cellIdx + 1; j < currentState.activeCards.length; j++) {
        const card = currentState.activeCards[j];
        if (card && card.type === 'monster' && !currentState.combatState.engagedMonsterIds.includes(card.id)) {
          rightMonsters.push({ id: card.id, name: card.name });
          enqueuedActions.push({ type: 'BEGIN_COMBAT', monster: card, initiator: 'hero' });
        }
      }
      if (rightMonsters.length > 0) {
        const names = rightMonsters.map(m => m.name).join('、');
        sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: `战血荣誉激怒了右侧的怪物：${names}` } });
        enqueuedActions.push({ type: 'SET_HERO_SKILL_BANNER', message: `战血荣誉激怒了 ${names}！` });
      }
    }
  }

  mergedPatch.pendingEventEffects = [];
  mergedPatch.pendingEventSkipFlip = false;
  enqueuedActions.push({ type: 'COMPLETE_EVENT', skipFlip });

  return applyPatch(state, mergedPatch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// RESOLVE_EVENT_CHOICE
// Processes effect tokens inline, stopping at interactive effects.
// After all effects, enqueues 战血荣誉 combat + COMPLETE_EVENT.
// ---------------------------------------------------------------------------

function reduceResolveEventChoice(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_EVENT_CHOICE' }>,
): ReduceResult {
  if (!state.currentEventCard) return noChange(state);

  const sideEffects: SideEffect[] = [];
  if (action.choiceText) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'event', message: `事件「${state.currentEventCard.name}」：选择「${action.choiceText}」` },
    });
  }

  const result = processEffectsInline(state, action.effectTokens, action.skipFlip ?? false);
  result.sideEffects = [...sideEffects, ...result.sideEffects];
  return result;
}

// ---------------------------------------------------------------------------
// CONTINUE_EVENT_EFFECTS
// Resumes processing after an interactive event effect completes.
// ---------------------------------------------------------------------------

function reduceContinueEventEffects(state: GameState): ReduceResult {
  if (state.pendingEventEffects.length === 0) {
    return applyPatch(state, {}, [], [{ type: 'COMPLETE_EVENT', skipFlip: state.pendingEventSkipFlip }]);
  }
  return processEffectsInline(state, state.pendingEventEffects, state.pendingEventSkipFlip);
}
