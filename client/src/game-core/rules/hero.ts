/**
 * Hero Rules — handles hero skill and ability actions in the reducer.
 *
 * Covers: USE_HERO_SKILL, ADD_MAGIC_GAUGE, PERSUADE_MONSTER, SWEEP, RESET_HERO_WAVE.
 *
 * Complex hero skill resolution (multi-step UI flows, dice rolls) is
 * delegated to side effects for the UI layer to handle.
 */

import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ReduceResult, SideEffect } from '../reducer';
import { applyPatch, noChange } from '../reducer';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, EquipmentSlotId, EquipmentItem, PendingMagicAction } from '@/components/game-board/types';
import { computeMaxHp, checkSwapUpgrade, applyMissileRelicEffects, executeArmorDoubleStrike, requestOrAutoHandDiscard, finalizeDiscardEmpower } from './magic-effects';
import { maybeEnqueueStunGold } from './economy';
import { DUNGEON_COLUMN_COUNT, PERSUADE_COST, MIN_PERSUADE_COST, createEmptyAmuletEffects, DURABILITY_CAP, clampMaxDurability } from '../constants';
import {
  flattenActiveRowSlots,
  isDamageableTarget,
  pickRandomHandCardsForDiscardPreferGraveyard,
  sanitizeCardMetadata,
  computeHonorSweepWaveDamagePure,
  computeSpellDamagePure,
  computeSlotArmorValuePure,
  getCardPlayCategory,
} from '../helpers';
import {
  resetHeroWavePure,
  addMagicGauge,
  resetMagicGauge,
  isMagicGaugeFull,
  markSkillUsedPure,
} from '../hero';
import { drawFromBackpackToHandPure, drawMultipleFromBackpack, applyMirrorCopySummonProgress } from '../cards';
import { computeEquipmentBreakEffects, computeEquipmentDisplacementLastWords, shouldRouteEquipmentToPermRecycle, clearSlotAndPromoteReserve, accumulateMineDamageBoost, processMineCollisions, clearTriggeredMineSlots } from './equipment-effects';
import { applyShieldSlotSelfDamage } from './shield-self-damage';
import { tickStunAttemptDiscoverProgress } from './combat';
import { computeAmuletEffectsForState, getEquipmentInSlot, getSlotBonus, applySlotArmorBonusDelta, refillSlotArmorToCap, checkPersuadeOnTempAttack as checkPersuadeOnTempAttackShared } from '../equipment';
import { maybeTriggerDeleteDrawForDestroy } from '../deleteDrawTrigger';
import { applyFlipCounters } from './flip-counters';
import { nextInt, pickRandom } from '../rng';
import { damageMonsterWithLayerOverflow, computeEffectiveSpellDamageOnMonster, computeDamage, detectMineCollisionsAfterShuffle } from '../combat';
import { isMonsterMagicImmuneByBuilding, getEquipmentSlotsWithSuppressedTempAttack } from '../buildingAura';
import { applyMonsterRage } from '@/lib/monsterRage';

export function reduceHeroActions(state: GameState, action: GameAction): ReduceResult | null {
  switch (action.type) {
    case 'USE_HERO_SKILL':
      return reduceUseHeroSkill(state, action);
    case 'RESOLVE_HERO_SKILL_TARGET':
      return reduceResolveHeroSkillTarget(state, action);
    case 'ADD_MAGIC_GAUGE':
      return reduceAddMagicGauge(state, action);
    case 'PERSUADE_MONSTER':
      return reducePersuadeMonster(state, action);
    case 'SWEEP':
      return reduceSweep(state, action);
    case 'RESET_HERO_WAVE':
      return reduceResetHeroWave(state);
    case 'ACTIVATE_HERO_MAGIC':
      return reduceActivateHeroMagic(state, action);
    case 'COMPLETE_HERO_MAGIC':
      return reduceCompleteHeroMagic(state, action);
    case 'RESOLVE_HERO_MAGIC_TARGET':
      return reduceResolveHeroMagicTarget(state, action);
    case 'APPLY_REVIVE_BLESSING':
      return reduceApplyReviveBlessing(state, action);
    case 'CHECK_HONOR_SWEEP_UPGRADES':
      return reduceCheckHonorSweepUpgrades(state);
    case 'RESOLVE_MAGIC_SLOT_SELECTION':
      return reduceMagicSlotSelection(state, action);
    case 'RESOLVE_MAGIC_MONSTER_SELECTION':
      return reduceMagicMonsterSelection(state, action);
    case 'RESOLVE_DUNGEON_CARD_SELECTION':
      return reduceDungeonCardSelection(state, action);
    case 'RESOLVE_PUSH_TO_BACKPACK_TOP':
      return reducePushToBackpackTop(state, action);
    case 'RESOLVE_DICE':
      return reduceDiceForHero(state, action);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// USE_HERO_SKILL
// ---------------------------------------------------------------------------

function reduceUseHeroSkill(
  state: GameState,
  action: Extract<GameAction, { type: 'USE_HERO_SKILL' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  sideEffects.push({
    event: 'hero:skillUsed',
    payload: { skillId: action.skillId, target: action.target },
  });

  const skillId = action.skillId;

  switch (skillId) {
    case 'blood-draw': {
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 3, source: 'general', selfInflicted: true });
      let current = { ...state, ...patch };
      const drawnNames: string[] = [];
      for (let i = 0; i < 2; i++) {
        const { card, patch: drawPatch } = drawFromBackpackToHandPure(current);
        if (card) {
          Object.assign(patch, drawPatch);
          current = { ...current, ...drawPatch };
          drawnNames.push(card.name);
          sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: card.id, source: 'backpack' } });
        }
      }
      applyMirrorCopySummonProgress(state, patch, sideEffects, enqueuedActions, drawnNames.length);
      Object.assign(patch, markSkillUsedPure(state, skillId as any));
      if (drawnNames.length > 0) {
        patch.heroSkillBanner = `失去 3 生命，抽到「${drawnNames.join('」「')}」！`;
        sideEffects.push({ event: 'log:entry', payload: { type: 'skill', message: `血契抽牌：失去 3 生命，抽到「${drawnNames.join('」「')}」` } });
      } else {
        patch.heroSkillBanner = '失去 3 生命，但背包为空或手牌已满。';
        sideEffects.push({ event: 'log:entry', payload: { type: 'skill', message: '血契抽牌：失去 3 生命，未能抽牌' } });
      }
      break;
    }
    case 'gold-discovery': {
      const cost = 6;
      if ((state.gold ?? 0) < cost) {
        patch.heroSkillBanner = `金币不足！需要 ${cost} 金币（当前 ${state.gold}）。`;
        return applyPatch(state, patch, sideEffects);
      }
      if (state.classDeck.length === 0) {
        patch.heroSkillBanner = '专属牌堆已空，无法发动。';
        return applyPatch(state, patch, sideEffects);
      }
      patch.gold = (state.gold ?? 0) - cost;
      enqueuedActions.push({ type: 'DRAW_CLASS_TO_BACKPACK', count: 1 });
      Object.assign(patch, markSkillUsedPure(state, skillId as any));
      sideEffects.push({ event: 'log:entry', payload: { type: 'skill', message: `黄金探秘：花费 ${cost} 金币` } });
      break;
    }
    case 'vanguard-swap': {
      const cards = state.activeCards as (GameCardData | null)[];
      let firstIdx = -1;
      let secondIdx = -1;
      for (let i = 0; i < cards.length; i++) {
        if (cards[i] != null) {
          if (firstIdx === -1) firstIdx = i;
          else if (secondIdx === -1) { secondIdx = i; break; }
        }
      }
      if (firstIdx === -1 || secondIdx === -1) {
        patch.heroSkillBanner = '先锋换阵无效（地城行卡牌不足 2 张）。';
        return applyPatch(state, patch, sideEffects);
      }
      const cardA = cards[firstIdx]!;
      const cardB = cards[secondIdx]!;
      const next = [...cards];
      const tmp = next[firstIdx];
      next[firstIdx] = next[secondIdx];
      next[secondIdx] = tmp;
      patch.activeCards = next;
      Object.assign(patch, markSkillUsedPure(state, skillId as any));
      patch.heroSkillBanner = `${cardA.name} ↔ ${cardB.name} 位置互换！`;
      sideEffects.push({ event: 'log:entry', payload: { type: 'skill', message: `先锋换阵：${cardA.name} 与 ${cardB.name} 互换位置。` } });
      const swapTrigger = checkSwapUpgrade(state, patch, sideEffects, enqueuedActions);
      if (swapTrigger) {
        patch.heroSkillBanner = '流转之符：选择一张牌进行升级。';
      }
      break;
    }
    case 'armor-pact': {
      const emptySlots: EquipmentSlotId[] = [];
      if (!state.equipmentSlot1) emptySlots.push('equipmentSlot1');
      if (!state.equipmentSlot2) emptySlots.push('equipmentSlot2');
      if (emptySlots.length === 0) {
        patch.heroSkillBanner = '需要至少一个空装备槽才能发动。';
        return applyPatch(state, patch, sideEffects);
      }
      if (emptySlots.length === 1) {
        const emptySlot = emptySlots[0];
        const bonuses = { ...(state.equipmentSlotBonuses ?? {}) };
        bonuses[emptySlot] = { ...(bonuses[emptySlot] ?? {}), shield: ((bonuses[emptySlot] as any)?.shield ?? 0) + 1 };
        patch.equipmentSlotBonuses = bonuses as typeof state.equipmentSlotBonuses;
        applySlotArmorBonusDelta(state, emptySlot, 1, patch);
        const otherSlot: EquipmentSlotId = emptySlot === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
        const otherItem = otherSlot === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
        if (otherItem) {
          patch[emptySlot] = otherItem;
          patch[otherSlot] = null as any;
          sideEffects.push({ event: 'log:entry', payload: { type: 'skill', message: `虚位铸甲：「${(otherItem as GameCardData).name}」移至强化槽位` } });
        }
        Object.assign(patch, markSkillUsedPure(state, skillId as any));
        patch.heroSkillBanner = '装备槽永久护甲 +1。';
      } else {
        patch.pendingHeroSkillAction = { skillId: 'armor-pact' as any, type: 'slot' };
        patch.heroSkillBanner = '选择空槽以获得 +1 永久护甲。';
        sideEffects.push({ event: 'hero:skillRequiresTarget', payload: { skillId: 'armor-pact', targetType: 'slot' } });
      }
      break;
    }
    case 'durability-for-blood': {
      const eq1 = state.equipmentSlot1 as GameCardData | null;
      const eq2 = state.equipmentSlot2 as GameCardData | null;
      if (!eq1 && !eq2) {
        patch.heroSkillBanner = 'Equip a weapon or shield before reinforcing.';
        return applyPatch(state, patch, sideEffects);
      }
      const repairableSlots: { id: EquipmentSlotId; item: GameCardData }[] = [];
      if (eq1) {
        const maxD = eq1.maxDurability ?? eq1.durability ?? 0;
        const curD = eq1.durability ?? maxD;
        if (maxD > 0 && curD < maxD) repairableSlots.push({ id: 'equipmentSlot1', item: eq1 });
      }
      if (eq2) {
        const maxD = eq2.maxDurability ?? eq2.durability ?? 0;
        const curD = eq2.durability ?? maxD;
        if (maxD > 0 && curD < maxD) repairableSlots.push({ id: 'equipmentSlot2', item: eq2 });
      }
      if (repairableSlots.length === 0) {
        patch.heroSkillBanner = 'No equipment needs repair.';
        return applyPatch(state, patch, sideEffects);
      }
      if (repairableSlots.length === 1) {
        const slot = repairableSlots[0];
        const maxDurability = slot.item.maxDurability ?? slot.item.durability ?? 0;
        const currentDurability = slot.item.durability ?? maxDurability;
        patch[slot.id] = { ...slot.item, durability: Math.min(maxDurability, currentDurability + 1) } as any;
        enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 1, source: 'general', selfInflicted: true });
        Object.assign(patch, markSkillUsedPure(state, skillId as any));
        patch.heroSkillBanner = 'Durability increased by 1.';
      } else {
        patch.pendingHeroSkillAction = { skillId: 'durability-for-blood' as any, type: 'slot' };
        patch.heroSkillBanner = 'Select an equipped slot to repair.';
        sideEffects.push({ event: 'hero:skillRequiresTarget', payload: { skillId: 'durability-for-blood', targetType: 'slot' } });
      }
      break;
    }
    case 'blood-strike': {
      const monsters = flattenActiveRowSlots(state.activeCards as ActiveRowSlots).filter(isDamageableTarget);
      if (monsters.length === 0) {
        patch.heroSkillBanner = 'No monsters available to strike.';
        return applyPatch(state, patch, sideEffects);
      }
      const baseDamage = 3;
      const spellDmg = computeSpellDamagePure(state, baseDamage);
      if (monsters.length === 1) {
        enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 2, source: 'general', selfInflicted: true });
        ensureEngaged(state, monsters[0], enqueuedActions);
        enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monsters[0].id, damage: spellDmg, source: 'blood-strike', isSpellDamage: true });
        Object.assign(patch, markSkillUsedPure(state, skillId as any));
        patch.heroSkillBanner = `Crimson Strike dealt ${spellDmg} damage.`;
      } else {
        patch.pendingHeroSkillAction = { skillId: 'blood-strike' as any, type: 'monster', baseDamage };
        patch.heroSkillBanner = `Select a monster to deal ${spellDmg} damage.`;
        sideEffects.push({ event: 'hero:skillRequiresTarget', payload: { skillId: 'blood-strike', targetType: 'monster' } });
      }
      break;
    }
    case 'graveyard-recall': {
      if (action.target === 'resolve-recall') {
        Object.assign(patch, markSkillUsedPure(state, skillId as any));
        break;
      }
      const hand = state.handCards as GameCardData[];
      if (hand.length < 2) {
        patch.heroSkillBanner = `手牌不足！需要至少 2 张手牌（当前 ${hand.length}）。`;
        return applyPatch(state, patch, sideEffects);
      }
      if ((state.discardedCards as GameCardData[]).length === 0) {
        patch.heroSkillBanner = '坟场中没有可召回的卡牌。';
        return applyPatch(state, patch, sideEffects);
      }
      sideEffects.push({
        event: 'hero:skillRequiresInteraction',
        payload: { skillId: 'graveyard-recall', step: 'discard-phase' },
      });
      break;
    }
    case 'discard-empower': {
      const hand = state.handCards as GameCardData[];
      const eq1 = state.equipmentSlot1 as GameCardData | null;
      const eq2 = state.equipmentSlot2 as GameCardData | null;
      if (hand.length === 0) {
        patch.heroSkillBanner = '需要至少 1 张手牌才能发动。';
        return applyPatch(state, patch, sideEffects);
      }
      if (!eq1 && !eq2) {
        patch.heroSkillBanner = '需要至少一个装备才能发动。';
        return applyPatch(state, patch, sideEffects);
      }
      // 走统一的「玩家选择 / 自动随机」分流：
      //  - 可弃手牌 ≥ 1 时弹窗让玩家挑（subEffect=discard-empower），由 RESOLVE_HAND_DISCARD_SELECTION 走 finalizeDiscardEmpower
      //  - 可弃手牌 = 0（全是诅咒）时自动跳过弃牌，但要保持原有的「至少 1 张手牌」拦截语义
      const promptText = '选择 1 张手牌弃回坟场（之后选择装备 +2 伤害 / 吸血）。';
      const result = requestOrAutoHandDiscard(state, patch, {
        sourceCardId: null,
        requiredCount: 1,
        title: '噬血砺锋',
        prompt: promptText,
        subEffect: 'discard-empower',
        context: { kind: 'discard-empower', skillId },
      });
      if (result.mode === 'modal') {
        patch.heroSkillBanner = promptText;
        return applyPatch(state, patch, sideEffects);
      }
      // auto 路径：可弃手牌不足 1 张，仍按原有规则提示并退出（不消耗技能）
      if (result.discarded.length === 0) {
        patch.heroSkillBanner = '没有可弃的手牌（手牌全为诅咒）。';
        return applyPatch(state, patch, sideEffects);
      }
      return finalizeDiscardEmpower(state, result.discarded, skillId, sideEffects, patch, []);
    }
    default:
      break;
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// RESOLVE_HERO_SKILL_TARGET — resolves pending interactive hero skill
// ---------------------------------------------------------------------------

function reduceResolveHeroSkillTarget(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_HERO_SKILL_TARGET' }>,
): ReduceResult {
  const pending = state.pendingHeroSkillAction;
  if (!pending) return noChange(state);

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  switch (pending.skillId) {
    case 'armor-pact': {
      const slotId = action.slotId;
      if (!slotId) return noChange(state);
      const slotItem = slotId === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
      if (slotItem) {
        patch.heroSkillBanner = '请选择一个空的装备槽。';
        return applyPatch(state, patch, sideEffects);
      }
      const bonuses = { ...(state.equipmentSlotBonuses ?? {}) };
      bonuses[slotId] = { ...(bonuses[slotId] ?? {}), shield: ((bonuses[slotId] as any)?.shield ?? 0) + 1 };
      patch.equipmentSlotBonuses = bonuses as typeof state.equipmentSlotBonuses;
      const otherSlot: EquipmentSlotId = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
      const otherItem = otherSlot === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
      if (otherItem) {
        patch[slotId] = otherItem;
        patch[otherSlot] = null as any;
        sideEffects.push({ event: 'log:entry', payload: { type: 'skill', message: `虚位铸甲：「${(otherItem as GameCardData).name}」移至强化槽位` } });
      }
      // Single-counter armor model: refill armor for the (newly-occupied) slot
      // since both perm.shield bumped and (potentially) the item just landed.
      // SET_EQUIPMENT_SLOT path already refills on equip; we only need to
      // explicitly handle the perm.shield delta here when we did NOT move an
      // item into the slot (i.e. it stays empty — no-op since slot is empty).
      // When otherItem moved in, patch[slotId] is set BEFORE refill so the
      // helper sees the new item and refills it to cap.
      refillSlotArmorToCap(state, slotId, patch);
      Object.assign(patch, markSkillUsedPure(state, pending.skillId as any));
      patch.pendingHeroSkillAction = null;
      patch.heroSkillBanner = '装备槽永久护甲 +1。';
      break;
    }
    case 'durability-for-blood': {
      const slotId = action.slotId;
      if (!slotId) return noChange(state);
      const slotItem = (slotId === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2) as GameCardData | null;
      if (!slotItem) {
        patch.heroSkillBanner = 'Equip an item in that slot first.';
        return applyPatch(state, patch, sideEffects);
      }
      const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
      const currentDurability = slotItem.durability ?? maxDurability;
      if (maxDurability === 0 || currentDurability >= maxDurability) {
        patch.heroSkillBanner = 'That item cannot be repaired further.';
        return applyPatch(state, patch, sideEffects);
      }
      patch[slotId] = { ...slotItem, durability: Math.min(maxDurability, currentDurability + 1) } as any;
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 1, source: 'general', selfInflicted: true });
      Object.assign(patch, markSkillUsedPure(state, pending.skillId as any));
      patch.pendingHeroSkillAction = null;
      patch.heroSkillBanner = 'Durability increased by 1.';
      break;
    }
    case 'blood-strike': {
      const monsterId = action.monsterId;
      if (!monsterId) return noChange(state);
      const baseDamage = (pending as any).baseDamage ?? 3;
      const spellDmg = computeSpellDamagePure(state, baseDamage);
      const targetMonster = flattenActiveRowSlots(state.activeCards as ActiveRowSlots).find(
        (m): m is GameCardData => !!m && m.id === monsterId,
      );
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 2, source: 'general', selfInflicted: true });
      if (targetMonster) ensureEngaged(state, targetMonster, enqueuedActions);
      enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId, damage: spellDmg, source: 'blood-strike', isSpellDamage: true });
      Object.assign(patch, markSkillUsedPure(state, pending.skillId as any));
      patch.pendingHeroSkillAction = null;
      patch.heroSkillBanner = `Crimson Strike dealt ${spellDmg} damage.`;
      break;
    }
    case 'discard-empower': {
      const slotId = action.slotId;
      if (!slotId) return noChange(state);
      const slotItem = (slotId === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2) as GameCardData | null;
      if (!slotItem) {
        patch.heroSkillBanner = '请选择有装备的槽位。';
        return applyPatch(state, patch, sideEffects);
      }
      patch.slotAttackBursts = { ...(state.slotAttackBursts ?? {}), [slotId]: 2 };
      patch.nextAttackLifestealSlot = slotId;
      Object.assign(patch, markSkillUsedPure(state, pending.skillId as any));
      patch.pendingHeroSkillAction = null;
      patch.heroSkillBanner = `${slotItem.name} 的下次攻击 +2 伤害 且 吸血！`;
      sideEffects.push({ event: 'log:entry', payload: { type: 'skill', message: `噬血砺锋：${slotItem.name} 下次攻击 +2 且吸血` } });
      break;
    }
    default:
      return noChange(state);
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// ADD_MAGIC_GAUGE
// ---------------------------------------------------------------------------

function reduceAddMagicGauge(
  state: GameState,
  action: Extract<GameAction, { type: 'ADD_MAGIC_GAUGE' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};

  const newMagicState = addMagicGauge(
    state.heroMagicState,
    action.gaugeType as any,
    action.amount,
  );

  if (newMagicState !== state.heroMagicState) {
    patch.heroMagicState = newMagicState;
  }

  sideEffects.push({
    event: 'hero:magicGaugeAdded',
    payload: { gaugeType: action.gaugeType, amount: action.amount },
  });

  // Check if gauge is now full
  const gaugeEntry = newMagicState[action.gaugeType as keyof typeof newMagicState];
  if (gaugeEntry && (gaugeEntry as any).unlocked) {
    const wasFull = isMagicGaugeFull(state.heroMagicState, action.gaugeType as any);
    const nowFull = isMagicGaugeFull(newMagicState, action.gaugeType as any);
    if (!wasFull && nowFull) {
      sideEffects.push({
        event: 'hero:magicGaugeFull',
        payload: { gaugeType: action.gaugeType },
      });
    }
  }

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// PERSUADE_MONSTER
// ---------------------------------------------------------------------------

function reducePersuadeMonster(
  state: GameState,
  action: Extract<GameAction, { type: 'PERSUADE_MONSTER' }>,
): ReduceResult {
  const monster = state.activeCards.find(c => c?.id === action.monsterId);
  if (!monster || monster.type !== 'monster') return noChange(state);

  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};

  // Compute effective cost (matches hook's getPersuadeEffectiveCost)
  const costReduction = state.persuadeDiscount?.costReduction ?? 0;
  const permCostMod = state.persuadeCostModifier ?? 0;
  let effectiveCost = Math.max(0, PERSUADE_COST + permCostMod - costReduction);
  const sameTargetDiscount = state.persuadeSameTargetCostHalve && state.lastPersuadeTargetId === action.monsterId;
  if (sameTargetDiscount) {
    effectiveCost = Math.floor(effectiveCost / 2);
  }

  if ((state.gold ?? 0) < effectiveCost) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'event', message: `金币不足，无法劝降（需要 ${effectiveCost} 金币）` },
    });
    return applyPatch(state, {}, sideEffects);
  }

  patch.gold = (state.gold ?? 0) - effectiveCost;

  // Track consecutive persuade attempts
  const isSameTarget = state.lastPersuadeTargetId === action.monsterId;
  patch.consecutivePersuadeCount = isSameTarget ? state.consecutivePersuadeCount + 1 : 1;
  patch.lastPersuadeTargetId = action.monsterId;

  // Clear "next persuade" temporary buffs after this attempt is launched.
  // The dice threshold has already been snapshotted into persuadeState.threshold
  // by openPersuadeModal(), so clearing here does NOT affect the roll outcome.
  //
  // Two fields contribute to "下次劝降率 +%":
  //   - persuadeAmuletBonus       (kept across waves; reset only on persuade
  //                                 attempt or INIT_GAME). Sources: 翻印之符,
  //                                 怀柔之印, 劝降之刃 / 劝降之锤 (per-hit),
  //                                 主卡组 Dagger onEquip, 劝降祝福 magic.
  //   - persuadeDiscount.rateBonus (event 际遇轮盘 / 部分 magic). costReduction
  //                                  on the same object is also "single-shot",
  //                                  so we null the whole thing as before.
  // permanentPersuadeBonus is permanent — NOT cleared.
  const clearedAmuletBonus = state.persuadeAmuletBonus ?? 0;
  patch.persuadeAmuletBonus = 0;
  patch.persuadeDiscount = null;
  if (clearedAmuletBonus > 0) {
    sideEffects.push({
      event: 'log:entry',
      payload: {
        type: 'system' as const,
        message: `「下次劝降率 +${clearedAmuletBonus}%」临时加成已消耗。`,
      },
    });
  }

  // Transition persuade modal to rolling phase
  if (state.persuadeState) {
    patch.persuadeState = { ...state.persuadeState, phase: 'rolling' };
  }

  sideEffects.push({
    event: 'log:entry',
    payload: {
      type: 'system' as const,
      message: `花费 ${effectiveCost} 金币尝试劝降 ${monster.name}…${sameTargetDiscount ? '（连劝减半）' : ''}`,
    },
  });

  sideEffects.push({
    event: 'hero:persuadeAttempt',
    payload: {
      monsterId: action.monsterId,
      monsterName: monster.name,
      cost: effectiveCost,
    },
  });

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// SWEEP
// ---------------------------------------------------------------------------

