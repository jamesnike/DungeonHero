/**
 * Game Reducer — maps GameActions to state changes.
 *
 * Pure function: takes (state, action) and returns a ReduceResult containing
 * the new state, any side effects to emit, and any follow-up actions to enqueue.
 *
 * Domain-specific logic is delegated to rule modules under ./rules/ to keep
 * this file as a thin dispatch layer. During the migration, unhandled actions
 * fall through as NO_OP (logged in dev mode).
 */

import type { GameState } from './types';
import type { GameAction } from './actions';
import type { GameEventKey, GameEventMap } from './event-bus';
import { DEV_MODE, DUNGEON_COLUMN_COUNT } from './constants';
import { reduceTurnActions } from './rules/turn';
import { reduceCombatActions } from './rules/combat';
import { reduceCardActions } from './rules/cards';
import { reduceShopActions } from './rules/shop';
import { reduceDungeonActions } from './rules/dungeon';
import { reduceEventActions } from './rules/events';
import { reduceHeroActions } from './rules/hero';
import { reduceUIStateActions } from './rules/ui-state';
import { reduceEconomyActions } from './rules/economy';
import { reduceWaterfallActions } from './rules/waterfall';
import {
  syncBuildingSlotsPure,
  countActiveRowSlotsExcludeGhost,
  computeAmuletAuraSignature,
} from './helpers';
import {
  BALANCE_ATTACK_BONUS,
  BALANCE_ATTACK_PENALTY,
  BALANCE_SHIELD_BONUS,
  BALANCE_SHIELD_PENALTY,
} from './constants';
import { computeWaterfallDropPlan } from './rules/waterfall';
import { createRng } from './rng';
import { pruneStaleEngagedIds } from './combat';
import { reduceInitGame } from './rules/init';

// ---------------------------------------------------------------------------
// ReduceResult — what the reducer returns
// ---------------------------------------------------------------------------

export interface SideEffect<K extends GameEventKey = GameEventKey> {
  event: K;
  payload: GameEventMap[K];
}

export interface ReduceResult {
  /** The updated game state (full, not partial). */
  state: GameState;
  /** Events to emit to the EventBus (for animations / sound / logging). */
  sideEffects: SideEffect[];
  /** Follow-up actions to enqueue for sequential resolution. */
  enqueuedActions: GameAction[];
}

// ---------------------------------------------------------------------------
// Helpers for building ReduceResult
// ---------------------------------------------------------------------------

/** No state change, no effects, no follow-up. */
export function noChange(state: GameState): ReduceResult {
  return { state, sideEffects: [], enqueuedActions: [] };
}

/** Apply a partial patch to state, optionally with effects and follow-ups. */
export function applyPatch(
  state: GameState,
  patch: Partial<GameState>,
  sideEffects: SideEffect[] = [],
  enqueuedActions: GameAction[] = [],
): ReduceResult {
  return {
    state: { ...state, ...patch },
    sideEffects,
    enqueuedActions,
  };
}

// ---------------------------------------------------------------------------
// Post-processing: runs after any action that changed activeCards
// ---------------------------------------------------------------------------

const WATERFALL_EXEMPT_ACTIONS = new Set<GameAction['type']>([
  'TRIGGER_WATERFALL',
  'DRAW_DUNGEON_ROW',
  'MONSTER_ENTERED_ROW',
  'CHECK_ELITE_GOLD_BUFF',
  'CHECK_HORDE_SWARM',
  'END_TURN',
  'ADVANCE_MONSTER_TURN',
  'APPLY_MONSTER_TURN_END_EFFECTS',
  'ENTER_PLAYER_INPUT',
  'START_TURN',
  'APPLY_WATERFALL_DROP',
  'APPLY_WATERFALL_DEAL',
  'COMPLETE_WATERFALL',
  'WATERFALL_TURN_RESET',
  'APPLY_WATERFALL_EFFECTS',
  'APPLY_WATERFALL_DISCARD_EFFECTS',
]);

