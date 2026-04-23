/**
 * Effect Executors — one function per CardEffect.type.
 *
 * Each executor mutates the ExecutionContext in place (patch, sideEffects,
 * enqueuedActions). The engine calls them sequentially.
 *
 * All executors are pure with respect to GameState — they only read
 * ctx.state and write to ctx.patch/sideEffects/enqueuedActions.
 */

import type { CardEffect, ExecutionContext, PermanentStat } from './types';
import type { GameState, EternalRelic, EternalRelicId } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { SideEffect } from '../reducer';
import type { EquipmentRepairTarget } from '@/components/game-board/types';
import { INITIAL_HP, HAND_LIMIT, BASE_BACKPACK_CAPACITY, DURABILITY_CAP, clampMaxDurability } from '../constants';
import { computeAmuletEffects } from '../equipment';
import { clearSlotAndPromoteReserve } from '../rules/equipment-effects';
import { drawMultipleFromBackpack } from '../cards';
import { nextInt, shuffle as rngShuffle } from '../rng';
import { formatRepairTargetLabel } from '../helpers';
import { hasEternalRelic, getEternalRelic } from '@/lib/eternalRelics';
import { isDamageMagic } from '../helpers';

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function log(ctx: ExecutionContext, type: string, message: string) {
  ctx.sideEffects.push({ event: 'log:entry', payload: { type, message } });
}

function banner(ctx: ExecutionContext, text: string) {
  ctx.sideEffects.push({ event: 'ui:banner', payload: { text } });
}

// ---------------------------------------------------------------------------
// Resolve dynamic values
// ---------------------------------------------------------------------------

function resolveAmount(value: number | 'cardValue', ctx: ExecutionContext): number {
  return value === 'cardValue' ? (ctx.card.value ?? 0) : value;
}

// ---------------------------------------------------------------------------
// State reading helpers (read from patch first, then state)
// ---------------------------------------------------------------------------

function getStat(ctx: ExecutionContext, key: PermanentStat): number {
  if (key in ctx.patch) return (ctx.patch as any)[key] ?? 0;
  return (ctx.state as any)[key] ?? 0;
}

function getEquipmentSlot(ctx: ExecutionContext, slotId: 'equipmentSlot1' | 'equipmentSlot2'): GameCardData | null {
  if (slotId in ctx.patch) return (ctx.patch as any)[slotId] ?? null;
  return (ctx.state[slotId] as GameCardData) ?? null;
}

function getEquippedSlots(ctx: ExecutionContext): Array<{ id: 'equipmentSlot1' | 'equipmentSlot2'; item: GameCardData }> {
  const result: Array<{ id: 'equipmentSlot1' | 'equipmentSlot2'; item: GameCardData }> = [];
  const s1 = getEquipmentSlot(ctx, 'equipmentSlot1');
  if (s1) result.push({ id: 'equipmentSlot1', item: s1 });
  const s2 = getEquipmentSlot(ctx, 'equipmentSlot2');
  if (s2) result.push({ id: 'equipmentSlot2', item: s2 });
  return result;
}

