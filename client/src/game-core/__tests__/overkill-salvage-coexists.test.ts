/**
 * Regression: weapon overkillRecycleToHand + 残骸回收符 (equipment-salvage amulet)
 * + weapon breaks on the same attack → BOTH effects must apply.
 *
 * Reported bug ("我装备了 残骸回收符，噬魂猎刃 超杀攻击 诅咒碑。噬魂猎刃 确实
 * 回到手上了，但是他的 超杀 效果 没有触发；回收袋少了两张但没来到手上，这
 * 两张牌消失了"):
 *
 *   1. Hero attacks a 诅咒碑 (5 HP building) with 噬魂猎刃 at high attack →
 *      `computeOverkill` returns overflow > 0 → overkillRecycleToHand fires →
 *      `patch.handCards = [...state.handCards, ...recycledCards]`.
 *   2. Same attack consumes the weapon's last durability point → durability tick
 *      calls `computeEquipmentBreakEffects`. With 残骸回收符 equipped,
 *      `equipmentSalvageCount > 0`, salvage path writes
 *      `patch.handCards = [...state.handCards, salvagedWeapon]`. Because the
 *      function's internal `patch` started EMPTY (didn't see the overkill
 *      writes), this read only `state.handCards`. Then `Object.assign(patch,
 *      breakResult.patch)` in `reducePerformHeroAttack` OVERWROTE `patch.handCards`
 *      with `[salvagedWeapon]`, deleting the two overkill cards.
 *   3. Visible symptom: `permanentMagicRecycleBag` is empty (overkill removed
 *      them) but `handCards` only has the weapon — two magic cards vanished.
 *
 * Fix: thread the outer reducer's `patch` into `computeEquipmentBreakEffects`
 * as `initialPatch`, so its local patch starts with the overkill writes already
 * applied. Same fix protects all other `patch.handCards` / `patch.backpackItems`
 * / `patch.gold` writes done before durability tick (lifesteal, drawFromBackpack,
 * etc.).
 *
 * This file also covers PERFORM_SHIELD_BASH which has the parallel bug
 * (stunRecycleToHand writes patch.handCards → bash breaks shield → 残骸回收符
 * salvage overwrites). Same fix covers both.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState, HAND_LIMIT } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput',
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero', heroAttacksRemaining: 2 } as any,
    ...overrides,
  };
}

const salvageAmulet = (): GameCardData =>
  ({
    id: 'a-salvage',
    type: 'amulet',
    name: '残骸回收符',
    value: 0,
    image: '',
    amuletEffect: 'equipment-salvage' as any,
  } as any);

const stunRecycleAmulet = (): GameCardData =>
  ({
    id: 'a-stun-recycle',
    type: 'amulet',
    name: '晕锤归袋符',
    value: 0,
    image: '',
    amuletEffect: 'stun-recycle-to-hand' as any,
  } as any);

// 诅咒碑：5 HP building (matches CARD_POOL_REFERENCE.md).
function makeCursedMonument(id = 'b-curse', hp = 5): GameCardData {
  return {
    id,
    type: 'building' as any,
    name: '诅咒碑',
    value: 0,
    image: '',
    fury: 1,
    hpLayers: 1,
    currentLayer: 1,
    hp,
    maxHp: hp,
  } as GameCardData;
}

function makeMonster(id: string, hp = 8): GameCardData {
  return {
    id,
    type: 'monster' as const,
    name: 'TestMonster',
    value: 0,
    image: '',
    attack: 2,
    hp,
    maxHp: hp,
    baseAttack: 2,
    baseHp: hp,
    fury: 1,
    hpLayers: 1,
    currentLayer: 1,
  } as any;
}

const heroAttackAction = (
  slotId: 'equipmentSlot1' | 'equipmentSlot2',
  targetId: string,
): GameAction =>
  ({ type: 'PERFORM_HERO_ATTACK', slotId, targetMonsterId: targetId } as any);

const shieldBashAction = (
  slotId: 'equipmentSlot1' | 'equipmentSlot2',
  targetId: string,
  diceRoll?: number,
): GameAction =>
  ({ type: 'PERFORM_SHIELD_BASH', slotId, targetMonsterId: targetId, diceRoll } as any);

// ---------------------------------------------------------------------------
// PERFORM_HERO_ATTACK — overkillRecycleToHand + salvage + weapon breaks
// ---------------------------------------------------------------------------

describe('overkillRecycleToHand + 残骸回收符 + weapon breaks on overkill', () => {
  it('user-reported bug: overkill cards land in hand AND weapon salvaged (both effects apply)', () => {
    const recycledA: GameCardData = {
      id: 'rm-A', type: 'magic', name: 'BoltA', value: 0, image: '',
      _recycleWaits: 1,
    } as any;
    const recycledB: GameCardData = {
      id: 'rm-B', type: 'magic', name: 'BoltB', value: 0, image: '',
      _recycleWaits: 1,
    } as any;
    const soulHunter: GameCardData = {
      id: 'w-soul', type: 'weapon', name: '噬魂猎刃', value: 8,
      image: '',
      // durability=1 so this attack will break it
      durability: 1, maxDurability: 3,
      overkillRecycleToHand: 2,
      fromSlot: 'equipmentSlot1' as const,
    } as any;
    const state = makeState({
      equipmentSlot1: soulHunter as any,
      amuletSlots: [salvageAmulet() as any],
      activeCards: [makeCursedMonument('b-curse', 5), null, null, null, null] as any,
      permanentMagicRecycleBag: [recycledA, recycledB] as any,
      handCards: [] as any,
    });

    const drained = drain(state, [heroAttackAction('equipmentSlot1', 'b-curse')]);

    // 1. Overkill log fires (damage 8 - hp 5 = 3 overflow)
    const overkillLog = drained.sideEffects.find(
      e => e.event === 'log:entry' && (e.payload as any)?.message?.startsWith('超杀！'),
    );
    expect(overkillLog).toBeDefined();
    expect((overkillLog!.payload as any).message).toContain('诅咒碑');

    // 2. Two recycled cards lifted out of recycle bag
    expect(drained.state.permanentMagicRecycleBag).toHaveLength(0);

    // 3. ⚠️ Core regression: hand must contain BOTH overkill cards AND the
    // salvaged weapon. Pre-fix this would only contain `w-soul` (salvage
    // overwrote handCards), with rm-A and rm-B vanishing into nothing.
    const handIds = (drained.state.handCards as GameCardData[]).map(c => c.id).sort();
    expect(handIds).toEqual(['rm-A', 'rm-B', 'w-soul'].sort());

    // 4. Salvaged weapon: durability 1, maxDurability decremented by 1 (3 → 2)
    const salvaged = (drained.state.handCards as GameCardData[]).find(c => c.id === 'w-soul');
    expect(salvaged).toBeDefined();
    expect(salvaged?.durability).toBe(1);
    expect(salvaged?.maxDurability).toBe(2);

    // 5. Weapon NOT in graveyard (salvage routes to hand, not grave)
    expect((drained.state.discardedCards as GameCardData[]).find(c => c.id === 'w-soul')).toBeUndefined();

    // 6. Equipment slot 1 cleared
    expect(drained.state.equipmentSlot1).toBeNull();

    // 7. The two recycled cards have their `_recycleWaits` stripped (returned
    // to hand cleanly, not stuck in recycle-bag state).
    for (const c of drained.state.handCards as GameCardData[]) {
      if (c.id === 'rm-A' || c.id === 'rm-B') {
        expect(c._recycleWaits).toBeUndefined();
      }
    }

    // 8. Building destroyed
    expect(drained.sideEffects.some(e => e.event === 'combat:buildingDestroyed')).toBe(true);
  });

  it('salvage exhausts at maxDur=1: weapon removed from game, overkill cards still in hand', () => {
    const recycledA: GameCardData = {
      id: 'rm-A', type: 'magic', name: 'BoltA', value: 0, image: '',
      _recycleWaits: 1,
    } as any;
    const recycledB: GameCardData = {
      id: 'rm-B', type: 'magic', name: 'BoltB', value: 0, image: '',
      _recycleWaits: 1,
    } as any;
    const soulHunter: GameCardData = {
      id: 'w-soul', type: 'weapon', name: '噬魂猎刃', value: 8,
      image: '',
      // maxDurability=1 → salvage will reduce maxDur to 0 → removed from game
      durability: 1, maxDurability: 1,
      overkillRecycleToHand: 2,
      fromSlot: 'equipmentSlot1' as const,
    } as any;
    const state = makeState({
      equipmentSlot1: soulHunter as any,
      amuletSlots: [salvageAmulet() as any],
      activeCards: [makeCursedMonument('b-curse', 5), null, null, null, null] as any,
      permanentMagicRecycleBag: [recycledA, recycledB] as any,
      handCards: [] as any,
    });

    const drained = drain(state, [heroAttackAction('equipmentSlot1', 'b-curse')]);

    // Overkill cards arrived in hand even though salvage removed the weapon
    const handIds = (drained.state.handCards as GameCardData[]).map(c => c.id).sort();
    expect(handIds).toEqual(['rm-A', 'rm-B']);
    expect(drained.state.permanentMagicRecycleBag).toHaveLength(0);

    // Weapon NOT in hand (removed via salvage-exhaustion), NOT in graveyard
    expect((drained.state.handCards as GameCardData[]).find(c => c.id === 'w-soul')).toBeUndefined();
    expect((drained.state.discardedCards as GameCardData[]).find(c => c.id === 'w-soul')).toBeUndefined();
    expect(drained.state.equipmentSlot1).toBeNull();

    // Salvage-exhaustion log present
    expect(drained.sideEffects.some(
      e => e.event === 'log:entry' &&
        (e.payload as any)?.message?.includes('残骸回收符') &&
        (e.payload as any)?.message?.includes('从游戏中移除'),
    )).toBe(true);
  });

  it('control: weapon overkill on building without salvage → overkill cards still land in hand (no regression)', () => {
    const recycledA: GameCardData = {
      id: 'rm-A', type: 'magic', name: 'BoltA', value: 0, image: '',
      _recycleWaits: 1,
    } as any;
    const soulHunter: GameCardData = {
      id: 'w-soul', type: 'weapon', name: '噬魂猎刃', value: 8,
      image: '',
      durability: 1, maxDurability: 3,
      overkillRecycleToHand: 1,
      fromSlot: 'equipmentSlot1' as const,
    } as any;
    const state = makeState({
      equipmentSlot1: soulHunter as any,
      // No amulets — no salvage
      amuletSlots: [],
      activeCards: [makeCursedMonument('b-curse', 5), null, null, null, null] as any,
      permanentMagicRecycleBag: [recycledA] as any,
      handCards: [] as any,
    });

    const drained = drain(state, [heroAttackAction('equipmentSlot1', 'b-curse')]);

    // Overkill card lands in hand
    expect((drained.state.handCards as GameCardData[]).find(c => c.id === 'rm-A')).toBeDefined();
    expect(drained.state.permanentMagicRecycleBag).toHaveLength(0);

    // Weapon broken → graveyard (no salvage)
    expect((drained.state.discardedCards as GameCardData[]).find(c => c.id === 'w-soul')).toBeDefined();
    expect(drained.state.equipmentSlot1).toBeNull();
  });

  it('overkill on a regular monster (not building) + salvage + weapon break: same coexistence', () => {
    // Validates the fix also covers the monster overkill path (different
    // damage flow than building destruction but same break call site).
    const recycledA: GameCardData = {
      id: 'rm-A', type: 'magic', name: 'BoltA', value: 0, image: '',
      _recycleWaits: 1,
    } as any;
    const soulHunter: GameCardData = {
      id: 'w-soul', type: 'weapon', name: '噬魂猎刃', value: 10,
      image: '',
      durability: 1, maxDurability: 3,
      overkillRecycleToHand: 1,
      fromSlot: 'equipmentSlot1' as const,
    } as any;
    const state = makeState({
      equipmentSlot1: soulHunter as any,
      amuletSlots: [salvageAmulet() as any],
      activeCards: [makeMonster('m1', 4), null, null, null, null] as any,
      permanentMagicRecycleBag: [recycledA] as any,
      handCards: [] as any,
    });

    const drained = drain(state, [heroAttackAction('equipmentSlot1', 'm1')]);

    const handIds = (drained.state.handCards as GameCardData[]).map(c => c.id).sort();
    expect(handIds).toEqual(['rm-A', 'w-soul'].sort());
    expect(drained.state.permanentMagicRecycleBag).toHaveLength(0);
  });

  it('full hand + salvage + overkill overflows: no cards vanish (all routed to hand or backpack)', () => {
    // Sanity check: when hand is near-full, overkill's existing overflow
    // routing pushes excess to backpack. Salvage runs after and (today)
    // appends the broken weapon to hand without a HAND_LIMIT check — that
    // pre-existing behaviour is orthogonal to this bug. The invariant we care
    // about: NO card from the recycle bag is silently dropped.
    const recycled = (id: string): GameCardData => ({
      id, type: 'magic' as any, name: id, value: 0, image: '', _recycleWaits: 1,
    } as any);
    const soulHunter: GameCardData = {
      id: 'w-soul', type: 'weapon', name: '噬魂猎刃', value: 10,
      image: '',
      durability: 1, maxDurability: 3,
      overkillRecycleToHand: 3,
      fromSlot: 'equipmentSlot1' as const,
    } as any;
    const fillerHand: GameCardData[] = Array.from({ length: HAND_LIMIT - 1 }, (_, i) => ({
      id: `h${i}`, type: 'magic' as any, name: `H${i}`, value: 0, image: '',
    } as any));
    const state = makeState({
      equipmentSlot1: soulHunter as any,
      amuletSlots: [salvageAmulet() as any],
      activeCards: [makeCursedMonument('b-curse', 5), null, null, null, null] as any,
      permanentMagicRecycleBag: [recycled('rm-A'), recycled('rm-B'), recycled('rm-C')] as any,
      handCards: fillerHand as any,
      backpackItems: [] as any,
    });

    const drained = drain(state, [heroAttackAction('equipmentSlot1', 'b-curse')]);

    // All 3 recycle-bag cards came out
    expect(drained.state.permanentMagicRecycleBag).toHaveLength(0);

    // ⚠️ Core invariant: every recycle-bag card AND the salvaged weapon
    // ended up *somewhere* (hand or backpack). Pre-fix the salvage path
    // would have overwritten patch.handCards, deleting any overkill cards
    // routed there in this same reduce step.
    const allRecovered = [
      ...(drained.state.handCards as GameCardData[]),
      ...(drained.state.backpackItems as GameCardData[]),
    ].map(c => c.id);
    expect(allRecovered).toContain('rm-A');
    expect(allRecovered).toContain('rm-B');
    expect(allRecovered).toContain('rm-C');
    expect(allRecovered).toContain('w-soul');
  });
});

// ---------------------------------------------------------------------------
// PERFORM_SHIELD_BASH — stunRecycleToHand + salvage + shield breaks on bash
// (parallel path, same root-cause fix)
// ---------------------------------------------------------------------------

describe('PERFORM_SHIELD_BASH: stunRecycleToHand + 残骸回收符 + shield breaks', () => {
  it('shield breaks on bash + stun succeeds: salvage AND stun-recycle both apply (no card loss)', () => {
    const recycledA: GameCardData = {
      id: 'rm-A', type: 'magic', name: 'BoltA', value: 0, image: '',
      _recycleWaits: 1,
    } as any;
    // Shield needs shieldBashStunRate > 0 so PERFORM_SHIELD_BASH passes its
    // initial guard, and a baseArmorMax for the effective stun% formula.
    const shield: GameCardData = {
      id: 's1', type: 'shield', name: 'TestShield', value: 5, image: '',
      armorMax: 5, armor: 0,
      durability: 1, maxDurability: 2,
      shieldBashStunRate: 20,  // 20% × armor 5 = 100% stun
      fromSlot: 'equipmentSlot2' as const,
    } as any;
    const state = makeState({
      equipmentSlot2: shield as any,
      amuletSlots: [salvageAmulet() as any, stunRecycleAmulet() as any],
      activeCards: [makeMonster('m1', 5), null, null, null, null] as any,
      permanentMagicRecycleBag: [recycledA] as any,
      handCards: [] as any,
      stunCap: 100,
    });

    // Force stun roll success with diceRoll=1 (always ≤ any threshold ≥ 1).
    const drained = drain(state, [shieldBashAction('equipmentSlot2', 'm1', 1)]);

    // Stun succeeded + shield broke (precondition for the co-fire scenario).
    const stunSucceeded = drained.sideEffects.some(
      e => e.event === 'ui:banner' && (e.payload as any)?.text?.includes('被盾击晕'),
    );
    const shieldDestroyed = drained.state.equipmentSlot2 === null;
    expect(stunSucceeded).toBe(true);
    expect(shieldDestroyed).toBe(true);

    // ⚠️ Regression: hand must contain BOTH the stun-recycled card AND the
    // salvaged shield. Pre-fix, salvage would overwrite stun-recycle's
    // patch.handCards, deleting rm-A.
    const handIds = (drained.state.handCards as GameCardData[]).map(c => c.id).sort();
    expect(handIds).toContain('rm-A');
    expect(handIds).toContain('s1');

    // Salvaged shield: durability 1, maxDurability decremented (2 → 1).
    const salvagedShield = (drained.state.handCards as GameCardData[]).find(c => c.id === 's1');
    expect(salvagedShield?.durability).toBe(1);
    expect(salvagedShield?.maxDurability).toBe(1);

    expect(drained.state.permanentMagicRecycleBag).toHaveLength(0);
  });
});
