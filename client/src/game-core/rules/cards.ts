/**
 * Card Rules — handles card-related actions in the reducer.
 *
 * Covers: PLAY_CARD, DRAW_CARDS, DISCARD_CARD.
 *
 * PLAY_CARD routes by card type: weapon/shield → EQUIP_CARD sub-action,
 * potion → RESOLVE_POTION, magic/hero-magic → RESOLVE_MAGIC.
 * Complex resolution logic for each sub-type is emitted as side effects
 * for the UI layer during the migration period.
 *
 * Delegates to existing pure functions in ../cards.ts.
 */

import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ReduceResult, SideEffect } from '../reducer';
import { applyPatch, noChange } from '../reducer';
import type { GameCardData } from '@/components/GameCard';
import type { EquipmentSlotId, EquipmentItem, AmuletItem, ActiveRowSlots } from '@/components/game-board/types';
import {
  drawFromBackpackToHandPure,
  drawMultipleFromBackpack,
  drawFromDeck,
  addCardToHand,
  addToGraveyardPure,
  addToRecycleBag,
  addCardToBackpackPure,
  processRecycleBag,
  resetMonsterForGraveyard,
} from '../cards';
import { isPermRecycleEquipment, cardHasPermFlag } from '@/components/GameCard';
import { flattenActiveRowSlots, isDamageableTarget, sanitizeCardMetadata, computeAmuletAuraReversal, isRecyclableFromHand, getCardPlayCategory, logHeroMagic, applyAmplifyToCard } from '../helpers';
import { hasEternalRelic } from '@/lib/eternalRelics';
import { computeAmuletEffects, getEquipmentInSlot, getEquipmentSlots, getReserve, setSlotBonusPure, repairDurabilityPure } from '../equipment';
import { computeEquipmentDisplacementLastWords } from './equipment-effects';
import { PERSUADE_COST, MIN_PERSUADE_COST, INITIAL_HP, BASE_BACKPACK_CAPACITY, FLIP_GOLD_REWARD, HAND_LIMIT } from '../constants';
import type { RngState } from '../rng';
import { nextInt, pickRandom, nextBool, shuffle as rngShuffle, nextId } from '../rng';
import { resolveAllMagicEffects, resolvePendingMagic, getSpellDamage, computeMaxHp } from './magic-effects';
import { resolveAllPotionEffects, resolvePendingPotion } from './potion-effects';
import { executeCardEffects, executeMagicCardEffects, executeOnEquip, executeOnEnterHand } from '../card-schema';
import { getHeroMagicDefinition } from '@/lib/heroMagic';
import type { HeroMagicId } from '@/components/GameCard';
import type { MirrorCopySelection, AmplifySelection } from '../types';
import { skillScrollImage } from '../deck';

export function reduceCardActions(state: GameState, action: GameAction): ReduceResult | null {
  switch (action.type) {
    case 'PLAY_CARD':
      return reducePlayCard(state, action);
    case 'DRAW_CARDS':
      return reduceDrawCards(state, action);
    case 'DISCARD_CARD':
      return reduceDiscardCard(state, action);
    case 'ADD_TO_GRAVEYARD':
      return reduceAddToGraveyard(state, action);
    case 'ADD_TO_RECYCLE_BAG':
      return reduceAddToRecycleBag(state, action);
    case 'ADD_TO_BACKPACK':
      return reduceAddToBackpack(state, action);
    case 'DRAW_FROM_BACKPACK':
      return reduceDrawFromBackpack(state, action);
    case 'EQUIP_CARD':
      return reduceEquipCard(state, action);
    case 'RESOLVE_POTION':
      return reduceResolvePotion(state, action);
    case 'RESOLVE_MAGIC':
      return reduceResolveMagic(state, action);
    case 'FINALIZE_CARD_PLAY':
      return reduceFinalizeCardPlay(state, action);
    case 'FINALIZE_MAGIC_CARD':
      return reduceFinalizeMagicCard(state, action);
    case 'FINALIZE_POTION_CARD':
      return reduceFinalizePotionCard(state, action);
    case 'GOBLIN_TRICK_DELIVER':
      return reduceGoblinTrickDeliver(state, action);
    case 'DELETE_CARD':
      return reduceDeleteCard(state, action);
    case 'CONVERT_AMULETS_TO_GOLD':
      return reduceConvertAmuletsToGold(state, action);
    case 'DRAW_CLASS_TO_BACKPACK':
      return reduceDrawClassToBackpack(state, action);
    case 'APPLY_DISCARD_EFFECTS':
      return reduceApplyDiscardEffects(state, action);
    case 'APPLY_CARD_FLIP':
      return reduceApplyCardFlip(state, action);
    case 'DISPOSE_EQUIPMENT_CARD':
      return reduceDisposeEquipmentCard(state, action);
    case 'DISCARD_OWNED_CARD':
      return reduceDiscardOwnedCard(state, action);
    case 'TICK_RECYCLE_FORGE':
      return reduceTickRecycleForge(state);
    case 'RESTORE_RECYCLE_BAG':
      return reduceRestoreRecycleBag(state);
    case 'RESOLVE_POTION_REPAIR':
      return reduceResolvePotionRepair(state, action);
    case 'RETURN_EQUIPMENT_TO_HAND':
      return reduceReturnEquipmentToHand(state, action);
    case 'RESOLVE_MIRROR_COPY':
      return reduceResolveMirrorCopy(state, action);
    case 'CANCEL_MIRROR_COPY':
      return reduceCancelMirrorCopy(state);
    case 'RESOLVE_AMPLIFY':
      return reduceResolveAmplify(state, action);
    case 'CANCEL_AMPLIFY':
      return reduceCancelAmplify(state);
    case 'AMPLIFY_CARDS_BY_NAME':
      return reduceAmplifyCardsByName(state, action);
    case 'RESOLVE_PERM_GRANT':
      return reduceResolvePermGrant(state, action);
    case 'CANCEL_PERM_GRANT':
      return reduceCancelPermGrant(state);
    case 'APPLY_TRANSFORM_CATEGORY':
      return reduceApplyTransformCategory(state, action);
    case 'RESOLVE_DECK_JUDGE':
      return reduceResolveDeckJudge(state, action);
    case 'RESOLVE_FATE_SIGHT':
      return reduceResolveFateSight(state, action);
    case 'RESOLVE_STAT_SWAP':
      return reduceResolveStatSwap(state, action);
    case 'PROCESS_HERO_MAGIC_CARD':
      return reduceProcessHeroMagicCard(state, action);
    case 'APPLY_BERSERKER_RAGE':
      return reduceApplyBerserkerRage(state, action);
    case 'TRIGGER_GRAVE_NOVA':
      return reduceTriggerGraveNova(state, action);
    case 'RESOLVE_REPAIR_ENRAGE_DICE':
      return reduceResolveRepairEnrageDice(state, action);
    case 'TRIGGER_ON_ENTER_HAND':
      return reduceTriggerOnEnterHand(state, action);
    case 'RESOLVE_EQUIPMENT_CHOICE':
    case 'RESOLVE_MAGIC_CHOICE': {
      const pendingMagicResult = resolvePendingMagic(state, action);
      if (pendingMagicResult) return pendingMagicResult;
      const pendingPotionResult = resolvePendingPotion(state, action);
      if (pendingPotionResult) return pendingPotionResult;
      return null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// PLAY_CARD
// ---------------------------------------------------------------------------

function reducePlayCard(
  state: GameState,
  action: Extract<GameAction, { type: 'PLAY_CARD' }>,
): ReduceResult {
  const card = (state.handCards as GameCardData[]).find(c => c.id === action.cardId);
  if (!card) return noChange(state);

  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};
  const enqueuedActions: GameAction[] = [];

  // Remove card from hand
  const handArr = state.handCards as GameCardData[];
  const flankIdx = handArr.findIndex(c => c.id === card.id);
  const isFlank = flankIdx === 0 || flankIdx === handArr.length - 1;
  patch.handCards = handArr.filter(c => c.id !== card.id) as GameCardData[];

  // Flank effects
  if (isFlank && card.flankDraw) {
    enqueuedActions.push({ type: 'DRAW_FROM_BACKPACK', count: card.flankDraw });
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'magic', message: `侧击效果：${card.name} 抽取 ${card.flankDraw} 张牌` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `侧击！${card.name} 抽取了 ${card.flankDraw} 张牌。` } });
  }

  if (isFlank && card.flankEffectId) {
    if (card.flankEffectId.startsWith('persuadeCost-')) {
      const amount = parseInt(card.flankEffectId.replace('persuadeCost-', ''), 10) || 1;
      const currentMod = state.persuadeCostModifier ?? 0;
      const currentCost = PERSUADE_COST + currentMod;
      if (currentCost <= MIN_PERSUADE_COST) {
        sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: `劝降费用已达下限（${currentCost} 金币），无法再降低` } });
      } else {
        const actualAmount = Math.min(amount, currentCost - MIN_PERSUADE_COST);
        patch.persuadeCostModifier = currentMod - actualAmount;
        sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: `侧击效果：${card.name} 劝降费用永久 -${actualAmount}` } });
        sideEffects.push({ event: 'ui:banner', payload: { text: `侧击！${card.name} 劝降费用永久 -${actualAmount}！` } });
      }
    } else if (card.flankEffectId.startsWith('stunCap+')) {
      const amount = parseInt(card.flankEffectId.replace('stunCap+', ''), 10) || 5;
      patch.stunCap = Math.min(100, state.stunCap + amount);
      sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: `侧击效果：${card.name} 击晕上限 +${amount}%` } });
      sideEffects.push({ event: 'ui:banner', payload: { text: `侧击！${card.name} 击晕上限 +${amount}%！` } });
    } else if (card.flankEffectId.startsWith('damage:')) {
      const amount = parseInt(card.flankEffectId.replace('damage:', ''), 10) || 5;
      const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
      if (monsters.length > 0) {
        const [target, nextRng] = pickRandom(monsters, state.rng);
        patch.rng = nextRng;
        enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: target.id, damage: amount, source: 'flank-damage' });
        sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: `侧击效果：${card.name} 对 ${target.name} 造成 ${amount} 点伤害` } });
        sideEffects.push({ event: 'ui:banner', payload: { text: `侧击！${card.name} 对 ${target.name} 造成了 ${amount} 点伤害！` } });
      }
    }
  }

  // Route by card type
  if (card.type === 'weapon' || card.type === 'shield') {
    // Pick a target slot, respecting per-slot capacity (main + reserve).
    // Preference order:
    //   1. A slot with a truly empty main → drop straight in.
    //   2. A slot that still has reserve capacity → push current main to reserve,
    //      new card becomes the main item.
    //   3. Both slots full → displace the oldest item (reserve[0] if any, else
    //      the current main) of slot1 by default; new card becomes the main item.
    //      Displaced item is treated as destroyed (last-words fire, salvage runs,
    //      revive does NOT trigger).
    const cap1 = state.equipmentSlotCapacity.equipmentSlot1 ?? 1;
    const cap2 = state.equipmentSlotCapacity.equipmentSlot2 ?? 1;
    const total1 = (state.equipmentSlot1 ? 1 : 0) + state.equipmentSlot1Reserve.length;
    const total2 = (state.equipmentSlot2 ? 1 : 0) + state.equipmentSlot2Reserve.length;

    let targetSlot: EquipmentSlotId;
    let needsDisplace = false;
    if (!state.equipmentSlot1) {
      targetSlot = 'equipmentSlot1';
    } else if (!state.equipmentSlot2) {
      targetSlot = 'equipmentSlot2';
    } else if (total1 < cap1) {
      targetSlot = 'equipmentSlot1';
    } else if (total2 < cap2) {
      targetSlot = 'equipmentSlot2';
    } else {
      targetSlot = 'equipmentSlot1';
      needsDisplace = true;
    }

    const reserveKey = targetSlot === 'equipmentSlot1' ? 'equipmentSlot1Reserve' : 'equipmentSlot2Reserve';
    const currentMain = state[targetSlot];
    const currentReserve = state[reserveKey];

    if (needsDisplace) {
      let displacedCard: EquipmentItem;
      let nextReserve: EquipmentItem[];
      if (currentReserve.length > 0) {
        displacedCard = currentReserve[0];
        nextReserve = currentMain
          ? [...currentReserve.slice(1), currentMain]
          : currentReserve.slice(1);
      } else {
        displacedCard = currentMain as EquipmentItem;
        nextReserve = [];
      }
      patch[reserveKey] = nextReserve;
      enqueuedActions.push({
        type: 'DISPOSE_EQUIPMENT_CARD',
        card: displacedCard,
        isDestruction: true,
        triggerLastWords: true,
        fromSlotId: targetSlot,
      });
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `装备栏已满：卸下 ${displacedCard.name} 以装备 ${card.name}` },
      });
    } else if (currentMain) {
      patch[reserveKey] = [...currentReserve, currentMain] as EquipmentItem[];
    }

    patch[targetSlot] = { ...card, fromSlot: targetSlot } as EquipmentItem;
    sideEffects.push({
      event: 'log:entry',
      payload: {
        type: 'equip',
        message: `手牌装备：${card.name}（${card.type === 'weapon' ? `${card.value}攻` : `${card.value}防`}）至${targetSlot === 'equipmentSlot1' ? '左' : '右'}槽`,
      },
    });

    // On-equip effects — delegated to the on-equip registry
    if (card.onEquipEffect) {
      executeOnEquip(state, card, targetSlot, patch, sideEffects, enqueuedActions);
    }

    // Eternal relic: equip-empower
    if (hasEternalRelic(state.eternalRelics ?? [], 'equip-empower')) {
      const tempAttack = patch.slotTempAttack ?? { ...(state.slotTempAttack ?? {}) };
      const tempArmor = patch.slotTempArmor ?? { ...(state.slotTempArmor ?? {}) };
      tempAttack[targetSlot] = (tempAttack[targetSlot] ?? 0) + 3;
      tempArmor[targetSlot] = (tempArmor[targetSlot] ?? 0) + 3;
      patch.slotTempAttack = tempAttack;
      patch.slotTempArmor = tempArmor;
      sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `铸锋药剂：${card.name} 装备时，该装备栏临时攻击 +3，临时护甲 +3！` } });
    }

    // 集甲之符：从手牌出装备牌算一次"装备事件"，不论是替换、入 reserve 还是顶替。
    applyEquipAmuletCapProgress(state, patch, sideEffects);
  } else if (card.type === 'potion') {
    enqueuedActions.push({ type: 'RESOLVE_POTION', cardId: card.id, card });
    sideEffects.push({
      event: 'card:potionPlayed',
      payload: { card, target: action.target },
    });
  } else if (card.type === 'magic' || card.type === 'hero-magic' || card.type === 'curse') {
    enqueuedActions.push({ type: 'RESOLVE_MAGIC', cardId: card.id, card, target: action.target, isFlank });
    sideEffects.push({
      event: 'card:magicPlayed',
      payload: { card, target: action.target },
    });

    // 咒纹刻印：每使用 8 张 magic 牌（仅 type === 'magic'，不计 hero-magic / curse），
    // 发现一张专属牌。计数与触发都在此完成；UI 由 combat:classMagicDiscoverTriggered 监听。
    if (card.type === 'magic') {
      const magicDiscoverAmulet = (state.amuletSlots as GameCardData[]).find(
        s => s?.amuletEffect === 'magic-class-discover',
      );
      if (magicDiscoverAmulet) {
        const threshold = 8;
        const nextStreak = (state.classMagicDiscoverStreak ?? 0) + 1;
        if (nextStreak >= threshold) {
          patch.classMagicDiscoverStreak = 0;
          sideEffects.push({ event: 'combat:classMagicDiscoverTriggered', payload: { threshold } });
        } else {
          patch.classMagicDiscoverStreak = nextStreak;
        }
      }
    }
  }

  // Notify transform/category update
  sideEffects.push({ event: 'card:playedFromHand', payload: { card } });

  return applyPatch(state, patch, sideEffects, enqueuedActions.length > 0 ? enqueuedActions : undefined);
}

