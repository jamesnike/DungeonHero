import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import { createRng } from '../rng';
import { STARTER_CARD_IDS } from '../deck';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe('REPRO: 查阅动作 上手 in playerInput phase', () => {
  it('FAILS: 上手 does not fire when phase is playerInput', () => {
    const card: any = {
      id: `${STARTER_CARD_IDS.surveyAction}-pick-1`,
      type: 'magic',
      name: '查阅动作',
      value: 0,
      image: '',
      magicType: 'permanent',
      magicEffect: '永久魔法：从背包抽 1 张牌。',
      onEnterHandEffect: 'survey-action-onhand',
    };
    const state = makeState({
      handCards: [],
      backpackItems: [card],
      rng: createRng(42),
      phase: 'playerInput',
    });
    const result = drain(state, [
      { type: 'DRAW_CARDS', count: 1, source: 'backpack' } as GameAction,
    ]);
    const left = result.state.slotTempAttack?.equipmentSlot1 ?? 0;
    const right = result.state.slotTempAttack?.equipmentSlot2 ?? 0;
    console.log('Hand:', result.state.handCards.map(c => c.id));
    console.log('Queue remaining:', result.queue.map(q => q.type));
    console.log('Paused for input:', result.pausedForInput);
    console.log('slotTempAttack:', result.state.slotTempAttack);
    expect(left + right).toBe(1);
  });
});