function getEquipmentSlotsMatching(
  ctx: ExecutionContext,
  allowedTypes: EquipmentRepairTarget[],
): Array<{ id: 'equipmentSlot1' | 'equipmentSlot2'; item: GameCardData }> {
  const result: Array<{ id: 'equipmentSlot1' | 'equipmentSlot2'; item: GameCardData }> = [];
  for (const slotId of ['equipmentSlot1', 'equipmentSlot2'] as const) {
    const item = getEquipmentSlot(ctx, slotId);
    if (item && allowedTypes.includes(item.type as EquipmentRepairTarget)) {
      result.push({ id: slotId, item });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Effect executor dispatch table
// ---------------------------------------------------------------------------

export type EffectExecutor = (ctx: ExecutionContext, effect: CardEffect) => void;

const executorMap: Record<string, EffectExecutor> = {
  heal: executeHeal,
  shield: executeShield,
  modifyStat: executeModifyStat,
  clampHp: executeClampHp,
  modifyGold: executeModifyGold,
  draw: executeDraw,
  drawClassToBackpack: executeDrawClassToBackpack,
  enforceBackpackCapacity: executeEnforceBackpackCapacity,
  boostSlotBonuses: executeBoostSlotBonuses,
  modifySlotDurabilityMax: executeModifySlotDurabilityMax,
  swapSlotDamageShield: executeSwapSlotDamageShield,
  repairSlot: executeRepairSlot,
  modifySlotDurabilityMaxChoose: executeModifySlotDurabilityMaxChoose,
  modifySlotDamageChoose: executeModifySlotDamageChoose,
  modifySlotCapacityChoose: executeModifySlotCapacityChoose,
  grantWeaponStunChanceChoose: executeGrantWeaponStunChanceChoose,
  grantLastWordsSlotTempBuff: executeGrantLastWordsSlotTempBuff,
  equipSwap: executeEquipSwap,
  grantEternalRelic: executeGrantEternalRelic,
  discoverGraveyardMagic: executeDiscoverGraveyardMagic,
  discoverClassMagic: executeDiscoverClassMagic,
  grantPerm2: executeGrantPerm2,
  transformRecycleGrant: executeTransformRecycleGrant,
  amplifyTargetWide: executeAmplifyTargetWide,
  amuletToEternalRelic: executeAmuletToEternalRelic,
  interactive: executeInteractive,
  diceRoll: executeDiceRoll,
  magicChoice: executeMagicChoice,
  log: executeLog,
  banner: executeBanner,
  finalize: executeFinalize,
  custom: executeCustom,
};

export function getExecutor(effectType: string): EffectExecutor | undefined {
  return executorMap[effectType];
}

// ---------------------------------------------------------------------------
// Executor implementations
// ---------------------------------------------------------------------------

function executeHeal(ctx: ExecutionContext, effect: CardEffect): void {
  if (effect.type !== 'heal') return;
  const amount = resolveAmount(effect.amount, ctx);
  ctx.enqueuedActions.push({ type: 'HEAL', amount, source: ctx.card.name });
}

function executeShield(ctx: ExecutionContext, effect: CardEffect): void {
  if (effect.type !== 'shield') return;
  const amount = resolveAmount(effect.amount, ctx);
  ctx.patch.tempShield = getStat(ctx, 'tempShield') + amount;
}

function executeModifyStat(ctx: ExecutionContext, effect: CardEffect): void {
  if (effect.type !== 'modifyStat') return;
  const current = getStat(ctx, effect.stat);
  let newVal = current + effect.delta;
  if (effect.stat === 'stunCap') newVal = Math.min(100, newVal);
  (ctx.patch as any)[effect.stat] = newVal;
}

function executeClampHp(ctx: ExecutionContext, _effect: CardEffect): void {
  const maxHpBonus = (ctx.patch.permanentMaxHpBonus ?? ctx.state.permanentMaxHpBonus ?? 0);
  const aura = computeAmuletEffects(ctx.state.amuletSlots as GameCardData[]);
  const maxHp = INITIAL_HP + (maxHpBonus || 0) + (aura.aura.maxHp ?? 0);
  const currentHp = ctx.patch.hp ?? ctx.state.hp;
  const clamped = Math.min(maxHp, Number.isFinite(currentHp) ? currentHp : 0);
  ctx.patch.hp = Number.isFinite(clamped) ? clamped : ctx.state.hp;
}

function executeModifyGold(ctx: ExecutionContext, effect: CardEffect): void {
  if (effect.type !== 'modifyGold') return;
  ctx.enqueuedActions.push({ type: 'MODIFY_GOLD', delta: effect.delta, source: ctx.card.name });
}

function executeDraw(ctx: ExecutionContext, effect: CardEffect): void {
  if (effect.type !== 'draw') return;
  const count = resolveAmount(effect.count, ctx);
  if (effect.source === 'backpack') {
    ctx.enqueuedActions.push({ type: 'DRAW_FROM_BACKPACK', count });
  } else {
    ctx.enqueuedActions.push({ type: 'DRAW_CARDS', count, source: effect.source });
  }
}

function executeDrawClassToBackpack(ctx: ExecutionContext, effect: CardEffect): void {
  if (effect.type !== 'drawClassToBackpack') return;
  if (ctx.state.classDeck.length > 0) {
    ctx.enqueuedActions.push({ type: 'DRAW_CLASS_TO_BACKPACK', count: effect.count });
  } else {
    log(ctx, 'potion', '药水效果：职业卡牌不可用');
    banner(ctx, '职业卡牌不可用。');
  }
}

function executeEnforceBackpackCapacity(ctx: ExecutionContext, _effect: CardEffect): void {
  ctx.enqueuedActions.push({ type: 'ENFORCE_BACKPACK_CAPACITY' });
}

function executeBoostSlotBonuses(ctx: ExecutionContext, effect: CardEffect): void {
  if (effect.type !== 'boostSlotBonuses') return;
  const bonuses = { ...(ctx.patch.equipmentSlotBonuses ?? ctx.state.equipmentSlotBonuses) };
  const uniqueSlots: ('equipmentSlot1' | 'equipmentSlot2')[] = [];
  for (const s of effect.slots) {
    if ((s === 'left' || s === 'both') && !uniqueSlots.includes('equipmentSlot1')) uniqueSlots.push('equipmentSlot1');
    if ((s === 'right' || s === 'both') && !uniqueSlots.includes('equipmentSlot2')) uniqueSlots.push('equipmentSlot2');
  }
  for (const slotId of uniqueSlots) {
    bonuses[slotId] = {
      damage: bonuses[slotId].damage + (effect.damage ?? 0),
      shield: bonuses[slotId].shield + (effect.shield ?? 0),
    };
  }
  ctx.patch.equipmentSlotBonuses = bonuses;
}

function executeModifySlotDurabilityMax(ctx: ExecutionContext, effect: CardEffect): void {
  if (effect.type !== 'modifySlotDurabilityMax') return;
  const slotId = effect.slot === 'left' ? 'equipmentSlot1' : 'equipmentSlot2';
  const slotLabel = effect.slot === 'left' ? '左' : '右';
  const item = getEquipmentSlot(ctx, slotId);
  if (!item || item.durability == null) {
    banner(ctx, `${slotLabel}装备栏没有装备，药剂失效。`);
    return;
  }
  const maxDur = item.maxDurability ?? item.durability ?? 0;
  const newMax = clampMaxDurability(maxDur + effect.delta);
  if (newMax > maxDur) {
    (ctx.patch as any)[slotId] = { ...item, maxDurability: newMax };
    log(ctx, 'potion', `淬炼药剂：${item.name} 耐久上限 +${newMax - maxDur}（${maxDur} → ${newMax}）`);
    banner(ctx, `${item.name} 耐久上限 +${newMax - maxDur}！`);
  } else {
    log(ctx, 'potion', `淬炼药剂：${item.name} 耐久上限已达上限 ${DURABILITY_CAP}，无法继续提升。`);
    banner(ctx, `${item.name} 耐久上限已达上限 ${DURABILITY_CAP}。`);
  }
}

function executeSwapSlotDamageShield(ctx: ExecutionContext, _effect: CardEffect): void {
  const slotIds: ('equipmentSlot1' | 'equipmentSlot2')[] = ['equipmentSlot1', 'equipmentSlot2'];
  const [slotIdx, nextRng] = nextInt(ctx.state.rng, 0, 1);
  const chosenSlot = slotIds[slotIdx];
  ctx.patch.rng = nextRng;
  const slotLabel = chosenSlot === 'equipmentSlot1' ? '左' : '右';
  const bonuses = { ...(ctx.patch.equipmentSlotBonuses ?? ctx.state.equipmentSlotBonuses) };
  const curDamage = bonuses[chosenSlot].damage;
  const curShield = bonuses[chosenSlot].shield;
  bonuses[chosenSlot] = { damage: curShield, shield: curDamage };
  ctx.patch.equipmentSlotBonuses = bonuses;
  log(ctx, 'potion', `乾坤颠倒：${slotLabel}装备栏永久伤害(${curDamage})与护甲(${curShield})互换！`);
  banner(ctx, `${slotLabel}装备栏：伤害 ${curDamage}→${curShield}，护甲 ${curShield}→${curDamage}！`);
}

function executeRepairSlot(ctx: ExecutionContext, effect: CardEffect): void {
  if (effect.type !== 'repairSlot') return;
  const targetLabel = formatRepairTargetLabel(effect.allowedTypes);
  const matchingSlots = getEquipmentSlotsMatching(ctx, effect.allowedTypes);

  if (matchingSlots.length === 0) {
    banner(ctx, `没有装备${targetLabel}，药剂失效。`);
    return;
  }

  const repairableSlots = matchingSlots.filter(slot => {
    const maxDur = slot.item.maxDurability ?? slot.item.durability ?? 0;
    const curDur = slot.item.durability ?? maxDur;
    return maxDur > 0 && curDur < maxDur;
  });

  if (repairableSlots.length === 0) {
    banner(ctx, `所有${targetLabel}已满耐久。`);
    return;
  }

  if (repairableSlots.length === 1) {
    applyRepairToSlot(ctx, repairableSlots[0].id, effect.amount);
    return;
  }

  const prompt = `选择一个${targetLabel}恢复${effect.amount}点耐久。`;
  ctx.patch.pendingPotionAction = {
    card: ctx.card,
    effect: 'repair-equipment' as any,
    amount: effect.amount,
    allowedTypes: effect.allowedTypes,
    step: 'slot-select' as any,
    prompt,
  };
  ctx.patch.heroSkillBanner = prompt;
  // Don't finalize — waiting for player input
  ctx.halt = true;
  ctx.enqueuedActions.length = 0;
}

function executeModifySlotDurabilityMaxChoose(ctx: ExecutionContext, effect: CardEffect): void {
  if (effect.type !== 'modifySlotDurabilityMaxChoose') return;
  type SlotInfo = { id: 'equipmentSlot1' | 'equipmentSlot2'; item: GameCardData };
  const slotsWithDurability: SlotInfo[] = [];
  for (const slotId of ['equipmentSlot1', 'equipmentSlot2'] as const) {
    const item = getEquipmentSlot(ctx, slotId);
    if (item?.durability != null) slotsWithDurability.push({ id: slotId, item });
  }

  if (slotsWithDurability.length === 0) {
    banner(ctx, '没有可增加耐久的装备。');
    return;
  }
  if (slotsWithDurability.length === 1) {
    const slot = slotsWithDurability[0];
    const maxDur = slot.item.maxDurability ?? slot.item.durability ?? 0;
    const newMax = clampMaxDurability(maxDur + effect.delta);
    if (newMax > maxDur) {
      (ctx.patch as any)[slot.id] = { ...slot.item, maxDurability: newMax };
      log(ctx, 'potion', `耐久补剂：${slot.item.name} 耐久上限 +${newMax - maxDur}（${maxDur} → ${newMax}）`);
      banner(ctx, `${slot.item.name} 耐久上限 +${newMax - maxDur}！`);
    } else {
      log(ctx, 'potion', `耐久补剂：${slot.item.name} 耐久上限已达上限 ${DURABILITY_CAP}，无法继续提升。`);
      banner(ctx, `${slot.item.name} 耐久上限已达上限 ${DURABILITY_CAP}。`);
    }
    return;
  }

  ctx.patch.pendingPotionAction = {
    card: ctx.card,
    effect: (ctx.card.potionEffect ?? 'perm-equipment-durability-max+1') as any,
    step: 'slot-select',
    prompt: `选择一个装备，耐久上限 +${effect.delta}。`,
  } as any;
  ctx.patch.heroSkillBanner = `选择一个装备，耐久上限 +${effect.delta}。`;
  ctx.halt = true;
  ctx.enqueuedActions.length = 0;
}

function executeModifySlotDamageChoose(ctx: ExecutionContext, effect: CardEffect): void {
  if (effect.type !== 'modifySlotDamageChoose') return;
  ctx.patch.pendingPotionAction = {
    card: ctx.card,
    effect: (ctx.card.potionEffect ?? 'perm-slot-damage+1') as any,
    step: 'slot-select',
    prompt: `选择一个装备栏，永久伤害 +${effect.delta}。`,
  } as any;
  ctx.patch.heroSkillBanner = `选择一个装备栏，永久伤害 +${effect.delta}。`;
  ctx.halt = true;
  ctx.enqueuedActions.length = 0;
}

function executeModifySlotCapacityChoose(ctx: ExecutionContext, _effect: CardEffect): void {
  ctx.patch.pendingPotionAction = {
    card: ctx.card,
    effect: 'perm-slot-capacity+1' as any,
    step: 'slot-select',
    prompt: '选择一个装备栏，可装备上限 +1。',
  } as any;
  ctx.patch.heroSkillBanner = '选择一个装备栏，可装备上限 +1。';
  ctx.halt = true;
  ctx.enqueuedActions.length = 0;
}

function executeGrantWeaponStunChanceChoose(ctx: ExecutionContext, effect: CardEffect): void {
  if (effect.type !== 'grantWeaponStunChanceChoose') return;
  type SlotInfo = { id: 'equipmentSlot1' | 'equipmentSlot2'; item: GameCardData };
  const weaponSlots: SlotInfo[] = [];
  for (const slotId of ['equipmentSlot1', 'equipmentSlot2'] as const) {
    const item = getEquipmentSlot(ctx, slotId);
    if (item && (item.type === 'weapon' || item.type === 'monster')) weaponSlots.push({ id: slotId, item });
  }

  if (weaponSlots.length === 0) {
    log(ctx, 'potion', `${ctx.card.name}：装备栏没有武器或怪物装备，药剂失效。`);
    banner(ctx, '装备栏没有武器或怪物装备，药剂失效。');
    ctx.enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card: ctx.card });
    return;
  }
  if (weaponSlots.length === 1) {
    const slot = weaponSlots[0];
    const prev = slot.item.weaponStunChance ?? 0;
    const next = prev + effect.amount;
    (ctx.patch as any)[slot.id] = { ...slot.item, weaponStunChance: next, _potionStunBonusApplied: true };
    log(ctx, 'potion', `${ctx.card.name}：${slot.item.name} 击晕率 +${effect.amount}%（${prev}% → ${next}%）`);
    banner(ctx, `${slot.item.name} 击晕率 +${effect.amount}%！`);
    ctx.enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card: ctx.card });
    return;
  }

  ctx.patch.pendingPotionAction = {
    card: ctx.card,
    effect: (ctx.card.potionEffect ?? 'grant-weapon-stun-chance+40') as any,
    step: 'slot-select',
    prompt: `选择一个武器或怪物装备，永久击晕率 +${effect.amount}%。`,
  } as any;
  ctx.patch.heroSkillBanner = `选择一个武器或怪物装备，永久击晕率 +${effect.amount}%。`;
  ctx.halt = true;
  ctx.enqueuedActions.length = 0;
}

