/**
 * Starter backpack opening card: 学徒法弹 (apprenticeBolt)
 *
 * Single Perm-1 magic seeded directly into the player's starting backpack at
 * INIT_GAME. Not part of `createStarterCardPool`, so it never appears in
 * discover / grant events—only ever exists as the opening backpack card.
 *
 * Coverage:
 *   1. INIT_GAME places exactly one 学徒法弹 in `backpackItems`.
 *   2. PLAY_CARD on 学徒法弹 → opens monster-select picker; resolving deals
 *      1 spell damage and engages the monster.
 *   3. Sanity: card is NOT in `createStarterCardPool` (never grantable).
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import { initialCombatState } from '../constants';
import {
  STARTER_CARD_IDS,
  createApprenticeBoltCard,
  createStarterCardPool,
} from '../deck';
import { isDamageMagic, computeDamageMagicDisplayPure } from '../helpers';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
// Importing this barrel registers all card definitions.
import '../card-schema';

function makeStateWithSeed(seed: number): GameState {
  return { ...createInitialGameState(), rng: createRng(seed) };
}

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero' } as any,
    phase: 'playerInput' as any,
    ...overrides,
  };
}

function makeMonster(id: string, hp = 5, attack = 1): GameCardData {
  return {
    id,
    type: 'monster',
    name: `Mob-${id}`,
    value: 1,
    image: '',
    hp,
    maxHp: hp,
    attack,
    currentLayer: 1,
    hpLayers: 1,
    fury: 1,
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// 1) INIT_GAME — opening backpack contains 学徒法弹
// ---------------------------------------------------------------------------

describe('INIT_GAME — opening backpack contains 学徒法弹', () => {
  it('places exactly one apprentice bolt perm-1 magic in backpackItems', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const state = makeStateWithSeed(seed);
      const result = reduce(state, {
        type: 'INIT_GAME',
        mode: 'normal',
        totalWins: 0,
        eternalRelics: [],
      });
      const bolts = result.state.backpackItems.filter(c => c.id === STARTER_CARD_IDS.apprenticeBolt);
      expect(bolts.length, `seed=${seed} bolt count`).toBe(1);
      expect(bolts[0].magicType).toBe('permanent');
      expect(bolts[0].recycleDelay).toBe(1);
      // No upgrades.
      expect(bolts[0].maxUpgradeLevel).toBe(0);
    }
  });

  it('also works in quick mode', () => {
    const state = makeStateWithSeed(42);
    const result = reduce(state, {
      type: 'INIT_GAME',
      mode: 'quick',
      totalWins: 0,
      eternalRelics: [],
    });
    expect(
      result.state.backpackItems.filter(c => c.id === STARTER_CARD_IDS.apprenticeBolt).length,
    ).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2) Sanity: apprentice card is NOT in createStarterCardPool
// ---------------------------------------------------------------------------

describe('Sanity — 学徒法弹 is NOT discoverable / grantable', () => {
  it('createStarterCardPool() does not include the apprentice bolt', () => {
    const pool = createStarterCardPool();
    expect(pool.find(c => c.id === STARTER_CARD_IDS.apprenticeBolt)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2b) 学徒法弹 must be recognized as a damage spell
//
// Rationale (bug regression): historically `isDamageMagic` keyed off
// `magicEffect` / `knightEffect` / a fixed `damageNames` whitelist. 学徒法弹
// has no `magicEffect` and a non-listed name, so it was silently excluded
// from Amplify / 增幅 targeting and any other "is this a damage spell?"
// consumer. The card's intent is identical to missile-bolt (1 spell damage,
// scales with amplify), so it must pass `isDamageMagic`.
// ---------------------------------------------------------------------------

describe('isDamageMagic — 学徒法弹 must be recognized as a damage spell', () => {
  it('isDamageMagic(card) returns true', () => {
    const card = createApprenticeBoltCard();
    expect(isDamageMagic(card)).toBe(true);
  });

  it('computeDamageMagicDisplayPure surfaces the amplify bonus in description', () => {
    const card = createApprenticeBoltCard();
    const ampCard = { ...card, amplifyBonus: 2 } as GameCardData;
    const display = computeDamageMagicDisplayPure(ampCard, { hp: 10, maxHp: 10, gold: 0 });
    expect(display).not.toBeNull();
    expect(display?.amplifyBonus).toBe(2);
    if (display && display.mode === 'replace') {
      expect(display.text).toContain('3 点法术伤害');
    } else {
      throw new Error('expected replace-mode display for 学徒法弹');
    }
  });
});

// ---------------------------------------------------------------------------
// 3) 学徒法弹 — single-target 1 spell damage, engages on hit
// ---------------------------------------------------------------------------

describe('学徒法弹 (apprenticeBolt) — single-target 1 spell damage', () => {
  it('PLAY_CARD opens a monster-select picker (pendingMagicAction)', () => {
    const card = createApprenticeBoltCard();
    const monster = makeMonster('m1', 10);
    const state = makeState({
      handCards: [card],
      activeCards: [monster, null, null, null, null] as any,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('apprentice-bolt');
    expect((result.state.pendingMagicAction as any).step).toBe('monster-select');
    expect((result.state.pendingMagicAction as any).allowsHeroTarget).toBe(true);
  });

  it('resolving the monster-select deals 1 spell damage and engages the target', () => {
    const card = createApprenticeBoltCard();
    const monster = makeMonster('m1', 10);
    const state = makeState({
      handCards: [card],
      activeCards: [monster, null, null, null, null] as any,
    });
    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(r1.state.pendingMagicAction).not.toBeNull();
    const r2 = drain(r1.state, [
      {
        type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
        magicId: 'apprentice-bolt',
        monsterId: 'm1',
      } as GameAction,
    ]);
    const monsterAfter = (r2.state.activeCards as any[]).find(c => c?.id === 'm1');
    expect(monsterAfter?.hp).toBe(9);
    // 不变量 (monster-damage-engagement.mdc): 任何对怪物伤害都必须激怒
    expect(r2.state.combatState.engagedMonsterIds).toContain('m1');
    // 出完牌后 pendingMagicAction 应清空
    expect(r2.state.pendingMagicAction).toBeNull();
  });

  it('multiple monsters: only the picked monster takes damage and is engaged', () => {
    const card = createApprenticeBoltCard();
    const m1 = makeMonster('m1', 10);
    const m2 = makeMonster('m2', 10);
    const state = makeState({
      handCards: [card],
      activeCards: [m1, m2, null, null, null] as any,
    });
    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const r2 = drain(r1.state, [
      {
        type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
        magicId: 'apprentice-bolt',
        monsterId: 'm2',
      } as GameAction,
    ]);
    const m1After = (r2.state.activeCards as any[]).find(c => c?.id === 'm1');
    const m2After = (r2.state.activeCards as any[]).find(c => c?.id === 'm2');
    expect(m1After?.hp).toBe(10);
    expect(m2After?.hp).toBe(9);
    expect(r2.state.combatState.engagedMonsterIds).toContain('m2');
    expect(r2.state.combatState.engagedMonsterIds).not.toContain('m1');
  });
});
