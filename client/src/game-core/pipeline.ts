/**
 * Resolution Pipeline — drives the action queue to completion.
 *
 * The pipeline processes queued actions one at a time. After each action,
 * any follow-up actions returned by the reducer are prepended to the queue
 * (so sub-steps execute before the next top-level action).
 *
 * The pipeline pauses when:
 *   - The queue is empty (all done)
 *   - The state enters an "awaiting input" phase (player must act)
 *   - A safety limit is reached (prevents infinite loops)
 *
 * All functions are pure — they take state + queue and return updated
 * versions. The GameEngine wraps this with notification and event emission.
 */

import type { GameState } from './types';
import type { GameAction } from './actions';
import type { SideEffect } from './reducer';
import { reduce } from './reducer';
import { dequeue, enqueueFront, isEmpty } from './queue';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipelineResult {
  /** Final state after processing. */
  state: GameState;
  /** Remaining queue (may be non-empty if paused for input). */
  queue: GameAction[];
  /** All side effects accumulated during processing. */
  sideEffects: SideEffect[];
  /** Number of actions processed in this run. */
  stepsProcessed: number;
  /** True if the pipeline paused due to awaiting player input. */
  pausedForInput: boolean;
  /**
   * True if the pipeline aborted because it hit `MAX_STEPS`. The remaining
   * actions are returned in `queue` and will (best-effort) drain on the next
   * dispatch — but if a subsequent `replaceState` (undo / hydrate) wipes the
   * queue first, those actions are lost. See `docs/auto-draw-debug.md`
   * "Round 4" for the failure mode this surfaces.
   */
  overflowed: boolean;
}

/** Phases that pause the pipeline to wait for player input. */
const INPUT_PHASES = new Set([
  'awaitingBlock',
  'playerInput',
  'awaitingTarget',
  'awaitingDice',
  'awaitingEventChoice',
  'awaitingShopAction',
  'awaitingRewardChoice',
  'awaitingPotionTarget',
  'awaitingMagicTarget',
  'awaitingDeathWard',
  'awaitingEquipmentPrompt',
  'awaitingDiscoverChoice',
  'awaitingUpgradeChoice',
  'awaitingDeleteChoice',
]);

/**
 * Phases that pause the pipeline UNCONDITIONALLY — even if the next queued
 * action would normally count as an `isInputContinuation`. Used by the
 * monster-skill float queue: while a float is on screen, NOTHING in the
 * pipeline (combat continuations, monster turn advancement, etc.) is allowed
 * to advance until the UI dispatches RELEASE_MONSTER_SKILL_FLOAT and pops
 * the queue empty. RELEASE / TRIGGER themselves are explicitly allowed
 * through (see `isInputContinuation`).
 */
const HARD_PAUSE_PHASES = new Set([
  'awaitingSkillFloat',
]);

/**
 * Actions allowed to run while in a HARD_PAUSE phase. Strictly the two
 * skill-float queue actions — everything else (damage, heal, monster turn,
 * card draws, etc.) MUST wait for the queue to drain.
 */
function isHardPauseContinuation(action: GameAction): boolean {
  return (
    action.type === 'RELEASE_MONSTER_SKILL_FLOAT' ||
    action.type === 'TRIGGER_MONSTER_SKILL_FLOAT'
  );
}

/**
 * Hard ceiling on actions drained per dispatch. Bumped from 200 to 500 after
 * a real-game report where a late-game combo (long-chain echo + amulet aura
 * cascade + on-enter-hand triggers) exceeded the old cap and silently left
 * `TRIGGER_ON_ENTER_HAND` undrained — combined with a follow-up undo that
 * wiped the queue, the on-enter-hand effect was lost forever. 500 still
 * comfortably catches genuine infinite loops; observed real chains stay
 * under 300. See `docs/auto-draw-debug.md` "Round 4".
 */
const MAX_STEPS = 500;

// ---------------------------------------------------------------------------
// Process a single action (exposed for testing)
// ---------------------------------------------------------------------------

