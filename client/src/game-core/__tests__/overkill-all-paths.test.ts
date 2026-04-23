/**
 * Integration tests for ALL overkill effects across all damage paths.
 *
 * Covers:
 *   - Weapon attack (PERFORM_HERO_ATTACK)
 *     - overkill lifesteal heal
 *     - overkillDraw → drawFromBackpack side effect (UI listener draws to hand)
 *     - overkillRecycleToHand → cards moved to hand directly (reducer-side)
 *     - overkillAmplifyMissile → enqueues AMPLIFY_CARDS_BY_NAME
 *   - Spell damage (DEAL_DAMAGE_TO_MONSTER) → overkill lifesteal heal
 *   - Reflect / shield-bash via APPLY_SHIELD_REFLECT path covered separately
 *
 * These tests intentionally exercise the *full* pipeline (drain) so we catch
 * regressions where reducer logic correctly enqueues actions but downstream
 * processing eats them.
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState, HAND_LIMIT } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    ...overrides,
  };
}

const lifeAmulet = () => ({ id: 'a-life', type: 'amulet' as const, name: '生命之符', value: 0, amuletEffect: 'life' });

const goblinHp2 = (id = 'm1') => ({
  id,
  type: 'monster' as const,
  name: 'Goblin',
  value: 1,
  hp: 2,
  maxHp: 2,
  attack: 1,
});

const heroAttackAction = (slotId: 'equipmentSlot1' | 'equipmentSlot2', monsterId: string): GameAction =>
  ({ type: 'PERFORM_HERO_ATTACK', slotId, targetMonsterId: monsterId } as any);

describe('overkill — all paths integration', () => {
  describe('weapon attack (PERFORM_HERO_ATTACK)', () => {
    it('overkill lifesteal: hp increases by lifeOverkillBonus when overkill > 0', () => {
      const weapon = {
        id: 'w', type: 'weapon' as const, name: '巨剑', value: 10,
        durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
      };
      const state = makeState({
        hp: 10,
        equipmentSlot1: weapon as any,
        amuletSlots: [lifeAmulet() as any],
        activeCards: [goblinHp2(), null, null, null, null] as any,
        combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' } as any,
      });
      const drained = drain(state, [heroAttackAction('equipmentSlot1', 'm1')]);
      expect(drained.state.hp).toBe(14);
    });

    it('overkill lifesteal stacks with permanentSpellLifesteal', () => {
      const weapon = {
        id: 'w', type: 'weapon' as const, name: '巨剑', value: 10,
        durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
      };
      const state = makeState({
        hp: 10,
        equipmentSlot1: weapon as any,
        amuletSlots: [lifeAmulet() as any],
        permanentSpellLifesteal: 3,
        activeCards: [goblinHp2(), null, null, null, null] as any,
        combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' } as any,
      });
      const drained = drain(state, [heroAttackAction('equipmentSlot1', 'm1')]);
      expect(drained.state.hp).toBe(17);
    });

    it('NO lifesteal when damage does not overkill', () => {
      const weapon = {
        id: 'w', type: 'weapon' as const, name: '匕首', value: 1,
        durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
      };
      const state = makeState({
        hp: 10,
        equipmentSlot1: weapon as any,
        amuletSlots: [lifeAmulet() as any],
        activeCards: [goblinHp2(), null, null, null, null] as any,
        combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' } as any,
      });
      const drained = drain(state, [heroAttackAction('equipmentSlot1', 'm1')]);
      expect(drained.state.hp).toBe(10);
    });

    it('overkillDraw: emits drawFromBackpack side effect with correct count', () => {
      const weapon = {
        id: 'w', type: 'weapon' as const, name: '试样', value: 10,
        durability: 5, maxDurability: 5, overkillDraw: 1, fromSlot: 'equipmentSlot1' as const,
      };
      const state = makeState({
        equipmentSlot1: weapon as any,
        activeCards: [goblinHp2(), null, null, null, null] as any,
        combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' } as any,
      });
      const drained = drain(state, [heroAttackAction('equipmentSlot1', 'm1')]);
      const evt = drained.sideEffects.find(e => e.event === 'equipment:drawFromBackpack' && (e.payload as any)?.source === 'overkill');
      expect(evt).toBeDefined();
      expect((evt!.payload as any).count).toBe(1);
    });

    it('overkillRecycleToHand: cards actually land in HAND (reducer-side move)', () => {
      const recycledMagic = { id: 'rm1', type: 'magic' as const, name: 'BoltA', value: 0, _recycleWaits: 1 };
      const recycledMagic2 = { id: 'rm2', type: 'magic' as const, name: 'BoltB', value: 0, _recycleWaits: 5 };
      const weapon = {
        id: 'w', type: 'weapon' as const, name: '噬魂猎刃', value: 10,
        durability: 5, maxDurability: 5, overkillRecycleToHand: 2, fromSlot: 'equipmentSlot1' as const,
      };
      const state = makeState({
        equipmentSlot1: weapon as any,
        activeCards: [goblinHp2(), null, null, null, null] as any,
        permanentMagicRecycleBag: [recycledMagic, recycledMagic2] as any,
        handCards: [] as any,
        combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' } as any,
      });
      const drained = drain(state, [heroAttackAction('equipmentSlot1', 'm1')]);
      expect(drained.state.handCards).toHaveLength(2);
      expect(drained.state.permanentMagicRecycleBag).toHaveLength(0);
      // _recycleWaits should be stripped on the cards in hand
      for (const c of drained.state.handCards as any[]) {
        expect(c._recycleWaits).toBeUndefined();
      }
    });

    it('overkillRecycleToHand: respects HAND_LIMIT and overflows to backpack', () => {
      const recycled = (id: string) => ({ id, type: 'magic' as const, name: id, value: 0, _recycleWaits: 1 });
      const weapon = {
        id: 'w', type: 'weapon' as const, name: '噬魂猎刃', value: 10,
        durability: 5, maxDurability: 5, overkillRecycleToHand: 4, fromSlot: 'equipmentSlot1' as const,
      };
      const filledHand = Array.from({ length: HAND_LIMIT - 1 }, (_, i) => ({
        id: `h${i}`, type: 'magic' as const, name: `H${i}`, value: 0,
      }));
      const state = makeState({
        equipmentSlot1: weapon as any,
        activeCards: [goblinHp2(), null, null, null, null] as any,
        permanentMagicRecycleBag: [recycled('rm1'), recycled('rm2'), recycled('rm3'), recycled('rm4')] as any,
        handCards: filledHand as any,
        backpackItems: [] as any,
        combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' } as any,
      });
      const drained = drain(state, [heroAttackAction('equipmentSlot1', 'm1')]);
      expect(drained.state.handCards).toHaveLength(HAND_LIMIT); // hand filled to cap
      expect(drained.state.backpackItems).toHaveLength(3); // 4 picked, 1 to hand, 3 to backpack
      expect(drained.state.permanentMagicRecycleBag).toHaveLength(0);
    });

    it('overkillAmplifyMissile: AMPLIFY_CARDS_BY_NAME applied to live missile cards', () => {
      const missile = { id: 'b1', type: 'magic' as const, name: '魔弹', value: 0 };
      const weapon = {
        id: 'w', type: 'weapon' as const, name: '魔弹冶刃', value: 10,
        durability: 5, maxDurability: 5, overkillAmplifyMissile: 1, fromSlot: 'equipmentSlot1' as const,
      };
      const state = makeState({
        equipmentSlot1: weapon as any,
        activeCards: [goblinHp2(), null, null, null, null] as any,
        handCards: [missile] as any,
        combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' } as any,
      });
      const drained = drain(state, [heroAttackAction('equipmentSlot1', 'm1')]);
      const handMissile = (drained.state.handCards as any[]).find(c => c.id === 'b1');
      expect(handMissile).toBeDefined();
      expect(handMissile.amplifyBonus ?? 0).toBeGreaterThan(0);
    });
  });

  describe('spell damage (DEAL_DAMAGE_TO_MONSTER)', () => {
    it('overkill lifesteal: hp increases when spell overkills', () => {
      const monster = {
        id: 'm1', type: 'monster' as const, name: 'Tank', value: 1,
        hp: 3, maxHp: 10, currentLayer: 1, attack: 1,
      };
      const state = makeState({
        hp: 10,
        amuletSlots: [lifeAmulet() as any],
        activeCards: [monster, null, null, null, null] as any,
      });
      const drained = drain(state, [
        { type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: 'm1', damage: 10, source: 'spell', isSpellDamage: true },
      ] as any);
      expect(drained.state.hp).toBe(14);
    });

    it('NO lifesteal when spell damage does not exceed hp', () => {
      const monster = {
        id: 'm1', type: 'monster' as const, name: 'Tank', value: 1,
        hp: 10, maxHp: 10, currentLayer: 1, attack: 1,
      };
      const state = makeState({
        hp: 10,
        amuletSlots: [lifeAmulet() as any],
        activeCards: [monster, null, null, null, null] as any,
      });
      const drained = drain(state, [
        { type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: 'm1', damage: 5, source: 'spell', isSpellDamage: true },
      ] as any);
      expect(drained.state.hp).toBe(10);
    });
  });

  describe('full INITIATE_WEAPON_ATTACK flow (matches in-game player click)', () => {
    it('life amulet heals on overkill via INITIATE_WEAPON_ATTACK → BEGIN_COMBAT → PERFORM_HERO_ATTACK', () => {
      const weapon = {
        id: 'w', type: 'weapon' as const, name: '巨剑', value: 10,
        durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
      };
      const state = makeState({
        hp: 10,
        equipmentSlot1: weapon as any,
        amuletSlots: [lifeAmulet() as any],
        activeCards: [goblinHp2(), null, null, null, null] as any,
        // Note: NOT engaged — INITIATE_WEAPON_ATTACK enqueues BEGIN_COMBAT first.
        combatState: { ...initialCombatState, currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
      });
      const drained = drain(state, [
        { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm1' } as any,
      ]);
      expect(drained.state.hp).toBe(14);
    });

    it('multi-layer monster: overkill on layer break, life amulet heals', () => {
      // Monster has 2 layers, hp 5 each. Damage 10 → break layer 1 (excess 5 wasted by spec, but overkill = 5).
      const tank = {
        id: 'm1', type: 'monster' as const, name: 'Tank', value: 1,
        hp: 5, maxHp: 5, currentLayer: 2, attack: 1,
      };
      const weapon = {
        id: 'w', type: 'weapon' as const, name: '巨剑', value: 10,
        durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
      };
      const state = makeState({
        hp: 10,
        equipmentSlot1: weapon as any,
        amuletSlots: [lifeAmulet() as any],
        activeCards: [tank, null, null, null, null] as any,
        combatState: { ...initialCombatState, currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
      });
      const drained = drain(state, [
        { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm1' } as any,
      ]);
      expect(drained.state.hp).toBe(14);
      // Tank should still be alive on layer 1, full hp restored.
      const tankAfter = (drained.state.activeCards as any[]).find(c => c?.id === 'm1');
      expect(tankAfter).toBeDefined();
      expect(tankAfter.currentLayer).toBe(1);
      expect(tankAfter.hp).toBe(5);
    });

    it('Holy Light Blade (圣光之刃) + Life Amulet: both heals stack on overkill (hero not at maxHp)', () => {
      // Exact card config from knightDeck.ts line 106 — value 6, healOnAttack 2.
      // INITIAL_HP = 20. Start hero at 5/20 so we have room for both heals.
      const holyBlade = {
        id: 'w', type: 'weapon' as const, name: '圣光之刃', value: 6,
        healOnAttack: 2,
        durability: 2, maxDurability: 2, fromSlot: 'equipmentSlot1' as const,
        classCard: true,
      };
      const state = makeState({
        hp: 5,
        equipmentSlot1: holyBlade as any,
        amuletSlots: [lifeAmulet() as any],
        activeCards: [goblinHp2(), null, null, null, null] as any,
        combatState: { ...initialCombatState, currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
      });
      const drained = drain(state, [
        { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm1' } as any,
      ]);
      // Damage 6 vs hp 2 → overkill 4 (>0). Heals: healOnAttack +2, overkill-lifesteal +4 = +6.
      expect(drained.state.hp).toBe(11);
    });

    it('Holy Light Blade at FULL HP: NO visible heal (capped to maxHp) — common confusion case', () => {
      // INITIAL_HP = 20. Hero at 20/20 → both heals enqueue but clamp to maxHp.
      const holyBlade = {
        id: 'w', type: 'weapon' as const, name: '圣光之刃', value: 6,
        healOnAttack: 2,
        durability: 2, maxDurability: 2, fromSlot: 'equipmentSlot1' as const,
        classCard: true,
      };
      const state = makeState({
        hp: 20,
        equipmentSlot1: holyBlade as any,
        amuletSlots: [lifeAmulet() as any],
        activeCards: [goblinHp2(), null, null, null, null] as any,
        combatState: { ...initialCombatState, currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
      });
      const drained = drain(state, [
        { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm1' } as any,
      ]);
      // Both heals enqueue, but computeHeal sees current hp 20 == maxHp 20 → no actual heal.
      expect(drained.state.hp).toBe(20);
    });

    it('Holy Light Blade at 19/20: heals fire but only +1 visible (clamped at maxHp 20)', () => {
      const holyBlade = {
        id: 'w', type: 'weapon' as const, name: '圣光之刃', value: 6,
        healOnAttack: 2,
        durability: 2, maxDurability: 2, fromSlot: 'equipmentSlot1' as const,
        classCard: true,
      };
      const state = makeState({
        hp: 19,
        equipmentSlot1: holyBlade as any,
        amuletSlots: [lifeAmulet() as any],
        activeCards: [goblinHp2(), null, null, null, null] as any,
        combatState: { ...initialCombatState, currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
      });
      const drained = drain(state, [
        { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm1' } as any,
      ]);
      // healOnAttack +2 first heals 19→20 (only 1 absorbed), then overkill +4 caps at 20.
      // Visible result: hp 20 (a +1 net change, even though +6 was queued).
      expect(drained.state.hp).toBe(20);
    });

    it('overkill log fires even with NO life amulet and NO overkill effect on weapon', () => {
      // Plain weapon, no amulet — overkill log should still appear so the
      // player can see overkill IS happening (diagnostic visibility).
      const plainWeapon = {
        id: 'w', type: 'weapon' as const, name: '巨剑', value: 10,
        durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
      };
      const state = makeState({
        hp: 10,
        equipmentSlot1: plainWeapon as any,
        amuletSlots: [] as any,
        activeCards: [goblinHp2(), null, null, null, null] as any,
        combatState: { ...initialCombatState, currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
      });
      const drained = drain(state, [
        { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm1' } as any,
      ]);
      const overkillLog = drained.sideEffects.find(e =>
        e.event === 'log:entry' && (e.payload as any)?.message?.startsWith('超杀！'),
      );
      expect(overkillLog).toBeDefined();
      expect((overkillLog!.payload as any).message).toContain('巨剑');
      expect((overkillLog!.payload as any).message).toContain('Goblin');
      expect((overkillLog!.payload as any).message).toContain('8');
      expect(drained.state.hp).toBe(10);
    });

    it('overkill log does NOT fire when there is no overkill', () => {
      const dagger = {
        id: 'w', type: 'weapon' as const, name: '匕首', value: 1,
        durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
      };
      const state = makeState({
        hp: 10,
        equipmentSlot1: dagger as any,
        activeCards: [goblinHp2(), null, null, null, null] as any,
        combatState: { ...initialCombatState, currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
      });
      const drained = drain(state, [
        { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm1' } as any,
      ]);
      const overkillLog = drained.sideEffects.find(e =>
        e.event === 'log:entry' && (e.payload as any)?.message?.startsWith('超杀！'),
      );
      expect(overkillLog).toBeUndefined();
    });

    it('exact-kill (no excess) does NOT trigger life amulet', () => {
      const weapon = {
        id: 'w', type: 'weapon' as const, name: '匕首', value: 2,
        durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
      };
      const state = makeState({
        hp: 10,
        equipmentSlot1: weapon as any,
        amuletSlots: [lifeAmulet() as any],
        activeCards: [goblinHp2(), null, null, null, null] as any,
        combatState: { ...initialCombatState, currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
      });
      const drained = drain(state, [
        { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm1' } as any,
      ]);
      // Damage 2 == hp 2, no excess, no overkill, no heal.
      expect(drained.state.hp).toBe(10);
    });
  });

  describe('overkill log on spell damage (no amulet)', () => {
    it('spell overkill log fires even without life amulet', () => {
      const state = makeState({
        hp: 10,
        amuletSlots: [] as any,
        activeCards: [goblinHp2(), null, null, null, null] as any,
        combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' } as any,
      });
      const drained = drain(state, [
        {
          type: 'DEAL_DAMAGE_TO_MONSTER',
          monsterId: 'm1',
          damage: 10,
          source: '魔弹',
          isSpellDamage: true,
        } as any,
      ]);
      const overkillLog = drained.sideEffects.find(e =>
        e.event === 'log:entry' && (e.payload as any)?.message?.startsWith('超杀！'),
      );
      expect(overkillLog).toBeDefined();
      expect((overkillLog!.payload as any).message).toContain('魔弹');
      expect((overkillLog!.payload as any).message).toContain('8');
    });
  });

  describe('reflect damage (APPLY_SHIELD_REFLECT)', () => {
    it('overkill lifesteal: hp increases when reflect overkills', () => {
      const monster = {
        id: 'm1', type: 'monster' as const, name: 'Goblin', value: 1,
        hp: 2, maxHp: 2, currentLayer: 1, attack: 1,
      };
      const state = makeState({
        hp: 10,
        amuletSlots: [lifeAmulet() as any],
        activeCards: [monster, null, null, null, null] as any,
      });
      const drained = drain(state, [
        { type: 'APPLY_SHIELD_REFLECT', monsterId: 'm1', damage: 10, sourceName: '反甲' },
      ] as any);
      expect(drained.state.hp).toBe(14);
    });
  });

  describe('golem layer-loss reflect on weapon attack', () => {
    it('Holy Light Blade overkills 1 golem layer (no kill) → reflect fires', () => {
      // Reproduces the reported bug: 圣光之刃 super-kills one Golem layer,
      // golem survives with another layer left, reflect must fire.
      const golem = {
        id: 'm1', type: 'monster' as const, name: 'Golem', value: 1,
        hp: 4, maxHp: 4, currentLayer: 2, fury: 2, attack: 1,
        golemLayerLossReflect: 2,
      };
      const holyBlade = {
        id: 'w', type: 'weapon' as const, name: '圣光之刃', value: 6,
        healOnAttack: 2,
        durability: 2, maxDurability: 2, fromSlot: 'equipmentSlot1' as const,
        classCard: true,
      };
      const state = makeState({
        hp: 20,
        equipmentSlot1: holyBlade as any,
        activeCards: [golem, null, null, null, null] as any,
        combatState: { ...initialCombatState, currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
      });
      const drained = drain(state, [
        { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm1' } as any,
      ]);
      // Damage 6 vs hp 4 → breaks layer 2 → currentLayer becomes 1 (still alive).
      const golemAfter = (drained.state.activeCards as any[]).find(c => c?.id === 'm1');
      expect(golemAfter).toBeDefined();
      expect(golemAfter.currentLayer).toBe(1);
      // Reflect side effect emitted with coeff 2 × 1 lost layer = 2 damage.
      const reflectFx = drained.sideEffects.find(e => e.event === 'combat:golemReflect');
      expect(reflectFx).toBeDefined();
      expect((reflectFx!.payload as any).damage).toBe(2);
      // healOnAttack +2 then reflect -2 → net 0 on a hero already at 20/20 maxHp:
      // heal clamps, reflect actually subtracts 2.
      expect(drained.state.hp).toBe(18);
    });

    it('weapon kill on golem does NOT trigger reflect (consistent with spell path)', () => {
      const golem = {
        id: 'm1', type: 'monster' as const, name: 'Golem', value: 1,
        hp: 4, maxHp: 4, currentLayer: 1, fury: 2, attack: 1,
        golemLayerLossReflect: 2,
      };
      const blade = {
        id: 'w', type: 'weapon' as const, name: '巨剑', value: 10,
        durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
      };
      const state = makeState({
        hp: 20,
        equipmentSlot1: blade as any,
        activeCards: [golem, null, null, null, null] as any,
        combatState: { ...initialCombatState, currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
      });
      const drained = drain(state, [
        { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm1' } as any,
      ]);
      const reflectFx = drained.sideEffects.find(e => e.event === 'combat:golemReflect');
      expect(reflectFx).toBeUndefined();
      expect(drained.state.hp).toBe(20);
    });

    it('reflect scales with cumulative lost layers (fury baseline)', () => {
      // Golem starts already at 1/3 layers (2 layers already lost). A weapon
      // hit knocks it down to 0 wait — actually we need it to survive, so set
      // up so the next break leaves it at 1. fury=4, currentLayer=3 (1 lost),
      // hp=4. Damage 5 → break to layer 2 (2 layers lost total). Reflect
      // should be 2 × 2 = 4 damage.
      const golem = {
        id: 'm1', type: 'monster' as const, name: 'Golem', value: 1,
        hp: 4, maxHp: 4, currentLayer: 3, fury: 4, attack: 1,
        golemLayerLossReflect: 2,
      };
      const blade = {
        id: 'w', type: 'weapon' as const, name: '匕首', value: 5,
        durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
      };
      const state = makeState({
        hp: 20,
        equipmentSlot1: blade as any,
        activeCards: [golem, null, null, null, null] as any,
        combatState: { ...initialCombatState, currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
      });
      const drained = drain(state, [
        { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm1' } as any,
      ]);
      const reflectFx = drained.sideEffects.find(e => e.event === 'combat:golemReflect');
      expect(reflectFx).toBeDefined();
      expect((reflectFx!.payload as any).damage).toBe(4);
      expect(drained.state.hp).toBe(16);
    });

    it('does not trigger when stunned', () => {
      const golem = {
        id: 'm1', type: 'monster' as const, name: 'Golem', value: 1,
        hp: 4, maxHp: 4, currentLayer: 2, fury: 2, attack: 1,
        golemLayerLossReflect: 2, isStunned: true,
      };
      const blade = {
        id: 'w', type: 'weapon' as const, name: '匕首', value: 5,
        durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
      };
      const state = makeState({
        hp: 20,
        equipmentSlot1: blade as any,
        activeCards: [golem, null, null, null, null] as any,
        combatState: { ...initialCombatState, currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
      });
      const drained = drain(state, [
        { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm1' } as any,
      ]);
      const reflectFx = drained.sideEffects.find(e => e.event === 'combat:golemReflect');
      expect(reflectFx).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Reflect routing through equipped shield armor (dragon-breath-style).
  // 反魔 / 反震 must mirror 龙息: random shield slot eats armor first;
  // if no shield is equipped, damage falls onto tempShield/HP.
  // ---------------------------------------------------------------------------

  describe('reflect routing (shield armor vs HP)', () => {
    it('反震: equipped shield absorbs reflect into armor (HP unchanged, hitSlotId set)', () => {
      const golem = {
        id: 'm1', type: 'monster' as const, name: 'Golem', value: 1,
        hp: 4, maxHp: 4, currentLayer: 2, fury: 2, attack: 1,
        golemLayerLossReflect: 2,
      };
      const blade = {
        id: 'w', type: 'weapon' as const, name: '匕首', value: 5,
        durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
      };
      const shield = {
        id: 's', type: 'shield' as const, name: '木盾', value: 3,
        armor: 5, armorMax: 5, fromSlot: 'equipmentSlot2' as const,
      };
      const state = makeState({
        hp: 20,
        equipmentSlot1: blade as any,
        equipmentSlot2: shield as any,
        activeCards: [golem, null, null, null, null] as any,
        combatState: { ...initialCombatState, currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
      });
      const drained = drain(state, [
        { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm1' } as any,
      ]);
      const reflectFx = drained.sideEffects.find(e => e.event === 'combat:golemReflect');
      expect(reflectFx).toBeDefined();
      // Only one valid shield slot → must be equipmentSlot2.
      expect((reflectFx!.payload as any).hitSlotId).toBe('equipmentSlot2');
      // 2 reflect damage → shield armor 5 → 3.
      expect(((drained.state as any).equipmentSlot2 as any).armor).toBe(3);
      // Hero HP untouched.
      expect(drained.state.hp).toBe(20);
    });

    it('反震: no shield equipped → falls through to HP (hitSlotId null)', () => {
      const golem = {
        id: 'm1', type: 'monster' as const, name: 'Golem', value: 1,
        hp: 4, maxHp: 4, currentLayer: 2, fury: 2, attack: 1,
        golemLayerLossReflect: 2,
      };
      const blade = {
        id: 'w', type: 'weapon' as const, name: '匕首', value: 5,
        durability: 5, maxDurability: 5, fromSlot: 'equipmentSlot1' as const,
      };
      const state = makeState({
        hp: 20,
        equipmentSlot1: blade as any,
        equipmentSlot2: null as any,
        activeCards: [golem, null, null, null, null] as any,
        combatState: { ...initialCombatState, currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
      });
      const drained = drain(state, [
        { type: 'INITIATE_WEAPON_ATTACK', slotId: 'equipmentSlot1', monsterId: 'm1' } as any,
      ]);
      const reflectFx = drained.sideEffects.find(e => e.event === 'combat:golemReflect');
      expect(reflectFx).toBeDefined();
      expect((reflectFx!.payload as any).hitSlotId).toBeNull();
      expect(drained.state.hp).toBe(18);
    });
  });
});