function reduceSweep(
  state: GameState,
  action: Extract<GameAction, { type: 'SWEEP' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];

  sideEffects.push({
    event: 'hero:sweep',
    payload: { targetIds: action.targetIds },
  });

  return applyPatch(state, {}, sideEffects);
}

// ---------------------------------------------------------------------------
// RESET_HERO_WAVE
// ---------------------------------------------------------------------------

function reduceResetHeroWave(state: GameState): ReduceResult {
  const patch = resetHeroWavePure(state);
  const sideEffects: SideEffect[] = [{
    event: 'log:entry',
    payload: { type: 'system' as const, message: '新一波开始，英雄技能和魔法已重置。' },
  }];
  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// ACTIVATE_HERO_MAGIC — trigger hero magic ability (monster-doom, revive-blessing, etc.)
// ---------------------------------------------------------------------------

function reduceActivateHeroMagic(
  state: GameState,
  action: Extract<GameAction, { type: 'ACTIVATE_HERO_MAGIC' }>,
): ReduceResult {
  const { magicId, origin } = action;
  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};
  const enqueuedActions: GameAction[] = [];

  const status = state.heroMagicState[magicId as keyof typeof state.heroMagicState];
  if (!status || !(status as any).unlocked) {
    sideEffects.push({ event: 'ui:banner', payload: { text: '尚未掌握该英雄魔法。' } });
    return applyPatch(state, patch, sideEffects);
  }

  if (state.pendingHeroMagicAction) {
    sideEffects.push({ event: 'ui:banner', payload: { text: '请先完成当前的英雄魔法动作。' } });
    return applyPatch(state, patch, sideEffects);
  }

  if (origin === 'gauge') {
    if (!isMagicGaugeFull(state.heroMagicState, magicId as any)) {
      sideEffects.push({ event: 'ui:banner', payload: { text: '魔法仍在充能中。' } });
      return applyPatch(state, patch, sideEffects);
    }
    // 仪表满即可发动，没有"每波只能用一次"限制——发动后仪表清零，需重新充能。
  }

  switch (magicId) {
    case 'revive-blessing': {
      const equipSlots: EquipmentSlotId[] = [];
      if (state.equipmentSlot1) equipSlots.push('equipmentSlot1');
      if (state.equipmentSlot2) equipSlots.push('equipmentSlot2');

      if (equipSlots.length === 0) {
        sideEffects.push({ event: 'ui:banner', payload: { text: '没有可赐福的装备。' } });
        return applyPatch(state, patch, sideEffects);
      }

      if (equipSlots.length === 1) {
        const sid = equipSlots[0];
        const item = sid === 'equipmentSlot1' ? state.equipmentSlot1! : state.equipmentSlot2!;
        const REVIVE_BLESSING_COST = 3;
        patch.hp = Math.max(1, state.hp - REVIVE_BLESSING_COST);
        patch[sid] = { ...item, hasEquipmentRevive: true, equipmentReviveUsed: false } as any;
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'magic', message: `复生祝福：失去 ${REVIVE_BLESSING_COST} 生命，${item.name} 获得复生能力` },
        });
        sideEffects.push({ event: 'ui:banner', payload: { text: `${item.name} 获得了复生祝福！` } });
        enqueuedActions.push({ type: 'COMPLETE_HERO_MAGIC', magicId, origin });
      } else {
        patch.pendingHeroMagicAction = {
          id: 'revive-blessing',
          step: 'slot-select',
          origin,
          prompt: '选择一个装备赋予复生。',
        } as any;
        sideEffects.push({ event: 'ui:banner', payload: { text: '选择一个装备赋予复生。' } });
      }
      return applyPatch(state, patch, sideEffects, enqueuedActions.length > 0 ? enqueuedActions : undefined);
    }

    case 'monster-doom': {
      // 灭世裁决: act on **every stacked equipment piece** (main + each
      // reserve item) in equipmentSlot1 / equipmentSlot2. Each piece:
      //   - revive check independently. Revived stays in original stack
      //     position at 1 durability.
      //   - non-revived fires last-words, then routes to graveyard / recycle.
      // Monster debuff scales with **destroyedCount** (revived doesn't count
      // toward the debuff — preserves original 灭世裁决 semantic).
      // Same stacked-equipment treatment as 弃装重铸 (knight:discard-rebuild).
      type StackPiece = { item: GameCardData; slotId: EquipmentSlotId; isMain: boolean };
      // Collect per-slot stacks. `stack` is top-to-bottom (visual order):
      //   index 0 = main, index 1 = reserve[len-1] (top of reserve), ...
      const slotStacks: { slotId: EquipmentSlotId; stack: StackPiece[] }[] = [];
      for (const sid of ['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]) {
        const main = sid === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
        if (!main) continue;
        const reserve = (sid === 'equipmentSlot1'
          ? state.equipmentSlot1Reserve
          : state.equipmentSlot2Reserve) as EquipmentItem[];
        const stack: StackPiece[] = [{ item: main, slotId: sid, isMain: true }];
        for (let i = reserve.length - 1; i >= 0; i--) {
          stack.push({ item: reserve[i] as GameCardData, slotId: sid, isMain: false });
        }
        slotStacks.push({ slotId: sid, stack });
      }

      let destroyedCount = 0;
      const destroyedCards: GameCardData[] = [];

      const amuletEffects = computeAmuletEffectsForState(state) ?? createEmptyAmuletEffects();

      for (const { slotId: sid, stack } of slotStacks) {
        const survivorsTopDown: GameCardData[] = [];

        for (const { item } of stack) {
          const isMonsterEquip = item.type === 'monster';
          const nativeRevive = isMonsterEquip && item.hasRevive && !item.reviveUsed;
          const equipRevive = item.hasEquipmentRevive && !item.equipmentReviveUsed;

          if (nativeRevive || equipRevive) {
            const revived = nativeRevive
              ? { ...item, durability: 1, reviveUsed: true }
              : { ...item, durability: 1, equipmentReviveUsed: true };
            survivorsTopDown.push(revived);
            sideEffects.push({
              event: 'log:entry',
              payload: { type: 'equip', message: `${item.name} 复生！以 1 耐久复活！` },
            });
          } else {
            // Trigger last-words without slot mutation (we own the slot
            // reconstruction below). Pass current `patch` so accumulated
            // mutations compose correctly across multiple destroyed pieces.
            const lwResult = computeEquipmentDisplacementLastWords(
              state,
              sid,
              item,
              amuletEffects,
              { ...patch, rng: patch.rng ?? state.rng },
            );
            sideEffects.push(...lwResult.sideEffects);
            Object.assign(patch, lwResult.patch);
            patch.rng = lwResult.rng;
            if (lwResult.drawFromBackpack > 0) {
              enqueuedActions.push({ type: 'DRAW_FROM_BACKPACK', count: lwResult.drawFromBackpack });
            }
            if (lwResult.classCardDraw > 0) {
              sideEffects.push({
                event: 'equipment:classCardDraw',
                payload: { count: lwResult.classCardDraw, source: item.name },
              });
            }
            // Perm-flagged equipment routes to the recycle bag, not the
            // graveyard. Mirrors DISPOSE_EQUIPMENT_CARD's routing decision so
            // 永恒铭刻 装备 被灭世裁决摧毁后仍能回到回收袋。
            if (shouldRouteEquipmentToPermRecycle(item)) {
              enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card: item });
            } else {
              enqueuedActions.push({ type: 'ADD_TO_GRAVEYARD', card: item });
            }
            destroyedCount++;
            destroyedCards.push(item);
          }
        }

        // Rebuild slot from survivors. Compact top-down to preserve the UI
        // invariant: reserve.length > 0 ⇒ main != null. Top survivor → main,
        // rest → reserve in storage order (reserve[len-1] = next-to-promote =
        // 2nd survivor from top).
        const reserveKey: 'equipmentSlot1Reserve' | 'equipmentSlot2Reserve' =
          sid === 'equipmentSlot1' ? 'equipmentSlot1Reserve' : 'equipmentSlot2Reserve';
        if (survivorsTopDown.length === 0) {
          patch[sid] = null as unknown as EquipmentItem;
          patch[reserveKey] = [] as EquipmentItem[];
        } else {
          patch[sid] = survivorsTopDown[0] as EquipmentItem;
          patch[reserveKey] = survivorsTopDown.slice(1).reverse() as EquipmentItem[];
        }
      }

      // 招灵书印：灭世裁决摧毁装备 = 强制销毁。装备销毁不影响护符栏 →
      // surviving = state.amuletSlots。复生的装备不算 destroyed（招灵书印只在真正
      // 销毁时触发；跟下面的怪物 debuff 计数语义一致——也是只看真正摧毁数）。
      maybeTriggerDeleteDrawForDestroy({
        destroyedCards,
        survivingAmuletSlots: state.amuletSlots as GameCardData[],
        sideEffects,
        enqueuedActions,
        reasonLabel: '灭世裁决摧毁装备',
      });

      if (destroyedCount > 0) {
        const totalDebuff = destroyedCount * 2;
        const updatedCards = (state.activeCards as any[]).map(slot => {
          if (!slot || slot.type !== 'monster') return slot;
          const newAtk = Math.max(1, (slot.attack ?? slot.value) - totalDebuff);
          const newMaxHp = Math.max(1, (slot.maxHp ?? slot.hp ?? slot.value) - totalDebuff);
          const newHp = Math.min(slot.hp ?? slot.value, newMaxHp);
          return { ...slot, attack: newAtk, value: newAtk, maxHp: newMaxHp, hp: newHp };
        });
        patch.activeCards = updatedCards;
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'magic', message: `灭世裁决：摧毁 ${destroyedCount} 件装备，所有怪物 -${totalDebuff}攻/-${totalDebuff}血上限！` },
        });
        sideEffects.push({
          event: 'ui:banner',
          payload: { text: `灭世裁决！摧毁 ${destroyedCount} 件装备，怪物全体 -${totalDebuff}/-${totalDebuff}！` },
        });
      } else {
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'magic', message: '灭世裁决发动但没有装备可摧毁。' },
        });
        sideEffects.push({ event: 'ui:banner', payload: { text: '灭世裁决：没有装备可摧毁。' } });
      }

      enqueuedActions.push({ type: 'COMPLETE_HERO_MAGIC', magicId, origin });
      return applyPatch(state, patch, sideEffects, enqueuedActions.length > 0 ? enqueuedActions : undefined);
    }

    case 'holy-light': {
      const heroMaxHp = computeMaxHp(state);
      const healed = Math.max(0, heroMaxHp - state.hp);
      patch.hp = heroMaxHp;
      const banner = healed > 0 ? `圣光恢复了 ${healed} 点生命。` : '生命已满，圣光充能被清空。';
      patch.heroSkillBanner = banner;
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'magic', message: `圣光发动（回满生命）：${banner}` },
      });
      enqueuedActions.push({ type: 'COMPLETE_HERO_MAGIC', magicId: 'holy-light', origin });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'berserker-rage': {
      patch.berserkerRageActive = true;
      patch.berserkerSlotUsed = {};
      patch.heroSkillBanner = '狂战发动：直到下次瀑布前，每个武器栏每回合可多攻击一次，且所有攻击不消耗耐久。';
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'magic', message: '狂战发动！' },
      });
      enqueuedActions.push({ type: 'COMPLETE_HERO_MAGIC', magicId, origin });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    default:
      sideEffects.push({
        event: 'hero:magicActivated',
        payload: { magicId, origin },
      });
      return applyPatch(state, patch, sideEffects);
  }
}

// ---------------------------------------------------------------------------
// COMPLETE_HERO_MAGIC — mark magic as used, reset gauge
// ---------------------------------------------------------------------------

function reduceCompleteHeroMagic(
  state: GameState,
  action: Extract<GameAction, { type: 'COMPLETE_HERO_MAGIC' }>,
): ReduceResult {
  const { magicId, origin } = action;
  const patch: Partial<GameState> = {};
  const sideEffects: SideEffect[] = [];

  let magicState = state.heroMagicState;

  if (origin === 'gauge') {
    magicState = resetMagicGauge(magicState, magicId as any);
  }

  patch.heroMagicState = magicState;
  patch.pendingHeroMagicAction = null;

  sideEffects.push({
    event: 'hero:magicCompleted',
    payload: { magicId, origin },
  });

  // 英雄魔法完成时纳入 transform 链。COMPLETE_HERO_MAGIC 是所有成功完成路径
  // （同步：holy-light / monster-doom / berserker-rage / revive-blessing 单装备；
  // 交互：revive-blessing 多装备 → APPLY_REVIVE_BLESSING）的汇聚点。
  // 失败的早期退出（未掌握、pending、未充能、no-equipment 等）不会走到这里。
  const syntheticHeroMagicCard = {
    id: magicId,
    type: 'hero-magic',
    name: magicId,
    value: 0,
  } as GameCardData;
  const enqueuedActions: GameAction[] = [
    { type: 'APPLY_TRANSFORM_CATEGORY', card: syntheticHeroMagicCard },
  ];

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// RESOLVE_HERO_MAGIC_TARGET — continuation for interactive hero magic
// ---------------------------------------------------------------------------

function reduceResolveHeroMagicTarget(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_HERO_MAGIC_TARGET' }>,
): ReduceResult {
  const pending = state.pendingHeroMagicAction as any;
  if (!pending) return noChange(state);

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  if (pending.id === 'revive-blessing' && action.slotId) {
    enqueuedActions.push({ type: 'APPLY_REVIVE_BLESSING', slotId: action.slotId });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  } else {
    return noChange(state);
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions.length > 0 ? enqueuedActions : undefined);
}

// ---------------------------------------------------------------------------
// APPLY_REVIVE_BLESSING — grant equipment revive to a specific slot
// ---------------------------------------------------------------------------

function reduceApplyReviveBlessing(
  state: GameState,
  action: Extract<GameAction, { type: 'APPLY_REVIVE_BLESSING' }>,
): ReduceResult {
  const { slotId } = action;
  const item = slotId === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
  if (!item) return noChange(state);

  const REVIVE_BLESSING_COST = 3;
  const patch: Partial<GameState> = {};
  const sideEffects: SideEffect[] = [];

  patch.hp = Math.max(1, state.hp - REVIVE_BLESSING_COST);
  patch[slotId] = { ...item, hasEquipmentRevive: true, equipmentReviveUsed: false } as any;
  patch.pendingHeroMagicAction = null;

  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'magic', message: `复生祝福：失去 ${REVIVE_BLESSING_COST} 生命，${item.name} 获得复生能力` },
  });
  sideEffects.push({ event: 'ui:banner', payload: { text: `${item.name} 获得了复生祝福！` } });

  // Determine origin from pending action
  const pending = state.pendingHeroMagicAction;
  const origin = (pending as any)?.origin ?? 'gauge';

  const enqueuedActions: GameAction[] = [
    { type: 'COMPLETE_HERO_MAGIC', magicId: 'revive-blessing', origin },
  ];

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// CHECK_HONOR_SWEEP_UPGRADES — Phase 8D
// ---------------------------------------------------------------------------

function reduceCheckHonorSweepUpgrades(state: GameState): ReduceResult {
  if (state.honorSweepUpgradesPending <= 0) return noChange(state);
  if (state.activeMonsterReward || state.monsterRewardQueue.length > 0) return noChange(state);
  if (state.discoverModalOpen || state.eventModalOpen) return noChange(state);

  const occupied = (state.activeCards as GameCardData[]).filter(c => c && !(c as any).isGhost).length;
  const emptySlots = DUNGEON_COLUMN_COUNT - occupied;
  if (emptySlots >= 4) return noChange(state);

  const count = state.honorSweepUpgradesPending;
  return applyPatch(state, {
    honorSweepUpgradesPending: 0,
    upgradeModalOpen: true,
    upgradeModalMaxCount: count,
    heroSkillBanner: `战血横扫：选择至多 ${count} 张牌升级！`,
  });
}

// ---------------------------------------------------------------------------
// Helpers — shared utilities for the magic selection reducers
// ---------------------------------------------------------------------------

function getSlotItem(state: GameState, slotId: EquipmentSlotId): GameCardData | null {
  return (slotId === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2) as GameCardData | null;
}

function applyFinalizeMagic(
  state: GameState,
  patch: Partial<GameState>,
  sideEffects: SideEffect[],
  enqueuedActions: GameAction[],
  card: GameCardData,
  banner: string,
  opts?: { dealtDamage?: boolean },
): ReduceResult {
  patch.pendingMagicAction = null;
  patch.heroSkillBanner = banner;
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: opts?.dealtDamage });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

/**
 * 法术回响（Spell Echo）的「再次弹窗」通用 helper。
 *
 * 用于模态/交互类魔法卡：当解析完玩家的一次选择后，若该卡是被回响触发，
 * 则需要再次弹出同样的模态让玩家做第二次选择。
 *
 * 调用约定：
 * - 在 reducer 完成「这一次选择的全部副作用」之后（写入 patch、入队 side
 *   effects、入队 enqueuedActions），调用本 helper。
 * - `nextPending` 是「再弹一次」时要写回 `patch.pendingMagicAction` 的对象，
 *   调用方必须自己计算（含 echoRemaining-1、prompt 文案、其他必要字段）。
 *   helper 只负责通用收尾：写 pending、写 banner、写 log、`applyPatch`，
 *   并 *不* 入队 FINALIZE_MAGIC_CARD（因为还没结束）。
 * - 若 `echoRemaining <= 1`（即这是最后一次或非回响），返回 `null`，调用方
 *   接着走自己的「最终结算」分支（通常是 `applyFinalizeMagic`）。
 *
 * 如果调用方在「重弹」前希望先 drain 已入队的 enqueuedActions，可以传入
 * `enqueuedActions` 让 helper 一并附到 `applyPatch`；reducer 的 drain 会按顺序
 * 先把这些动作跑完，再把 UI 渲染下一次的弹窗。
 */
export function maybeRepromptEcho(
  state: GameState,
  patch: Partial<GameState>,
  sideEffects: SideEffect[],
  enqueuedActions: GameAction[],
  prevPending: { card: GameCardData; echoRemaining?: number },
  nextPending: PendingMagicAction,
  banner: string,
): ReduceResult | null {
  const remainingAfter = (prevPending.echoRemaining ?? 1) - 1;
  if (remainingAfter <= 0) return null;
  patch.pendingMagicAction = nextPending;
  patch.heroSkillBanner = banner;
  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'magic', message: `法术回响：${prevPending.card.name} — ${banner}` },
  });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

function isMonsterEngaged(state: GameState, monsterId: string): boolean {
  return (state.combatState?.engagedMonsterIds ?? []).includes(monsterId);
}

function ensureEngaged(state: GameState, monster: GameCardData, enqueuedActions: GameAction[]): void {
  if (!isMonsterEngaged(state, monster.id)) {
    enqueuedActions.push({ type: 'BEGIN_COMBAT', monster, initiator: 'hero' });
  }
}

/**
 * Local thin wrapper around the shared `checkPersuadeOnTempAttack` from
 * `../equipment` — kept so all existing callsites in this file continue to
 * compile unchanged. The shared helper is patch-aware (composes correctly
 * across multiple calls in the same reducer step).
 */
