/**
 * Shared `useCardStamps` instance for the active GameBoard render.
 *
 * The picker (mounted by `CardStampsContainer`) and the row components
 * (`DungeonRow`, `PreviewRow`) all need to read the SAME hook state — the
 * picker's open/close, the snapshot signatures, and the cached lookup
 * results. We expose a single instance via context so they don't each
 * mount their own copy (which would each fetch independently and have
 * unsynced picker state).
 *
 * Pure UI overlay — does not interact with `GameState` or game-core.
 */

import { createContext, useContext, type ReactNode } from 'react';
import { useCardStamps, type UseCardStampsResult } from '@/hooks/useCardStamps';

const CardStampsContext = createContext<UseCardStampsResult | null>(null);

export function CardStampsProvider({ children }: { children: ReactNode }) {
  const value = useCardStamps();
  return <CardStampsContext.Provider value={value}>{children}</CardStampsContext.Provider>;
}

/**
 * Returns the shared `useCardStamps()` instance. Throws if called outside the
 * provider — that's a programming error worth surfacing loudly.
 */
export function useCardStampsContext(): UseCardStampsResult {
  const ctx = useContext(CardStampsContext);
  if (!ctx) {
    throw new Error(
      'useCardStampsContext must be used inside <CardStampsProvider>. Did you forget to wrap GameBoard?',
    );
  }
  return ctx;
}

/**
 * Non-throwing variant for components that may render outside the provider
 * (e.g. shared GameCard used by the title screen / shop preview). Returns
 * `null` instead of throwing, so callers degrade to "no stamp UI".
 */
export function useCardStampsContextOptional(): UseCardStampsResult | null {
  return useContext(CardStampsContext);
}
