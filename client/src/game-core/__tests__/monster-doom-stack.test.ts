/**
 * 灭世裁决 (hero-magic monster-doom) — stacked equipment behavior.
 *
 * Same treatment as 弃装重铸 (knight:discard-rebuild):
 *   - Acts on EVERY stacked equipment piece (main + each reserve item)
 *     across both equipment slots.
 *   - Each piece independently revive-checked. Revived pieces stay in
 *     original stack position at 1 durability.
 *   - Non-revived pieces fire last-words, then route to graveyard / recycle.
 *   - Monster debuff (-2 ATK / -2 max HP per destroyed piece) scales with
 *     **destroyedCount** (revived doesn't count toward debuff — preserves
 *     original 灭世裁决 semantic).
 *   - 招灵书印 hook also uses true-destruction count.
 *   - Surviving items compacted top-down to maintain reserve invariant
 *     (reserve.length > 0 ⇒ main != null).
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as ActiveRowSlots,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    heroMagicState: {
      'monster-doom': { unlocked: true, gauge: 100, usedThisWave: false },
    } as any,
    pendingHeroMagicAction: null,
    ...overrides,
  };
}

function makeWeapon(id: string, overrides: Partial<GameCardData> = {}): GameCardData {
  return {
    id,
    type: 'weapon',
    name: `Sword-${id}`,
    value: 3,
    durability: 3,
    maxDurability: 3,
    ...overrides,
  } as GameCardData;
}

function makeShield(id: string, overrides: Partial<GameCardData> = {}): GameCardData {
  return {
    id,
    type: 'shield',
    name: `Shield-${id}`,
    value: 3,
    durability: 2,
    maxDurability: 2,
    armorMax: 3,
    ...overrides,
  } as GameCardData;
}

function makeMonster(id: string, attack: number, hp: number = 10): GameCardData {
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

function activate(state: GameState) {
  return drain(state, [
    { type: 'ACTIVATE_HERO_MAGIC', magicId: 'monster-doom', origin: 'gauge' } as GameAction,
  ]);
}

describe('灭世裁决 (monster-doom) — stacked equipment', () => {
  it('STACK: slot1 main + 2 reserve, all no revive → 3 pieces destroyed, monster -6 ATK / -6 maxHP', () => {
    const monster = makeMonster('m1', 10, 10);
    const slots = [null, null, null, null, null] as ActiveRowSlots;
    slots[0] = monster;

    const main = makeWeapon('w-main');
    const r1 = makeWeapon('w-r1');
    const r2 = makeWeapon('w-r2');
    const state = makeState({
      equipmentSlot1: main as any,
      equipmentSlot1Reserve: [r1, r2] as any,
      equipmentSlot2: null,
      activeCards: slots,
    });

    const result = activate(state);

    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.equipmentSlot1Reserve).toHaveLength(0);
    expect(result.state.discardedCards.some(c => c.id === 'w-main')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'w-r1')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'w-r2')).toBe(true);

    const m = result.state.activeCards[0] as any;
    // 3 destroyed × 2 = 6 debuff. Monster started at 10/10.
    expect(m.attack).toBe(4);
    expect(m.maxHp).toBe(4);
  });

  it('STACK: 1 reserve has revive → revived stays as new main, 2 destroyed → -4 ATK / -4 maxHP', () => {
    const monster = makeMonster('m1', 10, 10);
    const slots = [null, null, null, null, null] as ActiveRowSlots;
    slots[0] = monster;

    const main = makeWeapon('w-main');
    // Reserve middle item has revive.
    const r1 = makeWeapon('w-r1', { hasEquipmentRevive: true, durability: 0 });
    const r2 = makeWeapon('w-r2');
    const state = makeState({
      equipmentSlot1: main as any,
      equipmentSlot1Reserve: [r1, r2] as any, // r2 = top of reserve, r1 below
      equipmentSlot2: null,
      activeCards: slots,
    });

    const result = activate(state);

    // Stack visual: [main, r2, r1]. main destroyed, r2 destroyed, r1 revived.
    // Only r1 survives → becomes new main (single survivor compacts up).
    expect((result.state.equipmentSlot1 as any).id).toBe('w-r1');
    expect((result.state.equipmentSlot1 as any).durability).toBe(1);
    expect((result.state.equipmentSlot1 as any).equipmentReviveUsed).toBe(true);
    expect(result.state.equipmentSlot1Reserve).toHaveLength(0);
    expect(result.state.discardedCards.some(c => c.id === 'w-main')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'w-r2')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'w-r1')).toBe(false);

    const m = result.state.activeCards[0] as any;
    // 2 destroyed × 2 = 4 debuff. Revived doesn't count.
    expect(m.attack).toBe(6);
    expect(m.maxHp).toBe(6);
  });

  it('STACK: all revive → no monster debuff, all stay in original positions', () => {
    const monster = makeMonster('m1', 10, 10);
    const slots = [null, null, null, null, null] as ActiveRowSlots;
    slots[0] = monster;

    const main = makeWeapon('w-main', { hasEquipmentRevive: true, durability: 0 });
    const r1 = makeWeapon('w-r1', { hasEquipmentRevive: true, durability: 0 });
    const r2 = makeWeapon('w-r2', { hasEquipmentRevive: true, durability: 0 });
    const state = makeState({
      equipmentSlot1: main as any,
      equipmentSlot1Reserve: [r1, r2] as any,
      equipmentSlot2: null,
      activeCards: slots,
    });

    const result = activate(state);

    // All revive in original positions:
    expect((result.state.equipmentSlot1 as any).id).toBe('w-main');
    expect(result.state.equipmentSlot1Reserve).toHaveLength(2);
    expect((result.state.equipmentSlot1Reserve[0] as any).id).toBe('w-r1');
    expect((result.state.equipmentSlot1Reserve[1] as any).id).toBe('w-r2');
    expect(result.state.discardedCards.some(c => ['w-main', 'w-r1', 'w-r2'].includes(c.id))).toBe(false);

    const m = result.state.activeCards[0] as any;
    // 0 destroyed → no debuff.
    expect(m.attack).toBe(10);
    expect(m.maxHp).toBe(10);
  });

  it('STACK PROMOTE: main destroyed + 1 reserve revives → reserve auto-promotes to main slot, -2/-2 debuff', () => {
    // Minimal 2-piece scenario explicitly verifying the user-facing contract:
    // when 灭世裁决 destroys the upper-layer (main) and the lower layer
    // (reserve) has revive, the revived reserve is automatically promoted up
    // into the main slot — it does NOT linger in reserve while main is null.
    const monster = makeMonster('m1', 10, 10);
    const slots = [null, null, null, null, null] as ActiveRowSlots;
    slots[0] = monster;

    const main = makeWeapon('w-main'); // no revive → destroyed
    const r1 = makeWeapon('w-r1', { hasEquipmentRevive: true, durability: 0 });
    const state = makeState({
      equipmentSlot1: main as any,
      equipmentSlot1Reserve: [r1] as any,
      equipmentSlot2: null,
      activeCards: slots,
    });

    const result = activate(state);

    // r1 promoted from reserve → main slot.
    expect(result.state.equipmentSlot1).not.toBeNull();
    expect((result.state.equipmentSlot1 as any).id).toBe('w-r1');
    expect((result.state.equipmentSlot1 as any).durability).toBe(1);
    expect((result.state.equipmentSlot1 as any).equipmentReviveUsed).toBe(true);
    expect(result.state.equipmentSlot1Reserve).toHaveLength(0);
    expect(result.state.discardedCards.some(c => c.id === 'w-main')).toBe(true);

    const m = result.state.activeCards[0] as any;
    // 1 destroyed × 2 = 2 debuff. Revived doesn't count.
    expect(m.attack).toBe(8);
    expect(m.maxHp).toBe(8);
  });

  it('STACK PROMOTE: main destroyed + middle reserve destroyed + bottom reserve revives → bottom skips up to main slot', () => {
    // Verify promote-up works across multiple destroyed layers. The
    // bottom-most surviving piece skips a destroyed middle layer to fill main.
    const monster = makeMonster('m1', 20, 20);
    const slots = [null, null, null, null, null] as ActiveRowSlots;
    slots[0] = monster;

    const main = makeWeapon('w-main'); // destroyed
    const r1 = makeWeapon('w-r1', { hasEquipmentRevive: true, durability: 0 }); // bottom, revives
    const r2 = makeWeapon('w-r2'); // top of reserve, destroyed
    const state = makeState({
      equipmentSlot1: main as any,
      equipmentSlot1Reserve: [r1, r2] as any, // r2 = top, r1 = bottom
      equipmentSlot2: null,
      activeCards: slots,
    });

    const result = activate(state);

    // Stack visual top→bottom = [main, r2, r1]. Only r1 survives.
    // It compacts up past the destroyed r2 to become the new main.
    expect((result.state.equipmentSlot1 as any).id).toBe('w-r1');
    expect((result.state.equipmentSlot1 as any).durability).toBe(1);
    expect(result.state.equipmentSlot1Reserve).toHaveLength(0);

    const m = result.state.activeCards[0] as any;
    // 2 destroyed × 2 = 4 debuff.
    expect(m.attack).toBe(16);
    expect(m.maxHp).toBe(16);
  });

  it('STACK PROMOTE: main revives + top reserve destroyed + bottom reserve revives → bottom fills the gap (main stays main)', () => {
    // When main itself revives, it stays as main — but a destroyed middle
    // layer is still "filled" by the surviving bottom layer compacting up.
    const monster = makeMonster('m1', 20, 20);
    const slots = [null, null, null, null, null] as ActiveRowSlots;
    slots[0] = monster;

    const main = makeWeapon('w-main', { hasEquipmentRevive: true, durability: 0 }); // revives
    const r1 = makeWeapon('w-r1', { hasEquipmentRevive: true, durability: 0 }); // bottom, revives
    const r2 = makeWeapon('w-r2'); // top reserve, destroyed
    const state = makeState({
      equipmentSlot1: main as any,
      equipmentSlot1Reserve: [r1, r2] as any,
      equipmentSlot2: null,
      activeCards: slots,
    });

    const result = activate(state);

    // Survivors top-down = [main, r1]. main stays main, r1 fills the
    // single reserve slot (was bottom-of-reserve, now the only reserve item).
    expect((result.state.equipmentSlot1 as any).id).toBe('w-main');
    expect((result.state.equipmentSlot1 as any).equipmentReviveUsed).toBe(true);
    expect(result.state.equipmentSlot1Reserve).toHaveLength(1);
    expect((result.state.equipmentSlot1Reserve[0] as any).id).toBe('w-r1');
    expect(result.state.discardedCards.some(c => c.id === 'w-r2')).toBe(true);

    const m = result.state.activeCards[0] as any;
    // Only r2 destroyed → 1 × 2 = 2 debuff.
    expect(m.attack).toBe(18);
    expect(m.maxHp).toBe(18);
  });

  it('STACK: both slots stacked, mixed → debuff = total destroyed × 2', () => {
    const monster = makeMonster('m1', 20, 20);
    const slots = [null, null, null, null, null] as ActiveRowSlots;
    slots[0] = monster;

    // Slot 1: main + 1 reserve, both no revive = 2 destroyed
    const m1 = makeWeapon('w-m1');
    const r1 = makeWeapon('w-r1');
    // Slot 2: main + 2 reserve, all no revive = 3 destroyed
    const m2 = makeShield('s-m2');
    const sr1 = makeShield('s-r1');
    const sr2 = makeShield('s-r2');
    const state = makeState({
      equipmentSlot1: m1 as any,
      equipmentSlot1Reserve: [r1] as any,
      equipmentSlot2: m2 as any,
      equipmentSlot2Reserve: [sr1, sr2] as any,
      activeCards: slots,
    });

    const result = activate(state);

    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.equipmentSlot1Reserve).toHaveLength(0);
    expect(result.state.equipmentSlot2).toBeNull();
    expect(result.state.equipmentSlot2Reserve).toHaveLength(0);
    expect(result.state.discardedCards.filter(c =>
      ['w-m1', 'w-r1', 's-m2', 's-r1', 's-r2'].includes(c.id),
    )).toHaveLength(5);

    const m = result.state.activeCards[0] as any;
    // 5 destroyed × 2 = 10 debuff. Monster started at 20/20.
    expect(m.attack).toBe(10);
    expect(m.maxHp).toBe(10);
  });

  it('STACK: reserve item with onDestroyPermanentDamage → its slot gets the perm-damage bonus', () => {
    const monster = makeMonster('m1', 10, 10);
    const slots = [null, null, null, null, null] as ActiveRowSlots;
    slots[0] = monster;

    const main = makeWeapon('w-main');
    const r1 = makeWeapon('w-r1', { onDestroyPermanentDamage: 2 });
    const state = makeState({
      equipmentSlot1: main as any,
      equipmentSlot1Reserve: [r1] as any,
      equipmentSlot2: null,
      activeCards: slots,
    });

    const result = activate(state);

    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.equipmentSlot1Reserve).toHaveLength(0);
    // Reserve item's last-words fired: slot1 perm damage +2.
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.damage).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // Monster equipment (persuaded monsters) — should be treated identically.
  // -------------------------------------------------------------------------

  it('MONSTER: monster equip in main slot, no revive → destroyed (currentLayer reset to 1), debuff -2 ATK / -2 maxHP', () => {
    const monster = makeMonster('m1', 10, 10);
    const slots = [null, null, null, null, null] as ActiveRowSlots;
    slots[0] = monster;

    const monsterEquip: GameCardData = {
      id: 'mon-main',
      type: 'monster',
      name: 'Goblin-Equip',
      value: 3,
      image: '',
      hp: 5,
      maxHp: 5,
      attack: 3,
      durability: 2,
      maxDurability: 2,
      currentLayer: 2,
      fury: 2,
    } as GameCardData;
    const state = makeState({
      equipmentSlot1: monsterEquip as any,
      equipmentSlot2: null,
      activeCards: slots,
    });

    const result = activate(state);

    expect(result.state.equipmentSlot1).toBeNull();
    const inGrave = result.state.discardedCards.find(c => c.id === 'mon-main') as any;
    expect(inGrave).toBeDefined();
    // currentLayer must be reset to 1 in graveyard.
    expect(inGrave.currentLayer).toBe(1);

    const m = result.state.activeCards[0] as any;
    expect(m.attack).toBe(8);
    expect(m.maxHp).toBe(8);
  });

  it('MONSTER: monster equip with native hasRevive → revives at 1 dur, no debuff', () => {
    const monster = makeMonster('m1', 10, 10);
    const slots = [null, null, null, null, null] as ActiveRowSlots;
    slots[0] = monster;

    const monsterEquip: GameCardData = {
      id: 'mon-rev-main',
      type: 'monster',
      name: 'Phoenix-Equip',
      value: 3,
      image: '',
      hp: 5,
      maxHp: 5,
      attack: 3,
      durability: 2,
      maxDurability: 2,
      hasRevive: true,
      reviveUsed: false,
    } as GameCardData;
    const state = makeState({
      equipmentSlot1: monsterEquip as any,
      equipmentSlot2: null,
      activeCards: slots,
    });

    const result = activate(state);

    expect(result.state.equipmentSlot1).not.toBeNull();
    const slot = result.state.equipmentSlot1 as any;
    expect(slot.id).toBe('mon-rev-main');
    expect(slot.durability).toBe(1);
    expect(slot.reviveUsed).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'mon-rev-main')).toBe(false);

    const m = result.state.activeCards[0] as any;
    // 0 destroyed → no debuff (revive doesn't count toward debuff).
    expect(m.attack).toBe(10);
    expect(m.maxHp).toBe(10);
  });

  it('MONSTER: monster equip in RESERVE → also processed and counts toward debuff', () => {
    const monster = makeMonster('m1', 10, 10);
    const slots = [null, null, null, null, null] as ActiveRowSlots;
    slots[0] = monster;

    const main = makeWeapon('w-main');
    const monsterReserve: GameCardData = {
      id: 'mon-res-r1',
      type: 'monster',
      name: 'Goblin-Reserve',
      value: 3,
      image: '',
      hp: 5,
      maxHp: 5,
      attack: 3,
      durability: 2,
      maxDurability: 2,
      currentLayer: 1,
    } as GameCardData;
    const state = makeState({
      equipmentSlot1: main as any,
      equipmentSlot1Reserve: [monsterReserve] as any,
      equipmentSlot2: null,
      activeCards: slots,
    });

    const result = activate(state);

    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.equipmentSlot1Reserve).toHaveLength(0);
    expect(result.state.discardedCards.some(c => c.id === 'w-main')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'mon-res-r1')).toBe(true);

    const m = result.state.activeCards[0] as any;
    // 2 destroyed × 2 = 4 debuff.
    expect(m.attack).toBe(6);
    expect(m.maxHp).toBe(6);
  });

  it('MONSTER: wraith-haunt last-words on monster equip → other slot gets the haunt damage bonus', () => {
    const monster = makeMonster('m1', 10, 10);
    const slots = [null, null, null, null, null] as ActiveRowSlots;
    slots[0] = monster;

    const wraith: GameCardData = {
      id: 'mon-wraith',
      type: 'monster',
      name: 'Wraith-Equip',
      value: 3,
      image: '',
      hp: 5,
      maxHp: 5,
      attack: 3,
      durability: 2,
      maxDurability: 2,
      lastWords: 'wraith-haunt-3',
    } as GameCardData;
    const otherShield = makeShield('s-other');
    const state = makeState({
      equipmentSlot1: wraith as any,
      equipmentSlot2: otherShield as any,
      activeCards: slots,
    });

    const result = activate(state);

    // wraith destroyed → wraith-haunt-3 → slot2 (other slot at cast time) +3 damage.
    // Note: slot2's shield is also destroyed in the same cast, but the bonus is
    // applied to the SLOT (equipmentSlotBonuses), not the shield item itself,
    // so it persists.
    expect(result.state.equipmentSlotBonuses.equipmentSlot2.damage).toBeGreaterThanOrEqual(3);
  });

  it('REGRESSION: original single-slot single-piece behavior still works (no reserve)', () => {
    const monster = makeMonster('m1', 10, 10);
    const slots = [null, null, null, null, null] as ActiveRowSlots;
    slots[0] = monster;

    const weapon = makeWeapon('w1');
    const state = makeState({
      equipmentSlot1: weapon as any,
      equipmentSlot2: null,
      equipmentSlot1Reserve: [],
      equipmentSlot2Reserve: [],
      activeCards: slots,
    });

    const result = activate(state);

    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.discardedCards.some(c => c.id === 'w1')).toBe(true);

    const m = result.state.activeCards[0] as any;
    // 1 destroyed × 2 = 2 debuff.
    expect(m.attack).toBe(8);
    expect(m.maxHp).toBe(8);
  });
});
