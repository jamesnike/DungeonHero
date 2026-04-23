/**
 * 锋刃侧击 (knight:temp-attack-strike) — Perm 1 magic.
 *
 * After 2026-04 redesign:
 *   damage = computeSpellDamagePure(state, slotPermAtk + slotTempAtk + amplifyBonus) * echoMultiplier
 *
 *   slotPermAtk = getSlotBonus(state, slotId, 'damage')
 *               = state.equipmentSlotBonuses[slotId].damage
 *
 * Previously damage only used `slotTempAtk`. These tests lock in the new
 * formula and verify the "no damage" branch fires only when both perm and
 * temp are 0.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeCard(idSuffix = 'tas') {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic' as const,
    name: '锋刃侧击',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent' as const,
    magicEffect: '永久攻击+临时攻击转化为伤害，侧击击晕。',
    description: 'test',
    knightEffect: 'temp-attack-strike',
    flankEffect: '40% 概率击晕目标',
    recycleDelay: 1,
  };
}

function makeWeapon(id = 'w1') {
  return {
    id,
    type: 'weapon' as const,
    name: 'TestWeapon',
    value: 2,
    durability: 2,
    maxDurability: 2,
  } as any;
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
  } as any;
}

function activeRowOf(...monsters: ReturnType<typeof makeMonster>[]): ActiveRowSlots {
  const row: (ReturnType<typeof makeMonster> | null)[] = [null, null, null, null, null];
  for (let i = 0; i < monsters.length && i < 5; i++) row[i] = monsters[i];
  return row as unknown as ActiveRowSlots;
}

function withSlotDamageBonus(slot1: number, slot2 = 0): Pick<GameState, 'equipmentSlotBonuses'> {
  return {
    equipmentSlotBonuses: {
      equipmentSlot1: { damage: slot1, shield: 0 },
      equipmentSlot2: { damage: slot2, shield: 0 },
    },
  };
}

describe('锋刃侧击 (temp-attack-strike) — damage = slotPermAtk + slotTempAtk', () => {
  it('permAtk 3 + tempAtk 4 → 7 伤害', () => {
    const card = makeCard('a');
    const monster = makeMonster('m1', 100);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeWeapon('w1'),
      equipmentSlot2: null,
      activeCards: activeRowOf(monster),
      slotTempAttack: { equipmentSlot1: 4, equipmentSlot2: 0 },
      ...withSlotDamageBonus(3),
      pendingMagicAction: {
        card,
        effect: 'temp-attack-strike',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 1,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(93);
  });

  it('只有 permAtk 5（tempAtk 0）→ 5 伤害（不再被"无临时攻击"分支误判）', () => {
    const card = makeCard('b');
    const monster = makeMonster('m1', 50);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeWeapon(),
      equipmentSlot2: null,
      activeCards: activeRowOf(monster),
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      ...withSlotDamageBonus(5),
      pendingMagicAction: {
        card,
        effect: 'temp-attack-strike',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 1,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(45);
  });

  it('只有 tempAtk 6（permAtk 0）→ 6 伤害（保持旧行为）', () => {
    const card = makeCard('c');
    const monster = makeMonster('m1', 50);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeWeapon(),
      equipmentSlot2: null,
      activeCards: activeRowOf(monster),
      slotTempAttack: { equipmentSlot1: 6, equipmentSlot2: 0 },
      ...withSlotDamageBonus(0),
      pendingMagicAction: {
        card,
        effect: 'temp-attack-strike',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 1,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(44);
  });

  it('permAtk 0 + tempAtk 0 → 命中"造成 0 点伤害"分支，怪物 hp 不变', () => {
    const card = makeCard('zero');
    const monster = makeMonster('m1', 50);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeWeapon(),
      equipmentSlot2: null,
      activeCards: activeRowOf(monster),
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
      ...withSlotDamageBonus(0),
      pendingMagicAction: {
        card,
        effect: 'temp-attack-strike',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 1,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(50);
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('echoMultiplier 2 → (permAtk 2 + tempAtk 3) × 2 = 10 伤害', () => {
    const card = makeCard('echo');
    const monster = makeMonster('m1', 50);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeWeapon(),
      equipmentSlot2: null,
      activeCards: activeRowOf(monster),
      slotTempAttack: { equipmentSlot1: 3, equipmentSlot2: 0 },
      ...withSlotDamageBonus(2),
      pendingMagicAction: {
        card,
        effect: 'temp-attack-strike',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(40);
  });

  it('amplifyBonus 也算入 base：permAtk 1 + tempAtk 2 + amp 3 = 6', () => {
    const card = { ...makeCard('amp'), amplifyBonus: 3 };
    const monster = makeMonster('m1', 50);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeWeapon(),
      equipmentSlot2: null,
      activeCards: activeRowOf(monster),
      slotTempAttack: { equipmentSlot1: 2, equipmentSlot2: 0 },
      ...withSlotDamageBonus(1),
      pendingMagicAction: {
        card,
        effect: 'temp-attack-strike',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 1,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(44);
  });

  it('选中的是另一栏：使用所选栏的 perm/temp，不是错栏的', () => {
    const card = makeCard('side');
    const monster = makeMonster('m1', 50);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeWeapon('w1'),
      equipmentSlot2: makeWeapon('w2'),
      activeCards: activeRowOf(monster),
      slotTempAttack: { equipmentSlot1: 99, equipmentSlot2: 1 },
      ...withSlotDamageBonus(99, 2),
      pendingMagicAction: {
        card,
        effect: 'temp-attack-strike',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 1,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-strike', slotId: 'equipmentSlot2' } as GameAction,
    ]);
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(47);
  });
});
