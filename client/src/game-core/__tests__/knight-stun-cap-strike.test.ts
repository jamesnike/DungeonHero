/**
 * 雷涌一击 (knight:stun-cap-strike) — Perm 1 magic.
 *
 * Behavior:
 *   - PLAY_CARD with 1 monster:
 *       deals ceil(stunCap / divisor) + amplifyBonus spell damage
 *       (divisor = 4 at lvl 0, 3 at lvl 1, gets * echoMultiplier)
 *       draws 1 card * echoMultiplier
 *       requests `hero-stun` dice with stunPct = min(60, stunCap)
 *   - PLAY_CARD with 0 monsters: card consumed, no damage / dice / draw
 *   - PLAY_CARD with >1 monsters: pendingMagicAction set, awaits selection
 *   - RESOLVE_MAGIC_MONSTER_SELECTION: same logic as 1-monster auto-pick
 *   - RESOLVE_DICE 'stun' outcome (via 'hero-stun' flow + sourceLabel):
 *       monster gets isStunned, all stun amulets fire (stun-recycle / stun-gold /
 *       stun-upgrade-cap), and log message uses card.name not 雷震.
 *   - Echo: damage and draw both ×N, stun dice still rolls only once.
 */

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

function makeCard(idSuffix = 'scs', extras: Record<string, any> = {}) {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic' as const,
    name: '雷涌一击',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent' as const,
    magicEffect: '电涌：晕上限 1/4 法伤 + 60% 晕 + 抽 1。',
    description: 'test',
    knightEffect: 'stun-cap-strike',
    recycleDelay: 1,
    maxUpgradeLevel: 1,
    ...extras,
  };
}

