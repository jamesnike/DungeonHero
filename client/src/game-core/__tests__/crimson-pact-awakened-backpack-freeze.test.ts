import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe('双重燃烧（觉醒）— crimson resonance freeze regression', () => {
  function makeFixture() {
    const eventCard = {
      id: 'evt-crimson-awakened',
      type: 'event' as const,
      name: '双重燃烧（觉醒）',
      value: 0,
      description: '使用后进入墓地。',
      eventChoices: [
        {
          text: '觉醒行囊（-5 背包上限，劝降等级 +1）',
          effect: 'backpackSize-5,persuadeLevel+1',
        },
      ],
    } as any;

    const dummyCards = Array.from({ length: 6 }, (_, i) => ({
      id: `bp-${i}`,
      type: 'potion' as const,
      name: `Potion ${i}`,
      value: 1,
    }));

    const activeCards: any[] = [eventCard, null, null, null, null];

    const state = makeState({
      activeCards: activeCards as any,
      currentEventCard: eventCard,
      resolvingDungeonCardId: eventCard.id,
      backpackItems: dummyCards as any,
      backpackCapacityModifier: 0,
      persuadeLevel: 1,
    });
    return { state, eventCard };
  }

  it('drain completes for 觉醒行囊 without exceeding step cap', () => {
    const { state } = makeFixture();
    const result = drain(state, [
      {
        type: 'RESOLVE_EVENT_CHOICE',
        choiceId: '0',
        choiceText: '觉醒行囊',
        effectTokens: ['backpackSize-5', 'persuadeLevel+1'],
        skipFlip: false,
      } as any,
    ]);
    expect(result.overflowed).toBe(false);
    expect(result.state.persuadeLevel).toBe(2);
    expect(result.state.backpackCapacityModifier).toBe(-5);
  });

  it('drain completes when a magic card sits above (crimson resonance flip)', () => {
    const { state, eventCard } = makeFixture();
    const magicAbove = {
      id: 'preview-magic-1',
      type: 'magic' as const,
      name: 'Test Magic',
      value: 0,
      magicType: 'instant' as const,
    };
    const previewCards: any[] = [magicAbove, null, null, null, null];
    const stateWithMagic = { ...state, previewCards: previewCards as any };

    const result = drain(stateWithMagic, [
      {
        type: 'RESOLVE_EVENT_CHOICE',
        choiceId: '0',
        choiceText: '觉醒行囊',
        effectTokens: ['backpackSize-5', 'persuadeLevel+1'],
        skipFlip: false,
      } as any,
    ]);
    expect(result.overflowed).toBe(false);
    expect(result.state.persuadeLevel).toBe(2);
    void eventCard;
  });
});
