/**
 * On-Upgrade Effect Definitions
 *
 * Registers all per-card upgrade behaviors for the UPGRADE_CARD action.
 *
 * Resolution priority (see `resolveUpgradeEffectId`):
 *   monster                      → 'monster:default'
 *   starter (only if registered) → 'starter:{starterBaseId}'
 *   knight                       → 'knight:{knightEffect}'
 *   amulet                       → 'amulet:{amuletEffect}'
 *
 * Starter is checked first to preserve precedence for cards that have
 * BOTH a starter base id and an `amuletEffect` (e.g. starter perm
 * amulets). The registry-membership check ensures that non-starter cards
 * (whose `getStarterBaseId(id)` returns the id unchanged) fall through
 * to the knight/amulet branches instead of being absorbed by a missing
 * `starter:{id}` lookup.
 *
 * Handlers receive a mutable `upgraded` copy whose `upgradeLevel` is
 * already set to `newLevel`; mutate fields in place.
 */

import { registerOnUpgradeAll } from '../on-upgrade';
import type { OnUpgradeHandler } from '../on-upgrade';
import type { GameCardData } from '@/components/GameCard';
import { applyMonsterUpgradeLevel } from '@/lib/monsterRage';
import { STARTER_CARD_IDS } from '../../deck';
import { clampMaxDurability } from '../../constants';

// ============================================================================
// Delta-based upgrade helpers
// ============================================================================
//
// 「升级=增强」的不变量：升级永远在当前值上叠加 per-level delta，绝不
// overwrite。这样 mid-game 的 amp / potion / 战斗扣损状态都被保留并在其
// 上加 delta。
//
// 例：护盾 armor 表 [2, 4]。L0→L1 delta = +2。
//   - base 值 (value=2) 升级 → value = 2 + 2 = 4（与旧 overwrite 行为相同）。
//   - 增幅过 (value=3) 升级 → value = 3 + 2 = 5（保留 +1 amp）。
//
// 范围（仅以下 5 个 mid-game-modifiable 字段走 delta）：
//   value / armorMax / maxDurability / durability / armor
// 其它效果描述符（healOnAttack、shieldBashStunRate、onEquipEffect、…）由
// handler 直接覆盖即可——这些字段不会被其它机制 mid-game 修改。

/**
 * 给护盾的 armor cap（value + armorMax）+ 当前 armor 应用 delta。
 *
 * - value / armorMax：current + delta（保留 mid-game 增幅）。
 * - armor（当前护甲血量）：preserve+delta，保留战斗扣损状态。
 *   `armor === undefined` 表示「at cap」（fresh shield）—— 不 set 字段，
 *   下次读取自动按新 cap = old cap + delta 刷满。
 *
 * 返回实际应用的 delta（可能是 0）。
 */
function applyShieldArmorDelta(
  upgraded: GameCardData,
  table: number[],
  newLevel: number,
): number {
  const prev = table[newLevel - 1] ?? table[0] ?? 0;
  const next = table[newLevel] ?? table[table.length - 1];
  const delta = next - prev;
  if (delta === 0) return 0;
  upgraded.value = (upgraded.value ?? prev) + delta;
  upgraded.armorMax = ((upgraded as any).armorMax ?? prev) + delta;
  if ((upgraded as any).armor !== undefined) {
    const cap = upgraded.armorMax!;
    (upgraded as any).armor = Math.max(
      0,
      Math.min(cap, ((upgraded as any).armor as number) + delta),
    );
  }
  return delta;
}

/**
 * 给装备的 maxDurability + 当前 durability 应用 delta。
 *
 * - maxDurability：current + intendedDelta，clamp 到 DURABILITY_CAP。
 * - durability（当前耐久）：增量同 realDelta（preserve broken amount，与旧
 *   "preserve broken amount" 语义一致），clamp 到新 maxDurability。
 *
 * 返回 realDelta（可能因 cap clamp 比 intendedDelta 小，甚至为 0）。
 */
function applyMaxDurabilityDelta(
  upgraded: GameCardData,
  table: number[],
  newLevel: number,
): number {
  if (upgraded.maxDurability == null) return 0;
  const prev = table[newLevel - 1] ?? table[0] ?? 0;
  const next = table[newLevel] ?? table[table.length - 1];
  const intendedDelta = next - prev;
  if (intendedDelta === 0) return 0;
  const oldMax = upgraded.maxDurability;
  const newMax = clampMaxDurability(oldMax + intendedDelta);
  const realDelta = newMax - oldMax;
  upgraded.maxDurability = newMax;
  if (realDelta > 0) {
    upgraded.durability = Math.min(newMax, (upgraded.durability ?? 0) + realDelta);
  } else if (realDelta < 0) {
    upgraded.durability = Math.min(newMax, upgraded.durability ?? 0);
  }
  return realDelta;
}

/**
 * 给武器的 value 应用 delta（保留 mid-game amp）。
 */
function applyValueDelta(
  upgraded: GameCardData,
  table: number[],
  newLevel: number,
): number {
  const prev = table[newLevel - 1] ?? table[0] ?? 0;
  const next = table[newLevel] ?? table[table.length - 1];
  const delta = next - prev;
  if (delta !== 0) upgraded.value = (upgraded.value ?? prev) + delta;
  return delta;
}

// ============================================================================
// Monster (default — applies to all monster cards)
// ============================================================================

const monsterDefault: OnUpgradeHandler = (upgraded, newLevel) => {
  const result = applyMonsterUpgradeLevel(upgraded, newLevel);
  Object.assign(upgraded, result);
  if (upgraded.maxDurability != null) {
    const prevMax = upgraded.maxDurability;
    const newMax = clampMaxDurability(prevMax + 1);
    upgraded.maxDurability = newMax;
    const gained = newMax - prevMax;
    if (gained > 0) {
      upgraded.durability = Math.min(newMax, (upgraded.durability ?? 0) + gained);
    } else {
      upgraded.durability = Math.min(newMax, upgraded.durability ?? 0);
    }
  }
};

