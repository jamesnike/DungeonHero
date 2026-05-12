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
import type { ActiveRowSlots } from '@/components/game-board/types';
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
import { reduceSkillFloatActions } from './rules/skill-float';
import { reduceMultiplayerActions } from './rules/multiplayer';
import {
  syncBuildingSlotsPure,
  countActiveRowSlotsExcludeGhost,
  computeAmuletAuraSignature,
  applyAmplifyOnCreate,
} from './helpers';
import { createBugletCard } from './deck';
import { createMineBuilding } from '@/lib/knightDeck';
import { computeAmuletEffectsForState } from './equipment';
import {
  BALANCE_ATTACK_BONUS,
  BALANCE_ATTACK_PENALTY,
  BALANCE_SHIELD_BONUS,
  BALANCE_SHIELD_PENALTY,
} from './constants';
import { computeWaterfallDropPlan } from './rules/waterfall';
import { createRng } from './rng';
import { pruneStaleEngagedIds } from './combat';
import { reduceInitGame, reduceInitMultiplayerGame } from './rules/init';

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

// Actions that should NOT trigger swarm-spawn (bulk row mutations / waterfall
// pipeline / setup). All other reducer-driven slot clearings (event removal,
// monster defeat via removeCard, magic-removed dungeon cards, …) go through
// postProcessActiveCards and let the swarm passive react.
const SWARM_SPAWN_EXEMPT_ACTIONS = new Set<GameAction['type']>([
  'INIT_GAME',
  'INIT_MULTIPLAYER_GAME',
  'TRIGGER_WATERFALL',
  'DRAW_DUNGEON_ROW',
  'MONSTER_ENTERED_ROW',
  'CHECK_HORDE_SWARM',
  'CHECK_ELITE_GOLD_BUFF',
  'START_TURN',
  'END_TURN',
  'ADVANCE_MONSTER_TURN',
  'APPLY_MONSTER_TURN_END_EFFECTS',
  'APPLY_WATERFALL_DROP',
  'APPLY_WATERFALL_DEAL',
  'COMPLETE_WATERFALL',
  'WATERFALL_TURN_RESET',
  'APPLY_WATERFALL_EFFECTS',
  'APPLY_WATERFALL_DISCARD_EFFECTS',
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

  // 3. Swarm passive (`swarmSpawn`): if a non-Buglet dungeon card was just
  //    removed AND a swarm monster (with `swarmSpawn`, not stunned, not a
  //    buglet) is on the active row, spawn a Buglet at the cleared slot.
  //    Centralised here so that ANY reducer path that clears a dungeon slot
  //    (event resolution, magic, combat, removeCard hook via
  //    UPDATE_ACTIVE_CARDS, …) consistently triggers the passive — matching
  //    the design intent that 「每移除一张地城牌」 should spawn a buglet,
  //    regardless of code path.
  //
  //    Swarm wins over stack-pop: when a Swarm monster is present, both
  //    `removeCard` (GameBoard.tsx) and `reduceCompleteEvent` (events.ts)
  //    detect the presence and force the slot to null INSTEAD of popping
  //    the stack. The stacked card stays at the top of `activeCardStacks`
  //    untouched, ready to pop up after the spawned Buglet is later
  //    defeated. So when this branch sees `prev && !curr`, the stacked
  //    card (if any) is preserved — we only set `activeCards[col] = buglet`
  //    here, never touch `activeCardStacks`.
  //
  //    NOTE: Runs BEFORE step 4 (REGISTER_DUNGEON_CARD_PROCESSED) so that
  //    swarm-replaced slots don't get counted as "processed" — preserves the
  //    legacy hook behavior where buglet-replacement skipped auto-draw and
  //    dungeon-gold amulet effects.
  if (!SWARM_SPAWN_EXEMPT_ACTIONS.has(action.type)) {
    for (let col = 0; col < DUNGEON_COLUMN_COUNT; col++) {
      const prev = prevState.activeCards[col];
      const curr = state.activeCards[col];
      if (!prev || curr) continue;
      if (prev.isBuglet) continue;
      // Find the first swarm-monster source (also used to attribute the
      // skill-float to a specific card). When multiple swarm monsters are on
      // the row we still emit a single float per spawn — sequential floats
      // for one logical event would be excessive.
      const swarmSource = state.activeCards.find(
        (c, i) =>
          c != null &&
          i !== col &&
          c.type === 'monster' &&
          c.swarmSpawn === true &&
          c.isBuglet !== true &&
          c.isStunned !== true,
      );
      if (!swarmSource) continue;

      const buglet = applyAmplifyOnCreate(createBugletCard(), state.amplifiedCardBonus);
      const nextActive = [...state.activeCards] as ActiveRowSlots;
      nextActive[col] = buglet;
      state = { ...state, activeCards: nextActive };
      mutated = true;

      result = {
        ...result,
        sideEffects: [
          ...result.sideEffects,
          {
            event: 'log:entry',
            payload: { type: 'combat', message: `虫群效果：小虫子（激怒）在第 ${col + 1} 列生成！` },
          },
          {
            event: 'ui:banner',
            payload: { text: '虫群效果：小虫子（激怒）生成！' },
          },
          {
            event: 'combat:autoEngage',
            payload: { monsterId: buglet.id, monsterName: buglet.name },
          },
        ],
      };

      // Float `passive:swarmSpawn` above the swarm monster that just bred.
      // Pushed FIRST so the float queue freezes the pipeline before the
      // CHECK_HORDE_SWARM follow-up enqueued below — that keeps the
      // animation order: see swarm spawn → see horde rage (if any).
      extraActions.push({
        type: 'TRIGGER_MONSTER_SKILL_FLOAT',
        monsterId: swarmSource.id,
        skillKey: 'passive:swarmSpawn',
      });

      // Horde rage check (CHECK_HORDE_SWARM is idempotent + no-op when
      // conditions aren't met). Enqueue once per spawn so a multi-clear
      // burst still gets one re-evaluation per new monster.
      extraActions.push({ type: 'CHECK_HORDE_SWARM' });
    }
  }

  // 3.5. Kill-cell mine spawn (殒雷符 amulet, unique).
  //      When a defeated monster (`prev?.defeatProcessed === true`) leaves a
  //      slot — whether the slot becomes null OR another card now occupies it
  //      (stack-pop, swarm-buglet from step 3, future card promote) — spawn a
  //      mine. If the slot is already occupied (curr !== null), the mine is
  //      placed ON TOP and the existing card is pushed to `activeCardStacks`
  //      (per user spec "堆叠在上面").
  //
  //      Detection key: `prev?.defeatProcessed === true && curr !== prev`.
  //      `defeatProcessed: true` is set ONLY in `combat.ts:reduceMonsterDefeated`
  //      branch B (actual defeat), so this never fires for revives, building
  //      removals, event flips, or other slot mutations.
  //
  //      Trigger source: ANY kill (per user spec — weapon attack / magic /
  //      mine itself / reflect / discard damage / last-words damage all count).
  //      Self-mine kills DO retrigger (chains of mines on the same cell are
  //      allowed by design — unique amulet caps at 1 instance, so each kill
  //      adds exactly 1 mine).
  //
  //      Routing the mine spawn through `extraActions` (a new SPAWN_KILL_CELL_MINE
  //      enqueue) would be cleaner architecturally but creates an
  //      `isInputContinuation` whitelist obligation; keeping it inline here
  //      mirrors the existing swarm-spawn pattern (step 3) which also writes
  //      `state.activeCards` directly.
  {
    const ae = computeAmuletEffectsForState(state);
    if (ae.killCellMineCount > 0) {
      const nextActiveCards: ActiveRowSlots = [...state.activeCards] as ActiveRowSlots;
      const nextStacks: typeof state.activeCardStacks = { ...state.activeCardStacks };
      let mineRng = state.rng;
      let mineMutated = false;

      for (let col = 0; col < DUNGEON_COLUMN_COUNT; col++) {
        const prev = prevState.activeCards[col];
        const curr = state.activeCards[col];
        // Only fire when a defeated monster has just left this column.
        if (!prev || prev.type !== 'monster' || !prev.defeatProcessed) continue;
        if (curr === prev) continue; // monster still in slot, animation phase

        const [mine, nextRng] = createMineBuilding(mineRng);
        mineRng = nextRng;

        if (curr) {
          // Stack-pop / swarm-buglet / waterfall-drop already filled the slot.
          // Mine goes on top; push current card to the bottom of the stack
          // (visible card is replaced; old occupant pops up next).
          const existingStack = nextStacks[col] ?? [];
          nextStacks[col] = [...existingStack, curr];
          nextActiveCards[col] = mine;
        } else {
          // Slot is empty — drop mine straight in.
          nextActiveCards[col] = mine;
        }
        mineMutated = true;

        result = {
          ...result,
          sideEffects: [
            ...result.sideEffects,
            {
              event: 'log:entry',
              payload: {
                type: 'amulet',
                message: `殒雷符：第 ${col + 1} 列击杀触发，生成地雷${curr ? '（堆叠在 '+ curr.name +' 上）' : ''}！`,
              },
            },
            {
              event: 'ui:banner',
              payload: { text: `殒雷符发动：第 ${col + 1} 列布下地雷！` },
            },
          ],
        };
      }

      if (mineMutated) {
        state = { ...state, activeCards: nextActiveCards, activeCardStacks: nextStacks, rng: mineRng };
        mutated = true;
      }
    }
  }

  // 4. Detect cards removed from dungeon slots → enqueue REGISTER_DUNGEON_CARD_PROCESSED.
  //    Uses post-step-3 `state.activeCards` so swarm-replaced slots (now holding a
  //    buglet) are NOT detected here, mirroring the legacy `removeCard` hook
  //    behavior of skipping `registerDungeonCardProcessed` when a buglet spawn
  //    would replace the slot.
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

  // 5. Waterfall trigger check — compute plan and store in state when the
  //    active row drops below the per-mode threshold.
  //    • Single-player: ≤ 1 non-ghost card remains (unchanged historic
  //      behavior — player squeezes 3 monsters before each waterfall).
  //    • Multiplayer: ≤ 2 non-ghost cards remain. The shared 36-card deck
  //      is split between two players, so each waterfall lands fewer cards
  //      per side (2 instead of 3). The remaining preview row cards beyond
  //      the primary discard get shipped to the peer's deck top — see
  //      `extraDiscardCards` in `computeWaterfallDropPlan` and the
  //      handleWaterfallDiscardComplete loop in GameBoard.tsx.
  //    The UI layer animates the plan in phases and dispatches
  //    APPLY_WATERFALL_DROP / DEAL / COMPLETE.
  if (!state.gameOver && !WATERFALL_EXEMPT_ACTIONS.has(action.type) && !state.pendingWaterfallPlan) {
    const waterfallTriggerThreshold = state.multiplayerSession !== null ? 2 : 1;
    if (countActiveRowSlotsExcludeGhost(state.activeCards) <= waterfallTriggerThreshold) {
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
      const threshold = (slot.upgradeLevel ?? 0) >= 1 ? 6 : 8;
      return `${state.classDamageDiscoverStreak ?? 0}/${threshold}`;
    }
    case 'magic-class-discover':
      return `${state.classMagicDiscoverStreak ?? 0}/5`;
    case 'monster-kill-upgrade':
      return `${state.monsterKillUpgradeProgress ?? 0}/3`;
    case 'swap-upgrade':
      return `${state.swapUpgradeProgress ?? 0}/3`;
    case 'recycle-backpack-expand': {
      const threshold = (slot.upgradeLevel ?? 0) >= 1 ? 6 : 8;
      return `${state.recycleBackpackProgress ?? 0}/${threshold}`;
    }
    case 'manual-recycle-draw':
      return `${state.manualRecycleProgress ?? 0}/2`;
    case 'flip-overkill-lifesteal':
      return `${state.flipOverkillLifestealProgress ?? 0}/5`;
    case 'equip-amulet-cap':
      return `${state.equipAmuletCapProgress ?? 0}/6`;
    case 'stun-attempt-discover':
      return `${state.stunAttemptDiscoverProgress ?? 0}/4`;
    case 'mirror-copy-summon':
      return `${state.mirrorCopySummonStreak ?? 0}/12`;
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
  'INIT_MULTIPLAYER_GAME',
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
    // Trace enqueue — pairs with the `[on-enter-hand] fire` trace emitted by
    // `executeOnEnterHand`. If a bug report shows enqueue without a matching
    // fire, the trigger was lost (pipeline overflow + undo / hydrate wiping
    // `state.actionQueue`). See `docs/auto-draw-debug.md` "Round 4".
    console.debug('[on-enter-hand] enqueue', {
      effectId: card.onEnterHandEffect,
      cardId: card.id,
      cardName: card.name,
      sourceAction: action.type,
    });
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

    case 'INIT_MULTIPLAYER_GAME':
      return reduceInitMultiplayerGame(
        state,
        action.sharedDeck,
        action.role,
        action.roomId,
        action.peerId,
        action.totalWins,
        action.eternalRelics,
      );

  }

  // Delegate to domain reducers. Each returns ReduceResult | null.
  // First match wins; null means "not handled by this domain".

  const delegates = [
    reduceSkillFloatActions,
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
    reduceMultiplayerActions,
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
