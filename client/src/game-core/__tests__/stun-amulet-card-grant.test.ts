/**
 * 震慑之符 (`amuletEffect: 'stun-upgrade-cap'`) — redesign: every monster stun
 * grants 1 Instant magic「震慑符印」(`magicEffect: 'stun-sigil'`) per amulet
 * (Discrete event ×N stacking pattern). The 震慑符印 picks a monster and rolls
 * a single hero-stun dice with success rate = current `state.stunCap`.
 *
 * Coverage matrix:
 *
 * 1. Aggregator: `computeAmuletEffectsForState` returns
 *    `stunCardGrantCount = N` when N copies of 震慑之符 are equipped.
 *
 * 2. End-to-end stun grant via RESOLVE_DICE 'hero-stun' 'stun' outcome:
 *    - 1 amulet → 1 card to hand
 *    - 3 amulets → 3 cards to hand (Discrete event ×N)
 *    - hand near limit → overflow lands in backpack
 *
 * 3. PLAY_CARD on 震慑符印:
 *    - sets pendingMagicAction.effect = 'stun-sigil' with stunPct = state.stunCap
 *    - empty active row → fizzles (no picker, no dice)
 *    - all monsters already stunned → fizzles
 *
 * 4. RESOLVE_MAGIC_MONSTER_SELECTION on 震慑符印:
 *    - normal path: requests `flowId: 'hero-stun'` dice with stunPct = stunCap,
 *      totalHits = 1, sourceLabel = '震慑符印'.
 *    - already-stunned monster picked → fizzles without dice.
 *    - stunCap=0 → finalizes without dice (threshold 0).
 *
 * 5. Self-recursion: dice 'stun' outcome via the 震慑符印 fires
 *    `applyStunCardGrant` again — successful 震慑符印 spawns a fresh 震慑符印.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { computeAmuletEffectsForState } from '../equipment';
import { STARTER_CARD_IDS } from '../deck';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

function makeStunAmulet(idSuffix: number) {
  return {
    id: `${STARTER_CARD_IDS.stunUpgradeCapAmulet}-clone-${idSuffix}`,
    type: 'amulet' as const,
    name: '震慑之符',
    value: 0,
    image: '',
    classCard: true,
    amuletEffect: 'stun-upgrade-cap' as const,
  };
}

function makeMonster(id: string, hp = 30) {
  return {
    id,
    type: 'monster' as const,
    name: `M${id}`,
    value: hp,
    hp,
    maxHp: hp,
    attack: 0,
    fury: 1,
    hpLayers: 1,
  };
}

function makeStunSigilCardInHand(id = 'sigil-1') {
  return {
    id,
    type: 'magic' as const,
    name: '震慑符印',
    value: 0,
    image: '',
    magicType: 'instant' as const,
    magicEffect: 'stun-sigil',
    description: '选择一个怪物：以当前击晕上限的几率尝试击晕。',
    shortDescription: '尝试击晕一个怪物（成功率=击晕上限）',
  };
}

function makeFiller(id: string) {
  return {
    id,
    type: 'magic' as const,
    name: 'Filler',
    value: 0,
    image: '',
  };
}

function activeRowOf(...monsters: ReturnType<typeof makeMonster>[]): ActiveRowSlots {
  const row: (ReturnType<typeof makeMonster> | null)[] = [null, null, null, null, null];
  for (let i = 0; i < monsters.length && i < 5; i++) row[i] = monsters[i];
  return row as unknown as ActiveRowSlots;
}

function findDice(sideEffects: any[]) {
  return sideEffects
    .map((e: any) => e?.event === 'ui:requestDice' ? e.payload : null)
    .filter(Boolean);
}

function findGrantedSigils(state: GameState) {
  const inHand = state.handCards.filter(c => c.magicEffect === 'stun-sigil');
  const inBackpack = state.backpackItems.filter(c => c.magicEffect === 'stun-sigil');
  const inRecycle = state.permanentMagicRecycleBag.filter(c => c.magicEffect === 'stun-sigil');
  return { inHand, inBackpack, inRecycle, total: inHand.length + inBackpack.length + inRecycle.length };
}

// ---------------------------------------------------------------------------
// 1. Aggregator: stunCardGrantCount = N
// ---------------------------------------------------------------------------

describe('震慑之符 — computeAmuletEffectsForState aggregation', () => {
  it('0 amulets → stunCardGrantCount = 0', () => {
    const state = makeState({ amuletSlots: [] as any });
    const ae = computeAmuletEffectsForState(state)!;
    expect(ae.stunCardGrantCount).toBe(0);
  });

  it('1 amulet → stunCardGrantCount = 1', () => {
    const state = makeState({ amuletSlots: [makeStunAmulet(1)] as any });
    const ae = computeAmuletEffectsForState(state)!;
    expect(ae.stunCardGrantCount).toBe(1);
  });

  it('3 amulets → stunCardGrantCount = 3 (Discrete event ×N stacking)', () => {
    const state = makeState({
      amuletSlots: [makeStunAmulet(1), makeStunAmulet(2), makeStunAmulet(3)] as any,
    });
    const ae = computeAmuletEffectsForState(state)!;
    expect(ae.stunCardGrantCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 2. End-to-end: RESOLVE_DICE 'hero-stun' 'stun' outcome → grant cards
// ---------------------------------------------------------------------------

describe('震慑之符 — stun outcome grants 震慑符印 to hand', () => {
  it('1 amulet, hero-stun success → 1 sigil enters hand', () => {
    const state = makeState({
      amuletSlots: [makeStunAmulet(1)] as any,
      activeCards: activeRowOf(makeMonster('m1', 30)),
      handCards: [] as any,
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_DICE',
        value: 1,
        outcomeId: 'stun',
        context: {
          flowId: 'hero-stun',
          sourceLabel: '武器击晕',
          monsterId: 'm1',
          monsterName: 'Mm1',
          currentHit: 1,
          totalHits: 1,
          stunPct: 100,
        },
      } as GameAction,
    ]);
    const sigils = findGrantedSigils(result.state);
    expect(sigils.inHand).toHaveLength(1);
    expect(sigils.inHand[0].name).toBe('震慑符印');
    expect(sigils.inHand[0].magicType).toBe('instant');
    expect(sigils.inBackpack).toHaveLength(0);
    expect(sigils.inRecycle).toHaveLength(0);
  });

  it('3 amulets, hero-stun success → 3 sigils enter hand', () => {
    const state = makeState({
      amuletSlots: [makeStunAmulet(1), makeStunAmulet(2), makeStunAmulet(3)] as any,
      activeCards: activeRowOf(makeMonster('m1', 30)),
      handCards: [] as any,
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_DICE',
        value: 1,
        outcomeId: 'stun',
        context: {
          flowId: 'hero-stun',
          sourceLabel: '武器击晕',
          monsterId: 'm1',
          monsterName: 'Mm1',
          currentHit: 1,
          totalHits: 1,
          stunPct: 100,
        },
      } as GameAction,
    ]);
    const sigils = findGrantedSigils(result.state);
    expect(sigils.total).toBe(3);
    expect(sigils.inHand).toHaveLength(3);
  });

  it('hero-stun "miss" outcome → no sigils granted', () => {
    const state = makeState({
      amuletSlots: [makeStunAmulet(1)] as any,
      activeCards: activeRowOf(makeMonster('m1', 30)),
      handCards: [] as any,
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_DICE',
        value: 20,
        outcomeId: 'miss',
        context: {
          flowId: 'hero-stun',
          sourceLabel: '武器击晕',
          monsterId: 'm1',
          monsterName: 'Mm1',
          currentHit: 1,
          totalHits: 1,
          stunPct: 5,
        },
      } as GameAction,
    ]);
    expect(findGrantedSigils(result.state).total).toBe(0);
  });

  it('hand near limit → overflow lands in backpack', () => {
    // HAND_LIMIT = 7. Hand has 6 fillers, 2 amulets grant 2 sigils,
    // so 1 fits in hand, 1 spills to backpack.
    const fillers = Array.from({ length: 6 }, (_, i) => makeFiller(`f${i}`));
    const state = makeState({
      amuletSlots: [makeStunAmulet(1), makeStunAmulet(2)] as any,
      activeCards: activeRowOf(makeMonster('m1', 30)),
      handCards: fillers as any,
      handLimitBonus: 0,
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_DICE',
        value: 1,
        outcomeId: 'stun',
        context: {
          flowId: 'hero-stun',
          sourceLabel: '武器击晕',
          monsterId: 'm1',
          monsterName: 'Mm1',
          currentHit: 1,
          totalHits: 1,
          stunPct: 100,
        },
      } as GameAction,
    ]);
    const sigils = findGrantedSigils(result.state);
    expect(sigils.inHand).toHaveLength(1);
    expect(sigils.inBackpack).toHaveLength(1);
    expect(sigils.total).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 3. PLAY_CARD on 震慑符印 — opens monster picker
// ---------------------------------------------------------------------------

describe('震慑符印 PLAY_CARD', () => {
  it('opens monster-select picker with stunPct = state.stunCap', () => {
    const card = makeStunSigilCardInHand('sigil-play-1');
    const state = makeState({
      handCards: [card] as any,
      stunCap: 30,
      activeCards: activeRowOf(makeMonster('m1', 30), makeMonster('m2', 30)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const pending = result.state.pendingMagicAction as any;
    expect(pending?.effect).toBe('stun-sigil');
    expect(pending?.step).toBe('monster-select');
    expect(pending?.data?.stunPct).toBe(30);
    // Card removed from hand.
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
    // No dice yet — that happens after monster pick.
    expect(findDice(result.sideEffects)).toHaveLength(0);
  });

  it('empty active row → fizzles, no picker, no dice', () => {
    const card = makeStunSigilCardInHand('sigil-empty');
    const state = makeState({
      handCards: [card] as any,
      stunCap: 30,
      activeCards: [null, null, null, null, null] as unknown as ActiveRowSlots,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).toBeFalsy();
    expect(findDice(result.sideEffects)).toHaveLength(0);
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
  });

  it('all monsters already stunned → fizzles', () => {
    const card = makeStunSigilCardInHand('sigil-allstunned');
    const stunned = { ...makeMonster('m1', 30), isStunned: true };
    const state = makeState({
      handCards: [card] as any,
      stunCap: 30,
      activeCards: activeRowOf(stunned),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).toBeFalsy();
    expect(findDice(result.sideEffects)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. RESOLVE_MAGIC_MONSTER_SELECTION on 震慑符印
// ---------------------------------------------------------------------------

describe('震慑符印 RESOLVE_MAGIC_MONSTER_SELECTION', () => {
  it('normal path: requests hero-stun dice with stunPct = stunCap, totalHits = 1', () => {
    const card = makeStunSigilCardInHand('sigil-normal');
    const state = makeState({
      handCards: [card] as any,
      stunCap: 25,
      activeCards: activeRowOf(makeMonster('m1', 30), makeMonster('m2', 30)),
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect((result.state.pendingMagicAction as any)?.effect).toBe('stun-sigil');
    result = drain(result.state, [
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', monsterId: 'm1' } as GameAction,
    ]);
    const dice = findDice(result.sideEffects);
    expect(dice).toHaveLength(1);
    expect(dice[0].context.flowId).toBe('hero-stun');
    expect(dice[0].context.sourceLabel).toBe('震慑符印');
    expect(dice[0].context.monsterId).toBe('m1');
    expect(dice[0].context.totalHits).toBe(1);
    expect(dice[0].context.stunPct).toBe(25);
    expect(result.state.pendingMagicAction).toBeFalsy();
  });

  it('stunCap=0 → no dice, finalizes', () => {
    const card = makeStunSigilCardInHand('sigil-zero');
    const state = makeState({
      handCards: [card] as any,
      stunCap: 0,
      activeCards: activeRowOf(makeMonster('m1', 30)),
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    result = drain(result.state, [
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', monsterId: 'm1' } as GameAction,
    ]);
    expect(findDice(result.sideEffects)).toHaveLength(0);
    expect(result.state.pendingMagicAction).toBeFalsy();
  });

  it('picking already-stunned monster → no dice, fizzles', () => {
    const card = makeStunSigilCardInHand('sigil-stunpick');
    const stunned = { ...makeMonster('m1', 30), isStunned: true };
    const state = makeState({
      handCards: [card] as any,
      stunCap: 50,
      // Two monsters: one stunned, one fresh — so PLAY_CARD opens picker (since
      // hasUnstunnedTarget = true), but player picks the stunned one.
      activeCards: activeRowOf(stunned, makeMonster('m2', 30)),
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect((result.state.pendingMagicAction as any)?.effect).toBe('stun-sigil');
    result = drain(result.state, [
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', monsterId: 'm1' } as GameAction,
    ]);
    expect(findDice(result.sideEffects)).toHaveLength(0);
    expect(result.state.pendingMagicAction).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// 5. Self-recursion — successful 震慑符印 grants another 震慑符印
// ---------------------------------------------------------------------------

describe('震慑符印 self-recursion via 震慑之符', () => {
  it('PLAY 震慑符印 → pick → stun success → 1 fresh 震慑符印 enters hand', () => {
    const card = makeStunSigilCardInHand('sigil-rec');
    const state = makeState({
      handCards: [card] as any,
      amuletSlots: [makeStunAmulet(1)] as any,
      stunCap: 100,
      activeCards: activeRowOf(makeMonster('m1', 30)),
    });
    // Step 1: play the card → opens picker.
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(findGrantedSigils(result.state).total).toBe(0);

    // Step 2: pick m1 → requests hero-stun dice (stunPct=100).
    result = drain(result.state, [
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', monsterId: 'm1' } as GameAction,
    ]);
    const dice = findDice(result.sideEffects);
    expect(dice).toHaveLength(1);

    // Step 3: dispatch the dice 'stun' outcome → stuns monster + grants fresh sigil.
    result = drain(result.state, [
      {
        type: 'RESOLVE_DICE',
        value: 1,
        outcomeId: 'stun',
        context: dice[0].context,
      } as GameAction,
    ]);
    const m1 = result.state.activeCards.find(c => c?.id === 'm1') as any;
    expect(m1?.isStunned).toBe(true);
    const sigils = findGrantedSigils(result.state);
    expect(sigils.total).toBe(1);
    // The fresh sigil has a different id from the consumed one.
    expect(sigils.inHand[0].id).not.toBe(card.id);
  });

  it('miss outcome → no fresh sigil granted (recursion only on stun success)', () => {
    const card = makeStunSigilCardInHand('sigil-miss');
    const state = makeState({
      handCards: [card] as any,
      amuletSlots: [makeStunAmulet(1)] as any,
      stunCap: 5,
      activeCards: activeRowOf(makeMonster('m1', 30)),
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    result = drain(result.state, [
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', monsterId: 'm1' } as GameAction,
    ]);
    const dice = findDice(result.sideEffects);
    expect(dice).toHaveLength(1);
    result = drain(result.state, [
      {
        type: 'RESOLVE_DICE',
        value: 20,
        outcomeId: 'miss',
        context: dice[0].context,
      } as GameAction,
    ]);
    expect(findGrantedSigils(result.state).total).toBe(0);
  });
});
