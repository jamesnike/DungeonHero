import React, { useCallback } from 'react';
import { useGameEngine, useGameState, useEngineSetter } from '@/hooks/useGameEngine';
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
import { createGreedCurseCard } from '@/lib/knightDeck';
import type { HeroSkillId } from '@/lib/heroSkills';
import { getEternalRelic, hasEternalRelic } from '@/lib/eternalRelics';
import type { EternalRelicId } from '@/game-core/types';
import { getHeroSkillById } from '@/lib/heroSkills';
import type { EventDiceRange } from '@/components/GameCard';
import type { HeroMagicRuntimeState } from '@/lib/heroMagic';
import {
  getHeroMagicDefinition,
} from '@/lib/heroMagic';
import type { MagicChoiceModalState } from '@/components/MagicChoiceModal';
import {
  STARTER_CARD_IDS,
  getStarterBaseId,
  skillScrollImage,
  forgeHeartAmuletImage,
} from '@/game-core/deck';
import {
  INITIAL_HP,
  HAND_LIMIT,
  BASE_BACKPACK_CAPACITY,
  PERSUADE_COST,
  MIN_PERSUADE_COST,
  createEmptyActiveRow,
} from '@/game-core/constants';
import {
  getRandomInt,
  formatRepairTargetLabel,
  flattenActiveRowSlots,
  sanitizeCardMetadata,
  logHeroMagic,
  getCardPlayCategory,
  pickRandomHandCardsForDiscardPreferGraveyard,
  isDamageMagic,
  isDamageableTarget,
} from '@/game-core/helpers';
import { damageMonsterWithLayerOverflow, chaosStrikeHasOverkill } from '@/game-core/combat';
import type { MirrorCopySelection, AmplifySelection } from '@/game-core/types';

