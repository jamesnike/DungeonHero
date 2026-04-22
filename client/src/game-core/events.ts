/**
 * Events Domain — pure logic for event card resolution.
 *
 * Event resolution is complex and involves many side effects. This module
 * extracts the pure state-transition parts; async/interactive steps
 * (dice rolls, modal prompts) are orchestrated by the GameEngine.
 */

import type { GameCardData, EventEffectExpression, EventChoiceDefinition, EventRequirement } from '@/components/GameCard';
import { isPermRecycleEquipment, cardHasPermFlag } from '@/components/GameCard';
import type {
  ActiveRowSlots,
  EquipmentItem,
  EquipmentSlotId,
} from '@/components/game-board/types';
import type { GameState } from './types';
import { INITIAL_HP, FLIP_GOLD_REWARD, PERSUADE_COST, MIN_PERSUADE_COST, BASE_BACKPACK_CAPACITY, MAX_SHOP_LEVEL, MAX_PERSUADE_LEVEL, HAND_LIMIT } from './constants';
import { flattenActiveRowSlots, pickRandomHandCardsForDiscardPreferGraveyard, isRecyclableFromHand, applyAmplifyOnCreate } from './helpers';
import { computeAmuletEffects } from './equipment';
import { getEternalRelic, hasEternalRelic } from '@/lib/eternalRelics';
import { applyEquipDestroyLastWords } from './rules/waterfall';
import type { GameAction } from './actions';
import type { SideEffect } from './reducer';
import { createGraveyardRecallCard } from '@/lib/knightDeck';
import bloodCurseSealImage from '@assets/generated_images/card_curse_blood_seal.png';
import sealBladeImage from '@assets/generated_images/knight_seal_blade.png';
import flipPrintAmuletImage from '@assets/generated_images/knight_arc_seal_amulet.png';
import {
  skillScrollImage, starterScrollUpgradeImage, eventScrollImage,
  potionSpellDamageImage, potionWeaponRepairImage,
  starterScrollRecallImage, starterScrollReviveImage,
  STARTER_CARD_IDS, createStarterCardPool, createMagicBoltCard,
} from './deck';
import dedupeStarterMagicMissileImage from '@assets/generated_images/card_dedupe_starter_magic_missile.png';
import type { RngState } from './rng';
import { nextRandom, nextInt, shuffle as rngShuffle, pickRandom, nextId } from './rng';
import { cloneClassCardWithFreshId, cloneClassCardsWithFreshIds, sampleDistinctByName } from './cardClone';

// ---------------------------------------------------------------------------
// Evaluate choice requirements
// ---------------------------------------------------------------------------

export interface ChoiceAvailability {
  available: boolean;
  reason?: string;
}

export function evaluateChoiceRequirement(
  state: GameState,
  req: EventRequirement,
): ChoiceAvailability {
  switch (req.type) {
    case 'equipment': {
      const item = req.slot === 'left' ? state.equipmentSlot1 : state.equipmentSlot2;
      return {
        available: item !== null,
        reason: req.message ?? `${req.slot === 'left' ? '左' : '右'}侧装备栏为空`,
      };
    }

    case 'equipmentAny':
      return {
        available: state.equipmentSlot1 !== null || state.equipmentSlot2 !== null,
        reason: req.message ?? '需要至少一件装备',
      };

    case 'amulet':
      return {
        available: state.amuletSlots.length > 0,
        reason: req.message ?? '需要至少一个护符',
      };

    case 'hand':
      return {
        available: state.handCards.length >= req.min,
        reason: req.message ?? `需要至少 ${req.min} 张手牌`,
      };

    case 'cardPool': {
      let count = 0;
      if (req.pools.includes('hand')) count += state.handCards.length;
      if (req.pools.includes('backpack')) count += state.backpackItems.length;
      return {
        available: count >= req.min,
        reason: req.message ?? `需要至少 ${req.min} 张可选卡牌`,
      };
    }

    case 'graveyard':
      return {
        available: state.discardedCards.length >= req.min,
        reason: req.message ?? `坟场中没有可召回的卡牌`,
      };

    case 'gold':
      return {
        available: state.gold >= req.min,
        reason: req.message ?? `需要至少 ${req.min} 金币`,
      };

    case 'leftmostIsEnraged': {
      const firstCard = flattenActiveRowSlots(state.activeCards).find(c => c !== null);
      const isEnraged = firstCard?.type === 'monster' &&
        state.combatState.engagedMonsterIds.includes(firstCard.id);
      return {
        available: Boolean(isEnraged),
        reason: req.message ?? '左侧第一张牌不是已交战的怪物',
      };
    }

    case 'shopLevel':
      return {
        available: state.shopLevel >= req.min,
        reason: req.message ?? `商店等级不足 ${req.min}`,
      };

    case 'persuadeLevel':
      return {
        available: state.persuadeLevel >= req.min,
        reason: req.message ?? `劝降等级不足 ${req.min}`,
      };

    default:
      return { available: true };
  }
}

export function evaluateAllChoiceRequirements(
  state: GameState,
  choice: EventChoiceDefinition,
  allChoices: EventChoiceDefinition[],
): ChoiceAvailability {
  if (choice.requires) {
    for (const req of choice.requires) {
      const result = evaluateChoiceRequirement(state, req);
      if (!result.available) return result;
    }
  }

  if (choice.requiresDisabledChoices?.length) {
    const disabledIds = new Set(choice.requiresDisabledChoices);
    const blockers = allChoices.filter(c => c.id && disabledIds.has(c.id));
    const anyBlockerAvailable = blockers.some(b => {
      if (!b.requires) return true;
      return b.requires.every(r => evaluateChoiceRequirement(state, r).available);
    });
    if (anyBlockerAvailable) {
      return {
        available: false,
        reason: choice.requiresDisabledReason ?? '仍有其他选项可用',
      };
    }
  }

  return { available: true };
}

// ---------------------------------------------------------------------------
// Parse effect expression
// ---------------------------------------------------------------------------

export function parseEffectExpression(effect: EventEffectExpression): string[] {
  if (Array.isArray(effect)) return effect;
  return effect.split(',').map(s => s.trim());
}

// ---------------------------------------------------------------------------
// Check if a token is fully handled by the reducer
// ---------------------------------------------------------------------------

const EXACT_REDUCER_TOKENS = new Set([
  'fullheal', 'turnCount-2', 'flipToDoubleNextMagic', 'permanentskill',
  'weapon', 'noop', 'amuletCapacity+1',
  'equipSlot1Capacity+1', 'equipSlot2Capacity+1',
  'halveSlotDamageBonus', 'halveSpellDamageBonus', 'halveSlotShieldBonus',
  'upgradePersuadeAmulets',
  'persuadeSameTargetCostHalve', 'persuadeNextFree',
  // Phase 5A additions
  'amuletCapacity-1', 'discardHandAll',
  'allSlotDamage-1', 'allSlotShield-1',
  'swapEquipmentSlots',
  'repairAll', 'repairAllDurability+1',
  'removeAllAmulets',
  // Phase 1A additions — equipment-focused event tokens
  'discardAllLeftForGold+10', 'discardAllRightForGold+10',
  'discardCurrentLeftForGold+15', 'discardCurrentRightForGold+15',
  'amuletsToGold+10',
  'slotLeftDurMax+1', 'slotRightDurMax+1',
  'slotLeftExtraAttack', 'slotRightExtraAttack',
  'weaponUpgrade', 'weaponUpgrade2',
  'shieldUpgrade2',
  'restoreShield',
  'bloodEmpower',
  'equipKnight',
  // Phase 1B additions — card-zone event tokens
  'grantAmuletPerm',
  'recycleBagDiscover',
  'recycleBagMagicToHand:2',
  'recycleToBackpack',
  'grantTwoUpgradeScrolls',
  'drawClassHeroMagic:1',
  // Phase 1C additions — misc tokens
  'flipBackToGraveyardRecall',
  // Phase EC-1 — handleEventChoice migration pure-state tokens
  'grantStarterWeaponBurst', 'grantStarterTempArmor', 'grantStarterStunStrike',
  'grantPersuadeBoostMagic', 'grantBountySpellMagic',
  'amplify-copy-upgraded',
  // Phase EC-3 — interactive tokens (emit side effects for UI interaction)
  'equipBurst+4',
  'openShop',
  'discoverClass', 'discoverClassWeapon', 'discoverClassMagic', 'discoverStarterMagic',
  'discoverStarterEquipment', 'discoverStarterPotion', 'discoverStarterAmulet',
  'grantStarterMagicTwo',
  'graveyardDiscover', 'graveyardDiscoverMagic',
  // Phase EC-2 — animation tokens (state + side effect)
  'flipToCurse', 'addCurse',
  'flipToSpellEcho',
  'flipToArcaneShield', 'guildFlipToMagic', 'guildFlipToHandRecycleMagic',
  'flipToPaperAsh', 'flipToLeftDurabilityPotion', 'flipToMonsterAttackDebuff',
  'flipToHonorBloodMagic', 'flipToHonorSweepMagic',
  'flipToEquipSwapPotion', 'flipToHandLimitPotion', 'flipToClassMagicDiscoverPotion',
  'flipToDiscardDrawMagic', 'flipToUpgradeScroll',
  'flipToRecallEquip', 'flipToUndyingBlessing', 'flipToCurseWeapon',
  'handAllToRecycleBag',
  'draw2', 'drawClass2', 'drawKnight1', 'drawKnight3', 'drawKnight4',
  'drawSkill', 'drawEquipment', 'grantRandomClassShield',
  'discardHandEquipForClassEquip',
  'useKnightSkill',
  // 弹幕骰局 dice outcomes
  'grantMissileWaterfallAmplify',
  'grantMissileStun20',
  'grantMissileDraw1',
  'grantKnightMagicMissileLv1',
  // 翻转之契
  'flipAllActiveRow',
  'grantActiveRowFlip',
  'flipToFlipPersuadeAmulet',
  'flipToFlipMonsterDebuffMagic',
  'grantHandStunCapBonus',
  'grantEquipFlipRepairBuff',
]);

const PREFIX_REDUCER_TOKENS = [
  'gold+', 'gold-', 'heal+', 'hp-', 'maxhpperm+', 'maxhpperm-',
  'shopLevel+', 'shopLevel-',
  'spellDamage+', 'spellLifesteal+', 'spellLifesteal-',
  'handLimit+', 'handLimit-',
  'backpackSize+', 'backpackSize-', 'tempShield+',
  'stunCap+', 'persuadeLevel+', 'persuadeLevel-', 'persuadeCost-',
  'slotLeftDamage+', 'slotRightDefense+', 'slotLeftDefense+', 'slotRightDamage+',
  'persuadeRaceBonus:', 'persuadeSuccessDurabilityBonus+',
  'persuadeNextCostReduction:', 'persuadeNextRatePenalty:', 'persuadeNextCostIncrease:',
  'activeRowMonsterAttack-',
  // Phase 5A additions
  'allSlotTempAttack:', 'allSlotTempArmor:',
  // Phase 1A additions
  'repairSlot:',
  // Phase 1B additions
  'drawClassToHand:',
  // Phase EC-2 — animation prefix tokens
  'classBottom+',
  'randomDiscardHand:',
  'discardAllHandForGold:',
  'drawHeroCards:',
  // Phase EC-3 — interactive prefix tokens
  'deleteCardForGold:',
  'discardCards:',
  'deleteCard',
  'destroyEquipment:',
  'returnToHand:',
  'grantFlankDraw:', 'grantTransformGold:', 'grantFlankPersuadeCost:',
  'grantFlankStunCap:', 'grantFlankDamage:',
  'grantTransformDraw:', 'grantTransformHeal:',
  'upgradeCard',
  'crypt-all-effects',
  'crossroads-destroy-below',
  'destroyAllEquipment',
  'vault-flipback',
  'fate-dice-strike',
  'amplify-altar-',
  // 弹幕骰局: gainBolts:N grants N 魔弹 cards (overflow → backpack)
  'gainBolts:',
];

/**
 * Returns true if the token is fully handled by `applySimpleEffect` in the reducer,
 * meaning handleEventChoice can just dispatch APPLY_EVENT_EFFECT instead of doing
 * the work in the hook.
 *
 * Tokens that require deps functions (applyDamage, healHero, equipment slot helpers,
 * card creation, async UI) are NOT included here — they stay in the hook.
 */