function executeGrantLastWordsSlotTempBuff(ctx: ExecutionContext, _effect: CardEffect): void {
  const slotsWithEquip = getEquippedSlots(ctx);
  if (slotsWithEquip.length === 0) {
    log(ctx, 'potion', '遗赠淬炼药：没有可赋予遗言的装备。');
    banner(ctx, '没有可赋予遗言的装备。');
    ctx.enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card: ctx.card });
    return;
  }
  if (slotsWithEquip.length === 1) {
    const slot = slotsWithEquip[0];
    (ctx.patch as any)[slot.id] = {
      ...slot.item,
      lastWordsSlotTempBuff: (slot.item.lastWordsSlotTempBuff ?? 0) + 1,
    };
    log(ctx, 'potion', `遗赠淬炼药：${slot.item.name} 获得遗言：该装备栏 +3临时攻击 +3临时护甲！`);
    banner(ctx, `${slot.item.name} 获得遗言：该装备栏 +3临时攻击 +3临时护甲！`);
    ctx.enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card: ctx.card });
    return;
  }
  ctx.patch.pendingPotionAction = {
    card: ctx.card,
    effect: 'grant-lastwords-slot-temp-buff' as any,
    step: 'slot-select',
    prompt: '选择一个装备，赋予遗言：该装备栏 +3临时攻击 +3临时护甲。',
  } as any;
  ctx.patch.heroSkillBanner = '选择一个装备，赋予遗言：该装备栏 +3临时攻击 +3临时护甲。';
  ctx.halt = true;
  ctx.enqueuedActions.length = 0;
}

