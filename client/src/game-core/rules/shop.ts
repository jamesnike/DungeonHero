/**
 * Shop Rules — handles shop-related actions in the reducer.
 *
 * Covers: OPEN_SHOP, CLOSE_SHOP, PURCHASE, SHOP_HEAL, SHOP_LEVEL_UP,
 *         SHOP_DELETE_EQUIPMENT, SHOP_DISCOVER.
 *
 * Delegates to existing pure functions in ../shop.ts.
 */

import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ReduceResult, SideEffect } from '../reducer';
import { applyPatch, noChange } from '../reducer';
import {
  openShopPure,
  closeShopPure,
  purchaseFromShopPure,
  shopHealPure,
  shopLevelUpPure,
  shopEquipBoostPure,
  shopRefreshPure,
  shopSelectSkillPure,
  applyMonsterRewardPure,
} from '../shop';
import { dequeueMonsterRewardPure, generateMonsterRewardOptions } from '../monsters';
import { upgradeCardPure } from '../cardUpgrade';
import { SHOP_EQUIP_BOOST_COST, SHOP_SKILL_DISCOVER_COST, SHOP_REFRESH_COST, MAX_SHOP_LEVEL } from '../constants';
import { shuffle as rngShuffle, nextId } from '../rng';
import { applyAmplifyOnCreate } from '../helpers';
import { computeAmuletEffectsForState } from '../equipment';
import { minionImage, createStarterHealEchoCard } from '../deck';
import { cloneClassCardWithFreshId, sampleDistinctByName } from '../cardClone';
import { BASE_BACKPACK_CAPACITY } from '../constants';
import { getEffectiveHandLimit, resetCardForGraveyard } from '../cards';
import { filterAvailableClassPool, markUniqueAcquired } from '../uniqueClass';
import statSwapCardImage from '@assets/generated_images/knight_stat_swap_potion.png';

export function reduceShopActions(state: GameState, action: GameAction): ReduceResult | null {
  switch (action.type) {
    case 'OPEN_SHOP':
      return reduceOpenShop(state, action);
    case 'CLOSE_SHOP':
      return reduceCloseShop(state);
    case 'PURCHASE':
      return reducePurchase(state, action);
    case 'SHOP_HEAL':
      return reduceShopHeal(state);
    case 'SHOP_LEVEL_UP':
      return reduceShopLevelUp(state);
    case 'SHOP_DELETE_EQUIPMENT':
      return reduceShopDeleteEquipment(state, action);
    case 'SHOP_DISCOVER':
      return reduceShopDiscover(state, action);
    case 'SHOP_EQUIP_BOOST':
      return reduceShopEquipBoost(state, action);
    case 'SHOP_REFRESH':
      return reduceShopRefresh(state);
    case 'SHOP_SKILL_DISCOVER':
      return reduceShopSkillDiscover(state, action);
    case 'SHOP_SELECT_SKILL':
      return reduceShopSelectSkill(state, action);
    case 'UPGRADE_CARD':
      return reduceUpgradeCard(state, action);
    case 'APPLY_MONSTER_REWARD':
      return reduceApplyMonsterReward(state, action);
    case 'DEQUEUE_MONSTER_REWARD':
      return reduceDequeueMonsterReward(state);
    case 'ADJUST_SHOP_LEVEL':
      return applyPatch(state, {
        shopLevel: Math.min(MAX_SHOP_LEVEL, Math.max(0, state.shopLevel + action.delta)),
      });
    case 'SET_SHOP_LEVEL':
      return applyPatch(state, {
        shopLevel: Math.min(MAX_SHOP_LEVEL, Math.max(0, action.level)),
      });
    case 'CLEAR_ACTIVE_MONSTER_REWARD':
      return applyPatch(state, { activeMonsterReward: null, monsterRewardMinimized: false });
    case 'CACHE_MONSTER_REWARD_PREVIEW':
      return reduceCacheMonsterRewardPreview(state, action);
    case 'SET_ACTIVE_CARD_STACKS':
      return applyPatch(state, { activeCardStacks: action.stacks });

    case 'OPEN_SHOP_MODAL':
      return applyPatch(state, {
        shopOfferings: action.offerings,
        shopSourceEvent: action.sourceEvent,
        shopDeleteUsed: false,
        shopHealUsed: false,
        shopLevelUpUsed: false,
        shopSkillDiscoverUsed: false,
        shopRefreshUsed: false,
        deleteModalOpen: false,
        shopModalOpen: true,
        shopModalMinimized: false,
      });

    case 'ENQUEUE_MONSTER_REWARD':
      return applyPatch(state, {
        monsterRewardQueue: [...state.monsterRewardQueue, action.entry],
      });

    case 'BEGIN_DISCOVER':
      return reduceBeginDiscover(state, action);

    case 'RESOLVE_DISCOVER_SELECTION':
      return reduceResolveDiscoverSelection(state, action);

    case 'CONFIRM_DELETE_CARD':
      return reduceConfirmDeleteCard(state, action);

    case 'REQUEST_GRAVEYARD_SELECTION':
      return reduceRequestGraveyardSelection(state, action);

    case 'BEGIN_GHOST_BLADE_EXILE':
      return reduceBeginGhostBladeExile(state);

    default:
      return null;
  }
}

function reduceOpenShop(
  state: GameState,
  action: Extract<GameAction, { type: 'OPEN_SHOP' }>,
): ReduceResult {
  const [patch, nextRng] = openShopPure(state, state.rng);
  const sideEffects: SideEffect[] = [
    { event: 'shop:opened', payload: { offerings: patch.shopOfferings ?? [] } },
  ];
  return applyPatch(state, {
    ...patch,
    rng: nextRng,
    shopSourceEvent: (action.sourceEvent as GameState['shopSourceEvent']) ?? null,
    shopModalOpen: true,
    shopModalMinimized: false,
    deleteModalOpen: false,
    eventModalOpen: false,
    eventModalMinimized: false,
  }, sideEffects);
}

