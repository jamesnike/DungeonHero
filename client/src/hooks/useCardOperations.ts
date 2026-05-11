import React, { useCallback, useMemo } from 'react';
import { useGameEngine, useShallowGameState, useDispatch, useGameEvent } from '@/hooks/useGameEngine';
import type { GameCardData, EquipmentCardStatModifier } from '@/components/GameCard';
import { isPermRecycleEquipment } from '@/components/GameCard';
import type { LogEntryType } from '@/components/GameLogPanel';
import type {
  ActiveAmuletEffects,
  ActiveRowSlots,
  BackpackHandFlight,
  EquipmentItem,
  EquipmentSlotBonusState,
  EquipmentSlotId,
  EquipmentSlotStatModifier,
  FlightSourceHint,
  EventTransformState,
  SlotPermanentBonus,
  SlotTempArmorState,
} from '@/components/game-board/types';
import type { KnightCardData } from '@/lib/knightDeck';
import type { HeroSkillId } from '@/lib/heroSkills';
import { getHeroSkillById } from '@/lib/heroSkills';
import {
  HAND_LIMIT,
  BASE_BACKPACK_CAPACITY,
  FLIP_GOLD_REWARD,
  DEV_MODE,
} from '@/game-core/constants';
import { computeAmuletEffectsCombined } from '@/game-core/equipment';
import {
  isRecyclableFromHand,
  flattenActiveRowSlots,
  sanitizeCardMetadata,
  logBackpackDraw,
  isDamageableTarget,
} from '@/game-core/helpers';
import { getEquipmentSlotsWithSuppressedTempAttack } from '@/game-core/buildingAura';
import { resetMonsterForGraveyard } from '@/game-core/cards';
import type { RngState } from '@/game-core/rng';
import { nextRandom, nextInt, nextBool, shuffle as rngShuffle, pickRandom, nextId } from '@/game-core/rng';

// ---------------------------------------------------------------------------
// Deps: external dependencies injected by GameBoard
// ---------------------------------------------------------------------------

export interface PendingDiscardEffect {
  card: GameCardData;
  owner: 'player' | 'dungeon';
  opts?: { toRecycleBag?: boolean; isEquipmentDisplace?: boolean };
}

export interface CardOperationsDeps {
  addGameLog: (type: LogEntryType, message: string) => void;

  triggerDiscardFlight: (
    card: GameCardData,
    destination: 'graveyard' | 'recycle-bag',
    sourceHint?: FlightSourceHint,
  ) => Promise<void>;
  triggerDiscardShock: (count: number) => void;
  triggerFlipShock: (count: number) => void;
  triggerGraveNova: (graveNovaCard?: GameCardData) => void;
  queueCardIntoHand: (card: GameCardData, sourceHint?: FlightSourceHint) => void;

  handCardsRef: React.MutableRefObject<GameCardData[]>;
  backpackHandFlightsRef: React.MutableRefObject<BackpackHandFlight[]>;
  storingCardIdsRef: React.MutableRefObject<Set<string>>;
  selectedHeroSkillRef: React.MutableRefObject<string | null>;
  eternalRelicsRef: React.MutableRefObject<import('@/game-core/types').EternalRelic[]>;
  pendingAutoDrawsRef: React.MutableRefObject<number>;
  onNewCardGainedRef: React.MutableRefObject<((count: number, source?: 'graveyard' | 'classPool') => void) | null>;
  discardedCardsRef: React.MutableRefObject<GameCardData[]>;

  stagingCardsRef: React.MutableRefObject<GameCardData[]>;
  pendingDiscardEffectsQueueRef: React.MutableRefObject<PendingDiscardEffect[]>;

