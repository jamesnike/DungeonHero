/**
 * Shop Domain — pure logic for shop offerings, purchases, and services.
 */

import type { GameCardData, CardType } from '@/components/GameCard';
import type { ShopOffering } from '@/components/ShopModal';
import type { GameState } from './types';
import type { EquipmentSlotBonusState, HeroSkillId, HeroSkillDefinition } from './types';
import type { RngState } from './rng';
import { nextInt, shuffle as rngShuffle } from './rng';
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
  INITIAL_HP,
} from './constants';
import { getShopPrice } from './helpers';

// ---------------------------------------------------------------------------
// Generate shop offerings
// ---------------------------------------------------------------------------

export function generateShopOfferingsPure(
  classDeck: GameCardData[],
  shopLevel: number,
  rng: RngState,
): [ShopOffering[], RngState] {
  const offerings: ShopOffering[] = [];
  const availableCards = [...classDeck];
  const maxSlots = SHOP_MAX_OFFERINGS + shopLevel;
  let r = rng;

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
    const [idx, r1] = nextInt(r, 0, availableCards.length - 1);
    r = r1;
    const card = availableCards.splice(idx, 1)[0];
    offerings.push({
      card,
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
  classDeck: GameCardData[];
  backpackItems: GameCardData[];
  shopOfferings: ShopOffering[];
  purchasedCard: GameCardData;
}

export function purchaseFromShopPure(
  state: GameState,
  cardId: string,
): PurchaseResult | null {
  const offeringIndex = state.shopOfferings.findIndex(o => o.card.id === cardId);
  const offering = state.shopOfferings[offeringIndex];
  if (!offering || offering.sold) return null;
  if (state.gold < offering.price) return null;

  const purchasedCard = { ...offering.card };
  const newOfferings = state.shopOfferings.map((o, i) =>
    i === offeringIndex ? { ...o, sold: true } : o,
  );
  const newClassDeck = state.classDeck.filter(c => c.id !== cardId);

  return {
    gold: state.gold - offering.price,
    classDeck: newClassDeck,
    backpackItems: [purchasedCard, ...state.backpackItems],
    shopOfferings: newOfferings,
    purchasedCard,
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

export function openShopPure(state: GameState, rng: RngState): [Partial<GameState>, RngState] {
  const [offerings, nextRng] = generateShopOfferingsPure(state.classDeck, state.shopLevel, rng);
  return [{
    shopOfferings: offerings,
    shopDeleteUsed: false,
    shopHealUsed: false,
    shopLevelUpUsed: false,
    shopSkillDiscoverUsed: false,
    shopEquipAttackUsed: false,
    shopEquipArmorUsed: false,
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
  const usedFlag = boostType === 'attack' ? 'shopEquipAttackUsed' : 'shopEquipArmorUsed';
  if (state[usedFlag] || state.gold < SHOP_EQUIP_BOOST_COST) return null;

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

  return {
    gold: state.gold - SHOP_EQUIP_BOOST_COST,
    equipmentSlotBonuses: newBonuses,
    [usedFlag]: true,
    heroSkillBanner: `花费 ${SHOP_EQUIP_BOOST_COST} 金币，所有装备栏永久${label} +1！`,
  };
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
      return {
        patch: {
          upgradeModalOpen: true,
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
      return {
        patch: {
          equipmentSlotBonuses: newBonuses as typeof state.equipmentSlotBonuses,
          heroSkillBanner: `${slotLabel}槽永久${bonusLabel} +${val}`,
        },
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