// ============================================================================
// Starter cards
// ============================================================================
//
// Most starter on-upgrade handlers exist purely to keep `resolveUpgradeEffectId`
// routing the card to `starter:{id}` (the registry `has` check). Their
// description / magicEffect / shortDescription strings are produced by the
// per-id formatter in `definitions/card-text.ts` and applied in
// `applyUpgrade`. Handlers that also need to mutate engine fields
// (recycleDelay, magicType, onEquipEffect, …) keep just those mutations.

const noopUpgrade: OnUpgradeHandler = () => {};

const weaponBurst: OnUpgradeHandler = noopUpgrade;
const repairOne: OnUpgradeHandler = noopUpgrade;
const discardDraw: OnUpgradeHandler = noopUpgrade;

const reshuffle: OnUpgradeHandler = (upgraded, newLevel) => {
  const delays = [3, 2, 1];
  upgraded.recycleDelay = delays[newLevel] ?? 1;
};

const tempArmor: OnUpgradeHandler = noopUpgrade;
const activeRowFlip: OnUpgradeHandler = noopUpgrade;
const recallEquip: OnUpgradeHandler = noopUpgrade;

// 乾坤一翻 (`activeRowFlip`) and 回收术 (`recallEquip`) descriptions live in
// the formatter; routing-only registration above.

const dungeonSwap: OnUpgradeHandler = (upgraded, newLevel) => {
  if (newLevel === 1) {
    upgraded.recycleDelay = 1;
  }
};

// 训练之刃 (starter:trainingBlade)：
//   value design [3, 4, 5]（每级 +1 delta，preserve+delta amp 保留）。
//   maxDurability design [2, 3, 4]（每级 +1 delta，preserve broken amount，clamp 到 DURABILITY_CAP）。
const trainingBlade: OnUpgradeHandler = (upgraded, newLevel) => {
  const values = [3, 4, 5];
  const maxes = [2, 3, 4];
  applyValueDelta(upgraded, values, newLevel);
  applyMaxDurabilityDelta(upgraded, maxes, newLevel);
};

const stunStrike: OnUpgradeHandler = noopUpgrade;
const magicMissile: OnUpgradeHandler = noopUpgrade;
const loneCardAmulet: OnUpgradeHandler = noopUpgrade;
const attackPersuadeAmulet: OnUpgradeHandler = noopUpgrade;
const cardGainMissileAmulet: OnUpgradeHandler = noopUpgrade;

// `_counterDisplay` is a live state-derived field that the formatter does not
// own; the handler keeps the assignment. Threshold on upgrade is 6 (matches
// combat.ts / economy.ts trigger logic).
const damageClassDiscoverAmulet: OnUpgradeHandler = (upgraded, _newLevel, state) => {
  upgraded._counterDisplay = `${state.classDamageDiscoverStreak ?? 0}/6`;
};

const stunUpgradeCapAmulet: OnUpgradeHandler = noopUpgrade;

const recycleBackpackExpandAmulet: OnUpgradeHandler = (upgraded, _newLevel, state) => {
  upgraded._counterDisplay = `${state.recycleBackpackProgress ?? 0}/6`;
};

const dungeonGoldAmulet: OnUpgradeHandler = noopUpgrade;
const recycleDrawMagic: OnUpgradeHandler = noopUpgrade;

const dimensionWarp: OnUpgradeHandler = (upgraded, newLevel) => {
  const delays = [2, 1, 1];
  upgraded.recycleDelay = delays[newLevel] ?? 1;
};

const undyingBlessing: OnUpgradeHandler = noopUpgrade;
const gamblerGambit: OnUpgradeHandler = noopUpgrade;
const deckTopSwapGold: OnUpgradeHandler = noopUpgrade;

const healMagic: OnUpgradeHandler = (upgraded, newLevel) => {
  if (newLevel === 1) {
    // L1：保持 instant 一次性，治疗量 5 → 10。
    upgraded.magicType = 'instant';
    upgraded.recycleDelay = 0;
  } else if (newLevel === 2) {
    // L2：转为 Perm 2 永久魔法，治疗量 3。
    upgraded.magicType = 'permanent';
    upgraded.recycleDelay = 2;
  }
};

const classSummon: OnUpgradeHandler = (upgraded) => {
  upgraded.magicType = 'permanent';
  upgraded.recycleDelay = 2;
};

// ============================================================================
// Amulet effects
// ============================================================================

const persuadeOnTempAttack: OnUpgradeHandler = noopUpgrade;
const persuadeGrantRecycleFetch: OnUpgradeHandler = noopUpgrade;

// ============================================================================
// Knight effects
// ============================================================================
//
// As with the starter handlers above, knight handlers retain only the field
// mutations the engine reads at runtime (onEquipEffect, flankEffect,
// magicType, recycleDelay, etc.). Description / magicEffect / shortDescription
// are produced by the corresponding formatter in `definitions/card-text.ts`.