function reduceCloseShop(state: GameState): ReduceResult {
  const patch = closeShopPure();
  const sideEffects: SideEffect[] = [
    { event: 'shop:closed', payload: {} },
    { event: 'log:entry', payload: { type: 'shop', message: '离开商店' } },
  ];
  return applyPatch(state, patch, sideEffects);
}

function reducePurchase(
  state: GameState,
  action: Extract<GameAction, { type: 'PURCHASE' }>,
): ReduceResult {
  const result = purchaseFromShopPure(state, action.cardId);
  if (!result) return noChange(state);

  const offering = state.shopOfferings.find(o => o.card.id === action.cardId);
  const cost = offering?.price ?? 0;

  const sideEffects: SideEffect[] = [
    { event: 'shop:purchased', payload: { card: result.purchasedCard, cost } },
    { event: 'shop:classCardObtained', payload: { card: result.purchasedCard, source: 'purchase', destination: 'backpack' } },
    { event: 'card:newCardGained', payload: { count: 1, source: 'classPool' } },
    { event: 'log:entry', payload: { type: 'shop', message: `商店：购买「${result.purchasedCard.name}」（-${cost} 金币）` } },
  ];

  const purchasePatch: Partial<GameState> = {
    gold: result.gold,
    backpackItems: result.backpackItems,
    shopOfferings: result.shopOfferings,
    rng: result.rng,
  };
  if (result.acquiredUniqueClassCardIds) {
    purchasePatch.acquiredUniqueClassCardIds = result.acquiredUniqueClassCardIds;
  }
  return applyPatch(state, purchasePatch, sideEffects);
}

function reduceShopHeal(state: GameState): ReduceResult {
  const patch = shopHealPure(state);
  if (!patch) return noChange(state);

  const sideEffects: SideEffect[] = [
    { event: 'combat:heroHealed', payload: { amount: (patch.hp ?? state.hp) - state.hp, source: 'shop' } },
  ];
  return applyPatch(state, patch, sideEffects);
}

function reduceShopLevelUp(state: GameState): ReduceResult {
  const patch = shopLevelUpPure(state);
  if (!patch) return noChange(state);

  const sideEffects: SideEffect[] = [
    { event: 'hero:leveledUp', payload: { stat: 'shopLevel', amount: 1 } },
  ];
  return applyPatch(state, patch, sideEffects);
}

function reduceShopDeleteEquipment(
  state: GameState,
  action: Extract<GameAction, { type: 'SHOP_DELETE_EQUIPMENT' }>,
): ReduceResult {
  const { slotId } = action;
  const item = slotId === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
  if (!item) return noChange(state);

  const sideEffects: SideEffect[] = [
    { event: 'log:entry', payload: { type: 'shop', message: `删除了装备 ${item.name}` } },
    { event: 'equipment:destroyed', payload: { slotId, cardId: item.id } },
    { event: 'equipment:clearSlotWithPromote', payload: { slotId } },
  ];

  const patch: Partial<GameState> = {
    [slotId]: null,
  };

  return applyPatch(state, patch, sideEffects);
}