function checkPersuadeOnTempAttack(
  state: GameState,
  patch: Partial<GameState>,
  sideEffects: SideEffect[],
): void {
  checkPersuadeOnTempAttackShared(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// RESOLVE_MAGIC_SLOT_SELECTION — Phase 5a
// ---------------------------------------------------------------------------

function reduceMagicSlotSelection(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_MAGIC_SLOT_SELECTION' }>,
): ReduceResult {
  const pending = state.pendingMagicAction as PendingMagicAction | null;
  if (!pending || pending.step !== 'slot-select') return noChange(state);

  const { slotId } = action;
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};
  const slotItem = getSlotItem(state, slotId);

  switch (pending.effect) {
    case 'honor-sweep': {
      const echoMulHS = (pending as any).echoMultiplier ?? 1;
      const echoTagHS = echoMulHS > 1 ? `（回响×${echoMulHS}）` : '';
      const waveDamage = computeHonorSweepWaveDamagePure(state, slotId) * echoMulHS;
      if (!slotItem || (slotItem.type !== 'weapon' && slotItem.type !== 'monster')) {
        patch.heroSkillBanner = '请选择已装备的武器。';
        return applyPatch(state, patch, sideEffects);
      }
      const monsters = flattenActiveRowSlots(state.activeCards as ActiveRowSlots).filter(isDamageableTarget);
      if (monsters.length === 0) {
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, '激活行没有怪物。');
      }
      if (waveDamage <= 0) {
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, '当前攻击力为 0，未造成伤害。');
      }

      let killCount = 0;
      for (const m of monsters) {
        ensureEngaged(state, m, enqueuedActions);
        const monsterCol = (state.activeCards as (GameCardData | null)[]).findIndex(c => c?.id === m.id);
        if (monsterCol >= 0 && isMonsterMagicImmuneByBuilding(state.activeCards as ActiveRowSlots, state.activeCardStacks ?? {}, monsterCol)) {
          continue;
        }
        let effectiveDmg = waveDamage;
        if (m.spellDamageReduction && !m.isStunned) {
          effectiveDmg = Math.max(1, Math.floor(effectiveDmg * (1 - m.spellDamageReduction)));
        }
        if ((m as any).swarmBugletShield && !m.isStunned && (state.activeCards as (GameCardData | null)[]).some(c => c && (c as any).isBuglet)) {
          effectiveDmg = 0;
        }
        if (effectiveDmg > 0) {
          const result = damageMonsterWithLayerOverflow(m, effectiveDmg, 1);
          if ((result.currentLayer ?? 0) <= 0 || (result.hp ?? 0) <= 0) killCount++;
        }
        enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: m.id, damage: waveDamage, source: 'honor-sweep', isSpellDamage: true });
      }
      sideEffects.push({ event: 'hero:sweepDamage', payload: { monsterIds: monsters.map(m => m.id), damage: waveDamage, staggerMs: 100, isSpellDamage: true } });

      const killMsg = killCount > 0 ? `，击杀 ${killCount} 只怪物` : '';
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `战血横扫：${slotItem.name} 对激活行所有怪物造成 ${waveDamage} 点法术伤害${killMsg}。` } });
      if (killCount > 0) {
        sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `战血横扫：击杀奖励，选择至多 ${killCount} 张牌升级！` } });
        patch.honorSweepUpgradesPending = killCount;
        enqueuedActions.push({ type: 'CHECK_HONOR_SWEEP_UPGRADES' });
      }
      const banner = `战血横扫：${waveDamage} 点伤害（${slotItem.name}）${killCount > 0 ? `，击杀 ${killCount} 只，选择牌升级！` : '。'}${echoTagHS}`;
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, banner);
    }

    case 'weapon-sweep': {
      if (!slotItem || (slotItem.type !== 'weapon' && slotItem.type !== 'monster')) {
        patch.heroSkillBanner = '请选择已装备的武器。';
        return applyPatch(state, patch, sideEffects);
      }
      const echoMulWS = (pending as any).echoMultiplier ?? 1;
      const echoTagWS = echoMulWS > 1 ? `（回响×${echoMulWS}）` : '';
      const waveDamage = (computeHonorSweepWaveDamagePure(state, slotId) + (pending.card.amplifyBonus ?? 0)) * echoMulWS;
      const monsters = flattenActiveRowSlots(state.activeCards as ActiveRowSlots).filter(isDamageableTarget);
      if (monsters.length === 0) {
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, '激活行没有怪物。');
      }
      if (waveDamage <= 0) {
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, '当前攻击力为 0，未造成伤害。');
      }
      for (const m of monsters) {
        ensureEngaged(state, m, enqueuedActions);
        enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: m.id, damage: waveDamage, source: 'weapon-sweep', isSpellDamage: true });
      }
      sideEffects.push({ event: 'hero:sweepDamage', payload: { monsterIds: monsters.map(m => m.id), damage: waveDamage, staggerMs: 100, isSpellDamage: true } });
      const newTempAtk = ((state as any).slotTempAttack ?? {})[slotId] ?? 0;
      patch.slotTempAttack = { ...((state as any).slotTempAttack ?? {}), [slotId]: newTempAtk - 3 };
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `利刃风暴：${slotItem.name} 对激活行所有怪物造成 ${waveDamage} 点伤害，该栏临时攻击 -3。${echoTagWS}` } });
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `利刃风暴：${waveDamage} 点伤害（${slotItem.name}，不耗耐久），该武器栏临时攻击 -3。${echoTagWS}`);
    }

    case 'weapon-burst': {
      const label = slotItem ? slotItem.name : (slotId === 'equipmentSlot1' ? '左装备栏' : '右装备栏');
      const burstBase = 2 + 2 * (pending.card.upgradeLevel ?? 0);
      const burstAmount = burstBase * ((pending as any).echoMultiplier ?? 1);
      const curTempAtk = ((state as any).slotTempAttack ?? {})[slotId] ?? 0;
      patch.slotTempAttack = { ...((state as any).slotTempAttack ?? {}), [slotId]: curTempAtk + burstAmount };
      checkPersuadeOnTempAttack(state, patch, sideEffects);
      const echoText = ((pending as any).echoMultiplier ?? 1) > 1 ? '（回响×2）' : '';
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `${label} 临时攻击力 +${burstAmount}。${echoText}`);
    }

    case 'temp-attack-double': {
      // 锋芒倍增：选定装备栏的临时攻击 +N 后整体翻倍。
      // 升级表（addAmounts）：L0 +1 / L1 +2
      // 公式：final = (curTempAtk + N*echo) * 2
      // 允许选择空槽（与 weapon-burst / weapon-manual 一致），效果保留至该槽
      // 装备进入时仍生效。
      // 实际加成在 magic.ts:knightTempAttackDouble 处再读一次同样的 upgradeLevel
      // 表（addAmounts），handler 本身只更新卡面文案。
      const label = slotItem ? slotItem.name : (slotId === 'equipmentSlot1' ? '左装备栏' : '右装备栏');
      const echoMul = (pending as any).echoMultiplier ?? 1;
      const addAmounts = [1, 2];
      const baseAdd = addAmounts[pending.card.upgradeLevel ?? 0] ?? addAmounts[addAmounts.length - 1];
      const addAmt = baseAdd * echoMul;
      const curTempAtk = ((state as any).slotTempAttack ?? {})[slotId] ?? 0;
      const afterAdd = curTempAtk + addAmt;
      const finalVal = afterAdd * 2;
      patch.slotTempAttack = { ...((state as any).slotTempAttack ?? {}), [slotId]: finalVal };
      checkPersuadeOnTempAttack(state, patch, sideEffects);
      const echoText = echoMul > 1 ? '（回响×2）' : '';
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `锋芒倍增：${label} 临时攻击 +${addAmt} 后翻倍：${curTempAtk} → ${finalVal}。${echoText}`);
    }

    case 'temp-attack-armor-draw': {
      // 攻防协律：选定装备栏 +N 临时攻击 +N 临时护甲，并抽 1 张牌。
      // N = 2/4/6（升级 0/1/2），抽牌固定 1 张。
      // Echo (A 类)：N 与抽牌都 ×echoMultiplier；空槽允许选择，效果保留。
      const label = slotItem ? slotItem.name : (slotId === 'equipmentSlot1' ? '左装备栏' : '右装备栏');
      const echoMul = (pending as any).echoMultiplier ?? 1;
      const baseAmounts = [2, 4, 6];
      const baseAmt = baseAmounts[pending.card.upgradeLevel ?? 0] ?? 2;
      const totalAmt = baseAmt * echoMul;
      const drawCount = 1 * echoMul;
      const curTempAtk = ((state as any).slotTempAttack ?? {})[slotId] ?? 0;
      const curTempArm = ((state as any).slotTempArmor ?? {})[slotId] ?? 0;
      patch.slotTempAttack = { ...((state as any).slotTempAttack ?? {}), [slotId]: curTempAtk + totalAmt };
      patch.slotTempArmor = { ...((state as any).slotTempArmor ?? {}), [slotId]: curTempArm + totalAmt };
      if (totalAmt !== 0) applySlotArmorBonusDelta(state, slotId, totalAmt, patch);
      checkPersuadeOnTempAttack(state, patch, sideEffects);
      const drawnNames: string[] = [];
      for (let i = 0; i < drawCount; i++) {
        const current = { ...state, ...patch };
        const { card: drawn, patch: drawPatch } = drawFromBackpackToHandPure(current);
        Object.assign(patch, drawPatch);
        if (drawn) {
          sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: drawn.id, source: 'backpack' } });
          drawnNames.push(drawn.name);
        }
      }
      applyMirrorCopySummonProgress(state, patch, sideEffects, enqueuedActions, drawnNames.length);
      const drawMsg = drawnNames.length > 0 ? `，抽到「${drawnNames.join('、')}」` : '';
      const echoTag = echoMul > 1 ? `（回响×${echoMul}）` : '';
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `攻防协律：${label} +${totalAmt} 临攻 +${totalAmt} 临护${drawMsg}。${echoTag}`);
    }

    case 'amplify-equipment-shift': {
      // 淬铸迁位：选定装备栏 → 同名增幅（按 NAME 全场累计）；若另一栏为空，
      // 把所选装备从原栏移到空位（原栏走 clearSlotAndPromoteReserve 自动 promote）。
      //
      // 设计要点：
      // - 只允许选「有装备」的栏：空槽则拒绝（banner 提示 + 不消耗 magic）。
      //   reducer 走 applyPatch 而非 applyFinalizeMagic，pendingMagicAction 保留，
      //   玩家可重选；与 durability-charge-burst 的拒绝写法一致。
      // - 增幅范围按 cardName 走 AMPLIFY_CARDS_BY_NAME：影响所有同名副本（手牌 /
      //   背包 / 装备槽 / 储备 / 坟场 / 回收袋 / 职业牌组 / 地下城行）—— 包含被选中
      //   的这件装备本身（无论它接下来是否被搬到空位）。
      // - Echo (A 类)：增幅 amount = N × echoMultiplier（多次叠加），通过单一
      //   AMPLIFY_CARDS_BY_NAME action 一次写入即等价于 N 次 +1（因为该 reducer
      //   按 cardName 累计 amplifiedCardBonus）；「移到空位」最多发生 1 次（不在
      //   echo 循环内重复）。
      // - 移动语义参考 `applyEquipSwap` (potion-effects.ts)：
      //   1. 把所选装备的副本写到空槽（带 fromSlot 改为新槽，避免 stale fromSlot
      //      触发 GameBoard isCardFromEquipmentSlot 路径误判）；
      //   2. 原槽走 clearSlotAndPromoteReserve（reserve 顶上来或置 null）。
      // - 升级表（amplifyAmounts）：L0 +1 / L1 +2。实际数值在 magic.ts:
      //   knightAmplifyEquipmentShift 处再读一次同样的 upgradeLevel 表。
      if (!slotItem) {
        patch.heroSkillBanner = '该装备栏为空，请选择有装备的栏。';
        return applyPatch(state, patch, sideEffects);
      }
      const echoMul = (pending as any).echoMultiplier ?? 1;
      const amplifyAmounts = [1, 2];
      const baseAmplify = amplifyAmounts[pending.card.upgradeLevel ?? 0]
        ?? amplifyAmounts[amplifyAmounts.length - 1];
      const amplifyAmount = baseAmplify * echoMul;
      const targetName = slotItem.name;

      // 1) 全场同名增幅
      enqueuedActions.push({
        type: 'AMPLIFY_CARDS_BY_NAME',
        cardName: targetName,
        amount: amplifyAmount,
        source: '淬铸迁位',
      });

      // 2) 若另一栏为空，把所选装备搬过去；最多发生一次（echo 不重复）
      const otherSlotId: EquipmentSlotId = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
      const otherItem = state[otherSlotId];
      let movedTo: EquipmentSlotId | null = null;
      if (!otherItem) {
        (patch as any)[otherSlotId] = { ...slotItem, fromSlot: otherSlotId };
        clearSlotAndPromoteReserve(state, slotId, patch);
        movedTo = otherSlotId;
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'magic', message: `淬铸迁位：${targetName} 移到${otherSlotId === 'equipmentSlot1' ? '左' : '右'}槽。` },
        });
      }

      const echoTag = echoMul > 1 ? `（回响×${echoMul}）` : '';
      const moveMsg = movedTo
        ? `，并换到${movedTo === 'equipmentSlot1' ? '左' : '右'}槽`
        : '';
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'magic', message: `淬铸迁位：${targetName} 增幅 +${amplifyAmount}${moveMsg}。${echoTag}` },
      });
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `淬铸迁位：${targetName} +${amplifyAmount}${moveMsg}。${echoTag}`);
    }

    case 'durability-charge-burst': {
      // 蓄能裂击：装备 +1 上限 +1 耐久；若加完后耐久==4 则随机激活行怪物 -1 血层、装备 -3。
      // - 拒绝：空槽 / 没有耐久概念的装备（maxDur == 0），且不消耗 magic。
      // - Echo (A 类)：整套效果在同一栏顺序执行 echoMul 次（每轮重新读耐久 / 怪物列表）。
      // - 怪物伤害用 enqueue DEAL_DAMAGE_TO_MONSTER（damage = 该层满 HP）。
      //   走标准战斗管线 → 自动处理死亡 / 流血效果 / discoverHit 等。
      //   注意：对 Golem(maxDamagePerHit=5)、buglet shield 等特殊抗性怪可能不破层
      //   —— 这是与命运之刃同样的边缘 case，符合"按层 HP 数值打"语义。
      // - 若没怪物可选，伤害跳过、装备耐久仍 -2（用户明确要求）。
      // - 触发条件按卡面字面意思「加完后耐久==4」判定，包含 4/4 已满蓄能的装备：
      //   触发后 -3 自带保护，echo 第二轮的 oldDur=1，不会形成假触发循环。
      if (!slotItem) {
        patch.heroSkillBanner = '该装备栏为空。';
        return applyPatch(state, patch, sideEffects);
      }
      const initialMaxDur = (slotItem as any).maxDurability ?? slotItem.durability ?? 0;
      if (initialMaxDur === 0) {
        patch.heroSkillBanner = '这件装备没有耐久度。';
        return applyPatch(state, patch, sideEffects);
      }
      const echoMul = (pending as any).echoMultiplier ?? 1;
      let currentItem: any = { ...slotItem };
      let currentRng = state.rng;
      const summaryParts: string[] = [];
      let triggerCount = 0;
      let damagedMonsterCount = 0;

      for (let iter = 0; iter < echoMul; iter++) {
        const oldMaxDur = currentItem.maxDurability ?? currentItem.durability ?? 0;
        const oldDur = currentItem.durability ?? oldMaxDur;
        const newMaxDur = clampMaxDurability(oldMaxDur + 1);
        const afterAddDur = Math.min(oldDur + 1, newMaxDur);
        currentItem = { ...currentItem, maxDurability: newMaxDur, durability: afterAddDur };

        if (afterAddDur === DURABILITY_CAP) {
          triggerCount += 1;
          const monsters = flattenActiveRowSlots(
            // 用最新的 patch.activeCards（前一轮可能已更新），否则回落到 state。
            (patch.activeCards ?? state.activeCards) as ActiveRowSlots,
          ).filter(isDamageableTarget);
          let monsterMsg = '';
          if (monsters.length > 0) {
            const [pickedIdx, newRng] = nextInt(currentRng, 0, monsters.length - 1);
            currentRng = newRng;
            const target = monsters[pickedIdx];
            ensureEngaged({ ...state, ...patch }, target, enqueuedActions);
            const layerHp = target.hp ?? 0;
            enqueuedActions.push({
              type: 'DEAL_DAMAGE_TO_MONSTER',
              monsterId: target.id,
              damage: layerHp,
              source: 'durability-charge-burst',
              isSpellDamage: true,
            });
            damagedMonsterCount += 1;
            monsterMsg = `→ ${target.name} 受到 1 血层伤害`;
          } else {
            monsterMsg = '→ 场上无怪物';
          }
          const afterPenalty = Math.max(0, afterAddDur - 3);
          // Mine-damage-boost：蓄能裂击的 -3 / -2 / -1 都算耐久减少。
          // afterAddDur (+1 后的状态) → afterPenalty 的 delta 才是「耐久减少」净值。
          const durLostThisIter = Math.max(0, afterAddDur - afterPenalty);
          if (durLostThisIter > 0) {
            accumulateMineDamageBoost(state, currentItem as GameCardData, durLostThisIter, patch, sideEffects);
          }
          currentItem = { ...currentItem, durability: afterPenalty };
          summaryParts.push(`第${iter + 1}轮：${oldDur}→${afterAddDur}（达 4，${monsterMsg}），耐久 -3 → ${afterPenalty}`);
        } else {
          summaryParts.push(`第${iter + 1}轮：${oldDur}→${afterAddDur}（未触发 4 耐久）`);
        }
      }

      patch.rng = currentRng;
      patch[slotId] = currentItem;
      const echoTag = echoMul > 1 ? `（回响×${echoMul}）` : '';
      sideEffects.push({
        event: 'log:entry',
        payload: {
          type: 'magic',
          message: `蓄能裂击（${currentItem.name}）：${summaryParts.join('；')}${echoTag}`,
        },
      });
      const banner = triggerCount > 0
        ? `蓄能裂击：${currentItem.name} 触发 ${triggerCount} 次，命中 ${damagedMonsterCount} 只敌人。${echoTag}`
        : `蓄能裂击：${currentItem.name} 未达到 4 耐久阈值。${echoTag}`;
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, banner);
    }

    case 'gear-rift-draw': {
      // 修裂启示：drawCount = (maxDurability - durability) * 2 * echo
      // - 空槽 / 没耐久概念的装备 → 拒绝，magic 不消耗（与 durability-charge-burst / repair-one 一致）。
      // - 装备满耐久（缺 0）→ magic 仍消耗，0 抽，banner 提示「耐久未损」（按 user 设计）。
      // - Echo (A 类)：最终抽牌数 ×echoMultiplier；
      //   背包空 / 手牌满时 drawFromBackpackToHandPure 自然停止。
      if (!slotItem) {
        patch.heroSkillBanner = '该装备栏为空。';
        return applyPatch(state, patch, sideEffects);
      }
      const grdMaxDur = (slotItem as any).maxDurability ?? slotItem.durability ?? 0;
      if (grdMaxDur === 0) {
        patch.heroSkillBanner = '这件装备没有耐久度。';
        return applyPatch(state, patch, sideEffects);
      }
      const grdCurDur = slotItem.durability ?? grdMaxDur;
      const missingDur = Math.max(0, grdMaxDur - grdCurDur);
      const grdEchoMul = (pending as any).echoMultiplier ?? 1;
      const grdBaseDraw = missingDur * 2;
      const grdDrawCount = grdBaseDraw * grdEchoMul;
      const grdDrawnNames: string[] = [];
      for (let i = 0; i < grdDrawCount; i++) {
        const current = { ...state, ...patch };
        const { card: drawn, patch: drawPatch } = drawFromBackpackToHandPure(current);
        Object.assign(patch, drawPatch);
        if (drawn) {
          sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: drawn.id, source: 'backpack' } });
          grdDrawnNames.push(drawn.name);
        } else {
          break;
        }
      }
      applyMirrorCopySummonProgress(state, patch, sideEffects, enqueuedActions, grdDrawnNames.length);
      const grdDrawMsg = grdDrawnNames.length > 0 ? `，抽到「${grdDrawnNames.join('、')}」` : '';
      const grdEchoTag = grdEchoMul > 1 ? `（回响×${grdEchoMul}）` : '';
      const grdFormulaTag = grdEchoMul > 1 ? `${grdBaseDraw}×${grdEchoMul}=${grdDrawCount}` : `${grdDrawCount}`;
      const grdBanner = missingDur === 0
        ? `修裂启示：${slotItem.name} 耐久未损（缺 0），未抽到牌。${grdEchoTag}`
        : `修裂启示：${slotItem.name} 耐久 ${grdCurDur}/${grdMaxDur}（缺 ${missingDur}）→ 抽 ${grdFormulaTag} 张牌${grdDrawMsg}。${grdEchoTag}`;
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, grdBanner);
    }

    case 'recycle-temp-armor': {
      // 池中坚意：buff = floor(state.permanentMagicRecycleBag.length / divisor) * echo
      // - divisor = 4 (Lv0) / 3 (Lv1)
      // - 空槽允许选（与 backpack-temp-attack / event-armor-etch 一致）：
      //   buff 写到 equipmentSlotBonuses[slotId].shield（永久护甲加成绑定槽位 id，
      //   不在装备上），等装备进入时仍生效，且**跨瀑流 / 跨回合不清零**。
      // - Echo (A 类，与 C 类等价 — 这张卡 setup 时仍在 hand，未进 recycleBag)：
      //   单次乘 ×echoMultiplier，与 backpack-temp-attack 同 pattern。
      // - 修改 equipmentSlotBonuses[slotId].shield 后必须调 applySlotArmorBonusDelta
      //   让该栏 armor 立刻刷到新 cap（shield-armor-vs-durability.mdc）。
      // - 注意：effect id 历史命名 `recycle-temp-armor` 保留不动，但语义已经从
      //   "临时护甲" 改成 "永久护甲"——跟 装甲铸蚀 (event-armor-etch) 同口径。
      // - 不调 checkPersuadeOnTempAttack：怀柔之印 只对临时攻击 / 临时护甲 gain
      //   触发，永久护甲不算（参考 装甲铸蚀 实现）。
      const echoMul = (pending as any).echoMultiplier ?? 1;
      const divisor = (pending.card.upgradeLevel ?? 0) >= 1 ? 3 : 4;
      const recycleLen = state.permanentMagicRecycleBag.length;
      const baseBuff = Math.floor(recycleLen / divisor);
      const buff = baseBuff * echoMul;
      const label = slotItem ? slotItem.name : (slotId === 'equipmentSlot1' ? '左装备栏' : '右装备栏');
      if (buff !== 0) {
        patch.equipmentSlotBonuses = {
          ...state.equipmentSlotBonuses,
          [slotId]: {
            ...state.equipmentSlotBonuses[slotId],
            shield: state.equipmentSlotBonuses[slotId].shield + buff,
          },
        };
        applySlotArmorBonusDelta(state, slotId, buff, patch);
      }
      const echoTag = echoMul > 1 ? `（回响×${echoMul}）` : '';
      const formulaTag = echoMul > 1 ? `${baseBuff}×${echoMul}=${buff}` : `${buff}`;
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `池中坚意：${label} 永久护甲 +${formulaTag}（回收袋 ${recycleLen} 张 ÷ ${divisor}）。${echoTag}`);
    }

    case 'backpack-temp-attack': {
      // 囊中锋意：buff = floor(state.backpackItems.length / divisor) * 2 * echo
      // - divisor = 3 (Lv0) / 2 (Lv1)
      // - 每满 divisor 张牌给 +2 临时攻击（×2 倍率写死在公式里，升级 handler 是 noop）
      // - 空槽允许选（与 temp-attack-double / temp-attack-armor-draw / temp-stats-to-draw
      //   一致）：buff 写到 slotTempAttack[slotId]，等装备进入时仍生效。
      // - Echo (A 类，与 C 类等价 — 这张卡进回收袋而非背包)：
      //   单次乘 ×echoMultiplier，与 temp-attack-double 同 pattern。
      // - 触发 怀柔之印（persuade-on-temp-attack）：调 checkPersuadeOnTempAttack。
      const echoMul = (pending as any).echoMultiplier ?? 1;
      const divisor = (pending.card.upgradeLevel ?? 0) >= 1 ? 2 : 3;
      const backpackLen = state.backpackItems.length;
      const baseBuff = Math.floor(backpackLen / divisor) * 2;
      const buff = baseBuff * echoMul;
      const label = slotItem ? slotItem.name : (slotId === 'equipmentSlot1' ? '左装备栏' : '右装备栏');
      const curTempAtk = ((state as any).slotTempAttack ?? {})[slotId] ?? 0;
      patch.slotTempAttack = { ...((state as any).slotTempAttack ?? {}), [slotId]: curTempAtk + buff };
      checkPersuadeOnTempAttack(state, patch, sideEffects);
      const echoTag = echoMul > 1 ? `（回响×${echoMul}）` : '';
      const formulaTag = echoMul > 1 ? `${baseBuff}×${echoMul}=${buff}` : `${buff}`;
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `囊中锋意：${label} 临时攻击 +${formulaTag}（背包 ${backpackLen} 张 ÷ ${divisor} × 2）。${echoTag}`);
    }

    case 'temp-stats-to-draw': {
      // 战势化符：drawCount = floor((slotTempAttack + slotTempArmor) / 3) * echo
      // 选定栏的 临时攻击 与 临时护甲 合并为 pool 后整体除 3。
      // - 0/1/2 总值 → 抽 0 张（仍正常结算消耗这张 magic）
      // - 空槽允许选（pool 为 0）
      // - 背包空 / 手牌满时由 drawFromBackpackToHandPure 自然停止
      const label = slotItem ? slotItem.name : (slotId === 'equipmentSlot1' ? '左装备栏' : '右装备栏');
      const echoMul = (pending as any).echoMultiplier ?? 1;
      const curTempAtk = ((state as any).slotTempAttack ?? {})[slotId] ?? 0;
      const curTempArm = ((state as any).slotTempArmor ?? {})[slotId] ?? 0;
      const totalTemp = curTempAtk + curTempArm;
      const baseDraw = Math.floor(totalTemp / 3);
      const drawCount = baseDraw * echoMul;
      const drawnNames: string[] = [];
      for (let i = 0; i < drawCount; i++) {
        const current = { ...state, ...patch };
        const { card: drawn, patch: drawPatch } = drawFromBackpackToHandPure(current);
        Object.assign(patch, drawPatch);
        if (drawn) {
          sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: drawn.id, source: 'backpack' } });
          drawnNames.push(drawn.name);
        } else {
          break;
        }
      }
      applyMirrorCopySummonProgress(state, patch, sideEffects, enqueuedActions, drawnNames.length);
      const drawMsg = drawnNames.length > 0 ? `，抽到「${drawnNames.join('、')}」` : '';
      const echoTag = echoMul > 1 ? `（回响×${echoMul}）` : '';
      const formulaTag = echoMul > 1 ? `${baseDraw}×${echoMul}=${drawCount}` : `${drawCount}`;
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `战势化符：${label} 临攻 ${curTempAtk} + 临护 ${curTempArm} = ${totalTemp} → 抽 ${formulaTag} 张牌${drawMsg}。${echoTag}`);
    }

    case 'weapon-manual': {
      // 兵器谱主效果：本回合该装备栏额外攻击次数 +N（N=2*echo）。
      // 即使该装备栏当前为空也允许选择，效果会保留至该回合结束（与全局
      // extraAttackCharges 独立，仅由对应栏的攻击消耗）。
      const echoMul = (pending as any).echoMultiplier ?? 1;
      const bonus = 2 * echoMul;
      const label = slotItem ? slotItem.name : (slotId === 'equipmentSlot1' ? '左装备栏' : '右装备栏');
      const cur = ((state as any).slotExtraAttacks ?? { equipmentSlot1: 0, equipmentSlot2: 0 })[slotId] ?? 0;
      patch.slotExtraAttacks = {
        ...((state as any).slotExtraAttacks ?? { equipmentSlot1: 0, equipmentSlot2: 0 }),
        [slotId]: cur + bonus,
      };
      const echoText = echoMul > 1 ? '（回响×2）' : '';
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `兵器谱：${label} 本回合攻击次数 +${bonus}。${echoText}`);
    }

    case 'repair-one': {
      if (!slotItem) {
        patch.heroSkillBanner = '该槽位没有可修复的装备。';
        return applyPatch(state, patch, sideEffects);
      }
      const maxDur = (slotItem as any).maxDurability ?? slotItem.durability ?? 0;
      const curDur = slotItem.durability ?? maxDur;
      if (maxDur === 0) {
        patch.heroSkillBanner = '这件装备无法修复。';
        return applyPatch(state, patch, sideEffects);
      }
      if (curDur >= maxDur) {
        patch.heroSkillBanner = '该装备已经处于满耐久。';
        return applyPatch(state, patch, sideEffects);
      }
      const repairUpgLvl = pending.card.upgradeLevel ?? 0;
      const repairBaseAmounts = [1, 1, 2];
      const repairAmount = (repairBaseAmounts[repairUpgLvl] ?? 2) * ((pending as any).echoMultiplier ?? 1);
      patch[slotId] = { ...slotItem, durability: Math.min(maxDur, curDur + repairAmount) } as any;
      let drawMsg = '';
      if (repairUpgLvl >= 1) {
        let current = { ...state, ...patch };
        const { card: drawn, patch: drawPatch } = drawFromBackpackToHandPure(current);
        Object.assign(patch, drawPatch);
        if (drawn) {
          sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: drawn.id, source: 'backpack' } });
          applyMirrorCopySummonProgress(state, patch, sideEffects, enqueuedActions, 1);
        }
        drawMsg = drawn ? `，抽到「${drawn.name}」` : '';
      }
      const echoText = ((pending as any).echoMultiplier ?? 1) > 1 ? '（回响×2）' : '';
      const repairBanner = pending.card.magicEffect === 'honor-blood'
        ? `战血之印：${slotItem.name} 恢复 ${repairAmount} 点耐久。${echoText}`
        : `${slotItem.name} 恢复了 ${repairAmount} 点耐久${drawMsg}。${echoText}`;
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, repairBanner);
    }

    case 'transform-repair': {
      if (!slotItem) {
        patch.heroSkillBanner = '该槽位没有装备。';
        return applyPatch(state, patch, sideEffects);
      }
      const maxDur = (slotItem as any).maxDurability ?? slotItem.durability ?? 0;
      const curDur = slotItem.durability ?? maxDur;
      const echoMul = (pending as any).echoMultiplier ?? 1;
      const repairAmt = 1 * echoMul;
      const triggerCount = (pending.card as any)._flankRepairTriggers ?? 0;
      const flankAtkBase = 1 + triggerCount;
      const parts: string[] = [];
      if (maxDur > 0 && curDur < maxDur) {
        patch[slotId] = { ...slotItem, durability: Math.min(maxDur, curDur + repairAmt) } as any;
        parts.push(`${slotItem.name} 耐久 +${repairAmt}`);
      } else {
        parts.push(`${slotItem.name} 已满耐久`);
      }
      let updatedCard = pending.card;
      if ((pending as any).flankTriggered) {
        const tempAtkBonus = flankAtkBase * echoMul;
        const curTA = ((state as any).slotTempAttack ?? {})[slotId] ?? 0;
        patch.slotTempAttack = { ...((state as any).slotTempAttack ?? {}), [slotId]: curTA + tempAtkBonus };
        parts.push(`侧击：临时攻击 +${tempAtkBonus}`);
        checkPersuadeOnTempAttack(state, patch, sideEffects);
        const newTriggers = triggerCount + 1;
        const nextAtk = 1 + newTriggers;
        updatedCard = {
          ...pending.card,
          _flankRepairTriggers: newTriggers,
          flankEffect: `给该装备栏 +${nextAtk} 临时攻击（每次触发后数值 +1）`,
        } as GameCardData;
      }
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, updatedCard, parts.join('。') + '。');
    }

    case 'armor-strike': {
      if (!slotItem || (slotItem.type !== 'shield' && slotItem.type !== 'monster')) {
        patch.heroSkillBanner = '请选择一面盾牌来转化护甲。';
        return applyPatch(state, patch, sideEffects);
      }
      const rawArmor = computeSlotArmorValuePure(state, slotId);
      const armorPcts = [100, 125, 150];
      const armorPct = armorPcts[pending.card.upgradeLevel ?? 0] ?? armorPcts[armorPcts.length - 1];
      const scaledArmor = Math.floor(rawArmor * armorPct / 100);
      if (scaledArmor <= 0) {
        patch.heroSkillBanner = '该盾牌目前没有可用的护甲。';
        return applyPatch(state, patch, sideEffects);
      }
      const ampBonus = pending.card.amplifyBonus ?? 0;
      const echoMulAS_S = (pending as any).echoMultiplier ?? 1;
      const echoTagAS_S = echoMulAS_S > 1 ? `（回响×${echoMulAS_S}）` : '';
      const totalDamage = computeSpellDamagePure(state, scaledArmor + ampBonus) * echoMulAS_S;
      // 单目标伤害 magic：始终弹出 monster picker（包含 hero 自伤路径）。
      patch.pendingMagicAction = {
        card: pending.card, effect: 'armor-strike', step: 'monster-select',
        slotId, pendingDamage: scaledArmor,
        prompt: `选择一个目标，承受 ${totalDamage} 点护甲伤害。${echoTagAS_S}`,
        echoMultiplier: echoMulAS_S,
        allowsHeroTarget: true,
      } as PendingMagicAction;
      patch.heroSkillBanner = '选择一个目标承受你的护甲一击。';
      return applyPatch(state, patch, sideEffects);
    }

    case 'armor-double-strike': {
      if (!slotItem || (slotItem.type !== 'shield' && slotItem.type !== 'monster')) {
        patch.heroSkillBanner = '请选择一面护盾。';
        return applyPatch(state, patch, sideEffects);
      }
      return executeArmorDoubleStrike(state, pending.card, slotId, sideEffects, patch, enqueuedActions, (pending as any).echoMultiplier ?? 1);
    }

    case 'armor-stun-convert': {
      if (!slotItem || (slotItem.type !== 'shield' && slotItem.type !== 'monster')) {
        patch.heroSkillBanner = '请选择一面护盾。';
        return applyPatch(state, patch, sideEffects);
      }
      const stunPerArmors = [1, 1.5];
      const stunPerArmor = stunPerArmors[pending.card.upgradeLevel ?? 0] ?? 1.5;
      const echoMul = (pending as any).echoMultiplier ?? 1;
      const echoTag = echoMul > 1 ? `（回响×${echoMul}）` : '';
      const armorValue = computeSlotArmorValuePure(state, slotId);
      const totalStun = Math.round(armorValue * stunPerArmor * echoMul);
      const stunGain = Math.min(totalStun, 100 - (state.stunCap ?? 0));
      if (stunGain > 0) {
        patch.stunCap = (state.stunCap ?? 0) + totalStun;
      }
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `护甲凝雷：护甲 ${armorValue} → 击晕上限 +${stunGain}%${echoTag}` } });
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `护甲 ${armorValue} 点 → 击晕上限 +${stunGain}%！${echoTag}`);
    }

    case 'temp-attack-strike': {
      const tempAtk = ((state as any).slotTempAttack ?? {})[slotId] ?? 0;
      const permAtk = getSlotBonus(state, slotId, 'damage');
      const baseAtk = permAtk + tempAtk;
      const echoMulTAS = (pending as any).echoMultiplier ?? 1;
      const totalDamage = computeSpellDamagePure(state, baseAtk + (pending.card.amplifyBonus ?? 0)) * echoMulTAS;
      if (totalDamage <= 0) {
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
          '该装备栏没有永久攻击和临时攻击，造成 0 点伤害。');
      }
      const monsters = flattenActiveRowSlots(state.activeCards as ActiveRowSlots).filter(isDamageableTarget);
      if (monsters.length === 0) {
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
          '当前没有可攻击的怪物。');
      }
      let rng = state.rng;
      const [target, rng2] = pickRandom(monsters, rng);
      rng = rng2;
      patch.rng = rng;
      ensureEngaged(state, target, enqueuedActions);
      enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: target.id, damage: totalDamage, source: 'temp-attack-strike', isSpellDamage: true });
      const isFlank = (pending as any).isFlank ?? false;
      let stunText = '';
      if (isFlank && !target.isStunned) {
        // 锋刃侧击击晕率随升级等级提升：
        //   L0：20%（base，2026-04 redesign 起从 40 调降以给升级留空间）
        //   L1：40%
        //   L2：60%
        // 与 knightDeck.ts 卡面 + upgrades.ts tempAttackStrike handler 保持一致。
        const tasLvl = (pending.card as any).upgradeLevel ?? 0;
        const tasStunPcts = [20, 40, 60];
        const baseStunPct = tasStunPcts[tasLvl] ?? tasStunPcts[tasStunPcts.length - 1];
        const ae = computeAmuletEffectsForState(state) ?? createEmptyAmuletEffects();
        const effectiveFlankStun = Math.min(baseStunPct + (ae.stunRateBoost ?? 0), state.stunCap ?? 0);
        const threshold = Math.round((effectiveFlankStun / 100) * 20);
        if (threshold > 0) {
          let flankRoll: number;
          [flankRoll, rng] = nextInt(rng, 1, 20);
          patch.rng = rng;
          sideEffects.push({ event: 'ui:requestDice', payload: {
            title: target.name,
            subtitle: `侧击击晕判定（${effectiveFlankStun}%）`,
            entries: [
              { id: 'stun', range: [1, threshold] as [number, number], label: '击晕成功！', effect: 'none' },
              { id: 'miss', range: [threshold + 1, 20] as [number, number], label: '未击晕', effect: 'none' },
            ],
            context: { flowId: 'flank-stun', monsterId: target.id, monsterName: target.name, magicCardId: pending.card.id },
            predeterminedRoll: flankRoll,
          } });
          tickStunAttemptDiscoverProgress(state, patch, sideEffects);
          stunText = '（侧击：击晕判定中…）';
        }
      }
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `锋刃侧击：对 ${target.name} 造成 ${totalDamage} 点伤害${isFlank ? '（侧击触发）' : ''}` } });
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `锋刃侧击对 ${target.name} 造成 ${totalDamage} 点伤害！${stunText}`, { dealtDamage: true });
    }

    case 'flank-fortify': {
      if (!slotItem) {
        patch.heroSkillBanner = '该装备栏为空。';
        return applyPatch(state, patch, sideEffects);
      }
      const useCount = (pending.card as any)._flankFortifyUses ?? 0;
      const echoMulFF = (pending as any).echoMultiplier ?? 1;
      const armorBonus = (1 + useCount) * echoMulFF;
      const curTA = ((state as any).slotTempArmor ?? {})[slotId] ?? 0;
      patch.slotTempArmor = { ...((state as any).slotTempArmor ?? {}), [slotId]: curTA + armorBonus };
      if (armorBonus !== 0) applySlotArmorBonusDelta(state, slotId, armorBonus, patch);
      checkPersuadeOnTempAttack(state, patch, sideEffects);
      const isFlank = (pending as any).isFlank ?? false;
      let flankText = '';
      if (isFlank) {
        const updatedSlot: any = { ...slotItem };
        let durChanged = false;
        if (typeof updatedSlot.durability === 'number' && updatedSlot.durability > 1) {
          updatedSlot.durability = 1;
          durChanged = true;
        }
        let reviveGranted = false;
        if (!updatedSlot.hasEquipmentRevive || updatedSlot.equipmentReviveUsed) {
          updatedSlot.hasEquipmentRevive = true;
          updatedSlot.equipmentReviveUsed = false;
          reviveGranted = true;
        }
        patch[slotId] = updatedSlot;
        const parts: string[] = [];
        if (durChanged) parts.push('耐久减至 1');
        if (reviveGranted) parts.push('获得复生');
        flankText = parts.length > 0
          ? ` 侧击触发：${slotItem.name} ${parts.join('，')}！`
          : ` 侧击触发：${slotItem.name} 已为耐久 1 且已有复生，无额外变化。`;
        sideEffects.push({ event: 'log:entry', payload: {
          type: 'magic',
          message: parts.length > 0
            ? `固壁侧守（侧击）：${slotItem.name} ${parts.join('，')}`
            : `固壁侧守（侧击）：${slotItem.name} 无额外变化（已耐久 1 且已有复生）`,
        } });
      }
      const newUses = useCount + 1;
      const nextArmor = 1 + newUses;
      const updatedCard = {
        ...pending.card,
        _flankFortifyUses: newUses,
        description: `永久：选择一个装备，+${nextArmor}（每次使用后数值 +1）临时护甲。侧击：该装备耐久度减到 1，赋予该装备复生。`,
        magicEffect: `+${nextArmor}(递增) 临时护甲，侧击：耐久减至 1+赋予复生。`,
      } as GameCardData;
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `固壁侧守：${slotItem.name} +${armorBonus} 临时护甲` } });
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, updatedCard,
        `${slotItem.name} +${armorBonus} 临时护甲。${flankText}`);
    }

    case 'equalize-temp-attack-armor': {
      if (!slotItem) {
        patch.heroSkillBanner = '该装备栏为空。';
        return applyPatch(state, patch, sideEffects);
      }
      const echoMul = (pending as any).echoMultiplier ?? 1;
      const atkBoost = 2 * echoMul;
      const curTempAtk = ((state as any).slotTempAttack ?? {})[slotId] ?? 0;
      const curTempArm = ((state as any).slotTempArmor ?? {})[slotId] ?? 0;
      const permAtk = state.equipmentSlotBonuses?.[slotId]?.damage ?? 0;
      const permArm = state.equipmentSlotBonuses?.[slotId]?.shield ?? 0;
      // Step 1: 临时攻击先 +atkBoost。
      patch.slotTempAttack = { ...((state as any).slotTempAttack ?? {}), [slotId]: curTempAtk + atkBoost };
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `时空镜像：${slotItem.name} 临时攻击 +${atkBoost}` } });
      // 怀柔之印：初始 +N 临时攻击 = 一次"获得"
      checkPersuadeOnTempAttack(state, patch, sideEffects);
      // Step 2: 比较 (临时攻击+永久攻击) vs (临时护甲+永久护甲)，
      // 拉平较低一方（永远只增不减，加在「临时」侧）。
      const totalAtkAfterBoost = (curTempAtk + atkBoost) + permAtk;
      const totalArm = curTempArm + permArm;
      if (totalAtkAfterBoost === totalArm) {
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
          `${slotItem.name} 临时攻击 +${atkBoost}，攻防总和已相等（${totalAtkAfterBoost}）。`);
      }
      if (totalAtkAfterBoost > totalArm) {
        const delta = totalAtkAfterBoost - totalArm;
        patch.slotTempArmor = { ...((state as any).slotTempArmor ?? {}), [slotId]: curTempArm + delta };
        if (delta !== 0) applySlotArmorBonusDelta(state, slotId, delta, patch);
        // 怀柔之印：拉平时临时护甲 +delta = 第二次"获得"
        if (delta > 0) checkPersuadeOnTempAttack(state, patch, sideEffects);
        sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `时空镜像：${slotItem.name} 临时护甲 +${delta}，攻防总和均为 ${totalAtkAfterBoost}` } });
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
          `${slotItem.name} 临时攻击 +${atkBoost}，临时护甲 +${delta}，攻防总和均为 ${totalAtkAfterBoost}。`);
      }
      const delta = totalArm - totalAtkAfterBoost;
      patch.slotTempAttack = { ...((state as any).slotTempAttack ?? {}), [slotId]: curTempAtk + atkBoost + delta };
      // 怀柔之印：拉平时临时攻击 +delta = 第二次"获得"
      if (delta > 0) checkPersuadeOnTempAttack(state, patch, sideEffects);
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `时空镜像：${slotItem.name} 临时攻击再 +${delta}，攻防总和均为 ${totalArm}` } });
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `${slotItem.name} 临时攻击 +${atkBoost + delta}，攻防总和均为 ${totalArm}。`);
    }

    case 'eternal-repair': {
      if (!slotItem) {
        patch.heroSkillBanner = '该装备栏为空。';
        return applyPatch(state, patch, sideEffects);
      }
      if (slotItem.type !== 'weapon' && slotItem.type !== 'monster') {
        patch.heroSkillBanner = '涌泉满手只能对武器或随从使用。';
        return applyPatch(state, patch, sideEffects);
      }
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `${slotItem.name} 在下个瀑流前使用不消耗耐久。` } });
      const echoRemaining = ((pending as any).echoRemaining ?? 1) - 1;
      if (echoRemaining > 0) {
        const otherSlotId: EquipmentSlotId = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
        const otherItem = getSlotItem(state, otherSlotId);
        if (otherItem && (otherItem.type === 'weapon' || otherItem.type === 'monster')) {
          const totalEcho = (pending as any).echoRemaining ?? 1;
          const echoLabel = `（回响：第 ${totalEcho - echoRemaining + 1}/${totalEcho} 次）`;
          patch.pendingMagicAction = {
            card: pending.card, effect: 'eternal-repair', step: 'slot-select',
            prompt: `${slotItem.name} 已获得涌泉满手。继续选择下一把武器。${echoLabel}`,
            echoRemaining,
          } as PendingMagicAction;
          patch.heroSkillBanner = `${slotItem.name} 已获得涌泉满手。继续选择下一把。${echoLabel}`;
          return applyPatch(state, patch, sideEffects);
        }
      }
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `${slotItem.name} 获得涌泉满手。`);
    }

    case 'soul-swap': {
      if (!slotItem || (slotItem.type !== 'weapon' && slotItem.type !== 'shield')) {
        patch.heroSkillBanner = '请选择一件武器或盾牌。';
        return applyPatch(state, patch, sideEffects);
      }
      const durability = slotItem.durability ?? 0;
      if (durability <= 0) {
        patch.heroSkillBanner = '该装备耐久为零，无法交换。';
        return applyPatch(state, patch, sideEffects);
      }
      const swapMonsters = flattenActiveRowSlots(state.activeCards as ActiveRowSlots).filter(
        c => c.type === 'monster' && !c.bossPhase && !c.isFinalMonster,
      );
      if (swapMonsters.length === 0) {
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
          '没有可选的非Boss怪物。');
      }
      if (swapMonsters.length === 1) {
        const target = swapMonsters[0];
        const oldLayers = target.currentLayer ?? 1;
        const newMaxDur = clampMaxDurability(Math.max((slotItem as any).maxDurability ?? durability, oldLayers));
        const newDur = Math.min(oldLayers, newMaxDur);
        // Mine-damage-boost：等价交换可能让武器耐久下降（newDur < durability）。
        const soulSwapDurLost = Math.max(0, durability - newDur);
        if (soulSwapDurLost > 0) {
          accumulateMineDamageBoost(state, slotItem as GameCardData, soulSwapDurLost, patch, sideEffects);
        }
        patch[slotId] = { ...slotItem, durability: newDur, maxDurability: newMaxDur } as any;
        const updatedCards = (state.activeCards as any[]).map(slot => {
          if (!slot || slot.id !== target.id) return slot;
          return { ...slot, currentLayer: durability, hp: slot.maxHp ?? slot.hp ?? 0, fury: Math.max(slot.fury ?? 0, durability), hpLayers: Math.max(slot.hpLayers ?? 0, durability) };
        });
        patch.activeCards = updatedCards;
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
          `等价交换：${slotItem.name} 耐久 ${durability}→${oldLayers}，${target.name} 血层 ${oldLayers}→${durability}。`);
      }
      patch.pendingMagicAction = {
        card: pending.card, effect: 'soul-swap', step: 'monster-select',
        slotId, slotDurability: durability,
        prompt: `选择一个非Boss怪物，与 ${slotItem.name}（耐久 ${durability}）互换血层。`,
      } as PendingMagicAction;
      patch.heroSkillBanner = `等价交换：选择一个怪物与 ${slotItem.name}（耐久 ${durability}）互换血层。`;
      return applyPatch(state, patch, sideEffects);
    }

    case 'repair-enrage-dice': {
      if (!slotItem) {
        patch.heroSkillBanner = '请选择一个有装备的栏位。';
        return applyPatch(state, patch, sideEffects);
      }
      const monsters = flattenActiveRowSlots(state.activeCards as ActiveRowSlots).filter(isDamageableTarget);
      // 无怪物时也允许打出：直接掷骰；enrage 结果在 cards.ts 中会因
      // 找不到目标而仅记录失败日志，装备不获得耐久。
      if (monsters.length <= 1) {
        const [reRoll, reRng] = nextInt(patch.rng ?? state.rng, 1, 20);
        patch.rng = reRng;
        const targetMonster = monsters[0];
        sideEffects.push({ event: 'ui:requestDice', payload: {
          title: targetMonster?.name ?? slotItem.name,
          subtitle: '赌运修炼判定',
          entries: [
            { id: 'repair', range: [1, 16] as [number, number], label: '修复成功！', effect: 'none' },
            { id: 'enrage', range: [17, 20] as [number, number], label: targetMonster ? '怪物暴怒！' : '失败！无怪物可激怒', effect: 'none' },
          ],
          context: { flowId: 'repair-enrage-dice', slotId, monsterId: targetMonster?.id, cardId: pending.card.id, card: pending.card },
          predeterminedRoll: reRoll,
        } });
        patch.pendingMagicAction = null;
        return applyPatch(state, patch, sideEffects);
      }
      patch.pendingMagicAction = {
        card: pending.card, effect: 'repair-enrage-dice', step: 'monster-select',
        slotId,
        prompt: '选择一个怪物作为赌运目标。',
      } as PendingMagicAction;
      patch.heroSkillBanner = `已选择 ${slotItem.name}，选择一个怪物作为赌运目标。`;
      return applyPatch(state, patch, sideEffects);
    }

    case 'temp-armor': {
      const label = slotItem ? slotItem.name : (slotId === 'equipmentSlot1' ? '左装备栏' : '右装备栏');
      const armorAmounts = [2, 4, 6];
      const echoMul = (pending as any).echoRemaining ?? 1;
      const armorAmt = (armorAmounts[pending.card.upgradeLevel ?? 0] ?? 2) * Math.max(1, echoMul);
      const curTA = ((state as any).slotTempArmor ?? {})[slotId] ?? 0;
      patch.slotTempArmor = { ...((state as any).slotTempArmor ?? {}), [slotId]: curTA + armorAmt };
      if (armorAmt !== 0) applySlotArmorBonusDelta(state, slotId, armorAmt, patch);
      checkPersuadeOnTempAttack(state, patch, sideEffects);
      const echoTag = echoMul > 1 ? `（回响×${echoMul}）` : '';
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `铸甲术：${label} +${armorAmt} 临时护甲${echoTag}` } });
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `${label} 获得 +${armorAmt} 临时护甲。${echoTag}`);
    }

    case 'battle-spirit': {
      const label = slotItem ? slotItem.name : (slotId === 'equipmentSlot1' ? '左装备栏' : '右装备栏');
      const lvl = pending.card.upgradeLevel ?? 0;
      const echoMul = (pending as any).echoMultiplier ?? 1;
      const bonusAmt = (lvl >= 1 ? 2 : 1) * echoMul;
      const echoTag = echoMul > 1 ? `（回响×${echoMul}）` : '';
      const curBonus = ((state as any).slotBattleSpiritBonus ?? {})[slotId] ?? 0;
      patch.slotBattleSpiritBonus = {
        ...((state as any).slotBattleSpiritBonus ?? {}),
        [slotId]: curBonus + bonusAmt,
      };
      sideEffects.push({
        event: 'log:entry',
        payload: {
          type: 'magic',
          message: `战意激发：${label} 每英雄回合可多攻击 ${bonusAmt} 次，且每怪物回合格挡耐久上限 +${bonusAmt}（持续到下次瀑流）。${echoTag}`,
        },
      });
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `${label} 战意激发：+${bonusAmt} 攻击 / +${bonusAmt} 格挡耐久（至下次瀑流）。${echoTag}`);
    }

    case 'event-fortify': {
      if (!slotItem) {
        patch.heroSkillBanner = '该装备栏为空。';
        return applyPatch(state, patch, sideEffects);
      }
      const deck = state.remainingDeck as GameCardData[];
      const peekCount = Math.min(3, deck.length);
      const peekedCards = deck.slice(0, peekCount);
      const echoMul = (pending as any).echoMultiplier ?? 1;
      const echoTag = echoMul > 1 ? `（回响×${echoMul}）` : '';
      const eventCount = peekedCards.filter(c => c.type === 'event').length * echoMul;
      const gains: Array<{ label: string; count: number }> = [];
      if (eventCount > 0) {
        const oldMaxDur = (slotItem as any).maxDurability ?? slotItem.durability ?? 0;
        const curDur = slotItem.durability ?? oldMaxDur;
        const newMaxDur = clampMaxDurability(oldMaxDur + eventCount);
        const actualMaxGain = newMaxDur - oldMaxDur;
        const newDur = Math.min(newMaxDur, curDur + eventCount);
        patch[slotId] = { ...slotItem, maxDurability: newMaxDur, durability: newDur } as any;
        if (actualMaxGain > 0) {
          gains.push({ label: `${slotItem.name} 耐久上限 +1 并恢复 1 点耐久`, count: actualMaxGain });
          sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `天机铸炼：翻看 ${peekCount} 张牌，${eventCount} 张事件计入 → ${slotItem.name} 耐久上限 +${actualMaxGain}（${oldMaxDur}→${newMaxDur}），耐久恢复 ${newDur - curDur}（${curDur}→${newDur}）${echoTag}` } });
        } else {
          sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `天机铸炼：翻看 ${peekCount} 张牌，${eventCount} 张事件计入；${slotItem.name} 耐久上限已达 ${DURABILITY_CAP}，仅恢复 ${newDur - curDur} 点耐久（${curDur}→${newDur}）${echoTag}` } });
        }
      } else {
        sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `天机铸炼：翻看 ${peekCount} 张牌，0 张事件 → 无增益${echoTag}` } });
      }
      if (peekCount > 0) {
        sideEffects.push({ event: 'hero:deckPeekRequest', payload: { mode: 'dungeon-insight', peekedCards, gains } });
      }
      const banner = peekCount > 0
        ? `天机铸炼翻看 ${peekCount} 张牌：${eventCount} 张事件，${eventCount > 0 ? `${slotItem.name} 耐久上限 +${eventCount}，恢复 ${eventCount} 点耐久。` : '无增益。'}${echoTag}`
        : `天机铸炼：主牌堆已空，无效果。${echoTag}`;
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, banner);
    }

    case 'event-armor-etch': {
      // 装甲铸蚀 — 「右翼回响」 stay-flip target. Permanently grants
      // `equipmentSlotBonuses[slotId].shield += 2` to the chosen slot
      // (mirrors the `slotLeftDefense+` / `slotRightDefense+` event tokens).
      // Empty slots are valid targets — the bonus is bound to the slot id,
      // not the equipment, so it carries over to whatever装备 the player
      // swaps in later. Echo (A 类): bonus = 2 × echoMultiplier.
      const echoMul = (pending as any).echoMultiplier ?? 1;
      const echoTag = echoMul > 1 ? `（回响×${echoMul}）` : '';
      const bonusAmount = 2 * echoMul;
      patch.equipmentSlotBonuses = {
        ...state.equipmentSlotBonuses,
        [slotId]: {
          ...state.equipmentSlotBonuses[slotId],
          shield: state.equipmentSlotBonuses[slotId].shield + bonusAmount,
        },
      };
      // applySlotArmorBonusDelta refills the equipped shield/monster's
      // current `armor` to the new cap (the helper is a no-op for empty
      // slots and for weapon items — it only acts on shield/monster).
      applySlotArmorBonusDelta(state, slotId, bonusAmount, patch);
      const slotLabel = slotId === 'equipmentSlot1' ? '左装备栏' : '右装备栏';
      const equipName = slotItem ? `（${slotItem.name}）` : '（空槽）';
      sideEffects.push({
        event: 'log:entry',
        payload: {
          type: 'magic',
          message: `装甲铸蚀：${slotLabel}${equipName} 永久护甲 +${bonusAmount}。${echoTag}`,
        },
      });
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `装甲铸蚀：${slotLabel} 永久护甲 +${bonusAmount}！${echoTag}`);
    }

    case 'grant-revive': {
      if (!slotItem) {
        patch.heroSkillBanner = '该装备栏为空。';
        return applyPatch(state, patch, sideEffects);
      }
      patch[slotId] = { ...slotItem, hasEquipmentRevive: true, equipmentReviveUsed: false } as any;
      let drawMsg = '';
      if ((pending.card.upgradeLevel ?? 0) >= 1) {
        let current = { ...state, ...patch };
        const { card: drawn, patch: drawPatch } = drawFromBackpackToHandPure(current);
        Object.assign(patch, drawPatch);
        if (drawn) {
          sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: drawn.id, source: 'backpack' } });
          applyMirrorCopySummonProgress(state, patch, sideEffects, enqueuedActions, 1);
        }
        drawMsg = drawn ? ` 抽到「${drawn.name}」。` : '';
      }
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `不灭赐福：${slotItem.name} 获得复生能力，失去 2 生命${drawMsg}` } });
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 2, source: 'undying-blessing', selfInflicted: true });
      const echoRemainingRevive = ((pending as any).echoRemaining ?? 1) - 1;
      if (echoRemainingRevive > 0) {
        const otherSlotId: EquipmentSlotId = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
        const otherItem = getSlotItem(state, otherSlotId);
        if (otherItem) {
          const totalEcho = (pending as any).echoRemaining ?? 1;
          const echoLabel = `（回响：第 ${totalEcho - echoRemainingRevive + 1}/${totalEcho} 次）`;
          const next: PendingMagicAction = {
            card: pending.card,
            effect: 'grant-revive',
            step: 'slot-select',
            prompt: `不灭赐福：选择第二个装备赋予复生。${echoLabel}`,
            echoRemaining: echoRemainingRevive,
          } as PendingMagicAction;
          const reprompt = maybeRepromptEcho(
            state, patch, sideEffects, enqueuedActions,
            { card: pending.card, echoRemaining: (pending as any).echoRemaining },
            next,
            `${slotItem.name} 获得了不灭赐福！${echoLabel}`,
          );
          if (reprompt) return reprompt;
        }
      }
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `${slotItem.name} 获得了不灭赐福！失去 2 生命。${drawMsg}`);
    }

    default:
      return noChange(state);
  }
}