export function isReducerHandledEventToken(token: string): boolean {
  if (EXACT_REDUCER_TOKENS.has(token)) return true;
  for (const prefix of PREFIX_REDUCER_TOKENS) {
    if (token.startsWith(prefix)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Apply individual effect tokens
// ---------------------------------------------------------------------------

export interface EffectResult {
  patch: Partial<GameState>;
  logs: Array<{ type: string; message: string }>;
  asyncActions: string[];
  emitEvents?: Array<{ event: string; payload: Record<string, unknown> }>;
  enqueuedActions?: import('./actions').GameAction[];
  rawSideEffects?: import('./reducer').SideEffect[];
}

// ---------------------------------------------------------------------------
// flipTo* card definitions
// ---------------------------------------------------------------------------

interface FlipCardDef {
  card: GameCardData;
  rng: RngState;
  banner: string;
  logMessage: string;
  transformMessage: string;
}

function getFlipToCardDefinition(token: string, rng: RngState): FlipCardDef | null {
  let id: string;

  const defs: Record<string, () => FlipCardDef> = {
    flipToArcaneShield: () => {
      [id, rng] = nextId(rng, 'arcane-shield');
      return { card: { id, type: 'magic', name: '奥术护盾', value: 0, image: skillScrollImage, magicType: 'permanent', magicEffect: 'arcane-shield-stun-cap', description: '永久魔法（Perm 2）：击晕上限 +X%，X = 本回合已使用的非伤害魔法卡数量。', shortDescription: '击晕上限 +X%（X ＝ 本回合非伤害魔法数）', recycleDelay: 2 }, rng, banner: '奥术回廊翻转为奥术护盾，已放入背包。', logMessage: '事件效果：奥术回廊翻转成了「奥术护盾」', transformMessage: '奥术回廊翻转为「奥术护盾」…' };
    },
    guildFlipToMagic: () => {
      return { card: { id: 'guild-blood-gold', type: 'magic', name: '血金术', value: 0, image: skillScrollImage, magicType: 'permanent', magicEffect: '永久魔法：受到 1 点伤害，获得 2 金币。', description: '以鲜血换取黄金，奇术商会的禁忌手段。', shortDescription: '-1 生命；+2 金币' }, rng, banner: '商会卷轴翻转为「血金术」，已放入背包。', logMessage: '事件效果：获得「血金术」', transformMessage: '奇术商会翻转为「血金术」…' };
    },
    guildFlipToHandRecycleMagic: () => {
      [id, rng] = nextId(rng, 'guild-hand-recycle');
      return { card: { id, type: 'magic', name: '奇术轮转', value: 0, image: skillScrollImage, magicType: 'permanent', magicEffect: 'guild-hand-recycle', description: '奇术商会的秘传手法：将所有手牌移入回收袋，再从回收袋随机取回 2 张。', shortDescription: '所有手牌入回收袋；回收袋随机 2 张入手' }, rng, banner: '商会卷轴翻转为「奇术轮转」，已放入背包。', logMessage: '事件效果：获得「奇术轮转」', transformMessage: '奇术商会翻转为「奇术轮转」…' };
    },
    flipToPaperAsh: () => {
      [id, rng] = nextId(rng, 'paper-ash');
      return { card: { id, type: 'potion', name: '纸灰药剂', value: 0, image: potionSpellDamageImage, description: '使用时永久让法术伤害 +2；最大生命值 -5。', shortDescription: '永久法伤 +2；生命上限 -5', potionEffect: 'perm-spell-damage-2' }, rng, banner: '遗稿翻转成了纸灰药剂，已放入背包。', logMessage: '事件效果：遗稿翻转成了「纸灰药剂」', transformMessage: '残页翻转，药香浮现…' };
    },
    flipToLeftDurabilityPotion: () => {
      let flipPotionId: string;
      [flipPotionId, rng] = nextId(rng, 'right-dur-potion');
      [id, rng] = nextId(rng, 'left-dur-potion');
      const card: any = { id, type: 'potion', name: '淬炼药剂', value: 0, image: potionWeaponRepairImage, description: '使用时左装备栏的装备耐久上限 +2。翻转后为右装备栏耐久上限 +2 的药剂。', shortDescription: '左栏装备耐久上限 +2', potionEffect: 'left-slot-durability-max+2', flipTarget: { toCard: { id: flipPotionId, type: 'potion', name: '淬炼药剂（右）', value: 0, image: potionWeaponRepairImage, description: '使用时右装备栏的装备耐久上限 +2。', shortDescription: '右栏装备耐久上限 +2', potionEffect: 'right-slot-durability-max+2' }, destination: 'backpack', banner: '淬炼药剂翻转，右侧淬炼之力凝结…' } };
      return { card, rng, banner: '遗稿翻转成了淬炼药剂，已放入背包。', logMessage: '事件效果：遗稿翻转成了「淬炼药剂」', transformMessage: '残页翻转，淬炼之力凝结…' };
    },
    flipToMonsterAttackDebuff: () => {
      [id, rng] = nextId(rng, 'monster-atk-debuff');
      return { card: { id, type: 'magic', name: '威压之令', value: 0, image: skillScrollImage, magicType: 'instant', magicEffect: 'active-row-monster-attack-debuff', description: '即时魔法：激活行所有怪物攻击力 -3。', shortDescription: '激活行所有怪物攻击 -3' }, rng, banner: '战血荣誉翻转为威压之令，已放入背包。', logMessage: '事件效果：战血荣誉翻转成了「威压之令」', transformMessage: '战血荣誉翻转为「威压之令」…' };
    },
    flipToHonorBloodMagic: () => {
      [id, rng] = nextId(rng, 'honor-blood');
      return { card: { id, type: 'magic', name: '战血之印', value: 0, image: skillScrollImage, magicType: 'permanent', magicEffect: 'honor-blood', description: '永久魔法：打出时失去 1 点生命，选择一件装备恢复 1 点耐久（法术回响时恢复 2）。被弃置时将激活行所有怪物攻击力 -2。', shortDescription: '-1 生命；一件装备 +1 耐久；弃置时激活行怪物攻击 -2' }, rng, banner: '战血荣誉翻转为战血之印，已放入背包。', logMessage: '事件效果：战血荣誉翻转成了「战血之印」', transformMessage: '战血荣誉翻转为「战血之印」…' };
    },
    flipToHonorSweepMagic: () => {
      [id, rng] = nextId(rng, 'honor-sweep');
      return { card: { id, type: 'magic', name: '战血横扫', value: 0, image: skillScrollImage, magicType: 'instant', magicEffect: 'honor-sweep', knightEffect: 'honor-sweep', description: '即时魔法：选择一把武器，对激活行所有怪物造成等同于该武器当前攻击力的法术伤害；每击杀一个怪物，升级一张牌。', shortDescription: '武器攻击作法伤横扫激活行；每击杀升级 1 张牌' }, rng, banner: '战血荣誉翻转为战血横扫，已放入背包。', logMessage: '事件效果：战血荣誉翻转成了「战血横扫」', transformMessage: '战血荣誉翻转为「战血横扫」…' };
    },
    flipToEquipSwapPotion: () => {
      [id, rng] = nextId(rng, 'equip-swap-potion');
      return { card: { id, type: 'potion', name: '置换药剂', value: 0, image: potionWeaponRepairImage, description: '使用时选择一个装备回到手牌；若另一栏有装备，则换到该位置。', shortDescription: '一件装备回手；另一栏装备换位', potionEffect: 'equip-swap' }, rng, banner: '遗稿翻转成了置换药剂，已放入背包。', logMessage: '事件效果：遗稿翻转成了「置换药剂」', transformMessage: '残页翻转，置换之力凝结…' };
    },
    flipToHandLimitPotion: () => {
      [id, rng] = nextId(rng, 'hand-limit-potion');
      return { card: { id, type: 'potion', name: '扩容药剂', value: 0, image: potionSpellDamageImage, description: '使用时永久手牌上限 +1。', shortDescription: '手牌上限 +1', potionEffect: 'hand-limit+1' }, rng, banner: '遗稿翻转成了扩容药剂，已放入背包。', logMessage: '事件效果：遗稿翻转成了「扩容药剂」', transformMessage: '残页翻转，扩容之力涌现…' };
    },
    flipToClassMagicDiscoverPotion: () => {
      [id, rng] = nextId(rng, 'class-magic-discover-potion');
      return { card: { id, type: 'potion', name: '灵思药剂', value: 0, image: potionSpellDamageImage, description: '使用时从专属牌堆三选一发现一张魔法牌（魔法/英雄魔法）。', shortDescription: '从专属池发现 1 张魔法（3 选 1）', potionEffect: 'discover-class-magic' }, rng, banner: '遗稿翻转成了灵思药剂，已放入背包。', logMessage: '事件效果：遗稿翻转成了「灵思药剂」', transformMessage: '残页翻转，灵思渗入药剂…' };
    },
    flipToDiscardDrawMagic: () => {
      [id, rng] = nextId(rng, 'discard-draw-magic');
      return { card: { id, type: 'magic', name: '回响残页', value: 0, image: skillScrollImage, magicType: 'permanent', magicEffect: 'on-discard-draw-2', description: '永久魔法：被弃回时，从背包抽 2 张牌。', shortDescription: '被弃回时抽 2 张', onDiscardDraw: 2, recycleDelay: 1 }, rng, banner: '遗稿翻转成了回响残页，已放入背包。', logMessage: '事件效果：遗稿翻转成了「回响残页」', transformMessage: '残页翻转，回响之力涌出…' };
    },
    flipToUpgradeScroll: () => {
      [id, rng] = nextId(rng, 'upgrade-scroll');
      return { card: { id, type: 'magic', name: '升级卷轴', value: 0, image: starterScrollUpgradeImage, magicType: 'instant', magicEffect: '即时魔法：升级一张牌。', description: '一次性使用，选择一张牌进行升级。', shortDescription: '升级 1 张牌' }, rng, banner: '遗稿翻转成了升级卷轴，已放入背包。', logMessage: '事件效果：遗稿翻转成了「升级卷轴」', transformMessage: '遗稿翻转为升级卷轴…' };
    },
    flipToRecallEquip: () => {
      [id, rng] = nextId(rng, `${STARTER_CARD_IDS.recallEquip}-pick`);
      return { card: { id, type: 'magic', name: '回收术', value: 0, image: starterScrollRecallImage, magicType: 'permanent', magicEffect: '永久魔法：回手一张牌，抽 1 张牌。', description: '回手一张牌（从装备栏或护符栏选择），然后抽 1 张牌。', shortDescription: '回手 1 张装备/护符；抽 1 张', knightEffect: 'recall-equipment' }, rng, banner: '血咒仪式翻转成了回收术，已放入背包。', logMessage: '事件效果：血咒仪式翻转成了「回收术」', transformMessage: '血咒仪式翻转为回收术…' };
    },
    flipToUndyingBlessing: () => {
      // Suffix MUST match `getStarterBaseId`'s strip pattern so the played
      // card routes through `resolvePermanentMagic`'s starter switch
      // (case STARTER_CARD_IDS.undyingBlessing). Without `-1`, the base36
      // suffix from nextId leaves the id unstrippable and the card silently
      // no-ops (same class of bug as the雷震击 / 战斗鼓舞 / 铸甲术 grants).
      [id, rng] = nextId(rng, `${STARTER_CARD_IDS.undyingBlessing}-evt-1`);
      return { card: { id, type: 'magic', name: '不灭赐福', value: 0, image: starterScrollReviveImage, magicType: 'permanent', magicEffect: '永久魔法：选择一个装备，赋予其复生（首次毁坏时以 1 耐久复生），然后失去 2 点生命。', description: '赋予装备复生能力，失去 2 点生命。已复生的装备可再次赋予。', shortDescription: '一件装备获得复生；失去 2 生命', recycleDelay: 2 }, rng, banner: '血咒仪式翻转成了不灭赐福，已放入背包。', logMessage: '事件效果：血咒仪式翻转成了「不灭赐福」', transformMessage: '血咒仪式翻转为不灭赐福…' };
    },
    flipToCurseWeapon: () => {
      [id, rng] = nextId(rng, 'curse-weapon');
      return { card: { id, type: 'weapon', name: '封印之刃', value: 2, image: sealBladeImage, durability: 1, maxDurability: 1, onEquipEffect: 'durability-max+1', description: '入场：当前装备栏耐久度上限 +1。', shortDescription: '入场本栏耐久上限 +1' }, rng, banner: '血咒仪式翻转成了封印之刃，已放入背包。', logMessage: '事件效果：血咒仪式翻转成了「封印之刃」', transformMessage: '血咒仪式翻转为封印之刃…' };
    },
    // 翻转之契 option 3 — 翻印之符 (persuade-on-flip amulet)
    flipToFlipPersuadeAmulet: () => {
      [id, rng] = nextId(rng, 'flip-print-amulet');
      return {
        card: {
          id,
          type: 'amulet',
          name: '翻印之符',
          value: 0,
          image: flipPrintAmuletImage,
          amuletEffect: 'persuade-on-flip',
          description: '护符：每翻转一张牌，下次劝降成功率 +10%（叠加，劝降一次后清空）。',
          shortDescription: '每翻转 1 张牌：下次劝降率 +10%（叠加）',
        },
        rng,
        banner: '翻转之契翻转为「翻印之符」，已放入背包。',
        logMessage: '事件效果：翻转之契翻转成了「翻印之符」',
        transformMessage: '翻转之契翻转为「翻印之符」…',
      };
    },
    // 翻转之契 option 4 — 翻覆震慑 (one-shot magic, monster -1 atk per flip)
    flipToFlipMonsterDebuffMagic: () => {
      [id, rng] = nextId(rng, 'flip-monster-debuff-magic');
      return {
        card: {
          id,
          type: 'magic',
          name: '翻覆震慑',
          value: 0,
          image: skillScrollImage,
          magicType: 'instant',
          magicEffect: 'flip-monster-debuff',
          description: '一次性魔法：选择一个怪物，到下次瀑流前，每翻转一张牌该怪物攻击力 -1（叠加，最低 0）。怪物离场则失效。',
          shortDescription: '至下次瀑流：每翻转 1 张牌目标怪物攻击 -1',
        },
        rng,
        banner: '翻转之契翻转为「翻覆震慑」，已放入背包。',
        logMessage: '事件效果：翻转之契翻转成了「翻覆震慑」',
        transformMessage: '翻转之契翻转为「翻覆震慑」…',
      };
    },
  };

  const factory = defs[token];
  return factory ? factory() : null;
}

// ---------------------------------------------------------------------------
// Draw token definitions
// ---------------------------------------------------------------------------

interface DrawTokenDef {
  count: number;
  label: string;
  filter?: (card: GameCardData) => boolean;
  emptyMessage?: string;
}

function getDrawTokenDefinition(token: string): DrawTokenDef {
  switch (token) {
    case 'draw2': case 'drawClass2': return { count: 2, label: '职业牌' };
    case 'drawKnight1': return { count: 1, label: '职业牌' };
    case 'drawKnight3': return { count: 3, label: '职业牌' };
    case 'drawKnight4': return { count: 4, label: '职业牌' };
    case 'drawSkill': return { count: 1, label: '技能牌', filter: c => c.type === 'skill' };
    case 'drawEquipment': return { count: 2, label: '装备牌', filter: c => c.type === 'weapon' || c.type === 'shield' };
    case 'grantRandomClassShield': return { count: 1, label: '护盾', filter: c => c.type === 'shield', emptyMessage: '专属牌堆中没有可用的护盾。' };
    default: return { count: 1, label: '牌' };
  }
}

// ---------------------------------------------------------------------------
// Helpers for backpack / flip-gold
// ---------------------------------------------------------------------------

function addCardToBackpackPatch(
  state: GameState,
  patch: Partial<GameState>,
  card: GameCardData,
): void {
  const cap = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier);
  const currentBp = (patch.backpackItems ?? state.backpackItems);
  if (currentBp.length < cap) {
    patch.backpackItems = [card, ...currentBp];
  } else {
    const currentRecycle = (patch.permanentMagicRecycleBag ?? state.permanentMagicRecycleBag);
    patch.permanentMagicRecycleBag = [...currentRecycle, { ...card, _recycleWaits: card.recycleDelay ?? 1 }];
  }
}

function applyFlipGoldBonus(
  state: GameState,
  patch: Partial<GameState>,
  logs: Array<{ type: string; message: string }>,
): boolean {
  const amuletFx = computeAmuletEffects(state.amuletSlots as GameCardData[]);
  if (amuletFx.flipGoldCount > 0) {
    const goldGain = FLIP_GOLD_REWARD * amuletFx.flipGoldCount;
    patch.gold = (patch.gold ?? state.gold) + goldGain;
    logs.push({ type: 'gold', message: `熔炉之心：卡牌翻转，获得 ${goldGain} 金币。` });
    return true;
  }
  return false;
}

export function applySimpleEffect(
  state: GameState,
  effectToken: string,
): EffectResult {
  const logs: Array<{ type: string; message: string }> = [];
  const asyncActions: string[] = [];
  const emitEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const allEnqueuedActions: GameAction[] = [];
  const allRawSideEffects: SideEffect[] = [];
  let patch: Partial<GameState> = {};

  // --- Resource effects ---

  if (effectToken.startsWith('gold+')) {
    const amount = parseInt(effectToken.replace('gold+', ''), 10) || 0;
    patch = { gold: state.gold + amount };
    logs.push({ type: 'event', message: `获得 ${amount} 金币` });
  } else if (effectToken.startsWith('gold-')) {
    const amount = parseInt(effectToken.replace('gold-', ''), 10) || 0;
    patch = { gold: Math.max(0, state.gold - amount) };
    logs.push({ type: 'event', message: `失去 ${amount} 金币` });
  } else if (effectToken.startsWith('heal+')) {
    const amount = parseInt(effectToken.replace('heal+', ''), 10) || 0;
    const aura = computeAmuletEffects(state.amuletSlots as GameCardData[]);
    const maxHp = INITIAL_HP + (state.permanentMaxHpBonus || 0) + (aura.aura.maxHp || 0);
    const safeHp = Number.isFinite(state.hp) ? state.hp : 0;
    patch = { hp: Math.min(maxHp, safeHp + amount) };
    logs.push({ type: 'heal', message: `恢复 ${amount} 点生命` });
  } else if (effectToken === 'fullheal') {
    const aura = computeAmuletEffects(state.amuletSlots as GameCardData[]);
    const maxHp = INITIAL_HP + (state.permanentMaxHpBonus || 0) + (aura.aura.maxHp || 0);
    patch = { hp: maxHp };
    logs.push({ type: 'heal', message: '完全治愈' });
  } else if (effectToken.startsWith('hp-')) {
    const amount = parseInt(effectToken.replace('hp-', ''), 10) || 0;
    const safeHp = Number.isFinite(state.hp) ? state.hp : 0;
    patch = { hp: Math.max(0, safeHp - amount) };
    logs.push({ type: 'damage', message: `受到 ${amount} 点伤害` });
    if (safeHp - amount <= 0) {
      patch.gameOver = true;
      patch.victory = false;
    }
  } else if (effectToken.startsWith('maxhpperm+')) {
    const amount = parseInt(effectToken.replace('maxhpperm+', ''), 10) || 0;
    const safeHp = Number.isFinite(state.hp) ? state.hp : 0;
    patch = {
      permanentMaxHpBonus: (state.permanentMaxHpBonus || 0) + amount,
      hp: safeHp + amount,
    };
    logs.push({ type: 'event', message: `永久最大生命 +${amount}` });
  } else if (effectToken.startsWith('maxhpperm-')) {
    const amount = parseInt(effectToken.replace('maxhpperm-', ''), 10) || 0;
    if (amount > 0) {
      const newMaxHp = INITIAL_HP + state.permanentMaxHpBonus - amount;
      patch = {
        permanentMaxHpBonus: state.permanentMaxHpBonus - amount,
        hp: Math.min(newMaxHp, state.hp),
        heroSkillBanner: `最大生命永久降低 ${amount}。`,
      };
      logs.push({ type: 'event', message: `永久最大生命 -${amount}` });
    }
  } else if (effectToken.startsWith('tempShield+')) {
    const amount = parseInt(effectToken.replace('tempShield+', ''), 10) || 0;
    patch = {
      tempShield: state.tempShield + amount,
      heroSkillBanner: `获得 ${amount} 点临时护盾。`,
    };
    logs.push({ type: 'event', message: `获得 ${amount} 点临时护盾` });
  } else if (effectToken === 'turnCount-2') {
    patch = {
      turnCount: Math.max(1, state.turnCount - 2),
      heroSkillBanner: '时空收缩：怪物成长进度回退了 2 步！',
    };
    logs.push({ type: 'event', message: 'Waterfall 进度 -2' });

  // --- Shop / persuade level ---

  } else if (effectToken.startsWith('shopLevel+')) {
    const amount = parseInt(effectToken.replace('shopLevel+', ''), 10) || 0;
    const next = Math.min(MAX_SHOP_LEVEL, state.shopLevel + amount);
    if (next === state.shopLevel) {
      patch = { heroSkillBanner: `商店等级已满（Lv.${MAX_SHOP_LEVEL}）！` };
      logs.push({ type: 'shop', message: `商店等级已达上限 Lv.${MAX_SHOP_LEVEL}，无法继续提升` });
    } else {
      patch = { shopLevel: next, heroSkillBanner: `商店等级提升到 Lv.${next}` };
      logs.push({ type: 'shop', message: `商店等级提升至 Lv.${next}` });
    }
  } else if (effectToken.startsWith('shopLevel-')) {
    const amount = parseInt(effectToken.replace('shopLevel-', ''), 10) || 0;
    const next = Math.max(0, state.shopLevel - amount);
    patch = { shopLevel: next, heroSkillBanner: `商店等级降低至 Lv.${next}。` };
    logs.push({ type: 'event', message: `商店等级 -${amount}，当前 Lv.${next}` });
  } else if (effectToken.startsWith('persuadeLevel+')) {
    const amount = parseInt(effectToken.replace('persuadeLevel+', ''), 10) || 0;
    const next = Math.min(MAX_PERSUADE_LEVEL, state.persuadeLevel + amount);
    if (next === state.persuadeLevel) {
      patch = { heroSkillBanner: '劝降等级已达上限！' };
      logs.push({ type: 'event', message: '劝降等级已达上限' });
    } else {
      patch = { persuadeLevel: next, heroSkillBanner: `劝降等级提升至 Lv.${next}。` };
      logs.push({ type: 'event', message: `劝降等级 +${amount}，当前 Lv.${next}` });
    }
  } else if (effectToken.startsWith('persuadeLevel-')) {
    const amount = parseInt(effectToken.replace('persuadeLevel-', ''), 10) || 0;
    const next = Math.max(1, state.persuadeLevel - amount);
    patch = { persuadeLevel: next, heroSkillBanner: `劝降等级降低至 Lv.${next}。` };
    logs.push({ type: 'event', message: `劝降等级 -${amount}，当前 Lv.${next}` });
  } else if (effectToken.startsWith('persuadeCost-')) {
    const amount = parseInt(effectToken.replace('persuadeCost-', ''), 10) || 0;
    const currentCost = PERSUADE_COST + (state.persuadeCostModifier ?? 0);
    if (currentCost <= MIN_PERSUADE_COST) {
      patch = { heroSkillBanner: `劝降费用已达下限，无法再降低。` };
      logs.push({ type: 'event', message: `劝降费用已达下限（${currentCost} 金币），无法再降低` });
    } else {
      const actualAmount = Math.min(amount, currentCost - MIN_PERSUADE_COST);
      patch = {
        persuadeCostModifier: (state.persuadeCostModifier ?? 0) - actualAmount,
        heroSkillBanner: `劝降费用永久 -${actualAmount}。`,
      };
      logs.push({ type: 'event', message: `劝降费用永久 -${actualAmount}` });
    }

  // --- Spell / hand / backpack stats ---

  } else if (effectToken.startsWith('spellDamage+')) {
    const amount = parseInt(effectToken.replace('spellDamage+', ''), 10) || 0;
    const next = state.permanentSpellDamageBonus + amount;
    patch = { permanentSpellDamageBonus: next, heroSkillBanner: `法术伤害永久 +${amount}（当前 +${next}）。` };
    logs.push({ type: 'event', message: `法术伤害永久 +${amount}` });
  } else if (effectToken.startsWith('spellLifesteal+')) {
    const amount = parseInt(effectToken.replace('spellLifesteal+', ''), 10) || 0;
    const next = state.permanentSpellLifesteal + amount;
    patch = { permanentSpellLifesteal: next, heroSkillBanner: `超杀吸血永久 +${amount}（当前 ${next}）。` };
    logs.push({ type: 'event', message: `超杀吸血永久 +${amount}` });
  } else if (effectToken.startsWith('spellLifesteal-')) {
    const amount = parseInt(effectToken.replace('spellLifesteal-', ''), 10) || 0;
    const next = state.permanentSpellLifesteal - amount;
    patch = { permanentSpellLifesteal: next, heroSkillBanner: `超杀吸血永久 -${amount}（当前 ${next}）。` };
    logs.push({ type: 'event', message: `超杀吸血永久 -${amount}` });
  } else if (effectToken.startsWith('handLimit+')) {
    const amount = parseInt(effectToken.replace('handLimit+', ''), 10) || 0;
    const next = (state.handLimitBonus ?? 0) + amount;
    patch = { handLimitBonus: next, heroSkillBanner: `手牌上限提升至 ${HAND_LIMIT + next}。` };
    logs.push({ type: 'event', message: `手牌上限 +${amount}` });
  } else if (effectToken.startsWith('handLimit-')) {
    const amount = parseInt(effectToken.replace('handLimit-', ''), 10) || 0;
    const next = (state.handLimitBonus ?? 0) - amount;
    patch = { handLimitBonus: next, heroSkillBanner: `手牌上限降低至 ${HAND_LIMIT + next}。` };
    logs.push({ type: 'event', message: `手牌上限 -${amount}` });
  } else if (effectToken.startsWith('backpackSize+')) {
    const amount = parseInt(effectToken.replace('backpackSize+', ''), 10) || 0;
    patch = {
      backpackCapacityModifier: state.backpackCapacityModifier + amount,
      heroSkillBanner: `背包容量永久增加 ${amount}。`,
    };
    logs.push({ type: 'event', message: `背包容量永久 +${amount}` });

  // --- Stun cap ---

  } else if (effectToken.startsWith('stunCap+')) {
    const amount = parseInt(effectToken.replace('stunCap+', ''), 10) || 0;
    const next = Math.min(100, state.stunCap + amount);
    patch = { stunCap: next, heroSkillBanner: `击晕上限提升至 ${next}%。` };
    logs.push({ type: 'event', message: `击晕上限 +${amount}%` });

  // --- Equipment slot bonuses ---

  } else if (effectToken.startsWith('slotLeftDamage+')) {
    const amount = parseInt(effectToken.replace('slotLeftDamage+', ''), 10) || 0;
    patch = {
      equipmentSlotBonuses: {
        ...state.equipmentSlotBonuses,
        equipmentSlot1: {
          ...state.equipmentSlotBonuses.equipmentSlot1,
          damage: state.equipmentSlotBonuses.equipmentSlot1.damage + amount,
        },
      },
    };
    logs.push({ type: 'event', message: `左槽永久伤害 +${amount}` });
  } else if (effectToken.startsWith('slotRightDefense+')) {
    const amount = parseInt(effectToken.replace('slotRightDefense+', ''), 10) || 0;
    patch = {
      equipmentSlotBonuses: {
        ...state.equipmentSlotBonuses,
        equipmentSlot2: {
          ...state.equipmentSlotBonuses.equipmentSlot2,
          shield: state.equipmentSlotBonuses.equipmentSlot2.shield + amount,
        },
      },
    };
    logs.push({ type: 'event', message: `右槽永久护甲 +${amount}` });
  } else if (effectToken.startsWith('slotLeftDefense+')) {
    const amount = parseInt(effectToken.replace('slotLeftDefense+', ''), 10) || 0;
    patch = {
      equipmentSlotBonuses: {
        ...state.equipmentSlotBonuses,
        equipmentSlot1: {
          ...state.equipmentSlotBonuses.equipmentSlot1,
          shield: state.equipmentSlotBonuses.equipmentSlot1.shield + amount,
        },
      },
    };
    logs.push({ type: 'event', message: `左槽永久护甲 +${amount}` });
  } else if (effectToken.startsWith('slotRightDamage+')) {
    const amount = parseInt(effectToken.replace('slotRightDamage+', ''), 10) || 0;
    patch = {
      equipmentSlotBonuses: {
        ...state.equipmentSlotBonuses,
        equipmentSlot2: {
          ...state.equipmentSlotBonuses.equipmentSlot2,
          damage: state.equipmentSlotBonuses.equipmentSlot2.damage + amount,
        },
      },
    };
    logs.push({ type: 'event', message: `右槽永久伤害 +${amount}` });
  } else if (effectToken === 'halveSlotDamageBonus') {
    const s1d = Math.floor(state.equipmentSlotBonuses.equipmentSlot1.damage / 2);
    const s2d = Math.floor(state.equipmentSlotBonuses.equipmentSlot2.damage / 2);
    patch = {
      equipmentSlotBonuses: {
        ...state.equipmentSlotBonuses,
        equipmentSlot1: { ...state.equipmentSlotBonuses.equipmentSlot1, damage: s1d },
        equipmentSlot2: { ...state.equipmentSlotBonuses.equipmentSlot2, damage: s2d },
      },
      heroSkillBanner: '装备栏永久攻击加成减半！',
    };
    logs.push({ type: 'event', message: `所有装备栏永久攻击加成减半（左 ${state.equipmentSlotBonuses.equipmentSlot1.damage}→${s1d}，右 ${state.equipmentSlotBonuses.equipmentSlot2.damage}→${s2d}）` });
  } else if (effectToken === 'halveSpellDamageBonus') {
    const next = Math.floor(state.permanentSpellDamageBonus / 2);
    patch = {
      permanentSpellDamageBonus: next,
      heroSkillBanner: `法术伤害加成减半（${state.permanentSpellDamageBonus}→${next}）！`,
    };
    logs.push({ type: 'event', message: `法术伤害加成减半（${state.permanentSpellDamageBonus}→${next}）` });
  } else if (effectToken === 'halveSlotShieldBonus') {
    const s1s = Math.floor(state.equipmentSlotBonuses.equipmentSlot1.shield / 2);
    const s2s = Math.floor(state.equipmentSlotBonuses.equipmentSlot2.shield / 2);
    patch = {
      equipmentSlotBonuses: {
        ...state.equipmentSlotBonuses,
        equipmentSlot1: { ...state.equipmentSlotBonuses.equipmentSlot1, shield: s1s },
        equipmentSlot2: { ...state.equipmentSlotBonuses.equipmentSlot2, shield: s2s },
      },
      heroSkillBanner: '装备栏永久护甲加成减半！',
    };
    logs.push({ type: 'event', message: `所有装备栏永久护甲加成减半（左 ${state.equipmentSlotBonuses.equipmentSlot1.shield}→${s1s}，右 ${state.equipmentSlotBonuses.equipmentSlot2.shield}→${s2s}）` });

  // --- Amulet / equipment slot capacity ---

  } else if (effectToken === 'amuletCapacity+1') {
    patch = {
      maxAmuletSlots: state.maxAmuletSlots + 1,
      heroSkillBanner: `护符上限提升至 ${state.maxAmuletSlots + 1}。`,
    };
    logs.push({ type: 'event', message: '护符上限 +1' });
  } else if (effectToken === 'amuletCapacity-1') {
    const next = Math.max(1, state.maxAmuletSlots - 1);
    if (next === state.maxAmuletSlots) {
      patch = { heroSkillBanner: '护符上限已为最低值！' };
      logs.push({ type: 'event', message: '护符上限已为最低值' });
    } else {
      patch.maxAmuletSlots = next;
      patch.heroSkillBanner = `护符栏上限降低至 ${next}。`;
      logs.push({ type: 'event', message: `护符栏上限 -1（当前 ${next}）` });
      if (state.amuletSlots.length > next) {
        const kept = state.amuletSlots.slice(state.amuletSlots.length - next);
        patch.amuletSlots = kept;
        const overflow = state.amuletSlots.slice(0, state.amuletSlots.length - next);
        patch.discardedCards = [...state.discardedCards, ...overflow];
        logs.push({ type: 'event', message: `护符栏缩减，${overflow.map(a => a.name).join('、')} 被送入坟场` });
      }
    }
  } else if (effectToken === 'equipSlot1Capacity+1') {
    patch = {
      equipmentSlotCapacity: { ...state.equipmentSlotCapacity, equipmentSlot1: (state.equipmentSlotCapacity.equipmentSlot1 ?? 1) + 1 },
      heroSkillBanner: '左装备栏现在可以装备多件装备了！',
    };
    logs.push({ type: 'event', message: '左装备栏容量 +1' });
  } else if (effectToken === 'equipSlot2Capacity+1') {
    patch = {
      equipmentSlotCapacity: { ...state.equipmentSlotCapacity, equipmentSlot2: (state.equipmentSlotCapacity.equipmentSlot2 ?? 1) + 1 },
      heroSkillBanner: '右装备栏现在可以装备多件装备了！',
    };
    logs.push({ type: 'event', message: '右装备栏容量 +1' });

  // --- Flags / toggles ---

  } else if (effectToken === 'flipToDoubleNextMagic') {
    patch = {
      doubleNextMagic: true,
      heroSkillBanner: '法术回响已激活！下一张法术的效果将触发两次。',
    };
    logs.push({ type: 'event', message: '法术回响已激活，下一张法术的效果将触发两次' });

  } else if (effectToken === 'flipToSpellEcho') {
    let rng = state.rng;
    let echoId: string;
    [echoId, rng] = nextId(rng, 'spell-echo');
    const echoCard: GameCardData = {
      id: echoId,
      type: 'magic',
      name: '法术回响',
      value: 0,
      image: state.currentEventCard?.image ?? skillScrollImage,
      magicType: 'permanent',
      magicEffect: 'double-next-magic',
      description: '永久魔法：下一张法术的效果将触发两次。',
      shortDescription: '下一张法术触发两次',
      recycleDelay: 1,
    };
    patch = {
      rng,
      heroSkillBanner: '时空收缩翻转为「法术回响」，已放入背包。',
    };
    addCardToBackpackPatch(state, patch, echoCard);
    const hasFlipGold = applyFlipGoldBonus(state, patch, logs);
    logs.push({ type: 'event', message: '时空收缩翻转为「法术回响」永久魔法，已放入背包' });
    emitEvents.push({
      event: 'event:cardTransformed',
      payload: {
        fromCard: state.currentEventCard as any,
        toCard: echoCard as any,
        message: '时空收缩翻转为「法术回响」…',
        hasFlipGold,
      },
    });

  } else if (effectToken === 'permanentskill') {
    const skills = ['Iron Skin', 'Weapon Master'];
    const [randomSkill, rngAfterSkill] = pickRandom(skills, state.rng);
    patch = { permanentSkills: [...state.permanentSkills, randomSkill], rng: rngAfterSkill };
    logs.push({ type: 'event', message: `获得永久技能 ${randomSkill}` });
  } else if (effectToken === 'weapon') {
    // Placeholder — no state change
  } else if (effectToken === 'noop') {
    // Intentional no-op

  // --- Temp slot bonuses ---

  } else if (effectToken.startsWith('allSlotTempAttack:')) {
    const amount = parseInt(effectToken.replace('allSlotTempAttack:', ''), 10) || 0;
    patch = {
      slotTempAttack: {
        equipmentSlot1: (state.slotTempAttack?.equipmentSlot1 ?? 0) + amount,
        equipmentSlot2: (state.slotTempAttack?.equipmentSlot2 ?? 0) + amount,
      },
      heroSkillBanner: `全装备栏临时攻击 +${amount}！`,
    };
    const amuletFx = computeAmuletEffects(state.amuletSlots as GameCardData[]);
    if (amuletFx.persuadeOnTempAttackCount > 0) {
      const pBonus = amuletFx.persuadeOnTempAttackBonus;
      patch.persuadeAmuletBonus = (state.persuadeAmuletBonus ?? 0) + pBonus;
      logs.push({ type: 'equip', message: `怀柔之印：下次劝降率 +${pBonus}%` });
    }
    logs.push({ type: 'event', message: `全装备栏临时攻击 +${amount}` });
  } else if (effectToken.startsWith('allSlotTempArmor:')) {
    const amount = parseInt(effectToken.replace('allSlotTempArmor:', ''), 10) || 0;
    patch = {
      slotTempArmor: {
        equipmentSlot1: (state.slotTempArmor?.equipmentSlot1 ?? 0) + amount,
        equipmentSlot2: (state.slotTempArmor?.equipmentSlot2 ?? 0) + amount,
      },
      heroSkillBanner: `全装备栏临时护甲 +${amount}！`,
    };
    const amuletFx = computeAmuletEffects(state.amuletSlots as GameCardData[]);
    if (amuletFx.persuadeOnTempAttackCount > 0) {
      const pBonus = amuletFx.persuadeOnTempAttackBonus;
      patch.persuadeAmuletBonus = (state.persuadeAmuletBonus ?? 0) + pBonus;
      logs.push({ type: 'equip', message: `怀柔之印：下次劝降率 +${pBonus}%` });
    }
    logs.push({ type: 'event', message: `全装备栏临时护甲 +${amount}` });

  // --- Persuade temp modifiers ---

  } else if (effectToken.startsWith('persuadeNextCostReduction:')) {
    const amount = parseInt(effectToken.replace('persuadeNextCostReduction:', ''), 10) || 0;
    const current = state.persuadeDiscount ?? { costReduction: 0, rateBonus: 0 };
    patch = {
      persuadeDiscount: { ...current, costReduction: current.costReduction + amount },
      heroSkillBanner: `下次劝降费用减少 ${amount} 金币。`,
    };
    logs.push({ type: 'event', message: `下次劝降费用 -${amount}` });
  } else if (effectToken.startsWith('persuadeNextRatePenalty:')) {
    const amount = parseInt(effectToken.replace('persuadeNextRatePenalty:', ''), 10) || 0;
    const current = state.persuadeDiscount ?? { costReduction: 0, rateBonus: 0 };
    patch = {
      persuadeDiscount: { ...current, rateBonus: current.rateBonus - amount },
      heroSkillBanner: `下次劝降成功率 -${amount}%。`,
    };
    logs.push({ type: 'event', message: `下次劝降率 -${amount}%` });
  } else if (effectToken.startsWith('persuadeNextCostIncrease:')) {
    const amount = parseInt(effectToken.replace('persuadeNextCostIncrease:', ''), 10) || 0;
    const current = state.persuadeDiscount ?? { costReduction: 0, rateBonus: 0 };
    patch = {
      persuadeDiscount: { ...current, costReduction: current.costReduction - amount },
      heroSkillBanner: `下次劝降费用增加 ${amount} 金币。`,
    };
    logs.push({ type: 'event', message: `下次劝降费用 +${amount}` });
  } else if (effectToken === 'persuadeNextFree') {
    patch = {
      persuadeDiscount: { costReduction: 999, rateBonus: 0 },
      heroSkillBanner: '下次劝降免费！',
    };
    logs.push({ type: 'event', message: '下次劝降免费' });

  // --- Persuade eternal relics ---

  } else if (effectToken === 'persuadeSameTargetCostHalve') {
    patch = {
      persuadeSameTargetCostHalve: true,
      heroSkillBanner: '获得永恒护符·连劝减半！',
    };
    if (!hasEternalRelic(state.eternalRelics, 'persuade-same-halve')) {
      patch.eternalRelics = [...state.eternalRelics, getEternalRelic('persuade-same-halve')];
    }
    logs.push({ type: 'event', message: '连续劝降同一怪物，第二次费用减半' });
  } else if (effectToken.startsWith('persuadeRaceBonus:')) {
    const parts = effectToken.replace('persuadeRaceBonus:', '').split(':');
    const races = parts[0].split(',');
    const bonus = parseInt(parts[1], 10) || 20;
    const next = { ...state.persuadeRaceBonus };
    races.forEach(race => { next[race] = (next[race] ?? 0) + bonus; });
    patch = {
      persuadeRaceBonus: next,
      heroSkillBanner: `获得永恒护符·种族怀柔！${races.join('、')} 劝降率 +${bonus}%！`,
    };
    if (!hasEternalRelic(state.eternalRelics, 'persuade-race-bonus')) {
      patch.eternalRelics = [...state.eternalRelics, getEternalRelic('persuade-race-bonus')];
    }
    logs.push({ type: 'event', message: `${races.join('、')} 劝降成功率 +${bonus}%` });
  } else if (effectToken.startsWith('persuadeSuccessDurabilityBonus+')) {
    const amount = parseInt(effectToken.replace('persuadeSuccessDurabilityBonus+', ''), 10) || 1;
    patch = {
      persuadeSuccessDurabilityBonus: state.persuadeSuccessDurabilityBonus + amount,
      heroSkillBanner: `获得永恒护符·劝降耐久！起始耐久 +${amount}！`,
    };
    if (!hasEternalRelic(state.eternalRelics, 'persuade-durability-bonus')) {
      patch.eternalRelics = [...state.eternalRelics, getEternalRelic('persuade-durability-bonus')];
    }
    logs.push({ type: 'event', message: `劝降成功的怪物起始耐久 +${amount}` });

  // --- Active row monster attack ---

  } else if (effectToken.startsWith('activeRowMonsterAttack-')) {
    const amount = parseInt(effectToken.replace('activeRowMonsterAttack-', ''), 10) || 0;
    const newActiveCards = state.activeCards.map(card => {
      if (!card || card.type !== 'monster') return card;
      const newAttack = Math.max(0, ((card as any).attack ?? card.value) - amount);
      return { ...card, attack: newAttack, value: newAttack };
    }) as ActiveRowSlots;
    patch = {
      activeCards: newActiveCards,
      heroSkillBanner: `激活行所有怪物攻击力 -${amount}。`,
    };
    logs.push({ type: 'event', message: `激活行所有怪物攻击力 -${amount}` });

  // --- Upgrade persuade amulets ---

  } else if (effectToken === 'upgradePersuadeAmulets') {
    let upgraded = false;
    const newAmulets = state.amuletSlots.map(amulet => {
      if (amulet.amuletEffect === 'persuade-on-temp-attack' && (amulet.upgradeLevel ?? 0) < 1) {
        upgraded = true;
        logs.push({ type: 'event', message: '怀柔之印升级：每获得一次临时攻击或临时护甲加成，下一次劝降率 +20%' });
        return {
          ...amulet,
          upgradeLevel: 1,
          description: '（已升级）每获得一次临时攻击或临时护甲加成，下一次劝降率 +10%。',
          shortDescription: '（已升级）每获临时攻/护：下次劝降率 +10%',
        };
      }
      if (amulet.amuletEffect === 'persuade-grant-recycle-fetch' && (amulet.upgradeLevel ?? 0) < 1) {
        upgraded = true;
        logs.push({ type: 'event', message: '劝降归袋符升级：每劝降一次，将两张「归袋抽引」加入手牌' });
        return {
          ...amulet,
          upgradeLevel: 1,
          description: '（已升级）每劝降一次，将两张「归袋抽引」加入手牌（一次性：从回收袋随机 1 张牌加入手牌）。',
          shortDescription: '（已升级）每劝降：手牌 +2 张「归袋抽引」',
        };
      }
      return amulet;
    });
    if (upgraded) {
      patch = { amuletSlots: newAmulets as typeof state.amuletSlots };
    }

  // --- Discard hand (pure state-only version) ---

  } else if (effectToken === 'discardHandAll') {
    // Curses are immune to forced discard — they stay in hand.
    const kept = state.handCards.filter(c => c.type === 'curse');
    const eligible = state.handCards.filter(c => c.type !== 'curse');
    const toRecycle = eligible.filter(c => isRecyclableFromHand(c));
    const toGraveyard = eligible.filter(c => !isRecyclableFromHand(c));
    patch = {
      handCards: kept,
      discardedCards: [...state.discardedCards, ...toGraveyard],
      permanentMagicRecycleBag: [
        ...state.permanentMagicRecycleBag,
        ...toRecycle.map(c => ({ ...c, _recycleWaits: c.recycleDelay ?? 1 })),
      ],
    };
    logs.push({ type: 'event', message: '弃回所有手牌' });

  // --- Backpack size decrease (handles overflow via RNG eviction) ---

  } else if (effectToken.startsWith('backpackSize-')) {
    const amount = parseInt(effectToken.replace('backpackSize-', ''), 10) || 0;
    patch = { backpackCapacityModifier: state.backpackCapacityModifier - amount };
    logs.push({ type: 'event', message: `背包容量 -${amount}` });
    const newCapacity = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier - amount);
    const overflow = state.backpackItems.length - newCapacity;
    if (overflow > 0) {
      let rng = state.rng;
      let indices: number[];
      [indices, rng] = rngShuffle(state.backpackItems.map((_: unknown, i: number) => i), rng);
      patch.rng = rng;
      const evictedIndices = new Set(indices.slice(0, overflow));
      const evicted = indices.slice(0, overflow).map(i => state.backpackItems[i]);
      patch.backpackItems = state.backpackItems.filter((_: unknown, i: number) => !evictedIndices.has(i));
      patch.permanentMagicRecycleBag = [...state.permanentMagicRecycleBag, ...evicted];
      patch.heroSkillBanner = `背包容量降低 ${amount}，${evicted.map((c: any) => c.name).join('、')} 被放入回收袋。`;
      logs.push({ type: 'event', message: `背包容量永久 -${amount}，${evicted.length} 张多余的牌放入回收袋` });
      emitEvents.push({ event: 'event:backpackOverflow', payload: { cards: evicted as any } });
    } else {
      patch.heroSkillBanner = `背包容量永久降低 ${amount}。`;
    }

  // --- Equipment slot bonuses (Phase 5A) ---

  } else if (effectToken === 'allSlotDamage-1') {
    patch = {
      equipmentSlotBonuses: {
        ...state.equipmentSlotBonuses,
        equipmentSlot1: { ...state.equipmentSlotBonuses.equipmentSlot1, damage: state.equipmentSlotBonuses.equipmentSlot1.damage - 1 },
        equipmentSlot2: { ...state.equipmentSlotBonuses.equipmentSlot2, damage: state.equipmentSlotBonuses.equipmentSlot2.damage - 1 },
      },
      heroSkillBanner: '所有装备栏永久攻击 -1！',
    };
    logs.push({ type: 'event', message: '所有装备栏永久攻击 -1' });
  } else if (effectToken === 'allSlotShield-1') {
    patch = {
      equipmentSlotBonuses: {
        ...state.equipmentSlotBonuses,
        equipmentSlot1: { ...state.equipmentSlotBonuses.equipmentSlot1, shield: state.equipmentSlotBonuses.equipmentSlot1.shield - 1 },
        equipmentSlot2: { ...state.equipmentSlotBonuses.equipmentSlot2, shield: state.equipmentSlotBonuses.equipmentSlot2.shield - 1 },
      },
      heroSkillBanner: '所有装备栏永久护甲 -1！',
    };
    logs.push({ type: 'event', message: '所有装备栏永久护甲 -1' });

  // --- Equipment swap (Phase 5A) ---

  } else if (effectToken === 'swapEquipmentSlots') {
    const left = state.equipmentSlot1;
    const right = state.equipmentSlot2;
    patch = {
      equipmentSlot1: right ? { ...right, fromSlot: 'equipmentSlot1' as EquipmentSlotId } : null,
      equipmentSlot2: left ? { ...left, fromSlot: 'equipmentSlot2' as EquipmentSlotId } : null,
      equipmentSlot1Reserve: [...state.equipmentSlot2Reserve],
      equipmentSlot2Reserve: [...state.equipmentSlot1Reserve],
    };
    logs.push({ type: 'event', message: '交换左右装备槽' });

  // --- Equipment repair (Phase 5A) ---

  } else if (effectToken === 'repairAll') {
    const e1 = state.equipmentSlot1;
    const e2 = state.equipmentSlot2;
    let repaired = false;
    if (e1 && e1.durability != null && e1.maxDurability != null && e1.durability < e1.maxDurability) {
      patch.equipmentSlot1 = { ...e1, durability: e1.maxDurability };
      repaired = true;
    }
    if (e2 && e2.durability != null && e2.maxDurability != null && e2.durability < e2.maxDurability) {
      patch.equipmentSlot2 = { ...e2, durability: e2.maxDurability };
      repaired = true;
    }
    if (repaired) {
      patch.heroSkillBanner = '所有装备耐久已完全恢复！';
      logs.push({ type: 'event', message: '所有装备耐久完全恢复' });
    } else {
      patch.heroSkillBanner = '没有装备需要修复。';
    }
  } else if (effectToken === 'repairAllDurability+1') {
    const e1 = state.equipmentSlot1;
    const e2 = state.equipmentSlot2;
    let repaired = false;
    if (e1 && e1.durability != null && e1.maxDurability != null) {
      patch.equipmentSlot1 = { ...e1, durability: Math.min(e1.maxDurability, e1.durability + 1) };
      if (e1.durability < e1.maxDurability) repaired = true;
    }
    if (e2 && e2.durability != null && e2.maxDurability != null) {
      patch.equipmentSlot2 = { ...e2, durability: Math.min(e2.maxDurability, e2.durability + 1) };
      if (e2.durability < e2.maxDurability) repaired = true;
    }
    if (repaired) {
      patch.heroSkillBanner = '所有装备耐久 +1！';
      logs.push({ type: 'event', message: '所有装备耐久 +1' });
    } else {
      patch.heroSkillBanner = '没有装备需要修复。';
    }

  // --- Remove all amulets (Phase 5A) ---

  } else if (effectToken === 'removeAllAmulets') {
    if (state.amuletSlots.length > 0) {
      // Aura reversal is handled centrally by `postProcessAmuletAura` in
      // reducer.ts — clearing amuletSlots is enough.
      //
      // Perm-flagged amulets (附魔祭坛 加 Perm 2 / native permEquipment / 凡化咒
      // 未剥离) MUST route to the permanent magic recycle bag; non-Perm amulets
      // go to the graveyard. Mirrors the wraith-curse routing in
      // `turn.ts:reduceMonsterTurnEndEffects` and the equipment-destruction
      // contract in `equipment-effects.ts`.
      const permAmulets: GameCardData[] = [];
      const nonPermAmulets: GameCardData[] = [];
      for (const a of state.amuletSlots) {
        if (cardHasPermFlag(a as GameCardData)) permAmulets.push(a as GameCardData);
        else nonPermAmulets.push(a as GameCardData);
      }
      patch.discardedCards = [...state.discardedCards, ...nonPermAmulets];
      patch.amuletSlots = [];
      for (const card of permAmulets) {
        allEnqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card });
      }
      patch.heroSkillBanner = '所有护符都被粉碎了。';
      logs.push({ type: 'event', message: `粉碎 ${state.amuletSlots.length} 枚护符` });
    } else {
      patch.heroSkillBanner = '你没有佩戴护符。';
    }

  // --- Phase 1A: Equipment-focused event tokens ---

  } else if (effectToken === 'slotLeftDurMax+1' || effectToken === 'slotRightDurMax+1') {
    const slotId: EquipmentSlotId = effectToken === 'slotLeftDurMax+1' ? 'equipmentSlot1' : 'equipmentSlot2';
    const label = effectToken === 'slotLeftDurMax+1' ? '左' : '右';
    const item = slotId === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
    if (item && item.durability != null) {
      const maxDur = item.maxDurability ?? item.durability ?? 0;
      const updated = { ...item, maxDurability: maxDur + 1 };
      if (slotId === 'equipmentSlot1') patch.equipmentSlot1 = updated;
      else patch.equipmentSlot2 = updated;
      patch.heroSkillBanner = `${item.name} 耐久上限 +1！`;
      logs.push({ type: 'event', message: `${item.name} 耐久上限 +1（${maxDur} → ${maxDur + 1}）` });
    } else {
      patch.heroSkillBanner = `${label}装备栏没有装备或不具有耐久属性。`;
    }

  } else if (effectToken.startsWith('repairSlot:')) {
    const parts = effectToken.split(':');
    const target = parts[1];
    const amount = parseInt(parts[2], 10) || 1;
    const repairOne = (slotId: EquipmentSlotId): boolean => {
      const item = slotId === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
      if (item && item.durability != null && item.maxDurability != null && item.durability < item.maxDurability) {
        const updated = { ...item, durability: Math.min(item.maxDurability, item.durability + amount) };
        if (slotId === 'equipmentSlot1') patch.equipmentSlot1 = updated;
        else patch.equipmentSlot2 = updated;
        logs.push({ type: 'event', message: `${item.name} 恢复 ${amount} 点耐久` });
        return true;
      }
      return false;
    };
    if (target === 'left') {
      if (!repairOne('equipmentSlot1')) patch.heroSkillBanner = '左装备栏为空或耐久已满。';
    } else if (target === 'right') {
      if (!repairOne('equipmentSlot2')) patch.heroSkillBanner = '右装备栏为空或耐久已满。';
    } else if (target === 'both') {
      const l = repairOne('equipmentSlot1');
      const r = repairOne('equipmentSlot2');
      if (!l && !r) patch.heroSkillBanner = '没有装备需要恢复耐久。';
    }

  } else if (effectToken === 'slotLeftExtraAttack' || effectToken === 'slotRightExtraAttack') {
    const targetSlot: EquipmentSlotId = effectToken === 'slotLeftExtraAttack' ? 'equipmentSlot1' : 'equipmentSlot2';
    const otherSlot: EquipmentSlotId = effectToken === 'slotLeftExtraAttack' ? 'equipmentSlot2' : 'equipmentSlot1';
    const label = effectToken === 'slotLeftExtraAttack' ? '左' : '右';
    const item = targetSlot === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
    if (item && (item.type === 'weapon' || item.type === 'monster')) {
      patch.gambitExtraActive = true;
      patch.gambitExtraPerSlot = (state.gambitExtraPerSlot ?? 0) + 1;
      patch.gambitSlotUsed = {
        ...state.gambitSlotUsed,
        [otherSlot]: ((state.gambitSlotUsed as any)?.[otherSlot] ?? 0) + 1,
      };
      patch.heroSkillBanner = `${item.name} 本回合可多攻击一次！`;
      logs.push({ type: 'event', message: `${label}装备栏本回合攻击次数 +1` });
    } else {
      patch.heroSkillBanner = `${label}装备栏没有可攻击的武器。`;
    }

  } else if (effectToken === 'weaponUpgrade' || effectToken === 'weaponUpgrade2') {
    const upgradAmount = effectToken === 'weaponUpgrade2' ? 2 : 2;
    if (state.equipmentSlot1?.type === 'weapon') {
      patch.equipmentSlot1 = { ...state.equipmentSlot1, value: state.equipmentSlot1.value + upgradAmount };
    } else if (state.equipmentSlot2?.type === 'weapon') {
      patch.equipmentSlot2 = { ...state.equipmentSlot2, value: state.equipmentSlot2.value + upgradAmount };
    }
    patch.heroSkillBanner = `武器攻击力 +${upgradAmount}！`;
    logs.push({ type: 'event', message: `武器攻击力 +${upgradAmount}` });

  } else if (effectToken === 'shieldUpgrade2') {
    if (state.equipmentSlot1?.type === 'shield') {
      const newArmorMax = (state.equipmentSlot1.armorMax ?? state.equipmentSlot1.value) + 2;
      const { armor: _, armorBonusDamaged: _bd, ...rest } = state.equipmentSlot1;
      patch.equipmentSlot1 = { ...rest, value: state.equipmentSlot1.value + 2, armorMax: newArmorMax } as typeof state.equipmentSlot1;
    } else if (state.equipmentSlot2?.type === 'shield') {
      const newArmorMax = (state.equipmentSlot2.armorMax ?? state.equipmentSlot2.value) + 2;
      const { armor: _, armorBonusDamaged: _bd, ...rest } = state.equipmentSlot2;
      patch.equipmentSlot2 = { ...rest, value: state.equipmentSlot2.value + 2, armorMax: newArmorMax } as typeof state.equipmentSlot2;
    }
    patch.heroSkillBanner = '盾牌防御力 +2！';
    logs.push({ type: 'event', message: '盾牌防御力 +2' });

  } else if (effectToken === 'restoreShield') {
    const shields = state.discardedCards.filter(c => c.type === 'shield');
    if (shields.length > 0) {
      const shield = shields[shields.length - 1];
      const { armor: _omitArmor, armorBonusDamaged: _omitBonusDmg, ...shieldRest } = shield;
      const restoredShield: EquipmentItem = {
        ...shieldRest,
        type: 'shield',
        durability: 3,
        maxDurability: 3,
        armorMax: shield.armorMax ?? shield.value,
      };
      if (!state.equipmentSlot1) {
        patch.equipmentSlot1 = restoredShield;
        logs.push({ type: 'event', message: `从坟场恢复盾牌「${shield.name}」并装备至左槽` });
      } else if (!state.equipmentSlot2) {
        patch.equipmentSlot2 = restoredShield;
        logs.push({ type: 'event', message: `从坟场恢复盾牌「${shield.name}」并装备至右槽` });
      } else {
        logs.push({ type: 'event', message: '没有空槽位，无法恢复盾牌' });
      }
      patch.discardedCards = state.discardedCards.filter(c => c.id !== shield.id);
    } else {
      logs.push({ type: 'event', message: '坟场没有盾牌可恢复' });
    }

  } else if (effectToken === 'bloodEmpower') {
    const weapon1 = state.equipmentSlot1;
    const weapon2 = state.equipmentSlot2;
    if (weapon1 && (weapon1.type === 'weapon' || weapon1.type === 'monster')) {
      patch.equipmentSlot1 = { ...weapon1, value: weapon1.value + 2 };
      patch.heroSkillBanner = `${weapon1.name} 攻击 +2！`;
      logs.push({ type: 'event', message: `${weapon1.name} 攻击 +2` });
    } else if (weapon2 && (weapon2.type === 'weapon' || weapon2.type === 'monster')) {
      patch.equipmentSlot2 = { ...weapon2, value: weapon2.value + 2 };
      patch.heroSkillBanner = `${weapon2.name} 攻击 +2！`;
      logs.push({ type: 'event', message: `${weapon2.name} 攻击 +2` });
    } else {
      patch.gold = state.gold + 5;
      patch.heroSkillBanner = '无武器，获得 5 金币。';
      logs.push({ type: 'event', message: '无武器，获得 5 金币' });
    }

  } else if (effectToken === 'equipKnight') {
    const equipmentCards = state.classDeck.filter(c => c.type === 'weapon' || c.type === 'shield');
    if (equipmentCards.length > 0) {
      // Class deck is an infinite template — pick a random equipment, then
      // clone it with a fresh id so the player gets a unique copy without
      // shrinking the pool.
      const [original, rngAfterPick] = pickRandom(equipmentCards, state.rng);
      const [equipment, rngAfterClone] = cloneClassCardWithFreshId(original, rngAfterPick);
      if (!state.equipmentSlot1) {
        patch.equipmentSlot1 = { ...equipment } as EquipmentItem;
      } else if (!state.equipmentSlot2) {
        patch.equipmentSlot2 = { ...equipment } as EquipmentItem;
      }
      patch.rng = rngAfterClone;
      patch.heroSkillBanner = `随机装备了 ${equipment.name}！`;
      logs.push({ type: 'event', message: `随机装备 ${equipment.name}` });
    } else {
      patch.heroSkillBanner = '职业牌组中没有装备可用。';
    }

  } else if (effectToken === 'discardCurrentLeftForGold+15' || effectToken === 'discardCurrentRightForGold+15') {
    const slotId: EquipmentSlotId = effectToken === 'discardCurrentLeftForGold+15' ? 'equipmentSlot1' : 'equipmentSlot2';
    const item = slotId === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
    if (item) {
      const card = item as GameCardData;
      const sideEffects: SideEffect[] = [];
      const enqueuedActions: GameAction[] = [];

      applyEquipDestroyLastWords(card, slotId, state, patch, sideEffects, enqueuedActions);

      const isMonsterEquip = card.type === 'monster';
      const nativeRevive = isMonsterEquip && card.hasRevive && !card.reviveUsed;
      const equipRevive = card.hasEquipmentRevive && !card.equipmentReviveUsed;
      const label = slotId === 'equipmentSlot1' ? '左' : '右';

      if (nativeRevive || equipRevive) {
        const revivedItem = nativeRevive
          ? { ...card, durability: 1, reviveUsed: true }
          : { ...card, durability: 1, equipmentReviveUsed: true };
        patch[slotId] = revivedItem as EquipmentItem;
        sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 复生！以 1 耐久复活！` } });
        sideEffects.push({ event: 'ui:banner', payload: { text: `${card.name} 复生了！` } });
        patch.heroSkillBanner = `${card.name} 复生了！`;
        logs.push({ type: 'event', message: `献祭${label}槽装备失败，${card.name} 复生了` });
      } else {
        enqueuedActions.push({ type: 'DISPOSE_EQUIPMENT_CARD', card: { ...card } as GameCardData, isDestruction: true });
        const reserve = slotId === 'equipmentSlot1' ? state.equipmentSlot1Reserve : state.equipmentSlot2Reserve;
        if (reserve.length > 0) {
          const promoted = reserve[reserve.length - 1];
          if (slotId === 'equipmentSlot1') {
            patch.equipmentSlot1 = promoted;
            patch.equipmentSlot1Reserve = reserve.slice(0, -1);
          } else {
            patch.equipmentSlot2 = promoted;
            patch.equipmentSlot2Reserve = reserve.slice(0, -1);
          }
        } else {
          patch[slotId] = null;
        }
        patch.gold = (patch.gold ?? state.gold) + 15;
        patch.heroSkillBanner = `献祭了当前${label}手装备，获得 15 金币！`;
        logs.push({ type: 'event', message: `献祭当前${label}槽装备获得 15 金币` });
      }

      allEnqueuedActions.push(...enqueuedActions);
      allRawSideEffects.push(...sideEffects);
    }

  } else if (effectToken === 'discardAllLeftForGold+10' || effectToken === 'discardAllRightForGold+10') {
    const slotId: EquipmentSlotId = effectToken === 'discardAllLeftForGold+10' ? 'equipmentSlot1' : 'equipmentSlot2';
    const item = slotId === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
    if (item) {
      const sideEffects: SideEffect[] = [];
      const enqueuedActions: GameAction[] = [];
      let destroyedCount = 0;
      const destroyed: string[] = [];
      const revived: string[] = [];

      const processItem = (card: GameCardData) => {
        applyEquipDestroyLastWords(card, slotId, state, patch, sideEffects, enqueuedActions);
        const isMonsterEquip = card.type === 'monster';
        const nativeRevive = isMonsterEquip && card.hasRevive && !card.reviveUsed;
        const equipRevive = card.hasEquipmentRevive && !card.equipmentReviveUsed;
        if (nativeRevive || equipRevive) {
          sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 复生！以 1 耐久复活！` } });
          sideEffects.push({ event: 'ui:banner', payload: { text: `${card.name} 复生了！` } });
          revived.push(card.name);
          return nativeRevive
            ? { ...card, durability: 1, reviveUsed: true }
            : { ...card, durability: 1, equipmentReviveUsed: true };
        }
        destroyed.push(card.name);
        destroyedCount++;
        enqueuedActions.push({ type: 'DISPOSE_EQUIPMENT_CARD', card: { ...card } as GameCardData, isDestruction: true });
        return null;
      };

      const survivedMain = processItem(item as GameCardData);
      const reserve = slotId === 'equipmentSlot1' ? state.equipmentSlot1Reserve : state.equipmentSlot2Reserve;
      const survivedReserve: GameCardData[] = [];
      for (const reserveItem of reserve) {
        const survived = processItem(reserveItem as GameCardData);
        if (survived) survivedReserve.push(survived);
      }

      if (slotId === 'equipmentSlot1') {
        patch.equipmentSlot1 = (survivedMain ?? (survivedReserve.length > 0 ? survivedReserve.shift()! : null)) as EquipmentItem | null;
        patch.equipmentSlot1Reserve = survivedReserve as EquipmentItem[];
      } else {
        patch.equipmentSlot2 = (survivedMain ?? (survivedReserve.length > 0 ? survivedReserve.shift()! : null)) as EquipmentItem | null;
        patch.equipmentSlot2Reserve = survivedReserve as EquipmentItem[];
      }

      const totalGold = destroyedCount * 10;
      patch.gold = (patch.gold ?? state.gold) + totalGold;
      const label = slotId === 'equipmentSlot1' ? '左' : '右';
      const reviveNote = revived.length > 0 ? `（${revived.join('、')} 复生）` : '';
      patch.heroSkillBanner = `献祭了 ${destroyedCount} 件${label}手装备，共获得 ${totalGold} 金币！${reviveNote}`;
      logs.push({ type: 'event', message: `献祭所有${label}槽装备（${destroyedCount} 件）获得 ${totalGold} 金币${reviveNote}` });

      allEnqueuedActions.push(...enqueuedActions);
      allRawSideEffects.push(...sideEffects);
    }

  } else if (effectToken === 'amuletsToGold+10') {
    if (state.amuletSlots.length > 0) {
      // Aura reversal is handled centrally by `postProcessAmuletAura` in
      // reducer.ts — clearing amuletSlots is enough.
      const payout = 10 * state.amuletSlots.length;
      patch.discardedCards = [...state.discardedCards, ...state.amuletSlots];
      patch.amuletSlots = [];
      patch.gold = state.gold + payout;
      patch.heroSkillBanner = `${state.amuletSlots.length} 枚护符转化为 ${payout} 金币！`;
      logs.push({ type: 'amulet', message: `${state.amuletSlots.length} 枚护符转化为 ${payout} 金币` });
    } else {
      patch.heroSkillBanner = '你没有佩戴护符。';
    }

  // --- Phase 1B: Card-zone event tokens ---

  } else if (effectToken === 'grantAmuletPerm') {
    // Defer to UI: hook will open PermGrantModal (sourceType: 'amulet-perm-grant')
    // for the player to choose which equipped amulet receives Perm 2.
    emitEvents.push({ event: 'event:requestEventInteraction', payload: { token: effectToken, data: {} } });

  } else if (effectToken === 'recycleBagDiscover') {
    const recycled = state.permanentMagicRecycleBag;
    if (recycled.length > 0) {
      const [picked, rngAfterPick] = pickRandom(recycled, state.rng);
      patch.rng = rngAfterPick;
      patch.permanentMagicRecycleBag = state.permanentMagicRecycleBag.filter(c => c.id !== picked.id);
      const backpackCap = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier);
      if (state.backpackItems.length < backpackCap) {
        patch.backpackItems = [picked, ...state.backpackItems];
      } else {
        patch.permanentMagicRecycleBag = patch.permanentMagicRecycleBag;
      }
      patch.heroSkillBanner = `从回收袋获得了 ${picked.name}！`;
      logs.push({ type: 'event', message: `从回收袋发现 ${picked.name}，放入背包` });
    } else {
      patch.heroSkillBanner = '回收袋中没有卡牌。';
      logs.push({ type: 'event', message: '回收袋为空' });
    }

  } else if (effectToken === 'recycleBagMagicToHand:2') {
    const recycled = state.permanentMagicRecycleBag;
    const magicInBag = recycled.filter(c => c.type === 'magic' || c.type === 'hero-magic');
    if (magicInBag.length > 0) {
      const toMove = magicInBag.slice(0, 2);
      const movedIds = new Set(toMove.map(c => c.id));
      patch.permanentMagicRecycleBag = state.permanentMagicRecycleBag.filter(c => !movedIds.has(c.id));
      patch.handCards = [...state.handCards, ...toMove];
      patch.heroSkillBanner = `从回收袋取回了 ${toMove.map(c => c.name).join('、')}！`;
      logs.push({ type: 'event', message: `从回收袋取回 ${toMove.length} 张魔法卡到手牌` });
    } else {
      patch.heroSkillBanner = '回收袋中没有魔法卡。';
      logs.push({ type: 'event', message: '回收袋中没有魔法卡' });
    }

  } else if (effectToken.startsWith('drawClassToHand:')) {
    const count = parseInt(effectToken.replace('drawClassToHand:', ''), 10) || 2;
    if (state.classDeck.length === 0) {
      patch.heroSkillBanner = '专属牌堆已空，无法抽取。';
      logs.push({ type: 'event', message: '专属牌堆已空' });
    } else {
      // Class deck is an infinite template; sample distinct-by-name candidates
      // and clone them with fresh ids so the pool is not consumed.
      const [sampled, rngAfterSample] = sampleDistinctByName(state.classDeck, count, state.rng, rngShuffle);
      const [drawn, rngAfterClone] = cloneClassCardsWithFreshIds(sampled, rngAfterSample);
      patch.rng = rngAfterClone;
      patch.handCards = [...state.handCards, ...drawn];
      patch.heroSkillBanner = `获得了 ${drawn.map(c => c.name).join('、')}！`;
      logs.push({ type: 'event', message: `${drawn.length} 张专属牌直接加入手牌` });
    }

  } else if (effectToken === 'drawClassHeroMagic:1') {
    // Class deck is an infinite template; pick (don't remove) and clone with
    // a fresh id so the player gets a unique copy.
    const heroMagicCards = state.classDeck.filter(c => c.type === 'hero-magic');
    const backpackCap = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier);
    const sourcePool = heroMagicCards.length > 0 ? heroMagicCards : state.classDeck;
    if (sourcePool.length > 0) {
      const original = sourcePool[0];
      const [drawn, rngAfterClone] = cloneClassCardWithFreshId(original, state.rng);
      patch.rng = rngAfterClone;
      if (state.backpackItems.length < backpackCap) {
        patch.backpackItems = [drawn, ...state.backpackItems];
      } else {
        patch.permanentMagicRecycleBag = [...state.permanentMagicRecycleBag, { ...drawn, _recycleWaits: drawn.recycleDelay ?? 1 }];
      }
      if (heroMagicCards.length > 0) {
        patch.heroSkillBanner = '获得了英雄魔法卡！';
        logs.push({ type: 'event', message: `获得 1 张英雄魔法` });
      } else {
        patch.heroSkillBanner = '专属牌堆中没有英雄魔法卡。';
        logs.push({ type: 'event', message: `专属牌堆没有英雄魔法，改为获得 1 张专属牌` });
      }
    } else {
      patch.heroSkillBanner = '专属牌堆中没有英雄魔法卡。';
    }

  } else if (effectToken === 'recycleToBackpack') {
    const recycled = state.permanentMagicRecycleBag;
    if (recycled.length > 0) {
      const readyCards: GameCardData[] = [];
      const waitingCards: GameCardData[] = [];
      for (const card of recycled) {
        const waits = ((card as GameCardData & { _recycleWaits?: number })._recycleWaits ?? 1) - 1;
        if (waits <= 0) {
          const { _recycleWaits, ...clean } = card as GameCardData & { _recycleWaits?: number };
          readyCards.push(clean as GameCardData);
        } else {
          waitingCards.push({ ...card, _recycleWaits: waits } as GameCardData);
        }
      }
      const cap = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier);
      const available = cap - state.backpackItems.length;
      const toAdd = readyCards.slice(0, Math.max(0, available));
      const overflow = readyCards.slice(Math.max(0, available));
      if (toAdd.length > 0) {
        patch.backpackItems = [...toAdd, ...state.backpackItems];
      }
      patch.permanentMagicRecycleBag = [...overflow, ...waitingCards];
      const parts: string[] = [];
      if (toAdd.length > 0) parts.push(`回收袋 ${toAdd.length} 张牌洗回背包`);
      if (waitingCards.length > 0) parts.push(`${waitingCards.length} 张牌剩余瀑流 -1（仍在回收袋）`);
      if (overflow.length > 0) parts.push(`${overflow.length} 张因容量不足留在回收袋`);
      patch.heroSkillBanner = toAdd.length > 0 ? `回收袋 ${toAdd.length} 张卡牌洗回了背包！` : '回收袋中的牌仍需等待瀑流。';
      logs.push({ type: 'event', message: `回收袋洗回背包 → ${parts.join('，')}` });
    } else {
      patch.heroSkillBanner = '回收袋中没有卡牌。';
      logs.push({ type: 'event', message: '回收袋为空' });
    }
    const [guildRecycleId, rngAfterGuildId] = nextId(state.rng, 'guild-recycle-reshuffle');
    patch.rng = rngAfterGuildId;
    const guildRecycleCard: GameCardData = {
      id: guildRecycleId,
      type: 'magic',
      name: '回收轮转',
      value: 0,
      image: skillScrollImage,
      magicType: 'permanent',
      magicEffect: 'guild-recycle-reshuffle',
      description: '永久魔法（Perm 1）：回收袋洗回背包（所有牌剩余瀑流 -1），抽 1 张牌。',
      shortDescription: '回收袋全部洗回背包；抽 1 张',
      recycleDelay: 1,
    };
    const bpCap = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier);
    const currentBp = patch.backpackItems ?? state.backpackItems;
    if (currentBp.length < bpCap) {
      patch.backpackItems = [...(patch.backpackItems ?? state.backpackItems), guildRecycleCard];
    } else {
      patch.permanentMagicRecycleBag = [
        ...(patch.permanentMagicRecycleBag ?? state.permanentMagicRecycleBag),
        { ...guildRecycleCard, _recycleWaits: guildRecycleCard.recycleDelay ?? 1 },
      ];
    }
    logs.push({ type: 'event', message: '获得「回收轮转」' });
    patch.heroSkillBanner = '整合完成！获得「回收轮转」，已放入背包。';

  } else if (effectToken === 'grantTwoUpgradeScrolls') {
    const backpackCap = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier);
    const newBp = [...state.backpackItems];
    const newRecycle = [...state.permanentMagicRecycleBag];
    let currentRng = state.rng;
    for (let i = 0; i < 2; i++) {
      const [scrollId, rngAfterScrollId] = nextId(currentRng, 'upgrade-scroll');
      currentRng = rngAfterScrollId;
      const scroll: GameCardData = {
        id: scrollId,
        type: 'magic',
        name: '升级卷轴',
        value: 0,
        image: starterScrollUpgradeImage,
        magicType: 'instant',
        magicEffect: '即时魔法：升级一张牌。',
        description: '一次性使用，选择一张牌进行升级。',
        shortDescription: '升级 1 张牌',
      };
      if (newBp.length < backpackCap) {
        newBp.push(scroll);
      } else {
        newRecycle.push({ ...scroll, _recycleWaits: scroll.recycleDelay ?? 1 });
      }
    }
    patch.rng = currentRng;
    patch.backpackItems = newBp;
    if (newRecycle.length !== state.permanentMagicRecycleBag.length) {
      patch.permanentMagicRecycleBag = newRecycle;
    }
    patch.heroSkillBanner = '获得了 2 张升级卷轴，已放入背包。';
    logs.push({ type: 'event', message: '获得了 2 张「升级卷轴」' });

  // --- Phase 1C: Misc tokens ---

  } else if (effectToken === 'flipBackToGraveyardRecall') {
    const [rawRecall, rngAfterRecall] = createGraveyardRecallCard(state.rng);
    patch.rng = rngAfterRecall;
    const newCard = applyAmplifyOnCreate(rawRecall, state.amplifiedCardBonus);
    const backpackCap = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier);
    if (state.backpackItems.length < backpackCap) {
      patch.backpackItems = [...state.backpackItems, newCard];
    } else {
      patch.permanentMagicRecycleBag = [...state.permanentMagicRecycleBag, { ...newCard, _recycleWaits: newCard.recycleDelay ?? 1 }];
    }
    patch.heroSkillBanner = '卷轴翻转回了「冥途拾遗」，已放入背包。';
    logs.push({ type: 'event', message: '翻转回原始法术「冥途拾遗」' });

  // --- Phase EC-3: interactive tokens (delegate to UI via side effects) ---

  } else if (effectToken === 'equipBurst+4') {
    const weapons: Array<{ slotId: string; name: string }> = [];
    if (state.equipmentSlot1 && (state.equipmentSlot1.type === 'weapon' || state.equipmentSlot1.type === 'monster')) {
      weapons.push({ slotId: 'equipmentSlot1', name: state.equipmentSlot1.name });
    }
    if (state.equipmentSlot2 && (state.equipmentSlot2.type === 'weapon' || state.equipmentSlot2.type === 'monster')) {
      weapons.push({ slotId: 'equipmentSlot2', name: state.equipmentSlot2.name });
    }
    if (weapons.length === 0) {
      patch.heroSkillBanner = '当前没有装备武器，无法施加祝福。';
    } else if (weapons.length === 1) {
      const slotId = weapons[0].slotId as EquipmentSlotId;
      patch.slotAttackBursts = { ...state.slotAttackBursts, [slotId]: ((state.slotAttackBursts as any)?.[slotId] ?? 0) + 4 };
      patch.heroSkillBanner = `${weapons[0].name} 的下次攻击将额外造成 4 点伤害！`;
      logs.push({ type: 'event', message: `事件效果：${weapons[0].name} 下次攻击 +4` });
    } else {
      emitEvents.push({ event: 'event:requestEventInteraction', payload: { token: 'equipBurst+4', data: {} } });
    }

  } else if (effectToken === 'discoverStarterMagic') {
    logs.push({ type: 'event', message: '事件效果：发现起始背包的魔法卡' });
    const starterPool = createStarterCardPool();
    const starterMagicCards = starterPool.filter(c => c.type === 'magic');
    let discoverRng = state.rng;
    let shuffledMagic: GameCardData[];
    [shuffledMagic, discoverRng] = rngShuffle([...starterMagicCards], discoverRng);
    const discoverTempCards = shuffledMagic.slice(0, 3).map(c => {
      let _id: string;
      // Suffix MUST be strippable by `getStarterBaseId` so that, when the
      // player picks one and later plays it, `resolvePermanentMagic`'s
      // starter-id switch can route to the correct handler. The `-disc-1`
      // shape pairs with the relaxed `-disc-\d+(-[a-z0-9]+)?$` strip
      // pattern (see deck.ts:getStarterBaseId). Previously `-disc` (no
      // digits) silently broke every starter magic delivered through this
      // discover flow — including 连环转律 / 锐意鼓舞 / 运势博弈 (which
      // explicitly omit `magicEffect` to rely on starter-id routing).
      [_id, discoverRng] = nextId(discoverRng, `${c.id}-disc-1`);
      return { ...c, id: _id };
    });
    patch.rng = discoverRng;
    if (discoverTempCards.length > 0) {
      emitEvents.push({ event: 'event:requestEventInteraction', payload: { token: 'discoverStarterMagic', data: { pool: discoverTempCards } } });
    } else {
      patch.heroSkillBanner = '没有可用的起始魔法卡。';
    }

  } else if (
    effectToken === 'discoverStarterEquipment'
    || effectToken === 'discoverStarterPotion'
    || effectToken === 'discoverStarterAmulet'
  ) {
    // Discover-1-of-3 from the starter pool, filtered by category. Mirrors the
    // `discoverStarterMagic` branch above — same `-disc-1` suffix shape so
    // `getStarterBaseId` strips back to the canonical STARTER_CARD_IDS.X
    // routing key (see event-grant-card-id-suffix rule).
    const isEquipment = effectToken === 'discoverStarterEquipment';
    const isPotion = effectToken === 'discoverStarterPotion';
    const categoryFilter = isEquipment
      ? (c: GameCardData) => c.type === 'weapon' || c.type === 'shield'
      : isPotion
        ? (c: GameCardData) => c.type === 'potion'
        : (c: GameCardData) => c.type === 'amulet';
    const categoryLabel = isEquipment ? '装备' : isPotion ? '药水' : '护符';
    logs.push({ type: 'event', message: `事件效果：发现起始背包的${categoryLabel}卡` });
    const starterPool = createStarterCardPool();
    const candidates = starterPool.filter(categoryFilter);
    let discoverRng = state.rng;
    let shuffled: GameCardData[];
    [shuffled, discoverRng] = rngShuffle([...candidates], discoverRng);
    const tempCards = shuffled.slice(0, 3).map(c => {
      let _id: string;
      [_id, discoverRng] = nextId(discoverRng, `${c.id}-disc-1`);
      return { ...c, id: _id };
    });
    patch.rng = discoverRng;
    if (tempCards.length > 0) {
      emitEvents.push({ event: 'event:requestEventInteraction', payload: { token: effectToken, data: { pool: tempCards } } });
    } else {
      patch.heroSkillBanner = `没有可用的起始${categoryLabel}卡。`;
    }

  } else if (effectToken === 'grantStarterMagicTwo') {
    // Grant 2 random starter-pool magic cards directly to backpack (no UI
    // pick). Overflow goes into permanentMagicRecycleBag with the standard
    // `_recycleWaits` shape so they re-enter via the next waterfall. Ids use
    // the `-evt-N` suffix so `getStarterBaseId` strips them back to
    // STARTER_CARD_IDS.X for `resolvePermanentMagic` routing.
    logs.push({ type: 'event', message: '事件效果：获得 2 张起始背包的魔法卡' });
    const starterPool = createStarterCardPool();
    const starterMagicCards = starterPool.filter(c => c.type === 'magic');
    let grantRng = state.rng;
    let shuffledMagic: GameCardData[];
    [shuffledMagic, grantRng] = rngShuffle([...starterMagicCards], grantRng);
    const granted: GameCardData[] = [];
    for (let i = 0; i < Math.min(2, shuffledMagic.length); i++) {
      let _id: string;
      [_id, grantRng] = nextId(grantRng, `${shuffledMagic[i].id}-evt-${i + 1}`);
      granted.push({ ...shuffledMagic[i], id: _id });
    }
    patch.rng = grantRng;
    if (granted.length > 0) {
      const cap = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier);
      const currentBp = patch.backpackItems ?? state.backpackItems;
      const room = Math.max(0, cap - currentBp.length);
      const toBackpack = granted.slice(0, room);
      const toRecycle = granted.slice(room);
      if (toBackpack.length > 0) {
        patch.backpackItems = [...toBackpack, ...currentBp];
      }
      if (toRecycle.length > 0) {
        const recycleEntries = toRecycle.map(c => ({
          ...c,
          _recycleWaits: c.recycleDelay ?? 1,
        }));
        patch.permanentMagicRecycleBag = [
          ...(patch.permanentMagicRecycleBag ?? state.permanentMagicRecycleBag),
          ...recycleEntries,
        ];
      }
      const names = granted.map(c => c.name).join('、');
      patch.heroSkillBanner = toRecycle.length > 0
        ? `获得 2 张起始魔法（${names}）。${toRecycle.length} 张因背包已满进入回收袋。`
        : `获得 2 张起始魔法：${names}。`;
    } else {
      patch.heroSkillBanner = '没有可用的起始魔法卡。';
    }

  } else if (effectToken.startsWith('deleteCardForGold:') || effectToken.startsWith('discardCards:') ||
             effectToken.startsWith('deleteCard') || effectToken === 'graveyardDiscover' ||
             effectToken === 'graveyardDiscoverMagic' || effectToken === 'openShop' ||
             effectToken.startsWith('destroyEquipment:') || effectToken.startsWith('returnToHand:') ||
             effectToken.startsWith('upgradeCard') ||
             effectToken === 'discoverClass' || effectToken === 'discoverClassWeapon' ||
             effectToken === 'discoverClassMagic' ||
             effectToken === 'crypt-all-effects' || effectToken === 'crossroads-destroy-below' ||
             effectToken === 'destroyAllEquipment' || effectToken === 'vault-flipback' ||
             effectToken === 'fate-dice-strike' || effectToken.startsWith('amplify-altar-') ||
             // 翻转之契
             effectToken === 'grantHandStunCapBonus' || effectToken === 'grantEquipFlipRepairBuff') {
    emitEvents.push({ event: 'event:requestEventInteraction', payload: { token: effectToken, data: {} } });

  } else if (effectToken.startsWith('grantFlankDraw:') || effectToken.startsWith('grantTransformGold:') ||
             effectToken.startsWith('grantFlankPersuadeCost:') || effectToken.startsWith('grantFlankStunCap:') ||
             effectToken.startsWith('grantFlankDamage:') || effectToken.startsWith('grantTransformDraw:') ||
             effectToken.startsWith('grantTransformHeal:')) {
    emitEvents.push({ event: 'event:requestEventInteraction', payload: { token: effectToken, data: {} } });

  // --- Phase EC-2: flipTo* tokens (event card transforms) ---

  } else if (effectToken === 'flipToCurse') {
    let rng = state.rng;
    let id: string;
    [id, rng] = nextId(rng, 'curse');
    patch.rng = rng;
    const curseCard: GameCardData = {
      id, type: 'curse', name: '血咒之印', value: 0,
      image: bloodCurseSealImage,
      description: '诅咒：使用时失去 3 点生命，使用后回到背包；无法被回收或弃置。',
      shortDescription: '使用时 -3 生命；用后回到背包',
      curseEffect: 'blood-curse',
    };
    addCardToBackpackPatch(state, patch, curseCard);
    const hasFlipGold = applyFlipGoldBonus(state, patch, logs);
    patch.heroSkillBanner = '卷轴翻转化为血咒，潜入了你的背包。';
    logs.push({ type: 'event', message: '事件效果：卷轴转化为血咒' });
    emitEvents.push({ event: 'event:cardTransformed', payload: { fromCard: state.currentEventCard as any, toCard: curseCard as any, message: '卷轴翻转化为血咒…', hasFlipGold } });

  } else if (effectToken === 'addCurse') {
    let rng = state.rng;
    let id: string;
    [id, rng] = nextId(rng, 'curse');
    patch.rng = rng;
    const curseCard: GameCardData = {
      id, type: 'curse', name: '血咒之印', value: 0,
      image: bloodCurseSealImage,
      description: '诅咒：使用时失去 3 点生命，使用后回到背包；无法被回收或弃置。',
      shortDescription: '使用时 -3 生命；用后回到背包',
      curseEffect: 'blood-curse',
    };
    addCardToBackpackPatch(state, patch, curseCard);
    patch.heroSkillBanner = '一张血咒潜入了你的背包。';
    logs.push({ type: 'event', message: '事件效果：获得一张血咒' });
    emitEvents.push({ event: 'event:curseCreated', payload: { card: curseCard as any, isTransform: false } });

  } else if (effectToken.startsWith('gainBolts:')) {
    const count = parseInt(effectToken.replace('gainBolts:', ''), 10) || 0;
    let rng = state.rng;
    const handLimit = HAND_LIMIT + (state.handLimitBonus ?? 0);
    const handCards = [...state.handCards];
    const cap = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier);
    const backpackItems = [...state.backpackItems];
    let toHand = 0;
    let toBackpack = 0;
    let toRecycle = 0;
    const recycleBag = [...state.permanentMagicRecycleBag];
    for (let i = 0; i < count; i++) {
      let bolt: GameCardData;
      [bolt, rng] = createMagicBoltCard(rng);
      bolt = applyAmplifyOnCreate(bolt, state.amplifiedCardBonus);
      if (handCards.length < handLimit) {
        handCards.push(bolt);
        toHand++;
      } else if (backpackItems.length < cap) {
        backpackItems.unshift(bolt);
        toBackpack++;
      } else {
        recycleBag.push({ ...bolt, _recycleWaits: bolt.recycleDelay ?? 1 });
        toRecycle++;
      }
    }
    patch.rng = rng;
    patch.handCards = handCards;
    patch.backpackItems = backpackItems;
    patch.permanentMagicRecycleBag = recycleBag;
    const parts: string[] = [];
    if (toHand > 0) parts.push(`手牌+${toHand}`);
    if (toBackpack > 0) parts.push(`背包+${toBackpack}`);
    if (toRecycle > 0) parts.push(`回收袋+${toRecycle}`);
    patch.heroSkillBanner = `获得 ${count} 张「魔弹」（${parts.join('，')}）。`;
    logs.push({ type: 'event', message: `获得 ${count} 张「魔弹」` });

  // --- 翻转之契 option 1 ---
  } else if (effectToken === 'flipAllActiveRow') {
    const cards = state.activeCards as (GameCardData | null)[];
    const cellEntries: Array<{ idx: number; card: GameCardData }> = [];
    cards.forEach((c, idx) => {
      if (c && (c.flipTarget || c._flipBackCard)) cellEntries.push({ idx, card: c });
    });

    if (cellEntries.length === 0) {
      patch.heroSkillBanner = '激活行没有可翻转或已翻转的卡牌。';
      logs.push({ type: 'event', message: '事件效果：激活行无可翻转牌' });
    } else {
      const newActive = [...cards] as ActiveRowSlots;
      const flippedNames: string[] = [];
      for (const { idx, card } of cellEntries) {
        if (card.flipTarget) {
          // Forward flip via APPLY_CARD_FLIP — preserves flipGold / flipZap / etc.
          allEnqueuedActions.push({ type: 'APPLY_CARD_FLIP', card, cellIndex: idx });
          flippedNames.push(`${card.name} → ${card.flipTarget.toCard.name}`);
        } else if (card._flipBackCard) {
          // Back flip — direct patch + flippedInCell side effect, mirrors 乾坤一翻 / 血誓回卷.
          const restored: GameCardData = { ...card._flipBackCard };
          newActive[idx] = restored;
          allRawSideEffects.push({
            event: 'card:flippedInCell',
            payload: { cellIndex: idx, fromCard: card, toCard: restored, message: `${card.name} → ${restored.name}` },
          });
          flippedNames.push(`${card.name} → ${restored.name}`);
        }
      }
      patch.activeCards = newActive;
      patch.heroSkillBanner = `万象齐转：翻转 ${cellEntries.length} 张牌！`;
      logs.push({ type: 'event', message: `事件效果：翻转激活行 ${cellEntries.length} 张牌（${flippedNames.join('、')}）` });
    }

  // --- 翻转之契 option 2 ---
  } else if (effectToken === 'grantActiveRowFlip') {
    const pool = createStarterCardPool();
    const template = pool.find(c => c.id === STARTER_CARD_IDS.activeRowFlip);
    if (template) {
      let rng = state.rng;
      let cardId: string;
      [cardId, rng] = nextId(rng, `${template.id}-evt-1`);
      patch.rng = rng;
      const card: GameCardData = { ...template, id: cardId };
      addCardToBackpackPatch(state, patch, card);
      patch.heroSkillBanner = '获得了「乾坤一翻」，已放入背包。';
      logs.push({ type: 'event', message: '事件效果：获得起始永久魔法「乾坤一翻」' });
    } else {
      patch.heroSkillBanner = '无法生成「乾坤一翻」。';
    }

  } else if (effectToken === 'grantMissileWaterfallAmplify') {
    if (!hasEternalRelic(state.eternalRelics, 'missile-amplify-on-waterfall')) {
      patch.eternalRelics = [...state.eternalRelics, getEternalRelic('missile-amplify-on-waterfall')];
    }
    patch.heroSkillBanner = '获得永恒护符·瀑流增幅魔弹！';
    logs.push({ type: 'event', message: '获得永恒护符·瀑流增幅魔弹' });

  } else if (effectToken === 'grantMissileStun20') {
    if (!hasEternalRelic(state.eternalRelics, 'missile-stun-20')) {
      patch.eternalRelics = [...state.eternalRelics, getEternalRelic('missile-stun-20')];
    }
    patch.heroSkillBanner = '获得永恒护符·震荡弹幕！';
    logs.push({ type: 'event', message: '获得永恒护符·震荡弹幕' });

  } else if (effectToken === 'grantMissileDraw1') {
    if (!hasEternalRelic(state.eternalRelics, 'missile-draw-1')) {
      patch.eternalRelics = [...state.eternalRelics, getEternalRelic('missile-draw-1')];
    }
    patch.heroSkillBanner = '获得永恒护符·汲取弹幕！';
    logs.push({ type: 'event', message: '获得永恒护符·汲取弹幕' });

  } else if (effectToken === 'grantKnightMagicMissileLv1') {
    let rng = state.rng;
    let cardId: string;
    // Id must strip back to STARTER_CARD_IDS.magicMissile via getStarterBaseId so that
    // resolvePermanentMagic's starter-id switch routes to the magic-missile case and
    // actually spawns the 3 「魔弹」 bolts. nextId appends a base36 suffix
    // (letters+digits), so we use the `-evt-\d+-[a-z0-9]+$` strip pattern which
    // matches base36 suffixes (the `-pick-\d+$` pattern would require pure digits).
    [cardId, rng] = nextId(rng, `${STARTER_CARD_IDS.magicMissile}-evt-1`);
    patch.rng = rng;
    const card: GameCardData = {
      id: cardId,
      type: 'magic',
      name: '魔法飞弹',
      value: 0,
      image: dedupeStarterMagicMissileImage,
      classCard: true,
      magicType: 'permanent',
      magicEffect: '永久魔法：手上加入 3 张一次性「魔弹」。',
      description: '加入 3 张一次性「魔弹」到手牌（每张可对一个怪物造成 1 点法术伤害）。',
      shortDescription: '加入 3 张「魔弹」到手牌（每张 1 法伤）',
      upgradeLevel: 1,
      maxUpgradeLevel: 2,
    } as GameCardData;
    addCardToBackpackPatch(state, patch, card);
    patch.heroSkillBanner = '获得 Lv1「魔法飞弹」（已放入背包）。';
    logs.push({ type: 'event', message: '事件效果：获得 Lv1「魔法飞弹」' });

  } else if (
    effectToken === 'flipToArcaneShield' || effectToken === 'guildFlipToMagic' || effectToken === 'guildFlipToHandRecycleMagic' ||
    effectToken === 'flipToPaperAsh' || effectToken === 'flipToLeftDurabilityPotion' || effectToken === 'flipToMonsterAttackDebuff' ||
    effectToken === 'flipToHonorBloodMagic' || effectToken === 'flipToHonorSweepMagic' ||
    effectToken === 'flipToEquipSwapPotion' || effectToken === 'flipToHandLimitPotion' ||
    effectToken === 'flipToClassMagicDiscoverPotion' || effectToken === 'flipToDiscardDrawMagic' ||
    effectToken === 'flipToUpgradeScroll' || effectToken === 'flipToRecallEquip' ||
    effectToken === 'flipToUndyingBlessing' || effectToken === 'flipToCurseWeapon' ||
    effectToken === 'flipToFlipPersuadeAmulet' || effectToken === 'flipToFlipMonsterDebuffMagic'
  ) {
    const flipDef = getFlipToCardDefinition(effectToken, state.rng);
    if (flipDef) {
      patch.rng = flipDef.rng;
      addCardToBackpackPatch(state, patch, flipDef.card);
      const hasFlipGold = applyFlipGoldBonus(state, patch, logs);
      patch.heroSkillBanner = flipDef.banner;
      logs.push({ type: 'event', message: flipDef.logMessage });
      emitEvents.push({ event: 'event:cardTransformed', payload: { fromCard: state.currentEventCard as any, toCard: flipDef.card as any, message: flipDef.transformMessage, hasFlipGold } });
    }

  // --- Phase EC-2: draw tokens (class deck → backpack) ---

  } else if (
    effectToken === 'draw2' || effectToken === 'drawClass2' ||
    effectToken === 'drawKnight1' || effectToken === 'drawKnight3' || effectToken === 'drawKnight4' ||
    effectToken === 'drawSkill' || effectToken === 'drawEquipment' || effectToken === 'grantRandomClassShield'
  ) {
    const drawDef = getDrawTokenDefinition(effectToken);
    if (state.classDeck.length === 0) {
      patch.heroSkillBanner = '专属牌堆已空，无法抽取。';
      logs.push({ type: 'event', message: '专属牌堆已空' });
    } else {
      const filtered = drawDef.filter ? state.classDeck.filter(drawDef.filter) : state.classDeck;
      if (filtered.length === 0) {
        patch.heroSkillBanner = drawDef.emptyMessage ?? '专属牌堆中没有符合条件的牌。';
        logs.push({ type: 'event', message: drawDef.emptyMessage ?? '专属牌堆中没有符合条件的牌' });
      } else {
        // Class deck is an infinite template; sample distinct-by-name and
        // clone with fresh ids so the pool is preserved.
        const [sampled, rngAfterSample] = sampleDistinctByName(filtered, drawDef.count, state.rng, rngShuffle);
        const [drawn, rngAfterClone] = cloneClassCardsWithFreshIds(sampled, rngAfterSample);
        patch.rng = rngAfterClone;
        const currentBp = patch.backpackItems ?? state.backpackItems;
        const cap = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier);
        const available = cap - currentBp.length;
        const toBackpack = drawn.slice(0, Math.max(0, available));
        const overflow = drawn.slice(Math.max(0, available));
        if (toBackpack.length > 0) {
          patch.backpackItems = [...toBackpack, ...currentBp];
        }
        if (overflow.length > 0) {
          const currentRecycle = patch.permanentMagicRecycleBag ?? state.permanentMagicRecycleBag;
          patch.permanentMagicRecycleBag = [...currentRecycle, ...overflow.map(c => ({ ...c, _recycleWaits: c.recycleDelay ?? 1 }))];
        }
        patch.heroSkillBanner = drawn.length > 0 ? `获得了 ${drawn.map(c => c.name).join('、')}！` : drawDef.emptyMessage ?? '无牌可抽。';
        logs.push({ type: 'event', message: `事件效果：抽取 ${drawn.length} 张${drawDef.label}` });
        emitEvents.push({ event: 'event:classDeckDrawn', payload: { cards: drawn as any, source: effectToken } });
      }
    }

  // --- Phase EC-2: classBottom+ ---

  } else if (effectToken.startsWith('classBottom+')) {
    const count = parseInt(effectToken.replace('classBottom+', ''), 10) || 2;
    const { patch: cbPatch, cards, logs: cbLogs } = gainClassDeckBottomCardsPure(state, count);
    Object.assign(patch, cbPatch);
    logs.push(...cbLogs);
    if (cards.length > 0) {
      emitEvents.push({ event: 'event:classDeckDrawn', payload: { cards: cards as any, source: 'classBottom' } });
    }

  // --- Phase EC-2: handAllToRecycleBag ---

  } else if (effectToken === 'handAllToRecycleBag') {
    // Curses cannot be moved to the recycle bag.
    const cards = state.handCards.filter(c => c.type !== 'curse');
    const kept = state.handCards.filter(c => c.type === 'curse');
    if (cards.length === 0) {
      patch.heroSkillBanner = '没有手牌可以移入回收袋。';
      logs.push({ type: 'event', message: '事件效果：手牌为空' });
    } else {
      patch.handCards = kept;
      const currentRecycle = state.permanentMagicRecycleBag;
      patch.permanentMagicRecycleBag = [...currentRecycle, ...cards.map(c => ({ ...c, _recycleWaits: c.recycleDelay ?? 1 }))];
      patch.heroSkillBanner = `${cards.length} 张手牌已移入回收袋。`;
      logs.push({ type: 'event', message: `事件效果：${cards.length} 张手牌已移入永久魔法回收袋` });
      emitEvents.push({ event: 'event:handToRecycleBag', payload: { cards: cards as any } });
    }

  // --- Phase EC-2: randomDiscardHand:* ---

  } else if (effectToken.startsWith('randomDiscardHand:')) {
    const count = parseInt(effectToken.replace('randomDiscardHand:', ''), 10) || 1;
    const currentHand = state.handCards.filter(c => c.id !== state.currentEventCard?.id);
    const toDiscardCount = Math.min(count, currentHand.length);
    if (toDiscardCount > 0) {
      const [cardsToDiscard, rngAfterDiscard] = pickRandomHandCardsForDiscardPreferGraveyard(currentHand, toDiscardCount, state.rng);
      patch.rng = rngAfterDiscard;
      const discardIds = new Set(cardsToDiscard.map(c => c.id));
      patch.handCards = state.handCards.filter(c => !discardIds.has(c.id));
      const toRecycle = cardsToDiscard.filter(c => isRecyclableFromHand(c));
      const toGraveyard = cardsToDiscard.filter(c => !isRecyclableFromHand(c));
      patch.discardedCards = [...state.discardedCards, ...toGraveyard];
      if (toRecycle.length > 0) {
        patch.permanentMagicRecycleBag = [
          ...state.permanentMagicRecycleBag,
          ...toRecycle.map(c => ({ ...c, _recycleWaits: c.recycleDelay ?? 1 })),
        ];
      }
      const names = cardsToDiscard.map(c => c.name);
      patch.heroSkillBanner = `随机弃回了 ${names.join('、')}。`;
      logs.push({ type: 'event', message: `随机弃回手牌：${names.join('、')}` });
      emitEvents.push({ event: 'event:randomHandDiscarded', payload: { cards: cardsToDiscard as any } });
    }

  // --- Phase EC-2: discardAllHandForGold:* ---

  } else if (effectToken.startsWith('discardAllHandForGold:')) {
    const goldPerCard = parseInt(effectToken.replace('discardAllHandForGold:', ''), 10) || 3;
    // Curses are immune to forced discard.
    const cardsToDiscard = state.handCards.filter(c => c.id !== state.currentEventCard?.id && c.type !== 'curse');
    if (cardsToDiscard.length > 0) {
      const totalGold = cardsToDiscard.length * goldPerCard;
      const discardedIds = new Set(cardsToDiscard.map(c => c.id));
      patch.handCards = state.handCards.filter(c => !discardedIds.has(c.id));
      const toRecycle = cardsToDiscard.filter(c => isRecyclableFromHand(c));
      const toGraveyard = cardsToDiscard.filter(c => !isRecyclableFromHand(c));
      patch.discardedCards = [...state.discardedCards, ...toGraveyard];
      if (toRecycle.length > 0) {
        patch.permanentMagicRecycleBag = [
          ...state.permanentMagicRecycleBag,
          ...toRecycle.map(c => ({ ...c, _recycleWaits: c.recycleDelay ?? 1 })),
        ];
      }
      patch.gold = state.gold + totalGold;
      patch.heroSkillBanner = `弃回了 ${cardsToDiscard.length} 张手牌，获得 ${totalGold} 金币！`;
      logs.push({ type: 'event', message: `事件效果：弃回 ${cardsToDiscard.length} 张手牌，获得 ${totalGold} 金币` });
      emitEvents.push({ event: 'event:handDiscardedForGold', payload: { count: cardsToDiscard.length, gold: totalGold } });
    } else {
      patch.heroSkillBanner = '没有手牌可以弃回。';
    }

  // --- Phase EC-2: drawHeroCards:* (backpack → hand) ---

  } else if (effectToken.startsWith('drawHeroCards:')) {
    const drawCount = parseInt(effectToken.replace('drawHeroCards:', ''), 10) || 1;
    const handLimit = HAND_LIMIT + (state.handLimitBonus ?? 0);
    const available = Math.min(drawCount, state.backpackItems.length, handLimit - state.handCards.length);
    if (available > 0) {
      const drawn = state.backpackItems.slice(0, available);
      patch.backpackItems = state.backpackItems.slice(available);
      patch.handCards = [...state.handCards, ...drawn];
      patch.heroSkillBanner = `从背包抽到了 ${available} 张牌。`;
      logs.push({ type: 'event', message: `事件效果：从背包抽 ${available} 张牌` });
    } else {
      patch.heroSkillBanner = '背包为空或手牌已满，无法抽牌。';
    }

  // --- Phase EC-2: discardHandEquipForClassEquip ---

  } else if (effectToken === 'discardHandEquipForClassEquip') {
    const equipInHand = state.handCards.filter(c => c.type === 'weapon' || c.type === 'shield');
    if (equipInHand.length === 0) {
      patch.heroSkillBanner = '手牌中没有装备卡可弃置。';
      logs.push({ type: 'event', message: '事件效果：手牌中没有装备卡' });
    } else {
      const discardIds = new Set(equipInHand.map(c => c.id));
      patch.handCards = state.handCards.filter(c => !discardIds.has(c.id));
      patch.discardedCards = [...state.discardedCards, ...equipInHand];
      const classEquip = state.classDeck.filter(c => c.type === 'weapon' || c.type === 'shield');
      if (classEquip.length > 0) {
        // Class deck is an infinite template; sample distinct-by-name and clone.
        const [sampled, rngAfterSample] = sampleDistinctByName(classEquip, equipInHand.length, state.rng, rngShuffle);
        const [drawn, rngAfterClone] = cloneClassCardsWithFreshIds(sampled, rngAfterSample);
        patch.rng = rngAfterClone;
        const currentBp = patch.backpackItems ?? state.backpackItems;
        const cap = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier);
        const avail = cap - currentBp.length;
        const toBackpack = drawn.slice(0, Math.max(0, avail));
        if (toBackpack.length > 0) {
          patch.backpackItems = [...toBackpack, ...currentBp];
        }
        patch.heroSkillBanner = `弃置了 ${equipInHand.map(c => c.name).join('、')}，获得 ${drawn.length} 张专属装备！`;
        logs.push({ type: 'event', message: `事件效果：弃置 ${equipInHand.length} 张手牌装备，获得 ${drawn.length} 张专属装备` });
        emitEvents.push({ event: 'event:classDeckDrawn', payload: { cards: drawn as any, source: 'discardHandEquipForClassEquip' } });
      } else {
        patch.heroSkillBanner = `弃置了 ${equipInHand.map(c => c.name).join('、')}，但专属牌堆中没有装备。`;
        logs.push({ type: 'event', message: '弃置了手牌装备，但专属牌堆中没有装备' });
      }
    }

  // --- Phase EC-2: useKnightSkill ---

  } else if (effectToken === 'useKnightSkill') {
    const skillCards = state.classDeck.filter(c => c.type === 'skill' && (c as any).skillType === 'instant');
    if (skillCards.length > 0) {
      // Class deck is an infinite template — pick a random instant skill and
      // clone it with a fresh id (so any downstream copy/tracking gets a unique
      // instance) without removing the template from the pool.
      const [original, rngAfterPick] = pickRandom(skillCards, state.rng);
      const [skill, rngAfterClone] = cloneClassCardWithFreshId(original, rngAfterPick);
      patch.rng = rngAfterClone;
      logs.push({ type: 'event', message: `事件效果：打出技能 ${skill.name}` });
      emitEvents.push({ event: 'event:requestEventInteraction', payload: { token: 'useKnightSkill', data: { skill: skill as any } } });
    } else {
      patch.heroSkillBanner = '专属牌堆中没有即时技能。';
    }

  // --- Phase EC-1: grantStarter* / grantMagic / amplify-copy-upgraded ---

  } else if (effectToken === 'grantStarterWeaponBurst' || effectToken === 'grantStarterTempArmor' || effectToken === 'grantStarterStunStrike') {
    const templateId = effectToken === 'grantStarterWeaponBurst' ? STARTER_CARD_IDS.weaponBurst
      : effectToken === 'grantStarterTempArmor' ? STARTER_CARD_IDS.tempArmor
      : STARTER_CARD_IDS.stunStrike;
    const displayName = effectToken === 'grantStarterWeaponBurst' ? '战斗鼓舞'
      : effectToken === 'grantStarterTempArmor' ? '铸甲术'
      : '雷震击';
    const pool = createStarterCardPool();
    const template = pool.find(c => c.id === templateId);
    if (template) {
      let rng = state.rng;
      let _id: string;
      // Suffix MUST match `getStarterBaseId`'s strip pattern `-evt-\d+-[a-z0-9]+$`
      // so resolvePermanentMagic's starter switch can route the granted card.
      // Without the `-1` segment, the base36 suffix from nextId leaves the id
      // unstrippable and the played card silently no-ops (real bug for
      // 雷震击 / 战斗鼓舞 / 铸甲术 granted from events).
      [_id, rng] = nextId(rng, `${template.id}-evt-1`);
      patch.rng = rng;
      const card: GameCardData = { ...template, id: _id };
      const cap = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier);
      if (state.backpackItems.length < cap) {
        patch.backpackItems = [card, ...state.backpackItems];
      } else {
        patch.permanentMagicRecycleBag = [...state.permanentMagicRecycleBag, { ...card, _recycleWaits: card.recycleDelay ?? 1 }];
      }
      patch.heroSkillBanner = `获得了「${displayName}」，已放入背包。`;
      logs.push({ type: 'event', message: `事件效果：获得永久魔法「${displayName}」` });
    }

  } else if (effectToken === 'grantPersuadeBoostMagic') {
    let rng = state.rng;
    let _id: string;
    [_id, rng] = nextId(rng, 'persuade-boost');
    patch.rng = rng;
    const card: GameCardData = {
      id: _id,
      type: 'magic',
      name: '劝降祝福',
      value: 0,
      image: skillScrollImage,
      magicType: 'permanent',
      magicEffect: 'persuade-boost-draw',
      description: '永久魔法（Perm 1）：下次劝降成功率 +15%，抽 1 张牌。',
      shortDescription: '下次劝降率 +15%；抽 1 张',
      recycleDelay: 1,
    };
    const cap = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier);
    if (state.backpackItems.length < cap) {
      patch.backpackItems = [card, ...state.backpackItems];
    } else {
      patch.permanentMagicRecycleBag = [...state.permanentMagicRecycleBag, { ...card, _recycleWaits: 1 }];
    }
    patch.heroSkillBanner = '获得了「劝降祝福」，已放入背包。';
    logs.push({ type: 'event', message: '事件效果：获得永久魔法「劝降祝福」' });

  } else if (effectToken === 'grantBountySpellMagic') {
    let rng = state.rng;
    let _id: string;
    [_id, rng] = nextId(rng, 'bounty-spell');
    patch.rng = rng;
    const card: GameCardData = {
      id: _id,
      type: 'magic',
      name: '赏金裁决',
      value: 0,
      image: skillScrollImage,
      magicType: 'permanent',
      magicEffect: 'bounty-spell-damage',
      description: '永久魔法（Perm 1）：选择一个怪物，造成 5 点法术伤害，获得等同于造成伤害的金币。',
      shortDescription: '5 法伤；伤害换金币',
      recycleDelay: 1,
    };
    const cap = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier);
    if (state.backpackItems.length < cap) {
      patch.backpackItems = [card, ...state.backpackItems];
    } else {
      patch.permanentMagicRecycleBag = [...state.permanentMagicRecycleBag, { ...card, _recycleWaits: 1 }];
    }
    patch.heroSkillBanner = '获得了「赏金裁决」，已放入背包。';
    logs.push({ type: 'event', message: '事件效果：获得永久魔法「赏金裁决」' });

  } else if (effectToken === 'amplify-copy-upgraded') {
    const upgraded = state.handCards.filter(c => (c.upgradeLevel ?? 0) > 0);
    if (upgraded.length === 0) {
      patch.heroSkillBanner = '手牌中没有已增幅的卡牌可供复制。';
    } else {
      const target = upgraded[0];
      let rng = state.rng;
      let _copyId: string;
      [_copyId, rng] = nextId(rng, `${target.id}-copy`);
      patch.rng = rng;
      const copy: GameCardData = { ...target, id: _copyId, _skipOnEnterHand: true };
      patch.handCards = [...state.handCards, copy];
      patch.heroSkillBanner = `复制了「${target.name}」！副本已加入手牌。`;
      logs.push({ type: 'event', message: `增幅仪式：复制了「${target.name}」` });
    }

  // --- Fallthrough ---

  } else {
    asyncActions.push(effectToken);
  }

  return {
    patch, logs, asyncActions,
    emitEvents: emitEvents.length > 0 ? emitEvents : undefined,
    enqueuedActions: allEnqueuedActions.length > 0 ? allEnqueuedActions : undefined,
    rawSideEffects: allRawSideEffects.length > 0 ? allRawSideEffects : undefined,
  };
}

