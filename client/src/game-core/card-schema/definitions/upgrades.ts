/**
 * On-Upgrade Effect Definitions
 *
 * Registers all per-card upgrade behaviors for the UPGRADE_CARD action.
 *
 * Resolution priority (see `resolveUpgradeEffectId`):
 *   monster → 'monster:default'
 *   starter → 'starter:{starterBaseId}'
 *   amulet  → 'amulet:{amuletEffect}'
 *   knight  → 'knight:{knightEffect}'
 *
 * Handlers receive a mutable `upgraded` copy whose `upgradeLevel` is
 * already set to `newLevel`; mutate fields in place.
 */

import { registerOnUpgradeAll } from '../on-upgrade';
import type { OnUpgradeHandler } from '../on-upgrade';
import { applyMonsterUpgradeLevel } from '@/lib/monsterRage';
import { STARTER_CARD_IDS } from '../../deck';

// ============================================================================
// Monster (default — applies to all monster cards)
// ============================================================================

const monsterDefault: OnUpgradeHandler = (upgraded, newLevel) => {
  const result = applyMonsterUpgradeLevel(upgraded, newLevel);
  Object.assign(upgraded, result);
  if (upgraded.maxDurability != null) {
    upgraded.maxDurability = upgraded.maxDurability + 1;
    upgraded.durability = (upgraded.durability ?? 0) + 1;
  }
};

// ============================================================================
// Starter cards
// ============================================================================

const weaponBurst: OnUpgradeHandler = (upgraded, newLevel) => {
  const burstVal = 2 + 2 * newLevel;
  upgraded.description = `选择一个装备栏，临时攻击力 +${burstVal}（瀑流后重置）。`;
  upgraded.magicEffect = `永久魔法：选择一个装备栏，临时攻击力 +${burstVal}。`;
};

const repairOne: OnUpgradeHandler = (upgraded, newLevel) => {
  const hpCosts = [2, 1, 1];
  const repairAmounts = [1, 2, 2];
  const hpCost = hpCosts[newLevel] ?? 1;
  const repair = repairAmounts[newLevel] ?? 2;
  const hpPart = hpCost > 0 ? `失去 ${hpCost} 点生命，` : '';
  const drawPart = newLevel >= 2 ? '，抽 1 张牌' : '';
  upgraded.description = `${hpPart}选择一个装备恢复 ${repair} 点耐久${drawPart}。`;
  upgraded.magicEffect = `永久魔法：${hpPart}选择一个装备恢复 ${repair} 点耐久${drawPart}。`;
};

const discardDraw: OnUpgradeHandler = (upgraded, newLevel) => {
  const discards = [1, 2, 3];
  const draws = [2, 3, 4];
  const d = discards[newLevel] ?? 1;
  const dr = draws[newLevel] ?? 1;
  upgraded.description = `将 ${d} 张手牌移到回收袋，从背包抽取 ${dr} 张新牌。`;
  upgraded.magicEffect = `永久魔法：将 ${d} 张手牌移到回收袋，从背包抽 ${dr} 张牌。`;
};

const reshuffle: OnUpgradeHandler = (upgraded, newLevel) => {
  const delays = [3, 2, 1];
  upgraded.recycleDelay = delays[newLevel] ?? 1;
};

const tempArmor: OnUpgradeHandler = (upgraded, newLevel) => {
  const taAmounts = [2, 3, 4];
  const ta = taAmounts[newLevel] ?? 4;
  upgraded.description = `选择一个装备栏，+${ta} 临时护甲。`;
  upgraded.magicEffect = `永久魔法：选择一个装备栏，+${ta} 临时护甲。`;
};

const dungeonSwap: OnUpgradeHandler = (upgraded, newLevel) => {
  if (newLevel === 1) {
    upgraded.recycleDelay = 1;
  } else if (newLevel === 2) {
    upgraded.description = '选择地城行的一张卡牌，与最左边的卡牌互换位置。';
    upgraded.magicEffect = '永久魔法：选择地城行的一张卡牌，与最左边的卡牌互换位置。';
  }
};

const trainingBlade: OnUpgradeHandler = (upgraded, newLevel) => {
  if (newLevel === 1) {
    upgraded.value = 4;
    upgraded.durability = Math.min((upgraded.durability ?? 2) + 1, 3);
    upgraded.maxDurability = 3;
  } else if (newLevel === 2) {
    upgraded.value = 5;
    upgraded.durability = Math.min((upgraded.durability ?? 3) + 1, 4);
    upgraded.maxDurability = 4;
  }
};