// ---------------------------------------------------------------------------
// RESOLVE_MAGIC_MONSTER_SELECTION — Phase 5b
// ---------------------------------------------------------------------------

function reduceMagicMonsterSelection(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_MAGIC_MONSTER_SELECTION' }>,
): ReduceResult {
  const pending = state.pendingMagicAction as PendingMagicAction | null;
  if (!pending || pending.step !== 'monster-select') return noChange(state);

  const targetType: 'monster' | 'hero' | 'shield-slot' = action.targetType ?? 'monster';
  // 当玩家选 Hero Cell 自伤、或选装备槽里的盾时，pending.allowsHeroTarget 必须为 true，否则忽略；
  // 这样可以防止"非单目标伤害 magic"误走自伤路径（例如 flip-monster-debuff 这类纯 debuff 卡）。
  if ((targetType === 'hero' || targetType === 'shield-slot')
    && !(pending as { allowsHeroTarget?: boolean }).allowsHeroTarget) {
    return noChange(state);
  }

  // shield-slot 需要 slotId 指向 type='shield' 或 type='monster'（怪物装备既可当武器也可当盾），
  // 且 armor>0 的装备槽。两种装备共用 RESOLVE_BLOCK 同款的单计数 armor 公式，
  // 自伤路径下都跳过所有 RESOLVE_BLOCK 专属机制（含 bone-regen / 怪物盾自动恢复）。
  if (targetType === 'shield-slot') {
    if (!action.slotId) return noChange(state);
    const slotItem = getEquipmentInSlot(state, action.slotId);
    if (!slotItem || (slotItem.type !== 'shield' && slotItem.type !== 'monster')) return noChange(state);
    if ((slotItem.armor ?? slotItem.armorMax ?? slotItem.value ?? 0) <= 0) return noChange(state);
  }

  const monster = targetType === 'monster'
    ? (state.activeCards as (GameCardData | null)[]).find(c => c?.id === action.monsterId)
    : null;
  if (targetType === 'monster' && !monster) return noChange(state);

  // 自伤分支统一走 isHeroTarget = true：所有 case 内的"打 hero / 打盾"都共用这个分支，
  // 区别仅在于 APPLY_DAMAGE 是直接 enqueue 还是经过 applyShieldSelfDamageOrEnqueue 重定向到盾。
  const isHeroTarget = targetType === 'hero' || targetType === 'shield-slot';
  const isShieldSlotTarget = targetType === 'shield-slot';
  const shieldSlotId = isShieldSlotTarget ? action.slotId! : null;
  const shieldSlotItem = shieldSlotId ? getEquipmentInSlot(state, shieldSlotId) : null;
  // 用于 log/banner 的目标显示名（hero 自伤路径下统一为 "自己"，盾路径用盾名）。
  const targetName = isShieldSlotTarget && shieldSlotItem
    ? shieldSlotItem.name
    : (isHeroTarget ? '自己' : (monster as GameCardData).name);

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  // ----- self-damage routing helper -----
  // For self-damage spells, the original "selfInflicted APPLY_DAMAGE" is now
  // routed through `applyShieldSlotSelfDamage` when the player chose a shield
  // slot — armor absorbs first, overflow re-enqueues APPLY_DAMAGE selfInflicted
  // (so bloodrage / revive-blessing / self-damage-draw / totalDamageTaken still
  // fire on the hp-loss portion). When target is the hero cell, we keep the
  // original direct enqueue.
  //
  // Returns `{ actualDamage }` — the amount that **actually landed** on the
  // hero side (shield armor consumed + tempShield consumed + hero HP lost).
  // Death-ward fully negates → 0. Used by 点金裁决 (blood-reckoning) to
  // heal by the real damage dealt rather than the nominal totalDamage.
  // Pure-preview math; no state mutation beyond what the closures already do.
  const previewHeroDamage = (s: GameState, raw: number): number => {
    if (raw <= 0) return 0;
    const ae = computeAmuletEffectsForState(s);
    const handArr = s.handCards as GameCardData[];
    const deathWardCard = handArr.find(
      c => c.magicEffect === 'death-ward' || (c as { knightEffect?: string }).knightEffect === 'death-ward',
    );
    const r = computeDamage(s, raw, ae, !!deathWardCard, { selfInflicted: true });
    return Math.max(0, r.shieldAbsorbed + r.appliedDamage);
  };
  const applySelfDamage = (damage: number, source: string): { actualDamage: number } => {
    if (damage <= 0) return { actualDamage: 0 };
    if (isShieldSlotTarget && shieldSlotId) {
      const result = applyShieldSlotSelfDamage(state, shieldSlotId, damage, source);
      Object.assign(patch, result.patch);
      sideEffects.push(...result.sideEffects);
      enqueuedActions.push(...result.enqueuedActions);
      // 实际命中 = 盾 armor 吃下 (blocked) + 溢出真正落到 hero 侧 (tempShield + HP)
      // applyShieldSlotSelfDamage 不改 state.tempShield / state.hp，所以可以
      // 直接用原 state 预览溢出走 APPLY_DAMAGE 后的结果。
      const actual = result.blocked + previewHeroDamage(state, result.overflow);
      return { actualDamage: actual };
    }
    enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: damage, source, selfInflicted: true });
    return { actualDamage: previewHeroDamage(state, damage) };
  };

  switch (pending.effect) {
    case 'armor-strike': {
      const baseDamage = (pending as any).pendingDamage ?? 0;
      if (baseDamage <= 0 && (pending.card.amplifyBonus ?? 0) <= 0) {
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, '护甲一击没有造成伤害。');
      }
      const echoMulAS = (pending as any).echoMultiplier ?? 1;
      const totalDamage = computeSpellDamagePure(state, baseDamage + (pending.card.amplifyBonus ?? 0)) * echoMulAS;
      const echoTagAS = echoMulAS > 1 ? `（回响×${echoMulAS}）` : '';
      if (isHeroTarget) {
        applySelfDamage(totalDamage, 'armor-strike');
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, `御甲破击对${targetName}造成 ${totalDamage} 点伤害！${echoTagAS}`, { dealtDamage: true });
      }
      ensureEngaged(state, monster!, enqueuedActions);
      enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster!.id, damage: totalDamage, source: 'armor-strike', isSpellDamage: true });
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, `御甲破击造成 ${totalDamage} 点伤害。${echoTagAS}`);
    }

    case 'blood-reckoning': {
      // 卡面文案：「造成等同于当前金币数量的伤害，并恢复等量生命」。
      // 「等量」= **实际造成的伤害**（玩家直觉「打了多少回多少」），不是 totalDamage：
      //  - 怪物目标：镜像 reducer 的减免链（诅咒碑免疫 / 虫盾 / 法抗 / Golem 单次伤害 cap）
      //    + 单层 HP cap（overflow 不串层 → 多余的伤害浪费，不算回血）
      //  - 自伤目标：实际"命中"hero 侧的总量（盾 armor + tempShield + HP loss）；
      //    死守 / 不灭守护 完全抵消 → 0 回血。
      //  自伤分支仍然先 APPLY_DAMAGE 让 reduceApplyDamage 触发血怒战符 / 复生赐福 /
      //  赎血召牌符 / totalDamageTaken 簿记，HEAL 走 actualDamage。
      const echo = (pending as any).echoMultiplier ?? 1;
      const totalDamage = computeSpellDamagePure(state, state.gold + (pending.card.amplifyBonus ?? 0)) * echo;
      const echoText = echo > 1 ? '（回响×2）' : '';
      let actualDamage = 0;
      if (isHeroTarget) {
        if (totalDamage > 0) {
          const r = applySelfDamage(totalDamage, 'blood-reckoning');
          actualDamage = r.actualDamage;
          if (actualDamage > 0) {
            enqueuedActions.push({ type: 'HEAL', amount: actualDamage, source: 'blood-reckoning' });
          }
        }
        const healText = actualDamage > 0 ? `，恢复 ${actualDamage} 点生命` : '';
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
          `点金裁决对${targetName}造成 ${actualDamage} 点伤害${healText}！${echoText}`, { dealtDamage: true });
      }
      ensureEngaged(state, monster!, enqueuedActions);
      // 减免链 + 单层 HP cap → 实际造成的伤害。helper 严格镜像 reducer 链；
      // 若 reducer 增加了新减免（spell-damage mitigation），该 helper 也必须同步更新，
      // 否则这里会回血对不上。参考 spell-overkill-mitigation.test.ts 的同款 pattern。
      const mit = computeEffectiveSpellDamageOnMonster(state, monster!.id, totalDamage);
      const monsterHp = Math.max(0, monster!.hp ?? monster!.value ?? 0);
      actualDamage = Math.min(mit.effectiveDamage, monsterHp);
      enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster!.id, damage: totalDamage, source: 'blood-reckoning', isSpellDamage: true });
      if (actualDamage > 0) {
        enqueuedActions.push({ type: 'HEAL', amount: actualDamage, source: 'blood-reckoning' });
      }
      const healText = actualDamage > 0 ? `，恢复 ${actualDamage} 点生命` : '';
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `点金裁决造成 ${actualDamage} 点伤害${healText}！${echoText}`);
    }

    case 'bounty-spell-damage': {
      const echo = (pending as any).echoMultiplier ?? 1;
      const baseDmg = 5 + (pending.card.amplifyBonus ?? 0);
      const totalDamage = computeSpellDamagePure(state, baseDmg) * echo;
      const echoText = echo > 1 ? '（回响×2）' : '';
      if (isHeroTarget) {
        // 自伤路径仍发金币（"其他都能继续触发"），仅伤害落点改成自己/盾。
        if (totalDamage > 0) {
          applySelfDamage(totalDamage, 'bounty-spell-damage');
        }
        enqueuedActions.push({ type: 'MODIFY_GOLD', delta: totalDamage, source: 'bounty-spell-damage' });
        sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `赏金裁决：对${targetName}造成 ${totalDamage} 点法术伤害，获得 ${totalDamage} 金币` } });
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
          `赏金裁决：${targetName} ${totalDamage} 点 → ${totalDamage} 金币！${echoText}`, { dealtDamage: true });
      }
      ensureEngaged(state, monster!, enqueuedActions);
      enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster!.id, damage: totalDamage, source: 'bounty-spell-damage', isSpellDamage: true });
      enqueuedActions.push({ type: 'MODIFY_GOLD', delta: totalDamage, source: 'bounty-spell-damage' });
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `赏金裁决：对 ${monster!.name} 造成 ${totalDamage} 点法术伤害，获得 ${totalDamage} 金币` } });
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `赏金裁决：${totalDamage} 点伤害 → ${totalDamage} 金币！${echoText}`, { dealtDamage: true });
    }

    case 'missing-hp-smite': {
      const smitePcts = [50, 75, 100];
      const smitePct = smitePcts[pending.card.upgradeLevel ?? 0] ?? smitePcts[smitePcts.length - 1];
      const heroMaxHp = computeMaxHp(state);
      const missingHp = Math.max(0, heroMaxHp - state.hp);
      const scaledDmg = Math.floor(missingHp * smitePct / 100);
      const echoMulMHS = (pending as any).echoMultiplier ?? 1;
      const totalDamage = computeSpellDamagePure(state, scaledDmg + (pending.card.amplifyBonus ?? 0)) * echoMulMHS;
      if (totalDamage <= 0) {
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, '你处于满血状态，没有造成伤害。');
      }
      const echoTagMHS = echoMulMHS > 1 ? `（回响×${echoMulMHS}）` : '';
      if (isHeroTarget) {
        applySelfDamage(totalDamage, 'missing-hp-smite');
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
          `残血裁决对${targetName}释放 ${totalDamage} 点伤害（${smitePct}%）。${echoTagMHS}`, { dealtDamage: true });
      }
      ensureEngaged(state, monster!, enqueuedActions);
      enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster!.id, damage: totalDamage, source: 'missing-hp-smite', isSpellDamage: true });
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `残血裁决释放 ${totalDamage} 点伤害（${smitePct}%）。${echoTagMHS}`);
    }

    case 'blood-sacrifice-strike': {
      const hpToLose = (pending as any).hpLost ?? 0;
      const baseDmgPerHit = (pending as any).pendingDamage ?? 0;
      const echoMulBSS = (pending as any).echoMultiplier ?? 1;
      const dmgPerHit = baseDmgPerHit * echoMulBSS;
      const totalDamage = dmgPerHit * 2;
      const echoTagBSS = echoMulBSS > 1 ? `（回响×${echoMulBSS}，每次伤害 ×${echoMulBSS}，献祭 HP 不翻倍）` : '';
      // 献祭 HP 成本：无论目标是谁都先扣（与原行为一致），一次性扣，不分裂。
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: hpToLose, source: 'general', selfInflicted: true });
      if (isHeroTarget) {
        // 自伤路径：consolidate 成一次 applySelfDamage（hero/盾 没有「两次之间结算」
        // 的语义需求；与 stun-strike 等多段法术的自伤路径一致；盾路径如果分两次走
        // applyShieldSlotSelfDamage 会基于同一 state 重复扣 armor，结果错误）。
        if (totalDamage > 0) {
          applySelfDamage(totalDamage, 'blood-sacrifice-strike');
        }
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
          `血祭裁决：献祭 ${hpToLose} 点生命，再对${targetName}造成 ${dmgPerHit} 点伤害 ×2 次（共 ${totalDamage}）！${echoTagBSS}`, { dealtDamage: true });
      }
      // 怪物路径：两次独立的 DEAL_DAMAGE_TO_MONSTER。pipeline 的 enqueueFront 让
      // hit 1 enqueue 的所有 follow-up（MONSTER_DEFEATED / 掉层动画 / 怪物技能触发
      // 等）排在 hit 2 之前结算；如果 hit 1 击杀，hit 2 通过 reduceDealDamageToMonster
      // 入口的 `idx < 0 → noChange` 安全 no-op。
      ensureEngaged(state, monster!, enqueuedActions);
      enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster!.id, damage: dmgPerHit, source: 'blood-sacrifice-strike', isSpellDamage: true });
      enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster!.id, damage: dmgPerHit, source: 'blood-sacrifice-strike', isSpellDamage: true });
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `血祭裁决：献祭 ${hpToLose} 点生命，对 ${monster!.name} 造成 ${dmgPerHit} 点伤害 ×2 次（共 ${totalDamage}）！${echoTagBSS}`, { dealtDamage: true });
    }

    case 'scaling-damage': {
      const strikeBase = (pending as any).pendingDamage ?? 1;
      const echo = (pending as any).echoMultiplier ?? 1;
      const totalDamage = computeSpellDamagePure(state, strikeBase) * echo;
      const nextBase = pending.card.scalingDamage ?? strikeBase + 1;
      if (isHeroTarget) {
        if (totalDamage > 0) {
          applySelfDamage(totalDamage, 'scaling-damage');
        }
        enqueuedActions.push({ type: 'ADD_PERMANENT_MAGIC_TO_RECYCLE', card: pending.card });
        patch.pendingMagicAction = null;
        sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `${pending.card.name}：对${targetName}造成 ${totalDamage} 点（下一击叠刺 ${nextBase}）` } });
        sideEffects.push({ event: 'hero:cardRemoved', payload: { cardId: pending.card.id, animate: false } });
        patch.heroSkillBanner = `${pending.card.name} 下一击叠刺 ${nextBase}`;
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      ensureEngaged(state, monster!, enqueuedActions);
      enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster!.id, damage: totalDamage, source: 'scaling-damage', isSpellDamage: true });
      enqueuedActions.push({ type: 'ADD_PERMANENT_MAGIC_TO_RECYCLE', card: pending.card });
      patch.pendingMagicAction = null;
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `${pending.card.name}：对 ${monster!.name} 造成 ${totalDamage} 点（下一击叠刺 ${nextBase}）` } });
      sideEffects.push({ event: 'hero:cardRemoved', payload: { cardId: pending.card.id, animate: false } });
      patch.heroSkillBanner = `${pending.card.name} 下一击叠刺 ${nextBase}`;
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'arcane-storm': {
      const stormBase = (pending as any).pendingDamage ?? 1;
      const echo = (pending as any).echoMultiplier ?? 1;
      const totalDamage = computeSpellDamagePure(state, stormBase) * echo;
      const echoText = echo > 1 ? `（回响×${echo}）` : '';
      // 「使用后计数清零」契约：目标选定 → 伤害落地 → 重置 arcaneStormMagicCount。
      patch.arcaneStormMagicCount = 0;
      if (isHeroTarget) {
        if (totalDamage > 0) {
          applySelfDamage(totalDamage, 'arcane-storm');
        }
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
          `奥术风暴：对${targetName}造成 ${totalDamage} 点伤害。${echoText}`, { dealtDamage: true });
      }
      ensureEngaged(state, monster!, enqueuedActions);
      enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster!.id, damage: totalDamage, source: 'arcane-storm', isSpellDamage: true });
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `奥术风暴：对 ${monster!.name} 造成 ${totalDamage} 点伤害。${echoText}`);
    }

    case 'chaos-strike': {
      const chaosDamage = computeSpellDamagePure(state, 3 + (pending.card.amplifyBonus ?? 0));
      let chaosBanner: string;
      if (isHeroTarget) {
        // overkill 概念不适用：选 hero/盾 时不抽牌，仅自伤（盾会先吃 armor）。
        if (chaosDamage > 0) {
          applySelfDamage(chaosDamage, 'chaos-strike');
        }
        chaosBanner = `混沌冲击对${targetName}造成 ${chaosDamage} 点伤害。`;
      } else {
        ensureEngaged(state, monster!, enqueuedActions);
        // 同 overkill-upgrade：超杀抽牌奖励必须基于 reducer 真实落地的伤害。
        const mitigation = computeEffectiveSpellDamageOnMonster(state, monster!.id, chaosDamage);
        enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster!.id, damage: chaosDamage, source: 'chaos-strike', isSpellDamage: true });
        if (mitigation.effectiveDamage <= 0) {
          if (mitigation.immuneByBuilding) {
            chaosBanner = `混沌冲击对 ${monster!.name} 无效（受到诅咒碑光环保护）。`;
          } else if (mitigation.bugletShielded) {
            chaosBanner = `混沌冲击对 ${monster!.name} 无效（虫盾抵挡）。`;
          } else {
            chaosBanner = `混沌冲击对 ${monster!.name} 没有造成伤害。`;
          }
        } else {
          const overkill = mitigation.effectiveDamage > (monster!.hp ?? monster!.value ?? 0);
          if (overkill) {
            enqueuedActions.push({ type: 'DRAW_FROM_BACKPACK', count: 2 });
            chaosBanner = `混沌冲击对 ${monster!.name} 造成 ${mitigation.effectiveDamage} 伤害，超杀！抽 2 张牌。`;
          } else {
            const reducedNote = mitigation.spellResisted ? `（抗性：${chaosDamage} → ${mitigation.effectiveDamage}）` : '';
            chaosBanner = `混沌冲击对 ${monster!.name} 造成 ${mitigation.effectiveDamage} 点伤害。${reducedNote}`;
          }
        }
      }
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: chaosBanner } });
      const echoRemaining = ((pending as any).echoRemaining ?? 1) - 1;
      if (echoRemaining > 0) {
        const remainingMonsters = flattenActiveRowSlots(state.activeCards as ActiveRowSlots).filter(isDamageableTarget);
        // Echo 仍在继续：即便 active row 没怪也允许 hero 自伤路径。
        if (remainingMonsters.length > 0 || isHeroTarget) {
          const totalEcho = (pending as any).echoRemaining ?? 1;
          const echoLabel = `（回响：第 ${totalEcho - echoRemaining + 1}/${totalEcho} 次）`;
          patch.pendingMagicAction = {
            card: pending.card, effect: 'chaos-strike', step: 'monster-select',
            prompt: `${chaosBanner} 继续选择目标。${echoLabel}`,
            data: {}, echoRemaining,
            allowsHeroTarget: true,
          } as PendingMagicAction;
          patch.heroSkillBanner = `${chaosBanner} 继续选择目标。${echoLabel}`;
          return applyPatch(state, patch, sideEffects, enqueuedActions);
        }
      }
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, chaosBanner);
    }

    case 'overkill-upgrade': {
      // 升级表（与 magic-effects.resolveOverkillUpgrade / helpers.computeDamageMagicDisplayPure 保持一致）：
      //   L0：3 dmg，超杀升级 1 张牌
      //   L1：5 dmg，超杀升级 1 张牌
      //   L2：5 dmg，超杀升级 2 张牌（CardUpgradeModal maxCount=2）
      const okLvl = (pending.card as any).upgradeLevel ?? 0;
      const okBaseDmgs = [3, 5, 5];
      const okUpgradeCounts = [1, 1, 2];
      const okBaseDmg = okBaseDmgs[okLvl] ?? okBaseDmgs[okBaseDmgs.length - 1];
      const okUpgradeCount = okUpgradeCounts[okLvl] ?? okUpgradeCounts[okUpgradeCounts.length - 1];
      const okCountText = okUpgradeCount === 1 ? '一张牌' : `${okUpgradeCount} 张牌`;
      const okDamage = computeSpellDamagePure(state, okBaseDmg + (pending.card.amplifyBonus ?? 0));
      let okBanner: string;
      if (isHeroTarget) {
        // overkill 概念不适用：选 hero/盾 时不开升级模态，仅自伤（盾会先吃 armor）。
        if (okDamage > 0) {
          applySelfDamage(okDamage, 'overkill-upgrade');
        }
        okBanner = `淬炼冲击对${targetName}造成 ${okDamage} 点伤害。`;
      } else {
        ensureEngaged(state, monster!, enqueuedActions);
        // Overkill 奖励必须基于 reducer 真实落地的伤害，否则法免 / 虫盾 / 法抗 / 护体
        // 都会触发"假超杀"（升级窗弹出但怪物没死）。helper 严格镜像 reducer 的减免链。
        const mitigation = computeEffectiveSpellDamageOnMonster(state, monster!.id, okDamage);
        enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster!.id, damage: okDamage, source: 'overkill-upgrade', isSpellDamage: true });
        if (mitigation.effectiveDamage <= 0) {
          if (mitigation.immuneByBuilding) {
            okBanner = `淬炼冲击对 ${monster!.name} 无效（受到诅咒碑光环保护）。`;
          } else if (mitigation.bugletShielded) {
            okBanner = `淬炼冲击对 ${monster!.name} 无效（虫盾抵挡）。`;
          } else {
            okBanner = `淬炼冲击对 ${monster!.name} 没有造成伤害。`;
          }
        } else {
          const overkill = mitigation.effectiveDamage > (monster!.hp ?? monster!.value ?? 0);
          if (overkill) {
            // L2：maxCount=2 让升级模态保持打开，玩家连续选 2 张牌升级；
            // L0/L1 不指定（=undefined → 选 1 张就关闭）。
            //
            // 走 ENQUEUE_PENDING_UPGRADE_MODAL 而不是直接 SET_UPGRADE_MODAL_OPEN：
            // 因为同一个超杀杀的怪物会同时触发战利品 reward 队列（含可能的
            // 'upgradeCard' 奖励），两个 upgrade 模态同帧 open 会被 boolean
            // upgradeModalOpen 字段合并成单次升级机会。pendingUpgradeModalOpens
            // 队列让两个模态依次弹出。详见 `pendingUpgradeModalOpens` 字段
            // JSDoc + `EnqueuePendingUpgradeModalAction` JSDoc。
            enqueuedActions.push({
              type: 'ENQUEUE_PENDING_UPGRADE_MODAL',
              maxCount: okUpgradeCount > 1 ? okUpgradeCount : undefined,
              banner: `淬炼冲击：选择${okCountText}升级。`,
            });
            okBanner = `淬炼冲击对 ${monster!.name} 造成 ${mitigation.effectiveDamage} 伤害，超杀！选择${okCountText}升级。`;
          } else {
            const reducedNote = mitigation.spellResisted ? `（抗性：${okDamage} → ${mitigation.effectiveDamage}）` : '';
            okBanner = `淬炼冲击对 ${monster!.name} 造成 ${mitigation.effectiveDamage} 点伤害。${reducedNote}`;
          }
        }
      }
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: okBanner } });
      const echoRemaining = ((pending as any).echoRemaining ?? 1) - 1;
      if (echoRemaining > 0) {
        const remainingMonsters = flattenActiveRowSlots(state.activeCards as ActiveRowSlots).filter(isDamageableTarget);
        if (remainingMonsters.length > 0 || isHeroTarget) {
          const totalEcho = (pending as any).echoRemaining ?? 1;
          const echoLabel = `（回响：第 ${totalEcho - echoRemaining + 1}/${totalEcho} 次）`;
          patch.pendingMagicAction = {
            card: pending.card, effect: 'overkill-upgrade', step: 'monster-select',
            prompt: `${okBanner} 继续选择目标。${echoLabel}`,
            data: {}, echoRemaining,
            allowsHeroTarget: true,
          } as PendingMagicAction;
          patch.heroSkillBanner = `${okBanner} 继续选择目标。${echoLabel}`;
          return applyPatch(state, patch, sideEffects, enqueuedActions);
        }
      }
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, okBanner);
    }

    case 'flip-monster-debuff': {
      // 翻覆震慑 — set state.flipDebuffMonsterId to the chosen monster.
      // Cleared at next waterfall (rules/waterfall.ts) or when monster leaves active row.
      // Note: only one monster can be in 震慑 at a time. Echo re-prompt picks a SECOND
      // monster which OVERWRITES the first; we still log + banner each pick so the
      // player understands the second selection replaced the first.
      // 此分支不设 allowsHeroTarget → 顶层守卫保证 monster 必为非空。
      const m = monster!;
      patch.flipDebuffMonsterId = m.id;
      const echoRemainingDebuff = ((pending as any).echoRemaining ?? 1) - 1;
      if (echoRemainingDebuff > 0) {
        const otherMonsters = (state.activeCards as (GameCardData | null)[])
          .filter((c): c is GameCardData => Boolean(c && c.type === 'monster' && c.id !== m.id));
        if (otherMonsters.length > 0) {
          const totalEcho = (pending as any).echoRemaining ?? 1;
          const echoLabel = `（回响：第 ${totalEcho - echoRemainingDebuff + 1}/${totalEcho} 次，将覆盖前一次目标）`;
          const next: PendingMagicAction = {
            card: pending.card,
            effect: 'flip-monster-debuff',
            step: 'monster-select',
            prompt: `翻覆震慑：选择第二个怪物（将覆盖前一目标）。${echoLabel}`,
            echoRemaining: echoRemainingDebuff,
          } as PendingMagicAction;
          const reprompt = maybeRepromptEcho(
            state, patch, sideEffects, enqueuedActions,
            { card: pending.card, echoRemaining: (pending as any).echoRemaining },
            next,
            `翻覆震慑：${m.name} 进入震慑。${echoLabel}`,
          );
          if (reprompt) return reprompt;
        }
      }
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `翻覆震慑：${m.name} 进入震慑（每翻转一张牌 -1 攻击，至下次瀑流）。`);
    }

    case 'soul-swap': {
      // 此分支不设 allowsHeroTarget → 顶层守卫保证 monster 必为非空。
      const m = monster!;
      if (m.bossPhase || m.isFinalMonster) {
        patch.heroSkillBanner = '不能对Boss使用等价交换。';
        return applyPatch(state, patch, sideEffects);
      }
      const swapSlotId = (pending as any).slotId as EquipmentSlotId;
      const swapSlotItem = getSlotItem(state, swapSlotId);
      if (!swapSlotItem) {
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, '装备已不存在，等价交换取消。');
      }
      const oldDurability = swapSlotItem.durability ?? 0;
      const oldMonsterLayers = m.currentLayer ?? 1;
      const newMaxDur = clampMaxDurability(Math.max((swapSlotItem as any).maxDurability ?? oldDurability, oldMonsterLayers));
      const newDur = Math.min(oldMonsterLayers, newMaxDur);
      patch[swapSlotId] = { ...swapSlotItem, durability: newDur, maxDurability: newMaxDur } as any;
      const updatedCards = (state.activeCards as any[]).map(slot => {
        if (!slot || slot.id !== m.id) return slot;
        return { ...slot, currentLayer: oldDurability, hp: slot.maxHp ?? slot.hp ?? 0, fury: Math.max(slot.fury ?? 0, oldDurability), hpLayers: Math.max(slot.hpLayers ?? 0, oldDurability) };
      });
      patch.activeCards = updatedCards;
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `等价交换：${swapSlotItem.name} 耐久 ${oldDurability}→${oldMonsterLayers}，${m.name} 血层 ${oldMonsterLayers}→${oldDurability}。`);
    }

    case 'missile-bolt': {
      const totalDmg = computeSpellDamagePure(state, 1 + (pending.card.amplifyBonus ?? 0));
      if (isHeroTarget) {
        if (totalDmg > 0) {
          applySelfDamage(totalDmg, 'missile-bolt');
        }
        sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `魔弹：对${targetName}造成 ${totalDmg} 点法术伤害` } });
      } else {
        ensureEngaged(state, monster!, enqueuedActions);
        enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster!.id, damage: totalDmg, source: 'missile-bolt', isSpellDamage: true });
        sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `魔弹：对 ${monster!.name} 造成 ${totalDmg} 点法术伤害` } });
        applyMissileRelicEffects(state, patch, sideEffects, enqueuedActions, monster!);
      }
      const echoRemainingMissile = ((pending as any).echoRemaining ?? 1) - 1;
      if (echoRemainingMissile > 0) {
        // hero 始终是合法目标（missile-bolt 上 allowsHeroTarget 永远 true），
        // 所以总是继续 re-prompt — 玩家至少可以把剩余 echo 落到自己身上。
        const totalEcho = (pending as any).echoRemaining ?? 1;
        const echoLabel = `（回响：第 ${totalEcho - echoRemainingMissile + 1}/${totalEcho} 次）`;
        const next: PendingMagicAction = {
          card: pending.card,
          effect: 'missile-bolt',
          step: 'monster-select',
          prompt: `选择下一个目标，造成 ${totalDmg} 点法术伤害。${echoLabel}`,
          echoRemaining: echoRemainingMissile,
          allowsHeroTarget: true,
        } as PendingMagicAction;
        const reprompt = maybeRepromptEcho(
          state, patch, sideEffects, enqueuedActions,
          { card: pending.card, echoRemaining: (pending as any).echoRemaining },
          next,
          `魔弹：对 ${targetName} 造成 ${totalDmg} 点伤害！${echoLabel}`,
        );
        if (reprompt) return reprompt;
      }
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `魔弹：对 ${targetName} 造成 ${totalDmg} 点伤害！`);
    }

    case 'backpack-bolt': {
      // 囊中惊雷 manual monster-select. Mirrors setup in
      // resolveKnightPermanentMagic / 'backpack-bolt':
      //   damage = floor(backpackItems.length * pct / 100)
      //   pct = [50, 75, 100][upgradeLevel]
      //   totalDmg = computeSpellDamagePure(state, base + amp) * echoMultiplier
      // 自伤路径（hero / 盾）走 applySelfDamage，与其它 allowsHeroTarget 单目标
      // 伤害 magic（missile-bolt / apprentice-bolt / stun-cap-strike）一致。
      //
      // 附加：每造成 3 点伤害额外抽 1 张牌（floor(totalDmg / 3)）。
      // - 按「计算出的总法伤」算，不被怪物 HP 截断（溢杀也算，玩家明确确认）。
      // - hero / 盾自伤也算（玩家明确确认）。
      // - 阈值固定 3，不随升级变化（玩家明确确认）。
      // - Echo (A 类)：totalDmg 已含 ×N，floor(totalDmg/3) 自然按 ×N 后的总伤
      //   计算抽牌；echoMul=2、单次 dmg=8 → totalDmg=16 → 抽 5 张（玩家确认）。
      // - 抽牌走 DRAW_CARDS source: 'backpack'（默认入口，自动尊重置顶语义；
      //   见 draw-cards-defaults-to-backpack.mdc）。
      const echoMulBB = (pending as any).echoMultiplier ?? 1;
      // 重新读 state.backpackItems.length：从 setup 到 resolve 之间不会变化
      // （pendingMagicAction 期间没有其它消耗背包的 action 跑），但用 data 字段
      // 锁住 setup 时的快照 base 更稳，避免被任何中间路径改背包后数值漂移。
      const baseDmgBB = (pending as any).data?.baseDmg ?? 0;
      const pctBB = (pending as any).data?.pct ?? 100;
      const totalDmgBB = computeSpellDamagePure(state, baseDmgBB + (pending.card.amplifyBonus ?? 0)) * echoMulBB;
      const drawCountBB = Math.floor(totalDmgBB / 3);
      const echoTagBB = echoMulBB > 1 ? `（回响×${echoMulBB}）` : '';
      const drawTagBB = drawCountBB > 0 ? `，抽 ${drawCountBB} 张牌` : '';

      if (isHeroTarget) {
        if (totalDmgBB > 0) {
          applySelfDamage(totalDmgBB, 'backpack-bolt');
        }
        if (drawCountBB > 0) {
          enqueuedActions.push({ type: 'DRAW_CARDS', count: drawCountBB, source: 'backpack' });
        }
        sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `${pending.card.name}：对${targetName}造成 ${totalDmgBB} 点法术伤害（${pctBB}%）${drawTagBB}` } });
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
          `${pending.card.name}：${targetName} ${totalDmgBB} 点法术伤害${drawTagBB}。${echoTagBB}`,
          { dealtDamage: true });
      }

      ensureEngaged(state, monster!, enqueuedActions);
      enqueuedActions.push({
        type: 'DEAL_DAMAGE_TO_MONSTER',
        monsterId: monster!.id,
        damage: totalDmgBB,
        source: 'backpack-bolt',
        isSpellDamage: true,
      });
      if (drawCountBB > 0) {
        enqueuedActions.push({ type: 'DRAW_CARDS', count: drawCountBB, source: 'backpack' });
      }
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `${pending.card.name}：对 ${monster!.name} 造成 ${totalDmgBB} 点法术伤害（${pctBB}%）${drawTagBB}` } });
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `${pending.card.name}：${totalDmgBB} 点法术伤害${drawTagBB}。${echoTagBB}`,
        { dealtDamage: true });
    }

    case 'recycle-bolt': {
      // 池中惊雷 manual monster-select. Mirrors setup in
      // resolveKnightPermanentMagic / 'recycle-bolt':
      //   damage = floor(permanentMagicRecycleBag.length * pct / 100)
      //   pct = [100, 125, 150][upgradeLevel]
      //   totalDmg = computeSpellDamagePure(state, base + amp) * echoMultiplier
      // 自伤路径（hero / 盾）走 applySelfDamage，与 backpack-bolt 同款。
      const echoMulRB = (pending as any).echoMultiplier ?? 1;
      // 用 setup 时锁住的 baseDmg 快照，避免 recycleBag 在 setup→resolve 之间被
      // 改动（理论上 pendingMagicAction 期间不会有其它路径改 recycleBag，但保险一些）。
      const baseDmgRB = (pending as any).data?.baseDmg ?? 0;
      const pctRB = (pending as any).data?.pct ?? 150;
      const totalDmgRB = computeSpellDamagePure(state, baseDmgRB + (pending.card.amplifyBonus ?? 0)) * echoMulRB;
      const echoTagRB = echoMulRB > 1 ? `（回响×${echoMulRB}）` : '';

      if (isHeroTarget) {
        if (totalDmgRB > 0) {
          applySelfDamage(totalDmgRB, 'recycle-bolt');
        }
        sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `${pending.card.name}：对${targetName}造成 ${totalDmgRB} 点法术伤害（${pctRB}%）` } });
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
          `${pending.card.name}：${targetName} ${totalDmgRB} 点法术伤害。${echoTagRB}`,
          { dealtDamage: true });
      }

      ensureEngaged(state, monster!, enqueuedActions);
      enqueuedActions.push({
        type: 'DEAL_DAMAGE_TO_MONSTER',
        monsterId: monster!.id,
        damage: totalDmgRB,
        source: 'recycle-bolt',
        isSpellDamage: true,
      });
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `${pending.card.name}：对 ${monster!.name} 造成 ${totalDmgRB} 点法术伤害（${pctRB}%）` } });
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `${pending.card.name}：${totalDmgRB} 点法术伤害。${echoTagRB}`,
        { dealtDamage: true });
    }

    case 'apprentice-bolt': {
      // 学徒法弹（starter perm-1 magic, no upgrade）：
      // 选一个目标造成 1 点法术伤害（受 amplify / spell-damage buff 影响）。
      // 与 missile-bolt 几乎对称，差异：
      //   - 卡名固定走 pending.card.name → log/banner 文案使用「学徒法弹」
      //   - 不调 applyMissileRelicEffects：missile-* 永恒护符是为「魔弹」专门设计的
      //     thematic relic（震荡弹幕 / 汲取弹幕），学徒法弹是新手卡，按用户原意只
      //     做「1 点法术伤害」，不附带 relic 联动。
      // 回响走 modal echo pattern（与 missile-bolt 同款），允许玩家把每发 echo 落到
      // 不同目标，hero 始终是合法目标。
      const totalDmg = computeSpellDamagePure(state, 1 + (pending.card.amplifyBonus ?? 0));
      if (isHeroTarget) {
        if (totalDmg > 0) {
          applySelfDamage(totalDmg, 'apprentice-bolt');
        }
        sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `${pending.card.name}：对${targetName}造成 ${totalDmg} 点法术伤害` } });
      } else {
        ensureEngaged(state, monster!, enqueuedActions);
        enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster!.id, damage: totalDmg, source: 'apprentice-bolt', isSpellDamage: true });
        sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `${pending.card.name}：对 ${monster!.name} 造成 ${totalDmg} 点法术伤害` } });
      }
      const echoRemainingApprentice = ((pending as any).echoRemaining ?? 1) - 1;
      if (echoRemainingApprentice > 0) {
        const totalEcho = (pending as any).echoRemaining ?? 1;
        const echoLabel = `（回响：第 ${totalEcho - echoRemainingApprentice + 1}/${totalEcho} 次）`;
        const next: PendingMagicAction = {
          card: pending.card,
          effect: 'apprentice-bolt',
          step: 'monster-select',
          prompt: `选择下一个目标，造成 ${totalDmg} 点法术伤害。${echoLabel}`,
          echoRemaining: echoRemainingApprentice,
          allowsHeroTarget: true,
        } as PendingMagicAction;
        const reprompt = maybeRepromptEcho(
          state, patch, sideEffects, enqueuedActions,
          { card: pending.card, echoRemaining: (pending as any).echoRemaining },
          next,
          `${pending.card.name}：对 ${targetName} 造成 ${totalDmg} 点伤害！${echoLabel}`,
        );
        if (reprompt) return reprompt;
      }
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `${pending.card.name}：对 ${targetName} 造成 ${totalDmg} 点伤害！`);
    }

    case 'stun-strike': {
      const echo = (pending as any).echoMultiplier ?? 1;
      const baseDmgPerHit = (pending as any).data?.baseDmgPerHit ?? 1;
      const stunPct = Math.min((pending as any).data?.stunPct ?? 10, state.stunCap ?? 0);
      const hits = (pending as any).data?.hits ?? 2;
      const hitDmg = computeSpellDamagePure(state, baseDmgPerHit) * echo;
      const totalDmg = hitDmg * hits;
      const threshold = Math.round((stunPct / 100) * 20);
      if (isHeroTarget) {
        // 选 hero/盾：纯自伤；不掷击晕骰（hero 不能被击晕）。
        if (totalDmg > 0) {
          applySelfDamage(totalDmg, 'stun-strike');
        }
        sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `雷震击：对${targetName}造成 ${hitDmg}×${hits} 点法术伤害` } });
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
          `雷震击：对${targetName}造成 ${hitDmg}×${hits} 点伤害！`, { dealtDamage: true });
      }
      ensureEngaged(state, monster!, enqueuedActions);
      enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster!.id, damage: totalDmg, source: 'stun-strike', isSpellDamage: true });
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `雷震击：对 ${monster!.name} 造成 ${hitDmg}×${hits} 点法术伤害` } });
      if (threshold > 0 && !monster!.isStunned) {
        const [hsRoll, hsRng] = nextInt(patch.rng ?? state.rng, 1, 20);
        patch.rng = hsRng;
        sideEffects.push({ event: 'ui:requestDice', payload: {
          title: monster!.name,
          subtitle: `雷震击晕判定 第1击（${stunPct}%）`,
          entries: [
            { id: 'stun', range: [1, threshold] as [number, number], label: '击晕成功！', effect: 'none' },
            { id: 'miss', range: [threshold + 1, 20] as [number, number], label: '未击晕', effect: 'none' },
          ],
          context: { flowId: 'hero-stun', monsterId: monster!.id, monsterName: monster!.name, currentHit: 1, totalHits: hits, stunPct, hitDmg, magicCardId: pending.card.id },
          predeterminedRoll: hsRoll,
        } });
        tickStunAttemptDiscoverProgress(state, patch, sideEffects);
      }
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `雷震击：对 ${monster!.name} 造成 ${hitDmg}×${hits} 点伤害！${threshold > 0 ? '' : ' 未能击晕。'}`);
    }

    case 'stun-cap-strike': {
      // 雷涌一击 manual monster-select. Mirror auto-pick path in
      // resolveKnightPermanentMagic / 'stun-cap-strike' (single-monster branch):
      //   1. damage = ceil(stunCap / divisor) * spellDamage * echo
      //   2. always draw `1 * echo` cards
      //   3. single 60% (capped to stunCap) stun dice
      const echoMul = (pending as any).echoMultiplier ?? 1;
      const baseDmg = (pending as any).data?.baseDmg ?? 0;
      const stunPct = Math.min((pending as any).data?.stunPct ?? 0, state.stunCap ?? 0);
      const totalDmg = computeSpellDamagePure(state, baseDmg + (pending.card.amplifyBonus ?? 0)) * echoMul;
      const drawCount = 1 * echoMul;
      const echoTag = echoMul > 1 ? `（回响×${echoMul}）` : '';
      const threshold = Math.round((stunPct / 100) * 20);

      if (isHeroTarget) {
        // 选 hero/盾：自伤 + 抽牌（"其他都能继续触发"）；不掷击晕骰（hero 不能被击晕）。
        if (totalDmg > 0) {
          applySelfDamage(totalDmg, 'stun-cap-strike');
        }
        if (drawCount > 0) {
          const drawState = { ...state, ...patch } as GameState;
          const drawResult = drawMultipleFromBackpack(drawState, drawCount);
          if (drawResult.cards.length > 0) {
            Object.assign(patch, drawResult.patch);
            for (const d of drawResult.cards) {
              sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: d.id, source: 'backpack' } });
            }
            applyMirrorCopySummonProgress(state, patch, sideEffects, enqueuedActions, drawResult.cards.length);
          }
        }
        sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `${pending.card.name}：对${targetName}造成 ${totalDmg} 点法术伤害，抽 ${drawCount} 张牌。${echoTag}` } });
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
          `${pending.card.name}：${targetName} ${totalDmg}，抽 ${drawCount} 张。${echoTag}`,
          { dealtDamage: true });
      }

      ensureEngaged(state, monster!, enqueuedActions);
      enqueuedActions.push({
        type: 'DEAL_DAMAGE_TO_MONSTER',
        monsterId: monster!.id,
        damage: totalDmg,
        source: 'stun-cap-strike',
        isSpellDamage: true,
      });
      if (drawCount > 0) {
        const drawState = { ...state, ...patch } as GameState;
        const drawResult = drawMultipleFromBackpack(drawState, drawCount);
        if (drawResult.cards.length > 0) {
          Object.assign(patch, drawResult.patch);
          for (const d of drawResult.cards) {
            sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: d.id, source: 'backpack' } });
          }
          applyMirrorCopySummonProgress(state, patch, sideEffects, enqueuedActions, drawResult.cards.length);
        }
      }
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `${pending.card.name}：对 ${monster!.name} 造成 ${totalDmg} 点法术伤害，抽 ${drawCount} 张牌。${echoTag}` } });
      if (threshold > 0 && !monster!.isStunned) {
        const [hsRoll, hsRng] = nextInt(patch.rng ?? state.rng, 1, 20);
        patch.rng = hsRng;
        sideEffects.push({ event: 'ui:requestDice', payload: {
          title: monster!.name,
          subtitle: `${pending.card.name} 击晕判定（${stunPct}%）`,
          entries: [
            { id: 'stun', range: [1, threshold] as [number, number], label: '击晕成功！', effect: 'none' },
            { id: 'miss', range: [threshold + 1, 20] as [number, number], label: '未击晕', effect: 'none' },
          ],
          context: {
            flowId: 'hero-stun',
            sourceLabel: pending.card.name,
            monsterId: monster!.id,
            monsterName: monster!.name,
            currentHit: 1,
            totalHits: 1,
            stunPct,
            magicCardId: pending.card.id,
          },
          predeterminedRoll: hsRoll,
        } });
        tickStunAttemptDiscoverProgress(state, patch, sideEffects);
      }
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card,
        `${pending.card.name}：${totalDmg} 法伤${threshold > 0 ? `，${stunPct}% 晕` : ''}，抽 ${drawCount} 张。${echoTag}`,
        { dealtDamage: true });
    }

    case 'stat-swap': {
      // 此分支不设 allowsHeroTarget → 顶层守卫保证 monster 必为非空。
      const m = monster!;
      const isFlank = (pending as any).isFlank ?? false;
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `攻防互换：对 ${m.name}${isFlank ? '（侧击）' : ''}` } });
      patch.pendingMagicAction = null;
      enqueuedActions.push({ type: 'RESOLVE_STAT_SWAP', card: pending.card, targetMonsterId: m.id, isFlank });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'repair-enrage-dice': {
      // 此分支不设 allowsHeroTarget → 顶层守卫保证 monster 必为非空。
      const m = monster!;
      const repairSlotId = (pending as any).slotId as EquipmentSlotId;
      const [reRoll, reRng] = nextInt(patch.rng ?? state.rng, 1, 20);
      patch.rng = reRng;
      sideEffects.push({ event: 'ui:requestDice', payload: {
        title: m.name,
        subtitle: '赌运修炼判定',
        entries: [
          { id: 'repair', range: [1, 16] as [number, number], label: '修复成功！', effect: 'none' },
          { id: 'enrage', range: [17, 20] as [number, number], label: '怪物暴怒！', effect: 'none' },
        ],
        context: { flowId: 'repair-enrage-dice', slotId: repairSlotId, monsterId: m.id, cardId: pending.card.id, card: pending.card },
        predeterminedRoll: reRoll,
      } });
      patch.pendingMagicAction = null;
      return applyPatch(state, patch, sideEffects);
    }

    case 'transform-streak-strike': {
      const dmg = (pending as any).data?.damage ?? 0;
      const streak = (pending as any).data?.streak ?? 0;
      if (isHeroTarget) {
        if (dmg > 0) {
          applySelfDamage(dmg, 'transform-streak-strike');
        }
        sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `${pending.card.name}：连续转型 ${streak}，对自己造成 ${dmg} 点法术伤害。` } });
        return applyFinalizeMagic(
          state, patch, sideEffects, enqueuedActions, pending.card,
          `${pending.card.name}：连续转型 ${streak} → 自伤 ${dmg} 点！`,
          { dealtDamage: true },
        );
      }
      ensureEngaged(state, monster!, enqueuedActions);
      enqueuedActions.push({
        type: 'DEAL_DAMAGE_TO_MONSTER',
        monsterId: monster!.id,
        damage: dmg,
        source: 'transform-streak-strike',
        isSpellDamage: true,
        landedLogMessage: `${pending.card.name}：连续转型 ${streak}，对 ${monster!.name} 造成 ${dmg} 点法术伤害。`,
      });
      return applyFinalizeMagic(
        state, patch, sideEffects, enqueuedActions, pending.card,
        `${pending.card.name}：连续转型 ${streak} → ${dmg} 点伤害！`,
        { dealtDamage: true },
      );
    }

    default:
      return noChange(state);
  }
}

