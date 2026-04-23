import React, { useCallback } from 'react';
import { useGameEngine, useShallowGameState, useDispatch, useGameEvent } from '@/hooks/useGameEngine';
import type { GameCardData } from '@/components/GameCard';
import type { LogEntryType } from '@/components/GameLogPanel';
import type {
  BackpackHandFlight,
  CardActionKeyword,
  EquipmentRepairTarget,
  EquipmentSlotId,
  FlightSourceHint,
  MonsterRewardOption,
  SlotPermanentBonus,
} from '@/components/game-board/types';
import { heroSkills as allHeroSkills } from '@/lib/heroSkills';
import {
  SHOP_SKILL_DISCOVER_COST,
  SHOP_EQUIP_BOOST_COST,
  DEV_MODE,
} from '@/game-core/constants';
import { generateShopOfferingsPure } from '@/game-core/shop';

// ---------------------------------------------------------------------------
// Deps: external dependencies injected by GameBoard
// ---------------------------------------------------------------------------

export interface ShopHandlersDeps {
  // --- Functions from useCardOperations (Layer 0) ---
  addToGraveyard: (card: GameCardData) => void;
  addCardToBackpack: (
    card: GameCardData,
    options?: { toBottom?: boolean; pendingDungeonCardId?: string },
  ) => void;
  ensureCardInHand: (card: GameCardData) => void;
  discardCardToGraveyard: (
    card: GameCardData | null | undefined,
    options?: { owner?: 'player' | 'dungeon'; forceGraveyard?: boolean; forceRecycleBag?: boolean },
  ) => void;
  addPermanentMagicToRecycleBag: (card: GameCardData) => void;
  applyDiscardSideEffects: (
    card: GameCardData,
    owner: 'player' | 'dungeon',
    opts?: { toRecycleBag?: boolean; isEquipmentDisplace?: boolean },
  ) => void;
  isRecyclableFromHand: (card: GameCardData | null | undefined) => boolean;
  drawClassCardsToBackpack: (
    count: number,
    source: string,
    opts?: { excludeIds?: string[]; includeIds?: string[]; filter?: 'hero-magic' | 'weapon' | 'shield' | 'equipment' },
  ) => void;
  drawFromBackpackToHand: () => void;
  setEquipmentSlotBonus: (
    slotId: EquipmentSlotId,
    bonusType: keyof SlotPermanentBonus,
    value: number | ((current: number) => number),
  ) => void;
  backpackCapacity: number;
  effectiveHandLimit: number;

  // --- Functions from useCombatActions (Layer 1) ---
  healHero: (amount: number) => number;

  // --- Animation / UI callbacks from GameBoard ---
  addGameLog: (type: LogEntryType, message: string) => void;
  pushUndoSnapshot: () => void;
  clearUndoStack: () => void;
  removePendingDungeonCard: (cardId: string) => boolean;
  triggerClassDeckFlight: (cards: GameCardData[]) => void;
  triggerDiscardFlight: (
    card: GameCardData,
    destination: 'graveyard' | 'recycle-bag',
    sourceHint?: FlightSourceHint,
  ) => Promise<void>;
  completeCurrentEvent: (options?: { skipFlip?: boolean }) => void;
  getMonsterRewardsPreview: (monster: GameCardData) => MonsterRewardOption[];
  repairEquipmentDurability: (
    amount: number,
    targets: EquipmentRepairTarget[],
  ) => Promise<boolean>;
  drawCardsFromBackpack: (count: number) => number;
  consumeCardFromHand: (card: GameCardData | string) => boolean;
  maxHp: number;

  // --- Refs ---
  cardActionResolverRef: React.MutableRefObject<(() => void) | null>;
  cardActionRemainingRef: React.MutableRefObject<number>;
  cardActionBatchResolverRef: React.MutableRefObject<
    ((selections: Array<{ cardId: string; source: 'hand' | 'backpack' | 'recycleBag' | 'equipment' | 'amulet' }>) => void) | null
  >;
  deletingCardIdsRef: React.MutableRefObject<Set<string>>;
  monsterRewardQueuedInstanceIdsRef: React.MutableRefObject<Set<string>>;
  discardedCardsRef: React.MutableRefObject<GameCardData[]>;
  backpackHandFlightsRef: React.MutableRefObject<BackpackHandFlight[]>;
  graveyardDiscoverResolverRef: React.MutableRefObject<
    ((card: GameCardData | null) => void) | null
  >;
  graveyardDiscoverDeliveryRef: React.MutableRefObject<'backpack' | 'hand-first'>;
  ghostBladeExileResolverRef: React.MutableRefObject<(() => void) | null>;
  /** 从专属发现弹窗完成时调用（药水「灵思药剂」等），替代 completeCurrentEvent */
  discoverPotionCompletionRef: React.MutableRefObject<((payload: { banner: string }) => void) | null>;
  onNewCardGainedRef: React.MutableRefObject<((count: number, source?: 'graveyard' | 'classPool') => void) | null>;
}