function executeEquipSwap(ctx: ExecutionContext, _effect: CardEffect): void {
  const slotsWithEquip = getEquippedSlots(ctx);
  if (slotsWithEquip.length === 0) {
    banner(ctx, '没有装备可以置换。');
    ctx.enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card: ctx.card });
    return;
  }
  if (slotsWithEquip.length === 1) {
    applyEquipSwapToSlot(ctx, slotsWithEquip[0].id);
    ctx.enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card: ctx.card });
    return;
  }
  ctx.sideEffects.push({
    event: 'ui:requestEquipmentChoice',
    payload: {
      prompt: '选择一个装备回到手牌',
      subtext: '若另一栏有装备，则换到该位置。',
      flowContext: { flowId: 'equip-swap' },
      card: ctx.card,
    },
  });
  ctx.patch.pendingPotionAction = {
    card: ctx.card,
    effect: 'perm-slot-damage+1' as any,
    step: 'slot-select',
    prompt: '选择一个装备回到手牌',
  } as any;
  ctx.patch.heroSkillBanner = '选择一个装备回到手牌';
  ctx.halt = true;
  ctx.enqueuedActions.length = 0;
}

function executeGrantEternalRelic(ctx: ExecutionContext, effect: CardEffect): void {
  if (effect.type !== 'grantEternalRelic') return;
  if (hasEternalRelic(ctx.state.eternalRelics ?? [], effect.relicId)) {
    log(ctx, 'potion', effect.dupeLogMsg);
    banner(ctx, effect.dupeBannerMsg);
  } else {
    const relic = getEternalRelic(effect.relicId);
    ctx.patch.eternalRelics = [...(ctx.state.eternalRelics ?? []), relic];
    log(ctx, 'potion', effect.logMsg);
    banner(ctx, effect.bannerMsg);
  }
}

