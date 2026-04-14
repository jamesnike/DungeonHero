import React, { useCallback, useMemo } from 'react';
import { useGameEngine, useGameState, useEngineSetter } from '@/hooks/useGameEngine';
import type { GameCardData, HeroMagicId, EventDiceRange } from '@/components/GameCard';
import type { KnightCardData } from '@/lib/knightDeck';
import type { LogEntryType } from '@/components/GameLogPanel';
import type {
  ActiveAmuletEffects,
  ActiveRowSlots,
  DeckPeekModalState,
  EquipmentItem,
  EquipmentRepairTarget,
  EquipmentSlotId,
  HeroMagicActivationOrigin,
  HeroSkillArrowState,
  PendingMagicAction,
  SlotPermanentBonus,
} from '@/components/game-board/types';
import type { HeroSkillId, HeroSkillDefinition } from '@/lib/heroSkills';
import { getHeroSkillById } from '@/lib/heroSkills';
import type { HeroMagicRuntimeState } from '@/lib/heroMagic';
import { HERO_MAGIC_IDS, getHeroMagicDefinition } from '@/lib/heroMagic';
import type { EquipmentBuffSnapshot } from '@/lib/gameStorage';
import {
  INITIAL_HP,
  PERSUADE_COST,
} from '@/game-core/constants';
import {
  flattenActiveRowSlots,
  sanitizeCardMetadata,
  pickRandomHandCardsForDiscardPreferGraveyard,
  isDamageableTarget,
} from '@/game-core/helpers';
import { getEquipmentSlotsWithSuppressedTempAttack } from '@/game-core/buildingAura';
import { applyMonsterRage } from '@/lib/monsterRage';

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
  drawFromBackpackToHand: () => GameCardData | null;
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
  getEquipmentReserve: (id: EquipmentSlotId) => EquipmentItem[];
  setEquipmentReserve: (id: EquipmentSlotId, items: EquipmentItem[]) => void;
  disposeOwnedEquipmentCard: (card: GameCardData, options?: { isDestruction?: boolean }) => void;
  addPermanentMagicToRecycleBag: (card: GameCardData) => void;
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
  requestGraveyardSelection: (
    maxCards: number,
    options?: { delivery?: 'backpack' | 'hand-first' },
  ) => Promise<GameCardData | null>;

  // --- Functions from useCardPlayHandlers (Layer 3) ---
  requestDiceOutcome: (config: {
    title: string;
    subtitle?: string;
    entries: EventDiceRange[];
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
  resolveFateSight: (card: GameCardData, target: GameCardData, baseDmg: number, peekCount: number) => void;
  resolveStatSwap: (card: GameCardData, target: GameCardData, isFlank: boolean) => void;
  resolveRepairEnrageDice: (card: GameCardData, slotId: EquipmentSlotId, monster: GameCardData) => void;

  // --- Animation / UI callbacks from GameBoard ---
  addGameLog: (type: LogEntryType, message: string) => void;
  pushUndoSnapshot: () => void;
  clearUndoStack: () => void;
  removeCard: (cardId: string, animate: boolean, opts?: { skipAutoDraw?: boolean }) => void;
  removePendingDungeonCard: (cardId: string) => void;
  triggerClassDeckFlight: (cards: GameCardData[]) => void;
  triggerFateSwapFlight: (activeSlotIdx: number, oldCard: GameCardData, newCard: GameCardData) => void;
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
  const gs = useGameState(s => s);
  const setPersuadeAmuletBonus = useEngineSetter('persuadeAmuletBonus');
  const setPersuadeDiscount = useEngineSetter('persuadeDiscount');

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
    persuadeLevel,
    persuadeCostModifier,
    combatState,
    turnCount,
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

  const setGold = useEngineSetter('gold');
  const setActiveCards = useEngineSetter('activeCards');
  const setHandCards = useEngineSetter('handCards');
  const setDiscardedCards = useEngineSetter('discardedCards');
  const setPreviewCards = useEngineSetter('previewCards');
  const setRemainingDeck = useEngineSetter('remainingDeck');
  const setHeroMagicState = useEngineSetter('heroMagicState');
  const setHeroSkillBanner = useEngineSetter('heroSkillBanner');
  const setHeroSkillUsedThisWave = useEngineSetter('heroSkillUsedThisWave');
  const setExtraSkillsUsedThisWave = useEngineSetter('extraSkillsUsedThisWave');
  const setPendingHeroSkillAction = useEngineSetter('pendingHeroSkillAction');
  const setPendingHeroMagicAction = useEngineSetter('pendingHeroMagicAction');
  const setPendingMagicAction = useEngineSetter('pendingMagicAction');
  const setPermanentMagicRecycleBag = useEngineSetter('permanentMagicRecycleBag');
  const setPendingPotionAction = useEngineSetter('pendingPotionAction');
  const setPersuadeState = useEngineSetter('persuadeState');
  const setLastPersuadeTargetId = useEngineSetter('lastPersuadeTargetId');
  const setConsecutivePersuadeCount = useEngineSetter('consecutivePersuadeCount');
  const setSlotAttackBursts = useEngineSetter('slotAttackBursts');
  const setSlotTempAttack = useEngineSetter('slotTempAttack');
  const setNextAttackLifestealSlot = useEngineSetter('nextAttackLifestealSlot');
  const setBerserkerRageActive = useEngineSetter('berserkerRageActive');
  const setBerserkerSlotUsed = useEngineSetter('berserkerSlotUsed');
  const setFlashSlotUsed = useEngineSetter('flashSlotUsed');
  const setGambitExtraActive = useEngineSetter('gambitExtraActive');
  const setGambitSlotUsed = useEngineSetter('gambitSlotUsed');
  const setUnbreakableUntilWaterfall = useEngineSetter('unbreakableUntilWaterfall');
  const setStunCap = useEngineSetter('stunCap');
  const setSlotTempArmor = useEngineSetter('slotTempArmor');
  const setEquipmentSlotCapacity = useEngineSetter('equipmentSlotCapacity');
  const setUpgradeModalOpen = useEngineSetter('upgradeModalOpen');
  const setSwapUpgradeProgress = useEngineSetter('swapUpgradeProgress');
  const setAmuletSlots = useEngineSetter('amuletSlots');

  const updateSwapUpgradeCounter = useCallback((displayCount: number, threshold: number) => {
    setAmuletSlots(prev => prev.map(slot => {
      if (slot?.amuletEffect !== 'swap-upgrade') return slot;
      return { ...slot, _counterDisplay: `${displayCount}/${threshold}` };
    }));
  }, [setAmuletSlots]);

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
    setHeroSkillUsedThisWave(false);
    setExtraSkillsUsedThisWave([]);
    setPendingHeroSkillAction(null);
    setPendingHeroMagicAction(null);
    setHeroSkillBanner(null);
    setPendingMagicAction(null);
    setPendingPotionAction(null);
    depsRef.current.clearAllBackpackHandFallbacks();
    setHeroMagicState(prev => {
      const next = { ...prev };
      HERO_MAGIC_IDS.forEach(id => {
        const current = next[id];
        next[id] = current
          ? { ...current, usedThisWave: false }
          : {
              id,
              unlocked: false,
              gauge: 0,
              usedThisWave: false,
            };
      });
      return next;
    });
    setBerserkerRageActive(false);
    setBerserkerSlotUsed({});
    setFlashSlotUsed({});
    setGambitExtraActive(false);
    setGambitSlotUsed({});
    setUnbreakableUntilWaterfall({ equipmentSlot1: false, equipmentSlot2: false });
  }, [
    setBerserkerRageActive,
    setBerserkerSlotUsed,
    setFlashSlotUsed,
    setExtraSkillsUsedThisWave,
    setGambitExtraActive,
    setGambitSlotUsed,
    setHeroMagicState,
    setHeroSkillBanner,
    setHeroSkillUsedThisWave,
    setPendingHeroMagicAction,
    setPendingHeroSkillAction,
    setPendingMagicAction,
    setPendingPotionAction,
    setUnbreakableUntilWaterfall,
  ]);

  // ---------------------------------------------------------------------------
  // addHeroMagicGauge
  // ---------------------------------------------------------------------------

  const addHeroMagicGauge = useCallback(
    (id: HeroMagicId, amount: number) => {
      if (amount <= 0) {
        return;
      }
      const definition = getHeroMagicDefinition(id);
      depsRef.current.updateHeroMagicStateById(id, current => {
        if (!current.unlocked) {
          return current;
        }
        const nextGauge = Math.min(definition.gaugeMax, current.gauge + amount);
        if (nextGauge === current.gauge) {
          return current;
        }
        return { ...current, gauge: nextGauge };
      });
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // startHeroMagicActivation
  // ---------------------------------------------------------------------------

  const startHeroMagicActivation = useCallback(
    (id: HeroMagicId, origin: HeroMagicActivationOrigin) => {
      if (pendingHeroMagicAction) {
        setHeroSkillBanner('请先完成当前的英雄魔法动作。');
        return false;
      }

      const status = heroMagicState[id];
      if (!status || !status.unlocked) {
        setHeroSkillBanner('尚未掌握该英雄魔法。');
        return false;
      }

      if (origin === 'gauge') {
        const definition = getHeroMagicDefinition(id);
        if (status.gauge < definition.gaugeMax) {
          setHeroSkillBanner(
            `${definition.name} 仍在充能 (${status.gauge}/${definition.gaugeMax})。`,
          );
          return false;
        }
        if (status.usedThisWave) {
          setHeroSkillBanner(`${definition.name} 已在本波使用。`);
          return false;
        }
        if (pendingHeroSkillAction || pendingMagicAction || pendingPotionAction) {
          setHeroSkillBanner('请先完成当前的操作。');
          return false;
        }
      }

      const {
        applyBerserkerRageEffect,
        completeHeroMagicActivation,
        getEquipmentReserve,
        clearEquipmentSlotById,
        setEquipmentReserve,
        setEquipmentSlotById,
        disposeOwnedEquipmentCard,
        updateMonsterCard,
      } = depsRef.current;

      switch (id) {
        case 'holy-light':
          setPendingHeroMagicAction({
            id: 'holy-light',
            step: 'choice',
            origin,
            prompt: '选择圣光效果：回满血 或 净化一个怪物的怒气。',
          });
          setHeroSkillBanner('选择圣光效果：回满血 或 净化一个怪物的怒气。');
          return true;
        case 'berserker-rage':
          applyBerserkerRageEffect(origin);
          return true;
        case 'monster-doom': {
          const slotsToDestroy: { id: EquipmentSlotId; item: GameCardData }[] = [];
          for (const sid of ['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]) {
            const item = sid === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
            if (item) slotsToDestroy.push({ id: sid, item });
            const reserve = getEquipmentReserve(sid);
            reserve.forEach(r => slotsToDestroy.push({ id: sid, item: r }));
          }
          let destroyedCount = 0;
          const survivedSlots: Record<EquipmentSlotId, EquipmentItem | null> = {
            equipmentSlot1: null,
            equipmentSlot2: null,
          };
          const survivedReserves: Record<EquipmentSlotId, EquipmentItem[]> = {
            equipmentSlot1: [],
            equipmentSlot2: [],
          };
          slotsToDestroy.forEach(({ id: sid, item }) => {
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
              if (item.onDestroyEffect === 'graveyard-to-hand') {
                const graveyard = engine.getState().discardedCards;
                if (graveyard.length > 0) {
                  const idx = Math.floor(Math.random() * graveyard.length);
                  const picked = graveyard[idx];
                  setDiscardedCards(prev => prev.filter((_, i) => i !== idx));
                  setHandCards(prev => prev.some(e => e.id === picked.id) ? prev : [...prev, picked]);
                  addGameLog('equip', `${item.name} 遗言：从坟场获得了「${picked.name}」！`);
                } else {
                  addGameLog('equip', `${item.name} 遗言：坟场没有可用的牌。`);
                }
              } else {
                addGameLog('equip', `${item.name} 遗言：${item.onDestroyEffect}`);
              }
            }
            const isMonsterEquipMD = item.type === 'monster';
            const nativeReviveMD = isMonsterEquipMD && item.hasRevive && !item.reviveUsed;
            const equipReviveMD = item.hasEquipmentRevive && !item.equipmentReviveUsed;
            if (nativeReviveMD || equipReviveMD) {
              const revived = nativeReviveMD
                ? { ...item, durability: 1, reviveUsed: true }
                : { ...item, durability: 1, equipmentReviveUsed: true };
              const isMainSlot = (sid === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2)?.id === item.id;
              if (isMainSlot) {
                survivedSlots[sid] = revived as EquipmentItem;
              } else {
                survivedReserves[sid].push(revived as EquipmentItem);
              }
              addGameLog('equip', `${item.name} 复生！以 1 耐久复活！`);
            } else {
              disposeOwnedEquipmentCard(item, { isDestruction: true });
              destroyedCount++;
            }
          });
          for (const sid of ['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]) {
            if (survivedSlots[sid]) {
              setEquipmentSlotById(sid, survivedSlots[sid]);
            } else {
              clearEquipmentSlotById(sid);
            }
            setEquipmentReserve(sid, survivedReserves[sid]);
          }

          if (destroyedCount > 0) {
            const totalDebuff = destroyedCount * 2;
            const activeMonsters = flattenActiveRowSlots(activeCards).filter(c => c.type === 'monster');
            activeMonsters.forEach(m => {
              updateMonsterCard(m.id, prev => {
                const newAtk = Math.max(1, (prev.attack ?? prev.value) - totalDebuff);
                const newMaxHp = Math.max(1, (prev.maxHp ?? prev.hp ?? prev.value) - totalDebuff);
                const newHp = Math.min(prev.hp ?? prev.value, newMaxHp);
                return {
                  ...prev,
                  attack: newAtk,
                  value: newAtk,
                  maxHp: newMaxHp,
                  hp: newHp,
                };
              });
            });
            addGameLog('magic', `灭世裁决：摧毁 ${destroyedCount} 件装备，所有怪物 -${totalDebuff}攻/-${totalDebuff}血上限！`);
            setHeroSkillBanner(`灭世裁决！摧毁 ${destroyedCount} 件装备，怪物全体 -${totalDebuff}/-${totalDebuff}！`);
          } else {
            addGameLog('magic', '灭世裁决发动但没有装备可摧毁。');
            setHeroSkillBanner('灭世裁决：没有装备可摧毁。');
          }
          completeHeroMagicActivation('monster-doom', origin);
          return true;
        }
        case 'revive-blessing': {
          const equipSlots: EquipmentSlotId[] = [];
          if (equipmentSlot1) equipSlots.push('equipmentSlot1');
          if (equipmentSlot2) equipSlots.push('equipmentSlot2');
          if (equipSlots.length === 0) {
            setHeroSkillBanner('没有可赐福的装备。');
            return false;
          }
          const REVIVE_BLESSING_COST = 3;
          if (equipSlots.length === 1) {
            const sid = equipSlots[0];
            const item = sid === 'equipmentSlot1' ? equipmentSlot1! : equipmentSlot2!;
            depsRef.current.setHp(prev => Math.max(1, prev - REVIVE_BLESSING_COST));
            depsRef.current.setEquipmentSlotById(sid, { ...item, hasEquipmentRevive: true, equipmentReviveUsed: false } as any);
            addGameLog('magic', `复生祝福：失去 ${REVIVE_BLESSING_COST} 生命，${item.name} 获得复生能力`);
            setHeroSkillBanner(`${item.name} 获得了复生祝福！`);
            completeHeroMagicActivation('revive-blessing', origin);
            return true;
          }
          setPendingHeroMagicAction({
            id: 'revive-blessing',
            step: 'slot-select',
            origin,
            prompt: '选择一个装备赋予复生。',
          });
          setHeroSkillBanner('选择一个装备赋予复生。');
          return true;
        }
        default:
          return false;
      }
    },
    [
      heroMagicState,
      pendingHeroMagicAction,
      pendingHeroSkillAction,
      pendingMagicAction,
      pendingPotionAction,
      activeCards,
      equipmentSlot1,
      equipmentSlot2,
      setHeroSkillBanner,
      setPendingHeroMagicAction,
      addGameLog,
    ],
  );

  // ---------------------------------------------------------------------------
  // resolveHolyLightChoice
  // ---------------------------------------------------------------------------

  const resolveHolyLightChoice = useCallback(
    (choice: 'heal' | 'purge') => {
      if (!pendingHeroMagicAction || pendingHeroMagicAction.id !== 'holy-light') {
        return;
      }
      const origin = pendingHeroMagicAction.origin;

      if (choice === 'heal') {
        const healed = depsRef.current.healHero(maxHp);
        const banner = healed > 0 ? `圣光恢复了 ${healed} 点生命。` : '生命已满，圣光充能被清空。';
        addGameLog('magic', `圣光发动（回满生命）：${banner}`);
        setHeroSkillBanner(banner);
        setPendingHeroMagicAction(null);
        depsRef.current.completeHeroMagicActivation('holy-light', origin);
      } else {
        const monsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
        if (monsters.length === 0) {
          addGameLog('magic', '圣光净化失败：场上没有怪物。');
          setHeroSkillBanner('场上没有怪物可以净化。');
          setPendingHeroMagicAction(null);
          depsRef.current.completeHeroMagicActivation('holy-light', origin);
        } else if (monsters.length === 1) {
          depsRef.current.updateMonsterCard(monsters[0].id, current => ({
            ...current,
            fury: 0,
            hpLayers: 1,
            currentLayer: 1,
            hp: current.maxHp ?? current.hp ?? current.value ?? 0,
          }));
          addGameLog('magic', `圣光发动（净化怒气）：${monsters[0].name} 的怒气被净化！`);
          setHeroSkillBanner(`${monsters[0].name} 的怒气被圣光净化！`);
          setPendingHeroMagicAction(null);
          depsRef.current.completeHeroMagicActivation('holy-light', origin);
        } else {
          setPendingHeroMagicAction({
            id: 'holy-light',
            step: 'monster-select',
            origin,
            prompt: '选择一个怪物以净化其怒气。',
          });
          setHeroSkillBanner('选择一个怪物以净化其怒气。');
        }
      }
    },
    [
      activeCards,
      maxHp,
      pendingHeroMagicAction,
      setHeroSkillBanner,
      setPendingHeroMagicAction,
      addGameLog,
    ],
  );

  // ---------------------------------------------------------------------------
  // handleHolyLightMonsterCleanse
  // ---------------------------------------------------------------------------

  const handleHolyLightMonsterCleanse = useCallback(
    (monster: GameCardData) => {
      if (!pendingHeroMagicAction || pendingHeroMagicAction.id !== 'holy-light') {
        return false;
      }
      if (pendingHeroMagicAction.step !== 'monster-select') {
        return false;
      }
      if (monster.type !== 'monster') {
        setHeroSkillBanner('请选择一个怪物。');
        return false;
      }

      depsRef.current.updateMonsterCard(monster.id, current => ({
        ...current,
        fury: 0,
        hpLayers: 1,
        currentLayer: 1,
        hp: current.maxHp ?? current.hp ?? current.value ?? 0,
      }));
      addGameLog('magic', `圣光发动（净化怒气）：${monster.name} 的怒气被净化！`);
      setHeroSkillBanner(`${monster.name} 的怒气被圣光净化！`);
      setPendingHeroMagicAction(null);
      depsRef.current.completeHeroMagicActivation('holy-light', pendingHeroMagicAction.origin);
      return true;
    },
    [
      addGameLog,
      pendingHeroMagicAction,
      setHeroSkillBanner,
      setPendingHeroMagicAction,
    ],
  );

  // ---------------------------------------------------------------------------
  // cancelHeroSkillAction / cancelHeroMagicAction / cancelPotionAction
  // ---------------------------------------------------------------------------

  const cancelHeroSkillAction = useCallback(() => {
    setPendingHeroSkillAction(null);
    setHeroSkillBanner(null);
    depsRef.current.setHeroSkillArrow(null);
  }, [setPendingHeroSkillAction, setHeroSkillBanner]);

  const cancelHeroMagicAction = useCallback(() => {
    setPendingHeroMagicAction(null);
    setHeroSkillBanner(null);
  }, [setPendingHeroMagicAction, setHeroSkillBanner]);

  const cancelPotionAction = useCallback(() => {
    if (pendingPotionAction) {
      void depsRef.current.finalizePotionCard(pendingPotionAction.card, { banner: '取消使用药剂。' });
    }
    setPendingPotionAction(null);
    setHeroSkillBanner(null);
  }, [pendingPotionAction, setPendingPotionAction, setHeroSkillBanner]);

  // ---------------------------------------------------------------------------
  // markSkillUsed
  // ---------------------------------------------------------------------------

  const markSkillUsed = useCallback((skillId: HeroSkillId) => {
    if (skillId === selectedHeroSkill) {
      setHeroSkillUsedThisWave(true);
    } else {
      setExtraSkillsUsedThisWave(prev => prev.includes(skillId) ? prev : [...prev, skillId]);
    }
  }, [selectedHeroSkill, setHeroSkillUsedThisWave, setExtraSkillsUsedThisWave]);

  // ---------------------------------------------------------------------------
  // handleHeroSkillUse
  // ---------------------------------------------------------------------------

  const handleHeroSkillUse = useCallback(async (overrideSkillId?: HeroSkillId) => {
    depsRef.current.pushUndoSnapshot();
    const skillDef = overrideSkillId ? getHeroSkillById(overrideSkillId) : selectedHeroSkillDef;
    const isExtraSkill = !!overrideSkillId;
    if (!skillDef) {
      setHeroSkillBanner(null);
      return;
    }
    if (skillDef.type === 'passive') {
      setHeroSkillBanner('Passive skill is always active.');
      return;
    }
    if (isExtraSkill) {
      if (extraSkillsUsedThisWave.includes(overrideSkillId)) {
        setHeroSkillBanner('该技能本波已使用。');
        return;
      }
    } else if (heroSkillUsedThisWave) {
      setHeroSkillBanner('Hero skill already used this wave.');
      return;
    }
    if (pendingHeroSkillAction) {
      setHeroSkillBanner('Finish the current hero skill action first.');
      return;
    }
    if (depsRef.current.waterfallActive) {
      setHeroSkillBanner('Wait for the waterfall to finish before using the skill.');
      return;
    }

    const {
      applyDamage,
      beginCombat,
      dealDamageToMonster,
      drawFromBackpackToHand,
      drawClassCardsToBackpack,
      triggerClassDeckFlight,
      setEquipmentSlotBonus,
      setEquipmentSlotById,
      isMonsterEngaged,
      discardCardToGraveyard,
      requestCardAction,
      requestGraveyardSelection,
      getSpellDamage,
      clearUndoStack,
    } = depsRef.current;

    addGameLog('skill', `使用英雄技能：${skillDef.name}`);
    switch (skillDef.id) {
      case 'armor-pact': {
        const emptySlots: EquipmentSlotId[] = [];
        if (!equipmentSlot1) emptySlots.push('equipmentSlot1');
        if (!equipmentSlot2) emptySlots.push('equipmentSlot2');
        if (emptySlots.length === 0) {
          setHeroSkillBanner('需要至少一个空装备槽才能发动。');
          return;
        }
        if (emptySlots.length === 1) {
          const emptySlot = emptySlots[0];
          setEquipmentSlotBonus(emptySlot, 'shield', current => current + 1);
          const otherSlot: EquipmentSlotId = emptySlot === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
          const otherItem = otherSlot === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
          if (otherItem) {
            setEquipmentSlotById(emptySlot, otherItem);
            setEquipmentSlotById(otherSlot, null);
            addGameLog('skill', `虚位铸甲：「${otherItem.name}」移至强化槽位`);
          }
          markSkillUsed(skillDef.id);
          setHeroSkillBanner('装备槽永久护甲 +1。');
          break;
        }
        setPendingHeroSkillAction({ skillId: 'armor-pact', type: 'slot' });
        setHeroSkillBanner(skillDef.statusHint ?? '选择空槽以获得 +1 永久护甲。');
        break;
      }
      case 'durability-for-blood': {
        if (!equipmentSlot1 && !equipmentSlot2) {
          setHeroSkillBanner('Equip a weapon or shield before reinforcing.');
          return;
        }
        const repairableHeroSlots: { id: EquipmentSlotId; item: NonNullable<typeof equipmentSlot1> }[] = [];
        if (equipmentSlot1) {
          const maxD = equipmentSlot1.maxDurability ?? equipmentSlot1.durability ?? 0;
          const curD = equipmentSlot1.durability ?? maxD;
          if (maxD > 0 && curD < maxD) repairableHeroSlots.push({ id: 'equipmentSlot1', item: equipmentSlot1 });
        }
        if (equipmentSlot2) {
          const maxD = equipmentSlot2.maxDurability ?? equipmentSlot2.durability ?? 0;
          const curD = equipmentSlot2.durability ?? maxD;
          if (maxD > 0 && curD < maxD) repairableHeroSlots.push({ id: 'equipmentSlot2', item: equipmentSlot2 });
        }
        if (repairableHeroSlots.length === 0) {
          setHeroSkillBanner('No equipment needs repair.');
          return;
        }
        if (repairableHeroSlots.length === 1) {
          const slot = repairableHeroSlots[0];
          const maxDurability = slot.item.maxDurability ?? slot.item.durability ?? 0;
          const currentDurability = slot.item.durability ?? maxDurability;
          setEquipmentSlotById(slot.id, { ...slot.item, durability: Math.min(maxDurability, currentDurability + 1) });
          applyDamage(1, 'general', { selfInflicted: true });
          markSkillUsed(skillDef.id);
          setHeroSkillBanner('Durability increased by 1.');
          break;
        }
        setPendingHeroSkillAction({ skillId: 'durability-for-blood', type: 'slot' });
        setHeroSkillBanner(skillDef.statusHint ?? 'Select an equipped slot to repair.');
        break;
      }
      case 'blood-strike': {
        const monsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
        if (monsters.length === 0) {
          setHeroSkillBanner('No monsters available to strike.');
          return;
        }
        if (monsters.length === 1) {
          if (!isMonsterEngaged(monsters[0].id)) beginCombat(monsters[0], 'hero');
          applyDamage(2, 'general', { selfInflicted: true });
          const heroSkillDamage = getSpellDamage(3);
          dealDamageToMonster(monsters[0], heroSkillDamage, { pulses: 2, isSpellDamage: true });
          markSkillUsed(skillDef.id);
          setHeroSkillBanner(`Crimson Strike dealt ${heroSkillDamage} damage.`);
          break;
        }
        setPendingHeroSkillAction({ skillId: 'blood-strike', type: 'monster', baseDamage: 3 });
        setHeroSkillBanner(`Select a monster to deal ${getSpellDamage(3)} damage.`);
        break;
      }
      case 'gold-discovery': {
        const cost = 6;
        if (gold < cost) {
          setHeroSkillBanner(`金币不足！需要 ${cost} 金币（当前 ${gold}）。`);
          return;
        }
        if (classDeck.length === 0) {
          setHeroSkillBanner('专属牌堆已空，无法发动。');
          return;
        }
        setGold(prev => prev - cost);
        const drawn = drawClassCardsToBackpack(1, 'gold-discovery');
        if (drawn.length > 0) {
          triggerClassDeckFlight(drawn);
          markSkillUsed(skillDef.id);
          setHeroSkillBanner(`花费 ${cost} 金币，获得了「${drawn[0].name}」！`);
          addGameLog('skill', `黄金探秘：花费 ${cost} 金币，获得「${drawn[0].name}」`);
        } else {
          setGold(prev => prev + cost);
          setHeroSkillBanner('背包已满或专属牌不可用，金币已退回。');
        }
        break;
      }
      case 'graveyard-recall': {
        if (handCards.length < 2) {
          setHeroSkillBanner(`手牌不足！需要至少 2 张手牌（当前 ${handCards.length}）。`);
          return;
        }
        if (discardedCards.length === 0) {
          setHeroSkillBanner('坟场中没有可召回的卡牌。');
          return;
        }
        const discardSuccess = await requestCardAction('discard-recycle', 2, {
          title: '亡灵拾遗：弃置 2 张手牌',
          description: '选择 2 张手牌弃置，随后从坟场召回一张卡牌。',
          handOnly: true,
        });
        if (!discardSuccess) {
          setHeroSkillBanner('亡灵拾遗已取消。');
          return;
        }
        markSkillUsed(skillDef.id);
        const selected = await requestGraveyardSelection(3, { delivery: 'hand-first' });
        if (selected) {
          addGameLog('skill', `亡灵拾遗：从坟场召回「${selected.name}」`);
        } else {
          setHeroSkillBanner('放弃了坟场召回。');
        }
        break;
      }
      case 'blood-draw': {
        applyDamage(3, 'general', { selfInflicted: true });
        const drawnNames: string[] = [];
        for (let i = 0; i < 2; i++) {
          const drawn = drawFromBackpackToHand();
          if (drawn) drawnNames.push(drawn.name);
        }
        markSkillUsed(skillDef.id);
        if (drawnNames.length > 0) {
          setHeroSkillBanner(`失去 3 生命，抽到「${drawnNames.join('」「')}」！`);
          addGameLog('skill', `血契抽牌：失去 3 生命，抽到「${drawnNames.join('」「')}」`);
        } else {
          setHeroSkillBanner('失去 3 生命，但背包为空或手牌已满。');
          addGameLog('skill', '血契抽牌：失去 3 生命，未能抽牌');
        }
        break;
      }
      case 'discard-empower': {
        if (handCards.length === 0) {
          setHeroSkillBanner('需要至少 1 张手牌才能发动。');
          return;
        }
        if (!equipmentSlot1 && !equipmentSlot2) {
          setHeroSkillBanner('需要至少一个装备才能发动。');
          return;
        }
        const [discarded] = pickRandomHandCardsForDiscardPreferGraveyard(handCards, 1);
        discardCardToGraveyard(discarded, { owner: 'player' });
        setHandCards(prev => prev.filter(c => c.id !== discarded.id));
        addGameLog('skill', `噬血砺锋：弃置「${discarded.name}」`);
        const equippedSlots: EquipmentSlotId[] = [];
        if (equipmentSlot1) equippedSlots.push('equipmentSlot1');
        if (equipmentSlot2) equippedSlots.push('equipmentSlot2');
        if (equippedSlots.length === 1) {
          const slotId = equippedSlots[0];
          const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
          setSlotAttackBursts(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + 2 }));
          setNextAttackLifestealSlot(slotId);
          markSkillUsed(skillDef.id);
          setHeroSkillBanner(`${slotItem!.name} 的下次攻击 +2 伤害 且 吸血！`);
          addGameLog('skill', `噬血砺锋：${slotItem!.name} 下次攻击 +2 且吸血`);
          break;
        }
        setPendingHeroSkillAction({ skillId: 'discard-empower', type: 'slot' });
        setHeroSkillBanner(skillDef.statusHint ?? '选择一个装备：下次攻击 +2 伤害 且 吸血。');
        break;
      }
      case 'vanguard-swap': {
        let firstIdx = -1;
        let secondIdx = -1;
        for (let i = 0; i < activeCards.length; i++) {
          if (activeCards[i] != null) {
            if (firstIdx === -1) { firstIdx = i; }
            else if (secondIdx === -1) { secondIdx = i; break; }
          }
        }
        if (firstIdx === -1 || secondIdx === -1) {
          setHeroSkillBanner('先锋换阵无效（地城行卡牌不足 2 张）。');
          return;
        }
        const cardA = activeCards[firstIdx]!;
        const cardB = activeCards[secondIdx]!;
        setActiveCards(prev => {
          const next = [...prev] as ActiveRowSlots;
          const tmp = next[firstIdx];
          next[firstIdx] = next[secondIdx];
          next[secondIdx] = tmp;
          return next;
        });
        markSkillUsed(skillDef.id);
        setHeroSkillBanner(`${cardA.name} ↔ ${cardB.name} 位置互换！`);
        addGameLog('skill', `先锋换阵：${cardA.name} 与 ${cardB.name} 互换位置。`);
        break;
      }
      default:
        break;
    }
  }, [
    activeCards,
    addGameLog,
    classDeck,
    equipmentSlot1,
    equipmentSlot2,
    extraSkillsUsedThisWave,
    gold,
    heroSkillUsedThisWave,
    handCards,
    discardedCards,
    markSkillUsed,
    pendingHeroSkillAction,
    selectedHeroSkillDef,
    setActiveCards,
    setGold,
    setHandCards,
    setHeroSkillBanner,
    setNextAttackLifestealSlot,
    setPendingHeroSkillAction,
    setSlotAttackBursts,
  ]);

  // ---------------------------------------------------------------------------
  // handleHeroSkillSlotSelection
  // ---------------------------------------------------------------------------

  const handleHeroSkillSlotSelection = useCallback(
    (slotId: EquipmentSlotId) => {
      if (!pendingHeroSkillAction || pendingHeroSkillAction.type !== 'slot') {
        return;
      }

      if (pendingHeroSkillAction.skillId === 'armor-pact') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (slotItem) {
          setHeroSkillBanner('请选择一个空的装备槽。');
          return;
        }
        depsRef.current.setEquipmentSlotBonus(slotId, 'shield', current => current + 1);
        const otherSlot: EquipmentSlotId = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
        const otherItem = otherSlot === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (otherItem) {
          depsRef.current.setEquipmentSlotById(slotId, otherItem);
          depsRef.current.setEquipmentSlotById(otherSlot, null);
        }
        markSkillUsed(pendingHeroSkillAction.skillId);
        setPendingHeroSkillAction(null);
        setHeroSkillBanner('装备槽永久护甲 +1。');
        depsRef.current.setHeroSkillArrow(null);
        return;
      }

      if (pendingHeroSkillAction.skillId === 'durability-for-blood') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          setHeroSkillBanner('Equip an item in that slot first.');
          return;
        }
        const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
        const currentDurability = slotItem.durability ?? maxDurability;
        if (maxDurability === 0) {
          setHeroSkillBanner('This item cannot gain durability.');
          return;
        }
        if (currentDurability >= maxDurability) {
          setHeroSkillBanner('That item is already at full durability.');
          return;
        }

        const updatedItem = {
          ...slotItem,
          durability: Math.min(maxDurability, currentDurability + 1),
        };
        depsRef.current.setEquipmentSlotById(slotId, updatedItem);
        depsRef.current.applyDamage(1, 'general', { selfInflicted: true });
        markSkillUsed(pendingHeroSkillAction.skillId);
        setPendingHeroSkillAction(null);
        setHeroSkillBanner('Durability increased by 1.');
        depsRef.current.setHeroSkillArrow(null);
      }

      if (pendingHeroSkillAction.skillId === 'discard-empower') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          setHeroSkillBanner('请选择有装备的槽位。');
          return;
        }
        setSlotAttackBursts(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + 2 }));
        setNextAttackLifestealSlot(slotId);
        markSkillUsed(pendingHeroSkillAction.skillId);
        setPendingHeroSkillAction(null);
        setHeroSkillBanner(`${slotItem.name} 的下次攻击 +2 伤害 且 吸血！`);
        depsRef.current.setHeroSkillArrow(null);
        addGameLog('skill', `噬血砺锋：${slotItem.name} 下次攻击 +2 且吸血`);
      }
    },
    [
      addGameLog,
      equipmentSlot1,
      equipmentSlot2,
      markSkillUsed,
      pendingHeroSkillAction,
      setHeroSkillBanner,
      setNextAttackLifestealSlot,
      setPendingHeroSkillAction,
      setSlotAttackBursts,
    ],
  );

  const HONOR_SWEEP_HIT_STAGGER_MS = 100;

  const computeHonorSweepWaveDamage = useCallback(
    (slotId: EquipmentSlotId): number => {
      const st = engine.getState();
      const slotItem = slotId === 'equipmentSlot1' ? st.equipmentSlot1 : st.equipmentSlot2;
      if (!slotItem || (slotItem.type !== 'weapon' && slotItem.type !== 'monster')) return 0;
      const ae = depsRef.current.amuletEffects;
      const isMonsterEquip = slotItem.type === 'monster';
      const rawWeaponValue = isMonsterEquip ? (slotItem.attack ?? slotItem.value) : slotItem.value;
      const goblinGoldPowerActive =
        isMonsterEquip && Boolean((slotItem as GameCardData).eliteLowGoldPower && st.gold >= 30);
      const weaponValue = goblinGoldPowerActive ? rawWeaponValue * 2 : rawWeaponValue;
      const slotDamageBonus = depsRef.current.getEquipmentSlotBonus(slotId, 'damage');
      let slotTempAttackBonus = st.slotTempAttack[slotId] ?? 0;
      const suppressed = getEquipmentSlotsWithSuppressedTempAttack(
        st.activeCards,
        st.equipmentSlot1,
        st.equipmentSlot2,
      );
      if (suppressed.has(slotId)) slotTempAttackBonus = 0;
      const slotBerserkBonus = st.berserkTurnBuff[slotId] ?? 0;
      const attackBonus = depsRef.current.getAttackBonus();
      const base = Math.max(
        0,
        weaponValue +
          attackBonus +
          slotDamageBonus +
          slotBerserkBonus +
          slotTempAttackBonus,
      );
      return depsRef.current.getSpellDamage(base);
    },
    [engine],
  );

  const applyHonorSweepMagic = useCallback(
    (card: GameCardData, slotId: EquipmentSlotId) => {
      const { finalizeMagicCard, dealDamageToMonster, isMonsterEngaged, beginCombat, addGameLog } =
        depsRef.current;
      const st = engine.getState();
      const slotItem = slotId === 'equipmentSlot1' ? st.equipmentSlot1 : st.equipmentSlot2;
      if (!slotItem || (slotItem.type !== 'weapon' && slotItem.type !== 'monster')) {
        setHeroSkillBanner('请选择已装备的武器。');
        return;
      }
      const waveDamage = computeHonorSweepWaveDamage(slotId);
      const hitCount = 1 + ((card as KnightCardData).upgradeLevel ?? 0);
      const monsters = flattenActiveRowSlots(st.activeCards).filter(isDamageableTarget);
      if (monsters.length === 0) {
        finalizeMagicCard(card, { banner: '激活行没有怪物。' });
        return;
      }
      if (waveDamage <= 0) {
        finalizeMagicCard(card, { banner: '当前攻击力为 0，未造成伤害。' });
        return;
      }
      let hitIndex = 0;
      for (let wave = 0; wave < hitCount; wave += 1) {
        monsters.forEach(m => {
          if (!m) return;
          if (!isMonsterEngaged(m.id)) beginCombat(m, 'hero');
          dealDamageToMonster(m, waveDamage, {
            pulses: 2,
            animationDelay: hitIndex * HONOR_SWEEP_HIT_STAGGER_MS,
            isSpellDamage: true,
          });
          hitIndex += 1;
        });
      }
      setSlotTempAttack(prev => ({
        ...prev,
        [slotId]: (prev[slotId] ?? 0) - 5,
      }));
      addGameLog(
        'magic',
        `战血横扫：${slotItem.name} 对激活行造成 ${hitCount} 轮伤害（每段 ${waveDamage}），该栏临时攻击 -5。`,
      );
      finalizeMagicCard(card, {
        banner: `战血横扫：${hitCount} 轮、每段 ${waveDamage} 点伤害（${slotItem.name}，不耗耐久），该武器栏临时攻击 -5。`,
      });
    },
    [computeHonorSweepWaveDamage, engine, setHeroSkillBanner, setSlotTempAttack],
  );

  const applyWeaponSweepMagic = useCallback(
    (card: GameCardData, slotId: EquipmentSlotId) => {
      const { finalizeMagicCard, dealDamageToMonster, isMonsterEngaged, beginCombat, addGameLog } =
        depsRef.current;
      const st = engine.getState();
      const slotItem = slotId === 'equipmentSlot1' ? st.equipmentSlot1 : st.equipmentSlot2;
      if (!slotItem || (slotItem.type !== 'weapon' && slotItem.type !== 'monster')) {
        setHeroSkillBanner('请选择已装备的武器。');
        return;
      }
      const waveDamage = computeHonorSweepWaveDamage(slotId) + (card.amplifyBonus ?? 0);
      const monsters = flattenActiveRowSlots(st.activeCards).filter(isDamageableTarget);
      if (monsters.length === 0) {
        finalizeMagicCard(card, { banner: '激活行没有怪物。' });
        return;
      }
      if (waveDamage <= 0) {
        finalizeMagicCard(card, { banner: '当前攻击力为 0，未造成伤害。' });
        return;
      }
      let hitIndex = 0;
      monsters.forEach(m => {
        if (!m) return;
        if (!isMonsterEngaged(m.id)) beginCombat(m, 'hero');
        dealDamageToMonster(m, waveDamage, {
          pulses: 2,
          animationDelay: hitIndex * HONOR_SWEEP_HIT_STAGGER_MS,
          isSpellDamage: true,
        });
        hitIndex += 1;
      });
      setSlotTempAttack(prev => ({
        ...prev,
        [slotId]: (prev[slotId] ?? 0) - 3,
      }));
      addGameLog(
        'magic',
        `利刃风暴：${slotItem.name} 对激活行所有怪物造成 ${waveDamage} 点伤害，该栏临时攻击 -3。`,
      );
      finalizeMagicCard(card, {
        banner: `利刃风暴：${waveDamage} 点伤害（${slotItem.name}，不耗耐久），该武器栏临时攻击 -3。`,
      });
    },
    [computeHonorSweepWaveDamage, engine, setHeroSkillBanner, setSlotTempAttack],
  );

  // ---------------------------------------------------------------------------
  // handleMagicSlotSelection
  // ---------------------------------------------------------------------------

  const handleMagicSlotSelection = useCallback(
    async (slotId: EquipmentSlotId) => {
      if (!pendingMagicAction || pendingMagicAction.step !== 'slot-select') {
        return;
      }

      const {
        finalizeMagicCard,
        calculateSlotArmorValue,
        dealDamageToMonster,
        isMonsterEngaged,
        beginCombat,
        setEquipmentSlotById,
        getEquipmentSlots,
        getSpellDamage,
        ensureCardInHand,
        updateMonsterCard,
      } = depsRef.current;

      if (pendingMagicAction.effect === 'honor-sweep') {
        const card = pendingMagicAction.card;
        applyHonorSweepMagic(card, slotId);
        setPendingMagicAction(null);
        return;
      }

      if (pendingMagicAction.effect === 'weapon-sweep') {
        const card = pendingMagicAction.card;
        applyWeaponSweepMagic(card, slotId);
        setPendingMagicAction(null);
        return;
      }

      if (pendingMagicAction.effect === 'weapon-burst') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        const label = slotItem ? slotItem.name : (slotId === 'equipmentSlot1' ? '左装备栏' : '右装备栏');
        const burstBase = 2 + 2 * (pendingMagicAction.card.upgradeLevel ?? 0);
        const burstAmount = burstBase * (pendingMagicAction.echoMultiplier ?? 1);
        setSlotTempAttack(prev => ({
          ...prev,
          [slotId]: (prev[slotId] ?? 0) + burstAmount,
        }));
        if (depsRef.current.amuletEffects.hasPersuadeOnTempAttack) {
          const pBonus = depsRef.current.amuletEffects.persuadeOnTempAttackBonus || 5;
          const newBonus = engine.getState().persuadeAmuletBonus + pBonus;
          setPersuadeAmuletBonus(newBonus);
          depsRef.current.addGameLog('equip', `怀柔之印：下次劝降率 +${pBonus}%（累计 +${newBonus}%）`);
        }
        finalizeMagicCard(pendingMagicAction.card, {
          banner: `${label} 临时攻击力 +${burstAmount}。${(pendingMagicAction.echoMultiplier ?? 1) > 1 ? '（回响×2）' : ''}`,
        });
        return;
      }

      if (pendingMagicAction.effect === 'repair-one') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          setHeroSkillBanner('该槽位没有可修复的装备。');
          return;
        }
        const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
        const currentDurability = slotItem.durability ?? maxDurability;
        if (maxDurability === 0) {
          setHeroSkillBanner('这件装备无法修复。');
          return;
        }
        if (currentDurability >= maxDurability) {
          setHeroSkillBanner('该装备已经处于满耐久。');
          return;
        }
        const repairUpgLvl = pendingMagicAction.card.upgradeLevel ?? 0;
        const repairBaseAmounts = [1, 2, 2];
        const repairAmount = (repairBaseAmounts[repairUpgLvl] ?? 2) * (pendingMagicAction.echoMultiplier ?? 1);
        setEquipmentSlotById(slotId, {
          ...slotItem,
          durability: Math.min(maxDurability, currentDurability + repairAmount),
        });
        let drawMsg = '';
        if (repairUpgLvl >= 2) {
          const drawn = depsRef.current.drawFromBackpackToHand();
          drawMsg = drawn ? `，抽到「${drawn.name}」` : '';
        }
        const repairBanner =
          pendingMagicAction.card.magicEffect === 'honor-blood'
            ? `战血之印：${slotItem.name} 恢复 ${repairAmount} 点耐久。${(pendingMagicAction.echoMultiplier ?? 1) > 1 ? '（回响×2）' : ''}`
            : `${slotItem.name} 恢复了 ${repairAmount} 点耐久${drawMsg}。${(pendingMagicAction.echoMultiplier ?? 1) > 1 ? '（回响×2）' : ''}`;
        finalizeMagicCard(pendingMagicAction.card, { banner: repairBanner });
        return;
      }

      if (pendingMagicAction.effect === 'transform-repair') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          setHeroSkillBanner('该槽位没有装备。');
          return;
        }
        const maxDur = slotItem.maxDurability ?? slotItem.durability ?? 0;
        const curDur = slotItem.durability ?? maxDur;
        const echoMul = pendingMagicAction.echoMultiplier ?? 1;
        const repairAmt = 1 * echoMul;
        const triggerCount = (pendingMagicAction.card as any)._transformRepairTriggers ?? 0;
        const transformAtkBase = 3 + triggerCount;
        const parts: string[] = [];
        if (maxDur > 0 && curDur < maxDur) {
          setEquipmentSlotById(slotId, {
            ...slotItem,
            durability: Math.min(maxDur, curDur + repairAmt),
          });
          parts.push(`${slotItem.name} 耐久 +${repairAmt}`);
        } else {
          parts.push(`${slotItem.name} 已满耐久`);
        }
        let updatedCard = pendingMagicAction.card;
        if (pendingMagicAction.transformTriggered) {
          const tempAtkBonus = transformAtkBase * echoMul;
          setSlotTempAttack(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + tempAtkBonus }));
          parts.push(`转型：临时攻击 +${tempAtkBonus}`);
          if (depsRef.current.amuletEffects.hasPersuadeOnTempAttack) {
            const pBonus = depsRef.current.amuletEffects.persuadeOnTempAttackBonus || 5;
            setPersuadeAmuletBonus(prev => prev + pBonus);
          }
          const newTriggers = triggerCount + 1;
          const nextAtk = 3 + newTriggers;
          updatedCard = {
            ...pendingMagicAction.card,
            _transformRepairTriggers: newTriggers,
            transformBonus: `给该装备栏 +${nextAtk} 临时攻击（每次触发后数值 +1）`,
          } as GameCardData;
        }
        finalizeMagicCard(updatedCard, { banner: parts.join('。') + '。' });
        return;
      }

      if (pendingMagicAction.effect === 'armor-strike') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem || (slotItem.type !== 'shield' && slotItem.type !== 'monster')) {
          setHeroSkillBanner('请选择一面盾牌来转化护甲。');
          return;
        }
        const rawArmor = calculateSlotArmorValue(slotId);
        const armorPcts = [50, 100, 150];
        const armorPct = armorPcts[pendingMagicAction.card.upgradeLevel ?? 0] ?? 150;
        const scaledArmor = Math.floor(rawArmor * armorPct / 100);
        if (scaledArmor <= 0) {
          setHeroSkillBanner('该盾牌目前没有可用的护甲。');
          return;
        }
        const ampBonus = pendingMagicAction.card.amplifyBonus ?? 0;
        const monsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
        if (monsters.length === 1) {
          const totalDamage = getSpellDamage(scaledArmor + ampBonus);
          if (!isMonsterEngaged(monsters[0].id)) beginCombat(monsters[0], 'hero');
          dealDamageToMonster(monsters[0], totalDamage, { pulses: 2, isSpellDamage: true });
          finalizeMagicCard(pendingMagicAction.card, { banner: `御甲破击造成 ${totalDamage} 点伤害（护甲 ${armorPct}%）。` });
          return;
        }
        const totalDamage = getSpellDamage(scaledArmor + ampBonus);
        setPendingMagicAction({
          card: pendingMagicAction.card,
          effect: 'armor-strike',
          step: 'monster-select',
          slotId,
          pendingDamage: scaledArmor,
          prompt: `选择一个怪物，承受 ${totalDamage} 点护甲伤害。`,
        } as PendingMagicAction);
        setHeroSkillBanner('选择一个怪物承受你的护甲一击。');
        return;
      }

      if (pendingMagicAction.effect === 'armor-stun-convert') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem || (slotItem.type !== 'shield' && slotItem.type !== 'monster')) {
          setHeroSkillBanner('请选择一面护盾。');
          return;
        }
        const stunPerArmors = [1, 2];
        const stunPerArmor = stunPerArmors[pendingMagicAction.card.upgradeLevel ?? 0] ?? 2;
        const armorValue = calculateSlotArmorValue(slotId);
        const totalStun = armorValue * stunPerArmor;
        const stunGain = Math.min(totalStun, 100 - stunCap);
        if (stunGain > 0) {
          setStunCap(prev => Math.min(100, prev + totalStun));
        }
        addGameLog('magic', `护甲凝雷：护甲 ${armorValue} → 击晕上限 +${stunGain}%`);
        finalizeMagicCard(pendingMagicAction.card, { banner: `护甲 ${armorValue} 点 → 击晕上限 +${stunGain}%！` });
        return;
      }

      if (pendingMagicAction.effect === 'temp-attack-strike') {
        const tempAtk = gs.slotTempAttack[slotId] ?? 0;
        const totalDamage = getSpellDamage(tempAtk + (pendingMagicAction.card.amplifyBonus ?? 0));
        if (totalDamage <= 0) {
          finalizeMagicCard(pendingMagicAction.card, { banner: '该装备栏没有临时攻击，造成 0 点伤害。' });
          return;
        }
        const monsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
        if (monsters.length === 0) {
          finalizeMagicCard(pendingMagicAction.card, { banner: '当前没有可攻击的怪物。' });
          return;
        }
        const target = monsters[Math.floor(Math.random() * monsters.length)];
        if (!isMonsterEngaged(target.id)) beginCombat(target, 'hero');
        dealDamageToMonster(target, totalDamage, { pulses: 2, isSpellDamage: true });
        const isFlank = pendingMagicAction.isFlank ?? false;
        let stunText = '';
        if (isFlank && !target.isStunned) {
          const effectiveFlankStun = Math.min(40 + (depsRef.current.amuletEffects?.stunRateBoost ?? 0), stunCap);
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
              updateMonsterCard(target.id, m => ({ ...m, isStunned: true }));
              addGameLog('combat', `${target.name} 被侧击击晕了！`);
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
        addGameLog('magic', `锋刃侧击：对 ${target.name} 造成 ${totalDamage} 点伤害${isFlank ? '（侧击触发）' : ''}`);
        finalizeMagicCard(pendingMagicAction.card, { banner: `锋刃侧击对 ${target.name} 造成 ${totalDamage} 点伤害！${stunText}`, dealtDamage: true });
        return;
      }

      if (pendingMagicAction.effect === 'flank-fortify') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          setHeroSkillBanner('该装备栏为空。');
          return;
        }
        const useCount = (pendingMagicAction.card as any)._flankFortifyUses ?? 0;
        const armorBonus = 3 + useCount;
        setSlotTempArmor(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + armorBonus }));
        if (depsRef.current.amuletEffects.hasPersuadeOnTempAttack) {
          const pBonus = depsRef.current.amuletEffects.persuadeOnTempAttackBonus || 5;
          const newBonus = engine.getState().persuadeAmuletBonus + pBonus;
          setPersuadeAmuletBonus(newBonus);
          depsRef.current.addGameLog('equip', `怀柔之印：下次劝降率 +${pBonus}%（累计 +${newBonus}%）`);
        }
        const isFlank = pendingMagicAction.isFlank ?? false;
        let flankText = '';
        if (isFlank) {
          if (!slotItem.hasEquipmentRevive || slotItem.equipmentReviveUsed) {
            setEquipmentSlotById(slotId, { ...slotItem, hasEquipmentRevive: true, equipmentReviveUsed: false } as EquipmentItem);
            flankText = ` 侧击触发：${slotItem.name} 获得复生！`;
            addGameLog('magic', `固壁侧守（侧击）：${slotItem.name} 获得复生能力`);
          } else {
            flankText = ` 侧击触发：${slotItem.name} 已有复生，无额外效果。`;
          }
        }
        const newUses = useCount + 1;
        const nextArmor = 3 + newUses;
        const updatedCard = {
          ...pendingMagicAction.card,
          _flankFortifyUses: newUses,
          description: `永久：选择一个装备，+${nextArmor}（每次使用后数值 +1）临时护甲。侧击：赋予该装备复生。`,
          magicEffect: `+${nextArmor}(递增) 临时护甲，侧击赋予复生。`,
        } as GameCardData;
        addGameLog('magic', `固壁侧守：${slotItem.name} +${armorBonus} 临时护甲`);
        finalizeMagicCard(updatedCard, { banner: `${slotItem.name} +${armorBonus} 临时护甲。${flankText}` });
        return;
      }

      if (pendingMagicAction.effect === 'equalize-temp-attack-armor') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          setHeroSkillBanner('该装备栏为空。');
          return;
        }
        const echoMul = pendingMagicAction.echoMultiplier ?? 1;
        const atkBoost = 2 * echoMul;
        setSlotTempAttack(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + atkBoost }));
        addGameLog('magic', `时空镜像：${slotItem.name} 临时攻击 +${atkBoost}`);

        const tempAtk = (gs.slotTempAttack[slotId] ?? 0) + atkBoost;
        const tempArm = gs.slotTempArmor[slotId] ?? 0;
        if (tempAtk === tempArm) {
          finalizeMagicCard(pendingMagicAction.card, { banner: `${slotItem.name} 临时攻击 +${atkBoost}，攻防已相等（${tempAtk}）。` });
          return;
        }
        if (tempAtk > tempArm) {
          const delta = tempAtk - tempArm;
          setSlotTempArmor(prev => ({ ...prev, [slotId]: tempAtk }));
          if (depsRef.current.amuletEffects.hasPersuadeOnTempAttack) {
            const pBonus = depsRef.current.amuletEffects.persuadeOnTempAttackBonus || 5;
            const newBonus = engine.getState().persuadeAmuletBonus + pBonus;
            setPersuadeAmuletBonus(newBonus);
            depsRef.current.addGameLog('equip', `怀柔之印：下次劝降率 +${pBonus}%（累计 +${newBonus}%）`);
          }
          addGameLog('magic', `时空镜像：${slotItem.name} 临时护甲 +${delta}，临时攻击与临时护甲均为 ${tempAtk}`);
          finalizeMagicCard(pendingMagicAction.card, { banner: `${slotItem.name} 临时攻击 +${atkBoost}，临时护甲 +${delta}，攻防均为 ${tempAtk}。` });
        } else {
          const delta = tempArm - tempAtk;
          setSlotTempAttack(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + delta }));
          addGameLog('magic', `时空镜像：${slotItem.name} 临时攻击再 +${delta}，临时攻击与临时护甲均为 ${tempArm}`);
          finalizeMagicCard(pendingMagicAction.card, { banner: `${slotItem.name} 临时攻击 +${atkBoost + delta}，攻防均为 ${tempArm}。` });
        }
        return;
      }

      if (pendingMagicAction.effect === 'eternal-repair') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          setHeroSkillBanner('该装备栏为空。');
          return;
        }
        if (slotItem.type !== 'weapon' && slotItem.type !== 'monster') {
          setHeroSkillBanner('涌泉满手只能对武器或随从使用。');
          return;
        }
        setUnbreakableUntilWaterfall(prev => ({ ...prev, [slotId]: true }));
        addGameLog('magic', `${slotItem.name} 在下个瀑流前使用不消耗耐久。`);

        const echoRemaining = (pendingMagicAction.echoRemaining ?? 1) - 1;
        if (echoRemaining > 0) {
          const isWeaponSlot = (s: { id: string; item: GameCardData | null }) =>
            s.id !== slotId && s.item != null && (s.item.type === 'weapon' || s.item.type === 'monster');
          const otherWeaponSlots = getEquipmentSlots().filter(isWeaponSlot);
          if (otherWeaponSlots.length > 0) {
            const totalEcho = (pendingMagicAction.echoRemaining ?? 1);
            const echoLabel = `（回响：第 ${totalEcho - echoRemaining + 1}/${totalEcho} 次）`;
            setPendingMagicAction({
              card: pendingMagicAction.card,
              effect: 'eternal-repair',
              step: 'slot-select',
              prompt: `${slotItem.name} 已获得涌泉满手。继续选择下一把武器。${echoLabel}`,
              echoRemaining,
            } as PendingMagicAction);
            setHeroSkillBanner(`${slotItem.name} 已获得涌泉满手。继续选择下一把。${echoLabel}`);
            return;
          }
        }
        finalizeMagicCard(pendingMagicAction.card, {
          banner: `${slotItem.name} 获得涌泉满手。`,
        });
      }

      if (pendingMagicAction.effect === 'soul-swap') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem || (slotItem.type !== 'weapon' && slotItem.type !== 'shield')) {
          setHeroSkillBanner('请选择一件武器或盾牌。');
          return;
        }
        const durability = slotItem.durability ?? 0;
        if (durability <= 0) {
          setHeroSkillBanner('该装备耐久为零，无法交换。');
          return;
        }
        const swapMonsters = flattenActiveRowSlots(activeCards).filter(
          c => c.type === 'monster' && !c.bossPhase && !c.isFinalMonster,
        );
        if (swapMonsters.length === 0) {
          finalizeMagicCard(pendingMagicAction.card, { banner: '没有可选的非Boss怪物。' });
          return;
        }
        if (swapMonsters.length === 1) {
          const target = swapMonsters[0];
          const oldLayers = target.currentLayer ?? 1;
          const newMaxDur = Math.max(slotItem.maxDurability ?? durability, oldLayers);
          setEquipmentSlotById(slotId, { ...slotItem, durability: oldLayers, maxDurability: newMaxDur });
          updateMonsterCard(target.id, m => ({
            ...m,
            currentLayer: durability,
            hp: m.maxHp ?? m.hp ?? 0,
            fury: Math.max(m.fury ?? 0, durability),
            hpLayers: Math.max(m.hpLayers ?? 0, durability),
          }));
          finalizeMagicCard(pendingMagicAction.card, {
            banner: `等价交换：${slotItem.name} 耐久 ${durability}→${oldLayers}，${target.name} 血层 ${oldLayers}→${durability}。`,
          });
          return;
        }
        setPendingMagicAction({
          card: pendingMagicAction.card,
          effect: 'soul-swap',
          step: 'monster-select',
          slotId,
          slotDurability: durability,
          prompt: `选择一个非Boss怪物，与 ${slotItem.name}（耐久 ${durability}）互换血层。`,
        } as PendingMagicAction);
        setHeroSkillBanner(`等价交换：选择一个怪物与 ${slotItem.name}（耐久 ${durability}）互换血层。`);
        return;
      }

      if (pendingMagicAction.effect === 'repair-enrage-dice') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          setHeroSkillBanner('请选择一个有装备的栏位。');
          return;
        }
        const monsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
        if (monsters.length === 0) {
          finalizeMagicCard(pendingMagicAction.card, { banner: '没有可选的怪物。' });
          return;
        }
        if (monsters.length === 1) {
          void depsRef.current.resolveRepairEnrageDice(pendingMagicAction.card, slotId, monsters[0]);
          setPendingMagicAction(null);
          return;
        }
        setPendingMagicAction({
          card: pendingMagicAction.card,
          effect: 'repair-enrage-dice',
          step: 'monster-select',
          slotId,
          prompt: '选择一个怪物作为赌运目标。',
        } as PendingMagicAction);
        setHeroSkillBanner(`已选择 ${slotItem.name}，选择一个怪物作为赌运目标。`);
        return;
      }

      if (pendingMagicAction.effect === 'temp-armor') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        const label = slotItem ? slotItem.name : (slotId === 'equipmentSlot1' ? '左装备栏' : '右装备栏');
        const armorAmounts = [2, 3, 4];
        const armorAmt = armorAmounts[pendingMagicAction.card.upgradeLevel ?? 0] ?? 2;
        setSlotTempArmor(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + armorAmt }));
        if (depsRef.current.amuletEffects.hasPersuadeOnTempAttack) {
          const pBonus = depsRef.current.amuletEffects.persuadeOnTempAttackBonus || 5;
          const newBonus = engine.getState().persuadeAmuletBonus + pBonus;
          setPersuadeAmuletBonus(newBonus);
          depsRef.current.addGameLog('equip', `怀柔之印：下次劝降率 +${pBonus}%（累计 +${newBonus}%）`);
        }
        finalizeMagicCard(pendingMagicAction.card, { banner: `${label} 获得 +${armorAmt} 临时护甲。` });
        addGameLog('magic', `铸甲术：${label} +${armorAmt} 临时护甲`);
        return;
      }

      if (pendingMagicAction.effect === 'event-fortify') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          setHeroSkillBanner('该装备栏为空。');
          return;
        }
        const deck = remainingDeck;
        const peekCount = Math.min(3, deck.length);
        const peekedCards = deck.slice(0, peekCount);
        const eventCount = peekedCards.filter(c => c.type === 'event').length;

        const gains: { label: string; count: number }[] = [];
        if (eventCount > 0) {
          gains.push({ label: `${slotItem.name} 耐久上限 +1 并恢复 1 点耐久`, count: eventCount });
        }

        if (peekCount > 0) {
          depsRef.current.setDeckPeekState({
            mode: 'dungeon-insight',
            peekedCards,
            gains,
          });

          await new Promise<void>(resolve => {
            depsRef.current.deckJudgePeekCloseRef.current = () => resolve();
          });
        }

        if (eventCount > 0) {
          const oldMaxDur = slotItem.maxDurability ?? slotItem.durability ?? 0;
          const curDur = slotItem.durability ?? oldMaxDur;
          const newMaxDur = oldMaxDur + eventCount;
          const newDur = Math.min(newMaxDur, curDur + eventCount);
          setEquipmentSlotById(slotId, { ...slotItem, maxDurability: newMaxDur, durability: newDur });
          addGameLog('magic', `天机铸炼：翻看 ${peekCount} 张牌，${eventCount} 张事件 → ${slotItem.name} 耐久上限 +${eventCount}（${oldMaxDur}→${newMaxDur}），耐久恢复 ${newDur - curDur}（${curDur}→${newDur}）`);
        } else {
          addGameLog('magic', `天机铸炼：翻看 ${peekCount} 张牌，0 张事件 → 无增益`);
        }

        const banner = peekCount > 0
          ? `天机铸炼翻看 ${peekCount} 张牌：${eventCount} 张事件，${eventCount > 0 ? `${slotItem.name} 耐久上限 +${eventCount}，恢复 ${eventCount} 点耐久。` : '无增益。'}`
          : '天机铸炼：主牌堆已空，无效果。';
        finalizeMagicCard(pendingMagicAction.card, { banner });
        return;
      }

      if (pendingMagicAction.effect === 'grant-revive') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          setHeroSkillBanner('该装备栏为空。');
          return;
        }
        setEquipmentSlotById(slotId, { ...slotItem, hasEquipmentRevive: true, equipmentReviveUsed: false } as EquipmentItem);
        let drawMsg = '';
        if ((pendingMagicAction.card.upgradeLevel ?? 0) >= 1) {
          const drawn = drawFromBackpackToHand();
          drawMsg = drawn ? ` 抽到「${drawn.name}」。` : '';
        }
        finalizeMagicCard(pendingMagicAction.card, { banner: `${slotItem.name} 获得了不灭赐福！${drawMsg}` });
        addGameLog('magic', `不灭赐福：${slotItem.name} 获得复生能力${drawMsg}`);
        return;
      }

    },
    [
      activeCards,
      applyHonorSweepMagic,
      applyWeaponSweepMagic,
      equipmentSlot1,
      equipmentSlot2,
      pendingMagicAction,
      setHeroSkillBanner,
      setPendingMagicAction,
      setSlotAttackBursts,
      setSlotTempAttack,
      setSlotTempArmor,
      setUnbreakableUntilWaterfall,
      setStunCap,
      slotTempArmor,
      stunCap,
      addGameLog,
    ],
  );

  // ---------------------------------------------------------------------------
  // handlePotionChoiceSelection
  // ---------------------------------------------------------------------------

  const handlePotionChoiceSelection = useCallback(
    (value: string) => {
      if (!pendingPotionAction || pendingPotionAction.effect !== 'repair-choice') {
        return;
      }
      const card = pendingPotionAction.card;
      const allowedTypes: EquipmentRepairTarget[] = ['weapon', 'shield', 'monster'];

      const {
        finalizePotionCard,
        getEquipmentSlots,
        resolvePotionRepairForSlot,
        setEquipmentSlotById,
      } = depsRef.current;

      if (value === 'repair') {
        const equippedSlots = getEquipmentSlots().filter(slot => {
          const item = slot.item;
          return Boolean(item && item.type && allowedTypes.includes(item.type));
        });
        if (!equippedSlots.length) {
          void finalizePotionCard(card, { banner: '没有装备武器或护盾，修复无效。' });
          setPendingPotionAction(null);
          return;
        }
        const bannerParts: string[] = [];
        let anyRepaired = false;
        for (const slot of equippedSlots) {
          const slotItem = slot.item!;
          const maxDur = slotItem.maxDurability ?? slotItem.durability ?? 0;
          const curDur = slotItem.durability ?? maxDur;
          if (maxDur > 0 && curDur < maxDur) {
            const newDur = Math.min(maxDur, curDur + 2);
            setEquipmentSlotById(slot.id, { ...slotItem, durability: newDur });
            addGameLog('potion', `装备修复剂：${slotItem.name} 耐久 ${curDur} → ${newDur}`);
            bannerParts.push(`${slotItem.name} 耐久 +${newDur - curDur}`);
            anyRepaired = true;
          } else {
            bannerParts.push(`${slotItem.name} 已满耐久`);
          }
        }
        const banner = anyRepaired ? bannerParts.join('，') + '。' : '所有装备已满耐久，修复无效。';
        void finalizePotionCard(card, { banner });
        setPendingPotionAction(null);
      } else if (value === 'upgrade') {
        const equippedSlots = getEquipmentSlots().filter(slot => {
          const item = slot.item;
          return Boolean(item && item.type && allowedTypes.includes(item.type));
        });
        if (!equippedSlots.length) {
          void finalizePotionCard(card, { banner: '没有可升级的装备。' });
          setPendingPotionAction(null);
          return;
        }
        const bannerParts: string[] = [];
        for (const slot of equippedSlots) {
          const slotItem = slot.item!;
          const maxDur = slotItem.maxDurability ?? slotItem.durability ?? 0;
          setEquipmentSlotById(slot.id, { ...slotItem, maxDurability: maxDur + 1 });
          addGameLog('potion', `装备修复剂：${slotItem.name} 耐久上限 +1（${maxDur} → ${maxDur + 1}）`);
          bannerParts.push(`${slotItem.name} 上限 +1`);
        }
        void finalizePotionCard(card, { banner: bannerParts.join('，') + '。' });
        setPendingPotionAction(null);
      }
    },
    [addGameLog, pendingPotionAction, setHeroSkillBanner, setPendingPotionAction],
  );

  // ---------------------------------------------------------------------------
  // handlePotionSlotSelection
  // ---------------------------------------------------------------------------

  const handlePotionSlotSelection = useCallback(
    (slotId: EquipmentSlotId) => {
      if (!pendingPotionAction || pendingPotionAction.step !== 'slot-select') {
        return;
      }

      const {
        resolvePotionRepairForSlot,
        finalizePotionCard,
        setEquipmentSlotById,
        setEquipmentSlotBonus,
      } = depsRef.current;

      if (pendingPotionAction.effect === 'repair-equipment' || pendingPotionAction.effect === 'repair-choice-repair') {
        const succeeded = resolvePotionRepairForSlot(
          slotId,
          pendingPotionAction.card,
          pendingPotionAction.amount,
          pendingPotionAction.allowedTypes,
        );
        if (succeeded) {
          setPendingPotionAction(null);
        }
        return;
      }

      if (pendingPotionAction.effect === 'repair-choice-upgrade') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          setHeroSkillBanner('该槽位目前没有装备。');
          return;
        }
        if (!slotItem.type || !pendingPotionAction.allowedTypes.includes(slotItem.type)) {
          setHeroSkillBanner('请选择一件装备。');
          return;
        }
        const maxDur = slotItem.maxDurability ?? slotItem.durability ?? 0;
        setEquipmentSlotById(slotId, { ...slotItem, maxDurability: maxDur + 2 });
        addGameLog('potion', `${slotItem.name} 耐久上限 +2（${maxDur} → ${maxDur + 2}）`);
        void finalizePotionCard(pendingPotionAction.card, { banner: `${slotItem.name} 耐久上限 +2` });
        setPendingPotionAction(null);
        return;
      }

      if (pendingPotionAction.effect === 'perm-slot-damage+1' || pendingPotionAction.effect === 'perm-slot-damage+2') {
        const amount = pendingPotionAction.effect === 'perm-slot-damage+2' ? 2 : 1;
        setEquipmentSlotBonus(slotId, 'damage', cur => cur + amount);
        const label = slotId === 'equipmentSlot1' ? '左' : '右';
        addGameLog('potion', `锻造强化：${label}装备栏永久伤害 +${amount}`);
        void finalizePotionCard(pendingPotionAction.card, { banner: `${label}装备栏永久伤害 +${amount}！` });
        setPendingPotionAction(null);
        return;
      }

      if (pendingPotionAction.effect === 'perm-equipment-durability-max+1' || pendingPotionAction.effect === 'perm-equipment-durability-max+2') {
        const amount = pendingPotionAction.effect === 'perm-equipment-durability-max+2' ? 2 : 1;
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem || slotItem.durability == null) {
          setHeroSkillBanner('该装备栏没有可增加耐久的装备。');
          return;
        }
        const maxDur = slotItem.maxDurability ?? slotItem.durability ?? 0;
        setEquipmentSlotById(slotId, { ...slotItem, maxDurability: maxDur + amount });
        addGameLog('potion', `耐久补剂：${slotItem.name} 耐久上限 +${amount}（${maxDur} → ${maxDur + amount}）`);
        void finalizePotionCard(pendingPotionAction.card, { banner: `${slotItem.name} 耐久上限 +${amount}！` });
        setPendingPotionAction(null);
        return;
      }

      if (pendingPotionAction.effect === 'perm-stun-cap+10') {
        setStunCap(prev => Math.min(100, prev + 10));
        addGameLog('potion', '眩晕药剂：击晕上限 +10%');
        void finalizePotionCard(pendingPotionAction.card, { banner: '击晕上限 +10%！' });
        setPendingPotionAction(null);
        return;
      }

      if (pendingPotionAction.effect === 'perm-slot-capacity+1') {
        setEquipmentSlotCapacity(prev => ({ ...prev, [slotId]: (prev[slotId] ?? 1) + 1 }));
        const label = slotId === 'equipmentSlot1' ? '左' : '右';
        addGameLog('potion', `扩容药剂：${label}装备栏容量 +1`);
        void finalizePotionCard(pendingPotionAction.card, { banner: `${label}装备栏容量 +1！` });
        setPendingPotionAction(null);
        return;
      }

      if (pendingPotionAction.effect === 'grant-lastwords-slot-temp-buff') {
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          setHeroSkillBanner('该装备栏没有装备。');
          return;
        }
        setEquipmentSlotById(slotId, { ...slotItem, onDestroyEffect: 'slot-temp-buff-3-3' });
        addGameLog('potion', `遗赠淬炼药：${slotItem.name} 获得遗言：该装备栏 +3临时攻击 +3临时护甲！`);
        void finalizePotionCard(pendingPotionAction.card, { banner: `${slotItem.name} 获得遗言：该装备栏 +3临时攻击 +3临时护甲！` });
        setPendingPotionAction(null);
        return;
      }
    },
    [addGameLog, equipmentSlot1, equipmentSlot2, pendingPotionAction, setEquipmentSlotCapacity, setHeroSkillBanner, setStunCap, setPendingPotionAction],
  );

  // ---------------------------------------------------------------------------
  // handleHeroSkillMonsterSelection
  // ---------------------------------------------------------------------------

  const handleHeroSkillMonsterSelection = useCallback(
    async (monster: GameCardData) => {
      if (!pendingHeroSkillAction || pendingHeroSkillAction.type !== 'monster') {
        return;
      }
      if (pendingHeroSkillAction.skillId !== 'blood-strike') {
        return;
      }

      if (!depsRef.current.isMonsterEngaged(monster.id)) {
        depsRef.current.beginCombat(monster, 'hero');
      }

      depsRef.current.applyDamage(2, 'general', { selfInflicted: true });
      const heroSkillDamage = depsRef.current.getSpellDamage(pendingHeroSkillAction.baseDamage ?? 3);
      depsRef.current.dealDamageToMonster(monster, heroSkillDamage, { pulses: 2, isSpellDamage: true });

      markSkillUsed(pendingHeroSkillAction.skillId);
      setPendingHeroSkillAction(null);
      setHeroSkillBanner(`Crimson Strike dealt ${heroSkillDamage} damage.`);
      depsRef.current.setHeroSkillArrow(null);
    },
    [
      markSkillUsed,
      pendingHeroSkillAction,
      setHeroSkillBanner,
      setPendingHeroSkillAction,
    ],
  );

  // ---------------------------------------------------------------------------
  // handleMagicMonsterSelection
  // ---------------------------------------------------------------------------

  const handleMagicMonsterSelection = useCallback(
    async (monster: GameCardData) => {
      if (!pendingMagicAction || pendingMagicAction.step !== 'monster-select') {
        return;
      }

      const {
        finalizeMagicCard,
        getSpellDamage,
        isMonsterEngaged,
        beginCombat,
        dealDamageToMonster,
        healHero,
        addPermanentMagicToRecycleBag,
        removeCard,
        removePendingDungeonCard,
        setEquipmentSlotById,
        updateMonsterCard,
        chaosStrikeHasOverkill,
        drawCardsFromBackpack,
        requestDiceOutcome,
      } = depsRef.current;

      if (pendingMagicAction.effect === 'armor-strike') {
        const baseDamage = pendingMagicAction.pendingDamage;
        if (baseDamage <= 0 && (pendingMagicAction.card.amplifyBonus ?? 0) <= 0) {
          finalizeMagicCard(pendingMagicAction.card, { banner: '护甲一击没有造成伤害。' });
          return;
        }
        const totalDamage = getSpellDamage(baseDamage + (pendingMagicAction.card.amplifyBonus ?? 0));
        if (!isMonsterEngaged(monster.id)) {
          beginCombat(monster, 'hero');
        }
        dealDamageToMonster(monster, totalDamage, { pulses: 2, isSpellDamage: true });
        finalizeMagicCard(pendingMagicAction.card, {
          banner: `御甲破击造成 ${totalDamage} 点伤害。`,
        });
        return;
      }

      if (pendingMagicAction.effect === 'blood-reckoning') {
        const echo = pendingMagicAction.echoMultiplier ?? 1;
        const totalDamage = getSpellDamage(engine.getState().gold + (pendingMagicAction.card.amplifyBonus ?? 0)) * echo;
        if (!isMonsterEngaged(monster.id)) {
          beginCombat(monster, 'hero');
        }
        dealDamageToMonster(monster, totalDamage, { pulses: 2, isSpellDamage: true });
        const healed = healHero(totalDamage);
        const healText = healed > 0 ? `，恢复 ${healed} 点生命` : '';
        finalizeMagicCard(pendingMagicAction.card, {
          banner: `点金裁决造成 ${totalDamage} 点伤害${healText}！${echo > 1 ? '（回响×2）' : ''}`,
        });
        return;
      }

      if (pendingMagicAction.effect === 'bounty-spell-damage') {
        const echo = pendingMagicAction.echoMultiplier ?? 1;
        const baseDmg = 5 + (pendingMagicAction.card.amplifyBonus ?? 0);
        const totalDamage = getSpellDamage(baseDmg) * echo;
        if (!isMonsterEngaged(monster.id)) {
          beginCombat(monster, 'hero');
        }
        dealDamageToMonster(monster, totalDamage, { pulses: 2, isSpellDamage: true });
        setGold(prev => prev + totalDamage);
        addGameLog('magic', `赏金裁决：对 ${monster.name} 造成 ${totalDamage} 点法术伤害，获得 ${totalDamage} 金币`);
        finalizeMagicCard(pendingMagicAction.card, {
          banner: `赏金裁决：${totalDamage} 点伤害 → ${totalDamage} 金币！${echo > 1 ? '（回响×2）' : ''}`,
          dealtDamage: true,
        });
        return;
      }

      if (pendingMagicAction.effect === 'missing-hp-smite') {
        const smitePcts = [50, 100, 150];
        const smitePct = smitePcts[pendingMagicAction.card.upgradeLevel ?? 0] ?? 150;
        const missingHp = Math.max(0, maxHp - hp);
        const scaledDmg = Math.floor(missingHp * smitePct / 100);
        const totalDamage = getSpellDamage(scaledDmg + (pendingMagicAction.card.amplifyBonus ?? 0));
        if (totalDamage <= 0) {
          finalizeMagicCard(pendingMagicAction.card, { banner: '你处于满血状态，没有造成伤害。' });
          return;
        }
        if (!isMonsterEngaged(monster.id)) {
          beginCombat(monster, 'hero');
        }
        dealDamageToMonster(monster, totalDamage, { pulses: 2, isSpellDamage: true });
        finalizeMagicCard(pendingMagicAction.card, {
          banner: `残血裁决释放 ${totalDamage} 点伤害（${smitePct}%）。`,
        });
        return;
      }

      if (pendingMagicAction.effect === 'blood-sacrifice-strike') {
        const hpToLose = pendingMagicAction.hpLost;
        const totalDamage = pendingMagicAction.pendingDamage;
        depsRef.current.applyDamage(hpToLose, 'general', { selfInflicted: true });
        if (!isMonsterEngaged(monster.id)) {
          beginCombat(monster, 'hero');
        }
        dealDamageToMonster(monster, totalDamage, { pulses: 2, isSpellDamage: true });
        finalizeMagicCard(pendingMagicAction.card, {
          banner: `血祭裁决：献祭 ${hpToLose} 点生命，对 ${monster.name} 造成 ${totalDamage} 点伤害！`,
          dealtDamage: true,
        });
        return;
      }

      if (pendingMagicAction.effect === 'scaling-damage') {
        const strikeBase = pendingMagicAction.pendingDamage ?? 1;
        const echo = pendingMagicAction.echoMultiplier ?? 1;
        const totalDamage = getSpellDamage(strikeBase) * echo;
        if (!isMonsterEngaged(monster.id)) {
          beginCombat(monster, 'hero');
        }
        dealDamageToMonster(monster, totalDamage, { pulses: 2, isSpellDamage: true });
        const updatedCard = pendingMagicAction.card;
        addPermanentMagicToRecycleBag(updatedCard);
        removePendingDungeonCard(updatedCard.id);
        removeCard(updatedCard.id, false);
        setPendingMagicAction(null);
        const nextBase = updatedCard.scalingDamage ?? strikeBase + 1;
        addGameLog(
          'magic',
          `${updatedCard.name}：对 ${monster.name} 造成 ${totalDamage} 点（下一击叠刺 ${nextBase}）`,
        );
        setHeroSkillBanner(`${updatedCard.name} 下一击叠刺 ${nextBase}`);
        return;
      }

      if (pendingMagicAction.effect === 'arcane-storm') {
        const stormBase = pendingMagicAction.pendingDamage ?? 1;
        const echo = pendingMagicAction.echoMultiplier ?? 1;
        const totalDamage = getSpellDamage(stormBase) * echo;
        if (!isMonsterEngaged(monster.id)) {
          beginCombat(monster, 'hero');
        }
        dealDamageToMonster(monster, totalDamage, { pulses: 2, isSpellDamage: true });
        finalizeMagicCard(pendingMagicAction.card, {
          banner: `奥术风暴：对 ${monster.name} 造成 ${totalDamage} 点伤害。${echo > 1 ? '（回响×' + echo + '）' : ''}`,
        });
        return;
      }

      if (pendingMagicAction.effect === 'chaos-strike') {
        if (!isMonsterEngaged(monster.id)) {
          beginCombat(monster, 'hero');
        }
        const chaosDamage = getSpellDamage(3 + (pendingMagicAction.card.amplifyBonus ?? 0));
        const overkill = chaosStrikeHasOverkill(monster, chaosDamage);
        dealDamageToMonster(monster, chaosDamage, { isSpellDamage: true });
        let chaosBanner: string;
        if (overkill) {
          const drawn = drawCardsFromBackpack(2, { ignoreLimit: true });
          chaosBanner = `混沌冲击对 ${monster.name} 造成 ${chaosDamage} 伤害，超杀！抽 ${drawn} 张牌。`;
        } else {
          chaosBanner = `混沌冲击对 ${monster.name} 造成 ${chaosDamage} 点伤害。`;
        }
        addGameLog('magic', chaosBanner);

        const echoRemaining = (pendingMagicAction.echoRemaining ?? 1) - 1;
        if (echoRemaining > 0) {
          const remainingMonsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
          if (remainingMonsters.length > 0) {
            const totalEcho = (pendingMagicAction.echoRemaining ?? 1);
            const echoLabel = `（回响：第 ${totalEcho - echoRemaining + 1}/${totalEcho} 次）`;
            setPendingMagicAction({
              card: pendingMagicAction.card,
              effect: 'chaos-strike',
              step: 'monster-select',
              prompt: `${chaosBanner} 继续选择目标。${echoLabel}`,
              data: {},
              echoRemaining,
            } as PendingMagicAction);
            setHeroSkillBanner(`${chaosBanner} 继续选择目标。${echoLabel}`);
            return;
          }
        }
        finalizeMagicCard(pendingMagicAction.card, { banner: chaosBanner });
        return;
      }

      if (pendingMagicAction.effect === 'overkill-upgrade') {
        if (!isMonsterEngaged(monster.id)) {
          beginCombat(monster, 'hero');
        }
        const okDamage = getSpellDamage(3 + (pendingMagicAction.card.amplifyBonus ?? 0));
        const overkill = chaosStrikeHasOverkill(monster, okDamage);
        dealDamageToMonster(monster, okDamage, { isSpellDamage: true });
        let okBanner: string;
        if (overkill) {
          setUpgradeModalOpen(true);
          okBanner = `淬炼冲击对 ${monster.name} 造成 ${okDamage} 伤害，超杀！选择一张牌升级。`;
        } else {
          okBanner = `淬炼冲击对 ${monster.name} 造成 ${okDamage} 点伤害。`;
        }
        addGameLog('magic', okBanner);

        const echoRemaining = (pendingMagicAction.echoRemaining ?? 1) - 1;
        if (echoRemaining > 0) {
          const remainingMonsters = flattenActiveRowSlots(activeCards).filter(isDamageableTarget);
          if (remainingMonsters.length > 0) {
            const totalEcho = (pendingMagicAction.echoRemaining ?? 1);
            const echoLabel = `（回响：第 ${totalEcho - echoRemaining + 1}/${totalEcho} 次）`;
            setPendingMagicAction({
              card: pendingMagicAction.card,
              effect: 'overkill-upgrade',
              step: 'monster-select',
              prompt: `${okBanner} 继续选择目标。${echoLabel}`,
              data: {},
              echoRemaining,
            } as PendingMagicAction);
            setHeroSkillBanner(`${okBanner} 继续选择目标。${echoLabel}`);
            return;
          }
        }
        finalizeMagicCard(pendingMagicAction.card, { banner: okBanner });
        return;
      }

      if (pendingMagicAction.effect === 'soul-swap') {
        if (monster.bossPhase || monster.isFinalMonster) {
          setHeroSkillBanner('不能对Boss使用等价交换。');
          return;
        }
        const slotId = pendingMagicAction.slotId;
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (!slotItem) {
          finalizeMagicCard(pendingMagicAction.card, { banner: '装备已不存在，等价交换取消。' });
          return;
        }
        const oldDurability = slotItem.durability ?? 0;
        const oldMonsterLayers = monster.currentLayer ?? 1;
        const newMaxDur = Math.max(slotItem.maxDurability ?? oldDurability, oldMonsterLayers);
        setEquipmentSlotById(slotId, { ...slotItem, durability: oldMonsterLayers, maxDurability: newMaxDur });
        updateMonsterCard(monster.id, m => ({
          ...m,
          currentLayer: oldDurability,
          hp: m.maxHp ?? m.hp ?? 0,
          fury: Math.max(m.fury ?? 0, oldDurability),
          hpLayers: Math.max(m.hpLayers ?? 0, oldDurability),
        }));
        finalizeMagicCard(pendingMagicAction.card, {
          banner: `等价交换：${slotItem.name} 耐久 ${oldDurability}→${oldMonsterLayers}，${monster.name} 血层 ${oldMonsterLayers}→${oldDurability}。`,
        });
        return;
      }

      if (pendingMagicAction.effect === 'missile-bolt') {
        const totalDmg = getSpellDamage(2 + (pendingMagicAction.card.amplifyBonus ?? 0));
        if (!isMonsterEngaged(monster.id)) beginCombat(monster, 'hero');
        dealDamageToMonster(monster, totalDmg, { pulses: 2, isSpellDamage: true });
        addGameLog('magic', `魔弹：对 ${monster.name} 造成 ${totalDmg} 点法术伤害`);
        finalizeMagicCard(pendingMagicAction.card, { banner: `魔弹：对 ${monster.name} 造成 ${totalDmg} 点伤害！` });
        return;
      }

      if (pendingMagicAction.effect === 'stun-strike') {
        const echo = pendingMagicAction.echoMultiplier ?? 1;
        const baseDmgPerHit = pendingMagicAction.data?.baseDmgPerHit ?? 1;
        const stunPct = Math.min(pendingMagicAction.data?.stunPct ?? 10, stunCap);
        const hits = pendingMagicAction.data?.hits ?? 2;
        const hitDmg = getSpellDamage(baseDmgPerHit) * echo;
        const totalDmg = hitDmg * hits;
        if (!isMonsterEngaged(monster.id)) beginCombat(monster, 'hero');
        dealDamageToMonster(monster, totalDmg, { pulses: 2, isSpellDamage: true });
        let stunText = '';
        let stunned = monster.isStunned;
        const threshold = Math.round((stunPct / 100) * 20);
        if (threshold > 0) {
          for (let hit = 1; hit <= hits; hit++) {
            if (stunned) break;
            const stunResult = await requestDiceOutcome({
              title: monster.name,
              subtitle: `雷震击晕判定 第${hit}击（${stunPct}%）`,
              entries: [
                { id: 'stun', range: [1, threshold] as [number, number], label: '击晕成功！', effect: 'none' },
                { id: 'miss', range: [threshold + 1, 20] as [number, number], label: '未击晕', effect: 'none' },
              ],
            });
            if (stunResult?.id === 'stun') {
              updateMonsterCard(monster.id, m => ({ ...m, isStunned: true }));
              stunned = true;
              stunText = ` 第${hit}击击晕成功！`;
              addGameLog('combat', `${monster.name} 被雷震击晕了！`);

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
                  setHandCards(prev => [...prev, ...pickedCards]);
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
          }
          if (!stunned) {
            stunText = ' 未能击晕。';
          }
        }
        addGameLog('magic', `雷震击：对 ${monster.name} 造成 ${hitDmg}×${hits} 点法术伤害`);
        finalizeMagicCard(pendingMagicAction.card, { banner: `雷震击：对 ${monster.name} 造成 ${hitDmg}×${hits} 点伤害！${stunText}` });
        return;
      }

      if (pendingMagicAction.effect === 'fate-sight') {
        const card = pendingMagicAction.card;
        const baseDamages = [3, 4];
        const peekCounts = [3, 4];
        const baseDmg = baseDamages[card.upgradeLevel ?? 0] ?? 3;
        const peekCount = peekCounts[card.upgradeLevel ?? 0] ?? 3;
        depsRef.current.resolveFateSight(card, monster, baseDmg, peekCount);
        setPendingMagicAction(null);
        return;
      }

      if (pendingMagicAction.effect === 'stat-swap') {
        const isFlank = pendingMagicAction.isFlank ?? false;
        depsRef.current.resolveStatSwap(pendingMagicAction.card, monster, isFlank);
        setPendingMagicAction(null);
        return;
      }

      if (pendingMagicAction.effect === 'repair-enrage-dice') {
        const slotId = pendingMagicAction.slotId;
        void depsRef.current.resolveRepairEnrageDice(pendingMagicAction.card, slotId, monster);
        setPendingMagicAction(null);
        return;
      }

    },
    [
      activeCards,
      addGameLog,
      equipmentSlot1,
      equipmentSlot2,
      hp,
      maxHp,
      pendingMagicAction,
      setHeroSkillBanner,
      setPendingMagicAction,
    ],
  );

  // ---------------------------------------------------------------------------
  // handleDungeonCardSelection
  // ---------------------------------------------------------------------------

  const handleDungeonCardSelection = useCallback(
    (card: GameCardData) => {
      if (!pendingMagicAction || pendingMagicAction.step !== 'dungeon-select') {
        return;
      }

      const { finalizeMagicCard, removeCard, echoRemainingRef, echoTotalRef } = depsRef.current;

      if (pendingMagicAction.effect === 'dungeon-preview-swap') {
        const activeSlotIdx = activeCards.findIndex(c => c?.id === card.id);
        if (activeSlotIdx === -1) {
          setHeroSkillBanner('请选择地城行中的卡牌。');
          return;
        }
        const previewCard = previewCards[activeSlotIdx];
        if (!previewCard) {
          finalizeMagicCard(pendingMagicAction.card, { banner: '正上方预览行没有卡牌，无法互换。' });
          return;
        }
        setActiveCards(prev => {
          const next = [...prev] as ActiveRowSlots;
          next[activeSlotIdx] = previewCard;
          return next;
        });
        setPreviewCards(prev => {
          const next = [...prev] as ActiveRowSlots;
          next[activeSlotIdx] = card;
          return next;
        });
        let drawMsg = '';
        if ((pendingMagicAction.card.upgradeLevel ?? 0) >= 2) {
          const drawn = drawFromBackpackToHand();
          drawMsg = drawn ? ` 抽到「${drawn.name}」。` : '';
        }
        addGameLog('magic', `维度扭曲：${card.name} ↔ ${previewCard.name} 互换行位置${drawMsg}`);
        let swapUpgradeTrigger = false;
        if (depsRef.current.amuletEffects.hasSwapUpgrade) {
          const prog = engine.getState().swapUpgradeProgress + 1;
          if (prog >= 3) {
            setSwapUpgradeProgress(0);
            updateSwapUpgradeCounter(0, 3);
            swapUpgradeTrigger = true;
          } else {
            setSwapUpgradeProgress(prog);
            updateSwapUpgradeCounter(prog, 3);
            addGameLog('amulet', `流转之符：交换位置（${prog}/3）`);
          }
        }
        finalizeMagicCard(pendingMagicAction.card, { banner: `${card.name} ↔ ${previewCard.name} 行位置互换！${drawMsg}` });
        if (swapUpgradeTrigger) {
          setUpgradeModalOpen(true);
          addGameLog('amulet', '流转之符：交换 3 次位置，选择一张牌升级！');
          setHeroSkillBanner('流转之符：选择一张牌进行升级。');
        }
        return;
      }

      if (pendingMagicAction.effect === 'fate-swap') {
        const activeSlotIdx = activeCards.findIndex(c => c?.id === card.id);
        if (activeSlotIdx === -1) {
          setHeroSkillBanner('请选择地城行中的卡牌。');
          return;
        }
        const depth = pendingMagicAction.deckDepth;
        const deckLen = remainingDeck.length;
        if (deckLen === 0) {
          finalizeMagicCard(pendingMagicAction.card, { banner: '牌堆已空，无法交换。' });
          return;
        }
        const maxIdx = Math.min(depth, deckLen);
        const swapIdx = Math.floor(Math.random() * maxIdx);
        const deckCard = remainingDeck[swapIdx];
        const ragedDeckCard = applyMonsterRage(deckCard, turnCount);
        depsRef.current.triggerFateSwapFlight(activeSlotIdx, card, ragedDeckCard);
        setRemainingDeck(prev => {
          const next = [...prev];
          next[swapIdx] = sanitizeCardMetadata(card);
          return next;
        });

        let persuadeMsg = '';
        if (ragedDeckCard.type === 'monster') {
          const isElite = Boolean(ragedDeckCard.monsterSpecial || ragedDeckCard.bossPhase);
          const boost = isElite ? 15 : 30;
          ragedDeckCard._persuadeBoost = ((ragedDeckCard as any)._persuadeBoost ?? 0) + boost;
          persuadeMsg = ` ${ragedDeckCard.name} 劝降概率 +${boost}%${isElite ? '（精英）' : ''}`;
        }

        setActiveCards(prev => {
          const next = [...prev] as ActiveRowSlots;
          next[activeSlotIdx] = ragedDeckCard;
          return next;
        });
        addGameLog('magic', `${pendingMagicAction.card.name}：${card.name} 与牌堆第 ${swapIdx + 1} 张 ${deckCard.name} 交换${persuadeMsg}`);
        let swapUpgradeTrigger2 = false;
        if (depsRef.current.amuletEffects.hasSwapUpgrade) {
          const prog = engine.getState().swapUpgradeProgress + 1;
          if (prog >= 3) {
            setSwapUpgradeProgress(0);
            updateSwapUpgradeCounter(0, 3);
            swapUpgradeTrigger2 = true;
          } else {
            setSwapUpgradeProgress(prog);
            updateSwapUpgradeCounter(prog, 3);
            addGameLog('amulet', `流转之符：交换位置（${prog}/3）`);
          }
        }
        finalizeMagicCard(pendingMagicAction.card, {
          banner: `${card.name} ↔ ${deckCard.name}（牌堆第 ${swapIdx + 1} 张）交换！${persuadeMsg}`,
        });
        if (swapUpgradeTrigger2) {
          setUpgradeModalOpen(true);
          addGameLog('amulet', '流转之符：交换 3 次位置，选择一张牌升级！');
          setHeroSkillBanner('流转之符：选择一张牌进行升级。');
        }
        return;
      }

      if (pendingMagicAction.effect === 'dungeon-swap-select') {
        const selIdx = activeCards.findIndex(c => c?.id === card.id);
        if (selIdx === -1) {
          setHeroSkillBanner('请选择地城行中的卡牌。');
          return;
        }
        const swapLeftIdx = pendingMagicAction.leftIdx;
        if (selIdx === swapLeftIdx) {
          setHeroSkillBanner('不能选择最左边的卡牌自身。');
          return;
        }
        const leftC = activeCards[swapLeftIdx]!;
        setActiveCards(prev => {
          const next = [...prev] as ActiveRowSlots;
          const tmp = next[swapLeftIdx];
          next[swapLeftIdx] = next[selIdx];
          next[selIdx] = tmp;
          return next;
        });
        addGameLog('magic', `乾坤挪移：${card.name} 与 ${leftC.name} 互换位置。`);
        let swapUpgradeTrigger3 = false;
        if (depsRef.current.amuletEffects.hasSwapUpgrade) {
          const prog = engine.getState().swapUpgradeProgress + 1;
          if (prog >= 3) {
            setSwapUpgradeProgress(0);
            updateSwapUpgradeCounter(0, 3);
            swapUpgradeTrigger3 = true;
          } else {
            setSwapUpgradeProgress(prog);
            updateSwapUpgradeCounter(prog, 3);
            addGameLog('amulet', `流转之符：交换位置（${prog}/3）`);
          }
        }
        finalizeMagicCard(pendingMagicAction.card, { banner: `${card.name} ↔ ${leftC.name} 位置互换！` });
        if (swapUpgradeTrigger3) {
          setUpgradeModalOpen(true);
          addGameLog('amulet', '流转之符：交换 3 次位置，选择一张牌升级！');
          setHeroSkillBanner('流转之符：选择一张牌进行升级。');
        }
        return;
      }

      if (
        pendingMagicAction.effect !== 'return-dungeon-bottom' &&
        pendingMagicAction.effect !== 'shuffle-dungeon'
      ) {
        return;
      }
      if (echoRemainingRef.current <= 0) {
        return;
      }
      const isActiveCard = activeCards.some(activeCard => activeCard?.id === card.id);
      if (!isActiveCard) {
        setHeroSkillBanner('请选择当前地城中的卡牌。');
        return;
      }

      removeCard(card.id, false);
      const sanitizedCard = sanitizeCardMetadata(card);
      setRemainingDeck(prev => [...prev, sanitizedCard]);
      addGameLog('magic', `${card.name} 已置于牌堆底。`);

      let swapUpgradeTrigger4 = false;
      if (depsRef.current.amuletEffects.hasSwapUpgrade) {
        const prog = engine.getState().swapUpgradeProgress + 1;
        if (prog >= 3) {
          setSwapUpgradeProgress(0);
          updateSwapUpgradeCounter(0, 3);
          swapUpgradeTrigger4 = true;
        } else {
          setSwapUpgradeProgress(prog);
          updateSwapUpgradeCounter(prog, 3);
          addGameLog('amulet', `流转之符：交换位置（${prog}/3）`);
        }
      }

      echoRemainingRef.current -= 1;
      const echoLeft = echoRemainingRef.current;
      if (echoLeft > 0) {
        const remainingDungeonCards = activeCards.filter(c => c != null && c.id !== card.id);
        if (remainingDungeonCards.length > 0) {
          const total = echoTotalRef.current;
          const currentRound = total - echoLeft + 1;
          const echoLabel = `（回响：第 ${currentRound}/${total} 次）`;
          setPendingMagicAction({
            card: pendingMagicAction.card,
            effect: 'return-dungeon-bottom',
            step: 'dungeon-select',
            prompt: `选择一张地城卡牌，置于牌堆底。${echoLabel}`,
            echoRemaining: echoLeft,
          } as PendingMagicAction);
          if (swapUpgradeTrigger4) {
            setUpgradeModalOpen(true);
            addGameLog('amulet', '流转之符：交换 3 次位置，选择一张牌升级！');
            setHeroSkillBanner('流转之符：选择一张牌进行升级。');
          } else {
            setHeroSkillBanner(`${card.name} 已置于牌堆底。继续选择下一张。${echoLabel}`);
          }
          return;
        }
        addGameLog('magic', '回响：地城中没有更多卡牌可选。');
      }

      finalizeMagicCard(pendingMagicAction.card, {
        banner: `${card.name} 已置于牌堆底。`,
      });
      if (swapUpgradeTrigger4) {
        setUpgradeModalOpen(true);
        addGameLog('amulet', '流转之符：交换 3 次位置，选择一张牌升级！');
        setHeroSkillBanner('流转之符：选择一张牌进行升级。');
      }
    },
    [
      activeCards,
      addGameLog,
      pendingMagicAction,
      previewCards,
      remainingDeck,
      setActiveCards,
      setHeroSkillBanner,
      setPendingMagicAction,
      setPreviewCards,
      setRemainingDeck,
      turnCount,
    ],
  );

  // ---------------------------------------------------------------------------
  // handleSlotTargetSelection
  // ---------------------------------------------------------------------------

  const handleReviveBlessingSlotSelection = useCallback(
    (slotId: EquipmentSlotId) => {
      if (!pendingHeroMagicAction || pendingHeroMagicAction.id !== 'revive-blessing') {
        return;
      }
      const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (!slotItem) {
        setHeroSkillBanner('该装备栏为空。');
        return;
      }
      const REVIVE_BLESSING_COST = 3;
      depsRef.current.setHp(prev => Math.max(1, prev - REVIVE_BLESSING_COST));
      depsRef.current.setEquipmentSlotById(slotId, { ...slotItem, hasEquipmentRevive: true, equipmentReviveUsed: false } as any);
      addGameLog('magic', `复生祝福：失去 ${REVIVE_BLESSING_COST} 生命，${slotItem.name} 获得复生能力`);
      setHeroSkillBanner(`${slotItem.name} 获得了复生祝福！`);
      setPendingHeroMagicAction(null);
      depsRef.current.completeHeroMagicActivation('revive-blessing', pendingHeroMagicAction.origin);
    },
    [
      addGameLog,
      equipmentSlot1,
      equipmentSlot2,
      pendingHeroMagicAction,
      setHeroSkillBanner,
      setPendingHeroMagicAction,
    ],
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
      pendingPotionAction,
    ],
  );

  // ---------------------------------------------------------------------------
  // Persuade flow
  // ---------------------------------------------------------------------------

  const computePersuadeSuccessRate = (monster: GameCardData): number => {
    let heroWeaponDmg = 0;
    for (const slot of [equipmentSlot1, equipmentSlot2]) {
      if (slot && (slot.type === 'weapon' || slot.type === 'monster')) {
        heroWeaponDmg += slot.attack ?? slot.value ?? 0;
      }
    }
    heroWeaponDmg += depsRef.current.getEquipmentSlotBonus('equipmentSlot1', 'damage');
    heroWeaponDmg += depsRef.current.getEquipmentSlotBonus('equipmentSlot2', 'damage');
    heroWeaponDmg += depsRef.current.amuletEffects.aura.attack;

    const heroHp = engine.getState().hp;
    const heroSpell = permanentSpellDamageBonus;
    const heroEffectiveDmg = Math.max(1, heroWeaponDmg + heroSpell * 0.4);

    const mAtk = monster.attack ?? monster.value;
    const mHp = monster.hp ?? monster.value;
    const mLayers = monster.hpLayers ?? monster.fury ?? 1;
    const isElite = Boolean(monster.monsterSpecial || monster.bossPhase);

    const monsterToughness = mHp * mLayers;
    const turnsToKill = monsterToughness / heroEffectiveDmg;
    const turnsToBeKilled = heroHp / Math.max(1, mAtk);
    const dominance = turnsToBeKilled / Math.max(0.1, turnsToKill);

    const logDom = Math.log2(Math.max(0.01, dominance));
    let rate = 40 + logDom * 8.75;

    if (isElite) rate -= 15;

    const isHighLayer = mLayers >= 3;
    if (isHighLayer) rate -= 15;

    const bonusScale = isHighLayer ? 0.5 : 1;

    const persuadeBoost = (monster as any)._persuadeBoost ?? 0;
    rate += persuadeBoost * bonusScale;

    const discountBonus = engine.getState().persuadeDiscount?.rateBonus ?? 0;
    rate += discountBonus * bonusScale;

    rate += engine.getState().persuadeAmuletBonus * bonusScale;

    if (depsRef.current.eternalRelicsRef.current.some(r => r.id === 'chain-persuade')) {
      const st2 = engine.getState();
      if (st2.lastPersuadeTargetId && st2.lastPersuadeTargetId === monster.id) {
        rate += 15 * st2.consecutivePersuadeCount;
      }
    }

    const raceBonus = engine.getState().persuadeRaceBonus;
    if (monster.monsterType && raceBonus[monster.monsterType]) {
      rate += raceBonus[monster.monsterType];
    }

    const pLevel = engine.getState().persuadeLevel ?? 1;
    rate += (pLevel - 1) * 5;

    for (const eSlot of [equipmentSlot1, equipmentSlot2] as const) {
      if (eSlot && eSlot.type === 'monster' && eSlot.goblinStealEquip) {
        const eSlotId: EquipmentSlotId = eSlot === equipmentSlot1 ? 'equipmentSlot1' : 'equipmentSlot2';
        const eReserve = eSlotId === 'equipmentSlot1' ? engine.getState().equipmentSlot1Reserve : engine.getState().equipmentSlot2Reserve;
        if (eReserve.length > 0) {
          rate += 30;
        }
      }
    }

    const maxRate = isHighLayer ? 60 : 75;
    const clamped = Math.max(5, Math.min(maxRate, rate));
    return Math.round(clamped / 5) * 5;
  };

  const getPersuadeEffectiveCost = (card?: GameCardData): number => {
    const costReduction = engine.getState().persuadeDiscount?.costReduction ?? 0;
    const st = engine.getState();
    const permCostMod = st.persuadeCostModifier ?? 0;
    let cost = Math.max(0, PERSUADE_COST + permCostMod - costReduction);
    if (st.persuadeSameTargetCostHalve && card && st.lastPersuadeTargetId === card.id) {
      cost = Math.floor(cost / 2);
    }
    return cost;
  };

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
    setPersuadeState({
      monster,
      targetSlot,
      phase: 'confirm',
      threshold,
      successRate,
      diceValue: null,
      success: null,
    });
  };

  const handlePersuadeConfirm = () => {
    if (!persuadeState) return;
    depsRef.current.pushUndoSnapshot();
    const effectiveCost = getPersuadeEffectiveCost(persuadeState.monster);
    setGold(prev => Math.max(0, prev - effectiveCost));
    const currentState = engine.getState();
    const sameTargetDiscount = currentState.persuadeSameTargetCostHalve && currentState.lastPersuadeTargetId === persuadeState.monster.id;
    addGameLog('system', `花费 ${effectiveCost} 金币尝试劝降 ${persuadeState.monster.name}…${sameTargetDiscount ? '（连劝减半）' : ''}`);
    const isSameTarget = currentState.lastPersuadeTargetId === persuadeState.monster.id;
    setConsecutivePersuadeCount(isSameTarget ? currentState.consecutivePersuadeCount + 1 : 1);
    setLastPersuadeTargetId(persuadeState.monster.id);
    setPersuadeDiscount(null);
    depsRef.current.setPersuadeTempDiscount(0);
    setPersuadeState(prev => prev ? { ...prev, phase: 'rolling' } : null);
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

  const handleHeroMagicChoice = useCallback(
    (choice: 'heal' | 'purge') => {
      if (depsRef.current.fullBoardInteractionLockedRef.current) return;
      depsRef.current.pushUndoSnapshot();
      resolveHolyLightChoice(choice);
    },
    [resolveHolyLightChoice],
  );

  // ---------------------------------------------------------------------------
  // Return bag
  // ---------------------------------------------------------------------------

  return {
    resetHeroSkillForNewWave,
    addHeroMagicGauge,
    startHeroMagicActivation,
    resolveHolyLightChoice,
    handleHolyLightMonsterCleanse,
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
    handleDungeonCardSelection,
    handleSlotTargetSelection,
    computePersuadeSuccessRate,
    canPersuadeMonster,
    openPersuadeModal,
    handlePersuadeConfirm,
    handleHeroSkillButtonClick,
    handleExtraHeroSkillButtonClick,
    handleHeroMagicTrigger,
    handleHeroMagicChoice,
  };
}