const stunStrike: OnUpgradeHandler = (upgraded, newLevel) => {
  const damages = [2, 4, 6];
  const stuns = [10, 20, 30];
  const dmg = damages[newLevel] ?? 6;
  const stun = stuns[newLevel] ?? 30;
  upgraded.description = `对一个怪物造成 ${dmg} 点法术伤害，有 ${stun}% 概率击晕目标。`;
  upgraded.magicEffect = `永久魔法：对一个怪物造成 ${dmg} 点伤害，${stun}% 击晕。`;
};

const magicMissile: OnUpgradeHandler = (upgraded, newLevel) => {
  const boltCounts = [2, 3, 4];
  const bc = boltCounts[newLevel] ?? 4;
  upgraded.description = `加入 ${bc} 张一次性「魔弹」到手牌（每张可对一个怪物造成 1 点法术伤害）。`;
  upgraded.magicEffect = `永久魔法：手上加入 ${bc} 张一次性「魔弹」。`;
};

const loneCardAmulet: OnUpgradeHandler = (upgraded) => {
  upgraded.description = '每次瀑流时（回收前），若背包卡牌数量为 1 或 2，获得一张职业专属牌。';
};

const attackPersuadeAmulet: OnUpgradeHandler = (upgraded) => {
  upgraded.description = '每攻击一次，下次劝降费用 -5（可叠加）。';
};

const cardGainMissileAmulet: OnUpgradeHandler = (upgraded) => {
  upgraded.description = '每从坟场获得一次牌（同时获得多张算一次），将两张「魔弹」加入手牌。';
};

const damageClassDiscoverAmulet: OnUpgradeHandler = (upgraded, _newLevel, state) => {
  upgraded.description = '每造成 3 次伤害（武器、护符、法术等任意来源），发现一张专属牌。';
  upgraded._counterDisplay = `${state.classDamageDiscoverStreak ?? 0}/3`;
};

const stunUpgradeCapAmulet: OnUpgradeHandler = (upgraded) => {
  upgraded.description = '每击晕一次怪物，击晕上限 +10%。';
};

const recycleBackpackExpandAmulet: OnUpgradeHandler = (upgraded, _newLevel, state) => {
  upgraded.description = '每回收 6 张牌，背包上限 +3。';
  upgraded._counterDisplay = `${state.recycleBackpackProgress ?? 0}/6`;
};

const dungeonGoldAmulet: OnUpgradeHandler = (upgraded) => {
  upgraded.description = '每处理 1 张地城牌，金币 +2。';
};

const recycleDrawMagic: OnUpgradeHandler = (upgraded, newLevel) => {
  const rdCounts = [1, 2, 3];
  const rdc = rdCounts[newLevel] ?? 3;
  upgraded.onDiscardDraw = rdc;
  upgraded.description = `使用：将回收袋洗回背包（所有牌剩余瀑流 -1，就绪的牌回背包）。被回收时，从背包抽 ${rdc} 张牌。`;
  upgraded.magicEffect = `永久魔法：使用：将回收袋洗回背包（所有牌剩余瀑流 -1，就绪的牌回背包）。被回收时，从背包抽 ${rdc} 张牌。`;
};

const dimensionWarp: OnUpgradeHandler = (upgraded, newLevel) => {
  const delays = [2, 1, 1];
  upgraded.recycleDelay = delays[newLevel] ?? 1;
  if (newLevel >= 2) {
    upgraded.description = '将地城行的一张牌和它正上方预览行的牌互换，然后抽 1 张牌。';
    upgraded.magicEffect = '永久魔法：选择一张地城行卡牌，与正上方预览行卡牌互换位置，然后抽 1 张牌。';
  }
};

const undyingBlessing: OnUpgradeHandler = (upgraded) => {
  upgraded.description = '赋予装备复生能力，失去 2 点生命，然后抽 1 张牌。';
  upgraded.magicEffect = '永久魔法：选择一个装备，赋予其复生，失去 2 点生命，然后抽 1 张牌。';
};

const gamblerGambit: OnUpgradeHandler = (upgraded, newLevel) => {
  const golds = [1, 2, 3];
  const draws = [1, 2, 3];
  const g = golds[newLevel] ?? 3;
  const d = draws[newLevel] ?? 3;
  upgraded.description = `失去 1 点生命，获得 ${g} 金币，从背包抽 ${d} 张牌。`;
  upgraded.magicEffect = `永久魔法：失去 1 点生命，获得 ${g} 金币，从背包抽 ${d} 张牌。`;
};

