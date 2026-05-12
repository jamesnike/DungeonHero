/**
 * `recall-equipment` knight effect — class-gated draw bonus.
 *
 * Background: 回收术 (starter, `STARTER_CARD_IDS.recallEquip`) and 紧急回收
 * (knight class card, `classCard: true`) share the same `knightEffect:
 * 'recall-equipment'` handler. Historically the handler unconditionally enqueued
 * `DRAW_FROM_BACKPACK`, so 回收术 silently drew 1 card even though its卡面
 * says only「失去 2 HP，回手一张牌」. The fix gates `DRAW_FROM_BACKPACK` on
 * `card.classCard === true` so behavior matches each card's description.
 *
 * End-to-end shape: PLAY_CARD → (auto-resolve when single option, otherwise
 * RESOLVE_MAGIC_CHOICE) → drain → assert handCards delta. Per
 * `pipeline-input-continuation.mdc` the fixture uses `phase: 'playerInput'`.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { STARTER_CARD_IDS } from '../deck';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { EquipmentItem } from '@/components/game-board/types';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

function makeShield(id: string): EquipmentItem {
  return {
    id,
    type: 'shield',
    name: 'Iron Shield',
    value: 2,
    armorMax: 2,
    durability: 2,
    maxDurability: 2,
  } as EquipmentItem;
}

function makeStarterRecallCard(): GameCardData {
  return {
    id: STARTER_CARD_IDS.recallEquip,
    type: 'magic',
    name: '回收术',
    value: 0,
    image: '',
    unique: true,
    magicType: 'permanent',
    magicEffect: '永久魔法：失去 2 HP，回手一张牌。',
    description: '失去 2 点生命，回手一张牌（从装备栏或护符栏选择）。',
    knightEffect: 'recall-equipment',
    maxUpgradeLevel: 1,
  } as GameCardData;
}

function makeKnightRecallCard(): GameCardData {
  return {
    id: 'knight-emergency-recall-1',
    type: 'magic',
    name: '紧急回收',
    value: 0,
    image: '',
    classCard: true,
    unique: true,
    magicType: 'permanent',
    magicEffect: '失去 2 HP，回手一张牌，抽 1 张牌。',
    description: '永久：失去 2 点生命，回手一张牌，抽 1 张牌。',
    knightEffect: 'recall-equipment',
    maxUpgradeLevel: 2,
  } as GameCardData;
}

function makeBackpackCard(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: `Filler ${id}`,
    value: 0,
  } as GameCardData;
}

describe('recall-equipment — class-gated draw bonus (回收术 vs 紧急回收)', () => {
  describe('single-option fast path (only one equipment / amulet slot occupied)', () => {
    it('回收术 (starter, no classCard): hp -2, recalls shield, NO backpack draw', () => {
      const card = makeStarterRecallCard();
      const shield = makeShield('s1');
      const state = makeState({
        handCards: [card],
        hp: 20,
        equipmentSlot1: shield,
        equipmentSlot2: null,
        amuletSlots: [],
        backpackItems: [makeBackpackCard('bp1'), makeBackpackCard('bp2')],
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      // HP cost paid.
      expect(result.state.hp).toBe(18);
      // Shield was recalled to hand.
      expect(result.state.equipmentSlot1).toBeNull();
      const recalled = result.state.handCards.find(c => c.id === 's1');
      expect(recalled).toBeDefined();
      // No extra draw: hand contains ONLY the recalled shield (the played
      // recall card itself has been removed and routed to permanentMagicRecycleBag).
      expect(result.state.handCards.length).toBe(1);
      // Backpack untouched.
      expect(result.state.backpackItems.length).toBe(2);
      // Banner uses the card's own name (not "紧急回收").
      const banner = result.sideEffects.find(
        s => s.event === 'ui:banner' && typeof (s.payload as any)?.text === 'string',
      );
      expect((banner?.payload as any)?.text).toMatch(/回收术/);
      expect((banner?.payload as any)?.text).not.toMatch(/紧急回收/);
      expect((banner?.payload as any)?.text).not.toMatch(/抽 1 张牌/);
    });

    it('紧急回收 (knight class, classCard: true): hp -2, recalls shield, AND draws 1 from backpack', () => {
      const card = makeKnightRecallCard();
      const shield = makeShield('s1');
      const state = makeState({
        handCards: [card],
        hp: 20,
        equipmentSlot1: shield,
        equipmentSlot2: null,
        amuletSlots: [],
        backpackItems: [makeBackpackCard('bp1'), makeBackpackCard('bp2')],
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      expect(result.state.hp).toBe(18);
      expect(result.state.equipmentSlot1).toBeNull();
      const recalled = result.state.handCards.find(c => c.id === 's1');
      expect(recalled).toBeDefined();
      // Hand has the recalled shield + 1 backpack draw = 2 cards.
      expect(result.state.handCards.length).toBe(2);
      // Backpack shrank by exactly 1.
      expect(result.state.backpackItems.length).toBe(1);
      // Banner mentions 抽 1 张牌 and uses "紧急回收".
      const banner = result.sideEffects.find(
        s => s.event === 'ui:banner' && typeof (s.payload as any)?.text === 'string',
      );
      expect((banner?.payload as any)?.text).toMatch(/紧急回收/);
      expect((banner?.payload as any)?.text).toMatch(/抽 1 张牌/);
    });
  });

  describe('multi-option path via RESOLVE_MAGIC_CHOICE', () => {
    it('回收术 (starter) with 2 slots occupied: choose slot1, no draw', () => {
      const card = makeStarterRecallCard();
      const shield1 = makeShield('s1');
      const shield2 = makeShield('s2');
      const state = makeState({
        handCards: [card],
        hp: 20,
        equipmentSlot1: shield1,
        equipmentSlot2: shield2,
        amuletSlots: [],
        backpackItems: [makeBackpackCard('bp1'), makeBackpackCard('bp2')],
      });

      const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
      expect((afterPlay.state.pendingMagicAction as any)?.effect).toBe('recall-equipment');

      const result = drain(afterPlay.state, [
        { type: 'RESOLVE_MAGIC_CHOICE', choiceId: 'equipmentSlot1' } as GameAction,
      ]);

      expect(result.state.equipmentSlot1).toBeNull();
      // Recalled shield in hand; no extra draw.
      const recalled = result.state.handCards.find(c => c.id === 's1');
      expect(recalled).toBeDefined();
      expect(result.state.handCards.length).toBe(1);
      expect(result.state.backpackItems.length).toBe(2);
    });

    it('紧急回收 (knight class) with 2 slots occupied: choose slot1, AND draws 1', () => {
      const card = makeKnightRecallCard();
      const shield1 = makeShield('s1');
      const shield2 = makeShield('s2');
      const state = makeState({
        handCards: [card],
        hp: 20,
        equipmentSlot1: shield1,
        equipmentSlot2: shield2,
        amuletSlots: [],
        backpackItems: [makeBackpackCard('bp1'), makeBackpackCard('bp2')],
      });

      const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
      expect((afterPlay.state.pendingMagicAction as any)?.effect).toBe('recall-equipment');

      const result = drain(afterPlay.state, [
        { type: 'RESOLVE_MAGIC_CHOICE', choiceId: 'equipmentSlot1' } as GameAction,
      ]);

      expect(result.state.equipmentSlot1).toBeNull();
      // Hand has the recalled shield + 1 backpack draw = 2 cards.
      expect(result.state.handCards.length).toBe(2);
      expect(result.state.backpackItems.length).toBe(1);
    });
  });
});