function makeMonster(id: string, hp = 50) {
  return {
    id,
    type: 'monster' as const,
    name: `M${id}`,
    value: hp,
    hp,
    maxHp: hp,
    attack: 0,
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

// ---------------------------------------------------------------------------
// PLAY_CARD — single monster auto-pick
// ---------------------------------------------------------------------------

describe('雷涌一击 PLAY_CARD (single monster)', () => {
  it('lvl 0 / stunCap 40 → ceil(40/4)=10 spell damage, draws 1, requests stun dice (40%)', () => {
    const card = makeCard('one');
    const state = makeState({
      handCards: [card],
      stunCap: 40,
      backpackItems: [makeFiller('a')] as any,
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(40);
    const dice = findDice(result.sideEffects);
    expect(dice).toHaveLength(1);
    expect(dice[0].context.flowId).toBe('hero-stun');
    expect(dice[0].context.sourceLabel).toBe('雷涌一击');
    expect(dice[0].context.stunPct).toBe(40);
    expect(dice[0].context.totalHits).toBe(1);
    expect(result.state.handCards.some(c => c.id === 'a')).toBe(true);
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
  });

  it('lvl 1 / stunCap 30 → divisor 3 → ceil(30/3)=10 damage, stunPct=30 (capped by stunCap)', () => {
    const card = makeCard('lvl1', { upgradeLevel: 1 });
    const state = makeState({
      handCards: [card],
      stunCap: 30,
      backpackItems: [makeFiller('a')] as any,
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(40);
    const dice = findDice(result.sideEffects);
    expect(dice[0].context.stunPct).toBe(30);
  });

  it('stunCap 100 → stunPct capped at 60 (not 100)', () => {
    const card = makeCard('cap');
    const state = makeState({
      handCards: [card],
      stunCap: 100,
      activeCards: activeRowOf(makeMonster('m1', 100)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const dice = findDice(result.sideEffects);
    expect(dice[0].context.stunPct).toBe(60);
  });

  it('stunCap 0 → no damage (ceil(0/4)=0), no dice (threshold 0)', () => {
    const card = makeCard('zero');
    const state = makeState({
      handCards: [card],
      stunCap: 0,
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(50);
    expect(findDice(result.sideEffects)).toHaveLength(0);
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
  });

  it('amplifyBonus is added to base before spell-damage bonus', () => {
    const card = makeCard('amp', { amplifyBonus: 3 });
    const state = makeState({
      handCards: [card],
      stunCap: 40,
      permanentSpellDamageBonus: 2,
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(35);
  });

  it('rounds up: stunCap 35 / 4 = ceil(8.75) = 9', () => {
    const card = makeCard('round');
    const state = makeState({
      handCards: [card],
      stunCap: 35,
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(41);
  });
});

// ---------------------------------------------------------------------------
// PLAY_CARD — no monsters / multi monsters
// ---------------------------------------------------------------------------

describe('雷涌一击 PLAY_CARD (zero / multi monsters)', () => {
  it('0 monsters: card consumed, no damage, no pending action', () => {
    const card = makeCard('none');
    const state = makeState({
      handCards: [card],
      stunCap: 40,
      activeCards: [null, null, null, null, null] as unknown as ActiveRowSlots,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
    expect(result.state.pendingMagicAction).toBeFalsy();
  });

  it('2 monsters: pendingMagicAction set, no immediate damage', () => {
    const card = makeCard('multi');
    const state = makeState({
      handCards: [card],
      stunCap: 40,
      activeCards: activeRowOf(makeMonster('m1', 50), makeMonster('m2', 50)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(50);
    expect(result.state.activeCards.find(c => c?.id === 'm2')?.hp).toBe(50);
    const pending = result.state.pendingMagicAction as any;
    expect(pending?.effect).toBe('stun-cap-strike');
    expect(pending?.step).toBe('monster-select');
    expect(pending?.data?.baseDmg).toBe(10);
    expect(pending?.data?.stunPct).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// RESOLVE_MAGIC_MONSTER_SELECTION (multi → pick)
// ---------------------------------------------------------------------------

describe('雷涌一击 RESOLVE_MAGIC_MONSTER_SELECTION', () => {
  it('selecting m2 deals damage to m2 only, draws 1, requests dice for m2', () => {
    const card = makeCard('pick');
    let state = makeState({
      handCards: [card],
      stunCap: 40,
      backpackItems: [makeFiller('a')] as any,
      activeCards: activeRowOf(makeMonster('m1', 50), makeMonster('m2', 50)),
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect((result.state.pendingMagicAction as any)?.effect).toBe('stun-cap-strike');

    result = drain(result.state, [
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', monsterId: 'm2' } as GameAction,
    ]);
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(50);
    expect(result.state.activeCards.find(c => c?.id === 'm2')?.hp).toBe(40);
    const dice = findDice(result.sideEffects);
    expect(dice).toHaveLength(1);
    expect(dice[0].context.monsterId).toBe('m2');
    expect(dice[0].context.sourceLabel).toBe('雷涌一击');
    expect(result.state.handCards.some(c => c.id === 'a')).toBe(true);
    expect(result.state.pendingMagicAction).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// RESOLVE_DICE — stun outcome triggers all amulet effects
// ---------------------------------------------------------------------------

describe('雷涌一击 RESOLVE_DICE → hero-stun', () => {
  it('stun outcome marks monster isStunned and uses card.name in log (not 雷震)', () => {
    const card = makeCard('stun-log');
    const state = makeState({
      activeCards: activeRowOf(makeMonster('m1', 30)),
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_DICE',
        value: 5,
        outcomeId: 'stun',
        context: {
          flowId: 'hero-stun',
          sourceLabel: '雷涌一击',
          monsterId: 'm1',
          monsterName: 'Mm1',
          currentHit: 1,
          totalHits: 1,
          stunPct: 40,
          magicCardId: card.id,
        },
      } as GameAction,
    ]);
    const m = result.state.activeCards.find(c => c?.id === 'm1') as any;
    expect(m?.isStunned).toBe(true);
    const logEvents = result.sideEffects.filter((e: any) => e.event === 'log:entry');
    const messages = logEvents.map((e: any) => e.payload?.message ?? '').join(' | ');
    expect(messages).toContain('被雷涌一击击晕了');
    expect(messages).not.toContain('被雷震击晕了');
  });

  it('back-compat: when sourceLabel is missing, fallback to 雷震', () => {
    const state = makeState({
      activeCards: activeRowOf(makeMonster('m1', 30)),
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_DICE',
        value: 5,
        outcomeId: 'stun',
        context: {
          flowId: 'hero-stun',
          monsterId: 'm1',
          monsterName: 'Mm1',
          currentHit: 1,
          totalHits: 1,
          stunPct: 40,
        },
      } as GameAction,
    ]);
    const logEvents = result.sideEffects.filter((e: any) => e.event === 'log:entry');
    const messages = logEvents.map((e: any) => e.payload?.message ?? '').join(' | ');
    expect(messages).toContain('被雷震击晕了');
  });
});

// ---------------------------------------------------------------------------
// Echo — damage / draw scale ×N, stun dice rolls once
// ---------------------------------------------------------------------------

describe('雷涌一击 echo', () => {
  it('echoMultiplier=2: damage ×2, draws 2, stun dice still 1 only (totalHits=1)', () => {
    const card = makeCard('echo');
    const state = makeState({
      handCards: [card],
      stunCap: 40,
      doubleNextMagic: true,
      backpackItems: [makeFiller('a'), makeFiller('b'), makeFiller('c')] as any,
      activeCards: activeRowOf(makeMonster('m1', 100)),
    } as any);
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    // base = ceil(40/4) = 10, ×2 echo = 20
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(80);
    // draws 2 cards
    expect(result.state.handCards.filter(c => ['a','b','c'].includes(c.id)).length).toBe(2);
    // exactly 1 stun dice (no echo on stun roll)
    const dice = findDice(result.sideEffects);
    expect(dice).toHaveLength(1);
    expect(dice[0].context.totalHits).toBe(1);
  });
});