const graveyardRecall: OnUpgradeHandler = noopUpgrade;
const monsterRecruit: OnUpgradeHandler = noopUpgrade;
const bloodGreed: OnUpgradeHandler = noopUpgrade;
const armorStrike: OnUpgradeHandler = noopUpgrade;
const armorDoubleStrike: OnUpgradeHandler = noopUpgrade;
const battleSpirit: OnUpgradeHandler = noopUpgrade;
const berserkGambit: OnUpgradeHandler = noopUpgrade;
const missingHpSmite: OnUpgradeHandler = noopUpgrade;
const recycleFlare: OnUpgradeHandler = noopUpgrade;
const fateSight: OnUpgradeHandler = noopUpgrade;
const bloodDraw: OnUpgradeHandler = noopUpgrade;
const handPurgeRedraw: OnUpgradeHandler = noopUpgrade;
const handRecycleRedraw: OnUpgradeHandler = noopUpgrade;
const missileStorm: OnUpgradeHandler = noopUpgrade;
const graveNova: OnUpgradeHandler = noopUpgrade;
const overkillUpgrade: OnUpgradeHandler = noopUpgrade;

// 锋刃侧击 (knight:temp-attack-strike)：handler keeps `flankEffect` (consumed
// by the side-strike resolver) in sync with level; text comes from formatter.
const tempAttackStrike: OnUpgradeHandler = (upgraded, newLevel) => {
  const stunPcts = [20, 40, 60];
  const pct = stunPcts[newLevel] ?? stunPcts[stunPcts.length - 1];
  upgraded.flankEffect = `${pct}% 概率击晕目标`;
};

const eternalVessel: OnUpgradeHandler = noopUpgrade;
const flipBackActive: OnUpgradeHandler = noopUpgrade;
const threeCardThunder: OnUpgradeHandler = noopUpgrade;
const reorganizeBackpack: OnUpgradeHandler = noopUpgrade;
const armorStunConvert: OnUpgradeHandler = noopUpgrade;
const stunCapStrike: OnUpgradeHandler = noopUpgrade;
const backpackBolt: OnUpgradeHandler = noopUpgrade;
const recycleBolt: OnUpgradeHandler = noopUpgrade;
const backpackCapStun: OnUpgradeHandler = noopUpgrade;
const backpackCapHeal: OnUpgradeHandler = noopUpgrade;
// 布雷术：升级后 recycleDelay 2 → 1（PERM 2 → PERM 1）。
// 卡牌效果（5 点纯陷阱伤害 / 随机空格生成 1 个地雷）不变，仅缩短回充周期。
const layMine: OnUpgradeHandler = (upgraded, newLevel) => {
  if (newLevel === 1) {
    upgraded.recycleDelay = 1;
  }
};
// 引雷阵锋 (knight:thunder-array-blade)：
//   L0: value=3 / dur=2/2 / mineDamageBoostPerDur=2
//   L1: value=3 / dur=3/3 / mineDamageBoostPerDur=2  （仅耐久 +1）
//   L2: value=3 / dur=3/3 / mineDamageBoostPerDur=3  （仅 boost +1）
// `applyMaxDurabilityDelta` 的 preserve+delta 语义 + clampMaxDurability 兜底已经
// 处理了「玩家中途用过 → 当前 dur < max」的情况；mid-game 增幅的 dur/maxDur
// 会按 delta 一起涨。
const thunderArrayBlade: OnUpgradeHandler = (upgraded, newLevel) => {
  const maxDurs = [2, 3, 3];
  const boosts = [2, 2, 3];
  applyMaxDurabilityDelta(upgraded, maxDurs, newLevel);
  upgraded.mineDamageBoostPerDur = boosts[newLevel] ?? boosts[boosts.length - 1];
};
const tempAttackArmorDraw: OnUpgradeHandler = noopUpgrade;
const tempAttackDouble: OnUpgradeHandler = noopUpgrade;
const backpackTempAttack: OnUpgradeHandler = noopUpgrade;
const recycleTempArmor: OnUpgradeHandler = noopUpgrade;
const amplifyEquipmentShift: OnUpgradeHandler = noopUpgrade;
const essenceExtract: OnUpgradeHandler = noopUpgrade;

// 圣光之刃 (knight:holy-blade)：handler keeps onEquipEffect (heal-N) and
// healOnAttack in sync with level; text comes from formatter.
const holyBlade: OnUpgradeHandler = (upgraded, newLevel) => {
  const onEquipHeals = [3, 4, 5];
  const healPerAttacks = [2, 3, 4];
  const onEquipHeal = onEquipHeals[newLevel] ?? 5;
  const healPerAttack = healPerAttacks[newLevel] ?? 4;
  (upgraded as any).onEquipEffect = `heal-${onEquipHeal}`;
  (upgraded as any).healOnAttack = healPerAttack;
};

// 疾风短剑 (knight:swift-dagger)：基础全栏 +2 临攻，每升 1 级 +2（L0: 2 → L1: 4 → L2: 6）。
// onEquipEffect 在 all-temp-attack-2 / -4 / -6 三个 handler 之间切换。
// `restoreDurabilityOnKill: true` 不变（卡面文案"杀怪回满耐久"在每个等级都保留）。
const swiftDagger: OnUpgradeHandler = (upgraded, newLevel) => {
  const amounts = [2, 4, 6];
  const n = amounts[newLevel] ?? 6;
  (upgraded as any).onEquipEffect = `all-temp-attack-${n}`;
};