const CARD_PROCESSING_EXEMPT_ACTIONS = new Set<GameAction['type']>([
  'TRIGGER_WATERFALL',
  'DRAW_DUNGEON_ROW',
  'MONSTER_ENTERED_ROW',
  'START_TURN',
  'REGISTER_DUNGEON_CARD_PROCESSED',
]);

const EMPTY_DEFEAT_IDS = new Set<string>();

function postProcessActiveCards(
  prevState: GameState,
  result: ReduceResult,
  action: GameAction,
): ReduceResult {
  if (result.state.activeCards === prevState.activeCards) return result;

  let { state } = result;
  const extraActions: GameAction[] = [];
  let mutated = false;

  // 1. Building-slot sync (fate blade / amplify altar charge tracking)
  const synced = syncBuildingSlotsPure(state.activeCards);
  if (synced) {
    state = { ...state, activeCards: synced };
    mutated = true;
  }

  // 2. Stale engagement prune
  const pruned = pruneStaleEngagedIds(state.combatState, state.activeCards, EMPTY_DEFEAT_IDS);
  if (pruned) {
    state = { ...state, combatState: pruned };
    mutated = true;
  }

  // 3. Detect cards removed from dungeon slots → enqueue REGISTER_DUNGEON_CARD_PROCESSED
  if (!CARD_PROCESSING_EXEMPT_ACTIONS.has(action.type)) {
    for (let col = 0; col < DUNGEON_COLUMN_COUNT; col++) {
      const prev = prevState.activeCards[col];
      const curr = state.activeCards[col];
      if (prev && !curr && !state.processedDungeonCardIds.includes(prev.id)) {
        extraActions.push({ type: 'REGISTER_DUNGEON_CARD_PROCESSED', cardId: prev.id, source: 'slot-cleared' });
      }
    }
  }

  // 4. Victory short-circuit — if the deck and preview are exhausted and the
  //    active row contains no real (non-ghost) cards, declare victory directly.
  //    Ghost buildings never block victory (see design_guidelines.md §Ghost
  //    Mechanic). We bypass the waterfall pipeline here so post-victory effects
  //    like waterfall-heal / waterfall-discover are not triggered after the
  //    game has already ended.
  if (
    !state.gameOver &&
    !state.pendingWaterfallPlan &&
    countActiveRowSlotsExcludeGhost(state.activeCards) === 0 &&
    state.previewCards.every(c => !c) &&
    state.remainingDeck.length === 0
  ) {
    state = { ...state, victory: true, gameOver: true };
    result = {
      ...result,
      sideEffects: [
        ...result.sideEffects,
        { event: 'log:entry', payload: { type: 'system', message: '胜利！地牢已被征服！' } },
        { event: 'game:over', payload: { victory: true } },
      ],
    };
    mutated = true;
  }

  // 5. Waterfall trigger check — compute plan and store in state when ≤1 non-ghost card remains.
  //    The UI layer will animate the plan in phases and dispatch APPLY_WATERFALL_DROP / DEAL / COMPLETE.
  if (!state.gameOver && !WATERFALL_EXEMPT_ACTIONS.has(action.type) && !state.pendingWaterfallPlan) {
    if (countActiveRowSlotsExcludeGhost(state.activeCards) <= 1) {
      const plan = computeWaterfallDropPlan(state, false);
      if (plan) {
        state = { ...state, pendingWaterfallPlan: plan, rng: plan.rng };
        result = {
          ...result,
          sideEffects: [...result.sideEffects, { event: 'waterfall:planReady', payload: { plan } }],
        };
        mutated = true;
      }
    }
  }

  if (!mutated && extraActions.length === 0) return result;

  return {
    state: mutated ? state : result.state,
    sideEffects: result.sideEffects,
    enqueuedActions: [...result.enqueuedActions, ...extraActions],
  };
}

// ---------------------------------------------------------------------------
// Post-processing: ensure amulet _counterDisplay is in sync (Phase 8E)
// ---------------------------------------------------------------------------

