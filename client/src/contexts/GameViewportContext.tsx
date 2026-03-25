import { createContext, useContext, type ReactNode } from 'react';

interface GameViewport {
  width: number;
  height: number;
}

const GameViewportContext = createContext<GameViewport>({
  width: typeof window !== 'undefined' ? window.innerWidth : 1280,
  height: typeof window !== 'undefined' ? window.innerHeight : 800,
});

export function GameViewportProvider({
  width,
  height,
  children,
}: GameViewport & { children: ReactNode }) {
  return (
    <GameViewportContext.Provider value={{ width, height }}>
      {children}
    </GameViewportContext.Provider>
  );
}

export function useGameViewport(): GameViewport {
  return useContext(GameViewportContext);
}