// ---------------------------------------------------------------------------
// UI-only animation constants (mirrored from GameBoard.tsx)
// ---------------------------------------------------------------------------
const COMBAT_ANIMATION_STAGGER = 180;

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
  restorePermanentMagicFromRecycleBag: () => number;
  ensureCardInHand: (card: GameCardData) => void;
  drawFromBackpackToHand: () => GameCardData | null;
  takeRandomCardsFromBackpack: (count: number) => GameCardData[];
  drawClassCardsToBackpack: (
    count: number,
    source: string,
    filter?: (card: GameCardData) => boolean,
  ) => GameCardData[];
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
  applyCardFlip: (card: GameCardData, cellIndex?: number) => Promise<boolean>;
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
  beginDiscoverFlow: (
    source: string,
    options?: { filter?: (card: GameCardData) => boolean; sourceLabel?: string },
  ) => boolean;
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
  removePendingDungeonCard: (cardId: string) => void;
  queueCardIntoHand: (card: GameCardData, sourceHint?: FlightSourceHint) => void;
  triggerDiscardFlight: (card: GameCardData, destination: 'graveyard' | 'recycle-bag') => Promise<void>;
  triggerClassDeckFlight: (cards: GameCardData[]) => void;
  triggerGraveNova: (graveNovaCard?: GameCardData) => void;
  triggerWaterfall: () => void;
  applyWaterfallSideEffects: () => void;
  queueWaterfallTimeout: (callback: () => void, delay: number, label?: string) => void;
  consumeCardFromHand: (card: GameCardData | string) => boolean;

  // --- Async helpers ---
  requestDiceOutcome: (config: {
    title: string;
    subtitle?: string;
    entries: EventDiceRange[];
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
  cascadeResetWaterfallRef: React.MutableRefObject<boolean>;
  echoRemainingRef: React.MutableRefObject<number>;
  echoTotalRef: React.MutableRefObject<number>;
  graveyardDiscoverResolverRef: React.MutableRefObject<((card: GameCardData | null) => void) | null>;
  graveyardDiscoverDeliveryRef: React.MutableRefObject<'backpack' | 'hand-first'>;
  fullBoardInteractionLockedRef: React.MutableRefObject<boolean>;
  handLockedForMonsterPhaseRef: React.MutableRefObject<boolean>;
  persuadeDiscountRef: React.MutableRefObject<{ costReduction: number; rateBonus: number } | null>;
  persuadeAmuletBonusRef: React.MutableRefObject<number>;
  setPersuadeTempDiscount: React.Dispatch<React.SetStateAction<number>>;
  lastPlayedFlankRef: React.MutableRefObject<boolean>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCardPlayHandlers(depsRef: React.MutableRefObject<CardPlayHandlersDeps>) {
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
    permanentMagicRecycleBag,
    permanentSkills,
    permanentSpellDamageBonus,
    permanentMaxHpBonus,
    selectedHeroSkill,
    previewCards,
    remainingDeck,
    heroMagicState,
    doubleNextMagic,
    bulwarkPassiveActive,
    bulwarkTempArmorStacks,
    handLimitBonus,
    stunCap,
    eternalRelics,
  } = gs;

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

  // -- Setters ----------------------------------------------------------------

  const setHp = useEngineSetter('hp');
  const setGold = useEngineSetter('gold');
  const setActiveCards = useEngineSetter('activeCards');
  const setPreviewCards = useEngineSetter('previewCards');
  const setHandCards = useEngineSetter('handCards');
  const setBackpackItems = useEngineSetter('backpackItems');
  const setDiscardedCards = useEngineSetter('discardedCards');
  const setRemainingDeck = useEngineSetter('remainingDeck');
  const setClassDeck = useEngineSetter('classDeck');
  const setClassCardsInHand = useEngineSetter('classCardsInHand');
  const setAmuletSlots = useEngineSetter('amuletSlots');
  const setPermanentMagicRecycleBag = useEngineSetter('permanentMagicRecycleBag');
  const setPermanentSkills = useEngineSetter('permanentSkills');
  const setPermanentSpellDamageBonus = useEngineSetter('permanentSpellDamageBonus');
  const setPermanentMaxHpBonus = useEngineSetter('permanentMaxHpBonus');
  const setPermanentSpellLifesteal = useEngineSetter('permanentSpellLifesteal');
  const setBackpackCapacityModifier = useEngineSetter('backpackCapacityModifier');
  const setWaterfallDealBonus = useEngineSetter('waterfallDealBonus');
  const setHandLimitBonus = useEngineSetter('handLimitBonus');
  const setMaxAmuletSlots = useEngineSetter('maxAmuletSlots');
  const setEquipmentSlotCapacity = useEngineSetter('equipmentSlotCapacity');
  const setWeaponMasterBonus = useEngineSetter('weaponMasterBonus');
  const setShieldMasterBonus = useEngineSetter('shieldMasterBonus');
  const setNextWeaponBonus = useEngineSetter('nextWeaponBonus');
  const setNextShieldBonus = useEngineSetter('nextShieldBonus');
  const setTempShield = useEngineSetter('tempShield');
  const setVampiricNextAttack = useEngineSetter('vampiricNextAttack');
  const setDefensiveStanceActive = useEngineSetter('defensiveStanceActive');
  const setUnbreakableNext = useEngineSetter('unbreakableNext');
  const setSlotAttackBursts = useEngineSetter('slotAttackBursts');
  const setSlotTempAttack = useEngineSetter('slotTempAttack');
  const setDoubleNextMagic = useEngineSetter('doubleNextMagic');
  const setMagicCardsPlayedThisTurn = useEngineSetter('magicCardsPlayedThisTurn');
  const setBulwarkPassiveActive = useEngineSetter('bulwarkPassiveActive');
  const setBulwarkTempArmorStacks = useEngineSetter('bulwarkTempArmorStacks');
  const setEternalRelics = useEngineSetter('eternalRelics');
  const setStunCap = useEngineSetter('stunCap');
  const setSlotTempArmor = useEngineSetter('slotTempArmor');
  const setBerserkerRageActive = useEngineSetter('berserkerRageActive');
  const setBerserkerSlotUsed = useEngineSetter('berserkerSlotUsed');
  const setGambitExtraActive = useEngineSetter('gambitExtraActive');
  const setGambitExtraPerSlot = useEngineSetter('gambitExtraPerSlot');
  const setGambitSlotUsed = useEngineSetter('gambitSlotUsed');
  const setHeroSkillBanner = useEngineSetter('heroSkillBanner');
  const setHeroMagicState = useEngineSetter('heroMagicState');
  const setPendingMagicAction = useEngineSetter('pendingMagicAction');
  const setPendingPotionAction = useEngineSetter('pendingPotionAction');
  const setGraveyardDiscoverState = useEngineSetter('graveyardDiscoverState');
  const setUpgradeModalOpen = useEngineSetter('upgradeModalOpen');
  const setSwapUpgradeProgress = useEngineSetter('swapUpgradeProgress');
  const setShopOfferings = useEngineSetter('shopOfferings');
  const setShopSourceEvent = useEngineSetter('shopSourceEvent');
  const setShopDeleteUsed = useEngineSetter('shopDeleteUsed');
  const setShopHealUsed = useEngineSetter('shopHealUsed');
  const setShopLevelUpUsed = useEngineSetter('shopLevelUpUsed');
  const setShopSkillDiscoverUsed = useEngineSetter('shopSkillDiscoverUsed');
  const setShopModalOpen = useEngineSetter('shopModalOpen');
  const setShopModalMinimized = useEngineSetter('shopModalMinimized');
  const setDeleteModalOpen = useEngineSetter('deleteModalOpen');
  const setCardsPlayed = useEngineSetter('cardsPlayed');
  const setMirrorCopyModal = useEngineSetter('mirrorCopyModal');
  const setPermGrantModal = useEngineSetter('permGrantModal');
  const setAmplifyModal = useEngineSetter('amplifyModal');
  const setPersuadeCostModifier = useEngineSetter('persuadeCostModifier');
  const setLastPlayedCardCategory = useEngineSetter('lastPlayedCardCategory');

  // -- Convenience accessors -------------------------------------------------

  const addGameLog = (type: LogEntryType, message: string) =>
    depsRef.current.addGameLog(type, message);

  const updateSwapUpgradeCounter = useCallback((displayCount: number, threshold: number) => {
    setAmuletSlots(prev => prev.map(slot => {
      if (slot?.amuletEffect !== 'swap-upgrade') return slot;
      return { ...slot, _counterDisplay: `${displayCount}/${threshold}` };
    }));
  }, [setAmuletSlots]);

  // -- Spell damage ----------------------------------------------------------

  const getSpellDamage = useCallback(
    (baseDamage: number) => Math.max(0, baseDamage + permanentSpellDamageBonus),
    [permanentSpellDamageBonus],
  );

  // -- Fate Sight resolution helper -------------------------------------------

  const resolveFateSight = (card: GameCardData, target: GameCardData, baseDmg: number, peekCount: number) => {
    const totalDamage = getSpellDamage(baseDmg + (card.amplifyBonus ?? 0));
    if (!depsRef.current.isMonsterEngaged(target.id)) depsRef.current.beginCombat(target, 'hero');
    depsRef.current.dealDamageToMonster(target, totalDamage, { pulses: 2, isSpellDamage: true });

    const deck = engine.getState().remainingDeck;
    const peekedCards = deck.slice(0, Math.min(peekCount, deck.length));
    const monsterCount = peekedCards.filter(c => c.type === 'monster').length;
    const rawStunChance = Math.min(monsterCount * 20 + (depsRef.current.amuletEffects?.stunRateBoost ?? 0), 100);
    const stunChance = stunCap > 0 ? Math.min(rawStunChance, stunCap) : rawStunChance;

    depsRef.current.setDeckPeekState({
      mode: 'fate-sight',
      peekedCards,
      monsterCount,
      stunChance,
      targetMonsterName: target.name,
    });

    if (monsterCount > 0 && stunChance > 0 && !target.isStunned) {
      depsRef.current.deckJudgePeekCloseRef.current = async () => {
        const threshold = Math.round((stunChance / 100) * 20);
        const stunResult = await depsRef.current.requestDiceOutcome({
          title: target.name,
          subtitle: `天眼审判击晕判定（${stunChance}%）`,
          entries: [
            { id: 'stun', range: [1, threshold] as [number, number], label: '击晕成功！', effect: 'none' },
            { id: 'miss', range: [threshold + 1, 20] as [number, number], label: '未击晕', effect: 'none' },
          ],
        });
        if (stunResult?.id === 'stun') {
          depsRef.current.updateMonsterCard(target.id, m => ({ ...m, isStunned: true }));
          addGameLog('combat', `${target.name} 被天眼审判击晕了！`);
          setHeroSkillBanner(`天眼审判击晕了 ${target.name}！`);

          if (depsRef.current.amuletEffects.hasStunRecycleToHand) {
            setPermanentMagicRecycleBag(prev => {
              if (prev.length === 0) return prev;
              const count = Math.min(2, prev.length);
              const remaining = [...prev];
              const pickedCards: typeof prev = [];
              for (let i = 0; i < count; i++) {
                const idx = Math.floor(Math.random() * remaining.length);
                pickedCards.push(remaining[idx]);
                remaining.splice(idx, 1);
              }
              setHandCards(hand => [...hand, ...pickedCards]);
              addGameLog('equip', `击晕回收：从回收袋取回「${pickedCards.map(c => c.name).join('」「')}」到手牌`);
              return remaining;
            });
          }

          if (depsRef.current.amuletEffects.hasStunUpgradeCap) {
            setStunCap(prev => {
              const next = Math.min(100, prev + 5);
              addGameLog('amulet', `震慑之符：击晕成功，击晕上限 +5%（当前 ${next}%）`);
              return next;
            });
          }
        }
        const stunText = stunResult?.id === 'stun' ? `击晕了 ${target.name}！` : `未能击晕 ${target.name}。`;
        finalizeMagicCard(card, {
          banner: `天眼审判：对 ${target.name} 造成 ${totalDamage} 点伤害。透视 ${peekedCards.length} 张牌，发现 ${monsterCount} 张怪物牌（${stunChance}%）。${stunText}`,
          dealtDamage: true,
        });
      };
    } else {
      const banner = `天眼审判：对 ${target.name} 造成 ${totalDamage} 点伤害。透视 ${peekedCards.length} 张牌，${monsterCount > 0 ? `发现 ${monsterCount} 张怪物牌。` : '未发现怪物牌。'}`;
      finalizeMagicCard(card, { banner, dealtDamage: true });
    }
  };

  // -- Stat Swap resolution helper -------------------------------------------

  const resolveStatSwap = (card: GameCardData, target: GameCardData, isFlank: boolean) => {
    const oldAtk = target.attack ?? 0;
    const oldMaxHp = target.maxHp ?? target.hp ?? 0;
    depsRef.current.updateMonsterCard(target.id, m => ({
      ...m,
      attack: oldMaxHp,
      maxHp: oldAtk,
      hp: Math.min(m.hp ?? oldAtk, oldAtk),
      baseAttack: oldMaxHp,
      baseHp: oldAtk,
    }));
    let stunText = '';
    if (isFlank && !target.isStunned) {
      const effectiveFlankStun = Math.min(50 + (depsRef.current.amuletEffects?.stunRateBoost ?? 0), stunCap);
      const threshold = Math.round((effectiveFlankStun / 100) * 20);
      void depsRef.current.requestDiceOutcome({
        title: target.name,
        subtitle: `侧击击晕判定（${effectiveFlankStun}%）`,
        entries: [
          { id: 'stun', range: [1, threshold] as [number, number], label: '击晕成功！', effect: 'none' },
          { id: 'miss', range: [threshold + 1, 20] as [number, number], label: '未击晕', effect: 'none' },
        ],
      }).then(stunResult => {
        if (stunResult?.id === 'stun') {
          depsRef.current.updateMonsterCard(target.id, m => ({ ...m, isStunned: true }));
          addGameLog('combat', `${target.name} 被颠倒乾坤侧击击晕了！`);
          setHeroSkillBanner(`颠倒乾坤击晕了 ${target.name}！`);

          if (depsRef.current.amuletEffects.hasStunRecycleToHand) {
            setPermanentMagicRecycleBag(prev => {
              if (prev.length === 0) return prev;
              const count = Math.min(2, prev.length);
              const remaining = [...prev];
              const pickedCards: typeof prev = [];
              for (let i = 0; i < count; i++) {
                const idx = Math.floor(Math.random() * remaining.length);
                pickedCards.push(remaining[idx]);
                remaining.splice(idx, 1);
              }
              setHandCards(hand => [...hand, ...pickedCards]);
              addGameLog('equip', `击晕回收：从回收袋取回「${pickedCards.map(c => c.name).join('」「')}」到手牌`);
              return remaining;
            });
          }

          if (depsRef.current.amuletEffects.hasStunUpgradeCap) {
            setStunCap(prev => {
              const next = Math.min(100, prev + 5);
              addGameLog('amulet', `震慑之符：击晕成功，击晕上限 +5%（当前 ${next}%）`);
              return next;
            });
          }
        }
      });
      stunText = '（侧击：击晕判定中…）';
    }
    addGameLog('magic', `颠倒乾坤：${target.name} 攻击 ${oldAtk}→${oldMaxHp}，血量上限 ${oldMaxHp}→${oldAtk}${isFlank ? '（侧击触发）' : ''}`);
    finalizeMagicCard(card, { banner: `颠倒乾坤：${target.name} 攻击 ${oldAtk}↔${oldMaxHp} 血量上限互换！${stunText}` });
  };

  // -- Hero magic helpers (local) --------------------------------------------

  const updateHeroMagicStateById = useCallback(
    (id: HeroMagicId, updater: (state: HeroMagicRuntimeState) => HeroMagicRuntimeState) => {
      setHeroMagicState(prev => {
        const current =
          prev[id] ??
          ({
            id,
            unlocked: false,
            gauge: 0,
            usedThisWave: false,
          } as HeroMagicRuntimeState);
        const next = updater(current);
        if (
          next.unlocked === current.unlocked &&
          next.gauge === current.gauge &&
          next.usedThisWave === current.usedThisWave
        ) {
          return prev;
        }
        const updated = {
          ...prev,
          [id]: next,
        };
        logHeroMagic('state-update', { id, prev: current, next });
        return updated;
      });
    },
    [],
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
      updateHeroMagicStateById(id, current => {
        if (current.gauge === 0) {
          return current;
        }
        return { ...current, gauge: 0 };
      });
    },
    [updateHeroMagicStateById],
  );

  const setHeroMagicUsedThisWave = useCallback(
    (id: HeroMagicId, used: boolean) => {
      updateHeroMagicStateById(id, current => {
        if (current.usedThisWave === used) {
          return current;
        }
        return { ...current, usedThisWave: used };
      });
    },
    [updateHeroMagicStateById],
  );

  const completeHeroMagicActivation = useCallback(
    (id: HeroMagicId, origin: 'gauge' | 'card') => {
      resetHeroMagicGauge(id);
      if (origin === 'gauge') {
        setHeroMagicUsedThisWave(id, true);
      }
      logHeroMagic('activation-complete', { id, origin });
    },
    [resetHeroMagicGauge, setHeroMagicUsedThisWave],
  );

  const applyBerserkerRageEffect = useCallback(
    (origin: 'gauge' | 'card') => {
      setBerserkerRageActive(true);
      setBerserkerSlotUsed({});
      completeHeroMagicActivation('berserker-rage', origin);
      logHeroMagic('berserker-trigger', { origin });
      setHeroSkillBanner('狂战发动：直到下次瀑布前，每个武器栏每回合可多攻击一次，且所有攻击不消耗耐久。');
    },
    [completeHeroMagicActivation, setHeroSkillBanner],
  );

  const triggerGraveNova = useCallback((graveNovaCard?: GameCardData) => {
    const monsters = flattenActiveRowSlots(depsRef.current.activeCardsLatestRef.current).filter(
      (card): card is GameCardData => isDamageableTarget(card),
    );
    if (!monsters.length) {
      setHeroSkillBanner('殉烈爆鸣没有目标。');
      return;
    }
    const baseDamages = [3, 6];
    const baseDmg = baseDamages[graveNovaCard?.upgradeLevel ?? 0] ?? 6;
    const dmg = getSpellDamage(baseDmg + (graveNovaCard?.amplifyBonus ?? 0));
    addGameLog('combat', `殉烈爆鸣：对 ${monsters.map(m => m.name).join('、')} 各造成 ${dmg} 点法术伤害`);
    monsters.forEach(monster => {
      depsRef.current.dealDamageToMonster(monster, dmg, { pulses: 2, isSpellDamage: true });
    });
    setHeroSkillBanner(`殉烈爆鸣释放，对所有怪物造成 ${dmg} 点伤害！`);
  }, [getSpellDamage, setHeroSkillBanner]);

  // -- Internal helpers -------------------------------------------------------

  const isPermanentMagicCard = (
    card: GameCardData | null | undefined,
  ): card is GameCardData => Boolean(card && card.type === 'magic' && card.magicType === 'permanent');

  const normalizeEventEffect = (expression?: EventEffectExpression): string[] => {
    if (!expression) {
      return [];
    }
    const raw = Array.isArray(expression) ? expression : expression.split(',');
    return raw
      .map(token => token.trim())
      .filter(token => token.length > 0);
  };

  const getRepairableEquipmentSlots = (
    allowedTypes: EquipmentRepairTarget[] = ['weapon', 'shield', 'monster'],
  ): EquipmentSlotId[] => {
    const slots: EquipmentSlotId[] = [];
    (['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]).forEach(slotId => {
      const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (!slotItem) {
        return;
      }
      if (!allowedTypes.includes(slotItem.type)) {
        return;
      }
      const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
      if (maxDurability <= 0) {
        return;
      }
      const currentDurability = slotItem.durability ?? maxDurability;
      if (currentDurability < maxDurability) {
        slots.push(slotId);
      }
    });
    return slots;
  };

  const performReturnToHand = async (): Promise<{ success: boolean; itemName?: string; slotLabel?: string }> => {
    const amuletSlots = engine.getState().amuletSlots;
    type SlotOption = { id: string; label: string; description: string; slotType: 'equipment' | 'amulet'; slotId?: EquipmentSlotId };
    const options: SlotOption[] = [];
    if (equipmentSlot1) {
      const item = equipmentSlot1;
      const typeLabel = item.type === 'weapon' ? `${item.value}攻` : item.type === 'shield' ? `${item.value}防` : `${item.value}`;
      const durLabel = typeof item.durability === 'number' && typeof item.maxDurability === 'number' ? `，耐久 ${item.durability}/${item.maxDurability}` : '';
      options.push({ id: 'equipmentSlot1', label: `左装备栏 — ${item.name}`, description: `${typeLabel}${durLabel}`, slotType: 'equipment', slotId: 'equipmentSlot1' });
    }
    if (equipmentSlot2) {
      const item = equipmentSlot2;
      const typeLabel = item.type === 'weapon' ? `${item.value}攻` : item.type === 'shield' ? `${item.value}防` : `${item.value}`;
      const durLabel = typeof item.durability === 'number' && typeof item.maxDurability === 'number' ? `，耐久 ${item.durability}/${item.maxDurability}` : '';
      options.push({ id: 'equipmentSlot2', label: `右装备栏 — ${item.name}`, description: `${typeLabel}${durLabel}`, slotType: 'equipment', slotId: 'equipmentSlot2' });
    }
    if (amuletSlots.length > 0) {
      const topAmulet = amuletSlots[amuletSlots.length - 1];
      options.push({ id: 'amulet', label: `护符栏 — ${topAmulet.name}`, description: '最上层护符', slotType: 'amulet' });
    }
    if (options.length === 0) return { success: false };
    let chosen: SlotOption;
    if (options.length === 1) {
      chosen = options[0];
    } else {
      const choiceId = await depsRef.current.requestMagicChoice({
        title: '回手',
        subtitle: '选择一个位置，将最上面的装备/护符回收到手牌',
        options: options.map(o => ({ id: o.id, label: o.label, description: o.description })),
      });
      chosen = options.find(o => o.id === choiceId) ?? options[0];
    }
    if (chosen.slotType === 'equipment' && chosen.slotId) {
      const slotItem = chosen.slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (slotItem) {
        depsRef.current.clearEquipmentSlotWithPromote(chosen.slotId);
        const { fromSlot: _, ...handItem } = slotItem as EquipmentItem & { fromSlot?: string };
        depsRef.current.queueCardIntoHand(handItem as GameCardData, chosen.slotId);
        return { success: true, itemName: slotItem.name, slotLabel: chosen.slotId === 'equipmentSlot1' ? '左装备栏' : '右装备栏' };
      }
    } else if (chosen.slotType === 'amulet') {
      const currentAmulets = engine.getState().amuletSlots;
      const topAmulet = currentAmulets[currentAmulets.length - 1];
      if (topAmulet) {
        setAmuletSlots(prev => prev.slice(0, -1));
        const { fromSlot: _, ...handItem } = topAmulet as GameCardData & { fromSlot?: string };
        depsRef.current.queueCardIntoHand(handItem as GameCardData, 'amulet');
        return { success: true, itemName: topAmulet.name, slotLabel: '护符栏' };
      }
    }
    return { success: false };
  };

  const drawCardsFromBackpack = (count: number, options?: { ignoreLimit?: boolean }) => {
    if (count <= 0) {
      return 0;
    }

    let drawLimit = count;
    if (!options?.ignoreLimit) {
      const liveHandSize = depsRef.current.handCardsRef.current.length;
      const liveHandLimit = HAND_LIMIT + (engine.getState().handLimitBonus ?? 0);
      const availableHandSlots = Math.max(0, liveHandLimit - (liveHandSize + depsRef.current.backpackHandFlightsRef.current.length));
      if (availableHandSlots <= 0) {
        return 0;
      }
      drawLimit = Math.min(count, availableHandSlots);
    }

    const drawnCards = depsRef.current.takeRandomCardsFromBackpack(drawLimit);
    if (!drawnCards.length) {
      return 0;
    }

    drawnCards.forEach(depsRef.current.queueCardIntoHand);
    return drawnCards.length;
  };

  // ---------------------------------------------------------------------------
  // finalizeMagicCard
  // ---------------------------------------------------------------------------

  const finalizeMagicCard = useCallback(
    (card: GameCardData, options?: { banner?: string; dealtDamage?: boolean }) => {
      depsRef.current.addGameLog('magic', `${card.type === 'hero-magic' ? '英雄魔法' : '魔法'}：${card.name}${options?.banner ? ` — ${options.banner}` : ''}`);
      if (options?.banner) {
        setHeroSkillBanner(options.banner);
      }

      {
        const currentActiveCards = engine.getState().activeCards;
        for (const ac of currentActiveCards) {
          if (ac && ac.antiMagicReflect && ac.antiMagicReflect > 0 && !ac.isStunned) {
            const reflectDmg = ac.antiMagicReflect;
            depsRef.current.applyDamage(reflectDmg);
            depsRef.current.addGameLog('combat', `${ac.name} 反魔：对英雄造成 ${reflectDmg} 点伤害！`);
            setHeroSkillBanner(`${ac.name} 反魔！受到 ${reflectDmg} 点伤害！`);
          }
        }
      }

      if (card.type === 'hero-magic') {
        logHeroMagic('finalize-card', { cardId: card.id, name: card.name });
      }

      if (isPermanentMagicCard(card)) {
        depsRef.current.addPermanentMagicToRecycleBag(card);
      } else {
        depsRef.current.addToGraveyard(card);
      }

      depsRef.current.removePendingDungeonCard(card.id);
      depsRef.current.removeCard(card.id, false);
      setPendingMagicAction(null);
      depsRef.current.echoRemainingRef.current = 0;

      depsRef.current.stagingCardsRef.current =
        depsRef.current.stagingCardsRef.current.filter(c => c.id !== card.id);
      depsRef.current.drainPendingDiscardEffects();
    },
    [engine, setHeroSkillBanner],
  );

  const resolveMirrorCopy = useCallback(
    (selection: MirrorCopySelection) => {
      const modal = engine.getState().mirrorCopyModal;
      setMirrorCopyModal(null);
      if (!modal) return;
      const magicCard = depsRef.current.stagingCardsRef.current.find(c => c.id === modal.sourceCardId);
      if (!magicCard) return;

      const st = engine.getState();
      let template: GameCardData | null = null;
      if (selection.kind === 'equipment') {
        template = selection.slotId === 'equipmentSlot1' ? st.equipmentSlot1 : st.equipmentSlot2;
      } else if (selection.kind === 'amulet') {
        template = st.amuletSlots[selection.index] ?? null;
      } else {
        template = depsRef.current.handCardsRef.current.find(c => c.id === selection.cardId) ?? null;
      }

      if (!template) {
        if (magicCard.classCard) depsRef.current.consumeClassCardFromHand(magicCard.id);
        finalizeMagicCard(magicCard, { banner: '镜影摹形：目标已不存在。' });
        return;
      }

      const cloned: GameCardData = {
        ...sanitizeCardMetadata(template),
        id: `mirror-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      };
      depsRef.current.queueCardIntoHand(cloned);
      if (magicCard.classCard) depsRef.current.consumeClassCardFromHand(magicCard.id);
      finalizeMagicCard(magicCard, { banner: `镜影摹形：获得「${cloned.name}」的复制。` });
    },
    [engine, setMirrorCopyModal, finalizeMagicCard],
  );

  const cancelMirrorCopy = useCallback(() => {
    const modal = engine.getState().mirrorCopyModal;
    setMirrorCopyModal(null);
    if (!modal) return;
    const magicCard = depsRef.current.stagingCardsRef.current.find(c => c.id === modal.sourceCardId);
    if (!magicCard) return;
    if (magicCard.classCard) depsRef.current.consumeClassCardFromHand(magicCard.id);
    finalizeMagicCard(magicCard, { banner: '镜影摹形已取消。' });
  }, [engine, setMirrorCopyModal, finalizeMagicCard]);

  // ---------------------------------------------------------------------------
  // finalizePotionCard
  // ---------------------------------------------------------------------------

  const finalizePotionCard = useCallback(
    async (card: GameCardData, options?: { banner?: string }) => {
      if (options?.banner) {
        setHeroSkillBanner(options.banner);
      }
      setPendingPotionAction(current => (current && current.card.id === card.id ? null : current));

      depsRef.current.removePendingDungeonCard(card.id);

      if (card.flipTarget) {
        await depsRef.current.applyCardFlip(card);
      } else {
        depsRef.current.addToGraveyard(card);
      }

      depsRef.current.stagingCardsRef.current =
        depsRef.current.stagingCardsRef.current.filter(c => c.id !== card.id);
      depsRef.current.drainPendingDiscardEffects();
    },
    [setHeroSkillBanner],
  );

  // ---------------------------------------------------------------------------
  // resolvePermGrant / cancelPermGrant
  // ---------------------------------------------------------------------------

  const resolvePermGrant = useCallback(
    (targetCardId: string) => {
      const modal = engine.getState().permGrantModal;
      setPermGrantModal(null);
      if (!modal) return;

      if (modal.sourceType === 'flank-grant') {
        const targetCard = engine.getState().handCards.find(c => c.id === targetCardId);
        if (!targetCard) return;
        setHandCards(prev => prev.map(c =>
          c.id === targetCardId
            ? { ...c, flankEffect: '抽1张牌', flankDraw: 1 }
            : c,
        ));
        depsRef.current.addGameLog('event', `附魔祭坛：「${targetCard.name}」获得侧击效果！`);
        setHeroSkillBanner(`「${targetCard.name}」获得侧击：抽1张牌！`);
        return;
      }

      if (modal.sourceType === 'transform-gold-grant') {
        const targetCard = engine.getState().handCards.find(c => c.id === targetCardId);
        if (!targetCard) return;
        setHandCards(prev => prev.map(c =>
          c.id === targetCardId
            ? { ...c, transformBonus: '+3 金币', transformEffect: 'gold:3' }
            : c,
        ));
        depsRef.current.addGameLog('event', `附魔祭坛：「${targetCard.name}」获得转型效果！`);
        setHeroSkillBanner(`「${targetCard.name}」获得转型：+3 金币！`);
        return;
      }

      if (modal.sourceType === 'flank-persuade-grant') {
        const targetCard = engine.getState().handCards.find(c => c.id === targetCardId);
        if (!targetCard) return;
        const amount = modal.meta?.amount ?? 1;
        setHandCards(prev => prev.map(c =>
          c.id === targetCardId
            ? { ...c, flankEffect: `劝降费用永久 -${amount}`, flankEffectId: `persuadeCost-${amount}` }
            : c,
        ));
        depsRef.current.addGameLog('event', `赋能神殿：「${targetCard.name}」获得侧击效果！`);
        setHeroSkillBanner(`「${targetCard.name}」获得侧击：劝降费用永久 -${amount}！`);
        return;
      }

      if (modal.sourceType === 'flank-stun-grant') {
        const targetCard = engine.getState().handCards.find(c => c.id === targetCardId);
        if (!targetCard) return;
        const amount = modal.meta?.amount ?? 5;
        setHandCards(prev => prev.map(c =>
          c.id === targetCardId
            ? { ...c, flankEffect: `击晕上限 +${amount}%`, flankEffectId: `stunCap+${amount}` }
            : c,
        ));
        depsRef.current.addGameLog('event', `赋能神殿：「${targetCard.name}」获得侧击效果！`);
        setHeroSkillBanner(`「${targetCard.name}」获得侧击：击晕上限 +${amount}%！`);
        return;
      }

      if (modal.sourceType === 'flank-damage-grant') {
        const targetCard = engine.getState().handCards.find(c => c.id === targetCardId);
        if (!targetCard) return;
        const amount = modal.meta?.amount ?? 5;
        setHandCards(prev => prev.map(c =>
          c.id === targetCardId
            ? { ...c, flankEffect: `对随机怪物造成 ${amount} 点伤害`, flankEffectId: `damage:${amount}` }
            : c,
        ));
        depsRef.current.addGameLog('event', `赋能神殿：「${targetCard.name}」获得侧击效果！`);
        setHeroSkillBanner(`「${targetCard.name}」获得侧击：对随机怪物造成 ${amount} 点伤害！`);
        return;
      }

      if (modal.sourceType === 'transform-draw-grant') {
        const targetCard = engine.getState().handCards.find(c => c.id === targetCardId);
        if (!targetCard) return;
        const amount = modal.meta?.amount ?? 2;
        setHandCards(prev => prev.map(c =>
          c.id === targetCardId
            ? { ...c, transformBonus: `抽 ${amount} 张牌`, transformEffect: `draw:${amount}` }
            : c,
        ));
        depsRef.current.addGameLog('event', `赋能神殿：「${targetCard.name}」获得转型效果！`);
        setHeroSkillBanner(`「${targetCard.name}」获得转型：抽 ${amount} 张牌！`);
        return;
      }

      if (modal.sourceType === 'transform-heal-grant') {
        const targetCard = engine.getState().handCards.find(c => c.id === targetCardId);
        if (!targetCard) return;
        const amount = modal.meta?.amount ?? 2;
        setHandCards(prev => prev.map(c =>
          c.id === targetCardId
            ? { ...c, transformBonus: `恢复 ${amount} HP`, transformEffect: `heal:${amount}` }
            : c,
        ));
        depsRef.current.addGameLog('event', `赋能神殿：「${targetCard.name}」获得转型效果！`);
        setHeroSkillBanner(`「${targetCard.name}」获得转型：恢复 ${amount} HP！`);
        return;
      }

      if (modal.sourceType === 'transform-recycle-grant') {
        const targetCard = engine.getState().handCards.find(c => c.id === targetCardId);
        if (!targetCard) return;
        setHandCards(prev => prev.map(c =>
          c.id === targetCardId
            ? { ...c, transformBonus: '回收袋取回 1 张牌', transformEffect: 'recycle-to-hand:1' }
            : c,
        ));
        depsRef.current.addGameLog('potion', `唤回秘药：「${targetCard.name}」获得转型效果！`);
        const sourceCard = depsRef.current.stagingCardsRef.current.find(c => c.id === modal.sourceCardId);
        if (sourceCard) {
          void finalizePotionCard(sourceCard, { banner: `「${targetCard.name}」获得转型：回收袋取回 1 张牌！` });
        }
        return;
      }

      const sourceCard = depsRef.current.stagingCardsRef.current.find(c => c.id === modal.sourceCardId);
      if (!sourceCard) return;
      const targetCard = engine.getState().handCards.find(c => c.id === targetCardId);
      if (!targetCard) return;

      if (modal.sourceType === 'transform-grant') {
        setHandCards(prev => prev.map(c =>
          c.id === targetCardId
            ? { ...c, transformBonus: '随机获得坟场一张魔法卡', transformEffect: 'graveyard-random-magic' }
            : c,
        ));
        depsRef.current.addGameLog('magic', `蜕变赋灵：「${targetCard.name}」获得转型效果！`);
        if (sourceCard.classCard) depsRef.current.consumeClassCardFromHand(sourceCard.id);
        finalizeMagicCard(sourceCard, { banner: `「${targetCard.name}」获得转型：随机获得坟场一张魔法卡！` });
        return;
      }

      if (modal.sourceType === 'equipment-enchant') {
        setHandCards(prev => prev.filter(c => c.id !== targetCardId));
        depsRef.current.discardCardToGraveyard(targetCard, { owner: 'player', forceGraveyard: true });
        const atkBonus = targetCard.value ?? 0;
        const armorBonus = targetCard.armorMax ?? targetCard.armor ?? 0;
        const equippedSlots = depsRef.current.getEquipmentSlots().filter(s => s.item);
        if (equippedSlots.length === 0) {
          finalizeMagicCard(sourceCard, { banner: '装备栏没有装备可附魔。' });
          return;
        }
        const randomSlot = equippedSlots[Math.floor(Math.random() * equippedSlots.length)];
        const parts: string[] = [];
        if (atkBonus > 0) {
          depsRef.current.setEquipmentSlotBonus(randomSlot.id, 'damage', v => v + atkBonus);
          parts.push(`攻击 +${atkBonus}`);
        }
        if (armorBonus > 0) {
          depsRef.current.setEquipmentSlotBonus(randomSlot.id, 'shield', v => v + armorBonus);
          parts.push(`护甲 +${armorBonus}`);
        }
        const statDesc = parts.length > 0 ? parts.join('，') : '（无加成）';
        depsRef.current.addGameLog('magic', `装备附魔：弃置「${targetCard.name}」，「${randomSlot.item!.name}」${statDesc}`);
        finalizeMagicCard(sourceCard, {
          banner: `装备附魔：弃置「${targetCard.name}」→「${randomSlot.item!.name}」${statDesc}！`,
        });
        return;
      }

      if (modal.sourceType === 'essence-extract') {
        setHandCards(prev => prev.filter(c => c.id !== targetCardId));
        const isInstantMagic = targetCard.type === 'magic' && targetCard.magicType === 'instant';
        const isEquipment = targetCard.type === 'weapon' || targetCard.type === 'shield';
        const isAmulet = targetCard.type === 'amulet';
        let slotId: EquipmentSlotId;
        let bonusType: keyof SlotPermanentBonus;
        if (isInstantMagic) {
          slotId = 'equipmentSlot1';
          bonusType = 'damage';
        } else if (isEquipment) {
          slotId = 'equipmentSlot2';
          bonusType = 'damage';
        } else if (isAmulet) {
          slotId = 'equipmentSlot2';
          bonusType = 'shield';
        } else {
          slotId = 'equipmentSlot1';
          bonusType = 'shield';
        }
        depsRef.current.setEquipmentSlotBonus(slotId, bonusType, v => v + 1);
        const slotLabel = slotId === 'equipmentSlot1' ? '左装备栏' : '右装备栏';
        const bonusLabel = bonusType === 'damage' ? '攻击' : '护甲';
        depsRef.current.addGameLog('magic', `精华萃取：移除「${targetCard.name}」，${slotLabel}永久${bonusLabel} +1`);
        finalizeMagicCard(sourceCard, {
          banner: `精华萃取：移除「${targetCard.name}」→ ${slotLabel}永久${bonusLabel} +1！`,
        });
        return;
      }

      if (cardHasPermFlag(targetCard)) return;
      setHandCards(prev => prev.map(c => c.id === targetCardId ? { ...c, recycleDelay: 2 } : c));
      const logType = modal.sourceType === 'potion' ? 'potion' : 'magic';
      const label = modal.sourceType === 'potion' ? '永恒铭刻药' : '永恒铭刻';
      depsRef.current.addGameLog(logType, `${label}：「${targetCard.name}」获得 Perm 2 属性！`);
      const banner = `「${targetCard.name}」获得 Perm 2！被移除后将经 2 次瀑流返回背包。`;
      if (modal.sourceType === 'potion') {
        void finalizePotionCard(sourceCard, { banner });
      } else {
        finalizeMagicCard(sourceCard, { banner });
      }
    },
    [engine, setPermGrantModal, setHandCards, finalizePotionCard, finalizeMagicCard],
  );

  const cancelPermGrant = useCallback(() => {
    const modal = engine.getState().permGrantModal;
    setPermGrantModal(null);
    if (!modal) return;
    if (modal.sourceType === 'flank-grant' || modal.sourceType === 'transform-gold-grant'
      || modal.sourceType === 'flank-persuade-grant' || modal.sourceType === 'flank-stun-grant'
      || modal.sourceType === 'flank-damage-grant' || modal.sourceType === 'transform-draw-grant'
      || modal.sourceType === 'transform-heal-grant') {
      return;
    }
    if (modal.sourceType === 'transform-recycle-grant') {
      const src = depsRef.current.stagingCardsRef.current.find(c => c.id === modal.sourceCardId);
      if (src) void finalizePotionCard(src, { banner: '取消了唤回秘药。' });
      return;
    }
    const sourceCard = depsRef.current.stagingCardsRef.current.find(c => c.id === modal.sourceCardId);
    if (!sourceCard) return;
    if (modal.sourceType === 'transform-grant') {
      if (sourceCard.classCard) depsRef.current.consumeClassCardFromHand(sourceCard.id);
      finalizeMagicCard(sourceCard, { banner: '取消了蜕变赋灵。' });
    } else if (modal.sourceType === 'equipment-enchant') {
      finalizeMagicCard(sourceCard, { banner: '取消了装备附魔。' });
    } else if (modal.sourceType === 'essence-extract') {
      finalizeMagicCard(sourceCard, { banner: '取消了精华萃取。' });
    } else if (modal.sourceType === 'potion') {
      void finalizePotionCard(sourceCard, { banner: '取消了永恒铭刻。' });
    } else {
      finalizeMagicCard(sourceCard, { banner: '取消了永恒铭刻。' });
    }
  }, [engine, setPermGrantModal, finalizePotionCard, finalizeMagicCard]);

  // ---------------------------------------------------------------------------
  // resolveAmplify / cancelAmplify
  // ---------------------------------------------------------------------------

  const resolveAmplify = useCallback(
    (selection: AmplifySelection) => {
      const modal = engine.getState().amplifyModal;
      setAmplifyModal(null);
      if (!modal) return;

      const sourceCard = depsRef.current.stagingCardsRef.current.find(c => c.id === modal.sourceCardId);
      if (!sourceCard) return;

      let targetCardId: string | undefined;
      let targetName: string | undefined;

      if (selection.kind === 'equipment') {
        const slotId = selection.slotId;
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          finalizeMagicCard(sourceCard, { banner: '增幅：目标装备已不存在。' });
          return;
        }
        targetCardId = slotItem.id;
        targetName = slotItem.name;
      } else {
        const targetCard = engine.getState().handCards.find(c => c.id === selection.cardId);
        if (!targetCard) {
          finalizeMagicCard(sourceCard, { banner: '增幅：目标卡牌已不在手牌中。' });
          return;
        }
        targetCardId = targetCard.id;
        targetName = targetCard.name;
      }

      const amplifyPermCard: GameCardData = {
        id: `amplify-perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'magic',
        name: `增幅：${targetName}`,
        value: 0,
        image: skillScrollImage,
        magicType: 'permanent',
        magicEffect: 'amplify-target',
        description: `永久魔法（Perm 2）：对「${targetName}」进行增幅（武器攻击+1，护盾护甲+1，伤害魔法伤害+1）。`,
        recycleDelay: 2,
        _amplifyTargetCardId: targetCardId,
        _amplifyTargetName: targetName,
      };

      depsRef.current.addCardToBackpack(amplifyPermCard);
      depsRef.current.addGameLog('magic', `增幅：为「${targetName}」生成永久增幅魔法（Perm 2），已放入背包。`);
      finalizeMagicCard(sourceCard, { banner: `增幅：为「${targetName}」生成永久增幅魔法（Perm 2）！` });
    },
    [engine, setAmplifyModal, finalizeMagicCard, equipmentSlot1, equipmentSlot2],
  );

  const cancelAmplify = useCallback(() => {
    const modal = engine.getState().amplifyModal;
    setAmplifyModal(null);
    if (!modal) return;
    const sourceCard = depsRef.current.stagingCardsRef.current.find(c => c.id === modal.sourceCardId);
    if (!sourceCard) return;
    finalizeMagicCard(sourceCard, { banner: '取消了增幅。' });
  }, [engine, setAmplifyModal, finalizeMagicCard]);

  // ---------------------------------------------------------------------------
  // resolvePotionRepairForSlot
  // ---------------------------------------------------------------------------

  const resolvePotionRepairForSlot = useCallback(
    (
      slotId: EquipmentSlotId,
      card: GameCardData,
      amount: number,
      allowedTypes: EquipmentRepairTarget[],
    ): boolean => {
      const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (!slotItem) {
        setHeroSkillBanner('该槽位目前没有装备。');
        return false;
      }

      if (!slotItem.type || !allowedTypes.includes(slotItem.type)) {
        const label = formatRepairTargetLabel(allowedTypes);
        setHeroSkillBanner(`请选择一个${label}。`);
        return false;
      }

      const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
      if (maxDurability === 0) {
        setHeroSkillBanner('该装备无法修复。');
        return false;
      }

      const currentDurability = slotItem.durability ?? maxDurability;
      if (currentDurability >= maxDurability) {
        setHeroSkillBanner('该装备已经满耐久。');
        return false;
      }

      const repairedDurability = Math.min(maxDurability, currentDurability + amount);
      const gained = repairedDurability - currentDurability;
      depsRef.current.setEquipmentSlotById(slotId, { ...slotItem, durability: repairedDurability });
      depsRef.current.addGameLog('potion', `修复 ${slotItem.name} 耐久 +${gained}（${currentDurability} → ${repairedDurability}）`);
      const banner = `${slotItem.name} 耐久 +${gained}`;
      void finalizePotionCard(card, { banner });
      return true;
    },
    [equipmentSlot1, equipmentSlot2, finalizePotionCard, setHeroSkillBanner],
  );

  // ---------------------------------------------------------------------------
  // repairEquipmentDurability
  // ---------------------------------------------------------------------------

  const repairEquipmentDurability = useCallback(
    async (amount: number, allowedTypes: EquipmentRepairTarget[]): Promise<boolean> => {
      const repairableSlots = getRepairableEquipmentSlots(allowedTypes);
      if (!repairableSlots.length) {
        setHeroSkillBanner('当前没有需要修复的装备。');
        return false;
      }

      let targetSlot: EquipmentSlotId | null = repairableSlots.length === 1 ? repairableSlots[0] : null;
      if (!targetSlot) {
        targetSlot = await depsRef.current.requestEquipmentSelection({
          prompt: `选择一个${formatRepairTargetLabel(allowedTypes)}恢复${amount}点耐久`,
          subtext: '只能选择已损耗耐久的装备。',
        });
      }

      if (!targetSlot) {
        setHeroSkillBanner('请选择要修复的装备。');
        return false;
      }

      if (!repairableSlots.includes(targetSlot)) {
        setHeroSkillBanner('该装备当前无法修复。');
        return false;
      }

      const slotItem = targetSlot === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (!slotItem) {
        setHeroSkillBanner('该槽位没有装备。');
        return false;
      }

      const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
      if (maxDurability <= 0) {
        setHeroSkillBanner('该装备无法修复。');
        return false;
      }

      const currentDurability = slotItem.durability ?? maxDurability;
      if (currentDurability >= maxDurability) {
        setHeroSkillBanner('该装备已经满耐久。');
        return false;
      }

      const repairedDurability = Math.min(maxDurability, currentDurability + amount);
      const gained = repairedDurability - currentDurability;
      depsRef.current.setEquipmentSlotById(targetSlot, { ...slotItem, durability: repairedDurability });
      setHeroSkillBanner(`${slotItem.name} 耐久 +${gained}`);
      return true;
    },
    [
      equipmentSlot1,
      equipmentSlot2,
      setHeroSkillBanner,
    ],
  );

  // ---------------------------------------------------------------------------
  // handlePotionConsumption
  // ---------------------------------------------------------------------------

  const handlePotionConsumption = useCallback(
    async (card: GameCardData) => {
      if (!depsRef.current.stagingCardsRef.current.some(c => c.id === card.id)) {
        depsRef.current.stagingCardsRef.current = [...depsRef.current.stagingCardsRef.current, card];
      }
      depsRef.current.addGameLog('potion', `使用药水：${card.name}`);
      const effect = card.potionEffect;

      const resolveHeal = async (healAmount: number) => {
        const actualHeal = depsRef.current.healHero(healAmount);
        const banner = actualHeal > 0 ? `回复${actualHeal}点生命。` : '生命已满。';
        await finalizePotionCard(card, { banner });
      };

      if (!effect || effect === 'heal-5' || effect === 'heal-14') {
        await resolveHeal(effect === 'heal-14' ? 14 : effect === 'heal-5' ? 5 : card.value ?? 0);
        return;
      }

      if (effect === 'perm-spell-damage') {
        setPermanentSpellDamageBonus(prev => prev + 1);
        depsRef.current.addGameLog('potion', '药水效果：永久法术伤害 +1');
        await finalizePotionCard(card, { banner: '永久法术伤害 +1。' });
        return;
      }

      if (effect === 'perm-spell-damage+2') {
        setPermanentSpellDamageBonus(prev => prev + 2);
        depsRef.current.addGameLog('potion', '药水效果：永久法术伤害 +2');
        await finalizePotionCard(card, { banner: '永久法术伤害 +2。' });
        return;
      }

      if (effect === 'perm-spell-damage-2') {
        setPermanentSpellDamageBonus(prev => prev + 2);
        const newMaxHp = maxHp - 5;
        setPermanentMaxHpBonus(prev => prev - 5);
        setHp(prev => Math.min(newMaxHp, prev));
        depsRef.current.addGameLog('potion', '药水效果：永久法术伤害 +2；最大生命值 -5');
        await finalizePotionCard(card, { banner: '永久法术伤害 +2；最大生命值 -5。' });
        return;
      }

      if (effect === 'perm-backpack-size') {
        setBackpackCapacityModifier(prev => prev + 1);
        depsRef.current.enforceBackpackCapacity();
        depsRef.current.addGameLog('potion', '药水效果：背包容量永久 +1');
        await finalizePotionCard(card, { banner: '背包容量永久 +1。' });
        return;
      }

      if (effect === 'perm-spell-lifesteal+1') {
        setPermanentSpellLifesteal(prev => prev + 1);
        depsRef.current.addGameLog('potion', '药水效果：永久超杀吸血 +1');
        await finalizePotionCard(card, { banner: '永久超杀吸血 +1。' });
        return;
      }

      if (effect === 'perm-spell-lifesteal+2') {
        setPermanentSpellLifesteal(prev => prev + 2);
        depsRef.current.addGameLog('potion', '药水效果：永久超杀吸血 +2');
        await finalizePotionCard(card, { banner: '永久超杀吸血 +2。' });
        return;
      }

      if (effect === 'perm-hand-limit+1') {
        setHandLimitBonus(prev => prev + 1);
        depsRef.current.addGameLog('potion', '药水效果：手牌上限 +1');
        await finalizePotionCard(card, { banner: '手牌上限 +1。' });
        return;
      }

      if (effect === 'perm-hand-limit+2') {
        setHandLimitBonus(prev => prev + 1);
        depsRef.current.addGameLog('potion', '药水效果：手牌上限 +1');
        await finalizePotionCard(card, { banner: '手牌上限 +1。' });
        return;
      }

      if (effect === 'perm-backpack-size+2') {
        setBackpackCapacityModifier(prev => prev + 2);
        depsRef.current.addGameLog('potion', '药水效果：背包上限 +2');
        await finalizePotionCard(card, { banner: '背包上限 +2。' });
        return;
      }

      if (effect === 'perm-backpack-size+5') {
        setBackpackCapacityModifier(prev => prev + 5);
        depsRef.current.addGameLog('potion', '药水效果：背包上限 +5');
        await finalizePotionCard(card, { banner: '背包上限 +5。' });
        return;
      }

      if (effect === 'perm-waterfall-deal+1') {
        setWaterfallDealBonus(prev => prev + 1);
        depsRef.current.addGameLog('potion', '药水效果：永久瀑流发牌数 +1');
        await finalizePotionCard(card, { banner: '永久瀑流发牌数 +1！多出的牌将堆叠在非怪物格。' });
        return;
      }

      if (effect === 'perm-slot-damage+1') {
        setPendingPotionAction({
          card,
          effect: 'perm-slot-damage+1',
          step: 'slot-select',
          prompt: '选择一个装备栏，永久伤害 +1。',
        });
        setHeroSkillBanner('选择一个装备栏，永久伤害 +1。');
        return;
      }

      if (effect === 'perm-slot-damage+2') {
        setPendingPotionAction({
          card,
          effect: 'perm-slot-damage+2',
          step: 'slot-select',
          prompt: '选择一个装备栏，永久伤害 +2。',
        });
        setHeroSkillBanner('选择一个装备栏，永久伤害 +2。');
        return;
      }

      if (effect === 'perm-equipment-durability-max+1') {
        const slotsWithDurability = depsRef.current.getEquipmentSlots().filter(s => s.item?.durability != null);
        if (slotsWithDurability.length === 0) {
          await finalizePotionCard(card, { banner: '没有可增加耐久的装备。' });
          return;
        }
        if (slotsWithDurability.length === 1) {
          const slot = slotsWithDurability[0];
          const item = slot.item!;
          const maxDur = item.maxDurability ?? item.durability ?? 0;
          depsRef.current.setEquipmentSlotById(slot.id, { ...item, maxDurability: maxDur + 1 });
          depsRef.current.addGameLog('potion', `耐久补剂：${item.name} 耐久上限 +1（${maxDur} → ${maxDur + 1}）`);
          await finalizePotionCard(card, { banner: `${item.name} 耐久上限 +1！` });
          return;
        }
        setPendingPotionAction({
          card,
          effect: 'perm-equipment-durability-max+1',
          step: 'slot-select',
          prompt: '选择一个装备，耐久上限 +1。',
        });
        setHeroSkillBanner('选择一个装备，耐久上限 +1。');
        return;
      }

      if (effect === 'perm-equipment-durability-max+2') {
        const slotsWithDurability = depsRef.current.getEquipmentSlots().filter(s => s.item?.durability != null);
        if (slotsWithDurability.length === 0) {
          await finalizePotionCard(card, { banner: '没有可增加耐久的装备。' });
          return;
        }
        if (slotsWithDurability.length === 1) {
          const slot = slotsWithDurability[0];
          const item = slot.item!;
          const maxDur = item.maxDurability ?? item.durability ?? 0;
          depsRef.current.setEquipmentSlotById(slot.id, { ...item, maxDurability: maxDur + 2 });
          depsRef.current.addGameLog('potion', `耐久补剂：${item.name} 耐久上限 +2（${maxDur} → ${maxDur + 2}）`);
          await finalizePotionCard(card, { banner: `${item.name} 耐久上限 +2！` });
          return;
        }
        setPendingPotionAction({
          card,
          effect: 'perm-equipment-durability-max+2',
          step: 'slot-select',
          prompt: '选择一个装备，耐久上限 +2。',
        });
        setHeroSkillBanner('选择一个装备，耐久上限 +2。');
        return;
      }

      if (effect === 'perm-stun-cap+10') {
        setStunCap(prev => Math.min(100, prev + 10));
        addGameLog('potion', '眩晕药剂：击晕上限 +10%');
        setHeroSkillBanner(`击晕上限提升至 ${Math.min(100, stunCap + 10)}%！`);
        void finalizePotionCard(card, { banner: '击晕上限 +10%！' });
        return;
      }

      if (effect === 'perm-slot-capacity+1') {
        setPendingPotionAction({
          card,
          effect: 'perm-slot-capacity+1',
          step: 'slot-select',
          prompt: '选择一个装备栏，可装备上限 +1。',
        });
        setHeroSkillBanner('选择一个装备栏，可装备上限 +1。');
        return;
      }

      if (effect === 'dice-arcane-infusion') {
        const diceResult = await depsRef.current.requestDiceOutcome({
          title: card.name,
          subtitle: '掷骰决定翻倍目标',
          entries: [
            { id: 'ai-l-dmg', range: [1, 4] as [number, number], label: '左装备栏伤害翻倍', effect: 'none' },
            { id: 'ai-l-shd', range: [5, 8] as [number, number], label: '左装备栏护甲翻倍', effect: 'none' },
            { id: 'ai-r-dmg', range: [9, 12] as [number, number], label: '右装备栏伤害翻倍', effect: 'none' },
            { id: 'ai-r-shd', range: [13, 16] as [number, number], label: '右装备栏护甲翻倍', effect: 'none' },
            { id: 'ai-spell', range: [17, 20] as [number, number], label: '法术伤害加成翻倍', effect: 'none' },
          ],
        });
        if (!diceResult) return;
        let banner = diceResult.label;
        if (diceResult.id === 'ai-l-dmg') {
          const cur = depsRef.current.getEquipmentSlotBonus('equipmentSlot1', 'damage');
          depsRef.current.setEquipmentSlotBonus('equipmentSlot1', 'damage', cur * 2);
          banner = `左装备栏伤害加成：+${cur} → +${cur * 2}`;
          depsRef.current.addGameLog('potion', `奥术灌注：左装备栏永久伤害 ${cur} → ${cur * 2}`);
        } else if (diceResult.id === 'ai-l-shd') {
          const cur = depsRef.current.getEquipmentSlotBonus('equipmentSlot1', 'shield');
          depsRef.current.setEquipmentSlotBonus('equipmentSlot1', 'shield', cur * 2);
          banner = `左装备栏护甲加成：+${cur} → +${cur * 2}`;
          depsRef.current.addGameLog('potion', `奥术灌注：左装备栏永久护甲 ${cur} → ${cur * 2}`);
        } else if (diceResult.id === 'ai-r-dmg') {
          const cur = depsRef.current.getEquipmentSlotBonus('equipmentSlot2', 'damage');
          depsRef.current.setEquipmentSlotBonus('equipmentSlot2', 'damage', cur * 2);
          banner = `右装备栏伤害加成：+${cur} → +${cur * 2}`;
          depsRef.current.addGameLog('potion', `奥术灌注：右装备栏永久伤害 ${cur} → ${cur * 2}`);
        } else if (diceResult.id === 'ai-r-shd') {
          const cur = depsRef.current.getEquipmentSlotBonus('equipmentSlot2', 'shield');
          depsRef.current.setEquipmentSlotBonus('equipmentSlot2', 'shield', cur * 2);
          banner = `右装备栏护甲加成：+${cur} → +${cur * 2}`;
          depsRef.current.addGameLog('potion', `奥术灌注：右装备栏永久护甲 ${cur} → ${cur * 2}`);
        } else if (diceResult.id === 'ai-spell') {
          const cur = permanentSpellDamageBonus;
          setPermanentSpellDamageBonus(cur * 2);
          banner = `法术伤害加成：+${cur} → +${cur * 2}`;
          depsRef.current.addGameLog('potion', `奥术灌注：永久法术伤害 ${cur} → ${cur * 2}`);
        }
        await finalizePotionCard(card, { banner });
        return;
      }

      if (effect === 'dice-backpack-expand') {
        const choiceId = await depsRef.current.requestMagicChoice({
          title: card.name,
          subtitle: '选择灵药效果',
          options: [
            { id: 'bp-amulet', label: '护符上限 +1', description: '永久增加护符槽位上限 1 个' },
            { id: 'bp-left', label: '左装备栏容量 +1', description: '永久增加左装备栏容量 1 个' },
            { id: 'bp-right', label: '右装备栏容量 +1', description: '永久增加右装备栏容量 1 个' },
            { id: 'bp-bag', label: '背包容量 +3', description: '永久增加背包容量 3 格' },
          ],
        });
        let banner = '';
        if (choiceId === 'bp-amulet') {
          setMaxAmuletSlots(prev => prev + 1);
          banner = '护符上限 +1';
        } else if (choiceId === 'bp-left') {
          setEquipmentSlotCapacity(prev => ({ ...prev, equipmentSlot1: (prev.equipmentSlot1 ?? 1) + 1 }));
          banner = '左装备栏容量 +1';
        } else if (choiceId === 'bp-right') {
          setEquipmentSlotCapacity(prev => ({ ...prev, equipmentSlot2: (prev.equipmentSlot2 ?? 1) + 1 }));
          banner = '右装备栏容量 +1';
        } else if (choiceId === 'bp-bag') {
          setBackpackCapacityModifier(prev => prev + 3);
          banner = '背包容量 +3';
        }
        depsRef.current.addGameLog('potion', `灵药效果：${banner}`);
        await finalizePotionCard(card, { banner });
        return;
      }

      if (effect === 'boost-both-slots') {
        depsRef.current.setEquipmentSlotBonus('equipmentSlot1', 'damage', cur => cur + 1);
        depsRef.current.setEquipmentSlotBonus('equipmentSlot1', 'shield', cur => cur + 1);
        depsRef.current.setEquipmentSlotBonus('equipmentSlot2', 'damage', cur => cur + 1);
        depsRef.current.setEquipmentSlotBonus('equipmentSlot2', 'shield', cur => cur + 1);
        depsRef.current.addGameLog('potion', '双锋淬液：左右装备栏永久伤害+1，护甲+1');
        await finalizePotionCard(card, { banner: '左右装备栏永久伤害+1，护甲+1！' });
        return;
      }

      if (effect === 'left-slot-durability-max+1' || effect === 'left-slot-durability-max+2') {
        const amount = effect === 'left-slot-durability-max+2' ? 2 : 1;
        const leftSlot = equipmentSlot1;
        if (!leftSlot || leftSlot.durability == null) {
          await finalizePotionCard(card, { banner: '左装备栏没有装备，药剂失效。' });
          return;
        }
        const maxDur = leftSlot.maxDurability ?? leftSlot.durability ?? 0;
        depsRef.current.setEquipmentSlotById('equipmentSlot1', { ...leftSlot, maxDurability: maxDur + amount });
        depsRef.current.addGameLog('potion', `淬炼药剂：${leftSlot.name} 耐久上限 +${amount}（${maxDur} → ${maxDur + amount}）`);
        await finalizePotionCard(card, { banner: `${leftSlot.name} 耐久上限 +${amount}！` });
        return;
      }

      if (effect === 'right-slot-durability-max+1' || effect === 'right-slot-durability-max+2') {
        const amount = effect === 'right-slot-durability-max+2' ? 2 : 1;
        const rightSlot = equipmentSlot2;
        if (!rightSlot || rightSlot.durability == null) {
          await finalizePotionCard(card, { banner: '右装备栏没有装备，药剂失效。' });
          return;
        }
        const maxDur = rightSlot.maxDurability ?? rightSlot.durability ?? 0;
        depsRef.current.setEquipmentSlotById('equipmentSlot2', { ...rightSlot, maxDurability: maxDur + amount });
        depsRef.current.addGameLog('potion', `淬炼药剂（右）：${rightSlot.name} 耐久上限 +${amount}（${maxDur} → ${maxDur + amount}）`);
        await finalizePotionCard(card, { banner: `${rightSlot.name} 耐久上限 +${amount}！` });
        return;
      }

      if (effect === 'equip-swap') {
        const slots = depsRef.current.getEquipmentSlots().filter(s => s.item);
        if (slots.length === 0) {
          await finalizePotionCard(card, { banner: '没有装备可以置换。' });
          return;
        }
        let chosenSlot: EquipmentSlotId;
        if (slots.length === 1) {
          chosenSlot = slots[0].id;
        } else {
          const selected = await depsRef.current.requestEquipmentSelection({
            prompt: '选择一个装备回到手牌',
            subtext: '若另一栏有装备，则换到该位置。',
          });
          if (!selected) {
            await finalizePotionCard(card, { banner: '取消了置换。' });
            return;
          }
          chosenSlot = selected;
        }
        const chosenItem = chosenSlot === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        const otherSlotId: EquipmentSlotId = chosenSlot === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
        const otherItem = otherSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (chosenItem) {
          const cardVersion: GameCardData = { ...chosenItem };
          depsRef.current.clearEquipmentSlotById(chosenSlot);
          setHandCards(prev => [...prev, cardVersion]);
          depsRef.current.addGameLog('potion', `置换药剂：${chosenItem.name} 回到手牌`);
          if (otherItem) {
            depsRef.current.setEquipmentSlotById(chosenSlot, { ...otherItem });
            depsRef.current.clearEquipmentSlotById(otherSlotId);
            depsRef.current.addGameLog('potion', `置换药剂：${otherItem.name} 换到${chosenSlot === 'equipmentSlot1' ? '左' : '右'}槽`);
          }
          await finalizePotionCard(card, { banner: `${chosenItem.name} 回到手牌！` });
        } else {
          await finalizePotionCard(card, { banner: '该装备栏为空。' });
        }
        return;
      }

      if (effect === 'hand-limit+1') {
        setHandLimitBonus(prev => prev + 1);
        depsRef.current.addGameLog('potion', '扩容药剂：手牌上限永久 +1');
        await finalizePotionCard(card, { banner: `手牌上限提升至 ${HAND_LIMIT + (handLimitBonus ?? 0) + 1}！` });
        return;
      }

      if (effect === 'repair-choice') {
        const allowedTypes: EquipmentRepairTarget[] = ['weapon', 'shield', 'monster'];
        const matchingSlots = depsRef.current.getEquipmentSlots().filter(slot => {
          const slotType = slot.item?.type;
          return Boolean(slotType && allowedTypes.includes(slotType));
        });
        if (!matchingSlots.length) {
          await finalizePotionCard(card, { banner: '没有装备武器或护盾，药剂失效。' });
          return;
        }
        const prompt = '选择修复剂效果';
        setPendingPotionAction({
          card,
          effect: 'repair-choice',
          step: 'choice',
          prompt,
        });
        setHeroSkillBanner(prompt);
        return;
      }

      if (
        effect === 'repair-weapon-2' ||
        effect === 'repair-weapon-3'
      ) {
        let repairAmount = effect === 'repair-weapon-3' ? 3 : 2;
        let allowedTypes: EquipmentRepairTarget[] = ['weapon', 'shield', 'monster'];

        const targetLabel = formatRepairTargetLabel(allowedTypes);
        const matchingSlots = depsRef.current.getEquipmentSlots().filter(slot => {
          const slotType = slot.item?.type;
          return Boolean(slotType && allowedTypes.includes(slotType));
        });

        if (!matchingSlots.length) {
          await finalizePotionCard(card, { banner: `没有装备${targetLabel}，药剂失效。` });
          return;
        }

        const repairableSlots = matchingSlots.filter(slot => {
          const item = slot.item;
          if (!item) {
            return false;
          }
          const maxDurability = item.maxDurability ?? item.durability ?? 0;
          const currentDurability = item.durability ?? maxDurability;
          return maxDurability > 0 && currentDurability < maxDurability;
        });

        if (!repairableSlots.length) {
          await finalizePotionCard(card, { banner: `所有${targetLabel}已满耐久。` });
          return;
        }

        if (repairableSlots.length === 1) {
          resolvePotionRepairForSlot(
            repairableSlots[0].id,
            card,
            repairAmount,
            allowedTypes,
          );
          setPendingPotionAction(null);
          return;
        }

        const prompt = `选择一个${targetLabel}恢复${repairAmount}点耐久。`;
        setPendingPotionAction({
          card,
          effect: 'repair-equipment',
          amount: repairAmount,
          allowedTypes,
          step: 'slot-select',
          prompt,
        });
        setHeroSkillBanner(prompt);
        return;
      }

      if (effect === 'draw-backpack-4') {
        setBackpackCapacityModifier(prev => prev + 1);
        setHandLimitBonus(prev => prev + 1);
        const newHandLimit = depsRef.current.effectiveHandLimit + 1;
        const handOccupancyTowardLimit = () =>
          handCards.filter(c => c.id !== card.id).length + depsRef.current.backpackHandFlightsRef.current.length;
        let draws = 0;
        for (let i = 0; i < 4; i += 1) {
          if (handOccupancyTowardLimit() >= newHandLimit) break;
          const [drawnCard] = depsRef.current.takeRandomCardsFromBackpack(1);
          if (!drawnCard) break;
          depsRef.current.queueCardIntoHand(drawnCard);
          draws += 1;
        }
        let bonusDraws = 0;
        if (handOccupancyTowardLimit() < newHandLimit && engine.getState().backpackItems.length > 0) {
          const [extraCard] = depsRef.current.takeRandomCardsFromBackpack(1);
          if (extraCard) {
            depsRef.current.queueCardIntoHand(extraCard);
            bonusDraws = 1;
          }
        }
        const totalDraws = draws + bonusDraws;
        const parts: string[] = [];
        if (totalDraws > 0) parts.push(`从背包抽出${totalDraws}张牌`);
        parts.push('背包上限 +1', '手牌上限 +1');
        const banner = parts.join('，') + '。';
        depsRef.current.addGameLog('potion', `药水效果：${parts.join('，')}`);
        await finalizePotionCard(card, { banner });
        return;
      }

      if (effect === 'swap-slot-damage-shield') {
        const slotIds: EquipmentSlotId[] = ['equipmentSlot1', 'equipmentSlot2'];
        const chosenSlot = slotIds[Math.floor(Math.random() * 2)];
        const slotLabel = chosenSlot === 'equipmentSlot1' ? '左' : '右';
        const curDamage = depsRef.current.getEquipmentSlotBonus(chosenSlot, 'damage');
        const curShield = depsRef.current.getEquipmentSlotBonus(chosenSlot, 'shield');
        depsRef.current.setEquipmentSlotBonus(chosenSlot, 'damage', () => curShield);
        depsRef.current.setEquipmentSlotBonus(chosenSlot, 'shield', () => curDamage);
        depsRef.current.addGameLog('potion', `乾坤颠倒：${slotLabel}装备栏永久伤害(${curDamage})与护甲(${curShield})互换！`);
        await finalizePotionCard(card, { banner: `${slotLabel}装备栏：伤害 ${curDamage}→${curShield}，护甲 ${curShield}→${curDamage}！` });
        return;
      }

      if (effect === 'spell-lifesteal+1-maxhp+6') {
        setPermanentSpellLifesteal(prev => prev + 1);
        setPermanentMaxHpBonus(prev => prev + 6);
        depsRef.current.addGameLog('potion', `暗夜吸血药：超杀吸血 +1，生命上限 +6！`);
        await finalizePotionCard(card, { banner: '超杀吸血 +1，生命上限 +6！' });
        return;
      }

      if (effect === 'discover-graveyard-magic') {
        const magicCards = discardedCards.filter(c => c.type === 'magic' || c.type === 'hero-magic');
        if (magicCards.length === 0) {
          depsRef.current.addGameLog('potion', '药水效果：墓地中没有魔法卡。');
          await finalizePotionCard(card, { banner: '墓地中没有魔法卡。' });
          return;
        }
        const shuffled = [...magicCards].sort(() => Math.random() - 0.5);
        const options = shuffled.slice(0, Math.min(3, shuffled.length));
        const selected = await new Promise<GameCardData | null>(resolve => {
          depsRef.current.graveyardDiscoverResolverRef.current = c => {
            resolve(c);
            depsRef.current.graveyardDiscoverResolverRef.current = null;
          };
          setGraveyardDiscoverState(options);
        });
        if (depsRef.current.amuletEffects.hasBalance && card.flipTarget) {
          card = {
            ...card,
            flipTarget: {
              toCard: {
                id: `backpack-magic-discover-${Date.now()}`,
                type: 'magic',
                name: '秘典检索',
                value: 0,
                image: skillScrollImage,
                magicType: 'permanent',
                magicEffect: 'backpack-magic-discover',
                description: '隐藏效果：天平护符与暮光药剂共鸣，翻转为此卡。永久魔法：从背包中发现一张魔法牌加入手牌。',
              },
              destination: 'backpack',
              banner: '天平之力共鸣，药剂翻转成了「秘典检索」！',
              message: '天平符文闪烁，药剂变幻为新的形态…',
            },
          };
        }
        if (selected) {
          depsRef.current.addGameLog('potion', `药水效果：从墓地发现魔法卡「${selected.name}」`);
          await finalizePotionCard(card, { banner: `从墓地取回了「${selected.name}」！` });
        } else {
          depsRef.current.addGameLog('potion', '药水效果：放弃了墓地发现。');
          await finalizePotionCard(card, { banner: '放弃了墓地发现。' });
        }
        return;
      }

      if (effect === 'perm-persuade-consecutive') {
        if (!hasEternalRelic(eternalRelics, 'chain-persuade')) {
          const relic = getEternalRelic('chain-persuade');
          setEternalRelics(prev => [...prev, relic]);
          depsRef.current.addGameLog('potion', '获得永恒护符·连劝秘药：连续劝降同一个怪物时，每次累计成功率 +15%！');
          await finalizePotionCard(card, { banner: '获得永恒护符·连劝秘药！连续劝降同一怪物，每次累计概率 +15%。' });
        } else {
          depsRef.current.addGameLog('potion', '永恒护符·连劝秘药：效果已存在，无法叠加。');
          await finalizePotionCard(card, { banner: '效果已存在，无法叠加。' });
        }
        return;
      }

      if (effect === 'perm-equip-empower') {
        if (!hasEternalRelic(eternalRelics, 'equip-empower')) {
          const relic = getEternalRelic('equip-empower');
          setEternalRelics(prev => [...prev, relic]);
          depsRef.current.addGameLog('potion', '获得永恒护符·铸锋药剂：装备上装备时，该装备栏获得 3 临时攻击和 3 临时护甲！');
          await finalizePotionCard(card, { banner: '获得永恒护符·铸锋药剂！装备时获得 +3 临时攻击/+3 临时护甲。' });
        } else {
          depsRef.current.addGameLog('potion', '永恒护符·铸锋药剂：效果已存在，无法叠加。');
          await finalizePotionCard(card, { banner: '效果已存在，无法叠加。' });
        }
        return;
      }

      if (effect === 'transform-recycle-grant') {
        const eligible = handCards.filter(c => c.id !== card.id && !c.transformBonus);
        if (eligible.length === 0) {
          depsRef.current.addGameLog('potion', '唤回秘药：手牌中没有可赋予转型效果的卡牌。');
          await finalizePotionCard(card, { banner: '手牌中没有可赋予转型效果的卡牌。' });
          return;
        }
        if (eligible.length === 1) {
          const target = eligible[0];
          setHandCards(prev => prev.map(c =>
            c.id === target.id
              ? { ...c, transformBonus: '回收袋取回 1 张牌', transformEffect: 'recycle-to-hand:1' }
              : c,
          ));
          depsRef.current.addGameLog('potion', `唤回秘药：「${target.name}」获得转型效果！`);
          await finalizePotionCard(card, { banner: `「${target.name}」获得转型：回收袋取回 1 张牌！` });
          return;
        }
        setPermGrantModal({ sourceCardId: card.id, sourceType: 'transform-recycle-grant' });
        return;
      }

      if (effect === 'grant-perm-2') {
        const eligible = handCards.filter(c => c.id !== card.id && !cardHasPermFlag(c));
        if (eligible.length === 0) {
          depsRef.current.addGameLog('potion', '永恒铭刻药：手牌中没有可赋予永恒属性的卡牌。');
          await finalizePotionCard(card, { banner: '手牌中没有可赋予永恒属性的卡牌。' });
          return;
        }
        if (eligible.length === 1) {
          const target = eligible[0];
          setHandCards(prev => prev.map(c => c.id === target.id ? { ...c, recycleDelay: 2 } : c));
          depsRef.current.addGameLog('potion', `永恒铭刻药：「${target.name}」获得 Perm 2 属性！`);
          await finalizePotionCard(card, { banner: `「${target.name}」获得 Perm 2！被移除后将经 2 次瀑流返回背包。` });
          return;
        }
        setPermGrantModal({ sourceCardId: card.id, sourceType: 'potion' });
        return;
      }

      if (effect === 'grant-lastwords-slot-temp-buff') {
        const slotsWithEquip = depsRef.current.getEquipmentSlots().filter(s => s.item != null);
        if (slotsWithEquip.length === 0) {
          depsRef.current.addGameLog('potion', '遗赠淬炼药：没有可赋予遗言的装备。');
          await finalizePotionCard(card, { banner: '没有可赋予遗言的装备。' });
          return;
        }
        if (slotsWithEquip.length === 1) {
          const slot = slotsWithEquip[0];
          const item = slot.item!;
          depsRef.current.setEquipmentSlotById(slot.id, { ...item, onDestroyEffect: 'slot-temp-buff-3-3' });
          depsRef.current.addGameLog('potion', `遗赠淬炼药：${item.name} 获得遗言：该装备栏 +3临时攻击 +3临时护甲！`);
          await finalizePotionCard(card, { banner: `${item.name} 获得遗言：该装备栏 +3临时攻击 +3临时护甲！` });
          return;
        }
        setPendingPotionAction({
          card,
          effect: 'grant-lastwords-slot-temp-buff',
          step: 'slot-select',
          prompt: '选择一个装备，赋予遗言：该装备栏 +3临时攻击 +3临时护甲。',
        });
        setHeroSkillBanner('选择一个装备，赋予遗言：该装备栏 +3临时攻击 +3临时护甲。');
        return;
      }

      if (effect === 'amulet-to-eternal-relic') {
        const currentAmulets = engine.getState().amuletSlots;
        const filledAmulets = currentAmulets
          .map((a, idx) => ({ amulet: a, index: idx }))
          .filter((entry): entry is { amulet: NonNullable<typeof entry.amulet>; index: number } => entry.amulet != null);

        if (filledAmulets.length === 0) {
          depsRef.current.addGameLog('potion', '护符永铸药：没有已装备的护符，无法使用。');
          await finalizePotionCard(card, { banner: '没有已装备的护符！' });
          return;
        }

        let chosen: typeof filledAmulets[0];
        if (filledAmulets.length === 1) {
          chosen = filledAmulets[0];
        } else {
          const choiceId = await depsRef.current.requestMagicChoice({
            title: '护符永铸药',
            subtitle: '选择一个护符，将其转化为永恒护符',
            options: filledAmulets.map(entry => ({
              id: String(entry.index),
              label: entry.amulet.name,
              description: entry.amulet.description ?? '护符效果',
            })),
          });
          chosen = filledAmulets.find(e => String(e.index) === choiceId) ?? filledAmulets[0];
        }

        const amulet = chosen.amulet;
        const newRelic: import('@/game-core/types').EternalRelic = {
          id: `amulet-eternal-${amulet.amuletEffect ?? amulet.id}` as import('@/game-core/types').EternalRelicId,
          name: `永恒护符·${amulet.name}`,
          description: amulet.description ?? '',
          image: amulet.image ?? '',
          amuletEffect: amulet.amuletEffect,
          amuletAuraBonus: amulet.amuletAuraBonus,
          upgradeLevel: amulet.upgradeLevel,
        };

        setAmuletSlots(prev => prev.filter((_, i) => i !== chosen.index));
        setEternalRelics(prev => [...prev, newRelic]);

        depsRef.current.addGameLog('potion', `护符永铸药：${amulet.name} 转化为永恒护符！`);
        await finalizePotionCard(card, { banner: `${amulet.name} 已转化为永恒护符！效果永久生效。` });
        return;
      }

      if (effect === 'grant-amulet-end-turn-draw') {
        if (hasEternalRelic(eternalRelics, 'end-turn-draw')) {
          depsRef.current.addGameLog('potion', '回合汲取药：永恒护符效果已存在，无法叠加。');
          await finalizePotionCard(card, { banner: '永恒护符效果已存在，无法叠加。' });
          return;
        }
        const relic = getEternalRelic('end-turn-draw');
        setEternalRelics(prev => [...prev, relic]);
        depsRef.current.addGameLog('potion', '回合汲取药：获得永恒护符「回合汲取」！结束英雄回合时抽 1 张牌。');
        await finalizePotionCard(card, { banner: '获得永恒护符「回合汲取」！结束英雄回合时抽 1 张牌。' });
        return;
      }

      if (effect === 'discover-class-magic') {
        const isClassMagic = (c: GameCardData) => c.type === 'magic' || c.type === 'hero-magic';
        const result = await new Promise<{ banner: string } | null>(resolve => {
          depsRef.current.discoverPotionCompletionRef.current = payload => {
            depsRef.current.discoverPotionCompletionRef.current = null;
            resolve(payload);
          };
          const started = depsRef.current.beginDiscoverFlow('potion-class-magic', { filter: isClassMagic, sourceLabel: card.name });
          if (!started) {
            depsRef.current.discoverPotionCompletionRef.current = null;
            resolve(null);
          }
        });
        const banner = result?.banner ?? '专属牌堆中没有可发现的魔法牌。';
        await finalizePotionCard(card, { banner });
        return;
      }

      if (effect === 'discover-class-3') {
        const drawn = depsRef.current.drawClassCardsToBackpack(3, 'potion-discover-3');
        if (drawn.length > 0) {
          depsRef.current.triggerClassDeckFlight(drawn);
          depsRef.current.addGameLog('potion', `药水效果：获得 ${drawn.length} 张职业卡`);
          await finalizePotionCard(card, { banner: `获得了 ${drawn.length} 张职业卡！` });
        } else {
          depsRef.current.addGameLog('potion', '药水效果：职业卡牌不可用');
          await finalizePotionCard(card, { banner: '职业卡牌不可用。' });
        }
        return;
      }

      await resolveHeal(card.value ?? 0);
    },
    [
      discardedCards,
      equipmentSlot1,
      equipmentSlot2,
      finalizePotionCard,
      handCards,
      maxHp,
      permanentSpellDamageBonus,
      resolvePotionRepairForSlot,
      setHeroSkillBanner,
    ],
  );

  // ---------------------------------------------------------------------------
  // handleHeroMagicCard
  // ---------------------------------------------------------------------------

  function handleHeroMagicCard(card: GameCardData) {
    const heroMagicId = card.heroMagicId as HeroMagicId | undefined;
    if (!heroMagicId) {
      finalizeMagicCard(card, { banner: '无法识别的英雄魔法卡。' });
      return;
    }

    const definition = getHeroMagicDefinition(heroMagicId);
    const status = heroMagicState[heroMagicId];
    logHeroMagic('card-play', {
      cardId: card.id,
      name: card.name,
      heroMagicId,
      status,
      fromHand: handCards.some(candidate => candidate.id === card.id),
      inBackpack: backpackItems.some(candidate => candidate.id === card.id),
    });

    if (!status || !status.unlocked) {
      unlockHeroMagic(heroMagicId);
      resetHeroMagicGauge(heroMagicId);
      logHeroMagic('unlock-request', {
        heroMagicId,
        nextState: { unlocked: true, gauge: 0, usedThisWave: false },
      });
      setHeroSkillBanner(`${definition.name} 技能已掌握！`);
      finalizeMagicCard(card, { banner: `${definition.name} 技能已掌握！` });
      return;
    }

    updateHeroMagicStateById(heroMagicId, current => ({
      ...current,
      gauge: definition.gaugeMax,
      usedThisWave: false,
    }));
    logHeroMagic('card-fill-gauge', {
      heroMagicId,
      readyState: status,
    });
    setHeroSkillBanner(`${definition.name} 数值槽已充满，可以手动发动！`);
    finalizeMagicCard(card, { banner: `${definition.name} 数值槽已充满！` });
  }

  // ---------------------------------------------------------------------------
  // handleKnightInstantMagic
  // ---------------------------------------------------------------------------

  const handleKnightInstantMagic = (card: KnightCardData): boolean => {
    if (!card.knightEffect) {
      return false;
    }

    switch (card.knightEffect) {
      case 'blood-greed': {
        const goldEarned = Math.max(0, maxHp - hp);
        if (goldEarned > 0) {
          setGold(prev => prev + goldEarned);
        }
        depsRef.current.addCardToBackpack(createGreedCurseCard(), { toBottom: true });
        depsRef.current.consumeClassCardFromHand(card.id);

        let shopOpened = false;
        const canOpenShop = (card.upgradeLevel ?? 0) >= 1;
        if (canOpenShop && engine.getState().backpackItems.length < depsRef.current.backpackCapacity) {
          const offerings = depsRef.current.generateShopOfferings();
          if (offerings.length > 0) {
            setShopOfferings(offerings);
            setShopSourceEvent(card);
            setShopDeleteUsed(false);
            setShopHealUsed(false);
            setShopLevelUpUsed(false);
            setShopSkillDiscoverUsed(false);
            setDeleteModalOpen(false);
            setShopModalOpen(true);
            setShopModalMinimized(false);
            shopOpened = true;
          }
        }

        const baseBanner = goldEarned > 0
          ? `嗜血贪欲让你获得 ${goldEarned} 金币（已损失生命），并将"贪婪"塞入背包。`
          : '当前满血，贪欲只留下"贪婪"。';
        finalizeMagicCard(card, {
          banner: shopOpened ? `${baseBanner}商店已开启！` : baseBanner,
        });
        return true;
      }
      case 'berserk-gambit': {
        const hpLoss = Math.max(0, hp - 1);
        if (hpLoss > 0) {
          depsRef.current.applyDamage(hpLoss, 'general', { selfInflicted: true });
        }
        const lvl = card.upgradeLevel ?? 0;
        const buffAmounts = [0, 4, 8, 8];
        const extraPerSlot = lvl >= 3 ? 2 : 1;
        const buffAmt = buffAmounts[lvl] ?? 8;
        if (buffAmt > 0) {
          depsRef.current.addBerserkTurnBuff(buffAmt);
          if (depsRef.current.amuletEffects.hasPersuadeOnTempAttack) {
            const pBonus = depsRef.current.amuletEffects.persuadeOnTempAttackBonus || 5;
            depsRef.current.persuadeAmuletBonusRef.current += pBonus;
            depsRef.current.addGameLog('equip', `怀柔之印：下次劝降率 +${pBonus}%（累计 +${depsRef.current.persuadeAmuletBonusRef.current}%）`);
          }
        }
        setGambitExtraActive(true);
        setGambitExtraPerSlot(extraPerSlot);
        setGambitSlotUsed({});
        depsRef.current.consumeClassCardFromHand(card.id);
        const parts: string[] = [];
        if (buffAmt > 0) parts.push(`本回合装备 +${buffAmt} 伤害`);
        parts.push(extraPerSlot > 1 ? `每个武器栏可多攻击 ${extraPerSlot} 次` : '每个武器栏可多攻击一次');
        finalizeMagicCard(card, {
          banner: `狂血豪赌发动：${parts.join('，')}。`,
        });
        return true;
      }
      case 'death-ward': {
        setHeroSkillBanner('命悬一线会在你受到致死伤害时自动触发，无需主动打出。');
        return true;
      }
      case 'graveyard-recall': {
        if (card.classCard) depsRef.current.consumeClassCardFromHand(card.id);
        void resolveGraveyardRecall(card);
        return true;
      }
      case 'graveyard-discover-equip-amulet': {
        const eligible = discardedCards.filter(c => c.type === 'weapon' || c.type === 'shield' || c.type === 'amulet');
        if (eligible.length === 0) {
          finalizeMagicCard(card, { banner: '坟场中没有装备或护符。' });
          return true;
        }
        depsRef.current.consumeClassCardFromHand(card.id);
        void (async () => {
          const shuffled = [...eligible].sort(() => Math.random() - 0.5);
          const options = shuffled.slice(0, Math.min(3, shuffled.length));
          const selected = await new Promise<GameCardData | null>(resolve => {
            depsRef.current.graveyardDiscoverResolverRef.current = c => {
              resolve(c);
              depsRef.current.graveyardDiscoverResolverRef.current = null;
            };
            setGraveyardDiscoverState(options);
          });
          if (selected) {
            depsRef.current.addGameLog('magic', `破印遗物：从坟场发现了「${selected.name}」`);
          }
          finalizeMagicCard(card, { banner: selected ? `从坟场带回了「${selected.name}」！` : '未选择卡牌。' });
        })();
        return true;
      }
      case 'monster-recruit': {
        const monsters = discardedCards.filter(c => c.type === 'monster');
        if (monsters.length === 0) {
          depsRef.current.consumeClassCardFromHand(card.id);
          finalizeMagicCard(card, { banner: '坟场中没有怪物牌。' });
          return true;
        }
        depsRef.current.consumeClassCardFromHand(card.id);
        void resolveMonsterRecruit(card);
        return true;
      }
      case 'persuade-discount': {
        const costDiscount = 2 * ((card.upgradeLevel ?? 0) + 1);
        const rateBonus = 10 * ((card.upgradeLevel ?? 0) + 1);
        const currentMod = engine.getState().persuadeCostModifier ?? 0;
        const currentCost = PERSUADE_COST + currentMod;
        let actualDiscount = 0;
        if (currentCost > MIN_PERSUADE_COST) {
          actualDiscount = Math.min(costDiscount, currentCost - MIN_PERSUADE_COST);
          setPersuadeCostModifier(prev => prev - actualDiscount);
        }
        depsRef.current.persuadeDiscountRef.current = {
          costReduction: 0,
          rateBonus,
        };
        if (card.classCard) depsRef.current.consumeClassCardFromHand(card.id);
        const costMsg = actualDiscount > 0
          ? `劝降费用永久 -${actualDiscount}`
          : `劝降费用已达下限`;
        finalizeMagicCard(card, { banner: `怀柔令发动：${costMsg}，下次劝降成功率 +${rateBonus}%！` });
        return true;
      }
      case 'monster-fusion': {
        const st = engine.getState();

        type EquippedMonsterInfo = { card: GameCardData; slotId: EquipmentSlotId; isSurface: boolean };
        const allEquippedMonsters: EquippedMonsterInfo[] = [];
        for (const slotId of ['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]) {
          const surface = slotId === 'equipmentSlot1' ? st.equipmentSlot1 : st.equipmentSlot2;
          const reserve = depsRef.current.getEquipmentReserve(slotId);
          if (surface && surface.type === 'monster') {
            allEquippedMonsters.push({ card: surface, slotId, isSurface: true });
          }
          for (const r of reserve) {
            if (r.type === 'monster') {
              allEquippedMonsters.push({ card: r, slotId, isSurface: false });
            }
          }
        }

        const typeGroups: Record<string, EquippedMonsterInfo[]> = {};
        allEquippedMonsters.forEach(m => {
          const key = m.card.monsterType ?? m.card.name;
          if (!typeGroups[key]) typeGroups[key] = [];
          typeGroups[key].push(m);
        });
        const fusibleGroups = Object.entries(typeGroups).filter(([, g]) => g.length >= 2);
        if (fusibleGroups.length === 0) {
          setHeroSkillBanner('没有可融合的同种怪物装备（需要至少 2 个同种族的怪物装备）。');
          return true;
        }

        const [groupName, group] = fusibleGroups.reduce(
          (best, cur) => {
            if (cur[0] === 'Skeleton' && cur[1].length >= 3) return cur;
            if (best[0] === 'Skeleton' && best[1].length >= 3) return best;
            return cur[1].length >= best[1].length ? cur : best;
          },
          fusibleGroups[0],
        );

        depsRef.current.consumeClassCardFromHand(card.id);
        const fusionCount = group.length;
        const fusionIds = new Set(group.map(m => m.card.id));

        for (const slotId of ['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]) {
          const surface = slotId === 'equipmentSlot1' ? st.equipmentSlot1 : st.equipmentSlot2;
          const reserve = depsRef.current.getEquipmentReserve(slotId);
          const surfaceRemoved = surface && fusionIds.has(surface.id);
          const removedReserve = reserve.filter(r => fusionIds.has(r.id));
          const remainingReserve = reserve.filter(r => !fusionIds.has(r.id));

          if (surfaceRemoved) depsRef.current.addToGraveyard(surface);
          removedReserve.forEach(r => depsRef.current.addToGraveyard(r));

          if (surfaceRemoved) {
            if (remainingReserve.length > 0) {
              depsRef.current.setEquipmentSlotById(slotId, remainingReserve[0]);
              depsRef.current.setEquipmentReserve(slotId, remainingReserve.slice(1));
            } else {
              depsRef.current.setEquipmentSlotById(slotId, null);
              depsRef.current.setEquipmentReserve(slotId, []);
            }
          } else if (removedReserve.length > 0) {
            depsRef.current.setEquipmentReserve(slotId, remainingReserve);
          }
        }

        const raceNameMap: Record<string, string> = {
          Dragon: '龙族', Skeleton: '骷髅', Goblin: '哥布林',
          Ogre: '食人魔', Wraith: '幽灵', Swarm: '虫群', Golem: '魔像',
        };
        const elitePropsMap: Record<string, Partial<GameCardData>> = {
          Dragon: {
            monsterSpecial: 'ember-fury',
            monsterSpecialDesc: '融合精英：流血（每失去1耐久攻击+3）+ 龙息庇护。',
            bleedEffect: 'attack+3', eliteHealOtherMonster: true,
          },
          Skeleton: {
            monsterSpecial: 'bone-regen',
            monsterSpecialDesc: '融合精英：虚骨再生（50%不消耗耐久）+ 复生。',
            hasRevive: true,
          },
          Goblin: {
            monsterSpecial: 'goblin-elite',
            monsterSpecialDesc: '融合精英：攻击偷取3金币 + 窃宝。',
            goblinStealEquip: true, onAttackEffect: 'steal-gold-3',
          },
          Ogre: {
            monsterSpecial: 'ogre-crit',
            monsterSpecialDesc: '融合精英：攻击伤害翻倍 + 50%概率额外攻击一次。',
            eliteDoubleAttack: true, weaponExtraAttack: 1,
          },
          Wraith: {
            monsterSpecial: 'wraith-rebirth',
            monsterSpecialDesc: '融合精英：幽魂重生（耐久降至1时回满）+ 幽魂作祟遗言。',
            lastWords: 'wraith-haunt-4',
          },
          Swarm: {
            monsterSpecial: 'swarm-elite',
            monsterSpecialDesc: '融合精英：虫群繁殖 + 虫母（受伤时替换地城牌为小虫子）。',
            swarmSpawn: true,
          },
          Golem: {
            monsterSpecial: 'golem-elite',
            monsterSpecialDesc: '融合精英：岩石护体（每次最多受5伤）+ 反魔。',
            maxDamagePerHit: 5, antiMagicReflect: 2,
          },
        };

        let fusedEquip: GameCardData;
        const totalAtk = group.reduce((s, m) => s + (m.card.attack ?? m.card.value), 0);
        const totalHp = group.reduce((s, m) => s + (m.card.hp ?? m.card.value), 0);

        if (groupName === 'Skeleton' && fusionCount >= 3) {
          fusedEquip = {
            id: `fusion-skeleton-king-${Date.now()}`,
            type: 'monster',
            name: '骷髅王',
            monsterType: 'Skeleton',
            value: 10,
            attack: 10,
            hp: 10,
            maxHp: 10,
            durability: 4,
            maxDurability: 4,
            image: group[0].card.image,
            monsterSpecial: 'skeleton-king',
            monsterSpecialDesc: '骷髅王：拥有所有精英Skeleton效果。攻击次数+4，格挡耐久次数+4。',
            description: '骷髅王：虚骨再生 + 复生 + 攻击次数+4 + 格挡耐久次数+4。',
            hasRevive: true,
            weaponExtraAttack: 4,
            equipBlockDurabilityBonus: 4,
          };
          setHandCards(prev => [...prev, fusedEquip]);
          finalizeMagicCard(card, { banner: `${fusionCount} 个 Skeleton 装备融合为「骷髅王」！已加入手牌。` });
        } else {
          const eliteProps = elitePropsMap[groupName] ?? {
            monsterSpecial: 'fusion-elite',
            monsterSpecialDesc: '融合精英：由两个同种怪物装备融合而成。',
          };
          const cnName = raceNameMap[groupName] ?? groupName;
          fusedEquip = {
            id: `fusion-elite-equip-${Date.now()}`,
            type: 'monster',
            name: `精英${cnName}`,
            monsterType: groupName,
            value: totalAtk,
            attack: totalAtk,
            hp: totalHp,
            maxHp: totalHp,
            durability: 4,
            maxDurability: 4,
            image: group[0].card.image,
            description: `融合精英怪物装备，由两个${cnName}装备融合而成。`,
            ...eliteProps,
          };
          setHandCards(prev => [...prev, fusedEquip]);
          finalizeMagicCard(card, { banner: `2 个 ${groupName} 装备融合为「精英${cnName}」！已加入手牌。` });
        }
        return true;
      }
      case 'mirror-copy': {
        const st = engine.getState();
        const hasEquip = Boolean(st.equipmentSlot1) || Boolean(st.equipmentSlot2);
        const hasAmulets = st.amuletSlots.length > 0;
        const hasHand = depsRef.current.handCardsRef.current.length > 0;
        if (!hasEquip && !hasAmulets && !hasHand) {
          if (card.classCard) depsRef.current.consumeClassCardFromHand(card.id);
          finalizeMagicCard(card, { banner: '镜影摹形：没有可选的牌（装备栏、护符栏与手牌皆空）。' });
          return true;
        }
        depsRef.current.openMirrorCopyModal(card.id);
        return true;
      }
      case 'recycle-random-to-hand': {
        const availableBag = permanentMagicRecycleBag.filter(c => c.id !== card.id);
        if (availableBag.length === 0) {
          if (card.classCard) depsRef.current.consumeClassCardFromHand(card.id);
          finalizeMagicCard(card, { banner: '归袋抽引：回收袋为空。' });
          return true;
        }
        const pick = availableBag[Math.floor(Math.random() * availableBag.length)];
        if (card.classCard) depsRef.current.consumeClassCardFromHand(card.id);
        setPermanentMagicRecycleBag(prev => prev.filter(c => c.id !== pick.id));
        depsRef.current.queueCardIntoHand(pick);
        depsRef.current.addGameLog('deck', `归袋抽引：从回收袋抽取「${pick.name}」。`);
        finalizeMagicCard(card, { banner: `归袋抽引：从回收袋抽取「${pick.name}」！` });
        return true;
      }
      case 'deck-judge-delete': {
        if (card.classCard) depsRef.current.consumeClassCardFromHand(card.id);
        void resolveDeckJudgeDelete(card);
        return true;
      }
      case 'transform-grant': {
        const eligible = depsRef.current.handCardsRef.current.filter(
          c => c.id !== card.id && !c.transformBonus,
        );
        if (eligible.length === 0) {
          if (card.classCard) depsRef.current.consumeClassCardFromHand(card.id);
          finalizeMagicCard(card, { banner: '蜕变赋灵：手牌中没有可赋予转型的卡牌。' });
          return true;
        }
        if (eligible.length === 1) {
          const target = eligible[0];
          setHandCards(prev => prev.map(c =>
            c.id === target.id
              ? { ...c, transformBonus: '随机获得坟场一张魔法卡', transformEffect: 'graveyard-random-magic' }
              : c,
          ));
          depsRef.current.addGameLog('magic', `蜕变赋灵：「${target.name}」获得转型效果！`);
          if (card.classCard) depsRef.current.consumeClassCardFromHand(card.id);
          finalizeMagicCard(card, { banner: `「${target.name}」获得转型：随机获得坟场一张魔法卡！` });
          return true;
        }
        setPermGrantModal({ sourceCardId: card.id, sourceType: 'transform-grant' });
        return true;
      }
      case 'missile-bolt': {
        const monsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
        if (monsters.length === 0) {
          finalizeMagicCard(card, { banner: '魔弹无效（没有怪物）。' });
          return true;
        }
        if (monsters.length === 1) {
          const boltDmg = getSpellDamage(2 + (card.amplifyBonus ?? 0));
          if (!depsRef.current.isMonsterEngaged(monsters[0].id)) depsRef.current.beginCombat(monsters[0], 'hero');
          depsRef.current.dealDamageToMonster(monsters[0], boltDmg, { pulses: 2, isSpellDamage: true });
          depsRef.current.addGameLog('magic', `魔弹：对 ${monsters[0].name} 造成 ${boltDmg} 点法术伤害`);
          finalizeMagicCard(card, { banner: `魔弹：对 ${monsters[0].name} 造成 ${boltDmg} 点伤害！`, dealtDamage: true });
          return true;
        }
        const boltPendingDmg = getSpellDamage(2 + (card.amplifyBonus ?? 0));
        setPendingMagicAction({
          card,
          effect: 'missile-bolt',
          step: 'monster-select',
          prompt: `选择一个怪物，造成 ${boltPendingDmg} 点法术伤害。`,
        });
        setHeroSkillBanner(`选择一个怪物，造成 ${boltPendingDmg} 点法术伤害。`);
        return true;
      }
      case 'stun-wave': {
        setStunCap(prev => Math.min(100, prev + 10));
        depsRef.current.addGameLog('magic', '震慑领域：击晕上限 +10%');
        void resolveStunWave(card);
        return true;
      }
      case 'amulet-expand': {
        if (card.classCard) depsRef.current.consumeClassCardFromHand(card.id);
        setMaxAmuletSlots(prev => prev + 1);
        const newMax = engine.getState().maxAmuletSlots + 1;
        depsRef.current.addGameLog('magic', `符位开辟：护符栏上限 +1（当前上限 ${newMax}）`);
        finalizeMagicCard(card, { banner: `护符栏上限提升至 ${newMax}！` });
        return true;
      }
      default:
        return false;
    }
  };

  // ---------------------------------------------------------------------------
  // handleKnightPermanentMagic
  // ---------------------------------------------------------------------------

  const handleKnightPermanentMagic = (card: KnightCardData, echoMul: number = 1): boolean => {
    if (!card.knightEffect) {
      return false;
    }

    switch (card.knightEffect) {
      case 'armor-strike': {
        const armorPcts = [50, 100, 150];
        const armorPct = armorPcts[card.upgradeLevel ?? 0] ?? 150;
        const scaleArmor = (v: number) => Math.floor(v * armorPct / 100);
        const shieldSlots = depsRef.current.getEquipmentSlots().filter(slot => slot.item?.type === 'shield' || slot.item?.type === 'monster');
        depsRef.current.consumeClassCardFromHand(card.id);
        if (shieldSlots.length === 0) {
          finalizeMagicCard(card, { banner: '没有可转化为伤害的护甲。' });
          return true;
        }
        if (shieldSlots.length === 1) {
          const slotId = shieldSlots[0].id;
          const rawArmor = depsRef.current.calculateSlotArmorValue(slotId);
          const scaledArmor = scaleArmor(rawArmor);
          if (scaledArmor <= 0) {
            finalizeMagicCard(card, { banner: '该盾牌目前没有可用的护甲。' });
            return true;
          }
          const ampBonus = card.amplifyBonus ?? 0;
          const monsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
          if (monsters.length === 1) {
            const totalDamage = getSpellDamage(scaledArmor + ampBonus);
            if (!depsRef.current.isMonsterEngaged(monsters[0].id)) depsRef.current.beginCombat(monsters[0], 'hero');
            depsRef.current.dealDamageToMonster(monsters[0], totalDamage, { pulses: 2, isSpellDamage: true });
            finalizeMagicCard(card, { banner: `御甲破击造成 ${totalDamage} 点伤害（护甲 ${armorPct}%）。`, dealtDamage: true });
            return true;
          }
          setPendingMagicAction({
            card,
            effect: 'armor-strike',
            step: 'monster-select',
            slotId,
            pendingDamage: scaledArmor,
            prompt: `选择一个怪物，承受 ${getSpellDamage(scaledArmor + ampBonus)} 点护甲伤害。`,
          });
          setHeroSkillBanner('选择一个怪物承受你的护甲一击。');
          return true;
        }
        setPendingMagicAction({
          card,
          effect: 'armor-strike',
          step: 'slot-select',
          prompt: '选择一个盾牌槽，将其护甲值转化为伤害。',
        });
        setHeroSkillBanner('选择一个盾牌，将护甲值转化为伤害。');
        return true;
      }
      case 'armor-stun-convert': {
        const stunPerArmors = [1, 2];
        const stunPerArmor = stunPerArmors[card.upgradeLevel ?? 0] ?? 2;
        const shieldSlots = depsRef.current.getEquipmentSlots().filter(slot => slot.item?.type === 'shield' || slot.item?.type === 'monster');
        depsRef.current.consumeClassCardFromHand(card.id);
        if (shieldSlots.length === 0) {
          finalizeMagicCard(card, { banner: '没有护盾可供选择。' });
          return true;
        }
        if (shieldSlots.length === 1) {
          const slotId = shieldSlots[0].id;
          const armorValue = depsRef.current.calculateSlotArmorValue(slotId);
          const totalStun = armorValue * stunPerArmor;
          const stunGain = Math.min(totalStun, 100 - stunCap);
          if (stunGain > 0) {
            setStunCap(prev => Math.min(100, prev + totalStun));
          }
          addGameLog('magic', `护甲凝雷：护甲 ${armorValue} → 击晕上限 +${stunGain}%`);
          finalizeMagicCard(card, { banner: `护甲 ${armorValue} 点 → 击晕上限 +${stunGain}%！` });
          return true;
        }
        setPendingMagicAction({
          card,
          effect: 'armor-stun-convert',
          step: 'slot-select',
          prompt: '选择一个护盾，将护甲值转化为击晕上限。',
        });
        setHeroSkillBanner('选择一个护盾，将护甲值转化为击晕上限。');
        return true;
      }
      case 'missing-hp-smite': {
        const smitePcts = [50, 100, 150];
        const smitePct = smitePcts[card.upgradeLevel ?? 0] ?? 150;
        const monsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
        depsRef.current.consumeClassCardFromHand(card.id);
        if (monsters.length === 0) {
          finalizeMagicCard(card, { banner: '当前没有可攻击的怪物。' });
          return true;
        }
        if (monsters.length === 1) {
          const missingHp = Math.max(0, maxHp - hp);
          const scaledDmg = Math.floor(missingHp * smitePct / 100);
          const totalDamage = getSpellDamage(scaledDmg + (card.amplifyBonus ?? 0));
          if (totalDamage <= 0) {
            finalizeMagicCard(card, { banner: '你处于满血状态，没有造成伤害。' });
            return true;
          }
          if (!depsRef.current.isMonsterEngaged(monsters[0].id)) depsRef.current.beginCombat(monsters[0], 'hero');
          depsRef.current.dealDamageToMonster(monsters[0], totalDamage, { pulses: 2, isSpellDamage: true });
          finalizeMagicCard(card, { banner: `残血裁决释放 ${totalDamage} 点伤害（${smitePct}%）。`, dealtDamage: true });
          return true;
        }
        setPendingMagicAction({
          card,
          effect: 'missing-hp-smite',
          step: 'monster-select',
          prompt: '选择一个怪物，承受你缺失生命的伤害。',
        });
        setHeroSkillBanner('选择一个怪物，承受你缺失生命的伤害。');
        return true;
      }
      case 'blood-sacrifice-strike': {
        const monsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
        depsRef.current.consumeClassCardFromHand(card.id);
        if (monsters.length === 0) {
          finalizeMagicCard(card, { banner: '当前没有可攻击的怪物。' });
          return true;
        }
        const hpToLose = Math.floor(hp / 2);
        if (hpToLose <= 0) {
          finalizeMagicCard(card, { banner: '生命值过低，无法献祭。' });
          return true;
        }
        const baseDmg = hpToLose * 2;
        const totalDamage = getSpellDamage(baseDmg + (card.amplifyBonus ?? 0));
        if (monsters.length === 1) {
          depsRef.current.applyDamage(hpToLose, 'general', { selfInflicted: true });
          if (!depsRef.current.isMonsterEngaged(monsters[0].id)) depsRef.current.beginCombat(monsters[0], 'hero');
          depsRef.current.dealDamageToMonster(monsters[0], totalDamage, { pulses: 2, isSpellDamage: true });
          finalizeMagicCard(card, { banner: `血祭裁决：献祭 ${hpToLose} 点生命，对 ${monsters[0].name} 造成 ${totalDamage} 点伤害！`, dealtDamage: true });
          return true;
        }
        setPendingMagicAction({
          card,
          effect: 'blood-sacrifice-strike',
          step: 'monster-select',
          pendingDamage: totalDamage,
          hpLost: hpToLose,
          prompt: `选择一个怪物，献祭 ${hpToLose} 点生命，造成 ${totalDamage} 点伤害。`,
        });
        setHeroSkillBanner(`血祭裁决：选择目标，献祭 ${hpToLose} 点生命，造成 ${totalDamage} 点伤害。`);
        return true;
      }
      case 'temp-attack-strike': {
        const isFlank = depsRef.current.lastPlayedFlankRef.current;
        depsRef.current.consumeClassCardFromHand(card.id);
        const allSlots = depsRef.current.getEquipmentSlots().filter(slot => slot.item != null);
        if (allSlots.length === 0) {
          finalizeMagicCard(card, { banner: '没有装备可选择。' });
          return true;
        }
        const slotsWithTempAtk = allSlots.filter(slot => (gs.slotTempAttack[slot.id] ?? 0) > 0);
        if (slotsWithTempAtk.length === 0) {
          finalizeMagicCard(card, { banner: '所有装备栏都没有临时攻击。' });
          return true;
        }
        if (slotsWithTempAtk.length === 1) {
          const slotId = slotsWithTempAtk[0].id;
          const tempAtk = gs.slotTempAttack[slotId] ?? 0;
          const monsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
          if (monsters.length === 0) {
            finalizeMagicCard(card, { banner: '当前没有可攻击的怪物。' });
            return true;
          }
          const target = monsters[Math.floor(Math.random() * monsters.length)];
          const totalDamage = getSpellDamage(tempAtk + (card.amplifyBonus ?? 0));
          if (!depsRef.current.isMonsterEngaged(target.id)) depsRef.current.beginCombat(target, 'hero');
          depsRef.current.dealDamageToMonster(target, totalDamage, { pulses: 2, isSpellDamage: true });
          let stunText = '';
          if (isFlank && !target.isStunned) {
            const effectiveFlankStun = Math.min(40 + (depsRef.current.amuletEffects?.stunRateBoost ?? 0), stunCap);
            const threshold = Math.round((effectiveFlankStun / 100) * 20);
            const stunDicePromise = depsRef.current.requestDiceOutcome({
              title: target.name,
              subtitle: `侧击击晕判定（${effectiveFlankStun}%）`,
              entries: [
                { id: 'stun', range: [1, threshold] as [number, number], label: '击晕成功！', effect: 'none' },
                { id: 'miss', range: [threshold + 1, 20] as [number, number], label: '未击晕', effect: 'none' },
              ],
            });
            void stunDicePromise.then(stunResult => {
              if (stunResult?.id === 'stun') {
                depsRef.current.updateMonsterCard(target.id, m => ({ ...m, isStunned: true }));
                addGameLog('combat', `${target.name} 被侧击击晕了！`);
              }
            });
            stunText = '（侧击：击晕判定中…）';
          }
          addGameLog('magic', `锋刃侧击：对 ${target.name} 造成 ${totalDamage} 点伤害${isFlank ? '（侧击触发）' : ''}`);
          finalizeMagicCard(card, { banner: `锋刃侧击对 ${target.name} 造成 ${totalDamage} 点伤害！${stunText}`, dealtDamage: true });
          return true;
        }
        setPendingMagicAction({
          card,
          effect: 'temp-attack-strike',
          step: 'slot-select',
          prompt: '选择一个装备栏，以其临时攻击值对随机怪物造成伤害。',
          isFlank,
        });
        setHeroSkillBanner('选择一个装备栏，将临时攻击转化为伤害。');
        return true;
      }
      case 'flank-fortify': {
        const isFlank = depsRef.current.lastPlayedFlankRef.current;
        depsRef.current.consumeClassCardFromHand(card.id);
        const useCount = (card as any)._flankFortifyUses ?? 0;
        const armorBonus = 3 + useCount;
        const allSlots = depsRef.current.getEquipmentSlots().filter(slot => slot.item != null);
        if (allSlots.length === 0) {
          finalizeMagicCard(card, { banner: '没有装备可选择。' });
          return true;
        }
        if (allSlots.length === 1) {
          const slotId = allSlots[0].id;
          const slotItem = allSlots[0].item!;
          setSlotTempArmor(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + armorBonus }));
          let flankText = '';
          if (isFlank) {
            if (!slotItem.hasEquipmentRevive || slotItem.equipmentReviveUsed) {
              depsRef.current.setEquipmentSlotById(slotId, { ...slotItem, hasEquipmentRevive: true, equipmentReviveUsed: false } as any);
              flankText = ` 侧击触发：${slotItem.name} 获得复生！`;
              addGameLog('magic', `固壁侧守（侧击）：${slotItem.name} 获得复生能力`);
            } else {
              flankText = ` 侧击触发：${slotItem.name} 已有复生，无额外效果。`;
            }
          }
          const newUses = useCount + 1;
          const nextArmor = 3 + newUses;
          const updatedCard = {
            ...card,
            _flankFortifyUses: newUses,
            description: `永久：选择一个装备，+${nextArmor}（每次使用后数值 +1）临时护甲。侧击：赋予该装备复生。`,
            magicEffect: `+${nextArmor}(递增) 临时护甲，侧击赋予复生。`,
          } as GameCardData;
          addGameLog('magic', `固壁侧守：${slotItem.name} +${armorBonus} 临时护甲`);
          finalizeMagicCard(updatedCard, { banner: `${slotItem.name} +${armorBonus} 临时护甲。${flankText}` });
          return true;
        }
        setPendingMagicAction({
          card,
          effect: 'flank-fortify',
          step: 'slot-select',
          prompt: `选择一个装备，+${armorBonus} 临时护甲。`,
          isFlank,
        });
        setHeroSkillBanner(`选择一个装备，+${armorBonus} 临时护甲。${isFlank ? '（侧击：赋予复生）' : ''}`);
        return true;
      }
      case 'grave-nova': {
        depsRef.current.consumeClassCardFromHand(card.id);
        finalizeMagicCard(card, { banner: '殉烈爆鸣就绪：当它被弃置时会爆裂。' });
        return true;
      }
      case 'recycle-flare': {
        depsRef.current.consumeClassCardFromHand(card.id);
        const restored = depsRef.current.restorePermanentMagicFromRecycleBag();
        const flareDrawCounts = [2, 3, 4];
        const flareDraw = flareDrawCounts[card.upgradeLevel ?? 0] ?? 4;
        const drawnCards = depsRef.current.takeRandomCardsFromBackpack(Math.min(flareDraw, engine.getState().backpackItems.length));
        drawnCards.forEach(c => depsRef.current.queueCardIntoHand(c));
        const draws = drawnCards.length;
        const bannerParts: string[] = [];
        bannerParts.push(
          restored > 0 ? `回收袋返还 ${restored} 张牌。` : '回收袋里没有等待的卡牌。',
        );
        bannerParts.push(draws > 0 ? `抽到了 ${draws} 张牌。` : '没有抽到卡牌。');

        const hasForgeHeart = engine.getState().amuletSlots.some(a => a?.amuletEffect === 'flip-gold');
        if (hasForgeHeart) {
          setAmuletSlots(prev => prev.filter(slot => slot?.amuletEffect !== 'flip-gold'));
          const recycleForgeAmulet: GameCardData = {
            id: `amulet-recycle-forge-${Date.now()}`,
            type: 'amulet',
            name: '回收熔炉',
            value: 0,
            image: forgeHeartAmuletImage,
            description: '每使用或弃回 5 张牌，回收袋洗回背包（所有牌剩余瀑流 -1），然后抽 2 张牌。(可超手牌上限) [0/5]',
            amuletEffect: 'recycle-forge',
          };
          void depsRef.current.triggerEventTransform(card, recycleForgeAmulet, '回收灵焰翻转为「回收熔炉」');
          depsRef.current.queueCardIntoHand(recycleForgeAmulet);
          bannerParts.push('熔炉之心消散，回收灵焰翻转为「回收熔炉」加入手牌！');
          depsRef.current.addGameLog('amulet', '回收灵焰与熔炉之心共鸣：熔炉之心消散，「回收熔炉」加入手牌！');
          depsRef.current.addGameLog('magic', `魔法：${card.name} — ${bannerParts.join(' ')}`);
          setHeroSkillBanner(bannerParts.join(' '));
          depsRef.current.addToGraveyard(card);
          depsRef.current.stagingCardsRef.current =
            depsRef.current.stagingCardsRef.current.filter(c => c.id !== card.id);
          depsRef.current.drainPendingDiscardEffects();
        } else {
          finalizeMagicCard(card, { banner: bannerParts.join(' ') });
        }
        return true;
      }
      case 'blood-draw': {
        depsRef.current.consumeClassCardFromHand(card.id);
        const bloodDrawCounts = [3, 4, 5];
        const bloodDraw = bloodDrawCounts[card.upgradeLevel ?? 0] ?? 5;
        const hpCost = 1;
        depsRef.current.applyDamage(hpCost, 'general', { selfInflicted: true });
        const drawn = drawCardsFromBackpack(bloodDraw, { ignoreLimit: true });
        depsRef.current.addGameLog('magic', `血契抽引：失去 ${hpCost} HP，抽了 ${drawn} 张牌。`);
        finalizeMagicCard(card, { banner: `血契抽引：失去 ${hpCost} HP，抽了 ${drawn} 张牌！` });
        return true;
      }
      case 'repair-enrage-dice': {
        const allSlots = depsRef.current.getEquipmentSlots().filter(slot => slot.item != null);
        const monsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
        depsRef.current.consumeClassCardFromHand(card.id);
        if (allSlots.length === 0 || monsters.length === 0) {
          finalizeMagicCard(card, { banner: '没有可选的装备或怪物。' });
          return true;
        }
        if (allSlots.length === 1 && monsters.length === 1) {
          void resolveRepairEnrageDice(card, allSlots[0].id, monsters[0]);
          return true;
        }
        if (allSlots.length === 1) {
          setPendingMagicAction({
            card,
            effect: 'repair-enrage-dice',
            step: 'monster-select',
            slotId: allSlots[0].id,
            prompt: '选择一个怪物作为赌运目标。',
          });
          setHeroSkillBanner('选择一个怪物作为赌运目标。');
          return true;
        }
        setPendingMagicAction({
          card,
          effect: 'repair-enrage-dice',
          step: 'slot-select',
          prompt: '选择一个装备进行锻造赌运。',
        });
        setHeroSkillBanner('选择一个装备进行锻造赌运。');
        return true;
      }
      case 'chaos-dice': {
        depsRef.current.consumeClassCardFromHand(card.id);
        void resolveChaosDice(card);
        return true;
      }
      case 'fate-sight': {
        const baseDamages = [3, 4];
        const peekCounts = [3, 4];
        const baseDmg = baseDamages[card.upgradeLevel ?? 0] ?? 3;
        const peekCount = peekCounts[card.upgradeLevel ?? 0] ?? 3;
        const monsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
        depsRef.current.consumeClassCardFromHand(card.id);
        if (monsters.length === 0) {
          finalizeMagicCard(card, { banner: '当前没有可攻击的怪物。' });
          return true;
        }
        if (monsters.length === 1) {
          resolveFateSight(card, monsters[0], baseDmg, peekCount);
          return true;
        }
        setPendingMagicAction({
          card,
          effect: 'fate-sight',
          step: 'monster-select',
          prompt: `选择一个怪物，造成 ${getSpellDamage(baseDmg)} 点伤害并透视牌堆。`,
        });
        setHeroSkillBanner('选择一个怪物作为天眼审判的目标。');
        return true;
      }
      case 'stat-swap': {
        const isFlank = depsRef.current.lastPlayedFlankRef.current;
        depsRef.current.consumeClassCardFromHand(card.id);
        const monsters = flattenActiveRowSlots(activeCards).filter(c => c?.type === 'monster');
        if (monsters.length === 0) {
          finalizeMagicCard(card, { banner: '当前没有可攻击的怪物。' });
          return true;
        }
        if (monsters.length === 1) {
          resolveStatSwap(card, monsters[0], isFlank);
          return true;
        }
        setPendingMagicAction({
          card,
          effect: 'stat-swap',
          step: 'monster-select',
          prompt: '选择一个怪物，将其攻击和血量上限对换。',
          isFlank,
        });
        setHeroSkillBanner('颠倒乾坤：选择一个怪物。');
        return true;
      }
      case 'honor-sweep': {
        depsRef.current.consumeClassCardFromHand(card.id);
        const weaponSlots = depsRef.current.getEquipmentSlots().filter(
          s => s.item && (s.item.type === 'weapon' || s.item.type === 'monster'),
        );
        if (weaponSlots.length === 0) {
          finalizeMagicCard(card, { banner: '没有已装备的武器（或随从武器）。' });
          return true;
        }
        if (weaponSlots.length === 1) {
          depsRef.current.applyHonorSweepMagic(card, weaponSlots[0].id);
          return true;
        }
        setPendingMagicAction({
          card,
          effect: 'honor-sweep',
          step: 'slot-select',
          prompt:
            '选择一把武器：对激活行所有怪物造成等同于该攻击力的法术伤害（每轮每怪分开结算），不耗耐久；该栏临时攻击 -5。',
        });
        setHeroSkillBanner('战血横扫：选择一把武器。');
        return true;
      }
      case 'weapon-sweep': {
        depsRef.current.consumeClassCardFromHand(card.id);
        const wSlots = depsRef.current.getEquipmentSlots().filter(
          s => s.item && (s.item.type === 'weapon' || s.item.type === 'monster'),
        );
        if (wSlots.length === 0) {
          finalizeMagicCard(card, { banner: '没有已装备的武器（或随从武器）。' });
          return true;
        }
        if (wSlots.length === 1) {
          depsRef.current.applyWeaponSweepMagic(card, wSlots[0].id);
          return true;
        }
        setPendingMagicAction({
          card,
          effect: 'weapon-sweep',
          step: 'slot-select',
          prompt:
            '选择一把武器：对激活行所有怪物造成等同于该武器攻击力的法术伤害（不耗耐久），该栏临时攻击 -3。',
        });
        setHeroSkillBanner('利刃风暴：选择一把武器。');
        return true;
      }
      case 'transform-repair': {
        depsRef.current.consumeClassCardFromHand(card.id);
        const equippedSlots = depsRef.current.getEquipmentSlots().filter(s => s.item);
        if (equippedSlots.length === 0) {
          finalizeMagicCard(card, { banner: '没有装备可选择。' });
          return true;
        }

        const prevCategory = engine.getState().lastPlayedCardCategory;
        const curCategory = getCardPlayCategory(card);
        const transformTriggered = prevCategory != null && prevCategory !== curCategory;
        const triggerCount = (card as any)._transformRepairTriggers ?? 0;
        const transformAtkBase = 3 + triggerCount;

        if (equippedSlots.length === 1) {
          const slot = equippedSlots[0];
          const slotItem = slot.item!;
          const maxDur = slotItem.maxDurability ?? slotItem.durability ?? 0;
          const curDur = slotItem.durability ?? maxDur;
          const repairAmt = 1 * echoMul;
          if (maxDur > 0 && curDur < maxDur) {
            depsRef.current.setEquipmentSlotById(slot.id, {
              ...slotItem,
              durability: Math.min(maxDur, curDur + repairAmt),
            });
          }
          const parts: string[] = [];
          if (maxDur > 0 && curDur < maxDur) {
            parts.push(`${slotItem.name} 耐久 +${repairAmt}`);
          } else {
            parts.push(`${slotItem.name} 已满耐久`);
          }
          let updatedCard = card;
          if (transformTriggered) {
            const tempAtkBonus = transformAtkBase * echoMul;
            setSlotTempAttack(prev => ({ ...prev, [slot.id]: (prev[slot.id] ?? 0) + tempAtkBonus }));
            parts.push(`转型：临时攻击 +${tempAtkBonus}`);
            if (depsRef.current.amuletEffects.hasPersuadeOnTempAttack) {
              const pBonus = depsRef.current.amuletEffects.persuadeOnTempAttackBonus || 5;
              depsRef.current.persuadeAmuletBonusRef.current += pBonus;
            }
            const newTriggers = triggerCount + 1;
            const nextAtk = 3 + newTriggers;
            updatedCard = {
              ...card,
              _transformRepairTriggers: newTriggers,
              transformBonus: `给该装备栏 +${nextAtk} 临时攻击（每次触发后数值 +1）`,
            } as GameCardData;
          }
          finalizeMagicCard(updatedCard, { banner: parts.join('。') + '。' });
          return true;
        }

        setPendingMagicAction({
          card,
          effect: 'transform-repair',
          step: 'slot-select',
          prompt: transformTriggered
            ? `选择一个装备恢复 1 耐久，并 +${transformAtkBase} 临时攻击（转型）。`
            : '选择一个装备恢复 1 耐久。',
          transformTriggered,
          echoMultiplier: echoMul,
        });
        setHeroSkillBanner(
          transformTriggered
            ? '蜕变修复：选择一个装备。（转型已触发！）'
            : '蜕变修复：选择一个装备。',
        );
        return true;
      }
      case 'fortune-wheel': {
        depsRef.current.consumeClassCardFromHand(card.id);
        void resolveFortuneWheel(card);
        return true;
      }
      case 'essence-extract': {
        depsRef.current.consumeClassCardFromHand(card.id);
        const otherHand = engine.getState().handCards.filter(c => c.id !== card.id);
        if (otherHand.length === 0) {
          finalizeMagicCard(card, { banner: '手牌中没有可移除的卡牌。' });
          return true;
        }
        setPermGrantModal({ sourceCardId: card.id, sourceType: 'essence-extract' });
        setHeroSkillBanner('精华萃取：选择一张手牌移除。');
        return true;
      }
      default:
        return false;
    }
  };

  // ---------------------------------------------------------------------------
  // resolveFortuneWheel (async helper for knight fortune-wheel)
  // ---------------------------------------------------------------------------

  const resolveFortuneWheel = async (card: GameCardData) => {
    depsRef.current.clearUndoStack();
    const diceResult = await depsRef.current.requestDiceOutcome({
      title: '际遇轮盘',
      subtitle: '命运转动——掷出你的机遇',
      entries: [
        { id: 'fw-discover', range: [1, 5] as [number, number], label: '发现一张专属魔法卡（三选一）', effect: 'none' },
        { id: 'fw-draw', range: [6, 10] as [number, number], label: '从背包抽 2 张牌', effect: 'none' },
        { id: 'fw-delete', range: [11, 15] as [number, number], label: '删除 1 张牌', effect: 'none' },
        { id: 'fw-persuade', range: [16, 20] as [number, number], label: '下次劝降概率 +20%', effect: 'none' },
      ],
    });
    if (!diceResult) {
      finalizeMagicCard(card, { banner: '际遇轮盘已取消。' });
      return;
    }
    let banner = '际遇轮盘没有产生任何效果。';

    switch (diceResult.id) {
      case 'fw-discover': {
        const isClassMagic = (c: GameCardData) => c.type === 'magic' || c.type === 'hero-magic';
        const started = depsRef.current.beginDiscoverFlow('fortune-wheel', { filter: isClassMagic, sourceLabel: card.name });
        banner = started ? '际遇轮盘：发现一张专属魔法卡（三选一）。' : '际遇轮盘：专属牌堆已耗尽，无法发现。';
        break;
      }
      case 'fw-draw': {
        const drawn = drawCardsFromBackpack(2, { ignoreLimit: true });
        banner = drawn > 0
          ? `际遇轮盘：从背包抽了 ${drawn} 张牌。`
          : '际遇轮盘：背包为空，未能抽牌。';
        break;
      }
      case 'fw-delete': {
        const success = await depsRef.current.requestCardAction('delete', 1, {
          title: '际遇轮盘：删除卡牌',
          description: '选择 1 张牌永久删除。',
        });
        banner = success
          ? '际遇轮盘：已删除 1 张牌。'
          : '际遇轮盘：没有可删除的牌。';
        break;
      }
      case 'fw-persuade': {
        depsRef.current.persuadeDiscountRef.current = {
          costReduction: 0,
          rateBonus: 20,
        };
        banner = '际遇轮盘：下次劝降成功率 +20%。';
        break;
      }
      default:
        break;
    }

    finalizeMagicCard(card, { banner });
  };

  // ---------------------------------------------------------------------------
  // resolveGraveyardRecall (async helper for knight graveyard-recall)
  // ---------------------------------------------------------------------------

  const resolveGraveyardRecall = async (card: GameCardData) => {
    const recallCounts = [3, 4, 5, 6];
    const maxRecall = recallCounts[card.upgradeLevel ?? 0] ?? 6;
    const eligible = discardedCards.filter(c => c.id !== card.id);
    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    const recalled = shuffled.slice(0, Math.min(maxRecall, shuffled.length));

    recalled.forEach(c => {
      setDiscardedCards(prev => prev.filter(dc => dc.id !== c.id));
      depsRef.current.addCardToBackpack(c);
    });

    const banner = recalled.length > 0
      ? `冥途拾遗从坟场召回了 ${recalled.length} 张牌：${recalled.map(c => c.name).join('、')}`
      : '坟场中没有可召回的卡牌。';

    depsRef.current.addGameLog('magic', `魔法：${card.name} — ${banner}`);
    setHeroSkillBanner(banner);
    depsRef.current.removePendingDungeonCard(card.id);
    depsRef.current.removeCard(card.id, false);
    setPendingMagicAction(null);

    depsRef.current.addToGraveyard(card);
    depsRef.current.stagingCardsRef.current =
      depsRef.current.stagingCardsRef.current.filter(c => c.id !== card.id);
    depsRef.current.drainPendingDiscardEffects();
  };

  // ---------------------------------------------------------------------------
  // resolveMonsterRecruit (async helper for knight monster-recruit)
  // ---------------------------------------------------------------------------

  const resolveDeckJudgeDelete = async (card: KnightCardData) => {
    const deck = engine.getState().remainingDeck;
    const peekedCards = deck.slice(0, Math.min(6, deck.length));

    let monsterCount = 0;
    let eventCount = 0;
    let equipCount = 0;
    let magicCount = 0;
    let potionCount = 0;
    for (const c of peekedCards) {
      if (c.type === 'monster') monsterCount++;
      else if (c.type === 'event' || c.type === 'building') eventCount++;
      else if (c.type === 'weapon' || c.type === 'shield') equipCount++;
      else if (c.type === 'magic') magicCount++;
      else if (c.type === 'potion') potionCount++;
    }

    const gains: { label: string; count: number }[] = [];
    const bannerParts: string[] = [];

    if (eventCount > 0) {
      const bonus = eventCount * 2;
      setSlotTempAttack(prev => ({
        ...prev,
        equipmentSlot1: (prev.equipmentSlot1 ?? 0) + bonus,
        equipmentSlot2: (prev.equipmentSlot2 ?? 0) + bonus,
      }));
      gains.push({ label: '左右装备栏临时攻击 +2', count: eventCount });
      bannerParts.push(`临时攻击+${bonus}`);
    }

    if (equipCount > 0) {
      const slots = depsRef.current.getEquipmentSlots();
      for (const slot of slots) {
        const item = slot.item;
        if (item && item.durability != null && item.maxDurability != null) {
          const newDur = Math.min(item.maxDurability, item.durability + equipCount);
          if (newDur > item.durability) {
            depsRef.current.setEquipmentSlotById(slot.id, { ...item, durability: newDur });
          }
        }
      }
      gains.push({ label: '装备耐久 +1', count: equipCount });
      bannerParts.push(`耐久+${equipCount}`);
    }

    if (magicCount > 0) {
      setPermanentSpellDamageBonus(prev => prev + magicCount);
      gains.push({ label: '永久法术伤害 +1', count: magicCount });
      bannerParts.push(`法伤+${magicCount}`);
    }

    if (potionCount > 0) {
      const healAmt = potionCount * 2;
      setHp(prev => Math.min(prev + healAmt, engine.getState().maxHp));
      gains.push({ label: '+2 HP', count: potionCount });
      bannerParts.push(`回血+${healAmt}`);
    }

    if (monsterCount > 0) {
      gains.push({ label: '须删除一张牌', count: monsterCount });
      bannerParts.push(`删牌${monsterCount}`);
    }

    depsRef.current.setDeckPeekState({
      mode: 'deck-judge-delete',
      peekedCards,
      monsterCount,
      deleteCount: monsterCount,
      gains,
    });

    await new Promise<void>(resolve => {
      depsRef.current.deckJudgePeekCloseRef.current = () => resolve();
    });

    if (monsterCount > 0) {
      const getDeletePool = (): number => {
        const st = engine.getState();
        const allEquip = [
          st.equipmentSlot1,
          ...st.equipmentSlot1Reserve,
          st.equipmentSlot2,
          ...st.equipmentSlot2Reserve,
        ].filter(Boolean) as GameCardData[];
        return (
          st.handCards.length
          + st.backpackItems.length
          + st.permanentMagicRecycleBag.length
          + allEquip.length
          + st.amuletSlots.length
        );
      };

      const pool = getDeletePool();
      const toDelete = Math.min(monsterCount, pool);

      if (toDelete > 0) {
        const success = await depsRef.current.requestCardAction('delete', toDelete, {
          title: '命数裁断：删除卡牌',
          description: `删除 ${toDelete} 张牌，将其送入坟场并永久移出构筑（不足时按可删数量执行）。`,
        });
        if (success) bannerParts[bannerParts.indexOf(`删牌${monsterCount}`)] = `已删除${toDelete}张`;
      }
    }

    const banner = peekedCards.length > 0
      ? `命数裁断翻看 ${peekedCards.length} 张牌：${bannerParts.length > 0 ? bannerParts.join('，') : '无效果'}。`
      : '命数裁断：主牌堆已空，无效果。';
    finalizeMagicCard(card, { banner });
  };

  const resolveMonsterRecruit = async (card: GameCardData) => {
    const recruited: string[] = [];

    for (let i = 0; i < 2; i++) {
      const currentDiscarded = engine.getState().discardedCards;
      const remaining = currentDiscarded.filter(c => c.type === 'monster');
      if (remaining.length === 0) break;

      const shuffled = [...remaining].sort(() => Math.random() - 0.5);
      const options = shuffled.slice(0, Math.min(3, shuffled.length));

      depsRef.current.graveyardDiscoverDeliveryRef.current = 'hand-first';
      const selected = await new Promise<GameCardData | null>(resolve => {
        depsRef.current.graveyardDiscoverResolverRef.current = c => {
          resolve(c);
          depsRef.current.graveyardDiscoverResolverRef.current = null;
        };
        setGraveyardDiscoverState(options);
      });

      if (selected) {
        recruited.push(selected.name);
      } else {
        break;
      }
    }

    if (recruited.length > 0) {
      finalizeMagicCard(card, { banner: `亡者之契：从坟场召唤了「${recruited.join('」「')}」加入手牌！` });
    } else {
      finalizeMagicCard(card, { banner: '未选择怪物。' });
    }
  };

  // ---------------------------------------------------------------------------
  // resolveRepairEnrageDice (async helper for knight repair-enrage-dice)
  // ---------------------------------------------------------------------------

  const resolveRepairEnrageDice = async (card: GameCardData, slotId: EquipmentSlotId, monster: GameCardData) => {
    depsRef.current.clearUndoStack();
    const diceResult = await depsRef.current.requestDiceOutcome({
      title: '锻造赌运',
      subtitle: '掷骰决定命运',
      entries: [
        { id: 'repair', range: [1, 16] as [number, number], label: '修复成功！装备 +1 耐久', effect: 'none' },
        { id: 'enrage', range: [17, 20] as [number, number], label: '失败！怪物 -1 血层并激怒', effect: 'none' },
      ],
    });
    if (!diceResult) {
      finalizeMagicCard(card, { banner: '锻造赌运已取消。' });
      return;
    }
    const slotItem = slotId === 'equipmentSlot1' ? engine.getState().equipmentSlot1 : engine.getState().equipmentSlot2;
    if (diceResult.id === 'repair') {
      if (slotItem && slotItem.durability != null && slotItem.maxDurability != null) {
        const newDur = Math.min(slotItem.maxDurability, slotItem.durability + 1);
        depsRef.current.setEquipmentSlotById(slotId, { ...slotItem, durability: newDur } as any);
        depsRef.current.addGameLog('magic', `锻造赌运：${slotItem.name} 耐久 +1（${slotItem.durability}→${newDur}）`);
        finalizeMagicCard(card, { banner: `锻造赌运成功！${slotItem.name} 耐久 +1！` });
      } else {
        finalizeMagicCard(card, { banner: '锻造赌运：装备已不存在。' });
      }
    } else {
      const oldLayers = monster.currentLayer ?? monster.fury ?? 1;
      if (oldLayers > 1) {
        depsRef.current.updateMonsterCard(monster.id, m => ({
          ...m,
          currentLayer: oldLayers - 1,
          hp: m.maxHp ?? m.hp ?? 0,
          attack: (m.attack ?? m.value) + 2,
          value: (m.attack ?? m.value) + 2,
        }));
        depsRef.current.addGameLog('magic', `锻造赌运失败：${monster.name} 失去 1 血层（${oldLayers}→${oldLayers - 1}）并激怒（攻击+2）！`);
        finalizeMagicCard(card, { banner: `锻造赌运失败！${monster.name} -1 血层并激怒（攻击+2）！` });
      } else {
        depsRef.current.updateMonsterCard(monster.id, m => ({
          ...m,
          attack: (m.attack ?? m.value) + 2,
          value: (m.attack ?? m.value) + 2,
        }));
        depsRef.current.addGameLog('magic', `锻造赌运失败：${monster.name} 已是最后血层，激怒（攻击+2）！`);
        finalizeMagicCard(card, { banner: `锻造赌运失败！${monster.name} 激怒（攻击+2）！` });
      }
    }
  };

  // ---------------------------------------------------------------------------
  // resolveChaosDice (async helper for knight chaos-dice)
  // ---------------------------------------------------------------------------

  const resolveChaosDice = async (card: GameCardData) => {
    depsRef.current.clearUndoStack();
    const diceResult = await depsRef.current.requestDiceOutcome({
      title: '混沌骰运',
      subtitle: '掷出混沌之力',
      entries: [
        { id: 'chaos-1', range: [1, 4] as [number, number], label: '装备回手（满则回收袋）', effect: 'none' },
        { id: 'chaos-2', range: [5, 8] as [number, number], label: '发现 1 张专属（三选一）', effect: 'none' },
        { id: 'chaos-3', range: [9, 12] as [number, number], label: '临时混沌商店', effect: 'none' },
        { id: 'chaos-4', range: [13, 16] as [number, number], label: '雷击：随机 1 怪，基础伤 3（双段）', effect: 'none' },
        { id: 'chaos-5', range: [17, 20] as [number, number], label: '弃回 2 抽 2', effect: 'none' },
      ],
    });
    if (!diceResult) {
      finalizeMagicCard(card, { banner: '混沌骰运已取消。' });
      return;
    }
    let banner = '混沌骰运没有产生任何效果。';

    switch (diceResult.id) {
      case 'chaos-1': {
        const equipmentSlots = depsRef.current.getEquipmentSlots();
        let returned = 0;
        let toHand = 0;
        let toRecycle = 0;
        let handLoad = depsRef.current.handCardsRef.current.length + depsRef.current.backpackHandFlightsRef.current.length;
        equipmentSlots.forEach(slot => {
          const allItems = [
            ...(slot.item ? [slot.item] : []),
            ...depsRef.current.getEquipmentReserve(slot.id),
          ];
          depsRef.current.clearEquipmentSlotById(slot.id);
          depsRef.current.setEquipmentReserve(slot.id, []);
          allItems.forEach(item => {
            const sanitized = sanitizeCardMetadata(item);
            if (handLoad < depsRef.current.effectiveHandLimit) {
              depsRef.current.queueCardIntoHand(sanitized, slot.id as FlightSourceHint);
              handLoad += 1;
              toHand += 1;
            } else {
              depsRef.current.addPermanentMagicToRecycleBag(sanitized);
              toRecycle += 1;
            }
            returned += 1;
          });
        });
        if (returned > 0) {
          depsRef.current.addGameLog(
            'magic',
            `混沌骰运：收回 ${returned} 件装备（手牌 +${toHand}，回收袋 +${toRecycle}）。`,
          );
          if (toRecycle > 0 && toHand > 0) {
            banner = `混沌骰运：${toHand} 件回手牌，${toRecycle} 件因手牌已满进入回收袋（瀑流后回背包）。`;
          } else if (toRecycle > 0) {
            banner = `混沌骰运：${toRecycle} 件装备因手牌已满进入回收袋（瀑流后回背包）。`;
          } else {
            banner = `混沌骰运：${returned} 件装备回到了手牌。`;
          }
        } else {
          banner = '混沌骰运尝试归还装备，但你没有已装备的武器或盾牌。';
        }
        break;
      }
      case 'chaos-2': {
        const started = depsRef.current.beginDiscoverFlow('chaos-dice', { sourceLabel: card.name });
        banner = started ? '混沌骰运：发现 1 张专属（三选一）。' : '混沌骰运想要发现卡牌，但卡组已耗尽。';
        break;
      }
      case 'chaos-3': {
        if (backpackItems.length >= depsRef.current.backpackCapacity) {
          banner = '背包已满，混沌商店无法开启。';
          break;
        }
        const offerings = depsRef.current.generateShopOfferings();
        if (!offerings.length) {
          banner = '混沌商店空无一物。';
          break;
        }
        setShopOfferings(offerings);
        setShopSourceEvent(card);
        setShopDeleteUsed(false);
        setShopHealUsed(false);
        setShopLevelUpUsed(false);
        setShopSkillDiscoverUsed(false);
        setDeleteModalOpen(false);
        setShopModalOpen(true);
        setShopModalMinimized(false);
        banner = '混沌骰运开启了一家临时商店！';
        break;
      }
      case 'chaos-4': {
        const monsters = flattenActiveRowSlots(activeCards).filter(
          (entry): entry is GameCardData => isDamageableTarget(entry),
        );
        if (!monsters.length) {
          banner = '没有怪物可以承受混沌雷击。';
          break;
        }
        const target = monsters[getRandomInt(0, monsters.length - 1)];
        if (!depsRef.current.isMonsterEngaged(target.id)) {
          depsRef.current.beginCombat(target, 'hero');
        }
        const burstDamage = getSpellDamage(3);
        depsRef.current.dealDamageToMonster(target, burstDamage, { pulses: 2, isSpellDamage: true });
        depsRef.current.dealDamageToMonster(target, burstDamage, {
          pulses: 2,
          animationDelay: Math.floor(COMBAT_ANIMATION_STAGGER / 2),
          isSpellDamage: true,
        });
        banner = `${target.name} 被混沌雷击连续打中，累计受到 ${burstDamage * 2} 点伤害！`;
        break;
      }
      case 'chaos-5': {
        const success = await depsRef.current.requestCardAction('discard-recycle', 2, {
          title: '混沌骰运：弃回 2 抽 2',
          description: '选择 2 张牌弃回（可来自手牌、装备栏或护符栏）。',
        });
        if (!success) {
          banner = '没有足够的牌可供弃回，混沌骰运安静下来。';
          break;
        }
        const drawnNames: string[] = [];
        for (let i = 0; i < 2; i += 1) {
          const [drawnCard] = depsRef.current.takeRandomCardsFromBackpack(1);
          if (!drawnCard) break;
          depsRef.current.queueCardIntoHand(drawnCard);
          drawnNames.push(drawnCard.name);
        }
        banner = drawnNames.length > 0
          ? `你弃回了 2 张牌，从背包抽到了「${drawnNames.join('」「')}」。`
          : '你弃回了 2 张牌，但背包为空，未能抽牌。';
        break;
      }
      default:
        break;
    }

    finalizeMagicCard(card, { banner });
  };

  // ---------------------------------------------------------------------------
  // resolveStunWave — transformation: 60% stun each active-row monster
  // ---------------------------------------------------------------------------

  const resolveStunWave = async (card: GameCardData) => {
    depsRef.current.clearUndoStack();

    const monsters = flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster' && !c.isStunned);
    if (monsters.length === 0) {
      finalizeMagicCard(card, { banner: `震慑领域：击晕上限 +10%（当前 ${Math.min(100, stunCap + 10)}%）。没有可击晕的怪物。` });
      return;
    }

    const currentStunCap = engine.getState().stunCap;
    const stunPct = Math.min(60 + (depsRef.current.amuletEffects?.stunRateBoost ?? 0), currentStunCap);
    const threshold = Math.round((stunPct / 100) * 20);
    const stunResults: string[] = [];

    for (const monster of monsters) {
      const stunResult = await depsRef.current.requestDiceOutcome({
        title: monster.name,
        subtitle: `震慑领域击晕判定（${stunPct}%）`,
        entries: [
          { id: 'stun', range: [1, threshold] as [number, number], label: '击晕成功！', effect: 'none' },
          { id: 'miss', range: [threshold + 1, 20] as [number, number], label: '未击晕', effect: 'none' },
        ],
      });
      if (stunResult?.id === 'stun') {
        depsRef.current.updateMonsterCard(monster.id, m => ({ ...m, isStunned: true }));
        depsRef.current.addGameLog('combat', `${monster.name} 被震慑领域击晕了！`);
        stunResults.push(`${monster.name} 击晕`);

        if (depsRef.current.amuletEffects.hasStunUpgradeCap) {
          setStunCap(prev => {
            const next = Math.min(100, prev + 5);
            depsRef.current.addGameLog('amulet', `震慑之符：击晕成功，击晕上限 +5%（当前 ${next}%）`);
            return next;
          });
        }
      } else {
        stunResults.push(`${monster.name} 未击晕`);
      }
    }

    finalizeMagicCard(card, {
      banner: `震慑领域：击晕上限 +10%。${stunResults.join('，')}。`,
    });
  };

  // ---------------------------------------------------------------------------
  // handleSkillCard  (~1,058 lines)
  // ---------------------------------------------------------------------------

  async function handleSkillCard(card: GameCardData) {
    if (!depsRef.current.stagingCardsRef.current.some(c => c.id === card.id)) {
      depsRef.current.stagingCardsRef.current = [...depsRef.current.stagingCardsRef.current, card];
    }
    const handCards = [...depsRef.current.handCardsRef.current];
    const knightCard = card as KnightCardData;
    
    if (card.isCurse && knightCard.knightEffect === 'greed-curse') {
      setGold(prev => Math.max(0, prev - 3));
      finalizeMagicCard(card, { banner: '贪婪诅咒消耗了 3 金币。' });
      return;
    }
    if (card.isCurse) {
      depsRef.current.applyDamage(3, 'general', { selfInflicted: true });
      finalizeMagicCard(card, { banner: '血咒吸取了 3 点生命。' });
      return;
    }

    if (card.type === 'magic') {
      setMagicCardsPlayedThisTurn(prev => prev + 1);
    }

    const isEchoTriggered = doubleNextMagic && card.type === 'magic' && card.magicEffect !== 'double-next-magic';
    if (isEchoTriggered) {
      setDoubleNextMagic(false);
      depsRef.current.addGameLog('magic', `法术回响：${card.name} 的效果将触发两次！`);
      setHeroSkillBanner(`法术回响！${card.name} 效果触发两次！`);
    }
    const echoMultiplier = isEchoTriggered ? 2 : 1;

    if (card.magicEffect === 'active-row-monster-attack-debuff') {
      const reduction = 2 * echoMultiplier;
      let modified = 0;
      setActiveCards(prev => {
        return prev.map(c => {
          if (c?.type === 'monster') {
            modified++;
            const newAttack = Math.max(0, (c.attack ?? c.value) - reduction);
            return { ...c, attack: newAttack, value: newAttack };
          }
          return c;
        }) as typeof prev;
      });
      depsRef.current.addGameLog('magic', `威压之令：激活行 ${modified} 个怪物攻击力 -${reduction}`);
      finalizeMagicCard(card, { banner: `威压之令！激活行怪物攻击力 -${reduction}！` });
      return;
    }

    if (card.magicEffect === 'honor-blood') {
      depsRef.current.applyDamage(1, 'general', { selfInflicted: true });
      const repairableSlots = depsRef.current.getEquipmentSlots().filter(slot => {
        if (!slot.item) return false;
        const maxDurability = slot.item.maxDurability ?? slot.item.durability ?? 0;
        const currentDurability = slot.item.durability ?? maxDurability;
        return maxDurability > 0 && currentDurability < maxDurability;
      });
      if (repairableSlots.length === 0) {
        finalizeMagicCard(card, { banner: '战血之印：失去 1 点生命；没有可恢复耐久的装备。' });
        return;
      }
      if (repairableSlots.length === 1) {
        const repairAmount = 1 * echoMultiplier;
        const slot = repairableSlots[0];
        const slotItem = slot.item!;
        const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
        const currentDurability = slotItem.durability ?? maxDurability;
        depsRef.current.setEquipmentSlotById(slot.id, {
          ...slotItem,
          durability: Math.min(maxDurability, currentDurability + repairAmount),
        });
        finalizeMagicCard(card, {
          banner: `战血之印：失去 1 点生命，${slotItem.name} 恢复 ${repairAmount} 点耐久。${isEchoTriggered ? '（回响×2）' : ''}`,
        });
        return;
      }
      setPendingMagicAction({
        card,
        effect: 'repair-one',
        step: 'slot-select',
        prompt: `战血之印：选择一件装备恢复 ${1 * echoMultiplier} 点耐久。`,
        echoMultiplier,
      });
      setHeroSkillBanner(
        `战血之印失去 1 点生命，请选择一件装备恢复 ${1 * echoMultiplier} 点耐久。${isEchoTriggered ? '（回响×2）' : ''}`,
      );
      return;
    }

     if (card.type === 'hero-magic') {
       handleHeroMagicCard(card);
       return;
     }
    
    if (card.magicType === 'instant') {
      if (handleKnightInstantMagic(knightCard)) {
        return;
      }
      switch (card.name) {
        case '瀑流重置': {
          depsRef.current.cascadeResetWaterfallRef.current = true;
          const activeRowCards = flattenActiveRowSlots(activeCards).filter(c => c.id !== card.id);
          if (activeRowCards.length > 0) {
            setActiveCards(createEmptyActiveRow());
            setRemainingDeck(prev => [...prev, ...activeRowCards]);
            depsRef.current.queueWaterfallTimeout(() => {
              depsRef.current.triggerWaterfall();
            }, 50);
          } else {
            depsRef.current.triggerWaterfall();
          }
          finalizeMagicCard(card, { banner: '瀑流重置：当前波次已置于牌堆底。' });
          return;
        }
        case '风暴箭雨': {
          const monsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
          if (monsters.length === 0) {
            finalizeMagicCard(card, { banner: '风暴箭雨无效（没有怪物）。' });
            return;
          }
          const volleyDamage = getSpellDamage(3 + (card.amplifyBonus ?? 0)) * echoMultiplier;
          monsters.forEach((monster, index) => {
            if (!depsRef.current.isMonsterEngaged(monster.id)) {
              depsRef.current.beginCombat(monster, 'hero');
            }
            const animationDelay = index * Math.floor(COMBAT_ANIMATION_STAGGER * 0.75);
            depsRef.current.dealDamageToMonster(monster, volleyDamage, { animationDelay, pulses: 2, isSpellDamage: true });
          });
          if (monsters.length >= 3) {
            const flippedCard: GameCardData = {
              id: `${card.id}-flip-storm-volley`,
              type: 'magic',
              name: '箭雨余韵',
              value: 0,
              image: skillScrollImage,
              magicType: 'permanent',
              magicEffect: 'storm-volley-recycle',
              description: '对激活行所有怪物造成 1 点伤害，每击中一个怪物，从回收袋随机抽 1 张牌加入手牌。',
            };
            depsRef.current.addGameLog('magic', `风暴箭雨命中 ${monsters.length} 只怪物，翻转为「箭雨余韵」！`);
            depsRef.current.removePendingDungeonCard(card.id);
            depsRef.current.removeCard(card.id, false);
            setPendingMagicAction(null);
            await depsRef.current.triggerEventTransform(card, flippedCard, '风暴箭雨翻转为「箭雨余韵」');
            depsRef.current.addCardToBackpack(flippedCard);
            setHeroSkillBanner(`风暴箭雨命中 ${monsters.length} 只怪物，对每只造成 ${volleyDamage} 点伤害！翻转为「箭雨余韵」！`);
            depsRef.current.stagingCardsRef.current =
              depsRef.current.stagingCardsRef.current.filter(c => c.id !== card.id);
            depsRef.current.drainPendingDiscardEffects();
            return;
          }
          finalizeMagicCard(card, { banner: `风暴箭雨对每只怪物造成 ${volleyDamage} 点伤害！${isEchoTriggered ? '（回响×2）' : ''}`, dealtDamage: true });
          return;
        }
        case '回响行囊': {
          const echoDiscard = 2 * echoMultiplier;
          const echoDiscover = 2 * echoMultiplier;
          const echoDraw = 2 * echoMultiplier;
          const wasPlayedFromHand = handCards.some(c => c.id === card.id);
          const actualHandCount = handCards.length - (wasPlayedFromHand ? 1 : 0);
          const discardCount = Math.min(echoDiscard, actualHandCount);
          const bannerParts: string[] = [];

          if (discardCount > 0) {
            if (actualHandCount <= echoDiscard) {
              const cardsToDiscard = handCards.filter(c => c.id !== card.id);
              const flights = cardsToDiscard.map(hc => ({
                card: hc,
                promise: depsRef.current.triggerDiscardFlight(hc, depsRef.current.isRecyclableFromHand(hc) ? 'recycle-bag' : 'graveyard'),
              }));
              const discardIds = new Set(cardsToDiscard.map(c => c.id));
              depsRef.current.handCardsRef.current = depsRef.current.handCardsRef.current.filter(c => !discardIds.has(c.id));
              setHandCards(depsRef.current.handCardsRef.current);
              await Promise.all(flights.map(f => f.promise));
              const sorted = [...flights].sort((a, b) => (a.card.onDiscardDraw ? 1 : 0) - (b.card.onDiscardDraw ? 1 : 0));
              sorted.forEach(f => depsRef.current.discardCardToGraveyard(f.card, { owner: 'player' }));
              bannerParts.push(`弃回了 ${cardsToDiscard.length} 张手牌。`);
            } else {
              const success = await depsRef.current.requestCardAction('discard-recycle', echoDiscard, {
                title: `回响行囊：弃回手牌${isEchoTriggered ? '（回响×2）' : ''}`,
                description: `选择 ${echoDiscard} 张手牌弃回。`,
                handOnly: true,
              });
              if (!success) {
                finalizeMagicCard(card, { banner: '回响行囊取消。' });
                return;
              }
              bannerParts.push(`弃回了 ${echoDiscard} 张手牌。`);
            }
          } else {
            bannerParts.push('没有手牌可弃。');
          }

          await new Promise<void>(r => { setTimeout(r, 0); });

          let discovered = 0;
          const selectedDiscoverIds = new Set<string>();
          depsRef.current.graveyardDiscoverDeliveryRef.current = 'hand-first';

          for (let di = 0; di < echoDiscover; di++) {
            const freshGraveyard = depsRef.current.discardedCardsRef.current;
            const available = freshGraveyard.filter(c => !selectedDiscoverIds.has(c.id));
            if (available.length === 0) break;

            const shuffled = [...available].sort(() => Math.random() - 0.5);
            const options = shuffled.slice(0, Math.min(3, shuffled.length));

            const selected = await new Promise<GameCardData | null>(resolve => {
              depsRef.current.graveyardDiscoverResolverRef.current = selectedCard => {
                resolve(selectedCard);
                depsRef.current.graveyardDiscoverResolverRef.current = null;
              };
              setGraveyardDiscoverState(options);
            });

            if (selected) {
              selectedDiscoverIds.add(selected.id);
              discovered++;
            } else {
              break;
            }
          }

          if (discovered > 0) {
            bannerParts.push(`从坟场发现了 ${discovered} 张牌。`);
          } else if (depsRef.current.discardedCardsRef.current.length === 0) {
            bannerParts.push('坟场为空。');
          }

          await new Promise<void>(r => { setTimeout(r, 0); });

          const drawnCards = depsRef.current.takeRandomCardsFromBackpack(echoDraw);
          drawnCards.forEach(c => depsRef.current.queueCardIntoHand(c));
          if (drawnCards.length > 0) {
            bannerParts.push(`从背包抽了 ${drawnCards.length} 张牌。`);
          } else {
            bannerParts.push('背包为空。');
          }

          if (isEchoTriggered) bannerParts.push('（回响×2）');
          finalizeMagicCard(card, { banner: bannerParts.join(' ') });
          return;
        }
        case '潮涌铸甲': {
          const choiceId = await depsRef.current.requestMagicChoice({
            title: '潮涌铸甲',
            subtitle: '选择获得一个永恒护符',
            options: [
              {
                id: 'waterfall-armor',
                label: '瀑流铸剑',
                description: '永恒护符：每次攻击时，该装备栏临时攻击 +2。（可叠加）',
              },
              {
                id: 'block-temp-armor',
                label: '格挡铸甲',
                description: '永恒护符：每次格挡时，该装备栏获得 2 点临时护甲。（可叠加）',
              },
            ],
          });
          if (choiceId === 'waterfall-armor') {
            const newStacks = bulwarkPassiveActive + 1;
            setBulwarkPassiveActive(newStacks);
            const relic = getEternalRelic('bulwark-attack');
            if (!hasEternalRelic(eternalRelics, 'bulwark-attack')) {
              setEternalRelics([...eternalRelics, relic]);
            }
            const stackLabel = newStacks > 1 ? `（×${newStacks}层）` : '';
            const tempGain = 2 * newStacks;
            depsRef.current.addGameLog('magic', `获得永恒护符·瀑流铸剑${stackLabel}：之后每次攻击，该装备栏临时攻击 +${tempGain}`);
            finalizeMagicCard(card, { banner: `获得永恒护符·瀑流铸剑${stackLabel}！每次攻击，该装备栏临时攻击 +${tempGain}。` });
          } else {
            const newStacks = bulwarkTempArmorStacks + 1;
            setBulwarkTempArmorStacks(newStacks);
            const relic = getEternalRelic('bulwark-armor');
            if (!hasEternalRelic(eternalRelics, 'bulwark-armor')) {
              setEternalRelics([...eternalRelics, relic]);
            }
            const stackLabel = newStacks > 1 ? `（×${newStacks}层）` : '';
            const tempGain = 2 * newStacks;
            depsRef.current.addGameLog('magic', `获得永恒护符·格挡铸甲${stackLabel}：之后每次攻击，该装备栏临时护甲 +${tempGain}`);
            finalizeMagicCard(card, { banner: `获得永恒护符·格挡铸甲${stackLabel}！每次格挡，该装备栏临时护甲 +${tempGain}。` });
          }
          return;
        }
        case '点金裁决': {
          const monsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
          if (monsters.length === 0) {
            finalizeMagicCard(card, { banner: '点金裁决无效（没有怪物）。' });
            return;
          }
          if (monsters.length === 1) {
            const totalDamage = getSpellDamage(gold + (card.amplifyBonus ?? 0)) * echoMultiplier;
            if (!depsRef.current.isMonsterEngaged(monsters[0].id)) depsRef.current.beginCombat(monsters[0], 'hero');
            depsRef.current.dealDamageToMonster(monsters[0], totalDamage, { pulses: 2, isSpellDamage: true });
            const healed = depsRef.current.healHero(totalDamage);
            const healText = healed > 0 ? `，恢复 ${healed} 点生命` : '';
            finalizeMagicCard(card, { banner: `点金裁决造成 ${totalDamage} 点伤害${healText}！${isEchoTriggered ? '（回响×2）' : ''}`, dealtDamage: true });
            return;
          }
          setPendingMagicAction({
            card,
            effect: 'blood-reckoning',
            step: 'monster-select',
            echoMultiplier,
            prompt: `选择一个怪物，造成 ${getSpellDamage(gold + (card.amplifyBonus ?? 0)) * echoMultiplier} 点伤害并恢复等量生命。${isEchoTriggered ? '（回响×2）' : ''}`,
          });
          setHeroSkillBanner('点金裁决就绪，请选择目标怪物。');
          return;
        }
        case '涌泉满手': {
          const handSizeExcludingSelf = handCards.filter(c => c.id !== card.id).length;
          const flightsCount = depsRef.current.backpackHandFlightsRef.current.length;
          const deficit = Math.max(0, depsRef.current.effectiveHandLimit - (handSizeExcludingSelf + flightsCount));
          const healed = depsRef.current.healHero(8);
          const healText = healed > 0 ? `恢复 ${healed} 点生命` : '生命已满';
          if (deficit <= 0 || engine.getState().backpackItems.length === 0) {
            depsRef.current.addGameLog('magic', `涌泉满手：${healText}，手牌已满或背包为空。`);
            finalizeMagicCard(card, { banner: `涌泉满手：${healText}，手牌已满或背包为空。` });
            return;
          }
          const drawCount = Math.min(deficit, engine.getState().backpackItems.length);
          const drawnCards = depsRef.current.takeRandomCardsFromBackpack(drawCount);
          drawnCards.forEach(c => depsRef.current.queueCardIntoHand(c));
          depsRef.current.addGameLog('magic', `涌泉满手：${healText}，从背包抽取 ${drawnCards.length} 张牌补充手牌。`);
          finalizeMagicCard(card, { banner: `涌泉满手：${healText}，从背包抽了 ${drawnCards.length} 张牌。` });
          return;
        }
        case '等价交换': {
          const swapEquipSlots = depsRef.current.getEquipmentSlots().filter(slot => {
            const item = slot.item;
            return item && (item.type === 'weapon' || item.type === 'shield') && (item.durability ?? 0) > 0;
          });
          if (swapEquipSlots.length === 0) {
            finalizeMagicCard(card, { banner: '等价交换无效（没有可用装备）。' });
            return;
          }
          const swapMonsters = flattenActiveRowSlots(activeCards).filter(
            c => c.type === 'monster' && !c.bossPhase && !c.isFinalMonster,
          );
          if (swapMonsters.length === 0) {
            finalizeMagicCard(card, { banner: '等价交换无效（没有可选的非Boss怪物）。' });
            return;
          }
          if (swapEquipSlots.length === 1) {
            const slot = swapEquipSlots[0];
            const slotItem = slot.item!;
            const durability = slotItem.durability ?? 0;
            if (swapMonsters.length === 1) {
              const target = swapMonsters[0];
              const oldLayers = target.currentLayer ?? 1;
              const newMaxDur = Math.max(slotItem.maxDurability ?? durability, oldLayers);
              depsRef.current.setEquipmentSlotById(slot.id, { ...slotItem, durability: oldLayers, maxDurability: newMaxDur });
              depsRef.current.updateMonsterCard(target.id, m => ({
                ...m,
                currentLayer: durability,
                hp: m.maxHp ?? m.hp ?? 0,
                fury: Math.max(m.fury ?? 0, durability),
                hpLayers: Math.max(m.hpLayers ?? 0, durability),
              }));
              finalizeMagicCard(card, {
                banner: `等价交换：${slotItem.name} 耐久 ${durability}→${oldLayers}，${target.name} 血层 ${oldLayers}→${durability}。`,
              });
              return;
            }
            setPendingMagicAction({
              card,
              effect: 'soul-swap',
              step: 'monster-select',
              slotId: slot.id,
              slotDurability: durability,
              prompt: `选择一个非Boss怪物，与 ${slotItem.name}（耐久 ${durability}）互换血层。`,
            });
            setHeroSkillBanner(`等价交换：选择一个怪物与 ${slotItem.name} 互换。`);
            return;
          }
          setPendingMagicAction({
            card,
            effect: 'soul-swap',
            step: 'slot-select',
            prompt: '选择一件装备进行等价交换。',
          });
          setHeroSkillBanner('等价交换：选择一件装备。');
          return;
        }
          
        case 'Sharpening Stone':
          setWeaponMasterBonus(prev => prev + 1);
          depsRef.current.addGameLog('skill', '磨刀石：永久武器伤害 +1');
          break;
        case 'Dual Strike':
          depsRef.current.addGameLog('skill', '双重打击：下次攻击双倍');
          break;
        case 'Weapon Surge':
          setNextWeaponBonus(prev => prev + 3);
          depsRef.current.addGameLog('skill', '武器强化：下次武器伤害 +3');
          break;
        case 'Battle Ready': {
          const weaponCards = classDeck.filter(c => c.type === 'weapon');
          if (weaponCards.length > 0) {
            const weapon = weaponCards[Math.floor(Math.random() * weaponCards.length)];
            setClassCardsInHand(prev => [...prev, weapon as KnightCardData]);
            setClassDeck(prev => prev.filter(c => c.id !== weapon.id));
            depsRef.current.addGameLog('skill', `战备就绪：从职业牌组抽取武器「${weapon.name}」`);
          } else {
            depsRef.current.addGameLog('skill', '战备就绪：职业牌组没有武器');
          }
          break;
        }
          
        case 'Shield Wall':
          setNextShieldBonus(prev => prev + 2);
          setShieldMasterBonus(prev => prev + 2);
          depsRef.current.addGameLog('skill', '盾墙：下次护盾 +2，永久护盾 +2');
          break;
        case 'Defensive Stance':
          setDefensiveStanceActive(true);
          depsRef.current.addGameLog('skill', '防御姿态：激活');
          break;
        case 'Iron Defense':
          setTempShield(prev => prev + 5);
          depsRef.current.addGameLog('skill', '铁壁防御：临时护盾 +5');
          break;
          
        case 'Blood Sacrifice':
          if (hp > 3) {
            depsRef.current.applyDamage(3, 'general', { selfInflicted: true });
            setNextWeaponBonus(prev => prev + 3);
            depsRef.current.addGameLog('skill', '鲜血献祭：失去 3 点生命，下次武器伤害 +3');
          }
          break;
        case 'Vampiric Strike':
          setVampiricNextAttack(true);
          depsRef.current.addGameLog('skill', '吸血打击：下次攻击吸取生命');
          break;
        case 'Blood for Power':
          if (hp > 5) {
            depsRef.current.applyDamage(5, 'general', { selfInflicted: true });
            setGold(prev => prev + 10);
            depsRef.current.addGameLog('skill', '以血换力：失去 5 点生命，获得 10 金币');
          }
          break;
        case 'Crimson Shield':
          if (hp > 2) {
            depsRef.current.applyDamage(2, 'general', { selfInflicted: true });
            setTempShield(prev => prev + 6);
            depsRef.current.addGameLog('skill', '血色之盾：失去 2 点生命，临时护盾 +6');
          }
          break;
        case 'Life Transfer':
          if (hp > 3) {
            depsRef.current.applyDamage(3, 'general', { selfInflicted: true });
            setNextWeaponBonus(prev => prev + 3);
            depsRef.current.addGameLog('skill', '生命转移：失去 3 点生命，下次武器伤害 +3');
          }
          break;
          
        case 'Reinforced Equipment':
          setUnbreakableNext(true);
          depsRef.current.addGameLog('skill', '强化装备：下次使用装备不消耗耐久');
          break;
        case 'Repair Kit':
          depsRef.current.addGameLog('skill', '修理套件');
          break;
        case 'Spare Weapons':
          depsRef.current.addGameLog('skill', '备用武器');
          break;
        case 'Emergency Repair': {
          const slots = depsRef.current.getEquipmentSlots();
          slots.forEach(slot => {
            if (slot.item && slot.item.durability) {
              const repaired = { ...slot.item, durability: Math.min(slot.item.maxDurability || 3, slot.item.durability + 2) };
              depsRef.current.setEquipmentSlotById(slot.id, repaired);
            }
          });
          depsRef.current.addGameLog('skill', '紧急修复：所有装备耐久 +2');
          break;
        }
        case 'Salvage':
          depsRef.current.addGameLog('skill', '废物利用');
          break;
        case 'Field Maintenance': {
          const allSlots = depsRef.current.getEquipmentSlots();
          allSlots.forEach(slot => {
            if (slot.item && slot.item.durability) {
              const maintained = { ...slot.item, durability: slot.item.durability + 1, maxDurability: (slot.item.maxDurability || slot.item.durability) + 1 };
              depsRef.current.setEquipmentSlotById(slot.id, maintained);
            }
          });
          depsRef.current.addGameLog('skill', '野战维护：所有装备耐久 +1 且上限 +1');
          break;
        }
        case '余烬回响': {
          setPermanentSpellDamageBonus(prev => prev + echoMultiplier);
          const emberParts: string[] = [];
          emberParts.push(`法术伤害永久 +${echoMultiplier}。`);
          for (let i = 0; i < echoMultiplier; i++) {
            const drawn = depsRef.current.drawFromBackpackToHand();
            if (drawn) emberParts.push(`抽了 1 张牌（${drawn.name}）。`);
          }
          if (isEchoTriggered) emberParts.push('（回响×2）');
          finalizeMagicCard(card, { banner: emberParts.join(' ') });
          return;
        }
        case '秘法精炼': {
          depsRef.current.openHandMagicUpgradeModal(card.id);
          finalizeMagicCard(card, { banner: '秘法精炼：选择至多 2 张魔法牌进行升级。' });
          return;
        }
        case '专属召唤': {
          const wasPlayedFromHand = handCards.some(c => c.id === card.id);
          const actualHandCount = handCards.length - (wasPlayedFromHand ? 1 : 0);
          if (actualHandCount < 2) {
            finalizeMagicCard(card, { banner: '手牌不足 2 张，无法使用。' });
            return;
          }
          void depsRef.current.requestCardAction('discard-recycle', 2, {
            title: '专属召唤：弃回 2 张牌',
            description: '弃回 2 张牌，获得一张职业专属卡。',
            handOnly: true,
          }).then(success => {
            if (!success) {
              finalizeMagicCard(card, { banner: '取消了专属召唤。' });
              return;
            }
            const classDrawn = depsRef.current.drawClassCardsToBackpack(1, '专属召唤');
            if (classDrawn.length > 0) {
              depsRef.current.triggerClassDeckFlight(classDrawn);
              depsRef.current.addGameLog('magic', `专属召唤：获得职业卡「${classDrawn[0].name}」`);
              finalizeMagicCard(card, { banner: `获得职业卡「${classDrawn[0].name}」！` });
            } else {
              finalizeMagicCard(card, { banner: '职业牌堆已空。' });
            }
          });
          return;
        }
        case '升级卷轴': {
          setUpgradeModalOpen(true);
          finalizeMagicCard(card, { banner: '升级卷轴：选择一张牌进行升级。' });
          return;
        }
        case '万象探知': {
          const deck = engine.getState().remainingDeck;
          const peekCount = 5 * echoMultiplier;
          const peekedCards = deck.slice(0, Math.min(peekCount, deck.length));

          let monsterCount = 0;
          let equipCount = 0;
          let magicCount = 0;
          let amuletCount = 0;
          let potionCount = 0;
          for (const c of peekedCards) {
            if (c.type === 'monster') monsterCount++;
            else if (c.type === 'weapon' || c.type === 'shield') equipCount++;
            else if (c.type === 'magic') magicCount++;
            else if (c.type === 'amulet') amuletCount++;
            else if (c.type === 'potion') potionCount++;
          }

          const gains: { label: string; count: number }[] = [];
          const slotIds: Array<'equipmentSlot1' | 'equipmentSlot2'> = ['equipmentSlot1', 'equipmentSlot2'];
          const bannerParts: string[] = [];

          for (let i = 0; i < monsterCount; i++) {
            const slot = slotIds[Math.floor(Math.random() * slotIds.length)];
            depsRef.current.setEquipmentSlotBonus(slot, 'damage', cur => cur + 1);
          }
          if (monsterCount > 0) {
            gains.push({ label: '随机装备栏永久攻击力 +1', count: monsterCount });
            bannerParts.push(`攻击+${monsterCount}`);
          }

          for (let i = 0; i < equipCount; i++) {
            const slot = slotIds[Math.floor(Math.random() * slotIds.length)];
            depsRef.current.setEquipmentSlotBonus(slot, 'shield', cur => cur + 1);
          }
          if (equipCount > 0) {
            gains.push({ label: '随机装备栏永久护甲 +1', count: equipCount });
            bannerParts.push(`护甲+${equipCount}`);
          }

          if (magicCount > 0) {
            setPermanentSpellDamageBonus(prev => prev + magicCount);
            gains.push({ label: '永久法术伤害 +1', count: magicCount });
            bannerParts.push(`法伤+${magicCount}`);
          }

          if (amuletCount > 0) {
            setPermanentSpellLifesteal(prev => prev + amuletCount);
            gains.push({ label: '超杀吸血 +1', count: amuletCount });
            bannerParts.push(`吸血+${amuletCount}`);
          }

          if (potionCount > 0) {
            setStunCap(prev => Math.min(100, prev + potionCount * 5));
            gains.push({ label: '击晕上限 +5%', count: potionCount });
            bannerParts.push(`击晕+${potionCount * 5}%`);
          }

          depsRef.current.setDeckPeekState({
            mode: 'dungeon-insight',
            peekedCards,
            gains,
          });

          await new Promise<void>(resolve => {
            depsRef.current.deckJudgePeekCloseRef.current = () => resolve();
          });

          const banner = peekedCards.length > 0
            ? `万象探知翻看 ${peekedCards.length} 张牌：${bannerParts.length > 0 ? bannerParts.join('，') : '无增益'}。${isEchoTriggered ? '（回响×2）' : ''}`
            : '万象探知：主牌堆已空，无效果。';
          finalizeMagicCard(card, { banner });
          return;
        }

        case '天机铸炼': {
          const equipSlots = depsRef.current.getEquipmentSlots().filter(slot => {
            const item = slot.item;
            return item && (item.type === 'weapon' || item.type === 'shield' || item.type === 'monster');
          });
          if (equipSlots.length === 0) {
            finalizeMagicCard(card, { banner: '天机铸炼无效（没有可选的装备）。' });
            return;
          }
          setPendingMagicAction({
            card,
            effect: 'event-fortify',
            step: 'slot-select',
            prompt: '天机铸炼：选择一件装备，翻看牌堆顶 3 张牌。',
          });
          setHeroSkillBanner('天机铸炼：选择一件装备。');
          return;
        }
        case '治愈术': {
          const healAmounts = [5, 3, 5];
          const healAmt = healAmounts[card.upgradeLevel ?? 0] ?? 5;
          const healed = depsRef.current.healHero(healAmt);
          finalizeMagicCard(card, { banner: healed > 0 ? `治愈术：回复 ${healed} 点生命。` : '生命值已满。' });
          return;
        }
        case '永恒铭刻': {
          const eligible = handCards.filter(c => c.id !== card.id && !cardHasPermFlag(c));
          if (eligible.length === 0) {
            depsRef.current.addGameLog('magic', '永恒铭刻：手牌中没有可赋予永恒属性的卡牌。');
            finalizeMagicCard(card, { banner: '手牌中没有可赋予永恒属性的卡牌。' });
            return;
          }
          if (eligible.length === 1) {
            const target = eligible[0];
            setHandCards(prev => prev.map(c => c.id === target.id ? { ...c, recycleDelay: 2 } : c));
            depsRef.current.addGameLog('magic', `永恒铭刻：「${target.name}」获得 Perm 2 属性！`);
            finalizeMagicCard(card, { banner: `「${target.name}」获得 Perm 2！被移除后将经 2 次瀑流返回背包。` });
            return;
          }
          setPermGrantModal({ sourceCardId: card.id, sourceType: 'magic' });
          return;
        }
      }
      
      if (knightCard.classCard) {
        depsRef.current.consumeClassCardFromHand(card.id);
      }
      
      depsRef.current.addToGraveyard(card);
      depsRef.current.removePendingDungeonCard(card.id);
      depsRef.current.removeCard(card.id, false);
      depsRef.current.stagingCardsRef.current =
        depsRef.current.stagingCardsRef.current.filter(c => c.id !== card.id);
      depsRef.current.drainPendingDiscardEffects();
    } else if (card.magicType === 'permanent') {
      if (knightCard.knightEffect === 'recall-equipment') {
        const recallAmulets = engine.getState().amuletSlots;
        const hasAnySlotItem = equipmentSlot1 || equipmentSlot2 || recallAmulets.length > 0;
        if (!hasAnySlotItem) {
          setHeroSkillBanner('没有可回手的装备或护符。');
          return;
        }
        if (knightCard.classCard) {
          depsRef.current.consumeClassCardFromHand(card.id);
        }
        const hpCost = 2;
        depsRef.current.applyDamage(hpCost, 'general', { selfInflicted: true });
        const result = await performReturnToHand();
        if (result.success) {
          const drawn = drawCardsFromBackpack(1);
          const drawMsg = drawn > 0 ? `，抽了 ${drawn} 张牌` : '';
          depsRef.current.addGameLog('magic', `紧急回收：失去 ${hpCost} HP，${result.itemName} 从${result.slotLabel}回到手牌${drawMsg}`);
          finalizeMagicCard(card, { banner: `紧急回收：失去 ${hpCost} HP，${result.itemName} 已回到手牌${drawMsg}！` });
        } else {
          const drawn = drawCardsFromBackpack(1);
          const drawMsg = drawn > 0 ? `，抽了 ${drawn} 张牌` : '';
          finalizeMagicCard(card, { banner: `紧急回收：失去 ${hpCost} HP，回手取消${drawMsg}。` });
        }
        return;
      }
      if (handleKnightPermanentMagic(knightCard, echoMultiplier)) {
        return;
      }
      if (card.magicEffect === 'swap-backpack-recycle') {
        const nextBackpack = permanentMagicRecycleBag.map(c => sanitizeCardMetadata(c));
        const nextRecycle = backpackItems.map(c => sanitizeCardMetadata(c));
        setBackpackItems(nextBackpack);
        setPermanentMagicRecycleBag(nextRecycle);
        depsRef.current.enforceBackpackCapacity();
        depsRef.current.addGameLog(
          'magic',
          `虚空置换：背包与回收袋对换（背包现 ${nextBackpack.length} 张，回收袋现 ${nextRecycle.length} 张）。`,
        );
        finalizeMagicCard(card, { banner: '虚空置换：背包与永久魔法回收袋内容已对换。' });
        return;
      }
      if (card.magicEffect === 'guild-hand-recycle') {
        const otherHandCards = handCards.filter(c => c.id !== card.id);
        const movedCount = otherHandCards.length;
        for (const hc of otherHandCards) {
          depsRef.current.discardCardToGraveyard(hc, { owner: 'player', forceRecycleBag: true });
        }
        setHandCards(prev => prev.filter(c => c.id === card.id));
        const pool = [
          ...permanentMagicRecycleBag,
          ...otherHandCards.map(c => sanitizeCardMetadata(c)),
        ];
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        const toDraw = shuffled.slice(0, Math.min(2, shuffled.length));
        if (toDraw.length > 0) {
          const drawnIds = new Set(toDraw.map(c => c.id));
          setPermanentMagicRecycleBag(prev => prev.filter(c => !drawnIds.has(c.id)));
          for (const d of toDraw) depsRef.current.queueCardIntoHand(d);
        }
        depsRef.current.addGameLog('magic', `奇术轮转：${movedCount} 张手牌移入回收袋，取回 ${toDraw.length} 张。`);
        finalizeMagicCard(card, { banner: `奇术轮转：${movedCount} 张手牌洗入回收袋，取回 ${toDraw.length} 张！` });
        return;
      }
      if (card.magicEffect === 'crypt-deathwish') {
        const slots = depsRef.current.getEquipmentSlots().filter(s => s.item);
        if (slots.length === 0) {
          finalizeMagicCard(card, { banner: '墓语遗愿无效（没有已装备的装备）。' });
          return;
        }
        let chosenSlot: EquipmentSlotId;
        if (slots.length === 1) {
          chosenSlot = slots[0].id;
        } else {
          const selected = await depsRef.current.requestEquipmentSelection({
            prompt: '选择一个装备，触发其遗言效果',
            subtext: '不会破坏装备，仅触发遗言效果并抽 1 张牌。',
          });
          if (!selected) {
            finalizeMagicCard(card, { banner: '取消了墓语遗愿。' });
            return;
          }
          chosenSlot = selected;
        }
        const slotItem = chosenSlot === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          finalizeMagicCard(card, { banner: '墓语遗愿：目标装备已不存在。' });
          return;
        }
        const parts: string[] = [];
        if (slotItem.onDestroyHeal) {
          depsRef.current.healHero(slotItem.onDestroyHeal);
          parts.push(`恢复 ${slotItem.onDestroyHeal} HP`);
        }
        if (slotItem.onDestroyGold) {
          setGold(prev => prev + slotItem.onDestroyGold!);
          parts.push(`获得 ${slotItem.onDestroyGold} 金币`);
        }
        if (slotItem.onDestroyDraw) {
          for (let di = 0; di < slotItem.onDestroyDraw; di++) depsRef.current.drawFromBackpackToHand();
          parts.push(`抽 ${slotItem.onDestroyDraw} 张牌`);
        }
        if (slotItem.onDestroyClassDraw) {
          const classDrawn = depsRef.current.drawClassCardsToBackpack(slotItem.onDestroyClassDraw, `${slotItem.name}-墓语遗愿`);
          if (classDrawn.length > 0) {
            depsRef.current.triggerClassDeckFlight(classDrawn);
            parts.push(`获得专属卡「${classDrawn.map(c => c.name).join('、')}」`);
          }
        }
        if (slotItem.onDestroyPermanentDamage) {
          depsRef.current.setEquipmentSlotBonus(chosenSlot, 'damage', cur => cur + slotItem.onDestroyPermanentDamage!);
          parts.push(`装备栏永久伤害 +${slotItem.onDestroyPermanentDamage}`);
        }
        if (slotItem.onDestroyPermanentShield) {
          depsRef.current.setEquipmentSlotBonus(chosenSlot, 'shield', cur => cur + slotItem.onDestroyPermanentShield!);
          parts.push(`装备栏永久护甲 +${slotItem.onDestroyPermanentShield}`);
        }
        if (slotItem.onDestroyEffect) {
          if (slotItem.onDestroyEffect === 'slot-temp-buff-3-3') {
            setSlotTempAttack(prev => ({ ...prev, [chosenSlot]: (prev[chosenSlot] ?? 0) + 3 }));
            setSlotTempArmor(prev => ({ ...prev, [chosenSlot]: (prev[chosenSlot] ?? 0) + 3 }));
            parts.push('该装备栏 +3临时攻击 +3临时护甲');
          } else {
            parts.push(slotItem.onDestroyEffect);
          }
        }
        depsRef.current.drawFromBackpackToHand();
        parts.push('抽 1 张牌');
        const effectSummary = parts.length > 0 ? parts.join('，') : '无遗言效果';
        depsRef.current.addGameLog('magic', `墓语遗愿：触发「${slotItem.name}」遗言 → ${effectSummary}`);
        finalizeMagicCard(card, { banner: `墓语遗愿：「${slotItem.name}」遗言触发！${effectSummary}` });
        return;
      }
      if (card.magicEffect === 'guild-recycle-reshuffle') {
        const recycled = permanentMagicRecycleBag;
        if (recycled.length > 0) {
          const readyCards: GameCardData[] = [];
          const waitingCards: GameCardData[] = [];
          for (const c of recycled) {
            const waits = ((c as GameCardData & { _recycleWaits?: number })._recycleWaits ?? 1) - 1;
            if (waits <= 0) {
              const { _recycleWaits, ...clean } = c as GameCardData & { _recycleWaits?: number };
              readyCards.push(clean as GameCardData);
            } else {
              waitingCards.push({ ...c, _recycleWaits: waits } as GameCardData);
            }
          }
          const st = engine.getState();
          const cap = Math.max(1, BASE_BACKPACK_CAPACITY + st.backpackCapacityModifier);
          const currentBp = st.backpackItems;
          const available = cap - currentBp.length;
          const toAdd = readyCards.slice(0, Math.max(0, available));
          const overflow = readyCards.slice(Math.max(0, available));
          if (toAdd.length > 0) {
            setBackpackItems(prev => [...toAdd, ...prev]);
          }
          setPermanentMagicRecycleBag([...overflow, ...waitingCards]);
          const parts: string[] = [];
          if (toAdd.length > 0) parts.push(`回收袋 ${toAdd.length} 张牌洗回背包`);
          if (waitingCards.length > 0) parts.push(`${waitingCards.length} 张牌剩余瀑流 -1`);
          if (overflow.length > 0) parts.push(`${overflow.length} 张因容量不足留在回收袋`);
          depsRef.current.addGameLog('magic', `回收轮转：${parts.join('，')}`);
        } else {
          depsRef.current.addGameLog('magic', '回收轮转：回收袋为空');
        }
        depsRef.current.drawFromBackpackToHand();
        const banner = recycled.length > 0
          ? `回收轮转：回收袋洗回背包，抽 1 张牌！`
          : '回收轮转：回收袋为空，抽 1 张牌。';
        finalizeMagicCard(card, { banner });
        return;
      }
      if (card.name === '哥布林的戏法') {
        const otherHandCards = handCards.filter(c => c.id !== card.id);
        const count = otherHandCards.length;
        if (count === 0) {
          finalizeMagicCard(card, { banner: '手中没有其他牌可以刷新。' });
          return;
        }
        for (const hc of otherHandCards) {
          depsRef.current.discardCardToGraveyard(hc, { owner: 'player', forceRecycleBag: true });
        }
        setHandCards(prev => prev.filter(c => c.id === card.id));
        const drawn: GameCardData[] = [];
        for (let i = 0; i < count; i++) {
          const [d] = depsRef.current.takeRandomCardsFromBackpack(1);
          if (d) drawn.push(d);
        }
        if (drawn.length > 0) {
          for (const d of drawn) depsRef.current.queueCardIntoHand(d);
        }
        depsRef.current.addGameLog('magic', `哥布林的戏法：${count} 张手牌洗入回收袋，抽了 ${drawn.length} 张新牌。`);
        finalizeMagicCard(card, { banner: `哥布林的戏法：刷新了 ${count} 张手牌！` });
        return;
      }
      if (card.name === '混沌冲击') {
        const chaosMons = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
        if (chaosMons.length === 0) {
          finalizeMagicCard(card, { banner: '混沌冲击无效（没有怪物）。' });
          return;
        }
        const chaosBase = 3 + (card.amplifyBonus ?? 0);
        if (chaosMons.length === 1 && echoMultiplier <= 1) {
          const target = chaosMons[0];
          if (!depsRef.current.isMonsterEngaged(target.id)) depsRef.current.beginCombat(target, 'hero');
          const chaosDamage = getSpellDamage(chaosBase);
          const overkill = chaosStrikeHasOverkill(target, chaosDamage);
          depsRef.current.dealDamageToMonster(target, chaosDamage, { isSpellDamage: true });
          if (overkill) {
            const drawn = drawCardsFromBackpack(2, { ignoreLimit: true });
            finalizeMagicCard(card, { banner: `混沌冲击对 ${target.name} 造成 ${chaosDamage} 伤害，超杀！抽 ${drawn} 张牌。`, dealtDamage: true });
          } else {
            finalizeMagicCard(card, { banner: `混沌冲击对 ${target.name} 造成 ${chaosDamage} 点伤害。`, dealtDamage: true });
          }
        } else {
          const chaosDamage = getSpellDamage(chaosBase);
          const chaosEchoLabel = echoMultiplier > 1 ? `（回响：第 1/${echoMultiplier} 次）` : '';
          setPendingMagicAction({
            card,
            effect: 'chaos-strike',
            step: 'monster-select',
            prompt: `选择一个目标，对其造成 ${chaosDamage} 点伤害。超杀：抽 2 张牌。${chaosEchoLabel}`,
            data: {},
            echoRemaining: echoMultiplier,
          });
          setHeroSkillBanner(`选择一个目标，造成 ${chaosBase} 点伤害。超杀：抽 2 张牌。${chaosEchoLabel}`);
        }
        return;
      }
      if (card.name === '淬炼冲击') {
        const okMons = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
        if (okMons.length === 0) {
          finalizeMagicCard(card, { banner: '淬炼冲击无效（没有怪物）。' });
          return;
        }
        const okBase = 3 + (card.amplifyBonus ?? 0);
        if (okMons.length === 1 && echoMultiplier <= 1) {
          const target = okMons[0];
          if (!depsRef.current.isMonsterEngaged(target.id)) depsRef.current.beginCombat(target, 'hero');
          const okDamage = getSpellDamage(okBase);
          const overkill = chaosStrikeHasOverkill(target, okDamage);
          depsRef.current.dealDamageToMonster(target, okDamage, { isSpellDamage: true });
          if (overkill) {
            setUpgradeModalOpen(true);
            finalizeMagicCard(card, { banner: `淬炼冲击对 ${target.name} 造成 ${okDamage} 伤害，超杀！选择一张牌升级。`, dealtDamage: true });
          } else {
            finalizeMagicCard(card, { banner: `淬炼冲击对 ${target.name} 造成 ${okDamage} 点伤害。`, dealtDamage: true });
          }
        } else {
          const okDamage = getSpellDamage(okBase);
          const okEchoLabel = echoMultiplier > 1 ? `（回响：第 1/${echoMultiplier} 次）` : '';
          setPendingMagicAction({
            card,
            effect: 'overkill-upgrade',
            step: 'monster-select',
            prompt: `选择一个目标，对其造成 ${okDamage} 点伤害。超杀：升级一张牌。${okEchoLabel}`,
            data: {},
            echoRemaining: echoMultiplier,
          });
          setHeroSkillBanner(`选择一个目标，造成 3 点伤害。超杀：升级一张牌。${okEchoLabel}`);
        }
        return;
      }
      if (card.name === '秘典检索') {
        const bpMagics = backpackItems.filter(c => c.type === 'magic');
        if (bpMagics.length === 0) {
          finalizeMagicCard(card, { banner: '背包中没有魔法牌，秘典检索无效。' });
          return;
        }
        const shuffledBp = [...bpMagics].sort(() => Math.random() - 0.5);
        const discoverOptions = shuffledBp.slice(0, Math.min(3, shuffledBp.length));
        if (discoverOptions.length === 1) {
          const pick = discoverOptions[0];
          setBackpackItems(prev => prev.filter(c => c.id !== pick.id));
          depsRef.current.ensureCardInHand(pick);
          depsRef.current.addGameLog('magic', `秘典检索：从背包取出「${pick.name}」加入手牌。`);
          finalizeMagicCard(card, { banner: `从背包取出「${pick.name}」！` });
          return;
        }
        const selected = await new Promise<GameCardData | null>(resolve => {
          depsRef.current.graveyardDiscoverResolverRef.current = c => {
            resolve(c);
            depsRef.current.graveyardDiscoverResolverRef.current = null;
          };
          setGraveyardDiscoverState(discoverOptions);
        });
        if (selected) {
          setBackpackItems(prev => prev.filter(c => c.id !== selected.id));
          depsRef.current.ensureCardInHand(selected);
          depsRef.current.addGameLog('magic', `秘典检索：从背包取出「${selected.name}」加入手牌。`);
          finalizeMagicCard(card, { banner: `从背包取出「${selected.name}」！` });
        } else {
          finalizeMagicCard(card, { banner: '放弃了秘典检索。' });
        }
        return;
      }
      if (card.name === '维度扭曲') {
        const dungeonCards = flattenActiveRowSlots(activeCards);
        if (dungeonCards.length === 0) {
          finalizeMagicCard(card, { banner: '地城行没有卡牌。' });
          return;
        }
        setPendingMagicAction({
          card,
          effect: 'dungeon-preview-swap',
          step: 'dungeon-select',
          prompt: '选择地城行一张卡牌，与正上方预览行卡牌互换。',
        });
        setHeroSkillBanner('选择地城行一张卡牌，与正上方预览行卡牌互换。');
        return;
      }
      switch (getStarterBaseId(card.id)) {
        case STARTER_CARD_IDS.weaponBurst: {
          const burstBase = 2 + 2 * (card.upgradeLevel ?? 0);
          const burstAmount = burstBase * echoMultiplier;
          setPendingMagicAction({
            card,
            effect: 'weapon-burst',
            step: 'slot-select',
            prompt: `选择一个装备栏，临时攻击力 +${burstAmount}。`,
            echoMultiplier,
          });
          setHeroSkillBanner(`选择一个装备栏，临时攻击力 +${burstAmount}。`);
          return;
        }
        case STARTER_CARD_IDS.repairOne: {
          const repairUpgLvl = card.upgradeLevel ?? 0;
          const repairHpCosts = [2, 1, 1];
          const repairAmounts = [1, 2, 2];
          const repairHpCost = repairHpCosts[repairUpgLvl] ?? 1;
          const repairBaseAmt = repairAmounts[repairUpgLvl] ?? 2;
          const repairDrawCard = repairUpgLvl >= 2;

          if (repairHpCost > 0) {
            depsRef.current.applyDamage(repairHpCost, 'general', { selfInflicted: true });
          }

          const repairableSlots = depsRef.current.getEquipmentSlots().filter(slot => {
            if (!slot.item) {
              return false;
            }
            const maxDurability = slot.item.maxDurability ?? slot.item.durability ?? 0;
            const currentDurability = slot.item.durability ?? maxDurability;
            return maxDurability > 0 && currentDurability < maxDurability;
          });
          const hpCostBanner = repairHpCost > 0 ? `失去 ${repairHpCost} 点生命，` : '';
          if (repairableSlots.length === 0) {
            if (repairDrawCard) {
              const drawn = depsRef.current.drawFromBackpackToHand();
              const drawnMsg = drawn ? `抽到「${drawn.name}」` : '背包为空';
              finalizeMagicCard(card, { banner: `${hpCostBanner}所有装备满耐久。${drawnMsg}。` });
            } else {
              finalizeMagicCard(card, { banner: `${hpCostBanner}但所有装备都处于满耐久状态。` });
            }
            return;
          }
          if (repairableSlots.length === 1) {
            const repairAmount = repairBaseAmt * echoMultiplier;
            const slot = repairableSlots[0];
            const slotItem = slot.item!;
            const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
            const currentDurability = slotItem.durability ?? maxDurability;
            depsRef.current.setEquipmentSlotById(slot.id, {
              ...slotItem,
              durability: Math.min(maxDurability, currentDurability + repairAmount),
            });
            let drawMsg = '';
            if (repairDrawCard) {
              const drawn = depsRef.current.drawFromBackpackToHand();
              drawMsg = drawn ? `，抽到「${drawn.name}」` : '';
            }
            finalizeMagicCard(card, { banner: `${hpCostBanner}${slotItem.name} 恢复了 ${repairAmount} 点耐久${drawMsg}。${isEchoTriggered ? '（回响×2）' : ''}` });
            return;
          }
          setPendingMagicAction({
            card,
            effect: 'repair-one',
            step: 'slot-select',
            prompt: `${hpCostBanner}选择一件装备恢复 ${repairBaseAmt * echoMultiplier} 点耐久。`,
            echoMultiplier,
          });
          setHeroSkillBanner(`${hpCostBanner}选择一件装备恢复 ${repairBaseAmt * echoMultiplier} 点耐久。`);
          return;
        }
        case STARTER_CARD_IDS.discardDraw: {
          const ddUpgLvl = card.upgradeLevel ?? 0;
          const ddDiscards = [1, 2, 3];
          const ddDraws = [2, 3, 4];
          const discardCount = (ddDiscards[ddUpgLvl] ?? 1) * echoMultiplier;
          const drawCount = (ddDraws[ddUpgLvl] ?? 1) * echoMultiplier;
          const wasPlayedFromHand = handCards.some(c => c.id === card.id);
          const actualHandCount = handCards.length - (wasPlayedFromHand ? 1 : 0);
          const echoTag = isEchoTriggered ? '（回响×2）' : '';

          const finishTideDraws = () => {
            for (let di = 0; di < drawCount; di++) {
              const [drawnCard] = depsRef.current.takeRandomCardsFromBackpack(1);
              if (drawnCard) {
                depsRef.current.queueCardIntoHand(drawnCard);
              }
            }
          };

          if (actualHandCount === 0) {
            finishTideDraws();
            finalizeMagicCard(card, { banner: `没有手牌可弃。${echoTag}` });
            return;
          }

          if (actualHandCount <= discardCount) {
            const others = handCards.filter(c => c.id !== card.id);
            const victims = others.slice(0, Math.min(discardCount, others.length));
            const flights = victims.map(hc => ({
              card: hc,
              promise: depsRef.current.triggerDiscardFlight(hc, 'recycle-bag'),
            }));
            const victimIds = new Set(victims.map(v => v.id));
            depsRef.current.handCardsRef.current = depsRef.current.handCardsRef.current.filter(c => !victimIds.has(c.id) && c.id !== card.id);
            setHandCards(depsRef.current.handCardsRef.current);
            await Promise.all(flights.map(f => f.promise));
            flights.forEach(f => {
              depsRef.current.addPermanentMagicToRecycleBag(f.card);
              depsRef.current.applyDiscardSideEffects(f.card, 'player', { toRecycleBag: true });
            });
            finishTideDraws();
            finalizeMagicCard(card, {
              banner: `自动将 ${actualHandCount} 张手牌移到回收袋。${echoTag}`,
            });
            return;
          }

          void depsRef.current.requestCardAction('move-to', discardCount, {
            title: `汰旧迎新：选择 ${discardCount} 张手牌移到回收袋${echoTag}`,
            description: `选择 ${discardCount} 张手牌移到回收袋。`,
            handOnly: true,
            moveToDestination: 'recycle-bag',
          }).then(discardSuccess => {
            if (!discardSuccess) {
              finalizeMagicCard(card, { banner: '操作取消。' });
              return;
            }
            const drawnNames: string[] = [];
            for (let di = 0; di < drawCount; di++) {
              const [drawnCard] = depsRef.current.takeRandomCardsFromBackpack(1);
              if (drawnCard) {
                depsRef.current.queueCardIntoHand(drawnCard);
                drawnNames.push(drawnCard.name);
              }
            }
            finalizeMagicCard(card, { banner: `将 ${discardCount} 张手牌移到回收袋。${echoTag}` });
            if (drawnNames.length > 0) {
              setHeroSkillBanner(
                `将 ${discardCount} 张手牌移到回收袋，从背包抽到 ${drawnNames.join('、')}。${echoTag}`,
              );
            } else {
              setHeroSkillBanner(
                `将 ${discardCount} 张手牌移到回收袋，但背包为空或手牌已满。${echoTag}`,
              );
            }
          });
          return;
        }
        case STARTER_CARD_IDS.reshuffle: {
          const dungeonCards = flattenActiveRowSlots(activeCards);
          if (dungeonCards.length === 0) {
            finalizeMagicCard(card, { banner: '当前没有可置于牌堆底的地城卡牌。' });
            return;
          }
          if (dungeonCards.length === 1 && echoMultiplier <= 1) {
            const target = dungeonCards[0];
            depsRef.current.removeCard(target.id, false);
            const sanitizedCard = sanitizeCardMetadata(target);
            setRemainingDeck(prev => [...prev, sanitizedCard]);
            let reshuffleSingleUpgrade = false;
            if (depsRef.current.amuletEffects.hasSwapUpgrade) {
              const prog = engine.getState().swapUpgradeProgress + 1;
              if (prog >= 3) {
                setSwapUpgradeProgress(0);
                updateSwapUpgradeCounter(0, 3);
                reshuffleSingleUpgrade = true;
              } else {
                setSwapUpgradeProgress(prog);
                updateSwapUpgradeCounter(prog, 3);
                depsRef.current.addGameLog('amulet', `流转之符：交换位置（${prog}/3）`);
              }
            }
            finalizeMagicCard(card, { banner: `${target.name} 已置于牌堆底。` });
            if (reshuffleSingleUpgrade) {
              setUpgradeModalOpen(true);
              depsRef.current.addGameLog('amulet', '流转之符：交换 3 次位置，选择一张牌升级！');
              setHeroSkillBanner('流转之符：选择一张牌进行升级。');
            }
            return;
          }
          depsRef.current.echoRemainingRef.current = echoMultiplier;
          depsRef.current.echoTotalRef.current = echoMultiplier;
          const echoLabel = echoMultiplier > 1 ? `（回响：第 1/${echoMultiplier} 次）` : '';
          setPendingMagicAction({
            card,
            effect: 'return-dungeon-bottom',
            step: 'dungeon-select',
            prompt: `选择一张地城卡牌，置于牌堆底。${echoLabel}`,
            echoRemaining: echoMultiplier,
          });
          setHeroSkillBanner(`选择一张地城卡牌，置于牌堆底。${echoLabel}`);
          return;
        }
        case STARTER_CARD_IDS.dungeonSwap: {
          let leftIdx = -1;
          let rightIdx = -1;
          for (let i = 0; i < activeCards.length; i++) {
            if (activeCards[i] != null) {
              if (leftIdx === -1) leftIdx = i;
              rightIdx = i;
            }
          }
          if (leftIdx === -1 || leftIdx === rightIdx) {
            finalizeMagicCard(card, { banner: '乾坤挪移无效（地城行剩余卡牌不足 2 张）。' });
            return;
          }
          const leftCard = activeCards[leftIdx]!;
          const rightCard = activeCards[rightIdx]!;
          for (let swapI = 0; swapI < echoMultiplier; swapI++) {
            setActiveCards(prev => {
              const next = [...prev] as ActiveRowSlots;
              const tmp = next[leftIdx];
              next[leftIdx] = next[rightIdx];
              next[rightIdx] = tmp;
              return next;
            });
          }
          const swapBanner = echoMultiplier > 1
            ? `乾坤挪移 ×${echoMultiplier}：${leftCard.name} ↔ ${rightCard.name}（回响）`
            : `${leftCard.name} ↔ ${rightCard.name} 位置互换！`;
          depsRef.current.addGameLog('magic', `乾坤挪移：${leftCard.name} 与 ${rightCard.name} 互换 ${echoMultiplier} 次。`);
          let dungeonSwapUpgrade = false;
          if (depsRef.current.amuletEffects.hasSwapUpgrade) {
            const swapCount = echoMultiplier;
            let prog = engine.getState().swapUpgradeProgress;
            for (let si = 0; si < swapCount; si++) {
              prog += 1;
              if (prog >= 3) {
                prog = 0;
                dungeonSwapUpgrade = true;
              }
            }
            if (prog !== engine.getState().swapUpgradeProgress) {
              setSwapUpgradeProgress(prog);
              updateSwapUpgradeCounter(prog, 3);
              if (prog > 0) {
                depsRef.current.addGameLog('amulet', `流转之符：交换位置（${prog}/3）`);
              }
            }
          }
          finalizeMagicCard(card, { banner: swapBanner });
          if (dungeonSwapUpgrade) {
            setUpgradeModalOpen(true);
            depsRef.current.addGameLog('amulet', '流转之符：交换 3 次位置，选择一张牌升级！');
            setHeroSkillBanner('流转之符：选择一张牌进行升级。');
          }
          return;
        }
        case 'potion-flip-heal':
        case STARTER_CARD_IDS.healEcho: {
          const healed = depsRef.current.healHero(2 * echoMultiplier);
          const banner = healed > 0
            ? `治愈余韵生效，恢复 ${healed} 点生命。${isEchoTriggered ? '（回响×2）' : ''}`
            : '生命值已满，治愈余韵未生效。';
          finalizeMagicCard(card, { banner });
          return;
        }
        case 'guild-blood-gold': {
          depsRef.current.applyDamage(1 * echoMultiplier, 'general', { selfInflicted: true });
          setGold(prev => prev + 2 * echoMultiplier);
          depsRef.current.addGameLog('magic', `血金术：受到 ${1 * echoMultiplier} 点伤害，获得 ${2 * echoMultiplier} 金币`);
          finalizeMagicCard(card, { banner: `血金术：以 ${1 * echoMultiplier} 点生命换取 ${2 * echoMultiplier} 金币。${isEchoTriggered ? '（回响×2）' : ''}` });
          return;
        }
        case 'crossroads-left-swap': {
          let firstIdx = -1;
          let secondIdx = -1;
          for (let i = 0; i < activeCards.length; i++) {
            if (activeCards[i] != null) {
              if (firstIdx === -1) firstIdx = i;
              else if (secondIdx === -1) { secondIdx = i; break; }
            }
          }
          if (firstIdx === -1 || secondIdx === -1) {
            finalizeMagicCard(card, { banner: '命运挪移无效（地城行剩余卡牌不足 2 张）。' });
            return;
          }
          const firstCard = activeCards[firstIdx]!;
          const secondCard = activeCards[secondIdx]!;
          for (let swapI = 0; swapI < echoMultiplier; swapI++) {
            setActiveCards(prev => {
              const next = [...prev] as ActiveRowSlots;
              const tmp = next[firstIdx];
              next[firstIdx] = next[secondIdx];
              next[secondIdx] = tmp;
              return next;
            });
          }
          const banner = echoMultiplier > 1
            ? `命运挪移 ×${echoMultiplier}：${firstCard.name} ↔ ${secondCard.name}（回响）`
            : `命运挪移：${firstCard.name} ↔ ${secondCard.name} 位置互换！`;
          depsRef.current.addGameLog('magic', `命运挪移：${firstCard.name} 与 ${secondCard.name} 互换 ${echoMultiplier} 次。`);
          finalizeMagicCard(card, { banner });
          return;
        }
        case STARTER_CARD_IDS.tempArmor: {
          const armorAmounts = [2, 3, 4];
          const armorAmt = armorAmounts[card.upgradeLevel ?? 0] ?? 2;
          setPendingMagicAction({ card, effect: 'temp-armor', step: 'slot-select', prompt: `选择一个装备栏，+${armorAmt} 临时护甲。` });
          setHeroSkillBanner(`选择一个装备栏，+${armorAmt} 临时护甲。`);
          return;
        }
        case STARTER_CARD_IDS.healMagic: {
          const healAmounts = [5, 3, 5];
          const healAmt = healAmounts[card.upgradeLevel ?? 0] ?? 5;
          const healed = depsRef.current.healHero(healAmt);
          finalizeMagicCard(card, { banner: healed > 0 ? `治愈术：回复 ${healed} 点生命。` : '生命值已满。' });
          return;
        }
        case STARTER_CARD_IDS.permGrantMagic: {
          const eligible = handCards.filter(c => c.id !== card.id && !cardHasPermFlag(c));
          if (eligible.length === 0) {
            depsRef.current.addGameLog('magic', '永恒铭刻：手牌中没有可赋予永恒属性的卡牌。');
            finalizeMagicCard(card, { banner: '手牌中没有可赋予永恒属性的卡牌。' });
            return;
          }
          if (eligible.length === 1) {
            const target = eligible[0];
            setHandCards(prev => prev.map(c => c.id === target.id ? { ...c, recycleDelay: 2 } : c));
            depsRef.current.addGameLog('magic', `永恒铭刻：「${target.name}」获得 Perm 2 属性！`);
            finalizeMagicCard(card, { banner: `「${target.name}」获得 Perm 2！被移除后将经 2 次瀑流返回背包。` });
            return;
          }
          setPermGrantModal({ sourceCardId: card.id, sourceType: 'magic' });
          return;
        }
        case STARTER_CARD_IDS.classSummon: {
          const wasPlayedFromHand = handCards.some(c => c.id === card.id);
          const actualHandCount = handCards.length - (wasPlayedFromHand ? 1 : 0);
          if (actualHandCount < 2) {
            finalizeMagicCard(card, { banner: '手牌不足 2 张，无法使用。' });
            return;
          }
          void depsRef.current.requestCardAction('discard-recycle', 2, {
            title: '专属召唤：弃回 2 张牌',
            description: '弃回 2 张牌，获得一张职业专属卡。',
            handOnly: true,
          }).then(success => {
            if (!success) {
              finalizeMagicCard(card, { banner: '取消了专属召唤。' });
              return;
            }
            const classDrawn = depsRef.current.drawClassCardsToBackpack(1, '专属召唤');
            if (classDrawn.length > 0) {
              depsRef.current.triggerClassDeckFlight(classDrawn);
              depsRef.current.addGameLog('magic', `专属召唤：获得职业卡「${classDrawn[0].name}」`);
              finalizeMagicCard(card, { banner: `获得职业卡「${classDrawn[0].name}」！` });
            } else {
              finalizeMagicCard(card, { banner: '职业牌堆已空。' });
            }
          });
          return;
        }
        case STARTER_CARD_IDS.dimensionWarp: {
          const dungeonCards = flattenActiveRowSlots(activeCards);
          if (dungeonCards.length === 0) {
            finalizeMagicCard(card, { banner: '地城行没有卡牌。' });
            return;
          }
          setPendingMagicAction({
            card,
            effect: 'dungeon-preview-swap',
            step: 'dungeon-select',
            prompt: '选择地城行一张卡牌，与正上方预览行卡牌互换。',
          });
          setHeroSkillBanner('选择地城行一张卡牌，与正上方预览行卡牌互换。');
          return;
        }
        case STARTER_CARD_IDS.undyingBlessing: {
          const equipSlots = depsRef.current.getEquipmentSlots().filter(slot => slot.item != null);
          if (equipSlots.length === 0) {
            finalizeMagicCard(card, { banner: '没有可赐福的装备。' });
            return;
          }
          if (equipSlots.length === 1) {
            const slot = equipSlots[0];
            const item = slot.item!;
            depsRef.current.setEquipmentSlotById(slot.id, { ...item, hasEquipmentRevive: true, equipmentReviveUsed: false } as EquipmentItem);
            let drawMsg = '';
            if ((card.upgradeLevel ?? 0) >= 1) {
              const drawn = depsRef.current.drawFromBackpackToHand();
              drawMsg = drawn ? ` 抽到「${drawn.name}」。` : '';
            }
            finalizeMagicCard(card, { banner: `${item.name} 获得了不灭赐福！${drawMsg}` });
            depsRef.current.addGameLog('magic', `不灭赐福：${item.name} 获得复生能力${drawMsg}`);
            return;
          }
          setPendingMagicAction({ card, effect: 'grant-revive', step: 'slot-select', prompt: '选择一个装备赋予复生。' });
          setHeroSkillBanner('选择一个装备赋予复生。');
          return;
        }
        case STARTER_CARD_IDS.recallEquip: {
          const recallAmulets = engine.getState().amuletSlots;
          const hasAnySlotItem = equipmentSlot1 || equipmentSlot2 || recallAmulets.length > 0;
          if (!hasAnySlotItem) {
            finalizeMagicCard(card, { banner: '没有可回手的装备或护符。' });
            return;
          }
          const result = await performReturnToHand();
          if (result.success) {
            const drawn = depsRef.current.drawFromBackpackToHand();
            const drawnMsg = drawn ? `，抽到「${drawn.name}」` : '';
            depsRef.current.addGameLog('magic', `回收术：${result.itemName} 从${result.slotLabel}回到手牌${drawnMsg}`);
            finalizeMagicCard(card, { banner: `回收术：${result.itemName} 已回到手牌${drawnMsg}！` });
          } else {
            finalizeMagicCard(card, { banner: '回手取消。' });
          }
          return;
        }
        case STARTER_CARD_IDS.magicMissile: {
          const boltCounts = [2, 3, 4];
          const boltCount = boltCounts[card.upgradeLevel ?? 0] ?? 2;
          const bolts: GameCardData[] = [];
          for (let i = 0; i < boltCount; i++) {
            bolts.push({
              id: `missile-bolt-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
              type: 'magic',
              name: '魔弹',
              value: 0,
              image: card.image,
              magicType: 'instant',
              knightEffect: 'missile-bolt',
              magicEffect: '一次性：选择一个怪物，造成 2 点法术伤害。',
              description: '选择一个怪物，造成 2 点法术伤害。',
            });
          }
          setHandCards(prev => [...prev, ...bolts]);
          depsRef.current.addGameLog('magic', `魔法飞弹：加入 ${boltCount} 张「魔弹」到手牌`);
          finalizeMagicCard(card, { banner: `魔法飞弹：${boltCount} 张「魔弹」已加入手牌！` });
          return;
        }
        case STARTER_CARD_IDS.stunStrike: {
          const stunDmgPerHit = [1, 2, 3];
          const stunChances = [20, 40, 60];
          const hits = 2;
          const baseDmgPerHit = (stunDmgPerHit[card.upgradeLevel ?? 0] ?? 1) + (card.amplifyBonus ?? 0);
          const rawStunPct = (stunChances[card.upgradeLevel ?? 0] ?? 10) + (depsRef.current.amuletEffects?.stunRateBoost ?? 0);
          const stunPct = Math.min(rawStunPct, stunCap);
          const hitDmg = getSpellDamage(baseDmgPerHit) * echoMultiplier;
          const totalDmg = hitDmg * hits;
          const monsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
          if (monsters.length === 0) {
            finalizeMagicCard(card, { banner: '没有怪物可攻击。' });
            return;
          }
          if (monsters.length === 1) {
            if (!depsRef.current.isMonsterEngaged(monsters[0].id)) depsRef.current.beginCombat(monsters[0], 'hero');
            depsRef.current.dealDamageToMonster(monsters[0], totalDmg, { pulses: 2, isSpellDamage: true });
            let stunText = '';
            let stunned = monsters[0].isStunned;
            const threshold = Math.round((stunPct / 100) * 20);
            if (threshold > 0) {
              for (let hit = 1; hit <= hits; hit++) {
                if (stunned) break;
                const stunResult = await depsRef.current.requestDiceOutcome({
                  title: monsters[0].name,
                  subtitle: `雷震击晕判定 第${hit}击（${stunPct}%）`,
                  entries: [
                    { id: 'stun', range: [1, threshold] as [number, number], label: '击晕成功！', effect: 'none' },
                    { id: 'miss', range: [threshold + 1, 20] as [number, number], label: '未击晕', effect: 'none' },
                  ],
                });
                if (stunResult?.id === 'stun') {
                  depsRef.current.updateMonsterCard(monsters[0].id, m => ({ ...m, isStunned: true }));
                  stunned = true;
                  stunText = ` 第${hit}击击晕成功！`;
                  depsRef.current.addGameLog('combat', `${monsters[0].name} 被雷震击晕了！`);

                  if (depsRef.current.amuletEffects.hasStunUpgradeCap) {
                    setStunCap(prev => {
                      const next = Math.min(100, prev + 5);
                      depsRef.current.addGameLog('amulet', `震慑之符：击晕成功，击晕上限 +5%（当前 ${next}%）`);
                      return next;
                    });
                  }
                }
              }
              if (!stunned) {
                stunText = ' 未能击晕。';
              }
            }
            depsRef.current.addGameLog('magic', `雷震击：对 ${monsters[0].name} 造成 ${hitDmg}×${hits} 点法术伤害`);
            finalizeMagicCard(card, { banner: `雷震击：对 ${monsters[0].name} 造成 ${hitDmg}×${hits} 点伤害！${stunText}`, dealtDamage: true });
            return;
          }
          setPendingMagicAction({
            card,
            effect: 'stun-strike',
            step: 'monster-select',
            prompt: `选择一个怪物，造成 ${hitDmg}×${hits} 点法术伤害（每击 ${stunPct}% 击晕）。`,
            echoMultiplier,
            data: { baseDmgPerHit, stunPct, hits },
          });
          setHeroSkillBanner(`选择一个怪物，造成 ${hitDmg}×${hits} 点伤害（每击 ${stunPct}% 击晕）。`);
          return;
        }
        case STARTER_CARD_IDS.gamblerGambit: {
          const goldAmounts = [1, 2, 3];
          const drawAmounts = [1, 2, 3];
          const goldAmt = goldAmounts[card.upgradeLevel ?? 0] ?? 1;
          const drawAmt = drawAmounts[card.upgradeLevel ?? 0] ?? 1;
          depsRef.current.applyDamage(1, 'general', { selfInflicted: true });
          setGold(prev => prev + goldAmt);
          const drawnNames: string[] = [];
          for (let i = 0; i < drawAmt; i++) {
            const d = depsRef.current.drawFromBackpackToHand();
            if (d) drawnNames.push(d.name);
          }
          const drawnMsg = drawnNames.length > 0 ? `，抽到${drawnNames.map(n => `「${n}」`).join('、')}` : '，背包为空';
          depsRef.current.addGameLog('magic', `赌徒之计：失去 1 生命，+${goldAmt} 金币${drawnMsg}`);
          finalizeMagicCard(card, { banner: `赌徒之计：-1 生命，+${goldAmt} 金币${drawnMsg}。` });
          return;
        }
        case STARTER_CARD_IDS.recycleDrawMagic: {
          const drawCounts = [1, 2, 3];
          const drawCount = drawCounts[card.upgradeLevel ?? 0] ?? 1;
          const drawnNames: string[] = [];
          for (let i = 0; i < drawCount; i++) {
            const d = depsRef.current.drawFromBackpackToHand();
            if (d) drawnNames.push(d.name);
          }
          const banner = drawnNames.length > 0
            ? `回收余韵：抽到${drawnNames.map(n => `「${n}」`).join('、')}。`
            : '回收余韵：背包为空。';
          depsRef.current.addGameLog('magic', banner);
          finalizeMagicCard(card, { banner });
          return;
        }
        case STARTER_CARD_IDS.fateSwapDeep: {
          const depth = 5;
          const dungeonCards = flattenActiveRowSlots(activeCards);
          if (dungeonCards.length === 0) {
            finalizeMagicCard(card, { banner: '地城行没有卡牌。' });
            return;
          }
          if (remainingDeck.length === 0) {
            finalizeMagicCard(card, { banner: '牌堆已空，无法交换。' });
            return;
          }
          setPendingMagicAction({
            card,
            effect: 'fate-swap',
            step: 'dungeon-select',
            prompt: `选择地城行一张牌，与牌堆顶 ${depth} 张中随机一张交换。`,
            deckDepth: depth,
          });
          setHeroSkillBanner(`选择地城行一张牌，与牌堆顶 ${depth} 张中随机一张交换。`);
          return;
        }
        default: {
          if (card.magicEffect === 'storm-volley-recycle') {
            const svMonsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
            if (svMonsters.length === 0) {
              finalizeMagicCard(card, { banner: '箭雨余韵无效（没有怪物）。' });
              return;
            }
            const svDamage = getSpellDamage(1 + (card.amplifyBonus ?? 0)) * echoMultiplier;
            svMonsters.forEach((monster, index) => {
              if (!depsRef.current.isMonsterEngaged(monster.id)) {
                depsRef.current.beginCombat(monster, 'hero');
              }
              const animationDelay = index * Math.floor(COMBAT_ANIMATION_STAGGER * 0.75);
              depsRef.current.dealDamageToMonster(monster, svDamage, { animationDelay, pulses: 1, isSpellDamage: true });
            });
            const hitCount = svDamage > 0 ? svMonsters.length : 0;
            const availableBag = permanentMagicRecycleBag.filter(c => c.id !== card.id);
            const drawCount = Math.min(hitCount, availableBag.length);
            const shuffled = [...availableBag].sort(() => Math.random() - 0.5);
            const drawn = shuffled.slice(0, drawCount);
            const drawnIds = new Set(drawn.map(c => c.id));
            if (drawn.length > 0) {
              setPermanentMagicRecycleBag(prev => prev.filter(c => !drawnIds.has(c.id)));
              drawn.forEach(c => depsRef.current.queueCardIntoHand(c));
              depsRef.current.addGameLog('deck', `从回收袋抽取 ${drawn.length} 张牌：${drawn.map(c => c.name).join('、')}`);
            }
            const drawnNames = drawn.map(c => c.name).join('、');
            const svBanner = drawn.length > 0
              ? `箭雨余韵命中 ${hitCount} 只怪物，造成 ${svDamage} 点伤害！从回收袋抽取：${drawnNames}。${isEchoTriggered ? '（回响×2）' : ''}`
              : `箭雨余韵命中 ${hitCount} 只怪物，造成 ${svDamage} 点伤害！回收袋无可抽取的牌。${isEchoTriggered ? '（回响×2）' : ''}`;
            finalizeMagicCard(card, { banner: svBanner, dealtDamage: true });
            return;
          }
          if (card.id.includes('flip-crypt-echo')) {
            const healed = depsRef.current.healHero(3 * echoMultiplier);
            const banner = healed > 0
              ? `墓语回响生效，恢复 ${healed} 点生命。${isEchoTriggered ? '（回响×2）' : ''}`
              : '生命值已满，墓语回响未回复生命。';
            finalizeMagicCard(card, { banner });
            return;
          }
          if (card.scalingDamage != null) {
            const strikeBase = card.scalingDamage;
            const currentDamage = getSpellDamage(strikeBase) * echoMultiplier;
            const monsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
            if (monsters.length === 0) {
              finalizeMagicCard(card, { banner: `${card.name}无效（没有怪物）。` });
              return;
            }
            const nextBase = strikeBase + 1;
            const updatedCard: GameCardData = {
              ...card,
              scalingDamage: nextBase,
              magicEffect: `下一击叠刺 ${nextBase}`,
            };
            if (monsters.length === 1) {
              if (!depsRef.current.isMonsterEngaged(monsters[0].id)) depsRef.current.beginCombat(monsters[0], 'hero');
              depsRef.current.dealDamageToMonster(monsters[0], currentDamage, { pulses: 2, isSpellDamage: true });
              {
                const scalingActiveCards = engine.getState().activeCards;
                for (const ac of scalingActiveCards) {
                  if (ac && ac.antiMagicReflect && ac.antiMagicReflect > 0 && !ac.isStunned) {
                    depsRef.current.applyDamage(ac.antiMagicReflect);
                    depsRef.current.addGameLog('combat', `${ac.name} 反魔：对英雄造成 ${ac.antiMagicReflect} 点伤害！`);
                  }
                }
              }
              depsRef.current.addPermanentMagicToRecycleBag(updatedCard);
              depsRef.current.removePendingDungeonCard(card.id);
              depsRef.current.removeCard(card.id, false);
              setPendingMagicAction(null);
              depsRef.current.addGameLog(
                'magic',
                `${card.name}：对 ${monsters[0].name} 造成 ${currentDamage} 点（下一击叠刺 ${nextBase}）`,
              );
              setHeroSkillBanner(`${card.name} 下一击叠刺 ${nextBase}`);
              depsRef.current.stagingCardsRef.current =
                depsRef.current.stagingCardsRef.current.filter(c => c.id !== card.id);
              depsRef.current.drainPendingDiscardEffects();
              return;
            }
            setPendingMagicAction({
              card: updatedCard,
              effect: 'scaling-damage',
              step: 'monster-select',
              pendingDamage: strikeBase,
              echoMultiplier,
              prompt: `选择目标（本刺叠刺 ${strikeBase}）`,
            });
            setHeroSkillBanner(`${card.name} 请选择目标 · 本刺叠刺 ${strikeBase}`);
            return;
          }
          if (card.magicEffect === 'arcane-storm-magic-count') {
            const magicCount = engine.getState().magicCardsPlayedThisTurn;
            const baseDmg = Math.max(0, magicCount + (card.amplifyBonus ?? 0));
            const totalDmg = getSpellDamage(baseDmg) * echoMultiplier;
            const monsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
            if (monsters.length === 0 || totalDmg <= 0) {
              finalizeMagicCard(card, { banner: `奥术风暴：本回合使用了 ${magicCount} 张魔法卡，但没有可攻击的目标。` });
              return;
            }
            if (monsters.length === 1) {
              const target = monsters[0];
              if (!depsRef.current.isMonsterEngaged(target.id)) depsRef.current.beginCombat(target, 'hero');
              depsRef.current.dealDamageToMonster(target, totalDmg, { isSpellDamage: true });
              finalizeMagicCard(card, {
                banner: `奥术风暴：本回合 ${magicCount} 张魔法卡，对 ${target.name} 造成 ${totalDmg} 点伤害。${isEchoTriggered ? '（回响×2）' : ''}`,
                dealtDamage: true,
              });
              return;
            }
            setPendingMagicAction({
              card,
              effect: 'arcane-storm',
              step: 'monster-select',
              pendingDamage: baseDmg,
              echoMultiplier,
              prompt: `奥术风暴：选择一个目标，造成 ${totalDmg} 点伤害（本回合 ${magicCount} 张魔法卡）。`,
            });
            setHeroSkillBanner(`奥术风暴：本回合 ${magicCount} 张魔法卡，选择目标造成 ${totalDmg} 点伤害。`);
            return;
          }
          if (card.magicEffect === 'altar-discard-discover') {
            const hand = engine.getState().handCards;
            const playable = hand.filter(c => c.id !== card.id);
            if (playable.length < 2) {
              finalizeMagicCard(card, { banner: `手牌不足 2 张，无法使用祭坛秘术。` });
              return;
            }
            const discarded = pickRandomHandCardsForDiscardPreferGraveyard(playable, 2);
            const discardIds = new Set(discarded.map(c => c.id));
            setHandCards(prev => prev.filter(c => !discardIds.has(c.id)));
            for (const dc of discarded) {
              depsRef.current.discardCardToGraveyard(dc, { owner: 'player' });
            }
            depsRef.current.addGameLog('magic', `祭坛秘术：弃回 ${discarded.map(c => c.name).join('、')}`);
            const started = depsRef.current.beginDiscoverFlow('altar-discard-discover', {
              filter: (c: GameCardData) => c.type === 'magic' || c.type === 'hero-magic',
              sourceLabel: card.name,
            });
            if (started) {
              finalizeMagicCard(card, { banner: `祭坛秘术：弃回 ${discarded.length} 张牌，发现专属魔法卡…` });
            } else {
              depsRef.current.addGameLog('magic', '祭坛秘术：专属牌堆中没有魔法卡。');
              finalizeMagicCard(card, { banner: '祭坛秘术：弃回了手牌，但专属牌堆中没有魔法卡。' });
            }
            return;
          }
          if (card.magicEffect === 'altar-discover-class-magic') {
            const started = depsRef.current.beginDiscoverFlow('altar-discover-class-magic', {
              filter: (c: GameCardData) => c.type === 'magic' || c.type === 'hero-magic',
              sourceLabel: card.name,
            });
            if (started) {
              finalizeMagicCard(card, { banner: '祭坛秘术：发现专属魔法卡…' });
            } else {
              depsRef.current.addGameLog('magic', '祭坛秘术：专属牌堆中没有魔法卡。');
              finalizeMagicCard(card, { banner: '祭坛秘术：专属牌堆中没有魔法卡。' });
            }
            return;
          }
          if (card.magicEffect === 'equipment-enchant-discard') {
            const handEquip = engine.getState().handCards.filter(
              c => c.id !== card.id && (c.type === 'weapon' || c.type === 'shield'),
            );
            const equippedSlots = depsRef.current.getEquipmentSlots().filter(s => s.item);
            if (handEquip.length === 0) {
              finalizeMagicCard(card, { banner: '手牌中没有装备卡可弃置。' });
              return;
            }
            if (equippedSlots.length === 0) {
              finalizeMagicCard(card, { banner: '装备栏没有装备可附魔。' });
              return;
            }
            setPermGrantModal({ sourceCardId: card.id, sourceType: 'equipment-enchant' });
            setHeroSkillBanner('选择一张手牌中的装备进行附魔。');
            return;
          }
          if (card.magicEffect === 'equalize-temp-attack-armor') {
            const equippedSlots = depsRef.current.getEquipmentSlots().filter(s => s.item);
            if (equippedSlots.length === 0) {
              finalizeMagicCard(card, { banner: '没有装备可选择。' });
              return;
            }
            const applyEqualize = (slotId: EquipmentSlotId, slotItem: GameCardData) => {
              const atkBoost = 2 * echoMultiplier;
              setSlotTempAttack(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + atkBoost }));
              depsRef.current.addGameLog('magic', `时空镜像：${slotItem.name} 临时攻击 +${atkBoost}`);

              const tempAtk = (gs.slotTempAttack[slotId] ?? 0) + atkBoost;
              const tempArm = gs.slotTempArmor[slotId] ?? 0;
              if (tempAtk === tempArm) {
                finalizeMagicCard(card, { banner: `${slotItem.name} 临时攻击 +${atkBoost}，攻防已相等（${tempAtk}）。` });
                return;
              }
              if (tempAtk > tempArm) {
                const delta = tempAtk - tempArm;
                setSlotTempArmor(prev => ({ ...prev, [slotId]: tempAtk }));
                depsRef.current.addGameLog('magic', `时空镜像：${slotItem.name} 临时护甲 +${delta}，临时攻击与临时护甲均为 ${tempAtk}`);
                finalizeMagicCard(card, { banner: `${slotItem.name} 临时攻击 +${atkBoost}，临时护甲 +${delta}，攻防均为 ${tempAtk}。` });
              } else {
                const delta = tempArm - tempAtk;
                setSlotTempAttack(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + delta }));
                depsRef.current.addGameLog('magic', `时空镜像：${slotItem.name} 临时攻击再 +${delta}，临时攻击与临时护甲均为 ${tempArm}`);
                finalizeMagicCard(card, { banner: `${slotItem.name} 临时攻击 +${atkBoost + delta}，攻防均为 ${tempArm}。` });
              }
            };
            if (equippedSlots.length === 1) {
              applyEqualize(equippedSlots[0].id, equippedSlots[0].item!);
              return;
            }
            setPendingMagicAction({
              card,
              effect: 'equalize-temp-attack-armor',
              step: 'slot-select',
              prompt: '选择一个装备栏，临时攻击+2，然后使临时攻击与临时护甲相等。',
            });
            setHeroSkillBanner('时空镜像：选择一个装备栏。');
            return;
          }
          if (card.magicEffect === 'double-next-magic') {
            setDoubleNextMagic(true);
            finalizeMagicCard(card, { banner: '法术回响已激活！下一张法术的效果将触发两次。' });
            return;
          }
          if (card.magicEffect === 'amplify-card') {
            const hasEquip1 = equipmentSlot1 && (equipmentSlot1.type === 'weapon' || equipmentSlot1.type === 'shield');
            const hasEquip2 = equipmentSlot2 && (equipmentSlot2.type === 'weapon' || equipmentSlot2.type === 'shield');
            const eligibleHand = handCards.filter(
              c => c.id !== card.id && (c.type === 'weapon' || c.type === 'shield' || isDamageMagic(c)),
            );
            if (!hasEquip1 && !hasEquip2 && eligibleHand.length === 0) {
              finalizeMagicCard(card, { banner: '增幅：没有可增幅的目标（装备栏无装备，手牌中无装备或伤害魔法）。' });
              return;
            }
            setAmplifyModal({ sourceCardId: card.id });
            setHeroSkillBanner('增幅：选择一张牌进行增幅。');
            return;
          }
          if (card.magicEffect === 'amplify-target') {
            const targetId = card._amplifyTargetCardId;
            const targetName = card._amplifyTargetName ?? '未知';
            if (!targetId) {
              finalizeMagicCard(card, { banner: '增幅：目标不存在。' });
              return;
            }
            const slot1 = equipmentSlot1;
            const slot2 = equipmentSlot2;
            if (slot1 && slot1.id === targetId) {
              if (slot1.type === 'weapon') {
                depsRef.current.setEquipmentSlotById('equipmentSlot1', {
                  ...slot1,
                  value: slot1.value + 1,
                  amplifyBonus: (slot1.amplifyBonus ?? 0) + 1,
                });
                depsRef.current.addGameLog('magic', `增幅：${targetName} 攻击力 +1（${slot1.value}→${slot1.value + 1}）`);
                finalizeMagicCard(card, { banner: `增幅：${targetName} 攻击力 +1（${slot1.value}→${slot1.value + 1}）！` });
              } else {
                const oldArmor = slot1.armorMax ?? slot1.value;
                depsRef.current.setEquipmentSlotById('equipmentSlot1', {
                  ...slot1,
                  armorMax: oldArmor + 1,
                  value: slot1.value + 1,
                  amplifyBonus: (slot1.amplifyBonus ?? 0) + 1,
                });
                depsRef.current.addGameLog('magic', `增幅：${targetName} 护甲 +1（${oldArmor}→${oldArmor + 1}）`);
                finalizeMagicCard(card, { banner: `增幅：${targetName} 护甲 +1（${oldArmor}→${oldArmor + 1}）！` });
              }
              return;
            }
            if (slot2 && slot2.id === targetId) {
              if (slot2.type === 'weapon') {
                depsRef.current.setEquipmentSlotById('equipmentSlot2', {
                  ...slot2,
                  value: slot2.value + 1,
                  amplifyBonus: (slot2.amplifyBonus ?? 0) + 1,
                });
                depsRef.current.addGameLog('magic', `增幅：${targetName} 攻击力 +1（${slot2.value}→${slot2.value + 1}）`);
                finalizeMagicCard(card, { banner: `增幅：${targetName} 攻击力 +1（${slot2.value}→${slot2.value + 1}）！` });
              } else {
                const oldArmor = slot2.armorMax ?? slot2.value;
                depsRef.current.setEquipmentSlotById('equipmentSlot2', {
                  ...slot2,
                  armorMax: oldArmor + 1,
                  value: slot2.value + 1,
                  amplifyBonus: (slot2.amplifyBonus ?? 0) + 1,
                });
                depsRef.current.addGameLog('magic', `增幅：${targetName} 护甲 +1（${oldArmor}→${oldArmor + 1}）`);
                finalizeMagicCard(card, { banner: `增幅：${targetName} 护甲 +1（${oldArmor}→${oldArmor + 1}）！` });
              }
              return;
            }
            const handTarget = engine.getState().handCards.find(c => c.id === targetId);
            if (handTarget) {
              if (handTarget.type === 'weapon') {
                setHandCards(prev => prev.map(c =>
                  c.id === targetId ? { ...c, value: c.value + 1, amplifyBonus: (c.amplifyBonus ?? 0) + 1 } : c,
                ));
                depsRef.current.addGameLog('magic', `增幅：${targetName} 攻击力 +1（${handTarget.value}→${handTarget.value + 1}）`);
                finalizeMagicCard(card, { banner: `增幅：${targetName} 攻击力 +1（${handTarget.value}→${handTarget.value + 1}）！` });
              } else if (handTarget.type === 'shield') {
                const oldArmor = handTarget.armorMax ?? handTarget.value;
                setHandCards(prev => prev.map(c =>
                  c.id === targetId
                    ? { ...c, armorMax: (c.armorMax ?? c.value) + 1, value: c.value + 1, amplifyBonus: (c.amplifyBonus ?? 0) + 1 }
                    : c,
                ));
                depsRef.current.addGameLog('magic', `增幅：${targetName} 护甲 +1（${oldArmor}→${oldArmor + 1}）`);
                finalizeMagicCard(card, { banner: `增幅：${targetName} 护甲 +1（${oldArmor}→${oldArmor + 1}）！` });
              } else if (handTarget.type === 'magic') {
                if (handTarget.scalingDamage != null) {
                  setHandCards(prev => prev.map(c =>
                    c.id === targetId ? { ...c, scalingDamage: (c.scalingDamage ?? 0) + 1, amplifyBonus: (c.amplifyBonus ?? 0) + 1 } : c,
                  ));
                  depsRef.current.addGameLog('magic', `增幅：${targetName} 叠刺基数 +1（${handTarget.scalingDamage}→${(handTarget.scalingDamage ?? 0) + 1}）`);
                  finalizeMagicCard(card, { banner: `增幅：${targetName} 叠刺基数 +1！` });
                } else {
                  const newBonus = (handTarget.amplifyBonus ?? 0) + 1;
                  setHandCards(prev => prev.map(c =>
                    c.id === targetId ? { ...c, amplifyBonus: newBonus } : c,
                  ));
                  depsRef.current.addGameLog('magic', `增幅：${targetName} 伤害 +1（增幅 ×${newBonus}）`);
                  finalizeMagicCard(card, { banner: `增幅：${targetName} 伤害 +1！` });
                }
              } else {
                finalizeMagicCard(card, { banner: `增幅：「${targetName}」类型无法增幅。` });
              }
              return;
            }
            finalizeMagicCard(card, { banner: `增幅：「${targetName}」不在装备栏或手牌中，无法增幅。` });
            return;
          }
          if (card.magicEffect === 'persuade-boost-draw') {
            const normalBoost = 15 * echoMultiplier;
            depsRef.current.persuadeAmuletBonusRef.current += normalBoost;
            depsRef.current.addGameLog('magic', `劝降祝福：下次劝降成功率 +${normalBoost}%（精英 +${10 * echoMultiplier}%），抽 1 张牌`);
            const drawn = drawCardsFromBackpack(1 * echoMultiplier);
            const drawText = drawn > 0 ? `，抽了 ${drawn} 张牌` : '';
            finalizeMagicCard(card, { banner: `劝降祝福：劝降成功率 +${normalBoost}%${drawText}。${isEchoTriggered ? '（回响×2）' : ''}` });
            return;
          }
          if (card.magicEffect === 'bounty-spell-damage') {
            const monsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
            if (monsters.length === 0) {
              finalizeMagicCard(card, { banner: '赏金裁决无效（没有怪物）。' });
              return;
            }
            const baseDmg = 5 + (card.amplifyBonus ?? 0);
            const totalDmg = getSpellDamage(baseDmg) * echoMultiplier;
            if (monsters.length === 1) {
              if (!depsRef.current.isMonsterEngaged(monsters[0].id)) depsRef.current.beginCombat(monsters[0], 'hero');
              depsRef.current.dealDamageToMonster(monsters[0], totalDmg, { pulses: 2, isSpellDamage: true });
              setGold(prev => prev + totalDmg);
              depsRef.current.addGameLog('magic', `赏金裁决：对 ${monsters[0].name} 造成 ${totalDmg} 点法术伤害，获得 ${totalDmg} 金币`);
              finalizeMagicCard(card, { banner: `赏金裁决：${totalDmg} 点伤害 → ${totalDmg} 金币！${isEchoTriggered ? '（回响×2）' : ''}`, dealtDamage: true });
              return;
            }
            setPendingMagicAction({
              card,
              effect: 'bounty-spell-damage',
              step: 'monster-select',
              echoMultiplier,
              prompt: `选择一个怪物，造成 ${totalDmg} 点法术伤害并获得等量金币。${isEchoTriggered ? '（回响×2）' : ''}`,
            });
            setHeroSkillBanner('赏金裁决：选择目标怪物。');
            return;
          }
          finalizeMagicCard(card, { banner: card.magicEffect || '永久魔法生效。' });
          return;
        }
      }
    } else if (card.skillType === 'permanent') {
      setPermanentSkills(prev => [...prev, card.skillEffect || card.name]);
      
      if (card.name === 'Berserker Rage' || card.name === 'Battle Frenzy') {
        // These are calculated in attackBonus
      }
      
      if (knightCard.classCard) {
        depsRef.current.consumeClassCardFromHand(card.id);
      }
      
      depsRef.current.addToGraveyard(card);
      depsRef.current.removePendingDungeonCard(card.id);
      depsRef.current.removeCard(card.id, false);

      depsRef.current.stagingCardsRef.current =
        depsRef.current.stagingCardsRef.current.filter(c => c.id !== card.id);
      depsRef.current.drainPendingDiscardEffects();
    }
  }

  // ---------------------------------------------------------------------------
  // applyTransformAndUpdateCategory
  // ---------------------------------------------------------------------------

  const applyTransformAndUpdateCategory = (card: GameCardData) => {
    if (card.transformEffect && card.type !== 'event') {
      const prevCat = engine.getState().lastPlayedCardCategory;
      const curCat = getCardPlayCategory(card);
      if (prevCat != null && prevCat !== curCat) {
        if (card.transformEffect === 'graveyard-random-magic') {
          const graveyard = engine.getState().discardedCards;
          const magicCards = graveyard.filter(c => c.type === 'magic');
          if (magicCards.length > 0) {
            const picked = magicCards[Math.floor(Math.random() * magicCards.length)];
            setDiscardedCards(prev => prev.filter(c => c.id !== picked.id));
            depsRef.current.queueCardIntoHand(picked);
            depsRef.current.addGameLog('magic', `转型触发：从坟场获得「${picked.name}」！`);
            setHeroSkillBanner(`转型触发！从坟场获得「${picked.name}」！`);
          } else {
            depsRef.current.addGameLog('magic', '转型触发：坟场没有魔法卡牌。');
            setHeroSkillBanner('转型触发！但坟场没有魔法卡牌。');
          }
        } else if (card.transformEffect?.startsWith('gold:')) {
          const goldAmount = parseInt(card.transformEffect.replace('gold:', ''), 10) || 3;
          setGold(prev => prev + goldAmount);
          depsRef.current.addGameLog('gold', `转型触发：获得 ${goldAmount} 金币！`);
          setHeroSkillBanner(`转型触发！获得 ${goldAmount} 金币！`);
        } else if (card.transformEffect?.startsWith('draw:')) {
          const drawCount = parseInt(card.transformEffect.replace('draw:', ''), 10) || 2;
          for (let i = 0; i < drawCount; i++) {
            depsRef.current.drawFromBackpackToHand();
          }
          depsRef.current.addGameLog('magic', `转型触发：抽取 ${drawCount} 张牌！`);
          setHeroSkillBanner(`转型触发！抽取了 ${drawCount} 张牌！`);
        } else if (card.transformEffect?.startsWith('heal:')) {
          const healAmount = parseInt(card.transformEffect.replace('heal:', ''), 10) || 2;
          setHp(prev => Math.min(prev + healAmount, engine.getState().maxHp));
          depsRef.current.addGameLog('event', `转型触发：恢复 ${healAmount} HP！`);
          setHeroSkillBanner(`转型触发！恢复了 ${healAmount} HP！`);
        } else if (card.transformEffect?.startsWith('recycle-to-hand:')) {
          const count = parseInt(card.transformEffect.replace('recycle-to-hand:', ''), 10) || 1;
          const bag = engine.getState().permanentMagicRecycleBag.filter(c => c.id !== card.id);
          if (bag.length > 0) {
            const shuffled = [...bag].sort(() => Math.random() - 0.5);
            const picks = shuffled.slice(0, Math.min(count, bag.length));
            const pickIds = new Set(picks.map(p => p.id));
            setPermanentMagicRecycleBag(prev => prev.filter(c => !pickIds.has(c.id)));
            for (const pick of picks) {
              depsRef.current.queueCardIntoHand(pick);
            }
            const names = picks.map(p => `「${p.name}」`).join('、');
            depsRef.current.addGameLog('magic', `转型触发：从回收袋取回${names}！`);
            setHeroSkillBanner(`转型触发！从回收袋取回${names}！`);
          } else {
            depsRef.current.addGameLog('magic', '转型触发：回收袋为空。');
            setHeroSkillBanner('转型触发！但回收袋为空。');
          }
        }
      }
    }
    if (card.type !== 'event') {
      setLastPlayedCardCategory(getCardPlayCategory(card));
    }
  };

  // ---------------------------------------------------------------------------
  // handlePlayCardFromHand
  // ---------------------------------------------------------------------------

  const handlePlayCardFromHand = async (card: GameCardData, target?: any) => {
    if (depsRef.current.fullBoardInteractionLockedRef.current || depsRef.current.handLockedForMonsterPhaseRef.current) return;
    depsRef.current.pushUndoSnapshot();

    const handArr = depsRef.current.handCardsRef.current;
    const flankIdx = handArr.findIndex(c => c.id === card.id);
    depsRef.current.lastPlayedFlankRef.current = flankIdx >= 0 && (flankIdx === 0 || flankIdx === handArr.length - 1);

    if (!depsRef.current.consumeCardFromHand(card)) {
      return;
    }

    if (depsRef.current.lastPlayedFlankRef.current && card.flankDraw) {
      for (let i = 0; i < card.flankDraw; i++) {
        depsRef.current.drawFromBackpackToHand();
      }
      depsRef.current.addGameLog('magic', `侧击效果：${card.name} 抽取 ${card.flankDraw} 张牌`);
      setHeroSkillBanner(`侧击！${card.name} 抽取了 ${card.flankDraw} 张牌。`);
    }

    if (depsRef.current.lastPlayedFlankRef.current && card.flankEffectId) {
      if (card.flankEffectId.startsWith('persuadeCost-')) {
        const amount = parseInt(card.flankEffectId.replace('persuadeCost-', ''), 10) || 1;
        const currentMod = engine.getState().persuadeCostModifier ?? 0;
        const currentCost = PERSUADE_COST + currentMod;
        if (currentCost <= MIN_PERSUADE_COST) {
          depsRef.current.addGameLog('event', `劝降费用已达下限（${currentCost} 金币），无法再降低`);
          setHeroSkillBanner(`侧击！${card.name} 劝降费用已达下限，无法再降低。`);
        } else {
          const actualAmount = Math.min(amount, currentCost - MIN_PERSUADE_COST);
          setPersuadeCostModifier(prev => prev - actualAmount);
          depsRef.current.addGameLog('event', `侧击效果：${card.name} 劝降费用永久 -${actualAmount}`);
          setHeroSkillBanner(`侧击！${card.name} 劝降费用永久 -${actualAmount}！`);
        }
      } else if (card.flankEffectId.startsWith('stunCap+')) {
        const amount = parseInt(card.flankEffectId.replace('stunCap+', ''), 10) || 5;
        setStunCap(prev => Math.min(100, prev + amount));
        depsRef.current.addGameLog('event', `侧击效果：${card.name} 击晕上限 +${amount}%`);
        setHeroSkillBanner(`侧击！${card.name} 击晕上限 +${amount}%！`);
      } else if (card.flankEffectId.startsWith('damage:')) {
        const amount = parseInt(card.flankEffectId.replace('damage:', ''), 10) || 5;
        const monsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
        if (monsters.length > 0) {
          const target = monsters[Math.floor(Math.random() * monsters.length)];
          depsRef.current.dealDamageToMonster(target, amount);
          depsRef.current.addGameLog('event', `侧击效果：${card.name} 对 ${target.name} 造成 ${amount} 点伤害`);
          setHeroSkillBanner(`侧击！${card.name} 对 ${target.name} 造成了 ${amount} 点伤害！`);
        } else {
          depsRef.current.addGameLog('event', `侧击效果：${card.name} 没有可攻击的怪物`);
          setHeroSkillBanner(`侧击！但没有可攻击的怪物。`);
        }
      }
    }

    const needsStaging = card.type === 'potion' || card.type === 'magic' || card.type === 'hero-magic';
    if (needsStaging) {
      depsRef.current.stagingCardsRef.current = [...depsRef.current.stagingCardsRef.current, card];
    }

    if (card.type === 'potion') {
      await handlePotionConsumption(card);
    } else if (card.type === 'magic' || card.type === 'hero-magic') {
      depsRef.current.tickRecycleForge();
      handleSkillCard(card);
    } else if (card.type === 'weapon' || card.type === 'shield') {
      const emptySlot = !equipmentSlot1 ? 'equipmentSlot1' : !equipmentSlot2 ? 'equipmentSlot2' : null;
      if (emptySlot) {
        depsRef.current.setEquipmentSlotById(emptySlot, { ...card } as EquipmentItem);
        depsRef.current.addGameLog('equip', `手牌装备：${card.name}（${card.type === 'weapon' ? `${card.value}攻` : `${card.value}防`}）至${emptySlot === 'equipmentSlot1' ? '左' : '右'}槽`);

        if (card.onEquipEffect === 'graveyard-to-hand') {
          const graveyard = engine.getState().discardedCards;
          if (graveyard.length > 0) {
            const idx = Math.floor(Math.random() * graveyard.length);
            const picked = graveyard[idx];
            setDiscardedCards(prev => prev.filter((_, i) => i !== idx));
            depsRef.current.ensureCardInHand(picked);
            depsRef.current.addGameLog('equip', `${card.name} 入场效果：从坟场获得了「${picked.name}」！`);
          } else {
            depsRef.current.addGameLog('equip', `${card.name} 入场效果：坟场没有可用的牌。`);
          }
        }
        if (card.onEquipEffect === 'temp-attack-2') {
          setSlotTempAttack(prev => ({ ...prev, [emptySlot]: (prev[emptySlot] ?? 0) + 2 }));
          depsRef.current.addGameLog('equip', `${card.name} 入场效果：该装备栏临时攻击 +2！`);
        }
        if (card.onEquipEffect === 'all-temp-attack-2') {
          setSlotTempAttack(prev => ({
            equipmentSlot1: (prev.equipmentSlot1 ?? 0) + 2,
            equipmentSlot2: (prev.equipmentSlot2 ?? 0) + 2,
          }));
          depsRef.current.addGameLog('equip', `${card.name} 入场效果：所有装备栏临时攻击 +2！`);
        }
        if (card.onEquipEffect === 'temp-armor-3') {
          setSlotTempArmor(prev => ({ ...prev, [emptySlot]: (prev[emptySlot] ?? 0) + 3 }));
          depsRef.current.addGameLog('equip', `${card.name} 入场效果：该装备栏临时护甲 +3！`);
        }
        if (card.onEquipEffect === 'persuade-bonus-10') {
          depsRef.current.persuadeAmuletBonusRef.current += 10;
          depsRef.current.addGameLog('equip', `${card.name} 入场效果：下次劝降成功率 +10%（累计 +${depsRef.current.persuadeAmuletBonusRef.current}%）`);
        }
        if (card.onEquipEffect === 'spell-lifesteal+1') {
          setPermanentSpellLifesteal(prev => prev + 1);
          depsRef.current.addGameLog('equip', `${card.name} 入场效果：超杀吸血 +1！`);
        }
        if (card.onEquipEffect === 'stunCap+5') {
          setStunCap(prev => Math.min(100, prev + 5));
          depsRef.current.addGameLog('equip', `${card.name} 入场效果：击晕上限 +5%！`);
        }
        if (card.onEquipEffect === 'perm-slot-damage+1') {
          depsRef.current.setEquipmentSlotBonus(emptySlot, 'damage', cur => cur + 1);
          depsRef.current.addGameLog('equip', `${card.name} 入场效果：该装备栏永久攻击 +1！`);
        }
        if (card.onEquipEffect === 'heal-3') {
          const healed = depsRef.current.healHero(3);
          depsRef.current.addGameLog('equip', `${card.name} 入场效果：恢复了 ${healed} 点生命！`);
        }
        if (card.onEquipEffect === 'other-slot-durability+1') {
          const otherSlotId: EquipmentSlotId = emptySlot === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
          const otherItem = otherSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
          if (otherItem && otherItem.durability != null && otherItem.maxDurability != null) {
            const newDur = Math.min(otherItem.maxDurability, otherItem.durability + 1);
            if (newDur > otherItem.durability) {
              depsRef.current.setEquipmentSlotById(otherSlotId, { ...otherItem, durability: newDur });
              depsRef.current.addGameLog('equip', `${card.name} 入场效果：${otherItem.name} 耐久 +1（${otherItem.durability} → ${newDur}）`);
            } else {
              depsRef.current.addGameLog('equip', `${card.name} 入场效果：${otherItem.name} 已满耐久。`);
            }
          } else {
            depsRef.current.addGameLog('equip', `${card.name} 入场效果：另一个装备栏没有装备。`);
          }
        }
        if (hasEternalRelic(eternalRelics, 'equip-empower')) {
          setSlotTempAttack(prev => ({ ...prev, [emptySlot]: (prev[emptySlot] ?? 0) + 3 }));
          setSlotTempArmor(prev => ({ ...prev, [emptySlot]: (prev[emptySlot] ?? 0) + 3 }));
          depsRef.current.addGameLog('equip', `铸锋药剂：${card.name} 装备时，该装备栏临时攻击 +3，临时护甲 +3！`);
        }
      } else {
        depsRef.current.addGameLog('equip', `装备失败：没有空槽位（${card.name}）`);
      }
    }

    applyTransformAndUpdateCategory(card);
  };

  // ---------------------------------------------------------------------------
  // Return bag
  // ---------------------------------------------------------------------------

  return {
    // Spell damage
    getSpellDamage,

    // Hero magic helpers
    updateHeroMagicStateById,
    unlockHeroMagic,
    resetHeroMagicGauge,
    setHeroMagicUsedThisWave,
    completeHeroMagicActivation,
    applyBerserkerRageEffect,
    triggerGraveNova,

    // Finalize helpers
    finalizeMagicCard,
    finalizePotionCard,
    resolvePotionRepairForSlot,
    repairEquipmentDurability,

    // Potion
    handlePotionConsumption,

    // Card play flow
    handleSkillCard,
    handleHeroMagicCard,
    handleKnightInstantMagic,
    handleKnightPermanentMagic,
    handlePlayCardFromHand,
    applyTransformAndUpdateCategory,

    // Internal helpers exposed for GameBoard
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
  };
}
