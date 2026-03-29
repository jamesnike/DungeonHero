import DeckViewerModal from '@/components/DeckViewerModal';
import BackpackViewerModal from '@/components/BackpackViewerModal';
import DiscoverClassModal from '@/components/DiscoverClassModal';
import ShopModal, { type ShopOffering } from '@/components/ShopModal';
import CardDeletionModal from '@/components/CardDeletionModal';
import CardDetailsModal from '@/components/CardDetailsModal';
import HeroDetailsModal, { type HeroMagicDisplayInfo } from '@/components/HeroDetailsModal';
import MonsterRewardModal from '@/components/MonsterRewardModal';
import EventChoiceModal, { type EventChoiceAvailability } from '@/components/EventChoiceModal';
import EventDiceModal from '@/components/EventDiceModal';
import EquipmentSelectModal from '@/components/EquipmentSelectModal';
import HeroSkillSelection from '@/components/HeroSkillSelection';
import VictoryDefeatModal from '@/components/VictoryDefeatModal';
import CardFlipOverlay from '@/components/CardFlipOverlay';
import GameCard from '@/components/GameCard';
import type { GameCardData } from '@/components/GameCard';
import type { HeroVariant } from '@/lib/heroes';
import type { HeroSkillDefinition } from '@/lib/heroSkills';

import type {
  CardActionContext,
  DeathWardPromptState,
  EquipmentItem,
  EquipmentPromptState,
  EventDiceModalState,
  EventTransformState,
  MonsterRewardDrop,
  MonsterRewardPreview,
  EquipmentSlotId,
  HeroStatsSummary,
} from '../types';

type DiscoverOption = GameCardData;

type CardDeletionSource = 'hand' | 'backpack';

type GameBoardModalsProps = {
  deathWardPrompt: DeathWardPromptState | null;
  onDeathWardConfirm: () => void;
  onDeathWardDecline: () => void;
  gameOver: boolean;
  victory: boolean;
  gold: number;
  hp: number;
  onRestart: () => void;
  monstersDefeated: number;
  totalDamageTaken: number;
  totalHealed: number;
  deckViewerOpen: boolean;
  onDeckViewerChange: (open: boolean) => void;
  remainingDeck: GameCardData[];
  onCardSelect: (card: GameCardData) => void;
  backpackViewerOpen: boolean;
  onBackpackViewerChange: (open: boolean) => void;
  backpackItems: GameCardData[];
  permanentMagicRecycleBag: GameCardData[];
  discoverModalOpen: boolean;
  discoverOptions: DiscoverOption[];
  onDiscoverSelect: (cardId: string) => void;
  graveyardDiscoverState: GameCardData[] | null;
  onGraveyardDiscoverSelect: (cardId: string) => void;
  shopModalOpen: boolean;
  shopOfferings: ShopOffering[];
  backpackCapacity: number;
  shopLevel: number;
  canDeleteCardInShop: boolean;
  shopDeleteDisabledReason?: string;
  onShopDeleteRequest: () => void;
  onShopPurchase: (cardId: string) => void;
  onShopClose: () => void;
  shopSourceEvent?: string | null;
  eventTransformState: EventTransformState | null;
  deleteModalOpen: boolean;
  onDeleteModalChange: (open: boolean) => void;
  handCards: GameCardData[];
  onDeleteCardConfirm: (cardId: string, source: CardDeletionSource) => void;
  cardActionContext: CardActionContext | null;
  selectedCard: GameCardData | null;
  detailsModalOpen: boolean;
  onDetailsModalChange: (open: boolean) => void;
  currentTurn: number;
  monsterRewardPreviewForModal: MonsterRewardPreview[] | null;
  heroDetailsOpen: boolean;
  onHeroDetailsChange: (open: boolean) => void;
  heroVariant: HeroVariant;
  heroDetailsStats: HeroStatsSummary;
  heroDetailsSkills: HeroSkillDefinition[];
  permanentSkills: string[];
  heroMagicInfo?: HeroMagicDisplayInfo[];
  heroCapacityLimits: {
    hand: number;
    backpack: number;
    amuletSlots: number;
    equipmentSlotLeft: number;
    equipmentSlotRight: number;
  };
  activeMonsterReward: MonsterRewardDrop | null;
  onMonsterRewardSelect: (optionId: string) => void;
  eventModalOpen: boolean;
  currentEventCard: GameCardData | null;
  onEventChoice: (choiceIndex: number) => void;
  eventChoiceStates: EventChoiceAvailability[];
  eventDiceModal: EventDiceModalState | null;
  eventDiceRollKey: number;
  onDiceRollResult: (value: number) => void;
  onDiceModalClose: () => void;
  equipmentPrompt: EquipmentPromptState | null;
  equipmentSlot1: EquipmentItem | null;
  equipmentSlot2: EquipmentItem | null;
  onEquipmentPromptSelect: (slotId: EquipmentSlotId) => void;
  onEquipmentPromptCancel: () => void;
  showSkillSelection: boolean;
  onSkillSelection: (skillId: string) => void;
};

