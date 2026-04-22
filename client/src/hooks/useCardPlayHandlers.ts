import React, { useCallback } from 'react';
import { useGameEngine, useGameState, useDispatch, useGameEvent } from '@/hooks/useGameEngine';
import type { GameCardData, EventEffectExpression, HeroMagicId } from '@/components/GameCard';
import { cardHasPermFlag } from '@/components/GameCard';
import type { LogEntryType } from '@/components/GameLogPanel';
import type {
  ActiveAmuletEffects,
  ActiveRowSlots,
  BackpackHandFlight,
  EquipmentItem,
  EquipmentRepairTarget,
  EquipmentSlotId,
  FlightSourceHint,
  PendingMagicAction,
  PendingPotionAction,
  SlotPermanentBonus,
} from '@/components/game-board/types';
import type { KnightCardData } from '@/lib/knightDeck';
import type { HeroSkillId } from '@/lib/heroSkills';
import type { EternalRelicId } from '@/game-core/types';
import type { EventDiceRange } from '@/components/GameCard';
import type { HeroMagicRuntimeState } from '@/lib/heroMagic';
import type { MagicChoiceModalState } from '@/components/MagicChoiceModal';
import {
  HAND_LIMIT,
} from '@/game-core/constants';
import {
  flattenActiveRowSlots,
  isDamageableTarget,
  getCardPlayCategory,
} from '@/game-core/helpers';
import { chaosStrikeHasOverkill } from '@/game-core/combat';
import type { MirrorCopySelection, AmplifySelection } from '@/game-core/types';

// ---------------------------------------------------------------------------
// Deps: external dependencies injected by GameBoard
// ---------------------------------------------------------------------------

export interface CardPlayHandlersDeps {
  // --- Functions from useCardOperations (Layer 0) ---
  addToGraveyard: (card: GameCardData) => void;
  discardCardToGraveyard: (
    card: GameCardData | null | undefined,
    options?: { owner?: 'player' | 'dungeon'; forceGraveyard?: boolean; forceRecycleBag?: boolean },
  ) => void;
  addCardToBackpack: (
    card: GameCardData,
    options?: { toBottom?: boolean; pendingDungeonCardId?: string },
  ) => void;
  addPermanentMagicToRecycleBag: (card: GameCardData) => void;
  restorePermanentMagicFromRecycleBag: () => void;
  ensureCardInHand: (card: GameCardData) => void;
  drawFromBackpackToHand: () => void;
  takeRandomCardsFromBackpack: (count: number) => void;
  drawClassCardsToBackpack: (
    count: number,
    source: string,
    opts?: { excludeIds?: string[]; includeIds?: string[]; filter?: 'hero-magic' | 'weapon' | 'shield' | 'equipment' },
  ) => void;
  getEquipmentSlots: () => { id: EquipmentSlotId; item: EquipmentItem | null }[];
  calculateSlotArmorValue: (slotId: EquipmentSlotId) => number;
  setEquipmentSlotBonus: (
    slotId: EquipmentSlotId,
    bonusType: keyof SlotPermanentBonus,
    value: number | ((current: number) => number),
  ) => void;
  getEquipmentSlotBonus: (slotId: EquipmentSlotId, bonusType: keyof SlotPermanentBonus) => number;
  setEquipmentSlotById: (id: EquipmentSlotId, item: EquipmentItem | null) => void;
  clearEquipmentSlotById: (id: EquipmentSlotId) => void;
  clearEquipmentSlotWithPromote: (id: EquipmentSlotId) => void;
  getEquipmentReserve: (id: EquipmentSlotId) => EquipmentItem[];
  setEquipmentReserve: (id: EquipmentSlotId, items: EquipmentItem[]) => void;
  isRecyclableFromHand: (card: GameCardData | null | undefined) => boolean;
  tickRecycleForge: () => void;
  applyDiscardSideEffects: (
    card: GameCardData,
    owner: 'player' | 'dungeon',
    opts?: { toRecycleBag?: boolean; isEquipmentDisplace?: boolean },
  ) => void;
  triggerEventTransform: (fromCard: GameCardData, toCard: GameCardData, message?: string) => Promise<void>;
  applyCardFlip: (card: GameCardData, cellIndex?: number) => boolean;
  enforceBackpackCapacity: () => void;
  amuletEffects: ActiveAmuletEffects;
  backpackCapacity: number;
  effectiveHandLimit: number;
  consumeClassCardFromHand: (cardId: string) => void;

  // --- Functions from useCombatActions (Layer 1) ---
  healHero: (amount: number) => number;
  applyDamage: (damage: number) => void;
  beginCombat: (monster: GameCardData, initiator: 'hero' | 'monster') => void;
  dealDamageToMonster: (monster: GameCardData, damage: number, options?: { animationDelay?: number; pulses?: number; isSpellDamage?: boolean }) => void;
  updateMonsterCard: (id: string, updater: (m: GameCardData) => GameCardData) => void;
  isMonsterEngaged: (monsterId: string) => boolean;
  addBerserkTurnBuff: (amount: number) => void;

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
  beginDiscoverFlow: (
    source: string,
    options?: { filter?: (card: GameCardData) => boolean; sourceLabel?: string; overridePool?: GameCardData[]; delivery?: 'backpack' | 'hand-first' },
  ) => boolean;
  startShopFlow: (sourceCard: GameCardData | null) => boolean;
  discoverPotionCompletionRef: React.MutableRefObject<((payload: { banner: string }) => void) | null>;
  getAttackBonus: () => number;
  applyHonorSweepMagic: (card: GameCardData, slotId: EquipmentSlotId) => void;
  applyWeaponSweepMagic: (card: GameCardData, slotId: EquipmentSlotId) => void;
  generateShopOfferings: () => any[];
  queueMonsterReward: (monster: GameCardData) => void;

