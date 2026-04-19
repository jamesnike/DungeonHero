/**
 * on-enter-hand keyword tests (上手)
 *
 * Covers:
 *   1. The reducer post-process detects newly added hand cards and enqueues
 *      TRIGGER_ON_ENTER_HAND for cards with `onEnterHandEffect`.
 *   2. Cards marked `_skipOnEnterHand: true` (clones / copies) are NOT triggered.
 *   3. The 兵器谱 上手 handler (weapon-manual-onhand) bumps slotTempAttack of one
 *      randomly-chosen slot by +2 and advances the rng.
 *   4. The 兵器谱 主效果 (magic:weapon-manual) prompts a slot-select then on
 *      RESOLVE_MAGIC_SLOT_SELECTION applies +2 to slotExtraAttacks for that slot.
 *   5. slotExtraAttacks resets at START_TURN.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import { createRng } from '../rng';
// Importing this barrel registers all card definitions including
// `magic:weapon-manual` and the on-enter-hand `weapon-manual-onhand` handler.
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeWeaponManual(idSuffix = 'wm') {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic' as const,
    name: '兵器谱',
    value: 0,
    image: '',
    magicType: 'instant' as const,
    magicEffect: 'weapon-manual',
    description: 'test',
    onEnterHandEffect: 'weapon-manual-onhand',
  };
}

// ---------------------------------------------------------------------------
// Post-process: TRIGGER_ON_ENTER_HAND enqueueing
// ---------------------------------------------------------------------------

describe('postProcessHandEntries — 上手 trigger', () => {
  it('enqueues TRIGGER_ON_ENTER_HAND when a card with onEnterHandEffect enters the hand', () => {
    const card = makeWeaponManual();
    const state = makeState({ handCards: [], remainingDeck: [card] });
    const result = reduce(state, { type: 'ADD_CARD_TO_HAND', card } as GameAction);

    expect(result.state.handCards.some(c => c.id === card.id)).toBe(true);
    const triggers = result.enqueuedActions.filter(a => a.type === 'TRIGGER_ON_ENTER_HAND');
    expect(triggers).toHaveLength(1);
    expect((triggers[0] as any).cardId).toBe(card.id);
  });

  it('does NOT enqueue when the card has _skipOnEnterHand: true', () => {
    const card = { ...makeWeaponManual('clone'), _skipOnEnterHand: true };
    const state = makeState({ handCards: [] });
    const result = reduce(state, { type: 'ADD_CARD_TO_HAND', card } as GameAction);

    const triggers = result.enqueuedActions.filter(a => a.type === 'TRIGGER_ON_ENTER_HAND');
    expect(triggers).toHaveLength(0);
  });

  it('does NOT enqueue for cards already in the hand (no false positives on no-op patches)', () => {
    const card = makeWeaponManual('existing');
    const state = makeState({ handCards: [card] });
    // SET_GAME_FLAGS shouldn't touch handCards reference.
    const result = reduce(state, { type: 'SET_GAME_FLAGS', patch: { hp: 25 } });
    const triggers = result.enqueuedActions.filter(a => a.type === 'TRIGGER_ON_ENTER_HAND');
    expect(triggers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 兵器谱 上手 handler (weapon-manual-onhand)
// ---------------------------------------------------------------------------

describe('weapon-manual-onhand handler', () => {
  it('adds +2 to slotTempAttack of one random slot', () => {
    const card = makeWeaponManual('wm-onhand');
    const state = makeState({
      handCards: [card],
      rng: createRng(42),
    });
    const result = reduce(state, { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction);

    const left = result.state.slotTempAttack?.equipmentSlot1 ?? 0;
    const right = result.state.slotTempAttack?.equipmentSlot2 ?? 0;
    expect(left + right).toBe(2);
    expect(left === 2 || right === 2).toBe(true);
  });

  it('advances rng when picking the slot', () => {
    const card = makeWeaponManual('wm-rng');
    const initialRng = createRng(123);
    const state = makeState({ handCards: [card], rng: initialRng });
    const result = reduce(state, { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction);
    expect(result.state.rng).not.toBe(initialRng);
  });

  it('is a no-op when card not found', () => {
    const state = makeState({ handCards: [] });
    const result = reduce(state, { type: 'TRIGGER_ON_ENTER_HAND', cardId: 'nope' } as GameAction);
    expect(result.state).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: drawing 兵器谱 fires 上手 via the pipeline
// ---------------------------------------------------------------------------

describe('drawing 兵器谱 → 上手 fires automatically (pipeline)', () => {
  it('draws the card and processes the enqueued TRIGGER_ON_ENTER_HAND', () => {
    const card = makeWeaponManual('wm-draw');
    const state = makeState({
      handCards: [],
      rng: createRng(7),
    });
    // ADD_CARD_TO_HAND directly puts the card in hand and the post-process
    // should enqueue the 上手 trigger; drain processes both steps.
    const result = drain(state, [{ type: 'ADD_CARD_TO_HAND', card } as GameAction]);

    expect(result.state.handCards.some(c => c.id === card.id)).toBe(true);
    const left = result.state.slotTempAttack?.equipmentSlot1 ?? 0;
    const right = result.state.slotTempAttack?.equipmentSlot2 ?? 0;
    expect(left + right).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 兵器谱 主效果 (magic:weapon-manual) — slot-select → slotExtraAttacks +2
// ---------------------------------------------------------------------------

describe('兵器谱 主效果: slot-select → slotExtraAttacks', () => {
  it('opens a slot-select pendingMagicAction when played', () => {
    const card = makeWeaponManual('wm-cast');
    const state = makeState({ handCards: [card] });
    const drained = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);
    expect(drained.state.pendingMagicAction).not.toBeNull();
    expect((drained.state.pendingMagicAction as any).effect).toBe('weapon-manual');
    expect((drained.state.pendingMagicAction as any).step).toBe('slot-select');
  });

  it('RESOLVE_MAGIC_SLOT_SELECTION adds +2 to slotExtraAttacks of the chosen slot (empty slot allowed)', () => {
    const card = makeWeaponManual('wm-resolve');
    const state = makeState({
      handCards: [card],
      equipmentSlot1: null,
      equipmentSlot2: null,
      pendingMagicAction: { card, effect: 'weapon-manual', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'weapon-manual', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotExtraAttacks?.equipmentSlot1).toBe(2);
    expect(result.state.slotExtraAttacks?.equipmentSlot2 ?? 0).toBe(0);
  });

  it('echo (doubleNextMagic) doubles the slotExtraAttacks bonus', () => {
    const card = makeWeaponManual('wm-echo');
    // Simulate the resolver having seen echoMultiplier = 2.
    const state = makeState({
      handCards: [card],
      pendingMagicAction: {
        card,
        effect: 'weapon-manual',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'weapon-manual', slotId: 'equipmentSlot2' } as GameAction,
    ]);
    expect(result.state.slotExtraAttacks?.equipmentSlot2).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// START_TURN resets slotExtraAttacks
// ---------------------------------------------------------------------------

describe('START_TURN resets slotExtraAttacks', () => {
  it('clears any per-slot extra-attack charges accumulated last turn', () => {
    const state = makeState({
      slotExtraAttacks: { equipmentSlot1: 3, equipmentSlot2: 1 },
    });
    const result = reduce(state, { type: 'START_TURN' } as GameAction);
    expect(result.state.slotExtraAttacks?.equipmentSlot1).toBe(0);
    expect(result.state.slotExtraAttacks?.equipmentSlot2).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Combat consumption: PERFORM_HERO_ATTACK consumes slotExtraAttacks before
// global extraAttackCharges
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 生长之刃 上手 handler (growth-blade-onhand)
// ---------------------------------------------------------------------------

function makeGrowthBlade(idSuffix = 'gb') {
  return {
    id: `weapon-${idSuffix}`,
    type: 'weapon' as const,
    name: '生长之刃',
    value: 1,
    image: '',
    durability: 4,
    maxDurability: 4,
    onEnterHandEffect: 'growth-blade-onhand',
  };
}

describe('growth-blade-onhand handler', () => {
  it('drawing 生长之刃 amplifies its own value by +2 (and tracks amplifyBonus)', () => {
    const card = makeGrowthBlade('draw');
    const state = makeState({ handCards: [], rng: createRng(11) });
    const result = drain(state, [{ type: 'ADD_CARD_TO_HAND', card } as GameAction]);

    const inHand = result.state.handCards.find(c => c.id === card.id);
    expect(inHand).toBeDefined();
    expect(inHand!.value).toBe(3);
    expect(inHand!.amplifyBonus).toBe(2);
    expect(result.state.amplifiedCardBonus['生长之刃']).toBe(2);
  });

  it('amplification by name applies to other same-name copies sitting in the class deck', () => {
    // 真实玩法路径：两张同名卡一开始都在职业牌组里，第一张被抽到手时
    // 上手触发 AMPLIFY_CARDS_BY_NAME，会同步把还在 classDeck 里的同名副本一起 +2。
    const a = makeGrowthBlade('a');
    const b = makeGrowthBlade('b');
    const state = makeState({ handCards: [], classDeck: [b], rng: createRng(99) });

    const after1 = drain(state, [{ type: 'ADD_CARD_TO_HAND', card: a } as GameAction]);
    expect(after1.state.amplifiedCardBonus['生长之刃']).toBe(2);

    const inHandA = after1.state.handCards.find(c => c.id === a.id)!;
    const inDeckB = after1.state.classDeck.find(c => c.id === b.id)!;
    expect(inHandA.value).toBe(3);
    expect(inHandA.amplifyBonus).toBe(2);
    expect(inDeckB.value).toBe(3);
    expect(inDeckB.amplifyBonus).toBe(2);

    const after2 = drain(after1.state, [{ type: 'ADD_CARD_TO_HAND', card: inDeckB } as GameAction]);
    expect(after2.state.amplifiedCardBonus['生长之刃']).toBe(4);

    const finalA = after2.state.handCards.find(c => c.id === a.id)!;
    const finalB = after2.state.handCards.find(c => c.id === b.id)!;
    expect(finalA.value).toBe(5);
    expect(finalA.amplifyBonus).toBe(4);
    expect(finalB.value).toBe(5);
    expect(finalB.amplifyBonus).toBe(4);
  });

  it('does NOT amplify when the card was added with _skipOnEnterHand (clones)', () => {
    const card = { ...makeGrowthBlade('clone'), _skipOnEnterHand: true };
    const state = makeState({ handCards: [], rng: createRng(3) });
    const result = drain(state, [{ type: 'ADD_CARD_TO_HAND', card } as GameAction]);

    const inHand = result.state.handCards.find(c => c.id === card.id);
    expect(inHand!.value).toBe(1);
    expect(inHand!.amplifyBonus).toBeUndefined();
    expect(result.state.amplifiedCardBonus['生长之刃']).toBeUndefined();
  });
});

describe('combat consumes slotExtraAttacks for follow-up attacks on the same slot', () => {
  it('allows a second attack on the same slot when slotExtraAttacks > 0 and decrements it', () => {
    const monster = {
      id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5,
      hp: 20, maxHp: 20, attack: 5,
    };
    const weapon = {
      id: 'w1', type: 'weapon' as const, name: 'Sword', value: 3,
      durability: 5, maxDurability: 5,
    };
    const state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      equipmentSlot1: weapon as any,
      slotExtraAttacks: { equipmentSlot1: 1, equipmentSlot2: 0 },
      extraAttackCharges: 0,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
        // Slot already attacked once this turn.
        heroAttacksThisTurn: { equipmentSlot1: true, equipmentSlot2: false },
        heroAttacksRemaining: 0,
      },
    });

    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
      isBuildingNoEngaged: false,
    } as GameAction);

    // Attack should have proceeded (state changed).
    expect(result.state).not.toBe(state);
    // slotExtraAttacks should now be 0; extraAttackCharges untouched.
    expect(result.state.slotExtraAttacks?.equipmentSlot1).toBe(0);
    expect(result.state.extraAttackCharges).toBe(0);
  });

  it('refuses extra attack when both slotExtraAttacks and extraAttackCharges are 0', () => {
    const monster = {
      id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5,
      hp: 20, maxHp: 20, attack: 5,
    };
    const weapon = {
      id: 'w1', type: 'weapon' as const, name: 'Sword', value: 3,
      durability: 5, maxDurability: 5,
    };
    const state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      equipmentSlot1: weapon as any,
      slotExtraAttacks: { equipmentSlot1: 0, equipmentSlot2: 0 },
      extraAttackCharges: 0,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
        heroAttacksThisTurn: { equipmentSlot1: true, equipmentSlot2: false },
        heroAttacksRemaining: 0,
      },
    });

    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm1',
      isBuildingNoEngaged: false,
    } as GameAction);

    expect(result.state).toBe(state);
  });
});