// ---------------------------------------------------------------------------
// RESOLVE_DUNGEON_CARD_SELECTION — Phase 5d
// ---------------------------------------------------------------------------

function reduceDungeonCardSelection(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_DUNGEON_CARD_SELECTION' }>,
): ReduceResult {
  const pending = state.pendingMagicAction as PendingMagicAction | null;
  if (!pending || pending.step !== 'dungeon-select') return noChange(state);

  const { cardId } = action;
  const activeCards = state.activeCards as (GameCardData | null)[];
  let card = activeCards.find(c => c?.id === cardId);
  // 「乾坤一翻」也能选 Preview Row 卡背 → 在 active 找不到时，用 preview 找一次。
  if (!card && pending.effect === 'flip-active-card') {
    const previewCardsLookup = state.previewCards as (GameCardData | null)[];
    card = previewCardsLookup.find(c => c?.id === cardId);
  }
  if (!card) return noChange(state);

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  switch (pending.effect) {
    case 'dungeon-preview-swap': {
      const activeSlotIdx = activeCards.findIndex(c => c?.id === card.id);
      if (activeSlotIdx === -1) {
        patch.heroSkillBanner = '请选择地城行中的卡牌。';
        return applyPatch(state, patch, sideEffects);
      }
      const previewCards = state.previewCards as (GameCardData | null)[];
      const previewCard = previewCards[activeSlotIdx];
      if (!previewCard) {
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, '正上方预览行没有卡牌，无法互换。');
      }
      // Emit the dimension-warp animation hint BEFORE we patch activeCards /
      // previewCards. The hook listener fires synchronously inside the same
      // dispatch call stack; at that moment the React state has been updated
      // but the DOM hasn't re-rendered yet, so cell ref rects still match the
      // pre-swap visual. The overlay anchored on those rects masks both cells
      // for ~1s while the choreography (flip → swap → flip-back) plays out.
      sideEffects.push({
        event: 'hero:dimensionWarp',
        payload: { cellIndex: activeSlotIdx, activeCard: card, previewCard },
      });

      const newActive = [...activeCards] as typeof activeCards;
      newActive[activeSlotIdx] = previewCard;
      const newPreview = [...previewCards] as typeof previewCards;
      // Strip _fateBladeLastSlot so release-charge buildings (命运之刃 / 增幅祭坛)
      // count this as a position change: when the card later returns to the
      // active row, syncBuildingSlotsPure will see a slot mismatch and re-grant
      // hasReleaseCharge so it's immediately usable again.
      const { _fateBladeLastSlot: _stripped, ...cardWithoutSlotMemo } = card;
      newPreview[activeSlotIdx] = cardWithoutSlotMemo as GameCardData;
      // 地雷碰撞：如果原 active[i] 是地雷、preview[i] 是 monster，swap 后
      // monster 落在 active 地雷格上 → 触发地雷。被触发的地雷会被
      // ADD_TO_GRAVEYARD 路由到坟场，所以它不能保留在 preview row 里 ——
      // 把对应 preview slot 也清掉。
      const previewCollisions = detectMineCollisionsAfterShuffle(activeCards, newActive);
      processMineCollisions(previewCollisions, state, sideEffects, enqueuedActions);
      for (const col of previewCollisions) {
        const previewIdx = newPreview.findIndex(c => c?.id === col.mine.id);
        if (previewIdx !== -1) newPreview[previewIdx] = null;
      }
      patch.activeCards = newActive as any;
      patch.previewCards = newPreview as any;
      let drawMsg = '';
      if ((pending.card.upgradeLevel ?? 0) >= 2) {
        let current = { ...state, ...patch };
        const { card: drawn, patch: drawPatch } = drawFromBackpackToHandPure(current);
        Object.assign(patch, drawPatch);
        if (drawn) {
          sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: drawn.id, source: 'backpack' } });
          applyMirrorCopySummonProgress(state, patch, sideEffects, enqueuedActions, 1);
        }
        drawMsg = drawn ? ` 抽到「${drawn.name}」。` : '';
      }
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `维度扭曲：${card.name} ↔ ${previewCard.name} 互换行位置${drawMsg}` } });
      const swapTrigger = checkSwapUpgrade(state, patch, sideEffects, enqueuedActions);
      const echoRemainingDP = ((pending as any).echoRemaining ?? 1) - 1;
      if (echoRemainingDP > 0) {
        const totalEcho = (pending as any).echoRemaining ?? 1;
        const currentRound = totalEcho - echoRemainingDP + 1;
        const echoLabel = `（回响：第 ${currentRound}/${totalEcho} 次）`;
        const next: PendingMagicAction = {
          card: pending.card,
          effect: 'dungeon-preview-swap',
          step: 'dungeon-select',
          prompt: `选择地城行一张卡牌，与正上方预览行卡牌互换。${echoLabel}`,
          echoRemaining: echoRemainingDP,
        } as PendingMagicAction;
        const reprompt = maybeRepromptEcho(
          state, patch, sideEffects, enqueuedActions,
          { card: pending.card, echoRemaining: (pending as any).echoRemaining },
          next,
          `${card.name} ↔ ${previewCard.name} 互换！${echoLabel}`,
        );
        if (reprompt) return reprompt;
      }
      const banner = `${card.name} ↔ ${previewCard.name} 行位置互换！${drawMsg}`;
      if (swapTrigger) {
        patch.heroSkillBanner = '流转之符：选择一张牌进行升级。';
      }
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, banner);
    }

    case 'fate-swap': {
      const activeSlotIdx = activeCards.findIndex(c => c?.id === card.id);
      if (activeSlotIdx === -1) {
        patch.heroSkillBanner = '请选择地城行中的卡牌。';
        return applyPatch(state, patch, sideEffects);
      }
      const depth = (pending as any).deckDepth ?? 5;
      const deck = state.remainingDeck as GameCardData[];
      if (deck.length === 0) {
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, '牌堆已空，无法交换。');
      }
      const maxIdx = Math.min(depth, deck.length);
      let rng = state.rng;
      const [swapIdx, rng2] = nextInt(rng, 0, maxIdx - 1);
      rng = rng2;
      patch.rng = rng;
      const deckCard = deck[swapIdx];
      const turnCount = (state as any).turnCount ?? 0;
      const ragedDeckCard = applyMonsterRage(deckCard, turnCount);
      sideEffects.push({ event: 'hero:fateSwapFlight', payload: { activeSlotIdx, oldCard: card, newCard: ragedDeckCard } });
      const newDeck = [...deck];
      newDeck[swapIdx] = sanitizeCardMetadata(card);
      let persuadeMsg = '';
      if (ragedDeckCard.type === 'monster') {
        // 卡面字面：「换出来的牌是怪物，则 下次劝降概率 +30%」。
        // 不区分普通/精英；累加到全局 persuadeAmuletBonus（与 劝降之刃 / 感化之锤 /
        // 翻印之符 / 怀柔之印 / 劝降祝福 共用同一短期 buff，下次劝降按下时清零）。
        const boost = 30;
        const newBonus = ((patch.persuadeAmuletBonus ?? state.persuadeAmuletBonus) ?? 0) + boost;
        patch.persuadeAmuletBonus = newBonus;
        persuadeMsg = ` 下次劝降概率 +${boost}%（累计 +${newBonus}%）`;
      }
      const newActive = [...activeCards] as typeof activeCards;
      newActive[activeSlotIdx] = ragedDeckCard;
      // 地雷碰撞：如果 active[activeSlotIdx] 原本是地雷、deck 抽到 monster，
      // swap 后 monster 落在地雷格 → 触发地雷。被触发的地雷不能跟着进牌堆 ——
      // 从 newDeck 里把它清掉，让它走 ADD_TO_GRAVEYARD 进坟场即可。
      const fateCollisions = detectMineCollisionsAfterShuffle(activeCards, newActive);
      processMineCollisions(fateCollisions, state, sideEffects, enqueuedActions);
      for (const col of fateCollisions) {
        const deckIdx = newDeck.findIndex(c => c?.id === col.mine.id);
        if (deckIdx !== -1) newDeck.splice(deckIdx, 1);
      }
      patch.activeCards = newActive as any;
      patch.remainingDeck = newDeck as any;
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `${pending.card.name}：${card.name} 与牌堆第 ${swapIdx + 1} 张 ${deckCard.name} 交换${persuadeMsg}` } });
      const swapTrigger = checkSwapUpgrade(state, patch, sideEffects, enqueuedActions);
      const echoRemainingFS = ((pending as any).echoRemaining ?? 1) - 1;
      if (echoRemainingFS > 0) {
        const totalEcho = (pending as any).echoRemaining ?? 1;
        const currentRound = totalEcho - echoRemainingFS + 1;
        const echoLabel = `（回响：第 ${currentRound}/${totalEcho} 次）`;
        const next: PendingMagicAction = {
          card: pending.card,
          effect: 'fate-swap',
          step: 'dungeon-select',
          prompt: `选择地城行一张牌，与牌堆顶 ${depth} 张中随机一张交换。${echoLabel}`,
          deckDepth: depth,
          echoRemaining: echoRemainingFS,
        } as PendingMagicAction;
        const reprompt = maybeRepromptEcho(
          state, patch, sideEffects, enqueuedActions,
          { card: pending.card, echoRemaining: (pending as any).echoRemaining },
          next,
          `${card.name} ↔ ${deckCard.name}！${echoLabel}`,
        );
        if (reprompt) return reprompt;
      }
      const banner = `${card.name} ↔ ${deckCard.name}（牌堆第 ${swapIdx + 1} 张）交换！${persuadeMsg}`;
      if (swapTrigger) {
        patch.heroSkillBanner = '流转之符：选择一张牌进行升级。';
      }
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, banner);
    }

    case 'dungeon-swap-select': {
      const selIdx = activeCards.findIndex(c => c?.id === card.id);
      if (selIdx === -1) {
        patch.heroSkillBanner = '请选择地城行中的卡牌。';
        return applyPatch(state, patch, sideEffects);
      }
      const swapLeftIdx = (pending as any).leftIdx as number;
      if (selIdx === swapLeftIdx) {
        patch.heroSkillBanner = '不能选择最左边的卡牌自身。';
        return applyPatch(state, patch, sideEffects);
      }
      const leftC = activeCards[swapLeftIdx]!;
      const newActive = [...activeCards] as typeof activeCards;
      const tmp = newActive[swapLeftIdx];
      newActive[swapLeftIdx] = newActive[selIdx];
      newActive[selIdx] = tmp;
      const swapCollisions = detectMineCollisionsAfterShuffle(activeCards, newActive);
      processMineCollisions(swapCollisions, state, sideEffects, enqueuedActions);
      patch.activeCards = clearTriggeredMineSlots(newActive, swapCollisions) as any;
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `乾坤挪移：${card.name} 与 ${leftC.name} 互换位置。` } });
      const swapTrigger = checkSwapUpgrade(state, patch, sideEffects, enqueuedActions);
      const banner = `${card.name} ↔ ${leftC.name} 位置互换！`;
      if (swapTrigger) {
        patch.heroSkillBanner = '流转之符：选择一张牌进行升级。';
      }
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, banner);
    }

    case 'return-dungeon-bottom':
    case 'shuffle-dungeon': {
      const isActiveCard = activeCards.some(c => c?.id === card.id);
      if (!isActiveCard) {
        patch.heroSkillBanner = '请选择当前地城中的卡牌。';
        return applyPatch(state, patch, sideEffects);
      }
      sideEffects.push({ event: 'hero:cardRemoved', payload: { cardId: card.id, animate: false } });
      // 迷宫回溯 (and legacy shuffle-dungeon): emit arc-flight from the
      // selected active cell to the deck pile. Captured slotIdx is stable
      // across the React commit because cell DOM positions don't depend on
      // which card occupies them.
      const removedSlotIdx = activeCards.findIndex(c => c?.id === card.id);
      if (removedSlotIdx !== -1) {
        sideEffects.push({
          event: 'magic:returnToDeck',
          payload: { slotIdx: removedSlotIdx, card },
        });
      }
      // Stack-pop: if the selected (top) card has a stacked card below it
      // (e.g. 幽灵建筑 pushed to stack-bottom by a previous waterfall drop),
      // promote the stack-top into the cleared slot instead of leaving it
      // null. Mirrors the COMPLETE_EVENT pattern in rules/events.ts and
      // GameBoard.tsx removeCard — without this, the underlying ghost
      // building is orphaned in activeCardStacks beneath an empty slot
      // and effectively disappears (a fresh waterfall drop covers it).
      const stacks = state.activeCardStacks ?? {};
      const stackBelow = removedSlotIdx >= 0 ? (stacks[removedSlotIdx] ?? []) : [];
      const newActive = [...activeCards] as typeof activeCards;
      if (removedSlotIdx >= 0 && stackBelow.length > 0) {
        const nextCard = stackBelow[stackBelow.length - 1];
        newActive[removedSlotIdx] = nextCard;
        const popStacks = { ...stacks };
        const remaining = stackBelow.slice(0, -1);
        if (remaining.length === 0) {
          delete popStacks[removedSlotIdx];
        } else {
          popStacks[removedSlotIdx] = remaining;
        }
        patch.activeCardStacks = popStacks;
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'system', message: `堆叠揭示：「${nextCard.name}」从第 ${removedSlotIdx + 1} 列堆叠中浮现！` },
        });
        // Stack pop keeps the slot occupied (card→card, not card→null), so
        // postProcessActiveCards won't detect the removal. Explicitly
        // register the just-removed card as processed to trigger backpack
        // auto-draw (mirrors rules/events.ts COMPLETE_EVENT).
        if (!state.processedDungeonCardIds.includes(card.id)) {
          enqueuedActions.push({ type: 'REGISTER_DUNGEON_CARD_PROCESSED', cardId: card.id, source: 'slot-cleared' });
        }
      } else if (removedSlotIdx >= 0) {
        newActive[removedSlotIdx] = null;
      }
      patch.activeCards = newActive as any;
      const sanitizedCard = sanitizeCardMetadata(card);
      const newDeck = [...(state.remainingDeck as GameCardData[]), sanitizedCard];
      patch.remainingDeck = newDeck as any;
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `${card.name} 已置于牌堆底。` } });
      const swapTrigger = checkSwapUpgrade(state, patch, sideEffects, enqueuedActions);
      const echoRemaining = ((pending as any).echoRemaining ?? 1) - 1;
      if (echoRemaining > 0) {
        const remainingDungeonCards = newActive.filter(c => c != null);
        if (remainingDungeonCards.length > 0) {
          const totalEcho = (pending as any).echoRemaining ?? 1;
          const currentRound = totalEcho - echoRemaining + 1;
          const echoLabel = `（回响：第 ${currentRound}/${totalEcho} 次）`;
          patch.pendingMagicAction = {
            card: pending.card, effect: 'return-dungeon-bottom', step: 'dungeon-select',
            prompt: `选择一张地城卡牌，置于牌堆底。${echoLabel}`,
            echoRemaining: echoRemaining,
          } as PendingMagicAction;
          if (swapTrigger) {
            patch.heroSkillBanner = '流转之符：选择一张牌进行升级。';
          } else {
            patch.heroSkillBanner = `${card.name} 已置于牌堆底。继续选择下一张。${echoLabel}`;
          }
          return applyPatch(state, patch, sideEffects, enqueuedActions);
        }
        sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: '回响：地城中没有更多卡牌可选。' } });
      }
      const banner = `${card.name} 已置于牌堆底。`;
      if (swapTrigger) {
        patch.heroSkillBanner = '流转之符：选择一张牌进行升级。';
      }
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, banner);
    }

    case 'flip-back-active': {
      // 血誓回卷：将选中的「已翻转」卡（带 _flipBackCard）翻回原始形态。
      // 复用 card:flippedInCell 动画 + 直接以保存的 _flipBackCard 替换该格。
      const idx = activeCards.findIndex(c => c?.id === card.id);
      if (idx === -1) {
        patch.heroSkillBanner = '请选择当前行的卡牌。';
        return applyPatch(state, patch, sideEffects);
      }
      if (!card._flipBackCard || card.flipTarget) {
        patch.heroSkillBanner = '该卡牌不是已翻转状态，无法逆转。';
        return applyPatch(state, patch, sideEffects);
      }
      const original = card._flipBackCard as GameCardData;
      const restored: GameCardData = { ...original };
      const newActive = [...activeCards] as typeof activeCards;
      newActive[idx] = restored;
      patch.activeCards = newActive as any;
      sideEffects.push({
        event: 'card:flippedInCell',
        payload: { cellIndex: idx, fromCard: card, toCard: restored, message: `${card.name} → ${restored.name}` },
      });
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `血誓回卷：${card.name} 翻回 ${restored.name}。` } });
      // Back-flip doesn't go through APPLY_CARD_FLIP, so we must fire the 7
      // flip-counter consumers (flip-gold / 翻印之符 / 翻覆震慑 / 熔铸耐久 /
      // 翻血之符 / 弧能之符 / 生长之盾) ourselves — same as 乾坤一翻 active-row
      // back-flip in this file's `case 'flip-active-card'` and starterActiveRowFlip
      // resolver in card-schema/definitions/magic.ts.
      applyFlipCounters(state, patch, sideEffects, enqueuedActions);
      return applyFinalizeMagic(
        state, patch, sideEffects, enqueuedActions, pending.card,
        `血誓回卷：${card.name} → ${restored.name}！`,
      );
    }

    case 'deck-top-swap-gold': {
      const idx = activeCards.findIndex(c => c?.id === card.id);
      if (idx === -1) {
        patch.heroSkillBanner = '请选择当前行的卡牌。';
        return applyPatch(state, patch, sideEffects);
      }
      const deck = state.remainingDeck as GameCardData[];
      if (deck.length === 0) {
        // 「抽 1 张牌」无论是否成功交换都触发；mid-echo 命中此分支时本轮仍补 1 张。
        enqueuedActions.push({ type: 'DRAW_CARDS', count: 1, source: 'backpack' });
        return applyFinalizeMagic(
          state, patch, sideEffects, enqueuedActions, pending.card,
          `${pending.card.name}：牌堆已空，无法交换。从背包抽 1 张牌。`,
        );
      }
      const deckTop = deck[0];
      const turnCount = (state as any).turnCount ?? 0;
      const ragedDeckTop = applyMonsterRage(deckTop, turnCount);

      const newActive = [...activeCards] as typeof activeCards;
      newActive[idx] = ragedDeckTop;
      patch.activeCards = newActive as any;
      const newDeck = [sanitizeCardMetadata(card), ...deck.slice(1)];
      patch.remainingDeck = newDeck as any;
      sideEffects.push({
        event: 'hero:fateSwapFlight',
        payload: { activeSlotIdx: idx, oldCard: card, newCard: ragedDeckTop },
      });

      const sameCategory = getCardPlayCategory(card) === getCardPlayCategory(ragedDeckTop);
      // 同类型奖励：L0 +10，L1 +15。不同类型固定 -1，不随升级变化。
      // 增幅：每层 +1 金币，**仅作用于「同类型奖励」分支**——「不同类型」-1 是惩罚，
      // 不算「可获得的金币」，按设计保持不变（与 isGoldGrantMagic /
      // computeDamageMagicDisplayPure 同口径）。
      const dtsgUpgLvl = pending.card.upgradeLevel ?? 0;
      const sameCategoryBonuses = [10, 15];
      const dtsgAmp = pending.card.amplifyBonus ?? 0;
      const sameCategoryBonus = (sameCategoryBonuses[dtsgUpgLvl] ?? 15) + dtsgAmp;
      const goldDelta = sameCategory ? sameCategoryBonus : -1;
      enqueuedActions.push({ type: 'MODIFY_GOLD', delta: goldDelta, source: 'deck-top-swap-gold' });
      // 「抽 1 张牌」每次成功结算都触发；echo 通过 maybeRepromptEcho 多轮迭代，
      // 这里 push 1 张即可，回响×N 自然累积成 N 张。
      enqueuedActions.push({ type: 'DRAW_CARDS', count: 1, source: 'backpack' });
      const goldText = sameCategory
        ? `同类型 → +${goldDelta} 金币`
        : `不同类型 → ${goldDelta} 金币`;
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'magic', message: `${pending.card.name}：${card.name} ↔ ${ragedDeckTop.name}（牌堆顶）。${goldText}。从背包抽 1 张牌。` },
      });

      const swapTrigger = checkSwapUpgrade(state, patch, sideEffects, enqueuedActions);
      const echoRemainingDTSG = ((pending as any).echoRemaining ?? 1) - 1;
      if (echoRemainingDTSG > 0) {
        const totalEcho = (pending as any).echoRemaining ?? 1;
        const currentRound = totalEcho - echoRemainingDTSG + 1;
        const echoLabel = `（回响：第 ${currentRound}/${totalEcho} 次）`;
        const next: PendingMagicAction = {
          card: pending.card,
          effect: 'deck-top-swap-gold',
          step: 'dungeon-select',
          prompt: `${pending.card.name}：选择当前行一张牌，与牌堆顶交换。${echoLabel}`,
          echoRemaining: echoRemainingDTSG,
        } as PendingMagicAction;
        const reprompt = maybeRepromptEcho(
          state, patch, sideEffects, enqueuedActions,
          { card: pending.card, echoRemaining: (pending as any).echoRemaining },
          next,
          `${card.name} ↔ ${ragedDeckTop.name}！${echoLabel}`,
        );
        if (reprompt) return reprompt;
      }
      const banner = `${card.name} ↔ ${ragedDeckTop.name}（牌堆顶）！${goldText}！抽 1 张牌。`;
      if (swapTrigger) {
        patch.heroSkillBanner = '流转之符：选择一张牌进行升级。';
      }
      return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, banner);
    }

    case 'flip-active-card': {
      // 乾坤一翻：三种翻转路径：
      //   (a) active-row 正向 (flipTarget) → APPLY_CARD_FLIP（reduceApplyCardFlip 内已调 applyFlipCounters）
      //   (b) active-row 反向 (_flipBackCard) → 原地恢复 + flippedInCell 动画 + 手动调 applyFlipCounters
      //   (c) preview-row 卡背 → 设置 previewRevealedEarly[idx]=true + 自定义事件 + 手动调 applyFlipCounters
      // (b)(c) 不走 APPLY_CARD_FLIP（避免 flipTarget 不存在的反向翻转误触发卡牌转化），
      // 必须在这里直接调用 applyFlipCounters 让翻转计数器（7 个消费方）依然命中。
      const activeIdx = activeCards.findIndex(c => c?.id === card.id);
      const previewCardsArr = state.previewCards as (GameCardData | null)[];
      const previewIdx = previewCardsArr.findIndex(c => c?.id === card.id);
      const revealed = state.previewRevealedEarly ?? [];

      if (activeIdx === -1 && previewIdx === -1) {
        patch.heroSkillBanner = '请选择当前行或预览行的卡牌。';
        return applyPatch(state, patch, sideEffects);
      }
      if (activeIdx !== -1 && !card.flipTarget && !card._flipBackCard) {
        patch.heroSkillBanner = '该卡牌没有可翻转的另一面。';
        return applyPatch(state, patch, sideEffects);
      }
      if (previewIdx !== -1 && revealed[previewIdx]) {
        patch.heroSkillBanner = '该预览行卡牌已被翻成正面，不能再翻回。';
        return applyPatch(state, patch, sideEffects);
      }

      const echoRemainingFAC = ((pending as any).echoRemaining ?? 1) - 1;
      // 升级 1：每翻一张 → 抽 1 张牌（在 reprompt 之前结算，所以每个 echo 回合都
      // 会抽一次；最后一次 reprompt 没目标时不会再调本函数 → 不会重复抽）。
      const buildRepromptOrFinalize = (resultBanner: string) => {
        let drawSuffix = '';
        if ((pending.card.upgradeLevel ?? 0) >= 1) {
          const current = { ...state, ...patch } as GameState;
          const { card: drawn, patch: drawPatch } = drawFromBackpackToHandPure(current);
          if (drawn) {
            Object.assign(patch, drawPatch);
            sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: drawn.id, source: 'backpack' } });
            applyMirrorCopySummonProgress(state, patch, sideEffects, enqueuedActions, 1);
            drawSuffix = ` 抽到「${drawn.name}」。`;
          }
        }
        const finalBanner = drawSuffix ? `${resultBanner}${drawSuffix}` : resultBanner;
        if (echoRemainingFAC > 0) {
          // After this flip, look for ANY other flippable card still in either row
          // (active-row flippable, or preview-row still face-down). Wraiths are
          // excluded from preview eligibility — they render face-up by design
          // (see PreviewRow.tsx `isWraithRevealed`) and the initial-target
          // enumeration in `magic.ts:starterActiveRowFlip` already filters them
          // out; the echo-reprompt path must agree.
          const updatedActive = (patch.activeCards ?? activeCards) as (GameCardData | null)[];
          const updatedPreview = (patch.previewCards ?? state.previewCards) as (GameCardData | null)[];
          const updatedRevealed = (patch.previewRevealedEarly ?? revealed);
          const anyOtherActive = updatedActive.some(c => c && c.id !== card.id && (c.flipTarget || c._flipBackCard));
          const anyOtherPreview = updatedPreview.some((c, i) => {
            if (!c || c.id === card.id || updatedRevealed[i]) return false;
            if (c.type === 'monster' && c.monsterType === 'Wraith') return false;
            return true;
          });
          if (anyOtherActive || anyOtherPreview) {
            const totalEcho = (pending as any).echoRemaining ?? 1;
            const currentRound = totalEcho - echoRemainingFAC + 1;
            const echoLabel = `（回响：第 ${currentRound}/${totalEcho} 次）`;
            const next: PendingMagicAction = {
              card: pending.card,
              effect: 'flip-active-card',
              step: 'dungeon-select',
              prompt: `选择当前行一张可翻转/已翻转的牌，或预览行一张未翻面的卡背，将其翻转。${echoLabel}`,
              echoRemaining: echoRemainingFAC,
            } as PendingMagicAction;
            const reprompt = maybeRepromptEcho(
              state, patch, sideEffects, enqueuedActions,
              { card: pending.card, echoRemaining: (pending as any).echoRemaining },
              next,
              `${finalBanner} ${echoLabel}`,
            );
            if (reprompt) return reprompt;
          }
        }
        return applyFinalizeMagic(state, patch, sideEffects, enqueuedActions, pending.card, finalBanner);
      };

      // (a) Active-row forward flip — APPLY_CARD_FLIP runs reduceApplyCardFlip
      // which already calls applyFlipCounters internally. Do NOT call it here too.
      if (activeIdx !== -1 && card.flipTarget) {
        enqueuedActions.push({ type: 'APPLY_CARD_FLIP', card, cellIndex: activeIdx });
        sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `乾坤一翻：${card.name} → ${card.flipTarget.toCard.name}。` } });
        return buildRepromptOrFinalize(`乾坤一翻：${card.name} → ${card.flipTarget.toCard.name}！`);
      }
      // (b) Active-row back flip — restore _flipBackCard + animation + manually fire counters.
      if (activeIdx !== -1) {
        const original = card._flipBackCard as GameCardData;
        const restored: GameCardData = { ...original };
        const newActive = [...activeCards] as typeof activeCards;
        newActive[activeIdx] = restored;
        patch.activeCards = newActive as any;
        sideEffects.push({
          event: 'card:flippedInCell',
          payload: { cellIndex: activeIdx, fromCard: card, toCard: restored, message: `${card.name} → ${restored.name}` },
        });
        sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `乾坤一翻：${card.name} 翻回 ${restored.name}。` } });
        applyFlipCounters(state, patch, sideEffects, enqueuedActions);
        return buildRepromptOrFinalize(`乾坤一翻：${card.name} → ${restored.name}！`);
      }
      // (c) Preview-row reveal — flip the visibility flag, fire counters, emit animation hint.
      const nextRevealed = [...revealed];
      nextRevealed[previewIdx] = true;
      patch.previewRevealedEarly = nextRevealed;
      sideEffects.push({
        event: 'card:previewRevealedEarly',
        payload: { cellIndex: previewIdx, card },
      });
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `乾坤一翻：揭示了预览行的 ${card.name}。` } });
      applyFlipCounters(state, patch, sideEffects, enqueuedActions);
      return buildRepromptOrFinalize(`乾坤一翻：揭示了预览行的 ${card.name}！`);
    }

    default:
      return noChange(state);
  }
}

