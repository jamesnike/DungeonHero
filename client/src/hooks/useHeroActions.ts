import React, { useCallback, useMemo } from 'react';
import { useGameEngine, useShallowGameState, useDispatch, useGameEvent } from '@/hooks/useGameEngine';
import type { GameCardData, HeroMagicId, EventDiceRange } from '@/components/GameCard';
import type { LogEntryType } from '@/components/GameLogPanel';
import type {
  ActiveAmuletEffects,
  ActiveRowSlots,
  DeckPeekModalState,
  EquipmentItem,
  EquipmentRepairTarget,
  EquipmentSlotId,
  FlightSourceHint,
  HeroMagicActivationOrigin,
  HeroSkillArrowState,
  PendingMagicAction,
  SlotPermanentBonus,
} from '@/components/game-board/types';
import type { HeroSkillId, HeroSkillDefinition } from '@/lib/heroSkills';
import { getHeroSkillById } from '@/lib/heroSkills';
import type { HeroMagicRuntimeState } from '@/lib/heroMagic';
import { getHeroMagicDefinition } from '@/lib/heroMagic';
import {
  INITIAL_HP,
} from '@/game-core/constants';
import {
  computePersuadeSuccessRatePure,
  getPersuadeEffectiveCostPure,
  computeHonorSweepWaveDamagePure,
} from '@/game-core/helpers';

// ---------------------------------------------------------------------------
// Deps: external dependencies injected by GameBoard
// ---------------------------------------------------------------------------

export interface HeroActionsDeps {
  // --- Functions from useCardOperations (Layer 0) ---
  discardCardToGraveyard: (
    card: GameCardData | null | undefined,
    options?: { owner?: 'player' | 'dungeon'; forceGraveyard?: boolean; forceRecycleBag?: boolean },
  ) => void;
  ensureCardInHand: (card: GameCardData) => void;
  queueCardIntoHand: (card: GameCardData, sourceHint?: FlightSourceHint) => void;
  drawFromBackpackToHand: () => void;
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
  getEquipmentReserve: (id: EquipmentSlotId) => EquipmentItem[];
  setEquipmentReserve: (id: EquipmentSlotId, items: EquipmentItem[]) => void;
  disposeOwnedEquipmentCard: (card: GameCardData, options?: { isDestruction?: boolean; triggerLastWords?: boolean; fromSlotId?: EquipmentSlotId }) => void;
  addPermanentMagicToRecycleBag: (card: GameCardData, options?: { waitsOverride?: number }) => void;
  amuletEffects: ActiveAmuletEffects;
  eternalRelicsRef: React.MutableRefObject<import('@/game-core/types').EternalRelic[]>;

