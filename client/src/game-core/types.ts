/**
 * Game Core Types
 *
 * Re-exports all game-relevant types from their canonical locations and defines
 * the unified GameState interface used by the GameEngine.
 */

// ---------------------------------------------------------------------------
// Re-exports from existing modules
// ---------------------------------------------------------------------------

export type {
  CardType,
  GameCardData,
  EventChoiceDefinition,
  EventDiceRange,
  EventEffectExpression,
  EventRequirement,
  EquipmentCardStatModifier,
  PotionEffectId,
  AmuletEffectId,
  AmuletAuraBonus,
  HeroMagicId,
  CardFlipDestination,
  CardFlipTarget,
} from '@/components/GameCard';

export type {
  CombatState,
  CombatInitiator,
  EquipmentSlotId,
  EquipmentItem,
  AmuletItem,
  ActiveRowSlots,
  SlotPermanentBonus,
  EquipmentSlotBonusState,
  SlotTempArmorState,
  EquipmentRepairTarget,
  BlockTarget,
  MonsterRewardEffect,
  MonsterRewardOption,
  MonsterRewardDrop,
  DeathWardPromptState,
  PendingHeroSkillAction,
  PendingHeroMagicAction,
  HeroMagicActivationOrigin,
  PendingMagicAction,
  PendingPotionAction,
  CardActionContext,
  EquipmentPromptState,
  EventTransformState,
  WaterfallPhase,
  WaterfallDiscardDestination,
  WaterfallAnimationState,
  WaterfallPlan,
  DungeonDropAssignment,
  ActiveAmuletEffects,
  AmuletAuraTotals,
  MonsterRewardPreview,
  HeroStatsSummary,
  HeroSkillSummary,
  EventDiceModalState,
  GridMetrics,
  BackpackDrawRequest,
  PendingHandInsertion,
  DeckPeekModalState,
} from '@/components/game-board/types';

export type { MagicChoiceModalState } from '@/components/MagicChoiceModal';
export type { PersuadePhase } from '@/components/MonsterPersuadeModal';

export type {
  PersistedGameState,
  CombatStateSnapshot,
  SlotBonusSnapshot,
  EquipmentBuffSnapshot,
  EquipmentSlotBonusSnapshot,
} from '@/lib/gameStorage';

export type {
  HeroVariant,
} from '@/lib/heroes';

export type {
  HeroSkillId,
  HeroSkillDefinition,
  HeroSkillTarget,
} from '@/lib/heroSkills';

export type {
  HeroMagicState,
  HeroMagicRuntimeState,
  HeroMagicDefinition,
  HeroMagicChargeSource,
} from '@/lib/heroMagic';

export type {
  KnightCardData,
} from '@/lib/knightDeck';

export type {
  LogEntry,
  LogEntryType,
} from '@/components/GameLogPanel';

export type {
  ShopOffering,
} from '@/components/ShopModal';

// ---------------------------------------------------------------------------
// Mirror copy (class instant magic「镜影摹形」)
// ---------------------------------------------------------------------------

/** 可选复制目标：左/右装备栏、护符栏（按序号）、手牌 */
export type MirrorCopySelection =
  | { kind: 'equipment'; slotId: 'equipmentSlot1' | 'equipmentSlot2' }
  | { kind: 'amulet'; index: number }
  | { kind: 'hand'; cardId: string };

// ---------------------------------------------------------------------------
// GameState — the unified, authoritative game state managed by GameEngine
// ---------------------------------------------------------------------------

