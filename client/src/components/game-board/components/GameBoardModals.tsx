import { memo, useMemo } from 'react';
import { Sword, Swords, Undo2, Wrench } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

import { useShallowGameState, useDispatch } from '@/hooks/useGameEngine';
import { BASE_BACKPACK_CAPACITY, PERSUADE_COST, HAND_LIMIT, INITIAL_HP } from '@/game-core/constants';
import { getHeroSkillById, heroSkills as allHeroSkills } from '@/lib/heroSkills';

import VictoryDefeatModal from '@/components/VictoryDefeatModal';
import DeckViewerModal from '@/components/DeckViewerModal';
import BackpackViewerModal from '@/components/BackpackViewerModal';
import DiscoverClassModal from '@/components/DiscoverClassModal';
import GraveyardExileModal from '@/components/GraveyardExileModal';
import ShopModal from '@/components/ShopModal';
import ShopSkillSelectModal from '@/components/ShopSkillSelectModal';
import CardFlipOverlay from '@/components/CardFlipOverlay';
import CardDeletionModal from '@/components/CardDeletionModal';
import CardUpgradeModal from '@/components/CardUpgradeModal';
import CardDraftModal from '@/components/CardDraftModal';
import CardDetailsModal from '@/components/CardDetailsModal';
import HeroDetailsModal, { type HeroMagicDisplayInfo } from '@/components/HeroDetailsModal';
import MonsterRewardModal from '@/components/MonsterRewardModal';
import MonsterPersuadeModal, { type PersuadePhase } from '@/components/MonsterPersuadeModal';
import EventChoiceModal, { type EventChoiceAvailability } from '@/components/EventChoiceModal';
import EventDiceModal from '@/components/EventDiceModal';
import EquipmentSelectModal from '@/components/EquipmentSelectModal';
import MagicChoiceModal from '@/components/MagicChoiceModal';
import HeroSkillSelection from '@/components/HeroSkillSelection';
import HandMagicUpgradeModal from '@/components/HandMagicUpgradeModal';
import MirrorCopyModal from '@/components/MirrorCopyModal';
import AmplifyModal from '@/components/AmplifyModal';
import PermGrantModal from '@/components/PermGrantModal';

import type { GameCardData } from '@/components/GameCard';
import type { HeroSkillDefinition } from '@/lib/heroSkills';
import type { MagicChoiceModalState, MirrorCopySelection, AmplifySelection } from '@/game-core/types';
import type { RngState } from '@/game-core/rng';

import type {
  EquipmentSlotId,
} from '../types';

import type { CardSource } from '@/components/CardDeletionModal';

type CardDeletionSource = CardSource;

export type GameBoardModalsProps = {
  overlayZoom: number;

  // --- Death Ward ---
  onDeathWardConfirm: () => void;
  onDeathWardDecline: () => void;

  // --- Dagger Self-Destruct ---
  daggerSelfDestructPrompt: { weaponName: string; remainingDurability: number } | null;
  onDaggerSelfDestructConfirm: () => void;
  onDaggerSelfDestructDecline: () => void;

  // --- Wraith passive unlock ---
  wraithPassiveUnlockPopup: boolean;
  onWraithPassiveUnlockChange: (open: boolean) => void;

  // --- Victory / Defeat ---
  gameOverMinimized: boolean;
  onRestart: () => void;
  onGameOverMinimize: () => void;
  stageScale: number;

  // --- Deck viewer ---
  deckViewerOpen: boolean;
  onDeckViewerChange: (open: boolean) => void;
  onCardSelect: (card: GameCardData) => void;

  // --- Backpack viewer ---
  backpackViewerOpen: boolean;
  onBackpackViewerChange: (open: boolean) => void;

  // --- Discover class ---
  onDiscoverSelect: (cardId: string) => void;
  onDiscoverCancel: () => void;

  // --- Graveyard discover ---
  onGraveyardDiscoverSelect: (cardId: string) => void;
  onGraveyardDiscoverCancel: () => void;

  // --- Graveyard exile ---
  onGhostBladeExileConfirm: (selectedIds: string[]) => void;

  // --- Shop ---
  onShopDeleteRequest: () => void;
  onShopPurchase: (cardId: string) => void;
  onShopClose: () => void;
  onShopMinimize: () => void;
  onShopHealRequest: () => void;
  shopHealCost: number;
  shopLevelUpCost: number;
  onShopLevelUpRequest: () => void;
  shopSkillDiscoverCost: number;
  onShopSkillDiscoverRequest: () => void;
  shopEquipBoostCost: number;
  onShopEquipAttackRequest: () => void;
  onShopEquipArmorRequest: () => void;

  // --- Shop skill select ---
  onShopSkillSelect: (skillId: string) => void;

  // --- Card deletion ---
  onDeleteModalChange: (open: boolean) => void;
  onDeleteCardConfirm: (cardId: string, source: CardDeletionSource) => void;
  onBatchDeleteConfirm?: (selections: Array<{ cardId: string; source: CardDeletionSource }>) => void;

  // --- Card details ---
  selectedCard: GameCardData | null;
  detailsModalOpen: boolean;
  onDetailsModalChange: (open: boolean) => void;

  // --- Hero details ---
  heroDetailsOpen: boolean;
  onHeroDetailsChange: (open: boolean) => void;
  heroMagicInfo?: HeroMagicDisplayInfo[];

  // --- Monster reward ---
  onMonsterRewardSelect: (optionId: string) => void;

  // --- Monster persuade ---
  persuadeRollKey: number;
  onPersuadeConfirm: () => void;
  onPersuadeDiceResult: (value: number) => void;
  onPersuadeClose: () => void;

  // --- Card upgrade ---
  onUpgradeModalChange: (open: boolean) => void;
  onCardUpgrade: (cardId: string) => void;

  // --- Event choice ---
  onEventChoice: (choiceIndex: number) => void;
  eventChoiceStates: EventChoiceAvailability[];
  onEventMinimize: () => void;

  // --- Event dice ---
  eventDiceRollKey: number;
  onDiceRollResult: (value: number) => void;
  onDiceModalClose: () => void;

  // --- Magic choice ---
  onMagicChoice: (choiceId: string) => void;

  // --- Equipment select ---
  onEquipmentPromptSelect: (slotId: EquipmentSlotId) => void;
  onEquipmentPromptCancel: () => void;

  // --- Hero magic choice prompt ---
  onCancelHeroMagicAction: () => void;
  onHeroMagicChoice: (choice: 'heal' | 'purge') => void;

  // --- Potion choice dialog ---
  onCancelPotionAction: () => void;
  onPotionChoiceSelection: (choice: 'repair' | 'upgrade') => void;

  // --- Hero skill selection ---
  onSkillSelection: (skillId: string) => void;

  // --- Card draft ---
  onCardDraftComplete: (selectedCards: GameCardData[]) => void;

  // --- End Hero Turn button ---
  headerHeight: number;
  endHeroTurnDisabled: boolean;
  onEndHeroTurn: () => void;

  // --- Hand magic upgrade ---
  onHandMagicUpgradeSelect: (cardIds: string[]) => void;
  onHandMagicUpgradeClose: () => void;

  // --- Mirror copy ---
  onMirrorCopyConfirm: (selection: MirrorCopySelection) => void;
  onMirrorCopyCancel: () => void;

  // --- Amplify ---
  onAmplifyConfirm: (selection: AmplifySelection) => void;
  onAmplifyCancel: () => void;

  // --- Perm grant ---
  onPermGrantConfirm: (cardId: string) => void;
  onPermGrantCancel: () => void;

  // --- Undo button ---
  fullBoardInteractionLocked: boolean;
  onUndo: () => void;
};

