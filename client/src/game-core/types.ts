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
  HandDiscardSelectionState,
  HandDiscardContinuation,
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

/** 增幅：可选目标为装备栏或手牌中的装备/伤害魔法 */
export type AmplifySelection =
  | { kind: 'equipment'; slotId: 'equipmentSlot1' | 'equipmentSlot2' }
  | { kind: 'hand'; cardId: string };

// ---------------------------------------------------------------------------
// Eternal Relics — permanent passive items (like Slay the Spire relics)
// ---------------------------------------------------------------------------

export type EternalRelicId =
  | 'waterfall-discover'
  | 'waterfall-heal'
  | 'vitality-well'
  | 'discard-profit'
  | 'heal-to-damage'
  | 'early-surge'
  | 'shield-wall'
  | 'summon-minion'
  | 'bulwark-attack'
  | 'bulwark-armor'
  | 'chain-persuade'
  | 'recycle-shuffle'
  | 'equip-empower'
  | 'wraith-purification'
  | 'persuade-same-halve'
  | 'persuade-race-bonus'
  | 'persuade-durability-bonus'
  | 'end-turn-draw'
  | 'missile-amplify-on-waterfall'
  | 'missile-stun-20'
  | 'missile-draw-1'
  | `amulet-eternal-${string}`;

export interface EternalRelic {
  id: EternalRelicId;
  name: string;
  description: string;
  image: string;
  initialMaxHpBonus?: number;
  initialGoldBonus?: number;
  initialShopLevel?: number;
  initialWaterfallBonus?: number;
  initialClassCardDraw?: number;
  initialSpellDamageBonus?: number;
  /** When this relic was converted from an amulet, store its effect so it continues to function. */
  amuletEffect?: import('@/components/GameCard').AmuletEffectId;
  amuletAuraBonus?: import('@/components/GameCard').AmuletAuraBonus;
  /** Upgrade level carried over from the original amulet. */
  upgradeLevel?: number;
}

// ---------------------------------------------------------------------------
// Game Phase — where we are in the turn / resolution pipeline
// ---------------------------------------------------------------------------

export type GamePhase =
  | 'idle'                    // no active combat or between waves
  | 'playerInput'             // hero's turn — waiting for player action
  | 'monsterTurn'             // monsters are attacking (queue being processed)
  | 'awaitingBlock'           // a monster attack is pending — player must block/take
  | 'awaitingTarget'          // player must choose a target (card/skill/etc.)
  | 'awaitingDice'            // waiting for a dice roll result
  | 'awaitingEventChoice'     // event card presented — waiting for choice
  | 'awaitingShopAction'      // shop open — waiting for player action
  | 'awaitingRewardChoice'    // monster reward selection
  | 'awaitingPotionTarget'    // potion requires target selection
  | 'awaitingMagicTarget'     // magic requires target selection
  | 'awaitingDeathWard'       // death ward triggered — player must decide
  | 'awaitingEquipmentPrompt' // equipment prompt (slot choice, etc.)
  | 'awaitingDiscoverChoice'  // discover modal — player must pick a card
  | 'awaitingUpgradeChoice'   // upgrade modal — player must pick cards
  | 'awaitingDeleteChoice'    // delete modal — player must pick a card
  | 'resolving';              // pipeline is actively processing actions

// ---------------------------------------------------------------------------
// GameState — the unified, authoritative game state managed by GameEngine
// ---------------------------------------------------------------------------

import type { GameAction } from './actions';
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
  targetSlot: 'backpack';
  phase: PersuadePhase;
  threshold: number;
  successRate: number;
  diceValue: number | null;
  success: boolean | null;
}

/**
 * One pre-rolled goblin end-of-monster-turn dice flow waiting on player input.
 * Stored in `pendingMonsterEndDiceQueue`; consumed one-at-a-time by
 * `RESOLVE_DICE` so each goblin gets its own dice modal.
 *
 * - `goblin-steal`: goblin "窃宝". The item to steal is pre-picked at
 *   flow-build time from the player's equipment / amulet slots.
 * - `goblin-heal`: goblin "贼窝疗养". Restores 1 layer (capped at maxLayers).
 */
