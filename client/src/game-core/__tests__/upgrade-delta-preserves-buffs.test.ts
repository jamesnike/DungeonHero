/**
 * Delta-based upgrade handler 测试：验证 mid-game buff（amplification、potion、
 * 战斗扣损）被升级保留，而不是被旧的"绝对赋值"模式 overwrite。
 *
 * 关键不变量：升级永远在当前值上叠加 per-level delta。当卡处于 base 值时，
 * `current = table[newLevel-1]` → `current + delta = table[newLevel]`，与旧
 * overwrite 行为完全一致 → base-value 测试不会因为 delta 改写而失败。
 *
 * 范围：仅 5 个 mid-game-modifiable 字段走 delta —— value / armorMax /
 * maxDurability / durability / armor。其它效果描述符（onEquipEffect、
 * shieldBashStunRate、healOnAttack、…）handler 直接覆盖即可。
 */

import { describe, expect, it } from 'vitest';
import { executeOnUpgrade } from '../card-schema/on-upgrade';
import { createInitialGameState } from '../state';
import type { GameCardData } from '@/components/GameCard';

// 触发 schema registry 注册（所有 OnUpgradeHandler 在此模块导入时副作用注册）
import '../card-schema';

function applyUpgrade(card: GameCardData, newLevel: number): GameCardData {
  const upgraded: GameCardData = { ...card, upgradeLevel: newLevel };
  executeOnUpgrade(upgraded, newLevel, createInitialGameState());
  return upgraded;
}

// ---------------------------------------------------------------------------
// 1. Pre-amplified shield → 升级保留 amp
// ---------------------------------------------------------------------------