function executeDiscoverGraveyardMagic(ctx: ExecutionContext, _effect: CardEffect): void {
  const magicCards = ctx.state.discardedCards.filter(
    c => c.type === 'magic' || c.type === 'hero-magic',
  );
  if (magicCards.length === 0) {
    log(ctx, 'potion', '药水效果：墓地中没有魔法卡。');
    banner(ctx, '墓地中没有魔法卡。');
    ctx.enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card: ctx.card });
    return;
  }
  let currentRng = ctx.state.rng;
  let shuffled: GameCardData[];
  [shuffled, currentRng] = rngShuffle(magicCards, currentRng);
  ctx.patch.rng = currentRng;
  const options = shuffled.slice(0, Math.min(3, shuffled.length));
  ctx.patch.graveyardDiscoverState = options;
  ctx.patch.graveyardDiscoverDelivery = 'hand-first';
  ctx.patch.pendingPotionAction = {
    card: ctx.card,
    effect: 'discover-graveyard-magic',
    step: 'graveyard-select',
  } as any;
  ctx.sideEffects.push({
    event: 'ui:graveyardDiscover' as any,
    payload: { options, card: ctx.card, source: 'potion' },
  });
  ctx.halt = true;
  ctx.enqueuedActions.length = 0;
}

function executeDiscoverClassMagic(ctx: ExecutionContext, _effect: CardEffect): void {
  ctx.sideEffects.push({
    event: 'card:potionDiscoverClassMagic' as any,
    payload: { card: ctx.card },
  });
  ctx.sideEffects.push({ event: 'card:potionResolved' as any, payload: { card: ctx.card } });
  ctx.halt = true;
  ctx.enqueuedActions.length = 0;
}