export interface StepResult {
  state: GameState;
  queue: GameAction[];
  sideEffects: SideEffect[];
}

export function processStep(state: GameState, queue: GameAction[]): StepResult {
  const [action, remaining] = dequeue(queue);
  if (!action) {
    return { state, queue: remaining, sideEffects: [] };
  }

  const result = reduce(state, action);

  // Prepend follow-up actions so sub-steps resolve before the rest
  const newQueue = enqueueFront(remaining, result.enqueuedActions);

  return {
    state: result.state,
    queue: newQueue,
    sideEffects: result.sideEffects,
  };
}

// ---------------------------------------------------------------------------
// Drain: process all queued actions until pause or completion
// ---------------------------------------------------------------------------

export function drain(state: GameState, queue: GameAction[]): PipelineResult {
  let current = state;
  let currentQueue = queue;
  const allSideEffects: SideEffect[] = [];
  let steps = 0;

  while (!isEmpty(currentQueue) && steps < MAX_STEPS) {
    // HARD pause: monster-skill float queue. Even continuation actions are
    // blocked here — the queue must drain to zero before any further game
    // logic can run. Only RELEASE / TRIGGER skill-float actions are allowed
    // through, which is what unsticks the queue.
    if (current.phase && HARD_PAUSE_PHASES.has(current.phase)) {
      const next = currentQueue[0];
      if (!next || !isHardPauseContinuation(next)) {
        return {
          state: current,
          queue: currentQueue,
          sideEffects: allSideEffects,
          stepsProcessed: steps,
          pausedForInput: true,
          overflowed: false,
        };
      }
    }

    // Check if we should pause for player input BEFORE processing
    if (current.phase && INPUT_PHASES.has(current.phase)) {
      // Only pause if the queue's next action isn't a continuation trigger
      const next = currentQueue[0];
      if (next && isInputContinuation(next)) {
        // This is a player response — keep processing
      } else {
        return {
          state: current,
          queue: currentQueue,
          sideEffects: allSideEffects,
          stepsProcessed: steps,
          pausedForInput: true,
          overflowed: false,
        };
      }
    }

    const stepResult = processStep(current, currentQueue);
    current = stepResult.state;
    currentQueue = stepResult.queue;
    allSideEffects.push(...stepResult.sideEffects);
    steps++;

    // After processing, check hard pause again (the action we just ran may
    // have switched to 'awaitingSkillFloat'). Same rule: only skill-float
    // actions allowed through.
    if (current.phase && HARD_PAUSE_PHASES.has(current.phase) && !isEmpty(currentQueue)) {
      const next = currentQueue[0];
      if (!next || !isHardPauseContinuation(next)) {
        return {
          state: current,
          queue: currentQueue,
          sideEffects: allSideEffects,
          stepsProcessed: steps,
          pausedForInput: true,
          overflowed: false,
        };
      }
    }

    // After processing, check if the new state requires input
    if (current.phase && INPUT_PHASES.has(current.phase) && !isEmpty(currentQueue)) {
      const next = currentQueue[0];
      if (!next || !isInputContinuation(next)) {
        return {
          state: current,
          queue: currentQueue,
          sideEffects: allSideEffects,
          stepsProcessed: steps,
          pausedForInput: true,
          overflowed: false,
        };
      }
    }
  }

  // If we exited because we hit the cap (queue still non-empty), flag it
  // loudly: always log (regardless of DEV_MODE — players need to see this
  // in bug reports), and emit a `pipeline:overflow` SideEffect so UI can
  // surface a non-blocking banner to the player.
  const overflowed = steps >= MAX_STEPS && !isEmpty(currentQueue);
  if (overflowed) {
    const headActionTypes = currentQueue.slice(0, 5).map(a => a.type);
    console.error(
      `[pipeline] Safety limit reached (${MAX_STEPS} steps). ` +
      `${currentQueue.length} action(s) left undrained: ${headActionTypes.join(', ')}` +
      (currentQueue.length > 5 ? ', ...' : ''),
    );
    allSideEffects.push({
      event: 'pipeline:overflow',
      payload: {
        stepsProcessed: steps,
        remainingQueueLength: currentQueue.length,
        headActionTypes,
      },
    });
  }

  return {
    state: current,
    queue: currentQueue,
    sideEffects: allSideEffects,
    stepsProcessed: steps,
    pausedForInput: false,
    overflowed,
  };
}

