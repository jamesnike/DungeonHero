/**
 * Events Domain — pure logic for event card resolution.
 *
 * Event resolution is complex and involves many side effects. This module
 * extracts the pure state-transition parts; async/interactive steps
 * (dice rolls, modal prompts) are orchestrated by the GameEngine.
 */

import type { GameCardData, EventEffectExpression, EventChoiceDefinition, EventRequirement } from '@/components/GameCard';
import type {
  ActiveRowSlots,
  EquipmentSlotId,
} from '@/components/game-board/types';
import type { GameState } from './types';
import { INITIAL_HP, FLIP_GOLD_REWARD, PERSUADE_COST, MIN_PERSUADE_COST } from './constants';
import { flattenActiveRowSlots } from './helpers';

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
// Apply individual effect tokens
// ---------------------------------------------------------------------------

export interface EffectResult {
  patch: Partial<GameState>;
  logs: Array<{ type: string; message: string }>;
  asyncActions: string[];
}

export function applySimpleEffect(
  state: GameState,
  effectToken: string,
): EffectResult {
  const logs: Array<{ type: string; message: string }> = [];
  const asyncActions: string[] = [];
  let patch: Partial<GameState> = {};

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
    const maxHp = INITIAL_HP + state.permanentMaxHpBonus;
    patch = { hp: Math.min(maxHp, state.hp + amount) };
    logs.push({ type: 'heal', message: `恢复 ${amount} 点生命` });
  } else if (effectToken.startsWith('hp-')) {
    const amount = parseInt(effectToken.replace('hp-', ''), 10) || 0;
    patch = { hp: Math.max(0, state.hp - amount) };
    logs.push({ type: 'damage', message: `受到 ${amount} 点伤害` });
    if (state.hp - amount <= 0) {
      patch.gameOver = true;
      patch.victory = false;
    }
  } else if (effectToken.startsWith('maxhpperm+')) {
    const amount = parseInt(effectToken.replace('maxhpperm+', ''), 10) || 0;
    patch = {
      permanentMaxHpBonus: state.permanentMaxHpBonus + amount,
      hp: state.hp + amount,
    };
    logs.push({ type: 'event', message: `永久最大生命 +${amount}` });
  } else if (effectToken.startsWith('shopLevel+')) {
    const amount = parseInt(effectToken.replace('shopLevel+', ''), 10) || 0;
    patch = { shopLevel: Math.min(3, state.shopLevel + amount) };
    logs.push({ type: 'event', message: `商店等级 +${amount}` });
  } else if (effectToken.startsWith('spellDamage+')) {
    const amount = parseInt(effectToken.replace('spellDamage+', ''), 10) || 0;
    patch = { permanentSpellDamageBonus: state.permanentSpellDamageBonus + amount };
    logs.push({ type: 'event', message: `永久法术伤害 +${amount}` });
  } else if (effectToken.startsWith('handLimit+')) {
    const amount = parseInt(effectToken.replace('handLimit+', ''), 10) || 0;
    patch = { handLimitBonus: (state.handLimitBonus ?? 0) + amount };
    logs.push({ type: 'event', message: `手牌上限 +${amount}` });
  } else if (effectToken.startsWith('backpackSize+')) {
    const amount = parseInt(effectToken.replace('backpackSize+', ''), 10) || 0;
    patch = { backpackCapacityModifier: state.backpackCapacityModifier + amount };
    logs.push({ type: 'event', message: `背包容量 +${amount}` });
  } else if (effectToken.startsWith('backpackSize-')) {
    const amount = parseInt(effectToken.replace('backpackSize-', ''), 10) || 0;
    patch = { backpackCapacityModifier: state.backpackCapacityModifier - amount };
    logs.push({ type: 'event', message: `背包容量 -${amount}` });
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
  } else if (effectToken.startsWith('handLimit-')) {
    const amount = parseInt(effectToken.replace('handLimit-', ''), 10) || 0;
    patch = { handLimitBonus: (state.handLimitBonus ?? 0) - amount };
    logs.push({ type: 'event', message: `手牌上限 -${amount}` });
  } else if (effectToken.startsWith('maxhpperm-')) {
    const amount = parseInt(effectToken.replace('maxhpperm-', ''), 10) || 0;
    const newMaxHp = INITIAL_HP + state.permanentMaxHpBonus - amount;
    patch = {
      permanentMaxHpBonus: state.permanentMaxHpBonus - amount,
      hp: Math.min(newMaxHp, state.hp),
    };
    logs.push({ type: 'event', message: `永久最大生命 -${amount}` });
  } else if (effectToken.startsWith('shopLevel-')) {
    const amount = parseInt(effectToken.replace('shopLevel-', ''), 10) || 0;
    patch = { shopLevel: Math.max(0, state.shopLevel - amount) };
    logs.push({ type: 'event', message: `商店等级 -${amount}` });
  } else if (effectToken.startsWith('persuadeLevel+')) {
    const amount = parseInt(effectToken.replace('persuadeLevel+', ''), 10) || 0;
    patch = { persuadeLevel: Math.min(4, state.persuadeLevel + amount) };
    logs.push({ type: 'event', message: `劝降等级 +${amount}` });
  } else if (effectToken.startsWith('persuadeLevel-')) {
    const amount = parseInt(effectToken.replace('persuadeLevel-', ''), 10) || 0;
    patch = { persuadeLevel: Math.max(1, state.persuadeLevel - amount) };
    logs.push({ type: 'event', message: `劝降等级 -${amount}` });
  } else if (effectToken.startsWith('stunCap+')) {
    const amount = parseInt(effectToken.replace('stunCap+', ''), 10) || 0;
    patch = { stunCap: Math.min(100, state.stunCap + amount) };
    logs.push({ type: 'event', message: `击晕上限 +${amount}%` });
  } else if (effectToken.startsWith('persuadeCost-')) {
    const amount = parseInt(effectToken.replace('persuadeCost-', ''), 10) || 0;
    const currentCost = PERSUADE_COST + (state.persuadeCostModifier ?? 0);
    if (currentCost <= MIN_PERSUADE_COST) {
      logs.push({ type: 'event', message: `劝降费用已达下限（${currentCost} 金币），无法再降低` });
    } else {
      const actualAmount = Math.min(amount, currentCost - MIN_PERSUADE_COST);
      patch = { persuadeCostModifier: (state.persuadeCostModifier ?? 0) - actualAmount };
      logs.push({ type: 'event', message: `劝降费用永久 -${actualAmount}` });
    }
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
  } else if (effectToken === 'discardHandAll') {
    patch = { handCards: [], discardedCards: [...state.discardedCards, ...state.handCards] };
    logs.push({ type: 'event', message: `弃回所有手牌` });
  } else {
    asyncActions.push(effectToken);
  }

  return { patch, logs, asyncActions };
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
