import React, { useCallback, useMemo } from 'react';
import { useGameEngine, useGameState, useEngineSetter } from '@/hooks/useGameEngine';
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
  createEmptyAmuletEffects,
} from '@/game-core/constants';
import {
  isRecyclableFromHand,
  flattenActiveRowSlots,
  sanitizeCardMetadata,
  logBackpackDraw,
  computeAmuletAuraReversal,
  isDamageableTarget,
} from '@/game-core/helpers';
import { getEquipmentSlotsWithSuppressedTempAttack } from '@/game-core/buildingAura';
import { resetMonsterForGraveyard } from '@/game-core/cards';

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

  triggerDiscardFlight: (card: GameCardData, destination: 'graveyard' | 'recycle-bag') => Promise<void>;
  triggerDiscardShock: () => void;
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
  const gs = useGameState(s => s);

  const {
    hp,
    amuletSlots,
    backpackItems,
    backpackCapacityModifier,
    permanentMagicRecycleBag,
    classDeck,
    handCards,
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
    permanentSpellDamageBonus,
    weaponMasterBonus,
    shieldMasterBonus,
    handLimitBonus,
    defensiveStanceActive,
    recycleForgePlayCount,
  } = gs;

  // -- Setters ----------------------------------------------------------------

  const setHandCards = useEngineSetter('handCards');
  const setBackpackItems = useEngineSetter('backpackItems');
  const setPermanentMagicRecycleBag = useEngineSetter('permanentMagicRecycleBag');
  const setClassDeck = useEngineSetter('classDeck');
  const setClassCardsInHand = useEngineSetter('classCardsInHand');
  const setDiscardedCards = useEngineSetter('discardedCards');
  const setGold = useEngineSetter('gold');
  const setEquipmentSlot1 = useEngineSetter('equipmentSlot1');
  const setEquipmentSlot2 = useEngineSetter('equipmentSlot2');
  const setEquipmentSlot1Reserve = useEngineSetter('equipmentSlot1Reserve');
  const setEquipmentSlot2Reserve = useEngineSetter('equipmentSlot2Reserve');
  const setEquipmentSlotBonuses = useEngineSetter('equipmentSlotBonuses');
  const setActiveCards = useEngineSetter('activeCards');
  const setAmuletSlots = useEngineSetter('amuletSlots');
  const setSlotTempAttack = useEngineSetter('slotTempAttack');
  const setSlotTempArmor = useEngineSetter('slotTempArmor');
  const setWaveDiscardCount = useEngineSetter('waveDiscardCount');
  const setRecycleForgePlayCount = useEngineSetter('recycleForgePlayCount');
  const setRecycleBackpackProgress = useEngineSetter('recycleBackpackProgress');
  const setBackpackCapacityModifier = useEngineSetter('backpackCapacityModifier');
  const setHeroSkillBanner = useEngineSetter('heroSkillBanner');
  const setEventTransformState = useEngineSetter('eventTransformState');

  // -- Derived values ---------------------------------------------------------

  const amuletEffects = useMemo<ActiveAmuletEffects>(() => {
    return amuletSlots.reduce<ActiveAmuletEffects>((state, slot) => {
      if (!slot) return state;
      switch (slot.amuletEffect) {
        case 'heal': state.hasHeal = true; break;
        case 'balance': state.hasBalance = true; break;
        case 'life': state.lifeOverkillBonus = 4; break;
        case 'catapult': state.hasCatapult = true; break;
        case 'flash': state.hasFlash = true; break;
        case 'strength': state.hasStrength = true; break;
        case 'dual-guard': state.hasDualGuard = true; break;
        case 'discard-zap': state.hasDiscardShock = true; break;
        case 'flip-gold': state.hasFlipGold = true; break;
        case 'recycle-forge': state.hasRecycleForge = true; break;
        case 'lone-card': state.hasLoneCard = true; break;
        case 'equipment-salvage': state.hasEquipmentSalvage = true; break;
        case 'bloodrage-attack': state.hasBloodrageAttack = true; break;
        case 'persuade-on-temp-attack':
          state.hasPersuadeOnTempAttack = true;
          state.persuadeOnTempAttackBonus = (slot.upgradeLevel ?? 0) >= 1 ? 10 : 5;
          break;
        case 'persuade-grant-recycle-fetch':
          state.hasPersuadeGrantRecycleFetch = true;
          state.persuadeGrantRecycleFetchCount = (slot.upgradeLevel ?? 0) >= 1 ? 2 : 1;
          break;
        case 'damage-class-discover': state.hasDamageClassDiscover = true; break;
        case 'persuade-graveyard-stack': state.hasPersuadeGraveyardStack = true; break;
        case 'swap-upgrade': state.hasSwapUpgrade = true; break;
        case 'stun-upgrade-cap': state.hasStunUpgradeCap = true; break;
        case 'recycle-backpack-expand': state.hasRecycleBackpackExpand = true; break;
        case 'dungeon-gold': state.hasDungeonGold = true; break;
        case 'stun-rate-boost': state.stunRateBoost += 20; break;
        case 'end-turn-draw': state.hasEndTurnDraw = true; break;
      }
      const bonus = slot.amuletAuraBonus;
      if (bonus) {
        if (typeof bonus.attack === 'number') state.aura.attack += bonus.attack;
        if (typeof bonus.defense === 'number') state.aura.defense += bonus.defense;
        if (typeof bonus.maxHp === 'number') state.aura.maxHp += bonus.maxHp;
      }
      if (typeof slot.value === 'number' && slot.effect) {
        if (slot.effect === 'attack' && !(bonus && typeof bonus.attack === 'number'))
          state.aura.attack += slot.value;
        if (slot.effect === 'defense' && !(bonus && typeof bonus.defense === 'number'))
          state.aura.defense += slot.value;
        if (slot.effect === 'health' && !(bonus && typeof bonus.maxHp === 'number'))
          state.aura.maxHp += slot.value;
      }
      return state;
    }, createEmptyAmuletEffects());
  }, [amuletSlots]);

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
    return resetMonsterForGraveyard({ ...rest });
  };

  // -- Functions --------------------------------------------------------------

  const ensureCardInHand = useCallback((card: GameCardData) => {
    setHandCards(prev => {
      if (prev.some(existing => existing.id === card.id)) {
        return prev;
      }
      logBackpackDraw('hand-insert', {
        cardId: card.id,
        name: card.name,
        prevHandSize: prev.length,
        nextHandSize: prev.length + 1,
      });
      const next = [...prev, card];
      depsRef.current.handCardsRef.current = next;
      return next;
    });
  }, [setHandCards]);

  const consumeClassCardFromHand = useCallback((cardId: string) => {
    setClassCardsInHand(prev => prev.filter(card => card.id !== cardId));
  }, [setClassCardsInHand]);

  // -- Graveyard --------------------------------------------------------------

  function addToGraveyard(card: GameCardData) {
    const sanitized = sanitizeCardForGraveyard(card);
    setDiscardedCards(prev => {
      if (prev.some(c => c.id === sanitized.id)) {
        return prev;
      }
      setWaveDiscardCount(count => count + 1);
      const next = [...prev, sanitized];
      depsRef.current.discardedCardsRef.current = next;
      return next;
    });
    depsRef.current.addGameLog('deck', `「${card.name}」→ 坟场`);
  }

  // -- Recycle Bag ------------------------------------------------------------

  const addPermanentMagicToRecycleBag = useCallback(
    (card: GameCardData) => {
      const sanitized = sanitizeCardMetadata(card);
      let payload: GameCardData = sanitized;
      if (isPermRecycleEquipment(sanitized)) {
        const maxD = sanitized.maxDurability ?? sanitized.durability ?? 1;
        payload = { ...sanitized, durability: maxD, maxDurability: maxD };
      } else if ((sanitized.type === 'weapon' || sanitized.type === 'shield' || sanitized.type === 'monster') && sanitized.recycleDelay != null && sanitized.recycleDelay > 0) {
        payload = { ...sanitized, durability: 1 };
      }
      const withWaits: GameCardData = { ...payload, _recycleWaits: payload.recycleDelay ?? 1 };
      setPermanentMagicRecycleBag(prev => {
        const filtered = prev.filter(existing => existing.id !== withWaits.id);
        return [...filtered, withWaits];
      });
      depsRef.current.addGameLog('deck', `「${card.name}」→ 回收袋`);

      const state = engine.getState();
      const recycleAmulet = state.amuletSlots.find(s => s?.amuletEffect === 'recycle-backpack-expand');
      if (recycleAmulet) {
        const recycleThreshold = (recycleAmulet.upgradeLevel ?? 0) >= 1 ? 6 : 8;
        const progress = state.recycleBackpackProgress + 1;
        if (progress >= recycleThreshold) {
          setRecycleBackpackProgress(0);
          setBackpackCapacityModifier(prev => prev + 3);
          setAmuletSlots(prev => prev.map(slot => {
            if (slot?.amuletEffect !== 'recycle-backpack-expand') return slot;
            return { ...slot, _counterDisplay: `0/${recycleThreshold}` };
          }));
          depsRef.current.addGameLog('amulet', `积蓄之符：累计回收 ${recycleThreshold} 张牌，背包上限 +3！`);
        } else {
          setRecycleBackpackProgress(progress);
          setAmuletSlots(prev => prev.map(slot => {
            if (slot?.amuletEffect !== 'recycle-backpack-expand') return slot;
            return { ...slot, _counterDisplay: `${progress}/${recycleThreshold}` };
          }));
        }
      }
    },
    [setPermanentMagicRecycleBag, engine, setRecycleBackpackProgress, setBackpackCapacityModifier, setAmuletSlots],
  );

  const restorePermanentMagicFromRecycleBag = useCallback(() => {
    const currentBag = permanentMagicRecycleBag;
    if (!currentBag.length) return 0;

    const readyCards: GameCardData[] = [];
    const waitingCards: GameCardData[] = [];
    for (const card of currentBag) {
      const waits = (card._recycleWaits ?? 1) - 1;
      if (waits <= 0) {
        readyCards.push(card);
      } else {
        waitingCards.push({ ...card, _recycleWaits: waits });
      }
    }

    const currentBackpackLength = engine.getState().backpackItems.length;
    const availableSlots = Math.max(0, backpackCapacity - currentBackpackLength);
    const cardsToRestore = readyCards.slice(0, availableSlots).map(card => sanitizeCardMetadata(card));
    const restoredCount = cardsToRestore.length;

    const remainingReady = readyCards.slice(restoredCount);
    setPermanentMagicRecycleBag([...remainingReady, ...waitingCards]);

    if (!restoredCount) return 0;

    depsRef.current.addGameLog('deck', `回收袋返还 ${restoredCount} 张牌：${cardsToRestore.map(c => c.name).join('、')}`);

    setBackpackItems(prev => [...prev, ...cardsToRestore]);

    return restoredCount;
  }, [backpackCapacity, permanentMagicRecycleBag, engine, setPermanentMagicRecycleBag, setBackpackItems]);

  // -- Backpack draw ----------------------------------------------------------

  const takeRandomCardsFromBackpack = (count: number): GameCardData[] => {
    if (count <= 0) {
      return [];
    }
    const source = engine.getState().backpackItems;
    if (!source.length) {
      logBackpackDraw('backpack-empty-snapshot', {
        requested: count,
        pendingAutoDraws: depsRef.current.pendingAutoDrawsRef.current,
      });
      return [];
    }
    const pool = [...source];
    const drawTotal = Math.min(count, pool.length);
    if (drawTotal <= 0) {
      return [];
    }
    const drawnCards: GameCardData[] = [];
    for (let i = 0; i < drawTotal; i += 1) {
      const randomIndex = Math.floor(Math.random() * pool.length);
      const [card] = pool.splice(randomIndex, 1);
      if (card) {
        drawnCards.push(card);
      }
    }
    const drawnIds = new Set(drawnCards.map(c => c.id));
    setBackpackItems(prev => prev.filter(c => !drawnIds.has(c.id)));
    logBackpackDraw('backpack-take', {
      requested: count,
      delivered: drawnCards.length,
      prevCount: source.length,
      nextCount: pool.length,
    });
    return drawnCards;
  };

  const drawFromBackpackToHand = (): GameCardData | null => {
    const flightsCount = depsRef.current.backpackHandFlightsRef.current.length;
    const st = engine.getState();
    const liveHandSize = st.handCards.length;
    const liveHandLimit = HAND_LIMIT + (st.handLimitBonus ?? 0);
    const availableSlots = Math.max(0, liveHandLimit - (liveHandSize + flightsCount));
    logBackpackDraw('draw-request', {
      handSize: liveHandSize,
      flights: flightsCount,
      availableSlots,
      backpackStateCount: backpackItems.length,
      backpackRefCount: st.backpackItems.length,
    });
    if (availableSlots <= 0) {
      return null;
    }

    const [drawnCard] = takeRandomCardsFromBackpack(1);
    if (!drawnCard) {
      logBackpackDraw('draw-empty');
      return null;
    }

    depsRef.current.queueCardIntoHand(drawnCard);
    logBackpackDraw('draw-success', {
      cardId: drawnCard.id,
      name: drawnCard.name,
      remainingBackpack: engine.getState().backpackItems.length,
    });
    return drawnCard;
  };

  const drawFromRecycleBagToHand = (count: number): GameCardData[] => {
    const bag = engine.getState().permanentMagicRecycleBag;
    if (!bag.length || count <= 0) return [];
    const take = Math.min(count, bag.length);
    const picked = bag.slice(0, take).map(c => sanitizeCardMetadata(c));
    const remaining = bag.slice(take);
    setPermanentMagicRecycleBag(remaining);
    for (const card of picked) {
      depsRef.current.queueCardIntoHand(card);
    }
    return picked;
  };

  // -- Recycle Forge ----------------------------------------------------------

  const updateRecycleForgeCounter = (count: number) => {
    const display = count % 5;
    setAmuletSlots(prev => prev.map(slot => {
      if (slot?.amuletEffect !== 'recycle-forge') return slot;
      return {
        ...slot,
        description: `每使用或弃回 5 张牌，回收袋洗回背包（所有牌剩余瀑流 -1），然后抽 2 张牌。(可超手牌上限) [${display}/5]`,
      };
    }));
  };

  const tickRecycleForge = () => {
    if (!engine.getState().amuletSlots.some(s => s?.amuletEffect === 'recycle-forge')) return;
    const next = engine.getState().recycleForgePlayCount + 1;
    setRecycleForgePlayCount(next);
    if (next % 5 === 0) {
      const restored = restorePermanentMagicFromRecycleBag();
      const drawn = takeRandomCardsFromBackpack(Math.min(2, engine.getState().backpackItems.length));
      drawn.forEach(c => ensureCardInHand(c));
      const parts: string[] = [];
      parts.push(restored > 0 ? `回收熔炉：回收袋返还 ${restored} 张牌` : '回收熔炉：回收袋为空');
      if (drawn.length > 0) parts.push(`抽到 ${drawn.map(c => c.name).join('、')}`);
      setHeroSkillBanner(parts.join('，') + '。');
      depsRef.current.addGameLog('amulet', `回收熔炉触发（${next} 张牌已使用）：${parts.join('，')}。`);
    }
    updateRecycleForgeCounter(next);
  };

  // -- Class Deck -------------------------------------------------------------

  const drawClassCardsToBackpack = useCallback(
    (count: number, source: string, filter?: (card: GameCardData) => boolean): GameCardData[] => {
      if (count <= 0) return [];
      if (classDeck.length === 0) return [];

      const availableSlots = backpackCapacity - backpackItems.length;
      if (availableSlots <= 0) return [];

      const filteredPool = filter ? classDeck.filter(filter) : classDeck;
      const pool = filteredPool.length > 0 ? filteredPool : classDeck;
      if (pool.length === 0) return [];

      const drawLimit = Math.min(count, pool.length, availableSlots);
      if (drawLimit <= 0) return [];

      const shuffledPool = [...pool].sort(() => Math.random() - 0.5);
      const drawnCards = shuffledPool.slice(0, drawLimit);
      const drawnIds = new Set(drawnCards.map(card => card.id));

      setClassDeck(prev => prev.filter(card => !drawnIds.has(card.id)));
      setBackpackItems(prev => {
        const next = [...drawnCards, ...prev];
        if (next.length <= backpackCapacity) return next;
        const overflow = next.slice(backpackCapacity);
        if (overflow.length > 0) {
          setPermanentMagicRecycleBag(bag => [
            ...bag,
            ...overflow.map(c => ({ ...c, _recycleWaits: c.recycleDelay ?? 1 })),
          ]);
        }
        return next.slice(0, backpackCapacity);
      });

      if (DEV_MODE) {
        console.debug('[ClassDeckDraw]', {
          source,
          requested: count,
          delivered: drawLimit,
          filtered: Boolean(filter),
          filterFallback: Boolean(filter && filteredPool.length === 0),
        });
      }

      if (drawnCards.length > 0) {
        depsRef.current.addGameLog(
          'skill',
          `获得专属卡（${source}）：${drawnCards.map(c => c.name).join('、')}`,
        );
        depsRef.current.onNewCardGainedRef?.current?.(drawnCards.length, 'classPool');
      }

      return drawnCards;
    },
    [backpackItems.length, classDeck, backpackCapacity, setClassDeck, setBackpackItems, setPermanentMagicRecycleBag],
  );

  const returnCardsToClassDeck = useCallback((cards: GameCardData[]) => {
    if (!cards.length) return;
    setClassDeck(prev => [...prev, ...cards].sort(() => Math.random() - 0.5));
  }, [setClassDeck]);

  // -- Discard side effects ---------------------------------------------------

  const executeDiscardSideEffects = useCallback(
    (card: GameCardData, owner: 'player' | 'dungeon', opts?: { toRecycleBag?: boolean; isEquipmentDisplace?: boolean }) => {
      // --- Phase 1: card-own on-discard effects (resolve first) ---
      if (owner === 'player' && card.type === 'magic' && card.magicEffect === 'honor-blood') {
        const monsters = flattenActiveRowSlots(activeCards).filter(
          (c): c is GameCardData => Boolean(c && c.type === 'monster'),
        );
        if (monsters.length > 0) {
          const atkReduction = 2;
          monsters.forEach(monster => {
            const currentAtk = monster.attack ?? monster.value;
            const newAtk = Math.max(0, currentAtk - atkReduction);
            depsRef.current.updateMonsterCard(monster.id, m => ({
              ...m,
              attack: newAtk,
              value: Math.max(0, m.value - atkReduction),
              tempAttackBoost: (m.tempAttackBoost ?? 0) - atkReduction,
            }));
          });
          depsRef.current.addGameLog('magic', `${card.name} 被弃：激活行所有怪物攻击力 -${atkReduction}`);
          setHeroSkillBanner(`${card.name} 被弃，激活行所有怪物攻击力 -${atkReduction}！`);
        }
      } else if (card.onDiscardDamage) {
        const monsters = flattenActiveRowSlots(activeCards).filter(
          (c): c is GameCardData => isDamageableTarget(c),
        );
        if (monsters.length > 0) {
          const target = monsters[Math.floor(Math.random() * monsters.length)];
          const dmg = depsRef.current.getSpellDamage(card.onDiscardDamage);
          depsRef.current.dealDamageToMonster(target, dmg, { pulses: 2, isSpellDamage: true });
          depsRef.current.addGameLog('magic', `${card.name} 被弃：对 ${target.name} 造成 ${dmg} 点法术伤害`);
          setHeroSkillBanner(`${card.name} 被弃，对 ${target.name} 造成了 ${dmg} 点伤害！`);
        }
      }
      if (owner === 'player' && card.onDiscardDraw && card.onDiscardDraw > 0) {
        const drawCount = card.onDiscardDraw;
        const drawnNames: string[] = [];
        for (let i = 0; i < drawCount; i++) {
          const drawn = drawFromBackpackToHand();
          if (drawn) drawnNames.push(drawn.name);
        }
        if (drawnNames.length > 0) {
          depsRef.current.addGameLog('magic', `${card.name} 被弃：从背包抽取了 ${drawnNames.join('、')}`);
          setHeroSkillBanner(`${card.name} 被弃，抽取了 ${drawnNames.join('、')}！`);
        } else {
          depsRef.current.addGameLog('magic', `${card.name} 被弃：背包为空，未能抽牌`);
        }
      }

      // --- Phase 2: per-discard triggers (resolve after card-own effects) ---
      if (owner === 'player' && depsRef.current.eternalRelicsRef.current.some(r => r.id === 'discard-profit')) {
        setGold(prev => prev + 2);
        depsRef.current.addGameLog('gold', `永恒护符·弃牌生金：弃回「${card.name}」获得 2 金币`);
      }
      if (amuletEffects.hasCatapult && !opts?.toRecycleBag && !opts?.isEquipmentDisplace) {
        const drawnNames: string[] = [];
        for (let ci = 0; ci < 2; ci++) {
          const drawn = drawFromBackpackToHand();
          if (drawn) drawnNames.push(`「${drawn.name}」`);
        }
        if (drawnNames.length > 0) {
          depsRef.current.addGameLog('amulet', `弹射护符：弃置「${card.name}」后从背包抽了${drawnNames.join('、')}`);
        }
      }
      if ((card as GameCardData).amuletEffect !== 'discard-zap' && !opts?.toRecycleBag) {
        depsRef.current.triggerDiscardShock();
      }
    },
    [
      activeCards,
      amuletEffects.hasCatapult,
      setGold,
      setHeroSkillBanner,
    ],
  );

  const applyDiscardSideEffects = useCallback(
    (card: GameCardData, owner: 'player' | 'dungeon', opts?: { toRecycleBag?: boolean; isEquipmentDisplace?: boolean }) => {
      if (depsRef.current.stagingCardsRef.current.length > 0) {
        depsRef.current.pendingDiscardEffectsQueueRef.current.push({ card, owner, opts });
        return;
      }
      executeDiscardSideEffects(card, owner, opts);
    },
    [executeDiscardSideEffects],
  );

  const drainPendingDiscardEffects = useCallback(() => {
    const queue = depsRef.current.pendingDiscardEffectsQueueRef.current;
    while (queue.length > 0) {
      const entry = queue.shift()!;
      executeDiscardSideEffects(entry.card, entry.owner, entry.opts);
    }
  }, [executeDiscardSideEffects]);

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
    if (slotItem.type === 'monster') {
      const baseArmor = slotItem.hp ?? slotItem.value;
      const slotShieldBonus = getEquipmentSlotBonus(slotId, 'shield');
      const rawSlotTemp = slotTempArmor[slotId] ?? 0;
      const bonusDamaged = slotItem.armorBonusDamaged ?? 0;
      return Math.max(0, baseArmor + defenseBonus + slotShieldBonus + rawSlotTemp - bonusDamaged);
    }
    const baseArmorMax = slotItem.armorMax ?? slotItem.value;
    const slotShieldBonus = getEquipmentSlotBonus(slotId, 'shield');
    const rawSlotTemp = slotTempArmor[slotId] ?? 0;
    const permanentBonus = Math.max(0, defenseBonus + slotShieldBonus);
    const bonusDamaged = slotItem.armorBonusDamaged ?? 0;
    const storedBaseArmor = Math.min(slotItem.armor ?? baseArmorMax, baseArmorMax);
    const effectiveBonus = Math.max(0, permanentBonus + rawSlotTemp - bonusDamaged);
    const currentArmor = storedBaseArmor + effectiveBonus;
    const effectiveArmorMax = baseArmorMax + permanentBonus + rawSlotTemp;
    return Math.min(currentArmor, effectiveArmorMax);
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
        flashHalve: amuletEffects.hasFlash,
      };
    }

    if (slotItem.type === 'shield') {
      const slotShieldBonus = getEquipmentSlotBonus(slotId, 'shield');
      const rawSlotTemp = slotTempArmor[slotId] ?? 0;
      const rawBonus = Math.max(0, defenseBonus + slotShieldBonus) + rawSlotTemp;
      const bonusDamaged = slotItem.armorBonusDamaged ?? 0;
      const permanentShieldBonus = Math.max(0, rawBonus - bonusDamaged);

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
      const monsterBonusDamaged = slotItem.armorBonusDamaged ?? 0;
      const monsterRawBonus = Math.max(0, defenseBonus + slotShieldBonus) + rawSlotTempMonster;
      const effectiveShieldMod = Math.max(0, monsterRawBonus - monsterBonusDamaged);

      return {
        appliesTo: 'monster' as const,
        modifier,
        shieldModifier: effectiveShieldMod,
        permanentShieldBonus: effectiveShieldMod,
        flashHalve: amuletEffects.hasFlash,
      };
    }

    return null;
  };

  const setEquipmentSlotBonus = (
    slotId: EquipmentSlotId,
    bonusType: keyof SlotPermanentBonus,
    value: number | ((current: number) => number),
  ) => {
    setEquipmentSlotBonuses(prev => {
      const currentValue = prev[slotId][bonusType];
      const nextValue = typeof value === 'function' ? value(currentValue) : value;
      if (currentValue === nextValue) {
        return prev;
      }
      return {
        ...prev,
        [slotId]: {
          ...prev[slotId],
          [bonusType]: nextValue,
        },
      };
    });
  };

  const setEquipmentSlotById = (id: EquipmentSlotId, item: EquipmentItem | null) => {
    const itemWithSlot = item ? { ...item, fromSlot: id } : null;
    if (id === 'equipmentSlot1') setEquipmentSlot1(itemWithSlot);
    else setEquipmentSlot2(itemWithSlot);
  };

  const clearEquipmentSlotById = (id: EquipmentSlotId) => setEquipmentSlotById(id, null);

  const getEquipmentReserve = (id: EquipmentSlotId) =>
    id === 'equipmentSlot1' ? equipmentSlot1Reserve : equipmentSlot2Reserve;

  const setEquipmentReserve = (id: EquipmentSlotId, items: EquipmentItem[]) => {
    if (id === 'equipmentSlot1') setEquipmentSlot1Reserve(items);
    else setEquipmentSlot2Reserve(items);
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
    const slotSetter = slotId === 'equipmentSlot1' ? setEquipmentSlot1 : setEquipmentSlot2;
    const reserveSetter = slotId === 'equipmentSlot1' ? setEquipmentSlot1Reserve : setEquipmentSlot2Reserve;
    let swappedInName = '';
    let swappedOutName = '';

    reserveSetter(prevReserve => {
      if (reserveIndex < 0 || reserveIndex >= prevReserve.length) return prevReserve;
      const promoted = prevReserve[reserveIndex];
      swappedInName = promoted.name;
      const updatedReserve = [...prevReserve];
      updatedReserve.splice(reserveIndex, 1);

      slotSetter(prevActive => {
        swappedOutName = prevActive?.name ?? '空槽';
        if (prevActive) {
          updatedReserve.push(prevActive);
        }
        return { ...promoted, fromSlot: slotId } as EquipmentItem;
      });

      return updatedReserve;
    });

    depsRef.current.addGameLog('equip', `装备切换：${swappedInName} 替换 ${swappedOutName}（${slotId === 'equipmentSlot1' ? '左' : '右'}槽）`);
  };

  // -- Dispose / discard / backpack -------------------------------------------

  function disposeOwnedEquipmentCard(card: GameCardData, options?: { isDestruction?: boolean }) {
    if (options?.isDestruction && amuletEffects.hasEquipmentSalvage && (card.type === 'weapon' || card.type === 'shield')) {
      const newMaxDur = (card.maxDurability ?? 1) - 1;
      if (newMaxDur <= 0) {
        depsRef.current.addGameLog('equip', `残骸回收符：${card.name} 耐久上限归零，从游戏中移除！`);
        setHeroSkillBanner(`${card.name} 耐久上限归零，移除！`);
        return;
      }
      const {
        fromSlot, armor: _clrArmor, armorBonusDamaged: _clrBonusDmg,
        _shieldBlockCount: _clrBlockCnt, reviveUsed: _clrRevive,
        equipmentReviveUsed: _clrEqRevive, wraithRebirthUsed: _clrWraith,
        ...rest
      } = card as GameCardData & { fromSlot?: string; _shieldBlockCount?: number };
      const salvaged = { ...rest, durability: 1, maxDurability: newMaxDur };
      const slotHint: FlightSourceHint | undefined =
        fromSlot === 'equipmentSlot1' || fromSlot === 'equipmentSlot2' ? fromSlot : undefined;
      depsRef.current.queueCardIntoHand(salvaged, slotHint);
      depsRef.current.addGameLog('equip', `残骸回收符：${card.name} 回到手牌（耐久 1/${newMaxDur}）！`);
      setHeroSkillBanner(`残骸回收！${card.name} 回到手牌！`);
      return;
    }
    const toRecycleBag = isPermRecycleEquipment(card) ||
      ((card.type === 'weapon' || card.type === 'shield' || card.type === 'monster') && card.recycleDelay != null && card.recycleDelay > 0);
    if (toRecycleBag) {
      addPermanentMagicToRecycleBag(card);
    } else {
      addToGraveyard(card);
    }
    if (!options?.isDestruction) {
      applyDiscardSideEffects(card, 'player', { toRecycleBag, isEquipmentDisplace: true });
    }
  }

  const discardCardToGraveyard = useCallback(
    (card: GameCardData | null | undefined, options?: { owner?: 'player' | 'dungeon'; forceGraveyard?: boolean; forceRecycleBag?: boolean }) => {
      if (!card) {
        return;
      }
      const owner = options?.owner ?? 'dungeon';
      const isGraveNovaCard =
        (card as KnightCardData | undefined)?.knightEffect === 'grave-nova';
      const isPerm = isRecyclableFromHand(card);
      let toRecycleBag = false;
      if (owner === 'player' && isGraveNovaCard) {
        depsRef.current.triggerGraveNova(card);
        addPermanentMagicToRecycleBag(card);
        toRecycleBag = true;
      } else if (options?.forceRecycleBag || isPerm) {
        addPermanentMagicToRecycleBag(card);
        toRecycleBag = true;
      } else {
        addToGraveyard(card);
      }
      applyDiscardSideEffects(card, owner, { toRecycleBag });
    },
    [addPermanentMagicToRecycleBag, applyDiscardSideEffects],
  );

  const addCardToBackpack = useCallback(
    (card: GameCardData, options?: { toBottom?: boolean; pendingDungeonCardId?: string; skipGainNotify?: boolean }) => {
      const sanitized = { ...card };
      if (options?.pendingDungeonCardId) {
        depsRef.current.storingCardIdsRef.current.add(options.pendingDungeonCardId);
        logBackpackDraw('backpack-store-pending', {
          cardId: options.pendingDungeonCardId,
          pending: depsRef.current.storingCardIdsRef.current.size,
        });
      }
      setBackpackItems(prev => {
        const next = options?.toBottom ? [...prev, sanitized] : [sanitized, ...prev];
        let finalList: GameCardData[];
        if (next.length <= backpackCapacity) {
          finalList = next;
        } else {
          const kept = next.slice(0, backpackCapacity);
          next.slice(backpackCapacity).forEach(overflowCard => {
            addPermanentMagicToRecycleBag(overflowCard);
          });
          finalList = kept;
        }
        logBackpackDraw('backpack-add', {
          cardId: sanitized.id,
          fromDungeon: Boolean(options?.pendingDungeonCardId),
          toBottom: Boolean(options?.toBottom),
          prevLength: prev.length,
          nextLength: finalList.length,
          overflow: Math.max(0, next.length - finalList.length),
        });
        return finalList;
      });
      if (!options?.skipGainNotify) {
        depsRef.current.onNewCardGainedRef?.current?.(1);
      }
    },
    [backpackCapacity, setBackpackItems],
  );

  const enforceBackpackCapacity = useCallback(() => {
    setBackpackItems(prev => {
      if (prev.length <= backpackCapacity) {
        return prev;
      }
      const kept = prev.slice(0, backpackCapacity);
      prev.slice(backpackCapacity).forEach(overflowCard => {
        addPermanentMagicToRecycleBag(overflowCard);
      });
      return kept;
    });
  }, [backpackCapacity, setBackpackItems]);

  // -- Event transform / card flip --------------------------------------------

  const triggerEventTransform = useCallback(
    (fromCard: GameCardData, toCard: GameCardData, message?: string) =>
      new Promise<void>(resolve => {
        setEventTransformState({
          fromCard,
          toCard,
          message,
          onComplete: () => {
            resolve();
            setEventTransformState(null);
          },
        } as EventTransformState);
      }),
    [setEventTransformState],
  );

  const applyCardFlip = useCallback(
    async (card: GameCardData, cellIndex?: number): Promise<boolean> => {
      const flip = card.flipTarget;
      if (!flip) return false;

      const destination = flip.destination ?? 'graveyard';
      depsRef.current.addGameLog('event', `卡牌转化：${card.name} → ${flip.toCard.name}`);
      await triggerEventTransform(card, flip.toCard, flip.message);
      if (flip.banner) {
        setHeroSkillBanner(flip.banner);
      }

      if (destination === 'stay') {
        const idx = cellIndex ?? activeCards.findIndex(c => c?.id === card.id);
        if (idx !== -1) {
          const cardWithFlip: GameCardData = { ...card };
          const placedCard: GameCardData = {
            ...flip.toCard,
            _flipBackCard: cardWithFlip,
            ...(flip.toCard.type === 'building' && (flip.toCard.name === '命运之刃' || flip.toCard.name === '增幅祭坛')
              ? { hasReleaseCharge: true, _fateBladeLastSlot: idx }
              : {}),
          };
          setActiveCards(prev => {
            const next = [...prev];
            next[idx] = placedCard;
            return next;
          });
        }
      } else if (destination === 'backpack') {
        addCardToBackpack(flip.toCard);
      } else if (destination === 'hand') {
        ensureCardInHand(flip.toCard);
      } else {
        addToGraveyard(flip.toCard);
      }

      if (amuletEffects.hasFlipGold) {
        setGold(prev => prev + FLIP_GOLD_REWARD);
        depsRef.current.addGameLog('gold', `熔炉之心：卡牌翻转，获得 ${FLIP_GOLD_REWARD} 金币。`);
      }

      return true;
    },
    [activeCards, addCardToBackpack, amuletEffects.hasFlipGold, ensureCardInHand, setHeroSkillBanner, triggerEventTransform, setActiveCards, setGold],
  );

  // -- Sacrifice / swap equipment ---------------------------------------------

  const sacrificeEquipment = useCallback(
    (slotId: EquipmentSlotId): boolean => {
      const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (!slotItem) {
        return false;
      }
      const toRecycleBag = isPermRecycleEquipment(slotItem) ||
        ((slotItem.type === 'weapon' || slotItem.type === 'shield' || slotItem.type === 'monster') && slotItem.recycleDelay != null && slotItem.recycleDelay > 0);
      if (toRecycleBag) {
        addPermanentMagicToRecycleBag(slotItem);
      } else {
        addToGraveyard(slotItem);
      }
      const reserve = slotId === 'equipmentSlot1' ? equipmentSlot1Reserve : equipmentSlot2Reserve;
      if (reserve.length > 0) {
        const promoted = reserve[reserve.length - 1];
        setEquipmentSlotById(slotId, promoted);
        setEquipmentReserve(slotId, reserve.slice(0, -1));
      } else {
        clearEquipmentSlotById(slotId);
      }
      return true;
    },
    [
      addPermanentMagicToRecycleBag,
      equipmentSlot1,
      equipmentSlot2,
      equipmentSlot1Reserve,
      equipmentSlot2Reserve,
    ],
  );

  const sacrificeAllEquipment = useCallback(
    (slotId: EquipmentSlotId): number => {
      const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (!slotItem) return 0;
      let count = 0;
      const sendToGrave = (item: EquipmentItem) => {
        const toRecycleBag = isPermRecycleEquipment(item) ||
          ((item.type === 'weapon' || item.type === 'shield' || item.type === 'monster') && item.recycleDelay != null && item.recycleDelay > 0);
        if (toRecycleBag) {
          addPermanentMagicToRecycleBag(item);
        } else {
          addToGraveyard(item);
        }
        count++;
      };
      sendToGrave(slotItem);
      const reserve = slotId === 'equipmentSlot1' ? equipmentSlot1Reserve : equipmentSlot2Reserve;
      for (const item of reserve) {
        sendToGrave(item);
      }
      setEquipmentReserve(slotId, []);
      clearEquipmentSlotById(slotId);
      return count;
    },
    [
      addPermanentMagicToRecycleBag,
      equipmentSlot1,
      equipmentSlot2,
      equipmentSlot1Reserve,
      equipmentSlot2Reserve,
    ],
  );

  const swapEquipmentSlots = useCallback(() => {
    const left = equipmentSlot1;
    const right = equipmentSlot2;
    setEquipmentSlotById('equipmentSlot1', right ? { ...right } : null);
    setEquipmentSlotById('equipmentSlot2', left ? { ...left } : null);
    const leftRes = [...equipmentSlot1Reserve];
    const rightRes = [...equipmentSlot2Reserve];
    setEquipmentSlot1Reserve(rightRes);
    setEquipmentSlot2Reserve(leftRes);
  }, [equipmentSlot1, equipmentSlot2, equipmentSlot1Reserve, equipmentSlot2Reserve, setEquipmentSlot1Reserve, setEquipmentSlot2Reserve]);

  // -- Amulet conversion ------------------------------------------------------

  const convertAmuletsToGold = useCallback(
    (amountPer: number) => {
      if (!amuletSlots.length) return 0;
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
      const payout = amountPer * amuletSlots.length;
      depsRef.current.addGameLog('amulet', `${amuletSlots.length} 枚护符转化为 ${payout} 金币`);
      amuletSlots.forEach(amulet => addToGraveyard(amulet));
      setAmuletSlots([]);
      setGold(prev => prev + payout);
      return payout;
    },
    [amuletSlots, setAmuletSlots, setSlotTempAttack, setSlotTempArmor, setGold],
  );

  // -- Discard all hand -------------------------------------------------------

  const discardAllHandCards = useCallback(async () => {
    const snapshot = [...depsRef.current.handCardsRef.current];
    if (!snapshot.length) return;
    const flights = snapshot.map(card => ({
      card,
      promise: depsRef.current.triggerDiscardFlight(card, isRecyclableFromHand(card) ? 'recycle-bag' : 'graveyard'),
    }));
    depsRef.current.handCardsRef.current = [];
    setHandCards([]);
    await Promise.all(flights.map(f => f.promise));
    const sorted = [...flights].sort((a, b) => (a.card.onDiscardDraw ? 1 : 0) - (b.card.onDiscardDraw ? 1 : 0));
    sorted.forEach(f => discardCardToGraveyard(f.card, { owner: 'player' }));
  }, [discardCardToGraveyard, setHandCards]);

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
    updateRecycleForgeCounter,

    // Class deck
    drawClassCardsToBackpack,
    returnCardsToClassDeck,

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
