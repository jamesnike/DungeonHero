import React, { useCallback } from 'react';
import { useGameEngine, useGameState, useEngineSetter } from '@/hooks/useGameEngine';
import type { GameCardData } from '@/components/GameCard';
import type { LogEntryType } from '@/components/GameLogPanel';
import type { ShopOffering } from '@/components/ShopModal';
import type {
  BackpackHandFlight,
  CardActionKeyword,
  EquipmentRepairTarget,
  EquipmentSlotId,
  MonsterRewardOption,
  SlotPermanentBonus,
} from '@/components/game-board/types';
import type { HeroSkillId } from '@/lib/heroSkills';
import { getHeroSkillById, heroSkills as allHeroSkills } from '@/lib/heroSkills';
import {
  SHOP_MAX_OFFERINGS,
  SHOP_REQUIRED_TYPES,
  SHOP_HEAL_COST,
  SHOP_HEAL_AMOUNT,
  SHOP_LEVEL_UP_COST,
  SHOP_SKILL_DISCOVER_COST,
  MAX_SHOP_LEVEL,
  DEV_MODE,
} from '@/game-core/constants';
import {
  getShopPrice,
  describeSlotLabel,
  describeBonusLabel,
} from '@/game-core/helpers';
import {
  STARTER_CARD_IDS,
  getStarterBaseId,
  minionImage,
  createStarterHealEchoCard,
} from '@/game-core/deck';
import { applyMonsterUpgradeLevel } from '@/lib/monsterRage';

// ---------------------------------------------------------------------------
// Deps: external dependencies injected by GameBoard
// ---------------------------------------------------------------------------

export interface ShopHandlersDeps {
  // --- Functions from useCardOperations (Layer 0) ---
  addToGraveyard: (card: GameCardData) => void;
  addCardToBackpack: (
    card: GameCardData,
    options?: { toBottom?: boolean; pendingDungeonCardId?: string },
  ) => void;
  returnCardsToClassDeck: (cards: GameCardData[]) => void;
  ensureCardInHand: (card: GameCardData) => void;
  discardCardToGraveyard: (
    card: GameCardData | null | undefined,
    options?: { owner?: 'player' | 'dungeon'; forceGraveyard?: boolean; forceRecycleBag?: boolean },
  ) => void;
  addPermanentMagicToRecycleBag: (card: GameCardData) => void;
  applyDiscardSideEffects: (
    card: GameCardData,
    owner: 'player' | 'dungeon',
    opts?: { toRecycleBag?: boolean },
  ) => void;
  isRecyclableFromHand: (card: GameCardData | null | undefined) => boolean;
  drawClassCardsToBackpack: (
    count: number,
    source: string,
    filter?: (card: GameCardData) => boolean,
  ) => GameCardData[];
  drawFromBackpackToHand: () => GameCardData | null;
  setEquipmentSlotBonus: (
    slotId: EquipmentSlotId,
    bonusType: keyof SlotPermanentBonus,
    value: number | ((current: number) => number),
  ) => void;
  backpackCapacity: number;
  effectiveHandLimit: number;

  // --- Functions from useCombatActions (Layer 1) ---
  healHero: (amount: number) => number;

  // --- Animation / UI callbacks from GameBoard ---
  addGameLog: (type: LogEntryType, message: string) => void;
  pushUndoSnapshot: () => void;
  clearUndoStack: () => void;
  triggerClassDeckFlight: (cards: GameCardData[]) => void;
  triggerDiscardFlight: (
    card: GameCardData,
    destination: 'graveyard' | 'recycle-bag',
  ) => Promise<void>;
  completeCurrentEvent: () => Promise<void>;
  getMonsterRewardsPreview: (monster: GameCardData) => MonsterRewardOption[];
  repairEquipmentDurability: (
    amount: number,
    targets: EquipmentRepairTarget[],
  ) => Promise<boolean>;
  drawCardsFromBackpack: (count: number) => number;
  consumeCardFromHand: (card: GameCardData | string) => boolean;
  maxHp: number;

  // --- Refs ---
  cardActionResolverRef: React.MutableRefObject<(() => void) | null>;
  cardActionRemainingRef: React.MutableRefObject<number>;
  deletingCardIdsRef: React.MutableRefObject<Set<string>>;
  monsterRewardQueuedInstanceIdsRef: React.MutableRefObject<Set<string>>;
  discardedCardsRef: React.MutableRefObject<GameCardData[]>;
  backpackHandFlightsRef: React.MutableRefObject<BackpackHandFlight[]>;
  graveyardDiscoverResolverRef: React.MutableRefObject<
    ((card: GameCardData | null) => void) | null
  >;
  graveyardDiscoverDeliveryRef: React.MutableRefObject<'backpack' | 'hand-first'>;
  ghostBladeExileResolverRef: React.MutableRefObject<(() => void) | null>;
  /** 从专属发现弹窗完成时调用（药水「灵思药剂」等），替代 completeCurrentEvent */
  discoverPotionCompletionRef: React.MutableRefObject<((payload: { banner: string }) => void) | null>;
  onNewCardGainedRef: React.MutableRefObject<((count: number) => void) | null>;
}

