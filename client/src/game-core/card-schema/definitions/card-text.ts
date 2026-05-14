/**
 * Card Text Formatters
 *
 * Authoritative source for every card's level-aware display strings —
 * `description`, `shortDescription`, and `magicEffect`. Lives separately
 * from the on-upgrade handlers (which now only mutate numeric / flag /
 * effect-id fields) and runs after each handler in `applyUpgrade`.
 *
 * Two historical gaps are closed here:
 *
 *   1. Cards with `maxUpgradeLevel > 0` that had NO on-upgrade handler at
 *      all — e.g. `怀柔令` (`knight:persuade-discount`), knight-class
 *      `紧急回收` (`knight:recall-equipment`), `查阅动作`, `锐意鼓舞`.
 *      Without a formatter the UI text never refreshed past Lv 0.
 *
 *   2. Handlers that updated numbers but not text — every such handler now
 *      has a formatter, so adding new effect logic does not silently leave
 *      the description stale.
 *
 * Routing mirrors `on-upgrade.ts:resolveUpgradeEffectId`:
 *
 *   1. monster                                              → 'monster:default'
 *   2. starter base id (only if a formatter is registered)  → 'starter:{id}'
 *   3. knightEffect                                         → 'knight:{ke}'
 *   4. amuletEffect                                         → 'amulet:{ae}'
 *
 * Each formatter is a pure projection of `(card, state)` to `CardText`.
 * Returning `null` leaves the card's existing description fields untouched
 * (used by levels where the original handler intentionally left text alone,
 * e.g. `dungeonSwap` Lv 1 only changes `recycleDelay`).
 */

import { registerCardTextAll } from '../card-text';
import type { CardText, CardTextFormatter } from '../card-text';
import { STARTER_CARD_IDS } from '../../deck';

// ============================================================================
// Helpers
// ============================================================================

function pick<T>(table: T[], level: number): T {
  return table[level] ?? table[table.length - 1];
}

// ============================================================================
// Starter cards
// ============================================================================

const weaponBurst: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const burstVal = 2 + 2 * level;
  return {
    description: `选择一个装备栏，临时攻击力 +${burstVal}（瀑流后重置）。`,
    magicEffect: `永久魔法：选择一个装备栏，临时攻击力 +${burstVal}。`,
  };
};

const repairOne: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const hpCosts = [2, 1, 1];
  const repairAmounts = [1, 1, 2];
  const hpCost = hpCosts[level] ?? 1;
  const repair = repairAmounts[level] ?? 2;
  const hpPart = hpCost > 0 ? `失去 ${hpCost} 点生命，` : '';
  const drawPart = level >= 1 ? '，抽 1 张牌' : '';
  return {
    description: `${hpPart}选择一个装备恢复 ${repair} 点耐久${drawPart}。`,
    magicEffect: `永久魔法：${hpPart}选择一个装备恢复 ${repair} 点耐久${drawPart}。`,
  };
};

const discardDraw: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const discards = [1, 1, 1];
  const draws = [2, 3, 4];
  const d = discards[level] ?? 1;
  const dr = draws[level] ?? 1;
  return {
    description: `将 ${d} 张手牌移到回收袋，从背包抽取 ${dr} 张新牌。`,
    magicEffect: `永久魔法：将 ${d} 张手牌移到回收袋，从背包抽 ${dr} 张牌。`,
  };
};

const tempArmor: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const taAmounts = [2, 4, 6];
  const ta = taAmounts[level] ?? 6;
  return {
    description: `选择一个装备栏，+${ta} 临时护甲。`,
    magicEffect: `永久魔法：选择一个装备栏，+${ta} 临时护甲。`,
  };
};

// 乾坤一翻：升级 1 在原效果上额外抽 1 张牌（每翻一张卡 → 抽 1；0 目标时也抽）。
// 不设 magicEffect（与基础卡保持一致——基础卡刻意不挂 magicEffect 以避免被
// resolveEffectId 短路到 magic:<long-text>，错过 starter:starter-perm-active-row-flip
// resolver；upgrade 也保持 starter-id 路由）。
const activeRowFlip: CardTextFormatter = (card) => {
  if ((card.upgradeLevel ?? 0) < 1) return null;
  return {
    description: '选择当前行一张可翻转或已翻转的卡牌，或预览行一张未翻面的卡背，将其翻转，抽 1 张牌。',
    shortDescription: '翻一张牌；抽 1',
  };
};

// 回收术：基础 = 回手一张牌（从装备栏或护符栏选择），失去 2 HP；升级 1 在结算后
// 额外抽 1 张牌。
const recallEquip: CardTextFormatter = (card) => {
  if ((card.upgradeLevel ?? 0) < 1) return null;
  return {
    description: '失去 2 点生命，回手一张牌（从装备栏或护符栏选择），抽 1 张牌。',
    magicEffect: '永久魔法：失去 2 HP，回手一张牌，抽 1 张牌。',
    shortDescription: '失去 2 生命，回手 1 张装备/护符；抽 1 张',
  };
};

const dungeonSwap: CardTextFormatter = (card) => {
  if ((card.upgradeLevel ?? 0) < 2) return null;
  return {
    description: '选择地城行的一张卡牌，与最左边的卡牌互换位置。',
    magicEffect: '永久魔法：选择地城行的一张卡牌，与最左边的卡牌互换位置。',
  };
};

const stunStrike: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const damages = [2, 4, 6];
  const stuns = [10, 20, 30];
  const dmg = damages[level] ?? 6;
  const stun = stuns[level] ?? 30;
  return {
    description: `对一个怪物造成 ${dmg} 点法术伤害，有 ${stun}% 概率击晕目标。`,
    magicEffect: `永久魔法：对一个怪物造成 ${dmg} 点伤害，${stun}% 击晕。`,
  };
};

const magicMissile: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const boltCounts = [2, 3, 4];
  const bc = boltCounts[level] ?? 4;
  return {
    description: `加入 ${bc} 张一次性「魔弹」到手牌（每张可对一个怪物造成 1 点法术伤害）。`,
    shortDescription: `手上加入 ${bc} 张「魔弹」`,
    magicEffect: `永久魔法：手上加入 ${bc} 张一次性「魔弹」。`,
  };
};

const loneCardAmulet: CardTextFormatter = () => ({
  description: '每次瀑流时（回收前），若背包卡牌数量为 1 或 2，获得一张职业专属牌。',
});

const attackPersuadeAmulet: CardTextFormatter = () => ({
  description: '每攻击一次，下次劝降费用 -5（可叠加）。',
});

const cardGainMissileAmulet: CardTextFormatter = () => ({
  description: '每从坟场获得一次牌（同时获得多张算一次），将两张「魔弹」加入手牌。',
});