// ---------------------------------------------------------------------------
// RESOLVE_DICE for hero flows (stun-strike, flank-stun, repair-enrage)
// ---------------------------------------------------------------------------

function reduceDiceForHero(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_DICE' }>,
): ReduceResult | null {
  const ctx = action.context as Record<string, any> | undefined;
  if (!ctx) return null;

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  if (ctx.flowId === 'hero-stun') {
    const { monsterId, monsterName, currentHit, totalHits, stunPct } = ctx;
    // Optional `sourceLabel` lets non-雷震击 callers (e.g. 雷涌一击 / 'stun-cap-strike')
    // surface their own card name in the stun log without forking the whole flow.
    // Existing callers that don't pass it keep the original text (向后兼容).
    const stunLabel = (typeof ctx.sourceLabel === 'string' && ctx.sourceLabel.length > 0)
      ? ctx.sourceLabel
      : '雷震';
    if (action.outcomeId === 'stun') {
      enqueuedActions.push({ type: 'UPDATE_MONSTER_CARD', monsterId, patch: { isStunned: true } });
      sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monsterName} 被${stunLabel}击晕了！` } });
      const ae = computeAmuletEffectsForState(state) ?? createEmptyAmuletEffects();
      if (ae.stunRecycleToHandCount > 0) {
        const bag = state.permanentMagicRecycleBag as GameCardData[];
        if (bag.length > 0) {
          const count = Math.min(2 * ae.stunRecycleToHandCount, bag.length);
          let remaining = [...bag];
          const pickedCards: GameCardData[] = [];
          let rng = state.rng;
          for (let i = 0; i < count; i++) {
            const [idx, rng2] = nextInt(rng, 0, remaining.length - 1);
            rng = rng2;
            pickedCards.push(remaining[idx]);
            remaining.splice(idx, 1);
          }
          patch.rng = rng;
          patch.permanentMagicRecycleBag = remaining as any;
          enqueuedActions.push({ type: 'ADD_CARDS_TO_HAND', cards: pickedCards });
          sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `击晕回收：从回收袋取回「${pickedCards.map(c => c.name).join('」「')}」到手牌` } });
        }
      }
      if (ae.stunUpgradeCapCount > 0) {
        const bump = ae.stunUpgradeCapBonus;
        patch.stunCap = Math.min(100, (state.stunCap ?? 0) + bump);
        sideEffects.push({ event: 'log:entry', payload: { type: 'amulet', message: `震慑之符：击晕成功，击晕上限 +${bump}%（当前 ${patch.stunCap}%）` } });
      }
      maybeEnqueueStunGold(state, enqueuedActions, sideEffects, monsterId, monsterName);
    } else if (currentHit < totalHits) {
      const threshold = Math.round((stunPct / 100) * 20);
      const [hsRoll, hsRng] = nextInt(patch.rng ?? state.rng, 1, 20);
      patch.rng = hsRng;
      sideEffects.push({ event: 'ui:requestDice', payload: {
        title: monsterName,
        subtitle: `雷震击晕判定 第${currentHit + 1}击（${stunPct}%）`,
        entries: [
          { id: 'stun', range: [1, threshold] as [number, number], label: '击晕成功！', effect: 'none' },
          { id: 'miss', range: [threshold + 1, 20] as [number, number], label: '未击晕', effect: 'none' },
        ],
        context: { ...ctx, currentHit: currentHit + 1 },
        predeterminedRoll: hsRoll,
      } });
      tickStunAttemptDiscoverProgress(state, patch, sideEffects);
    }
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  if (ctx.flowId === 'flank-stun') {
    const { monsterId, monsterName } = ctx;
    if (action.outcomeId === 'stun') {
      enqueuedActions.push({ type: 'UPDATE_MONSTER_CARD', monsterId, patch: { isStunned: true } });
      sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monsterName} 被侧击击晕了！` } });
      const ae = computeAmuletEffectsForState(state) ?? createEmptyAmuletEffects();
      if (ae.stunUpgradeCapCount > 0) {
        const bump = ae.stunUpgradeCapBonus;
        patch.stunCap = Math.min(100, (state.stunCap ?? 0) + bump);
        sideEffects.push({ event: 'log:entry', payload: { type: 'amulet', message: `震慑之符：击晕成功，击晕上限 +${bump}%（当前 ${patch.stunCap}%）` } });
      }
      maybeEnqueueStunGold(state, enqueuedActions, sideEffects, monsterId, monsterName);
    }
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  return null;
}

