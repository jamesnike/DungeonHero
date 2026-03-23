import { useEffect, useRef, useState } from 'react';

import { clearGameState, loadGameState, saveGameState, type PersistedGameState } from '@/lib/gameStorage';

type UseGameBoardStateOptions = {
  persistedState: PersistedGameState;
  hydrateGameState: (snapshot: PersistedGameState) => void;
  initGame: () => void;
  gameOver: boolean;
};

export function useGameBoardState({
  persistedState,
  hydrateGameState,
  initGame,
  gameOver,
}: UseGameBoardStateOptions) {
  const [isHydrated, setIsHydrated] = useState(false);
  const lastPersistedStateRef = useRef<string | null>(null);

  useEffect(() => {
    const snapshot = loadGameState();
    if (snapshot) {
      hydrateGameState(snapshot);
    } else {
      initGame();
    }
    setIsHydrated(true);
  }, [hydrateGameState, initGame]);

  useEffect(() => {
    if (!isHydrated || gameOver) {
      return;
    }
    const serialized = JSON.stringify(persistedState);
    if (lastPersistedStateRef.current === serialized) {
      return;
    }
    lastPersistedStateRef.current = serialized;
    saveGameState(persistedState);
  }, [persistedState, isHydrated, gameOver]);

  useEffect(() => {
    if (!isHydrated || !gameOver) {
      return;
    }
    clearGameState();
    lastPersistedStateRef.current = null;
  }, [gameOver, isHydrated]);

  return {
    isHydrated,
    setIsHydrated,
    lastPersistedStateRef,
  };
}
