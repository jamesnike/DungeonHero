/**
 * Shop Domain — pure logic for shop offerings, purchases, and services.
 */

import type { GameCardData, CardType } from '@/components/GameCard';
import type { ShopOffering } from '@/components/ShopModal';
import type { GameState } from './types';
import type { EquipmentSlotBonusState, HeroSkillId, HeroSkillDefinition } from './types';
import type { RngState } from './rng';
import { nextInt, shuffle as rngShuffle } from './rng';
import { cloneClassCardWithFreshId } from './cardClone';
import { filterAvailableClassPool, isUniqueLocked, markUniqueAcquired } from './uniqueClass';
import { getStarterBaseId } from './deck';
import { applySlotArmorBonusDelta } from './equipment';
import { getEffectiveHandLimit } from './cards';
import { applyDerivedCardText } from './card-schema/card-text';
import {
  SHOP_MAX_OFFERINGS,
  SHOP_REQUIRED_TYPES,
  SHOP_TYPE_PRICES,
  SHOP_HEAL_COST,
  SHOP_HEAL_AMOUNT,
  SHOP_LEVEL_UP_COST,
  MAX_SHOP_LEVEL,
  SHOP_SKILL_DISCOVER_COST,
  SHOP_EQUIP_BOOST_COST,
  SHOP_REFRESH_COST,
  INITIAL_HP,
  BASE_BACKPACK_CAPACITY,
} from './constants';
import { getShopPrice } from './helpers';

// ---------------------------------------------------------------------------
// Generate shop offerings
// ---------------------------------------------------------------------------

/**
 * Re-derive a shop offering's display text from its registered formatter so
 * `description` / `shortDescription` / `magicEffect` always match the card's
 * current `upgradeLevel`. Acts as a defensive guard:
 *
 *   - Lv0 cards in classDeck (the vast majority) — formatter outputs the base
 *     text, identical to what `applyDerivedCardText` already produced at deck
 *     construction. No-op.
 *   - Pre-upgraded templates in classDeck (currently only knight-deck Lv1
 *     魔法飞弹 with `upgradeLevel: 1`) — formatter outputs the Lv1 text,
 *     matching what the player will actually receive on purchase.
 *   - Any future "pre-upgraded" classDeck entry — same pattern; no shop-side
 *     special-casing or hardcoded ids required.
 *
 * If a classDeck card's `description` ever drifts from its `upgradeLevel`
 * (stale data, partial mutation), this normalization step fixes the shop
 * display without changing the underlying classDeck template.
 *
 * Cards without a registered formatter (`computeCardText` → null) are returned
 * unchanged — for those, whatever literal description was authored in the
 * deck file stands.
 */
function normalizeOfferingCard(card: GameCardData): GameCardData {
  return applyDerivedCardText(card);
}

export function generateShopOfferingsPure(
  classDeck: GameCardData[],
  shopLevel: number,
  rng: RngState,
): [ShopOffering[], RngState] {
  const offerings: ShopOffering[] = [];
  // Shuffle the class deck so the "required-types" pass below picks a *random*
  // representative of each guaranteed type, not the first matching card in
  // deterministic deck order. Without this, every shop visit (and every
  // refresh) showed the same first weapon / shield / magic / amulet because
  // `findIndex` is RNG-free and `classDeck` is an immutable infinite template
  // whose order never changes across visits.
  const [availableCards, rngAfterShuffle] = rngShuffle(classDeck, rng);
  const maxSlots = SHOP_MAX_OFFERINGS + shopLevel;
  let r = rngAfterShuffle;

  for (const requiredTypes of SHOP_REQUIRED_TYPES) {
    if (offerings.length >= maxSlots) break;

    const matchIndex = availableCards.findIndex(c =>
      requiredTypes.includes(c.type as CardType),
    );
    if (matchIndex >= 0) {
      const card = availableCards.splice(matchIndex, 1)[0];
      offerings.push({
        card: normalizeOfferingCard(card),
        price: getShopPrice(card),
        sold: false,
      });
    }
  }

  while (offerings.length < maxSlots && availableCards.length > 0) {
    const [idx, r1] = nextInt(r, 0, availableCards.length - 1);
    r = r1;
    const card = availableCards.splice(idx, 1)[0];
    offerings.push({
      card: normalizeOfferingCard(card),
      price: getShopPrice(card),
      sold: false,
    });
  }

  return [offerings, r];
}

// ---------------------------------------------------------------------------
// Purchase
// ---------------------------------------------------------------------------