// 进化甲壁 (knight:evolving-shield)：
//   每个手动升级级别 = 一次「auto-evolve 周期」（与 combat.ts 的自动升级效果完全一致）：
//     value/armorMax design [3, 5, 7]（每级 +2 delta，preserve+delta amp 保留）、
//     maxDurability design [2, 3, 4]（每级 +1 delta，preserve broken amount，
//     受 DURABILITY_CAP 约束）、_shieldBlockCount 归 0。
//   armor 字段走 preserve+delta（与其它 shield handler 一致；旧实现 delete armor
//   是为了让下次读取按新 cap 刷满，但与"升级保留战斗扣损状态"的不变量冲突，已改）。
//   注意：combat.ts 的 auto-evolve 路径仍是 strip armor → refill to new cap
//   （独立路径，不走 OnUpgradeHandler），保留旧行为以方便对比。
//   shieldBlockAutoUpgradeCount 字段保留，所以升级后仍可继续 auto-evolve。
//   maxUpgradeLevel 2 = 撞 durability cap 的自然停点（base 2/2 → L1 3/3 → L2 4/4）。
const evolvingShield: OnUpgradeHandler = (upgraded, newLevel) => {
  const armors = [3, 5, 7];
  const maxDurs = [2, 3, 4];

  applyShieldArmorDelta(upgraded, armors, newLevel);
  applyMaxDurabilityDelta(upgraded, maxDurs, newLevel);

  (upgraded as any)._shieldBlockCount = 0;
};

// 雷震守护盾 (knight:thunder-guard-shield)：
//   L0 -> L1: armor / durability 不变（8 / 1/1）。
//             onDestroyEffect 'stunCap+8' → 'stunCap+10'（遗言击晕上限 +10%）。
//   L1 -> L2: armor / durability / onDestroyEffect 不变。
//             hasEquipmentRevive 设为 true（首次摧毁恢复 1 耐久；第二次才触发遗言）。
//   description / shortDescription 同步描述。
//   stunCap+N 由 rules/equipment-effects.ts 与 rules/waterfall.ts 两条遗言路径以及
//   GameCard.tsx / CardDetailsModal.tsx 两处 UI 显式 parseInt 解析，无需改消费方。
//   hasEquipmentRevive 由 computeEquipmentBreakEffects 的 equipReviveAvailable 分支处理，
//   首次摧毁时 reviveUpdate 把 durability 写回 1 并设 equipmentReviveUsed=true。
const thunderGuardShield: OnUpgradeHandler = (upgraded, newLevel) => {
  const stunAmounts = [8, 10, 10];
  const reviveFlags = [false, false, true];

  const stunAmount = stunAmounts[newLevel] ?? stunAmounts[stunAmounts.length - 1];
  upgraded.onDestroyEffect = `stunCap+${stunAmount}`;

  const revive = reviveFlags[newLevel] ?? reviveFlags[reviveFlags.length - 1];
  if (revive) {
    (upgraded as any).hasEquipmentRevive = true;
  } else {
    delete (upgraded as any).hasEquipmentRevive;
    delete (upgraded as any).equipmentReviveUsed;
  }
};

// 共御圣盾 (knight:communal-defense-shield)：
//   L0 -> L1: value/armorMax design [6, 8]（delta +2，preserve+delta，amp 保留）。
//             durability 不变（1/1）。hasEquipmentRevive 保留（true）。
//             onDestroyEffect 不变（allSlotTempArmor:4）。
//   L1 -> L2: value/armorMax 不变（8）。durability 不变（1/1）。
//             hasEquipmentRevive 保留（true）。
//             onDestroyEffect allSlotTempArmor:4 → allSlotTempArmor:7（全栏 +7 临时护甲）。
//   description / shortDescription 动态更新临时护甲数字。
//   allSlotTempArmor:N 由 rules/equipment-effects.ts 与 rules/waterfall.ts 两条遗言路径
//   解析（startsWith 'allSlotTempArmor:' + parseInt 取数字），无需改消费方。
const communalDefenseShield: OnUpgradeHandler = (upgraded, newLevel) => {
  const armors = [6, 8, 8];
  const tempArmorAmounts = [4, 4, 7];

  applyShieldArmorDelta(upgraded, armors, newLevel);

  const tempArmorAmount = tempArmorAmounts[newLevel] ?? tempArmorAmounts[tempArmorAmounts.length - 1];
  upgraded.onDestroyEffect = `allSlotTempArmor:${tempArmorAmount}`;
};

// 弹幕护盾 (knight:barrage-shield)：
//   L0 -> L1: value/armorMax design table [4, 6]，delta +2（preserve+delta：
//             current value + 2，amp 保留；当前 armor 同 +2 clamp 到新 cap）。
//             durability 3/3 不变。perfectBlockSpawnMissiles 不变（2）。
//   L1 -> L2: value/armorMax 不变（6）。durability 3/3 不变。
//             perfectBlockSpawnMissiles 2 → 3（完美格挡生成 3 张魔弹）。
//   description / shortDescription 动态更新魔弹张数。
const barrageShield: OnUpgradeHandler = (upgraded, newLevel) => {
  const armors = [4, 6, 6];
  const missileCounts = [2, 2, 3];

  applyShieldArmorDelta(upgraded, armors, newLevel);

  const missileCount = missileCounts[newLevel] ?? missileCounts[missileCounts.length - 1];
  (upgraded as any).perfectBlockSpawnMissiles = missileCount;
};

// 生长之盾 (knight:growth-shield)：
//   L0 -> L1: armor / durability 不变（2 / 4）。amplifyOnFlipAmount 1 → 2
//             （每次卡牌翻转，该盾按卡名累计 +2 护甲与护甲上限）。
//             onDestroyEventCount 不变（1）。description 同步更新数字。
//   L1 -> L2: amplifyOnFlipAmount 仍 2。onDestroyEventCount 1 → 3
//             （遗言改为从坟场随机抽出 3 张 Event 加入手牌）。
// `amplifyOnFlip: true` 与 `onDestroyEffect: 'graveyard-event-to-hand'` 三级都不变 —
// 升级仅调整两个新数字字段。
const growthShield: OnUpgradeHandler = (upgraded, newLevel) => {
  const flipAmounts = [1, 2, 2];
  const eventCounts = [1, 1, 3];

  const flipAmount = flipAmounts[newLevel] ?? flipAmounts[flipAmounts.length - 1];
  const eventCount = eventCounts[newLevel] ?? eventCounts[eventCounts.length - 1];

  if (flipAmount > 1) {
    (upgraded as any).amplifyOnFlipAmount = flipAmount;
  } else {
    delete (upgraded as any).amplifyOnFlipAmount;
  }
  if (eventCount > 1) {
    (upgraded as any).onDestroyEventCount = eventCount;
  } else {
    delete (upgraded as any).onDestroyEventCount;
  }
};

