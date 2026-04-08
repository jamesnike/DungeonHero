import React, { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { useGameEngine, useGameState, useEngineSetter } from '@/hooks/useGameEngine';
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
} from '@/game-core/constants';
import {
  logBackpackDraw,
  pickRandomHandCardsForDiscardPreferGraveyard,
  computeAmuletAuraReversal,
} from '@/game-core/helpers';
import {
  createGraveyardRecallCard,
} from '@/lib/knightDeck';
import {
  STARTER_CARD_IDS,
  skillScrollImage,
  potionSpellDamageImage,
  potionWeaponRepairImage,
  starterScrollUpgradeImage,
  starterScrollReviveImage,
  starterScrollRecallImage,
  createCrimsonVoidSwapMagic,
} from '@/game-core/deck';
import { getHeroSkillById, type HeroSkillId } from '@/lib/heroSkills';

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
  drawFromBackpackToHand: () => GameCardData | null;
  drawClassCardsToBackpack: (
    count: number,
    source: string,
    filter?: (card: GameCardData) => boolean,
  ) => GameCardData[];
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
  disposeOwnedEquipmentCard: (card: GameCardData, options?: { isDestruction?: boolean }) => void;
  addPermanentMagicToRecycleBag: (card: GameCardData) => void;
  amuletEffects: ActiveAmuletEffects;
  addToGraveyard: (card: GameCardData) => void;
  addCardToBackpack: (card: GameCardData, options?: { toBottom?: boolean; pendingDungeonCardId?: string }) => void;
  triggerEventTransform: (fromCard: GameCardData, toCard: GameCardData, message?: string) => Promise<void>;
  applyCardFlip: (card: GameCardData, cellIndex?: number) => Promise<boolean>;
  sacrificeEquipment: (slotId: EquipmentSlotId) => boolean;
  sacrificeAllEquipment: (slotId: EquipmentSlotId) => number;
  swapEquipmentSlots: () => void;
  convertAmuletsToGold: (goldPerAmulet: number) => void;
  discardAllHandCards: () => Promise<void>;
  isRecyclableFromHand: (card: GameCardData) => boolean;

  // --- Functions from useCombatActions (Layer 1) ---
  healHero: (amount: number) => number;
  applyDamage: (damage: number, source?: 'combat' | 'general', opts?: { blockedWithShield?: boolean }) => number;
  beginCombat: (monster: GameCardData, initiator: 'hero' | 'monster') => void;
  updateMonsterCard: (id: string, updater: (m: GameCardData) => GameCardData) => void;
  isMonsterEngaged: (monsterId: string) => boolean;
  damageMonsterWithLayerOverflow: (monster: GameCardData, damage: number, maxLayers?: number) => GameCardData;
  checkHollowSkeletonRestore: (monsterId: string, monsterName: string, layersBefore: number, layersAfter: number) => void;
  checkWraithRebirth: (monsterId: string, monsterName: string, monsterFury: number, layersBefore: number, layersAfter: number) => void;
  handleMonsterDefeated: (monster: GameCardData) => void;
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
  requestGraveyardSelection: (
    maxCards: number,
    options?: { delivery?: 'backpack' | 'hand-first'; filter?: (card: GameCardData) => boolean },
  ) => Promise<GameCardData | null>;
  startShopFlow: (card: GameCardData | null) => boolean;
  beginDiscoverFlow: (
    effect: string,
    options?: { filter?: (card: GameCardData) => boolean },
  ) => boolean;
  handleDiscoverFallback: () => void;

  // --- Functions from useCardPlayHandlers (Layer 3) ---
  normalizeEventEffect: (effect: string | string[] | undefined) => string[];
  handleSkillCard: (card: GameCardData) => void;
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
  triggerDiscardFlight: (card: GameCardData, destination: 'graveyard' | 'recycle-bag') => Promise<void>;

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
  persuadeDiscountRef: React.MutableRefObject<{ costReduction: number; rateBonus: number } | null>;
  persuadeAmuletBonusRef: React.MutableRefObject<number>;
  setPersuadeTempDiscount: React.Dispatch<React.SetStateAction<number>>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEventSystem(depsRef: React.MutableRefObject<EventSystemDeps>) {
  const engine = useGameEngine();
  const gs = useGameState(s => s);

  const {
    hp,
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
    turnCount,
    combatState,
    selectedHeroSkill,
    permanentSkills,
    permanentMaxHpBonus,
    permanentMagicRecycleBag,
    stunCap,
    persuadeLevel,
    persuadeCostModifier,
    equipmentSlotBonuses,
    permanentSpellDamageBonus,
    permanentSpellLifesteal,
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
  } = gs;

  // -- Engine setters ---------------------------------------------------------

  const setHp = useEngineSetter('hp');
  const setGold = useEngineSetter('gold');
  const setTurnCount = useEngineSetter('turnCount');
  const setShopLevel = useEngineSetter('shopLevel');
  const setActiveCards = useEngineSetter('activeCards');
  const setHandCards = useEngineSetter('handCards');
  const setEquipmentSlot1 = useEngineSetter('equipmentSlot1');
  const setEquipmentSlot2 = useEngineSetter('equipmentSlot2');
  const setEquipmentSlotCapacity = useEngineSetter('equipmentSlotCapacity');
  const setEquipmentSlotBonuses = useEngineSetter('equipmentSlotBonuses');
  const setMaxAmuletSlots = useEngineSetter('maxAmuletSlots');
  const setAmuletSlots = useEngineSetter('amuletSlots');
  const setBackpackItems = useEngineSetter('backpackItems');
  const setBackpackCapacityModifier = useEngineSetter('backpackCapacityModifier');
  const setClassDeck = useEngineSetter('classDeck');
  const setPermanentSkills = useEngineSetter('permanentSkills');
  const setPermanentMaxHpBonus = useEngineSetter('permanentMaxHpBonus');
  const setPermanentSpellDamageBonus = useEngineSetter('permanentSpellDamageBonus');
  const setPermanentSpellLifesteal = useEngineSetter('permanentSpellLifesteal');
  const setHandLimitBonus = useEngineSetter('handLimitBonus');
  const setTempShield = useEngineSetter('tempShield');
  const setSlotAttackBursts = useEngineSetter('slotAttackBursts');
  const setSlotTempAttack = useEngineSetter('slotTempAttack');
  const setSlotTempArmor = useEngineSetter('slotTempArmor');
  const setCurrentEventCard = useEngineSetter('currentEventCard');
  const setResolvingDungeonCardId = useEngineSetter('resolvingDungeonCardId');
  const setEventModalOpen = useEngineSetter('eventModalOpen');
  const setEventModalMinimized = useEngineSetter('eventModalMinimized');
  const setEventDiceModal = useEngineSetter('eventDiceModal');
  const setMagicChoiceModal = useEngineSetter('magicChoiceModal');
  const setEquipmentPrompt = useEngineSetter('equipmentPrompt');
  const setGameOver = useEngineSetter('gameOver');
  const setVictory = useEngineSetter('victory');
  const setHeroSkillBanner = useEngineSetter('heroSkillBanner');
  const setDiscardedCards = useEngineSetter('discardedCards');
  const setStunCap = useEngineSetter('stunCap');
  const setPersuadeLevel = useEngineSetter('persuadeLevel');
  const setPersuadeCostModifier = useEngineSetter('persuadeCostModifier');
  const setPersuadeSameTargetCostHalve = useEngineSetter('persuadeSameTargetCostHalve');
  const setPersuadeRaceBonus = useEngineSetter('persuadeRaceBonus');
  const setPersuadeSuccessDurabilityBonus = useEngineSetter('persuadeSuccessDurabilityBonus');
  const setPermanentMagicRecycleBag = useEngineSetter('permanentMagicRecycleBag');
  const setUpgradeModalOpen = useEngineSetter('upgradeModalOpen');
  const setGambitExtraActive = useEngineSetter('gambitExtraActive');
  const setGambitExtraPerSlot = useEngineSetter('gambitExtraPerSlot');
  const setGambitSlotUsed = useEngineSetter('gambitSlotUsed');
  const setPermGrantModal = useEngineSetter('permGrantModal');
  const setActiveCardStacks = useEngineSetter('activeCardStacks');

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

  const eventDiceResolverRef = useRef<((entry: EventDiceRange | null) => void) | null>(null);
  const magicChoiceResolverRef = useRef<((optionId: string) => void) | null>(null);
  const equipmentPromptResolverRef = useRef<((slot: EquipmentSlotId | null) => void) | null>(null);
  const pendingAutoDrawsRef = useRef(0);
  const [autoDrawTrigger, setAutoDrawTrigger] = useState(0);
  const processedDungeonCardIdsRef = useRef<Set<string>>(new Set());
  const skipEventFlipRef = useRef(false);

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
      setResolvingDungeonCardId(cardId);
    }
  };

  // ---------------------------------------------------------------------------
  // processPendingAutoDraws
  // ---------------------------------------------------------------------------

  const processPendingAutoDraws = useCallback(() => {
    if (pendingAutoDrawsRef.current <= 0) {
      return;
    }

    while (pendingAutoDrawsRef.current > 0) {
      const st = engine.getState();
      const liveHandLimit = HAND_LIMIT + (st.handLimitBonus ?? 0);
      const liveHandSize = st.handCards.length;
      const flightsCount = depsRef.current.backpackHandFlightsRef.current.length;
      logBackpackDraw('auto-draw-loop', {
        pending: pendingAutoDrawsRef.current,
        handSize: liveHandSize,
        flights: flightsCount,
        backpackCount: st.backpackItems.length,
      });
      const availableSlots = Math.max(0, liveHandLimit - (liveHandSize + flightsCount));
      if (availableSlots <= 0) {
        logBackpackDraw('auto-draw-blocked-hand-full', {
          pending: pendingAutoDrawsRef.current,
          handSize: liveHandSize,
          flights: flightsCount,
        });
        break;
      }

      if (st.backpackItems.length === 0) {
        logBackpackDraw('auto-draw-blocked-empty', {
          pending: pendingAutoDrawsRef.current,
          backpackCount: st.backpackItems.length,
        });
        break;
      }

      const drawn = depsRef.current.drawFromBackpackToHand();
      if (!drawn) {
        logBackpackDraw('auto-draw-blocked-null', {
          pending: pendingAutoDrawsRef.current,
          backpackCount: engine.getState().backpackItems.length,
        });
        break;
      }

      pendingAutoDrawsRef.current -= 1;
      logBackpackDraw('auto-draw-delivered', {
        cardId: drawn.id,
        pending: pendingAutoDrawsRef.current,
        backpackCount: engine.getState().backpackItems.length,
      });
    }
  }, [handCards.length]);

  useEffect(() => {
    if (isSettledForAutoDraw) {
      processPendingAutoDraws();
    }
  }, [isSettledForAutoDraw, backpackItems.length, handCards.length, processPendingAutoDraws, autoDrawTrigger]);

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
          pending: pendingAutoDrawsRef.current,
        });
        return;
      }

      pendingAutoDrawsRef.current += 1;
      setAutoDrawTrigger(v => v + 1);
      logBackpackDraw('auto-draw-enqueued', {
        source,
        cardId,
        pending: pendingAutoDrawsRef.current,
      });
    },
    [],
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
      if (!cardId || gameOver || victory) {
        return;
      }
      if (processedDungeonCardIdsRef.current.has(cardId)) {
        return;
      }

      processedDungeonCardIdsRef.current.add(cardId);

      const st = engine.getState();
      if (st.backpackItems.length === 0) {
        logBackpackDraw('dungeon-processed-no-backpack', { cardId, source });
      }

      if (depsRef.current.amuletEffects.hasDungeonGold) {
        const goldAmulet = engine.getState().amuletSlots.find(s => s?.amuletEffect === 'dungeon-gold');
        const goldAmount = (goldAmulet?.upgradeLevel ?? 0) >= 1 ? 2 : 1;
        setGold(prev => prev + goldAmount);
        addGameLog('amulet', `拾荒之符：处理地城牌，金币 +${goldAmount}`);
      }

      pendingAutoDrawsRef.current += 1;
      setAutoDrawTrigger(v => v + 1);
      logBackpackDraw('dungeon-processed-deferred', {
        cardId,
        source,
        pending: pendingAutoDrawsRef.current,
      });
    },
    [gameOver, victory],
  );

  // ---------------------------------------------------------------------------
  // requestDiceOutcome / handleDiceRollResult / cancelDiceModal
  // ---------------------------------------------------------------------------

  const requestDiceOutcome = useCallback(
    (config: { title: string; subtitle?: string; entries: EventDiceRange[] }) => {
      return new Promise<EventDiceRange | null>(resolve => {
        eventDiceResolverRef.current = resolve;
        setEventDiceModal({
          title: config.title,
          subtitle: config.subtitle,
          entries: config.entries,
          rolledValue: null,
          highlightedId: null,
        });
        depsRef.current.setEventDiceRollKey(key => key + 1);
      });
    },
    [],
  );

  const handleDiceRollResult = useCallback((value: number) => {
    depsRef.current.clearUndoStack();
    setEventDiceModal(prev => {
      if (!prev) return prev;
      const matched =
        prev.entries.find(entry => value >= entry.range[0] && value <= entry.range[1]) ??
        prev.entries[prev.entries.length - 1] ??
        null;

      const context = prev.subtitle ? `${prev.title}（${prev.subtitle}）` : prev.title;
      addGameLog('event', `${context} 掷骰：${value} → ${matched?.label ?? '无效果'}`);

      window.setTimeout(() => {
        eventDiceResolverRef.current?.(matched ?? null);
        eventDiceResolverRef.current = null;
        setEventDiceModal(null);
      }, 900);

      return {
        ...prev,
        rolledValue: value,
        highlightedId: matched?.id ?? null,
      };
    });
  }, []);

  const cancelDiceModal = useCallback(() => {
    if (eventDiceResolverRef.current) {
      eventDiceResolverRef.current(null);
      eventDiceResolverRef.current = null;
    }
    setEventDiceModal(null);
  }, []);

  // ---------------------------------------------------------------------------
  // requestMagicChoice / handleMagicChoice
  // ---------------------------------------------------------------------------

  const requestMagicChoice = useCallback(
    (config: MagicChoiceModalState) => {
      return new Promise<string>(resolve => {
        magicChoiceResolverRef.current = resolve;
        setMagicChoiceModal(config);
      });
    },
    [],
  );

  const handleMagicChoice = useCallback((optionId: string) => {
    magicChoiceResolverRef.current?.(optionId);
    magicChoiceResolverRef.current = null;
    setMagicChoiceModal(null);
  }, []);

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
        setEquipmentPrompt(prompt);
      });
    },
    [equipmentSlot1, equipmentSlot2],
  );

  const handleEquipmentPromptSelection = useCallback((slot: EquipmentSlotId) => {
    equipmentPromptResolverRef.current?.(slot);
    equipmentPromptResolverRef.current = null;
    setEquipmentPrompt(null);
  }, []);

  const cancelEquipmentPrompt = useCallback(() => {
    if (equipmentPromptResolverRef.current) {
      equipmentPromptResolverRef.current(null);
      equipmentPromptResolverRef.current = null;
    }
    setEquipmentPrompt(null);
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
        }
      }
      return { disabled: false };
    },
    [activeCards, amuletSlots.length, backpackItems.length, combatState.engagedMonsterIds, discardedCards.length, equipmentSlot1, equipmentSlot2, gold, handCards.length, resolvingDungeonCardId, shopLevel, persuadeLevel],
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
      if (count <= 0 || classDeck.length === 0) {
        return [];
      }
      const availableSlots = backpackCapacity - backpackItems.length;
      if (availableSlots <= 0) {
        return [];
      }
      const takeCount = Math.min(count, availableSlots, classDeck.length);
      if (takeCount <= 0) {
        return [];
      }
      const cards = classDeck.slice(-takeCount);
      setClassDeck(prev => prev.slice(0, prev.length - takeCount));
      setBackpackItems(prev => {
        const next = [...cards, ...prev];
        if (next.length <= backpackCapacity) return next;
        next.slice(backpackCapacity).forEach(c => depsRef.current.addToGraveyard(c));
        return next.slice(0, backpackCapacity);
      });
      addGameLog('skill', `从职业牌组底部获得 ${takeCount} 张牌：${cards.map(c => c.name).join('、')}`);
      depsRef.current.triggerClassDeckFlight(cards);
      return cards;
    },
    [addGameLog, backpackCapacity, backpackItems.length, classDeck, setBackpackItems, setClassDeck],
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
      setResolvingDungeonCardId(prev => (prev === resolution.cardId ? null : prev));
    }

    depsRef.current.eventResolutionRef.current = { cardId: null, source: null };
  };

  // ---------------------------------------------------------------------------
  // completeCurrentEvent
  // ---------------------------------------------------------------------------

  const completeCurrentEvent = useCallback(async () => {
    if (!currentEventCard) return;
    const cardToComplete = currentEventCard;
    let shouldSkipFlip = skipEventFlipRef.current;
    skipEventFlipRef.current = false;
    setEventModalOpen(false);
    setEventModalMinimized(false);
    setCurrentEventCard(null);

    const st = engine.getState();
    const liveActive = st.activeCards;
    const previewRow = st.previewCards;

    if (!shouldSkipFlip && cardToComplete.flipCondition) {
      if (cardToComplete.flipCondition.startsWith('activeRowEquipment:')) {
        const minCount = parseInt(cardToComplete.flipCondition.split(':')[1], 10) || 2;
        const equipCount = liveActive.filter(
          (c): c is GameCardData => c != null && (c.type === 'weapon' || c.type === 'shield'),
        ).length;
        if (equipCount < minCount) {
          shouldSkipFlip = true;
        }
      }
    }

    const crimsonMagicResonanceFlip =
      cardToComplete.name === '双重燃烧（觉醒）' && !shouldSkipFlip
        ? (() => {
            const idx = liveActive.findIndex(c => c?.id === cardToComplete.id);
            if (idx === -1) return null;
            const above = previewRow[idx];
            if (!above || (above.type !== 'magic' && above.type !== 'hero-magic')) return null;
            return {
              toCard: createCrimsonVoidSwapMagic(),
              destination: 'stay' as const,
              message: '魔法共鸣…卷轴化为虚空置换！',
              banner: '正上方魔法共鸣：「虚空置换」降临地城！',
            };
          })()
        : null;

    const effectiveFlipTarget = crimsonMagicResonanceFlip ?? cardToComplete.flipTarget;
    const hasFlip = !!effectiveFlipTarget && !shouldSkipFlip;
    const flipDest = hasFlip ? (effectiveFlipTarget!.destination ?? 'graveyard') : 'graveyard';
    const isStayFlip = hasFlip && flipDest === 'stay';
    if (hasFlip && flipDest !== 'graveyard') {
      depsRef.current.skipNextEventAutoDrawRef.current = true;
    }
    const cellIndex = isStayFlip
      ? liveActive.findIndex(c => c?.id === cardToComplete.id)
      : -1;
    const cardForFlip =
      hasFlip && effectiveFlipTarget ? { ...cardToComplete, flipTarget: effectiveFlipTarget } : cardToComplete;

    const eventCellIdx = liveActive.findIndex(c => c?.id === cardToComplete.id);
    const stacks = st.activeCardStacks ?? {};
    const stackBelow = eventCellIdx >= 0 ? (stacks[eventCellIdx] ?? []) : [];
    const shouldStayOnStack = !hasFlip && !!cardToComplete.stayIfStacked && stackBelow.length > 0;

    finalizeEventResolution({ removeFromDungeon: !isStayFlip && !shouldStayOnStack });
    if (hasFlip) {
      await depsRef.current.applyCardFlip(cardForFlip, isStayFlip ? cellIndex : undefined);
    } else if (shouldStayOnStack) {
      for (const stackCard of stackBelow) {
        depsRef.current.discardCardToGraveyard(stackCard, { owner: 'dungeon' });
        addGameLog('event', `祭坛驻留：堆叠牌「${stackCard.name}」被送入坟场`);
      }
      setActiveCardStacks(prev => {
        const next = { ...prev };
        delete next[eventCellIdx];
        return next;
      });
      addGameLog('event', '附魔祭坛驻留在地城中，可再次触发！');
      setHeroSkillBanner('附魔祭坛驻留！堆叠牌已消耗。');
    } else {
      depsRef.current.addToGraveyard(cardToComplete);
    }
  }, [currentEventCard, engine, finalizeEventResolution]);

  // ---------------------------------------------------------------------------
  // handleEventChoice
  // ---------------------------------------------------------------------------

  const handleEventChoice = async (choiceIndex: number) => {
    if (depsRef.current.eventChoiceProcessingRef.current) return;
    depsRef.current.pushUndoSnapshot();
    if (!currentEventCard || !currentEventCard.eventChoices) return;
    
    const choice = currentEventCard.eventChoices[choiceIndex];
    if (!choice) return;

    if (eventChoiceStates[choiceIndex]?.disabled) {
      return;
    }
    depsRef.current.eventChoiceProcessingRef.current = true;

    addGameLog('event', `事件「${currentEventCard.name}」：选择「${choice.text}」`);

    const effects = depsRef.current.normalizeEventEffect(choice.effect);
    if (choice.diceTable?.length) {
      const diceResult = await requestDiceOutcome({
        title: currentEventCard.name,
        subtitle: choice.text,
        entries: choice.diceTable,
      });
      if (!diceResult) {
        return;
      }
      effects.push(...depsRef.current.normalizeEventEffect(diceResult.effect));
    }

    let eventResolutionDeferred = false;
    
    for (const effect of effects) {
      if (effect === 'none') continue;
      
      if (effect.startsWith('hp-')) {
        const damage = parseInt(effect.replace('hp-', ''), 10);
        addGameLog('event', `事件效果：受到 ${damage} 点伤害`);
        depsRef.current.applyDamage(damage);
      } else if (effect.startsWith('heal+')) {
        const healAmount = parseInt(effect.replace('heal+', ''), 10);
        addGameLog('event', `事件效果：回复 ${healAmount} 点生命`);
        depsRef.current.healHero(healAmount);
      } else if (effect === 'fullheal') {
        addGameLog('event', '事件效果：完全治愈');
        depsRef.current.healHero(maxHp);
      } else if (effect.startsWith('gold-')) {
        const goldLost = parseInt(effect.replace('gold-', ''), 10);
        const actualLoss = Math.min(goldLost, gold);
        if (actualLoss > 0) {
          setGold(prev => Math.max(0, prev - goldLost));
        }
        if (actualLoss < goldLost) {
          addGameLog('event', `事件效果：失去 ${actualLoss} 金币（金币不足，应扣 ${goldLost}）`);
        } else {
          addGameLog('event', `事件效果：失去 ${goldLost} 金币`);
        }
      } else if (effect.startsWith('gold+')) {
        const goldGain = parseInt(effect.replace('gold+', ''), 10);
        addGameLog('event', `事件效果：获得 ${goldGain} 金币`);
        setGold(prev => prev + goldGain);
      } else if (effect.startsWith('maxhpperm+')) {
        const bonus = parseInt(effect.replace('maxhpperm+', ''), 10);
        if (!Number.isNaN(bonus)) {
          addGameLog('event', `事件效果：最大生命永久 +${bonus}`);
          setPermanentMaxHpBonus(prev => prev + bonus);
        }
      } else if (effect === 'weapon') {
        const weaponValue = Math.floor(Math.random() * 3) + 3;
        console.debug('[Event] Placeholder weapon reward', weaponValue);
      } else if (effect === 'permanentskill') {
        const randomSkill = ['Iron Skin', 'Weapon Master'][Math.floor(Math.random() * 2)];
        addGameLog('event', `事件效果：获得永久技能 ${randomSkill}`);
        setPermanentSkills(prev => [...prev, randomSkill]);
      } else if (effect === 'flipToCurse') {
        if (currentEventCard) {
          const curseCard = depsRef.current.createCurseCard(currentEventCard);
          await depsRef.current.triggerEventTransform(currentEventCard, curseCard);
          depsRef.current.skipNextEventAutoDrawRef.current = true;
          depsRef.current.addCardToBackpack(curseCard);
          addGameLog('event', '事件效果：卷轴转化为血咒');
          setHeroSkillBanner('卷轴翻转化为血咒，潜入了你的背包。');
          if (depsRef.current.amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'addCurse') {
        const curseCard = depsRef.current.createCurseCard(currentEventCard || undefined);
        depsRef.current.skipNextEventAutoDrawRef.current = true;
        depsRef.current.addCardToBackpack(curseCard);
        addGameLog('event', '事件效果：获得一张血咒');
        setHeroSkillBanner('一张血咒潜入了你的背包。');
      } else if (effect === 'discardHandAll') {
        const hadCards = handCards.length;
        await depsRef.current.discardAllHandCards();
        addGameLog('event', `事件效果：弃回全部手牌（${hadCards} 张）`);
        if (hadCards > 0) {
          setHeroSkillBanner('你弃回了全部手牌。');
        } else {
          setHeroSkillBanner('没有手牌可以弃回。');
        }
      } else if (effect === 'handAllToRecycleBag') {
        const snapshot = [...depsRef.current.handCardsRef.current];
        if (snapshot.length === 0) {
          addGameLog('event', '事件效果：手牌为空');
          setHeroSkillBanner('没有手牌可以移入回收袋。');
        } else {
          const flights = snapshot.map(card => ({
            card,
            promise: depsRef.current.triggerDiscardFlight(card, 'recycle-bag'),
          }));
          depsRef.current.handCardsRef.current = [];
          setHandCards([]);
          await Promise.all(flights.map(f => f.promise));
          const sorted = [...flights].sort((a, b) => (a.card.onDiscardDraw ? 1 : 0) - (b.card.onDiscardDraw ? 1 : 0));
          sorted.forEach(f => {
            depsRef.current.discardCardToGraveyard(f.card, { owner: 'player', forceRecycleBag: true });
          });
          addGameLog('event', `事件效果：${snapshot.length} 张手牌已移入永久魔法回收袋`);
          setHeroSkillBanner(`${snapshot.length} 张手牌已移入回收袋。`);
        }
      } else if (effect.startsWith('backpackSize-')) {
        const reduction = Math.abs(parseInt(effect.replace('backpackSize-', ''), 10)) || 0;
        if (reduction > 0) {
          const newCapacity = Math.max(1, backpackCapacity - reduction);
          setBackpackCapacityModifier(prev => prev - reduction);

          const currentItems = engine.getState().backpackItems;
          const overflow = currentItems.length - newCapacity;
          if (overflow > 0) {
            const indices = currentItems.map((_, i) => i);
            for (let i = indices.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [indices[i], indices[j]] = [indices[j], indices[i]];
            }
            const evictedIndices = new Set(indices.slice(0, overflow));
            const evicted = indices.slice(0, overflow).map(i => currentItems[i]);
            const remaining = currentItems.filter((_, i) => !evictedIndices.has(i));

            setBackpackItems(remaining);

            const flights = evicted.map(card => ({
              card,
              promise: depsRef.current.triggerDiscardFlight(card, 'recycle-bag'),
            }));
            await Promise.all(flights.map(f => f.promise));
            flights.forEach(f => depsRef.current.addPermanentMagicToRecycleBag(f.card));

            addGameLog('event', `事件效果：背包容量永久 -${reduction}，${evicted.length} 张多余的牌放入回收袋`);
            setHeroSkillBanner(`背包容量降低 ${reduction}，${evicted.map(c => c.name).join('、')} 被放入回收袋。`);
          } else {
            addGameLog('event', `事件效果：背包容量永久 -${reduction}`);
            setHeroSkillBanner(`背包容量永久降低 ${reduction}。`);
          }
        }
      } else if (effect.startsWith('backpackSize+')) {
        const increase = parseInt(effect.replace('backpackSize+', ''), 10) || 0;
        if (increase > 0) {
          addGameLog('event', `事件效果：背包容量永久 +${increase}`);
          setBackpackCapacityModifier(prev => prev + increase);
          setHeroSkillBanner(`背包容量永久增加 ${increase}。`);
        }
      } else if (effect === 'equipBurst+4') {
        const weaponSlots = depsRef.current.getEquipmentSlots().filter(slot => slot.item?.type === 'weapon' || slot.item?.type === 'monster');
        if (weaponSlots.length === 0) {
          setHeroSkillBanner('当前没有装备武器，无法施加祝福。');
        } else if (weaponSlots.length === 1) {
          const slotId = weaponSlots[0].id;
          setSlotAttackBursts(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + 4 }));
          addGameLog('event', `事件效果：${weaponSlots[0].item!.name} 下次攻击 +4`);
          setHeroSkillBanner(`${weaponSlots[0].item!.name} 的下次攻击将额外造成 4 点伤害！`);
        } else {
          const selected = await requestEquipmentSelection({
            prompt: '选择一把武器接受锋刃祝福',
            subtext: '该武器下次攻击将额外 +4 伤害。',
          });
          if (selected) {
            const slotItem = selected === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
            if (slotItem?.type === 'weapon' || slotItem?.type === 'monster') {
              setSlotAttackBursts(prev => ({ ...prev, [selected]: (prev[selected] ?? 0) + 4 }));
              addGameLog('event', `事件效果：${slotItem.name} 下次攻击 +4`);
              setHeroSkillBanner(`${slotItem.name} 的下次攻击将额外造成 4 点伤害！`);
            } else {
              setHeroSkillBanner('所选装备不是武器。');
            }
          }
        }
      } else if (effect === 'turnCount-2') {
        addGameLog('event', '事件效果：Waterfall 进度 -2');
        setTurnCount(prev => Math.max(1, prev - 2));
        setHeroSkillBanner('时空收缩：怪物成长进度回退了 2 步！');
      } else if (effect === 'flipToDoubleNextMagic') {
        if (currentEventCard) {
          const doubleCard: GameCardData = {
            id: `double-magic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'magic',
            name: '法术回响',
            value: 0,
            image: skillScrollImage,
            magicType: 'permanent',
            magicEffect: 'double-next-magic',
            description: '永久魔法：使用后，下一张法术的效果将触发两次。',
          };
          await depsRef.current.triggerEventTransform(currentEventCard, doubleCard, '契约裂隙涌出回响之力…');
          depsRef.current.skipNextEventAutoDrawRef.current = true;
          depsRef.current.addCardToBackpack(doubleCard);
          addGameLog('event', '事件效果：获得「法术回响」');
          setHeroSkillBanner('裂隙中浮现了「法术回响」，已放入背包。');
          if (depsRef.current.amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'crypt-all-effects') {
        const deleteSuccess = await depsRef.current.requestCardAction('delete', 3, {
          title: '墓语密室：删除 3 张卡牌',
          description: '被删除的卡牌会被送入坟场，永久离开你的牌库。',
        });
        if (deleteSuccess) {
          addGameLog('event', '墓语密室（全效）：删除了 3 张卡牌');
        } else {
          addGameLog('event', '墓语密室（全效）：未删除卡牌');
        }
        const selected1 = await depsRef.current.requestGraveyardSelection(3);
        if (selected1) {
          addGameLog('event', `墓语密室（全效）：从坟场召回 ${selected1.name}`);
        }
        const selected2 = await depsRef.current.requestGraveyardSelection(3);
        if (selected2) {
          addGameLog('event', `墓语密室（全效）：从坟场召回 ${selected2.name}`);
        }
        const recycled = engine.getState().permanentMagicRecycleBag;
        if (recycled.length > 0) {
          const shuffled = [...recycled].sort(() => Math.random() - 0.5);
          const picked = shuffled[0];
          setPermanentMagicRecycleBag(prev => prev.filter(c => c.id !== picked.id));
          depsRef.current.addCardToBackpack(picked);
          addGameLog('event', `墓语密室（全效）：从回收袋获得 ${picked.name}`);
        }
        setBackpackCapacityModifier(prev => prev + 5);
        addGameLog('event', '墓语密室（全效）：背包上限 +5');
        setStunCap(prev => {
          const next = Math.min(100, prev + 10);
          return next;
        });
        addGameLog('event', '墓语密室（全效）：击晕上限 +10%');
        setPersuadeLevel(prev => {
          const next = Math.min(4, prev + 1);
          return next;
        });
        setPersuadeCostModifier(prev => prev - 2);
        addGameLog('event', '墓语密室（全效）：劝降等级+1，劝降费用 -2');
        const discoverStarted = depsRef.current.beginDiscoverFlow('crypt-all-discover-weapon', {
          filter: (card: GameCardData) => card.type === 'weapon',
        });
        if (discoverStarted) {
          eventResolutionDeferred = true;
          break;
        } else {
          depsRef.current.handleDiscoverFallback();
        }
        addGameLog('shop', '墓语密室（全效）：开启商店');
        const started = depsRef.current.startShopFlow(currentEventCard);
        if (started) {
          eventResolutionDeferred = true;
          break;
        }
      } else if (effect === 'crossroads-destroy-below') {
        if (currentEventCard && resolvingDungeonCardId) {
          const cardIdx = activeCards.findIndex(c => c?.id === resolvingDungeonCardId);
          const belowMap: Record<number, { type: 'equipment'; slotId: EquipmentSlotId } | { type: 'amulet' } | null> = {
            0: { type: 'amulet' },
            1: { type: 'equipment', slotId: 'equipmentSlot1' },
            2: null,
            3: { type: 'equipment', slotId: 'equipmentSlot2' },
            4: null,
          };
          const below = cardIdx >= 0 ? belowMap[cardIdx] ?? null : null;
          if (below?.type === 'equipment') {
            const slotItem = below.slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
            if (slotItem) {
              addGameLog('event', `命运十字路口：破坏了下方装备「${slotItem.name}」`);
              if (slotItem.onDestroyHeal) {
                depsRef.current.healHero(slotItem.onDestroyHeal);
                addGameLog('equip', `${slotItem.name} 遗言：恢复了 ${slotItem.onDestroyHeal} 点生命`);
              }
              if (slotItem.onDestroyGold) {
                setGold(prev => prev + slotItem.onDestroyGold!);
                addGameLog('equip', `${slotItem.name} 遗言：获得了 ${slotItem.onDestroyGold} 金币`);
              }
              if (slotItem.onDestroyDraw) {
                for (let di = 0; di < slotItem.onDestroyDraw; di++) depsRef.current.drawFromBackpackToHand();
                addGameLog('equip', `${slotItem.name} 遗言：抽取了 ${slotItem.onDestroyDraw} 张牌`);
              }
              if (slotItem.onDestroyClassDraw) {
                const classDrawn = depsRef.current.drawClassCardsToBackpack(slotItem.onDestroyClassDraw, `${slotItem.name}-遗言`);
                if (classDrawn.length > 0) {
                  depsRef.current.triggerClassDeckFlight(classDrawn);
                  addGameLog('equip', `${slotItem.name} 遗言：获得专属卡「${classDrawn.map(c => c.name).join('、')}」`);
                }
              }
              if (slotItem.onDestroyPermanentDamage) {
                depsRef.current.setEquipmentSlotBonus(below.slotId, 'damage', cur => cur + slotItem.onDestroyPermanentDamage!);
                addGameLog('equip', `${slotItem.name} 遗言：该装备栏永久伤害 +${slotItem.onDestroyPermanentDamage}！`);
              }
              if (slotItem.onDestroyPermanentShield) {
                depsRef.current.setEquipmentSlotBonus(below.slotId, 'shield', cur => cur + slotItem.onDestroyPermanentShield!);
                addGameLog('equip', `${slotItem.name} 遗言：该装备栏永久护甲 +${slotItem.onDestroyPermanentShield}！`);
              }
              if (slotItem.onDestroyEffect) {
                if (slotItem.onDestroyEffect === 'hand-equip-buff-2-2') {
                  setHandCards(prev => {
                    const buffed: string[] = [];
                    const next = prev.map(c => {
                      if (c.type === 'weapon' || c.type === 'shield') {
                        buffed.push(c.name);
                        return { ...c, value: (c.value ?? 0) + 2, armorMax: c.armorMax != null ? c.armorMax + 2 : undefined };
                      }
                      return c;
                    });
                    if (buffed.length > 0) {
                      addGameLog('equip', `${slotItem.name} 遗言：${buffed.join('、')} 获得 +2攻击 +2护甲！`);
                      setHeroSkillBanner(`${slotItem.name} 遗言！手牌装备 +2攻击 +2护甲！`);
                    }
                    return next;
                  });
                } else {
                  addGameLog('equip', `${slotItem.name} 遗言：${slotItem.onDestroyEffect}`);
                }
              }
              depsRef.current.disposeOwnedEquipmentCard(slotItem, { isDestruction: true });
              depsRef.current.clearEquipmentSlotById(below.slotId);
              const reserve = below.slotId === 'equipmentSlot1' ? equipmentSlot1Reserve : equipmentSlot2Reserve;
              if (reserve.length > 0) {
                const promoted = reserve[reserve.length - 1];
                depsRef.current.setEquipmentSlotById(below.slotId, promoted);
                depsRef.current.setEquipmentReserve(below.slotId, reserve.slice(0, -1));
              }
              setHeroSkillBanner(`破坏了「${slotItem.name}」！获得全部显示选项的效果！`);
            }
          } else if (below?.type === 'amulet' && amuletSlots.length > 0) {
            const topAmulet = amuletSlots[amuletSlots.length - 1];
            addGameLog('event', `命运十字路口：破坏了下方护符「${topAmulet.name}」`);
            depsRef.current.addToGraveyard(topAmulet);
            setAmuletSlots(prev => prev.slice(0, -1));
            setHeroSkillBanner(`破坏了「${topAmulet.name}」！获得全部显示选项的效果！`);
          }
          const displayedChoices = currentEventCard.eventChoices?.filter(
            c => !depsRef.current.normalizeEventEffect(c.effect).includes('crossroads-destroy-below')
          ) ?? [];
          for (const otherChoice of displayedChoices) {
            const choiceEffects = depsRef.current.normalizeEventEffect(otherChoice.effect);
            for (const eff of choiceEffects) {
              if (eff.startsWith('maxhpperm+')) {
                const bonus = parseInt(eff.replace('maxhpperm+', ''), 10);
                if (!Number.isNaN(bonus)) {
                  setPermanentMaxHpBonus(prev => prev + bonus);
                  addGameLog('event', `命运十字路口：最大生命永久 +${bonus}`);
                }
              } else if (eff.startsWith('backpackSize+')) {
                const bonus = parseInt(eff.replace('backpackSize+', ''), 10);
                if (!Number.isNaN(bonus)) {
                  setBackpackCapacityModifier(prev => prev + bonus);
                  addGameLog('event', `命运十字路口：背包上限 +${bonus}`);
                }
              } else if (eff.startsWith('shopLevel+')) {
                const bonus = parseInt(eff.replace('shopLevel+', ''), 10);
                if (!Number.isNaN(bonus)) {
                  setShopLevel(prev => Math.min(MAX_SHOP_LEVEL, prev + bonus));
                  addGameLog('event', `命运十字路口：商店等级 +${bonus}`);
                }
              } else if (eff === 'openShop') {
                const started = depsRef.current.startShopFlow(currentEventCard);
                if (started) {
                  eventResolutionDeferred = true;
                }
              } else if (eff === 'drawClass2') {
                const drawn = depsRef.current.drawClassCardsToBackpack(2, 'crossroads-destroy');
                addGameLog('event', `命运十字路口：获得 ${drawn.length} 张职业牌`);
                depsRef.current.triggerClassDeckFlight(drawn);
              } else if (eff === 'upgradeCard') {
                addGameLog('event', '命运十字路口：选择一张牌升级');
                setUpgradeModalOpen(true);
              }
            }
          }
        }
      } else if (effect === 'guildFlipToMagic') {
        if (currentEventCard) {
          const bloodGoldCard: GameCardData = {
            id: 'guild-blood-gold',
            type: 'magic',
            name: '血金术',
            value: 0,
            image: skillScrollImage,
            magicType: 'permanent',
            magicEffect: '永久魔法：受到 1 点伤害，获得 2 金币。',
            description: '以鲜血换取黄金，奇术商会的禁忌手段。',
          };
          await depsRef.current.triggerEventTransform(currentEventCard, bloodGoldCard, '奇术商会翻转为「血金术」…');
          depsRef.current.skipNextEventAutoDrawRef.current = true;
          depsRef.current.addCardToBackpack(bloodGoldCard);
          addGameLog('event', '事件效果：获得「血金术」');
          setHeroSkillBanner('商会卷轴翻转为「血金术」，已放入背包。');
          if (depsRef.current.amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'guildFlipToHandRecycleMagic') {
        if (currentEventCard) {
          const handRecycleCard: GameCardData = {
            id: `guild-hand-recycle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'magic',
            name: '奇术轮转',
            value: 0,
            image: skillScrollImage,
            magicType: 'permanent',
            magicEffect: 'guild-hand-recycle',
            description: '奇术商会的秘传手法：将所有手牌移入回收袋，再从回收袋随机取回 2 张。',
          };
          await depsRef.current.triggerEventTransform(currentEventCard, handRecycleCard, '奇术商会翻转为「奇术轮转」…');
          depsRef.current.skipNextEventAutoDrawRef.current = true;
          depsRef.current.addCardToBackpack(handRecycleCard);
          addGameLog('event', '事件效果：获得「奇术轮转」');
          setHeroSkillBanner('商会卷轴翻转为「奇术轮转」，已放入背包。');
          if (depsRef.current.amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'flipToPaperAsh') {
        if (currentEventCard) {
          const paperAshPotion: GameCardData = {
            id: `paper-ash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'potion',
            name: '纸灰药剂',
            value: 0,
            image: potionSpellDamageImage,
            description: '使用时永久让法术伤害 +2；最大生命值 -5。',
            potionEffect: 'perm-spell-damage-2',
          };
          await depsRef.current.triggerEventTransform(currentEventCard, paperAshPotion, '残页翻转，药香浮现…');
          depsRef.current.skipNextEventAutoDrawRef.current = true;
          depsRef.current.addCardToBackpack(paperAshPotion);
          addGameLog('event', '事件效果：遗稿翻转成了「纸灰药剂」');
          setHeroSkillBanner('遗稿翻转成了纸灰药剂，已放入背包。');
          if (depsRef.current.amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'flipToLeftDurabilityPotion') {
        if (currentEventCard) {
          const flipPotionId = `right-dur-potion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const durabilityPotion: GameCardData = {
            id: `left-dur-potion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'potion',
            name: '淬炼药剂',
            value: 0,
            image: potionWeaponRepairImage,
            description: '使用时左装备栏的装备耐久上限 +1。翻转后为右装备栏耐久上限 +1 的药剂。',
            potionEffect: 'left-slot-durability-max+1',
            flipTarget: {
              toCard: {
                id: flipPotionId,
                type: 'potion',
                name: '淬炼药剂（右）',
                value: 0,
                image: potionWeaponRepairImage,
                description: '使用时右装备栏的装备耐久上限 +1。',
                potionEffect: 'right-slot-durability-max+1',
              },
              destination: 'backpack',
              banner: '淬炼药剂翻转，右侧淬炼之力凝结…',
            },
          };
          await depsRef.current.triggerEventTransform(currentEventCard, durabilityPotion, '残页翻转，淬炼之力凝结…');
          depsRef.current.skipNextEventAutoDrawRef.current = true;
          depsRef.current.addCardToBackpack(durabilityPotion);
          addGameLog('event', '事件效果：遗稿翻转成了「淬炼药剂」');
          setHeroSkillBanner('遗稿翻转成了淬炼药剂，已放入背包。');
          if (depsRef.current.amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'flipToHonorBloodMagic') {
        if (currentEventCard) {
          const honorBloodCard: GameCardData = {
            id: `honor-blood-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'magic',
            name: '战血之印',
            value: 0,
            image: skillScrollImage,
            magicType: 'permanent',
            magicEffect: 'honor-blood',
            description:
              '永久魔法：打出时失去 1 点生命，选择一件装备恢复 1 点耐久（法术回响时恢复 2）。被弃置时将激活行所有怪物攻击力 -2。',
          };
          await depsRef.current.triggerEventTransform(currentEventCard, honorBloodCard, '战血荣誉翻转为「战血之印」…');
          depsRef.current.skipNextEventAutoDrawRef.current = true;
          depsRef.current.addCardToBackpack(honorBloodCard);
          addGameLog('event', '事件效果：战血荣誉翻转成了「战血之印」');
          setHeroSkillBanner('战血荣誉翻转为战血之印，已放入背包。');
          if (depsRef.current.amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'flipToHonorSweepMagic') {
        if (currentEventCard) {
          const honorSweepCard: GameCardData = {
            id: `honor-sweep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'magic',
            name: '战血横扫',
            value: 0,
            image: skillScrollImage,
            magicType: 'permanent',
            magicEffect: 'honor-sweep',
            knightEffect: 'honor-sweep',
            maxUpgradeLevel: 2,
            upgradeLevel: 0,
            recycleDelay: 1,
            description:
              '永久魔法：选择一把武器，对激活行所有怪物造成等同于该武器当前攻击力的法术伤害（每轮、每只怪分开结算），不消耗耐久；该武器栏临时攻击 -5。可升级 2 次：每级额外多一轮全额伤害。',
          };
          await depsRef.current.triggerEventTransform(currentEventCard, honorSweepCard, '战血荣誉翻转为「战血横扫」…');
          depsRef.current.skipNextEventAutoDrawRef.current = true;
          depsRef.current.addCardToBackpack(honorSweepCard);
          addGameLog('event', '事件效果：战血荣誉翻转成了「战血横扫」');
          setHeroSkillBanner('战血荣誉翻转为战血横扫，已放入背包。');
          if (depsRef.current.amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'handLimit+1') {
        setHandLimitBonus(prev => prev + 1);
        addGameLog('event', '事件效果：手牌上限 +1');
        setHeroSkillBanner(`手牌上限提升至 ${effectiveHandLimit + 1}。`);
      } else if (effect === 'amuletCapacity+1') {
        setMaxAmuletSlots(prev => prev + 1);
        addGameLog('event', '事件效果：护符上限 +1');
        setHeroSkillBanner(`护符上限提升至 ${maxAmuletSlots + 1}。`);
      } else if (effect === 'equipSlot1Capacity+1') {
        setEquipmentSlotCapacity(prev => ({ ...prev, equipmentSlot1: prev.equipmentSlot1 + 1 }));
        addGameLog('event', '事件效果：左装备栏容量 +1');
        setHeroSkillBanner('左装备栏现在可以装备多件装备了！');
      } else if (effect === 'equipSlot2Capacity+1') {
        setEquipmentSlotCapacity(prev => ({ ...prev, equipmentSlot2: prev.equipmentSlot2 + 1 }));
        addGameLog('event', '事件效果：右装备栏容量 +1');
        setHeroSkillBanner('右装备栏现在可以装备多件装备了！');
      } else if (effect.startsWith('shopLevel+')) {
        const amount = parseInt(effect.replace('shopLevel+', ''), 10) || 1;
        setShopLevel(prev => {
          const next = Math.min(MAX_SHOP_LEVEL, Math.max(0, prev + amount));
          if (next === prev) {
            addGameLog('shop', `商店等级已达上限 Lv.${MAX_SHOP_LEVEL}，无法继续提升`);
            setHeroSkillBanner(`商店等级已满（Lv.${MAX_SHOP_LEVEL}）！`);
            return prev;
          }
          addGameLog('shop', `商店等级提升至 Lv.${next}`);
          setHeroSkillBanner(`商店等级提升到 Lv.${next}`);
          return next;
        });
      } else if (effect.startsWith('spellDamage+')) {
        const amount = parseInt(effect.replace('spellDamage+', ''), 10) || 1;
        setPermanentSpellDamageBonus(prev => {
          const next = prev + amount;
          addGameLog('event', `事件效果：法术伤害永久 +${amount}`);
          setHeroSkillBanner(`法术伤害永久 +${amount}（当前 +${next}）。`);
          return next;
        });
      } else if (effect.startsWith('spellLifesteal+')) {
        const amount = parseInt(effect.replace('spellLifesteal+', ''), 10) || 1;
        setPermanentSpellLifesteal(prev => {
          const next = prev + amount;
          addGameLog('event', `事件效果：超杀吸血永久 +${amount}`);
          setHeroSkillBanner(`超杀吸血永久 +${amount}（当前 ${next}）。`);
          return next;
        });
      } else if (effect.startsWith('spellLifesteal-')) {
        const amount = parseInt(effect.replace('spellLifesteal-', ''), 10) || 1;
        setPermanentSpellLifesteal(prev => {
          const next = Math.max(0, prev - amount);
          addGameLog('event', `事件效果：超杀吸血永久 -${amount}`);
          setHeroSkillBanner(`超杀吸血永久 -${amount}（当前 ${next}）。`);
          return next;
        });
      } else if (effect === 'halveSlotDamageBonus') {
        setEquipmentSlotBonuses(prev => {
          const s1d = Math.floor(prev.equipmentSlot1.damage / 2);
          const s2d = Math.floor(prev.equipmentSlot2.damage / 2);
          addGameLog('event', `事件效果：所有装备栏永久攻击加成减半（左 ${prev.equipmentSlot1.damage}→${s1d}，右 ${prev.equipmentSlot2.damage}→${s2d}）`);
          setHeroSkillBanner(`装备栏永久攻击加成减半！`);
          return {
            ...prev,
            equipmentSlot1: { ...prev.equipmentSlot1, damage: s1d },
            equipmentSlot2: { ...prev.equipmentSlot2, damage: s2d },
          };
        });
      } else if (effect === 'halveSpellDamageBonus') {
        setPermanentSpellDamageBonus(prev => {
          const next = Math.floor(prev / 2);
          addGameLog('event', `事件效果：法术伤害加成减半（${prev}→${next}）`);
          setHeroSkillBanner(`法术伤害加成减半（${prev}→${next}）！`);
          return next;
        });
      } else if (effect === 'halveSlotShieldBonus') {
        setEquipmentSlotBonuses(prev => {
          const s1s = Math.floor(prev.equipmentSlot1.shield / 2);
          const s2s = Math.floor(prev.equipmentSlot2.shield / 2);
          addGameLog('event', `事件效果：所有装备栏永久护甲加成减半（左 ${prev.equipmentSlot1.shield}→${s1s}，右 ${prev.equipmentSlot2.shield}→${s2s}）`);
          setHeroSkillBanner(`装备栏永久护甲加成减半！`);
          return {
            ...prev,
            equipmentSlot1: { ...prev.equipmentSlot1, shield: s1s },
            equipmentSlot2: { ...prev.equipmentSlot2, shield: s2s },
          };
        });
      } else if (effect === 'amuletCapacity-1') {
        setMaxAmuletSlots(prev => {
          const next = Math.max(1, prev - 1);
          if (next === prev) {
            addGameLog('event', '护符上限已为最低值');
            setHeroSkillBanner('护符上限已为最低值！');
            return prev;
          }
          addGameLog('event', `事件效果：护符栏上限 -1（当前 ${next}）`);
          setHeroSkillBanner(`护符栏上限降低至 ${next}。`);
          return next;
        });
        const currentAmulets = engine.getState().amuletSlots;
        const newMax = Math.max(1, maxAmuletSlots - 1);
        if (currentAmulets.length > newMax) {
          const overflow = currentAmulets.slice(0, currentAmulets.length - newMax);
          const kept = currentAmulets.slice(currentAmulets.length - newMax);
          overflow.forEach(amulet => depsRef.current.addToGraveyard(amulet));
          setAmuletSlots(kept);
          addGameLog('event', `护符栏缩减，${overflow.map(a => a.name).join('、')} 被送入坟场`);
        }
      } else if (effect === 'persuadeSameTargetCostHalve') {
        setPersuadeSameTargetCostHalve(true);
        addGameLog('event', '事件效果：连续劝降同一怪物，第二次费用减半');
        setHeroSkillBanner('连续劝降同一怪物时，第二次费用减半！');
      } else if (effect.startsWith('persuadeRaceBonus:')) {
        const parts = effect.replace('persuadeRaceBonus:', '').split(':');
        const races = parts[0].split(',');
        const bonus = parseInt(parts[1], 10) || 20;
        setPersuadeRaceBonus(prev => {
          const next = { ...prev };
          races.forEach(race => { next[race] = (next[race] ?? 0) + bonus; });
          return next;
        });
        addGameLog('event', `事件效果：${races.join('、')} 劝降成功率 +${bonus}%`);
        setHeroSkillBanner(`${races.join('、')} 的劝降成功率永久 +${bonus}%！`);
      } else if (effect.startsWith('persuadeSuccessDurabilityBonus+')) {
        const amount = parseInt(effect.replace('persuadeSuccessDurabilityBonus+', ''), 10) || 1;
        setPersuadeSuccessDurabilityBonus(prev => prev + amount);
        addGameLog('event', `事件效果：劝降成功的怪物起始耐久 +${amount}`);
        setHeroSkillBanner(`劝降成功的怪物起始耐久 +${amount}！`);
      } else if (effect === 'upgradePersuadeAmulets') {
        const currentAmulets = engine.getState().amuletSlots;
        let upgraded = false;
        const newAmulets = currentAmulets.map(amulet => {
          if (amulet.amuletEffect === 'persuade-on-temp-attack' && (amulet.upgradeLevel ?? 0) < 1) {
            upgraded = true;
            addGameLog('event', `怀柔之印升级：每获得一次临时攻击加成，下一次劝降率 +10%`);
            setHeroSkillBanner('怀柔之印已升级！劝降率加成从 +5% 提升到 +10%！');
            return {
              ...amulet,
              upgradeLevel: 1,
              description: '（已升级）每获得一次临时攻击加成，下一次劝降率 +10%。',
            };
          }
          if (amulet.amuletEffect === 'persuade-grant-recycle-fetch' && (amulet.upgradeLevel ?? 0) < 1) {
            upgraded = true;
            addGameLog('event', `劝降归袋符升级：每劝降成功一次，将两张「归袋抽引」加入手牌`);
            setHeroSkillBanner('劝降归袋符已升级！每次劝降成功获得 2 张归袋抽引！');
            return {
              ...amulet,
              upgradeLevel: 1,
              description: '（已升级）每劝降成功一次，将两张「归袋抽引」加入手牌（一次性：从回收袋随机 1 张牌加入手牌）。',
            };
          }
          return amulet;
        });
        if (upgraded) {
          setAmuletSlots(newAmulets as typeof currentAmulets);
        }
      } else if (effect.startsWith('stunCap+')) {
        const amount = parseInt(effect.replace('stunCap+', ''), 10) || 10;
        setStunCap(prev => {
          const next = Math.min(100, prev + amount);
          addGameLog('event', `事件效果：击晕上限 +${amount}%`);
          setHeroSkillBanner(`击晕上限提升至 ${next}%。`);
          return next;
        });
      } else if (effect.startsWith('persuadeLevel+')) {
        const amount = parseInt(effect.replace('persuadeLevel+', ''), 10) || 1;
        setPersuadeLevel(prev => {
          const next = Math.min(4, prev + amount);
          if (next === prev) {
            addGameLog('event', '劝降等级已达上限');
            setHeroSkillBanner('劝降等级已达上限！');
            return prev;
          }
          addGameLog('event', `事件效果：劝降等级 +${amount}，当前 Lv.${next}`);
          setHeroSkillBanner(`劝降等级提升至 Lv.${next}。`);
          return next;
        });
      } else if (effect.startsWith('persuadeLevel-')) {
        const amount = parseInt(effect.replace('persuadeLevel-', ''), 10) || 1;
        setPersuadeLevel(prev => {
          const next = Math.max(1, prev - amount);
          addGameLog('event', `事件效果：劝降等级 -${amount}，当前 Lv.${next}`);
          setHeroSkillBanner(`劝降等级降低至 Lv.${next}。`);
          return next;
        });
      } else if (effect.startsWith('shopLevel-')) {
        const amount = parseInt(effect.replace('shopLevel-', ''), 10) || 1;
        setShopLevel(prev => {
          const next = Math.max(0, prev - amount);
          addGameLog('event', `事件效果：商店等级 -${amount}，当前 Lv.${next}`);
          setHeroSkillBanner(`商店等级降低至 Lv.${next}。`);
          return next;
        });
      } else if (effect.startsWith('handLimit-')) {
        const amount = parseInt(effect.replace('handLimit-', ''), 10) || 1;
        setHandLimitBonus(prev => {
          const next = prev - amount;
          addGameLog('event', `事件效果：手牌上限 -${amount}`);
          setHeroSkillBanner(`手牌上限降低至 ${HAND_LIMIT + next}。`);
          return next;
        });
      } else if (effect.startsWith('maxhpperm-')) {
        const amount = parseInt(effect.replace('maxhpperm-', ''), 10) || 0;
        if (amount > 0) {
          setPermanentMaxHpBonus(prev => prev - amount);
          const newMaxHp = maxHp - amount;
          setHp(prev => Math.min(newMaxHp, prev));
          addGameLog('event', `事件效果：最大生命永久 -${amount}`);
          setHeroSkillBanner(`最大生命永久降低 ${amount}。`);
        }
      } else if (effect.startsWith('persuadeCost-')) {
        const amount = parseInt(effect.replace('persuadeCost-', ''), 10) || 0;
        if (amount > 0) {
          setPersuadeCostModifier(prev => prev - amount);
          addGameLog('event', `事件效果：劝降费用永久 -${amount}`);
          setHeroSkillBanner(`劝降费用永久减少 ${amount} 金币。`);
        }
      } else if (effect.startsWith('persuadeNextCostReduction:')) {
        const amount = parseInt(effect.replace('persuadeNextCostReduction:', ''), 10) || 3;
        const existing = depsRef.current.persuadeDiscountRef?.current;
        const currentReduction = existing?.costReduction ?? 0;
        const currentRate = existing?.rateBonus ?? 0;
        const newReduction = currentReduction + amount;
        depsRef.current.persuadeDiscountRef.current = {
          costReduction: newReduction,
          rateBonus: currentRate,
        };
        depsRef.current.setPersuadeTempDiscount(newReduction);
        addGameLog('event', `事件效果：下一次劝降费用 -${amount}`);
        setHeroSkillBanner(`下一次劝降将减免 ${newReduction} 金币！`);
      } else if (effect.startsWith('persuadeNextRatePenalty:')) {
        const amount = parseInt(effect.replace('persuadeNextRatePenalty:', ''), 10) || 10;
        const existing = depsRef.current.persuadeDiscountRef?.current;
        const currentReduction = existing?.costReduction ?? 0;
        const currentRate = existing?.rateBonus ?? 0;
        const newRate = currentRate - amount;
        depsRef.current.persuadeDiscountRef.current = {
          costReduction: currentReduction,
          rateBonus: newRate,
        };
        addGameLog('event', `事件效果：本回合劝降成功率 -${amount}%`);
        setHeroSkillBanner(`本回合劝降成功率降低 ${amount}%！`);
      } else if (effect.startsWith('persuadeNextCostIncrease:')) {
        const amount = parseInt(effect.replace('persuadeNextCostIncrease:', ''), 10) || 10;
        const existing = depsRef.current.persuadeDiscountRef?.current;
        const currentReduction = existing?.costReduction ?? 0;
        const currentRate = existing?.rateBonus ?? 0;
        const newReduction = currentReduction - amount;
        depsRef.current.persuadeDiscountRef.current = {
          costReduction: newReduction,
          rateBonus: currentRate,
        };
        depsRef.current.setPersuadeTempDiscount(newReduction);
        addGameLog('event', `事件效果：下一次劝降费用 +${amount}`);
        setHeroSkillBanner(`下一次劝降将额外花费 ${amount} 金币！`);
      } else if (effect === 'persuadeNextFree') {
        const existing = depsRef.current.persuadeDiscountRef?.current;
        const currentRate = existing?.rateBonus ?? 0;
        depsRef.current.persuadeDiscountRef.current = {
          costReduction: 999,
          rateBonus: currentRate,
        };
        depsRef.current.setPersuadeTempDiscount(999);
        addGameLog('event', '事件效果：下次劝降免费');
        setHeroSkillBanner('下次劝降将不花费金币！');
      } else if (effect.startsWith('allSlotTempAttack:')) {
        const amount = parseInt(effect.replace('allSlotTempAttack:', ''), 10) || 2;
        const slots = depsRef.current.getEquipmentSlots().filter(s => s.item);
        if (slots.length === 0) {
          setHeroSkillBanner('当前没有装备，无法施加临时攻击。');
        } else {
          setSlotTempAttack(prev => {
            const next = { ...prev };
            slots.forEach(s => { next[s.id] = (next[s.id] ?? 0) + amount; });
            return next;
          });
          if (depsRef.current.amuletEffects.hasPersuadeOnTempAttack) {
            const pBonus = depsRef.current.amuletEffects.persuadeOnTempAttackBonus || 5;
            depsRef.current.persuadeAmuletBonusRef.current += pBonus;
            addGameLog('equip', `怀柔之印：下次劝降率 +${pBonus}%（累计 +${depsRef.current.persuadeAmuletBonusRef.current}%）`);
          }
          const names = slots.map(s => s.item!.name).join('、');
          addGameLog('event', `事件效果：所有装备临时攻击 +${amount}`);
          setHeroSkillBanner(`${names} 临时攻击力 +${amount}！`);
        }
      } else if (effect.startsWith('allSlotTempArmor:')) {
        const amount = parseInt(effect.replace('allSlotTempArmor:', ''), 10) || 4;
        const slots = depsRef.current.getEquipmentSlots().filter(s => s.item);
        if (slots.length === 0) {
          setHeroSkillBanner('当前没有装备，无法施加临时护甲。');
        } else {
          setSlotTempArmor(prev => {
            const next = { ...prev };
            slots.forEach(s => { next[s.id] = (next[s.id] ?? 0) + amount; });
            return next;
          });
          const names = slots.map(s => s.item!.name).join('、');
          addGameLog('event', `事件效果：所有装备栏临时护甲 +${amount}`);
          setHeroSkillBanner(`${names} 临时护甲 +${amount}！`);
        }
      } else if (effect === 'slotLeftDefense+2') {
        addGameLog('event', '事件效果：左槽永久护甲 +2');
        depsRef.current.setEquipmentSlotBonus('equipmentSlot1', 'shield', value => value + 2);
        setHeroSkillBanner('左装备栏永久护甲 +2！');
      } else if (effect === 'slotRightDamage+2') {
        addGameLog('event', '事件效果：右槽永久伤害 +2');
        depsRef.current.setEquipmentSlotBonus('equipmentSlot2', 'damage', value => value + 2);
        setHeroSkillBanner('右装备栏永久伤害 +2！');
      } else if (effect.startsWith('deleteCardForGold:')) {
        const parts = effect.replace('deleteCardForGold:', '').split(':');
        const deleteCount = parseInt(parts[0], 10) || 3;
        const goldPerCard = parseInt(parts[1], 10) || 5;
        let deletedCount = 0;
        for (let i = 0; i < deleteCount; i++) {
          const costLabel = goldPerCard < 0 ? `消耗 ${Math.abs(goldPerCard)} 金币` : `获得 ${goldPerCard} 金币`;
          const success = await depsRef.current.requestCardAction('delete', 1, {
            title: `焚毁卡牌 (${i + 1}/${deleteCount})`,
            description: `删除一张卡牌${costLabel}（可跳过剩余）`,
          });
          if (success) {
            deletedCount++;
            setGold(prev => prev + goldPerCard);
          } else {
            break;
          }
        }
        if (deletedCount > 0) {
          const totalGold = deletedCount * goldPerCard;
          if (totalGold >= 0) {
            addGameLog('event', `事件效果：焚毁卡牌获得 ${totalGold} 金币`);
            setHeroSkillBanner(`焚毁了 ${deletedCount} 张卡牌，共获得 ${totalGold} 金币！`);
          } else {
            addGameLog('event', `事件效果：焚毁 ${deletedCount} 张卡牌，消耗 ${Math.abs(totalGold)} 金币`);
            setHeroSkillBanner(`焚毁了 ${deletedCount} 张卡牌，消耗 ${Math.abs(totalGold)} 金币！`);
          }
        }
      } else if (effect.startsWith('discardAllHandForGold:')) {
        const goldPerCard = parseInt(effect.replace('discardAllHandForGold:', ''), 10) || 3;
        const cardCount = handCards.filter(c => c.id !== currentEventCard?.id).length;
        if (cardCount > 0) {
          const totalGold = cardCount * goldPerCard;
          await depsRef.current.discardAllHandCards();
          setGold(prev => prev + totalGold);
          addGameLog('event', `事件效果：弃回 ${cardCount} 张手牌，获得 ${totalGold} 金币`);
          setHeroSkillBanner(`弃回了 ${cardCount} 张手牌，获得 ${totalGold} 金币！`);
        } else {
          setHeroSkillBanner('没有手牌可以弃回。');
        }
      } else if (effect === 'recycleToBackpack') {
        const recycled = engine.getState().permanentMagicRecycleBag;
        if (recycled.length > 0) {
          const cap = Math.max(1, BASE_BACKPACK_CAPACITY + engine.getState().backpackCapacityModifier);
          const currentBp = engine.getState().backpackItems;
          const available = cap - currentBp.length;
          const shuffled = [...recycled].sort(() => Math.random() - 0.5);
          const toAdd = shuffled.slice(0, Math.max(0, available));
          const overflow = shuffled.slice(Math.max(0, available));
          if (toAdd.length > 0) {
            setBackpackItems(prev => [...toAdd, ...prev]);
          }
          setPermanentMagicRecycleBag(overflow);
          addGameLog('event', `事件效果：将 ${toAdd.length} 张卡牌从回收袋洗入背包${overflow.length > 0 ? `（${overflow.length} 张因容量不足留在回收袋）` : ''}`);
          setHeroSkillBanner(`${toAdd.length} 张卡牌从回收袋回到了背包！`);
        } else {
          addGameLog('event', '事件效果：回收袋为空');
          setHeroSkillBanner('回收袋中没有卡牌。');
        }
      } else if (effect === 'recycleBagDiscover') {
        const recycled = engine.getState().permanentMagicRecycleBag;
        if (recycled.length > 0) {
          const shuffled = [...recycled].sort(() => Math.random() - 0.5);
          const picked = shuffled[0];
          setPermanentMagicRecycleBag(prev => prev.filter(c => c.id !== picked.id));
          depsRef.current.addCardToBackpack(picked);
          addGameLog('event', `事件效果：从回收袋发现 ${picked.name}，放入背包`);
          setHeroSkillBanner(`从回收袋获得了 ${picked.name}！`);
        } else {
          addGameLog('event', '事件效果：回收袋为空');
          setHeroSkillBanner('回收袋中没有卡牌。');
        }
      } else if (effect.startsWith('activeRowMonsterAttack-')) {
        const reduction = parseInt(effect.replace('activeRowMonsterAttack-', ''), 10) || 3;
        let modified = 0;
        setActiveCards(prev => {
          return prev.map(card => {
            if (card?.type === 'monster') {
              modified++;
              const newAttack = Math.max(0, (card.attack ?? card.value) - reduction);
              return { ...card, attack: newAttack, value: newAttack };
            }
            return card;
          }) as typeof prev;
        });
        addGameLog('event', `事件效果：激活行所有怪物攻击力 -${reduction}`);
        setHeroSkillBanner(`激活行 ${modified} 个怪物的攻击力降低了 ${reduction}！`);
      } else if (effect === 'flipToEquipSwapPotion') {
        if (currentEventCard) {
          const swapPotion: GameCardData = {
            id: `equip-swap-potion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'potion',
            name: '置换药剂',
            value: 0,
            image: potionWeaponRepairImage,
            description: '使用时选择一个装备回到手牌；若另一栏有装备，则换到该位置。',
            potionEffect: 'equip-swap',
          };
          await depsRef.current.triggerEventTransform(currentEventCard, swapPotion, '残页翻转，置换之力凝结…');
          depsRef.current.skipNextEventAutoDrawRef.current = true;
          depsRef.current.addCardToBackpack(swapPotion);
          addGameLog('event', '事件效果：遗稿翻转成了「置换药剂」');
          setHeroSkillBanner('遗稿翻转成了置换药剂，已放入背包。');
          if (depsRef.current.amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'flipToHandLimitPotion') {
        if (currentEventCard) {
          const hlPotion: GameCardData = {
            id: `hand-limit-potion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'potion',
            name: '扩容药剂',
            value: 0,
            image: potionSpellDamageImage,
            description: '使用时永久手牌上限 +1。',
            potionEffect: 'hand-limit+1',
          };
          await depsRef.current.triggerEventTransform(currentEventCard, hlPotion, '残页翻转，扩容之力涌现…');
          depsRef.current.skipNextEventAutoDrawRef.current = true;
          depsRef.current.addCardToBackpack(hlPotion);
          addGameLog('event', '事件效果：遗稿翻转成了「扩容药剂」');
          setHeroSkillBanner('遗稿翻转成了扩容药剂，已放入背包。');
          if (depsRef.current.amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'flipToClassMagicDiscoverPotion') {
        if (currentEventCard) {
          const musePotion: GameCardData = {
            id: `class-magic-discover-potion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'potion',
            name: '灵思药剂',
            value: 0,
            image: potionSpellDamageImage,
            description: '使用时从专属牌堆三选一发现一张魔法牌（魔法/英雄魔法）。',
            potionEffect: 'discover-class-magic',
          };
          await depsRef.current.triggerEventTransform(currentEventCard, musePotion, '残页翻转，灵思渗入药剂…');
          depsRef.current.skipNextEventAutoDrawRef.current = true;
          depsRef.current.addCardToBackpack(musePotion);
          addGameLog('event', '事件效果：遗稿翻转成了「灵思药剂」');
          setHeroSkillBanner('遗稿翻转成了灵思药剂，已放入背包。');
          if (depsRef.current.amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'flipToDiscardDrawMagic') {
        if (currentEventCard) {
          const discardDrawCard: GameCardData = {
            id: `discard-draw-magic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'magic',
            name: '回响残页',
            value: 0,
            image: skillScrollImage,
            magicType: 'permanent',
            magicEffect: 'on-discard-draw-2',
            description: '永久魔法：被弃回时，从背包抽 2 张牌。',
            onDiscardDraw: 2,
            recycleDelay: 1,
          };
          await depsRef.current.triggerEventTransform(currentEventCard, discardDrawCard, '残页翻转，回响之力涌出…');
          depsRef.current.skipNextEventAutoDrawRef.current = true;
          depsRef.current.addCardToBackpack(discardDrawCard);
          addGameLog('event', '事件效果：遗稿翻转成了「回响残页」');
          setHeroSkillBanner('遗稿翻转成了回响残页，已放入背包。');
          if (depsRef.current.amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'flipToUpgradeScroll') {
        if (currentEventCard) {
          const upgradeScroll: GameCardData = {
            id: `upgrade-scroll-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'magic',
            name: '升级卷轴',
            value: 0,
            image: starterScrollUpgradeImage,
            magicType: 'instant',
            magicEffect: '即时魔法：升级一张牌。',
            description: '一次性使用，选择一张牌进行升级。',
          };
          await depsRef.current.triggerEventTransform(currentEventCard, upgradeScroll, '遗稿翻转为升级卷轴…');
          depsRef.current.skipNextEventAutoDrawRef.current = true;
          depsRef.current.addCardToBackpack(upgradeScroll);
          addGameLog('event', '事件效果：遗稿翻转成了「升级卷轴」');
          setHeroSkillBanner('遗稿翻转成了升级卷轴，已放入背包。');
          if (depsRef.current.amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect.startsWith('discardCards:')) {
        const discardCount = parseInt(effect.replace('discardCards:', ''), 10) || 1;
        const success = await depsRef.current.requestCardAction('discard-recycle', discardCount, {
          title: `弃回 ${discardCount} 张卡牌`,
          description: '从手牌、装备栏或护符栏中选择要弃回的卡牌。',
        });
        if (!success) {
          setHeroSkillBanner('没有足够的卡牌可供弃回。');
          break;
        }
      } else if (effect.startsWith('randomDiscardHand:')) {
        const count = parseInt(effect.replace('randomDiscardHand:', ''), 10) || 1;
        const currentHand = handCards.filter(c => c.id !== currentEventCard?.id);
        const toDiscardCount = Math.min(count, currentHand.length);
        const cardsToDiscard = pickRandomHandCardsForDiscardPreferGraveyard(currentHand, toDiscardCount);
        const flights = cardsToDiscard.map(dc => ({
          card: dc,
          promise: depsRef.current.triggerDiscardFlight(dc, depsRef.current.isRecyclableFromHand(dc) ? 'recycle-bag' : 'graveyard'),
        }));
        const discardIds = new Set(cardsToDiscard.map(c => c.id));
        depsRef.current.handCardsRef.current = depsRef.current.handCardsRef.current.filter(c => !discardIds.has(c.id));
        setHandCards(depsRef.current.handCardsRef.current);
        await Promise.all(flights.map(f => f.promise));
        const sorted = [...flights].sort((a, b) => (a.card.onDiscardDraw ? 1 : 0) - (b.card.onDiscardDraw ? 1 : 0));
        sorted.forEach(f => depsRef.current.discardCardToGraveyard(f.card, { owner: 'player' }));
        const discardedNames = cardsToDiscard.map(c => c.name);
        if (discardedNames.length > 0) {
          addGameLog('event', `随机弃回手牌：${discardedNames.join('、')}`);
          setHeroSkillBanner(`随机弃回了 ${discardedNames.join('、')}。`);
        }
      } else if (effect.startsWith('deleteCard')) {
        const [, countText] = effect.split(':');
        const deleteCount = countText ? parseInt(countText, 10) : 1;
        const success = await depsRef.current.requestCardAction('delete', deleteCount, {
          title: `删除 ${deleteCount} 张卡牌`,
          description: '被删除的卡牌会被送入坟场，永久离开你的牌库。',
        });
        if (!success) {
          setHeroSkillBanner('没有足够的卡牌可供删除。');
          break;
        }
      } else if (effect === 'graveyardDiscover') {
        const selected = await depsRef.current.requestGraveyardSelection(3);
        if (selected) {
          addGameLog('event', `事件效果：从坟场召回 ${selected.name}`);
          setHeroSkillBanner(`你从坟场带回了 ${selected.name}。`);
        } else {
          setHeroSkillBanner('坟场中没有可召回的卡牌。');
        }
      } else if (effect.startsWith('drawHeroCards:')) {
        const drawCount = parseInt(effect.replace('drawHeroCards:', ''), 10) || 1;
        const drawn = depsRef.current.drawCardsFromBackpack(drawCount);
        if (drawn > 0) {
          addGameLog('event', `事件效果：从背包抽 ${drawn} 张牌`);
          setHeroSkillBanner(`从背包抽到了 ${drawn} 张牌。`);
        } else {
          setHeroSkillBanner('背包为空或手牌已满，无法抽牌。');
        }
      } else if (effect === 'removeAllAmulets') {
        if (amuletSlots.length) {
          const reversal = computeAmuletAuraReversal(amuletSlots);
          if (reversal.tempAttackDelta.equipmentSlot1 !== 0 || reversal.tempAttackDelta.equipmentSlot2 !== 0) {
            setSlotTempAttack(prev => ({
              equipmentSlot1: (prev.equipmentSlot1 ?? 0) + reversal.tempAttackDelta.equipmentSlot1,
              equipmentSlot2: (prev.equipmentSlot2 ?? 0) + reversal.tempAttackDelta.equipmentSlot2,
            }));
          }
          if (reversal.tempArmorDelta.equipmentSlot1 !== 0 || reversal.tempArmorDelta.equipmentSlot2 !== 0) {
            setSlotTempArmor(prev => ({
              equipmentSlot1: (prev.equipmentSlot1 ?? 0) + reversal.tempArmorDelta.equipmentSlot1,
              equipmentSlot2: (prev.equipmentSlot2 ?? 0) + reversal.tempArmorDelta.equipmentSlot2,
            }));
          }
          addGameLog('event', `事件效果：粉碎 ${amuletSlots.length} 枚护符`);
          amuletSlots.forEach(amulet => depsRef.current.addToGraveyard(amulet));
          setAmuletSlots([]);
          setHeroSkillBanner('所有护符都被粉碎了。');
        } else {
          setHeroSkillBanner('你没有佩戴护符。');
        }
      } else if (effect === 'destroyEquipment:any') {
        const slotsWithItems = depsRef.current.getEquipmentSlots().filter(slot => slot.item);
        if (!slotsWithItems.length) {
          addGameLog('event', '事件效果：无装备可破坏');
          continue;
        }
        let destroyedItem: EquipmentItem | null = null;
        let destroyedSlotId: EquipmentSlotId | null = null;
        if (slotsWithItems.length === 1) {
          destroyedItem = slotsWithItems[0].item!;
          destroyedSlotId = slotsWithItems[0].id;
          addGameLog('event', `事件效果：破坏装备「${destroyedItem.name}」`);
          depsRef.current.sacrificeEquipment(destroyedSlotId);
        } else {
          const selected = await requestEquipmentSelection({
            prompt: '选择要破坏的装备',
            subtext: '左或右装备栏至少保留一件。',
          });
          if (selected) {
            destroyedItem = (selected === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2) as EquipmentItem | null;
            destroyedSlotId = selected;
            addGameLog('event', `事件效果：破坏装备「${destroyedItem?.name ?? '未知'}」`);
            depsRef.current.sacrificeEquipment(selected);
          }
        }
        if (destroyedItem && destroyedSlotId) {
          const hasLastWords = destroyedItem.onDestroyHeal || destroyedItem.onDestroyGold || destroyedItem.onDestroyDraw
            || destroyedItem.onDestroyClassDraw || destroyedItem.onDestroyPermanentDamage || destroyedItem.onDestroyPermanentShield || destroyedItem.onDestroyEffect;
          if (hasLastWords) {
            addGameLog('equip', `${destroyedItem.name} 遗言触发！`);
          }
          if (destroyedItem.onDestroyHeal) {
            depsRef.current.healHero(destroyedItem.onDestroyHeal);
            addGameLog('equip', `${destroyedItem.name} 遗言：恢复了 ${destroyedItem.onDestroyHeal} 点生命`);
          }
          if (destroyedItem.onDestroyGold) {
            setGold(prev => prev + destroyedItem.onDestroyGold!);
            addGameLog('equip', `${destroyedItem.name} 遗言：获得了 ${destroyedItem.onDestroyGold} 金币`);
          }
          if (destroyedItem.onDestroyDraw) {
            for (let di = 0; di < destroyedItem.onDestroyDraw; di++) depsRef.current.drawFromBackpackToHand();
            addGameLog('equip', `${destroyedItem.name} 遗言：抽取了 ${destroyedItem.onDestroyDraw} 张牌`);
          }
          if (destroyedItem.onDestroyClassDraw) {
            const classDrawn = depsRef.current.drawClassCardsToBackpack(destroyedItem.onDestroyClassDraw, `${destroyedItem.name}-遗言`);
            if (classDrawn.length > 0) {
              depsRef.current.triggerClassDeckFlight(classDrawn);
              addGameLog('equip', `${destroyedItem.name} 遗言：获得专属卡「${classDrawn.map(c => c.name).join('、')}」`);
            }
          }
          if (destroyedItem.onDestroyPermanentDamage) {
            depsRef.current.setEquipmentSlotBonus(destroyedSlotId, 'damage', cur => cur + destroyedItem.onDestroyPermanentDamage!);
            addGameLog('equip', `${destroyedItem.name} 遗言：该装备栏永久伤害 +${destroyedItem.onDestroyPermanentDamage}！`);
          }
          if (destroyedItem.onDestroyPermanentShield) {
            depsRef.current.setEquipmentSlotBonus(destroyedSlotId, 'shield', cur => cur + destroyedItem.onDestroyPermanentShield!);
            addGameLog('equip', `${destroyedItem.name} 遗言：该装备栏永久护甲 +${destroyedItem.onDestroyPermanentShield}！`);
          }
          if (destroyedItem.onDestroyEffect) {
            if (destroyedItem.onDestroyEffect === 'hand-equip-buff-2-2') {
              setHandCards(prev => {
                const buffed: string[] = [];
                const next = prev.map(c => {
                  if (c.type === 'weapon' || c.type === 'shield') {
                    buffed.push(c.name);
                    return { ...c, value: (c.value ?? 0) + 2, armorMax: c.armorMax != null ? c.armorMax + 2 : undefined };
                  }
                  return c;
                });
                if (buffed.length > 0) {
                  addGameLog('equip', `${destroyedItem.name} 遗言：${buffed.join('、')} 获得 +2攻击 +2护甲！`);
                  setHeroSkillBanner(`${destroyedItem.name} 遗言！手牌装备 +2攻击 +2护甲！`);
                }
                return next;
              });
            } else {
              addGameLog('equip', `${destroyedItem.name} 遗言：${destroyedItem.onDestroyEffect}`);
            }
          }
        }
      } else if (effect === 'slotLeftDamage+2') {
        addGameLog('event', '事件效果：左槽永久伤害 +2');
        depsRef.current.setEquipmentSlotBonus('equipmentSlot1', 'damage', value => value + 2);
      } else if (effect === 'slotRightDefense+2') {
        addGameLog('event', '事件效果：右槽永久护甲 +2');
        depsRef.current.setEquipmentSlotBonus('equipmentSlot2', 'shield', value => value + 2);
      } else if (effect === 'allSlotDamage-1') {
        depsRef.current.setEquipmentSlotBonus('equipmentSlot1', 'damage', value => value - 1);
        depsRef.current.setEquipmentSlotBonus('equipmentSlot2', 'damage', value => value - 1);
        addGameLog('event', '事件效果：所有装备栏永久攻击 -1');
        setHeroSkillBanner('所有装备栏永久攻击 -1！');
      } else if (effect === 'allSlotShield-1') {
        depsRef.current.setEquipmentSlotBonus('equipmentSlot1', 'shield', value => value - 1);
        depsRef.current.setEquipmentSlotBonus('equipmentSlot2', 'shield', value => value - 1);
        addGameLog('event', '事件效果：所有装备栏永久护甲 -1');
        setHeroSkillBanner('所有装备栏永久护甲 -1！');
      } else if (effect === 'flipToRecallEquip') {
        if (currentEventCard) {
          const recallCard: GameCardData = {
            id: `${STARTER_CARD_IDS.recallEquip}-pick-${Date.now()}`,
            type: 'magic',
            name: '回收术',
            value: 0,
            image: starterScrollRecallImage,
            magicType: 'permanent',
            magicEffect: '永久魔法：回手一张牌，抽 1 张牌。',
            description: '回手一张牌（从装备栏或护符栏选择），然后抽 1 张牌。',
          };
          await depsRef.current.triggerEventTransform(currentEventCard, recallCard, '血咒仪式翻转为回收术…');
          depsRef.current.skipNextEventAutoDrawRef.current = true;
          depsRef.current.addCardToBackpack(recallCard);
          addGameLog('event', '事件效果：血咒仪式翻转成了「回收术」');
          setHeroSkillBanner('血咒仪式翻转成了回收术，已放入背包。');
          if (depsRef.current.amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'flipToUndyingBlessing') {
        if (currentEventCard) {
          const blessingCard: GameCardData = {
            id: `${STARTER_CARD_IDS.undyingBlessing}-pick-${Date.now()}`,
            type: 'magic',
            name: '不灭赐福',
            value: 0,
            image: starterScrollReviveImage,
            magicType: 'permanent',
            magicEffect: '永久魔法：选择一个装备，赋予其复生（首次毁坏时以 1 耐久复生）。',
            description: '赋予装备复生能力。已复生的装备可再次赋予。',
            recycleDelay: 2,
          };
          await depsRef.current.triggerEventTransform(currentEventCard, blessingCard, '血咒仪式翻转为不灭赐福…');
          depsRef.current.skipNextEventAutoDrawRef.current = true;
          depsRef.current.addCardToBackpack(blessingCard);
          addGameLog('event', '事件效果：血咒仪式翻转成了「不灭赐福」');
          setHeroSkillBanner('血咒仪式翻转成了不灭赐福，已放入背包。');
          if (depsRef.current.amuletEffects.hasFlipGold) {
            setGold(prev => prev + FLIP_GOLD_REWARD);
            addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
          }
        }
      } else if (effect === 'swapEquipmentSlots') {
        addGameLog('event', '事件效果：交换左右装备槽');
        depsRef.current.swapEquipmentSlots();
      } else if (effect === 'slotLeftDurMax+1' || effect === 'slotRightDurMax+1') {
        const slotId: EquipmentSlotId = effect === 'slotLeftDurMax+1' ? 'equipmentSlot1' : 'equipmentSlot2';
        const label = effect === 'slotLeftDurMax+1' ? '左' : '右';
        const item = slotId === 'equipmentSlot1' ? engine.getState().equipmentSlot1 : engine.getState().equipmentSlot2;
        if (item && item.durability != null) {
          const maxDur = item.maxDurability ?? item.durability ?? 0;
          depsRef.current.setEquipmentSlotById(slotId, { ...item, maxDurability: maxDur + 1 });
          addGameLog('event', `事件效果：${item.name} 耐久上限 +1（${maxDur} → ${maxDur + 1}）`);
          setHeroSkillBanner(`${item.name} 耐久上限 +1！`);
        } else {
          setHeroSkillBanner(`${label}装备栏没有装备或不具有耐久属性。`);
        }
      } else if (effect === 'slotLeftExtraAttack' || effect === 'slotRightExtraAttack') {
        const targetSlot: EquipmentSlotId = effect === 'slotLeftExtraAttack' ? 'equipmentSlot1' : 'equipmentSlot2';
        const otherSlot: EquipmentSlotId = effect === 'slotLeftExtraAttack' ? 'equipmentSlot2' : 'equipmentSlot1';
        const label = effect === 'slotLeftExtraAttack' ? '左' : '右';
        const item = targetSlot === 'equipmentSlot1' ? engine.getState().equipmentSlot1 : engine.getState().equipmentSlot2;
        if (item && (item.type === 'weapon' || item.type === 'monster')) {
          setGambitExtraActive(true);
          setGambitExtraPerSlot(prev => prev + 1);
          setGambitSlotUsed(prev => ({
            ...prev,
            [otherSlot]: (prev[otherSlot] ?? 0) + 1,
          }));
          addGameLog('event', `事件效果：${label}装备栏本回合攻击次数 +1`);
          setHeroSkillBanner(`${item.name} 本回合可多攻击一次！`);
        } else {
          setHeroSkillBanner(`${label}装备栏没有可攻击的武器。`);
        }
      } else if (effect === 'discardHandEquipForClassEquip') {
        const hand = engine.getState().handCards;
        const equipInHand = hand.filter(c => c.type === 'weapon' || c.type === 'shield');
        if (equipInHand.length === 0) {
          addGameLog('event', '事件效果：手牌中没有装备卡');
          setHeroSkillBanner('手牌中没有装备卡可弃置。');
        } else {
          const equipIds = new Set(equipInHand.map(c => c.id));
          setHandCards(prev => prev.filter(c => !equipIds.has(c.id)));
          for (const card of equipInHand) {
            depsRef.current.discardCardToGraveyard(card, { owner: 'player' });
          }
          const drawn = depsRef.current.drawClassCardsToBackpack(
            equipInHand.length,
            'discardHandEquipForClassEquip',
            (card: GameCardData) => card.type === 'weapon' || card.type === 'shield',
          );
          if (drawn.length > 0) {
            depsRef.current.triggerClassDeckFlight(drawn);
          }
          addGameLog('event', `事件效果：弃置 ${equipInHand.length} 张手牌装备，获得 ${drawn.length} 张专属装备`);
          setHeroSkillBanner(`弃置了 ${equipInHand.map(c => c.name).join('、')}，获得 ${drawn.length} 张专属装备！`);
        }
      } else if (effect.startsWith('grantFlankDraw:')) {
        const drawCount = parseInt(effect.replace('grantFlankDraw:', ''), 10) || 1;
        const eligible = handCards.filter(c => !c.flankEffect);
        if (eligible.length === 0) {
          setHeroSkillBanner('手牌中没有可赋予侧击效果的卡牌。');
        } else {
          setPermGrantModal({ sourceCardId: 'event-grant', sourceType: 'flank-grant' });
          addGameLog('event', `事件效果：选择一张手牌赋予「侧击：抽${drawCount}张牌」`);
        }
      } else if (effect === 'grantAmuletPerm') {
        const amulets = engine.getState().amuletSlots as GameCardData[];
        const eligible = amulets.filter(a => !a.recycleDelay || a.recycleDelay < 2);
        if (eligible.length === 0) {
          setHeroSkillBanner('没有可赋予 Perm 2 的护符。');
        } else {
          const target = eligible[0];
          setAmuletSlots(prev => prev.map(a => a.id === target.id ? { ...a, recycleDelay: 2 } : a));
          addGameLog('event', `事件效果：「${target.name}」获得 Perm 2`);
          setHeroSkillBanner(`「${target.name}」获得 Perm 2！被移除后将经 2 次瀑流返回背包。`);
        }
      } else if (effect.startsWith('grantTransformGold:')) {
        const goldAmount = parseInt(effect.replace('grantTransformGold:', ''), 10) || 3;
        const eligible = handCards.filter(c => !c.transformBonus);
        if (eligible.length === 0) {
          setHeroSkillBanner('手牌中没有可赋予转型效果的卡牌。');
        } else {
          setPermGrantModal({ sourceCardId: 'event-grant', sourceType: 'transform-gold-grant' });
          addGameLog('event', `事件效果：选择一张手牌赋予「转型：+${goldAmount}金币」`);
        }
      } else if (effect === 'noop') {
        // Intentional no-op; effect is handled via flipTarget
      } else if (effect.startsWith('repairSlot:')) {
        const parts = effect.split(':');
        const target = parts[1];
        const amount = parseInt(parts[2], 10) || 1;
        const repairOne = (slotId: EquipmentSlotId) => {
          const item = slotId === 'equipmentSlot1' ? engine.getState().equipmentSlot1 : engine.getState().equipmentSlot2;
          if (item && item.durability != null && item.maxDurability != null && item.durability < item.maxDurability) {
            depsRef.current.setEquipmentSlotById(slotId, {
              ...item,
              durability: Math.min(item.maxDurability, item.durability + amount),
            });
            addGameLog('event', `事件效果：${item.name} 恢复 ${amount} 点耐久`);
            return true;
          }
          return false;
        };
        if (target === 'left') {
          if (!repairOne('equipmentSlot1')) {
            setHeroSkillBanner('左装备栏为空或耐久已满。');
          }
        } else if (target === 'right') {
          if (!repairOne('equipmentSlot2')) {
            setHeroSkillBanner('右装备栏为空或耐久已满。');
          }
        } else if (target === 'both') {
          const l = repairOne('equipmentSlot1');
          const r = repairOne('equipmentSlot2');
          if (!l && !r) {
            setHeroSkillBanner('没有装备需要恢复耐久。');
          }
        }
      } else if (effect === 'discardAllLeftForGold+10') {
        const count = depsRef.current.sacrificeAllEquipment('equipmentSlot1');
        if (count > 0) {
          const totalGold = count * 10;
          setGold(prev => prev + totalGold);
          addGameLog('event', `事件效果：献祭所有左槽装备（${count} 件）获得 ${totalGold} 金币`);
          setHeroSkillBanner(`献祭了 ${count} 件左手装备，共获得 ${totalGold} 金币！`);
        }
      } else if (effect === 'discardAllRightForGold+10') {
        const count = depsRef.current.sacrificeAllEquipment('equipmentSlot2');
        if (count > 0) {
          const totalGold = count * 10;
          setGold(prev => prev + totalGold);
          addGameLog('event', `事件效果：献祭所有右槽装备（${count} 件）获得 ${totalGold} 金币`);
          setHeroSkillBanner(`献祭了 ${count} 件右手装备，共获得 ${totalGold} 金币！`);
        }
      } else if (effect === 'discardCurrentLeftForGold+15') {
        if (depsRef.current.sacrificeEquipment('equipmentSlot1')) {
          addGameLog('event', '事件效果：献祭当前左槽装备获得 15 金币');
          setGold(prev => prev + 15);
          setHeroSkillBanner('献祭了当前左手装备，获得 15 金币！');
        }
      } else if (effect === 'discardCurrentRightForGold+15') {
        if (depsRef.current.sacrificeEquipment('equipmentSlot2')) {
          addGameLog('event', '事件效果：献祭当前右槽装备获得 15 金币');
          setGold(prev => prev + 15);
          setHeroSkillBanner('献祭了当前右手装备，获得 15 金币！');
        }
      } else if (effect === 'amuletsToGold+10') {
        addGameLog('event', '事件效果：护符转化为金币');
        depsRef.current.convertAmuletsToGold(10);
      } else if (effect.startsWith('returnToHand:')) {
        const returnCount = parseInt(effect.replace('returnToHand:', ''), 10) || 1;
        for (let ri = 0; ri < returnCount; ri++) {
          type SlotOption = { id: string; label: string; description: string; slotType: 'equipment' | 'amulet'; slotId?: EquipmentSlotId };
          const options: SlotOption[] = [];
          if (equipmentSlot1) {
            const item = equipmentSlot1;
            const typeLabel = item.type === 'weapon' ? `${item.value}攻` : item.type === 'shield' ? `${item.value}防` : `${item.value}`;
            const durLabel = typeof item.durability === 'number' && typeof item.maxDurability === 'number' ? `，耐久 ${item.durability}/${item.maxDurability}` : '';
            options.push({
              id: 'equipmentSlot1',
              label: `左装备栏 — ${item.name}`,
              description: `${typeLabel}${durLabel}`,
              slotType: 'equipment',
              slotId: 'equipmentSlot1',
            });
          }
          if (equipmentSlot2) {
            const item = equipmentSlot2;
            const typeLabel = item.type === 'weapon' ? `${item.value}攻` : item.type === 'shield' ? `${item.value}防` : `${item.value}`;
            const durLabel = typeof item.durability === 'number' && typeof item.maxDurability === 'number' ? `，耐久 ${item.durability}/${item.maxDurability}` : '';
            options.push({
              id: 'equipmentSlot2',
              label: `右装备栏 — ${item.name}`,
              description: `${typeLabel}${durLabel}`,
              slotType: 'equipment',
              slotId: 'equipmentSlot2',
            });
          }
          if (amuletSlots.length > 0) {
            const topAmulet = amuletSlots[amuletSlots.length - 1];
            options.push({
              id: 'amulet',
              label: `护符栏 — ${topAmulet.name}`,
              description: `最上层护符`,
              slotType: 'amulet',
            });
          }
          if (options.length === 0) {
            addGameLog('event', '事件效果：回手 — 没有可回收的装备或护符');
            setHeroSkillBanner('没有可回收的装备或护符。');
            break;
          }
          let chosen: SlotOption;
          if (options.length === 1) {
            chosen = options[0];
          } else {
            const choiceId = await requestMagicChoice({
              title: '回手',
              subtitle: '选择一个位置，将最上面的装备/护符回收到手牌',
              options: options.map(o => ({ id: o.id, label: o.label, description: o.description })),
            });
            chosen = options.find(o => o.id === choiceId) ?? options[0];
          }
          if (chosen.slotType === 'equipment' && chosen.slotId) {
            const slotItem = chosen.slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
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
              addGameLog('event', `事件效果：回手 — ${slotItem.name} 从${chosen.slotId === 'equipmentSlot1' ? '左' : '右'}装备栏回到手牌`);
              setHeroSkillBanner(`${slotItem.name} 已回到手牌！`);
            }
          } else if (chosen.slotType === 'amulet') {
            const topAmulet = amuletSlots[amuletSlots.length - 1];
            if (topAmulet) {
              setAmuletSlots(prev => prev.slice(0, -1));
              const { fromSlot: _, ...handItem } = topAmulet as GameCardData & { fromSlot?: string };
              depsRef.current.queueCardIntoHand(handItem as GameCardData, 'amulet');
              addGameLog('event', `事件效果：回手 — 护符「${topAmulet.name}」回到手牌`);
              setHeroSkillBanner(`${topAmulet.name} 已回到手牌！`);
            }
          }
        }
      } else if (effect.startsWith('classBottom+')) {
        const count = parseInt(effect.replace('classBottom+', ''), 10) || 2;
        addGameLog('event', `事件效果：职业牌组底 ${count} 张入包`);
        gainClassDeckBottomCards(count);
      } else if (effect === 'drawKnight3') {
        const drawn = depsRef.current.drawClassCardsToBackpack(3, 'drawKnight3');
        addGameLog('event', `事件效果：抽取 ${drawn.length} 张职业牌`);
        depsRef.current.triggerClassDeckFlight(drawn);
      } else if (effect === 'equipKnight') {
        const equipmentCards = classDeck.filter(c => c.type === 'weapon' || c.type === 'shield');
        if (equipmentCards.length > 0) {
          const equipment = equipmentCards[Math.floor(Math.random() * equipmentCards.length)];
          addGameLog('event', `事件效果：随机装备 ${equipment.name}`);
          if (!equipmentSlot1) {
            setEquipmentSlot1({ ...equipment } as EquipmentItem);
          } else if (!equipmentSlot2) {
            setEquipmentSlot2({ ...equipment } as EquipmentItem);
          }
          setClassDeck(prev => prev.filter(c => c.id !== equipment.id));
        }
      } else if (effect === 'useKnightSkill') {
        const skillCards = classDeck.filter(c => c.type === 'skill' && c.skillType === 'instant');
        if (skillCards.length > 0) {
          const skill = skillCards[Math.floor(Math.random() * skillCards.length)];
          addGameLog('event', `事件效果：打出技能 ${skill.name}`);
          setClassDeck(prev => prev.filter(c => c.id !== skill.id));
          depsRef.current.handleSkillCard(skill);
        }
      } else if (effect === 'weaponUpgrade' || effect === 'weaponUpgrade2') {
        const upgradAmount = effect === 'weaponUpgrade2' ? 2 : 2;
        addGameLog('event', `事件效果：武器攻击力 +${upgradAmount}`);
        if (equipmentSlot1?.type === 'weapon') {
          setEquipmentSlot1(prev => (prev ? { ...prev, value: prev.value + upgradAmount } : null));
        } else if (equipmentSlot2?.type === 'weapon') {
          setEquipmentSlot2(prev => (prev ? { ...prev, value: prev.value + upgradAmount } : null));
        }
      } else if (effect === 'shieldUpgrade2') {
        addGameLog('event', '事件效果：盾牌防御力 +2');
        if (equipmentSlot1?.type === 'shield') {
          setEquipmentSlot1(prev => {
            if (!prev) return null;
            const newArmorMax = (prev.armorMax ?? prev.value) + 2;
            const { armor: _, armorBonusDamaged: _bd, ...rest } = prev;
            return { ...rest, value: prev.value + 2, armorMax: newArmorMax };
          });
        } else if (equipmentSlot2?.type === 'shield') {
          setEquipmentSlot2(prev => {
            if (!prev) return null;
            const newArmorMax = (prev.armorMax ?? prev.value) + 2;
            const { armor: _, armorBonusDamaged: _bd, ...rest } = prev;
            return { ...rest, value: prev.value + 2, armorMax: newArmorMax };
          });
        }
      } else if (effect === 'restoreShield') {
        const shields = discardedCards.filter(c => c.type === 'shield');
        if (shields.length > 0) {
          const shield = shields[shields.length - 1];
          const { armor: _omitArmor, armorBonusDamaged: _omitBonusDmg, ...shieldRest } = shield;
          const restoredShield: EquipmentItem = {
            ...shieldRest,
            type: 'shield',
            durability: 3,
            maxDurability: 3,
            armorMax: shield.armorMax ?? shield.value,
          };
          if (!equipmentSlot1) {
            setEquipmentSlot1(restoredShield);
            addGameLog('event', `事件效果：从坟场恢复盾牌「${shield.name}」并装备至左槽`);
          } else if (!equipmentSlot2) {
            setEquipmentSlot2(restoredShield);
            addGameLog('event', `事件效果：从坟场恢复盾牌「${shield.name}」并装备至右槽`);
          } else {
            addGameLog('event', '事件效果：没有空槽位，无法恢复盾牌');
          }
          setDiscardedCards(prev => prev.filter(c => c.id !== shield.id));
        } else {
          addGameLog('event', '事件效果：坟场没有盾牌可恢复');
        }
      } else if (effect.startsWith('tempShield+')) {
        const shieldGain = parseInt(effect.replace('tempShield+', ''), 10);
        addGameLog('event', `事件效果：临时护盾 +${shieldGain}`);
        setTempShield(prev => prev + shieldGain);
      } else if (effect === 'bloodEmpower') {
        const empoweredSlot = findWeaponSlot();
        if (empoweredSlot?.item) {
          const empoweredWeapon: EquipmentItem = {
            ...empoweredSlot.item,
            value: empoweredSlot.item.value + 2,
          };
          addGameLog('event', `事件效果：${empoweredSlot.item.name} 攻击 +2`);
          depsRef.current.setEquipmentSlotById(empoweredSlot.id, empoweredWeapon);
        } else {
          addGameLog('event', '事件效果：无武器，获得 5 金币');
          setGold(prev => prev + 5);
        }
      } else if (effect === 'draw2') {
        const drawn = depsRef.current.drawClassCardsToBackpack(2, 'draw2');
        addGameLog('event', `事件效果：抽取 ${drawn.length} 张职业牌`);
        depsRef.current.triggerClassDeckFlight(drawn);
      } else if (effect === 'drawClass2') {
        const drawn = depsRef.current.drawClassCardsToBackpack(2, 'drawClass2');
        addGameLog('event', `事件效果：抽取 ${drawn.length} 张职业牌`);
        depsRef.current.triggerClassDeckFlight(drawn);
      } else if (effect.startsWith('drawClassToHand:')) {
        const count = parseInt(effect.replace('drawClassToHand:', ''), 10) || 2;
        if (classDeck.length === 0) {
          addGameLog('event', '事件效果：专属牌堆已空');
          setHeroSkillBanner('专属牌堆已空，无法抽取。');
        } else {
          const drawCount = Math.min(count, classDeck.length);
          const shuffled = [...classDeck].sort(() => Math.random() - 0.5);
          const drawn = shuffled.slice(0, drawCount);
          const drawnIds = new Set(drawn.map(c => c.id));
          setClassDeck(prev => prev.filter(c => !drawnIds.has(c.id)));
          drawn.forEach(card => depsRef.current.queueCardIntoHand(card));
          addGameLog('event', `事件效果：${drawn.length} 张专属牌直接加入手牌`);
          setHeroSkillBanner(`获得了 ${drawn.map(c => c.name).join('、')}！`);
        }
      } else if (effect === 'drawKnight1') {
        const drawn = depsRef.current.drawClassCardsToBackpack(1, 'drawKnight1');
        addGameLog('event', `事件效果：抽取 ${drawn.length} 张职业牌`);
        depsRef.current.triggerClassDeckFlight(drawn);
      } else if (effect === 'drawKnight4') {
        const drawn = depsRef.current.drawClassCardsToBackpack(4, 'drawKnight4');
        addGameLog('event', `事件效果：抽取 ${drawn.length} 张职业牌`);
        depsRef.current.triggerClassDeckFlight(drawn);
      } else if (effect === 'drawSkill') {
        const drawn = depsRef.current.drawClassCardsToBackpack(1, 'drawSkill', card => card.type === 'skill');
        addGameLog('event', `事件效果：抽取技能牌 ${drawn.length} 张`);
        depsRef.current.triggerClassDeckFlight(drawn);
      } else if (effect === 'drawEquipment') {
        const drawn = depsRef.current.drawClassCardsToBackpack(
          2,
          'drawEquipment',
          card => card.type === 'weapon' || card.type === 'shield',
        );
        addGameLog('event', `事件效果：抽取装备牌 ${drawn.length} 张`);
        depsRef.current.triggerClassDeckFlight(drawn);
      } else if (effect === 'discoverClass') {
        addGameLog('event', '事件效果：发现职业牌');
        const started = depsRef.current.beginDiscoverFlow(effect);
        if (started) {
          eventResolutionDeferred = true;
          break;
        } else {
          depsRef.current.handleDiscoverFallback();
        }
      } else if (effect === 'discoverClassWeapon') {
        addGameLog('event', '事件效果：发现专属武器');
        const started = depsRef.current.beginDiscoverFlow(effect, {
          filter: (card: GameCardData) => card.type === 'weapon',
        });
        if (started) {
          eventResolutionDeferred = true;
          break;
        } else {
          depsRef.current.handleDiscoverFallback();
        }
      } else if (effect === 'discoverClassMagic') {
        addGameLog('event', '事件效果：发现专属魔法牌');
        const started = depsRef.current.beginDiscoverFlow(effect, {
          filter: (card: GameCardData) => card.type === 'magic' || card.type === 'hero-magic',
        });
        if (started) {
          eventResolutionDeferred = true;
          break;
        } else {
          depsRef.current.handleDiscoverFallback();
        }
      } else if (effect === 'drawClassHeroMagic:2') {
        const drawn = depsRef.current.drawClassCardsToBackpack(2, 'drawClassHeroMagic', (card: GameCardData) => card.type === 'hero-magic');
        if (drawn.length > 0) {
          addGameLog('event', `事件效果：获得 ${drawn.length} 张英雄魔法`);
          depsRef.current.triggerClassDeckFlight(drawn);
          setHeroSkillBanner(`获得了 ${drawn.length} 张英雄魔法卡！`);
        } else {
          const fallback = depsRef.current.drawClassCardsToBackpack(2, 'drawClassHeroMagic-fallback');
          if (fallback.length > 0) {
            addGameLog('event', `事件效果：专属牌堆没有英雄魔法，改为获得 ${fallback.length} 张专属牌`);
            depsRef.current.triggerClassDeckFlight(fallback);
          }
          setHeroSkillBanner(drawn.length > 0 ? '获得了英雄魔法卡！' : '专属牌堆中没有英雄魔法卡。');
        }
      } else if (effect === 'discoverStarterMagic') {
        addGameLog('event', '事件效果：发现起始背包的魔法卡');
        const { createStarterCardPool } = await import('@/game-core/deck');
        const pool = createStarterCardPool();
        const magicCards = pool.filter(c => c.type === 'magic');
        const shuffled = [...magicCards].sort(() => Math.random() - 0.5);
        const tempCards = shuffled.slice(0, 3).map(c => ({
          ...c,
          id: `${c.id}-disc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }));
        if (tempCards.length > 0) {
          const started = depsRef.current.beginDiscoverFlow(effect, {
            overridePool: tempCards,
          });
          if (started) {
            eventResolutionDeferred = true;
            break;
          }
        }
        setHeroSkillBanner('没有可用的起始魔法卡。');
      } else if (effect === 'graveyardDiscoverMagic') {
        addGameLog('event', '事件效果：发现坟场的魔法卡');
        const selected = await depsRef.current.requestGraveyardSelection(3, {
          filter: (card: GameCardData) => card.type === 'magic' || card.type === 'hero-magic',
        });
        if (selected) {
          addGameLog('event', `事件效果：从坟场获得魔法卡 ${selected.name}`);
        } else {
          setHeroSkillBanner('坟场中没有魔法卡。');
        }
      } else if (effect === 'recycleBagMagicToHand:2') {
        const recycled = engine.getState().permanentMagicRecycleBag;
        const magicInBag = recycled.filter(c => c.type === 'magic' || c.type === 'hero-magic');
        if (magicInBag.length > 0) {
          const toMove = magicInBag.slice(0, 2);
          const movedIds = new Set(toMove.map(c => c.id));
          setPermanentMagicRecycleBag(prev => prev.filter(c => !movedIds.has(c.id)));
          for (const mc of toMove) {
            depsRef.current.queueCardIntoHand(mc);
          }
          addGameLog('event', `事件效果：从回收袋取回 ${toMove.length} 张魔法卡到手牌`);
          setHeroSkillBanner(`从回收袋取回了 ${toMove.map(c => c.name).join('、')}！`);
        } else {
          addGameLog('event', '事件效果：回收袋中没有魔法卡');
          setHeroSkillBanner('回收袋中没有魔法卡。');
        }
      } else if (effect === 'openShop') {
        addGameLog('shop', '事件效果：开启商店');
        const started = depsRef.current.startShopFlow(currentEventCard);
        if (started) {
          eventResolutionDeferred = true;
          break;
        }
      } else if (effect === 'upgradeCard') {
        addGameLog('event', '事件效果：选择一张牌升级');
        setUpgradeModalOpen(true);
        setHeroSkillBanner('选择一张牌进行升级。');
      } else if (effect === 'repairAll') {
        addGameLog('event', '事件效果：全部装备耐久回满');
        const slots = depsRef.current.getEquipmentSlots();
        slots.forEach(slot => {
          if (slot.item) {
            const repaired = { 
              ...slot.item, 
              durability: slot.item.maxDurability || 3,
              maxDurability: slot.item.maxDurability || 3,
            };
            depsRef.current.setEquipmentSlotById(slot.id, repaired);
          }
        });
      } else if (effect === 'repairAllDurability+1') {
        addGameLog('event', '事件效果：所有装备耐久 +1');
        const repairSlots = depsRef.current.getEquipmentSlots();
        let repaired = 0;
        repairSlots.forEach(slot => {
          if (slot.item && slot.item.durability != null && slot.item.maxDurability != null) {
            if (slot.item.durability < slot.item.maxDurability) {
              depsRef.current.setEquipmentSlotById(slot.id, {
                ...slot.item,
                durability: Math.min(slot.item.maxDurability, slot.item.durability + 1),
              });
              repaired++;
            }
          }
        });
        setHeroSkillBanner(repaired > 0 ? `所有装备耐久 +1。` : '没有装备需要修复。');
      } else if (effect === 'destroyAllEquipment') {
        addGameLog('event', '事件效果：摧毁所有装备');
        const destroySlots = depsRef.current.getEquipmentSlots();
        let destroyed = 0;
        const triggerItemLastWords = (item: GameCardData, sid: EquipmentSlotId) => {
          if (item.onDestroyHeal) {
            depsRef.current.healHero(item.onDestroyHeal);
            addGameLog('equip', `${item.name} 遗言：恢复了 ${item.onDestroyHeal} 点生命`);
          }
          if (item.onDestroyGold) {
            setGold(prev => prev + item.onDestroyGold!);
            addGameLog('equip', `${item.name} 遗言：获得了 ${item.onDestroyGold} 金币`);
          }
          if (item.onDestroyDraw) {
            for (let di = 0; di < item.onDestroyDraw; di++) depsRef.current.drawFromBackpackToHand();
            addGameLog('equip', `${item.name} 遗言：抽取了 ${item.onDestroyDraw} 张牌`);
          }
          if (item.onDestroyClassDraw) {
            const classDrawn = depsRef.current.drawClassCardsToBackpack(item.onDestroyClassDraw, `${item.name}-遗言`);
            if (classDrawn.length > 0) {
              depsRef.current.triggerClassDeckFlight(classDrawn);
              addGameLog('equip', `${item.name} 遗言：获得专属卡「${classDrawn.map(c => c.name).join('、')}」`);
            }
          }
          if (item.onDestroyPermanentDamage) {
            depsRef.current.setEquipmentSlotBonus(sid, 'damage', cur => cur + item.onDestroyPermanentDamage!);
            addGameLog('equip', `${item.name} 遗言：该装备栏永久伤害 +${item.onDestroyPermanentDamage}！`);
          }
          if (item.onDestroyPermanentShield) {
            depsRef.current.setEquipmentSlotBonus(sid, 'shield', cur => cur + item.onDestroyPermanentShield!);
            addGameLog('equip', `${item.name} 遗言：该装备栏永久护甲 +${item.onDestroyPermanentShield}！`);
          }
          if (item.onDestroyEffect) {
            if (item.onDestroyEffect === 'hand-equip-buff-2-2') {
              setHandCards(prev => {
                const buffed: string[] = [];
                const next = prev.map(c => {
                  if (c.type === 'weapon' || c.type === 'shield') {
                    buffed.push(c.name);
                    return { ...c, value: (c.value ?? 0) + 2, armorMax: c.armorMax != null ? c.armorMax + 2 : undefined };
                  }
                  return c;
                });
                if (buffed.length > 0) {
                  addGameLog('equip', `${item.name} 遗言：${buffed.join('、')} 获得 +2攻击 +2护甲！`);
                }
                return next;
              });
            } else {
              addGameLog('equip', `${item.name} 遗言：${item.onDestroyEffect}`);
            }
          }
        };
        destroySlots.forEach(slot => {
          const reserve = depsRef.current.getEquipmentReserve(slot.id);
          reserve.forEach(r => {
            triggerItemLastWords(r, slot.id);
            depsRef.current.disposeOwnedEquipmentCard(r, { isDestruction: true });
          });
          depsRef.current.setEquipmentReserve(slot.id, []);
          if (slot.item) {
            triggerItemLastWords(slot.item, slot.id);
            depsRef.current.disposeOwnedEquipmentCard(slot.item, { isDestruction: true });
            depsRef.current.clearEquipmentSlotById(slot.id);
            destroyed++;
          }
          destroyed += reserve.length;
        });
        if (destroyed > 0) {
          setHeroSkillBanner('所有装备都被摧毁了！');
        } else {
          setHeroSkillBanner('你没有装备可以被摧毁。');
        }
      } else if (effect === 'flipBackToGraveyardRecall') {
        const newCard = createGraveyardRecallCard();
        depsRef.current.addCardToBackpack(newCard);
        addGameLog('event', '事件效果：翻转回原始法术「冥途拾遗」');
        setHeroSkillBanner('卷轴翻转回了「冥途拾遗」，已放入背包。');
      } else if (effect === 'vault-flipback') {
        const eventCardSnapshot = currentEventCard;
        const cellIdx = activeCards.findIndex(c => c?.id === eventCardSnapshot.id);

        setEventModalOpen(false);
        setEventModalMinimized(false);
        setCurrentEventCard(null);
        finalizeEventResolution({ removeFromDungeon: false });

        const damage = 3;
        setHp(prev => Math.max(0, prev - damage));
        depsRef.current.addHeroMagicGauge('holy-light', 1);
        depsRef.current.addHeroMagicGauge('revive-blessing', 1);
        addGameLog('event', `秘藏宝库深入探索：受到 ${damage} 点伤害`);

        const flipBack = eventCardSnapshot._flipBackCard;

        if (cellIdx !== -1 && flipBack) {
          setActiveCards(prev => {
            const next = [...prev];
            next[cellIdx] = { ...flipBack };
            return next;
          });
          addGameLog('event', '秘藏宝库翻转回未开启状态');
        }

        setTurnCount(prev => prev + 1);
        addGameLog('event', '瀑流计数 +1');
        if (depsRef.current.bulwarkTempArmorRef.current > 0) {
          const pL = gs.slotTempArmor.equipmentSlot1 ?? 0;
          const pR = gs.slotTempArmor.equipmentSlot2 ?? 0;
          setSlotTempArmor({ equipmentSlot1: 0, equipmentSlot2: 0 });
        }

        setHeroSkillBanner(`深入探索！受到 ${damage} 点伤害，瀑流计数 +1！`);
        eventResolutionDeferred = true;
        break;
      } else if (effect === 'fate-dice-strike') {
        const eventCardSnapshot = currentEventCard;
        const resId = depsRef.current.eventResolutionRef.current?.cardId;
        const cellIdx = resId
          ? activeCards.findIndex(c => c?.id === resId)
          : activeCards.findIndex(c => c?.id === eventCardSnapshot.id);
        const rightIdx = cellIdx >= 0 ? cellIdx + 1 : -1;
        const rightCard = rightIdx >= 0 && rightIdx < DUNGEON_COLUMN_COUNT ? activeCards[rightIdx] : null;
        const isPerm =
          eventCardSnapshot.type === 'building' || eventCardSnapshot.isPermanentEvent;

        setEventModalOpen(false);
        setEventModalMinimized(false);
        setCurrentEventCard(null);
        finalizeEventResolution({ removeFromDungeon: false });

        if (
          rightCard &&
          (rightCard.type === 'potion' ||
            rightCard.type === 'weapon' ||
            rightCard.type === 'shield' ||
            rightCard.type === 'event' ||
            rightCard.type === 'building')
        ) {
          addGameLog('event', `命运之刃破坏了 ${rightCard.name}`);
          depsRef.current.removeCard(rightCard.id, true);
          setHeroSkillBanner(`命运之刃破坏了 ${rightCard.name}！`);
          if (!isPerm) {
            const flipBack = eventCardSnapshot._flipBackCard;
            if (cellIdx !== -1 && flipBack) {
              const restored = { ...flipBack };
              setActiveCards(prev => {
                const next = [...prev];
                next[cellIdx] = restored;
                return next;
              });
              addGameLog('event', '命运之刃翻转回命运骰盅');
            } else if (cellIdx !== -1) {
              depsRef.current.removeCard(eventCardSnapshot.id, true);
            }
          }
        } else if (rightCard && rightCard.type === 'monster') {
          if (!depsRef.current.isMonsterEngaged(rightCard.id)) {
            depsRef.current.beginCombat(rightCard, 'hero');
          }
          const layersBefore = rightCard.currentLayer ?? rightCard.fury ?? 1;
          let updatedMonster = depsRef.current.damageMonsterWithLayerOverflow(rightCard, rightCard.hp ?? 0);
          depsRef.current.recordClassDamageDiscoverHit();
          if ((updatedMonster.currentLayer ?? 0) > 0) {
            updatedMonster = depsRef.current.damageMonsterWithLayerOverflow(updatedMonster, updatedMonster.hp ?? 0);
            depsRef.current.recordClassDamageDiscoverHit();
          }
          const defeatedByBlade =
            (updatedMonster.currentLayer ?? 0) <= 0 || (updatedMonster.hp ?? 0) <= 0;
          const layersAfter = updatedMonster.currentLayer ?? 0;
          const layersStripped = Math.max(0, layersBefore - layersAfter);

          if (rightCard.bossRetaliationDamage && rightCard.bossRetaliationDamage > 0 && !rightCard.isStunned) {
            const retDmg = rightCard.bossRetaliationDamage;
            setHp(prev => {
              const newHp = Math.max(0, prev - retDmg);
              if (newHp === 0) {
                addGameLog('system', '英雄阵亡，游戏结束');
                setGameOver(true);
                setVictory(false);
              }
              return newHp;
            });
            depsRef.current.addHeroMagicGauge('holy-light', 1);
            depsRef.current.addHeroMagicGauge('revive-blessing', 1);
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
            setHeroSkillBanner(`命运之刃击杀了 ${rightCard.name}！`);
          } else {
            depsRef.current.updateMonsterCard(rightCard.id, () => updatedMonster);
            if (layersAfter < layersBefore) {
              depsRef.current.heroTurnLayerLossIdsRef.current.add(rightCard.id);
            }
            if (rightCard.bleedEffect && layersAfter < layersBefore && !rightCard.isStunned) {
              const newAttack = updatedMonster.attack ?? updatedMonster.value;
              const perLayer = parseInt((rightCard.bleedEffect ?? '').replace('attack+', ''), 10) || 0;
              addGameLog(
                'combat',
                `${rightCard.name} 触发流血：攻击力+${perLayer * (layersBefore - layersAfter)}，当前 ${newAttack}！`,
              );
              setHeroSkillBanner(`${rightCard.name} 流血！攻击力升至 ${newAttack}！`);
            }
            if (rightCard.dragonBleedDestroy && layersAfter < layersBefore && layersAfter > 0 && !rightCard.isStunned) {
              depsRef.current.dragonBleedDestroyEquipment(rightCard.name, layersAfter);
            }
            if (rightCard.monsterSpecial === 'bone-regen' && !rightCard.isStunned) {
              void depsRef.current.checkHollowSkeletonRestore(rightCard.id, rightCard.name, layersBefore, layersAfter);
            }
            if (rightCard.monsterSpecial === 'wraith-rebirth' && !rightCard.isStunned) {
              void depsRef.current.checkWraithRebirth(
                rightCard.id,
                rightCard.name,
                rightCard.fury ?? rightCard.hpLayers ?? 1,
                layersBefore,
                layersAfter,
              );
            }
            addGameLog(
              'event',
              `命运之刃对 ${rightCard.name} 打掉 ${layersStripped} 层血（共 2 层穿透结算，可一次击杀）！`,
            );
            setHeroSkillBanner(`命运之刃对 ${rightCard.name} 打掉 ${layersStripped} 层血！`);
          }
          if (!isPerm && cellIdx !== -1) {
            depsRef.current.removeCard(eventCardSnapshot.id, true);
          }
        } else {
          const drawnNames: string[] = [];
          for (let i = 0; i < 2; i++) {
            const drawn = depsRef.current.drawFromBackpackToHand();
            if (drawn) drawnNames.push(drawn.name);
          }
          if (drawnNames.length > 0) {
            addGameLog('event', `命运之刃：右侧无牌，从背包抽取了 ${drawnNames.join('、')}`);
            setHeroSkillBanner(`右侧无牌，命运之刃抽取了 ${drawnNames.join('、')}。`);
          } else {
            addGameLog('event', '命运之刃：右侧无牌且背包为空');
            setHeroSkillBanner('右侧没有卡牌，背包也没有牌可以抽取。');
          }
          if (!isPerm && cellIdx !== -1) {
            depsRef.current.removeCard(eventCardSnapshot.id, true);
          }
        }

        if (isPerm && cellIdx !== -1) {
          setActiveCards(prev => {
            const next = [...prev] as typeof prev;
            const card = next[cellIdx];
            if (card?.name === '命运之刃' && (card.type === 'building' || card.isPermanentEvent)) {
              next[cellIdx] = { ...card, hasReleaseCharge: false };
            }
            return next;
          });
        }

        eventResolutionDeferred = true;
      }
    }
    
    if (eventResolutionDeferred) {
      depsRef.current.eventChoiceProcessingRef.current = false;
      return;
    }

    if (currentEventCard?.name === '战血荣誉' && resolvingDungeonCardId) {
      const cellIdx = activeCards.findIndex(c => c?.id === resolvingDungeonCardId);
      if (cellIdx !== -1 && cellIdx < activeCards.length - 1) {
        const rightMonsters: GameCardData[] = [];
        for (let i = cellIdx + 1; i < activeCards.length; i++) {
          const card = activeCards[i];
          if (card && card.type === 'monster') {
            rightMonsters.push(card);
          }
        }
        if (rightMonsters.length > 0) {
          rightMonsters.forEach(monster => {
            if (!depsRef.current.isMonsterEngaged(monster.id)) {
              depsRef.current.beginCombat(monster, 'hero');
            }
          });
          const names = rightMonsters.map(m => m.name).join('、');
          addGameLog('event', `战血荣誉激怒了右侧的怪物：${names}`);
          setHeroSkillBanner(`战血荣誉激怒了 ${names}！`);
        }
      }
    }

    if (choice.skipFlip && currentEventCard?.flipTarget) {
      skipEventFlipRef.current = true;
    }

    await completeCurrentEvent();
    depsRef.current.eventChoiceProcessingRef.current = false;
  };

  // ---------------------------------------------------------------------------
  // Return bag
  // ---------------------------------------------------------------------------

  return {
    startEventResolution,
    processPendingAutoDraws,
    enqueueAutoDraw,
    registerDungeonCardProcessed,
    requestDiceOutcome,
    handleDiceRollResult,
    cancelDiceModal,
    requestMagicChoice,
    handleMagicChoice,
    requestEquipmentSelection,
    handleEquipmentPromptSelection,
    cancelEquipmentPrompt,
    evaluateChoiceRequirements,
    eventChoiceStates,
    gainClassDeckBottomCards,
    finalizeEventResolution,
    completeCurrentEvent,
    handleEventChoice,
  };
}
