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
  resetCardForGraveyard,
  getEffectiveHandLimit,
} from '../cards';
import { isPermRecycleEquipment, cardHasPermFlag } from '@/components/GameCard';
import { flattenActiveRowSlots, isDamageableTarget, sanitizeCardMetadata, isRecyclableFromHand, getCardPlayCategory, logHeroMagic, applyAmplifyToCard } from '../helpers';
import { hasEternalRelic } from '@/lib/eternalRelics';
import { computeAmuletEffects, getEquipmentInSlot, getEquipmentSlots, getReserve, setSlotBonusPure, repairDurabilityPure } from '../equipment';
import { maybeTriggerDeleteDrawForDestroy } from '../deleteDrawTrigger';
import { computeEquipmentDisplacementLastWords } from './equipment-effects';
import { applyEquipDestroyLastWords } from './waterfall';
import { routeReflectDamageToHero, tickStunAttemptDiscoverProgress } from './combat';
import { PERSUADE_COST, MIN_PERSUADE_COST, INITIAL_HP, BASE_BACKPACK_CAPACITY, FLIP_GOLD_REWARD, HAND_LIMIT, DUNGEON_COLUMN_COUNT, DURABILITY_CAP, clampMaxDurability } from '../constants';
import type { RngState } from '../rng';
import { nextInt, pickRandom, nextBool, shuffle as rngShuffle, nextId } from '../rng';
import { cloneClassCardsWithFreshIds, sampleDistinctByName } from '../cardClone';
import { resolveAllMagicEffects, resolvePendingMagic, getSpellDamage, computeMaxHp, applyMissileRelicEffects, resolveHandDiscardSelection, ensureMonsterEngaged } from './magic-effects';
import { resolveAllPotionEffects, resolvePendingPotion } from './potion-effects';
import { applyFlipCounters } from './flip-counters';
import { executeCardEffects, executeMagicCardEffects, executeOnEquip, executeOnEnterHand } from '../card-schema';
import { getHeroMagicDefinition } from '@/lib/heroMagic';
import type { HeroMagicId } from '@/components/GameCard';
import type { MirrorCopySelection, AmplifySelection } from '../types';
import { skillScrollImage } from '../deck';
import { rollPotionManuscriptFlip } from '../events';

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
    case 'RESOLVE_HAND_DISCARD_SELECTION':
      return resolveHandDiscardSelection(state, action);
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
    case 'SACRIFICE_EQUIPMENT_SLOT':
      return reduceSacrificeEquipmentSlot(state, action);
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
    case 'PLACE_BUILDING_IN_DUNGEON':
      return reducePlaceBuildingInDungeon(state, action);
    case 'EQUIP_FROM_HAND':
      return reduceEquipFromHand(state, action);
    case 'EQUIP_AMULET_FROM_HAND':
      // Thin marker — only purpose is to put the play through the transform chain.
      // Hook layer still handles aura/displacement/etc. for amulets.
      return {
        state,
        sideEffects: [],
        enqueuedActions: [
          { type: 'APPLY_TRANSFORM_CATEGORY', card: action.card },
        ],
      };
    case 'RESOLVE_DECK_JUDGE':
      return reduceResolveDeckJudge(state, action);
    case 'RESOLVE_STAT_SWAP':
      return reduceResolveStatSwap(state, action);
    case 'PROCESS_HERO_MAGIC_CARD':
      return reduceProcessHeroMagicCard(state, action);
    case 'APPLY_BERSERKER_RAGE':
      return reduceApplyBerserkerRage(state, action);
    case 'TRIGGER_GRAVE_NOVA':
      return reduceTriggerGraveNova(state, action);
    case 'FIRE_MISSILE_STORM_BOLT':
      return reduceFireMissileStormBolt(state, action);
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
        ensureMonsterEngaged(state, target, enqueuedActions);
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

    // Transform 链：weapon / shield 走 PLAY_CARD inline 装备分支，没有
    // RESOLVE_MAGIC / RESOLVE_POTION 这样的下游 reducer 来代为 enqueue，
    // 因此在此处显式加入，与 EQUIP_FROM_HAND 行为对齐。
    enqueuedActions.push({ type: 'APPLY_TRANSFORM_CATEGORY', card });
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
    // 咒纹刻印的 streak 自增统一在 reduceResolveMagic 里完成，
    // 这样可以同时覆盖 PLAY_CARD（点击播放）与 GameBoard.handleCardToHero
    // 直接 dispatch RESOLVE_MAGIC（拖动出牌）两条触发路径。
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

  const sideEffects: SideEffect[] = [
    { event: 'log:entry', payload: { type: 'magic', message: `「${card.name}」触发上手效果。` } },
  ];
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
  const sanitized = resetCardForGraveyard(cardWithoutSlot, state.gameMode === 'quick');

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
  // Each equipped amulet ticks the counter independently (N → +N per recycle).
  const recycleAmulets = (state.amuletSlots as GameCardData[]).filter(
    s => s?.amuletEffect === 'recycle-backpack-expand',
  );
  if (recycleAmulets.length > 0) {
    const anyUpgraded = recycleAmulets.some(a => (a.upgradeLevel ?? 0) >= 1);
    const recycleThreshold = anyUpgraded ? 6 : 8;
    const progress = (state.recycleBackpackProgress ?? 0) + recycleAmulets.length;
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
// 集甲之符 (equip-amulet-cap) — 每装备 6 件 → maxAmuletSlots +1
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
  // Each equipped 集甲之符 ticks the equip counter independently
  // (N → +N progress per equip event).
  const equipCapAmulets = (state.amuletSlots as GameCardData[]).filter(
    s => s?.amuletEffect === 'equip-amulet-cap',
  );
  if (equipCapAmulets.length === 0) return;
  const equipThreshold = 6;
  const baseProgress = patch.equipAmuletCapProgress ?? state.equipAmuletCapProgress ?? 0;
  const next = baseProgress + equipCapAmulets.length;
  if (next >= equipThreshold) {
    patch.equipAmuletCapProgress = 0;
    patch.maxAmuletSlots = (patch.maxAmuletSlots ?? state.maxAmuletSlots ?? 0) + 1;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'amulet', message: `${equipCapAmulets[0].name}：累计装备 ${equipThreshold} 个装备，护符栏上限 +1！` },
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

// ---------------------------------------------------------------------------
// EQUIP_FROM_HAND — 手牌拖到装备栏触发的"play"标记。
//
// 由 GameBoard 的 drag handler 在调用 SET_EQUIPMENT_SLOT 把卡放入槽位之后
// dispatch 过来。Reducer 此时只负责跑装备的 onEquipEffect、equip-empower
// 永恒护符这两类与槽位绑定的副作用，并把 transform 链续上。
//
// 注意：reducePlayCard 的 weapon/shield 分支已经自带相同的 on-equip /
// equip-empower 逻辑，所以"点击出牌"的玩法不会经过这里——这条路径只服务
// 于"拖到指定槽"的玩法，避免 drag 路径漏触发 on-equip（曾经的 bug：
// 赏金之剑 / 足锡冲锋 拖到槽位时 gold+6 / temp-attack-3 没有效果）。
// ---------------------------------------------------------------------------

function reduceEquipFromHand(
  state: GameState,
  action: Extract<GameAction, { type: 'EQUIP_FROM_HAND' }>,
): ReduceResult {
  const { card, slotId } = action;
  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};
  const enqueuedActions: GameAction[] = [];

  if (card.onEquipEffect) {
    executeOnEquip(state, card, slotId, patch, sideEffects, enqueuedActions);
  }

  if (hasEternalRelic(state.eternalRelics ?? [], 'equip-empower')) {
    const tempAttack = patch.slotTempAttack ?? { ...(state.slotTempAttack ?? {}) };
    const tempArmor = patch.slotTempArmor ?? { ...(state.slotTempArmor ?? {}) };
    tempAttack[slotId] = (tempAttack[slotId] ?? 0) + 3;
    tempArmor[slotId] = (tempArmor[slotId] ?? 0) + 3;
    patch.slotTempAttack = tempAttack;
    patch.slotTempArmor = tempArmor;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `铸锋药剂：${card.name} 装备时，该装备栏临时攻击 +3，临时护甲 +3！` },
    });
  }

  // 集甲之符：拖拽装备到槽位也是一次"装备事件"，与 PLAY_CARD / EQUIP_CARD 路径对齐。
  applyEquipAmuletCapProgress(state, patch, sideEffects);

  enqueuedActions.push({ type: 'APPLY_TRANSFORM_CATEGORY', card });

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

