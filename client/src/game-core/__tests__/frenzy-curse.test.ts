/**
 * 战狂诅咒 (frenzy curse) tests
 *
 * Covers:
 *   1. Curse play resolution (RESOLVE_MAGIC entry):
 *      - Enqueues APPLY_DAMAGE 1 (selfInflicted) — the "失去 1 生命" cost
 *      - Enqueues DRAW_FROM_BACKPACK count 1
 *      - Enqueues FINALIZE_MAGIC_CARD (which routes curses back to backpack,
 *        not graveyard — verified separately by FINALIZE_MAGIC_CARD's curse
 *        branch in rules/cards.ts)
 *      - Loses exactly 1 HP and does NOT modify gold
 *   2. On-enter-hand handler (frenzy-curse-onhand):
 *      - Adds +1 to slotTempAttack of one randomly-chosen slot
 *      - Advances rng
 *   3. End-to-end: drawing the curse from backpack triggers the on-enter-hand
 *      buff via the standard postProcessHandEntries pipeline.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import { createRng } from '../rng';
// Importing this barrel registers the curse handler (engine.ts curse branch)
// and the frenzy-curse-onhand on-enter-hand handler.
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeFrenzyCurse(idSuffix = 'fc'): GameCardData {
  return {
    id: `curse-${idSuffix}`,
    type: 'curse',
    name: '战狂诅咒',
    value: 0,
    image: '',
    classCard: true,
    description: 'test',
    curseEffect: 'frenzy-curse',
    onEnterHandEffect: 'frenzy-curse-onhand',
  } as any;
}

// ---------------------------------------------------------------------------
// Play resolution: RESOLVE_MAGIC
// ---------------------------------------------------------------------------

describe('战狂诅咒 — play resolution', () => {
  it('enqueues APPLY_DAMAGE 1 (self), DRAW_FROM_BACKPACK and FINALIZE_MAGIC_CARD when played', () => {
    const card = makeFrenzyCurse('play-1');
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'RESOLVE_MAGIC', cardId: card.id, card } as GameAction);

    const damageActions = result.enqueuedActions.filter(a => a.type === 'APPLY_DAMAGE');
    expect(damageActions).toHaveLength(1);
    expect((damageActions[0] as any).amount).toBe(1);
    expect((damageActions[0] as any).selfInflicted).toBe(true);
    expect((damageActions[0] as any).source).toBe('frenzy-curse');

    const drawActions = result.enqueuedActions.filter(a => a.type === 'DRAW_FROM_BACKPACK');
    expect(drawActions).toHaveLength(1);
    expect((drawActions[0] as any).count).toBe(1);

    const finalizeActions = result.enqueuedActions.filter(a => a.type === 'FINALIZE_MAGIC_CARD');
    expect(finalizeActions).toHaveLength(1);
  });

  it('loses exactly 1 HP and does not modify gold on play', () => {
    const card = makeFrenzyCurse('play-hp-cost');
    const state = makeState({ handCards: [card], hp: 20, gold: 7 });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: card.id, card } as GameAction,
    ]);
    expect(result.state.hp).toBe(19);
    expect(result.state.gold).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// On-enter-hand handler: frenzy-curse-onhand
// ---------------------------------------------------------------------------

describe('frenzy-curse-onhand handler', () => {
  it('adds +1 to slotTempAttack of one random slot', () => {
    const card = makeFrenzyCurse('onhand-1');
    const state = makeState({
      handCards: [card],
      rng: createRng(42),
    });
    const result = reduce(state, { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction);

    const left = result.state.slotTempAttack?.equipmentSlot1 ?? 0;
    const right = result.state.slotTempAttack?.equipmentSlot2 ?? 0;
    expect(left + right).toBe(1);
    expect(left === 1 || right === 1).toBe(true);
  });

  it('preserves existing slotTempAttack values from other sources', () => {
    const card = makeFrenzyCurse('onhand-stack');
    const state = makeState({
      handCards: [card],
      rng: createRng(1),
      slotTempAttack: { equipmentSlot1: 3, equipmentSlot2: 5 },
    });
    const result = reduce(state, { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction);
    const left = result.state.slotTempAttack?.equipmentSlot1 ?? 0;
    const right = result.state.slotTempAttack?.equipmentSlot2 ?? 0;
    expect(left + right).toBe(9);
  });

  it('advances rng when picking the slot', () => {
    const card = makeFrenzyCurse('onhand-rng');
    const initialRng = createRng(123);
    const state = makeState({ handCards: [card], rng: initialRng });
    const result = reduce(state, { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction);
    expect(result.state.rng).not.toBe(initialRng);
  });

  it('fires automatically via the pipeline when ADD_CARD_TO_HAND adds the card', () => {
    const card = makeFrenzyCurse('onhand-pipeline');
    const state = makeState({ handCards: [], rng: createRng(7) });
    const result = drain(state, [
      { type: 'ADD_CARD_TO_HAND', card } as GameAction,
    ]);
    const left = result.state.slotTempAttack?.equipmentSlot1 ?? 0;
    const right = result.state.slotTempAttack?.equipmentSlot2 ?? 0;
    expect(left + right).toBe(1);
  });
});
