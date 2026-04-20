/**
 * Potion Effects — full potion card resolution logic for the game reducer.
 *
 * Two entry points:
 *   - resolveAllPotionEffects: called when a potion card is played (RESOLVE_POTION)
 *   - resolvePendingPotion: called when the player responds to an interactive
 *     potion prompt (RESOLVE_PENDING_POTION)
 *
 * All effects are pure: they return a ReduceResult with state patches,
 * side effects, and enqueued follow-up actions.
 */

import type { GameState, EternalRelic, EternalRelicId } from '../types';
import type { GameAction } from '../actions';
import type { ReduceResult, SideEffect } from '../reducer';
import { applyPatch, noChange } from '../reducer';
import type { GameCardData } from '@/components/GameCard';
import type { EquipmentSlotId, EquipmentRepairTarget } from '@/components/game-board/types';
import { flattenActiveRowSlots, isDamageableTarget, sanitizeCardMetadata, formatRepairTargetLabel } from '../helpers';
import { drawFromBackpackToHandPure, drawMultipleFromBackpack, addCardToBackpackPure } from '../cards';
import { nextInt, pickRandom, shuffle as rngShuffle, nextId } from '../rng';
import { INITIAL_HP, HAND_LIMIT, BASE_BACKPACK_CAPACITY } from '../constants';
import { computeAmuletEffects } from '../equipment';
import { hasEternalRelic, getEternalRelic } from '@/lib/eternalRelics';

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function log(sideEffects: SideEffect[], type: string, message: string) {
  sideEffects.push({ event: 'log:entry', payload: { type, message } });
}

function banner(sideEffects: SideEffect[], text: string) {
  sideEffects.push({ event: 'ui:banner', payload: { text } });
}

// ---------------------------------------------------------------------------
// resolveAllPotionEffects — main entry point for RESOLVE_POTION
// ---------------------------------------------------------------------------