describe('upgrade: pre-amplified shield preserves +1 amp on top of delta', () => {
  it('guardianShield amped to 4/4 → L1 (delta +1) gives 5/5 (not 4/4)', () => {
    const ampedShield: GameCardData = {
      id: 'knight-guardian',
      type: 'shield',
      name: '守护圣盾',
      value: 4,
      armorMax: 4,
      durability: 2,
      maxDurability: 2,
      shieldPerfectBlockArmorSaveChance: 50,
      knightEffect: 'guardian-shield',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;

    const upgraded = applyUpgrade(ampedShield, 1);

    expect(upgraded.value).toBe(5);
    expect((upgraded as any).armorMax).toBe(5);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(3);
    expect((upgraded as any).shieldPerfectBlockArmorSaveChance).toBe(50);
  });

  it('communalDefenseShield amped to 7/7 → L1 (delta +2) gives 9/9 (not 8/8)', () => {
    // 共御圣盾 base 6/6, L1 table[1]=8 → delta +2。
    // amp 后到 7/7 → L1 后应该 7+2=9（保留 +1 amp），而不是直接 overwrite 成 8。
    const ampedShield: GameCardData = {
      id: 'knight-communal-defense',
      type: 'shield',
      name: '共御圣盾',
      value: 7,
      armorMax: 7,
      durability: 1,
      maxDurability: 1,
      hasEquipmentRevive: true,
      onDestroyEffect: 'allSlotTempArmor:4',
      knightEffect: 'communal-defense-shield',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;

    const upgraded = applyUpgrade(ampedShield, 1);

    expect(upgraded.value).toBe(9);
    expect((upgraded as any).armorMax).toBe(9);
    expect(upgraded.maxDurability).toBe(1);
    expect(upgraded.durability).toBe(1);
    expect((upgraded as any).hasEquipmentRevive).toBe(true);
    expect(upgraded.onDestroyEffect).toBe('allSlotTempArmor:4');
  });
});

// ---------------------------------------------------------------------------
// 2. Pre-buffed maxDurability via potion → 升级保留 buff
// ---------------------------------------------------------------------------

describe('upgrade: potion-buffed maxDurability preserved on top of delta', () => {
  it('thunderStunHammer maxDur 3 (potion +1 from base 2) → L1 (delta +1) gives maxDur 4', () => {
    const buffedHammer: GameCardData = {
      id: 'knight-thunder-stun',
      type: 'weapon',
      name: '雷击碎骨锤',
      value: 3,
      durability: 2,
      maxDurability: 3,
      weaponStunChance: 60,
      doubleDamageOnStunned: true,
      onEquipEffect: 'stunCap+5',
      knightEffect: 'thunder-stun-hammer',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;

    const upgraded = applyUpgrade(buffedHammer, 1);

    expect(upgraded.maxDurability).toBe(4);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.value).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 3. Combat-damaged armor → 升级保留扣损 + 加 cap delta
// ---------------------------------------------------------------------------

describe('upgrade: combat-damaged armor preserved with delta added on top', () => {
  it('barrageShield armor 3/4 (1 hit taken) → L1 (delta +2) gives armor 5/6', () => {
    const damagedShield: GameCardData = {
      id: 'knight-barrage',
      type: 'shield',
      name: '弹幕护盾',
      value: 4,
      armorMax: 4,
      armor: 3,
      durability: 3,
      maxDurability: 3,
      perfectBlockSpawnMissiles: 2,
      knightEffect: 'barrage-shield',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;

    const upgraded = applyUpgrade(damagedShield, 1);

    expect(upgraded.value).toBe(6);
    expect((upgraded as any).armorMax).toBe(6);
    expect((upgraded as any).armor).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 4. Base-value baseline → 升级行为与旧 overwrite 等价（向后兼容）
// ---------------------------------------------------------------------------

describe('upgrade: base-value cards behave exactly like old overwrite', () => {
  it('guardianShield base 3/2 → L1 yields 4 armor / 3 dur (matches old overwrite)', () => {
    const baseShield: GameCardData = {
      id: 'knight-guardian',
      type: 'shield',
      name: '守护圣盾',
      value: 3,
      armorMax: 3,
      durability: 2,
      maxDurability: 2,
      shieldPerfectBlockArmorSaveChance: 50,
      knightEffect: 'guardian-shield',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;

    const upgraded = applyUpgrade(baseShield, 1);

    expect(upgraded.value).toBe(4);
    expect((upgraded as any).armorMax).toBe(4);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(3);
  });

  it('soulHunterBlade base 5/2 → L1 yields 5/3 (no value delta, +1 maxDur)', () => {
    const baseBlade: GameCardData = {
      id: 'knight-soul-hunter',
      type: 'weapon',
      name: '噬魂猎刃',
      value: 5,
      durability: 2,
      maxDurability: 2,
      knightEffect: 'soul-hunter-blade',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;

    const upgraded = applyUpgrade(baseBlade, 1);

    expect(upgraded.value).toBe(5);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(3);
  });

  it('soulHunterBlade base 5/2 → L2 (sequential) yields 6/4', () => {
    const baseBlade: GameCardData = {
      id: 'knight-soul-hunter',
      type: 'weapon',
      name: '噬魂猎刃',
      value: 5,
      durability: 2,
      maxDurability: 2,
      knightEffect: 'soul-hunter-blade',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;

    const afterL1 = applyUpgrade(baseBlade, 1);
    const afterL2 = applyUpgrade(afterL1, 2);

    expect(afterL2.value).toBe(6);
    expect(afterL2.maxDurability).toBe(4);
    expect(afterL2.durability).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 5. Cap clamp：intended delta 因撞 cap 缩水
// ---------------------------------------------------------------------------

describe('upgrade: maxDurability cap clamps intended delta', () => {
  it('growthBlade maxDur 4 (already at cap) → L1 (intendedDelta +1) stays at 4 with no dur bump', () => {
    const cappedBlade: GameCardData = {
      id: 'knight-growth-blade',
      type: 'weapon',
      name: '生长之刃',
      value: 1,
      durability: 3,
      maxDurability: 4,
      onEnterHandEffect: 'growth-blade-onhand',
      knightEffect: 'growth-blade',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;

    const upgraded = applyUpgrade(cappedBlade, 1);

    expect(upgraded.maxDurability).toBe(4);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.value).toBe(1);
  });
});