// ---------------------------------------------------------------------------
// DRAW_CARDS
// ---------------------------------------------------------------------------

function reduceDrawCards(
  state: GameState,
  action: Extract<GameAction, { type: 'DRAW_CARDS' }>,
): ReduceResult {
  if (action.source === 'backpack') {
    if (action.count === 1) {
      const result = drawFromBackpackToHandPure(state);
      if (!result.card) return noChange(state);

      const sideEffects: SideEffect[] = [
        { event: 'card:drawnToHand', payload: { cardId: result.card.id, source: 'backpack' } },
      ];
      return applyPatch(state, result.patch, sideEffects);
    }

    const result = drawMultipleFromBackpack(state, action.count);
    if (result.cards.length === 0) return noChange(state);

    const sideEffects: SideEffect[] = result.cards.map(card => ({
      event: 'card:drawnToHand' as const,
      payload: { cardId: card.id, source: 'backpack' },
    }));
    return applyPatch(state, result.patch, sideEffects);
  }

  if (action.source === 'deck') {
    const { drawn, remaining } = drawFromDeck(state.remainingDeck ?? [], action.count);
    if (drawn.length === 0) return noChange(state);

    let currentState = state;
    const allPatches: Partial<GameState> = { remainingDeck: remaining };
    const allSideEffects: SideEffect[] = [];
    for (const card of drawn) {
      const handPatch = addCardToHand(currentState, card);
      Object.assign(allPatches, handPatch);
      currentState = { ...currentState, ...allPatches };
      allSideEffects.push({ event: 'card:drawnToHand', payload: { cardId: card.id, source: 'deck' } });
    }
    return applyPatch(state, allPatches, allSideEffects);
  }

  if (action.source === 'recycleBag') {
    const result = processRecycleBag(state);
    if (result.restored.length === 0) return noChange(state);

    const sideEffects: SideEffect[] = result.restored.map(card => ({
      event: 'card:restoredFromRecycleBag' as const,
      payload: { cardId: card.id },
    }));
    return applyPatch(state, result.patch, sideEffects);
  }

  return noChange(state);
}

// ---------------------------------------------------------------------------
// TRIGGER_ON_ENTER_HAND — 上手 keyword
// ---------------------------------------------------------------------------

function reduceTriggerOnEnterHand(
  state: GameState,
  action: Extract<GameAction, { type: 'TRIGGER_ON_ENTER_HAND' }>,
): ReduceResult {
  const card = (state.handCards as GameCardData[]).find(c => c.id === action.cardId);
  if (!card || !card.onEnterHandEffect) return noChange(state);

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  const handled = executeOnEnterHand(state, card, patch, sideEffects, enqueuedActions);
  if (!handled) return noChange(state);

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// DISCARD_CARD
// ---------------------------------------------------------------------------

function reduceDiscardCard(
  state: GameState,
  action: Extract<GameAction, { type: 'DISCARD_CARD' }>,
): ReduceResult {
  const card = state.handCards.find(c => c.id === action.cardId);
  if (!card) return noChange(state);

  const handPatch = { handCards: state.handCards.filter(c => c.id !== action.cardId) };

  let destinationPatch: Partial<GameState>;
  if (action.destination === 'recycleBag') {
    destinationPatch = addToRecycleBag(state, card);
  } else {
    destinationPatch = addToGraveyardPure(state, card);
  }

  const sideEffects: SideEffect[] = [
    { event: 'card:discarded', payload: { cardId: action.cardId, destination: action.destination } },
  ];

  return applyPatch(state, { ...handPatch, ...destinationPatch }, sideEffects);
}

// ---------------------------------------------------------------------------
// ADD_TO_GRAVEYARD — sanitize, dedup, increment wave discard count
// ---------------------------------------------------------------------------

function reduceAddToGraveyard(
  state: GameState,
  action: Extract<GameAction, { type: 'ADD_TO_GRAVEYARD' }>,
): ReduceResult {
  const { fromSlot: _, ...cardWithoutSlot } = action.card as GameCardData & { fromSlot?: string };
  const sanitized = resetMonsterForGraveyard(cardWithoutSlot, state.gameMode === 'quick');

  if (state.discardedCards.some(c => c.id === sanitized.id)) {
    return noChange(state);
  }

  const sideEffects: SideEffect[] = [
    { event: 'log:entry', payload: { type: 'deck', message: `「${action.card.name}」→ 坟场` } },
  ];

  return applyPatch(state, {
    discardedCards: [...state.discardedCards, sanitized],
    waveDiscardCount: state.waveDiscardCount + 1,
  }, sideEffects);
}

// ---------------------------------------------------------------------------
// ADD_TO_RECYCLE_BAG — sanitize, normalize durability, dedup, amulet progress
// ---------------------------------------------------------------------------

function reduceAddToRecycleBag(
  state: GameState,
  action: Extract<GameAction, { type: 'ADD_TO_RECYCLE_BAG' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};

  let payload = sanitizeCardMetadata(action.card);

  if (isPermRecycleEquipment(payload)) {
    const maxD = payload.maxDurability ?? payload.durability ?? 1;
    payload = { ...payload, durability: maxD, maxDurability: maxD };
  } else if (
    (payload.type === 'weapon' || payload.type === 'shield' || payload.type === 'monster') &&
    payload.recycleDelay != null && payload.recycleDelay > 0
  ) {
    payload = { ...payload, durability: 1 };
  }

  const withWaits: GameCardData = { ...payload, _recycleWaits: payload.recycleDelay ?? 1 };

  const filtered = state.permanentMagicRecycleBag.filter(c => c.id !== withWaits.id);
  patch.permanentMagicRecycleBag = [...filtered, withWaits];

  sideEffects.push({ event: 'log:entry', payload: { type: 'deck', message: `「${action.card.name}」→ 回收袋` } });

  // 积蓄之符 amulet: recycle-backpack-expand progress
  const recycleAmulet = (state.amuletSlots as GameCardData[]).find(
    s => s?.amuletEffect === 'recycle-backpack-expand',
  );
  if (recycleAmulet) {
    const recycleThreshold = (recycleAmulet.upgradeLevel ?? 0) >= 1 ? 6 : 8;
    const progress = (state.recycleBackpackProgress ?? 0) + 1;
    if (progress >= recycleThreshold) {
      patch.recycleBackpackProgress = 0;
      patch.backpackCapacityModifier = (state.backpackCapacityModifier ?? 0) + 3;
      patch.amuletSlots = (state.amuletSlots as GameCardData[]).map(slot =>
        slot?.amuletEffect === 'recycle-backpack-expand'
          ? { ...slot, _counterDisplay: `0/${recycleThreshold}` }
          : slot,
      ) as AmuletItem[];
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'amulet', message: `积蓄之符：累计回收 ${recycleThreshold} 张牌，背包上限 +3！` },
      });
    } else {
      patch.recycleBackpackProgress = progress;
      patch.amuletSlots = (state.amuletSlots as GameCardData[]).map(slot =>
        slot?.amuletEffect === 'recycle-backpack-expand'
          ? { ...slot, _counterDisplay: `${progress}/${recycleThreshold}` }
          : slot,
      ) as AmuletItem[];
    }
  }

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// ADD_TO_BACKPACK — capacity enforcement with overflow to recycle bag
// ---------------------------------------------------------------------------

function reduceAddToBackpack(
  state: GameState,
  action: Extract<GameAction, { type: 'ADD_TO_BACKPACK' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const patch = addCardToBackpackPure(state, action.card);

  if (patch.permanentMagicRecycleBag) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'deck', message: `背包已满，「${action.card.name}」溢出到回收袋` },
    });
  } else {
    sideEffects.push({
      event: 'card:newCardGained',
      payload: { count: 1 },
    });
  }

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// DRAW_FROM_BACKPACK — draw random cards from backpack to hand
// ---------------------------------------------------------------------------

function reduceDrawFromBackpack(
  state: GameState,
  action: Extract<GameAction, { type: 'DRAW_FROM_BACKPACK' }>,
): ReduceResult {
  const { cards, patch } = drawMultipleFromBackpack(state, action.count, { ignoreLimit: action.ignoreLimit });
  if (cards.length === 0) return noChange(state);

  const sideEffects: SideEffect[] = [
    {
      event: 'card:drawnFromBackpack',
      payload: { cards, count: cards.length },
    },
  ];

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// 集甲之符 (equip-amulet-cap) — 每装备 8 件 → maxAmuletSlots +1
//
// 共享辅助：被 EQUIP_CARD 与 PLAY_CARD（weapon/shield 分支）调用。
// 调用一次代表"一次装备事件"，与是否顶替/入库存无关——参见 ASK 中
// `displace_count = count_one`。
// ---------------------------------------------------------------------------

function applyEquipAmuletCapProgress(
  state: GameState,
  patch: Partial<GameState>,
  sideEffects: SideEffect[],
): void {
  const equipCapAmulet = (state.amuletSlots as GameCardData[]).find(
    s => s?.amuletEffect === 'equip-amulet-cap',
  );
  if (!equipCapAmulet) return;
  const equipThreshold = 8;
  const baseProgress = patch.equipAmuletCapProgress ?? state.equipAmuletCapProgress ?? 0;
  const next = baseProgress + 1;
  if (next >= equipThreshold) {
    patch.equipAmuletCapProgress = 0;
    patch.maxAmuletSlots = (patch.maxAmuletSlots ?? state.maxAmuletSlots ?? 0) + 1;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'amulet', message: `${equipCapAmulet.name}：累计装备 ${equipThreshold} 个装备，护符栏上限 +1！` },
    });
  } else {
    patch.equipAmuletCapProgress = next;
  }
}

// ---------------------------------------------------------------------------
// EQUIP_CARD — directly place a card into an equipment slot
//
// 行为：
//   - 槽空：直接放入，集甲之符 +1。
//   - 槽已被占且该槽剩余容量 > 0：把当前主装备推入该槽 reserve，新卡作为
//     主装备；集甲之符 +1。
//   - 槽已被占且容量已满：顶替最旧的（reserve[0] 优先，否则当前主装备），
//     被顶替的卡走 DISPOSE_EQUIPMENT_CARD（destroyed=true，遗言触发）；
//     集甲之符 +1。
// ---------------------------------------------------------------------------