export type BeginDiscoverFlowOptions = {
  /** 仅从满足条件的专属牌中候选（例如仅魔法） */
  filter?: (card: GameCardData) => boolean;
  /** 直接提供候选池，跳过 classDeck（用于起始背包等外部卡源） */
  overridePool?: GameCardData[];
  /** 触发发现的来源卡牌/效果名称，显示在弹窗上 */
  sourceLabel?: string;
  /**
   * Where the chosen discover candidate should land at RESOLVE time.
   *   - 'backpack' (default): backpack → recycle bag on overflow.
   *   - 'hand-first': try handCards first (subject to handLimit), else
   *     fall back to backpack → recycle bag.
   * Forwarded as-is to the BEGIN_DISCOVER action; only the new starter
   * "发现一张专属牌（直接进手牌）" card uses 'hand-first' today.
   */
  delivery?: 'backpack' | 'hand-first';
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useShopHandlers(depsRef: React.MutableRefObject<ShopHandlersDeps>) {
  const engine = useGameEngine();
  const dispatch = useDispatch();
  const gs = useShallowGameState(s => ({
    shopLevel: s.shopLevel,
    classDeck: s.classDeck,
    handCards: s.handCards,
    backpackItems: s.backpackItems,
    permanentMagicRecycleBag: s.permanentMagicRecycleBag,
    discardedCards: s.discardedCards,
    selectedHeroSkill: s.selectedHeroSkill,
    extraHeroSkills: s.extraHeroSkills,
    shopDeleteUsed: s.shopDeleteUsed,
    shopSkillDiscoverUsed: s.shopSkillDiscoverUsed,
    shopEquipAttackUsed: s.shopEquipAttackUsed,
    shopEquipArmorUsed: s.shopEquipArmorUsed,
    discoverOptions: s.discoverOptions,
    graveyardDiscoverState: s.graveyardDiscoverState,
    ghostBladeExileCards: s.ghostBladeExileCards,
    cardActionContext: s.cardActionContext,
    activeMonsterReward: s.activeMonsterReward,
    equipmentSlot1: s.equipmentSlot1,
    equipmentSlot1Reserve: s.equipmentSlot1Reserve,
    equipmentSlot2: s.equipmentSlot2,
    equipmentSlot2Reserve: s.equipmentSlot2Reserve,
    amuletSlots: s.amuletSlots,
  }));
  const {
    shopLevel,
    classDeck,
    handCards,
    backpackItems,
    permanentMagicRecycleBag,
    discardedCards,
    selectedHeroSkill,
    extraHeroSkills,
    shopDeleteUsed,
    shopSkillDiscoverUsed,
    shopEquipAttackUsed,
    shopEquipArmorUsed,
    discoverOptions,
    graveyardDiscoverState,
    ghostBladeExileCards,
    cardActionContext,
    activeMonsterReward,
  } = gs;

  // -- State helpers -----------------------------------------------------------

  type GS = import('@/game-core/types').GameState;

  // -- Derived values ---------------------------------------------------------

  const equipmentCardCount = (gs.equipmentSlot1 ? 1 : 0) + gs.equipmentSlot1Reserve.length
    + (gs.equipmentSlot2 ? 1 : 0) + gs.equipmentSlot2Reserve.length;
  const amuletCardCount = gs.amuletSlots.length;
  const deletableCardCount = handCards.length + backpackItems.length + permanentMagicRecycleBag.length
    + equipmentCardCount + amuletCardCount;

  // -- Shop offerings / flow --------------------------------------------------

  const generateShopOfferings = useCallback(
    () => {
      const rng = engine.getState().rng;
      const [offerings, nextRng] = generateShopOfferingsPure(classDeck, shopLevel, rng);
      dispatch({ type: 'SET_GAME_FLAGS', patch: { rng: nextRng } });
      return offerings;
    },
    [classDeck, shopLevel, engine, dispatch],
  );

  const startShopFlow = useCallback(
    (eventCard: GameCardData | null): boolean => {
      if (!eventCard) {
        return false;
      }
      if (!classDeck.length) {
        if (DEV_MODE) {
          console.debug('[Shop] Cannot open shop, no class cards available');
        }
        return false;
      }
      dispatch({ type: 'OPEN_SHOP', sourceEvent: eventCard });
      return true;
    },
    [classDeck.length, dispatch],
  );

  // -- Discover flow ----------------------------------------------------------

  const beginDiscoverFlow = useCallback(
    (source: string, opts?: BeginDiscoverFlowOptions): boolean => {
      const pool = opts?.overridePool
        ?? (opts?.filter ? classDeck.filter(opts.filter) : classDeck);
      if (pool.length === 0) {
        if (DEV_MODE) {
          console.debug('[Discover] No cards in pool, cannot start discover', { source, filtered: Boolean(opts?.filter) });
        }
        return false;
      }

      // Class deck is now an infinite template — discover never consumes
      // from `classDeck`. The reducer ignores `removeFromClassDeck`.
      dispatch({
        type: 'BEGIN_DISCOVER',
        source,
        pool,
        sourceLabel: opts?.sourceLabel,
        delivery: opts?.delivery,
      });

      return true;
    },
    [classDeck, dispatch],
  );

  const handleDiscoverFallback = useCallback((): boolean => {
    depsRef.current.drawClassCardsToBackpack(1, 'discover-fallback');
    return true;
  }, []);

  const handleDiscoverSelect = useCallback(
    (cardId: string) => {
      depsRef.current.pushUndoSnapshot();
      if (!discoverOptions.length) return;
      const selectedCard = discoverOptions.find(card => card.id === cardId);

      // Reducer clones the chosen card with a fresh id, places it into
      // backpack/recycle bag, closes the modal, and drains any pending
      // class-discover queue. We listen for `shop:classCardObtained` to
      // run the flight animation with the *cloned* card's id.
      dispatch({ type: 'RESOLVE_DISCOVER_SELECTION', cardId });

      const completion = depsRef.current.discoverPotionCompletionRef.current;
      if (completion) {
        depsRef.current.discoverPotionCompletionRef.current = null;
        const banner = selectedCard
          ? backpackItems.length >= depsRef.current.backpackCapacity
            ? `「${selectedCard.name}」已进入回收袋（背包已满）。`
            : `获得专属魔法「${selectedCard.name}」！`
          : '未发现卡牌。';
        completion({ banner });
        return;
      }

      // If the reducer enqueued another BEGIN_DISCOVER (multi-discover
      // queue), don't finalize the event yet — let the next modal flow.
      if (engine.getState().discoverModalOpen) {
        return;
      }

      // If discover was one step in a multi-effect event chain (e.g.
      // ['discoverClassMagic', 'openShop'] from 墓语密室「召唤商贩」),
      // resume the remaining tokens instead of finalizing the event now.
      if (engine.getState().pendingEventEffects.length > 0) {
        dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
        return;
      }

      depsRef.current.completeCurrentEvent();
    },
    [
      backpackItems.length,
      discoverOptions,
      engine, dispatch,
    ],
  );

  const handleDiscoverCancel = useCallback(
    () => {
      depsRef.current.pushUndoSnapshot();
      if (!discoverOptions.length) return;

      // Class deck is an infinite template — nothing to return.
      // Just close the modal; SET_DISCOVER_MODAL also drains the
      // pending class-discover queue (e.g. 弃装重铸 multi-discover).
      dispatch({ type: 'SET_DISCOVER_MODAL', open: false, options: [], sourceLabel: null });

      depsRef.current.addGameLog('skill', '发现专属卡：放弃选择');

      const completion = depsRef.current.discoverPotionCompletionRef.current;
      if (completion) {
        depsRef.current.discoverPotionCompletionRef.current = null;
        completion({ banner: '放弃了发现专属牌。' });
        return;
      }

      // SET_DISCOVER_MODAL { open: false } may have re-opened the modal
      // via the pending-discover drain. Don't finalize the event yet.
      if (engine.getState().discoverModalOpen) {
        return;
      }

      if (engine.getState().pendingEventEffects.length > 0) {
        dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
        return;
      }

      depsRef.current.completeCurrentEvent();
    },
    [
      discoverOptions,
      engine, dispatch,
    ],
  );

  // -- Shop purchase / close --------------------------------------------------

  const handleShopPurchase = useCallback(
    (cardId: string) => {
      depsRef.current.pushUndoSnapshot();
      const state = engine.getState();
      const offering = state.shopOfferings.find(o => o.card.id === cardId);
      if (!offering || offering.sold) return;
      if (state.gold < offering.price) return;
      if (state.backpackItems.length >= depsRef.current.backpackCapacity) return;

      // Reducer clones the bought card with a fresh id and emits both
      // `shop:classCardObtained` (drives the class-deck flight) and
      // `card:newCardGained` (drives missile-amulet etc.). No hook-side
      // triggering needed.
      dispatch({ type: 'PURCHASE', cardId });
    },
    [engine, dispatch],
  );

  const handleShopClose = useCallback(() => {
    depsRef.current.pushUndoSnapshot();
    dispatch({ type: 'CLOSE_SHOP' });
    depsRef.current.cardActionResolverRef.current = null;
    depsRef.current.completeCurrentEvent();
  }, [dispatch]);

  // -- Shop services ----------------------------------------------------------

  const handleShopDeleteRequest = useCallback(() => {
    depsRef.current.pushUndoSnapshot();
    if (shopDeleteUsed || deletableCardCount === 0) {
      return;
    }
    depsRef.current.cardActionRemainingRef.current = 1;
    depsRef.current.deletingCardIdsRef.current.clear();
    dispatch({ type: 'SET_CARD_ACTION_CONTEXT', payload: {
      mode: 'shop',
      keyword: 'delete',
      requiredCount: 1,
      remainingCount: 1,
      title: '选择要删除的卡牌',
      description: '从手牌、背包、装备栏、护符栏或回收袋中删除 1 张卡牌，将其送入坟场。',
    } });
    dispatch({ type: 'SET_DELETE_MODAL_OPEN', open: true });
  }, [deletableCardCount, shopDeleteUsed, dispatch]);

  // Shop heal — dispatches SHOP_HEAL to reducer
  const handleShopHealRequest = useCallback(() => {
    depsRef.current.pushUndoSnapshot();
    dispatch({ type: 'SHOP_HEAL' });
  }, [dispatch]);

  // Shop level up — dispatches SHOP_LEVEL_UP to reducer
  const handleShopLevelUpRequest = useCallback(() => {
    depsRef.current.pushUndoSnapshot();
    dispatch({ type: 'SHOP_LEVEL_UP' });
  }, [dispatch]);

  const handleShopEquipAttackRequest = useCallback(() => {
    depsRef.current.pushUndoSnapshot();
    if (shopEquipAttackUsed || engine.getState().gold < SHOP_EQUIP_BOOST_COST) return;
    dispatch({ type: 'SHOP_EQUIP_BOOST', boostType: 'attack' });
  }, [engine, shopEquipAttackUsed, dispatch]);

  const handleShopEquipArmorRequest = useCallback(() => {
    depsRef.current.pushUndoSnapshot();
    if (shopEquipArmorUsed || engine.getState().gold < SHOP_EQUIP_BOOST_COST) return;
    dispatch({ type: 'SHOP_EQUIP_BOOST', boostType: 'armor' });
  }, [engine, shopEquipArmorUsed, dispatch]);

  // -- Card upgrade -----------------------------------------------------------

  const handleCardUpgrade = useCallback((cardId: string) => {
    depsRef.current.pushUndoSnapshot();
    dispatch({ type: 'UPGRADE_CARD', cardId });
  }, [dispatch]);

  // -- Skill discover / select ------------------------------------------------

  const handleShopSkillDiscoverRequest = useCallback(() => {
    if (shopSkillDiscoverUsed || engine.getState().gold < SHOP_SKILL_DISCOVER_COST) return;
    const ownedSkills = new Set<string>([
      ...(selectedHeroSkill ? [selectedHeroSkill] : []),
      ...extraHeroSkills,
    ]);
    const available = allHeroSkills.filter(s => !ownedSkills.has(s.id));
    if (available.length < 3) return;
    depsRef.current.pushUndoSnapshot();
    dispatch({ type: 'SHOP_SKILL_DISCOVER', availableSkills: available });
  }, [engine, extraHeroSkills, selectedHeroSkill, shopSkillDiscoverUsed, dispatch]);

  const handleShopSkillSelect = useCallback((skillId: string) => {
    depsRef.current.pushUndoSnapshot();
    dispatch({ type: 'SHOP_SELECT_SKILL', skillId });
  }, [dispatch]);

  // -- Graveyard discover -----------------------------------------------------

  const requestGraveyardSelection = useCallback(
    (
      maxOptions: number,
      opts?: { delivery?: 'backpack' | 'hand-first'; filter?: (card: GameCardData) => boolean },
    ) => {
      const exileIds = new Set((ghostBladeExileCards ?? []).map(c => c.id));
      let eligible = exileIds.size > 0
        ? discardedCards.filter(c => !exileIds.has(c.id))
        : discardedCards;
      if (opts?.filter) {
        eligible = eligible.filter(opts.filter);
      }
      if (!eligible.length) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '坟场中没有可取回的卡牌。' });
        return Promise.resolve<GameCardData | null>(null);
      }

      depsRef.current.graveyardDiscoverDeliveryRef.current =
        opts?.delivery === 'hand-first' ? 'hand-first' : 'backpack';

      dispatch({
        type: 'REQUEST_GRAVEYARD_SELECTION',
        maxOptions,
        delivery: opts?.delivery,
        eligibleCardIds: opts?.filter ? eligible.map(c => c.id) : undefined,
      });

      return new Promise<GameCardData | null>(resolve => {
        depsRef.current.graveyardDiscoverResolverRef.current = card => {
          resolve(card);
          depsRef.current.graveyardDiscoverResolverRef.current = null;
        };
      });
    },
    [discardedCards, ghostBladeExileCards, dispatch],
  );

  const handleGraveyardDiscoverSelect = useCallback(
    (cardId: string) => {
      depsRef.current.pushUndoSnapshot();
      if (!graveyardDiscoverState) {
        return;
      }
      const selected = graveyardDiscoverState.find(card => card.id === cardId);
      if (!selected) {
        return;
      }
      const delivery = depsRef.current.graveyardDiscoverDeliveryRef.current;
      dispatch({ type: 'RESOLVE_GRAVEYARD_SELECTION', cardIds: [cardId], context: { delivery } });
      depsRef.current.onNewCardGainedRef?.current?.(1, 'graveyard');
      depsRef.current.graveyardDiscoverResolverRef.current?.(selected);
      depsRef.current.graveyardDiscoverResolverRef.current = null;
    },
    [
      graveyardDiscoverState,
      dispatch,
    ],
  );

  const handleGraveyardDiscoverCancel = useCallback(
    () => {
      depsRef.current.pushUndoSnapshot();
      const pending = engine.getState().pendingPotionAction;
      dispatch({ type: 'SET_GRAVEYARD_DISCOVER_STATE', payload: null });
      dispatch({ type: 'SET_PHASE', phase: 'playerInput' });
      depsRef.current.addGameLog('event', '坟场发现：放弃选择');
      if (pending && (pending as any).effect === 'discover-graveyard-magic') {
        dispatch({ type: 'SET_PENDING_POTION', payload: null });
        dispatch({ type: 'FINALIZE_POTION_CARD', card: (pending as any).card });
      }
      depsRef.current.graveyardDiscoverResolverRef.current?.(null);
      depsRef.current.graveyardDiscoverResolverRef.current = null;
    },
    [engine, dispatch],
  );

  // -- Ghost blade exile ------------------------------------------------------

  const triggerGhostBladeExile = useCallback(
    (): Promise<void> => {
      const graveyard = depsRef.current.discardedCardsRef.current;
      const discoverIds = new Set((graveyardDiscoverState ?? []).map(c => c.id));
      const eligible = discoverIds.size > 0
        ? graveyard.filter(c => !discoverIds.has(c.id))
        : graveyard;
      if (eligible.length === 0) return Promise.resolve();

      dispatch({ type: 'BEGIN_GHOST_BLADE_EXILE' });

      return new Promise<void>(resolve => {
        depsRef.current.ghostBladeExileResolverRef.current = resolve;
      });
    },
    [graveyardDiscoverState, dispatch],
  );

  const handleGhostBladeExileConfirm = useCallback(
    (selectedIds: string[]) => {
      if (selectedIds.length > 0) {
        dispatch({ type: 'UPDATE_DISCARDED_CARDS', updater: prev => {
          const exileSet = new Set(selectedIds);
          const next = prev.filter(c => !exileSet.has(c.id));
          depsRef.current.discardedCardsRef.current = next;
          return next;
        } });
        const exiledNames = (ghostBladeExileCards ?? [])
          .filter(c => selectedIds.includes(c.id))
          .map(c => c.name);
        depsRef.current.addGameLog('equip', `虚灵刀放逐：${exiledNames.join('、')} 被移除出游戏。`);
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `虚灵刀放逐了 ${exiledNames.join('、')}！` });
      }
      dispatch({ type: 'SET_GHOST_BLADE_EXILE_CARDS', payload: null });
      depsRef.current.ghostBladeExileResolverRef.current?.();
      depsRef.current.ghostBladeExileResolverRef.current = null;
    },
    [ghostBladeExileCards, dispatch],
  );

  // -- Card action (delete / discard) -----------------------------------------

  const computeActionPool = useCallback(
    (keyword: CardActionKeyword, handOnly?: boolean): number => {
      if (handOnly) return handCards.length;

      const isPerm = (c: GameCardData) =>
        depsRef.current.isRecyclableFromHand(c);
      const allEquip: GameCardData[] = [
        gs.equipmentSlot1, ...gs.equipmentSlot1Reserve,
        gs.equipmentSlot2, ...gs.equipmentSlot2Reserve,
      ].filter(Boolean) as GameCardData[];
      const allAmulets: GameCardData[] = gs.amuletSlots;

      switch (keyword) {
        case 'discard-recycle':
        case 'move-to':
          return handCards.length + allEquip.length + allAmulets.length;
        case 'discard-only':
          return handCards.filter(c => !isPerm(c)).length
            + allEquip.filter(c => !isPerm(c)).length
            + allAmulets.length;
        case 'recycle-only':
          return handCards.filter(isPerm).length
            + allEquip.filter(isPerm).length;
        case 'delete':
          return handCards.length + backpackItems.length + permanentMagicRecycleBag.length
            + allEquip.length + allAmulets.length;
        default:
          return handCards.length;
      }
    },
    [backpackItems.length, gs.amuletSlots, gs.equipmentSlot1, gs.equipmentSlot1Reserve, gs.equipmentSlot2, gs.equipmentSlot2Reserve, handCards, permanentMagicRecycleBag.length],
  );

  const requestCardAction = useCallback(
    (
      keyword: CardActionKeyword,
      count: number,
      options?: {
        title?: string;
        description?: string;
        handOnly?: boolean;
        moveToDestination?: 'recycle-bag' | 'graveyard';
      },
    ) => {
      const pool = computeActionPool(keyword, options?.handOnly);
      if (pool < count) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: options?.description ?? '当前没有足够的卡牌可供选择。' });
        return Promise.resolve(false);
      }
      return new Promise<boolean>(resolve => {
        depsRef.current.cardActionResolverRef.current = () => {
          resolve(true);
          depsRef.current.cardActionResolverRef.current = null;
        };
        depsRef.current.cardActionRemainingRef.current = count;
        depsRef.current.deletingCardIdsRef.current.clear();
        dispatch({ type: 'SET_CARD_ACTION_CONTEXT', payload: {
          mode: 'event',
          keyword,
          requiredCount: count,
          remainingCount: count,
          title: options?.title,
          description: options?.description,
          handOnly: options?.handOnly,
          moveToDestination: options?.moveToDestination,
        } });
        dispatch({ type: 'SET_DELETE_MODAL_OPEN', open: true });
        dispatch({ type: 'SET_PHASE', phase: 'awaitingDeleteChoice' });
      });
    },
    [computeActionPool, dispatch],
  );

  const handleDeleteCardConfirm = useCallback(
    (cardId: string, source: 'hand' | 'backpack' | 'recycleBag' | 'equipment' | 'amulet') => {
      if (depsRef.current.deletingCardIdsRef.current.has(cardId)) return;
      depsRef.current.deletingCardIdsRef.current.add(cardId);
      depsRef.current.pushUndoSnapshot();

      dispatch({ type: 'CONFIRM_DELETE_CARD', cardId, source });
    },
    [dispatch],
  );

  // --- Batch mode: select up to N cards in one modal then confirm -----------
  const requestCardActionBatch = useCallback(
    (
      keyword: CardActionKeyword,
      maxCount: number,
      options?: {
        title?: string;
        description?: string;
        handOnly?: boolean;
        moveToDestination?: 'recycle-bag' | 'graveyard';
      },
    ) => {
      const pool = computeActionPool(keyword, options?.handOnly);
      if (pool < 1) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: options?.description ?? '当前没有足够的卡牌可供选择。' });
        return Promise.resolve(0);
      }
      const cap = Math.min(maxCount, pool);
      return new Promise<number>(resolve => {
        depsRef.current.cardActionBatchResolverRef.current = (selections) => {
          depsRef.current.cardActionBatchResolverRef.current = null;
          if (selections.length === 0) {
            dispatch({ type: 'SET_DELETE_MODAL_OPEN', open: false });
            dispatch({ type: 'SET_CARD_ACTION_CONTEXT', payload: null });
            dispatch({ type: 'SET_PHASE', phase: 'playerInput' });
            resolve(0);
            return;
          }
          depsRef.current.pushUndoSnapshot();
          dispatch({ type: 'SET_CARD_ACTION_CONTEXT', payload: {
            mode: 'event',
            keyword,
            requiredCount: selections.length,
            remainingCount: selections.length,
            title: options?.title,
            description: options?.description,
            handOnly: options?.handOnly,
            moveToDestination: options?.moveToDestination,
          } });
          depsRef.current.cardActionRemainingRef.current = selections.length;
          depsRef.current.deletingCardIdsRef.current.clear();
          for (const sel of selections) {
            depsRef.current.deletingCardIdsRef.current.add(sel.cardId);
            dispatch({ type: 'CONFIRM_DELETE_CARD', cardId: sel.cardId, source: sel.source });
          }
          resolve(selections.length);
        };
        depsRef.current.cardActionRemainingRef.current = cap;
        depsRef.current.deletingCardIdsRef.current.clear();
        dispatch({ type: 'SET_CARD_ACTION_CONTEXT', payload: {
          mode: 'event',
          keyword,
          requiredCount: cap,
          remainingCount: cap,
          title: options?.title,
          description: options?.description,
          handOnly: options?.handOnly,
          moveToDestination: options?.moveToDestination,
          selectionMode: 'batch',
          maxCount: cap,
        } });
        dispatch({ type: 'SET_DELETE_MODAL_OPEN', open: true });
        dispatch({ type: 'SET_PHASE', phase: 'awaitingDeleteChoice' });
      });
    },
    [computeActionPool, dispatch],
  );

  const handleBatchDeleteConfirm = useCallback(
    (selections: Array<{ cardId: string; source: 'hand' | 'backpack' | 'recycleBag' | 'equipment' | 'amulet' }>) => {
      const resolver = depsRef.current.cardActionBatchResolverRef.current;
      if (resolver) {
        resolver(selections);
      }
    },
    [],
  );

  const handleDeleteModalOpenChange = useCallback(
    (open: boolean) => {
      if (
        !open &&
        cardActionContext?.mode === 'event' &&
        (cardActionContext.remainingCount ?? 0) > 0
      ) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '请完成卡牌选择才能继续。' });
        return;
      }
      dispatch({ type: 'SET_DELETE_MODAL_OPEN', open: open });
      if (!open && cardActionContext?.mode === 'shop') {
        dispatch({ type: 'SET_CARD_ACTION_CONTEXT', payload: null });
        dispatch({ type: 'SET_PHASE', phase: 'playerInput' });
      }
    },
    [cardActionContext, dispatch],
  );

  // -- Monster rewards --------------------------------------------------------

  const queueMonsterReward = useCallback(
    (monster: GameCardData): boolean => {
      const options = depsRef.current.getMonsterRewardsPreview(monster);
      if (!options.length) {
        return false;
      }
      const mid = monster.id;
      if (mid && depsRef.current.monsterRewardQueuedInstanceIdsRef.current.has(mid)) {
        return false;
      }
      if (mid) {
        depsRef.current.monsterRewardQueuedInstanceIdsRef.current.add(mid);
      }
      dispatch({ type: 'ENQUEUE_MONSTER_REWARD', entry: {
        monsterInstanceId: mid,
        monsterName: monster.name ?? '神秘怪物',
        options,
        monsterCard: monster,
      } });
      return true;
    },
    [engine, dispatch],
  );

  const applyMonsterReward = useCallback(
    (option: MonsterRewardOption): boolean | Promise<boolean> => {
      const eff = option.effect;
      switch (eff.type) {
        case 'repair': {
          depsRef.current.addGameLog('combat', `战利品：修复装备耐久 +${eff.amount}`);
          return depsRef.current.repairEquipmentDurability(eff.amount, eff.targets);
        }
        case 'slotBonus': {
          const { slotId, bonusType, amount } = eff;
          dispatch({ type: 'APPLY_MONSTER_REWARD', rewardType: 'slotBonus', amount, slotId, bonusType });
          return true;
        }
        default: {
          dispatch({ type: 'APPLY_MONSTER_REWARD', rewardType: eff.type, amount: ('amount' in eff ? eff.amount : undefined) });
          return true;
        }
      }
    },
    [dispatch],
  );

  const handleMonsterRewardSelection = useCallback(
    (optionId: string) => {
      depsRef.current.pushUndoSnapshot();
      if (!activeMonsterReward) {
        return;
      }
      const selected = activeMonsterReward.options.find(option => option.id === optionId);
      if (!selected) {
        return;
      }
      depsRef.current.addGameLog(
        'monster',
        `战利品〔${activeMonsterReward.monsterName}〕：选择「${selected.title}」`,
      );
      // Snapshot the defeated-monster card BEFORE dispatching the reward —
      // applyMonsterReward will null out `activeMonsterReward` synchronously
      // (via the APPLY_MONSTER_REWARD reducer's patch), and we still need the
      // card data to drive the graveyard flight + the imperative addToGraveyard
      // call below.
      const monsterCardSnapshot = activeMonsterReward.monsterCard ?? null;
      const doneId = activeMonsterReward.monsterInstanceId;

      // Decide BEFORE dispatching: 'repair' is the only reward type whose
      // applyMonsterReward path does NOT dispatch APPLY_MONSTER_REWARD —
      // it kicks off an async slot-picker UI via repairEquipmentDurability.
      // For all other reward types, the APPLY_MONSTER_REWARD reducer already
      // (1) sets activeMonsterReward = null,
      // (2) enqueues DEQUEUE_MONSTER_REWARD,
      // (3) moves the monster card to the graveyard.
      // Because GameEngine.dispatch runs its action + enqueued sub-actions
      // synchronously, by the time `applyMonsterReward(selected)` returns,
      // the next queued reward (if any) has ALREADY been promoted to
      // activeMonsterReward. Firing an unconditional CLEAR_ACTIVE_MONSTER_REWARD
      // here would wipe out that just-promoted reward — leaving subsequent
      // monsters from a multi-kill (e.g. 坟火新星 hitting multiple buglets)
      // permanently stuck in the queue with their cards frozen on the active
      // row.
      const isRepair = selected.effect.type === 'repair';

      const resolved = applyMonsterReward(selected);
      if (!resolved) {
        return;
      }
      if (doneId) {
        depsRef.current.monsterRewardQueuedInstanceIdsRef.current.delete(doneId);
      }
      // Fly the defeated monster card from its active-row slot to the
      // graveyard cell BEFORE we strip the slot. `triggerDiscardFlight`
      // captures source coords synchronously via `data-testid`, so as long
      // as we call it before `removePendingDungeonCard` (which schedules the
      // slot null via removeCard), the start position is correct. The flight
      // overlay is rendered as an independent layer and continues running
      // even after the original slot empties out a few frames later, giving
      // a continuous "monster body falls into the graveyard" arc instead of
      // the card just blinking out of existence.
      if (monsterCardSnapshot) {
        void depsRef.current.triggerDiscardFlight(monsterCardSnapshot, 'graveyard');
      }
      if (doneId) {
        depsRef.current.removePendingDungeonCard(doneId);
      }
      if (monsterCardSnapshot) {
        // ADD_TO_GRAVEYARD reducer is idempotent (no-op if id already in
        // discardedCards), so this is safe to call even though the
        // APPLY_MONSTER_REWARD reducer has already moved the card.
        depsRef.current.addToGraveyard(monsterCardSnapshot);
      }
      // Repair runs through an async UI path that does NOT go through the
      // APPLY_MONSTER_REWARD reducer, so it leaves activeMonsterReward
      // pointing at the (now-finished) repair drop and never enqueues
      // DEQUEUE_MONSTER_REWARD. Explicitly clear + advance here so the next
      // queued reward surfaces regardless of whether the player completes
      // or cancels the slot-picker.
      if (isRepair) {
        dispatch({ type: 'CLEAR_ACTIVE_MONSTER_REWARD' });
        dispatch({ type: 'DEQUEUE_MONSTER_REWARD' });
      }
    },
    [activeMonsterReward, applyMonsterReward, dispatch],
  );

  // ---------------------------------------------------------------------------
  // Event listeners — UI reactions to reducer side-effects
  // ---------------------------------------------------------------------------

  // State-driven via shopModalOpen; log the opening for game log history
  useGameEvent('shop:opened', ({ offerings }) => {
    depsRef.current.addGameLog('shop', `商店开启，共 ${(offerings as unknown[]).length} 件商品。`);
  });

  // State-driven via shopModalOpen toggling to false
  useGameEvent('shop:closed', () => {
    // UI display fully driven by shopModalOpen state field
  });

  // Purchase completed by reducer — log for game history
  useGameEvent('shop:purchased', ({ cost }) => {
    depsRef.current.addGameLog('shop', `购买卡牌（花费 ${cost} 金币）`);
  });

  // Discover flow started — UI display driven by discoverOptions state
  useGameEvent('shop:discoverStarted', ({ source, sourceLabel }) => {
    depsRef.current.addGameLog('skill', `发现专属卡：${sourceLabel ?? source}`);
  });

  // Skill selected — reducer handles all async ops (class deck draws, minion creation);
  // listener provides UI feedback only
  useGameEvent('shop:skillSelected', ({ skillId }) => {
    depsRef.current.addGameLog('skill', `选择了技能：${skillId}`);
  });

  // Delete card confirmed — trigger discard flight animation
  useGameEvent('shop:deleteCardConfirmed', ({ card, destination }) => {
    depsRef.current.triggerDiscardFlight(
      card,
      destination === 'recycle-bag' ? 'recycle-bag' : 'graveyard',
    );
  });

  // Resolve the requestCardAction promise once the reducer's RESOLVE_CARD_ACTION
  // fires (i.e. the player finished selecting all required cards). Without this
  // bridge, callers like 增幅祭坛's amplify-altar-activate flow that `await`
  // the requestCardAction promise would never proceed past the .then() block.
  useGameEvent('interactive:cardActionResolved', () => {
    const resolver = depsRef.current.cardActionResolverRef.current;
    depsRef.current.cardActionResolverRef.current = null;
    depsRef.current.cardActionRemainingRef.current = 0;
    resolver?.();
  });

  // Discover fallback — pool was empty, drew from class deck instead
  useGameEvent('shop:discoverFallbackDraw', ({ source }) => {
    depsRef.current.addGameLog('skill', `发现专属卡：卡池不足，改为直接抽取（${source}）`);
  });

  // Ghost blade exile options ready — UI driven by ghostBladeExileCards state
  useGameEvent('shop:ghostBladeExileReady', () => {
    // UI display driven by ghostBladeExileCards state field
  });

  // Graveyard discover options ready — UI driven by graveyardDiscoverState state
  useGameEvent('shop:graveyardDiscoverReady', () => {
    // UI display driven by graveyardDiscoverState state field
  });

  // Monster reward stat swap — log for future animation wiring
  useGameEvent('shop:monsterRewardGrantStatSwap', ({ card }) => {
    depsRef.current.addGameLog('monster', `战利品效果：属性交换（${card.name}）`);
  });

  // A class card was obtained (discover/draw/purchase). The reducer cloned
  // the card with a fresh id and placed it into the player's pile. Drive
  // the class-deck flight animation here using the *cloned* card so the
  // flight overlay's id matches what's now in the backpack/recycle bag.
  useGameEvent('shop:classCardObtained', ({ card, destination }) => {
    if (destination === 'backpack') {
      depsRef.current.triggerClassDeckFlight([card]);
    }
  });

  // ---------------------------------------------------------------------------
  // Return bag
  // ---------------------------------------------------------------------------

  return {
    // Shop offerings / flow
    generateShopOfferings,
    startShopFlow,

    // Discover
    beginDiscoverFlow,
    handleDiscoverFallback,
    handleDiscoverSelect,
    handleDiscoverCancel,

    // Shop purchase / close
    handleShopPurchase,
    handleShopClose,

    // Shop services
    handleShopDeleteRequest,
    handleShopHealRequest,
    handleShopLevelUpRequest,
    handleShopEquipAttackRequest,
    handleShopEquipArmorRequest,

    // Card upgrade
    handleCardUpgrade,

    // Skill discover / select
    handleShopSkillDiscoverRequest,
    handleShopSkillSelect,

    // Graveyard discover
    requestGraveyardSelection,
    handleGraveyardDiscoverSelect,
    handleGraveyardDiscoverCancel,

    // Ghost blade exile
    triggerGhostBladeExile,
    handleGhostBladeExileConfirm,

    // Card action (delete / discard)
    requestCardAction,
    requestCardActionBatch,
    handleDeleteCardConfirm,
    handleBatchDeleteConfirm,
    handleDeleteModalOpenChange,

    // Monster rewards
    queueMonsterReward,
    applyMonsterReward,
    handleMonsterRewardSelection,

    // Derived values
    deletableCardCount,
  };
}