export interface PurchaseResult {
  gold: number;
  /**
   * Where the bought card landed. `'hand'` when there is room under the
   * effective hand limit; otherwise `'backpack'` when there is room under the
   * backpack capacity. (If both are full, `purchaseFromShopPure` returns
   * `null` — the gate in `useShopHandlers.handleShopPurchase` and the
   * `canBuy` check in `ShopModal` make this unreachable in normal flow.)
   */
  destination: 'hand' | 'backpack';
  handCards: GameCardData[];
  backpackItems: GameCardData[];
  shopOfferings: ShopOffering[];
  purchasedCard: GameCardData;
  rng: RngState;
  acquiredUniqueClassCardIds?: string[];
}

/**
 * Buy a card from the shop. The class deck is an infinite template, so
 * the bought card is *cloned* with a fresh id and placed into the player's
 * pile; `state.classDeck` is unchanged. The shop slot is marked `sold` to
 * prevent re-purchase of the same offering instance.
 *
 * Destination routing: the cloned card lands in **hand first** (subject to
 * `getEffectiveHandLimit`) and falls back to the **backpack** when the hand
 * is full. If both are full, returns `null` (purchase blocked) — mirrors the
 * existing 'hand-first' delivery used by `RESOLVE_DISCOVER_SELECTION`.
 *
 * Unique-locked offerings (already acquired earlier this run via discover /
 * draws / events) are non-purchasable: returns null. The offering itself is
 * left visible so the player can see *why* it's unavailable; the UI is
 * responsible for rendering the lock badge.
 */