export type BeginDiscoverFlowOptions = {
  /** 仅从满足条件的专属牌中候选（例如仅魔法） */
  filter?: (card: GameCardData) => boolean;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useShopHandlers(depsRef: React.MutableRefObject<ShopHandlersDeps>) {
  const engine = useGameEngine();
  const gs = useGameState(s => s);

  const {
    hp,
    gold,
    shopLevel,
    classDeck,
    handCards,
    backpackItems,
    permanentMagicRecycleBag,
    discardedCards,
    selectedHeroSkill,
    extraHeroSkills,
    shopDeleteUsed,
    shopHealUsed,
    shopLevelUpUsed,
    shopSkillDiscoverUsed,
    discoverOptions,
    graveyardDiscoverState,
    ghostBladeExileCards,
    cardActionContext,
    activeMonsterReward,
  } = gs;

  // -- Setters ----------------------------------------------------------------

  const setHp = useEngineSetter('hp');
  const setGold = useEngineSetter('gold');
  const setTurnCount = useEngineSetter('turnCount');
  const setShopLevel = useEngineSetter('shopLevel');
  const setClassDeck = useEngineSetter('classDeck');
  const setHandCards = useEngineSetter('handCards');
  const setBackpackItems = useEngineSetter('backpackItems');
  const setPermanentMagicRecycleBag = useEngineSetter('permanentMagicRecycleBag');
  const setDiscardedCards = useEngineSetter('discardedCards');
  const setEquipmentSlot1 = useEngineSetter('equipmentSlot1');
  const setEquipmentSlot2 = useEngineSetter('equipmentSlot2');
  const setAmuletSlots = useEngineSetter('amuletSlots');
  const setExtraHeroSkills = useEngineSetter('extraHeroSkills');
  const setPermanentMaxHpBonus = useEngineSetter('permanentMaxHpBonus');
  const setPermanentSpellDamageBonus = useEngineSetter('permanentSpellDamageBonus');
  const setPermanentSpellLifesteal = useEngineSetter('permanentSpellLifesteal');
  const setStunCap = useEngineSetter('stunCap');
  const setHandLimitBonus = useEngineSetter('handLimitBonus');
  const setBackpackCapacityModifier = useEngineSetter('backpackCapacityModifier');
  const setHeroSkillBanner = useEngineSetter('heroSkillBanner');

  const setShopOfferings = useEngineSetter('shopOfferings');
  const setShopSourceEvent = useEngineSetter('shopSourceEvent');
  const setShopDeleteUsed = useEngineSetter('shopDeleteUsed');
  const setShopHealUsed = useEngineSetter('shopHealUsed');
  const setShopLevelUpUsed = useEngineSetter('shopLevelUpUsed');
  const setShopSkillDiscoverUsed = useEngineSetter('shopSkillDiscoverUsed');
  const setShopSkillOptions = useEngineSetter('shopSkillOptions');
  const setShopModalOpen = useEngineSetter('shopModalOpen');
  const setShopModalMinimized = useEngineSetter('shopModalMinimized');
  const setShopSkillSelectOpen = useEngineSetter('shopSkillSelectOpen');
  const setDeleteModalOpen = useEngineSetter('deleteModalOpen');
  const setUpgradeModalOpen = useEngineSetter('upgradeModalOpen');
  const setEventModalOpen = useEngineSetter('eventModalOpen');
  const setEventModalMinimized = useEngineSetter('eventModalMinimized');
  const setDiscoverModalOpen = useEngineSetter('discoverModalOpen');
  const setDiscoverOptions = useEngineSetter('discoverOptions');
  const setCardActionContext = useEngineSetter('cardActionContext');
  const setGraveyardDiscoverState = useEngineSetter('graveyardDiscoverState');
  const setGhostBladeExileCards = useEngineSetter('ghostBladeExileCards');
  const setMonsterRewardQueue = useEngineSetter('monsterRewardQueue');
  const setActiveMonsterReward = useEngineSetter('activeMonsterReward');

  // -- Derived values ---------------------------------------------------------

  const equipmentCardCount = (gs.equipmentSlot1 ? 1 : 0) + gs.equipmentSlot1Reserve.length
    + (gs.equipmentSlot2 ? 1 : 0) + gs.equipmentSlot2Reserve.length;
  const amuletCardCount = gs.amuletSlots.length;
  const deletableCardCount = handCards.length + backpackItems.length + permanentMagicRecycleBag.length
    + equipmentCardCount + amuletCardCount;

  // -- Shop offerings / flow --------------------------------------------------

  const generateShopOfferings = useCallback((): ShopOffering[] => {
    if (!classDeck.length) {
      return [];
    }

    const usedIds = new Set<string>();
    const offerings: ShopOffering[] = [];
    const reducedShopSlots = Math.max(0, SHOP_MAX_OFFERINGS - 1);
    const maxOfferings = Math.max(SHOP_REQUIRED_TYPES.length, reducedShopSlots + shopLevel);

    const takeRandomCard = (filter?: (card: GameCardData) => boolean): GameCardData | null => {
      const pool = classDeck.filter(
        card => !usedIds.has(card.id) && (!filter || filter(card)),
      );
      if (!pool.length) {
        return null;
      }
      const picked = pool[Math.floor(Math.random() * pool.length)];
      usedIds.add(picked.id);
      return picked;
    };

    SHOP_REQUIRED_TYPES.forEach(types => {
      const picked = takeRandomCard(card => types.includes(card.type));
      if (picked) {
        offerings.push({ card: picked, price: getShopPrice(picked), sold: false });
      }
    });

    while (offerings.length < maxOfferings) {
      const picked = takeRandomCard();
      if (!picked) {
        break;
      }
      offerings.push({ card: picked, price: getShopPrice(picked), sold: false });
    }

    return offerings;
  }, [classDeck, shopLevel]);

  const startShopFlow = useCallback(
    (eventCard: GameCardData | null): boolean => {
      if (!eventCard) {
        return false;
      }

      const offerings = generateShopOfferings();
      if (!offerings.length) {
        if (DEV_MODE) {
          console.debug('[Shop] Cannot open shop, no class cards available');
        }
        return false;
      }

      setShopOfferings(offerings);
      setShopSourceEvent(eventCard);
      setShopDeleteUsed(false);
      setShopHealUsed(false);
      setShopLevelUpUsed(false);
      setShopSkillDiscoverUsed(false);
      setDeleteModalOpen(false);
      setShopModalOpen(true);
      setShopModalMinimized(false);
      setEventModalOpen(false);
      setEventModalMinimized(false);
      return true;
    },
    [generateShopOfferings],
  );

  // -- Discover flow ----------------------------------------------------------

  const beginDiscoverFlow = useCallback(
    (source: string, opts?: BeginDiscoverFlowOptions): boolean => {
      const pool = opts?.filter ? classDeck.filter(opts.filter) : classDeck;
      if (pool.length === 0) {
        if (DEV_MODE) {
          console.debug('[Discover] No cards in pool, cannot start discover', { source, filtered: Boolean(opts?.filter) });
        }
        return false;
      }

      const available = Math.min(3, pool.length);
      const shuffledDeck = [...pool].sort(() => Math.random() - 0.5);
      const options = shuffledDeck.slice(0, available);
      const optionIds = new Set(options.map(card => card.id));

      setClassDeck(prev => prev.filter(card => !optionIds.has(card.id)));
      setDiscoverOptions(options);
      setDiscoverModalOpen(true);

      depsRef.current.addGameLog(
        'skill',
        `发现专属卡（${source}）：候选 ${options.map(c => `「${c.name}」`).join('、')}`,
      );

      if (DEV_MODE) {
        console.debug('[Discover] Started discover flow', { source, available, optionIds: Array.from(optionIds) });
      }

      return true;
    },
    [classDeck, setClassDeck, setDiscoverOptions, setDiscoverModalOpen],
  );

  const handleDiscoverFallback = useCallback((): boolean => {
    const fallback = depsRef.current.drawClassCardsToBackpack(1, 'discover-fallback');
    if (fallback.length) {
      depsRef.current.triggerClassDeckFlight(fallback);
      return true;
    }
    return false;
  }, []);

  const handleDiscoverSelect = useCallback(
    async (cardId: string) => {
      depsRef.current.pushUndoSnapshot();
      if (!discoverOptions.length) return;
      const selectedCard = discoverOptions.find(card => card.id === cardId);
      const remainingCards = discoverOptions.filter(card => card.id !== cardId);

      setDiscoverModalOpen(false);
      setDiscoverOptions([]);

      if (remainingCards.length) {
        depsRef.current.returnCardsToClassDeck(remainingCards);
      }

      if (selectedCard) {
        depsRef.current.addGameLog('skill', `发现专属卡：选入「${selectedCard.name}」`);
        if (backpackItems.length >= depsRef.current.backpackCapacity) {
          depsRef.current.addToGraveyard(selectedCard);
          depsRef.current.addGameLog('skill', `背包已满，「${selectedCard.name}」进入墓地`);
        } else {
          setBackpackItems(prev => [selectedCard, ...prev]);
          depsRef.current.triggerClassDeckFlight([selectedCard]);
          depsRef.current.onNewCardGainedRef?.current?.(1);
        }
      }

      const completion = depsRef.current.discoverPotionCompletionRef.current;
      if (completion) {
        depsRef.current.discoverPotionCompletionRef.current = null;
        const banner = selectedCard
          ? backpackItems.length >= depsRef.current.backpackCapacity
            ? `「${selectedCard.name}」已进入墓地（背包已满）。`
            : `获得专属魔法「${selectedCard.name}」！`
          : '未发现卡牌。';
        completion({ banner });
        return;
      }

      await depsRef.current.completeCurrentEvent();
    },
    [
      backpackItems.length,
      discoverOptions,
      setBackpackItems,
      setDiscoverModalOpen,
      setDiscoverOptions,
    ],
  );

  // -- Shop purchase / close --------------------------------------------------

  const handleShopPurchase = useCallback(
    (cardId: string) => {
      depsRef.current.pushUndoSnapshot();
      setShopOfferings(prev => {
        const offeringIndex = prev.findIndex(entry => entry.card.id === cardId);
        if (offeringIndex === -1) {
          return prev;
        }

        const offering = prev[offeringIndex];
        if (offering.sold) {
          return prev;
        }

        if (engine.getState().gold < offering.price) {
          return prev;
        }

        if (engine.getState().backpackItems.length >= depsRef.current.backpackCapacity) {
          return prev;
        }

        const purchasedCard = { ...offering.card };
        depsRef.current.addGameLog('shop', `商店：购买「${purchasedCard.name}」（-${offering.price} 金币）`);
        setGold(value => value - offering.price);
        setClassDeck(deck => deck.filter(card => card.id !== purchasedCard.id));
        setBackpackItems(items => [purchasedCard, ...items]);
        depsRef.current.triggerClassDeckFlight([purchasedCard]);
        depsRef.current.onNewCardGainedRef?.current?.(1);

        const next = [...prev];
        next[offeringIndex] = { ...offering, sold: true };
        return next;
      });
    },
    [engine, setShopOfferings, setGold, setClassDeck, setBackpackItems],
  );

  const handleShopClose = useCallback(async () => {
    depsRef.current.pushUndoSnapshot();
    depsRef.current.addGameLog('shop', '离开商店');
    setShopModalOpen(false);
    setShopModalMinimized(false);
    setShopOfferings([]);
    setShopSourceEvent(null);
    setDeleteModalOpen(false);
    setCardActionContext(null);
    depsRef.current.cardActionResolverRef.current = null;
    await depsRef.current.completeCurrentEvent();
  }, [
    setShopModalOpen,
    setShopModalMinimized,
    setShopOfferings,
    setShopSourceEvent,
    setDeleteModalOpen,
    setCardActionContext,
  ]);

  // -- Shop services ----------------------------------------------------------

  const handleShopDeleteRequest = useCallback(() => {
    depsRef.current.pushUndoSnapshot();
    if (shopDeleteUsed || deletableCardCount === 0) {
      return;
    }
    depsRef.current.cardActionRemainingRef.current = 1;
    depsRef.current.deletingCardIdsRef.current.clear();
    setCardActionContext({
      mode: 'shop',
      keyword: 'delete',
      requiredCount: 1,
      remainingCount: 1,
      title: '选择要删除的卡牌',
      description: '从手牌、背包、装备栏、护符栏或回收袋中删除 1 张卡牌，将其送入坟场。',
    });
    setDeleteModalOpen(true);
  }, [deletableCardCount, shopDeleteUsed, setCardActionContext, setDeleteModalOpen]);

  const handleShopHealRequest = useCallback(() => {
    depsRef.current.pushUndoSnapshot();
    if (shopHealUsed || engine.getState().gold < SHOP_HEAL_COST || hp >= depsRef.current.maxHp) return;
    depsRef.current.addGameLog('shop', `商店：治疗（-${SHOP_HEAL_COST} 金币，+${SHOP_HEAL_AMOUNT} HP）`);
    setGold(prev => prev - SHOP_HEAL_COST);
    depsRef.current.healHero(SHOP_HEAL_AMOUNT);
    setShopHealUsed(true);
    setHeroSkillBanner(`花费 ${SHOP_HEAL_COST} 金币恢复了 ${SHOP_HEAL_AMOUNT} 点生命。`);
  }, [engine, hp, shopHealUsed, setGold, setShopHealUsed, setHeroSkillBanner]);

  const handleShopLevelUpRequest = useCallback(() => {
    depsRef.current.pushUndoSnapshot();
    if (shopLevelUpUsed || engine.getState().gold < SHOP_LEVEL_UP_COST || shopLevel >= MAX_SHOP_LEVEL) return;
    depsRef.current.addGameLog('shop', `商店：升级等级（-${SHOP_LEVEL_UP_COST} 金币）`);
    setGold(prev => prev - SHOP_LEVEL_UP_COST);
    setShopLevel(prev => Math.min(MAX_SHOP_LEVEL, prev + 1));
    setShopLevelUpUsed(true);
    setHeroSkillBanner(`花费 ${SHOP_LEVEL_UP_COST} 金币，商店等级提升了！`);
  }, [engine, shopLevelUpUsed, shopLevel, setGold, setShopLevel, setShopLevelUpUsed, setHeroSkillBanner]);

  // -- Card upgrade -----------------------------------------------------------

  const handleCardUpgrade = useCallback((cardId: string) => {
    depsRef.current.pushUndoSnapshot();

    let upgradedName = '';
    const upgradeCard = <T extends GameCardData>(card: T): T => {
      if (card.id !== cardId) return card;
      const currentLevel = card.upgradeLevel ?? 0;
      const maxLevel = card.maxUpgradeLevel ?? 0;
      if (currentLevel >= maxLevel) return card;
      const newLevel = currentLevel + 1;

      if (card.type === 'monster') {
        const result = applyMonsterUpgradeLevel(card, newLevel) as T;
        upgradedName = result.name;
        return result;
      }

      const upgraded = { ...card, upgradeLevel: newLevel };

      switch (getStarterBaseId(card.id)) {
        case STARTER_CARD_IDS.weaponBurst: {
          const burstVal = 3 + 2 * newLevel;
          upgraded.description = `选择一个装备栏，临时攻击力 +${burstVal}（瀑流后重置）。`;
          upgraded.magicEffect = `永久魔法：选择一个装备栏，临时攻击力 +${burstVal}。`;
          break;
        }
        case STARTER_CARD_IDS.repairOne: {
          const hpCosts = [2, 1, 1];
          const repairAmounts = [1, 2, 2];
          const hpCost = hpCosts[newLevel] ?? 1;
          const repair = repairAmounts[newLevel] ?? 2;
          const hpPart = hpCost > 0 ? `失去 ${hpCost} 点生命，` : '';
          const drawPart = newLevel >= 2 ? '，抽 1 张牌' : '';
          upgraded.description = `${hpPart}选择一个装备恢复 ${repair} 点耐久${drawPart}。`;
          upgraded.magicEffect = `永久魔法：${hpPart}选择一个装备恢复 ${repair} 点耐久${drawPart}。`;
          break;
        }
        case STARTER_CARD_IDS.discardDraw: {
          const discards = [1, 1, 2, 3];
          const draws = [1, 2, 3, 4];
          const d = discards[newLevel] ?? 1;
          const dr = draws[newLevel] ?? 1;
          upgraded.description = `将 ${d} 张手牌移到回收袋，从背包抽取 ${dr} 张新牌。`;
          upgraded.magicEffect = `永久魔法：将 ${d} 张手牌移到回收袋，从背包抽 ${dr} 张牌。`;
          break;
        }
        case STARTER_CARD_IDS.reshuffle: {
          const delays = [3, 2, 1];
          upgraded.recycleDelay = delays[newLevel] ?? 1;
          break;
        }
        case STARTER_CARD_IDS.tempArmor: {
          const taAmounts = [2, 3, 4];
          const ta = taAmounts[newLevel] ?? 4;
          upgraded.description = `选择一个装备栏，+${ta} 临时护甲。`;
          upgraded.magicEffect = `永久魔法：选择一个装备栏，+${ta} 临时护甲。`;
          break;
        }
        case STARTER_CARD_IDS.dungeonSwap: {
          if (newLevel === 1) {
            upgraded.recycleDelay = 1;
          } else if (newLevel === 2) {
            upgraded.description = '选择地城行的一张卡牌，与最左边的卡牌互换位置。';
            upgraded.magicEffect = '永久魔法：选择地城行的一张卡牌，与最左边的卡牌互换位置。';
          }
          break;
        }
        case STARTER_CARD_IDS.trainingBlade: {
          if (newLevel === 1) {
            upgraded.value = 3;
          } else if (newLevel === 2) {
            upgraded.value = 3;
            upgraded.durability = Math.min((card.durability ?? 2) + 1, 3);
            upgraded.maxDurability = 3;
          }
          break;
        }
        case STARTER_CARD_IDS.stunStrike: {
          const damages = [2, 4, 6];
          const stuns = [10, 20, 30];
          const dmg = damages[newLevel] ?? 6;
          const stun = stuns[newLevel] ?? 30;
          upgraded.description = `对一个怪物造成 ${dmg} 点法术伤害，有 ${stun}% 概率击晕目标。`;
          upgraded.magicEffect = `永久魔法：对一个怪物造成 ${dmg} 点伤害，${stun}% 击晕。`;
          break;
        }
        case STARTER_CARD_IDS.magicMissile: {
          const boltCounts = [2, 3, 4];
          const bc = boltCounts[newLevel] ?? 4;
          upgraded.description = `加入 ${bc} 张一次性「魔弹」到手牌（每张可对一个怪物造成 2 点法术伤害）。`;
          upgraded.magicEffect = `永久魔法：手上加入 ${bc} 张一次性「魔弹」。`;
          break;
        }
        case STARTER_CARD_IDS.recycleDrawMagic: {
          const rdCounts = [1, 2, 3];
          const rdc = rdCounts[newLevel] ?? 3;
          upgraded.onDiscardDraw = rdc;
          upgraded.description = `被回收时，从背包抽 ${rdc} 张牌。`;
          upgraded.magicEffect = `永久魔法：被回收时，从背包抽 ${rdc} 张牌。`;
          break;
        }
        case STARTER_CARD_IDS.dimensionWarp: {
          const delays = [2, 1, 1];
          upgraded.recycleDelay = delays[newLevel] ?? 1;
          if (newLevel >= 2) {
            upgraded.description = '将地城行的一张牌和它正上方预览行的牌互换，然后抽 1 张牌。';
            upgraded.magicEffect = '永久魔法：选择一张地城行卡牌，与正上方预览行卡牌互换位置，然后抽 1 张牌。';
          }
          break;
        }
        case STARTER_CARD_IDS.undyingBlessing: {
          upgraded.description = '赋予装备复生能力，然后抽 1 张牌。';
          upgraded.magicEffect = '永久魔法：选择一个装备，赋予其复生，然后抽 1 张牌。';
          break;
        }
        case STARTER_CARD_IDS.gamblerGambit: {
          const golds = [1, 2, 3];
          const draws = [1, 2, 3];
          const g = golds[newLevel] ?? 3;
          const d = draws[newLevel] ?? 3;
          upgraded.description = `失去 1 点生命，获得 ${g} 金币，从背包抽 ${d} 张牌。`;
          upgraded.magicEffect = `永久魔法：失去 1 点生命，获得 ${g} 金币，从背包抽 ${d} 张牌。`;
          break;
        }
        case STARTER_CARD_IDS.healMagic: {
          const heals = [5, 3, 5];
          const delays = [0, 2, 1];
          const h = heals[newLevel] ?? 5;
          upgraded.magicType = 'permanent';
          upgraded.recycleDelay = delays[newLevel] ?? 1;
          upgraded.description = `回复 ${h} 点生命。`;
          upgraded.magicEffect = `永久魔法：回复 ${h} 点生命。`;
          break;
        }
        case STARTER_CARD_IDS.classSummon: {
          upgraded.magicType = 'permanent';
          upgraded.recycleDelay = 2;
          upgraded.description = '弃回 2 张牌，获得一张职业专属卡。';
          upgraded.magicEffect = '永久魔法：弃回 2 张牌，获得一张职业专属卡。';
          break;
        }
        default:
          break;
      }

      const ke = (card as any).knightEffect as string | undefined;
      if (ke) {
        switch (ke) {
          case 'graveyard-recall': {
            const recallCounts = [3, 4, 5, 6];
            const cnt = recallCounts[newLevel] ?? 6;
            upgraded.description = `一次性：从坟场随机取回至多 ${cnt} 张牌加入背包（不能取回自己）。`;
            upgraded.magicEffect = `坟场随机取回 ${cnt} 张牌。`;
            break;
          }
          case 'blood-greed': {
            if (newLevel >= 1) {
              upgraded.description = '一次性：获得等同当前已损失生命的金币，将"贪婪诅咒"放入背包，并开启商店。';
              upgraded.magicEffect = '获得金币，生成贪婪诅咒，并开启商店。';
            }
            break;
          }
          case 'armor-strike': {
            const pcts = [50, 100, 150];
            const pct = pcts[newLevel] ?? 150;
            upgraded.description = `永久：选择一件护甲装备，对目标怪物造成等同护甲值 ${pct}% 的伤害。`;
            upgraded.magicEffect = `护甲值 ${pct}% 转化为伤害。`;
            break;
          }
          case 'berserk-gambit': {
            if (newLevel === 1) {
              upgraded.description = '一次性：生命降至 1，本回合所有装备 +4 伤害，每个武器栏可多攻击一次。';
              upgraded.magicEffect = '降血换取爆发与每栏额外攻击。';
            } else if (newLevel === 2) {
              upgraded.description = '一次性：生命降至 1，本回合所有装备 +8 伤害，每个武器栏可多攻击一次。';
              upgraded.magicEffect = '降血换取强力爆发与每栏额外攻击。';
            } else if (newLevel === 3) {
              upgraded.description = '一次性：生命降至 1，本回合所有装备 +8 伤害，每个武器栏可多攻击 2 次。';
              upgraded.magicEffect = '降血换取强力爆发与每栏多次额外攻击。';
            }
            break;
          }
          case 'missing-hp-smite': {
            const smitePcts = [50, 100, 150];
            const sp = smitePcts[newLevel] ?? 150;
            upgraded.description = `永久：对一名怪物造成等同当前已损失生命值 ${sp}% 的伤害。`;
            upgraded.magicEffect = `以失去生命 ${sp}% 为伤害。`;
            break;
          }
          case 'death-ward': {
            if (newLevel === 1) {
              upgraded.magicType = 'permanent' as any;
              upgraded.recycleDelay = 2;
              upgraded.description = '永久：只能在受到致命伤害时触发，抵消该次伤害。每 2 回合可用。';
              upgraded.magicEffect = '濒死时抵消致死伤害（永久，2 回合冷却）。';
            } else if (newLevel === 2) {
              upgraded.magicType = 'permanent' as any;
              upgraded.recycleDelay = 1;
              upgraded.description = '永久：只能在受到致命伤害时触发，抵消该次伤害。每回合可用。';
              upgraded.magicEffect = '濒死时抵消致死伤害（永久，1 回合冷却）。';
            }
            break;
          }
          case 'recycle-flare': {
            const drawCounts = [2, 3, 4];
            const dc = drawCounts[newLevel] ?? 4;
            upgraded.description = `永久：将回收袋里的卡牌放回背包，然后抽 ${dc} 张牌。(可超手牌上限)`;
            upgraded.magicEffect = `回收袋归位并抽 ${dc} 张牌。`;
            break;
          }
          case 'fate-sight': {
            const baseDamages = [3, 4];
            const peekCounts = [3, 4];
            const dmg = baseDamages[newLevel] ?? 4;
            const peek = peekCounts[newLevel] ?? 4;
            upgraded.recycleDelay = newLevel >= 1 ? 1 : 2;
            upgraded.description = `永久：造成 ${dmg} 点伤害，翻看主牌堆顶 ${peek} 张牌，每有一张怪物牌，20% 概率击晕目标。`;
            upgraded.magicEffect = `造成 ${dmg} 点伤害并透视 ${peek} 张牌，可能击晕目标。`;
            break;
          }
          default:
            break;
        }
      }

      upgradedName = upgraded.name;
      return upgraded as T;
    };

    setHandCards(prev => prev.map(upgradeCard));
    setEquipmentSlot1(prev => (prev ? upgradeCard(prev) : null));
    setEquipmentSlot2(prev => (prev ? upgradeCard(prev) : null));
    setAmuletSlots(prev => prev.map(upgradeCard));

    setBackpackItems(prev => prev.map(upgradeCard));
    setPermanentMagicRecycleBag(prev => prev.map(upgradeCard));

    setUpgradeModalOpen(false);

    depsRef.current.addGameLog('shop', `卡牌升级：「${upgradedName || '卡牌'}」升级成功！`);
    setHeroSkillBanner(`「${upgradedName || '卡牌'}」升级成功！`);
  }, [
    setHandCards,
    setEquipmentSlot1,
    setEquipmentSlot2,
    setAmuletSlots,
    setBackpackItems,
    setPermanentMagicRecycleBag,
    setUpgradeModalOpen,
    setHeroSkillBanner,
  ]);

  // -- Skill discover / select ------------------------------------------------

  const handleShopSkillDiscoverRequest = useCallback(() => {
    if (shopSkillDiscoverUsed || engine.getState().gold < SHOP_SKILL_DISCOVER_COST) return;
    const ownedSkills = new Set<string>([
      ...(selectedHeroSkill ? [selectedHeroSkill] : []),
      ...extraHeroSkills,
    ]);
    const available = allHeroSkills.filter(s => !ownedSkills.has(s.id));
    if (available.length < 3) return;
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    const options = shuffled.slice(0, 3);
    depsRef.current.pushUndoSnapshot();
    setGold(prev => prev - SHOP_SKILL_DISCOVER_COST);
    setShopSkillOptions(options);
    setShopSkillSelectOpen(true);
    setShopSkillDiscoverUsed(true);
    depsRef.current.addGameLog('shop', `商店：英雄技能三选一（-${SHOP_SKILL_DISCOVER_COST} 金币）`);
  }, [engine, extraHeroSkills, selectedHeroSkill, shopSkillDiscoverUsed, setGold, setShopSkillOptions, setShopSkillSelectOpen, setShopSkillDiscoverUsed]);

  const handleShopSkillSelect = useCallback((skillId: string) => {
    depsRef.current.pushUndoSnapshot();
    const skillDef = getHeroSkillById(skillId as HeroSkillId);
    setExtraHeroSkills(prev => [...prev, skillId as HeroSkillId]);
    setShopSkillSelectOpen(false);
    setShopSkillOptions([]);
    depsRef.current.addGameLog('shop', `商店：习得英雄技能「${skillDef?.name ?? skillId}」`);
    depsRef.current.addGameLog('skill', `学习了新的英雄技能：${skillDef?.name ?? skillId}`);
    setHeroSkillBanner(`学习了「${skillDef?.name ?? skillId}」！`);

    if (!skillDef) return;

    const hpBonus = skillDef.initialMaxHpBonus ?? 0;
    if (hpBonus) {
      setPermanentMaxHpBonus(prev => prev + hpBonus);
      setHp(prev => prev + hpBonus);
      depsRef.current.addGameLog('skill', `技能加成：最大生命 +${hpBonus}，恢复 ${hpBonus} 生命`);
    }
    const goldBonus = skillDef.initialGoldBonus ?? 0;
    if (goldBonus) {
      setGold(prev => prev + goldBonus);
      depsRef.current.addGameLog('gold', `技能加成：金币 +${goldBonus}`);
    }
    const waterfallBonus = skillDef.initialWaterfallBonus ?? 0;
    if (waterfallBonus) {
      setTurnCount(prev => prev + waterfallBonus);
      depsRef.current.addGameLog('system', `技能加成：瀑流回合 +${waterfallBonus}`);
    }
    const classDraw = skillDef.initialClassCardDraw ?? 0;
    if (classDraw) {
      const drawn = depsRef.current.drawClassCardsToBackpack(classDraw, 'shop-skill-draw');
      if (drawn.length > 0) {
        depsRef.current.addGameLog('skill', `技能加成：预抽 ${drawn.length} 张职业牌`);
        depsRef.current.triggerClassDeckFlight(drawn);
      }
    }
    const shopLvBonus = skillDef.initialShopLevel;
    if (shopLvBonus != null && shopLvBonus > 0) {
      setShopLevel(prev => {
        const next = Math.min(MAX_SHOP_LEVEL, Math.max(prev, shopLvBonus));
        if (next > prev) {
          depsRef.current.addGameLog('shop', `技能加成：商店等级提升至 Lv.${next}`);
        }
        return next;
      });
    }
    const backpackCap = skillDef.initialBackpackCapacityBonus ?? 0;
    if (backpackCap) {
      setBackpackCapacityModifier(prev => prev + backpackCap);
      depsRef.current.addGameLog('skill', `技能加成：背包上限 +${backpackCap}`);
    }
    const handLimit = skillDef.initialHandLimitBonus ?? 0;
    if (handLimit) {
      setHandLimitBonus(prev => prev + handLimit);
      depsRef.current.addGameLog('skill', `技能加成：手牌上限 +${handLimit}`);
    }
    const spellDmg = skillDef.initialSpellDamageBonus ?? 0;
    if (spellDmg) {
      setPermanentSpellDamageBonus(prev => prev + spellDmg);
      depsRef.current.addGameLog('skill', `技能加成：永久法术伤害 +${spellDmg}`);
    }
    const shopHandDraw = skillDef.initialHandDraw ?? 0;
    if (shopHandDraw) {
      for (let i = 0; i < shopHandDraw; i++) {
        const drawn = depsRef.current.drawFromBackpackToHand();
        if (drawn) depsRef.current.addGameLog('skill', `技能加成：抽到手牌「${drawn.name}」`);
      }
    }
    if (skillId === 'summon-minion') {
      const minionCard: GameCardData = {
        id: `summon-minion-card-${Date.now()}`,
        type: 'monster',
        name: '小随从',
        value: 1,
        attack: 1,
        hp: 1,
        hpLayers: 4,
        fury: 4,
        currentLayer: 4,
        maxHp: 1,
        image: minionImage,
        description: '忠诚的小随从，可装备。每击杀一只怪物，攻击 +1、防御 +1。',
        isMinionCard: true,
      };
      depsRef.current.addCardToBackpack(minionCard);
      depsRef.current.addGameLog('skill', '技能加成：获得小随从');
    }
    if (skillId === 'heal-to-damage') {
      depsRef.current.addCardToBackpack(createStarterHealEchoCard());
      depsRef.current.addGameLog('skill', '愈战愈勇：获得永久魔法「治愈余韵」');
    }
  }, [
    setExtraHeroSkills,
    setShopSkillSelectOpen,
    setShopSkillOptions,
    setHeroSkillBanner,
    setPermanentMaxHpBonus,
    setHp,
    setGold,
    setTurnCount,
    setShopLevel,
    setBackpackCapacityModifier,
    setHandLimitBonus,
    setPermanentSpellDamageBonus,
  ]);

  // -- Graveyard discover -----------------------------------------------------

  const requestGraveyardSelection = useCallback(
    (
      maxOptions: number,
      opts?: { delivery?: 'backpack' | 'hand-first' },
    ) => {
      const exileIds = new Set((ghostBladeExileCards ?? []).map(c => c.id));
      const eligible = exileIds.size > 0
        ? discardedCards.filter(c => !exileIds.has(c.id))
        : discardedCards;
      if (!eligible.length) {
        setHeroSkillBanner('坟场中没有可取回的卡牌。');
        return Promise.resolve<GameCardData | null>(null);
      }
      depsRef.current.graveyardDiscoverDeliveryRef.current =
        opts?.delivery === 'hand-first' ? 'hand-first' : 'backpack';
      const shuffled = [...eligible].sort(() => Math.random() - 0.5);
      const options = shuffled.slice(0, Math.min(maxOptions, shuffled.length));
      return new Promise<GameCardData | null>(resolve => {
        depsRef.current.graveyardDiscoverResolverRef.current = card => {
          resolve(card);
          depsRef.current.graveyardDiscoverResolverRef.current = null;
        };
        setGraveyardDiscoverState(options);
      });
    },
    [discardedCards, ghostBladeExileCards, setHeroSkillBanner, setGraveyardDiscoverState],
  );

  const handleGraveyardDiscoverSelect = useCallback(
    (cardId: string) => {
      depsRef.current.pushUndoSnapshot();
      if (!graveyardDiscoverState) {
        return;
      }
      const selected = graveyardDiscoverState.find(card => card.id === cardId);
      if (!selected) {
        return;
      }
      setDiscardedCards(prev => {
        const next = prev.filter(card => card.id !== cardId);
        depsRef.current.discardedCardsRef.current = next;
        return next;
      });
      const delivery = depsRef.current.graveyardDiscoverDeliveryRef.current;
      const flightsCount = depsRef.current.backpackHandFlightsRef.current.length;
      const handRoom = Math.max(0, depsRef.current.effectiveHandLimit - (handCards.length + flightsCount));
      const toHand =
        delivery === 'hand-first' && handRoom > 0 && !handCards.some(c => c.id === selected.id);
      if (toHand) {
        depsRef.current.ensureCardInHand(selected);
        depsRef.current.addGameLog('event', `坟场发现：入手牌「${selected.name}」`);
        setHeroSkillBanner(`「${selected.name}」已加入手牌。`);
        depsRef.current.onNewCardGainedRef?.current?.(1);
      } else {
        depsRef.current.addCardToBackpack(selected);
        depsRef.current.addGameLog(
          'event',
          delivery === 'hand-first'
            ? `坟场发现：手牌已满，「${selected.name}」进入背包`
            : `坟场发现：选入背包「${selected.name}」`,
        );
        if (delivery === 'hand-first') {
          setHeroSkillBanner(`手牌已满，「${selected.name}」已进入背包。`);
        }
      }
      setGraveyardDiscoverState(null);
      depsRef.current.graveyardDiscoverResolverRef.current?.(selected);
      depsRef.current.graveyardDiscoverResolverRef.current = null;
    },
    [
      graveyardDiscoverState,
      handCards,
      setDiscardedCards,
      setGraveyardDiscoverState,
      setHeroSkillBanner,
    ],
  );

  // -- Ghost blade exile ------------------------------------------------------

  const triggerGhostBladeExile = useCallback(
    (): Promise<void> => {
      const graveyard = depsRef.current.discardedCardsRef.current;
      const discoverIds = new Set((graveyardDiscoverState ?? []).map(c => c.id));
      const eligible = discoverIds.size > 0
        ? graveyard.filter(c => !discoverIds.has(c.id))
        : graveyard;
      if (eligible.length === 0) return Promise.resolve();
      const shuffled = [...eligible].sort(() => Math.random() - 0.5);
      const options = shuffled.slice(0, Math.min(3, shuffled.length));
      return new Promise<void>(resolve => {
        depsRef.current.ghostBladeExileResolverRef.current = resolve;
        setGhostBladeExileCards(options);
      });
    },
    [graveyardDiscoverState, setGhostBladeExileCards],
  );

  const handleGhostBladeExileConfirm = useCallback(
    (selectedIds: string[]) => {
      if (selectedIds.length > 0) {
        setDiscardedCards(prev => {
          const exileSet = new Set(selectedIds);
          const next = prev.filter(c => !exileSet.has(c.id));
          depsRef.current.discardedCardsRef.current = next;
          return next;
        });
        const exiledNames = (ghostBladeExileCards ?? [])
          .filter(c => selectedIds.includes(c.id))
          .map(c => c.name);
        depsRef.current.addGameLog('equip', `虚灵刀放逐：${exiledNames.join('、')} 被移除出游戏。`);
        setHeroSkillBanner(`虚灵刀放逐了 ${exiledNames.join('、')}！`);
      }
      setGhostBladeExileCards(null);
      depsRef.current.ghostBladeExileResolverRef.current?.();
      depsRef.current.ghostBladeExileResolverRef.current = null;
    },
    [ghostBladeExileCards, setDiscardedCards, setGhostBladeExileCards, setHeroSkillBanner],
  );

  // -- Card action (delete / discard) -----------------------------------------

  const computeActionPool = useCallback(
    (keyword: CardActionKeyword, handOnly?: boolean): number => {
      if (handOnly) return handCards.length;

      const isPerm = (c: GameCardData) =>
        depsRef.current.isRecyclableFromHand(c);
      const allEquip: GameCardData[] = [
        gs.equipmentSlot1, ...gs.equipmentSlot1Reserve,
        gs.equipmentSlot2, ...gs.equipmentSlot2Reserve,
      ].filter(Boolean) as GameCardData[];
      const allAmulets: GameCardData[] = gs.amuletSlots;

      switch (keyword) {
        case 'discard-recycle':
        case 'move-to':
          return handCards.length + allEquip.length + allAmulets.length;
        case 'discard-only':
          return handCards.filter(c => !isPerm(c)).length
            + allEquip.filter(c => !isPerm(c)).length
            + allAmulets.length;
        case 'recycle-only':
          return handCards.filter(isPerm).length
            + allEquip.filter(isPerm).length;
        case 'delete':
          return handCards.length + backpackItems.length + permanentMagicRecycleBag.length
            + allEquip.length + allAmulets.length;
        default:
          return handCards.length;
      }
    },
    [backpackItems.length, gs.amuletSlots, gs.equipmentSlot1, gs.equipmentSlot1Reserve, gs.equipmentSlot2, gs.equipmentSlot2Reserve, handCards, permanentMagicRecycleBag.length],
  );

  const requestCardAction = useCallback(
    (
      keyword: CardActionKeyword,
      count: number,
      options?: {
        title?: string;
        description?: string;
        handOnly?: boolean;
        moveToDestination?: 'recycle-bag' | 'graveyard';
      },
    ) => {
      const pool = computeActionPool(keyword, options?.handOnly);
      if (pool < count) {
        setHeroSkillBanner(options?.description ?? '当前没有足够的卡牌可供选择。');
        return Promise.resolve(false);
      }
      return new Promise<boolean>(resolve => {
        depsRef.current.cardActionResolverRef.current = () => {
          resolve(true);
          depsRef.current.cardActionResolverRef.current = null;
        };
        depsRef.current.cardActionRemainingRef.current = count;
        depsRef.current.deletingCardIdsRef.current.clear();
        setCardActionContext({
          mode: 'event',
          keyword,
          requiredCount: count,
          remainingCount: count,
          title: options?.title,
          description: options?.description,
          handOnly: options?.handOnly,
          moveToDestination: options?.moveToDestination,
        });
        setDeleteModalOpen(true);
      });
    },
    [computeActionPool, setHeroSkillBanner, setCardActionContext, setDeleteModalOpen],
  );

  const handleDeleteCardConfirm = useCallback(
    async (cardId: string, source: 'hand' | 'backpack' | 'recycleBag' | 'equipment' | 'amulet') => {
      if (depsRef.current.deletingCardIdsRef.current.has(cardId)) return;
      depsRef.current.deletingCardIdsRef.current.add(cardId);

      depsRef.current.pushUndoSnapshot();
      let cardToDelete: GameCardData | null = null;

      if (source === 'hand') {
        cardToDelete = handCards.find(card => card.id === cardId) ?? null;
      } else if (source === 'backpack') {
        cardToDelete = backpackItems.find(card => card.id === cardId) ?? null;
      } else if (source === 'recycleBag') {
        cardToDelete = permanentMagicRecycleBag.find(card => card.id === cardId) ?? null;
      } else if (source === 'equipment') {
        const allEquip = [
          { card: gs.equipmentSlot1, slot: 'equipmentSlot1' as const },
          ...gs.equipmentSlot1Reserve.map(c => ({ card: c, slot: 'equipmentSlot1' as const })),
          { card: gs.equipmentSlot2, slot: 'equipmentSlot2' as const },
          ...gs.equipmentSlot2Reserve.map(c => ({ card: c, slot: 'equipmentSlot2' as const })),
        ];
        const match = allEquip.find(e => e.card?.id === cardId);
        cardToDelete = match?.card ?? null;
      } else if (source === 'amulet') {
        cardToDelete = gs.amuletSlots.find(card => card.id === cardId) ?? null;
      }

      if (!cardToDelete) {
        depsRef.current.deletingCardIdsRef.current.delete(cardId);
        return;
      }

      const kw = cardActionContext?.keyword;

      let flightDest: 'graveyard' | 'recycle-bag' = 'graveyard';
      if (kw === 'move-to') {
        flightDest = cardActionContext?.moveToDestination === 'recycle-bag' ? 'recycle-bag' : 'graveyard';
      } else if (kw === 'discard-recycle') {
        const isPerm = depsRef.current.isRecyclableFromHand(cardToDelete);
        flightDest = isPerm ? 'recycle-bag' : 'graveyard';
      } else if (kw === 'recycle-only') {
        flightDest = 'recycle-bag';
      }
      const flightP = depsRef.current.triggerDiscardFlight(cardToDelete, flightDest);

      if (source === 'hand') {
        const removed = depsRef.current.consumeCardFromHand(cardToDelete);
        if (!removed) {
          depsRef.current.deletingCardIdsRef.current.delete(cardId);
          return;
        }
      } else if (source === 'backpack') {
        setBackpackItems(prev => prev.filter(card => card.id !== cardId));
      } else if (source === 'recycleBag') {
        setPermanentMagicRecycleBag(prev => prev.filter(card => card.id !== cardId));
      } else if (source === 'equipment') {
        const s1 = engine.getState().equipmentSlot1;
        const s2 = engine.getState().equipmentSlot2;
        if (s1?.id === cardId) {
          const reserve = engine.getState().equipmentSlot1Reserve;
          const promoted = reserve.length > 0 ? reserve[0] : null;
          setEquipmentSlot1(promoted);
          if (promoted) engine.setState(prev => ({ ...prev, equipmentSlot1Reserve: prev.equipmentSlot1Reserve.slice(1) }));
        } else if (s2?.id === cardId) {
          const reserve = engine.getState().equipmentSlot2Reserve;
          const promoted = reserve.length > 0 ? reserve[0] : null;
          setEquipmentSlot2(promoted);
          if (promoted) engine.setState(prev => ({ ...prev, equipmentSlot2Reserve: prev.equipmentSlot2Reserve.slice(1) }));
        } else {
          engine.setState(prev => ({
            ...prev,
            equipmentSlot1Reserve: prev.equipmentSlot1Reserve.filter(c => c.id !== cardId),
            equipmentSlot2Reserve: prev.equipmentSlot2Reserve.filter(c => c.id !== cardId),
          }));
        }
      } else if (source === 'amulet') {
        setAmuletSlots(prev => prev.filter(card => card.id !== cardId));
      }

      depsRef.current.cardActionRemainingRef.current = Math.max(0, depsRef.current.cardActionRemainingRef.current - 1);
      const remaining = depsRef.current.cardActionRemainingRef.current;

      if (cardActionContext?.mode === 'event') {
        if (remaining <= 0) {
          setDeleteModalOpen(false);
          setCardActionContext(null);
          const resolver = depsRef.current.cardActionResolverRef.current;
          depsRef.current.cardActionResolverRef.current = null;
          resolver?.();
        } else {
          setCardActionContext(context => (context ? { ...context, remainingCount: remaining } : context));
        }
      } else if (cardActionContext?.mode === 'shop') {
        setShopDeleteUsed(true);
        setDeleteModalOpen(false);
        setCardActionContext(null);
      } else {
        setDeleteModalOpen(false);
      }

      await flightP;

      const kwLabel = kw === 'delete' ? '删除'
        : kw === 'move-to' ? '移到'
        : kw === 'discard-only' ? '弃置'
        : kw === 'recycle-only' ? '回收'
        : '弃回';
      if (cardActionContext?.mode === 'shop') {
        depsRef.current.addGameLog('shop', `商店：删牌「${cardToDelete.name}」`);
      } else if (cardActionContext?.mode === 'event') {
        depsRef.current.addGameLog('event', `事件：${kwLabel}「${cardToDelete.name}」`);
      } else {
        depsRef.current.addGameLog('system', `${kwLabel}卡牌：${cardToDelete.name}`);
      }

      if (kw === 'delete') {
        depsRef.current.addToGraveyard(cardToDelete);
      } else if (kw === 'move-to') {
        if (cardActionContext?.moveToDestination === 'recycle-bag') {
          depsRef.current.addPermanentMagicToRecycleBag(cardToDelete);
        } else {
          depsRef.current.addToGraveyard(cardToDelete);
        }
      } else if (kw === 'recycle-only') {
        depsRef.current.addPermanentMagicToRecycleBag(cardToDelete);
        depsRef.current.applyDiscardSideEffects(cardToDelete, 'player', { toRecycleBag: true });
      } else if (kw === 'discard-only') {
        depsRef.current.addToGraveyard(cardToDelete);
        depsRef.current.applyDiscardSideEffects(cardToDelete, 'player');
      } else {
        depsRef.current.discardCardToGraveyard(cardToDelete, { owner: 'player' });
      }
    },
    [
      backpackItems,
      cardActionContext,
      engine,
      gs.amuletSlots,
      gs.equipmentSlot1,
      gs.equipmentSlot1Reserve,
      gs.equipmentSlot2,
      gs.equipmentSlot2Reserve,
      handCards,
      permanentMagicRecycleBag,
      setAmuletSlots,
      setBackpackItems,
      setEquipmentSlot1,
      setEquipmentSlot2,
      setPermanentMagicRecycleBag,
      setDeleteModalOpen,
      setCardActionContext,
      setShopDeleteUsed,
    ],
  );

  const handleDeleteModalOpenChange = useCallback(
    (open: boolean) => {
      if (
        !open &&
        cardActionContext?.mode === 'event' &&
        (cardActionContext.remainingCount ?? 0) > 0
      ) {
        setHeroSkillBanner('请完成卡牌选择才能继续。');
        return;
      }
      setDeleteModalOpen(open);
      if (!open && cardActionContext?.mode === 'shop') {
        setCardActionContext(null);
      }
    },
    [cardActionContext, setHeroSkillBanner, setDeleteModalOpen, setCardActionContext],
  );

  // -- Monster rewards --------------------------------------------------------

  const queueMonsterReward = useCallback(
    (monster: GameCardData) => {
      const options = depsRef.current.getMonsterRewardsPreview(monster);
      if (!options.length) {
        return;
      }
      const mid = monster.id;
      if (mid && depsRef.current.monsterRewardQueuedInstanceIdsRef.current.has(mid)) {
        return;
      }
      if (mid) {
        depsRef.current.monsterRewardQueuedInstanceIdsRef.current.add(mid);
      }
      setMonsterRewardQueue(prev => [
        ...prev,
        {
          monsterInstanceId: mid,
          monsterName: monster.name ?? '神秘怪物',
          options,
        },
      ]);
    },
    [setMonsterRewardQueue],
  );

  const applyMonsterReward = useCallback(
    async (option: MonsterRewardOption): Promise<boolean> => {
      const eff = option.effect;
      switch (eff.type) {
        case 'slotBonus': {
          const { slotId, bonusType, amount } = eff;
          depsRef.current.setEquipmentSlotBonus(slotId, bonusType, value => value + amount);
          depsRef.current.addGameLog('combat', `战利品：${describeSlotLabel(slotId)}永久 ${describeBonusLabel(bonusType)} +${amount}`);
          setHeroSkillBanner(`${describeSlotLabel(slotId)}永久 ${describeBonusLabel(bonusType)} +${amount}`);
          return true;
        }
        case 'gold': {
          setGold(prev => prev + eff.amount);
          depsRef.current.addGameLog('combat', `战利品：获得 ${eff.amount} 金币`);
          setHeroSkillBanner(`获得 ${eff.amount} 金币。`);
          return true;
        }
        case 'heal': {
          const healed = depsRef.current.healHero(eff.amount);
          depsRef.current.addGameLog('combat', `战利品：回复 ${healed} 点生命`);
          setHeroSkillBanner(healed > 0 ? `回复 ${healed} 点生命。` : '生命已满，治疗溢出。');
          return true;
        }
        case 'repair': {
          depsRef.current.addGameLog('combat', `战利品：修复装备耐久 +${eff.amount}`);
          return depsRef.current.repairEquipmentDurability(eff.amount, eff.targets);
        }
        case 'drawBackpack': {
          const drawn = depsRef.current.drawCardsFromBackpack(eff.amount);
          if (drawn > 0) {
            depsRef.current.addGameLog('combat', `战利品：从背包抽出 ${drawn} 张牌`);
            setHeroSkillBanner(`从背包抽出了 ${drawn} 张牌。`);
            return true;
          }
          setHeroSkillBanner('无法抽牌：背包为空或手牌已满。');
          return false;
        }
        case 'discoverClass': {
          const started = beginDiscoverFlow('monster-reward');
          if (started) {
            depsRef.current.addGameLog('combat', '战利品：发现一张专属牌');
            setHeroSkillBanner('发现了一张专属牌！');
            return true;
          }
          const fallbackSuccess = handleDiscoverFallback();
          if (fallbackSuccess) {
            depsRef.current.addGameLog('combat', '战利品：发现失败，补一张牌');
            setHeroSkillBanner('职业卡不可用，改为补一张。');
            return true;
          }
          setGold(prev => prev + 3);
          depsRef.current.addGameLog('combat', '战利品：发现失败，转化为 3 金币');
          setHeroSkillBanner('职业牌不可用，转化为 3 金币奖励。');
          return true;
        }
        case 'discoverGraveyard': {
          if (discardedCards.length === 0) {
            setGold(prev => prev + 3);
            depsRef.current.addGameLog('combat', '战利品：坟场为空，转化为 3 金币');
            setHeroSkillBanner('坟场为空，转化为 3 金币奖励。');
            return true;
          }
          const selected = await requestGraveyardSelection(3);
          if (selected) {
            depsRef.current.addGameLog('combat', `战利品：从坟场取回「${selected.name}」`);
            setHeroSkillBanner(`从坟场取回了「${selected.name}」！`);
          } else {
            depsRef.current.addGameLog('combat', '战利品：放弃坟场取回');
          }
          return true;
        }
        case 'maxHp': {
          const amount = eff.amount;
          const newMaxHp = depsRef.current.maxHp + amount;
          setPermanentMaxHpBonus(prev => prev + amount);
          setHp(prev => Math.min(newMaxHp, prev));
          depsRef.current.addGameLog('combat', `战利品：最大生命永久 +${amount}`);
          setHeroSkillBanner(`最大生命永久 +${amount}`);
          return true;
        }
        case 'spellDamage': {
          const amount = eff.amount;
          setPermanentSpellDamageBonus(prev => prev + amount);
          depsRef.current.addGameLog('combat', `战利品：法术伤害永久 +${amount}`);
          setHeroSkillBanner(`法术伤害永久 +${amount}`);
          return true;
        }
        case 'spellLifesteal': {
          const amount = eff.amount;
          setPermanentSpellLifesteal(prev => prev + amount);
          depsRef.current.addGameLog('combat', `战利品：超杀吸血永久 +${amount}`);
          setHeroSkillBanner(`超杀吸血永久 +${amount}`);
          return true;
        }
        case 'stunCap': {
          const amount = eff.amount;
          setStunCap(prev => Math.min(100, prev + amount));
          depsRef.current.addGameLog('combat', `战利品：击晕上限 +${amount}%`);
          setHeroSkillBanner(`击晕上限 +${amount}%`);
          return true;
        }
        case 'backpackCapacity': {
          const amount = eff.amount;
          setBackpackCapacityModifier(prev => prev + amount);
          depsRef.current.addGameLog('combat', `战利品：背包上限永久 +${amount}`);
          setHeroSkillBanner(`背包上限永久 +${amount}`);
          return true;
        }
        default:
          return false;
      }
    },
    [
      beginDiscoverFlow,
      discardedCards,
      handleDiscoverFallback,
      requestGraveyardSelection,
      setGold,
      setHeroSkillBanner,
      setHp,
      setPermanentMaxHpBonus,
      setPermanentSpellDamageBonus,
      setPermanentSpellLifesteal,
      setStunCap,
      setBackpackCapacityModifier,
    ],
  );

  const handleMonsterRewardSelection = useCallback(
    async (optionId: string) => {
      depsRef.current.pushUndoSnapshot();
      if (!activeMonsterReward) {
        return;
      }
      const selected = activeMonsterReward.options.find(option => option.id === optionId);
      if (!selected) {
        return;
      }
      depsRef.current.addGameLog(
        'monster',
        `战利品〔${activeMonsterReward.monsterName}〕：选择「${selected.title}」`,
      );
      const resolved = await applyMonsterReward(selected);
      if (!resolved) {
        return;
      }
      const doneId = activeMonsterReward.monsterInstanceId;
      if (doneId) {
        depsRef.current.monsterRewardQueuedInstanceIdsRef.current.delete(doneId);
      }
      setActiveMonsterReward(null);
    },
    [activeMonsterReward, applyMonsterReward, setActiveMonsterReward],
  );

  // ---------------------------------------------------------------------------
  // Return bag
  // ---------------------------------------------------------------------------

  return {
    // Shop offerings / flow
    generateShopOfferings,
    startShopFlow,

    // Discover
    beginDiscoverFlow,
    handleDiscoverFallback,
    handleDiscoverSelect,

    // Shop purchase / close
    handleShopPurchase,
    handleShopClose,

    // Shop services
    handleShopDeleteRequest,
    handleShopHealRequest,
    handleShopLevelUpRequest,

    // Card upgrade
    handleCardUpgrade,

    // Skill discover / select
    handleShopSkillDiscoverRequest,
    handleShopSkillSelect,

    // Graveyard discover
    requestGraveyardSelection,
    handleGraveyardDiscoverSelect,

    // Ghost blade exile
    triggerGhostBladeExile,
    handleGhostBladeExileConfirm,

    // Card action (delete / discard)
    requestCardAction,
    handleDeleteCardConfirm,
    handleDeleteModalOpenChange,

    // Monster rewards
    queueMonsterReward,
    applyMonsterReward,
    handleMonsterRewardSelection,

    // Derived values
    deletableCardCount,
  };
}
