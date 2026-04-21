/**
 * Equipment Effects — pure functions for equipment destruction ("last words"),
 * durability loss effects (bleed, dragon, wraith, swarm, golem), and revive logic.
 *
 * Shared by PERFORM_HERO_ATTACK and RESOLVE_BLOCK to eliminate duplication.
 */

import type { GameCardData } from '@/components/GameCard';
import { isPermRecycleEquipment } from '@/components/GameCard';
import type {
  EquipmentSlotId,
  EquipmentItem,
  EquipmentSlotBonusState,
  ActiveAmuletEffects,
  ActiveRowSlots,
} from '@/components/game-board/types';
import type { GameState } from '../types';
import type { SideEffect } from '../reducer';
import type { GameAction } from '../actions';
import { flattenActiveRowSlots, applyAmplifyOnCreate } from '../helpers';
import type { RngState } from '../rng';
import { nextBool, nextInt, pickRandom } from '../rng';
import { createBugletCard } from '../deck';

// ---------------------------------------------------------------------------
// Perm-recycle routing — equipment that is destroyed but carries a Perm flag
// (永恒铭刻 sets `recycleDelay`, native `permEquipment: true`, etc.) must end
// up in the permanent magic recycle bag rather than vanishing or going to the
// graveyard. `permStripped` (set by 凡化咒) overrides everything and forces
// non-Perm routing — kept consistent with `cards.ts:reduceDisposeEquipmentCard`
// and `helpers.ts:getWaterfallPreviewDiscardDestination`.
// ---------------------------------------------------------------------------