const healMagic: OnUpgradeHandler = (upgraded, newLevel) => {
  const heals = [5, 3, 5];
  const delays = [0, 2, 1];
  const h = heals[newLevel] ?? 5;
  upgraded.magicType = 'permanent';
  upgraded.recycleDelay = delays[newLevel] ?? 1;
  upgraded.description = `回复 ${h} 点生命。`;
  upgraded.magicEffect = `永久魔法：回复 ${h} 点生命。`;
};

const classSummon: OnUpgradeHandler = (upgraded) => {
  upgraded.magicType = 'permanent';
  upgraded.recycleDelay = 2;
  upgraded.description = '弃回 2 张牌，获得一张职业专属卡。';
  upgraded.magicEffect = '永久魔法：弃回 2 张牌，获得一张职业专属卡。';
};

// ============================================================================
// Amulet effects
// ============================================================================

const persuadeOnTempAttack: OnUpgradeHandler = (upgraded) => {
  upgraded.description = '（已升级）每获得一次临时攻击或临时护甲加成，下一次劝降率 +20%。';
};

const persuadeGrantRecycleFetch: OnUpgradeHandler = (upgraded) => {
  upgraded.description = '（已升级）每劝降一次，将两张「归袋抽引」加入手牌（一次性：从回收袋随机 1 张牌加入手牌）。';
};

// ============================================================================
// Knight effects
// ============================================================================

const graveyardRecall: OnUpgradeHandler = (upgraded, newLevel) => {
  const recallCounts = [3, 4, 5, 6];
  const cnt = recallCounts[newLevel] ?? 6;
  upgraded.description = `一次性：从坟场随机取回至多 ${cnt} 张牌加入背包（不能取回自己）。`;
  upgraded.magicEffect = `坟场随机取回 ${cnt} 张牌。`;
};

const bloodGreed: OnUpgradeHandler = (upgraded, newLevel) => {
  if (newLevel >= 1) {
    upgraded.description = '一次性：获得等同当前已损失生命的金币，将"贪婪诅咒"放入背包，并开启商店。';
    upgraded.magicEffect = '获得金币，生成贪婪诅咒，并开启商店。';
  }
};

const armorStrike: OnUpgradeHandler = (upgraded, newLevel) => {
  const pcts = [100, 150];
  const pct = pcts[newLevel] ?? 150;
  upgraded.description = `永久：选择一件护甲装备，对目标怪物造成等同护甲值 ${pct}% 的伤害。`;
  upgraded.shortDescription = `一件护甲值 ${pct}% 转化为伤害`;
  upgraded.magicEffect = `护甲值 ${pct}% 转化为伤害。`;
};

const armorDoubleStrike: OnUpgradeHandler = (upgraded, newLevel) => {
  const pcts = [50, 75];
  const pct = pcts[newLevel] ?? 75;
  upgraded.description = `永久：选择一面护盾，对随机 2 个怪物各造成 ${pct}% 护甲值的法术伤害，然后该护盾耐久 -1。`;
  upgraded.shortDescription = `${pct}% 护甲法伤随机 2 怪；该盾耐久 -1`;
  upgraded.magicEffect = `护甲值 ${pct}% 伤害随机两怪，盾耐久 -1。`;
};

const battleSpirit: OnUpgradeHandler = (upgraded, newLevel) => {
  const amounts = [1, 2];
  const amt = amounts[newLevel] ?? 2;
  upgraded.description = `一次性：选择一个装备栏，本回合（持续到下次瀑流）该栏每英雄回合可多攻击 ${amt} 次，且每怪物回合格挡耐久上限 +${amt}。`;
  upgraded.magicEffect = '选定装备栏激发战意。';
};

const berserkGambit: OnUpgradeHandler = (upgraded, newLevel) => {
  if (newLevel === 1) {
    upgraded.description = '一次性：生命降至 1，本回合所有装备 +4 伤害，每个武器栏可多攻击一次。';
    upgraded.magicEffect = '降血换取爆发与每栏额外攻击。';
  } else if (newLevel === 2) {
    upgraded.description = '一次性：生命降至 1，本回合所有装备 +8 伤害，每个武器栏可多攻击一次。';
    upgraded.magicEffect = '降血换取强力爆发与每栏额外攻击。';
  } else if (newLevel === 3) {
    upgraded.description = '一次性：生命降至 1，本回合所有装备 +8 伤害，每个武器栏可多攻击 2 次。';
    upgraded.magicEffect = '降血换取强力爆发与每栏多次额外攻击。';
  }
};

const missingHpSmite: OnUpgradeHandler = (upgraded, newLevel) => {
  const smitePcts = [50, 100, 150];
  const sp = smitePcts[newLevel] ?? 150;
  upgraded.description = `永久：对一名怪物造成等同当前已损失生命值 ${sp}% 的伤害。`;
  upgraded.magicEffect = `以失去生命 ${sp}% 为伤害。`;
};