// 坚韧磐盾 (knight:endurance-shield)：
//   L0 -> L1: armor design table [3, 5]，delta +2（preserve+delta，amp 保留）。
//             耐久不变，效果不变。
//   L1 -> L2: armor 不变，耐久不变，equipBlockDurabilityBonus 1 -> 2
//             （怪物回合最多消耗从 2 → 3 耐久；shieldRefillOnMonsterDeath 保留）。
//   description / shortDescription 动态更新数字。
const enduranceShield: OnUpgradeHandler = (upgraded, newLevel) => {
  const armors = [3, 5, 5];
  const blockBonuses = [1, 1, 2];

  applyShieldArmorDelta(upgraded, armors, newLevel);

  const blockBonus = blockBonuses[newLevel] ?? blockBonuses[blockBonuses.length - 1];
  (upgraded as any).equipBlockDurabilityBonus = blockBonus;
};

// 猛击之盾 (knight:shield-bash)：
//   L0 -> L1: shieldBashStunRate 5 -> 7（armor/durability 不变；5%×armor → 7%×armor）。
//   L1 -> L2: shieldBashStunRate 7 -> 10（10%×armor）。
//   description / shortDescription 动态更新百分比文案。
const shieldBash: OnUpgradeHandler = (upgraded, newLevel) => {
  const rates = [5, 7, 10];
  const rate = rates[newLevel] ?? rates[rates.length - 1];
  (upgraded as any).shieldBashStunRate = rate;
};

// 守望者之盾 (knight:guardian-link-shield)：
//   L0 -> L1: value/armorMax design [4, 5]（delta +1）、maxDur design [2, 3]（delta +1）、效果不变。
//   L1 -> L2: value/armorMax design [5, 8]（delta +3）、maxDur 不变（3）、效果不变。
//   `blockGrantTempArmorToOther` 的 grant amount 直接读 storedCap（base+perm+temp），
//   armor 涨了 grant 自动跟着涨，所以效果文案"等同此盾护甲值"不需要改。
const guardianLinkShield: OnUpgradeHandler = (upgraded, newLevel) => {
  const armors = [4, 5, 8];
  const maxDurs = [2, 3, 3];

  applyShieldArmorDelta(upgraded, armors, newLevel);
  applyMaxDurabilityDelta(upgraded, maxDurs, newLevel);
};

// 不朽骨盾 (knight:revive-bone-shield)：
//   L0 -> L1: armor 不变（3）、durability 不变（2/2）、复生不变。
//             onDestroyPermanentDamage 1 → 2（遗言改为该装备栏永久伤害 +2）。
const reviveBoneShield: OnUpgradeHandler = (upgraded, newLevel) => {
  const damages = [1, 2];
  const damage = damages[newLevel] ?? 2;
  (upgraded as any).onDestroyPermanentDamage = damage;
};

// 智者圣盾 (knight:scholar-shield)：
//   L0 -> L1: armor / durability 不变（4 / 2/2）。
//             onEquipEffect 'draw-2' → 'draw-3'（入场抽 3 张）；
//             onDestroyDraw 2 → 3（遗言抽 3 张）。
// 入场抽牌走 equipment.ts 注册的 'draw-N' OnEquipHandler；遗言抽牌走
// equipment-effects.ts 既有 onDestroyDraw 累加路径。两者都 enqueue
// `DRAW_CARDS source: 'backpack'`（draw-cards-defaults-to-backpack 规则）。
const scholarShield: OnUpgradeHandler = (upgraded, newLevel) => {
  const drawCounts = [2, 3];
  const draw = drawCounts[newLevel] ?? 3;
  (upgraded as any).onEquipEffect = `draw-${draw}`;
  (upgraded as any).onDestroyDraw = draw;
};

// 智者之刃 (knight:scholar-blade)：
//   L0 -> L1: maxDurability/durability 3/3 → 4/4（applyMaxDurabilityDelta 走 preserve+delta，
//             保留 mid-game amp / 战斗中残存的破损量）。value (4 攻) / drawOnAttack (2) 不变。
//   L1 -> L2: maxDurability/durability 不变（4/4，table delta = 0）。
//             drawOnAttack 2 → 3（每次攻击从背包抽 3 张牌）。
// drawOnAttack 由 combat.ts:reducePerformHeroAttack 的 drawOnAttack 触发分支消费
// （mirror healOnAttack 的 fork + overclock 语义）；走标准 DRAW_CARDS source: 'backpack'。
const scholarBlade: OnUpgradeHandler = (upgraded, newLevel) => {
  const maxDurs = [3, 4, 4];
  const drawCounts = [2, 2, 3];
  applyMaxDurabilityDelta(upgraded, maxDurs, newLevel);
  (upgraded as any).drawOnAttack = drawCounts[newLevel] ?? drawCounts[drawCounts.length - 1];
};

