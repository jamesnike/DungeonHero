import { memo } from 'react';
import { Sword, Swords, Undo2, Wrench } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

import VictoryDefeatModal from '@/components/VictoryDefeatModal';
import DeckViewerModal from '@/components/DeckViewerModal';
import BackpackViewerModal from '@/components/BackpackViewerModal';
import DiscoverClassModal from '@/components/DiscoverClassModal';
import GraveyardExileModal from '@/components/GraveyardExileModal';
import ShopModal, { type ShopOffering } from '@/components/ShopModal';
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

import type { GameCardData } from '@/components/GameCard';
import type { HeroVariant } from '@/lib/heroes';
import type { HeroSkillDefinition } from '@/lib/heroSkills';
import type { MagicChoiceModalState } from '@/game-core/types';

import type {
  AmuletItem,
  CardActionContext,
  DeathWardPromptState,
  EquipmentItem,
  EquipmentPromptState,
  EquipmentSlotId,
  EventDiceModalState,
  EventTransformState,
  HeroStatsSummary,
  MonsterRewardDrop,
  MonsterRewardPreview,
} from '../types';

import type { CardSource } from '@/components/CardDeletionModal';

type CardDeletionSource = CardSource;

export type GameBoardModalsProps = {
  overlayZoom: number;

  // --- Death Ward ---
  deathWardPrompt: DeathWardPromptState | null;
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
  gameOver: boolean;
  gameOverMinimized: boolean;
  victory: boolean;
  gold: number;
  hp: number;
  maxHp: number;
  onRestart: () => void;
  onGameOverMinimize: () => void;
  monstersDefeated: number;
  totalDamageTaken: number;
  totalHealed: number;
  stageScale: number;

  // --- Deck viewer ---
  deckViewerOpen: boolean;
  onDeckViewerChange: (open: boolean) => void;
  remainingDeck: GameCardData[];
  onCardSelect: (card: GameCardData) => void;

  // --- Backpack viewer ---
  backpackViewerOpen: boolean;
  onBackpackViewerChange: (open: boolean) => void;
  backpackItems: GameCardData[];
  backpackCapacity: number;
  permanentMagicRecycleBag: GameCardData[];

  // --- Discover class ---
  discoverModalOpen: boolean;
  discoverOptions: GameCardData[];
  discoverSourceLabel: string | null;
  onDiscoverSelect: (cardId: string) => void;
  onDiscoverCancel: () => void;

  // --- Graveyard discover ---
  graveyardDiscoverState: GameCardData[] | null;
  onGraveyardDiscoverSelect: (cardId: string) => void;
  onGraveyardDiscoverCancel: () => void;

  // --- Graveyard exile ---
  ghostBladeExileCards: GameCardData[] | null;
  onGhostBladeExileConfirm: (selectedIds: string[]) => void;

  // --- Shop ---
  shopModalOpen: boolean;
  shopModalMinimized: boolean;
  shopOfferings: ShopOffering[];
  shopLevel: number;
  canDeleteCardInShop: boolean;
  shopDeleteDisabledReason?: string;
  onShopDeleteRequest: () => void;
  onShopPurchase: (cardId: string) => void;
  onShopClose: () => void;
  onShopMinimize: () => void;
  shopSourceEvent?: string;
  shopHealUsed: boolean;
  onShopHealRequest: () => void;
  shopHealCost: number;
  shopLevelUpCost: number;
  shopLevelUpUsed: boolean;
  onShopLevelUpRequest: () => void;
  shopSkillDiscoverCost: number;
  shopSkillDiscoverUsed: boolean;
  canDiscoverSkill: boolean;
  discoverSkillDisabledReason?: string;
  onShopSkillDiscoverRequest: () => void;
  shopEquipBoostCost: number;
  shopEquipAttackUsed: boolean;
  shopEquipArmorUsed: boolean;
  onShopEquipAttackRequest: () => void;
  onShopEquipArmorRequest: () => void;

  // --- Shop skill select ---
  shopSkillSelectOpen: boolean;
  shopSkillOptions: HeroSkillDefinition[];
  onShopSkillSelect: (skillId: string) => void;

  // --- Card flip overlay ---
  eventTransformState: EventTransformState | null;

  // --- Card deletion ---
  deleteModalOpen: boolean;
  onDeleteModalChange: (open: boolean) => void;
  handCards: GameCardData[];
  equipmentCards: GameCardData[];
  amuletCards: GameCardData[];
  onDeleteCardConfirm: (cardId: string, source: CardDeletionSource) => void;
  cardActionContext: CardActionContext | null;

  // --- Card details ---
  selectedCard: GameCardData | null;
  detailsModalOpen: boolean;
  onDetailsModalChange: (open: boolean) => void;
  currentTurn: number;
  isQuickMode?: boolean;
  monsterRewardPreviewForModal: MonsterRewardPreview[] | null;

  // --- Hero details ---
  heroDetailsOpen: boolean;
  onHeroDetailsChange: (open: boolean) => void;
  heroVariant: HeroVariant;
  heroDetailsStats: HeroStatsSummary;
  heroDetailsSkills: HeroSkillDefinition[];
  permanentSkills: string[];
  permanentSkillStacks: Record<string, number>;
  heroMagicInfo?: HeroMagicDisplayInfo[];
  heroCapacityLimits: {
    hand: number;
    backpack: number;
    amuletSlots: number;
    equipmentSlotLeft: number;
    equipmentSlotRight: number;
  };

  // --- Monster reward ---
  activeMonsterReward: MonsterRewardDrop | null;
  onMonsterRewardSelect: (optionId: string) => void;

  // --- Monster persuade ---
  persuadeOpen: boolean;
  persuadeMonster: GameCardData | null;
  persuadeCost: number;
  persuadeThreshold: number;
  persuadeSuccessRate: number;
  persuadeTargetLabel: string;
  persuadePhase: PersuadePhase;
  persuadeDiceValue: number | null;
  persuadeSuccess: boolean | null;
  persuadeRollKey: number;
  persuadeLevel: number;
  onPersuadeConfirm: () => void;
  onPersuadeDiceResult: (value: number) => void;
  onPersuadeClose: () => void;

  // --- Card upgrade ---
  upgradeModalOpen: boolean;
  upgradeModalMaxCount?: number;
  onUpgradeModalChange: (open: boolean) => void;
  equipmentSlot1: EquipmentItem | null;
  equipmentSlot2: EquipmentItem | null;
  amuletSlots: AmuletItem[];
  onCardUpgrade: (cardId: string) => void;

  // --- Event choice ---
  eventModalOpen: boolean;
  eventModalMinimized: boolean;
  currentEventCard: GameCardData | null;
  onEventChoice: (choiceIndex: number) => void;
  eventChoiceStates: EventChoiceAvailability[];
  onEventMinimize: () => void;

  // --- Event dice ---
  eventDiceModal: EventDiceModalState | null;
  eventDiceRollKey: number;
  onDiceRollResult: (value: number) => void;
  onDiceModalClose: () => void;

  // --- Magic choice ---
  magicChoiceModal: MagicChoiceModalState | null;
  onMagicChoice: (choiceId: string) => void;

  // --- Equipment select ---
  equipmentPrompt: EquipmentPromptState | null;
  onEquipmentPromptSelect: (slotId: EquipmentSlotId) => void;
  onEquipmentPromptCancel: () => void;

  // --- Hero magic choice prompt ---
  heroMagicChoicePrompt: { id: string; prompt: string } | null;
  onCancelHeroMagicAction: () => void;
  onHeroMagicChoice: (choice: 'heal' | 'purge') => void;

  // --- Potion choice dialog ---
  potionChoiceDialogOpen: boolean;
  onCancelPotionAction: () => void;
  onPotionChoiceSelection: (choice: 'repair' | 'upgrade') => void;

  // --- Hero skill selection ---
  showSkillSelection: boolean;
  onSkillSelection: (skillId: string) => void;

  // --- Card draft ---
  showCardDraft: boolean;
  cardDraftPool: GameCardData[];
  onCardDraftComplete: (selectedCards: GameCardData[]) => void;

  // --- Class card preview ---
  classCardPreview: GameCardData | null;

  // --- End Hero Turn button ---
  isCombatPanelVisible: boolean;
  combatCurrentTurn: 'hero' | 'monster';
  headerHeight: number;
  endHeroTurnDisabled: boolean;
  onEndHeroTurn: () => void;

  // --- Undo button ---
  undoCount: number;
  fullBoardInteractionLocked: boolean;
  onUndo: () => void;
};