// `_counterDisplay` is a separate field (current counter state, not text)
// and stays in the on-upgrade handler.
// Single source of truth: thresholds here MUST match `combat.ts` /
// `economy.ts` / `reducer.ts:computeAmuletCounterDisplay` / `GameBoard.tsx`
// counter-display branches (Lv 0 = 6, Lv 1+ = 4).
const damageClassDiscoverAmulet: CardTextFormatter = (card) => {
  const threshold = (card.upgradeLevel ?? 0) >= 1 ? 4 : 6;
  return {
    description: `每造成 ${threshold} 次伤害（武器、护符、法术等任意来源），发现一张专属牌。`,
    shortDescription: `每造成 ${threshold} 次伤害：发现 1 张专属`,
  };
};

const stunUpgradeCapAmulet: CardTextFormatter = () => ({
  description: '每击晕一次怪物，手牌加入 1 张 Instant magic「震慑符印」：选择一个怪物，以当前击晕上限的几率尝试击晕（手牌满则落到背包）。',
  shortDescription: '每击晕怪物 1 次：手牌 +1 张「震慑符印」',
});

// `_counterDisplay` stays in the on-upgrade handler.
const recycleBackpackExpandAmulet: CardTextFormatter = () => ({
  description: '每回收 6 张牌，背包上限 +3。',
});

const dungeonGoldAmulet: CardTextFormatter = () => ({
  description: '每处理 1 张地城牌，金币 +2。',
});

const recycleDrawMagic: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const recycleCounts = [1, 2, 3];
  const rc = recycleCounts[level] ?? 3;
  return {
    description: `使用：随机将回收袋的 ${rc} 张牌剩余瀑流 -1（就绪的牌进背包）。`,
    magicEffect: `永久魔法：使用：随机将回收袋的 ${rc} 张牌剩余瀑流 -1（就绪的牌进背包）。`,
    shortDescription: `随机 ${rc} 张回收袋牌瀑流 -1`,
  };
};

const dimensionWarp: CardTextFormatter = (card) => {
  if ((card.upgradeLevel ?? 0) < 2) return null;
  return {
    description: '将地城行的一张牌和它正上方预览行的牌互换，然后抽 1 张牌。',
    magicEffect: '永久魔法：选择一张地城行卡牌，与正上方预览行卡牌互换位置，然后抽 1 张牌。',
  };
};

const undyingBlessing: CardTextFormatter = () => ({
  description: '赋予装备复生能力，失去 2 点生命，然后抽 1 张牌。',
  magicEffect: '永久魔法：选择一个装备，赋予其复生，失去 2 点生命，然后抽 1 张牌。',
});

// 同款 trap：绝对不要 return `magicEffect`。赌徒之计 deck.ts 条目
// (`STARTER_CARD_IDS.gamblerGambit`) 故意不设 `magicEffect`，让
// `resolveEffectId` 走 `starter:starter-perm-gambler-gambit` → 命中
// card-schema/definitions/magic.ts 里的 `starterGamblerGambit` resolver。
// 如果这里 return `magicEffect: '永久魔法：…'`，`applyDerivedCardText` /
// `applyUpgrade` 会把这个长字符串塞进 `card.magicEffect`，让 `resolveEffectId`
// 短路到 `magic:永久魔法：…` —— 那个 effectId 没注册过，schema 引擎返回 null，
// legacy fallback 也已删除（见 magic-effects.ts 注释），整张卡变成 no-op：
// 不损血、不给金币、不抽牌。详细 trap 描述见下面 deckTopSwapGold formatter
// 注释块。
const gamblerGambit: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const golds = [1, 2, 4];
  const draws = [1, 1, 1];
  const g = golds[level] ?? 4;
  const d = draws[level] ?? 1;
  return {
    description: `失去 1 点生命，获得 ${g} 金币，从背包抽 ${d} 张牌。`,
    shortDescription: `-1 生命；+${g} 金币；抽 ${d} 张`,
  };
};

// 同类型奖励 L0 +10 / L1 +15。必须跟 hero.ts case 'deck-top-swap-gold' 里
// `sameCategoryBonuses = [10, 15]` 保持一致 —— 历史上文案被硬编码成 "+15"，
// L0 卡面显示 "+15" 但实际只 +10，玩家会觉得"金币给少了"。
//
// 关键：**绝对不要**在这里 return `magicEffect`。运势博弈的 deck.ts 条目
// (`STARTER_CARD_IDS.deckTopSwapGold`) 故意不设 `magicEffect`，让
// `resolveEffectId` 走 `starter:starter-perm-deck-top-swap-gold` → 命中
// card-schema/definitions/magic.ts 里的 `starterDeckTopSwapGold` resolver。
// 如果这里 return `magicEffect: '永久魔法：…'`，`applyDerivedCardText` 会把
// 这个长字符串塞进 `card.magicEffect`，让 `resolveEffectId` 短路到
// `magic:永久魔法：…` —— 那个 effectId 没注册过，schema 引擎返回 null，回退
// 到 `resolveAllMagicEffects`；而 deckTopSwapGold 在 legacy 那里也没 case，
// 一路掉到 `resolvePermanentMagic` 末尾的 "Fallback: generic permanent magic"
// 分支，**整张卡变成 no-op**：不交换、不抽牌、不给金币。同样的「不能写 magicEffect」
// 约束适用于 `flankSlotTempAttack`（锐意鼓舞）等所有走 starter-id 路径的 starter
// Perm 卡 —— 见 deck.ts 对应条目的注释。
const deckTopSwapGold: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const sameCategoryBonuses = [10, 15];
  const bonus = sameCategoryBonuses[level] ?? sameCategoryBonuses[sameCategoryBonuses.length - 1];
  return {
    description: `与牌堆顶交换一张当前行卡牌；同类型奖励 +${bonus} 金币，否则 -1 金币。然后抽 1 张牌。`,
    shortDescription: `与牌堆顶互换 1 张；同类 +${bonus} 金币；抽 1 张`,
  };
};

const healMagic: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  if (level === 1) {
    return {
      description: '一次性使用，立即回复 10 点生命。',
      magicEffect: '即时魔法：回复 10 点生命。',
      shortDescription: '+10 生命',
    };
  }
  if (level === 2) {
    return {
      description: '回复 3 点生命。',
      magicEffect: '永久魔法：回复 3 点生命。',
      shortDescription: '+3 生命',
    };
  }
  return null;
};

const classSummon: CardTextFormatter = () => ({
  description: '弃回 2 张牌，获得一张职业专属卡。',
  magicEffect: '永久魔法：弃回 2 张牌，获得一张职业专属卡。',
});

// 怀柔令 (knight:persuade-discount) — handler-less, covered by Phase 1.
// Magic resolver: costDiscount = 2 * (level + 1); rateBonus = 10 * (level + 1).
// Source: client/src/game-core/rules/magic-effects.ts case 'persuade-discount'.
const persuadeDiscount: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const costDiscount = 2 * (level + 1);
  const rateBonus = 10 * (level + 1);
  return {
    description: `一次性：劝降费用永久降低 ${costDiscount} 金币，下次劝降成功率 +${rateBonus}%。`,
    shortDescription: `劝降费用永久 -${costDiscount}；下次成功率 +${rateBonus}%`,
    magicEffect: `劝降费用永久 -${costDiscount}，下次成功率 +${rateBonus}%。`,
  };
};