export function purchaseFromShopPure(
  state: GameState,
  cardId: string,
): PurchaseResult | null {
  const offeringIndex = state.shopOfferings.findIndex(o => o.card.id === cardId);
  const offering = state.shopOfferings[offeringIndex];
  if (!offering || offering.sold) return null;
  if (state.gold < offering.price) return null;

  // Unique-lock guard: an offering whose base id was already acquired this run
  // cannot be re-purchased even if the shop slot is still on display.
  const acquiredSet = new Set(state.acquiredUniqueClassCardIds ?? []);
  if (isUniqueLocked(offering.card, acquiredSet)) return null;

  const handHasRoom = state.handCards.length < getEffectiveHandLimit(state);
  const backpackCap = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier);
  const backpackHasRoom = state.backpackItems.length < backpackCap;
  if (!handHasRoom && !backpackHasRoom) return null;

  const [purchasedCard, nextRng] = cloneClassCardWithFreshId(offering.card, state.rng);
  const newOfferings = state.shopOfferings.map((o, i) =>
    i === offeringIndex ? { ...o, sold: true } : o,
  );

  const destination: 'hand' | 'backpack' = handHasRoom ? 'hand' : 'backpack';
  const result: PurchaseResult = {
    gold: state.gold - offering.price,
    destination,
    handCards: destination === 'hand'
      ? [...state.handCards, purchasedCard]
      : state.handCards,
    backpackItems: destination === 'backpack'
      ? [purchasedCard, ...state.backpackItems]
      : state.backpackItems,
    shopOfferings: newOfferings,
    purchasedCard,
    rng: nextRng,
  };

  // If this purchase grants a unique-tagged card, record its base id so all
  // future class-pool sampling paths exclude it (and any other shop offerings
  // displaying the same base id become non-purchasable).
  if (purchasedCard.unique === true) {
    const baseId = getStarterBaseId(purchasedCard.id);
    const existing = state.acquiredUniqueClassCardIds ?? [];
    if (!existing.includes(baseId)) {
      result.acquiredUniqueClassCardIds = [...existing, baseId];
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Shop services
// ---------------------------------------------------------------------------

export function shopHealPure(state: GameState): Partial<GameState> | null {
  if (state.gold < SHOP_HEAL_COST || state.shopHealUsed) return null;
  const maxHp = INITIAL_HP + state.permanentMaxHpBonus;
  return {
    gold: state.gold - SHOP_HEAL_COST,
    hp: Math.min(maxHp, state.hp + SHOP_HEAL_AMOUNT),
    shopHealUsed: true,
  };
}

export function shopLevelUpPure(state: GameState): Partial<GameState> | null {
  if (state.gold < SHOP_LEVEL_UP_COST || state.shopLevel >= MAX_SHOP_LEVEL || state.shopLevelUpUsed) return null;
  return {
    gold: state.gold - SHOP_LEVEL_UP_COST,
    shopLevel: state.shopLevel + 1,
    shopLevelUpUsed: true,
  };
}

export function shopDeletePure(state: GameState): Partial<GameState> | null {
  if (state.shopDeleteUsed) return null;
  return { shopDeleteUsed: true };
}

export function shopSkillDiscoverPure(state: GameState): Partial<GameState> | null {
  if (state.gold < SHOP_SKILL_DISCOVER_COST || state.shopSkillDiscoverUsed) return null;
  return {
    gold: state.gold - SHOP_SKILL_DISCOVER_COST,
    shopSkillDiscoverUsed: true,
  };
}

// ---------------------------------------------------------------------------
// Shop open / close
// ---------------------------------------------------------------------------

export function openShopPure(state: GameState, rng: RngState): [Partial<GameState>, RngState] {
  const availableClassPool = filterAvailableClassPool(state.classDeck, state);
  const [offerings, nextRng] = generateShopOfferingsPure(availableClassPool, state.shopLevel, rng);
  return [{
    shopOfferings: offerings,
    shopDeleteUsed: false,
    shopHealUsed: false,
    shopLevelUpUsed: false,
    shopSkillDiscoverUsed: false,
    shopEquipAttackUsed: false,
    shopEquipArmorUsed: false,
    shopRefreshUsed: false,
  }, nextRng];
}

export function shopRefreshPure(
  state: GameState,
  rng: RngState,
): [Partial<GameState>, RngState] | null {
  if (state.shopRefreshUsed || state.gold < SHOP_REFRESH_COST) return null;
  const availableClassPool = filterAvailableClassPool(state.classDeck, state);
  const [offerings, nextRng] = generateShopOfferingsPure(availableClassPool, state.shopLevel, rng);
  return [{
    gold: state.gold - SHOP_REFRESH_COST,
    shopOfferings: offerings,
    shopRefreshUsed: true,
    shopDeleteUsed: false,
    shopHealUsed: false,
    shopLevelUpUsed: false,
    shopSkillDiscoverUsed: false,
    shopEquipAttackUsed: false,
    shopEquipArmorUsed: false,
    shopSkillOptions: [],
    shopSkillSelectOpen: false,
  }, nextRng];
}

export function closeShopPure(): Partial<GameState> {
  return {
    shopOfferings: [],
    shopSourceEvent: null,
    shopModalOpen: false,
    shopModalMinimized: false,
    deleteModalOpen: false,
    cardActionContext: null,
  };
}

// ---------------------------------------------------------------------------
// Equipment boost
// ---------------------------------------------------------------------------

export function shopEquipBoostPure(
  state: GameState,
  boostType: 'attack' | 'armor',
): Partial<GameState> | null {
  if (state.gold < SHOP_EQUIP_BOOST_COST) return null;

  const bonusKey: keyof EquipmentSlotBonusState['equipmentSlot1'] =
    boostType === 'attack' ? 'damage' : 'shield';

  const newBonuses: EquipmentSlotBonusState = {
    equipmentSlot1: {
      ...state.equipmentSlotBonuses.equipmentSlot1,
      [bonusKey]: state.equipmentSlotBonuses.equipmentSlot1[bonusKey] + 1,
    },
    equipmentSlot2: {
      ...state.equipmentSlotBonuses.equipmentSlot2,
      [bonusKey]: state.equipmentSlotBonuses.equipmentSlot2[bonusKey] + 1,
    },
  };

  const label = boostType === 'attack' ? '攻击' : '护甲';

  const patch: Partial<GameState> = {
    gold: state.gold - SHOP_EQUIP_BOOST_COST,
    equipmentSlotBonuses: newBonuses,
    heroSkillBanner: `花费 ${SHOP_EQUIP_BOOST_COST} 金币，所有装备栏永久${label} +1！`,
  };

  // Per shield-armor-vs-durability rule: any modification to
  // equipmentSlotBonuses[slotId].shield must immediately refill the slot's
  // armor to the new cap, otherwise stacked purchases would only raise the
  // cap without raising current armor (player sees "+1 added but didn't help").
  if (boostType === 'armor') {
    applySlotArmorBonusDelta(state, 'equipmentSlot1', 1, patch);
    applySlotArmorBonusDelta(state, 'equipmentSlot2', 1, patch);
  }

  return patch;
}

// ---------------------------------------------------------------------------
// Skill selection — applies numeric stat bonuses from a chosen hero skill
// ---------------------------------------------------------------------------

import { getHeroSkillById } from '@/lib/heroSkills';

export interface ShopSelectSkillResult {
  patch: Partial<GameState>;
  asyncOps: ShopSkillAsyncOp[];
}

export type ShopSkillAsyncOp =
  | { kind: 'classDraw'; count: number }
  | { kind: 'handDraw'; count: number }
  | { kind: 'addCard'; cardKey: string };

export function shopSelectSkillPure(
  state: GameState,
  skillId: string,
): ShopSelectSkillResult {
  const skillDef = getHeroSkillById(skillId as HeroSkillId);
  const patch: Partial<GameState> = {
    extraHeroSkills: [...state.extraHeroSkills, skillId as HeroSkillId],
    shopSkillSelectOpen: false,
    shopSkillOptions: [],
    heroSkillBanner: `学习了「${skillDef?.name ?? skillId}」！`,
  };
  const asyncOps: ShopSkillAsyncOp[] = [];

  if (!skillDef) return { patch, asyncOps };

  if (skillDef.initialMaxHpBonus) {
    patch.permanentMaxHpBonus = state.permanentMaxHpBonus + skillDef.initialMaxHpBonus;
    patch.hp = state.hp + skillDef.initialMaxHpBonus;
  }
  if (skillDef.initialGoldBonus) {
    patch.gold = (patch.gold ?? state.gold) + skillDef.initialGoldBonus;
  }
  if (skillDef.initialWaterfallBonus) {
    patch.turnCount = state.turnCount + skillDef.initialWaterfallBonus;
  }
  if (skillDef.initialShopLevel != null && skillDef.initialShopLevel > 0) {
    patch.shopLevel = Math.min(MAX_SHOP_LEVEL, Math.max(state.shopLevel, skillDef.initialShopLevel));
  }
  if (skillDef.initialBackpackCapacityBonus) {
    patch.backpackCapacityModifier = state.backpackCapacityModifier + skillDef.initialBackpackCapacityBonus;
  }
  if (skillDef.initialHandLimitBonus) {
    patch.handLimitBonus = state.handLimitBonus + skillDef.initialHandLimitBonus;
  }
  if (skillDef.initialSpellDamageBonus) {
    patch.permanentSpellDamageBonus = state.permanentSpellDamageBonus + skillDef.initialSpellDamageBonus;
  }
  if (skillDef.initialClassCardDraw) {
    asyncOps.push({ kind: 'classDraw', count: skillDef.initialClassCardDraw });
  }
  if (skillDef.initialHandDraw) {
    asyncOps.push({ kind: 'handDraw', count: skillDef.initialHandDraw });
  }
  if (skillId === 'summon-minion') {
    asyncOps.push({ kind: 'addCard', cardKey: 'summon-minion' });
  }
  if (skillId === 'heal-to-damage') {
    asyncOps.push({ kind: 'addCard', cardKey: 'heal-to-damage' });
  }

  return { patch, asyncOps };
}

// ---------------------------------------------------------------------------
// Monster rewards — pure branches
// ---------------------------------------------------------------------------

const PURE_REWARD_TYPES = new Set([
  'gold', 'maxHp', 'spellDamage', 'spellLifesteal', 'stunCap',
  'backpackCapacity', 'persuadeRateBonus', 'upgradeCard',
]);

export function isPureMonsterReward(rewardType: string): boolean {
  return PURE_REWARD_TYPES.has(rewardType);
}

export function applyMonsterRewardPure(
  state: GameState,
  rewardType: string,
  amount?: number,
  opts?: { slotId?: string; bonusType?: 'damage' | 'shield' },
  rng?: RngState,
): { patch: Partial<GameState>; logMessage: string; rng?: RngState } | null {
  switch (rewardType) {
    case 'gold':
      return {
        patch: { gold: state.gold + (amount ?? 0), heroSkillBanner: `获得 ${amount ?? 0} 金币。` },
        logMessage: `战利品：获得 ${amount ?? 0} 金币`,
      };
    case 'maxHp':
      return {
        patch: {
          permanentMaxHpBonus: state.permanentMaxHpBonus + (amount ?? 0),
          heroSkillBanner: `最大生命永久 +${amount ?? 0}`,
        },
        logMessage: `战利品：最大生命永久 +${amount ?? 0}`,
      };
    case 'spellDamage':
      return {
        patch: {
          permanentSpellDamageBonus: state.permanentSpellDamageBonus + (amount ?? 0),
          heroSkillBanner: `法术伤害永久 +${amount ?? 0}`,
        },
        logMessage: `战利品：法术伤害永久 +${amount ?? 0}`,
      };
    case 'spellLifesteal':
      return {
        patch: {
          permanentSpellLifesteal: state.permanentSpellLifesteal + (amount ?? 0),
          heroSkillBanner: `超杀吸血永久 +${amount ?? 0}`,
        },
        logMessage: `战利品：超杀吸血永久 +${amount ?? 0}`,
      };
    case 'stunCap':
      return {
        patch: {
          stunCap: Math.min(100, state.stunCap + (amount ?? 0)),
          heroSkillBanner: `击晕上限 +${amount ?? 0}%`,
        },
        logMessage: `战利品：击晕上限 +${amount ?? 0}%`,
      };
    case 'backpackCapacity':
      return {
        patch: {
          backpackCapacityModifier: state.backpackCapacityModifier + (amount ?? 0),
          heroSkillBanner: `背包上限永久 +${amount ?? 0}`,
        },
        logMessage: `战利品：背包上限永久 +${amount ?? 0}`,
      };
    case 'persuadeRateBonus':
      return {
        patch: {
          permanentPersuadeBonus: (state.permanentPersuadeBonus ?? 0) + (amount ?? 0),
          heroSkillBanner: `劝降成功率永久 +${amount ?? 0}%`,
        },
        logMessage: `战利品：劝降成功率永久 +${amount ?? 0}%`,
      };
    case 'upgradeCard':
      // 不直接 patch.upgradeModalOpen=true：同一击杀的 spell（淬炼冲击 / overkill-upgrade）
      // 或 amulet（虫蜕之冠 / monster-kill-upgrade）可能已经 enqueue 了
      // ENQUEUE_PENDING_UPGRADE_MODAL，两个 upgradeModalOpen 会合并成一次升级
      // 机会，玩家少一次升级。
      // 改走 pendingUpgradeModalOpens 队列后，'upgradeCard' reward 也只是 push 一条
      // pending 请求，由 CHECK_PENDING_UPGRADE_MODAL 在合适时机依次弹出。
      // 见 `pendingUpgradeModalOpens` 字段 JSDoc。
      return {
        patch: {
          pendingUpgradeModalOpens: [
            ...state.pendingUpgradeModalOpens,
            { banner: '选择一张牌进行升级。' },
          ],
          heroSkillBanner: '选择一张牌进行升级。',
        },
        logMessage: '战利品：选择一张牌升级',
      };
    case 'slotBonus': {
      const slotId = (opts?.slotId ?? 'equipmentSlot1') as 'equipmentSlot1' | 'equipmentSlot2';
      const bonusType = opts?.bonusType ?? 'damage';
      const val = amount ?? 1;
      const slotLabel = slotId === 'equipmentSlot1' ? '左' : '右';
      const bonusLabel = bonusType === 'damage' ? '攻击' : '护甲';
      const newBonuses = {
        ...state.equipmentSlotBonuses,
        [slotId]: {
          ...state.equipmentSlotBonuses[slotId],
          [bonusType]: (state.equipmentSlotBonuses[slotId]?.[bonusType] ?? 0) + val,
        },
      };
      const patch: Partial<GameState> = {
        equipmentSlotBonuses: newBonuses as typeof state.equipmentSlotBonuses,
        heroSkillBanner: `${slotLabel}槽永久${bonusLabel} +${val}`,
      };
      if (bonusType === 'shield' && val !== 0) {
        applySlotArmorBonusDelta(state, slotId, val, patch);
      }
      return {
        patch,
        logMessage: `战利品：${slotLabel}槽永久${bonusLabel} +${val}`,
      };
    }
    case 'heal': {
      const healAmount = amount ?? 0;
      const maxHp = INITIAL_HP + state.permanentMaxHpBonus;
      const newHp = Math.min(maxHp, state.hp + healAmount);
      const actualHeal = newHp - state.hp;
      return {
        patch: {
          hp: newHp,
          heroSkillBanner: actualHeal > 0 ? `回复 ${actualHeal} 点生命。` : '生命已满，治疗溢出。',
        },
        logMessage: `战利品：回复 ${actualHeal} 点生命`,
      };
    }
    case 'drawBackpack': {
      const drawCount = amount ?? 1;
      const available = state.backpackItems;
      if (available.length === 0) {
        return {
          patch: { heroSkillBanner: '无法抽牌：背包为空。' },
          logMessage: '战利品：背包为空，无法抽牌',
          rng,
        };
      }
      const [shuffled, nextRng] = rng
        ? rngShuffle(available, rng)
        : [[...available].sort(() => 0.5 - 0.5), undefined] as [GameCardData[], undefined];
      const drawn = shuffled.slice(0, Math.min(drawCount, available.length));
      const drawnIds = new Set(drawn.map(c => c.id));
      return {
        patch: {
          handCards: [...state.handCards, ...drawn],
          backpackItems: available.filter(c => !drawnIds.has(c.id)),
          heroSkillBanner: `从背包抽出了 ${drawn.length} 张牌。`,
        },
        logMessage: `战利品：从背包抽出 ${drawn.length} 张牌`,
        rng: nextRng,
      };
    }
    default:
      return null;
  }
}