function executeGrantPerm2(ctx: ExecutionContext, _effect: CardEffect): void {
  // 凡化咒已剥离 Perm 的牌（permStripped）应再次成为可赋予 Perm 的目标。
  const cardHasPerm = (c: GameCardData) => {
    if (c.permStripped) return false;
    return (
      (c.recycleDelay != null && c.recycleDelay > 0) ||
      (c.type === 'magic' && c.magicType === 'permanent') ||
      !!c.isPermanentEvent
    );
  };

  const eligible = ctx.state.handCards.filter(c => c.id !== ctx.card.id && !cardHasPerm(c));
  if (eligible.length === 0) {
    log(ctx, 'potion', '永恒铭刻药：手牌中没有可赋予永恒属性的卡牌。');
    banner(ctx, '手牌中没有可赋予永恒属性的卡牌。');
    return;
  }
  if (eligible.length === 1) {
    const target = eligible[0];
    ctx.patch.handCards = ctx.state.handCards.map(c => {
      if (c.id !== target.id) return c;
      const next: GameCardData = { ...c, recycleDelay: 3 };
      if (next.permStripped) delete next.permStripped;
      return next;
    });
    log(ctx, 'potion', `永恒铭刻药：「${target.name}」获得 Perm 3 属性！`);
    banner(ctx, `「${target.name}」获得 Perm 3！被移除后将经 3 次瀑流返回背包。`);
    return;
  }
  ctx.patch.permGrantModal = { sourceCardId: ctx.card.id, sourceType: 'potion' };
  ctx.patch.pendingPotionAction = { card: ctx.card, effect: 'grant-perm-2', step: 'perm-grant-select' } as any;
  ctx.halt = true;
  ctx.enqueuedActions.length = 0;
}

function executeTransformRecycleGrant(ctx: ExecutionContext, _effect: CardEffect): void {
  const eligible = ctx.state.handCards.filter(c => c.id !== ctx.card.id && !c.transformBonus);
  if (eligible.length === 0) {
    log(ctx, 'potion', '唤回秘药：手牌中没有可赋予转型效果的卡牌。');
    banner(ctx, '手牌中没有可赋予转型效果的卡牌。');
    return;
  }
  if (eligible.length === 1) {
    const target = eligible[0];
    ctx.patch.handCards = ctx.state.handCards.map(c =>
      c.id === target.id
        ? { ...c, transformBonus: '回收袋取回 1 张牌', transformEffect: 'recycle-to-hand:1' }
        : c,
    );
    log(ctx, 'potion', `唤回秘药：「${target.name}」获得转型效果！`);
    banner(ctx, `「${target.name}」获得转型：回收袋取回 1 张牌！`);
    return;
  }
  ctx.patch.permGrantModal = { sourceCardId: ctx.card.id, sourceType: 'transform-recycle-grant' };
  ctx.patch.pendingPotionAction = { card: ctx.card, effect: 'transform-recycle-grant', step: 'perm-grant-select' } as any;
  ctx.halt = true;
  ctx.enqueuedActions.length = 0;
}

/**
 * 「增幅秘药」（knight 专属 potion）：打开 wide-scope 的 AmplifyModal，
 * 玩家可从【装备栏 / 手牌 / 背包】中任选一张装备或伤害魔法生成 Perm 1 增幅卡。
 *
 * 与主牌堆「增幅」magic 共用 RESOLVE_AMPLIFY / CANCEL_AMPLIFY 流，
 * 通过 amplifyModal.sourceType='potion' 让 reducer 知道走 FINALIZE_POTION_CARD。
 */
