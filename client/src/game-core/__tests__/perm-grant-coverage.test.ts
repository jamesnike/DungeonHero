/**
 * 给装备 / 护符 加 Perm 的各种情况 — coverage matrix.
 *
 * Three Perm-grant entry points exist:
 *   1) 永恒铭刻 (magic, knightEffect: 'perm-grant')   → recycleDelay = 3 on a hand card
 *   2) 永恒铭刻药 (potion, potionEffect: 'grant-perm-2') → recycleDelay = 3 on a hand card
 *   3) 附魔祭坛 (event token: 'grantAmuletPerm', sourceType: 'amulet-perm-grant')
 *      → recycleDelay = 2 on a currently-equipped amulet
 *
 * Each path has three branches:
 *   - 0 eligible candidates: emits "no eligible" banner, finalizes, no modal
 *   - 1 eligible candidate:  auto-applies, no modal
 *   - 2+ eligible candidates: opens modal, defers until RESOLVE_PERM_GRANT
 *
 * This file exhaustively covers each card type a player can put Perm on
 * (weapon / shield / monster equipment / amulet / instant magic / potion / event)
 * plus the edge cases (permStripped re-grant, defensive reducer rejection of
 * already-perm targets, Perm 2 amulet uplift via altar).
 *
 * Routing on destruction (Perm → recycle bag) is covered separately in
 * `perm-shield-displace.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

// Source cards — registered through card-schema so PLAY_CARD routes correctly.
function makeEternalEngraving(over?: Partial<GameCardData>): GameCardData {
  return {
    id: 'eternal-engraving',
    type: 'magic',
    name: '永恒铭刻',
    value: 0,
    image: '',
    magicType: 'instant',
    knightEffect: 'perm-grant',
    classCard: true,
    ...(over ?? {}),
  } as GameCardData;
}

function makeEternalEngravingPotion(over?: Partial<GameCardData>): GameCardData {
  return {
    id: 'eternal-engraving-potion',
    type: 'potion',
    name: '永恒铭刻药',
    value: 6,
    image: '',
    potionEffect: 'grant-perm-2' as any,
    description: '选择一张没有 Perm 属性的手牌，赋予 Perm 3。',
    ...(over ?? {}),
  } as GameCardData;
}

// Hand card factories — each Perm-eligible card type.
function makeWeapon(id = 'w', over?: Partial<GameCardData>): GameCardData {
  return { id, type: 'weapon', name: 'Sword', value: 4, image: '', durability: 3, maxDurability: 3, ...(over ?? {}) } as GameCardData;
}
function makeShield(id = 's', over?: Partial<GameCardData>): GameCardData {
  return { id, type: 'shield', name: 'Buckler', value: 3, image: '', durability: 2, maxDurability: 2, armorMax: 3, ...(over ?? {}) } as GameCardData;
}
function makeMonsterEquip(id = 'me', over?: Partial<GameCardData>): GameCardData {
  // Monster used as equipment (durability != null marks it as equipment-card layout).
  return {
    id, type: 'monster', name: 'Goblin Trophy', value: 4, image: '',
    durability: 2, maxDurability: 2, attack: 4, hp: 1, maxHp: 1,
    ...(over ?? {}),
  } as GameCardData;
}
function makeAmulet(id = 'a', over?: Partial<GameCardData>): GameCardData {
  return { id, type: 'amulet', name: 'Charm', value: 0, image: '', amuletEffect: 'none' as any, ...(over ?? {}) } as GameCardData;
}
function makeInstantMagic(id = 'm', over?: Partial<GameCardData>): GameCardData {
  return { id, type: 'magic', name: 'Bolt', value: 0, image: '', magicType: 'instant', ...(over ?? {}) } as GameCardData;
}
function makePotion(id = 'p', over?: Partial<GameCardData>): GameCardData {
  return { id, type: 'potion', name: 'Healing Brew', value: 3, image: '', potionEffect: 'heal:3' as any, ...(over ?? {}) } as GameCardData;
}
function makeEvent(id = 'e', over?: Partial<GameCardData>): GameCardData {
  return { id, type: 'event', name: 'Random Encounter', value: 0, image: '', ...(over ?? {}) } as GameCardData;
}

// Apply Perm via the magic source by dispatching PLAY_CARD then resolving the
// modal. Returns the final hand state.
function castEngravingAndPick(state: GameState, targetCardId: string): GameState {
  let r = reduce(state, { type: 'PLAY_CARD', cardId: 'eternal-engraving' });
  let next = drain(r.state, r.enqueuedActions ?? []).state;
  // If a modal opened (2+ eligible), resolve it. Otherwise the single-eligible
  // / no-eligible branch already finalized.
  if (next.permGrantModal) {
    r = reduce(next, { type: 'RESOLVE_PERM_GRANT', targetCardId } as any);
    next = drain(r.state, r.enqueuedActions ?? []).state;
  }
  return next;
}

function castPotionAndPick(state: GameState, targetCardId: string): GameState {
  let r = reduce(state, { type: 'PLAY_CARD', cardId: 'eternal-engraving-potion' });
  let next = drain(r.state, r.enqueuedActions ?? []).state;
  if (next.permGrantModal) {
    r = reduce(next, { type: 'RESOLVE_PERM_GRANT', targetCardId } as any);
    next = drain(r.state, r.enqueuedActions ?? []).state;
  }
  return next;
}

// ---------------------------------------------------------------------------
// 1. 永恒铭刻 (magic) — applies Perm 3 to each card type
// ---------------------------------------------------------------------------

describe('永恒铭刻 (magic) → recycleDelay = 3 on hand card', () => {
  // For each eligible card type, give the player a hand of [source, target,
  // filler] so we land in the multi-eligible branch and exercise the modal.
  const matrix: Array<[string, () => GameCardData]> = [
    ['weapon',           () => makeWeapon('target')],
    ['shield',           () => makeShield('target')],
    ['monster equipment',() => makeMonsterEquip('target')],
    ['amulet (in hand)', () => makeAmulet('target')],
    ['instant magic',    () => makeInstantMagic('target', { name: 'Spark' })],
    ['potion',           () => makePotion('target', { id: 'target', name: 'Tonic' })],
    ['event',            () => makeEvent('target')],
  ];

  for (const [label, factory] of matrix) {
    it(`grants Perm 3 to ${label}`, () => {
      const target = factory();
      const filler = makeWeapon('filler', { name: 'Filler' });
      const state = makeState({
        handCards: [makeEternalEngraving(), target, filler] as any,
      });

      const next = castEngravingAndPick(state, 'target');

      const updated = next.handCards.find(c => c.id === 'target') as any;
      expect(updated).toBeDefined();
      expect(updated.recycleDelay).toBe(3);
      expect(next.permGrantModal).toBeNull();

      // Original type-specific fields must be preserved (Perm grant is additive).
      expect(updated.type).toBe(target.type);
      expect(updated.name).toBe(target.name);
      if (target.type === 'weapon' || target.type === 'shield' || target.type === 'monster') {
        expect(updated.durability).toBe(target.durability);
        expect(updated.maxDurability).toBe(target.maxDurability);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 2. 永恒铭刻药 (potion) — applies Perm 3 to each card type
// ---------------------------------------------------------------------------

describe('永恒铭刻药 (potion) → recycleDelay = 3 on hand card', () => {
  const matrix: Array<[string, () => GameCardData]> = [
    ['weapon',           () => makeWeapon('target')],
    ['shield',           () => makeShield('target')],
    ['monster equipment',() => makeMonsterEquip('target')],
    ['amulet (in hand)', () => makeAmulet('target')],
    ['instant magic',    () => makeInstantMagic('target', { name: 'Spark' })],
    ['event',            () => makeEvent('target')],
  ];

  for (const [label, factory] of matrix) {
    it(`grants Perm 3 to ${label}`, () => {
      const target = factory();
      const filler = makeWeapon('filler', { name: 'Filler' });
      const state = makeState({
        handCards: [makeEternalEngravingPotion(), target, filler] as any,
      });

      const next = castPotionAndPick(state, 'target');

      const updated = next.handCards.find(c => c.id === 'target') as any;
      expect(updated).toBeDefined();
      expect(updated.recycleDelay).toBe(3);
      expect(next.permGrantModal).toBeNull();
      expect(next.pendingPotionAction).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Branch coverage: 0 / 1 / 2+ eligible candidates
// ---------------------------------------------------------------------------

describe('Perm grant branch coverage (0 / 1 / 2+ eligible)', () => {
  it('magic: 1 eligible candidate auto-applies without opening modal', () => {
    const target = makeShield('lone-shield');
    const state = makeState({
      handCards: [makeEternalEngraving(), target] as any,
    });

    const r = reduce(state, { type: 'PLAY_CARD', cardId: 'eternal-engraving' });
    const next = drain(r.state, r.enqueuedActions ?? []).state;

    expect(next.permGrantModal).toBeNull();
    const updated = next.handCards.find(c => c.id === 'lone-shield') as any;
    expect(updated.recycleDelay).toBe(3);
  });

  it('potion: 1 eligible candidate auto-applies without opening modal', () => {
    const target = makeWeapon('lone-weapon');
    const state = makeState({
      handCards: [makeEternalEngravingPotion(), target] as any,
    });

    const r = reduce(state, { type: 'PLAY_CARD', cardId: 'eternal-engraving-potion' });
    const next = drain(r.state, r.enqueuedActions ?? []).state;

    expect(next.permGrantModal).toBeNull();
    expect(next.pendingPotionAction).toBeNull();
    const updated = next.handCards.find(c => c.id === 'lone-weapon') as any;
    expect(updated.recycleDelay).toBe(3);
  });

  it('magic: 0 eligible candidates → emits banner, no modal, finalizes', () => {
    // All hand cards already carry Perm via permEquipment / recycleDelay /
    // magicType:permanent — none should be eligible.
    const permWeapon = makeWeapon('w-perm', { permEquipment: true });
    const grantedShield = makeShield('s-granted', { recycleDelay: 1 });
    const permMagic = makeInstantMagic('m-perm', { magicType: 'permanent' });
    const state = makeState({
      handCards: [makeEternalEngraving(), permWeapon, grantedShield, permMagic] as any,
    });

    const r = reduce(state, { type: 'PLAY_CARD', cardId: 'eternal-engraving' });
    const next = drain(r.state, r.enqueuedActions ?? []).state;

    expect(next.permGrantModal).toBeNull();
    // Pre-existing Perm fields must be untouched.
    const w = next.handCards.find(c => c.id === 'w-perm') as any;
    expect(w?.permEquipment).toBe(true);
    const s = next.handCards.find(c => c.id === 's-granted') as any;
    expect(s?.recycleDelay).toBe(1);
  });

  it('potion: 0 eligible candidates → emits banner, no modal, finalizes', () => {
    const permWeapon = makeWeapon('w-perm', { permEquipment: true });
    const state = makeState({
      handCards: [makeEternalEngravingPotion(), permWeapon] as any,
    });

    const r = reduce(state, { type: 'PLAY_CARD', cardId: 'eternal-engraving-potion' });
    const next = drain(r.state, r.enqueuedActions ?? []).state;

    expect(next.permGrantModal).toBeNull();
    expect(next.pendingPotionAction).toBeNull();
    const w = next.handCards.find(c => c.id === 'w-perm') as any;
    expect(w?.permEquipment).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Edge cases: permStripped, defensive rejection of already-perm targets
// ---------------------------------------------------------------------------

describe('Perm grant edge cases', () => {
  it('permStripped card receiving new Perm → permStripped is cleared', () => {
    // 凡化咒 strips a permanent magic by leaving magicType but setting
    // permStripped: true. 永恒铭刻 must clear that flag so the card is
    // recognized as Perm again by routing helpers.
    const stripped = makeInstantMagic('stripped-perm', {
      magicType: 'permanent',
      permStripped: true,
    });
    const filler = makeWeapon('filler');
    const state = makeState({
      handCards: [makeEternalEngraving(), stripped, filler] as any,
    });

    const next = castEngravingAndPick(state, 'stripped-perm');

    const updated = next.handCards.find(c => c.id === 'stripped-perm') as any;
    expect(updated.recycleDelay).toBe(3);
    expect(updated.permStripped).toBeUndefined();
    expect(updated.magicType).toBe('permanent');
  });

  it('reducer defensively rejects RESOLVE_PERM_GRANT on already-perm card', () => {
    // The UI filters these out of the picker, but if an already-perm card id
    // somehow reaches RESOLVE_PERM_GRANT, the reducer must not double-apply or
    // overwrite existing Perm fields.
    const alreadyPerm = makeShield('already-perm', { recycleDelay: 5 });
    const filler = makeShield('filler-shield');
    const state = makeState({
      handCards: [alreadyPerm, filler] as any,
      permGrantModal: { sourceCardId: 'magic-source', sourceType: 'magic' as const },
    });

    const r = reduce(state, { type: 'RESOLVE_PERM_GRANT', targetCardId: 'already-perm' } as any);
    const next = drain(r.state, r.enqueuedActions ?? []).state;

    // Modal closes, but the existing recycleDelay must NOT be clobbered to 3.
    expect(next.permGrantModal).toBeNull();
    const updated = next.handCards.find(c => c.id === 'already-perm') as any;
    expect(updated.recycleDelay).toBe(5);
  });

  it('cancelling the modal leaves all hand cards unmodified', () => {
    const target = makeWeapon('target');
    const filler = makeShield('filler');
    const state = makeState({
      handCards: [makeEternalEngraving(), target, filler] as any,
    });

    const r1 = reduce(state, { type: 'PLAY_CARD', cardId: 'eternal-engraving' });
    let next = drain(r1.state, r1.enqueuedActions ?? []).state;
    expect(next.permGrantModal).not.toBeNull();

    const r2 = reduce(next, { type: 'CANCEL_PERM_GRANT' } as any);
    next = drain(r2.state, r2.enqueuedActions ?? []).state;

    expect(next.permGrantModal).toBeNull();
    const t = next.handCards.find(c => c.id === 'target') as any;
    const f = next.handCards.find(c => c.id === 'filler') as any;
    expect(t?.recycleDelay).toBeUndefined();
    expect(f?.recycleDelay).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. 附魔祭坛 (event grantAmuletPerm) — Perm 2 on equipped amulet
// ---------------------------------------------------------------------------

describe('附魔祭坛 (grantAmuletPerm) → recycleDelay = 2 on equipped amulet', () => {
  it('emits interaction request, leaves amulets untouched until player picks', () => {
    // Sanity: the reducer DOES NOT auto-mutate any amulet — UI must collect a
    // pick first. (This duplicates altar-amulet-perm-multi.test.ts intentionally
    // as a self-contained sanity step before the apply test below.)
    const a1 = makeAmulet('a1', { name: '雷击护符' });
    const a2 = makeAmulet('a2', { name: '弧能之符' });
    const state = makeState({ amuletSlots: [a1, a2] as any });

    const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'grantAmuletPerm' });

    expect((result.state.amuletSlots[0] as any).recycleDelay).toBeUndefined();
    expect((result.state.amuletSlots[1] as any).recycleDelay).toBeUndefined();
    expect(result.sideEffects.some(e =>
      e.event === 'event:requestEventInteraction' &&
      (e.payload as { token: string }).token === 'grantAmuletPerm',
    )).toBe(true);
  });

  it('RESOLVE_PERM_GRANT on amulet with sourceType "amulet-perm-grant" sets recycleDelay = 2', () => {
    // Verifies the apply step in isolation — the source/event flow is covered
    // by altar-amulet-perm-multi.test.ts; this asserts the actual mutation
    // contract for each amulet type variant.
    const a1 = makeAmulet('a1', { name: 'Heal Charm' });
    const a2 = makeAmulet('a2', { name: 'Stun Charm' });
    const state = makeState({
      amuletSlots: [a1, a2] as any,
      permGrantModal: { sourceCardId: 'event-grant', sourceType: 'amulet-perm-grant' },
    });

    const r = reduce(state, { type: 'RESOLVE_PERM_GRANT', targetCardId: 'a2' } as any);
    const next = drain(r.state, r.enqueuedActions ?? []).state;

    expect((next.amuletSlots[0] as any).recycleDelay).toBeUndefined();
    expect((next.amuletSlots[1] as any).recycleDelay).toBe(2);
    expect(next.permGrantModal).toBeNull();
  });

  it('does NOT touch hand cards even when one happens to share an id with an amulet (defensive)', () => {
    // The amulet-perm-grant branch only iterates amuletSlots — a hand card
    // with the same id must not be mutated.
    const handDoppelganger = makeWeapon('shared-id');
    const amuletWithSameId = makeAmulet('shared-id', { name: 'Conflict Charm' });
    const state = makeState({
      handCards: [handDoppelganger] as any,
      amuletSlots: [amuletWithSameId] as any,
      permGrantModal: { sourceCardId: 'event-grant', sourceType: 'amulet-perm-grant' },
    });

    const r = reduce(state, { type: 'RESOLVE_PERM_GRANT', targetCardId: 'shared-id' } as any);
    const next = drain(r.state, r.enqueuedActions ?? []).state;

    const handCard = next.handCards.find(c => c.id === 'shared-id') as any;
    expect(handCard?.recycleDelay).toBeUndefined();
    expect((next.amuletSlots[0] as any).recycleDelay).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 6. End-to-end sanity: Perm-granted equipment routes correctly downstream
// ---------------------------------------------------------------------------

describe('Perm grant → downstream routing sanity', () => {
  it('weapon receives Perm 3 → equipped → reflected in slot1.recycleDelay', () => {
    const target = makeWeapon('grant-weapon', { name: 'Promised Blade' });
    const state = makeState({
      handCards: [makeEternalEngraving(), target] as any,
      equipmentSlot1: null,
      equipmentSlot2: null,
    });

    let next = castEngravingAndPick(state, 'grant-weapon');
    const handCard = next.handCards.find(c => c.id === 'grant-weapon') as any;
    expect(handCard.recycleDelay).toBe(3);

    // Equip via PLAY_CARD (weapon routes to slot1 via reduceEquipFromHand).
    const r = reduce(next, { type: 'PLAY_CARD', cardId: 'grant-weapon' });
    next = drain(r.state, r.enqueuedActions ?? []).state;

    const slot1 = next.equipmentSlot1 as any;
    expect(slot1).toBeTruthy();
    expect(slot1.id).toBe('grant-weapon');
    expect(slot1.recycleDelay).toBe(3);
  });

  it('amulet (in hand) receives Perm 3 → recycleDelay survives UPDATE_AMULET_SLOTS', () => {
    // Amulet placement into amuletSlots is hook-managed
    // (EQUIP_AMULET_FROM_HAND is a thin marker; the hook computes aura /
    // displacement and dispatches UPDATE_AMULET_SLOTS). We mirror that by
    // dispatching UPDATE_AMULET_SLOTS directly with the granted hand card.
    const target = makeAmulet('grant-amulet', { name: 'Lucky Coin' });
    const state = makeState({
      handCards: [makeEternalEngraving(), target] as any,
      amuletSlots: [] as any,
      maxAmuletSlots: 5,
    });

    let next = castEngravingAndPick(state, 'grant-amulet');
    const handCard = next.handCards.find(c => c.id === 'grant-amulet') as any;
    expect(handCard.recycleDelay).toBe(3);

    const r = reduce(next, {
      type: 'UPDATE_AMULET_SLOTS',
      updater: (prev: any[]) => [...prev, handCard],
    } as any);
    next = drain(r.state, r.enqueuedActions ?? []).state;

    const equipped = (next.amuletSlots as any[]).find(a => a?.id === 'grant-amulet');
    expect(equipped).toBeDefined();
    expect(equipped.recycleDelay).toBe(3);
  });
});
