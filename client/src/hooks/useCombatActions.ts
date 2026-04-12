import React, { useCallback, useEffect } from 'react';
import { BASE_BACKPACK_CAPACITY } from '@/game-core/constants';
import { hasEternalRelic } from '@/lib/eternalRelics';
import { sanitizeCardMetadata } from '@/game-core/helpers';
import { useGameEngine, useGameState, useEngineSetter } from '@/hooks/useGameEngine';
import type { GameCardData, EventDiceRange, HeroMagicId } from '@/components/GameCard';
import { isPermRecycleEquipment } from '@/components/GameCard';
import type { LogEntryType } from '@/components/GameLogPanel';
import type {
  ActiveAmuletEffects,
  ActiveRowSlots,
  BlockTarget,
  CardActionKeyword,
  CombatInitiator,
  CombatState,
  DeathWardPromptState,
  EquipmentItem,
  EquipmentSlotBonusState,
  EquipmentSlotId,
  MonsterRewardDrop,
  SlotPermanentBonus,
  SlotTempArmorState,
} from '@/components/game-board/types';
import type { KnightCardData } from '@/lib/knightDeck';
import type { HeroSkillId } from '@/lib/heroSkills';
import type { EquipmentBuffSnapshot } from '@/lib/gameStorage';
import {
  INITIAL_HP,
  STRENGTH_SELF_DAMAGE,
  initialCombatState,
  createEmptyEquipmentBuffState,
  createEmptyAmuletEffects,
} from '@/game-core/constants';
import {
  flattenActiveRowSlots,
  normalizeHeroEquipmentSlotFromDrag,
  isDamageableTarget,
} from '@/game-core/helpers';
import { getEquipmentSlotsWithSuppressedTempAttack, isMonsterMagicImmuneByBuilding } from '@/game-core/buildingAura';
import { goblinImage, bugletImage, createBugletCard } from '@/game-core/deck';
import { computeOverkill } from '@/game-core/combat';

// ---------------------------------------------------------------------------
// UI-only animation constants (mirrored from GameBoard.tsx)
// ---------------------------------------------------------------------------
const COMBAT_ANIMATION_STAGGER = 180;
const COMBAT_BLOCK_TO_REFLECT_MS = 220;
const SHIELD_REFLECT_ANIM_MS = 1020;
const BOSS_RETALIATION_ANIM_MS = 920;
const GOLEM_LAYER_REFLECT_ANIM_MS = 850;
const DRAGON_BREATH_ANIM_MS = 880;
const ARCANE_BLADE_SPELL_ANIM_MS = 780;
const DEFEAT_ANIMATION_DURATION = 950;

// ---------------------------------------------------------------------------
// Deps: external dependencies injected by GameBoard
// ---------------------------------------------------------------------------

export interface CombatActionsDeps {
  // --- Functions from useCardOperations (Layer 0) ---
  addToGraveyard: (card: GameCardData) => void;
  discardCardToGraveyard: (
    card: GameCardData | null | undefined,
    options?: { owner?: 'player' | 'dungeon'; forceGraveyard?: boolean; forceRecycleBag?: boolean },
  ) => void;
  disposeOwnedEquipmentCard: (card: GameCardData, options?: { isDestruction?: boolean }) => void;
  addCardToBackpack: (
    card: GameCardData,
    options?: { toBottom?: boolean; pendingDungeonCardId?: string },
  ) => void;
  drawFromBackpackToHand: () => GameCardData | null;
  drawFromRecycleBagToHand: (count: number) => GameCardData[];
  drawClassCardsToBackpack: (count: number, source: string, filter?: (card: GameCardData) => boolean) => GameCardData[];
  triggerClassDeckFlight: (cards: GameCardData[]) => void;
  getEquipmentSlots: () => { id: EquipmentSlotId; item: EquipmentItem | null }[];
  calculateSlotArmorValue: (slotId: EquipmentSlotId) => number;
  setEquipmentSlotBonus: (
    slotId: EquipmentSlotId,
    bonusType: keyof SlotPermanentBonus,
    value: number | ((current: number) => number),
  ) => void;
  getEquipmentSlotBonus: (slotId: EquipmentSlotId, bonusType: keyof SlotPermanentBonus) => number;
  setEquipmentSlotById: (id: EquipmentSlotId, item: EquipmentItem | null) => void;
  clearEquipmentSlotWithPromote: (id: EquipmentSlotId) => void;
  isRecyclableFromHand: (card: GameCardData | null | undefined) => boolean;
  triggerEventTransform: (fromCard: GameCardData, toCard: GameCardData, message?: string) => Promise<void>;
  amuletEffects: ActiveAmuletEffects;
  attackBonus: number;
  defenseBonus: number;

  // --- Animation / UI callbacks from GameBoard ---
  addGameLog: (type: LogEntryType, message: string) => void;
  triggerHeroBleedAnimation: () => void;
  triggerMonsterBleedAnimation: (monsterId: string, delay?: number) => void;
  triggerMonsterHealAnimation: (monsterId: string, delay?: number) => void;
  triggerWeaponSwingAnimation: (slotId: EquipmentSlotId, delay?: number, opts?: { echoes?: number }) => void;
  triggerShieldBlockAnimation: (slotId: EquipmentSlotId) => void;
  tryStartShieldReflectDirectedFx: (slotId: EquipmentSlotId, monsterId: string) => void;
  tryStartBossRetaliationDirectedFx: (monsterId: string) => void;
  tryStartGolemLayerReflectFx: (monsterId: string) => void;
  tryStartArcaneBladeSpellFx: (slotId: EquipmentSlotId, monsterId: string) => void;
  tryStartDragonBreathFx: (monsterId: string, targetSlotId: EquipmentSlotId | 'hero') => void;
  animSpeed: (ms: number) => number;

  // --- Async helpers ---
  requestDiceOutcome: (config: {
    title: string;
    subtitle?: string;
    entries: EventDiceRange[];
  }) => Promise<EventDiceRange | null>;
  addHeroMagicGauge: (id: HeroMagicId, amount: number) => void;
  triggerGhostBladeExile: () => Promise<void>;
  requestCardAction: (
    keyword: CardActionKeyword,
    count: number,
    options?: { title?: string; description?: string; handOnly?: boolean; moveToDestination?: 'recycle-bag' | 'graveyard' },
  ) => Promise<boolean>;
  queueMonsterReward: (monster: GameCardData) => boolean;
  removeCard: (cardId: string, animate: boolean) => void;
  markDungeonCardPendingUse: (cardId: string) => void;
  pushUndoSnapshot: () => void;
  clearUndoStack: () => void;
  clearUndoStorage: () => void;
  isMonsterEngaged: (monsterId: string) => boolean;
  findDeathWardCard: () => { card: GameCardData; source: 'hand' | 'backpack' } | null;
  consumeCardFromHand: (card: GameCardData) => void;
  consumeClassCardFromHand: (cardId: string) => void;
  finalizeMagicCard: (card: GameCardData, opts?: { banner?: string; dealtDamage?: boolean }) => void;
  triggerDiscardFlight: (card: GameCardData, destination: 'graveyard' | 'recycle-bag') => Promise<void>;
  triggerStealCardFlight: (card: GameCardData, targetMonsterId: string) => Promise<void>;
  dragonBleedDestroyEquipment: (monsterName: string, remainingLayers: number) => void;
  beginDiscoverFlow: (source: string, options?: { filter?: (card: GameCardData) => boolean; overridePool?: GameCardData[]; sourceLabel?: string }) => boolean;
  beginDiscoverFlowAsync: (source: string, opts?: { filter?: (card: GameCardData) => boolean; overridePool?: GameCardData[]; sourceLabel?: string }) => Promise<void>;
  requestDaggerSelfDestruct: (weaponName: string, remainingDurability: number) => Promise<boolean>;

  // --- Refs ---
  combatAsyncEpochRef: React.MutableRefObject<number>;
  pendingDefeatIdsRef: React.MutableRefObject<Set<string>>;
  goblinStolenIdsRef: React.MutableRefObject<Set<string>>;
  heroTurnLayerLossIdsRef: React.MutableRefObject<Set<string>>;
  heroTookDamageThisMonsterTurnRef: React.MutableRefObject<boolean>;
  monsterBleedTimeoutsRef: React.MutableRefObject<Record<string, ReturnType<typeof setTimeout>[]>>;
  activeCardsLatestRef: React.MutableRefObject<ActiveRowSlots>;
  fullBoardInteractionLockedRef: React.MutableRefObject<boolean>;
  handLockedForMonsterPhaseRef: React.MutableRefObject<boolean>;
  heroStunnedRef: React.MutableRefObject<boolean>;
  suppressDeathWardRef: React.MutableRefObject<boolean>;
  selectedHeroSkillRef: React.MutableRefObject<string | null>;
  eternalRelicsRef: React.MutableRefObject<import('@/game-core/types').EternalRelic[]>;
  handCardsRef: React.MutableRefObject<GameCardData[]>;
  endHeroTurnGuardRef: React.MutableRefObject<boolean>;
  beginCombatRef: React.MutableRefObject<(monster: GameCardData, initiator: CombatInitiator) => void>;
  bulwarkTempArmorRef: React.MutableRefObject<number>;
  persuadeAmuletBonusRef: React.MutableRefObject<number>;
  persuadeDiscountRef: React.MutableRefObject<{ costReduction: number; rateBonus: number } | null>;
  computePersuadeSuccessRate: (monster: GameCardData) => number;
  setPersuadeTempDiscount: React.Dispatch<React.SetStateAction<number>>;
  undoStackRef: React.MutableRefObject<any[]>;
  setUndoCount: (value: number | ((prev: number) => number)) => void;

  // --- Local React state setters (not engine state) ---
  setMonsterDefeatStates: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setMonsterBleedStates: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setHealing: React.Dispatch<React.SetStateAction<boolean>>;
  setTakingDamage: React.Dispatch<React.SetStateAction<boolean>>;

  // --- Local React state values ---
  selectedCard: GameCardData | null;

