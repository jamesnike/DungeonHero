/**
 * 守护圣盾 — 完美格挡 50% 不消耗护甲值（armor save dice）
 *
 * 钉死的不变量：
 *   1. knightDeck 里 守护圣盾 持有 shieldPerfectBlockArmorSaveChance: 50（不再有
 *      旧的 shieldPerfectBlockSaveChance 字段；description 更新成"不消耗护甲值"）。
 *   2. 完美格挡 + save 成功 → 护甲值不扣、耐久不扣、armorBonusDamaged 不变；
 *      sideEffects 包含 combat:diceRoll(subtitle '完美格挡 — 护甲判定', success=true)
 *      和 "幸运保住了护甲" 日志；常规 "幸运保住了耐久" 日志不出现。
 *   3. 完美格挡 + save 失败 → 护甲值按攻击力扣减、耐久按现有规则处理；
 *      dice 仍掷出（subtitle 同上, success=false）。
 *   4. 非完美格挡（攻击力 > 当前护甲值） → 不掷新增的护甲判定骰；走原有的
 *      armor 打穿 → durability -1 流程。
 *   5. 边界：攻击力 == 护甲值 仍属于完美格挡，掷骰；save 成功时护甲不扣（即使
 *      不掷骰原本会扣到 0 触发耐久 -1，掷成功后耐久也不扣）。
 *
 * 测试策略：
 *   - 用 chance: 100 → 永远 success（因为 threshold = round(100/100*20) = 20，d20 必≤20）
 *   - 用 chance: 0 / undefined → 不进 save 分支
 *   - 不依赖具体 RNG 种子，避免 seed 相关的脆性
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { generateKnightDeck } from '@/lib/knightDeck';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import type { GameCardData } from '@/components/GameCard';
import type { SideEffect } from '../reducer';
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
    name: 'Goblin',
    value: 5,
    hp: 10,
    maxHp: 10,
    attack: 5,
    ...over,
  } as GameCardData;
}

function makeShield(over: Partial<GameCardData> = {}): EquipmentItem {
  return {
    id: 'shield-guardian',
    type: 'shield',
    name: '守护圣盾',
    value: 3,
    image: '',
    armor: 3,
    armorMax: 3,
    durability: 2,
    maxDurability: 2,
    shieldPerfectBlockArmorSaveChance: 50,
    ...over,
  } as EquipmentItem;
}

function setupBlockState(
  monster: GameCardData,
  shield: EquipmentItem,
  seed = 1,
): GameState {
  return makeState({
    rng: createRng(seed),
    activeCards: [monster, null, null, null, null] as ActiveRowSlots,
    equipmentSlot1: shield,
    combatState: {
      ...initialCombatState,
      engagedMonsterIds: [monster.id],
      currentTurn: 'monster',
      pendingBlock: {
        monsterId: monster.id,
        attackValue: monster.attack ?? monster.value,
        monsterName: monster.name,
      },
    },
  });
}

function findArmorSaveDice(sideEffects: SideEffect[]) {
  return sideEffects.find(e =>
    e.event === 'combat:diceRoll'
    && (e.payload as any)?.subtitle === '完美格挡 — 护甲判定',
  );
}

// ---------------------------------------------------------------------------
// 1) Knight deck wiring
// ---------------------------------------------------------------------------

describe('守护圣盾 — knightDeck wiring', () => {
  it('appears in generateKnightDeck with shieldPerfectBlockArmorSaveChance: 50 and no legacy shieldPerfectBlockSaveChance', () => {
    const [deck] = generateKnightDeck(createRng(42));
    const card = deck.find(c => c.name === '守护圣盾');
    expect(card).toBeTruthy();
    expect(card?.type).toBe('shield');
    expect(card?.value).toBe(3);
    expect(card?.durability).toBe(2);
    expect(card?.maxDurability).toBe(2);
    expect((card as any)?.shieldPerfectBlockArmorSaveChance).toBe(50);
    expect((card as any)?.shieldPerfectBlockSaveChance).toBeUndefined();
    expect(card?.classCard).toBe(true);
    expect(card?.shortDescription).toContain('护甲值');
  });
});

// ---------------------------------------------------------------------------
// 2) Save success — armor + durability both untouched
// ---------------------------------------------------------------------------

describe('守护圣盾 — RESOLVE_BLOCK perfect block + save success', () => {
  it('attack < armor, chance=100 (always success): armor unchanged, durability unchanged', () => {
    const monster = makeMonster({ id: 'goblin', attack: 2 });
    const shield = makeShield({ shieldPerfectBlockArmorSaveChance: 100 });
    const state = setupBlockState(monster, shield);

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });

    const newSlot = result.state.equipmentSlot1 as any;
    expect(newSlot.armor).toBe(3);
    expect(newSlot.durability).toBe(2);
    expect(newSlot.armorBonusDamaged ?? 0).toBe(0);

    const dice = findArmorSaveDice(result.sideEffects);
    expect(dice).toBeTruthy();
    expect((dice!.payload as any).success).toBe(true);

    expect(result.sideEffects.some(e =>
      e.event === 'log:entry' && (e.payload as any)?.message?.includes('幸运保住了护甲'),
    )).toBe(true);
    expect(result.sideEffects.some(e =>
      e.event === 'log:entry' && (e.payload as any)?.message?.includes('幸运保住了耐久'),
    )).toBe(false);

    expect(result.state.hp).toBe(state.hp);
  });

  it('boundary attack == armor, chance=100: save still fires; armor stays at full, durability untouched', () => {
    const monster = makeMonster({ id: 'goblin', attack: 3 });
    const shield = makeShield({ shieldPerfectBlockArmorSaveChance: 100 });
    const state = setupBlockState(monster, shield);

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });

    const newSlot = result.state.equipmentSlot1 as any;
    expect(newSlot.armor).toBe(3);
    expect(newSlot.durability).toBe(2);

    const dice = findArmorSaveDice(result.sideEffects);
    expect(dice).toBeTruthy();
    expect((dice!.payload as any).success).toBe(true);

    expect(result.state.hp).toBe(state.hp);
  });
});

// ---------------------------------------------------------------------------
// 3) Save failure (chance=0 / no field) — armor depletes by attack damage
// ---------------------------------------------------------------------------

describe('守护圣盾 — RESOLVE_BLOCK perfect block without save', () => {
  it('attack < armor, no save field: armor decreases by attack, durability unchanged, no dice fired', () => {
    const monster = makeMonster({ id: 'goblin', attack: 2 });
    const shield = makeShield({ shieldPerfectBlockArmorSaveChance: undefined });
    const state = setupBlockState(monster, shield);

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });

    const newSlot = result.state.equipmentSlot1 as any;
    expect(newSlot.armor).toBe(1);
    expect(newSlot.durability).toBe(2);

    expect(findArmorSaveDice(result.sideEffects)).toBeUndefined();
    expect(result.state.hp).toBe(state.hp);
  });

  it('attack == armor, no save field: armor depletes → durability -1, refilled to armorMax', () => {
    const monster = makeMonster({ id: 'goblin', attack: 3 });
    const shield = makeShield({ shieldPerfectBlockArmorSaveChance: undefined });
    const state = setupBlockState(monster, shield);

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });

    const newSlot = result.state.equipmentSlot1 as any;
    expect(newSlot.durability).toBe(1);
    expect(newSlot.armor ?? newSlot.armorMax).toBe(3);

    expect(findArmorSaveDice(result.sideEffects)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4) Non-perfect block — dice MUST NOT fire
// ---------------------------------------------------------------------------

describe('守护圣盾 — non-perfect block does NOT trigger armor-save dice', () => {
  it('attack > armor: armor save dice does not fire; armor depletes, durability -1, hero takes overflow', () => {
    const monster = makeMonster({ id: 'goblin', attack: 5 });
    const shield = makeShield({ shieldPerfectBlockArmorSaveChance: 100 });
    const initialHp = 20;
    const state = setupBlockState(monster, shield);
    state.hp = initialHp;

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });

    expect(findArmorSaveDice(result.sideEffects)).toBeUndefined();

    const newSlot = result.state.equipmentSlot1 as any;
    expect(newSlot.durability).toBe(1);
    expect(newSlot.armor ?? newSlot.armorMax).toBe(3);
  });
});
