/**
 * Shop Domain — pure logic for shop offerings, purchases, and services.
 */

import type { GameCardData, CardType } from '@/components/GameCard';
import type { ShopOffering } from '@/components/ShopModal';
import type { GameState } from './types';
import {
  SHOP_MAX_OFFERINGS,
  SHOP_REQUIRED_TYPES,
  SHOP_TYPE_PRICES,
  SHOP_HEAL_COST,
  SHOP_HEAL_AMOUNT,
  SHOP_LEVEL_UP_COST,
  MAX_SHOP_LEVEL,
  SHOP_SKILL_DISCOVER_COST,
  INITIAL_HP,
} from './constants';
import { getShopPrice } from './helpers';

// ---------------------------------------------------------------------------
// Generate shop offerings
// ---------------------------------------------------------------------------

export function generateShopOfferingsPure(
  remainingDeck: GameCardData[],
  shopLevel: number,
): ShopOffering[] {
  const offerings: ShopOffering[] = [];
  const availableCards = [...remainingDeck];
  const maxSlots = SHOP_MAX_OFFERINGS + shopLevel;

  for (const requiredTypes of SHOP_REQUIRED_TYPES) {
    if (offerings.length >= maxSlots) break;

    const matchIndex = availableCards.findIndex(c =>
      requiredTypes.includes(c.type as CardType),
    );
    if (matchIndex >= 0) {
      const card = availableCards.splice(matchIndex, 1)[0];
      offerings.push({
        card,
        price: getShopPrice(card),
        sold: false,
      });
    }
  }

  while (offerings.length < maxSlots && availableCards.length > 0) {
    const idx = Math.floor(Math.random() * availableCards.length);
    const card = availableCards.splice(idx, 1)[0];
    offerings.push({
      card,
      price: getShopPrice(card),
      sold: false,
    });
  }

  return offerings;
}

// ---------------------------------------------------------------------------
// Purchase
// ---------------------------------------------------------------------------

export interface PurchaseResult {
  gold: number;
  remainingDeck: GameCardData[];
  shopOfferings: ShopOffering[];
  purchasedCard: GameCardData;
}

export function purchaseFromShopPure(
  state: GameState,
  offeringIndex: number,
): PurchaseResult | null {
  const offering = state.shopOfferings[offeringIndex];
  if (!offering || offering.sold) return null;
  if (state.gold < offering.price) return null;

  const newOfferings = state.shopOfferings.map((o, i) =>
    i === offeringIndex ? { ...o, sold: true } : o,
  );

  const newDeck = state.remainingDeck.filter(c => c.id !== offering.card.id);

  return {
    gold: state.gold - offering.price,
    remainingDeck: newDeck,
    shopOfferings: newOfferings,
    purchasedCard: offering.card,
  };
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

export function openShopPure(state: GameState): Partial<GameState> {
  const offerings = generateShopOfferingsPure(state.remainingDeck, state.shopLevel);
  return {
    shopOfferings: offerings,
    shopDeleteUsed: false,
    shopHealUsed: false,
    shopLevelUpUsed: false,
    shopSkillDiscoverUsed: false,
  };
}

export function closeShopPure(): Partial<GameState> {
  return {
    shopOfferings: [],
    shopSourceEvent: null,
  };
}
