/**
 * GameEngine — the single source of truth for all game state.
 *
 * Pure TypeScript, no React dependency. React binds to this via
 * useSyncExternalStore (see useGameEngine hook).
 *
 * Domain logic is progressively added via the domain modules
 * (combat.ts, cards.ts, equipment.ts, etc.) which operate on GameState.
 */

import type { GameState } from './types';
import type { GameAction } from './actions';
import { EventBus, type GameEventKey, type GameEventMap } from './event-bus';
import { createInitialGameState } from './state';
import { reduce } from './reducer';
import { drain } from './pipeline';
import { enqueue } from './queue';
import { DEV_MODE } from './constants';

export { EventBus } from './event-bus';
export { createInitialGameState } from './state';
export type { GameState, GamePhase } from './types';
export type { GameAction } from './actions';
export type { GameEventMap, GameEventKey } from './event-bus';
export type { RngState } from './rng';
export { createRng, nextRandom, nextInt, nextBool, shuffle as rngShuffle, pickRandom, nextId } from './rng';

// Domain modules — re-exported for convenience
export * as combat from './combat';
export * as cards from './cards';
export * as equipment from './equipment';
export * as events from './events';
export * as shop from './shop';
export * as hero from './hero';
export * as waterfall from './waterfall';
export * as monsters from './monsters';
export * as persistence from './persistence';
export * as helpers from './helpers';
export * as buildingAura from './buildingAura';
export * as constants from './constants';
export * as deck from './deck';

// Rules modules
export * as equipmentEffects from './rules/equipment-effects';
export { computeWaterfallDropPlan, computeReturnToDeckInsertion } from './rules/waterfall';
export type { WaterfallDropPlan } from './rules/waterfall';

// Action system
export * as actionQueue from './queue';
export { reduce } from './reducer';
export type { ReduceResult, SideEffect } from './reducer';
export { drain, processStep } from './pipeline';
export type { PipelineResult, StepResult } from './pipeline';

type Listener = () => void;

export class GameEngine {
  private _state: GameState;
  private _listeners = new Set<Listener>();
  private _eventBus = new EventBus();
  private _batchDepth = 0;
  private _batchDirty = false;

  constructor(initialState?: Partial<GameState>) {
    this._state = { ...createInitialGameState(), ...initialState };
  }

  // -----------------------------------------------------------------------
  // Public read API — used by React via useSyncExternalStore
  // -----------------------------------------------------------------------

  getState(): GameState {
    return this._state;
  }

  getSnapshot(): GameState {
    return this._state;
  }

  subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  // -----------------------------------------------------------------------
  // Event bus — UI layer subscribes for animation / sound triggers
  // -----------------------------------------------------------------------

  get events(): EventBus {
    return this._eventBus;
  }

  on<K extends GameEventKey>(event: K, handler: (payload: GameEventMap[K]) => void): () => void {
    return this._eventBus.on(event, handler);
  }

  // -----------------------------------------------------------------------
  // Action dispatch — the new primary API for game logic
  // -----------------------------------------------------------------------

  private _dispatching = false;
  private _dispatchQueue: GameAction[] = [];
  private _actionLogEnabled = false;

  /**
   * Dispatch a game action through the reducer + pipeline.
   *
   * The action is reduced to produce a new state, side effects, and
   * follow-up actions. Follow-up actions are added to the front of the
   * pipeline queue and drained synchronously until the pipeline pauses
   * (awaiting player input) or the queue is empty.
   *
   * Safe to call during a dispatch — re-entrant calls are queued and
   * processed after the current pipeline run completes.
   */
  dispatch(action: GameAction): void {
    if (this._dispatching) {
      this._dispatchQueue.push(action);
      return;
    }

    this._dispatching = true;
    try {
      this._processAction(action);

      // Process any re-entrant dispatches
      while (this._dispatchQueue.length > 0) {
        const next = this._dispatchQueue.shift()!;
        this._processAction(next);
      }
    } finally {
      this._dispatching = false;
    }

    if (this._batchDepth > 0) {
      this._batchDirty = true;
    } else {
      this._notify();
    }
  }

