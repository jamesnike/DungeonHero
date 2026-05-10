/**
 * 铁壁塔盾 fullBlock 一次性使用 — bug #1 + bug #2 + 重装备刷新覆盖
 *
 * Bug #1（一次性）：
 *   `knightEffect: 'fullBlock'` 历史上 unconditionally 把 attack > armor 的溢出
 *   钳成 0，相当于「无限次完全格挡」。修复后只在「attack > 当前护甲值」且未用过时
 *   触发，触发后 `_fullBlockUsed: true` 钉到 in-slot item 上。下一次再 attack > armor
 *   不再触发，溢出正常打到英雄。
 *
 * Bug #2（attack ≤ armor 不该破甲）：
 *   user 报「7 base + 2 perm = 9 vs attack 8 → 攻破耐久」。修复后 attack ≤ armor
 *   走普通 block：armor 9 → 1，`_fullBlockUsed` 不消耗、durability 不损失。
 *
 * Q3（每次装备上刷新次数限制）：
 *   - SET_EQUIPMENT_SLOT 装备 fullBlock shield 时 strip `_fullBlockUsed`。
 *   - 即使 shield 在 backpack / hand 上携带 `_fullBlockUsed: true`（理论上不应该，
 *     但稳健起见做一道闸），重新装备时也清掉。
 *   - clearSlotAndPromoteReserve 对 promoted fullBlock shield 同样 strip（防御）。
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
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
    value: 8,
    hp: 20,
    maxHp: 20,
    attack: 8,
    ...over,
  } as GameCardData;
}

function makeIronTower(armorMax: number, over: Partial<GameCardData> = {}): EquipmentItem {
  return {
    id: 'shield-iron-tower',
    type: 'shield',
    name: '铁壁塔盾',
    value: armorMax,
    image: '',
    armorMax,
    durability: 1,
    maxDurability: 1,
    permEquipment: true,
    knightEffect: 'fullBlock',
    fromSlot: 'equipmentSlot1',
    ...over,
  } as EquipmentItem;
}

function setupBlockState(
  monster: GameCardData,
  shield: EquipmentItem,
  attackOverride?: number,
  permShieldBonus = 0,
  seed = 1,
): GameState {
  const base = makeState({
    rng: createRng(seed),
    hp: 30,
    activeCards: [monster, null, null, null, null] as ActiveRowSlots,
    equipmentSlot1: shield,
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
  if (permShieldBonus !== 0) {
    return {
      ...base,
      equipmentSlotBonuses: {
        ...base.equipmentSlotBonuses,
        equipmentSlot1: {
          ...base.equipmentSlotBonuses.equipmentSlot1,
          shield: base.equipmentSlotBonuses.equipmentSlot1.shield + permShieldBonus,
        },
      },
    };
  }
  return base;
}

// ---------------------------------------------------------------------------
// Bug #2: attack ≤ armor → 普通 block，不消耗特效、不掉耐久
// ---------------------------------------------------------------------------
describe('Bug #2 — attack ≤ armor 时不触发 fullBlock + 不掉耐久', () => {
  it('user-reported scenario: armorMax 7 + perm 2 = 9 vs attack 8 → armor 9→1, durability stays 1, _fullBlockUsed=undefined', () => {
    // 镜像 user 报告：「本身有 7 点护甲上限和护甲值，永久护甲加成是 2，最终是 9 点护甲值，
    //                 monster 攻击力是 8，结果直接攻破了铁壁塔盾，使得其耗了耐久」
    const monster = makeMonster({ attack: 8 });
    const shield = makeIronTower(7); // armorMax = 7
    const state = setupBlockState(monster, shield, 8, /* permShieldBonus */ 2);

    const result = reduce(state, {
      type: 'RESOLVE_BLOCK',
      choice: 'shield',
      slotId: 'equipmentSlot1',
    });

    // 关键不变量：耐久不掉
    const equipped = result.state.equipmentSlot1 as any;
    expect(equipped).toBeTruthy();
    expect(equipped.durability).toBe(1);
    // armor 9 → 1（被 attack 8 啃到 1），不进入 recycle bag
    expect(equipped.armor).toBe(1);
    // 一次性 fullBlock 特效保留给后续的 attack > armor
    expect(equipped._fullBlockUsed).toBeUndefined();
    // hero 不受伤
    expect(result.state.hp).toBe(30);
    // shield 不进 recycle bag
    expect(result.state.permanentMagicRecycleBag.find((c: any) => c.name === '铁壁塔盾')).toBeFalsy();
  });

  it('attack 4 vs armor 5 (attack < armor): armor 5→1, durability stays, special preserved', () => {
    // 注意：attack == armor 是"armor 刚好挡住但被打穿"的边界场景（shieldArmorDepleted=true
    // 因为 newCurrentArmor = 0），耐久会被消耗——这是通用 shield 机制，跟 fullBlock 无关。
    // 这里专测「strictly less than」场景，确保 fullBlock 不被错触发。
    const monster = makeMonster({ attack: 4 });
    const shield = makeIronTower(5);
    const state = setupBlockState(monster, shield, 4);

    const result = reduce(state, {
      type: 'RESOLVE_BLOCK',
      choice: 'shield',
      slotId: 'equipmentSlot1',
    });

    const equipped = result.state.equipmentSlot1 as any;
    expect(equipped).toBeTruthy();
    expect(equipped.durability).toBe(1);
    expect(equipped.armor).toBe(1); // 5 - 4 = 1
    expect(equipped._fullBlockUsed).toBeUndefined();
    expect(result.state.hp).toBe(30);
  });

  it('attack much less than armor → 普通 block，armor 部分消耗、特效保留', () => {
    const monster = makeMonster({ attack: 3 });
    const shield = makeIronTower(8);
    const state = setupBlockState(monster, shield, 3);

    const result = reduce(state, {
      type: 'RESOLVE_BLOCK',
      choice: 'shield',
      slotId: 'equipmentSlot1',
    });

    const equipped = result.state.equipmentSlot1 as any;
    expect(equipped).toBeTruthy();
    expect(equipped.durability).toBe(1);
    expect(equipped.armor).toBe(5); // 8 - 3 = 5
    expect(equipped._fullBlockUsed).toBeUndefined();
    expect(result.state.hp).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Bug #1: 一次性使用 — 第一次 attack > armor 触发并消耗，后续不再触发
// ---------------------------------------------------------------------------
describe('Bug #1 — fullBlock 是一次性，第二次 attack > armor 时不再触发', () => {
  it('L0 fresh shield, attack 12 > armor 5: triggers + breaks immediately (1/1, no extraBlock)', () => {
    const monster = makeMonster({ attack: 12 });
    const shield = makeIronTower(5); // L0
    const state = setupBlockState(monster, shield, 12);

    const drained = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' } as any,
    ]);

    // hero 0 伤害（fullBlock 触发，溢出归 0），shield 因 1/1 立即损毁进 recycleBag
    expect(drained.state.hp).toBe(30);
    expect(drained.state.equipmentSlot1).toBeNull();
    expect(drained.state.permanentMagicRecycleBag.find((c: any) => c.name === '铁壁塔盾')).toBeTruthy();
  });

  it('L2 shield with extraBlock=1: block 1 (attack 12 > armor 8) triggers + saves; block 2 (attack 12) NOT triggered, overflow 4 to hero', () => {
    const monster1 = makeMonster({ id: 'm1', attack: 12 });
    const monster2 = makeMonster({ id: 'm2', attack: 12 });
    const shield = makeIronTower(8, {
      shieldExtraBlocksPerDurability: 1,
      _shieldDurabilityBlockCounter: 0,
    } as any);
    let state = setupBlockState(monster1, shield, 12);

    // Block 1
    state = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' } as any,
    ]).state;
    expect(state.hp).toBe(30);
    let equipped = state.equipmentSlot1 as any;
    expect(equipped).toBeTruthy();
    expect(equipped.durability).toBe(1);
    expect(equipped._shieldDurabilityBlockCounter).toBe(1);
    expect(equipped._fullBlockUsed).toBe(true);

    // Block 2 — same shield, _fullBlockUsed=true 已置位
    state = {
      ...state,
      activeCards: [monster2, null, null, null, null] as ActiveRowSlots,
      combatState: {
        ...state.combatState,
        engagedMonsterIds: [monster2.id],
        currentTurn: 'monster',
        pendingBlock: {
          monsterId: monster2.id,
          attackValue: 12,
          monsterName: monster2.name,
        },
        slotDurabilityUsedThisTurn: { equipmentSlot1: 0, equipmentSlot2: 0 },
      },
    };

    state = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' } as any,
    ]).state;
    // fullBlock 不再触发：armor 8 vs attack 12 → 溢出 4 打到英雄
    expect(state.hp).toBe(26);
    // L2 extraBlock 已用尽 → durability 1 → 0 → break → recycleBag
    expect(state.equipmentSlot1).toBeNull();
    expect(state.permanentMagicRecycleBag.find((c: any) => c.name === '铁壁塔盾')).toBeTruthy();
  });

  it('intermediate small attack (≤ armor) does NOT consume the special', () => {
    // L2 shield (so it survives multiple blocks)
    const monster1 = makeMonster({ id: 'm1', attack: 5 });
    const monster2 = makeMonster({ id: 'm2', attack: 12 });
    const shield = makeIronTower(8, {
      shieldExtraBlocksPerDurability: 1,
      _shieldDurabilityBlockCounter: 0,
    } as any);
    let state = setupBlockState(monster1, shield, 5);

    // Block 1: attack 5 ≤ armor 8 → 普通 block, 特效保留
    state = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' } as any,
    ]).state;
    expect(state.hp).toBe(30);
    let equipped = state.equipmentSlot1 as any;
    expect(equipped).toBeTruthy();
    expect(equipped.durability).toBe(1);
    expect(equipped._fullBlockUsed).toBeUndefined(); // 特效未消耗
    expect(equipped.armor).toBe(3); // 8 - 5

    // Block 2: attack 12 > armor 3 (current) → 触发 fullBlock，extraBlock 救耐久
    state = {
      ...state,
      activeCards: [monster2, null, null, null, null] as ActiveRowSlots,
      combatState: {
        ...state.combatState,
        engagedMonsterIds: [monster2.id],
        currentTurn: 'monster',
        pendingBlock: {
          monsterId: monster2.id,
          attackValue: 12,
          monsterName: monster2.name,
        },
        slotDurabilityUsedThisTurn: { equipmentSlot1: 0, equipmentSlot2: 0 },
      },
    };
    state = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' } as any,
    ]).state;
    expect(state.hp).toBe(30);
    equipped = state.equipmentSlot1 as any;
    expect(equipped).toBeTruthy();
    expect(equipped.durability).toBe(1);
    expect(equipped._shieldDurabilityBlockCounter).toBe(1);
    expect(equipped._fullBlockUsed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Q3: 「每次装备上，刷新次数限制」— SET_EQUIPMENT_SLOT 入槽时 strip _fullBlockUsed
// ---------------------------------------------------------------------------
describe('Q3 — 每次装备上刷新一次性效果', () => {
  it('SET_EQUIPMENT_SLOT strips _fullBlockUsed on fullBlock shield entering slot', () => {
    const usedShield = makeIronTower(5, { _fullBlockUsed: true } as any);
    const state = makeState({ equipmentSlot1: null });
    const result = reduce(state, {
      type: 'SET_EQUIPMENT_SLOT',
      slotId: 'equipmentSlot1',
      card: usedShield,
    });
    const equipped = result.state.equipmentSlot1 as any;
    expect(equipped).toBeTruthy();
    expect(equipped._fullBlockUsed).toBeUndefined();
  });

  it('SET_EQUIPMENT_SLOT keeps _fullBlockUsed=undefined for fresh shield (no-op)', () => {
    const freshShield = makeIronTower(5);
    const state = makeState({ equipmentSlot1: null });
    const result = reduce(state, {
      type: 'SET_EQUIPMENT_SLOT',
      slotId: 'equipmentSlot1',
      card: freshShield,
    });
    const equipped = result.state.equipmentSlot1 as any;
    expect(equipped).toBeTruthy();
    expect(equipped._fullBlockUsed).toBeUndefined();
  });

  it('SET_EQUIPMENT_SLOT does NOT strip _fullBlockUsed on non-fullBlock shield (defensive: only matches knightEffect)', () => {
    // 假装一个普通 shield 也有 _fullBlockUsed（不该出现）— SET_EQUIPMENT_SLOT 不应改它
    const otherShield = {
      id: 'other-shield',
      type: 'shield' as const,
      name: '某盾',
      value: 3,
      image: '',
      armorMax: 3,
      durability: 1,
      maxDurability: 1,
      _fullBlockUsed: true,
    } as any;
    const state = makeState({ equipmentSlot1: null });
    const result = reduce(state, {
      type: 'SET_EQUIPMENT_SLOT',
      slotId: 'equipmentSlot1',
      card: otherShield,
    });
    const equipped = result.state.equipmentSlot1 as any;
    expect(equipped._fullBlockUsed).toBe(true); // 保留（因为 knightEffect !== 'fullBlock'）
  });
});

// ---------------------------------------------------------------------------
// 端到端：用过特效 → 进 recycle bag → 洗回 backpack → 重新装备 → 特效刷新
// ---------------------------------------------------------------------------
describe('end-to-end — recycleBag round trip refreshes the special', () => {
  it('after L0 break + recycleBag → backpack → re-equip via SET_EQUIPMENT_SLOT, _fullBlockUsed is gone', () => {
    // 1) 装备 fresh shield，用 attack > armor 把它打掉
    const monster = makeMonster({ attack: 12 });
    const shield = makeIronTower(5);
    let state = setupBlockState(monster, shield, 12);
    state = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' } as any,
    ]).state;
    expect(state.equipmentSlot1).toBeNull();
    const inRecycle = state.permanentMagicRecycleBag.find((c: any) => c.name === '铁壁塔盾') as any;
    expect(inRecycle).toBeTruthy();
    // routeBrokenSelfToGraveOrRecycle 走的是 ORIGINAL slotItem，不是 workingShieldItem，
    // 所以 _fullBlockUsed 不会被带进 recycleBag。但即使被带进，下一步 SET_EQUIPMENT_SLOT 也会 strip。
    // 核心断言：重新装备时 _fullBlockUsed 必须是 undefined。

    // 2) 模拟 recycle → backpack → re-equip
    const reEquipped = reduce(state, {
      type: 'SET_EQUIPMENT_SLOT',
      slotId: 'equipmentSlot1',
      card: { ...inRecycle, _fullBlockUsed: true } as any, // 即使硬塞 true 也得清掉
    });
    const reEquippedShield = reEquipped.state.equipmentSlot1 as any;
    expect(reEquippedShield).toBeTruthy();
    expect(reEquippedShield._fullBlockUsed).toBeUndefined();
    expect(reEquippedShield.knightEffect).toBe('fullBlock');
  });
});