// 紧急回收 (knight:recall-equipment, knight class card) —
// L0：失去 2 HP，回手 1 张，抽 1 张。
// L1：hpCost 收紧到 1，背包抽 2 张。
// L2：数值同 L1，且卡自身刻上「置顶」flag（由 OnUpgradeHandler 设
//     `topOnRecycleRestore: true`；卡面右下角自动渲染「置顶」角标，无需在描述
//     文案里重复——避免和别处的「置顶」卡（专属感召）说法不一致）。
//
// 注意：starter 版（回收术）共用同一 knightEffect，但 maxUpgradeLevel: 1，
// 走到不了 L2；它的 hpCost / draw 由 resolver 按 classCard + upgradeLevel
// 单独 gate，formatter 这里不需要为 starter 分支额外出力（starter 有自己的
// formatter 路由——starter:recallEquip）。
const knightRecallEquipment: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  if (level >= 1) {
    return {
      description: '永久：失去 1 点生命，回手一张牌，抽 2 张牌。',
      shortDescription: '失去 1 生命，回手 1 张，抽 2 张',
      magicEffect: '失去 1 HP，回手一张牌，抽 2 张牌。',
    };
  }
  return {
    description: '永久：失去 2 点生命，回手一张牌，抽 1 张牌。',
    shortDescription: '失去 2 生命，回手 1 张，抽 1 张',
    magicEffect: '失去 2 HP，回手一张牌，抽 1 张牌。',
  };
};

// 查阅动作 (starter:starter-perm-survey-action) — handler-less, covered by Phase 1.
// On-enter-hand resolver picks `[1, 2][upgradeLevel]` for the temp-attack buff.
// Source: client/src/game-core/card-schema/definitions/on-enter-hand.ts surveyActionOnHand.
const surveyAction: CardTextFormatter = (card) => {
  const buffByLevel = [1, 2];
  const bonus = pick(buffByLevel, card.upgradeLevel ?? 0);
  return {
    description: `从背包抽 1 张牌。\n上手：随机一个装备栏 临时攻击 +${bonus}。`,
    shortDescription: `抽 1 张；上手随机一栏 +${bonus} 临时攻`,
    magicEffect: '永久魔法：从背包抽 1 张牌。',
  };
};

// 锐意鼓舞 (starter:starter-perm-flank-slot-temp-attack) — handler-less, covered by Phase 1.
// Magic resolver picks `[3, 5][upgradeLevel]` for the slot temp-attack buff.
// Source: client/src/game-core/card-schema/definitions/magic.ts starterFlankSlotTempAttack.
const flankSlotTempAttack: CardTextFormatter = (card) => {
  const baseAmounts = [3, 5];
  const bonus = pick(baseAmounts, card.upgradeLevel ?? 0);
  return {
    description: `左装备栏 +${bonus} 临时攻击；侧击则改为右装备栏 +${bonus}。`,
    shortDescription: `左栏 +${bonus} 临时攻；侧击改右栏 +${bonus}`,
  };
};

// ============================================================================
// Amulet effects
// ============================================================================

// 怀柔之印 — base +10% / upgraded +20% (per `equipment.ts` `computeAmuletEffects`).
const persuadeOnTempAttack: CardTextFormatter = (card) => {
  const upgraded = (card.upgradeLevel ?? 0) >= 1;
  if (upgraded) {
    return {
      description: '（已升级）每获得一次临时攻击或临时护甲加成，下一次劝降率 +20%。',
      shortDescription: '（已升级）每获临时攻/护：下次劝降率 +20%',
    };
  }
  return {
    description: '每获得一次临时攻击或临时护甲加成，下一次劝降率 +10%。',
    shortDescription: '每次获得临时攻/护，下次劝降率 +10%',
  };
};

// 劝降归袋符 — base 1 card / upgraded 2 cards (per `equipment.ts` `computeAmuletEffects`).
const persuadeGrantRecycleFetch: CardTextFormatter = (card) => {
  const upgraded = (card.upgradeLevel ?? 0) >= 1;
  if (upgraded) {
    return {
      description: '（已升级）每劝降一次，将两张「归袋抽引」加入手牌（一次性：从回收袋随机 1 张牌加入手牌）。',
      shortDescription: '（已升级）每次劝降，入手 2 张「归袋抽引」',
    };
  }
  return {
    description: '每劝降一次，将一张「归袋抽引」加入手牌（一次性：从回收袋随机 1 张牌加入手牌）。',
    shortDescription: '每次劝降，入手 1 张「归袋抽引」',
  };
};

// ============================================================================
// Knight effects — magic / one-shots
// ============================================================================

const graveyardRecall: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const recallCounts = [3, 4, 5, 6];
  const cnt = recallCounts[level] ?? 6;
  return {
    description: `一次性：从坟场随机取回至多 ${cnt} 张牌加入背包（不能取回自己）。`,
    magicEffect: `坟场随机取回 ${cnt} 张牌。`,
  };
};

const monsterRecruit: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const recruitCounts = [2, 3];
  const n = pick(recruitCounts, level);
  const cntText = n === 2 ? '两' : n === 3 ? '三' : `${n}`;
  return {
    description: `一次性：从坟场随机获得${cntText}张怪物牌，加入手牌。`,
    shortDescription: `从坟场随机获得 ${n} 张怪物牌`,
    magicEffect: `从坟场随机获得${cntText}张怪物牌。`,
  };
};

const bloodGreed: CardTextFormatter = (card) => {
  if ((card.upgradeLevel ?? 0) < 1) return null;
  return {
    description: '一次性：获得等同当前已损失生命的金币，将"贪婪诅咒"放入背包，并开启商店。',
    magicEffect: '获得金币，生成贪婪诅咒，并开启商店。',
  };
};

const armorStrike: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const pcts = [100, 125, 150];
  const pct = pick(pcts, level);
  return {
    description: `永久：选择一件护甲装备，对目标怪物造成等同护甲值 ${pct}% 的伤害。`,
    shortDescription: `一件护甲值 ${pct}% 转化为伤害`,
    magicEffect: `护甲值 ${pct}% 转化为伤害。`,
  };
};

const armorDoubleStrike: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const pcts = [50, 75, 100];
  const pct = pick(pcts, level);
  return {
    description: `永久：选择一件护甲装备，对当前行所有怪物各造成 ${pct}% 护甲值的法术伤害，然后该装备耐久 -1。`,
    shortDescription: `${pct}% 护甲法伤全场；该装备耐久 -1`,
    magicEffect: `护甲值 ${pct}% 伤害全场，装备耐久 -1。`,
  };
};

