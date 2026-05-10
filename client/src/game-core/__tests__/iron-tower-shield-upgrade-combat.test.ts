/**
 * 铁壁塔盾 升级 2 — 一次性 fullBlock + extraBlock 救耐久
 *
 * 当前 fullBlock 语义（见 `iron-tower-fullblock-one-time.test.ts` 全面覆盖）：
 *   - 触发条件：`isFullBlockShield && !_fullBlockUsed && attack > currentArmor`。
 *     attack ≤ armor 走普通 block，特效不消耗、保留给下次。
 *   - 触发后果：armor 视为打穿、走正常耐久流程；同时 `_fullBlockUsed: true`
 *     钉到槽位 item 上，下次再受 attack > armor 时不再触发，溢出正常打到英雄。
 *
 * Combat-level invariants 验证（L2 升级后）：
 *   1. L2 升级后 shield 持有 shieldExtraBlocksPerDurability: 1。
 *   2. 第 1 次格挡（attack > armor）→ 触发 fullBlock，吸收溢出 + extraBlock 救耐久
 *      （counter: 0 → 1）+ armor 字段被剥离让下次按 cap (8) 重新刷满 +
 *      `_fullBlockUsed = true` 钉到槽位 item 上。
 *   3. 第 2 次格挡（attack > armor，`_fullBlockUsed: true` 已置位）→ fullBlock
 *      不再触发 → armor 被打穿 + 溢出打到英雄 + 耐久 -1 → durability 1 → 0 →
 *      走 break 路径 → 因 permEquipment=true 进入 permanentMagicRecycleBag。
 *   4. 验证 combat:shieldBlock + 「完全格挡了 X 点伤害（一次性效果用尽）」 log
 *      在第 1 次触发时发出。
 *   5. （routing fix 后）knight:fullBlock upgrade handler 实际运行。
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
    value: 12,
    hp: 20,
    maxHp: 20,
    attack: 12,
    ...over,
  } as GameCardData;
}

function makeIronTowerL2(over: Partial<GameCardData> = {}): EquipmentItem {
  return {
    id: 'shield-iron-tower',
    type: 'shield',
    name: '铁壁塔盾',
    value: 8,
    image: '',
    armor: 8,
    armorMax: 8,
    durability: 1,
    maxDurability: 1,
    permEquipment: true,
    knightEffect: 'fullBlock',
    shieldExtraBlocksPerDurability: 1,
    _shieldDurabilityBlockCounter: 0,
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

describe('铁壁塔盾 L2 — 一次性 fullBlock + extraBlock 救耐久', () => {
  it('attack 12 vs L2 shield (8 armor, 1/1, +1 extra block): block 1 triggers fullBlock + saves durability + sets _fullBlockUsed', () => {
    const monster = makeMonster({ attack: 12 });
    const shield = makeIronTowerL2();
    const state = setupBlockState(monster, shield);

    const result = reduce(state, {
      type: 'RESOLVE_BLOCK',
      choice: 'shield',
      slotId: 'equipmentSlot1',
    });

    expect(result.state.hp).toBe(30);
    const equippedShield = result.state.equipmentSlot1 as any;
    expect(equippedShield).toBeTruthy();
    expect(equippedShield.durability).toBe(1);
    expect(equippedShield._shieldDurabilityBlockCounter).toBe(1);
    // 一次性 fullBlock 已使用 — 必须钉到 in-slot item 上
    expect(equippedShield._fullBlockUsed).toBe(true);
    expect(equippedShield.armor).toBeUndefined();
    expect(result.state.permanentMagicRecycleBag.find((c: any) => c.name === '铁壁塔盾')).toBeFalsy();
    expect(result.state.discardedCards.find((c: any) => c.name === '铁壁塔盾')).toBeFalsy();

    const blockEvent = result.sideEffects.find((e: any) => e.event === 'combat:shieldBlock');
    expect(blockEvent).toBeTruthy();
    const fullBlockLog = result.sideEffects.find(
      (e: any) => e.event === 'log:entry' && (e.payload as any)?.message?.includes('完全格挡'),
    );
    expect(fullBlockLog).toBeTruthy();
    const extraBlockLog = result.sideEffects.find(
      (e: any) => e.event === 'log:entry' && (e.payload as any)?.message?.includes('额外格挡'),
    );
    expect(extraBlockLog).toBeTruthy();
  });

  it('attack 100 vs L2 shield: attack of any size absorbed in block 1 (fresh special)', () => {
    const monster = makeMonster({ attack: 100 });
    const shield = makeIronTowerL2();
    const state = setupBlockState(monster, shield, 100);

    const result = reduce(state, {
      type: 'RESOLVE_BLOCK',
      choice: 'shield',
      slotId: 'equipmentSlot1',
    });

    expect(result.state.hp).toBe(30);
    const equippedShield = result.state.equipmentSlot1 as any;
    expect(equippedShield).toBeTruthy();
    expect(equippedShield.durability).toBe(1);
    expect(equippedShield._shieldDurabilityBlockCounter).toBe(1);
    expect(equippedShield._fullBlockUsed).toBe(true);
  });

  it('block 2 (counter=1, _fullBlockUsed=true): special spent → attack 12 overflows hero by 4 + shield breaks → recycleBag (Perm)', () => {
    const monster = makeMonster({ attack: 12 });
    // Mirrors real chain: block 1 used counter+special → block 2 fixture has both set.
    const shield = makeIronTowerL2({ _shieldDurabilityBlockCounter: 1, _fullBlockUsed: true } as any);
    const state = setupBlockState(monster, shield);

    const drained = drain(state, [
      {
        type: 'RESOLVE_BLOCK',
        choice: 'shield',
        slotId: 'equipmentSlot1',
      } as any,
    ]);

    // fullBlock 特效已用尽：attack 12 vs armor 8 → 溢出 4 打到英雄
    expect(drained.state.hp).toBe(26);
    expect(drained.state.equipmentSlot1).toBeNull();
    expect(
      drained.state.permanentMagicRecycleBag.find((c: any) => c.name === '铁壁塔盾'),
    ).toBeTruthy();
    expect(
      drained.state.discardedCards.find((c: any) => c.name === '铁壁塔盾'),
    ).toBeFalsy();
  });

  it('chained two-block scenario via drain: block 1 fullBlocks (no hero damage), block 2 spent → overflow + break', () => {
    const monster1 = makeMonster({ id: 'm1', attack: 15 });
    const monster2 = makeMonster({ id: 'm2', attack: 20 });
    const shield = makeIronTowerL2();
    let state = setupBlockState(monster1, shield, 15);

    state = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' } as any,
    ]).state;

    expect(state.hp).toBe(30);
    let equipped = state.equipmentSlot1 as any;
    expect(equipped).toBeTruthy();
    expect(equipped.durability).toBe(1);
    expect(equipped._shieldDurabilityBlockCounter).toBe(1);
    // Block 1 触发 fullBlock，flag 钉死
    expect(equipped._fullBlockUsed).toBe(true);

    state = {
      ...state,
      activeCards: [monster2, null, null, null, null] as ActiveRowSlots,
      combatState: {
        ...state.combatState,
        engagedMonsterIds: [monster2.id],
        currentTurn: 'monster',
        pendingBlock: {
          monsterId: monster2.id,
          attackValue: 20,
          monsterName: monster2.name,
        },
        slotDurabilityUsedThisTurn: { equipmentSlot1: 0, equipmentSlot2: 0 },
      },
    };

    state = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' } as any,
    ]).state;

    // Block 2: attack 20 vs armor 8（refilled），溢出 12 → 英雄 30 → 18
    expect(state.hp).toBe(18);
    expect(state.equipmentSlot1).toBeNull();
    expect(state.permanentMagicRecycleBag.find((c: any) => c.name === '铁壁塔盾')).toBeTruthy();
    expect(state.discardedCards.find((c: any) => c.name === '铁壁塔盾')).toBeFalsy();
  });

  it('L0/L1 (no shieldExtraBlocksPerDurability): block 1 triggers fullBlock + immediately breaks (1/1)', () => {
    const monster = makeMonster({ attack: 12 });
    const shield: EquipmentItem = { ...makeIronTowerL2() } as any;
    delete (shield as any).shieldExtraBlocksPerDurability;
    delete (shield as any)._shieldDurabilityBlockCounter;
    const state = setupBlockState(monster, shield);

    const drained = drain(state, [
      { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' } as any,
    ]);

    // L0/L1: 一次性 fullBlock 触发，hero 0 伤害；但 1/1 立即损毁进 recycleBag
    expect(drained.state.hp).toBe(30);
    expect(drained.state.equipmentSlot1).toBeNull();
    expect(
      drained.state.permanentMagicRecycleBag.find((c: any) => c.name === '铁壁塔盾'),
    ).toBeTruthy();
  });
});