function reduceShopDiscover(
  state: GameState,
  action: Extract<GameAction, { type: 'SHOP_DISCOVER' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [
    { event: 'shop:discoverStarted', payload: { source: action.source } },
  ];
  return applyPatch(state, {}, sideEffects);
}

function reduceShopEquipBoost(
  state: GameState,
  action: Extract<GameAction, { type: 'SHOP_EQUIP_BOOST' }>,
): ReduceResult {
  const patch = shopEquipBoostPure(state, action.boostType);
  if (!patch) return noChange(state);

  const label = action.boostType === 'attack' ? '攻击' : '护甲';
  const sideEffects: SideEffect[] = [
    { event: 'log:entry', payload: { type: 'shop', message: `商店：全装备栏永久${label} +1（-${SHOP_EQUIP_BOOST_COST} 金币）` } },
  ];
  return applyPatch(state, patch, sideEffects);
}

function reduceShopRefresh(state: GameState): ReduceResult {
  const result = shopRefreshPure(state, state.rng);
  if (!result) return noChange(state);
  const [patch, nextRng] = result;

  const sideEffects: SideEffect[] = [
    { event: 'shop:opened', payload: { offerings: patch.shopOfferings ?? [] } },
    { event: 'log:entry', payload: { type: 'shop', message: `商店：刷新商品并恢复其他按钮使用次数（-${SHOP_REFRESH_COST} 金币）` } },
  ];
  return applyPatch(state, { ...patch, rng: nextRng }, sideEffects);
}

function reduceShopSkillDiscover(
  state: GameState,
  action: Extract<GameAction, { type: 'SHOP_SKILL_DISCOVER' }>,
): ReduceResult {
  if (state.shopSkillDiscoverUsed) return noChange(state);
  if (state.gold < SHOP_SKILL_DISCOVER_COST) return noChange(state);
  if (action.availableSkills.length < 3) return noChange(state);

  const [shuffled, newRng] = rngShuffle(action.availableSkills, state.rng);
  const options = shuffled.slice(0, 3);

  const sideEffects: SideEffect[] = [
    { event: 'log:entry', payload: { type: 'shop', message: `商店：英雄技能三选一（-${SHOP_SKILL_DISCOVER_COST} 金币）` } },
  ];

  return applyPatch(state, {
    gold: state.gold - SHOP_SKILL_DISCOVER_COST,
    rng: newRng,
    shopSkillDiscoverUsed: true,
    shopSkillOptions: options,
    shopSkillSelectOpen: true,
  }, sideEffects);
}

function reduceShopSelectSkill(
  state: GameState,
  action: Extract<GameAction, { type: 'SHOP_SELECT_SKILL' }>,
): ReduceResult {
  const { patch, asyncOps } = shopSelectSkillPure(state, action.skillId);
  const enqueuedActions: GameAction[] = [];
  let rng = state.rng;

  const sideEffects: SideEffect[] = [
    { event: 'log:entry', payload: { type: 'shop', message: `商店：习得英雄技能「${patch.heroSkillBanner?.replace(/^学习了「|」！$/g, '') ?? action.skillId}」` } },
  ];

  // Handle card-creating async ops inline in the reducer
  const remainingAsyncOps = asyncOps.filter(op => {
    if (op.kind === 'addCard' && op.cardKey === 'summon-minion') {
      let minionId: string;
      [minionId, rng] = nextId(rng, 'summon-minion-card');
      const minionCard: import('@/components/GameCard').GameCardData = {
        id: minionId,
        type: 'monster',
        name: '小随从',
        value: 1,
        attack: 1,
        hp: 1,
        hpLayers: 4,
        fury: 4,
        currentLayer: 4,
        maxHp: 1,
        image: minionImage,
        description: '忠诚的小随从，可装备。每次用小随从击杀怪物，攻击 +1、防御 +1。',
        isMinionCard: true,
      };
      enqueuedActions.push({ type: 'ADD_TO_BACKPACK', card: minionCard });
      sideEffects.push({ event: 'log:entry', payload: { type: 'skill', message: '技能加成：获得小随从' } });
      return false;
    }
    if (op.kind === 'addCard' && op.cardKey === 'heal-to-damage') {
      const healEchoCard = applyAmplifyOnCreate(createStarterHealEchoCard(), state.amplifiedCardBonus);
      enqueuedActions.push({ type: 'ADD_TO_BACKPACK', card: healEchoCard });
      sideEffects.push({ event: 'log:entry', payload: { type: 'skill', message: '愈战愈勇：获得永久魔法「治愈余韵」' } });
      return false;
    }
    return true;
  });

  patch.rng = rng;

  if (remainingAsyncOps.length > 0) {
    sideEffects.push({ event: 'shop:skillSelected', payload: { skillId: action.skillId, asyncOps: remainingAsyncOps } });
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

function reduceUpgradeCard(
  state: GameState,
  action: Extract<GameAction, { type: 'UPGRADE_CARD' }>,
): ReduceResult {
  const { patch, upgradedName } = upgradeCardPure(state, action.cardId);

  const sideEffects: SideEffect[] = [
    { event: 'log:entry', payload: { type: 'shop', message: `卡牌升级：「${upgradedName || '卡牌'}」升级成功！` } },
  ];

  // 当 upgradeCardPure 因 maxCount==null 直接闭模态（patch.upgradeModalOpen=false）时，
  // 这条 patch 不走 SET_UPGRADE_MODAL_OPEN reducer，CHECK_PENDING_UPGRADE_MODAL 不会被
  // 自动 enqueue。手动补一条 CHECK 让 pendingUpgradeModalOpens 队列推进
  // （另一种 maxCount=N 的多次升级路径，CardUpgradeModal 用完后自己 dispatch
  // SET_UPGRADE_MODAL_OPEN(open=false)，CHECK 会从那条路径进，无需在这里补）。
  // 见 `pendingUpgradeModalOpens` JSDoc。
  const enqueuedActions: GameAction[] = [];
  if (patch.upgradeModalOpen === false && state.pendingUpgradeModalOpens.length > 0) {
    enqueuedActions.push({ type: 'CHECK_PENDING_UPGRADE_MODAL' });
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions.length > 0 ? enqueuedActions : undefined);
}

function reduceApplyMonsterReward(
  state: GameState,
  action: Extract<GameAction, { type: 'APPLY_MONSTER_REWARD' }>,
): ReduceResult {
  const { rewardType } = action;

  // --- discoverClass: try discover flow → fallback draw → fallback gold ---
  if (rewardType === 'discoverClass') {
    return reduceMonsterRewardDiscoverClass(state);
  }

  // --- discoverGraveyard: delegate to graveyard selection ---
  if (rewardType === 'discoverGraveyard') {
    return reduceMonsterRewardDiscoverGraveyard(state);
  }

  // --- grantStatSwapCard: create the card via RNG ---
  if (rewardType === 'grantStatSwapCard') {
    return reduceMonsterRewardGrantStatSwap(state);
  }

  const result = applyMonsterRewardPure(state, action.rewardType, action.amount, {
    slotId: action.slotId,
    bonusType: action.bonusType,
  }, state.rng);
  if (!result) return noChange(state);

  const sideEffects: SideEffect[] = [
    { event: 'log:entry', payload: { type: 'combat', message: result.logMessage } },
  ];

  const patch: Partial<GameState> = {
    ...result.patch,
    activeMonsterReward: null,
    ...(result.rng ? { rng: result.rng } : {}),
  };

  if (state.activeMonsterReward?.monsterCard) {
    const card = state.activeMonsterReward.monsterCard;
    const alreadyInGraveyard = state.discardedCards.some(c => c.id === card.id);
    if (!alreadyInGraveyard) {
      patch.discardedCards = [...state.discardedCards, resetCardForGraveyard(card)];
    }
  }

  // CHECK_PENDING_UPGRADE_MODAL：让 pendingUpgradeModalOpens 队列在 reward 处理完
  // 之后有机会推进。覆盖两条路径：
  //   1. 'upgradeCard' reward 自身 push 了一条 pending 请求；DEQUEUE 之后 CHECK 把它弹出。
  //   2. 之前 spell（淬炼冲击）或 amulet（虫蜕之冠）已 push 的 pending，在所有 reward
  //      drain 完后 CHECK 弹出。CHECK 自带 gate 检查（reward 队列非空时不开），所以
  //      多次 enqueue 是幂等的。
  const enqueuedActions: GameAction[] = [
    { type: 'DEQUEUE_MONSTER_REWARD' },
    { type: 'CHECK_HONOR_SWEEP_UPGRADES' },
    { type: 'CHECK_PENDING_UPGRADE_MODAL' },
  ];

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

function reduceMonsterRewardDiscoverClass(state: GameState): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = { activeMonsterReward: null };

  if (state.activeMonsterReward?.monsterCard) {
    const card = state.activeMonsterReward.monsterCard;
    if (!state.discardedCards.some(c => c.id === card.id)) {
      patch.discardedCards = [...state.discardedCards, resetCardForGraveyard(card)];
    }
  }

  // Try discover from class deck (filter out already-acquired unique cards)
  const availableClassPool = filterAvailableClassPool(state.classDeck, state, patch);
  if (availableClassPool.length > 0) {
    sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: '战利品：发现一张专属牌' } });
    enqueuedActions.push({
      type: 'BEGIN_DISCOVER',
      source: 'monster-reward',
      pool: availableClassPool,
      sourceLabel: '战利品',
      removeFromClassDeck: true,
    });
    enqueuedActions.push({ type: 'DEQUEUE_MONSTER_REWARD' }, { type: 'CHECK_HONOR_SWEEP_UPGRADES' });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // Fallback: draw 1 card from class deck to backpack
  if (state.classDeck.length > 0) {
    sideEffects.push(
      { event: 'log:entry', payload: { type: 'combat', message: '战利品：发现失败，补一张牌' } },
      { event: 'shop:discoverFallbackDraw', payload: { source: 'monster-reward' } },
    );
    enqueuedActions.push({ type: 'DRAW_CLASS_TO_BACKPACK', count: 1 });
    patch.heroSkillBanner = '职业卡不可用，改为补一张。';
    enqueuedActions.push({ type: 'DEQUEUE_MONSTER_REWARD' }, { type: 'CHECK_HONOR_SWEEP_UPGRADES' });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // Final fallback: grant 3 gold
  patch.gold = state.gold + 3;
  patch.heroSkillBanner = '职业牌不可用，转化为 3 金币奖励。';
  sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: '战利品：发现失败，转化为 3 金币' } });
  enqueuedActions.push({ type: 'DEQUEUE_MONSTER_REWARD' }, { type: 'CHECK_HONOR_SWEEP_UPGRADES' });

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

