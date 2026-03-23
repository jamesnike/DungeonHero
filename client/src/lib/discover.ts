import type { GameCardData } from '@/components/GameCard';

export type DiscoverResolution =
  | { outcome: 'none' }
  | { outcome: 'add'; card: GameCardData }
  | { outcome: 'return-full'; card: GameCardData };

interface ResolveDiscoverOptions {
  backpackCount: number;
  backpackCapacity: number;
  selectedCard: GameCardData | null | undefined;
}

/**
 * Returns a deterministic outcome for a discover selection so the logic
 * can be unit-tested outside of the React component.
 */
export function resolveDiscoverSelection({
  backpackCount,
  backpackCapacity,
  selectedCard,
}: ResolveDiscoverOptions): DiscoverResolution {
  if (!selectedCard) {
    return { outcome: 'none' };
  }

  if (backpackCount >= backpackCapacity) {
    return { outcome: 'return-full', card: selectedCard };
  }

  return { outcome: 'add', card: selectedCard };
}