function reduceEquipCard(
  state: GameState,
  action: Extract<GameAction, { type: 'EQUIP_CARD' }>,
): ReduceResult {
  const card = (state.handCards as GameCardData[]).find(c => c.id === action.cardId)
    ?? state.backpackItems?.find((c: GameCardData) => c.id === action.cardId);
  if (!card) return noChange(state);

  const { slotId } = action;
  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};
  const enqueuedActions: GameAction[] = [];

  const reserveKey = slotId === 'equipmentSlot1' ? 'equipmentSlot1Reserve' : 'equipmentSlot2Reserve';
  const cap = state.equipmentSlotCapacity?.[slotId] ?? 1;
  const currentMain = state[slotId] as EquipmentItem | null;
  const currentReserve = (state[reserveKey] ?? []) as EquipmentItem[];
  const total = (currentMain ? 1 : 0) + currentReserve.length;

  if (currentMain) {
    if (total < cap) {
      // 仍有容量：把现任主装备入 reserve，新卡作为主装备。
      patch[reserveKey] = [...currentReserve, currentMain];
    } else {
      // 容量已满：顶替最旧的（reserve[0] 优先，否则主装备）。
      let displacedCard: EquipmentItem;
      let nextReserve: EquipmentItem[];
      if (currentReserve.length > 0) {
        displacedCard = currentReserve[0];
        nextReserve = [...currentReserve.slice(1), currentMain];
      } else {
        displacedCard = currentMain;
        nextReserve = [];
      }
      patch[reserveKey] = nextReserve;
      enqueuedActions.push({
        type: 'DISPOSE_EQUIPMENT_CARD',
        card: displacedCard,
        isDestruction: true,
        triggerLastWords: true,
        fromSlotId: slotId,
      });
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `装备栏已满：卸下 ${displacedCard.name} 以装备 ${card.name}` },
      });
    }
  }

  patch[slotId] = { ...card, fromSlot: slotId } as EquipmentItem;

  if ((state.handCards as GameCardData[]).some(c => c.id === action.cardId)) {
    patch.handCards = (state.handCards as GameCardData[]).filter(c => c.id !== action.cardId);
  } else {
    patch.backpackItems = state.backpackItems.filter((c: GameCardData) => c.id !== action.cardId);
  }

  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'equip', message: `装备了 ${card.name} 至${slotId === 'equipmentSlot1' ? '左' : '右'}槽` },
  });
  sideEffects.push({ event: 'card:equipped', payload: { cardId: card.id, slotId } });

  applyEquipAmuletCapProgress(state, patch, sideEffects);

  return applyPatch(state, patch, sideEffects, enqueuedActions.length > 0 ? enqueuedActions : undefined);
}

function reduceResolvePotion(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_POTION' }>,
): ReduceResult {
  // Try card-schema engine first; fall back to legacy if not registered
  const engineResult = executeCardEffects(state, action.card);
  if (engineResult) return engineResult;
  return resolveAllPotionEffects(state, action.card);
}

// ---------------------------------------------------------------------------
// RESOLVE_MAGIC — apply magic card effects
// ---------------------------------------------------------------------------

function reduceResolveMagic(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_MAGIC' }>,
): ReduceResult {
  const engineResult = executeMagicCardEffects(state, action.card, action.target, action.isFlank);
  if (engineResult) return engineResult;
  return resolveAllMagicEffects(state, action.card, action.target, action.isFlank);
}

// ---------------------------------------------------------------------------
// FINALIZE_CARD_PLAY — handle card disposition after play
// ---------------------------------------------------------------------------

function reduceFinalizeCardPlay(
  state: GameState,
  action: Extract<GameAction, { type: 'FINALIZE_CARD_PLAY' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};

  if (action.destination === 'graveyard') {
    sideEffects.push({ event: 'card:finalized', payload: { cardId: action.cardId, destination: 'graveyard' } });
  } else if (action.destination === 'recycleBag') {
    sideEffects.push({ event: 'card:finalized', payload: { cardId: action.cardId, destination: 'recycleBag' } });
  } else if (action.destination === 'permanent-recycle') {
    sideEffects.push({ event: 'card:finalized', payload: { cardId: action.cardId, destination: 'permanent-recycle' } });
  } else if (action.destination === 'exile') {
    sideEffects.push({ event: 'card:finalized', payload: { cardId: action.cardId, destination: 'exile' } });
  }

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// FINALIZE_MAGIC_CARD — anti-magic reflect, counter, disposition
// ---------------------------------------------------------------------------

function reduceFinalizeMagicCard(
  state: GameState,
  action: Extract<GameAction, { type: 'FINALIZE_MAGIC_CARD' }>,
): ReduceResult {
  const { card, dealtDamage, banner } = action;
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  const cardLabel = card.type === 'hero-magic' ? '英雄魔法' : '魔法';
  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'magic', message: `${cardLabel}：${card.name}${banner ? ` — ${banner}` : ''}` },
  });

  if (banner) {
    patch.heroSkillBanner = banner;
  }

  // Anti-magic reflect: unstunned monsters with antiMagicReflect deal damage to hero
  const activeCards = flattenActiveRowSlots(state.activeCards);
  for (const ac of activeCards) {
    if (ac && ac.antiMagicReflect && ac.antiMagicReflect > 0 && !ac.isStunned) {
      const reflectDmg = ac.antiMagicReflect;
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: reflectDmg, source: `anti-magic-reflect:${ac.name}` });
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'combat', message: `${ac.name} 反魔：对英雄造成 ${reflectDmg} 点伤害！` },
      });
      sideEffects.push({
        event: 'ui:banner',
        payload: { text: `${ac.name} 反魔！受到 ${reflectDmg} 点伤害！` },
      });
    }
  }

  // Damage magic counter
  if (card.type === 'magic' && dealtDamage) {
    patch.damageMagicPlayedThisTurn = (state.damageMagicPlayedThisTurn ?? 0) + 1;
  }

  // Clear pending magic action
  patch.pendingMagicAction = null;

  // Disposition:
  //   - curse → straight back to the backpack (cannot be recycled or discarded)
  //   - permanent magic / recycleDelay > 0 → recycle bag
  //   - otherwise → graveyard
  if (card.type === 'curse') {
    enqueuedActions.push({ type: 'ADD_TO_BACKPACK', card });
  } else if (card.permStripped) {
    // 凡化咒已剥离 Perm — 即使 magicType 仍为 permanent 也直接进坟场
    enqueuedActions.push({ type: 'ADD_TO_GRAVEYARD', card });
  } else {
    const isPermanent = card.type === 'magic' && card.magicType === 'permanent';
    if (isPermanent || (card.recycleDelay != null && card.recycleDelay > 0)) {
      enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card });
    } else {
      enqueuedActions.push({ type: 'ADD_TO_GRAVEYARD', card });
    }
  }

  sideEffects.push({
    event: 'card:magicFinalized',
    payload: { card, dealtDamage: !!dealtDamage },
  });

  return applyPatch(state, patch, sideEffects, enqueuedActions.length > 0 ? enqueuedActions : undefined);
}

// ---------------------------------------------------------------------------
// FINALIZE_POTION_CARD — disposition routing (flip, recycle, graveyard)
// ---------------------------------------------------------------------------

function reduceFinalizePotionCard(
  state: GameState,
  action: Extract<GameAction, { type: 'FINALIZE_POTION_CARD' }>,
): ReduceResult {
  const { card, banner } = action;
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  if (banner) {
    patch.heroSkillBanner = banner;
  }

  // Clear pending potion action if it matches this card
  const pending = state.pendingPotionAction;
  if (pending && (pending as any).card?.id === card.id) {
    patch.pendingPotionAction = null;
  }

  // Flip-target potions are handled by the UI layer (applyCardFlip)
  if (card.flipTarget) {
    sideEffects.push({
      event: 'card:potionFlipRequested',
      payload: { card },
    });
  } else if (card.recycleDelay != null && card.recycleDelay > 0) {
    enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card });
  } else {
    enqueuedActions.push({ type: 'ADD_TO_GRAVEYARD', card });
  }

  sideEffects.push({
    event: 'card:potionFinalized',
    payload: { card },
  });

  return applyPatch(state, patch, sideEffects, enqueuedActions.length > 0 ? enqueuedActions : undefined);
}

// ---------------------------------------------------------------------------
// GOBLIN_TRICK_DELIVER — phase 2 of 哥布林的戏法.
//
// Phase 1 (the magic resolver in `magic.ts`) already moved the player's other
// hand cards into the backpack and pre-rolled which backpack cards will be
// drawn. Phase 2 is invoked by the UI hook AFTER the hand→backpack discard
// flights complete, so the backpack→hand flights start cleanly afterwards.
//
// The drawn cards are NOT inserted into `handCards` here on purpose — the
// `card:queueToHand` listener triggers `triggerBackpackHandFlight`, and the
// flight's delivery hook (`ensureCardInHand`) adds each card to hand only
// when its individual flight lands. That gives the player the visual of the
// hand staying empty until the new cards "arrive".
// ---------------------------------------------------------------------------

function reduceGoblinTrickDeliver(
  state: GameState,
  action: Extract<GameAction, { type: 'GOBLIN_TRICK_DELIVER' }>,
): ReduceResult {
  const { drawCardIds } = action;
  if (!drawCardIds || drawCardIds.length === 0) return noChange(state);

  const idSet = new Set(drawCardIds);
  const drawnCards = drawCardIds
    .map(id => state.backpackItems.find(c => c.id === id))
    .filter((c): c is GameCardData => Boolean(c));

  if (drawnCards.length === 0) return noChange(state);

  const patch: Partial<GameState> = {
    backpackItems: state.backpackItems.filter(c => !idSet.has(c.id)),
  };
  const sideEffects: SideEffect[] = drawnCards.map(card => ({
    event: 'card:queueToHand' as const,
    payload: { card },
  }));
  sideEffects.push({
    event: 'ui:banner',
    payload: { text: `哥布林的戏法：抽到了 ${drawnCards.length} 张新牌！` },
  });

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// DELETE_CARD — zone removal + destination routing
// ---------------------------------------------------------------------------

function reduceDeleteCard(
  state: GameState,
  action: Extract<GameAction, { type: 'DELETE_CARD' }>,
): ReduceResult {
  const { cardId, source, destination, context, contextLabel } = action;
  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};

  let cardToDelete: GameCardData | null = null;

  if (source === 'hand') {
    cardToDelete = (state.handCards as GameCardData[]).find(c => c.id === cardId) ?? null;
    if (cardToDelete) {
      patch.handCards = (state.handCards as GameCardData[]).filter(c => c.id !== cardId);
    }
  } else if (source === 'backpack') {
    cardToDelete = (state.backpackItems as GameCardData[]).find(c => c.id === cardId) ?? null;
    if (cardToDelete) {
      patch.backpackItems = (state.backpackItems as GameCardData[]).filter(c => c.id !== cardId);
    }
  } else if (source === 'recycleBag') {
    cardToDelete = (state.permanentMagicRecycleBag as GameCardData[]).find(c => c.id === cardId) ?? null;
    if (cardToDelete) {
      patch.permanentMagicRecycleBag = (state.permanentMagicRecycleBag as GameCardData[]).filter(c => c.id !== cardId);
    }
  } else if (source === 'equipment') {
    if (state.equipmentSlot1?.id === cardId) {
      cardToDelete = state.equipmentSlot1 as GameCardData;
      const reserve = state.equipmentSlot1Reserve;
      patch.equipmentSlot1 = reserve.length > 0 ? reserve[0] : null;
      if (reserve.length > 0) {
        patch.equipmentSlot1Reserve = reserve.slice(1);
      }
    } else if (state.equipmentSlot2?.id === cardId) {
      cardToDelete = state.equipmentSlot2 as GameCardData;
      const reserve = state.equipmentSlot2Reserve;
      patch.equipmentSlot2 = reserve.length > 0 ? reserve[0] : null;
      if (reserve.length > 0) {
        patch.equipmentSlot2Reserve = reserve.slice(1);
      }
    } else {
      const r1Match = state.equipmentSlot1Reserve.find(c => c.id === cardId);
      const r2Match = state.equipmentSlot2Reserve.find(c => c.id === cardId);
      if (r1Match) {
        cardToDelete = r1Match as GameCardData;
        patch.equipmentSlot1Reserve = state.equipmentSlot1Reserve.filter(c => c.id !== cardId);
      } else if (r2Match) {
        cardToDelete = r2Match as GameCardData;
        patch.equipmentSlot2Reserve = state.equipmentSlot2Reserve.filter(c => c.id !== cardId);
      }
    }
  } else if (source === 'amulet') {
    cardToDelete = (state.amuletSlots as GameCardData[]).find(c => c.id === cardId) ?? null;
    if (cardToDelete) {
      const reversal = computeAmuletAuraReversal([cardToDelete as any]);
      if (reversal.tempAttackDelta.equipmentSlot1 !== 0 || reversal.tempAttackDelta.equipmentSlot2 !== 0) {
        patch.slotTempAttack = {
          equipmentSlot1: (state.slotTempAttack?.equipmentSlot1 ?? 0) + reversal.tempAttackDelta.equipmentSlot1,
          equipmentSlot2: (state.slotTempAttack?.equipmentSlot2 ?? 0) + reversal.tempAttackDelta.equipmentSlot2,
        };
      }
      if (reversal.tempArmorDelta.equipmentSlot1 !== 0 || reversal.tempArmorDelta.equipmentSlot2 !== 0) {
        patch.slotTempArmor = {
          equipmentSlot1: (state.slotTempArmor?.equipmentSlot1 ?? 0) + reversal.tempArmorDelta.equipmentSlot1,
          equipmentSlot2: (state.slotTempArmor?.equipmentSlot2 ?? 0) + reversal.tempArmorDelta.equipmentSlot2,
        };
      }
      patch.amuletSlots = (state.amuletSlots as GameCardData[]).filter(c => c.id !== cardId) as AmuletItem[];
    }
  }

  if (!cardToDelete) return noChange(state);

  if (destination === 'recycleBag') {
    const existing = (patch.permanentMagicRecycleBag ?? state.permanentMagicRecycleBag) as GameCardData[];
    patch.permanentMagicRecycleBag = [...existing, { ...cardToDelete, _recycleWaits: cardToDelete.recycleDelay ?? 1 }];
  } else {
    const graveyard = (patch.discardedCards ?? state.discardedCards) as GameCardData[];
    patch.discardedCards = [...graveyard, sanitizeCardMetadata(cardToDelete)];
  }

  const label = contextLabel || cardToDelete.name;
  const contextType = context === 'shop' ? 'shop' : context === 'event' ? 'event' : 'system';
  sideEffects.push({
    event: 'log:entry',
    payload: { type: contextType, message: `${contextType === 'shop' ? '商店：' : contextType === 'event' ? '事件：' : ''}删除「${label}」` },
  });

  sideEffects.push({
    event: 'card:deleted',
    payload: { card: cardToDelete, source, destination, context },
  });

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// CONVERT_AMULETS_TO_GOLD
// ---------------------------------------------------------------------------

function reduceConvertAmuletsToGold(
  state: GameState,
  action: Extract<GameAction, { type: 'CONVERT_AMULETS_TO_GOLD' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};

  if (!state.amuletSlots.length) return noChange(state);

  const reversal = computeAmuletAuraReversal(state.amuletSlots);
  if (reversal.tempAttackDelta.equipmentSlot1 !== 0 || reversal.tempAttackDelta.equipmentSlot2 !== 0) {
    patch.slotTempAttack = {
      equipmentSlot1: (state.slotTempAttack?.equipmentSlot1 ?? 0) + reversal.tempAttackDelta.equipmentSlot1,
      equipmentSlot2: (state.slotTempAttack?.equipmentSlot2 ?? 0) + reversal.tempAttackDelta.equipmentSlot2,
    };
  }
  if (reversal.tempArmorDelta.equipmentSlot1 !== 0 || reversal.tempArmorDelta.equipmentSlot2 !== 0) {
    patch.slotTempArmor = {
      equipmentSlot1: (state.slotTempArmor?.equipmentSlot1 ?? 0) + reversal.tempArmorDelta.equipmentSlot1,
      equipmentSlot2: (state.slotTempArmor?.equipmentSlot2 ?? 0) + reversal.tempArmorDelta.equipmentSlot2,
    };
  }

  const payout = action.amountPer * state.amuletSlots.length;
  patch.discardedCards = [...state.discardedCards, ...state.amuletSlots];
  patch.amuletSlots = [];
  patch.gold = state.gold + payout;
  patch.heroSkillBanner = `${state.amuletSlots.length} 枚护符转化为 ${payout} 金币！`;

  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'amulet', message: `${state.amuletSlots.length} 枚护符转化为 ${payout} 金币` },
  });

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// DRAW_CLASS_TO_BACKPACK
// ---------------------------------------------------------------------------