function reduceMonsterRewardDiscoverGraveyard(state: GameState): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = { activeMonsterReward: null };

  if (state.activeMonsterReward?.monsterCard) {
    const card = state.activeMonsterReward.monsterCard;
    if (!state.discardedCards.some(c => c.id === card.id)) {
      patch.discardedCards = [...state.discardedCards, resetCardForGraveyard(card)];
    }
  }

  const currentDiscarded = patch.discardedCards ?? state.discardedCards;

  if (currentDiscarded.length === 0) {
    patch.gold = state.gold + 3;
    patch.heroSkillBanner = '坟场为空，转化为 3 金币奖励。';
    sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: '战利品：坟场为空，转化为 3 金币' } });
    enqueuedActions.push({ type: 'DEQUEUE_MONSTER_REWARD' }, { type: 'CHECK_HONOR_SWEEP_UPGRADES' });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // RNG shuffle graveyard and show selection
  const exileIds = new Set((state.ghostBladeExileCards ?? []).map(c => c.id));
  let eligible = exileIds.size > 0
    ? currentDiscarded.filter(c => !exileIds.has(c.id))
    : currentDiscarded;

  if (eligible.length === 0) {
    patch.gold = state.gold + 3;
    patch.heroSkillBanner = '坟场为空，转化为 3 金币奖励。';
    sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: '战利品：坟场为空，转化为 3 金币' } });
    enqueuedActions.push({ type: 'DEQUEUE_MONSTER_REWARD' }, { type: 'CHECK_HONOR_SWEEP_UPGRADES' });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  const [shuffled, nextRng] = rngShuffle(eligible, state.rng);
  patch.rng = nextRng;
  const options = shuffled.slice(0, Math.min(3, shuffled.length));
  patch.graveyardDiscoverState = options;
  patch.phase = 'awaitingDiscoverChoice';

  sideEffects.push({
    event: 'shop:graveyardDiscoverReady',
    payload: { options, delivery: 'backpack' },
  });

  enqueuedActions.push({ type: 'DEQUEUE_MONSTER_REWARD' }, { type: 'CHECK_HONOR_SWEEP_UPGRADES' });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