// ---------------------------------------------------------------------------
// Gain cards from class deck bottom
// ---------------------------------------------------------------------------

export function gainClassDeckBottomCardsPure(
  state: GameState,
  count: number,
): { patch: Partial<GameState>; cards: GameCardData[]; logs: Array<{ type: string; message: string }> } {
  const logs: Array<{ type: string; message: string }> = [];
  const backpackCapacity = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier);

  if (count <= 0 || state.classDeck.length === 0) {
    return { patch: {}, cards: [], logs };
  }
  const availableSlots = backpackCapacity - state.backpackItems.length;
  if (availableSlots <= 0) {
    return { patch: {}, cards: [], logs };
  }
  const takeCount = Math.min(count, availableSlots, state.classDeck.length);
  if (takeCount <= 0) {
    return { patch: {}, cards: [], logs };
  }

  // Class deck is an infinite template — clone the bottom slice with fresh
  // ids instead of removing them from the pool.
  const sampled = state.classDeck.slice(-takeCount);
  const [cards, rngAfterClone] = cloneClassCardsWithFreshIds(sampled, state.rng);
  const merged = [...cards, ...state.backpackItems];

  let newBackpackItems: GameCardData[];
  let newRecycleBag = state.permanentMagicRecycleBag;

  if (merged.length <= backpackCapacity) {
    newBackpackItems = merged;
  } else {
    const overflow = merged.slice(backpackCapacity);
    newBackpackItems = merged.slice(0, backpackCapacity);
    newRecycleBag = [
      ...state.permanentMagicRecycleBag,
      ...overflow.map(c => ({ ...c, _recycleWaits: c.recycleDelay ?? 1 })),
    ];
  }

  logs.push({ type: 'skill', message: `从职业牌组底部获得 ${takeCount} 张牌：${cards.map(c => c.name).join('、')}` });

  return {
    patch: {
      rng: rngAfterClone,
      backpackItems: newBackpackItems,
      permanentMagicRecycleBag: newRecycleBag,
    },
    cards,
    logs,
  };
}

// ---------------------------------------------------------------------------
// Finalize event resolution
// ---------------------------------------------------------------------------

export function finalizeEventPure(
  state: GameState,
  options?: { removeFromDungeon?: boolean },
): Partial<GameState> {
  const patch: Partial<GameState> = {
    currentEventCard: null,
    resolvingDungeonCardId: null,
  };

  if (options?.removeFromDungeon && state.resolvingDungeonCardId) {
    const cardId = state.resolvingDungeonCardId;
    patch.activeCards = state.activeCards.map(c =>
      c?.id === cardId ? null : c,
    ) as ActiveRowSlots;
  }

  return patch;
}