function computeAmuletCounterDisplay(
  slot: import('./types').GameCardData,
  state: GameState,
): string | undefined {
  switch (slot.amuletEffect) {
    case 'damage-class-discover': {
      const threshold = (slot.upgradeLevel ?? 0) >= 1 ? 3 : 8;
      return `${state.classDamageDiscoverStreak ?? 0}/${threshold}`;
    }
    case 'magic-class-discover':
      return `${state.classMagicDiscoverStreak ?? 0}/8`;
    case 'monster-kill-upgrade':
      return `${state.monsterKillUpgradeProgress ?? 0}/5`;
    case 'swap-upgrade':
      return `${state.swapUpgradeProgress ?? 0}/3`;
    case 'recycle-backpack-expand': {
      const threshold = (slot.upgradeLevel ?? 0) >= 1 ? 6 : 8;
      return `${state.recycleBackpackProgress ?? 0}/${threshold}`;
    }
    case 'flip-overkill-lifesteal':
      return `${state.flipOverkillLifestealProgress ?? 0}/5`;
    case 'equip-amulet-cap':
      return `${state.equipAmuletCapProgress ?? 0}/6`;
    case 'stun-attempt-discover':
      return `${state.stunAttemptDiscoverProgress ?? 0}/6`;
    default:
      return undefined;
  }
}

function postProcessAmuletCounters(result: ReduceResult): ReduceResult {
  const { state } = result;
  let changed = false;
  const newSlots = state.amuletSlots.map(slot => {
    if (!slot || !slot.amuletEffect) return slot;
    const expected = computeAmuletCounterDisplay(slot, state);
    if (expected === undefined) return slot;
    if (slot._counterDisplay === expected) return slot;
    changed = true;
    return { ...slot, _counterDisplay: expected };
  });
  if (!changed) return result;
  return { ...result, state: { ...state, amuletSlots: newSlots } };
}

// ---------------------------------------------------------------------------
// Post-processing: detect cards newly added to hand → enqueue 上手 triggers
// ---------------------------------------------------------------------------

/**
 * Actions whose effect of adding cards to the hand should NOT trigger 上手
 * effects. INIT_GAME deals the empty initial hand (no cards added), but we
 * still exempt it defensively. TRIGGER_ON_ENTER_HAND itself is exempt to
 * prevent infinite recursion if a handler ever modifies the hand.
 */
const ON_ENTER_HAND_EXEMPT_ACTIONS = new Set<GameAction['type']>([
  'INIT_GAME',
  'TRIGGER_ON_ENTER_HAND',
]);

function postProcessHandEntries(
  prevState: GameState,
  result: ReduceResult,
  action: GameAction,
): ReduceResult {
  if (ON_ENTER_HAND_EXEMPT_ACTIONS.has(action.type)) return result;
  if (result.state.handCards === prevState.handCards) return result;

  const prevIds = new Set(prevState.handCards.map(c => c.id));
  const triggers: GameAction[] = [];
  for (const card of result.state.handCards) {
    if (prevIds.has(card.id)) continue;
    if (!card.onEnterHandEffect) continue;
    if (card._skipOnEnterHand) continue;
    triggers.push({ type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id });
  }

  if (triggers.length === 0) return result;
  return {
    ...result,
    enqueuedActions: [...result.enqueuedActions, ...triggers],
  };
}

// ---------------------------------------------------------------------------
// Post-processing: keep slotTempAttack / slotTempArmor in sync with the
// strength / balance amulet auras. Whenever any action mutates `amuletSlots`,
// we diff the aura signature (strength + balance counts) before vs after and
// apply the corresponding delta to the temp slot stats.
//
// This is the single source of truth for amulet aura ↔ temp stat coupling,
// replacing the per-call manual reversal previously scattered across rules
// (events, cards, shop, turn) and hooks.
//
// Exempt actions: the waterfall pipeline manages aura explicitly by zeroing
// temp stats then re-stamping the aura — those actions intentionally leave
// `amuletSlots` untouched, so the diff naturally returns 0 there. INIT_GAME
// is meta-handled before postProcess runs and never hits this path.
// ---------------------------------------------------------------------------