// 守护圣盾 (knight:guardian-shield)：
//   L0 -> L1: armor design [3, 4]（delta +1），preserve+delta（amp 保留）。
//             durability design [2, 3]（delta +1，preserve broken amount）。
//             shieldPerfectBlockArmorSaveChance 不变（50）。
//   L1 -> L2: armor / durability 不变（4 / 3）。
//             shieldPerfectBlockArmorSaveChance 50 → 60。
const guardianShield: OnUpgradeHandler = (upgraded, newLevel) => {
  const armors = [3, 4, 4];
  const maxDurs = [2, 3, 3];
  const saveChances = [50, 50, 60];

  applyShieldArmorDelta(upgraded, armors, newLevel);
  applyMaxDurabilityDelta(upgraded, maxDurs, newLevel);

  const chance = saveChances[newLevel] ?? 60;
  (upgraded as any).shieldPerfectBlockArmorSaveChance = chance;
};

// 棘刺反盾 (knight:thorned-shield)：
//   L0 -> L1: 护甲不变（4），耐久 design [2, 3]（delta +1，preserve broken amount）。
//             效果不变（reflectHalfDamage 反弹一半 + 永久攻击 + 临时攻击）。
//   L1 -> L2: 护甲不变（4），耐久不变（3）。
//             reflectHalfDamage → reflectFullDamage（反弹全部攻击伤害 + 永久攻击 + 临时攻击）。
const thornedShield: OnUpgradeHandler = (upgraded, newLevel) => {
  const maxDurs = [2, 3, 3];
  applyMaxDurabilityDelta(upgraded, maxDurs, newLevel);

  if (newLevel >= 2) {
    delete (upgraded as any).reflectHalfDamage;
    (upgraded as any).reflectFullDamage = true;
  } else {
    (upgraded as any).reflectHalfDamage = true;
    delete (upgraded as any).reflectFullDamage;
  }
};

// 铁壁塔盾 (knight:fullBlock)：
//   L0 -> L1: armor design [5, 8]（delta +3，preserve+delta，amp 保留）。
//             durability 不变（1/1）。effect 不变。
//   L1 -> L2: armor 不变（8）。durability 不变（1/1）。
//             加 shieldExtraBlocksPerDurability: 1（共可格挡 2 次再损毁）。
const fullBlockShield: OnUpgradeHandler = (upgraded, newLevel) => {
  const armors = [5, 8, 8];
  const extraBlocks = [0, 0, 1];

  applyShieldArmorDelta(upgraded, armors, newLevel);

  const extra = extraBlocks[newLevel] ?? 1;
  if (extra > 0) {
    (upgraded as any).shieldExtraBlocksPerDurability = extra;
    (upgraded as any)._shieldDurabilityBlockCounter = 0;
  } else {
    delete (upgraded as any).shieldExtraBlocksPerDurability;
    delete (upgraded as any)._shieldDurabilityBlockCounter;
  }
};

// 魔弹连弩 (knight:magic-missile-crossbow)：
//   L0 -> L1: value design [1, 3]（delta +2，preserve+delta amp 保留）。
//             durability 不变（3/3）。bolt count 不变（1）。
//   L1 -> L2: value 不变（3）。durability 不变（3/3）。
//             onAttackAmplifyMissileGenerateCount 1 → 2（超杀生成 2 张魔弹）。
const magicMissileCrossbow: OnUpgradeHandler = (upgraded, newLevel) => {
  const values = [1, 3, 3];
  const boltCounts = [1, 1, 2];

  applyValueDelta(upgraded, values, newLevel);

  const boltCount = boltCounts[newLevel] ?? 2;
  if (boltCount > 1) {
    (upgraded as any).onAttackAmplifyMissileGenerateCount = boltCount;
  } else {
    delete (upgraded as any).onAttackAmplifyMissileGenerateCount;
  }
};

// 生长之刃 (knight:growth-blade)：
//   L0 -> L1: value 不变（1），maxDurability design [3, 4]（delta +1，preserve broken amount）。
//             effect 不变（仍 +1 增幅 per 上手）。
//   L1 -> L2: value/durability 不再变（1 / 4），onEnterHandEffect 从 'growth-blade-onhand'
//             切到 'growth-blade-onhand-x2'，每次上手增幅两次（+2 攻击）。
const growthBlade: OnUpgradeHandler = (upgraded, newLevel) => {
  const maxes = [3, 4, 4];
  const onHandEffects = ['growth-blade-onhand', 'growth-blade-onhand', 'growth-blade-onhand-x2'];

  applyMaxDurabilityDelta(upgraded, maxes, newLevel);

  (upgraded as any).onEnterHandEffect = onHandEffects[newLevel] ?? 'growth-blade-onhand-x2';
};

// 共鸣之刃 (knight:resonance-blade)：
//   L0 -> L1: value 不变（4），maxDurability design [2, 3]（delta +1，preserve broken amount）。
//             effects 不变（仍 +2 临攻 / +1 修复）。
//   L1 -> L2: value/durability 不再变（4 / 3），onAttackBuffOtherSlotTempAttack 2 → 4。
// `onAttackRepairOtherSlot: 1` 三级都不变。
const resonanceBlade: OnUpgradeHandler = (upgraded, newLevel) => {
  const maxes = [2, 3, 3];
  const tempAttacks = [2, 2, 4];

  applyMaxDurabilityDelta(upgraded, maxes, newLevel);

  const tempAttack = tempAttacks[newLevel] ?? 4;
  (upgraded as any).onAttackBuffOtherSlotTempAttack = tempAttack;
};

// 怒斩之刃 (knight:rage-cleave)：
//   L0 -> L1: weaponExtraAttack 不变（1 = 每回合 2 攻），onAttackDebuffAllMonsterAttack 2 → 3。
//   L1 -> L2: weaponExtraAttack 1 → 2（每回合 3 攻），onAttackDebuffAllMonsterAttack 仍 3。
// `value` / `durability` / `maxDurability` 三级都不变（4 攻 / 3 耐久）。
const rageCleave: OnUpgradeHandler = (upgraded, newLevel) => {
  const extraAttacks = [1, 1, 2];
  const debuffs = [2, 3, 3];
  const extra = extraAttacks[newLevel] ?? 2;
  const debuff = debuffs[newLevel] ?? 3;
  (upgraded as any).weaponExtraAttack = extra;
  (upgraded as any).onAttackDebuffAllMonsterAttack = debuff;
};