function GameBoardModalsInner({
  overlayZoom,

  onDeathWardConfirm,
  onDeathWardDecline,
  daggerSelfDestructPrompt,
  onDaggerSelfDestructConfirm,
  onDaggerSelfDestructDecline,

  wraithPassiveUnlockPopup,
  onWraithPassiveUnlockChange,

  gameOverMinimized,
  onRestart,
  onGameOverMinimize,
  stageScale,

  deckViewerOpen,
  onDeckViewerChange,
  onCardSelect,

  backpackViewerOpen,
  onBackpackViewerChange,

  onDiscoverSelect,
  onDiscoverCancel,

  onGraveyardDiscoverSelect,
  onGraveyardDiscoverCancel,

  onGhostBladeExileConfirm,

  onShopDeleteRequest,
  onShopPurchase,
  onShopClose,
  onShopMinimize,
  onShopHealRequest,
  shopHealCost,
  shopLevelUpCost,
  onShopLevelUpRequest,
  shopSkillDiscoverCost,
  onShopSkillDiscoverRequest,
  shopEquipBoostCost,
  onShopEquipAttackRequest,
  onShopEquipArmorRequest,

  onShopSkillSelect,

  onDeleteModalChange,
  onDeleteCardConfirm,
  onBatchDeleteConfirm,

  selectedCard,
  detailsModalOpen,
  onDetailsModalChange,

  heroDetailsOpen,
  onHeroDetailsChange,
  heroMagicInfo,

  onMonsterRewardSelect,

  persuadeRollKey,
  onPersuadeConfirm,
  onPersuadeDiceResult,
  onPersuadeClose,

  onUpgradeModalChange,
  onCardUpgrade,

  onEventChoice,
  eventChoiceStates,
  onEventMinimize,

  eventDiceRollKey,
  onDiceRollResult,
  onDiceModalClose,

  onMagicChoice,

  onEquipmentPromptSelect,
  onEquipmentPromptCancel,

  onCancelHeroMagicAction,
  onHeroMagicChoice,

  onCancelPotionAction,
  onPotionChoiceSelection,

  onSkillSelection,

  onCardDraftComplete,

  headerHeight,
  endHeroTurnDisabled,
  onEndHeroTurn,

  onHandMagicUpgradeSelect,
  onHandMagicUpgradeClose,
  onMirrorCopyConfirm,
  onMirrorCopyCancel,
  onAmplifyConfirm,
  onAmplifyCancel,
  onPermGrantConfirm,
  onPermGrantCancel,

  fullBoardInteractionLocked,
  onUndo,
}: GameBoardModalsProps) {
  const _dispatch = useDispatch();
  const _gs = useShallowGameState(s => ({
    deathWardPrompt: s.deathWardPrompt,
    gameOver: s.gameOver,
    victory: s.victory,
    gold: s.gold,
    hp: s.hp,
    remainingDeck: s.remainingDeck,
    backpackItems: s.backpackItems,
    permanentMagicRecycleBag: s.permanentMagicRecycleBag,
    discoverModalOpen: s.discoverModalOpen,
    discoverOptions: s.discoverOptions,
    discoverSourceLabel: s.discoverSourceLabel,
    graveyardDiscoverState: s.graveyardDiscoverState,
    ghostBladeExileCards: s.ghostBladeExileCards,
    shopModalOpen: s.shopModalOpen,
    shopModalMinimized: s.shopModalMinimized,
    shopOfferings: s.shopOfferings,
    shopLevel: s.shopLevel,
    shopSourceEvent: s.shopSourceEvent,
    shopHealUsed: s.shopHealUsed,
    shopLevelUpUsed: s.shopLevelUpUsed,
    shopSkillDiscoverUsed: s.shopSkillDiscoverUsed,
    shopEquipAttackUsed: s.shopEquipAttackUsed,
    shopEquipArmorUsed: s.shopEquipArmorUsed,
    shopSkillSelectOpen: s.shopSkillSelectOpen,
    shopSkillOptions: s.shopSkillOptions,
    eventTransformState: s.eventTransformState,
    deleteModalOpen: s.deleteModalOpen,
    handCards: s.handCards,
    cardActionContext: s.cardActionContext,
    heroVariant: s.heroVariant,
    permanentSkills: s.permanentSkills,
    activeMonsterReward: s.activeMonsterReward,
    persuadeState: s.persuadeState,
    persuadeLevel: s.persuadeLevel,
    upgradeModalOpen: s.upgradeModalOpen,
    upgradeModalMaxCount: s.upgradeModalMaxCount,
    equipmentSlot1: s.equipmentSlot1,
    equipmentSlot2: s.equipmentSlot2,
    amuletSlots: s.amuletSlots,
    eventModalOpen: s.eventModalOpen,
    eventModalMinimized: s.eventModalMinimized,
    currentEventCard: s.currentEventCard,
    eventDiceModal: s.eventDiceModal,
    magicChoiceModal: s.magicChoiceModal,
    equipmentPrompt: s.equipmentPrompt,
    showSkillSelection: s.showSkillSelection,
    showCardDraft: s.showCardDraft,
    cardDraftPool: s.cardDraftPool,
    undoCount: s.undoCount,
    monstersDefeated: s.monstersDefeated,
    totalDamageTaken: s.totalDamageTaken,
    totalHealed: s.totalHealed,
    turnCount: s.turnCount,
    gameMode: s.gameMode,
    combatState: s.combatState,
    backpackCapacityModifier: s.backpackCapacityModifier,
    pendingHeroMagicAction: s.pendingHeroMagicAction,
    pendingPotionAction: s.pendingPotionAction,
    handMagicUpgradeModal: s.handMagicUpgradeModal,
    mirrorCopyModal: s.mirrorCopyModal,
    amplifyModal: s.amplifyModal,
    permGrantModal: s.permGrantModal,
    shopDeleteUsed: s.shopDeleteUsed,
    equipmentSlot1Reserve: s.equipmentSlot1Reserve,
    equipmentSlot2Reserve: s.equipmentSlot2Reserve,
    persuadeCostModifier: s.persuadeCostModifier,
    persuadeDiscount: s.persuadeDiscount,
    persuadeSameTargetCostHalve: s.persuadeSameTargetCostHalve,
    lastPersuadeTargetId: s.lastPersuadeTargetId,
    handLimitBonus: s.handLimitBonus,
    maxAmuletSlots: s.maxAmuletSlots,
    equipmentSlotCapacity: s.equipmentSlotCapacity,
    rng: s.rng,
    selectedHeroSkill: s.selectedHeroSkill,
    extraHeroSkills: s.extraHeroSkills,
    selectedMonsterRewards: s.selectedMonsterRewards,
    tempShield: s.tempShield,
    weaponMasterBonus: s.weaponMasterBonus,
    shieldMasterBonus: s.shieldMasterBonus,
    defensiveStanceActive: s.defensiveStanceActive,
    bulwarkPassiveActive: s.bulwarkPassiveActive,
    bulwarkTempArmorStacks: s.bulwarkTempArmorStacks,
    eternalRelics: s.eternalRelics,
    permanentMaxHpBonus: s.permanentMaxHpBonus,
    permanentSpellDamageBonus: s.permanentSpellDamageBonus,
    permanentSpellLifesteal: s.permanentSpellLifesteal,
    stunCap: s.stunCap,
  }));

  const { deathWardPrompt, gameOver, victory, gold, hp, remainingDeck, backpackItems, permanentMagicRecycleBag,
    discoverModalOpen, discoverOptions, discoverSourceLabel, graveyardDiscoverState, ghostBladeExileCards,
    shopModalOpen, shopModalMinimized, shopOfferings, shopLevel, shopSourceEvent: shopSourceEventCard,
    shopHealUsed, shopLevelUpUsed, shopSkillDiscoverUsed, shopEquipAttackUsed, shopEquipArmorUsed,
    shopSkillSelectOpen, shopSkillOptions, eventTransformState,
    deleteModalOpen, handCards, cardActionContext, heroVariant, permanentSkills,
    activeMonsterReward, persuadeState, persuadeLevel,
    upgradeModalOpen, upgradeModalMaxCount, equipmentSlot1, equipmentSlot2, amuletSlots,
    eventModalOpen, eventModalMinimized, currentEventCard, eventDiceModal, magicChoiceModal, equipmentPrompt,
    showSkillSelection, showCardDraft, cardDraftPool, undoCount,
    monstersDefeated, totalDamageTaken, totalHealed,
    turnCount, gameMode, combatState, backpackCapacityModifier,
    pendingHeroMagicAction, pendingPotionAction,
    handMagicUpgradeModal, mirrorCopyModal, amplifyModal, permGrantModal,
    shopDeleteUsed, equipmentSlot1Reserve, equipmentSlot2Reserve,
    persuadeCostModifier, persuadeDiscount, persuadeSameTargetCostHalve, lastPersuadeTargetId,
    handLimitBonus, maxAmuletSlots, equipmentSlotCapacity,
    rng,
    selectedHeroSkill, extraHeroSkills, selectedMonsterRewards,
    tempShield, weaponMasterBonus, shieldMasterBonus, defensiveStanceActive,
    bulwarkPassiveActive, bulwarkTempArmorStacks, eternalRelics,
    permanentMaxHpBonus, permanentSpellDamageBonus, permanentSpellLifesteal, stunCap,
  } = _gs;

  const currentTurn = turnCount;
  const isQuickMode = gameMode === 'quick';
  const shopSourceEvent = shopSourceEventCard?.name ?? undefined;
  const backpackCapacity = Math.max(1, BASE_BACKPACK_CAPACITY + backpackCapacityModifier);
  const persuadeOpen = Boolean(persuadeState);
  const persuadeMonster = persuadeState?.monster ?? null;
  const persuadeThreshold = persuadeState?.threshold ?? 0;
  const persuadeSuccessRate = persuadeState?.successRate ?? 0;
  const persuadeTargetLabel = persuadeState ? '背包' : '';
  const persuadePhase: PersuadePhase = (persuadeState?.phase as PersuadePhase) ?? 'confirm';
  const persuadeDiceValue = persuadeState?.diceValue ?? null;
  const persuadeSuccess = persuadeState?.success ?? null;
  const heroMagicChoicePrompt = pendingHeroMagicAction?.step === 'choice'
    ? { id: pendingHeroMagicAction.id, prompt: pendingHeroMagicAction.prompt ?? '' }
    : null;
  const potionChoiceDialogOpen = Boolean(pendingPotionAction?.step === 'choice');
  const isCombatPanelVisible = combatState.engagedMonsterIds.length > 0;
  const combatCurrentTurn = combatState.currentTurn;

  const flatEquipmentCards: GameCardData[] = ([equipmentSlot1, ...equipmentSlot1Reserve, equipmentSlot2, ...equipmentSlot2Reserve] as (GameCardData | null)[])
    .filter(Boolean) as GameCardData[];
  const flatAmuletCards: GameCardData[] = amuletSlots;
  const deletableCardCount = handCards.length + backpackItems.length + permanentMagicRecycleBag.length
    + flatEquipmentCards.length + flatAmuletCards.length;
  const _canDeleteCardInShop = !shopDeleteUsed && deletableCardCount > 0;
  const _shopDeleteDisabledReason = shopDeleteUsed
    ? '本次商店已使用过删除'
    : deletableCardCount === 0 ? '没有可以删除的卡牌' : undefined;

  const _persuadeCost = (() => {
    let c = Math.max(0, PERSUADE_COST + persuadeCostModifier - (persuadeDiscount?.costReduction ?? 0));
    if (persuadeState?.monster && persuadeSameTargetCostHalve && lastPersuadeTargetId === persuadeState.monster.id) {
      c = Math.floor(c / 2);
    }
    return c;
  })();

  const handleRngUpdate = (nextRng: RngState) => {
    _dispatch({ type: 'SET_GAME_FLAGS', patch: { rng: nextRng } });
  };

  const _heroCapacityLimits = {
    hand: HAND_LIMIT + handLimitBonus,
    backpack: backpackCapacity,
    amuletSlots: maxAmuletSlots,
    equipmentSlotLeft: equipmentSlotCapacity.equipmentSlot1 ?? 1,
    equipmentSlotRight: equipmentSlotCapacity.equipmentSlot2 ?? 1,
  };

  const _aura = useMemo(() => {
    let attack = 0, defense = 0, mHp = 0;
    for (const slot of amuletSlots) {
      if (!slot) continue;
      if (slot.amuletAuraBonus) {
        attack += slot.amuletAuraBonus.attack ?? 0;
        defense += slot.amuletAuraBonus.defense ?? 0;
        mHp += slot.amuletAuraBonus.maxHp ?? 0;
      }
      if (typeof slot.value === 'number' && slot.effect) {
        if (slot.effect === 'attack' && !(slot.amuletAuraBonus && typeof slot.amuletAuraBonus.attack === 'number')) attack += slot.value;
        if (slot.effect === 'defense' && !(slot.amuletAuraBonus && typeof slot.amuletAuraBonus.defense === 'number')) defense += slot.value;
        if (slot.effect === 'health' && !(slot.amuletAuraBonus && typeof slot.amuletAuraBonus.maxHp === 'number')) mHp += slot.value;
      }
    }
    for (const relic of eternalRelics) {
      if (relic.amuletAuraBonus) {
        attack += relic.amuletAuraBonus.attack ?? 0;
        defense += relic.amuletAuraBonus.defense ?? 0;
        mHp += relic.amuletAuraBonus.maxHp ?? 0;
      }
    }
    return { attack, defense, maxHp: mHp };
  }, [amuletSlots, eternalRelics]);

  const _selectedHeroSkillDef = useMemo(
    () => getHeroSkillById(selectedHeroSkill),
    [selectedHeroSkill],
  );

  const _eternalMaxHpBonus = useMemo(
    () => eternalRelics.reduce((sum, r) => sum + (r.initialMaxHpBonus ?? 0), 0),
    [eternalRelics],
  );

  const _maxHp = INITIAL_HP + _aura.maxHp + permanentMaxHpBonus +
    (permanentSkills.includes('Iron Will') ? 3 : 0) +
    (_selectedHeroSkillDef?.initialMaxHpBonus ?? 0) +
    _eternalMaxHpBonus;

  const _attackBonus = _aura.attack +
    (permanentSkills.includes('Weapon Master') ? 1 : 0) +
    weaponMasterBonus +
    (permanentSkills.includes('Berserker Rage') ? Math.floor((_maxHp - hp) / 2) : 0) +
    (permanentSkills.includes('Battle Frenzy') && hp < _maxHp / 2 ? 2 : 0);

  const _defenseBonus = _aura.defense +
    (permanentSkills.includes('Iron Skin') ? 1 : 0) +
    shieldMasterBonus +
    (defensiveStanceActive ? 1 : 0);

  const _heroDetailsStats = useMemo(() => ({
    hp,
    maxHp: _maxHp,
    gold,
    attackBonus: _attackBonus,
    defenseBonus: _defenseBonus,
    spellDamageBonus: permanentSpellDamageBonus,
    spellLifesteal: permanentSpellLifesteal,
    tempShield,
    permanentMaxHpBonus,
    stunCap,
  }), [hp, _maxHp, gold, _attackBonus, _defenseBonus, permanentSpellDamageBonus, permanentSpellLifesteal, tempShield, permanentMaxHpBonus, stunCap]);

  const _heroDetailsSkills = useMemo(() => {
    const skills: import('@/lib/heroSkills').HeroSkillDefinition[] = [];
    if (_selectedHeroSkillDef) skills.push(_selectedHeroSkillDef);
    for (const id of extraHeroSkills) {
      const def = getHeroSkillById(id);
      if (def) skills.push(def);
    }
    return skills;
  }, [_selectedHeroSkillDef, extraHeroSkills]);

  const _permanentSkillStacks = useMemo(() => ({
    '潮涌铸甲': bulwarkPassiveActive + bulwarkTempArmorStacks,
    '潮涌铸甲·瀑流': bulwarkPassiveActive,
    '潮涌铸甲·格挡': bulwarkTempArmorStacks,
  }), [bulwarkPassiveActive, bulwarkTempArmorStacks]);

  const _monsterRewardPreview = useMemo(() => {
    if (selectedCard?.type !== 'monster' || !selectedMonsterRewards?.length) return null;
    return selectedMonsterRewards.map(option => ({
      id: option.id,
      title: option.title,
      description: option.description,
      detail: option.detail,
    }));
  }, [selectedCard, selectedMonsterRewards]);

  const _canDiscoverSkill = useMemo(() => {
    const ownedCount = (selectedHeroSkill ? 1 : 0) + extraHeroSkills.length;
    return allHeroSkills.length - ownedCount >= 3;
  }, [selectedHeroSkill, extraHeroSkills.length]);

  const _discoverSkillDisabledReason = useMemo(() => {
    const ownedCount = (selectedHeroSkill ? 1 : 0) + extraHeroSkills.length;
    return allHeroSkills.length - ownedCount < 3
      ? '已学习太多技能，没有足够的未学技能可供选择。'
      : undefined;
  }, [selectedHeroSkill, extraHeroSkills.length]);

  return (
    <>
      {deathWardPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" style={{ pointerEvents: 'auto' }}>
          <div className="w-full max-w-2xl space-y-6 rounded-lg bg-card p-10 text-center shadow-2xl max-h-[95vh] overflow-y-auto" style={{ zoom: overlayZoom }}>
            <div className="space-y-1">
              <p className="text-lg font-semibold">命悬一线</p>
              <p className="text-sm text-muted-foreground">
                正在受到 {deathWardPrompt.pendingDamage} 点致命伤害，是否打出{' '}
                {deathWardPrompt.card.name}？
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
                onClick={onDeathWardConfirm}
              >
                抵消伤害
              </button>
              <button
                className="rounded-md border border-border px-4 py-2"
                onClick={onDeathWardDecline}
              >
                放弃
              </button>
            </div>
          </div>
        </div>
      )}

      {daggerSelfDestructPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" style={{ pointerEvents: 'auto' }}>
          <div className="w-full max-w-2xl space-y-6 rounded-lg bg-card p-10 text-center shadow-2xl max-h-[95vh] overflow-y-auto" style={{ zoom: overlayZoom }}>
            <div className="space-y-1">
              <p className="text-lg font-semibold">自毁</p>
              <p className="text-sm text-muted-foreground">
                是否自毁 {daggerSelfDestructPrompt.weaponName}？毁坏后将发现{' '}
                {daggerSelfDestructPrompt.remainingDurability} 张专属牌。
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                onClick={onDaggerSelfDestructConfirm}
              >
                自毁（发现 {daggerSelfDestructPrompt.remainingDurability} 张）
              </button>
              <button
                className="rounded-md border border-border px-4 py-2"
                onClick={onDaggerSelfDestructDecline}
              >
                保留武器
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={wraithPassiveUnlockPopup} onOpenChange={onWraithPassiveUnlockChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-serif text-purple-300">永恒护符·幽魂净化</DialogTitle>
            <DialogDescription className="sr-only">永恒护符解锁</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              所有幽魂已被消灭！你获得了一个新的永恒护符：
            </p>
            <div className="rounded-xl border border-purple-500/40 bg-purple-500/10 p-4">
              <div className="text-lg font-semibold text-purple-300">永恒护符·幽魂净化</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                每当背包空了，将回收袋洗回背包（没有使用上限）。
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              className="rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 transition-colors"
              onClick={() => onWraithPassiveUnlockChange(false)}
            >
              知道了
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <VictoryDefeatModal
        open={gameOver && !gameOverMinimized}
        isVictory={victory}
        gold={gold}
        hpRemaining={hp}
        onRestart={onRestart}
        onMinimize={onGameOverMinimize}
        monstersDefeated={monstersDefeated}
        damageTaken={totalDamageTaken}
        totalHealed={totalHealed}
        scaleMultiplier={stageScale}
      />
      
      <DeckViewerModal
        open={deckViewerOpen}
        onOpenChange={onDeckViewerChange}
        remainingCards={remainingDeck}
        onCardSelect={onCardSelect}
      />

      <BackpackViewerModal
        open={backpackViewerOpen}
        onOpenChange={onBackpackViewerChange}
        cards={backpackItems}
        capacity={backpackCapacity}
        recycleCards={permanentMagicRecycleBag}
        onCardSelect={onCardSelect}
      />

      <DiscoverClassModal
        open={discoverModalOpen}
        cards={discoverOptions}
        onSelect={onDiscoverSelect}
        onCancel={onDiscoverCancel}
        description={
          discoverSourceLabel
            ? `来自「${discoverSourceLabel}」的效果 — 从三张候选卡中挑选一张，其余卡牌会放回 Class Deck。`
            : undefined
        }
      />

      <DiscoverClassModal
        open={Boolean(graveyardDiscoverState)}
        cards={graveyardDiscoverState ?? []}
        onSelect={onGraveyardDiscoverSelect}
        onCancel={onGraveyardDiscoverCancel}
        title="坟场召回"
        description="从坟场随机出现的卡牌中选择一张取回。"
      />

      <GraveyardExileModal
        open={Boolean(ghostBladeExileCards)}
        cards={ghostBladeExileCards ?? []}
        onConfirm={onGhostBladeExileConfirm}
      />

      <ShopModal
        open={shopModalOpen && !shopModalMinimized}
        offerings={shopOfferings}
        gold={gold}
        backpackCount={backpackItems.length}
        backpackCapacity={backpackCapacity}
        shopLevel={shopLevel}
        canDeleteCard={_canDeleteCardInShop}
        deleteDisabledReason={_shopDeleteDisabledReason}
        onDeleteRequest={onShopDeleteRequest}
        onBuy={onShopPurchase}
        onFinish={onShopClose}
        onMinimize={onShopMinimize}
        sourceEventName={shopSourceEvent}
        hp={hp}
        maxHp={_maxHp}
        healCost={shopHealCost}
        shopHealUsed={shopHealUsed}
        onHealRequest={onShopHealRequest}
        shopLevelUpCost={shopLevelUpCost}
        shopLevelUpUsed={shopLevelUpUsed}
        onShopLevelUpRequest={onShopLevelUpRequest}
        shopSkillDiscoverCost={shopSkillDiscoverCost}
        shopSkillDiscoverUsed={shopSkillDiscoverUsed}
        canDiscoverSkill={_canDiscoverSkill}
        discoverSkillDisabledReason={_discoverSkillDisabledReason}
        onShopSkillDiscoverRequest={onShopSkillDiscoverRequest}
        shopEquipBoostCost={shopEquipBoostCost}
        shopEquipAttackUsed={shopEquipAttackUsed}
        shopEquipArmorUsed={shopEquipArmorUsed}
        onShopEquipAttackRequest={onShopEquipAttackRequest}
        onShopEquipArmorRequest={onShopEquipArmorRequest}
      />

      <ShopSkillSelectModal
        open={shopSkillSelectOpen}
        options={shopSkillOptions}
        onSelect={onShopSkillSelect}
      />

      {eventTransformState && <CardFlipOverlay state={eventTransformState} />}

      <CardDeletionModal
        open={deleteModalOpen}
        onOpenChange={onDeleteModalChange}
        handCards={handCards}
        backpackCards={backpackItems}
        recycleBagCards={permanentMagicRecycleBag}
        equipmentCards={flatEquipmentCards}
        amuletCards={flatAmuletCards}
        keyword={cardActionContext?.keyword}
        onDeleteCard={onDeleteCardConfirm}
        title={cardActionContext?.title}
        description={cardActionContext?.description}
        requiredCount={cardActionContext?.requiredCount}
        remainingCount={cardActionContext?.remainingCount}
        handOnly={cardActionContext?.handOnly}
        selectionMode={cardActionContext?.selectionMode}
        maxCount={cardActionContext?.maxCount}
        onBatchConfirm={onBatchDeleteConfirm}
      />

      <CardDetailsModal 
        card={selectedCard}
        open={detailsModalOpen}
        onOpenChange={onDetailsModalChange}
        currentTurn={currentTurn}
        monsterRewards={_monsterRewardPreview ?? undefined}
        isQuickMode={isQuickMode}
      />

      <HeroDetailsModal
        open={heroDetailsOpen}
        onOpenChange={onHeroDetailsChange}
        heroVariant={heroVariant}
        stats={_heroDetailsStats}
        heroSkills={_heroDetailsSkills}
        permanentSkills={permanentSkills}
        permanentSkillStacks={_permanentSkillStacks}
        heroMagicInfo={heroMagicInfo}
        capacityLimits={_heroCapacityLimits}
      />

      {activeMonsterReward && (
        <MonsterRewardModal
          open
          monsterName={activeMonsterReward.monsterName}
          options={activeMonsterReward.options.map(option => ({
            id: option.id,
            title: option.title,
            description: option.description,
            detail: option.detail,
          }))}
          onSelect={onMonsterRewardSelect}
        />
      )}

      <MonsterPersuadeModal
        open={persuadeOpen}
        monster={persuadeMonster}
        gold={gold}
        cost={_persuadeCost}
        threshold={persuadeThreshold}
        successRate={persuadeSuccessRate}
        targetLabel={persuadeTargetLabel}
        phase={persuadePhase}
        diceValue={persuadeDiceValue}
        success={persuadeSuccess}
        autoRollTrigger={persuadeRollKey}
        persuadeLevel={persuadeLevel}
        onConfirm={onPersuadeConfirm}
        onDiceResult={onPersuadeDiceResult}
        onClose={onPersuadeClose}
      />

      <CardUpgradeModal
        open={upgradeModalOpen}
        onOpenChange={onUpgradeModalChange}
        maxUpgrades={upgradeModalMaxCount}
        handCards={handCards}
        backpackItems={backpackItems}
        equipmentSlot1={equipmentSlot1}
        equipmentSlot2={equipmentSlot2}
        amuletSlots={amuletSlots}
        onUpgrade={onCardUpgrade}
      />

      <EventChoiceModal
        open={eventModalOpen && !eventModalMinimized}
        eventCard={currentEventCard}
        onChoice={onEventChoice}
        choiceStates={eventChoiceStates}
        onMinimize={onEventMinimize}
      />

      {eventDiceModal && (
        <EventDiceModal
          open
          title={eventDiceModal.title}
          subtitle={eventDiceModal.subtitle}
          entries={eventDiceModal.entries}
          rolledValue={eventDiceModal.rolledValue}
          resolvedEntryId={eventDiceModal.highlightedId}
          autoRollTrigger={eventDiceRollKey}
          onRollResult={onDiceRollResult}
          onClose={onDiceModalClose}
          predeterminedRoll={eventDiceModal.predeterminedRoll}
        />
      )}


      <MagicChoiceModal
        open={Boolean(magicChoiceModal)}
        state={magicChoiceModal}
        onChoice={onMagicChoice}
      />

      {equipmentPrompt && (
        <EquipmentSelectModal
          open
          prompt={equipmentPrompt.prompt}
          subtext={equipmentPrompt.subtext}
          leftItem={equipmentSlot1}
          rightItem={equipmentSlot2}
          onSelect={onEquipmentPromptSelect}
          onCancel={onEquipmentPromptCancel}
        />
      )}
      
      {heroMagicChoicePrompt && (
        <Dialog open onOpenChange={(open) => { if (!open) onCancelHeroMagicAction(); }}>
          {/*
            英雄魔法分支选择（圣光）：必须选 heal 或 purge，否则 pendingHeroMagicAction 卡住。
            显式关闭路径：选其中一个 option / X（→ onCancelHeroMagicAction 释放 MP）。
          */}
          <DialogContent
            className="sm:max-w-2xl"
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sword className="w-5 h-5 text-amber-500" />
                圣光
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 pt-2">
              <Button
                variant="outline"
                className="h-auto w-full justify-start p-4 text-left"
                onClick={() => onHeroMagicChoice('heal')}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-emerald-600">回满生命</span>
                  <span className="text-xs text-muted-foreground">立即将生命值恢复至上限。</span>
                </div>
              </Button>
              <Button
                variant="outline"
                className="h-auto w-full justify-start p-4 text-left"
                onClick={() => onHeroMagicChoice('purge')}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-sky-600">净化怒气</span>
                  <span className="text-xs text-muted-foreground">选择一个怪物，将其怒气层数清零（血层归 1，生命回满）。</span>
                </div>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {potionChoiceDialogOpen && (
        <Dialog open onOpenChange={(open) => { if (!open) onCancelPotionAction(); }}>
          {/*
            药水分支选择（装备修复剂）：必须选 repair 或 upgrade，否则 pendingPotionAction 卡住。
            显式关闭路径：选其中一个 option / X（→ onCancelPotionAction 取消药水）。
          */}
          <DialogContent
            className="sm:max-w-2xl"
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-emerald-500" />
                装备修复剂
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 pt-2">
              <Button
                variant="outline"
                className="h-auto w-full justify-start p-4 text-left"
                onClick={() => onPotionChoiceSelection('repair')}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">左右装备都恢复 2 点耐久</span>
                  <span className="text-xs text-muted-foreground">所有已装备的武器/盾牌各恢复 2 点耐久。</span>
                </div>
              </Button>
              <Button
                variant="outline"
                className="h-auto w-full justify-start p-4 text-left"
                onClick={() => onPotionChoiceSelection('upgrade')}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">左右装备都耐久上限 +1</span>
                  <span className="text-xs text-muted-foreground">所有已装备的武器/盾牌永久提升耐久上限 +1（不恢复耐久）。</span>
                </div>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <HeroSkillSelection
        isOpen={showSkillSelection}
        onSelectSkill={onSkillSelection}
        rng={rng}
        onRngUpdate={handleRngUpdate}
      />

      {showCardDraft && (
        <CardDraftModal
          isOpen={showCardDraft}
          pool={cardDraftPool}
          totalRounds={6}
          choicesPerRound={3}
          onComplete={onCardDraftComplete}
          roundTypes={['potion','equipment','amulet','general','general','general']}
          rng={rng}
          onRngUpdate={handleRngUpdate}
        />
      )}

      {isCombatPanelVisible && combatCurrentTurn === 'hero' && !gameOver && !showSkillSelection && (
        <div
          className="absolute right-4 z-[9999]"
          style={{
            top: `${headerHeight + 8}px`,
            pointerEvents: 'none',
            transform: `scale(${stageScale})`,
            transformOrigin: 'top right',
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onEndHeroTurn(); }}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={endHeroTurnDisabled}
            style={{ pointerEvents: endHeroTurnDisabled ? 'none' : 'auto' }}
            className={`end-hero-turn-btn flex items-center gap-2 rounded-full px-5 py-2.5 shadow-lg transition-all select-none font-bold ${
              !endHeroTurnDisabled
                ? 'bg-amber-500 text-white hover:bg-amber-600 active:scale-95'
                : 'bg-amber-500/40 text-white/40 cursor-not-allowed'
            }`}
          >
            <Swords className="w-5 h-5" />
            <span className="text-sm">End Hero Turn</span>
          </button>
        </div>
      )}

      <div className="absolute bottom-4 right-4 z-[9999] flex flex-col items-end" style={{ pointerEvents: 'none' }}>
        {!showSkillSelection && (
          <div
            style={{
              pointerEvents: 'none',
              transform: `scale(${stageScale})`,
              transformOrigin: 'bottom right',
            }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); onUndo(); }}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={undoCount === 0 || fullBoardInteractionLocked}
              style={{ pointerEvents: fullBoardInteractionLocked ? 'none' : 'auto' }}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2.5 shadow-lg transition-all select-none ${
                undoCount > 0
                  ? 'bg-slate-700/90 text-white hover:bg-slate-600 active:scale-95'
                  : 'bg-slate-700/40 text-white/40 cursor-not-allowed'
              }`}
            >
              <Undo2 className="w-4 h-4" />
              <span className="text-sm font-medium">撤销</span>
              {undoCount > 0 && (
                <span className="bg-white/20 rounded-full px-1.5 py-0.5 text-xs">{undoCount}</span>
              )}
            </button>
          </div>
        )}
      </div>

      <HandMagicUpgradeModal
        open={Boolean(handMagicUpgradeModal)}
        onClose={onHandMagicUpgradeClose}
        handCards={handCards}
        sourceCardId={handMagicUpgradeModal?.sourceCardId ?? null}
        onUpgrade={onHandMagicUpgradeSelect}
      />

      <MirrorCopyModal
        open={Boolean(mirrorCopyModal)}
        onClose={onMirrorCopyCancel}
        equipmentSlot1={equipmentSlot1}
        equipmentSlot2={equipmentSlot2}
        amuletSlots={amuletSlots}
        handCards={handCards}
        onConfirm={onMirrorCopyConfirm}
      />

      <AmplifyModal
        open={Boolean(amplifyModal)}
        onClose={onAmplifyCancel}
        equipmentSlot1={equipmentSlot1}
        equipmentSlot2={equipmentSlot2}
        handCards={handCards}
        onConfirm={onAmplifyConfirm}
      />

      <PermGrantModal
        open={Boolean(permGrantModal)}
        onClose={onPermGrantCancel}
        handCards={handCards}
        amuletSlots={amuletSlots}
        sourceCardId={permGrantModal?.sourceCardId ?? null}
        sourceType={permGrantModal?.sourceType ?? 'magic'}
        onConfirm={onPermGrantConfirm}
      />
    </>
  );
}

export const GameBoardModals = memo(GameBoardModalsInner);
