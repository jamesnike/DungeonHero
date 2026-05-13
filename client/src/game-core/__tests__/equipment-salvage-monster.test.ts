/**
 * 残骸回收符 (equipment-salvage) + 墓园守卫 (last-words-extra-trigger) on
 * monster equipment — extension to support the third equipment family.
 *
 * Pre-existing behavior (covered by other tests):
 *   - Salvage applies to weapon/shield only, monsters fall through to graveyard.
 *   - 墓园守卫's lastWordsExtraTriggerCount loop wraps every iteration of
 *     `applyOneEquipmentLastWordsIteration`, but tests only covered weapon/shield.
 *
 * New behavior (this file pins):
 *   1. Salvage works on monster equipment too — broken monster returns to hand
 *      with durability=1, maxDurability-N (where N = salvage amulet count).
 *   2. salvageReduction PERSISTS through graveyard cycles — even if the salvaged
 *      monster is later equipped, killed, and pulled back from grave (e.g. via
 *      Iron Shield's graveyard-to-hand or boss summon), its cap remains reduced.
 *      This works via `salvageReduction` field tracked on the card and honored
 *      by `applyMonsterRage` (clamps fury/hpLayers/currentLayer to max - reduction).
 *   3. wraith-haunt monster + salvage: BOTH apply — wraith does its 50% swap
 *      (other slot's item moves to my slot), then salvage rescues the broken
 *      wraith back to hand.
 *   4. 墓园守卫 amulet multiplies monster lastWords (discard-hand-3,
 *      skeletonLastWordsDiscard, wraith-haunt damage bonus) the same way it
 *      multiplies weapon/shield lastWords.
 *
 * Per `pipeline-input-continuation.mdc`: tests use `phase: 'playerInput'`.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { computeEquipmentBreakEffects } from '../rules/equipment-effects';
import { resetCardForGraveyard } from '../cards';
import { applyMonsterRage } from '@/lib/monsterRage';
import { createInitialGameState } from '../state';
import { initialCombatState, createEmptyAmuletEffects } from '../constants';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, EquipmentItem, AmuletItem, EquipmentSlotBonusState } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as ActiveRowSlots,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    rng: createRng(42),
    phase: 'playerInput' as any,
    ...overrides,
  };
}

function makeSalvageAmulet(idSuffix = '1'): AmuletItem {
  return {
    id: `a-salv-${idSuffix}`,
    type: 'amulet',
    name: '残骸回收符',
    value: 0,
    image: '',
    amuletEffect: 'equipment-salvage',
  } as unknown as AmuletItem;
}

function makeGraveyardGuardianAmulet(): AmuletItem {
  return {
    id: 'a-guard-1',
    type: 'amulet',
    name: '墓园守卫',
    value: 1,
    image: '',
    amuletEffect: 'last-words-extra-trigger',
  } as unknown as AmuletItem;
}

/**
 * Build a Goblin equipment-form card with the given starting blood layers and
 * `rageTurn` so `applyMonsterRage` (Goblin: base 1, interval 3) reproduces a
 * predictable cap when called later (e.g. on graveyard reset).
 *
 * - rageTurn = 9 → rage rule = 1 + floor(9/3) = 4 layers
 * - durability 0 to trigger the break path immediately.
 */