export function resolveAllPotionEffects(
  state: GameState,
  card: GameCardData,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};
  const enqueuedActions: GameAction[] = [];
  const effect = card.potionEffect as string | undefined;

  // =========================================================================
  // Non-interactive potions
  // =========================================================================

  // --- Base / healing ---
  if (!effect || effect === 'heal' || effect === 'heal-5' || effect === 'heal-14') {
    const amount = effect === 'heal-14' ? 14 : effect === 'heal-5' ? 5 : card.value ?? 0;
    enqueuedActions.push({ type: 'HEAL', amount, source: card.name });
    log(sideEffects, 'potion', `使用 ${card.name}：恢复 ${amount} 点生命`);
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Shield ---
  if (effect === 'shield') {
    patch.tempShield = (state.tempShield ?? 0) + card.value;
    log(sideEffects, 'potion', `使用 ${card.name}：获得 ${card.value} 点临时护盾`);
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Draw ---
  if (effect === 'draw') {
    enqueuedActions.push({ type: 'DRAW_FROM_BACKPACK', count: card.value });
    log(sideEffects, 'potion', `使用 ${card.name}：抽取 ${card.value} 张牌`);
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Permanent spell damage +1 ---
  if (effect === 'perm-spell-damage') {
    patch.permanentSpellDamageBonus = (state.permanentSpellDamageBonus ?? 0) + 1;
    log(sideEffects, 'potion', '药水效果：永久法术伤害 +1');
    banner(sideEffects, '永久法术伤害 +1。');
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Permanent spell damage +2 ---
  if (effect === 'perm-spell-damage+2') {
    patch.permanentSpellDamageBonus = (state.permanentSpellDamageBonus ?? 0) + 2;
    log(sideEffects, 'potion', '药水效果：永久法术伤害 +2');
    banner(sideEffects, '永久法术伤害 +2。');
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Permanent spell damage +2, max HP -5 ---
  if (effect === 'perm-spell-damage-2') {
    patch.permanentSpellDamageBonus = (state.permanentSpellDamageBonus ?? 0) + 2;
    const newMaxHpBonus = (state.permanentMaxHpBonus ?? 0) - 5;
    patch.permanentMaxHpBonus = newMaxHpBonus;
    const aura = computeAmuletEffects(state.amuletSlots as GameCardData[]);
    const maxHp = INITIAL_HP + newMaxHpBonus + (aura.aura.maxHp ?? 0);
    patch.hp = Math.min(maxHp, state.hp);
    log(sideEffects, 'potion', '药水效果：永久法术伤害 +2；最大生命值 -5');
    banner(sideEffects, '永久法术伤害 +2；最大生命值 -5。');
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Backpack capacity +1 ---
  if (effect === 'perm-backpack-size') {
    patch.backpackCapacityModifier = (state.backpackCapacityModifier ?? 0) + 1;
    log(sideEffects, 'potion', '药水效果：背包容量永久 +1');
    banner(sideEffects, '背包容量永久 +1。');
    enqueuedActions.push({ type: 'ENFORCE_BACKPACK_CAPACITY' });
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Backpack capacity +2 ---
  if (effect === 'perm-backpack-size+2') {
    patch.backpackCapacityModifier = (state.backpackCapacityModifier ?? 0) + 2;
    log(sideEffects, 'potion', '药水效果：背包上限 +2');
    banner(sideEffects, '背包上限 +2。');
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Backpack capacity +3 ---
  if (effect === 'perm-backpack-size+3') {
    patch.backpackCapacityModifier = (state.backpackCapacityModifier ?? 0) + 3;
    log(sideEffects, 'potion', '药水效果：背包上限 +3');
    banner(sideEffects, '背包上限 +3。');
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Backpack capacity +5 ---
  if (effect === 'perm-backpack-size+5') {
    patch.backpackCapacityModifier = (state.backpackCapacityModifier ?? 0) + 5;
    log(sideEffects, 'potion', '药水效果：背包上限 +5');
    banner(sideEffects, '背包上限 +5。');
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Spell lifesteal +1 ---
  if (effect === 'perm-spell-lifesteal+1') {
    patch.permanentSpellLifesteal = (state.permanentSpellLifesteal ?? 0) + 1;
    log(sideEffects, 'potion', '药水效果：永久超杀吸血 +1');
    banner(sideEffects, '永久超杀吸血 +1。');
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Spell lifesteal +2 ---
  if (effect === 'perm-spell-lifesteal+2') {
    patch.permanentSpellLifesteal = (state.permanentSpellLifesteal ?? 0) + 2;
    log(sideEffects, 'potion', '药水效果：永久超杀吸血 +2');
    banner(sideEffects, '永久超杀吸血 +2。');
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Hand limit +1 (perm-hand-limit+1 / perm-hand-limit+2 both give +1) ---
  if (effect === 'perm-hand-limit+1' || effect === 'perm-hand-limit+2') {
    patch.handLimitBonus = (state.handLimitBonus ?? 0) + 1;
    log(sideEffects, 'potion', '药水效果：手牌上限 +1');
    banner(sideEffects, '手牌上限 +1。');
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Waterfall deal bonus +1 ---
  if (effect === 'perm-waterfall-deal+1') {
    patch.waterfallDealBonus = (state.waterfallDealBonus ?? 0) + 1;
    log(sideEffects, 'potion', '药水效果：永久瀑流发牌数 +1');
    banner(sideEffects, '永久瀑流发牌数 +1！多出的牌将堆叠在非怪物格。');
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Stun cap +10 ---
  if (effect === 'perm-stun-cap+10') {
    patch.stunCap = Math.min(100, (state.stunCap ?? 0) + 10);
    log(sideEffects, 'potion', '眩晕药剂：击晕上限 +10%');
    banner(sideEffects, '击晕上限 +10%！');
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Boost both slots: damage+1, shield+1 each ---
  if (effect === 'boost-both-slots') {
    const bonuses = { ...state.equipmentSlotBonuses };
    bonuses.equipmentSlot1 = { damage: bonuses.equipmentSlot1.damage + 1, shield: bonuses.equipmentSlot1.shield + 1 };
    bonuses.equipmentSlot2 = { damage: bonuses.equipmentSlot2.damage + 1, shield: bonuses.equipmentSlot2.shield + 1 };
    patch.equipmentSlotBonuses = bonuses;
    log(sideEffects, 'potion', '双锋淬液：左右装备栏永久伤害+1，护甲+1');
    banner(sideEffects, '左右装备栏永久伤害+1，护甲+1！');
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Left slot durability max +1/+2 ---
  if (effect === 'left-slot-durability-max+1' || effect === 'left-slot-durability-max+2') {
    const amount = effect === 'left-slot-durability-max+2' ? 2 : 1;
    const leftSlot = state.equipmentSlot1;
    if (!leftSlot || leftSlot.durability == null) {
      banner(sideEffects, '左装备栏没有装备，药剂失效。');
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    const maxDur = leftSlot.maxDurability ?? leftSlot.durability ?? 0;
    (patch as any).equipmentSlot1 = { ...leftSlot, maxDurability: maxDur + amount };
    log(sideEffects, 'potion', `淬炼药剂：${leftSlot.name} 耐久上限 +${amount}（${maxDur} → ${maxDur + amount}）`);
    banner(sideEffects, `${leftSlot.name} 耐久上限 +${amount}！`);
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Right slot durability max +1/+2 ---
  if (effect === 'right-slot-durability-max+1' || effect === 'right-slot-durability-max+2') {
    const amount = effect === 'right-slot-durability-max+2' ? 2 : 1;
    const rightSlot = state.equipmentSlot2;
    if (!rightSlot || rightSlot.durability == null) {
      banner(sideEffects, '右装备栏没有装备，药剂失效。');
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    const maxDur = rightSlot.maxDurability ?? rightSlot.durability ?? 0;
    (patch as any).equipmentSlot2 = { ...rightSlot, maxDurability: maxDur + amount };
    log(sideEffects, 'potion', `淬炼药剂（右）：${rightSlot.name} 耐久上限 +${amount}（${maxDur} → ${maxDur + amount}）`);
    banner(sideEffects, `${rightSlot.name} 耐久上限 +${amount}！`);
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Swap slot damage/shield bonuses randomly ---
  if (effect === 'swap-slot-damage-shield') {
    const slotIds: ('equipmentSlot1' | 'equipmentSlot2')[] = ['equipmentSlot1', 'equipmentSlot2'];
    const [slotIdx, nextRng] = nextInt(state.rng, 0, 1);
    const chosenSlot = slotIds[slotIdx];
    patch.rng = nextRng;
    const slotLabel = chosenSlot === 'equipmentSlot1' ? '左' : '右';
    const bonuses = { ...state.equipmentSlotBonuses };
    const curDamage = bonuses[chosenSlot].damage;
    const curShield = bonuses[chosenSlot].shield;
    bonuses[chosenSlot] = { damage: curShield, shield: curDamage };
    patch.equipmentSlotBonuses = bonuses;
    log(sideEffects, 'potion', `乾坤颠倒：${slotLabel}装备栏永久伤害(${curDamage})与护甲(${curShield})互换！`);
    banner(sideEffects, `${slotLabel}装备栏：伤害 ${curDamage}→${curShield}，护甲 ${curShield}→${curDamage}！`);
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Spell lifesteal +1 and max HP +6 ---
  if (effect === 'spell-lifesteal+1-maxhp+6') {
    patch.permanentSpellLifesteal = (state.permanentSpellLifesteal ?? 0) + 1;
    patch.permanentMaxHpBonus = (state.permanentMaxHpBonus ?? 0) + 6;
    log(sideEffects, 'potion', '暗夜吸血药：超杀吸血 +1，生命上限 +6！');
    banner(sideEffects, '超杀吸血 +1，生命上限 +6！');
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Hand limit +1 (standalone) ---
  if (effect === 'hand-limit+1') {
    patch.handLimitBonus = (state.handLimitBonus ?? 0) + 1;
    log(sideEffects, 'potion', '扩容药剂：手牌上限永久 +1');
    banner(sideEffects, '手牌上限 +1！');
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Draw backpack 4: +1 backpack, +1 hand limit, draw up to 4+1 ---
  if (effect === 'draw-backpack-4') {
    patch.backpackCapacityModifier = (state.backpackCapacityModifier ?? 0) + 1;
    patch.handLimitBonus = (state.handLimitBonus ?? 0) + 1;
    const newHandLimit = HAND_LIMIT + (state.handLimitBonus ?? 0) + 1;
    const currentHandSize = state.handCards.filter(c => c.id !== card.id).length;
    const maxDraws = Math.min(5, newHandLimit - currentHandSize);
    if (maxDraws > 0) {
      const { cards: drawn, patch: drawPatch } = drawMultipleFromBackpack(
        { ...state, ...patch } as GameState,
        maxDraws,
      );
      if (drawn.length > 0) {
        Object.assign(patch, drawPatch);
        for (const d of drawn) {
          sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: d.id, source: 'backpack' } });
        }
        const parts: string[] = [];
        parts.push(`从背包抽出${drawn.length}张牌`);
        parts.push('背包上限 +1', '手牌上限 +1');
        log(sideEffects, 'potion', `药水效果：${parts.join('，')}`);
        banner(sideEffects, parts.join('，') + '。');
      } else {
        log(sideEffects, 'potion', '药水效果：背包上限 +1，手牌上限 +1');
        banner(sideEffects, '背包上限 +1，手牌上限 +1。');
      }
    } else {
      log(sideEffects, 'potion', '药水效果：背包上限 +1，手牌上限 +1');
      banner(sideEffects, '背包上限 +1，手牌上限 +1。');
    }
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Permanent persuade-consecutive (eternal relic) ---
  if (effect === 'perm-persuade-consecutive') {
    if (!hasEternalRelic(state.eternalRelics ?? [], 'chain-persuade')) {
      const relic = getEternalRelic('chain-persuade');
      patch.eternalRelics = [...(state.eternalRelics ?? []), relic];
      log(sideEffects, 'potion', '获得永恒护符·连劝秘药：连续劝降同一个怪物时，每次累计成功率 +15%！');
      banner(sideEffects, '获得永恒护符·连劝秘药！连续劝降同一怪物，每次累计概率 +15%。');
    } else {
      log(sideEffects, 'potion', '永恒护符·连劝秘药：效果已存在，无法叠加。');
      banner(sideEffects, '效果已存在，无法叠加。');
    }
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Permanent equip-empower (eternal relic) ---
  if (effect === 'perm-equip-empower') {
    if (!hasEternalRelic(state.eternalRelics ?? [], 'equip-empower')) {
      const relic = getEternalRelic('equip-empower');
      patch.eternalRelics = [...(state.eternalRelics ?? []), relic];
      log(sideEffects, 'potion', '获得永恒护符·铸锋药剂：装备上装备时，该装备栏获得 3 临时攻击和 3 临时护甲！');
      banner(sideEffects, '获得永恒护符·铸锋药剂！装备时获得 +3 临时攻击/+3 临时护甲。');
    } else {
      log(sideEffects, 'potion', '永恒护符·铸锋药剂：效果已存在，无法叠加。');
      banner(sideEffects, '效果已存在，无法叠加。');
    }
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Grant end-turn-draw (eternal relic) ---
  if (effect === 'grant-amulet-end-turn-draw') {
    if (hasEternalRelic(state.eternalRelics ?? [], 'end-turn-draw')) {
      log(sideEffects, 'potion', '回合汲取药：永恒护符效果已存在，无法叠加。');
      banner(sideEffects, '永恒护符效果已存在，无法叠加。');
    } else {
      const relic = getEternalRelic('end-turn-draw');
      patch.eternalRelics = [...(state.eternalRelics ?? []), relic];
      log(sideEffects, 'potion', '回合汲取药：获得永恒护符「回合汲取」！结束英雄回合时抽 1 张牌。');
      banner(sideEffects, '获得永恒护符「回合汲取」！结束英雄回合时抽 1 张牌。');
    }
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Discover class 3 ---
  if (effect === 'discover-class-3') {
    if (state.classDeck.length > 0) {
      enqueuedActions.push({ type: 'DRAW_CLASS_TO_BACKPACK', count: 3 });
      log(sideEffects, 'potion', '药水效果：从职业牌组获得最多 3 张牌');
    } else {
      log(sideEffects, 'potion', '药水效果：职业卡牌不可用');
      banner(sideEffects, '职业卡牌不可用。');
    }
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // =========================================================================
  // Interactive potions — set pendingPotionAction for player choice
  // =========================================================================

  // --- Permanent slot damage +1/+2 ---
  if (effect === 'perm-slot-damage+1' || effect === 'perm-slot-damage+2') {
    const amount = effect === 'perm-slot-damage+2' ? 2 : 1;
    patch.pendingPotionAction = {
      card,
      effect,
      step: 'slot-select',
      prompt: `选择一个装备栏，永久伤害 +${amount}。`,
    } as any;
    patch.heroSkillBanner = `选择一个装备栏，永久伤害 +${amount}。`;
    return applyPatch(state, patch, sideEffects);
  }

  // --- Permanent equipment durability max +1/+2 ---
  if (effect === 'perm-equipment-durability-max+1' || effect === 'perm-equipment-durability-max+2') {
    const amount = effect === 'perm-equipment-durability-max+2' ? 2 : 1;
    type SlotInfo = { id: 'equipmentSlot1' | 'equipmentSlot2'; item: GameCardData };
    const slotsWithDurability: SlotInfo[] = [];
    if (state.equipmentSlot1?.durability != null) {
      slotsWithDurability.push({ id: 'equipmentSlot1', item: state.equipmentSlot1 as GameCardData });
    }
    if (state.equipmentSlot2?.durability != null) {
      slotsWithDurability.push({ id: 'equipmentSlot2', item: state.equipmentSlot2 as GameCardData });
    }

    if (slotsWithDurability.length === 0) {
      banner(sideEffects, '没有可增加耐久的装备。');
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    if (slotsWithDurability.length === 1) {
      const slot = slotsWithDurability[0];
      const item = slot.item;
      const maxDur = item.maxDurability ?? item.durability ?? 0;
      (patch as any)[slot.id] = { ...item, maxDurability: maxDur + amount };
      log(sideEffects, 'potion', `耐久补剂：${item.name} 耐久上限 +${amount}（${maxDur} → ${maxDur + amount}）`);
      banner(sideEffects, `${item.name} 耐久上限 +${amount}！`);
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    patch.pendingPotionAction = {
      card,
      effect,
      step: 'slot-select',
      prompt: `选择一个装备，耐久上限 +${amount}。`,
    } as any;
    patch.heroSkillBanner = `选择一个装备，耐久上限 +${amount}。`;
    return applyPatch(state, patch, sideEffects);
  }

  // --- Permanent slot capacity +1 ---
  if (effect === 'perm-slot-capacity+1') {
    patch.pendingPotionAction = {
      card,
      effect: 'perm-slot-capacity+1',
      step: 'slot-select',
      prompt: '选择一个装备栏，可装备上限 +1。',
    } as any;
    patch.heroSkillBanner = '选择一个装备栏，可装备上限 +1。';
    return applyPatch(state, patch, sideEffects);
  }

  // --- Repair weapon 2/3 ---
  if (effect === 'repair-weapon-2' || effect === 'repair-weapon-3') {
    const repairAmount = effect === 'repair-weapon-3' ? 3 : 2;
    const allowedTypes: EquipmentRepairTarget[] = ['weapon', 'shield', 'monster'];
    const targetLabel = formatRepairTargetLabel(allowedTypes);

    const matchingSlots = getEquipmentSlotsMatching(state, allowedTypes);
    if (matchingSlots.length === 0) {
      banner(sideEffects, `没有装备${targetLabel}，药剂失效。`);
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    const repairableSlots = matchingSlots.filter(slot => {
      const item = slot.item;
      const maxDurability = item.maxDurability ?? item.durability ?? 0;
      const currentDurability = item.durability ?? maxDurability;
      return maxDurability > 0 && currentDurability < maxDurability;
    });

    if (repairableSlots.length === 0) {
      banner(sideEffects, `所有${targetLabel}已满耐久。`);
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    if (repairableSlots.length === 1) {
      const slot = repairableSlots[0];
      const result = applyRepairToSlot(state, slot.id, repairAmount, sideEffects);
      Object.assign(patch, result);
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    const prompt = `选择一个${targetLabel}恢复${repairAmount}点耐久。`;
    patch.pendingPotionAction = {
      card,
      effect: 'repair-equipment' as const,
      amount: repairAmount,
      allowedTypes,
      step: 'slot-select' as const,
      prompt,
    };
    patch.heroSkillBanner = prompt;
    return applyPatch(state, patch, sideEffects);
  }

  // --- Repair choice (repair or upgrade) ---
  if (effect === 'repair-choice') {
    const allowedTypes: EquipmentRepairTarget[] = ['weapon', 'shield', 'monster'];
    const matchingSlots = getEquipmentSlotsMatching(state, allowedTypes);
    if (matchingSlots.length === 0) {
      banner(sideEffects, '没有装备武器或护盾，药剂失效。');
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    const prompt = '选择修复剂效果';
    patch.pendingPotionAction = {
      card,
      effect: 'repair-choice' as const,
      step: 'choice' as const,
      prompt,
    };
    patch.heroSkillBanner = prompt;
    return applyPatch(state, patch, sideEffects);
  }

  // --- Equip swap ---
  if (effect === 'equip-swap') {
    const slotsWithEquip = getEquippedSlots(state);
    if (slotsWithEquip.length === 0) {
      banner(sideEffects, '没有装备可以置换。');
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    if (slotsWithEquip.length === 1) {
      const result = applyEquipSwap(state, slotsWithEquip[0].id, card, sideEffects, enqueuedActions);
      Object.assign(patch, result);
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    sideEffects.push({
      event: 'ui:requestEquipmentChoice',
      payload: {
        prompt: '选择一个装备回到手牌',
        subtext: '若另一栏有装备，则换到该位置。',
        flowContext: { flowId: 'equip-swap' },
        card,
      },
    });
    patch.pendingPotionAction = {
      card,
      effect: 'perm-slot-damage+1',
      step: 'slot-select',
      prompt: '选择一个装备回到手牌',
    } as any;
    patch.heroSkillBanner = '选择一个装备回到手牌';
    return applyPatch(state, patch, sideEffects);
  }

  // --- Dice arcane infusion ---
  if (effect === 'dice-arcane-infusion') {
    patch.pendingPotionAction = {
      card,
      effect: 'perm-slot-damage+1',
      step: 'slot-select',
      prompt: '掷骰决定翻倍目标',
    } as any;
    const [aiRoll, aiRng] = nextInt(patch.rng ?? state.rng, 1, 20);
    patch.rng = aiRng;
    sideEffects.push({
      event: 'ui:requestDice' as any,
      payload: {
        title: card.name,
        subtitle: '掷骰决定翻倍目标',
        entries: [
          { id: 'ai-l-dmg', range: [1, 4], label: '左装备栏伤害翻倍', effect: 'none' },
          { id: 'ai-l-shd', range: [5, 8], label: '左装备栏护甲翻倍', effect: 'none' },
          { id: 'ai-r-dmg', range: [9, 12], label: '右装备栏伤害翻倍', effect: 'none' },
          { id: 'ai-r-shd', range: [13, 16], label: '右装备栏护甲翻倍', effect: 'none' },
          { id: 'ai-spell', range: [17, 20], label: '法术伤害加成翻倍', effect: 'none' },
        ],
        flowContext: { flowId: 'arcane-infusion', card },
        predeterminedRoll: aiRoll,
      },
    });
    return applyPatch(state, patch, sideEffects);
  }

  // --- Dice backpack expand (magic choice) ---
  if (effect === 'dice-backpack-expand') {
    // Use a non-targeting `step` so equipment slots don't enter slot-select
    // hover mode — only the MagicChoiceModal should drive resolution.
    patch.pendingPotionAction = {
      card,
      effect: 'backpack-expand',
      step: 'magic-choice',
      prompt: '选择灵药效果',
    } as any;
    sideEffects.push({
      event: 'ui:requestMagicChoice' as any,
      payload: {
        title: card.name,
        subtitle: '选择灵药效果',
        options: [
          { id: 'bp-amulet', label: '护符上限 +1', description: '永久增加护符槽位上限 1 个' },
          { id: 'bp-left', label: '左装备栏容量 +1', description: '永久增加左装备栏容量 1 个' },
          { id: 'bp-right', label: '右装备栏容量 +1', description: '永久增加右装备栏容量 1 个' },
          { id: 'bp-bag', label: '背包容量 +3', description: '永久增加背包容量 3 格' },
        ],
        flowContext: { flowId: 'backpack-expand', card },
      },
    });
    return applyPatch(state, patch, sideEffects);
  }

  // --- Repair (generic) — delegates to UI for slot selection ---
  if (effect === 'repair') {
    sideEffects.push({ event: 'card:potionRepair' as any, payload: { card, amount: card.value } });
    sideEffects.push({ event: 'card:potionResolved' as any, payload: { card } });
    return applyPatch(state, patch, sideEffects);
  }

  // --- Discover graveyard magic ---
  if (effect === 'discover-graveyard-magic') {
    const magicCards = state.discardedCards.filter(
      c => c.type === 'magic' || c.type === 'hero-magic',
    );
    if (magicCards.length === 0) {
      log(sideEffects, 'potion', '药水效果：墓地中没有魔法卡。');
      banner(sideEffects, '墓地中没有魔法卡。');
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    let currentRng = state.rng;
    let shuffled: GameCardData[];
    [shuffled, currentRng] = rngShuffle(magicCards, currentRng);
    patch.rng = currentRng;
    const options = shuffled.slice(0, Math.min(3, shuffled.length));

    patch.graveyardDiscoverState = options;
    patch.graveyardDiscoverDelivery = 'hand-first';
    patch.pendingPotionAction = { card, effect, step: 'graveyard-select' } as any;
    sideEffects.push({
      event: 'ui:graveyardDiscover' as any,
      payload: { options, card, source: 'potion' },
    });
    return applyPatch(state, patch, sideEffects);
  }

  // --- Discover class magic ---
  if (effect === 'discover-class-magic') {
    sideEffects.push({
      event: 'card:potionDiscoverClassMagic' as any,
      payload: { card },
    });
    sideEffects.push({ event: 'card:potionResolved' as any, payload: { card } });
    return applyPatch(state, patch, sideEffects);
  }

  // --- Grant perm-2 (permanent attribute to hand card) ---
  if (effect === 'grant-perm-2') {
    const eligible = state.handCards.filter(c => c.id !== card.id && !cardHasPermFlag(c));
    if (eligible.length === 0) {
      log(sideEffects, 'potion', '永恒铭刻药：手牌中没有可赋予永恒属性的卡牌。');
      banner(sideEffects, '手牌中没有可赋予永恒属性的卡牌。');
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    if (eligible.length === 1) {
      const target = eligible[0];
      patch.handCards = state.handCards.map(c => {
        if (c.id !== target.id) return c;
        const next: GameCardData = { ...c, recycleDelay: 3 };
        // 若目标曾被「凡化咒」剥离 Perm，需同时清除 permStripped 让原本的 Perm 属性重新生效。
        if (next.permStripped) delete next.permStripped;
        return next;
      });
      log(sideEffects, 'potion', `永恒铭刻药：「${target.name}」获得 Perm 3 属性！`);
      banner(sideEffects, `「${target.name}」获得 Perm 3！被移除后将经 3 次瀑流返回背包。`);
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    patch.permGrantModal = { sourceCardId: card.id, sourceType: 'potion' };
    patch.pendingPotionAction = { card, effect, step: 'perm-grant-select' } as any;
    return applyPatch(state, patch, sideEffects);
  }

  // --- Transform-recycle-grant ---
  if (effect === 'transform-recycle-grant') {
    const eligible = state.handCards.filter(c => c.id !== card.id && !c.transformBonus);
    if (eligible.length === 0) {
      log(sideEffects, 'potion', '唤回秘药：手牌中没有可赋予转型效果的卡牌。');
      banner(sideEffects, '手牌中没有可赋予转型效果的卡牌。');
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    if (eligible.length === 1) {
      const target = eligible[0];
      patch.handCards = state.handCards.map(c =>
        c.id === target.id
          ? { ...c, transformBonus: '回收袋取回 1 张牌', transformEffect: 'recycle-to-hand:1' }
          : c,
      );
      log(sideEffects, 'potion', `唤回秘药：「${target.name}」获得转型效果！`);
      banner(sideEffects, `「${target.name}」获得转型：回收袋取回 1 张牌！`);
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    patch.permGrantModal = { sourceCardId: card.id, sourceType: 'transform-recycle-grant' };
    patch.pendingPotionAction = { card, effect, step: 'perm-grant-select' } as any;
    return applyPatch(state, patch, sideEffects);
  }

  // --- Grant last-words slot temp buff ---
  if (effect === 'grant-lastwords-slot-temp-buff') {
    const slotsWithEquip = getEquippedSlots(state);
    if (slotsWithEquip.length === 0) {
      log(sideEffects, 'potion', '遗赠淬炼药：没有可赋予遗言的装备。');
      banner(sideEffects, '没有可赋予遗言的装备。');
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    if (slotsWithEquip.length === 1) {
      const slot = slotsWithEquip[0];
      const item = slot.item;
      (patch as any)[slot.id] = { ...item, onDestroyEffect: 'slot-temp-buff-3-3' };
      log(sideEffects, 'potion', `遗赠淬炼药：${item.name} 获得遗言：该装备栏 +3临时攻击 +3临时护甲！`);
      banner(sideEffects, `${item.name} 获得遗言：该装备栏 +3临时攻击 +3临时护甲！`);
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    patch.pendingPotionAction = {
      card,
      effect: 'grant-lastwords-slot-temp-buff' as any,
      step: 'slot-select',
      prompt: '选择一个装备，赋予遗言：该装备栏 +3临时攻击 +3临时护甲。',
    } as any;
    patch.heroSkillBanner = '选择一个装备，赋予遗言：该装备栏 +3临时攻击 +3临时护甲。';
    return applyPatch(state, patch, sideEffects);
  }

  // --- Amulet to eternal relic ---
  if (effect === 'amulet-to-eternal-relic') {
    const filledAmulets = (state.amuletSlots as GameCardData[])
      .map((a, idx) => ({ amulet: a, index: idx }))
      .filter(entry => entry.amulet != null);

    if (filledAmulets.length === 0) {
      log(sideEffects, 'potion', '护符永铸药：没有已装备的护符，无法使用。');
      banner(sideEffects, '没有已装备的护符！');
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    if (filledAmulets.length === 1) {
      const chosen = filledAmulets[0];
      const result = applyAmuletToEternalRelic(state, chosen, card, sideEffects, enqueuedActions);
      Object.assign(patch, result);
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    sideEffects.push({
      event: 'ui:requestMagicChoice' as any,
      payload: {
        title: '护符永铸药',
        subtitle: '选择一个护符，将其转化为永恒护符',
        options: filledAmulets.map(entry => ({
          id: String(entry.index),
          label: entry.amulet.name,
          description: entry.amulet.description ?? '护符效果',
        })),
        flowContext: { flowId: 'eternal-amulet', card },
      },
    });
    return applyPatch(state, patch, sideEffects);
  }

  // =========================================================================
  // Fallback: unrecognized effect → treat as heal
  // =========================================================================
  const healAmount = card.value ?? 0;
  enqueuedActions.push({ type: 'HEAL', amount: healAmount, source: card.name });
  log(sideEffects, 'potion', `使用 ${card.name}：恢复 ${healAmount} 点生命`);
  enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// resolvePendingPotion — handle interactive potion resolution
// ---------------------------------------------------------------------------

export function resolvePendingPotion(
  state: GameState,
  action: GameAction,
): ReduceResult | null {
  const pending = state.pendingPotionAction;
  if (!pending) return null;

  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};
  const enqueuedActions: GameAction[] = [];
  const card = pending.card;
  const pendingEffect = pending.effect;

  switch (pendingEffect) {
    // --- Slot damage +1/+2 ---
    case 'perm-slot-damage+1':
    case 'perm-slot-damage+2': {
      const amount = pendingEffect === 'perm-slot-damage+2' ? 2 : 1;
      const slotId = (action as any).slotId as EquipmentSlotId;
      if (!slotId) return null;
      const bonuses = { ...state.equipmentSlotBonuses };
      bonuses[slotId] = { ...bonuses[slotId], damage: bonuses[slotId].damage + amount };
      patch.equipmentSlotBonuses = bonuses;
      patch.pendingPotionAction = null;
      patch.heroSkillBanner = null;
      log(sideEffects, 'potion', `装备栏永久伤害 +${amount}`);
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    // --- Equipment durability max +1/+2 ---
    case 'perm-equipment-durability-max+1':
    case 'perm-equipment-durability-max+2': {
      const amount = pendingEffect === 'perm-equipment-durability-max+2' ? 2 : 1;
      const slotId = (action as any).slotId as 'equipmentSlot1' | 'equipmentSlot2';
      if (!slotId) return null;
      const item = state[slotId];
      if (!item || item.durability == null) return null;
      const maxDur = item.maxDurability ?? item.durability ?? 0;
      (patch as any)[slotId] = { ...item, maxDurability: maxDur + amount };
      patch.pendingPotionAction = null;
      patch.heroSkillBanner = null;
      log(sideEffects, 'potion', `耐久补剂：${item.name} 耐久上限 +${amount}（${maxDur} → ${maxDur + amount}）`);
      banner(sideEffects, `${item.name} 耐久上限 +${amount}！`);
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    // --- Grant weapon stun chance +40% ---
    case 'grant-weapon-stun-chance+40': {
      const slotId = (action as any).slotId as 'equipmentSlot1' | 'equipmentSlot2';
      if (!slotId) return null;
      const item = state[slotId];
      if (!item || (item.type !== 'weapon' && item.type !== 'monster')) return null;
      const amount = 40;
      const prev = (item as GameCardData).weaponStunChance ?? 0;
      const next = prev + amount;
      (patch as any)[slotId] = { ...item, weaponStunChance: next, _potionStunBonusApplied: true };
      patch.pendingPotionAction = null;
      patch.heroSkillBanner = null;
      log(sideEffects, 'potion', `${card.name}：${item.name} 击晕率 +${amount}%（${prev}% → ${next}%）`);
      banner(sideEffects, `${item.name} 击晕率 +${amount}%！`);
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    // --- Slot capacity +1 ---
    case 'perm-slot-capacity+1': {
      const slotId = (action as any).slotId as EquipmentSlotId;
      if (!slotId) return null;
      const currentCap = state.equipmentSlotCapacity[slotId] ?? 1;
      patch.equipmentSlotCapacity = { ...state.equipmentSlotCapacity, [slotId]: currentCap + 1 };
      patch.pendingPotionAction = null;
      patch.heroSkillBanner = null;
      const slotLabel = slotId === 'equipmentSlot1' ? '左' : '右';
      log(sideEffects, 'potion', `${slotLabel}装备栏可装备上限 +1（${currentCap} → ${currentCap + 1}）`);
      banner(sideEffects, `${slotLabel}装备栏可装备上限 +1！`);
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    // --- Repair equipment (slot selected) ---
    case 'repair-equipment': {
      const slotId = (action as any).slotId as 'equipmentSlot1' | 'equipmentSlot2';
      if (!slotId) return null;
      const repairPending = pending as Extract<typeof pending, { effect: 'repair-equipment' }>;
      const repairResult = applyRepairToSlot(state, slotId, repairPending.amount, sideEffects);
      Object.assign(patch, repairResult);
      patch.pendingPotionAction = null;
      patch.heroSkillBanner = null;
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    // --- Repair choice: player chose repair or upgrade ---
    case 'repair-choice': {
      const choiceId = (action as any).choiceId as string;
      if (!choiceId) return null;

      if (choiceId === 'repair') {
        const allowedTypes: EquipmentRepairTarget[] = ['weapon', 'shield', 'monster'];
        const equippedSlots = getEquipmentSlotsMatching(state, allowedTypes);

        if (equippedSlots.length === 0) {
          banner(sideEffects, '没有装备武器或护盾，修复无效。');
          patch.pendingPotionAction = null;
          patch.heroSkillBanner = null;
          enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
          return applyPatch(state, patch, sideEffects, enqueuedActions);
        }
        let anyRepaired = false;
        const bannerParts: string[] = [];
        let patchedState = state;
        for (const slot of equippedSlots) {
          const item = slot.item;
          const maxDur = item.maxDurability ?? item.durability ?? 0;
          const curDur = item.durability ?? maxDur;
          if (maxDur > 0 && curDur < maxDur) {
            const newDur = Math.min(maxDur, curDur + 2);
            (patch as any)[slot.id] = { ...item, durability: newDur };
            patchedState = { ...patchedState, [slot.id]: (patch as any)[slot.id] };
            log(sideEffects, 'potion', `装备修复剂：${item.name} 耐久 ${curDur} → ${newDur}`);
            bannerParts.push(`${item.name} 耐久 +${newDur - curDur}`);
            anyRepaired = true;
          } else {
            bannerParts.push(`${item.name} 已满耐久`);
          }
        }
        const repairBanner = anyRepaired ? bannerParts.join('，') + '。' : '所有装备已满耐久，修复无效。';
        banner(sideEffects, repairBanner);
        patch.pendingPotionAction = null;
        patch.heroSkillBanner = null;
        enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }

      if (choiceId === 'upgrade') {
        const allowedTypes: EquipmentRepairTarget[] = ['weapon', 'shield', 'monster'];
        const equippedSlots = getEquipmentSlotsMatching(state, allowedTypes);
        if (equippedSlots.length === 0) {
          banner(sideEffects, '没有可升级的装备。');
          patch.pendingPotionAction = null;
          patch.heroSkillBanner = null;
          enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
          return applyPatch(state, patch, sideEffects, enqueuedActions);
        }
        const bannerParts: string[] = [];
        for (const slot of equippedSlots) {
          const item = slot.item;
          const maxDur = item.maxDurability ?? item.durability ?? 0;
          (patch as any)[slot.id] = { ...item, maxDurability: maxDur + 1 };
          log(sideEffects, 'potion', `装备修复剂：${item.name} 耐久上限 +1（${maxDur} → ${maxDur + 1}）`);
          bannerParts.push(`${item.name} 上限 +1`);
        }
        banner(sideEffects, bannerParts.join('，') + '。');
        patch.pendingPotionAction = null;
        patch.heroSkillBanner = null;
        enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }

      return null;
    }

    // --- Repair-choice-repair (sub-step after choosing repair in repair-choice) ---
    case 'repair-choice-repair': {
      const slotId = (action as any).slotId as 'equipmentSlot1' | 'equipmentSlot2';
      if (!slotId) return null;
      const repairPending = pending as Extract<typeof pending, { effect: 'repair-choice-repair' }>;
      const repairResult = applyRepairToSlot(state, slotId, repairPending.amount, sideEffects);
      Object.assign(patch, repairResult);
      patch.pendingPotionAction = null;
      patch.heroSkillBanner = null;
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    // --- Repair-choice-upgrade (sub-step after choosing upgrade in repair-choice) ---
    case 'repair-choice-upgrade': {
      const slotId = (action as any).slotId as 'equipmentSlot1' | 'equipmentSlot2';
      if (!slotId) return null;
      const result = applyDurabilityMaxIncrease(state, slotId, 1, sideEffects);
      Object.assign(patch, result);
      patch.pendingPotionAction = null;
      patch.heroSkillBanner = null;
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    // --- Stun cap +10 (no slot needed, but may arrive via slot-select path) ---
    case 'perm-stun-cap+10': {
      patch.stunCap = Math.min(100, (state.stunCap ?? 0) + 10);
      patch.pendingPotionAction = null;
      patch.heroSkillBanner = null;
      log(sideEffects, 'potion', '眩晕药剂：击晕上限 +10%');
      banner(sideEffects, '击晕上限 +10%！');
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    // --- Amulet to eternal relic (player picked which amulet) ---
    case 'amulet-to-eternal-relic': {
      const choiceId = (action as any).choiceId as string | undefined;
      if (choiceId == null) return null;
      const index = Number.parseInt(choiceId, 10);
      if (Number.isNaN(index)) return null;
      const amulets = state.amuletSlots as GameCardData[];
      const amulet = amulets[index];
      if (!amulet) {
        patch.pendingPotionAction = null;
        patch.heroSkillBanner = null;
        banner(sideEffects, '所选护符已不存在。');
        enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      const result = applyAmuletToEternalRelic(state, { amulet, index }, card, sideEffects, enqueuedActions);
      Object.assign(patch, result);
      patch.pendingPotionAction = null;
      patch.heroSkillBanner = null;
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    // --- Backpack expand (4-option magic choice from 无尽背袋灵药) ---
    case 'backpack-expand' as any: {
      const choiceId = (action as any).choiceId as string | undefined;
      if (!choiceId) return null;
      switch (choiceId) {
        case 'bp-amulet':
          patch.maxAmuletSlots = (state.maxAmuletSlots ?? 0) + 1;
          log(sideEffects, 'potion', `${card.name}：护符栏上限 +1`);
          banner(sideEffects, '护符栏上限 +1！');
          break;
        case 'bp-left':
          patch.equipmentSlotCapacity = {
            ...state.equipmentSlotCapacity,
            equipmentSlot1: (state.equipmentSlotCapacity.equipmentSlot1 ?? 1) + 1,
          };
          log(sideEffects, 'potion', `${card.name}：左装备栏容量 +1`);
          banner(sideEffects, '左装备栏容量 +1！');
          break;
        case 'bp-right':
          patch.equipmentSlotCapacity = {
            ...state.equipmentSlotCapacity,
            equipmentSlot2: (state.equipmentSlotCapacity.equipmentSlot2 ?? 1) + 1,
          };
          log(sideEffects, 'potion', `${card.name}：右装备栏容量 +1`);
          banner(sideEffects, '右装备栏容量 +1！');
          break;
        case 'bp-bag':
          patch.backpackCapacityModifier = (state.backpackCapacityModifier ?? 0) + 3;
          log(sideEffects, 'potion', `${card.name}：背包容量 +3`);
          banner(sideEffects, '背包容量 +3！');
          break;
        default:
          return null;
      }
      patch.pendingPotionAction = null;
      patch.heroSkillBanner = null;
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    // --- Grant last-words slot temp buff (slot selected) ---
    case 'grant-lastwords-slot-temp-buff': {
      const slotId = (action as any).slotId as 'equipmentSlot1' | 'equipmentSlot2';
      if (!slotId) return null;
      const item = state[slotId];
      if (!item) return null;
      (patch as any)[slotId] = { ...item, onDestroyEffect: 'slot-temp-buff-3-3' };
      patch.pendingPotionAction = null;
      patch.heroSkillBanner = null;
      log(sideEffects, 'potion', `遗赠淬炼药：${item.name} 获得遗言：该装备栏 +3临时攻击 +3临时护甲！`);
      banner(sideEffects, `${item.name} 获得遗言：该装备栏 +3临时攻击 +3临时护甲！`);
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type SlotInfo = { id: 'equipmentSlot1' | 'equipmentSlot2'; item: GameCardData };

function getEquipmentSlotsMatching(
  state: GameState,
  allowedTypes: EquipmentRepairTarget[],
): SlotInfo[] {
  const result: SlotInfo[] = [];
  if (state.equipmentSlot1 && allowedTypes.includes(state.equipmentSlot1.type as EquipmentRepairTarget)) {
    result.push({ id: 'equipmentSlot1', item: state.equipmentSlot1 as GameCardData });
  }
  if (state.equipmentSlot2 && allowedTypes.includes(state.equipmentSlot2.type as EquipmentRepairTarget)) {
    result.push({ id: 'equipmentSlot2', item: state.equipmentSlot2 as GameCardData });
  }
  return result;
}

function getEquippedSlots(state: GameState): SlotInfo[] {
  const result: SlotInfo[] = [];
  if (state.equipmentSlot1) result.push({ id: 'equipmentSlot1', item: state.equipmentSlot1 as GameCardData });
  if (state.equipmentSlot2) result.push({ id: 'equipmentSlot2', item: state.equipmentSlot2 as GameCardData });
  return result;
}

function applyRepairToSlot(
  state: GameState,
  slotId: 'equipmentSlot1' | 'equipmentSlot2',
  amount: number,
  sideEffects: SideEffect[],
): Partial<GameState> {
  const patch: Partial<GameState> = {};
  const item = state[slotId];
  if (!item || item.durability == null) return patch;
  const maxDur = item.maxDurability ?? item.durability ?? 0;
  const currentDur = item.durability ?? maxDur;
  const newDur = Math.min(maxDur, currentDur + amount);
  const actualRepair = newDur - currentDur;
  if (actualRepair > 0) {
    (patch as any)[slotId] = { ...item, durability: newDur };
    log(sideEffects, 'potion', `修复药剂：${item.name} 耐久 +${actualRepair}（${currentDur} → ${newDur}）`);
    banner(sideEffects, `${item.name} 耐久 +${actualRepair}！`);
  } else {
    banner(sideEffects, `${item.name} 已满耐久。`);
  }
  return patch;
}

function applyDurabilityMaxIncrease(
  state: GameState,
  slotId: 'equipmentSlot1' | 'equipmentSlot2',
  amount: number,
  sideEffects: SideEffect[],
): Partial<GameState> {
  const patch: Partial<GameState> = {};
  const item = state[slotId];
  if (!item) return patch;
  const maxDur = item.maxDurability ?? item.durability ?? 0;
  (patch as any)[slotId] = { ...item, maxDurability: maxDur + amount };
  log(sideEffects, 'potion', `淬炼：${item.name} 耐久上限 +${amount}（${maxDur} → ${maxDur + amount}）`);
  banner(sideEffects, `${item.name} 耐久上限 +${amount}！`);
  return patch;
}

function applyEquipSwap(
  state: GameState,
  chosenSlotId: EquipmentSlotId,
  card: GameCardData,
  sideEffects: SideEffect[],
  enqueuedActions: GameAction[],
): Partial<GameState> {
  const patch: Partial<GameState> = {};
  const chosenItem = state[chosenSlotId];
  const otherSlotId: EquipmentSlotId = chosenSlotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
  const otherItem = state[otherSlotId];

  if (chosenItem) {
    const cardVersion: GameCardData = { ...chosenItem } as GameCardData;
    enqueuedActions.push({ type: 'ADD_CARD_TO_HAND', card: cardVersion });
    log(sideEffects, 'potion', `置换药剂：${chosenItem.name} 回到手牌`);

    if (otherItem) {
      (patch as any)[chosenSlotId] = { ...otherItem };
      patch[otherSlotId] = null;
      log(sideEffects, 'potion', `置换药剂：${otherItem.name} 换到${chosenSlotId === 'equipmentSlot1' ? '左' : '右'}槽`);
    } else {
      patch[chosenSlotId] = null;
    }
    banner(sideEffects, `${chosenItem.name} 回到手牌！`);
  } else {
    banner(sideEffects, '该装备栏为空。');
  }

  enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
  return patch;
}

function applyAmuletToEternalRelic(
  state: GameState,
  chosen: { amulet: GameCardData; index: number },
  card: GameCardData,
  sideEffects: SideEffect[],
  enqueuedActions: GameAction[],
): Partial<GameState> {
  const patch: Partial<GameState> = {};
  const amulet = chosen.amulet;
  const newRelic: EternalRelic = {
    id: `amulet-eternal-${amulet.amuletEffect ?? amulet.id}` as EternalRelicId,
    name: `永恒护符·${amulet.name}`,
    description: amulet.description ?? '',
    image: amulet.image ?? '',
    amuletEffect: amulet.amuletEffect,
    amuletAuraBonus: amulet.amuletAuraBonus,
    upgradeLevel: amulet.upgradeLevel,
  };
  (patch as any).amuletSlots = (state.amuletSlots as GameCardData[]).filter((_: any, i: number) => i !== chosen.index);
  patch.eternalRelics = [...(state.eternalRelics ?? []), newRelic];
  log(sideEffects, 'potion', `护符永铸药：${amulet.name} 转化为永恒护符！`);
  banner(sideEffects, `${amulet.name} 已转化为永恒护符！效果永久生效。`);
  enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card });
  return patch;
}

function cardHasPermFlag(card: GameCardData): boolean {
  // 凡化咒已剥离 Perm — 视为非 Perm，可被「永恒铭刻药」重新赋予
  if (card.permStripped) return false;
  return (
    card.recycleDelay != null && card.recycleDelay > 0
  ) || (
    card.type === 'magic' && card.magicType === 'permanent'
  ) || !!card.isPermanentEvent;
}