const battleSpirit: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const amounts = [1, 2];
  const amt = amounts[level] ?? 2;
  return {
    description: `一次性：选择一个装备栏，本回合（持续到下次瀑流）该栏每英雄回合可多攻击 ${amt} 次，且每怪物回合格挡耐久上限 +${amt}。`,
    magicEffect: '选定装备栏激发战意。',
  };
};

const berserkGambit: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const extraPerSlotAmounts = [2, 3];
  const n = pick(extraPerSlotAmounts, level);
  const timesText = n === 1 ? '一次' : `${n} 次`;
  return {
    description: `一次性：生命降至 1，每个武器栏可多攻击${timesText}。`,
    shortDescription: `生命降至 1；每个武器栏多攻击${timesText}`,
    magicEffect: `降血换取每栏额外 ${n} 次攻击。`,
  };
};

const missingHpSmite: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const smitePcts = [50, 75, 100];
  const sp = pick(smitePcts, level);
  return {
    description: `永久：对一名怪物造成等同当前已损失生命值 ${sp}% 的伤害。`,
    magicEffect: `以失去生命 ${sp}% 为伤害。`,
  };
};

const recycleFlare: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const drawCounts = [1, 2, 3];
  const dc = drawCounts[level] ?? 3;
  return {
    description: `永久：回收袋洗回背包（所有牌剩余瀑流 -1），然后抽 ${dc} 张牌。(可超手牌上限)`,
    magicEffect: `回收袋归位并抽 ${dc} 张牌。`,
  };
};

const fateSight: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const persuadeBonuses = [70, 100];
  const bonus = persuadeBonuses[level] ?? 100;
  return {
    description: `永久：翻看主牌堆顶 4 张牌，如果其中没有怪物牌，则下次劝降成功率 +${bonus}%。`,
    shortDescription: `翻 4 张：无怪物 → 下次劝降率 +${bonus}%`,
    magicEffect: `透视牌堆顶 4 张，无怪物则下次劝降率 +${bonus}%。`,
  };
};

const bloodDraw: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const bloodDrawCounts = [3, 4, 5];
  const dc = bloodDrawCounts[level] ?? 5;
  return {
    description: `永久：失去 3 点生命，抽 ${dc} 张牌。`,
    magicEffect: `失去 3 HP，抽 ${dc} 张牌。`,
  };
};

const handPurgeRedraw: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const drawCounts = [3, 4, 5];
  const dc = drawCounts[level] ?? 5;
  return {
    description: `永久：弃回所有手牌（诅咒除外），然后从背包抽 ${dc} 张牌。`,
    shortDescription: `弃回所有手牌；从背包抽 ${dc} 张`,
    magicEffect: `弃回全部手牌，从背包抽 ${dc} 张。`,
  };
};

const handRecycleRedraw: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const ns = [1, 2];
  const n = pick(ns, level);
  return {
    description: `永久：将所有手牌（诅咒除外，共 X 张）洗入回收袋，然后从背包抽 X+${n} 张牌。`,
    shortDescription: `手牌入回收袋；从背包抽 X+${n}`,
    magicEffect: `永久魔法：手牌洗入回收袋（共 X 张），从背包抽 X+${n} 张。`,
  };
};

const missileStorm: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  if (level >= 1) {
    return {
      description: '将坟场中所有的「魔弹」向随机怪物发射。',
      shortDescription: '坟场每张「魔弹」对随机怪物 1 法伤',
      magicEffect: '即时魔法：坟场中每张「魔弹」对随机怪物造成 1 点法术伤害（依次发射）。',
    };
  }
  return {
    description: '将坟场中一半（向上取整）的「魔弹」向随机怪物发射。',
    shortDescription: '坟场一半「魔弹」对随机怪物 1 法伤',
    magicEffect: '即时魔法：坟场中一半（向上取整）的「魔弹」对随机怪物造成 1 点法术伤害（依次发射）。',
  };
};

const graveNova: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  if (level >= 2) {
    return {
      description: '永久：当此牌被弃置时，对当前行所有怪物造成 3 点伤害 ×2 次（每次独立结算）。',
      shortDescription: '弃置时对当前行所有怪物 3 伤 ×2',
      magicEffect: '被弃置时造成 3 点爆炸伤害 ×2 次。',
    };
  }
  const novaDmgs = [3, 5];
  const nd = novaDmgs[level] ?? 5;
  return {
    description: `永久：当此牌被弃置时，对当前行所有怪物造成 ${nd} 点伤害。`,
    shortDescription: `弃置时对当前行所有怪物 ${nd} 伤`,
    magicEffect: `被弃置时造成 ${nd} 点爆炸伤害。`,
  };
};

const overkillUpgrade: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const damages = [3, 5, 5];
  const counts = [1, 1, 2];
  const dmg = pick(damages, level);
  const cnt = pick(counts, level);
  const cntText = cnt === 1 ? '一张牌' : `${cnt} 张牌`;
  return {
    description: `永久：对一个怪物造成 ${dmg} 点伤害。超杀：升级${cntText}。`,
    shortDescription: `${dmg} 点伤害；超杀升级 ${cnt} 张牌`,
    magicEffect: `造成 ${dmg} 点伤害，超杀升级${cntText}。`,
  };
};

// 锋刃侧击 (knight:temp-attack-strike) — handler still sets `flankEffect` (a
// non-text descriptor field rendered separately).
const tempAttackStrike: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const stunPcts = [20, 40, 60];
  const pct = pick(stunPcts, level);
  return {
    description: `永久：选择一个装备栏，对一个随机怪物造成（该装备栏永久攻击 + 临时攻击）的伤害。侧击：${pct}% 击晕。`,
    shortDescription: `该栏永久攻击+临时攻击作伤害；侧击 ${pct}% 击晕`,
    magicEffect: `永久攻击+临时攻击转化为伤害，侧击 ${pct}% 击晕。`,
  };
};

const eternalVessel: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const hpBoosts = [3, 4, 5];
  const boost = pick(hpBoosts, level);
  return {
    description: `永久：失去 3 生命，生命上限永久 +${boost}。`,
    shortDescription: `失去 3 生命，生命上限永久 +${boost}`,
    magicEffect: `永久魔法：失去 3 生命，生命上限永久 +${boost}。`,
  };
};

const flipBackActive: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const healAmounts = [1, 2, 3];
  const heal = pick(healAmounts, level);
  return {
    description: `永久：失去 3 生命，选择当前行一张「已翻转」卡牌，将其翻回原始形态。\n上手：恢复 ${heal} 生命。`,
    shortDescription: `失去 3 生命，翻回 1 张已翻转卡；上手 +${heal} 生命`,
    magicEffect: `将一张已翻转的牌翻回去；上手 +${heal} 生命。`,
  };
};

const threeCardThunder: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const onHandDamages = [1, 2, 3];
  const dmg = pick(onHandDamages, level);
  return {
    description: `永久：若背包正好有 3 张牌，对所有怪物造成 9 点法术伤害。\n上手：对所有怪物各造成 ${dmg} 点法术伤害。`,
    shortDescription: `背包恰 3 张时全场 9 法伤；上手全场 ${dmg} 法伤`,
    magicEffect: `背包恰好 3 张时全场 9 点法伤；上手全场 ${dmg} 点法伤。`,
  };
};