function makeGoblinEquip(overrides: Partial<GameCardData> = {}): GameCardData {
  return {
    id: 'm-goblin-1',
    type: 'monster',
    name: 'Goblin (equip)',
    monsterType: 'Goblin',
    value: 3,
    image: '',
    attack: 3,
    hp: 3,
    maxHp: 3,
    baseAttack: 3,
    baseHp: 3,
    fury: 4,
    hpLayers: 4,
    currentLayer: 4,
    durability: 0,
    maxDurability: 4,
    rageTurn: 9, // Goblin rage rule: base 1, interval 3 → turn 9 ⇒ 4 layers
    ...overrides,
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// 1. Salvage works on monster equipment
// ---------------------------------------------------------------------------

describe('残骸回收符 + monster equipment — salvage to hand', () => {
  it('non-Perm monster broken with 1 salvage amulet → returns to hand with maxDur -1', () => {
    const goblin = makeGoblinEquip({ maxDurability: 4 });
    const state = makeState({
      equipmentSlot1: goblin as EquipmentItem,
      amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
      handCards: [],
      discardedCards: [],
    });

    const r = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      goblin,
      { ...createEmptyAmuletEffects(), equipmentSalvageCount: 1 },
    );

    expect(r.destroyed).toBe(true);
    expect(r.patch.equipmentSlot1).toBeNull();

    const hand = r.patch.handCards as GameCardData[];
    expect(hand).toBeDefined();
    const salvaged = hand.find(c => c.id === 'm-goblin-1');
    expect(salvaged).toBeDefined();
    expect(salvaged?.type).toBe('monster');
    expect(salvaged?.durability).toBe(1);
    expect(salvaged?.maxDurability).toBe(3);
    // Salvage tracks reduction so future graveyard cycles preserve it.
    expect(salvaged?.salvageReduction).toBe(1);
    // Equipment-form layer fields synced to the new cap.
    expect(salvaged?.fury).toBe(3);
    expect(salvaged?.hpLayers).toBe(3);
    expect(salvaged?.currentLayer).toBe(1);

    // Did NOT enter graveyard.
    expect(r.patch.discardedCards).toBeUndefined();
  });

  it('2 salvage amulets → maxDur -2 in one shot (linear stacking)', () => {
    const goblin = makeGoblinEquip({ maxDurability: 4 });
    const state = makeState({
      equipmentSlot1: goblin as EquipmentItem,
      amuletSlots: [makeSalvageAmulet('1'), makeSalvageAmulet('2'), null, null, null] as any,
    });

    const r = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      goblin,
      { ...createEmptyAmuletEffects(), equipmentSalvageCount: 2 },
    );

    const hand = r.patch.handCards as GameCardData[];
    const salvaged = hand.find(c => c.id === 'm-goblin-1');
    expect(salvaged?.maxDurability).toBe(2);
    expect(salvaged?.durability).toBe(1);
    expect(salvaged?.salvageReduction).toBe(2);
  });

  it('maxDur reaches 0 after salvage → monster removed from game (no hand, no grave)', () => {
    // Single-layer goblin — salvage zeros it out.
    const goblin = makeGoblinEquip({ maxDurability: 1, fury: 1, hpLayers: 1, currentLayer: 1 });
    const state = makeState({
      equipmentSlot1: goblin as EquipmentItem,
      amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
    });

    const r = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      goblin,
      { ...createEmptyAmuletEffects(), equipmentSalvageCount: 1 },
    );

    expect(r.destroyed).toBe(true);
    expect(r.patch.equipmentSlot1).toBeNull();
    // Neither in hand nor in graveyard.
    expect((r.patch.handCards as GameCardData[] | undefined)?.find(c => c.id === 'm-goblin-1')).toBeUndefined();
    expect((r.patch.discardedCards as GameCardData[] | undefined)?.find(c => c.id === 'm-goblin-1')).toBeUndefined();
  });

  it('Perm-flagged monster equipment (recycleDelay > 0) → recycle bag, salvage SKIPPED', () => {
    const permGoblin = makeGoblinEquip({ recycleDelay: 2 });
    const state = makeState({
      equipmentSlot1: permGoblin as EquipmentItem,
      amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
    });

    const r = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      permGoblin,
      { ...createEmptyAmuletEffects(), equipmentSalvageCount: 1 },
    );

    // Goes to recycle bag, NOT salvaged to hand.
    expect(r.enqueuedActions.some(a => a.type === 'ADD_TO_RECYCLE_BAG' && (a as any).card.id === 'm-goblin-1')).toBe(true);
    expect((r.patch.handCards as GameCardData[] | undefined)?.find(c => c.id === 'm-goblin-1')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. salvageReduction persists through graveyard reset
// ---------------------------------------------------------------------------

describe('残骸回收符 — salvageReduction persists through graveyard cycle', () => {
  it('applyMonsterRage with salvageReduction=1 → final cap = ruleOutput - 1', () => {
    const goblin = makeGoblinEquip({
      durability: undefined,
      maxDurability: undefined,
      currentLayer: undefined,
      fury: undefined,
      hpLayers: undefined,
      salvageReduction: 1,
    });

    // Goblin rage at turn 9 = 1 + floor(9/3) = 4 → after -1 reduction = 3.
    const raged = applyMonsterRage(goblin, 9);
    expect(raged.fury).toBe(3);
    expect(raged.hpLayers).toBe(3);
    expect(raged.currentLayer).toBe(3);
  });

  it('applyMonsterRage with salvageReduction >= ruleOutput → clamps to 1 (never below)', () => {
    const baby = makeGoblinEquip({ rageTurn: 1, salvageReduction: 5 });
    // Goblin turn 1 = 1; reduction 5 → clamp to 1.
    const raged = applyMonsterRage(baby, 1);
    expect(raged.fury).toBe(1);
    expect(raged.currentLayer).toBe(1);
  });

  it('full cycle: salvage → goes back to hand → equipped → killed → graveyard reset preserves reduction', () => {
    // Salvage a 4-layer goblin, then put salvaged version through graveyard reset.
    const goblin = makeGoblinEquip({ maxDurability: 4 });
    const state = makeState({
      equipmentSlot1: goblin as EquipmentItem,
      amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
      handCards: [],
    });

    const r = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      goblin,
      { ...createEmptyAmuletEffects(), equipmentSalvageCount: 1 },
    );

    const salvaged = (r.patch.handCards as GameCardData[]).find(c => c.id === 'm-goblin-1')!;
    expect(salvaged.salvageReduction).toBe(1);

    // Now simulate the salvaged goblin being equipped, killed, and going to grave.
    // resetCardForGraveyard runs resetMonsterForGraveyard → applyMonsterRage,
    // which now honors the reduction.
    const inGrave = resetCardForGraveyard(salvaged);
    // currentLayer pinned to 1 by graveyard reset.
    expect(inGrave.currentLayer).toBe(1);
    // Reduction preserved on the card.
    expect(inGrave.salvageReduction).toBe(1);
    // fury / hpLayers reflect the reduced cap (rage rule output 4, minus 1).
    expect(inGrave.fury).toBe(3);
    expect(inGrave.hpLayers).toBe(3);
  });

  it('two consecutive salvages on the same monster accumulate reduction', () => {
    const goblin = makeGoblinEquip({ maxDurability: 4 });
    const state = makeState({
      equipmentSlot1: goblin as EquipmentItem,
      amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
    });

    // First salvage: 4 → 3.
    const r1 = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      goblin,
      { ...createEmptyAmuletEffects(), equipmentSalvageCount: 1 },
    );
    const salvaged1 = (r1.patch.handCards as GameCardData[]).find(c => c.id === 'm-goblin-1')!;
    expect(salvaged1.salvageReduction).toBe(1);
    expect(salvaged1.maxDurability).toBe(3);

    // Equip again (same card), break again — second salvage: 3 → 2.
    const equippedAgain = { ...salvaged1, durability: 0 } as GameCardData;
    const state2 = makeState({
      equipmentSlot1: equippedAgain as EquipmentItem,
      amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
      handCards: [],
    });
    const r2 = computeEquipmentBreakEffects(
      state2,
      'equipmentSlot1',
      equippedAgain,
      { ...createEmptyAmuletEffects(), equipmentSalvageCount: 1 },
    );
    const salvaged2 = (r2.patch.handCards as GameCardData[]).find(c => c.id === 'm-goblin-1')!;
    expect(salvaged2.salvageReduction).toBe(2);
    expect(salvaged2.maxDurability).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 3. wraith-haunt + salvage: both apply
// ---------------------------------------------------------------------------

describe('残骸回收符 + wraith-haunt monster — both effects apply', () => {
  it('wraith swap successful: other item moves to wraith slot AND wraith returns to hand', () => {
    // Use a deterministic seed where nextBool returns true (swap success).
    // We probe a few seeds to find one that gives swapSuccess=true.
    const wraith: GameCardData = {
      id: 'm-wraith-1',
      type: 'monster',
      name: 'Wraith (equip)',
      monsterType: 'Wraith',
      value: 3,
      image: '',
      attack: 3,
      hp: 3,
      maxHp: 3,
      baseAttack: 3,
      baseHp: 3,
      fury: 3,
      hpLayers: 3,
      currentLayer: 3,
      durability: 0,
      maxDurability: 3,
      rageTurn: 6,
      lastWords: 'wraith-haunt-2',
    } as GameCardData;

    const otherShield: GameCardData = {
      id: 's-other',
      type: 'shield',
      name: 'Wooden Shield',
      value: 1,
      image: '',
      durability: 2,
      maxDurability: 2,
      armorMax: 1,
    };

    // Loop until we find a seed that gives wraith swap success (50% bool).
    let r: ReturnType<typeof computeEquipmentBreakEffects> | null = null;
    let foundSwap = false;
    for (let seed = 0; seed < 50 && !foundSwap; seed++) {
      const state = makeState({
        rng: createRng(seed),
        equipmentSlot1: wraith as EquipmentItem,
        equipmentSlot2: otherShield as EquipmentItem,
        amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
        handCards: [],
      });
      r = computeEquipmentBreakEffects(
        state,
        'equipmentSlot1',
        wraith,
        { ...createEmptyAmuletEffects(), equipmentSalvageCount: 1 },
      );
      // Swap success = otherShield moved into equipmentSlot1.
      if ((r.patch.equipmentSlot1 as any)?.id === 's-other') {
        foundSwap = true;
      }
    }
    expect(foundSwap).toBe(true);
    if (!r) throw new Error('no swap found');

    // Wraith was salvaged to hand.
    const hand = r.patch.handCards as GameCardData[];
    const salvagedWraith = hand.find(c => c.id === 'm-wraith-1');
    expect(salvagedWraith).toBeDefined();
    expect(salvagedWraith?.maxDurability).toBe(2); // 3 - 1
    expect(salvagedWraith?.salvageReduction).toBe(1);

    // Other shield was swapped into wraith's slot.
    expect((r.patch.equipmentSlot1 as any)?.id).toBe('s-other');
    // Other slot is cleared (no reserve to promote).
    expect(r.patch.equipmentSlot2).toBeNull();
  });

  it('wraith swap failed (50% miss): wraith still salvaged to hand, other slot untouched', () => {
    const wraith: GameCardData = {
      id: 'm-wraith-1',
      type: 'monster',
      name: 'Wraith (equip)',
      monsterType: 'Wraith',
      value: 3,
      image: '',
      attack: 3,
      hp: 3,
      maxHp: 3,
      baseAttack: 3,
      baseHp: 3,
      fury: 3,
      hpLayers: 3,
      currentLayer: 3,
      durability: 0,
      maxDurability: 3,
      rageTurn: 6,
      lastWords: 'wraith-haunt-2',
    } as GameCardData;

    const otherShield: GameCardData = {
      id: 's-other',
      type: 'shield',
      name: 'Wooden Shield',
      value: 1,
      image: '',
      durability: 2,
      maxDurability: 2,
      armorMax: 1,
    };

    // Probe seeds for swap miss (otherShield stays in slot2).
    let r: ReturnType<typeof computeEquipmentBreakEffects> | null = null;
    let foundMiss = false;
    for (let seed = 0; seed < 50 && !foundMiss; seed++) {
      const state = makeState({
        rng: createRng(seed),
        equipmentSlot1: wraith as EquipmentItem,
        equipmentSlot2: otherShield as EquipmentItem,
        amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
        handCards: [],
      });
      r = computeEquipmentBreakEffects(
        state,
        'equipmentSlot1',
        wraith,
        { ...createEmptyAmuletEffects(), equipmentSalvageCount: 1 },
      );
      // Miss = slot1 cleared (null), slot2 not touched.
      if (r.patch.equipmentSlot1 === null && r.patch.equipmentSlot2 === undefined) {
        foundMiss = true;
      }
    }
    expect(foundMiss).toBe(true);
    if (!r) throw new Error('no miss found');

    // Wraith still salvaged.
    const salvagedWraith = (r.patch.handCards as GameCardData[]).find(c => c.id === 'm-wraith-1');
    expect(salvagedWraith).toBeDefined();
    expect(salvagedWraith?.maxDurability).toBe(2);

    // Other shield untouched.
    expect(r.patch.equipmentSlot2).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. 墓园守卫 multiplies monster lastWords
// ---------------------------------------------------------------------------

describe('墓园守卫 + monster equipment lastWords — multi-trigger', () => {
  it('discard-hand-3 monster: 1 amulet → drawFromBackpack = 6 (3 × 2 triggers)', () => {
    const skeleton: GameCardData = {
      id: 'm-skel-1',
      type: 'monster',
      name: 'Skeleton (equip)',
      monsterType: 'Skeleton',
      value: 3,
      image: '',
      attack: 3,
      hp: 3,
      maxHp: 3,
      baseAttack: 3,
      baseHp: 3,
      fury: 1,
      hpLayers: 1,
      currentLayer: 1,
      durability: 0,
      maxDurability: 1,
      rageTurn: 1,
      lastWords: 'discard-hand-3',
    } as GameCardData;

    const state = makeState({
      equipmentSlot1: skeleton as EquipmentItem,
      handCards: [],
      backpackItems: [],
    });

    const r = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      skeleton,
      { ...createEmptyAmuletEffects(), lastWordsExtraTriggerCount: 1 },
    );

    expect(r.drawFromBackpack).toBe(6); // 3 × (1 base + 1 extra) = 6
  });

  it('skeletonLastWordsDiscard monster: 2 amulets → drawFromBackpack = 3 (1 × 3 triggers)', () => {
    const skeleton: GameCardData = {
      id: 'm-skel-1',
      type: 'monster',
      name: 'Skeleton (equip)',
      monsterType: 'Skeleton',
      value: 1,
      image: '',
      attack: 1,
      hp: 1,
      maxHp: 1,
      baseAttack: 1,
      baseHp: 1,
      fury: 1,
      hpLayers: 1,
      currentLayer: 1,
      durability: 0,
      maxDurability: 1,
      rageTurn: 1,
      skeletonLastWordsDiscard: true,
    } as GameCardData;

    const state = makeState({
      equipmentSlot1: skeleton as EquipmentItem,
      handCards: [],
    });

    const r = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      skeleton,
      { ...createEmptyAmuletEffects(), lastWordsExtraTriggerCount: 2 },
    );

    expect(r.drawFromBackpack).toBe(3); // 1 × (1 base + 2 extra) = 3
  });

  it('wraith-haunt-2 + 1 amulet: damage bonus to other slot = 4 (2 × 2 triggers)', () => {
    const wraith: GameCardData = {
      id: 'm-wraith-1',
      type: 'monster',
      name: 'Wraith (equip)',
      monsterType: 'Wraith',
      value: 1,
      image: '',
      attack: 1,
      hp: 1,
      maxHp: 1,
      baseAttack: 1,
      baseHp: 1,
      fury: 1,
      hpLayers: 1,
      currentLayer: 1,
      durability: 0,
      maxDurability: 1,
      rageTurn: 1,
      lastWords: 'wraith-haunt-2',
    } as GameCardData;

    const otherShield: GameCardData = {
      id: 's-other',
      type: 'shield',
      name: 'Wooden Shield',
      value: 1,
      image: '',
      durability: 1,
      maxDurability: 1,
      armorMax: 1,
    };

    const state = makeState({
      equipmentSlot1: wraith as EquipmentItem,
      equipmentSlot2: otherShield as EquipmentItem,
    });
    const baseDamageBonus = state.equipmentSlotBonuses.equipmentSlot2.damage;

    const r = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      wraith,
      { ...createEmptyAmuletEffects(), lastWordsExtraTriggerCount: 1 },
    );

    const newBonus = (r.patch.equipmentSlotBonuses as EquipmentSlotBonusState | undefined)?.equipmentSlot2.damage
      ?? baseDamageBonus;
    expect(newBonus - baseDamageBonus).toBe(4); // +2 × 2 triggers = 4
  });
});

// ---------------------------------------------------------------------------
// 5. End-to-end: full reducer chain through DISPOSE_EQUIPMENT_CARD
// ---------------------------------------------------------------------------

describe('DISPOSE_EQUIPMENT_CARD + 残骸回收符 + monster equipment — end-to-end', () => {
  it('monster displaced from slot → salvaged to hand with reduced cap', () => {
    const goblin = makeGoblinEquip({ maxDurability: 4 });
    const state = makeState({
      equipmentSlot1: goblin as EquipmentItem,
      amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
      handCards: [],
    });

    const r = reduce(state, {
      type: 'DISPOSE_EQUIPMENT_CARD',
      card: goblin,
      isDestruction: true,
      triggerLastWords: false,
      fromSlotId: 'equipmentSlot1',
    });
    const final = drain(r.state, r.enqueuedActions ?? []).state;

    const salvaged = final.handCards.find(c => c.id === 'm-goblin-1');
    expect(salvaged).toBeDefined();
    expect(salvaged?.type).toBe('monster');
    expect(salvaged?.maxDurability).toBe(3);
    expect(salvaged?.durability).toBe(1);
    expect(salvaged?.salvageReduction).toBe(1);

    // Did NOT enter graveyard.
    expect(final.discardedCards.find(c => c.id === 'm-goblin-1')).toBeUndefined();
  });

  it('end-to-end: 墓园守卫 + 残骸回收符 + wraith-haunt monster → wraith damage bonus 2×, then salvage to hand', () => {
    // wraithDeathHeal-style lastWords don't trigger TRIGGER_MONSTER_SKILL_FLOAT
    // for the heal portion, but wraith-haunt does. Use wraithDeathHeal here
    // so the drain doesn't get stuck on awaitingSkillFloat in tests.
    const wraith: GameCardData = {
      id: 'm-wraith-end',
      type: 'monster',
      name: 'Wraith',
      monsterType: 'Wraith',
      value: 2,
      image: '',
      attack: 2,
      hp: 2,
      maxHp: 2,
      baseAttack: 2,
      baseHp: 2,
      fury: 3,
      hpLayers: 3,
      currentLayer: 3,
      durability: 3,
      maxDurability: 3,
      rageTurn: 6,
      // onDestroyGold is a "boring" lastWords with no skill float — perfect for
      // verifying 墓园守卫 multi-trigger end-to-end.
      onDestroyGold: 5,
    } as GameCardData;

    const state = makeState({
      equipmentSlot1: wraith as EquipmentItem,
      amuletSlots: [makeSalvageAmulet(), makeGraveyardGuardianAmulet(), null, null, null] as any,
      handCards: [],
      gold: 100,
    });

    const r = reduce(state, {
      type: 'DISPOSE_EQUIPMENT_CARD',
      card: wraith,
      isDestruction: true,
      triggerLastWords: true,
      fromSlotId: 'equipmentSlot1',
    });
    const final = drain(r.state, r.enqueuedActions ?? []).state;

    // Wraith salvaged to hand with reduced cap.
    const salvaged = final.handCards.find(c => c.id === 'm-wraith-end');
    expect(salvaged).toBeDefined();
    expect(salvaged?.maxDurability).toBe(2); // 3 - 1
    expect(salvaged?.salvageReduction).toBe(1);

    // 墓园守卫 doubled onDestroyGold lastWords → +5 × 2 = +10 gold.
    expect(final.gold).toBe(110);
  });
});

// ---------------------------------------------------------------------------
// 6. 弃装重铸 (discard-rebuild) magic + 残骸回收符 + monster equipment
// ---------------------------------------------------------------------------
//
// 弃装重铸 (knight:discard-rebuild) 摧毁 equipmentSlot1 / equipmentSlot2 上
// 的所有装备。它有自己的 salvage 实现（`magic-effects.ts:case 'discard-rebuild'`），
// 这是镜像 `computeEquipmentBreakEffects` 的逻辑——必须同样支持怪物装备 salvage，
// 否则会出现「怪物装备被弃装重铸 → 进坟场 (其他路径) vs 怪物装备被破坏 → 回手牌
// (computeEquipmentBreakEffects 路径)」的不一致。

function makeDiscardRebuildCard(idSuffix = 'dr'): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic',
    name: '弃装重铸',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    magicEffect: '摧毁全部装备，按摧毁数依次发现专属牌。',
    description: 'test',
    knightEffect: 'discard-rebuild',
    recycleDelay: 2,
  } as GameCardData;
}

function makeClassCardForDiscover(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: `Class-${id}`,
    value: 0,
    image: '',
    classCard: true,
    magicType: 'instant',
    magicEffect: 'test',
    description: 'class card',
  } as GameCardData;
}

describe('弃装重铸 (discard-rebuild) + 残骸回收符 + monster equipment', () => {
  it('non-Perm monster + 1 salvage amulet → returns to hand with maxDur -1, salvageReduction tracked', () => {
    const drCard = makeDiscardRebuildCard();
    const goblin = makeGoblinEquip({ maxDurability: 4 });
    const state = makeState({
      handCards: [drCard],
      equipmentSlot1: goblin as EquipmentItem,
      equipmentSlot2: null,
      amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
      classDeck: [makeClassCardForDiscover('c1')],
      discardedCards: [],
    });

    const final = drain(state, [{ type: 'PLAY_CARD', cardId: drCard.id } as any]).state;

    expect(final.equipmentSlot1).toBeNull();
    expect(final.discardedCards.find(c => c.id === 'm-goblin-1')).toBeUndefined();

    const salvaged = final.handCards.find(c => c.id === 'm-goblin-1');
    expect(salvaged).toBeDefined();
    expect(salvaged?.type).toBe('monster');
    expect(salvaged?.durability).toBe(1);
    expect(salvaged?.maxDurability).toBe(3);
    expect(salvaged?.salvageReduction).toBe(1);
    expect(salvaged?.fury).toBe(3);
    expect(salvaged?.hpLayers).toBe(3);
    expect(salvaged?.currentLayer).toBe(1);

    expect(final.discoverModalOpen).toBe(true);
    expect(final.discoverSourceLabel).toBe('弃装重铸');
  });

  it('mixed weapon + monster: BOTH salvaged to hand under 1 amulet', () => {
    const drCard = makeDiscardRebuildCard('mix');
    const weapon: GameCardData = {
      id: 'w-mix',
      type: 'weapon',
      name: 'Test Sword',
      value: 2,
      image: '',
      durability: 2,
      maxDurability: 2,
    } as GameCardData;
    const goblin = makeGoblinEquip({ maxDurability: 3 });
    const state = makeState({
      handCards: [drCard],
      equipmentSlot1: weapon as EquipmentItem,
      equipmentSlot2: goblin as EquipmentItem,
      amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
      classDeck: [makeClassCardForDiscover('c1'), makeClassCardForDiscover('c2')],
      discardedCards: [],
    });

    const final = drain(state, [{ type: 'PLAY_CARD', cardId: drCard.id } as any]).state;

    expect(final.equipmentSlot1).toBeNull();
    expect(final.equipmentSlot2).toBeNull();

    const savedWeapon = final.handCards.find(c => c.id === 'w-mix');
    expect(savedWeapon?.maxDurability).toBe(1);
    expect(savedWeapon?.durability).toBe(1);
    expect(savedWeapon?.salvageReduction).toBeUndefined();

    const savedGoblin = final.handCards.find(c => c.id === 'm-goblin-1');
    expect(savedGoblin?.type).toBe('monster');
    expect(savedGoblin?.maxDurability).toBe(2);
    expect(savedGoblin?.durability).toBe(1);
    expect(savedGoblin?.salvageReduction).toBe(1);
    expect(savedGoblin?.fury).toBe(2);
    expect(savedGoblin?.hpLayers).toBe(2);
    expect(savedGoblin?.currentLayer).toBe(1);

    expect(final.discardedCards.find(c => c.id === 'w-mix')).toBeUndefined();
    expect(final.discardedCards.find(c => c.id === 'm-goblin-1')).toBeUndefined();
  });

  it('2 salvage amulets → maxDur drops by 2 in one shot', () => {
    const drCard = makeDiscardRebuildCard('stack');
    const goblin = makeGoblinEquip({ maxDurability: 4 });
    const state = makeState({
      handCards: [drCard],
      equipmentSlot1: goblin as EquipmentItem,
      equipmentSlot2: null,
      amuletSlots: [makeSalvageAmulet('1'), makeSalvageAmulet('2'), null, null, null] as any,
      classDeck: [makeClassCardForDiscover('c1')],
    });

    const final = drain(state, [{ type: 'PLAY_CARD', cardId: drCard.id } as any]).state;

    const salvaged = final.handCards.find(c => c.id === 'm-goblin-1');
    expect(salvaged?.maxDurability).toBe(2);
    expect(salvaged?.salvageReduction).toBe(2);
    expect(salvaged?.fury).toBe(2);
    expect(salvaged?.hpLayers).toBe(2);
  });

  it('monster maxDur reaches 0 after salvage → removed from game (no hand, no graveyard)', () => {
    const drCard = makeDiscardRebuildCard('zero');
    const baby = makeGoblinEquip({
      maxDurability: 1,
      durability: 1,
      fury: 1,
      hpLayers: 1,
      currentLayer: 1,
    });
    const state = makeState({
      handCards: [drCard],
      equipmentSlot1: baby as EquipmentItem,
      equipmentSlot2: null,
      amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
      classDeck: [makeClassCardForDiscover('c1')],
    });

    const final = drain(state, [{ type: 'PLAY_CARD', cardId: drCard.id } as any]).state;

    expect(final.equipmentSlot1).toBeNull();
    expect(final.handCards.find(c => c.id === 'm-goblin-1')).toBeUndefined();
    expect(final.discardedCards.find(c => c.id === 'm-goblin-1')).toBeUndefined();
  });

  it('Perm-flagged monster (recycleDelay > 0) → recycle bag, salvage SKIPPED', () => {
    const drCard = makeDiscardRebuildCard('perm');
    const permGoblin = makeGoblinEquip({ recycleDelay: 2 });
    const state = makeState({
      handCards: [drCard],
      equipmentSlot1: permGoblin as EquipmentItem,
      equipmentSlot2: null,
      amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
      classDeck: [makeClassCardForDiscover('c1')],
    });

    const final = drain(state, [{ type: 'PLAY_CARD', cardId: drCard.id } as any]).state;

    expect(final.equipmentSlot1).toBeNull();
    expect(final.permanentMagicRecycleBag.find(c => c.id === 'm-goblin-1')).toBeDefined();
    expect(final.handCards.find(c => c.id === 'm-goblin-1')).toBeUndefined();
    expect(final.discardedCards.find(c => c.id === 'm-goblin-1')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7. lastWords trigger BEFORE salvage zeros out maxDur (vanish path)
// ---------------------------------------------------------------------------
//
// 用户报告："耐久 1 的装备/怪物装备 + 残骸回收符 销毁时，遗言应该先触发，
// 然后再 maxDur-1 让它消失。"
//
// 实测：当前代码 `computeEquipmentBreakEffects` 已经把 lastWords 循环放在
// salvage 计算之前（equipment-effects.ts L940-960 lastWords loop → L1066-1080
// salvage check）。这一节测试把"先 lastWords 后消失"的顺序作为不变量锁住，
// 覆盖全部 4 条销毁路径（自然破损 + 顶替 + 弃装重铸 magic + RESOLVE_BLOCK），
// 防止未来重构时把顺序搞反。

describe('残骸回收符 + maxDur=1 — lastWords FIRES before vanish (4 paths)', () => {
  // -------------------------------------------------------------------------
  // P1: combat tick 自然破损 → computeEquipmentBreakEffects
  // -------------------------------------------------------------------------
  describe('P1: 自然破损 (computeEquipmentBreakEffects)', () => {
    it('weapon maxDur=1 + onDestroyDraw=2 + 1 salvage → drawFromBackpack=2, weapon vanishes', () => {
      const weapon: GameCardData = {
        id: 'w-vanish-1',
        type: 'weapon',
        name: '消失之刃',
        value: 3,
        image: '',
        durability: 0,
        maxDurability: 1,
        onDestroyDraw: 2,
      } as GameCardData;
      const state = makeState({
        equipmentSlot1: weapon as EquipmentItem,
        amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
        backpackItems: [],
      });

      const r = computeEquipmentBreakEffects(
        state,
        'equipmentSlot1',
        weapon,
        { ...createEmptyAmuletEffects(), equipmentSalvageCount: 1 },
      );

      expect(r.destroyed).toBe(true);
      expect(r.drawFromBackpack).toBe(2);
      expect(r.patch.equipmentSlot1).toBeNull();
      expect((r.patch.handCards as GameCardData[] | undefined)?.find(c => c.id === 'w-vanish-1')).toBeUndefined();
      expect((r.patch.discardedCards as GameCardData[] | undefined)?.find(c => c.id === 'w-vanish-1')).toBeUndefined();
    });

    it('shield maxDur=1 + onDestroyClassDraw=1 + 1 salvage → classCardDraw=1, shield vanishes', () => {
      const shield: GameCardData = {
        id: 'heavy-shield-1',
        type: 'shield',
        name: 'Heavy Shield',
        value: 4,
        image: '',
        durability: 0,
        maxDurability: 1,
        armorMax: 4,
        damageReflect: 1,
        onDestroyClassDraw: 1,
      } as GameCardData;
      const state = makeState({
        equipmentSlot1: shield as EquipmentItem,
        amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
      });

      const r = computeEquipmentBreakEffects(
        state,
        'equipmentSlot1',
        shield,
        { ...createEmptyAmuletEffects(), equipmentSalvageCount: 1 },
      );

      expect(r.destroyed).toBe(true);
      expect(r.classCardDraw).toBe(1);
      expect(r.patch.equipmentSlot1).toBeNull();
      expect((r.patch.handCards as GameCardData[] | undefined)?.find(c => c.id === 'heavy-shield-1')).toBeUndefined();
    });

    it('monster equipment maxDur=1 (1 layer) + onDestroyDraw=2 + 1 salvage → drawFromBackpack=2, monster vanishes', () => {
      const monster = makeGoblinEquip({
        id: 'm-vanish-mon',
        maxDurability: 1,
        fury: 1,
        hpLayers: 1,
        currentLayer: 1,
        rageTurn: 1,
        onDestroyDraw: 2,
      });
      const state = makeState({
        equipmentSlot1: monster as EquipmentItem,
        amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
      });

      const r = computeEquipmentBreakEffects(
        state,
        'equipmentSlot1',
        monster,
        { ...createEmptyAmuletEffects(), equipmentSalvageCount: 1 },
      );

      expect(r.destroyed).toBe(true);
      expect(r.drawFromBackpack).toBe(2);
      expect(r.patch.equipmentSlot1).toBeNull();
      expect((r.patch.handCards as GameCardData[] | undefined)?.find(c => c.id === 'm-vanish-mon')).toBeUndefined();
      expect((r.patch.discardedCards as GameCardData[] | undefined)?.find(c => c.id === 'm-vanish-mon')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // P2: DISPOSE_EQUIPMENT_CARD 顶替路径 (triggerLastWords:true)
  // -------------------------------------------------------------------------
  describe('P2: DISPOSE_EQUIPMENT_CARD 顶替 (triggerLastWords:true)', () => {
    it('weapon maxDur=1 + onDestroyGold=10 → gold +10, weapon vanishes', () => {
      const weapon: GameCardData = {
        id: 'w-displace-1',
        type: 'weapon',
        name: '顶替之刃',
        value: 3,
        image: '',
        durability: 1,
        maxDurability: 1,
        onDestroyGold: 10,
      } as GameCardData;
      const state = makeState({
        equipmentSlot1: weapon as EquipmentItem,
        amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
        gold: 100,
        handCards: [],
      });

      const r = reduce(state, {
        type: 'DISPOSE_EQUIPMENT_CARD',
        card: weapon,
        isDestruction: true,
        triggerLastWords: true,
        fromSlotId: 'equipmentSlot1',
      });
      const final = drain(r.state, r.enqueuedActions ?? []).state;

      expect(final.gold).toBe(110);
      expect(final.handCards.find(c => c.id === 'w-displace-1')).toBeUndefined();
      expect(final.discardedCards.find(c => c.id === 'w-displace-1')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // P3: 弃装重铸 magic (PLAY_CARD chain)
  // -------------------------------------------------------------------------
  describe('P3: 弃装重铸 magic (PLAY_CARD chain)', () => {
    it('weapon maxDur=1 + onDestroyGold=20 + 1 salvage → gold +20, weapon vanishes', () => {
      const drCard = makeDiscardRebuildCard('vanish');
      const weapon: GameCardData = {
        id: 'w-rebuild-1',
        type: 'weapon',
        name: '重铸之刃',
        value: 3,
        image: '',
        durability: 1,
        maxDurability: 1,
        onDestroyGold: 20,
      } as GameCardData;
      const state = makeState({
        handCards: [drCard],
        equipmentSlot1: weapon as EquipmentItem,
        equipmentSlot2: null,
        amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
        classDeck: [makeClassCardForDiscover('c1')],
        gold: 100,
      });

      const final = drain(state, [{ type: 'PLAY_CARD', cardId: drCard.id } as any]).state;

      expect(final.gold).toBe(120);
      expect(final.equipmentSlot1).toBeNull();
      expect(final.handCards.find(c => c.id === 'w-rebuild-1')).toBeUndefined();
      expect(final.discardedCards.find(c => c.id === 'w-rebuild-1')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // P4: Heavy Shield + RESOLVE_BLOCK (用户报告的实际游戏路径)
  // -------------------------------------------------------------------------
  describe('P4: Heavy Shield + RESOLVE_BLOCK (用户报告路径)', () => {
    it('Heavy Shield (1/1) + 残骸回收符 + 格挡 5-attack monster → equipment:classCardDraw fired, shield vanishes', () => {
      const shield: GameCardData = {
        id: 'heavy-shield-1',
        type: 'shield',
        name: 'Heavy Shield',
        value: 4,
        image: '',
        durability: 1,
        maxDurability: 1,
        armorMax: 4,
        damageReflect: 1,
        onDestroyClassDraw: 1,
      } as GameCardData;
      const monster: GameCardData = {
        id: 'mon-attacker-1',
        type: 'monster',
        name: '攻击者',
        value: 5,
        hp: 10,
        maxHp: 10,
        attack: 5,
      } as GameCardData;

      const state = makeState({
        equipmentSlot1: shield as EquipmentItem,
        activeCards: [monster, null, null, null, null] as ActiveRowSlots,
        amuletSlots: [makeSalvageAmulet(), null, null, null, null] as any,
        classDeck: [
          makeClassCardForDiscover('c1'),
          makeClassCardForDiscover('c2'),
        ],
        hp: 30,
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: [monster.id],
          currentTurn: 'monster',
          pendingBlock: {
            monsterId: monster.id,
            attackValue: 5,
            monsterName: monster.name,
          },
        },
      });

      const r = reduce(state, {
        type: 'RESOLVE_BLOCK',
        choice: 'shield',
        slotId: 'equipmentSlot1',
      } as any);
      const final = drain(r.state, r.enqueuedActions ?? []).state;

      // Shield gone — neither in slot, hand, nor graveyard.
      expect(final.equipmentSlot1).toBeNull();
      expect(final.handCards.find(c => c.id === 'heavy-shield-1')).toBeUndefined();
      expect(final.discardedCards.find(c => c.id === 'heavy-shield-1')).toBeUndefined();

      // lastWords side effect emitted BEFORE shield vanished — UI listener
      // (GameBoard:1579 useGameEvent('equipment:classCardDraw')) will dispatch
      // DRAW_CLASS_TO_BACKPACK in response.
      const classDrawEvents = r.sideEffects.filter(e => e.event === 'equipment:classCardDraw');
      expect(classDrawEvents.length).toBeGreaterThan(0);
      expect((classDrawEvents[0].payload as any).count).toBe(1);

      // 遗言 banner / log fires too.
      const lastWordsLog = r.sideEffects.find(e =>
        e.event === 'log:entry' &&
        (e.payload as any)?.message?.includes('Heavy Shield 遗言触发！'),
      );
      expect(lastWordsLog).toBeDefined();
    });
  });
});
