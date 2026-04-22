/**
 * 蓄能裂击 (knight:durability-charge-burst) — Perm 2 magic.
 *
 * On play: opens slot-select. On RESOLVE_MAGIC_SLOT_SELECTION:
 *   1. equipment.maxDurability += 1, equipment.durability += 1
 *   2. If new durability == 4:
 *        - pick a random damageable monster from the active row
 *        - enqueue DEAL_DAMAGE_TO_MONSTER (damage = monster.hp, isSpellDamage)
 *        - equipment.durability -= 2 (regardless of whether a monster was hit)
 *
 * Empty slot or equipment without maxDurability → reject (magic NOT consumed).
 * Echo (A): repeats the entire effect echoMultiplier times in sequence.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeCard(idSuffix = 'dcb') {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic' as const,
    name: '蓄能裂击',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent' as const,
    magicEffect: '装备充能后裂击。',
    description: 'test',
    knightEffect: 'durability-charge-burst',
    recycleDelay: 2,
  };
}

function makeWeapon(overrides: Record<string, unknown> = {}): EquipmentItem {
  return {
    id: 'w1',
    type: 'weapon' as const,
    name: 'Test Sword',
    value: 4,
    durability: 3,
    maxDurability: 3,
    ...overrides,
  } as EquipmentItem;
}

function makeMonster(id: string, hp: number) {
  return {
    id,
    type: 'monster' as const,
    name: `M${id}`,
    value: hp,
    hp,
    maxHp: hp,
    attack: 0,
    currentLayer: 1,
  };
}

function activeRowOf(...monsters: ReturnType<typeof makeMonster>[]): ActiveRowSlots {
  const row: (ReturnType<typeof makeMonster> | null)[] = [null, null, null, null, null];
  for (let i = 0; i < monsters.length && i < 5; i++) row[i] = monsters[i];
  return row as unknown as ActiveRowSlots;
}

function isAlive(c: any): boolean {
  return !!c && (c.currentLayer ?? 1) > 0 && (c.hp ?? 0) > 0;
}

describe('蓄能裂击 (durability-charge-burst) 主效果', () => {
  it('PLAY_CARD opens slot-select pendingMagicAction', () => {
    const card = makeCard('cast');
    const state = makeState({ handCards: [card] });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('durability-charge-burst');
    expect((result.state.pendingMagicAction as any).step).toBe('slot-select');
  });

  it('empty slot rejected — magic NOT consumed, pendingMagicAction stays', () => {
    const card = makeCard('empty');
    const state = makeState({
      handCards: [card],
      equipmentSlot1: null,
      equipmentSlot2: null,
      pendingMagicAction: { card, effect: 'durability-charge-burst', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'durability-charge-burst', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect(result.state.handCards.some(c => c.id === card.id)).toBe(true);
  });

  it('equipment with maxDurability=0 rejected — magic NOT consumed', () => {
    const card = makeCard('no-dura');
    const noDuraEquip = makeWeapon({ id: 'wnone', durability: 0, maxDurability: 0 });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: noDuraEquip,
      equipmentSlot2: null,
      pendingMagicAction: { card, effect: 'durability-charge-burst', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'durability-charge-burst', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect(result.state.handCards.some(c => c.id === card.id)).toBe(true);
  });

  it('dura 1 → 2 (no trigger): just +1 maxDurability +1 durability', () => {
    const card = makeCard('1to2');
    // 注：装备耐久上限封顶 4（DURABILITY_CAP）。原测试用 maxDur=5 已不再合法。
    const wp = makeWeapon({ durability: 1, maxDurability: 3 });
    const m = makeMonster('m1', 7);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: wp,
      equipmentSlot2: null,
      activeCards: activeRowOf(m),
      pendingMagicAction: { card, effect: 'durability-charge-burst', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'durability-charge-burst', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const finalEquip = result.state.equipmentSlot1 as EquipmentItem;
    expect(finalEquip.maxDurability).toBe(4);
    expect(finalEquip.durability).toBe(2);
    // Monster untouched
    const finalMonster = result.state.activeCards.find(c => c?.id === 'm1') as any;
    expect(finalMonster.hp).toBe(7);
    expect(finalMonster.currentLayer).toBe(1);
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('dura 3 → 4 with 1 monster on board: trigger fires, monster takes 1-layer damage, dura ends at 2', () => {
    const card = makeCard('3to4');
    // maxDur 起始 3，触发后 clamp 到 4，dur 触发后 -2。
    const wp = makeWeapon({ durability: 3, maxDurability: 3 });
    const m = makeMonster('m1', 7); // 1 layer of 7 HP
    const state = makeState({
      handCards: [card],
      equipmentSlot1: wp,
      equipmentSlot2: null,
      activeCards: activeRowOf(m),
      pendingMagicAction: { card, effect: 'durability-charge-burst', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'durability-charge-burst', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const finalEquip = result.state.equipmentSlot1 as EquipmentItem;
    expect(finalEquip.maxDurability).toBe(4);
    expect(finalEquip.durability).toBe(2); // 3 → 4 → -2 = 2
    // Monster lost 1 layer (single layer at 7 HP, damage 7 → defeated)
    const finalMonster = result.state.activeCards.find(c => c?.id === 'm1');
    expect(isAlive(finalMonster)).toBe(false);
  });

  it('dura 3 → 4 with NO monsters on board: dura still drops to 2, no damage attempted', () => {
    const card = makeCard('no-mon');
    const wp = makeWeapon({ durability: 3, maxDurability: 3 });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: wp,
      equipmentSlot2: null,
      activeCards: activeRowOf(),
      pendingMagicAction: { card, effect: 'durability-charge-burst', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'durability-charge-burst', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const finalEquip = result.state.equipmentSlot1 as EquipmentItem;
    expect(finalEquip.maxDurability).toBe(4);
    expect(finalEquip.durability).toBe(2);
  });

  it('已在 cap 4/4 时使用：耐久上限和耐久都不变、不触发', () => {
    // 装备已经是 4/4，maxDurability 和 durability 都被 cap 静默吸收。
    // 由于 durability 没有真正 +1（仍为 4），不应触发裂击。
    const card = makeCard('cap-noop');
    const wp = makeWeapon({ durability: 4, maxDurability: 4 });
    const m = makeMonster('m1', 7);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: wp,
      equipmentSlot2: null,
      activeCards: activeRowOf(m),
      pendingMagicAction: { card, effect: 'durability-charge-burst', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'durability-charge-burst', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const finalEquip = result.state.equipmentSlot1 as EquipmentItem;
    expect(finalEquip.maxDurability).toBe(4);
    expect(finalEquip.durability).toBe(4); // 不变
    // 怪物未受到伤害
    const finalMonster = result.state.activeCards.find(c => c?.id === 'm1') as any;
    expect(finalMonster.hp).toBe(7);
    expect(finalMonster.currentLayer).toBe(1);
  });

  it('maxDur=4 / dur=3 → +1 dur 触发：maxDur 静默吸收为 4，dur 4 触发 → -2 = 2', () => {
    const card = makeCard('cap-trigger');
    const wp = makeWeapon({ durability: 3, maxDurability: 4 });
    const m = makeMonster('m1', 7);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: wp,
      equipmentSlot2: null,
      activeCards: activeRowOf(m),
      pendingMagicAction: { card, effect: 'durability-charge-burst', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'durability-charge-burst', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const finalEquip = result.state.equipmentSlot1 as EquipmentItem;
    expect(finalEquip.maxDurability).toBe(4);
    expect(finalEquip.durability).toBe(2);
    const finalMonster = result.state.activeCards.find(c => c?.id === 'm1');
    expect(isAlive(finalMonster)).toBe(false);
  });

  it('echoMultiplier x2: dura 2 → first +1 = 3 (no trigger) → second +1 = 4 (trigger, dura→2)', () => {
    const card = makeCard('echo-2to3to4');
    const wp = makeWeapon({ durability: 2, maxDurability: 3 });
    const m = makeMonster('m1', 5);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: wp,
      equipmentSlot2: null,
      activeCards: activeRowOf(m),
      pendingMagicAction: {
        card,
        effect: 'durability-charge-burst',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'durability-charge-burst', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const finalEquip = result.state.equipmentSlot1 as EquipmentItem;
    // 起始 maxDur=3，第一轮 +1 → 4（cap），第二轮 +1 但 cap 静默 → 仍为 4
    expect(finalEquip.maxDurability).toBe(4);
    // Round 1: 2→3 (no trigger). Round 2: 3→4 (trigger), then -2 → 2
    expect(finalEquip.durability).toBe(2);
    const finalMonster = result.state.activeCards.find(c => c?.id === 'm1');
    expect(isAlive(finalMonster)).toBe(false); // 5 HP single layer killed
  });

  it('echoMultiplier x2: dura 3 → first +1 = 4 (trigger, dura→2) → second +1 = 3 (no trigger)', () => {
    const card = makeCard('echo-3to4to3');
    const wp = makeWeapon({ durability: 3, maxDurability: 3 });
    const m = makeMonster('m1', 5);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: wp,
      equipmentSlot2: null,
      activeCards: activeRowOf(m),
      pendingMagicAction: {
        card,
        effect: 'durability-charge-burst',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'durability-charge-burst', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const finalEquip = result.state.equipmentSlot1 as EquipmentItem;
    expect(finalEquip.maxDurability).toBe(4);
    // Round 1: 3→4 (trigger) → 2. Round 2: 2→3 (no trigger)
    expect(finalEquip.durability).toBe(3);
    const finalMonster = result.state.activeCards.find(c => c?.id === 'm1');
    expect(isAlive(finalMonster)).toBe(false);
  });

  it('echoMultiplier x2: dura 3 → first 4 (trigger, dura→2) → second 3 → bonus pass: dura ends 3 (only 1 trigger)', () => {
    const card = makeCard('echo-1trig');
    const wp = makeWeapon({ durability: 3, maxDurability: 3 });
    const m1 = makeMonster('m1', 5);
    const m2 = makeMonster('m2', 9); // multi monsters
    const state = makeState({
      handCards: [card],
      equipmentSlot1: wp,
      equipmentSlot2: null,
      activeCards: activeRowOf(m1, m2),
      pendingMagicAction: {
        card,
        effect: 'durability-charge-burst',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'durability-charge-burst', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const finalEquip = result.state.equipmentSlot1 as EquipmentItem;
    expect(finalEquip.durability).toBe(3); // R1: 3→4 trigger →2; R2: 2→3 no trigger
    // Exactly one of m1/m2 should be defeated (random pick — only 1 trigger fired)
    const m1AliveAfter = result.state.activeCards.find(c => c?.id === 'm1');
    const m2AliveAfter = result.state.activeCards.find(c => c?.id === 'm2');
    const survivors = [m1AliveAfter, m2AliveAfter].filter(isAlive).length;
    expect(survivors).toBe(1);
  });

  it('works on slot 2 (right slot) too — slot-routing not hardcoded to slot1', () => {
    const card = makeCard('slot2');
    const wp = makeWeapon({ id: 'w2', durability: 3, maxDurability: 3 });
    const m = makeMonster('m1', 5);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: null,
      equipmentSlot2: wp,
      activeCards: activeRowOf(m),
      pendingMagicAction: { card, effect: 'durability-charge-burst', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'durability-charge-burst', slotId: 'equipmentSlot2' } as GameAction,
    ]);
    const finalEquip = result.state.equipmentSlot2 as EquipmentItem;
    expect(finalEquip.maxDurability).toBe(4);
    expect(finalEquip.durability).toBe(2);
  });

  it('clears pendingMagicAction after resolution (success path)', () => {
    const card = makeCard('clears');
    const wp = makeWeapon({ durability: 1, maxDurability: 3 });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: wp,
      equipmentSlot2: null,
      pendingMagicAction: { card, effect: 'durability-charge-burst', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'durability-charge-burst', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.pendingMagicAction).toBeNull();
  });
});