// 汰换之刃 (knight:exchange-blade)：
//   L0 -> L1: onEquipEffect 不变（'perm-slot-damage+1'），onDestroyPermanentShield 1 → 2。
//   L1 -> L2: onEquipEffect → 'perm-slot-damage+2'，onDestroyPermanentShield 仍 2。
// `value` / `durability` / `maxDurability` 三级都不变（2 攻 / 3 耐久）。
const exchangeBlade: OnUpgradeHandler = (upgraded, newLevel) => {
  const equipDmgs = [1, 1, 2];
  const destroyShields = [1, 2, 2];
  const equipDmg = equipDmgs[newLevel] ?? 2;
  const destroyShield = destroyShields[newLevel] ?? 2;
  (upgraded as any).onEquipEffect = `perm-slot-damage+${equipDmg}`;
  (upgraded as any).onDestroyPermanentShield = destroyShield;
};

// 噬魂猎刃 (knight:soul-hunter-blade)：
//   L0 -> L1: value 不变（5），maxDurability design [2, 3]（delta +1）。
//   L1 -> L2: value design [5, 6]（delta +1，preserve+delta amp 保留），maxDurability design [3, 4]（delta +1）。
// `overkillRecycleToHand: 2` / 描述 / shortDescription 三级都不变（"超杀回收袋 2 张牌"效果未变）。
const soulHunterBlade: OnUpgradeHandler = (upgraded, newLevel) => {
  const values = [5, 5, 6];
  const maxes = [2, 3, 4];

  applyValueDelta(upgraded, values, newLevel);
  applyMaxDurabilityDelta(upgraded, maxes, newLevel);
};

// 雷击碎骨锤 (knight:thunder-stun-hammer)：
//   L0 -> L1: value design [3, 4]（delta +1，preserve+delta），maxDurability design [2, 3]（delta +1），
//             effects 不变（仍 stunCap+5）。
//   L1 -> L2: value/durability 不再变（保持 4 / 3），onEquipEffect 升到 'stunCap+10'。
// `weaponStunChance: 60` / `doubleDamageOnStunned: true` 三级都不变。
const thunderStunHammer: OnUpgradeHandler = (upgraded, newLevel) => {
  const values = [3, 4, 4];
  const maxes = [2, 3, 3];
  const stunCaps = [5, 5, 10];

  applyValueDelta(upgraded, values, newLevel);
  applyMaxDurabilityDelta(upgraded, maxes, newLevel);

  const stunCap = stunCaps[newLevel] ?? 10;
  (upgraded as any).onEquipEffect = `stunCap+${stunCap}`;
};

// 感化之锤 (knight:persuade-hammer)：仅 1 级。
// L0 -> L1: persuadeBoostOnHit 20 → 30。其它字段（攻击力、耐久、武器消耗逻辑）不变。
const persuadeHammer: OnUpgradeHandler = (upgraded, newLevel) => {
  const boosts = [20, 30];
  const n = boosts[newLevel] ?? 30;
  (upgraded as any).persuadeBoostOnHit = n;
};

// 碎雷战锤 (knight:thunder-hammer)：攻击力 / 永久 +1 伤害效果不变；
// 仅 maxDurability 随升级提升 design [1, 2, 3]（每级 +1 delta，preserve broken amount）。
// 描述 / shortDescription 不动 —— 卡面文案在三级都一样。
const thunderHammer: OnUpgradeHandler = (upgraded, newLevel) => {
  const maxes = [1, 2, 3];
  applyMaxDurabilityDelta(upgraded, maxes, newLevel);
};

// ============================================================================
// Registration
// ============================================================================