const deathWard: OnUpgradeHandler = (upgraded, newLevel) => {
  if (newLevel === 1) {
    upgraded.magicType = 'permanent' as any;
    upgraded.recycleDelay = 2;
    upgraded.description = '永久：只能在受到致命伤害时触发，抵消该次伤害。每 2 回合可用。';
    upgraded.magicEffect = '濒死时抵消致死伤害（永久，2 回合冷却）。';
  } else if (newLevel === 2) {
    upgraded.magicType = 'permanent' as any;
    upgraded.recycleDelay = 1;
    upgraded.description = '永久：只能在受到致命伤害时触发，抵消该次伤害。每回合可用。';
    upgraded.magicEffect = '濒死时抵消致死伤害（永久，1 回合冷却）。';
  }
};

const recycleFlare: OnUpgradeHandler = (upgraded, newLevel) => {
  const drawCounts = [2, 3, 4];
  const dc = drawCounts[newLevel] ?? 4;
  upgraded.description = `永久：回收袋洗回背包（所有牌剩余瀑流 -1），然后抽 ${dc} 张牌。(可超手牌上限)`;
  upgraded.magicEffect = `回收袋归位并抽 ${dc} 张牌。`;
};

const fateSight: OnUpgradeHandler = (upgraded, newLevel) => {
  const baseDamages = [3, 4];
  const peekCounts = [3, 4];
  const dmg = baseDamages[newLevel] ?? 4;
  const peek = peekCounts[newLevel] ?? 4;
  upgraded.recycleDelay = newLevel >= 1 ? 1 : 2;
  upgraded.description = `永久：造成 ${dmg} 点伤害，翻看主牌堆顶 ${peek} 张牌，每有一张怪物牌，20% 概率击晕目标。`;
  upgraded.magicEffect = `造成 ${dmg} 点伤害并透视 ${peek} 张牌，可能击晕目标。`;
};

const bloodDraw: OnUpgradeHandler = (upgraded, newLevel) => {
  const bloodDrawCounts = [3, 4, 5];
  const dc = bloodDrawCounts[newLevel] ?? 5;
  upgraded.description = `永久：失去 1 点生命，抽 ${dc} 张牌。`;
  upgraded.magicEffect = `失去 1 HP，抽 ${dc} 张牌。`;
};

const graveNova: OnUpgradeHandler = (upgraded, newLevel) => {
  const novaDmgs = [3, 6];
  const nd = novaDmgs[newLevel] ?? 6;
  upgraded.description = `永久：当此牌被弃置时，对当前行所有怪物造成 ${nd} 点伤害。`;
  upgraded.magicEffect = `被弃置时造成 ${nd} 点爆炸伤害。`;
};

const armorStunConvert: OnUpgradeHandler = (upgraded, newLevel) => {
  const stunPerArmor = [1, 2];
  const sp = stunPerArmor[newLevel] ?? 2;
  upgraded.description = `永久：选择一个护盾，每 1 点护甲值使击晕上限 +${sp}%。`;
  upgraded.shortDescription = `所选护盾每 1 护甲，击晕上限 +${sp}%`;
  upgraded.magicEffect = `护甲转化为击晕上限（每点 +${sp}%）。`;
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
  { id: `starter:${STARTER_CARD_IDS.healMagic}`, handler: healMagic },
  { id: `starter:${STARTER_CARD_IDS.classSummon}`, handler: classSummon },

  // Amulet effects
  { id: 'amulet:persuade-on-temp-attack', handler: persuadeOnTempAttack },
  { id: 'amulet:persuade-grant-recycle-fetch', handler: persuadeGrantRecycleFetch },

  // Knight effects
  { id: 'knight:graveyard-recall', handler: graveyardRecall },
  { id: 'knight:blood-greed', handler: bloodGreed },
  { id: 'knight:armor-strike', handler: armorStrike },
  { id: 'knight:armor-double-strike', handler: armorDoubleStrike },
  { id: 'knight:battle-spirit', handler: battleSpirit },
  { id: 'knight:berserk-gambit', handler: berserkGambit },
  { id: 'knight:missing-hp-smite', handler: missingHpSmite },
  { id: 'knight:death-ward', handler: deathWard },
  { id: 'knight:recycle-flare', handler: recycleFlare },
  { id: 'knight:fate-sight', handler: fateSight },
  { id: 'knight:blood-draw', handler: bloodDraw },
  { id: 'knight:grave-nova', handler: graveNova },
  { id: 'knight:armor-stun-convert', handler: armorStunConvert },
]);