  // --- Pending action state from GameBoard (for handleMonsterTargetSelection) ---
  handleMagicMonsterSelection: (monster: GameCardData) => void;
  handleHolyLightMonsterCleanse: (monster: GameCardData) => boolean;
  handleHeroSkillMonsterSelection: (monster: GameCardData) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCombatActions(depsRef: React.MutableRefObject<CombatActionsDeps>) {
  const engine = useGameEngine();
  const gs = useGameState(s => s);

  const {
    hp,
    gold,
    activeCards,
    equipmentSlot1,
    equipmentSlot2,
    combatState,
    tempShield,
    nextWeaponBonus,
    slotAttackBursts,
    slotTempArmor,
    slotTempAttack,
    berserkTurnBuff,
    extraAttackCharges,
    nextAttackLifestealSlot,
    vampiricNextAttack,
    unbreakableNext,
    unbreakableUntilWaterfall,
    bulwarkPassiveActive,
    berserkerRageActive,
    berserkerSlotUsed,
    flashSlotUsed,
    gambitExtraActive,
    gambitExtraPerSlot,
    gambitSlotUsed,
    weaponExtraAttackUsed,
    blockDurabilityPerSlot,
    permanentSkills,
    permanentMaxHpBonus,
    permanentSpellDamageBonus,
    permanentSpellLifesteal,
    stunCap,
    selectedHeroSkill,
    deathWardPrompt,
    pendingHeroSkillAction,
    pendingHeroMagicAction,
    pendingMagicAction,
    handLimitBonus,
  } = gs;

  // -- Setters ----------------------------------------------------------------

  const setHp = useEngineSetter('hp');
  const setGold = useEngineSetter('gold');
  const setActiveCards = useEngineSetter('activeCards');
  const setActiveCardStacks = useEngineSetter('activeCardStacks');
  const setHandCards = useEngineSetter('handCards');
  const setBackpackItems = useEngineSetter('backpackItems');
  const setPermanentMagicRecycleBag = useEngineSetter('permanentMagicRecycleBag');
  const setEquipmentSlot1 = useEngineSetter('equipmentSlot1');
  const setEquipmentSlot2 = useEngineSetter('equipmentSlot2');
  const setEquipmentSlot1Reserve = useEngineSetter('equipmentSlot1Reserve');
  const setEquipmentSlot2Reserve = useEngineSetter('equipmentSlot2Reserve');
  const setEquipmentSlotBonuses = useEngineSetter('equipmentSlotBonuses');
  const setCombatState = useEngineSetter('combatState');
  const setTempShield = useEngineSetter('tempShield');
  const setNextWeaponBonus = useEngineSetter('nextWeaponBonus');
  const setSlotAttackBursts = useEngineSetter('slotAttackBursts');
  const setSlotTempArmor = useEngineSetter('slotTempArmor');
  const setSlotTempAttack = useEngineSetter('slotTempAttack');
  const setBerserkTurnBuff = useEngineSetter('berserkTurnBuff');
  const setExtraAttackCharges = useEngineSetter('extraAttackCharges');
  const setNextAttackLifestealSlot = useEngineSetter('nextAttackLifestealSlot');
  const setVampiricNextAttack = useEngineSetter('vampiricNextAttack');
  const setUnbreakableNext = useEngineSetter('unbreakableNext');
  const setBerserkerSlotUsed = useEngineSetter('berserkerSlotUsed');
  const setFlashSlotUsed = useEngineSetter('flashSlotUsed');
  const setGambitSlotUsed = useEngineSetter('gambitSlotUsed');
  const setWeaponExtraAttackUsed = useEngineSetter('weaponExtraAttackUsed');
  const setMonstersDefeated = useEngineSetter('monstersDefeated');
  const setBugletAmuletObtained = useEngineSetter('bugletAmuletObtained');
  const setHeroSkillBanner = useEngineSetter('heroSkillBanner');
  const setGameOver = useEngineSetter('gameOver');
  const setVictory = useEngineSetter('victory');
  const setTotalDamageTaken = useEngineSetter('totalDamageTaken');
  const setTurnDamageTaken = useEngineSetter('turnDamageTaken');
  const setTotalHealed = useEngineSetter('totalHealed');
  const setDeathWardPrompt = useEngineSetter('deathWardPrompt');
  const setSelectedMonsterRewards = useEngineSetter('selectedMonsterRewards');
  const setClassDamageDiscoverStreak = useEngineSetter('classDamageDiscoverStreak');
  const setAmuletSlots = useEngineSetter('amuletSlots');
  const setHeroStunned = useEngineSetter('heroStunned');
  const setStunCap = useEngineSetter('stunCap');
  const setUpgradeModalOpen = useEngineSetter('upgradeModalOpen');
  const setMonsterKillUpgradeProgress = useEngineSetter('monsterKillUpgradeProgress');

  useEffect(() => {
    if (combatState.engagedMonsterIds.length === 0) {
      setHeroStunned(false);
    }
  }, [combatState.engagedMonsterIds.length, setHeroStunned]);

  const updateDamageDiscoverCounter = useCallback((displayCount: number, threshold: number) => {
    setAmuletSlots(prev => prev.map(slot => {
      if (slot?.amuletEffect !== 'damage-class-discover') return slot;
      return { ...slot, _counterDisplay: `${displayCount}/${threshold}` };
    }));
  }, [setAmuletSlots]);

  const recordClassDamageDiscoverHit = useCallback(() => {
    const d = depsRef.current;
    if (!d?.amuletEffects.hasDamageClassDiscover) return;
    const st = engine.getState();
      const discoverAmulet = st.amuletSlots.find(s => s?.amuletEffect === 'damage-class-discover');
    const threshold = 10;
    const streak = st.classDamageDiscoverStreak ?? 0;
    const next = streak + 1;
    if (next >= threshold) {
      const amuletName = discoverAmulet?.name ?? '战痕之符';
      const started = d.beginDiscoverFlow('damage-class-discover', { sourceLabel: amuletName });
      if (started) {
        d.addGameLog('amulet', `${amuletName}：累计 ${threshold} 次造成伤害，发现专属牌！`);
      } else {
        d.addGameLog('amulet', `${amuletName}：累计 ${threshold} 次造成伤害，但职业牌堆已空。`);
      }
      setClassDamageDiscoverStreak(0);
      updateDamageDiscoverCounter(0, threshold);
    } else {
      setClassDamageDiscoverStreak(next);
      updateDamageDiscoverCounter(next, threshold);
    }
  }, [engine, setClassDamageDiscoverStreak, updateDamageDiscoverCounter]);

  // -- Derived values (duplicated from GameBoard for local use) ---------------
  // depsRef.current may be null during the first render pass (populated later
  // by GameBoard after all hooks run), so guard with optional chaining.

  const { amuletEffects, attackBonus, defenseBonus } = (() => {
    const d = depsRef.current;
    if (!d) return { amuletEffects: createEmptyAmuletEffects(), attackBonus: 0, defenseBonus: 0 };
    return {
      amuletEffects: d.amuletEffects,
      attackBonus: d.attackBonus,
      defenseBonus: d.defenseBonus,
    };
  })();

  const maxHp =
    INITIAL_HP +
    (depsRef.current?.amuletEffects?.aura?.maxHp ?? 0) +
    permanentMaxHpBonus +
    (permanentSkills.includes('Iron Will') ? 3 : 0) +
    (() => {
      const skillId = selectedHeroSkill;
      if (!skillId) return 0;
      try {
        const { getHeroSkillById } = require('@/lib/heroSkills');
        const def = getHeroSkillById(skillId as HeroSkillId);
        return def?.initialMaxHpBonus ?? 0;
      } catch {
        return 0;
      }
    })();

  // -- Berserker / Gambit helpers ---------------------------------------------

  const clearBerserkTurnBuff = useCallback(() => {
    setBerserkTurnBuff(createEmptyEquipmentBuffState());
  }, [setBerserkTurnBuff]);

  const addBerserkTurnBuff = useCallback((amount: number) => {
    if (!amount) {
      return;
    }
    setBerserkTurnBuff(prev => ({
      equipmentSlot1: (prev.equipmentSlot1 ?? 0) + amount,
      equipmentSlot2: (prev.equipmentSlot2 ?? 0) + amount,
    }));
  }, [setBerserkTurnBuff]);

  const grantExtraAttackCharges = useCallback((amount: number) => {
    if (amount <= 0) {
      return;
    }
    setExtraAttackCharges(prev => prev + amount);
  }, [setExtraAttackCharges]);

  const consumeExtraAttackCharge = useCallback(() => {
    setExtraAttackCharges(prev => Math.max(0, prev - 1));
  }, [setExtraAttackCharges]);

  // -- Monster damage helpers -------------------------------------------------

  const damageMonsterWithLayerOverflow = (
    monster: GameCardData,
    damage: number,
    _maxLayerLoss?: number,
  ): GameCardData => {
    let effectiveDamage = damage;
    if (monster.maxDamagePerHit && effectiveDamage > monster.maxDamagePerHit && !monster.isStunned) {
      effectiveDamage = monster.maxDamagePerHit;
    }
    if (effectiveDamage <= 0) {
      return monster;
    }
    if (!monster.maxHp || monster.hp == null) {
      return {
        ...monster,
        hp: Math.max(0, (monster.hp || monster.value) - effectiveDamage),
        value: Math.max(0, (monster.hp || monster.value) - effectiveDamage),
      };
    }

    const layers = monster.currentLayer ?? monster.hpLayers ?? monster.fury ?? 1;
    const hpNow = monster.hp ?? 0;
    if (layers <= 0 || hpNow <= 0) return monster;

    if (effectiveDamage < hpNow) {
      return { ...monster, hp: hpNow - effectiveDamage };
    }

    const newLayer = layers - 1;

    let attackBoostVal = 0;
    if (monster.bleedEffect?.startsWith('attack+') && newLayer > 0) {
      const perLayer = parseInt(monster.bleedEffect.replace('attack+', ''), 10) || 0;
      attackBoostVal = perLayer;
    }

    const mMaxHp = monster.maxHp ?? hpNow;
    return {
      ...monster,
      currentLayer: newLayer,
      hp: newLayer > 0 ? mMaxHp : 0,
      attack: (monster.attack ?? monster.value) + attackBoostVal,
      value: monster.value + attackBoostVal,
      specialAttackBoost: (monster.specialAttackBoost ?? 0) + attackBoostVal,
      tempAttackBoost: (monster.tempAttackBoost ?? 0) + attackBoostVal,
    };
  };

  // -- updateMonsterCard ------------------------------------------------------

  const updateMonsterCard = (monsterId: string, updater: (monster: GameCardData) => GameCardData) => {
    setActiveCards(prev =>
      prev.map(card => (card?.id === monsterId ? updater(card) : card))
    );
  };

  const handleBuildingDestroyed = (building: GameCardData) => {
    const { fromSlot: _fs, ...forGy } = building as GameCardData & { fromSlot?: string };
    depsRef.current.addToGraveyard(forGy);
    depsRef.current.removeCard(building.id, true);
    depsRef.current.addGameLog('combat', `「${building.name}」已被毁坏。`);
  };

  // -- checkHollowSkeletonRestore ---------------------------------------------

  const checkHollowSkeletonRestore = async (
    monsterId: string,
    monsterName: string,
    layersBefore: number,
    layersAfter: number,
    force?: boolean,
  ) => {
    if (!force && (layersAfter <= 0 || layersAfter >= layersBefore)) return;
    const result = await depsRef.current.requestDiceOutcome({
      title: monsterName,
      subtitle: '虚骨再生',
      entries: [
        { id: 'restore', range: [1, 10] as [number, number], label: '恢复 1 层血层', effect: 'none' },
        { id: 'fail', range: [11, 20] as [number, number], label: '再生失败', effect: 'none' },
      ],
    });
    if (result?.id === 'restore') {
      updateMonsterCard(monsterId, card => ({
        ...card,
        currentLayer: (card.currentLayer ?? 0) + 1,
        hp: card.maxHp ?? card.hp ?? 0,
      }));
      depsRef.current.addGameLog('combat', `${monsterName} 的虚骨再生了一层！`);
      setHeroSkillBanner(`${monsterName} 恢复了 1 层血层！`);
    } else {
      depsRef.current.addGameLog('combat', `${monsterName} 的再生尝试失败。`);
    }
  };

  // -- checkWraithRebirth -----------------------------------------------------

  const checkWraithRebirth = async (
    monsterId: string,
    monsterName: string,
    monsterFury: number,
    layersBefore: number,
    layersAfter: number,
  ) => {
    if (layersAfter !== 1 || layersBefore <= 1) return;
    const result = await depsRef.current.requestDiceOutcome({
      title: monsterName,
      subtitle: '幽魂重生',
      entries: [
        { id: 'rebirth', range: [1, 6] as [number, number], label: '血层全部回满！', effect: 'none' },
        { id: 'fail', range: [7, 20] as [number, number], label: '重生失败', effect: 'none' },
      ],
    });
    if (result?.id === 'rebirth') {
      updateMonsterCard(monsterId, card => ({
        ...card,
        currentLayer: monsterFury,
        hp: card.maxHp ?? card.hp ?? 0,
      }));
      depsRef.current.addGameLog('combat', `${monsterName} 的幽魂之力爆发，血层全部回满！`);
      setHeroSkillBanner(`${monsterName} 血层全部回满了！`);
    } else {
      depsRef.current.addGameLog('combat', `${monsterName} 的重生尝试失败。`);
    }
  };

  // -- executeLastWords -------------------------------------------------------

  const executeLastWords = async (monster: GameCardData) => {
    const effect = monster.lastWords;
    if (!effect) return;

    if (effect === 'discard-hand-3' || effect === 'discard-hand-1') {
      const maxDiscard = effect === 'discard-hand-1' ? 1 : 3;
      depsRef.current.undoStackRef.current = [];
      depsRef.current.setUndoCount(0);
      depsRef.current.clearUndoStorage();
      const currentHand = depsRef.current.handCardsRef.current;
      const discardCount = Math.min(maxDiscard, currentHand.length);
      if (discardCount <= 0) {
        depsRef.current.addGameLog('combat', `${monster.name} 的遗言：随机弃回手牌，但玩家没有手牌。`);
        return;
      }
      const indices = Array.from({ length: currentHand.length }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      const toDiscard = indices.slice(0, discardCount).map(i => currentHand[i]);
      const flights = toDiscard.map(dc => ({
        card: dc,
        promise: depsRef.current.triggerDiscardFlight(
          dc,
          depsRef.current.isRecyclableFromHand(dc) ? 'recycle-bag' : 'graveyard',
        ),
      }));
      const discardIds = new Set(toDiscard.map(c => c.id));
      depsRef.current.handCardsRef.current = depsRef.current.handCardsRef.current.filter(c => !discardIds.has(c.id));
      setHandCards(depsRef.current.handCardsRef.current);
      await Promise.all(flights.map(f => f.promise));
      const sorted = [...flights].sort((a, b) => (a.card.onDiscardDraw ? 1 : 0) - (b.card.onDiscardDraw ? 1 : 0));
      sorted.forEach(f => depsRef.current.discardCardToGraveyard(f.card, { owner: 'player' }));
      const names = toDiscard.map(c => c.name);
      depsRef.current.addGameLog('combat', `${monster.name} 的遗言：随机弃回了 ${discardCount} 张手牌（${names.join('、')}）`);
      setHeroSkillBanner(`${monster.name} 的遗言：弃回了 ${names.join('、')}！`);
    }

    if (effect.startsWith('wraith-haunt-')) {
      const atkBoost = parseInt(effect.replace('wraith-haunt-', ''), 10) || 2;
      setActiveCards(prev => {
        const otherMonsters: string[] = [];
        const occupiedIndices: number[] = [];
        const occupiedCards: (GameCardData | null)[] = [];

        for (let i = 0; i < prev.length; i++) {
          const c = prev[i];
          if (!c || c.id === monster.id) continue;
          occupiedIndices.push(i);
          occupiedCards.push(c);
          if (c.type === 'monster') {
            otherMonsters.push(c.name);
          }
        }

        if (occupiedIndices.length === 0) return prev;

        const fisherYatesShuffle = <T,>(arr: T[]): T[] => {
          const a = [...arr];
          for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
          }
          return a;
        };
        let shuffled = fisherYatesShuffle(occupiedCards);
        if (occupiedCards.length >= 2) {
          const isSameOrder = shuffled.every((c, i) => c === occupiedCards[i]);
          if (isSameOrder) shuffled = fisherYatesShuffle(occupiedCards);
        }
        const next = [...prev] as (GameCardData | null)[];
        for (let i = 0; i < occupiedIndices.length; i++) {
          let card = shuffled[i];
          if (card && card.type === 'monster') {
            card = {
              ...card,
              attack: (card.attack ?? card.value) + atkBoost,
              specialAttackBoost: (card.specialAttackBoost ?? 0) + atkBoost,
              tempAttackBoost: (card.tempAttackBoost ?? 0) + atkBoost,
            };
          }
          next[occupiedIndices[i]] = card;
        }
        return next as typeof prev;
      });

      const parts: string[] = [];
      const otherMons = activeCards.filter(c => c && c.id !== monster.id && c.type === 'monster');
      if (otherMons.length > 0) {
        parts.push(`同行怪物攻击力 +${atkBoost}`);
      }
      parts.push('同行卡牌位置打乱');
      depsRef.current.addGameLog('combat', `${monster.name} 的遗言：${parts.join('，')}！`);
      setHeroSkillBanner(`${monster.name} 的遗言：${parts.join('，')}！`);
    }
  };

  // -- handleMonsterDefeated --------------------------------------------------

  const handleMonsterDefeated = (monster: GameCardData, opts?: { killedByMinion?: boolean }) => {
    if (depsRef.current.pendingDefeatIdsRef.current.has(monster.id)) return;

    if (monster.isFinalMonster && !monster.bossPhase && !monster.isStunned) {
      const fullHp = monster.maxHp ?? monster.hp ?? monster.value ?? 0;
      const layers = monster.fury ?? monster.hpLayers ?? 2;
      const bossCard: GameCardData = {
        ...monster,
        bossPhase: true,
        currentLayer: layers,
        hp: fullHp,
        hasRevive: true,
        reviveUsed: false,
        bossRetaliationDamage: 3,
        bossLastStandAura: true,
        bossFuryDiceChance: true,
        description: [
          '反噬：每次受到伤害，对英雄造成 3 点直接伤害（无视护盾）',
          '复生：首次被击杀后以 1 血层复活',
          '暴走光环：血层为 1 时，每个怪物回合结束 +5 攻击，恢复 1 血层',
          '韧性：攻击后 50% 概率不掉血层（掷骰判定）',
        ].join('\n'),
      };
      if (monster.lastWords) {
        executeLastWords(monster);
      }
      updateMonsterCard(monster.id, () => bossCard);
      setCombatState(prev => {
        const remaining = prev.engagedMonsterIds.filter(id => id !== monster.id);
        if (remaining.length === 0) return { ...initialCombatState };
        return { ...prev, engagedMonsterIds: remaining };
      });
      depsRef.current.triggerEventTransform(monster, bossCard, 'Boss 降临！');
      depsRef.current.addGameLog('combat', `${monster.name} 变身为 Boss！`);
      setHeroSkillBanner(`${monster.name} 暴走变身！`);
      return;
    }

    if (monster.hasRevive && !monster.reviveUsed && !monster.isStunned) {
      if (monster.lastWords) {
        executeLastWords(monster);
      }
      if (monster.skeletonLastWordsDiscard && !monster.lastWords) {
        executeLastWords({ ...monster, lastWords: 'discard-hand-1' });
      }
      const fullHp = monster.maxHp ?? monster.hp ?? monster.value ?? 0;
      const activateNoLayerCost = !!monster.skeletonNoLayerCost;
      updateMonsterCard(monster.id, card => ({
        ...card,
        currentLayer: 1,
        hp: fullHp,
        reviveUsed: true,
        ...(activateNoLayerCost ? { skeletonNoLayerCostActive: true } : {}),
      }));
      depsRef.current.addGameLog('combat', `${monster.name} 触发了复生，以 1 血层重新站了起来！`);
      if (activateNoLayerCost) {
        depsRef.current.addGameLog('combat', `${monster.name} 不朽之骨：复生后攻击不再消耗血层！`);
      }
      setHeroSkillBanner(`${monster.name} 复生了！`);
      return;
    }

    depsRef.current.pendingDefeatIdsRef.current.add(monster.id);

    const pendingTimeouts = depsRef.current.monsterBleedTimeoutsRef.current[monster.id];
    if (pendingTimeouts?.length) {
      pendingTimeouts.forEach(timeout => clearTimeout(timeout));
      delete depsRef.current.monsterBleedTimeoutsRef.current[monster.id];
    }
    depsRef.current.setMonsterBleedStates(prev => {
      if (!prev[monster.id]) {
        return prev;
      }
      const next = { ...prev };
      delete next[monster.id];
      return next;
    });

    depsRef.current.setMonsterDefeatStates(prev => ({ ...prev, [monster.id]: true }));
    depsRef.current.addGameLog('combat', `${monster.name} 被击败！`);

    if (opts?.killedByMinion && depsRef.current.eternalRelicsRef.current.some(r => r.id === 'summon-minion')) {
      const buffMinion = (card: GameCardData): GameCardData => ({
        ...card,
        attack: (card.attack ?? card.value) + 1,
        value: (card.attack ?? card.value) + 1,
        hp: (card.hp ?? 1) + 1,
        maxHp: (card.maxHp ?? card.hp ?? 1) + 1,
      });
      let found = false;
      setBackpackItems(prev => {
        const idx = prev.findIndex(c => c.isMinionCard);
        if (idx === -1) return prev;
        found = true;
        const updated = [...prev];
        updated[idx] = buffMinion(updated[idx]);
        return updated;
      });
      if (!found) {
        setHandCards(prev => {
          const idx = prev.findIndex(c => c.isMinionCard);
          if (idx === -1) return prev;
          found = true;
          const updated = [...prev];
          updated[idx] = buffMinion(updated[idx]);
          return updated;
        });
      }
      if (!found) {
        setEquipmentSlot1(prev => {
          if (prev && (prev as GameCardData).isMinionCard) {
            found = true;
            return { ...buffMinion(prev as GameCardData), type: 'monster' as const } as EquipmentItem;
          }
          return prev;
        });
      }
      if (!found) {
        setEquipmentSlot2(prev => {
          if (prev && (prev as GameCardData).isMinionCard) {
            found = true;
            return { ...buffMinion(prev as GameCardData), type: 'monster' as const } as EquipmentItem;
          }
          return prev;
        });
      }
      if (!found) {
        const buffReserve = (prev: EquipmentItem[]) => {
          const idx = prev.findIndex(c => (c as GameCardData).isMinionCard);
          if (idx === -1) return prev;
          found = true;
          const updated = [...prev];
          updated[idx] = { ...buffMinion(updated[idx]), type: 'monster' as const } as EquipmentItem;
          return updated;
        };
        setEquipmentSlot1Reserve(buffReserve);
        if (!found) setEquipmentSlot2Reserve(buffReserve);
      }
      if (found) {
        depsRef.current.addGameLog('skill', '随从成长：攻击 +1、防御 +1');
      }
    }

    if (monster.lastWords && !monster.isStunned) {
      executeLastWords(monster);
    }
    if (monster.skeletonLastWordsDiscard && !monster.lastWords && !monster.isStunned) {
      executeLastWords({ ...monster, lastWords: 'discard-hand-1' });
    }

    if (monster.wraithDeathHeal && monster.wraithDeathHeal > 0 && !monster.isStunned) {
      const healAmount = monster.wraithDeathHeal;
      setActiveCards(prev => {
        const buffedNames: string[] = [];
        const next = prev.map(c => {
          if (!c || c.id === monster.id || c.type !== 'monster') return c;
          const newHp = Math.min((c.hp ?? 0) + healAmount, (c.maxHp ?? c.hp ?? 0) + healAmount);
          const newMaxHp = Math.max(c.maxHp ?? 0, newHp);
          buffedNames.push(c.name);
          return { ...c, hp: newHp, maxHp: newMaxHp, tempHpBoost: (c.tempHpBoost ?? 0) + healAmount };
        }) as ActiveRowSlots;
        if (buffedNames.length > 0) {
          depsRef.current.addGameLog('combat', `${monster.name} 怨灵祝福：${buffedNames.join('、')} 生命值 +${healAmount}！`);
          setHeroSkillBanner(`${monster.name} 怨灵祝福！同行怪物生命 +${healAmount}！`);
        }
        return next;
      });
    }

    if (monster.wraithDeathHealSpread && monster.wraithDeathHealSpread > 0 && !monster.isStunned) {
      const healAmount = monster.wraithDeathHealSpread;
      setActiveCards(prev => {
        const buffedNames: string[] = [];
        const otherMonsters: GameCardData[] = [];
        const next = prev.map(c => {
          if (!c || c.id === monster.id || c.type !== 'monster') return c;
          const newHp = Math.min((c.hp ?? 0) + healAmount, (c.maxHp ?? c.hp ?? 0) + healAmount);
          const newMaxHp = Math.max(c.maxHp ?? 0, newHp);
          buffedNames.push(c.name);
          otherMonsters.push(c);
          return { ...c, hp: newHp, maxHp: newMaxHp, tempHpBoost: (c.tempHpBoost ?? 0) + healAmount };
        }) as ActiveRowSlots;

        if (otherMonsters.length > 0) {
          const recipient = otherMonsters[Math.floor(Math.random() * otherMonsters.length)];
          const finalNext = (next as (GameCardData | null)[]).map(c => {
            if (!c || c.id !== recipient.id) return c;
            return { ...c, wraithDeathHealSpread: healAmount };
          }) as ActiveRowSlots;

          if (buffedNames.length > 0) {
            depsRef.current.addGameLog('combat', `${monster.name} 怨灵遗言：${buffedNames.join('、')} 生命值 +${healAmount}！`);
            depsRef.current.addGameLog('combat', `${monster.name} 的遗言传递给了 ${recipient.name}！`);
            setHeroSkillBanner(`${monster.name} 怨灵遗言！同行怪物生命 +${healAmount}，遗言传递给 ${recipient.name}！`);
          }
          return finalNext;
        }

        return next;
      });
    }

    if (monster.bugletLastWordsHeal && !monster.isStunned) {
      setActiveCards(prev => {
        const healedNames: string[] = [];
        const next = prev.map(c => {
          if (!c || c.id === monster.id || !c.isBuglet || c.type !== 'monster') return c;
          const maxLayers = c.hpLayers ?? c.fury ?? 1;
          const curLayer = c.currentLayer ?? maxLayers;
          if (curLayer >= maxLayers) return c;
          healedNames.push(c.name);
          return { ...c, currentLayer: curLayer + 1 };
        }) as ActiveRowSlots;
        if (healedNames.length > 0) {
          depsRef.current.addGameLog('combat', `${monster.name} 虫群遗念：${healedNames.join('、')} 恢复了1血层！`);
          setHeroSkillBanner(`${monster.name} 虫群遗念！其他小虫子恢复1血层！`);
        }
        return healedNames.length > 0 ? next : prev;
      });
    }

    const latestMonster = activeCards.find(c => c?.id === monster.id) ?? monster;
    const shouldFlipGoblin =
      latestMonster.monsterType === 'Goblin' &&
      !latestMonster.goblinHasStolen &&
      !depsRef.current.goblinStolenIdsRef.current.has(monster.id) &&
      Boolean(latestMonster.goblinTrickCarrier);

    setTimeout(() => {
      depsRef.current.pendingDefeatIdsRef.current.delete(monster.id);
      depsRef.current.goblinStolenIdsRef.current.delete(monster.id);
      depsRef.current.setMonsterDefeatStates(prev => {
        const next = { ...prev };
        delete next[monster.id];
        return next;
      });
      setMonstersDefeated(prev => prev + 1);

      // Skeleton Lv3 re-revive: when another monster is defeated, skeletons with reviveUsed regain revive
      setActiveCards(prev => {
        let anyReRevived = false;
        const next = prev.map(c => {
          if (!c || c.id === monster.id || c.type !== 'monster') return c;
          if (c.monsterType === 'Skeleton' && c.skeletonReRevive && c.reviveUsed && !c.isStunned) {
            anyReRevived = true;
            depsRef.current.addGameLog('combat', `${c.name} 亡骨轮回：同行怪物被击败，再次获得复生！`);
            setHeroSkillBanner(`${c.name} 亡骨轮回！再次获得复生！`);
            return { ...c, reviveUsed: false, skeletonNoLayerCostActive: false };
          }
          return c;
        }) as ActiveRowSlots;
        return anyReRevived ? next : prev;
      });

      if (shouldFlipGoblin) {
        const goblinMagic: GameCardData = {
          id: `goblin-trick-${Date.now()}`,
          type: 'magic',
          name: '哥布林的戏法',
          value: 0,
          image: goblinImage,
          magicType: 'permanent',
          magicEffect: '永久魔法：将所有其他手牌洗入回收袋，然后从背包抽取等量的牌。',
          description: '使用后将手中所有其他牌（包括非永久牌）洗入回收袋，再从背包随机抽取相同数量的新牌。回收袋中的牌将在下次瀑流时回到背包。',
        };
        depsRef.current.triggerEventTransform(monster, goblinMagic, '哥布林的秘密！');
        depsRef.current.addCardToBackpack(goblinMagic);
        depsRef.current.addGameLog('combat', `${monster.name} 没偷到金币，死后留下了「哥布林的戏法」！`);
        setHeroSkillBanner(`${monster.name} 留下了隐藏的「哥布林的戏法」！`);
      }

      if (latestMonster.isBuglet && !engine.getState().bugletAmuletObtained && Math.random() < 0.05) {
        setBugletAmuletObtained(true);
        const bugletAmulet: GameCardData = {
          id: `buglet-amulet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'amulet',
          name: '虫蜕之冠',
          value: 0,
          image: bugletImage,
          amuletEffect: 'monster-kill-upgrade',
          description: '每击杀 5 个怪物，选择一张牌升级。',
        };
        depsRef.current.triggerEventTransform(monster, bugletAmulet, '小虫子蜕变！');
        depsRef.current.addCardToBackpack(bugletAmulet);
        depsRef.current.addGameLog('combat', `${monster.name} 死后蜕变为「虫蜕之冠」护符！`);
        setHeroSkillBanner(`${monster.name} 留下了「虫蜕之冠」！`);
      }

      if (depsRef.current.amuletEffects.hasMonsterKillUpgrade) {
        const killProgress = engine.getState().monsterKillUpgradeProgress + 1;
        if (killProgress >= 5) {
          setMonsterKillUpgradeProgress(0);
          setAmuletSlots(prev => prev.map(slot =>
            slot?.amuletEffect === 'monster-kill-upgrade' ? { ...slot, _counterDisplay: '0/5' } : slot
          ));
          setUpgradeModalOpen(true);
          depsRef.current.addGameLog('amulet', '虫蜕之冠：击杀 5 个怪物，可升级 1 张牌！');
          setHeroSkillBanner('虫蜕之冠发动：选择一张牌升级！');
        } else {
          setMonsterKillUpgradeProgress(killProgress);
          setAmuletSlots(prev => prev.map(slot =>
            slot?.amuletEffect === 'monster-kill-upgrade' ? { ...slot, _counterDisplay: `${killProgress}/5` } : slot
          ));
        }
      }

      const hasReward = depsRef.current.queueMonsterReward(monster);
      if (hasReward) {
        depsRef.current.markDungeonCardPendingUse(monster.id);
      } else {
        depsRef.current.removeCard(monster.id, false);
        depsRef.current.addToGraveyard(monster);
      }
      setSelectedMonsterRewards(prev => (depsRef.current.selectedCard?.id === monster.id ? null : prev));
      let combatEnded = false;
      setCombatState(prev => {
        const remaining = prev.engagedMonsterIds.filter(id => id !== monster.id);
        const { [monster.id]: _removedDamage, ...restDamage } = prev.heroDamageThisTurn;
        const pendingBlock =
          prev.pendingBlock?.monsterId === monster.id ? null : prev.pendingBlock;
        const queue = prev.monsterAttackQueue.filter(id => id !== monster.id);

        if (remaining.length === 0) {
          combatEnded = true;
          return { ...initialCombatState };
        }

        return {
          ...prev,
          engagedMonsterIds: remaining,
          heroDamageThisTurn: restDamage,
          pendingBlock,
          monsterAttackQueue: queue,
        };
      });
      if (combatEnded) {
        setHeroStunned(false);
        setBerserkerSlotUsed({});
        setFlashSlotUsed({});
        setGambitSlotUsed({});
        setWeaponExtraAttackUsed({});
        flushRecycleBagToBackpack();
      }
    }, depsRef.current.animSpeed(DEFEAT_ANIMATION_DURATION));
  };

  // -- decrementMonsterFury ---------------------------------------------------

  const decrementMonsterFury = (monster: GameCardData) => {
    if (monster.skeletonNoLayerCostActive) {
      depsRef.current.addGameLog('combat', `${monster.name} 不朽之骨：攻击不消耗血层！`);
      return;
    }
    if (monster.dragonAttackNoLayerCost && monster.dragonNoLayerCostActive && !monster.isStunned) {
      depsRef.current.addGameLog('combat', `${monster.name} 龙鳞护体：上回合已掉血层，本次攻击不消耗血层！`);
      return;
    }
    const currentLayer = monster.currentLayer ?? monster.hpLayers ?? monster.fury ?? 1;
    const nextLayer = currentLayer - 1;

    if (nextLayer <= 0) {
      handleMonsterDefeated(monster);
      if (!depsRef.current.pendingDefeatIdsRef.current.has(monster.id) && monster.monsterSpecial === 'bone-regen') {
        void checkHollowSkeletonRestore(monster.id, monster.name, currentLayer, nextLayer, true);
      }
      return;
    }

    if (monster.bleedEffect?.startsWith('attack+')) {
      const perLayer = parseInt(monster.bleedEffect.replace('attack+', ''), 10) || 0;
      const newAttack = (monster.attack ?? monster.value) + perLayer;
      const newValue = monster.value + perLayer;
      const newBoost = (monster.specialAttackBoost ?? 0) + perLayer;
      updateMonsterCard(monster.id, (card) => ({
        ...card,
        currentLayer: nextLayer,
        hp: card.maxHp,
        attack: newAttack,
        value: newValue,
        specialAttackBoost: newBoost,
        tempAttackBoost: (card.tempAttackBoost ?? 0) + perLayer,
      }));
      depsRef.current.addGameLog('combat', `${monster.name} 触发流血：攻击力+${perLayer}，当前 ${newAttack}！`);
      setHeroSkillBanner(`${monster.name} 流血！攻击力升至 ${newAttack}！`);
    } else {
      updateMonsterCard(monster.id, (card) => ({
        ...card,
        currentLayer: nextLayer,
        hp: card.maxHp,
      }));
    }

    if (monster.monsterSpecial === 'bone-regen') {
      void checkHollowSkeletonRestore(monster.id, monster.name, currentLayer, nextLayer);
    }
    if (monster.monsterSpecial === 'wraith-rebirth') {
      void checkWraithRebirth(monster.id, monster.name, monster.fury ?? monster.hpLayers ?? 1, currentLayer, nextLayer);
    }
  };

  // -- dealDamageToMonster ----------------------------------------------------

  const dealDamageToBuilding = (
    building: GameCardData,
    damage: number,
    options?: { animationDelay?: number; pulses?: number },
  ) => {
    if (damage <= 0 || building.type !== 'building') return;

    recordClassDamageDiscoverHit();

    const layersBefore = building.currentLayer ?? building.fury ?? 1;
    const updated = damageMonsterWithLayerOverflow(building, damage, 1);
    const baseDelay = options?.animationDelay ?? 0;
    const pulses = Math.max(1, options?.pulses ?? 1);
    for (let i = 0; i < pulses; i += 1) {
      depsRef.current.triggerMonsterBleedAnimation(building.id, baseDelay + i * Math.floor(COMBAT_ANIMATION_STAGGER / 2));
    }

    const destroyed = (updated.currentLayer ?? 0) <= 0 || (updated.hp ?? 0) <= 0;
    if (destroyed) {
      handleBuildingDestroyed(building);
    } else {
      updateMonsterCard(building.id, (card) => damageMonsterWithLayerOverflow(card, damage, 1));
      const layersAfter = updated.currentLayer ?? 0;
      if (layersAfter < layersBefore) {
        depsRef.current.heroTurnLayerLossIdsRef.current.add(building.id);
      }
    }
  };

  const dealDamageToMonster = (
    monster: GameCardData,
    damage: number,
    options?: { animationDelay?: number; pulses?: number; isSpellDamage?: boolean },
  ) => {
    if (options?.isSpellDamage && monster.type === 'monster') {
      const activeCards = engine.getState().activeCards;
      const monsterCol = activeCards.findIndex(c => c?.id === monster.id);
      if (monsterCol >= 0 && isMonsterMagicImmuneByBuilding(activeCards, monsterCol)) {
        depsRef.current.addGameLog('combat', `${monster.name} 受到诅咒碑光环保护，免疫魔法伤害！`);
        return;
      }
    }

    let effectiveDamage = damage;
    if (options?.isSpellDamage && monster.spellDamageReduction && !monster.isStunned) {
      effectiveDamage = Math.max(1, Math.floor(effectiveDamage * (1 - monster.spellDamageReduction)));
      depsRef.current.addGameLog('combat', `${monster.name} 法术抗性：法术伤害减半（${damage} → ${effectiveDamage}）`);
    }

    if (monster.swarmBugletShield && !monster.isStunned) {
      const currentActiveCards = engine.getState().activeCards;
      const hasBuglet = currentActiveCards.some(c => c && c.isBuglet);
      if (hasBuglet) {
        depsRef.current.addGameLog('combat', `${monster.name} 虫盾共生：场上有小虫子，伤害被完全抵挡！`);
        return;
      }
    }

    if (effectiveDamage <= 0) {
      return;
    }

    if (monster.type === 'building') {
      dealDamageToBuilding(monster, effectiveDamage, options);
      return;
    }

    if (monster.maxDamagePerHit && effectiveDamage > monster.maxDamagePerHit && !monster.isStunned) {
      depsRef.current.addGameLog('combat', `${monster.name} 岩石护体：伤害上限 ${monster.maxDamagePerHit}（原始 ${effectiveDamage}）！`);
    }

    recordClassDamageDiscoverHit();

    const layersBefore = monster.currentLayer ?? monster.fury ?? 1;
    const updatedMonster = damageMonsterWithLayerOverflow(monster, effectiveDamage, 1);
    const baseDelay = options?.animationDelay ?? 0;
    const pulses = Math.max(1, options?.pulses ?? 1);
    for (let i = 0; i < pulses; i += 1) {
      depsRef.current.triggerMonsterBleedAnimation(monster.id, baseDelay + i * Math.floor(COMBAT_ANIMATION_STAGGER / 2));
    }

    if (monster.bossRetaliationDamage && monster.bossRetaliationDamage > 0 && !monster.isStunned) {
      const retDmg = monster.bossRetaliationDamage;
      setHp(prev => {
        const newHp = Math.max(0, prev - retDmg);
        if (newHp === 0) {
          depsRef.current.addGameLog('system', '英雄阵亡，游戏结束');
          setGameOver(true);
          setVictory(false);
        }
        return newHp;
      });
      depsRef.current.addHeroMagicGauge('holy-light', 1);
      depsRef.current.addGameLog('combat', `${monster.name} 反噬：造成 ${retDmg} 点直接伤害！`);
    }

    if (monster.dragonDamageRetaliation && monster.dragonDamageRetaliation > 0 && !monster.isStunned) {
      applyDragonBreathRetaliation(monster.id, monster.name, monster.dragonDamageRetaliation);
    }

    const ae = depsRef.current.amuletEffects;
    const effectiveLifesteal = permanentSpellLifesteal + ae.lifeOverkillBonus;
    if (effectiveLifesteal > 0) {
      const overkill = computeOverkill(monster, effectiveDamage);
      if (overkill > 0) {
        healHero(effectiveLifesteal, { healLogVariant: 'overkill-lifesteal' });
      }
    }

    const monsterDefeated =
      (updatedMonster.currentLayer ?? 0) <= 0 || (updatedMonster.hp ?? 0) <= 0;
    if (monsterDefeated) {
      handleMonsterDefeated(monster);
    } else {
      updateMonsterCard(monster.id, (card) => damageMonsterWithLayerOverflow(card, effectiveDamage, 1));
      const layersAfter = updatedMonster.currentLayer ?? 0;
      if (layersAfter < layersBefore) {
        depsRef.current.heroTurnLayerLossIdsRef.current.add(monster.id);
      }
      if (monster.bleedEffect && layersAfter < layersBefore && !monster.isStunned) {
        const newAttack = updatedMonster.attack ?? updatedMonster.value;
        const perLayer = parseInt((monster.bleedEffect ?? '').replace('attack+', ''), 10) || 0;
        depsRef.current.addGameLog('combat', `${monster.name} 触发流血：攻击力+${perLayer * (layersBefore - layersAfter)}，当前 ${newAttack}！`);
        setHeroSkillBanner(`${monster.name} 流血！攻击力升至 ${newAttack}！`);
      }
      if (monster.dragonBleedDestroy && layersAfter < layersBefore && layersAfter > 0 && !monster.isStunned) {
        depsRef.current.dragonBleedDestroyEquipment(monster.name, layersAfter);
      }
      if (monster.monsterSpecial === 'bone-regen' && !monster.isStunned) {
        void checkHollowSkeletonRestore(monster.id, monster.name, layersBefore, layersAfter);
      }
      if (monster.monsterSpecial === 'wraith-rebirth' && !monster.isStunned) {
        void checkWraithRebirth(monster.id, monster.name, monster.fury ?? monster.hpLayers ?? 1, layersBefore, layersAfter);
      }

      if (monster.golemLayerLossReflect && monster.golemLayerLossReflect > 0 && layersAfter < layersBefore && !monster.isStunned) {
        const totalLostLayers = (monster.fury ?? monster.hpLayers ?? 1) - layersAfter;
        const reflectDmg = monster.golemLayerLossReflect * totalLostLayers;
        const monsterName = monster.name;
        const coeff = monster.golemLayerLossReflect;
        depsRef.current.tryStartGolemLayerReflectFx(monster.id);
        setTimeout(() => {
          depsRef.current.applyDamage(reflectDmg);
          depsRef.current.addGameLog('combat', `${monsterName} 岩层反震：${coeff}×${totalLostLayers} 已损失血层，对英雄造成 ${reflectDmg} 点伤害！`);
          setHeroSkillBanner(`${monsterName} 岩层反震！受到 ${reflectDmg} 点伤害！`);
        }, depsRef.current.animSpeed(GOLEM_LAYER_REFLECT_ANIM_MS));
      }

      if (monster.monsterSpecial === 'swarm-elite' && !monster.isStunned) {
        setActiveCards(prev => {
          const candidates: number[] = [];
          for (let i = 0; i < prev.length; i++) {
            const c = prev[i];
            if (!c) continue;
            if (c.type === 'monster') continue;
            candidates.push(i);
          }
          if (candidates.length === 0) return prev;
          const targetIdx = candidates[Math.floor(Math.random() * candidates.length)];
          const replaced = prev[targetIdx]!;
          const next = [...prev] as ActiveRowSlots;
          next[targetIdx] = createBugletCard();
          depsRef.current.addToGraveyard(replaced);
          depsRef.current.addGameLog('combat', `${monster.name} 虫母：${replaced.name} 被小虫子替换！`);
          return next;
        });
        setHeroSkillBanner(`${monster.name} 虫母：场上一张牌变成了小虫子！`);
      }
    }
  };

  // -- Shield reflect / boss retaliation helpers ------------------------------

  type ShieldReflectOutcome = {
    shouldApplyBossRetaliation: boolean;
    bossRetaliationDamage: number;
    bossName: string;
  };

  const applyBossRetaliationDamage = (monsterName: string, retDmg: number) => {
    if (retDmg <= 0) return;
    setHp(prev => {
      const newHp = Math.max(0, prev - retDmg);
      if (newHp === 0) {
        depsRef.current.addGameLog('system', '英雄阵亡，游戏结束');
        setGameOver(true);
        setVictory(false);
      }
      return newHp;
    });
    depsRef.current.addHeroMagicGauge('holy-light', 1);
    depsRef.current.addGameLog('combat', `${monsterName} 反噬：造成 ${retDmg} 点直接伤害！`);
  };

  const applyShieldReflectDamage = (
    monsterSnapshot: GameCardData,
    baseReflectDamage: number,
    sourceName: string,
  ): ShieldReflectOutcome => {
    const noop: ShieldReflectOutcome = {
      shouldApplyBossRetaliation: false,
      bossRetaliationDamage: 0,
      bossName: monsterSnapshot.name,
    };
    if (baseReflectDamage <= 0 || depsRef.current.pendingDefeatIdsRef.current.has(monsterSnapshot.id)) {
      return noop;
    }
    const scaledDamage = Math.max(0, baseReflectDamage);

    let hpBeforeReflect = 0;
    let defeatedByReflect = false;
    let layersBeforeReflect = 0;
    let layersAfterReflect = 0;
    let damagedSnapshot: GameCardData | null = null;

    let reflectOverkill = 0;
    const ae = depsRef.current.amuletEffects;
    const reflectEffectiveLifesteal = permanentSpellLifesteal + ae.lifeOverkillBonus;
    updateMonsterCard(monsterSnapshot.id, card => {
      if ((card.currentLayer ?? 0) <= 0 || (card.hp ?? 0) <= 0) {
        return card;
      }
      hpBeforeReflect = card.hp ?? 0;
      layersBeforeReflect = card.currentLayer ?? card.fury ?? 1;
      if (reflectEffectiveLifesteal > 0) {
        reflectOverkill = computeOverkill(card, scaledDamage);
      }
      const damaged = damageMonsterWithLayerOverflow(card, scaledDamage);
      layersAfterReflect = damaged.currentLayer ?? 0;
      damagedSnapshot = damaged;
      if ((damaged.currentLayer ?? 0) <= 0 || (damaged.hp ?? 0) <= 0) {
        defeatedByReflect = true;
      }
      return damaged;
    });

    if (reflectOverkill > 0) {
      healHero(reflectEffectiveLifesteal, { healLogVariant: 'overkill-lifesteal' });
    }

    if (scaledDamage > 0 && damagedSnapshot != null) {
      recordClassDamageDiscoverHit();
    }

    depsRef.current.addGameLog('combat', `${sourceName} 反弹了 ${scaledDamage} 点伤害给 ${monsterSnapshot.name}`);

    const baseDelay = 0;
    const pulses = Math.max(1, Math.min(4, 1 + (layersBeforeReflect - layersAfterReflect)));
    for (let i = 0; i < pulses; i += 1) {
      depsRef.current.triggerMonsterBleedAnimation(monsterSnapshot.id, baseDelay + i * Math.floor(COMBAT_ANIMATION_STAGGER / 2));
    }

    if (monsterSnapshot.dragonDamageRetaliation && monsterSnapshot.dragonDamageRetaliation > 0 && !monsterSnapshot.isStunned && scaledDamage > 0) {
      applyDragonBreathRetaliation(monsterSnapshot.id, monsterSnapshot.name, monsterSnapshot.dragonDamageRetaliation);
    }

    const retDmg = monsterSnapshot.bossRetaliationDamage ?? 0;
    const hpAfterReflect =
      damagedSnapshot == null ? hpBeforeReflect : (damagedSnapshot as GameCardData).hp ?? 0;
    const dealtReflect =
      defeatedByReflect ||
      layersAfterReflect < layersBeforeReflect ||
      hpAfterReflect !== hpBeforeReflect;
    const shouldApplyBossRetaliation =
      !defeatedByReflect && retDmg > 0 && dealtReflect && Boolean(monsterSnapshot.bossRetaliationDamage) && !monsterSnapshot.isStunned;

    if (defeatedByReflect) {
      handleMonsterDefeated(monsterSnapshot);
      return {
        shouldApplyBossRetaliation: false,
        bossRetaliationDamage: retDmg,
        bossName: monsterSnapshot.name,
      };
    }

    if (layersAfterReflect < layersBeforeReflect && damagedSnapshot != null) {
      const afterReflectCard: GameCardData = damagedSnapshot;
      if (monsterSnapshot.bleedEffect && !monsterSnapshot.isStunned) {
        const newAttack = afterReflectCard.attack ?? afterReflectCard.value ?? 0;
        const perLayer = parseInt((monsterSnapshot.bleedEffect ?? '').replace('attack+', ''), 10) || 0;
        depsRef.current.addGameLog(
          'combat',
          `${monsterSnapshot.name} 触发流血：攻击力+${perLayer * (layersBeforeReflect - layersAfterReflect)}，当前 ${newAttack}！`,
        );
        setHeroSkillBanner(`${monsterSnapshot.name} 流血！攻击力升至 ${newAttack}！`);
      }
      if (monsterSnapshot.dragonBleedDestroy && layersAfterReflect > 0 && !monsterSnapshot.isStunned) {
        depsRef.current.dragonBleedDestroyEquipment(monsterSnapshot.name, layersAfterReflect);
      }
      if (monsterSnapshot.monsterSpecial === 'bone-regen' && !monsterSnapshot.isStunned) {
        void checkHollowSkeletonRestore(
          monsterSnapshot.id,
          monsterSnapshot.name,
          layersBeforeReflect,
          layersAfterReflect,
        );
      }
      if (monsterSnapshot.monsterSpecial === 'wraith-rebirth' && !monsterSnapshot.isStunned) {
        void checkWraithRebirth(
          monsterSnapshot.id,
          monsterSnapshot.name,
          monsterSnapshot.fury ?? monsterSnapshot.hpLayers ?? 1,
          layersBeforeReflect,
          layersAfterReflect,
        );
      }
    }

    return {
      shouldApplyBossRetaliation,
      bossRetaliationDamage: retDmg,
      bossName: monsterSnapshot.name,
    };
  };

  const runShieldReflectBossRetaliationSequence = async (
    m: GameCardData,
    rawReflectDmg: number,
    sourceName: string,
    slotId: EquipmentSlotId,
  ) => {
    if (rawReflectDmg <= 0) return;
    await new Promise<void>(r => setTimeout(r, depsRef.current.animSpeed(COMBAT_BLOCK_TO_REFLECT_MS)));
    depsRef.current.tryStartShieldReflectDirectedFx(slotId, m.id);
    await new Promise<void>(r => setTimeout(r, depsRef.current.animSpeed(SHIELD_REFLECT_ANIM_MS)));
    const outcome = applyShieldReflectDamage(m, rawReflectDmg, sourceName);
    if (outcome.shouldApplyBossRetaliation && outcome.bossRetaliationDamage > 0) {
      depsRef.current.tryStartBossRetaliationDirectedFx(m.id);
      await new Promise<void>(r => setTimeout(r, depsRef.current.animSpeed(BOSS_RETALIATION_ANIM_MS)));
      applyBossRetaliationDamage(outcome.bossName, outcome.bossRetaliationDamage);
    }
  };

  // -- healHero ---------------------------------------------------------------

  const healHero = useCallback(
    (
      baseAmount: number,
      options?: { healLogVariant?: 'default' | 'discard-empower-lifesteal' | 'overkill-lifesteal' },
    ) => {
      const ae = depsRef.current.amuletEffects;
      const multiplier = ae.hasHeal ? 2 : 1;
      const adjustedAmount = Math.max(0, Math.floor(baseAmount * multiplier));
      if (adjustedAmount <= 0) {
        return 0;
      }

      const currentHp = engine.getState().hp;
      const currentMaxHp =
        INITIAL_HP +
        (ae.aura?.maxHp ?? 0) +
        engine.getState().permanentMaxHpBonus +
        (engine.getState().permanentSkills.includes('Iron Will') ? 3 : 0) +
        (() => {
          const skillId = engine.getState().selectedHeroSkill;
          if (!skillId) return 0;
          try {
            const { getHeroSkillById } = require('@/lib/heroSkills');
            const def = getHeroSkillById(skillId as HeroSkillId);
            return def?.initialMaxHpBonus ?? 0;
          } catch {
            return 0;
          }
        })();
      const actualHeal = Math.min(adjustedAmount, Math.max(0, currentMaxHp - currentHp));

      setHp(prev => Math.min(currentMaxHp, prev + adjustedAmount));

      if (actualHeal > 0) {
        depsRef.current.setHealing(true);
        setTimeout(() => depsRef.current.setHealing(false), 1200);
        setTotalHealed(prev => prev + actualHeal);
        const healSuffix = ae.hasHeal ? '（治疗加倍）' : '';
        if (options?.healLogVariant === 'overkill-lifesteal') {
          depsRef.current.addGameLog('heal', `超杀吸血：回复 ${actualHeal} 点生命${healSuffix}`);
        } else if (options?.healLogVariant === 'discard-empower-lifesteal') {
          depsRef.current.addGameLog('heal', `噬血砺锋：吸血回复 ${actualHeal} 点生命${healSuffix}`);
        } else {
          depsRef.current.addGameLog('heal', `英雄回复 ${actualHeal} 点生命${healSuffix}`);
        }

        if (depsRef.current.eternalRelicsRef.current.some(r => r.id === 'heal-to-damage')) {
          const prevAccum = engine.getState().healAccumulator;
          const newAccum = prevAccum + actualHeal;
          const bonusGained = Math.floor(newAccum / 5) - Math.floor(prevAccum / 5);
          engine.setState({ healAccumulator: newAccum });
          if (bonusGained > 0) {
            setEquipmentSlotBonuses(prev => ({
              ...prev,
              equipmentSlot1: {
                ...prev.equipmentSlot1,
                damage: prev.equipmentSlot1.damage + bonusGained,
              },
              equipmentSlot2: {
                ...prev.equipmentSlot2,
                damage: prev.equipmentSlot2.damage + bonusGained,
              },
            }));
            depsRef.current.addGameLog('skill', `愈战愈勇：本次实际治疗 ${actualHeal}（累计 ${prevAccum} → ${newAccum}），左右装备栏各永久伤害 +${bonusGained}`);
          }
        }
      }

      return actualHeal;
    },
    [engine, setHp, setTotalHealed, setEquipmentSlotBonuses],
  );

  // -- applyDamage ------------------------------------------------------------

  const applyDamage = useCallback(
    (damage: number, source: 'combat' | 'general' = 'general', opts?: { blockedWithShield?: boolean; selfInflicted?: boolean }) => {
      let remainingDamage = Math.max(0, Math.floor(damage));
      if (remainingDamage <= 0) {
        return 0;
      }

      const hadShieldProtection = opts?.blockedWithShield ?? false;

      let shieldAbsorbed = 0;
      setTempShield(prev => {
        if (prev <= 0 || remainingDamage <= 0) {
          return prev;
        }
        shieldAbsorbed = Math.min(prev, remainingDamage);
        remainingDamage -= shieldAbsorbed;
        return prev - shieldAbsorbed;
      });

      if (remainingDamage <= 0) {
        depsRef.current.addGameLog('combat', `临时护盾吸收了 ${shieldAbsorbed} 点伤害`);
        return 0;
      }

      if (
        !depsRef.current.suppressDeathWardRef.current &&
        !deathWardPrompt &&
        remainingDamage >= hp
      ) {
        const wardCandidate = depsRef.current.findDeathWardCard();
        if (wardCandidate) {
          setDeathWardPrompt({
            ...wardCandidate,
            pendingDamage: remainingDamage,
            sourceType: source,
          });
          setHeroSkillBanner('命悬一线准备发动，是否消耗它来抵消致命伤害？');
          return 0;
        }
      }

      depsRef.current.setTakingDamage(true);
      setTimeout(() => depsRef.current.setTakingDamage(false), 200);
      depsRef.current.triggerHeroBleedAnimation();

      let appliedDamage = 0;
      setHp(prev => {
        const newHp = Math.max(0, prev - remainingDamage);
        appliedDamage = prev - newHp;
        if (newHp === 0) {
          depsRef.current.addGameLog('system', '英雄阵亡，游戏结束');
          setGameOver(true);
          setVictory(false);
        }
        return newHp;
      });

      depsRef.current.addHeroMagicGauge('holy-light', 1);
      if (opts?.selfInflicted) {
        depsRef.current.addHeroMagicGauge('revive-blessing', 1);
      }

      if (appliedDamage > 0) {
        setTotalDamageTaken(prev => prev + appliedDamage);
        setTurnDamageTaken(prev => prev + appliedDamage);
        depsRef.current.addGameLog('damage', `英雄受到 ${appliedDamage} 点伤害`);

        const ae = depsRef.current.amuletEffects;
        if (ae.hasBloodrageAttack && opts?.selfInflicted) {
          setBerserkTurnBuff(prev => ({
            equipmentSlot1: (prev.equipmentSlot1 ?? 0) + 2,
            equipmentSlot2: (prev.equipmentSlot2 ?? 0) + 2,
          }));
          depsRef.current.addGameLog('equip', `血怒战符：所有装备栏临时攻击 +2！`);

          if (ae.hasPersuadeOnTempAttack) {
            const pBonus = ae.persuadeOnTempAttackBonus || 5;
            depsRef.current.persuadeAmuletBonusRef.current += pBonus;
            depsRef.current.addGameLog('equip', `怀柔之印：下次劝降率 +${pBonus}%（累计 +${depsRef.current.persuadeAmuletBonusRef.current}%）`);
          }
        }
      }

      return appliedDamage;
    },
    [
      activeCards,
      deathWardPrompt,
      hp,
      setHp,
      setTempShield,
      setGameOver,
      setVictory,
      setTotalDamageTaken,
      setTurnDamageTaken,
      setBerserkTurnBuff,
      setDeathWardPrompt,
      setHeroSkillBanner,
    ],
  );

  // -- applyDragonBreathRetaliation -------------------------------------------

  const applyDragonBreathRetaliation = (
    monsterId: string,
    monsterName: string,
    retDmg: number,
  ) => {
    const { setEquipmentSlotById, triggerShieldBlockAnimation, addGameLog } = depsRef.current;
    const slots: { slotId: EquipmentSlotId; item: GameCardData | null }[] = [
      { slotId: 'equipmentSlot1', item: equipmentSlot1 },
      { slotId: 'equipmentSlot2', item: equipmentSlot2 },
    ];
    const validShields = slots.filter(
      s => s.item && (s.item.type === 'shield' || s.item.type === 'monster'),
    ) as { slotId: EquipmentSlotId; item: GameCardData }[];

    if (validShields.length > 0) {
      const target = validShields[Math.floor(Math.random() * validShields.length)];
      const { slotId, item } = target;

      depsRef.current.tryStartDragonBreathFx(monsterId, slotId);
      triggerShieldBlockAnimation(slotId);

      const isMonsterEquip = item.type === 'monster';
      const baseArmor = isMonsterEquip
        ? (item.hp ?? item.value)
        : (item.armorMax ?? item.value);
      const storedArmor = Math.min(item.armor ?? baseArmor, baseArmor);
      const newArmor = Math.max(0, storedArmor - retDmg);

      if (newArmor <= 0) {
        const { armor: _ca, armorBonusDamaged: _cb, ...resetBase } = item;
        setEquipmentSlotById(slotId, resetBase as EquipmentItem);
      } else {
        setEquipmentSlotById(slotId, { ...item, armor: newArmor } as EquipmentItem);
      }

      const slotLabel = slotId === 'equipmentSlot1' ? '左' : '右';
      addGameLog('combat', `${monsterName} 龙息反击：对${slotLabel}装备 ${item.name} 造成 ${retDmg} 点护甲伤害（${storedArmor}→${newArmor}）`);
      setHeroSkillBanner(`${monsterName} 龙息反击！${item.name} 护甲 -${Math.min(retDmg, storedArmor)}！`);
    } else {
      depsRef.current.tryStartDragonBreathFx(monsterId, 'hero');
      applyDamage(retDmg);
      addGameLog('combat', `${monsterName} 龙息反击：对玩家造成 ${retDmg} 点法术伤害！`);
      setHeroSkillBanner(`${monsterName} 龙息反击！受到 ${retDmg} 点伤害！`);
    }
  };

  // -- getEngagedMonsterCards / getActiveCombatMonster / finishCombat ----------

  const getEngagedMonsterCards = (): GameCardData[] => {
    return combatState.engagedMonsterIds
      .map(id => activeCards.find(card => card?.id === id))
      .filter((card): card is GameCardData => Boolean(card));
  };

  const getActiveCombatMonster = (): GameCardData | null => {
    const engaged = getEngagedMonsterCards();
    return engaged.length > 0 ? engaged[0] : null;
  };

  const flushRecycleBagToBackpack = () => {
    const bag = engine.getState().permanentMagicRecycleBag;
    if (!bag.length) return;

    const readyCards: GameCardData[] = [];
    const stillWaiting: (GameCardData & { _recycleWaits?: number })[] = [];
    for (const card of bag) {
      const waits = ((card as GameCardData & { _recycleWaits?: number })._recycleWaits ?? 1) - 1;
      if (waits <= 0) {
        const { _recycleWaits, ...clean } = card as GameCardData & { _recycleWaits?: number };
        readyCards.push(clean as GameCardData);
      } else {
        stillWaiting.push({ ...card, _recycleWaits: waits } as GameCardData & { _recycleWaits?: number });
      }
    }

    const st = engine.getState();
    const cap = Math.max(1, BASE_BACKPACK_CAPACITY + st.backpackCapacityModifier);
    const availableSlots = Math.max(0, cap - st.backpackItems.length);
    const toRestore = readyCards.slice(0, availableSlots);
    const overflow = readyCards.slice(availableSlots);

    setPermanentMagicRecycleBag([...overflow, ...stillWaiting] as GameCardData[]);

    if (toRestore.length > 0) {
      setBackpackItems(prev => [...prev, ...toRestore]);
      depsRef.current.addGameLog('combat', `战斗结束，回收袋 ${toRestore.length} 张牌洗回背包：${toRestore.map(c => c.name).join('、')}`);
    }
    if (overflow.length > 0) {
      depsRef.current.addGameLog('combat', `回收袋 ${overflow.length} 张牌因背包已满留在回收袋：${overflow.map(c => c.name).join('、')}`);
    }
    if (stillWaiting.length > 0) {
      depsRef.current.addGameLog('combat', `回收袋仍有 ${stillWaiting.length} 张牌等待瀑流：${stillWaiting.map(c => `${c.name}(还需${c._recycleWaits}次)`).join('、')}`);
    }
  };

  const finishCombat = () => {
    depsRef.current.addGameLog('combat', '战斗结束');
    setCombatState(initialCombatState);
    setBerserkerSlotUsed({});
    setFlashSlotUsed({});
    setGambitSlotUsed({});
    setWeaponExtraAttackUsed({});
    setHeroStunned(false);
    flushRecycleBagToBackpack();
  };

  // -- beginCombat ------------------------------------------------------------

  const beginCombat = (monster: GameCardData, initiator: CombatInitiator) => {
    if (monster.type === 'building') {
      return;
    }

    const currentLiveIds = combatState.engagedMonsterIds.filter(
      id => !depsRef.current.pendingDefeatIdsRef.current.has(id),
    );
    if (currentLiveIds.length === 0) {
      setBerserkerSlotUsed({});
      setFlashSlotUsed({});
      setGambitSlotUsed({});
      setWeaponExtraAttackUsed({});
    }

    depsRef.current.addGameLog('combat', `与 ${monster.name} 进入战斗（HP: ${monster.hp ?? monster.value}${(monster.currentLayer ?? 1) > 1 ? ` ×${monster.currentLayer}层` : ''}）`);
    setCombatState(prev => {
      const liveEngagedIds = prev.engagedMonsterIds.filter(
        id => !depsRef.current.pendingDefeatIdsRef.current.has(id),
      );
      const alreadyEngaged = liveEngagedIds.includes(monster.id);
      const nextEngaged = alreadyEngaged ? liveEngagedIds : [...liveEngagedIds, monster.id];

      if (liveEngagedIds.length === 0) {
        if (initiator === 'monster') {
          return {
            ...prev,
            engagedMonsterIds: nextEngaged,
            initiator,
            currentTurn: 'monster',
            heroAttacksThisTurn: {
              equipmentSlot1: false,
              equipmentSlot2: false,
            },
            heroAttacksRemaining: 2,
            heroDamageThisTurn: {},
            monsterAttackQueue: [],
            pendingBlock: {
              monsterId: monster.id,
              attackValue: monster.attack ?? monster.value,
              monsterName: monster.name,
            },
            slotBlocksThisTurn: {
              equipmentSlot1: false,
              equipmentSlot2: false,
            },
            slotDurabilityUsedThisTurn: {
              equipmentSlot1: 0,
              equipmentSlot2: 0,
            },
          };
        }
        return {
          ...prev,
          engagedMonsterIds: nextEngaged,
          initiator,
          currentTurn: 'hero',
          heroAttacksThisTurn: {
            equipmentSlot1: false,
            equipmentSlot2: false,
          },
          heroAttacksRemaining: 2,
          heroDamageThisTurn: {},
          monsterAttackQueue: [],
          pendingBlock: null,
          slotBlocksThisTurn: {
            equipmentSlot1: false,
            equipmentSlot2: false,
          },
          slotDurabilityUsedThisTurn: {
            equipmentSlot1: 0,
            equipmentSlot2: 0,
          },
        };
      }

      if (initiator === 'monster') {
        if (prev.currentTurn === 'hero' && !prev.pendingBlock) {
          return {
            ...prev,
            engagedMonsterIds: nextEngaged,
            currentTurn: 'monster',
            monsterAttackQueue: prev.monsterAttackQueue,
            pendingBlock: {
              monsterId: monster.id,
              attackValue: monster.attack ?? monster.value,
              monsterName: monster.name,
            },
          };
        }
        return {
          ...prev,
          engagedMonsterIds: nextEngaged,
          monsterAttackQueue: [...prev.monsterAttackQueue, monster.id],
        };
      }

      return {
        ...prev,
        engagedMonsterIds: nextEngaged,
        initiator: prev.initiator ?? initiator,
      };
    });
  };

  // -- applyHeroKillEffects ---------------------------------------------------

  const applyHeroKillEffects = (monsterHp: number) => {
    if (vampiricNextAttack) {
      const healAmount = Math.floor(monsterHp / 2);
      if (healAmount > 0) {
        healHero(healAmount);
      }
      setVampiricNextAttack(false);
    }
  };

  // -- performHeroAttack ------------------------------------------------------

  const performHeroAttack = async (slotId: EquipmentSlotId, targetMonster: GameCardData) => {
    const isBuildingNoEngaged = targetMonster.type === 'building' && combatState.engagedMonsterIds.length === 0;

    if (!isBuildingNoEngaged && combatState.currentTurn !== 'hero') {
      return;
    }

    const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
    if (!slotItem || (slotItem.type !== 'weapon' && slotItem.type !== 'monster')) {
      return;
    }

    const slotAlreadyAttacked = combatState.heroAttacksThisTurn[slotId];
    const hasBaseAttack = combatState.heroAttacksRemaining > 0;
    const canUseBerserkerExtra = berserkerRageActive && slotAlreadyAttacked && !berserkerSlotUsed[slotId];
    const ae = depsRef.current.amuletEffects;
    const canUseFlashExtra = ae.hasFlash && slotAlreadyAttacked && !flashSlotUsed[slotId];
    const canUseGambitExtra = gambitExtraActive && slotAlreadyAttacked && (gambitSlotUsed[slotId] ?? 0) < gambitExtraPerSlot;
    const canUseWeaponExtra = !!(slotItem.weaponExtraAttack) && slotAlreadyAttacked && (weaponExtraAttackUsed[slotId] ?? 0) < (slotItem.weaponExtraAttack ?? 0);
    const needsExtraCharge = slotAlreadyAttacked || !hasBaseAttack;
    if (!isBuildingNoEngaged && needsExtraCharge && !canUseBerserkerExtra && !canUseFlashExtra && !canUseGambitExtra && !canUseWeaponExtra && extraAttackCharges <= 0) {
      return;
    }
    if (!isBuildingNoEngaged && !needsExtraCharge && !hasBaseAttack) {
      return;
    }
    const usingBerserkerExtra = !isBuildingNoEngaged && needsExtraCharge && canUseBerserkerExtra;
    const usingFlashExtra = !isBuildingNoEngaged && needsExtraCharge && !usingBerserkerExtra && canUseFlashExtra;
    const usingGambitExtra = !isBuildingNoEngaged && needsExtraCharge && !usingBerserkerExtra && !usingFlashExtra && canUseGambitExtra;
    const usingWeaponExtra = !isBuildingNoEngaged && needsExtraCharge && !usingBerserkerExtra && !usingFlashExtra && !usingGambitExtra && canUseWeaponExtra;
    const usingExtraCharge = !isBuildingNoEngaged && needsExtraCharge && !usingBerserkerExtra && !usingFlashExtra && !usingGambitExtra && !usingWeaponExtra && extraAttackCharges > 0;

    const { addGameLog, getEquipmentSlotBonus, setEquipmentSlotBonus, setEquipmentSlotById,
      clearEquipmentSlotWithPromote, drawFromBackpackToHand, disposeOwnedEquipmentCard,
      requestDiceOutcome, triggerWeaponSwingAnimation, triggerMonsterBleedAnimation,
      addHeroMagicGauge, triggerGhostBladeExile, dragonBleedDestroyEquipment } = depsRef.current;

    const isMonsterEquip = slotItem.type === 'monster';
    const isMinionAttack = isMonsterEquip && !!(slotItem as GameCardData).isMinionCard;
    const goblinGoldPowerActive = isMonsterEquip && slotItem.eliteLowGoldPower && gold >= 30;
    const rawWeaponValue = isMonsterEquip ? (slotItem.attack ?? slotItem.value) : slotItem.value;
    const weaponValue = goblinGoldPowerActive ? rawWeaponValue * 2 : rawWeaponValue;
    const slotDamageBonus = getEquipmentSlotBonus(slotId, 'damage');
    const appliedNextBonus = nextWeaponBonus;
    const slotBurstBonus = slotAttackBursts[slotId] ?? 0;
    const tempAttackSuppressed = getEquipmentSlotsWithSuppressedTempAttack(
      activeCards,
      equipmentSlot1,
      equipmentSlot2,
    );
    let slotTempAttackBonus = slotTempAttack[slotId] ?? 0;
    if (tempAttackSuppressed.has(slotId)) slotTempAttackBonus = 0;
    const discardEmpowerLifestealThisAttack = nextAttackLifestealSlot === slotId;
    const slotBerserkBonus = berserkTurnBuff[slotId] ?? 0;
    const baseDamage = Math.max(
      0,
      weaponValue +
        depsRef.current.attackBonus +
        slotDamageBonus +
        slotBerserkBonus +
        appliedNextBonus +
        slotBurstBonus +
        slotTempAttackBonus,
    );
    let isCrit = false;
    if (slotItem.critChance) {
      const threshold = Math.round((slotItem.critChance / 100) * 20);
      const critResult = await requestDiceOutcome({
        title: slotItem.name,
        subtitle: '暴击判定',
        entries: [
          { id: 'crit', range: [1, threshold] as [number, number], label: '暴击！双倍伤害！', effect: 'none' },
          { id: 'normal', range: [threshold + 1, 20] as [number, number], label: '正常攻击', effect: 'none' },
        ],
      });
      isCrit = critResult?.id === 'crit';
    }
    if (isMonsterEquip && slotItem.monsterSpecial === 'ogre-crit') {
      isCrit = true;
    }
    const stunnedDoubleMultiplier = slotItem.doubleDamageOnStunned && targetMonster.isStunned ? 2 : 1;
    const preFinalDamage = (isCrit ? baseDamage * 2 : baseDamage) * stunnedDoubleMultiplier;
    const finalDamage = ae.hasFlash ? Math.max(0, Math.floor(preFinalDamage / 2)) : preFinalDamage;

    addHeroMagicGauge('berserker-rage', 1);

    if (appliedNextBonus > 0) {
      setNextWeaponBonus(0);
    }
    if (slotBurstBonus > 0) {
      setSlotAttackBursts(prev => ({
        ...prev,
        [slotId]: 0,
      }));
    }

    if (goblinGoldPowerActive) {
      addGameLog('equip', `${slotItem.name} 贪婪强化：金币 ≥ 30，攻击力翻倍！`);
    }
    if (isCrit) {
      addGameLog('combat', `暴击！${slotItem.name} 造成双倍伤害！`);
      setHeroSkillBanner(`暴击！双倍伤害！`);
    }
    if (stunnedDoubleMultiplier > 1) {
      addGameLog('combat', `${slotItem.name} 对击晕目标造成双倍伤害！`);
      setHeroSkillBanner(`击晕双击！双倍伤害！`);
    }
    addGameLog('combat', `使用 ${slotItem.name}(${slotItem.value}攻) 攻击 ${targetMonster.name}，伤害 ${finalDamage}${ae.hasFlash ? '（闪光减半）' : ''}`);

    if (slotItem.healOnAttack) {
      healHero(slotItem.healOnAttack);
      addGameLog('heal', `${slotItem.name} 攻击恢复了 ${slotItem.healOnAttack} 点生命`);
    }

    if (slotItem.onAttackDebuffAllMonsterAttack) {
      const debuff = slotItem.onAttackDebuffAllMonsterAttack;
      setActiveCards(prev => prev.map(c => {
        if (!c || c.type !== 'monster') return c;
        const curAtk = c.attack ?? c.value;
        const newAtk = Math.max(0, curAtk - debuff);
        return { ...c, attack: newAtk };
      }));
      addGameLog('combat', `${slotItem.name} 怒斩：所有怪物攻击力 -${debuff}！`);
    }

    if (slotItem.onAttackBuffOtherSlotTempAttack || slotItem.onAttackRepairOtherSlot) {
      const otherSlotId: EquipmentSlotId = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
      const otherItem = otherSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (slotItem.onAttackBuffOtherSlotTempAttack) {
        const atkBonus = slotItem.onAttackBuffOtherSlotTempAttack;
        setSlotTempAttack(prev => ({ ...prev, [otherSlotId]: (prev[otherSlotId] ?? 0) + atkBonus }));
        const otherLabel = otherSlotId === 'equipmentSlot1' ? '左' : '右';
        addGameLog('equip', `${slotItem.name} 共鸣：${otherLabel}装备栏临时攻击 +${atkBonus}`);
      }
      if (slotItem.onAttackRepairOtherSlot && otherItem && otherItem.durability != null && otherItem.maxDurability != null) {
        const repairAmt = slotItem.onAttackRepairOtherSlot;
        const newDur = Math.min(otherItem.maxDurability, otherItem.durability + repairAmt);
        if (newDur > otherItem.durability) {
          setEquipmentSlotById(otherSlotId, { ...otherItem, durability: newDur } as EquipmentItem);
          addGameLog('equip', `${slotItem.name} 共鸣：${otherItem.name} 耐久 +${newDur - otherItem.durability}`);
        }
      }
    }

    let workingMonster = targetMonster;
    let monsterDefeated = false;
    let totalRecordedDamage = 0;
    let discardEmpowerLifestealHpSum = 0;
    let strengthHits = 0;
    let overkillHitCount = 0;
    const attackEffectiveLifesteal = permanentSpellLifesteal + ae.lifeOverkillBonus;
    const layersBeforeAttack = targetMonster.currentLayer ?? targetMonster.fury ?? 1;
    const isBuildingTarget = targetMonster.type === 'building';

    triggerWeaponSwingAnimation(slotId, 0, { echoes: 2 });
    totalRecordedDamage += finalDamage;
    if (ae.hasStrength) {
      strengthHits += 1;
    }

    if (finalDamage > 0) {
      recordClassDamageDiscoverHit();
      const layerBeforeHit = workingMonster.currentLayer ?? workingMonster.fury ?? 1;
      const monsterHpBefore = workingMonster.hp ?? workingMonster.value;
      if (discardEmpowerLifestealThisAttack) {
        discardEmpowerLifestealHpSum += Math.min(finalDamage, monsterHpBefore);
      }
      const updatedMonster = damageMonsterWithLayerOverflow(workingMonster, finalDamage, 1);
      triggerMonsterBleedAnimation(targetMonster.id, 0);
      triggerMonsterBleedAnimation(
        targetMonster.id,
        Math.floor(COMBAT_ANIMATION_STAGGER / 2),
      );

      if (
        !isBuildingTarget &&
        workingMonster.bossRetaliationDamage &&
        workingMonster.bossRetaliationDamage > 0 &&
        !workingMonster.isStunned
      ) {
        const retDmg = workingMonster.bossRetaliationDamage;
        setHp(prev => {
          const newHp = Math.max(0, prev - retDmg);
          if (newHp === 0) {
            addGameLog('system', '英雄阵亡，游戏结束');
            setGameOver(true);
            setVictory(false);
          }
          return newHp;
        });
        addHeroMagicGauge('holy-light', 1);
        addGameLog('combat', `${targetMonster.name} 反噬：造成 ${retDmg} 点直接伤害！`);
      }

      if ((attackEffectiveLifesteal > 0 || slotItem.overkillDraw || slotItem.overkillRecycleToHand) && !isBuildingTarget) {
        const ok = computeOverkill(workingMonster, finalDamage);
        if (ok > 0) overkillHitCount += 1;
      }

      workingMonster = updatedMonster;
      const layerAfterHit = updatedMonster.currentLayer ?? 1;
      if (layerAfterHit < layerBeforeHit) {
        depsRef.current.heroTurnLayerLossIdsRef.current.add(targetMonster.id);
      }
      const remainingLayers = layerAfterHit;

      if (remainingLayers <= 0) {
        if (isBuildingTarget) {
          handleBuildingDestroyed(targetMonster);
          monsterDefeated = true;
        } else if (targetMonster.hasRevive && !targetMonster.reviveUsed) {
          handleMonsterDefeated(targetMonster, { killedByMinion: isMinionAttack });
          workingMonster = {
            ...workingMonster,
            currentLayer: 1,
            hp: workingMonster.maxHp ?? workingMonster.hp ?? 0,
            reviveUsed: true,
            ...(targetMonster.skeletonNoLayerCost ? { skeletonNoLayerCostActive: true } : {}),
          };
        } else {
          applyHeroKillEffects(monsterHpBefore);
          handleMonsterDefeated(targetMonster, { killedByMinion: isMinionAttack });
          monsterDefeated = true;
        }
      }
    }

    if (!monsterDefeated && isMonsterEquip && slotItem.swarmCorrode && !isBuildingTarget && targetMonster.type === 'monster') {
      const swarmLayersBefore = workingMonster.currentLayer ?? workingMonster.fury ?? 1;
      if (swarmLayersBefore > 1) {
        const swarmNewLayer = swarmLayersBefore - 1;
        workingMonster = {
          ...workingMonster,
          currentLayer: swarmNewLayer,
          hp: workingMonster.maxHp ?? workingMonster.hp ?? 0,
        };
        addGameLog('equip', `${slotItem.name} 虫蚀：${targetMonster.name} 立刻 -1 血层！（剩余 ${swarmNewLayer} 层）`);
        setHeroSkillBanner(`${slotItem.name} 虫蚀！-1 血层！`);
        depsRef.current.heroTurnLayerLossIdsRef.current.add(targetMonster.id);
      } else if (swarmLayersBefore === 1) {
        workingMonster = { ...workingMonster, currentLayer: 0, hp: 0 };
        addGameLog('equip', `${slotItem.name} 虫蚀：${targetMonster.name} 最后 1 层被吞噬！`);
        applyHeroKillEffects(workingMonster.hp ?? 0);
        handleMonsterDefeated(targetMonster, { killedByMinion: isMinionAttack });
        monsterDefeated = true;
      }
    }

    if (overkillHitCount > 0 && attackEffectiveLifesteal > 0) {
      healHero(attackEffectiveLifesteal * overkillHitCount, { healLogVariant: 'overkill-lifesteal' });
    }

    if (overkillHitCount > 0 && slotItem.overkillDraw) {
      const drawCount = slotItem.overkillDraw * overkillHitCount;
      const drawnNames: string[] = [];
      for (let i = 0; i < drawCount; i++) {
        const drawn = drawFromBackpackToHand();
        if (drawn) drawnNames.push(drawn.name);
      }
      if (drawnNames.length > 0) {
        addGameLog('equip', `${slotItem.name} 超杀抽牌：抽到 ${drawnNames.join('、')}`);
      }
    }

    if (overkillHitCount > 0 && slotItem.overkillRecycleToHand) {
      const recycleCount = slotItem.overkillRecycleToHand * overkillHitCount;
      const recycled = depsRef.current.drawFromRecycleBagToHand(recycleCount);
      if (recycled.length > 0) {
        addGameLog('equip', `${slotItem.name} 超杀回收：从回收袋取回 ${recycled.map(c => c.name).join('、')}`);
      }
    }

    if (discardEmpowerLifestealThisAttack) {
      if (discardEmpowerLifestealHpSum > 0) {
        healHero(discardEmpowerLifestealHpSum, { healLogVariant: 'discard-empower-lifesteal' });
      }
      setNextAttackLifestealSlot(null);
    }

    if (ae.hasStrength && strengthHits > 0) {
      applyDamage(strengthHits * STRENGTH_SELF_DAMAGE, 'general', { selfInflicted: true });
    }

    if (ae.hasAttackPersuadeDiscount) {
      const existing = depsRef.current.persuadeDiscountRef?.current;
      const currentReduction = existing?.costReduction ?? 0;
      const currentRate = existing?.rateBonus ?? 0;
      const discountStep = 3;
      const newReduction = currentReduction + discountStep;
      depsRef.current.persuadeDiscountRef.current = {
        costReduction: newReduction,
        rateBonus: currentRate,
      };
      depsRef.current.setPersuadeTempDiscount(newReduction);
      addGameLog('amulet', `降服之符：攻击后下次劝降费用 -${discountStep}（累计 -${newReduction}）`);
    }

    setCombatState(prev => ({
      ...prev,
      engagedMonsterIds:
        isBuildingTarget || prev.engagedMonsterIds.includes(targetMonster.id)
          ? prev.engagedMonsterIds
          : [...prev.engagedMonsterIds, targetMonster.id],
      heroAttacksRemaining: isBuildingNoEngaged
        ? prev.heroAttacksRemaining
        : prev.heroAttacksRemaining > 0 ? Math.max(0, prev.heroAttacksRemaining - 1) : prev.heroAttacksRemaining,
      heroAttacksThisTurn: isBuildingNoEngaged
        ? prev.heroAttacksThisTurn
        : { ...prev.heroAttacksThisTurn, [slotId]: true },
      heroDamageThisTurn: {
        ...prev.heroDamageThisTurn,
        [targetMonster.id]: (prev.heroDamageThisTurn[targetMonster.id] || 0) + totalRecordedDamage,
      },
    }));

    if (bulwarkPassiveActive > 0) {
      const tempGain = 2 * bulwarkPassiveActive;
      setSlotTempAttack(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + tempGain }));
      const label = slotId === 'equipmentSlot1' ? '左' : '右';
      addGameLog('magic', `永恒护符·瀑流铸剑：${label}装备栏临时攻击 +${tempGain}`);
    }

    if (usingExtraCharge) {
      consumeExtraAttackCharge();
    }

    if (usingBerserkerExtra) {
      setBerserkerSlotUsed(prev => ({ ...prev, [slotId]: true }));
    }

    if (usingFlashExtra) {
      setFlashSlotUsed(prev => ({ ...prev, [slotId]: true }));
    }

    if (usingGambitExtra) {
      setGambitSlotUsed(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + 1 }));
    }

    if (usingWeaponExtra) {
      setWeaponExtraAttackUsed(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + 1 }));
    }

    if (isMonsterEquip && slotItem.onAttackEffect?.startsWith('steal-gold-')) {
      const stealAmount = parseInt(slotItem.onAttackEffect.replace('steal-gold-', ''), 10) || 0;
      if (stealAmount > 0) {
        setGold(prev => prev + stealAmount);
        addGameLog('equip', `${slotItem.name} 动手偷钱：获得 ${stealAmount} 金币！`);
        setHeroSkillBanner(`${slotItem.name} 偷到了 ${stealAmount} 金币！`);
        if (slotItem.goblinStealScale) {
          const updatedAttack = (slotItem.attack ?? slotItem.value) + stealAmount;
          const updatedHp = (slotItem.hp ?? 0) + stealAmount;
          setEquipmentSlotById(slotId, {
            ...slotItem,
            attack: updatedAttack,
            value: updatedAttack,
            hp: updatedHp,
          } as EquipmentItem);
          addGameLog('equip', `${slotItem.name} 贪婪强化：攻击力 +${stealAmount}，护甲值 +${stealAmount}！`);
        }
      }
    }

    let weaponSurvivedWithDurability = slotItem.durability ?? 0;
    let weaponDestroyed = false;

    const killRestoresDurability = monsterDefeated && slotItem.restoreDurabilityOnKill && !!slotItem.maxDurability;
    if (!berserkerRageActive && !unbreakableUntilWaterfall[slotId] && !killRestoresDurability) {
      let skipDurabilityLoss = false;
      const saveChance = slotItem.weaponDurabilitySaveChance;
      if (saveChance && saveChance > 0 && !unbreakableNext) {
        const threshold = Math.round((saveChance / 100) * 20);
        const result = await requestDiceOutcome({
          title: slotItem.name,
          subtitle: '耐久判定',
          entries: [
            { id: 'save', range: [1, threshold] as [number, number], label: '耐久保留！', effect: 'none' },
            { id: 'lose', range: [threshold + 1, 20] as [number, number], label: '耐久 -1', effect: 'none' },
          ],
        });
        if (result?.id === 'save') {
          skipDurabilityLoss = true;
          addGameLog('equip', `${slotItem.name} 幸运地保住了耐久！`);
        }
      }

      if (!skipDurabilityLoss) {
        const weaponDurability = slotItem.durability ?? 1;
        if (isMonsterEquip && (slotItem.monsterSpecial === 'bone-regen' || slotItem.monsterSpecial === 'skeleton-king')) {
          const boneResult = await requestDiceOutcome({
            title: slotItem.name,
            subtitle: '虚骨再生判定',
            entries: [
              { id: 'regen', range: [1, 10] as [number, number], label: '耐久保留！', effect: 'none' },
              { id: 'lose', range: [11, 20] as [number, number], label: '耐久 -1', effect: 'none' },
            ],
          });
          if (boneResult?.id === 'regen') {
            skipDurabilityLoss = true;
            addGameLog('equip', `${slotItem.name} 虚骨再生：幸运保住了耐久！`);
            setHeroSkillBanner(`${slotItem.name} 虚骨再生！`);
          }
        }
      }
      if (!skipDurabilityLoss) {
        const weaponDurability = slotItem.durability ?? 1;
        if (weaponDurability <= 1 && !unbreakableNext) {
          // --- 遗言 effects (fire BEFORE revive, regardless of revive availability) ---
          const hasLastWords = slotItem.onDestroyHeal || slotItem.onDestroyGold || slotItem.onDestroyDraw
            || slotItem.onDestroyClassDraw || slotItem.onDestroyPermanentDamage || slotItem.onDestroyPermanentShield || slotItem.onDestroyEffect
            || (isMonsterEquip && (slotItem.lastWords || slotItem.wraithDeathHeal || slotItem.wraithDeathHealSpread || slotItem.skeletonLastWordsDiscard));
          if (hasLastWords) {
            addGameLog('equip', `${slotItem.name} 遗言触发！`);
          }
          if (slotItem.onDestroyHeal) {
            healHero(slotItem.onDestroyHeal);
            addGameLog('equip', `${slotItem.name} 遗言：恢复了 ${slotItem.onDestroyHeal} 点生命`);
          }
          if (slotItem.onDestroyGold) {
            setGold(prev => prev + slotItem.onDestroyGold!);
            addGameLog('equip', `${slotItem.name} 遗言：获得了 ${slotItem.onDestroyGold} 金币`);
          }
          if (slotItem.onDestroyDraw) {
            const drawnNames: string[] = [];
            for (let i = 0; i < slotItem.onDestroyDraw; i++) {
              const drawn = drawFromBackpackToHand();
              if (drawn) drawnNames.push(drawn.name);
            }
            if (drawnNames.length > 0) {
              addGameLog('equip', `${slotItem.name} 遗言：抽到了 ${drawnNames.join('、')}`);
            }
          }
          if (slotItem.onDestroyClassDraw) {
            const classDrawn = depsRef.current.drawClassCardsToBackpack(slotItem.onDestroyClassDraw, `${slotItem.name}-遗言`);
            if (classDrawn.length > 0) {
              depsRef.current.triggerClassDeckFlight(classDrawn);
              addGameLog('equip', `${slotItem.name} 遗言：获得专属卡「${classDrawn.map(c => c.name).join('、')}」`);
            }
          }
          if (slotItem.onDestroyPermanentDamage) {
            setEquipmentSlotBonus(slotId, 'damage', cur => cur + slotItem.onDestroyPermanentDamage!);
            addGameLog('equip', `${slotItem.name} 遗言：该装备栏永久伤害 +${slotItem.onDestroyPermanentDamage}！`);
            setHeroSkillBanner(`${slotItem.name} 遗言！永久伤害 +${slotItem.onDestroyPermanentDamage}！`);
          }
          if (slotItem.onDestroyPermanentShield) {
            setEquipmentSlotBonus(slotId, 'shield', cur => cur + slotItem.onDestroyPermanentShield!);
            addGameLog('equip', `${slotItem.name} 遗言：该装备栏永久护甲 +${slotItem.onDestroyPermanentShield}！`);
            setHeroSkillBanner(`${slotItem.name} 遗言！永久护甲 +${slotItem.onDestroyPermanentShield}！`);
          }
          if (slotItem.onDestroyEffect) {
            if (slotItem.onDestroyEffect === 'slot-temp-buff-3-3') {
              setSlotTempAttack(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + 3 }));
              setSlotTempArmor(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + 3 }));
              addGameLog('equip', `${slotItem.name} 遗言：该装备栏 +3临时攻击 +3临时护甲！`);
              setHeroSkillBanner(`${slotItem.name} 遗言！该装备栏 +3临时攻击 +3临时护甲！`);
            } else {
              addGameLog('equip', `${slotItem.name} 遗言：${slotItem.onDestroyEffect}`);
            }
          }
          if (isMonsterEquip) {
            if (slotItem.lastWords === 'discard-hand-3') {
              const drawnNames: string[] = [];
              for (let i = 0; i < 3; i++) {
                const drawn = drawFromBackpackToHand();
                if (drawn) drawnNames.push(drawn.name);
              }
              if (drawnNames.length > 0) {
                addGameLog('equip', `${slotItem.name} 遗言：抽到了 ${drawnNames.join('、')}`);
                setHeroSkillBanner(`${slotItem.name} 遗言：抽取 ${drawnNames.length} 张牌！`);
              }
            }
            if (slotItem.skeletonLastWordsDiscard) {
              const skelDrawn = drawFromBackpackToHand();
              if (skelDrawn) {
                addGameLog('equip', `${slotItem.name} 遗言：抽到了「${skelDrawn.name}」`);
                setHeroSkillBanner(`${slotItem.name} 遗言：抽取 1 张牌！`);
              }
            }
            if (slotItem.lastWords?.startsWith('wraith-haunt')) {
              const hauntAmount = parseInt(slotItem.lastWords.replace('wraith-haunt-', ''), 10) || 2;
              const otherSlotId: EquipmentSlotId = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
              const otherItem = otherSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
              if (otherItem) {
                setEquipmentSlotBonus(otherSlotId, 'damage', cur => cur + hauntAmount);
                addGameLog('equip', `${slotItem.name} 遗言：${otherItem.name} 获得临时攻击力 +${hauntAmount}！`);
              }
            }
            if (slotItem.wraithDeathHeal || slotItem.wraithDeathHealSpread) {
              const otherSlotId: EquipmentSlotId = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
              const otherItem = otherSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
              if (otherItem && otherItem.durability != null && otherItem.maxDurability != null) {
                const newDur = Math.min(otherItem.maxDurability, otherItem.durability + 1);
                let updatedOther = { ...otherItem } as EquipmentItem;
                if (newDur > otherItem.durability) {
                  updatedOther = { ...updatedOther, durability: newDur };
                  addGameLog('equip', `${slotItem.name} 怨灵祝福：${otherItem.name} 耐久 +1！`);
                }
                if (slotItem.wraithDeathHealSpread && !otherItem.wraithDeathHeal) {
                  updatedOther = { ...updatedOther, wraithDeathHeal: 1 };
                  addGameLog('equip', `${slotItem.name} 怨灵传承：${otherItem.name} 获得遗言「怨灵祝福」！`);
                }
                setEquipmentSlotById(otherSlotId, updatedOther);
              }
            }
          }

          // --- Revive check (after 遗言) ---
          const nativeReviveAvailable = isMonsterEquip && slotItem.hasRevive && !slotItem.reviveUsed;
          const equipReviveAvailable = slotItem.hasEquipmentRevive && !slotItem.equipmentReviveUsed;
          const canRevive = nativeReviveAvailable || equipReviveAvailable;
          if (canRevive) {
            const reviveUpdate = nativeReviveAvailable
              ? { ...slotItem, durability: 1, reviveUsed: true }
              : { ...slotItem, durability: 1, equipmentReviveUsed: true };
            setEquipmentSlotById(slotId, reviveUpdate as EquipmentItem);
            addGameLog('equip', `${slotItem.name} 复生！以 1 耐久复活！`);
            setHeroSkillBanner(`${slotItem.name} 复生了！`);
            weaponSurvivedWithDurability = 1;
          } else {
            weaponDestroyed = true;
            addGameLog('equip', `${slotItem.name} 损坏了`);
            disposeOwnedEquipmentCard({ ...slotItem }, { isDestruction: true });
            const otherSlotIdForSwap: EquipmentSlotId = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
            const otherItemForSwap = otherSlotIdForSwap === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
            if (isMonsterEquip && slotItem.lastWords?.startsWith('wraith-haunt') && Math.random() < 0.5 && otherItemForSwap) {
              setEquipmentSlotById(slotId, { ...otherItemForSwap, fromSlot: slotId } as EquipmentItem);
              clearEquipmentSlotWithPromote(otherSlotIdForSwap);
              const swapLabel = slotId === 'equipmentSlot1' ? '左' : '右';
              addGameLog('equip', `幽魂作祟：${otherItemForSwap.name} 被移到了${swapLabel}装备栏！`);
            } else {
              clearEquipmentSlotWithPromote(slotId);
            }
            const skelReReviveSlotId: EquipmentSlotId = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
            const skelReReviveItem = skelReReviveSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
            if (skelReReviveItem && skelReReviveItem.type === 'monster' && skelReReviveItem.skeletonReRevive
              && (!skelReReviveItem.hasRevive || skelReReviveItem.reviveUsed)) {
              setEquipmentSlotById(skelReReviveSlotId, { ...skelReReviveItem, hasRevive: true, reviveUsed: false } as EquipmentItem);
              addGameLog('equip', `${skelReReviveItem.name} 亡骨轮回：获得了「复生」！`);
              setHeroSkillBanner(`${skelReReviveItem.name} 亡骨轮回！`);
            }
          }
        } else {
          const safeDurability = weaponDurability <= 1 ? weaponDurability : weaponDurability - 1;
          let updatedDurability = unbreakableNext && weaponDurability <= 1 ? weaponDurability : safeDurability;
          let updatedSlotItem = { ...slotItem, durability: updatedDurability };
          const durabilityActuallyLost = updatedDurability < weaponDurability;

          if (isMonsterEquip && durabilityActuallyLost) {
            if (slotItem.bleedEffect) {
              const bleedBonus = 3;
              updatedSlotItem = {
                ...updatedSlotItem,
                attack: (updatedSlotItem.attack ?? updatedSlotItem.value) + bleedBonus,
                value: updatedSlotItem.value + bleedBonus,
                specialAttackBoost: (updatedSlotItem.specialAttackBoost ?? 0) + bleedBonus,
              };
              addGameLog('equip', `${slotItem.name} 流血：攻击力 +${bleedBonus}！（当前 ${updatedSlotItem.attack}）`);
            }
            if (slotItem.dragonBleedDestroy) {
              const remainingDur = updatedDurability;
              const otherSlotId: EquipmentSlotId = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
              const otherItem = otherSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
              let destroyed = false;
              if (otherItem && (otherItem.durability ?? 0) > remainingDur) {
                const card = otherItem as GameCardData;
                const isOtherMonster = card.type === 'monster';
                const nativeRevive = isOtherMonster && card.hasRevive && !card.reviveUsed;
                const equipRevive = card.hasEquipmentRevive && !card.equipmentReviveUsed;
                if (nativeRevive || equipRevive) {
                  const revived = nativeRevive
                    ? { ...card, durability: 1, reviveUsed: true }
                    : { ...card, durability: 1, equipmentReviveUsed: true };
                  setEquipmentSlotById(otherSlotId, revived as EquipmentItem);
                  addGameLog('equip', `${slotItem.name} 流血破甲：「${otherItem.name}」（耐久 ${otherItem.durability} > ${remainingDur}）复生了！`);
                } else {
                  clearEquipmentSlotWithPromote(otherSlotId);
                  disposeOwnedEquipmentCard(card, { isDestruction: true });
                  addGameLog('equip', `${slotItem.name} 流血破甲：破坏了「${otherItem.name}」（耐久 ${otherItem.durability} > ${remainingDur}）！`);
                  if (slotItem.type === 'monster' && slotItem.skeletonReRevive
                    && (!slotItem.hasRevive || slotItem.reviveUsed)) {
                    updatedSlotItem = { ...updatedSlotItem, hasRevive: true, reviveUsed: false };
                    addGameLog('equip', `${slotItem.name} 亡骨轮回：获得了「复生」！`);
                    setHeroSkillBanner(`${slotItem.name} 亡骨轮回！`);
                  }
                }
                destroyed = true;
              }
              if (destroyed) {
                setHeroSkillBanner(`${slotItem.name} 流血破甲！高耐久装备被破坏！`);
              }
            }
            if (slotItem.monsterSpecial === 'wraith-rebirth' && updatedDurability === 1 && !slotItem.wraithRebirthUsed) {
              if (Math.random() < 0.5) {
                const maxDur = slotItem.maxDurability ?? weaponDurability;
                updatedSlotItem = { ...updatedSlotItem, durability: maxDur, wraithRebirthUsed: true };
                updatedDurability = maxDur;
                addGameLog('equip', `${slotItem.name} 幽魂重生：耐久回满！（${maxDur}）`);
                setHeroSkillBanner(`${slotItem.name} 幽魂重生！`);
              } else {
                updatedSlotItem = { ...updatedSlotItem, wraithRebirthUsed: true };
                addGameLog('equip', `${slotItem.name} 幽魂重生失败！（50%）`);
              }
            }
            if (slotItem.monsterSpecial === 'swarm-elite') {
              const otherSwarmSlotId: EquipmentSlotId = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
              const otherSwarmItem = otherSwarmSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
              if (otherSwarmItem) {
                disposeOwnedEquipmentCard(otherSwarmItem as GameCardData, { isDestruction: true });
              }
              const bugletEquip = createBugletCard();
              const bugletAsEquip: EquipmentItem = {
                ...bugletEquip,
                durability: 1,
                maxDurability: 1,
              };
              setEquipmentSlotById(otherSwarmSlotId, bugletAsEquip);
              addGameLog('equip', `${slotItem.name} 虫母孵化：${otherSwarmItem ? otherSwarmItem.name + ' 被替换为' : ''}小虫子！`);
              setHeroSkillBanner(`${slotItem.name} 虫母孵化！`);
            }
            if (slotItem.golemLayerLossReflect && slotItem.golemLayerLossReflect > 0) {
              const golemMaxDur = slotItem.maxDurability ?? weaponDurability;
              const golemLostDur = golemMaxDur - updatedDurability;
              if (golemLostDur > 0) {
                const golemCoeff = slotItem.golemLayerLossReflect;
                const golemReflectDmg = golemCoeff * golemLostDur;
                const golemTargets = flattenActiveRowSlots(depsRef.current.activeCardsLatestRef.current).filter(
                  (c): c is GameCardData => Boolean(c && c.type === 'monster'),
                );
                if (golemTargets.length > 0) {
                  const golemTarget = golemTargets[Math.floor(Math.random() * golemTargets.length)];
                  depsRef.current.tryStartShieldReflectDirectedFx(slotId, golemTarget.id);
                  dealDamageToMonster(golemTarget, golemReflectDmg, { pulses: 1 });
                  addGameLog('equip', `${slotItem.name} 岩层反震：${golemCoeff}×${golemLostDur} = ${golemReflectDmg} 点伤害，命中 ${golemTarget.name}！`);
                  setHeroSkillBanner(`${slotItem.name} 岩层反震！${golemReflectDmg} 伤害！`);
                }
              }
            }
          }
          setEquipmentSlotById(slotId, updatedSlotItem as EquipmentItem);
          weaponSurvivedWithDurability = updatedDurability;
          if (weaponDurability <= 1 && unbreakableNext) {
            setUnbreakableNext(false);
          }
        }
      }
    }

    const knightSlotItem = slotItem as GameCardData & { weaponBonus?: number; healOnKill?: number };
    if (knightSlotItem.weaponBonus) {
      const bonusGain = knightSlotItem.weaponBonus;
      setEquipmentSlotBonus(slotId, 'damage', cur => cur + bonusGain);
      addGameLog('equip', `${slotItem.name} 永久伤害 +${bonusGain}（该装备栏）`);
    }

    if (monsterDefeated && knightSlotItem.healOnKill) {
      healHero(knightSlotItem.healOnKill);
      addGameLog('heal', `${slotItem.name} 击杀回复 ${knightSlotItem.healOnKill} 点生命`);
    }

    if (monsterDefeated && slotItem.restoreDurabilityOnKill && slotItem.maxDurability) {
      setEquipmentSlotById(slotId, { ...slotItem, durability: slotItem.maxDurability });
      addGameLog('equip', `${slotItem.name} 击杀后耐久度回满！`);
      setHeroSkillBanner(`${slotItem.name} 耐久度回满！`);
    }

    if (monsterDefeated && slotItem.killGoldScaling) {
      const goldAmount = slotItem.killGoldCounter ?? 2;
      setGold(prev => prev + goldAmount);
      addGameLog('equip', `${slotItem.name} 赏金：击杀获得 ${goldAmount} 金币`);
      if (!weaponDestroyed) {
        setEquipmentSlotById(slotId, {
          ...slotItem,
          durability: weaponSurvivedWithDurability,
          killGoldCounter: goldAmount + 1,
        } as EquipmentItem);
      }
    }

    if (!monsterDefeated && targetMonster.type === 'monster' && slotItem.persuadeBoostOnHit) {
      const isTargetElite = Boolean(targetMonster.monsterSpecial);
      const actualBoost = isTargetElite
        ? (slotItem.persuadeBoostOnHitElite ?? Math.floor(slotItem.persuadeBoostOnHit / 2))
        : slotItem.persuadeBoostOnHit;
      depsRef.current.persuadeAmuletBonusRef.current += actualBoost;
      addGameLog('equip', `${slotItem.name}：下次劝降概率 +${actualBoost}%（累计 +${depsRef.current.persuadeAmuletBonusRef.current}%）${isTargetElite ? '（精英减半）' : ''}`);
    }

    if (!monsterDefeated) {
      updateMonsterCard(targetMonster.id, () => workingMonster);
      const layersAfterAttack = workingMonster.currentLayer ?? 0;
      if (layersAfterAttack < layersBeforeAttack) {
        depsRef.current.heroTurnLayerLossIdsRef.current.add(targetMonster.id);
      }
      if (targetMonster.type === 'monster' && targetMonster.bleedEffect && layersAfterAttack < layersBeforeAttack && !targetMonster.isStunned) {
        const newAttack = workingMonster.attack ?? workingMonster.value;
        const perLayer = parseInt((targetMonster.bleedEffect ?? '').replace('attack+', ''), 10) || 0;
        addGameLog('combat', `${targetMonster.name} 触发流血：攻击力+${perLayer * (layersBeforeAttack - layersAfterAttack)}，当前 ${newAttack}！`);
        setHeroSkillBanner(`${targetMonster.name} 流血！攻击力升至 ${newAttack}！`);
      }
      if (targetMonster.type === 'monster' && !targetMonster.isStunned) {
        if (targetMonster.dragonDamageRetaliation && targetMonster.dragonDamageRetaliation > 0) {
          applyDragonBreathRetaliation(targetMonster.id, targetMonster.name, targetMonster.dragonDamageRetaliation);
        }
        if (targetMonster.dragonBleedDestroy && layersAfterAttack < layersBeforeAttack && layersAfterAttack > 0) {
          dragonBleedDestroyEquipment(targetMonster.name, layersAfterAttack);
        }
        if (targetMonster.monsterSpecial === 'bone-regen') {
          await checkHollowSkeletonRestore(targetMonster.id, targetMonster.name, layersBeforeAttack, layersAfterAttack);
        }
        if (targetMonster.monsterSpecial === 'wraith-rebirth') {
          await checkWraithRebirth(targetMonster.id, targetMonster.name, targetMonster.fury ?? targetMonster.hpLayers ?? 1, layersBeforeAttack, layersAfterAttack);
        }

        if (targetMonster.monsterSpecial === 'swarm-elite') {
          setActiveCards(prev => {
            const candidates: number[] = [];
            for (let i = 0; i < prev.length; i++) {
              const c = prev[i];
              if (!c) continue;
              if (c.type === 'monster') continue;
              candidates.push(i);
            }
            if (candidates.length === 0) return prev;
            const targetIdx = candidates[Math.floor(Math.random() * candidates.length)];
            const replaced = prev[targetIdx]!;
            const next = [...prev] as ActiveRowSlots;
            next[targetIdx] = createBugletCard();
            depsRef.current.addToGraveyard(replaced);
            depsRef.current.addGameLog('combat', `${targetMonster.name} 虫母：${replaced.name} 被小虫子替换！`);
            return next;
          });
          setHeroSkillBanner(`${targetMonster.name} 虫母：场上一张牌变成了小虫子！`);
        }

        const weaponStunChance = (slotItem.weaponStunChance ?? 0) + (amuletEffects.stunRateBoost ?? 0);
        const effectiveStunChance = stunCap > 0 ? Math.min(weaponStunChance, stunCap) : weaponStunChance;
        if (effectiveStunChance > 0 && !workingMonster.isStunned) {
          const threshold = Math.round((effectiveStunChance / 100) * 20);
          if (threshold > 0) {
            const stunResult = await requestDiceOutcome({
              title: targetMonster.name,
              subtitle: '击晕判定',
              entries: [
                { id: 'stun', range: [1, threshold] as [number, number], label: '击晕成功！', effect: 'none' },
                { id: 'miss', range: [threshold + 1, 20] as [number, number], label: '未击晕', effect: 'none' },
              ],
            });
            if (stunResult?.id === 'stun') {
              updateMonsterCard(targetMonster.id, card => ({ ...card, isStunned: true }));
              addGameLog('combat', `${targetMonster.name} 被击晕了！下回合无法行动！`);
              setHeroSkillBanner(`${targetMonster.name} 被击晕！`);

              if (ae.hasStunRecycleToHand) {
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

              if (ae.hasStunUpgradeCap) {
                setStunCap(prev => {
                  const next = Math.min(100, prev + 5);
                  addGameLog('amulet', `震慑之符：击晕成功，击晕上限 +5%（当前 ${next}%）`);
                  return next;
                });
              }
            }
          }
        }
      }
    }

    if (!monsterDefeated && isMonsterEquip && slotItem.goblinStackHeal && targetMonster.type === 'monster') {
      const st = engine.getState();
      const backpackFull = st.backpackItems.length >= (12 + st.backpackCapacityModifier);
      if (!backpackFull) {
        const clampedPersuadeRate = depsRef.current.computePersuadeSuccessRate(targetMonster);
        const persuadeThreshold = Math.round((clampedPersuadeRate / 100) * 20);
        const persuadeResult = await requestDiceOutcome({
          title: `${slotItem.name} 劝降`,
          subtitle: `对 ${targetMonster.name} 发动劝降（${clampedPersuadeRate}%）`,
          entries: [
            { id: 'success', range: [1, persuadeThreshold] as [number, number], label: '劝降成功！', effect: 'none' },
            { id: 'fail', range: [persuadeThreshold + 1, 20] as [number, number], label: '劝降失败', effect: 'none' },
          ],
        });
        if (persuadeResult?.id === 'success') {
          const monsterMaxDur = targetMonster.fury ?? targetMonster.hpLayers ?? 1;
          const persuadedCard: GameCardData = {
            ...targetMonster,
            durability: monsterMaxDur,
            maxDurability: monsterMaxDur,
          };
          depsRef.current.addCardToBackpack(persuadedCard, { pendingDungeonCardId: targetMonster.id });
          depsRef.current.removeCard(targetMonster.id, false);
          monsterDefeated = true;
          addGameLog('equip', `${slotItem.name} 劝降成功！${targetMonster.name} 加入背包！`);
          setHeroSkillBanner(`${slotItem.name} 劝降了 ${targetMonster.name}！`);
        } else {
          addGameLog('equip', `${slotItem.name} 劝降 ${targetMonster.name} 失败。`);
        }
      }
    }

    if (slotItem.daggerSelfDestructDiscover && !weaponDestroyed && weaponSurvivedWithDurability > 0) {
      const confirmed = await depsRef.current.requestDaggerSelfDestruct(
        slotItem.name,
        weaponSurvivedWithDurability,
      );
      if (confirmed) {
        addGameLog('equip', `${slotItem.name} 自毁！发现 ${weaponSurvivedWithDurability} 张专属牌！`);
        setHeroSkillBanner(`${slotItem.name} 自毁！`);

        // --- 遗言 effects (treat self-destruct as normal destruction) ---
        const hasLastWords = slotItem.onDestroyHeal || slotItem.onDestroyGold || slotItem.onDestroyDraw
          || slotItem.onDestroyClassDraw || slotItem.onDestroyPermanentDamage || slotItem.onDestroyPermanentShield || slotItem.onDestroyEffect
          || (isMonsterEquip && (slotItem.lastWords || slotItem.wraithDeathHeal || slotItem.wraithDeathHealSpread || slotItem.skeletonLastWordsDiscard));
        if (hasLastWords) {
          addGameLog('equip', `${slotItem.name} 遗言触发！`);
        }
        if (slotItem.onDestroyHeal) {
          healHero(slotItem.onDestroyHeal);
          addGameLog('equip', `${slotItem.name} 遗言：恢复了 ${slotItem.onDestroyHeal} 点生命`);
        }
        if (slotItem.onDestroyGold) {
          setGold(prev => prev + slotItem.onDestroyGold!);
          addGameLog('equip', `${slotItem.name} 遗言：获得了 ${slotItem.onDestroyGold} 金币`);
        }
        if (slotItem.onDestroyDraw) {
          const drawnNames: string[] = [];
          for (let i = 0; i < slotItem.onDestroyDraw; i++) {
            const drawn = drawFromBackpackToHand();
            if (drawn) drawnNames.push(drawn.name);
          }
          if (drawnNames.length > 0) {
            addGameLog('equip', `${slotItem.name} 遗言：抽到了 ${drawnNames.join('、')}`);
          }
        }
        if (slotItem.onDestroyClassDraw) {
          const classDrawn = depsRef.current.drawClassCardsToBackpack(slotItem.onDestroyClassDraw, `${slotItem.name}-遗言`);
          if (classDrawn.length > 0) {
            depsRef.current.triggerClassDeckFlight(classDrawn);
            addGameLog('equip', `${slotItem.name} 遗言：获得专属卡「${classDrawn.map(c => c.name).join('、')}」`);
          }
        }
        if (slotItem.onDestroyPermanentDamage) {
          setEquipmentSlotBonus(slotId, 'damage', cur => cur + slotItem.onDestroyPermanentDamage!);
          addGameLog('equip', `${slotItem.name} 遗言：该装备栏永久伤害 +${slotItem.onDestroyPermanentDamage}！`);
          setHeroSkillBanner(`${slotItem.name} 遗言！永久伤害 +${slotItem.onDestroyPermanentDamage}！`);
        }
        if (slotItem.onDestroyPermanentShield) {
          setEquipmentSlotBonus(slotId, 'shield', cur => cur + slotItem.onDestroyPermanentShield!);
          addGameLog('equip', `${slotItem.name} 遗言：该装备栏永久护甲 +${slotItem.onDestroyPermanentShield}！`);
          setHeroSkillBanner(`${slotItem.name} 遗言！永久护甲 +${slotItem.onDestroyPermanentShield}！`);
        }
        if (slotItem.onDestroyEffect) {
          if (slotItem.onDestroyEffect === 'slot-temp-buff-3-3') {
            setSlotTempAttack(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + 3 }));
            setSlotTempArmor(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + 3 }));
            addGameLog('equip', `${slotItem.name} 遗言：该装备栏 +3临时攻击 +3临时护甲！`);
            setHeroSkillBanner(`${slotItem.name} 遗言！该装备栏 +3临时攻击 +3临时护甲！`);
          } else {
            addGameLog('equip', `${slotItem.name} 遗言：${slotItem.onDestroyEffect}`);
          }
        }
        if (isMonsterEquip) {
          if (slotItem.lastWords === 'discard-hand-3') {
            const drawnNames: string[] = [];
            for (let i = 0; i < 3; i++) {
              const drawn = drawFromBackpackToHand();
              if (drawn) drawnNames.push(drawn.name);
            }
            if (drawnNames.length > 0) {
              addGameLog('equip', `${slotItem.name} 遗言：抽到了 ${drawnNames.join('、')}`);
              setHeroSkillBanner(`${slotItem.name} 遗言：抽取 ${drawnNames.length} 张牌！`);
            }
          }
          if (slotItem.skeletonLastWordsDiscard) {
            const skelDrawn = drawFromBackpackToHand();
            if (skelDrawn) {
              addGameLog('equip', `${slotItem.name} 遗言：抽到了「${skelDrawn.name}」`);
              setHeroSkillBanner(`${slotItem.name} 遗言：抽取 1 张牌！`);
            }
          }
          if (slotItem.lastWords?.startsWith('wraith-haunt')) {
            const hauntAmount = parseInt(slotItem.lastWords.replace('wraith-haunt-', ''), 10) || 2;
            const otherSlotId: EquipmentSlotId = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
            const otherItem = otherSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
            if (otherItem) {
              setEquipmentSlotBonus(otherSlotId, 'damage', cur => cur + hauntAmount);
              addGameLog('equip', `${slotItem.name} 遗言：${otherItem.name} 获得临时攻击力 +${hauntAmount}！`);
            }
          }
          if (slotItem.wraithDeathHeal || slotItem.wraithDeathHealSpread) {
            const otherSlotId: EquipmentSlotId = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
            const otherItem = otherSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
            if (otherItem && otherItem.durability != null && otherItem.maxDurability != null) {
              const newDur = Math.min(otherItem.maxDurability, otherItem.durability + 1);
              let updatedOther = { ...otherItem } as EquipmentItem;
              if (newDur > otherItem.durability) {
                updatedOther = { ...updatedOther, durability: newDur };
                addGameLog('equip', `${slotItem.name} 怨灵祝福：${otherItem.name} 耐久 +1！`);
              }
              if (slotItem.wraithDeathHealSpread && !otherItem.wraithDeathHeal) {
                updatedOther = { ...updatedOther, wraithDeathHeal: 1 };
                addGameLog('equip', `${slotItem.name} 怨灵传承：${otherItem.name} 获得遗言「怨灵祝福」！`);
              }
              setEquipmentSlotById(otherSlotId, updatedOther);
            }
          }
        }

        // --- 复生 check (after 遗言) ---
        const nativeReviveAvailable = isMonsterEquip && slotItem.hasRevive && !slotItem.reviveUsed;
        const equipReviveAvailable = slotItem.hasEquipmentRevive && !slotItem.equipmentReviveUsed;
        const canRevive = nativeReviveAvailable || equipReviveAvailable;
        if (canRevive) {
          const reviveUpdate = nativeReviveAvailable
            ? { ...slotItem, durability: 1, reviveUsed: true }
            : { ...slotItem, durability: 1, equipmentReviveUsed: true };
          setEquipmentSlotById(slotId, reviveUpdate as EquipmentItem);
          addGameLog('equip', `${slotItem.name} 复生！以 1 耐久复活！`);
          setHeroSkillBanner(`${slotItem.name} 复生了！`);
        } else {
          disposeOwnedEquipmentCard({ ...slotItem, durability: 0 }, { isDestruction: true });
          clearEquipmentSlotWithPromote(slotId);
        }

        for (let i = 0; i < weaponSurvivedWithDurability; i++) {
          await depsRef.current.beginDiscoverFlowAsync(`${slotItem.name}-自毁`, { sourceLabel: slotItem.name });
        }
      }
    }

    if (slotItem.ghostBladeExile) {
      await triggerGhostBladeExile();
    }

    if (slotItem.postAttackHandRecycle) {
      const currentHand = depsRef.current.handCardsRef.current;
      if (currentHand.length > 0) {
        const moved = await depsRef.current.requestCardAction('move-to', 1, {
          title: `${slotItem.name}：选择 1 张手牌移到回收袋`,
          description: '选择 1 张手牌移到回收袋，然后抽 1 张牌。',
          handOnly: true,
          moveToDestination: 'recycle-bag',
        });
        if (moved) {
          const drawn = drawFromBackpackToHand();
          if (drawn) {
            addGameLog('equip', `${slotItem.name}：将手牌移到回收袋，抽到「${drawn.name}」`);
          } else {
            addGameLog('equip', `${slotItem.name}：将手牌移到回收袋，但背包为空或手牌已满。`);
          }
        }
      }
    }

    if (slotItem.postAttackSpellDamage) {
      const boardMonsters = flattenActiveRowSlots(depsRef.current.activeCardsLatestRef.current).filter(
        (c): c is GameCardData => isDamageableTarget(c),
      );
      if (boardMonsters.length > 0) {
        const target = boardMonsters[Math.floor(Math.random() * boardMonsters.length)];
        const spellDmg = Math.max(0, slotItem.postAttackSpellDamage + permanentSpellDamageBonus);
        depsRef.current.tryStartArcaneBladeSpellFx(slotId, target.id);
        await new Promise<void>(r => setTimeout(r, depsRef.current.animSpeed(ARCANE_BLADE_SPELL_ANIM_MS)));
        const freshTarget = flattenActiveRowSlots(depsRef.current.activeCardsLatestRef.current).find(
          (c): c is GameCardData => Boolean(c && c.id === target.id && isDamageableTarget(c)),
        );
        if (freshTarget) {
          dealDamageToMonster(freshTarget, spellDmg, { pulses: 1, isSpellDamage: true });
          addGameLog('combat', `${slotItem.name} 附魔：对 ${freshTarget.name} 造成 ${spellDmg} 点法术伤害`);
        }
      }
    }

    if (
      isMonsterEquip &&
      slotItem.eliteDoubleAttack &&
      !monsterDefeated &&
      targetMonster.type === 'monster'
    ) {
      const doubleResult = await requestDiceOutcome({
        title: slotItem.name,
        subtitle: '连击判定',
        entries: [
          { id: 'double', range: [1, 10] as [number, number], label: '再攻击一次！', effect: 'none' },
          { id: 'single', range: [11, 20] as [number, number], label: '本次仅一击', effect: 'none' },
        ],
      });
      if (doubleResult?.id === 'double') {
        addGameLog('equip', `${slotItem.name} 连击！可以再攻击一次！`);
        setHeroSkillBanner(`${slotItem.name} 连击！额外攻击机会！`);
        setExtraAttackCharges(prev => prev + 1);
      }
    }
  };

  // -- endHeroTurn ------------------------------------------------------------

  const wrathPurificationFlush = () => {
    if (!hasEternalRelic(depsRef.current.eternalRelicsRef.current, 'wraith-purification')) return;
    const bag = engine.getState().permanentMagicRecycleBag;
    if (!bag.length) return;

    const readyCards: GameCardData[] = [];
    const waitingCards: GameCardData[] = [];
    for (const card of bag) {
      const waits = ((card as GameCardData & { _recycleWaits?: number })._recycleWaits ?? 1) - 1;
      if (waits <= 0) {
        readyCards.push(sanitizeCardMetadata(card));
      } else {
        waitingCards.push({ ...card, _recycleWaits: waits } as GameCardData);
      }
    }

    const st = engine.getState();
    const cap = Math.max(1, BASE_BACKPACK_CAPACITY + st.backpackCapacityModifier);
    const availableSlots = Math.max(0, cap - st.backpackItems.length);
    const toRestore = readyCards.slice(0, availableSlots);
    const overflowReady = readyCards.slice(availableSlots);

    setPermanentMagicRecycleBag([...overflowReady, ...waitingCards]);
    if (toRestore.length > 0) {
      setBackpackItems(prev => [...prev, ...toRestore]);
    }

    const parts: string[] = [];
    if (toRestore.length > 0) parts.push(`${toRestore.length} 张牌洗回背包`);
    if (overflowReady.length > 0) parts.push(`${overflowReady.length} 张牌因背包已满留在回收袋`);
    if (waitingCards.length > 0) parts.push(`${waitingCards.length} 张牌仍在冷却中`);
    if (toRestore.length > 0 || waitingCards.length > 0) {
      depsRef.current.addGameLog('skill', `永恒护符·幽魂净化：${parts.join('，')}`);
      setHeroSkillBanner(`永恒护符·幽魂净化：${parts.join('，')}`);
    }
  };

  const endHeroTurn = () => {
    if (depsRef.current.endHeroTurnGuardRef.current) return;
    depsRef.current.pushUndoSnapshot();
    depsRef.current.heroTookDamageThisMonsterTurnRef.current = false;
    setHeroStunned(false);
    wrathPurificationFlush();
    const engagedMonsters = getEngagedMonsterCards();
    if (engagedMonsters.length === 0) {
      finishCombat();
      return;
    }

    engagedMonsters.forEach(monster => {
      if (monster.eliteRegenHeroTurn && !monster.isStunned && !depsRef.current.heroTurnLayerLossIdsRef.current.has(monster.id)) {
        const currentLayer = monster.currentLayer ?? monster.fury ?? 1;
        const maxLayers = monster.fury ?? monster.hpLayers ?? 1;
        if (currentLayer < maxLayers) {
          const restoredLayer = currentLayer + 1;
          updateMonsterCard(monster.id, (card) => ({
            ...card,
            currentLayer: restoredLayer,
            hp: card.maxHp ?? monster.maxHp ?? card.hp ?? 0,
          }));
          depsRef.current.addGameLog('combat', `${monster.name} 未受到血层伤害，恢复了一个血层！当前 ${restoredLayer} 层。`);
          setHeroSkillBanner(`${monster.name} 恢复了一个血层！`);
          return;
        }
      }

      if (monster.eliteHealOtherMonster && !monster.isStunned && !depsRef.current.heroTurnLayerLossIdsRef.current.has(monster.id)) {
        const currentActiveCards = depsRef.current.activeCardsLatestRef.current;
        const otherMonsters = currentActiveCards
          .filter((c): c is GameCardData => Boolean(c && c.type === 'monster' && c.id !== monster.id && (c.currentLayer ?? c.fury ?? 1) < (c.fury ?? c.hpLayers ?? 1)));
        if (otherMonsters.length > 0) {
          const target = otherMonsters[Math.floor(Math.random() * otherMonsters.length)];
          const targetLayer = (target.currentLayer ?? target.fury ?? 1) + 1;
          updateMonsterCard(target.id, (card) => ({
            ...card,
            currentLayer: targetLayer,
            hp: card.maxHp ?? target.maxHp ?? card.hp ?? 0,
          }));
          depsRef.current.triggerMonsterHealAnimation(target.id);
          depsRef.current.addGameLog('combat', `${monster.name} 龙息庇护：为 ${target.name} 恢复了一个血层！当前 ${targetLayer} 层。`);
          setHeroSkillBanner(`${monster.name} 龙息庇护！${target.name} 恢复了一个血层！`);
          return;
        }
      }
    });

    engagedMonsters.forEach(monster => {
      if (monster.dragonAttackNoLayerCost) {
        const lostLayer = depsRef.current.heroTurnLayerLossIdsRef.current.has(monster.id);
        updateMonsterCard(monster.id, (card) => ({ ...card, dragonNoLayerCostActive: lostLayer }));
      }
    });

    depsRef.current.heroTurnLayerLossIdsRef.current.clear();
    setBerserkerSlotUsed({});
    setFlashSlotUsed({});
    setGambitSlotUsed({});
    setWeaponExtraAttackUsed({});

    const goblinSlots: EquipmentSlotId[] = ['equipmentSlot1', 'equipmentSlot2'];
    for (const gsId of goblinSlots) {
      const gItem = gsId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (!gItem || gItem.type !== 'monster' || !gItem.goblinStealScale) continue;
      const gReserve = gsId === 'equipmentSlot1' ? engine.getState().equipmentSlot1Reserve : engine.getState().equipmentSlot2Reserve;
      if (gReserve.length === 0) continue;
      if (Math.random() < 0.3) {
        const curDur = gItem.durability ?? 0;
        const maxDur = gItem.maxDurability ?? curDur;
        if (curDur < maxDur) {
          setEquipmentSlotById(gsId, { ...gItem, durability: curDur + 1 } as EquipmentItem);
          depsRef.current.addGameLog('equip', `${gItem.name} 贼窝疗养：恢复 1 耐久（${curDur + 1}/${maxDur}）`);
          setHeroSkillBanner(`${gItem.name} 恢复了 1 耐久！`);
        }
      }
    }

    if (depsRef.current.amuletEffects.hasEndTurnDraw) {
      const drawn = depsRef.current.drawFromBackpackToHand();
      if (drawn) {
        depsRef.current.addGameLog('amulet', `回合汲取：结束回合，抽到了「${drawn.name}」`);
        setHeroSkillBanner(`回合汲取：抽到了「${drawn.name}」！`);
      }
    }

    const sortedMonsters = [...engagedMonsters].sort((a, b) => {
      const idxA = activeCards.findIndex(c => c?.id === a.id);
      const idxB = activeCards.findIndex(c => c?.id === b.id);
      return idxA - idxB;
    });

    setCombatState(prev => ({
      ...prev,
      currentTurn: 'monster',
      heroAttacksThisTurn: {
        equipmentSlot1: false,
        equipmentSlot2: false,
      },
      heroAttacksRemaining: 2,
      heroDamageThisTurn: {},
      monsterAttackQueue: sortedMonsters.map(monster => monster.id),
      pendingBlock: null,
      slotBlocksThisTurn: {
        equipmentSlot1: false,
        equipmentSlot2: false,
      },
      slotDurabilityUsedThisTurn: {
        equipmentSlot1: 0,
        equipmentSlot2: 0,
      },
    }));
  };

  // -- resolveBlockChoice -----------------------------------------------------

  const resolveBlockChoice = async (target: BlockTarget) => {
    if (!combatState.pendingBlock) {
      return;
    }
    if (depsRef.current.fullBoardInteractionLockedRef.current) {
      return;
    }

    const epoch = depsRef.current.combatAsyncEpochRef.current;
    const stale = () => depsRef.current.combatAsyncEpochRef.current !== epoch;

    const pendingBlock = combatState.pendingBlock;
    const monster = activeCards.find(card => card?.id === pendingBlock.monsterId);
    if (!monster) {
      setCombatState(prev => ({
        ...prev,
        pendingBlock: null,
      }));
      advanceMonsterTurn();
      return;
    }

    let remainingDamage = pendingBlock.attackValue;

    if (monster.monsterSpecial === 'ogre-crit') {
      const result = await depsRef.current.requestDiceOutcome({
        title: monster.name,
        subtitle: '暴击判定',
        entries: [
          { id: 'crit', range: [1, 10] as [number, number], label: '双倍伤害！', effect: 'none' },
          { id: 'normal', range: [11, 20] as [number, number], label: '正常伤害', effect: 'none' },
        ],
      });
      if (result?.id === 'crit') {
        remainingDamage *= 2;
        depsRef.current.addGameLog('combat', `${monster.name} 暴击！伤害翻倍为 ${remainingDamage}！`);
        setHeroSkillBanner(`${monster.name} 暴击了！伤害翻倍！`);
      }
    }
    if (stale()) {
      return;
    }

    depsRef.current.addGameLog('monster', `${monster.name} 发动攻击（${remainingDamage}伤害）`);

    const { getEquipmentSlotBonus, setEquipmentSlotBonus, setEquipmentSlotById,
      clearEquipmentSlotWithPromote, drawFromBackpackToHand,
      disposeOwnedEquipmentCard, amuletEffects: ae, requestDiceOutcome } = depsRef.current;

    let blockedWithShield = false;
    let shieldDurabilityConsumed = false;
    let reflectDmg = 0;
    let reflectSourceName = '';
    let reflectBlockSlotId: EquipmentSlotId | null = null;
    if (target !== 'hero') {
      const blockSlotId = target as EquipmentSlotId;
      const slotItem = blockSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      const equipBlockBonus = slotItem?.equipBlockDurabilityBonus ?? 0;
      const amuletBlockBonus = ae.hasArmorHalveEndure ? 1 : 0;
      const durabilityLimitReached = (combatState.slotDurabilityUsedThisTurn[blockSlotId] ?? 0) >= (blockDurabilityPerSlot + equipBlockBonus + amuletBlockBonus);
      if (slotItem && (slotItem.type === 'shield' || slotItem.type === 'monster') && !durabilityLimitReached) {
        blockedWithShield = true;
        const knightShield = slotItem as GameCardData & { knightEffect?: string };
        const isFullBlockShield = knightShield.knightEffect === 'fullBlock';

        let shieldArmorDepleted = false;
        let workingShieldItem = { ...slotItem };

        const slotShieldBonus = getEquipmentSlotBonus(blockSlotId, 'shield');
        const permanentBonus = Math.max(0, depsRef.current.defenseBonus + slotShieldBonus);
        const rawSlotTemp = slotTempArmor[blockSlotId] ?? 0;
        const baseArmorMax = slotItem.armorMax ?? slotItem.value;
        const effectiveArmorMax = baseArmorMax + permanentBonus + rawSlotTemp;

        {
          const isMonsterEquipShield = slotItem.type === 'monster';

          if (isMonsterEquipShield) {
            const rawBaseArmor = slotItem.hp ?? slotItem.value;
            const monsterArmorMax = rawBaseArmor;
            const eliteBonus = (slotItem.eliteLowGoldPower && gold >= 30) ? monsterArmorMax : 0;
            const storedMonsterArmor = Math.min(slotItem.armor ?? monsterArmorMax, monsterArmorMax);
            const existingBonusDamaged = slotItem.armorBonusDamaged ?? 0;
            const monsterBonusTotal = eliteBonus + permanentBonus + rawSlotTemp;
            const monsterBonusRemaining = Math.max(0, monsterBonusTotal - existingBonusDamaged);
            const currentArmor = storedMonsterArmor + monsterBonusRemaining;
            depsRef.current.triggerShieldBlockAnimation(blockSlotId);
            const blocked = Math.min(remainingDamage, currentArmor);
            const golemArmorCap = slotItem.maxDamagePerHit;
            const effectiveArmorDamage = golemArmorCap != null ? Math.min(blocked, golemArmorCap) : blocked;
            const newArmor = Math.max(0, currentArmor - effectiveArmorDamage);
            shieldArmorDepleted = newArmor <= 0 && effectiveArmorDamage > 0;
            remainingDamage = isFullBlockShield ? 0 : Math.max(0, remainingDamage - currentArmor);

            if (shieldArmorDepleted) {
              const { armor: _clearArmor, armorBonusDamaged: _clearBonusDmg, ...resetBase } = slotItem;
              workingShieldItem = resetBase as typeof slotItem;
            } else {
              const consumeFromBonus = Math.min(effectiveArmorDamage, monsterBonusRemaining);
              const consumeFromBase = effectiveArmorDamage - consumeFromBonus;
              const newBaseArmor = Math.max(0, storedMonsterArmor - consumeFromBase);
              const newBonusDamaged = existingBonusDamaged + consumeFromBonus;
              workingShieldItem = { ...slotItem, armor: newBaseArmor, armorBonusDamaged: newBonusDamaged > 0 ? newBonusDamaged : undefined };
            }

            if (golemArmorCap != null && blocked > golemArmorCap) {
              depsRef.current.addGameLog('combat', `${slotItem.name} 岩石护体：护甲最多掉 ${golemArmorCap}！`);
            }
            if (isFullBlockShield) {
              depsRef.current.addGameLog('combat', `${slotItem.name} 完全格挡了 ${blocked} 点伤害！（护甲 ${currentArmor}→${newArmor}）`);
              setHeroSkillBanner(`${slotItem.name} 完全格挡！`);
            } else if (shieldArmorDepleted) {
              depsRef.current.addGameLog('combat', `${slotItem.name} 格挡了 ${blocked} 点伤害（护甲击破！耐久 -1）`);
            } else {
              depsRef.current.addGameLog('combat', `${slotItem.name} 格挡了 ${blocked} 点伤害（护甲 ${currentArmor}→${newArmor}）`);
            }
          } else {
            const storedBaseArmor = Math.min(slotItem.armor ?? baseArmorMax, baseArmorMax);
            const existingBonusDamaged = slotItem.armorBonusDamaged ?? 0;
            const bonusTotal = permanentBonus + rawSlotTemp;
            const bonusRemaining = Math.max(0, bonusTotal - existingBonusDamaged);
            const currentArmor = storedBaseArmor + bonusRemaining;
            depsRef.current.triggerShieldBlockAnimation(blockSlotId);
            const blocked = Math.min(remainingDamage, currentArmor);
            const newArmor = Math.max(0, currentArmor - remainingDamage);
            shieldArmorDepleted = newArmor <= 0 && remainingDamage > 0;
            remainingDamage = isFullBlockShield ? 0 : Math.max(0, remainingDamage - currentArmor);

            if (shieldArmorDepleted) {
              const { armor: _clearArmor, armorBonusDamaged: _clearBonusDmg, ...resetBase } = slotItem;
              workingShieldItem = resetBase as typeof slotItem;
            } else {
              const consumeFromBonus = Math.min(blocked, bonusRemaining);
              const consumeFromBase = blocked - consumeFromBonus;
              const newBaseArmor = Math.max(0, storedBaseArmor - consumeFromBase);
              const newBonusDamaged = existingBonusDamaged + consumeFromBonus;
              workingShieldItem = { ...slotItem, armor: newBaseArmor, armorBonusDamaged: newBonusDamaged > 0 ? newBonusDamaged : undefined };
            }

            if (isFullBlockShield) {
              depsRef.current.addGameLog('combat', `${slotItem.name} 完全格挡了 ${blocked} 点伤害！（护甲 ${currentArmor}→${newArmor}）`);
              setHeroSkillBanner(`${slotItem.name} 完全格挡！`);
            } else if (shieldArmorDepleted) {
              depsRef.current.addGameLog('combat', `${slotItem.name} 格挡了 ${blocked} 点伤害（护甲击破！耐久 -1）`);
            } else {
              depsRef.current.addGameLog('combat', `${slotItem.name} 格挡了 ${blocked} 点伤害（护甲 ${currentArmor}→${newArmor}）`);
            }
          }
        }

        if (slotItem.reflectHalfDamage && monster) {
          const slotPermDmg = getEquipmentSlotBonus(blockSlotId, 'damage');
          const slotTempAtk = slotTempAttack[blockSlotId] ?? 0;
          reflectDmg = Math.ceil(pendingBlock.attackValue / 2) + slotPermDmg + slotTempAtk;
          reflectSourceName = slotItem.name;
          reflectBlockSlotId = blockSlotId;
        } else if (slotItem.damageReflect && slotItem.damageReflect > 0 && monster) {
          const slotDamageBonus = getEquipmentSlotBonus(blockSlotId, 'damage');
          reflectDmg = slotItem.damageReflect + slotDamageBonus;
          reflectSourceName = slotItem.name;
          reflectBlockSlotId = blockSlotId;
        }

        const isPerfectBlockThisShield = isFullBlockShield || remainingDamage === 0;

        if (isPerfectBlockThisShield && ae.hasDualGuard) {
          setEquipmentSlotBonus(blockSlotId, 'shield', cur => cur + 1);
          const newBonus = getEquipmentSlotBonus(blockSlotId, 'shield') + 1;
          depsRef.current.addGameLog('combat', `完美格挡！双守护圣盾使该栏永久护甲 +1（当前 +${newBonus}）`);
          setHeroSkillBanner(`完美格挡！该装备栏永久护甲 +1！`);
        }

        if (slotItem.blockGrantTempArmorToOther) {
          const otherSlot: EquipmentSlotId = blockSlotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
          const grantAmount = slotItem.type === 'monster'
            ? (slotItem.hp ?? slotItem.value) + permanentBonus
            : effectiveArmorMax;
          setSlotTempArmor(prev => ({ ...prev, [otherSlot]: (prev[otherSlot] ?? 0) + grantAmount }));
          const otherSlotLabel = otherSlot === 'equipmentSlot1' ? '左' : '右';
          depsRef.current.addGameLog('combat', `${slotItem.name} 守望者链接：${otherSlotLabel}装备栏临时护甲 +${grantAmount}！`);
          setHeroSkillBanner(`守望者链接！${otherSlotLabel}装备栏临时护甲 +${grantAmount}！`);
        }

        if (slotItem.type === 'monster' && slotItem.dragonDamageRetaliation && slotItem.dragonDamageRetaliation > 0) {
          const dragonBlockMonsters = flattenActiveRowSlots(depsRef.current.activeCardsLatestRef.current).filter(
            (c): c is GameCardData => Boolean(c && c.type === 'monster'),
          );
          if (dragonBlockMonsters.length > 0) {
            const randomTarget = dragonBlockMonsters[Math.floor(Math.random() * dragonBlockMonsters.length)];
            depsRef.current.tryStartShieldReflectDirectedFx(blockSlotId, randomTarget.id);
            await new Promise<void>(r => setTimeout(r, depsRef.current.animSpeed(SHIELD_REFLECT_ANIM_MS)));
            if (stale()) return;
            dealDamageToMonster(randomTarget, 2, { pulses: 1 });
            depsRef.current.addGameLog('equip', `${slotItem.name} 龙息反击：对 ${randomTarget.name} 造成 2 点伤害！`);
            setHeroSkillBanner(`${slotItem.name} 龙息反击！`);
          }
        }

        let evolveBlockCount: number | undefined;
        let shieldAutoEvolved = false;
        if (slotItem.shieldBlockAutoUpgradeCount) {
          evolveBlockCount = ((slotItem as any)._shieldBlockCount ?? 0) + 1;
          if (evolveBlockCount >= slotItem.shieldBlockAutoUpgradeCount) {
            const newArmorMax = (slotItem.armorMax ?? slotItem.value) + 2;
            const { armor: _clearArmor, armorBonusDamaged: _clearBonusDmg2, ...shieldBase } = slotItem;
            const upgradedShield = {
              ...shieldBase,
              value: newArmorMax,
              armorMax: newArmorMax,
              durability: (slotItem.durability ?? 1) + 1,
              maxDurability: (slotItem.maxDurability ?? slotItem.durability ?? 1) + 1,
              _shieldBlockCount: 0,
            };
            setEquipmentSlotById(blockSlotId, upgradedShield as EquipmentItem);
            shieldAutoEvolved = true;
            depsRef.current.addGameLog('equip', `${slotItem.name} 进化！护甲 +2，耐久 +1，耐久上限 +1！`);
            setHeroSkillBanner(`${slotItem.name} 进化了！`);
          } else {
            setEquipmentSlotById(blockSlotId, { ...slotItem, _shieldBlockCount: evolveBlockCount } as EquipmentItem);
          }
        }

        let perfectBlockSaved = false;
        if (!shieldAutoEvolved && isPerfectBlockThisShield && !unbreakableUntilWaterfall[blockSlotId]) {
          const saveChance = slotItem.shieldPerfectBlockSaveChance;
          if (saveChance && saveChance > 0 && !unbreakableNext) {
            const threshold = Math.round((saveChance / 100) * 20);
            const result = await requestDiceOutcome({
              title: slotItem.name,
              subtitle: '完美格挡 — 耐久判定',
              entries: [
                { id: 'save', range: [1, threshold] as [number, number], label: '耐久保留！', effect: 'none' },
                { id: 'lose', range: [threshold + 1, 20] as [number, number], label: shieldArmorDepleted ? '耐久 -1' : '护甲磨损', effect: 'none' },
              ],
            });
            if (result?.id === 'save') {
              perfectBlockSaved = true;
              depsRef.current.addGameLog('equip', `${slotItem.name} 完美格挡，幸运保住了耐久！`);
            }
          }
        }
        if (stale()) {
          return;
        }

        if (!shieldAutoEvolved && !unbreakableUntilWaterfall[blockSlotId] && shieldArmorDepleted) {
          let skipShieldDurabilityLoss = perfectBlockSaved;
          const isMonsterEquipShield = slotItem.type === 'monster';

          if (!skipShieldDurabilityLoss && isMonsterEquipShield && (slotItem.monsterSpecial === 'bone-regen' || slotItem.monsterSpecial === 'skeleton-king')) {
            const boneResult = await requestDiceOutcome({
              title: slotItem.name,
              subtitle: '虚骨再生判定',
              entries: [
                { id: 'regen', range: [1, 10] as [number, number], label: '耐久保留！', effect: 'none' },
                { id: 'lose', range: [11, 20] as [number, number], label: '耐久 -1', effect: 'none' },
              ],
            });
            if (boneResult?.id === 'regen') {
              skipShieldDurabilityLoss = true;
              depsRef.current.addGameLog('equip', `${slotItem.name} 虚骨再生：幸运保住了耐久！`);
              setHeroSkillBanner(`${slotItem.name} 虚骨再生！`);
            }
          }
          if (!skipShieldDurabilityLoss && isMonsterEquipShield && slotItem.swarmBugletShield) {
            const otherBugletSlotId: EquipmentSlotId = blockSlotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
            const otherBugletItem = otherBugletSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
            if (otherBugletItem && otherBugletItem.type === 'monster' && otherBugletItem.isBuglet) {
              skipShieldDurabilityLoss = true;
              depsRef.current.addGameLog('equip', `${slotItem.name} 虫盾共生：另一装备栏有小虫子，耐久不减！`);
              setHeroSkillBanner(`${slotItem.name} 虫盾共生！`);
            }
          }
          let extraBlockCounterPatch: Record<string, number> = {};
          const totalExtraBlocks = slotItem.shieldExtraBlocksPerDurability ?? 0;
          if (!skipShieldDurabilityLoss && totalExtraBlocks > 0) {
            const counter = (slotItem._shieldDurabilityBlockCounter ?? 0) + 1;
            if (counter <= totalExtraBlocks) {
              skipShieldDurabilityLoss = true;
              const { armor: _resetArmorExtra, armorBonusDamaged: _resetBonusExtra, ...extraBase } = slotItem;
              const evolveCountExtra = evolveBlockCount !== undefined ? { _shieldBlockCount: evolveBlockCount } : {};
              setEquipmentSlotById(blockSlotId, { ...extraBase, _shieldDurabilityBlockCounter: counter, ...evolveCountExtra } as EquipmentItem);
              depsRef.current.addGameLog('equip', `${slotItem.name} 额外格挡（${counter}/${totalExtraBlocks}），耐久未消耗！`);
            } else {
              extraBlockCounterPatch = { _shieldDurabilityBlockCounter: 0 };
            }
          }
          if (!skipShieldDurabilityLoss) {
            const shieldDurability = slotItem.durability ?? 1;
            if (shieldDurability <= 1 && !unbreakableNext) {
              shieldDurabilityConsumed = true;
              // --- 遗言 effects (fire BEFORE revive, regardless of revive availability) ---
              const hasShieldLastWords = slotItem.onDestroyHeal || slotItem.onDestroyGold || slotItem.onDestroyDraw
                || slotItem.onDestroyClassDraw || slotItem.onDestroyPermanentDamage || slotItem.onDestroyPermanentShield || slotItem.onDestroyEffect
                || (isMonsterEquipShield && (slotItem.lastWords || slotItem.wraithDeathHeal || slotItem.wraithDeathHealSpread || slotItem.skeletonLastWordsDiscard));
              if (hasShieldLastWords) {
                depsRef.current.addGameLog('equip', `${slotItem.name} 遗言触发！`);
              }
              if (slotItem.onDestroyHeal) {
                healHero(slotItem.onDestroyHeal);
                depsRef.current.addGameLog('equip', `${slotItem.name} 遗言：恢复了 ${slotItem.onDestroyHeal} 点生命`);
              }
              if (slotItem.onDestroyGold) {
                setGold(prev => prev + slotItem.onDestroyGold!);
                depsRef.current.addGameLog('equip', `${slotItem.name} 遗言：获得了 ${slotItem.onDestroyGold} 金币`);
              }
              if (slotItem.onDestroyDraw) {
                const shieldDrawNames: string[] = [];
                for (let i = 0; i < slotItem.onDestroyDraw; i++) {
                  const drawn = drawFromBackpackToHand();
                  if (drawn) shieldDrawNames.push(drawn.name);
                }
                if (shieldDrawNames.length > 0) {
                  depsRef.current.addGameLog('equip', `${slotItem.name} 遗言：抽到了 ${shieldDrawNames.join('、')}`);
                }
              }
              if (slotItem.onDestroyClassDraw) {
                const classDrawn = depsRef.current.drawClassCardsToBackpack(slotItem.onDestroyClassDraw, `${slotItem.name}-遗言`);
                if (classDrawn.length > 0) {
                  depsRef.current.triggerClassDeckFlight(classDrawn);
                  depsRef.current.addGameLog('equip', `${slotItem.name} 遗言：获得专属卡「${classDrawn.map(c => c.name).join('、')}」`);
                }
              }
              if (slotItem.onDestroyPermanentDamage) {
                setEquipmentSlotBonus(blockSlotId, 'damage', cur => cur + slotItem.onDestroyPermanentDamage!);
                depsRef.current.addGameLog('equip', `${slotItem.name} 遗言：该装备栏永久伤害 +${slotItem.onDestroyPermanentDamage}！`);
                setHeroSkillBanner(`${slotItem.name} 遗言！永久伤害 +${slotItem.onDestroyPermanentDamage}！`);
              }
              if (slotItem.onDestroyPermanentShield) {
                setEquipmentSlotBonus(blockSlotId, 'shield', cur => cur + slotItem.onDestroyPermanentShield!);
                depsRef.current.addGameLog('equip', `${slotItem.name} 遗言：该装备栏永久护甲 +${slotItem.onDestroyPermanentShield}！`);
                setHeroSkillBanner(`${slotItem.name} 遗言！永久护甲 +${slotItem.onDestroyPermanentShield}！`);
              }
              if (slotItem.onDestroyEffect) {
                if (slotItem.onDestroyEffect === 'slot-temp-buff-3-3') {
                  setSlotTempAttack(prev => ({ ...prev, [blockSlotId]: (prev[blockSlotId] ?? 0) + 3 }));
                  setSlotTempArmor(prev => ({ ...prev, [blockSlotId]: (prev[blockSlotId] ?? 0) + 3 }));
                  depsRef.current.addGameLog('equip', `${slotItem.name} 遗言：该装备栏 +3临时攻击 +3临时护甲！`);
                  setHeroSkillBanner(`${slotItem.name} 遗言！该装备栏 +3临时攻击 +3临时护甲！`);
                } else {
                  depsRef.current.addGameLog('equip', `${slotItem.name} 遗言：${slotItem.onDestroyEffect}`);
                }
              }
              if (isMonsterEquipShield) {
                if (slotItem.lastWords === 'discard-hand-3') {
                  const drawnNames: string[] = [];
                  for (let i = 0; i < 3; i++) {
                    const drawn = drawFromBackpackToHand();
                    if (drawn) drawnNames.push(drawn.name);
                  }
                  if (drawnNames.length > 0) {
                    depsRef.current.addGameLog('equip', `${slotItem.name} 遗言：抽到了 ${drawnNames.join('、')}`);
                    setHeroSkillBanner(`${slotItem.name} 遗言：抽取 ${drawnNames.length} 张牌！`);
                  }
                }
                if (slotItem.skeletonLastWordsDiscard) {
                  const skelBlockDrawn = drawFromBackpackToHand();
                  if (skelBlockDrawn) {
                    depsRef.current.addGameLog('equip', `${slotItem.name} 遗言：抽到了「${skelBlockDrawn.name}」`);
                    setHeroSkillBanner(`${slotItem.name} 遗言：抽取 1 张牌！`);
                  }
                }
                if (slotItem.lastWords?.startsWith('wraith-haunt')) {
                  const hauntAmount = parseInt(slotItem.lastWords.replace('wraith-haunt-', ''), 10) || 2;
                  const otherShieldSlotId: EquipmentSlotId = blockSlotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
                  const otherShieldItem = otherShieldSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
                  if (otherShieldItem) {
                    setEquipmentSlotBonus(otherShieldSlotId, 'damage', cur => cur + hauntAmount);
                    depsRef.current.addGameLog('equip', `${slotItem.name} 遗言：${otherShieldItem.name} 获得临时攻击力 +${hauntAmount}！`);
                  }
                }
                if (slotItem.wraithDeathHeal || slotItem.wraithDeathHealSpread) {
                  const otherShieldSlotId: EquipmentSlotId = blockSlotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
                  const otherShieldItem = otherShieldSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
                  if (otherShieldItem && otherShieldItem.durability != null && otherShieldItem.maxDurability != null) {
                    const newDur = Math.min(otherShieldItem.maxDurability, otherShieldItem.durability + 1);
                    let updatedOther = { ...otherShieldItem } as EquipmentItem;
                    if (newDur > otherShieldItem.durability) {
                      updatedOther = { ...updatedOther, durability: newDur };
                      depsRef.current.addGameLog('equip', `${slotItem.name} 怨灵祝福：${otherShieldItem.name} 耐久 +1！`);
                    }
                    if (slotItem.wraithDeathHealSpread && !otherShieldItem.wraithDeathHeal) {
                      updatedOther = { ...updatedOther, wraithDeathHeal: 1 };
                      depsRef.current.addGameLog('equip', `${slotItem.name} 怨灵传承：${otherShieldItem.name} 获得遗言「怨灵祝福」！`);
                    }
                    setEquipmentSlotById(otherShieldSlotId, updatedOther);
                  }
                }
              }

              // --- Revive check (after 遗言) ---
              const nativeShieldReviveAvailable = isMonsterEquipShield && slotItem.hasRevive && !slotItem.reviveUsed;
              const equipShieldReviveAvailable = slotItem.hasEquipmentRevive && !slotItem.equipmentReviveUsed;
              const canShieldRevive = nativeShieldReviveAvailable || equipShieldReviveAvailable;
              if (canShieldRevive) {
                const { armor: _reviveArmor, armorBonusDamaged: _reviveBonusDmg, ...reviveBase } = slotItem;
                const evolveCount = evolveBlockCount !== undefined ? { _shieldBlockCount: evolveBlockCount } : {};
                const shieldReviveUpdate = nativeShieldReviveAvailable
                  ? { ...reviveBase, durability: 1, reviveUsed: true, ...evolveCount, ...extraBlockCounterPatch }
                  : { ...reviveBase, durability: 1, equipmentReviveUsed: true, ...evolveCount, ...extraBlockCounterPatch };
                setEquipmentSlotById(blockSlotId, shieldReviveUpdate as EquipmentItem);
                depsRef.current.addGameLog('equip', `${slotItem.name} 复生！以 1 耐久复活！`);
                setHeroSkillBanner(`${slotItem.name} 复生了！`);
              } else {
                depsRef.current.addGameLog('equip', `${slotItem.name} 损坏了`);
                disposeOwnedEquipmentCard({ ...slotItem }, { isDestruction: true });
                const otherSlotIdForBlockSwap: EquipmentSlotId = blockSlotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
                const otherItemForBlockSwap = otherSlotIdForBlockSwap === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
                if (isMonsterEquipShield && slotItem.lastWords?.startsWith('wraith-haunt') && Math.random() < 0.5 && otherItemForBlockSwap) {
                  setEquipmentSlotById(blockSlotId, { ...otherItemForBlockSwap, fromSlot: blockSlotId } as EquipmentItem);
                  clearEquipmentSlotWithPromote(otherSlotIdForBlockSwap);
                  const swapBlockLabel = blockSlotId === 'equipmentSlot1' ? '左' : '右';
                  depsRef.current.addGameLog('equip', `幽魂作祟：${otherItemForBlockSwap.name} 被移到了${swapBlockLabel}装备栏！`);
                } else {
                  clearEquipmentSlotWithPromote(blockSlotId);
                }
                const skelBlockReReviveSlotId: EquipmentSlotId = blockSlotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
                const skelBlockReReviveItem = skelBlockReReviveSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
                if (skelBlockReReviveItem && skelBlockReReviveItem.type === 'monster' && skelBlockReReviveItem.skeletonReRevive
                  && (!skelBlockReReviveItem.hasRevive || skelBlockReReviveItem.reviveUsed)) {
                  setEquipmentSlotById(skelBlockReReviveSlotId, { ...skelBlockReReviveItem, hasRevive: true, reviveUsed: false } as EquipmentItem);
                  depsRef.current.addGameLog('equip', `${skelBlockReReviveItem.name} 亡骨轮回：获得了「复生」！`);
                  setHeroSkillBanner(`${skelBlockReReviveItem.name} 亡骨轮回！`);
                }
              }
            } else {
              const nextDurability = shieldDurability <= 1 ? shieldDurability : shieldDurability - 1;
              let updatedBlockDurability = unbreakableNext && shieldDurability <= 1 ? shieldDurability : nextDurability;
              const { armor: _resetArmor, armorBonusDamaged: _resetBonusDmg, ...durabilityBase } = slotItem;
              const evolveCountDur = evolveBlockCount !== undefined ? { _shieldBlockCount: evolveBlockCount } : {};
              let updatedBlockItem = { ...durabilityBase, durability: updatedBlockDurability, ...evolveCountDur, ...extraBlockCounterPatch } as typeof slotItem;
              const blockDurActuallyLost = updatedBlockDurability < shieldDurability;
              if (blockDurActuallyLost) shieldDurabilityConsumed = true;

              if (isMonsterEquipShield && blockDurActuallyLost) {
                if (slotItem.bleedEffect) {
                  const bleedBonus = 3;
                  updatedBlockItem = {
                    ...updatedBlockItem,
                    attack: (updatedBlockItem.attack ?? updatedBlockItem.value) + bleedBonus,
                    value: updatedBlockItem.value + bleedBonus,
                    specialAttackBoost: (updatedBlockItem.specialAttackBoost ?? 0) + bleedBonus,
                  };
                  depsRef.current.addGameLog('equip', `${slotItem.name} 流血：攻击力 +${bleedBonus}！（当前 ${updatedBlockItem.attack}）`);
                }
                if (slotItem.dragonBleedDestroy) {
                  const remainingBlockDur = updatedBlockDurability;
                  const otherBlockSlotId: EquipmentSlotId = blockSlotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
                  const otherBlockItem = otherBlockSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
                  if (otherBlockItem && (otherBlockItem.durability ?? 0) > remainingBlockDur) {
                    const otherBlockCard = otherBlockItem as GameCardData;
                    const isOtherBlockMonster = otherBlockCard.type === 'monster';
                    const nativeBlockRevive = isOtherBlockMonster && otherBlockCard.hasRevive && !otherBlockCard.reviveUsed;
                    const equipBlockRevive = otherBlockCard.hasEquipmentRevive && !otherBlockCard.equipmentReviveUsed;
                    if (nativeBlockRevive || equipBlockRevive) {
                      const revived = nativeBlockRevive
                        ? { ...otherBlockCard, durability: 1, reviveUsed: true }
                        : { ...otherBlockCard, durability: 1, equipmentReviveUsed: true };
                      setEquipmentSlotById(otherBlockSlotId, revived as EquipmentItem);
                      depsRef.current.addGameLog('equip', `${slotItem.name} 流血破甲：「${otherBlockItem.name}」（耐久 ${otherBlockItem.durability} > ${remainingBlockDur}）复生了！`);
                    } else {
                      clearEquipmentSlotWithPromote(otherBlockSlotId);
                      disposeOwnedEquipmentCard(otherBlockCard, { isDestruction: true });
                      depsRef.current.addGameLog('equip', `${slotItem.name} 流血破甲：破坏了「${otherBlockItem.name}」（耐久 ${otherBlockItem.durability} > ${remainingBlockDur}）！`);
                      if (slotItem.type === 'monster' && slotItem.skeletonReRevive
                        && (!slotItem.hasRevive || slotItem.reviveUsed)) {
                        updatedBlockItem = { ...updatedBlockItem, hasRevive: true, reviveUsed: false };
                        depsRef.current.addGameLog('equip', `${slotItem.name} 亡骨轮回：获得了「复生」！`);
                        setHeroSkillBanner(`${slotItem.name} 亡骨轮回！`);
                      }
                    }
                    setHeroSkillBanner(`${slotItem.name} 流血破甲！高耐久装备被破坏！`);
                  }
                }
                if (slotItem.monsterSpecial === 'wraith-rebirth' && updatedBlockDurability === 1 && !slotItem.wraithRebirthUsed) {
                  if (Math.random() < 0.5) {
                    const maxDur = slotItem.maxDurability ?? shieldDurability;
                    updatedBlockItem = { ...updatedBlockItem, durability: maxDur, wraithRebirthUsed: true };
                    updatedBlockDurability = maxDur;
                    depsRef.current.addGameLog('equip', `${slotItem.name} 幽魂重生：耐久回满！（${maxDur}）`);
                    setHeroSkillBanner(`${slotItem.name} 幽魂重生！`);
                  } else {
                    updatedBlockItem = { ...updatedBlockItem, wraithRebirthUsed: true };
                    depsRef.current.addGameLog('equip', `${slotItem.name} 幽魂重生失败！（50%）`);
                  }
                }
                if (slotItem.monsterSpecial === 'swarm-elite') {
                  const otherSwarmBlockSlotId: EquipmentSlotId = blockSlotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
                  const otherSwarmBlockItem = otherSwarmBlockSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
                  if (otherSwarmBlockItem) {
                    disposeOwnedEquipmentCard(otherSwarmBlockItem as GameCardData, { isDestruction: true });
                  }
                  const bugletEquip = createBugletCard();
                  const bugletAsEquip: EquipmentItem = {
                    ...bugletEquip,
                    durability: 1,
                    maxDurability: 1,
                  };
                  setEquipmentSlotById(otherSwarmBlockSlotId, bugletAsEquip);
                  depsRef.current.addGameLog('equip', `${slotItem.name} 虫母孵化：${otherSwarmBlockItem ? otherSwarmBlockItem.name + ' 被替换为' : ''}小虫子！`);
                  setHeroSkillBanner(`${slotItem.name} 虫母孵化！`);
                }
                if (slotItem.golemLayerLossReflect && slotItem.golemLayerLossReflect > 0) {
                  const golemMaxDur = slotItem.maxDurability ?? shieldDurability;
                  const golemLostDur = golemMaxDur - updatedBlockDurability;
                  if (golemLostDur > 0) {
                    const golemCoeff = slotItem.golemLayerLossReflect;
                    const golemReflectDmg = golemCoeff * golemLostDur;
                    const golemTargets = flattenActiveRowSlots(depsRef.current.activeCardsLatestRef.current).filter(
                      (c): c is GameCardData => Boolean(c && c.type === 'monster'),
                    );
                    if (golemTargets.length > 0) {
                      const golemTarget = golemTargets[Math.floor(Math.random() * golemTargets.length)];
                      depsRef.current.tryStartShieldReflectDirectedFx(blockSlotId, golemTarget.id);
                      dealDamageToMonster(golemTarget, golemReflectDmg, { pulses: 1 });
                      depsRef.current.addGameLog('equip', `${slotItem.name} 岩层反震：${golemCoeff}×${golemLostDur} = ${golemReflectDmg} 点伤害，命中 ${golemTarget.name}！`);
                      setHeroSkillBanner(`${slotItem.name} 岩层反震！${golemReflectDmg} 伤害！`);
                    }
                  }
                }
              }
              setEquipmentSlotById(blockSlotId, updatedBlockItem as EquipmentItem);
              if (shieldDurability <= 1 && unbreakableNext) {
                setUnbreakableNext(false);
              }
            }
          }
        } else if (!shieldAutoEvolved && !shieldArmorDepleted) {
          const evolveCountWork = evolveBlockCount !== undefined ? { _shieldBlockCount: evolveBlockCount } : {};
          setEquipmentSlotById(blockSlotId, { ...workingShieldItem, ...evolveCountWork } as EquipmentItem);
        }
      }
    }

    if (target !== 'hero') {
      const usedSlotId = target as EquipmentSlotId;
      setCombatState(prev => ({
        ...prev,
        slotBlocksThisTurn: { ...prev.slotBlocksThisTurn, [usedSlotId]: true },
        ...(shieldDurabilityConsumed ? {
          slotDurabilityUsedThisTurn: {
            ...prev.slotDurabilityUsedThisTurn,
            [usedSlotId]: (prev.slotDurabilityUsedThisTurn[usedSlotId] ?? 0) + 1,
          },
        } : {}),
      }));
    }

    if (blockedWithShield && depsRef.current.bulwarkTempArmorRef.current > 0) {
      const blockSlotId = target as EquipmentSlotId;
      const tempGain = 2 * depsRef.current.bulwarkTempArmorRef.current;
      setSlotTempArmor(prev => ({ ...prev, [blockSlotId]: (prev[blockSlotId] ?? 0) + tempGain }));
      const label = blockSlotId === 'equipmentSlot1' ? '左' : '右';
      depsRef.current.addGameLog('magic', `永恒护符·格挡铸甲：${label}装备栏临时护甲 +${tempGain}`);
    }

    if (blockedWithShield && monster.swarmCorrode && !monster.isStunned) {
      const corrodeSlotId = target as EquipmentSlotId;
      const st = engine.getState();
      const corrodeItem = corrodeSlotId === 'equipmentSlot1' ? st.equipmentSlot1 : st.equipmentSlot2;
      if (corrodeItem && (corrodeItem.durability ?? 0) > 0) {
        const corrodedDur = (corrodeItem.durability ?? 1) - 1;
        if (corrodedDur <= 0) {
          const isMonsterEquipCorr = corrodeItem.type === 'monster';
          const nativeReviveCorr = isMonsterEquipCorr && corrodeItem.hasRevive && !corrodeItem.reviveUsed;
          const equipReviveCorr = corrodeItem.hasEquipmentRevive && !corrodeItem.equipmentReviveUsed;

          // --- 遗言 effects (fire BEFORE revive, same as normal shield break) ---
          const hasCorrodeLastWords = corrodeItem.onDestroyHeal || corrodeItem.onDestroyGold || corrodeItem.onDestroyDraw
            || corrodeItem.onDestroyClassDraw || corrodeItem.onDestroyPermanentDamage || corrodeItem.onDestroyPermanentShield || corrodeItem.onDestroyEffect
            || (isMonsterEquipCorr && (corrodeItem.lastWords || corrodeItem.wraithDeathHeal || corrodeItem.wraithDeathHealSpread || corrodeItem.skeletonLastWordsDiscard));
          if (hasCorrodeLastWords) {
            depsRef.current.addGameLog('equip', `${corrodeItem.name} 遗言触发！`);
          }
          if (corrodeItem.onDestroyHeal) {
            healHero(corrodeItem.onDestroyHeal);
            depsRef.current.addGameLog('equip', `${corrodeItem.name} 遗言：恢复了 ${corrodeItem.onDestroyHeal} 点生命`);
          }
          if (corrodeItem.onDestroyGold) {
            setGold(prev => prev + corrodeItem.onDestroyGold!);
            depsRef.current.addGameLog('equip', `${corrodeItem.name} 遗言：获得了 ${corrodeItem.onDestroyGold} 金币`);
          }
          if (corrodeItem.onDestroyDraw) {
            const corrodeDrawNames: string[] = [];
            for (let i = 0; i < corrodeItem.onDestroyDraw; i++) {
              const drawn = drawFromBackpackToHand();
              if (drawn) corrodeDrawNames.push(drawn.name);
            }
            if (corrodeDrawNames.length > 0) {
              depsRef.current.addGameLog('equip', `${corrodeItem.name} 遗言：抽到了 ${corrodeDrawNames.join('、')}`);
            }
          }
          if (corrodeItem.onDestroyClassDraw) {
            const classDrawn = depsRef.current.drawClassCardsToBackpack(corrodeItem.onDestroyClassDraw, `${corrodeItem.name}-遗言`);
            if (classDrawn.length > 0) {
              depsRef.current.triggerClassDeckFlight(classDrawn);
              depsRef.current.addGameLog('equip', `${corrodeItem.name} 遗言：获得专属卡「${classDrawn.map((c: any) => c.name).join('、')}」`);
            }
          }
          if (corrodeItem.onDestroyPermanentDamage) {
            setEquipmentSlotBonus(corrodeSlotId, 'damage', cur => cur + corrodeItem.onDestroyPermanentDamage!);
            depsRef.current.addGameLog('equip', `${corrodeItem.name} 遗言：该装备栏永久伤害 +${corrodeItem.onDestroyPermanentDamage}！`);
            setHeroSkillBanner(`${corrodeItem.name} 遗言！永久伤害 +${corrodeItem.onDestroyPermanentDamage}！`);
          }
          if (corrodeItem.onDestroyPermanentShield) {
            setEquipmentSlotBonus(corrodeSlotId, 'shield', cur => cur + corrodeItem.onDestroyPermanentShield!);
            depsRef.current.addGameLog('equip', `${corrodeItem.name} 遗言：该装备栏永久护甲 +${corrodeItem.onDestroyPermanentShield}！`);
            setHeroSkillBanner(`${corrodeItem.name} 遗言！永久护甲 +${corrodeItem.onDestroyPermanentShield}！`);
          }
          if (corrodeItem.onDestroyEffect) {
            if (corrodeItem.onDestroyEffect === 'slot-temp-buff-3-3') {
              setSlotTempAttack(prev => ({ ...prev, [corrodeSlotId]: (prev[corrodeSlotId] ?? 0) + 3 }));
              setSlotTempArmor(prev => ({ ...prev, [corrodeSlotId]: (prev[corrodeSlotId] ?? 0) + 3 }));
              depsRef.current.addGameLog('equip', `${corrodeItem.name} 遗言：该装备栏 +3临时攻击 +3临时护甲！`);
              setHeroSkillBanner(`${corrodeItem.name} 遗言！该装备栏 +3临时攻击 +3临时护甲！`);
            } else {
              depsRef.current.addGameLog('equip', `${corrodeItem.name} 遗言：${corrodeItem.onDestroyEffect}`);
            }
          }
          if (isMonsterEquipCorr) {
            if (corrodeItem.lastWords === 'discard-hand-3') {
              const drawnNames: string[] = [];
              for (let i = 0; i < 3; i++) {
                const drawn = drawFromBackpackToHand();
                if (drawn) drawnNames.push(drawn.name);
              }
              if (drawnNames.length > 0) {
                depsRef.current.addGameLog('equip', `${corrodeItem.name} 遗言：抽到了 ${drawnNames.join('、')}`);
                setHeroSkillBanner(`${corrodeItem.name} 遗言：抽取 ${drawnNames.length} 张牌！`);
              }
            }
            if (corrodeItem.skeletonLastWordsDiscard) {
              const skelDrawn = drawFromBackpackToHand();
              if (skelDrawn) {
                depsRef.current.addGameLog('equip', `${corrodeItem.name} 遗言：抽到了「${skelDrawn.name}」`);
                setHeroSkillBanner(`${corrodeItem.name} 遗言：抽取 1 张牌！`);
              }
            }
            if (corrodeItem.lastWords?.startsWith('wraith-haunt')) {
              const hauntAmount = parseInt(corrodeItem.lastWords.replace('wraith-haunt-', ''), 10) || 2;
              const otherCorrodeSlotId: EquipmentSlotId = corrodeSlotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
              const otherCorrodeItem = otherCorrodeSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
              if (otherCorrodeItem) {
                setEquipmentSlotBonus(otherCorrodeSlotId, 'damage', cur => cur + hauntAmount);
                depsRef.current.addGameLog('equip', `${corrodeItem.name} 遗言：${otherCorrodeItem.name} 获得临时攻击力 +${hauntAmount}！`);
              }
            }
            if (corrodeItem.wraithDeathHeal || corrodeItem.wraithDeathHealSpread) {
              const otherCorrodeSlotId: EquipmentSlotId = corrodeSlotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
              const otherCorrodeItem = otherCorrodeSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
              if (otherCorrodeItem && otherCorrodeItem.durability != null && otherCorrodeItem.maxDurability != null) {
                const newDur = Math.min(otherCorrodeItem.maxDurability, otherCorrodeItem.durability + 1);
                let updatedOther = { ...otherCorrodeItem } as EquipmentItem;
                if (newDur > otherCorrodeItem.durability) {
                  updatedOther = { ...updatedOther, durability: newDur };
                  depsRef.current.addGameLog('equip', `${corrodeItem.name} 怨灵祝福：${otherCorrodeItem.name} 耐久 +1！`);
                }
                if (corrodeItem.wraithDeathHealSpread && !otherCorrodeItem.wraithDeathHeal) {
                  updatedOther = { ...updatedOther, wraithDeathHeal: 1 };
                  depsRef.current.addGameLog('equip', `${corrodeItem.name} 怨灵传承：${otherCorrodeItem.name} 获得遗言「怨灵祝福」！`);
                }
                setEquipmentSlotById(otherCorrodeSlotId, updatedOther);
              }
            }
          }

          // --- Revive check (after 遗言) ---
          if (nativeReviveCorr || equipReviveCorr) {
            const revivedCorr = nativeReviveCorr
              ? { ...corrodeItem, durability: 1, reviveUsed: true }
              : { ...corrodeItem, durability: 1, equipmentReviveUsed: true };
            setEquipmentSlotById(corrodeSlotId, revivedCorr as EquipmentItem);
            depsRef.current.addGameLog('combat', `${monster.name} 腐蚀甲壳：${corrodeItem.name} 被腐蚀，但复生了！`);
            depsRef.current.addGameLog('equip', `${corrodeItem.name} 复生！以 1 耐久复活！`);
            setHeroSkillBanner(`${corrodeItem.name} 复生了！`);
          } else {
            depsRef.current.addGameLog('combat', `${monster.name} 腐蚀甲壳：${corrodeItem.name} 被腐蚀摧毁！`);
            setHeroSkillBanner(`${monster.name} 腐蚀摧毁了 ${corrodeItem.name}！`);
            disposeOwnedEquipmentCard({ ...corrodeItem }, { isDestruction: true });
            clearEquipmentSlotWithPromote(corrodeSlotId);
            const skelCorrodeOtherSlotId: EquipmentSlotId = corrodeSlotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
            const skelCorrodeOtherItem = skelCorrodeOtherSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
            if (skelCorrodeOtherItem && skelCorrodeOtherItem.type === 'monster' && skelCorrodeOtherItem.skeletonReRevive
              && (!skelCorrodeOtherItem.hasRevive || skelCorrodeOtherItem.reviveUsed)) {
              setEquipmentSlotById(skelCorrodeOtherSlotId, { ...skelCorrodeOtherItem, hasRevive: true, reviveUsed: false } as EquipmentItem);
              depsRef.current.addGameLog('equip', `${skelCorrodeOtherItem.name} 亡骨轮回：获得了「复生」！`);
              setHeroSkillBanner(`${skelCorrodeOtherItem.name} 亡骨轮回！`);
            }
          }
        } else {
          setEquipmentSlotById(corrodeSlotId, { ...corrodeItem, durability: corrodedDur } as EquipmentItem);
          depsRef.current.addGameLog('combat', `${monster.name} 腐蚀甲壳：${corrodeItem.name} 耐久 -1（${corrodeItem.durability} → ${corrodedDur}）`);
        }
      }
    }

    if (remainingDamage > 0) {
      applyDamage(remainingDamage, 'combat', { blockedWithShield });
      depsRef.current.heroTookDamageThisMonsterTurnRef.current = true;
    }

    if (monster.onAttackEffect?.startsWith('steal-gold-')) {
      const stealTarget = parseInt(monster.onAttackEffect.replace('steal-gold-', ''), 10) || 0;
      if (stealTarget > 0) {
        const actualStolen = Math.min(stealTarget, gold);
        setGold(prev => Math.max(0, prev - stealTarget));
        depsRef.current.addGameLog('combat', `${monster.name} 动手偷走了 ${stealTarget} 金币！`);
        setHeroSkillBanner(`${monster.name} 偷走了 ${stealTarget} 金币！`);
        if (actualStolen > 0) {
          depsRef.current.goblinStolenIdsRef.current.add(monster.id);
          updateMonsterCard(monster.id, card => ({ ...card, goblinHasStolen: true }));
        }
        if (monster.goblinStealScale && actualStolen > 0) {
          updateMonsterCard(monster.id, card => ({
            ...card,
            attack: (card.attack ?? card.value) + actualStolen,
            value: card.value + actualStolen,
            hp: (card.hp ?? 0) + actualStolen,
            maxHp: (card.maxHp ?? 0) + actualStolen,
            tempAttackBoost: (card.tempAttackBoost ?? 0) + actualStolen,
            tempHpBoost: (card.tempHpBoost ?? 0) + actualStolen,
          }));
          depsRef.current.addGameLog('combat', `${monster.name} 贪婪强化：攻击力 +${actualStolen}，生命值 +${actualStolen}！`);
        }
      }
    }

    if (monster.goblinStealCard) {
      const currentHand = depsRef.current.handCardsRef.current;
      if (currentHand.length > 0) {
        const goblinColIndex = activeCards.findIndex(c => c?.id === monster.id);
        if (goblinColIndex >= 0) {
          const randomIdx = Math.floor(Math.random() * currentHand.length);
          const stolenCard = currentHand[randomIdx];
          depsRef.current.addGameLog('combat', `${monster.name} 偷走了手牌「${stolenCard.name}」！`);
          setHeroSkillBanner(`${monster.name} 偷走了「${stolenCard.name}」！`);
          await depsRef.current.triggerStealCardFlight(stolenCard, monster.id);
          if (stale()) return;
          setHandCards(prev => prev.filter(c => c.id !== stolenCard.id));
          const markedCard = { ...stolenCard, stolenByGoblin: true };
          setActiveCardStacks(prev => ({
            ...prev,
            [goblinColIndex]: [...(prev[goblinColIndex] ?? []), markedCard],
          }));
        }
      }
    }

    if (monster.eliteDoubleAttack && !pendingBlock.isFollowUpAttack) {
      const doubleResult = await requestDiceOutcome({
        title: monster.name,
        subtitle: '连击判定',
        entries: [
          { id: 'double', range: [1, 14] as [number, number], label: '再攻击一次！', effect: 'none' },
          { id: 'single', range: [15, 20] as [number, number], label: '本次仅一击', effect: 'none' },
        ],
      });
      if (stale()) {
        return;
      }
      if (doubleResult?.id === 'double') {
        depsRef.current.addGameLog('combat', `${monster.name} 发动连击！再次攻击！`);
        setHeroSkillBanner(`${monster.name} 连击！再来一次！`);
        if (reflectDmg > 0 && reflectBlockSlotId) {
          await runShieldReflectBossRetaliationSequence(
            monster,
            reflectDmg,
            reflectSourceName,
            reflectBlockSlotId,
          );
        }
        if (stale()) {
          return;
        }
        setCombatState(prev => ({
          ...prev,
          pendingBlock: {
            monsterId: monster.id,
            attackValue: monster.attack ?? monster.value,
            monsterName: monster.name,
            isFollowUpAttack: true,
          },
        }));
        return;
      }
    }

    if (monster.bossFuryDiceChance && !monster.isStunned) {
      const diceResult = await requestDiceOutcome({
        title: monster.name,
        subtitle: '韧性判定',
        entries: [
          { id: 'skip', range: [1, 10] as [number, number], label: '韧性发动，不掉血层！', effect: 'none' },
          { id: 'lose', range: [11, 20] as [number, number], label: '正常掉血层', effect: 'none' },
        ],
      });
      if (stale()) {
        return;
      }
      if (diceResult?.id === 'skip') {
        depsRef.current.addGameLog('combat', `${monster.name} 韧性发动，本次攻击不掉血层！`);
      } else {
        decrementMonsterFury(monster);
      }
    } else {
      decrementMonsterFury(monster);
    }

    if (blockedWithShield && target !== 'hero') {
      const refillSlotId = target as EquipmentSlotId;
      const refillItem = refillSlotId === 'equipmentSlot1' ? engine.getState().equipmentSlot1 : engine.getState().equipmentSlot2;
      if (
        refillItem?.shieldRefillOnMonsterDeath &&
        refillItem.maxDurability &&
        depsRef.current.pendingDefeatIdsRef.current.has(monster.id)
      ) {
        setEquipmentSlotById(refillSlotId, { ...refillItem, durability: refillItem.maxDurability } as EquipmentItem);
        depsRef.current.addGameLog('equip', `${refillItem.name} 坚韧：怪物死亡，耐久度回满！`);
        setHeroSkillBanner(`${refillItem.name} 耐久度回满！`);
      }
    }

    if (reflectDmg > 0 && reflectBlockSlotId && !depsRef.current.pendingDefeatIdsRef.current.has(monster.id)) {
      await runShieldReflectBossRetaliationSequence(
        monster,
        reflectDmg,
        reflectSourceName,
        reflectBlockSlotId,
      );
    }

    if (stale()) {
      return;
    }

    if (monster.ogreStun) {
      const stunResult = await depsRef.current.requestDiceOutcome({
        title: monster.name,
        subtitle: '击晕判定',
        entries: [
          { id: 'stun', range: [1, 6] as [number, number], label: '击晕！装备栏和护符栏冻结！', effect: 'none' },
          { id: 'miss', range: [7, 20] as [number, number], label: '未击晕', effect: 'none' },
        ],
      });
      if (stale()) {
        return;
      }
      if (stunResult?.id === 'stun') {
        setHeroStunned(true);
        depsRef.current.addGameLog('combat', `${monster.name} 蛮力击晕！你的装备栏和护符栏被冻结了！`);
        setHeroSkillBanner(`被 ${monster.name} 击晕了！装备栏和护符栏冻结！`);
      }
    }

    setCombatState(prev => ({
      ...prev,
      pendingBlock:
        prev.pendingBlock?.monsterId === pendingBlock.monsterId
          ? null
          : prev.pendingBlock,
    }));
  };

  // -- advanceMonsterTurn -----------------------------------------------------

  const advanceMonsterTurn = useCallback(() => {
    setCombatState(prev => {
      if (prev.currentTurn !== 'monster' || prev.pendingBlock) {
        return prev;
      }

      const queue = [...prev.monsterAttackQueue];
      while (queue.length > 0) {
        const nextId = queue.shift()!;
        const monster = activeCards.find(card => card?.id === nextId);
        if (monster) {
          if (monster.isStunned) {
            depsRef.current.addGameLog('combat', `${monster.name} 处于晕眩状态，无法行动！`);
            setHeroSkillBanner(`${monster.name} 晕眩中，跳过行动！`);
            continue;
          }
          return {
            ...prev,
            monsterAttackQueue: queue,
            pendingBlock: {
              monsterId: monster.id,
              attackValue: monster.attack ?? monster.value,
              monsterName: monster.name,
            },
          };
        }
      }

      if (prev.engagedMonsterIds.length === 0) {
        return { ...initialCombatState };
      }

      return {
        ...prev,
        currentTurn: 'hero',
        heroAttacksThisTurn: {
          equipmentSlot1: false,
          equipmentSlot2: false,
        },
        heroAttacksRemaining: 2,
        heroDamageThisTurn: {},
        monsterAttackQueue: [],
      };
    });
  }, [activeCards, setCombatState, setHeroSkillBanner]);

  // -- handleDeathWardConfirm / Decline ---------------------------------------

  const handleDeathWardConfirm = useCallback(() => {
    depsRef.current.pushUndoSnapshot();
    if (!deathWardPrompt) {
      return;
    }
    const { card, source } = deathWardPrompt;
    if (source === 'hand') {
      depsRef.current.consumeCardFromHand(card);
      depsRef.current.consumeClassCardFromHand(card.id);
    } else {
      setBackpackItems(prev => prev.filter(item => item.id !== card.id));
    }
    const isPermanent = (card.upgradeLevel ?? 0) >= 1;
    if (isPermanent) {
      setPermanentMagicRecycleBag(prev => [...prev, { ...card, _recycleWaits: card.recycleDelay ?? 2 }]);
      depsRef.current.finalizeMagicCard(card, { banner: '不灭守护发动，抵消了致命伤害！（将在回收袋中冷却）' });
    } else {
      depsRef.current.finalizeMagicCard(card, { banner: '命悬一线发动，抵消了致命伤害。' });
    }
    setHeroSkillBanner('命悬一线护佑了你。');
    setDeathWardPrompt(null);
  }, [
    deathWardPrompt,
    setBackpackItems,
    setPermanentMagicRecycleBag,
    setHeroSkillBanner,
    setDeathWardPrompt,
  ]);

  const handleDeathWardDecline = useCallback(() => {
    depsRef.current.pushUndoSnapshot();
    if (!deathWardPrompt) {
      return;
    }
    const { pendingDamage, sourceType } = deathWardPrompt;
    setDeathWardPrompt(null);
    depsRef.current.suppressDeathWardRef.current = true;
    try {
      applyDamage(pendingDamage, sourceType);
    } finally {
      depsRef.current.suppressDeathWardRef.current = false;
    }
  }, [applyDamage, deathWardPrompt, setDeathWardPrompt]);

  // -- handleMonsterTargetSelection -------------------------------------------

  const handleMonsterTargetSelection = useCallback(
    (monster: GameCardData) => {
      if (pendingMagicAction?.step === 'monster-select') {
        depsRef.current.handleMagicMonsterSelection(monster);
        return;
      }
      if (pendingHeroMagicAction?.step === 'monster-select') {
        if (depsRef.current.handleHolyLightMonsterCleanse(monster)) {
          return;
        }
      }
      if (pendingHeroSkillAction?.type === 'monster') {
        depsRef.current.handleHeroSkillMonsterSelection(monster);
      }
    },
    [
      pendingHeroMagicAction,
      pendingHeroSkillAction,
      pendingMagicAction,
    ],
  );

  // -- performShieldBash ------------------------------------------------------

  const performShieldBash = async (slotId: EquipmentSlotId, targetMonster: GameCardData) => {
    if (combatState.currentTurn !== 'hero') return;

    const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
    if (!slotItem || slotItem.type !== 'shield' || !slotItem.shieldBashStunRate) return;

    const { addGameLog, setEquipmentSlotById, clearEquipmentSlotWithPromote,
      disposeOwnedEquipmentCard, requestDiceOutcome, triggerWeaponSwingAnimation } = depsRef.current;

    const ae = depsRef.current.amuletEffects;
    const armorValue = slotItem.armorMax ?? slotItem.value ?? 0;
    const bashStunChance = slotItem.shieldBashStunRate * armorValue + (ae.stunRateBoost ?? 0);
    const effectiveBashStun = stunCap > 0 ? Math.min(bashStunChance, stunCap) : bashStunChance;

    addGameLog('combat', `使用 ${slotItem.name} 猛击 ${targetMonster.name}（不造成伤害，${effectiveBashStun}% 击晕）`);
    triggerWeaponSwingAnimation(slotId, 0, { echoes: 1 });

    if (!slotItem.shieldBashUnlimited) {
      setCombatState(prev => ({
        ...prev,
        heroAttacksRemaining:
          prev.heroAttacksRemaining > 0 ? Math.max(0, prev.heroAttacksRemaining - 1) : prev.heroAttacksRemaining,
        heroAttacksThisTurn: {
          ...prev.heroAttacksThisTurn,
          [slotId]: true,
        },
      }));
    }

    if (effectiveBashStun > 0 && !targetMonster.isStunned && targetMonster.type === 'monster') {
      const threshold = Math.round((effectiveBashStun / 100) * 20);
      if (threshold > 0) {
        const stunResult = await requestDiceOutcome({
          title: targetMonster.name,
          subtitle: '盾击晕眩判定',
          entries: [
            { id: 'stun', range: [1, threshold] as [number, number], label: '击晕成功！', effect: 'none' },
            { id: 'miss', range: [threshold + 1, 20] as [number, number], label: '未击晕', effect: 'none' },
          ],
        });
        if (stunResult?.id === 'stun') {
          updateMonsterCard(targetMonster.id, card => ({ ...card, isStunned: true }));
          addGameLog('combat', `${targetMonster.name} 被盾击晕了！下回合无法行动！`);
          setHeroSkillBanner(`${targetMonster.name} 被盾击晕！`);

          if (ae.hasStunRecycleToHand) {
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

          if (ae.hasStunUpgradeCap) {
            setStunCap(prev => {
              const next = Math.min(100, prev + 5);
              addGameLog('amulet', `震慑之符：击晕成功，击晕上限 +5%（当前 ${next}%）`);
              return next;
            });
          }
        }
      }
    }

    const weaponDurability = slotItem.durability ?? 1;
    if (weaponDurability <= 1) {
      if (slotItem.onDestroyHeal) {
        healHero(slotItem.onDestroyHeal);
        addGameLog('equip', `${slotItem.name} 遗言：恢复了 ${slotItem.onDestroyHeal} 点生命`);
      }
      if (slotItem.onDestroyDraw) {
        const drawnNames: string[] = [];
        for (let i = 0; i < slotItem.onDestroyDraw; i++) {
          const drawn = depsRef.current.drawFromBackpackToHand();
          if (drawn) drawnNames.push(drawn.name);
        }
        if (drawnNames.length > 0) {
          addGameLog('equip', `${slotItem.name} 遗言：抽到了 ${drawnNames.join('、')}`);
        }
      }
      if (slotItem.onDestroyClassDraw) {
        const classDrawn = depsRef.current.drawClassCardsToBackpack(slotItem.onDestroyClassDraw, `${slotItem.name}-遗言`);
        if (classDrawn.length > 0) {
          depsRef.current.triggerClassDeckFlight(classDrawn);
          addGameLog('equip', `${slotItem.name} 遗言：获得专属卡「${classDrawn.map(c => c.name).join('、')}」`);
        }
      }
      const isMonsterEquipSB = slotItem.type === 'monster';
      const nativeReviveSB = isMonsterEquipSB && slotItem.hasRevive && !slotItem.reviveUsed;
      const equipReviveSB = slotItem.hasEquipmentRevive && !slotItem.equipmentReviveUsed;
      if (nativeReviveSB || equipReviveSB) {
        const revivedSB = nativeReviveSB
          ? { ...slotItem, durability: 1, reviveUsed: true }
          : { ...slotItem, durability: 1, equipmentReviveUsed: true };
        setEquipmentSlotById(slotId, revivedSB as EquipmentItem);
        addGameLog('equip', `${slotItem.name} 复生！以 1 耐久复活！`);
        setHeroSkillBanner(`${slotItem.name} 复生了！`);
      } else {
        addGameLog('equip', `${slotItem.name} 损坏了`);
        disposeOwnedEquipmentCard({ ...slotItem }, { isDestruction: true });
        clearEquipmentSlotWithPromote(slotId);
      }
    } else {
      setEquipmentSlotById(slotId, { ...slotItem, durability: weaponDurability - 1 } as EquipmentItem);
    }
  };

  // -- handleWeaponToMonster --------------------------------------------------

  function handleWeaponToMonster(weapon: any, monster: GameCardData) {
    if (depsRef.current.fullBoardInteractionLockedRef.current) return;
    if (depsRef.current.heroStunnedRef.current) return;
    if (depsRef.current.handLockedForMonsterPhaseRef.current) {
      setHeroSkillBanner('当前无法用武器攻击（怪物回合或需先格挡）。');
      return;
    }
    depsRef.current.pushUndoSnapshot();
    const slotId = normalizeHeroEquipmentSlotFromDrag(weapon.fromSlot);
    if (!slotId) {
      return;
    }

    const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
    if (slotItem?.type === 'shield' && slotItem.shieldBashStunRate) {
      if (monster.type === 'building') return;
      if (!slotItem.shieldBashUnlimited) {
        const bashSlotAttacked = combatState.heroAttacksThisTurn[slotId];
        const bashHasBase = combatState.heroAttacksRemaining > 0;
        if (bashSlotAttacked || !bashHasBase) {
          return;
        }
      } else {
        if ((slotItem.durability ?? 0) <= 0) return;
      }
      if (!depsRef.current.isMonsterEngaged(monster.id)) {
        beginCombat(monster, 'hero');
      }
      performShieldBash(slotId, monster);
      return;
    }

    if (monster.type === 'building') {
      performHeroAttack(slotId, monster);
      return;
    }

    const slotAlreadyAttacked = combatState.heroAttacksThisTurn[slotId];
    const hasBaseAttack = combatState.heroAttacksRemaining > 0;
    const canUseBerserkerExtra = berserkerRageActive && slotAlreadyAttacked && !berserkerSlotUsed[slotId];
    const hwAe = depsRef.current.amuletEffects;
    const canUseFlashExtra = hwAe.hasFlash && slotAlreadyAttacked && !flashSlotUsed[slotId];
    const canUseGambitExtra = gambitExtraActive && slotAlreadyAttacked && (gambitSlotUsed[slotId] ?? 0) < gambitExtraPerSlot;
    const hwSlotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
    const canUseWeaponExtraHw = !!(hwSlotItem?.weaponExtraAttack) && slotAlreadyAttacked && (weaponExtraAttackUsed[slotId] ?? 0) < (hwSlotItem?.weaponExtraAttack ?? 0);
    const needsExtraCharge = slotAlreadyAttacked || !hasBaseAttack;
    if (needsExtraCharge && !canUseBerserkerExtra && !canUseFlashExtra && !canUseGambitExtra && !canUseWeaponExtraHw && extraAttackCharges <= 0) {
      return;
    }

    if (!depsRef.current.isMonsterEngaged(monster.id)) {
      beginCombat(monster, 'hero');
    }

    performHeroAttack(slotId, monster);
  }

  // ---------------------------------------------------------------------------
  // Return bag
  // ---------------------------------------------------------------------------

  return {
    // Berserker / gambit helpers
    clearBerserkTurnBuff,
    addBerserkTurnBuff,
    grantExtraAttackCharges,
    consumeExtraAttackCharge,

    // Monster damage
    damageMonsterWithLayerOverflow,
    updateMonsterCard,
    checkHollowSkeletonRestore,
    checkWraithRebirth,
    executeLastWords,
    handleMonsterDefeated,
    decrementMonsterFury,
    dealDamageToMonster,

    // Shield reflect / boss retaliation
    applyBossRetaliationDamage,
    applyShieldReflectDamage,
    runShieldReflectBossRetaliationSequence,

    // Healing / damage
    healHero,
    applyDamage,

    // Combat flow
    getEngagedMonsterCards,
    getActiveCombatMonster,
    finishCombat,
    beginCombat,
    applyHeroKillEffects,
    performHeroAttack,
    performShieldBash,
    endHeroTurn,
    resolveBlockChoice,
    advanceMonsterTurn,

    // Death ward
    handleDeathWardConfirm,
    handleDeathWardDecline,

    // Monster target / weapon to monster
    handleMonsterTargetSelection,
    handleWeaponToMonster,

    recordClassDamageDiscoverHit,
    updateDamageDiscoverCounter,
  };
}