  private _processAction(action: GameAction): void {
    if (this._actionLogEnabled) {
      this._state = {
        ...this._state,
        actionLog: [...this._state.actionLog, { action, timestamp: Date.now() }],
      };
    }

    const hpBefore = this._state.hp;

    // Reduce the action
    const result = reduce(this._state, action);
    this._state = result.state;

    // Sanitize HP — prevent NaN from ever reaching subscribers
    if (!Number.isFinite(this._state.hp)) {
      console.error('[GameEngine] HP became NaN after action:', action.type,
        '| hp before:', hpBefore, '| hp after:', this._state.hp);
      this._state = { ...this._state, hp: Number.isFinite(hpBefore) ? hpBefore : 20 };
    }

    // Emit side effects
    for (const effect of result.sideEffects) {
      this._eventBus.emit(effect.event, effect.payload);
    }

    // If the reducer produced follow-up actions, add them to the
    // front of the state's action queue and drain.
    if (result.enqueuedActions.length > 0) {
      const currentQueue = this._state.actionQueue;
      const newQueue = [...result.enqueuedActions, ...currentQueue];
      this._state = { ...this._state, actionQueue: newQueue };
    }

    // Drain the pipeline (processes queued actions until pause/empty)
    if (this._state.actionQueue.length > 0) {
      const hpBeforeDrain = this._state.hp;
      const pipelineResult = drain(this._state, this._state.actionQueue);
      this._state = {
        ...pipelineResult.state,
        actionQueue: pipelineResult.queue,
      };

      // Sanitize HP after pipeline drain
      if (!Number.isFinite(this._state.hp)) {
        console.error('[GameEngine] HP became NaN during pipeline drain after action:', action.type,
          '| hp before drain:', hpBeforeDrain, '| hp after drain:', this._state.hp);
        this._state = { ...this._state, hp: Number.isFinite(hpBeforeDrain) ? hpBeforeDrain : 20 };
      }

      // Emit accumulated side effects from the pipeline
      for (const effect of pipelineResult.sideEffects) {
        this._eventBus.emit(effect.event, effect.payload);
      }

      if (DEV_MODE && pipelineResult.stepsProcessed > 0) {
        console.debug(
          `[GameEngine] Pipeline processed ${pipelineResult.stepsProcessed} steps.` +
          (pipelineResult.pausedForInput ? ' Paused for player input.' : ' Queue drained.'),
        );
      }
    }
  }

  /** Enable/disable action logging (for debugging / replay). */
  setActionLogEnabled(enabled: boolean): void {
    this._actionLogEnabled = enabled;
  }

  /** Get the current action log. */
  getActionLog(): Array<{ action: GameAction; timestamp: number }> {
    return this._state.actionLog;
  }

  /** Clear the action log. */
  clearActionLog(): void {
    this._state = { ...this._state, actionLog: [] };
  }

  // -----------------------------------------------------------------------
  // State mutation — low-level APIs
  // -----------------------------------------------------------------------

  /**
   * Replace the entire state (used for hydration / undo restore / game init).
   */
  replaceState(state: GameState): void {
    this._state = state;
    if (this._batchDepth > 0) {
      this._batchDirty = true;
    } else {
      this._notify();
    }
  }

  /**
   * Batch multiple dispatch calls into a single notification.
   *
   * ```ts
   * engine.batch(() => {
   *   engine.dispatch({ type: 'SET_GAME_FLAGS', patch: { hp: 10 } });
   *   engine.dispatch({ type: 'SET_PERSUADE_AMULET_BONUS', bonus: 5 });
   *   // listeners notified once after callback returns
   * });
   * ```
   */
  batch(fn: () => void): void {
    this._batchDepth++;
    try {
      fn();
    } finally {
      this._batchDepth--;
      if (this._batchDepth === 0 && this._batchDirty) {
        this._batchDirty = false;
        this._notify();
      }
    }
  }

  /**
   * Convenience: emit a game event (delegates to the event bus).
   */
  emit<K extends GameEventKey>(event: K, payload: GameEventMap[K]): void {
    this._eventBus.emit(event, payload);
  }

  /**
   * Reset engine to a fresh initial state. Useful for "New Game".
   */
  reset(overrides?: Partial<GameState>): void {
    this._state = { ...createInitialGameState(), ...overrides };
    this._notify();
  }

  /**
   * Destroy the engine: remove all listeners and event handlers.
   */
  destroy(): void {
    this._listeners.clear();
    this._eventBus.removeAllListeners();
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private _notify(): void {
    this._listeners.forEach(listener => {
      try {
        listener();
      } catch (err) {
        console.error('[GameEngine] Error in state listener:', err);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor
// ---------------------------------------------------------------------------

let _instance: GameEngine | null = null;

export function getGameEngine(): GameEngine {
  if (!_instance) {
    _instance = new GameEngine();
  }
  return _instance;
}

export function resetGameEngine(overrides?: Partial<GameState>): GameEngine {
  if (_instance) {
    _instance.destroy();
  }
  _instance = new GameEngine(overrides);
  return _instance;
}
