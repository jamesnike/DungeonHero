/**
 * Swarm 「腐蚀」 (swarmCorrode) 触发时不能覆盖同一格挡的 block 路径 patch。
 *
 * 历史 bug：`reduceResolveBlock` 内部「Swarm corrode on shield」分支从 state
 * （而非 patch）读取 corrodeItem，再 `patch[slot] = { ...corrodeItem, durability: -1 }`
 * 写回——直接覆盖前面 block 路径已写入 patch 的所有字段：
 *   - `_shieldBlockCount` 自增（进化甲壁的 auto-evolve 计数）
 *   - `_shieldDurabilityBlockCounter` 自增（铁壁塔盾 L2 extra-block 计数）
 *   - `_fullBlockUsed` 标记（铁壁塔盾一次性 fullBlock 已用）
 *   - 部分 `armor` 削减
 *   - block 自身造成的 `durability` 削减（armor 被打穿时）
 *
 * 修复：corrode 改为 `patch[slot] !== undefined ? patch[slot] : getSlotItem(state, slot)`
 * 读取，自然保留 block 路径所有更新；副作用是 armor-depleted 格挡 + corrode
 * 同时发生时 durability 总共 -2（卡面「立刻 -1 耐久度，不计入格挡耐久次数」语义）。
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
    phase: 'playerInput', // see pipeline-input-continuation.mdc
    activeCards: [null, null, null, null, null] as ActiveRowSlots,
    combatState: { ...initialCombatState },
    ...overrides,
  };
}

function makeSwarm(over: Partial<GameCardData> = {}): GameCardData {
  return {
    id: 'swarm-1',
    type: 'monster',
    name: '虫群',
    monsterType: 'Swarm',
    value: 4,
    hp: 10,
    maxHp: 10,
    attack: 4,
    swarmCorrode: true,
    ...over,
  } as GameCardData;
}

function makeEvolvingShield(over: Partial<GameCardData> = {}): EquipmentItem {
  return {
    id: 'evolving-shield-1',
    type: 'shield',
    name: '进化甲壁',
    value: 3,
    image: '',
    armor: 3,
    armorMax: 3,
    durability: 2,
    maxDurability: 2,
    classCard: true,
    knightEffect: 'evolving-shield',
    shieldBlockAutoUpgradeCount: 4,
    _shieldBlockCount: 0,
    fromSlot: 'equipmentSlot1',
    ...over,
  } as EquipmentItem;
}

function setupBlockState(
  monster: GameCardData,
  shield: EquipmentItem,
  attackOverride?: number,
  seed = 1,
): GameState {
  return makeState({
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
}

describe('Swarm 腐蚀 不覆盖 block patch', () => {
  it('进化甲壁 + 腐蚀: block 仍然 +1 _shieldBlockCount（armor 未打穿）', () => {
    // armor 3 vs attack 2: armor 不被打穿、不掉耐久；只有 corrode 应该 -1 耐久。
    const monster = makeSwarm({ attack: 2 });
    const shield = makeEvolvingShield({ _shieldBlockCount: 1 });
    const state = setupBlockState(monster, shield);

    const result = reduce(state, {
      type: 'RESOLVE_BLOCK',
      choice: 'shield',
      slotId: 'equipmentSlot1',
    });

    const equipped = result.state.equipmentSlot1 as GameCardData & {
      _shieldBlockCount?: number;
    };
    expect(equipped).toBeTruthy();
    // 用户报告的 bug：corrode 触发时 _shieldBlockCount 没递增
    expect(equipped._shieldBlockCount).toBe(2);
    // armor 未打穿，block 自身不掉耐久；corrode 单独 -1
    expect(equipped.durability).toBe(1);
    expect(equipped.maxDurability).toBe(2);
  });

  it('进化甲壁 + 腐蚀: 第 4 次格挡触发 auto-evolve 同时被 corrode 削减耐久', () => {
    // _shieldBlockCount = 3 → block +1 = 4 → 触发 auto-evolve。
    // armor 3 vs attack 2: armor 不打穿，但 evolve 之后应有：
    //   armorMax 5、durability 3/3、_shieldBlockCount 0；然后 corrode -1 耐久 → 2/3。
    const monster = makeSwarm({ attack: 2 });
    const shield = makeEvolvingShield({ _shieldBlockCount: 3 });
    const state = setupBlockState(monster, shield);

    const result = reduce(state, {
      type: 'RESOLVE_BLOCK',
      choice: 'shield',
      slotId: 'equipmentSlot1',
    });

    const equipped = result.state.equipmentSlot1 as GameCardData & {
      _shieldBlockCount?: number;
    };
    expect(equipped).toBeTruthy();
    // auto-evolve 触发后的状态被 corrode 正确读取
    expect(equipped.armorMax).toBe(5);
    expect(equipped.maxDurability).toBe(3);
    expect(equipped._shieldBlockCount).toBe(0);
    // evolve 后 durability = 3，corrode -1 → 2
    expect(equipped.durability).toBe(2);
  });

  it('进化甲壁 + 腐蚀: armor 被打穿时 block 与 corrode 各 -1 耐久（总 -2）', () => {
    // armor 3 vs attack 5: armor 被打穿 → block -1 耐久（2 → 1），同时 corrode -1
    // → 总共 -2 → 0 → 触发 break。卡面「立刻 -1 耐久度，不计入格挡耐久次数」语义。
    const monster = makeSwarm({ attack: 5 });
    const shield = makeEvolvingShield();
    const state = setupBlockState(monster, shield);

    const drained = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' } as any,
    ]);

    // 双 -1 → 0 → 损毁进坟场（非 Perm）
    expect(drained.state.equipmentSlot1).toBeNull();
    expect(
      drained.state.discardedCards.find((c: any) => c.name === '进化甲壁'),
    ).toBeTruthy();
  });

  it('铁壁塔盾 L2 + 腐蚀: _fullBlockUsed 与 _shieldDurabilityBlockCounter 不被 corrode 抹掉', () => {
    // 铁壁塔盾 L2: 1 耐久、armor 8、shieldExtraBlocksPerDurability: 1。
    // 一次性 fullBlock 应钉 _fullBlockUsed 并 +1 _shieldDurabilityBlockCounter。
    // corrode 应该 -1 耐久，但保留 _fullBlockUsed 与 _shieldDurabilityBlockCounter。
    // 1/1 - corrode -1 = 0 → 损毁进 recycleBag (Perm)。
    const monster = makeSwarm({ attack: 12 });
    const shield: EquipmentItem = {
      id: 'iron-tower-1',
      type: 'shield',
      name: '铁壁塔盾',
      value: 8,
      image: '',
      armor: 8,
      armorMax: 8,
      durability: 2,
      maxDurability: 2,
      permEquipment: true,
      knightEffect: 'fullBlock',
      shieldExtraBlocksPerDurability: 1,
      _shieldDurabilityBlockCounter: 0,
      fromSlot: 'equipmentSlot1',
    } as EquipmentItem;
    const state = setupBlockState(monster, shield);

    const result = reduce(state, {
      type: 'RESOLVE_BLOCK',
      choice: 'shield',
      slotId: 'equipmentSlot1',
    });

    // fullBlock 吸收，所以英雄不掉血；extraBlock 救耐久 → block 路径不掉 1 耐久；
    // corrode -1 → durability 2 → 1。
    const equipped = result.state.equipmentSlot1 as GameCardData & {
      _shieldDurabilityBlockCounter?: number;
      _fullBlockUsed?: boolean;
    };
    expect(result.state.hp).toBe(30);
    expect(equipped).toBeTruthy();
    expect(equipped.durability).toBe(1);
    // 关键：block 路径写入的 _fullBlockUsed 与 _shieldDurabilityBlockCounter
    // 没被 corrode 的 spread 覆盖
    expect(equipped._fullBlockUsed).toBe(true);
    expect(equipped._shieldDurabilityBlockCounter).toBe(1);
  });

  it('Stun 状态的 swarm 不触发 corrode', () => {
    // !monster.isStunned gate 仍然有效 → 击晕的 swarm 攻击不腐蚀。
    const monster = makeSwarm({ attack: 2, isStunned: true });
    const shield = makeEvolvingShield({ _shieldBlockCount: 1 });
    const state = setupBlockState(monster, shield);

    const result = reduce(state, {
      type: 'RESOLVE_BLOCK',
      choice: 'shield',
      slotId: 'equipmentSlot1',
    });

    const equipped = result.state.equipmentSlot1 as GameCardData & {
      _shieldBlockCount?: number;
    };
    expect(equipped).toBeTruthy();
    // stun 时 corrode 不触发：耐久不变、_shieldBlockCount 仍正常 +1
    expect(equipped.durability).toBe(2);
    expect(equipped._shieldBlockCount).toBe(2);
  });
});
