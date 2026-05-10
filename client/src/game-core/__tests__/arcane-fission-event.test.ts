/**
 * 「奥能裂变」(Arcane Fission) — 7-outcome dice event with random 50/50 flip.
 *
 * Coverage matrix (one block per outcome + meta):
 *   - Authoring sanity: event is in the deck with all 7 dice rows + 2 flip
 *     candidates (布雷术 / 魔法飞弹), both retain `classCard: true`.
 *   - reduceCompleteEvent: random pick from `flipTargetCandidates` overrides
 *     the static placeholder flipTarget.
 *   - Outcome 1 (grantLastWordsGainBolt:N): equipment gets `lastWordsGainBolt`
 *     stack; on equipment break, `applyOneEquipmentLastWordsIteration` calls
 *     `applyGainMagicBolts`. Verified by inspecting the equipment's
 *     `lastWordsGainBolt` after RESOLVE_EVENT_GRANT_LASTWORDS_GAIN_BOLT
 *     (then a separate test verifies break → bolts via
 *     computeEquipmentBreakEffects).
 *   - Outcome 2 (grantFlankGainBolt:N): RESOLVE_PERM_GRANT writes
 *     `flankEffectId: 'gainBolt:N'`; flank dispatch in reducePlayCard
 *     triggers `applyGainMagicBolts`.
 *   - Outcome 3 (grantHandOnHandAddBoltBackpack:N): RESOLVE_PERM_GRANT writes
 *     `onEnterHandEffect: 'add-bolt-bp:N'` AND immediately fires once.
 *   - Outcome 4 (grantOnEquipSpawnMine:N): RESOLVE_EVENT_GRANT_ONEQUIP_SPAWN_MINE
 *     sets `onEquipEffect: 'spawn-mine:N'` on the chosen equipment.
 *     The on-equip handler spawns N mines on PLAY_CARD into empty active row.
 *   - Outcome 5 (grantFlankSpawnMine:N): RESOLVE_PERM_GRANT writes
 *     `flankEffectId: 'spawnMine:N'`; flank dispatch spawns mines.
 *   - Outcome 6 (grantTransformBoostMineDmg:N): RESOLVE_PERM_GRANT writes
 *     `transformEffect: 'boost-mine-damage:N'`; reduceApplyTransformCategory
 *     accumulates `globalMineDamageBonus += N` (permanent, stackable).
 *   - Outcome 7 (grantTransformAmplifyBolt:N): RESOLVE_PERM_GRANT writes
 *     `transformEffect: 'amplify-bolt:N'`; transform fires
 *     AMPLIFY_CARDS_BY_NAME(魔弹, N) → state.amplifiedCardBonus['魔弹'] += N.
 *
 * Per pipeline-input-continuation.mdc, fixtures use `phase: 'playerInput'`
 * so any internal follow-up actions are exercised the same way they would
 * be in a live session.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState, createEmptyAmuletEffects } from '../constants';
import { createRng } from '../rng';
import { computeEquipmentBreakEffects } from '../rules/equipment-effects';
import { createDeck } from '../deck';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput' as any,
    activeCards: [null, null, null, null, null] as unknown as ActiveRowSlots,
    combatState: { ...initialCombatState, engagedMonsterIds: [] } as any,
    rng: createRng(42),
    ...overrides,
  };
}

function makeWeapon(id = 'w-test', overrides: Partial<GameCardData> = {}): GameCardData {
  return {
    id,
    type: 'weapon',
    name: '测试剑',
    value: 4,
    image: '',
    durability: 1,
    maxDurability: 3,
    ...overrides,
  } as GameCardData;
}

function makeNonClassMagic(id: string, name = '测试魔法'): GameCardData {
  // A magic card distinct from "魔弹" so it can be the "previous category"
  // for transform triggers (transform fires when curCat differs from prev).
  return {
    id,
    type: 'magic',
    name,
    value: 0,
    image: '',
    magicType: 'instant',
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// Authoring sanity
// ---------------------------------------------------------------------------

describe('「奥能裂变」event — authoring sanity', () => {
  const [deck] = createDeck('normal', createRng(1));
  const fission = deck.find(c => c.name === '奥能裂变');

  it('exists in the deck with type "event"', () => {
    expect(fission).toBeDefined();
    expect(fission?.type).toBe('event');
  });

  it('has exactly one eventChoice with a 7-row diceTable', () => {
    expect(fission?.eventChoices).toBeDefined();
    expect(fission?.eventChoices).toHaveLength(1);
    const dice = fission?.eventChoices?.[0]?.diceTable;
    expect(dice).toBeDefined();
    expect(dice).toHaveLength(7);
  });

  it('all 7 dice rows have unique ids and the expected effect tokens', () => {
    const dice = fission!.eventChoices![0].diceTable!;
    const ids = dice.map(r => r.id);
    expect(new Set(ids).size).toBe(7);
    const effects = dice.map(r => r.effect);
    expect(effects).toContain('grantLastWordsGainBolt:2');
    expect(effects).toContain('grantFlankGainBolt:1');
    expect(effects).toContain('grantHandOnHandAddBoltBackpack:1');
    expect(effects).toContain('grantOnEquipSpawnMine:1');
    expect(effects).toContain('grantFlankSpawnMine:1');
    expect(effects).toContain('grantTransformBoostMineDmg:2');
    expect(effects).toContain('grantTransformAmplifyBolt:2');
  });

  it('has 2 flipTargetCandidates (布雷术 / 魔法飞弹), both classCard: true', () => {
    expect(fission?.flipTargetCandidates).toBeDefined();
    expect(fission?.flipTargetCandidates).toHaveLength(2);
    const names = fission!.flipTargetCandidates!.map(t => t.toCard.name);
    expect(names).toContain('布雷术');
    expect(names).toContain('魔法飞弹');
    for (const cand of fission!.flipTargetCandidates!) {
      expect((cand.toCard as any).classCard).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Random flip in reduceCompleteEvent
// ---------------------------------------------------------------------------

describe('「奥能裂变」reduceCompleteEvent — random flip', () => {
  function setupForFlip(seed: number): GameState {
    const [deck] = createDeck('normal', createRng(seed));
    const fission = deck.find(c => c.name === '奥能裂变')!;
    return makeState({
      currentEventCard: fission as any,
      activeCards: [fission as any, null, null, null, null] as ActiveRowSlots,
      rng: createRng(seed),
    });
  }

  it('selects one of the two candidates from flipTargetCandidates (not the static placeholder)', () => {
    // Run several seeds; every result must be either 布雷术 or 魔法飞弹,
    // never the placeholder「布雷术 / 魔法飞弹」.
    const observed = new Set<string>();
    for (const seed of [1, 7, 13, 42, 99, 100, 256, 1024]) {
      const s = setupForFlip(seed);
      const r = reduce(s, { type: 'COMPLETE_EVENT' } as any);
      const drained = drain(r.state, r.enqueuedActions ?? []).state;
      // After flip with destination 'stay', one of the row cells (likely cell 0)
      // holds the flipped card. Search across the whole row to be tolerant of
      // post-processing reshuffles.
      const flipped = (drained.activeCards as (GameCardData | null | undefined)[])
        .find(c => c != null && (c.name === '布雷术' || c.name === '魔法飞弹'));
      expect(flipped).toBeDefined();
      expect(flipped!.name).not.toBe('布雷术 / 魔法飞弹');
      observed.add(flipped!.name);
    }
    // Across many seeds we should see both outcomes (50/50). Probability of
    // missing one entirely across 8 seeds is 2^-8 ≈ 0.4%.
    expect(observed.size).toBe(2);
  });

  it('skipFlip=true bypasses random pick (no flip card remains on the row)', () => {
    const s = setupForFlip(42);
    const r = reduce(s, { type: 'COMPLETE_EVENT', skipFlip: true } as any);
    const drained = drain(r.state, r.enqueuedActions ?? []).state;
    // skipFlip → cell cleared (or replaced with something else, but never a flip target).
    const cell0 = drained.activeCards[0] as GameCardData | null | undefined;
    if (cell0) {
      expect(['布雷术', '魔法飞弹']).not.toContain(cell0.name);
    } else {
      // null OR undefined — both mean "no card here".
      expect(cell0 == null).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Outcome 1: grantLastWordsGainBolt:N (RESOLVE_EVENT_GRANT_LASTWORDS_GAIN_BOLT)
// ---------------------------------------------------------------------------

describe('Outcome 1 — grantLastWordsGainBolt:N (装备遗言)', () => {
  it('RESOLVE_EVENT_GRANT_LASTWORDS_GAIN_BOLT increments lastWordsGainBolt on chosen slot', () => {
    const sword = makeWeapon('w1');
    const state = makeState({ equipmentSlot1: sword as EquipmentItem });
    const r = reduce(state, {
      type: 'RESOLVE_EVENT_GRANT_LASTWORDS_GAIN_BOLT',
      equipmentSlotId: 'equipmentSlot1',
      amount: 2,
    });
    expect((r.state.equipmentSlot1 as any)?.lastWordsGainBolt).toBe(2);
  });

  it('stacks across multiple invocations (×3 → 6)', () => {
    const sword = makeWeapon('w-stack');
    let state = makeState({ equipmentSlot1: sword as EquipmentItem });
    for (let i = 0; i < 3; i++) {
      const r = reduce(state, {
        type: 'RESOLVE_EVENT_GRANT_LASTWORDS_GAIN_BOLT',
        equipmentSlotId: 'equipmentSlot1',
        amount: 2,
      });
      state = r.state;
    }
    expect((state.equipmentSlot1 as any)?.lastWordsGainBolt).toBe(6);
  });

  it('no-ops on empty slot', () => {
    const state = makeState({ equipmentSlot1: null });
    const r = reduce(state, {
      type: 'RESOLVE_EVENT_GRANT_LASTWORDS_GAIN_BOLT',
      equipmentSlotId: 'equipmentSlot1',
      amount: 2,
    });
    expect(r.state.equipmentSlot1).toBeNull();
  });

  it('on equipment break, computeEquipmentBreakEffects spawns N bolts via applyGainMagicBolts', () => {
    // Sword at 1/3 with lastWordsGainBolt: 2. Trigger break.
    const sword: GameCardData = makeWeapon('w-break', { durability: 1, maxDurability: 3, lastWordsGainBolt: 2 } as any);
    const state = makeState({
      equipmentSlot1: sword as EquipmentItem,
      handCards: [],
      backpackItems: [],
    });
    const breakResult = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1' as any,
      sword as EquipmentItem as any,
      createEmptyAmuletEffects(),
    );
    // The patch should have either handCards / backpackItems containing 2 「魔弹」 cards.
    const hand = (breakResult.patch.handCards as GameCardData[] | undefined) ?? [];
    const backpack = (breakResult.patch.backpackItems as GameCardData[] | undefined) ?? [];
    const recycle = (breakResult.patch.permanentMagicRecycleBag as GameCardData[] | undefined) ?? [];
    const totalBolts = [...hand, ...backpack, ...recycle].filter(c => c.name === '魔弹').length;
    expect(totalBolts).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Outcome 2 + 5: flank effects (gainBolt + spawnMine)
// ---------------------------------------------------------------------------

describe('Outcome 2 — grantFlankGainBolt:N (手牌侧击 → 魔弹)', () => {
  it('RESOLVE_PERM_GRANT writes flankEffectId: gainBolt:N to chosen hand card', () => {
    const target = makeNonClassMagic('t-bolt', 'TargetMagic');
    const filler = makeNonClassMagic('filler', 'FillerMagic');
    const state = makeState({
      handCards: [target, filler] as any,
      permGrantModal: { sourceCardId: 'event-grant', sourceType: 'flank-gain-bolt-grant', meta: { amount: 1 } },
    });
    const r = reduce(state, { type: 'RESOLVE_PERM_GRANT', targetCardId: 't-bolt' } as any);
    const updated = r.state.handCards.find(c => c.id === 't-bolt') as any;
    expect(updated.flankEffectId).toBe('gainBolt:1');
    expect(updated.flankEffect).toContain('魔弹');
  });
});

describe('Outcome 5 — grantFlankSpawnMine:N (手牌侧击 → 地雷)', () => {
  it('RESOLVE_PERM_GRANT writes flankEffectId: spawnMine:N to chosen hand card', () => {
    const target = makeNonClassMagic('t-mine', 'TargetMagic');
    const filler = makeNonClassMagic('filler', 'FillerMagic');
    const state = makeState({
      handCards: [target, filler] as any,
      permGrantModal: { sourceCardId: 'event-grant', sourceType: 'flank-spawn-mine-grant', meta: { amount: 1 } },
    });
    const r = reduce(state, { type: 'RESOLVE_PERM_GRANT', targetCardId: 't-mine' } as any);
    const updated = r.state.handCards.find(c => c.id === 't-mine') as any;
    expect(updated.flankEffectId).toBe('spawnMine:1');
    expect(updated.flankEffect).toContain('地雷');
  });
});

// ---------------------------------------------------------------------------
// Outcome 3: grantHandOnHandAddBoltBackpack:N
// ---------------------------------------------------------------------------

describe('Outcome 3 — grantHandOnHandAddBoltBackpack:N (手牌上手 → 背包 +N 魔弹)', () => {
  it('RESOLVE_PERM_GRANT writes onEnterHandEffect: add-bolt-bp:N AND fires once immediately', () => {
    const target = makeNonClassMagic('t-onhand', 'TargetMagic');
    const filler = makeNonClassMagic('filler', 'FillerMagic');
    const state = makeState({
      handCards: [target, filler] as any,
      backpackItems: [],
      permGrantModal: { sourceCardId: 'event-grant', sourceType: 'on-hand-add-bolt-bp-grant', meta: { amount: 1 } },
    });
    const r = reduce(state, { type: 'RESOLVE_PERM_GRANT', targetCardId: 't-onhand' } as any);
    const updated = r.state.handCards.find(c => c.id === 't-onhand') as any;
    expect(updated.onEnterHandEffect).toBe('add-bolt-bp:1');
    // Immediate trigger: at least 1 「魔弹」 should now exist somewhere.
    const allCards = [...r.state.handCards, ...r.state.backpackItems, ...r.state.permanentMagicRecycleBag];
    const boltCount = allCards.filter(c => c.name === '魔弹').length;
    expect(boltCount).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Outcome 4: grantOnEquipSpawnMine:N (RESOLVE_EVENT_GRANT_ONEQUIP_SPAWN_MINE)
// ---------------------------------------------------------------------------

describe('Outcome 4 — grantOnEquipSpawnMine:N (装备入场 → 地雷)', () => {
  it('RESOLVE_EVENT_GRANT_ONEQUIP_SPAWN_MINE sets onEquipEffect: spawn-mine:N on chosen slot', () => {
    const sword = makeWeapon('w-mine');
    const state = makeState({ equipmentSlot1: sword as EquipmentItem });
    const r = reduce(state, {
      type: 'RESOLVE_EVENT_GRANT_ONEQUIP_SPAWN_MINE',
      equipmentSlotId: 'equipmentSlot1',
      amount: 1,
    });
    expect((r.state.equipmentSlot1 as any)?.onEquipEffect).toBe('spawn-mine:1');
  });

  it('skips equipment that already has an onEquipEffect (defensive)', () => {
    const sword: GameCardData = makeWeapon('w-pre', { onEquipEffect: 'gold+6' } as any);
    const state = makeState({ equipmentSlot1: sword as EquipmentItem });
    const r = reduce(state, {
      type: 'RESOLVE_EVENT_GRANT_ONEQUIP_SPAWN_MINE',
      equipmentSlotId: 'equipmentSlot1',
      amount: 1,
    });
    // Original effect must remain untouched.
    expect((r.state.equipmentSlot1 as any)?.onEquipEffect).toBe('gold+6');
  });

  it('no-ops on empty slot', () => {
    const state = makeState({ equipmentSlot2: null });
    const r = reduce(state, {
      type: 'RESOLVE_EVENT_GRANT_ONEQUIP_SPAWN_MINE',
      equipmentSlotId: 'equipmentSlot2',
      amount: 1,
    });
    expect(r.state.equipmentSlot2).toBeNull();
  });

  it('PLAY_CARD on weapon with spawn-mine:N spawns N mines into empty active row slots', () => {
    // Build a weapon with spawn-mine:2 in hand, empty slots, empty active row.
    const sword: GameCardData = makeWeapon('w-equip', { onEquipEffect: 'spawn-mine:2' } as any);
    const state = makeState({
      handCards: [sword] as any,
      equipmentSlot1: null,
      equipmentSlot2: null,
      activeCards: [null, null, null, null, null] as ActiveRowSlots,
    });
    const r = reduce(state, { type: 'PLAY_CARD', cardId: 'w-equip' });
    const drained = drain(r.state, r.enqueuedActions ?? []).state;
    const mines = (drained.activeCards as (GameCardData | null)[]).filter(
      c => c != null && (c as any).type === 'building',
    );
    expect(mines.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Outcome 6: grantTransformBoostMineDmg:N (transform → globalMineDamageBonus)
// ---------------------------------------------------------------------------

describe('Outcome 6 — grantTransformBoostMineDmg:N (手牌转型 → 全场地雷伤害 +N，永久叠加)', () => {
  it('RESOLVE_PERM_GRANT writes transformEffect: boost-mine-damage:N', () => {
    const target = makeNonClassMagic('t-mineDmg', 'TargetMagic');
    const filler = makeNonClassMagic('filler', 'FillerMagic');
    const state = makeState({
      handCards: [target, filler] as any,
      permGrantModal: { sourceCardId: 'event-grant', sourceType: 'transform-mine-damage-grant', meta: { amount: 2 } },
    });
    const r = reduce(state, { type: 'RESOLVE_PERM_GRANT', targetCardId: 't-mineDmg' } as any);
    const updated = r.state.handCards.find(c => c.id === 't-mineDmg') as any;
    expect(updated.transformEffect).toBe('boost-mine-damage:2');
    expect(updated.transformBonus).toContain('全场地雷');
  });

  it('APPLY_TRANSFORM_CATEGORY on a card with boost-mine-damage:2 increments globalMineDamageBonus by 2', () => {
    const card: GameCardData = makeNonClassMagic('boost-card', 'BoostCard');
    (card as any).transformEffect = 'boost-mine-damage:2';
    const state = makeState({
      globalMineDamageBonus: 0,
      // Pretend the player just played a card of a *different* category last turn —
      // the reducer reads transformChainPrevCategory.
      transformChainPrevCategory: 'weapon',
    } as any);
    const r = reduce(state, { type: 'APPLY_TRANSFORM_CATEGORY', card } as any);
    expect(r.state.globalMineDamageBonus).toBe(2);
  });

  it('stacks across multiple transform triggers (4 + 2 = 6)', () => {
    const card: GameCardData = makeNonClassMagic('boost-card-2', 'BoostCard');
    (card as any).transformEffect = 'boost-mine-damage:2';
    let state = makeState({
      globalMineDamageBonus: 4,
      transformChainPrevCategory: 'weapon',
    } as any);
    const r = reduce(state, { type: 'APPLY_TRANSFORM_CATEGORY', card } as any);
    expect(r.state.globalMineDamageBonus).toBe(6);
  });

  it('does NOT trigger when prev category equals current category', () => {
    const card: GameCardData = makeNonClassMagic('boost-no-trigger', 'BoostNoTrigger');
    (card as any).transformEffect = 'boost-mine-damage:2';
    const state = makeState({
      globalMineDamageBonus: 0,
      // 'instant-magic' is what `getCardPlayCategory` returns for a magic card
      // with magicType: 'instant'. Setting prev = same category disables transform.
      transformChainPrevCategory: 'instant-magic',
    } as any);
    const r = reduce(state, { type: 'APPLY_TRANSFORM_CATEGORY', card } as any);
    expect(r.state.globalMineDamageBonus).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Outcome 7: grantTransformAmplifyBolt:N (transform → AMPLIFY_CARDS_BY_NAME(魔弹))
// ---------------------------------------------------------------------------

describe('Outcome 7 — grantTransformAmplifyBolt:N (手牌转型 → 魔弹增幅 N 次)', () => {
  it('RESOLVE_PERM_GRANT writes transformEffect: amplify-bolt:N', () => {
    const target = makeNonClassMagic('t-amp', 'TargetMagic');
    const filler = makeNonClassMagic('filler', 'FillerMagic');
    const state = makeState({
      handCards: [target, filler] as any,
      permGrantModal: { sourceCardId: 'event-grant', sourceType: 'transform-amplify-bolt-grant', meta: { amount: 2 } },
    });
    const r = reduce(state, { type: 'RESOLVE_PERM_GRANT', targetCardId: 't-amp' } as any);
    const updated = r.state.handCards.find(c => c.id === 't-amp') as any;
    expect(updated.transformEffect).toBe('amplify-bolt:2');
    expect(updated.transformBonus).toContain('魔弹');
  });

  it('APPLY_TRANSFORM_CATEGORY → AMPLIFY_CARDS_BY_NAME(魔弹, N) → amplifiedCardBonus[魔弹] += N', () => {
    const card: GameCardData = makeNonClassMagic('amp-card', 'AmpCard');
    (card as any).transformEffect = 'amplify-bolt:2';
    const state = makeState({
      amplifiedCardBonus: {},
      transformChainPrevCategory: 'weapon',
    } as any);
    const r = reduce(state, { type: 'APPLY_TRANSFORM_CATEGORY', card } as any);
    const drained = drain(r.state, r.enqueuedActions ?? []).state;
    expect(drained.amplifiedCardBonus['魔弹']).toBe(2);
  });

  it('stacks: existing amplify (3) + transform amplify (2) → 5', () => {
    const card: GameCardData = makeNonClassMagic('amp-card-2', 'AmpCard2');
    (card as any).transformEffect = 'amplify-bolt:2';
    const state = makeState({
      amplifiedCardBonus: { '魔弹': 3 },
      transformChainPrevCategory: 'weapon',
    } as any);
    const r = reduce(state, { type: 'APPLY_TRANSFORM_CATEGORY', card } as any);
    const drained = drain(r.state, r.enqueuedActions ?? []).state;
    expect(drained.amplifiedCardBonus['魔弹']).toBe(5);
  });
});
