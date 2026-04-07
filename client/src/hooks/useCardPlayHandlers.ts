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
  DUNGEON_COLUMN_COUNT,
  HAND_LIMIT,
  createEmptyActiveRow,
} from '@/game-core/constants';
import {
  getRandomInt,
  formatRepairTargetLabel,
  flattenActiveRowSlots,
  sanitizeCardMetadata,
  logHeroMagic,
} from '@/game-core/helpers';
import { damageMonsterWithLayerOverflow, chaosStrikeHasOverkill } from '@/game-core/combat';
import type { MirrorCopySelection } from '@/game-core/types';

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
  dealDamageToMonster: (monster: GameCardData, damage: number, options?: { animationDelay?: number; pulses?: number }) => void;
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
    options?: { filter?: (card: GameCardData) => boolean },
  ) => boolean;
  discoverPotionCompletionRef: React.MutableRefObject<((payload: { banner: string }) => void) | null>;
  getAttackBonus: () => number;
  applyHonorSweepMagic: (card: GameCardData, slotId: EquipmentSlotId) => void;
  generateShopOfferings: () => any[];
  queueMonsterReward: (monster: GameCardData) => void;

  // --- Animation / UI callbacks from GameBoard ---
  addGameLog: (type: LogEntryType, message: string) => void;
  pushUndoSnapshot: () => void;
  clearUndoStack: () => void;
  removeCard: (cardId: string, animate: boolean, opts?: { skipAutoDraw?: boolean }) => void;
  queueCardIntoHand: (card: GameCardData, sourceHint?: FlightSourceHint) => void;
  triggerDiscardFlight: (card: GameCardData, destination: 'graveyard' | 'recycle-bag') => Promise<void>;
  triggerClassDeckFlight: (cards: GameCardData[]) => void;
  triggerGraveNova: () => void;
  triggerWaterfall: () => void;
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
  const setBulwarkPassiveActive = useEngineSetter('bulwarkPassiveActive');
  const setBulwarkTempArmorStacks = useEngineSetter('bulwarkTempArmorStacks');
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
  const setPersuadeCostModifier = useEngineSetter('persuadeCostModifier');

  // -- Convenience accessors -------------------------------------------------

  const addGameLog = (type: LogEntryType, message: string) =>
    depsRef.current.addGameLog(type, message);

  // -- Spell damage ----------------------------------------------------------

  const getSpellDamage = useCallback(
    (baseDamage: number) => Math.max(0, baseDamage + permanentSpellDamageBonus),
    [permanentSpellDamageBonus],
  );

  // -- Fate Sight resolution helper -------------------------------------------

  const resolveFateSight = (card: GameCardData, target: GameCardData, baseDmg: number, peekCount: number) => {
    const totalDamage = getSpellDamage(baseDmg);
    if (!depsRef.current.isMonsterEngaged(target.id)) depsRef.current.beginCombat(target, 'hero');
    depsRef.current.dealDamageToMonster(target, totalDamage, { pulses: 2 });

    const deck = engine.getState().remainingDeck;
    const peekedCards = deck.slice(0, Math.min(peekCount, deck.length));
    const monsterCount = peekedCards.filter(c => c.type === 'monster').length;
    const stunChance = Math.min(monsterCount * 20, 100);

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
              const idx = Math.floor(Math.random() * prev.length);
              const picked = prev[idx];
              setHandCards(hand => [...hand, picked]);
              addGameLog('equip', `击晕回收：从回收袋取回「${picked.name}」到手牌`);
              return prev.filter((_, i) => i !== idx);
            });
          }

          if (depsRef.current.amuletEffects.hasStunUpgradeCap) {
            const stunAmulet = engine.getState().amuletSlots.find(s => s?.amuletEffect === 'stun-upgrade-cap');
            const stunStep = (stunAmulet?.upgradeLevel ?? 0) >= 1 ? 10 : 5;
            setStunCap(prev => {
              const next = Math.min(100, prev + stunStep);
              addGameLog('amulet', `震慑之符：击晕成功，击晕上限 +${stunStep}%（当前 ${next}%）`);
              return next;
            });
          }
        }
        const stunText = stunResult?.id === 'stun' ? `击晕了 ${target.name}！` : `未能击晕 ${target.name}。`;
        finalizeMagicCard(card, {
          banner: `天眼审判：对 ${target.name} 造成 ${totalDamage} 点伤害。透视 ${peekedCards.length} 张牌，发现 ${monsterCount} 张怪物牌（${stunChance}%）。${stunText}`,
        });
      };
    } else {
      const banner = `天眼审判：对 ${target.name} 造成 ${totalDamage} 点伤害。透视 ${peekedCards.length} 张牌，${monsterCount > 0 ? `发现 ${monsterCount} 张怪物牌。` : '未发现怪物牌。'}`;
      finalizeMagicCard(card, { banner });
    }
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

  const triggerGraveNova = useCallback(() => {
    const monsters = flattenActiveRowSlots(depsRef.current.activeCardsLatestRef.current).filter(
      (card): card is GameCardData => Boolean(card && card.type === 'monster'),
    );
    if (!monsters.length) {
      setHeroSkillBanner('殉烈爆鸣没有目标。');
      return;
    }
    const dmg = getSpellDamage(3);
    addGameLog('combat', `殉烈爆鸣：对 ${monsters.map(m => m.name).join('、')} 各造成 ${dmg} 点法术伤害`);
    monsters.forEach(monster => {
      depsRef.current.dealDamageToMonster(monster, dmg, { pulses: 2 });
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
    (card: GameCardData, options?: { banner?: string }) => {
      depsRef.current.addGameLog('magic', `${card.type === 'hero-magic' ? '英雄魔法' : '魔法'}：${card.name}${options?.banner ? ` — ${options.banner}` : ''}`);
      if (options?.banner) {
        setHeroSkillBanner(options.banner);
      }

      if (card.type === 'hero-magic') {
        logHeroMagic('finalize-card', { cardId: card.id, name: card.name });
      }

      if (isPermanentMagicCard(card)) {
        depsRef.current.addPermanentMagicToRecycleBag(card);
      } else {
        depsRef.current.addToGraveyard(card);
      }

      depsRef.current.removeCard(card.id, false);
      setPendingMagicAction(null);
      depsRef.current.echoRemainingRef.current = 0;

      depsRef.current.stagingCardsRef.current =
        depsRef.current.stagingCardsRef.current.filter(c => c.id !== card.id);
      depsRef.current.drainPendingDiscardEffects();
    },
    [setHeroSkillBanner],
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
      const sourceCard = depsRef.current.stagingCardsRef.current.find(c => c.id === modal.sourceCardId);
      if (!sourceCard) return;
      const targetCard = engine.getState().handCards.find(c => c.id === targetCardId);
      if (!targetCard || cardHasPermFlag(targetCard)) return;
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
    const sourceCard = depsRef.current.stagingCardsRef.current.find(c => c.id === modal.sourceCardId);
    if (!sourceCard) return;
    if (modal.sourceType === 'potion') {
      void finalizePotionCard(sourceCard, { banner: '取消了永恒铭刻。' });
    } else {
      finalizeMagicCard(sourceCard, { banner: '取消了永恒铭刻。' });
    }
  }, [engine, setPermGrantModal, finalizePotionCard, finalizeMagicCard]);

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
        const diceResult = await depsRef.current.requestDiceOutcome({
          title: card.name,
          subtitle: '掷骰决定灵药效果',
          entries: [
            { id: 'bp-amulet', range: [1, 5] as [number, number], label: '护符上限 +1', effect: 'amuletCapacity+1' },
            { id: 'bp-left', range: [6, 10] as [number, number], label: '左装备栏容量 +1', effect: 'equipSlot1Capacity+1' },
            { id: 'bp-right', range: [11, 15] as [number, number], label: '右装备栏容量 +1', effect: 'equipSlot2Capacity+1' },
            { id: 'bp-bag', range: [16, 20] as [number, number], label: '背包容量 +3', effect: 'backpackSize+3' },
          ],
        });
        if (!diceResult) return;
        const rolledEffect = normalizeEventEffect(diceResult.effect)[0];
        if (rolledEffect === 'amuletCapacity+1') {
          setMaxAmuletSlots(prev => prev + 1);
        } else if (rolledEffect === 'equipSlot1Capacity+1') {
          setEquipmentSlotCapacity(prev => ({ ...prev, equipmentSlot1: prev.equipmentSlot1 + 1 }));
        } else if (rolledEffect === 'equipSlot2Capacity+1') {
          setEquipmentSlotCapacity(prev => ({ ...prev, equipmentSlot2: prev.equipmentSlot2 + 1 }));
        } else if (rolledEffect === 'backpackSize+3') {
          setBackpackCapacityModifier(prev => prev + 3);
        }
        depsRef.current.addGameLog('potion', `灵药效果：${diceResult.label}`);
        await finalizePotionCard(card, { banner: diceResult.label });
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

      if (effect === 'left-slot-durability-max+1') {
        const leftSlot = equipmentSlot1;
        if (!leftSlot || leftSlot.durability == null) {
          await finalizePotionCard(card, { banner: '左装备栏没有装备，药剂失效。' });
          return;
        }
        const maxDur = leftSlot.maxDurability ?? leftSlot.durability ?? 0;
        depsRef.current.setEquipmentSlotById('equipmentSlot1', { ...leftSlot, maxDurability: maxDur + 1 });
        depsRef.current.addGameLog('potion', `淬炼药剂：${leftSlot.name} 耐久上限 +1（${maxDur} → ${maxDur + 1}）`);
        await finalizePotionCard(card, { banner: `${leftSlot.name} 耐久上限 +1！` });
        return;
      }

      if (effect === 'right-slot-durability-max+1') {
        const rightSlot = equipmentSlot2;
        if (!rightSlot || rightSlot.durability == null) {
          await finalizePotionCard(card, { banner: '右装备栏没有装备，药剂失效。' });
          return;
        }
        const maxDur = rightSlot.maxDurability ?? rightSlot.durability ?? 0;
        depsRef.current.setEquipmentSlotById('equipmentSlot2', { ...rightSlot, maxDurability: maxDur + 1 });
        depsRef.current.addGameLog('potion', `淬炼药剂（右）：${rightSlot.name} 耐久上限 +1（${maxDur} → ${maxDur + 1}）`);
        await finalizePotionCard(card, { banner: `${rightSlot.name} 耐久上限 +1！` });
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

      if (effect === 'end-turn-draw-2') {
        if (!permanentSkills.includes('疾汲秘药')) {
          setPermanentSkills(prev => [...prev, '疾汲秘药']);
          depsRef.current.addGameLog('potion', '疾汲秘药：英雄回合结束时抽牌提升为 2 张！');
          await finalizePotionCard(card, { banner: '疾汲秘药生效！回合结束时将抽 2 张牌。' });
        } else {
          depsRef.current.addGameLog('potion', '疾汲秘药：效果已存在，无法叠加。');
          await finalizePotionCard(card, { banner: '效果已存在，无法叠加。' });
        }
        return;
      }

      if (effect === 'perm-persuade-consecutive') {
        if (!permanentSkills.includes('连劝秘药')) {
          setPermanentSkills(prev => [...prev, '连劝秘药']);
          depsRef.current.addGameLog('potion', '连劝秘药：连续劝降同一个怪物时成功率 +15%！');
          await finalizePotionCard(card, { banner: '连劝秘药生效！连续劝降同一怪物概率 +15%。' });
        } else {
          depsRef.current.addGameLog('potion', '连劝秘药：效果已存在，无法叠加。');
          await finalizePotionCard(card, { banner: '效果已存在，无法叠加。' });
        }
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

      if (effect === 'discover-class-magic') {
        const isClassMagic = (c: GameCardData) => c.type === 'magic' || c.type === 'hero-magic';
        const result = await new Promise<{ banner: string } | null>(resolve => {
          depsRef.current.discoverPotionCompletionRef.current = payload => {
            depsRef.current.discoverPotionCompletionRef.current = null;
            resolve(payload);
          };
          const started = depsRef.current.beginDiscoverFlow('potion-class-magic', { filter: isClassMagic });
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
          depsRef.current.applyDamage(hpLoss);
        }
        const lvl = card.upgradeLevel ?? 0;
        const buffAmounts = [0, 4, 8, 8];
        const extraPerSlot = lvl >= 3 ? 2 : 1;
        const buffAmt = buffAmounts[lvl] ?? 8;
        if (buffAmt > 0) {
          depsRef.current.addBerserkTurnBuff(buffAmt);
          if (depsRef.current.amuletEffects.hasPersuadeOnTempAttack) {
            depsRef.current.persuadeAmuletBonusRef.current += 5;
            depsRef.current.addGameLog('equip', `怀柔之印：下次劝降率 +5%（累计 +${depsRef.current.persuadeAmuletBonusRef.current}%）`);
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
      case 'monster-recruit': {
        const monsters = discardedCards.filter(c => c.type === 'monster');
        if (monsters.length === 0) {
          depsRef.current.consumeClassCardFromHand(card.id);
          finalizeMagicCard(card, { banner: '坟场中没有怪物牌。' });
          return true;
        }
        depsRef.current.consumeClassCardFromHand(card.id);
        void resolveMonsterRecruit(card, monsters);
        return true;
      }
      case 'persuade-discount': {
        const costDiscount = 2 * ((card.upgradeLevel ?? 0) + 1);
        const rateBonus = 10 * ((card.upgradeLevel ?? 0) + 1);
        setPersuadeCostModifier(prev => prev - costDiscount);
        depsRef.current.persuadeDiscountRef.current = {
          costReduction: 0,
          rateBonus,
        };
        if (card.classCard) depsRef.current.consumeClassCardFromHand(card.id);
        finalizeMagicCard(card, { banner: `怀柔令发动：劝降费用永久 -${costDiscount}，下次劝降成功率 +${rateBonus}%！` });
        return true;
      }
      case 'monster-fusion': {
        const activeMonsters = flattenActiveRowSlots(activeCards).filter(c => c?.type === 'monster');
        const typeGroups: Record<string, typeof activeMonsters> = {};
        activeMonsters.forEach(m => {
          const key = m.monsterType ?? m.name;
          if (!typeGroups[key]) typeGroups[key] = [];
          typeGroups[key].push(m);
        });
        const fusibleGroups = Object.entries(typeGroups).filter(([, g]) => g.length >= 2);
        if (fusibleGroups.length === 0) {
          setHeroSkillBanner('激活行没有可融合的同种怪物（需要至少 2 只同种怪物）。');
          return true;
        }
        const [groupName, group] = fusibleGroups.reduce(
          (best, cur) => (cur[1].length >= best[1].length ? cur : best),
          fusibleGroups[0],
        );
        depsRef.current.consumeClassCardFromHand(card.id);
        const fusionCount = group.length;
        const totalAtk = group.reduce((s, m) => s + (m.attack ?? m.value), 0);
        const totalHp = group.reduce((s, m) => s + (m.hp ?? m.value), 0);
        const totalLayers = group.reduce((s, m) => s + (m.fury ?? m.hpLayers ?? 1), 0);

        group.forEach(m => {
          const idx = activeCards.findIndex(c => c?.id === m.id);
          if (idx >= 0) {
            setActiveCards(prev => {
              const next = [...prev];
              next[idx] = null;
              return next;
            });
          }
        });

        if (fusionCount >= 3) {
          const skeletonKing: GameCardData = {
            id: `fusion-king-${Date.now()}`,
            type: 'monster',
            name: 'Skeleton King',
            monsterType: 'Skeleton',
            value: totalAtk + 5,
            attack: totalAtk + 5,
            hp: totalHp + 10,
            maxHp: totalHp + 10,
            fury: Math.min(4, totalLayers + 1),
            hpLayers: Math.min(4, totalLayers + 1),
            currentLayer: Math.min(4, totalLayers + 1),
            image: group[0].image,
            monsterSpecial: 'skeleton-king',
            monsterSpecialDesc: '骷髅王：隐藏Boss。击杀奖励丰厚。',
            description: '隐藏Boss「骷髅王」，由三只同种怪物融合而成。',
            hasRevive: true,
          };
          const emptyIdx = activeCards.findIndex(c => !c);
          if (emptyIdx >= 0) {
            setActiveCards(prev => {
              const next = [...prev];
              next[emptyIdx] = skeletonKing;
              return next;
            });
          }
          finalizeMagicCard(card, { banner: `${fusionCount} 只 ${groupName} 融合为隐藏Boss「骷髅王」！` });
        } else {
          const eliteName = `Elite ${groupName}`;
          const eliteMonster: GameCardData = {
            id: `fusion-elite-${Date.now()}`,
            type: 'monster',
            name: eliteName,
            monsterType: groupName,
            value: totalAtk + 2,
            attack: totalAtk + 2,
            hp: totalHp + 5,
            maxHp: totalHp + 5,
            fury: Math.min(4, totalLayers),
            hpLayers: Math.min(4, totalLayers),
            currentLayer: Math.min(4, totalLayers),
            image: group[0].image,
            monsterSpecial: 'fusion-elite',
            monsterSpecialDesc: '融合精英：由两只同种怪物融合而成。',
            description: '精英怪物，由两只同种怪物融合而成。',
          };
          const emptyIdx = activeCards.findIndex(c => !c);
          if (emptyIdx >= 0) {
            setActiveCards(prev => {
              const next = [...prev];
              next[emptyIdx] = eliteMonster;
              return next;
            });
          }
          finalizeMagicCard(card, { banner: `2 只 ${groupName} 融合为精英怪物「${eliteName}」！` });
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
      case 'missile-bolt': {
        const monsters = flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster');
        if (monsters.length === 0) {
          finalizeMagicCard(card, { banner: '魔弹无效（没有怪物）。' });
          return true;
        }
        if (monsters.length === 1) {
          const boltDmg = getSpellDamage(2);
          if (!depsRef.current.isMonsterEngaged(monsters[0].id)) depsRef.current.beginCombat(monsters[0], 'hero');
          depsRef.current.dealDamageToMonster(monsters[0], boltDmg, { pulses: 2 });
          depsRef.current.addGameLog('magic', `魔弹：对 ${monsters[0].name} 造成 ${boltDmg} 点法术伤害`);
          finalizeMagicCard(card, { banner: `魔弹：对 ${monsters[0].name} 造成 ${boltDmg} 点伤害！` });
          return true;
        }
        setPendingMagicAction({
          card,
          effect: 'missile-bolt',
          step: 'monster-select',
          prompt: `选择一个怪物，造成 ${getSpellDamage(2)} 点法术伤害。`,
        });
        setHeroSkillBanner(`选择一个怪物，造成 ${getSpellDamage(2)} 点法术伤害。`);
        return true;
      }
      default:
        return false;
    }
  };

  // ---------------------------------------------------------------------------
  // handleKnightPermanentMagic
  // ---------------------------------------------------------------------------

  const handleKnightPermanentMagic = (card: KnightCardData): boolean => {
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
          const monsters = flattenActiveRowSlots(activeCards).filter(c => c?.type === 'monster');
          if (monsters.length === 1) {
            const totalDamage = getSpellDamage(scaledArmor);
            if (!depsRef.current.isMonsterEngaged(monsters[0].id)) depsRef.current.beginCombat(monsters[0], 'hero');
            depsRef.current.dealDamageToMonster(monsters[0], totalDamage, { pulses: 2 });
            finalizeMagicCard(card, { banner: `御甲破击造成 ${totalDamage} 点伤害（护甲 ${armorPct}%）。` });
            return true;
          }
          setPendingMagicAction({
            card,
            effect: 'armor-strike',
            step: 'monster-select',
            slotId,
            pendingDamage: scaledArmor,
            prompt: `选择一个怪物，承受 ${getSpellDamage(scaledArmor)} 点护甲伤害。`,
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
        const shieldSlots = depsRef.current.getEquipmentSlots().filter(slot => slot.item?.type === 'shield' || slot.item?.type === 'monster');
        depsRef.current.consumeClassCardFromHand(card.id);
        if (shieldSlots.length === 0) {
          finalizeMagicCard(card, { banner: '没有护盾可供选择。' });
          return true;
        }
        if (shieldSlots.length === 1) {
          const slotId = shieldSlots[0].id;
          const armorValue = depsRef.current.calculateSlotArmorValue(slotId);
          const stunGain = Math.min(armorValue, 100 - stunCap);
          if (stunGain > 0) {
            setStunCap(prev => Math.min(100, prev + armorValue));
          }
          const tempArmor = gs.slotTempArmor[slotId] ?? 0;
          if (tempArmor > 0) {
            setSlotTempArmor(prev => ({ ...prev, [slotId]: 0 }));
          }
          addGameLog('magic', `护甲凝雷：护甲 ${armorValue} → 击晕上限 +${stunGain}%`);
          finalizeMagicCard(card, { banner: `护甲 ${armorValue} 点 → 击晕上限 +${stunGain}%！${tempArmor > 0 ? ` 临时护甲 ${tempArmor} 已清除。` : ''}` });
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
        const monsters = flattenActiveRowSlots(activeCards).filter(c => c?.type === 'monster');
        depsRef.current.consumeClassCardFromHand(card.id);
        if (monsters.length === 0) {
          finalizeMagicCard(card, { banner: '当前没有可攻击的怪物。' });
          return true;
        }
        if (monsters.length === 1) {
          const missingHp = Math.max(0, maxHp - hp);
          const scaledDmg = Math.floor(missingHp * smitePct / 100);
          const totalDamage = getSpellDamage(scaledDmg);
          if (totalDamage <= 0) {
            finalizeMagicCard(card, { banner: '你处于满血状态，没有造成伤害。' });
            return true;
          }
          if (!depsRef.current.isMonsterEngaged(monsters[0].id)) depsRef.current.beginCombat(monsters[0], 'hero');
          depsRef.current.dealDamageToMonster(monsters[0], totalDamage, { pulses: 2 });
          finalizeMagicCard(card, { banner: `残血裁决释放 ${totalDamage} 点伤害（${smitePct}%）。` });
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
            description: '每使用或弃回 5 张牌，将回收袋里的卡牌放回背包，然后抽 2 张牌。(可超手牌上限) [0/5]',
            amuletEffect: 'recycle-forge',
            recycleDelay: 1,
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
        const monsters = flattenActiveRowSlots(activeCards).filter(c => c?.type === 'monster');
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
      case 'soft-waterfall': {
        depsRef.current.consumeClassCardFromHand(card.id);

        const curPreview = engine.getState().previewCards;
        const curActive = engine.getState().activeCards;
        const curDeck = engine.getState().remainingDeck;

        const emptySlots: number[] = [];
        for (let i = 0; i < DUNGEON_COLUMN_COUNT; i++) {
          if (!curActive[i]) emptySlots.push(i);
        }

        if (emptySlots.length === 0) {
          finalizeMagicCard(card, { banner: '暗流涌动：激活行没有空位，无法触发。' });
          return true;
        }

        const newActive = [...curActive] as ActiveRowSlots;
        const newPreview = [...curPreview] as ActiveRowSlots;
        const droppedSlots: number[] = [];

        for (const slot of emptySlots) {
          const previewCard = curPreview[slot];
          if (previewCard) {
            newActive[slot] = previewCard;
            newPreview[slot] = null;
            droppedSlots.push(slot);
          }
        }

        const dealCount = Math.min(droppedSlots.length, curDeck.length);
        const dealtCards = curDeck.slice(0, dealCount);
        const newDeck = curDeck.slice(dealCount);

        for (let i = 0; i < dealtCards.length; i++) {
          newPreview[droppedSlots[i]] = dealtCards[i];
        }

        setActiveCards(newActive);
        setPreviewCards(newPreview);
        setRemainingDeck(newDeck);

        const msg = droppedSlots.length > 0
          ? `暗流涌动：${droppedSlots.length} 张预览牌落入空位，补充了 ${dealCount} 张新预览牌。`
          : '暗流涌动：预览行对应空位没有牌可落下。';
        depsRef.current.addGameLog('magic', msg);
        finalizeMagicCard(card, { banner: msg });
        return true;
      }
      default:
        return false;
    }
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
    const peekedCards = deck.slice(0, Math.min(5, deck.length));
    const monsterCount = peekedCards.filter(c => c.type === 'monster').length;

    depsRef.current.setDeckPeekState({
      mode: 'deck-judge-delete',
      peekedCards,
      monsterCount,
      deleteCount: monsterCount,
    });

    await new Promise<void>(resolve => {
      depsRef.current.deckJudgePeekCloseRef.current = () => resolve();
    });

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

    if (monsterCount === 0) {
      finalizeMagicCard(card, {
        banner: `翻看主牌堆顶 ${peekedCards.length} 张，无怪物牌，无需删牌。`,
      });
      return;
    }

    if (toDelete === 0) {
      finalizeMagicCard(card, {
        banner: `透视到 ${monsterCount} 张怪物牌，但当前没有可删除的牌。`,
      });
      return;
    }

    const success = await depsRef.current.requestCardAction('delete', toDelete, {
      title: '命数裁断：删除卡牌',
      description: `删除 ${toDelete} 张牌，将其送入坟场并永久移出构筑（不足时按可删数量执行）。`,
    });

    const part = success
      ? `已删除 ${toDelete} 张牌。`
      : '删牌未完成。';
    finalizeMagicCard(card, {
      banner: `翻看牌堆顶 ${peekedCards.length} 张，其中 ${monsterCount} 张怪物；${part}`,
    });
  };

  const resolveMonsterRecruit = async (card: GameCardData, monsters: GameCardData[]) => {
    const shuffled = [...monsters].sort(() => Math.random() - 0.5);
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
      finalizeMagicCard(card, { banner: `亡者之契：从坟场召唤了「${selected.name}」加入手牌！` });
    } else {
      finalizeMagicCard(card, { banner: '未选择怪物。' });
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
        const started = depsRef.current.beginDiscoverFlow('chaos-dice');
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
          (entry): entry is GameCardData => Boolean(entry && entry.type === 'monster'),
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
        depsRef.current.dealDamageToMonster(target, burstDamage, { pulses: 2 });
        depsRef.current.dealDamageToMonster(target, burstDamage, {
          pulses: 2,
          animationDelay: Math.floor(COMBAT_ANIMATION_STAGGER / 2),
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
  // handleSkillCard  (~1,058 lines)
  // ---------------------------------------------------------------------------

  async function handleSkillCard(card: GameCardData) {
    const handCards = [...depsRef.current.handCardsRef.current];
    const knightCard = card as KnightCardData;
    
    if (card.isCurse && knightCard.knightEffect === 'greed-curse') {
      setGold(prev => Math.max(0, prev - 3));
      finalizeMagicCard(card, { banner: '贪婪诅咒消耗了 3 金币。' });
      return;
    }
    if (card.isCurse) {
      depsRef.current.applyDamage(3);
      finalizeMagicCard(card, { banner: '血咒吸取了 3 点生命。' });
      return;
    }

    const isEchoTriggered = doubleNextMagic && card.type === 'magic' && card.magicEffect !== 'double-next-magic';
    if (isEchoTriggered) {
      setDoubleNextMagic(false);
      depsRef.current.addGameLog('magic', `法术回响：${card.name} 的效果将触发两次！`);
      setHeroSkillBanner(`法术回响！${card.name} 效果触发两次！`);
    }
    const echoMultiplier = isEchoTriggered ? 2 : 1;

    if (card.magicEffect === 'honor-blood') {
      depsRef.current.applyDamage(1);
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
          const monsters = flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster');
          if (monsters.length === 0) {
            finalizeMagicCard(card, { banner: '风暴箭雨无效（没有怪物）。' });
            return;
          }
          const volleyDamage = getSpellDamage(3) * echoMultiplier;
          monsters.forEach((monster, index) => {
            if (!depsRef.current.isMonsterEngaged(monster.id)) {
              depsRef.current.beginCombat(monster, 'hero');
            }
            const animationDelay = index * Math.floor(COMBAT_ANIMATION_STAGGER * 0.75);
            depsRef.current.dealDamageToMonster(monster, volleyDamage, { animationDelay, pulses: 2 });
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
          finalizeMagicCard(card, { banner: `风暴箭雨对每只怪物造成 ${volleyDamage} 点伤害！${isEchoTriggered ? '（回响×2）' : ''}` });
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
            subtitle: '选择一个被动效果',
            options: [
              {
                id: 'waterfall-armor',
                label: '瀑流铸剑',
                description: '被动：每次攻击时，该装备栏临时攻击 +2。',
              },
              {
                id: 'block-temp-armor',
                label: '格挡铸甲',
                description: '被动：每次格挡时，该装备栏获得 2 点临时护甲。',
              },
            ],
          });
          if (choiceId === 'waterfall-armor') {
            const newStacks = bulwarkPassiveActive + 1;
            setBulwarkPassiveActive(newStacks);
            if (!permanentSkills.includes('潮涌铸甲')) {
              setPermanentSkills(prev => [...prev, '潮涌铸甲']);
            }
            const stackLabel = newStacks > 1 ? `（×${newStacks}层）` : '';
            const tempGain = 2 * newStacks;
            depsRef.current.addGameLog('magic', `潮涌铸甲·瀑流铸剑激活${stackLabel}：之后每次攻击，该装备栏临时攻击 +${tempGain}`);
            finalizeMagicCard(card, { banner: `瀑流铸剑激活${stackLabel}！每次攻击，该装备栏临时攻击 +${tempGain}。` });
          } else {
            const newStacks = bulwarkTempArmorStacks + 1;
            setBulwarkTempArmorStacks(newStacks);
            if (!permanentSkills.includes('潮涌铸甲')) {
              setPermanentSkills(prev => [...prev, '潮涌铸甲']);
            }
            const stackLabel = newStacks > 1 ? `（×${newStacks}层）` : '';
            const tempGain = 2 * newStacks;
            depsRef.current.addGameLog('magic', `潮涌铸甲·格挡铸甲激活${stackLabel}：之后每次格挡，该装备栏临时护甲 +${tempGain}`);
            finalizeMagicCard(card, { banner: `格挡铸甲激活${stackLabel}！每次格挡，该装备栏临时护甲 +${tempGain}。` });
          }
          return;
        }
        case '点金裁决': {
          const monsters = flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster');
          if (monsters.length === 0) {
            finalizeMagicCard(card, { banner: '点金裁决无效（没有怪物）。' });
            return;
          }
          if (monsters.length === 1) {
            const totalDamage = getSpellDamage(gold) * echoMultiplier;
            if (!depsRef.current.isMonsterEngaged(monsters[0].id)) depsRef.current.beginCombat(monsters[0], 'hero');
            depsRef.current.dealDamageToMonster(monsters[0], totalDamage, { pulses: 2 });
            const healed = depsRef.current.healHero(totalDamage);
            const healText = healed > 0 ? `，恢复 ${healed} 点生命` : '';
            finalizeMagicCard(card, { banner: `点金裁决造成 ${totalDamage} 点伤害${healText}！${isEchoTriggered ? '（回响×2）' : ''}` });
            return;
          }
          setPendingMagicAction({
            card,
            effect: 'blood-reckoning',
            step: 'monster-select',
            echoMultiplier,
            prompt: `选择一个怪物，造成 ${getSpellDamage(gold) * echoMultiplier} 点伤害并恢复等量生命。${isEchoTriggered ? '（回响×2）' : ''}`,
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
            depsRef.current.applyDamage(3);
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
            depsRef.current.applyDamage(5);
            setGold(prev => prev + 10);
            depsRef.current.addGameLog('skill', '以血换力：失去 5 点生命，获得 10 金币');
          }
          break;
        case 'Crimson Shield':
          if (hp > 2) {
            depsRef.current.applyDamage(2);
            setTempShield(prev => prev + 6);
            depsRef.current.addGameLog('skill', '血色之盾：失去 2 点生命，临时护盾 +6');
          }
          break;
        case 'Life Transfer':
          if (hp > 3) {
            depsRef.current.applyDamage(3);
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
          finalizeMagicCard(card, { banner: '秘法精炼：选择一张魔法牌进行升级。' });
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
      }
      
      if (knightCard.classCard) {
        depsRef.current.consumeClassCardFromHand(card.id);
      }
      
      depsRef.current.addToGraveyard(card);
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
        depsRef.current.applyDamage(hpCost);
        const result = await performReturnToHand();
        if (result.success) {
          depsRef.current.addGameLog('magic', `紧急回收：失去 ${hpCost} HP，${result.itemName} 从${result.slotLabel}回到手牌`);
          finalizeMagicCard(card, { banner: `紧急回收：失去 ${hpCost} HP，${result.itemName} 已回到手牌！` });
        } else {
          finalizeMagicCard(card, { banner: `紧急回收：失去 ${hpCost} HP，回手取消。` });
        }
        return;
      }
      if (handleKnightPermanentMagic(knightCard)) {
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
        const chaosMons = flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster' || c.type === 'building');
        if (chaosMons.length === 0) {
          finalizeMagicCard(card, { banner: '混沌冲击无效（没有怪物）。' });
          return;
        }
        if (chaosMons.length === 1 && echoMultiplier <= 1) {
          const target = chaosMons[0];
          if (!depsRef.current.isMonsterEngaged(target.id)) depsRef.current.beginCombat(target, 'hero');
          const chaosDamage = getSpellDamage(3);
          const overkill = chaosStrikeHasOverkill(target, chaosDamage);
          depsRef.current.dealDamageToMonster(target, chaosDamage);
          if (overkill) {
            const drawn = drawCardsFromBackpack(2, { ignoreLimit: true });
            finalizeMagicCard(card, { banner: `混沌冲击对 ${target.name} 造成 ${chaosDamage} 伤害，超杀！抽 ${drawn} 张牌。` });
          } else {
            finalizeMagicCard(card, { banner: `混沌冲击对 ${target.name} 造成 ${chaosDamage} 点伤害。` });
          }
        } else {
          const chaosDamage = getSpellDamage(3);
          const chaosEchoLabel = echoMultiplier > 1 ? `（回响：第 1/${echoMultiplier} 次）` : '';
          setPendingMagicAction({
            card,
            effect: 'chaos-strike',
            step: 'monster-select',
            prompt: `选择一个目标，对其造成 ${chaosDamage} 点伤害。超杀：抽 2 张牌。${chaosEchoLabel}`,
            data: {},
            echoRemaining: echoMultiplier,
          });
          setHeroSkillBanner(`选择一个目标，造成 3 点伤害。超杀：抽 2 张牌。${chaosEchoLabel}`);
        }
        return;
      }
      if (card.name === '淬炼冲击') {
        const okMons = flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster' || c.type === 'building');
        if (okMons.length === 0) {
          finalizeMagicCard(card, { banner: '淬炼冲击无效（没有怪物）。' });
          return;
        }
        if (okMons.length === 1 && echoMultiplier <= 1) {
          const target = okMons[0];
          if (!depsRef.current.isMonsterEngaged(target.id)) depsRef.current.beginCombat(target, 'hero');
          const okDamage = getSpellDamage(3);
          const overkill = chaosStrikeHasOverkill(target, okDamage);
          depsRef.current.dealDamageToMonster(target, okDamage);
          if (overkill) {
            setUpgradeModalOpen(true);
            finalizeMagicCard(card, { banner: `淬炼冲击对 ${target.name} 造成 ${okDamage} 伤害，超杀！选择一张牌升级。` });
          } else {
            finalizeMagicCard(card, { banner: `淬炼冲击对 ${target.name} 造成 ${okDamage} 点伤害。` });
          }
        } else {
          const okDamage = getSpellDamage(3);
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
          const weaponSlots = depsRef.current.getEquipmentSlots().filter(slot => slot.item?.type === 'weapon' || slot.item?.type === 'monster');
          if (weaponSlots.length === 0) {
            finalizeMagicCard(card, { banner: '当前没有可以强化的装备栏。' });
            return;
          }
          if (weaponSlots.length === 1) {
            const burstAmount = burstBase * echoMultiplier;
            const slotId = weaponSlots[0].id;
            setSlotTempAttack(prev => ({
              ...prev,
              [slotId]: (prev[slotId] ?? 0) + burstAmount,
            }));
            if (depsRef.current.amuletEffects.hasPersuadeOnTempAttack) {
              depsRef.current.persuadeAmuletBonusRef.current += 5;
              depsRef.current.addGameLog('equip', `怀柔之印：下次劝降率 +5%（累计 +${depsRef.current.persuadeAmuletBonusRef.current}%）`);
            }
            finalizeMagicCard(card, {
              banner: `${weaponSlots[0].item!.name} 临时攻击力 +${burstAmount}。${isEchoTriggered ? '（回响×2）' : ''}`,
            });
            return;
          }
          setPendingMagicAction({
            card,
            effect: 'weapon-burst',
            step: 'slot-select',
            prompt: `选择一个装备栏，临时攻击力 +${burstBase * echoMultiplier}。`,
            echoMultiplier,
          });
          setHeroSkillBanner(`选择一个装备栏，临时攻击力 +${burstBase * echoMultiplier}。`);
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
            depsRef.current.applyDamage(repairHpCost);
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
          const ddDiscards = [1, 1, 2, 3];
          const ddDraws = [1, 2, 3, 4];
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
            if (depsRef.current.amuletEffects.hasSwapUpgrade) {
              const prog = engine.getState().swapUpgradeProgress + 1;
              if (prog >= 3) {
                setSwapUpgradeProgress(0);
                setUpgradeModalOpen(true);
                depsRef.current.addGameLog('amulet', '流转之符：交换 3 次位置，选择一张牌升级！');
                setHeroSkillBanner('流转之符：选择一张牌进行升级。');
              } else {
                setSwapUpgradeProgress(prog);
                depsRef.current.addGameLog('amulet', `流转之符：交换位置（${prog}/3）`);
              }
            }
            finalizeMagicCard(card, { banner: `${target.name} 已置于牌堆底。` });
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
          if (depsRef.current.amuletEffects.hasSwapUpgrade) {
            const swapCount = echoMultiplier;
            let prog = engine.getState().swapUpgradeProgress;
            for (let si = 0; si < swapCount; si++) {
              prog += 1;
              if (prog >= 3) {
                prog = 0;
                setUpgradeModalOpen(true);
                depsRef.current.addGameLog('amulet', '流转之符：交换 3 次位置，选择一张牌升级！');
                setHeroSkillBanner('流转之符：选择一张牌进行升级。');
              }
            }
            if (prog !== engine.getState().swapUpgradeProgress) {
              setSwapUpgradeProgress(prog);
              if (prog > 0) {
                depsRef.current.addGameLog('amulet', `流转之符：交换位置（${prog}/3）`);
              }
            }
          }
          finalizeMagicCard(card, { banner: swapBanner });
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
          depsRef.current.applyDamage(1 * echoMultiplier);
          setGold(prev => prev + 2 * echoMultiplier);
          depsRef.current.addGameLog('magic', `血金术：受到 ${1 * echoMultiplier} 点伤害，获得 ${2 * echoMultiplier} 金币`);
          finalizeMagicCard(card, { banner: `血金术：以 ${1 * echoMultiplier} 点生命换取 ${2 * echoMultiplier} 金币。${isEchoTriggered ? '（回响×2）' : ''}` });
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
          const stunChances = [10, 20, 30];
          const hits = 2;
          const baseDmgPerHit = stunDmgPerHit[card.upgradeLevel ?? 0] ?? 1;
          const stunPct = stunChances[card.upgradeLevel ?? 0] ?? 10;
          const hitDmg = getSpellDamage(baseDmgPerHit) * echoMultiplier;
          const totalDmg = hitDmg * hits;
          const monsters = flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster');
          if (monsters.length === 0) {
            finalizeMagicCard(card, { banner: '没有怪物可攻击。' });
            return;
          }
          if (monsters.length === 1) {
            if (!depsRef.current.isMonsterEngaged(monsters[0].id)) depsRef.current.beginCombat(monsters[0], 'hero');
            depsRef.current.dealDamageToMonster(monsters[0], totalDmg, { pulses: 2 });
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
                    const stunAmuletB = engine.getState().amuletSlots.find(s => s?.amuletEffect === 'stun-upgrade-cap');
                    const stunStepB = (stunAmuletB?.upgradeLevel ?? 0) >= 1 ? 10 : 5;
                    setStunCap(prev => {
                      const next = Math.min(100, prev + stunStepB);
                      depsRef.current.addGameLog('amulet', `震慑之符：击晕成功，击晕上限 +${stunStepB}%（当前 ${next}%）`);
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
            finalizeMagicCard(card, { banner: `雷震击：对 ${monsters[0].name} 造成 ${hitDmg}×${hits} 点伤害！${stunText}` });
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
          depsRef.current.applyDamage(1);
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
            const svMonsters = flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster');
            if (svMonsters.length === 0) {
              finalizeMagicCard(card, { banner: '箭雨余韵无效（没有怪物）。' });
              return;
            }
            const svDamage = getSpellDamage(1) * echoMultiplier;
            svMonsters.forEach((monster, index) => {
              if (!depsRef.current.isMonsterEngaged(monster.id)) {
                depsRef.current.beginCombat(monster, 'hero');
              }
              const animationDelay = index * Math.floor(COMBAT_ANIMATION_STAGGER * 0.75);
              depsRef.current.dealDamageToMonster(monster, svDamage, { animationDelay, pulses: 1 });
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
            finalizeMagicCard(card, { banner: svBanner });
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
            const monsters = flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster');
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
              depsRef.current.dealDamageToMonster(monsters[0], currentDamage, { pulses: 2 });
              depsRef.current.addPermanentMagicToRecycleBag(updatedCard);
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
          if (card.magicEffect === 'temp-attack-mirror-armor') {
            const equippedSlots = depsRef.current.getEquipmentSlots().filter(s => s.item);
            if (equippedSlots.length === 0) {
              finalizeMagicCard(card, { banner: '没有装备可选择。' });
              return;
            }
            const applyMirrorArmor = (slotId: EquipmentSlotId, slotItem: GameCardData) => {
              const totalArmor = depsRef.current.calculateSlotArmorValue(slotId);
              let attackWithoutTemp = 0;
              if (slotItem.type === 'weapon' || slotItem.type === 'monster') {
                const base = slotItem.type === 'monster' ? (slotItem.attack ?? slotItem.value) : slotItem.value;
                const atkBonus = depsRef.current.getAttackBonus();
                const dmgBonus = depsRef.current.getEquipmentSlotBonus(slotId, 'damage');
                const berserk = gs.berserkTurnBuff[slotId] ?? 0;
                attackWithoutTemp = base + atkBonus + dmgBonus + berserk;
              }
              const newTemp = totalArmor - attackWithoutTemp;
              const oldTemp = gs.slotTempAttack[slotId] ?? 0;
              const delta = newTemp - oldTemp;
              setSlotTempAttack(prev => ({ ...prev, [slotId]: newTemp }));
              const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
              depsRef.current.addGameLog('magic', `时空镜像：${slotItem.name} 临时攻击力 ${deltaStr}，攻击力变为 ${totalArmor}`);
              finalizeMagicCard(card, { banner: `${slotItem.name} 临时攻击力 ${deltaStr}，攻击力与护甲相同（${totalArmor}）。` });
            };
            if (equippedSlots.length === 1) {
              applyMirrorArmor(equippedSlots[0].id, equippedSlots[0].item!);
              return;
            }
            setPendingMagicAction({
              card,
              effect: 'temp-attack-mirror-armor',
              step: 'slot-select',
              prompt: '选择一个装备栏，调整临时攻击力直到攻击力与护甲相同。',
            });
            setHeroSkillBanner('时空镜像：选择一个装备栏。');
            return;
          }
          if (card.magicEffect === 'double-next-magic') {
            setDoubleNextMagic(true);
            finalizeMagicCard(card, { banner: '法术回响已激活！下一张法术的效果将触发两次。' });
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
      depsRef.current.removeCard(card.id, false);

      depsRef.current.stagingCardsRef.current =
        depsRef.current.stagingCardsRef.current.filter(c => c.id !== card.id);
      depsRef.current.drainPendingDiscardEffects();
    }
  }

  // ---------------------------------------------------------------------------
  // handlePlayCardFromHand
  // ---------------------------------------------------------------------------

  const handlePlayCardFromHand = async (card: GameCardData, target?: any) => {
    if (depsRef.current.fullBoardInteractionLockedRef.current || depsRef.current.handLockedForMonsterPhaseRef.current) return;
    depsRef.current.pushUndoSnapshot();
    if (!depsRef.current.consumeCardFromHand(card)) {
      return;
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
      } else {
        depsRef.current.addGameLog('equip', `装备失败：没有空槽位（${card.name}）`);
      }
    }
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

    // Internal helpers exposed for GameBoard
    isPermanentMagicCard,
    normalizeEventEffect,
    chaosStrikeHasOverkill,
    drawCardsFromBackpack,
    getRepairableEquipmentSlots,
    resolveFateSight,

    resolveMirrorCopy,
    cancelMirrorCopy,
    resolvePermGrant,
    cancelPermGrant,
  };
}
