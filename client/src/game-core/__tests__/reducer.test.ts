import { describe, expect, it } from 'vitest';
import { reduce, noChange, applyPatch } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { createRng, shuffle as rngShuffle } from '../rng';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import { initialCombatState, BASE_BACKPACK_CAPACITY, HAND_LIMIT } from '../constants';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe('reducer', () => {
  describe('NO_OP', () => {
    it('returns unchanged state', () => {
      const state = makeState();
      const result = reduce(state, { type: 'NO_OP' });
      expect(result.state).toBe(state);
      expect(result.sideEffects).toEqual([]);
      expect(result.enqueuedActions).toEqual([]);
    });
  });

  describe('ENQUEUE_ACTIONS', () => {
    it('returns actions to enqueue without changing state', () => {
      const state = makeState();
      const actions: GameAction[] = [
        { type: 'START_TURN' },
        { type: 'ADVANCE_MONSTER_TURN' },
      ];
      const result = reduce(state, { type: 'ENQUEUE_ACTIONS', actions });
      expect(result.state).toBe(state);
      expect(result.enqueuedActions).toEqual(actions);
    });
  });

  describe('END_TURN', () => {
    it('transitions to monster turn when there are engaged monsters', () => {
      const monster = {
        id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5,
        hp: 10, maxHp: 10, attack: 5,
      };
      const state = makeState({
        activeCards: [monster, null, null, null, null],
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: ['m1'],
          currentTurn: 'hero',
        },
      });

      const result = reduce(state, {
        type: 'END_TURN',
        heroTurnLayerLossIds: [],
      });

      expect(result.state.combatState.currentTurn).toBe('monster');
      expect(result.state.combatState.monsterAttackQueue).toEqual(['m1']);
      expect(result.state.phase).toBe('monsterTurn');
      expect(result.enqueuedActions).toEqual([{ type: 'ADVANCE_MONSTER_TURN' }]);
    });

    it('returns to playerInput if no engaged monsters', () => {
      const state = makeState({
        activeCards: [null, null, null, null, null],
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: [],
          currentTurn: 'hero',
        },
      });

      const result = reduce(state, {
        type: 'END_TURN',
        heroTurnLayerLossIds: [],
      });

      expect(result.state.phase).toBe('playerInput');
    });
  });

  describe('ADVANCE_MONSTER_TURN', () => {
    it('sets pendingBlock for next monster in queue', () => {
      const monster = {
        id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5,
        hp: 10, maxHp: 10, attack: 5,
      };
      const state = makeState({
        activeCards: [monster, null, null, null, null],
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: ['m1'],
          currentTurn: 'monster',
          monsterAttackQueue: ['m1'],
          pendingBlock: null,
        },
      });

      const result = reduce(state, { type: 'ADVANCE_MONSTER_TURN' });

      expect(result.state.combatState.pendingBlock).not.toBeNull();
      expect(result.state.combatState.pendingBlock?.monsterId).toBe('m1');
      expect(result.state.combatState.pendingBlock?.attackValue).toBe(5);
      expect(result.state.phase).toBe('awaitingBlock');
    });

    it('skips stunned monsters', () => {
      const stunnedMonster = {
        id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5,
        hp: 10, maxHp: 10, attack: 5, isStunned: true,
      };
      const state = makeState({
        activeCards: [stunnedMonster, null, null, null, null],
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: ['m1'],
          currentTurn: 'monster',
          monsterAttackQueue: ['m1'],
          pendingBlock: null,
        },
      });

      const result = reduce(state, { type: 'ADVANCE_MONSTER_TURN' });

      // Stunned monster is skipped, queue empty → hero turn
      expect(result.state.combatState.currentTurn).toBe('hero');
      expect(result.state.combatState.pendingBlock).toBeNull();
    });

    it('does nothing if not monster turn', () => {
      const state = makeState({
        combatState: {
          ...initialCombatState,
          currentTurn: 'hero',
        },
      });
      const result = reduce(state, { type: 'ADVANCE_MONSTER_TURN' });
      expect(result.state.combatState).toEqual(state.combatState);
    });
  });

  describe('FINISH_COMBAT', () => {
    it('resets combat state', () => {
      const state = makeState({
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: ['m1'],
          currentTurn: 'monster',
        },
      });

      const result = reduce(state, { type: 'FINISH_COMBAT' });
      expect(result.state.combatState.engagedMonsterIds).toEqual([]);
      expect(result.state.combatState.currentTurn).toBe('hero');
      expect(result.state.phase).toBe('playerInput');
      expect(result.sideEffects.length).toBeGreaterThan(0);
    });

    it('resets heroStunned to false when combat finishes', () => {
      const state = makeState({
        heroStunned: true,
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: ['m1'],
        },
      });
      const result = reduce(state, { type: 'FINISH_COMBAT' });
      expect(result.state.heroStunned).toBe(false);
    });
  });

  describe('HEAL', () => {
    it('heals hero up to max hp', () => {
      const state = makeState({ hp: 10 });
      const result = reduce(state, { type: 'HEAL', amount: 5, source: 'potion' });
      expect(result.state.hp).toBe(15);
      expect(result.state.totalHealed).toBeGreaterThan(state.totalHealed);
    });

    it('does not exceed max hp', () => {
      const state = makeState({ hp: 18 });
      const result = reduce(state, { type: 'HEAL', amount: 10, source: 'potion' });
      expect(result.state.hp).toBe(20); // INITIAL_HP is 20
    });
  });

  describe('APPLY_DAMAGE', () => {
    it('reduces hero hp', () => {
      const state = makeState({ hp: 15 });
      const result = reduce(state, { type: 'APPLY_DAMAGE', amount: 5, source: 'monster' });
      expect(result.state.hp).toBe(10);
      expect(result.state.totalDamageTaken).toBe(5);
    });

    it('sets gameOver when hp reaches 0', () => {
      const state = makeState({ hp: 3 });
      const result = reduce(state, { type: 'APPLY_DAMAGE', amount: 10, source: 'monster' });
      expect(result.state.hp).toBe(0);
      expect(result.state.gameOver).toBe(true);
    });

    it('absorbs damage with tempShield first', () => {
      const state = makeState({ hp: 20, tempShield: 5 });
      const result = reduce(state, { type: 'APPLY_DAMAGE', amount: 3, source: 'monster' });
      expect(result.state.hp).toBe(20);
      expect(result.state.tempShield).toBe(2);
    });
  });

  describe('DRAW_CARDS', () => {
    it('draws a card from backpack to hand', () => {
      const card = { id: 'c1', type: 'weapon' as const, name: 'Sword', value: 3 };
      const state = makeState({
        backpackItems: [card],
        handCards: [],
      });

      const result = reduce(state, { type: 'DRAW_CARDS', count: 1, source: 'backpack' });
      expect(result.state.handCards.length).toBe(1);
      expect(result.state.backpackItems.length).toBe(0);
    });

    it('does nothing if hand is full', () => {
      const cards = Array.from({ length: HAND_LIMIT }, (_, i) => ({
        id: `c${i}`, type: 'weapon' as const, name: `Sword ${i}`, value: 3,
      }));
      const backpackCard = { id: 'bp1', type: 'shield' as const, name: 'Shield', value: 2 };
      const state = makeState({
        handCards: cards,
        backpackItems: [backpackCard],
      });

      const result = reduce(state, { type: 'DRAW_CARDS', count: 1, source: 'backpack' });
      expect(result.state.handCards.length).toBe(HAND_LIMIT);
      expect(result.state.backpackItems.length).toBe(1);
    });
  });

  describe('DISCARD_CARD', () => {
    it('moves card from hand to graveyard', () => {
      const card = { id: 'c1', type: 'weapon' as const, name: 'Sword', value: 3 };
      const state = makeState({ handCards: [card] });

      const result = reduce(state, {
        type: 'DISCARD_CARD',
        cardId: 'c1',
        destination: 'graveyard',
      });

      expect(result.state.handCards.length).toBe(0);
      expect(result.state.discardedCards.length).toBe(1);
    });

    it('moves card from hand to recycle bag', () => {
      const card = { id: 'c1', type: 'magic' as const, name: 'Fireball', value: 5 };
      const state = makeState({ handCards: [card] });

      const result = reduce(state, {
        type: 'DISCARD_CARD',
        cardId: 'c1',
        destination: 'recycleBag',
      });

      expect(result.state.handCards.length).toBe(0);
      expect(result.state.permanentMagicRecycleBag.length).toBe(1);
    });
  });

  describe('SHOP actions', () => {
    it('OPEN_SHOP generates offerings from classDeck and sets modal state', () => {
      const cards = Array.from({ length: 20 }, (_, i) => ({
        id: `d${i}`, type: (['weapon', 'shield', 'magic', 'amulet', 'potion'] as const)[i % 5],
        name: `Card ${i}`, value: i + 1,
      }));
      const state = makeState({ classDeck: cards, shopLevel: 0 });

      const result = reduce(state, { type: 'OPEN_SHOP', sourceEvent: { id: 'ev1', name: 'Shop Event' } });
      expect(result.state.shopOfferings.length).toBeGreaterThan(0);
      expect(result.state.shopModalOpen).toBe(true);
      expect(result.state.shopModalMinimized).toBe(false);
      expect(result.state.shopSourceEvent).toEqual({ id: 'ev1', name: 'Shop Event' });
      expect(result.state.eventModalOpen).toBe(false);
      expect(result.state.shopEquipAttackUsed).toBe(false);
      expect(result.state.shopEquipArmorUsed).toBe(false);
    });

    it('CLOSE_SHOP clears offerings and modal state', () => {
      const state = makeState({
        shopOfferings: [{ card: { id: 'c1', type: 'weapon', name: 'Sword', value: 3 } as any, price: 10, sold: false }],
        shopModalOpen: true,
        shopModalMinimized: true,
        deleteModalOpen: true,
      });

      const result = reduce(state, { type: 'CLOSE_SHOP' });
      expect(result.state.shopOfferings).toEqual([]);
      expect(result.state.shopModalOpen).toBe(false);
      expect(result.state.shopModalMinimized).toBe(false);
      expect(result.state.deleteModalOpen).toBe(false);
      expect(result.state.shopSourceEvent).toBeNull();
    });

    it('SHOP_HEAL reduces gold and increases hp', () => {
      const state = makeState({ hp: 10, gold: 20, shopHealUsed: false });
      const result = reduce(state, { type: 'SHOP_HEAL' });
      expect(result.state.hp).toBe(15);
      expect(result.state.gold).toBe(15);
      expect(result.state.shopHealUsed).toBe(true);
    });

    it('SHOP_HEAL fails if already used', () => {
      const state = makeState({ hp: 10, gold: 20, shopHealUsed: true });
      const result = reduce(state, { type: 'SHOP_HEAL' });
      expect(result.state.hp).toBe(10);
      expect(result.state.gold).toBe(20);
    });

    it('PURCHASE by cardId deducts gold and adds to backpack', () => {
      const card = { id: 'c1', type: 'weapon' as const, name: 'Sword', value: 3 };
      const state = makeState({
        gold: 20,
        shopOfferings: [{ card, price: 10, sold: false }],
        classDeck: [card, { id: 'c2', type: 'shield' as const, name: 'Shield', value: 2 }],
        backpackItems: [],
      });
      const result = reduce(state, { type: 'PURCHASE', cardId: 'c1' });
      expect(result.state.gold).toBe(10);
      expect(result.state.backpackItems).toHaveLength(1);
      // The class pool is now an infinite template — the bought card is
      // a clone with a fresh id whose base id derives from 'c1'.
      expect(result.state.backpackItems[0].id.startsWith('c1')).toBe(true);
      // Class deck is NOT consumed by purchase — stays at 2.
      expect(result.state.classDeck).toHaveLength(2);
      expect(result.state.shopOfferings[0].sold).toBe(true);
    });

    it('PURCHASE fails when not enough gold', () => {
      const card = { id: 'c1', type: 'weapon' as const, name: 'Sword', value: 3 };
      const state = makeState({
        gold: 5,
        shopOfferings: [{ card, price: 10, sold: false }],
        classDeck: [card],
        backpackItems: [],
      });
      const result = reduce(state, { type: 'PURCHASE', cardId: 'c1' });
      expect(result.state.gold).toBe(5);
      expect(result.state.backpackItems).toHaveLength(0);
    });

    it('SHOP_EQUIP_BOOST attack increases slot bonuses', () => {
      const state = makeState({ gold: 20, shopEquipAttackUsed: false });
      const result = reduce(state, { type: 'SHOP_EQUIP_BOOST', boostType: 'attack' });
      expect(result.state.gold).toBe(5);
      expect(result.state.equipmentSlotBonuses.equipmentSlot1.damage).toBe(1);
      expect(result.state.equipmentSlotBonuses.equipmentSlot2.damage).toBe(1);
      expect(result.state.shopEquipAttackUsed).toBe(true);
    });

    it('SHOP_EQUIP_BOOST armor increases shield bonuses', () => {
      const state = makeState({ gold: 20, shopEquipArmorUsed: false });
      const result = reduce(state, { type: 'SHOP_EQUIP_BOOST', boostType: 'armor' });
      expect(result.state.gold).toBe(5);
      expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(1);
      expect(result.state.equipmentSlotBonuses.equipmentSlot2.shield).toBe(1);
      expect(result.state.shopEquipArmorUsed).toBe(true);
    });

    it('SHOP_EQUIP_BOOST fails if already used', () => {
      const state = makeState({ gold: 20, shopEquipAttackUsed: true });
      const result = reduce(state, { type: 'SHOP_EQUIP_BOOST', boostType: 'attack' });
      expect(result.state.gold).toBe(20);
    });

    it('SHOP_SKILL_DISCOVER shuffles, picks 3 options, and deducts gold', () => {
      const availableSkills = [
        { id: 's1', name: 'A', description: '', effect: '', type: 'active' as const, requiresTarget: 'none' as const },
        { id: 's2', name: 'B', description: '', effect: '', type: 'active' as const, requiresTarget: 'none' as const },
        { id: 's3', name: 'C', description: '', effect: '', type: 'active' as const, requiresTarget: 'none' as const },
        { id: 's4', name: 'D', description: '', effect: '', type: 'active' as const, requiresTarget: 'none' as const },
      ];
      const state = makeState({ gold: 20, shopSkillDiscoverUsed: false });
      const result = reduce(state, { type: 'SHOP_SKILL_DISCOVER', availableSkills: availableSkills as any });
      expect(result.state.gold).toBe(10);
      expect(result.state.shopSkillDiscoverUsed).toBe(true);
      expect(result.state.shopSkillSelectOpen).toBe(true);
      expect(result.state.shopSkillOptions).toHaveLength(3);
      expect(result.state.rng).not.toEqual(state.rng);
    });

    it('SHOP_SELECT_SKILL adds skill and closes modal', () => {
      const state = makeState({ extraHeroSkills: [], shopSkillSelectOpen: true });
      const result = reduce(state, { type: 'SHOP_SELECT_SKILL', skillId: 'armor-pact' });
      expect(result.state.extraHeroSkills).toContain('armor-pact');
      expect(result.state.shopSkillSelectOpen).toBe(false);
      expect(result.state.shopSkillOptions).toEqual([]);
    });

    it('UPGRADE_CARD upgrades a card in hand', () => {
      const card = { id: 'u1', type: 'weapon' as const, name: 'Blade', value: 3, upgradeLevel: 0, maxUpgradeLevel: 2 };
      const state = makeState({ handCards: [card] });
      const result = reduce(state, { type: 'UPGRADE_CARD', cardId: 'u1' });
      expect(result.state.handCards[0].upgradeLevel).toBe(1);
      expect(result.state.heroSkillBanner).toContain('升级成功');
    });

    it('UPGRADE_CARD skips if already at max level', () => {
      const card = { id: 'u1', type: 'weapon' as const, name: 'Blade', value: 3, upgradeLevel: 2, maxUpgradeLevel: 2 };
      const state = makeState({ handCards: [card] });
      const result = reduce(state, { type: 'UPGRADE_CARD', cardId: 'u1' });
      expect(result.state.handCards[0].upgradeLevel).toBe(2);
    });

    it('APPLY_MONSTER_REWARD gold adds gold', () => {
      const state = makeState({ gold: 10 });
      const result = reduce(state, { type: 'APPLY_MONSTER_REWARD', rewardType: 'gold', amount: 5 });
      expect(result.state.gold).toBe(15);
    });

    it('APPLY_MONSTER_REWARD maxHp increases bonus', () => {
      const state = makeState({ permanentMaxHpBonus: 0 });
      const result = reduce(state, { type: 'APPLY_MONSTER_REWARD', rewardType: 'maxHp', amount: 3 });
      expect(result.state.permanentMaxHpBonus).toBe(3);
    });

    it('APPLY_MONSTER_REWARD spellDamage increases bonus', () => {
      const state = makeState({ permanentSpellDamageBonus: 0 });
      const result = reduce(state, { type: 'APPLY_MONSTER_REWARD', rewardType: 'spellDamage', amount: 2 });
      expect(result.state.permanentSpellDamageBonus).toBe(2);
    });

    it('APPLY_MONSTER_REWARD stunCap clamps to 100', () => {
      const state = makeState({ stunCap: 95 });
      const result = reduce(state, { type: 'APPLY_MONSTER_REWARD', rewardType: 'stunCap', amount: 10 });
      expect(result.state.stunCap).toBe(100);
    });

    it('APPLY_MONSTER_REWARD upgradeCard opens modal', () => {
      const state = makeState({ upgradeModalOpen: false });
      const result = reduce(state, { type: 'APPLY_MONSTER_REWARD', rewardType: 'upgradeCard' });
      expect(result.state.upgradeModalOpen).toBe(true);
    });

    it('APPLY_MONSTER_REWARD unknown type returns no change', () => {
      const state = makeState();
      const result = reduce(state, { type: 'APPLY_MONSTER_REWARD', rewardType: 'unknown' });
      expect(result.state).toBe(state);
    });
  });

  describe('APPLY_EVENT_EFFECT', () => {
    it('handles gold+ token', () => {
      const state = makeState({ gold: 10 });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'gold+5' });
      expect(result.state.gold).toBe(15);
      expect(result.sideEffects.some(e => e.event === 'log:entry')).toBe(true);
    });

    it('handles gold- token (clamped to 0)', () => {
      const state = makeState({ gold: 3 });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'gold-10' });
      expect(result.state.gold).toBe(0);
    });

    it('handles hp- token and triggers game over', () => {
      const state = makeState({ hp: 3 });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'hp-5' });
      expect(result.state.hp).toBe(0);
      expect(result.state.gameOver).toBe(true);
    });

    it('handles fullheal token', () => {
      const state = makeState({ hp: 5, permanentMaxHpBonus: 5 });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'fullheal' });
      expect(result.state.hp).toBe(25);
    });

    it('handles maxhpperm+ token', () => {
      const state = makeState({ hp: 15, permanentMaxHpBonus: 0 });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'maxhpperm+3' });
      expect(result.state.permanentMaxHpBonus).toBe(3);
      expect(result.state.hp).toBe(18);
    });

    it('handles shopLevel+ at max', () => {
      const state = makeState({ shopLevel: 3 });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'shopLevel+1' });
      expect(result.state.shopLevel).toBe(3);
      expect(result.state.heroSkillBanner).toContain('已满');
    });

    it('handles persuadeLevel+ token', () => {
      const state = makeState({ persuadeLevel: 1 });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'persuadeLevel+1' });
      expect(result.state.persuadeLevel).toBe(2);
    });

    it('handles turnCount-2 token', () => {
      const state = makeState({ turnCount: 5 });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'turnCount-2' });
      expect(result.state.turnCount).toBe(3);
    });

    it('handles flipToDoubleNextMagic token', () => {
      const state = makeState({ doubleNextMagic: false });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'flipToDoubleNextMagic' });
      expect(result.state.doubleNextMagic).toBe(true);
    });

    it('handles halveSlotDamageBonus token', () => {
      const state = makeState({
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 6, shield: 0 },
          equipmentSlot2: { damage: 4, shield: 0 },
        },
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'halveSlotDamageBonus' });
      expect(result.state.equipmentSlotBonuses.equipmentSlot1.damage).toBe(3);
      expect(result.state.equipmentSlotBonuses.equipmentSlot2.damage).toBe(2);
    });

    it('handles amuletCapacity+1 token', () => {
      const state = makeState({ maxAmuletSlots: 2 });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'amuletCapacity+1' });
      expect(result.state.maxAmuletSlots).toBe(3);
    });

    it('handles tempShield+ token', () => {
      const state = makeState({ tempShield: 0 });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'tempShield+5' });
      expect(result.state.tempShield).toBe(5);
    });

    it('emits asyncEffectNeeded for unhandled tokens', () => {
      const state = makeState();
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'someUnhandledToken' });
      const asyncEffect = result.sideEffects.find(e => e.event === ('event:asyncEffectNeeded' as any));
      expect(asyncEffect).toBeTruthy();
    });

    it('handles persuadeSameTargetCostHalve with eternalRelics', () => {
      const state = makeState({ persuadeSameTargetCostHalve: false, eternalRelics: [] });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'persuadeSameTargetCostHalve' });
      expect(result.state.persuadeSameTargetCostHalve).toBe(true);
      expect(result.state.eternalRelics.length).toBeGreaterThan(0);
    });

    it('handles persuadeNextCostReduction token', () => {
      const state = makeState({ persuadeDiscount: null });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'persuadeNextCostReduction:5' });
      expect(result.state.persuadeDiscount).toEqual({ costReduction: 5, rateBonus: 0 });
    });
  });

  describe('GAIN_CLASS_DECK_BOTTOM_CARDS', () => {
    it('takes cards from class deck bottom to backpack', () => {
      const cards = [
        { id: 'c1', type: 'magic' as const, name: 'Spell A', value: 0, image: '' },
        { id: 'c2', type: 'magic' as const, name: 'Spell B', value: 0, image: '' },
        { id: 'c3', type: 'magic' as const, name: 'Spell C', value: 0, image: '' },
      ];
      const state = makeState({ classDeck: cards as any, backpackItems: [], backpackCapacityModifier: 0 });
      const result = reduce(state, { type: 'GAIN_CLASS_DECK_BOTTOM_CARDS', count: 2 });
      // Class pool is an infinite template — bottom cards are cloned into the
      // backpack and the template is preserved.
      expect(result.state.classDeck.length).toBe(3);
      expect(result.state.backpackItems.length).toBe(2);
      expect(result.sideEffects.some(e => e.event === 'log:entry')).toBe(true);
    });

    it('does nothing when class deck is empty', () => {
      const state = makeState({ classDeck: [], backpackItems: [] });
      const result = reduce(state, { type: 'GAIN_CLASS_DECK_BOTTOM_CARDS', count: 2 });
      expect(result.state.classDeck.length).toBe(0);
      expect(result.state.backpackItems.length).toBe(0);
    });
  });

  describe('COMPLETE_EVENT', () => {
    it('clears modal state when currentEventCard is set', () => {
      const eventCard = { id: 'ev1', type: 'event' as const, name: 'Merchant', value: 0, image: '' };
      const state = makeState({
        currentEventCard: eventCard as any,
        eventModalOpen: true,
        eventModalMinimized: true,
      });
      const result = reduce(state, { type: 'COMPLETE_EVENT' });
      expect(result.state.currentEventCard).toBeNull();
      expect(result.state.eventModalOpen).toBe(false);
      expect(result.state.eventModalMinimized).toBe(false);
      expect(result.sideEffects.some(e => e.event === 'event:completed')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // RESET_HERO_WAVE
  // -------------------------------------------------------------------------

  describe('RESET_HERO_WAVE', () => {
    it('resets hero skill and magic state for a new wave', () => {
      const state = makeState({
        heroSkillUsedThisWave: true,
        extraSkillsUsedThisWave: ['skill1' as any],
        pendingHeroSkillAction: { skillId: 'x' } as any,
        pendingHeroMagicAction: { magicId: 'y' } as any,
        heroSkillBanner: 'Active!',
        pendingMagicAction: { card: {} } as any,
        pendingPotionAction: { card: {} } as any,
        berserkerRageActive: true,
        berserkerSlotUsed: { slot1: true } as any,
        flashSlotUsed: { slot1: true } as any,
        gambitExtraActive: true,
        gambitSlotUsed: { slot1: true } as any,
        unbreakableUntilWaterfall: { equipmentSlot1: true, equipmentSlot2: true },
      });
      const result = reduce(state, { type: 'RESET_HERO_WAVE' });
      expect(result.state.heroSkillUsedThisWave).toBe(false);
      expect(result.state.extraSkillsUsedThisWave).toEqual([]);
      expect(result.state.pendingHeroSkillAction).toBeNull();
      expect(result.state.pendingHeroMagicAction).toBeNull();
      expect(result.state.heroSkillBanner).toBeNull();
      expect(result.state.pendingMagicAction).toBeNull();
      expect(result.state.pendingPotionAction).toBeNull();
      expect(result.state.berserkerRageActive).toBe(false);
      expect(result.state.berserkerSlotUsed).toEqual({});
      expect(result.state.flashSlotUsed).toEqual({});
      expect(result.state.gambitExtraActive).toBe(false);
      expect(result.state.gambitSlotUsed).toEqual({});
      expect(result.state.unbreakableUntilWaterfall).toEqual({ equipmentSlot1: false, equipmentSlot2: false });
    });

    it('clears slotBattleSpiritBonus and slotBattleSpiritUsed on wave reset', () => {
      const state = makeState({
        slotBattleSpiritBonus: { equipmentSlot1: 2 } as any,
        slotBattleSpiritUsed: { equipmentSlot1: 1 } as any,
      });
      const result = reduce(state, { type: 'RESET_HERO_WAVE' });
      expect(result.state.slotBattleSpiritBonus).toEqual({});
      expect(result.state.slotBattleSpiritUsed).toEqual({});
    });

    it('RESOLVE_MAGIC_SLOT_SELECTION battle-spirit grants per-slot bonus (level 0 = +1, level 1 = +2)', () => {
      const weapon = { id: 'sword', type: 'weapon', name: 'Sword', value: 5, attack: 3, durability: 3 } as any;
      const card = { id: 'bs1', type: 'magic', name: '战意激发', value: 0, knightEffect: 'battle-spirit', upgradeLevel: 0 } as any;
      const state = makeState({
        equipmentSlot1: weapon,
        pendingMagicAction: {
          card,
          effect: 'battle-spirit',
          step: 'slot-select',
          prompt: 'pick',
        } as any,
      });
      const result = reduce(state, {
        type: 'RESOLVE_MAGIC_SLOT_SELECTION',
        magicId: 'battle-spirit',
        slotId: 'equipmentSlot1',
      });
      expect((result.state.slotBattleSpiritBonus as any).equipmentSlot1).toBe(1);
      expect(result.state.pendingMagicAction).toBeNull();

      const upgradedCard = { ...card, upgradeLevel: 1 };
      const state2 = makeState({
        equipmentSlot2: weapon,
        pendingMagicAction: {
          card: upgradedCard,
          effect: 'battle-spirit',
          step: 'slot-select',
          prompt: 'pick',
        } as any,
      });
      const result2 = reduce(state2, {
        type: 'RESOLVE_MAGIC_SLOT_SELECTION',
        magicId: 'battle-spirit',
        slotId: 'equipmentSlot2',
      });
      expect((result2.state.slotBattleSpiritBonus as any).equipmentSlot2).toBe(2);
    });

    it('START_TURN clears slotBattleSpiritUsed but preserves slotBattleSpiritBonus', () => {
      const state = makeState({
        slotBattleSpiritBonus: { equipmentSlot1: 1, equipmentSlot2: 2 } as any,
        slotBattleSpiritUsed: { equipmentSlot1: 1 } as any,
      });
      const result = reduce(state, { type: 'START_TURN' });
      expect(result.state.slotBattleSpiritUsed).toEqual({});
      expect(result.state.slotBattleSpiritBonus).toEqual({ equipmentSlot1: 1, equipmentSlot2: 2 });
    });

    it('resets heroMagicState usedThisWave flags', () => {
      const state = makeState();
      (state as any).heroMagicState = {
        fire: { id: 'fire', unlocked: true, gauge: 5, usedThisWave: true },
        ice: { id: 'ice', unlocked: true, gauge: 3, usedThisWave: true },
      };
      const result = reduce(state, { type: 'RESET_HERO_WAVE' });
      expect(result.state.heroMagicState.fire?.usedThisWave).toBe(false);
      expect(result.state.heroMagicState.ice?.usedThisWave).toBe(false);
    });

    it('emits a log side effect', () => {
      const state = makeState();
      const result = reduce(state, { type: 'RESET_HERO_WAVE' });
      expect(result.sideEffects.some(e => e.event === 'log:entry')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // PERSUADE_MONSTER (expanded)
  // -------------------------------------------------------------------------

  describe('PERSUADE_MONSTER', () => {
    const monster = { id: 'm1', type: 'monster' as const, name: 'Goblin', value: 0, image: '' };

    it('deducts gold and sets tracking state', () => {
      const state = makeState({
        gold: 100,
        activeCards: [monster as any],
        persuadeCostModifier: 0,
        persuadeDiscount: null,
        lastPersuadeTargetId: null,
        consecutivePersuadeCount: 0,
      });
      const result = reduce(state, { type: 'PERSUADE_MONSTER', monsterId: 'm1' });
      expect(result.state.gold).toBeLessThan(100);
      expect(result.state.lastPersuadeTargetId).toBe('m1');
      expect(result.state.consecutivePersuadeCount).toBe(1);
      expect(result.state.persuadeDiscount).toBeNull();
    });

    it('increments consecutive count for same target', () => {
      const state = makeState({
        gold: 200,
        activeCards: [monster as any],
        lastPersuadeTargetId: 'm1',
        consecutivePersuadeCount: 2,
      });
      const result = reduce(state, { type: 'PERSUADE_MONSTER', monsterId: 'm1' });
      expect(result.state.consecutivePersuadeCount).toBe(3);
    });

    it('resets consecutive count for different target', () => {
      const monster2 = { ...monster, id: 'm2', name: 'Orc' };
      const state = makeState({
        gold: 200,
        activeCards: [monster2 as any],
        lastPersuadeTargetId: 'm1',
        consecutivePersuadeCount: 3,
      });
      const result = reduce(state, { type: 'PERSUADE_MONSTER', monsterId: 'm2' });
      expect(result.state.consecutivePersuadeCount).toBe(1);
      expect(result.state.lastPersuadeTargetId).toBe('m2');
    });

    it('applies same-target cost halving', () => {
      const state = makeState({
        gold: 200,
        activeCards: [monster as any],
        persuadeSameTargetCostHalve: true,
        lastPersuadeTargetId: 'm1',
        consecutivePersuadeCount: 1,
      });
      const fullCostState = makeState({
        gold: 200,
        activeCards: [monster as any],
        persuadeSameTargetCostHalve: false,
        lastPersuadeTargetId: 'm1',
        consecutivePersuadeCount: 1,
      });
      const halfResult = reduce(state, { type: 'PERSUADE_MONSTER', monsterId: 'm1' });
      const fullResult = reduce(fullCostState, { type: 'PERSUADE_MONSTER', monsterId: 'm1' });
      const halfCost = 200 - halfResult.state.gold;
      const fullCost = 200 - fullResult.state.gold;
      expect(halfCost).toBe(Math.floor(fullCost / 2));
    });

    it('does not deduct gold if insufficient', () => {
      const state = makeState({
        gold: 0,
        activeCards: [monster as any],
      });
      const result = reduce(state, { type: 'PERSUADE_MONSTER', monsterId: 'm1' });
      expect(result.state.gold).toBe(0);
      expect(result.sideEffects.some(e => e.event === 'log:entry')).toBe(true);
    });

    it('transitions persuadeState to rolling phase', () => {
      const persuadeStateObj = {
        monster: monster as any,
        targetSlot: 'backpack' as const,
        phase: 'confirm' as const,
        threshold: 10,
        successRate: 50,
        diceValue: null,
        success: null,
      };
      const state = makeState({
        gold: 100,
        activeCards: [monster as any],
        persuadeState: persuadeStateObj as any,
      });
      const result = reduce(state, { type: 'PERSUADE_MONSTER', monsterId: 'm1' });
      expect((result.state.persuadeState as any)?.phase).toBe('rolling');
    });

    // ---------------------------------------------------------------------
    // persuadeAmuletBonus reset — it's the "下次劝降率 +%" temporary buff
    // accumulated by 翻印之符 / 怀柔之印 / 劝降之刃 / 劝降祝福 etc. After
    // ANY persuade attempt is launched (gold check passes), this buff
    // MUST clear — otherwise it accumulates forever across persuades.
    // ---------------------------------------------------------------------
    it('clears persuadeAmuletBonus to 0 after a successful attempt launch', () => {
      const state = makeState({
        gold: 100,
        activeCards: [monster as any],
        persuadeAmuletBonus: 35,
      });
      const result = reduce(state, { type: 'PERSUADE_MONSTER', monsterId: 'm1' });
      expect(result.state.persuadeAmuletBonus).toBe(0);
    });

    it('preserves persuadeAmuletBonus when gold is insufficient (attempt aborted)', () => {
      const state = makeState({
        gold: 0,
        activeCards: [monster as any],
        persuadeAmuletBonus: 25,
      });
      const result = reduce(state, { type: 'PERSUADE_MONSTER', monsterId: 'm1' });
      expect(result.state.persuadeAmuletBonus).toBe(25);
    });

    it('does NOT touch permanentPersuadeBonus', () => {
      const state = makeState({
        gold: 100,
        activeCards: [monster as any],
        persuadeAmuletBonus: 10,
        permanentPersuadeBonus: 8,
      });
      const result = reduce(state, { type: 'PERSUADE_MONSTER', monsterId: 'm1' });
      expect(result.state.persuadeAmuletBonus).toBe(0);
      expect(result.state.permanentPersuadeBonus).toBe(8);
    });

    it('clears persuadeAmuletBonus alongside persuadeDiscount in the same attempt', () => {
      const state = makeState({
        gold: 100,
        activeCards: [monster as any],
        persuadeAmuletBonus: 12,
        persuadeDiscount: { costReduction: 5, rateBonus: 20 },
      });
      const result = reduce(state, { type: 'PERSUADE_MONSTER', monsterId: 'm1' });
      expect(result.state.persuadeAmuletBonus).toBe(0);
      expect(result.state.persuadeDiscount).toBeNull();
    });

    it('emits a system log entry only when amulet bonus was non-zero', () => {
      const stateWithBonus = makeState({
        gold: 100,
        activeCards: [monster as any],
        persuadeAmuletBonus: 25,
      });
      const resultWithBonus = reduce(stateWithBonus, { type: 'PERSUADE_MONSTER', monsterId: 'm1' });
      const hasConsumeLog = resultWithBonus.sideEffects.some(
        e => e.event === 'log:entry' && /\+25%.*消耗/.test((e as any)?.payload?.message ?? ''),
      );
      expect(hasConsumeLog).toBe(true);

      const stateNoBonus = makeState({
        gold: 100,
        activeCards: [monster as any],
        persuadeAmuletBonus: 0,
      });
      const resultNoBonus = reduce(stateNoBonus, { type: 'PERSUADE_MONSTER', monsterId: 'm1' });
      const hasNoBonusLog = resultNoBonus.sideEffects.some(
        e => e.event === 'log:entry' && /消耗/.test((e as any)?.payload?.message ?? ''),
      );
      expect(hasNoBonusLog).toBe(false);
    });
  });

  describe('DEQUEUE_MONSTER_REWARD', () => {
    const reward1 = { monsterInstanceId: 'm1', name: 'Goblin', options: [] } as any;
    const reward2 = { monsterInstanceId: 'm2', name: 'Orc', options: [] } as any;

    it('pops next reward from queue when no active reward', () => {
      const state = makeState({
        activeMonsterReward: null,
        monsterRewardQueue: [reward1, reward2],
        ghostBladeExileCards: null,
      });
      const result = reduce(state, { type: 'DEQUEUE_MONSTER_REWARD' });
      expect(result.state.activeMonsterReward).toBe(reward1);
      expect(result.state.monsterRewardQueue).toEqual([reward2]);
    });

    it('does nothing when activeMonsterReward is already set', () => {
      const state = makeState({
        activeMonsterReward: reward1,
        monsterRewardQueue: [reward2],
        ghostBladeExileCards: null,
      });
      const result = reduce(state, { type: 'DEQUEUE_MONSTER_REWARD' });
      expect(result.state).toBe(state);
    });

    it('does nothing when queue is empty', () => {
      const state = makeState({
        activeMonsterReward: null,
        monsterRewardQueue: [],
        ghostBladeExileCards: null,
      });
      const result = reduce(state, { type: 'DEQUEUE_MONSTER_REWARD' });
      expect(result.state).toBe(state);
    });

    it('does nothing when ghostBladeExileCards is active', () => {
      const state = makeState({
        activeMonsterReward: null,
        monsterRewardQueue: [reward1],
        ghostBladeExileCards: [{ id: 'ghost1' }] as any,
      });
      const result = reduce(state, { type: 'DEQUEUE_MONSTER_REWARD' });
      expect(result.state).toBe(state);
    });
  });

  describe('DEAL_DAMAGE_TO_MONSTER (expanded)', () => {
    const makeMonster = (overrides?: Partial<any>) => ({
      id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5,
      hp: 10, maxHp: 10, attack: 5, currentLayer: 2, fury: 2, hpLayers: 2,
      ...overrides,
    });

    it('applies damage and emits monsterDamaged + monsterBleed', () => {
      const monster = makeMonster();
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots });
      const result = reduce(state, {
        type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: 'm1', damage: 3, source: 'spell',
      });
      expect((result.state.activeCards[0] as any).hp).toBe(7);
      expect(result.sideEffects.some(e => e.event === 'combat:monsterDamaged')).toBe(true);
      expect(result.sideEffects.some(e => e.event === 'combat:monsterBleed')).toBe(true);
    });

    it('blocks spell damage when building magic immunity applies', () => {
      const monster = makeMonster();
      const building = { id: 'b1', type: 'building' as const, name: 'Curse', value: 1, buildingAura: 'stacked-magic-immune' };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({
        activeCards: slots,
        activeCardStacks: { 0: [building as any] },
      });
      const result = reduce(state, {
        type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: 'm1', damage: 5, source: 'spell', isSpellDamage: true,
      });
      expect((result.state.activeCards[0] as any).hp).toBe(10);
      expect(result.sideEffects.some(e =>
        e.event === 'log:entry' && (e.payload as any).message.includes('免疫魔法伤害'),
      )).toBe(true);
    });

    it('applies spell damage reduction', () => {
      const monster = makeMonster({ spellDamageReduction: 0.5 });
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots });
      const result = reduce(state, {
        type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: 'm1', damage: 8, source: 'spell', isSpellDamage: true,
      });
      expect((result.state.activeCards[0] as any).hp).toBe(6);
    });

    it('blocks damage with swarm buglet shield when buglet exists', () => {
      const monster = makeMonster({ swarmBugletShield: true });
      const buglet = { id: 'bug1', type: 'monster' as const, name: 'Buglet', value: 1, isBuglet: true };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      slots[1] = buglet;
      const state = makeState({ activeCards: slots });
      const result = reduce(state, {
        type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: 'm1', damage: 5, source: 'spell',
      });
      expect((result.state.activeCards[0] as any).hp).toBe(10);
    });

    it('enqueues APPLY_DAMAGE for boss retaliation', () => {
      const monster = makeMonster({ bossRetaliationDamage: 3 });
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots });
      const result = reduce(state, {
        type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: 'm1', damage: 2, source: 'spell',
      });
      expect(result.enqueuedActions.some(a =>
        a.type === 'APPLY_DAMAGE' && (a as any).amount === 3,
      )).toBe(true);
    });

    it('enqueues APPLY_DAMAGE for golem layer reflect instead of setTimeout', () => {
      const monster = makeMonster({ golemLayerLossReflect: 2, hp: 10, maxHp: 10, currentLayer: 2 });
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots });
      const result = reduce(state, {
        type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: 'm1', damage: 15, source: 'spell',
      });
      const reflectAction = result.enqueuedActions.find(a =>
        a.type === 'APPLY_DAMAGE' && (a as any).source === 'combat',
      );
      expect(reflectAction).toBeDefined();
      expect(result.sideEffects.some(e => e.event === 'combat:golemReflect')).toBe(true);
    });

    it('enqueues HEAL for overkill lifesteal', () => {
      const monster = makeMonster({ hp: 3, maxHp: 10, currentLayer: 1 });
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({
        activeCards: slots,
        permanentSpellLifesteal: 5,
      });
      const result = reduce(state, {
        type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: 'm1', damage: 10, source: 'spell',
      });
      expect(result.enqueuedActions.some(a =>
        a.type === 'HEAL' && (a as any).amount === 5,
      )).toBe(true);
    });

    it('emits monsterDefeated when monster dies', () => {
      const monster = makeMonster({ hp: 3, maxHp: 10, currentLayer: 1 });
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots });
      const result = reduce(state, {
        type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: 'm1', damage: 10, source: 'spell',
      });
      expect(result.sideEffects.some(e => e.event === 'combat:monsterDefeated')).toBe(true);
    });

    it('increments classDamageDiscoverStreak when discover amulet is present', () => {
      const monster = makeMonster();
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const discoverAmulet = { id: 'a1', type: 'amulet' as const, name: 'Discover', value: 0, amuletEffect: 'damage-class-discover' };
      const state = makeState({
        activeCards: slots,
        classDamageDiscoverStreak: 5,
        amuletSlots: [discoverAmulet as any],
      });
      const result = reduce(state, {
        type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: 'm1', damage: 2, source: 'spell',
      });
      expect(result.state.classDamageDiscoverStreak).toBe(6);
    });

    it('resets classDamageDiscoverStreak and emits trigger when threshold reached', () => {
      const monster = makeMonster();
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const discoverAmulet = { id: 'a1', type: 'amulet' as const, name: 'Discover', value: 0, amuletEffect: 'damage-class-discover' };
      const state = makeState({
        activeCards: slots,
        classDamageDiscoverStreak: 7,
        amuletSlots: [discoverAmulet as any],
      });
      const result = reduce(state, {
        type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: 'm1', damage: 2, source: 'spell',
      });
      expect(result.state.classDamageDiscoverStreak).toBe(0);
      expect(result.sideEffects.some(e => e.event === 'combat:classDamageDiscoverTriggered')).toBe(true);
    });
  });

  describe('magic-class-discover (咒纹刻印) — both PLAY_CARD and direct RESOLVE_MAGIC paths', () => {
    const magicCard = {
      id: 'mg1',
      type: 'magic' as const,
      name: 'Test Magic',
      value: 0,
      magicType: 'instant' as const,
      magicEffect: 'noop-test',
    };
    const permanentMagicCard = {
      id: 'pmg1',
      type: 'magic' as const,
      name: 'Test Permanent Magic',
      value: 0,
      magicType: 'permanent' as const,
      magicEffect: 'noop-test',
    };
    const heroMagicCard = {
      id: 'hm1',
      type: 'hero-magic' as const,
      name: 'Hero Magic',
      value: 0,
      heroMagicId: 'holy-light' as const,
    };
    const curseCard = {
      id: 'cu1',
      type: 'curse' as const,
      name: 'Test Curse',
      value: 0,
    };
    const discoverAmulet = {
      id: 'cmd-amulet',
      type: 'amulet' as const,
      name: '咒纹刻印',
      value: 1,
      amuletEffect: 'magic-class-discover' as const,
    };

    // ---- PLAY_CARD path (HandContainer onPlayCard / 点击播放) -------------

    it('PLAY_CARD: does nothing when amulet is not equipped', () => {
      const state = makeState({
        handCards: [magicCard as any],
        classMagicDiscoverStreak: 5,
      });
      const result = reduce(state, { type: 'PLAY_CARD', cardId: 'mg1' });
      expect(result.state.classMagicDiscoverStreak).toBe(5);
    });

    it('PLAY_CARD: increments classMagicDiscoverStreak when amulet is equipped and a magic card is played', () => {
      const state = makeState({
        handCards: [magicCard as any],
        amuletSlots: [discoverAmulet as any],
        classMagicDiscoverStreak: 3,
      });
      // Drain the full pipeline so the enqueued RESOLVE_MAGIC actually runs
      // (PLAY_CARD only enqueues; the streak now lives on RESOLVE_MAGIC).
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: 'mg1' } as GameAction]);
      expect(result.state.classMagicDiscoverStreak).toBe(4);
      expect(result.sideEffects.some(e => e.event === 'combat:classMagicDiscoverTriggered')).toBe(false);
    });

    it('PLAY_CARD: resets to 0 and emits classMagicDiscoverTriggered when threshold (6) is reached', () => {
      const state = makeState({
        handCards: [magicCard as any],
        amuletSlots: [discoverAmulet as any],
        classMagicDiscoverStreak: 5,
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: 'mg1' } as GameAction]);
      expect(result.state.classMagicDiscoverStreak).toBe(0);
      const triggered = result.sideEffects.find(e => e.event === 'combat:classMagicDiscoverTriggered');
      expect(triggered).toBeDefined();
      expect((triggered?.payload as any)?.threshold).toBe(6);
    });

    it('PLAY_CARD: does not increment when a Permanent magic card is played', () => {
      const state = makeState({
        handCards: [permanentMagicCard as any],
        amuletSlots: [discoverAmulet as any],
        classMagicDiscoverStreak: 3,
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: 'pmg1' } as GameAction]);
      expect(result.state.classMagicDiscoverStreak).toBe(3);
    });

    it('PLAY_CARD: does not increment when a hero-magic card is played', () => {
      const state = makeState({
        handCards: [heroMagicCard as any],
        amuletSlots: [discoverAmulet as any],
        classMagicDiscoverStreak: 3,
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: 'hm1' } as GameAction]);
      expect(result.state.classMagicDiscoverStreak).toBe(3);
    });

    // ---- Direct RESOLVE_MAGIC path (GameBoard.handleCardToHero 拖拽出牌) -

    it('RESOLVE_MAGIC (drag-to-hero path): increments streak just like PLAY_CARD', () => {
      // 这是真实 bug 触发路径：玩家把魔法牌拖到 hero 时，GameBoard.handleCardToHero
      // 会直接 dispatch RESOLVE_MAGIC 绕过 PLAY_CARD。Streak 必须在这条路径上也增加。
      const state = makeState({
        amuletSlots: [discoverAmulet as any],
        classMagicDiscoverStreak: 3,
      });
      const result = reduce(state, { type: 'RESOLVE_MAGIC', cardId: 'mg1', card: magicCard } as any);
      expect(result.state.classMagicDiscoverStreak).toBe(4);
    });

    it('RESOLVE_MAGIC (drag-to-hero path): resets to 0 and emits trigger at threshold', () => {
      const state = makeState({
        amuletSlots: [discoverAmulet as any],
        classMagicDiscoverStreak: 5,
      });
      const result = reduce(state, { type: 'RESOLVE_MAGIC', cardId: 'mg1', card: magicCard } as any);
      expect(result.state.classMagicDiscoverStreak).toBe(0);
      expect(result.sideEffects.some(e => e.event === 'combat:classMagicDiscoverTriggered')).toBe(true);
    });

    it('RESOLVE_MAGIC (drag-to-hero path): does not increment for hero-magic', () => {
      const state = makeState({
        amuletSlots: [discoverAmulet as any],
        classMagicDiscoverStreak: 3,
      });
      const result = reduce(state, { type: 'RESOLVE_MAGIC', cardId: 'hm1', card: heroMagicCard } as any);
      expect(result.state.classMagicDiscoverStreak).toBe(3);
    });

    it('RESOLVE_MAGIC (drag-to-hero path): does not increment for curse', () => {
      const state = makeState({
        amuletSlots: [discoverAmulet as any],
        classMagicDiscoverStreak: 3,
      });
      const result = reduce(state, { type: 'RESOLVE_MAGIC', cardId: 'cu1', card: curseCard } as any);
      expect(result.state.classMagicDiscoverStreak).toBe(3);
    });

    it('RESOLVE_MAGIC (drag-to-hero path): does not increment for Permanent magic', () => {
      const state = makeState({
        amuletSlots: [discoverAmulet as any],
        classMagicDiscoverStreak: 3,
      });
      const result = reduce(state, { type: 'RESOLVE_MAGIC', cardId: 'pmg1', card: permanentMagicCard } as any);
      expect(result.state.classMagicDiscoverStreak).toBe(3);
    });

    // ---- Cross-conversion edge cases (永恒铭刻 / 凡化咒) -------------------
    // 判定走 cardHasPermFlag — 不看字面 magicType，看「现在打出去会不会进坟场」。

    it('Instant magic that has been Perm-granted (recycleDelay > 0) does NOT count', () => {
      // 永恒铭刻 / 附魔祭坛 / 永恒铭刻药 → 给 Instant 加上 recycleDelay > 0,
      // 卡此时进回收袋而非坟场，不应触发咒纹刻印。
      const permGrantedInstant = {
        ...magicCard,
        id: 'inst-perm',
        recycleDelay: 2,
      };
      const state = makeState({
        amuletSlots: [discoverAmulet as any],
        classMagicDiscoverStreak: 3,
      });
      const result = reduce(
        state,
        { type: 'RESOLVE_MAGIC', cardId: 'inst-perm', card: permGrantedInstant } as any,
      );
      expect(result.state.classMagicDiscoverStreak).toBe(3);
    });

    it('Permanent magic that has been stripped by 凡化咒 (permStripped) DOES count', () => {
      // 凡化咒一票否决 magicType === 'permanent' — 卡此时进坟场,应当触发咒纹刻印。
      const strippedPermanent = {
        ...permanentMagicCard,
        id: 'perm-stripped',
        permStripped: true,
      };
      const state = makeState({
        amuletSlots: [discoverAmulet as any],
        classMagicDiscoverStreak: 3,
      });
      const result = reduce(
        state,
        { type: 'RESOLVE_MAGIC', cardId: 'perm-stripped', card: strippedPermanent } as any,
      );
      expect(result.state.classMagicDiscoverStreak).toBe(4);
    });

    it('does not double-count when PLAY_CARD enqueues RESOLVE_MAGIC (single drain = +1, not +2)', () => {
      // PLAY_CARD 自己 enqueue 一个 RESOLVE_MAGIC，drain 整条管线只能加 1，
      // 不能因为我们把逻辑搬到 RESOLVE_MAGIC 而出现重复计数。
      const state = makeState({
        handCards: [magicCard as any],
        amuletSlots: [discoverAmulet as any],
        classMagicDiscoverStreak: 0,
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: 'mg1' } as GameAction]);
      expect(result.state.classMagicDiscoverStreak).toBe(1);
    });

    it('two equipped 咒纹刻印 increment streak by 2 per cast (stacking)', () => {
      const a1 = { ...discoverAmulet, id: 'cmd-amulet-1' };
      const a2 = { ...discoverAmulet, id: 'cmd-amulet-2' };
      const state = makeState({
        amuletSlots: [a1, a2] as any,
        classMagicDiscoverStreak: 1,
      });
      const result = reduce(state, { type: 'RESOLVE_MAGIC', cardId: 'mg1', card: magicCard } as any);
      expect(result.state.classMagicDiscoverStreak).toBe(3);
    });
  });

  describe('MONSTER_DEFEATED', () => {
    const makeMonster = (overrides?: Partial<any>) => ({
      id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5,
      hp: 0, maxHp: 10, attack: 5, currentLayer: 0, fury: 2, hpLayers: 2,
      ...overrides,
    });

    it('transforms final monster into boss (branch A)', () => {
      const monster = makeMonster({ isFinalMonster: true, hp: 0, currentLayer: 0 });
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots });
      const result = reduce(state, { type: 'MONSTER_DEFEATED', monsterId: 'm1' });
      const bossCard = result.state.activeCards[0] as any;
      expect(bossCard.bossPhase).toBe(true);
      expect(bossCard.bossRetaliationDamage).toBe(3);
      expect(bossCard.hasRevive).toBe(true);
      expect(bossCard.currentLayer).toBe(2);
    });

    it('revives monster when hasRevive (branch B)', () => {
      const monster = makeMonster({ hasRevive: true, reviveUsed: false, hp: 0, currentLayer: 0 });
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots });
      const result = reduce(state, { type: 'MONSTER_DEFEATED', monsterId: 'm1' });
      const revived = result.state.activeCards[0] as any;
      expect(revived.currentLayer).toBe(1);
      expect(revived.hp).toBe(10);
      expect(revived.reviveUsed).toBe(true);
    });

    it('increments monstersDefeated on actual defeat (branch C)', () => {
      const monster = makeMonster();
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots, monstersDefeated: 3 });
      const result = reduce(state, { type: 'MONSTER_DEFEATED', monsterId: 'm1' });
      expect(result.state.monstersDefeated).toBe(4);
    });

    it('cleans up combat state on defeat', () => {
      const monster = makeMonster();
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({
        activeCards: slots,
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: ['m1'],
          heroDamageThisTurn: { m1: 5 },
        },
      });
      const result = reduce(state, { type: 'MONSTER_DEFEATED', monsterId: 'm1' });
      expect(result.state.combatState.engagedMonsterIds).toEqual([]);
      expect(result.state.heroStunned).toBe(false);
    });

    it('skeleton re-revive resets reviveUsed on other skeletons', () => {
      const monster = makeMonster({ id: 'm1' });
      const skeleton = {
        id: 's1', type: 'monster' as const, name: 'Skeleton', value: 3,
        hp: 5, maxHp: 10, attack: 3, monsterType: 'Skeleton',
        skeletonReRevive: true, reviveUsed: true,
      };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      slots[1] = skeleton;
      const state = makeState({ activeCards: slots, combatState: { ...initialCombatState, engagedMonsterIds: ['m1'] } });
      const result = reduce(state, { type: 'MONSTER_DEFEATED', monsterId: 'm1' });
      expect((result.state.activeCards[1] as any).reviveUsed).toBe(false);
    });

    it('buffs minion when killedByMinion and has skill', () => {
      const monster = makeMonster();
      const minion = { id: 'min1', type: 'weapon' as const, name: 'Minion', value: 2, isMinionCard: true, attack: 2, hp: 3, maxHp: 3 };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({
        activeCards: slots,
        backpackItems: [minion as any],
        selectedHeroSkill: 'summon-minion',
        combatState: { ...initialCombatState, engagedMonsterIds: ['m1'] },
      });
      const result = reduce(state, { type: 'MONSTER_DEFEATED', monsterId: 'm1', killedByMinion: true });
      const buffed = (result.state.backpackItems as any[])[0];
      expect(buffed.attack).toBe(3);
      expect(buffed.hp).toBe(4);
    });

    it('runs last words inline on defeat (discards hand + emits combat:lastWordsDiscard)', () => {
      const monster = makeMonster({ lastWords: 'discard-hand-1' });
      const handCard = { id: 'h1', type: 'magic' as const, name: 'Spell', value: 0 };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({
        activeCards: slots,
        handCards: [handCard as any],
        combatState: { ...initialCombatState, engagedMonsterIds: ['m1'] },
      });
      const result = reduce(state, { type: 'MONSTER_DEFEATED', monsterId: 'm1' });
      expect(result.state.handCards).toHaveLength(0);
      expect(result.sideEffects.some(e => e.event === 'combat:lastWordsDiscard')).toBe(true);
    });

    it('runs skeleton last words BEFORE revive (hand discard happens, monster still revived)', () => {
      const monster = {
        id: 'sk1', type: 'monster' as const, name: 'Skeleton', value: 5,
        hp: 0, maxHp: 5, attack: 5, monsterType: 'Skeleton',
        hasRevive: true, skeletonLastWordsDiscard: true,
      };
      const handCard = { id: 'h1', type: 'magic' as const, name: 'Spell', value: 0 };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({
        activeCards: slots,
        handCards: [handCard as any],
        combatState: { ...initialCombatState, engagedMonsterIds: ['sk1'] },
      });
      const result = reduce(state, { type: 'MONSTER_DEFEATED', monsterId: 'sk1' });
      // Discard applied
      expect(result.state.handCards).toHaveLength(0);
      // Monster revived (still on board with reviveUsed)
      const revived = (result.state.activeCards as any[]).find(c => c?.id === 'sk1');
      expect(revived).toBeTruthy();
      expect(revived.reviveUsed).toBe(true);
      expect(revived.currentLayer).toBe(1);
      // Side effect order: discard banner BEFORE revive log
      const events = result.sideEffects.map(e => ({ event: e.event, payload: (e as any).payload }));
      const discardIdx = events.findIndex(e => e.event === 'combat:lastWordsDiscard');
      const reviveIdx = events.findIndex(e => e.event === 'log:entry' && /复生/.test(e.payload?.message ?? ''));
      expect(discardIdx).toBeGreaterThanOrEqual(0);
      expect(reviveIdx).toBeGreaterThan(discardIdx);
    });

    it('queues monster rewards when rewards exist', () => {
      const monster = makeMonster({ fury: 3, hpLayers: 3 });
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots, combatState: { ...initialCombatState, engagedMonsterIds: ['m1'] } });
      const result = reduce(state, { type: 'MONSTER_DEFEATED', monsterId: 'm1' });
      const hasRewardEffect = result.sideEffects.some(
        e => e.event === 'combat:monsterRewardQueued' || e.event === 'combat:removeAndGraveyard',
      );
      expect(hasRewardEffect).toBe(true);
    });
  });

  describe('ADD_TO_GRAVEYARD', () => {
    it('adds card to discardedCards and increments waveDiscardCount', () => {
      const card = { id: 'c1', type: 'magic' as const, name: 'Spell', value: 0 };
      const state = makeState({ discardedCards: [], waveDiscardCount: 2 });
      const result = reduce(state, { type: 'ADD_TO_GRAVEYARD', card: card as any });
      expect(result.state.discardedCards).toHaveLength(1);
      expect(result.state.discardedCards[0].id).toBe('c1');
      expect(result.state.waveDiscardCount).toBe(3);
    });

    it('deduplicates by id', () => {
      const card = { id: 'c1', type: 'magic' as const, name: 'Spell', value: 0 };
      const state = makeState({ discardedCards: [card as any], waveDiscardCount: 1 });
      const result = reduce(state, { type: 'ADD_TO_GRAVEYARD', card: card as any });
      expect(result.state.discardedCards).toHaveLength(1);
      expect(result.state).toBe(state);
    });

    it('resets monster stats for graveyard', () => {
      const monster = { id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5, tempAttackBoost: 10, attack: 15 };
      const state = makeState({ discardedCards: [] });
      const result = reduce(state, { type: 'ADD_TO_GRAVEYARD', card: monster as any });
      expect((result.state.discardedCards[0] as any).tempAttackBoost).toBe(0);
    });

    it('emits log side effect', () => {
      const card = { id: 'c1', type: 'magic' as const, name: 'Spell', value: 0 };
      const state = makeState({ discardedCards: [] });
      const result = reduce(state, { type: 'ADD_TO_GRAVEYARD', card: card as any });
      expect(result.sideEffects.some(e =>
        e.event === 'log:entry' && (e.payload as any).message.includes('坟场'),
      )).toBe(true);
    });
  });

  describe('ADD_TO_RECYCLE_BAG', () => {
    it('adds card to permanentMagicRecycleBag with _recycleWaits', () => {
      const card = { id: 'c1', type: 'magic' as const, name: 'Perm Magic', value: 0, magicType: 'permanent', recycleDelay: 2 };
      const state = makeState({ permanentMagicRecycleBag: [] });
      const result = reduce(state, { type: 'ADD_TO_RECYCLE_BAG', card: card as any });
      expect(result.state.permanentMagicRecycleBag).toHaveLength(1);
      expect((result.state.permanentMagicRecycleBag[0] as any)._recycleWaits).toBe(2);
    });

    it('deduplicates by id (replaces existing)', () => {
      const card = { id: 'c1', type: 'magic' as const, name: 'Perm', value: 0, recycleDelay: 1 };
      const state = makeState({ permanentMagicRecycleBag: [{ ...card, _recycleWaits: 0 } as any] });
      const result = reduce(state, { type: 'ADD_TO_RECYCLE_BAG', card: card as any });
      expect(result.state.permanentMagicRecycleBag).toHaveLength(1);
    });

    it('advances recycle-backpack-expand amulet progress', () => {
      const card = { id: 'c1', type: 'magic' as const, name: 'Perm', value: 0 };
      const amulet = { id: 'a1', type: 'amulet' as const, name: 'Amulet', value: 0, amuletEffect: 'recycle-backpack-expand' };
      const state = makeState({
        permanentMagicRecycleBag: [],
        amuletSlots: [amulet as any],
        recycleBackpackProgress: 6,
      });
      const result = reduce(state, { type: 'ADD_TO_RECYCLE_BAG', card: card as any });
      expect(result.state.recycleBackpackProgress).toBe(7);
    });

    it('resets progress and expands backpack when threshold reached', () => {
      const card = { id: 'c1', type: 'magic' as const, name: 'Perm', value: 0 };
      const amulet = { id: 'a1', type: 'amulet' as const, name: 'Amulet', value: 0, amuletEffect: 'recycle-backpack-expand' };
      const state = makeState({
        permanentMagicRecycleBag: [],
        amuletSlots: [amulet as any],
        recycleBackpackProgress: 7,
        backpackCapacityModifier: 0,
      });
      const result = reduce(state, { type: 'ADD_TO_RECYCLE_BAG', card: card as any });
      expect(result.state.recycleBackpackProgress).toBe(0);
      expect(result.state.backpackCapacityModifier).toBe(3);
    });
  });

  describe('ADD_TO_BACKPACK', () => {
    it('adds card to backpackItems when capacity allows', () => {
      const card = { id: 'bp1', type: 'magic' as const, name: 'Spell', value: 0 };
      const state = makeState({ backpackItems: [], backpackCapacityModifier: 0 });
      const result = reduce(state, { type: 'ADD_TO_BACKPACK', card: card as any });
      expect(result.state.backpackItems).toHaveLength(1);
      expect(result.state.backpackItems[0].id).toBe('bp1');
    });

    it('overflows to recycle bag when backpack is full (non-restricted card)', () => {
      const existing = Array.from({ length: BASE_BACKPACK_CAPACITY }, (_, i) => ({ id: `e${i}`, type: 'equipment' as const, name: `Card${i}`, value: 0 }));
      const card = { id: 'over1', type: 'equipment' as const, name: 'Overflow', value: 0 };
      const state = makeState({ backpackItems: existing as any, backpackCapacityModifier: 0 });
      const result = reduce(state, { type: 'ADD_TO_BACKPACK', card: card as any });
      expect(result.state.backpackItems).toHaveLength(BASE_BACKPACK_CAPACITY);
      expect(result.state.permanentMagicRecycleBag.some((c: any) => c.id === 'over1')).toBe(true);
      expect(result.sideEffects.some(e => e.event === 'log:entry')).toBe(true);
    });

    it('emits card:newCardGained when added successfully', () => {
      const card = { id: 'bp2', type: 'magic' as const, name: 'Spell2', value: 0 };
      const state = makeState({ backpackItems: [] });
      const result = reduce(state, { type: 'ADD_TO_BACKPACK', card: card as any });
      expect(result.sideEffects.some(e => e.event === 'card:newCardGained')).toBe(true);
    });
  });

  describe('DRAW_FROM_BACKPACK', () => {
    it('draws cards from backpack to hand', () => {
      const bpCards = [
        { id: 'd1', type: 'magic' as const, name: 'Draw1', value: 0 },
        { id: 'd2', type: 'magic' as const, name: 'Draw2', value: 0 },
      ];
      const state = makeState({ backpackItems: bpCards as any, handCards: [] });
      const result = reduce(state, { type: 'DRAW_FROM_BACKPACK', count: 1 });
      expect(result.state.handCards).toHaveLength(1);
      expect(result.state.backpackItems).toHaveLength(1);
      expect(result.sideEffects.some(e => e.event === 'card:drawnFromBackpack')).toBe(true);
    });

    it('returns no change when backpack is empty', () => {
      const state = makeState({ backpackItems: [], handCards: [] });
      const result = reduce(state, { type: 'DRAW_FROM_BACKPACK', count: 2 });
      expect(result.state.handCards).toHaveLength(0);
      expect(result.sideEffects).toHaveLength(0);
    });
  });

  describe('FINALIZE_MAGIC_CARD', () => {
    it('clears pendingMagicAction', () => {
      const card = { id: 'fm1', type: 'magic' as const, name: 'Fireball', value: 5 };
      const state = makeState({ pendingMagicAction: { type: 'targeting' } as any });
      const result = reduce(state, { type: 'FINALIZE_MAGIC_CARD', card: card as any });
      expect(result.state.pendingMagicAction).toBeNull();
    });

    it('increments damageMagicPlayedThisTurn for damage magic', () => {
      const card = { id: 'fm2', type: 'magic' as const, name: 'Lightning', value: 3 };
      const state = makeState({ damageMagicPlayedThisTurn: 1 });
      const result = reduce(state, { type: 'FINALIZE_MAGIC_CARD', card: card as any, dealtDamage: true });
      expect(result.state.damageMagicPlayedThisTurn).toBe(2);
    });

    it('does not increment counter for non-damage magic', () => {
      const card = { id: 'fm3', type: 'magic' as const, name: 'Heal', value: 3 };
      const state = makeState({ damageMagicPlayedThisTurn: 1 });
      const result = reduce(state, { type: 'FINALIZE_MAGIC_CARD', card: card as any });
      expect(result.state.damageMagicPlayedThisTurn).toBe(1);
    });

    it('enqueues ADD_TO_GRAVEYARD for non-permanent magic', () => {
      const card = { id: 'fm4', type: 'magic' as const, name: 'Bolt', value: 2 };
      const state = makeState({});
      const result = reduce(state, { type: 'FINALIZE_MAGIC_CARD', card: card as any });
      expect(result.enqueuedActions.some(a => a.type === 'ADD_TO_GRAVEYARD')).toBe(true);
    });

    it('enqueues ADD_TO_RECYCLE_BAG for permanent magic', () => {
      const card = { id: 'fm5', type: 'magic' as const, name: 'Perm', value: 2, magicType: 'permanent' };
      const state = makeState({});
      const result = reduce(state, { type: 'FINALIZE_MAGIC_CARD', card: card as any });
      expect(result.enqueuedActions.some(a => a.type === 'ADD_TO_RECYCLE_BAG')).toBe(true);
    });

    it('enqueues ADD_TO_RECYCLE_BAG for cards with recycleDelay > 0', () => {
      const card = { id: 'fm6', type: 'magic' as const, name: 'Perm2', value: 2, recycleDelay: 2 };
      const state = makeState({});
      const result = reduce(state, { type: 'FINALIZE_MAGIC_CARD', card: card as any });
      expect(result.enqueuedActions.some(a => a.type === 'ADD_TO_RECYCLE_BAG')).toBe(true);
    });

    it('enqueues APPLY_DAMAGE for anti-magic reflecting monsters', () => {
      const monster = { id: 'm1', type: 'monster' as const, name: 'Mage', value: 5, antiMagicReflect: 3, isStunned: false };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const card = { id: 'fm7', type: 'magic' as const, name: 'Spell', value: 1 };
      const state = makeState({ activeCards: slots });
      const result = reduce(state, { type: 'FINALIZE_MAGIC_CARD', card: card as any });
      expect(result.enqueuedActions.some(a => a.type === 'APPLY_DAMAGE' && (a as any).amount === 3)).toBe(true);
    });

    it('skips anti-magic reflect for stunned monsters', () => {
      const monster = { id: 'm2', type: 'monster' as const, name: 'Mage', value: 5, antiMagicReflect: 3, isStunned: true };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const card = { id: 'fm8', type: 'magic' as const, name: 'Spell', value: 1 };
      const state = makeState({ activeCards: slots });
      const result = reduce(state, { type: 'FINALIZE_MAGIC_CARD', card: card as any });
      expect(result.enqueuedActions.filter(a => a.type === 'APPLY_DAMAGE').length).toBe(0);
    });

    it('skips anti-magic reflect for curse cards (Golem 反魔 ignores curses)', () => {
      // Curse cards auto-resolve as a forced penalty — they are not spells the
      // player chose to cast — so Golem's 反魔 must NOT punish the player for
      // them. Both APPLY_DAMAGE and the skill float should be skipped.
      const monster = { id: 'm-curse-skip', type: 'monster' as const, name: 'Golem', value: 5, antiMagicReflect: 2, isStunned: false };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const curse = { id: 'c1', type: 'curse' as const, name: '诅咒', value: 0 };
      const state = makeState({ activeCards: slots });
      const result = reduce(state, { type: 'FINALIZE_MAGIC_CARD', card: curse as any });
      expect(result.enqueuedActions.filter(a => a.type === 'APPLY_DAMAGE').length).toBe(0);
      expect(result.enqueuedActions.filter(a => a.type === 'TRIGGER_MONSTER_SKILL_FLOAT').length).toBe(0);
      // Curse still routes back to backpack (existing behavior preserved).
      expect(result.enqueuedActions.some(a => a.type === 'ADD_TO_BACKPACK')).toBe(true);
    });

    it('anti-magic reflect routes through equipped shield armor (no APPLY_DAMAGE)', () => {
      const monster = { id: 'm-am-shield', type: 'monster' as const, name: 'Mage', value: 5, antiMagicReflect: 3, isStunned: false };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const shield = {
        id: 's1', type: 'shield' as const, name: '木盾', value: 3,
        armor: 5, armorMax: 5, fromSlot: 'equipmentSlot1' as const,
      };
      const card = { id: 'fm-am-shield', type: 'magic' as const, name: 'Spell', value: 1 };
      const state = makeState({ activeCards: slots, equipmentSlot1: shield as any });
      const result = reduce(state, { type: 'FINALIZE_MAGIC_CARD', card: card as any });
      // Shield absorbed → no APPLY_DAMAGE enqueued.
      expect(result.enqueuedActions.filter(a => a.type === 'APPLY_DAMAGE').length).toBe(0);
      // Armor reduced 5 → 2.
      expect((result.state.equipmentSlot1 as any).armor).toBe(2);
    });

    it('anti-magic reflect with no shield equipped falls onto HP via APPLY_DAMAGE', () => {
      const monster = { id: 'm-am-noshield', type: 'monster' as const, name: 'Mage', value: 5, antiMagicReflect: 3, isStunned: false };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const card = { id: 'fm-am-noshield', type: 'magic' as const, name: 'Spell', value: 1 };
      const state = makeState({ activeCards: slots });
      const result = reduce(state, { type: 'FINALIZE_MAGIC_CARD', card: card as any });
      const dmg = result.enqueuedActions.find(a => a.type === 'APPLY_DAMAGE') as any;
      expect(dmg).toBeDefined();
      expect(dmg.amount).toBe(3);
    });

    it('multiple anti-magic reflects chain rng so each shield pick is fresh', () => {
      // Two reflecting monsters, two shields. Both shields should receive
      // damage when reflects are independently routed (both armors decrease).
      const m1 = { id: 'm-am-1', type: 'monster' as const, name: 'Mage1', value: 5, antiMagicReflect: 2, isStunned: false };
      const m2 = { id: 'm-am-2', type: 'monster' as const, name: 'Mage2', value: 5, antiMagicReflect: 2, isStunned: false };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = m1;
      slots[1] = m2;
      const shieldA = {
        id: 'sA', type: 'shield' as const, name: '盾A', value: 3,
        armor: 5, armorMax: 5, fromSlot: 'equipmentSlot1' as const,
      };
      const shieldB = {
        id: 'sB', type: 'shield' as const, name: '盾B', value: 3,
        armor: 5, armorMax: 5, fromSlot: 'equipmentSlot2' as const,
      };
      const card = { id: 'fm-am-multi', type: 'magic' as const, name: 'Spell', value: 1 };
      const state = makeState({ activeCards: slots, equipmentSlot1: shieldA as any, equipmentSlot2: shieldB as any });
      const result = reduce(state, { type: 'FINALIZE_MAGIC_CARD', card: card as any });
      // Total armor lost across both slots must equal total reflect damage (4).
      const newA = (result.state.equipmentSlot1 as any)?.armor ?? 0;
      const newB = (result.state.equipmentSlot2 as any)?.armor ?? 0;
      expect((5 - newA) + (5 - newB)).toBe(4);
      // No APPLY_DAMAGE — both reflects absorbed by shields.
      expect(result.enqueuedActions.filter(a => a.type === 'APPLY_DAMAGE').length).toBe(0);
    });
  });

  describe('FINALIZE_POTION_CARD', () => {
    it('clears pendingPotionAction when matching card', () => {
      const card = { id: 'fp1', type: 'potion' as const, name: 'Heal Pot', value: 5 };
      const state = makeState({ pendingPotionAction: { card } as any });
      const result = reduce(state, { type: 'FINALIZE_POTION_CARD', card: card as any });
      expect(result.state.pendingPotionAction).toBeNull();
    });

    it('enqueues ADD_TO_GRAVEYARD for normal potions', () => {
      const card = { id: 'fp2', type: 'potion' as const, name: 'Pot', value: 5 };
      const state = makeState({});
      const result = reduce(state, { type: 'FINALIZE_POTION_CARD', card: card as any });
      expect(result.enqueuedActions.some(a => a.type === 'ADD_TO_GRAVEYARD')).toBe(true);
    });

    it('enqueues ADD_TO_RECYCLE_BAG for potions with recycleDelay', () => {
      const card = { id: 'fp3', type: 'potion' as const, name: 'PermPot', value: 5, recycleDelay: 2 };
      const state = makeState({});
      const result = reduce(state, { type: 'FINALIZE_POTION_CARD', card: card as any });
      expect(result.enqueuedActions.some(a => a.type === 'ADD_TO_RECYCLE_BAG')).toBe(true);
    });

    it('emits flip requested side effect for flipTarget potions', () => {
      const card = { id: 'fp4', type: 'potion' as const, name: 'FlipPot', value: 5, flipTarget: 'gold' };
      const state = makeState({});
      const result = reduce(state, { type: 'FINALIZE_POTION_CARD', card: card as any });
      expect(result.sideEffects.some(e => e.event === 'card:potionFlipRequested')).toBe(true);
    });
  });

  describe('RESOLVE_POTION expanded effects', () => {
    it('handles perm-spell-damage: permanentSpellDamageBonus +1', () => {
      const card = { id: 'rp1', type: 'potion' as const, name: 'SpellDmg', value: 0, potionEffect: 'perm-spell-damage' };
      const state = makeState({ permanentSpellDamageBonus: 3 });
      const result = reduce(state, { type: 'RESOLVE_POTION', cardId: 'rp1', card: card as any });
      expect(result.state.permanentSpellDamageBonus).toBe(4);
      expect(result.enqueuedActions.some(a => a.type === 'FINALIZE_POTION_CARD')).toBe(true);
    });

    it('handles perm-backpack-size: backpackCapacityModifier +1', () => {
      const card = { id: 'rp2', type: 'potion' as const, name: 'BPSize', value: 0, potionEffect: 'perm-backpack-size' };
      const state = makeState({ backpackCapacityModifier: 0 });
      const result = reduce(state, { type: 'RESOLVE_POTION', cardId: 'rp2', card: card as any });
      expect(result.state.backpackCapacityModifier).toBe(1);
      expect(result.enqueuedActions.some(a => a.type === 'ENFORCE_BACKPACK_CAPACITY')).toBe(true);
    });

    it('handles perm-stun-cap+10: stunCap capped at 100', () => {
      const card = { id: 'rp3', type: 'potion' as const, name: 'StunPot', value: 0, potionEffect: 'perm-stun-cap+10' };
      const state = makeState({ stunCap: 95 });
      const result = reduce(state, { type: 'RESOLVE_POTION', cardId: 'rp3', card: card as any });
      expect(result.state.stunCap).toBe(100);
    });

    it('handles boost-both-slots: both slot bonuses +1', () => {
      const card = { id: 'rp4', type: 'potion' as const, name: 'BoostAll', value: 0, potionEffect: 'boost-both-slots' };
      const state = makeState({
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 2, shield: 1 },
          equipmentSlot2: { damage: 0, shield: 3 },
        },
      });
      const result = reduce(state, { type: 'RESOLVE_POTION', cardId: 'rp4', card: card as any });
      expect(result.state.equipmentSlotBonuses.equipmentSlot1).toEqual({ damage: 3, shield: 2 });
      expect(result.state.equipmentSlotBonuses.equipmentSlot2).toEqual({ damage: 1, shield: 4 });
    });

    it('handles perm-both-slots-shield+1: both slot shield +1, damage unchanged', () => {
      const card = { id: 'rp4b', type: 'potion' as const, name: 'ShieldOnly', value: 0, potionEffect: 'perm-both-slots-shield+1' };
      const state = makeState({
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 2, shield: 1 },
          equipmentSlot2: { damage: 0, shield: 3 },
        },
      });
      const result = reduce(state, { type: 'RESOLVE_POTION', cardId: 'rp4b', card: card as any });
      expect(result.state.equipmentSlotBonuses.equipmentSlot1).toEqual({ damage: 2, shield: 2 });
      expect(result.state.equipmentSlotBonuses.equipmentSlot2).toEqual({ damage: 0, shield: 4 });
    });

    it('handles left-slot-durability-max+1: increases maxDurability', () => {
      // 装备耐久上限封顶为 4（DURABILITY_CAP）。原测试用 maxDur=5 已不再合法，
      // 改为 maxDur=3 起步，+1 后应为 4。
      const leftItem = { id: 'w1', type: 'weapon' as const, name: 'Sword', value: 3, durability: 3, maxDurability: 3 };
      const card = { id: 'rp5', type: 'potion' as const, name: 'DurPot', value: 0, potionEffect: 'left-slot-durability-max+1' };
      const state = makeState({ equipmentSlot1: leftItem as any });
      const result = reduce(state, { type: 'RESOLVE_POTION', cardId: 'rp5', card: card as any });
      expect((result.state.equipmentSlot1 as any).maxDurability).toBe(4);
    });

    it('handles left-slot-durability-max+1: 已达上限 4 时 maxDurability 不变（静默吸收）', () => {
      const leftItem = { id: 'w1', type: 'weapon' as const, name: 'Sword', value: 3, durability: 4, maxDurability: 4 };
      const card = { id: 'rp5cap', type: 'potion' as const, name: 'DurPot', value: 0, potionEffect: 'left-slot-durability-max+1' };
      const state = makeState({ equipmentSlot1: leftItem as any });
      const result = reduce(state, { type: 'RESOLVE_POTION', cardId: 'rp5cap', card: card as any });
      expect((result.state.equipmentSlot1 as any).maxDurability).toBe(4);
    });

    it('handles left-slot-durability-max+1: no-op when no equipment', () => {
      const card = { id: 'rp6', type: 'potion' as const, name: 'DurPot', value: 0, potionEffect: 'left-slot-durability-max+1' };
      const state = makeState({ equipmentSlot1: null });
      const result = reduce(state, { type: 'RESOLVE_POTION', cardId: 'rp6', card: card as any });
      expect(result.sideEffects.some(e => e.event === 'ui:banner')).toBe(true);
    });

    it('handles spell-lifesteal+1-maxhp+6', () => {
      const card = { id: 'rp7', type: 'potion' as const, name: 'VampPot', value: 0, potionEffect: 'spell-lifesteal+1-maxhp+6' };
      const state = makeState({ permanentSpellLifesteal: 0, permanentMaxHpBonus: 0 });
      const result = reduce(state, { type: 'RESOLVE_POTION', cardId: 'rp7', card: card as any });
      expect(result.state.permanentSpellLifesteal).toBe(1);
      expect(result.state.permanentMaxHpBonus).toBe(6);
    });

    it('handles swap-slot-damage-shield: prompts player to choose slot (slot-select pending)', () => {
      const card = { id: 'rp8', type: 'potion' as const, name: 'SwapPot', value: 0, potionEffect: 'swap-slot-damage-shield' };
      const state = makeState({
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 5, shield: 2 },
          equipmentSlot2: { damage: 3, shield: 7 },
        },
      });
      const result = reduce(state, { type: 'RESOLVE_POTION', cardId: 'rp8', card: card as any });
      // 不再立即互换；先进入 slot-select 等待玩家选择
      expect(result.state.pendingPotionAction).not.toBeNull();
      expect(result.state.pendingPotionAction?.effect).toBe('swap-slot-damage-shield');
      expect((result.state.pendingPotionAction as any)?.step).toBe('slot-select');
      // 数值未变
      const b = result.state.equipmentSlotBonuses;
      expect(b.equipmentSlot1).toEqual({ damage: 5, shield: 2 });
      expect(b.equipmentSlot2).toEqual({ damage: 3, shield: 7 });
    });

    it('emits ui:requestDice for dice-arcane-infusion potion', () => {
      const card = { id: 'rp9', type: 'potion' as const, name: 'DicePot', value: 0, potionEffect: 'dice-arcane-infusion' };
      const state = makeState({});
      const result = reduce(state, { type: 'RESOLVE_POTION', cardId: 'rp9', card: card as any });
      expect(result.sideEffects.some(e => e.event === 'ui:requestDice')).toBe(true);
    });
  });

  describe('DECREMENT_FURY', () => {
    it('decrements monster layer by 1', () => {
      const monster = { id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5, hp: 10, maxHp: 10, attack: 5, currentLayer: 3, fury: 3 };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots });
      const result = reduce(state, { type: 'DECREMENT_FURY', monsterId: 'm1' });
      expect((result.state.activeCards[0] as any).currentLayer).toBe(2);
    });

    it('enqueues MONSTER_DEFEATED when layer reaches 0', () => {
      const monster = { id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5, hp: 10, maxHp: 10, attack: 5, currentLayer: 1 };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots });
      const result = reduce(state, { type: 'DECREMENT_FURY', monsterId: 'm1' });
      expect(result.enqueuedActions.some(a => a.type === 'MONSTER_DEFEATED')).toBe(true);
    });

    it('skips layer cost for skeleton no-layer-cost', () => {
      const monster = { id: 'm1', type: 'monster' as const, name: 'Skeleton', value: 5, hp: 10, maxHp: 10, attack: 5, currentLayer: 2, skeletonNoLayerCostActive: true };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots });
      const result = reduce(state, { type: 'DECREMENT_FURY', monsterId: 'm1' });
      expect((result.state.activeCards[0] as any).currentLayer).toBe(2);
    });

    it('applies bleed attack boost on layer loss', () => {
      const monster = { id: 'm1', type: 'monster' as const, name: 'Bleeder', value: 5, hp: 10, maxHp: 10, attack: 5, currentLayer: 3, bleedEffect: 'attack+3' };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots });
      const result = reduce(state, { type: 'DECREMENT_FURY', monsterId: 'm1' });
      expect((result.state.activeCards[0] as any).attack).toBe(8);
    });

    it('triggers golem layer-loss reflect when monster spends a layer to attack', () => {
      const monster = { id: 'm1', type: 'monster' as const, name: 'Golem', value: 5, hp: 10, maxHp: 10, attack: 5, currentLayer: 3, fury: 3, golemLayerLossReflect: 2 };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots });
      const result = reduce(state, { type: 'DECREMENT_FURY', monsterId: 'm1' });
      // fury(3) - nextLayer(2) = 1 lost layer × coeff 2 = 2 reflect damage
      const reflectAction = result.enqueuedActions.find(a =>
        a.type === 'APPLY_DAMAGE' && (a as any).source === 'combat',
      );
      expect(reflectAction).toBeDefined();
      expect((reflectAction as any).amount).toBe(2);
      expect(result.sideEffects.some(e => e.event === 'combat:golemReflect')).toBe(true);
    });

    it('does not trigger golem reflect when stunned', () => {
      const monster = { id: 'm1', type: 'monster' as const, name: 'Golem', value: 5, hp: 10, maxHp: 10, attack: 5, currentLayer: 3, fury: 3, golemLayerLossReflect: 2, isStunned: true };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots });
      const result = reduce(state, { type: 'DECREMENT_FURY', monsterId: 'm1' });
      expect(result.sideEffects.some(e => e.event === 'combat:golemReflect')).toBe(false);
    });

    it('preserves hp on layer cost (does not refill to maxHp)', () => {
      const monster = { id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5, hp: 3, maxHp: 10, attack: 5, currentLayer: 2, fury: 2, hpLayers: 2 };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots });
      const result = reduce(state, { type: 'DECREMENT_FURY', monsterId: 'm1' });
      const after = result.state.activeCards[0] as any;
      expect(after.currentLayer).toBe(1);
      expect(after.hp).toBe(3);
      expect(after.maxHp).toBe(10);
    });

    it('monster at low hp dies on next attack', () => {
      const monster = { id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5, hp: 3, maxHp: 10, attack: 5, currentLayer: 2, fury: 2, hpLayers: 2 };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots });
      const r1 = reduce(state, { type: 'DECREMENT_FURY', monsterId: 'm1' });
      const after1 = r1.state.activeCards[0] as any;
      expect(after1.currentLayer).toBe(1);
      expect(after1.hp).toBe(3);
      const r2 = reduce(r1.state, { type: 'DECREMENT_FURY', monsterId: 'm1' });
      expect(r2.enqueuedActions.some(a => a.type === 'MONSTER_DEFEATED')).toBe(true);
    });

    it('preserves hp on layer cost when bleed triggers attack boost', () => {
      const monster = { id: 'm1', type: 'monster' as const, name: 'Bleeder', value: 5, hp: 2, maxHp: 8, attack: 5, currentLayer: 3, fury: 3, hpLayers: 3, bleedEffect: 'attack+3' };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots });
      const result = reduce(state, { type: 'DECREMENT_FURY', monsterId: 'm1' });
      const after = result.state.activeCards[0] as any;
      expect(after.currentLayer).toBe(2);
      expect(after.attack).toBe(8);
      expect(after.hp).toBe(2);
      expect(after.maxHp).toBe(8);
    });
  });

  describe('EXECUTE_LAST_WORDS', () => {
    it('wraith-haunt shuffles cards and boosts monster attack', () => {
      const wraith = { id: 'w1', type: 'monster' as const, name: 'Wraith', value: 5, hp: 0 };
      const other = { id: 'm2', type: 'monster' as const, name: 'Goblin', value: 3, attack: 3 };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = wraith; slots[1] = other;
      const state = makeState({ activeCards: slots });
      const result = reduce(state, { type: 'EXECUTE_LAST_WORDS', monsterId: 'w1', lastWords: 'wraith-haunt-2' });
      const monsters = result.state.activeCards.filter((c: any) => c?.type === 'monster' && c.id !== 'w1');
      if (monsters.length > 0) {
        expect((monsters[0] as any).attack).toBeGreaterThanOrEqual(5);
      }
    });

    it('discard-hand-1 removes one card from hand', () => {
      const monster = { id: 'm1', type: 'monster' as const, name: 'Skeleton', value: 5 };
      const handCard = { id: 'h1', type: 'magic' as const, name: 'Spell', value: 0 };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots, handCards: [handCard as any] });
      const result = reduce(state, { type: 'EXECUTE_LAST_WORDS', monsterId: 'm1', lastWords: 'discard-hand-1' });
      expect(result.state.handCards).toHaveLength(0);
      expect(result.sideEffects.some(e => e.event === 'combat:lastWordsDiscard')).toBe(true);
    });
  });

  describe('APPLY_DRAGON_BREATH_RETALIATION', () => {
    it('damages shield armor when shield exists', () => {
      const shield = { id: 's1', type: 'shield' as const, name: 'Shield', value: 5, armor: 5, armorMax: 5 };
      const state = makeState({ equipmentSlot1: shield as any, equipmentSlot2: null });
      const result = reduce(state, {
        type: 'APPLY_DRAGON_BREATH_RETALIATION',
        monsterId: 'd1', monsterName: 'Dragon', damage: 3,
      });
      expect((result.state.equipmentSlot1 as any).armor).toBe(2);
    });

    it('enqueues APPLY_DAMAGE when no shields exist', () => {
      const weapon = { id: 'w1', type: 'weapon' as const, name: 'Sword', value: 5 };
      const state = makeState({ equipmentSlot1: weapon as any, equipmentSlot2: null });
      const result = reduce(state, {
        type: 'APPLY_DRAGON_BREATH_RETALIATION',
        monsterId: 'd1', monsterName: 'Dragon', damage: 4,
      });
      expect(result.enqueuedActions.some(a => a.type === 'APPLY_DAMAGE' && (a as any).amount === 4)).toBe(true);
    });
  });

  describe('APPLY_SHIELD_REFLECT', () => {
    it('deals damage to monster and enqueues MONSTER_DEFEATED on kill', () => {
      const monster = { id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5, hp: 3, maxHp: 10, currentLayer: 1 };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots });
      const result = reduce(state, { type: 'APPLY_SHIELD_REFLECT', monsterId: 'm1', damage: 10, sourceName: 'Shield' });
      expect(result.enqueuedActions.some(a => a.type === 'MONSTER_DEFEATED')).toBe(true);
    });

    it('applies bleed and boss retaliation on non-defeat', () => {
      const monster = { id: 'm1', type: 'monster' as const, name: 'Boss', value: 5, hp: 20, maxHp: 20, currentLayer: 3, fury: 3, bossRetaliationDamage: 3 };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({ activeCards: slots });
      const result = reduce(state, { type: 'APPLY_SHIELD_REFLECT', monsterId: 'm1', damage: 25, sourceName: 'Shield' });
      expect(result.enqueuedActions.some(a => a.type === 'APPLY_DAMAGE' && (a as any).amount === 3)).toBe(true);
    });
  });

  describe('ADD_MAGIC_GAUGE', () => {
    it('updates heroMagicState gauge', () => {
      const state = makeState({
        heroMagicState: {
          'holy-light': { unlocked: true, gauge: 0, usedThisWave: false },
        } as any,
      });
      const result = reduce(state, { type: 'ADD_MAGIC_GAUGE', gaugeType: 'holy-light', amount: 3 });
      expect((result.state.heroMagicState as any)['holy-light'].gauge).toBeGreaterThan(0);
    });

    it('emits magicGaugeFull when gauge reaches max', () => {
      const state = makeState({
        heroMagicState: {
          'holy-light': { unlocked: true, gauge: 8, usedThisWave: false },
        } as any,
      });
      const result = reduce(state, { type: 'ADD_MAGIC_GAUGE', gaugeType: 'holy-light', amount: 5 });
      expect(result.sideEffects.some(e => e.event === 'hero:magicGaugeFull')).toBe(true);
    });
  });

  describe('ACTIVATE_HERO_MAGIC', () => {
    it('blocks when magic not unlocked', () => {
      const state = makeState({
        heroMagicState: {
          'revive-blessing': { unlocked: false, gauge: 0, usedThisWave: false },
        } as any,
      });
      const result = reduce(state, { type: 'ACTIVATE_HERO_MAGIC', magicId: 'revive-blessing', origin: 'gauge' });
      expect(result.sideEffects.some(e => e.event === 'ui:banner')).toBe(true);
    });

    it('revive-blessing with 1 slot: applies revive and pays HP', () => {
      const weapon = { id: 'w1', type: 'weapon' as const, name: 'Sword', value: 5, durability: 3 };
      const state = makeState({
        heroMagicState: {
          'revive-blessing': { unlocked: true, gauge: 100, usedThisWave: false },
        } as any,
        equipmentSlot1: weapon as any,
        equipmentSlot2: null,
        hp: 20,
        pendingHeroMagicAction: null,
      });
      const result = reduce(state, { type: 'ACTIVATE_HERO_MAGIC', magicId: 'revive-blessing', origin: 'gauge' });
      expect(result.state.hp).toBe(17);
      expect((result.state.equipmentSlot1 as any).hasEquipmentRevive).toBe(true);
      expect(result.enqueuedActions.some(a => a.type === 'COMPLETE_HERO_MAGIC')).toBe(true);
    });

    it('revive-blessing with 2 slots: sets pendingHeroMagicAction for selection', () => {
      const weapon = { id: 'w1', type: 'weapon' as const, name: 'Sword', value: 5 };
      const shield = { id: 's1', type: 'shield' as const, name: 'Shield', value: 3 };
      const state = makeState({
        heroMagicState: {
          'revive-blessing': { unlocked: true, gauge: 100, usedThisWave: false },
        } as any,
        equipmentSlot1: weapon as any,
        equipmentSlot2: shield as any,
        pendingHeroMagicAction: null,
      });
      const result = reduce(state, { type: 'ACTIVATE_HERO_MAGIC', magicId: 'revive-blessing', origin: 'gauge' });
      expect(result.state.pendingHeroMagicAction).not.toBeNull();
      expect((result.state.pendingHeroMagicAction as any).id).toBe('revive-blessing');
    });

    it('monster-doom: destroys equipment and debuffs monsters', () => {
      const weapon = { id: 'w1', type: 'weapon' as const, name: 'Sword', value: 5, durability: 3 };
      const monster = { id: 'm1', type: 'monster' as const, name: 'Goblin', value: 10, hp: 10, maxHp: 10, attack: 10 };
      const slots = Array.from({ length: 5 }, () => null) as any;
      slots[0] = monster;
      const state = makeState({
        heroMagicState: {
          'monster-doom': { unlocked: true, gauge: 100, usedThisWave: false },
        } as any,
        equipmentSlot1: weapon as any,
        equipmentSlot2: null,
        activeCards: slots,
        pendingHeroMagicAction: null,
      });
      const result = reduce(state, { type: 'ACTIVATE_HERO_MAGIC', magicId: 'monster-doom', origin: 'gauge' });
      expect(result.state.equipmentSlot1).toBeNull();
      const m = result.state.activeCards[0] as any;
      expect(m.attack).toBeLessThan(10);
      expect(result.enqueuedActions.some(a => a.type === 'COMPLETE_HERO_MAGIC')).toBe(true);
    });
  });

  describe('COMPLETE_HERO_MAGIC', () => {
    it('marks magic as used and resets gauge for gauge origin', () => {
      const state = makeState({
        heroMagicState: {
          'revive-blessing': { unlocked: true, gauge: 100, usedThisWave: false },
        } as any,
        pendingHeroMagicAction: { id: 'revive-blessing' } as any,
      });
      const result = reduce(state, { type: 'COMPLETE_HERO_MAGIC', magicId: 'revive-blessing', origin: 'gauge' });
      expect((result.state.heroMagicState as any)['revive-blessing'].usedThisWave).toBe(true);
      expect((result.state.heroMagicState as any)['revive-blessing'].gauge).toBe(0);
      expect(result.state.pendingHeroMagicAction).toBeNull();
    });
  });

  describe('APPLY_REVIVE_BLESSING', () => {
    it('grants equipment revive to chosen slot', () => {
      const weapon = { id: 'w1', type: 'weapon' as const, name: 'Sword', value: 5, durability: 3 };
      const state = makeState({
        equipmentSlot1: weapon as any,
        hp: 20,
        pendingHeroMagicAction: { id: 'revive-blessing', origin: 'gauge' } as any,
      });
      const result = reduce(state, { type: 'APPLY_REVIVE_BLESSING', slotId: 'equipmentSlot1' });
      expect(result.state.hp).toBe(17);
      expect((result.state.equipmentSlot1 as any).hasEquipmentRevive).toBe(true);
      expect(result.state.pendingHeroMagicAction).toBeNull();
      expect(result.enqueuedActions.some(a => a.type === 'COMPLETE_HERO_MAGIC')).toBe(true);
    });
  });

  // =========================================================================
  // Phase 5A: APPLY_EVENT_EFFECT — expanded tokens
  // =========================================================================

  describe('APPLY_EVENT_EFFECT (Phase 5A tokens)', () => {
    it('amuletCapacity-1 reduces max and overflows excess amulets', () => {
      const a1 = { id: 'a1', name: 'A1', amuletEffect: 'heal' };
      const a2 = { id: 'a2', name: 'A2', amuletEffect: 'strength' };
      const state = makeState({ maxAmuletSlots: 2, amuletSlots: [a1, a2] as any });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'amuletCapacity-1' });
      expect(result.state.maxAmuletSlots).toBe(1);
      expect(result.state.amuletSlots).toHaveLength(1);
      expect(result.state.discardedCards.some((c: any) => c.id === 'a1')).toBe(true);
    });

    it('discardHandAll moves all hand cards to graveyard', () => {
      const c1 = { id: 'c1', name: 'C1', type: 'magic' };
      const c2 = { id: 'c2', name: 'C2', type: 'potion' };
      const state = makeState({ handCards: [c1, c2] as any, discardedCards: [] });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'discardHandAll' });
      expect(result.state.handCards).toHaveLength(0);
      expect(result.state.discardedCards).toHaveLength(2);
    });

    it('allSlotDamage-1 decreases both slot damage bonuses', () => {
      const state = makeState({
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 3, shield: 0 },
          equipmentSlot2: { damage: 2, shield: 1 },
        },
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'allSlotDamage-1' });
      expect(result.state.equipmentSlotBonuses.equipmentSlot1.damage).toBe(2);
      expect(result.state.equipmentSlotBonuses.equipmentSlot2.damage).toBe(1);
    });

    it('allSlotShield-1 decreases both slot shield bonuses', () => {
      const state = makeState({
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 0, shield: 3 },
          equipmentSlot2: { damage: 0, shield: 2 },
        },
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'allSlotShield-1' });
      expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(2);
      expect(result.state.equipmentSlotBonuses.equipmentSlot2.shield).toBe(1);
    });

    it('allSlotTempAttack adds temp attack and persuade amulet bonus', () => {
      const state = makeState({
        slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
        amuletSlots: [{ id: 'pa', amuletEffect: 'persuade-on-temp-attack' }] as any,
        persuadeAmuletBonus: 0,
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'allSlotTempAttack:3' });
      expect(result.state.slotTempAttack.equipmentSlot1).toBe(3);
      expect(result.state.slotTempAttack.equipmentSlot2).toBe(3);
      expect(result.state.persuadeAmuletBonus).toBeGreaterThan(0);
    });

    it('swapEquipmentSlots swaps slot1 and slot2', () => {
      const w = { id: 'w1', type: 'weapon', name: 'Sword', value: 5 };
      const s = { id: 's1', type: 'shield', name: 'Shield', value: 3 };
      const state = makeState({
        equipmentSlot1: w as any,
        equipmentSlot2: s as any,
        equipmentSlot1Reserve: [],
        equipmentSlot2Reserve: [{ id: 'r1' }] as any,
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'swapEquipmentSlots' });
      expect((result.state.equipmentSlot1 as any)?.id).toBe('s1');
      expect((result.state.equipmentSlot2 as any)?.id).toBe('w1');
      expect(result.state.equipmentSlot1Reserve).toHaveLength(1);
      expect(result.state.equipmentSlot2Reserve).toHaveLength(0);
    });

    it('repairAll restores all equipment durability to max', () => {
      const w = { id: 'w1', type: 'weapon', name: 'W', value: 3, durability: 1, maxDurability: 4 };
      const s = { id: 's1', type: 'shield', name: 'S', value: 2, durability: 2, maxDurability: 3 };
      const state = makeState({ equipmentSlot1: w as any, equipmentSlot2: s as any });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'repairAll' });
      expect((result.state.equipmentSlot1 as any).durability).toBe(4);
      expect((result.state.equipmentSlot2 as any).durability).toBe(3);
    });

    it('repairAllDurability+1 adds 1 durability capped at max', () => {
      const w = { id: 'w1', type: 'weapon', name: 'W', value: 3, durability: 2, maxDurability: 4 };
      const s = { id: 's1', type: 'shield', name: 'S', value: 2, durability: 3, maxDurability: 3 };
      const state = makeState({ equipmentSlot1: w as any, equipmentSlot2: s as any });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'repairAllDurability+1' });
      expect((result.state.equipmentSlot1 as any).durability).toBe(3);
      expect((result.state.equipmentSlot2 as any).durability).toBe(3);
    });

    it('removeAllAmulets moves amulets to graveyard and reverses aura', () => {
      const a1 = { id: 'a1', name: 'Str', amuletEffect: 'strength' };
      const a2 = { id: 'a2', name: 'Heal', amuletEffect: 'heal' };
      const state = makeState({
        amuletSlots: [a1, a2] as any,
        discardedCards: [],
        slotTempAttack: { equipmentSlot1: 10, equipmentSlot2: 10 },
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'removeAllAmulets' });
      expect(result.state.amuletSlots).toHaveLength(0);
      expect(result.state.discardedCards).toHaveLength(2);
      expect(result.state.slotTempAttack.equipmentSlot1).toBe(6);
      expect(result.state.slotTempAttack.equipmentSlot2).toBe(6);
    });
  });

  // =========================================================================
  // Phase 5B: APPLY_MONSTER_REWARD — expanded reward types
  // =========================================================================

  describe('APPLY_MONSTER_REWARD (Phase 5B)', () => {
    it('slotBonus increases permanent slot damage', () => {
      const state = makeState({
        equipmentSlotBonuses: {
          equipmentSlot1: { damage: 2, shield: 0 },
          equipmentSlot2: { damage: 0, shield: 1 },
        },
      });
      const result = reduce(state, {
        type: 'APPLY_MONSTER_REWARD',
        rewardType: 'slotBonus',
        amount: 3,
        slotId: 'equipmentSlot1',
        bonusType: 'damage',
      });
      expect(result.state.equipmentSlotBonuses.equipmentSlot1.damage).toBe(5);
    });

    it('heal increases hp capped at max', () => {
      const state = makeState({ hp: 10, permanentMaxHpBonus: 10 });
      const result = reduce(state, { type: 'APPLY_MONSTER_REWARD', rewardType: 'heal', amount: 8 });
      expect(result.state.hp).toBe(18);
    });

    it('heal does not exceed max hp', () => {
      const state = makeState({ hp: 18, permanentMaxHpBonus: 0 });
      const result = reduce(state, { type: 'APPLY_MONSTER_REWARD', rewardType: 'heal', amount: 10 });
      expect(result.state.hp).toBe(20);
    });

    it('drawBackpack moves cards from backpack to hand', () => {
      const c1 = { id: 'c1', name: 'C1', type: 'magic' };
      const c2 = { id: 'c2', name: 'C2', type: 'potion' };
      const state = makeState({ backpackItems: [c1, c2] as any, handCards: [] });
      const result = reduce(state, { type: 'APPLY_MONSTER_REWARD', rewardType: 'drawBackpack', amount: 1 });
      expect(result.state.handCards).toHaveLength(1);
      expect(result.state.backpackItems).toHaveLength(1);
    });
  });

  // =========================================================================
  // Phase 5C: DELETE_CARD
  // =========================================================================

  describe('DELETE_CARD', () => {
    it('removes card from hand and sends to graveyard', () => {
      const c1 = { id: 'c1', name: 'C1', type: 'magic' as const, value: 0 };
      const c2 = { id: 'c2', name: 'C2', type: 'potion' as const, value: 0 };
      const state = makeState({ handCards: [c1, c2] as any, discardedCards: [] });
      const result = reduce(state, {
        type: 'DELETE_CARD', cardId: 'c1', source: 'hand', destination: 'graveyard',
      });
      expect(result.state.handCards).toHaveLength(1);
      expect((result.state.handCards as any)[0].id).toBe('c2');
      expect(result.state.discardedCards).toHaveLength(1);
    });

    it('removes card from backpack and sends to recycleBag', () => {
      const c1 = { id: 'bp1', name: 'BP', type: 'magic' as const, value: 0, recycleDelay: 2 };
      const state = makeState({ backpackItems: [c1] as any, permanentMagicRecycleBag: [] });
      const result = reduce(state, {
        type: 'DELETE_CARD', cardId: 'bp1', source: 'backpack', destination: 'recycleBag',
      });
      expect(result.state.backpackItems).toHaveLength(0);
      expect(result.state.permanentMagicRecycleBag).toHaveLength(1);
    });

    it('removes equipment and promotes from reserve', () => {
      const w = { id: 'w1', type: 'weapon' as const, name: 'Sword', value: 5 };
      const r = { id: 'r1', type: 'weapon' as const, name: 'Axe', value: 3 };
      const state = makeState({
        equipmentSlot1: w as any,
        equipmentSlot1Reserve: [r] as any,
        discardedCards: [],
      });
      const result = reduce(state, {
        type: 'DELETE_CARD', cardId: 'w1', source: 'equipment', destination: 'graveyard',
      });
      expect((result.state.equipmentSlot1 as any)?.id).toBe('r1');
      expect(result.state.equipmentSlot1Reserve).toHaveLength(0);
      expect(result.state.discardedCards).toHaveLength(1);
    });

    it('removes amulet and reverses aura effects', () => {
      const a = { id: 'a1', name: 'Str', amuletEffect: 'strength' };
      const state = makeState({
        amuletSlots: [a] as any,
        slotTempAttack: { equipmentSlot1: 10, equipmentSlot2: 10 },
        discardedCards: [],
      });
      const result = reduce(state, {
        type: 'DELETE_CARD', cardId: 'a1', source: 'amulet', destination: 'graveyard',
      });
      expect(result.state.amuletSlots).toHaveLength(0);
      expect(result.state.slotTempAttack.equipmentSlot1).toBe(6);
      expect(result.state.slotTempAttack.equipmentSlot2).toBe(6);
    });

    it('returns noChange for non-existent card', () => {
      const state = makeState({ handCards: [] });
      const result = reduce(state, {
        type: 'DELETE_CARD', cardId: 'missing', source: 'hand', destination: 'graveyard',
      });
      expect(result.state).toBe(state);
    });
  });

  describe('APPLY_EVENT_EFFECT (Phase 1A tokens)', () => {
    it('slotLeftDurMax+1 increases max durability of left slot equipment', () => {
      const weapon = { id: 'w1', name: 'Sword', type: 'weapon' as const, value: 5, durability: 2, maxDurability: 3 };
      const state = makeState({ equipmentSlot1: weapon as any });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'slotLeftDurMax+1' });
      expect((result.state.equipmentSlot1 as any).maxDurability).toBe(4);
      expect((result.state.equipmentSlot1 as any).durability).toBe(2);
    });

    it('slotRightDurMax+1 increases max durability of right slot equipment', () => {
      const shield = { id: 's1', name: 'Shield', type: 'shield' as const, value: 3, durability: 1, maxDurability: 2 };
      const state = makeState({ equipmentSlot2: shield as any });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'slotRightDurMax+1' });
      expect((result.state.equipmentSlot2 as any).maxDurability).toBe(3);
    });

    it('repairSlot:left restores durability', () => {
      const weapon = { id: 'w1', name: 'Sword', type: 'weapon' as const, value: 5, durability: 1, maxDurability: 3 };
      const state = makeState({ equipmentSlot1: weapon as any });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'repairSlot:left:2' });
      expect((result.state.equipmentSlot1 as any).durability).toBe(3);
    });

    it('repairSlot:both repairs both slots', () => {
      const w = { id: 'w1', name: 'Sword', type: 'weapon' as const, value: 5, durability: 1, maxDurability: 3 };
      const s = { id: 's1', name: 'Shield', type: 'shield' as const, value: 3, durability: 0, maxDurability: 2 };
      const state = makeState({ equipmentSlot1: w as any, equipmentSlot2: s as any });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'repairSlot:both:1' });
      expect((result.state.equipmentSlot1 as any).durability).toBe(2);
      expect((result.state.equipmentSlot2 as any).durability).toBe(1);
    });

    it('slotLeftExtraAttack sets gambit flags', () => {
      const weapon = { id: 'w1', name: 'Sword', type: 'weapon' as const, value: 5 };
      const state = makeState({
        equipmentSlot1: weapon as any,
        gambitExtraActive: false,
        gambitExtraPerSlot: 0,
        gambitSlotUsed: {},
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'slotLeftExtraAttack' });
      expect(result.state.gambitExtraActive).toBe(true);
      expect(result.state.gambitExtraPerSlot).toBe(1);
      expect((result.state.gambitSlotUsed as any).equipmentSlot2).toBe(1);
    });

    it('weaponUpgrade increases weapon value by 2', () => {
      const weapon = { id: 'w1', name: 'Sword', type: 'weapon' as const, value: 5 };
      const state = makeState({ equipmentSlot1: weapon as any });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'weaponUpgrade' });
      expect((result.state.equipmentSlot1 as any).value).toBe(7);
    });

    it('shieldUpgrade2 increases shield value and armorMax by 2', () => {
      const shield = { id: 's1', name: 'Shield', type: 'shield' as const, value: 3, armorMax: 3 };
      const state = makeState({ equipmentSlot2: shield as any });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'shieldUpgrade2' });
      expect((result.state.equipmentSlot2 as any).value).toBe(5);
      expect((result.state.equipmentSlot2 as any).armorMax).toBe(5);
    });

    it('restoreShield equips last shield from graveyard to empty slot', () => {
      const shield = { id: 's1', name: 'Iron Shield', type: 'shield' as const, value: 4, armorMax: 4 };
      const state = makeState({
        equipmentSlot1: null,
        equipmentSlot2: null,
        discardedCards: [shield] as any,
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'restoreShield' });
      expect((result.state.equipmentSlot1 as any)?.name).toBe('Iron Shield');
      expect((result.state.equipmentSlot1 as any)?.durability).toBe(3);
      expect(result.state.discardedCards).toHaveLength(0);
    });

    it('bloodEmpower increases first weapon value by 2 or gives gold', () => {
      const weapon = { id: 'w1', name: 'Sword', type: 'weapon' as const, value: 5 };
      const state = makeState({ equipmentSlot1: weapon as any, gold: 10 });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'bloodEmpower' });
      expect((result.state.equipmentSlot1 as any).value).toBe(7);

      const stateNoWeapon = makeState({ equipmentSlot1: null, equipmentSlot2: null, gold: 10 });
      const result2 = reduce(stateNoWeapon, { type: 'APPLY_EVENT_EFFECT', token: 'bloodEmpower' });
      expect(result2.state.gold).toBe(15);
    });

    it('equipKnight equips random weapon/shield from classDeck to empty slot', () => {
      const sword = { id: 'sw1', name: 'Knight Sword', type: 'weapon' as const, value: 6 };
      const state = makeState({
        classDeck: [sword] as any,
        equipmentSlot1: null,
        equipmentSlot2: null,
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'equipKnight' });
      expect((result.state.equipmentSlot1 as any)?.name).toBe('Knight Sword');
      // Class pool is an infinite template — equipKnight clones the picked
      // equipment, the template itself is preserved.
      expect(result.state.classDeck).toHaveLength(1);
    });

    it('discardCurrentLeftForGold+15 sacrifices left slot for 15 gold', () => {
      const weapon = { id: 'w1', name: 'Sword', type: 'weapon' as const, value: 5 };
      const state = makeState({
        equipmentSlot1: weapon as any,
        equipmentSlot1Reserve: [],
        gold: 10,
        discardedCards: [],
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'discardCurrentLeftForGold+15' });
      expect(result.state.equipmentSlot1).toBeNull();
      expect(result.state.gold).toBe(25);
      const disposeActions = result.enqueuedActions.filter(a => a.type === 'DISPOSE_EQUIPMENT_CARD');
      expect(disposeActions).toHaveLength(1);
    });

    it('discardCurrentLeftForGold+15 promotes from reserve', () => {
      const weapon = { id: 'w1', name: 'Sword', type: 'weapon' as const, value: 5 };
      const reserve = { id: 'r1', name: 'Axe', type: 'weapon' as const, value: 3 };
      const state = makeState({
        equipmentSlot1: weapon as any,
        equipmentSlot1Reserve: [reserve] as any,
        gold: 0,
        discardedCards: [],
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'discardCurrentLeftForGold+15' });
      expect((result.state.equipmentSlot1 as any)?.id).toBe('r1');
      expect(result.state.equipmentSlot1Reserve).toHaveLength(0);
      expect(result.state.gold).toBe(15);
    });

    it('discardAllLeftForGold+10 sacrifices all left slot items', () => {
      const weapon = { id: 'w1', name: 'Sword', type: 'weapon' as const, value: 5 };
      const r1 = { id: 'r1', name: 'Axe', type: 'weapon' as const, value: 3 };
      const r2 = { id: 'r2', name: 'Mace', type: 'weapon' as const, value: 4 };
      const state = makeState({
        equipmentSlot1: weapon as any,
        equipmentSlot1Reserve: [r1, r2] as any,
        gold: 5,
        discardedCards: [],
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'discardAllLeftForGold+10' });
      expect(result.state.equipmentSlot1).toBeNull();
      expect(result.state.equipmentSlot1Reserve).toHaveLength(0);
      expect(result.state.gold).toBe(35);
      const disposeActions = result.enqueuedActions.filter(a => a.type === 'DISPOSE_EQUIPMENT_CARD');
      expect(disposeActions).toHaveLength(3);
    });

    it('discardAllLeftForGold+10 triggers last words and revive', () => {
      const weapon = {
        id: 'w1', name: 'HealSword', type: 'weapon' as const, value: 5,
        onDestroyHeal: 3, onDestroyGold: 5,
      };
      const monsterEquip = {
        id: 'm1', name: 'ReviveMonster', type: 'monster' as const, value: 2,
        hasRevive: true, reviveUsed: false, durability: 2, maxDurability: 3,
      };
      const state = makeState({
        equipmentSlot1: weapon as any,
        equipmentSlot1Reserve: [monsterEquip] as any,
        gold: 0,
        discardedCards: [],
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'discardAllLeftForGold+10' });
      // Weapon destroyed (no revive) → +10 gold from altar, last words: +5 gold via MODIFY_GOLD, heal 3 via HEAL
      const disposeActions = result.enqueuedActions.filter(a => a.type === 'DISPOSE_EQUIPMENT_CARD');
      expect(disposeActions).toHaveLength(1);
      const healActions = result.enqueuedActions.filter(a => a.type === 'HEAL');
      expect(healActions).toHaveLength(1);
      expect((healActions[0] as any).amount).toBe(3);
      const goldActions = result.enqueuedActions.filter(a => a.type === 'MODIFY_GOLD');
      expect(goldActions).toHaveLength(1);
      expect((goldActions[0] as any).delta).toBe(5);
      // Monster survived via revive → stays in slot, no gold for it
      expect(result.state.equipmentSlot1).not.toBeNull();
      expect((result.state.equipmentSlot1 as any).id).toBe('m1');
      expect((result.state.equipmentSlot1 as any).durability).toBe(1);
      expect((result.state.equipmentSlot1 as any).reviveUsed).toBe(true);
      // Only 1 item destroyed (weapon) → +10 gold from altar
      expect(result.state.gold).toBe(10);
    });

    it('amuletsToGold+10 converts all amulets to gold', () => {
      const a1 = { id: 'a1', name: 'Amulet1', type: 'amulet' as const, value: 0, amuletEffect: 'none' };
      const a2 = { id: 'a2', name: 'Amulet2', type: 'amulet' as const, value: 0, amuletEffect: 'none' };
      const state = makeState({
        amuletSlots: [a1, a2] as any,
        gold: 10,
        discardedCards: [],
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'amuletsToGold+10' });
      expect(result.state.amuletSlots).toHaveLength(0);
      expect(result.state.gold).toBe(30);
      expect(result.state.discardedCards).toHaveLength(2);
    });
  });

  describe('APPLY_EVENT_EFFECT (Phase 1B tokens)', () => {
    it('knight 永恒铭刻 (perm-grant) opens permGrantModal when 2+ eligible hand cards', () => {
      const eternalInscribe = {
        id: 'knight-perm-1',
        type: 'magic' as const,
        name: '永恒铭刻',
        value: 0,
        magicType: 'instant' as const,
        magicEffect: '即时魔法：选择一张没有 Perm 属性的手牌，赋予 Perm 3。',
        knightEffect: 'perm-grant',
        classCard: true,
      };
      const c1 = { id: 'h1', type: 'magic' as const, name: 'CardA', value: 0, magicType: 'instant' as const };
      const c2 = { id: 'h2', type: 'weapon' as const, name: 'CardB', value: 3 };
      const state = makeState({ handCards: [eternalInscribe, c1, c2] as any });
      // Run through the pipeline so the RESOLVE_MAGIC follow-up is processed
      const drained = drain(state, [{ type: 'PLAY_CARD', cardId: eternalInscribe.id }] as any);
      expect(drained.state.permGrantModal).not.toBeNull();
      expect(drained.state.permGrantModal?.sourceType).toBe('magic');
      expect(drained.state.permGrantModal?.sourceCardId).toBe(eternalInscribe.id);
    });

    it('knight 永恒铭刻 with permanent-magic hand cards still opens modal with banner about no eligible', () => {
      const eternalInscribe = {
        id: 'knight-perm-2',
        type: 'magic' as const,
        name: '永恒铭刻',
        value: 0,
        magicType: 'instant' as const,
        knightEffect: 'perm-grant',
        classCard: true,
      };
      const permA = { id: 'h1', type: 'magic' as const, name: 'PermA', value: 0, magicType: 'permanent' as const };
      const permB = { id: 'h2', type: 'magic' as const, name: 'PermB', value: 0, magicType: 'permanent' as const };
      const state = makeState({ handCards: [eternalInscribe, permA, permB] as any });
      const drained = drain(state, [{ type: 'PLAY_CARD', cardId: eternalInscribe.id }] as any);
      // No eligible cards, so modal shouldn't open and a banner side-effect should be emitted
      expect(drained.state.permGrantModal).toBeNull();
    });

    it('knight 永恒铭刻 via GameBoard drag flow (UPDATE_HAND_CARDS + RESOLVE_MAGIC) opens modal', () => {
      // Mirror the exact dispatch sequence in GameBoard.handleCardToHero for magic cards:
      // 1) consumeCardFromHand → UPDATE_HAND_CARDS removes the card from hand
      // 2) dispatch({ type: 'RESOLVE_MAGIC', cardId, card })
      const eternalInscribe = {
        id: 'knight-perm-3',
        type: 'magic' as const,
        name: '永恒铭刻',
        value: 0,
        magicType: 'instant' as const,
        knightEffect: 'perm-grant',
        classCard: true,
      };
      const c1 = { id: 'h1', type: 'magic' as const, name: 'CardA', value: 0, magicType: 'instant' as const };
      const c2 = { id: 'h2', type: 'weapon' as const, name: 'CardB', value: 3 };
      const state = makeState({ handCards: [eternalInscribe, c1, c2] as any });

      const drained = drain(state, [
        { type: 'UPDATE_HAND_CARDS', updater: (prev: any) => prev.filter((c: any) => c.id !== eternalInscribe.id) },
        { type: 'RESOLVE_MAGIC', cardId: eternalInscribe.id, card: eternalInscribe } as any,
      ] as any);

      expect(drained.state.permGrantModal).not.toBeNull();
      expect(drained.state.permGrantModal?.sourceType).toBe('magic');
      expect(drained.state.permGrantModal?.sourceCardId).toBe(eternalInscribe.id);
    });

    it('knight 凡化咒 (strip-perm-hand) clears all 4 forms of Perm from hand cards', () => {
      const stripCard = {
        id: 'knight-strip-1',
        type: 'magic' as const,
        name: '凡化咒',
        value: 0,
        magicType: 'instant' as const,
        magicEffect: '即时魔法：清除所有手牌的 Perm 属性。',
        knightEffect: 'strip-perm-hand',
        classCard: true,
      };
      const permMagic = {
        id: 'h-pm', type: 'magic' as const, name: 'PermMagic', value: 0,
        magicType: 'permanent' as const,
      };
      const permWeapon = {
        id: 'h-pw', type: 'weapon' as const, name: 'PermWeapon', value: 3,
        permEquipment: true,
      };
      const grantedPermMagic = {
        id: 'h-gp', type: 'magic' as const, name: 'GrantedPerm', value: 0,
        magicType: 'instant' as const,
        recycleDelay: 3,
      };
      const permEvent = {
        id: 'h-pe', type: 'event' as const, name: 'PermEvent', value: 0,
        isPermanentEvent: true,
      };
      const vanilla = {
        id: 'h-v', type: 'magic' as const, name: 'Vanilla', value: 0,
        magicType: 'instant' as const,
      };
      const state = makeState({
        handCards: [stripCard, permMagic, permWeapon, grantedPermMagic, permEvent, vanilla] as any,
      });

      const drained = drain(state, [{ type: 'PLAY_CARD', cardId: stripCard.id }] as any);

      const hand = drained.state.handCards;
      const find = (id: string) => hand.find(c => c.id === id);

      // Source card already removed from hand by PLAY_CARD pipeline
      expect(find(stripCard.id)).toBeUndefined();

      // Permanent magic 保留 magicType（用于法术效果路由），但被打上 permStripped 标记
      expect(find('h-pm')?.magicType).toBe('permanent');
      expect(find('h-pm')?.permStripped).toBe(true);

      // Perm equipment cleared
      expect(find('h-pw')?.permEquipment).toBe(false);
      expect(find('h-pw')?.permStripped).toBe(true);

      // Granted Perm (recycleDelay) cleared
      expect(find('h-gp')?.recycleDelay).toBeUndefined();
      expect(find('h-gp')?.permStripped).toBe(true);

      // Permanent event cleared
      expect(find('h-pe')?.isPermanentEvent).toBe(false);
      expect(find('h-pe')?.permStripped).toBe(true);

      // Vanilla card untouched (same reference, no permStripped flag)
      expect(find('h-v')).toBe(vanilla);
      expect(find('h-v')?.permStripped).toBeUndefined();

      // Banner side-effect emitted with cleaned count
      expect(drained.sideEffects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'ui:banner',
            payload: expect.objectContaining({ text: expect.stringContaining('4 张手牌') }),
          }),
        ]),
      );
    });

    it('knight 凡化咒 with no perm cards in hand emits "no perm" banner', () => {
      const stripCard = {
        id: 'knight-strip-2',
        type: 'magic' as const,
        name: '凡化咒',
        value: 0,
        magicType: 'instant' as const,
        knightEffect: 'strip-perm-hand',
        classCard: true,
      };
      const c1 = { id: 'h1', type: 'magic' as const, name: 'Plain', value: 0, magicType: 'instant' as const };
      const state = makeState({ handCards: [stripCard, c1] as any });

      const drained = drain(state, [{ type: 'PLAY_CARD', cardId: stripCard.id }] as any);

      expect(drained.sideEffects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'ui:banner',
            payload: expect.objectContaining({ text: expect.stringContaining('没有具有 Perm 属性') }),
          }),
        ]),
      );
    });

    it('grantAmuletPerm defers to UI via event:requestEventInteraction (player chooses amulet)', () => {
      const a = { id: 'a1', name: 'TestAmulet', type: 'amulet' as const, value: 0, amuletEffect: 'none' };
      const state = makeState({ amuletSlots: [a] as any });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'grantAmuletPerm' });
      // Token should now emit an interaction request rather than auto-applying.
      expect(result.sideEffects.some(e =>
        e.event === 'event:requestEventInteraction' &&
        (e.payload as { token: string }).token === 'grantAmuletPerm',
      )).toBe(true);
      // The amulet itself should be unchanged at the reducer level — it's the
      // player's modal choice (RESOLVE_PERM_GRANT) that applies recycleDelay.
      expect((result.state.amuletSlots[0] as any).recycleDelay).toBeUndefined();
    });

    it('recycleBagDiscover picks random card from recycle bag to backpack', () => {
      const c = { id: 'r1', name: 'RecycledCard', type: 'magic' as const, value: 0 };
      const state = makeState({
        permanentMagicRecycleBag: [c] as any,
        backpackItems: [],
        backpackCapacityModifier: 0,
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'recycleBagDiscover' });
      expect(result.state.permanentMagicRecycleBag).toHaveLength(0);
      expect(result.state.backpackItems).toHaveLength(1);
    });

    it('recycleBagMagicToHand:2 moves up to 2 magic cards from recycle to hand', () => {
      const m1 = { id: 'm1', name: 'Magic1', type: 'magic' as const, value: 0 };
      const m2 = { id: 'm2', name: 'Magic2', type: 'magic' as const, value: 0 };
      const w = { id: 'w1', name: 'Weapon', type: 'weapon' as const, value: 5 };
      const state = makeState({
        permanentMagicRecycleBag: [m1, w, m2] as any,
        handCards: [],
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'recycleBagMagicToHand:2' });
      expect(result.state.handCards).toHaveLength(2);
      expect(result.state.permanentMagicRecycleBag).toHaveLength(1);
      expect((result.state.permanentMagicRecycleBag[0] as any).id).toBe('w1');
    });

    it('drawClassToHand:2 draws from class deck to hand', () => {
      const c1 = { id: 'c1', name: 'ClassCard1', type: 'magic' as const, value: 0 };
      const c2 = { id: 'c2', name: 'ClassCard2', type: 'magic' as const, value: 0 };
      const c3 = { id: 'c3', name: 'ClassCard3', type: 'magic' as const, value: 0 };
      const state = makeState({
        classDeck: [c1, c2, c3] as any,
        handCards: [],
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'drawClassToHand:2' });
      expect(result.state.handCards).toHaveLength(2);
      // Class pool is an infinite template — drawClassToHand clones the
      // sampled cards into hand, the template is preserved.
      expect(result.state.classDeck).toHaveLength(3);
    });

    it('drawClassHeroMagic:1 draws hero-magic from class deck to backpack', () => {
      const hm = { id: 'hm1', name: 'HeroMagic', type: 'hero-magic' as const, value: 0 };
      const c = { id: 'c1', name: 'Other', type: 'magic' as const, value: 0 };
      const state = makeState({
        classDeck: [c, hm] as any,
        backpackItems: [],
        backpackCapacityModifier: 0,
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'drawClassHeroMagic:1' });
      // Class pool is an infinite template — the hero-magic is cloned into
      // the backpack, the template is preserved.
      expect(result.state.classDeck).toHaveLength(2);
      expect(result.state.backpackItems).toHaveLength(1);
      expect((result.state.backpackItems[0] as any).type).toBe('hero-magic');
    });

    it('recycleToBackpack processes recycle bag and creates guild-recycle card', () => {
      const c = { id: 'r1', name: 'Perm', type: 'magic' as const, value: 0, _recycleWaits: 1 };
      const state = makeState({
        permanentMagicRecycleBag: [c] as any,
        backpackItems: [],
        backpackCapacityModifier: 0,
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'recycleToBackpack' });
      expect(result.state.backpackItems.length).toBeGreaterThanOrEqual(1);
      const hasGuildCard = result.state.backpackItems.some((c: any) => c.name === '回收轮转');
      expect(hasGuildCard).toBe(true);
    });

    it('flipToTwoUpgradeScrolls patches event card flipTarget and pushes 2nd scroll to active stack', () => {
      const eventCard: any = { id: 'evt-药剂遗稿-test', type: 'event', name: '药剂遗稿', value: 0 };
      const state = makeState({
        currentEventCard: eventCard,
        activeCards: [eventCard, null, null, null] as any,
        activeCardStacks: {},
        backpackItems: [],
        backpackCapacityModifier: 0,
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'flipToTwoUpgradeScrolls' });

      // Event card now carries flipTarget pointing at scroll #1 with stay
      const fc = result.state.currentEventCard as any;
      expect(fc?.flipTarget?.destination).toBe('stay');
      expect(fc?.flipTarget?.toCard?.name).toBe('升级卷轴');

      // Second scroll pushed into the slot's stack (LIFO last = next to surface)
      const stack = result.state.activeCardStacks[0] ?? [];
      expect(stack).toHaveLength(1);
      expect((stack[0] as any).name).toBe('升级卷轴');

      // Scroll IDs are distinct
      expect((stack[0] as any).id).not.toBe(fc.flipTarget.toCard.id);

      // Backpack untouched (the flip is in-row, not into backpack)
      expect(result.state.backpackItems).toHaveLength(0);
    });

    it('flipToPaperAsh (药剂遗稿 single-card flip) patches event card flipTarget for stay; backpack untouched', () => {
      const eventCard: any = { id: 'evt-药剂遗稿-paper', type: 'event', name: '药剂遗稿', value: 0 };
      const state = makeState({
        currentEventCard: eventCard,
        activeCards: [null, eventCard, null, null] as any,
        activeCardStacks: {},
        backpackItems: [],
        backpackCapacityModifier: 0,
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'flipToPaperAsh' });

      const fc = result.state.currentEventCard as any;
      expect(fc?.flipTarget?.destination).toBe('stay');
      expect(fc?.flipTarget?.toCard?.name).toBe('纸灰药剂');
      expect(result.state.backpackItems).toHaveLength(0);
    });
  });

  describe('CONVERT_AMULETS_TO_GOLD', () => {
    it('converts all amulets to gold and reverses aura', () => {
      const a1 = { id: 'a1', name: 'Str', type: 'amulet' as const, value: 0, amuletEffect: 'none' };
      const a2 = { id: 'a2', name: 'Def', type: 'amulet' as const, value: 0, amuletEffect: 'none' };
      const state = makeState({
        amuletSlots: [a1, a2] as any,
        gold: 5,
        discardedCards: [],
      });
      const result = reduce(state, { type: 'CONVERT_AMULETS_TO_GOLD', amountPer: 10 });
      expect(result.state.amuletSlots).toHaveLength(0);
      expect(result.state.gold).toBe(25);
      expect(result.state.discardedCards).toHaveLength(2);
    });

    it('returns noChange when no amulets', () => {
      const state = makeState({ amuletSlots: [], gold: 10 });
      const result = reduce(state, { type: 'CONVERT_AMULETS_TO_GOLD', amountPer: 10 });
      expect(result.state).toBe(state);
    });
  });

  describe('DRAW_CLASS_TO_BACKPACK', () => {
    it('draws cards from class deck to backpack', () => {
      const c1 = { id: 'c1', name: 'Card1', type: 'magic' as const, value: 0 };
      const c2 = { id: 'c2', name: 'Card2', type: 'magic' as const, value: 0 };
      const state = makeState({
        classDeck: [c1, c2] as any,
        backpackItems: [],
        backpackCapacityModifier: 0,
      });
      const result = reduce(state, { type: 'DRAW_CLASS_TO_BACKPACK', count: 1 });
      // Class pool is an infinite template — DRAW_CLASS_TO_BACKPACK clones
      // sampled cards into the backpack without consuming the template.
      expect(result.state.classDeck).toHaveLength(2);
      expect(result.state.backpackItems).toHaveLength(1);
    });

    it('filters by card type when filter is set', () => {
      const m = { id: 'm1', name: 'Magic', type: 'magic' as const, value: 0 };
      const hm = { id: 'hm1', name: 'HeroMagic', type: 'hero-magic' as const, value: 0 };
      const state = makeState({
        classDeck: [m, hm] as any,
        backpackItems: [],
        backpackCapacityModifier: 0,
      });
      const result = reduce(state, { type: 'DRAW_CLASS_TO_BACKPACK', count: 1, filter: 'hero-magic' });
      expect(result.state.classDeck).toHaveLength(2);
      expect((result.state.backpackItems[0] as any).type).toBe('hero-magic');
    });

    it('returns noChange when class deck is empty', () => {
      const state = makeState({ classDeck: [], backpackItems: [] });
      const result = reduce(state, { type: 'DRAW_CLASS_TO_BACKPACK', count: 1 });
      expect(result.state).toBe(state);
    });
  });

  // ==========================================================================
  // Phase 7A — Pending-action state machines & UI modal toggles
  // ==========================================================================

  describe('SET_PENDING_MAGIC', () => {
    it('sets pendingMagicAction', () => {
      const state = makeState({ pendingMagicAction: null });
      const payload = { cardId: 'c1', actionType: 'target' as const };
      const result = reduce(state, { type: 'SET_PENDING_MAGIC', payload: payload as any });
      expect(result.state.pendingMagicAction).toEqual(payload);
    });

    it('clears pendingMagicAction with null', () => {
      const state = makeState({ pendingMagicAction: { cardId: 'c1' } as any });
      const result = reduce(state, { type: 'SET_PENDING_MAGIC', payload: null });
      expect(result.state.pendingMagicAction).toBeNull();
    });
  });

  describe('SET_PENDING_POTION', () => {
    it('sets pendingPotionAction', () => {
      const state = makeState({ pendingPotionAction: null });
      const payload = { cardId: 'p1', effectId: 'heal' };
      const result = reduce(state, { type: 'SET_PENDING_POTION', payload: payload as any });
      expect(result.state.pendingPotionAction).toEqual(payload);
    });
  });

  describe('SET_PENDING_HERO_SKILL', () => {
    it('sets pendingHeroSkillAction', () => {
      const state = makeState({ pendingHeroSkillAction: null });
      const payload = { skillId: 's1', requiresTarget: true };
      const result = reduce(state, { type: 'SET_PENDING_HERO_SKILL', payload: payload as any });
      expect(result.state.pendingHeroSkillAction).toEqual(payload);
    });
  });

  describe('SET_PENDING_HERO_MAGIC', () => {
    it('sets pendingHeroMagicAction', () => {
      const state = makeState({ pendingHeroMagicAction: null });
      const payload = { magicId: 'm1', origin: 'gauge' as const };
      const result = reduce(state, { type: 'SET_PENDING_HERO_MAGIC', payload: payload as any });
      expect(result.state.pendingHeroMagicAction).toEqual(payload);
    });
  });

  describe('SET_DEATH_WARD_PROMPT', () => {
    it('sets deathWardPrompt', () => {
      const state = makeState({ deathWardPrompt: null });
      const payload = { slotId: 'equipmentSlot1' as const, damage: 5 };
      const result = reduce(state, { type: 'SET_DEATH_WARD_PROMPT', payload: payload as any });
      expect(result.state.deathWardPrompt).toEqual(payload);
    });
  });

  describe('SET_CARD_ACTION_CONTEXT', () => {
    it('sets cardActionContext', () => {
      const state = makeState({ cardActionContext: null });
      const payload = { cardId: 'c1', action: 'upgrade' };
      const result = reduce(state, { type: 'SET_CARD_ACTION_CONTEXT', payload: payload as any });
      expect(result.state.cardActionContext).toEqual(payload);
    });
  });

  describe('SET_GRAVEYARD_DISCOVER_STATE', () => {
    it('sets graveyardDiscoverState with delivery', () => {
      const state = makeState({ graveyardDiscoverState: null, graveyardDiscoverDelivery: 'backpack' as const });
      const cards = [{ id: 'g1', name: 'GCard' }] as any;
      const result = reduce(state, { type: 'SET_GRAVEYARD_DISCOVER_STATE', payload: cards, delivery: 'hand-first' });
      expect(result.state.graveyardDiscoverState).toEqual(cards);
      expect(result.state.graveyardDiscoverDelivery).toBe('hand-first');
    });
  });

  describe('SET_PERM_GRANT_MODAL', () => {
    it('sets permGrantModal', () => {
      const state = makeState({ permGrantModal: null });
      const payload = { sourceCardId: 'c1', sourceType: 'potion' as const };
      const result = reduce(state, { type: 'SET_PERM_GRANT_MODAL', payload });
      expect(result.state.permGrantModal).toEqual(payload);
    });
  });

  describe('SET_EQUIPMENT_PROMPT', () => {
    it('sets equipmentPrompt', () => {
      const state = makeState({ equipmentPrompt: null });
      const payload = { type: 'equip', cardId: 'e1' };
      const result = reduce(state, { type: 'SET_EQUIPMENT_PROMPT', payload: payload as any });
      expect(result.state.equipmentPrompt).toEqual(payload);
    });
  });

  describe('SET_EVENT_MODAL_OPEN', () => {
    it('opens event modal', () => {
      const state = makeState({ eventModalOpen: false });
      const result = reduce(state, { type: 'SET_EVENT_MODAL_OPEN', open: true });
      expect(result.state.eventModalOpen).toBe(true);
    });
  });

  describe('SET_UPGRADE_MODAL_OPEN', () => {
    it('opens upgrade modal with maxCount', () => {
      const state = makeState({ upgradeModalOpen: false, upgradeModalMaxCount: undefined });
      const result = reduce(state, { type: 'SET_UPGRADE_MODAL_OPEN', open: true, maxCount: 3 });
      expect(result.state.upgradeModalOpen).toBe(true);
      expect(result.state.upgradeModalMaxCount).toBe(3);
    });
  });

  describe('SET_DISCOVER_MODAL', () => {
    it('opens discover modal with options', () => {
      const opts = [{ id: 'd1', name: 'Disc' }] as any;
      const state = makeState({ discoverModalOpen: false, discoverOptions: [], discoverSourceLabel: null });
      const result = reduce(state, { type: 'SET_DISCOVER_MODAL', open: true, options: opts, sourceLabel: 'shop' });
      expect(result.state.discoverModalOpen).toBe(true);
      expect(result.state.discoverOptions).toEqual(opts);
      expect(result.state.discoverSourceLabel).toBe('shop');
    });
  });

  describe('SET_HERO_SKILL_BANNER', () => {
    it('sets heroSkillBanner', () => {
      const state = makeState({ heroSkillBanner: null });
      const result = reduce(state, { type: 'SET_HERO_SKILL_BANNER', message: 'Test banner' });
      expect(result.state.heroSkillBanner).toBe('Test banner');
    });
  });

  describe('SET_GAME_OVER', () => {
    it('sets gameOver and victory', () => {
      const state = makeState({ gameOver: false, victory: false });
      const result = reduce(state, { type: 'SET_GAME_OVER', victory: true });
      expect(result.state.gameOver).toBe(true);
      expect(result.state.victory).toBe(true);
    });
  });

  // ==========================================================================
  // Phase 8B — REGISTER_DUNGEON_CARD_PROCESSED & PROCESS_AUTO_DRAWS
  // ==========================================================================

  describe('REGISTER_DUNGEON_CARD_PROCESSED', () => {
    it('adds cardId to processedDungeonCardIds and increments pendingAutoDrawCount', () => {
      const state = makeState({ processedDungeonCardIds: [], pendingAutoDrawCount: 0, gameOver: false, victory: false });
      const result = reduce(state, { type: 'REGISTER_DUNGEON_CARD_PROCESSED', cardId: 'c1', source: 'slot-cleared' });
      expect(result.state.processedDungeonCardIds).toContain('c1');
      expect(result.state.pendingAutoDrawCount).toBe(1);
    });

    it('no-ops when cardId already processed', () => {
      const state = makeState({ processedDungeonCardIds: ['c1'], pendingAutoDrawCount: 1, gameOver: false, victory: false });
      const result = reduce(state, { type: 'REGISTER_DUNGEON_CARD_PROCESSED', cardId: 'c1', source: 'slot-cleared' });
      expect(result.state).toBe(state);
    });

    it('no-ops when gameOver', () => {
      const state = makeState({ processedDungeonCardIds: [], pendingAutoDrawCount: 0, gameOver: true, victory: false });
      const result = reduce(state, { type: 'REGISTER_DUNGEON_CARD_PROCESSED', cardId: 'c1', source: 'slot-cleared' });
      expect(result.state).toBe(state);
    });
  });

  describe('PROCESS_AUTO_DRAWS', () => {
    it('draws from backpack to hand up to pendingAutoDrawCount', () => {
      const c1 = { id: 'c1', name: 'Card1', type: 'magic' as const, value: 0 };
      const c2 = { id: 'c2', name: 'Card2', type: 'magic' as const, value: 0 };
      const state = makeState({
        pendingAutoDrawCount: 2,
        backpackItems: [c1, c2] as any,
        handCards: [],
        handLimitBonus: 0,
      });
      const result = reduce(state, { type: 'PROCESS_AUTO_DRAWS' });
      expect(result.state.handCards).toHaveLength(2);
      expect(result.state.backpackItems).toHaveLength(0);
      expect(result.state.pendingAutoDrawCount).toBe(0);
    });

    it('stops at hand limit', () => {
      // Hand starts with HAND_LIMIT - 1 cards, backpack has 3, pending = 3 →
      // can only draw 1 before hitting the limit.
      const handFill = HAND_LIMIT - 1;
      const total = handFill + 3;
      const cards = Array.from({ length: total }, (_, i) => ({ id: `c${i}`, name: `Card${i}`, type: 'magic' as const, value: 0 }));
      const state = makeState({
        pendingAutoDrawCount: 3,
        backpackItems: cards.slice(handFill) as any,
        handCards: cards.slice(0, handFill) as any,
        handLimitBonus: 0,
      });
      const result = reduce(state, { type: 'PROCESS_AUTO_DRAWS' });
      expect(result.state.handCards).toHaveLength(HAND_LIMIT);
      expect(result.state.pendingAutoDrawCount).toBe(0);
    });

    it('no-ops when pendingAutoDrawCount is 0', () => {
      const state = makeState({ pendingAutoDrawCount: 0 });
      const result = reduce(state, { type: 'PROCESS_AUTO_DRAWS' });
      expect(result.state).toBe(state);
    });
  });

  describe('PERFORM_HERO_ATTACK — onAttackAmplifyMissileGenerate (魔弹连弩)', () => {
    it('on overkill: amplifies all 魔弹 by 1 and adds a freshly amplified 魔弹 to backpack', () => {
      const weapon = {
        id: 'w-mb', type: 'weapon' as const, name: '魔弹连弩', value: 20,
        durability: 3, maxDurability: 3,
        onAttackAmplifyMissileGenerate: true,
        fromSlot: 'equipmentSlot1' as const,
      };
      const monster = {
        id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5,
        hp: 5, maxHp: 5, attack: 5,
      };
      const handBolt = { id: 'hb', type: 'magic' as const, name: '魔弹', value: 0 };
      const backpackBolt = { id: 'bb', type: 'magic' as const, name: '魔弹', value: 0 };

      const state = makeState({
        equipmentSlot1: weapon as any,
        activeCards: [monster, null, null, null, null] as any,
        handCards: [handBolt] as any,
        backpackItems: [backpackBolt] as any,
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: ['m1'],
          currentTurn: 'hero',
        },
      });

      const drained = drain(state, [
        { type: 'PERFORM_HERO_ATTACK', slotId: 'equipmentSlot1', targetMonsterId: 'm1' },
      ] as any);

      expect(drained.state.amplifiedCardBonus['魔弹']).toBe(1);

      const updatedHandBolt = drained.state.handCards.find(c => c.id === 'hb');
      expect(updatedHandBolt?.amplifyBonus).toBe(1);

      const bolts = drained.state.backpackItems.filter(c => c.name === '魔弹');
      expect(bolts).toHaveLength(2);
      const updatedExisting = bolts.find(c => c.id === 'bb');
      expect(updatedExisting?.amplifyBonus).toBe(1);
      const newBolt = bolts.find(c => c.id !== 'bb');
      expect(newBolt).toBeDefined();
      expect(newBolt?.amplifyBonus).toBe(1);
      expect(newBolt?.knightEffect).toBe('missile-bolt');
    });

    it('on overkill: still adds the spawned 魔弹 to the backpack even when over base capacity (magic cards bypass cap)', () => {
      const weapon = {
        id: 'w-mb', type: 'weapon' as const, name: '魔弹连弩', value: 20,
        durability: 3, maxDurability: 3,
        onAttackAmplifyMissileGenerate: true,
        fromSlot: 'equipmentSlot1' as const,
      };
      const monster = {
        id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5,
        hp: 5, maxHp: 5, attack: 5,
      };
      const fullBackpack = Array.from({ length: 12 }, (_, i) => ({
        id: `bp${i}`, type: 'magic' as const, name: 'Filler', value: 0,
      }));

      const state = makeState({
        equipmentSlot1: weapon as any,
        activeCards: [monster, null, null, null, null] as any,
        backpackItems: fullBackpack as any,
        backpackCapacityModifier: 0,
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: ['m1'],
          currentTurn: 'hero',
        },
      });

      const drained = drain(state, [
        { type: 'PERFORM_HERO_ATTACK', slotId: 'equipmentSlot1', targetMonsterId: 'm1' },
      ] as any);

      const recycledBolt = drained.state.permanentMagicRecycleBag.find(c => c.name === '魔弹');
      expect(recycledBolt).toBeUndefined();

      const newBolt = drained.state.backpackItems.find(c => c.name === '魔弹');
      expect(newBolt).toBeDefined();
      expect(newBolt?.amplifyBonus).toBe(1);

      expect(drained.state.amplifiedCardBonus['魔弹']).toBe(1);
    });

    it('without overkill: does NOT amplify or spawn a new 魔弹', () => {
      const weapon = {
        id: 'w-mb', type: 'weapon' as const, name: '魔弹连弩', value: 1,
        durability: 3, maxDurability: 3,
        onAttackAmplifyMissileGenerate: true,
        fromSlot: 'equipmentSlot1' as const,
      };
      const monster = {
        id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5,
        hp: 10, maxHp: 10, attack: 5,
      };
      const backpackBolt = { id: 'bb', type: 'magic' as const, name: '魔弹', value: 0 };

      const state = makeState({
        equipmentSlot1: weapon as any,
        activeCards: [monster, null, null, null, null] as any,
        backpackItems: [backpackBolt] as any,
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: ['m1'],
          currentTurn: 'hero',
        },
      });

      const drained = drain(state, [
        { type: 'PERFORM_HERO_ATTACK', slotId: 'equipmentSlot1', targetMonsterId: 'm1' },
      ] as any);

      expect(drained.state.amplifiedCardBonus['魔弹'] ?? 0).toBe(0);

      const bolts = drained.state.backpackItems.filter(c => c.name === '魔弹');
      expect(bolts).toHaveLength(1);
      expect(bolts[0].id).toBe('bb');
      expect(bolts[0].amplifyBonus ?? 0).toBe(0);
    });
  });

  describe('哥布林的戏法 — 2-phase animation flow', () => {
    function makeGoblinTrickCard(id = 'gt1') {
      return {
        id,
        type: 'magic' as const,
        name: '哥布林的戏法',
        value: 0,
        magicType: 'permanent' as const,
        recycleDelay: 1,
        description: '使用后将手中所有其他牌洗入背包，再从背包随机抽取相同数量的新牌。',
      };
    }

    it('phase 1 (PLAY_CARD): moves other hand cards to backpack and emits card:goblinTrickShuffled', () => {
      const goblinTrick = makeGoblinTrickCard();
      const handCard1 = { id: 'h1', type: 'magic' as const, name: 'Spell A', value: 0 };
      const handCard2 = { id: 'h2', type: 'potion' as const, name: 'Potion B', value: 3 };
      const backpackCard = { id: 'b1', type: 'magic' as const, name: 'Stored', value: 0 };

      const state = makeState({
        handCards: [goblinTrick, handCard1, handCard2] as any,
        backpackItems: [backpackCard] as any,
      });

      const drained = drain(state, [
        { type: 'PLAY_CARD', cardId: 'gt1' },
      ] as any);

      expect(drained.state.handCards.find(c => c.id === 'h1')).toBeUndefined();
      expect(drained.state.handCards.find(c => c.id === 'h2')).toBeUndefined();

      const backpackIds = drained.state.backpackItems.map(c => c.id);
      expect(backpackIds).toContain('b1');
      expect(backpackIds).toContain('h1');
      expect(backpackIds).toContain('h2');

      const shuffleEvent = drained.sideEffects.find(e => e.event === 'card:goblinTrickShuffled');
      expect(shuffleEvent).toBeDefined();
      const payload = shuffleEvent!.payload as { shuffledCards: any[]; drawCardIds: string[] };
      expect(payload.shuffledCards.map(c => c.id).sort()).toEqual(['h1', 'h2']);
      expect(payload.drawCardIds).toHaveLength(2);
      // All pre-rolled draw ids must reference cards currently still in the backpack.
      payload.drawCardIds.forEach(id => expect(backpackIds).toContain(id));
    });

    it('phase 1 shuffles the entire backpack with the seeded RNG (deterministic)', () => {
      const goblinTrick = makeGoblinTrickCard();
      const handCards = [
        goblinTrick,
        { id: 'h1', type: 'magic', name: 'Spell A', value: 0 },
        { id: 'h2', type: 'magic', name: 'Spell B', value: 0 },
      ];
      const backpackItems = [
        { id: 'b1', type: 'magic', name: 'Stored 1', value: 0 },
        { id: 'b2', type: 'magic', name: 'Stored 2', value: 0 },
        { id: 'b3', type: 'magic', name: 'Stored 3', value: 0 },
      ];

      const rng = createRng(42);
      const state = makeState({
        handCards: handCards as any,
        backpackItems: backpackItems as any,
        rng,
      });

      const drained = drain(state, [
        { type: 'PLAY_CARD', cardId: 'gt1' },
      ] as any);

      // The reducer should produce the same order as a direct shuffle of the
      // washed-back pool with the same seed.
      const otherHand = handCards.slice(1);
      const [expectedShuffled] = rngShuffle([...backpackItems, ...otherHand], rng);
      expect(drained.state.backpackItems.map(c => c.id))
        .toEqual(expectedShuffled.map(c => c.id));

      // And drawCardIds must be the first `count` (=2) of that shuffled order.
      const shuffleEvent = drained.sideEffects.find(e => e.event === 'card:goblinTrickShuffled');
      const payload = shuffleEvent!.payload as { drawCardIds: string[] };
      expect(payload.drawCardIds).toEqual(expectedShuffled.slice(0, 2).map(c => c.id));

      // Sanity: shuffled order is genuinely different from the naive append order
      // for this particular seed (catches a regression to plain concat).
      const naiveAppendOrder = [...backpackItems, ...otherHand].map(c => c.id);
      expect(drained.state.backpackItems.map(c => c.id)).not.toEqual(naiveAppendOrder);
    });

    it('phase 1 short-circuits when no other hand cards exist', () => {
      const goblinTrick = makeGoblinTrickCard();
      const state = makeState({
        handCards: [goblinTrick] as any,
        backpackItems: [],
      });

      const drained = drain(state, [
        { type: 'PLAY_CARD', cardId: 'gt1' },
      ] as any);

      const shuffleEvent = drained.sideEffects.find(e => e.event === 'card:goblinTrickShuffled');
      expect(shuffleEvent).toBeUndefined();
    });

    it('phase 1 ignores curses (cannot be forcibly shuffled)', () => {
      const goblinTrick = makeGoblinTrickCard();
      const curseCard = { id: 'c1', type: 'curse' as const, name: 'Greed Curse', value: 0 };
      const handCard = { id: 'h1', type: 'magic' as const, name: 'Spell', value: 0 };
      const backpackCard = { id: 'b1', type: 'magic' as const, name: 'Stored', value: 0 };

      const state = makeState({
        handCards: [goblinTrick, curseCard, handCard] as any,
        backpackItems: [backpackCard] as any,
      });

      const drained = drain(state, [
        { type: 'PLAY_CARD', cardId: 'gt1' },
      ] as any);

      expect(drained.state.handCards.find(c => c.id === 'c1')).toBeDefined();
      expect(drained.state.handCards.find(c => c.id === 'h1')).toBeUndefined();

      const shuffleEvent = drained.sideEffects.find(e => e.event === 'card:goblinTrickShuffled');
      const payload = shuffleEvent!.payload as { shuffledCards: any[]; drawCardIds: string[] };
      expect(payload.shuffledCards.map(c => c.id)).toEqual(['h1']);
      expect(payload.drawCardIds).toHaveLength(1);
    });

    it('phase 2 (GOBLIN_TRICK_DELIVER): removes draw ids from backpack and emits card:queueToHand for each', () => {
      const drawCard1 = { id: 'd1', type: 'magic' as const, name: 'Drawn A', value: 0 };
      const drawCard2 = { id: 'd2', type: 'potion' as const, name: 'Drawn B', value: 4 };
      const otherCard = { id: 'o1', type: 'magic' as const, name: 'Other', value: 0 };

      const state = makeState({
        handCards: [],
        backpackItems: [drawCard1, otherCard, drawCard2] as any,
      });

      const result = reduce(state, {
        type: 'GOBLIN_TRICK_DELIVER',
        drawCardIds: ['d1', 'd2'],
      });

      // Drawn cards leave the backpack but are NOT placed in hand by the
      // reducer — `card:queueToHand` listeners drive the flight + ensure-in-hand step.
      expect(result.state.backpackItems.map(c => c.id)).toEqual(['o1']);
      expect(result.state.handCards).toEqual([]);

      const queueEvents = result.sideEffects.filter(e => e.event === 'card:queueToHand');
      expect(queueEvents).toHaveLength(2);
      const queuedIds = queueEvents.map(e => (e.payload as any).card.id).sort();
      expect(queuedIds).toEqual(['d1', 'd2']);
    });

    it('phase 2 with empty drawCardIds is a no-op', () => {
      const state = makeState({
        backpackItems: [{ id: 'b1', type: 'magic', name: 'Stored', value: 0 }] as any,
      });
      const result = reduce(state, { type: 'GOBLIN_TRICK_DELIVER', drawCardIds: [] });
      expect(result.state).toBe(state);
      expect(result.sideEffects).toEqual([]);
    });

    it('phase 1 → phase 2 round-trip leaves hand size unchanged when delivery completes', () => {
      const goblinTrick = makeGoblinTrickCard();
      const handCard1 = { id: 'h1', type: 'magic' as const, name: 'Spell A', value: 0 };
      const handCard2 = { id: 'h2', type: 'magic' as const, name: 'Spell B', value: 0 };
      const backpackCard1 = { id: 'b1', type: 'magic' as const, name: 'Stored 1', value: 0 };
      const backpackCard2 = { id: 'b2', type: 'magic' as const, name: 'Stored 2', value: 0 };

      const state = makeState({
        handCards: [goblinTrick, handCard1, handCard2] as any,
        backpackItems: [backpackCard1, backpackCard2] as any,
      });

      const phase1 = drain(state, [
        { type: 'PLAY_CARD', cardId: 'gt1' },
      ] as any);

      const shuffleEvent = phase1.sideEffects.find(e => e.event === 'card:goblinTrickShuffled');
      const drawCardIds = (shuffleEvent!.payload as any).drawCardIds as string[];
      expect(drawCardIds).toHaveLength(2);

      // Simulate the UI hook dispatching phase 2 after the discard flights complete.
      const phase2 = reduce(phase1.state, { type: 'GOBLIN_TRICK_DELIVER', drawCardIds });
      const queuedIds = phase2.sideEffects
        .filter(e => e.event === 'card:queueToHand')
        .map(e => (e.payload as any).card.id);
      expect(queuedIds.sort()).toEqual([...drawCardIds].sort());

      // Backpack ends up with the two original hand cards minus whatever was drawn.
      const backpackIds = phase2.state.backpackItems.map(c => c.id).sort();
      const expectedRemaining = ['h1', 'h2', 'b1', 'b2']
        .filter(id => !drawCardIds.includes(id))
        .sort();
      expect(backpackIds).toEqual(expectedRemaining);
    });
  });
});