const reorganizeBackpack: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const capacityBonuses = [2, 2];
  const cap = pick(capacityBonuses, level);
  return {
    description: `永久：背包上限 +${cap}，然后从手牌、护符栏或装备栏中选择至多 3 张牌放回背包顶部。装备/护符不会触发任何破损或转化效果。`,
    shortDescription: `背包+${cap}；至多 3 张牌放回背包顶部`,
    magicEffect: `背包上限 +${cap}；选至多 3 张牌放回背包顶部。`,
  };
};

const armorStunConvert: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const stunPerArmor = [1, 1.5];
  const sp = stunPerArmor[level] ?? 1.5;
  return {
    description: `永久：选择一个护盾，每 1 点护甲值使击晕上限 +${sp}%（最终值四舍五入）。`,
    shortDescription: `所选护盾每 1 护甲，击晕上限 +${sp}%`,
    magicEffect: `护甲转化为击晕上限（每点 +${sp}%）。`,
  };
};

const stunCapStrike: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const divisors = [4, 3];
  const div = divisors[level] ?? 3;
  return {
    description: `永久：对一个怪物造成 ⌈击晕上限/${div}⌉ 点法术伤害，60% 击晕（受击晕上限约束），然后抽 1 张牌。`,
    shortDescription: `⌈晕上限/${div}⌉ 法伤；60% 晕；抽 1`,
    magicEffect: `电涌：晕上限 1/${div} 法伤 + 60% 晕 + 抽 1。`,
  };
};

const backpackBolt: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const pcts = [50, 75, 100];
  const pct = pcts[level] ?? pcts[pcts.length - 1];
  return {
    description: `永久：对一个目标造成等同于背包剩余卡牌数 ${pct}% 的法术伤害（向下取整）。每造成 3 点伤害额外抽 1 张牌。`,
    shortDescription: `背包数 × ${pct}% 法伤；每 3 伤害抽 1`,
    magicEffect: `永久魔法：选择一个目标，造成背包数 × ${pct}% 法伤；每 3 伤害抽 1 张牌。`,
  };
};

const recycleBolt: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const pcts = [100, 125, 150];
  const pct = pcts[level] ?? pcts[pcts.length - 1];
  return {
    description: `永久：对一个目标造成等同于回收袋卡牌数 ${pct}% 的法术伤害（向下取整）。`,
    shortDescription: `回收袋数 × ${pct}% 法伤`,
    magicEffect: `永久魔法：选择一个目标，造成回收袋数 × ${pct}% 法伤。`,
  };
};

// 囊量震慑：升级表 [3, 2]（divisor）。Lv0 ÷3，Lv1 ÷2。
// 卡面写"背包上限 / X"——上限是 BASE (12) + modifier，玩家肉眼可见的就是背包格子数。
const backpackCapStun: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const divisors = [3, 2];
  const div = pick(divisors, level);
  return {
    description: `永久：击晕上限增加 floor(背包上限 / ${div})%。`,
    shortDescription: `击晕上限 +背包上限÷${div} %`,
    magicEffect: `永久魔法：击晕上限 +背包上限÷${div} %。`,
  };
};

// 囊中生机：升级表 [4, 3]（divisor）。Lv0 ÷4，Lv1 ÷3。
// 跟 囊量震慑 同语义——「背包上限」= BASE (12) + modifier，不是当前剩余数。
const backpackCapHeal: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const divisors = [4, 3];
  const div = pick(divisors, level);
  return {
    description: `永久：恢复 floor(背包上限 / ${div}) 点生命。`,
    shortDescription: `恢复 背包上限÷${div} 生命`,
    magicEffect: `永久魔法：恢复 背包上限÷${div} 点生命。`,
  };
};

const layMine: CardTextFormatter = (card) => {
  // 布雷术：lvl 0 PERM 2、lvl 1 PERM 1。卡面文案不随升级变化（机制相同），
  // 但 description 不主动写"PERM N"，让 GameCard 渲染层根据 recycleDelay 自动
  // 显示永久标识；这里只描述效果。
  const level = card.upgradeLevel ?? 0;
  void level; // 仅保留 signature，效果文本不随等级变化
  return {
    description: '永久：在激活行的随机空格生成一个「地雷」（幽灵建筑）。当怪物落到该格时，地雷对该怪物造成 5 点纯伤害后进坟场。',
    shortDescription: '随机空格生成地雷：怪物落入受 5 点纯伤',
    magicEffect: '永久魔法：随机空格生成地雷，怪物落入受 5 点纯伤。',
  };
};

const tempAttackArmorDraw: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const amounts = [2, 4, 6];
  const n = amounts[level] ?? 6;
  return {
    description: `永久：选择一个装备栏，+${n} 临时攻击 +${n} 临时护甲，抽 1 张牌。`,
    shortDescription: `所选栏 +${n} 临攻 +${n} 临护；抽 1`,
    magicEffect: `永久魔法：选择一个装备栏，+${n} 临时攻击 +${n} 临时护甲，抽 1 张牌。`,
  };
};

const tempAttackDouble: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const addAmounts = [1, 2];
  const n = pick(addAmounts, level);
  return {
    description: `永久：选择一个装备栏，临时攻击 +${n}，然后该栏临时攻击翻倍。`,
    shortDescription: `该栏临时攻击 +${n} 后翻倍`,
    magicEffect: `临时攻击 +${n} 后翻倍。`,
  };
};

// 囊中锋意：升级表 [3, 2]（divisor）。Lv0 每 3 张牌 +2，Lv1 每 2 张牌 +2。
const backpackTempAttack: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const divisors = [3, 2];
  const div = pick(divisors, level);
  return {
    description: `永久：选择一个装备栏，背包每 ${div} 张牌 +2 临时攻击。`,
    shortDescription: `所选栏 +背包数÷${div}×2 临时攻击`,
    magicEffect: `永久魔法：选择一个装备栏，背包每 ${div} 张牌 +2 临时攻击。`,
  };
};

// 池中坚意：升级表 [3, 2]（divisor）。Lv0 每 3 张牌 +1，Lv1 每 2 张牌 +1。
// 注：effect id `knight:recycle-temp-armor` 是历史命名，语义已改为永久护甲。
const recycleTempArmor: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const divisors = [3, 2];
  const div = pick(divisors, level);
  return {
    description: `永久：选择一个装备栏，回收袋每 ${div} 张牌 +1 永久护甲。`,
    shortDescription: `所选栏 +回收袋数÷${div} 永久护甲`,
    magicEffect: `永久魔法：选择一个装备栏，回收袋每 ${div} 张牌 +1 永久护甲。`,
  };
};

