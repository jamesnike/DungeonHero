import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import { initialCombatState } from '../constants';
// Registers `potion:heal-12-draw-2`.
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    ...overrides,
  };
}

const POTION = {
  id: 'p-vitality',
  type: 'potion' as const,
  name: '活力秘药',
  value: 0,
  image: '',
  classCard: true,
  potionEffect: 'heal-12-draw-2' as any,
};

const FILLER = (id: string) => ({
  id,
  type: 'magic' as const,
  name: 'Filler',
  value: 0,
  image: '',
});

describe('PLAY_CARD with 活力秘药 (heal-12-draw-2)', () => {
  it('heals 12 HP and draws 2 cards from backpack', () => {
    const backpack = [FILLER('bp1'), FILLER('bp2'), FILLER('bp3')];
    const state = makeState({
      hp: 5,
      handCards: [POTION] as any,
      backpackItems: backpack as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: 'p-vitality' } as GameAction]);

    // Heal: capped at maxHp; here maxHp is the default INITIAL_HP, so 5 + 12 ≤ max.
    // We just assert HP increased by exactly 12 (no max-hp overrides in this state).
    expect(result.state.hp - 5).toBe(12);

    // Draw 2 from backpack into hand (potion itself was consumed).
    // Draw is random from the backpack — only assert counts & origin.
    expect(result.state.backpackItems.length).toBe(1);
    expect(result.state.handCards.length).toBe(2);
    const handIds = result.state.handCards.map(c => c.id);
    expect(handIds.every(id => ['bp1', 'bp2', 'bp3'].includes(id))).toBe(true);

    // Potion should have been consumed (no pending interactive state).
    expect(result.state.pendingPotionAction).toBeFalsy();
  });

  it('respects hand limit — does not draw beyond it', () => {
    // Default HAND_LIMIT is 6. Hand already has potion + 5 fillers = 6 cards.
    // After potion is consumed (hand → 5), we can only fit 1 more, not 2.
    const backpack = [FILLER('bp1'), FILLER('bp2'), FILLER('bp3')];
    const state = makeState({
      hp: 10,
      handCards: [POTION, FILLER('h1'), FILLER('h2'), FILLER('h3'), FILLER('h4'), FILLER('h5')] as any,
      backpackItems: backpack as any,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: 'p-vitality' } as GameAction]);

    // Hand caps at 6 (5 fillers + 1 drawn).
    expect(result.state.handCards.length).toBe(6);
    expect(result.state.backpackItems.length).toBe(2);
  });

  it('still heals when backpack is empty (no draw possible)', () => {
    const state = makeState({
      hp: 3,
      handCards: [POTION] as any,
      backpackItems: [],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: 'p-vitality' } as GameAction]);

    expect(result.state.hp - 3).toBe(12);
    expect(result.state.handCards.length).toBe(0);
    expect(result.state.backpackItems.length).toBe(0);
  });
});
