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
import { EventBus, type GameEventKey, type GameEventMap } from './event-bus';
import { createInitialGameState } from './state';

export { EventBus } from './event-bus';
export { createInitialGameState } from './state';
export type { GameState } from './types';
export type { GameEventMap, GameEventKey } from './event-bus';

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

type StateUpdater = Partial<GameState> | ((prev: GameState) => Partial<GameState>);
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
  // State mutation — used by domain modules
  // -----------------------------------------------------------------------

  /**
   * Update the game state. Accepts either a partial state object or an
   * updater function that receives the previous state and returns a partial.
   *
   * When called outside a batch, listeners are notified immediately.
   * Inside a batch (see `batch()`), notification is deferred until the
   * outermost batch completes.
   */
  setState(updater: StateUpdater): void {
    const patch = typeof updater === 'function' ? updater(this._state) : updater;
    this._state = { ...this._state, ...patch };

    if (this._batchDepth > 0) {
      this._batchDirty = true;
    } else {
      this._notify();
    }
  }

  /**
   * Replace the entire state (used for hydration / undo restore).
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
   * Batch multiple setState calls into a single notification.
   *
   * ```ts
   * engine.batch(() => {
   *   engine.setState({ hp: 10 });
   *   engine.setState({ gold: 5 });
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