const amplifyEquipmentShift: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const amplifyAmounts = [1, 2];
  const n = pick(amplifyAmounts, level);
  const timesText = n === 1 ? '一次' : `${n} 次`;
  return {
    description: `永久：选择一个装备栏的装备进行增幅${timesText}（同名卡 +${n}）。若另一装备栏为空，将其换到空位。`,
    shortDescription: `所选装备增幅 +${n}；空栏则换位`,
    magicEffect: `永久魔法：所选装备栏的装备 +${n} 增幅（按卡名累计），若另一栏为空则换到空位。`,
  };
};

const essenceExtract: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const damageBonusByLevel = [1, 1, 2];
  const shieldBonusByLevel = [1, 2, 2];
  const dmg = pick(damageBonusByLevel, level);
  const shd = pick(shieldBonusByLevel, level);
  return {
    description: `删除一张手牌（送入坟场）。一次性魔法→左栏攻击+${dmg}；装备→右栏攻击+${dmg}；护符→右栏护甲+${shd}；怪物/药水→左栏护甲+${shd}。`,
    shortDescription: `删一张手牌；魔/装+${dmg} 攻；护/怪/药+${shd} 护`,
    magicEffect: `永久魔法：删除一张手牌（送入坟场）：魔法/装备 → 攻击+${dmg}；护符/怪物/药水 → 护甲+${shd}。`,
  };
};

// ============================================================================
// Knight effects — equipment (weapons / shields)
// ============================================================================

// Handler still sets `onEquipEffect` and `healOnAttack`.
const holyBlade: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const onEquipHeals = [3, 4, 5];
  const healPerAttacks = [2, 3, 4];
  const onEquipHeal = onEquipHeals[level] ?? 5;
  const healPerAttack = healPerAttacks[level] ?? 4;
  return {
    description: `入场：恢复 ${onEquipHeal} 点生命。每次攻击时恢复 ${healPerAttack} 点生命。`,
    shortDescription: `入场+${onEquipHeal}生命；攻击+${healPerAttack}生命`,
  };
};

// Handler still sets `onEquipEffect`.
const swiftDagger: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const amounts = [2, 4, 6];
  const n = amounts[level] ?? 6;
  return {
    description: `入场：所有装备栏临时攻击 +${n}。用此武器杀死怪物时耐久度回满。`,
    shortDescription: `入场全栏 +${n} 临时攻；杀怪回满耐久`,
  };
};

// 引雷阵锋 (knight:thunder-array-blade)：
//   description / shortDescription 描述「每耐久 +N 全场地雷伤害」中的 N。
//   handler 已经把 mineDamageBoostPerDur / maxDurability / durability 同步好。
const thunderArrayBlade: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const boosts = [2, 2, 3];
  const n = boosts[level] ?? boosts[boosts.length - 1];
  return {
    description: `每消耗 1 点耐久，全场地雷伤害永久 +${n}（不撤销）。`,
    shortDescription: `耐久 -1：全场地雷伤害永久 +${n}`,
  };
};

// Handler still sets `onDestroyEffect` and `hasEquipmentRevive`.
const thunderGuardShield: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const stunAmounts = [8, 10, 10];
  const reviveFlags = [false, false, true];
  const stunAmount = pick(stunAmounts, level);
  const revive = pick(reviveFlags, level);
  if (revive) {
    return {
      description: `复生（首次摧毁恢复 1 耐久）。遗言：击晕上限 +${stunAmount}%（封顶 100%）。`,
      shortDescription: `复生 1 次；遗言：击晕上限 +${stunAmount}%`,
    };
  }
  return {
    description: `遗言：击晕上限 +${stunAmount}%（封顶 100%）。`,
    shortDescription: `遗言：击晕上限 +${stunAmount}%`,
  };
};

// Handler still sets `onDestroyEffect`.
const communalDefenseShield: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const tempArmorAmounts = [4, 4, 7];
  const tempArmorAmount = pick(tempArmorAmounts, level);
  return {
    description: `复生（首次摧毁恢复 1 耐久）。遗言：所有装备栏 +${tempArmorAmount} 临时护甲。`,
    shortDescription: `复生 1 次；遗言：全栏 +${tempArmorAmount} 临时护甲`,
  };
};

// Handler still sets `onEquipEffect` ('draw-N') and `onDestroyDraw`.
const scholarShield: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const drawCounts = [2, 3];
  const draw = pick(drawCounts, level);
  return {
    description: `入场：从背包抽 ${draw} 张牌。遗言：从背包抽 ${draw} 张牌。`,
    shortDescription: `入场抽 ${draw} 张；遗言抽 ${draw} 张`,
  };
};

// Handler still sets `drawOnAttack` (and applyMaxDurabilityDelta on durability).
// L0/L1 抽 2，L2 抽 3；耐久 L0:3 → L1:4 → L2:4 由 handler 处理，描述里不重复打数字。
const scholarBlade: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const drawCounts = [2, 2, 3];
  const draw = pick(drawCounts, level);
  return {
    description: `每次攻击：从背包抽 ${draw} 张牌。`,
    shortDescription: `每次攻击抽 ${draw} 张`,
  };
};

// Handler still sets `perfectBlockSpawnMissiles`.
const barrageShield: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const missileCounts = [2, 2, 3];
  const missileCount = pick(missileCounts, level);
  const missileText =
    missileCount === 1 ? '一张' : missileCount === 2 ? '2 张' : missileCount === 3 ? '3 张' : `${missileCount} 张`;
  return {
    description: `完美格挡时，将 ${missileText}「魔弹」加入手牌（手牌已满则静默丢弃多余的）。`,
    shortDescription: `完美格挡 → ${missileText}「魔弹」入手牌`,
  };
};

// Handler still sets `amplifyOnFlipAmount` and `onDestroyEventCount`.
const growthShield: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const flipAmounts = [1, 2, 2];
  const eventCounts = [1, 1, 3];
  const flipAmount = pick(flipAmounts, level);
  const eventCount = pick(eventCounts, level);
  const flipText = flipAmount === 1 ? '一次' : flipAmount === 2 ? '两次' : `${flipAmount} 次`;
  const armorText = `+${flipAmount} 护甲与护甲上限`;
  const eventText =
    eventCount === 1 ? '一张' : eventCount === 2 ? '两张' : eventCount === 3 ? '三张' : `${eventCount} 张`;
  return {
    description: `装备时：每发生一次卡牌翻转，该护盾增幅${flipText}（按卡名累计 ${armorText}；所有同名「生长之盾」共享）。遗言：从坟场随机抽出${eventText} Event 加入手牌。`,
    shortDescription: `每次卡牌翻转 ${armorText}；遗言：随机入手 ${eventCount} 张坟场 Event`,
  };
};

// Handler still sets `equipBlockDurabilityBonus`.
const enduranceShield: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const blockBonuses = [1, 1, 2];
  const blockBonus = pick(blockBonuses, level);
  const maxConsume = 1 + blockBonus;
  return {
    description: `该护盾每回合可消耗的耐久上限 +${blockBonus}（怪物回合最多消耗 ${maxConsume} 耐久）。怪物攻击该护盾后死亡时，耐久度恢复 1。`,
    shortDescription: `每回合格挡耐久上限 +${blockBonus}；怪物死亡时回 1 耐久`,
  };
};

