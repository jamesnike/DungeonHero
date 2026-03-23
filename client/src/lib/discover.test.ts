import { describe, expect, it } from 'vitest';

import type { GameCardData } from '@/components/GameCard';
import { resolveDiscoverSelection } from './discover';

const mockCard: GameCardData = {
  id: 'test-card',
  name: 'Test Discover Card',
  type: 'magic',
  value: 0,
};

describe('resolveDiscoverSelection', () => {
  it('returns none when no card is provided', () => {
    const result = resolveDiscoverSelection({
      backpackCapacity: 5,
      backpackCount: 0,
      selectedCard: null,
    });

    expect(result).toEqual({ outcome: 'none' });
  });

  it('adds the card when capacity is available', () => {
    const result = resolveDiscoverSelection({
      backpackCapacity: 5,
      backpackCount: 3,
      selectedCard: mockCard,
    });

    expect(result).toEqual({ outcome: 'add', card: mockCard });
  });

  it('returns the card when the backpack is full', () => {
    const result = resolveDiscoverSelection({
      backpackCapacity: 3,
      backpackCount: 3,
      selectedCard: mockCard,
    });

    expect(result).toEqual({ outcome: 'return-full', card: mockCard });
  });
});