export function GameBoardModals({
  deathWardPrompt,
  onDeathWardConfirm,
  onDeathWardDecline,
  gameOver,
  victory,
  gold,
  hp,
  onRestart,
  monstersDefeated,
  totalDamageTaken,
  totalHealed,
  deckViewerOpen,
  onDeckViewerChange,
  remainingDeck,
  onCardSelect,
  backpackViewerOpen,
  onBackpackViewerChange,
  backpackItems,
  permanentMagicRecycleBag,
  discoverModalOpen,
  discoverOptions,
  onDiscoverSelect,
  graveyardDiscoverState,
  onGraveyardDiscoverSelect,
  shopModalOpen,
  shopOfferings,
  backpackCapacity,
  shopLevel,
  canDeleteCardInShop,
  shopDeleteDisabledReason,
  onShopDeleteRequest,
  onShopPurchase,
  onShopClose,
  shopSourceEvent,
  eventTransformState,
  deleteModalOpen,
  onDeleteModalChange,
  handCards,
  onDeleteCardConfirm,
  cardActionContext,
  selectedCard,
  detailsModalOpen,
  onDetailsModalChange,
  currentTurn,
  monsterRewardPreviewForModal,
  heroDetailsOpen,
  onHeroDetailsChange,
  heroVariant,
  heroDetailsStats,
  heroDetailsSkills,
  permanentSkills,
  heroMagicInfo,
  heroCapacityLimits,
  activeMonsterReward,
  onMonsterRewardSelect,
  eventModalOpen,
  currentEventCard,
  onEventChoice,
  eventChoiceStates,
  eventDiceModal,
  eventDiceRollKey,
  onDiceRollResult,
  onDiceModalClose,
  equipmentPrompt,
  equipmentSlot1,
  equipmentSlot2,
  onEquipmentPromptSelect,
  onEquipmentPromptCancel,
  showSkillSelection,
  onSkillSelection,
}: GameBoardModalsProps) {
  return (
    <>
      {deathWardPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm space-y-4 rounded-lg bg-card p-6 text-center shadow-2xl">
            <div className="space-y-1">
              <p className="text-lg font-semibold">命悬一线</p>
              <p className="text-sm text-muted-foreground">
                正在受到 {deathWardPrompt.pendingDamage} 点致命伤害，是否打出 {deathWardPrompt.card.name}？
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={onDeathWardConfirm}>
                抵消伤害
              </button>
              <button className="rounded-md border border-border px-4 py-2" onClick={onDeathWardDecline}>
                放弃
              </button>
            </div>
          </div>
        </div>
      )}

      <VictoryDefeatModal
        open={gameOver}
        isVictory={victory}
        gold={gold}
        hpRemaining={hp}
        onRestart={onRestart}
        monstersDefeated={monstersDefeated}
        damageTaken={totalDamageTaken}
        totalHealed={totalHealed}
      />

      <DeckViewerModal open={deckViewerOpen} onOpenChange={onDeckViewerChange} remainingCards={remainingDeck} onCardSelect={onCardSelect} />

      <BackpackViewerModal
        open={backpackViewerOpen}
        onOpenChange={onBackpackViewerChange}
        cards={backpackItems}
        recycleCards={permanentMagicRecycleBag}
        onCardSelect={onCardSelect}
      />

      <DiscoverClassModal open={discoverModalOpen} cards={discoverOptions} onSelect={onDiscoverSelect} />

      <DiscoverClassModal
        open={Boolean(graveyardDiscoverState)}
        cards={graveyardDiscoverState ?? []}
        onSelect={onGraveyardDiscoverSelect}
        title="坟场召回"
        description="从坟场随机出现的卡牌中选择一张带回背包。"
      />

      <ShopModal
        open={shopModalOpen}
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
        sourceEventName={shopSourceEvent ?? undefined}
      />

      {eventTransformState && <CardFlipOverlay state={eventTransformState} />}

      <CardDeletionModal
        open={deleteModalOpen}
        onOpenChange={onDeleteModalChange}
        handCards={handCards}
        backpackCards={backpackItems}
        onDeleteCard={onDeleteCardConfirm}
        title={cardActionContext?.title}
        description={cardActionContext?.description}
        requiredCount={cardActionContext?.requiredCount}
        remainingCount={cardActionContext?.remainingCount}
      />

      <CardDetailsModal
        card={selectedCard}
        open={detailsModalOpen}
        onOpenChange={onDetailsModalChange}
        currentTurn={currentTurn}
        monsterRewards={monsterRewardPreviewForModal ?? undefined}
      />

      <HeroDetailsModal
        open={heroDetailsOpen}
        onOpenChange={onHeroDetailsChange}
        heroVariant={heroVariant}
        stats={heroDetailsStats}
        heroSkills={heroDetailsSkills}
        permanentSkills={permanentSkills}
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

      <EventChoiceModal open={eventModalOpen} eventCard={currentEventCard} onChoice={onEventChoice} choiceStates={eventChoiceStates} />

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

      <HeroSkillSelection isOpen={showSkillSelection} onSelectSkill={onSkillSelection} />
    </>
  );
}