function executeAmplifyTargetWide(ctx: ExecutionContext, _effect: CardEffect): void {
  const eligibleEquip = (slotId: 'equipmentSlot1' | 'equipmentSlot2'): boolean => {
    const item = ctx.state[slotId] as GameCardData | null;
    return !!item && (item.type === 'weapon' || item.type === 'shield');
  };
  const hasEquip1 = eligibleEquip('equipmentSlot1');
  const hasEquip2 = eligibleEquip('equipmentSlot2');
  const eligibleHand = ctx.state.handCards.filter(
    c => c.id !== ctx.card.id && (c.type === 'weapon' || c.type === 'shield' || isDamageMagic(c)),
  );
  const eligibleBackpack = ctx.state.backpackItems.filter(
    c => c.type === 'weapon' || c.type === 'shield' || isDamageMagic(c),
  );

  if (!hasEquip1 && !hasEquip2 && eligibleHand.length === 0 && eligibleBackpack.length === 0) {
    log(ctx, 'potion', '增幅秘药：没有可增幅的目标（装备栏 / 手牌 / 背包均无装备或伤害魔法）。');
    banner(ctx, '增幅秘药：没有可增幅的目标。');
    return;
  }

  ctx.patch.amplifyModal = { sourceCardId: ctx.card.id, scope: 'wide', sourceType: 'potion' };
  ctx.patch.pendingPotionAction = { card: ctx.card, effect: 'amplify-target-wide', step: 'modal-select' } as any;
  ctx.patch.heroSkillBanner = '增幅秘药：选择一张牌进行增幅。';
  ctx.halt = true;
  ctx.enqueuedActions.length = 0;
}

function executeAmuletToEternalRelic(ctx: ExecutionContext, _effect: CardEffect): void {
  const filledAmulets = (ctx.state.amuletSlots as GameCardData[])
    .map((a, idx) => ({ amulet: a, index: idx }))
    .filter(entry => entry.amulet != null);

  if (filledAmulets.length === 0) {
    log(ctx, 'potion', '护符永铸药：没有已装备的护符，无法使用。');
    banner(ctx, '没有已装备的护符！');
    return;
  }

  if (filledAmulets.length === 1) {
    applyAmuletToRelic(ctx, filledAmulets[0]);
    return;
  }

  ctx.patch.pendingPotionAction = {
    card: ctx.card,
    effect: 'amulet-to-eternal-relic',
    step: 'magic-choice',
  };
  ctx.sideEffects.push({
    event: 'ui:requestMagicChoice' as any,
    payload: {
      title: '护符永铸药',
      subtitle: '选择一个护符，将其转化为永恒护符',
      options: filledAmulets.map(entry => ({
        id: String(entry.index),
        label: entry.amulet.name,
        description: entry.amulet.description ?? '护符效果',
      })),
      flowContext: { flowId: 'eternal-amulet', card: ctx.card },
    },
  });
  ctx.halt = true;
  ctx.enqueuedActions.length = 0;
}

function executeInteractive(ctx: ExecutionContext, effect: CardEffect): void {
  if (effect.type !== 'interactive') return;
  ctx.patch.pendingPotionAction = {
    card: ctx.card,
    ...effect.config,
  } as any;
  ctx.halt = true;
  ctx.enqueuedActions.length = 0;
}

function executeDiceRoll(ctx: ExecutionContext, effect: CardEffect): void {
  if (effect.type !== 'diceRoll') return;
  const config = effect.config as Record<string, unknown>;
  ctx.patch.pendingPotionAction = {
    card: ctx.card,
    effect: 'perm-slot-damage+1' as any,
    step: 'slot-select',
    prompt: (config.subtitle as string) ?? '',
  } as any;
  // Pre-roll D20 from seeded RNG so the UI dice modal animates to a
  // deterministic value (UI is purely visual playback; reducer owns the RNG).
  const [diceRoll, diceRng] = nextInt(ctx.patch.rng ?? ctx.state.rng, 1, 20);
  ctx.patch.rng = diceRng;
  const payload = { ...config, predeterminedRoll: diceRoll } as Record<string, unknown>;
  if (!payload.flowContext) {
    payload.flowContext = { flowId: (config.flowId as string) ?? 'dice-roll', card: ctx.card };
  }
  ctx.sideEffects.push({
    event: 'ui:requestDice' as any,
    payload,
  });
  ctx.halt = true;
  ctx.enqueuedActions.length = 0;
}

function executeMagicChoice(ctx: ExecutionContext, effect: CardEffect): void {
  if (effect.type !== 'magicChoice') return;
  const config = effect.config as Record<string, unknown>;
  const flowId = (config.flowId as string) ?? 'magic-choice';
  // Use a non-targeting `step` so the equipment slots don't enter
  // hover-select mode. The resolver in `resolvePendingPotion` routes
  // by `effect` (= flowId) when a RESOLVE_MAGIC_CHOICE arrives.
  ctx.patch.pendingPotionAction = {
    card: ctx.card,
    effect: flowId as any,
    step: 'magic-choice' as any,
    prompt: (config.subtitle as string) ?? '',
  } as any;
  const payload = { ...config };
  if (!payload.flowContext) {
    payload.flowContext = { flowId, card: ctx.card };
  }
  ctx.sideEffects.push({
    event: 'ui:requestMagicChoice' as any,
    payload,
  });
  ctx.halt = true;
  ctx.enqueuedActions.length = 0;
}

