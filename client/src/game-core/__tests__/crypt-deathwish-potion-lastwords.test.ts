/**
 * Regression: 墓语遗愿 (crypt-deathwish) must trigger ALL flavors of equipment
 * lastWords, twice per cast, and respect 法术回响 (×N).
 *
 * Prior history: the card has been broken multiple times.
 *   - 7e105ca: routed through computeEquipmentDisplacementLastWords so that
 *     monster-equipment lastWords (discard-hand-3, wraith-haunt-N,
 *     wraithDeathHeal, skeletonLastWordsDiscard) actually trigger.
 *   - This file: the CardDefinition resolver was a stub (just emitted
 *     card:magicResolved), so the entire card did nothing — including the
 *     new 遗赠淬炼药 lastWordsSlotTempBuff. Resolver now routes 0/1/N slots
 *     and reuses applyCryptDeathwish.
 *
 * These tests pin down EVERY lastWords flavor on the new resolver path so the
 * next refactor can't silently regress monster lastWords (or any other) again.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeCryptDeathwish(): GameCardData {
  return {
    id: 'magic-crypt-deathwish',
    type: 'magic',
    name: '墓语遗愿',
    value: 0,
    image: '',
    magicType: 'instant',
    magicEffect: 'crypt-deathwish',
    description: '触发一件装备的遗言效果 2 次；抽 1 张',
    recycleDelay: 0,
  } as GameCardData;
}

function makeWeaponWithPotionLastWords(): GameCardData {
  return {
    id: 'weapon-1',
    type: 'weapon',
    name: '测试剑',
    value: 0,
    image: '',
    durability: 5,
    maxDurability: 5,
    lastWordsSlotTempBuff: 1,
  } as GameCardData;
}

describe('墓语遗愿 + 遗赠淬炼药 lastWordsSlotTempBuff', () => {
  it('1 equipped slot: crypt-deathwish triggers slot temp buff 2 times (+6 attack +6 armor)', () => {
    const card = makeCryptDeathwish();
    const weapon = makeWeaponWithPotionLastWords();

    const state = makeState({
      handCards: [card] as any,
      equipmentSlot1: weapon as any,
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
    });

    const r1 = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: card.id, card } as GameAction,
    ]);

    // With 1 equipped slot, applyCryptDeathwish should run inline (no picker).
    // Each trigger gives +3 temp atk / +3 temp armor; 2 triggers = +6 / +6.
    expect(r1.state.slotTempAttack.equipmentSlot1).toBe(6);
    expect(r1.state.slotTempArmor.equipmentSlot1).toBe(6);
  });

  it('2 equipped slots: opens picker, then RESOLVE_EQUIPMENT_CHOICE applies +6/+6 to picked slot', () => {
    const card = makeCryptDeathwish();
    const weapon = makeWeaponWithPotionLastWords();
    const shield: GameCardData = {
      id: 'shield-1',
      type: 'shield',
      name: '测试盾',
      value: 0,
      image: '',
      durability: 5,
      maxDurability: 5,
    } as GameCardData;

    const state = makeState({
      handCards: [card] as any,
      equipmentSlot1: weapon as any,
      equipmentSlot2: shield as any,
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
    });

    const r1 = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: card.id, card } as GameAction,
    ]);
    expect(r1.state.pendingMagicAction).toBeTruthy();
    expect((r1.state.pendingMagicAction as any).effect).toBe('crypt-deathwish');

    const r2 = drain({ ...r1.state, phase: 'idle' } as GameState, [
      { type: 'RESOLVE_EQUIPMENT_CHOICE', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(r2.state.slotTempAttack.equipmentSlot1).toBe(6);
    expect(r2.state.slotTempArmor.equipmentSlot1).toBe(6);
    expect(r2.state.pendingMagicAction).toBeNull();
  });

  it('0 equipped slots: bails out with banner, no temp buff applied', () => {
    const card = makeCryptDeathwish();
    const state = makeState({
      handCards: [card] as any,
      equipmentSlot1: null,
      equipmentSlot2: null,
    });

    const r1 = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: card.id, card } as GameAction,
    ]);
    expect(r1.state.pendingMagicAction).toBeNull();
  });

  it('法术回响：echoMultiplier=2 → 4 triggers (+12 attack +12 armor)', () => {
    const card = makeCryptDeathwish();
    const weapon = makeWeaponWithPotionLastWords();

    const state = makeState({
      handCards: [card] as any,
      equipmentSlot1: weapon as any,
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
      doubleNextMagic: true,
    });

    const r1 = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: card.id, card } as GameAction,
    ]);

    // Echo doubles the trigger count: 2 base × 2 echo = 4 triggers; 4 × 3 = 12.
    expect(r1.state.slotTempAttack.equipmentSlot1).toBe(12);
    expect(r1.state.slotTempArmor.equipmentSlot1).toBe(12);
    expect(r1.state.doubleNextMagic).toBe(false);
  });

  it('法术回响 + 双装备 picker：echoMultiplier 通过 pendingMagicAction 透传到 RESOLVE_EQUIPMENT_CHOICE', () => {
    const card = makeCryptDeathwish();
    const weapon = makeWeaponWithPotionLastWords();
    const shield: GameCardData = {
      id: 'shield-1',
      type: 'shield',
      name: '测试盾',
      value: 0,
      image: '',
      durability: 5,
      maxDurability: 5,
    } as GameCardData;

    const state = makeState({
      handCards: [card] as any,
      equipmentSlot1: weapon as any,
      equipmentSlot2: shield as any,
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
      doubleNextMagic: true,
    });

    const r1 = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: card.id, card } as GameAction,
    ]);
    expect(r1.state.pendingMagicAction).toBeTruthy();
    expect((r1.state.pendingMagicAction as any).echoMultiplier).toBe(2);

    const r2 = drain({ ...r1.state, phase: 'idle' } as GameState, [
      { type: 'RESOLVE_EQUIPMENT_CHOICE', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(r2.state.slotTempAttack.equipmentSlot1).toBe(12);
    expect(r2.state.slotTempArmor.equipmentSlot1).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Regression: monster equipment lastWords must trigger via crypt-deathwish.
// (This is the bug the user mentioned — fixed once in 7e105ca, re-pinned here
// against the new CardDefinition resolver path.)
// ---------------------------------------------------------------------------

describe('墓语遗愿 + monster 装备遗言（防 7e105ca 回归）', () => {
  it('monster equip with lastWords=discard-hand-3: 触发 2 次 → 抽 6 张', () => {
    const card = makeCryptDeathwish();
    const monsterEquip: GameCardData = {
      id: 'm-equip-1',
      type: 'monster',
      name: '骷髅兵装',
      value: 0,
      image: '',
      durability: 5,
      maxDurability: 5,
      lastWords: 'discard-hand-3',
    } as GameCardData;
    const filler = (i: number): GameCardData => ({
      id: `bp-${i}`,
      type: 'magic',
      name: `卡${i}`,
      value: 0,
      image: '',
      magicType: 'instant',
    } as GameCardData);
    const backpack = Array.from({ length: 10 }, (_, i) => filler(i));

    const state = makeState({
      handCards: [card] as any,
      equipmentSlot1: monsterEquip as any,
      backpackItems: backpack,
      handLimitBonus: 20, // lift HAND_LIMIT so the draws aren't capped
    });
    const bpBefore = state.backpackItems.length;

    const r1 = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: card.id, card } as GameAction,
    ]);

    // 2 triggers × 3 = 6 backpack→hand draws + 1 trailing crypt-deathwish draw.
    expect(r1.state.backpackItems.length).toBe(bpBefore - 7);
  });

  it('monster equip with skeletonLastWordsDiscard: 触发 2 次 → 抽 2 张', () => {
    const card = makeCryptDeathwish();
    const skeletonEquip: GameCardData = {
      id: 'm-equip-skel',
      type: 'monster',
      name: '骷髅遗骸',
      value: 0,
      image: '',
      durability: 5,
      maxDurability: 5,
      skeletonLastWordsDiscard: true,
    } as GameCardData;
    const filler = (i: number): GameCardData => ({
      id: `bp-${i}`, type: 'magic', name: `卡${i}`, value: 0, image: '', magicType: 'instant',
    } as GameCardData);

    const state = makeState({
      handCards: [card] as any,
      equipmentSlot1: skeletonEquip as any,
      backpackItems: Array.from({ length: 10 }, (_, i) => filler(i)),
      handLimitBonus: 20,
    });
    const bpBefore = state.backpackItems.length;

    const r1 = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: card.id, card } as GameAction,
    ]);

    // 2 triggers × 1 + trailing 1 = 3 draws.
    expect(r1.state.backpackItems.length).toBe(bpBefore - 3);
  });

  it('monster equip with wraith-haunt-3: other slot gains +6 permanent damage (3 × 2 triggers)', () => {
    const card = makeCryptDeathwish();
    const wraithEquip: GameCardData = {
      id: 'm-equip-wraith',
      type: 'monster',
      name: '怨灵之装',
      value: 0,
      image: '',
      durability: 5,
      maxDurability: 5,
      lastWords: 'wraith-haunt-3',
    } as GameCardData;
    const otherWeapon: GameCardData = {
      id: 'w-other',
      type: 'weapon',
      name: '盟友剑',
      value: 0,
      image: '',
      durability: 5,
      maxDurability: 5,
    } as GameCardData;

    const state = makeState({
      handCards: [card] as any,
      equipmentSlot1: wraithEquip as any,
      equipmentSlot2: otherWeapon as any,
    });
    const baseDmg = state.equipmentSlotBonuses.equipmentSlot2.damage;

    // Pick equipmentSlot1 (the wraith) so the haunt aims at the OTHER slot.
    const r1 = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: card.id, card } as GameAction,
    ]);
    expect(r1.state.pendingMagicAction).toBeTruthy();

    const r2 = drain({ ...r1.state, phase: 'idle' } as GameState, [
      { type: 'RESOLVE_EQUIPMENT_CHOICE', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    // wraith-haunt-3 fires 2× → +3 + +3 = +6 permanent damage on the other slot.
    expect(r2.state.equipmentSlotBonuses.equipmentSlot2.damage).toBe(baseDmg + 6);
  });

  it('monster equip with wraithDeathHeal: 修复另一个装备 +1 耐久（命中至少 1 次）', () => {
    const card = makeCryptDeathwish();
    const wraith: GameCardData = {
      id: 'm-wraith',
      type: 'monster',
      name: '怨灵',
      value: 0,
      image: '',
      durability: 5,
      maxDurability: 5,
      wraithDeathHeal: 1,
    } as GameCardData;
    const damagedWeapon: GameCardData = {
      id: 'w-dmg',
      type: 'weapon',
      name: '残剑',
      value: 0,
      image: '',
      durability: 1,
      maxDurability: 5,
    } as GameCardData;

    const state = makeState({
      handCards: [card] as any,
      equipmentSlot1: wraith as any,
      equipmentSlot2: damagedWeapon as any,
    });

    const r1 = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: card.id, card } as GameAction,
    ]);
    const r2 = drain({ ...r1.state, phase: 'idle' } as GameState, [
      { type: 'RESOLVE_EQUIPMENT_CHOICE', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    // 2 triggers × +1 dur = +2; capped at maxDur=5 so durability = min(5, 1+2) = 3.
    expect((r2.state.equipmentSlot2 as any)?.durability).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Regression: generic equipment lastWords must accumulate across the 2 triggers
// (the original migration had a bug where the second trigger's patch overwrote
// the first; we test the canonical accumulating cases here).
// ---------------------------------------------------------------------------

describe('墓语遗愿 + generic onDestroy* 累加', () => {
  it('onDestroyGold=5: 2 triggers → +10 gold', () => {
    const card = makeCryptDeathwish();
    const weapon: GameCardData = {
      id: 'w-gold',
      type: 'weapon',
      name: '金币剑',
      value: 0,
      image: '',
      durability: 5,
      maxDurability: 5,
      onDestroyGold: 5,
    } as GameCardData;

    const state = makeState({
      handCards: [card] as any,
      equipmentSlot1: weapon as any,
      gold: 0,
    });

    const r1 = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: card.id, card } as GameAction,
    ]);
    expect(r1.state.gold).toBe(10);
  });

  it('onDestroyPermanentDamage=2: 2 triggers → slot1 永久伤害 +4', () => {
    const card = makeCryptDeathwish();
    const weapon: GameCardData = {
      id: 'w-pdmg',
      type: 'weapon',
      name: '永伤剑',
      value: 0,
      image: '',
      durability: 5,
      maxDurability: 5,
      onDestroyPermanentDamage: 2,
    } as GameCardData;

    const state = makeState({
      handCards: [card] as any,
      equipmentSlot1: weapon as any,
    });
    const baseDmg = state.equipmentSlotBonuses.equipmentSlot1.damage;

    const r1 = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: card.id, card } as GameAction,
    ]);
    expect(r1.state.equipmentSlotBonuses.equipmentSlot1.damage).toBe(baseDmg + 4);
  });
});