function reduceDrawClassToBackpack(
  state: GameState,
  action: Extract<GameAction, { type: 'DRAW_CLASS_TO_BACKPACK' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};

  if (state.classDeck.length === 0 || action.count <= 0) return noChange(state);

  let source = state.classDeck;
  if (action.excludeIds && action.excludeIds.length > 0) {
    const excludeSet = new Set(action.excludeIds);
    source = source.filter(c => !excludeSet.has(c.id));
  }
  if (action.filter) {
    const filterFn = (c: GameCardData): boolean => {
      switch (action.filter) {
        case 'hero-magic': return c.type === 'hero-magic';
        case 'weapon': return c.type === 'weapon';
        case 'shield': return c.type === 'shield';
        case 'equipment': return c.type === 'weapon' || c.type === 'shield';
        default: return true;
      }
    };
    const filtered = source.filter(filterFn);
    if (filtered.length > 0) source = filtered;
  }

  const takeCount = Math.min(action.count, source.length);
  const drawn = source.slice(-takeCount);
  const drawnIds = new Set(drawn.map(c => c.id));
  patch.classDeck = state.classDeck.filter(c => !drawnIds.has(c.id));

  const backpackCap = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier);
  const available = backpackCap - state.backpackItems.length;
  const toBackpack = drawn.slice(0, Math.max(0, available));
  const overflow = drawn.slice(Math.max(0, available));

  if (toBackpack.length > 0) {
    patch.backpackItems = [...toBackpack, ...state.backpackItems];
  }
  if (overflow.length > 0) {
    patch.permanentMagicRecycleBag = [
      ...state.permanentMagicRecycleBag,
      ...overflow.map(c => ({ ...c, _recycleWaits: c.recycleDelay ?? 1 })),
    ];
  }

  patch.heroSkillBanner = `从职业牌组获得 ${drawn.length} 张牌！`;
  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'skill', message: `从职业牌组获得 ${takeCount} 张牌：${drawn.map(c => c.name).join('、')}` },
  });
  sideEffects.push({
    event: 'cards:classDrawn',
    payload: { cards: drawn },
  });

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// APPLY_DISCARD_EFFECTS — on-discard triggers (honor-blood, damage, draw, relics, amulets)
// ---------------------------------------------------------------------------

