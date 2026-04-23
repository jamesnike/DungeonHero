/**
 * Equipment break → graveyard (default routing).
 *
 * Bug: When non-Perm equipment had its durability reduced to 0 in combat
 * (or via monster-doom / discard-rebuild / shield self-damage), it was
 * silently removed from the game — the slot was nulled out but the broken
 * card was NEVER added to `discardedCards`. Per `GAME_MECHANICS.md` §7
 * ("非永久装备损毁 | 弃置 | 坟场") broken equipment must enter the graveyard.
 *
 * The user-visible symptom: 共鸣之刃 (and any other non-Perm class weapon /
 * shield / monster-equipment) broke from durability loss during combat, but
 * never appeared in the graveyard. Effects that depend on the graveyard
 * (e.g. 亡者之契, Iron Shield's pickGraveyardCardExcluding pool) silently
 * lost access to those cards.
 *
 * Fix: in `computeEquipmentBreakEffects`, route the broken self-equipment
 * to either the recycle bag (Perm) or the graveyard (non-Perm) via
 * `routeBrokenSelfToGraveOrRecycle`. The graveyard path uses
 * `resetCardForGraveyard` so weapons/shields come back at full durability
 * and monster equipment resets to currentLayer = 1 (per
 * `monster-graveyard-layer-reset.mdc`).
 *
 * This file covers all 5 reducer paths that invoke computeEquipmentBreakEffects:
 *   1. Combat weapon attack durability tick (rules/combat.ts)
 *   2. Monster doom destroying equipment (rules/hero.ts)
 *   3. Discard-rebuild magic destroying equipment (rules/magic-effects.ts)
 *   4. Shield self-damage (rules/magic-effects.ts soul-swap path)
 *   5. End-to-end PERFORM_HERO_ATTACK on 共鸣之刃 (the user's exact scenario)
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState, createEmptyAmuletEffects } from '../constants';
import { computeEquipmentBreakEffects } from '../rules/equipment-effects';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as ActiveRowSlots,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    rng: createRng(42),
    ...overrides,
  };
}

function makeMonster(id: string, attack: number, hp: number = 1): GameCardData {
  return {
    id,
    type: 'monster',
    name: `Mob-${id}`,
    value: attack,
    image: '',
    hp,
    maxHp: hp,
    attack,
    fury: 1,
    currentLayer: 1,
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// Direct unit tests on computeEquipmentBreakEffects — covers ALL callers
// regardless of which dispatch path triggered the break.
// ---------------------------------------------------------------------------

describe('computeEquipmentBreakEffects — non-Perm equipment routes to graveyard', () => {
  it('weapon broken from durability 0 → enters graveyard with refreshed durability', () => {
    const blade: GameCardData = {
      id: 'w-resonance', type: 'weapon', name: '共鸣之刃', value: 4, image: '',
      durability: 0, maxDurability: 2,
      onAttackBuffOtherSlotTempAttack: 2,
      onAttackRepairOtherSlot: 1,
    };
    const state = makeState({
      equipmentSlot1: blade as EquipmentItem,
      discardedCards: [],
    });

    const result = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      blade,
      createEmptyAmuletEffects(),
    );

    expect(result.destroyed).toBe(true);
    expect(result.patch.equipmentSlot1).toBeNull();

    const grave = result.patch.discardedCards as GameCardData[];
    expect(grave).toBeDefined();
    expect(grave).toHaveLength(1);
    expect(grave[0].id).toBe('w-resonance');
    expect(grave[0].name).toBe('共鸣之刃');
    expect(grave[0].durability).toBe(2);
    expect(grave[0].maxDurability).toBe(2);
  });

  it('shield broken from durability 0 → enters graveyard with armor cleared', () => {
    const shield: GameCardData = {
      id: 's-iron', type: 'shield', name: 'Iron-ish Shield', value: 3, image: '',
      durability: 0, maxDurability: 3, armorMax: 4,
      armor: 0, armorBonusDamaged: 2,
    };
    const state = makeState({
      equipmentSlot1: shield as EquipmentItem,
      discardedCards: [],
    });

    const result = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      shield,
      createEmptyAmuletEffects(),
    );

    expect(result.destroyed).toBe(true);
    const grave = result.patch.discardedCards as GameCardData[];
    expect(grave).toHaveLength(1);
    expect(grave[0].id).toBe('s-iron');
    expect(grave[0].durability).toBe(3);
    expect(grave[0].armorMax).toBe(4);
    expect((grave[0] as any).armor).toBeUndefined();
    expect((grave[0] as any).armorBonusDamaged).toBeUndefined();
  });

  it('monster equipment broken → enters graveyard with currentLayer reset to 1', () => {
    const goblinEquip: GameCardData = {
      id: 'm-goblin', type: 'monster', name: 'Goblin (equip)', value: 5, image: '',
      attack: 5, hp: 3, maxHp: 3,
      durability: 0, maxDurability: 2,
      tempAttackBoost: 7,
      currentLayer: 3,
      fury: 3,
    } as GameCardData;
    const state = makeState({
      equipmentSlot1: goblinEquip as EquipmentItem,
      discardedCards: [],
    });

    const result = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      goblinEquip,
      createEmptyAmuletEffects(),
    );

    expect(result.destroyed).toBe(true);
    const grave = result.patch.discardedCards as GameCardData[];
    expect(grave).toHaveLength(1);
    const inGrave = grave[0];
    expect(inGrave.id).toBe('m-goblin');
    // currentLayer must reset to 1 per monster-graveyard-layer-reset rule —
    // otherwise a 4-layer dragon resurrected from grave is game-breaking.
    expect(inGrave.currentLayer).toBe(1);
    expect((inGrave as any).tempAttackBoost).toBe(0);
    // Monster reset strips equipment-form fields (durability/maxDurability).
    expect(inGrave.durability).toBeUndefined();
    expect(inGrave.maxDurability).toBeUndefined();
  });

  it('Perm-flagged equipment (recycleDelay > 0) → recycle bag, NOT graveyard', () => {
    const permBlade: GameCardData = {
      id: 'w-perm-blade', type: 'weapon', name: 'Perm Blade', value: 4, image: '',
      durability: 0, maxDurability: 2,
      recycleDelay: 2,
    };
    const state = makeState({
      equipmentSlot1: permBlade as EquipmentItem,
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const result = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      permBlade,
      createEmptyAmuletEffects(),
    );

    expect(result.destroyed).toBe(true);
    expect(result.patch.discardedCards).toBeUndefined();
    expect(result.enqueuedActions.some(a => a.type === 'ADD_TO_RECYCLE_BAG' && (a as any).card.id === 'w-perm-blade')).toBe(true);
  });

  it('graveyard-to-hand last-words: picked card moves to hand, broken self lands in graveyard', () => {
    const ironShield: GameCardData = {
      id: 'iron-1', type: 'shield', name: 'Iron Shield', value: 0, image: '',
      durability: 0, maxDurability: 3, armorMax: 2,
      armor: 0, armorBonusDamaged: 1,
      onDestroyEffect: 'graveyard-to-hand',
    };
    const otherGrave: GameCardData = {
      id: 'pickable', type: 'magic', name: 'Some Spell', value: 0, image: '',
    } as GameCardData;
    const state = makeState({
      equipmentSlot1: ironShield as EquipmentItem,
      discardedCards: [otherGrave],
      handCards: [],
    });

    const result = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      ironShield,
      createEmptyAmuletEffects(),
    );

    // Picked card moved to hand
    const handAfter = result.patch.handCards as GameCardData[];
    expect(handAfter.find(c => c.id === 'pickable')).toBeDefined();

    // Broken Iron Shield itself is now in graveyard (regression: previously this
    // was the ONLY non-Perm path that worked; now it still works with the
    // unified routing helper).
    const grave = result.patch.discardedCards as GameCardData[];
    expect(grave.find(c => c.id === 'iron-1')).toBeDefined();
    expect(grave.find(c => c.id === 'iron-1')?.durability).toBe(3);
    expect(grave.find(c => c.id === 'pickable')).toBeUndefined();
  });

  it('wraith-haunt monster: when swap succeeds, dying wraith STILL enters graveyard', () => {
    // Wraith equipment with `wraith-haunt-2` last words. When it breaks, 50%
    // chance the OTHER slot's item moves into wraith's slot. Either way the
    // wraith itself is destroyed and must enter the graveyard.
    //
    // We use createRng(42) which yields a swap-success path here (verified by
    // wraithSwapTarget being set in the result).
    const wraith: GameCardData = {
      id: 'm-wraith', type: 'monster', name: 'Wraith', value: 5, image: '',
      attack: 5, hp: 3, maxHp: 3, currentLayer: 1, fury: 1,
      durability: 0, maxDurability: 2,
      lastWords: 'wraith-haunt-2',
    } as GameCardData;
    const otherWeapon: GameCardData = {
      id: 'w-other', type: 'weapon', name: 'Other Weapon', value: 3, image: '',
      durability: 2, maxDurability: 2,
    };
    const state = makeState({
      equipmentSlot1: wraith as EquipmentItem,
      equipmentSlot2: otherWeapon as EquipmentItem,
      discardedCards: [],
      // Force a deterministic swap-success roll. nextBool returns int>=0.5
      // for some seeds; pick one we know flips true.
      rng: createRng(7),
    });

    const result = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      wraith,
      createEmptyAmuletEffects(),
    );

    expect(result.destroyed).toBe(true);
    const grave = result.patch.discardedCards as GameCardData[];
    // Regardless of whether the swap succeeded or not, the dying wraith
    // must enter the graveyard.
    expect(grave).toBeDefined();
    expect(grave.some(c => c.id === 'm-wraith')).toBe(true);
    // Monster reset rule: currentLayer = 1 in grave.
    const inGrave = grave.find(c => c.id === 'm-wraith')!;
    expect(inGrave.currentLayer).toBe(1);
  });

  it('残骸回收符 (salvage) path: broken weapon goes back to hand, NOT graveyard', () => {
    // Salvage takes priority over the default graveyard routing. This test
    // protects against a refactor that double-routes salvaged equipment.
    const blade: GameCardData = {
      id: 'w-salvageable', type: 'weapon', name: 'Salvageable Blade', value: 3, image: '',
      durability: 0, maxDurability: 3,
    };
    const state = makeState({
      equipmentSlot1: blade as EquipmentItem,
      discardedCards: [],
      handCards: [],
    });
    const ae = { ...createEmptyAmuletEffects(), equipmentSalvageCount: 1 };

    const result = computeEquipmentBreakEffects(state, 'equipmentSlot1', blade, ae);

    expect(result.destroyed).toBe(true);
    // Salvage path: card goes to hand with maxDur - 1.
    const handAfter = result.patch.handCards as GameCardData[];
    expect(handAfter.find(c => c.id === 'w-salvageable')).toBeDefined();
    expect(handAfter.find(c => c.id === 'w-salvageable')?.maxDurability).toBe(2);
    // Graveyard NOT touched.
    expect(result.patch.discardedCards).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// End-to-end: PERFORM_HERO_ATTACK with 共鸣之刃 at durability 1 → break →
// blade enters graveyard. This is the exact user-reported scenario.
// ---------------------------------------------------------------------------

describe('共鸣之刃 e2e: durability tick → break → graveyard', () => {
  it('PERFORM_HERO_ATTACK at 1 durability kills monster, breaks weapon, weapon lands in graveyard', () => {
    const blade: GameCardData = {
      id: 'w-resonance', type: 'weapon', name: '共鸣之刃', value: 4, image: '',
      durability: 1, maxDurability: 2,
      classCard: true,
      onAttackBuffOtherSlotTempAttack: 2,
      onAttackRepairOtherSlot: 1,
    };
    const target = makeMonster('weakling', 1, 1);
    const state = makeState({
      equipmentSlot1: blade as EquipmentItem,
      activeCards: [target, null, null, null, null] as ActiveRowSlots,
      combatState: {
        ...initialCombatState,
        heroAttacksRemaining: 1,
        heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
        engagedMonsterIds: [target.id],
      },
      discardedCards: [],
    });

    const result = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: target.id,
    });
    const finalState = drain(result.state, result.enqueuedActions ?? []).state;

    // Weapon was destroyed (slot cleared)
    expect(finalState.equipmentSlot1).toBeNull();
    // Weapon entered graveyard (regression: previously vanished entirely)
    expect(finalState.discardedCards.some(c => c.id === 'w-resonance')).toBe(true);
    expect(finalState.discardedCards.find(c => c.id === 'w-resonance')?.name).toBe('共鸣之刃');
    expect(finalState.discardedCards.find(c => c.id === 'w-resonance')?.durability).toBe(2);
  });
});
