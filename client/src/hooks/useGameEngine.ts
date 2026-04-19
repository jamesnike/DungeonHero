/**
 * React bindings for the GameEngine.
 *
 * useGameEngine()  — returns the engine singleton
 * useGameState(selector) — reactive state slice via useSyncExternalStore
 * useGameEvent(event, handler) — subscribe to engine events for UI effects
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { getGameEngine, type GameEngine, type GameAction, type GameState, type GameEventKey, type GameEventMap } from '@/game-core';

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
 * ```
 *
 * For primitives this works perfectly. For selectors that return new objects,
 * use `useShallowGameState` instead to avoid unnecessary re-renders.
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

function shallowEqual<T extends Record<string, unknown>>(a: T, b: T): boolean {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  for (const key of keysA) {
    if (!Object.is((a as any)[key], (b as any)[key])) return false;
  }
  return true;
}

/**
 * Like `useGameState`, but uses shallow equality to compare the selected
 * object. This prevents re-renders when the selector returns a new object
 * whose fields haven't actually changed.
 *
 * ```tsx
 * const { gold, hp } = useShallowGameState(s => ({ gold: s.gold, hp: s.hp }));
 * ```
 */
export function useShallowGameState<T extends Record<string, unknown>>(
  selector: (state: GameState) => T,
): T {
  const engine = useGameEngine();
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const cachedRef = useRef<T | undefined>(undefined);

  const stableGetSnapshot = useCallback(() => {
    const next = selectorRef.current(engine.getSnapshot());
    if (cachedRef.current !== undefined && shallowEqual(cachedRef.current, next)) {
      return cachedRef.current;
    }
    cachedRef.current = next;
    return next;
  }, [engine]);

  const stableSubscribe = useCallback(
    (onStoreChange: () => void) => engine.subscribe(onStoreChange),
    [engine],
  );

  return useSyncExternalStore(stableSubscribe, stableGetSnapshot);
}

/**
 * Returns a stable dispatch function for sending GameActions to the engine.
 *
 * ```tsx
 * const dispatch = useDispatch();
 * dispatch({ type: 'END_TURN', heroTurnLayerLossIds: [] });
 * ```
 */
export function useDispatch(): (action: GameAction) => void {
  const engine = useGameEngine();
  return useCallback(
    (action: GameAction) => engine.dispatch(action),
    [engine],
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
