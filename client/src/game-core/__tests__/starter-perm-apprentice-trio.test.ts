/**
 * Starter backpack opening trio: 学徒法弹 / 学徒鼓舞 / 学徒铸甲
 *
 * Three Perm-1 magics seeded directly into the player's starting backpack at
 * INIT_GAME. They are *not* part of `createStarterCardPool`, so they never
 * appear in discover / grant events—they only ever exist as the three opening
 * backpack cards.
 *
 * Coverage:
 *   1. INIT_GAME places exactly one of each apprentice card in `backpackItems`.
 *   2. PLAY_CARD on 学徒法弹 → opens monster-select picker; resolving deals
 *      1 spell damage and engages the monster.
 *   3. PLAY_CARD on 学徒鼓舞 → opens slot-select picker; resolving adds +1 to
 *      `slotTempAttack[slotId]`.
 *   4. PLAY_CARD on 学徒铸甲 → opens slot-select picker; resolving adds +1 to
 *      `slotTempArmor[slotId]`.
 *   5. Sanity: cards are NOT in `createStarterCardPool` (never grantable).
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
  createApprenticeRallyCard,
  createApprenticeArmorCard,
  createStarterCardPool,
} from '../deck';
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
// 1) INIT_GAME — opening backpack contains all 3 apprentice cards
// ---------------------------------------------------------------------------

describe('INIT_GAME — opening backpack contains the 学徒 trio', () => {
  it('places exactly one of each apprentice perm-1 magic in backpackItems', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const state = makeStateWithSeed(seed);
      const result = reduce(state, {
        type: 'INIT_GAME',
        mode: 'normal',
        totalWins: 0,
        eternalRelics: [],
      });
      const bolts = result.state.backpackItems.filter(c => c.id === STARTER_CARD_IDS.apprenticeBolt);
      const rallies = result.state.backpackItems.filter(c => c.id === STARTER_CARD_IDS.apprenticeRally);
      const armors = result.state.backpackItems.filter(c => c.id === STARTER_CARD_IDS.apprenticeArmor);
      expect(bolts.length, `seed=${seed} bolt count`).toBe(1);
      expect(rallies.length, `seed=${seed} rally count`).toBe(1);
      expect(armors.length, `seed=${seed} armor count`).toBe(1);
      expect(bolts[0].magicType).toBe('permanent');
      expect(bolts[0].recycleDelay).toBe(1);
      expect(rallies[0].magicType).toBe('permanent');
      expect(armors[0].magicType).toBe('permanent');
      // No upgrades: all three cards have maxUpgradeLevel: 0
      expect(bolts[0].maxUpgradeLevel).toBe(0);
      expect(rallies[0].maxUpgradeLevel).toBe(0);
      expect(armors[0].maxUpgradeLevel).toBe(0);
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
    expect(
      result.state.backpackItems.filter(c => c.id === STARTER_CARD_IDS.apprenticeRally).length,
    ).toBe(1);
    expect(
      result.state.backpackItems.filter(c => c.id === STARTER_CARD_IDS.apprenticeArmor).length,
    ).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2) Sanity: apprentice cards are NOT in createStarterCardPool
// ---------------------------------------------------------------------------

describe('Sanity — apprentice trio is NOT discoverable / grantable', () => {
  it('createStarterCardPool() does not include any apprentice card', () => {
    const pool = createStarterCardPool();
    expect(pool.find(c => c.id === STARTER_CARD_IDS.apprenticeBolt)).toBeUndefined();
    expect(pool.find(c => c.id === STARTER_CARD_IDS.apprenticeRally)).toBeUndefined();
    expect(pool.find(c => c.id === STARTER_CARD_IDS.apprenticeArmor)).toBeUndefined();
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

// ---------------------------------------------------------------------------
// 4) 学徒鼓舞 — slot +1 temp attack
// ---------------------------------------------------------------------------

describe('学徒鼓舞 (apprenticeRally) — slot +1 temp attack', () => {
  it('PLAY_CARD opens a slot-select picker (pendingMagicAction)', () => {
    const card = createApprenticeRallyCard();
    const state = makeState({ handCards: [card] });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('apprentice-rally');
    expect((result.state.pendingMagicAction as any).step).toBe('slot-select');
  });

  it('resolving slot-select adds +1 to slotTempAttack[chosenSlot] (left)', () => {
    const card = createApprenticeRallyCard();
    const state = makeState({
      handCards: [card],
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
    });
    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const r2 = drain(r1.state, [
      {
        type: 'RESOLVE_MAGIC_SLOT_SELECTION',
        magicId: 'apprentice-rally',
        slotId: 'equipmentSlot1',
      } as GameAction,
    ]);
    expect((r2.state as any).slotTempAttack?.equipmentSlot1).toBe(1);
    expect((r2.state as any).slotTempAttack?.equipmentSlot2 ?? 0).toBe(0);
    expect(r2.state.pendingMagicAction).toBeNull();
  });

  it('resolving slot-select adds +1 to slotTempAttack[chosenSlot] (right)', () => {
    const card = createApprenticeRallyCard();
    const state = makeState({
      handCards: [card],
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
    });
    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const r2 = drain(r1.state, [
      {
        type: 'RESOLVE_MAGIC_SLOT_SELECTION',
        magicId: 'apprentice-rally',
        slotId: 'equipmentSlot2',
      } as GameAction,
    ]);
    expect((r2.state as any).slotTempAttack?.equipmentSlot2).toBe(1);
    expect((r2.state as any).slotTempAttack?.equipmentSlot1 ?? 0).toBe(0);
  });

  it('accumulates on top of pre-existing slotTempAttack', () => {
    const card = createApprenticeRallyCard();
    const state = makeState({
      handCards: [card],
      slotTempAttack: { equipmentSlot1: 5, equipmentSlot2: 0 },
    });
    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const r2 = drain(r1.state, [
      {
        type: 'RESOLVE_MAGIC_SLOT_SELECTION',
        magicId: 'apprentice-rally',
        slotId: 'equipmentSlot1',
      } as GameAction,
    ]);
    expect((r2.state as any).slotTempAttack?.equipmentSlot1).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// 5) 学徒铸甲 — slot +1 temp armor
// ---------------------------------------------------------------------------

describe('学徒铸甲 (apprenticeArmor) — slot +1 temp armor', () => {
  it('PLAY_CARD opens a slot-select picker (pendingMagicAction)', () => {
    const card = createApprenticeArmorCard();
    const state = makeState({ handCards: [card] });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('apprentice-armor');
    expect((result.state.pendingMagicAction as any).step).toBe('slot-select');
  });

  it('resolving slot-select adds +1 to slotTempArmor[chosenSlot] (left)', () => {
    const card = createApprenticeArmorCard();
    const state = makeState({
      handCards: [card],
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
    });
    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const r2 = drain(r1.state, [
      {
        type: 'RESOLVE_MAGIC_SLOT_SELECTION',
        magicId: 'apprentice-armor',
        slotId: 'equipmentSlot1',
      } as GameAction,
    ]);
    expect((r2.state as any).slotTempArmor?.equipmentSlot1).toBe(1);
    expect((r2.state as any).slotTempArmor?.equipmentSlot2 ?? 0).toBe(0);
    expect(r2.state.pendingMagicAction).toBeNull();
  });

  it('resolving slot-select adds +1 to slotTempArmor[chosenSlot] (right)', () => {
    const card = createApprenticeArmorCard();
    const state = makeState({
      handCards: [card],
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
    });
    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const r2 = drain(r1.state, [
      {
        type: 'RESOLVE_MAGIC_SLOT_SELECTION',
        magicId: 'apprentice-armor',
        slotId: 'equipmentSlot2',
      } as GameAction,
    ]);
    expect((r2.state as any).slotTempArmor?.equipmentSlot2).toBe(1);
    expect((r2.state as any).slotTempArmor?.equipmentSlot1 ?? 0).toBe(0);
  });

  it('accumulates on top of pre-existing slotTempArmor', () => {
    const card = createApprenticeArmorCard();
    const state = makeState({
      handCards: [card],
      slotTempArmor: { equipmentSlot1: 3, equipmentSlot2: 0 },
    });
    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const r2 = drain(r1.state, [
      {
        type: 'RESOLVE_MAGIC_SLOT_SELECTION',
        magicId: 'apprentice-armor',
        slotId: 'equipmentSlot1',
      } as GameAction,
    ]);
    expect((r2.state as any).slotTempArmor?.equipmentSlot1).toBe(4);
  });
});