registerOnUpgradeAll([
  // Monster
  { id: 'monster:default', handler: monsterDefault },

  // Starters
  { id: `starter:${STARTER_CARD_IDS.weaponBurst}`, handler: weaponBurst },
  { id: `starter:${STARTER_CARD_IDS.repairOne}`, handler: repairOne },
  { id: `starter:${STARTER_CARD_IDS.discardDraw}`, handler: discardDraw },
  { id: `starter:${STARTER_CARD_IDS.reshuffle}`, handler: reshuffle },
  { id: `starter:${STARTER_CARD_IDS.tempArmor}`, handler: tempArmor },
  { id: `starter:${STARTER_CARD_IDS.dungeonSwap}`, handler: dungeonSwap },
  { id: `starter:${STARTER_CARD_IDS.activeRowFlip}`, handler: activeRowFlip },
  { id: `starter:${STARTER_CARD_IDS.recallEquip}`, handler: recallEquip },
  { id: `starter:${STARTER_CARD_IDS.trainingBlade}`, handler: trainingBlade },
  { id: `starter:${STARTER_CARD_IDS.stunStrike}`, handler: stunStrike },
  { id: `starter:${STARTER_CARD_IDS.magicMissile}`, handler: magicMissile },
  { id: `starter:${STARTER_CARD_IDS.loneCardAmulet}`, handler: loneCardAmulet },
  { id: `starter:${STARTER_CARD_IDS.attackPersuadeAmulet}`, handler: attackPersuadeAmulet },
  { id: `starter:${STARTER_CARD_IDS.cardGainMissileAmulet}`, handler: cardGainMissileAmulet },
  { id: `starter:${STARTER_CARD_IDS.damageClassDiscoverAmulet}`, handler: damageClassDiscoverAmulet },
  { id: `starter:${STARTER_CARD_IDS.stunUpgradeCapAmulet}`, handler: stunUpgradeCapAmulet },
  { id: `starter:${STARTER_CARD_IDS.recycleBackpackExpandAmulet}`, handler: recycleBackpackExpandAmulet },
  { id: `starter:${STARTER_CARD_IDS.dungeonGoldAmulet}`, handler: dungeonGoldAmulet },
  { id: `starter:${STARTER_CARD_IDS.recycleDrawMagic}`, handler: recycleDrawMagic },
  { id: `starter:${STARTER_CARD_IDS.dimensionWarp}`, handler: dimensionWarp },
  { id: `starter:${STARTER_CARD_IDS.undyingBlessing}`, handler: undyingBlessing },
  { id: `starter:${STARTER_CARD_IDS.gamblerGambit}`, handler: gamblerGambit },
  { id: `starter:${STARTER_CARD_IDS.deckTopSwapGold}`, handler: deckTopSwapGold },
  { id: `starter:${STARTER_CARD_IDS.healMagic}`, handler: healMagic },
  { id: `starter:${STARTER_CARD_IDS.classSummon}`, handler: classSummon },

  // Amulet effects
  { id: 'amulet:persuade-on-temp-attack', handler: persuadeOnTempAttack },
  { id: 'amulet:persuade-grant-recycle-fetch', handler: persuadeGrantRecycleFetch },

  // Knight effects
  { id: 'knight:graveyard-recall', handler: graveyardRecall },
  { id: 'knight:monster-recruit', handler: monsterRecruit },
  { id: 'knight:blood-greed', handler: bloodGreed },
  { id: 'knight:armor-strike', handler: armorStrike },
  { id: 'knight:armor-double-strike', handler: armorDoubleStrike },
  { id: 'knight:battle-spirit', handler: battleSpirit },
  { id: 'knight:berserk-gambit', handler: berserkGambit },
  { id: 'knight:missing-hp-smite', handler: missingHpSmite },
  { id: 'knight:recycle-flare', handler: recycleFlare },
  { id: 'knight:fate-sight', handler: fateSight },
  { id: 'knight:blood-draw', handler: bloodDraw },
  { id: 'knight:hand-purge-redraw', handler: handPurgeRedraw },
  { id: 'knight:hand-recycle-redraw', handler: handRecycleRedraw },
  { id: 'knight:missile-storm', handler: missileStorm },
  { id: 'knight:grave-nova', handler: graveNova },
  { id: 'knight:overkill-upgrade', handler: overkillUpgrade },
  { id: 'knight:temp-attack-strike', handler: tempAttackStrike },
  { id: 'knight:eternal-vessel', handler: eternalVessel },
  { id: 'knight:flip-back-active', handler: flipBackActive },
  { id: 'knight:three-card-thunder', handler: threeCardThunder },
  { id: 'knight:reorganize-backpack', handler: reorganizeBackpack },
  { id: 'knight:armor-stun-convert', handler: armorStunConvert },
  { id: 'knight:stun-cap-strike', handler: stunCapStrike },
  { id: 'knight:backpack-bolt', handler: backpackBolt },
  { id: 'knight:recycle-bolt', handler: recycleBolt },
  { id: 'knight:backpack-cap-stun', handler: backpackCapStun },
  { id: 'knight:backpack-cap-heal', handler: backpackCapHeal },
  { id: 'knight:lay-mine', handler: layMine },
  { id: 'knight:thunder-array-blade', handler: thunderArrayBlade },
  { id: 'knight:temp-attack-armor-draw', handler: tempAttackArmorDraw },
  { id: 'knight:temp-attack-double', handler: tempAttackDouble },
  { id: 'knight:backpack-temp-attack', handler: backpackTempAttack },
  { id: 'knight:recycle-temp-armor', handler: recycleTempArmor },
  { id: 'knight:amplify-equipment-shift', handler: amplifyEquipmentShift },
  { id: 'knight:essence-extract', handler: essenceExtract },
  { id: 'knight:holy-blade', handler: holyBlade },
  { id: 'knight:swift-dagger', handler: swiftDagger },
  { id: 'knight:thunder-hammer', handler: thunderHammer },
  { id: 'knight:persuade-hammer', handler: persuadeHammer },
  { id: 'knight:thunder-stun-hammer', handler: thunderStunHammer },
  { id: 'knight:soul-hunter-blade', handler: soulHunterBlade },
  { id: 'knight:exchange-blade', handler: exchangeBlade },
  { id: 'knight:rage-cleave', handler: rageCleave },
  { id: 'knight:resonance-blade', handler: resonanceBlade },
  { id: 'knight:growth-blade', handler: growthBlade },
  { id: 'knight:magic-missile-crossbow', handler: magicMissileCrossbow },
  { id: 'knight:fullBlock', handler: fullBlockShield },
  { id: 'knight:thorned-shield', handler: thornedShield },
  { id: 'knight:guardian-shield', handler: guardianShield },
  { id: 'knight:revive-bone-shield', handler: reviveBoneShield },
  { id: 'knight:evolving-shield', handler: evolvingShield },
  { id: 'knight:guardian-link-shield', handler: guardianLinkShield },
  { id: 'knight:shield-bash', handler: shieldBash },
  { id: 'knight:endurance-shield', handler: enduranceShield },
  { id: 'knight:growth-shield', handler: growthShield },
  { id: 'knight:barrage-shield', handler: barrageShield },
  { id: 'knight:thunder-guard-shield', handler: thunderGuardShield },
  { id: 'knight:communal-defense-shield', handler: communalDefenseShield },
  { id: 'knight:scholar-shield', handler: scholarShield },
  { id: 'knight:scholar-blade', handler: scholarBlade },
]);