export function shouldRouteEquipmentToPermRecycle(card: GameCardData): boolean {
  if (card.permStripped) return false;
  if (isPermRecycleEquipment(card)) return true;
  if (
    (card.type === 'weapon' || card.type === 'shield' || card.type === 'monster')
    && card.recycleDelay != null && card.recycleDelay > 0
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Shared helper — pick a random card from the graveyard, EXCLUDING a given id.
//
// Used by the `graveyard-to-hand` last-words effect (Iron Shield, etc.) to
// guarantee that a destroyed equipment cannot be picked back from a graveyard
// state that may already contain a previously-discarded copy with the same
// effect, or where the engine momentarily staged the card in discardedCards.
//
// Returns null when the filtered pool is empty.
// ---------------------------------------------------------------------------

export function pickGraveyardCardExcluding(
  graveyard: readonly GameCardData[],
  excludeId: string,
  rng: RngState,
): { picked: GameCardData; idx: number; rng: RngState } | null {
  const eligibleIndices: number[] = [];
  for (let i = 0; i < graveyard.length; i++) {
    if (graveyard[i].id !== excludeId) eligibleIndices.push(i);
  }
  if (eligibleIndices.length === 0) return null;
  const [pickIdx, nextRng] = nextInt(rng, 0, eligibleIndices.length - 1);
  const idx = eligibleIndices[pickIdx];
  return { picked: graveyard[idx], idx, rng: nextRng };
}

// ---------------------------------------------------------------------------
// Variant of pickGraveyardCardExcluding that only considers `type === 'event'`
// graveyard cards. Used by the `graveyard-event-to-hand` last-words token
// (e.g. 「生长之盾」). Returns null when no eligible event card is present.
// ---------------------------------------------------------------------------

export function pickGraveyardEventCardExcluding(
  graveyard: readonly GameCardData[],
  excludeId: string,
  rng: RngState,
): { picked: GameCardData; idx: number; rng: RngState } | null {
  const eligibleIndices: number[] = [];
  for (let i = 0; i < graveyard.length; i++) {
    const c = graveyard[i];
    if (c.id !== excludeId && c.type === 'event') eligibleIndices.push(i);
  }
  if (eligibleIndices.length === 0) return null;
  const [pickIdx, nextRng] = nextInt(rng, 0, eligibleIndices.length - 1);
  const idx = eligibleIndices[pickIdx];
  return { picked: graveyard[idx], idx, rng: nextRng };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EquipmentBreakResult {
  patch: Partial<GameState>;
  sideEffects: SideEffect[];
  /** Follow-up actions to enqueue (e.g. DISPOSE_EQUIPMENT_CARD for graveyard-to-hand last words). */
  enqueuedActions: GameAction[];
  /** Number of cards to draw from backpack to hand */
  drawFromBackpack: number;
  /** Number of class cards to draw to backpack */
  classCardDraw: number;
  /** Whether the item was revived (durability set to 1) */
  revived: boolean;
  /** Whether the item was destroyed (slot cleared) */
  destroyed: boolean;
  /** If a wraith swap occurred, which slot got moved */
  wraithSwapTarget?: EquipmentSlotId;
  /** Updated RNG state after any random calls */
  rng: RngState;
}

export interface DurabilityLossResult {
  updatedItem: GameCardData;
  patch: Partial<GameState>;
  sideEffects: SideEffect[];
  /** Monster damage to deal from golem reflect */
  golemReflectDamage?: { targetId: string; damage: number; slotId: EquipmentSlotId };
  /** Updated RNG state after any random calls */
  rng: RngState;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function otherSlot(slotId: EquipmentSlotId): EquipmentSlotId {
  return slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
}

function getSlotItem(state: GameState, slotId: EquipmentSlotId): GameCardData | null {
  return slotId === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
}

function slotLabel(slotId: EquipmentSlotId): string {
  return slotId === 'equipmentSlot1' ? '左' : '右';
}

// ---------------------------------------------------------------------------
// Equipment displacement — fire "last words" only (no revive, no slot mutation)
//
// Used when equipment A is displaced from a slot by equipment B (slot capacity
// exceeded). Conceptually treated as A being destroyed, so its last-words
// effects fire — but the slot is NOT cleared (B is already there) and revive
// effects are intentionally skipped.
// ---------------------------------------------------------------------------

export interface DisplacementLastWordsResult {
  patch: Partial<GameState>;
  sideEffects: SideEffect[];
  enqueuedActions: GameAction[];
  drawFromBackpack: number;
  classCardDraw: number;
  rng: RngState;
}

/**
 * Compute the "last words" effects for a displaced equipment without applying
 * revive or modifying the source slot.
 *
 * - Triggers: onDestroyHeal/Gold/Draw/ClassDraw/PermanentDamage/PermanentShield/onDestroyEffect,
 *   monster-specific lastWords (wraith-haunt, wraithDeathHeal/Spread, skeletonLastWordsDiscard,
 *   discard-hand-3 draw).
 * - Does NOT: revive, swap slots, clear/promote any slot, or mutate the destroyed
 *   item's own slot (the displacing item B is already there).
 * - The "other slot" effects (wraith-haunt/wraithDeathHeal targeting the opposite
 *   equipment) still apply normally.
 */
export function computeEquipmentDisplacementLastWords(
  state: GameState,
  slotId: EquipmentSlotId,
  slotItem: GameCardData,
  amuletEffects: ActiveAmuletEffects,
  initialPatch: Partial<GameState> = {},
): DisplacementLastWordsResult {
  const isMonsterEquip = slotItem.type === 'monster';
  const otherSlotId = otherSlot(slotId);
  const otherItem = (initialPatch[otherSlotId] ?? getSlotItem(state, otherSlotId)) as GameCardData | null;
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = { ...initialPatch };
  let rng = (initialPatch.rng ?? state.rng) as RngState;
  let drawFromBackpack = 0;
  let classCardDraw = 0;
  let triggeredGraveyardToHand = false;

  const hasLastWords = slotItem.onDestroyHeal || slotItem.onDestroyGold || slotItem.onDestroyDraw
    || slotItem.onDestroyClassDraw || slotItem.onDestroyPermanentDamage || slotItem.onDestroyPermanentShield
    || slotItem.onDestroyEffect || slotItem.lastWordsSlotTempBuff
    || (isMonsterEquip && (slotItem.lastWords || slotItem.wraithDeathHeal || slotItem.wraithDeathHealSpread
      || slotItem.skeletonLastWordsDiscard));

  if (hasLastWords) {
    sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${slotItem.name} 遗言触发！` } });
  }

  if (hasLastWords && amuletEffects.lastWordsMonsterDebuffCount > 0) {
    const debuffPerTrigger = amuletEffects.lastWordsMonsterDebuffCount;
    const baseActive = (patch.activeCards ?? state.activeCards) as ActiveRowSlots;
    const debuffedActive = baseActive.map(c => {
      if (!c || c.type !== 'monster') return c;
      const curAtk = c.attack ?? c.value;
      return { ...c, attack: Math.max(0, curAtk - debuffPerTrigger) };
    }) as ActiveRowSlots;
    patch.activeCards = debuffedActive;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'amulet', message: `绝响之符：${slotItem.name} 遗言触发，激活行所有怪物攻击力 -${debuffPerTrigger}！` },
    });
  }

  if (slotItem.onDestroyHeal) {
    sideEffects.push({
      event: 'equipment:lastWordsHeal',
      payload: { amount: slotItem.onDestroyHeal, itemName: slotItem.name },
    });
  }

  if (slotItem.onDestroyGold) {
    patch.gold = (patch.gold ?? state.gold ?? 0) + slotItem.onDestroyGold;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 遗言：获得了 ${slotItem.onDestroyGold} 金币` },
    });
  }

  if (slotItem.onDestroyDraw) {
    drawFromBackpack += slotItem.onDestroyDraw;
  }

  if (slotItem.onDestroyClassDraw) {
    classCardDraw += slotItem.onDestroyClassDraw;
  }

  if (slotItem.onDestroyPermanentDamage) {
    const bonuses = patch.equipmentSlotBonuses
      ? { ...(patch.equipmentSlotBonuses as EquipmentSlotBonusState) }
      : { ...state.equipmentSlotBonuses };
    const slotBonus = { ...bonuses[slotId] };
    slotBonus.damage += slotItem.onDestroyPermanentDamage;
    bonuses[slotId] = slotBonus;
    patch.equipmentSlotBonuses = bonuses as EquipmentSlotBonusState;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 遗言：该装备栏永久伤害 +${slotItem.onDestroyPermanentDamage}！` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！永久伤害 +${slotItem.onDestroyPermanentDamage}！` } });
  }

  if (slotItem.onDestroyPermanentShield) {
    const bonuses = patch.equipmentSlotBonuses
      ? { ...(patch.equipmentSlotBonuses as EquipmentSlotBonusState) }
      : { ...state.equipmentSlotBonuses };
    const slotBonus = { ...bonuses[slotId] };
    slotBonus.shield += slotItem.onDestroyPermanentShield;
    bonuses[slotId] = slotBonus;
    patch.equipmentSlotBonuses = bonuses as EquipmentSlotBonusState;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 遗言：该装备栏永久护甲 +${slotItem.onDestroyPermanentShield}！` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！永久护甲 +${slotItem.onDestroyPermanentShield}！` } });
  }

  // 遗赠淬炼药 — slot-temp-buff-3-3 stacks on top of any onDestroyEffect via the
  // separate `lastWordsSlotTempBuff` counter, so it must fire independently and
  // multiply by the number of times the potion was applied. Legacy save-game
  // compat: equipment whose `onDestroyEffect` is literally 'slot-temp-buff-3-3'
  // (set by the old overwriting potion code) also counts as 1 stack.
  const tempBuffStacks = (slotItem.lastWordsSlotTempBuff ?? 0)
    + (slotItem.onDestroyEffect === 'slot-temp-buff-3-3' ? 1 : 0);
  if (tempBuffStacks > 0) {
    const buffAmount = 3 * tempBuffStacks;
    const tempAttack = patch.slotTempAttack ?? { ...(state.slotTempAttack ?? {}) };
    const tempArmor = patch.slotTempArmor ?? { ...(state.slotTempArmor ?? {}) };
    tempAttack[slotId] = (tempAttack[slotId] ?? 0) + buffAmount;
    tempArmor[slotId] = (tempArmor[slotId] ?? 0) + buffAmount;
    patch.slotTempAttack = tempAttack;
    patch.slotTempArmor = tempArmor;
    const stackSuffix = tempBuffStacks > 1 ? `（×${tempBuffStacks}）` : '';
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 遗言：该装备栏 +${buffAmount}临时攻击 +${buffAmount}临时护甲！${stackSuffix}` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！该装备栏 +${buffAmount}临时攻击 +${buffAmount}临时护甲！${stackSuffix}` } });
    if (amuletEffects.persuadeOnTempAttackCount > 0) {
      // `persuadeOnTempAttackBonus` is already the per-trigger sum across all
      // equipped 怀柔之印 (each amulet contributes its own 10 / 20 by upgrade).
      // The buff applies twice (temp attack AND temp armor), times the stack count.
      const pBonus = amuletEffects.persuadeOnTempAttackBonus;
      patch.persuadeAmuletBonus = (patch.persuadeAmuletBonus ?? state.persuadeAmuletBonus ?? 0) + pBonus * 2 * tempBuffStacks;
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `怀柔之印：下次劝降率 +${pBonus * 2 * tempBuffStacks}%（临时攻击+临时护甲 ×${tempBuffStacks}）` },
      });
    }
  }

  if (slotItem.onDestroyEffect && slotItem.onDestroyEffect !== 'slot-temp-buff-3-3') {
    if (slotItem.onDestroyEffect === 'slot-temp-armor-3') {
      const tempArmor = patch.slotTempArmor ?? { ...(state.slotTempArmor ?? {}) };
      tempArmor[slotId] = (tempArmor[slotId] ?? 0) + 3;
      patch.slotTempArmor = tempArmor;
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${slotItem.name} 遗言：该装备栏 +3临时护甲！` },
      });
      sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！该装备栏 +3临时护甲！` } });
    } else if (slotItem.onDestroyEffect.startsWith('stunCap+')) {
      const amount = parseInt(slotItem.onDestroyEffect.replace('stunCap+', ''), 10) || 0;
      if (amount > 0) {
        const current = patch.stunCap ?? state.stunCap ?? 0;
        const next = Math.min(100, current + amount);
        if (next > current) patch.stunCap = next;
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：击晕上限 +${amount}%（当前 ${next}%）。` },
        });
        sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！击晕上限 +${amount}%！` } });
      }
    } else if (slotItem.onDestroyEffect.startsWith('allSlotTempArmor:')) {
      const amount = parseInt(slotItem.onDestroyEffect.replace('allSlotTempArmor:', ''), 10) || 0;
      if (amount > 0) {
        const tempArmor = patch.slotTempArmor ?? { ...(state.slotTempArmor ?? {}) };
        tempArmor.equipmentSlot1 = (tempArmor.equipmentSlot1 ?? 0) + amount;
        tempArmor.equipmentSlot2 = (tempArmor.equipmentSlot2 ?? 0) + amount;
        patch.slotTempArmor = tempArmor;
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：所有装备栏 +${amount}临时护甲！` },
        });
        sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！所有装备栏 +${amount}临时护甲！` } });
        if (amuletEffects.persuadeOnTempAttackCount > 0) {
          const pBonus = amuletEffects.persuadeOnTempAttackBonus;
          patch.persuadeAmuletBonus = (patch.persuadeAmuletBonus ?? state.persuadeAmuletBonus ?? 0) + pBonus;
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'equip', message: `怀柔之印：下次劝降率 +${pBonus}%` },
          });
        }
      }
    } else if (slotItem.onDestroyEffect === 'graveyard-to-hand') {
      triggeredGraveyardToHand = true;
      const graveyard = (patch.discardedCards ?? state.discardedCards) as readonly GameCardData[];
      const pick = pickGraveyardCardExcluding(graveyard, slotItem.id, rng);
      if (pick) {
        rng = pick.rng;
        patch.discardedCards = graveyard.filter((_, i) => i !== pick.idx);
        patch.handCards = [...(patch.handCards ?? state.handCards), pick.picked];
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：从坟场获得了「${pick.picked.name}」！` },
        });
        sideEffects.push({ event: 'equipment:graveyardToHand', payload: { itemName: slotItem.name } });
        sideEffects.push({ event: 'card:newCardGained', payload: { count: 1, source: 'graveyard' } });
      } else {
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：坟场没有可用的牌。` },
        });
      }
    } else if (slotItem.onDestroyEffect === 'graveyard-event-to-hand') {
      triggeredGraveyardToHand = true;
      const graveyard = (patch.discardedCards ?? state.discardedCards) as readonly GameCardData[];
      const pick = pickGraveyardEventCardExcluding(graveyard, slotItem.id, rng);
      if (pick) {
        rng = pick.rng;
        patch.discardedCards = graveyard.filter((_, i) => i !== pick.idx);
        patch.handCards = [...(patch.handCards ?? state.handCards), pick.picked];
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：从坟场抽出 Event「${pick.picked.name}」！` },
        });
        sideEffects.push({ event: 'equipment:graveyardToHand', payload: { itemName: slotItem.name } });
        sideEffects.push({ event: 'card:newCardGained', payload: { count: 1, source: 'graveyard' } });
      } else {
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：坟场没有可用的 Event 牌。` },
        });
      }
    } else {
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${slotItem.name} 遗言：${slotItem.onDestroyEffect}` },
      });
    }
  }

  if (isMonsterEquip) {
    if (slotItem.lastWords === 'discard-hand-3') {
      drawFromBackpack += 3;
      sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言：抽取 3 张牌！` } });
    }

    if (slotItem.skeletonLastWordsDiscard) {
      drawFromBackpack += 1;
      sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言：抽取 1 张牌！` } });
    }

    if (slotItem.lastWords?.startsWith('wraith-haunt')) {
      const hauntAmount = parseInt(slotItem.lastWords.replace('wraith-haunt-', ''), 10) || 2;
      if (otherItem) {
        const bonuses = patch.equipmentSlotBonuses
          ? { ...(patch.equipmentSlotBonuses as EquipmentSlotBonusState) }
          : { ...state.equipmentSlotBonuses };
        const ob = { ...bonuses[otherSlotId] };
        ob.damage += hauntAmount;
        bonuses[otherSlotId] = ob;
        patch.equipmentSlotBonuses = bonuses as EquipmentSlotBonusState;
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：${otherItem.name} 获得临时攻击力 +${hauntAmount}！` },
        });
      }
    }

    if (slotItem.wraithDeathHeal || slotItem.wraithDeathHealSpread) {
      if (otherItem && otherItem.durability != null && otherItem.maxDurability != null) {
        const newDur = Math.min(otherItem.maxDurability, otherItem.durability + 1);
        let updatedOther = { ...otherItem } as EquipmentItem;
        if (newDur > otherItem.durability) {
          updatedOther = { ...updatedOther, durability: newDur };
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'equip', message: `${slotItem.name} 怨灵祝福：${otherItem.name} 耐久 +1！` },
          });
        }
        if (slotItem.wraithDeathHealSpread && !otherItem.wraithDeathHeal) {
          updatedOther = { ...updatedOther, wraithDeathHeal: 1 };
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'equip', message: `${slotItem.name} 怨灵传承：${otherItem.name} 获得遗言「怨灵祝福」！` },
          });
        }
        patch[otherSlotId] = updatedOther as EquipmentItem;
      }
    }
  }

  // Suppress lint warning — flag is captured for future extension if needed.
  void triggeredGraveyardToHand;

  patch.rng = rng;

  return { patch, sideEffects, enqueuedActions, drawFromBackpack, classCardDraw, rng };
}