// ---------------------------------------------------------------------------
// RESOLVE_PUSH_TO_BACKPACK_TOP — 整顿背囊 multi-select confirmation
// ---------------------------------------------------------------------------

/**
 * Apply the player's final selection for 整顿背囊 (`reorganize-backpack`).
 *
 * For each selection, locate and remove the card from its source location:
 *   - hand:      remove from `state.handCards` by card id
 *   - amulet:    remove from `state.amuletSlots` by card id
 *   - equipment: clear `equipmentSlot1` / `equipmentSlot2` (no break flow,
 *                no last-words, no salvage — per design)
 *
 * Then append the collected cards to `backpackItems` in selection order so
 * the last selected card lands at the array's tail (the conceptual "top").
 *
 * Selection rules:
 *   - Caps at `pending.maxSelections` (additional entries are ignored).
 *   - Skips the played card itself (defense in depth — the UI is also
 *     responsible for filtering it out, but the reducer must not let it slip
 *     through and end up bag-stuffed).
 *   - Skips duplicate selections of the same id+source.
 *   - Silently skips selections whose source/id no longer exist.
 *   - 0 selections is allowed (the player can confirm with an empty array
 *     and just keep the +1 capacity bonus).
 */
function reducePushToBackpackTop(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_PUSH_TO_BACKPACK_TOP' }>,
): ReduceResult {
  const pending = state.pendingMagicAction as PendingMagicAction | null;
  if (!pending || pending.effect !== 'reorganize-backpack' || pending.step !== 'multi-select') {
    return noChange(state);
  }

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  const playedCardId = pending.card.id;
  const seen = new Set<string>();

  // Working copies — only mutated if a corresponding selection actually resolves.
  let nextHand = state.handCards;
  let nextAmulets = state.amuletSlots;
  let nextSlot1 = state.equipmentSlot1;
  let nextSlot2 = state.equipmentSlot2;
  const cardsToPush: GameCardData[] = [];

  const cap = Math.max(0, pending.maxSelections);
  const requested = Array.isArray(action.selections) ? action.selections : [];

  for (const sel of requested) {
    if (cardsToPush.length >= cap) break;
    if (!sel || typeof sel.id !== 'string') continue;
    const key = `${sel.source}:${sel.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (sel.source === 'hand') {
      if (sel.id === playedCardId) continue;
      const card = nextHand.find(c => c.id === sel.id);
      if (!card) continue;
      cardsToPush.push(sanitizeCardMetadata(card));
      nextHand = nextHand.filter(c => c.id !== sel.id);
    } else if (sel.source === 'amulet') {
      const card = (nextAmulets as GameCardData[]).find(c => c?.id === sel.id);
      if (!card) continue;
      // Strip `fromSlot: 'amulet'` so it can be re-equipped to amulet/other slots later.
      cardsToPush.push(sanitizeCardMetadata(card));
      nextAmulets = (nextAmulets as GameCardData[]).filter(c => c?.id !== sel.id) as typeof state.amuletSlots;
    } else if (sel.source === 'equipment') {
      // Strip `fromSlot: 'equipmentSlotN'` so the card can be re-equipped after
      // landing in the backpack. Without this, GameBoard.handleCardToSlot's
      // `isCardFromEquipmentSlot(card)` guard rejects the drop and the slot
      // appears permanently un-equippable for that card.
      if (sel.id === 'equipmentSlot1' && nextSlot1) {
        cardsToPush.push(sanitizeCardMetadata(nextSlot1 as GameCardData));
        nextSlot1 = null;
      } else if (sel.id === 'equipmentSlot2' && nextSlot2) {
        cardsToPush.push(sanitizeCardMetadata(nextSlot2 as GameCardData));
        nextSlot2 = null;
      }
    }
  }

  if (nextHand !== state.handCards) patch.handCards = nextHand;
  if (nextAmulets !== state.amuletSlots) patch.amuletSlots = nextAmulets;
  if (nextSlot1 !== state.equipmentSlot1) patch.equipmentSlot1 = nextSlot1 as EquipmentItem | null;
  if (nextSlot2 !== state.equipmentSlot2) patch.equipmentSlot2 = nextSlot2 as EquipmentItem | null;
  if (cardsToPush.length > 0) {
    patch.backpackItems = [...state.backpackItems, ...cardsToPush];
  }

  if (cardsToPush.length > 0) {
    const names = cardsToPush.map(c => c.name).join('」、「');
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'magic', message: `整顿背囊：将「${names}」放回背包底部（共 ${cardsToPush.length} 张）。` },
    });
  } else {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'magic', message: '整顿背囊：未选择任何牌放回背包。' },
    });
  }

  return applyFinalizeMagic(
    state,
    patch,
    sideEffects,
    enqueuedActions,
    pending.card,
    cardsToPush.length > 0
      ? `整顿背囊：放回 ${cardsToPush.length} 张牌到背包顶部。`
      : '整顿背囊：背包上限 +2（未选择任何牌）。',
  );
}