function reduceMonsterRewardGrantStatSwap(state: GameState): ReduceResult {
  let rng = state.rng;
  const [statSwapId, rng2] = nextId(rng, 'stat-swap');
  rng = rng2;

  const statSwapCard: import('@/components/GameCard').GameCardData = {
    id: statSwapId,
    type: 'magic',
    name: '颠倒乾坤',
    value: 0,
    image: statSwapCardImage,
    classCard: true,
    description: '永久：选择一个怪物，将其攻击和血量上限对换。侧击：50% 击晕。',
    shortDescription: '怪物攻击与血量上限互换；侧击 50% 击晕',
    magicType: 'permanent',
    magicEffect: '攻击与血量上限互换。',
    knightEffect: 'stat-swap',
    flankEffect: '50% 概率击晕目标',
    recycleDelay: 2,
  };

  const patch: Partial<GameState> = {
    rng,
    statSwapCardObtained: true,
    activeMonsterReward: null,
    heroSkillBanner: '获得了极稀有魔法卡「颠倒乾坤」！',
  };

  if (state.activeMonsterReward?.monsterCard) {
    const card = state.activeMonsterReward.monsterCard;
    if (!state.discardedCards.some(c => c.id === card.id)) {
      patch.discardedCards = [...state.discardedCards, resetCardForGraveyard(card)];
    }
  }

  const sideEffects: SideEffect[] = [
    { event: 'log:entry', payload: { type: 'combat', message: '战利品：获得极稀有魔法卡「颠倒乾坤」！' } },
    { event: 'shop:monsterRewardGrantStatSwap', payload: { card: statSwapCard } },
    { event: 'card:newCardGained', payload: { count: 1 } },
  ];

  const enqueuedActions: GameAction[] = [
    { type: 'ADD_TO_BACKPACK', card: statSwapCard },
    { type: 'DEQUEUE_MONSTER_REWARD' },
    { type: 'CHECK_HONOR_SWEEP_UPGRADES' },
  ];

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

function reduceDequeueMonsterReward(state: GameState): ReduceResult {
  if (state.activeMonsterReward || state.ghostBladeExileCards) {
    return noChange(state);
  }
  if (state.monsterRewardQueue.length === 0) {
    // Monster reward chain finished AND ghost-blade-exile is clear — this is
    // the canonical "blocker cleared" moment. If `pendingClassDiscoverQueue`
    // has entries that were deferred by `reduceBeginDiscover` (战痕之符 /
    // 咒纹刻印 / 眩学之符 amulets, or any re-entrant BEGIN_DISCOVER that
    // landed while a reward modal was open), drain ONE entry now and enqueue
    // the next BEGIN_DISCOVER. Subsequent entries continue to drain via the
    // standard `SET_DISCOVER_MODAL close` / `RESOLVE_DISCOVER_SELECTION`
    // paths once the modal opens and closes.
    const patch: Partial<GameState> = {};
    const enqueuedActions: GameAction[] = [];
    if (state.pendingClassDiscoverQueue.length > 0) {
      const [nextEntry, ...rest] = state.pendingClassDiscoverQueue;
      patch.pendingClassDiscoverQueue = rest;
      // Same unique-lock + magicOnly filter applied at other queue-drain sites
      // (`SET_DISCOVER_MODAL close` / `RESOLVE_DISCOVER_SELECTION`).
      const filtered = filterAvailableClassPool(state.classDeck, state, patch);
      const nextPool = nextEntry.magicOnly
        ? filtered.filter(c => c.type === 'magic' || c.type === 'hero-magic')
        : filtered;
      enqueuedActions.push({
        type: 'BEGIN_DISCOVER',
        source: nextEntry.source,
        pool: nextPool,
        sourceLabel: nextEntry.sourceLabel ?? undefined,
        delivery: nextEntry.delivery,
        postInjectTopOnRecycleRestore: nextEntry.postInjectTopOnRecycleRestore,
      });
    }
    // Defensively clear any stale minimized flag so a previously-folded
    // reward doesn't leave dangling pill state behind.
    if (state.monsterRewardMinimized) {
      patch.monsterRewardMinimized = false;
    }
    if (Object.keys(patch).length === 0 && enqueuedActions.length === 0) {
      return noChange(state);
    }
    return applyPatch(state, patch, [], enqueuedActions.length > 0 ? enqueuedActions : undefined);
  }
  const patch = dequeueMonsterRewardPure(state);
  return applyPatch(state, patch, []);
}

// ---------------------------------------------------------------------------
// CACHE_MONSTER_REWARD_PREVIEW — generate and cache reward options for a
// monster instance using state.rng, so previews remain stable across re-clicks
// and undo, and so the actual MONSTER_DEFEATED reward matches what the player
// previewed.
// ---------------------------------------------------------------------------

function reduceCacheMonsterRewardPreview(
  state: GameState,
  action: Extract<GameAction, { type: 'CACHE_MONSTER_REWARD_PREVIEW' }>,
): ReduceResult {
  const monster = action.monster;
  if (!monster?.id) return noChange(state);
  if (state.monsterRewardPreviewCache[monster.id]) return noChange(state);

  const [options, rngAfter] = generateMonsterRewardOptions(monster, state, state.rng);
  return applyPatch(state, {
    rng: rngAfter,
    monsterRewardPreviewCache: {
      ...state.monsterRewardPreviewCache,
      [monster.id]: options,
    },
  });
}

// ---------------------------------------------------------------------------
// BEGIN_DISCOVER — sample up to 3 distinct-by-name candidates from pool.
// Class deck is now an infinite template: candidates are NOT removed from
// classDeck, and the chosen card will be cloned with a fresh id at
// RESOLVE_DISCOVER_SELECTION time.
// ---------------------------------------------------------------------------

function reduceBeginDiscover(
  state: GameState,
  action: Extract<GameAction, { type: 'BEGIN_DISCOVER' }>,
): ReduceResult {
  const { source, pool, sourceLabel, delivery, postInjectTopOnRecycleRestore } = action;

  if (pool.length === 0) return noChange(state);

  // --- Defer when a higher-priority modal is currently blocking ---
  //
  // Bug history: 战痕之符 (`damage-class-discover`) / 咒纹刻印
  // (`magic-class-discover`) / 眩学之符 (`stun-attempt-discover`) all trigger
  // their discover via a side-effect → hook → re-entrant dispatch pattern
  // (`combat:classDamageDiscoverTriggered` etc. → `beginDiscoverFlow` →
  // `dispatch(BEGIN_DISCOVER)`). Because the original dispatch's _dispatching
  // flag is still set when the side effect fires the hook, the re-entrant
  // BEGIN_DISCOVER lands in `_dispatchQueue` and runs AFTER the outer
  // `_processAction` returns. By then, the original drain may already have
  // set `activeMonsterReward` (kill-triggered monster reward) or
  // `ghostBladeExileCards` (鬼刃 exile selection) — opening BEGIN_DISCOVER's
  // discover modal on top would visually "squeeze out" the reward / exile
  // modal that the player must dismiss first.
  //
  // Similarly, if `discoverModalOpen` is already true (another discover
  // chain in progress, e.g. forge-reborn / 法术回响 echoed discover),
  // overwriting `discoverOptions` here would replace the player's current
  // candidates with the new ones — silently losing the original modal.
  //
  // Fix: route the discover into `pendingClassDiscoverQueue` instead. The
  // existing chain-drain (`SET_DISCOVER_MODAL close` / `RESOLVE_DISCOVER_SELECTION`
  // / new `DEQUEUE_MONSTER_REWARD` drain) will pop and re-fire it once the
  // blocker clears.
  const isBlocked =
    state.activeMonsterReward != null ||
    state.ghostBladeExileCards != null ||
    state.discoverModalOpen;

  if (isBlocked) {
    // `magicOnly` is inferred from the action's source string. The two
    // magic-only sources are 「祭坛秘术」 variants; everything else uses
    // the full classDeck. Inferring from source avoids carrying the pool
    // snapshot (which could be stale by drain time) and keeps the queue
    // entry shape consistent with existing producers (forge-reborn /
    // discard-rebuild / starter discoverClassToHand all set the same
    // magicOnly bit).
    const magicOnly =
      source === 'altar-discover-class-magic' || source === 'altar-discard-discover';
    const queueEntry: GameState['pendingClassDiscoverQueue'][number] = {
      source,
      sourceLabel: sourceLabel ?? null,
      delivery,
      magicOnly,
      postInjectTopOnRecycleRestore,
    };
    const patch: Partial<GameState> = {
      pendingClassDiscoverQueue: [...state.pendingClassDiscoverQueue, queueEntry],
    };
    const sideEffects: SideEffect[] = [
      {
        event: 'log:entry',
        payload: {
          type: 'skill',
          message: `发现专属卡（${source}）：当前有其他弹窗，已排队`,
        },
      },
    ];
    return applyPatch(state, patch, sideEffects);
  }

  // Universal unique-lock safety net: any caller-provided pool is filtered
  // through `filterAvailableClassPool` so cards the player has already
  // acquired this run never appear as discover candidates. This is the
  // single source of truth for the unique lock — callers (hook
  // `beginDiscoverFlow`, magic resolvers like `discard-rebuild` /
  // `altar-discard-discover` / `altar-discover-class-magic` / `专属感召`,
  // and any future caller) can pass raw `state.classDeck` and the lock
  // still applies. Pre-filtered call sites (shop offerings, monster reward
  // discover, queue-drained next BEGIN_DISCOVER) are idempotent under this
  // re-filter — they pass a subset of `state.classDeck` and the filter is
  // a no-op on already-filtered pools.
  const filteredPool = filterAvailableClassPool(pool, state);

  if (filteredPool.length === 0) return noChange(state);

  const [options, nextRng] = sampleDistinctByName(filteredPool, 3, state.rng, rngShuffle);

  if (options.length === 0) return noChange(state);

  const patch: Partial<GameState> = {
    rng: nextRng,
    discoverOptions: options,
    discoverModalOpen: true,
    discoverSourceLabel: sourceLabel ?? null,
    discoverDelivery: delivery ?? 'backpack',
    discoverPostInjectTopOnRecycleRestore: postInjectTopOnRecycleRestore ?? false,
  };

  const sideEffects: SideEffect[] = [
    { event: 'shop:discoverStarted', payload: { source, pool: options, sourceLabel } },
    {
      event: 'log:entry',
      payload: {
        type: 'skill',
        message: `发现专属卡（${source}）：候选 ${options.map(c => `「${c.name}」`).join('、')}`,
      },
    },
  ];

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// RESOLVE_DISCOVER_SELECTION — clone the chosen discover candidate with a
// fresh id and place into backpack (or recycle bag on overflow). Closes the
// modal and emits side effects for animation/log/new-card-gained tracking.
// ---------------------------------------------------------------------------

function reduceResolveDiscoverSelection(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_DISCOVER_SELECTION' }>,
): ReduceResult {
  const { cardId } = action;
  const original = state.discoverOptions.find(c => c.id === cardId);

  // Always clear the modal even if the card isn't found (defensive). Reset
  // discoverDelivery so the next BEGIN_DISCOVER starts from the 'backpack'
  // default unless it explicitly opts into 'hand-first'.
  const baseClose: Partial<GameState> = {
    discoverModalOpen: false,
    discoverModalMinimized: false,
    discoverOptions: [],
    discoverSourceLabel: null,
    discoverDelivery: 'backpack',
    discoverPostInjectTopOnRecycleRestore: false,
  };

  if (!original) {
    return applyPatch(state, baseClose);
  }

  const [clonedRaw, nextRng] = cloneClassCardWithFreshId(original, state.rng);
  // 「右翼回响」option 2 / future "discover + 置顶" effects: if BEGIN_DISCOVER
  // requested it, inject `topOnRecycleRestore: true` onto the cloned card so
  // when it later gets recycled (回收袋 → waterfall), it lands on top of the
  // deck instead of going back to the backpack. Same keyword as 「专属感召」
  // starter cards.
  const cloned: import('@/components/GameCard').GameCardData = state.discoverPostInjectTopOnRecycleRestore
    ? { ...clonedRaw, topOnRecycleRestore: true }
    : clonedRaw;
  const backpackCap = Math.max(1, BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier);
  const handHasRoom = state.handCards.length < getEffectiveHandLimit(state);
  const backpackHasRoom = state.backpackItems.length < backpackCap;
  const wantsHandFirst = state.discoverDelivery === 'hand-first';

  const patch: Partial<GameState> = { ...baseClose, rng: nextRng };
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];

  if (wantsHandFirst && handHasRoom) {
    patch.handCards = [...state.handCards, cloned];
    sideEffects.push(
      { event: 'log:entry', payload: { type: 'skill', message: `发现专属卡：「${cloned.name}」直接进入手牌` } },
      // destination='hand' tells `useShopHandlers` to SKIP the
      // class-deck → backpack flight; the actual class-deck → hand flight is
      // driven by the `card:queueToHand` event below (sourceHint: 'classDeck'),
      // which routes through `triggerBackpackHandFlight` and lands at
      // handAreaRef — the same hand-delivery pipeline used by all other
      // queued-to-hand effects (idempotent w.r.t. `patch.handCards` already
      // containing the card; the in-flight store hides the slot until landing).
      { event: 'shop:classCardObtained', payload: { card: cloned, source: 'discover', destination: 'hand' } },
      { event: 'card:newCardGained', payload: { count: 1, source: 'classPool' } },
      { event: 'card:queueToHand', payload: { card: cloned, sourceHint: 'classDeck' } },
    );
  } else if (backpackHasRoom) {
    patch.backpackItems = [...state.backpackItems, cloned];
    sideEffects.push(
      { event: 'log:entry', payload: { type: 'skill', message: `发现专属卡：选入「${cloned.name}」` } },
      { event: 'shop:classCardObtained', payload: { card: cloned, source: 'discover', destination: 'backpack' } },
      { event: 'card:newCardGained', payload: { count: 1, source: 'classPool' } },
    );
  } else {
    patch.permanentMagicRecycleBag = [
      ...state.permanentMagicRecycleBag,
      { ...cloned, _recycleWaits: cloned.recycleDelay ?? 1 },
    ];
    sideEffects.push(
      { event: 'log:entry', payload: { type: 'skill', message: `发现专属卡：「${cloned.name}」进入回收袋（背包已满）` } },
      { event: 'shop:classCardObtained', payload: { card: cloned, source: 'discover', destination: 'recycle-bag' } },
    );
  }

  // Lock the unique card BEFORE the queue-drain block below so the
  // filtered pool that gets enqueued for the next BEGIN_DISCOVER excludes
  // the card the player just acquired in the previous discover step.
  markUniqueAcquired(cloned, state, patch);

  // Drain one pending class-discover from the queue so multi-discover
  // effects (e.g. 弃装重铸) keep flowing — mirrors the SET_DISCOVER_MODAL
  // close path.
  if (state.pendingClassDiscoverQueue.length > 0) {
    const [nextEntry, ...rest] = state.pendingClassDiscoverQueue;
    patch.pendingClassDiscoverQueue = rest;
    // Filter out already-acquired unique cards (including the one we just
    // marked in this same patch via markUniqueAcquired above) before the
    // next discover sees the pool.
    const filtered = filterAvailableClassPool(state.classDeck, state, patch);
    const nextPool = nextEntry.magicOnly
      ? filtered.filter(c => c.type === 'magic' || c.type === 'hero-magic')
      : filtered;
    enqueuedActions.push({
      type: 'BEGIN_DISCOVER',
      source: nextEntry.source,
      pool: nextPool,
      sourceLabel: nextEntry.sourceLabel ?? undefined,
      delivery: nextEntry.delivery,
      postInjectTopOnRecycleRestore: nextEntry.postInjectTopOnRecycleRestore,
    });
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions.length > 0 ? enqueuedActions : undefined);
}

// ---------------------------------------------------------------------------
// CONFIRM_DELETE_CARD — remove card from its source, handle equipment promote
//                       and amulet reversal deltas, all in one reducer step
// ---------------------------------------------------------------------------

function reduceConfirmDeleteCard(
  state: GameState,
  action: Extract<GameAction, { type: 'CONFIRM_DELETE_CARD' }>,
): ReduceResult {
  const { cardId, source } = action;
  const ctx = state.cardActionContext;
  const kw = ctx?.keyword;

  let cardToDelete: import('@/components/GameCard').GameCardData | null = null;
  const patch: Partial<GameState> = {};
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];

  // --- Locate the card ---
  if (source === 'hand') {
    cardToDelete = state.handCards.find(c => c.id === cardId) ?? null;
    if (cardToDelete) patch.handCards = state.handCards.filter(c => c.id !== cardId);
  } else if (source === 'backpack') {
    cardToDelete = state.backpackItems.find(c => c.id === cardId) ?? null;
    if (cardToDelete) patch.backpackItems = state.backpackItems.filter(c => c.id !== cardId);
  } else if (source === 'recycleBag') {
    cardToDelete = state.permanentMagicRecycleBag.find(c => c.id === cardId) ?? null;
    if (cardToDelete) patch.permanentMagicRecycleBag = state.permanentMagicRecycleBag.filter(c => c.id !== cardId);
  } else if (source === 'equipment') {
    const allEquip = [
      { card: state.equipmentSlot1, slot: 'equipmentSlot1' as const, isMain: true },
      ...state.equipmentSlot1Reserve.map(c => ({ card: c, slot: 'equipmentSlot1' as const, isMain: false })),
      { card: state.equipmentSlot2, slot: 'equipmentSlot2' as const, isMain: true },
      ...state.equipmentSlot2Reserve.map(c => ({ card: c, slot: 'equipmentSlot2' as const, isMain: false })),
    ];
    const match = allEquip.find(e => e.card?.id === cardId);
    cardToDelete = match?.card ?? null;

    if (cardToDelete && match) {
      if (match.isMain && match.slot === 'equipmentSlot1' && state.equipmentSlot1?.id === cardId) {
        const reserve = state.equipmentSlot1Reserve;
        const promoted = reserve.length > 0 ? reserve[0] : null;
        patch.equipmentSlot1 = promoted;
        if (promoted) patch.equipmentSlot1Reserve = reserve.slice(1);
      } else if (match.isMain && match.slot === 'equipmentSlot2' && state.equipmentSlot2?.id === cardId) {
        const reserve = state.equipmentSlot2Reserve;
        const promoted = reserve.length > 0 ? reserve[0] : null;
        patch.equipmentSlot2 = promoted;
        if (promoted) patch.equipmentSlot2Reserve = reserve.slice(1);
      } else {
        patch.equipmentSlot1Reserve = state.equipmentSlot1Reserve.filter(c => c.id !== cardId);
        patch.equipmentSlot2Reserve = state.equipmentSlot2Reserve.filter(c => c.id !== cardId);
      }
    }
  } else if (source === 'amulet') {
    cardToDelete = state.amuletSlots.find(c => c.id === cardId) ?? null;
    if (cardToDelete) {
      // Aura reversal is handled centrally by `postProcessAmuletAura` in
      // reducer.ts — no manual slotTempAttack/Armor diff needed here.
      patch.amuletSlots = state.amuletSlots.filter(c => c.id !== cardId);
    }
  }

  if (!cardToDelete) return noChange(state);

  // --- Determine flight destination ---
  let destination: 'graveyard' | 'recycle-bag' = 'graveyard';
  if (kw === 'move-to') {
    destination = ctx?.moveToDestination === 'recycle-bag' ? 'recycle-bag' : 'graveyard';
  } else if (kw === 'discard-recycle') {
    // 凡化咒已剥离 Perm — 直接进坟场
    const isPerm = !cardToDelete.permStripped && (cardToDelete.magicType === 'permanent' || cardToDelete.recycleDelay != null);
    destination = isPerm ? 'recycle-bag' : 'graveyard';
  } else if (kw === 'recycle-only') {
    destination = 'recycle-bag';
  }

  // --- Place card into graveyard or recycle bag ---
  if (destination === 'recycle-bag') {
    const recycleCard = { ...cardToDelete, _recycleWaits: cardToDelete.recycleDelay ?? 1 };
    patch.permanentMagicRecycleBag = [...(patch.permanentMagicRecycleBag ?? state.permanentMagicRecycleBag), recycleCard];
  } else {
    patch.discardedCards = [...state.discardedCards, cardToDelete];
  }

  // --- Update card action context tracking ---
  const contextMode = ctx?.mode;
  if (contextMode === 'event') {
    const remaining = Math.max(0, (ctx?.remainingCount ?? 1) - 1);
    if (remaining <= 0) {
      patch.deleteModalOpen = false;
      patch.cardActionContext = null;
      enqueuedActions.push({ type: 'RESOLVE_CARD_ACTION', cardId, actionType: ctx?.keyword ?? 'delete', context: {} });
    } else {
      patch.cardActionContext = ctx ? { ...ctx, remainingCount: remaining } : null;
    }
  } else if (contextMode === 'shop') {
    patch.shopDeleteUsed = true;
    patch.deleteModalOpen = false;
    patch.cardActionContext = null;
  } else {
    patch.deleteModalOpen = false;
  }

  // --- Log ---
  const kwLabel = kw === 'delete' ? '删除'
    : kw === 'move-to' ? '移到'
    : kw === 'discard-only' ? '弃置'
    : kw === 'recycle-only' ? '回收'
    : '弃回';
  const contextLabel = contextMode === 'shop' ? '商店'
    : contextMode === 'event' ? '事件'
    : '';
  const logType = contextMode === 'shop' ? 'shop' : contextMode === 'event' ? 'event' : 'system';
  const logMessage = contextLabel
    ? `${contextLabel}：${kwLabel}「${cardToDelete.name}」`
    : `${kwLabel}卡牌：${cardToDelete.name}`;

  sideEffects.push(
    { event: 'log:entry', payload: { type: logType, message: logMessage } },
    {
      event: 'shop:deleteCardConfirmed',
      payload: { card: cardToDelete, source, destination, context: contextMode },
    },
  );

  // --- Discard side effect for discard-recycle/discard-only/recycle-only ---
  if (kw !== 'delete' && kw !== 'move-to') {
    enqueuedActions.push({
      type: 'APPLY_DISCARD_EFFECTS',
      card: cardToDelete,
      owner: 'player',
      opts: { toRecycleBag: destination === 'recycle-bag' },
    });
  }

  // 「招灵书印」(delete-draw): every "删除" (move-out-of-game) — shop or event —
  // triggers 2 × N draws from backpack, where N is the number of equipped
  // copies. Only fires for kw === 'delete'; discard/recycle/move-to do not
  // count as 删除.
  if (kw === 'delete') {
    const ae = computeAmuletEffectsForState(state);
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
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// REQUEST_GRAVEYARD_SELECTION — RNG shuffle graveyard, set discover state
// ---------------------------------------------------------------------------

function reduceRequestGraveyardSelection(
  state: GameState,
  action: Extract<GameAction, { type: 'REQUEST_GRAVEYARD_SELECTION' }>,
): ReduceResult {
  const { maxOptions, delivery = 'backpack', eligibleCardIds } = action;

  const exileIds = new Set((state.ghostBladeExileCards ?? []).map(c => c.id));
  let eligible = exileIds.size > 0
    ? state.discardedCards.filter(c => !exileIds.has(c.id))
    : state.discardedCards;

  if (eligibleCardIds) {
    const allowed = new Set(eligibleCardIds);
    eligible = eligible.filter(c => allowed.has(c.id));
  }

  if (eligible.length === 0) {
    return applyPatch(state, {
      heroSkillBanner: '坟场中没有可取回的卡牌。',
    });
  }

  const [shuffled, nextRng] = rngShuffle(eligible, state.rng);
  const options = shuffled.slice(0, Math.min(maxOptions, shuffled.length));

  const sideEffects: SideEffect[] = [
    { event: 'shop:graveyardDiscoverReady', payload: { options, delivery } },
  ];

  return applyPatch(state, {
    rng: nextRng,
    graveyardDiscoverState: options,
    phase: 'awaitingDiscoverChoice',
  }, sideEffects);
}

// ---------------------------------------------------------------------------
// BEGIN_GHOST_BLADE_EXILE — RNG shuffle graveyard for exile selection
// ---------------------------------------------------------------------------

function reduceBeginGhostBladeExile(state: GameState): ReduceResult {
  const discoverIds = new Set((state.graveyardDiscoverState ?? []).map(c => c.id));
  const eligible = discoverIds.size > 0
    ? state.discardedCards.filter(c => !discoverIds.has(c.id))
    : state.discardedCards;

  if (eligible.length === 0) return noChange(state);

  const [shuffled, nextRng] = rngShuffle(eligible, state.rng);
  const options = shuffled.slice(0, Math.min(3, shuffled.length));

  const sideEffects: SideEffect[] = [
    { event: 'shop:ghostBladeExileReady', payload: { options } },
  ];

  return applyPatch(state, {
    rng: nextRng,
    ghostBladeExileCards: options,
  }, sideEffects);
}
