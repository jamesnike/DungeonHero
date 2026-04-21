import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState, createEmptyAmuletEffects } from '../constants';
import { computeEquipmentBreakEffects } from '../rules/equipment-effects';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeThunderShield(over?: Partial<GameCardData>): GameCardData {
  return {
    id: 'thunder-shield',
    type: 'shield',
    name: '雷震守护盾',
    value: 8,
    image: '',
    classCard: true,
    durability: 1,
    maxDurability: 1,
    armorMax: 8,
    onDestroyEffect: 'stunCap+8',
    recycleDelay: 3, // <- Perm 3 from 永恒铭刻
    ...(over ?? {}),
  } as GameCardData;
}

function makeOtherShield(over?: Partial<GameCardData>): GameCardData {
  return {
    id: 'other-shield',
    type: 'shield',
    name: 'Other Shield',
    value: 4,
    image: '',
    durability: 2,
    maxDurability: 2,
    armorMax: 4,
    ...(over ?? {}),
  } as GameCardData;
}

describe('Perm-tagged shield displacement', () => {
  it('drag-style replacement (DISPOSE + SET_EQUIPMENT_SLOT + EQUIP_FROM_HAND) keeps Perm shield in recycle bag', () => {
    const thunder = makeThunderShield();
    const newShield = makeOtherShield();
    let state = makeState({
      handCards: [newShield],
      equipmentSlot1: thunder as any,
      equipmentSlot2: null,
      permanentMagicRecycleBag: [],
      discardedCards: [],
    });

    // Mimic GameBoard drag handler when slot1 is full (cap=1, no reserve):
    //   disposeOwnedEquipmentCard(equippedItem, { isDestruction: true, triggerLastWords: true, fromSlotId: 'equipmentSlot1' });
    //   setEquipmentSlotById('equipmentSlot1', newShield);
    //   dispatch({ type: 'EQUIP_FROM_HAND', card: newShield, slotId: 'equipmentSlot1' });
    //   consumeCardFromHand(newShield) -> dispatch UPDATE_HAND_CARDS

    let r = reduce(state, {
      type: 'DISPOSE_EQUIPMENT_CARD',
      card: thunder,
      isDestruction: true,
      triggerLastWords: true,
      fromSlotId: 'equipmentSlot1',
    });
    state = drain(r.state, r.enqueuedActions ?? []).state;

    console.log('After DISPOSE:');
    console.log('  recycleBag:', state.permanentMagicRecycleBag.map(c => `${c.name}(rd=${(c as any).recycleDelay})`));
    console.log('  graveyard:', state.discardedCards.map(c => c.name));

    r = reduce(state, {
      type: 'SET_EQUIPMENT_SLOT',
      slotId: 'equipmentSlot1',
      card: { ...newShield, fromSlot: 'equipmentSlot1' } as any,
    });
    state = drain(r.state, r.enqueuedActions ?? []).state;

    r = reduce(state, {
      type: 'EQUIP_FROM_HAND',
      card: newShield,
      slotId: 'equipmentSlot1',
    });
    state = drain(r.state, r.enqueuedActions ?? []).state;

    r = reduce(state, {
      type: 'UPDATE_HAND_CARDS',
      updater: (prev: any) => prev.filter((c: any) => c.id !== newShield.id),
    });
    state = drain(r.state, r.enqueuedActions ?? []).state;

    console.log('FINAL:');
    console.log('  slot1:', (state.equipmentSlot1 as any)?.name);
    console.log('  recycleBag:', state.permanentMagicRecycleBag.map(c => c.name));
    console.log('  graveyard:', state.discardedCards.map(c => c.name));

    expect(state.permanentMagicRecycleBag.some(c => c.name === '雷震守护盾')).toBe(true);
    expect(state.discardedCards.some(c => c.name === '雷震守护盾')).toBe(false);
  });

  it('FULL FLOW: hand→cast 永恒铭刻→equip→displace by another shield', () => {
    // Reproduce the user's actual game flow:
    //   1) 雷震守护盾 enters hand (no recycleDelay)
    //   2) Player casts 永恒铭刻 → sets recycleDelay: 3 on the shield in hand
    //   3) Player equips the shield to slot1 (via PLAY_CARD)
    //   4) Player drags another shield onto slot1 (drag flow: DISPOSE + SET + EQUIP_FROM_HAND)
    //   5) Expect: 雷震守护盾 in permanentMagicRecycleBag, NOT discardedCards
    const thunder = makeThunderShield({ id: 'thunder-1' });
    delete (thunder as any).recycleDelay; // start without Perm

    const eternalMagic: GameCardData = {
      id: 'eternal-engraving-1',
      type: 'magic',
      name: '永恒铭刻',
      value: 0,
      image: '',
      magicType: 'instant',
    } as GameCardData;

    let state = makeState({
      handCards: [thunder, eternalMagic] as any,
      equipmentSlot1: null,
      equipmentSlot2: null,
      permanentMagicRecycleBag: [],
      discardedCards: [],
    });

    // Step 1+2: cast 永恒铭刻 — opens modal, then RESOLVE_PERM_GRANT applies Perm to thunder.
    let r = reduce(state, { type: 'PLAY_CARD', cardId: 'eternal-engraving-1' });
    state = drain(r.state, r.enqueuedActions ?? []).state;

    // The reducer routes interactive grant via permGrantModal — apply RESOLVE_PERM_GRANT directly.
    if (state.permGrantModal) {
      r = reduce(state, { type: 'RESOLVE_PERM_GRANT', targetCardId: 'thunder-1' } as any);
      state = drain(r.state, r.enqueuedActions ?? []).state;
    }

    const handThunder = state.handCards.find(c => c.id === 'thunder-1') as any;
    console.log('After cast 永恒铭刻 → hand thunder recycleDelay:', handThunder?.recycleDelay);
    expect(handThunder?.recycleDelay).toBe(3);

    // Step 3: equip thunder shield via PLAY_CARD
    r = reduce(state, { type: 'PLAY_CARD', cardId: 'thunder-1' });
    state = drain(r.state, r.enqueuedActions ?? []).state;
    const slot1 = state.equipmentSlot1 as any;
    console.log('After equip → slot1.name:', slot1?.name, 'recycleDelay:', slot1?.recycleDelay);
    expect(slot1?.recycleDelay).toBe(3);

    // Step 4: drag a different shield onto slot1 (drag flow)
    const newShield = makeOtherShield({ id: 'new-shield' });
    state = { ...state, handCards: [...state.handCards, newShield] };

    r = reduce(state, {
      type: 'DISPOSE_EQUIPMENT_CARD',
      card: state.equipmentSlot1 as any,
      isDestruction: true,
      triggerLastWords: true,
      fromSlotId: 'equipmentSlot1',
    });
    state = drain(r.state, r.enqueuedActions ?? []).state;

    r = reduce(state, {
      type: 'SET_EQUIPMENT_SLOT',
      slotId: 'equipmentSlot1',
      card: { ...newShield, fromSlot: 'equipmentSlot1' } as any,
    });
    state = drain(r.state, r.enqueuedActions ?? []).state;

    r = reduce(state, {
      type: 'EQUIP_FROM_HAND',
      card: newShield,
      slotId: 'equipmentSlot1',
    });
    state = drain(r.state, r.enqueuedActions ?? []).state;

    r = reduce(state, {
      type: 'UPDATE_HAND_CARDS',
      updater: (prev: any) => prev.filter((c: any) => c.id !== newShield.id),
    });
    state = drain(r.state, r.enqueuedActions ?? []).state;

    console.log('FINAL FULL FLOW:');
    console.log('  slot1:', (state.equipmentSlot1 as any)?.name);
    console.log('  recycleBag:', state.permanentMagicRecycleBag.map(c => `${c.name}(rd=${(c as any).recycleDelay})`));
    console.log('  graveyard:', state.discardedCards.map(c => c.name));
    console.log('  hand:', state.handCards.map(c => c.name));

    expect(state.permanentMagicRecycleBag.some(c => c.name === '雷震守护盾')).toBe(true);
    expect(state.discardedCards.some(c => c.name === '雷震守护盾')).toBe(false);
  });

  it('REPRO: Perm shield + 残骸回收符 → bug surfaces', () => {
    const thunder = makeThunderShield();
    const salvageAmulet = {
      id: 'a-salvage',
      type: 'amulet',
      name: '残骸回收符',
      value: 0,
      image: '',
      amuletEffect: 'equipment-salvage',
    } as GameCardData;

    let state = makeState({
      handCards: [],
      equipmentSlot1: thunder as any,
      equipmentSlot2: null,
      amuletSlots: [salvageAmulet] as any,
      permanentMagicRecycleBag: [],
      discardedCards: [],
    });

    const r = reduce(state, {
      type: 'DISPOSE_EQUIPMENT_CARD',
      card: thunder,
      isDestruction: true,
      triggerLastWords: true,
      fromSlotId: 'equipmentSlot1',
    });
    state = drain(r.state, r.enqueuedActions ?? []).state;

    console.log('REPRO with salvage amulet:');
    console.log('  recycleBag:', state.permanentMagicRecycleBag.map(c => c.name));
    console.log('  graveyard:', state.discardedCards.map(c => c.name));
    console.log('  hand:', state.handCards.map(c => c.name));

    // EXPECTATION: Perm shield should still go to recycle bag (because user said
    // 「应该进回收袋 因为有Perm」). Salvage amulet should NOT take priority over Perm.
    expect(state.permanentMagicRecycleBag.some(c => c.name === '雷震守护盾')).toBe(true);
  });

  it('Perm shield in slot 1 → play another shield → Perm shield should go to recycle bag', () => {
    const thunder = makeThunderShield();
    const other = makeOtherShield();
    const state = makeState({
      handCards: [other],
      equipmentSlot1: thunder as any,
      equipmentSlot2: null,
      permanentMagicRecycleBag: [],
      discardedCards: [],
    });

    // Play other shield → fills slot2 (since slot1 is occupied) -- no displacement
    let result = reduce(state, { type: 'PLAY_CARD', cardId: 'other-shield' });
    let next = drain(result.state, result.enqueuedActions ?? []).state;

    console.log('After 1st play:');
    console.log('  slot1:', (next.equipmentSlot1 as any)?.name, 'recycleDelay=', (next.equipmentSlot1 as any)?.recycleDelay);
    console.log('  slot2:', (next.equipmentSlot2 as any)?.name);

    // Now both slots full. Add another shield to hand.
    const third = makeOtherShield({ id: 'third-shield', name: 'Third Shield' });
    next = { ...next, handCards: [third] };
    result = reduce(next, { type: 'PLAY_CARD', cardId: 'third-shield' });
    next = drain(result.state, result.enqueuedActions ?? []).state;

    console.log('After 2nd play (displacement):');
    console.log('  slot1:', (next.equipmentSlot1 as any)?.name);
    console.log('  slot2:', (next.equipmentSlot2 as any)?.name);
    console.log('  recycleBag:', next.permanentMagicRecycleBag.map(c => c.name));
    console.log('  graveyard:', next.discardedCards.map(c => c.name));

    expect(next.permanentMagicRecycleBag.some(c => c.name === '雷震守护盾')).toBe(true);
    expect(next.discardedCards.some(c => c.name === '雷震守护盾')).toBe(false);
  });

  it('NATURAL BREAK: Perm shield breaks at 0 durability → should go to recycle bag, not vanish', () => {
    // Reproduce the actual scenario: 雷震守护盾 has durability 1.
    // When player blocks an attack with it, durability drops to 0 and the
    // engine calls computeEquipmentBreakEffects directly (not via DISPOSE).
    // This is the path that does NOT route Perm equipment to the recycle bag.
    const thunder = makeThunderShield();
    const state = makeState({
      equipmentSlot1: thunder as any,
      equipmentSlot2: null,
      permanentMagicRecycleBag: [],
      discardedCards: [],
    });

    const ae = createEmptyAmuletEffects();
    const result = computeEquipmentBreakEffects(state, 'equipmentSlot1', thunder, ae);

    console.log('NATURAL BREAK result:');
    console.log('  patch.equipmentSlot1:', (result.patch as any).equipmentSlot1);
    console.log('  patch.discardedCards:', (result.patch as any).discardedCards?.map((c: any) => c.name));
    console.log('  enqueuedActions:', result.enqueuedActions.map(a => a.type));
    console.log('  destroyed:', result.destroyed);

    // The slot is cleared:
    expect((result.patch as any).equipmentSlot1).toBeNull();

    // BUG: nothing routes the Perm shield to the recycle bag.
    const enqueuedToRecycle = result.enqueuedActions.some(
      a => a.type === 'ADD_TO_RECYCLE_BAG' && (a as any).card?.name === '雷震守护盾'
    );
    const enqueuedToGraveyard = result.enqueuedActions.some(
      a => a.type === 'ADD_TO_GRAVEYARD' && (a as any).card?.name === '雷震守护盾'
    );
    const inGraveyardPatch =
      ((result.patch as any).discardedCards as any[] | undefined)?.some(c => c.name === '雷震守护盾') ?? false;

    console.log('  enqueuedToRecycle:', enqueuedToRecycle);
    console.log('  enqueuedToGraveyard:', enqueuedToGraveyard);
    console.log('  inGraveyardPatch:', inGraveyardPatch);

    // EXPECTATION (what the user wants): Perm shield must end up in recycle bag.
    expect(enqueuedToRecycle).toBe(true);
  });

  it('MONSTER-DOOM: Perm shield destroyed by 怪物末日 → routes to recycle bag', () => {
    const thunder = makeThunderShield();

    let state = makeState({
      hp: 30,
      handCards: [],
      equipmentSlot1: thunder as any,
      equipmentSlot2: null,
      heroMagicState: {
        'monster-doom': { unlocked: true, gauge: 100, usedThisWave: false },
      } as any,
      permanentMagicRecycleBag: [],
      discardedCards: [],
    });

    let r = reduce(state, {
      type: 'ACTIVATE_HERO_MAGIC',
      magicId: 'monster-doom',
      origin: 'gauge',
    } as any);
    state = drain(r.state, r.enqueuedActions ?? []).state;

    console.log('After monster-doom:');
    console.log('  slot1:', (state.equipmentSlot1 as any));
    console.log('  recycleBag:', state.permanentMagicRecycleBag.map(c => c.name));
    console.log('  graveyard:', state.discardedCards.map(c => c.name));

    expect(state.equipmentSlot1).toBeNull();
    expect(state.permanentMagicRecycleBag.some(c => c.name === '雷震守护盾')).toBe(true);
    expect(state.discardedCards.some(c => c.name === '雷震守护盾')).toBe(false);
  });

  it('NATURAL BREAK + salvage amulet: Perm shield SKIPS salvage and routes to recycle bag', () => {
    // Covers the second salvage entry point — `computeEquipmentBreakEffects`
    // in `equipment-effects.ts`. Even when 残骸回收符 (equipment-salvage) is
    // equipped, a Perm shield breaking at 0 durability must NOT be consumed
    // by salvage's `maxDurability--` (which would let `newMaxDur <= 0` vanish
    // the card). Perm-priority requires routing to the recycle bag instead.
    //
    // Mirrors the DISPOSE + salvage assertion (line 197-234) for the
    // alternate destruction entry point.
    const thunder = makeThunderShield();
    const ae = createEmptyAmuletEffects();
    ae.equipmentSalvageCount = 1; // simulate one 残骸回收符 equipped

    const state = makeState({
      equipmentSlot1: thunder as any,
      equipmentSlot2: null,
      permanentMagicRecycleBag: [],
      discardedCards: [],
    });

    const result = computeEquipmentBreakEffects(state, 'equipmentSlot1', thunder, ae);

    // Slot cleared
    expect((result.patch as any).equipmentSlot1).toBeNull();

    // Salvage MUST be skipped — no "back to hand with reduced maxDur".
    const enqueuedReturnToHand = result.enqueuedActions.some(a => a.type === 'RETURN_EQUIPMENT_TO_HAND');
    expect(enqueuedReturnToHand).toBe(false);

    // Perm routing fired instead.
    const enqueuedToRecycle = result.enqueuedActions.some(
      a => a.type === 'ADD_TO_RECYCLE_BAG' && (a as any).card?.name === '雷震守护盾'
    );
    expect(enqueuedToRecycle).toBe(true);

    // Did NOT vanish into graveyard either.
    const inGraveyardPatch =
      ((result.patch as any).discardedCards as any[] | undefined)?.some(c => c.name === '雷震守护盾') ?? false;
    expect(inGraveyardPatch).toBe(false);
  });

  it('DISCARD-REBUILD: Perm shield destroyed by 弃装重铸 → routes to recycle bag', () => {
    const thunder = makeThunderShield();
    const discardRebuild: GameCardData = {
      id: 'discard-rebuild-1',
      type: 'magic',
      name: '弃装重铸',
      value: 0,
      image: '',
      magicType: 'permanent',
      magicEffect: 'discard-rebuild',
      knightEffect: 'discard-rebuild',
      recycleDelay: 2,
      classCard: true,
    } as GameCardData;

    let state = makeState({
      handCards: [discardRebuild] as any,
      equipmentSlot1: thunder as any,
      equipmentSlot2: null,
      permanentMagicRecycleBag: [],
      discardedCards: [],
    });

    let r = reduce(state, { type: 'PLAY_CARD', cardId: 'discard-rebuild-1' });
    state = drain(r.state, r.enqueuedActions ?? []).state;

    console.log('After discard-rebuild:');
    console.log('  slot1:', state.equipmentSlot1);
    console.log('  recycleBag:', state.permanentMagicRecycleBag.map(c => `${c.name}(rd=${(c as any).recycleDelay})`));
    console.log('  graveyard:', state.discardedCards.map(c => c.name));

    expect(state.equipmentSlot1).toBeNull();
    expect(state.permanentMagicRecycleBag.some(c => c.name === '雷震守护盾')).toBe(true);
    expect(state.discardedCards.some(c => c.name === '雷震守护盾')).toBe(false);
  });
});
