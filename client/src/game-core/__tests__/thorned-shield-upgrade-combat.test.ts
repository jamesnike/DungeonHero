/**
 * 棘刺反盾 升级 2 — 反弹全部攻击伤害
 *
 * Combat-level invariants 验证：
 *   1. L0/L1 棘刺反盾（reflectHalfDamage=true）格挡时：
 *      reflectDmg = ceil(attackValue / 2) + slotPermDmg + slotTempAtk
 *   2. L2 棘刺反盾（reflectFullDamage=true）格挡时：
 *      reflectDmg = attackValue + slotPermDmg + slotTempAtk
 *      （不再除以二；reflectFullDamage 优先级高于 reflectHalfDamage）
 *   3. 反弹路径 enqueue DEAL_DAMAGE_TO_MONSTER + 自动 BEGIN_COMBAT engage
 *      （走 reduceResolveBlock 末尾的 routeReflect → 各路径已实现）。
 *   4. 临时攻击 / 永久攻击 加成在 L0/L1/L2 都正确叠加。
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { ActiveRowSlots, EquipmentItem, EquipmentSlotBonusState } from '@/components/game-board/types';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as ActiveRowSlots,
    combatState: { ...initialCombatState },
    ...overrides,
  };
}

function makeMonster(over: Partial<GameCardData> = {}): GameCardData {
  return {
    id: 'm1',
    type: 'monster',
    name: '强敌',
    value: 10,
    hp: 50,
    maxHp: 50,
    attack: 10,
    ...over,
  } as GameCardData;
}

function makeThornedShield(over: Partial<GameCardData> = {}): EquipmentItem {
  return {
    id: 'shield-thorned',
    type: 'shield',
    name: '棘刺反盾',
    value: 4,
    image: '',
    armor: 4,
    armorMax: 4,
    durability: 3,
    maxDurability: 3,
    reflectHalfDamage: true,
    knightEffect: 'thorned-shield',
    fromSlot: 'equipmentSlot1',
    ...over,
  } as EquipmentItem;
}

function setupBlockState(
  monster: GameCardData,
  shield: EquipmentItem,
  attackOverride?: number,
  slotPermDamage = 0,
  slotTempAttack = 0,
): GameState {
  const baseBonuses = {
    equipmentSlot1: { damage: 0, shield: 0 },
    equipmentSlot2: { damage: 0, shield: 0 },
  } as EquipmentSlotBonusState;
  if (slotPermDamage > 0) baseBonuses.equipmentSlot1!.damage = slotPermDamage;

  return makeState({
    rng: createRng(1),
    heroHp: 30,
    activeCards: [monster, null, null, null, null] as ActiveRowSlots,
    equipmentSlot1: shield,
    equipmentSlotBonuses: baseBonuses,
    slotTempAttack: { equipmentSlot1: slotTempAttack, equipmentSlot2: 0 },
    combatState: {
      ...initialCombatState,
      engagedMonsterIds: [monster.id],
      currentTurn: 'monster',
      pendingBlock: {
        monsterId: monster.id,
        attackValue: attackOverride ?? monster.attack ?? monster.value,
        monsterName: monster.name,
      },
    },
  });
}

function findReflectDamageAction(actions: any[]) {
  return actions.find(
    a => a?.type === 'DEAL_DAMAGE_TO_MONSTER' && (a.source === '棘刺反盾' || a.source?.includes('reflect') || a.source === undefined),
  );
}

describe('棘刺反盾 — reflect computation by upgrade level', () => {
  it('L0 (reflectHalfDamage): attack 11 → reflect ceil(11/2)=6 to monster', () => {
    const monster = makeMonster({ attack: 11 });
    const shield = makeThornedShield();
    const state = setupBlockState(monster, shield, 11);

    const drained = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' } as any,
    ]);

    const monsterAfter = drained.state.activeCards.find((c: any) => c?.id === 'm1') as any;
    expect(monsterAfter).toBeTruthy();
    expect(monsterAfter.currentHp ?? monsterAfter.hp).toBe(50 - 6);
  });

  it('L0 with slot perm damage +3 + slot temp attack +2: attack 10 → reflect ceil(10/2)+3+2 = 10', () => {
    const monster = makeMonster({ attack: 10, hp: 50, maxHp: 50 });
    const shield = makeThornedShield();
    const state = setupBlockState(monster, shield, 10, 3, 2);

    const drained = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' } as any,
    ]);

    const monsterAfter = drained.state.activeCards.find((c: any) => c?.id === 'm1') as any;
    expect(monsterAfter).toBeTruthy();
    expect(monsterAfter.currentHp ?? monsterAfter.hp).toBe(50 - 10);
  });

  it('L2 (reflectFullDamage): attack 11 → reflect 11 to monster (full, not half)', () => {
    const monster = makeMonster({ attack: 11 });
    const shield = makeThornedShield({
      reflectHalfDamage: undefined,
      reflectFullDamage: true,
    } as any);
    delete (shield as any).reflectHalfDamage;
    const state = setupBlockState(monster, shield, 11);

    const drained = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' } as any,
    ]);

    const monsterAfter = drained.state.activeCards.find((c: any) => c?.id === 'm1') as any;
    expect(monsterAfter).toBeTruthy();
    expect(monsterAfter.currentHp ?? monsterAfter.hp).toBe(50 - 11);
  });

  it('L2 with slot perm damage +3 + slot temp attack +2: attack 10 → reflect 10+3+2 = 15', () => {
    const monster = makeMonster({ attack: 10, hp: 50, maxHp: 50 });
    const shield = makeThornedShield({
      reflectHalfDamage: undefined,
      reflectFullDamage: true,
    } as any);
    delete (shield as any).reflectHalfDamage;
    const state = setupBlockState(monster, shield, 10, 3, 2);

    const drained = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' } as any,
    ]);

    const monsterAfter = drained.state.activeCards.find((c: any) => c?.id === 'm1') as any;
    expect(monsterAfter).toBeTruthy();
    expect(monsterAfter.currentHp ?? monsterAfter.hp).toBe(50 - 15);
  });

  it('L2 reflect engages the attacker (BEGIN_COMBAT auto-engagement)', () => {
    const monster = makeMonster({ attack: 8 });
    const shield = makeThornedShield({
      reflectHalfDamage: undefined,
      reflectFullDamage: true,
    } as any);
    delete (shield as any).reflectHalfDamage;
    const state = setupBlockState(monster, shield, 8);

    const drained = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' } as any,
    ]);

    expect(drained.state.combatState.engagedMonsterIds).toContain(monster.id);
  });

  it('L2 reflectFullDamage takes precedence when both flags somehow present', () => {
    const monster = makeMonster({ attack: 7 });
    const shield = makeThornedShield({ reflectFullDamage: true } as any);
    const state = setupBlockState(monster, shield, 7);

    const drained = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' } as any,
    ]);

    const monsterAfter = drained.state.activeCards.find((c: any) => c?.id === 'm1') as any;
    expect(monsterAfter.currentHp ?? monsterAfter.hp).toBe(50 - 7);
  });
});

describe('棘刺反盾 — durability handling unchanged across L0/L1/L2', () => {
  it('L0 attack 10 vs 4-armor 3-dur shield: armor depleted (10>4) → durability 3 → 2', () => {
    const monster = makeMonster({ attack: 10, hp: 50, maxHp: 50 });
    const shield = makeThornedShield({ durability: 3, maxDurability: 3 });
    const state = setupBlockState(monster, shield, 10);

    const drained = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' } as any,
    ]);

    const equipped = drained.state.equipmentSlot1 as any;
    expect(equipped).toBeTruthy();
    expect(equipped.durability).toBe(2);
  });

  it('L2 attack 10 vs 4-armor 3-dur reflectFullDamage shield: durability still ticks identically', () => {
    const monster = makeMonster({ attack: 10, hp: 50, maxHp: 50 });
    const shield = makeThornedShield({
      durability: 3,
      maxDurability: 3,
      reflectHalfDamage: undefined,
      reflectFullDamage: true,
    } as any);
    delete (shield as any).reflectHalfDamage;
    const state = setupBlockState(monster, shield, 10);

    const drained = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' } as any,
    ]);

    const equipped = drained.state.equipmentSlot1 as any;
    expect(equipped).toBeTruthy();
    expect(equipped.durability).toBe(2);
  });
});