  // --- Functions from useCombatActions (Layer 1) ---
  healHero: (amount: number) => number;
  applyDamage: (damage: number, source?: 'combat' | 'general', opts?: { blockedWithShield?: boolean }) => number;
  beginCombat: (monster: GameCardData, initiator: 'hero' | 'monster') => void;
  dealDamageToMonster: (monster: GameCardData, damage: number, options?: { animationDelay?: number; pulses?: number }) => void;
  updateMonsterCard: (id: string, updater: (m: GameCardData) => GameCardData) => void;
  isMonsterEngaged: (monsterId: string) => boolean;

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
    options?: { delivery?: 'backpack' | 'hand-first' },
  ) => Promise<GameCardData | null>;

  // --- Functions from useCardPlayHandlers (Layer 3) ---
  requestDiceOutcome: (config: {
    title: string;
    subtitle?: string;
    entries: EventDiceRange[];
    flowContext?: Record<string, unknown>;
    predeterminedRoll?: number;
  }) => Promise<EventDiceRange | null>;
  getSpellDamage: (baseDamage: number) => number;
  /** 与普攻一致的英雄攻击力加成（护符/技能等） */
  getAttackBonus: () => number;
  updateHeroMagicStateById: (
    id: HeroMagicId,
    updater: (state: HeroMagicRuntimeState) => HeroMagicRuntimeState,
  ) => void;
  completeHeroMagicActivation: (id: HeroMagicId, origin: 'gauge' | 'card') => void;
  applyBerserkerRageEffect: (origin: 'gauge' | 'card') => void;
  finalizeMagicCard: (card: GameCardData, opts: { banner: string }) => void;
  finalizePotionCard: (card: GameCardData, opts: { banner: string }) => void | Promise<void>;
  resolvePotionRepairForSlot: (
    slotId: EquipmentSlotId,
    card: GameCardData,
    amount: number,
    allowedTypes: EquipmentRepairTarget[],
  ) => boolean;
  chaosStrikeHasOverkill: (monster: GameCardData, damage: number) => boolean;
  drawCardsFromBackpack: (count: number, opts?: { ignoreLimit?: boolean }) => number;
  resolveStatSwap: (card: GameCardData, target: GameCardData, isFlank: boolean) => void;
  resolveRepairEnrageDice: (card: GameCardData, slotId: EquipmentSlotId, monster: GameCardData) => void;

  // --- Animation / UI callbacks from GameBoard ---
  addGameLog: (type: LogEntryType, message: string) => void;
  pushUndoSnapshot: () => void;
  clearUndoStack: () => void;
  removeCard: (cardId: string, animate: boolean, opts?: { skipAutoDraw?: boolean }) => void;
  removePendingDungeonCard: (cardId: string) => boolean;
  triggerClassDeckFlight: (cards: GameCardData[]) => void;
  triggerFateSwapFlight: (activeSlotIdx: number, oldCard: GameCardData, newCard: GameCardData) => void;
  triggerActiveRowSwapFlight: (
    leftSlotIdx: number,
    rightSlotIdx: number,
    leftCard: GameCardData,
    rightCard: GameCardData,
  ) => void;
  triggerReturnToDeckFlight: (slotIdx: number, card: GameCardData) => void;
  clearAllBackpackHandFallbacks: () => void;

  // --- Deck peek modal ---
  setDeckPeekState: React.Dispatch<React.SetStateAction<DeckPeekModalState | null>>;
  deckJudgePeekCloseRef: React.MutableRefObject<(() => void) | null>;

  // --- Local state not in engine ---
  setHeroSkillArrow: (val: HeroSkillArrowState | null) => void;
  setPersuadeRollKey: React.Dispatch<React.SetStateAction<number>>;
  waterfallActive: boolean;

  // --- Refs ---
  fullBoardInteractionLockedRef: React.MutableRefObject<boolean>;
  echoRemainingRef: React.MutableRefObject<number>;
  echoTotalRef: React.MutableRefObject<number>;
  setPersuadeTempDiscount: React.Dispatch<React.SetStateAction<number>>;
  activeCardsLatestRef: React.MutableRefObject<ActiveRowSlots>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useHeroActions(depsRef: React.MutableRefObject<HeroActionsDeps>) {
  const engine = useGameEngine();
  const dispatch = useDispatch();
  const gs = useShallowGameState(s => ({
    hp: s.hp,
    gold: s.gold,
    activeCards: s.activeCards,
    handCards: s.handCards,
    discardedCards: s.discardedCards,
    equipmentSlot1: s.equipmentSlot1,
    equipmentSlot2: s.equipmentSlot2,
    classDeck: s.classDeck,
    remainingDeck: s.remainingDeck,
    previewCards: s.previewCards,
    heroMagicState: s.heroMagicState,
    selectedHeroSkill: s.selectedHeroSkill,
    permanentSkills: s.permanentSkills,
    permanentSpellDamageBonus: s.permanentSpellDamageBonus,
    permanentMaxHpBonus: s.permanentMaxHpBonus,
    slotTempArmor: s.slotTempArmor,
    slotTempAttack: s.slotTempAttack,
    stunCap: s.stunCap,
    heroSkillUsedThisWave: s.heroSkillUsedThisWave,
    extraSkillsUsedThisWave: s.extraSkillsUsedThisWave,
    pendingHeroSkillAction: s.pendingHeroSkillAction,
    pendingHeroMagicAction: s.pendingHeroMagicAction,
    pendingMagicAction: s.pendingMagicAction,
    pendingPotionAction: s.pendingPotionAction,
    persuadeState: s.persuadeState,
    turnCount: s.turnCount,
    honorSweepUpgradesPending: s.honorSweepUpgradesPending,
  }));

  const {
    hp,
    gold,
    activeCards,
    handCards,
    discardedCards,
    equipmentSlot1,
    equipmentSlot2,
    classDeck,
    remainingDeck,
    previewCards,
    heroMagicState,
    selectedHeroSkill,
    permanentSkills,
    permanentSpellDamageBonus,
    permanentMaxHpBonus,
    slotTempArmor,
    stunCap,
    heroSkillUsedThisWave,
    extraSkillsUsedThisWave,
    pendingHeroSkillAction,
    pendingHeroMagicAction,
    pendingMagicAction,
    pendingPotionAction,
    persuadeState,
    turnCount,
    honorSweepUpgradesPending,
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

  // -- State helpers -----------------------------------------------------------

  type GS = import('@/game-core/types').GameState;

  const updateSwapUpgradeCounter = useCallback((displayCount: number, threshold: number) => {
    dispatch({ type: 'UPDATE_AMULET_SLOTS', updater: prev => prev.map(slot => {
      if (slot?.amuletEffect !== 'swap-upgrade') return slot;
      return { ...slot, _counterDisplay: `${displayCount}/${threshold}` };
    }) });
  }, []);

  // -- Convenience accessors --------------------------------------------------

  const addGameLog = (type: LogEntryType, message: string) =>
    depsRef.current.addGameLog(type, message);

  // -- Derived values ---------------------------------------------------------

  const selectedHeroSkillDef = useMemo<HeroSkillDefinition | null>(
    () => getHeroSkillById(selectedHeroSkill as HeroSkillId | null | undefined),
    [selectedHeroSkill],
  );

  const heroSkillTargeting = Boolean(pendingHeroSkillAction);

  // ---------------------------------------------------------------------------
  // resetHeroSkillForNewWave
  // ---------------------------------------------------------------------------

  const resetHeroSkillForNewWave = useCallback(() => {
    dispatch({ type: 'RESET_HERO_WAVE' });
    depsRef.current.clearAllBackpackHandFallbacks();
  }, [dispatch]);

  // ---------------------------------------------------------------------------
  // addHeroMagicGauge
  // ---------------------------------------------------------------------------

  const addHeroMagicGauge = useCallback(
    (id: HeroMagicId, amount: number) => {
      if (amount <= 0) return;
      dispatch({ type: 'ADD_MAGIC_GAUGE', gaugeType: id, amount });
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // startHeroMagicActivation
  // ---------------------------------------------------------------------------

  const startHeroMagicActivation = useCallback(
    (id: HeroMagicId, origin: HeroMagicActivationOrigin) => {
      if (pendingHeroMagicAction) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '请先完成当前的英雄魔法动作。' });
        return false;
      }
      if (pendingHeroSkillAction || pendingMagicAction || pendingPotionAction) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '请先完成当前的操作。' });
        return false;
      }

      dispatch({ type: 'ACTIVATE_HERO_MAGIC', magicId: id, origin });
      return true;
    },
    [
      pendingHeroMagicAction,
      pendingHeroSkillAction,
      pendingMagicAction,
      pendingPotionAction,
    ],
  );

  // ---------------------------------------------------------------------------
  // cancelHeroSkillAction / cancelHeroMagicAction / cancelPotionAction
  // ---------------------------------------------------------------------------

  const cancelHeroSkillAction = useCallback(() => {
    dispatch({ type: 'SET_PENDING_HERO_SKILL', payload: null });
    dispatch({ type: 'SET_HERO_SKILL_BANNER', message: null });
    depsRef.current.setHeroSkillArrow(null);
  }, [dispatch]);

  const cancelHeroMagicAction = useCallback(() => {
    dispatch({ type: 'SET_PENDING_HERO_MAGIC', payload: null });
    dispatch({ type: 'SET_HERO_SKILL_BANNER', message: null });
  }, [dispatch]);

  const cancelPotionAction = useCallback(() => {
    if (pendingPotionAction) {
      void depsRef.current.finalizePotionCard(pendingPotionAction.card, { banner: '取消使用药剂。' });
    }
    dispatch({ type: 'SET_PENDING_POTION', payload: null });
    dispatch({ type: 'SET_HERO_SKILL_BANNER', message: null });
  }, [pendingPotionAction]);

  // ---------------------------------------------------------------------------
  // markSkillUsed
  // ---------------------------------------------------------------------------

  const markSkillUsed = useCallback((skillId: HeroSkillId) => {
    dispatch({ type: 'MARK_SKILL_USED', skillId });
  }, [dispatch, engine]);

  // ---------------------------------------------------------------------------
  // handleHeroSkillUse
  // ---------------------------------------------------------------------------

  const handleHeroSkillUse = useCallback((overrideSkillId?: HeroSkillId) => {
    depsRef.current.pushUndoSnapshot();
    const skillDef = overrideSkillId ? getHeroSkillById(overrideSkillId) : selectedHeroSkillDef;
    const isExtraSkill = !!overrideSkillId;
    if (!skillDef) {
      dispatch({ type: 'SET_HERO_SKILL_BANNER', message: null });
      return;
    }
    if (skillDef.type === 'passive') {
      dispatch({ type: 'SET_HERO_SKILL_BANNER', message: 'Passive skill is always active.' });
      return;
    }
    if (isExtraSkill) {
      if (extraSkillsUsedThisWave.includes(overrideSkillId)) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '该技能本波已使用。' });
        return;
      }
    } else if (heroSkillUsedThisWave) {
      dispatch({ type: 'SET_HERO_SKILL_BANNER', message: 'Hero skill already used this wave.' });
      return;
    }
    if (pendingHeroSkillAction) {
      dispatch({ type: 'SET_HERO_SKILL_BANNER', message: 'Finish the current hero skill action first.' });
      return;
    }
    if (depsRef.current.waterfallActive) {
      dispatch({ type: 'SET_HERO_SKILL_BANNER', message: 'Wait for the waterfall to finish before using the skill.' });
      return;
    }

    dispatch({ type: 'USE_HERO_SKILL', skillId: skillDef.id, isExtraSkill });
  }, [
    extraSkillsUsedThisWave,
    heroSkillUsedThisWave,
    pendingHeroSkillAction,
    selectedHeroSkillDef]);

  // ---------------------------------------------------------------------------
  // handleHeroSkillSlotSelection
  // ---------------------------------------------------------------------------

  const handleHeroSkillSlotSelection = useCallback(
    (slotId: EquipmentSlotId) => {
      if (!pendingHeroSkillAction || pendingHeroSkillAction.type !== 'slot') {
        return;
      }
      dispatch({ type: 'RESOLVE_HERO_SKILL_TARGET', slotId });
      depsRef.current.setHeroSkillArrow(null);
    },
    [pendingHeroSkillAction],
  );

  const computeHonorSweepWaveDamage = useCallback(
    (slotId: EquipmentSlotId): number => {
      return computeHonorSweepWaveDamagePure(engine.getState(), slotId);
    },
    [engine],
  );

  const applyHonorSweepMagic = useCallback(
    (_card: GameCardData, slotId: EquipmentSlotId) => {
      dispatch({ type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'honor-sweep', slotId });
    },
    [],
  );

  const applyWeaponSweepMagic = useCallback(
    (_card: GameCardData, slotId: EquipmentSlotId) => {
      dispatch({ type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'weapon-sweep', slotId });
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // handleMagicSlotSelection
  // ---------------------------------------------------------------------------

  const handleMagicSlotSelection = useCallback(
    (slotId: EquipmentSlotId) => {
      if (!pendingMagicAction || pendingMagicAction.step !== 'slot-select') {
        return;
      }
      dispatch({ type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: pendingMagicAction.effect, slotId });
    },
    [pendingMagicAction],
  );

  // ---------------------------------------------------------------------------
  // handlePotionChoiceSelection
  // ---------------------------------------------------------------------------

  const handlePotionChoiceSelection = useCallback(
    (value: string) => {
      if (!pendingPotionAction || pendingPotionAction.effect !== 'repair-choice') {
        return;
      }
      dispatch({ type: 'RESOLVE_MAGIC_CHOICE', choiceId: value });
    },
    [pendingPotionAction, dispatch],
  );

  // ---------------------------------------------------------------------------
  // handlePotionSlotSelection
  // ---------------------------------------------------------------------------

  const handlePotionSlotSelection = useCallback(
    (slotId: EquipmentSlotId) => {
      if (!pendingPotionAction || pendingPotionAction.step !== 'slot-select') {
        return;
      }
      dispatch({ type: 'RESOLVE_EQUIPMENT_CHOICE', slotId });
    },
    [pendingPotionAction, dispatch],
  );

  // ---------------------------------------------------------------------------
  // handleHeroSkillMonsterSelection
  // ---------------------------------------------------------------------------

  const handleHeroSkillMonsterSelection = useCallback(
    (monster: GameCardData) => {
      if (!pendingHeroSkillAction || pendingHeroSkillAction.type !== 'monster') {
        return;
      }
      dispatch({ type: 'RESOLVE_HERO_SKILL_TARGET', monsterId: monster.id });
      depsRef.current.setHeroSkillArrow(null);
    },
    [pendingHeroSkillAction],
  );

  // ---------------------------------------------------------------------------
  // handleMagicMonsterSelection
  // ---------------------------------------------------------------------------

  const handleMagicMonsterSelection = useCallback(
    (monster: GameCardData) => {
      if (!pendingMagicAction || pendingMagicAction.step !== 'monster-select') {
        return;
      }
      dispatch({ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: pendingMagicAction.effect, monsterId: monster.id });
    },
    [pendingMagicAction],
  );

  // 单目标伤害 magic 自伤路径：玩家在 monster-select 阶段点击 Hero Cell。
  // 只有 pending.allowsHeroTarget === true 才允许；reducer 端会把 selfInflicted 走通，
  // 触发血怒战符 / 力量护符 / 复生庇佑充能 等"以己受伤为条件"的效果。
  const handleMagicHeroSelfTarget = useCallback(
    () => {
      if (!pendingMagicAction || pendingMagicAction.step !== 'monster-select') {
        return;
      }
      const allowsHero = (pendingMagicAction as { allowsHeroTarget?: boolean }).allowsHeroTarget;
      if (!allowsHero) return;
      dispatch({
        type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
        magicId: pendingMagicAction.effect,
        monsterId: '',
        targetType: 'hero',
      });
    },
    [pendingMagicAction],
  );

  // 单目标伤害 magic 打盾路径：玩家在 monster-select 阶段点击装有盾的装备槽。
  // 与 hero-self target 同源（同样 gate 在 allowsHeroTarget 上），区别是 reducer 端
  // 会让盾的 armor 先吃伤，溢出再走 APPLY_DAMAGE selfInflicted。
  const handleMagicShieldSlotTarget = useCallback(
    (slotId: 'equipmentSlot1' | 'equipmentSlot2') => {
      if (!pendingMagicAction || pendingMagicAction.step !== 'monster-select') {
        return;
      }
      const allowsHero = (pendingMagicAction as { allowsHeroTarget?: boolean }).allowsHeroTarget;
      if (!allowsHero) return;
      dispatch({
        type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
        magicId: pendingMagicAction.effect,
        monsterId: '',
        targetType: 'shield-slot',
        slotId,
      });
    },
    [pendingMagicAction],
  );

  // ---------------------------------------------------------------------------
  // handleDungeonCardSelection
  // ---------------------------------------------------------------------------

  const handleDungeonCardSelection = useCallback(
    (card: GameCardData) => {
      if (!pendingMagicAction || pendingMagicAction.step !== 'dungeon-select') {
        return;
      }
      // 「乾坤一翻」可以选 Preview 行的卡背；其它 dungeon-select 仅允许 active 行。
      // 找不到对应行时退而求其次：preview 行查找用 -1 也没关系，reducer 会自己再
      // 用 cardId 在两行里定位（rules/hero.ts case 'flip-active-card'）。
      const activeSlotIdx = activeCards.findIndex(c => c?.id === card.id);
      let targetIndex = activeSlotIdx;
      if (activeSlotIdx === -1 && pendingMagicAction.effect === 'flip-active-card') {
        const previewSlotIdx = previewCards.findIndex(c => c?.id === card.id);
        if (previewSlotIdx !== -1) {
          targetIndex = previewSlotIdx;
        } else {
          return;
        }
      }
      dispatch({ type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: card.id, targetIndex });
    },
    [activeCards, previewCards, pendingMagicAction],
  );

  // ---------------------------------------------------------------------------
  // handleBackpackReorganizeConfirm — 整顿背囊 (knight Perm 2) multi-select
  // confirmation. Selections are { source: 'hand'|'amulet'|'equipment', id }.
  // For 'hand' / 'amulet' the id is the card id; for 'equipment' the id is
  // the slotId ('equipmentSlot1' / 'equipmentSlot2'). Confirming with an empty
  // array is allowed — the player keeps the +1 capacity but pushes no cards.
  // ---------------------------------------------------------------------------

  const handleBackpackReorganizeConfirm = useCallback(
    (selections: Array<{ source: 'hand' | 'amulet' | 'equipment'; id: string }>) => {
      if (
        !pendingMagicAction ||
        pendingMagicAction.effect !== 'reorganize-backpack' ||
        pendingMagicAction.step !== 'multi-select'
      ) {
        return;
      }
      dispatch({ type: 'RESOLVE_PUSH_TO_BACKPACK_TOP', selections });
    },
    [pendingMagicAction],
  );

  // ---------------------------------------------------------------------------
  // handleHandDiscardSelectionConfirm — 玩家在 HandDiscardSelectionModal 点击
  // 「确认弃回」时的薄派发。reducer (RESOLVE_HAND_DISCARD_SELECTION) 自身会校验
  // 选中数量与候选合法性，这里只做最薄的「有 pending 才派发」防御。
  // ---------------------------------------------------------------------------
  const handleHandDiscardSelectionConfirm = useCallback(
    (cardIds: string[]) => {
      const st = engine.getState();
      if (!st.pendingHandDiscardSelection) return;
      dispatch({ type: 'RESOLVE_HAND_DISCARD_SELECTION', cardIds });
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // handleSlotTargetSelection
  // ---------------------------------------------------------------------------

  const handleReviveBlessingSlotSelection = useCallback(
    (slotId: EquipmentSlotId) => {
      if (!pendingHeroMagicAction || pendingHeroMagicAction.id !== 'revive-blessing') {
        return;
      }
      dispatch({ type: 'RESOLVE_HERO_MAGIC_TARGET', slotId });
    },
    [pendingHeroMagicAction],
  );

  const handleSlotTargetSelection = useCallback(
    (slotId: EquipmentSlotId) => {
      if (pendingPotionAction?.step === 'slot-select') {
        handlePotionSlotSelection(slotId);
        return;
      }
      if (pendingMagicAction?.step === 'slot-select') {
        handleMagicSlotSelection(slotId);
        return;
      }
      if (pendingHeroMagicAction?.id === 'revive-blessing' && pendingHeroMagicAction?.step === 'slot-select') {
        handleReviveBlessingSlotSelection(slotId);
        return;
      }
      if (pendingHeroSkillAction?.type === 'slot') {
        handleHeroSkillSlotSelection(slotId);
      }
    },
    [
      handleHeroSkillSlotSelection,
      handleMagicSlotSelection,
      handlePotionSlotSelection,
      handleReviveBlessingSlotSelection,
      pendingHeroMagicAction,
      pendingHeroSkillAction,
      pendingMagicAction,
      pendingPotionAction],
  );

  // ---------------------------------------------------------------------------
  // Persuade flow
  // ---------------------------------------------------------------------------

  const computePersuadeSuccessRate = (monster: GameCardData): number =>
    computePersuadeSuccessRatePure(engine.getState(), monster);

  const getPersuadeEffectiveCost = (card?: GameCardData): number =>
    getPersuadeEffectiveCostPure(engine.getState(), card);

  const canPersuadeMonster = (card: GameCardData): boolean => {
    if (card.type !== 'monster') return false;
    const effectiveCost = getPersuadeEffectiveCost(card);
    const st = engine.getState();
    const liveCard = (st.activeCards as GameCardData[]).find(c => c?.id === card.id);
    const src = liveCard ?? card;
    const monsterLayers = src.currentLayer ?? src.hpLayers ?? src.fury ?? 1;
    const goldOk = st.gold >= effectiveCost;
    const layerOk = monsterLayers <= st.persuadeLevel;
    if (!goldOk || !layerOk) {
      console.log('[canPersuade]', card.name,
        '| gold:', st.gold, '>=', effectiveCost, '→', goldOk,
        '| layers:', monsterLayers, '(cur:', src.currentLayer, 'hp:', src.hpLayers, 'fury:', src.fury, ')',
        '<=', st.persuadeLevel, '→', layerOk,
        '| liveCard found:', !!liveCard,
      );
    }
    return goldOk && layerOk;
  };

  const openPersuadeModal = (monster: GameCardData, targetSlot: 'backpack' = 'backpack') => {
    const successRate = computePersuadeSuccessRate(monster);
    const effectiveCost = getPersuadeEffectiveCost(monster);
    const threshold = 21 - successRate / 5;
    dispatch({ type: 'SET_PERSUADE_STATE', payload: {
      monster,
      targetSlot,
      phase: 'confirm',
      threshold,
      successRate,
      diceValue: null,
      success: null,
    } });
  };

  const handlePersuadeConfirm = () => {
    if (!persuadeState) return;
    // 劝降不可撤销：付钱 + 摇骰之后不允许 Undo 退回（防止失败后撤销重摇）。
    // 不 push snapshot，并清空整个 undo 栈，让此刻成为硬性 commit 点：
    // 之前的所有 undo checkpoint 也一并失效，避免玩家越过 PERSUADE_MONSTER
    // 跳回到更早的状态来变相重摇。
    depsRef.current.clearUndoStack();
    dispatch({ type: 'PERSUADE_MONSTER', monsterId: persuadeState.monster.id });
    depsRef.current.setPersuadeTempDiscount(0);
    depsRef.current.setPersuadeRollKey(prev => prev + 1);
  };

  // ---------------------------------------------------------------------------
  // Button handlers
  // ---------------------------------------------------------------------------

  const handleHeroSkillButtonClick = useCallback(() => {
    if (depsRef.current.fullBoardInteractionLockedRef.current) return;
    if (heroSkillTargeting) {
      cancelHeroSkillAction();
      return;
    }
    handleHeroSkillUse();
  }, [heroSkillTargeting, cancelHeroSkillAction, handleHeroSkillUse]);

  const handleExtraHeroSkillButtonClick = useCallback((skillId: string) => {
    if (depsRef.current.fullBoardInteractionLockedRef.current) return;
    if (heroSkillTargeting) {
      cancelHeroSkillAction();
      return;
    }
    handleHeroSkillUse(skillId as HeroSkillId);
  }, [heroSkillTargeting, cancelHeroSkillAction, handleHeroSkillUse]);

  const handleHeroMagicTrigger = useCallback(
    (id: HeroMagicId) => {
      if (depsRef.current.fullBoardInteractionLockedRef.current) return;
      depsRef.current.pushUndoSnapshot();
      startHeroMagicActivation(id, 'gauge');
    },
    [startHeroMagicActivation],
  );

  // ---------------------------------------------------------------------------
  // Event listeners — UI reactions to reducer side-effects
  // ---------------------------------------------------------------------------

  useGameEvent('hero:skillRequiresInteraction', ({ skillId, step }) => {
    if (skillId === 'graveyard-recall' && step === 'discard-phase') {
      depsRef.current.requestCardActionBatch('discard-recycle', 2, {
        title: '亡灵拾遗：弃置 2 张手牌',
        description: '选择 2 张手牌弃置，随后从坟场召回一张卡牌。',
        handOnly: true,
      }).then(discardCount => {
        if (discardCount < 2) {
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '亡灵拾遗已取消（需要弃置 2 张手牌）。' });
          return;
        }
        dispatch({ type: 'USE_HERO_SKILL', skillId: 'graveyard-recall', target: 'resolve-recall' });
        depsRef.current.requestGraveyardSelection(3, { delivery: 'hand-first' }).then(selected => {
          if (selected) {
            addGameLog('skill', `亡灵拾遗：从坟场召回「${selected.name}」`);
          } else {
            dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '放弃了坟场召回。' });
          }
        });
      });
    }
  });

  useGameEvent('cards:classDrawn', ({ cards }) => {
    if (cards.length > 0) {
      depsRef.current.triggerClassDeckFlight(cards);
    }
  });

  useGameEvent('hero:deckPeekRequest', (payload) => {
    const { mode, peekedCards, gains } = payload as any;
    depsRef.current.setDeckPeekState({ mode, peekedCards, gains });
  });

  useGameEvent('hero:fateSwapFlight', (payload) => {
    const { activeSlotIdx, oldCard, newCard } = payload as any;
    depsRef.current.triggerFateSwapFlight(activeSlotIdx, oldCard, newCard);
  });

  // 乾坤挪移 / 命运挪移 — both auto-target two active-row cards. Reducer
  // emits exactly once when the net swap actually changed state (odd echo
  // multiplier). Listener captures cell rects via activeCellRefs and triggers
  // two simultaneous arc flights between the two cells.
  useGameEvent('magic:activeRowSwap', (payload) => {
    const { leftSlotIdx, rightSlotIdx, leftCard, rightCard } = payload;
    depsRef.current.triggerActiveRowSwapFlight(leftSlotIdx, rightSlotIdx, leftCard, rightCard);
  });

  // 迷宫回溯 — single active-row card flies to the deck pile. Emitted from
  // both the schema/legacy auto-resolve paths and the player-pick reducer
  // (return-dungeon-bottom / shuffle-dungeon).
  useGameEvent('magic:returnToDeck', (payload) => {
    const { slotIdx, card } = payload;
    depsRef.current.triggerReturnToDeckFlight(slotIdx, card);
  });

  useGameEvent('hero:cardRemoved', (payload) => {
    const { cardId, animate } = payload as { cardId: string; animate: boolean };
    depsRef.current.removeCard(cardId, animate);
  });

  // State-driven via pendingHeroSkillAction — log target requirement
  useGameEvent('hero:skillRequiresTarget', ({ skillId, targetType }) => {
    addGameLog('skill', `技能 ${skillId} 需要选择${targetType === 'monster' ? '怪物' : '装备栏'}目标`);
  });

  // Skill used — log for game history
  useGameEvent('hero:skillUsed', ({ skillId }) => {
    addGameLog('skill', `使用了英雄技能：${skillId}`);
  });

  // Magic activated — log activation for game history
  useGameEvent('hero:magicActivated', ({ magicId }) => {
    addGameLog('skill', `英雄魔法发动：${magicId}`);
  });

  // Magic completed — UI-side cleanup after reducer finishes magic resolution
  useGameEvent('hero:magicCompleted', ({ magicId, origin }) => {
    depsRef.current.completeHeroMagicActivation(
      magicId as HeroMagicId,
      origin as 'gauge' | 'card',
    );
  });

  // Gauge fill — future wiring point for gauge fill animation
  useGameEvent('hero:magicGaugeAdded', ({ gaugeType, amount }) => {
    console.debug('[HeroMagic] gauge added:', gaugeType, '+', amount);
  });

  // Gauge full notification
  useGameEvent('hero:magicGaugeFull', ({ gaugeType }) => {
    addGameLog('skill', `魔法仪表 ${gaugeType} 已满！`);
  });

  // Persuade attempt — trigger dice roll animation
  useGameEvent('hero:persuadeAttempt', () => {
    depsRef.current.setPersuadeRollKey(prev => prev + 1);
  });

  // Level up — log and future animation wiring
  useGameEvent('hero:leveledUp', ({ stat, amount }) => {
    addGameLog('skill', `英雄升级：${stat} +${amount}`);
  });

  // Sweep animation trigger — visual effect only (damage handled by hero:sweepDamage)
  useGameEvent('hero:sweep', ({ targetIds }) => {
    addGameLog('combat', `横扫攻击，目标数量：${targetIds.length}`);
  });

  // ---------------------------------------------------------------------------
  // Return bag
  // ---------------------------------------------------------------------------

  return {
    resetHeroSkillForNewWave,
    addHeroMagicGauge,
    startHeroMagicActivation,
    cancelHeroSkillAction,
    cancelHeroMagicAction,
    cancelPotionAction,
    markSkillUsed,
    applyHonorSweepMagic,
    applyWeaponSweepMagic,
    handleHeroSkillUse,
    handleHeroSkillSlotSelection,
    handleMagicSlotSelection,
    handlePotionChoiceSelection,
    handlePotionSlotSelection,
    handleHeroSkillMonsterSelection,
    handleMagicMonsterSelection,
    handleMagicHeroSelfTarget,
    handleMagicShieldSlotTarget,
    handleDungeonCardSelection,
    handleBackpackReorganizeConfirm,
    handleHandDiscardSelectionConfirm,
    handleSlotTargetSelection,
    computePersuadeSuccessRate,
    canPersuadeMonster,
    openPersuadeModal,
    handlePersuadeConfirm,
    handleHeroSkillButtonClick,
    handleExtraHeroSkillButtonClick,
    handleHeroMagicTrigger,
    honorSweepUpgradesPending,
    clearHonorSweepUpgrades: () => dispatch({ type: 'SET_GAME_FLAGS', patch: { honorSweepUpgradesPending: 0 } }),
  };
}
