/**
 * 锻造赌运 (knight: repair-enrage-dice) — Permanent magic.
 *
 * Spec (CARD_POOL_REFERENCE.md):
 *   选择一个装备和一个怪物，掷骰——80% 该装备 +1 耐久，20% 该怪物 -1 血层并激怒（攻击+2）。
 *
 * Flow:
 *   1. PLAY_CARD → resolveAllMagicEffects → sets pendingMagicAction (slot-select).
 *   2. RESOLVE_MAGIC_SLOT_SELECTION → if exactly 1 monster, emits ui:requestDice.
 *      If multiple monsters, sets pendingMagicAction (monster-select).
 *   3. RESOLVE_MAGIC_MONSTER_SELECTION → emits ui:requestDice.
 *   4. RESOLVE_DICE → enqueues RESOLVE_REPAIR_ENRAGE_DICE.
 *   5. RESOLVE_REPAIR_ENRAGE_DICE → applies durability (+1) or layer/attack mod.
 *      Then enqueues FINALIZE_MAGIC_CARD.
 *   6. FINALIZE_MAGIC_CARD → permanent magic → ADD_TO_RECYCLE_BAG.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots } from '@/components/game-board/types';
import type { GameCardData } from '@/components/GameCard';
import type { EquipmentItem } from '../types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeForgeGambleCard(idSuffix = 'fg'): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic',
    name: '锻造赌运',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    magicEffect: '掷骰：80% 修复装备，20% 怪物减层激怒。',
    description: 'test',
    knightEffect: 'repair-enrage-dice',
    recycleDelay: 2,
  } as any;
}

function makeWeapon(id: string, durability = 2, maxDurability = 5): EquipmentItem {
  return {
    id,
    type: 'weapon',
    name: `Sword-${id}`,
    value: 3,
    image: '',
    durability,
    maxDurability,
  } as any;
}

function makeMonster(id: string, hp = 10, layers = 2, attack = 3) {
  return {
    id,
    type: 'monster' as const,
    name: `M${id}`,
    value: attack,
    attack,
    hp,
    maxHp: hp,
    currentLayer: layers,
    fury: layers,
    hpLayers: layers,
  };
}

function activeRowOf(...monsters: ReturnType<typeof makeMonster>[]): ActiveRowSlots {
  const row: (ReturnType<typeof makeMonster> | null)[] = [null, null, null, null, null];
  for (let i = 0; i < monsters.length && i < 5; i++) row[i] = monsters[i];
  return row as unknown as ActiveRowSlots;
}

// ---------------------------------------------------------------------------
// 1. PLAY_CARD → pending slot-select
// ---------------------------------------------------------------------------

describe('锻造赌运 — PLAY_CARD opens slot-select', () => {
  it('sets pendingMagicAction.effect = repair-enrage-dice / step = slot-select', () => {
    const card = makeForgeGambleCard('p1');
    const weapon = makeWeapon('w1', 2, 5);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: weapon,
      activeCards: activeRowOf(makeMonster('m1')),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('repair-enrage-dice');
    expect((result.state.pendingMagicAction as any).step).toBe('slot-select');
    // Card removed from hand at PLAY_CARD time.
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
  });

  it('with no equipped slots: finalizes immediately and recycles the card', () => {
    const card = makeForgeGambleCard('p2');
    const state = makeState({
      handCards: [card],
      equipmentSlot1: null,
      equipmentSlot2: null,
      activeCards: activeRowOf(makeMonster('m1')),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).toBeNull();
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
    // Permanent magic with no equipment → still goes to recycle bag.
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. RESOLVE_MAGIC_SLOT_SELECTION → ui:requestDice
// ---------------------------------------------------------------------------

describe('锻造赌运 — slot-select with exactly 1 monster', () => {
  it('emits ui:requestDice carrying card+slotId+monsterId in context', () => {
    const card = makeForgeGambleCard('s1');
    const weapon = makeWeapon('w1', 2, 5);
    const state = makeState({
      handCards: [],
      equipmentSlot1: weapon,
      activeCards: activeRowOf(makeMonster('m1')),
      pendingMagicAction: {
        card,
        effect: 'repair-enrage-dice',
        step: 'slot-select',
        prompt: '选择一个装备栏。',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const diceFx = result.sideEffects.find(e => e.event === 'ui:requestDice');
    expect(diceFx).toBeDefined();
    const payload = (diceFx as any).payload;
    expect(payload.context.flowId).toBe('repair-enrage-dice');
    expect(payload.context.slotId).toBe('equipmentSlot1');
    expect(payload.context.monsterId).toBe('m1');
    expect(payload.context.card?.id).toBe(card.id);
  });

  it('uses 80/20 dice odds (BUG: currently 50/50)', () => {
    const card = makeForgeGambleCard('s2');
    const weapon = makeWeapon('w1', 2, 5);
    const state = makeState({
      handCards: [],
      equipmentSlot1: weapon,
      activeCards: activeRowOf(makeMonster('m1')),
      pendingMagicAction: {
        card,
        effect: 'repair-enrage-dice',
        step: 'slot-select',
        prompt: '选择一个装备栏。',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const diceFx = result.sideEffects.find(e => e.event === 'ui:requestDice');
    const entries = (diceFx as any).payload.entries;
    const repair = entries.find((e: any) => e.id === 'repair');
    const enrage = entries.find((e: any) => e.id === 'enrage');
    // Spec from CARD_POOL_REFERENCE.md: 80% repair, 20% enrage.
    expect(repair.range).toEqual([1, 16]);
    expect(enrage.range).toEqual([17, 20]);
  });
});

// ---------------------------------------------------------------------------
// 3. RESOLVE_REPAIR_ENRAGE_DICE — direct outcome application
// ---------------------------------------------------------------------------

describe('锻造赌运 — RESOLVE_REPAIR_ENRAGE_DICE outcome', () => {
  it('repair: increases durability of equipment in the chosen slot by 1', () => {
    const card = makeForgeGambleCard('r1');
    const weapon = makeWeapon('w1', 2, 5);
    const state = makeState({
      handCards: [],
      equipmentSlot1: weapon,
      activeCards: activeRowOf(makeMonster('m1', 10, 2, 3)),
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_REPAIR_ENRAGE_DICE',
        card,
        slotId: 'equipmentSlot1',
        monsterId: 'm1',
        diceResultId: 'repair',
      } as GameAction,
    ]);
    expect((result.state.equipmentSlot1 as EquipmentItem).durability).toBe(3);
  });

  it('repair: caps at maxDurability', () => {
    const card = makeForgeGambleCard('r-cap');
    const weapon = makeWeapon('w1', 5, 5);
    const state = makeState({
      handCards: [],
      equipmentSlot1: weapon,
      activeCards: activeRowOf(makeMonster('m1', 10, 2, 3)),
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_REPAIR_ENRAGE_DICE',
        card,
        slotId: 'equipmentSlot1',
        monsterId: 'm1',
        diceResultId: 'repair',
      } as GameAction,
    ]);
    expect((result.state.equipmentSlot1 as EquipmentItem).durability).toBe(5);
  });

  it('repair: works on equipmentSlot2', () => {
    const card = makeForgeGambleCard('r-slot2');
    const weapon = makeWeapon('w2', 1, 4);
    const state = makeState({
      handCards: [],
      equipmentSlot2: weapon,
      activeCards: activeRowOf(makeMonster('m1', 10, 2, 3)),
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_REPAIR_ENRAGE_DICE',
        card,
        slotId: 'equipmentSlot2',
        monsterId: 'm1',
        diceResultId: 'repair',
      } as GameAction,
    ]);
    expect((result.state.equipmentSlot2 as EquipmentItem).durability).toBe(2);
  });

  it('enrage (layers > 1): -1 layer and +2 attack', () => {
    const card = makeForgeGambleCard('e1');
    const weapon = makeWeapon('w1', 2, 5);
    const state = makeState({
      handCards: [],
      equipmentSlot1: weapon,
      activeCards: activeRowOf(makeMonster('m1', 10, 2, 3)),
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_REPAIR_ENRAGE_DICE',
        card,
        slotId: 'equipmentSlot1',
        monsterId: 'm1',
        diceResultId: 'enrage',
      } as GameAction,
    ]);
    const monster = result.state.activeCards.find(c => c?.id === 'm1') as any;
    expect(monster?.currentLayer).toBe(1);
    expect(monster?.attack).toBe(5);
    expect(monster?.value).toBe(5);
    // Equipment durability untouched.
    expect((result.state.equipmentSlot1 as EquipmentItem).durability).toBe(2);
  });

  it('enrage (last layer): just +2 attack, no negative layer', () => {
    const card = makeForgeGambleCard('e2');
    const weapon = makeWeapon('w1', 2, 5);
    const state = makeState({
      handCards: [],
      equipmentSlot1: weapon,
      activeCards: activeRowOf(makeMonster('m1', 10, 1, 3)),
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_REPAIR_ENRAGE_DICE',
        card,
        slotId: 'equipmentSlot1',
        monsterId: 'm1',
        diceResultId: 'enrage',
      } as GameAction,
    ]);
    const monster = result.state.activeCards.find(c => c?.id === 'm1') as any;
    expect(monster?.currentLayer).toBe(1);
    expect(monster?.attack).toBe(5);
  });

  it('after RESOLVE_REPAIR_ENRAGE_DICE: card is finalized into recycle bag (permanent magic)', () => {
    const card = makeForgeGambleCard('fin');
    const weapon = makeWeapon('w1', 2, 5);
    const state = makeState({
      handCards: [],
      equipmentSlot1: weapon,
      activeCards: activeRowOf(makeMonster('m1', 10, 2, 3)),
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_REPAIR_ENRAGE_DICE',
        card,
        slotId: 'equipmentSlot1',
        monsterId: 'm1',
        diceResultId: 'repair',
      } as GameAction,
    ]);
    // Card should NOT be in graveyard.
    expect(result.state.discardedCards.some(c => c.id === card.id)).toBe(false);
    // Card SHOULD be in permanentMagicRecycleBag.
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. End-to-end via RESOLVE_DICE (the full live flow used by useEventSystem)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 4a. No-monster path — the card MUST still be playable when the board is empty
// ---------------------------------------------------------------------------

describe('锻造赌运 — no monsters on board (still playable)', () => {
  it('PLAY_CARD with no monsters: still opens slot-select (does NOT auto-finalize)', () => {
    const card = makeForgeGambleCard('nm-play');
    const weapon = makeWeapon('w1', 2, 5);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: weapon,
      activeCards: activeRowOf(),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('repair-enrage-dice');
    expect((result.state.pendingMagicAction as any).step).toBe('slot-select');
  });

  it('RESOLVE_MAGIC_SLOT_SELECTION with 0 monsters: emits ui:requestDice with monsterId=undefined', () => {
    const card = makeForgeGambleCard('nm-slot');
    const weapon = makeWeapon('w1', 2, 5);
    const state = makeState({
      handCards: [],
      equipmentSlot1: weapon,
      activeCards: activeRowOf(),
      pendingMagicAction: {
        card,
        effect: 'repair-enrage-dice',
        step: 'slot-select',
        prompt: '选择一个装备栏。',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const diceFx = result.sideEffects.find(e => e.event === 'ui:requestDice');
    expect(diceFx).toBeDefined();
    const payload = (diceFx as any).payload;
    expect(payload.context.flowId).toBe('repair-enrage-dice');
    expect(payload.context.slotId).toBe('equipmentSlot1');
    expect(payload.context.monsterId).toBeUndefined();
    // Card must NOT be in recycle bag yet — the dice still needs to resolve.
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(false);
  });

  it('RESOLVE_DICE repair outcome with no monsters: durability +1 + recycle bag', () => {
    const card = makeForgeGambleCard('nm-repair');
    const weapon = makeWeapon('w1', 2, 5);
    const state = makeState({
      handCards: [],
      equipmentSlot1: weapon,
      activeCards: activeRowOf(),
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_DICE',
        value: 5,
        outcomeId: 'repair',
        context: {
          flowId: 'repair-enrage-dice',
          slotId: 'equipmentSlot1',
          // monsterId intentionally omitted
          cardId: card.id,
          card,
        },
      } as GameAction,
    ]);
    expect((result.state.equipmentSlot1 as EquipmentItem).durability).toBe(3);
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
  });

  it('RESOLVE_DICE enrage outcome with no monsters: durability unchanged, card still recycled', () => {
    const card = makeForgeGambleCard('nm-enrage');
    const weapon = makeWeapon('w1', 2, 5);
    const state = makeState({
      handCards: [],
      equipmentSlot1: weapon,
      activeCards: activeRowOf(),
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_DICE',
        value: 18,
        outcomeId: 'enrage',
        context: {
          flowId: 'repair-enrage-dice',
          slotId: 'equipmentSlot1',
          // monsterId intentionally omitted
          cardId: card.id,
          card,
        },
      } as GameAction,
    ]);
    // Equipment durability untouched.
    expect((result.state.equipmentSlot1 as EquipmentItem).durability).toBe(2);
    // Card still finalized (consumed → recycle bag).
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
  });
});

describe('锻造赌运 — end-to-end via RESOLVE_DICE flow', () => {
  it('RESOLVE_DICE with repair outcome → durability +1 + recycle bag', () => {
    const card = makeForgeGambleCard('e2e-repair');
    const weapon = makeWeapon('w1', 2, 5);
    const state = makeState({
      handCards: [],
      equipmentSlot1: weapon,
      activeCards: activeRowOf(makeMonster('m1', 10, 2, 3)),
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_DICE',
        value: 5,
        outcomeId: 'repair',
        context: {
          flowId: 'repair-enrage-dice',
          slotId: 'equipmentSlot1',
          monsterId: 'm1',
          cardId: card.id,
          card,
        },
      } as GameAction,
    ]);
    expect((result.state.equipmentSlot1 as EquipmentItem).durability).toBe(3);
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
  });

  it('RESOLVE_DICE with enrage outcome → monster -1 layer +2 atk + recycle bag', () => {
    const card = makeForgeGambleCard('e2e-enrage');
    const weapon = makeWeapon('w1', 2, 5);
    const state = makeState({
      handCards: [],
      equipmentSlot1: weapon,
      activeCards: activeRowOf(makeMonster('m1', 10, 2, 3)),
    });
    const result = drain(state, [
      {
        type: 'RESOLVE_DICE',
        value: 18,
        outcomeId: 'enrage',
        context: {
          flowId: 'repair-enrage-dice',
          slotId: 'equipmentSlot1',
          monsterId: 'm1',
          cardId: card.id,
          card,
        },
      } as GameAction,
    ]);
    const monster = result.state.activeCards.find(c => c?.id === 'm1') as any;
    expect(monster?.currentLayer).toBe(1);
    expect(monster?.attack).toBe(5);
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
  });
});
