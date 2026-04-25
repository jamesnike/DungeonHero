import React, { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { useGameEngine, useShallowGameState, useDispatch, useGameEvent } from '@/hooks/useGameEngine';
import type { GameCardData, EventChoiceDefinition, EventDiceRange, HeroMagicId } from '@/components/GameCard';
import type { EventChoiceAvailability } from '@/components/EventChoiceModal';
import type { LogEntryType } from '@/components/GameLogPanel';
import type { MagicChoiceModalState } from '@/game-core/types';
import type {
  ActiveAmuletEffects,
  ActiveRowSlots,
  BackpackHandFlight,
  EquipmentItem,
  EquipmentPromptState,
  EquipmentSlotId,
  FlightSourceHint,
  SlotPermanentBonus,
} from '@/components/game-board/types';
import {
  INITIAL_HP,
  DUNGEON_COLUMN_COUNT,
  FLIP_GOLD_REWARD,
  MAX_SHOP_LEVEL,
  BASE_BACKPACK_CAPACITY,
  HAND_LIMIT,
  PERSUADE_COST,
  MIN_PERSUADE_COST,
} from '@/game-core/constants';
import {
  logBackpackDraw,
  pickRandomHandCardsForDiscardPreferGraveyard,
  isDamageMagic,
} from '@/game-core/helpers';
import { cloneClassCardWithFreshId } from '@/game-core/cardClone';
import { isReducerHandledEventToken } from '@/game-core/events';
import {
  createGraveyardRecallCard,
} from '@/lib/knightDeck';
import sealBladeImage from '@assets/generated_images/knight_seal_blade.png';
import {
  STARTER_CARD_IDS,
  createStarterCardPool,
  skillScrollImage,
  potionSpellDamageImage,
  potionWeaponRepairImage,
  starterScrollUpgradeImage,
  starterScrollReviveImage,
  starterScrollRecallImage,
  createCrimsonVoidSwapMagic,
} from '@/game-core/deck';
import { getHeroSkillById, type HeroSkillId } from '@/lib/heroSkills';
import type { RngState } from '@/game-core/rng';
import { nextRandom, nextInt, nextBool, shuffle as rngShuffle, pickRandom, nextId } from '@/game-core/rng';
import { createDiceQueue } from './dice-queue';

const COMBAT_ANIMATION_STAGGER = 180;

// ---------------------------------------------------------------------------
// Deps: external dependencies injected by GameBoard
// ---------------------------------------------------------------------------

export interface EventSystemDeps {
  // --- Functions from useCardOperations (Layer 0) ---
  discardCardToGraveyard: (
    card: GameCardData | null | undefined,
    options?: { owner?: 'player' | 'dungeon'; forceGraveyard?: boolean; forceRecycleBag?: boolean },
  ) => void;
  drawFromBackpackToHand: () => void;
  drawClassCardsToBackpack: (
    count: number,
    source: string,
    opts?: { excludeIds?: string[]; includeIds?: string[]; filter?: 'hero-magic' | 'weapon' | 'shield' | 'equipment' },
  ) => void;
  getEquipmentSlots: () => { id: EquipmentSlotId; item: EquipmentItem | null }[];
  setEquipmentSlotBonus: (
    slotId: EquipmentSlotId,
    bonusType: keyof SlotPermanentBonus,
    value: number | ((current: number) => number),
  ) => void;
  setEquipmentSlotById: (id: EquipmentSlotId, item: EquipmentItem | null) => void;
  clearEquipmentSlotById: (id: EquipmentSlotId) => void;
  getEquipmentReserve: (id: EquipmentSlotId) => EquipmentItem[];
  setEquipmentReserve: (id: EquipmentSlotId, items: EquipmentItem[]) => void;
  disposeOwnedEquipmentCard: (card: GameCardData, options?: { isDestruction?: boolean; triggerLastWords?: boolean; fromSlotId?: EquipmentSlotId }) => void;
  addPermanentMagicToRecycleBag: (card: GameCardData) => void;
  amuletEffects: ActiveAmuletEffects;
  addToGraveyard: (card: GameCardData) => void;
  addCardToBackpack: (card: GameCardData, options?: { toBottom?: boolean; pendingDungeonCardId?: string }) => void;
  triggerEventTransform: (fromCard: GameCardData, toCard: GameCardData, message?: string) => Promise<void>;
  applyCardFlip: (card: GameCardData, cellIndex?: number) => boolean;
  sacrificeEquipment: (slotId: EquipmentSlotId) => boolean;
  sacrificeAllEquipment: (slotId: EquipmentSlotId) => number;
  swapEquipmentSlots: () => void;
  convertAmuletsToGold: (goldPerAmulet: number) => void;
  discardAllHandCards: () => void;
  isRecyclableFromHand: (card: GameCardData) => boolean;

  // --- Functions from useCombatActions (Layer 1) ---
  healHero: (amount: number) => number;
  applyDamage: (damage: number, source?: 'combat' | 'general', opts?: { blockedWithShield?: boolean }) => number;
  beginCombat: (monster: GameCardData, initiator: 'hero' | 'monster') => void;
  updateMonsterCard: (id: string, updater: (m: GameCardData) => GameCardData) => void;
  isMonsterEngaged: (monsterId: string) => boolean;
  damageMonsterWithLayerOverflow: (
    monster: GameCardData,
    damage: number,
    maxLayers?: number,
    opts?: { bypassMaxPerHit?: boolean },
  ) => GameCardData;
  handleMonsterDefeated: (monster: GameCardData, opts?: { killedByMinion?: boolean }) => void;
  recordClassDamageDiscoverHit: () => void;

  // --- Functions from useShopHandlers (Layer 2) ---
  requestCardAction: (
    keyword: import('@/components/game-board/types').CardActionKeyword,
    count: number,
    options?: {
      title?: string;
      description?: string;
      handOnly?: boolean;
      moveToDestination?: 'recycle-bag' | 'graveyard';
    },
  ) => Promise<boolean>;
  requestCardActionBatch: (
    keyword: import('@/components/game-board/types').CardActionKeyword,
    maxCount: number,
    options?: {
      title?: string;
      description?: string;
      handOnly?: boolean;
      moveToDestination?: 'recycle-bag' | 'graveyard';
    },
  ) => Promise<number>;
  requestGraveyardSelection: (
    maxCards: number,
    options?: { delivery?: 'backpack' | 'hand-first'; filter?: (card: GameCardData) => boolean },
  ) => Promise<GameCardData | null>;
  startShopFlow: (card: GameCardData | null) => boolean;
  beginDiscoverFlow: (
    effect: string,
    options?: { filter?: (card: GameCardData) => boolean; overridePool?: GameCardData[]; sourceLabel?: string },
  ) => boolean;
  handleDiscoverFallback: () => void;
  handleCardUpgrade: (cardId: string) => void;

  // --- Functions from useCardPlayHandlers (Layer 3) ---
  normalizeEventEffect: (effect: string | string[] | undefined) => string[];
  drawCardsFromBackpack: (count: number, opts?: { ignoreLimit?: boolean }) => number;
  queueCardIntoHand: (card: GameCardData, sourceHint?: FlightSourceHint) => void;

  // --- Functions from useHeroActions (Layer 4) ---
  addHeroMagicGauge: (id: HeroMagicId, amount: number) => void;

  // --- Animation / UI callbacks from GameBoard ---
  addGameLog: (type: LogEntryType, message: string) => void;
  pushUndoSnapshot: () => void;
  clearUndoStack: () => void;
  removeCard: (cardId: string, animate: boolean, opts?: { skipAutoDraw?: boolean }) => void;
  triggerClassDeckFlight: (cards: GameCardData[]) => void;
  triggerMonsterBleedAnimation: (monsterId: string, delay?: number) => void;
  dragonBleedDestroyEquipment: (monsterName: string, remainingLayers: number) => void;
  createCurseCard: (sourceCard?: GameCardData) => GameCardData;
  triggerDiscardFlight: (
    card: GameCardData,
    destination: 'graveyard' | 'recycle-bag',
    sourceHint?: FlightSourceHint,
  ) => Promise<void>;

  // --- Local state setters ---
  setEventDiceRollKey: React.Dispatch<React.SetStateAction<number>>;

  // --- Refs ---
  eventResolutionRef: React.MutableRefObject<{ cardId: string | null; source: 'dungeon' | 'hand' | null }>;
  eventChoiceProcessingRef: React.MutableRefObject<boolean>;
  skipNextEventAutoDrawRef: React.MutableRefObject<boolean>;
  backpackHandFlightsRef: React.MutableRefObject<BackpackHandFlight[]>;
  heroTurnLayerLossIdsRef: React.MutableRefObject<Set<string>>;
  bulwarkTempArmorRef: React.MutableRefObject<number>;
  handCardsRef: React.MutableRefObject<GameCardData[]>;
  setPersuadeTempDiscount: React.Dispatch<React.SetStateAction<number>>;
  discoverPotionCompletionRef: React.MutableRefObject<((payload: { banner: string }) => void) | null>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEventSystem(depsRef: React.MutableRefObject<EventSystemDeps>) {
  const engine = useGameEngine();
  const dispatch = useDispatch();
  const {
    gold,
    activeCards,
    handCards,
    backpackItems,
    discardedCards,
    equipmentSlot1,
    equipmentSlot2,
    classDeck,
    amuletSlots,
    shopLevel,
    currentEventCard,
    resolvingDungeonCardId,
    maxAmuletSlots,
    handLimitBonus,
    backpackCapacityModifier,
    gameOver,
    victory,
    combatState,
    selectedHeroSkill,
    permanentSkills,
    permanentMaxHpBonus,
    persuadeLevel,
    equipmentSlot1Reserve,
    equipmentSlot2Reserve,
    eventModalOpen,
    eventDiceModal,
    eventTransformState,
    magicChoiceModal,
    activeMonsterReward,
    monsterRewardQueue,
    shopModalOpen,
    equipmentPrompt,
    persuadeState,
    upgradeModalOpen,
    pendingAutoDrawCount,
    permanentMagicRecycleBag,
  } = useShallowGameState(s => ({
    gold: s.gold,
    activeCards: s.activeCards,
    handCards: s.handCards,
    backpackItems: s.backpackItems,
    pendingAutoDrawCount: s.pendingAutoDrawCount,
    discardedCards: s.discardedCards,
    equipmentSlot1: s.equipmentSlot1,
    equipmentSlot2: s.equipmentSlot2,
    classDeck: s.classDeck,
    amuletSlots: s.amuletSlots,
    permanentMagicRecycleBag: s.permanentMagicRecycleBag,
    shopLevel: s.shopLevel,
    currentEventCard: s.currentEventCard,
    resolvingDungeonCardId: s.resolvingDungeonCardId,
    maxAmuletSlots: s.maxAmuletSlots,
    handLimitBonus: s.handLimitBonus,
    backpackCapacityModifier: s.backpackCapacityModifier,
    gameOver: s.gameOver,
    victory: s.victory,
    combatState: s.combatState,
    selectedHeroSkill: s.selectedHeroSkill,
    permanentSkills: s.permanentSkills,
    permanentMaxHpBonus: s.permanentMaxHpBonus,
    persuadeLevel: s.persuadeLevel,
    equipmentSlot1Reserve: s.equipmentSlot1Reserve,
    equipmentSlot2Reserve: s.equipmentSlot2Reserve,
    eventModalOpen: s.eventModalOpen,
    eventDiceModal: s.eventDiceModal,
    eventTransformState: s.eventTransformState,
    magicChoiceModal: s.magicChoiceModal,
    activeMonsterReward: s.activeMonsterReward,
    monsterRewardQueue: s.monsterRewardQueue,
    shopModalOpen: s.shopModalOpen,
    equipmentPrompt: s.equipmentPrompt,
    persuadeState: s.persuadeState,
    upgradeModalOpen: s.upgradeModalOpen,
  }));

  // -- State helpers -----------------------------------------------------------

  type GS = import('@/game-core/types').GameState;

  // -- Derived values ---------------------------------------------------------

  const effectiveHandLimit = HAND_LIMIT + handLimitBonus;
  const backpackCapacity = Math.max(1, BASE_BACKPACK_CAPACITY + backpackCapacityModifier);
  const maxHp =
    INITIAL_HP +
    (depsRef.current?.amuletEffects?.aura?.maxHp ?? 0) +
    permanentMaxHpBonus +
    (permanentSkills.includes('Iron Will') ? 3 : 0) +
    (() => {
      if (!selectedHeroSkill) return 0;
      try {
        const def = getHeroSkillById(selectedHeroSkill as HeroSkillId);
        return def?.initialMaxHpBonus ?? 0;
      } catch {
        return 0;
      }
    })();

  // -- Settled check for deferred auto-draw -----------------------------------
  // Auto-draw from backpack should only happen when ALL card effects (modals,
  // choices, rewards, chain effects) are fully resolved.
  const isSettledForAutoDraw =
    !resolvingDungeonCardId &&
    !currentEventCard &&
    !eventModalOpen &&
    !eventDiceModal &&
    !eventTransformState &&
    !magicChoiceModal &&
    !activeMonsterReward &&
    monsterRewardQueue.length === 0 &&
    !shopModalOpen &&
    !equipmentPrompt &&
    !persuadeState;

  // -- Convenience accessors --------------------------------------------------

  const addGameLog = (type: LogEntryType, message: string) =>
    depsRef.current.addGameLog(type, message);

  // -- Internal refs (only used by functions in this hook) --------------------

  // FIFO queue for dice requests. When two dice are requested in the same
  // reduce/drain tick (e.g. 雷震击 stun + bone-regen 骸生), the earlier
  // single-slot impl had the second overwrite the first, dropping the
  // first dice's resolver entirely (so the monster never got stunned no
  // matter the RNG). The queue shows them sequentially instead.
  type DiceConfig = {
    title: string;
    subtitle?: string;
    entries: EventDiceRange[];
    flowContext?: Record<string, unknown>;
    predeterminedRoll?: number;
  };
  const diceQueueRef = useRef(createDiceQueue<DiceConfig, EventDiceRange>(entry => {
    // The actual modal-opening dispatches. Wrapped so we can defer them when
    // the engine is in the monster-skill-float HARD_PAUSE phase, see below.
    const openDiceModal = () => {
      dispatch({ type: 'SET_EVENT_DICE_MODAL', payload: {
        title: entry.config.title,
        subtitle: entry.config.subtitle,
        entries: entry.config.entries,
        rolledValue: null,
        highlightedId: null,
        flowContext: entry.config.flowContext,
        predeterminedRoll: entry.config.predeterminedRoll ?? null,
      } });
      dispatch({ type: 'SET_PHASE', phase: 'awaitingDice' });
      depsRef.current.setEventDiceRollKey(key => key + 1);
    };

    // 雷涌一击 / stun-strike / 任何「打怪同 tick emit ui:requestDice」的 magic
    // bug（用户报告的击晕骰不弹）：show 回调是从 ui:requestDice 监听器里 re-
    // entrantly 触发的，那时它的两个 dispatch 会被压进 _dispatchQueue 等候。
    // 等到 _dispatchQueue 真正被 drain 时，pipeline 已经先把 DEAL_DAMAGE_TO_
    // MONSTER 处理完，怪物的 boss-retaliation / dragon-breath / bleed /
    // dragon-bleed-destroy 等被动会 enqueue 一个 TRIGGER_MONSTER_SKILL_FLOAT，
    // 把 phase 切到 'awaitingSkillFloat'。GameEngine._processAction 上的
    // awaitingSkillFloat 守卫此时会**丢弃**这两个 SET_*，于是 dice modal 永
    // 远不弹。
    //
    // 修复：检测到 awaitingSkillFloat 时不立刻 dispatch，而是订阅 engine
    // state，等 phase 退出 awaitingSkillFloat（即 RELEASE_MONSTER_SKILL_FLOAT
    // 把 float 队列清空）之后再补 dispatch。这样动画播完，dice 就接着弹。
    if (engine.getState().phase === 'awaitingSkillFloat') {
      const unsub = engine.subscribe(() => {
        if (engine.getState().phase !== 'awaitingSkillFloat') {
          unsub();
          openDiceModal();
        }
      });
      return;
    }
    openDiceModal();
  }));
  const magicChoiceResolverRef = useRef<((optionId: string) => void) | null>(null);
  const equipmentPromptResolverRef = useRef<((slot: EquipmentSlotId | null) => void) | null>(null);
  const eventAmplifyHandResolverRef = useRef<((cardId: string | null) => void) | null>(null);
  const pendingAutoDrawsRef = useRef(0);
  const [autoDrawTrigger, setAutoDrawTrigger] = useState(0);
  const processedDungeonCardIdsRef = useRef<Set<string>>(new Set());
  const skipEventFlipRef = useRef(false);
  const eventAwaitingUpgradeRef = useRef(false);
  const prevUpgradeModalOpenRef = useRef(upgradeModalOpen);

  useEffect(() => {
    const wasOpen = prevUpgradeModalOpenRef.current;
    prevUpgradeModalOpenRef.current = upgradeModalOpen;
    if (wasOpen && !upgradeModalOpen && eventAwaitingUpgradeRef.current) {
      eventAwaitingUpgradeRef.current = false;
      depsRef.current.eventChoiceProcessingRef.current = false;
      dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
    }
  }, [upgradeModalOpen, dispatch, depsRef]);

  // -- Internal helpers (not in deps, not returned) ---------------------------

  const findWeaponSlot = (): { id: EquipmentSlotId; item: EquipmentItem } | null => {
    for (const slot of depsRef.current.getEquipmentSlots()) {
      if (slot.item?.type === 'weapon' || slot.item?.type === 'monster') return slot as { id: EquipmentSlotId; item: EquipmentItem };
    }
    return null;
  };

  const findShieldSlot = (): { id: EquipmentSlotId; item: EquipmentItem } | null => {
    for (const slot of depsRef.current.getEquipmentSlots()) {
      if (slot.item?.type === 'shield' || slot.item?.type === 'monster') return slot as { id: EquipmentSlotId; item: EquipmentItem };
    }
    return null;
  };

  // ---------------------------------------------------------------------------
  // startEventResolution
  // ---------------------------------------------------------------------------

  const startEventResolution = (cardId: string | null, source: 'dungeon' | 'hand') => {
    depsRef.current.eventResolutionRef.current = { cardId, source };
    if (source === 'dungeon' && cardId) {
      dispatch({ type: 'SET_RESOLVING_DUNGEON_CARD', cardId });
    }
  };

  // ---------------------------------------------------------------------------
  // processPendingAutoDraws
  // ---------------------------------------------------------------------------

  const processPendingAutoDraws = useCallback(() => {
    const st = engine.getState();
    if (st.pendingAutoDrawCount <= 0) return;
    dispatch({ type: 'PROCESS_AUTO_DRAWS' });
  }, [engine, dispatch]);

  // Re-fire whenever `pendingAutoDrawCount` itself changes — this is the
  // source of truth and is incremented by both the legacy hook callback
  // (`registerDungeonCardProcessed` / `enqueueAutoDraw`) AND the reducer's
  // `postProcessActiveCards` slot-clear detection (which dispatches
  // `REGISTER_DUNGEON_CARD_PROCESSED` directly without going through the
  // hook). Subscribing to the field guarantees the drain runs no matter
  // which path bumped the counter. See docs/auto-draw-debug.md.
  useEffect(() => {
    if (isSettledForAutoDraw && pendingAutoDrawCount > 0) {
      dispatch({ type: 'PROCESS_AUTO_DRAWS' });
    }
  }, [isSettledForAutoDraw, pendingAutoDrawCount, backpackItems.length, handCards.length, dispatch, autoDrawTrigger]);

  // ---------------------------------------------------------------------------
  // enqueueAutoDraw (deferred — actual processing by useEffect)
  // ---------------------------------------------------------------------------

  const enqueueAutoDraw = useCallback(
    (source: 'remove-card' | 'slot-cleared' | 'backpack-store', cardId: string) => {
      const st = engine.getState();
      if (st.backpackItems.length === 0) {
        logBackpackDraw('auto-draw-skipped-backpack-empty', {
          source,
          cardId,
          pending: st.pendingAutoDrawCount,
        });
        return;
      }

      dispatch({ type: 'SET_GAME_FLAGS', patch: { pendingAutoDrawCount: st.pendingAutoDrawCount + 1 } });
      setAutoDrawTrigger(v => v + 1);
      logBackpackDraw('auto-draw-enqueued', {
        source,
        cardId,
        pending: st.pendingAutoDrawCount + 1,
      });
    },
    [engine, dispatch],
  );

  // ---------------------------------------------------------------------------
  // registerDungeonCardProcessed
  // ---------------------------------------------------------------------------
  // Records that a dungeon card has been processed. Auto-draw is DEFERRED:
  // the pending counter is incremented here, but actual drawing only happens
  // when the game reaches a "settled" state (no modals, rewards, etc.) via
  // the isSettledForAutoDraw useEffect above.

  const registerDungeonCardProcessed = useCallback(
    (cardId: string | null | undefined, source: 'remove-card' | 'slot-cleared' | 'backpack-store') => {
      if (!cardId || gameOver || victory) return;

      dispatch({ type: 'REGISTER_DUNGEON_CARD_PROCESSED', cardId, source });
      setAutoDrawTrigger(v => v + 1);
    },
    [gameOver, victory, dispatch],
  );

  // ---------------------------------------------------------------------------
  // requestDiceOutcome / handleDiceRollResult / cancelDiceModal
  // ---------------------------------------------------------------------------

  const requestDiceOutcome = useCallback(
    (config: {
      title: string;
      subtitle?: string;
      entries: EventDiceRange[];
      flowContext?: Record<string, unknown>;
      /** Pre-rolled D20 from reducer's seeded RNG. UI dice animates to this value. */
      predeterminedRoll?: number;
    }) => {
      return diceQueueRef.current.enqueue(config);
    },
    [],
  );

  const handleDiceRollResult = useCallback((value: number) => {
    const prev = engine.getState().eventDiceModal;
    if (!prev) return;

    const matched =
      prev.entries.find(entry => value >= entry.range[0] && value <= entry.range[1]) ??
      prev.entries[prev.entries.length - 1] ??
      null;

    const contextLabel = prev.subtitle ? `${prev.title}（${prev.subtitle}）` : prev.title;
    addGameLog('event', `${contextLabel} 掷骰：${value} → ${matched?.label ?? '无效果'}`);

    dispatch({ type: 'SET_EVENT_DICE_MODAL', payload: {
      ...prev,
      rolledValue: value,
      highlightedId: matched?.id ?? null,
    } });

    window.setTimeout(() => {
      // complete() resolves the active resolver and auto-flushes the next
      // queued entry (if any) by invoking the show callback we passed to
      // createDiceQueue — that callback dispatches SET_EVENT_DICE_MODAL for
      // the next dice. Any RESOLVE_DICE chain dispatched after this will
      // see active=set (next dice already showing) and just queue behind it.
      diceQueueRef.current.complete(matched ?? null);
      dispatch({
        type: 'RESOLVE_DICE',
        value,
        outcomeId: matched?.id ?? null,
        context: { title: prev.title, subtitle: prev.subtitle, ...prev.flowContext },
      });
      if (diceQueueRef.current.isIdle()) {
        // No queued dice and chain didn't add one — close modal.
        dispatch({ type: 'SET_EVENT_DICE_MODAL', payload: null });
      }
    }, 900);
  }, [engine]);

  const cancelDiceModal = useCallback(() => {
    // Player manually closed the modal — drop the active dice and any queued
    // dice (resolving each promise with null) so they don't pop up later.
    diceQueueRef.current.cancel();
    dispatch({ type: 'SET_EVENT_DICE_MODAL', payload: null });
    dispatch({ type: 'SET_PHASE', phase: 'playerInput' });
  }, []);

  // ---------------------------------------------------------------------------
  // requestMagicChoice / handleMagicChoice
  // ---------------------------------------------------------------------------

  const requestMagicChoice = useCallback(
    (config: MagicChoiceModalState) => {
      return new Promise<string>(resolve => {
        magicChoiceResolverRef.current = resolve;
        dispatch({ type: 'SET_MAGIC_CHOICE_MODAL', payload: config });
        dispatch({ type: 'SET_PHASE', phase: 'awaitingMagicTarget' });
      });
    },
    [],
  );

  const handleMagicChoice = useCallback((optionId: string) => {
    const modal = engine.getState().magicChoiceModal;
    magicChoiceResolverRef.current?.(optionId);
    magicChoiceResolverRef.current = null;
    dispatch({ type: 'SET_MAGIC_CHOICE_MODAL', payload: null });
    dispatch({ type: 'RESOLVE_MAGIC_CHOICE', choiceId: optionId, context: { ...modal?.flowContext } });
  }, [engine]);

  // ---------------------------------------------------------------------------
  // requestEquipmentSelection / handleEquipmentPromptSelection / cancelEquipmentPrompt
  // ---------------------------------------------------------------------------

  const requestEquipmentSelection = useCallback(
    (prompt: EquipmentPromptState): Promise<EquipmentSlotId | null> => {
      return new Promise(resolve => {
        if (!equipmentSlot1 && !equipmentSlot2) {
          resolve(null);
          return;
        }
        equipmentPromptResolverRef.current = resolve;
        dispatch({ type: 'SET_EQUIPMENT_PROMPT', payload: prompt });
        dispatch({ type: 'SET_PHASE', phase: 'awaitingEquipmentPrompt' });
      });
    },
    [equipmentSlot1, equipmentSlot2],
  );

  const handleEquipmentPromptSelection = useCallback((slot: EquipmentSlotId) => {
    const modal = engine.getState().equipmentPrompt;
    equipmentPromptResolverRef.current?.(slot);
    equipmentPromptResolverRef.current = null;
    dispatch({ type: 'SET_EQUIPMENT_PROMPT', payload: null });
    dispatch({ type: 'RESOLVE_EQUIPMENT_CHOICE', slotId: slot, context: { ...modal?.flowContext } });
  }, [engine]);

  const cancelEquipmentPrompt = useCallback(() => {
    if (equipmentPromptResolverRef.current) {
      equipmentPromptResolverRef.current(null);
      equipmentPromptResolverRef.current = null;
    }
    dispatch({ type: 'SET_EQUIPMENT_PROMPT', payload: null });
    dispatch({ type: 'SET_PHASE', phase: 'playerInput' });
  }, []);

  // ---------------------------------------------------------------------------
  // requestEventAmplifyHandSelection / handleEventAmplifyHandSelect / cancelEventAmplifyHandPicker
  //
  // 增幅仪式（事件）选项 2「选择手牌中的装备或魔法」：当 eligible >= 2 时
  // 弹出 AmplifyModal 让玩家选目标，eligible == 1 时由调用方直接自动选。
  // ---------------------------------------------------------------------------

  const requestEventAmplifyHandSelection = useCallback(
    (config: { eventCardId: string; cellIdx: number }): Promise<string | null> => {
      return new Promise(resolve => {
        eventAmplifyHandResolverRef.current = resolve;
        dispatch({ type: 'SET_EVENT_AMPLIFY_HAND_PICKER', payload: config });
      });
    },
    [],
  );

  const handleEventAmplifyHandSelect = useCallback((cardId: string) => {
    eventAmplifyHandResolverRef.current?.(cardId);
    eventAmplifyHandResolverRef.current = null;
    dispatch({ type: 'SET_EVENT_AMPLIFY_HAND_PICKER', payload: null });
  }, []);

  const cancelEventAmplifyHandPicker = useCallback(() => {
    if (eventAmplifyHandResolverRef.current) {
      eventAmplifyHandResolverRef.current(null);
      eventAmplifyHandResolverRef.current = null;
    }
    dispatch({ type: 'SET_EVENT_AMPLIFY_HAND_PICKER', payload: null });
  }, []);

  // ---------------------------------------------------------------------------
  // evaluateChoiceRequirements
  // ---------------------------------------------------------------------------

  const evaluateChoiceRequirements = useCallback(
    (choice?: EventChoiceDefinition): EventChoiceAvailability => {
      if (!choice?.requires?.length) {
        return { disabled: false };
      }
      for (const requirement of choice.requires) {
        if (requirement.type === 'equipment') {
          const slotItem = requirement.slot === 'left' ? equipmentSlot1 : equipmentSlot2;
          if (!slotItem) {
            return {
              disabled: true,
              reason:
                requirement.message ??
                (requirement.slot === 'left' ? '左侧装备栏为空' : '右侧装备栏为空'),
            };
          }
        } else if (requirement.type === 'equipmentAny') {
          if (!equipmentSlot1 && !equipmentSlot2) {
            return { disabled: true, reason: requirement.message ?? '至少需要一件装备' };
          }
        } else if (requirement.type === 'amulet') {
          if (!amuletSlots.length) {
            return { disabled: true, reason: requirement.message ?? '至少需要一个护身符' };
          }
        } else if (requirement.type === 'hand') {
          if (handCards.length < requirement.min) {
            return {
              disabled: true,
              reason: requirement.message ?? `至少需要 ${requirement.min} 张手牌`,
            };
          }
        } else if (requirement.type === 'cardPool') {
          let total = 0;
          if (requirement.pools.includes('hand')) {
            total += handCards.length;
          }
          if (requirement.pools.includes('backpack')) {
            total += backpackItems.length;
          }
          if (total < requirement.min) {
            return {
              disabled: true,
              reason:
                requirement.message ??
                `需要至少 ${requirement.min} 张可用卡牌（手牌/背包）`,
            };
          }
        } else if (requirement.type === 'graveyard') {
          if (discardedCards.length < requirement.min) {
            return {
              disabled: true,
              reason: requirement.message ?? '坟场中没有足够的卡牌',
            };
          }
        } else if (requirement.type === 'gold') {
          if (gold < requirement.min) {
            return {
              disabled: true,
              reason: requirement.message ?? `需要至少 ${requirement.min} 金币`,
            };
          }
        } else if (requirement.type === 'leftmostIsEnraged') {
          const leftmostCard = activeCards.find(c => c != null);
          const isEnragedMonster = leftmostCard &&
            leftmostCard.type === 'monster' &&
            depsRef.current.isMonsterEngaged(leftmostCard.id);
          if (!isEnragedMonster) {
            return { disabled: true, reason: requirement.message ?? '需要最左边的卡牌是一个激怒的怪物' };
          }
        } else if (requirement.type === 'shopLevel') {
          if (shopLevel < requirement.min) {
            return { disabled: true, reason: requirement.message ?? `商店等级不足 ${requirement.min}` };
          }
        } else if (requirement.type === 'persuadeLevel') {
          if (persuadeLevel < requirement.min) {
            return { disabled: true, reason: requirement.message ?? `劝降等级不足 ${requirement.min}` };
          }
        } else if (requirement.type === 'handUpgraded') {
          const upgradedCount = handCards.filter(c => (c.upgradeLevel ?? 0) > 0).length;
          if (upgradedCount < requirement.min) {
            return { disabled: true, reason: requirement.message ?? '手牌中没有已增幅的卡牌' };
          }
        } else if (requirement.type === 'recycleBag') {
          if (permanentMagicRecycleBag.length < requirement.min) {
            return {
              disabled: true,
              reason: requirement.message ?? `回收袋至少需要 ${requirement.min} 张牌`,
            };
          }
        }
      }
      return { disabled: false };
    },
    [activeCards, amuletSlots.length, backpackItems.length, combatState.engagedMonsterIds, discardedCards.length, equipmentSlot1, equipmentSlot2, gold, handCards, resolvingDungeonCardId, shopLevel, persuadeLevel, permanentMagicRecycleBag.length],
  );

  // ---------------------------------------------------------------------------
  // eventChoiceStates
  // ---------------------------------------------------------------------------

  const eventChoiceStates = useMemo<EventChoiceAvailability[]>(() => {
    if (!currentEventCard?.eventChoices) {
      return [];
    }
    const baseStates = currentEventCard.eventChoices.map(choice => evaluateChoiceRequirements(choice));
    const availabilityLookup: Record<string, boolean> = {};

    currentEventCard.eventChoices.forEach((choice, index) => {
      if (choice.id) {
        availabilityLookup[choice.id] = !(baseStates[index]?.disabled ?? false);
      }
    });

    return currentEventCard.eventChoices.map((choice, index) => {
      const baseState = baseStates[index];
      if (!baseState.disabled && choice.requiresDisabledChoices?.length) {
        const anyActive = choice.requiresDisabledChoices.some(id => availabilityLookup[id]);
        if (anyActive) {
          return {
            disabled: true,
            reason: choice.requiresDisabledReason ?? '其他选项仍可用',
          };
        }
      }
      if (!baseState.disabled && choice.effect && !choice.diceTable) {
        const tokens = depsRef.current.normalizeEventEffect(choice.effect);
        if (tokens.some(t => t.startsWith('shopLevel+')) && shopLevel >= MAX_SHOP_LEVEL) {
          return { disabled: true, reason: `商店等级已达上限（Lv.${MAX_SHOP_LEVEL}）` };
        }
        if (tokens.some(t => t.startsWith('persuadeLevel+')) && persuadeLevel >= 4) {
          return { disabled: true, reason: '劝降等级已达上限（Lv.4）' };
        }
      }
      return baseState;
    });
  }, [currentEventCard, evaluateChoiceRequirements, shopLevel, persuadeLevel]);

  // ---------------------------------------------------------------------------
  // gainClassDeckBottomCards
  // ---------------------------------------------------------------------------

  const gainClassDeckBottomCards = useCallback(
    (count: number): GameCardData[] => {
      const st = engine.getState();
      if (count <= 0 || st.classDeck.length === 0) {
        return [];
      }
      const cap = Math.max(1, BASE_BACKPACK_CAPACITY + st.backpackCapacityModifier);
      const availableSlots = cap - st.backpackItems.length;
      if (availableSlots <= 0) {
        return [];
      }
      const takeCount = Math.min(count, availableSlots, st.classDeck.length);
      if (takeCount <= 0) {
        return [];
      }
      const cards = st.classDeck.slice(-takeCount);
      dispatch({ type: 'GAIN_CLASS_DECK_BOTTOM_CARDS', count });
      depsRef.current.triggerClassDeckFlight(cards);
      return cards;
    },
    [engine, dispatch],
  );

  // ---------------------------------------------------------------------------
  // finalizeEventResolution
  // ---------------------------------------------------------------------------

  const finalizeEventResolution = (options?: { removeFromDungeon?: boolean }) => {
    const resolution = depsRef.current.eventResolutionRef.current;
    if (resolution.source === 'dungeon' && resolution.cardId) {
      if (options?.removeFromDungeon !== false) {
        const shouldSkipAutoDraw = depsRef.current.skipNextEventAutoDrawRef.current;
        depsRef.current.skipNextEventAutoDrawRef.current = false;
        depsRef.current.removeCard(resolution.cardId, false, shouldSkipAutoDraw ? { skipAutoDraw: true } : undefined);
      }
      const currentResolvingId = engine.getState().resolvingDungeonCardId;
      if (currentResolvingId === resolution.cardId) {
        dispatch({ type: 'SET_RESOLVING_DUNGEON_CARD', cardId: null });
      }
    }

    depsRef.current.eventResolutionRef.current = { cardId: null, source: null };
  };

  // ---------------------------------------------------------------------------
  // completeCurrentEvent
  // ---------------------------------------------------------------------------

  const completeCurrentEvent = useCallback((options?: { skipFlip?: boolean }) => {
    if (!currentEventCard) return;
    const skipFlip = options?.skipFlip ?? skipEventFlipRef.current;
    skipEventFlipRef.current = false;

    // Clear event resolution tracking
    depsRef.current.eventResolutionRef.current = { cardId: null, source: null };

    dispatch({ type: 'COMPLETE_EVENT', skipFlip });
  }, [currentEventCard, dispatch]);

  // ---------------------------------------------------------------------------
  // handleEventChoice
  // ---------------------------------------------------------------------------

  const handleEventChoice = (choiceIndex: number) => {
    if (depsRef.current.eventChoiceProcessingRef.current) return;
    depsRef.current.pushUndoSnapshot();
    if (!currentEventCard || !currentEventCard.eventChoices) return;

    const choice = currentEventCard.eventChoices[choiceIndex];
    if (!choice) return;

    if (eventChoiceStates[choiceIndex]?.disabled) {
      return;
    }

    const effects = depsRef.current.normalizeEventEffect(choice.effect);
    const skipFlip = !!(choice.skipFlip && currentEventCard?.flipTarget);

    if (choice.diceTable?.length) {
      depsRef.current.eventChoiceProcessingRef.current = true;
      dispatch({ type: 'ROLL_DICE_FOR_FLOW' });
      const eventDicePredeterminedRoll = engine.getState().lastFlowDiceRoll ?? undefined;
      requestDiceOutcome({
        title: currentEventCard.name,
        subtitle: choice.text,
        entries: choice.diceTable,
        flowContext: { flowId: 'event-dice' },
        predeterminedRoll: eventDicePredeterminedRoll,
      } as any).then(diceResult => {
        depsRef.current.eventChoiceProcessingRef.current = false;
        if (!diceResult) return;
        effects.push(...depsRef.current.normalizeEventEffect(diceResult.effect));
        const diceSkipFlip = skipFlip || !!(diceResult.skipFlip && currentEventCard?.flipTarget);
        dispatch({
          type: 'RESOLVE_EVENT_CHOICE',
          choiceId: choice.id ?? String(choiceIndex),
          choiceText: choice.text,
          effectTokens: effects,
          skipFlip: diceSkipFlip,
        });
      });
      return;
    }

    dispatch({
      type: 'RESOLVE_EVENT_CHOICE',
      choiceId: choice.id ?? String(choiceIndex),
      choiceText: choice.text,
      effectTokens: effects,
      skipFlip,
    });
  };

  // Listen for interactive event effects emitted by RESOLVE_EVENT_CHOICE / CONTINUE_EVENT_EFFECTS
  useGameEvent('event:requestEventInteraction', (payload) => {
    const eventCard = engine.getState().currentEventCard;
    handleEventInteraction(payload as { token: string; data: Record<string, unknown> }, eventCard);
  });

  useGameEvent('combat:persuadeDiscountUpdate', (payload) => {
    depsRef.current.setPersuadeTempDiscount((payload as any).newReduction ?? 0);
  });

  // State-driven via currentEventCard — no animation needed
  useGameEvent('event:started', () => {
    // UI display fully driven by currentEventCard state field
  });

  // Event completed — log for game history
  useGameEvent('event:completed', ({ cardId }) => {
    addGameLog('event', `事件完成：${cardId}`);
  });

  // Event finalized — all cleanup done
  useGameEvent('event:finalized', () => {
    // Post-event state transitions handled by reducer
  });

  // Event card removed from active row — trigger removal animation
  useGameEvent('event:cardRemoved', ({ cardId, removed, card }) => {
    if (removed) {
      // Fly the event card from its dungeon slot to the graveyard. We must
      // call this BEFORE removeCard / before React commits the slot=null
      // patch, otherwise the source DOM node is gone and the flight has no
      // anchor. `triggerDiscardFlight` captures the source rect synchronously
      // via the card's data-testid, then runs the overlay flight independently
      // — so the slot-clear that follows in this same call stack is fine.
      // No-flip events always end up in the graveyard (see reduceCompleteEvent
      // line ~270, which pushes the card into discardedCards directly).
      if (card) {
        void depsRef.current.triggerDiscardFlight(card, 'graveyard');
      }
      depsRef.current.removeCard(cardId, true);
    }
  });

  // Card transform animation — trigger the visual transition
  useGameEvent('event:cardTransformed', ({ fromCard, toCard, message, hasFlipGold }) => {
    if (fromCard) {
      void depsRef.current.triggerEventTransform(fromCard, toCard, message);
    }
    if (hasFlipGold) {
      addGameLog('gold', '熔炉之心：卡牌翻转，获得金币。');
    }
  });

  // Async effect tokens — individual per-token processing is handled by
  // event:requestEventInteraction above. This listener sets the processing
  // guard so re-entrant event choices are blocked during resolution.
  useGameEvent('event:asyncEffectNeeded', ({ tokens }) => {
    if (tokens.length > 0) {
      depsRef.current.eventChoiceProcessingRef.current = true;
    }
  });

  // Pipeline drain hit MAX_STEPS — show a non-blocking warning so the
  // player knows some chained effects (e.g. on-enter-hand triggers) may
  // have been deferred to the next dispatch, and may be lost entirely if
  // they undo before the queue drains. See `docs/auto-draw-debug.md`
  // "Round 4" for the bug class this surfaces.
  useGameEvent('pipeline:overflow', ({ stepsProcessed, remainingQueueLength, headActionTypes }) => {
    addGameLog('system', `效果链过长被截断：已执行 ${stepsProcessed} 步，剩余 ${remainingQueueLength} 个动作排队下一步执行（首批：${headActionTypes.join('、')}）。如有效果未发动，请截图上报。`);
    dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `效果链过长被截断（${remainingQueueLength} 项排队）。如有效果未发动，请截图上报。` });
  });

  // ---------------------------------------------------------------------------
  // handleEventInteraction — dispatched by event:requestEventInteraction
  // ---------------------------------------------------------------------------

  const handleEventInteraction = (
    payload: { token: string; data: Record<string, unknown> },
    eventCard: GameCardData | null,
  ) => {
    const token = payload.token;
    const s = engine.getState();

    // --- Discover / Shop flows (deferred — completeCurrentEvent called by shop/discover handlers) ---
    if (token === 'discoverClass') {
      addGameLog('event', '事件效果：发现职业牌');
      const started = depsRef.current.beginDiscoverFlow(token, { sourceLabel: eventCard?.name });
      if (!started) depsRef.current.handleDiscoverFallback();
    } else if (token === 'discoverClassWeapon') {
      addGameLog('event', '事件效果：发现专属武器');
      const started = depsRef.current.beginDiscoverFlow(token, {
        filter: (c: GameCardData) => c.type === 'weapon',
        sourceLabel: eventCard?.name,
      });
      if (!started) depsRef.current.handleDiscoverFallback();
    } else if (token === 'discoverClassMagic') {
      addGameLog('event', '事件效果：发现专属魔法牌');
      const started = depsRef.current.beginDiscoverFlow(token, {
        filter: (c: GameCardData) => c.type === 'magic' || c.type === 'hero-magic',
        sourceLabel: eventCard?.name,
      });
      if (!started) depsRef.current.handleDiscoverFallback();
    } else if (
      token === 'discoverStarterMagic'
      || token === 'discoverStarterEquipment'
      || token === 'discoverStarterPotion'
      || token === 'discoverStarterAmulet'
    ) {
      const preRolledPool = (payload.data?.pool as GameCardData[] | undefined) ?? [];
      if (preRolledPool.length > 0) {
        // 装备发现 / 护符发现（开局第一行固定事件）：选中后直接进手牌，
        // 让玩家第一回合就能立刻装备或激活——其余 starter discover
        // (魔法 / 药水) 仍走默认背包路径。
        const handFirst = token === 'discoverStarterEquipment'
          || token === 'discoverStarterAmulet';
        depsRef.current.beginDiscoverFlow(token, {
          overridePool: preRolledPool,
          sourceLabel: eventCard?.name,
          delivery: handFirst ? 'hand-first' : undefined,
        });
      }
    } else if (token === 'openShop') {
      addGameLog('shop', '事件效果：开启商店');
      depsRef.current.startShopFlow(eventCard);

    // --- Card action flows ---
    } else if (token.startsWith('deleteCardForGold:')) {
      const parts = token.replace('deleteCardForGold:', '').split(':');
      const deleteCount = parseInt(parts[0], 10) || 3;
      const goldPerCard = parseInt(parts[1], 10) || 5;
      const costLabel = goldPerCard < 0 ? `每张消耗 ${Math.abs(goldPerCard)} 金币` : `每张获得 ${goldPerCard} 金币`;
      depsRef.current.requestCardActionBatch('delete', deleteCount, {
        title: `焚毁卡牌（最多 ${deleteCount} 张）`,
        description: `选择最多 ${deleteCount} 张卡牌删除，${costLabel}。`,
      }).then(deletedCount => {
        if (deletedCount > 0) {
          const totalGold = deletedCount * goldPerCard;
          dispatch({ type: 'MODIFY_GOLD', delta: totalGold, source: 'event-delete-card-gold' });
          if (totalGold >= 0) {
            addGameLog('event', `事件效果：焚毁卡牌获得 ${totalGold} 金币`);
            dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `焚毁了 ${deletedCount} 张卡牌，共获得 ${totalGold} 金币！` });
          } else {
            addGameLog('event', `事件效果：焚毁 ${deletedCount} 张卡牌，消耗 ${Math.abs(totalGold)} 金币`);
            dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `焚毁了 ${deletedCount} 张卡牌，消耗 ${Math.abs(totalGold)} 金币！` });
          }
        }
        dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
        depsRef.current.eventChoiceProcessingRef.current = false;
      });
    } else if (token.startsWith('discardCards:')) {
      const discardCount = parseInt(token.replace('discardCards:', ''), 10) || 1;
      depsRef.current.requestCardActionBatch('discard-recycle', discardCount, {
        title: `弃回最多 ${discardCount} 张卡牌`,
        description: '从手牌、装备栏或护符栏中选择要弃回的卡牌。',
      }).then(count => {
        if (count === 0) {
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '未弃置任何卡牌。' });
        }
        dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
        depsRef.current.eventChoiceProcessingRef.current = false;
      });
    } else if (token.startsWith('deleteCard')) {
      const colonIdx = token.indexOf(':');
      const deleteCount = colonIdx >= 0 ? parseInt(token.substring(colonIdx + 1), 10) || 1 : 1;
      depsRef.current.requestCardActionBatch('delete', deleteCount, {
        title: `删除最多 ${deleteCount} 张卡牌`,
        description: '被删除的卡牌会被送入坟场，永久离开你的牌库。',
      }).then(count => {
        if (count === 0) {
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '未删除任何卡牌。' });
        }
        dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
        depsRef.current.eventChoiceProcessingRef.current = false;
      });
    } else if (token === 'graveyardDiscover') {
      depsRef.current.requestGraveyardSelection(3).then(selected => {
        if (selected) {
          addGameLog('event', `事件效果：从坟场召回 ${selected.name}`);
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `你从坟场带回了 ${selected.name}。` });
        } else {
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '坟场中没有可召回的卡牌。' });
        }
        dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
        depsRef.current.eventChoiceProcessingRef.current = false;
      });
    } else if (token === 'graveyardDiscoverMagic') {
      depsRef.current.requestGraveyardSelection(3, {
        filter: (c: GameCardData) => c.type === 'magic' || c.type === 'hero-magic',
      }).then(selected => {
        if (selected) {
          addGameLog('event', `事件效果：从坟场获得魔法卡 ${selected.name}`);
        } else {
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '坟场中没有魔法卡。' });
        }
        dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
        depsRef.current.eventChoiceProcessingRef.current = false;
      });

    // --- Equipment interactions ---
    } else if (token === 'equipBurst+4') {
      requestEquipmentSelection({
        prompt: '选择一把武器接受锋刃祝福',
        subtext: '该武器下次攻击将额外 +4 伤害。',
        flowContext: { flowId: 'blade-blessing' },
      }).then(selected => {
        if (selected) {
          const slotItem = selected === 'equipmentSlot1' ? s.equipmentSlot1 : s.equipmentSlot2;
          if (slotItem?.type === 'weapon' || slotItem?.type === 'monster') {
            dispatch({ type: 'SET_SLOT_ATTACK_BURST', slotId: selected, amount: 4 });
            addGameLog('event', `事件效果：${slotItem.name} 下次攻击 +4`);
            dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `${slotItem.name} 的下次攻击将额外造成 4 点伤害！` });
          } else {
            dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '所选装备不是武器。' });
          }
        }
        dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
        depsRef.current.eventChoiceProcessingRef.current = false;
      });
    } else if (token === 'destroyEquipment:any') {
      const slotsWithItems = depsRef.current.getEquipmentSlots().filter(sl => sl.item);
      if (!slotsWithItems.length) {
        addGameLog('event', '事件效果：无装备可破坏');
        dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
        depsRef.current.eventChoiceProcessingRef.current = false;
        return;
      }
      const applyDestroy = (selected: EquipmentSlotId) => {
        const item = (selected === 'equipmentSlot1' ? engine.getState().equipmentSlot1 : engine.getState().equipmentSlot2) as EquipmentItem | null;
        if (!item) return;
        addGameLog('event', `事件效果：破坏装备「${item.name}」`);
        depsRef.current.sacrificeEquipment(selected);
        dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
        depsRef.current.eventChoiceProcessingRef.current = false;
      };
      if (slotsWithItems.length === 1) {
        applyDestroy(slotsWithItems[0].id);
      } else {
        requestEquipmentSelection({
          prompt: '选择要破坏的装备',
          subtext: '左或右装备栏至少保留一件。',
          flowContext: { flowId: 'destroy-equipment' },
        }).then(selected => {
          if (selected) applyDestroy(selected);
          else {
            dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
            depsRef.current.eventChoiceProcessingRef.current = false;
          }
        });
      }
    } else if (token.startsWith('returnToHand:')) {
      const returnCount = parseInt(token.replace('returnToHand:', ''), 10) || 1;
      const executeReturn = (remaining: number) => {
        if (remaining <= 0) {
          dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
          depsRef.current.eventChoiceProcessingRef.current = false;
          return;
        }
        type SlotOption = { id: string; label: string; description: string; slotType: 'equipment' | 'amulet'; slotId?: EquipmentSlotId };
        const options: SlotOption[] = [];
        const curState = engine.getState();
        if (curState.equipmentSlot1) {
          const item = curState.equipmentSlot1;
          const typeLabel = item.type === 'weapon' ? `${item.value}攻` : item.type === 'shield' ? `${item.value}防` : `${item.value}`;
          const durLabel = typeof item.durability === 'number' && typeof item.maxDurability === 'number' ? `，耐久 ${item.durability}/${item.maxDurability}` : '';
          options.push({ id: 'equipmentSlot1', label: `左装备栏 — ${item.name}`, description: `${typeLabel}${durLabel}`, slotType: 'equipment', slotId: 'equipmentSlot1' });
        }
        if (curState.equipmentSlot2) {
          const item = curState.equipmentSlot2;
          const typeLabel = item.type === 'weapon' ? `${item.value}攻` : item.type === 'shield' ? `${item.value}防` : `${item.value}`;
          const durLabel = typeof item.durability === 'number' && typeof item.maxDurability === 'number' ? `，耐久 ${item.durability}/${item.maxDurability}` : '';
          options.push({ id: 'equipmentSlot2', label: `右装备栏 — ${item.name}`, description: `${typeLabel}${durLabel}`, slotType: 'equipment', slotId: 'equipmentSlot2' });
        }
        if (curState.amuletSlots.length > 0) {
          const topAmulet = curState.amuletSlots[curState.amuletSlots.length - 1];
          options.push({ id: 'amulet', label: `护符栏 — ${topAmulet.name}`, description: '最上层护符', slotType: 'amulet' });
        }
        if (options.length === 0) {
          addGameLog('event', '事件效果：回手 — 没有可回收的装备或护符');
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '没有可回收的装备或护符。' });
          dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
          depsRef.current.eventChoiceProcessingRef.current = false;
          return;
        }
        const applyReturnChoice = (chosen: SlotOption) => {
          if (chosen.slotType === 'equipment' && chosen.slotId) {
            const slotItem = chosen.slotId === 'equipmentSlot1' ? engine.getState().equipmentSlot1 : engine.getState().equipmentSlot2;
            if (slotItem) {
              depsRef.current.clearEquipmentSlotById(chosen.slotId);
              const reserve = depsRef.current.getEquipmentReserve(chosen.slotId);
              if (reserve.length > 0) {
                const promoted = reserve[reserve.length - 1];
                depsRef.current.setEquipmentSlotById(chosen.slotId, promoted);
                depsRef.current.setEquipmentReserve(chosen.slotId, reserve.slice(0, -1));
              }
              const { fromSlot: _, ...handItem } = slotItem as EquipmentItem & { fromSlot?: string };
              depsRef.current.queueCardIntoHand(handItem as GameCardData, chosen.slotId);
              addGameLog('event', `事件效果：回手 — ${slotItem.name} 回到手牌`);
              dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `${slotItem.name} 已回到手牌！` });
            }
          } else if (chosen.slotType === 'amulet') {
            const curAmulets = engine.getState().amuletSlots;
            const topAmulet = curAmulets[curAmulets.length - 1];
            if (topAmulet) {
              dispatch({ type: 'UPDATE_AMULET_SLOTS', updater: prev => prev.slice(0, -1) });
              const { fromSlot: _, ...handItem } = topAmulet as GameCardData & { fromSlot?: string };
              depsRef.current.queueCardIntoHand(handItem as GameCardData, 'amulet');
              addGameLog('event', `事件效果：回手 — 护符「${topAmulet.name}」回到手牌`);
              dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `${topAmulet.name} 已回到手牌！` });
            }
          }
          executeReturn(remaining - 1);
        };
        if (options.length === 1) {
          applyReturnChoice(options[0]);
        } else {
          requestMagicChoice({
            title: '回手',
            subtitle: '选择一个位置，将最上面的装备/护符回收到手牌',
            options: options.map(o => ({ id: o.id, label: o.label, description: o.description })),
            flowContext: { flowId: 'event-return-to-hand' },
          }).then(choiceId => {
            applyReturnChoice(options.find(o => o.id === choiceId) ?? options[0]);
          });
        }
      };
      executeReturn(returnCount);

    // --- Upgrade ---
    } else if (token === 'upgradeCard' || token.startsWith('upgradeCard:')) {
      const count = token.startsWith('upgradeCard:') ? parseInt(token.split(':')[1], 10) || 1 : undefined;
      addGameLog('event', count ? `事件效果：选择至多 ${count} 张牌升级` : '事件效果：选择一张牌升级');
      depsRef.current.eventChoiceProcessingRef.current = true;
      eventAwaitingUpgradeRef.current = true;
      dispatch({ type: 'SET_UPGRADE_MODAL_OPEN', open: true, maxCount: count });
      dispatch({ type: 'SET_HERO_SKILL_BANNER', message: count ? `选择至多 ${count} 张牌进行升级。` : '选择一张牌进行升级。' });

    // --- Grant amulet Perm 2 (附魔祭坛) ---
    } else if (token === 'grantAmuletPerm') {
      const eligibleAmulets = (s.amuletSlots ?? []).filter(a => !a.recycleDelay || a.recycleDelay < 2);
      if (eligibleAmulets.length === 0) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '没有可赋予 Perm 2 的护符（所有护符已是 Perm 2 或更高）。' });
        addGameLog('event', '附魔祭坛：没有可赋予 Perm 2 的护符。');
        dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
        depsRef.current.eventChoiceProcessingRef.current = false;
      } else {
        dispatch({ type: 'SET_PERM_GRANT_MODAL', payload: { sourceCardId: 'event-grant', sourceType: 'amulet-perm-grant' } });
      }

    // --- Grant perm effects ---
    } else if (token.startsWith('grantFlankDraw:') || token.startsWith('grantTransformGold:') ||
               token.startsWith('grantFlankPersuadeCost:') || token.startsWith('grantFlankStunCap:') ||
               token.startsWith('grantFlankDamage:') || token.startsWith('grantTransformDraw:') ||
               token.startsWith('grantTransformHeal:')) {
      // These tokens open perm grant modals. The exact modal type is determined by the token prefix.
      const eligible = s.handCards.filter(c => {
        if (token.startsWith('grantFlank')) return !c.flankEffect;
        return !c.transformBonus;
      });
      if (eligible.length === 0) {
        const isFlank = token.startsWith('grantFlank');
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: isFlank ? '手牌中没有可赋予侧击效果的卡牌。' : '手牌中没有可赋予转型效果的卡牌。' });
        dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
        depsRef.current.eventChoiceProcessingRef.current = false;
      } else {
        type PermGrantSourceType = NonNullable<import('@/game-core/types').GameState['permGrantModal']>['sourceType'];
        let sourceType: PermGrantSourceType;
        let meta: Record<string, number> | undefined;
        if (token.startsWith('grantFlankDraw:')) { sourceType = 'flank-grant'; }
        else if (token.startsWith('grantTransformGold:')) { sourceType = 'transform-gold-grant'; }
        else if (token.startsWith('grantFlankPersuadeCost:')) { sourceType = 'flank-persuade-grant'; meta = { amount: parseInt(token.split(':')[1], 10) || 1 }; }
        else if (token.startsWith('grantFlankStunCap:')) { sourceType = 'flank-stun-grant'; meta = { amount: parseInt(token.split(':')[1], 10) || 5 }; }
        else if (token.startsWith('grantFlankDamage:')) { sourceType = 'flank-damage-grant'; meta = { amount: parseInt(token.split(':')[1], 10) || 5 }; }
        else if (token.startsWith('grantTransformDraw:')) { sourceType = 'transform-draw-grant'; meta = { amount: parseInt(token.split(':')[1], 10) || 2 }; }
        else { sourceType = 'transform-heal-grant'; meta = { amount: parseInt(token.split(':')[1], 10) || 2 }; }
        dispatch({ type: 'SET_PERM_GRANT_MODAL', payload: { sourceCardId: 'event-grant', sourceType, ...(meta ? { meta } : {}) } });
      }

    // --- 翻转之契 option 5: grant 'on-hand: stunCap +3%' to a chosen hand card ---
    } else if (token === 'grantHandStunCapBonus') {
      const eligible = s.handCards.filter(c => !c.onEnterHandEffect);
      if (eligible.length === 0) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '手牌中没有可铭刻的卡牌（已带「上手」效果的卡不可选）。' });
        addGameLog('event', '铭刻技艺：没有可铭刻的手牌。');
        dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
        depsRef.current.eventChoiceProcessingRef.current = false;
      } else {
        dispatch({ type: 'SET_PERM_GRANT_MODAL', payload: { sourceCardId: 'event-grant', sourceType: 'on-hand-stun-cap-grant' } });
      }

    // --- 赋能神殿: grant 'on-hand: 恢复 1 HP' to a chosen hand card ---
    } else if (token === 'grantHandOnHandHeal:1' || token === 'grantHandOnHandHeal') {
      const eligible = s.handCards.filter(c => !c.onEnterHandEffect);
      if (eligible.length === 0) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '手牌中没有可铭刻的卡牌（已带「上手」效果的卡不可选）。' });
        addGameLog('event', '赋能神殿：没有可铭刻的手牌。');
        dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
        depsRef.current.eventChoiceProcessingRef.current = false;
      } else {
        dispatch({ type: 'SET_PERM_GRANT_MODAL', payload: { sourceCardId: 'event-grant', sourceType: 'on-hand-heal-grant' } });
      }

    // --- 翻转之契 option 6: grant '_flipRepairBuff' to a chosen equipment (incl. reserves) ---
    } else if (token === 'grantEquipFlipRepairBuff') {
      type EquipOption = { id: string; label: string; description: string; cardId: string };
      const options: EquipOption[] = [];
      const fmtItem = (eq: GameCardData, label: string) => {
        const typeLabel = eq.type === 'weapon' ? `${eq.value ?? 0}攻` : eq.type === 'shield' ? `${eq.value ?? 0}防` : `${eq.value ?? 0}`;
        const durLabel = typeof eq.durability === 'number' && typeof eq.maxDurability === 'number'
          ? `，耐久 ${eq.durability}/${eq.maxDurability}`
          : '';
        const buffLabel = eq._flipRepairBuff ? '（已铭刻）' : '';
        return { id: `equip:${eq.id}`, label: `${label} — ${eq.name}${buffLabel}`, description: `${typeLabel}${durLabel}`, cardId: eq.id };
      };
      if (s.equipmentSlot1) options.push(fmtItem(s.equipmentSlot1, '左装备栏'));
      if (s.equipmentSlot2) options.push(fmtItem(s.equipmentSlot2, '右装备栏'));
      (s.equipmentSlot1Reserve ?? []).forEach((eq, i) => options.push(fmtItem(eq, `左侧后备 ${i + 1}`)));
      (s.equipmentSlot2Reserve ?? []).forEach((eq, i) => options.push(fmtItem(eq, `右侧后备 ${i + 1}`)));
      // Filter out items already carrying the buff (idempotent — single per equipment)
      const unbuffed = options.filter(o => {
        const all: GameCardData[] = [
          s.equipmentSlot1, s.equipmentSlot2,
          ...(s.equipmentSlot1Reserve ?? []), ...(s.equipmentSlot2Reserve ?? []),
        ].filter(Boolean) as GameCardData[];
        const eq = all.find(e => e.id === o.cardId);
        return eq && !eq._flipRepairBuff;
      });
      if (unbuffed.length === 0) {
        const msg = options.length === 0 ? '没有可铭刻的装备。' : '所有装备都已铭刻熔铸耐久。';
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: msg });
        addGameLog('event', `熔铸耐久：${msg}`);
        dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
        depsRef.current.eventChoiceProcessingRef.current = false;
      } else {
        const applyChoice = (cardId: string) => {
          const all: GameCardData[] = [
            engine.getState().equipmentSlot1, engine.getState().equipmentSlot2,
            ...(engine.getState().equipmentSlot1Reserve ?? []),
            ...(engine.getState().equipmentSlot2Reserve ?? []),
          ].filter(Boolean) as GameCardData[];
          const eq = all.find(e => e.id === cardId);
          dispatch({ type: 'RESOLVE_EVENT_GRANT_EQUIP_FLIP_REPAIR', equipmentId: cardId });
          if (eq) {
            addGameLog('event', `熔铸耐久：「${eq.name}」获得「翻转 → 恢复 1 耐久」`);
            dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `「${eq.name}」铭刻熔铸耐久成功！` });
          }
          dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
          depsRef.current.eventChoiceProcessingRef.current = false;
        };
        if (unbuffed.length === 1) {
          applyChoice(unbuffed[0].cardId);
        } else {
          requestMagicChoice({
            title: '熔铸耐久',
            subtitle: '选择一件装备，永久赋予「每次翻转触发时该装备恢复 1 耐久」',
            options: unbuffed.map(o => ({ id: o.id, label: o.label, description: o.description })),
            flowContext: { flowId: 'flip-repair-grant' },
          }).then(choiceId => {
            const chosen = unbuffed.find(o => o.id === choiceId) ?? unbuffed[0];
            applyChoice(chosen.cardId);
          });
        }
      }

    // --- 附魔祭坛: grant '遗言：生命值上限 +4' to a chosen main-slot equipment (stacks) ---
    } else if (token === 'grantLastWordsMaxHp:4' || token === 'grantLastWordsMaxHp') {
      type SlotOption = { id: string; label: string; description: string; slotId: 'equipmentSlot1' | 'equipmentSlot2' };
      const options: SlotOption[] = [];
      const fmtSlot = (slotId: 'equipmentSlot1' | 'equipmentSlot2', label: string, eq: GameCardData) => {
        const typeLabel = eq.type === 'weapon' ? `${eq.value ?? 0}攻` : eq.type === 'shield' ? `${eq.value ?? 0}防` : `${eq.value ?? 0}`;
        const durLabel = typeof eq.durability === 'number' && typeof eq.maxDurability === 'number'
          ? `，耐久 ${eq.durability}/${eq.maxDurability}`
          : '';
        const stacks = eq.lastWordsMaxHpBoost ?? 0;
        const stackLabel = stacks > 0 ? `（已铭刻 ×${stacks}）` : '';
        return {
          id: `slot:${slotId}`,
          label: `${label} — ${eq.name}${stackLabel}`,
          description: `${typeLabel}${durLabel}`,
          slotId,
        };
      };
      if (s.equipmentSlot1) options.push(fmtSlot('equipmentSlot1', '左装备栏', s.equipmentSlot1));
      if (s.equipmentSlot2) options.push(fmtSlot('equipmentSlot2', '右装备栏', s.equipmentSlot2));
      if (options.length === 0) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '附魔祭坛：没有可铭刻的装备。' });
        addGameLog('event', '附魔祭坛：没有可铭刻的装备');
        dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
        depsRef.current.eventChoiceProcessingRef.current = false;
      } else {
        const applyChoice = (slotId: 'equipmentSlot1' | 'equipmentSlot2') => {
          dispatch({ type: 'RESOLVE_EVENT_GRANT_LASTWORDS_MAXHP', equipmentSlotId: slotId, amount: 4 });
          dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
          depsRef.current.eventChoiceProcessingRef.current = false;
        };
        if (options.length === 1) {
          applyChoice(options[0].slotId);
        } else {
          requestMagicChoice({
            title: '遗言铭刻',
            subtitle: '选择一件装备，永久赋予「遗言：生命值上限 +4」（可叠加）',
            options: options.map(o => ({ id: o.id, label: o.label, description: o.description })),
            flowContext: { flowId: 'lastwords-maxhp-grant' },
          }).then(choiceId => {
            const chosen = options.find(o => o.id === choiceId) ?? options[0];
            applyChoice(chosen.slotId);
          });
        }
      }

    // --- 翻转之契 mirror copy: replace the 翻转之契 slot with a deep clone of any other active-row card ---
    } else if (token === 'pactCopyActiveRow') {
      const eventCardSnapshot = eventCard;
      const resId = depsRef.current.eventResolutionRef.current?.cardId;
      const ac = engine.getState().activeCards;
      const cellIdx = resId
        ? ac.findIndex(c => c?.id === resId)
        : ac.findIndex(c => c?.id === eventCardSnapshot?.id);
      const selfId = eventCardSnapshot?.id ?? resId ?? null;

      type CopyOption = { id: string; label: string; description: string; cardId: string };
      const options: CopyOption[] = [];
      ac.forEach((c, i) => {
        if (!c) return;
        if (c.id === selfId) return;
        const typeLabel = c.type === 'monster' ? `怪物 ${c.attack ?? c.value ?? '?'}/${c.hp ?? '?'}`
          : c.type === 'weapon' ? `${c.value ?? 0}攻`
          : c.type === 'shield' ? `${c.value ?? 0}防`
          : c.type;
        options.push({
          id: `copy:${c.id}`,
          label: `第 ${i + 1} 格 — ${c.name}`,
          description: typeLabel,
          cardId: c.id,
        });
      });

      if (options.length === 0 || cellIdx === -1) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '镜面回响：active row 没有可复制的卡牌。' });
        addGameLog('event', '镜面回响：active row 没有可复制的卡牌');
        dispatch({ type: 'SET_CURRENT_EVENT', card: null });
        finalizeEventResolution({ removeFromDungeon: true });
        if (eventCardSnapshot) depsRef.current.addToGraveyard(eventCardSnapshot);
        depsRef.current.eventChoiceProcessingRef.current = false;
      } else {
        const applyChoice = (cardId: string) => {
          const acNow = engine.getState().activeCards;
          const target = acNow.find(c => c?.id === cardId) as GameCardData | undefined;
          if (!target) {
            dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '镜面回响：复制目标已不存在。' });
            dispatch({ type: 'SET_CURRENT_EVENT', card: null });
            finalizeEventResolution({ removeFromDungeon: true });
            if (eventCardSnapshot) depsRef.current.addToGraveyard(eventCardSnapshot);
            depsRef.current.eventChoiceProcessingRef.current = false;
            return;
          }
          let rng = engine.getState().rng;
          let copyId: string;
          [copyId, rng] = nextId(rng, `${target.id}-pact-copy`);
          dispatch({ type: 'SET_GAME_FLAGS', patch: { rng } });

          const { fromSlot: _drop, ...rest } = target as GameCardData & { fromSlot?: unknown };
          const copy: GameCardData = {
            ...(rest as GameCardData),
            id: copyId,
            _skipOnEnterHand: true,
          };

          dispatch({ type: 'SET_EVENT_MODAL_OPEN', open: false });
          dispatch({ type: 'SET_EVENT_MODAL_MINIMIZED', minimized: false });
          dispatch({ type: 'SET_CURRENT_EVENT', card: null });
          finalizeEventResolution({ removeFromDungeon: false });

          if (eventCardSnapshot) {
            void depsRef.current.triggerEventTransform(eventCardSnapshot, copy, `镜面回响：翻转为${target.name}的复制…`);
          }
          dispatch({ type: 'UPDATE_ACTIVE_CARDS', updater: (prev: (GameCardData | null)[]) => {
            const next = [...prev];
            next[cellIdx] = copy;
            return next;
          }});

          if (depsRef.current.amuletEffects.flipGoldCount > 0) {
            const goldGain = FLIP_GOLD_REWARD * depsRef.current.amuletEffects.flipGoldCount;
            dispatch({ type: 'MODIFY_GOLD', delta: goldGain, source: 'flip-gold-amulet' });
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${goldGain} 金币。`);
          }

          addGameLog('event', `翻转之契：复制了「${target.name}」`);
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `镜面回响：翻转为「${target.name}」的复制！` });
          depsRef.current.eventChoiceProcessingRef.current = false;
        };

        if (options.length === 1) {
          applyChoice(options[0].cardId);
        } else {
          requestMagicChoice({
            title: '镜面回响',
            subtitle: '选择 active row 中要复制的卡牌（翻转之契本身除外）',
            options: options.map(o => ({ id: o.id, label: o.label, description: o.description })),
            flowContext: { flowId: 'pact-copy-active-row' },
          }).then(choiceId => {
            const chosen = options.find(o => o.id === choiceId) ?? options[0];
            applyChoice(chosen.cardId);
          });
        }
      }

    // --- useKnightSkill ---
    } else if (token === 'useKnightSkill') {
      const skill = (payload.data as any)?.skill as GameCardData | undefined;
      if (skill) {
        dispatch({ type: 'RESOLVE_MAGIC', cardId: skill.id, card: skill } as any);
      }

    // --- Complex multi-step interactions ---
    } else if (token === 'crypt-all-effects') {
      depsRef.current.requestCardActionBatch('delete', 3, {
        title: '墓语密室：删除最多 3 张卡牌',
        description: '被删除的卡牌会被送入坟场，永久离开你的牌库。',
      }).then(deletedCount => {
        if (deletedCount > 0) addGameLog('event', `墓语密室（全效）：删除了 ${deletedCount} 张卡牌`);
        else addGameLog('event', '墓语密室（全效）：未删除卡牌');
        depsRef.current.requestGraveyardSelection(3).then(selected1 => {
          if (selected1) addGameLog('event', `墓语密室（全效）：从坟场召回 ${selected1.name}`);
          depsRef.current.requestGraveyardSelection(3).then(selected2 => {
            if (selected2) addGameLog('event', `墓语密室（全效）：从坟场召回 ${selected2.name}`);
            const recycled = engine.getState().permanentMagicRecycleBag;
            if (recycled.length > 0) {
              let rng = engine.getState().rng;
              let picked: GameCardData;
              [picked, rng] = pickRandom(recycled, rng);
              dispatch({ type: 'SET_GAME_FLAGS', patch: { rng } });
              dispatch({ type: 'UPDATE_RECYCLE_BAG', updater: prev => prev.filter(c => c.id !== picked.id) });
              depsRef.current.addCardToBackpack(picked);
              addGameLog('event', `墓语密室（全效）：从回收袋获得 ${picked.name}`);
            }
            dispatch({ type: 'MODIFY_PERMANENT_STAT', stat: 'backpackCapacityModifier', delta: 5 });
            addGameLog('event', '墓语密室（全效）：背包上限 +5');
            dispatch({ type: 'MODIFY_STUN_CAP', delta: 10 });
            addGameLog('event', '墓语密室（全效）：击晕上限 +10%');
            dispatch({ type: 'MODIFY_PERMANENT_STAT', stat: 'persuadeLevel', delta: 1 });
            dispatch({ type: 'MODIFY_PERMANENT_STAT', stat: 'persuadeCostModifier', delta: -2 });
            addGameLog('event', '墓语密室（全效）：劝降等级+1，劝降费用 -2');
            const discoverStarted = depsRef.current.beginDiscoverFlow('crypt-all-discover-weapon', {
              filter: (card: GameCardData) => card.type === 'weapon',
              sourceLabel: eventCard?.name ?? '墓语密室',
            });
            if (!discoverStarted) depsRef.current.handleDiscoverFallback();
          });
        });
      });
      addGameLog('shop', '墓语密室（全效）：开启商店');
      depsRef.current.startShopFlow(eventCard);
    // --- crossroads-destroy-below: destroy what's "below" + apply all other choice effects ---
    } else if (token === 'crossroads-destroy-below') {
      const resId = engine.getState().resolvingDungeonCardId;
      const ac = engine.getState().activeCards;
      if (eventCard && resId) {
        const cardIdx = ac.findIndex(c => c?.id === resId);
        const belowMap: Record<number, { type: 'equipment'; slotId: EquipmentSlotId } | { type: 'amulet' } | null> = {
          0: { type: 'amulet' },
          1: { type: 'equipment', slotId: 'equipmentSlot1' },
          2: null,
          3: { type: 'equipment', slotId: 'equipmentSlot2' },
          4: null,
        };
        const below = cardIdx >= 0 ? belowMap[cardIdx] ?? null : null;
        if (below?.type === 'equipment') {
          const slotItem = below.slotId === 'equipmentSlot1' ? engine.getState().equipmentSlot1 : engine.getState().equipmentSlot2;
          if (slotItem) {
            addGameLog('event', `命运十字路口：破坏了下方装备「${slotItem.name}」`);
            depsRef.current.sacrificeEquipment(below.slotId);
            dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `破坏了「${slotItem.name}」！获得全部显示选项的效果！` });
          }
        } else if (below?.type === 'amulet') {
          const amulets = engine.getState().amuletSlots;
          if (amulets.length > 0) {
            const topAmulet = amulets[amulets.length - 1];
            addGameLog('event', `命运十字路口：破坏了下方护符「${topAmulet.name}」`);
            depsRef.current.addToGraveyard(topAmulet);
            dispatch({ type: 'UPDATE_AMULET_SLOTS', updater: prev => prev.slice(0, -1) });
            dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `破坏了「${topAmulet.name}」！获得全部显示选项的效果！` });
          }
        }
        const displayedChoices = eventCard.eventChoices?.filter(
          c => !depsRef.current.normalizeEventEffect(c.effect).includes('crossroads-destroy-below')
        ) ?? [];
        let subDeferred = false;
        for (const otherChoice of displayedChoices) {
          const choiceEffects = depsRef.current.normalizeEventEffect(otherChoice.effect);
          for (const eff of choiceEffects) {
            if (eff === 'openShop') {
              addGameLog('shop', '命运十字路口：开启商店');
              depsRef.current.startShopFlow(eventCard);
              subDeferred = true;
            } else if (eff === 'upgradeCard') {
              addGameLog('event', '命运十字路口：选择一张牌升级');
              dispatch({ type: 'SET_UPGRADE_MODAL_OPEN', open: true, maxCount: undefined });
            } else if (eff === 'drawClass2') {
              depsRef.current.drawClassCardsToBackpack(2, 'crossroads-destroy');
            } else {
              dispatch({ type: 'APPLY_EVENT_EFFECT', token: eff });
            }
          }
        }
        if (!subDeferred) {
          dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
          depsRef.current.eventChoiceProcessingRef.current = false;
        }
      } else {
        dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
        depsRef.current.eventChoiceProcessingRef.current = false;
      }

    // --- vault-flipback: close event, deal damage, flip card back ---
    } else if (token === 'vault-flipback') {
      const eventCardSnapshot = eventCard;
      const ac = engine.getState().activeCards;
      const cellIdx = ac.findIndex(c => c?.id === eventCardSnapshot?.id);

      dispatch({ type: 'SET_EVENT_MODAL_OPEN', open: false });
      dispatch({ type: 'SET_EVENT_MODAL_MINIMIZED', minimized: false });
      dispatch({ type: 'SET_CURRENT_EVENT', card: null });
      finalizeEventResolution({ removeFromDungeon: false });

      const damage = 4;
      dispatch({ type: 'APPLY_DAMAGE', amount: damage, source: 'event-vault-explore' });
      addGameLog('event', `秘藏宝库深入探索：受到 ${damage} 点伤害`);

      const flipBack = eventCardSnapshot?._flipBackCard;
      if (cellIdx !== -1 && flipBack) {
        dispatch({ type: 'UPDATE_ACTIVE_CARDS', updater: (prev: (GameCardData | null)[]) => {
          const next = [...prev];
          next[cellIdx] = { ...flipBack };
          return next;
        }});
        addGameLog('event', '秘藏宝库翻转回未开启状态');
      } else if (cellIdx === -1 && flipBack && flipBack.type === 'event') {
        depsRef.current.queueCardIntoHand({ ...flipBack });
        addGameLog('event', '秘藏宝库翻转回未开启状态，加入手牌');
      }
      dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `深入探索！受到 ${damage} 点伤害！` });

    // --- fate-dice-strike: close event, attack/destroy right card ---
    } else if (token === 'fate-dice-strike') {
      const eventCardSnapshot = eventCard;
      const resId = depsRef.current.eventResolutionRef.current?.cardId;
      const ac = engine.getState().activeCards;
      const cellIdx = resId
        ? ac.findIndex(c => c?.id === resId)
        : ac.findIndex(c => c?.id === eventCardSnapshot?.id);
      const rightIdx = cellIdx >= 0 ? cellIdx + 1 : -1;
      const rightCard = rightIdx >= 0 && rightIdx < DUNGEON_COLUMN_COUNT ? ac[rightIdx] : null;
      const isPerm = eventCardSnapshot?.type === 'building' || eventCardSnapshot?.isPermanentEvent;

      dispatch({ type: 'SET_EVENT_MODAL_OPEN', open: false });
      dispatch({ type: 'SET_EVENT_MODAL_MINIMIZED', minimized: false });
      dispatch({ type: 'SET_CURRENT_EVENT', card: null });
      finalizeEventResolution({ removeFromDungeon: false });

      if (
        rightCard &&
        (rightCard.type === 'potion' || rightCard.type === 'weapon' ||
         rightCard.type === 'shield' || rightCard.type === 'event' ||
         rightCard.type === 'building')
      ) {
        addGameLog('event', `命运之刃破坏了 ${rightCard.name}`);
        depsRef.current.removeCard(rightCard.id, true);
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `命运之刃破坏了 ${rightCard.name}！` });
        if (!isPerm) {
          const flipBack = eventCardSnapshot?._flipBackCard;
          if (cellIdx !== -1 && flipBack) {
            dispatch({ type: 'UPDATE_ACTIVE_CARDS', updater: (prev: (GameCardData | null)[]) => {
              const next = [...prev];
              next[cellIdx] = { ...flipBack };
              return next;
            }});
            addGameLog('event', '命运之刃翻转回命运骰盅');
          } else if (cellIdx !== -1) {
            depsRef.current.removeCard(eventCardSnapshot!.id, true);
          }
        }
      } else if (rightCard && rightCard.type === 'monster') {
        if (!depsRef.current.isMonsterEngaged(rightCard.id)) {
          depsRef.current.beginCombat(rightCard, 'hero');
        }
        const layersBefore = rightCard.currentLayer ?? rightCard.fury ?? 1;
        // 命运之刃语义是"直接打掉 2 层血"，必须无视 maxDamagePerHit
        // （否则像 Golem 单层 HP 7 / cap 5 的精英只会被削 1 层）。
        let updatedMonster = depsRef.current.damageMonsterWithLayerOverflow(
          rightCard,
          rightCard.hp ?? 0,
          undefined,
          { bypassMaxPerHit: true },
        );
        depsRef.current.recordClassDamageDiscoverHit();
        if ((updatedMonster.currentLayer ?? 0) > 0) {
          updatedMonster = depsRef.current.damageMonsterWithLayerOverflow(
            updatedMonster,
            updatedMonster.hp ?? 0,
            undefined,
            { bypassMaxPerHit: true },
          );
          depsRef.current.recordClassDamageDiscoverHit();
        }
        const defeatedByBlade = (updatedMonster.currentLayer ?? 0) <= 0 || (updatedMonster.hp ?? 0) <= 0;
        const layersAfter = updatedMonster.currentLayer ?? 0;
        const layersStripped = Math.max(0, layersBefore - layersAfter);

        if (rightCard.bossRetaliationDamage && rightCard.bossRetaliationDamage > 0 && !rightCard.isStunned) {
          const retDmg = rightCard.bossRetaliationDamage;
          dispatch({ type: 'APPLY_DAMAGE', amount: retDmg, source: 'boss-retaliation' });
          addGameLog('combat', `${rightCard.name} 反噬：造成 ${retDmg} 点直接伤害！`);
        }

        const pulseCount = Math.max(1, Math.min(4, layersStripped || 1));
        for (let i = 0; i < pulseCount; i += 1) {
          depsRef.current.triggerMonsterBleedAnimation(rightCard.id, i * Math.floor(COMBAT_ANIMATION_STAGGER / 2));
        }

        if (defeatedByBlade) {
          depsRef.current.updateMonsterCard(rightCard.id, () => updatedMonster);
          depsRef.current.handleMonsterDefeated(rightCard);
          addGameLog('event', `命运之刃击杀了 ${rightCard.name}！`);
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `命运之刃击杀了 ${rightCard.name}！` });
        } else {
          depsRef.current.updateMonsterCard(rightCard.id, () => updatedMonster);
          if (layersAfter < layersBefore) {
            depsRef.current.heroTurnLayerLossIdsRef.current.add(rightCard.id);
          }
          if (rightCard.bleedEffect && layersAfter < layersBefore && !rightCard.isStunned) {
            const newAttack = updatedMonster.attack ?? updatedMonster.value;
            const perLayer = parseInt((rightCard.bleedEffect ?? '').replace('attack+', ''), 10) || 0;
            addGameLog('combat', `${rightCard.name} 触发流血：攻击力+${perLayer * (layersBefore - layersAfter)}，当前 ${newAttack}！`);
            dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `${rightCard.name} 流血！攻击力升至 ${newAttack}！` });
          }
          if (rightCard.dragonBleedDestroy && layersAfter < layersBefore && layersAfter > 0 && !rightCard.isStunned) {
            depsRef.current.dragonBleedDestroyEquipment(rightCard.name, layersAfter);
          }
          if (rightCard.monsterSpecial === 'bone-regen' && !rightCard.isStunned) {
            const willRoll = layersAfter > 0 && layersAfter < layersBefore;
            let predeterminedRoll: number | undefined;
            if (willRoll) {
              dispatch({ type: 'ROLL_DICE_FOR_FLOW' });
              predeterminedRoll = engine.getState().lastFlowDiceRoll ?? undefined;
            }
            engine.emit('combat:boneRegenCheck', {
              monsterId: rightCard.id, monsterName: rightCard.name,
              layersBefore, layersAfter, forced: false,
              predeterminedRoll: predeterminedRoll ?? 0,
            });
          }
          if (rightCard.monsterSpecial === 'wraith-rebirth' && !rightCard.isStunned) {
            const willRoll = layersAfter === 1 && layersBefore > 1;
            let predeterminedRoll: number | undefined;
            if (willRoll) {
              dispatch({ type: 'ROLL_DICE_FOR_FLOW' });
              predeterminedRoll = engine.getState().lastFlowDiceRoll ?? undefined;
            }
            engine.emit('combat:wraithRebirthCheck', {
              monsterId: rightCard.id, monsterName: rightCard.name,
              maxLayers: rightCard.fury ?? rightCard.hpLayers ?? 1,
              layersBefore, layersAfter,
              predeterminedRoll: predeterminedRoll ?? 0,
            });
          }
          addGameLog('event', `命运之刃对 ${rightCard.name} 打掉 ${layersStripped} 层血（共 2 层穿透结算，可一次击杀）！`);
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `命运之刃对 ${rightCard.name} 打掉 ${layersStripped} 层血！` });
        }
        if (!isPerm && cellIdx !== -1) {
          depsRef.current.removeCard(eventCardSnapshot!.id, true);
        }
      } else {
        for (let i = 0; i < 2; i++) {
          depsRef.current.drawFromBackpackToHand();
        }
        if (!isPerm && cellIdx !== -1) {
          depsRef.current.removeCard(eventCardSnapshot!.id, true);
        }
      }

      if (isPerm && cellIdx !== -1) {
        dispatch({ type: 'UPDATE_ACTIVE_CARDS', updater: (prev: (GameCardData | null)[]) => {
          const next = [...prev] as typeof prev;
          const card = next[cellIdx];
          if (card?.name === '命运之刃' && (card.type === 'building' || card.isPermanentEvent)) {
            next[cellIdx] = { ...card, hasReleaseCharge: false };
          }
          return next;
        }});
      }

    // --- amplify-altar-from-equip: select equipment -> transform event to altar building ---
    } else if (token === 'amplify-altar-from-equip') {
      const eventCardSnapshot = eventCard;
      const resId = depsRef.current.eventResolutionRef.current?.cardId;
      const ac = engine.getState().activeCards;
      const cellIdx = resId
        ? ac.findIndex(c => c?.id === resId)
        : ac.findIndex(c => c?.id === eventCardSnapshot?.id);

      const slots = depsRef.current.getEquipmentSlots();
      const weaponSlots = slots.filter(s => s.item && (s.item.type === 'weapon' || s.item.type === 'shield' || s.item.type === 'monster'));
      if (weaponSlots.length === 0) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '没有已装备的装备。' });
        dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
        depsRef.current.eventChoiceProcessingRef.current = false;
        return;
      }

      const applyAmplifyTarget = (tCardId: string, tName: string) => {
        if (cellIdx === -1) return;
        let rng = engine.getState().rng;
        let _altarId: string;
        [_altarId, rng] = nextId(rng, 'amplify-altar');
        dispatch({ type: 'SET_GAME_FLAGS', patch: { rng } });
        dispatch({ type: 'SET_EVENT_MODAL_OPEN', open: false });
        dispatch({ type: 'SET_EVENT_MODAL_MINIMIZED', minimized: false });
        dispatch({ type: 'SET_CURRENT_EVENT', card: null });
        finalizeEventResolution({ removeFromDungeon: false });

        const altarBuilding: GameCardData = {
          id: _altarId, type: 'building', name: '增幅祭坛', value: 0,
          image: eventCardSnapshot?.image ?? skillScrollImage,
          isGhost: true, fury: 1, hpLayers: 1, currentLayer: 1, hp: 2, maxHp: 2,
          hasReleaseCharge: true, _fateBladeLastSlot: cellIdx,
          _amplifyTargetCardId: tCardId, _amplifyTargetName: tName,
          description: `幽灵建筑（HP 2）：入场/移位获得释放次数。拖到英雄行发动：移除一张手牌，对「${tName}」施加两次增幅。`,
          eventChoices: [{ text: `发动增幅祭坛（目标：${tName}）`, hint: '移除一张手牌，对增幅目标施加两次增幅', effect: 'amplify-altar-activate' }],
        };
        void depsRef.current.triggerEventTransform(eventCardSnapshot!, altarBuilding, '增幅仪式凝聚为增幅祭坛…');
        dispatch({ type: 'UPDATE_ACTIVE_CARDS', updater: (prev: (GameCardData | null)[]) => {
          const next = [...prev]; next[cellIdx] = altarBuilding; return next;
        }});
        if (depsRef.current.amuletEffects.flipGoldCount > 0) {
          const goldGain = FLIP_GOLD_REWARD * depsRef.current.amuletEffects.flipGoldCount;
          dispatch({ type: 'MODIFY_GOLD', delta: goldGain, source: 'flip-gold-amulet' });
          addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${goldGain} 金币。`);
        }
        addGameLog('event', `增幅仪式翻转为增幅祭坛，目标：${tName}`);
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `增幅仪式翻转为增幅祭坛！目标：${tName}` });
      };

      if (weaponSlots.length === 1) {
        applyAmplifyTarget(weaponSlots[0].item!.id, weaponSlots[0].item!.name);
      } else {
        requestEquipmentSelection({
          prompt: '选择一件装备作为增幅目标',
          subtext: '该装备将成为增幅祭坛的增幅目标。',
          flowContext: { flowId: 'amplify-altar-target' },
        }).then(selectedSlotId => {
          if (selectedSlotId) {
            const slotItem = selectedSlotId === 'equipmentSlot1' ? engine.getState().equipmentSlot1 : engine.getState().equipmentSlot2;
            if (slotItem) applyAmplifyTarget(slotItem.id, slotItem.name);
          }
        });
      }

    // --- amplify-altar-from-hand: pick from hand -> transform event to altar building ---
    } else if (token === 'amplify-altar-from-hand') {
      const eventCardSnapshot = eventCard;
      const resId = depsRef.current.eventResolutionRef.current?.cardId;
      const ac = engine.getState().activeCards;
      const cellIdx = resId
        ? ac.findIndex(c => c?.id === resId)
        : ac.findIndex(c => c?.id === eventCardSnapshot?.id);

      const eligibleFilter = (c: GameCardData) =>
        c.type === 'weapon' || c.type === 'shield' || isDamageMagic(c);
      const eligible = engine.getState().handCards.filter(eligibleFilter);

      const applyAmplifyHandTarget = (targetCard: GameCardData) => {
        if (cellIdx === -1) return;
        let rng = engine.getState().rng;
        let _altarId: string;
        [_altarId, rng] = nextId(rng, 'amplify-altar');
        dispatch({ type: 'SET_GAME_FLAGS', patch: { rng } });
        dispatch({ type: 'SET_EVENT_MODAL_OPEN', open: false });
        dispatch({ type: 'SET_EVENT_MODAL_MINIMIZED', minimized: false });
        dispatch({ type: 'SET_CURRENT_EVENT', card: null });
        finalizeEventResolution({ removeFromDungeon: false });

        const altarBuilding: GameCardData = {
          id: _altarId, type: 'building', name: '增幅祭坛', value: 0,
          image: eventCardSnapshot?.image ?? skillScrollImage,
          isGhost: true, fury: 1, hpLayers: 1, currentLayer: 1, hp: 2, maxHp: 2,
          hasReleaseCharge: true, _fateBladeLastSlot: cellIdx,
          _amplifyTargetCardId: targetCard.id, _amplifyTargetName: targetCard.name,
          description: `幽灵建筑（HP 2）：入场/移位获得释放次数。拖到英雄行发动：移除一张手牌，对「${targetCard.name}」施加两次增幅。`,
          eventChoices: [{ text: `发动增幅祭坛（目标：${targetCard.name}）`, hint: '移除一张手牌，对增幅目标施加两次增幅', effect: 'amplify-altar-activate' }],
        };
        void depsRef.current.triggerEventTransform(eventCardSnapshot!, altarBuilding, '增幅仪式凝聚为增幅祭坛…');
        dispatch({ type: 'UPDATE_ACTIVE_CARDS', updater: (prev: (GameCardData | null)[]) => {
          const next = [...prev]; next[cellIdx] = altarBuilding; return next;
        }});
        if (depsRef.current.amuletEffects.flipGoldCount > 0) {
          const goldGain = FLIP_GOLD_REWARD * depsRef.current.amuletEffects.flipGoldCount;
          dispatch({ type: 'MODIFY_GOLD', delta: goldGain, source: 'flip-gold-amulet' });
          addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${goldGain} 金币。`);
        }
        addGameLog('event', `增幅仪式翻转为增幅祭坛，目标：${targetCard.name}`);
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `增幅仪式翻转为增幅祭坛！目标：${targetCard.name}` });
      };

      if (eligible.length === 0) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '手牌中没有符合条件的装备或伤害魔法。' });
        dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
        depsRef.current.eventChoiceProcessingRef.current = false;
      } else if (cellIdx === -1) {
        // event card no longer on board — skip silently
      } else if (eligible.length === 1) {
        applyAmplifyHandTarget(eligible[0]);
      } else {
        requestEventAmplifyHandSelection({
          eventCardId: eventCardSnapshot?.id ?? '',
          cellIdx,
        }).then(selectedCardId => {
          if (!selectedCardId) {
            // 取消选择：解锁事件处理状态，等玩家在事件菜单重新选项
            depsRef.current.eventChoiceProcessingRef.current = false;
            return;
          }
          const targetCard = engine.getState().handCards.find(c => c.id === selectedCardId);
          if (!targetCard) {
            dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '所选手牌已不在手牌中。' });
            dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
            depsRef.current.eventChoiceProcessingRef.current = false;
            return;
          }
          applyAmplifyHandTarget(targetCard);
        });
      }

    // --- amplify-altar-from-random-class-equip-with-warp:
    //     Pick a random weapon/shield from the class deck → backpack;
    //     transform event into amplify altar building targeting it;
    //     additionally grant 维度扭曲 starter perm magic to the backpack.
    } else if (token === 'amplify-altar-from-random-class-equip-with-warp') {
      const eventCardSnapshot = eventCard;
      const resId = depsRef.current.eventResolutionRef.current?.cardId;
      const ac = engine.getState().activeCards;
      const cellIdx = resId
        ? ac.findIndex(c => c?.id === resId)
        : ac.findIndex(c => c?.id === eventCardSnapshot?.id);

      const stateNow = engine.getState();
      const equipPool = stateNow.classDeck.filter(c => c.type === 'weapon' || c.type === 'shield');

      if (equipPool.length === 0 || cellIdx === -1) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '专属牌堆中没有可用的装备。' });
        addGameLog('event', '增幅仪式：专属牌堆中没有可用的装备');
        dispatch({ type: 'SET_CURRENT_EVENT', card: null });
        finalizeEventResolution({ removeFromDungeon: true });
        if (eventCardSnapshot) depsRef.current.addToGraveyard(eventCardSnapshot);
        depsRef.current.eventChoiceProcessingRef.current = false;
      } else {
        let rng = stateNow.rng;
        let originalEquip: GameCardData;
        [originalEquip, rng] = pickRandom(equipPool, rng);
        let cloned: GameCardData;
        [cloned, rng] = cloneClassCardWithFreshId(originalEquip, rng);
        dispatch({ type: 'SET_GAME_FLAGS', patch: { rng } });

        depsRef.current.addCardToBackpack(cloned);

        let altarRng = engine.getState().rng;
        let _altarId: string;
        [_altarId, altarRng] = nextId(altarRng, 'amplify-altar');
        dispatch({ type: 'SET_GAME_FLAGS', patch: { rng: altarRng } });

        dispatch({ type: 'SET_EVENT_MODAL_OPEN', open: false });
        dispatch({ type: 'SET_EVENT_MODAL_MINIMIZED', minimized: false });
        dispatch({ type: 'SET_CURRENT_EVENT', card: null });
        finalizeEventResolution({ removeFromDungeon: false });

        const altarBuilding: GameCardData = {
          id: _altarId, type: 'building', name: '增幅祭坛', value: 0,
          image: eventCardSnapshot?.image ?? skillScrollImage,
          isGhost: true, fury: 1, hpLayers: 1, currentLayer: 1, hp: 2, maxHp: 2,
          hasReleaseCharge: true, _fateBladeLastSlot: cellIdx,
          _amplifyTargetCardId: cloned.id, _amplifyTargetName: cloned.name,
          description: `幽灵建筑（HP 2）：入场/移位获得释放次数。拖到英雄行发动：移除一张手牌，对「${cloned.name}」施加两次增幅。`,
          eventChoices: [{ text: `发动增幅祭坛（目标：${cloned.name}）`, hint: '移除一张手牌，对增幅目标施加两次增幅', effect: 'amplify-altar-activate' }],
        };
        if (eventCardSnapshot) {
          void depsRef.current.triggerEventTransform(eventCardSnapshot, altarBuilding, '增幅仪式凝聚为增幅祭坛…');
        }
        dispatch({ type: 'UPDATE_ACTIVE_CARDS', updater: (prev: (GameCardData | null)[]) => {
          const next = [...prev]; next[cellIdx] = altarBuilding; return next;
        }});

        if (depsRef.current.amuletEffects.flipGoldCount > 0) {
          const goldGain = FLIP_GOLD_REWARD * depsRef.current.amuletEffects.flipGoldCount;
          dispatch({ type: 'MODIFY_GOLD', delta: goldGain, source: 'flip-gold-amulet' });
          addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${goldGain} 金币。`);
        }

        // Grant 维度扭曲 starter perm magic via the existing reducer token (also
        // routes to recycleBag if backpack is full — handled by APPLY_EVENT_EFFECT).
        dispatch({ type: 'APPLY_EVENT_EFFECT', effectToken: 'grantStarterDimensionWarp' });

        addGameLog('event', `增幅仪式翻转为增幅祭坛（目标：${cloned.name}），获得专属装备「${cloned.name}」与「维度扭曲」`);
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `增幅仪式翻转为增幅祭坛！目标：${cloned.name}（并获得「维度扭曲」）` });
        depsRef.current.eventChoiceProcessingRef.current = false;
      }

    // --- amplify-altar-discover-class: discover flow -> transform event to altar building ---
    } else if (token === 'amplify-altar-discover-class') {
      const eventCardSnapshot = eventCard;
      const resId = depsRef.current.eventResolutionRef.current?.cardId;
      const ac = engine.getState().activeCards;
      const cellIdx = resId
        ? ac.findIndex(c => c?.id === resId)
        : ac.findIndex(c => c?.id === eventCardSnapshot?.id);

      const eligibleFilter = (c: GameCardData) =>
        c.type === 'weapon' || c.type === 'shield' || isDamageMagic(c);

      const backpackIdsBefore = new Set(engine.getState().backpackItems.map(c => c.id));
      const graveyardIdsBefore = new Set(engine.getState().discardedCards.map(c => c.id));

      dispatch({ type: 'SET_EVENT_MODAL_OPEN', open: false });
      dispatch({ type: 'SET_EVENT_MODAL_MINIMIZED', minimized: false });

      depsRef.current.discoverPotionCompletionRef.current = () => {
        depsRef.current.discoverPotionCompletionRef.current = null;
        const stAfter = engine.getState();
        const newInBackpack = stAfter.backpackItems.find(c => !backpackIdsBefore.has(c.id));
        const newInGraveyard = newInBackpack ? null : stAfter.discardedCards.find(c => !graveyardIdsBefore.has(c.id));
        const targetCard = newInBackpack ?? newInGraveyard;

        if (targetCard && cellIdx !== -1) {
          let rng = engine.getState().rng;
          let _altarId: string;
          [_altarId, rng] = nextId(rng, 'amplify-altar');
          dispatch({ type: 'SET_GAME_FLAGS', patch: { rng } });
          dispatch({ type: 'SET_CURRENT_EVENT', card: null });
          finalizeEventResolution({ removeFromDungeon: false });
          if (newInBackpack) {
            dispatch({ type: 'UPDATE_BACKPACK_ITEMS', updater: prev => prev.filter(c => c.id !== targetCard.id) });
          } else if (newInGraveyard) {
            dispatch({ type: 'UPDATE_DISCARDED_CARDS', updater: prev => prev.filter(c => c.id !== targetCard.id) });
          }
          depsRef.current.queueCardIntoHand(targetCard);
          const altarBuilding: GameCardData = {
            id: _altarId, type: 'building', name: '增幅祭坛', value: 0,
            image: eventCardSnapshot?.image ?? skillScrollImage,
            isGhost: true, fury: 1, hpLayers: 1, currentLayer: 1, hp: 2, maxHp: 2,
            hasReleaseCharge: true, _fateBladeLastSlot: cellIdx,
            _amplifyTargetCardId: targetCard.id, _amplifyTargetName: targetCard.name,
            description: `幽灵建筑（HP 2）：入场/移位获得释放次数。拖到英雄行发动：移除一张手牌，对「${targetCard.name}」施加两次增幅。`,
            eventChoices: [{ text: `发动增幅祭坛（目标：${targetCard.name}）`, hint: '移除一张手牌，对增幅目标施加两次增幅', effect: 'amplify-altar-activate' }],
          };
          void depsRef.current.triggerEventTransform(eventCardSnapshot!, altarBuilding, '增幅仪式凝聚为增幅祭坛…');
          dispatch({ type: 'UPDATE_ACTIVE_CARDS', updater: (prev: (GameCardData | null)[]) => {
            const next = [...prev]; next[cellIdx] = altarBuilding; return next;
          }});
          if (depsRef.current.amuletEffects.flipGoldCount > 0) {
            const goldGain = FLIP_GOLD_REWARD * depsRef.current.amuletEffects.flipGoldCount;
            dispatch({ type: 'MODIFY_GOLD', delta: goldGain, source: 'flip-gold-amulet' });
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${goldGain} 金币。`);
          }
          addGameLog('event', `增幅仪式翻转为增幅祭坛，目标：${targetCard.name}`);
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `增幅仪式翻转为增幅祭坛！目标：${targetCard.name}` });
        } else {
          dispatch({ type: 'SET_CURRENT_EVENT', card: null });
          finalizeEventResolution({ removeFromDungeon: true });
          depsRef.current.addToGraveyard(eventCardSnapshot!);
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '没有可发现的装备或伤害魔法。' });
        }
      };
      const discoverStarted = depsRef.current.beginDiscoverFlow('amplify-altar-discover-class', {
        filter: eligibleFilter,
        sourceLabel: eventCardSnapshot?.name ?? '增幅祭坛',
      });
      if (!discoverStarted) {
        depsRef.current.discoverPotionCompletionRef.current = null;
        dispatch({ type: 'SET_CURRENT_EVENT', card: null });
        finalizeEventResolution({ removeFromDungeon: true });
        depsRef.current.addToGraveyard(eventCardSnapshot!);
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '没有可发现的装备或伤害魔法。' });
      }

    // --- amplify-altar-discover-graveyard: graveyard selection -> transform event to altar building ---
    } else if (token === 'amplify-altar-discover-graveyard') {
      const eventCardSnapshot = eventCard;
      const resId = depsRef.current.eventResolutionRef.current?.cardId;
      const ac = engine.getState().activeCards;
      const cellIdx = resId
        ? ac.findIndex(c => c?.id === resId)
        : ac.findIndex(c => c?.id === eventCardSnapshot?.id);

      const eligibleFilter = (c: GameCardData) =>
        c.type === 'weapon' || c.type === 'shield' || isDamageMagic(c);

      depsRef.current.requestGraveyardSelection(3, {
        delivery: 'hand-first',
        filter: eligibleFilter,
      }).then(selected => {
        if (selected && cellIdx !== -1) {
          let rng = engine.getState().rng;
          let _altarId: string;
          [_altarId, rng] = nextId(rng, 'amplify-altar');
          dispatch({ type: 'SET_GAME_FLAGS', patch: { rng } });
          dispatch({ type: 'SET_EVENT_MODAL_OPEN', open: false });
          dispatch({ type: 'SET_EVENT_MODAL_MINIMIZED', minimized: false });
          dispatch({ type: 'SET_CURRENT_EVENT', card: null });
          finalizeEventResolution({ removeFromDungeon: false });

          const altarBuilding: GameCardData = {
            id: _altarId, type: 'building', name: '增幅祭坛', value: 0,
            image: eventCardSnapshot?.image ?? skillScrollImage,
            isGhost: true, fury: 1, hpLayers: 1, currentLayer: 1, hp: 2, maxHp: 2,
            hasReleaseCharge: true, _fateBladeLastSlot: cellIdx,
            _amplifyTargetCardId: selected.id, _amplifyTargetName: selected.name,
            description: `幽灵建筑（HP 2）：入场/移位获得释放次数。拖到英雄行发动：移除一张手牌，对「${selected.name}」施加两次增幅。`,
            eventChoices: [{ text: `发动增幅祭坛（目标：${selected.name}）`, hint: '移除一张手牌，对增幅目标施加两次增幅', effect: 'amplify-altar-activate' }],
          };
          void depsRef.current.triggerEventTransform(eventCardSnapshot!, altarBuilding, '增幅仪式凝聚为增幅祭坛…');
          dispatch({ type: 'UPDATE_ACTIVE_CARDS', updater: (prev: (GameCardData | null)[]) => {
            const next = [...prev]; next[cellIdx] = altarBuilding; return next;
          }});
          if (depsRef.current.amuletEffects.flipGoldCount > 0) {
            const goldGain = FLIP_GOLD_REWARD * depsRef.current.amuletEffects.flipGoldCount;
            dispatch({ type: 'MODIFY_GOLD', delta: goldGain, source: 'flip-gold-amulet' });
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${goldGain} 金币。`);
          }
          addGameLog('event', `增幅仪式翻转为增幅祭坛，目标：${selected.name}（坟场召回至手牌）`);
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `增幅仪式翻转为增幅祭坛！目标：${selected.name}` });
        } else {
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '坟场中没有符合条件的装备或伤害魔法。' });
          dispatch({ type: 'CONTINUE_EVENT_EFFECTS' });
          depsRef.current.eventChoiceProcessingRef.current = false;
        }
      });

    // --- amplify-altar-activate: sacrifice a hand card to amplify target ---
    } else if (token === 'amplify-altar-activate') {
      const eventCardSnapshot = eventCard;
      const resId = depsRef.current.eventResolutionRef.current?.cardId;
      const ac = engine.getState().activeCards;
      const cellIdx = resId
        ? ac.findIndex(c => c?.id === resId)
        : ac.findIndex(c => c?.id === eventCardSnapshot?.id);
      const isPerm = eventCardSnapshot?.type === 'building' || eventCardSnapshot?.isPermanentEvent;

      const targetCardId = eventCardSnapshot?._amplifyTargetCardId;
      if (!targetCardId) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '增幅祭坛：没有增幅目标。' });
        dispatch({ type: 'SET_EVENT_MODAL_OPEN', open: false });
        dispatch({ type: 'SET_EVENT_MODAL_MINIMIZED', minimized: false });
        dispatch({ type: 'SET_CURRENT_EVENT', card: null });
        finalizeEventResolution({ removeFromDungeon: false });
        return;
      }

      const allCards = [
        ...engine.getState().handCards,
        ...(engine.getState().equipmentSlot1 ? [engine.getState().equipmentSlot1!] : []),
        ...(engine.getState().equipmentSlot2 ? [engine.getState().equipmentSlot2!] : []),
        ...engine.getState().backpackItems,
      ];
      const targetCard = allCards.find(c => c.id === targetCardId);
      if (!targetCard) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '增幅祭坛：目标卡牌已不存在。' });
        dispatch({ type: 'SET_EVENT_MODAL_OPEN', open: false });
        dispatch({ type: 'SET_EVENT_MODAL_MINIMIZED', minimized: false });
        dispatch({ type: 'SET_CURRENT_EVENT', card: null });
        finalizeEventResolution({ removeFromDungeon: false });
        return;
      }

      dispatch({ type: 'SET_EVENT_MODAL_OPEN', open: false });
      dispatch({ type: 'SET_EVENT_MODAL_MINIMIZED', minimized: false });
      dispatch({ type: 'SET_CURRENT_EVENT', card: null });
      finalizeEventResolution({ removeFromDungeon: false });

      depsRef.current.requestCardAction('delete', 1, {
        title: '增幅祭坛：移除一张手牌',
        description: `移除一张手牌作为祭品，对所有「${targetCard.name}」施加两次增幅。`,
        handOnly: true,
      }).then(deleteSuccess => {
        if (deleteSuccess) {
          dispatch({
            type: 'AMPLIFY_CARDS_BY_NAME',
            cardName: targetCard.name,
            amount: 2,
            source: '增幅祭坛',
          });
          addGameLog('event', `增幅祭坛发动：所有「${targetCard.name}」获得两次增幅（+2）！`);
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `增幅祭坛：所有「${targetCard.name}」获得 +2 增幅！` });
        } else {
          addGameLog('event', '增幅祭坛：没有手牌可供移除。');
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '没有手牌可供移除。' });
        }
        if (isPerm && cellIdx !== -1) {
          dispatch({ type: 'UPDATE_ACTIVE_CARDS', updater: (prev: (GameCardData | null)[]) => {
            const next = [...prev] as typeof prev;
            const card = next[cellIdx];
            if (card?.name === '增幅祭坛' && card.type === 'building') {
              next[cellIdx] = { ...card, hasReleaseCharge: false };
            }
            return next;
          }});
        }
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Return bag
  // ---------------------------------------------------------------------------

  const unregisterProcessedCardId = useCallback((cardId: string) => {
    const st = engine.getState();
    dispatch({ type: 'SET_GAME_FLAGS', patch: {
      processedDungeonCardIds: st.processedDungeonCardIds.filter(id => id !== cardId),
    } as any });
  }, [engine, dispatch]);

  const clearAllProcessedCardIds = useCallback(() => {
    dispatch({ type: 'SET_GAME_FLAGS', patch: { processedDungeonCardIds: [] } as any });
  }, [dispatch]);

  return {
    startEventResolution,
    processPendingAutoDraws,
    enqueueAutoDraw,
    registerDungeonCardProcessed,
    unregisterProcessedCardId,
    clearAllProcessedCardIds,
    requestDiceOutcome,
    handleDiceRollResult,
    cancelDiceModal,
    requestMagicChoice,
    handleMagicChoice,
    requestEquipmentSelection,
    handleEquipmentPromptSelection,
    cancelEquipmentPrompt,
    requestEventAmplifyHandSelection,
    handleEventAmplifyHandSelect,
    cancelEventAmplifyHandPicker,
    evaluateChoiceRequirements,
    eventChoiceStates,
    gainClassDeckBottomCards,
    finalizeEventResolution,
    completeCurrentEvent,
    handleEventChoice,
  };
}