function GameBoardModalsInner({
  overlayZoom,

  deathWardPrompt,
  onDeathWardConfirm,
  onDeathWardDecline,
  daggerSelfDestructPrompt,
  onDaggerSelfDestructConfirm,
  onDaggerSelfDestructDecline,

  wraithPassiveUnlockPopup,
  onWraithPassiveUnlockChange,

  gameOver,
  gameOverMinimized,
  victory,
  gold,
  hp,
  maxHp,
  onRestart,
  onGameOverMinimize,
  monstersDefeated,
  totalDamageTaken,
  totalHealed,
  stageScale,

  deckViewerOpen,
  onDeckViewerChange,
  remainingDeck,
  onCardSelect,

  backpackViewerOpen,
  onBackpackViewerChange,
  backpackItems,
  backpackCapacity,
  permanentMagicRecycleBag,

  discoverModalOpen,
  discoverOptions,
  discoverSourceLabel,
  onDiscoverSelect,
  onDiscoverCancel,

  graveyardDiscoverState,
  onGraveyardDiscoverSelect,
  onGraveyardDiscoverCancel,

  ghostBladeExileCards,
  onGhostBladeExileConfirm,

  shopModalOpen,
  shopModalMinimized,
  shopOfferings,
  shopLevel,
  canDeleteCardInShop,
  shopDeleteDisabledReason,
  onShopDeleteRequest,
  onShopPurchase,
  onShopClose,
  onShopMinimize,
  shopSourceEvent,
  shopHealUsed,
  onShopHealRequest,
  shopHealCost,
  shopLevelUpCost,
  shopLevelUpUsed,
  onShopLevelUpRequest,
  shopSkillDiscoverCost,
  shopSkillDiscoverUsed,
  canDiscoverSkill,
  discoverSkillDisabledReason,
  onShopSkillDiscoverRequest,
  shopEquipBoostCost,
  shopEquipAttackUsed,
  shopEquipArmorUsed,
  onShopEquipAttackRequest,
  onShopEquipArmorRequest,

  shopSkillSelectOpen,
  shopSkillOptions,
  onShopSkillSelect,

  eventTransformState,

  deleteModalOpen,
  onDeleteModalChange,
  handCards,
  equipmentCards,
  amuletCards,
  onDeleteCardConfirm,
  cardActionContext,

  selectedCard,
  detailsModalOpen,
  onDetailsModalChange,
  currentTurn,
  isQuickMode,
  monsterRewardPreviewForModal,

  heroDetailsOpen,
  onHeroDetailsChange,
  heroVariant,
  heroDetailsStats,
  heroDetailsSkills,
  permanentSkills,
  permanentSkillStacks,
  heroMagicInfo,
  heroCapacityLimits,

  activeMonsterReward,
  onMonsterRewardSelect,

  persuadeOpen,
  persuadeMonster,
  persuadeCost,
  persuadeThreshold,
  persuadeSuccessRate,
  persuadeTargetLabel,
  persuadePhase,
  persuadeDiceValue,
  persuadeSuccess,
  persuadeRollKey,
  persuadeLevel,
  onPersuadeConfirm,
  onPersuadeDiceResult,
  onPersuadeClose,

  upgradeModalOpen,
  upgradeModalMaxCount,
  onUpgradeModalChange,
  equipmentSlot1,
  equipmentSlot2,
  amuletSlots,
  onCardUpgrade,

  eventModalOpen,
  eventModalMinimized,
  currentEventCard,
  onEventChoice,
  eventChoiceStates,
  onEventMinimize,

  eventDiceModal,
  eventDiceRollKey,
  onDiceRollResult,
  onDiceModalClose,

  magicChoiceModal,
  onMagicChoice,

  equipmentPrompt,
  onEquipmentPromptSelect,
  onEquipmentPromptCancel,

  heroMagicChoicePrompt,
  onCancelHeroMagicAction,
  onHeroMagicChoice,

  potionChoiceDialogOpen,
  onCancelPotionAction,
  onPotionChoiceSelection,

  showSkillSelection,
  onSkillSelection,

  showCardDraft,
  cardDraftPool,
  onCardDraftComplete,

  classCardPreview,

  isCombatPanelVisible,
  combatCurrentTurn,
  headerHeight,
  endHeroTurnDisabled,
  onEndHeroTurn,

  undoCount,
  fullBoardInteractionLocked,
  onUndo,
}: GameBoardModalsProps) {
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
        canDeleteCard={canDeleteCardInShop}
        deleteDisabledReason={shopDeleteDisabledReason}
        onDeleteRequest={onShopDeleteRequest}
        onBuy={onShopPurchase}
        onFinish={onShopClose}
        onMinimize={onShopMinimize}
        sourceEventName={shopSourceEvent}
        hp={hp}
        maxHp={maxHp}
        healCost={shopHealCost}
        shopHealUsed={shopHealUsed}
        onHealRequest={onShopHealRequest}
        shopLevelUpCost={shopLevelUpCost}
        shopLevelUpUsed={shopLevelUpUsed}
        onShopLevelUpRequest={onShopLevelUpRequest}
        shopSkillDiscoverCost={shopSkillDiscoverCost}
        shopSkillDiscoverUsed={shopSkillDiscoverUsed}
        canDiscoverSkill={canDiscoverSkill}
        discoverSkillDisabledReason={discoverSkillDisabledReason}
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
        equipmentCards={equipmentCards}
        amuletCards={amuletCards}
        keyword={cardActionContext?.keyword}
        onDeleteCard={onDeleteCardConfirm}
        title={cardActionContext?.title}
        description={cardActionContext?.description}
        requiredCount={cardActionContext?.requiredCount}
        remainingCount={cardActionContext?.remainingCount}
        handOnly={cardActionContext?.handOnly}
      />

      <CardDetailsModal 
        card={selectedCard}
        open={detailsModalOpen}
        onOpenChange={onDetailsModalChange}
        currentTurn={currentTurn}
        monsterRewards={monsterRewardPreviewForModal ?? undefined}
        isQuickMode={isQuickMode}
      />

      <HeroDetailsModal
        open={heroDetailsOpen}
        onOpenChange={onHeroDetailsChange}
        heroVariant={heroVariant}
        stats={heroDetailsStats}
        heroSkills={heroDetailsSkills}
        permanentSkills={permanentSkills}
        permanentSkillStacks={permanentSkillStacks}
        heroMagicInfo={heroMagicInfo}
        capacityLimits={heroCapacityLimits}
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
        cost={persuadeCost}
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
          <DialogContent className="sm:max-w-2xl">
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
          <DialogContent className="sm:max-w-2xl">
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
        classCardPreview={classCardPreview}
      />

      {showCardDraft && (
        <CardDraftModal
          isOpen={showCardDraft}
          pool={cardDraftPool}
          totalRounds={6}
          choicesPerRound={3}
          onComplete={onCardDraftComplete}
          overlayZoom={overlayZoom}
          classCardPreview={classCardPreview}
          roundTypes={['potion','equipment','amulet','general','general','general']}
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
    </>
  );
}

export const GameBoardModals = memo(GameBoardModalsInner);