function reduceResolvePotion(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_POTION' }>,
): ReduceResult {
  // Try card-schema engine first; fall back to legacy if not registered
  const engineResult = executeCardEffects(state, action.card);
  const result = engineResult ?? resolveAllPotionEffects(state, action.card);
  return appendTransformEnqueue(result, action.card);
}

// ---------------------------------------------------------------------------
// RESOLVE_MAGIC — apply magic card effects
// ---------------------------------------------------------------------------

function reduceResolveMagic(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_MAGIC' }>,
): ReduceResult {
  const engineResult = executeMagicCardEffects(state, action.card, action.target, action.isFlank);
  const result = engineResult ?? resolveAllMagicEffects(state, action.card, action.target, action.isFlank);
  const withMagicDiscover = applyMagicClassDiscoverStreak(result, action.card);
  return appendTransformEnqueue(withMagicDiscover, action.card);
}

// ---------------------------------------------------------------------------
// 咒纹刻印 (magic-class-discover)：每使用 8 张 magic 牌（仅 type === 'magic'，
// 不计 hero-magic / curse），发现一张专属牌。计数与触发都在 RESOLVE_MAGIC 收口
// 完成，确保所有出牌路径（PLAY_CARD enqueue、GameBoard.handleCardToHero 直发、
// useEventSystem 的 useKnightSkill event token 等）都会增加 streak。
// echo / 回响在引擎内部循环，不会重复 dispatch RESOLVE_MAGIC，所以此处每次
// dispatch 只会自增一次，与"使用一张魔法牌"的语义一致。
// ---------------------------------------------------------------------------