function reduceApplyDiscardEffects(
  state: GameState,
  action: Extract<GameAction, { type: 'APPLY_DISCARD_EFFECTS' }>,
): ReduceResult {
  const { card, owner, opts } = action;
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  if (owner === 'player' && card.type === 'magic' && card.magicEffect === 'honor-blood') {
    const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
    if (monsters.length > 0) {
      const atkReduction = 2;
      const newActiveCards = state.activeCards.map(c => {
        if (!c || (c.type !== 'monster' && c.type !== 'building')) return c;
        const currentAtk = c.attack ?? c.value;
        return {
          ...c,
          attack: Math.max(0, currentAtk - atkReduction),
          value: Math.max(0, c.value - atkReduction),
          tempAttackBoost: (c.tempAttackBoost ?? 0) - atkReduction,
        };
      }) as import('@/components/game-board/types').ActiveRowSlots;
      patch.activeCards = newActiveCards;
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `${card.name} 被弃：激活行所有怪物攻击力 -${atkReduction}` } });
      sideEffects.push({ event: 'ui:banner', payload: { text: `${card.name} 被弃，激活行所有怪物攻击力 -${atkReduction}！` } });
    }
  } else if (card.onDiscardDamage) {
    const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
    if (monsters.length > 0) {
      const [target, rng2] = pickRandom(monsters, state.rng);
      patch.rng = rng2;
      const spellBonus = state.permanentSpellDamageBonus ?? 0;
      const dmg = card.onDiscardDamage + spellBonus;
      enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: target.id, damage: dmg, source: `discard:${card.name}`, isSpellDamage: true });
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `${card.name} 被弃：对 ${target.name} 造成 ${dmg} 点法术伤害` } });
      sideEffects.push({ event: 'ui:banner', payload: { text: `${card.name} 被弃，对 ${target.name} 造成了 ${dmg} 点伤害！` } });
    }
  }

  if (owner === 'player' && card.onDiscardDraw && card.onDiscardDraw > 0) {
    for (let i = 0; i < card.onDiscardDraw; i++) {
      enqueuedActions.push({ type: 'DRAW_CARDS', count: 1, source: 'backpack' });
    }
    sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `${card.name} 被弃：抽取 ${card.onDiscardDraw} 张牌` } });
  }

  if (owner === 'player' && hasEternalRelic(state.eternalRelics ?? [], 'discard-profit')) {
    patch.gold = (state.gold ?? 0) + 2;
    sideEffects.push({ event: 'log:entry', payload: { type: 'gold', message: `永恒护符·弃牌生金：弃回「${card.name}」获得 2 金币` } });
  }

  const amuletFx = computeAmuletEffects(state.amuletSlots);
  if (amuletFx.hasCatapult && owner === 'player' && !opts?.toRecycleBag && !opts?.isEquipmentDisplace) {
    enqueuedActions.push({ type: 'DRAW_CARDS', count: 2, source: 'backpack' });
    sideEffects.push({ event: 'log:entry', payload: { type: 'amulet', message: `弹射护符：弃置「${card.name}」后从背包抽牌` } });
  }

  if (card.amuletEffect !== 'discard-zap' && !opts?.toRecycleBag) {
    sideEffects.push({ event: 'card:discardShock', payload: {} });
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// APPLY_CARD_FLIP — handle card flip (active row / hand / backpack / gold)
// ---------------------------------------------------------------------------

function reduceApplyCardFlip(
  state: GameState,
  action: Extract<GameAction, { type: 'APPLY_CARD_FLIP' }>,
): ReduceResult {
  const { card, cellIndex } = action;
  const flip = card.flipTarget;
  if (!flip) return noChange(state);

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};
  const destination = flip.destination ?? 'graveyard';

  sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: `卡牌转化：${card.name} → ${flip.toCard.name}` } });
  if (flip.banner) {
    sideEffects.push({ event: 'ui:banner', payload: { text: flip.banner } });
  }

  let inCellIdx: number | null = null;

  if (destination === 'stay') {
    const idx = cellIndex ?? state.activeCards.findIndex(c => c?.id === card.id);
    if (idx !== -1) {
      const placedCard: GameCardData = {
        ...flip.toCard,
        _flipBackCard: { ...card },
        ...(flip.toCard.type === 'building' && (flip.toCard.name === '命运之刃' || flip.toCard.name === '增幅祭坛')
          ? { hasReleaseCharge: true, _fateBladeLastSlot: idx }
          : {}),
      };
      const newActive = [...state.activeCards] as typeof state.activeCards;
      newActive[idx] = placedCard;
      patch.activeCards = newActive;
      inCellIdx = idx;
    } else if (flip.toCard.type === 'event') {
      const placedCard: GameCardData = { ...flip.toCard, _flipBackCard: { ...card } };
      patch.handCards = [...state.handCards, placedCard];
      sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: `${flip.toCard.name} 加入手牌` } });
    }
  } else if (destination === 'backpack') {
    enqueuedActions.push({ type: 'ADD_TO_BACKPACK', card: flip.toCard });
  } else if (destination === 'hand') {
    patch.handCards = [...state.handCards, flip.toCard];
  } else {
    enqueuedActions.push({ type: 'ADD_TO_GRAVEYARD', card: flip.toCard });
  }

  const amuletFx = computeAmuletEffects(state.amuletSlots);
  if (amuletFx.hasFlipGold) {
    patch.gold = (state.gold ?? 0) + FLIP_GOLD_REWARD;
    sideEffects.push({ event: 'log:entry', payload: { type: 'gold', message: `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。` } });
  }

  // 翻印之符 (persuade-on-flip): 每翻转一张牌 → 下次劝降成功率 +10%
  // (stacks; cleared after any persuade attempt — see existing persuadeAmuletBonus reset)
  const persuadeOnFlipAmulets = (state.amuletSlots as GameCardData[]).filter(
    s => s?.amuletEffect === 'persuade-on-flip',
  );
  if (persuadeOnFlipAmulets.length > 0) {
    const stackBonus = persuadeOnFlipAmulets.length * 10;
    patch.persuadeAmuletBonus = (state.persuadeAmuletBonus ?? 0) + stackBonus;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'amulet', message: `翻印之符：卡牌翻转，下次劝降成功率 +${stackBonus}%（当前 +${patch.persuadeAmuletBonus}%）` },
    });
  }

  // 翻覆震慑 (flip-monster-debuff buff): per active debuff buff → target monster -1 attack on every flip.
  // Buff lifecycle: set on magic resolve; cleared on next waterfall or when target leaves active row.
  if (state.flipDebuffMonsterId) {
    const targetIdx = (state.activeCards as (GameCardData | null)[]).findIndex(
      c => c?.id === state.flipDebuffMonsterId,
    );
    if (targetIdx >= 0) {
      const targetCard = state.activeCards[targetIdx]!;
      if (targetCard.type === 'monster' || targetCard.attack != null) {
        const currentAtk = targetCard.attack ?? 0;
        const newAtk = Math.max(0, currentAtk - 1);
        if (newAtk !== currentAtk) {
          const baseActive = (patch.activeCards ?? state.activeCards) as ActiveRowSlots;
          const updated = [...baseActive] as ActiveRowSlots;
          updated[targetIdx] = { ...targetCard, attack: newAtk };
          patch.activeCards = updated;
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'event', message: `翻覆震慑：${targetCard.name} 攻击力 ${currentAtk} → ${newAtk}` },
          });
        }
      }
    } else {
      // Target left active row — clear buff.
      patch.flipDebuffMonsterId = null;
    }
  }

  // 翻转之契 option 6 — 每翻转一次，挂有 _flipRepairBuff 的装备各恢复 1 耐久（含 reserve）
  const flipRepairTouches: string[] = [];
  const tryRepairEquip = (eq: GameCardData | null | undefined): GameCardData | null | undefined => {
    if (!eq || !eq._flipRepairBuff) return eq;
    if (typeof eq.durability !== 'number' || typeof eq.maxDurability !== 'number') return eq;
    if (eq.durability >= eq.maxDurability) return eq;
    const restored = repairDurabilityPure(eq, 1);
    flipRepairTouches.push(`${eq.name} → ${restored.durability}/${restored.maxDurability}`);
    return restored;
  };
  const slot1Cur = patch.equipmentSlot1 ?? state.equipmentSlot1;
  const slot2Cur = patch.equipmentSlot2 ?? state.equipmentSlot2;
  const repairedSlot1 = tryRepairEquip(slot1Cur);
  const repairedSlot2 = tryRepairEquip(slot2Cur);
  if (repairedSlot1 !== slot1Cur) patch.equipmentSlot1 = repairedSlot1 as any;
  if (repairedSlot2 !== slot2Cur) patch.equipmentSlot2 = repairedSlot2 as any;
  const reserve1Cur = patch.equipmentSlot1Reserve ?? state.equipmentSlot1Reserve;
  if (Array.isArray(reserve1Cur) && reserve1Cur.length > 0) {
    let changed = false;
    const next = reserve1Cur.map(eq => {
      const repaired = tryRepairEquip(eq);
      if (repaired !== eq) changed = true;
      return repaired as GameCardData;
    });
    if (changed) patch.equipmentSlot1Reserve = next as EquipmentItem[];
  }
  const reserve2Cur = patch.equipmentSlot2Reserve ?? state.equipmentSlot2Reserve;
  if (Array.isArray(reserve2Cur) && reserve2Cur.length > 0) {
    let changed = false;
    const next = reserve2Cur.map(eq => {
      const repaired = tryRepairEquip(eq);
      if (repaired !== eq) changed = true;
      return repaired as GameCardData;
    });
    if (changed) patch.equipmentSlot2Reserve = next as EquipmentItem[];
  }
  if (flipRepairTouches.length > 0) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `熔铸耐久：翻转触发，${flipRepairTouches.join('；')}` },
    });
  }

  // 翻血之符 (flip-overkill-lifesteal): every 8 flips → permanentSpellLifesteal +1
  const flipLifestealAmulet = (state.amuletSlots as GameCardData[]).find(
    s => s?.amuletEffect === 'flip-overkill-lifesteal',
  );
  if (flipLifestealAmulet) {
    const flipThreshold = 8;
    const flipProgress = (state.flipOverkillLifestealProgress ?? 0) + 1;
    if (flipProgress >= flipThreshold) {
      patch.flipOverkillLifestealProgress = 0;
      patch.permanentSpellLifesteal = (state.permanentSpellLifesteal ?? 0) + 1;
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'amulet', message: `${flipLifestealAmulet.name}：累计翻转 ${flipThreshold} 张牌，超杀吸血永久 +1！` },
      });
    } else {
      patch.flipOverkillLifestealProgress = flipProgress;
    }
  }

  // 弧能之符 (flip-zap): one independent random-monster zap per equipped amulet on every flip.
  // The actual target selection / RNG / damage dispatch happens in the UI pipeline
  // (mirroring the discard-zap pattern), so we only emit the trigger event here.
  if (amuletFx.flipZapCount > 0) {
    sideEffects.push({ event: 'card:flipShock', payload: { count: amuletFx.flipZapCount } });
  }

  // amplifyOnFlip (e.g. 「生长之盾」): each equipped item carrying this flag triggers
  // a by-name +2 amplify on every flip. Multiple equipped items with the flag stack
  // (one AMPLIFY action per slot, deduped if both slots happen to share a name).
  const amplifyOnFlipNames: string[] = [];
  const slot1Now = patch.equipmentSlot1 ?? state.equipmentSlot1;
  const slot2Now = patch.equipmentSlot2 ?? state.equipmentSlot2;
  if (slot1Now?.amplifyOnFlip) amplifyOnFlipNames.push(slot1Now.name);
  if (slot2Now?.amplifyOnFlip && !amplifyOnFlipNames.includes(slot2Now.name)) {
    amplifyOnFlipNames.push(slot2Now.name);
  }
  for (const name of amplifyOnFlipNames) {
    enqueuedActions.push({
      type: 'AMPLIFY_CARDS_BY_NAME',
      cardName: name,
      amount: 2,
      source: `${name} 翻转增幅`,
    });
  }

  // Stay flips with a real cell get the in-cell flip animation; everything else
  // (hand / backpack / graveyard, plus stay-fallback-to-hand) keeps the
  // full-screen CardFlipOverlay via event:cardTransformed.
  if (inCellIdx !== null) {
    sideEffects.push({
      event: 'card:flippedInCell',
      payload: { cellIndex: inCellIdx, fromCard: card, toCard: flip.toCard, message: flip.message },
    });
  } else {
    sideEffects.push({
      event: 'event:cardTransformed',
      payload: { fromCard: card, toCard: flip.toCard, message: flip.message ?? '', hasFlipGold: amuletFx.hasFlipGold },
    });
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// DISPOSE_EQUIPMENT_CARD — handle equipment disposal (salvage, recycle, graveyard)
// ---------------------------------------------------------------------------

function reduceDisposeEquipmentCard(
  state: GameState,
  action: Extract<GameAction, { type: 'DISPOSE_EQUIPMENT_CARD' }>,
): ReduceResult {
  const { card, isDestruction, triggerLastWords, fromSlotId } = action;
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  let patch: Partial<GameState> = {};

  const amuletFx = computeAmuletEffects(state.amuletSlots);

  // Displacement-style destruction (e.g. equipment B replaces A and pushes A out
  // of the slot): fire A's "last words" effects since A is conceptually destroyed.
  // Revive is intentionally skipped — the slot is already occupied by B.
  if (triggerLastWords) {
    const slotForLastWords = fromSlotId
      ?? ((card as GameCardData & { fromSlot?: EquipmentSlotId }).fromSlot)
      ?? 'equipmentSlot1';
    const lwResult = computeEquipmentDisplacementLastWords(state, slotForLastWords, card, amuletFx, patch);
    patch = lwResult.patch;
    sideEffects.push(...lwResult.sideEffects);
    enqueuedActions.push(...lwResult.enqueuedActions);
    if (lwResult.drawFromBackpack > 0) {
      enqueuedActions.push({ type: 'DRAW_CARDS', count: lwResult.drawFromBackpack, source: 'backpack' });
    }
    if (lwResult.classCardDraw > 0) {
      enqueuedActions.push({ type: 'DRAW_CLASS_TO_BACKPACK', count: lwResult.classCardDraw });
    }
  }

  if (isDestruction && amuletFx.hasEquipmentSalvage && (card.type === 'weapon' || card.type === 'shield')) {
    const newMaxDur = (card.maxDurability ?? 1) - 1;
    if (newMaxDur <= 0) {
      sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `残骸回收符：${card.name} 耐久上限归零，从游戏中移除！` } });
      sideEffects.push({ event: 'ui:banner', payload: { text: `${card.name} 耐久上限归零，移除！` } });
      return applyPatch(state, patch, sideEffects);
    }
    const { fromSlot: _, armor: _a, armorBonusDamaged: _b, reviveUsed: _c, equipmentReviveUsed: _d, wraithRebirthUsed: _e, ...rest } = card as any;
    const salvaged: GameCardData = { ...rest, durability: 1, maxDurability: newMaxDur };
    const slotHint: string | undefined = (card as any).fromSlot;
    sideEffects.push({ event: 'card:equipmentSalvaged', payload: { card: salvaged, slotHint } });
    sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `残骸回收符：${card.name} 回到手牌（耐久 1/${newMaxDur}）！` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `残骸回收！${card.name} 回到手牌！` } });
    patch.handCards = [...state.handCards, salvaged];
    return applyPatch(state, patch, sideEffects);
  }

  const toRecycleBag = isPermRecycleEquipment(card) ||
    ((card.type === 'weapon' || card.type === 'shield' || card.type === 'monster') && card.recycleDelay != null && card.recycleDelay > 0);

  if (toRecycleBag) {
    enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card });
  } else {
    enqueuedActions.push({ type: 'ADD_TO_GRAVEYARD', card });
  }

  if (!isDestruction) {
    enqueuedActions.push({ type: 'APPLY_DISCARD_EFFECTS', card, owner: 'player', opts: { toRecycleBag, isEquipmentDisplace: true } });
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// DISCARD_OWNED_CARD — route card to graveyard/recycleBag + trigger side effects
// ---------------------------------------------------------------------------

function reduceDiscardOwnedCard(
  state: GameState,
  action: Extract<GameAction, { type: 'DISCARD_OWNED_CARD' }>,
): ReduceResult {
  const { card, owner, forceRecycleBag } = action;
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];

  const isGraveNova = (card as any).knightEffect === 'grave-nova';
  const isPerm = isRecyclableFromHand(card);

  let toRecycleBag = false;

  if (owner === 'player' && isGraveNova) {
    sideEffects.push({ event: 'card:graveNova', payload: { card } });
    enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card });
    toRecycleBag = true;
  } else if (forceRecycleBag || isPerm) {
    enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card });
    toRecycleBag = true;
  } else {
    enqueuedActions.push({ type: 'ADD_TO_GRAVEYARD', card });
  }

  enqueuedActions.push({ type: 'APPLY_DISCARD_EFFECTS', card, owner, opts: { toRecycleBag } });

  return applyPatch(state, {}, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// TICK_RECYCLE_FORGE — recycle forge amulet: every 5 plays, restore + draw
// ---------------------------------------------------------------------------

function reduceTickRecycleForge(state: GameState): ReduceResult {
  if (!state.amuletSlots.some((s: GameCardData) => s?.amuletEffect === 'recycle-forge')) {
    return noChange(state);
  }

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  const next = (state.recycleForgePlayCount ?? 0) + 1;
  patch.recycleForgePlayCount = next;

  if (next % 5 === 0) {
    enqueuedActions.push({ type: 'RESTORE_RECYCLE_BAG' });
    enqueuedActions.push({ type: 'DRAW_CARDS', count: 2, source: 'backpack' });
    sideEffects.push({ event: 'log:entry', payload: { type: 'amulet', message: `回收熔炉触发（${next} 张牌已使用）` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `回收熔炉触发！回收袋返还 + 抽 2 张牌。` } });
  }

  const display = next % 5;
  patch.amuletSlots = state.amuletSlots.map((slot: GameCardData) => {
    if (slot?.amuletEffect !== 'recycle-forge') return slot;
    return {
      ...slot,
      description: `每使用或弃回 5 张牌，回收袋洗回背包（所有牌剩余瀑流 -1），然后抽 2 张牌。(可超手牌上限) [${display}/5]`,
    };
  }) as AmuletItem[];

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// RESTORE_RECYCLE_BAG — restore ready cards from recycle bag to backpack
// ---------------------------------------------------------------------------

function reduceRestoreRecycleBag(state: GameState): ReduceResult {
  const result = processRecycleBag(state);
  if (result.restored.length === 0) return noChange(state);

  const sideEffects: SideEffect[] = [
    {
      event: 'log:entry',
      payload: { type: 'deck', message: `回收袋返还 ${result.restored.length} 张牌：${result.restored.map((c: GameCardData) => c.name).join('、')}` },
    },
  ];

  return applyPatch(state, result.patch, sideEffects);
}

// ---------------------------------------------------------------------------
// RESOLVE_POTION_REPAIR — repair equipment durability
// ---------------------------------------------------------------------------

function reduceResolvePotionRepair(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_POTION_REPAIR' }>,
): ReduceResult {
  const { slotId, amount, card } = action;
  const slotItem = getEquipmentInSlot(state, slotId);
  if (!slotItem) return noChange(state);

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  const maxDur = slotItem.maxDurability ?? slotItem.durability ?? 1;
  const currentDur = slotItem.durability ?? maxDur;
  const newDur = Math.min(maxDur, currentDur + amount);
  const actualRepair = newDur - currentDur;

  patch[slotId] = { ...slotItem, durability: newDur } as EquipmentItem;

  sideEffects.push({ event: 'equipment:repaired', payload: { slotId, amount: actualRepair } });
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `修复 ${slotItem.name}：耐久 +${actualRepair}（${newDur}/${maxDur}）` } });

  enqueuedActions.push({
    type: 'FINALIZE_POTION_CARD',
    card,
    banner: `${slotItem.name} 耐久 +${actualRepair}`,
  });

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// RETURN_EQUIPMENT_TO_HAND — return equipment from slot back to hand
// ---------------------------------------------------------------------------