  clearUndoStack: () => void;
  pushUndoSnapshot: () => void;
  updateMonsterCard: (id: string, updater: (m: GameCardData) => GameCardData) => void;
  dealDamageToMonster: (monster: GameCardData, damage: number, options?: { animationDelay?: number; pulses?: number; isSpellDamage?: boolean }) => void;
  getSpellDamage: (baseDamage: number) => number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCardOperations(depsRef: React.MutableRefObject<CardOperationsDeps>) {
  const engine = useGameEngine();
  const dispatch = useDispatch();

  const {
    hp,
    amuletSlots,
    backpackItems,
    backpackCapacityModifier,
    permanentMagicRecycleBag,
    classDeck,
    activeCards,
    equipmentSlot1,
    equipmentSlot2,
    equipmentSlot1Reserve,
    equipmentSlot2Reserve,
    equipmentSlotBonuses,
    slotTempArmor,
    slotTempAttack,
    slotAttackBursts,
    berserkTurnBuff,
    nextWeaponBonus,
    selectedHeroSkill,
    permanentSkills,
    permanentMaxHpBonus,
    weaponMasterBonus,
    shieldMasterBonus,
    handLimitBonus,
    defensiveStanceActive,
    eternalRelics,
  } = useShallowGameState(s => ({
    hp: s.hp,
    amuletSlots: s.amuletSlots,
    backpackItems: s.backpackItems,
    backpackCapacityModifier: s.backpackCapacityModifier,
    permanentMagicRecycleBag: s.permanentMagicRecycleBag,
    classDeck: s.classDeck,
    activeCards: s.activeCards,
    equipmentSlot1: s.equipmentSlot1,
    equipmentSlot2: s.equipmentSlot2,
    equipmentSlot1Reserve: s.equipmentSlot1Reserve,
    equipmentSlot2Reserve: s.equipmentSlot2Reserve,
    equipmentSlotBonuses: s.equipmentSlotBonuses,
    slotTempArmor: s.slotTempArmor,
    slotTempAttack: s.slotTempAttack,
    slotAttackBursts: s.slotAttackBursts,
    berserkTurnBuff: s.berserkTurnBuff,
    nextWeaponBonus: s.nextWeaponBonus,
    selectedHeroSkill: s.selectedHeroSkill,
    permanentSkills: s.permanentSkills,
    permanentMaxHpBonus: s.permanentMaxHpBonus,
    weaponMasterBonus: s.weaponMasterBonus,
    shieldMasterBonus: s.shieldMasterBonus,
    handLimitBonus: s.handLimitBonus,
    defensiveStanceActive: s.defensiveStanceActive,
    eternalRelics: s.eternalRelics,
  }));

  // -- Type alias for state ---------------------------------------------------

  type GS = import('@/game-core/types').GameState;

  // -- Derived values ---------------------------------------------------------

  // Delegate to the canonical aggregator in `game-core/equipment.ts` so that
  // every consumer sees the same set of computed effects. Historically this
  // hook duplicated the switch and silently went stale when new amulets were
  // added — the duplicate is gone for good. Eternal relics that carry an
  // `amuletEffect` (e.g. 护符永铸药 conversions, 回合汲取药) are folded in so
  // converted-relic effects continue to function identically to equipped
  // amulets — see `parallel-state-fields-consumer-audit.mdc`.
  const amuletEffects = useMemo<ActiveAmuletEffects>(
    () => computeAmuletEffectsCombined(amuletSlots as GameCardData[], eternalRelics),
    [amuletSlots, eternalRelics],
  );

  const backpackCapacity = Math.max(1, BASE_BACKPACK_CAPACITY + backpackCapacityModifier);
  const effectiveHandLimit = HAND_LIMIT + handLimitBonus;

  const selectedHeroSkillDef = useMemo(
    () => getHeroSkillById(selectedHeroSkill as HeroSkillId | null | undefined),
    [selectedHeroSkill],
  );

  const attackBonus =
    amuletEffects.aura.attack +
    (permanentSkills.includes('Weapon Master') ? 1 : 0) +
    weaponMasterBonus +
    (permanentSkills.includes('Berserker Rage')
      ? Math.floor(
          ((typeof (selectedHeroSkillDef as any)?.initialMaxHpBonus === 'number'
            ? (selectedHeroSkillDef as any).initialMaxHpBonus
            : 0) +
            20 +
            amuletEffects.aura.maxHp +
            permanentMaxHpBonus +
            (permanentSkills.includes('Iron Will') ? 3 : 0) -
            hp) /
            2,
        )
      : 0) +
    (permanentSkills.includes('Battle Frenzy') &&
    hp <
      (20 +
        amuletEffects.aura.maxHp +
        permanentMaxHpBonus +
        (permanentSkills.includes('Iron Will') ? 3 : 0) +
        (selectedHeroSkillDef?.initialMaxHpBonus ?? 0)) /
        2
      ? 2
      : 0);

  const defenseBonus =
    amuletEffects.aura.defense +
    (permanentSkills.includes('Iron Skin') ? 1 : 0) +
    shieldMasterBonus +
    (defensiveStanceActive ? 1 : 0);

  // -- Helpers ----------------------------------------------------------------

  const sanitizeCardForGraveyard = (card: GameCardData): GameCardData => {
    const { fromSlot, ...rest } = card as GameCardData & { fromSlot?: string };
    void engine;
    return resetMonsterForGraveyard({ ...rest });
  };

  // -- Functions --------------------------------------------------------------

  const ensureCardInHand = useCallback((card: GameCardData) => {
    const prev = engine.getState().handCards;
    if (prev.some(existing => existing.id === card.id)) return;
    logBackpackDraw('hand-insert', {
      cardId: card.id,
      name: card.name,
      prevHandSize: prev.length,
      nextHandSize: prev.length + 1,
    });
    const next = [...prev, card];
    depsRef.current.handCardsRef.current = next;
    dispatch({ type: 'SET_HAND_CARDS', cards: next });
  }, [engine, dispatch]);

  const consumeClassCardFromHand = useCallback((cardId: string) => {
    dispatch({ type: 'REMOVE_CLASS_CARD_FROM_HAND', cardId });
  }, [dispatch]);

  // -- Graveyard (thin dispatcher) -------------------------------------------

  function addToGraveyard(card: GameCardData) {
    dispatch({ type: 'ADD_TO_GRAVEYARD', card });
  }

  // -- Recycle Bag ------------------------------------------------------------

  const addPermanentMagicToRecycleBag = useCallback(
    (card: GameCardData, options?: { waitsOverride?: number }) => {
      dispatch({ type: 'ADD_TO_RECYCLE_BAG', card, waitsOverride: options?.waitsOverride });
    },
    [dispatch],
  );

  const restorePermanentMagicFromRecycleBag = useCallback(() => {
    dispatch({ type: 'RESTORE_RECYCLE_BAG' });
  }, [dispatch]);

  // -- Backpack draw (thin dispatchers) ----------------------------------------

  const takeRandomCardsFromBackpack = (count: number): void => {
    if (count <= 0) return;
    dispatch({ type: 'DRAW_FROM_BACKPACK', count });
  };

  const drawFromBackpackToHand = (): void => {
    dispatch({ type: 'DRAW_CARDS', count: 1, source: 'backpack' });
  };

  const drawFromRecycleBagToHand = (count: number): void => {
    if (count <= 0) return;
    dispatch({ type: 'DRAW_CARDS', count, source: 'recycleBag' });
  };

  // -- Recycle Forge (thin dispatcher) ----------------------------------------

  const tickRecycleForge = () => {
    dispatch({ type: 'TICK_RECYCLE_FORGE' });
  };

  // -- Class Deck -------------------------------------------------------------

  const drawClassCardsToBackpack = useCallback(
    (
      count: number,
      _source: string,
      opts?: {
        excludeIds?: string[];
        includeIds?: string[];
        filter?: 'hero-magic' | 'weapon' | 'shield' | 'equipment';
      },
    ): void => {
      if (count <= 0) return;
      dispatch({
        type: 'DRAW_CLASS_TO_BACKPACK',
        count,
        filter: opts?.filter,
        excludeIds: opts?.excludeIds,
        includeIds: opts?.includeIds,
      });
    },
    [dispatch],
  );

  // -- Discard side effects ---------------------------------------------------

  // -- Discard side effects (thin dispatcher) ---------------------------------

  const applyDiscardSideEffects = useCallback(
    (card: GameCardData, owner: 'player' | 'dungeon', opts?: { toRecycleBag?: boolean; isEquipmentDisplace?: boolean }) => {
      dispatch({ type: 'APPLY_DISCARD_EFFECTS', card, owner, opts });
    },
    [dispatch],
  );

  const drainPendingDiscardEffects = useCallback(() => {
    const queue = depsRef.current.pendingDiscardEffectsQueueRef.current;
    while (queue.length > 0) {
      const entry = queue.shift()!;
      dispatch({ type: 'APPLY_DISCARD_EFFECTS', card: entry.card, owner: entry.owner, opts: entry.opts });
    }
  }, [dispatch]);

  // -- Equipment slot helpers -------------------------------------------------

  const getEquipmentSlots = (): { id: EquipmentSlotId; item: EquipmentItem | null }[] => {
    return [
      { id: 'equipmentSlot1', item: equipmentSlot1 },
      { id: 'equipmentSlot2', item: equipmentSlot2 },
    ];
  };

  const getEquipmentSlotBonus = (slotId: EquipmentSlotId, bonusType: keyof SlotPermanentBonus): number =>
    equipmentSlotBonuses[slotId][bonusType];

  const calculateSlotArmorValue = (slotId: EquipmentSlotId): number => {
    const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
    if (!slotItem || (slotItem.type !== 'shield' && slotItem.type !== 'monster')) {
      return 0;
    }
    // Single-counter armor model: storedCap = max(0, baseArmorMax + perm + temp + defense).
    // Floor on FINAL sum so negative perm/temp reduce the cap (rather than being
    // dropped individually). `slotItem.armor === undefined` ⇒ "fresh / at full cap";
    // readers default to cap.
    const baseArmorMax = slotItem.type === 'monster'
      ? (slotItem.hp ?? slotItem.value)
      : (slotItem.armorMax ?? slotItem.value);
    const slotShieldBonus = getEquipmentSlotBonus(slotId, 'shield');
    const rawSlotTemp = slotTempArmor[slotId] ?? 0;
    const storedCap = Math.max(0, baseArmorMax + defenseBonus + slotShieldBonus + rawSlotTemp);
    const stored = slotItem.armor;
    return stored === undefined ? storedCap : Math.max(0, Math.min(stored, storedCap));
  };

  const getEquipmentSlotStatModifier = (slotId: EquipmentSlotId): EquipmentSlotStatModifier | null => {
    const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
    if (!slotItem) {
      return null;
    }

    const tempAttackSuppressed = getEquipmentSlotsWithSuppressedTempAttack(
      activeCards,
      equipmentSlot1,
      equipmentSlot2,
    );

    if (slotItem.type === 'weapon') {
      const slotDamageBonus = getEquipmentSlotBonus(slotId, 'damage');
      const slotBurstBonus = slotAttackBursts[slotId] ?? 0;
      let slotTempAttackBonus = slotTempAttack[slotId] ?? 0;
      if (tempAttackSuppressed.has(slotId)) slotTempAttackBonus = 0;
      const slotBerserkBonus = berserkTurnBuff[slotId] ?? 0;
      const modifier =
        attackBonus +
        slotDamageBonus +
        nextWeaponBonus +
        slotBurstBonus +
        slotTempAttackBonus +
        slotBerserkBonus;

      return {
        appliesTo: 'weapon',
        modifier,
        flashCount: amuletEffects.flashCount,
      };
    }

    if (slotItem.type === 'shield') {
      const slotShieldBonus = getEquipmentSlotBonus(slotId, 'shield');
      const rawSlotTemp = slotTempArmor[slotId] ?? 0;
      // Single-counter armor model: `permanentShieldBonus` here represents the
      // additional cap (perm + temp + defense) above baseArmorMax. Sum is raw
      // (no individual floor) so negative perm/temp reduce the cap; renderer
      // clamps the final `baseArmorMax + permanentShieldBonus` at 0.
      const permanentShieldBonus = defenseBonus + slotShieldBonus + rawSlotTemp;

      return {
        appliesTo: 'shield',
        modifier: 0,
        permanentShieldBonus,
      };
    }

    if (slotItem.type === 'monster') {
      const slotDamageBonus = getEquipmentSlotBonus(slotId, 'damage');
      const slotBurstBonus = slotAttackBursts[slotId] ?? 0;
      let slotTempAttackBonus = slotTempAttack[slotId] ?? 0;
      if (tempAttackSuppressed.has(slotId)) slotTempAttackBonus = 0;
      const slotBerserkBonus = berserkTurnBuff[slotId] ?? 0;
      const modifier =
        attackBonus +
        slotDamageBonus +
        nextWeaponBonus +
        slotBurstBonus +
        slotTempAttackBonus +
        slotBerserkBonus;

      const slotShieldBonus = getEquipmentSlotBonus(slotId, 'shield');
      const rawSlotTempMonster = slotTempArmor[slotId] ?? 0;
      // Single-counter armor model: shield modifier is the additional cap
      // (perm + temp + defense) above base hp/value. Sum is raw (no individual
      // floor) so negative perm/temp reduce the cap; renderer clamps the final
      // `baseHp + effectiveShieldMod` at 0.
      const effectiveShieldMod = defenseBonus + slotShieldBonus + rawSlotTempMonster;

      return {
        appliesTo: 'monster' as const,
        modifier,
        shieldModifier: effectiveShieldMod,
        permanentShieldBonus: effectiveShieldMod,
        flashCount: amuletEffects.flashCount,
      };
    }

    return null;
  };

  const setEquipmentSlotBonus = (
    slotId: EquipmentSlotId,
    bonusType: keyof SlotPermanentBonus,
    value: number | ((current: number) => number),
  ) => {
    const prev = engine.getState().equipmentSlotBonuses;
    const currentValue = prev[slotId][bonusType];
    const nextValue = typeof value === 'function' ? value(currentValue) : value;
    if (currentValue === nextValue) {
      return;
    }
    dispatch({ type: 'SET_EQUIPMENT_SLOT_BONUS', slotId, bonusType, value: nextValue });
  };

  const setEquipmentSlotById = (id: EquipmentSlotId, item: EquipmentItem | null) => {
    const itemWithSlot = item ? { ...item, fromSlot: id } : null;
    dispatch({ type: 'SET_EQUIPMENT_SLOT', slotId: id, card: itemWithSlot });
  };

  const clearEquipmentSlotById = (id: EquipmentSlotId) => setEquipmentSlotById(id, null);

  const getEquipmentReserve = (id: EquipmentSlotId) =>
    id === 'equipmentSlot1' ? equipmentSlot1Reserve : equipmentSlot2Reserve;

  const setEquipmentReserve = (id: EquipmentSlotId, items: EquipmentItem[]) => {
    dispatch({ type: 'SET_EQUIPMENT_RESERVE', slotId: id, items });
  };

  const clearEquipmentSlotWithPromote = (id: EquipmentSlotId) => {
    const reserve = id === 'equipmentSlot1' ? equipmentSlot1Reserve : equipmentSlot2Reserve;
    if (reserve.length > 0) {
      const promoted = reserve[reserve.length - 1];
      setEquipmentSlotById(id, promoted);
      setEquipmentReserve(id, reserve.slice(0, -1));
    } else {
      clearEquipmentSlotById(id);
    }
  };

  const swapEquipmentToTop = (slotId: EquipmentSlotId, reserveIndex: number) => {
    depsRef.current.pushUndoSnapshot();
    const state = engine.getState();
    const reserveKey = slotId === 'equipmentSlot1' ? 'equipmentSlot1Reserve' : 'equipmentSlot2Reserve';
    const prevReserve = state[reserveKey];
    const prevActive = state[slotId];

    if (reserveIndex < 0 || reserveIndex >= prevReserve.length) return;
    const promoted = prevReserve[reserveIndex];
    const updatedReserve = [...prevReserve];
    updatedReserve.splice(reserveIndex, 1);
    if (prevActive) {
      updatedReserve.push(prevActive);
    }

    dispatch({ type: 'SET_EQUIPMENT_SLOT', slotId, card: { ...promoted, fromSlot: slotId } as EquipmentItem });
    dispatch({ type: 'SET_EQUIPMENT_RESERVE', slotId, items: updatedReserve });

    depsRef.current.addGameLog('equip', `装备切换：${promoted.name} 替换 ${prevActive?.name ?? '空槽'}（${slotId === 'equipmentSlot1' ? '左' : '右'}槽）`);
  };

  // -- Dispose / discard / backpack -------------------------------------------

  function disposeOwnedEquipmentCard(
    card: GameCardData,
    options?: { isDestruction?: boolean; triggerLastWords?: boolean; fromSlotId?: EquipmentSlotId },
  ) {
    dispatch({
      type: 'DISPOSE_EQUIPMENT_CARD',
      card,
      isDestruction: options?.isDestruction,
      triggerLastWords: options?.triggerLastWords,
      fromSlotId: options?.fromSlotId,
    });
  }

  const discardCardToGraveyard = useCallback(
    (
      card: GameCardData | null | undefined,
      options?: {
        owner?: 'player' | 'dungeon';
        forceGraveyard?: boolean;
        forceRecycleBag?: boolean;
        waitsOverride?: number;
      },
    ) => {
      if (!card) return;
      dispatch({
        type: 'DISCARD_OWNED_CARD',
        card,
        owner: options?.owner ?? 'dungeon',
        forceGraveyard: options?.forceGraveyard,
        forceRecycleBag: options?.forceRecycleBag,
        waitsOverride: options?.waitsOverride,
      });
    },
    [dispatch],
  );

  const addCardToBackpack = useCallback(
    (card: GameCardData, options?: { toBottom?: boolean; pendingDungeonCardId?: string; skipGainNotify?: boolean }) => {
      if (options?.pendingDungeonCardId) {
        depsRef.current.storingCardIdsRef.current.add(options.pendingDungeonCardId);
      }
      dispatch({ type: 'ADD_TO_BACKPACK', card, toBottom: options?.toBottom });
    },
    [dispatch],
  );

  const enforceBackpackCapacity = useCallback(() => {
    dispatch({ type: 'ENFORCE_BACKPACK_CAPACITY' });
  }, [dispatch]);

  // -- Event transform / card flip --------------------------------------------

  const triggerEventTransform = useCallback(
    (fromCard: GameCardData, toCard: GameCardData, message?: string) =>
      new Promise<void>(resolve => {
        dispatch({
          type: 'SET_EVENT_TRANSFORM_STATE',
          payload: {
            fromCard,
            toCard,
            message,
            onComplete: () => {
              resolve();
              dispatch({ type: 'SET_EVENT_TRANSFORM_STATE', payload: null });
            },
          } as EventTransformState,
        });
      }),
    [dispatch],
  );

  const applyCardFlip = useCallback(
    (card: GameCardData, cellIndex?: number): boolean => {
      if (!card.flipTarget) return false;
      dispatch({ type: 'APPLY_CARD_FLIP', card, cellIndex });
      return true;
    },
    [dispatch],
  );

  // -- Sacrifice / swap equipment ---------------------------------------------

  const sacrificeEquipment = useCallback(
    (slotId: EquipmentSlotId): boolean => {
      const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (!slotItem) return false;
      // Single atomic reducer action: fires destroy last-words (onDestroyDraw,
      // onDestroyHeal, etc.), honors revive, disposes the card to graveyard /
      // recycle bag, and promotes the topmost reserve item.
      dispatch({ type: 'SACRIFICE_EQUIPMENT_SLOT', slotId });
      return true;
    },
    [equipmentSlot1, equipmentSlot2, dispatch],
  );

  const sacrificeAllEquipment = useCallback(
    (slotId: EquipmentSlotId): number => {
      const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (!slotItem) return 0;
      const reserve = slotId === 'equipmentSlot1' ? equipmentSlot1Reserve : equipmentSlot2Reserve;
      const allItems = [slotItem, ...reserve];
      for (const item of allItems) {
        dispatch({ type: 'DISPOSE_EQUIPMENT_CARD', card: item });
      }
      setEquipmentReserve(slotId, []);
      clearEquipmentSlotById(slotId);
      return allItems.length;
    },
    [equipmentSlot1, equipmentSlot2, equipmentSlot1Reserve, equipmentSlot2Reserve, dispatch],
  );

  const swapEquipmentSlots = useCallback(() => {
    const state = engine.getState();
    const left = state.equipmentSlot1;
    const right = state.equipmentSlot2;
    dispatch({ type: 'SWAP_EQUIPMENT_SLOTS' });
  }, [engine, dispatch]);

  // -- Amulet conversion ------------------------------------------------------

  const convertAmuletsToGold = useCallback(
    (amountPer: number) => {
      dispatch({ type: 'CONVERT_AMULETS_TO_GOLD', amountPer });
    },
    [dispatch],
  );

  // -- Discard all hand -------------------------------------------------------

  const discardAllHandCards = useCallback(() => {
    const snapshot = [...depsRef.current.handCardsRef.current];
    if (!snapshot.length) return;
    // Curses are immune to forced discard — they remain in hand.
    const discardable = snapshot.filter(c => c.type !== 'curse');
    const kept = snapshot.filter(c => c.type === 'curse');
    if (!discardable.length) return;
    // UI-only: kick off flight animations to graveyard / recycle bag. Routing
    // and APPLY_DISCARD_EFFECTS are owned by the DISCARD_ALL_HAND reducer,
    // which enqueues per-card DISCARD_OWNED_CARD internally.
    discardable.forEach(card => {
      depsRef.current.triggerDiscardFlight(card, isRecyclableFromHand(card) ? 'recycle-bag' : 'graveyard');
    });
    depsRef.current.handCardsRef.current = kept;
    dispatch({ type: 'DISCARD_ALL_HAND' });
  }, [dispatch]);

  // ---------------------------------------------------------------------------
  // useGameEvent listeners — card animation triggers
  // ---------------------------------------------------------------------------

  useGameEvent('card:discardShock', ({ count }) => {
    depsRef.current.triggerDiscardShock(count);
  });

  useGameEvent('card:flipShock', ({ count }) => {
    depsRef.current.triggerFlipShock(count);
  });

  useGameEvent('card:graveNova', ({ card }) => {
    depsRef.current.triggerGraveNova(card);
  });

  useGameEvent('card:newCardGained', ({ count, source }) => {
    depsRef.current.onNewCardGainedRef.current?.(count, source as 'graveyard' | 'classPool' | undefined);
  });

  // ---------------------------------------------------------------------------
  // Return bag
  // ---------------------------------------------------------------------------

  return {
    // Card-in-hand
    ensureCardInHand,
    consumeClassCardFromHand,

    // Backpack draw
    takeRandomCardsFromBackpack,
    drawFromBackpackToHand,

    // Recycle bag
    addPermanentMagicToRecycleBag,
    restorePermanentMagicFromRecycleBag,
    drawFromRecycleBagToHand,
    tickRecycleForge,

    // Class deck
    drawClassCardsToBackpack,

    // Discard side effects
    applyDiscardSideEffects,
    drainPendingDiscardEffects,

    // Equipment
    getEquipmentSlots,
    getEquipmentSlotBonus,
    calculateSlotArmorValue,
    getEquipmentSlotStatModifier,
    setEquipmentSlotBonus,
    setEquipmentSlotById,
    clearEquipmentSlotById,
    clearEquipmentSlotWithPromote,
    getEquipmentReserve,
    setEquipmentReserve,
    swapEquipmentToTop,

    // Graveyard / dispose / discard
    addToGraveyard,
    disposeOwnedEquipmentCard,
    discardCardToGraveyard,
    addCardToBackpack,
    enforceBackpackCapacity,

    // Event transform / flip
    triggerEventTransform,
    applyCardFlip,

    // Sacrifice / swap
    sacrificeEquipment,
    sacrificeAllEquipment,
    swapEquipmentSlots,

    // Amulet
    convertAmuletsToGold,

    // Discard all
    discardAllHandCards,

    // Utility
    isRecyclableFromHand,
    sanitizeCardForGraveyard,

    // Derived values
    amuletEffects,
    backpackCapacity,
    effectiveHandLimit,
    attackBonus,
    defenseBonus,
  };
}