function applyMagicClassDiscoverStreak(result: ReduceResult, card: GameCardData): ReduceResult {
  if (card.type !== 'magic') return result;
  const stateAfter = result.state;
  const magicDiscoverCount = (stateAfter.amuletSlots as GameCardData[]).filter(
    s => s?.amuletEffect === 'magic-class-discover',
  ).length;
  if (magicDiscoverCount <= 0) return result;
  const threshold = 8;
  const nextStreak = (stateAfter.classMagicDiscoverStreak ?? 0) + magicDiscoverCount;
  if (nextStreak >= threshold) {
    return {
      ...result,
      state: { ...stateAfter, classMagicDiscoverStreak: 0 },
      sideEffects: [
        ...result.sideEffects,
        { event: 'combat:classMagicDiscoverTriggered', payload: { threshold } },
      ],
    };
  }
  return {
    ...result,
    state: { ...stateAfter, classMagicDiscoverStreak: nextStreak },
  };
}

// ---------------------------------------------------------------------------
// appendTransformEnqueue — helper to push APPLY_TRANSFORM_CATEGORY at the
// END of a ReduceResult.enqueuedActions, so transform fires AFTER all the
// reducer's own follow-up actions (matches the legacy hook-layer behavior of
// dispatching RESOLVE_* and APPLY_TRANSFORM_CATEGORY sequentially).
// ---------------------------------------------------------------------------

function appendTransformEnqueue(result: ReduceResult, card: GameCardData): ReduceResult {
  return {
    ...result,
    enqueuedActions: [
      ...(result.enqueuedActions ?? []),
      { type: 'APPLY_TRANSFORM_CATEGORY', card },
    ],
  };
}

// ---------------------------------------------------------------------------
// PLACE_BUILDING_IN_DUNGEON — place a building card from hand or backpack
// into a randomly chosen empty active-row slot. If no empty slot exists,
// route the card to the player's graveyard. Always enqueues
// APPLY_TRANSFORM_CATEGORY so the play participates in the transform chain.
//
// Hook layer is still responsible for *removing* the card from its source
// (consumeCardFromHand / UPDATE_BACKPACK_ITEMS) BEFORE dispatching this
// action; the reducer only performs the destination-side bookkeeping.
// ---------------------------------------------------------------------------

