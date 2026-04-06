/**
 * React bindings for the GameEngine.
 *
 * useGameEngine()  — returns the engine singleton
 * useGameState(selector) — reactive state slice via useSyncExternalStore
 * useGameEvent(event, handler) — subscribe to engine events for UI effects
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { getGameEngine, type GameEngine, type GameState, type GameEventKey, type GameEventMap } from '@/game-core';

/**
 * Returns the GameEngine singleton. Stable across renders.
 */
export function useGameEngine(): GameEngine {
  return useMemo(() => getGameEngine(), []);
}

/**
 * Subscribe to a slice of game state. Re-renders only when the selected
 * value changes (by reference equality).
 *
 * ```tsx
 * const hp = useGameState(s => s.hp);
 * const { gold, turnCount } = useGameState(s => ({ gold: s.gold, turnCount: s.turnCount }));
 * ```
 *
 * Note: if the selector returns a new object each time (like the second
 * example above), every engine state change will trigger a re-render of
 * this component. For fine-grained control, select primitives or use
 * React.memo / useMemo to stabilize objects.
 */
export function useGameState<T>(selector: (state: GameState) => T): T {
  const engine = useGameEngine();

  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const stableGetSnapshot = useCallback(
    () => selectorRef.current(engine.getSnapshot()),
    [engine],
  );

  const stableSubscribe = useCallback(
    (onStoreChange: () => void) => engine.subscribe(onStoreChange),
    [engine],
  );

  return useSyncExternalStore(stableSubscribe, stableGetSnapshot);
}

/**
 * Create a setter function for a single GameState field that mirrors the
 * React `useState` setter API: accepts either a value or an updater
 * function. Delegates to `engine.setState()` so the engine remains the
 * single source of truth.
 *
 * ```tsx
 * const setHp = useEngineSetter('hp');
 * setHp(10);             // direct value
 * setHp(prev => prev + 1); // updater function
 * ```
 */
export function useEngineSetter<K extends keyof GameState>(key: K) {
  const engine = useGameEngine();
  return useCallback(
    (value: GameState[K] | ((prev: GameState[K]) => GameState[K])) => {
      if (typeof value === 'function') {
        engine.setState(prev => ({
          [key]: (value as (p: GameState[K]) => GameState[K])(prev[key]),
        }));
      } else {
        engine.setState({ [key]: value } as Partial<GameState>);
      }
    },
    [engine, key],
  );
}

/**
 * Subscribe to a game event emitted by the engine. The handler is
 * automatically cleaned up on unmount.
 *
 * ```tsx
 * useGameEvent('combat:monsterDamaged', ({ monsterId, damage }) => {
 *   triggerBleedAnimation(monsterId);
 * });
 * ```
 */
export function useGameEvent<K extends GameEventKey>(
  event: K,
  handler: (payload: GameEventMap[K]) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const engine = useGameEngine();

  useEffect(() => {
    const unsub = engine.on(event, (payload) => {
      handlerRef.current(payload);
    });
    return unsub;
  }, [engine, event]);
}
