/**
 * Game Actions — the unified action type for all game state mutations.
 *
 * Every meaningful game state change is represented as a dispatched action.
 * Actions are processed by the reducer (reducer.ts) and may enqueue
 * follow-up actions into the action queue for sequential resolution.
 *
 * Actions are added incrementally as logic migrates from React hooks
 * into game-core. Legacy setState calls coexist during the transition.
 */

import type { GameCardData } from '@/components/GameCard';
import type {
  CombatInitiator,
  EquipmentSlotId,
  ActiveRowSlots,
} from '@/components/game-board/types';

// ---------------------------------------------------------------------------
// Turn flow
// ---------------------------------------------------------------------------

export interface StartTurnAction {
  type: 'START_TURN';
  suppressAmuletReapply?: boolean;
}

export interface EndTurnAction {
  type: 'END_TURN';
  /** Monster IDs that lost a layer during the hero turn (for regen logic) */
  heroTurnLayerLossIds: string[];
}

export interface EnterPlayerInputAction {
  type: 'ENTER_PLAYER_INPUT';
}

// ---------------------------------------------------------------------------
// Monster turn
// ---------------------------------------------------------------------------

export interface AdvanceMonsterTurnAction {
  type: 'ADVANCE_MONSTER_TURN';
}

export interface ApplyMonsterTurnEndEffectsAction {
  type: 'APPLY_MONSTER_TURN_END_EFFECTS';
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

export interface BeginCombatAction {
  type: 'BEGIN_COMBAT';
  monster: GameCardData;
  initiator: CombatInitiator;
}

export interface FinishCombatAction {
  type: 'FINISH_COMBAT';
}

export interface PerformHeroAttackAction {
  type: 'PERFORM_HERO_ATTACK';
  slotId: EquipmentSlotId;
  targetMonsterId: string;
  /** If true, this attack targets a building with no engaged monsters (special rules). */
  isBuildingNoEngaged?: boolean;
}

export interface ResolveBlockAction {
  type: 'RESOLVE_BLOCK';
  choice: 'shield' | 'take';
  slotId?: EquipmentSlotId;
}

export interface PerformShieldBashAction {
  type: 'PERFORM_SHIELD_BASH';
  slotId: EquipmentSlotId;
  targetMonsterId: string;
  /** Pre-rolled stun dice result (1-20). If omitted, emits combat:requestDice side-effect. */
  diceRoll?: number;
}

export interface ResetHeroTurnUsageAction {
  type: 'RESET_HERO_TURN_USAGE';
}

export interface DisengageMonsterAction {
  type: 'DISENGAGE_MONSTER';
  monsterId: string;
}

export interface RecordClassDamageDiscoverAction {
  type: 'RECORD_CLASS_DAMAGE_DISCOVER';
  /** Explicit streak value (legacy setter mode). */
  streak?: number;
  /** If true, increment the current streak by 1 and check threshold. */
  increment?: boolean;
}

export interface SetPersuadeDiscountAction {
  type: 'SET_PERSUADE_DISCOUNT';
  discount: { costReduction: number; rateBonus: number } | null;
}

export interface SetPersuadeAmuletBonusAction {
  type: 'SET_PERSUADE_AMULET_BONUS';
  bonus: number;
}

// ---------------------------------------------------------------------------
// Damage / Heal
// ---------------------------------------------------------------------------

export interface ApplyDamageAction {
  type: 'APPLY_DAMAGE';
  amount: number;
  source: string;
  selfInflicted?: boolean;
}

export interface HealAction {
  type: 'HEAL';
  amount: number;
  source: string;
}

export interface DealDamageToMonsterAction {
  type: 'DEAL_DAMAGE_TO_MONSTER';
  monsterId: string;
  damage: number;
  source: string;
  isSpellDamage?: boolean;
  // Optional log line emitted ONLY when the damage actually lands (i.e. is not
  // fully blocked by buglet shield / building immunity / spell resistance).
  // Use this for spells whose pre-resolution log message would be misleading
  // when blocked. Logged with type 'magic'.
  landedLogMessage?: string;
}

// ---------------------------------------------------------------------------
// Death / battle end checks
// ---------------------------------------------------------------------------

export interface MonsterDefeatedAction {
  type: 'MONSTER_DEFEATED';
  monsterId: string;
  killedByMinion?: boolean;
}

export interface DecrementFuryAction {
  type: 'DECREMENT_FURY';
  monsterId: string;
}

export interface ExecuteLastWordsAction {
  type: 'EXECUTE_LAST_WORDS';
  monsterId: string;
  lastWords: string;
}

export interface ApplyShieldReflectAction {
  type: 'APPLY_SHIELD_REFLECT';
  monsterId: string;
  damage: number;
  sourceName: string;
}

export interface ApplyDragonBreathRetaliationAction {
  type: 'APPLY_DRAGON_BREATH_RETALIATION';
  monsterId: string;
  monsterName: string;
  damage: number;
}

export interface CheckDeathAction {
  type: 'CHECK_DEATH';
  targetId: string;
}

export interface CheckBattleEndAction {
  type: 'CHECK_BATTLE_END';
}

// ---------------------------------------------------------------------------
// Card operations
// ---------------------------------------------------------------------------

export interface PlayCardAction {
  type: 'PLAY_CARD';
  cardId: string;
  target?: string;
}

export interface DrawCardsAction {
  type: 'DRAW_CARDS';
  count: number;
  source: 'backpack' | 'deck' | 'recycleBag';
}

export interface DiscardCardAction {
  type: 'DISCARD_CARD';
  cardId: string;
  destination: 'graveyard' | 'recycleBag';
  owner?: 'player' | 'dungeon';
}

export interface AddToGraveyardAction {
  type: 'ADD_TO_GRAVEYARD';
  card: import('@/components/GameCard').GameCardData;
}

export interface AddToRecycleBagAction {
  type: 'ADD_TO_RECYCLE_BAG';
  card: import('@/components/GameCard').GameCardData;
}

export interface AddToBackpackAction {
  type: 'ADD_TO_BACKPACK';
  card: import('@/components/GameCard').GameCardData;
  toBottom?: boolean;
}

export interface DrawFromBackpackAction {
  type: 'DRAW_FROM_BACKPACK';
  count: number;
  ignoreLimit?: boolean;
}

export interface EquipCardAction {
  type: 'EQUIP_CARD';
  cardId: string;
  slotId: EquipmentSlotId;
}

export interface ResolvePotionAction {
  type: 'RESOLVE_POTION';
  cardId: string;
  /** The potion card data for resolution. */
  card: GameCardData;
}

export interface ResolveMagicAction {
  type: 'RESOLVE_MAGIC';
  cardId: string;
  /** The magic/hero-magic card data for resolution. */
  card: GameCardData;
  target?: string;
  /** True when the card was played from a flank position in hand. */
  isFlank?: boolean;
}

export interface FinalizeCardPlayAction {
  type: 'FINALIZE_CARD_PLAY';
  cardId: string;
  /** Where the card goes after play. */
  destination: 'graveyard' | 'recycleBag' | 'permanent-recycle' | 'exile';
}

export interface FinalizeMagicCardAction {
  type: 'FINALIZE_MAGIC_CARD';
  card: GameCardData;
  dealtDamage?: boolean;
  banner?: string;
}

export interface FinalizePotionCardAction {
  type: 'FINALIZE_POTION_CARD';
  card: GameCardData;
  banner?: string;
}

/**
 * Phase 2 of 哥布林的戏法 — invoked by the UI hook after the hand→backpack
 * discard flights complete. Removes the pre-selected `drawCardIds` from the
 * backpack and emits `card:queueToHand` for each so the backpack→hand flight
 * sequence runs.
 */
export interface GoblinTrickDeliverAction {
  type: 'GOBLIN_TRICK_DELIVER';
  drawCardIds: string[];
}

// ---------------------------------------------------------------------------
// Dungeon / waterfall
// ---------------------------------------------------------------------------

export interface TriggerWaterfallAction {
  type: 'TRIGGER_WATERFALL';
}

export interface WaterfallTurnResetAction {
  type: 'WATERFALL_TURN_RESET';
}

export interface DrawDungeonRowAction {
  type: 'DRAW_DUNGEON_ROW';
}

export interface MonsterEnteredRowAction {
  type: 'MONSTER_ENTERED_ROW';
  monsterId: string;
  column: number;
}

export interface CheckEliteGoldBuffAction {
  type: 'CHECK_ELITE_GOLD_BUFF';
}

export interface CheckHordeSwarmAction {
  type: 'CHECK_HORDE_SWARM';
}

// ---------------------------------------------------------------------------
// Status effects
// ---------------------------------------------------------------------------

export interface AddStatusAction {
  type: 'ADD_STATUS';
  targetId: string;
  statusKey: string;
  value: unknown;
}

export interface RemoveStatusAction {
  type: 'REMOVE_STATUS';
  targetId: string;
  statusKey: string;
}

// ---------------------------------------------------------------------------
// Turn-scoped reset (applied at START_TURN)
// ---------------------------------------------------------------------------

export interface ResetTurnStateAction {
  type: 'RESET_TURN_STATE';
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

export interface OpenShopAction {
  type: 'OPEN_SHOP';
  sourceEvent?: unknown;
}

export interface CloseShopAction {
  type: 'CLOSE_SHOP';
}

export interface PurchaseAction {
  type: 'PURCHASE';
  cardId: string;
}

export interface ShopHealAction {
  type: 'SHOP_HEAL';
}

export interface ShopLevelUpAction {
  type: 'SHOP_LEVEL_UP';
}

export interface ShopDeleteEquipmentAction {
  type: 'SHOP_DELETE_EQUIPMENT';
  slotId: EquipmentSlotId;
}

export interface ShopDiscoverAction {
  type: 'SHOP_DISCOVER';
  source: string;
}

export interface ShopEquipBoostAction {
  type: 'SHOP_EQUIP_BOOST';
  boostType: 'attack' | 'armor';
}

export interface ShopRefreshAction {
  type: 'SHOP_REFRESH';
}

export interface ShopSkillDiscoverAction {
  type: 'SHOP_SKILL_DISCOVER';
  availableSkills: import('@/lib/heroSkills').HeroSkillDefinition[];
}

export interface ShopSelectSkillAction {
  type: 'SHOP_SELECT_SKILL';
  skillId: string;
}

export interface UpgradeCardAction {
  type: 'UPGRADE_CARD';
  cardId: string;
}

export interface ApplyMonsterRewardAction {
  type: 'APPLY_MONSTER_REWARD';
  rewardType: string;
  amount?: number;
  slotId?: EquipmentSlotId;
  bonusType?: 'damage' | 'shield';
}

export interface AdjustShopLevelAction {
  type: 'ADJUST_SHOP_LEVEL';
  delta: number;
}

export interface SetShopLevelAction {
  type: 'SET_SHOP_LEVEL';
  level: number;
}

export interface ClearActiveMonsterRewardAction {
  type: 'CLEAR_ACTIVE_MONSTER_REWARD';
}

/**
 * Remove a monster id from `state.monsterDefeatAnimationIds`. Dispatched by
 * the React-side defeat-animation timer (~`DEFEAT_ANIMATION_DURATION` after
 * the monster was defeated) so the reward modal can finally appear.
 */
export interface EndMonsterDefeatAnimationAction {
  type: 'END_MONSTER_DEFEAT_ANIMATION';
  monsterId: string;
}

export interface CacheMonsterRewardPreviewAction {
  type: 'CACHE_MONSTER_REWARD_PREVIEW';
  monster: GameCardData;
}

export interface SetActiveCardStacksAction {
  type: 'SET_ACTIVE_CARD_STACKS';
  stacks: Record<number, GameCardData[]>;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface StartEventAction {
  type: 'START_EVENT';
  card: GameCardData;
}

export interface CompleteEventAction {
  type: 'COMPLETE_EVENT';
  choiceId?: string;
  skipFlip?: boolean;
}

export interface FinalizeEventAction {
  type: 'FINALIZE_EVENT';
}

export interface GainClassDeckBottomCardsAction {
  type: 'GAIN_CLASS_DECK_BOTTOM_CARDS';
  count: number;
}

export interface ApplyEventEffectAction {
  type: 'APPLY_EVENT_EFFECT';
  token: string;
}

export interface ResolveEventChoiceAction {
  type: 'RESOLVE_EVENT_CHOICE';
  choiceId: string;
  choiceText?: string;
  effectTokens: string[];
  skipFlip?: boolean;
}

export interface SetCurrentEventAction {
  type: 'SET_CURRENT_EVENT';
  card: GameCardData | null;
}

// ---------------------------------------------------------------------------
// Hero skills
// ---------------------------------------------------------------------------

export interface UseHeroSkillAction {
  type: 'USE_HERO_SKILL';
  skillId: string;
  target?: string;
  isExtraSkill?: boolean;
}

export interface ResolveHeroSkillTargetAction {
  type: 'RESOLVE_HERO_SKILL_TARGET';
  slotId?: EquipmentSlotId;
  monsterId?: string;
}

export interface AddMagicGaugeAction {
  type: 'ADD_MAGIC_GAUGE';
  gaugeType: string;
  amount: number;
}

export interface AddPermanentSkillAction {
  type: 'ADD_PERMANENT_SKILL';
  skill: string;
}

export interface UpdateHeroMagicEntryAction {
  type: 'UPDATE_HERO_MAGIC_ENTRY';
  magicId: string;
  entry: import('@/lib/heroMagic').HeroMagicRuntimeState;
}

export interface PersuadeMonsterAction {
  type: 'PERSUADE_MONSTER';
  monsterId: string;
}

export interface SweepAction {
  type: 'SWEEP';
  targetIds: string[];
}

export interface ResetHeroWaveAction {
  type: 'RESET_HERO_WAVE';
}

export interface ActivateHeroMagicAction {
  type: 'ACTIVATE_HERO_MAGIC';
  magicId: string;
  origin: 'gauge' | 'event' | 'skill' | 'card';
}

export interface CompleteHeroMagicAction {
  type: 'COMPLETE_HERO_MAGIC';
  magicId: string;
  origin: 'gauge' | 'event' | 'skill' | 'card';
}

export interface ResolveHeroMagicTargetAction {
  type: 'RESOLVE_HERO_MAGIC_TARGET';
  slotId?: 'equipmentSlot1' | 'equipmentSlot2';
}

export interface ApplyReviveBlessingAction {
  type: 'APPLY_REVIVE_BLESSING';
  slotId: 'equipmentSlot1' | 'equipmentSlot2';
}

// ---------------------------------------------------------------------------
// Discard side effects / card flip / equipment dispose
// ---------------------------------------------------------------------------

export interface ApplyDiscardEffectsAction {
  type: 'APPLY_DISCARD_EFFECTS';
  card: GameCardData;
  owner: 'player' | 'dungeon';
  opts?: { toRecycleBag?: boolean; isEquipmentDisplace?: boolean };
}

export interface ApplyCardFlipAction {
  type: 'APPLY_CARD_FLIP';
  card: GameCardData;
  cellIndex?: number;
}

export interface DisposeEquipmentCardAction {
  type: 'DISPOSE_EQUIPMENT_CARD';
  card: GameCardData;
  isDestruction?: boolean;
  /**
   * When true, fire the destroyed-equipment "last words" effects (onDestroyHeal/Gold/Draw/...,
   * monster-specific lastWords, wraith/skeleton effects) inside the reducer.
   * Used by displacement-style destruction (equipment B replaces A and pushes A out)
   * where the caller has not already triggered last words via combat/event flows.
   * Revive is intentionally NOT triggered by this flag — the original slot has already
   * been overwritten by the new equipment.
   */
  triggerLastWords?: boolean;
  /** The slot the displaced equipment came from. Required when `triggerLastWords` is true. */
  fromSlotId?: import('@/components/game-board/types').EquipmentSlotId;
}

export interface DiscardOwnedCardAction {
  type: 'DISCARD_OWNED_CARD';
  card: GameCardData;
  owner: 'player' | 'dungeon';
  forceGraveyard?: boolean;
  forceRecycleBag?: boolean;
}

/**
 * SACRIFICE_EQUIPMENT_SLOT — destroy the active equipment in the given slot
 * as a player-initiated sacrifice (event choice / event side-effect destroy).
 *
 * Mirrors the events.ts `discardCurrentLeftForGold+15` pattern:
 *   1. Fire destroy-side last-words effects (onDestroyHeal/Gold/Draw/ClassDraw/
 *      PermanentDamage/PermanentShield/Effect, monster-specific lastWords, etc.)
 *      via `applyEquipDestroyLastWords`.
 *   2. Honor revive (hasRevive / hasEquipmentRevive) — revived items stay in slot
 *      with durability=1 and the appropriate `*ReviveUsed` flag.
 *   3. Otherwise enqueue `DISPOSE_EQUIPMENT_CARD { isDestruction: true }` to
 *      route to graveyard / recycle bag (Perm equipment → recycle bag) and
 *      promote the topmost reserve item into the now-empty slot.
 *
 * No-op if the slot is empty.
 */
export interface SacrificeEquipmentSlotAction {
  type: 'SACRIFICE_EQUIPMENT_SLOT';
  slotId: import('@/components/game-board/types').EquipmentSlotId;
}

export interface TickRecycleForgeAction {
  type: 'TICK_RECYCLE_FORGE';
}

export interface RestoreRecycleBagAction {
  type: 'RESTORE_RECYCLE_BAG';
}

// ---------------------------------------------------------------------------
// Combat: weapon attack initiation, kill effects
// ---------------------------------------------------------------------------

export interface InitiateWeaponAttackAction {
  type: 'INITIATE_WEAPON_ATTACK';
  monsterId: string;
  slotId: EquipmentSlotId;
}

export interface ApplyHeroKillEffectsAction {
  type: 'APPLY_HERO_KILL_EFFECTS';
  monsterHpBefore: number;
}

// ---------------------------------------------------------------------------
// Shop: discover, delete confirm, begin discover
// ---------------------------------------------------------------------------

export interface BeginDiscoverAction {
  type: 'BEGIN_DISCOVER';
  source: string;
  pool: GameCardData[];
  sourceLabel?: string;
  /**
   * Where the chosen card should land at RESOLVE_DISCOVER_SELECTION time.
   *   - 'backpack' (default): clone into backpack; overflow → recycle bag
   *     (with `_recycleWaits = recycleDelay ?? 1`).
   *   - 'hand-first': clone into hand if there's room
   *     (handCards.length < getEffectiveHandLimit), else fall back to the
   *     'backpack' path (backpack → recycle bag on overflow). Mirrors the
   *     existing graveyard-discover `delivery` semantics.
   */
  delivery?: 'backpack' | 'hand-first';
  /**
   * @deprecated Class deck is now an infinite template — discover never
   * removes cards from `classDeck`. Field is retained only for type
   * back-compat with existing callers; the value is ignored.
   */
  removeFromClassDeck?: boolean;
}

export interface ResolveDiscoverSelectionAction {
  type: 'RESOLVE_DISCOVER_SELECTION';
  cardId: string;
}

export interface ConfirmDeleteCardAction {
  type: 'CONFIRM_DELETE_CARD';
  cardId: string;
  source: 'hand' | 'backpack' | 'recycleBag' | 'equipment' | 'amulet';
}

export interface RequestGraveyardSelectionAction {
  type: 'REQUEST_GRAVEYARD_SELECTION';
  maxOptions: number;
  delivery?: 'backpack' | 'hand-first';
  /** When provided, restricts the discoverable graveyard pool to these card ids. */
  eligibleCardIds?: string[];
}

export interface BeginGhostBladeExileAction {
  type: 'BEGIN_GHOST_BLADE_EXILE';
}

// ---------------------------------------------------------------------------
// Card play handlers: mirror copy, amplify, perm grant, etc.
// ---------------------------------------------------------------------------

export interface ResolveMirrorCopyAction {
  type: 'RESOLVE_MIRROR_COPY';
  selection: import('./types').MirrorCopySelection;
}

export interface CancelMirrorCopyAction {
  type: 'CANCEL_MIRROR_COPY';
}

export interface ResolveMonsterFusionAction {
  type: 'RESOLVE_MONSTER_FUSION';
  selection: import('./types').MonsterFusionSelection;
}

export interface CancelMonsterFusionAction {
  type: 'CANCEL_MONSTER_FUSION';
}

export interface ResolveAmplifyAction {
  type: 'RESOLVE_AMPLIFY';
  selection: import('./types').AmplifySelection;
}

export interface CancelAmplifyAction {
  type: 'CANCEL_AMPLIFY';
}

/**
 * 按卡名累计增幅。会同时：更新 state.amplifiedCardBonus[cardName]，
 * 并将所有同名已存在卡（手牌/装备 + 储备/背包/坟场/回收袋/职业牌组/地下城行）
 * 的数值通过 applyAmplifyToCard 立即应用增益。
 */
export interface AmplifyCardsByNameAction {
  type: 'AMPLIFY_CARDS_BY_NAME';
  cardName: string;
  amount: number;
  /** 可选：日志/横幅显示用的来源描述（如「增幅祭坛」「增幅」）。 */
  source?: string;
}

export interface ResolvePermGrantAction {
  type: 'RESOLVE_PERM_GRANT';
  targetCardId: string;
}

export interface ApplyTransformCategoryAction {
  type: 'APPLY_TRANSFORM_CATEGORY';
  card: GameCardData;
}

/**
 * 把一张 building 牌（含命运之刃 / 增幅祭坛等）从手牌或背包放进地城列。
 * Reducer 自己负责：随机选空 slot、放置到 activeCards 或 discardedCards、emit 日志、
 * 处理命运之刃自伤、末尾 enqueue APPLY_TRANSFORM_CATEGORY。
 * Hook 仍负责调用前的来源清理（consumeCardFromHand / removeCard 等）。
 */
export interface PlaceBuildingInDungeonAction {
  type: 'PLACE_BUILDING_IN_DUNGEON';
  card: GameCardData;
  source: 'hand' | 'backpack';
}

/**
 * 标记"手牌拖到装备栏"是一次 play。
 * Reducer 负责：
 *   - 调用 `executeOnEquip` 跑装备的 onEquipEffect（金币 +6 / 临时攻 +3 等）
 *   - 处理 `equip-empower` 永恒护符（该装备栏临时攻 +3、临时护甲 +3）
 *   - enqueue APPLY_TRANSFORM_CATEGORY 进入 transform 链
 * 装备槽放置 / displacement / 怪物特定入场效果 仍由 hook 层处理（dispatch
 * 此 action 之前已经完成 SET_EQUIPMENT_SLOT）。
 *
 * `slotId` 必传：标记新装备落入的槽位，决定 onEquipEffect / equip-empower
 * 作用于哪个槽。
 */
export interface EquipFromHandAction {
  type: 'EQUIP_FROM_HAND';
  card: GameCardData;
  slotId: EquipmentSlotId;
}

/**
 * Thin marker — 标记"手牌打出护符到护符栏"是一次 play。
 * Reducer 仅 enqueue APPLY_TRANSFORM_CATEGORY；护符放置/aura/displacement 等
 * 仍由 hook 层处理。
 */
export interface EquipAmuletFromHandAction {
  type: 'EQUIP_AMULET_FROM_HAND';
  card: GameCardData;
}

export interface ResolveDeckJudgeAction {
  type: 'RESOLVE_DECK_JUDGE';
  card: GameCardData;
}

export interface ResolveStatSwapAction {
  type: 'RESOLVE_STAT_SWAP';
  card: GameCardData;
  targetMonsterId: string;
  isFlank: boolean;
}

export interface ReturnEquipmentToHandAction {
  type: 'RETURN_EQUIPMENT_TO_HAND';
  slotId: EquipmentSlotId;
  includeReserve?: boolean;
}

export interface ProcessHeroMagicCardAction {
  type: 'PROCESS_HERO_MAGIC_CARD';
  card: GameCardData;
}

export interface ApplyBerserkerRageAction {
  type: 'APPLY_BERSERKER_RAGE';
  origin: 'gauge' | 'card';
}

export interface TriggerGraveNovaAction {
  type: 'TRIGGER_GRAVE_NOVA';
  card?: GameCardData;
}

/**
 * 魔弹风暴 — fire one bolt. Each bolt picks a random live monster at fire time
 * (so the bolt is not wasted if the original target died, and naturally lands
 * on a revived monster if revival happens mid-storm). Pre-computed `damage`
 * carries the per-bolt amplify already applied by the resolver.
 */
export interface FireMissileStormBoltAction {
  type: 'FIRE_MISSILE_STORM_BOLT';
  damage: number;
  boltIndex: number;
  totalBolts: number;
}

export interface CancelPermGrantAction {
  type: 'CANCEL_PERM_GRANT';
}

export interface ResolveRepairEnrageDiceAction {
  type: 'RESOLVE_REPAIR_ENRAGE_DICE';
  card: GameCardData;
  slotId: EquipmentSlotId;
  // monsterId is optional: when no monsters are on the board, the card can
  // still be played; an enrage outcome simply has no target to enrage.
  monsterId?: string;
  diceResultId: 'repair' | 'enrage';
}

export interface ResolvePotionRepairAction {
  type: 'RESOLVE_POTION_REPAIR';
  card: GameCardData;
  slotId: EquipmentSlotId;
  amount: number;
}

// ---------------------------------------------------------------------------
// Hero: magic slot/monster selection, sweep, dungeon card selection
// ---------------------------------------------------------------------------

export interface ResolveMagicSlotSelectionAction {
  type: 'RESOLVE_MAGIC_SLOT_SELECTION';
  magicId: string;
  slotId: EquipmentSlotId;
}

export interface ResolveMagicMonsterSelectionAction {
  type: 'RESOLVE_MAGIC_MONSTER_SELECTION';
  magicId: string;
  /** 当 targetType === 'hero' 或 'shield-slot' 时为空字符串，仅作占位。 */
  monsterId: string;
  /**
   * 单目标伤害 magic 现在允许把 Hero Cell 也作为合法目标（自伤路径），
   * 以及装有盾的装备槽（armor 吃伤 + 溢出走自伤）。
   * 缺省 'monster' 以保持向后兼容；只有在 pendingMagicAction.allowsHeroTarget === true
   * 且玩家点击对应 UI 时，UI 才会派送 'hero' / 'shield-slot'。
   */
  targetType?: 'monster' | 'hero' | 'shield-slot';
  /** 仅当 targetType === 'shield-slot' 时使用：被打的盾所在的装备槽。 */
  slotId?: EquipmentSlotId;
}

export interface ResolveDungeonCardSelectionAction {
  type: 'RESOLVE_DUNGEON_CARD_SELECTION';
  cardId: string;
  targetIndex: number;
}

/**
 * 整顿背囊：玩家最终确认要放回背包顶部的卡牌列表（最多 3 张，按照
 * pendingMagicAction.maxSelections 进一步截断）。
 *
 * Each selection identifies one card by its source location:
 *   - 'hand'      → state.handCards (matched by card.id)
 *   - 'amulet'    → state.amuletSlots (matched by card.id)
 *   - 'equipment' → equipmentSlot1 / equipmentSlot2 (matched by slot id)
 *
 * 选择顺序即放置顺序：最后一项被追加到 backpackItems 末尾（即概念上的「顶」）。
 * 装备/护符直接从其槽位移除，不会触发任何 break flow / lastWords / 转金币 等逻辑。
 */
export interface ResolvePushToBackpackTopAction {
  type: 'RESOLVE_PUSH_TO_BACKPACK_TOP';
  selections: Array<{ source: 'hand' | 'amulet' | 'equipment'; id: string }>;
}

/**
 * RESOLVE_HAND_DISCARD_SELECTION — 玩家手动选择 N 张手牌弃回的确认动作。
 * 由 HandDiscardSelectionModal 在玩家点击「确认弃回」时派发。
 *
 * cardIds 长度必须严格等于 state.pendingHandDiscardSelection.count；不匹配视为
 * 非法输入，reducer 会拒绝处理。reducer 会读取 pendingHandDiscardSelection.subEffect
 * + context 来执行对应后续效果（弃到坟场/回收袋、抽牌、发现等）。
 */
export interface ResolveHandDiscardSelectionAction {
  type: 'RESOLVE_HAND_DISCARD_SELECTION';
  cardIds: string[];
}

// ---------------------------------------------------------------------------
// Event: resolve event interaction
// ---------------------------------------------------------------------------

export interface ResolveEventInteractionAction {
  type: 'RESOLVE_EVENT_INTERACTION';
  token: string;
  data?: Record<string, unknown>;
}

/**
 * 翻转之契 option 6 — 熔铸耐久
 * Marks the chosen equipment (in slot1, slot2, or either reserve list) with
 * `_flipRepairBuff = true`. Subsequent forward card flips will repair 1
 * durability on every marked equipment (handled in reduceApplyCardFlip).
 */
export interface ResolveEventGrantEquipFlipRepairAction {
  type: 'RESOLVE_EVENT_GRANT_EQUIP_FLIP_REPAIR';
  equipmentId: string;
}

/**
 * 附魔祭坛 — 选择装备赋予「遗言：生命值上限+4」
 * Increments `lastWordsMaxHpBoost` on the chosen main-slot equipment.
 * Stacks (parallel to lastWordsSlotTempBuff): each grant adds another +4.
 * On break / displacement, fires permanent maxHp += 4 × stacks (no current-HP heal).
 * Only applies to equipmentSlot1 / equipmentSlot2 (no reserve).
 */
export interface ResolveEventGrantLastWordsMaxHpAction {
  type: 'RESOLVE_EVENT_GRANT_LASTWORDS_MAXHP';
  equipmentSlotId: 'equipmentSlot1' | 'equipmentSlot2';
  amount: number;
}

// ---------------------------------------------------------------------------
// Event: continue pending effects after interaction
// ---------------------------------------------------------------------------

export interface ContinueEventEffectsAction {
  type: 'CONTINUE_EVENT_EFFECTS';
}

// ---------------------------------------------------------------------------
// Waterfall: apply discard effects
// ---------------------------------------------------------------------------

export interface ApplyWaterfallEffectsAction {
  type: 'APPLY_WATERFALL_EFFECTS';
}

export interface ApplyWaterfallDiscardEffectsAction {
  type: 'APPLY_WATERFALL_DISCARD_EFFECTS';
  discardCard: GameCardData;
  /** The mutable remaining deck after planning; updated in-place by returnToDeck / swarmInfest */
  nextRemainingDeck: GameCardData[];
  discardPreviewIndex: number | null;
}

export interface ApplyWaterfallDropAction {
  type: 'APPLY_WATERFALL_DROP';
}

export interface ApplyWaterfallDealAction {
  type: 'APPLY_WATERFALL_DEAL';
}

export interface CompleteWaterfallAction {
  type: 'COMPLETE_WATERFALL';
}

// ---------------------------------------------------------------------------
// Card deletion (shop / event)
// ---------------------------------------------------------------------------

export interface DeleteCardAction {
  type: 'DELETE_CARD';
  cardId: string;
  source: 'hand' | 'backpack' | 'recycleBag' | 'equipment' | 'amulet';
  /** Where the card ends up after removal. */
  destination: 'graveyard' | 'recycleBag';
  /** Context label for logging. */
  context?: 'shop' | 'event' | 'general';
  contextLabel?: string;
}

// ---------------------------------------------------------------------------
// Economy / field mutations (SET_STATE elimination)
// ---------------------------------------------------------------------------

export interface ModifyGoldAction {
  type: 'MODIFY_GOLD';
  delta: number;
  source: string;
}

export interface ModifyStunCapAction {
  type: 'MODIFY_STUN_CAP';
  delta: number;
}

export interface ModifySlotTempAttackAction {
  type: 'MODIFY_SLOT_TEMP_ATTACK';
  slotId: import('@/components/game-board/types').EquipmentSlotId;
  delta: number;
}

export interface ModifySlotTempArmorAction {
  type: 'MODIFY_SLOT_TEMP_ARMOR';
  slotId: import('@/components/game-board/types').EquipmentSlotId;
  delta: number;
}

export type CombatFlagKey =
  | 'vampiricNextAttack'
  | 'doubleNextMagic'
  | 'unbreakableNext'
  | 'defensiveStanceActive'
  | 'gambitExtraActive'
  | 'berserkerRageActive'
  | 'heroStunned'
  | 'wraithPassiveEnabled'
  | 'bugletAmuletObtained'
  | 'statSwapCardObtained'
  | 'shopDeleteUsed'
  | 'heroSkillUsedThisWave';

export interface SetCombatFlagAction {
  type: 'SET_COMBAT_FLAG';
  flag: CombatFlagKey;
  value: boolean;
}

export type PermanentStatKey =
  | 'permanentSpellDamageBonus'
  | 'permanentSpellLifesteal'
  | 'permanentMaxHpBonus'
  | 'handLimitBonus'
  | 'backpackCapacityModifier'
  | 'persuadeCostModifier'
  | 'persuadeLevel'
  | 'persuadeAmuletBonus'
  | 'waterfallDealBonus'
  | 'magicCardsPlayedThisTurn'
  | 'damageMagicPlayedThisTurn'
  | 'cardsPlayed'
  | 'waveDiscardCount'
  | 'recycleForgePlayCount'
  | 'extraAttackCharges'
  | 'gambitExtraPerSlot'
  | 'blockDurabilityPerSlot'
  | 'tempShield'
  | 'bulwarkPassiveActive'
  | 'bulwarkTempArmorStacks'
  | 'weaponMasterBonus'
  | 'shieldMasterBonus'
  | 'nextWeaponBonus'
  | 'nextShieldBonus';

export interface ModifyPermanentStatAction {
  type: 'MODIFY_PERMANENT_STAT';
  stat: PermanentStatKey;
  delta: number;
}

export interface AddCardToHandAction {
  type: 'ADD_CARD_TO_HAND';
  card: GameCardData;
}

/**
 * 上手 keyword: triggers a card's onEnterHandEffect when it enters the hand.
 * Enqueued automatically by the reducer's post-processing when a new card with
 * `onEnterHandEffect` set (and without `_skipOnEnterHand: true`) is detected
 * in `state.handCards` after a reduce step.
 */
export interface TriggerOnEnterHandAction {
  type: 'TRIGGER_ON_ENTER_HAND';
  cardId: string;
}

export interface AddCardsToHandAction {
  type: 'ADD_CARDS_TO_HAND';
  cards: GameCardData[];
}

export interface RemoveCardFromHandAction {
  type: 'REMOVE_CARD_FROM_HAND';
  cardId: string;
}

export interface RemoveCardsFromHandAction {
  type: 'REMOVE_CARDS_FROM_HAND';
  cardIds: string[];
}

export interface DiscardAllHandAction {
  type: 'DISCARD_ALL_HAND';
}

export interface UpdateHandCardsAction {
  type: 'UPDATE_HAND_CARDS';
  updater: (cards: GameCardData[]) => GameCardData[];
}

export interface UpdateMonsterCardAction {
  type: 'UPDATE_MONSTER_CARD';
  monsterId: string;
  patch: Partial<GameCardData>;
}

export interface FlushRecycleToBackpackAction {
  type: 'FLUSH_RECYCLE_TO_BACKPACK';
}

export interface AddPermanentMagicToRecycleAction {
  type: 'ADD_PERMANENT_MAGIC_TO_RECYCLE';
  card: GameCardData;
}

export interface RemovePermanentMagicFromRecycleAction {
  type: 'REMOVE_PERMANENT_MAGIC_FROM_RECYCLE';
  cardId: string;
}

export interface SetEquipmentSlotAction {
  type: 'SET_EQUIPMENT_SLOT';
  slotId: 'equipmentSlot1' | 'equipmentSlot2';
  card: GameCardData | null;
}

export interface ModifyEquipmentDurabilityAction {
  type: 'MODIFY_EQUIPMENT_DURABILITY';
  slotId: 'equipmentSlot1' | 'equipmentSlot2';
  delta: number;
}

export interface UpdateAmuletSlotAction {
  type: 'UPDATE_AMULET_SLOT';
  slotIndex: number;
  patch: Partial<GameCardData>;
}

export interface ModifyMaxAmuletSlotsAction {
  type: 'MODIFY_MAX_AMULET_SLOTS';
  delta: number;
}

export interface RemoveAmuletAction {
  type: 'REMOVE_AMULET';
  cardId: string;
}

export interface UpdateGameLogAction {
  type: 'UPDATE_GAME_LOG';
  entry: import('@/components/GameLogPanel').LogEntry;
}

export interface SetGameFlagsAction {
  type: 'SET_GAME_FLAGS';
  patch: Partial<Pick<import('./types').GameState,
    | 'nextWeaponBonus' | 'nextShieldBonus'
    | 'weaponMasterBonus' | 'shieldMasterBonus'
    | 'nextAttackLifestealSlot'
    | 'slotAttackBursts' | 'berserkTurnBuff'
    | 'gambitSlotUsed' | 'weaponExtraAttackUsed'
    | 'berserkerSlotUsed' | 'flashSlotUsed'
    | 'unbreakableUntilWaterfall'
    | 'lastPlayedCardCategory' | 'transformChainPrevCategory' | 'consecutiveTransformStreak'
    | 'lastPersuadeTargetId' | 'consecutivePersuadeCount'
    | 'persuadeSameTargetCostHalve' | 'persuadeRaceBonus'
    | 'persuadeSuccessDurabilityBonus' | 'persuadeDiscount'
    | 'classCardsInHand'
    | 'turnCount' | 'shopLevel' | 'monstersDefeated'
    | 'totalDamageTaken' | 'totalHealed' | 'healAccumulator'
    | 'turnDamageTaken' | 'totalWins' | 'undoCount'
    | 'classDamageDiscoverStreak' | 'monsterKillUpgradeProgress'
    | 'recycleBackpackProgress' | 'swapUpgradeProgress'
    | 'flipOverkillLifestealProgress' | 'equipAmuletCapProgress'
    | 'stunAttemptDiscoverProgress'
    | 'equipmentSlotCapacity'
    | 'honorSweepUpgradesPending'
    | 'processedDungeonCardIds' | 'pendingAutoDrawCount'
    | 'combatState'
    | 'selectedMonsterRewards' | 'activeMonsterReward' | 'monsterRewardQueue'
    | 'previewCards' | 'previewCardStacks' | 'activeCardStacks'
    | 'remainingDeck'
    | 'equipmentSlot1Reserve' | 'equipmentSlot2Reserve'
    | 'equipmentSlotBonuses'
    | 'phase'
    | 'currentEventCard'
    | 'resolvingDungeonCardId'
    | 'handCards' | 'discardedCards'
    | 'permanentMagicRecycleBag' | 'backpackItems' | 'amuletSlots'
    | 'classDeck'
    | 'equipmentSlot1' | 'equipmentSlot2'
    | 'equipmentSlot1Reserve' | 'equipmentSlot2Reserve'
    | 'shopOfferings' | 'shopSourceEvent'
    | 'shopDeleteUsed' | 'shopHealUsed' | 'shopLevelUpUsed'
    | 'shopSkillDiscoverUsed' | 'deleteModalOpen'
    | 'shopModalOpen' | 'shopModalMinimized'
    | 'isHydrated' | 'heroVariant' | 'selectedHeroSkill'
    | 'showSkillSelection' | 'showCardDraft' | 'cardDraftPool'
    | 'drawPending' | 'permanentSkills'
    | 'handLimitBonus' | 'persuadeAmuletBonus'
    | 'magicCardsPlayedThisTurn' | 'recycleForgePlayCount'
    | 'gambitExtraPerSlot' | 'heroMagicState'
    | 'rng'
    | 'gameLogEntries'
    | 'slotExtraAttacks'
  >>;
}

export interface UpdateActiveCardsAction {
  type: 'UPDATE_ACTIVE_CARDS';
  updater: (cards: ActiveRowSlots) => ActiveRowSlots;
}

export interface UpdateDiscardedCardsAction {
  type: 'UPDATE_DISCARDED_CARDS';
  updater: (cards: GameCardData[]) => GameCardData[];
}

export interface UpdateBackpackItemsAction {
  type: 'UPDATE_BACKPACK_ITEMS';
  updater: (items: GameCardData[]) => GameCardData[];
}

export interface UpdateRecycleBagAction {
  type: 'UPDATE_RECYCLE_BAG';
  updater: (bag: GameCardData[]) => GameCardData[];
}

export interface UpdateEternalRelicsAction {
  type: 'UPDATE_ETERNAL_RELICS';
  updater: (relics: import('./types').EternalRelic[]) => import('./types').EternalRelic[];
}

export interface UpdateClassDeckAction {
  type: 'UPDATE_CLASS_DECK';
  updater: (deck: GameCardData[]) => GameCardData[];
}

export interface UpdateRemainingDeckAction {
  type: 'UPDATE_REMAINING_DECK';
  updater: (deck: GameCardData[]) => GameCardData[];
}

export interface UpdateAmuletSlotsAction {
  type: 'UPDATE_AMULET_SLOTS';
  updater: (slots: GameCardData[]) => GameCardData[];
}

// ---------------------------------------------------------------------------
// Card operations (Phase 3)
// ---------------------------------------------------------------------------

export interface ConvertAmuletsToGoldAction {
  type: 'CONVERT_AMULETS_TO_GOLD';
  amountPer: number;
}

export interface DrawClassToBackpackAction {
  type: 'DRAW_CLASS_TO_BACKPACK';
  count: number;
  filter?: 'hero-magic' | 'weapon' | 'shield' | 'equipment';
  excludeIds?: string[];
  /**
   * Optional allow-list of template card ids. When provided, only class-deck
   * cards whose id appears in this list are considered as candidates. Useful
   * for "clone this specific template card into the backpack" flows (e.g.
   * 盾墙起手's thunder seal, the opening skill preview pick).
   */
  includeIds?: string[];
}

// ---------------------------------------------------------------------------
// Pending-action state machines (Phase 7A)
// ---------------------------------------------------------------------------

export interface SetPendingMagicAction {
  type: 'SET_PENDING_MAGIC';
  payload: import('./types').PendingMagicAction | null;
}

export interface SetPendingPotionAction {
  type: 'SET_PENDING_POTION';
  payload: import('./types').PendingPotionAction | null;
}

export interface SetPendingHeroSkillAction {
  type: 'SET_PENDING_HERO_SKILL';
  payload: import('./types').PendingHeroSkillAction | null;
}

export interface SetPendingHeroMagicActionAction {
  type: 'SET_PENDING_HERO_MAGIC';
  payload: import('./types').PendingHeroMagicAction | null;
}

export interface SetDeathWardPromptAction {
  type: 'SET_DEATH_WARD_PROMPT';
  payload: import('./types').DeathWardPromptState | null;
}

export interface SetCardActionContextAction {
  type: 'SET_CARD_ACTION_CONTEXT';
  payload: import('./types').CardActionContext | null;
}

export interface SetGraveyardDiscoverStateAction {
  type: 'SET_GRAVEYARD_DISCOVER_STATE';
  payload: import('@/components/GameCard').GameCardData[] | null;
  delivery?: 'backpack' | 'hand-first';
}

export interface SetPermGrantModalAction {
  type: 'SET_PERM_GRANT_MODAL';
  payload: import('./types').GameState['permGrantModal'];
}

export interface SetEquipmentPromptAction {
  type: 'SET_EQUIPMENT_PROMPT';
  payload: import('./types').EquipmentPromptState | null;
}

export interface SetMirrorCopyModalAction {
  type: 'SET_MIRROR_COPY_MODAL';
  payload: { sourceCardId: string } | null;
}

export interface SetMonsterFusionModalAction {
  type: 'SET_MONSTER_FUSION_MODAL';
  payload: { sourceCardId: string } | null;
}

export interface SetAmplifyModalAction {
  type: 'SET_AMPLIFY_MODAL';
  payload: { sourceCardId: string } | null;
}

export interface SetEventAmplifyHandPickerAction {
  type: 'SET_EVENT_AMPLIFY_HAND_PICKER';
  payload: { eventCardId: string; cellIdx: number } | null;
}

export interface SetEventDiceModalAction {
  type: 'SET_EVENT_DICE_MODAL';
  payload: import('./types').EventDiceModalState | null;
}

export interface SetMagicChoiceModalAction {
  type: 'SET_MAGIC_CHOICE_MODAL';
  payload: import('./types').MagicChoiceModalState | null;
}

export interface SetPersuadeStateAction {
  type: 'SET_PERSUADE_STATE';
  payload: import('./types').PersuadeModalState | null;
}

export interface SetEventTransformStateAction {
  type: 'SET_EVENT_TRANSFORM_STATE';
  payload: import('./types').EventTransformState | null;
}

export interface SetHandMagicUpgradeModalAction {
  type: 'SET_HAND_MAGIC_UPGRADE_MODAL';
  payload: { sourceCardId: string } | null;
}

export interface SetGhostBladeExileCardsAction {
  type: 'SET_GHOST_BLADE_EXILE_CARDS';
  payload: GameCardData[] | null;
}

export interface SetPreviewCardsAction {
  type: 'SET_PREVIEW_CARDS';
  payload: ActiveRowSlots;
}

export interface SetSwapUpgradeProgressAction {
  type: 'SET_SWAP_UPGRADE_PROGRESS';
  payload: import('./types').GameState['swapUpgradeProgress'];
}

// ---------------------------------------------------------------------------
// UI modal toggles (Phase 7A — simple boolean/value setters)
// ---------------------------------------------------------------------------

export interface SetEventModalOpenAction {
  type: 'SET_EVENT_MODAL_OPEN';
  open: boolean;
}

export interface SetEventModalMinimizedAction {
  type: 'SET_EVENT_MODAL_MINIMIZED';
  minimized: boolean;
}

export interface SetDeleteModalOpenAction {
  type: 'SET_DELETE_MODAL_OPEN';
  open: boolean;
}

export interface SetUpgradeModalOpenAction {
  type: 'SET_UPGRADE_MODAL_OPEN';
  open: boolean;
  maxCount?: number;
}

export interface SetDiscoverModalAction {
  type: 'SET_DISCOVER_MODAL';
  open: boolean;
  options?: GameCardData[];
  sourceLabel?: string | null;
}

export interface SetShopModalOpenAction {
  type: 'SET_SHOP_MODAL_OPEN';
  open: boolean;
}

export interface SetShopModalMinimizedAction {
  type: 'SET_SHOP_MODAL_MINIMIZED';
  minimized: boolean;
}

export interface SetDiscoverModalMinimizedAction {
  type: 'SET_DISCOVER_MODAL_MINIMIZED';
  minimized: boolean;
}

export interface SetGraveyardDiscoverMinimizedAction {
  type: 'SET_GRAVEYARD_DISCOVER_MINIMIZED';
  minimized: boolean;
}

export interface SetMonsterRewardMinimizedAction {
  type: 'SET_MONSTER_REWARD_MINIMIZED';
  minimized: boolean;
}

/**
 * Fold every currently-open foldable modal in one shot.
 * Dispatched by any foldable modal's outside-click / X / ESC path so that
 * a single dismiss gesture collapses the entire modal stack at once.
 *
 * Foldable modals covered:
 *   - eventModal (event choice)
 *   - shopModal
 *   - discoverModal (class discover)
 *   - graveyardDiscoverState (graveyard recall)
 *   - activeMonsterReward (loot)
 *
 * Each surviving open-state gets its own bottom pill via FloatingPillsContainer
 * so the player can restore them individually.
 */
export interface MinimizeAllModalsAction {
  type: 'MINIMIZE_ALL_MODALS';
}

export interface SetHeroSkillBannerAction {
  type: 'SET_HERO_SKILL_BANNER';
  message: string | null;
}

export interface SetGameOverAction {
  type: 'SET_GAME_OVER';
  victory: boolean;
}

// ---------------------------------------------------------------------------
// Equipment slot capacity / reserve / bonus
// ---------------------------------------------------------------------------

export interface SetEquipmentSlotCapacityAction {
  type: 'SET_EQUIPMENT_SLOT_CAPACITY';
  slotId: EquipmentSlotId;
  delta: number;
}

export interface SetEquipmentReserveAction {
  type: 'SET_EQUIPMENT_RESERVE';
  slotId: EquipmentSlotId;
  items: GameCardData[];
}

export interface SetEquipmentSlotBonusAction {
  type: 'SET_EQUIPMENT_SLOT_BONUS';
  slotId: EquipmentSlotId;
  bonusType: 'damage' | 'shield';
  value: number;
}

// ---------------------------------------------------------------------------
// Equipment slot burst / berserk buff
// ---------------------------------------------------------------------------

export interface SetSlotAttackBurstAction {
  type: 'SET_SLOT_ATTACK_BURST';
  slotId: EquipmentSlotId;
  amount: number;
}

export interface ClearBerserkBuffAction {
  type: 'CLEAR_BERSERK_BUFF';
}

export interface AddBerserkBuffAction {
  type: 'ADD_BERSERK_BUFF';
  amount: number;
}

// ---------------------------------------------------------------------------
// Honor sweep upgrades (Phase 8D)
// ---------------------------------------------------------------------------

export interface CheckHonorSweepUpgradesAction {
  type: 'CHECK_HONOR_SWEEP_UPGRADES';
}

// ---------------------------------------------------------------------------
// Dungeon card processing (Phase 8B)
// ---------------------------------------------------------------------------

export interface RegisterDungeonCardProcessedAction {
  type: 'REGISTER_DUNGEON_CARD_PROCESSED';
  cardId: string;
  source: 'remove-card' | 'slot-cleared' | 'backpack-store';
}

export interface ProcessAutoDrawsAction {
  type: 'PROCESS_AUTO_DRAWS';
}

// ---------------------------------------------------------------------------
// Utility / enforcement actions
// ---------------------------------------------------------------------------

export interface DequeueMonsterRewardAction {
  type: 'DEQUEUE_MONSTER_REWARD';
}

export interface EnforceBackpackCapacityAction {
  type: 'ENFORCE_BACKPACK_CAPACITY';
}

export interface CheckWraithPurificationAction {
  type: 'CHECK_WRAITH_PURIFICATION';
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Interactive continuations (player responded to a UI prompt)
// ---------------------------------------------------------------------------

export interface ResolveDiceAction {
  type: 'RESOLVE_DICE';
  /** The matched dice entry id, or null if no match */
  outcomeId: string | null;
  /** Raw dice value */
  value: number;
  /** Contextual data passed through from the request */
  context?: Record<string, unknown>;
}

/**
 * Hook-initiated dice flow pre-roll. Reducer rolls a D20 from seeded RNG,
 * advances state.rng, and stashes the value in `state.lastFlowDiceRoll` for
 * the dispatching hook to consume immediately. The dice modal then animates
 * to that predetermined value (UI is purely visual playback).
 *
 * Use only when the dice flow is started by a UI/hook event that has no
 * existing reducer-side emission point. For reducer-emitted dice (most
 * `ui:requestDice` cases), roll inline at the emission site instead and pass
 * the value through the side-effect payload.
 */
export interface RollDiceForFlowAction {
  type: 'ROLL_DICE_FOR_FLOW';
}

export interface ResolveEquipmentChoiceAction {
  type: 'RESOLVE_EQUIPMENT_CHOICE';
  slotId: string;
  context?: Record<string, unknown>;
}

export interface ResolveMagicChoiceAction {
  type: 'RESOLVE_MAGIC_CHOICE';
  choiceId: string;
  context?: Record<string, unknown>;
}

export interface ResolveCardActionAction {
  type: 'RESOLVE_CARD_ACTION';
  cardId: string;
  actionType: string;
  context?: Record<string, unknown>;
}

export interface ResolveGraveyardSelectionAction {
  type: 'RESOLVE_GRAVEYARD_SELECTION';
  cardIds: string[];
  context?: Record<string, unknown>;
}

export interface MarkSkillUsedAction {
  type: 'MARK_SKILL_USED';
  skillId: import('./types').HeroSkillId;
}

// Composite / meta actions
// ---------------------------------------------------------------------------

export interface EnqueueActionsAction {
  type: 'ENQUEUE_ACTIONS';
  actions: GameAction[];
}

export interface NoOpAction {
  type: 'NO_OP';
}

// ---------------------------------------------------------------------------
// Monster skill floating-text — blocking UI animation queue
// ---------------------------------------------------------------------------

/**
 * Queue a "this monster just used <skillName>" float over the given monster
 * card and freeze the pipeline until the UI ack arrives. Multiple TRIGGER
 * actions in the same drain step append to `pendingSkillFloats` and the
 * pipeline drains them one at a time.
 */
export interface TriggerMonsterSkillFloatAction {
  type: 'TRIGGER_MONSTER_SKILL_FLOAT';
  monsterId: string;
  skillKey: import('./monsterSkillNames').MonsterSkillKey;
}

/**
 * Sent by the UI hook after each float animation finishes. Pops the head of
 * `pendingSkillFloats`. If the queue still has entries, emits the next
 * `ui:monsterSkillFloat` for the hook to play. If empty, restores
 * `phase` to `skillFloatSavedPhase` and the pipeline resumes.
 */
export interface ReleaseMonsterSkillFloatAction {
  type: 'RELEASE_MONSTER_SKILL_FLOAT';
  floatId: string;
}

/** Reset the PRNG seed (used at game start and for replay). */
export interface SeedRngAction {
  type: 'SEED_RNG';
  seed: number;
}

/** Initialize a fresh game (deck construction, hero selection, row dealing). */
export interface InitGameAction {
  type: 'INIT_GAME';
  mode: 'normal' | 'quick';
  totalWins: number;
  eternalRelics: import('./types').EternalRelic[];
}

// ---------------------------------------------------------------------------
// Combat / Hero / Shop / Game state (typed SET_GAME_FLAGS replacements)
// ---------------------------------------------------------------------------

export interface ResetBerserkerSlotAction {
  type: 'RESET_BERSERKER_SLOT';
}

export interface SetGambitStateAction {
  type: 'SET_GAMBIT_STATE';
  extraPerSlot: number;
}

export interface SetLifestealSlotAction {
  type: 'SET_LIFESTEAL_SLOT';
  slotId: import('@/components/game-board/types').EquipmentSlotId | null;
}

export interface SetHonorSweepPendingAction {
  type: 'SET_HONOR_SWEEP_PENDING';
  count: number;
}

export interface SetLastPlayedCategoryAction {
  type: 'SET_LAST_PLAYED_CATEGORY';
  category: string | null;
}

export interface ClampHpAction {
  type: 'CLAMP_HP';
  maxHp: number;
}

export interface OpenShopModalAction {
  type: 'OPEN_SHOP_MODAL';
  offerings: import('@/components/ShopModal').ShopOffering[];
  sourceEvent: GameCardData;
}

export interface EnqueueMonsterRewardAction {
  type: 'ENQUEUE_MONSTER_REWARD';
  entry: import('./types').MonsterRewardDrop;
}

export interface RemovePreviewCardStacksAction {
  type: 'REMOVE_PREVIEW_CARD_STACKS';
  indices: number[];
}

export interface IncrementTurnCountAction {
  type: 'INCREMENT_TURN_COUNT';
  delta: number;
}

export interface SetHandLimitBonusAction {
  type: 'SET_HAND_LIMIT_BONUS';
  bonus: number;
}

// ---------------------------------------------------------------------------
// Equipment / Amulet state (typed SET_GAME_FLAGS replacements)
// ---------------------------------------------------------------------------

export interface SwapEquipmentSlotsAction {
  type: 'SWAP_EQUIPMENT_SLOTS';
}

export interface FilterEquipmentReservesAction {
  type: 'FILTER_EQUIPMENT_RESERVES';
  cardId: string;
}

export interface SetAmuletSlotsAction {
  type: 'SET_AMULET_SLOTS';
  slots: GameCardData[];
}

export interface SetRecycleBackpackProgressAction {
  type: 'SET_RECYCLE_BACKPACK_PROGRESS';
  progress: number;
}

// ---------------------------------------------------------------------------
// Card / Deck / Recycle state (typed SET_GAME_FLAGS replacements)
// ---------------------------------------------------------------------------

export interface SetHandCardsAction {
  type: 'SET_HAND_CARDS';
  cards: GameCardData[];
}

export interface AddClassCardToHandAction {
  type: 'ADD_CLASS_CARD_TO_HAND';
  card: GameCardData;
}

export interface RemoveClassCardFromHandAction {
  type: 'REMOVE_CLASS_CARD_FROM_HAND';
  cardId: string;
}

export interface SetDiscardedCardsAction {
  type: 'SET_DISCARDED_CARDS';
  cards: GameCardData[];
}

export interface SetMagicRecycleBagAction {
  type: 'SET_MAGIC_RECYCLE_BAG';
  bag: GameCardData[];
}

export interface SetClassDeckAndBackpackAction {
  type: 'SET_CLASS_DECK_AND_BACKPACK';
  classDeck: GameCardData[];
  backpackItems: GameCardData[];
  permanentMagicRecycleBag?: GameCardData[];
}

export interface SetBackpackItemsAction {
  type: 'SET_BACKPACK_ITEMS';
  items: GameCardData[];
}

// ---------------------------------------------------------------------------
// UI / Phase / Meta flags (typed SET_GAME_FLAGS replacements)
// ---------------------------------------------------------------------------

export interface SetPhaseAction {
  type: 'SET_PHASE';
  phase: import('./types').GamePhase;
}

export interface SetUndoCountAction {
  type: 'SET_UNDO_COUNT';
  count: number;
}

export interface SetHydratedAction {
  type: 'SET_HYDRATED';
}

export interface SetDrawPendingAction {
  type: 'SET_DRAW_PENDING';
  value: boolean;
}

export interface SetShowSkillSelectionAction {
  type: 'SET_SHOW_SKILL_SELECTION';
  show: boolean;
}

export interface SetShowCardDraftAction {
  type: 'SET_SHOW_CARD_DRAFT';
  show: boolean;
}

export interface SetCardDraftPoolAction {
  type: 'SET_CARD_DRAFT_POOL';
  pool: GameCardData[];
}

export interface SetTotalWinsAction {
  type: 'SET_TOTAL_WINS';
  count: number;
}

export interface SetSelectedMonsterRewardsAction {
  type: 'SET_SELECTED_MONSTER_REWARDS';
  options: import('./types').MonsterRewardOption[] | null;
}

export interface SetResolvingDungeonCardAction {
  type: 'SET_RESOLVING_DUNGEON_CARD';
  cardId: string | null;
}

export interface ResetRecycleForgeCountAction {
  type: 'RESET_RECYCLE_FORGE_COUNT';
}

export interface SelectHeroSkillAction {
  type: 'SELECT_HERO_SKILL';
  skillId: import('./types').HeroSkillId;
}

// ---------------------------------------------------------------------------
// Union type
// ---------------------------------------------------------------------------

export type GameAction =
  // Turn flow
  | StartTurnAction
  | EndTurnAction
  | EnterPlayerInputAction
  // Monster turn
  | AdvanceMonsterTurnAction
  | ApplyMonsterTurnEndEffectsAction
  // Combat
  | BeginCombatAction
  | FinishCombatAction
  | PerformHeroAttackAction
  | ResolveBlockAction
  | PerformShieldBashAction
  | ResetHeroTurnUsageAction
  | DisengageMonsterAction
  | RecordClassDamageDiscoverAction
  | SetPersuadeDiscountAction
  | SetPersuadeAmuletBonusAction
  // Damage / heal
  | ApplyDamageAction
  | HealAction
  | DealDamageToMonsterAction
  // Death / battle end
  | MonsterDefeatedAction
  | DecrementFuryAction
  | ExecuteLastWordsAction
  | ApplyShieldReflectAction
  | ApplyDragonBreathRetaliationAction
  | CheckDeathAction
  | CheckBattleEndAction
  // Cards
  | PlayCardAction
  | DrawCardsAction
  | DiscardCardAction
  | AddToGraveyardAction
  | AddToRecycleBagAction
  | AddToBackpackAction
  | DrawFromBackpackAction
  | EquipCardAction
  | ResolvePotionAction
  | ResolveMagicAction
  | FinalizeCardPlayAction
  | FinalizeMagicCardAction
  | FinalizePotionCardAction
  | GoblinTrickDeliverAction
  // Dungeon / waterfall
  | TriggerWaterfallAction
  | WaterfallTurnResetAction
  | DrawDungeonRowAction
  | MonsterEnteredRowAction
  | CheckEliteGoldBuffAction
  | CheckHordeSwarmAction
  // Status
  | AddStatusAction
  | RemoveStatusAction
  // Turn reset
  | ResetTurnStateAction
  // Shop
  | OpenShopAction
  | CloseShopAction
  | PurchaseAction
  | ShopHealAction
  | ShopLevelUpAction
  | ShopDeleteEquipmentAction
  | ShopDiscoverAction
  | ShopEquipBoostAction
  | ShopRefreshAction
  | ShopSkillDiscoverAction
  | ShopSelectSkillAction
  | UpgradeCardAction
  | ApplyMonsterRewardAction
  | AdjustShopLevelAction
  | SetShopLevelAction
  | ClearActiveMonsterRewardAction
  | EndMonsterDefeatAnimationAction
  | CacheMonsterRewardPreviewAction
  | SetActiveCardStacksAction
  // Events
  | StartEventAction
  | CompleteEventAction
  | FinalizeEventAction
  | GainClassDeckBottomCardsAction
  | ApplyEventEffectAction
  | ResolveEventChoiceAction
  | SetCurrentEventAction
  // Hero skills
  | UseHeroSkillAction
  | ResolveHeroSkillTargetAction
  | AddMagicGaugeAction
  | PersuadeMonsterAction
  | SweepAction
  | ResetHeroWaveAction
  | ActivateHeroMagicAction
  | CompleteHeroMagicAction
  | ResolveHeroMagicTargetAction
  | ApplyReviveBlessingAction
  | AddPermanentSkillAction
  | UpdateHeroMagicEntryAction
  // Discard side effects / card flip / equipment dispose
  | ApplyDiscardEffectsAction
  | ApplyCardFlipAction
  | DisposeEquipmentCardAction
  | DiscardOwnedCardAction
  | SacrificeEquipmentSlotAction
  | TickRecycleForgeAction
  | RestoreRecycleBagAction
  // Combat: weapon initiation / kill effects
  | InitiateWeaponAttackAction
  | ApplyHeroKillEffectsAction
  // Shop: discover, delete, graveyard, ghost blade
  | BeginDiscoverAction
  | ResolveDiscoverSelectionAction
  | ConfirmDeleteCardAction
  | RequestGraveyardSelectionAction
  | BeginGhostBladeExileAction
  // Card play: mirror, amplify, perm grant, transform, etc.
  | ResolveMirrorCopyAction
  | CancelMirrorCopyAction
  | ResolveMonsterFusionAction
  | CancelMonsterFusionAction
  | ResolveAmplifyAction
  | CancelAmplifyAction
  | AmplifyCardsByNameAction
  | ResolvePermGrantAction
  | ApplyTransformCategoryAction
  | PlaceBuildingInDungeonAction
  | EquipFromHandAction
  | EquipAmuletFromHandAction
  | ResolveDeckJudgeAction
  | ResolveStatSwapAction
  | ReturnEquipmentToHandAction
  | ResolvePotionRepairAction
  | ProcessHeroMagicCardAction
  | ApplyBerserkerRageAction
  | TriggerGraveNovaAction
  | FireMissileStormBoltAction
  | CancelPermGrantAction
  | ResolveRepairEnrageDiceAction
  // Hero: magic selection, dungeon card
  | ResolveMagicSlotSelectionAction
  | ResolveMagicMonsterSelectionAction
  | ResolveDungeonCardSelectionAction
  | ResolvePushToBackpackTopAction
  | ResolveHandDiscardSelectionAction
  // Event: interaction
  | ResolveEventInteractionAction
  | ResolveEventGrantEquipFlipRepairAction
  | ResolveEventGrantLastWordsMaxHpAction
  | ContinueEventEffectsAction
  // Waterfall: effects
  | ApplyWaterfallEffectsAction
  | ApplyWaterfallDiscardEffectsAction
  | ApplyWaterfallDropAction
  | ApplyWaterfallDealAction
  | CompleteWaterfallAction
  // Card deletion
  | DeleteCardAction
  // Utility
  | DequeueMonsterRewardAction
  | EnforceBackpackCapacityAction
  | CheckWraithPurificationAction
  // Economy / field mutations (SET_STATE elimination)
  | ModifyGoldAction
  | ModifyStunCapAction
  | ModifySlotTempAttackAction
  | ModifySlotTempArmorAction
  | SetCombatFlagAction
  | ModifyPermanentStatAction
  | AddCardToHandAction
  | AddCardsToHandAction
  | TriggerOnEnterHandAction
  | RemoveCardFromHandAction
  | RemoveCardsFromHandAction
  | DiscardAllHandAction
  | UpdateHandCardsAction
  | UpdateMonsterCardAction
  | FlushRecycleToBackpackAction
  | AddPermanentMagicToRecycleAction
  | RemovePermanentMagicFromRecycleAction
  | SetEquipmentSlotAction
  | ModifyEquipmentDurabilityAction
  | UpdateAmuletSlotAction
  | ModifyMaxAmuletSlotsAction
  | RemoveAmuletAction
  | UpdateGameLogAction
  | SetGameFlagsAction
  | UpdateActiveCardsAction
  | UpdateDiscardedCardsAction
  | UpdateBackpackItemsAction
  | UpdateRecycleBagAction
  | UpdateEternalRelicsAction
  | UpdateClassDeckAction
  | UpdateRemainingDeckAction
  | UpdateAmuletSlotsAction
  // Equipment slot capacity / reserve / bonus
  | SetEquipmentSlotCapacityAction
  | SetEquipmentReserveAction
  | SetEquipmentSlotBonusAction
  // Equipment slot burst / berserk buff
  | SetSlotAttackBurstAction
  | ClearBerserkBuffAction
  | AddBerserkBuffAction
  // Card operations (Phase 3)
  | ConvertAmuletsToGoldAction
  | DrawClassToBackpackAction
  // Pending-action state machines (Phase 7A)
  | SetPendingMagicAction
  | SetPendingPotionAction
  | SetPendingHeroSkillAction
  | SetPendingHeroMagicActionAction
  | SetDeathWardPromptAction
  | SetCardActionContextAction
  | SetGraveyardDiscoverStateAction
  | SetPermGrantModalAction
  | SetEquipmentPromptAction
  | SetMirrorCopyModalAction
  | SetMonsterFusionModalAction
  | SetAmplifyModalAction
  | SetEventAmplifyHandPickerAction
  | SetEventDiceModalAction
  | SetMagicChoiceModalAction
  | SetPersuadeStateAction
  | SetEventTransformStateAction
  | SetHandMagicUpgradeModalAction
  | SetGhostBladeExileCardsAction
  | SetPreviewCardsAction
  | SetSwapUpgradeProgressAction
  // UI modal toggles (Phase 7A)
  | SetEventModalOpenAction
  | SetEventModalMinimizedAction
  | SetDeleteModalOpenAction
  | SetUpgradeModalOpenAction
  | SetDiscoverModalAction
  | SetShopModalOpenAction
  | SetShopModalMinimizedAction
  | SetDiscoverModalMinimizedAction
  | SetGraveyardDiscoverMinimizedAction
  | SetMonsterRewardMinimizedAction
  | MinimizeAllModalsAction
  | SetHeroSkillBannerAction
  | SetGameOverAction
  // Honor sweep (Phase 8D)
  | CheckHonorSweepUpgradesAction
  // Dungeon card processing (Phase 8B)
  | RegisterDungeonCardProcessedAction
  | ProcessAutoDrawsAction
  // Interactive continuations (player responded to prompt)
  | ResolveDiceAction
  | RollDiceForFlowAction
  | ResolveEquipmentChoiceAction
  | ResolveMagicChoiceAction
  | ResolveCardActionAction
  | ResolveGraveyardSelectionAction
  // Hero skill tracking
  | MarkSkillUsedAction
  // RNG
  | SeedRngAction
  // Game init
  | InitGameAction
  // Combat / Hero / Shop / Game state
  | ResetBerserkerSlotAction
  | SetGambitStateAction
  | SetLifestealSlotAction
  | SetHonorSweepPendingAction
  | SetLastPlayedCategoryAction
  | ClampHpAction
  | OpenShopModalAction
  | EnqueueMonsterRewardAction
  | RemovePreviewCardStacksAction
  | IncrementTurnCountAction
  | SetHandLimitBonusAction
  // Equipment / Amulet state
  | SwapEquipmentSlotsAction
  | FilterEquipmentReservesAction
  | SetAmuletSlotsAction
  | SetRecycleBackpackProgressAction
  // Card / Deck / Recycle state
  | SetHandCardsAction
  | AddClassCardToHandAction
  | RemoveClassCardFromHandAction
  | SetDiscardedCardsAction
  | SetMagicRecycleBagAction
  | SetClassDeckAndBackpackAction
  | SetBackpackItemsAction
  // UI / Phase / Meta flags
  | SetPhaseAction
  | SetUndoCountAction
  | SetHydratedAction
  | SetDrawPendingAction
  | SetShowSkillSelectionAction
  | SetShowCardDraftAction
  | SetCardDraftPoolAction
  | SetTotalWinsAction
  | SetSelectedMonsterRewardsAction
  | SetResolvingDungeonCardAction
  | ResetRecycleForgeCountAction
  | SelectHeroSkillAction
  // Meta
  | EnqueueActionsAction
  | NoOpAction
  // Monster skill float (blocking UI animation queue)
  | TriggerMonsterSkillFloatAction
  | ReleaseMonsterSkillFloatAction;

// ---------------------------------------------------------------------------
// Action log entry (for debugging / replay)
// ---------------------------------------------------------------------------

export interface ActionLogEntry {
  action: GameAction;
  timestamp: number;
}