/**
 * Actions that should continue processing even when the pipeline is in an
 * input-awaiting phase. This includes both player responses and internal
 * follow-up actions enqueued by the reducer (damage, heals, card routing, etc.).
 *
 * Only actions that genuinely require a NEW player decision (not already
 * in-flight) should be excluded — those are the ones the pipeline pauses for.
 */
function isInputContinuation(action: GameAction): boolean {
  switch (action.type) {
    // Combat — player responses
    case 'RESOLVE_BLOCK':
    case 'PLAY_CARD':
    case 'PERFORM_HERO_ATTACK':
    case 'PERFORM_SHIELD_BASH':
    case 'END_TURN':
    // Combat — internal follow-ups
    case 'DEAL_DAMAGE_TO_MONSTER':
    case 'MONSTER_DEFEATED':
    case 'APPLY_DAMAGE':
    case 'APPLY_DRAGON_BREATH_RETALIATION':
    case 'APPLY_SHIELD_REFLECT':
    case 'DECREMENT_FURY':
    case 'BEGIN_COMBAT':
    case 'ADVANCE_MONSTER_TURN':
    case 'APPLY_MONSTER_TURN_END_EFFECTS':
    case 'APPLY_HERO_KILL_EFFECTS':
    case 'CHECK_HONOR_SWEEP_UPGRADES':
    // Wraith purification — internal follow-up enqueued by MONSTER_DEFEATED
    // when a wraith dies. Must run immediately so the unlock popup fires
    // right after the kill, not after the player dismisses the reward modal
    // (which would otherwise block the queue in `awaitingRewardChoice`).
    case 'CHECK_WRAITH_PURIFICATION':
    // Event — player responses
    case 'RESOLVE_EVENT_CHOICE':
    case 'COMPLETE_EVENT':
    case 'FINALIZE_EVENT':
    // Event — internal follow-ups
    case 'APPLY_CARD_FLIP':
    case 'APPLY_EVENT_EFFECT':
    // Shop — player responses
    case 'CLOSE_SHOP':
    case 'PURCHASE':
    case 'SHOP_HEAL':
    case 'SHOP_LEVEL_UP':
    case 'SHOP_DELETE_EQUIPMENT':
    case 'SHOP_DISCOVER':
    case 'SHOP_EQUIP_BOOST':
    case 'SHOP_SELECT_SKILL':
    // Reward continuations
    case 'APPLY_MONSTER_REWARD':
    case 'DEQUEUE_MONSTER_REWARD':
    case 'BEGIN_DISCOVER':
    case 'RESOLVE_DISCOVER_SELECTION':
    // Pending-action continuations (player chose a target / dismissed modal)
    case 'SET_PENDING_MAGIC':
    case 'SET_PENDING_POTION':
    case 'SET_PENDING_HERO_SKILL':
    case 'SET_PENDING_HERO_MAGIC':
    case 'SET_DEATH_WARD_PROMPT':
    case 'SET_EQUIPMENT_PROMPT':
    // Card resolution — player responses & continuations
    case 'RESOLVE_POTION':
    case 'RESOLVE_MAGIC':
    case 'FINALIZE_POTION_CARD':
    case 'FINALIZE_MAGIC_CARD':
    case 'FINALIZE_CARD_PLAY':
    // Hero skill/magic continuations
    case 'USE_HERO_SKILL':
    case 'ACTIVATE_HERO_MAGIC':
    case 'COMPLETE_HERO_MAGIC':
    case 'APPLY_REVIVE_BLESSING':
    case 'APPLY_BERSERKER_RAGE':
    // Card deletion / upgrade continuations
    case 'DELETE_CARD':
    case 'UPGRADE_CARD':
    // Interactive response continuations
    case 'RESOLVE_DICE':
    case 'ROLL_DICE_FOR_FLOW':
    case 'RESOLVE_EQUIPMENT_CHOICE':
    case 'RESOLVE_MAGIC_CHOICE':
    case 'RESOLVE_CARD_ACTION':
    case 'RESOLVE_GRAVEYARD_SELECTION':
    case 'RESOLVE_STAT_SWAP':
    case 'RESOLVE_REPAIR_ENRAGE_DICE':
    // Internal state mutations enqueued by reducers
    case 'HEAL':
    case 'MODIFY_GOLD':
    case 'MODIFY_PERMANENT_STAT':
    case 'MODIFY_STUN_CAP':
    case 'MODIFY_EQUIPMENT_DURABILITY':
    case 'ADD_TO_GRAVEYARD':
    case 'ADD_TO_RECYCLE_BAG':
    case 'ADD_TO_BACKPACK':
    case 'ADD_CARDS_TO_HAND':
    case 'ADD_PERMANENT_MAGIC_TO_RECYCLE':
    case 'ADD_MAGIC_GAUGE':
    case 'ADD_BERSERK_BUFF':
    case 'DRAW_CARDS':
    case 'DRAW_FROM_BACKPACK':
    case 'DRAW_CLASS_TO_BACKPACK':
    case 'ENFORCE_BACKPACK_CAPACITY':
    case 'RESTORE_RECYCLE_BAG':
    case 'REMOVE_CLASS_CARD_FROM_HAND':
    // Card disposition router — enqueued by reducers (notably waterfall.ts
    // `reduceApplyWaterfallDiscardEffects` `sendToGraveyardUnlessFinal`,
    // and every "player discards a hand card" magic resolver: 专属召唤 /
    // 汰旧迎新 / 回响行囊 / 噬血砺锋 / 祭坛秘术 / etc.) when a card needs
    // to be routed to graveyard or recycle bag.
    //
    // Bug history: when 血咒仪式 (waterfallEffect: boostRowMonsterAttack)
    // was pushed off by waterfall under phase='playerInput', the enqueued
    // DISCARD_OWNED_CARD was stranded in the queue — the card disappeared
    // from the preview row but never reached `discardedCards`. The same
    // hole affects every waterfall-discard path (all 7 waterfallEffect
    // branches + the no-effect default branch all funnel through
    // `sendToGraveyardUnlessFinal`), plus every magic resolver that
    // discards a hand card while the game is in playerInput.
    case 'DISCARD_OWNED_CARD':
    // DISCARD_ALL_HAND — enqueued by waterfall.ts `destroyAllAmuletsAndDiscardHand`
    // (诅咒骰局 瀑流) and by hand-wide-discard magic effects. Reducer fans out
    // into N x DISCARD_OWNED_CARD, one per non-curse hand card. Stranded under
    // playerInput → "整个批量弃手牌不发生", no card in hand reaches the
    // graveyard. Same root cause as DISCARD_OWNED_CARD above.
    case 'DISCARD_ALL_HAND':
    // DISPOSE_EQUIPMENT_CARD — enqueued by waterfall.ts `destroyAllEquipment`
    // (贪婪 boss 瀑流) and by every equipment-displace path (新装备顶替旧装备
    // 时 fromSlot 被 push 出去). Reducer routes the equipment to graveyard /
    // recycle bag (Perm) / 残骸回收符 回手牌. Stranded under playerInput →
    // 装备从槽位消失但不进任何目的地。Same root cause.
    case 'DISPOSE_EQUIPMENT_CARD':
    // REMOVE_PREVIEW_CARD_STACKS — enqueued by waterfall.ts when a discarded
    // preview column had stacked cards (those stacks need their index entry
    // removed from `state.previewCardStacks`). Pure metadata patch, doesn't
    // route any card itself, but stranding it leaves the stacks map
    // referencing a column that no longer exists in the preview row, which
    // can mis-render the next preview frame.
    case 'REMOVE_PREVIEW_CARD_STACKS':
    // ADD_CARD_TO_HAND — enqueued by waterfall.ts equipment-destroy
    // last-words (`graveyard-to-hand` keyword: pull a card from graveyard
    // back to hand when this equipment dies). Stranded under playerInput
    // → 应该到玩家手牌的那张卡停在队列里，玩家以为效果没触发。
    case 'ADD_CARD_TO_HAND':
    case 'APPLY_DISCARD_EFFECTS':
    case 'UPDATE_MONSTER_CARD':
    case 'REGISTER_DUNGEON_CARD_PROCESSED':
    case 'SET_HERO_SKILL_BANNER':
    // Game log append — pure state mutation enqueued by reducers (notably
    // reduceResolveDice for stun flows like 震慑领域). NEVER an input action.
    // Bug history: when stun-domain's last RESOLVE_DICE enqueued
    // [UPDATE_GAME_LOG, FINALIZE_MAGIC_CARD] under phase='playerInput',
    // drain paused on UPDATE_GAME_LOG and FINALIZE_MAGIC_CARD never ran —
    // the card stayed in limbo (gone from hand, never reaching graveyard).
    case 'UPDATE_GAME_LOG':
    case 'SET_COMBAT_FLAG':
    case 'SET_GAMBIT_STATE':
    case 'SET_UPGRADE_MODAL_OPEN':
    case 'CHECK_HORDE_SWARM':
    case 'CHECK_ELITE_GOLD_BUFF':
    // Monster enter-effect dispatch — enqueued by APPLY_WATERFALL_DROP /
    // DRAW_DUNGEON_ROW / TRIGGER_WATERFALL whenever a new monster lands on
    // the active row. Bug history: when an Ogre (`enterEffect: 'auto-engage'`)
    // dropped via waterfall, the MONSTER_ENTERED_ROW follow-up was stranded
    // in the queue because phase='playerInput' and this case was missing from
    // the continuation list. The auto-engage float + BEGIN_COMBAT then fired
    // at the next user action (e.g. when the player attacked the ogre),
    // making it look like the enter effect triggered on death. Same hole
    // affected the elite ogre's `ogreEnterDiscard` (震慑) which shares
    // this dispatch path.
    case 'MONSTER_ENTERED_ROW':
    case 'START_TURN':
    case 'ENTER_PLAYER_INPUT':
    case 'TRIGGER_GRAVE_NOVA':
    case 'FIRE_MISSILE_STORM_BOLT':
    case 'PROCESS_HERO_MAGIC_CARD':
    // 上手 (on-enter-hand) keyword — enqueued by postProcessHandEntries when
    // a card with `onEnterHandEffect` is detected as newly added to handCards
    // (auto-draw / draw / restore from recycle bag). Must run as a continuation
    // so the effect fires while the game is in playerInput phase, otherwise
    // the trigger gets stuck in the queue and the card never amplifies / heals
    // / etc. (e.g. 生长之刃 stays at base attack value).
    case 'TRIGGER_ON_ENTER_HAND':
    case 'AMPLIFY_CARDS_BY_NAME':
    // Auto-draw drain — dispatched from useEventSystem after a dungeon card is
    // processed. Always a follow-up to gameplay, never a new player decision.
    case 'PROCESS_AUTO_DRAWS':
    // Transform chain — enqueued by RESOLVE_MAGIC / RESOLVE_POTION /
    // SET_CURRENT_EVENT / COMPLETE_HERO_MAGIC / PLACE_BUILDING_IN_DUNGEON /
    // EQUIP_* as a follow-up; never a player input action.
    case 'APPLY_TRANSFORM_CATEGORY':
    // Monster skill float queue — these actions are how the game enters /
    // exits the HARD_PAUSE state. They must always be processable so the
    // animation queue can drain; the HARD_PAUSE check above ensures the
    // queue is the ONLY thing that runs while a float is on screen.
    case 'TRIGGER_MONSTER_SKILL_FLOAT':
    case 'RELEASE_MONSTER_SKILL_FLOAT':
      return true;
    default:
      return false;
  }
}