  // --- Animation / UI callbacks from GameBoard ---
  addGameLog: (type: LogEntryType, message: string) => void;
  pushUndoSnapshot: () => void;
  clearUndoStack: () => void;
  removeCard: (cardId: string, animate: boolean, opts?: { skipAutoDraw?: boolean }) => void;
  removePendingDungeonCard: (cardId: string) => boolean;
  queueCardIntoHand: (card: GameCardData, sourceHint?: FlightSourceHint) => void;
  triggerDiscardFlight: (
    card: GameCardData,
    destination: 'graveyard' | 'recycle-bag',
    sourceHint?: FlightSourceHint,
  ) => Promise<void>;
  triggerClassDeckFlight: (cards: GameCardData[]) => void;
  triggerGraveNova: (graveNovaCard?: GameCardData) => void;
  triggerGraveyardToBackpackFlight: (cards: GameCardData[]) => void;
  queueWaterfallTimeout: (callback: () => void, delay: number, label?: string) => void;
  consumeCardFromHand: (card: GameCardData | string) => boolean;

  // --- Async helpers ---
  requestDiceOutcome: (config: {
    title: string;
    subtitle?: string;
    entries: EventDiceRange[];
    flowContext?: Record<string, unknown>;
    predeterminedRoll?: number;
  }) => Promise<EventDiceRange | null>;
  requestMagicChoice: (config: {
    title: string;
    subtitle?: string;
    options: Array<{ id: string; label: string; description: string }>;
  }) => Promise<string>;
  requestEquipmentSelection: (config: {
    prompt: string;
    subtext?: string;
  }) => Promise<EquipmentSlotId | null>;

  // --- Hand magic upgrade ---
  openHandMagicUpgradeModal: (sourceCardId: string) => void;
  openMirrorCopyModal: (sourceCardId: string) => void;

  // --- Deck peek modal ---
  setDeckPeekState: React.Dispatch<React.SetStateAction<import('@/components/game-board/types').DeckPeekModalState | null>>;
  deckJudgePeekCloseRef: React.MutableRefObject<(() => void) | null>;

  // --- Staging / chain resolution ---
  stagingCardsRef: React.MutableRefObject<GameCardData[]>;
  drainPendingDiscardEffects: () => void;