function reduceReturnEquipmentToHand(
  state: GameState,
  action: Extract<GameAction, { type: 'RETURN_EQUIPMENT_TO_HAND' }>,
): ReduceResult {
  const { slotId } = action;
  const slotItem = getEquipmentInSlot(state, slotId);
  if (!slotItem) return noChange(state);

  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};

  const reserve = getReserve(state, slotId);
  const reserveKey = slotId === 'equipmentSlot1' ? 'equipmentSlot1Reserve' : 'equipmentSlot2Reserve';

  const cleanedItem = sanitizeCardMetadata(slotItem as GameCardData);
  patch.handCards = [...state.handCards, cleanedItem];

  if (reserve.length > 0) {
    const promoted = reserve[reserve.length - 1];
    patch[slotId] = { ...promoted, fromSlot: slotId } as EquipmentItem;
    patch[reserveKey] = reserve.slice(0, -1) as EquipmentItem[];
  } else {
    patch[slotId] = null;
  }

  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${slotItem.name} 回到手牌` } });
  sideEffects.push({ event: 'card:queueToHand', payload: { card: cleanedItem, sourceHint: slotId } });

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// RESOLVE_MIRROR_COPY — clone a card from equipment/amulet/hand
// ---------------------------------------------------------------------------

function reduceResolveMirrorCopy(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_MIRROR_COPY' }>,
): ReduceResult {
  const modal = state.mirrorCopyModal;
  if (!modal) return noChange(state);

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = { mirrorCopyModal: null };

  const sourceCard = state.pendingMagicAction?.card as GameCardData | undefined;
  if (!sourceCard) {
    return applyPatch(state, patch, sideEffects);
  }

  const { selection } = action;
  let template: GameCardData | null = null;

  if (selection.kind === 'equipment') {
    template = getEquipmentInSlot(state, selection.slotId);
  } else if (selection.kind === 'amulet') {
    template = (state.amuletSlots as GameCardData[])[selection.index] ?? null;
  } else {
    template = state.handCards.find(c => c.id === selection.cardId) ?? null;
  }

  if (!template) {
    if (sourceCard.classCard) {
      enqueuedActions.push({ type: 'REMOVE_CLASS_CARD_FROM_HAND', cardId: sourceCard.id });
    }
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card: sourceCard, banner: '镜影摹形：目标已不存在。' });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  let rng = state.rng;
  const [cloneId, rng2] = nextId(rng, 'mirror');
  rng = rng2;
  patch.rng = rng;

  const cloned: GameCardData = {
    ...sanitizeCardMetadata(template),
    id: cloneId,
    _skipOnEnterHand: true,
  };

  patch.handCards = [...state.handCards, cloned];
  sideEffects.push({ event: 'card:queueToHand', payload: { card: cloned } });

  if (sourceCard.classCard) {
    enqueuedActions.push({ type: 'REMOVE_CLASS_CARD_FROM_HAND', cardId: sourceCard.id });
  }
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card: sourceCard, banner: `镜影摹形：获得「${cloned.name}」的复制。` });

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// CANCEL_MIRROR_COPY
// ---------------------------------------------------------------------------

function reduceCancelMirrorCopy(state: GameState): ReduceResult {
  const modal = state.mirrorCopyModal;
  if (!modal) return noChange(state);

  const patch: Partial<GameState> = { mirrorCopyModal: null };
  const enqueuedActions: GameAction[] = [];

  const sourceCard = state.pendingMagicAction?.card as GameCardData | undefined;
  if (sourceCard) {
    if (sourceCard.classCard) {
      enqueuedActions.push({ type: 'REMOVE_CLASS_CARD_FROM_HAND', cardId: sourceCard.id });
    }
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card: sourceCard, banner: '镜影摹形已取消。' });
  }

  return applyPatch(state, patch, [], enqueuedActions);
}

// ---------------------------------------------------------------------------
// RESOLVE_AMPLIFY — create a permanent amplify card in backpack
// ---------------------------------------------------------------------------

function reduceResolveAmplify(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_AMPLIFY' }>,
): ReduceResult {
  const modal = state.amplifyModal;
  if (!modal) return noChange(state);

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = { amplifyModal: null };

  const sourceCard = state.pendingMagicAction?.card as GameCardData | undefined;
  if (!sourceCard) return applyPatch(state, patch);

  const { selection } = action;
  let targetCardId: string | undefined;
  let targetName: string | undefined;

  if (selection.kind === 'equipment') {
    const slotItem = getEquipmentInSlot(state, selection.slotId);
    if (!slotItem) {
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card: sourceCard, banner: '增幅：目标装备已不存在。' });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    targetCardId = slotItem.id;
    targetName = slotItem.name;
  } else {
    const targetCard = state.handCards.find(c => c.id === selection.cardId);
    if (!targetCard) {
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card: sourceCard, banner: '增幅：目标卡牌已不在手牌中。' });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    targetCardId = targetCard.id;
    targetName = targetCard.name;
  }

  let rng = state.rng;
  const [permId, rng2] = nextId(rng, 'amplify-perm');
  rng = rng2;
  patch.rng = rng;

  const amplifyPermCard: GameCardData = {
    id: permId,
    type: 'magic',
    name: `增幅：${targetName}`,
    value: 0,
    image: skillScrollImage,
    magicType: 'permanent',
    magicEffect: 'amplify-target',
    description: `永久魔法（Perm 2）：对「${targetName}」进行增幅（武器攻击+2，护盾护甲+2，伤害魔法伤害+2）。`,
    recycleDelay: 2,
    _amplifyTargetCardId: targetCardId,
    _amplifyTargetName: targetName,
  };

  enqueuedActions.push({ type: 'ADD_TO_BACKPACK', card: amplifyPermCard });
  sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `增幅：为「${targetName}」生成永久增幅魔法（Perm 2），已放入背包。` } });
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card: sourceCard, banner: `增幅：为「${targetName}」生成永久增幅魔法（Perm 2）！` });

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// AMPLIFY_CARDS_BY_NAME — 按卡名累计增幅，所有同名卡（含未来生成）共享加成
// ---------------------------------------------------------------------------

function reduceAmplifyCardsByName(
  state: GameState,
  action: Extract<GameAction, { type: 'AMPLIFY_CARDS_BY_NAME' }>,
): ReduceResult {
  const { cardName, amount, source } = action;
  if (!cardName || !amount) return noChange(state);

  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};

  const prevTotal = state.amplifiedCardBonus[cardName] ?? 0;
  patch.amplifiedCardBonus = { ...state.amplifiedCardBonus, [cardName]: prevTotal + amount };

  const mapList = <T extends GameCardData>(list: T[]): T[] => {
    let mutated = false;
    const next = list.map(card => {
      if (card.name !== cardName) return card;
      mutated = true;
      return applyAmplifyToCard(card, amount);
    });
    return mutated ? next : list;
  };

  const mapRow = (slots: typeof state.activeCards): typeof state.activeCards => {
    let mutated = false;
    const next = slots.map(card => {
      if (!card || card.name !== cardName) return card;
      mutated = true;
      return applyAmplifyToCard(card, amount);
    }) as typeof state.activeCards;
    return mutated ? next : slots;
  };

  const mapStacks = (stacks: Record<number, GameCardData[]>): Record<number, GameCardData[]> => {
    let anyMutated = false;
    const next: Record<number, GameCardData[]> = {};
    for (const key of Object.keys(stacks)) {
      const idx = Number(key);
      const stack = stacks[idx];
      const updated = mapList(stack);
      if (updated !== stack) anyMutated = true;
      next[idx] = updated;
    }
    return anyMutated ? next : stacks;
  };

  // Hand / 装备储备 / 背包 / 坟场 / 回收袋 / 抽牌堆 / 职业牌组
  const newHand = mapList(state.handCards);
  if (newHand !== state.handCards) patch.handCards = newHand;

  const newBackpack = mapList(state.backpackItems);
  if (newBackpack !== state.backpackItems) patch.backpackItems = newBackpack;

  const newGraveyard = mapList(state.discardedCards);
  if (newGraveyard !== state.discardedCards) patch.discardedCards = newGraveyard;

  const newRecycleBag = mapList(state.permanentMagicRecycleBag);
  if (newRecycleBag !== state.permanentMagicRecycleBag) patch.permanentMagicRecycleBag = newRecycleBag;

  const newRemainingDeck = mapList(state.remainingDeck);
  if (newRemainingDeck !== state.remainingDeck) patch.remainingDeck = newRemainingDeck;

  const newClassDeck = mapList(state.classDeck);
  if (newClassDeck !== state.classDeck) patch.classDeck = newClassDeck;

  // 装备槽 / 储备
  if (state.equipmentSlot1?.name === cardName) {
    patch.equipmentSlot1 = applyAmplifyToCard(state.equipmentSlot1, amount) as EquipmentItem;
  }
  if (state.equipmentSlot2?.name === cardName) {
    patch.equipmentSlot2 = applyAmplifyToCard(state.equipmentSlot2, amount) as EquipmentItem;
  }
  const newReserve1 = mapList(state.equipmentSlot1Reserve);
  if (newReserve1 !== state.equipmentSlot1Reserve) patch.equipmentSlot1Reserve = newReserve1 as EquipmentItem[];
  const newReserve2 = mapList(state.equipmentSlot2Reserve);
  if (newReserve2 !== state.equipmentSlot2Reserve) patch.equipmentSlot2Reserve = newReserve2 as EquipmentItem[];

  // 护符栏
  const newAmulets = mapList(state.amuletSlots);
  if (newAmulets !== state.amuletSlots) patch.amuletSlots = newAmulets as AmuletItem[];

  // 地下城行（preview / active）及其 stack
  const newPreview = mapRow(state.previewCards);
  if (newPreview !== state.previewCards) patch.previewCards = newPreview;
  const newActive = mapRow(state.activeCards);
  if (newActive !== state.activeCards) patch.activeCards = newActive;

  const newPreviewStacks = mapStacks(state.previewCardStacks);
  if (newPreviewStacks !== state.previewCardStacks) patch.previewCardStacks = newPreviewStacks;
  const newActiveStacks = mapStacks(state.activeCardStacks);
  if (newActiveStacks !== state.activeCardStacks) patch.activeCardStacks = newActiveStacks;

  const sourceLabel = source ?? '增幅';
  const newTotal = prevTotal + amount;
  sideEffects.push({
    event: 'log:entry',
    payload: {
      type: 'magic',
      message: `${sourceLabel}：所有「${cardName}」累计增幅 ${newTotal}（本次 +${amount}）`,
    },
  });

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// CANCEL_AMPLIFY
// ---------------------------------------------------------------------------

function reduceCancelAmplify(state: GameState): ReduceResult {
  const modal = state.amplifyModal;
  if (!modal) return noChange(state);

  const patch: Partial<GameState> = { amplifyModal: null };
  const enqueuedActions: GameAction[] = [];

  const sourceCard = state.pendingMagicAction?.card as GameCardData | undefined;
  if (sourceCard) {
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card: sourceCard, banner: '取消了增幅。' });
  }

  return applyPatch(state, patch, [], enqueuedActions);
}

// ---------------------------------------------------------------------------
// RESOLVE_PERM_GRANT — grant perm/flank/transform/enchant/extract to hand card
// ---------------------------------------------------------------------------

function reduceResolvePermGrant(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_PERM_GRANT' }>,
): ReduceResult {
  const modal = state.permGrantModal;
  if (!modal) return noChange(state);

  const { targetCardId } = action;
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = { permGrantModal: null };

  const isEventGrant = modal.sourceCardId === 'event-grant';

  if (modal.sourceType === 'flank-grant') {
    const targetCard = state.handCards.find(c => c.id === targetCardId);
    if (!targetCard) return applyPatch(state, patch);
    patch.handCards = state.handCards.map(c =>
      c.id === targetCardId ? { ...c, flankEffect: '抽1张牌', flankDraw: 1 } : c,
    );
    sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: `附魔祭坛：「${targetCard.name}」获得侧击效果！` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `「${targetCard.name}」获得侧击：抽1张牌！` } });
    if (isEventGrant) enqueuedActions.push({ type: 'COMPLETE_EVENT' });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  if (modal.sourceType === 'amulet-perm-grant') {
    const targetAmulet = state.amuletSlots.find(a => a.id === targetCardId);
    if (!targetAmulet) return applyPatch(state, patch);
    patch.amuletSlots = state.amuletSlots.map(a =>
      a.id === targetCardId ? { ...a, recycleDelay: 2 } : a,
    ) as typeof state.amuletSlots;
    sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: `附魔祭坛：「${targetAmulet.name}」获得 Perm 2！` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `「${targetAmulet.name}」获得 Perm 2！被移除后将经 2 次瀑流返回背包。` } });
    if (isEventGrant) enqueuedActions.push({ type: 'COMPLETE_EVENT' });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  if (modal.sourceType === 'transform-gold-grant') {
    const targetCard = state.handCards.find(c => c.id === targetCardId);
    if (!targetCard) return applyPatch(state, patch);
    patch.handCards = state.handCards.map(c =>
      c.id === targetCardId ? { ...c, transformBonus: '+3 金币', transformEffect: 'gold:3' } : c,
    );
    sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: `附魔祭坛：「${targetCard.name}」获得转型效果！` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `「${targetCard.name}」获得转型：+3 金币！` } });
    if (isEventGrant) enqueuedActions.push({ type: 'COMPLETE_EVENT' });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  if (modal.sourceType === 'flank-persuade-grant') {
    const targetCard = state.handCards.find(c => c.id === targetCardId);
    if (!targetCard) return applyPatch(state, patch);
    const amount = modal.meta?.amount ?? 1;
    patch.handCards = state.handCards.map(c =>
      c.id === targetCardId ? { ...c, flankEffect: `劝降费用永久 -${amount}`, flankEffectId: `persuadeCost-${amount}` } : c,
    );
    sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: `赋能神殿：「${targetCard.name}」获得侧击效果！` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `「${targetCard.name}」获得侧击：劝降费用永久 -${amount}！` } });
    if (isEventGrant) enqueuedActions.push({ type: 'COMPLETE_EVENT' });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  if (modal.sourceType === 'flank-stun-grant') {
    const targetCard = state.handCards.find(c => c.id === targetCardId);
    if (!targetCard) return applyPatch(state, patch);
    const amount = modal.meta?.amount ?? 5;
    patch.handCards = state.handCards.map(c =>
      c.id === targetCardId ? { ...c, flankEffect: `击晕上限 +${amount}%`, flankEffectId: `stunCap+${amount}` } : c,
    );
    sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: `赋能神殿：「${targetCard.name}」获得侧击效果！` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `「${targetCard.name}」获得侧击：击晕上限 +${amount}%！` } });
    if (isEventGrant) enqueuedActions.push({ type: 'COMPLETE_EVENT' });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  if (modal.sourceType === 'flank-damage-grant') {
    const targetCard = state.handCards.find(c => c.id === targetCardId);
    if (!targetCard) return applyPatch(state, patch);
    const amount = modal.meta?.amount ?? 5;
    patch.handCards = state.handCards.map(c =>
      c.id === targetCardId ? { ...c, flankEffect: `对随机怪物造成 ${amount} 点伤害`, flankEffectId: `damage:${amount}` } : c,
    );
    sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: `赋能神殿：「${targetCard.name}」获得侧击效果！` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `「${targetCard.name}」获得侧击：对随机怪物造成 ${amount} 点伤害！` } });
    if (isEventGrant) enqueuedActions.push({ type: 'COMPLETE_EVENT' });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  if (modal.sourceType === 'transform-draw-grant') {
    const targetCard = state.handCards.find(c => c.id === targetCardId);
    if (!targetCard) return applyPatch(state, patch);
    const amount = modal.meta?.amount ?? 2;
    patch.handCards = state.handCards.map(c =>
      c.id === targetCardId ? { ...c, transformBonus: `抽 ${amount} 张牌`, transformEffect: `draw:${amount}` } : c,
    );
    sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: `赋能神殿：「${targetCard.name}」获得转型效果！` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `「${targetCard.name}」获得转型：抽 ${amount} 张牌！` } });
    if (isEventGrant) enqueuedActions.push({ type: 'COMPLETE_EVENT' });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  if (modal.sourceType === 'transform-heal-grant') {
    const targetCard = state.handCards.find(c => c.id === targetCardId);
    if (!targetCard) return applyPatch(state, patch);
    const amount = modal.meta?.amount ?? 2;
    patch.handCards = state.handCards.map(c =>
      c.id === targetCardId ? { ...c, transformBonus: `恢复 ${amount} HP`, transformEffect: `heal:${amount}` } : c,
    );
    sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: `赋能神殿：「${targetCard.name}」获得转型效果！` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `「${targetCard.name}」获得转型：恢复 ${amount} HP！` } });
    if (isEventGrant) enqueuedActions.push({ type: 'COMPLETE_EVENT' });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  if (modal.sourceType === 'on-hand-stun-cap-grant') {
    // 翻转之契 option 5 — grant 'stun-cap-bonus-3' on-hand keyword to the chosen
    // hand card and trigger it once immediately (the card is already in hand,
    // so without this nudge the bonus would not apply until next discard / re-draw).
    const targetCard = state.handCards.find(c => c.id === targetCardId);
    if (!targetCard) return applyPatch(state, patch);
    const STUN_CAP_HARD_MAX = 100;
    const current = state.stunCap ?? 0;
    const target = Math.min(STUN_CAP_HARD_MAX, current + 3);
    patch.handCards = state.handCards.map(c =>
      c.id === targetCardId ? { ...c, onEnterHandEffect: 'stun-cap-bonus-3' } : c,
    );
    if (target > current) patch.stunCap = target;
    sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: `铭刻技艺：「${targetCard.name}」获得「上手：击晕上限 +3%」` } });
    if (target > current) {
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `铭刻技艺：击晕上限 ${current}% → ${target}%（即时触发一次）` } });
      sideEffects.push({ event: 'ui:banner', payload: { text: `「${targetCard.name}」铭刻技艺成功！击晕上限 +3%！` } });
    } else {
      sideEffects.push({ event: 'ui:banner', payload: { text: `「${targetCard.name}」铭刻技艺成功！击晕上限已达 ${STUN_CAP_HARD_MAX}%。` } });
    }
    if (isEventGrant) enqueuedActions.push({ type: 'COMPLETE_EVENT' });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  if (modal.sourceType === 'transform-recycle-grant') {
    const targetCard = state.handCards.find(c => c.id === targetCardId);
    if (!targetCard) return applyPatch(state, patch);
    patch.handCards = state.handCards.map(c =>
      c.id === targetCardId ? { ...c, transformBonus: '回收袋取回 1 张牌', transformEffect: 'recycle-to-hand:1' } : c,
    );
    sideEffects.push({ event: 'log:entry', payload: { type: 'potion', message: `唤回秘药：「${targetCard.name}」获得转型效果！` } });
    const src = state.pendingPotionAction?.card as GameCardData | undefined;
    if (src) {
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card: src, banner: `「${targetCard.name}」获得转型：回收袋取回 1 张牌！` });
    }
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  const sourceCard = (state.pendingMagicAction?.card ?? state.pendingPotionAction?.card) as GameCardData | undefined;
  if (!sourceCard) return applyPatch(state, patch);

  const targetCard = state.handCards.find(c => c.id === targetCardId);
  if (!targetCard) return applyPatch(state, patch);

  if (modal.sourceType === 'transform-grant') {
    patch.handCards = state.handCards.map(c =>
      c.id === targetCardId ? { ...c, transformBonus: '随机获得坟场一张魔法卡', transformEffect: 'graveyard-random-magic' } : c,
    );
    sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `蜕变赋灵：「${targetCard.name}」获得转型效果！` } });
    if (sourceCard.classCard) {
      enqueuedActions.push({ type: 'REMOVE_CLASS_CARD_FROM_HAND', cardId: sourceCard.id });
    }
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card: sourceCard, banner: `「${targetCard.name}」获得转型：随机获得坟场一张魔法卡！` });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  if (modal.sourceType === 'equipment-enchant') {
    const newHand = state.handCards.filter(c => c.id !== targetCardId);
    const gravePatch = addToGraveyardPure(state, targetCard);
    Object.assign(patch, gravePatch);
    patch.handCards = newHand;

    const atkBonus = targetCard.value ?? 0;
    const armorBonus = targetCard.armorMax ?? targetCard.armor ?? 0;

    const equippedSlots = getEquipmentSlots(state).filter(s => s.item);
    if (equippedSlots.length === 0) {
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card: sourceCard, banner: '装备栏没有装备可附魔。' });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    let rng = state.rng;
    const [randomSlot, rng2] = pickRandom(equippedSlots, rng);
    rng = rng2;
    patch.rng = rng;

    const item = randomSlot.item!;
    const updated = { ...item } as GameCardData;
    const parts: string[] = [];
    if (atkBonus > 0) {
      updated.value = (updated.value ?? 0) + atkBonus;
      updated.attack = (updated.attack ?? 0) + atkBonus;
      if (updated.baseAttack != null) updated.baseAttack += atkBonus;
      parts.push(`攻击 +${atkBonus}`);
    }
    if (armorBonus > 0) {
      if (updated.armorMax != null) updated.armorMax += armorBonus;
      parts.push(`护甲 +${armorBonus}`);
    }
    if (updated.maxDurability != null) {
      updated.maxDurability += 1;
      updated.durability = (updated.durability ?? 0) + 1;
      parts.push('耐久上限 +1，耐久 +1');
    }
    patch[randomSlot.id] = updated as EquipmentItem;

    const statDesc = parts.length > 0 ? parts.join('，') : '（无加成）';
    sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `装备附魔：弃置「${targetCard.name}」，「${item.name}」${statDesc}` } });
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card: sourceCard, banner: `装备附魔：弃置「${targetCard.name}」→「${item.name}」${statDesc}！` });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  if (modal.sourceType === 'essence-extract') {
    patch.handCards = state.handCards.filter(c => c.id !== targetCardId);

    const isInstantMagic = targetCard.type === 'magic' && targetCard.magicType === 'instant';
    const isEquipment = targetCard.type === 'weapon' || targetCard.type === 'shield';
    const isAmulet = targetCard.type === 'amulet';

    let slotId: EquipmentSlotId;
    let bonusType: 'damage' | 'shield';
    if (isInstantMagic) { slotId = 'equipmentSlot1'; bonusType = 'damage'; }
    else if (isEquipment) { slotId = 'equipmentSlot2'; bonusType = 'damage'; }
    else if (isAmulet) { slotId = 'equipmentSlot2'; bonusType = 'shield'; }
    else { slotId = 'equipmentSlot1'; bonusType = 'shield'; }

    Object.assign(patch, setSlotBonusPure(state, slotId, bonusType, v => v + 1));

    const slotLabel = slotId === 'equipmentSlot1' ? '左装备栏' : '右装备栏';
    const bonusLabel = bonusType === 'damage' ? '攻击' : '护甲';
    sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `精华萃取：移除「${targetCard.name}」，${slotLabel}永久${bonusLabel} +1` } });
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card: sourceCard, banner: `精华萃取：移除「${targetCard.name}」→ ${slotLabel}永久${bonusLabel} +1！` });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  if (cardHasPermFlag(targetCard)) return applyPatch(state, patch);

  patch.handCards = state.handCards.map(c => {
    if (c.id !== targetCardId) return c;
    const next: GameCardData = { ...c, recycleDelay: 3 };
    // 若目标曾被「凡化咒」剥离 Perm，需同时清除 permStripped 让 magicType==='permanent' 重新生效。
    if (next.permStripped) delete next.permStripped;
    return next;
  });
  const logType = modal.sourceType === 'potion' ? 'potion' : 'magic';
  const label = modal.sourceType === 'potion' ? '永恒铭刻药' : '永恒铭刻';
  sideEffects.push({ event: 'log:entry', payload: { type: logType, message: `${label}：「${targetCard.name}」获得 Perm 3 属性！` } });

  const bannerText = `「${targetCard.name}」获得 Perm 3！被移除后将经 3 次瀑流返回背包。`;
  if (modal.sourceType === 'potion') {
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card: sourceCard, banner: bannerText });
  } else {
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card: sourceCard, banner: bannerText });
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// CANCEL_PERM_GRANT
// ---------------------------------------------------------------------------

function reduceCancelPermGrant(state: GameState): ReduceResult {
  const modal = state.permGrantModal;
  if (!modal) return noChange(state);

  const patch: Partial<GameState> = { permGrantModal: null };
  const enqueuedActions: GameAction[] = [];

  const eventGrantTypes = ['flank-grant', 'transform-gold-grant', 'flank-persuade-grant',
    'flank-stun-grant', 'flank-damage-grant', 'transform-draw-grant', 'transform-heal-grant',
    'amulet-perm-grant', 'on-hand-stun-cap-grant'];

  if (eventGrantTypes.includes(modal.sourceType)) {
    if (modal.sourceCardId === 'event-grant') {
      enqueuedActions.push({ type: 'COMPLETE_EVENT' });
    }
    return applyPatch(state, patch, [], enqueuedActions);
  }

  if (modal.sourceType === 'transform-recycle-grant') {
    const src = state.pendingPotionAction?.card as GameCardData | undefined;
    if (src) {
      enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card: src, banner: '取消了唤回秘药。' });
    }
    return applyPatch(state, patch, [], enqueuedActions);
  }

  const sourceCard = (state.pendingMagicAction?.card ?? state.pendingPotionAction?.card) as GameCardData | undefined;
  if (!sourceCard) return applyPatch(state, patch);

  if (modal.sourceType === 'transform-grant') {
    if (sourceCard.classCard) {
      enqueuedActions.push({ type: 'REMOVE_CLASS_CARD_FROM_HAND', cardId: sourceCard.id });
    }
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card: sourceCard, banner: '取消了蜕变赋灵。' });
  } else if (modal.sourceType === 'equipment-enchant') {
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card: sourceCard, banner: '取消了装备附魔。' });
  } else if (modal.sourceType === 'essence-extract') {
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card: sourceCard, banner: '取消了精华萃取。' });
  } else if (modal.sourceType === 'potion') {
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card: sourceCard, banner: '取消了永恒铭刻。' });
  } else {
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card: sourceCard, banner: '取消了永恒铭刻。' });
  }

  return applyPatch(state, patch, [], enqueuedActions);
}

// ---------------------------------------------------------------------------
// APPLY_TRANSFORM_CATEGORY — apply transform effect on card-type category change
// ---------------------------------------------------------------------------

function reduceApplyTransformCategory(
  state: GameState,
  action: Extract<GameAction, { type: 'APPLY_TRANSFORM_CATEGORY' }>,
): ReduceResult {
  const { card } = action;
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};
  let rng = state.rng;

  const curCat = getCardPlayCategory(card);
  patch.lastPlayedCardCategory = curCat;

  // 维护连续转型计数（独立于 lastPlayedCardCategory，因为后者会被 magic resolver 提前覆盖）。
  // 使用 transformChainPrevCategory 作为可靠的"上一张牌的类别"。
  const chainPrevCat = state.transformChainPrevCategory;
  const prevStreak = state.consecutiveTransformStreak ?? 0;
  patch.transformChainPrevCategory = curCat;
  if (chainPrevCat == null) {
    patch.consecutiveTransformStreak = 1;
  } else if (chainPrevCat === curCat) {
    patch.consecutiveTransformStreak = 0;
  } else {
    patch.consecutiveTransformStreak = prevStreak + 1;
  }

  if (!card.transformEffect) return applyPatch(state, patch);

  const prevCat = state.lastPlayedCardCategory;
  if (prevCat == null || prevCat === curCat) return applyPatch(state, patch);

  if (card.transformEffect === 'graveyard-random-magic') {
    const magicCards = state.discardedCards.filter(c => c.type === 'magic');
    if (magicCards.length > 0) {
      const [picked, rng2] = pickRandom(magicCards, rng);
      rng = rng2;
      patch.rng = rng;
      patch.discardedCards = state.discardedCards.filter(c => c.id !== picked.id);
      patch.handCards = [...state.handCards, picked];
      sideEffects.push({ event: 'card:queueToHand', payload: { card: picked } });
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `转型触发：从坟场获得「${picked.name}」！` } });
      sideEffects.push({ event: 'ui:banner', payload: { text: `转型触发！从坟场获得「${picked.name}」！` } });
    } else {
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: '转型触发：坟场没有魔法卡牌。' } });
      sideEffects.push({ event: 'ui:banner', payload: { text: '转型触发！但坟场没有魔法卡牌。' } });
    }
  } else if (card.transformEffect?.startsWith('gold:')) {
    const goldAmount = parseInt(card.transformEffect.replace('gold:', ''), 10) || 3;
    patch.gold = state.gold + goldAmount;
    sideEffects.push({ event: 'log:entry', payload: { type: 'gold', message: `转型触发：获得 ${goldAmount} 金币！` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `转型触发！获得 ${goldAmount} 金币！` } });
  } else if (card.transformEffect?.startsWith('draw:')) {
    const drawCount = parseInt(card.transformEffect.replace('draw:', ''), 10) || 2;
    for (let i = 0; i < drawCount; i++) {
      enqueuedActions.push({ type: 'DRAW_CARDS', count: 1, source: 'backpack' });
    }
    sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `转型触发：抽取 ${drawCount} 张牌！` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `转型触发！抽取了 ${drawCount} 张牌！` } });
  } else if (card.transformEffect?.startsWith('heal:')) {
    const healAmount = parseInt(card.transformEffect.replace('heal:', ''), 10) || 2;
    enqueuedActions.push({ type: 'HEAL', amount: healAmount, source: 'transform' });
    sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: `转型触发：恢复 ${healAmount} HP！` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `转型触发！恢复了 ${healAmount} HP！` } });
  } else if (card.transformEffect?.startsWith('recycle-to-hand:')) {
    const count = parseInt(card.transformEffect.replace('recycle-to-hand:', ''), 10) || 1;
    const bag = state.permanentMagicRecycleBag.filter(c => c.id !== card.id);
    if (bag.length > 0) {
      const [shuffled, rng2] = rngShuffle(bag, rng);
      rng = rng2;
      patch.rng = rng;
      const picks = shuffled.slice(0, Math.min(count, bag.length));
      const pickIds = new Set(picks.map(p => p.id));
      patch.permanentMagicRecycleBag = state.permanentMagicRecycleBag.filter(c => !pickIds.has(c.id));
      patch.handCards = [...state.handCards, ...picks];
      for (const pick of picks) {
        sideEffects.push({ event: 'card:queueToHand', payload: { card: pick } });
      }
      const names = picks.map(p => `「${p.name}」`).join('、');
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `转型触发：从回收袋取回${names}！` } });
      sideEffects.push({ event: 'ui:banner', payload: { text: `转型触发！从回收袋取回${names}！` } });
    } else {
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: '转型触发：回收袋为空。' } });
      sideEffects.push({ event: 'ui:banner', payload: { text: '转型触发！但回收袋为空。' } });
    }
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// RESOLVE_DECK_JUDGE — peek at deck, apply effects by card type counts
// ---------------------------------------------------------------------------

function reduceResolveDeckJudge(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_DECK_JUDGE' }>,
): ReduceResult {
  const { card } = action;
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  const deck = state.remainingDeck;
  const peekedCards = deck.slice(0, Math.min(6, deck.length));

  let monsterCount = 0, eventCount = 0, equipCount = 0, magicCount = 0, potionCount = 0;
  for (const c of peekedCards) {
    if (c.type === 'monster') monsterCount++;
    else if (c.type === 'event' || c.type === 'building') eventCount++;
    else if (c.type === 'weapon' || c.type === 'shield') equipCount++;
    else if (c.type === 'magic') magicCount++;
    else if (c.type === 'potion') potionCount++;
  }

  const gains: { label: string; count: number }[] = [];

  if (eventCount > 0) {
    const bonus = eventCount * 2;
    patch.slotTempAttack = {
      equipmentSlot1: (state.slotTempAttack?.equipmentSlot1 ?? 0) + bonus,
      equipmentSlot2: (state.slotTempAttack?.equipmentSlot2 ?? 0) + bonus,
    };
    gains.push({ label: '左右装备栏临时攻击 +2', count: eventCount });
  }

  if (equipCount > 0) {
    const slots = getEquipmentSlots(state);
    for (const slot of slots) {
      const item = slot.item;
      if (item && item.durability != null && item.maxDurability != null) {
        const newDur = Math.min(item.maxDurability, item.durability + equipCount);
        if (newDur > item.durability) {
          patch[slot.id] = { ...item, durability: newDur };
        }
      }
    }
    gains.push({ label: '装备耐久 +1', count: equipCount });
  }

  if (magicCount > 0) {
    patch.permanentSpellDamageBonus = (state.permanentSpellDamageBonus ?? 0) + magicCount;
    gains.push({ label: '永久法术伤害 +1', count: magicCount });
  }

  if (potionCount > 0) {
    const healAmt = potionCount * 2;
    const maxHp = computeMaxHp(state);
    patch.hp = Math.min(state.hp + healAmt, maxHp);
    gains.push({ label: '+2 HP', count: potionCount });
  }

  if (monsterCount > 0) {
    gains.push({ label: '须删除一张牌', count: monsterCount });
  }

  sideEffects.push({
    event: 'card:deckJudgePeekReady',
    payload: { peekedCards, monsterCount, deleteCount: monsterCount, gains, card },
  });

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// RESOLVE_FATE_SIGHT — deal spell damage, peek deck, compute stun chance
// ---------------------------------------------------------------------------

function reduceResolveFateSight(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_FATE_SIGHT' }>,
): ReduceResult {
  const { card, targetMonsterId, baseDmg, peekCount } = action;
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  const totalDamage = getSpellDamage(baseDmg + (card.amplifyBonus ?? 0), state);
  const target = flattenActiveRowSlots(state.activeCards).find(c => c.id === targetMonsterId);
  if (!target) {
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, banner: '天眼审判：目标已消失。' });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  const isEngaged = state.combatState?.engagedMonsterIds?.includes(targetMonsterId);
  if (!isEngaged) {
    enqueuedActions.push({ type: 'BEGIN_COMBAT', monster: target, initiator: 'hero' });
  }
  enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: targetMonsterId, damage: totalDamage, source: 'fate-sight', isSpellDamage: true });

  const deck = state.remainingDeck;
  const peekedCards = deck.slice(0, Math.min(peekCount, deck.length));
  const monsterCount = peekedCards.filter(c => c.type === 'monster').length;

  const amuletFx = computeAmuletEffects(state.amuletSlots);
  const rawStunChance = Math.min(monsterCount * 20 + (amuletFx.stunRateBoost ?? 0), 100);
  const stunChance = state.stunCap > 0 ? Math.min(rawStunChance, state.stunCap) : rawStunChance;

  // Pre-roll the stun dice from seeded RNG so the UI dice modal animates to a
  // deterministic value. Roll only when the dice would actually be triggered
  // by useCardPlayHandlers' fate-sight close handler (matches its gating).
  const willRollStun = stunChance > 0 && !target.isStunned;
  let rng = state.rng;
  let predeterminedRoll = 0;
  if (willRollStun) {
    [predeterminedRoll, rng] = nextInt(rng, 1, 20);
    patch.rng = rng;
  }

  sideEffects.push({
    event: 'card:fateSightPeekReady',
    payload: {
      peekedCards,
      monsterCount,
      stunChance,
      targetMonsterName: target.name,
      card,
      totalDamage,
      targetMonsterId,
      targetIsStunned: !!target.isStunned,
      predeterminedRoll,
    },
  });

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// RESOLVE_STAT_SWAP — swap monster atk/hp, optionally trigger flank stun dice
// ---------------------------------------------------------------------------

function reduceResolveStatSwap(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_STAT_SWAP' }>,
): ReduceResult {
  const { card, targetMonsterId, isFlank } = action;
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  const target = flattenActiveRowSlots(state.activeCards).find(c => c.id === targetMonsterId);
  if (!target) {
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, banner: '颠倒乾坤：目标已消失。' });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  const oldAtk = target.attack ?? 0;
  const oldMaxHp = target.maxHp ?? target.hp ?? 0;

  patch.activeCards = state.activeCards.map(c => {
    if (!c || c.id !== targetMonsterId) return c;
    return {
      ...c,
      attack: oldMaxHp,
      maxHp: oldAtk,
      hp: Math.min(c.hp ?? oldAtk, oldAtk),
      baseAttack: oldMaxHp,
      baseHp: oldAtk,
    };
  }) as typeof state.activeCards;

  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'magic', message: `颠倒乾坤：${target.name} 攻击 ${oldAtk}→${oldMaxHp}，血量上限 ${oldMaxHp}→${oldAtk}${isFlank ? '（侧击触发）' : ''}` },
  });

  if (isFlank && !target.isStunned) {
    const amuletFx = computeAmuletEffects(state.amuletSlots);
    const effectiveFlankStun = Math.min(50 + (amuletFx.stunRateBoost ?? 0), state.stunCap);
    let predeterminedRoll: number;
    let nextRng: RngState;
    [predeterminedRoll, nextRng] = nextInt(state.rng, 1, 20);
    patch.rng = nextRng;
    sideEffects.push({
      event: 'card:statSwapStunDice',
      payload: { card, targetMonsterId, targetMonsterName: target.name, effectiveFlankStun, predeterminedRoll },
    });
  } else {
    const bannerText = `颠倒乾坤：${target.name} 攻击 ${oldAtk}↔${oldMaxHp} 血量上限互换！`;
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, banner: bannerText });
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// PROCESS_HERO_MAGIC_CARD — handle hero magic gauge unlock/fill
// ---------------------------------------------------------------------------

function reduceProcessHeroMagicCard(
  state: GameState,
  action: Extract<GameAction, { type: 'PROCESS_HERO_MAGIC_CARD' }>,
): ReduceResult {
  const { card } = action;
  const heroMagicId = card.heroMagicId as HeroMagicId | undefined;
  if (!heroMagicId) {
    return applyPatch(state, {}, [], [{ type: 'FINALIZE_MAGIC_CARD', card, banner: '无法识别的英雄魔法卡。' }]);
  }

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  const definition = getHeroMagicDefinition(heroMagicId);
  const status = state.heroMagicState[heroMagicId];

  logHeroMagic('card-play', { cardId: card.id, name: card.name, heroMagicId, status });

  if (!status || !status.unlocked) {
    const newState = { ...state.heroMagicState };
    newState[heroMagicId] = { id: heroMagicId, unlocked: true, gauge: 0, usedThisWave: false };
    patch.heroMagicState = newState;
    logHeroMagic('unlock-request', { heroMagicId });
    const bannerText = `${definition.name} 技能已掌握！`;
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, banner: bannerText });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  const newMagicState = { ...state.heroMagicState };
  newMagicState[heroMagicId] = {
    ...status,
    gauge: definition.gaugeMax,
    usedThisWave: false,
  };
  patch.heroMagicState = newMagicState;
  logHeroMagic('card-fill-gauge', { heroMagicId, readyState: status });

  const bannerText = `${definition.name} 数值槽已充满，可以手动发动！`;
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, banner: bannerText });

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// APPLY_BERSERKER_RAGE — activate berserker rage effect
// ---------------------------------------------------------------------------

function reduceApplyBerserkerRage(
  state: GameState,
  action: Extract<GameAction, { type: 'APPLY_BERSERKER_RAGE' }>,
): ReduceResult {
  const { origin } = action;
  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};

  patch.berserkerRageActive = true;
  patch.berserkerSlotUsed = {};

  const magicId: HeroMagicId = 'berserker-rage';
  const current = state.heroMagicState[magicId];
  if (current) {
    const newState = { ...state.heroMagicState };
    newState[magicId] = {
      ...current,
      gauge: 0,
      usedThisWave: origin === 'gauge' ? true : current.usedThisWave,
    };
    patch.heroMagicState = newState;
  }

  logHeroMagic('berserker-trigger', { origin });
  patch.heroSkillBanner = '狂战发动：直到下次瀑布前，每个武器栏每回合可多攻击一次，且所有攻击不消耗耐久。';

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// TRIGGER_GRAVE_NOVA — deal spell damage to all active monsters
// ---------------------------------------------------------------------------

function reduceTriggerGraveNova(
  state: GameState,
  action: Extract<GameAction, { type: 'TRIGGER_GRAVE_NOVA' }>,
): ReduceResult {
  const graveNovaCard = action.card;
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
  if (!monsters.length) {
    patch.heroSkillBanner = '殉烈爆鸣没有目标。';
    return applyPatch(state, patch, sideEffects);
  }

  const baseDamages = [3, 6];
  const baseDmg = baseDamages[graveNovaCard?.upgradeLevel ?? 0] ?? 6;
  const dmg = getSpellDamage(baseDmg + (graveNovaCard?.amplifyBonus ?? 0), state);

  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'combat', message: `殉烈爆鸣：对 ${monsters.map(m => m.name).join('、')} 各造成 ${dmg} 点法术伤害` },
  });

  for (const monster of monsters) {
    enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster.id, damage: dmg, source: 'grave-nova', isSpellDamage: true });
  }

  patch.heroSkillBanner = `殉烈爆鸣释放，对所有怪物造成 ${dmg} 点伤害！`;

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// RESOLVE_REPAIR_ENRAGE_DICE — handle dice outcome for repair/enrage
// ---------------------------------------------------------------------------

function reduceResolveRepairEnrageDice(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_REPAIR_ENRAGE_DICE' }>,
): ReduceResult {
  const { card, slotId, monsterId, diceResultId } = action;
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  if (diceResultId === 'repair') {
    const slotItem = getEquipmentInSlot(state, slotId);
    if (slotItem && slotItem.durability != null && slotItem.maxDurability != null) {
      const newDur = Math.min(slotItem.maxDurability, slotItem.durability + 1);
      patch[slotId] = { ...slotItem, durability: newDur } as EquipmentItem;
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `锻造赌运：${slotItem.name} 耐久 +1（${slotItem.durability}→${newDur}）` } });
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, banner: `锻造赌运成功！${slotItem.name} 耐久 +1！` });
    } else {
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, banner: '锻造赌运：装备已不存在。' });
    }
  } else {
    const monster = flattenActiveRowSlots(state.activeCards).find(c => c.id === monsterId);
    if (!monster) {
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, banner: '锻造赌运失败：目标怪物已消失。' });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    const oldLayers = monster.currentLayer ?? monster.fury ?? 1;
    if (oldLayers > 1) {
      patch.activeCards = state.activeCards.map(c => {
        if (!c || c.id !== monsterId) return c;
        return {
          ...c,
          currentLayer: oldLayers - 1,
          hp: c.maxHp ?? c.hp ?? 0,
          attack: (c.attack ?? c.value) + 2,
          value: (c.attack ?? c.value) + 2,
        };
      }) as typeof state.activeCards;
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `锻造赌运失败：${monster.name} 失去 1 血层（${oldLayers}→${oldLayers - 1}）并激怒（攻击+2）！` } });
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, banner: `锻造赌运失败！${monster.name} -1 血层并激怒（攻击+2）！` });
    } else {
      patch.activeCards = state.activeCards.map(c => {
        if (!c || c.id !== monsterId) return c;
        return {
          ...c,
          attack: (c.attack ?? c.value) + 2,
          value: (c.attack ?? c.value) + 2,
        };
      }) as typeof state.activeCards;
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `锻造赌运失败：${monster.name} 已是最后血层，激怒（攻击+2）！` } });
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, banner: `锻造赌运失败！${monster.name} 激怒（攻击+2）！` });
    }
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}