// Handler still sets `shieldBashStunRate`.
const shieldBash: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const rates = [5, 7, 10];
  const rate = pick(rates, level);
  return {
    description: `可拖动到怪物上猛击（不造成伤害），${rate}%×护甲值 概率击晕。每回合不限次数，有耐久即可使用。`,
    shortDescription: `猛击：${rate}%×护甲 概率击晕；每回合不限次数`,
  };
};

// Handler still sets `shieldPerfectBlockArmorSaveChance`.
const guardianShield: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const saveChances = [50, 50, 60];
  const chance = saveChances[level] ?? 60;
  return {
    description: `完美格挡时（攻击≤护甲值），${chance}% 概率本次格挡不消耗护甲值（掷骰判定）。`,
    shortDescription: `完美格挡时 ${chance}% 不耗护甲值`,
  };
};

// Handler still sets `reflectHalfDamage` / `reflectFullDamage`.
const thornedShield: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  if (level >= 2) {
    return {
      description: '格挡时反弹全部的攻击伤害给攻击者，并加上该装备栏的永久攻击和临时攻击。',
      shortDescription: '格挡时反弹全部伤害+本栏攻击',
    };
  }
  return {
    description: '格挡时反弹一半的攻击伤害给攻击者（向上取整），并加上该装备栏的永久攻击和临时攻击。',
    shortDescription: '格挡时反弹一半伤害+本栏攻击',
  };
};

// Handler still sets `shieldExtraBlocksPerDurability` and `_shieldDurabilityBlockCounter`.
const fullBlockShield: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const extraBlocks = [0, 0, 1];
  const extra = extraBlocks[level] ?? 1;
  const blockCount = 1 + extra;
  const blockText = blockCount === 1 ? '一次' : blockCount === 2 ? '两次' : `${blockCount} 次`;
  return {
    description: `完全格挡${blockText}攻击的全部伤害，无论攻击力多高。损毁后进入回收袋。`,
    shortDescription: `完全格挡${blockText}攻击的全部伤害`,
  };
};

// Handler still sets `onAttackAmplifyMissileGenerateCount` (and value via delta helper).
const magicMissileCrossbow: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const boltCounts = [1, 1, 2];
  const boltCount = boltCounts[level] ?? 2;
  const boltText = boltCount === 1 ? '一张' : boltCount === 2 ? '两张' : `${boltCount} 张`;
  return {
    description: `超杀：所有「魔弹」获得 +1 增幅，并将${boltText}同步增幅的「魔弹」加入背包。`,
    shortDescription: `超杀：所有魔弹 +1 增幅；背包 +${boltCount} 张魔弹`,
  };
};

// Handler still sets `onEnterHandEffect` (and durability delta).
const growthBlade: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const amplifyTexts = ['一次（攻击 +1', '一次（攻击 +1', '两次（攻击 +2'];
  const text = amplifyTexts[level] ?? '两次（攻击 +2';
  return {
    description: `上手：该武器增幅${text}，按卡名累计；所有同名「生长之刃」共享）。`,
    shortDescription: level >= 2 ? '上手 +2 攻击（按卡名累计）' : '上手 +1 攻击（按卡名累计）',
  };
};

// Handler still sets `onAttackBuffOtherSlotTempAttack`.
const resonanceBlade: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const tempAttacks = [2, 2, 4];
  const tempAttack = tempAttacks[level] ?? 4;
  return {
    description: `每次攻击时，给另一个装备栏 +${tempAttack} 临时攻击，并恢复其装备 1 点耐久。`,
    shortDescription: `每次攻击：另一栏 +${tempAttack} 临时攻 +1 耐久`,
  };
};

// Handler still sets `weaponExtraAttack` and `onAttackDebuffAllMonsterAttack`.
const rageCleave: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const extraAttacks = [1, 1, 2];
  const debuffs = [2, 3, 3];
  const extra = extraAttacks[level] ?? 2;
  const debuff = debuffs[level] ?? 3;
  const totalAttacks = 1 + extra;
  return {
    description: `该武器每回合可攻击 ${totalAttacks} 次（攻击次数 +${extra}）。每次攻击时，所有怪物攻击力 -${debuff}。`,
    shortDescription: `每回合攻击 ${totalAttacks} 次；每次攻击全场怪物 -${debuff} 攻`,
  };
};

// Handler still sets `onEquipEffect` and `onDestroyPermanentShield`.
const exchangeBlade: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const equipDmgs = [1, 1, 2];
  const destroyShields = [1, 2, 2];
  const equipDmg = equipDmgs[level] ?? 2;
  const destroyShield = destroyShields[level] ?? 2;
  return {
    description: `入场：该装备栏永久攻击 +${equipDmg}。遗言：该装备栏永久护甲 +${destroyShield}。`,
    shortDescription: `入场本栏永久 +${equipDmg} 攻；遗言本栏永久 +${destroyShield} 护`,
  };
};

// Handler still sets `onEquipEffect` (and value/durability via delta helpers).
const thunderStunHammer: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const stunCaps = [5, 5, 10];
  const stunCap = stunCaps[level] ?? 10;
  return {
    description: `入场：击晕上限 +${stunCap}%。击晕率60%。攻击击晕的怪物时造成双倍伤害（先判定击晕，本次击晕也会触发翻倍）。`,
    shortDescription: `入场击晕上限 +${stunCap}%；击晕率 60%；击晕怪物伤害翻倍（含本次击晕）`,
  };
};

// Handler still sets `persuadeBoostOnHit`.
const persuadeHammer: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const boosts = [20, 30];
  const n = boosts[level] ?? 30;
  return {
    description: `每次攻击一次，下次劝降成功概率 +${n}%。`,
    shortDescription: `每次攻击下次劝降率 +${n}%`,
  };
};

// Handler still sets `onDestroyPermanentDamage`.
const reviveBoneShield: CardTextFormatter = (card) => {
  const level = card.upgradeLevel ?? 0;
  const damages = [1, 2];
  const damage = damages[level] ?? 2;
  return {
    description: `复生（首次摧毁恢复 1 耐久）。遗言：该装备栏永久伤害 +${damage}。`,
    shortDescription: `复生 1 次；遗言：本栏永久 +${damage} 伤害`,
  };
};

// ============================================================================
// Registration
// ============================================================================