import type { GameCardData } from '@/components/GameCard';
import type {
  CombatState,
  EquipmentSlotId,
  EquipmentSlotBonusState,
  SlotTempArmorState,
  DeathWardPromptState,
  PendingHeroSkillAction,
  PendingHeroMagicAction,
  PendingMagicAction,
  PendingPotionAction,
  CardActionContext,
  EquipmentPromptState,
  EventTransformState,
  EventDiceModalState,
  AmuletItem,
  EquipmentItem,
  ActiveRowSlots,
  MonsterRewardDrop,
  MonsterRewardOption,
  WaterfallAnimationState,
  ActiveAmuletEffects,
} from '@/components/game-board/types';
import type { HeroVariant } from '@/lib/heroes';
import type { HeroMagicState } from '@/lib/heroMagic';
import type { HeroSkillDefinition, HeroSkillId } from '@/lib/heroSkills';
import type { KnightCardData } from '@/lib/knightDeck';
import type { LogEntry } from '@/components/GameLogPanel';
import type { ShopOffering } from '@/components/ShopModal';
import type { EquipmentBuffSnapshot } from '@/lib/gameStorage';
import type { MagicChoiceModalState } from '@/components/MagicChoiceModal';
import type { PersuadePhase } from '@/components/MonsterPersuadeModal';

export interface PersuadeModalState {
  monster: GameCardData;
  targetSlot: 'backpack' | EquipmentSlotId;
  phase: PersuadePhase;
  threshold: number;
  successRate: number;
  diceValue: number | null;
  success: boolean | null;
}

export interface GameState {
  // --- Core stats ---
  hp: number;
  gold: number;
  turnCount: number;
  shopLevel: number;
  monstersDefeated: number;
  totalDamageTaken: number;
  totalHealed: number;
  healAccumulator: number;
  turnDamageTaken: number;
  cardsPlayed: number;
  recycleForgePlayCount: number;
  /** 战伤刻印：0–4，累计 5 次造成伤害触发发现专属牌后归零 */
  classDamageDiscoverStreak: number;
  waveDiscardCount: number;
  totalWins: number;
  undoCount: number;

  // --- Board state ---
  previewCards: ActiveRowSlots;
  activeCards: ActiveRowSlots;
  /** Cards stacked below the top card in preview row (per column index) */
  previewCardStacks: Record<number, GameCardData[]>;
  /** Cards stacked below the top card in active row (per column index) */
  activeCardStacks: Record<number, GameCardData[]>;
  /** Bonus cards dealt per waterfall (from 瀑流增幅药) */
  waterfallDealBonus: number;
  remainingDeck: GameCardData[];
  discardedCards: GameCardData[];
  handCards: GameCardData[];

  // --- Equipment ---
  equipmentSlot1: EquipmentItem | null;
  equipmentSlot2: EquipmentItem | null;
  equipmentSlot1Reserve: EquipmentItem[];
  equipmentSlot2Reserve: EquipmentItem[];
  equipmentSlotCapacity: Record<string, number>;
  equipmentSlotBonuses: EquipmentSlotBonusState;
  amuletSlots: AmuletItem[];
  maxAmuletSlots: number;

  // --- Backpack / class deck ---
  backpackItems: GameCardData[];
  permanentMagicRecycleBag: GameCardData[];
  backpackCapacityModifier: number;
  classDeck: GameCardData[];
  classCardsInHand: KnightCardData[];

  // --- Hero build ---
  heroVariant: HeroVariant;
  heroClass: string;
  selectedHeroSkill: HeroSkillId | null;
  extraHeroSkills: HeroSkillId[];
  extraSkillsUsedThisWave: string[];
  permanentSkills: string[];
  permanentMaxHpBonus: number;
  permanentSpellDamageBonus: number;
  permanentSpellLifesteal: number;
  stunCap: number;
  heroStunned: boolean;
  cardGainUpgradeProgress: number;
  bugletAmuletObtained: boolean;
  handLimitBonus: number;
  heroMagicState: HeroMagicState;
  wraithPassiveEnabled: boolean;
  persuadeLevel: number;
  persuadeCostModifier: number;
  lastPersuadeTargetId: string | null;

  // --- Combat ---
  combatState: CombatState;
  tempShield: number;

