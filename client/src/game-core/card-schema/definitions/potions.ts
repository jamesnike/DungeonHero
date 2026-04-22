/**
 * Potion CardDefinitions — declarative definitions for all potion effects.
 *
 * Each potion is registered with an effectId of "potion:{potionEffect}".
 * The engine processes their effects pipeline to produce a ReduceResult.
 */

import type { CardDefinition } from '../types';
import { registerCards } from '../registry';

const potionDefinitions: CardDefinition[] = [
  // =========================================================================
  // Non-interactive potions
  // =========================================================================

  // --- Default heal (no potionEffect) ---
  {
    effectId: 'potion:heal',
    effects: [
      { type: 'log', logType: 'potion', message: '使用 ${card.name}：恢复 ${card.value} 点生命' },
      { type: 'heal', amount: 'cardValue' },
      { type: 'finalize' },
    ],
    tags: ['healing'],
  },

  // --- Heal 5 ---
  {
    effectId: 'potion:heal-5',
    effects: [
      { type: 'log', logType: 'potion', message: '使用 ${card.name}：恢复 5 点生命' },
      { type: 'heal', amount: 5 },
      { type: 'finalize' },
    ],
    tags: ['healing'],
  },

  // --- Heal 14 ---
  {
    effectId: 'potion:heal-14',
    effects: [
      { type: 'log', logType: 'potion', message: '使用 ${card.name}：恢复 14 点生命' },
      { type: 'heal', amount: 14 },
      { type: 'finalize' },
    ],
    tags: ['healing'],
  },

  // --- Heal 12 + draw 2 ---
  {
    effectId: 'potion:heal-12-draw-2',
    effects: [
      { type: 'log', logType: 'potion', message: '使用 ${card.name}：恢复 12 点生命，抽 2 张牌' },
      { type: 'heal', amount: 12 },
      { type: 'draw', count: 2, source: 'backpack' },
      { type: 'finalize' },
    ],
    tags: ['healing', 'draw'],
  },

  // --- Shield ---
  {
    effectId: 'potion:shield',
    effects: [
      { type: 'log', logType: 'potion', message: '使用 ${card.name}：获得 ${card.value} 点临时护盾' },
      { type: 'shield', amount: 'cardValue' },
      { type: 'finalize' },
    ],
    tags: ['defense'],
  },

  // --- Draw ---
  {
    effectId: 'potion:draw',
    effects: [
      { type: 'log', logType: 'potion', message: '使用 ${card.name}：抽取 ${card.value} 张牌' },
      { type: 'draw', count: 'cardValue', source: 'backpack' },
      { type: 'finalize' },
    ],
    tags: ['draw'],
  },

  // --- Permanent spell damage +1 ---
  {
    effectId: 'potion:perm-spell-damage',
    effects: [
      { type: 'modifyStat', stat: 'permanentSpellDamageBonus', delta: 1 },
      { type: 'log', logType: 'potion', message: '药水效果：永久法术伤害 +1' },
      { type: 'banner', text: '永久法术伤害 +1。' },
      { type: 'finalize' },
    ],
    tags: ['buff', 'permanent'],
  },

  // --- Permanent spell damage +2 ---
  {
    effectId: 'potion:perm-spell-damage+2',
    effects: [
      { type: 'modifyStat', stat: 'permanentSpellDamageBonus', delta: 2 },
      { type: 'log', logType: 'potion', message: '药水效果：永久法术伤害 +2' },
      { type: 'banner', text: '永久法术伤害 +2。' },
      { type: 'finalize' },
    ],
    tags: ['buff', 'permanent'],
  },

  // --- Permanent spell damage +2, max HP -5 ---
  {
    effectId: 'potion:perm-spell-damage-2',
    effects: [
      { type: 'modifyStat', stat: 'permanentSpellDamageBonus', delta: 2 },
      { type: 'modifyStat', stat: 'permanentMaxHpBonus', delta: -5 },
      { type: 'clampHp' },
      { type: 'log', logType: 'potion', message: '药水效果：永久法术伤害 +2；最大生命值 -5' },
      { type: 'banner', text: '永久法术伤害 +2；最大生命值 -5。' },
      { type: 'finalize' },
    ],
    tags: ['buff', 'permanent', 'tradeoff'],
  },

  // --- Backpack capacity +1 ---
  {
    effectId: 'potion:perm-backpack-size',
    effects: [
      { type: 'modifyStat', stat: 'backpackCapacityModifier', delta: 1 },
      { type: 'log', logType: 'potion', message: '药水效果：背包容量永久 +1' },
      { type: 'banner', text: '背包容量永久 +1。' },
      { type: 'enforceBackpackCapacity' },
      { type: 'finalize' },
    ],
    tags: ['buff', 'permanent'],
  },

  // --- Backpack capacity +2 ---
  {
    effectId: 'potion:perm-backpack-size+2',
    effects: [
      { type: 'modifyStat', stat: 'backpackCapacityModifier', delta: 2 },
      { type: 'log', logType: 'potion', message: '药水效果：背包上限 +2' },
      { type: 'banner', text: '背包上限 +2。' },
      { type: 'finalize' },
    ],
    tags: ['buff', 'permanent'],
  },

  // --- Backpack capacity +3 ---
  {
    effectId: 'potion:perm-backpack-size+3',
    effects: [
      { type: 'modifyStat', stat: 'backpackCapacityModifier', delta: 3 },
      { type: 'log', logType: 'potion', message: '药水效果：背包上限 +3' },
      { type: 'banner', text: '背包上限 +3。' },
      { type: 'finalize' },
    ],
    tags: ['buff', 'permanent'],
  },

  // --- Backpack capacity +5 ---
  {
    effectId: 'potion:perm-backpack-size+5',
    effects: [
      { type: 'modifyStat', stat: 'backpackCapacityModifier', delta: 5 },
      { type: 'log', logType: 'potion', message: '药水效果：背包上限 +5' },
      { type: 'banner', text: '背包上限 +5。' },
      { type: 'finalize' },
    ],
    tags: ['buff', 'permanent'],
  },

  // --- Spell lifesteal +1 ---
  {
    effectId: 'potion:perm-spell-lifesteal+1',
    effects: [
      { type: 'modifyStat', stat: 'permanentSpellLifesteal', delta: 1 },
      { type: 'log', logType: 'potion', message: '药水效果：永久超杀吸血 +1' },
      { type: 'banner', text: '永久超杀吸血 +1。' },
      { type: 'finalize' },
    ],
    tags: ['buff', 'permanent'],
  },

  // --- Spell lifesteal +2 ---
  {
    effectId: 'potion:perm-spell-lifesteal+2',
    effects: [
      { type: 'modifyStat', stat: 'permanentSpellLifesteal', delta: 2 },
      { type: 'log', logType: 'potion', message: '药水效果：永久超杀吸血 +2' },
      { type: 'banner', text: '永久超杀吸血 +2。' },
      { type: 'finalize' },
    ],
    tags: ['buff', 'permanent'],
  },

  // --- Hand limit +1 (perm-hand-limit+1 and perm-hand-limit+2 both give +1) ---
  {
    effectId: 'potion:perm-hand-limit+1',
    effects: [
      { type: 'modifyStat', stat: 'handLimitBonus', delta: 1 },
      { type: 'log', logType: 'potion', message: '药水效果：手牌上限 +1' },
      { type: 'banner', text: '手牌上限 +1。' },
      { type: 'finalize' },
    ],
    tags: ['buff', 'permanent'],
  },
  {
    effectId: 'potion:perm-hand-limit+2',
    effects: [
      { type: 'modifyStat', stat: 'handLimitBonus', delta: 1 },
      { type: 'log', logType: 'potion', message: '药水效果：手牌上限 +1' },
      { type: 'banner', text: '手牌上限 +1。' },
      { type: 'finalize' },
    ],
    tags: ['buff', 'permanent'],
  },

  // --- Waterfall deal bonus +1 ---
  {
    effectId: 'potion:perm-waterfall-deal+1',
    effects: [
      { type: 'modifyStat', stat: 'waterfallDealBonus', delta: 1 },
      { type: 'log', logType: 'potion', message: '药水效果：永久瀑流发牌数 +1' },
      { type: 'banner', text: '永久瀑流发牌数 +1！多出的牌将堆叠在非怪物格。' },
      { type: 'finalize' },
    ],
    tags: ['buff', 'permanent'],
  },

  // --- Stun cap +10 ---
  {
    effectId: 'potion:perm-stun-cap+10',
    effects: [
      { type: 'modifyStat', stat: 'stunCap', delta: 10 },
      { type: 'log', logType: 'potion', message: '眩晕药剂：击晕上限 +10%' },
      { type: 'banner', text: '击晕上限 +10%！' },
      { type: 'finalize' },
    ],
    tags: ['buff', 'permanent'],
  },

  // --- Boost both slots: damage+1, shield+1 ---
  {
    effectId: 'potion:boost-both-slots',
    effects: [
      { type: 'boostSlotBonuses', slots: ['both'], damage: 1, shield: 1 },
      { type: 'log', logType: 'potion', message: '双锋淬液：左右装备栏永久伤害+1，护甲+1' },
      { type: 'banner', text: '左右装备栏永久伤害+1，护甲+1！' },
      { type: 'finalize' },
    ],
    tags: ['buff', 'permanent', 'equipment'],
  },

  // --- Boost both slots: shield+1 only ---
  {
    effectId: 'potion:perm-both-slots-shield+1',
    effects: [
      { type: 'boostSlotBonuses', slots: ['both'], shield: 1 },
      { type: 'log', logType: 'potion', message: '盾坚药：左右装备栏永久护甲 +1' },
      { type: 'banner', text: '左右装备栏永久护甲 +1！' },
      { type: 'finalize' },
    ],
    tags: ['buff', 'permanent', 'equipment'],
  },

  // --- Left slot durability max +1 ---
  {
    effectId: 'potion:left-slot-durability-max+1',
    effects: [
      { type: 'modifySlotDurabilityMax', slot: 'left', delta: 1 },
      { type: 'finalize' },
    ],
    tags: ['equipment', 'permanent'],
  },

  // --- Left slot durability max +2 ---
  // (reuse same effectId pattern; the PotionEffectId doesn't exist separately but
  //  the code handles it via the same branch)

  // --- Right slot durability max +1 ---
  {
    effectId: 'potion:right-slot-durability-max+1',
    effects: [
      { type: 'modifySlotDurabilityMax', slot: 'right', delta: 1 },
      { type: 'finalize' },
    ],
    tags: ['equipment', 'permanent'],
  },

  // --- Right slot durability max +2 ---
  // (handled similarly)

  // --- Swap slot damage/shield ---
  {
    effectId: 'potion:swap-slot-damage-shield',
    effects: [
      { type: 'swapSlotDamageShield' },
      { type: 'finalize' },
    ],
    tags: ['equipment', 'rng'],
  },

  // --- Spell lifesteal +1 and max HP +6 ---
  {
    effectId: 'potion:spell-lifesteal+1-maxhp+6',
    effects: [
      { type: 'modifyStat', stat: 'permanentSpellLifesteal', delta: 1 },
      { type: 'modifyStat', stat: 'permanentMaxHpBonus', delta: 6 },
      { type: 'log', logType: 'potion', message: '暗夜吸血药：超杀吸血 +1，生命上限 +6！' },
      { type: 'banner', text: '超杀吸血 +1，生命上限 +6！' },
      { type: 'finalize' },
    ],
    tags: ['buff', 'permanent'],
  },

  // --- Hand limit +1 (standalone) ---
  {
    effectId: 'potion:hand-limit+1',
    effects: [
      { type: 'modifyStat', stat: 'handLimitBonus', delta: 1 },
      { type: 'log', logType: 'potion', message: '扩容药剂：手牌上限永久 +1' },
      { type: 'banner', text: '手牌上限 +1！' },
      { type: 'finalize' },
    ],
    tags: ['buff', 'permanent'],
  },

  // --- Draw backpack 4: +1 backpack, +1 hand limit, draw up to 5 ---
  {
    effectId: 'potion:draw-backpack-4',
    effects: [
      { type: 'custom', handlerId: 'potion:draw-backpack-4' },
    ],
    tags: ['draw', 'buff', 'permanent'],
  },

  // --- Discover class 3 ---
  {
    effectId: 'potion:discover-class-3',
    effects: [
      { type: 'drawClassToBackpack', count: 3 },
      { type: 'finalize' },
    ],
    tags: ['draw', 'class'],
  },

  // =========================================================================
  // Eternal relic potions
  // =========================================================================

  {
    effectId: 'potion:perm-persuade-consecutive',
    effects: [
      {
        type: 'grantEternalRelic',
        relicId: 'chain-persuade' as any,
        logMsg: '获得永恒护符·连劝秘药：连续劝降同一个怪物时，每次累计成功率 +15%！',
        bannerMsg: '获得永恒护符·连劝秘药！连续劝降同一怪物，每次累计概率 +15%。',
        dupeLogMsg: '永恒护符·连劝秘药：效果已存在，无法叠加。',
        dupeBannerMsg: '效果已存在，无法叠加。',
      },
      { type: 'finalize' },
    ],
    tags: ['relic', 'permanent'],
  },

  {
    effectId: 'potion:perm-equip-empower',
    effects: [
      {
        type: 'grantEternalRelic',
        relicId: 'equip-empower' as any,
        logMsg: '获得永恒护符·铸锋药剂：装备上装备时，该装备栏获得 3 临时攻击和 3 临时护甲！',
        bannerMsg: '获得永恒护符·铸锋药剂！装备时获得 +3 临时攻击/+3 临时护甲。',
        dupeLogMsg: '永恒护符·铸锋药剂：效果已存在，无法叠加。',
        dupeBannerMsg: '效果已存在，无法叠加。',
      },
      { type: 'finalize' },
    ],
    tags: ['relic', 'permanent'],
  },

  {
    effectId: 'potion:grant-amulet-end-turn-draw',
    effects: [
      {
        type: 'grantEternalRelic',
        relicId: 'end-turn-draw' as any,
        logMsg: '回合汲取药：获得永恒护符「回合汲取」！结束英雄回合时抽 1 张牌。',
        bannerMsg: '获得永恒护符「回合汲取」！结束英雄回合时抽 1 张牌。',
        dupeLogMsg: '回合汲取药：永恒护符效果已存在，无法叠加。',
        dupeBannerMsg: '永恒护符效果已存在，无法叠加。',
      },
      { type: 'finalize' },
    ],
    tags: ['relic', 'permanent'],
  },

  // =========================================================================
  // Interactive potions
  // =========================================================================

  // --- Slot damage +1 ---
  {
    effectId: 'potion:perm-slot-damage+1',
    effects: [
      { type: 'modifySlotDamageChoose', delta: 1 },
    ],
    tags: ['interactive', 'equipment', 'permanent'],
  },

  // --- Slot damage +2 ---
  {
    effectId: 'potion:perm-slot-damage+2',
    effects: [
      { type: 'modifySlotDamageChoose', delta: 2 },
    ],
    tags: ['interactive', 'equipment', 'permanent'],
  },

  // --- Equipment durability max +1 ---
  {
    effectId: 'potion:perm-equipment-durability-max+1',
    effects: [
      { type: 'modifySlotDurabilityMaxChoose', delta: 1 },
    ],
    tags: ['interactive', 'equipment', 'permanent'],
  },

  // --- Equipment durability max +2 ---
  {
    effectId: 'potion:perm-equipment-durability-max+2',
    effects: [
      { type: 'modifySlotDurabilityMaxChoose', delta: 2 },
    ],
    tags: ['interactive', 'equipment', 'permanent'],
  },

  // --- Slot capacity +1 ---
  {
    effectId: 'potion:perm-slot-capacity+1',
    effects: [
      { type: 'modifySlotCapacityChoose' },
    ],
    tags: ['interactive', 'equipment', 'permanent'],
  },

  // --- Grant weapon stun chance +40% ---
  {
    effectId: 'potion:grant-weapon-stun-chance+40',
    effects: [
      { type: 'grantWeaponStunChanceChoose', amount: 40 },
    ],
    tags: ['interactive', 'equipment', 'permanent'],
  },

  // --- Repair weapon 2 ---
  {
    effectId: 'potion:repair-weapon-2',
    effects: [
      { type: 'repairSlot', allowedTypes: ['weapon', 'shield', 'monster'], amount: 2 },
      { type: 'finalize' },
    ],
    tags: ['interactive', 'equipment', 'repair'],
  },

  // --- Repair weapon 3 ---
  {
    effectId: 'potion:repair-weapon-3',
    effects: [
      { type: 'repairSlot', allowedTypes: ['weapon', 'shield', 'monster'], amount: 3 },
      { type: 'finalize' },
    ],
    tags: ['interactive', 'equipment', 'repair'],
  },

  // --- Repair choice ---
  {
    effectId: 'potion:repair-choice',
    effects: [
      { type: 'custom', handlerId: 'potion:repair-choice' },
    ],
    tags: ['interactive', 'equipment', 'repair'],
  },

  // --- Equip swap ---
  {
    effectId: 'potion:equip-swap',
    effects: [
      { type: 'equipSwap' },
    ],
    tags: ['interactive', 'equipment'],
  },

  // --- Dice arcane infusion ---
  {
    effectId: 'potion:dice-arcane-infusion',
    effects: [
      {
        type: 'diceRoll',
        config: {
          title: '奥术灌注',
          subtitle: '掷骰决定翻倍目标',
          entries: [
            { id: 'ai-l-dmg', range: [1, 4], label: '左装备栏伤害翻倍', effect: 'none' },
            { id: 'ai-l-shd', range: [5, 8], label: '左装备栏护甲翻倍', effect: 'none' },
            { id: 'ai-r-dmg', range: [9, 12], label: '右装备栏伤害翻倍', effect: 'none' },
            { id: 'ai-r-shd', range: [13, 16], label: '右装备栏护甲翻倍', effect: 'none' },
            { id: 'ai-spell', range: [17, 20], label: '法术伤害加成翻倍', effect: 'none' },
          ],
          flowId: 'arcane-infusion',
        },
      },
    ],
    tags: ['interactive', 'rng', 'equipment'],
  },

  // --- Dice backpack expand ---
  {
    effectId: 'potion:dice-backpack-expand',
    effects: [
      {
        type: 'magicChoice',
        config: {
          title: '灵药',
          subtitle: '选择灵药效果',
          options: [
            { id: 'bp-amulet', label: '护符上限 +1', description: '永久增加护符槽位上限 1 个' },
            { id: 'bp-left', label: '左装备栏容量 +1', description: '永久增加左装备栏容量 1 个' },
            { id: 'bp-right', label: '右装备栏容量 +1', description: '永久增加右装备栏容量 1 个' },
            { id: 'bp-bag', label: '背包容量 +3', description: '永久增加背包容量 3 格' },
          ],
          flowId: 'backpack-expand',
        },
      },
    ],
    tags: ['interactive', 'buff', 'permanent'],
  },

  // --- Generic repair (delegates to UI) ---
  {
    effectId: 'potion:repair',
    effects: [
      { type: 'custom', handlerId: 'potion:repair' },
    ],
    tags: ['interactive', 'equipment', 'repair'],
  },

  // --- Discover graveyard magic ---
  {
    effectId: 'potion:discover-graveyard-magic',
    effects: [
      { type: 'discoverGraveyardMagic' },
    ],
    tags: ['interactive', 'discover'],
  },

  // --- Discover class magic ---
  {
    effectId: 'potion:discover-class-magic',
    effects: [
      { type: 'discoverClassMagic' },
    ],
    tags: ['interactive', 'discover', 'class'],
  },

  // --- Grant perm 2 ---
  {
    effectId: 'potion:grant-perm-2',
    effects: [
      { type: 'grantPerm2' },
      { type: 'finalize' },
    ],
    tags: ['interactive', 'buff'],
  },

  // --- Transform recycle grant ---
  {
    effectId: 'potion:transform-recycle-grant',
    effects: [
      { type: 'transformRecycleGrant' },
      { type: 'finalize' },
    ],
    tags: ['interactive', 'buff'],
  },

  // --- Amplify target (wide scope: equipment + hand + backpack) ---
  // Knight 专属「增幅秘药」：选一张装备/伤害魔法（手牌、装备栏、背包均可），
  // 生成对应 Perm 1 增幅卡放入背包。effect 自带 halt：不在 schema 里 finalize，
  // 由 RESOLVE_AMPLIFY / CANCEL_AMPLIFY 触发 FINALIZE_POTION_CARD。
  {
    effectId: 'potion:amplify-target-wide',
    effects: [
      { type: 'amplifyTargetWide' },
    ],
    tags: ['interactive', 'buff'],
  },

  // --- Grant last-words slot temp buff ---
  {
    effectId: 'potion:grant-lastwords-slot-temp-buff',
    effects: [
      { type: 'grantLastWordsSlotTempBuff' },
    ],
    tags: ['interactive', 'equipment'],
  },

  // --- Amulet to eternal relic ---
  {
    effectId: 'potion:amulet-to-eternal-relic',
    effects: [
      { type: 'amuletToEternalRelic' },
      { type: 'finalize' },
    ],
    tags: ['interactive', 'relic'],
  },
];

// Auto-register all potion definitions on module load
registerCards(potionDefinitions);

export { potionDefinitions };