function reducePlaceBuildingInDungeon(
  state: GameState,
  action: Extract<GameAction, { type: 'PLACE_BUILDING_IN_DUNGEON' }>,
): ReduceResult {
  const { card, source } = action;
  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};
  const enqueuedActions: GameAction[] = [];

  const emptySlots: number[] = [];
  for (let i = 0; i < DUNGEON_COLUMN_COUNT; i++) {
    if (state.activeCards[i] == null) emptySlots.push(i);
  }

  if (emptySlots.length > 0) {
    const [targetSlot, nextRng] = pickRandom(emptySlots, state.rng);
    patch.rng = nextRng;
    const placed = { ...card, hasReleaseCharge: true, _fateBladeLastSlot: targetSlot } as GameCardData;
    const nextRow = [...(state.activeCards as (GameCardData | null)[])];
    nextRow[targetSlot] = placed;
    patch.activeCards = nextRow as ActiveRowSlots;

    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'event', message: `${card.name} 被放置到地城第 ${targetSlot + 1} 列。` },
    });

    // 命运之刃的"出手 -5HP"只在从手牌打出时触发，与 hook 层旧行为保持一致。
    if (source === 'hand' && card.name === '命运之刃') {
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 5, source: 'general', selfInflicted: true });
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'event', message: '命运之刃：从手牌打出，失去 5 点生命。' },
      });
      patch.heroSkillBanner = `${card.name} 出现在地城中！失去 5 点生命。`;
    } else {
      patch.heroSkillBanner = `${card.name} 出现在地城中！`;
    }
  } else {
    // 没空位 → 进入玩家坟场
    enqueuedActions.push({ type: 'DISCARD_OWNED_CARD', card, owner: 'player' });
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'event', message: `${card.name}：地城没有空位，已送入坟场。` },
    });
    patch.heroSkillBanner = `地城没有空位，${card.name} 已送入坟场。`;
  }

  enqueuedActions.push({ type: 'APPLY_TRANSFORM_CATEGORY', card });

  return applyPatch(state, patch, sideEffects, enqueuedActions);
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

  // Anti-magic reflect: unstunned monsters with antiMagicReflect deal damage
  // to hero. Each monster's reflect routes through the shared dragon-breath-
  // style helper: a random shield slot's armor absorbs first; if no shield is
  // equipped, the damage falls onto tempShield/HP via APPLY_DAMAGE. The rng
  // is chained across monsters so every random shield pick uses fresh entropy.
  // Curse cards are not "spells the player chose to cast" — they auto-resolve
  // to enforce a penalty — so they MUST NOT trigger Golem's 反魔 reflect.
  let rng = state.rng;
  let armorPatch: Partial<GameState> = {};
  // Use the running armorPatch as a snapshot so successive reflects in the
  // same loop see each other's slot changes (an armor break in one iteration
  // must be visible to the next).
  let liveState = state;
  if (card.type !== 'curse') {
    const activeCards = flattenActiveRowSlots(state.activeCards);
    for (const ac of activeCards) {
      if (ac && ac.antiMagicReflect && ac.antiMagicReflect > 0 && !ac.isStunned) {
        const reflectDmg = ac.antiMagicReflect;
        // Trigger the skill float BEFORE the routed reflect damage so the
        // animation pauses the pipeline, then the actual reflect resolves
        // once the player has read the skill name.
        enqueuedActions.push({
          type: 'TRIGGER_MONSTER_SKILL_FLOAT',
          monsterId: ac.id,
          skillKey: 'reflect:antiMagic',
        });
        const route = routeReflectDamageToHero(liveState, reflectDmg, ac.name, '反魔', rng);
        armorPatch = { ...armorPatch, ...route.patch };
        liveState = { ...liveState, ...route.patch };
        rng = route.rng;
        sideEffects.push(...route.sideEffects);
        enqueuedActions.push(...route.enqueuedActions);
      }
    }
  }
  Object.assign(patch, armorPatch);
  patch.rng = rng;

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
      // Aura reversal is handled centrally by `postProcessAmuletAura` in
      // reducer.ts — no manual slotTempAttack/Armor diff needed here.
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

  // 「招灵书印」(delete-draw): mirrors the trigger in `reduceConfirmDeleteCard`.
  // `DELETE_CARD` is the canonical zone-removal primitive — keep the trigger
  // wired here so any future migration of CONFIRM_DELETE_CARD to dispatch
  // through DELETE_CARD still benefits from the amulet, and so direct test
  // coverage of `DELETE_CARD` exercises the same path.
  const enqueuedActions: GameAction[] = [];
  const ae = computeAmuletEffects(state.amuletSlots as GameCardData[]);
  if (ae.deleteDrawCount > 0) {
    const drawCount = 2 * ae.deleteDrawCount;
    enqueuedActions.push({ type: 'DRAW_CARDS', count: drawCount, source: 'backpack' });
    sideEffects.push({
      event: 'log:entry',
      payload: {
        type: 'amulet',
        message: `招灵书印：删除「${cardToDelete.name}」，从背包抽 ${drawCount} 张牌`,
      },
    });
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// CONVERT_AMULETS_TO_GOLD
// ---------------------------------------------------------------------------

function reduceConvertAmuletsToGold(
  state: GameState,
  action: Extract<GameAction, { type: 'CONVERT_AMULETS_TO_GOLD' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  if (!state.amuletSlots.length) return noChange(state);

  // Aura reversal is handled centrally by `postProcessAmuletAura` in
  // reducer.ts — clearing amuletSlots is enough.
  // Perm 护符（永恒铭刻 等）→ 回收袋；普通护符 → 坟场。
  // 与 events.ts:removeAllAmulets / amuletsToGold+10 保持一致。
  const count = state.amuletSlots.length;
  const payout = action.amountPer * count;
  const permAmulets: GameCardData[] = [];
  const nonPermAmulets: GameCardData[] = [];
  for (const a of state.amuletSlots) {
    if (cardHasPermFlag(a as GameCardData)) permAmulets.push(a as GameCardData);
    else nonPermAmulets.push(a as GameCardData);
  }
  if (nonPermAmulets.length > 0) {
    patch.discardedCards = [...state.discardedCards, ...nonPermAmulets];
  }
  patch.amuletSlots = [];
  patch.gold = state.gold + payout;
  patch.heroSkillBanner = `${count} 枚护符转化为 ${payout} 金币！`;

  for (const card of permAmulets) {
    enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card });
  }

  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'amulet', message: `${count} 枚护符转化为 ${payout} 金币` },
  });

  // 招灵书印：「护符换金币」也算强制销毁。所有护符被清空 → surviving=0
  // → 通常不触发，但保留入口一致性，与 events.ts:amuletsToGold+10 行为对齐。
  maybeTriggerDeleteDrawForDestroy({
    destroyedCards: [...state.amuletSlots] as GameCardData[],
    survivingAmuletSlots: patch.amuletSlots ?? [],
    sideEffects,
    enqueuedActions,
    reasonLabel: '护符换金币',
  });

  return applyPatch(state, patch, sideEffects, enqueuedActions.length > 0 ? enqueuedActions : undefined);
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

  // Class deck is an infinite template — we sample distinct-by-name from
  // the (filtered) pool, then clone each pick with a fresh id. The
  // template is NOT mutated.
  let source = state.classDeck;
  if (action.includeIds && action.includeIds.length > 0) {
    const includeSet = new Set(action.includeIds);
    source = source.filter(c => includeSet.has(c.id));
  }
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

  if (source.length === 0) return noChange(state);

  const takeCount = Math.min(action.count, source.length);
  const [picks, rngAfterSample] = sampleDistinctByName(source, takeCount, state.rng, rngShuffle);
  if (picks.length === 0) return noChange(state);

  const [drawn, rngAfterClone] = cloneClassCardsWithFreshIds(picks, rngAfterSample);
  patch.rng = rngAfterClone;

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
    payload: { type: 'skill', message: `从职业牌组获得 ${drawn.length} 张牌：${drawn.map(c => c.name).join('、')}` },
  });
  sideEffects.push({
    event: 'cards:classDrawn',
    payload: { cards: drawn },
  });

  // 「弹幕之符」(card-gain-missile) etc.: emit once per gain event
  // ("同时获得多张算一次") regardless of count. Overflow-only draws (all
  // cards spilled to recycle bag) do not count as a gain — match the
  // ADD_TO_BACKPACK convention which suppresses the event on full overflow.
  if (toBackpack.length > 0) {
    sideEffects.push({
      event: 'card:newCardGained',
      payload: { count: 1, source: 'classPool' },
    });
  }

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
      ensureMonsterEngaged(state, target, enqueuedActions);
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
  if (amuletFx.catapultCount > 0 && owner === 'player' && !opts?.toRecycleBag && !opts?.isEquipmentDisplace) {
    const drawCount = 2 * amuletFx.catapultCount;
    enqueuedActions.push({ type: 'DRAW_CARDS', count: drawCount, source: 'backpack' });
    sideEffects.push({ event: 'log:entry', payload: { type: 'amulet', message: `弹射护符：弃置「${card.name}」后从背包抽 ${drawCount} 张牌` } });
  }

  // 弃能之符 (discard-zap): one independent random-monster zap per equipped amulet on every discard.
  // (Unless the card being discarded is itself a discard-zap amulet — to avoid infinite loop.)
  if (card.amuletEffect !== 'discard-zap' && !opts?.toRecycleBag && amuletFx.discardShockCount > 0) {
    sideEffects.push({ event: 'card:discardShock', payload: { count: amuletFx.discardShockCount } });
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
  if (!card.flipTarget) return noChange(state);

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  // 药剂遗稿 special case: when an *external* flipper (乾坤一翻 / 万象齐转) hits
  // 药剂遗稿, its `flipTarget` is the static "翻转结果由选项决定" placeholder
  // (the badge needs a non-null flipTarget to render). Rolling one of the visible
  // eventChoices here ensures both external flippers — and any future ones —
  // produce a real flip outcome instead of replacing the slot with the placeholder.
  // The player-choice path patches `currentEventCard.flipTarget` BEFORE
  // COMPLETE_EVENT enqueues APPLY_CARD_FLIP, so by the time we get here on that
  // path, the flipTarget already points at a real card and `rollPotionManuscriptFlip`
  // returns null (placeholder name no longer matches). flipToTwoUpgradeScrolls
  // additionally pushes a 2nd scroll into `activeCardStacks[idx]` so the second
  // scroll surfaces after the top one is consumed (LIFO).
  let flip = card.flipTarget;
  let manuscriptRollLog: string | null = null;
  const manuscriptRoll = rollPotionManuscriptFlip(card, state.rng);
  if (manuscriptRoll) {
    flip = manuscriptRoll.flipTarget;
    patch.rng = manuscriptRoll.rng;
    if (manuscriptRoll.extraStackCard) {
      const stackIdx = cellIndex ?? state.activeCards.findIndex(c => c?.id === card.id);
      if (stackIdx >= 0) {
        const currentStacks = state.activeCardStacks ?? {};
        const existing = currentStacks[stackIdx] ?? [];
        patch.activeCardStacks = {
          ...currentStacks,
          [stackIdx]: [...existing, manuscriptRoll.extraStackCard],
        };
      }
    }
    manuscriptRollLog = `药剂遗稿被随机翻转：${manuscriptRoll.chosenText}`;
  }

  const destination = flip.destination ?? 'graveyard';

  if (manuscriptRollLog) {
    sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: manuscriptRollLog } });
  }
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

  // Capture flip-gold count BEFORE applyFlipCounters runs (so we can pass the
  // hint to the full-screen overlay's coin animation). applyFlipCounters reads
  // the same state-level amulet effects, so this is the same value it'll use.
  const amuletFxForOverlay = computeAmuletEffects(state.amuletSlots);

  applyFlipCounters(state, patch, sideEffects, enqueuedActions);

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
      payload: { fromCard: card, toCard: flip.toCard, message: flip.message ?? '', hasFlipGold: amuletFxForOverlay.flipGoldCount > 0 },
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

  // Perm-priority: equipment carrying a Perm flag (永恒铭刻 / native permEquipment)
  // MUST route to the recycle bag, even when 残骸回收符 is equipped. Salvage
  // would otherwise consume the card (or vanish it via maxDur underflow), which
  // contradicts the contract「Perm 装备损毁后进回收袋」. Determined here so the
  // salvage early-return below skips Perm cards.
  const isPermRecycle = !card.permStripped && (
    isPermRecycleEquipment(card)
    || ((card.type === 'weapon' || card.type === 'shield' || card.type === 'monster')
      && card.recycleDelay != null && card.recycleDelay > 0)
  );

  if (
    !isPermRecycle
    && isDestruction
    && amuletFx.equipmentSalvageCount > 0
    && (card.type === 'weapon' || card.type === 'shield')
  ) {
    const newMaxDur = (card.maxDurability ?? 1) - amuletFx.equipmentSalvageCount;
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

  const toRecycleBag = isPermRecycle;

  if (toRecycleBag) {
    enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card });
  } else {
    enqueuedActions.push({ type: 'ADD_TO_GRAVEYARD', card });
  }

  // 装备/护符栏被新装备顶替（由 reducePlayCard / reduceEquipCard /
  // GameBoard 拖拽 & 劝降 路径用 triggerLastWords:true 标记）。UI 侧
  // 监听 equipment:displaced，从来源槽位飞向坟场 / 回收袋。
  // 残骸回收符（salvage）的早返路径（卡片回到手牌）在前面已经 return，
  // 不会触发这里——避免误发"飞向坟场"动画。
  if (triggerLastWords) {
    const slotForDisplace =
      fromSlotId
      ?? ((card as GameCardData & { fromSlot?: EquipmentSlotId }).fromSlot)
      ?? 'equipmentSlot1';
    sideEffects.push({
      event: 'equipment:displaced',
      payload: {
        card,
        slotId: slotForDisplace,
        destination: toRecycleBag ? 'recycle-bag' : 'graveyard',
      },
    });
  }

  if (!isDestruction) {
    enqueuedActions.push({ type: 'APPLY_DISCARD_EFFECTS', card, owner: 'player', opts: { toRecycleBag, isEquipmentDisplace: true } });
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// SACRIFICE_EQUIPMENT_SLOT — destroy active equipment in a slot as a player
// sacrifice (event choice). Mirrors the events.ts `discardCurrentLeftForGold+15`
// pattern: fires destroy last-words → honors revive → otherwise disposes and
// promotes the topmost reserve item.
//
// Bug history: previously, `useCardOperations.ts:sacrificeEquipment` issued a
// bare `DISPOSE_EQUIPMENT_CARD` without `isDestruction` or `triggerLastWords`,
// which silently skipped all `onDestroyDraw / onDestroyHeal / ...` last-words
// effects. Affected callers: 暗影契约「献出装备」, 命运十字路口「破坏下方装备」.
// ---------------------------------------------------------------------------

function reduceSacrificeEquipmentSlot(
  state: GameState,
  action: Extract<GameAction, { type: 'SACRIFICE_EQUIPMENT_SLOT' }>,
): ReduceResult {
  const { slotId } = action;
  const slotItem = slotId === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
  if (!slotItem) return noChange(state);

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  const card = slotItem as GameCardData;

  applyEquipDestroyLastWords(card, slotId, state, patch, sideEffects, enqueuedActions);

  const isMonsterEquip = card.type === 'monster';
  const nativeRevive = isMonsterEquip && card.hasRevive && !card.reviveUsed;
  const equipRevive = card.hasEquipmentRevive && !card.equipmentReviveUsed;

  if (nativeRevive || equipRevive) {
    const revivedItem = nativeRevive
      ? { ...card, durability: 1, reviveUsed: true }
      : { ...card, durability: 1, equipmentReviveUsed: true };
    patch[slotId] = revivedItem as EquipmentItem;
    sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 复生！以 1 耐久复活！` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `${card.name} 复生了！` } });
  } else {
    enqueuedActions.push({ type: 'DISPOSE_EQUIPMENT_CARD', card: { ...card } as GameCardData, isDestruction: true });
    const reserveKey = slotId === 'equipmentSlot1' ? 'equipmentSlot1Reserve' : 'equipmentSlot2Reserve';
    const reserve = state[reserveKey] as EquipmentItem[];
    if (reserve.length > 0) {
      const promoted = reserve[reserve.length - 1];
      patch[slotId] = promoted;
      patch[reserveKey] = reserve.slice(0, -1) as EquipmentItem[];
    } else {
      patch[slotId] = null;
    }
    // 招灵书印：暗影契约「献出装备」/ 命运十字路口「破坏下方装备」=
    // 玩家被动牺牲一件装备 = 强制销毁。装备销毁不影响护符栏 →
    // surviving = state.amuletSlots。复生路径上面已经 return 不会到这里。
    maybeTriggerDeleteDrawForDestroy({
      destroyedCards: [card],
      survivingAmuletSlots: state.amuletSlots as GameCardData[],
      sideEffects,
      enqueuedActions,
      reasonLabel: '献祭装备',
    });
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
  // Count amulets — each one ticks independently (N per play).
  const recycleCount = (state.amuletSlots as GameCardData[])
    .filter(s => s?.amuletEffect === 'recycle-forge').length;
  if (recycleCount === 0) {
    return noChange(state);
  }

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  const next = (state.recycleForgePlayCount ?? 0) + recycleCount;
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
    // 跟 waterfall.ts、turn.ts (幽魂净化)、magic-effects.ts (回收余韵 / 洗册归川 / 回收灵焰) 一致：
    // 任意「回收袋 → 背包」位移都通知 BackpackZone 播绿环动画。
    {
      event: 'waterfall:recycleRestored',
      payload: { count: result.restored.length, cards: result.restored },
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
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  const reserve = getReserve(state, slotId);
  const reserveKey = slotId === 'equipmentSlot1' ? 'equipmentSlot1Reserve' : 'equipmentSlot2Reserve';

  const cleanedItem = sanitizeCardMetadata(slotItem as GameCardData);
  // Honor the chaos-dice "装备回手（满则回收袋）" contract: if hand is at
  // limit, route the equipment into the recycle bag instead of overflowing
  // the hand. This is currently the only caller, so it's safe to apply
  // unconditionally; future callers wanting strict hand-only behavior can
  // extend the action payload.
  const handFull = state.handCards.length >= getEffectiveHandLimit(state);
  if (handFull) {
    enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card: cleanedItem });
    sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `手牌已满，${slotItem.name} 进入回收袋` } });
  } else {
    patch.handCards = [...state.handCards, cleanedItem];
    sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${slotItem.name} 回到手牌` } });
    sideEffects.push({ event: 'card:queueToHand', payload: { card: cleanedItem, sourceHint: slotId } });
  }

  if (reserve.length > 0) {
    const promoted = reserve[reserve.length - 1];
    patch[slotId] = { ...promoted, fromSlot: slotId } as EquipmentItem;
    patch[reserveKey] = reserve.slice(0, -1) as EquipmentItem[];
  } else {
    patch[slotId] = null;
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions.length > 0 ? enqueuedActions : undefined);
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

  // 源卡可以是 magic（pendingMagicAction）或 potion（pendingPotionAction，knight 专属「增幅秘药」）。
  const sourceType: 'magic' | 'potion' = modal.sourceType ?? 'magic';
  const sourceCard = sourceType === 'potion'
    ? (state.pendingPotionAction?.card as GameCardData | undefined)
    : (state.pendingMagicAction?.card as GameCardData | undefined);
  if (!sourceCard) return applyPatch(state, patch);

  const finalizeType: 'FINALIZE_MAGIC_CARD' | 'FINALIZE_POTION_CARD' =
    sourceType === 'potion' ? 'FINALIZE_POTION_CARD' : 'FINALIZE_MAGIC_CARD';

  const { selection } = action;
  let targetCardId: string | undefined;
  let targetName: string | undefined;

  if (selection.kind === 'equipment') {
    const slotItem = getEquipmentInSlot(state, selection.slotId);
    if (!slotItem) {
      enqueuedActions.push({ type: finalizeType, card: sourceCard, banner: '增幅：目标装备已不存在。' });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    targetCardId = slotItem.id;
    targetName = slotItem.name;
  } else if (selection.kind === 'hand') {
    const targetCard = state.handCards.find(c => c.id === selection.cardId);
    if (!targetCard) {
      enqueuedActions.push({ type: finalizeType, card: sourceCard, banner: '增幅：目标卡牌已不在手牌中。' });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    targetCardId = targetCard.id;
    targetName = targetCard.name;
  } else {
    // 'backpack' — 仅 wide scope（potion）允许；narrow scope 不会发出此 selection
    const targetCard = state.backpackItems.find(c => c.id === selection.cardId);
    if (!targetCard) {
      enqueuedActions.push({ type: finalizeType, card: sourceCard, banner: '增幅：目标卡牌已不在背包中。' });
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
    description: `永久魔法（Perm 1）：对「${targetName}」进行增幅（武器攻击+1，护盾护甲+1，伤害魔法伤害+1）。`,
    recycleDelay: 1,
    _amplifyTargetCardId: targetCardId,
    _amplifyTargetName: targetName,
  };

  enqueuedActions.push({ type: 'ADD_TO_BACKPACK', card: amplifyPermCard });
  sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `增幅：为「${targetName}」生成永久增幅魔法（Perm 1），已放入背包。` } });
  enqueuedActions.push({ type: finalizeType, card: sourceCard, banner: `增幅：为「${targetName}」生成永久增幅魔法（Perm 1）！` });

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

  // 源卡可以是 magic 或 potion；按 sourceType 路由 finalize。
  const sourceType: 'magic' | 'potion' = modal.sourceType ?? 'magic';
  const sourceCard = sourceType === 'potion'
    ? (state.pendingPotionAction?.card as GameCardData | undefined)
    : (state.pendingMagicAction?.card as GameCardData | undefined);
  if (sourceCard) {
    const finalizeType: 'FINALIZE_MAGIC_CARD' | 'FINALIZE_POTION_CARD' =
      sourceType === 'potion' ? 'FINALIZE_POTION_CARD' : 'FINALIZE_MAGIC_CARD';
    enqueuedActions.push({ type: finalizeType, card: sourceCard, banner: '取消了增幅。' });
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
      c.id === targetCardId ? { ...c, transformBonus: '失去 3 点生命，随机获得坟场一张魔法卡', transformEffect: 'graveyard-random-magic' } : c,
    );
    sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `蜕变赋灵：「${targetCard.name}」获得转型效果！` } });
    if (sourceCard.classCard) {
      enqueuedActions.push({ type: 'REMOVE_CLASS_CARD_FROM_HAND', cardId: sourceCard.id });
    }
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card: sourceCard, banner: `「${targetCard.name}」获得转型：失去 3 点生命，随机获得坟场一张魔法卡！` });
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
      const prevMax = updated.maxDurability;
      const newMax = clampMaxDurability(prevMax + 1);
      updated.maxDurability = newMax;
      const gained = newMax - prevMax;
      updated.durability = Math.min(newMax, (updated.durability ?? 0) + Math.max(gained, 1));
      if (gained > 0) {
        parts.push(`耐久上限 +${gained}，耐久 +${gained}`);
      } else {
        parts.push(`耐久上限已达 ${DURABILITY_CAP}，仅恢复 1 点耐久`);
      }
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

  // 使用 chainPrevCat（transformChainPrevCategory）而不是 state.lastPlayedCardCategory，
  // 因为后者会被 magic resolver 在 APPLY_TRANSFORM_CATEGORY 之前提前覆盖为当前牌的类别，
  // 导致 magic 牌的 transform 永远不会触发。chainPrevCat 只在本 reducer 中维护，是可靠值。
  const prevCat = chainPrevCat;
  if (prevCat == null || prevCat === curCat) return applyPatch(state, patch);

  if (card.transformEffect === 'graveyard-random-magic') {
    const magicCards = state.discardedCards.filter(c => c.type === 'magic');
    if (magicCards.length > 0) {
      const [picked, rng2] = pickRandom(magicCards, rng);
      rng = rng2;
      patch.rng = rng;
      patch.discardedCards = state.discardedCards.filter(c => c.id !== picked.id);
      patch.handCards = [...state.handCards, picked];
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 3, source: 'general', selfInflicted: true });
      sideEffects.push({ event: 'card:queueToHand', payload: { card: picked } });
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: `转型触发：失去 3 点生命，从坟场获得「${picked.name}」！` } });
      sideEffects.push({ event: 'ui:banner', payload: { text: `转型触发！失去 3 点生命，从坟场获得「${picked.name}」！` } });
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
    ensureMonsterEngaged(state, monster, enqueuedActions);
    enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster.id, damage: dmg, source: 'grave-nova', isSpellDamage: true });
  }

  patch.heroSkillBanner = `殉烈爆鸣释放，对所有怪物造成 ${dmg} 点伤害！`;

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// FIRE_MISSILE_STORM_BOLT — fire one bolt from 魔弹风暴.
//
// Picks a random LIVE monster at fire time so:
//   * If the previous bolt killed the original snapshot target, this bolt
//     still lands on a remaining live monster (instead of being wasted).
//   * If the original target was revived (Branch B of MONSTER_DEFEATED), it is
//     part of the live pool again and may be re-targeted.
//   * If no live targets remain (e.g. last monster died with no revive), the
//     bolt fizzles with a log entry.
//
// The resolver pre-computed `damage` (with per-bolt amplify already applied)
// so this reducer only needs to pick a target, enqueue the damage action, and
// emit the FX side effect.
// ---------------------------------------------------------------------------