  // --- Buffs / flags ---
  nextWeaponBonus: number;
  nextShieldBonus: number;
  weaponMasterBonus: number;
  shieldMasterBonus: number;
  vampiricNextAttack: boolean;
  unbreakableNext: boolean;
  unbreakableUntilWaterfall: Record<string, boolean>;
  bulwarkPassiveActive: number;
  bulwarkTempArmorStacks: number;
  slotTempArmor: SlotTempArmorState;
  slotTempAttack: SlotTempArmorState;
  defensiveStanceActive: boolean;
  slotAttackBursts: EquipmentBuffSnapshot;
  nextAttackLifestealSlot: EquipmentSlotId | null;
  berserkTurnBuff: EquipmentBuffSnapshot;
  extraAttackCharges: number;
  doubleNextMagic: boolean;
  heroSkillUsedThisWave: boolean;
  berserkerRageActive: boolean;
  berserkerSlotUsed: Record<string, boolean>;
  flashSlotUsed: Record<string, boolean>;
  gambitExtraActive: boolean;
  gambitExtraPerSlot: number;
  gambitSlotUsed: Record<string, number>;
  weaponExtraAttackUsed: Record<string, boolean>;

  // --- Targeting / pending actions ---
  pendingHeroSkillAction: PendingHeroSkillAction | null;
  pendingHeroMagicAction: PendingHeroMagicAction | null;
  pendingMagicAction: PendingMagicAction | null;
  pendingPotionAction: PendingPotionAction | null;
  deathWardPrompt: DeathWardPromptState | null;

  // --- Monster rewards ---
  monsterRewardQueue: MonsterRewardDrop[];
  activeMonsterReward: MonsterRewardDrop | null;
  selectedMonsterRewards: MonsterRewardOption[] | null;
  monsterRewardPreviewCache: Record<string, MonsterRewardOption[]>;

  // --- Shop ---
  shopOfferings: ShopOffering[];
  shopSourceEvent: GameCardData | null;
  shopDeleteUsed: boolean;
  shopHealUsed: boolean;
  shopLevelUpUsed: boolean;
  shopSkillDiscoverUsed: boolean;
  shopSkillOptions: HeroSkillDefinition[];

  // --- Events ---
  currentEventCard: GameCardData | null;
  resolvingDungeonCardId: string | null;
  eventModalOpen: boolean;
  eventModalMinimized: boolean;
  eventDiceModal: EventDiceModalState | null;
  eventTransformState: EventTransformState | null;
  persuadeState: PersuadeModalState | null;
  magicChoiceModal: MagicChoiceModalState | null;

  // --- Discover / card actions ---
  discoverModalOpen: boolean;
  discoverOptions: GameCardData[];
  deleteModalOpen: boolean;
  upgradeModalOpen: boolean;
  handMagicUpgradeModal: { sourceCardId: string } | null;
  /** 镜影摹形：选择复制目标 */
  mirrorCopyModal: { sourceCardId: string } | null;
  /** 永恒铭刻：选择手牌赋予 Perm 2（来源可为药水或即时魔法） */
  permGrantModal: { sourceCardId: string; sourceType: 'potion' | 'magic' } | null;
  graveyardDiscoverState: GameCardData[] | null;
  graveyardDiscoverDelivery: 'backpack' | 'hand-first';
  cardActionContext: CardActionContext | null;
  equipmentPrompt: EquipmentPromptState | null;
  ghostBladeExileCards: GameCardData[] | null;

  // --- Shop ---  (modals)
  shopModalOpen: boolean;
  shopModalMinimized: boolean;
  shopSkillSelectOpen: boolean;

  // --- Game flow ---
  gameOver: boolean;
  victory: boolean;
  showSkillSelection: boolean;
  showCardDraft: boolean;
  cardDraftPool: GameCardData[];
  drawPending: boolean;
  isHydrated: boolean;
  heroSkillBanner: string | null;

  // --- Game log ---
  gameLogEntries: LogEntry[];
}