// ---------------------------------------------------------------------------
// Equipment break (durability reaches 0) — "last words" / revive / destroy
// ---------------------------------------------------------------------------

export function computeEquipmentBreakEffects(
  state: GameState,
  slotId: EquipmentSlotId,
  slotItem: GameCardData,
  amuletEffects: ActiveAmuletEffects,
): EquipmentBreakResult {
  const isMonsterEquip = slotItem.type === 'monster';
  const otherSlotId = otherSlot(slotId);
  const otherItem = getSlotItem(state, otherSlotId);
  const effects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};
  let rng = state.rng;
  let drawFromBackpack = 0;
  let classCardDraw = 0;
  let triggeredGraveyardToHand = false;

  const hasLastWords = slotItem.onDestroyHeal || slotItem.onDestroyGold || slotItem.onDestroyDraw
    || slotItem.onDestroyClassDraw || slotItem.onDestroyPermanentDamage || slotItem.onDestroyPermanentShield
    || slotItem.onDestroyEffect || slotItem.lastWordsSlotTempBuff
    || (isMonsterEquip && (slotItem.lastWords || slotItem.wraithDeathHeal || slotItem.wraithDeathHealSpread
      || slotItem.skeletonLastWordsDiscard));

  if (hasLastWords) {
    effects.push({ event: 'log:entry', payload: { type: 'equip', message: `${slotItem.name} 遗言触发！` } });
  }

  if (hasLastWords && amuletEffects.lastWordsMonsterDebuffCount > 0) {
    const debuffPerTrigger = amuletEffects.lastWordsMonsterDebuffCount;
    const debuffedActive = state.activeCards.map(c => {
      if (!c || c.type !== 'monster') return c;
      const curAtk = c.attack ?? c.value;
      return { ...c, attack: Math.max(0, curAtk - debuffPerTrigger) };
    }) as ActiveRowSlots;
    patch.activeCards = debuffedActive;
    effects.push({
      event: 'log:entry',
      payload: { type: 'amulet', message: `绝响之符：${slotItem.name} 遗言触发，激活行所有怪物攻击力 -${debuffPerTrigger}！` },
    });
  }

  // onDestroyHeal
  if (slotItem.onDestroyHeal) {
    effects.push({
      event: 'equipment:lastWordsHeal',
      payload: { amount: slotItem.onDestroyHeal, itemName: slotItem.name },
    });
  }

  // onDestroyGold
  if (slotItem.onDestroyGold) {
    patch.gold = (state.gold ?? 0) + slotItem.onDestroyGold;
    effects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 遗言：获得了 ${slotItem.onDestroyGold} 金币` },
    });
  }

  // onDestroyDraw
  if (slotItem.onDestroyDraw) {
    drawFromBackpack += slotItem.onDestroyDraw;
  }

  // onDestroyClassDraw
  if (slotItem.onDestroyClassDraw) {
    classCardDraw += slotItem.onDestroyClassDraw;
  }

  // onDestroyPermanentDamage
  if (slotItem.onDestroyPermanentDamage) {
    const bonuses = { ...state.equipmentSlotBonuses };
    const slotBonus = { ...bonuses[slotId] };
    slotBonus.damage += slotItem.onDestroyPermanentDamage;
    bonuses[slotId] = slotBonus;
    patch.equipmentSlotBonuses = bonuses as EquipmentSlotBonusState;
    effects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 遗言：该装备栏永久伤害 +${slotItem.onDestroyPermanentDamage}！` },
    });
    effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！永久伤害 +${slotItem.onDestroyPermanentDamage}！` } });
  }

  // onDestroyPermanentShield
  if (slotItem.onDestroyPermanentShield) {
    const bonuses = patch.equipmentSlotBonuses
      ? { ...(patch.equipmentSlotBonuses as EquipmentSlotBonusState) }
      : { ...state.equipmentSlotBonuses };
    const slotBonus = { ...bonuses[slotId] };
    slotBonus.shield += slotItem.onDestroyPermanentShield;
    bonuses[slotId] = slotBonus;
    patch.equipmentSlotBonuses = bonuses as EquipmentSlotBonusState;
    effects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 遗言：该装备栏永久护甲 +${slotItem.onDestroyPermanentShield}！` },
    });
    effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！永久护甲 +${slotItem.onDestroyPermanentShield}！` } });
  }

  // 遗赠淬炼药 — slot-temp-buff-3-3 stacks on top of any onDestroyEffect via the
  // separate `lastWordsSlotTempBuff` counter, so it must fire independently and
  // multiply by the number of times the potion was applied. Legacy save-game
  // compat: equipment whose `onDestroyEffect` is literally 'slot-temp-buff-3-3'
  // (set by the old overwriting potion code) also counts as 1 stack.
  const tempBuffStacks = (slotItem.lastWordsSlotTempBuff ?? 0)
    + (slotItem.onDestroyEffect === 'slot-temp-buff-3-3' ? 1 : 0);
  if (tempBuffStacks > 0) {
    const buffAmount = 3 * tempBuffStacks;
    const tempAttack = { ...(state.slotTempAttack ?? {}) };
    const tempArmor = { ...(state.slotTempArmor ?? {}) };
    tempAttack[slotId] = (tempAttack[slotId] ?? 0) + buffAmount;
    tempArmor[slotId] = (tempArmor[slotId] ?? 0) + buffAmount;
    patch.slotTempAttack = tempAttack;
    patch.slotTempArmor = tempArmor;
    const stackSuffix = tempBuffStacks > 1 ? `（×${tempBuffStacks}）` : '';
    effects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 遗言：该装备栏 +${buffAmount}临时攻击 +${buffAmount}临时护甲！${stackSuffix}` },
    });
    effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！该装备栏 +${buffAmount}临时攻击 +${buffAmount}临时护甲！${stackSuffix}` } });
    if (amuletEffects.persuadeOnTempAttackCount > 0) {
      const pBonus = amuletEffects.persuadeOnTempAttackBonus;
      patch.persuadeAmuletBonus = (state.persuadeAmuletBonus ?? 0) + pBonus * 2 * tempBuffStacks;
      effects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `怀柔之印：下次劝降率 +${pBonus * 2 * tempBuffStacks}%（临时攻击+临时护甲 ×${tempBuffStacks}）` },
      });
    }
  }

  // onDestroyEffect (other variants — slot-temp-buff-3-3 handled above)
  if (slotItem.onDestroyEffect && slotItem.onDestroyEffect !== 'slot-temp-buff-3-3') {
    if (slotItem.onDestroyEffect === 'slot-temp-armor-3') {
      const tempArmor = { ...(state.slotTempArmor ?? {}) };
      tempArmor[slotId] = (tempArmor[slotId] ?? 0) + 3;
      patch.slotTempArmor = tempArmor;
      effects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${slotItem.name} 遗言：该装备栏 +3临时护甲！` },
      });
      effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！该装备栏 +3临时护甲！` } });
    } else if (slotItem.onDestroyEffect.startsWith('stunCap+')) {
      const amount = parseInt(slotItem.onDestroyEffect.replace('stunCap+', ''), 10) || 0;
      if (amount > 0) {
        const current = patch.stunCap ?? state.stunCap ?? 0;
        const next = Math.min(100, current + amount);
        if (next > current) patch.stunCap = next;
        effects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：击晕上限 +${amount}%（当前 ${next}%）。` },
        });
        effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！击晕上限 +${amount}%！` } });
      }
    } else if (slotItem.onDestroyEffect.startsWith('allSlotTempArmor:')) {
      const amount = parseInt(slotItem.onDestroyEffect.replace('allSlotTempArmor:', ''), 10) || 0;
      if (amount > 0) {
        const tempArmor = { ...(state.slotTempArmor ?? {}) };
        tempArmor.equipmentSlot1 = (tempArmor.equipmentSlot1 ?? 0) + amount;
        tempArmor.equipmentSlot2 = (tempArmor.equipmentSlot2 ?? 0) + amount;
        patch.slotTempArmor = tempArmor;
        effects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：所有装备栏 +${amount}临时护甲！` },
        });
        effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！所有装备栏 +${amount}临时护甲！` } });
        if (amuletEffects.persuadeOnTempAttackCount > 0) {
          const pBonus = amuletEffects.persuadeOnTempAttackBonus;
          patch.persuadeAmuletBonus = (state.persuadeAmuletBonus ?? 0) + pBonus;
          effects.push({
            event: 'log:entry',
            payload: { type: 'equip', message: `怀柔之印：下次劝降率 +${pBonus}%` },
          });
        }
      }
    } else if (slotItem.onDestroyEffect === 'graveyard-to-hand') {
      triggeredGraveyardToHand = true;
      const graveyard = (patch.discardedCards ?? state.discardedCards) as readonly GameCardData[];
      const pick = pickGraveyardCardExcluding(graveyard, slotItem.id, rng);
      if (pick) {
        rng = pick.rng;
        patch.discardedCards = graveyard.filter((_, i) => i !== pick.idx);
        patch.handCards = [...(patch.handCards ?? state.handCards), pick.picked];
        effects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：从坟场获得了「${pick.picked.name}」！` },
        });
        effects.push({ event: 'equipment:graveyardToHand', payload: { itemName: slotItem.name } });
        effects.push({ event: 'card:newCardGained', payload: { count: 1, source: 'graveyard' } });
      } else {
        effects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：坟场没有可用的牌。` },
        });
      }
    } else if (slotItem.onDestroyEffect === 'graveyard-event-to-hand') {
      triggeredGraveyardToHand = true;
      const graveyard = (patch.discardedCards ?? state.discardedCards) as readonly GameCardData[];
      const pick = pickGraveyardEventCardExcluding(graveyard, slotItem.id, rng);
      if (pick) {
        rng = pick.rng;
        patch.discardedCards = graveyard.filter((_, i) => i !== pick.idx);
        patch.handCards = [...(patch.handCards ?? state.handCards), pick.picked];
        effects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：从坟场抽出 Event「${pick.picked.name}」！` },
        });
        effects.push({ event: 'equipment:graveyardToHand', payload: { itemName: slotItem.name } });
        effects.push({ event: 'card:newCardGained', payload: { count: 1, source: 'graveyard' } });
      } else {
        effects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：坟场没有可用的 Event 牌。` },
        });
      }
    } else {
      effects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${slotItem.name} 遗言：${slotItem.onDestroyEffect}` },
      });
    }
  }

  // Monster-specific last words
  if (isMonsterEquip) {
    // discard-hand-3 draw
    if (slotItem.lastWords === 'discard-hand-3') {
      drawFromBackpack += 3;
      effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言：抽取 3 张牌！` } });
    }

    // Skeleton last words discard → draw 1
    if (slotItem.skeletonLastWordsDiscard) {
      drawFromBackpack += 1;
      effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言：抽取 1 张牌！` } });
    }

    // Wraith haunt — damage bonus to other slot
    if (slotItem.lastWords?.startsWith('wraith-haunt')) {
      const hauntAmount = parseInt(slotItem.lastWords.replace('wraith-haunt-', ''), 10) || 2;
      if (otherItem) {
        const bonuses = patch.equipmentSlotBonuses
          ? { ...(patch.equipmentSlotBonuses as EquipmentSlotBonusState) }
          : { ...state.equipmentSlotBonuses };
        const ob = { ...bonuses[otherSlotId] };
        ob.damage += hauntAmount;
        bonuses[otherSlotId] = ob;
        patch.equipmentSlotBonuses = bonuses as EquipmentSlotBonusState;
        effects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：${otherItem.name} 获得临时攻击力 +${hauntAmount}！` },
        });
      }
    }

    // Wraith death heal — other slot durability +1 and optional spread
    if (slotItem.wraithDeathHeal || slotItem.wraithDeathHealSpread) {
      if (otherItem && otherItem.durability != null && otherItem.maxDurability != null) {
        const newDur = Math.min(otherItem.maxDurability, otherItem.durability + 1);
        let updatedOther = { ...otherItem } as EquipmentItem;
        if (newDur > otherItem.durability) {
          updatedOther = { ...updatedOther, durability: newDur };
          effects.push({
            event: 'log:entry',
            payload: { type: 'equip', message: `${slotItem.name} 怨灵祝福：${otherItem.name} 耐久 +1！` },
          });
        }
        if (slotItem.wraithDeathHealSpread && !otherItem.wraithDeathHeal) {
          updatedOther = { ...updatedOther, wraithDeathHeal: 1 };
          effects.push({
            event: 'log:entry',
            payload: { type: 'equip', message: `${slotItem.name} 怨灵传承：${otherItem.name} 获得遗言「怨灵祝福」！` },
          });
        }
        patch[otherSlotId] = updatedOther as EquipmentItem;
      }
    }
  }

  // --- Revive check ---
  const nativeReviveAvailable = isMonsterEquip && slotItem.hasRevive && !slotItem.reviveUsed;
  const equipReviveAvailable = slotItem.hasEquipmentRevive && !slotItem.equipmentReviveUsed;
  const canRevive = nativeReviveAvailable || equipReviveAvailable;
  let revived = false;
  let destroyed = false;
  let wraithSwapTarget: EquipmentSlotId | undefined;

  if (canRevive) {
    revived = true;
    const reviveUpdate = nativeReviveAvailable
      ? { ...slotItem, durability: 1, reviveUsed: true }
      : { ...slotItem, durability: 1, equipmentReviveUsed: true };
    patch[slotId] = reviveUpdate as EquipmentItem;
    effects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 复生！以 1 耐久复活！` },
    });
    effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 复生了！` } });
  } else {
    destroyed = true;
    effects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 损坏了` },
    });
    effects.push({
      event: 'equipment:destroyed',
      payload: { slotId, cardId: slotItem.id },
    });

    // 残骸回收符 (equipment-salvage amulet): for weapons/shields, return the broken
    // card to hand with maxDurability-N instead of being lost (N = number of
    // equipped salvage amulets — every amulet independently triggers a save,
    // and each save costs one durability point). If maxDur reaches 0 the card
    // is removed from the game entirely.
    //
    // Perm-priority rule: equipment carrying a Perm flag (永恒铭刻 etc.) must
    // route to the recycle bag. Salvage is SKIPPED for Perm equipment so the
    // card is not consumed (and not capable of vanishing via maxDur underflow).
    const isPermRecycle = shouldRouteEquipmentToPermRecycle(slotItem);
    const salvageCount = amuletEffects.equipmentSalvageCount;
    const canSalvage = !isPermRecycle
      && salvageCount > 0
      && (slotItem.type === 'weapon' || slotItem.type === 'shield');

    // Wraith swap (50% chance to move other slot's item to this slot) — monster-only,
    // mutually exclusive with salvage which only applies to weapon/shield.
    let wraithSwapSuccess = false;
    if (isMonsterEquip && slotItem.lastWords?.startsWith('wraith-haunt') && otherItem) {
      [wraithSwapSuccess, rng] = nextBool(rng);
    }

    if (canSalvage) {
      const newMaxDur = (slotItem.maxDurability ?? 1) - salvageCount;
      patch[slotId] = null as unknown as EquipmentItem;
      effects.push({ event: 'equipment:clearSlotWithPromote', payload: { slotId } });
      if (newMaxDur <= 0) {
        effects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `残骸回收符：${slotItem.name} 耐久上限归零，从游戏中移除！` },
        });
        effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 耐久上限归零，移除！` } });
      } else {
        const {
          fromSlot: _fs,
          armor: _a,
          armorBonusDamaged: _ab,
          reviveUsed: _ru,
          equipmentReviveUsed: _eru,
          wraithRebirthUsed: _wru,
          ...rest
        } = slotItem as GameCardData & Record<string, unknown>;
        const salvaged: GameCardData = { ...(rest as GameCardData), durability: 1, maxDurability: newMaxDur };
        patch.handCards = [...(patch.handCards ?? state.handCards), salvaged];
        effects.push({ event: 'card:equipmentSalvaged', payload: { card: salvaged, slotHint: slotId } });
        effects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `残骸回收符：${slotItem.name} 回到手牌（耐久 1/${newMaxDur}）！` },
        });
        effects.push({ event: 'ui:banner', payload: { text: `残骸回收！${slotItem.name} 回到手牌！` } });
      }
    } else if (wraithSwapSuccess && otherItem) {
      patch[slotId] = { ...otherItem, fromSlot: slotId } as EquipmentItem;
      patch[otherSlotId] = null as unknown as EquipmentItem;
      wraithSwapTarget = otherSlotId;
      effects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `幽魂作祟：${otherItem.name} 被移到了${slotLabel(slotId)}装备栏！` },
      });
      effects.push({ event: 'equipment:clearSlotWithPromote', payload: { slotId: otherSlotId } });
    } else {
      patch[slotId] = null as unknown as EquipmentItem;
      effects.push({ event: 'equipment:clearSlotWithPromote', payload: { slotId } });
      // Perm-flagged equipment (永恒铭刻 / native permEquipment) routes to the
      // permanent magic recycle bag. This MUST take priority over the
      // graveyard-to-hand last-words branch below — a Perm Iron Shield should
      // come back via the recycle bag, not be sent to the graveyard.
      // ADD_TO_RECYCLE_BAG handles its own metadata sanitization and durability
      // normalization (see reduceAddToRecycleBag in cards.ts).
      if (isPermRecycle) {
        const { fromSlot: _fsp, armor: _ap, armorBonusDamaged: _abp, reviveUsed: _rup,
          equipmentReviveUsed: _erup, wraithRebirthUsed: _wrup, ...rest } =
          slotItem as GameCardData & Record<string, unknown>;
        const cleaned: GameCardData = { ...(rest as GameCardData) };
        enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card: cleaned });
      } else if (triggeredGraveyardToHand) {
        // For graveyard-to-hand last words, the destroyed equipment itself should
        // enter the graveyard *after* the picked card was moved to hand. Without
        // salvage this is the only path that delivers Iron Shield to the graveyard
        // post-break (the picked-from-graveyard pool was already filtered above).
        const { fromSlot: _fs2, armor: _a2, armorBonusDamaged: _ab2, reviveUsed: _ru2,
          equipmentReviveUsed: _eru2, wraithRebirthUsed: _wru2, ...rest } =
          slotItem as GameCardData & Record<string, unknown>;
        const cleaned: GameCardData = { ...(rest as GameCardData) };
        const currentGrave = (patch.discardedCards ?? state.discardedCards) as GameCardData[];
        patch.discardedCards = [...currentGrave, cleaned];
      }
    }

    // Skeleton re-revive on other slot
    const otherForReRevive = wraithSwapTarget ? null : getSlotItem(state, otherSlotId);
    if (otherForReRevive && otherForReRevive.type === 'monster' && otherForReRevive.skeletonReRevive
      && (!otherForReRevive.hasRevive || otherForReRevive.reviveUsed)) {
      const reRevivedOther = { ...otherForReRevive, hasRevive: true, reviveUsed: false };
      if (!patch[otherSlotId]) {
        patch[otherSlotId] = reRevivedOther as EquipmentItem;
      }
      effects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${otherForReRevive.name} 亡骨轮回：获得了「复生」！` },
      });
      effects.push({ event: 'ui:banner', payload: { text: `${otherForReRevive.name} 亡骨轮回！` } });
    }
  }

  return { patch, sideEffects: effects, enqueuedActions, drawFromBackpack, classCardDraw, revived, destroyed, wraithSwapTarget, rng };
}