function postProcessAmuletAura(
  prevState: GameState,
  result: ReduceResult,
): ReduceResult {
  if (result.state.amuletSlots === prevState.amuletSlots) return result;

  const prevSig = computeAmuletAuraSignature(prevState.amuletSlots);
  const nextSig = computeAmuletAuraSignature(result.state.amuletSlots);
  const strengthDelta = nextSig.strength - prevSig.strength;
  const balanceDelta = nextSig.balance - prevSig.balance;
  if (strengthDelta === 0 && balanceDelta === 0) return result;

  const baseAttack = result.state.slotTempAttack ?? { equipmentSlot1: 0, equipmentSlot2: 0 };
  const baseArmor = result.state.slotTempArmor ?? { equipmentSlot1: 0, equipmentSlot2: 0 };

  const tempAttack = { ...baseAttack };
  const tempArmor = { ...baseArmor };

  // Strength: +4/+4 attack per amulet
  if (strengthDelta !== 0) {
    tempAttack.equipmentSlot1 += strengthDelta * 4;
    tempAttack.equipmentSlot2 += strengthDelta * 4;
  }
  // Balance: +A/-P attack on left/right, -P/+B armor on left/right per amulet
  if (balanceDelta !== 0) {
    tempAttack.equipmentSlot1 += balanceDelta * BALANCE_ATTACK_BONUS;
    tempAttack.equipmentSlot2 -= balanceDelta * BALANCE_ATTACK_PENALTY;
    tempArmor.equipmentSlot1 -= balanceDelta * BALANCE_SHIELD_PENALTY;
    tempArmor.equipmentSlot2 += balanceDelta * BALANCE_SHIELD_BONUS;
  }

  return {
    ...result,
    state: {
      ...result.state,
      slotTempAttack: tempAttack,
      slotTempArmor: tempArmor,
    },
  };
}

// ---------------------------------------------------------------------------
// Combined post-processing
// ---------------------------------------------------------------------------

function postProcess(prevState: GameState, result: ReduceResult, action: GameAction): ReduceResult {
  let r = postProcessActiveCards(prevState, result, action);
  r = postProcessAmuletAura(prevState, r);
  r = postProcessAmuletCounters(r);
  r = postProcessHandEntries(prevState, r, action);
  return r;
}

// ---------------------------------------------------------------------------
// Main reducer
// ---------------------------------------------------------------------------

export function reduce(state: GameState, action: GameAction): ReduceResult {
  // Meta actions handled inline
  switch (action.type) {
    case 'NO_OP':
      return noChange(state);

    case 'SEED_RNG':
      return applyPatch(state, { rng: createRng(action.seed) });

    case 'ENQUEUE_ACTIONS':
      return {
        state,
        sideEffects: [],
        enqueuedActions: action.actions,
      };

    case 'INIT_GAME':
      return reduceInitGame(state, action.mode, action.totalWins, action.eternalRelics);

  }

  // Delegate to domain reducers. Each returns ReduceResult | null.
  // First match wins; null means "not handled by this domain".

  const delegates = [
    reduceTurnActions,
    reduceCombatActions,
    reduceCardActions,
    reduceShopActions,
    reduceDungeonActions,
    reduceWaterfallActions,
    reduceEventActions,
    reduceHeroActions,
    reduceUIStateActions,
    reduceEconomyActions,
  ];

  for (const delegate of delegates) {
    const result = delegate(state, action);
    if (result) return postProcess(state, result, action);
  }

  // --- Fallthrough: action not yet migrated ---
  if (DEV_MODE) {
    console.warn(`[reducer] Unhandled action: ${action.type}. This action has not been migrated to game-core yet.`);
  }
  return noChange(state);
}