  // --- Refs ---
  handCardsRef: React.MutableRefObject<GameCardData[]>;
  backpackHandFlightsRef: React.MutableRefObject<BackpackHandFlight[]>;
  discardedCardsRef: React.MutableRefObject<GameCardData[]>;
  activeCardsLatestRef: React.MutableRefObject<ActiveRowSlots>;
  echoRemainingRef: React.MutableRefObject<number>;
  echoTotalRef: React.MutableRefObject<number>;
  graveyardDiscoverResolverRef: React.MutableRefObject<((card: GameCardData | null) => void) | null>;
  graveyardDiscoverDeliveryRef: React.MutableRefObject<'backpack' | 'hand-first'>;
  fullBoardInteractionLockedRef: React.MutableRefObject<boolean>;
  handLockedForMonsterPhaseRef: React.MutableRefObject<boolean>;
  setPersuadeTempDiscount: React.Dispatch<React.SetStateAction<number>>;
  completeCurrentEvent: () => void;
  lastPlayedFlankRef: React.MutableRefObject<boolean>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCardPlayHandlers(depsRef: React.MutableRefObject<CardPlayHandlersDeps>) {
  const engine = useGameEngine();
  const dispatch = useDispatch();
  const gs = useGameState(s => s);

  const {
    equipmentSlot1,
    equipmentSlot2,
    permanentSpellDamageBonus,
    stunCap,
  } = gs;

  // -- Convenience accessors -------------------------------------------------

  const addGameLog = (type: LogEntryType, message: string) =>
    depsRef.current.addGameLog(type, message);

  // -- Spell damage ----------------------------------------------------------

  const getSpellDamage = useCallback(
    (baseDamage: number) => Math.max(0, baseDamage + permanentSpellDamageBonus),
    [permanentSpellDamageBonus],
  );

  // -- Internal helpers -------------------------------------------------------

  const isPermanentMagicCard = (
    card: GameCardData | null | undefined,
  ): card is GameCardData => Boolean(card && card.type === 'magic' && card.magicType === 'permanent');

  const normalizeEventEffect = (expression?: EventEffectExpression): string[] => {
    if (!expression) return [];
    const raw = Array.isArray(expression) ? expression : expression.split(',');
    return raw.map(token => token.trim()).filter(token => token.length > 0);
  };

  const getRepairableEquipmentSlots = (
    allowedTypes: EquipmentRepairTarget[] = ['weapon', 'shield', 'monster'],
  ): EquipmentSlotId[] => {
    const slots: EquipmentSlotId[] = [];
    (['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]).forEach(slotId => {
      const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (!slotItem) return;
      if (!slotItem.type || !allowedTypes.includes(slotItem.type)) return;
      const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
      if (maxDurability <= 0) return;
      const currentDurability = slotItem.durability ?? maxDurability;
      if (currentDurability < maxDurability) slots.push(slotId);
    });
    return slots;
  };

  const drawCardsFromBackpack = (count: number, options?: { ignoreLimit?: boolean }) => {
    if (count <= 0) return 0;
    let drawLimit = count;
    if (!options?.ignoreLimit) {
      const liveHandSize = depsRef.current.handCardsRef.current.length;
      const liveHandLimit = HAND_LIMIT + (engine.getState().handLimitBonus ?? 0);
      const availableHandSlots = Math.max(0, liveHandLimit - (liveHandSize + depsRef.current.backpackHandFlightsRef.current.length));
      if (availableHandSlots <= 0) return 0;
      drawLimit = Math.min(count, availableHandSlots);
    }
    depsRef.current.takeRandomCardsFromBackpack(drawLimit);
    return drawLimit;
  };

  // ---------------------------------------------------------------------------
  // Thin dispatchers — all game logic lives in the reducer
  // ---------------------------------------------------------------------------

  const finalizeMagicCard = useCallback(
    (card: GameCardData, options?: { banner?: string; dealtDamage?: boolean }) => {
      dispatch({
        type: 'FINALIZE_MAGIC_CARD',
        card,
        dealtDamage: options?.dealtDamage,
        banner: options?.banner,
      });
    },
    [dispatch],
  );

  const finalizePotionCard = useCallback(
    async (card: GameCardData, options?: { banner?: string }) => {
      dispatch({
        type: 'FINALIZE_POTION_CARD',
        card,
        banner: options?.banner,
      });
    },
    [dispatch],
  );

  const resolvePotionRepairForSlot = useCallback(
    (
      slotId: EquipmentSlotId,
      card: GameCardData,
      amount: number,
      _allowedTypes: EquipmentRepairTarget[],
    ): boolean => {
      dispatch({ type: 'RESOLVE_POTION_REPAIR', card, slotId, amount });
      return true;
    },
    [dispatch],
  );

  const resolveMirrorCopy = useCallback(
    (selection: MirrorCopySelection) => {
      dispatch({ type: 'RESOLVE_MIRROR_COPY', selection });
    },
    [dispatch],
  );

  const cancelMirrorCopy = useCallback(() => {
    dispatch({ type: 'CANCEL_MIRROR_COPY' });
  }, [dispatch]);

  const resolveAmplify = useCallback(
    (selection: AmplifySelection) => {
      dispatch({ type: 'RESOLVE_AMPLIFY', selection });
    },
    [dispatch],
  );

  const cancelAmplify = useCallback(() => {
    dispatch({ type: 'CANCEL_AMPLIFY' });
  }, [dispatch]);

  const resolvePermGrant = useCallback(
    (targetCardId: string) => {
      dispatch({ type: 'RESOLVE_PERM_GRANT', targetCardId });
    },
    [dispatch],
  );

  const cancelPermGrant = useCallback(() => {
    dispatch({ type: 'CANCEL_PERM_GRANT' });
  }, [dispatch]);

  function handleHeroMagicCard(card: GameCardData) {
    dispatch({ type: 'PROCESS_HERO_MAGIC_CARD', card });
  }

  const applyBerserkerRageEffect = useCallback(
    (origin: 'gauge' | 'card') => {
      dispatch({ type: 'APPLY_BERSERKER_RAGE', origin });
    },
    [dispatch],
  );

  const triggerGraveNova = useCallback((graveNovaCard?: GameCardData) => {
    dispatch({ type: 'TRIGGER_GRAVE_NOVA', card: graveNovaCard });
  }, [dispatch]);

  const resolveFateSight = (card: GameCardData, target: GameCardData, baseDmg: number, peekCount: number) => {
    dispatch({
      type: 'RESOLVE_FATE_SIGHT',
      card,
      targetMonsterId: target.id,
      baseDmg,
      peekCount,
    });
  };

  const resolveStatSwap = (card: GameCardData, target: GameCardData, isFlank: boolean) => {
    dispatch({
      type: 'RESOLVE_STAT_SWAP',
      card,
      targetMonsterId: target.id,
      isFlank,
    });
  };

  const resolveRepairEnrageDice = async (card: GameCardData, slotId: EquipmentSlotId, monster: GameCardData) => {
    dispatch({ type: 'ROLL_DICE_FOR_FLOW' });
    const repairEnragePredeterminedRoll = engine.getState().lastFlowDiceRoll ?? undefined;
    const diceResult = await depsRef.current.requestDiceOutcome({
      title: '锻造赌运',
      subtitle: '掷骰决定命运',
      entries: [
        { id: 'repair', range: [1, 16] as [number, number], label: '修复成功！装备 +1 耐久', effect: 'none' },
        { id: 'enrage', range: [17, 20] as [number, number], label: '失败！怪物 -1 血层并激怒', effect: 'none' },
      ],
      predeterminedRoll: repairEnragePredeterminedRoll,
    } as any);
    if (!diceResult) {
      dispatch({ type: 'FINALIZE_MAGIC_CARD', card, banner: '锻造赌运已取消。' });
      return;
    }
    dispatch({
      type: 'RESOLVE_REPAIR_ENRAGE_DICE',
      card,
      slotId,
      monsterId: monster.id,
      diceResultId: diceResult.id as 'repair' | 'enrage',
    });
  };

  const resolveDeckJudgeDelete = async (card: KnightCardData) => {
    dispatch({ type: 'RESOLVE_DECK_JUDGE', card: card as GameCardData });
  };

  // -- Hero magic helpers (thin dispatchers to reducer) ----------------------

  const updateHeroMagicStateById = useCallback(
    (id: HeroMagicId, updater: (state: HeroMagicRuntimeState) => HeroMagicRuntimeState) => {
      const current = engine.getState().heroMagicState[id] ?? { id, unlocked: false, gauge: 0, usedThisWave: false };
      const next = updater(current);
      if (next === current) return;
      dispatch({ type: 'UPDATE_HERO_MAGIC_ENTRY', magicId: id, entry: next });
    },
    [engine, dispatch],
  );

  const unlockHeroMagic = useCallback(
    (id: HeroMagicId) => {
      updateHeroMagicStateById(id, current =>
        current.unlocked ? current : { ...current, unlocked: true, gauge: 0, usedThisWave: false },
      );
    },
    [updateHeroMagicStateById],
  );

  const resetHeroMagicGauge = useCallback(
    (id: HeroMagicId) => {
      updateHeroMagicStateById(id, current => current.gauge === 0 ? current : { ...current, gauge: 0 });
    },
    [updateHeroMagicStateById],
  );

  const setHeroMagicUsedThisWave = useCallback(
    (id: HeroMagicId, used: boolean) => {
      updateHeroMagicStateById(id, current => current.usedThisWave === used ? current : { ...current, usedThisWave: used });
    },
    [updateHeroMagicStateById],
  );

  const completeHeroMagicActivation = useCallback(
    (id: HeroMagicId, origin: 'gauge' | 'card') => {
      resetHeroMagicGauge(id);
      if (origin === 'gauge') setHeroMagicUsedThisWave(id, true);
    },
    [resetHeroMagicGauge, setHeroMagicUsedThisWave],
  );

  // -- Equipment repair helper ------------------------------------------------

  const repairEquipmentDurability = useCallback(
    async (amount: number, allowedTypes: EquipmentRepairTarget[]): Promise<boolean> => {
      const repairableSlots = getRepairableEquipmentSlots(allowedTypes);
      if (!repairableSlots.length) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '当前没有需要修复的装备。' });
        return false;
      }
      let targetSlot: EquipmentSlotId | null = repairableSlots.length === 1 ? repairableSlots[0] : null;
      if (!targetSlot) {
        const { formatRepairTargetLabel } = await import('@/game-core/helpers');
        targetSlot = await depsRef.current.requestEquipmentSelection({
          prompt: `选择一个${formatRepairTargetLabel(allowedTypes)}恢复${amount}点耐久`,
          subtext: '只能选择已损耗耐久的装备。',
        });
      }
      if (!targetSlot || !repairableSlots.includes(targetSlot)) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '请选择要修复的装备。' });
        return false;
      }
      const slotItem = targetSlot === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (!slotItem) return false;
      const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
      const currentDurability = slotItem.durability ?? maxDurability;
      if (currentDurability >= maxDurability) return false;
      const repairedDurability = Math.min(maxDurability, currentDurability + amount);
      const gained = repairedDurability - currentDurability;
      depsRef.current.setEquipmentSlotById(targetSlot, { ...slotItem, durability: repairedDurability });
      dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `${slotItem.name} 耐久 +${gained}` });
      return true;
    },
    [equipmentSlot1, equipmentSlot2, dispatch],
  );

  // ---------------------------------------------------------------------------
  // handlePlayCardFromHand — thin dispatch
  // ---------------------------------------------------------------------------

  const handlePlayCardFromHand = (card: GameCardData, target?: any) => {
    if (depsRef.current.fullBoardInteractionLockedRef.current || depsRef.current.handLockedForMonsterPhaseRef.current) return;
    depsRef.current.pushUndoSnapshot();
    dispatch({ type: 'PLAY_CARD', cardId: card.id, target });
  };

  // ---------------------------------------------------------------------------
  // useGameEvent listeners — cleanup after reducer finalization
  // ---------------------------------------------------------------------------

  useGameEvent('card:potionFinalized', ({ card }) => {
    // Mirror the disposition routing inside reduceFinalizePotionCard
    // (rules/cards.ts ~L1000-L1010):
    //   - flipTarget present  → flips on the board (no flight)
    //   - recycleDelay > 0    → recycle bag ✈️
    //   - otherwise           → graveyard ✈️
    // We must trigger the flight BEFORE removePendingDungeonCard because
    // that schedules a setState that ultimately removes the card's DOM
    // element; we need the element alive to capture the source rect.
    if (!card.flipTarget) {
      const destination: 'graveyard' | 'recycle-bag' =
        card.recycleDelay != null && card.recycleDelay > 0
          ? 'recycle-bag'
          : 'graveyard';
      // Cards played from hand should fly from the Hero Cell (the player just
      // "used" the card from themselves), not from the original hand slot.
      void depsRef.current.triggerDiscardFlight(card, destination, 'hero');
    }
    depsRef.current.removePendingDungeonCard(card.id);
    depsRef.current.stagingCardsRef.current =
      depsRef.current.stagingCardsRef.current.filter(c => c.id !== card.id);
    depsRef.current.drainPendingDiscardEffects();
  });

  useGameEvent('card:magicFinalized', ({ card }) => {
    const d = depsRef.current;
    // Mirror the disposition routing inside reduceFinalizeMagicCard
    // (rules/cards.ts ~L955-L967):
    //   - curse                                       → backpack (no flight; not a discard target)
    //   - permStripped                                → graveyard ✈️
    //   - permanent magic OR recycleDelay > 0         → recycle bag ✈️
    //   - otherwise (instant magic / hero-magic etc.) → graveyard ✈️
    // Same reasoning as potion: fly first, then strip the slot, otherwise
    // the source DOM element is already gone by the time the listener runs.
    const isCurse = card.type === 'curse';
    if (!isCurse) {
      const isPermanentMagic = card.type === 'magic' && card.magicType === 'permanent';
      const hasRecycleDelay = card.recycleDelay != null && card.recycleDelay > 0;
      const goesToRecycleBag = !card.permStripped && (isPermanentMagic || hasRecycleDelay);
      const destination: 'graveyard' | 'recycle-bag' = goesToRecycleBag
        ? 'recycle-bag'
        : 'graveyard';
      // Magic / hero-magic cards played from hand fly from the Hero Cell
      // (player "casts" them from themselves) rather than from the hand slot.
      void d.triggerDiscardFlight(card, destination, 'hero');
    }
    // removePendingDungeonCard already calls removeCard internally when the
    // card is pending or in the active row, so we only need a fallback call
    // for cards that weren't tracked as dungeon cards (e.g. hand-only magic).
    const wasPending = d.removePendingDungeonCard(card.id);
    if (!wasPending) {
      d.removeCard(card.id, false);
    }
    d.stagingCardsRef.current =
      d.stagingCardsRef.current.filter(c => c.id !== card.id);
    d.drainPendingDiscardEffects();
    d.echoRemainingRef.current = 0;
  });

  // ---------------------------------------------------------------------------
  // UI interaction request listeners — bridge reducer side effects to modals
  // ---------------------------------------------------------------------------

  useGameEvent('ui:requestDice', (payload) => {
    const { title, subtitle, entries, context: flowContext, flowContext: legacyFlow, predeterminedRoll } = payload as any;
    (depsRef.current.requestDiceOutcome as any)({
      title,
      subtitle,
      entries,
      flowContext: flowContext ?? legacyFlow,
      predeterminedRoll,
    });
  });

  useGameEvent('ui:requestMagicChoice', (payload) => {
    const { options, prompt, context } = payload as any;
    depsRef.current.requestMagicChoice({
      title: prompt,
      options,
      ...(context ?? {}),
    } as any);
  });

  useGameEvent('ui:requestEquipmentChoice', (payload) => {
    const { slots, prompt } = payload as any;
    depsRef.current.requestEquipmentSelection({
      prompt,
      slots,
    } as any);
  });

  useGameEvent('ui:graveyardDiscover', ({ source }) => {
    if (source === 'potion') {
      depsRef.current.graveyardDiscoverDeliveryRef.current = 'hand-first';
    }
  });

  // ---------------------------------------------------------------------------
  // Interactive flow listeners — bridge reducer side effects to async UI
  // ---------------------------------------------------------------------------

  useGameEvent('card:fateSightPeekReady', (payload) => {
    const {
      peekedCards, monsterCount, stunChance,
      targetMonsterName, card, totalDamage,
      targetMonsterId, targetIsStunned, predeterminedRoll,
    } = payload as any;
    depsRef.current.setDeckPeekState({
      mode: 'fate-sight',
      peekedCards,
      monsterCount,
      stunChance,
      targetMonsterName,
    });
    depsRef.current.deckJudgePeekCloseRef.current = () => {
      if (stunChance > 0 && !targetIsStunned) {
        const threshold = Math.round((stunChance / 100) * 20);
        void depsRef.current.requestDiceOutcome({
          title: targetMonsterName,
          subtitle: `击晕判定（${stunChance}%）`,
          entries: [
            { id: 'stun', range: [1, threshold] as [number, number], label: '击晕成功！', effect: 'none' },
            { id: 'miss', range: [threshold + 1, 20] as [number, number], label: '未击晕', effect: 'none' },
          ],
          flowContext: {
            flowId: 'fate-sight-stun',
            targetMonsterId,
            targetMonsterName,
            card,
          },
          predeterminedRoll,
        } as any);
      } else {
        dispatch({ type: 'FINALIZE_MAGIC_CARD', card });
      }
    };
  });

  useGameEvent('card:statSwapStunDice', (payload) => {
    const { card, targetMonsterId, targetMonsterName, effectiveFlankStun, predeterminedRoll } = payload as any;
    const threshold = Math.round((effectiveFlankStun / 100) * 20);
    void depsRef.current.requestDiceOutcome({
      title: targetMonsterName,
      subtitle: `侧击击晕判定（${effectiveFlankStun}%）`,
      entries: [
        { id: 'stun', range: [1, threshold] as [number, number], label: '击晕成功！', effect: 'none' },
        { id: 'miss', range: [threshold + 1, 20] as [number, number], label: '未击晕', effect: 'none' },
      ],
      flowContext: {
        flowId: 'stat-swap-stun',
        targetMonsterId,
        targetMonsterName,
        card,
      },
      predeterminedRoll,
    } as any);
  });

  useGameEvent('card:deckJudgePeekReady', (payload) => {
    const { peekedCards, monsterCount, deleteCount, gains, card } = payload;
    depsRef.current.setDeckPeekState({
      mode: 'deck-judge-delete',
      peekedCards,
      monsterCount,
      deleteCount,
      gains,
    });
    depsRef.current.deckJudgePeekCloseRef.current = () => {
      if (deleteCount > 0) {
        void depsRef.current.requestCardActionBatch('delete', deleteCount, {
          title: `牌堆审判：删除最多 ${deleteCount} 张牌`,
          description: '清除不需要的牌',
          handOnly: false,
        }).then(() => {
          dispatch({ type: 'FINALIZE_MAGIC_CARD', card });
        });
      } else {
        dispatch({ type: 'FINALIZE_MAGIC_CARD', card });
      }
    };
  });

  // ---------------------------------------------------------------------------
  // Card flow event listeners — bridge reducer side effects to UI flows
  // ---------------------------------------------------------------------------

  useGameEvent('card:discoverRequested', ({ source, candidates, sourceLabel, delivery }) => {
    depsRef.current.beginDiscoverFlow(source, { overridePool: candidates, sourceLabel, delivery });
  });

  useGameEvent('card:mirrorCopyRequested', ({ card }) => {
    depsRef.current.openMirrorCopyModal(card.id);
  });

  useGameEvent('card:deckJudgeRequested', ({ card }) => {
    dispatch({ type: 'RESOLVE_DECK_JUDGE', card });
  });

  // 净册涌泉 (knight:cleanse-draw) — drive the hand-pick + draw loop.
  // For Spell Echo (Category B), `echoRemaining` is the number of times to
  // run the picker. Each iteration: open hand-only delete picker for 1 card,
  // then draw `drawCount` cards from the backpack. Empty hand → skip picker
  // but still draw (per design: draw-only when empty).
  //
  // IMPORTANT: read live `engine.getState().handCards` to decide whether to
  // open the picker. `requestCardAction` itself relies on a React-snapshot of
  // `handCards` for its empty-pool early-return; that snapshot is stale
  // immediately after PLAY_CARD removes 净册涌泉 itself from hand (the side
  // effect fires synchronously, before React re-renders). Without this live
  // check, an empty-hand player would see an unclosable modal: pool computed
  // as 1 (stale), modal opens, then re-render shows "当前没有手牌可以选择" with
  // ESC + outside-click disabled and no cancel button (each-mode picker).
  useGameEvent('card:cleanseDrawRequested', async ({ card, drawCount, echoRemaining }) => {
    const iterations = Math.max(1, echoRemaining ?? 1);
    for (let i = 0; i < iterations; i++) {
      const titleSuffix = iterations > 1 ? `（${i + 1}/${iterations}）` : '';
      const liveHandCount = (engine.getState().handCards ?? []).length;
      if (liveHandCount > 0) {
        await depsRef.current.requestCardAction('delete', 1, {
          title: `净册涌泉：选择一张手牌删除${titleSuffix}`,
          description: `删除一张手牌（手牌为空可跳过），然后从背包抽 ${drawCount} 张牌`,
          handOnly: true,
        });
      } else {
        dispatch({
          type: 'SET_HERO_SKILL_BANNER',
          message: `净册涌泉：手牌为空，跳过删除${titleSuffix}，直接从背包抽 ${drawCount} 张。`,
        });
      }
      dispatch({ type: 'DRAW_CARDS', count: drawCount, source: 'backpack' });
    }
    dispatch({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
  });

  useGameEvent('card:classDrawRequested', ({ count, source }) => {
    depsRef.current.drawClassCardsToBackpack(count, source);
  });

  useGameEvent('card:transformGrantModal', ({ card }) => {
    dispatch({
      type: 'SET_PERM_GRANT_MODAL',
      payload: { sourceCardId: card.id, sourceType: 'transform-grant' as const },
    });
  });

  useGameEvent('card:recallEquipmentSelect', async ({ options }) => {
    const chosen = await depsRef.current.requestMagicChoice({
      title: '紧急回收',
      subtitle: '选择一个位置回手',
      options: options.map((o) => ({ id: o.id, label: o.label, description: o.description })),
    });
    if (chosen) {
      dispatch({ type: 'RESOLVE_MAGIC_CHOICE', choiceId: chosen });
    }
  });

  useGameEvent('card:cryptDeathwishSelect', async () => {
    const slot = await depsRef.current.requestEquipmentSelection({
      prompt: '选择一个装备，触发其遗言效果 2 次',
      subtext: '墓语遗愿：遗言效果将被立即触发 2 次，然后抽 1 张牌。',
    });
    if (slot) {
      dispatch({ type: 'RESOLVE_EQUIPMENT_CHOICE', slotId: slot });
    }
  });

  useGameEvent('card:stormVolleyTransformed', ({ card }) => {
    // TODO: wire storm volley transform animation
    console.debug('[CardPlay] Storm volley transformed:', card.name);
  });

  useGameEvent('card:bloodGreedShop', ({ card }) => {
    depsRef.current.generateShopOfferings();
    // TODO: wire full shop open flow for blood greed
    console.debug('[CardPlay] Blood greed shop triggered:', card.name);
  });

  useGameEvent('card:potionFlipRequested', ({ card }) => {
    depsRef.current.applyCardFlip(card);
  });

  useGameEvent('card:potionRepair', async ({ amount }) => {
    await repairEquipmentDurability(amount, ['weapon', 'shield', 'monster']);
  });

  useGameEvent('card:potionResolved', ({ card }) => {
    // Potion effect dispatched; finalization handled separately via FINALIZE_POTION_CARD
    console.debug('[CardPlay] Potion resolved:', card.name);
  });

  useGameEvent('card:magicResolved', ({ card, target }) => {
    if (card.type === 'hero-magic') {
      handleHeroMagicCard(card as GameCardData);
    } else {
      console.debug('[CardPlay] card:magicResolved (unhandled):', card.name, target);
    }
  });

  useGameEvent('card:potionDiscoverClassMagic', ({ card }) => {
    const started = depsRef.current.beginDiscoverFlow('discover-class-magic', {
      filter: (c: GameCardData) => c.type === 'magic' || c.type === 'hero-magic',
      sourceLabel: card.name,
    });
    if (!started) {
      addGameLog('potion', `${card.name}：职业牌堆中没有可用的魔法卡。`);
    }
  });

  useGameEvent('card:graveyardDiscoverEquipAmulet', async ({ card }) => {
    const selected = await depsRef.current.requestGraveyardSelection(3, {
      filter: (c: GameCardData) => c.type === 'weapon' || c.type === 'shield' || c.type === 'amulet',
      delivery: 'hand-first',
    });
    if (selected) {
      addGameLog('magic', `破印遗物：从坟场发现了「${selected.name}」`);
    }
    dispatch({ type: 'FINALIZE_MAGIC_CARD', card: card as GameCardData, dealtDamage: false });
  });

  useGameEvent('card:echoBagDiscover', async ({ card, discoverCount, drawCount }) => {
    const discovered: string[] = [];
    for (let i = 0; i < discoverCount; i++) {
      const selected = await depsRef.current.requestGraveyardSelection(3, {
        delivery: 'hand-first',
      });
      if (selected) {
        discovered.push(selected.name);
      }
    }
    if (discovered.length > 0) {
      addGameLog('magic', `回响行囊：从坟场发现了 ${discovered.join('、')}`);
    }
    dispatch({ type: 'DRAW_FROM_BACKPACK', count: drawCount, ignoreLimit: true });
    dispatch({ type: 'FINALIZE_MAGIC_CARD', card: card as GameCardData, dealtDamage: false });
  });

  useGameEvent('card:graveyardRecalled', ({ cards }) => {
    depsRef.current.triggerGraveyardToBackpackFlight(cards as GameCardData[]);
  });

  useGameEvent('card:fortuneWheelDiscover', ({ card }) => {
    const started = depsRef.current.beginDiscoverFlow('fortune-wheel', {
      sourceLabel: card?.name ?? '际遇轮盘',
    });
    if (!started) {
      addGameLog('magic', '际遇轮盘：职业牌堆已空，无法发现。');
    }
  });

  useGameEvent('card:fortuneWheelDelete', async ({ card }) => {
    await depsRef.current.requestCardAction('delete', 1, {
      title: '际遇轮盘：选择一张牌删除',
      description: '际遇轮盘效果：删除一张牌。',
      handOnly: false,
    });
    if (card) {
      dispatch({ type: 'FINALIZE_MAGIC_CARD', card: card as GameCardData });
    }
  });

  useGameEvent('card:chaosEquipReturn', async ({ card }) => {
    const slot = await depsRef.current.requestEquipmentSelection({
      prompt: '选择装备回手',
      subtext: '混沌骰：选择一件装备回到手牌。',
    });
    if (slot) {
      dispatch({ type: 'RETURN_EQUIPMENT_TO_HAND', slotId: slot });
    }
    if (card) {
      dispatch({ type: 'FINALIZE_MAGIC_CARD', card: card as GameCardData });
    }
  });

  useGameEvent('card:chaosDiscover', ({ card }) => {
    const started = depsRef.current.beginDiscoverFlow('chaos-dice', {
      sourceLabel: card?.name ?? '混沌骰',
    });
    if (!started) {
      addGameLog('magic', '混沌骰：职业牌堆已空，无法发现。');
    }
    // The chaos-dice card itself goes to the recycle bag immediately —
    // the discover flow is independent and resolves on its own (player picks
    // a card or cancels). Finalizing here ensures the card is not lost
    // regardless of which path the discover flow takes.
    if (card) {
      dispatch({ type: 'FINALIZE_MAGIC_CARD', card: card as GameCardData });
    }
  });

  useGameEvent('card:chaosShop', ({ card }) => {
    // Open a temporary shop sourced by the chaos-dice card itself.
    // The shop modal is independent of the card's lifecycle, so finalize
    // the chaos-dice card (into the recycle bag) immediately.
    const opened = card ? depsRef.current.startShopFlow(card as GameCardData) : false;
    if (!opened) {
      addGameLog('magic', '混沌骰：职业牌堆已空，无法开启临时商店。');
    } else {
      addGameLog('magic', '混沌骰：开启了一个临时混沌商店！');
    }
    if (card) {
      dispatch({ type: 'FINALIZE_MAGIC_CARD', card: card as GameCardData });
    }
  });

  useGameEvent('card:chaosDiscardDraw', async ({ card }) => {
    await depsRef.current.requestCardActionBatch('discard-recycle', 2, {
      title: '混沌骰运：弃回 2 张手牌',
      description: '从手牌中选择最多 2 张弃回，然后从背包抽 2 张牌。',
      handOnly: true,
    });
    dispatch({ type: 'DRAW_FROM_BACKPACK', count: 2, ignoreLimit: true });
    if (card) {
      dispatch({ type: 'FINALIZE_MAGIC_CARD', card: card as GameCardData });
    }
  });

  // ---------------------------------------------------------------------------
  // Card animation event listeners
  // ---------------------------------------------------------------------------

  useGameEvent('card:playedFromHand', ({ card }) => {
    // TODO: wire card play animation (e.g. glow / pulse on played card)
    console.debug('[CardPlay] Card played from hand:', card.name);
  });

  useGameEvent('card:equipped', ({ cardId, slotId }) => {
    // TODO: wire equip flight animation
    console.debug('[CardPlay] Card equipped:', cardId, '→', slotId);
  });

  useGameEvent('card:magicPlayed', ({ card }) => {
    // TODO: wire magic play animation effect
    console.debug('[CardPlay] Magic played:', card.name);
  });

  useGameEvent('card:potionPlayed', ({ card }) => {
    // TODO: wire potion play animation effect
    console.debug('[CardPlay] Potion played:', card.name);
  });

  useGameEvent('card:deleted', ({ card, source, destination, context }) => {
    // TODO: wire card deletion animation (flight to exile / fade out)
    console.debug('[CardPlay] Card deleted:', card.name, source, '→', destination, context);
  });

  useGameEvent('card:discarded', ({ cardId, destination }) => {
    // TODO: wire discard flight animation (needs full card data to trigger triggerDiscardFlight)
    console.debug('[CardPlay] Card discarded:', cardId, '→', destination);
  });

  useGameEvent('card:finalized', ({ cardId, destination }) => {
    // TODO: wire finalization animation
    console.debug('[CardPlay] Card finalized:', cardId, '→', destination);
  });

  useGameEvent('card:equipmentSalvaged', ({ card }) => {
    depsRef.current.queueCardIntoHand(card as GameCardData);
  });

  // 哥布林的戏法 — 2-phase animation orchestrator.
  //
  // Phase 1 already ran in the reducer (hand cards moved into the backpack;
  // `drawCardIds` pre-rolled and waiting in the backpack). Here we:
  //   1. Trigger discard flights for every shuffled card (hand → backpack).
  //   2. Wait for ALL discard flights to land.
  //   3. Dispatch GOBLIN_TRICK_DELIVER, which removes the pre-selected ids
  //      from the backpack and emits `card:queueToHand` for each — those
  //      events drive the backpack → hand flights.
  useGameEvent('card:goblinTrickShuffled', ({ shuffledCards, drawCardIds }) => {
    const flights = shuffledCards.map(card =>
      depsRef.current.triggerDiscardFlight(card as GameCardData, 'recycle-bag'),
    );
    void Promise.all(flights).then(() => {
      dispatch({ type: 'GOBLIN_TRICK_DELIVER', drawCardIds });
    });
  });

  useGameEvent('event:cardTransformed', ({ toCard, hasFlipGold }) => {
    if (hasFlipGold) {
      addGameLog('amulet', '熔炉之心：卡牌翻转获得金币。');
    }
    console.debug('[CardPlay] Card transformed:', toCard.name);
  });

  // ---------------------------------------------------------------------------
  // Return bag
  // ---------------------------------------------------------------------------

  return {
    getSpellDamage,

    updateHeroMagicStateById,
    unlockHeroMagic,
    resetHeroMagicGauge,
    setHeroMagicUsedThisWave,
    completeHeroMagicActivation,
    applyBerserkerRageEffect,
    triggerGraveNova,

    finalizeMagicCard,
    finalizePotionCard,
    resolvePotionRepairForSlot,
    repairEquipmentDurability,

    handleHeroMagicCard,
    handlePlayCardFromHand,

    isPermanentMagicCard,
    normalizeEventEffect,
    chaosStrikeHasOverkill,
    drawCardsFromBackpack,
    getRepairableEquipmentSlots,
    resolveFateSight,
    resolveStatSwap,
    resolveRepairEnrageDice,

    resolveMirrorCopy,
    cancelMirrorCopy,
    resolvePermGrant,
    cancelPermGrant,
    resolveAmplify,
    cancelAmplify,

    resolveDeckJudgeDelete,
  };
}
