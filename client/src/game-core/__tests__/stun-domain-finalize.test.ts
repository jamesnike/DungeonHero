import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeStunDomain() {
  return {
    id: 'magic-stun-domain-test',
    type: 'magic' as const,
    name: '震慑领域',
    value: 0,
    image: '',
    magicType: 'instant' as const,
    magicEffect: '击晕上限 +5%。对激活行所有怪物 60% 击晕。',
    knightEffect: 'stun-wave',
  };
}

function makeMonster(id: string) {
  return {
    id,
    type: 'monster' as const,
    name: 'Goblin',
    value: 1,
    hp: 10,
    maxHp: 10,
    attack: 0,
    currentLayer: 1,
    fury: 1,
    hpLayers: 1,
  };
}

function activeRowOf(...monsters: any[]): ActiveRowSlots {
  const row: any[] = [null, null, null, null, null];
  for (let i = 0; i < monsters.length && i < 5; i++) row[i] = monsters[i];
  return row as unknown as ActiveRowSlots;
}

// Regression: 震慑领域 (stun-wave) — after the last monster's stun dice resolves,
// reduceResolveDice enqueues [UPDATE_GAME_LOG, FINALIZE_MAGIC_CARD] under
// phase='playerInput'. Before the fix, the pipeline paused on UPDATE_GAME_LOG
// (not in isInputContinuation) and FINALIZE_MAGIC_CARD never ran — the card
// vanished from the hand but never landed in the graveyard ("stuck").
describe('震慑领域 finalizes after multi-monster dice flow', () => {
  it('moves the card to graveyard after every monster has rolled', () => {
    const card = makeStunDomain();
    const state = makeState({
      handCards: [card] as any,
      stunCap: 100,
      activeCards: activeRowOf(makeMonster('m1'), makeMonster('m2')) as any,
    });

    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const dice1 = r1.sideEffects.find(s => s.event === ('ui:requestDice' as any));
    expect(dice1).toBeDefined();

    const ctx1 = (dice1 as any).payload.flowContext;
    const r2 = drain(r1.state, [
      { type: 'RESOLVE_DICE', value: 1, outcomeId: 'stun', context: { ...ctx1 } } as GameAction,
    ]);
    const dice2 = r2.sideEffects.find(s => s.event === ('ui:requestDice' as any));
    expect(dice2).toBeDefined();

    const ctx2 = (dice2 as any).payload.flowContext;
    const r3 = drain(r2.state, [
      { type: 'RESOLVE_DICE', value: 1, outcomeId: 'stun', context: { ...ctx2 } } as GameAction,
    ]);

    expect(r3.state.handCards.find(c => c?.name === '震慑领域')).toBeUndefined();
    expect(r3.state.discardedCards.find(c => c?.name === '震慑领域')).toBeDefined();
    expect(r3.state.permanentMagicRecycleBag.find(c => c?.name === '震慑领域')).toBeUndefined();
    expect(r3.sideEffects.some(s => s.event === ('card:magicFinalized' as any))).toBe(true);
  });
});