// ---------------------------------------------------------------------------
// Durability loss effects (when item loses durability but survives)
// ---------------------------------------------------------------------------

export function computeDurabilityLossEffects(
  state: GameState,
  slotId: EquipmentSlotId,
  slotItem: GameCardData,
  newDurability: number,
): DurabilityLossResult {
  const isMonsterEquip = slotItem.type === 'monster';
  const otherSlotId = otherSlot(slotId);
  const otherItem = getSlotItem(state, otherSlotId);
  const effects: SideEffect[] = [];
  const patch: Partial<GameState> = {};
  let rng = state.rng;
  let updatedItem = { ...slotItem, durability: newDurability };

  if (!isMonsterEquip) {
    return { updatedItem, patch, sideEffects: effects, rng };
  }

  // Bleed effect: +3 attack on durability loss
  if (slotItem.bleedEffect) {
    const bleedBonus = 3;
    updatedItem = {
      ...updatedItem,
      attack: (updatedItem.attack ?? updatedItem.value) + bleedBonus,
      value: updatedItem.value + bleedBonus,
      specialAttackBoost: (updatedItem.specialAttackBoost ?? 0) + bleedBonus,
    };
    effects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 流血：攻击力 +${bleedBonus}！（当前 ${updatedItem.attack}）` },
    });
  }

  // Dragon bleed destroy — destroy other slot if its durability > this item's remaining
  if (slotItem.dragonBleedDestroy && otherItem && (otherItem.durability ?? 0) > newDurability) {
    const card = otherItem as GameCardData;
    const isOtherMonster = card.type === 'monster';
    const nativeRevive = isOtherMonster && card.hasRevive && !card.reviveUsed;
    const equipRevive = card.hasEquipmentRevive && !card.equipmentReviveUsed;
    if (nativeRevive || equipRevive) {
      const revived = nativeRevive
        ? { ...card, durability: 1, reviveUsed: true }
        : { ...card, durability: 1, equipmentReviveUsed: true };
      patch[otherSlotId] = revived as EquipmentItem;
      effects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${slotItem.name} 流血破甲：「${otherItem.name}」（耐久 ${otherItem.durability} > ${newDurability}）复生了！` },
      });
    } else {
      patch[otherSlotId] = null as unknown as EquipmentItem;
      effects.push({ event: 'equipment:clearSlotWithPromote', payload: { slotId: otherSlotId } });
      effects.push({
        event: 'equipment:destroyed',
        payload: { slotId: otherSlotId, cardId: card.id },
      });
      effects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${slotItem.name} 流血破甲：破坏了「${otherItem.name}」（耐久 ${otherItem.durability} > ${newDurability}）！` },
      });
      // Skeleton re-revive on self when other destroyed
      if (slotItem.skeletonReRevive && (!slotItem.hasRevive || slotItem.reviveUsed)) {
        updatedItem = { ...updatedItem, hasRevive: true, reviveUsed: false };
        effects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 亡骨轮回：获得了「复生」！` },
        });
        effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 亡骨轮回！` } });
      }
    }
    effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 流血破甲！高耐久装备被破坏！` } });
  }

  // Wraith rebirth — 50% chance to refill durability when at 1
  if (slotItem.monsterSpecial === 'wraith-rebirth' && newDurability === 1 && !slotItem.wraithRebirthUsed) {
    const [rebirthSuccess, rng2] = nextBool(rng);
    rng = rng2;
    if (rebirthSuccess) {
      const maxDur = slotItem.maxDurability ?? (slotItem.durability ?? 1);
      updatedItem = { ...updatedItem, durability: maxDur, wraithRebirthUsed: true };
      effects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${slotItem.name} 幽魂重生：耐久回满！（${maxDur}）` },
      });
      effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 幽魂重生！` } });
    } else {
      updatedItem = { ...updatedItem, wraithRebirthUsed: true };
      effects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${slotItem.name} 幽魂重生失败！（50%）` },
      });
    }
  }

  // Swarm elite — replace other slot with buglet
  if (slotItem.monsterSpecial === 'swarm-elite' && otherItem) {
    effects.push({
      event: 'equipment:destroyed',
      payload: { slotId: otherSlotId, cardId: otherItem.id },
    });
    const bugletEquip = applyAmplifyOnCreate(createBugletCard(), state.amplifiedCardBonus);
    const bugletAsEquip = { ...bugletEquip, durability: 1, maxDurability: 1 };
    patch[otherSlotId] = bugletAsEquip as EquipmentItem;
    effects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 虫母孵化：${otherItem.name} 被替换为小虫子！` },
    });
    effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 虫母孵化！` } });
  }

  // Golem layer loss reflect — damage random monster
  let golemReflectDamage: DurabilityLossResult['golemReflectDamage'];
  if (slotItem.golemLayerLossReflect && slotItem.golemLayerLossReflect > 0) {
    const maxDur = slotItem.maxDurability ?? (slotItem.durability ?? 1);
    const lostDur = maxDur - newDurability;
    if (lostDur > 0) {
      const reflectDmg = slotItem.golemLayerLossReflect * lostDur;
      const monsterTargets = flattenActiveRowSlots(state.activeCards).filter(
        (c): c is GameCardData => Boolean(c && c.type === 'monster'),
      );
      if (monsterTargets.length > 0) {
        const [target, rng3] = pickRandom(monsterTargets, rng);
        rng = rng3;
        golemReflectDamage = { targetId: target.id, damage: reflectDmg, slotId };
        effects.push({
          event: 'log:entry',
          payload: {
            type: 'equip',
            message: `${slotItem.name} 岩层反震：${slotItem.golemLayerLossReflect}×${lostDur} = ${reflectDmg} 点伤害，命中 ${target.name}！`,
          },
        });
        effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 岩层反震！${reflectDmg} 伤害！` } });
      }
    }
  }

  return { updatedItem, patch, sideEffects: effects, golemReflectDamage, rng };
}