function reduceFireMissileStormBolt(
  state: GameState,
  action: Extract<GameAction, { type: 'FIRE_MISSILE_STORM_BOLT' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  const liveMonsters = flattenActiveRowSlots(state.activeCards).filter(
    c => isDamageableTarget(c) && (c.hp ?? 0) > 0 && (c.currentLayer ?? 1) > 0,
  );

  if (liveMonsters.length === 0) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'magic', message: `魔弹风暴：第 ${action.boltIndex + 1} 枚魔弹熄灭——场上已无可击目标。` },
    });
    return applyPatch(state, patch, sideEffects);
  }

  const [target, nextRng] = pickRandom(liveMonsters, state.rng);
  patch.rng = nextRng;

  ensureMonsterEngaged(state, target, enqueuedActions);
  enqueuedActions.push({
    type: 'DEAL_DAMAGE_TO_MONSTER',
    monsterId: target.id,
    damage: action.damage,
    source: 'missile-storm',
    isSpellDamage: true,
  });
  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'magic', message: `魔弹风暴：第 ${action.boltIndex + 1} 枚魔弹对 ${target.name} 造成 ${action.damage} 点法术伤害` },
  });
  sideEffects.push({
    event: 'combat:missileStormBolt',
    payload: {
      targetId: target.id,
      damage: action.damage,
      boltIndex: action.boltIndex,
      totalBolts: action.totalBolts,
    },
  });

  applyMissileRelicEffects(state, patch, sideEffects, enqueuedActions, target);

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
    // No monsterId means the card was played while the board had no monsters.
    // The enrage outcome has nothing to enrage — equipment gains no durability,
    // we just log the miss and finalize.
    if (!monsterId) {
      sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: '锻造赌运失败：场上没有怪物可激怒。' } });
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, banner: '锻造赌运失败：场上没有怪物可激怒。' });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
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
