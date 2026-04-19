import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import { initialCombatState, BASE_BACKPACK_CAPACITY } from '../constants';
import type { GameAction } from '../actions';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeMonster(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5,
    hp: 10, maxHp: 10, attack: 5,
    ...overrides,
  };
}

function makeCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1', type: 'weapon' as const, name: 'Sword', value: 3,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SET_GAME_FLAGS (typed field mutation)
// ---------------------------------------------------------------------------

describe('SET_GAME_FLAGS', () => {
  it('applies a partial state patch', () => {
    const state = makeState({ hp: 20, turnCount: 3 });
    const result = reduce(state, { type: 'SET_GAME_FLAGS', patch: { turnCount: 10 } });
    expect(result.state.turnCount).toBe(10);
    expect(result.state.hp).toBe(20);
  });

  it('produces no side effects or enqueued actions', () => {
    const state = makeState();
    const result = reduce(state, { type: 'SET_GAME_FLAGS', patch: { hp: 5 } });
    expect(result.sideEffects).toEqual([]);
    expect(result.enqueuedActions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// START_TURN
// ---------------------------------------------------------------------------

describe('START_TURN', () => {
  it('resets turnDamageTaken', () => {
    const state = makeState({ turnDamageTaken: 10, turnCount: 2 });
    const result = reduce(state, { type: 'START_TURN' });
    expect(result.state.turnDamageTaken).toBe(0);
  });

  it('resets per-turn combat flags', () => {
    const state = makeState({
      berserkerSlotUsed: { equipmentSlot1: true } as any,
      flashSlotUsed: { equipmentSlot1: true } as any,
      gambitSlotUsed: { equipmentSlot1: true } as any,
      weaponExtraAttackUsed: { equipmentSlot1: true } as any,
      extraAttackCharges: 3,
    });
    const result = reduce(state, { type: 'START_TURN' });
    expect(result.state.berserkerSlotUsed).toEqual({});
    expect(result.state.flashSlotUsed).toEqual({});
    expect(result.state.gambitSlotUsed).toEqual({});
    expect(result.state.weaponExtraAttackUsed).toEqual({});
    expect(result.state.extraAttackCharges).toBe(0);
  });

  it('sets phase to playerInput', () => {
    const state = makeState({ phase: 'monsterTurn' as any });
    const result = reduce(state, { type: 'START_TURN' });
    expect(result.state.phase).toBe('playerInput');
  });
});

// ---------------------------------------------------------------------------
// BEGIN_COMBAT
// ---------------------------------------------------------------------------

describe('BEGIN_COMBAT', () => {
  it('sets up combat state for engaged monster', () => {
    const monster = makeMonster();
    const state = makeState({
      activeCards: [monster, null, null, null, null],
    });

    const result = reduce(state, {
      type: 'BEGIN_COMBAT',
      monster: monster as any,
      initiator: 'flip',
    });

    expect(result.state.combatState.engagedMonsterIds).toContain('m1');
    expect(result.state.combatState.currentTurn).toBe('hero');
  });

  it('returns noChange for building targets', () => {
    const building = {
      id: 'b1', type: 'building' as const, name: 'Shop', value: 0,
    };
    const state = makeState({
      activeCards: [building, null, null, null, null],
    });

    const result = reduce(state, {
      type: 'BEGIN_COMBAT',
      monster: building as any,
      initiator: 'flip',
    });

    expect(result.state).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// PLAY_CARD
// ---------------------------------------------------------------------------

describe('PLAY_CARD', () => {
  it('removes card from hand', () => {
    const card = makeCard({ id: 'c1', type: 'weapon' as const });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: null,
      activeCards: [null, null, null, null, null],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: [],
      },
    });

    const result = reduce(state, {
      type: 'PLAY_CARD',
      cardId: 'c1',
    });

    expect(result.state.handCards.length).toBe(0);
  });

  it('emits side effects for potion cards', () => {
    const potion = makeCard({ id: 'p1', type: 'potion' as const, name: 'Health Potion', value: 5 });
    const state = makeState({
      handCards: [potion],
      activeCards: [null, null, null, null, null],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: [],
      },
    });

    const result = reduce(state, {
      type: 'PLAY_CARD',
      cardId: 'p1',
    });

    expect(result.state.handCards.length).toBe(0);
    const potionEffect = result.sideEffects.find(e => e.event === 'card:potionPlayed');
    expect(potionEffect).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// EQUIP_CARD
// ---------------------------------------------------------------------------

describe('EQUIP_CARD', () => {
  it('equips card to specified slot', () => {
    const weapon = makeCard({ id: 'w1', type: 'weapon' as const, name: 'Axe', value: 4 });
    const state = makeState({
      handCards: [weapon],
      equipmentSlot1: null,
    });

    const result = reduce(state, {
      type: 'EQUIP_CARD',
      cardId: 'w1',
      slotId: 'equipmentSlot1',
    });

    expect(result.state.equipmentSlot1).not.toBeNull();
    expect(result.state.equipmentSlot1?.id).toBe('w1');
  });
});

// ---------------------------------------------------------------------------
// DRAW_CARDS (deck source)
// ---------------------------------------------------------------------------

describe('DRAW_CARDS from deck', () => {
  it('draws a card from deck to hand', () => {
    const deckCard = makeCard({ id: 'd1', type: 'potion' as const, name: 'Potion', value: 3 });
    const state = makeState({
      remainingDeck: [deckCard],
      handCards: [],
    });

    const result = reduce(state, { type: 'DRAW_CARDS', count: 1, source: 'deck' });
    expect(result.state.handCards.length).toBe(1);
    expect(result.state.remainingDeck.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Event actions
// ---------------------------------------------------------------------------

describe('START_EVENT', () => {
  it('sets the current event and phase', () => {
    const eventCard = makeCard({ id: 'ev1', type: 'event' as const, name: 'Merchant' });
    const state = makeState();

    const result = reduce(state, {
      type: 'START_EVENT',
      card: eventCard as any,
    });

    expect(result.state.phase).toBe('event');
    expect(result.sideEffects.some(e => e.event === 'event:started')).toBe(true);
  });
});

describe('COMPLETE_EVENT', () => {
  it('emits event:completed and clears modal state when currentEventCard is set', () => {
    const eventCard = makeCard({ id: 'ev1', type: 'event' as const, name: 'Merchant' });
    const state = makeState();
    const startResult = reduce(state, {
      type: 'START_EVENT',
      card: eventCard as any,
    });

    const result = reduce(startResult.state, { type: 'COMPLETE_EVENT' });
    expect(result.sideEffects.some(e => e.event === 'event:completed')).toBe(true);
    expect(result.state.currentEventCard).toBeNull();
    expect(result.state.eventModalOpen).toBe(false);
  });
});

describe('FINALIZE_EVENT', () => {
  it('clears current event and resets phase', () => {
    const eventCard = makeCard({ id: 'ev1', type: 'event' as const, name: 'Merchant' });
    const state = makeState();
    // Set up event first
    const startResult = reduce(state, {
      type: 'START_EVENT',
      card: eventCard as any,
    });

    const result = reduce(startResult.state, { type: 'FINALIZE_EVENT' });
    expect(result.state.phase).toBe('playing');
  });
});

// ---------------------------------------------------------------------------
// Hero actions
// ---------------------------------------------------------------------------

describe('USE_HERO_SKILL', () => {
  it('emits hero:skillUsed side effect', () => {
    const state = makeState();

    const result = reduce(state, {
      type: 'USE_HERO_SKILL',
      skillId: 'slash',
    });

    expect(result.sideEffects.some(e => e.event === 'hero:skillUsed')).toBe(true);
  });
});

describe('ADD_MAGIC_GAUGE', () => {
  it('emits hero:magicGaugeAdded side effect', () => {
    const state = makeState();

    const result = reduce(state, {
      type: 'ADD_MAGIC_GAUGE',
      amount: 1,
      source: 'attack',
    });

    expect(result.sideEffects.some(e => e.event === 'hero:magicGaugeAdded')).toBe(true);
  });
});

describe('PERSUADE_MONSTER', () => {
  it('deducts gold for persuade cost', () => {
    const monster = makeMonster({ id: 'm1' });
    const state = makeState({
      gold: 20,
      activeCards: [monster, null, null, null, null],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
      },
    });

    const result = reduce(state, {
      type: 'PERSUADE_MONSTER',
      monsterId: 'm1',
    });

    expect(result.state.gold).toBeLessThan(20);
    expect(result.sideEffects.some(e => e.event === 'hero:persuadeAttempt')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Shop: SHOP_DELETE_EQUIPMENT
// ---------------------------------------------------------------------------

describe('SHOP_DELETE_EQUIPMENT', () => {
  it('removes equipment from slot', () => {
    const weapon = makeCard({ id: 'w1', type: 'weapon' as const, name: 'Sword' });
    const state = makeState({
      equipmentSlot1: weapon as any,
    });

    const result = reduce(state, {
      type: 'SHOP_DELETE_EQUIPMENT',
      slotId: 'equipmentSlot1',
    });

    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.sideEffects.some(e => e.event === 'equipment:disposed')).toBe(true);
  });

  it('returns noChange if slot is empty', () => {
    const state = makeState({ equipmentSlot1: null });

    const result = reduce(state, {
      type: 'SHOP_DELETE_EQUIPMENT',
      slotId: 'equipmentSlot1',
    });

    expect(result.state).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// Shop: SHOP_DISCOVER
// ---------------------------------------------------------------------------

describe('SHOP_DISCOVER', () => {
  it('emits shop:discoverStarted', () => {
    const state = makeState();

    const result = reduce(state, {
      type: 'SHOP_DISCOVER',
      source: 'skill',
    });

    expect(result.sideEffects.some(e => e.event === 'shop:discoverStarted')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ENFORCE_BACKPACK_CAPACITY
// ---------------------------------------------------------------------------

describe('ENFORCE_BACKPACK_CAPACITY', () => {
  it('moves overflow items to recycle bag', () => {
    const items = Array.from({ length: BASE_BACKPACK_CAPACITY + 5 }, (_, i) => ({
      id: `bp${i}`, type: 'potion' as const, name: `Item ${i}`, value: 1,
    }));
    const state = makeState({
      backpackItems: items,
      backpackCapacityModifier: 0,
    });

    const result = reduce(state, { type: 'ENFORCE_BACKPACK_CAPACITY' });
    expect(result.state.backpackItems.length).toBeLessThanOrEqual(BASE_BACKPACK_CAPACITY);
  });

  it('does nothing if within capacity', () => {
    const items = Array.from({ length: 3 }, (_, i) => ({
      id: `bp${i}`, type: 'potion' as const, name: `Item ${i}`, value: 1,
    }));
    const state = makeState({
      backpackItems: items,
      backpackCapacityModifier: 0,
    });

    const result = reduce(state, { type: 'ENFORCE_BACKPACK_CAPACITY' });
    expect(result.state.backpackItems.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// RESET_TURN_STATE
// ---------------------------------------------------------------------------

describe('RESET_TURN_STATE', () => {
  it('clears per-turn flags', () => {
    const state = makeState({
      berserkerSlotUsed: { equipmentSlot1: true } as any,
      flashSlotUsed: { equipmentSlot1: true } as any,
      gambitSlotUsed: { equipmentSlot1: true } as any,
      weaponExtraAttackUsed: { equipmentSlot1: true } as any,
      extraAttackCharges: 5,
      doubleNextMagic: true,
      magicCardsPlayedThisTurn: 3,
    });

    const result = reduce(state, { type: 'RESET_TURN_STATE' });
    expect(result.state.berserkerSlotUsed).toEqual({});
    expect(result.state.flashSlotUsed).toEqual({});
    expect(result.state.gambitSlotUsed).toEqual({});
    expect(result.state.weaponExtraAttackUsed).toEqual({});
    expect(result.state.extraAttackCharges).toBe(0);
    expect(result.state.doubleNextMagic).toBe(false);
    expect(result.state.magicCardsPlayedThisTurn).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SHOP_LEVEL_UP
// ---------------------------------------------------------------------------

describe('SHOP_LEVEL_UP', () => {
  it('increases shop level and deducts gold', () => {
    const state = makeState({ shopLevel: 0, gold: 50, shopLevelUpUsed: false });
    const result = reduce(state, { type: 'SHOP_LEVEL_UP' });
    expect(result.state.shopLevel).toBe(1);
    expect(result.state.gold).toBeLessThan(50);
    expect(result.state.shopLevelUpUsed).toBe(true);
  });

  it('does nothing if already at max level', () => {
    const state = makeState({ shopLevel: 3, gold: 50, shopLevelUpUsed: false });
    const result = reduce(state, { type: 'SHOP_LEVEL_UP' });
    expect(result.state.shopLevel).toBe(3);
    expect(result.state.gold).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// FINALIZE_CARD_PLAY
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AMPLIFY_CARDS_BY_NAME
// ---------------------------------------------------------------------------

describe('AMPLIFY_CARDS_BY_NAME', () => {
  it('records bonus by name and applies to all same-name cards across collections', () => {
    const handBolt = { id: 'h1', type: 'magic' as const, name: '魔弹', value: 0 };
    const deckBolt = { id: 'd1', type: 'magic' as const, name: '魔弹', value: 0 };
    const recycleBolt = { id: 'r1', type: 'magic' as const, name: '魔弹', value: 0, amplifyBonus: 1 };
    const otherCard = { id: 'o1', type: 'magic' as const, name: '烈焰术', value: 0 };

    const state = makeState({
      handCards: [handBolt, otherCard],
      remainingDeck: [deckBolt],
      permanentMagicRecycleBag: [recycleBolt],
    });

    const result = reduce(state, {
      type: 'AMPLIFY_CARDS_BY_NAME',
      cardName: '魔弹',
      amount: 2,
      source: '增幅祭坛',
    });

    expect(result.state.amplifiedCardBonus['魔弹']).toBe(2);
    expect(result.state.handCards[0].amplifyBonus).toBe(2);
    expect(result.state.handCards[1].amplifyBonus).toBeUndefined();
    expect(result.state.remainingDeck[0].amplifyBonus).toBe(2);
    expect(result.state.permanentMagicRecycleBag[0].amplifyBonus).toBe(3);
  });

  it('accumulates across multiple invocations with the same name', () => {
    const bolt = { id: 'h1', type: 'magic' as const, name: '魔弹', value: 0 };
    const state = makeState({ handCards: [bolt] });

    const r1 = reduce(state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: '魔弹', amount: 2 });
    const r2 = reduce(r1.state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: '魔弹', amount: 2 });

    expect(r2.state.amplifiedCardBonus['魔弹']).toBe(4);
    expect(r2.state.handCards[0].amplifyBonus).toBe(4);
  });

  it('tracks different names independently', () => {
    const bolt = { id: 'h1', type: 'magic' as const, name: '魔弹', value: 0 };
    const flame = { id: 'h2', type: 'magic' as const, name: '烈焰术', value: 0 };
    const state = makeState({ handCards: [bolt, flame] });

    const r1 = reduce(state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: '魔弹', amount: 2 });
    const r2 = reduce(r1.state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: '烈焰术', amount: 2 });

    expect(r2.state.amplifiedCardBonus['魔弹']).toBe(2);
    expect(r2.state.amplifiedCardBonus['烈焰术']).toBe(2);
    expect(r2.state.handCards[0].amplifyBonus).toBe(2);
    expect(r2.state.handCards[1].amplifyBonus).toBe(2);
  });

  it('weapon cards: increments value (and amplifyBonus)', () => {
    const sword = { id: 'h1', type: 'weapon' as const, name: '长剑', value: 3 };
    const state = makeState({ handCards: [sword] });
    const result = reduce(state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: '长剑', amount: 2 });
    expect(result.state.handCards[0].value).toBe(5);
    expect(result.state.handCards[0].amplifyBonus).toBe(2);
  });

  it('shield cards: increments armorMax and value', () => {
    const shield = { id: 'h1', type: 'shield' as const, name: '盾牌', value: 3, armorMax: 4 };
    const state = makeState({ handCards: [shield] });
    const result = reduce(state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: '盾牌', amount: 2 });
    expect(result.state.handCards[0].value).toBe(5);
    expect(result.state.handCards[0].armorMax).toBe(6);
    expect(result.state.handCards[0].amplifyBonus).toBe(2);
  });

  it('magic with scalingDamage increments scalingDamage', () => {
    const stinger = { id: 'h1', type: 'magic' as const, name: '叠刺', value: 0, scalingDamage: 1 };
    const state = makeState({ handCards: [stinger] });
    const result = reduce(state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: '叠刺', amount: 2 });
    expect(result.state.handCards[0].scalingDamage).toBe(3);
    expect(result.state.handCards[0].amplifyBonus).toBe(2);
  });

  it('amplifies equipment slots and reserves', () => {
    const slot = { id: 'eq1', type: 'weapon' as const, name: '魔剑', value: 4, fromSlot: 'equipmentSlot1' as const };
    const reserveItem = { id: 'eq2', type: 'weapon' as const, name: '魔剑', value: 4, fromSlot: 'equipmentSlot1' as const };
    const state = makeState({
      equipmentSlot1: slot as any,
      equipmentSlot1Reserve: [reserveItem as any],
    });
    const result = reduce(state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: '魔剑', amount: 2 });
    expect(result.state.equipmentSlot1?.value).toBe(6);
    expect(result.state.equipmentSlot1?.amplifyBonus).toBe(2);
    expect(result.state.equipmentSlot1Reserve[0].value).toBe(6);
  });

  it('no-op when amount is 0 or name is missing', () => {
    const state = makeState({});
    const r1 = reduce(state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: '魔弹', amount: 0 });
    expect(r1.state).toBe(state);
    const r2 = reduce(state, { type: 'AMPLIFY_CARDS_BY_NAME', cardName: '', amount: 2 });
    expect(r2.state).toBe(state);
  });
});

describe('FINALIZE_CARD_PLAY', () => {
  it('emits card:finalized with graveyard destination', () => {
    const card = makeCard({ id: 'c1' });
    const state = makeState();

    const result = reduce(state, {
      type: 'FINALIZE_CARD_PLAY',
      cardId: 'c1',
      destination: 'graveyard',
    });

    expect(result.sideEffects.some(e => e.event === 'card:finalized')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DRAW_DUNGEON_ROW
// ---------------------------------------------------------------------------

describe('DRAW_DUNGEON_ROW', () => {
  it('draws cards from remaining deck to active row', () => {
    const cards = Array.from({ length: 10 }, (_, i) => ({
      id: `d${i}`, type: 'weapon' as const, name: `Card ${i}`, value: i + 1,
    }));
    const state = makeState({
      remainingDeck: cards,
      previewCards: [],
      activeCards: [null, null, null, null, null],
    });

    const result = reduce(state, { type: 'DRAW_DUNGEON_ROW' });
    expect(result.state.remainingDeck.length).toBeLessThan(10);
  });
});