function executeLog(ctx: ExecutionContext, effect: CardEffect): void {
  if (effect.type !== 'log') return;
  log(ctx, effect.logType, interpolate(effect.message, ctx));
}

function executeBanner(ctx: ExecutionContext, effect: CardEffect): void {
  if (effect.type !== 'banner') return;
  banner(ctx, interpolate(effect.text, ctx));
}

/**
 * Simple template interpolation: replaces ${card.name}, ${card.value} etc.
 */
function interpolate(template: string, ctx: ExecutionContext): string {
  return template
    .replace(/\$\{card\.name\}/g, ctx.card.name ?? '')
    .replace(/\$\{card\.value\}/g, String(ctx.card.value ?? 0));
}

function executeFinalize(ctx: ExecutionContext, _effect: CardEffect): void {
  ctx.enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card: ctx.card });
}

function executeCustom(_ctx: ExecutionContext, _effect: CardEffect): void {
  // Custom handlers are looked up by the engine — this is a no-op placeholder.
  // The engine will call the registered custom handler directly.
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function applyRepairToSlot(
  ctx: ExecutionContext,
  slotId: 'equipmentSlot1' | 'equipmentSlot2',
  amount: number,
): void {
  const item = getEquipmentSlot(ctx, slotId);
  if (!item || item.durability == null) return;
  const maxDur = item.maxDurability ?? item.durability ?? 0;
  const currentDur = item.durability ?? maxDur;
  const newDur = Math.min(maxDur, currentDur + amount);
  const actualRepair = newDur - currentDur;
  if (actualRepair > 0) {
    (ctx.patch as any)[slotId] = { ...item, durability: newDur };
    log(ctx, 'potion', `修复药剂：${item.name} 耐久 +${actualRepair}（${currentDur} → ${newDur}）`);
    banner(ctx, `${item.name} 耐久 +${actualRepair}！`);
  } else {
    banner(ctx, `${item.name} 已满耐久。`);
  }
}

function applyEquipSwapToSlot(ctx: ExecutionContext, chosenSlotId: 'equipmentSlot1' | 'equipmentSlot2'): void {
  const chosenItem = getEquipmentSlot(ctx, chosenSlotId);
  const otherSlotId: 'equipmentSlot1' | 'equipmentSlot2' =
    chosenSlotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
  const otherItem = getEquipmentSlot(ctx, otherSlotId);

  if (chosenItem) {
    ctx.enqueuedActions.push({ type: 'ADD_CARD_TO_HAND', card: { ...chosenItem } as GameCardData });
    log(ctx, 'potion', `置换药剂：${chosenItem.name} 回到手牌`);
    if (otherItem) {
      (ctx.patch as any)[chosenSlotId] = { ...otherItem };
      // The OTHER slot lost its main to the swap. Promote its topmost reserve
      // up so a stacked card under otherItem doesn't visually disappear (the
      // EquipmentSlot UI only renders the reserve stack when main is truthy).
      clearSlotAndPromoteReserve(ctx.state, otherSlotId, ctx.patch);
      log(ctx, 'potion', `置换药剂：${otherItem.name} 换到${chosenSlotId === 'equipmentSlot1' ? '左' : '右'}槽`);
    } else {
      // chosenSlot lost its main and nothing came in to replace it — promote
      // its topmost reserve so any stacked card doesn't vanish.
      clearSlotAndPromoteReserve(ctx.state, chosenSlotId, ctx.patch);
    }
    banner(ctx, `${chosenItem.name} 回到手牌！`);
  } else {
    banner(ctx, '该装备栏为空。');
  }
}

function applyAmuletToRelic(
  ctx: ExecutionContext,
  chosen: { amulet: GameCardData; index: number },
): void {
  const amulet = chosen.amulet;
  const newRelic = {
    id: `amulet-eternal-${amulet.amuletEffect ?? amulet.id}` as EternalRelicId,
    name: `永恒护符·${amulet.name}`,
    description: amulet.description ?? '',
    image: amulet.image ?? '',
    amuletEffect: amulet.amuletEffect,
    amuletAuraBonus: amulet.amuletAuraBonus,
    upgradeLevel: amulet.upgradeLevel,
  };
  (ctx.patch as any).amuletSlots = (ctx.state.amuletSlots as GameCardData[]).filter(
    (_: any, i: number) => i !== chosen.index,
  );
  ctx.patch.eternalRelics = [...(ctx.state.eternalRelics ?? []), newRelic];
  log(ctx, 'potion', `护符永铸药：${amulet.name} 转化为永恒护符！`);
  banner(ctx, `${amulet.name} 已转化为永恒护符！效果永久生效。`);
}