const entries: Array<{ id: string; fn: CardTextFormatter }> = [
  // Starters
  { id: `starter:${STARTER_CARD_IDS.weaponBurst}`, fn: weaponBurst },
  { id: `starter:${STARTER_CARD_IDS.repairOne}`, fn: repairOne },
  { id: `starter:${STARTER_CARD_IDS.discardDraw}`, fn: discardDraw },
  { id: `starter:${STARTER_CARD_IDS.tempArmor}`, fn: tempArmor },
  { id: `starter:${STARTER_CARD_IDS.activeRowFlip}`, fn: activeRowFlip },
  { id: `starter:${STARTER_CARD_IDS.recallEquip}`, fn: recallEquip },
  { id: `starter:${STARTER_CARD_IDS.dungeonSwap}`, fn: dungeonSwap },
  { id: `starter:${STARTER_CARD_IDS.stunStrike}`, fn: stunStrike },
  { id: `starter:${STARTER_CARD_IDS.magicMissile}`, fn: magicMissile },
  { id: `starter:${STARTER_CARD_IDS.loneCardAmulet}`, fn: loneCardAmulet },
  { id: `starter:${STARTER_CARD_IDS.attackPersuadeAmulet}`, fn: attackPersuadeAmulet },
  { id: `starter:${STARTER_CARD_IDS.cardGainMissileAmulet}`, fn: cardGainMissileAmulet },
  { id: `starter:${STARTER_CARD_IDS.damageClassDiscoverAmulet}`, fn: damageClassDiscoverAmulet },
  { id: `starter:${STARTER_CARD_IDS.stunUpgradeCapAmulet}`, fn: stunUpgradeCapAmulet },
  { id: `starter:${STARTER_CARD_IDS.recycleBackpackExpandAmulet}`, fn: recycleBackpackExpandAmulet },
  { id: `starter:${STARTER_CARD_IDS.dungeonGoldAmulet}`, fn: dungeonGoldAmulet },
  { id: `starter:${STARTER_CARD_IDS.recycleDrawMagic}`, fn: recycleDrawMagic },
  { id: `starter:${STARTER_CARD_IDS.dimensionWarp}`, fn: dimensionWarp },
  { id: `starter:${STARTER_CARD_IDS.undyingBlessing}`, fn: undyingBlessing },
  { id: `starter:${STARTER_CARD_IDS.gamblerGambit}`, fn: gamblerGambit },
  { id: `starter:${STARTER_CARD_IDS.deckTopSwapGold}`, fn: deckTopSwapGold },
  { id: `starter:${STARTER_CARD_IDS.healMagic}`, fn: healMagic },
  { id: `starter:${STARTER_CARD_IDS.classSummon}`, fn: classSummon },
  { id: `starter:${STARTER_CARD_IDS.surveyAction}`, fn: surveyAction },
  { id: `starter:${STARTER_CARD_IDS.flankSlotTempAttack}`, fn: flankSlotTempAttack },

  // Amulet effects
  { id: 'amulet:persuade-on-temp-attack', fn: persuadeOnTempAttack },
  { id: 'amulet:persuade-grant-recycle-fetch', fn: persuadeGrantRecycleFetch },

  // Knight magic / one-shots
  { id: 'knight:persuade-discount', fn: persuadeDiscount },
  { id: 'knight:recall-equipment', fn: knightRecallEquipment },
  { id: 'knight:graveyard-recall', fn: graveyardRecall },
  { id: 'knight:monster-recruit', fn: monsterRecruit },
  { id: 'knight:blood-greed', fn: bloodGreed },
  { id: 'knight:armor-strike', fn: armorStrike },
  { id: 'knight:armor-double-strike', fn: armorDoubleStrike },
  { id: 'knight:battle-spirit', fn: battleSpirit },
  { id: 'knight:berserk-gambit', fn: berserkGambit },
  { id: 'knight:missing-hp-smite', fn: missingHpSmite },
  { id: 'knight:recycle-flare', fn: recycleFlare },
  { id: 'knight:fate-sight', fn: fateSight },
  { id: 'knight:blood-draw', fn: bloodDraw },
  { id: 'knight:hand-purge-redraw', fn: handPurgeRedraw },
  { id: 'knight:hand-recycle-redraw', fn: handRecycleRedraw },
  { id: 'knight:missile-storm', fn: missileStorm },
  { id: 'knight:grave-nova', fn: graveNova },
  { id: 'knight:overkill-upgrade', fn: overkillUpgrade },
  { id: 'knight:temp-attack-strike', fn: tempAttackStrike },
  { id: 'knight:eternal-vessel', fn: eternalVessel },
  { id: 'knight:flip-back-active', fn: flipBackActive },
  { id: 'knight:three-card-thunder', fn: threeCardThunder },
  { id: 'knight:reorganize-backpack', fn: reorganizeBackpack },
  { id: 'knight:armor-stun-convert', fn: armorStunConvert },
  { id: 'knight:stun-cap-strike', fn: stunCapStrike },
  { id: 'knight:backpack-bolt', fn: backpackBolt },
  { id: 'knight:recycle-bolt', fn: recycleBolt },
  { id: 'knight:backpack-cap-stun', fn: backpackCapStun },
  { id: 'knight:backpack-cap-heal', fn: backpackCapHeal },
  { id: 'knight:lay-mine', fn: layMine },
  { id: 'knight:temp-attack-armor-draw', fn: tempAttackArmorDraw },
  { id: 'knight:temp-attack-double', fn: tempAttackDouble },
  { id: 'knight:backpack-temp-attack', fn: backpackTempAttack },
  { id: 'knight:recycle-temp-armor', fn: recycleTempArmor },
  { id: 'knight:amplify-equipment-shift', fn: amplifyEquipmentShift },
  { id: 'knight:essence-extract', fn: essenceExtract },

  // Knight equipment
  { id: 'knight:holy-blade', fn: holyBlade },
  { id: 'knight:swift-dagger', fn: swiftDagger },
  { id: 'knight:thunder-array-blade', fn: thunderArrayBlade },
  { id: 'knight:thunder-guard-shield', fn: thunderGuardShield },
  { id: 'knight:communal-defense-shield', fn: communalDefenseShield },
  { id: 'knight:scholar-shield', fn: scholarShield },
  { id: 'knight:scholar-blade', fn: scholarBlade },
  { id: 'knight:barrage-shield', fn: barrageShield },
  { id: 'knight:growth-shield', fn: growthShield },
  { id: 'knight:endurance-shield', fn: enduranceShield },
  { id: 'knight:shield-bash', fn: shieldBash },
  { id: 'knight:guardian-shield', fn: guardianShield },
  { id: 'knight:thorned-shield', fn: thornedShield },
  { id: 'knight:fullBlock', fn: fullBlockShield },
  { id: 'knight:magic-missile-crossbow', fn: magicMissileCrossbow },
  { id: 'knight:growth-blade', fn: growthBlade },
  { id: 'knight:resonance-blade', fn: resonanceBlade },
  { id: 'knight:rage-cleave', fn: rageCleave },
  { id: 'knight:exchange-blade', fn: exchangeBlade },
  { id: 'knight:thunder-stun-hammer', fn: thunderStunHammer },
  { id: 'knight:persuade-hammer', fn: persuadeHammer },
  { id: 'knight:revive-bone-shield', fn: reviveBoneShield },
];

registerCardTextAll(entries);

// Export for tests / introspection.
export type { CardText };