export type PendingMonsterEndDice =
  | {
      kind: 'goblin-steal';
      goblinId: string;
      goblinName: string;
      colIndex: number;
      stackCount: number;
      predeterminedRoll: number;
      threshold: number;
      success: boolean;
      pickedSource: 'equip' | 'amulet' | null;
      pickedSlotId: EquipmentSlotId | null;
      pickedItem: GameCardData | null;
    }
  | {
      kind: 'goblin-heal';
      goblinId: string;
      goblinName: string;
      colIndex: number;
      stackCount: number;
      predeterminedRoll: number;
      threshold: number;
      success: boolean;
      currentLayer: number;
      maxLayers: number;
    };

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
  /** 战伤刻印：0–9，累计 10 次造成伤害触发发现专属牌后归零 */
  classDamageDiscoverStreak: number;
  /** 咒纹刻印：0–7，累计 8 次使用 magic 牌触发发现专属牌后归零 */
  classMagicDiscoverStreak: number;
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
  /** Computed waterfall plan waiting for UI animation; persisted so it survives refresh/undo */
  pendingWaterfallPlan: import('./rules/waterfall').WaterfallDropPlan | null;
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
  monsterKillUpgradeProgress: number;
  recycleBackpackProgress: number;
  swapUpgradeProgress: number;
  flipOverkillLifestealProgress: number;
  equipAmuletCapProgress: number;
  stunAttemptDiscoverProgress: number;
  /** 翻覆震慑 buff: id of the monster suffering -1 attack on every flip until next waterfall */
  flipDebuffMonsterId: string | null;
  bugletAmuletObtained: boolean;
  statSwapCardObtained: boolean;
  handLimitBonus: number;
  heroMagicState: HeroMagicState;
  wraithPassiveEnabled: boolean;
  persuadeLevel: number;
  persuadeCostModifier: number;
  lastPersuadeTargetId: string | null;
  consecutivePersuadeCount: number;
  persuadeSameTargetCostHalve: boolean;
  persuadeRaceBonus: Record<string, number>;
  persuadeSuccessDurabilityBonus: number;
  /** Accumulated persuade rate bonus from weapons, amulets, etc. (persisted) */
  persuadeAmuletBonus: number;
  /**
   * Truly permanent persuasion rate bonus (e.g. monster-loot
   * `persuadeRateBonus` rewards). Unlike `persuadeAmuletBonus`, this is
   * NOT cleared after a persuade attempt. Always added to the persuade
   * success rate.
   */
  permanentPersuadeBonus: number;
  /** "Next persuade" temporary cost/rate modifier (cleared on persuade confirm) */
  persuadeDiscount: { costReduction: number; rateBonus: number } | null;
  /** 转型关键词：上一张「使用」的牌的类型分类（不含弃置/回收），包含手牌和激活行 */
  lastPlayedCardCategory: string | null;
  /** 转型链：上一次 APPLY_TRANSFORM_CATEGORY 处理的卡的类别（用于连续转型计数，不被 magic resolver 篡改） */
  transformChainPrevCategory: string | null;
  /** 连续不同类型出牌次数（包含当前最近一次出牌；同类型连出会重置为 0） */
  consecutiveTransformStreak: number;
  /** 本波已使用的 magic 卡数量（瀑流重置，不含 hero-magic） */
  magicCardsPlayedThisTurn: number;
  /** 本波已使用的造成伤害的 magic 卡数量（瀑流重置） */
  damageMagicPlayedThisTurn: number;

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
  /**
   * Whether amulet aura contributions (strength / balance) are currently
   * baked into `slotTempAttack` / `slotTempArmor`.
   *
   * - Set to `true` after the waterfall pipeline (APPLY_WATERFALL_EFFECTS,
   *   turnBoost discard) has applied the aura into the temp slots.
   * - Reset to `false` by WATERFALL_TURN_RESET, which zeroes the temp slots.
   * - START_TURN's safety-net aura re-apply is gated on this flag being
   *   `false`; otherwise the aura would stack each turn (e.g. balance going
   *   from +3/-1 to +6/-2 after one monster turn cycle).
   */
  amuletAuraAppliedThisWave: boolean;
  defensiveStanceActive: boolean;
  slotAttackBursts: EquipmentBuffSnapshot;
  nextAttackLifestealSlot: EquipmentSlotId | null;
  berserkTurnBuff: EquipmentBuffSnapshot;
  extraAttackCharges: number;
  /** 兵器谱：本回合该装备栏额外攻击次数（独立于全局 extraAttackCharges，仅由对应栏的攻击消耗）。回合结束清零。 */
  slotExtraAttacks: SlotTempArmorState;
  doubleNextMagic: boolean;
  heroSkillUsedThisWave: boolean;
  berserkerRageActive: boolean;
  berserkerSlotUsed: Record<string, boolean>;
  /**
   * Number of flash extra attacks already consumed by each slot in the current
   * hero turn. With N equipped 闪光符 (flashCount=N), each slot can spend up to
   * N flash extras per turn. Reset on START_TURN / RESET_TURN_STATE.
   */
  flashSlotUsed: Record<string, number>;
  gambitExtraActive: boolean;
  gambitExtraPerSlot: number;
  gambitSlotUsed: Record<string, number>;
  weaponExtraAttackUsed: Record<string, number>;
  blockDurabilityPerSlot: number;
  /** 战意激发: per-slot bonus that grants +N attacks/hero-turn AND +N block durability cap/monster-turn for the chosen slot. Persists until next waterfall. */
  slotBattleSpiritBonus: Record<string, number>;
  /** Counter of battle-spirit extra attacks consumed by each slot in the current hero turn (resets on START_TURN / RESET_TURN_STATE). */
  slotBattleSpiritUsed: Record<string, number>;

  // --- Targeting / pending actions ---
  pendingHeroSkillAction: PendingHeroSkillAction | null;
  pendingHeroMagicAction: PendingHeroMagicAction | null;
  pendingMagicAction: PendingMagicAction | null;
  /** 手牌「玩家自选」弃回多选状态；非 null 时 UI 弹出 HandDiscardSelectionModal。 */
  pendingHandDiscardSelection: HandDiscardSelectionState | null;
  pendingPotionAction: PendingPotionAction | null;
  deathWardPrompt: DeathWardPromptState | null;

  /**
   * Queue of pre-rolled goblin "贼窝疗养"/"窃宝" dice flows that need to be
   * shown to the player at the end of the monster turn. While this queue is
   * non-empty the pipeline parks at `phase: 'awaitingDice'`; each
   * `RESOLVE_DICE` pops the front entry, applies its effect, then either
   * triggers the next dice modal or finally enqueues `START_TURN`.
   */
  pendingMonsterEndDiceQueue: PendingMonsterEndDice[];

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
  shopEquipAttackUsed: boolean;
  shopEquipArmorUsed: boolean;
  shopSkillOptions: HeroSkillDefinition[];

  // --- Events ---
  currentEventCard: GameCardData | null;
  resolvingDungeonCardId: string | null;
  pendingEventEffects: string[];
  pendingEventSkipFlip: boolean;
  eventModalOpen: boolean;
  eventModalMinimized: boolean;
  eventDiceModal: EventDiceModalState | null;
  eventTransformState: EventTransformState | null;
  persuadeState: PersuadeModalState | null;
  magicChoiceModal: MagicChoiceModalState | null;

  // --- Discover / card actions ---
  discoverModalOpen: boolean;
  discoverOptions: GameCardData[];
  discoverSourceLabel: string | null;
  /**
   * Queue of class-deck discovers waiting to fire one after another.
   * Each entry triggers a fresh BEGIN_DISCOVER (re-pulled from current
   * `classDeck`) when the previous discover modal closes. Used by
   * effects that destroy multiple equipment in a single resolution
   * (e.g. 弃装重铸) so the player sees one discover popup per destroyed
   * piece.
   */
  pendingClassDiscoverQueue: Array<{ source: string; sourceLabel?: string | null }>;
  deleteModalOpen: boolean;
  upgradeModalOpen: boolean;
  upgradeModalMaxCount: number | undefined;
  handMagicUpgradeModal: { sourceCardId: string } | null;
  /** 镜影摹形：选择复制目标 */
  mirrorCopyModal: { sourceCardId: string } | null;
  /** 永恒铭刻 / 蜕变赋灵：选择手牌赋予属性 */
  permGrantModal: { sourceCardId: string; sourceType: 'potion' | 'magic' | 'transform-grant' | 'equipment-enchant' | 'essence-extract' | 'flank-grant' | 'transform-gold-grant' | 'flank-persuade-grant' | 'flank-stun-grant' | 'flank-damage-grant' | 'transform-draw-grant' | 'transform-heal-grant' | 'transform-recycle-grant' | 'amulet-perm-grant' | 'on-hand-stun-cap-grant'; meta?: Record<string, number> } | null;
  /** 增幅：选择装备栏或手牌中的装备/伤害魔法进行增幅 */
  amplifyModal: { sourceCardId: string } | null;
  /** 增幅仪式（事件）：选择手牌中的装备/伤害魔法作为增幅祭坛目标 */
  eventAmplifyHandPicker: { eventCardId: string; cellIdx: number } | null;
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
  gameMode: 'normal' | 'quick';
  gameOver: boolean;
  victory: boolean;
  showSkillSelection: boolean;
  showCardDraft: boolean;
  cardDraftPool: GameCardData[];
  drawPending: boolean;
  isHydrated: boolean;
  heroSkillBanner: string | null;

  // --- Eternal relics ---
  eternalRelics: EternalRelic[];

  // --- Init-derived UI state ---
  /** ID of the class-deck card shown as preview after game init (RNG-picked). */
  classCardPreviewId: string | null;

  // --- Game log ---
  gameLogEntries: LogEntry[];

  // --- Honor sweep (Phase 8D) ---
  honorSweepUpgradesPending: number;

  // --- Amplify (按卡名累计) ---
  /**
   * 按卡名累计的增幅加成。键为卡名（GameCardData.name），
   * 值为该名称已累计的增幅点数。增幅祭坛触发时会同时：
   *   1) 把数值累加到此 map；
   *   2) 立刻把数值应用到所有同名卡（手牌/装备/装备储备/背包/坟场/回收袋/职业牌组/地下城行），
   *   3) 后续运行时生成的同名卡在创建时通过 applyAmplifyOnCreate 自动应用此 map 中的数值。
   */
  amplifiedCardBonus: Record<string, number>;

  // --- Dungeon card processing (Phase 8B) ---
  processedDungeonCardIds: string[];
  pendingAutoDrawCount: number;

  // --- Action system (game-core pipeline) ---
  /** FIFO queue of pending actions to be resolved by the pipeline. */
  actionQueue: GameAction[];
  /** Current phase of the game turn / resolution flow. */
  phase: GamePhase;
  /** Action history for debugging / replay (only populated when enabled). */
  actionLog: Array<{ action: GameAction; timestamp: number }>;

  // --- Seeded RNG ---
  /** Deterministic PRNG state carried on game state for reproducible randomness. */
  rng: import('./rng').RngState;

  /**
   * Transient stash for the most recent ROLL_DICE_FOR_FLOW result. Set by the
   * reducer; read immediately by the dispatching hook to seed a UI dice modal
   * with the predetermined value. Not persisted across turns; consumers should
   * treat any non-immediate read as undefined behavior.
   */
  lastFlowDiceRoll: number | null;
}
