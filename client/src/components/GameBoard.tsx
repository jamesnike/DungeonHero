import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect,
  useMemo,
  type ReactNode,
  type Ref,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { CSSProperties, DragEvent as ReactDragEvent } from 'react';
import { useGameViewport } from '@/contexts/GameViewportContext';
import GameHeader from './GameHeader';
import HeroCard from './HeroCard';
import GameCard, {
  type CardType,
  type EventChoiceDefinition,
  type EventDiceRange,
  type EventEffectExpression,
  type GameCardData,
  type EquipmentCardStatModifier,
  type HeroMagicId,
  isPermRecycleEquipment,
} from './GameCard';
import EquipmentSlot from './EquipmentSlot';
// CombatPanel removed — only the standalone End Hero Turn button is used
import GameLogPanel, { type LogEntry, type LogEntryType } from './GameLogPanel';
import { Sword, Swords, Calendar, Undo2, Wrench, ShoppingBag, Trophy, Skull } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import AmuletSlot from './AmuletSlot';
import GraveyardZone from './GraveyardZone';
import HandDisplay from './HandDisplay';
import VictoryDefeatModal from './VictoryDefeatModal';
import DeckViewerModal from './DeckViewerModal';
import EventChoiceModal, { type EventChoiceAvailability } from './EventChoiceModal';
import EventDiceModal from './EventDiceModal';
import EquipmentSelectModal from './EquipmentSelectModal';
import DiceRoller from './DiceRoller';
import ClassDeck from './ClassDeck';
import HeroSkillSelection from './HeroSkillSelection';
import BackpackZone from './BackpackZone';
import BackpackViewerModal from './BackpackViewerModal';
import MonsterRewardModal from '@/components/MonsterRewardModal';
import MonsterPersuadeModal, { type PersuadePhase } from './MonsterPersuadeModal';
import HeroDetailsModal from './HeroDetailsModal';
import MagicChoiceModal from './MagicChoiceModal';
import { useOverlayScale } from '@/hooks/use-overlay-scale';
import { useGameEngine, useGameState, useEngineSetter } from '@/hooks/useGameEngine';
import { useCardOperations, type CardOperationsDeps } from '@/hooks/useCardOperations';
import { useCombatActions, type CombatActionsDeps } from '@/hooks/useCombatActions';
import { useShopHandlers, type ShopHandlersDeps } from '@/hooks/useShopHandlers';
import { useCardPlayHandlers, type CardPlayHandlersDeps } from '@/hooks/useCardPlayHandlers';
import { useHeroActions, type HeroActionsDeps } from '@/hooks/useHeroActions';
import { useEventSystem, type EventSystemDeps } from '@/hooks/useEventSystem';
import { createInitialGameState } from '@/game-core';
import { serializeGameState } from '@/game-core/persistence';
import type { MagicChoiceModalState, GameState } from '@/game-core/types';
// import { useToast } from '@/hooks/use-toast'; // Disabled toast notifications
import { GameBoardModals } from './game-board/components/GameBoardModals';
import DeckPeekModal from '@/components/DeckPeekModal';
import { HAND_LIMIT, FLAT_ASPECT_RATIO } from './game-board/constants';
import {
  generateKnightDeck,
  createKnightDiscoveryEvents,
  createGreedCurseCard,
  createGraveyardRecallCard,
  createPersuadeRecycleFetchMagicCard,
  type KnightCardData,
} from '@/lib/knightDeck';
import { getHeroSkillById, heroSkills as allHeroSkills, type HeroSkillDefinition, type HeroSkillId } from '@/lib/heroSkills';
import {
  HERO_MAGIC_IDS,
  createInitialHeroMagicState,
  getHeroMagicDefinition,
  sanitizeHeroMagicState,
  type HeroMagicRuntimeState,
  type HeroMagicState,
} from '@/lib/heroMagic';
import { getRandomHero, type HeroVariant } from '@/lib/heroes';
import { clearGameState, loadGameState, saveGameState, saveUndoStack, loadUndoStack, clearUndoStorage, saveGameLog, loadGameLog, clearGameLogStorage, getTotalWins, incrementTotalWins, type PersistedGameState } from '@/lib/gameStorage';
import { applyMonsterRage } from '@/lib/monsterRage';
import { getStartingRelics, hasEternalRelic, getEternalRelic } from '@/lib/eternalRelics';
import EternalRelicBar from './EternalRelicBar';
import CardDetailsModal from './CardDetailsModal';
import CardUpgradeModal, { isUpgradeableCard, isCardAtMaxUpgrade } from './CardUpgradeModal';
import HandMagicUpgradeModal from './HandMagicUpgradeModal';
import MirrorCopyModal from './MirrorCopyModal';
import AmplifyModal from './AmplifyModal';
import PermGrantModal from './PermGrantModal';
import CardDraftModal from './CardDraftModal';
import DiscoverClassModal from './DiscoverClassModal';
import GraveyardExileModal from './GraveyardExileModal';
import CardDeletionModal from './CardDeletionModal';
import ShopModal, { type ShopOffering } from './ShopModal';
import ShopSkillSelectModal from './ShopSkillSelectModal';
import CardFlipOverlay from './CardFlipOverlay';
import { type DragData } from '../utils/mobileDragDrop';
import type {
  ActiveAmuletEffects,
  ActiveRowSlots,
  AmuletItem,
  BackpackDrawRequest,
  BackpackHandFlight,
  BlockTarget,
  DirectedCombatFxFlight,
  DiscardShockFlight,
  FateSwapFlight,
  GraveyardStackFlight,
  FlightSourceHint,
  CardActionContext,
  ClassDeckFlight,
  CombatInitiator,
  CombatState,
  DiscardFlight,
  DeathWardPromptState,
  DragOrigin,
  DungeonDropAssignment,
  EquipmentItem,
  EquipmentRepairTarget,
  EquipmentSlotBonusState,
  EquipmentSlotId,
  EquipmentSlotStatModifier,
  EventDiceModalState,
  EventTransformState,
  EquipmentPromptState,
  GraveyardVector,
  GridMetrics,
  HeroFramePosition,
  HeroMagicActivationOrigin,
  HeroRowDropType,
  HeroRowSlotConfig,
  HeroSkillArrowState,
  MonsterRageInset,
  MonsterRewardDrop,
  MonsterRewardEffect,
  MonsterRewardOption,
  PendingHandInsertion,
  PendingHeroMagicAction,
  PendingHeroSkillAction,
  PendingMagicAction,
  PendingPotionAction,
  Point,
  SlotPermanentBonus,
  SlotTempArmorState,
  SwordVector,
  WaterfallAnimationState,
  WaterfallDiscardDestination,
  WaterfallPlan,
} from './game-board/types';

// Game-core: deck creation, card images, and constants
import {
  createDeck,
  createStarterCardPool,
  createStarterHealEchoCard,
  createBugletCard,
  patchPersistedMainDeckWeaponImage,
  pruneEventChoicesToThree,
  STARTER_CARD_IDS,
  minionImage,
  skillScrollImage,
  eventScrollImage,
  goblinImage,
  forgeHeartAmuletImage,
  potionSpellDamageImage,
  potionWeaponRepairImage,
  createMagicBoltCard,
} from '@/game-core/deck';
import {
  INITIAL_HP,
  INITIAL_GOLD,
  INITIAL_TURN_COUNT,
  PERSUADE_COST,
  FINAL_MONSTER_MARK_DESCRIPTION,
  SELLABLE_TYPES,
  EQUIPMENT_TYPES,
  CONSUMABLE_TYPES,
  MAX_AMULET_SLOTS,
  DECK_SIZE,
  DUNGEON_COLUMN_COUNT,
  DUNGEON_COLUMNS,
  BASE_BACKPACK_CAPACITY,
  FLIP_GOLD_REWARD,
  SHOP_MAX_OFFERINGS,
  SHOP_REQUIRED_TYPES,
  SHOP_TYPE_PRICES,
  SHOP_HEAL_COST,
  SHOP_HEAL_AMOUNT,
  SHOP_LEVEL_UP_COST,
  SHOP_SKILL_DISCOVER_COST,
  MAX_SHOP_LEVEL,
  BALANCE_ATTACK_BONUS,
  BALANCE_SHIELD_BONUS,
  BALANCE_ATTACK_PENALTY,
  BALANCE_SHIELD_PENALTY,
  STRENGTH_SELF_DAMAGE,
  DEV_MODE,
  initialCombatState,
  initialWaterfallAnimationState,
  createEmptySlotBonusState,
  createEmptyEquipmentBuffState,
  createEmptyActiveRow,
  createEmptyAmuletEffects,
} from '@/game-core/constants';
import {
  clamp,
  easeInOutCubic,
  getRandomInt,
  formatRepairTargetLabel,
  describeSlotLabel,
  describeBonusLabel,
  normalizeHeroEquipmentSlotFromDrag,
  isBackpackRestrictedCard,
  isHeroRowHighlightCard,
  getShopPrice,
  fillActiveRowSlots,
  flattenActiveRowSlots,
  countActiveRowSlots,
  countActiveRowSlotsExcludeGhost,
  getEmptyColumns,
  getEmptyOrGhostColumns,
  getFilledPreviewColumns,
  findSlotIndexByCardId,
  sanitizeCardMetadata,
  sanitizeCardList,
  sanitizeSlotRow,
  getGridMetricsForWidth,
  getWaterfallPreviewDiscardDestination,
  logWaterfall,
  logWaterfallInvariant,
  logHeroMagic,
  logBackpackDraw,
  pickRandomHandCardsForDiscardPreferGraveyard,
  computeAmuletAuraReversal,
} from '@/game-core/helpers';
import { getEquipmentSlotsWithSuppressedTempAttack } from '@/game-core/buildingAura';

// ---------------------------------------------------------------------------
// UI-only constants (layout, animation timing, CSS classes)
// ---------------------------------------------------------------------------
const GRAVEYARD_VECTOR_DEFAULT = { offsetX: 60, offsetY: 160 };
const DECK_RETURN_VECTOR_DEFAULT = { offsetX: -72, offsetY: -188 };
const MONSTER_RAGE_COLUMN_BORDER_PX = 1;
const MONSTER_CARD_BORDER_PX = 4;
const MONSTER_RAGE_BASE_TRANSLATE_PX = 6;
const MONSTER_RAGE_TRANSLATE_ADJUST_PX =
  MONSTER_CARD_BORDER_PX > MONSTER_RAGE_COLUMN_BORDER_PX
    ? MONSTER_CARD_BORDER_PX - MONSTER_RAGE_COLUMN_BORDER_PX
    : 0;
const HERO_GRID_PADDING_CLASS = "";
const HERO_GAP_VARIABLE_CLASS =
  "[--hero-gap-x:clamp(1rem,3.8vw,2.8rem)] [--hero-gap-y:clamp(0.7rem,2.8vw,1.8rem)] sm:[--hero-gap-x:clamp(1.5rem,3.8vw,3.5rem)] sm:[--hero-gap-y:clamp(1rem,3vw,2.4rem)]";
const HERO_GAP_VARIABLE_CLASS_FLAT =
  "[--hero-gap-x:clamp(0.3rem,1vw,0.8rem)] [--hero-gap-y:clamp(0.1rem,0.4vw,0.3rem)] sm:[--hero-gap-x:clamp(0.4rem,1.2vw,1rem)] sm:[--hero-gap-y:clamp(0.1rem,0.5vw,0.4rem)]";
const HERO_ROW_AMULET_INDEX = 0;
const HERO_ROW_EQUIPMENT_1_INDEX = 1;
const HERO_ROW_HERO_INDEX = 2;
const HERO_ROW_EQUIPMENT_2_INDEX = 3;
const HERO_ROW_BACKPACK_INDEX = 4;
const HERO_ROW_CLASS_DECK_INDEX = 5;
const DIRECTED_REFLECT_PROJECTILE_SIZE = 50;
const DIRECTED_RETALIATION_PROJECTILE_SIZE = 52;
const DIRECTED_ARCANE_PROJECTILE_SIZE = 44;
const DIRECTED_GOLEM_LAYER_PROJECTILE_SIZE = 48;
const ARCANE_BLADE_SPELL_ANIM_MS = 780;
const DISCARD_SHOCK_FLIGHT_BASE_DURATION = 520;
const DISCARD_SHOCK_FLIGHT_VARIANCE = 140;
const DISCARD_SHOCK_ARC_MIN = 36;
const DISCARD_SHOCK_ARC_VARIANCE = 52;
const DISCARD_SHOCK_PROJECTILE_SIZE = 56;
const COMBAT_ANIMATION_DURATION = 1200;
const COMBAT_ANIMATION_STAGGER = 180;
/** 格挡动画与反弹动画之间的间隔（ms） */
const COMBAT_BLOCK_TO_REFLECT_MS = 220;
/** 护盾反弹特效时长，与 index.css shield-reflect-* 大致对齐 */
const SHIELD_REFLECT_ANIM_MS = 1020;
/** Boss 反噬特效时长，与 boss-retaliation-* 大致对齐 */
const BOSS_RETALIATION_ANIM_MS = 920;
const GOLEM_LAYER_REFLECT_ANIM_MS = 850;
const DEFEAT_ANIMATION_DURATION = 950;
const COMBAT_PANEL_DEFAULT_WIDTH = 170;
const COMBAT_PANEL_DEFAULT_HEIGHT = 320;
const COMBAT_PANEL_EDGE_PADDING = 12;
const COMBAT_PANEL_DEFAULT_POSITION_CLASS =
  'top-2 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 sm:top-4';
const pointInsideRect = (rect: DOMRect | null, clientX: number, clientY: number) =>
  Boolean(
    rect &&
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom,
  );
const WATERFALL_DROP_DURATION = 650;
const WATERFALL_DISCARD_DURATION = 450;
const WATERFALL_DEAL_DURATION = 550;

const CLASS_FLIGHT_BASE_DURATION = 900;
const CLASS_FLIGHT_VARIANCE = 250;
const CLASS_FLIGHT_STAGGER = 110;
const CLASS_FLIGHT_ARC_MIN = 40;
const CLASS_FLIGHT_ARC_VARIANCE = 35;

const BACKPACK_FLIGHT_BASE_DURATION = 600;
const BACKPACK_FLIGHT_VARIANCE = 200;
const BACKPACK_FLIGHT_STAGGER = 70;
const BACKPACK_FLIGHT_ARC_MIN = 30;
const BACKPACK_FLIGHT_ARC_VARIANCE = 45;
const BACKPACK_FLIGHT_FALLBACK_BUFFER = 200;
const HAND_DELIVERY_GUARD_EXTRA_BUFFER = 500;
const HAND_DELIVERY_GUARD_DELAY =
  BACKPACK_FLIGHT_BASE_DURATION +
  BACKPACK_FLIGHT_VARIANCE +
  BACKPACK_FLIGHT_FALLBACK_BUFFER +
  HAND_DELIVERY_GUARD_EXTRA_BUFFER;

// Discard flight: hand/board → graveyard or backpack (reverse of draw)
const DISCARD_FLIGHT_BASE_DURATION = 600;
const DISCARD_FLIGHT_VARIANCE = 200;
const DISCARD_FLIGHT_ARC_MIN = 30;
const DISCARD_FLIGHT_ARC_VARIANCE = 45;

// Steal card flight: hand → Goblin dungeon slot
const STEAL_FLIGHT_BASE_DURATION = 500;
const STEAL_FLIGHT_VARIANCE = 150;
const STEAL_FLIGHT_ARC_MIN = 20;
const STEAL_FLIGHT_ARC_VARIANCE = 35;



export default function GameBoard() {
  const gameViewport = useGameViewport();
  const overlayZoom = useOverlayScale();
  const animSpeed = useCallback((ms: number) => ms, []);

  // ---------------------------------------------------------------------------
  // GameEngine — single source of truth for all core game state
  // ---------------------------------------------------------------------------
  const engine = useGameEngine();
  const gs = useGameState(s => s);

  const {
    hp, gold, turnCount, shopLevel,
    previewCards, activeCards, remainingDeck, discardedCards, handCards,
    equipmentSlot1, equipmentSlot2,
    equipmentSlot1Reserve, equipmentSlot2Reserve,
    equipmentSlotCapacity, equipmentSlotBonuses,
    amuletSlots, maxAmuletSlots,
    backpackItems, permanentMagicRecycleBag, backpackCapacityModifier,
    classDeck, classCardsInHand,
    heroVariant, heroClass, selectedHeroSkill,
    extraHeroSkills, extraSkillsUsedThisWave,
    permanentSkills, permanentMaxHpBonus, permanentSpellDamageBonus,
    permanentSpellLifesteal, stunCap, heroStunned, handLimitBonus,
    heroMagicState, wraithPassiveEnabled,
    combatState, tempShield,
    nextWeaponBonus, nextShieldBonus, weaponMasterBonus, shieldMasterBonus,
    vampiricNextAttack, unbreakableNext, unbreakableUntilWaterfall,
    bulwarkPassiveActive, bulwarkTempArmorStacks, slotTempArmor, slotTempAttack,
    defensiveStanceActive, slotAttackBursts, nextAttackLifestealSlot,
    berserkTurnBuff, extraAttackCharges, doubleNextMagic,
    heroSkillUsedThisWave, berserkerRageActive, berserkerSlotUsed,
    flashSlotUsed,
    gambitExtraActive, gambitExtraPerSlot, gambitSlotUsed,
    weaponExtraAttackUsed,
    blockDurabilityPerSlot,
    pendingHeroSkillAction, pendingHeroMagicAction,
    pendingMagicAction, pendingPotionAction, deathWardPrompt,
    monsterRewardQueue, activeMonsterReward, selectedMonsterRewards,
    monsterRewardPreviewCache,
    shopOfferings, shopSourceEvent,
    shopDeleteUsed, shopHealUsed, shopLevelUpUsed,
    shopSkillDiscoverUsed, shopSkillOptions,
    shopModalOpen, shopModalMinimized, shopSkillSelectOpen,
    currentEventCard, resolvingDungeonCardId,
    eventModalOpen, eventModalMinimized,
    eventDiceModal, eventTransformState, persuadeState, persuadeLevel, persuadeCostModifier, magicChoiceModal,
    discoverModalOpen, discoverOptions, discoverSourceLabel, deleteModalOpen, upgradeModalOpen, handMagicUpgradeModal, mirrorCopyModal, permGrantModal, amplifyModal,
    graveyardDiscoverState, graveyardDiscoverDelivery,
    cardActionContext, equipmentPrompt, ghostBladeExileCards,
    gameOver, victory, showSkillSelection, showCardDraft, cardDraftPool,
    drawPending, isHydrated, heroSkillBanner,
    monstersDefeated, totalDamageTaken, totalHealed, turnDamageTaken,
    healAccumulator, cardsPlayed, recycleForgePlayCount,
    waveDiscardCount, totalWins, undoCount,
    gameLogEntries,
    waterfallDealBonus,
    previewCardStacks,
    activeCardStacks,
    eternalRelics,
  } = gs;

  // Shim setters — identical API to React's useState setters
  const setHp = useEngineSetter('hp');
  const setGold = useEngineSetter('gold');
  const setTurnCount = useEngineSetter('turnCount');
  const setShopLevel = useEngineSetter('shopLevel');
  const setPreviewCards = useEngineSetter('previewCards');
  const setActiveCards = useEngineSetter('activeCards');
  const setRemainingDeck = useEngineSetter('remainingDeck');
  const setDiscardedCards = useEngineSetter('discardedCards');
  const setHandCards = useEngineSetter('handCards');
  const setEquipmentSlot1 = useEngineSetter('equipmentSlot1');
  const setEquipmentSlot2 = useEngineSetter('equipmentSlot2');
  const setEquipmentSlot1Reserve = useEngineSetter('equipmentSlot1Reserve');
  const setEquipmentSlot2Reserve = useEngineSetter('equipmentSlot2Reserve');
  const setEquipmentSlotCapacity = useEngineSetter('equipmentSlotCapacity');
  const setEquipmentSlotBonuses = useEngineSetter('equipmentSlotBonuses');
  const setMaxAmuletSlots = useEngineSetter('maxAmuletSlots');
  const setAmuletSlots = useEngineSetter('amuletSlots');
  const setBackpackItems = useEngineSetter('backpackItems');
  const setPermanentMagicRecycleBag = useEngineSetter('permanentMagicRecycleBag');
  const setBackpackCapacityModifier = useEngineSetter('backpackCapacityModifier');
  const setClassDeck = useEngineSetter('classDeck');
  const setClassCardsInHand = useEngineSetter('classCardsInHand');
  const setHeroVariant = useEngineSetter('heroVariant');
  const setSelectedHeroSkill = useEngineSetter('selectedHeroSkill');
  const setExtraHeroSkills = useEngineSetter('extraHeroSkills');
  const setExtraSkillsUsedThisWave = useEngineSetter('extraSkillsUsedThisWave');
  const setPermanentSkills = useEngineSetter('permanentSkills');
  const setPermanentMaxHpBonus = useEngineSetter('permanentMaxHpBonus');
  const setPermanentSpellDamageBonus = useEngineSetter('permanentSpellDamageBonus');
  const setPermanentSpellLifesteal = useEngineSetter('permanentSpellLifesteal');
  const setStunCap = useEngineSetter('stunCap');
  const setHandLimitBonus = useEngineSetter('handLimitBonus');
  const setHeroMagicState = useEngineSetter('heroMagicState');
  const setWraithPassiveEnabled = useEngineSetter('wraithPassiveEnabled');
  const setCombatState = useEngineSetter('combatState');
  const setTempShield = useEngineSetter('tempShield');
  const setNextWeaponBonus = useEngineSetter('nextWeaponBonus');
  const setNextShieldBonus = useEngineSetter('nextShieldBonus');
  const setWeaponMasterBonus = useEngineSetter('weaponMasterBonus');
  const setShieldMasterBonus = useEngineSetter('shieldMasterBonus');
  const setVampiricNextAttack = useEngineSetter('vampiricNextAttack');
  const setUnbreakableNext = useEngineSetter('unbreakableNext');
  const setUnbreakableUntilWaterfall = useEngineSetter('unbreakableUntilWaterfall');
  const setBulwarkPassiveActive = useEngineSetter('bulwarkPassiveActive');
  const setBulwarkTempArmorStacks = useEngineSetter('bulwarkTempArmorStacks');
  const setSlotTempArmor = useEngineSetter('slotTempArmor');
  const setSlotTempAttack = useEngineSetter('slotTempAttack');
  const setDefensiveStanceActive = useEngineSetter('defensiveStanceActive');
  const setSlotAttackBursts = useEngineSetter('slotAttackBursts');
  const setNextAttackLifestealSlot = useEngineSetter('nextAttackLifestealSlot');
  const setBerserkTurnBuff = useEngineSetter('berserkTurnBuff');
  const setExtraAttackCharges = useEngineSetter('extraAttackCharges');
  const setDoubleNextMagic = useEngineSetter('doubleNextMagic');
  const setHeroSkillUsedThisWave = useEngineSetter('heroSkillUsedThisWave');
  const setBerserkerRageActive = useEngineSetter('berserkerRageActive');
  const setBerserkerSlotUsed = useEngineSetter('berserkerSlotUsed');
  const setFlashSlotUsed = useEngineSetter('flashSlotUsed');
  const setGambitExtraActive = useEngineSetter('gambitExtraActive');
  const setGambitExtraPerSlot = useEngineSetter('gambitExtraPerSlot');
  const setGambitSlotUsed = useEngineSetter('gambitSlotUsed');
  const setPendingHeroSkillAction = useEngineSetter('pendingHeroSkillAction');
  const setPendingHeroMagicAction = useEngineSetter('pendingHeroMagicAction');
  const setPersuadeCostModifier = useEngineSetter('persuadeCostModifier');
  const setPendingMagicAction = useEngineSetter('pendingMagicAction');
  const setPendingPotionAction = useEngineSetter('pendingPotionAction');
  const setDeathWardPrompt = useEngineSetter('deathWardPrompt');
  const setMonsterRewardQueue = useEngineSetter('monsterRewardQueue');
  const setActiveMonsterReward = useEngineSetter('activeMonsterReward');
  const setSelectedMonsterRewards = useEngineSetter('selectedMonsterRewards');
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
  const setCurrentEventCard = useEngineSetter('currentEventCard');
  const setResolvingDungeonCardId = useEngineSetter('resolvingDungeonCardId');
  const setEventModalOpen = useEngineSetter('eventModalOpen');
  const setEventModalMinimized = useEngineSetter('eventModalMinimized');
  const setEventDiceModal = useEngineSetter('eventDiceModal');
  const setEventTransformState = useEngineSetter('eventTransformState');
  const setPersuadeState = useEngineSetter('persuadeState');
  const setMagicChoiceModal = useEngineSetter('magicChoiceModal');
  const setDiscoverModalOpen = useEngineSetter('discoverModalOpen');
  const setDiscoverOptions = useEngineSetter('discoverOptions');
  const setDeleteModalOpen = useEngineSetter('deleteModalOpen');
  const setUpgradeModalOpen = useEngineSetter('upgradeModalOpen');
  const setHandMagicUpgradeModal = useEngineSetter('handMagicUpgradeModal');
  const setMirrorCopyModal = useEngineSetter('mirrorCopyModal');
  const setGraveyardDiscoverState = useEngineSetter('graveyardDiscoverState');
  const setCardActionContext = useEngineSetter('cardActionContext');
  const setEquipmentPrompt = useEngineSetter('equipmentPrompt');
  const setGhostBladeExileCards = useEngineSetter('ghostBladeExileCards');
  const setGameOver = useEngineSetter('gameOver');
  const setVictory = useEngineSetter('victory');
  const setShowSkillSelection = useEngineSetter('showSkillSelection');
  const setShowCardDraft = useEngineSetter('showCardDraft');
  const setCardDraftPool = useEngineSetter('cardDraftPool');
  const setDrawPending = useEngineSetter('drawPending');
  const setIsHydrated = useEngineSetter('isHydrated');
  const setHeroSkillBanner = useEngineSetter('heroSkillBanner');
  const setMonstersDefeated = useEngineSetter('monstersDefeated');
  const setTotalDamageTaken = useEngineSetter('totalDamageTaken');
  const setTotalHealed = useEngineSetter('totalHealed');
  const setTurnDamageTaken = useEngineSetter('turnDamageTaken');
  const setCardsPlayed = useEngineSetter('cardsPlayed');
  const setRecycleForgePlayCount = useEngineSetter('recycleForgePlayCount');
  const setWaveDiscardCount = useEngineSetter('waveDiscardCount');
  const setTotalWins = useEngineSetter('totalWins');
  const setUndoCount = useEngineSetter('undoCount');
  const setGameLogEntries = useEngineSetter('gameLogEntries');
  const setPreviewCardStacks = useEngineSetter('previewCardStacks');
  const setActiveCardStacks = useEngineSetter('activeCardStacks');
  const setEternalRelics = useEngineSetter('eternalRelics');

  // hpRef/goldRef eliminated — use engine.getState().hp / .gold in closures
  const undoStackRef = useRef<GameState[]>(
    (loadUndoStack() as any[]).filter((s: any) => s?.hp != null && s?.handCards) as GameState[],
  );
  const undoGuardRef = useRef(false);
  /** 每次 hydrate / 新开局递增；格挡等异步结算在 await 后若发现过期则立刻放弃，避免撤销后仍写入旧闭包数据 */
  const combatAsyncEpochRef = useRef(0);
  // amuletSlotsRef eliminated — use engine.getState().amuletSlots in closures
  useLayoutEffect(() => {
    const el = headerWrapperRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      setHeaderHeight(prev => (Math.abs(prev - h) < 0.5 ? prev : h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const amuletEffects = useMemo<ActiveAmuletEffects>(() => {
    const applyAmuletEffect = (
      state: ActiveAmuletEffects,
      amuletEffect: string | undefined,
      upgradeLevel: number,
      auraBonus?: import('@/components/GameCard').AmuletAuraBonus | null,
      slotValue?: number,
      slotEffect?: string,
    ) => {
      switch (amuletEffect) {
        case 'heal':
          state.hasHeal = true;
          break;
        case 'balance':
          state.hasBalance = true;
          break;
        case 'life':
          state.lifeOverkillBonus = 4;
          break;
        case 'catapult':
          state.hasCatapult = true;
          break;
        case 'flash':
          state.hasFlash = true;
          break;
        case 'strength':
          state.hasStrength = true;
          break;
        case 'dual-guard':
          state.hasDualGuard = true;
          break;
        case 'discard-zap':
          state.hasDiscardShock = true;
          break;
        case 'flip-gold':
          state.hasFlipGold = true;
          break;
        case 'recycle-forge':
          state.hasRecycleForge = true;
          break;
        case 'lone-card':
          state.hasLoneCard = true;
          break;
        case 'equipment-salvage':
          state.hasEquipmentSalvage = true;
          break;
        case 'bloodrage-attack':
          state.hasBloodrageAttack = true;
          break;
        case 'persuade-on-temp-attack':
          state.hasPersuadeOnTempAttack = true;
          state.persuadeOnTempAttackBonus = upgradeLevel >= 1 ? 10 : 5;
          break;
        case 'persuade-grant-recycle-fetch':
          state.hasPersuadeGrantRecycleFetch = true;
          state.persuadeGrantRecycleFetchCount = upgradeLevel >= 1 ? 2 : 1;
          break;
        case 'damage-class-discover':
          state.hasDamageClassDiscover = true;
          break;
        case 'persuade-graveyard-stack':
          state.hasPersuadeGraveyardStack = true;
          break;
        case 'stun-recycle-to-hand':
          state.hasStunRecycleToHand = true;
          break;
        case 'attack-persuade-discount':
          state.hasAttackPersuadeDiscount = true;
          break;
        case 'card-gain-missile':
          state.hasCardGainMissile = true;
          break;
        case 'swap-upgrade':
          state.hasSwapUpgrade = true;
          break;
        case 'stun-upgrade-cap':
          state.hasStunUpgradeCap = true;
          break;
        case 'recycle-backpack-expand':
          state.hasRecycleBackpackExpand = true;
          break;
        case 'dungeon-gold':
          state.hasDungeonGold = true;
          break;
        case 'end-turn-draw':
          state.hasEndTurnDraw = true;
          break;
      }
      if (auraBonus) {
        if (typeof auraBonus.attack === 'number') state.aura.attack += auraBonus.attack;
        if (typeof auraBonus.defense === 'number') state.aura.defense += auraBonus.defense;
        if (typeof auraBonus.maxHp === 'number') state.aura.maxHp += auraBonus.maxHp;
      }
      if (typeof slotValue === 'number' && slotEffect) {
        if (slotEffect === 'attack' && !(auraBonus && typeof auraBonus.attack === 'number')) {
          state.aura.attack += slotValue;
        }
        if (slotEffect === 'defense' && !(auraBonus && typeof auraBonus.defense === 'number')) {
          state.aura.defense += slotValue;
        }
        if (slotEffect === 'health' && !(auraBonus && typeof auraBonus.maxHp === 'number')) {
          state.aura.maxHp += slotValue;
        }
      }
    };

    const state = createEmptyAmuletEffects();
    for (const slot of amuletSlots) {
      if (!slot) continue;
      applyAmuletEffect(state, slot.amuletEffect, slot.upgradeLevel ?? 0, slot.amuletAuraBonus, slot.value, slot.effect);
    }
    for (const relic of eternalRelics) {
      if (relic.amuletEffect) {
        applyAmuletEffect(state, relic.amuletEffect, relic.upgradeLevel ?? 0, relic.amuletAuraBonus);
      }
    }
    return state;
  }, [amuletSlots, eternalRelics]);
  const backpackCapacity = Math.max(1, BASE_BACKPACK_CAPACITY + backpackCapacityModifier);

  // ---------------------------------------------------------------------------
  // useCardOperations — card, equipment, and backpack operations hook
  // ---------------------------------------------------------------------------
  const cardOpsDepsRef = useRef<CardOperationsDeps>(null!);
  const cardOps = useCardOperations(cardOpsDepsRef);
  const {
    ensureCardInHand,
    consumeClassCardFromHand,
    takeRandomCardsFromBackpack,
    drawFromBackpackToHand,
    addPermanentMagicToRecycleBag,
    restorePermanentMagicFromRecycleBag,
    drawFromRecycleBagToHand,
    tickRecycleForge,
    updateRecycleForgeCounter,
    drawClassCardsToBackpack,
    returnCardsToClassDeck,
    applyDiscardSideEffects,
    drainPendingDiscardEffects,
    getEquipmentSlots,
    getEquipmentSlotBonus,
    calculateSlotArmorValue,
    getEquipmentSlotStatModifier,
    setEquipmentSlotBonus,
    setEquipmentSlotById,
    clearEquipmentSlotById,
    clearEquipmentSlotWithPromote,
    getEquipmentReserve,
    setEquipmentReserve,
    swapEquipmentToTop,
    addToGraveyard,
    disposeOwnedEquipmentCard,
    discardCardToGraveyard,
    addCardToBackpack,
    enforceBackpackCapacity,
    triggerEventTransform,
    applyCardFlip,
    sacrificeEquipment,
    sacrificeAllEquipment,
    swapEquipmentSlots,
    convertAmuletsToGold,
    discardAllHandCards,
    isRecyclableFromHand,
    sanitizeCardForGraveyard,
  } = cardOps;

  // ---------------------------------------------------------------------------
  // useCombatActions — combat flow, attacks, damage, monster turns
  // ---------------------------------------------------------------------------
  const combatDepsRef = useRef<CombatActionsDeps>(null!);
  const combatActions = useCombatActions(combatDepsRef);
  const {
    clearBerserkTurnBuff,
    addBerserkTurnBuff,
    grantExtraAttackCharges,
    consumeExtraAttackCharge,
    damageMonsterWithLayerOverflow,
    updateMonsterCard,
    checkHollowSkeletonRestore,
    checkWraithRebirth,
    executeLastWords,
    handleMonsterDefeated,
    decrementMonsterFury,
    dealDamageToMonster,
    applyBossRetaliationDamage,
    applyShieldReflectDamage,
    runShieldReflectBossRetaliationSequence,
    healHero,
    applyDamage,
    getEngagedMonsterCards,
    getActiveCombatMonster,
    finishCombat,
    beginCombat,
    applyHeroKillEffects,
    performHeroAttack,
    endHeroTurn,
    resolveBlockChoice,
    advanceMonsterTurn,
    handleDeathWardConfirm,
    handleDeathWardDecline,
    handleMonsterTargetSelection,
    handleWeaponToMonster,
    recordClassDamageDiscoverHit,
    updateDamageDiscoverCounter,
  } = combatActions;

  // ---------------------------------------------------------------------------
  // useShopHandlers — shop, discover, graveyard, card-action, monster-reward
  // ---------------------------------------------------------------------------
  const shopDepsRef = useRef<ShopHandlersDeps>(null!);
  const shopHandlers = useShopHandlers(shopDepsRef);
  const {
    generateShopOfferings,
    startShopFlow,
    beginDiscoverFlow,
    beginDiscoverFlowAsync,
    handleDiscoverFallback,
    handleDiscoverSelect,
    handleDiscoverCancel,
    handleShopPurchase,
    handleShopClose,
    handleShopDeleteRequest,
    handleShopHealRequest,
    handleShopLevelUpRequest,
    handleCardUpgrade,
    handleShopSkillDiscoverRequest,
    handleShopSkillSelect,
    requestGraveyardSelection,
    handleGraveyardDiscoverSelect,
    handleGraveyardDiscoverCancel,
    triggerGhostBladeExile,
    handleGhostBladeExileConfirm,
    requestCardAction,
    handleDeleteCardConfirm,
    handleDeleteModalOpenChange,
    queueMonsterReward,
    applyMonsterReward,
    handleMonsterRewardSelection,
  } = shopHandlers;

  const requestDaggerSelfDestruct = useCallback(
    (weaponName: string, remainingDurability: number): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        daggerSelfDestructResolverRef.current = resolve;
        setDaggerSelfDestructPrompt({ weaponName, remainingDurability });
      });
    },
    [],
  );

  const handleDaggerSelfDestructConfirm = useCallback(() => {
    setDaggerSelfDestructPrompt(null);
    daggerSelfDestructResolverRef.current?.(true);
    daggerSelfDestructResolverRef.current = null;
  }, []);

  const handleDaggerSelfDestructDecline = useCallback(() => {
    setDaggerSelfDestructPrompt(null);
    daggerSelfDestructResolverRef.current?.(false);
    daggerSelfDestructResolverRef.current = null;
  }, []);

  const handleHandMagicUpgradeSelect = useCallback((cardId: string) => {
    handleCardUpgrade(cardId);
    setHandMagicUpgradeModal(null);
  }, [handleCardUpgrade, setHandMagicUpgradeModal]);

  const handleHandMagicUpgradeClose = useCallback(() => {
    setHandMagicUpgradeModal(null);
  }, [setHandMagicUpgradeModal]);

  // --- Layer 3: Card Play Handlers ---
  const cardPlayDepsRef = useRef<CardPlayHandlersDeps>(null!);
  const cardPlayHandlers = useCardPlayHandlers(cardPlayDepsRef);
  const {
    getSpellDamage,
    updateHeroMagicStateById,
    unlockHeroMagic,
    resetHeroMagicGauge,
    setHeroMagicUsedThisWave,
    completeHeroMagicActivation,
    applyBerserkerRageEffect,
    triggerGraveNova,
    finalizeMagicCard,
    finalizePotionCard,
    resolvePotionRepairForSlot,
    repairEquipmentDurability,
    handlePotionConsumption,
    handleSkillCard,
    handleHeroMagicCard,
    handleKnightInstantMagic,
    handleKnightPermanentMagic,
    handlePlayCardFromHand,
    isPermanentMagicCard,
    normalizeEventEffect,
    chaosStrikeHasOverkill,
    drawCardsFromBackpack,
    getRepairableEquipmentSlots,
    resolveFateSight,
    resolveStatSwap,
    resolveRepairEnrageDice,
    resolveMirrorCopy,
    cancelMirrorCopy,
    resolvePermGrant,
    cancelPermGrant,
    resolveAmplify,
    cancelAmplify,
  } = cardPlayHandlers;

  // --- Layer 4: Hero Actions ---
  const heroActionsDepsRef = useRef<HeroActionsDeps>(null!);
  const heroActions = useHeroActions(heroActionsDepsRef);
  const {
    resetHeroSkillForNewWave,
    addHeroMagicGauge,
    startHeroMagicActivation,
    resolveHolyLightChoice,
    handleHolyLightMonsterCleanse,
    cancelHeroSkillAction,
    cancelHeroMagicAction,
    cancelPotionAction,
    markSkillUsed,
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
    applyHonorSweepMagic,
    applyWeaponSweepMagic,
  } = heroActions;

  // --- Layer 5: Event System ---
  const eventSystemDepsRef = useRef<EventSystemDeps>(null!);
  const eventSystem = useEventSystem(eventSystemDepsRef);
  const {
    startEventResolution,
    processPendingAutoDraws,
    enqueueAutoDraw,
    registerDungeonCardProcessed,
    requestDiceOutcome,
    handleDiceRollResult,
    cancelDiceModal,
    requestMagicChoice,
    handleMagicChoice,
    requestEquipmentSelection,
    handleEquipmentPromptSelection,
    cancelEquipmentPrompt,
    evaluateChoiceRequirements,
    eventChoiceStates,
    gainClassDeckBottomCards,
    finalizeEventResolution,
    completeCurrentEvent,
    handleEventChoice,
  } = eventSystem;

  const [backpackViewerOpen, setBackpackViewerOpen] = useState(false);
  const [heroDetailsOpen, setHeroDetailsOpen] = useState(false);
  const [classDeckFlights, setClassDeckFlights] = useState<ClassDeckFlight[]>([]);
  const cardActionResolverRef = useRef<(() => void) | null>(null);
  const cardActionRemainingRef = useRef(0);
  const deletingCardIdsRef = useRef(new Set<string>());
  const adjustShopLevel = useCallback((delta: number) => {
    if (!delta) return;
    setShopLevel(prev => Math.min(MAX_SHOP_LEVEL, Math.max(0, Math.floor(prev + delta))));
  }, []);
  const persuadeDiscountRef = useRef<{ costReduction: number; rateBonus: number } | null>(null);
  const persuadeAmuletBonusRef = useRef(0);
  const onNewCardGainedRef = useRef<((count: number, source?: 'graveyard' | 'classPool') => void) | null>(null);
  const [persuadeTempDiscount, setPersuadeTempDiscount] = useState(0);
  const stagingCardsRef = useRef<GameCardData[]>([]);
  const pendingDiscardEffectsQueueRef = useRef<import('@/hooks/useCardOperations').PendingDiscardEffect[]>([]);
  const [gameOverMinimized, setGameOverMinimized] = useState(false);
  const [draggedCard, setDraggedCard] = useState<GameCardData | null>(null);
  const [draggedCardSource, setDraggedCardSource] = useState<DragOrigin | null>(null);
  const [heroRowDropState, setHeroRowDropState] = useState<HeroRowDropType | null>(null);
  const [draggedEquipment, setDraggedEquipment] = useState<any | null>(null);
  const [isDragSessionActive, setIsDragSessionActive] = useState(false);
  const [removingCards, setRemovingCards] = useState<Set<string>>(new Set());
  const [takingDamage, setTakingDamage] = useState(false);
  const [healing, setHealing] = useState(false);
  const [heroBleedActive, setHeroBleedActive] = useState(false);
  const [monsterBleedStates, setMonsterBleedStates] = useState<Record<string, number>>({});
  const [monsterHealStates, setMonsterHealStates] = useState<Record<string, number>>({});
  const [monsterDefeatStates, setMonsterDefeatStates] = useState<Record<string, boolean>>({});
  const [weaponSwingStates, setWeaponSwingStates] = useState<Record<EquipmentSlotId, number>>({
    equipmentSlot1: 0,
    equipmentSlot2: 0,
  });
  const [shieldBlockStates, setShieldBlockStates] = useState<Record<EquipmentSlotId, number>>({
    equipmentSlot1: 0,
    equipmentSlot2: 0,
  });
  const [weaponSwingVariant, setWeaponSwingVariant] = useState<Record<EquipmentSlotId, 0 | 1>>({
    equipmentSlot1: 0,
    equipmentSlot2: 0,
  });
  const [shieldBlockVariant, setShieldBlockVariant] = useState<Record<EquipmentSlotId, 0 | 1>>({
    equipmentSlot1: 0,
    equipmentSlot2: 0,
  });
  const [directedCombatFxFlights, setDirectedCombatFxFlights] = useState<DirectedCombatFxFlight[]>([]);
  const [isCombatPanelMinimized, setIsCombatPanelMinimized] = useState(true);
  const [combatPanelPosition, setCombatPanelPosition] = useState<{ x: number; y: number } | null>(null);
  const [combatPanelSize, setCombatPanelSize] = useState({ width: 0, height: 0 });
  const [isCombatPanelDragging, setIsCombatPanelDragging] = useState(false);
  const combatPanelWrapperRef = useRef<HTMLDivElement | null>(null);
  const combatPanelDragSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const combatPanelHasCustomPositionRef = useRef(false);
  const combatPanelWindowListenersRef = useRef<{
    move: (event: PointerEvent) => void;
    up: (event: PointerEvent) => void;
  } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const gameSurfaceRef = useRef<HTMLDivElement | null>(null);
  const headerWrapperRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(48);
  const gridWrapperRef = useRef<HTMLDivElement | null>(null);
  const animationDelayTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const heroBleedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monsterBleedTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({});
  const monsterHealTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({});
  const weaponSwingTimeoutsRef = useRef<Record<EquipmentSlotId, ReturnType<typeof setTimeout>[]>>({
    equipmentSlot1: [],
    equipmentSlot2: [],
  });
  const shieldBlockTimeoutsRef = useRef<Record<EquipmentSlotId, ReturnType<typeof setTimeout>[]>>({
    equipmentSlot1: [],
    equipmentSlot2: [],
  });
  const directedCombatFxFlightsRef = useRef<DirectedCombatFxFlight[]>([]);
  const directedCombatFxElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const directedCombatFxFlightAnimationRef = useRef<number | null>(null);
  const scheduleAnimationStart = useCallback((fn: () => void, delay = 0) => {
    const run = () => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => fn());
      } else {
        fn();
      }
    };
    if (delay <= 0) {
      run();
      return;
    }
    const timeoutId = setTimeout(() => {
      animationDelayTimeoutsRef.current = animationDelayTimeoutsRef.current.filter(id => id !== timeoutId);
      run();
    }, delay);
    animationDelayTimeoutsRef.current.push(timeoutId);
  }, []);
  const triggerHeroBleedAnimation = useCallback(
    (delay = 0) => {
      if (heroBleedTimeoutRef.current) {
        clearTimeout(heroBleedTimeoutRef.current);
        heroBleedTimeoutRef.current = null;
      }
      setHeroBleedActive(false);
      const start = () => {
        setHeroBleedActive(true);
        heroBleedTimeoutRef.current = setTimeout(() => {
          setHeroBleedActive(false);
          heroBleedTimeoutRef.current = null;
        }, animSpeed(COMBAT_ANIMATION_DURATION));
      };
      scheduleAnimationStart(start, delay);
    },
    [scheduleAnimationStart],
  );
  const triggerMonsterBleedAnimation = useCallback(
    (monsterId: string, delay = 0) => {
      if (!monsterId) return;
      scheduleAnimationStart(() => {
        setMonsterBleedStates(prev => ({
          ...prev,
          [monsterId]: (prev[monsterId] ?? 0) + 1,
        }));
        const timeoutId = setTimeout(() => {
          setMonsterBleedStates(prev => {
            const current = prev[monsterId];
            if (!current) {
              return prev;
            }
            if (current <= 1) {
              const next = { ...prev };
              delete next[monsterId];
              return next;
            }
            return {
              ...prev,
              [monsterId]: current - 1,
            };
          });
          monsterBleedTimeoutsRef.current[monsterId] =
            (monsterBleedTimeoutsRef.current[monsterId] || []).filter(id => id !== timeoutId);
          if (!monsterBleedTimeoutsRef.current[monsterId]?.length) {
            delete monsterBleedTimeoutsRef.current[monsterId];
          }
        }, animSpeed(COMBAT_ANIMATION_DURATION));
        monsterBleedTimeoutsRef.current[monsterId] = [
          ...(monsterBleedTimeoutsRef.current[monsterId] || []),
          timeoutId,
        ];
      }, delay);
    },
    [scheduleAnimationStart],
  );
  const triggerMonsterHealAnimation = useCallback(
    (monsterId: string, delay = 0) => {
      if (!monsterId) return;
      scheduleAnimationStart(() => {
        setMonsterHealStates(prev => ({
          ...prev,
          [monsterId]: (prev[monsterId] ?? 0) + 1,
        }));
        const timeoutId = setTimeout(() => {
          setMonsterHealStates(prev => {
            const current = prev[monsterId];
            if (!current) return prev;
            if (current <= 1) {
              const next = { ...prev };
              delete next[monsterId];
              return next;
            }
            return { ...prev, [monsterId]: current - 1 };
          });
          monsterHealTimeoutsRef.current[monsterId] =
            (monsterHealTimeoutsRef.current[monsterId] || []).filter(id => id !== timeoutId);
          if (!monsterHealTimeoutsRef.current[monsterId]?.length) {
            delete monsterHealTimeoutsRef.current[monsterId];
          }
        }, animSpeed(COMBAT_ANIMATION_DURATION));
        monsterHealTimeoutsRef.current[monsterId] = [
          ...(monsterHealTimeoutsRef.current[monsterId] || []),
          timeoutId,
        ];
      }, delay);
    },
    [scheduleAnimationStart],
  );
  const startWeaponSwingPulse = useCallback(
    (slotId: EquipmentSlotId, delay = 0) => {
      scheduleAnimationStart(() => {
        setWeaponSwingStates(prev => ({
          ...prev,
          [slotId]: (prev[slotId] ?? 0) + 1,
        }));
        const timeoutId = setTimeout(() => {
          setWeaponSwingStates(prev => {
            const current = prev[slotId] ?? 0;
            const nextCount = Math.max(0, current - 1);
            return {
              ...prev,
              [slotId]: nextCount,
            };
          });
          weaponSwingTimeoutsRef.current[slotId] = (weaponSwingTimeoutsRef.current[slotId] || []).filter(
            id => id !== timeoutId,
          );
        }, animSpeed(COMBAT_ANIMATION_DURATION));
        weaponSwingTimeoutsRef.current[slotId] = [
          ...(weaponSwingTimeoutsRef.current[slotId] || []),
          timeoutId,
        ];
      }, delay);
    },
    [scheduleAnimationStart],
  );
  const startShieldBlockPulse = useCallback(
    (slotId: EquipmentSlotId, delay = 0) => {
      scheduleAnimationStart(() => {
        setShieldBlockStates(prev => ({
          ...prev,
          [slotId]: (prev[slotId] ?? 0) + 1,
        }));
        const timeoutId = setTimeout(() => {
          setShieldBlockStates(prev => {
            const current = prev[slotId] ?? 0;
            const nextCount = Math.max(0, current - 1);
            return {
              ...prev,
              [slotId]: nextCount,
            };
          });
          shieldBlockTimeoutsRef.current[slotId] = (shieldBlockTimeoutsRef.current[slotId] || []).filter(
            id => id !== timeoutId,
          );
        }, animSpeed(COMBAT_ANIMATION_DURATION));
        shieldBlockTimeoutsRef.current[slotId] = [
          ...(shieldBlockTimeoutsRef.current[slotId] || []),
          timeoutId,
        ];
      }, delay);
    },
    [scheduleAnimationStart],
  );
  const triggerWeaponSwingAnimation = useCallback(
    (slotId: EquipmentSlotId, delay = 0, options?: { echoes?: number }) => {
      const echoes = Math.max(1, options?.echoes ?? 1);
      for (let i = 0; i < echoes; i += 1) {
        startWeaponSwingPulse(slotId, delay + i * Math.floor(COMBAT_ANIMATION_STAGGER / 2));
      }
      setWeaponSwingVariant(prev => ({
        ...prev,
        [slotId]: prev[slotId] === 0 ? 1 : 0,
      }));
    },
    [startWeaponSwingPulse],
  );
  const triggerShieldBlockAnimation = useCallback(
    (slotId: EquipmentSlotId, delay = 0, options?: { echoes?: number }) => {
      const echoes = Math.max(1, options?.echoes ?? 2);
      for (let i = 0; i < echoes; i += 1) {
        startShieldBlockPulse(slotId, delay + i * Math.floor(COMBAT_ANIMATION_STAGGER / 2));
      }
      setShieldBlockVariant(prev => ({
        ...prev,
        [slotId]: prev[slotId] === 0 ? 1 : 0,
      }));
    },
    [startShieldBlockPulse],
  );
  useEffect(() => {
    return () => {
      if (heroBleedTimeoutRef.current) {
        clearTimeout(heroBleedTimeoutRef.current);
      }
      animationDelayTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      Object.values(monsterBleedTimeoutsRef.current).forEach(timeouts => {
        timeouts.forEach(timeout => clearTimeout(timeout));
      });
      Object.values(weaponSwingTimeoutsRef.current).forEach(timeouts => {
        timeouts.forEach(timeout => clearTimeout(timeout));
      });
      Object.values(shieldBlockTimeoutsRef.current).forEach(timeouts => {
        timeouts.forEach(timeout => clearTimeout(timeout));
      });
      if (directedCombatFxFlightAnimationRef.current !== null) {
        cancelAnimationFrame(directedCombatFxFlightAnimationRef.current);
      }
    };
  }, []);
  const heroCellRef = useRef<HTMLDivElement>(null);
  const heroRowCellRefs = useRef<Array<HTMLDivElement | null>>(Array(6).fill(null));
  const monsterCellRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [monsterRageInsets, setMonsterRageInsets] = useState<Record<string, MonsterRageInset>>({});
  const waterfallPlanRef = useRef<WaterfallPlan | null>(null);
  const pendingPreviewStacksRef = useRef<Record<number, GameCardData[]>>({});
  const waterfallTimeoutsRef = useRef<number[]>([]);
  const waterfallLockRef = useRef(false);
  const cascadeResetWaterfallRef = useRef(false);
  const pendingDungeonRemovalsRef = useRef(0);
  const waterfallPendingRef = useRef(false);
  const waterfallSequenceRef = useRef(0);
  const lastWaterfallSequenceRef = useRef<number | null>(null);
  const previewCellRefs = useRef<Array<HTMLDivElement | null>>([]);
  const graveyardCellRef = useRef<HTMLDivElement | null>(null);
  const deckFlyTargetRef = useRef<HTMLButtonElement | null>(null);
  const heroFrameBoundsRef = useRef<DOMRect | null>(null);
  const heroFrameDropIntentRef = useRef(false);
  const lastPlayedFlankRef = useRef(false);
  const draggedCardRef = useRef<GameCardData | null>(null);
  const handleCardToHeroRef = useRef<((card: GameCardData) => void) | null>(null);
  const heroSkillButtonRef = useRef<HTMLButtonElement | null>(null);
  const [heroRowFrameDropActive, setHeroRowFrameDropActive] = useState(false);
  const classDeckFlightsRef = useRef<ClassDeckFlight[]>([]);
  const classDeckFlightAnimationRef = useRef<number | null>(null);
  const classDeckFlightElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const activeCellRefs = useRef<Array<HTMLDivElement | null>>(Array(5).fill(null));
  const [fateSwapFlights, setFateSwapFlights] = useState<FateSwapFlight[]>([]);
  const fateSwapFlightsRef = useRef<FateSwapFlight[]>([]);
  const fateSwapFlightAnimationRef = useRef<number | null>(null);
  const fateSwapFlightElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [graveyardStackFlights, setGraveyardStackFlights] = useState<GraveyardStackFlight[]>([]);
  const graveyardStackFlightsRef = useRef<GraveyardStackFlight[]>([]);
  const graveyardStackFlightAnimationRef = useRef<number | null>(null);
  const graveyardStackFlightElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [backpackHandFlights, setBackpackHandFlights] = useState<BackpackHandFlight[]>([]);
  const backpackHandFlightsRef = useRef<BackpackHandFlight[]>([]);
  const backpackHandFlightAnimationRef = useRef<number | null>(null);
  const backpackFlightElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [discardShockFlights, setDiscardShockFlights] = useState<DiscardShockFlight[]>([]);
  /** 弃牌雷击队列/弹道未结束时禁止玩家操作（与最小化 Event/Shop 合并为 fullBoardInteractionLocked） */
  const [discardShockInteractionLocked, setDiscardShockInteractionLocked] = useState(false);
  const discardShockFlightsRef = useRef<DiscardShockFlight[]>([]);
  const discardShockFlightAnimationRef = useRef<number | null>(null);
  const discardShockElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  // Discard flight animation (hand → graveyard / backpack)
  const [discardFlights, setDiscardFlights] = useState<DiscardFlight[]>([]);
  const discardFlightsRef = useRef<DiscardFlight[]>([]);
  const discardFlightAnimationRef = useRef<number | null>(null);
  const discardFlightElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const discardFlightResolveMapRef = useRef<Map<string, () => void>>(new Map());
  // Steal card flight animation (hand → Goblin dungeon slot)
  const [stealCardFlights, setStealCardFlights] = useState<DiscardFlight[]>([]);
  const stealCardFlightsRef = useRef<DiscardFlight[]>([]);
  const stealCardFlightAnimationRef = useRef<number | null>(null);
  const stealCardFlightElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const stealCardFlightResolveMapRef = useRef<Map<string, () => void>>(new Map());
  /** 多次弃牌雷击：排队，上一发飞行完全结束后再发下一发 */
  const discardShockProcQueueRef = useRef<{ showBanner: boolean }[]>([]);
  const discardShockSeqInFlightRef = useRef(false);
  const flushDiscardShockQueueRef = useRef<() => void>(() => {});
  const applyDiscardShockHitRef = useRef<(flight: DiscardShockFlight) => void>(() => {});
  const beginCombatRef = useRef<(monster: GameCardData, initiator: CombatInitiator) => void>(() => {});
  beginCombatRef.current = beginCombat;
  const activeCardsLatestRef = useRef<ActiveRowSlots>(activeCards);
  activeCardsLatestRef.current = activeCards;
  const backpackHandFlightFallbacksRef = useRef<Map<string, number>>(new Map());
  const pendingHandDeliveryGuardsRef = useRef<
    Map<string, { card: GameCardData; timeoutId: number | null }>
  >(new Map());
  const pendingAutoDrawsRef = useRef(0);
  const skipNextEventAutoDrawRef = useRef(false);
  const skipEventFlipRef = useRef(false);
  const storingCardIdsRef = useRef<Set<string>>(new Set());
  const previousActiveCardsRef = useRef<ActiveRowSlots>(createEmptyActiveRow());
  const freshGameStartRef = useRef(false);
  const suppressTurnAmuletReapplyRef = useRef(false);
  const processedDungeonCardIdsRef = useRef<Set<string>>(new Set());
  const heroTurnLayerLossIdsRef = useRef<Set<string>>(new Set());
  const heroTookDamageThisMonsterTurnRef = useRef(false);
  const pendingDefeatIdsRef = useRef<Set<string>>(new Set());
  const goblinStolenIdsRef = useRef<Set<string>>(new Set());
  const monsterRewardQueuedInstanceIdsRef = useRef<Set<string>>(new Set());
  const [heroFramePosition, setHeroFramePosition] = useState<HeroFramePosition | null>(null);
  const lastPersistedStateRef = useRef<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number>(gameViewport.width);
  const isFlat = gameViewport.width / gameViewport.height > FLAT_ASPECT_RATIO;
  const gridMetrics = useMemo(() => {
    const base = getGridMetricsForWidth(viewportWidth);
    if (isFlat) {
      return { ...base, gapY: Math.max(1, Math.round(base.gapY * 0.15)) };
    }
    return base;
  }, [viewportWidth, isFlat]);
  const stageScale = useMemo(() => {
    return clamp(viewportWidth / 1280, 0.75, 1.6);
  }, [viewportWidth]);
  const gridStyleVars = useMemo(() => {
    return {
      '--dh-grid-gap-x': `${gridMetrics.gapX}px`,
      '--dh-grid-gap-y': `${gridMetrics.gapY}px`,
      '--dh-card-padding': `${gridMetrics.padding}px`,
      '--dh-card-font-scale': gridMetrics.cardFontScale.toString(),
      '--dh-card-stat-scale': gridMetrics.cardStatScale.toString(),
      '--dh-card-icon-scale': gridMetrics.cardIconScale.toString(),
      '--dh-card-dot-size': `${gridMetrics.cardDotSize}px`,
      '--dh-hero-font-scale': gridMetrics.heroFontScale.toString(),
      '--dh-stage-scale': stageScale.toString(),
    } as CSSProperties;
  }, [gridMetrics, stageScale]);
  
  // Track grid card size for synchronization with hand
  const gridCellRef = useRef<HTMLDivElement | null>(null);
  const [gridCardSize, setGridCardSize] = useState<{width: number, height: number} | undefined>(undefined);
  const gridCardSizeRef = useRef(gridCardSize);
  const isCompactViewport = gameViewport.width < 500;
  const rageStripWidth = useMemo(() => {
    if (!gridCardSize?.width) {
      return isCompactViewport ? 9 : 14;
    }
    if (isCompactViewport) {
      return Math.max(5, Math.min(9, gridCardSize.width * 0.04));
    }
    return Math.max(8, Math.min(14, gridCardSize.width * 0.05));
  }, [gridCardSize, isCompactViewport]);
  const overlayScale = useMemo(() => {
    if (!gridCardSize?.width) {
      return 1;
    }
    const baseWidth = 180;
    const scale = gridCardSize.width / baseWidth;
    return clamp(scale, 0.65, 1.3);
  }, [gridCardSize]);
  useEffect(() => { gridCardSizeRef.current = gridCardSize; }, [gridCardSize]);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--dh-rage-strip-width', `${rageStripWidth}px`);
  }, [rageStripWidth]);
  const monsterCardSignature = useMemo(
    () =>
      activeCards
        .map(card => (card && card.type === 'monster' ? card.id : ''))
        .join('|'),
    [activeCards],
  );
  const measureMonsterRageInsets = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const entries = Object.entries(monsterCellRefs.current);
    if (!entries.length) {
      setMonsterRageInsets(prev => (Object.keys(prev).length ? {} : prev));
      return;
    }
    const next: Record<string, MonsterRageInset> = {};
    let hasInset = false;
    entries.forEach(([monsterId, cellEl]) => {
      if (!cellEl) {
        return;
      }
      const styles = window.getComputedStyle(cellEl);
      const inset: MonsterRageInset = {
        top: parseFloat(styles.paddingTop) || 0,
        bottom: parseFloat(styles.paddingBottom) || 0,
        left: parseFloat(styles.paddingLeft) || 0,
        right: parseFloat(styles.paddingRight) || 0,
      };
      next[monsterId] = inset;
      hasInset = true;
    });
    setMonsterRageInsets(prev => {
      if (!hasInset) {
        return Object.keys(prev).length ? {} : prev;
      }
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        return next;
      }
      for (const key of nextKeys) {
        const prevInset = prev[key];
        const nextInset = next[key];
        if (
          !prevInset ||
          Math.abs(prevInset.top - nextInset.top) > 0.5 ||
          Math.abs(prevInset.bottom - nextInset.bottom) > 0.5 ||
          Math.abs(prevInset.left - nextInset.left) > 0.5 ||
          Math.abs(prevInset.right - nextInset.right) > 0.5
        ) {
          return next;
        }
      }
      return prev;
    });
  }, []);
  const getMonsterRageOverlayStyle = useCallback(
    (monsterId: string): CSSProperties => {
      const inset = monsterRageInsets[monsterId];
      const fallback = gridMetrics.padding;
      const top = inset?.top ?? fallback;
      const bottom = inset?.bottom ?? fallback;
      const left = inset?.left ?? fallback;
      const right = inset?.right ?? fallback;
      return {
        top: `${top}px`,
        bottom: `${bottom}px`,
        left: `${left}px`,
        right: `${right}px`,
      };
    },
    [monsterRageInsets, gridMetrics.padding],
  );
  const handAreaRef = useRef<HTMLDivElement | null>(null);
  const [waterfallAnimation, setWaterfallAnimation] = useState<WaterfallAnimationState>(initialWaterfallAnimationState);
  const [previewGraveyardVectors, setPreviewGraveyardVectors] = useState<Record<number, GraveyardVector>>({});
  const [previewDeckReturnVectors, setPreviewDeckReturnVectors] = useState<Record<number, GraveyardVector>>({});
  const [heroSkillArrow, setHeroSkillArrow] = useState<HeroSkillArrowState | null>(null);
  const setPreviewCellRef = useCallback((index: number, el: HTMLDivElement | null) => {
    previewCellRefs.current[index] = el;
    if (index === 0) {
      gridCellRef.current = el;
    }
  }, []);
  const setActiveCellRef = useCallback((index: number, el: HTMLDivElement | null) => {
    activeCellRefs.current[index] = el;
  }, []);
  const setGraveyardRef = useCallback((el: HTMLDivElement | null) => {
    graveyardCellRef.current = el;
  }, []);
  const updateHeroFramePosition = useCallback(() => {
    const container = gridWrapperRef.current;
    const firstCell = heroRowCellRefs.current[0];
    const lastCell = heroRowCellRefs.current[heroRowCellRefs.current.length - 1];
    if (!container || !firstCell || !lastCell) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const firstRect = firstCell.getBoundingClientRect();
    const lastRect = lastCell.getBoundingClientRect();
    const nextPosition = {
      left: firstRect.left - containerRect.left,
      top: firstRect.top - containerRect.top,
      width: lastRect.right - firstRect.left,
      height: firstRect.height,
    };
    setHeroFramePosition(prev => {
      if (
        prev &&
        Math.abs(prev.left - nextPosition.left) < 0.5 &&
        Math.abs(prev.top - nextPosition.top) < 0.5 &&
        Math.abs(prev.width - nextPosition.width) < 0.5 &&
        Math.abs(prev.height - nextPosition.height) < 0.5
      ) {
        return prev;
      }
      return nextPosition;
    });
  }, []);
  const registerHeroRowCellRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      heroRowCellRefs.current[index] = el;
    },
    [],
  );
  const updatePreviewToGraveyardVector = useCallback((slotIndex: number | null) => {
    if (slotIndex === null) return;
    const previewCell = previewCellRefs.current[slotIndex];
    const graveyardCell = graveyardCellRef.current;
    if (!previewCell || !graveyardCell) return;
    const previewRect = previewCell.getBoundingClientRect();
    const graveyardRect = graveyardCell.getBoundingClientRect();
    const vector: GraveyardVector = {
      offsetX:
        graveyardRect.left + graveyardRect.width / 2 - (previewRect.left + previewRect.width / 2),
      offsetY:
        graveyardRect.top + graveyardRect.height / 2 - (previewRect.top + previewRect.height / 2),
    };
    setPreviewGraveyardVectors(prev => {
      const previous = prev[slotIndex];
      if (
        previous &&
        Math.abs(previous.offsetX - vector.offsetX) < 1 &&
        Math.abs(previous.offsetY - vector.offsetY) < 1
      ) {
        return prev;
      }
      return { ...prev, [slotIndex]: vector };
    });
  }, []);

  const updatePreviewToDeckVector = useCallback((slotIndex: number | null) => {
    if (slotIndex === null) return;
    const previewCell = previewCellRefs.current[slotIndex];
    const deckEl = deckFlyTargetRef.current;
    if (!previewCell || !deckEl) return;
    const previewRect = previewCell.getBoundingClientRect();
    const deckRect = deckEl.getBoundingClientRect();
    const vector: GraveyardVector = {
      offsetX: deckRect.left + deckRect.width / 2 - (previewRect.left + previewRect.width / 2),
      offsetY: deckRect.top + deckRect.height / 2 - (previewRect.top + previewRect.height / 2),
    };
    setPreviewDeckReturnVectors(prev => {
      const previous = prev[slotIndex];
      if (
        previous &&
        Math.abs(previous.offsetX - vector.offsetX) < 1 &&
        Math.abs(previous.offsetY - vector.offsetY) < 1
      ) {
        return prev;
      }
      return { ...prev, [slotIndex]: vector };
    });
  }, []);

  const waterfallDiscardFlyRef = useRef<{
    slot: number | null;
    destination: WaterfallDiscardDestination;
  }>({ slot: null, destination: 'graveyard' });

  useEffect(() => {
    waterfallDiscardFlyRef.current = {
      slot: waterfallAnimation.discardSlot,
      destination: waterfallAnimation.discardDestination,
    };
  }, [waterfallAnimation.discardSlot, waterfallAnimation.discardDestination]);

  useEffect(() => {
    logWaterfall('animation-state', {
      phase: waterfallAnimation.phase,
      isActive: waterfallAnimation.isActive,
      droppingSlots: waterfallAnimation.droppingSlots,
      landingSlots: waterfallAnimation.landingSlots,
      discardSlot: waterfallAnimation.discardSlot,
      discardDestination: waterfallAnimation.discardDestination,
      dealingSlots: waterfallAnimation.dealingSlots,
      sequenceId: waterfallAnimation.sequenceId,
    });
  }, [waterfallAnimation]);
  useEffect(() => {
    draggedCardRef.current = draggedCard;
  }, [draggedCard]);

  useEffect(() => {
    const releaseChargeNames = ['命运之刃', '增幅祭坛'];
    for (const buildingName of releaseChargeNames) {
      const bldgIdx = activeCards.findIndex(c => c?.name === buildingName && c.type === 'building');
      if (bldgIdx === -1) continue;
      const bldg = activeCards[bldgIdx]!;
      if (bldg._fateBladeLastSlot !== bldgIdx) {
        const shouldGrantCharge = !bldg.hasReleaseCharge;
        setActiveCards(prev => {
          const next = [...prev] as typeof prev;
          const idx = next.findIndex(c => c?.name === buildingName && c.type === 'building');
          if (idx === -1) return prev;
          const card = next[idx]!;
          if (card._fateBladeLastSlot === idx) return prev;
          next[idx] = {
            ...card,
            hasReleaseCharge: shouldGrantCharge ? true : card.hasReleaseCharge,
            _fateBladeLastSlot: idx,
          };
          return next;
        });
      }
    }
  }, [activeCards]);

  useEffect(() => {
    setViewportWidth(gameViewport.width);
  }, [gameViewport.width]);

  useEffect(() => {
    const target = gridCellRef.current;
    if (!target) return;

    const updateSize = () => {
      if (!gridCellRef.current) return;
      const { width, height } = gridCellRef.current.getBoundingClientRect();
      setGridCardSize(prev => {
        if (prev && prev.width === width && prev.height === height) {
          return prev;
        }
        return { width, height };
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(target);

    return () => resizeObserver.disconnect();
  }, [previewCards]); // Re-measure if layout shifts (though grid is stable)
  useLayoutEffect(() => {
    measureMonsterRageInsets();
  }, [
    measureMonsterRageInsets,
    monsterCardSignature,
    gridMetrics.padding,
    gridCardSize?.width,
    gridCardSize?.height,
  ]);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleResize = () => measureMonsterRageInsets();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [measureMonsterRageInsets]);

  useLayoutEffect(() => {
    const slot = waterfallAnimation.discardSlot;
    if (slot === null) return;
    if (waterfallAnimation.discardDestination === 'deck') {
      updatePreviewToDeckVector(slot);
    } else {
      updatePreviewToGraveyardVector(slot);
    }
  }, [
    waterfallAnimation.discardSlot,
    waterfallAnimation.discardDestination,
    updatePreviewToDeckVector,
    updatePreviewToGraveyardVector,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      const { slot, destination } = waterfallDiscardFlyRef.current;
      if (slot === null) return;
      if (destination === 'deck') {
        updatePreviewToDeckVector(slot);
      } else {
        updatePreviewToGraveyardVector(slot);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updatePreviewToDeckVector, updatePreviewToGraveyardVector]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => updateHeroFramePosition();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateHeroFramePosition]);
  useEffect(() => {
    const sequenceId = waterfallAnimation.sequenceId;
    if (sequenceId === null) {
      return;
    }
    if (lastWaterfallSequenceRef.current === sequenceId) {
      return;
    }
    lastWaterfallSequenceRef.current = sequenceId;
    setWaveDiscardCount(0);
  }, [waterfallAnimation.sequenceId]);

  const queueWaterfallTimeout = useCallback((callback: () => void, delay: number, label?: string) => {
    const id = window.setTimeout(() => {
      if (label) {
        logWaterfall('timeout-fired', { label, id });
      }
      callback();
      waterfallTimeoutsRef.current = waterfallTimeoutsRef.current.filter(storedId => storedId !== id);
    }, delay);
    if (label) {
      logWaterfall('timeout-scheduled', { label, delay, id });
    }
    waterfallTimeoutsRef.current.push(id);
    return id;
  }, []);

  const clearWaterfallTimeouts = useCallback(() => {
    waterfallTimeoutsRef.current.forEach(id => window.clearTimeout(id));
    waterfallTimeoutsRef.current = [];
  }, []);

  const [deckViewerOpen, setDeckViewerOpen] = useState(false);
  const [deckPeekState, setDeckPeekState] = useState<import('./game-board/types').DeckPeekModalState | null>(null);

  const gameLogIdRef = useRef<number>(loadGameLog()?.nextId ?? 0);
  const addGameLog = useCallback((type: LogEntryType, message: string) => {
    const id = ++gameLogIdRef.current;
    setGameLogEntries(prev => {
      const next = [...prev, { id, type, message, timestamp: Date.now() }];
      saveGameLog(next, gameLogIdRef.current);
      return next;
    });
  }, []);
  const clearGameLog = useCallback(() => {
    setGameLogEntries([]);
    gameLogIdRef.current = 0;
    clearGameLogStorage();
  }, []);
  const discardedCardsRef = useRef<GameCardData[]>([]);
  const handCardsRef = useRef<GameCardData[]>([]);
  const flatEquipmentCards: GameCardData[] = useMemo(() =>
    ([equipmentSlot1, ...equipmentSlot1Reserve, equipmentSlot2, ...equipmentSlot2Reserve] as (GameCardData | null)[])
      .filter(Boolean) as GameCardData[],
    [equipmentSlot1, equipmentSlot1Reserve, equipmentSlot2, equipmentSlot2Reserve],
  );
  const flatAmuletCards: GameCardData[] = amuletSlots;
  const deletableCardCount = handCards.length + backpackItems.length + permanentMagicRecycleBag.length
    + flatEquipmentCards.length + flatAmuletCards.length;
  const canDeleteCardInShop = !shopDeleteUsed && deletableCardCount > 0;
  const shopDeleteDisabledReason = shopDeleteUsed
    ? '本次商店的删牌机会已用完。'
    : deletableCardCount === 0
      ? '当前没有可以删除的卡牌。'
      : undefined;
  const [isDraggingToHand, setIsDraggingToHand] = useState(false); // Show hand acquisition zone
  const [isDraggingFromDungeon, setIsDraggingFromDungeon] = useState(false); // Track if dragging from dungeon
  // wraithPassiveEnabledRef eliminated — use engine.getState().wraithPassiveEnabled
  const [wraithPassiveUnlockPopup, setWraithPassiveUnlockPopup] = useState(false);
  const eventChoiceProcessingRef = useRef(false);
  /** Event / Shop 最小化时冻结主界面操作（与弃牌雷击共用 fullBoardInteractionLocked） */
  const minimizedModalLocksBoard =
    (eventModalOpen && eventModalMinimized) || (shopModalOpen && shopModalMinimized) || (gameOver && gameOverMinimized);
  const fullBoardInteractionLocked =
    discardShockInteractionLocked || minimizedModalLocksBoard;
  const fullBoardInteractionLockedRef = useRef(false);
  fullBoardInteractionLockedRef.current = fullBoardInteractionLocked;
  const graveyardDropGuardRef = useRef<{ blocked: boolean }>({ blocked: false });
  /** Subset used only for End Hero Turn; updated later when modal/targeting flags are known */
  const endHeroTurnGuardRef = useRef(false);
  const [eventDiceRollKey, setEventDiceRollKey] = useState(0);
  const eventDiceResolverRef = useRef<((entry: EventDiceRange | null) => void) | null>(null);
  const [persuadeRollKey, setPersuadeRollKey] = useState(0);
  const magicChoiceResolverRef = useRef<((optionId: string) => void) | null>(null);
  const equipmentPromptResolverRef = useRef<((slot: EquipmentSlotId | null) => void) | null>(null);
  const graveyardDiscoverResolverRef = useRef<((card: GameCardData | null) => void) | null>(null);
  /** 坟场三选一取回目的地：亡灵拾遗优先入手牌，其余默认背包 */
  const graveyardDiscoverDeliveryRef = useRef<'backpack' | 'hand-first'>('backpack');
  /** 专属发现弹窗用于药水结算时，替代 completeCurrentEvent */
  const discoverPotionCompletionRef = useRef<((payload: { banner: string }) => void) | null>(null);
  const deckJudgePeekCloseRef = useRef<(() => void) | null>(null);
  const ghostBladeExileResolverRef = useRef<(() => void) | null>(null);
  const daggerSelfDestructResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [daggerSelfDestructPrompt, setDaggerSelfDestructPrompt] = useState<{ weaponName: string; remainingDurability: number } | null>(null);
  const suppressDeathWardRef = useRef(false);
  const selectedHeroSkillRef = useRef<string | null>(selectedHeroSkill);
  selectedHeroSkillRef.current = selectedHeroSkill;
  const eternalRelicsRef = useRef(eternalRelics);
  eternalRelicsRef.current = eternalRelics;
  const cardDraftPendingSkillRef = useRef<string | null>(null);
  const classCardPreviewIdRef = useRef<string | null>(null);
  const eventResolutionRef = useRef<{ cardId: string | null; source: 'dungeon' | 'hand' | null }>({ cardId: null, source: null });
  
  // Card Details Modal State
  const [selectedCard, setSelectedCard] = useState<GameCardData | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);

  // Eternal Relic detail modal
  const [selectedEternalRelic, setSelectedEternalRelic] = useState<import('@/game-core/types').EternalRelic | null>(null);
  const [eternalRelicModalOpen, setEternalRelicModalOpen] = useState(false);
  const handleEternalRelicClick = useCallback((relic: import('@/game-core/types').EternalRelic) => {
    setSelectedEternalRelic(relic);
    setEternalRelicModalOpen(true);
  }, []);

  const bulwarkTempArmorRef = useRef(0);
  bulwarkTempArmorRef.current = bulwarkTempArmorStacks;
  const engagedMonsterIdsRef = useRef<string[]>(initialCombatState.engagedMonsterIds);
  engagedMonsterIdsRef.current = combatState.engagedMonsterIds;
  const isMonsterEngaged = (monsterId: string) => combatState.engagedMonsterIds.includes(monsterId);
  /** 怪物回合或等待格挡：手牌应与地城格一样不可操作，仅可用格挡按钮 */
  const handLockedForMonsterPhase = useMemo(
    () =>
      combatState.engagedMonsterIds.length > 0 &&
      (combatState.currentTurn === 'monster' || Boolean(combatState.pendingBlock)),
    [combatState.engagedMonsterIds, combatState.currentTurn, combatState.pendingBlock],
  );
  const handLockedForMonsterPhaseRef = useRef(false);
  handLockedForMonsterPhaseRef.current = handLockedForMonsterPhase;
  const heroStunnedRef = useRef(false);
  heroStunnedRef.current = heroStunned;
  const [swordVectors, setSwordVectors] = useState<Record<string, SwordVector>>({});
  const echoRemainingRef = useRef(0);
  const echoTotalRef = useRef(0);
  const monsterRewardPreviewCacheRef = useRef<Record<string, MonsterRewardOption[]>>({});



  const clearBackpackHandFallback = useCallback((cardId: string) => {
    const fallbackTimers = backpackHandFlightFallbacksRef.current;
    const timeoutId = fallbackTimers.get(cardId);
    if (timeoutId !== undefined && typeof window !== 'undefined') {
      window.clearTimeout(timeoutId);
    }
    fallbackTimers.delete(cardId);
    logBackpackDraw('fallback-clear', { cardId, remainingTimers: fallbackTimers.size });
  }, []);

  const clearAllBackpackHandFallbacks = useCallback(() => {
    if (typeof window !== 'undefined') {
      backpackHandFlightFallbacksRef.current.forEach(timeoutId => {
        window.clearTimeout(timeoutId);
      });
    }
    backpackHandFlightFallbacksRef.current.clear();
    logBackpackDraw('fallback-clear-all');
  }, []);

  const clearAllHandDeliveryGuards = useCallback(() => {
    if (typeof window !== 'undefined') {
      pendingHandDeliveryGuardsRef.current.forEach(entry => {
        if (entry.timeoutId !== null) {
          window.clearTimeout(entry.timeoutId);
        }
      });
    }
    pendingHandDeliveryGuardsRef.current.clear();
    logBackpackDraw('hand-guard-clear-all');
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;

      animationDelayTimeoutsRef.current.forEach(id => clearTimeout(id));
      animationDelayTimeoutsRef.current = [];

      if (heroBleedTimeoutRef.current) {
        clearTimeout(heroBleedTimeoutRef.current);
        heroBleedTimeoutRef.current = null;
      }

      for (const timeouts of Object.values(monsterBleedTimeoutsRef.current)) {
        timeouts.forEach(id => clearTimeout(id));
      }
      monsterBleedTimeoutsRef.current = {};

      for (const timeouts of Object.values(weaponSwingTimeoutsRef.current)) {
        timeouts.forEach(id => clearTimeout(id));
      }
      weaponSwingTimeoutsRef.current = { equipmentSlot1: [], equipmentSlot2: [] };

      for (const timeouts of Object.values(shieldBlockTimeoutsRef.current)) {
        timeouts.forEach(id => clearTimeout(id));
      }
      shieldBlockTimeoutsRef.current = { equipmentSlot1: [], equipmentSlot2: [] };

      if (directedCombatFxFlightAnimationRef.current !== null) {
        cancelAnimationFrame(directedCombatFxFlightAnimationRef.current);
        directedCombatFxFlightAnimationRef.current = null;
      }
      directedCombatFxFlightsRef.current = [];
      setDirectedCombatFxFlights([]);
      directedCombatFxElementMapRef.current.clear();

      clearWaterfallTimeouts();

      pendingHandDeliveryGuardsRef.current.forEach(entry => {
        ensureCardInHand(entry.card);
      });
      clearAllHandDeliveryGuards();
      clearAllBackpackHandFallbacks();

      if (classDeckFlightAnimationRef.current !== null) {
        cancelAnimationFrame(classDeckFlightAnimationRef.current);
        classDeckFlightAnimationRef.current = null;
      }
      if (fateSwapFlightAnimationRef.current !== null) {
        cancelAnimationFrame(fateSwapFlightAnimationRef.current);
        fateSwapFlightAnimationRef.current = null;
      }
      if (graveyardStackFlightAnimationRef.current !== null) {
        cancelAnimationFrame(graveyardStackFlightAnimationRef.current);
        graveyardStackFlightAnimationRef.current = null;
      }
      if (backpackHandFlightAnimationRef.current !== null) {
        cancelAnimationFrame(backpackHandFlightAnimationRef.current);
        backpackHandFlightAnimationRef.current = null;
      }
      if (discardShockFlightAnimationRef.current !== null) {
        cancelAnimationFrame(discardShockFlightAnimationRef.current);
        discardShockFlightAnimationRef.current = null;
      }

      for (const flight of discardShockFlightsRef.current) {
        if (!flight.delivered) {
          applyDiscardShockHitRef.current(flight);
        }
      }
      discardShockFlightsRef.current = [];
      setDiscardShockFlights([]);
      discardShockElementMapRef.current.clear();
      discardShockProcQueueRef.current = [];
      discardShockSeqInFlightRef.current = false;

      for (const flight of backpackHandFlightsRef.current) {
        if (!flight.delivered) {
          ensureCardInHand(flight.card);
        }
      }
      backpackHandFlightsRef.current = [];
      setBackpackHandFlights([]);

      classDeckFlightsRef.current = [];
      setClassDeckFlights([]);
      fateSwapFlightsRef.current = [];
      setFateSwapFlights([]);
      graveyardStackFlightsRef.current = [];
      setGraveyardStackFlights([]);

      setHeroBleedActive(false);
      setMonsterBleedStates({});
      setWeaponSwingStates({ equipmentSlot1: 0, equipmentSlot2: 0 });
      setShieldBlockStates({ equipmentSlot1: 0, equipmentSlot2: 0 });
      setTakingDamage(false);
      setHealing(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [clearWaterfallTimeouts, clearAllBackpackHandFallbacks, clearAllHandDeliveryGuards, ensureCardInHand]);

  const scheduleBackpackHandFallback = useCallback(
    (card: GameCardData) => {
      if (typeof window === 'undefined') {
        ensureCardInHand(card);
        return;
      }

      clearBackpackHandFallback(card.id);

      const fallbackDelay = animSpeed(
        BACKPACK_FLIGHT_BASE_DURATION +
        BACKPACK_FLIGHT_VARIANCE +
        BACKPACK_FLIGHT_FALLBACK_BUFFER);

      const timeoutId = window.setTimeout(() => {
        backpackHandFlightFallbacksRef.current.delete(card.id);
        logBackpackDraw('fallback-fire', { cardId: card.id });
        ensureCardInHand(card);
      }, fallbackDelay);

      backpackHandFlightFallbacksRef.current.set(card.id, timeoutId);
      logBackpackDraw('fallback-scheduled', {
        cardId: card.id,
        delay: fallbackDelay,
        pendingTimers: backpackHandFlightFallbacksRef.current.size,
      });
    },
    [clearBackpackHandFallback, ensureCardInHand],
  );

  const scheduleHandDeliveryGuard = useCallback(
    (card: GameCardData) => {
      if (typeof window === 'undefined') {
        return;
      }
      const snapshot = sanitizeCardMetadata(card);
      const guards = pendingHandDeliveryGuardsRef.current;
      const existing = guards.get(snapshot.id);
      if (existing && existing.timeoutId !== null) {
        window.clearTimeout(existing.timeoutId);
      }
      const timeoutId = window.setTimeout(() => {
        guards.delete(snapshot.id);
        setHandCards(prev => {
          if (prev.some(existingCard => existingCard.id === snapshot.id)) {
            return prev;
          }
          logBackpackDraw('hand-guard-reinsert', {
            cardId: snapshot.id,
            name: snapshot.name,
          });
          return [...prev, snapshot];
        });
      }, HAND_DELIVERY_GUARD_DELAY);
      guards.set(snapshot.id, { card: snapshot, timeoutId });
      logBackpackDraw('hand-guard-scheduled', {
        cardId: snapshot.id,
        delay: HAND_DELIVERY_GUARD_DELAY,
        pending: guards.size,
      });
    },
    [setHandCards],
  );

  const queueCardIntoHand = (card: GameCardData, sourceHint?: FlightSourceHint) => {
    scheduleHandDeliveryGuard(card);
    const animated = triggerBackpackHandFlight(card, sourceHint);
    logBackpackDraw('queue-card', {
      cardId: card.id,
      name: card.name,
      animated,
    });
    if (!animated) {
      ensureCardInHand(card);
      return;
    }
    scheduleBackpackHandFallback(card);
  };

  useEffect(() => {
    if (pendingHandDeliveryGuardsRef.current.size === 0) {
      return;
    }
    const guards = pendingHandDeliveryGuardsRef.current;
    handCards.forEach(card => {
      const pending = guards.get(card.id);
      if (!pending) {
        return;
      }
      if (pending.timeoutId !== null && typeof window !== 'undefined') {
        window.clearTimeout(pending.timeoutId);
      }
      guards.delete(card.id);
      logBackpackDraw('hand-guard-confirm', { cardId: card.id });
    });
  }, [handCards]);

  useEffect(() => {
    return () => {
      clearAllHandDeliveryGuards();
    };
  }, [clearAllHandDeliveryGuards]);



  const findDeathWardCard = useCallback(
    (): { card: GameCardData; source: 'hand' | 'backpack' } | null => {
      const fromHand = handCards.find(
        candidate => (candidate as KnightCardData | undefined)?.knightEffect === 'death-ward',
      );
      if (fromHand) {
        return { card: fromHand, source: 'hand' };
      }
      const fromBackpack = backpackItems.find(
        candidate => (candidate as KnightCardData | undefined)?.knightEffect === 'death-ward',
      );
      if (fromBackpack) {
        return { card: fromBackpack, source: 'backpack' };
      }
      return null;
    },
    [backpackItems, handCards],
  );

  useEffect(() => {
    if (activeMonsterReward || monsterRewardQueue.length === 0 || ghostBladeExileCards) {
      return;
    }
    setActiveMonsterReward(monsterRewardQueue[0]);
    setMonsterRewardQueue(prev => prev.slice(1));
  }, [activeMonsterReward, monsterRewardQueue, ghostBladeExileCards]);
  const cellWrapperClass = "flex w-full h-full min-w-0 min-h-0";
  const cellInnerClass = "flex w-full h-full dh-grid-cell";
  const updateHeroRowDropHighlight = useCallback((card: GameCardData | null) => {
    setHeroRowDropState(isHeroRowHighlightCard(card) ? card.type : null);
  }, [setHeroRowDropState]);
  const waterfallActive = waterfallAnimation.isActive;
  const selectedHeroSkillDef = useMemo<HeroSkillDefinition | null>(
    () => getHeroSkillById(selectedHeroSkill as HeroSkillId | null | undefined),
    [selectedHeroSkill],
  );

  useEffect(() => {
    if (!graveyardDiscoverState) {
      graveyardDiscoverDeliveryRef.current = 'backpack';
      if (graveyardDiscoverResolverRef.current) {
        graveyardDiscoverResolverRef.current(null);
        graveyardDiscoverResolverRef.current = null;
      }
    }
  }, [graveyardDiscoverState]);

  useEffect(() => {
    setTurnDamageTaken(0);
    clearBerserkTurnBuff();
    setExtraAttackCharges(0);
    setFlashSlotUsed({});
    setGambitExtraActive(false);
    setGambitSlotUsed({});
    if (suppressTurnAmuletReapplyRef.current) {
      suppressTurnAmuletReapplyRef.current = false;
    } else {
      if (amuletEffects.hasStrength) {
        setSlotTempAttack(prev => ({
          equipmentSlot1: (prev.equipmentSlot1 ?? 0) + 4,
          equipmentSlot2: (prev.equipmentSlot2 ?? 0) + 4,
        }));
        addGameLog('amulet', '力量护符：所有装备栏临时攻击 +4！');
      }
      if (amuletEffects.hasBalance) {
        setSlotTempAttack(prev => ({
          equipmentSlot1: (prev.equipmentSlot1 ?? 0) + BALANCE_ATTACK_BONUS,
          equipmentSlot2: (prev.equipmentSlot2 ?? 0) - BALANCE_ATTACK_PENALTY,
        }));
        setSlotTempArmor(prev => ({
          equipmentSlot1: (prev.equipmentSlot1 ?? 0) - BALANCE_SHIELD_PENALTY,
          equipmentSlot2: (prev.equipmentSlot2 ?? 0) + BALANCE_SHIELD_BONUS,
        }));
        addGameLog('amulet', '均衡护符：左栏临时攻击+3护甲-1，右栏临时护甲+3攻击-1');
      }
    }
  }, [turnCount, clearBerserkTurnBuff]);

  const heroFrameRef = useRef<HTMLDivElement | null>(null);
  const updateHeroFrameBounds = useCallback(() => {
    heroFrameBoundsRef.current = heroFrameRef.current
      ? heroFrameRef.current.getBoundingClientRect()
      : null;
  }, []);
  const [heroFrameMetrics, setHeroFrameMetrics] = useState({
    padding: 18,
    border: 5,
    ring: 8,
    shadow: 38,
  });
  useLayoutEffect(() => {
    const target = heroFrameRef.current;
    if (!target) return;
    const computeMetrics = () => {
      const width = target.offsetWidth || 0;
      let padding = Math.max(16, Math.min(38, width * 0.019));
      if (isFlat) {
        padding = Math.max(4, Math.min(12, width * 0.008));
      }
      const border = Math.max(isFlat ? 1.5 : 2.5, padding * 0.32);
      const ring = Math.max(isFlat ? 2 : 4, padding * 0.5);
      const shadow = Math.max(isFlat ? 10 : 24, padding * (isFlat ? 2 : 3.5));
      setHeroFrameMetrics(prev => {
        if (
          Math.abs(prev.padding - padding) < 0.5 &&
          Math.abs(prev.border - border) < 0.5 &&
          Math.abs(prev.ring - ring) < 0.5 &&
          Math.abs(prev.shadow - shadow) < 0.5
        ) {
          return prev;
        }
        return { padding, border, ring, shadow };
      });
    };
    computeMetrics();
    const resizeObserver = new ResizeObserver(computeMetrics);
    resizeObserver.observe(target);
    return () => resizeObserver.disconnect();
  }, [isFlat]);
  useLayoutEffect(() => {
    updateHeroFrameBounds();
  }, [heroFramePosition, updateHeroFrameBounds]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => updateHeroFrameBounds();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateHeroFrameBounds]);
  const startDragSession = useCallback(() => {
    setIsDragSessionActive(true);
  }, []);
  const heroFrameHighlightActive = Boolean(heroRowDropState || heroRowFrameDropActive);
  const heroFrameStyle = useMemo<CSSProperties>(() => ({
    borderWidth: `${heroFrameMetrics.border}px`,
    borderStyle: 'solid',
    borderColor: heroFrameHighlightActive ? 'rgba(139,92,246,0.4)' : 'rgba(96,101,129,0.55)',
    boxShadow: heroFrameHighlightActive
      ? `0 0 ${heroFrameMetrics.shadow * 1.1}px rgba(139,92,246,0.55)`
      : `0 0 ${heroFrameMetrics.shadow}px rgba(2,6,23,0.65)`,
    padding: `${heroFrameMetrics.padding}px`,
    outlineWidth: `${heroFrameMetrics.ring}px`,
    outlineStyle: 'solid',
    outlineColor: heroFrameHighlightActive ? 'rgba(139,92,246,0.55)' : 'rgba(99,102,241,0.28)',
    outlineOffset: `-${heroFrameMetrics.border * 0.6}px`,
  }), [heroFrameMetrics, heroFrameHighlightActive]);
  const heroFrameOverlayStyle = useMemo<CSSProperties>(() => {
    if (!heroFramePosition) {
      return { opacity: 0 };
    }
    const gap = heroFrameMetrics.padding;
    return {
      ...heroFrameStyle,
      top: `${heroFramePosition.top - gap}px`,
      left: `${heroFramePosition.left - gap}px`,
      width: `${heroFramePosition.width + gap * 2}px`,
      height: `${heroFramePosition.height + gap * 2}px`,
      opacity: 1,
      pointerEvents: 'none',
      zIndex: heroFrameHighlightActive ? 25 : 5,
    };
  }, [heroFrameMetrics.padding, heroFramePosition, heroFrameStyle, heroFrameHighlightActive]);
  const isCombatPanelVisible = combatState.engagedMonsterIds.length > 0;
  const clampCombatPanelPosition = useCallback(
    (x: number, y: number, size?: { width: number; height: number }) => {
      const width = size?.width || combatPanelSize.width || COMBAT_PANEL_DEFAULT_WIDTH;
      const height = size?.height || combatPanelSize.height || COMBAT_PANEL_DEFAULT_HEIGHT;
      const maxX = Math.max(COMBAT_PANEL_EDGE_PADDING, gameViewport.width - width - COMBAT_PANEL_EDGE_PADDING);
      const maxY = Math.max(COMBAT_PANEL_EDGE_PADDING, gameViewport.height - height - COMBAT_PANEL_EDGE_PADDING);
      return {
        x: Math.min(Math.max(COMBAT_PANEL_EDGE_PADDING, x), maxX),
        y: Math.min(Math.max(COMBAT_PANEL_EDGE_PADDING, y), maxY),
      };
    },
    [combatPanelSize.height, combatPanelSize.width, gameViewport.width, gameViewport.height],
  );
  const computeDefaultCombatPanelPosition = useCallback(() => {
    const vpWidth = gameViewport.width;
    const vpHeight = gameViewport.height;
    const width = combatPanelSize.width || COMBAT_PANEL_DEFAULT_WIDTH;
    const height = combatPanelSize.height || COMBAT_PANEL_DEFAULT_HEIGHT;
    const undoBottom = 16;
    const undoButtonHeight = 44;
    const gap = 8;
    const top = vpHeight - undoBottom - undoButtonHeight - gap - height;
    const left = vpWidth - width - 16;
    return clampCombatPanelPosition(left, top, { width, height });
  }, [clampCombatPanelPosition, combatPanelSize.height, combatPanelSize.width, gameViewport.width, gameViewport.height]);
  const teardownCombatPanelDrag = useCallback(() => {
    if (typeof window !== 'undefined' && combatPanelWindowListenersRef.current) {
      window.removeEventListener('pointermove', combatPanelWindowListenersRef.current.move);
      window.removeEventListener('pointerup', combatPanelWindowListenersRef.current.up);
      window.removeEventListener('pointercancel', combatPanelWindowListenersRef.current.up);
    }
    combatPanelWindowListenersRef.current = null;
    combatPanelDragSessionRef.current = null;
    setIsCombatPanelDragging(false);
  }, []);
  useEffect(() => {
    return () => {
      teardownCombatPanelDrag();
    };
  }, [teardownCombatPanelDrag]);
  useEffect(() => {
    if (!isCombatPanelVisible) {
      teardownCombatPanelDrag();
      setIsCombatPanelMinimized(true);
    }
  }, [isCombatPanelVisible, teardownCombatPanelDrag]);
  useLayoutEffect(() => {
    if (!isCombatPanelVisible) {
      return;
    }
    setCombatPanelPosition(prev => {
      if (prev) {
        return prev;
      }
      const next = computeDefaultCombatPanelPosition();
      return next ?? prev;
    });
  }, [computeDefaultCombatPanelPosition, isCombatPanelVisible]);
  useLayoutEffect(() => {
    if (!isCombatPanelVisible) {
      return;
    }
    const target = combatPanelWrapperRef.current;
    if (!target) {
      return;
    }
    const updateSize = () => {
      const rect = target.getBoundingClientRect();
      setCombatPanelSize(prev => {
        if (Math.abs(prev.width - rect.width) < 0.5 && Math.abs(prev.height - rect.height) < 0.5) {
          return prev;
        }
        return { width: rect.width, height: rect.height };
      });
    };
    updateSize();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      setCombatPanelSize(prev => {
        if (Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5) {
          return prev;
        }
        return { width, height };
      });
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [isCombatPanelVisible, isCombatPanelMinimized]);
  useEffect(() => {
    if (!isCombatPanelVisible) {
      return;
    }
    setCombatPanelPosition(prev => {
      if (!prev) {
        return prev;
      }
      const clamped = clampCombatPanelPosition(prev.x, prev.y);
      if (Math.abs(clamped.x - prev.x) < 0.5 && Math.abs(clamped.y - prev.y) < 0.5) {
        return prev;
      }
      return clamped;
    });
  }, [clampCombatPanelPosition, combatPanelSize.height, combatPanelSize.width, isCombatPanelVisible]);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleResize = () => {
      if (!isCombatPanelVisible) {
        return;
      }
      setCombatPanelPosition(prev => {
        if (!prev || !combatPanelHasCustomPositionRef.current) {
          return computeDefaultCombatPanelPosition() ?? prev;
        }
        const clamped = clampCombatPanelPosition(prev.x, prev.y);
        if (Math.abs(clamped.x - prev.x) < 0.5 && Math.abs(clamped.y - prev.y) < 0.5) {
          return prev;
        }
        return clamped;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampCombatPanelPosition, computeDefaultCombatPanelPosition, isCombatPanelVisible]);
  const handleCombatPanelPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isCombatPanelVisible) {
        return;
      }
      if (event.button !== 0 && event.pointerType !== 'touch') {
        return;
      }
      if (combatPanelDragSessionRef.current) {
        return;
      }
      const resolvedPosition = combatPanelPosition ?? computeDefaultCombatPanelPosition();
      if (!resolvedPosition) {
        return;
      }
      if (!combatPanelPosition) {
        setCombatPanelPosition(resolvedPosition);
      }
      event.preventDefault();
      event.stopPropagation();
      const session = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: resolvedPosition.x,
        originY: resolvedPosition.y,
      };
      combatPanelDragSessionRef.current = session;
      combatPanelHasCustomPositionRef.current = true;
      setIsCombatPanelDragging(true);
      const handlePointerMove = (nativeEvent: PointerEvent) => {
        if (!combatPanelDragSessionRef.current || nativeEvent.pointerId !== session.pointerId) {
          return;
        }
        nativeEvent.preventDefault();
        const deltaX = nativeEvent.clientX - session.startX;
        const deltaY = nativeEvent.clientY - session.startY;
        const nextPosition = clampCombatPanelPosition(session.originX + deltaX, session.originY + deltaY);
        setCombatPanelPosition(prev => {
          if (prev && Math.abs(prev.x - nextPosition.x) < 0.5 && Math.abs(prev.y - nextPosition.y) < 0.5) {
            return prev;
          }
          return nextPosition;
        });
      };
      const handlePointerUp = (nativeEvent: PointerEvent) => {
        if (!combatPanelDragSessionRef.current || nativeEvent.pointerId !== session.pointerId) {
          return;
        }
        nativeEvent.preventDefault();
        teardownCombatPanelDrag();
      };
      combatPanelWindowListenersRef.current = {
        move: handlePointerMove,
        up: handlePointerUp,
      };
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [
      clampCombatPanelPosition,
      combatPanelPosition,
      computeDefaultCombatPanelPosition,
      isCombatPanelVisible,
      teardownCombatPanelDrag,
    ],
  );
  const combatPanelStyle = useMemo<CSSProperties>(() => {
    const scaledMin = Math.round(135 * stageScale);
    const scaledMax = Math.round(170 * stageScale);
    const style: CSSProperties & Record<`--${string}`, string> = {
        '--combat-panel-width': `clamp(${scaledMin}px, ${11 * stageScale}vw, ${scaledMax}px)`,
        width: 'min(var(--combat-panel-width), calc(100% - 1.5rem))',
    };
    if (combatPanelPosition) {
      style.left = `${combatPanelPosition.x}px`;
      style.top = `${combatPanelPosition.y}px`;
    }
    return style;
  }, [combatPanelPosition, stageScale]);
  const combatPanelWrapperClassName = useMemo(
    () =>
      [
        fullBoardInteractionLocked ? 'pointer-events-none' : 'pointer-events-auto',
        'absolute z-40 combat-panel-wrapper',
        isCombatPanelDragging ? 'combat-panel-wrapper--dragging' : '',
        combatPanelPosition ? '' : COMBAT_PANEL_DEFAULT_POSITION_CLASS,
      ]
        .filter(Boolean)
        .join(' '),
    [combatPanelPosition, isCombatPanelDragging, fullBoardInteractionLocked],
  );

  const resetDragState = useCallback(() => {
    setDraggedCard(null);
    setDraggedEquipment(null);
    setDraggedCardSource(null);
    setIsDraggingFromDungeon(false);
    setIsDraggingToHand(false);
    setHeroRowDropState(null);
    setIsDragSessionActive(false);
    heroFrameDropIntentRef.current = false;
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    if (!isDragSessionActive) {
      return;
    }
    const handleGlobalDragEnd = () => {
      resetDragState();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        resetDragState();
      }
    };
    window.addEventListener('dragend', handleGlobalDragEnd);
    window.addEventListener('mouseup', handleGlobalDragEnd);
    window.addEventListener('touchend', handleGlobalDragEnd);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('dragend', handleGlobalDragEnd);
      window.removeEventListener('mouseup', handleGlobalDragEnd);
      window.removeEventListener('touchend', handleGlobalDragEnd);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isDragSessionActive, resetDragState]);


  const createMonsterRewardOptionId = () => `monster-reward-${Math.random().toString(36).slice(2)}`;

  const generateMonsterRewardOptions = (monster: GameCardData): MonsterRewardOption[] => {
    if (monster.isBuglet) {
      const amount = getRandomInt(2, 3);
      return [{
        id: createMonsterRewardOptionId(),
        title: `获得 ${amount} 金币`,
        description: '小虫子身上掉落的零星金币。',
        detail: '即时奖励',
        effect: { type: 'gold', amount },
      }];
    }

    const isElite = Boolean(monster.monsterSpecial);
    const options: MonsterRewardOption[] = [];
    const usedKeys = new Set<string>();
    const pushOption = (option?: MonsterRewardOption | null) => {
      if (!option) {
        return;
      }
      const key = `${option.effect.type}-${option.detail ?? option.title}`;
      if (usedKeys.has(key)) {
        return;
      }
      usedKeys.add(key);
      options.push(option);
    };

    const createSlotBonusOption = (): MonsterRewardOption => {
      const slotId = Math.random() < 0.5 ? 'equipmentSlot1' : 'equipmentSlot2';
      const bonusType: keyof SlotPermanentBonus = Math.random() < 0.5 ? 'damage' : 'shield';
      const amount = 1;
      const slotLabel = describeSlotLabel(slotId);
      const statLabel = describeBonusLabel(bonusType);
      return {
        id: createMonsterRewardOptionId(),
        title: `${slotLabel} +${amount} ${statLabel}`,
        description: '永久强化该装备槽位的基础属性。',
        detail: '持久增益',
        effect: { type: 'slotBonus', slotId, bonusType, amount },
      };
    };

    const createGoldOption = (): MonsterRewardOption => {
      const amount = getRandomInt(5, 8);
      return {
        id: createMonsterRewardOptionId(),
        title: `获得 ${amount} 金币`,
        description: '拾取战场上散落的金币。',
        detail: '即时奖励',
        effect: { type: 'gold', amount },
      };
    };

    const createHealOption = (): MonsterRewardOption | null => {
      if (hp >= maxHp) {
        return null;
      }
      const amount = getRandomInt(2, 4);
      return {
        id: createMonsterRewardOptionId(),
        title: `回复 ${amount} 点生命`,
        description: '抚平战斗中留下的伤痕。',
        detail: '即时治疗',
        effect: { type: 'heal', amount },
      };
    };

    const createRepairOption = (): MonsterRewardOption | null => {
      if (!getRepairableEquipmentSlots().length) {
        return null;
      }
      return {
        id: createMonsterRewardOptionId(),
        title: '修复 1 点耐久',
        description: '选择一件武器或护盾，恢复 1 点耐久值。',
        detail: '装备保养',
        effect: { type: 'repair', amount: 1, targets: ['weapon', 'shield', 'monster'] },
      };
    };

    const createDrawOption = (): MonsterRewardOption | null => {
      const handTotal = handCards.length + backpackHandFlights.length;
      if (backpackItems.length === 0 || handTotal >= effectiveHandLimit) {
        return null;
      }
      const amount = 1;
      return {
        id: createMonsterRewardOptionId(),
        title: '从背包抽 1 张牌',
        description: '快速检索背包里的资源。',
        detail: '资源调度',
        effect: { type: 'drawBackpack', amount },
      };
    };

    const createDiscoverOption = (): MonsterRewardOption | null => {
      if (classDeck.length === 0 || backpackItems.length >= backpackCapacity) {
        return null;
      }
      return {
        id: createMonsterRewardOptionId(),
        title: '发现一张专属牌',
        description: '从职业卡牌中挑选新的战术手段。',
        detail: isElite ? '精英掉落' : '稀有掉落',
        effect: { type: 'discoverClass' },
      };
    };

    const createGraveyardDiscoverOption = (): MonsterRewardOption | null => {
      if (!isElite) return null;
      if (discardedCards.length === 0 || backpackItems.length >= backpackCapacity) {
        return null;
      }
      return {
        id: createMonsterRewardOptionId(),
        title: '发现一张坟场牌',
        description: '从坟场中挑选一张卡牌放入背包。',
        detail: '精英掉落',
        effect: { type: 'discoverGraveyard' },
      };
    };

    const createMaxHpOption = (): MonsterRewardOption => {
      const amount = Math.random() < 0.5 ? 2 : 3;
      return {
        id: createMonsterRewardOptionId(),
        title: `最大生命 +${amount}`,
        description: '淬炼体魄，扩张体能上限。',
        detail: '永久增益',
        effect: { type: 'maxHp', amount },
      };
    };

    const createBackpackCapacityOption = (): MonsterRewardOption => {
      return {
        id: createMonsterRewardOptionId(),
        title: '背包上限 +1',
        description: '扩展背包空间，容纳更多物资。',
        detail: '永久增益',
        effect: { type: 'backpackCapacity', amount: 1 },
      };
    };

    const createSpellDamageOption = (): MonsterRewardOption => {
      return {
        id: createMonsterRewardOptionId(),
        title: '法术伤害 +1',
        description: '聚焦奥术，让法术造成更多伤害。',
        detail: '永久增益',
        effect: { type: 'spellDamage', amount: 1 },
      };
    };

    const createSpellLifestealOption = (): MonsterRewardOption => {
      return {
        id: createMonsterRewardOptionId(),
        title: '超杀吸血 +1',
        description: '汲取超杀的力量，将溢出伤害转化为治疗。',
        detail: '永久增益',
        effect: { type: 'spellLifesteal', amount: 1 },
      };
    };

    const createStunCapOption = (): MonsterRewardOption => {
      return {
        id: createMonsterRewardOptionId(),
        title: '击晕上限 +5%',
        description: '强化精神力，提高击晕怪物的概率上限。',
        detail: '永久增益',
        effect: { type: 'stunCap', amount: 5 },
      };
    };

    const createUpgradeOption = (): MonsterRewardOption | null => {
      const hasUpgradeable =
        handCards.some(c => isUpgradeableCard(c) && !isCardAtMaxUpgrade(c))
        || [equipmentSlot1, equipmentSlot2].some(c => c != null && isUpgradeableCard(c) && !isCardAtMaxUpgrade(c))
        || amuletSlots.some(c => isUpgradeableCard(c) && !isCardAtMaxUpgrade(c));
      if (!hasUpgradeable) return null;
      return {
        id: createMonsterRewardOptionId(),
        title: '升级一张牌',
        description: '选择一张可升级的卡牌，提升其品质。',
        detail: '战术强化',
        effect: { type: 'upgradeCard' },
      };
    };

    pushOption(createSlotBonusOption());
    pushOption(createSlotBonusOption());
    pushOption(createGoldOption());
    pushOption(createHealOption());
    pushOption(createRepairOption());
    pushOption(createDrawOption());
    if (isElite || Math.random() < 0.10) {
      pushOption(createDiscoverOption());
    }
    pushOption(createGraveyardDiscoverOption());
    pushOption(createMaxHpOption());
    if (Math.random() < 0.25) {
      pushOption(createUpgradeOption());
    }
    if (Math.random() < 0.15) {
      pushOption(createSpellDamageOption());
    }
    if (Math.random() < 0.15) {
      pushOption(createSpellLifestealOption());
    }
    if (Math.random() < 0.15) {
      pushOption(createStunCapOption());
    }
    if (Math.random() < 0.15) {
      pushOption(createBackpackCapacityOption());
    }
    if (Math.random() < 0.15) {
      pushOption({
        id: createMonsterRewardOptionId(),
        title: '劝降成功率 +10%',
        description: '提升交涉能力，劝降怪物的成功率提高。',
        detail: '永久增益',
        effect: { type: 'persuadeRateBonus', amount: 10 },
      });
    }
    if (!gs.statSwapCardObtained && Math.random() < 0.03) {
      pushOption({
        id: createMonsterRewardOptionId(),
        title: '获得魔法卡「颠倒乾坤」',
        description: '永久魔法（Perm 2）：选择一个怪物，将其攻击和血量上限对换。侧击：50% 击晕。',
        detail: '极稀有掉落',
        effect: { type: 'grantStatSwapCard' },
      });
    }

    const pool = [...options];
    const selected: MonsterRewardOption[] = [];
    while (selected.length < 2 && pool.length > 0) {
      const index = Math.floor(Math.random() * pool.length);
      const [option] = pool.splice(index, 1);
      if (option) {
        selected.push(option);
      }
    }
    while (selected.length < 2) {
      selected.push(createGoldOption());
    }
    return selected;
  };

  const getMonsterRewardsPreview = useCallback(
    (monster: GameCardData): MonsterRewardOption[] => {
      const cached = monsterRewardPreviewCacheRef.current[monster.id];
      if (cached) {
        return cached;
      }
      const generated = generateMonsterRewardOptions(monster);
      monsterRewardPreviewCacheRef.current = {
        ...monsterRewardPreviewCacheRef.current,
        [monster.id]: generated,
      };
      return generated;
    },
    [generateMonsterRewardOptions],
  );

  const forgetMonsterRewardsPreview = useCallback((monsterId: string) => {
    if (!monsterRewardPreviewCacheRef.current[monsterId]) {
      return;
    }
    const next = { ...monsterRewardPreviewCacheRef.current };
    delete next[monsterId];
    monsterRewardPreviewCacheRef.current = next;
  }, []);

  const handleCardClick = useCallback(
    (card: GameCardData) => {
      if (fullBoardInteractionLockedRef.current) return;
      setSelectedCard(card);
      if (card.type === 'monster') {
        const preview = getMonsterRewardsPreview(card);
        setSelectedMonsterRewards(preview);
      } else {
        setSelectedMonsterRewards(null);
      }
      setDetailsModalOpen(true);
    },
    [getMonsterRewardsPreview],
  );

  const handleDetailsModalChange = useCallback((open: boolean) => {
    setDetailsModalOpen(open);
    if (!open) {
      setSelectedMonsterRewards(null);
    }
  }, []);


  const applyDiscardShockHit = useCallback(
    (flight: DiscardShockFlight) => {
      const row = activeCardsLatestRef.current;
      const monster = flattenActiveRowSlots(row).find(
        (c): c is GameCardData =>
          Boolean(c && c.type === 'monster' && c.id === flight.targetMonsterId),
      );
      if (!monster) {
        return;
      }
      if (flight.damage > 0 && !engagedMonsterIdsRef.current.includes(monster.id)) {
        beginCombatRef.current(monster, 'hero');
      }
      addGameLog('amulet', `弃牌雷击对 ${monster.name} 造成 ${flight.damage} 点伤害`);
      dealDamageToMonster(monster, flight.damage, { pulses: flight.pulses });
      if (flight.showBanner) {
        setHeroSkillBanner(`${monster.name} 被弃牌雷击击中，受到 ${flight.damage} 点伤害。`);
      }
    },
    [addGameLog, dealDamageToMonster, setHeroSkillBanner],
  );
  applyDiscardShockHitRef.current = applyDiscardShockHit;

  const syncDiscardShockInteractionLock = useCallback(() => {
    const busy =
      discardShockProcQueueRef.current.length > 0 ||
      discardShockSeqInFlightRef.current ||
      discardShockFlightsRef.current.length > 0;
    setDiscardShockInteractionLocked(busy);
  }, []);

  const syncDiscardShockInteractionLockRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    syncDiscardShockInteractionLockRef.current = syncDiscardShockInteractionLock;
  }, [syncDiscardShockInteractionLock]);

  const updateDiscardShockFlightAnimation = useCallback(
    (timestamp: number) => {
      const flights = discardShockFlightsRef.current;
      if (!flights.length) {
        discardShockFlightAnimationRef.current = null;
        syncDiscardShockInteractionLockRef.current();
        return;
      }

      let hasActive = false;
      const toHit: DiscardShockFlight[] = [];
      let hasCompleted = false;
      const projectileSize = DISCARD_SHOCK_PROJECTILE_SIZE;

      for (let i = 0; i < flights.length; i++) {
        const flight = flights[i];
        const elapsed = timestamp - flight.startTime;
        let progress: number;
        if (elapsed < 0) {
          hasActive = true;
          progress = 0;
        } else {
          progress = clamp(elapsed / flight.duration);
        }
        flight.progress = progress;
        if (progress < 1) {
          hasActive = true;
          if (!flight.delivered && progress >= 0.88) {
            toHit.push(flight);
            flight.delivered = true;
          }
        } else {
          if (!flight.delivered) {
            toHit.push(flight);
            flight.delivered = true;
          }
          hasCompleted = true;
        }

        const el = discardShockElementMapRef.current.get(flight.id);
        if (el) {
          const eased = easeInOutCubic(clamp(progress));
          const x = flight.start.x + (flight.end.x - flight.start.x) * eased;
          const linearY = flight.start.y + (flight.end.y - flight.start.y) * eased;
          const arcOffset = Math.sin(Math.PI * eased) * flight.arcHeight;
          const y = linearY - arcOffset;
          const scale = 0.78 + eased * 0.35;
          const fadeIn = eased < 0.08 ? clamp(eased / 0.08) : 1;
          const fadeOut = eased > 0.88 ? clamp(1 - (eased - 0.88) / 0.12) : 1;
          el.style.transform = `translate(${x - projectileSize / 2}px, ${y - projectileSize / 2}px) scale(${scale})`;
          el.style.opacity = String(fadeIn * fadeOut);
        }
      }

      toHit.forEach(f => applyDiscardShockHit(f));

      if (hasCompleted) {
        const prevLen = flights.length;
        const remaining = flights.filter(f => f.progress < 1);
        discardShockFlightsRef.current = remaining;
        setDiscardShockFlights(remaining);
        if (remaining.length < prevLen) {
          discardShockSeqInFlightRef.current = false;
          queueMicrotask(() => {
            flushDiscardShockQueueRef.current();
            syncDiscardShockInteractionLockRef.current();
          });
        }
      }

      if (hasActive && discardShockFlightsRef.current.length > 0) {
        discardShockFlightAnimationRef.current = window.requestAnimationFrame(updateDiscardShockFlightAnimation);
      } else {
        discardShockFlightAnimationRef.current = null;
        syncDiscardShockInteractionLockRef.current();
      }
    },
    [applyDiscardShockHit],
  );

  const startDiscardShockFlightAnimation = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (discardShockFlightAnimationRef.current !== null) return;
    discardShockFlightAnimationRef.current = window.requestAnimationFrame(updateDiscardShockFlightAnimation);
  }, [updateDiscardShockFlightAnimation]);

  const tryStartDiscardShockFlight = useCallback(
    (targetMonsterId: string, damage: number, pulses: number, showBanner: boolean): boolean => {
      if (typeof window === 'undefined') return false;
      const surfaceEl = gameSurfaceRef.current;
      const amuletCell = heroRowCellRefs.current[HERO_ROW_AMULET_INDEX];
      const monsterCell = monsterCellRefs.current[targetMonsterId];
      if (!surfaceEl || !amuletCell || !monsterCell) {
        return false;
      }
      const surfaceRect = surfaceEl.getBoundingClientRect();
      const amuletRect = amuletCell.getBoundingClientRect();
      const monsterRect = monsterCell.getBoundingClientRect();
      const baseTime = performance.now();
      const start: Point = {
        x:
          amuletRect.left +
          amuletRect.width / 2 -
          surfaceRect.left +
          (Math.random() - 0.5) * 10,
        y:
          amuletRect.top +
          amuletRect.height / 2 -
          surfaceRect.top +
          (Math.random() - 0.5) * 8,
      };
      const end: Point = {
        x:
          monsterRect.left +
          monsterRect.width / 2 -
          surfaceRect.left +
          (Math.random() - 0.5) * 14,
        y:
          monsterRect.top +
          monsterRect.height / 2 -
          surfaceRect.top +
          (Math.random() - 0.5) * 14,
      };
      const zapAmulet = amuletSlots.find(a => a.amuletEffect === 'discard-zap');
      const flight: DiscardShockFlight = {
        id: `discard-shock-${targetMonsterId}-${baseTime}`,
        targetMonsterId,
        start,
        end,
        startTime: baseTime,
        duration: animSpeed(DISCARD_SHOCK_FLIGHT_BASE_DURATION + Math.random() * DISCARD_SHOCK_FLIGHT_VARIANCE),
        progress: 0,
        arcHeight: DISCARD_SHOCK_ARC_MIN + Math.random() * DISCARD_SHOCK_ARC_VARIANCE,
        damage,
        pulses,
        projectileImage: zapAmulet?.image,
        showBanner,
      };
      discardShockFlightsRef.current = [...discardShockFlightsRef.current, flight];
      setDiscardShockFlights(discardShockFlightsRef.current);
      startDiscardShockFlightAnimation();
      return true;
    },
    [amuletSlots, startDiscardShockFlightAnimation],
  );

  const updateDirectedCombatFxFlightAnimation = useCallback((timestamp: number) => {
    const flights = directedCombatFxFlightsRef.current;
    if (!flights.length) {
      directedCombatFxFlightAnimationRef.current = null;
      return;
    }
    for (let i = 0; i < flights.length; i++) {
      const flight = flights[i];
      const elapsed = timestamp - flight.startTime;
      const progress = elapsed < 0 ? 0 : clamp(elapsed / flight.duration);
      flight.progress = progress;
      const projectileSize =
        flight.kind === 'shield-reflect'
          ? DIRECTED_REFLECT_PROJECTILE_SIZE
          : flight.kind === 'arcane-blade-spell'
            ? DIRECTED_ARCANE_PROJECTILE_SIZE
            : flight.kind === 'golem-layer-reflect'
              ? DIRECTED_GOLEM_LAYER_PROJECTILE_SIZE
              : DIRECTED_RETALIATION_PROJECTILE_SIZE;
      const el = directedCombatFxElementMapRef.current.get(flight.id);
      if (el) {
        const eased = easeInOutCubic(clamp(progress));
        const x = flight.start.x + (flight.end.x - flight.start.x) * eased;
        const linearY = flight.start.y + (flight.end.y - flight.start.y) * eased;
        const arcOffset = Math.sin(Math.PI * eased) * flight.arcHeight;
        const y = linearY - arcOffset;
        const isArcane = flight.kind === 'arcane-blade-spell';
        const scale = isArcane ? 0.6 + eased * 0.5 : 0.78 + eased * 0.35;
        const fadeIn = eased < 0.08 ? clamp(eased / 0.08) : 1;
        const fadeOut = eased > 0.88 ? clamp(1 - (eased - 0.88) / 0.12) : 1;
        el.style.transform = `translate(${x - projectileSize / 2}px, ${y - projectileSize / 2}px) scale(${scale})`;
        el.style.opacity = String(fadeIn * fadeOut);
      }
    }
    const remaining = flights.filter(f => f.progress < 1);
    if (remaining.length !== flights.length) {
      directedCombatFxFlightsRef.current = remaining;
      setDirectedCombatFxFlights(remaining);
    }
    if (remaining.length > 0) {
      directedCombatFxFlightAnimationRef.current = window.requestAnimationFrame(updateDirectedCombatFxFlightAnimation);
    } else {
      directedCombatFxFlightAnimationRef.current = null;
    }
  }, []);

  const startDirectedCombatFxFlightAnimation = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (directedCombatFxFlightAnimationRef.current !== null) return;
    directedCombatFxFlightAnimationRef.current = window.requestAnimationFrame(updateDirectedCombatFxFlightAnimation);
  }, [updateDirectedCombatFxFlightAnimation]);

  const tryStartShieldReflectDirectedFx = useCallback(
    (slotId: EquipmentSlotId, monsterId: string): boolean => {
      if (typeof window === 'undefined') return false;
      const surfaceEl = gameSurfaceRef.current;
      const equipIdx =
        slotId === 'equipmentSlot1' ? HERO_ROW_EQUIPMENT_1_INDEX : HERO_ROW_EQUIPMENT_2_INDEX;
      const equipCell = heroRowCellRefs.current[equipIdx];
      const monsterCell = monsterCellRefs.current[monsterId];
      if (!surfaceEl || !equipCell || !monsterCell) {
        return false;
      }
      const surfaceRect = surfaceEl.getBoundingClientRect();
      const startRect = equipCell.getBoundingClientRect();
      const endRect = monsterCell.getBoundingClientRect();
      const baseTime = performance.now();
      const start: Point = {
        x: startRect.left + startRect.width / 2 - surfaceRect.left + (Math.random() - 0.5) * 8,
        y: startRect.top + startRect.height / 2 - surfaceRect.top + (Math.random() - 0.5) * 8,
      };
      const end: Point = {
        x: endRect.left + endRect.width / 2 - surfaceRect.left + (Math.random() - 0.5) * 12,
        y: endRect.top + endRect.height / 2 - surfaceRect.top + (Math.random() - 0.5) * 12,
      };
      const flight: DirectedCombatFxFlight = {
        id: `shield-reflect-${monsterId}-${baseTime}`,
        kind: 'shield-reflect',
        start,
        end,
        startTime: baseTime,
        duration: animSpeed(Math.max(380, SHIELD_REFLECT_ANIM_MS - 80 + Math.random() * 60)),
        progress: 0,
        arcHeight: 32 + Math.random() * 48,
      };
      directedCombatFxFlightsRef.current = [...directedCombatFxFlightsRef.current, flight];
      setDirectedCombatFxFlights(directedCombatFxFlightsRef.current);
      startDirectedCombatFxFlightAnimation();
      return true;
    },
    [startDirectedCombatFxFlightAnimation],
  );

  const tryStartBossRetaliationDirectedFx = useCallback(
    (monsterId: string): boolean => {
      if (typeof window === 'undefined') return false;
      const surfaceEl = gameSurfaceRef.current;
      const monsterCell = monsterCellRefs.current[monsterId];
      const heroCell = heroRowCellRefs.current[HERO_ROW_HERO_INDEX];
      if (!surfaceEl || !monsterCell || !heroCell) {
        return false;
      }
      const surfaceRect = surfaceEl.getBoundingClientRect();
      const startRect = monsterCell.getBoundingClientRect();
      const endRect = heroCell.getBoundingClientRect();
      const baseTime = performance.now();
      const start: Point = {
        x: startRect.left + startRect.width / 2 - surfaceRect.left + (Math.random() - 0.5) * 10,
        y: startRect.top + startRect.height / 2 - surfaceRect.top + (Math.random() - 0.5) * 10,
      };
      const end: Point = {
        x: endRect.left + endRect.width / 2 - surfaceRect.left + (Math.random() - 0.5) * 10,
        y: endRect.top + endRect.height / 2 - surfaceRect.top + (Math.random() - 0.5) * 10,
      };
      const flight: DirectedCombatFxFlight = {
        id: `boss-retaliation-${monsterId}-${baseTime}`,
        kind: 'boss-retaliation',
        start,
        end,
        startTime: baseTime,
        duration: animSpeed(Math.max(360, BOSS_RETALIATION_ANIM_MS - 80 + Math.random() * 50)),
        progress: 0,
        arcHeight: 36 + Math.random() * 52,
      };
      directedCombatFxFlightsRef.current = [...directedCombatFxFlightsRef.current, flight];
      setDirectedCombatFxFlights(directedCombatFxFlightsRef.current);
      startDirectedCombatFxFlightAnimation();
      return true;
    },
    [startDirectedCombatFxFlightAnimation],
  );

  const tryStartGolemLayerReflectFx = useCallback(
    (monsterId: string): boolean => {
      if (typeof window === 'undefined') return false;
      const surfaceEl = gameSurfaceRef.current;
      const monsterCell = monsterCellRefs.current[monsterId];
      const heroCell = heroRowCellRefs.current[HERO_ROW_HERO_INDEX];
      if (!surfaceEl || !monsterCell || !heroCell) {
        return false;
      }
      const surfaceRect = surfaceEl.getBoundingClientRect();
      const startRect = monsterCell.getBoundingClientRect();
      const endRect = heroCell.getBoundingClientRect();
      const baseTime = performance.now();
      const start: Point = {
        x: startRect.left + startRect.width / 2 - surfaceRect.left + (Math.random() - 0.5) * 10,
        y: startRect.top + startRect.height / 2 - surfaceRect.top + (Math.random() - 0.5) * 10,
      };
      const end: Point = {
        x: endRect.left + endRect.width / 2 - surfaceRect.left + (Math.random() - 0.5) * 10,
        y: endRect.top + endRect.height / 2 - surfaceRect.top + (Math.random() - 0.5) * 10,
      };
      const flight: DirectedCombatFxFlight = {
        id: `golem-layer-reflect-${monsterId}-${baseTime}`,
        kind: 'golem-layer-reflect',
        start,
        end,
        startTime: baseTime,
        duration: animSpeed(Math.max(320, GOLEM_LAYER_REFLECT_ANIM_MS - 60 + Math.random() * 40)),
        progress: 0,
        arcHeight: 40 + Math.random() * 48,
      };
      directedCombatFxFlightsRef.current = [...directedCombatFxFlightsRef.current, flight];
      setDirectedCombatFxFlights(directedCombatFxFlightsRef.current);
      startDirectedCombatFxFlightAnimation();
      return true;
    },
    [startDirectedCombatFxFlightAnimation],
  );

  const tryStartArcaneBladeSpellFx = useCallback(
    (slotId: EquipmentSlotId, monsterId: string): boolean => {
      if (typeof window === 'undefined') return false;
      const surfaceEl = gameSurfaceRef.current;
      const equipIdx =
        slotId === 'equipmentSlot1' ? HERO_ROW_EQUIPMENT_1_INDEX : HERO_ROW_EQUIPMENT_2_INDEX;
      const equipCell = heroRowCellRefs.current[equipIdx];
      const monsterCell = monsterCellRefs.current[monsterId];
      if (!surfaceEl || !equipCell || !monsterCell) {
        return false;
      }
      const surfaceRect = surfaceEl.getBoundingClientRect();
      const startRect = equipCell.getBoundingClientRect();
      const endRect = monsterCell.getBoundingClientRect();
      const baseTime = performance.now();
      const start: Point = {
        x: startRect.left + startRect.width / 2 - surfaceRect.left + (Math.random() - 0.5) * 6,
        y: startRect.top + startRect.height / 2 - surfaceRect.top + (Math.random() - 0.5) * 6,
      };
      const end: Point = {
        x: endRect.left + endRect.width / 2 - surfaceRect.left + (Math.random() - 0.5) * 10,
        y: endRect.top + endRect.height / 2 - surfaceRect.top + (Math.random() - 0.5) * 10,
      };
      const flight: DirectedCombatFxFlight = {
        id: `arcane-blade-spell-${monsterId}-${baseTime}`,
        kind: 'arcane-blade-spell',
        start,
        end,
        startTime: baseTime,
        duration: animSpeed(Math.max(350, ARCANE_BLADE_SPELL_ANIM_MS - 60 + Math.random() * 50)),
        progress: 0,
        arcHeight: 28 + Math.random() * 40,
      };
      directedCombatFxFlightsRef.current = [...directedCombatFxFlightsRef.current, flight];
      setDirectedCombatFxFlights(directedCombatFxFlightsRef.current);
      startDirectedCombatFxFlightAnimation();
      return true;
    },
    [startDirectedCombatFxFlightAnimation],
  );

  const flushDiscardShockQueue = useCallback(() => {
    const bumpLock = () => {
      syncDiscardShockInteractionLockRef.current();
    };
    if (discardShockSeqInFlightRef.current) {
      bumpLock();
      return;
    }
    const queue = discardShockProcQueueRef.current;
    if (queue.length === 0) {
      bumpLock();
      return;
    }

    if (!engine.getState().amuletSlots.some(s => s?.amuletEffect === 'discard-zap')) {
      discardShockProcQueueRef.current = [];
      bumpLock();
      return;
    }
    const monsters = flattenActiveRowSlots(activeCardsLatestRef.current).filter(
      (c): c is GameCardData => Boolean(c && c.type === 'monster'),
    );
    if (monsters.length === 0) {
      discardShockProcQueueRef.current = [];
      bumpLock();
      return;
    }

    const { showBanner } = queue.shift()!;
    const target = monsters[Math.floor(Math.random() * monsters.length)];
    const dmg = Math.max(0, 1 + permanentSpellDamageBonus);

    discardShockSeqInFlightRef.current = true;
    const started = tryStartDiscardShockFlight(target.id, dmg, 2, showBanner);
    if (!started) {
      discardShockSeqInFlightRef.current = false;
      if (dmg > 0 && !engagedMonsterIdsRef.current.includes(target.id)) {
        beginCombatRef.current(target, 'hero');
      }
      addGameLog('amulet', `弃牌雷击对 ${target.name} 造成 ${dmg} 点伤害`);
      dealDamageToMonster(target, dmg, { pulses: 2 });
      if (showBanner) {
        setHeroSkillBanner(`${target.name} 被弃牌雷击击中，受到 ${dmg} 点伤害。`);
      }
      queueMicrotask(() => {
        flushDiscardShockQueueRef.current();
        syncDiscardShockInteractionLockRef.current();
      });
    } else {
      bumpLock();
    }
  }, [
    addGameLog,
    clearUndoStorage,
    dealDamageToMonster,
    permanentSpellDamageBonus,
    setHeroSkillBanner,
    setUndoCount,
    tryStartDiscardShockFlight,
  ]);

  useLayoutEffect(() => {
    flushDiscardShockQueueRef.current = flushDiscardShockQueue;
  }, [flushDiscardShockQueue]);

  const dragonBleedDestroyEquipment = (monsterName: string, remainingLayers: number) => {
    const destroySlot = (slotId: 'equipmentSlot1' | 'equipmentSlot2', item: EquipmentItem | null) => {
      if (!item) return false;
      const dur = item.durability ?? 0;
      if (dur > remainingLayers) {
        const card = item as GameCardData;
        if (card.onDestroyHeal) {
          healHero(card.onDestroyHeal);
          addGameLog('equip', `${card.name} 遗言：恢复了 ${card.onDestroyHeal} 点生命`);
        }
        if (card.onDestroyGold) {
          setGold(prev => prev + card.onDestroyGold!);
          addGameLog('equip', `${card.name} 遗言：获得了 ${card.onDestroyGold} 金币`);
        }
        if (card.onDestroyDraw) {
          for (let di = 0; di < card.onDestroyDraw; di++) drawFromBackpackToHand();
          addGameLog('equip', `${card.name} 遗言：抽取了 ${card.onDestroyDraw} 张牌`);
        }
        if (card.onDestroyClassDraw) {
          const drawn = drawClassCardsToBackpack(card.onDestroyClassDraw, `${card.name}-遗言`);
          if (drawn.length > 0) {
            triggerClassDeckFlight(drawn);
            addGameLog('equip', `${card.name} 遗言：获得专属卡「${drawn.map(c => c.name).join('、')}」`);
          }
        }
        if (card.onDestroyPermanentDamage) {
          setEquipmentSlotBonus(slotId, 'damage', cur => cur + card.onDestroyPermanentDamage!);
          addGameLog('equip', `${card.name} 遗言：该装备栏永久伤害 +${card.onDestroyPermanentDamage}！`);
        }
        if (card.onDestroyPermanentShield) {
          setEquipmentSlotBonus(slotId, 'shield', cur => cur + card.onDestroyPermanentShield!);
          addGameLog('equip', `${card.name} 遗言：该装备栏永久护甲 +${card.onDestroyPermanentShield}！`);
        }
        if (card.onDestroyEffect) {
          addGameLog('equip', `${card.name} 遗言：${card.onDestroyEffect}`);
        }
        const isMonsterEquipDB = card.type === 'monster';
        const nativeReviveDB = isMonsterEquipDB && card.hasRevive && !card.reviveUsed;
        const equipReviveDB = card.hasEquipmentRevive && !card.equipmentReviveUsed;
        if (nativeReviveDB || equipReviveDB) {
          const revived = nativeReviveDB
            ? { ...card, durability: 1, reviveUsed: true }
            : { ...card, durability: 1, equipmentReviveUsed: true };
          setEquipmentSlotById(slotId, revived as EquipmentItem);
          addGameLog('equip', `${card.name} 复生！以 1 耐久复活！`);
          addGameLog('combat', `${monsterName} 流血破甲：攻击「${item.name}」（耐久 ${dur} > 血层 ${remainingLayers}），但它复生了！`);
        } else {
          if (slotId === 'equipmentSlot1') setEquipmentSlot1(null);
          else setEquipmentSlot2(null);
          disposeOwnedEquipmentCard(card, { isDestruction: true });
          addGameLog('combat', `${monsterName} 流血破甲：破坏了「${item.name}」（耐久 ${dur} > 血层 ${remainingLayers}）！`);
          const skelOtherSlotId: EquipmentSlotId = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
          const skelOtherItem = skelOtherSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
          if (skelOtherItem && skelOtherItem.type === 'monster' && (skelOtherItem as GameCardData).skeletonReRevive
            && (!(skelOtherItem as GameCardData).hasRevive || (skelOtherItem as GameCardData).reviveUsed)) {
            setEquipmentSlotById(skelOtherSlotId, { ...skelOtherItem, hasRevive: true, reviveUsed: false } as EquipmentItem);
            addGameLog('equip', `${skelOtherItem.name} 亡骨轮回：获得了「复生」！`);
            setHeroSkillBanner(`${skelOtherItem.name} 亡骨轮回！`);
          }
        }
        return true;
      }
      return false;
    };
    const d1 = destroySlot('equipmentSlot1', equipmentSlot1);
    const d2 = destroySlot('equipmentSlot2', equipmentSlot2);
    if (d1 || d2) {
      setHeroSkillBanner(`${monsterName} 流血破甲！高耐久装备被破坏！`);
    }
  };

  const triggerDiscardShock = useCallback(() => {
    if (!engine.getState().amuletSlots.some(s => s?.amuletEffect === 'discard-zap')) {
      return;
    }
    const monsters = flattenActiveRowSlots(activeCardsLatestRef.current).filter(
      (c): c is GameCardData => Boolean(c && c.type === 'monster'),
    );
    if (monsters.length === 0) {
      return;
    }
    const showBanner =
      !pendingHeroSkillAction && !pendingMagicAction && !pendingPotionAction;
    discardShockProcQueueRef.current.push({ showBanner });
    flushDiscardShockQueueRef.current();
    syncDiscardShockInteractionLockRef.current();
  }, [pendingHeroSkillAction, pendingMagicAction, pendingPotionAction]);

  const syncMonsterRewardQueuedInstanceIdsRef = useCallback(
    (queue: MonsterRewardDrop[], active: MonsterRewardDrop | null) => {
      const next = new Set<string>();
      (queue ?? []).forEach(d => {
        if (d.monsterInstanceId) next.add(d.monsterInstanceId);
      });
      if (active?.monsterInstanceId) next.add(active.monsterInstanceId);
      monsterRewardQueuedInstanceIdsRef.current = next;
    },
    [],
  );

  const resetHeroTurnUsage = () => {
    setCombatState(prev => ({
      ...prev,
      heroAttacksThisTurn: {
        equipmentSlot1: false,
        equipmentSlot2: false,
      },
      heroAttacksRemaining: 2,
      heroDamageThisTurn: {},
    }));
  };

  const effectiveHandLimit = HAND_LIMIT + handLimitBonus;
  const eternalMaxHpBonus = eternalRelics.reduce((sum, r) => sum + (r.initialMaxHpBonus ?? 0), 0);
  const maxHp =
    INITIAL_HP +
    amuletEffects.aura.maxHp +
    permanentMaxHpBonus +
    (permanentSkills.includes('Iron Will') ? 3 : 0) +
    (selectedHeroSkillDef?.initialMaxHpBonus ?? 0) +
    eternalMaxHpBonus;
  const attackBonus = amuletEffects.aura.attack + 
    (permanentSkills.includes('Weapon Master') ? 1 : 0) +
    weaponMasterBonus + // Knight class bonus to all weapons
    (permanentSkills.includes('Berserker Rage') ? Math.floor((maxHp - hp) / 2) : 0) + // +1 per 2 HP missing
    (permanentSkills.includes('Battle Frenzy') && hp < maxHp / 2 ? 2 : 0); // Bonus when low HP
  const defenseBonus = amuletEffects.aura.defense + 
    (permanentSkills.includes('Iron Skin') ? 1 : 0) +
    shieldMasterBonus + // Knight class bonus to all shields
    (defensiveStanceActive ? 1 : 0); // Defensive stance damage reduction
  const heroDetailsStats = {
    hp,
    maxHp,
    gold,
    attackBonus,
    defenseBonus,
    spellDamageBonus: permanentSpellDamageBonus,
    spellLifesteal: permanentSpellLifesteal,
    tempShield,
    permanentMaxHpBonus,
    stunCap,
  };
  const monsterRewardPreviewForModal = useMemo(() => {
    if (selectedCard?.type !== 'monster' || !selectedMonsterRewards?.length) {
      return null;
    }
    return selectedMonsterRewards.map(option => ({
      id: option.id,
      title: option.title,
      description: option.description,
      detail: option.detail,
    }));
  }, [selectedCard, selectedMonsterRewards]);
  const heroDetailsSkills = useMemo(() => {
    const skills: HeroSkillDefinition[] = [];
    if (selectedHeroSkillDef) skills.push(selectedHeroSkillDef);
    for (const id of extraHeroSkills) {
      const def = getHeroSkillById(id);
      if (def) skills.push(def);
    }
    return skills;
  }, [selectedHeroSkillDef, extraHeroSkills]);

  







  useEffect(() => {
    const prevSlots = previousActiveCardsRef.current;
    const isInitialSetup = prevSlots.every(s => s === null);
    const isFreshGame = isInitialSetup && freshGameStartRef.current;
    if (isFreshGame) {
      freshGameStartRef.current = false;
    }
    const newlyLandedMonsters: GameCardData[] = [];
    for (let column = 0; column < DUNGEON_COLUMN_COUNT; column += 1) {
      const prevCard = prevSlots[column];
      const nextCard = activeCards[column];
      if (prevCard && !nextCard) {
        if (storingCardIdsRef.current.has(prevCard.id)) {
          logBackpackDraw('slot-cleared-deferred', { cardId: prevCard.id });
          continue;
        }
        registerDungeonCardProcessed(prevCard.id, 'slot-cleared');
      }
      if ((isFreshGame || !isInitialSetup) && !prevCard && nextCard && nextCard.type === 'monster' && (nextCard.enterEffect || nextCard.ogreEnterDiscard)) {
        newlyLandedMonsters.push(nextCard);
      }
    }
    previousActiveCardsRef.current = activeCards;

    if (newlyLandedMonsters.length > 0) {
      for (const monster of newlyLandedMonsters) {
        if (monster.enterEffect === 'auto-engage') {
          const rowMonsters = activeCards.filter(c => c && c.type === 'monster') as GameCardData[];
          const names = rowMonsters.map(m => m.name);
          addGameLog('combat', `${monster.name} 入场：整行怪物进入激怒状态！（${names.join('、')}）`);
          setHeroSkillBanner(`${monster.name} 入场！全体怪物激怒！`);
          for (const m of rowMonsters) {
            beginCombat(m, 'hero');
          }
        }
        if (monster.ogreEnterDiscard && handCards.length > 0) {
          const [discarded] = pickRandomHandCardsForDiscardPreferGraveyard(handCards, 1);
          setHandCards(prev => prev.filter(c => c.id !== discarded.id));
          discardCardToGraveyard(discarded, { owner: 'player' });
          addGameLog('combat', `${monster.name} 蛮力震慑：随机弃回了手牌「${discarded.name}」！`);
          setHeroSkillBanner(`${monster.name} 震慑！弃回了「${discarded.name}」！`);
        }
      }
    }

    if (isFreshGame || !isInitialSetup) {
      const rowMonsterCount = activeCards.filter(c => c && c.type === 'monster').length;
      const hasHordeRageSwarm = activeCards.some(c => c && c.swarmHordeRage && !c.isStunned);
      if (hasHordeRageSwarm && rowMonsterCount >= 3) {
        const hasUnbuffed = activeCards.some(c => c && c.type === 'monster' && !c.swarmHordeBuffed);
        if (hasUnbuffed) {
          setActiveCards(prev => {
            const next = prev.map(card => {
              if (!card || card.type !== 'monster' || card.swarmHordeBuffed) return card;
              return {
                ...card,
                attack: (card.attack ?? card.value) + 3,
                value: card.value + 3,
                hp: (card.hp ?? 0) + 3,
                maxHp: (card.maxHp ?? 0) + 3,
                swarmHordeBuffed: true,
              };
            }) as ActiveRowSlots;
            return next;
          });
          const swarmCard = activeCards.find(c => c && c.swarmHordeRage);
          const monsterNames = activeCards.filter(c => c && c.type === 'monster').map(c => c!.name);
          addGameLog('combat', `${swarmCard!.name} 虫群集结！激活行怪物≥3，所有怪物+3攻击+3血量！（${monsterNames.join('、')}）`);
          setHeroSkillBanner(`虫群集结！全体怪物+3攻击+3血量！`);
          const rowMonstersToEngage = activeCards.filter(c => c && c.type === 'monster') as GameCardData[];
          for (const m of rowMonstersToEngage) {
            if (!isMonsterEngaged(m.id)) {
              beginCombat(m, 'monster');
            }
          }
        }
      }

      const isLowGold = gold <= 10;
      setActiveCards(prev => {
        let changed = false;
        const next = prev.map(card => {
          if (!card || card.type !== 'monster' || !card.eliteLowGoldPower) return card;
          if (isLowGold && !card.lowGoldBuffActive) {
            changed = true;
            addGameLog('combat', `${card.name} 感受到了贪婪的力量！攻击力与血量翻倍！`);
            setHeroSkillBanner(`${card.name} 贪婪强化！攻击力与血量翻倍！`);
            return {
              ...card,
              attack: (card.attack ?? card.value) * 2,
              value: card.value * 2,
              hp: (card.hp ?? 0) * 2,
              maxHp: (card.maxHp ?? 0) * 2,
              lowGoldBuffActive: true,
            };
          }
          return card;
        });
        return changed ? next : prev;
      });
    }
  }, [activeCards, registerDungeonCardProcessed]);

  useEffect(() => {
    if (storingCardIdsRef.current.size === 0) {
      return;
    }
    const readyIds: string[] = [];
    storingCardIdsRef.current.forEach(cardId => {
      if (backpackItems.some(card => card.id === cardId)) {
        readyIds.push(cardId);
      }
    });
    if (!readyIds.length) {
      return;
    }
    readyIds.forEach(cardId => {
      storingCardIdsRef.current.delete(cardId);
      logBackpackDraw('backpack-store-ready', { cardId });
      registerDungeonCardProcessed(cardId, 'backpack-store');
    });
  }, [backpackItems, registerDungeonCardProcessed]);











  const updateClassDeckFlightAnimation = useCallback((timestamp: number) => {
    const flights = classDeckFlightsRef.current;
    if (!flights.length) {
      classDeckFlightAnimationRef.current = null;
      return;
    }

    let hasActive = false;
    let hasCompleted = false;
    const cardW = gridCardSizeRef.current?.width ?? 140;
    const cardH = gridCardSizeRef.current?.height ?? 210;

    for (let i = 0; i < flights.length; i++) {
      const flight = flights[i];
      const elapsed = timestamp - flight.startTime;
      let progress: number;
      if (elapsed < 0) {
        hasActive = true;
        progress = 0;
      } else {
        progress = clamp(elapsed / flight.duration);
      }
      flight.progress = progress;
      if (progress < 1) {
        hasActive = true;
      } else {
        hasCompleted = true;
      }

      const el = classDeckFlightElementMapRef.current.get(flight.id);
      if (el) {
        const eased = easeInOutCubic(clamp(progress));
        const x = flight.start.x + (flight.end.x - flight.start.x) * eased;
        const linearY = flight.start.y + (flight.end.y - flight.start.y) * eased;
        const arcOffset = Math.sin(Math.PI * eased) * flight.arcHeight;
        const y = linearY - arcOffset;
        const scale = 0.85 + eased * 0.2;
        const fadeIn = eased < 0.12 ? clamp(eased / 0.12) : 1;
        const fadeOut = eased > 0.88 ? clamp(1 - (eased - 0.88) / 0.12) : 1;
        const rotate = Math.sin(eased * Math.PI * 1.2) * 5;
        el.style.transform = `translate(${x - cardW / 2}px, ${y - cardH / 2}px) scale(${scale}) rotate(${rotate}deg)`;
        el.style.opacity = String(fadeIn * fadeOut);
      }
    }

    if (hasCompleted) {
      const remaining = flights.filter(f => f.progress < 1);
      classDeckFlightsRef.current = remaining;
      setClassDeckFlights(remaining);
    }

    if (hasActive && classDeckFlightsRef.current.length > 0) {
      classDeckFlightAnimationRef.current = window.requestAnimationFrame(updateClassDeckFlightAnimation);
    } else {
      classDeckFlightAnimationRef.current = null;
    }
  }, []);

  const startClassDeckFlightAnimation = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (classDeckFlightAnimationRef.current !== null) return;
    classDeckFlightAnimationRef.current = window.requestAnimationFrame(updateClassDeckFlightAnimation);
  }, [updateClassDeckFlightAnimation]);

  const triggerClassDeckFlight = useCallback((cards: GameCardData[]) => {
    if (!cards.length || typeof window === 'undefined') return;
    const boardEl = boardRef.current;
    const classDeckCell = heroRowCellRefs.current[HERO_ROW_CLASS_DECK_INDEX];
    const backpackCell = heroRowCellRefs.current[HERO_ROW_BACKPACK_INDEX];

    if (!boardEl || !classDeckCell || !backpackCell) return;

    const boardRect = boardEl.getBoundingClientRect();
    const classRect = classDeckCell.getBoundingClientRect();
    const backpackRect = backpackCell.getBoundingClientRect();
    const baseTime = performance.now();

    const newFlights = cards.map((card, index) => {
      const id = `class-flight-${card.id}-${baseTime}-${index}`;
      const start: Point = {
        x: classRect.left + classRect.width / 2 - boardRect.left + (Math.random() - 0.5) * 26,
        y: classRect.top + classRect.height / 2 - boardRect.top + (Math.random() - 0.5) * 18,
      };
      const end: Point = {
        x: backpackRect.left + backpackRect.width / 2 - boardRect.left + (Math.random() - 0.5) * 18,
        y: backpackRect.top + backpackRect.height / 2 - boardRect.top + (Math.random() - 0.5) * 16,
      };
      return {
        id,
        card,
        start,
        end,
        startTime: baseTime + index * animSpeed(CLASS_FLIGHT_STAGGER),
        duration: animSpeed(CLASS_FLIGHT_BASE_DURATION + Math.random() * CLASS_FLIGHT_VARIANCE),
        progress: 0,
        arcHeight: CLASS_FLIGHT_ARC_MIN + Math.random() * CLASS_FLIGHT_ARC_VARIANCE,
      };
    });

    classDeckFlightsRef.current = [...classDeckFlightsRef.current, ...newFlights];
    setClassDeckFlights(classDeckFlightsRef.current);
    startClassDeckFlightAnimation();
  }, [startClassDeckFlightAnimation]);

  // ---------------------------------------------------------------------------
  // Fate-swap flight animation (深层交织)
  // ---------------------------------------------------------------------------

  const FATE_SWAP_FLIGHT_DURATION = 650;
  const FATE_SWAP_ARC_HEIGHT = 55;

  const updateFateSwapFlightAnimation = useCallback((timestamp: number) => {
    const flights = fateSwapFlightsRef.current;
    if (!flights.length) {
      fateSwapFlightAnimationRef.current = null;
      return;
    }

    let hasActive = false;
    let hasCompleted = false;
    const cardW = gridCardSizeRef.current?.width ?? 140;
    const cardH = gridCardSizeRef.current?.height ?? 210;

    for (let i = 0; i < flights.length; i++) {
      const flight = flights[i];
      const elapsed = timestamp - flight.startTime;
      let progress: number;
      if (elapsed < 0) {
        hasActive = true;
        progress = 0;
      } else {
        progress = clamp(elapsed / flight.duration);
      }
      flight.progress = progress;
      if (progress < 1) {
        hasActive = true;
      } else {
        hasCompleted = true;
      }

      const el = fateSwapFlightElementMapRef.current.get(flight.id);
      if (el) {
        const eased = easeInOutCubic(clamp(progress));
        const x = flight.start.x + (flight.end.x - flight.start.x) * eased;
        const linearY = flight.start.y + (flight.end.y - flight.start.y) * eased;
        const arcOffset = Math.sin(Math.PI * eased) * flight.arcHeight;
        const y = linearY - arcOffset;
        const scale = 0.82 + Math.sin(Math.PI * eased) * 0.22;
        const fadeIn = eased < 0.08 ? clamp(eased / 0.08) : 1;
        const fadeOut = eased > 0.82 ? clamp(1 - (eased - 0.82) / 0.18) : 1;
        const rotate = Math.sin(eased * Math.PI * 1.4) * 10;
        el.style.transform = `translate(${x - cardW / 2}px, ${y - cardH / 2}px) scale(${scale}) rotate(${rotate}deg)`;
        el.style.opacity = String(fadeIn * fadeOut);
      }
    }

    if (hasCompleted) {
      const remaining = flights.filter(f => f.progress < 1);
      fateSwapFlightsRef.current = remaining;
      setFateSwapFlights(remaining);
    }

    if (hasActive && fateSwapFlightsRef.current.length > 0) {
      fateSwapFlightAnimationRef.current = window.requestAnimationFrame(updateFateSwapFlightAnimation);
    } else {
      fateSwapFlightAnimationRef.current = null;
    }
  }, []);

  const startFateSwapFlightAnimation = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (fateSwapFlightAnimationRef.current !== null) return;
    fateSwapFlightAnimationRef.current = window.requestAnimationFrame(updateFateSwapFlightAnimation);
  }, [updateFateSwapFlightAnimation]);

  const triggerFateSwapFlight = useCallback((activeSlotIdx: number, oldCard: GameCardData, newCard: GameCardData) => {
    if (typeof window === 'undefined') return;
    const surfaceEl = gameSurfaceRef.current;
    const activeCell = activeCellRefs.current[activeSlotIdx];
    const deckEl = deckFlyTargetRef.current;

    if (!surfaceEl || !activeCell || !deckEl) return;

    const surfaceRect = surfaceEl.getBoundingClientRect();
    const cellRect = activeCell.getBoundingClientRect();
    const deckRect = deckEl.getBoundingClientRect();
    const baseTime = performance.now();

    const dungeonCenter: Point = {
      x: cellRect.left + cellRect.width / 2 - surfaceRect.left,
      y: cellRect.top + cellRect.height / 2 - surfaceRect.top,
    };
    const deckCenter: Point = {
      x: deckRect.left + deckRect.width / 2 - surfaceRect.left,
      y: deckRect.top + deckRect.height / 2 - surfaceRect.top,
    };

    const duration = animSpeed(FATE_SWAP_FLIGHT_DURATION);

    const flights: FateSwapFlight[] = [
      {
        id: `fate-swap-out-${oldCard.id}-${baseTime}`,
        card: oldCard,
        start: dungeonCenter,
        end: deckCenter,
        startTime: baseTime,
        duration,
        progress: 0,
        arcHeight: FATE_SWAP_ARC_HEIGHT,
      },
      {
        id: `fate-swap-in-${newCard.id}-${baseTime}`,
        card: newCard,
        start: deckCenter,
        end: dungeonCenter,
        startTime: baseTime,
        duration,
        progress: 0,
        arcHeight: FATE_SWAP_ARC_HEIGHT,
      },
    ];

    fateSwapFlightsRef.current = [...fateSwapFlightsRef.current, ...flights];
    setFateSwapFlights(fateSwapFlightsRef.current);
    startFateSwapFlightAnimation();
  }, [startFateSwapFlightAnimation]);

  // ---------------------------------------------------------------------------
  // Graveyard Stack Flight (Graveyard Amulet: graveyard → dungeon cell)
  // ---------------------------------------------------------------------------
  const GRAVEYARD_STACK_FLIGHT_DURATION = 600;
  const GRAVEYARD_STACK_ARC_HEIGHT = 60;

  const updateGraveyardStackFlightAnimation = useCallback((timestamp: number) => {
    const flights = graveyardStackFlightsRef.current;
    if (!flights.length) {
      graveyardStackFlightAnimationRef.current = null;
      return;
    }

    let hasActive = false;
    let hasCompleted = false;
    const cardW = gridCardSizeRef.current?.width ?? 140;
    const cardH = gridCardSizeRef.current?.height ?? 210;

    for (let i = 0; i < flights.length; i++) {
      const flight = flights[i];
      const elapsed = timestamp - flight.startTime;
      let progress: number;
      if (elapsed < 0) {
        hasActive = true;
        progress = 0;
      } else {
        progress = clamp(elapsed / flight.duration);
      }
      flight.progress = progress;
      if (progress < 1) {
        hasActive = true;
      } else {
        hasCompleted = true;
      }

      const el = graveyardStackFlightElementMapRef.current.get(flight.id);
      if (el) {
        const eased = easeInOutCubic(clamp(progress));
        const x = flight.start.x + (flight.end.x - flight.start.x) * eased;
        const linearY = flight.start.y + (flight.end.y - flight.start.y) * eased;
        const arcOffset = Math.sin(Math.PI * eased) * flight.arcHeight;
        const y = linearY - arcOffset;
        const scale = 0.75 + Math.sin(Math.PI * eased) * 0.3;
        const fadeIn = eased < 0.08 ? clamp(eased / 0.08) : 1;
        const fadeOut = eased > 0.82 ? clamp(1 - (eased - 0.82) / 0.18) : 1;
        const rotate = Math.sin(eased * Math.PI * 1.2) * 12;
        el.style.transform = `translate(${x - cardW / 2}px, ${y - cardH / 2}px) scale(${scale}) rotate(${rotate}deg)`;
        el.style.opacity = String(fadeIn * fadeOut);
      }
    }

    if (hasCompleted) {
      const remaining = flights.filter(f => f.progress < 1);
      graveyardStackFlightsRef.current = remaining;
      setGraveyardStackFlights(remaining);
    }

    if (hasActive && graveyardStackFlightsRef.current.length > 0) {
      graveyardStackFlightAnimationRef.current = window.requestAnimationFrame(updateGraveyardStackFlightAnimation);
    } else {
      graveyardStackFlightAnimationRef.current = null;
    }
  }, []);

  const startGraveyardStackFlightAnimation = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (graveyardStackFlightAnimationRef.current !== null) return;
    graveyardStackFlightAnimationRef.current = window.requestAnimationFrame(updateGraveyardStackFlightAnimation);
  }, [updateGraveyardStackFlightAnimation]);

  const triggerGraveyardStackFlight = useCallback((targetCellIndex: number, cards: GameCardData[]) => {
    if (typeof window === 'undefined') return;
    const surfaceEl = gameSurfaceRef.current;
    const graveyardEl = graveyardCellRef.current;
    const targetCell = activeCellRefs.current[targetCellIndex];

    if (!surfaceEl || !graveyardEl || !targetCell) {
      return;
    }

    const surfaceRect = surfaceEl.getBoundingClientRect();
    const graveyardRect = graveyardEl.getBoundingClientRect();
    const cellRect = targetCell.getBoundingClientRect();
    const baseTime = performance.now();

    const graveyardCenter: Point = {
      x: graveyardRect.left + graveyardRect.width / 2 - surfaceRect.left,
      y: graveyardRect.top + graveyardRect.height / 2 - surfaceRect.top,
    };
    const cellCenter: Point = {
      x: cellRect.left + cellRect.width / 2 - surfaceRect.left,
      y: cellRect.top + cellRect.height / 2 - surfaceRect.top,
    };

    const flights: GraveyardStackFlight[] = cards.map((card, i) => ({
      id: `graveyard-stack-${card.id}-${baseTime}`,
      card,
      start: {
        x: graveyardCenter.x + (Math.random() - 0.5) * 16,
        y: graveyardCenter.y + (Math.random() - 0.5) * 10,
      },
      end: {
        x: cellCenter.x + (Math.random() - 0.5) * 8,
        y: cellCenter.y + (Math.random() - 0.5) * 6,
      },
      startTime: baseTime + i * 120,
      duration: animSpeed(GRAVEYARD_STACK_FLIGHT_DURATION),
      progress: 0,
      arcHeight: GRAVEYARD_STACK_ARC_HEIGHT + Math.random() * 20,
    }));

    graveyardStackFlightsRef.current = [...graveyardStackFlightsRef.current, ...flights];
    setGraveyardStackFlights(graveyardStackFlightsRef.current);
    startGraveyardStackFlightAnimation();
  }, [animSpeed, startGraveyardStackFlightAnimation]);




  const updateBackpackHandFlightAnimation = useCallback((timestamp: number) => {
    const flights = backpackHandFlightsRef.current;
    if (!flights.length) {
      backpackHandFlightAnimationRef.current = null;
      return;
    }

    let hasActive = false;
    const completedCards: GameCardData[] = [];
    const nearCompleteCards: GameCardData[] = [];
    let hasCompleted = false;
    const cardW = gridCardSizeRef.current?.width ?? 140;
    const cardH = gridCardSizeRef.current?.height ?? 210;

    for (let i = 0; i < flights.length; i++) {
      const flight = flights[i];
      const elapsed = timestamp - flight.startTime;
      let progress: number;
      if (elapsed < 0) {
        hasActive = true;
        progress = 0;
      } else {
        progress = clamp(elapsed / flight.duration);
      }
      flight.progress = progress;
      if (progress < 1) {
        hasActive = true;
        if (!flight.delivered && progress >= 0.85) {
          nearCompleteCards.push(flight.card);
          flight.delivered = true;
        }
      } else {
        if (!flight.delivered) {
          completedCards.push(flight.card);
          flight.delivered = true;
        }
        hasCompleted = true;
      }

      const el = backpackFlightElementMapRef.current.get(flight.id);
      if (el) {
        const eased = easeInOutCubic(clamp(progress));
        const x = flight.start.x + (flight.end.x - flight.start.x) * eased;
        const linearY = flight.start.y + (flight.end.y - flight.start.y) * eased;
        const arcOffset = Math.sin(Math.PI * eased) * flight.arcHeight;
        const y = linearY - arcOffset;
        const scale = 0.9 + eased * 0.15;
        const fadeIn = eased < 0.1 ? clamp(eased / 0.1) : 1;
        const fadeOut = eased > 0.85 ? clamp(1 - (eased - 0.85) / 0.15) : 1;
        el.style.transform = `translate(${x - cardW / 2}px, ${y - cardH / 2}px) scale(${scale})`;
        el.style.opacity = String(fadeIn * fadeOut);
      }
    }

    const cardsToDeliver = [...nearCompleteCards, ...completedCards];
    if (cardsToDeliver.length) {
      logBackpackDraw('flight-complete', {
        completedCount: completedCards.length,
        nearCompleteCount: nearCompleteCards.length,
        remainingFlights: flights.length,
      });
      cardsToDeliver.forEach(card => {
        clearBackpackHandFallback(card.id);
        ensureCardInHand(card);
      });
    }

    if (hasCompleted) {
      const remaining = flights.filter(f => f.progress < 1);
      backpackHandFlightsRef.current = remaining;
      setBackpackHandFlights(remaining);
    }

    if (hasActive && backpackHandFlightsRef.current.length > 0) {
      backpackHandFlightAnimationRef.current = window.requestAnimationFrame(updateBackpackHandFlightAnimation);
    } else {
      backpackHandFlightAnimationRef.current = null;
    }
  }, [clearBackpackHandFallback, ensureCardInHand]);

  const startBackpackHandFlightAnimation = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (backpackHandFlightAnimationRef.current !== null) return;
    backpackHandFlightAnimationRef.current = window.requestAnimationFrame(updateBackpackHandFlightAnimation);
  }, [updateBackpackHandFlightAnimation]);

  const triggerBackpackHandFlight = useCallback(
    (card: GameCardData, sourceHint?: FlightSourceHint): boolean => {
      if (typeof window === 'undefined') return false;

      if (backpackHandFlightsRef.current.some(f => f.card.id === card.id)) {
        logBackpackDraw('flight-skip', { reason: 'duplicate-card', cardId: card.id });
        return false;
      }

      const surfaceEl = gameSurfaceRef.current;
      let sourceCell: HTMLDivElement | null = null;
      if (sourceHint === 'equipmentSlot1') {
        sourceCell = heroRowCellRefs.current[HERO_ROW_EQUIPMENT_1_INDEX];
      } else if (sourceHint === 'equipmentSlot2') {
        sourceCell = heroRowCellRefs.current[HERO_ROW_EQUIPMENT_2_INDEX];
      } else if (sourceHint === 'amulet') {
        sourceCell = heroRowCellRefs.current[HERO_ROW_AMULET_INDEX];
      } else {
        sourceCell = heroRowCellRefs.current[HERO_ROW_BACKPACK_INDEX];
      }
      const handContainer = handAreaRef.current;

      if (!surfaceEl || !sourceCell || !handContainer) {
        logBackpackDraw('flight-skip', { reason: 'missing-dom' });
        return false;
      }

      const surfaceRect = surfaceEl.getBoundingClientRect();
      const sourceRect = sourceCell.getBoundingClientRect();
      const handRect = handContainer.getBoundingClientRect();
      const baseTime = performance.now();

      const start: Point = {
        x:
          sourceRect.left +
          sourceRect.width / 2 -
          surfaceRect.left +
          (Math.random() - 0.5) * 18,
        y:
          sourceRect.top +
          sourceRect.height / 2 -
          surfaceRect.top +
          (Math.random() - 0.5) * 12,
      };

      const horizontalSpread = Math.min(handRect.width * 0.5, 160);
      const verticalSpread = Math.min(handRect.height * 0.5, 80);

      const end: Point = {
        x:
          handRect.left +
          handRect.width / 2 -
          surfaceRect.left +
          (Math.random() - 0.5) * horizontalSpread,
        y:
          handRect.top +
          handRect.height / 2 -
          surfaceRect.top +
          (Math.random() - 0.5) * verticalSpread,
      };

      const flight: BackpackHandFlight = {
        id: `backpack-flight-${card.id}-${baseTime}`,
        card,
        start,
        end,
        startTime: baseTime,
        duration: animSpeed(BACKPACK_FLIGHT_BASE_DURATION + Math.random() * BACKPACK_FLIGHT_VARIANCE),
        progress: 0,
        arcHeight: BACKPACK_FLIGHT_ARC_MIN + Math.random() * BACKPACK_FLIGHT_ARC_VARIANCE,
      };

      backpackHandFlightsRef.current = [...backpackHandFlightsRef.current, flight];
      setBackpackHandFlights(backpackHandFlightsRef.current);
      startBackpackHandFlightAnimation();
      logBackpackDraw('flight-start', {
        cardId: card.id,
        flights: backpackHandFlightsRef.current.length,
      });

      return true;
    },
    [startBackpackHandFlightAnimation],
  );

  // ─── Discard flight animation (hand → graveyard / backpack) ───────────────
  const updateDiscardFlightAnimation = useCallback((timestamp: number) => {
    const flights = discardFlightsRef.current;
    if (!flights.length) {
      discardFlightAnimationRef.current = null;
      return;
    }
    let hasActive = false;
    let hasCompleted = false;
    const cardW = gridCardSizeRef.current?.width ?? 140;
    const cardH = gridCardSizeRef.current?.height ?? 210;

    for (const flight of flights) {
      const elapsed = timestamp - flight.startTime;
      const progress = elapsed < 0 ? 0 : clamp(elapsed / flight.duration);
      flight.progress = progress;
      if (progress < 1) {
        hasActive = true;
      } else {
        if (!flight.delivered) {
          flight.delivered = true;
          hasCompleted = true;
          const resolve = discardFlightResolveMapRef.current.get(flight.id);
          discardFlightResolveMapRef.current.delete(flight.id);
          resolve?.();
        }
      }
      const el = discardFlightElementMapRef.current.get(flight.id);
      if (el) {
        const eased = easeInOutCubic(clamp(progress));
        const x = flight.start.x + (flight.end.x - flight.start.x) * eased;
        const linearY = flight.start.y + (flight.end.y - flight.start.y) * eased;
        const arcOffset = Math.sin(Math.PI * eased) * flight.arcHeight;
        const y = linearY - arcOffset;
        const scale = 1.0 - eased * 0.25;
        const fadeIn = eased < 0.1 ? clamp(eased / 0.1) : 1;
        const fadeOut = eased > 0.85 ? clamp(1 - (eased - 0.85) / 0.15) : 1;
        el.style.transform = `translate(${x - cardW / 2}px, ${y - cardH / 2}px) scale(${scale})`;
        el.style.opacity = String(fadeIn * fadeOut);
      }
    }
    if (hasCompleted) {
      const remaining = flights.filter(f => f.progress < 1);
      discardFlightsRef.current = remaining;
      setDiscardFlights(remaining);
    }
    if (hasActive && discardFlightsRef.current.length > 0) {
      discardFlightAnimationRef.current = window.requestAnimationFrame(updateDiscardFlightAnimation);
    } else {
      discardFlightAnimationRef.current = null;
    }
  }, []);

  const startDiscardFlightAnimation = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (discardFlightAnimationRef.current !== null) return;
    discardFlightAnimationRef.current = window.requestAnimationFrame(updateDiscardFlightAnimation);
  }, [updateDiscardFlightAnimation]);

  const triggerDiscardFlight = useCallback(
    (card: GameCardData, destination: 'graveyard' | 'recycle-bag'): Promise<void> => {
      if (typeof window === 'undefined') return Promise.resolve();
      const surfaceEl = gameSurfaceRef.current;
      const targetEl = destination === 'graveyard'
        ? graveyardCellRef.current
        : heroRowCellRefs.current[HERO_ROW_BACKPACK_INDEX];
      if (!surfaceEl || !targetEl) return Promise.resolve();

      const surfaceRect = surfaceEl.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();

      const cardEl = surfaceEl.querySelector(
        `[data-testid="card-${card.type}-${card.id}"]`,
      ) as HTMLElement | null;
      const sourceRect = cardEl?.getBoundingClientRect() ?? handAreaRef.current?.getBoundingClientRect();
      if (!sourceRect) return Promise.resolve();

      const start: Point = {
        x: sourceRect.left + sourceRect.width / 2 - surfaceRect.left,
        y: sourceRect.top + sourceRect.height / 2 - surfaceRect.top,
      };
      const end: Point = {
        x: targetRect.left + targetRect.width / 2 - surfaceRect.left + (Math.random() - 0.5) * 12,
        y: targetRect.top + targetRect.height / 2 - surfaceRect.top + (Math.random() - 0.5) * 8,
      };

      const baseTime = performance.now();
      const flight: DiscardFlight = {
        id: `discard-flight-${card.id}-${baseTime}`,
        card,
        start,
        end,
        startTime: baseTime,
        duration: animSpeed(DISCARD_FLIGHT_BASE_DURATION + Math.random() * DISCARD_FLIGHT_VARIANCE),
        progress: 0,
        arcHeight: DISCARD_FLIGHT_ARC_MIN + Math.random() * DISCARD_FLIGHT_ARC_VARIANCE,
      };

      return new Promise<void>(resolve => {
        discardFlightResolveMapRef.current.set(flight.id, resolve);
        discardFlightsRef.current = [...discardFlightsRef.current, flight];
        setDiscardFlights(discardFlightsRef.current);
        startDiscardFlightAnimation();
      });
    },
    [startDiscardFlightAnimation],
  );
  // ─── end discard flight ─────────────────────────────────────────────────────

  // ─── Steal card flight animation (hand → Goblin dungeon slot) ──────────────
  const updateStealCardFlightAnimation = useCallback((timestamp: number) => {
    const flights = stealCardFlightsRef.current;
    if (!flights.length) {
      stealCardFlightAnimationRef.current = null;
      return;
    }
    let hasActive = false;
    let hasCompleted = false;
    const cardW = gridCardSizeRef.current?.width ?? 140;
    const cardH = gridCardSizeRef.current?.height ?? 210;

    for (const flight of flights) {
      const elapsed = timestamp - flight.startTime;
      const progress = elapsed < 0 ? 0 : clamp(elapsed / flight.duration);
      flight.progress = progress;
      if (progress < 1) {
        hasActive = true;
      } else {
        if (!flight.delivered) {
          flight.delivered = true;
          hasCompleted = true;
          const resolve = stealCardFlightResolveMapRef.current.get(flight.id);
          stealCardFlightResolveMapRef.current.delete(flight.id);
          resolve?.();
        }
      }
      const el = stealCardFlightElementMapRef.current.get(flight.id);
      if (el) {
        const eased = easeInOutCubic(clamp(progress));
        const x = flight.start.x + (flight.end.x - flight.start.x) * eased;
        const linearY = flight.start.y + (flight.end.y - flight.start.y) * eased;
        const arcOffset = Math.sin(Math.PI * eased) * flight.arcHeight;
        const y = linearY - arcOffset;
        const scale = 1.0 - eased * 0.3;
        const fadeIn = eased < 0.1 ? clamp(eased / 0.1) : 1;
        const fadeOut = eased > 0.8 ? clamp(1 - (eased - 0.8) / 0.2) : 1;
        el.style.transform = `translate(${x - cardW / 2}px, ${y - cardH / 2}px) scale(${scale}) rotate(${eased * -15}deg)`;
        el.style.opacity = String(fadeIn * fadeOut);
      }
    }
    if (hasCompleted) {
      const remaining = flights.filter(f => f.progress < 1);
      stealCardFlightsRef.current = remaining;
      setStealCardFlights(remaining);
    }
    if (hasActive && stealCardFlightsRef.current.length > 0) {
      stealCardFlightAnimationRef.current = window.requestAnimationFrame(updateStealCardFlightAnimation);
    } else {
      stealCardFlightAnimationRef.current = null;
    }
  }, []);

  const startStealCardFlightAnimation = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (stealCardFlightAnimationRef.current !== null) return;
    stealCardFlightAnimationRef.current = window.requestAnimationFrame(updateStealCardFlightAnimation);
  }, [updateStealCardFlightAnimation]);

  const triggerStealCardFlight = useCallback(
    (card: GameCardData, targetMonsterId: string): Promise<void> => {
      if (typeof window === 'undefined') return Promise.resolve();
      const surfaceEl = gameSurfaceRef.current;
      if (!surfaceEl) return Promise.resolve();

      const surfaceRect = surfaceEl.getBoundingClientRect();

      const sourceEl = surfaceEl.querySelector(
        `[data-testid="card-${card.type}-${card.id}"]`,
      ) as HTMLElement | null;
      const sourceRect = sourceEl?.getBoundingClientRect() ?? handAreaRef.current?.getBoundingClientRect();
      if (!sourceRect) return Promise.resolve();

      const targetEl = surfaceEl.querySelector(
        `[data-testid="card-monster-${targetMonsterId}"]`,
      ) as HTMLElement | null;
      if (!targetEl) return Promise.resolve();
      const targetRect = targetEl.getBoundingClientRect();

      const start: Point = {
        x: sourceRect.left + sourceRect.width / 2 - surfaceRect.left,
        y: sourceRect.top + sourceRect.height / 2 - surfaceRect.top,
      };
      const end: Point = {
        x: targetRect.left + targetRect.width / 2 - surfaceRect.left + (Math.random() - 0.5) * 8,
        y: targetRect.top + targetRect.height / 2 - surfaceRect.top + (Math.random() - 0.5) * 6,
      };

      const baseTime = performance.now();
      const flight: DiscardFlight = {
        id: `steal-flight-${card.id}-${baseTime}`,
        card,
        start,
        end,
        startTime: baseTime,
        duration: animSpeed(STEAL_FLIGHT_BASE_DURATION + Math.random() * STEAL_FLIGHT_VARIANCE),
        progress: 0,
        arcHeight: STEAL_FLIGHT_ARC_MIN + Math.random() * STEAL_FLIGHT_ARC_VARIANCE,
      };

      return new Promise<void>(resolve => {
        stealCardFlightResolveMapRef.current.set(flight.id, resolve);
        stealCardFlightsRef.current = [...stealCardFlightsRef.current, flight];
        setStealCardFlights(stealCardFlightsRef.current);
        startStealCardFlightAnimation();
      });
    },
    [startStealCardFlightAnimation],
  );
  // ─── end steal card flight ─────────────────────────────────────────────────

  useEffect(() => {
    const snapshot = loadGameState();
    if (snapshot) {
      hydrateGameState(snapshot);
    } else {
      initGame();
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!DEV_MODE || typeof window === 'undefined') {
      return;
    }
    // Developer helper to manually tweak shop level while playtesting.
    (window as any).__adjustShopLevel = adjustShopLevel;
    return () => {
      if ((window as any).__adjustShopLevel === adjustShopLevel) {
        delete (window as any).__adjustShopLevel;
      }
    };
  }, [adjustShopLevel]);

  const persistedState = useMemo<PersistedGameState>(
    () => serializeGameState(gs),
    [gs],
  );

  useEffect(() => {
    if (!isHydrated || gameOver) {
      return;
    }
    const serialized = JSON.stringify(persistedState);
    if (lastPersistedStateRef.current === serialized) {
      return;
    }
    lastPersistedStateRef.current = serialized;
    saveGameState(persistedState);
  }, [persistedState, isHydrated, gameOver]);

  useEffect(() => {
    if (!isHydrated || !gameOver) {
      return;
    }
    clearGameState();
    lastPersistedStateRef.current = null;
  }, [gameOver, isHydrated]);

  useEffect(() => {
    if (!gameOver) {
      return;
    }
    clearAllBackpackHandFallbacks();
    backpackHandFlightsRef.current = [];
    backpackFlightElementMapRef.current.clear();
    setBackpackHandFlights([]);
    fateSwapFlightsRef.current = [];
    fateSwapFlightElementMapRef.current.clear();
    setFateSwapFlights([]);
    if (fateSwapFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(fateSwapFlightAnimationRef.current);
      fateSwapFlightAnimationRef.current = null;
    }
    graveyardStackFlightsRef.current = [];
    graveyardStackFlightElementMapRef.current.clear();
    setGraveyardStackFlights([]);
    if (graveyardStackFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(graveyardStackFlightAnimationRef.current);
      graveyardStackFlightAnimationRef.current = null;
    }
    if (discardShockFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(discardShockFlightAnimationRef.current);
      discardShockFlightAnimationRef.current = null;
    }
    discardShockFlightsRef.current = [];
    discardShockElementMapRef.current.clear();
    setDiscardShockFlights([]);
    discardShockProcQueueRef.current = [];
    discardShockSeqInFlightRef.current = false;
  }, [gameOver, clearAllBackpackHandFallbacks]);

  useEffect(() => {
    return () => {
      clearWaterfallTimeouts();
      clearAllBackpackHandFallbacks();
    };
  }, [clearWaterfallTimeouts, clearAllBackpackHandFallbacks]);

  useEffect(() => {
    return () => {
      if (classDeckFlightAnimationRef.current !== null) {
        window.cancelAnimationFrame(classDeckFlightAnimationRef.current);
      }
      if (fateSwapFlightAnimationRef.current !== null) {
        window.cancelAnimationFrame(fateSwapFlightAnimationRef.current);
      }
      if (graveyardStackFlightAnimationRef.current !== null) {
        window.cancelAnimationFrame(graveyardStackFlightAnimationRef.current);
      }
      if (backpackHandFlightAnimationRef.current !== null) {
        window.cancelAnimationFrame(backpackHandFlightAnimationRef.current);
      }
      if (discardShockFlightAnimationRef.current !== null) {
        window.cancelAnimationFrame(discardShockFlightAnimationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (combatState.currentTurn !== 'monster') return;
    if (combatState.pendingBlock) return;
    advanceMonsterTurn();
  }, [combatState.currentTurn, combatState.pendingBlock, combatState.monsterAttackQueue, advanceMonsterTurn, activeCards]);

  // Safety net: prune stale engaged IDs whose cards no longer exist on the board
  // and whose defeat timeout already fired (not in pendingDefeatIds).
  useEffect(() => {
    if (combatState.engagedMonsterIds.length === 0) return;
    const staleIds = combatState.engagedMonsterIds.filter(
      id =>
        !activeCards.some(c => c?.id === id) &&
        !pendingDefeatIdsRef.current.has(id),
    );
    if (staleIds.length === 0) return;
    setCombatState(prev => {
      const remaining = prev.engagedMonsterIds.filter(id => !staleIds.includes(id));
      if (remaining.length === prev.engagedMonsterIds.length) return prev;
      if (remaining.length === 0) return { ...initialCombatState };
      return { ...prev, engagedMonsterIds: remaining };
    });
  }, [combatState.engagedMonsterIds, activeCards]);

  const prevTurnRef = useRef(combatState.currentTurn);
  useEffect(() => {
    if (prevTurnRef.current === 'monster' && combatState.currentTurn === 'hero') {
      setBerserkerSlotUsed({});
      setFlashSlotUsed({});
      heroTurnLayerLossIdsRef.current.clear();

      if (!heroTookDamageThisMonsterTurnRef.current) {
        const dragonEquipSlots: Array<{ slotId: EquipmentSlotId; item: EquipmentItem }> = [];
        if (equipmentSlot1?.type === 'monster' && equipmentSlot1.eliteRegenHeroTurn) {
          dragonEquipSlots.push({ slotId: 'equipmentSlot1', item: equipmentSlot1 });
        }
        if (equipmentSlot2?.type === 'monster' && equipmentSlot2.eliteRegenHeroTurn) {
          dragonEquipSlots.push({ slotId: 'equipmentSlot2', item: equipmentSlot2 });
        }
        for (const { slotId: dSlotId, item: dItem } of dragonEquipSlots) {
          if (Math.random() < 0.5) {
            const otherSlotId: EquipmentSlotId = dSlotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
            const otherItem = otherSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
            if (otherItem && otherItem.durability != null && otherItem.maxDurability != null && otherItem.durability < otherItem.maxDurability) {
              const newDur = otherItem.durability + 1;
              setEquipmentSlotById(otherSlotId, { ...otherItem, durability: newDur } as EquipmentItem);
              addGameLog('equip', `${dItem.name} 龙息回复：Hero 未受伤，${otherItem.name} 恢复 1 耐久！（${newDur}/${otherItem.maxDurability}）`);
              setHeroSkillBanner(`${dItem.name} 龙息回复！${otherItem.name} +1 耐久！`);
            } else {
              addGameLog('equip', `${dItem.name} 龙息回复：判定成功，但另一装备栏无可恢复的装备。`);
            }
          } else {
            addGameLog('equip', `${dItem.name} 龙息回复：判定失败（50%）。`);
          }
        }
      }

      const engagedIds = combatState.engagedMonsterIds;

      // Wraith aura: check if any engaged wraith has wraithAuraAttack
      let auraBoost = 0;
      let hasWraithEnrage = false;
      let hasWraithDestroyAmulet = false;
      for (const card of activeCards) {
        if (!card || !engagedIds.includes(card.id) || card.isStunned) continue;
        if (card.wraithAuraAttack && card.wraithAuraAttack > 0) {
          auraBoost = Math.max(auraBoost, card.wraithAuraAttack);
        }
        if (card.wraithTurnEnrage) hasWraithEnrage = true;
        if (card.wraithDestroyAmulet) hasWraithDestroyAmulet = true;
      }

      setActiveCards(prev => {
        let changed = false;
        const next = prev.map(card => {
          if (!card || !engagedIds.includes(card.id)) return card;

          let updated = card;

          if (updated.isStunned) {
            changed = true;
            addGameLog('combat', `${updated.name} 从晕眩中恢复了。`);
            updated = { ...updated, isStunned: false };
            return updated;
          }

          // Legacy wraith tier-2: self-only attack boost
          if (updated.wraithTurnAttack && updated.wraithTurnAttack > 0) {
            const boost = updated.wraithTurnAttack;
            changed = true;
            const newAttack = (updated.attack ?? updated.value ?? 0) + boost;
            const newValue = (updated.value ?? 0) + boost;
            addGameLog('combat', `${updated.name} 怨念蓄积：攻击力 +${boost}！（当前 ${newAttack}）`);
            updated = { ...updated, attack: newAttack, value: newValue, tempAttackBoost: (updated.tempAttackBoost ?? 0) + boost };
          }

          if (!updated.bossLastStandAura) return updated !== card ? updated : card;
          if ((updated.currentLayer ?? 1) !== 1) return updated !== card ? updated : card;
          changed = true;
          const newAttack = (updated.attack ?? updated.value ?? 0) + 5;
          const newValue = (updated.value ?? 0) + 5;
          const newLayer = (updated.currentLayer ?? 1) + 1;
          const fullHp = updated.maxHp ?? updated.hp ?? 0;
          addGameLog('combat', `${updated.name} 暴走光环：攻击 +5，恢复至 ${newLayer} 血层！`);
          setHeroSkillBanner(`${updated.name} 暴走光环发动！`);
          return {
            ...updated,
            attack: newAttack,
            value: newValue,
            hp: fullHp,
            currentLayer: newLayer,
            tempAttackBoost: (updated.tempAttackBoost ?? 0) + 5,
          };
        });
        return changed ? (next as typeof prev) : prev;
      });

      // Wraith Lv1+: aura attack boost to ALL active row monsters
      if (auraBoost > 0) {
        setActiveCards(prev => {
          const boostedNames: string[] = [];
          const next = prev.map(card => {
            if (!card || card.type !== 'monster') return card;
            const newAttack = (card.attack ?? card.value ?? 0) + auraBoost;
            const newValue = (card.value ?? 0) + auraBoost;
            boostedNames.push(card.name);
            return { ...card, attack: newAttack, value: newValue, tempAttackBoost: (card.tempAttackBoost ?? 0) + auraBoost };
          }) as typeof prev;
          if (boostedNames.length > 0) {
            addGameLog('combat', `怨念光环：激活行所有怪物攻击力 +${auraBoost}！（${boostedNames.join('、')}）`);
            setHeroSkillBanner(`怨念光环！全体怪物攻击力 +${auraBoost}！`);
          }
          return next;
        });
      }

      // Wraith Lv3: enrage all active row monsters
      if (hasWraithEnrage) {
        const rowMonsters = activeCards.filter(
          (c): c is GameCardData => Boolean(c && c.type === 'monster' && !c.isStunned),
        );
        for (const m of rowMonsters) {
          if (!isMonsterEngaged(m.id)) {
            beginCombat(m, 'monster');
          }
        }
        if (rowMonsters.length > 0) {
          const names = rowMonsters.filter(m => !engagedIds.includes(m.id)).map(m => m.name);
          if (names.length > 0) {
            addGameLog('combat', `怨灵诅咒：激活行怪物被激怒！（${names.join('、')}）`);
            setHeroSkillBanner(`怨灵诅咒！全体怪物激怒！`);
          }
        }
      }

      // Wraith Lv3: destroy a random amulet
      if (hasWraithDestroyAmulet) {
        const currentAmulets = engine.getState().amuletSlots;
        if (currentAmulets.length > 0) {
          const targetIdx = Math.floor(Math.random() * currentAmulets.length);
          const targetAmulet = currentAmulets[targetIdx];
          const reversal = computeAmuletAuraReversal([targetAmulet]);
          if (reversal.tempAttackDelta.equipmentSlot1 !== 0 || reversal.tempAttackDelta.equipmentSlot2 !== 0) {
            setSlotTempAttack(prev => ({
              equipmentSlot1: (prev.equipmentSlot1 ?? 0) + reversal.tempAttackDelta.equipmentSlot1,
              equipmentSlot2: (prev.equipmentSlot2 ?? 0) + reversal.tempAttackDelta.equipmentSlot2,
            }));
          }
          if (reversal.tempArmorDelta.equipmentSlot1 !== 0 || reversal.tempArmorDelta.equipmentSlot2 !== 0) {
            setSlotTempArmor(prev => ({
              equipmentSlot1: (prev.equipmentSlot1 ?? 0) + reversal.tempArmorDelta.equipmentSlot1,
              equipmentSlot2: (prev.equipmentSlot2 ?? 0) + reversal.tempArmorDelta.equipmentSlot2,
            }));
          }
          addToGraveyard(targetAmulet);
          setAmuletSlots(prev => prev.filter(a => a.id !== targetAmulet.id));
          addGameLog('combat', `怨灵诅咒：摧毁了护符「${targetAmulet.name}」！`);
          setHeroSkillBanner(`怨灵诅咒！护符「${targetAmulet.name}」被摧毁！`);
        }
      }

      // Goblin Lv2: stack heal — per stacked card below, 15% chance restore 1 layer
      for (const card of activeCards) {
        if (!card || !engagedIds.includes(card.id) || card.isStunned || !card.goblinStackHeal) continue;
        const goblinColIndex = activeCards.findIndex(c => c?.id === card.id);
        if (goblinColIndex < 0) continue;
        const stacks = engine.getState().activeCardStacks[goblinColIndex] ?? [];
        if (stacks.length === 0) continue;
        let healCount = 0;
        for (let i = 0; i < stacks.length; i++) {
          if (Math.random() < 0.15) healCount++;
        }
        if (healCount > 0) {
          setActiveCards(prev => {
            const next = [...prev];
            const m = next[goblinColIndex];
            if (!m) return prev;
            const maxLayers = m.hpLayers ?? m.fury ?? 1;
            const currentLayer = m.currentLayer ?? 1;
            const restored = Math.min(healCount, maxLayers - currentLayer);
            if (restored <= 0) return prev;
            const fullHp = m.maxHp ?? m.hp ?? 0;
            next[goblinColIndex] = { ...m, currentLayer: currentLayer + restored, hp: fullHp };
            addGameLog('combat', `${m.name} 贼窝疗养：恢复了 ${restored} 血层！（${currentLayer} → ${currentLayer + restored}）`);
            setHeroSkillBanner(`${m.name} 贼窝疗养！恢复 ${restored} 血层！`);
            return next as typeof prev;
          });
        }
      }

      // Goblin Elite: steal equip — per stacked card below, 15% chance steal equipment or amulet
      for (const card of activeCards) {
        if (!card || !engagedIds.includes(card.id) || card.isStunned || !card.goblinStealEquip) continue;
        const goblinColIndex = activeCards.findIndex(c => c?.id === card.id);
        if (goblinColIndex < 0) continue;
        const stacks = engine.getState().activeCardStacks[goblinColIndex] ?? [];
        if (stacks.length === 0) continue;
        let stealCount = 0;
        for (let i = 0; i < stacks.length; i++) {
          if (Math.random() < 0.15) stealCount++;
        }
        for (let s = 0; s < stealCount; s++) {
          const state = engine.getState();
          const candidates: Array<{ source: 'equip'; slotId: EquipmentSlotId; item: GameCardData } | { source: 'amulet'; item: GameCardData }> = [];
          if (state.equipmentSlot1) candidates.push({ source: 'equip', slotId: 'equipmentSlot1', item: state.equipmentSlot1 as GameCardData });
          if (state.equipmentSlot2) candidates.push({ source: 'equip', slotId: 'equipmentSlot2', item: state.equipmentSlot2 as GameCardData });
          for (const amulet of state.amuletSlots) {
            candidates.push({ source: 'amulet', item: amulet as GameCardData });
          }
          if (candidates.length === 0) break;
          const pick = candidates[Math.floor(Math.random() * candidates.length)];
          const stolenCard = { ...pick.item, stolenByGoblin: true };
          if (pick.source === 'equip') {
            clearEquipmentSlotById(pick.slotId);
            addGameLog('combat', `${card.name} 窃宝：偷走了装备「${pick.item.name}」！`);
          } else {
            const reversal = computeAmuletAuraReversal([pick.item]);
            if (reversal.tempAttackDelta.equipmentSlot1 !== 0 || reversal.tempAttackDelta.equipmentSlot2 !== 0) {
              setSlotTempAttack(prev => ({
                equipmentSlot1: (prev.equipmentSlot1 ?? 0) + reversal.tempAttackDelta.equipmentSlot1,
                equipmentSlot2: (prev.equipmentSlot2 ?? 0) + reversal.tempAttackDelta.equipmentSlot2,
              }));
            }
            if (reversal.tempArmorDelta.equipmentSlot1 !== 0 || reversal.tempArmorDelta.equipmentSlot2 !== 0) {
              setSlotTempArmor(prev => ({
                equipmentSlot1: (prev.equipmentSlot1 ?? 0) + reversal.tempArmorDelta.equipmentSlot1,
                equipmentSlot2: (prev.equipmentSlot2 ?? 0) + reversal.tempArmorDelta.equipmentSlot2,
              }));
            }
            setAmuletSlots(prev => prev.filter(a => a.id !== pick.item.id));
            addGameLog('combat', `${card.name} 窃宝：偷走了护符「${pick.item.name}」！`);
          }
          setActiveCardStacks(prev => ({
            ...prev,
            [goblinColIndex]: [...(prev[goblinColIndex] ?? []), stolenCard],
          }));
          setHeroSkillBanner(`${card.name} 窃宝！偷走了「${pick.item.name}」！`);
        }
      }
    }
    prevTurnRef.current = combatState.currentTurn;
  }, [combatState.currentTurn]);

  useEffect(() => {
    const isLowGold = gold <= 10;
    setActiveCards(prev => {
      let changed = false;
      const next = prev.map(card => {
        if (!card || card.type !== 'monster' || !card.eliteLowGoldPower) return card;
        if (isLowGold && !card.lowGoldBuffActive) {
          changed = true;
          addGameLog('combat', `${card.name} 感受到了贪婪的力量！攻击力与血量翻倍！`);
          setHeroSkillBanner(`${card.name} 贪婪强化！攻击力与血量翻倍！`);
          const atkBefore = card.attack ?? card.value;
          const hpBefore = card.hp ?? 0;
          const maxHpBefore = card.maxHp ?? 0;
          return {
            ...card,
            attack: atkBefore * 2,
            value: card.value * 2,
            hp: hpBefore * 2,
            maxHp: maxHpBefore * 2,
            lowGoldBuffActive: true,
            tempAttackBoost: (card.tempAttackBoost ?? 0) + atkBefore,
            tempHpBoost: (card.tempHpBoost ?? 0) + maxHpBefore,
          };
        }
        if (!isLowGold && card.lowGoldBuffActive) {
          changed = true;
          addGameLog('combat', `${card.name} 的贪婪强化消退了。`);
          const newAtk = Math.floor((card.attack ?? card.value) / 2);
          const newMaxHp = Math.floor((card.maxHp ?? 0) / 2);
          const prevTempAtk = Math.floor((card.tempAttackBoost ?? 0) / 2);
          const prevTempHp = Math.floor((card.tempHpBoost ?? 0) / 2);
          return {
            ...card,
            attack: newAtk,
            value: Math.floor(card.value / 2),
            hp: Math.ceil((card.hp ?? 0) / 2),
            maxHp: newMaxHp,
            lowGoldBuffActive: false,
            tempAttackBoost: prevTempAtk,
            tempHpBoost: prevTempHp,
          };
        }
        return card;
      });
      return changed ? next : prev;
    });
  }, [gold, addGameLog]);

  const initGame = () => {
    combatAsyncEpochRef.current += 1;
    setCombatState(initialCombatState);
    setHeroVariant(getRandomHero());
    clearAllHandDeliveryGuards();
    processedDungeonCardIdsRef.current.clear();
    previousActiveCardsRef.current = createEmptyActiveRow();
    freshGameStartRef.current = true;
    const newDeck = createDeck();
    for (let i = 0; i < newDeck.length; i++) {
      if (newDeck[i].type === 'event') {
        newDeck[i] = pruneEventChoicesToThree(newDeck[i]);
      }
    }
    // Add Knight discovery events to main deck
    const knightEvents = createKnightDiscoveryEvents();
    for (let i = 0; i < knightEvents.length; i++) {
      if (knightEvents[i].type === 'event') {
        knightEvents[i] = pruneEventChoicesToThree(knightEvents[i]);
      }
    }
    const deckWithClassEvents = [...newDeck, ...knightEvents].sort(() => Math.random() - 0.5);

    // Balance monster distribution: 1 elite in first half (positions 13–30), rest in second half
    {
      const halfSize = Math.floor(deckWithClassEvents.length / 2);
      const eliteMonsters = deckWithClassEvents.filter(c => c.monsterSpecial);
      const nonEliteMonsters = deckWithClassEvents.filter(c => c.type === 'monster' && !c.monsterSpecial);
      const nonMonsters = deckWithClassEvents.filter(c => c.type !== 'monster');

      // Pull 1 random elite into the first half
      let earlyElite: typeof eliteMonsters[0] | null = null;
      const remainingElites = [...eliteMonsters];
      if (remainingElites.length > 0) {
        const idx = Math.floor(Math.random() * remainingElites.length);
        earlyElite = remainingElites.splice(idx, 1)[0];
      }

      const totalMonsters = eliteMonsters.length + nonEliteMonsters.length;
      const firstHalfMonsterCount = Math.min(Math.floor(totalMonsters / 2), nonEliteMonsters.length);

      const firstHalf = [
        ...nonEliteMonsters.slice(0, firstHalfMonsterCount),
        ...nonMonsters.slice(0, halfSize - firstHalfMonsterCount - (earlyElite ? 1 : 0)),
        ...(earlyElite ? [earlyElite] : []),
      ];
      const secondHalf = [
        ...nonEliteMonsters.slice(firstHalfMonsterCount),
        ...remainingElites,
        ...nonMonsters.slice(halfSize - firstHalfMonsterCount - (earlyElite ? 1 : 0)),
      ];

      firstHalf.sort(() => Math.random() - 0.5);
      secondHalf.sort(() => Math.random() - 0.5);

      // Ensure the early elite lands in positions 12–29 (not in the first 12 cards)
      if (earlyElite && firstHalf.length > 12) {
        const eliteIdx = firstHalf.indexOf(earlyElite);
        if (eliteIdx >= 0 && eliteIdx < 12) {
          const swapTarget = 12 + Math.floor(Math.random() * (firstHalf.length - 12));
          const tmp = firstHalf[eliteIdx];
          firstHalf[eliteIdx] = firstHalf[swapTarget];
          firstHalf[swapTarget] = tmp;
        }
      }

      deckWithClassEvents.splice(0, deckWithClassEvents.length, ...firstHalf, ...secondHalf);
    }

    // Balance monster density: 1–2 monsters per non-overlapping chunk of 6 cards
    {
      const MIN_MONSTERS = 1;
      const MAX_MONSTERS = 2;
      const CHUNK = 6;
      for (let start = 0; start + CHUNK <= deckWithClassEvents.length; start += CHUNK) {
        const chunkEnd = start + CHUNK;
        const monsterIndices: number[] = [];
        const nonMonsterIndices: number[] = [];
        for (let j = start; j < chunkEnd; j++) {
          if (deckWithClassEvents[j].type === 'monster') monsterIndices.push(j);
          else nonMonsterIndices.push(j);
        }
        while (monsterIndices.length > MAX_MONSTERS) {
          const excessIdx = monsterIndices.pop()!;
          let swapTarget = -1;
          for (let k = chunkEnd; k < deckWithClassEvents.length; k++) {
            if (deckWithClassEvents[k].type !== 'monster') { swapTarget = k; break; }
          }
          if (swapTarget === -1) {
            for (let k = start - 1; k >= 0; k--) {
              if (deckWithClassEvents[k].type !== 'monster') { swapTarget = k; break; }
            }
          }
          if (swapTarget >= 0) {
            const tmp = deckWithClassEvents[excessIdx];
            deckWithClassEvents[excessIdx] = deckWithClassEvents[swapTarget];
            deckWithClassEvents[swapTarget] = tmp;
          } else {
            break;
          }
        }
        while (monsterIndices.length < MIN_MONSTERS) {
          const fillIdx = nonMonsterIndices.pop()!;
          if (fillIdx === undefined) break;
          let swapTarget = -1;
          for (let k = chunkEnd; k < deckWithClassEvents.length; k++) {
            if (deckWithClassEvents[k].type === 'monster') { swapTarget = k; break; }
          }
          if (swapTarget === -1) {
            for (let k = start - 1; k >= 0; k--) {
              if (deckWithClassEvents[k].type === 'monster') { swapTarget = k; break; }
            }
          }
          if (swapTarget >= 0) {
            const tmp = deckWithClassEvents[fillIdx];
            deckWithClassEvents[fillIdx] = deckWithClassEvents[swapTarget];
            deckWithClassEvents[swapTarget] = tmp;
            monsterIndices.push(fillIdx);
          } else {
            break;
          }
        }
      }
    }

    // Guarantee at least one monster among the last 3 cards of the deck
    {
      const len = deckWithClassEvents.length;
      if (len >= 3) {
        const tail = deckWithClassEvents.slice(len - 3);
        const hasMonsterInTail = tail.some(c => c.type === 'monster');
        if (!hasMonsterInTail) {
          // Find the latest monster earlier in the deck (search from end, skip last 3)
          let swapIdx = -1;
          for (let i = len - 4; i >= 0; i--) {
            if (deckWithClassEvents[i].type === 'monster') {
              swapIdx = i;
              break;
            }
          }
          if (swapIdx >= 0) {
            const targetIdx = len - 1 - Math.floor(Math.random() * 3);
            const tmp = deckWithClassEvents[swapIdx];
            deckWithClassEvents[swapIdx] = deckWithClassEvents[targetIdx];
            deckWithClassEvents[targetIdx] = tmp;
          }
        }
      }
    }

    let lastMonsterDeckIndex = -1;
    for (let mi = deckWithClassEvents.length - 1; mi >= 0; mi -= 1) {
      if (deckWithClassEvents[mi].type === 'monster') {
        lastMonsterDeckIndex = mi;
        break;
      }
    }

    // Build a mutable deal queue; extract non-monster cards for stacking
    const dealQueue = [...deckWithClassEvents];

    // Helper: extract the first non-monster from dealQueue starting at `from`, returns it and removes from queue
    const extractFirstNonMonster = (from: number): GameCardData | null => {
      for (let i = from; i < dealQueue.length; i++) {
        if (dealQueue[i].type !== 'monster') {
          return dealQueue.splice(i, 1)[0];
        }
      }
      return null;
    };

    // Ensure a raw row has at least 1 monster; if not, swap one in from the queue
    const ensureRowHasMonster = (row: GameCardData[], queue: GameCardData[]) => {
      if (row.some(c => c.type === 'monster')) return;
      const qMonsterIdx = queue.findIndex(c => c.type === 'monster');
      if (qMonsterIdx < 0) return;
      const rowSwapIdx = Math.floor(Math.random() * row.length);
      const tmp = row[rowSwapIdx];
      row[rowSwapIdx] = queue[qMonsterIdx];
      queue[qMonsterIdx] = tmp;
    };

    // Preview row: 5 cards from deal queue
    const previewRaw = dealQueue.splice(0, 5);
    ensureRowHasMonster(previewRaw, dealQueue);
    const initialPreview = fillActiveRowSlots(previewRaw).map((card, slotIdx) => {
      if (!card) return null;
      const raged = applyMonsterRage(card, INITIAL_TURN_COUNT + 1);
      if (deckWithClassEvents.indexOf(card) === lastMonsterDeckIndex && raged.type === 'monster') {
        return { ...raged, isFinalMonster: true, description: FINAL_MONSTER_MARK_DESCRIPTION };
      }
      return raged;
    }) as ActiveRowSlots;

    // Preview stack: first non-monster from remainder → stack on a random non-monster preview cell
    const initialPreviewStacks: Record<number, GameCardData[]> = {};
    const previewStackCard = extractFirstNonMonster(0);
    if (previewStackCard) {
      const nonMonsterPreviewIndices = initialPreview
        .map((c, i) => (c && c.type !== 'monster' ? i : -1))
        .filter(i => i >= 0);
      if (nonMonsterPreviewIndices.length > 0) {
        const targetIdx = nonMonsterPreviewIndices[Math.floor(Math.random() * nonMonsterPreviewIndices.length)];
        initialPreviewStacks[targetIdx] = [applyMonsterRage(previewStackCard, INITIAL_TURN_COUNT + 1)];
      }
    }

    // Active row: next 5 cards from deal queue
    const activeRaw = dealQueue.splice(0, 5);
    ensureRowHasMonster(activeRaw, dealQueue);
    const initialActive = fillActiveRowSlots(activeRaw).map((card, slotIdx) => {
      if (!card) return null;
      const raged = applyMonsterRage(card, INITIAL_TURN_COUNT);
      if (deckWithClassEvents.indexOf(card) === lastMonsterDeckIndex && raged.type === 'monster') {
        return { ...raged, isFinalMonster: true, description: FINAL_MONSTER_MARK_DESCRIPTION };
      }
      return raged;
    }) as ActiveRowSlots;

    // Active stack: first non-monster from remainder → stack on a random non-monster active cell
    const initialActiveStacks: Record<number, GameCardData[]> = {};
    const activeStackCard = extractFirstNonMonster(0);
    if (activeStackCard) {
      const nonMonsterActiveIndices = initialActive
        .map((c, i) => (c && c.type !== 'monster' ? i : -1))
        .filter(i => i >= 0);
      if (nonMonsterActiveIndices.length > 0) {
        const targetIdx = nonMonsterActiveIndices[Math.floor(Math.random() * nonMonsterActiveIndices.length)];
        initialActiveStacks[targetIdx] = [applyMonsterRage(activeStackCard, INITIAL_TURN_COUNT)];
      }
    }

    // Remaining deck — mark final monster by matching the original deck index
    const initialRemaining = dealQueue.map((card) => {
      const origIdx = deckWithClassEvents.indexOf(card);
      if (origIdx === lastMonsterDeckIndex && card.type === 'monster') {
        return { ...card, isFinalMonster: true, description: FINAL_MONSTER_MARK_DESCRIPTION };
      }
      return card;
    });

    // Build full initial state and replace in one call
    const newHero = getRandomHero();
    const newHeroClass = (newHero.classTitle ?? '').toLowerCase();
    const newClassDeck = newHeroClass === 'knight' ? generateKnightDeck() : [];
    classCardPreviewIdRef.current = newClassDeck.length > 0
      ? newClassDeck[Math.floor(Math.random() * newClassDeck.length)].id
      : null;
    engine.replaceState({
      ...createInitialGameState(),
      heroVariant: newHero,
      heroClass: newHeroClass,
      previewCards: initialPreview,
      activeCards: initialActive,
      previewCardStacks: initialPreviewStacks,
      activeCardStacks: initialActiveStacks,
      remainingDeck: initialRemaining,
      classDeck: newClassDeck,
      eternalRelics: getStartingRelics(),
      showSkillSelection: true,
      totalWins: getTotalWins(),
    });

    // Reset UI-only state + refs
    setBackpackHandFlights([]);
    backpackHandFlightsRef.current = [];
    backpackFlightElementMapRef.current.clear();
    if (typeof window !== 'undefined' && backpackHandFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(backpackHandFlightAnimationRef.current);
      backpackHandFlightAnimationRef.current = null;
    }
    setFateSwapFlights([]);
    fateSwapFlightsRef.current = [];
    fateSwapFlightElementMapRef.current.clear();
    if (typeof window !== 'undefined' && fateSwapFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(fateSwapFlightAnimationRef.current);
      fateSwapFlightAnimationRef.current = null;
    }
    setGraveyardStackFlights([]);
    graveyardStackFlightsRef.current = [];
    graveyardStackFlightElementMapRef.current.clear();
    if (typeof window !== 'undefined' && graveyardStackFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(graveyardStackFlightAnimationRef.current);
      graveyardStackFlightAnimationRef.current = null;
    }
    setDiscardShockFlights([]);
    discardShockFlightsRef.current = [];
    discardShockElementMapRef.current.clear();
    discardShockProcQueueRef.current = [];
    discardShockSeqInFlightRef.current = false;
    if (typeof window !== 'undefined' && discardShockFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(discardShockFlightAnimationRef.current);
      discardShockFlightAnimationRef.current = null;
    }
    clearAllBackpackHandFallbacks();
    setBackpackViewerOpen(false);
    ghostBladeExileResolverRef.current = null;
    monsterRewardQueuedInstanceIdsRef.current.clear();
    lastWaterfallSequenceRef.current = null;
    cardDraftPendingSkillRef.current = null;
    persuadeDiscountRef.current = null;
    persuadeAmuletBonusRef.current = 0;
    setPersuadeTempDiscount(0);
    // classCardPreviewIdRef is already set above
  };

  const hydrateGameState = (snapshot: PersistedGameState) => {
    combatAsyncEpochRef.current += 1;
    const mapSlots = (slots?: Array<GameCardData | null>): ActiveRowSlots => {
      const next = createEmptyActiveRow();
      if (!Array.isArray(slots)) {
        return next;
      }
      for (let i = 0; i < Math.min(slots.length, DUNGEON_COLUMN_COUNT); i += 1) {
        const c = slots[i] ?? null;
        next[i] = c ? patchPersistedMainDeckWeaponImage(c) : null;
      }
      return next;
    };

    const mapEquipment = (card: GameCardData | null, slotId: EquipmentSlotId): EquipmentItem | null => {
      if (!card) return null;
      const patched = patchPersistedMainDeckWeaponImage(card);
      if (patched.type !== 'weapon' && patched.type !== 'shield' && patched.type !== 'monster') {
        return null;
      }
      return { ...patched, fromSlot: slotId } as EquipmentItem;
    };

    const mapAmulets = (amulets?: GameCardData[]): AmuletItem[] => {
      if (!Array.isArray(amulets)) return [];
      return amulets
        .filter((card): card is AmuletItem => Boolean(card && card.type === 'amulet'))
        .map(card => ({ ...card, fromSlot: 'amulet' as const }));
    };

    const mapEquipmentBonuses = (
      bonuses?: PersistedGameState['equipmentSlotBonuses'],
    ): EquipmentSlotBonusState => {
      if (!bonuses) {
        return createEmptySlotBonusState();
      }
      return {
        equipmentSlot1: {
          damage: bonuses.equipmentSlot1?.damage ?? 0,
          shield: bonuses.equipmentSlot1?.shield ?? 0,
        },
        equipmentSlot2: {
          damage: bonuses.equipmentSlot2?.damage ?? 0,
          shield: bonuses.equipmentSlot2?.shield ?? 0,
        },
      };
    };

    clearAllHandDeliveryGuards();
    processedDungeonCardIdsRef.current.clear();
    previousActiveCardsRef.current = createEmptyActiveRow();
    lastWaterfallSequenceRef.current = null;
    suppressTurnAmuletReapplyRef.current = true;

    const savedForgeCount = snapshot.recycleForgePlayCount ?? 0;
    const savedDamageStreak = snapshot.classDamageDiscoverStreak ?? 0;
    const restoredAmulets = mapAmulets(snapshot.amuletSlots).map(slot => {
      if (slot?.amuletEffect === 'recycle-forge') {
        return {
          ...slot,
          description: `每使用或弃回 5 张牌，将回收袋里的卡牌放回背包，然后抽 2 张牌。(可超手牌上限) [${savedForgeCount % 5}/5]`,
        };
      }
      if (slot?.amuletEffect === 'damage-class-discover') {
        const threshold = (slot.upgradeLevel ?? 0) >= 1 ? 3 : 5;
        return { ...slot, _counterDisplay: `${savedDamageStreak}/${threshold}` };
      }
      return slot;
    });

    const restoredCombat: CombatState =
      snapshot.combatState && snapshot.combatState.engagedMonsterIds.length > 0
        ? {
            engagedMonsterIds: snapshot.combatState.engagedMonsterIds,
            initiator: snapshot.combatState.initiator ?? null,
            currentTurn: snapshot.combatState.currentTurn ?? 'hero',
            heroAttacksThisTurn: snapshot.combatState.heroAttacksThisTurn ?? { equipmentSlot1: false, equipmentSlot2: false },
            heroAttacksRemaining: snapshot.combatState.heroAttacksRemaining ?? 2,
            heroDamageThisTurn: snapshot.combatState.heroDamageThisTurn ?? {},
            monsterAttackQueue: snapshot.combatState.monsterAttackQueue ?? [],
            pendingBlock: snapshot.combatState.pendingBlock ?? null,
            slotBlocksThisTurn: (snapshot.combatState.slotBlocksThisTurn ?? { equipmentSlot1: false, equipmentSlot2: false }) as Record<EquipmentSlotId, boolean>,
            slotDurabilityUsedThisTurn: (snapshot.combatState.slotDurabilityUsedThisTurn ?? { equipmentSlot1: 0, equipmentSlot2: 0 }) as Record<EquipmentSlotId, number>,
          }
        : { ...initialCombatState };

    const lsSlot = snapshot.nextAttackLifestealSlot;

    engine.replaceState({
      ...createInitialGameState(),
      hp: snapshot.hp ?? INITIAL_HP,
      gold: snapshot.gold ?? INITIAL_GOLD,
      turnCount: snapshot.turnCount ?? INITIAL_TURN_COUNT,
      shopLevel: typeof snapshot.shopLevel === 'number' ? Math.min(MAX_SHOP_LEVEL, snapshot.shopLevel) : 0,
      monstersDefeated: snapshot.monstersDefeated ?? 0,
      cardsPlayed: snapshot.cardsPlayed ?? 0,
      recycleForgePlayCount: savedForgeCount,
      classDamageDiscoverStreak: snapshot.classDamageDiscoverStreak ?? 0,
      recycleBackpackProgress: snapshot.recycleBackpackProgress ?? 0,
      swapUpgradeProgress: snapshot.swapUpgradeProgress ?? 0,
      totalDamageTaken: snapshot.totalDamageTaken ?? 0,
      totalHealed: snapshot.totalHealed ?? 0,
      healAccumulator: snapshot.healAccumulator ?? 0,
      gameOver: Boolean(snapshot.gameOver),
      victory: Boolean(snapshot.victory),
      previewCards: mapSlots(snapshot.previewCards),
      activeCards: mapSlots(snapshot.activeCards),
      remainingDeck: Array.isArray(snapshot.remainingDeck) ? snapshot.remainingDeck.map(patchPersistedMainDeckWeaponImage) : [],
      discardedCards: Array.isArray(snapshot.discardedCards) ? snapshot.discardedCards.map(patchPersistedMainDeckWeaponImage) : [],
      handCards: Array.isArray(snapshot.handCards) ? snapshot.handCards.map(patchPersistedMainDeckWeaponImage) : [],
      equipmentSlot1: mapEquipment(snapshot.equipmentSlot1 ?? null, 'equipmentSlot1'),
      equipmentSlot2: mapEquipment(snapshot.equipmentSlot2 ?? null, 'equipmentSlot2'),
      equipmentSlot1Reserve: Array.isArray(snapshot.equipmentSlot1Reserve)
        ? snapshot.equipmentSlot1Reserve.map(c => ({ ...patchPersistedMainDeckWeaponImage(c), type: c.type as 'weapon' | 'shield' | 'monster', fromSlot: 'equipmentSlot1' as const }) as EquipmentItem)
        : [],
      equipmentSlot2Reserve: Array.isArray(snapshot.equipmentSlot2Reserve)
        ? snapshot.equipmentSlot2Reserve.map(c => ({ ...patchPersistedMainDeckWeaponImage(c), type: c.type as 'weapon' | 'shield' | 'monster', fromSlot: 'equipmentSlot2' as const }) as EquipmentItem)
        : [],
      equipmentSlotCapacity: snapshot.equipmentSlotCapacity
        ? { equipmentSlot1: (snapshot.equipmentSlotCapacity as any).equipmentSlot1 ?? 1, equipmentSlot2: (snapshot.equipmentSlotCapacity as any).equipmentSlot2 ?? 1 }
        : { equipmentSlot1: 1, equipmentSlot2: 1 },
      maxAmuletSlots: snapshot.maxAmuletSlots ?? MAX_AMULET_SLOTS,
      amuletSlots: restoredAmulets,
      backpackItems: Array.isArray(snapshot.backpackItems) ? snapshot.backpackItems.map(patchPersistedMainDeckWeaponImage) : [],
      turnDamageTaken: snapshot.turnDamageTaken ?? 0,
      berserkTurnBuff: snapshot.berserkTurnBuff
        ? { equipmentSlot1: snapshot.berserkTurnBuff.equipmentSlot1 ?? 0, equipmentSlot2: snapshot.berserkTurnBuff.equipmentSlot2 ?? 0 }
        : createEmptyEquipmentBuffState(),
      extraAttackCharges: snapshot.extraAttackCharges ?? 0,
      permanentMagicRecycleBag: Array.isArray(snapshot.permanentMagicRecycleBag) ? snapshot.permanentMagicRecycleBag.map(patchPersistedMainDeckWeaponImage) : [],
      classDeck: Array.isArray(snapshot.classDeck) ? snapshot.classDeck : [],
      classCardsInHand: Array.isArray(snapshot.classCardsInHand) ? snapshot.classCardsInHand : [],
      selectedHeroSkill: (snapshot.selectedHeroSkill ?? null) as HeroSkillId | null,
      extraHeroSkills: Array.isArray((snapshot as any).extraHeroSkills) ? (snapshot as any).extraHeroSkills : [],
      showSkillSelection: typeof snapshot.showSkillSelection === 'boolean' ? snapshot.showSkillSelection : true,
      heroVariant: snapshot.heroVariant ?? getRandomHero(),
      heroClass: ((snapshot.heroVariant?.classTitle ?? '') as string).toLowerCase(),
      permanentSkills: Array.isArray(snapshot.permanentSkills) ? snapshot.permanentSkills : [],
      wraithPassiveEnabled: Boolean(snapshot.wraithPassiveEnabled),
      permanentMaxHpBonus: snapshot.permanentMaxHpBonus ?? 0,
      permanentSpellDamageBonus: snapshot.permanentSpellDamageBonus ?? 0,
      permanentSpellLifesteal: snapshot.permanentSpellLifesteal ?? 0,
      stunCap: snapshot.stunCap ?? 10,
      heroStunned: snapshot.heroStunned ?? false,
      persuadeLevel: snapshot.persuadeLevel ?? 1,
      persuadeCostModifier: snapshot.persuadeCostModifier ?? 0,
      lastPersuadeTargetId: snapshot.lastPersuadeTargetId ?? null,
      persuadeSameTargetCostHalve: snapshot.persuadeSameTargetCostHalve ?? false,
      persuadeRaceBonus: snapshot.persuadeRaceBonus ?? {},
      persuadeSuccessDurabilityBonus: snapshot.persuadeSuccessDurabilityBonus ?? 0,
      lastPlayedCardCategory: snapshot.lastPlayedCardCategory ?? null,
      magicCardsPlayedThisTurn: snapshot.magicCardsPlayedThisTurn ?? 0,
      backpackCapacityModifier: snapshot.backpackCapacityModifier ?? 0,
      heroMagicState: sanitizeHeroMagicState(snapshot.heroMagicState),
      equipmentSlotBonuses: mapEquipmentBonuses(snapshot.equipmentSlotBonuses),
      weaponMasterBonus: snapshot.weaponMasterBonus ?? 0,
      shieldMasterBonus: snapshot.shieldMasterBonus ?? 0,
      drawPending: Boolean(snapshot.drawPending),
      waveDiscardCount: snapshot.waveDiscardCount ?? 0,
      resolvingDungeonCardId: snapshot.resolvingDungeonCardId ?? null,
      currentEventCard: snapshot.currentEventCard ?? null,
      eventModalOpen: snapshot.eventModalOpen ?? false,
      eventModalMinimized: snapshot.eventModalMinimized ?? false,
      berserkerRageActive: snapshot.berserkerRageActive ?? false,
      berserkerSlotUsed: snapshot.berserkerSlotUsed ?? {},
      flashSlotUsed: snapshot.flashSlotUsed ?? {},
      gambitExtraActive: snapshot.gambitExtraActive ?? false,
      gambitExtraPerSlot: snapshot.gambitExtraPerSlot ?? 1,
      gambitSlotUsed: snapshot.gambitSlotUsed ?? {},
      weaponExtraAttackUsed: snapshot.weaponExtraAttackUsed ?? {},
      blockDurabilityPerSlot: snapshot.blockDurabilityPerSlot ?? 1,
      combatState: restoredCombat,
      heroSkillUsedThisWave: Boolean(snapshot.heroSkillUsedThisWave),
      extraSkillsUsedThisWave: Array.isArray(snapshot.extraSkillsUsedThisWave) ? snapshot.extraSkillsUsedThisWave : [],
      handLimitBonus: snapshot.handLimitBonus ?? 0,
      tempShield: snapshot.tempShield ?? 0,
      nextWeaponBonus: snapshot.nextWeaponBonus ?? 0,
      nextShieldBonus: snapshot.nextShieldBonus ?? 0,
      slotAttackBursts: snapshot.slotAttackBursts
        ? { equipmentSlot1: snapshot.slotAttackBursts.equipmentSlot1 ?? 0, equipmentSlot2: snapshot.slotAttackBursts.equipmentSlot2 ?? 0 }
        : { equipmentSlot1: 0, equipmentSlot2: 0 },
      nextAttackLifestealSlot: lsSlot === 'equipmentSlot1' || lsSlot === 'equipmentSlot2' ? lsSlot : null,
      vampiricNextAttack: Boolean(snapshot.vampiricNextAttack),
      unbreakableNext: Boolean(snapshot.unbreakableNext),
      unbreakableUntilWaterfall: snapshot.unbreakableUntilWaterfall ?? { equipmentSlot1: false, equipmentSlot2: false },
      bulwarkPassiveActive: Number(snapshot.bulwarkPassiveActive) || 0,
      bulwarkTempArmorStacks: Number(snapshot.bulwarkTempArmorStacks) || 0,
      slotTempArmor: snapshot.slotTempArmor
        ? { equipmentSlot1: snapshot.slotTempArmor.equipmentSlot1 ?? 0, equipmentSlot2: snapshot.slotTempArmor.equipmentSlot2 ?? 0 }
        : { equipmentSlot1: 0, equipmentSlot2: 0 },
      slotTempAttack: snapshot.slotTempAttack
        ? { equipmentSlot1: snapshot.slotTempAttack.equipmentSlot1 ?? 0, equipmentSlot2: snapshot.slotTempAttack.equipmentSlot2 ?? 0 }
        : { equipmentSlot1: 0, equipmentSlot2: 0 },
      statSwapCardObtained: Boolean((snapshot as any).statSwapCardObtained),
      doubleNextMagic: Boolean(snapshot.doubleNextMagic),
      defensiveStanceActive: Boolean(snapshot.defensiveStanceActive),
      previewCardStacks: snapshot.previewCardStacks ?? {},
      activeCardStacks: snapshot.activeCardStacks ?? {},
      waterfallDealBonus: snapshot.waterfallDealBonus ?? 0,
      eternalRelics: Array.isArray(snapshot.eternalRelics) ? snapshot.eternalRelics as import('@/game-core/types').EternalRelic[] : getStartingRelics(),
      undoCount: undoStackRef.current.length,
      isHydrated: true,
      totalWins: getTotalWins(),

      // --- Restore modal states ---
      discoverModalOpen: Boolean(snapshot.discoverModalOpen),
      discoverOptions: Array.isArray(snapshot.discoverOptions) ? snapshot.discoverOptions : [],
      discoverSourceLabel: snapshot.discoverSourceLabel ?? null,
      deleteModalOpen: Boolean(snapshot.deleteModalOpen),
      upgradeModalOpen: Boolean(snapshot.upgradeModalOpen),
      showCardDraft: Boolean(snapshot.showCardDraft),
      cardDraftPool: Array.isArray(snapshot.cardDraftPool) ? snapshot.cardDraftPool : [],
      shopModalOpen: Boolean(snapshot.shopModalOpen),
      shopModalMinimized: Boolean(snapshot.shopModalMinimized),
      shopOfferings: Array.isArray(snapshot.shopOfferings) ? snapshot.shopOfferings as import('@/game-core/types').ShopOffering[] : [],
      shopSourceEvent: snapshot.shopSourceEvent ?? null,
      shopDeleteUsed: Boolean(snapshot.shopDeleteUsed),
      shopHealUsed: Boolean(snapshot.shopHealUsed),
      shopLevelUpUsed: Boolean(snapshot.shopLevelUpUsed),
      shopSkillDiscoverUsed: Boolean(snapshot.shopSkillDiscoverUsed),
      shopSkillOptions: Array.isArray(snapshot.shopSkillOptions) ? snapshot.shopSkillOptions : [],
      shopSkillSelectOpen: Boolean(snapshot.shopSkillSelectOpen),
      monsterRewardQueue: Array.isArray(snapshot.monsterRewardQueue) ? snapshot.monsterRewardQueue as import('@/game-core/types').MonsterRewardDrop[] : [],
      activeMonsterReward: (snapshot.activeMonsterReward as import('@/game-core/types').MonsterRewardDrop | null) ?? null,
      selectedMonsterRewards: (snapshot.selectedMonsterRewards as import('@/game-core/types').MonsterRewardOption[] | null) ?? null,
      graveyardDiscoverState: snapshot.graveyardDiscoverState ?? null,
      graveyardDiscoverDelivery: snapshot.graveyardDiscoverDelivery ?? 'backpack',
      ghostBladeExileCards: snapshot.ghostBladeExileCards ?? null,
      handMagicUpgradeModal: snapshot.handMagicUpgradeModal ?? null,
      mirrorCopyModal: snapshot.mirrorCopyModal ?? null,
      permGrantModal: (snapshot.permGrantModal as import('@/game-core/types').GameState['permGrantModal']) ?? null,
      amplifyModal: snapshot.amplifyModal ?? null,
      persuadeState: (snapshot.persuadeState as import('@/game-core/types').PersuadeModalState | null) ?? null,
      deathWardPrompt: (snapshot.deathWardPrompt as import('@/game-core/types').DeathWardPromptState | null) ?? null,
    });

    // Stacking state (previewCardStacks, activeCardStacks) is hydrated via engine state

    if (snapshot.currentEventCard && snapshot.resolvingDungeonCardId) {
      eventResolutionRef.current = { cardId: snapshot.resolvingDungeonCardId, source: 'dungeon' };
    } else if (snapshot.currentEventCard) {
      eventResolutionRef.current = { cardId: null, source: 'hand' };
    } else {
      eventResolutionRef.current = { cardId: null, source: null };
    }

    const restoredClassDeck = Array.isArray(snapshot.classDeck) ? snapshot.classDeck : [];
    if (snapshot.showSkillSelection && restoredClassDeck.length > 0) {
      classCardPreviewIdRef.current = restoredClassDeck[Math.floor(Math.random() * restoredClassDeck.length)].id;
    } else {
      classCardPreviewIdRef.current = null;
    }

    // Reset UI-only animation states
    setHeroSkillArrow(null);
    setSwordVectors({});
    setTakingDamage(false);
    setHealing(false);

    // Cancel combat animation timeouts and reset visual states
    animationDelayTimeoutsRef.current.forEach(id => clearTimeout(id));
    animationDelayTimeoutsRef.current = [];
    if (heroBleedTimeoutRef.current) {
      clearTimeout(heroBleedTimeoutRef.current);
      heroBleedTimeoutRef.current = null;
    }
    for (const timeouts of Object.values(monsterBleedTimeoutsRef.current)) {
      timeouts.forEach(id => clearTimeout(id));
    }
    monsterBleedTimeoutsRef.current = {};
    for (const timeouts of Object.values(weaponSwingTimeoutsRef.current)) {
      timeouts.forEach(id => clearTimeout(id));
    }
    weaponSwingTimeoutsRef.current = { equipmentSlot1: [], equipmentSlot2: [] };
    for (const timeouts of Object.values(shieldBlockTimeoutsRef.current)) {
      timeouts.forEach(id => clearTimeout(id));
    }
    shieldBlockTimeoutsRef.current = { equipmentSlot1: [], equipmentSlot2: [] };

    setHeroBleedActive(false);
    setMonsterBleedStates({});
    setWeaponSwingStates({ equipmentSlot1: 0, equipmentSlot2: 0 });
    setShieldBlockStates({ equipmentSlot1: 0, equipmentSlot2: 0 });
    setRemovingCards(new Set());
    setMonsterDefeatStates({});

    // Clear stale tracking refs
    storingCardIdsRef.current.clear();
    pendingAutoDrawsRef.current = 0;
    skipNextEventAutoDrawRef.current = false;
    skipEventFlipRef.current = false;
    heroTurnLayerLossIdsRef.current.clear();
    pendingDefeatIdsRef.current.clear();

    clearWaterfallTimeouts();
    waterfallPlanRef.current = null;
    waterfallTimeoutsRef.current = [];
    waterfallLockRef.current = false;
    waterfallPendingRef.current = false;
    waterfallSequenceRef.current = 0;
    pendingDungeonRemovalsRef.current = 0;
    setWaterfallAnimation(initialWaterfallAnimationState);
    setClassDeckFlights([]);
    classDeckFlightsRef.current = [];
    classDeckFlightElementMapRef.current.clear();
    if (classDeckFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(classDeckFlightAnimationRef.current);
      classDeckFlightAnimationRef.current = null;
    }
    setFateSwapFlights([]);
    fateSwapFlightsRef.current = [];
    fateSwapFlightElementMapRef.current.clear();
    if (fateSwapFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(fateSwapFlightAnimationRef.current);
      fateSwapFlightAnimationRef.current = null;
    }
    setGraveyardStackFlights([]);
    graveyardStackFlightsRef.current = [];
    graveyardStackFlightElementMapRef.current.clear();
    if (graveyardStackFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(graveyardStackFlightAnimationRef.current);
      graveyardStackFlightAnimationRef.current = null;
    }
    setBackpackHandFlights([]);
    backpackHandFlightsRef.current = [];
    backpackFlightElementMapRef.current.clear();
    if (backpackHandFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(backpackHandFlightAnimationRef.current);
      backpackHandFlightAnimationRef.current = null;
    }
    setDiscardShockFlights([]);
    discardShockFlightsRef.current = [];
    discardShockElementMapRef.current.clear();
    discardShockProcQueueRef.current = [];
    discardShockSeqInFlightRef.current = false;
    if (discardShockFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(discardShockFlightAnimationRef.current);
      discardShockFlightAnimationRef.current = null;
    }
    if (directedCombatFxFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(directedCombatFxFlightAnimationRef.current);
      directedCombatFxFlightAnimationRef.current = null;
    }
    directedCombatFxFlightsRef.current = [];
    setDirectedCombatFxFlights([]);
    directedCombatFxElementMapRef.current.clear();
    clearAllBackpackHandFallbacks();
  };

  const MAX_UNDO_STACK = 10;

  const pushUndoSnapshot = useCallback(() => {
    if (undoGuardRef.current) return;
    undoGuardRef.current = true;
    Promise.resolve().then(() => { undoGuardRef.current = false; });

    const snapshot = JSON.parse(JSON.stringify(engine.getState())) as GameState;
    const stack = undoStackRef.current;
    stack.push(snapshot);
    if (stack.length > MAX_UNDO_STACK) {
      stack.splice(0, stack.length - MAX_UNDO_STACK);
    }
    setUndoCount(stack.length);
    saveUndoStack(stack);
  }, [engine]);

  const clearUndoStack = useCallback(() => {
    undoStackRef.current = [];
    setUndoCount(0);
    clearUndoStorage();
  }, []);

  // Card-gain amulet callbacks
  const setCardGainUpgradeProgress = useEngineSetter('cardGainUpgradeProgress');
  onNewCardGainedRef.current = (count: number, source?: 'graveyard' | 'classPool') => {
    if (amuletEffects.hasCardGainUpgrade) {
      const current = engine.getState().cardGainUpgradeProgress;
      const next = current + count;
      if (next >= 3) {
        setCardGainUpgradeProgress(next % 3);
        setUpgradeModalOpen(true);
        addGameLog('equip', `虫蜕之冠：新获得 3 张牌，可升级 1 张牌！`);
        setHeroSkillBanner('虫蜕之冠发动：选择一张牌升级！');
      } else {
        setCardGainUpgradeProgress(next);
      }
    }

    if (amuletEffects.hasCardGainMissile && (source === 'graveyard' || source === 'classPool')) {
      const missileAmulet = engine.getState().amuletSlots.find(s => s?.amuletEffect === 'card-gain-missile');
      const boltsPerTrigger = (missileAmulet?.upgradeLevel ?? 0) >= 1 ? 2 : 1;
      const bolts: GameCardData[] = [];
      for (let i = 0; i < boltsPerTrigger; i++) {
        bolts.push(createMagicBoltCard());
      }
      setHandCards(prev => [...prev, ...bolts]);
      addGameLog('amulet', `弹幕之符：获得 ${boltsPerTrigger} 张「魔弹」`);
    }
  };

  // Populate cardOps deps ref (all function deps are now defined)
  cardOpsDepsRef.current = {
    addGameLog,
    triggerDiscardFlight,
    triggerDiscardShock,
    triggerGraveNova,
    queueCardIntoHand,
    handCardsRef,
    backpackHandFlightsRef,
    storingCardIdsRef,
    selectedHeroSkillRef,
    eternalRelicsRef,
    pendingAutoDrawsRef,
    discardedCardsRef,
    stagingCardsRef,
    pendingDiscardEffectsQueueRef,
    clearUndoStack,
    pushUndoSnapshot,
    updateMonsterCard,
    dealDamageToMonster,
    getSpellDamage,
    onNewCardGainedRef,
  };

  const handleUndo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    if (fullBoardInteractionLockedRef.current) return;
    const snapshot = stack.pop()!;
    setUndoCount(stack.length);
    saveUndoStack(stack);

    // Cancel any in-progress waterfall animations
    clearWaterfallTimeouts();
    waterfallPlanRef.current = null;
    waterfallTimeoutsRef.current = [];
    waterfallLockRef.current = false;
    waterfallPendingRef.current = false;
    setWaterfallAnimation(initialWaterfallAnimationState);

    // Cancel all in-flight combat animation timeouts
    animationDelayTimeoutsRef.current.forEach(id => clearTimeout(id));
    animationDelayTimeoutsRef.current = [];
    if (heroBleedTimeoutRef.current) {
      clearTimeout(heroBleedTimeoutRef.current);
      heroBleedTimeoutRef.current = null;
    }
    for (const timeouts of Object.values(monsterBleedTimeoutsRef.current)) {
      timeouts.forEach(id => clearTimeout(id));
    }
    monsterBleedTimeoutsRef.current = {};
    for (const timeouts of Object.values(weaponSwingTimeoutsRef.current)) {
      timeouts.forEach(id => clearTimeout(id));
    }
    weaponSwingTimeoutsRef.current = { equipmentSlot1: [], equipmentSlot2: [] };
    for (const timeouts of Object.values(shieldBlockTimeoutsRef.current)) {
      timeouts.forEach(id => clearTimeout(id));
    }
    shieldBlockTimeoutsRef.current = { equipmentSlot1: [], equipmentSlot2: [] };

    if (discardShockFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(discardShockFlightAnimationRef.current);
      discardShockFlightAnimationRef.current = null;
    }
    if (directedCombatFxFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(directedCombatFxFlightAnimationRef.current);
      directedCombatFxFlightAnimationRef.current = null;
    }
    directedCombatFxFlightsRef.current = [];
    setDirectedCombatFxFlights([]);
    directedCombatFxElementMapRef.current.clear();
    discardShockFlightsRef.current = [];
    discardShockElementMapRef.current.clear();
    setDiscardShockFlights([]);
    discardShockProcQueueRef.current = [];
    discardShockSeqInFlightRef.current = false;
    setDiscardShockInteractionLocked(false);

    // Reset visual animation states
    setHeroBleedActive(false);
    setMonsterBleedStates({});
    setWeaponSwingStates({ equipmentSlot1: 0, equipmentSlot2: 0 });
    setShieldBlockStates({ equipmentSlot1: 0, equipmentSlot2: 0 });
    setRemovingCards(new Set());
    setMonsterDefeatStates({});

    // Clear stale tracking refs
    storingCardIdsRef.current.clear();
    processedDungeonCardIdsRef.current.clear();
    pendingAutoDrawsRef.current = 0;
    skipNextEventAutoDrawRef.current = false;
    skipEventFlipRef.current = false;
    heroTurnLayerLossIdsRef.current.clear();
    pendingDefeatIdsRef.current.clear();

    // Close UI-only local modals (not part of engine state)
    setBackpackViewerOpen(false);
    setDeckViewerOpen(false);
    setDeckPeekState(null);
    setDetailsModalOpen(false);
    setHeroDetailsOpen(false);
    setGameOverMinimized(false);
    if (ghostBladeExileResolverRef.current) {
      ghostBladeExileResolverRef.current();
      ghostBladeExileResolverRef.current = null;
    }

    // Restore full engine state from snapshot
    engine.replaceState(snapshot);

    // Sync refs that mirror engine state
    syncMonsterRewardQueuedInstanceIdsRef(
      snapshot.monsterRewardQueue ?? [],
      snapshot.activeMonsterReward ?? null,
    );
    if (snapshot.graveyardDiscoverState) {
      graveyardDiscoverDeliveryRef.current = snapshot.graveyardDiscoverDelivery ?? 'backpack';
      if (snapshot.activeMonsterReward) {
        const doneId = snapshot.activeMonsterReward.monsterInstanceId;
        graveyardDiscoverResolverRef.current = () => {
          if (doneId) monsterRewardQueuedInstanceIdsRef.current.delete(doneId);
          setActiveMonsterReward(null);
        };
      } else {
        graveyardDiscoverResolverRef.current = () => {};
      }
    }
    cardActionRemainingRef.current = snapshot.cardActionContext?.remainingCount ?? 0;
    deletingCardIdsRef.current.clear();
    monsterRewardPreviewCacheRef.current = snapshot.monsterRewardPreviewCache;
  }, [engine, clearWaterfallTimeouts, syncMonsterRewardQueuedInstanceIdsRef]);

  const handleNewGame = () => {
    clearGameState();
    lastPersistedStateRef.current = null;
    clearUndoStack();
    clearGameLog();
    setGameOverMinimized(false);
    initGame();
    setIsHydrated(true);
  };

  // Handle skill selection — active skills set as hero skill, passive skills become eternal relics
  const handleSkillSelection = (skillId: string) => {
    engine.batch(() => {
      resetHeroSkillForNewWave();
      const definition = getHeroSkillById(skillId as HeroSkillId);
      const isPassive = definition?.type === 'passive';

      if (isPassive) {
        const relic = getEternalRelic(skillId as import('@/game-core/types').EternalRelicId);
        setEternalRelics(prev => [...prev, relic]);
        addGameLog('system', `获得永恒护符：${relic.name}`);

        const initialBonus = relic.initialMaxHpBonus ?? 0;
        if (initialBonus) {
          addGameLog('system', `开局加成：最大生命 +${initialBonus}`);
          setHp(INITIAL_HP + initialBonus);
        }
        const initialGold = relic.initialGoldBonus ?? 0;
        if (initialGold) {
          setGold(prev => prev + initialGold);
          addGameLog('gold', `开局加成：金币 +${initialGold}`);
        }
        const initialWaterfall = relic.initialWaterfallBonus ?? 0;
        if (initialWaterfall) {
          setTurnCount(prev => prev + initialWaterfall);
          addGameLog('system', `开局加成：瀑流回合 +${initialWaterfall}`);
        }
        const initialShopLv = relic.initialShopLevel;
        if (initialShopLv != null && initialShopLv > 0) {
          setShopLevel(Math.min(MAX_SHOP_LEVEL, initialShopLv));
          addGameLog('shop', `开局加成：商店等级 ${Math.min(MAX_SHOP_LEVEL, initialShopLv)}`);
        }
        const initialSpellDmg = relic.initialSpellDamageBonus ?? 0;
        if (initialSpellDmg) {
          setPermanentSpellDamageBonus(prev => prev + initialSpellDmg);
          addGameLog('skill', `开局加成：永久法术伤害 +${initialSpellDmg}`);
        }
      } else {
        setSelectedHeroSkill(skillId as HeroSkillId);
        addGameLog('system', `选择英雄技能：${definition?.name ?? skillId}`);

        const initialBonus = definition?.initialMaxHpBonus ?? 0;
        if (initialBonus) {
          addGameLog('system', `开局加成：最大生命 +${initialBonus}`);
          setHp(INITIAL_HP + initialBonus);
        }
        const initialGold = definition?.initialGoldBonus ?? 0;
        if (initialGold) {
          setGold(prev => prev + initialGold);
          addGameLog('gold', `开局加成：金币 +${initialGold}`);
        }
        const initialWaterfall = definition?.initialWaterfallBonus ?? 0;
        if (initialWaterfall) {
          setTurnCount(prev => prev + initialWaterfall);
          addGameLog('system', `开局加成：瀑流回合 +${initialWaterfall}`);
        }
        const initialShopLv = definition?.initialShopLevel;
        if (initialShopLv != null && initialShopLv > 0) {
          setShopLevel(Math.min(MAX_SHOP_LEVEL, initialShopLv));
          addGameLog('shop', `开局加成：商店等级 ${Math.min(MAX_SHOP_LEVEL, initialShopLv)}`);
        }
        const initialBackpackCap = definition?.initialBackpackCapacityBonus ?? 0;
        if (initialBackpackCap) {
          setBackpackCapacityModifier(prev => prev + initialBackpackCap);
          addGameLog('skill', `开局加成：背包上限 +${initialBackpackCap}`);
        }
        const initialHandLimit = definition?.initialHandLimitBonus ?? 0;
        setHandLimitBonus(initialHandLimit);
        if (initialHandLimit) {
          addGameLog('skill', `开局加成：手牌上限 +${initialHandLimit}`);
        }
        const initialSpellDmg = definition?.initialSpellDamageBonus ?? 0;
        if (initialSpellDmg) {
          setPermanentSpellDamageBonus(prev => prev + initialSpellDmg);
          addGameLog('skill', `开局加成：永久法术伤害 +${initialSpellDmg}`);
        }
      }

      setShowSkillSelection(false);
      cardDraftPendingSkillRef.current = skillId;
      setCardDraftPool(createStarterCardPool());
      setShowCardDraft(true);
    });
  };

  const handleCardDraftComplete = (picks: GameCardData[]) => {
    const skillId = cardDraftPendingSkillRef.current;
    cardDraftPendingSkillRef.current = null;
    const definition = skillId ? getHeroSkillById(skillId as HeroSkillId) : null;
    const currentRelics = eternalRelicsRef.current;

    let classDrawn: GameCardData[] = [];

    engine.batch(() => {
      setShowCardDraft(false);
      setCardDraftPool([]);

      setBackpackItems(picks);
      addGameLog('system', `起始卡牌选择完毕：${picks.map(c => c.name).join('、')}`);

      if (hasEternalRelic(currentRelics, 'summon-minion')) {
        const minionCard: GameCardData = {
          id: 'summon-minion-card',
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
        addCardToBackpack(minionCard);
        addGameLog('skill', '开局加成：获得小随从');
      }
      if (hasEternalRelic(currentRelics, 'heal-to-damage')) {
        addCardToBackpack(createStarterHealEchoCard());
        addGameLog('skill', '愈战愈勇：开局获得永久魔法「治愈余韵」');
      }
      if (hasEternalRelic(currentRelics, 'shield-wall')) {
        const thunderSeal = classDeck.find(
          c => c.type === 'amulet' && (c as GameCardData).amuletEffect === 'discard-zap',
        );
        if (thunderSeal) {
          setClassDeck(prev => prev.filter(c => c.id !== thunderSeal.id));
          addCardToBackpack(thunderSeal);
          triggerClassDeckFlight([thunderSeal]);
        }
        if (thunderSeal) {
          addGameLog('skill', '雷盾心法：已从职业牌堆将「雷霆符印」放入背包。');
        }
      }

      const baseClassCards = 1;
      const skillClassCards = (definition?.type === 'passive') ? 0 : (definition?.initialClassCardDraw ?? 0);
      const relicClassCards = currentRelics.reduce((sum, r) => sum + (r.initialClassCardDraw ?? 0), 0);
      const totalClassCards = baseClassCards + skillClassCards + relicClassCards;
      const classFilter = hasEternalRelic(currentRelics, 'shield-wall')
        ? (card: GameCardData) => !(card.type === 'amulet' && (card as GameCardData).amuletEffect === 'discard-zap')
        : undefined;

      const previewId = classCardPreviewIdRef.current;
      const previewCard = previewId ? classDeck.find(c => c.id === previewId) : null;
      const previewPassesFilter = previewCard && (!classFilter || classFilter(previewCard));

      if (previewPassesFilter && previewCard) {
        addCardToBackpack(previewCard);
        setClassDeck(prev => prev.filter(c => c.id !== previewCard.id));
        addGameLog('skill', `获得专属卡（开场）：${previewCard.name}`);
        classDrawn.push(previewCard);

        const remaining = totalClassCards - 1;
        if (remaining > 0) {
          const extraFilter = (card: GameCardData) => {
            if (card.id === previewId) return false;
            return classFilter ? classFilter(card) : true;
          };
          const more = drawClassCardsToBackpack(remaining, '开场', extraFilter);
          classDrawn.push(...more);
        }
      } else {
        classDrawn = drawClassCardsToBackpack(totalClassCards, '开场', classFilter);
      }
      classCardPreviewIdRef.current = null;

      if (classDrawn.length > 0) {
        triggerClassDeckFlight(classDrawn);
      }
    });

    const baseHandCards = 2;
    const skillHandDraw = (definition?.type === 'passive') ? 0 : (definition?.initialHandDraw ?? 0);
    const totalHandCards = baseHandCards + skillHandDraw;
    const classFlightDelay = classDrawn.length > 0
      ? CLASS_FLIGHT_BASE_DURATION + CLASS_FLIGHT_VARIANCE
        + Math.max(0, classDrawn.length - 1) * CLASS_FLIGHT_STAGGER + 300
      : 200;
    setTimeout(() => {
      engine.batch(() => {
        for (let i = 0; i < totalHandCards; i++) {
          const drawn = drawFromBackpackToHand();
          if (drawn) {
            addGameLog(
              i < baseHandCards ? 'system' : 'skill',
              i < baseHandCards
                ? `开场抽牌：「${drawn.name}」`
                : `开局加成：抽到手牌「${drawn.name}」`,
            );
          }
        }
      });
    }, classFlightDelay);
  };



  const resetEquipmentSlotBonuses = () => {
    (['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]).forEach(slotId => {
      (['damage', 'shield'] as (keyof SlotPermanentBonus)[]).forEach(bonusType => {
        setEquipmentSlotBonus(slotId, bonusType, 0);
      });
    });
  };

  const registerMonsterCellRef = (monsterId?: string) => (el: HTMLDivElement | null) => {
    if (!monsterId) return;
    if (el) {
      monsterCellRefs.current[monsterId] = el;
    } else {
      delete monsterCellRefs.current[monsterId];
    }
  };
  const canShieldBlock = (slotId: EquipmentSlotId) => {
    const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
    return Boolean(slotItem && (slotItem.type === 'shield' || slotItem.type === 'monster'));
  };







  const findWeaponSlot = (): { id: EquipmentSlotId; item: EquipmentItem } | null => {
    for (const slot of getEquipmentSlots()) {
      if (slot.item?.type === 'weapon' || slot.item?.type === 'monster') return slot as { id: EquipmentSlotId; item: EquipmentItem };
    }
    return null;
  };

  const findShieldSlot = (): { id: EquipmentSlotId; item: EquipmentItem } | null => {
    for (const slot of getEquipmentSlots()) {
      if (slot.item?.type === 'shield' || slot.item?.type === 'monster') return slot as { id: EquipmentSlotId; item: EquipmentItem };
    }
    return null;
  };

  useEffect(() => {
    if (!drawPending) return;
    
    const timer = setTimeout(() => {
      let carriedSlot: { card: GameCardData; index: number } | null = null;
      
      // First, capture the unplayed non-ghost card and its original slot
      setActiveCards(prev => {
        const remaining = flattenActiveRowSlots(prev).filter(c => !c.isGhost);
        if (remaining.length === 1) {
          const onlyCard = remaining[0];
          carriedSlot = {
            card: onlyCard,
            index: findSlotIndexByCardId(prev, onlyCard.id),
          };
        } else {
          carriedSlot = null;
        }
        return prev;
      });
      
      // Then update both deck and active cards
      setRemainingDeck(prevRemaining => {
        const occupiedSlots = carriedSlot ? 1 : 0;
        const availableSlots = DUNGEON_COLUMN_COUNT - occupiedSlots;
        const cardsToDraw = Math.min(availableSlots, prevRemaining.length);
        
        if (cardsToDraw === 0 && !carriedSlot) {
          addGameLog('system', '胜利！地牢已被征服！');
          setVictory(true);
          setGameOver(true);
          setTotalWins(incrementTotalWins());
          setActiveCards(createEmptyActiveRow());
          setCardsPlayed(0);
          setDrawPending(false);
          return prevRemaining;
        }

        const newCards = prevRemaining.slice(0, cardsToDraw);
        if (newCards.length > 0) {
          addGameLog('deck', `翻开 ${newCards.length} 张地牢牌：${newCards.map(c => c.name).join('、')}`);
        }
        const nextSlots = createEmptyActiveRow();
        const drawSpawnTurn = turnCount;

        if (carriedSlot) {
          const targetIndex = carriedSlot.index >= 0 ? carriedSlot.index : 0;
          nextSlots[targetIndex] = carriedSlot.card;
        }

        let insertIndex = 0;
        for (let col = 0; col < DUNGEON_COLUMN_COUNT; col++) {
          if (!nextSlots[col] && insertIndex < newCards.length) {
            nextSlots[col] = applyMonsterRage(newCards[insertIndex++], drawSpawnTurn);
          }
        }
        
        setActiveCards(nextSlots);
        setCardsPlayed(0);
        setDrawPending(false);
        
        return prevRemaining.slice(cardsToDraw); // Remove drawn cards from deck
      });
    }, 500);
    
    return () => clearTimeout(timer);
  }, [drawPending]);









  const createCurseCard = (sourceCard?: GameCardData): GameCardData => ({
    id: `curse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'magic',
    name: '血咒之印',
    value: 0,
    image: sourceCard?.image ?? eventScrollImage,
    description: '永久魔法：使用和弃置时，都失去 3 点生命值。',
    magicType: 'permanent',
    magicEffect: 'curse',
    isCurse: true,
  });





  useEffect(() => {
    enforceBackpackCapacity();
  }, [backpackCapacity, enforceBackpackCapacity]);

  const pendingWraithPassiveUnlockRef = useRef(false);

  useEffect(() => {
    if (permanentSkills.includes('幽魂净化')) return;
    if (pendingWraithPassiveUnlockRef.current) return;
    if (monstersDefeated === 0) return;

    const hasWraith =
      activeCards.some(c => c?.monsterType === 'Wraith') ||
      previewCards.some(c => c?.monsterType === 'Wraith') ||
      remainingDeck.some(c => c.monsterType === 'Wraith');

    if (!hasWraith) {
      pendingWraithPassiveUnlockRef.current = true;
      setPermanentSkills(prev => {
        if (prev.includes('幽魂净化')) return prev;
        return [...prev, '幽魂净化'];
      });
      setWraithPassiveEnabled(true);
      addGameLog('skill', '所有幽魂已被消灭！获得被动技能：幽魂净化');
    }
  }, [activeCards, previewCards, remainingDeck, permanentSkills, monstersDefeated, addGameLog]);

  useEffect(() => {
    if (!pendingWraithPassiveUnlockRef.current) return;
    if (activeMonsterReward || monsterRewardQueue.length > 0) return;
    pendingWraithPassiveUnlockRef.current = false;
    setWraithPassiveUnlockPopup(true);
  }, [activeMonsterReward, monsterRewardQueue]);

  useEffect(() => {
    if (!permanentSkills.includes('幽魂净化')) return;
    if (!engine.getState().wraithPassiveEnabled) return;
    if (backpackItems.length > 0) return;
    if (permanentMagicRecycleBag.length === 0) return;

    setWraithPassiveEnabled(false);

    const cardsToMove = [...permanentMagicRecycleBag].map(c => sanitizeCardMetadata(c));
    setPermanentMagicRecycleBag([]);
    setBackpackItems(cardsToMove);

    addGameLog('skill', `幽魂净化：背包为空，${cardsToMove.length} 张牌从回收袋自动洗回背包！`);
    setHeroSkillBanner(`幽魂净化：${cardsToMove.length} 张牌从回收袋洗回背包！`);
  }, [backpackItems.length, permanentSkills, permanentMagicRecycleBag, addGameLog, setHeroSkillBanner]);

  useEffect(() => {
    discardedCardsRef.current = discardedCards;
  }, [discardedCards]);

  useEffect(() => {
    handCardsRef.current = handCards;
  }, [handCards]);












  const resetWaterfallAnimation = () => {
    clearWaterfallTimeouts();
    waterfallPlanRef.current = null;
    setWaterfallAnimation(initialWaterfallAnimationState);
    waterfallLockRef.current = false;
  };

  const startWaterfallDeal = () => {
    const plan = waterfallPlanRef.current;
    if (!plan) {
      resetWaterfallAnimation();
      return;
    }

    setRemainingDeck(plan.nextRemainingDeck);

    if (plan.nextPreviewCards.length === 0) {
      setPreviewCards(createEmptyActiveRow());
      if (plan.shouldDeclareVictory && countActiveRowSlotsExcludeGhost(activeCards) === 0) {
        addGameLog('system', '胜利！地牢已被征服！');
        setVictory(true);
        setGameOver(true);
        setTotalWins(incrementTotalWins());
      }
      resetWaterfallAnimation();
      return;
    }

    setWaterfallAnimation(prev => ({
      ...prev,
      phase: 'dealing',
      isActive: true,
      droppingSlots: [],
      landingSlots: [],
      discardSlot: null,
      discardDestination: 'graveyard',
      dealingSlots: plan.nextPreviewCards.map((_, idx) => idx),
      sequenceId: prev.sequenceId,
    }));

    setPreviewCards(fillActiveRowSlots(plan.nextPreviewCards).map(card =>
      card ? applyMonsterRage(card, turnCount + 1) : null,
    ) as ActiveRowSlots);

    // Apply pending preview stacks from waterfall deal bonus
    const stacksToApply = pendingPreviewStacksRef.current;
    if (Object.keys(stacksToApply).length > 0) {
      setPreviewCardStacks(stacksToApply);
      pendingPreviewStacksRef.current = {};
    } else {
      setPreviewCardStacks({});
    }

    logWaterfall('deal-start', {
      nextPreviewCount: plan.nextPreviewCards.length,
      shouldDeclareVictory: plan.shouldDeclareVictory,
    });

    queueWaterfallTimeout(() => {
      resetWaterfallAnimation();
    }, animSpeed(WATERFALL_DEAL_DURATION), 'deal-phase-complete');
  };

  const handleWaterfallDiscardComplete = () => {
    const plan = waterfallPlanRef.current;
    if (!plan) {
      resetWaterfallAnimation();
      return;
    }

    if (plan.discardCard) {
      const previewCol =
        plan.discardPreviewIndex != null ? String(plan.discardPreviewIndex + 1) : '?';
      addGameLog(
        'waterfall',
        `瀑流挤掉：「${plan.discardCard.name}」（预览第 ${previewCol} 列 · ${plan.discardCard.type}）`,
      );
      /** 尚未变身 Boss 的「最终之敌」被挤出时不进坟场，置于 remaining 牌堆底（不打乱牌序） */
      const tryReturnFinalMonsterPrecursorToDeck = (card: GameCardData): boolean => {
        if (card.type !== 'monster' || !card.isFinalMonster || card.bossPhase) {
          return false;
        }
        addGameLog('waterfall', `${card.name}（最终之敌）被挤出，置于牌堆底以待决战`);
        plan.nextRemainingDeck.push(card);
        setHeroSkillBanner(`${card.name} 隐入牌堆……终局之战尚未到来。`);
        return true;
      };
      const waterfallDiscardToGraveyardUnlessFinal = (card: GameCardData) => {
        if (!tryReturnFinalMonsterPrecursorToDeck(card)) {
          discardCardToGraveyard(card, { owner: 'dungeon' });
        }
      };
      const wfx = plan.discardCard.waterfallEffect;
      if (wfx && (plan.discardCard.type === 'monster' || plan.discardCard.type === 'event')) {
        const cardName = plan.discardCard.name;
        switch (wfx.type) {
          case 'returnToDeck': {
            const back = plan.discardCard!;
            const isWraith = back.type === 'monster' && back.monsterType === 'Wraith';
            if (isWraith) {
              const insertIdx = Math.floor(Math.random() * (plan.nextRemainingDeck.length + 1));
              plan.nextRemainingDeck.splice(insertIdx, 0, back);
              addGameLog('waterfall', `${cardName} 化为幽影，随机回到剩余牌堆某处`);
              setHeroSkillBanner(`${cardName} 化为幽影，消散在牌堆深处……`);
            } else {
              addGameLog('waterfall', `${cardName} 化为幽影，置于牌堆底`);
              plan.nextRemainingDeck.push(back);
              setHeroSkillBanner(`${cardName} 化为幽影，置于牌堆底。`);
            }
            break;
          }
          case 'bonusDecay':
            addGameLog('waterfall', `${cardName} 诅咒削弱装备/法术加成 -${wfx.amount}`);
            (['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]).forEach(slotId => {
              (['damage', 'shield'] as (keyof SlotPermanentBonus)[]).forEach(bonusType => {
                setEquipmentSlotBonus(slotId, bonusType, v => v - wfx.amount);
              });
            });
            setPermanentSpellDamageBonus(prev => prev - wfx.amount);
            setHeroSkillBanner(`${cardName} 的诅咒削弱了你的装备与法术加成！`);
            waterfallDiscardToGraveyardUnlessFinal(plan.discardCard);
            break;
          case 'goldLoss':
            addGameLog('waterfall', `${cardName} 偷走 ${wfx.amount} 金币`);
            setGold(prev => Math.max(0, prev - wfx.amount));
            setHeroSkillBanner(`${cardName} 逃跑时偷走了 ${wfx.amount} 金币！`);
            waterfallDiscardToGraveyardUnlessFinal(plan.discardCard);
            break;
          case 'damage':
            addGameLog('waterfall', `${cardName} 临死反扑，造成 ${wfx.amount} 点伤害`);
            applyDamage(wfx.amount);
            setHeroSkillBanner(`${cardName} 临死反扑，造成 ${wfx.amount} 点伤害！`);
            waterfallDiscardToGraveyardUnlessFinal(plan.discardCard);
            break;
          case 'turnBoost':
            addGameLog('waterfall', `${cardName} 龙息加速 waterfall +${wfx.amount}`);
            setTurnCount(prev => prev + wfx.amount);
            {
              const pL = slotTempArmor.equipmentSlot1;
              const pR = slotTempArmor.equipmentSlot2;
              if (pL !== 0 || pR !== 0) {
                setSlotTempArmor({ equipmentSlot1: 0, equipmentSlot2: 0 });
              }
            }
            if (slotTempAttack.equipmentSlot1 !== 0 || slotTempAttack.equipmentSlot2 !== 0) {
              setSlotTempAttack({ equipmentSlot1: 0, equipmentSlot2: 0 });
            }
            setActiveCards(prev => {
              let changed = false;
              const next = prev.map(c => {
                if (!c || c.type !== 'monster') return c;
                const tAtk = c.tempAttackBoost ?? 0;
                const tHp = c.tempHpBoost ?? 0;
                if (tAtk === 0 && tHp === 0) return c;
                changed = true;
                const newAtk = Math.max(1, (c.attack ?? c.value ?? 0) - tAtk);
                const newVal = Math.max(1, (c.value ?? 0) - tAtk);
                const newMaxHp = Math.max(1, (c.maxHp ?? 0) - tHp);
                const newHp = Math.min(c.hp ?? 0, newMaxHp);
                const newBoost = Math.max(0, (c.specialAttackBoost ?? 0) - tAtk);
                return { ...c, attack: newAtk, value: newVal, maxHp: newMaxHp, hp: newHp, specialAttackBoost: newBoost, tempAttackBoost: 0, tempHpBoost: 0 };
              }) as typeof prev;
              return changed ? next : prev;
            });
            setDiscardedCards(prev => prev.map(c => {
              if (c.type !== 'monster' || ((c.tempAttackBoost ?? 0) === 0 && (c.tempHpBoost ?? 0) === 0)) return c;
              return { ...c, tempAttackBoost: 0, tempHpBoost: 0 };
            }));
            setHeroSkillBanner(`${cardName} 的龙息加速了 waterfall 进程 +${wfx.amount}！`);
            waterfallDiscardToGraveyardUnlessFinal(plan.discardCard);
            break;
          case 'boostRowMonsterAttack': {
            const boost = wfx.amount;
            const boosted: string[] = [];
            setActiveCards(prev =>
              prev.map(card => {
                if (card?.type === 'monster') {
                  boosted.push(card.name);
                  return { ...card, attack: (card.attack ?? card.value ?? 0) + boost, value: (card.value ?? 0) + boost, tempAttackBoost: (card.tempAttackBoost ?? 0) + boost };
                }
                return card;
              }) as ActiveRowSlots,
            );
            if (boosted.length > 0) {
              addGameLog('waterfall', `${cardName} 被挤出，所有怪物攻击 +${boost}：${boosted.join('、')}`);
              setHeroSkillBanner(`${cardName} 的血咒强化了所有怪物！攻击 +${boost}！`);
            } else {
              addGameLog('waterfall', `${cardName} 被挤出，但没有怪物可强化。`);
            }
            waterfallDiscardToGraveyardUnlessFinal(plan.discardCard);
            break;
          }
          case 'destroyAllEquipment': {
            const destroyed: string[] = [];
            const triggerLW = (card: GameCardData, sid: EquipmentSlotId) => {
              if (card.onDestroyHeal) {
                healHero(card.onDestroyHeal);
                addGameLog('equip', `${card.name} 遗言：恢复了 ${card.onDestroyHeal} 点生命`);
              }
              if (card.onDestroyGold) {
                setGold(prev => prev + card.onDestroyGold!);
                addGameLog('equip', `${card.name} 遗言：获得了 ${card.onDestroyGold} 金币`);
              }
              if (card.onDestroyDraw) {
                for (let di = 0; di < card.onDestroyDraw; di++) drawFromBackpackToHand();
                addGameLog('equip', `${card.name} 遗言：抽取了 ${card.onDestroyDraw} 张牌`);
              }
              if (card.onDestroyClassDraw) {
                const drawn = drawClassCardsToBackpack(card.onDestroyClassDraw, `${card.name}-遗言`);
                if (drawn.length > 0) {
                  triggerClassDeckFlight(drawn);
                  addGameLog('equip', `${card.name} 遗言：获得专属卡「${drawn.map(c => c.name).join('、')}」`);
                }
              }
              if (card.onDestroyPermanentDamage) {
                setEquipmentSlotBonus(sid, 'damage', cur => cur + card.onDestroyPermanentDamage!);
                addGameLog('equip', `${card.name} 遗言：该装备栏永久伤害 +${card.onDestroyPermanentDamage}！`);
              }
              if (card.onDestroyPermanentShield) {
                setEquipmentSlotBonus(sid, 'shield', cur => cur + card.onDestroyPermanentShield!);
                addGameLog('equip', `${card.name} 遗言：该装备栏永久护甲 +${card.onDestroyPermanentShield}！`);
              }
              if (card.onDestroyEffect) {
                addGameLog('equip', `${card.name} 遗言：${card.onDestroyEffect}`);
              }
            };
            const revived: string[] = [];
            (['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]).forEach(slotId => {
              const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
              if (slotItem) {
                const card = slotItem as GameCardData;
                triggerLW(card, slotId);
                const isMonsterEquipWF = card.type === 'monster';
                const nativeReviveWF = isMonsterEquipWF && card.hasRevive && !card.reviveUsed;
                const equipReviveWF = card.hasEquipmentRevive && !card.equipmentReviveUsed;
                if (nativeReviveWF || equipReviveWF) {
                  const revivedItem = nativeReviveWF
                    ? { ...card, durability: 1, reviveUsed: true }
                    : { ...card, durability: 1, equipmentReviveUsed: true };
                  setEquipmentSlotById(slotId, revivedItem as EquipmentItem);
                  addGameLog('equip', `${card.name} 复生！以 1 耐久复活！`);
                  revived.push(card.name);
                } else {
                  destroyed.push(slotItem.name);
                  disposeOwnedEquipmentCard({ ...slotItem }, { isDestruction: true });
                  clearEquipmentSlotById(slotId);
                }
              }
              const reserve = slotId === 'equipmentSlot1' ? equipmentSlot1Reserve : equipmentSlot2Reserve;
              const survivedReserveWF: EquipmentItem[] = [];
              reserve.forEach(r => {
                const rCard = r as GameCardData;
                triggerLW(rCard, slotId);
                const isMonsterEquipR = rCard.type === 'monster';
                const nativeR = isMonsterEquipR && rCard.hasRevive && !rCard.reviveUsed;
                const equipR = rCard.hasEquipmentRevive && !rCard.equipmentReviveUsed;
                if (nativeR || equipR) {
                  const revivedR = nativeR
                    ? { ...r, durability: 1, reviveUsed: true }
                    : { ...r, durability: 1, equipmentReviveUsed: true };
                  survivedReserveWF.push(revivedR as EquipmentItem);
                  addGameLog('equip', `${rCard.name} 复生！以 1 耐久复活！`);
                  revived.push(rCard.name);
                } else {
                  destroyed.push(r.name);
                  disposeOwnedEquipmentCard({ ...r }, { isDestruction: true });
                }
              });
              setEquipmentReserve(slotId, survivedReserveWF);
            });
            if (destroyed.length > 0) {
              addGameLog('waterfall', `${cardName} 被挤出，破坏了所有装备：${destroyed.join('、')}${revived.length > 0 ? `（${revived.join('、')} 复生）` : ''}`);
              setHeroSkillBanner(`${cardName} 的贪婪吞噬了你的所有装备！`);
            } else {
              addGameLog('waterfall', `${cardName} 被挤出，但没有装备可破坏。`);
            }
            waterfallDiscardToGraveyardUnlessFinal(plan.discardCard);
            break;
          }
          case 'swarmInfest': {
            const bugCount = wfx.amount;
            for (let bi = 0; bi < bugCount; bi++) {
              plan.nextRemainingDeck.unshift(createBugletCard());
            }
            addGameLog('waterfall', `${cardName} 被挤出，${bugCount} 只小虫子涌入了牌堆顶！`);
            setHeroSkillBanner(`${cardName} 被挤出！${bugCount} 只小虫子混入了牌堆！`);
            waterfallDiscardToGraveyardUnlessFinal(plan.discardCard);
            break;
          }
          case 'spellDecay': {
            const decayAmount = wfx.amount;
            setPermanentSpellDamageBonus(prev => Math.max(0, prev - decayAmount));
            addGameLog('waterfall', `${cardName} 被挤出，永久法术伤害加成 -${decayAmount}`);
            setHeroSkillBanner(`${cardName} 的反魔结界削弱了你的法术伤害！-${decayAmount}`);
            waterfallDiscardToGraveyardUnlessFinal(plan.discardCard);
            break;
          }
          case 'destroyAllAmuletsAndDiscardHand': {
            const removedAmulets = [...amuletSlots];
            if (removedAmulets.length > 0) {
              removedAmulets.forEach(a => addToGraveyard(a as GameCardData));
              setAmuletSlots([]);
              addGameLog('waterfall', `${cardName} 被挤出，摧毁了 ${removedAmulets.length} 枚护符：${removedAmulets.map(a => a.name).join('、')}`);
            }
            const handSnapshot = [...handCards];
            if (handSnapshot.length > 0) {
              discardAllHandCards();
              addGameLog('waterfall', `${cardName} 被挤出，弃回了 ${handSnapshot.length} 张手牌`);
            }
            if (removedAmulets.length > 0 || handSnapshot.length > 0) {
              setHeroSkillBanner(`${cardName} 被挤出：摧毁了所有护符，弃回了全部手牌！`);
            } else {
              addGameLog('waterfall', `${cardName} 被挤出，但没有护符和手牌。`);
            }
            waterfallDiscardToGraveyardUnlessFinal(plan.discardCard);
            break;
          }
          default:
            if (!tryReturnFinalMonsterPrecursorToDeck(plan.discardCard)) {
              discardCardToGraveyard(plan.discardCard);
            }
            break;
        }
      } else {
        if (!tryReturnFinalMonsterPrecursorToDeck(plan.discardCard)) {
          discardCardToGraveyard(plan.discardCard);
        }
      }
    }

    // Also discard any stacked cards on the discarded preview slot
    if (plan.discardPreviewIndex != null) {
      const discardedStacks = previewCardStacks[plan.discardPreviewIndex];
      if (discardedStacks && discardedStacks.length > 0) {
        for (const stackCard of discardedStacks) {
          discardCardToGraveyard(stackCard, { owner: 'dungeon' });
          addGameLog('waterfall', `瀑流挤掉堆叠：「${stackCard.name}」一并被挤出`);
        }
        setPreviewCardStacks(prev => {
          const next = { ...prev };
          delete next[plan.discardPreviewIndex!];
          return next;
        });
      }
    }

    logWaterfall('discard-complete', {
      discardedCardId: plan.discardCard?.id ?? null,
    });

    setWaterfallAnimation(prev => ({
      ...prev,
      discardSlot: null,
      discardDestination: 'graveyard',
      isActive: true,
      sequenceId: prev.sequenceId,
    }));

    setPreviewCards(createEmptyActiveRow());
    queueWaterfallTimeout(() => {
      startWaterfallDeal();
    }, 150, 'discard-to-deal-delay');
  };

  const handleWaterfallDropComplete = () => {
    const plan = waterfallPlanRef.current;
    if (!plan) {
      resetWaterfallAnimation();
      return;
    }

    logWaterfall('drop-complete', {
      dropTargetSlots: plan.dropTargetSlots,
      dropCards: plan.dropCards.map(card => card.id),
      discardPlanned: Boolean(plan.discardCard),
    });

    if (plan.dropTargetSlots.length > 0) {
      const ghostsDisplaced: Array<{ slotIndex: number; ghost: GameCardData }> = [];

      setActiveCards(prev => {
        const next = [...prev];
        plan.dropTargetSlots.forEach((slotIndex, idx) => {
          const card = plan.dropCards[idx];
          if (typeof slotIndex === 'number') {
            const existing = next[slotIndex];
            if (existing?.isGhost) {
              ghostsDisplaced.push({ slotIndex, ghost: existing });
            }
            next[slotIndex] = card ?? null;
          }
        });
        return next;
      });

      // Transfer preview stacks to active stacks for dropped cards;
      // ghost cards displaced by drops are pushed to the bottom of the stack
      setActiveCardStacks(prev => {
        const next = { ...prev };
        for (const { slotIndex, ghost } of ghostsDisplaced) {
          next[slotIndex] = [ghost, ...(next[slotIndex] ?? [])];
        }
        plan.dropPreviewIndices.forEach((previewIdx, i) => {
          const targetSlot = plan.dropTargetSlots[i];
          const stackForThisPreview = previewCardStacks[previewIdx];
          if (stackForThisPreview && stackForThisPreview.length > 0) {
            next[targetSlot] = [...(next[targetSlot] ?? []), ...stackForThisPreview];
          }
        });
        return next;
      });

      // Clear dropped preview cells and their stacks so they don't flash after animation ends
      setPreviewCards(prev => {
        const next = [...prev] as ActiveRowSlots;
        for (const previewIdx of plan.dropPreviewIndices) {
          next[previewIdx] = null;
        }
        return next;
      });
      setPreviewCardStacks(prev => {
        const next = { ...prev };
        for (const previewIdx of plan.dropPreviewIndices) {
          delete next[previewIdx];
        }
        return next;
      });
    }

    setWaterfallAnimation(prev => ({
      ...prev,
      phase: plan.discardCard ? 'discarding' : 'dealing',
      isActive: true,
      droppingSlots: [],
      landingSlots: plan.dropTargetSlots,
      discardSlot: plan.discardCard ? plan.discardPreviewIndex : null,
      discardDestination: plan.discardDestination,
      sequenceId: prev.sequenceId,
    }));

    queueWaterfallTimeout(() => {
      setWaterfallAnimation(prev => ({
        ...prev,
        landingSlots: [],
        sequenceId: prev.sequenceId,
      }));
    }, animSpeed(Math.max(200, WATERFALL_DROP_DURATION - 200)), 'landing-clear');

    if (plan.discardCard) {
      queueWaterfallTimeout(() => {
        handleWaterfallDiscardComplete();
      }, animSpeed(WATERFALL_DISCARD_DURATION), 'drop-to-discard');
    } else {
      queueWaterfallTimeout(() => {
        setPreviewCards(createEmptyActiveRow());
        startWaterfallDeal();
      }, 150, 'drop-to-deal-delay');
    }
  };

  // Waterfall side-effects: all non-animation effects a waterfall produces.
  // Called from triggerWaterfall and from the soft-waterfall knight spell.
  const applyWaterfallSideEffects = (dropCount?: number) => {
    (['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]).forEach(slotId => {
      const item = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (item?.waterfallAttackBoost) {
        const newValue = (item.value ?? 0) + item.waterfallAttackBoost;
        setEquipmentSlotById(slotId, { ...item, value: newValue });
        addGameLog('equip', `${item.name} 瀑流强化：攻击力 +${item.waterfallAttackBoost}（${newValue}）`);
      }
    });

    if (hasEternalRelic(eternalRelicsRef.current, 'waterfall-heal')) {
      const baseHeal = 4;
      healHero(baseHeal);
      const healAmount = amuletEffects.hasHeal ? baseHeal * 2 : baseHeal;
      addGameLog('skill', `永恒护符·潮涌回春：瀑布推进，恢复 ${healAmount} 点生命${amuletEffects.hasHeal ? '（治疗加倍）' : ''}`);
    }
    if (hasEternalRelic(eternalRelics, 'waterfall-discover')) {
      const started = beginDiscoverFlow('eternal-relic-waterfall', { sourceLabel: '永恒护符·探秘' });
      if (started) {
        addGameLog('skill', '永恒护符·探秘：瀑流推进，发现专属卡！');
      }
    }
    setTurnCount(prev => prev + 1);
    addGameLog('waterfall', `第 ${turnCount + 1} 波开始${dropCount != null ? `，${dropCount} 张新卡牌` : ''}`);
    {
      const prevLeft = slotTempArmor.equipmentSlot1;
      const prevRight = slotTempArmor.equipmentSlot2;
      if (prevLeft !== 0 || prevRight !== 0) {
        setSlotTempArmor({ equipmentSlot1: 0, equipmentSlot2: 0 });
        addGameLog('magic', '瀑流重置，所有临时护甲归零');
      }
    }
    if (slotTempAttack.equipmentSlot1 !== 0 || slotTempAttack.equipmentSlot2 !== 0) {
      setSlotTempAttack({ equipmentSlot1: 0, equipmentSlot2: 0 });
      addGameLog('combat', '瀑流重置：所有临时攻击力归零');
    }
    setActiveCards(prev => {
      let changed = false;
      const clearedNames: string[] = [];
      const next = prev.map(c => {
        if (!c || c.type !== 'monster') return c;
        const tAtk = c.tempAttackBoost ?? 0;
        const tHp = c.tempHpBoost ?? 0;
        if (tAtk === 0 && tHp === 0) return c;
        changed = true;
        clearedNames.push(c.name);
        const newAtk = Math.max(1, (c.attack ?? c.value ?? 0) - tAtk);
        const newVal = Math.max(1, (c.value ?? 0) - tAtk);
        const newMaxHp = Math.max(1, (c.maxHp ?? 0) - tHp);
        const newHp = Math.min(c.hp ?? 0, newMaxHp);
        const newBoost = Math.max(0, (c.specialAttackBoost ?? 0) - tAtk);
        return { ...c, attack: newAtk, value: newVal, maxHp: newMaxHp, hp: newHp, specialAttackBoost: newBoost, tempAttackBoost: 0, tempHpBoost: 0 };
      }) as typeof prev;
      if (changed && clearedNames.length > 0) {
        addGameLog('waterfall', `瀑流重置：${clearedNames.join('、')} 的临时增益消散了`);
      }
      return changed ? next : prev;
    });
    setDiscardedCards(prev => prev.map(c => {
      if (c.type !== 'monster' || ((c.tempAttackBoost ?? 0) === 0 && (c.tempHpBoost ?? 0) === 0)) return c;
      return { ...c, tempAttackBoost: 0, tempHpBoost: 0 };
    }));
    if (amuletEffects.hasLoneCard) {
      const bpLen = engine.getState().backpackItems.length;
      const loneAmulet = engine.getState().amuletSlots.find(s => s?.amuletEffect === 'lone-card');
      const loneThreshold = (loneAmulet?.upgradeLevel ?? 0) >= 1 ? 2 : 1;
      if (bpLen >= 1 && bpLen <= loneThreshold) {
        const loneDrawn = drawClassCardsToBackpack(1, '孤注之符');
        if (loneDrawn.length > 0) {
          triggerClassDeckFlight(loneDrawn);
          addGameLog('amulet', `孤注之符：背包仅剩 ${bpLen} 张牌，获得职业卡「${loneDrawn[0].name}」`);
        }
      }
    }

    const recycledCards = restorePermanentMagicFromRecycleBag();
    if (recycledCards > 0) {
      logWaterfall('recycle-restore', { restored: recycledCards });
    }

    let hasWraithEquipEnrage = false;
    for (const wsId of ['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]) {
      const wItem = wsId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (wItem && wItem.type === 'monster' && wItem.wraithTurnEnrage) {
        hasWraithEquipEnrage = true;
        break;
      }
    }
    if (hasWraithEquipEnrage) {
      const rowMonsters = activeCards.filter(
        (c): c is GameCardData => Boolean(c && c.type === 'monster' && !c.isStunned),
      );
      for (const m of rowMonsters) {
        if (!isMonsterEngaged(m.id)) {
          beginCombat(m, 'monster');
        }
      }
      if (rowMonsters.length > 0) {
        addGameLog('equip', '怨灵诅咒：瀑流时激活行所有怪物激怒！');
      }
      setMaxAmuletSlots(prev => prev + 1);
      addGameLog('equip', '怨灵诅咒：护符栏上限 +1！');
    }

    for (const gsId of ['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]) {
      const gItem = gsId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (gItem && gItem.type === 'monster' && gItem.golemSpellGrowth && gItem.golemSpellGrowth > 0 && gItem.golemLayerLossReflect) {
        const newCoeff = gItem.golemLayerLossReflect + gItem.golemSpellGrowth;
        setEquipmentSlotById(gsId, { ...gItem, golemLayerLossReflect: newCoeff });
        addGameLog('equip', `${gItem.name} 法力吞噬：瀑流强化，岩层反震系数 +${gItem.golemSpellGrowth}（当前 ${newCoeff}）`);
      }
    }

    if (permanentSkills.includes('幽魂净化')) {
      setWraithPassiveEnabled(true);
    }

    resetHeroSkillForNewWave();
  };

  // Waterfall mechanism - staged animation + dealing
  const triggerWaterfall = () => {
    if (waterfallLockRef.current || waterfallAnimation.isActive) {
      logWaterfall('trigger-blocked', {
        lock: waterfallLockRef.current,
        animActive: waterfallAnimation.isActive,
      });
      return;
    }

    waterfallLockRef.current = true;

    const releaseWaterfallLock = (reason: string) => {
      waterfallLockRef.current = false;
      logWaterfall('trigger-abort', { reason });
    };

    const baseEmptyColumns = getEmptyOrGhostColumns(activeCards);
    const forceCascade = cascadeResetWaterfallRef.current;

    if (forceCascade && baseEmptyColumns.length !== DUNGEON_COLUMN_COUNT) {
      releaseWaterfallLock('cascade-row-not-empty');
      queueWaterfallTimeout(triggerWaterfall, 50, 'cascade-reset-retry');
      return;
    }

    const cascadeFullDrop = forceCascade && baseEmptyColumns.length === DUNGEON_COLUMN_COUNT;
    const emptyColumns = cascadeFullDrop ? DUNGEON_COLUMNS : baseEmptyColumns;

    if (emptyColumns.length === 0) {
      releaseWaterfallLock('no-empty-slots');
      return;
    }

    const previewIndices = getFilledPreviewColumns(previewCards);
    const filledPreviewCount = previewIndices.length;
    const emptyColumnSet = new Set(emptyColumns);

    let dropAssignments: DungeonDropAssignment[] = [];
    const unusedPreview = new Set(previewIndices);

    if (cascadeFullDrop) {
      dropAssignments = previewIndices
        .map(previewIndex => {
          const card = previewCards[previewIndex];
          return card ? { previewIndex, card, slotIndex: previewIndex } : null;
        })
        .filter((assignment): assignment is DungeonDropAssignment => Boolean(assignment));
      unusedPreview.clear();
    } else {
      // Each preview card falls straight down to its own column if the slot below is empty;
      // if the slot below is occupied, the card is blocked.
      for (const previewIndex of previewIndices) {
        if (!emptyColumnSet.has(previewIndex)) continue;
        const card = previewCards[previewIndex];
        if (!card) continue;
        dropAssignments.push({ previewIndex, card, slotIndex: previewIndex });
        unusedPreview.delete(previewIndex);
      }

      // Late game: if preview has fewer than 5 cards and all blocked cards
      // can fit into remaining empty active slots, redirect them instead of discarding.
      if (unusedPreview.size > 0 && filledPreviewCount < DUNGEON_COLUMN_COUNT) {
        const usedSlots = new Set(dropAssignments.map(a => a.slotIndex));
        const remainingEmpty = emptyColumns.filter(col => !usedSlots.has(col)).sort((a, b) => a - b);
        if (remainingEmpty.length >= unusedPreview.size) {
          const blockedIndices = Array.from(unusedPreview).sort((a, b) => a - b);
          let emptyIdx = 0;
          for (const previewIndex of blockedIndices) {
            const card = previewCards[previewIndex];
            if (!card) continue;
            dropAssignments.push({ previewIndex, card, slotIndex: remainingEmpty[emptyIdx] });
            unusedPreview.delete(previewIndex);
            emptyIdx++;
          }
        }
      }
    }

    const dropCount = dropAssignments.length;

    logWaterfall('drop-plan', {
      emptySlots: emptyColumns,
      previewIndices,
      filledPreviewCount,
      dropCount,
      blockedPreview: Array.from(unusedPreview),
      previewSnapshot: previewIndices.map(index => previewCards[index]?.id ?? null),
      assignments: dropAssignments.map(({ previewIndex, slotIndex }) => ({
        previewIndex,
        slotIndex,
      })),
    });

    if (dropAssignments.length === 0 && previewIndices.length === 0 && remainingDeck.length === 0) {
      releaseWaterfallLock('no-preview-cards-no-deck');
      return;
    }

    waterfallPendingRef.current = false;
    const sequenceId = ++waterfallSequenceRef.current;
    applyWaterfallSideEffects(dropCount);

    logWaterfall('trigger', {
      emptySlots: emptyColumns,
      filledPreviewCount,
      dropCount,
      sequenceId,
      assignments: dropAssignments.map(({ previewIndex, slotIndex }) => ({ previewIndex, slotIndex })),
    });

    const dropPreviewIndices = dropAssignments.map(pair => pair.previewIndex);
    const dropTargetSlots = dropAssignments.map(pair => pair.slotIndex);
    const spawnTurn = turnCount + 1;
    const resolvedDropCards = dropAssignments.map(pair => applyMonsterRage(pair.card, spawnTurn));

    const remainingPreviewOrdered = Array.from(unusedPreview).sort((a, b) => b - a);
    // Never discard the final monster (future boss) — pick a different card
    const discardPreviewIndex =
      remainingPreviewOrdered.find(idx => !previewCards[idx]?.isFinalMonster) ?? null;
    const discardCard =
      discardPreviewIndex !== null ? previewCards[discardPreviewIndex] : null;

    // If the final monster is blocked but protected from discard, force-drop it
    if (discardPreviewIndex !== null) {
      unusedPreview.delete(discardPreviewIndex);
    }
    for (const blockedIdx of Array.from(unusedPreview)) {
      const card = previewCards[blockedIdx];
      if (!card?.isFinalMonster) continue;
      const usedSlots = new Set([
        ...dropAssignments.map(a => a.slotIndex),
        ...activeCards.map((c, i) => (c ? i : -1)).filter(i => i >= 0),
      ]);
      for (let slot = 0; slot < DUNGEON_COLUMN_COUNT; slot++) {
        if (!usedSlots.has(slot)) {
          dropAssignments.push({ previewIndex: blockedIdx, card, slotIndex: slot });
          unusedPreview.delete(blockedIdx);
          break;
        }
      }
    }

    const stuckFinalMonsters: GameCardData[] = [];
    for (const stuckIdx of Array.from(unusedPreview)) {
      const card = previewCards[stuckIdx];
      if (card?.isFinalMonster) {
        stuckFinalMonsters.push(card);
        unusedPreview.delete(stuckIdx);
        addGameLog('waterfall', `${card.name}（最终之敌）无法入场，返回牌堆顶等待决战`);
        setHeroSkillBanner(`${card.name} 隐入牌堆……终局之战尚未到来。`);
      }
    }

    const effectiveDeck = [...stuckFinalMonsters, ...remainingDeck];
    const baseDealCount = Math.min(DUNGEON_COLUMN_COUNT, effectiveDeck.length);
    const nextPreviewCards = effectiveDeck.slice(0, baseDealCount);
    let nextRemainingDeck = effectiveDeck.slice(baseDealCount);

    // Default +1 stack per waterfall + any waterfallDealBonus extra stacks
    // Monster cards are never stacked — they remain in the deck
    const newPreviewStacks: Record<number, GameCardData[]> = {};
    const defaultStackCount = 1;
    const totalBonusCount = defaultStackCount + waterfallDealBonus;
    if (totalBonusCount > 0 && nextRemainingDeck.length > 0 && nextPreviewCards.length > 0) {
      const bonusCards: GameCardData[] = [];
      const skippedCards: GameCardData[] = [];
      for (let di = 0; di < nextRemainingDeck.length && bonusCards.length < totalBonusCount; di++) {
        if (nextRemainingDeck[di].type === 'monster') {
          skippedCards.push(nextRemainingDeck[di]);
        } else {
          bonusCards.push(nextRemainingDeck[di]);
        }
      }
      const consumed = bonusCards.length + skippedCards.length;
      nextRemainingDeck = [...skippedCards, ...nextRemainingDeck.slice(consumed)];

      for (const bonusCard of bonusCards) {
        const nonMonsterIndices = nextPreviewCards
          .map((c, i) => (c && c.type !== 'monster' ? i : -1))
          .filter(i => i >= 0);
        if (nonMonsterIndices.length > 0) {
          const targetIdx = nonMonsterIndices[Math.floor(Math.random() * nonMonsterIndices.length)];
          if (!newPreviewStacks[targetIdx]) {
            newPreviewStacks[targetIdx] = [];
          }
          newPreviewStacks[targetIdx].push(bonusCard);
          addGameLog('waterfall', `瀑流堆叠：「${bonusCard.name}」堆叠在预览行第 ${targetIdx + 1} 列`);
        }
      }
    }

    const shouldDeclareVictory =
      nextPreviewCards.length === 0 && effectiveDeck.length === 0;

    const planDiscardCard = cascadeFullDrop ? null : discardCard;
    const planDiscardPreviewIndex = cascadeFullDrop ? null : discardPreviewIndex;
    const planDiscardDestination = getWaterfallPreviewDiscardDestination(planDiscardCard);

    waterfallPlanRef.current = {
      dropCards: resolvedDropCards,
      dropPreviewIndices,
      dropTargetSlots,
      discardCard: planDiscardCard,
      discardPreviewIndex: planDiscardPreviewIndex,
      discardDestination: planDiscardDestination,
      nextPreviewCards,
      nextRemainingDeck,
      shouldDeclareVictory,
    };
    pendingPreviewStacksRef.current = newPreviewStacks;
    cascadeResetWaterfallRef.current = false;

    setWaterfallAnimation({
      phase: resolvedDropCards.length > 0 ? 'dropping' : discardCard ? 'discarding' : 'dealing',
      isActive: true,
      droppingSlots: resolvedDropCards.length > 0 ? dropPreviewIndices : [],
      landingSlots: [],
      discardSlot: resolvedDropCards.length === 0 ? discardPreviewIndex : null,
      discardDestination: planDiscardDestination,
      dealingSlots: [],
      sequenceId,
    });

    if (resolvedDropCards.length > 0) {
      queueWaterfallTimeout(handleWaterfallDropComplete, animSpeed(WATERFALL_DROP_DURATION), 'drop-phase-timeout');
    } else if (discardCard) {
      queueWaterfallTimeout(handleWaterfallDiscardComplete, animSpeed(WATERFALL_DISCARD_DURATION), 'discard-phase-timeout');
    } else {
      startWaterfallDeal();
    }
  };

  // Remove card from active cards (add to graveyard automatically)
  const removeCard = (
    cardId: string,
    addToGraveyardAutomatically: boolean = true,
    options?: { skipAutoDraw?: boolean },
  ) => {
    logWaterfall('remove-request', {
      cardId,
      pendingBefore: pendingDungeonRemovalsRef.current,
    });
    // Find the card to add to graveyard if needed
    const slotIndex = findSlotIndexByCardId(activeCards, cardId);
    const cardToRemove = slotIndex >= 0 ? activeCards[slotIndex] : null;

    if (slotIndex === -1) {
      return;
    }

    const isRemovedCardBuglet = cardToRemove?.isBuglet === true;

    const willSwarmSpawn = !isRemovedCardBuglet && activeCards.some((c, i) =>
      c && i !== slotIndex && c.type === 'monster' && c.swarmSpawn && !c.isBuglet && !c.isStunned,
    );

    if (addToGraveyardAutomatically && cardToRemove) {
      discardCardToGraveyard(cardToRemove, { owner: 'dungeon' });
    }

    if (cardToRemove && !options?.skipAutoDraw && !willSwarmSpawn) {
      registerDungeonCardProcessed(cardToRemove.id, 'remove-card');
    }
    
    // Add card to removing set for animation
    setRemovingCards(prev => new Set(prev).add(cardId));
    
    // Delay actual removal for animation
    setTimeout(() => {
      let spawnedBuglet: GameCardData | null = null;
      let hordeRageTriggered = false;
      const hordeRageMonstersToEngage: GameCardData[] = [];
      setActiveCards(prev => {
        const index = findSlotIndexByCardId(prev, cardId);
        if (index === -1) {
          return prev;
        }

        const updated = [...prev];

        // Swarm passive: if a non-Buglet card is removed and Swarm monsters are present, spawn a Buglet (enraged)
        const hasSwarmMonster = updated.some((c, i) =>
          c && i !== index && c.type === 'monster' && c.swarmSpawn && !c.isBuglet && !c.isStunned,
        );
        if (hasSwarmMonster && !isRemovedCardBuglet) {
          const buglet = createBugletCard();
          updated[index] = buglet;
          spawnedBuglet = buglet;
          addGameLog('combat', `虫群效果：小虫子（激怒）在第 ${index + 1} 列生成！`);

          // Horde rage: if a swarm with swarmHordeRage exists and monster count ≥ 3, buff all unbuffed monsters
          const hordeSwarm = updated.find(c => c && c.swarmHordeRage && !c.isStunned);
          const monsterCount = updated.filter(c => c && c.type === 'monster').length;
          if (hordeSwarm && monsterCount >= 3) {
            const hasUnbuffed = updated.some(c => c && c.type === 'monster' && !c.swarmHordeBuffed);
            if (hasUnbuffed) {
              hordeRageTriggered = true;
              for (let k = 0; k < updated.length; k++) {
                const m = updated[k];
                if (!m || m.type !== 'monster') continue;
                if (!m.swarmHordeBuffed) {
                  updated[k] = {
                    ...m,
                    attack: (m.attack ?? m.value) + 3,
                    value: m.value + 3,
                    hp: (m.hp ?? 0) + 3,
                    maxHp: (m.maxHp ?? 0) + 3,
                    swarmHordeBuffed: true,
                  };
                }
                hordeRageMonstersToEngage.push(updated[k]!);
              }
              // Update spawnedBuglet reference to the buffed version
              spawnedBuglet = updated[index] as GameCardData;
              const monsterNames = updated.filter(c => c && c.type === 'monster').map(c => c!.name);
              addGameLog('combat', `${hordeSwarm.name} 虫群集结！激活行怪物≥3，所有怪物+3攻击+3血量！（${monsterNames.join('、')}）`);
            }
          }
        } else {
          // Stack pop: if there are stacked cards below, promote the top one
          // Read from engine state to avoid stale closure (e.g. Graveyard Amulet adds stacks after removeCard is called)
          const stack = engine.getState().activeCardStacks[index];
          if (stack && stack.length > 0) {
            const nextCard = stack[stack.length - 1];
            updated[index] = nextCard;
            setActiveCardStacks(prev => {
              const newStacks = { ...prev };
              const remaining = stack.slice(0, -1);
              if (remaining.length === 0) {
                delete newStacks[index];
              } else {
                newStacks[index] = remaining;
              }
              return newStacks;
            });
            addGameLog('system', `堆叠揭示：「${nextCard.name}」从第 ${index + 1} 列堆叠中浮现！`);
            if (nextCard.stolenByGoblin) {
              const drawn = drawFromBackpackToHand();
              if (drawn) {
                addGameLog('system', `窃牌归还：自动抽取「${drawn.name}」！`);
              }
            }
          } else {
            updated[index] = null;
          }
        }

        const remainingCount = countActiveRowSlotsExcludeGhost(updated);
        
        // Check if exactly 1 card remains - trigger waterfall (ghost cards don't count)
    if (remainingCount === 1) {
      waterfallPendingRef.current = true;
    } else if (remainingCount === 0) {
      if (remainingDeck.length === 0 && countActiveRowSlots(previewCards) === 0) {
            addGameLog('system', '胜利！地牢已被征服！');
            setVictory(true);
            setGameOver(true);
            setTotalWins(incrementTotalWins());
          }
        }
        
        return updated;
      });
      
      if (hordeRageTriggered) {
        setHeroSkillBanner(`虫群集结！全体怪物+3攻击+3血量！`);
        for (const m of hordeRageMonstersToEngage) {
          if (!isMonsterEngaged(m.id)) {
            beginCombatRef.current(m, 'monster');
          }
        }
      } else if (spawnedBuglet) {
        beginCombatRef.current(spawnedBuglet, 'monster');
      }

      // Clear from removing set
      setRemovingCards(prev => {
        const next = new Set(prev);
        next.delete(cardId);
        return next;
      });

      pendingDungeonRemovalsRef.current = Math.max(0, pendingDungeonRemovalsRef.current - 1);
      logWaterfall('remove-complete', {
        cardId,
        pendingAfter: pendingDungeonRemovalsRef.current,
        waterfallPending: waterfallPendingRef.current,
        lock: waterfallLockRef.current,
      });
      if (pendingDungeonRemovalsRef.current === 0 && waterfallPendingRef.current && !waterfallLockRef.current) {
        logWaterfall('waterfall-ready-post-removal', {
          pendingRemovals: pendingDungeonRemovalsRef.current,
          lock: waterfallLockRef.current,
        });
        // Defer to the main effect to fire the waterfall with fresh state.
      }
    }, 300);
    pendingDungeonRemovalsRef.current += 1;
    logWaterfall('remove-pending-increment', { pending: pendingDungeonRemovalsRef.current });
  };



  const wasDraggedFromHand = (cardId: string) =>
    draggedCardSource === 'hand' && draggedCard?.id === cardId;

  const isCardFromHand = (card: GameCardData | string) => {
    const cardId = typeof card === 'string' ? card : card.id;
    return handCards.some(c => c.id === cardId) || wasDraggedFromHand(cardId);
  };

  const consumeCardFromHand = (card: GameCardData | string): boolean => {
    const cardId = typeof card === 'string' ? card : card.id;
    const draggedFromHand = wasDraggedFromHand(cardId);
    const existsInHand = handCards.some(c => c.id === cardId);

    if (!existsInHand && !draggedFromHand) {
      return false;
    }

    // Cancel any pending delivery guard / flight fallback so the card
    // cannot be re-inserted into the hand after consumption.
    const guard = pendingHandDeliveryGuardsRef.current.get(cardId);
    if (guard?.timeoutId !== null && guard?.timeoutId !== undefined && typeof window !== 'undefined') {
      window.clearTimeout(guard.timeoutId);
    }
    pendingHandDeliveryGuardsRef.current.delete(cardId);
    clearBackpackHandFallback(cardId);

    handCardsRef.current = handCardsRef.current.filter(c => c.id !== cardId);
    setHandCards(prev => {
      const next = prev.filter(c => c.id !== cardId);
      handCardsRef.current = next;
      return next;
    });

    if (draggedFromHand) {
      setDraggedCard(null);
      setDraggedCardSource(current => (current === 'hand' ? null : current));
    }
    return true;
  };



  useEffect(() => {
    const activeCount = countActiveRowSlotsExcludeGhost(activeCards);
    const emptySlots = DUNGEON_COLUMN_COUNT - activeCount;
    const shouldCascade = emptySlots >= 4;

    logWaterfall('active-change', {
      activeCount,
      emptySlots,
      shouldCascade,
      pendingRemovals: pendingDungeonRemovalsRef.current,
      waterfallPending: waterfallPendingRef.current,
      lock: waterfallLockRef.current,
      animActive: waterfallAnimation.isActive,
    });

    if (!shouldCascade) {
      if (waterfallPendingRef.current) {
        logWaterfall('waterfall-pending-reset', { reason: 'threshold-not-met' });
      }
      waterfallPendingRef.current = false;
      return;
    }

    if (!waterfallPendingRef.current) {
      waterfallPendingRef.current = true;
      logWaterfall('waterfall-pending-set', { emptySlots });
    }

    if (
      waterfallPendingRef.current &&
      pendingDungeonRemovalsRef.current === 0 &&
      !waterfallLockRef.current &&
      !waterfallAnimation.isActive
    ) {
      logWaterfall('waterfall-trigger-from-effect', { emptySlots });
      waterfallPendingRef.current = false;
      triggerWaterfall();
    }
  }, [activeCards, waterfallAnimation.isActive, triggerWaterfall, resolvingDungeonCardId]);

  function handleSellCard(item: any) {
    pushUndoSnapshot();
    const itemType = item.type as CardType;

    // Only allow selling defined card types
    if (!isSellableType(itemType) || item.isCurse) {
      return;
    }
    
    addGameLog('shop', `弃置 ${item.name}`);

    const sellItem = item as GameCardData & { fromSlot?: string };
    const slotFromCard = normalizeHeroEquipmentSlotFromDrag(sellItem.fromSlot);
    const slotFromDragSession = normalizeHeroEquipmentSlotFromDrag(
      typeof draggedCardSource === 'string' ? draggedCardSource : null,
    );
    const immediateOrigin: DragOrigin | null =
      sellItem.fromSlot === 'amulet'
        ? 'amulet'
        : slotFromCard
          ? slotFromCard
          : draggedCardSource === 'amulet'
            ? 'amulet'
            : slotFromDragSession
              ? slotFromDragSession
              : draggedCardSource === 'hand' ||
                  draggedCardSource === 'backpack' ||
                  draggedCardSource === 'dungeon'
                ? draggedCardSource
                : null;

    const fallbackOrigin: DragOrigin | null =
      immediateOrigin ??
      (amuletSlots.some(slot => slot?.id === sellItem.id)
        ? 'amulet'
        : equipmentSlot1?.id === sellItem.id
          ? 'equipmentSlot1'
          : equipmentSlot2?.id === sellItem.id
            ? 'equipmentSlot2'
            : handCards.some(c => c.id === sellItem.id)
              ? 'hand'
              : backpackItems.some(c => c.id === sellItem.id)
                ? 'backpack'
                : null);

    const sanitizedCard = sanitizeCardMetadata(sellItem);
    discardCardToGraveyard(sanitizedCard, { owner: 'player' });

    switch (fallbackOrigin) {
      case 'equipmentSlot1':
      case 'equipmentSlot2':
        clearEquipmentSlotWithPromote(fallbackOrigin);
        break;
      case 'amulet':
        if (sellItem.amuletEffect === 'balance') {
          setSlotTempAttack(prev => ({
            equipmentSlot1: (prev.equipmentSlot1 ?? 0) - BALANCE_ATTACK_BONUS,
            equipmentSlot2: (prev.equipmentSlot2 ?? 0) + BALANCE_ATTACK_PENALTY,
          }));
          setSlotTempArmor(prev => ({
            equipmentSlot1: (prev.equipmentSlot1 ?? 0) + BALANCE_SHIELD_PENALTY,
            equipmentSlot2: (prev.equipmentSlot2 ?? 0) - BALANCE_SHIELD_BONUS,
          }));
        }
        if (sellItem.amuletEffect === 'strength') {
          setSlotTempAttack(prev => ({
            equipmentSlot1: (prev.equipmentSlot1 ?? 0) - 4,
            equipmentSlot2: (prev.equipmentSlot2 ?? 0) - 4,
          }));
        }
        setAmuletSlots(prev => prev.filter(slot => slot?.id !== sellItem.id));
        break;
      case 'hand':
        consumeCardFromHand(sellItem);
        tickRecycleForge();
        break;
      case 'backpack':
        setBackpackItems(prev => prev.filter(c => c.id !== sellItem.id));
        break;
      default:
      // Item from dungeon - use removeCard to properly trigger waterfall (don't add to graveyard again)
        removeCard(sellItem.id, false);
      setCardsPlayed(prev => prev + 1);
        break;
    }

    resetDragState();
  };



  // Populate combatActions deps ref (all function deps are now defined)
  combatDepsRef.current = {
    addToGraveyard,
    discardCardToGraveyard,
    disposeOwnedEquipmentCard,
    addCardToBackpack,
    drawFromBackpackToHand,
    drawFromRecycleBagToHand,
    drawClassCardsToBackpack,
    triggerClassDeckFlight,
    getEquipmentSlots,
    calculateSlotArmorValue,
    setEquipmentSlotBonus,
    getEquipmentSlotBonus,
    setEquipmentSlotById,
    clearEquipmentSlotWithPromote,
    isRecyclableFromHand,
    triggerEventTransform,
    amuletEffects,
    attackBonus,
    defenseBonus,
    addGameLog,
    triggerHeroBleedAnimation,
    triggerMonsterBleedAnimation,
    triggerMonsterHealAnimation,
    triggerWeaponSwingAnimation,
    triggerShieldBlockAnimation,
    tryStartShieldReflectDirectedFx,
    tryStartBossRetaliationDirectedFx,
    tryStartGolemLayerReflectFx,
    tryStartArcaneBladeSpellFx,
    animSpeed,
    requestDiceOutcome,
    addHeroMagicGauge,
    triggerGhostBladeExile,
    requestCardAction,
    queueMonsterReward,
    removeCard,
    pushUndoSnapshot,
    clearUndoStack,
    clearUndoStorage,
    isMonsterEngaged,
    findDeathWardCard,
    consumeCardFromHand,
    consumeClassCardFromHand,
    finalizeMagicCard,
    triggerDiscardFlight,
    triggerStealCardFlight,
    dragonBleedDestroyEquipment,
    beginDiscoverFlow,
    beginDiscoverFlowAsync,
    requestDaggerSelfDestruct,
    combatAsyncEpochRef,
    pendingDefeatIdsRef,
    goblinStolenIdsRef,
    heroTurnLayerLossIdsRef,
    heroTookDamageThisMonsterTurnRef,
    monsterBleedTimeoutsRef,
    activeCardsLatestRef,
    fullBoardInteractionLockedRef,
    handLockedForMonsterPhaseRef,
    suppressDeathWardRef,
    selectedHeroSkillRef,
    eternalRelicsRef,
    handCardsRef,
    endHeroTurnGuardRef,
    beginCombatRef,
    bulwarkTempArmorRef,
    persuadeAmuletBonusRef,
    persuadeDiscountRef,
    computePersuadeSuccessRate,
    setPersuadeTempDiscount,
    undoStackRef,
    setUndoCount,
    setMonsterDefeatStates,
    setMonsterBleedStates,
    setHealing,
    setTakingDamage,
    selectedCard,
    handleMagicMonsterSelection,
    handleHolyLightMonsterCleanse,
    handleHeroSkillMonsterSelection,
  };

  // Populate shopHandlers deps ref (all function deps are now defined)
  shopDepsRef.current = {
    addToGraveyard,
    addCardToBackpack,
    returnCardsToClassDeck,
    ensureCardInHand,
    discardCardToGraveyard,
    addPermanentMagicToRecycleBag,
    applyDiscardSideEffects,
    isRecyclableFromHand,
    drawClassCardsToBackpack,
    drawFromBackpackToHand,
    setEquipmentSlotBonus,
    backpackCapacity,
    effectiveHandLimit,
    healHero,
    addGameLog,
    pushUndoSnapshot,
    clearUndoStack,
    triggerClassDeckFlight,
    triggerDiscardFlight,
    completeCurrentEvent,
    getMonsterRewardsPreview,
    repairEquipmentDurability,
    drawCardsFromBackpack,
    consumeCardFromHand,
    maxHp,
    cardActionResolverRef,
    cardActionRemainingRef,
    deletingCardIdsRef,
    monsterRewardQueuedInstanceIdsRef,
    discardedCardsRef,
    backpackHandFlightsRef,
    graveyardDiscoverResolverRef,
    graveyardDiscoverDeliveryRef,
    ghostBladeExileResolverRef,
    discoverPotionCompletionRef,
    onNewCardGainedRef,
    persuadeAmuletBonusRef,
  };

  // Populate cardPlayHandlers deps ref (all function deps are now defined)
  cardPlayDepsRef.current = {
    addToGraveyard,
    discardCardToGraveyard,
    addCardToBackpack,
    addPermanentMagicToRecycleBag,
    restorePermanentMagicFromRecycleBag,
    ensureCardInHand,
    drawFromBackpackToHand,
    takeRandomCardsFromBackpack,
    drawClassCardsToBackpack,
    getEquipmentSlots,
    calculateSlotArmorValue,
    setEquipmentSlotBonus,
    getEquipmentSlotBonus,
    setEquipmentSlotById,
    clearEquipmentSlotById,
    clearEquipmentSlotWithPromote,
    getEquipmentReserve,
    setEquipmentReserve,
    isRecyclableFromHand,
    tickRecycleForge,
    applyDiscardSideEffects,
    triggerEventTransform,
    applyCardFlip,
    enforceBackpackCapacity,
    amuletEffects,
    backpackCapacity,
    effectiveHandLimit,
    consumeClassCardFromHand,
    healHero,
    applyDamage,
    beginCombat,
    dealDamageToMonster,
    updateMonsterCard,
    isMonsterEngaged,
    addBerserkTurnBuff,
    requestCardAction,
    beginDiscoverFlow,
    generateShopOfferings,
    queueMonsterReward,
    addGameLog,
    pushUndoSnapshot,
    clearUndoStack,
    removeCard,
    queueCardIntoHand,
    triggerDiscardFlight,
    triggerClassDeckFlight,
    triggerGraveNova,
    triggerWaterfall,
    applyWaterfallSideEffects,
    queueWaterfallTimeout,
    consumeCardFromHand,
    requestDiceOutcome,
    requestMagicChoice,
    requestEquipmentSelection,
    stagingCardsRef,
    drainPendingDiscardEffects,
    handCardsRef,
    backpackHandFlightsRef,
    discardedCardsRef,
    activeCardsLatestRef,
    cascadeResetWaterfallRef,
    echoRemainingRef,
    echoTotalRef,
    graveyardDiscoverResolverRef,
    graveyardDiscoverDeliveryRef,
    fullBoardInteractionLockedRef,
    handLockedForMonsterPhaseRef,
    persuadeDiscountRef,
    persuadeAmuletBonusRef,
    setPersuadeTempDiscount,
    setDeckPeekState,
    openHandMagicUpgradeModal: (sourceCardId: string) => {
      setHandMagicUpgradeModal({ sourceCardId });
    },
    openMirrorCopyModal: (sourceCardId: string) => {
      setMirrorCopyModal({ sourceCardId });
    },
    discoverPotionCompletionRef,
    deckJudgePeekCloseRef,
    getAttackBonus: () => attackBonus,
    applyHonorSweepMagic,
    applyWeaponSweepMagic,
    lastPlayedFlankRef,
  };

  // Populate heroActions deps ref (all function deps are now defined)
  heroActionsDepsRef.current = {
    discardCardToGraveyard,
    ensureCardInHand,
    drawFromBackpackToHand,
    drawClassCardsToBackpack,
    getEquipmentSlots,
    calculateSlotArmorValue,
    setEquipmentSlotBonus,
    getEquipmentSlotBonus,
    setEquipmentSlotById,
    clearEquipmentSlotById,
    getEquipmentReserve,
    setEquipmentReserve,
    disposeOwnedEquipmentCard,
    addPermanentMagicToRecycleBag,
    amuletEffects,
    eternalRelicsRef,
    healHero,
    applyDamage,
    beginCombat,
    dealDamageToMonster,
    updateMonsterCard,
    isMonsterEngaged,
    requestCardAction,
    requestGraveyardSelection,
    getSpellDamage,
    requestDiceOutcome,
    getAttackBonus: () => attackBonus,
    updateHeroMagicStateById,
    completeHeroMagicActivation,
    applyBerserkerRageEffect,
    finalizeMagicCard,
    finalizePotionCard,
    resolvePotionRepairForSlot,
    chaosStrikeHasOverkill,
    drawCardsFromBackpack,
    resolveFateSight,
    resolveStatSwap,
    resolveRepairEnrageDice,
    addGameLog,
    pushUndoSnapshot,
    clearUndoStack,
    removeCard,
    triggerClassDeckFlight,
    triggerFateSwapFlight,
    clearAllBackpackHandFallbacks,
    setHeroSkillArrow,
    setPersuadeRollKey,
    waterfallActive,
    fullBoardInteractionLockedRef,
    echoRemainingRef,
    echoTotalRef,
    persuadeDiscountRef,
    persuadeAmuletBonusRef,
    setPersuadeTempDiscount,
    activeCardsLatestRef,
  };

  eventSystemDepsRef.current = {
    discardCardToGraveyard,
    drawFromBackpackToHand,
    drawClassCardsToBackpack,
    getEquipmentSlots,
    setEquipmentSlotBonus,
    setEquipmentSlotById,
    clearEquipmentSlotById,
    getEquipmentReserve,
    setEquipmentReserve,
    disposeOwnedEquipmentCard,
    addPermanentMagicToRecycleBag,
    amuletEffects,
    addToGraveyard,
    addCardToBackpack,
    triggerEventTransform,
    applyCardFlip,
    sacrificeEquipment,
    sacrificeAllEquipment,
    swapEquipmentSlots,
    convertAmuletsToGold,
    discardAllHandCards,
    isRecyclableFromHand,
    healHero,
    applyDamage,
    beginCombat,
    updateMonsterCard,
    isMonsterEngaged,
    damageMonsterWithLayerOverflow,
    checkHollowSkeletonRestore,
    checkWraithRebirth,
    handleMonsterDefeated,
    recordClassDamageDiscoverHit,
    requestCardAction,
    requestGraveyardSelection,
    startShopFlow,
    beginDiscoverFlow,
    beginDiscoverFlowAsync,
    handleDiscoverFallback,
    handleCardUpgrade,
    normalizeEventEffect,
    handleSkillCard,
    drawCardsFromBackpack,
    queueCardIntoHand,
    addHeroMagicGauge,
    addGameLog,
    pushUndoSnapshot,
    clearUndoStack,
    removeCard,
    triggerClassDeckFlight,
    triggerMonsterBleedAnimation,
    dragonBleedDestroyEquipment,
    createCurseCard,
    triggerDiscardFlight,
    setEventDiceRollKey,
    eventResolutionRef,
    eventChoiceProcessingRef,
    skipNextEventAutoDrawRef,
    backpackHandFlightsRef,
    heroTurnLayerLossIdsRef,
    bulwarkTempArmorRef,
    handCardsRef,
    persuadeDiscountRef,
    persuadeAmuletBonusRef,
    setPersuadeTempDiscount,
  };

  function handleCardToHero(card: GameCardData) {
    if (fullBoardInteractionLockedRef.current) return;
    pushUndoSnapshot();
    if (isCardFromEquipmentSlot(card)) {
      // Equipped items can only attack monsters or be discarded.
      return;
    }
    if (isEquipmentCard(card)) {
      return; // equipment cannot be played directly on hero
    }
    // Check if card is from hand (play normally) or from dungeon (purchase)
    const isFromHand = isCardFromHand(card);
    const isFromBackpack = backpackItems.some(backpackCard => backpackCard.id === card.id);

    // Route spent hand cards to graveyard/recycle immediately after play
    const recordHandCardConsumption = (spentCard: GameCardData) => {
      if (spentCard.type === 'potion') {
        addToGraveyard(spentCard);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            sessionId:'debug-session',
            runId:'run3',
            hypothesisId:'M',
            location:'GameBoard.tsx:recordHandCardConsumption',
            message:'Potion routed to graveyard',
            data:{cardId:spentCard.id, cardType:spentCard.type},
            timestamp:Date.now()
          })
        }).catch(()=>{});
        // #endregion
        return;
      }
      if (spentCard.type === 'magic' || spentCard.type === 'hero-magic') {
        // Routing handled exclusively by handleSkillCard / finalizeMagicCard
        // to avoid double graveyard/recycle-bag insertions.
        return;
      }
      if (spentCard.type === 'event') {
        addToGraveyard(spentCard);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            sessionId:'debug-session',
            runId:'run3',
            hypothesisId:'M',
            location:'GameBoard.tsx:recordHandCardConsumption',
            message:'Event routed to graveyard',
            data:{cardId:spentCard.id, cardType:spentCard.type},
            timestamp:Date.now()
          })
        }).catch(()=>{});
        // #endregion
      }
    };
    
    if (isFromHand) {
      const handArr = handCardsRef.current;
      const flankIdx = handArr.findIndex(c => c.id === card.id);
      lastPlayedFlankRef.current = flankIdx >= 0 && (flankIdx === 0 || flankIdx === handArr.length - 1);

      if (!consumeCardFromHand(card)) {
        resetDragState();
        return;
      }

      if (card.type === 'building') {
        const emptySlots: number[] = [];
        for (let i = 0; i < DUNGEON_COLUMN_COUNT; i++) {
          if (activeCards[i] == null) emptySlots.push(i);
        }
        if (emptySlots.length > 0) {
          const targetSlot = emptySlots[Math.floor(Math.random() * emptySlots.length)];
          setActiveCards(prev => {
            const next = [...prev] as typeof prev;
            next[targetSlot] = { ...card, hasReleaseCharge: true, _fateBladeLastSlot: targetSlot };
            return next;
          });
          addGameLog('event', `${card.name} 被放置到地城第 ${targetSlot + 1} 列。`);
          if (card.name === '命运之刃') {
            applyDamage(5, 'general', { selfInflicted: true });
            addGameLog('event', '命运之刃：从手牌打出，失去 5 点生命。');
            setHeroSkillBanner(`${card.name} 出现在地城中！失去 5 点生命。`);
          } else {
            setHeroSkillBanner(`${card.name} 出现在地城中！`);
          }
        } else {
          discardCardToGraveyard(card, { owner: 'player' });
          addGameLog('event', `${card.name}：地城没有空位，已送入坟场。`);
          setHeroSkillBanner(`地城没有空位，${card.name} 已送入坟场。`);
        }
        resetDragState();
        return;
      }

      recordHandCardConsumption(card);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          sessionId:'debug-session',
          runId:'run3',
          hypothesisId:'N',
          location:'GameBoard.tsx:handleCardToHero',
          message:'Hand card consumed',
          data:{
            cardId:card.id,
            cardType:card.type,
            heroFrameDropIntent:heroFrameDropIntentRef.current
          },
          timestamp:Date.now()
        })
      }).catch(()=>{});
      // #endregion

      tickRecycleForge();

      if (lastPlayedFlankRef.current && card.flankDraw) {
        for (let i = 0; i < card.flankDraw; i++) {
          drawFromBackpackToHand();
        }
        addGameLog('magic', `侧击效果：${card.name} 抽取 ${card.flankDraw} 张牌`);
        setHeroSkillBanner(`侧击！${card.name} 抽取了 ${card.flankDraw} 张牌。`);
      }

      if (lastPlayedFlankRef.current && card.flankEffectId) {
        if (card.flankEffectId.startsWith('persuadeCost-')) {
          const amount = parseInt(card.flankEffectId.replace('persuadeCost-', ''), 10) || 1;
          setPersuadeCostModifier(prev => prev - amount);
          addGameLog('event', `侧击效果：${card.name} 劝降费用永久 -${amount}`);
          setHeroSkillBanner(`侧击！${card.name} 劝降费用永久 -${amount}！`);
        } else if (card.flankEffectId.startsWith('stunCap+')) {
          const amount = parseInt(card.flankEffectId.replace('stunCap+', ''), 10) || 5;
          setStunCap(prev => Math.min(100, prev + amount));
          addGameLog('event', `侧击效果：${card.name} 击晕上限 +${amount}%`);
          setHeroSkillBanner(`侧击！${card.name} 击晕上限 +${amount}%！`);
        } else if (card.flankEffectId.startsWith('damage:')) {
          const amount = parseInt(card.flankEffectId.replace('damage:', ''), 10) || 5;
          const monsters = flattenActiveRowSlots(activeCardsLatestRef.current).filter(
            (c): c is GameCardData => Boolean(c && c.type === 'monster'),
          );
          if (monsters.length > 0) {
            const target = monsters[Math.floor(Math.random() * monsters.length)];
            dealDamageToMonster(target, amount);
            addGameLog('event', `侧击效果：${card.name} 对 ${target.name} 造成 ${amount} 点伤害`);
            setHeroSkillBanner(`侧击！${card.name} 对 ${target.name} 造成了 ${amount} 点伤害！`);
          } else {
            addGameLog('event', `侧击效果：${card.name} 没有可攻击的怪物`);
            setHeroSkillBanner(`侧击！但没有可攻击的怪物。`);
          }
        }
      }

      if (card.type === 'monster') {
        resetDragState();
        return;
      } else if (card.type === 'potion') {
        void handlePotionConsumption(card);
      } else if (card.type === 'magic' || card.type === 'hero-magic') {
        handleSkillCard(card);
      } else if (card.type === 'event') {
        startEventResolution(null, 'hand');
        const cleanedCard = card.eventChoices
          ? { ...card, eventChoices: card.eventChoices.filter(c => c.effect !== 'crossroads-destroy-below') }
          : card;
        setCurrentEventCard(cleanedCard);
        eventChoiceProcessingRef.current = false;
        setEventModalOpen(true);
        resetDragState();
        return;
      }
    } else {
      if (isFromBackpack) {
        setBackpackItems(prev => prev.filter(c => c.id !== card.id));

        if (card.type === 'building') {
          const emptySlots: number[] = [];
          for (let i = 0; i < DUNGEON_COLUMN_COUNT; i++) {
            if (activeCards[i] == null) emptySlots.push(i);
          }
          if (emptySlots.length > 0) {
            const targetSlot = emptySlots[Math.floor(Math.random() * emptySlots.length)];
            setActiveCards(prev => {
              const next = [...prev] as typeof prev;
              next[targetSlot] = { ...card, hasReleaseCharge: true, _fateBladeLastSlot: targetSlot };
              return next;
            });
            addGameLog('event', `${card.name} 被放置到地城第 ${targetSlot + 1} 列。`);
            setHeroSkillBanner(`${card.name} 出现在地城中！`);
          } else {
            discardCardToGraveyard(card, { owner: 'player' });
            addGameLog('event', `${card.name}：地城没有空位，已送入坟场。`);
            setHeroSkillBanner(`地城没有空位，${card.name} 已送入坟场。`);
          }
          resetDragState();
          return;
        }

        if (card.type === 'potion') {
          void handlePotionConsumption(card);
        } else if (card.type === 'magic' || card.type === 'hero-magic') {
          handleSkillCard(card);
        } else if (card.type === 'event') {
          startEventResolution(null, 'hand');
          const cleanedCard = card.eventChoices
            ? { ...card, eventChoices: card.eventChoices.filter(c => c.effect !== 'crossroads-destroy-below') }
            : card;
          setCurrentEventCard(cleanedCard);
          eventChoiceProcessingRef.current = false;
          setEventModalOpen(true);
          resetDragState();
          return;
        }
        resetDragState();
        return;
      }
      // Purchasing from dungeon - auto-equip/use
      if (card.type === 'potion') {
        void handlePotionConsumption(card);
        removeCard(card.id, false);
      } else if (card.type === 'magic' || card.type === 'hero-magic') {
        handleSkillCard(card);
        removeCard(card.id, false);
      } else if (card.type === 'event' || (card.type === 'building' && card.eventChoices)) {
        const freshBladeCard =
          (card.name === '命运之刃' || card.name === '增幅祭坛')
            ? activeCards.find(c => c?.id === card.id) ?? card
            : card;
        if (card.name === '命运之刃' && !freshBladeCard.hasReleaseCharge) {
          setHeroSkillBanner('命运之刃暂无释放次数。');
          resetDragState();
          return;
        }
        if (card.name === '增幅祭坛' && !freshBladeCard.hasReleaseCharge) {
          setHeroSkillBanner('增幅祭坛暂无释放次数。');
          resetDragState();
          return;
        }
        let eventCard = card;
        if (card.name === '命运十字路口') {
          const currentIdx = activeCards.findIndex(c => c?.id === card.id);
          if (currentIdx > 0) {
            let targetIdx = currentIdx;
            for (let i = currentIdx - 1; i >= 0; i--) {
              if (activeCards[i] != null) break;
              targetIdx = i;
            }
            if (targetIdx !== currentIdx) {
              setActiveCards(prev => {
                const next = [...prev] as ActiveRowSlots;
                next[targetIdx] = prev[currentIdx];
                next[currentIdx] = null;
                return next;
              });
              addGameLog('event', `命运十字路口向左平移至第 ${targetIdx + 1} 列`);
            }
          }
          const finalIdx = (() => {
            const idx = activeCards.findIndex(c => c?.id === card.id);
            if (idx <= 0) return idx;
            let t = idx;
            for (let i = idx - 1; i >= 0; i--) {
              if (activeCards[i] != null) break;
              t = i;
            }
            return t;
          })();
          const belowMapping: Record<number, { type: 'equipment'; slotId: EquipmentSlotId } | { type: 'amulet' } | null> = {
            0: { type: 'amulet' },
            1: { type: 'equipment', slotId: 'equipmentSlot1' },
            2: null,
            3: { type: 'equipment', slotId: 'equipmentSlot2' },
            4: null,
          };
          const below = finalIdx >= 0 ? belowMapping[finalIdx] ?? null : null;
          let canDestroy = false;
          let destroyLabel = '';
          if (below?.type === 'equipment') {
            const slotItem = below.slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
            if (slotItem) {
              canDestroy = true;
              destroyLabel = `破坏下方装备「${slotItem.name}」，获得全部效果`;
            }
          } else if (below?.type === 'amulet') {
            if (amuletSlots.length > 0) {
              canDestroy = true;
              destroyLabel = `破坏下方护符「${amuletSlots[amuletSlots.length - 1].name}」，获得全部效果`;
            }
          }
          if (canDestroy && card.eventChoices) {
            eventCard = {
              ...card,
              eventChoices: [
                ...card.eventChoices,
                {
                  text: destroyLabel,
                  effect: 'crossroads-destroy-below',
                  hint: '破坏正下方的装备或护符，同时获得其余显示选项的全部效果',
                },
              ],
            };
          }
        }
        if (eventCard.name === '墓语密室' && eventCard.eventChoices) {
          const cryptIdx = activeCards.findIndex(c => c?.id === eventCard.id);
          const leftCard = cryptIdx > 0 ? activeCards[cryptIdx - 1] : null;
          const rightCard = cryptIdx >= 0 && cryptIdx < DUNGEON_COLUMN_COUNT - 1 ? activeCards[cryptIdx + 1] : null;
          const bothMonsters = leftCard?.type === 'monster' && rightCard?.type === 'monster';
          const reasonParts: string[] = [];
          if (!leftCard || leftCard.type !== 'monster') reasonParts.push('左侧不是怪物');
          if (!rightCard || rightCard.type !== 'monster') reasonParts.push('右侧不是怪物');
          if (bothMonsters) {
            const flipTarget = {
              toCard: {
                id: `${eventCard.id}-flip-crypt-echo`,
                type: 'magic' as const,
                name: '墓语回响',
                value: 0,
                image: skillScrollImage,
                magicType: 'permanent' as const,
                magicEffect: '永久魔法：使用时回复 3 点生命。被弃置时从背包抽 3 张牌。',
                description: '使用时回复 3 点生命。被弃置时从背包抽 3 张牌。',
                onDiscardDraw: 3,
              },
              destination: 'backpack' as const,
              banner: '墓语密室翻转为「墓语回响」，已放入背包。',
            };
            eventCard = {
              ...eventCard,
              flipTarget,
              eventChoices: [...eventCard.eventChoices],
            };
          } else {
            const altFlipTarget = {
              toCard: {
                id: `${eventCard.id}-flip-crypt-deathwish`,
                type: 'magic' as const,
                name: '墓语遗愿',
                value: 0,
                image: skillScrollImage,
                magicType: 'permanent' as const,
                magicEffect: 'crypt-deathwish',
                description: '永久魔法（Perm 2）：选择一个装备，触发其遗言效果，抽 1 张牌。',
                recycleDelay: 2,
              },
              destination: 'backpack' as const,
              banner: '墓语密室翻转为「墓语遗愿」，已放入背包。',
            };
            eventCard = {
              ...eventCard,
              flipTarget: altFlipTarget,
              eventChoices: [...eventCard.eventChoices],
            };
          }
        }
        startEventResolution(eventCard.id, 'dungeon');
        setCurrentEventCard(eventCard);
        eventChoiceProcessingRef.current = false;
        setEventModalOpen(true);
        resetDragState();
        return;
      } else if (card.type === 'monster') {
        if (isMonsterEngaged(card.id) && combatState.currentTurn === 'hero') {
          resetDragState();
          return;
        }
        beginCombat(card, 'monster');
      } else {
        // Other card types go to backpack
        if (canCardGoToBackpack(card) && backpackItems.length < backpackCapacity) {
          const isDungeonCard = activeCards.some(slotCard => slotCard?.id === card.id);
          addCardToBackpack(card, {
            pendingDungeonCardId: isDungeonCard ? card.id : undefined,
          });
          removeCard(card.id, false);
        } else {
    // // toast({ 
            // title: 'Backpack Full!', 
            // description: 'Cannot store more items',
            // variant: 'destructive'
          // });
        }
      }
    }
    resetDragState();
  };
  handleCardToHeroRef.current = handleCardToHero;

  const isEquipmentCard = (card: GameCardData) =>
    (EQUIPMENT_TYPES as readonly CardType[]).includes(card.type);
  const isConsumableCard = (card: GameCardData) =>
    (CONSUMABLE_TYPES as readonly CardType[]).includes(card.type);
  const canCardGoToBackpack = (card: GameCardData) => {
    if (card.type === 'event') return false;
    if (card.type === 'building') return false;
    if (card.type === 'monster') return false;
    return true;
  };
  const canCardDropOnHero = (card: GameCardData | null, source?: DragOrigin | null) => {
    if (!card) return false;
    if (card.type === 'monster') {
      if (source === 'hand' || source === 'backpack') return false;
      if (isMonsterEngaged(card.id) && combatState.currentTurn === 'hero') return false;
      return true;
    }
    if (isConsumableCard(card)) return true;
    if (card.type === 'event') return true;
    if (card.type === 'building') return true;
    return false;
  };
  const isSellableType = (type: CardType) => (SELLABLE_TYPES as readonly CardType[]).includes(type);
  const isCardFromEquipmentSlot = (
    card: GameCardData | null | undefined,
  ): card is GameCardData & { fromSlot: EquipmentSlotId } => {
    if (!card) {
      return false;
    }
    const origin = (card as GameCardData & { fromSlot?: string }).fromSlot;
    return Boolean(normalizeHeroEquipmentSlotFromDrag(origin));
  };

  const handlePersuadeDiceResult = (value: number) => {
    if (!persuadeState) return;
    const success = value >= persuadeState.threshold;
    setPersuadeState(prev => prev ? { ...prev, phase: 'result', diceValue: value, success } : null);

    // Regardless of success or failure, un-engage the monster (remove enraged state)
    if (isMonsterEngaged(persuadeState.monster.id)) {
      setCombatState(prev => {
        const remaining = prev.engagedMonsterIds.filter(id => id !== persuadeState.monster.id);
        if (remaining.length === 0) return { ...initialCombatState };
        return { ...prev, engagedMonsterIds: remaining };
      });
      addGameLog('combat', `${persuadeState.monster.name} 被劝降后恢复了平静（解除激怒）。`);
    }

    if (success) {
      const { monster, targetSlot } = persuadeState;
      const monsterAttack = monster.attack ?? monster.value;
      const monsterArmor = monster.hp ?? monster.value;
      const durabilityBonus = engine.getState().persuadeSuccessDurabilityBonus ?? 0;
      const monsterMaxDurability = (monster.hpLayers ?? monster.fury ?? 1) + durabilityBonus;

      if (targetSlot === 'backpack') {
        const persuadedCard: GameCardData = {
          ...monster,
          durability: monsterMaxDurability,
          maxDurability: monsterMaxDurability,
        };
        addCardToBackpack(persuadedCard, { pendingDungeonCardId: monster.id });
        removeCard(monster.id, false);
        addGameLog('combat', `劝降成功！${monster.name} 加入背包（${monsterAttack}攻 / ${monsterArmor}防 / ${monsterMaxDurability}耐久）`);
        setHeroSkillBanner(`劝降成功！${monster.name} 已加入背包！`);
      } else {
        const equipSlot = targetSlot;
        const equippedItem = equipSlot === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        const reserve = getEquipmentReserve(equipSlot);
        const slotCap = equipmentSlotCapacity[equipSlot] ?? 1;
        const totalEquipped = (equippedItem ? 1 : 0) + reserve.length;

        if (totalEquipped < slotCap) {
          if (equippedItem) {
            setEquipmentReserve(equipSlot, [...reserve, equippedItem]);
          }
        } else if (equippedItem) {
          if (reserve.length > 0) {
            disposeOwnedEquipmentCard(reserve[0]);
            addGameLog('equip', `卸下 ${reserve[0].name}`);
            const newReserve = reserve.slice(1);
            setEquipmentReserve(equipSlot, [...newReserve, equippedItem]);
          } else {
            disposeOwnedEquipmentCard(equippedItem);
            addGameLog('equip', `卸下 ${equippedItem.name}`);
          }
        }

        const equipCard: EquipmentItem = {
          ...monster,
          type: 'monster' as const,
          value: monsterAttack,
          attack: monsterAttack,
          hp: monsterArmor,
          durability: monsterMaxDurability,
          maxDurability: monsterMaxDurability,
        } as EquipmentItem;
        setEquipmentSlotById(equipSlot, equipCard);
        removeCard(monster.id, false);
        addGameLog('combat', `劝降成功！装备 ${monster.name}（${monsterAttack}攻 / ${monsterArmor}防 / ${monsterMaxDurability}耐久）`);
        setHeroSkillBanner(`劝降成功！${monster.name} 已装备！`);

        if (hasEternalRelic(eternalRelics, 'equip-empower')) {
          setSlotTempAttack(prev => ({ ...prev, [equipSlot]: (prev[equipSlot] ?? 0) + 3 }));
          setSlotTempArmor(prev => ({ ...prev, [equipSlot]: (prev[equipSlot] ?? 0) + 3 }));
          addGameLog('equip', `铸锋药剂：${monster.name} 装备时，该装备栏临时攻击 +3，临时护甲 +3！`);
        }

        if (monster.monsterType === 'Ogre' || monster.name === 'Ogre') {
          if (monster.enterEffect === 'auto-engage') {
            const rowMonsters = flattenActiveRowSlots(activeCardsLatestRef.current).filter(
              (c): c is GameCardData => Boolean(c && c.type === 'monster' && c.id !== monster.id),
            );
            for (const m of rowMonsters) {
              if (!isMonsterEngaged(m.id)) {
                beginCombat(m, 'monster');
              }
            }
            if (rowMonsters.length > 0) {
              addGameLog('equip', `${monster.name} 装备效果：激怒了战斗行的所有怪物！`);
            }
          }
          if (monster.ogreEnterDiscard) {
            const drawn = drawFromBackpackToHand();
            if (drawn) {
              addGameLog('equip', `${monster.name} 装备效果：抽取了一张牌（${drawn.name}）`);
            }
          }
        }
      }

      if (amuletEffects.hasPersuadeGraveyardStack) {
        const monsterColIndex = findSlotIndexByCardId(activeCards, monster.id);
        if (monsterColIndex >= 0) {
          const graveyard = engine.getState().discardedCards;
          const graveyardCopy = [...graveyard];
          const picked: GameCardData[] = [];
          for (let i = 0; i < 2 && graveyardCopy.length > 0; i++) {
            const ri = Math.floor(Math.random() * graveyardCopy.length);
            picked.push(graveyardCopy.splice(ri, 1)[0]);
          }
          if (picked.length > 0) {
            setDiscardedCards(graveyardCopy);
            setActiveCardStacks(prev => {
              const next = { ...prev };
              next[monsterColIndex] = [...(next[monsterColIndex] ?? []), ...picked];
              return next;
            });
            triggerGraveyardStackFlight(monsterColIndex, picked);
            const names = picked.map(c => `「${c.name}」`).join('、');
            addGameLog('amulet', `墓地回响符：${names}从墓地堆叠在第 ${monsterColIndex + 1} 列！`);
          }
        }
      }

      if (amuletEffects.hasPersuadeGrantRecycleFetch) {
        const fetchCount = amuletEffects.persuadeGrantRecycleFetchCount || 1;
        for (let fi = 0; fi < fetchCount; fi++) {
          queueCardIntoHand(createPersuadeRecycleFetchMagicCard());
        }
        addGameLog('amulet', `劝降归袋符：${fetchCount} 张「归袋抽引」已加入手牌。`);
      }

    } else {
      addGameLog('combat', `劝降失败！${persuadeState.monster.name} 拒绝了劝降。（掷出 ${value}，需要 ≥${persuadeState.threshold}）`);
      setHeroSkillBanner(`劝降失败！${persuadeState.monster.name} 不为所动。`);
    }
  };

  const handlePersuadeClose = () => {
    setPersuadeState(null);
    resetDragState();
  };

  function handleCardToSlot(card: GameCardData, slotId: string) {
    if (fullBoardInteractionLockedRef.current) return;
    if (heroStunnedRef.current && (slotId === 'slot-amulet' || slotId === 'slot-equipment-1' || slotId === 'slot-equipment-2')) return;
    pushUndoSnapshot();
    if (slotId === 'slot-amulet') {
      if (handLockedForMonsterPhaseRef.current) return;
      if (card.type !== 'amulet') {
        return;
      }
      if (isCardFromEquipmentSlot(card)) {
        resetDragState();
        return;
      }

      let displacedAmulet: AmuletItem | null = null;

      setAmuletSlots(prev => {
        const alreadyEquipped = prev.some(slot => slot?.id === card.id);
        const filtered = prev.filter(slot => slot?.id !== card.id);
        const next = [...filtered];

        if (!alreadyEquipped && next.length >= maxAmuletSlots) {
          displacedAmulet = next.shift() ?? null;
        }

        const updated = [...next, { ...card, fromSlot: 'amulet' } as AmuletItem];
        return updated.slice(-maxAmuletSlots);
      });

      addGameLog('amulet', `装备护符：${card.name}`);
      if (card.amuletEffect === 'recycle-forge') {
        setRecycleForgePlayCount(0);
        updateRecycleForgeCounter(0);
      }
      if (card.amuletEffect === 'damage-class-discover') {
        const streak = engine.getState().classDamageDiscoverStreak ?? 0;
        const threshold = (card.upgradeLevel ?? 0) >= 1 ? 3 : 5;
        updateDamageDiscoverCounter(streak, threshold);
      }

      if (card.amuletEffect === 'balance') {
        setSlotTempAttack(prev => ({
          equipmentSlot1: (prev.equipmentSlot1 ?? 0) + BALANCE_ATTACK_BONUS,
          equipmentSlot2: (prev.equipmentSlot2 ?? 0) - BALANCE_ATTACK_PENALTY,
        }));
        setSlotTempArmor(prev => ({
          equipmentSlot1: (prev.equipmentSlot1 ?? 0) - BALANCE_SHIELD_PENALTY,
          equipmentSlot2: (prev.equipmentSlot2 ?? 0) + BALANCE_SHIELD_BONUS,
        }));
        addGameLog('amulet', '均衡护符生效：左栏临时攻击+3护甲-1，右栏临时护甲+3攻击-1');
      }
      if (card.amuletEffect === 'strength') {
        setSlotTempAttack(prev => ({
          equipmentSlot1: (prev.equipmentSlot1 ?? 0) + 4,
          equipmentSlot2: (prev.equipmentSlot2 ?? 0) + 4,
        }));
        addGameLog('amulet', '力量护符生效：所有装备栏临时攻击 +4！');
      }

      if (displacedAmulet !== null) {
        const displaced = displacedAmulet as AmuletItem;
        if (displaced.amuletEffect === 'balance') {
          setSlotTempAttack(prev => ({
            equipmentSlot1: (prev.equipmentSlot1 ?? 0) - BALANCE_ATTACK_BONUS,
            equipmentSlot2: (prev.equipmentSlot2 ?? 0) + BALANCE_ATTACK_PENALTY,
          }));
          setSlotTempArmor(prev => ({
            equipmentSlot1: (prev.equipmentSlot1 ?? 0) + BALANCE_SHIELD_PENALTY,
            equipmentSlot2: (prev.equipmentSlot2 ?? 0) - BALANCE_SHIELD_BONUS,
          }));
        }
        if (displaced.amuletEffect === 'strength') {
          setSlotTempAttack(prev => ({
            equipmentSlot1: (prev.equipmentSlot1 ?? 0) - 4,
            equipmentSlot2: (prev.equipmentSlot2 ?? 0) - 4,
          }));
        }
        addGameLog('amulet', `卸下护符：${displaced.name}`);
        discardCardToGraveyard(displaced, { owner: 'player' });
      }

      if (isCardFromHand(card)) {
        if (!consumeCardFromHand(card)) {
          return;
        }
        tickRecycleForge();
      } else if (backpackItems.some(c => c.id === card.id)) {
        setBackpackItems(prev => prev.filter(c => c.id !== card.id));
      } else {
        removeCard(card.id, false);
      }

      resetDragState();
    } else if (slotId === 'slot-backpack') {
      if (isCardFromEquipmentSlot(card)) {
        if (isPermRecycleEquipment(card)) {
          const slotId2 = normalizeHeroEquipmentSlotFromDrag(
            (card as GameCardData & { fromSlot?: string }).fromSlot ?? null,
          );
          if (slotId2) clearEquipmentSlotWithPromote(slotId2);
          addPermanentMagicToRecycleBag(card);
          applyDiscardSideEffects(card, 'player', { toRecycleBag: true });
          addGameLog('equip', `回收永久装备「${card.name}」至回收袋。`);
          setHeroSkillBanner(`${card.name} 已回收至回收袋。`);
          tickRecycleForge();
        }
        resetDragState();
        return;
      }
      if (handCards.some(c => c.id === card.id)) {
        if (!consumeCardFromHand(card)) {
          resetDragState();
          return;
        }
        if (card.isCurse && (card as any).knightEffect === 'greed-curse') {
          setGold(prev => Math.max(0, prev - 3));
          addGameLog('magic', `回收「${card.name}」至回收袋（贪婪诅咒消耗了 3 金币）。`);
          setHeroSkillBanner(`${card.name} 已回收至回收袋，失去 3 金币。`);
        } else if (card.isCurse) {
          applyDamage(3, 'general', { selfInflicted: true });
          addGameLog('magic', `回收「${card.name}」至回收袋（血咒吸取了 3 点生命）。`);
          setHeroSkillBanner(`${card.name} 已回收至回收袋，失去 3 点生命。`);
        } else {
          addGameLog('magic', `回收「${card.name}」至回收袋。`);
          setHeroSkillBanner(`${card.name} 已回收至回收袋。`);
        }
        discardCardToGraveyard(card, { owner: 'player', forceRecycleBag: true });
        tickRecycleForge();
        resetDragState();
        return;
      }

      const cardWithOrigin = card as GameCardData & { fromSlot?: DragOrigin };
      const fromAmuletSlot =
        cardWithOrigin.fromSlot === 'amulet' || amuletSlots.some(slot => slot?.id === card.id);
      if (fromAmuletSlot) {
        if (!isRecyclableFromHand(card)) {
          resetDragState();
          return;
        }
        if (card.amuletEffect === 'balance') {
          setSlotTempAttack(prev => ({
            equipmentSlot1: (prev.equipmentSlot1 ?? 0) - BALANCE_ATTACK_BONUS,
            equipmentSlot2: (prev.equipmentSlot2 ?? 0) + BALANCE_ATTACK_PENALTY,
          }));
          setSlotTempArmor(prev => ({
            equipmentSlot1: (prev.equipmentSlot1 ?? 0) + BALANCE_SHIELD_PENALTY,
            equipmentSlot2: (prev.equipmentSlot2 ?? 0) - BALANCE_SHIELD_BONUS,
          }));
        }
        if (card.amuletEffect === 'strength') {
          setSlotTempAttack(prev => ({
            equipmentSlot1: (prev.equipmentSlot1 ?? 0) - 4,
            equipmentSlot2: (prev.equipmentSlot2 ?? 0) - 4,
          }));
        }
        setAmuletSlots(prev => prev.filter(slot => slot?.id !== card.id));
        addPermanentMagicToRecycleBag(card);
        applyDiscardSideEffects(card, 'player', { toRecycleBag: true });
        addGameLog('magic', `回收护符「${card.name}」至回收袋。`);
        setHeroSkillBanner(`${card.name} 已回收至回收袋。`);
        tickRecycleForge();
        resetDragState();
        return;
      }

      if (card.type === 'monster') {
        const isFromHandOrBackpack = isCardFromHand(card) || backpackItems.some(b => b.id === card.id);
        if (!isFromHandOrBackpack && canPersuadeMonster(card) && backpackItems.length < backpackCapacity) {
          openPersuadeModal(card, 'backpack');
          resetDragState();
          return;
        }
        return;
      }

      if (!canCardGoToBackpack(card)) {
        return;
      }

      if (backpackItems.length >= backpackCapacity) {
        return;
      }
      
      const isDungeonCard = activeCards.some(slot => slot?.id === card.id);
      addCardToBackpack(card, {
        pendingDungeonCardId: isDungeonCard ? card.id : undefined,
      });
      removeCard(card.id, false);
      resetDragState();
    } else if (slotId.startsWith('slot-equipment')) {
      const equipSlot: EquipmentSlotId = slotId === 'slot-equipment-1' ? 'equipmentSlot1' : 'equipmentSlot2';
      const equippedItem = equipSlot === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      
      if (isCardFromEquipmentSlot(card)) {
        resetDragState();
        return;
      }

      const isMonsterFromHand = card.type === 'monster' && (isCardFromHand(card) || backpackItems.some(b => b.id === card.id));

      if (card.type === 'monster' && !isMonsterFromHand) {
        if (!isMonsterEngaged(card.id)) {
          beginCombat(card, 'monster');
        }
        resetDragState();
        return;
      }

      if (card.type !== 'weapon' && card.type !== 'shield' && !isMonsterFromHand) {
        return;
      }

      if (hasEternalRelic(eternalRelicsRef.current, 'shield-wall') && card.type === 'weapon') {
        setHeroSkillBanner('永恒护符·雷盾心法：不能装备武器！');
        resetDragState();
        return;
      }

      const slotCap = equipmentSlotCapacity[equipSlot] ?? 1;
      const reserve = getEquipmentReserve(equipSlot);
      const totalEquipped = (equippedItem ? 1 : 0) + reserve.length;

      if (totalEquipped < slotCap) {
        if (equippedItem) {
          setEquipmentReserve(equipSlot, [...reserve, equippedItem]);
        }
      } else {
        if (equippedItem && equippedItem.id !== card.id) {
          if (reserve.length > 0) {
            disposeOwnedEquipmentCard(reserve[0]);
            addGameLog('equip', `卸下 ${reserve[0].name}`);
            const newReserve = reserve.slice(1);
            setEquipmentReserve(equipSlot, equippedItem ? [...newReserve, equippedItem] : newReserve);
          } else {
            disposeOwnedEquipmentCard(equippedItem);
            addGameLog('equip', `卸下 ${equippedItem.name}`);
          }
        }
      }

      let equipCard: EquipmentItem;
      if (isMonsterFromHand) {
        const monsterAttack = card.attack ?? card.value;
        const monsterArmor = card.hp ?? card.value;
        const monsterMaxDurability = card.hpLayers ?? card.fury ?? 1;
        const hasExistingDurability = card.durability != null && card.durability > 0;
        const monsterInitialDurability = hasExistingDurability
          ? card.durability!
          : card.isMinionCard ? monsterMaxDurability : 1;
        equipCard = {
          ...card,
          type: 'monster' as const,
          value: monsterAttack,
          attack: monsterAttack,
          hp: monsterArmor,
          durability: monsterInitialDurability,
          maxDurability: monsterMaxDurability,
        } as EquipmentItem;
        addGameLog('equip', `装备怪物 ${card.name}（${monsterAttack}攻 / ${monsterArmor}防 / ${monsterInitialDurability}/${monsterMaxDurability}耐久）`);
        addHeroMagicGauge('monster-doom', 1);
      } else {
        const base = { ...card } as EquipmentItem;
        const maxD = base.maxDurability ?? base.durability;
        equipCard =
          maxD != null && maxD > 0
            ? { ...base, durability: base.durability ?? maxD, maxDurability: maxD }
            : base;
        const durNote =
          equipCard.maxDurability != null && equipCard.maxDurability > 0
            ? `（耐久 ${equipCard.durability}/${equipCard.maxDurability}）`
            : '';
        addGameLog(
          'equip',
          `装备 ${card.name}（${card.type === 'weapon' ? `${card.value}攻` : `${card.value}防`}）${durNote}`,
        );
      }
      setEquipmentSlotById(equipSlot, equipCard);

      if (equipCard.onEquipEffect) {
        if (equipCard.onEquipEffect === 'graveyard-to-hand') {
          const graveyard = engine.getState().discardedCards;
          if (graveyard.length > 0) {
            const idx = Math.floor(Math.random() * graveyard.length);
            const picked = graveyard[idx];
            setDiscardedCards(prev => prev.filter((_, i) => i !== idx));
            ensureCardInHand(picked);
            addGameLog('equip', `${equipCard.name} 入场效果：从坟场获得了「${picked.name}」！`);
          } else {
            addGameLog('equip', `${equipCard.name} 入场效果：坟场没有可用的牌。`);
          }
        }
        if (equipCard.onEquipEffect === 'temp-attack-2') {
          setSlotTempAttack(prev => ({ ...prev, [equipSlot]: (prev[equipSlot] ?? 0) + 2 }));
          addGameLog('equip', `${equipCard.name} 入场效果：该装备栏临时攻击 +2！`);
        }
        if (equipCard.onEquipEffect === 'temp-armor-3') {
          setSlotTempArmor(prev => ({ ...prev, [equipSlot]: (prev[equipSlot] ?? 0) + 3 }));
          addGameLog('equip', `${equipCard.name} 入场效果：该装备栏临时护甲 +3！`);
        }
        if (equipCard.onEquipEffect === 'persuade-bonus-10') {
          persuadeAmuletBonusRef.current += 10;
          addGameLog('equip', `${equipCard.name} 入场效果：下次劝降成功率 +10%（累计 +${persuadeAmuletBonusRef.current}%）`);
        }
        if (equipCard.onEquipEffect === 'spell-lifesteal+1') {
          setPermanentSpellLifesteal(prev => prev + 1);
          addGameLog('equip', `${equipCard.name} 入场效果：超杀吸血 +1！`);
        }
        if (equipCard.onEquipEffect === 'stunCap+5') {
          setStunCap(prev => Math.min(100, prev + 5));
          addGameLog('equip', `${equipCard.name} 入场效果：击晕上限 +5%！`);
        }
        if (equipCard.onEquipEffect === 'other-slot-durability+1') {
          const otherSlotId: EquipmentSlotId = equipSlot === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
          const otherItem = otherSlotId === 'equipmentSlot1' ? engine.getState().equipmentSlot1 : engine.getState().equipmentSlot2;
          if (otherItem && otherItem.durability != null && otherItem.maxDurability != null) {
            const newDur = Math.min(otherItem.maxDurability, otherItem.durability + 1);
            if (newDur > otherItem.durability) {
              setEquipmentSlotById(otherSlotId, { ...otherItem, durability: newDur });
              addGameLog('equip', `${equipCard.name} 入场效果：${otherItem.name} 耐久 +1（${otherItem.durability} → ${newDur}）`);
            } else {
              addGameLog('equip', `${equipCard.name} 入场效果：${otherItem.name} 已满耐久。`);
            }
          } else {
            addGameLog('equip', `${equipCard.name} 入场效果：另一个装备栏没有装备。`);
          }
        }
        if (equipCard.onEquipEffect === 'perm-slot-damage+1') {
          setEquipmentSlotBonus(equipSlot, 'damage', cur => cur + 1);
          addGameLog('equip', `${equipCard.name} 入场效果：该装备栏永久攻击 +1！`);
        }
      }

      if (hasEternalRelic(eternalRelics, 'equip-empower')) {
        setSlotTempAttack(prev => ({ ...prev, [equipSlot]: (prev[equipSlot] ?? 0) + 3 }));
        setSlotTempArmor(prev => ({ ...prev, [equipSlot]: (prev[equipSlot] ?? 0) + 3 }));
        addGameLog('equip', `铸锋药剂：${equipCard.name} 装备时，该装备栏临时攻击 +3，临时护甲 +3！`);
      }

      if (isMonsterFromHand && (card.monsterType === 'Ogre' || card.name === 'Ogre')) {
        if (card.enterEffect === 'auto-engage') {
          const rowMonsters = flattenActiveRowSlots(activeCardsLatestRef.current).filter(
            (c): c is GameCardData => Boolean(c && c.type === 'monster' && c.id !== card.id),
          );
          for (const m of rowMonsters) {
            if (!isMonsterEngaged(m.id)) {
              beginCombat(m, 'monster');
            }
          }
          if (rowMonsters.length > 0) {
            addGameLog('equip', `${card.name} 装备效果：激怒了战斗行的所有怪物！`);
          }
        }
        if (card.ogreEnterDiscard) {
          const drawn = drawFromBackpackToHand();
          if (drawn) {
            addGameLog('equip', `${card.name} 装备效果：抽取了一张牌（${drawn.name}）`);
          }
        }
      }

      if (isCardFromHand(card)) {
        if (!consumeCardFromHand(card)) {
          return;
        }
        tickRecycleForge();
      } else {
        removeCard(card.id, false);
      }
      resetDragState();
    }
  };

  const handleBackpackClick = () => {
    if (playerTargetingActive || fullBoardInteractionLockedRef.current) return;
    setBackpackViewerOpen(true);
  };

  const heroSkillTargeting = Boolean(pendingHeroSkillAction);
  const heroSkillSlotTargeting = pendingHeroSkillAction?.type === 'slot';
  const heroSkillMonsterTargeting = pendingHeroSkillAction?.type === 'monster';
  const heroMagicTargeting = Boolean(pendingHeroMagicAction);
  const heroMagicSlotTargeting = pendingHeroMagicAction?.step === 'slot-select';
  const heroMagicMonsterTargeting = pendingHeroMagicAction?.step === 'monster-select';
  const magicTargeting = Boolean(pendingMagicAction);
  const magicSlotTargeting = pendingMagicAction?.step === 'slot-select';
  const magicMonsterTargeting = pendingMagicAction?.step === 'monster-select';
  const magicDungeonTargeting = pendingMagicAction?.step === 'dungeon-select';
  const potionTargeting = Boolean(pendingPotionAction);
  const potionSlotTargeting = pendingPotionAction?.step === 'slot-select';
  const playerTargetingActive =
    heroSkillTargeting || heroMagicTargeting || magicTargeting || potionTargeting;
  const slotTargetingActive =
    heroSkillSlotTargeting || Boolean(heroMagicSlotTargeting) || Boolean(magicSlotTargeting) || Boolean(potionSlotTargeting);
  const monsterTargetingActive =
    heroSkillMonsterTargeting || heroMagicMonsterTargeting || Boolean(magicMonsterTargeting);
  const dungeonTargetingActive = Boolean(magicDungeonTargeting);
  const heroSkillSlotLabel =
    pendingHeroSkillAction?.skillId === 'armor-pact'
      ? '+1 Armor'
      : pendingHeroSkillAction?.skillId === 'durability-for-blood'
        ? '+1 Durability'
        : pendingHeroSkillAction?.skillId === 'discard-empower'
          ? '+2 & 吸血'
          : 'Select Slot';
  const slotTargetingLabel = heroSkillSlotTargeting
    ? heroSkillSlotLabel
    : heroMagicSlotTargeting
      ? pendingHeroMagicAction?.prompt
      : magicSlotTargeting
        ? pendingMagicAction?.prompt
        : potionSlotTargeting
          ? pendingPotionAction?.prompt
          : undefined;
  const heroSkillPrompt = pendingHeroMagicAction?.prompt
    ? pendingHeroMagicAction.prompt
    : pendingPotionAction?.prompt
      ? pendingPotionAction.prompt
      : pendingMagicAction?.prompt
        ? pendingMagicAction.prompt
        : heroSkillTargeting
          ? selectedHeroSkillDef?.statusHint ?? 'Complete the hero skill action.'
          : heroSkillBanner;
  const heroSkillDisabledReason = (() => {
    if (!selectedHeroSkillDef || selectedHeroSkillDef.type === 'passive') return undefined;
    if (heroSkillUsedThisWave) return 'Hero skill already used this wave.';
    if (waterfallActive) return 'Wait for the waterfall to finish.';
    if (selectedHeroSkillDef.id === 'armor-pact') {
      if (equipmentSlot1 && equipmentSlot2) return '没有空装备槽，无法发动虚位铸甲。';
    }
    if (selectedHeroSkillDef.id === 'discard-empower') {
      if (handCards.length === 0) return '需要至少 1 张手牌。';
      if (!equipmentSlot1 && !equipmentSlot2) return '需要至少一个装备。';
    }
    return undefined;
  })();
  const heroMagicUiState = useMemo(() => {
    return HERO_MAGIC_IDS.map(id => {
      const definition = getHeroMagicDefinition(id);
      const status =
        heroMagicState[id] ??
        ({
          id,
          unlocked: false,
          gauge: 0,
          usedThisWave: false,
        } as HeroMagicRuntimeState);
      const lockedReason = status.unlocked ? undefined : '通过英雄魔法卡解锁';
      const insufficientCharge =
        status.unlocked && status.gauge < definition.gaugeMax
          ? `需要 ${definition.gaugeMax} 能量`
          : undefined;
      const usedReason = status.usedThisWave ? '本波已使用' : undefined;
      const waterfallReason = waterfallActive ? '等待瀑布动画结束' : undefined;
      const busyReason =
        pendingHeroMagicAction ||
        pendingHeroSkillAction ||
        pendingMagicAction ||
        pendingPotionAction
          ? '完成当前动作后再试'
          : undefined;
      const ready =
        status.unlocked &&
        status.gauge >= definition.gaugeMax &&
        !status.usedThisWave &&
        !waterfallActive &&
        !pendingHeroMagicAction &&
        !pendingHeroSkillAction &&
        !pendingMagicAction &&
        !pendingPotionAction;
      const disabledReason =
        lockedReason ?? insufficientCharge ?? usedReason ?? waterfallReason ?? busyReason;
      return {
        id,
        name: definition.name,
        gauge: status.gauge,
        gaugeMax: definition.gaugeMax,
        unlocked: status.unlocked,
        ready,
        usedThisWave: status.usedThisWave,
        chargeHint: definition.chargeHint,
        disabledReason,
      };
    }).filter(magic => magic.unlocked);
  }, [
    heroMagicState,
    pendingHeroMagicAction,
    pendingHeroSkillAction,
    pendingMagicAction,
    pendingPotionAction,
    waterfallActive,
  ]);

  const heroMagicChoicePrompt =
    pendingHeroMagicAction?.step === 'choice'
      ? { id: pendingHeroMagicAction.id, prompt: pendingHeroMagicAction.prompt }
      : null;

  const potionChoiceDialogOpen =
    pendingPotionAction?.effect === 'repair-choice' && pendingPotionAction.step === 'choice';

  const modalOverlayBlocksEndHeroTurn =
    gameOver ||
    showSkillSelection ||
    showCardDraft ||
    backpackViewerOpen ||
    deckViewerOpen ||
    discoverModalOpen ||
    Boolean(graveyardDiscoverState) ||
    Boolean(ghostBladeExileCards) ||
    (shopModalOpen && !shopModalMinimized) ||
    shopSkillSelectOpen ||
    deleteModalOpen ||
    upgradeModalOpen ||
    Boolean(handMagicUpgradeModal) ||
    Boolean(mirrorCopyModal) ||
    Boolean(permGrantModal) ||
    Boolean(amplifyModal) ||
    detailsModalOpen ||
    heroDetailsOpen ||
    (eventModalOpen && !eventModalMinimized) ||
    Boolean(eventDiceModal) ||
    Boolean(magicChoiceModal) ||
    Boolean(equipmentPrompt) ||
    Boolean(eventTransformState) ||
    Boolean(activeMonsterReward) ||
    Boolean(deathWardPrompt) ||
    Boolean(daggerSelfDestructPrompt) ||
    potionChoiceDialogOpen ||
    Boolean(deckPeekState);

  const endHeroTurnDisabled =
    fullBoardInteractionLocked || modalOverlayBlocksEndHeroTurn || playerTargetingActive;
  endHeroTurnGuardRef.current = endHeroTurnDisabled;

  const heroSkillInfo =
    !showSkillSelection && selectedHeroSkillDef
      ? {
          name: selectedHeroSkillDef.name,
          effect: selectedHeroSkillDef.effect,
          buttonLabel:
            selectedHeroSkillDef.type === 'active'
              ? selectedHeroSkillDef.buttonLabel ?? 'Use Skill'
              : undefined,
          isPassive: selectedHeroSkillDef.type === 'passive',
          isReady:
            selectedHeroSkillDef.type === 'active' &&
            !heroSkillUsedThisWave &&
            !waterfallActive &&
            !playerTargetingActive,
          isUsed: selectedHeroSkillDef.type === 'active' ? heroSkillUsedThisWave : false,
          isPending: heroSkillTargeting,
          disabledReason: heroSkillDisabledReason,
        }
      : null;

  const extraHeroSkillInfos = useMemo(() => {
    type ExtraSkillInfo = { skillId: string; name: string; effect?: string; buttonLabel?: string; isPassive?: boolean; isReady?: boolean; isUsed?: boolean; disabledReason?: string };
    const infos: ExtraSkillInfo[] = [];

    if (!showSkillSelection && extraHeroSkills.length > 0) {
      for (const skillId of extraHeroSkills) {
        const def = getHeroSkillById(skillId);
        if (!def) continue;
        const used = extraSkillsUsedThisWave.includes(skillId);
        infos.push({
          skillId,
          name: def.name,
          effect: def.effect,
          buttonLabel: def.type === 'active' ? def.buttonLabel ?? def.name : undefined,
          isPassive: def.type === 'passive',
          isReady: def.type === 'active' && !used && !waterfallActive && !playerTargetingActive,
          isUsed: def.type === 'active' ? used : false,
          disabledReason: used ? '该技能本波已使用。' : waterfallActive ? '等待瀑流结束。' : undefined,
        });
      }
    }

    if (permanentSkills.includes('幽魂净化')) {
      infos.push({
        skillId: 'wraith-purification',
        name: '幽魂净化',
        effect: `背包为空时，自动将回收袋洗回背包（每波一次）`,
        isPassive: true,
        isReady: false,
        isUsed: !wraithPassiveEnabled,
      });
    }

    return infos;
  }, [showSkillSelection, extraHeroSkills, extraSkillsUsedThisWave, waterfallActive, playerTargetingActive, permanentSkills, wraithPassiveEnabled]);

  const isPotionSlotEligible = (slotId: EquipmentSlotId) => {
    if (!potionSlotTargeting || !pendingPotionAction || pendingPotionAction.step !== 'slot-select') {
      return false;
    }
    if (pendingPotionAction.effect === 'perm-slot-damage+1' ||
        pendingPotionAction.effect === 'perm-slot-damage+2' ||
        pendingPotionAction.effect === 'perm-slot-capacity+1') {
      return true;
    }
    const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
    if (!slotItem || !slotItem.type) {
      return false;
    }
    if ('allowedTypes' in pendingPotionAction && pendingPotionAction.allowedTypes) {
      if (!pendingPotionAction.allowedTypes.includes(slotItem.type)) {
        return false;
      }
    }
    if (pendingPotionAction.effect === 'repair-choice-upgrade') {
      return true;
    }
    if (pendingPotionAction.effect === 'perm-equipment-durability-max+1' ||
        pendingPotionAction.effect === 'perm-equipment-durability-max+2') {
      return slotItem.durability != null;
    }
    const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
    const currentDurability = slotItem.durability ?? maxDurability;
    return maxDurability > 0 && currentDurability < maxDurability;
  };

  const equipmentSlot1Highlight =
    slotTargetingActive && (!potionSlotTargeting || isPotionSlotEligible('equipmentSlot1'));
  const equipmentSlot2Highlight =
    slotTargetingActive && (!potionSlotTargeting || isPotionSlotEligible('equipmentSlot2'));

  const heroFrameHoverLogCountRef = useRef(0);
  const heroFrameEnableLogCountRef = useRef(0);
  const heroFrameHitTestLogCountRef = useRef(0);
  const heroFrameStateLogCountRef = useRef(0);
  const heroFrameDragOverLogCountRef = useRef(0);
  const heroFrameDropCalcLogCountRef = useRef(0);

  const updateHeroSkillArrowFromMouse = useCallback(
    (clientX?: number, clientY?: number) => {
      if (!heroSkillTargeting) {
        return;
      }
      const boardEl = boardRef.current;
      const buttonEl = heroSkillButtonRef.current;
      if (!boardEl || !buttonEl) {
        setHeroSkillArrow(null);
        return;
      }
      const boardRect = boardEl.getBoundingClientRect();
      const buttonRect = buttonEl.getBoundingClientRect();
      const start = {
        x: buttonRect.left + buttonRect.width / 2 - boardRect.left,
        y: buttonRect.top + buttonRect.height / 2 - boardRect.top,
      };
      const end =
        clientX !== undefined && clientY !== undefined
          ? { x: clientX - boardRect.left, y: clientY - boardRect.top }
          : start;
      setHeroSkillArrow({ start, end });
    },
    [heroSkillTargeting],
  );

  useEffect(() => {
    if (!heroSkillTargeting) {
      setHeroSkillArrow(null);
      return;
    }

    updateHeroSkillArrowFromMouse();

    const handleMouseMove = (event: MouseEvent) => {
      updateHeroSkillArrowFromMouse(event.clientX, event.clientY);
    };
    const handleReposition = () => updateHeroSkillArrowFromMouse();

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [heroSkillTargeting, updateHeroSkillArrowFromMouse]);
  const handleDragCardFromHand = (card: GameCardData) => {
    const targetingActive = playerTargetingActive;
  const isSpellCard = card.type === 'magic' || card.type === 'hero-magic' || card.type === 'potion';
    if (
      (waterfallAnimation.isActive && !isSpellCard) ||
      targetingActive ||
      fullBoardInteractionLockedRef.current ||
      handLockedForMonsterPhaseRef.current
    )
      return;
    heroFrameHoverLogCountRef.current = 0;
    heroFrameEnableLogCountRef.current = 0;
    heroFrameHitTestLogCountRef.current = 0;
    heroFrameStateLogCountRef.current = 0;
    heroFrameDragOverLogCountRef.current = 0;
    heroFrameDropCalcLogCountRef.current = 0;
    setDraggedCard(card);
    draggedCardRef.current = card;
    setDraggedCardSource('hand');
    startDragSession();
    // Card stays in hand until successfully dropped
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        sessionId:'debug-session',
        runId:'run2',
        hypothesisId:'K',
        location:'GameBoard.tsx:handleDragCardFromHand',
        message:'Drag from hand started',
        data:{cardId:card.id, cardType:card.type, waterfallActive:waterfallAnimation.isActive, targetingActive},
        timestamp:Date.now()
      })
    }).catch(()=>{});
    // #endregion
  };

  const handleDragEndFromHand = (event?: React.DragEvent) => {
    if (draggedCardSource !== 'hand') {
      heroFrameDropIntentRef.current = false;
      setDraggedCard(null);
      setDraggedCardSource(current => (current === 'hand' ? null : current));
      setHeroRowDropState(null);
      return;
    }

    const clientX = event?.clientX ?? null;
    const clientY = event?.clientY ?? null;
    let insideHeroFrame: boolean | null = null;
    let usedFallbackPos = false;

    if (
      clientX !== null &&
      clientY !== null &&
      draggedCardRef.current &&
      isHeroRowHighlightCard(draggedCardRef.current)
    ) {
      if (!heroFrameBoundsRef.current) {
        updateHeroFrameBounds();
      }
      insideHeroFrame = isPointInsideHeroRowDropArea(clientX, clientY, draggedCardRef.current);
    }

    if (
      insideHeroFrame !== true &&
      lastGlobalDragPosRef.current &&
      draggedCardRef.current &&
      isHeroRowHighlightCard(draggedCardRef.current)
    ) {
      const { x, y } = lastGlobalDragPosRef.current;
      if (!heroFrameBoundsRef.current) {
        updateHeroFrameBounds();
      }
      insideHeroFrame = isPointInsideHeroRowDropArea(x, y, draggedCardRef.current);
      usedFallbackPos = true;
    }

    const dropAccepted =
      insideHeroFrame === true &&
      draggedCardRef.current &&
      isHeroRowHighlightCard(draggedCardRef.current);

    if (heroFrameDropCalcLogCountRef.current < 6) {
      heroFrameDropCalcLogCountRef.current += 1;
      fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          sessionId:'debug-session',
          runId:'run4',
          hypothesisId:'T',
          location:'GameBoard.tsx:handleDragEndFromHand',
          message:'Drop calc',
          data:{
            insideHeroFrame,
            usedFallbackPos,
            heroFrameBounds: heroFrameBoundsRef.current ? {
              left: heroFrameBoundsRef.current.left,
              top: heroFrameBoundsRef.current.top,
              right: heroFrameBoundsRef.current.right,
              bottom: heroFrameBoundsRef.current.bottom,
              width: heroFrameBoundsRef.current.width,
              height: heroFrameBoundsRef.current.height,
            } : null,
            lastGlobal:lastGlobalDragPosRef.current,
            clientX,
            clientY,
            dropAccepted,
            heroFrameDropEnabled,
            heroRowMagicDropActive,
            draggedCardId:draggedCardRef.current?.id,
            draggedCardType:draggedCardRef.current?.type
          },
          timestamp:Date.now()
        })
      }).catch(()=>{});
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        sessionId:'debug-session',
        runId:'run4',
        hypothesisId:'O',
        location:'GameBoard.tsx:handleDragEndFromHand',
        message: dropAccepted ? 'Drop accepted' : 'Drop rejected',
        data:{
          dropAccepted,
          heroFrameDropIntent:heroFrameDropIntentRef.current,
          draggedCardId:draggedCardRef.current?.id,
          draggedCardType:draggedCardRef.current?.type,
          isHighlightCard: isHeroRowHighlightCard(draggedCardRef.current),
          insideHeroFrame,
          usedFallbackPos,
          clientX,
          clientY,
          lastGlobal: lastGlobalDragPosRef.current,
          heroRowDropState
        },
        timestamp:Date.now()
      })
    }).catch(()=>{});
    // #endregion

    if (dropAccepted && draggedCardRef.current) {
      heroFrameDropIntentRef.current = true;
      handleCardToHero(draggedCardRef.current);
      return;
    }
    heroFrameDropIntentRef.current = false;
    setDraggedCard(null);
    setDraggedCardSource((current) => (current === 'hand' ? null : current));
    setHeroRowDropState(null);
  };
  
  // Handle drag start from dungeon cards
  const handleDragStartFromDungeon = (card: GameCardData) => {
    if (
      waterfallAnimation.isActive ||
      playerTargetingActive ||
      fullBoardInteractionLockedRef.current
    )
      return;
    heroFrameHoverLogCountRef.current = 0;
    heroFrameEnableLogCountRef.current = 0;
    heroFrameHitTestLogCountRef.current = 0;
    heroFrameStateLogCountRef.current = 0;
    heroFrameDragOverLogCountRef.current = 0;
    heroFrameDropCalcLogCountRef.current = 0;
    setDraggedCard(card);
    draggedCardRef.current = card;
    setDraggedCardSource('dungeon');
    setIsDraggingFromDungeon(true);
    setIsDraggingToHand(true);
    startDragSession();
  };
  
  // Handle drag end from dungeon  
  const handleDragEndFromDungeon = () => {
    if (heroFrameDropIntentRef.current && draggedCardRef.current && isHeroRowHighlightCard(draggedCardRef.current)) {
      heroFrameDropIntentRef.current = false;
      handleCardToHero(draggedCardRef.current);
      return;
    }
    heroFrameDropIntentRef.current = false;
    setDraggedCard(null);
    setDraggedCardSource((current) => (current === 'dungeon' ? null : current));
    setIsDraggingFromDungeon(false);
    setIsDraggingToHand(false);
    setHeroRowDropState(null);
  };

  const engagedMonsters = getEngagedMonsterCards();
  const isWaterfallLocked = waterfallActive;
  const isDefeatAnimationPlaying = Object.keys(monsterDefeatStates).length > 0;
  const eventPendingLocked = eventModalMinimized && eventModalOpen && !!currentEventCard;
  const pendingBlock = combatState.pendingBlock;
  const showBlockButtons = Boolean(pendingBlock);
  const inCombat = engagedMonsters.some(m => !monsterDefeatStates[m.id]);
  const computeSlotActionCount = (slotId: EquipmentSlotId): number | null => {
    if (!inCombat) return null;
    const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
    if (!slotItem) return null;

    if (combatState.currentTurn === 'hero') {
      let count = 0;
      if (!combatState.heroAttacksThisTurn[slotId]) count += 1;
      count += extraAttackCharges;
      if (berserkerRageActive && !berserkerSlotUsed[slotId]) count += 1;
      if (amuletEffects.hasFlash && !flashSlotUsed[slotId]) count += 1;
      if (gambitExtraActive) count += Math.max(0, gambitExtraPerSlot - (gambitSlotUsed[slotId] ?? 0));
      if ((slotItem as any)?.weaponExtraAttack && !weaponExtraAttackUsed[slotId]) count += 1;
      return count;
    }

    if (combatState.currentTurn === 'monster' && (slotItem.type === 'shield' || slotItem.type === 'monster')) {
      return Math.max(0, blockDurabilityPerSlot - (combatState.slotDurabilityUsedThisTurn?.[slotId] ?? 0));
    }

    return null;
  };
  const slotActionCount1 = computeSlotActionCount('equipmentSlot1');
  const slotActionCount2 = computeSlotActionCount('equipmentSlot2');
  useLayoutEffect(() => {
    updateHeroFramePosition();
  }, [
    updateHeroFramePosition,
    previewCards,
    activeCards,
    equipmentSlot1,
    equipmentSlot2,
    amuletSlots,
    backpackItems.length,
    classDeck.length,
    heroVariant,
    showBlockButtons,
    viewportWidth,
    gameViewport.height,
  ]);
  const draggedCardIsSpell =
    draggedCard?.type === 'magic' || draggedCard?.type === 'hero-magic' || draggedCard?.type === 'potion';
  const heroRowInteractionLocked =
    playerTargetingActive ||
    isDefeatAnimationPlaying ||
    fullBoardInteractionLocked ||
    (isWaterfallLocked && !draggedCardIsSpell);
  const heroCardDropHighlight =
    !heroRowInteractionLocked &&
    canCardDropOnHero(draggedCard, draggedCardSource) &&
    !isHeroRowHighlightCard(draggedCard);
  const heroRowMagicDropActive =
    !heroRowInteractionLocked && isHeroRowHighlightCard(draggedCard);
  const isPermCard = (card: GameCardData | null | undefined): boolean =>
    Boolean(card && isRecyclableFromHand(card));
  const canSellDraggedCard =
    draggedCard
      ? ((isSellableType(draggedCard.type) && !draggedCard.isCurse && !(draggedCard.type === 'monster' && !draggedCard.isMinionCard))
        || draggedCard.isPermanentEvent === true)
        && !isPermCard(draggedCard)
        && draggedCard.type !== 'building'
      : false;
  const canSellDraggedEquipment =
    draggedEquipment && draggedEquipment.type
      ? isSellableType(draggedEquipment.type as CardType) && !isPermRecycleEquipment(draggedEquipment as GameCardData)
      : false;
  const graveyardDropEnabled =
    !isWaterfallLocked &&
    !isDefeatAnimationPlaying &&
    !playerTargetingActive &&
    !fullBoardInteractionLocked &&
    !activeMonsterReward &&
    (canSellDraggedCard || canSellDraggedEquipment);
  const shouldHighlightGraveyard = graveyardDropEnabled && isDragSessionActive;
  graveyardDropGuardRef.current.blocked = isWaterfallLocked || isDefeatAnimationPlaying || playerTargetingActive || fullBoardInteractionLocked || Boolean(activeMonsterReward);
  const heroRowMagicDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    const card = draggedCardRef.current;
    if (!card || !isHeroRowHighlightCard(card)) return;
    event.preventDefault();
  };
  const heroRowMagicDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const card = draggedCardRef.current;
    if (!card || !isHeroRowHighlightCard(card)) return;
    event.preventDefault();
    event.stopPropagation();
    handleCardToHero(card);
  };
  const getHeroRowMagicDropHandlers = (
    slot: 'backpack' | 'other'
  ): {
    onDragOver?: (event: ReactDragEvent<HTMLDivElement>) => void;
    onDrop?: (event: ReactDragEvent<HTMLDivElement>) => void;
  } => {
    if (slot === 'backpack') {
      return {};
    }
    return {
      onDragOver: heroRowMagicDragOver,
      onDrop: heroRowMagicDrop,
    };
  };
  const heroFrameDropEnabled =
    heroRowMagicDropActive ||
    ((draggedCardSource === 'hand' || draggedCardSource === 'dungeon') && isHeroRowHighlightCard(draggedCard));

  const lastGlobalDragPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      lastGlobalDragPosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('dragover', handleGlobalDragOver, true);
    return () => {
      window.removeEventListener('dragover', handleGlobalDragOver, true);
    };
  }, []);
  const isPointInsideHeroRowDropArea = useCallback(
    (clientX: number, clientY: number, card: GameCardData | null) => {
      if (!card || !isHeroRowHighlightCard(card)) {
        return false;
      }

      const frameRect =
        heroFrameRef.current?.getBoundingClientRect() ??
        (updateHeroFrameBounds(), heroFrameBoundsRef.current);

      const insideFrame = pointInsideRect(frameRect, clientX, clientY);

      let insideBackpack = false;
      if (isBackpackRestrictedCard(card)) {
        const backpackCell = heroRowCellRefs.current[HERO_ROW_BACKPACK_INDEX];
        const backpackRect = backpackCell?.getBoundingClientRect() ?? null;
        insideBackpack = pointInsideRect(backpackRect, clientX, clientY);
      }

      if (heroFrameHitTestLogCountRef.current < 6) {
        heroFrameHitTestLogCountRef.current += 1;
        fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            sessionId:'debug-session',
            runId:'run4',
            hypothesisId:'R',
            location:'GameBoard.tsx:isPointInsideHeroRowDropArea',
            message:'Hit test',
            data:{
              clientX,
              clientY,
              cardId:card.id,
              cardType:card.type,
              frameRect: frameRect ? {
                left: frameRect.left, top: frameRect.top, right: frameRect.right, bottom: frameRect.bottom, width: frameRect.width, height: frameRect.height
              } : null,
              insideFrame,
              insideBackpack
            },
            timestamp:Date.now()
          })
        }).catch(()=>{});
      }
      if (!insideFrame) {
        return false;
      }

      if (insideBackpack) {
        return false;
      }

      return true;
    },
    [updateHeroFrameBounds],
  );
  useEffect(() => {
    if (!heroFrameDropEnabled) {
      setHeroRowFrameDropActive(false);
      heroFrameDropIntentRef.current = false;
      if (heroFrameEnableLogCountRef.current < 4) {
        heroFrameEnableLogCountRef.current += 1;
        fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            sessionId:'debug-session',
            runId:'run4',
            hypothesisId:'Q',
            location:'GameBoard.tsx:heroFrameEffect',
            message:'Hero frame disabled',
            data:{
              heroFrameDropEnabled,
              heroRowMagicDropActive,
              draggedCardSource,
              draggedCardType:draggedCard?.type
            },
            timestamp:Date.now()
          })
        }).catch(()=>{});
      }
      return;
    }

    if (heroFrameEnableLogCountRef.current < 4) {
      heroFrameEnableLogCountRef.current += 1;
      fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          sessionId:'debug-session',
          runId:'run4',
          hypothesisId:'Q',
          location:'GameBoard.tsx:heroFrameEffect',
          message:'Hero frame enabled',
          data:{
            heroFrameDropEnabled,
            heroRowMagicDropActive,
            draggedCardSource,
            draggedCardType:draggedCard?.type
          },
          timestamp:Date.now()
        })
      }).catch(()=>{});
    }

    // Immediately show frame highlight when enabled
    const logHeroFrameState = (active: boolean) => {
      if (heroFrameStateLogCountRef.current < 6) {
        heroFrameStateLogCountRef.current += 1;
        fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            sessionId:'debug-session',
            runId:'run4',
            hypothesisId:'S',
            location:'GameBoard.tsx:heroFrameState',
            message:'Frame state set',
            data:{active},
            timestamp:Date.now()
          })
        }).catch(()=>{});
      }
    };

    setHeroRowFrameDropActive(false);
    logHeroFrameState(false);

    const setFrameActive = (active: boolean) => {
      setHeroRowFrameDropActive(prev => {
        if (prev === active) return prev;
        logHeroFrameState(active);
        return active;
      });
    };

    const handleWindowDragOver = (event: WindowEventMap['dragover']) => {
      if (heroFrameDragOverLogCountRef.current < 4) {
        heroFrameDragOverLogCountRef.current += 1;
        fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            sessionId:'debug-session',
            runId:'run4',
            hypothesisId:'S',
            location:'GameBoard.tsx:handleWindowDragOver',
            message:'Dragover fired',
            data:{
              clientX:event.clientX,
              clientY:event.clientY,
              heroFrameDropEnabled
            },
            timestamp:Date.now()
          })
        }).catch(()=>{});
      }
      lastGlobalDragPosRef.current = { x: event.clientX, y: event.clientY };
      const card = draggedCardRef.current;
      if (!card || !isHeroRowHighlightCard(card)) {
        heroFrameDropIntentRef.current = false;
        return;
      }
      const insideHeroFrame = isPointInsideHeroRowDropArea(event.clientX, event.clientY, card);
      if (heroFrameHoverLogCountRef.current < 6) {
        heroFrameHoverLogCountRef.current += 1;
        fetch('http://127.0.0.1:7242/ingest/91117990-2058-4fa2-8ff0-1ab4226ecf98',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            sessionId:'debug-session',
            runId:'run4',
            hypothesisId:'P',
            location:'GameBoard.tsx:handleWindowDragOver',
            message:'Hero frame hover',
            data:{
              cardId:card.id,
              cardType:card.type,
              insideHeroFrame,
              clientX:event.clientX,
              clientY:event.clientY,
              heroFrameDropEnabled,
              heroRowMagicDropActive,
              frameRect: heroFrameRef.current ? (() => {
                const r = heroFrameRef.current!.getBoundingClientRect();
                return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height };
              })() : null
            },
            timestamp:Date.now()
          })
        }).catch(()=>{});
      }
      if (insideHeroFrame) {
        event.preventDefault();
        heroFrameDropIntentRef.current = true;
        setHeroRowDropState(prev => prev !== card.type ? (card.type as HeroRowDropType) : prev);
        setFrameActive(true);
      } else {
        heroFrameDropIntentRef.current = false;
        setHeroRowDropState(prev => prev !== null ? null : prev);
        setFrameActive(false);
      }
    };

    const handleWindowDrop = (event: WindowEventMap['drop']) => {
      const card = draggedCardRef.current;
      if (!card || !isHeroRowHighlightCard(card)) {
        setFrameActive(false);
        heroFrameDropIntentRef.current = false;
        return;
      }
      const insideHeroFrame = isPointInsideHeroRowDropArea(event.clientX, event.clientY, card);
      if (!insideHeroFrame) {
        setFrameActive(false);
        heroFrameDropIntentRef.current = false;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      handleCardToHeroRef.current?.(card);
      setFrameActive(false);
      heroFrameDropIntentRef.current = false;
    };

    window.addEventListener('dragover', handleWindowDragOver, true);
    window.addEventListener('drop', handleWindowDrop, true);

    const surfaceElement = gameSurfaceRef.current;
    if (surfaceElement) {
      surfaceElement.addEventListener('dragover', handleWindowDragOver, true);
      surfaceElement.addEventListener('drop', handleWindowDrop, true);
    }

    return () => {
      window.removeEventListener('dragover', handleWindowDragOver, true);
      window.removeEventListener('drop', handleWindowDrop, true);
      if (surfaceElement) {
        surfaceElement.removeEventListener('dragover', handleWindowDragOver, true);
        surfaceElement.removeEventListener('drop', handleWindowDrop, true);
      }
      setFrameActive(false);
      heroFrameDropIntentRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroFrameDropEnabled, isPointInsideHeroRowDropArea]);
  // Mobile: track touch position during drag to update hero row highlight,
  // and intercept drop via the global mobile-drag-end event.
  useEffect(() => {
    if (!heroFrameDropEnabled) return;

    const handleMobileDragMove = (e: Event) => {
      const detail = (e as CustomEvent).detail as DragData;
      if (detail.type !== 'card') return;
      const card = detail.data as GameCardData | undefined;
      if (!card || !isHeroRowHighlightCard(card)) return;
      const cx = typeof detail.clientX === 'number' ? detail.clientX : null;
      const cy = typeof detail.clientY === 'number' ? detail.clientY : null;
      if (cx === null || cy === null) return;
      if (!heroFrameBoundsRef.current) updateHeroFrameBounds();
      const inside = isPointInsideHeroRowDropArea(cx, cy, card);
      if (inside) {
        heroFrameDropIntentRef.current = true;
        setHeroRowDropState(prev => prev !== (card.type as HeroRowDropType) ? (card.type as HeroRowDropType) : prev);
        setHeroRowFrameDropActive(prev => prev || true);
      } else {
        heroFrameDropIntentRef.current = false;
        setHeroRowDropState(prev => prev !== null ? null : prev);
        setHeroRowFrameDropActive(prev => prev ? false : prev);
      }
    };

    const handleMobileDragEnd = (e: Event) => {
      const detail = (e as CustomEvent).detail as DragData & { _handled?: boolean };
      if (detail.type !== 'card') return;
      const card = detail.data as GameCardData | undefined;
      if (!card || !isHeroRowHighlightCard(card)) {
        setHeroRowFrameDropActive(false);
        heroFrameDropIntentRef.current = false;
        return;
      }
      const cx = typeof detail.clientX === 'number' ? detail.clientX : null;
      const cy = typeof detail.clientY === 'number' ? detail.clientY : null;
      if (cx !== null && cy !== null) {
        if (!heroFrameBoundsRef.current) updateHeroFrameBounds();
        const inside = isPointInsideHeroRowDropArea(cx, cy, card);
        if (inside) {
          detail._handled = true;
          handleCardToHeroRef.current?.(card);
        }
      }
      setHeroRowFrameDropActive(false);
      setHeroRowDropState(null);
      heroFrameDropIntentRef.current = false;
    };

    document.addEventListener('mobile-drag-move', handleMobileDragMove);
    document.addEventListener('mobile-drag-end', handleMobileDragEnd);
    return () => {
      document.removeEventListener('mobile-drag-move', handleMobileDragMove);
      document.removeEventListener('mobile-drag-end', handleMobileDragEnd);
      setHeroRowFrameDropActive(false);
      heroFrameDropIntentRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroFrameDropEnabled, isPointInsideHeroRowDropArea, updateHeroFrameBounds]);
  const canMonsterTargetShieldSlot = (slotItem: EquipmentItem | null) =>
    Boolean(slotItem && slotItem.type === 'shield' && draggedCard?.type === 'monster');
  const equipmentSlot1MonsterTarget =
    !isWaterfallLocked &&
    !isDefeatAnimationPlaying &&
    !playerTargetingActive &&
    !fullBoardInteractionLocked &&
    canMonsterTargetShieldSlot(equipmentSlot1);
  const equipmentSlot2MonsterTarget =
    !isWaterfallLocked &&
    !isDefeatAnimationPlaying &&
    !playerTargetingActive &&
    !fullBoardInteractionLocked &&
    canMonsterTargetShieldSlot(equipmentSlot2);
  const renderBlockButton = (
    target: BlockTarget,
    label: string,
    disabled: boolean = false
  ) => {
    if (!pendingBlock) return null;
    const isDurabilityExhausted = target !== 'hero' &&
      (combatState.slotDurabilityUsedThisTurn?.[target as EquipmentSlotId] ?? 0) >= blockDurabilityPerSlot;
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
        <button
          type="button"
          disabled={disabled || fullBoardInteractionLocked}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled && !fullBoardInteractionLocked) {
              resolveBlockChoice(target);
            }
          }}
          className={`block-button pointer-events-auto shadow-2xl transition flex flex-col items-center gap-1 ${
            disabled
              ? 'block-button--disabled'
              : 'block-button--active'
          }`}
          style={{ '--dh-overlay-scale': (overlayScale * stageScale).toString() } as CSSProperties}
        >
          <span className="block-button__label">{label}</span>
          <span className="block-button__meta">
            {isDurabilityExhausted ? '耐久用尽' : `Damage: ${pendingBlock.attackValue}`}
          </span>
        </button>
      </div>
    );
  };
  const draggingMonsterFromHand = Boolean(
    draggedCard && draggedCard.type === 'monster' && (isCardFromHand(draggedCard) || backpackItems.some(b => b.id === draggedCard.id)),
  );
  const draggingDungeonMonsterForPersuade = Boolean(
    draggedCard &&
    draggedCard.type === 'monster' &&
    !draggingMonsterFromHand &&
    canPersuadeMonster(draggedCard),
  );
  const draggingEquipmentCard = Boolean(
    draggedCard && (draggedCard.type === 'weapon' || draggedCard.type === 'shield' || draggingMonsterFromHand),
  );
  const equipmentSlotDropAvailable =
    !isWaterfallLocked &&
    !isDefeatAnimationPlaying &&
    !playerTargetingActive &&
    !fullBoardInteractionLocked &&
    !heroStunned &&
    draggingEquipmentCard;
  const equipmentSlot1DropAvailable = equipmentSlotDropAvailable;
  const equipmentSlot2DropAvailable = equipmentSlotDropAvailable;
  const equipmentSlot1StatModifier = getEquipmentSlotStatModifier('equipmentSlot1');
  const equipmentSlot2StatModifier = getEquipmentSlotStatModifier('equipmentSlot2');
  const tempAttackSuppressedByBuildingAura = useMemo(
    () => getEquipmentSlotsWithSuppressedTempAttack(activeCards, equipmentSlot1, equipmentSlot2),
    [activeCards, equipmentSlot1, equipmentSlot2],
  );
  const heroRowSlots: HeroRowSlotConfig[] = [
    {
      id: 'hero-row-amulet',
      dropZone: 'other',
      render: () => (
        <AmuletSlot
          amulets={amuletSlots}
          maxSlots={maxAmuletSlots}
          scaleMultiplier={stageScale}
          dimForCombatLock={handLockedForMonsterPhase}
          disableAnimations={isWaterfallLocked || fullBoardInteractionLocked || handLockedForMonsterPhase}
          onDrop={(card) => {
                if (isWaterfallLocked || isDefeatAnimationPlaying || playerTargetingActive || fullBoardInteractionLocked || handLockedForMonsterPhase || heroStunned) return;
            handleCardToSlot(card, 'slot-amulet');
          }}
          onDragStart={(card) => {
                if (isWaterfallLocked || isDefeatAnimationPlaying || playerTargetingActive || fullBoardInteractionLocked || handLockedForMonsterPhase || heroStunned) return;
            setDraggedCard(card);
            setDraggedEquipment(null);
            setDraggedCardSource('amulet');
            startDragSession();
          }}
          onDragEnd={() => {
            setDraggedCard(null);
            setDraggedCardSource((current) => (current === 'amulet' ? null : current));
          }}
          isDropTarget={
            !isWaterfallLocked &&
            !isDefeatAnimationPlaying &&
            !playerTargetingActive &&
            !fullBoardInteractionLocked &&
            !handLockedForMonsterPhase &&
            !heroStunned &&
            draggedCard?.type === 'amulet'
          }
          isStunFrozen={heroStunned}
          onCardClick={handleCardClick}
        />
      ),
    },
    {
      id: 'hero-row-equipment-1',
      dropZone: 'other',
      render: () => (
        <>
          <EquipmentSlot
            type="equipment"
            slotId="slot-equipment-1"
            item={equipmentSlot1}
            reserveItems={equipmentSlot1Reserve}
            slotCapacity={equipmentSlotCapacity.equipmentSlot1}
            onSwapToTop={(rIdx) => swapEquipmentToTop('equipmentSlot1', rIdx)}
            statModifier={equipmentSlot1StatModifier}
            scaleMultiplier={stageScale}
            permanentDamageBonus={getEquipmentSlotBonus('equipmentSlot1', 'damage')}
            permanentShieldBonus={getEquipmentSlotBonus('equipmentSlot1', 'shield')}
            tempAttackBonus={
              (tempAttackSuppressedByBuildingAura.has('equipmentSlot1')
                ? 0
                : (slotTempAttack.equipmentSlot1 ?? 0)) + (berserkTurnBuff.equipmentSlot1 ?? 0)
            }
            tempShieldBonus={slotTempArmor.equipmentSlot1}
            weaponSwingAnimation={Boolean(weaponSwingStates.equipmentSlot1)}
            weaponSwingVariant={weaponSwingVariant.equipmentSlot1}
            shieldBlockAnimation={Boolean(shieldBlockStates.equipmentSlot1)}
            shieldBlockVariant={shieldBlockVariant.equipmentSlot1}
            isExhaustedThisTurn={
              engagedMonsters.some(m => !monsterDefeatStates[m.id]) &&
              combatState.heroAttacksThisTurn.equipmentSlot1 &&
              extraAttackCharges <= 0 &&
              (!berserkerRageActive || Boolean(berserkerSlotUsed.equipmentSlot1)) &&
              (!amuletEffects.hasFlash || Boolean(flashSlotUsed.equipmentSlot1)) &&
              (!gambitExtraActive || (gambitSlotUsed.equipmentSlot1 ?? 0) >= gambitExtraPerSlot) &&
              (!(equipmentSlot1 as any)?.weaponExtraAttack || Boolean(weaponExtraAttackUsed.equipmentSlot1))
            }
            slotActionCount={slotActionCount1}
            isUnbreakable={unbreakableUntilWaterfall.equipmentSlot1}
            isStunFrozen={heroStunned}
            onDrop={(card) => {
              if (isWaterfallLocked || isDefeatAnimationPlaying || playerTargetingActive || fullBoardInteractionLocked || heroStunned) return;
              handleCardToSlot(card, 'slot-equipment-1');
            }}
            onDragStart={(equipment) => {
              if (isWaterfallLocked || isDefeatAnimationPlaying || playerTargetingActive || fullBoardInteractionLocked || heroStunned) return;
              setDraggedEquipment(equipment);
              setDraggedCard(null);
              setDraggedCardSource(equipment?.fromSlot ?? 'equipmentSlot1');
              startDragSession();
            }}
            onDragEnd={() => {
              setDraggedEquipment(null);
              setDraggedCardSource((current) => (current === 'equipmentSlot1' ? null : current));
            }}
            isDropTarget={equipmentSlot1DropAvailable}
            isCombatDropTarget={equipmentSlot1MonsterTarget}
            heroSkillHighlight={equipmentSlot1Highlight}
            heroSkillLabel={slotTargetingLabel}
            onClick={
              slotTargetingActive
                ? () => handleSlotTargetSelection('equipmentSlot1')
                : undefined
            }
            onCardClick={handleCardClick}
          />
          {showBlockButtons &&
            renderBlockButton('equipmentSlot1', 'Block (Left)', !canShieldBlock('equipmentSlot1') || (combatState.slotDurabilityUsedThisTurn?.equipmentSlot1 ?? 0) >= blockDurabilityPerSlot)}
        </>
      ),
    },
    {
      id: 'hero-row-hero',
      dropZone: 'other',
      innerRef: heroCellRef,
      render: () => (
        <>
          <HeroCard
            hp={hp}
            maxHp={maxHp}
            scaleMultiplier={stageScale}
            onDrop={(card) => {
              if (
                (isWaterfallLocked && card.type !== 'magic') ||
                playerTargetingActive ||
                fullBoardInteractionLocked
              ) {
                return;
              }
              handleCardToHero(card);
            }}
            isDropTarget={heroCardDropHighlight}
            image={heroVariant.image}
            name={heroVariant.name}
            classTitle={heroVariant.classTitle}
            takingDamage={takingDamage}
            healing={healing}
            bleedAnimation={heroBleedActive}
            showAttackIndicator={
              combatState.engagedMonsterIds.length > 0 && combatState.currentTurn === 'hero'
            }
            heroSkillInfo={heroSkillInfo}
            extraHeroSkillInfos={extraHeroSkillInfos}
            heroSkillMessage={heroSkillPrompt}
            onHeroSkillClick={
              heroSkillInfo && selectedHeroSkillDef?.type === 'active'
                ? handleHeroSkillButtonClick
                : undefined
            }
            onHeroSkillCancel={heroSkillTargeting ? cancelHeroSkillAction : undefined}
            onExtraHeroSkillClick={handleExtraHeroSkillButtonClick}
            heroSkillButtonRef={heroSkillButtonRef}
            heroMagicInfo={heroMagicUiState}
            onHeroMagicTrigger={handleHeroMagicTrigger}
            heroMagicChoice={null}
            onHeroMagicChoice={undefined}
            onHeroMagicCancel={undefined}
            potionChoice={null}
            onPotionChoice={undefined}
            onPotionCancel={undefined}
            spellDamageBonus={permanentSpellDamageBonus}
            spellLifesteal={permanentSpellLifesteal}
            stunCap={stunCap}
            onHeroClick={
              playerTargetingActive || fullBoardInteractionLocked
                ? undefined
                : () => {
                    setHeroDetailsOpen(true);
                  }
            }
          />
          {showBlockButtons && renderBlockButton('hero', 'Block (Hero)', false)}
        </>
      ),
    },
    {
      id: 'hero-row-equipment-2',
      dropZone: 'other',
      render: () => (
        <>
          <EquipmentSlot
            type="equipment"
            slotId="slot-equipment-2"
            item={equipmentSlot2}
            reserveItems={equipmentSlot2Reserve}
            slotCapacity={equipmentSlotCapacity.equipmentSlot2}
            onSwapToTop={(rIdx) => swapEquipmentToTop('equipmentSlot2', rIdx)}
            statModifier={equipmentSlot2StatModifier}
            scaleMultiplier={stageScale}
            permanentDamageBonus={getEquipmentSlotBonus('equipmentSlot2', 'damage')}
            permanentShieldBonus={getEquipmentSlotBonus('equipmentSlot2', 'shield')}
            tempAttackBonus={
              (tempAttackSuppressedByBuildingAura.has('equipmentSlot2')
                ? 0
                : (slotTempAttack.equipmentSlot2 ?? 0)) + (berserkTurnBuff.equipmentSlot2 ?? 0)
            }
            tempShieldBonus={slotTempArmor.equipmentSlot2}
            weaponSwingAnimation={Boolean(weaponSwingStates.equipmentSlot2)}
            weaponSwingVariant={weaponSwingVariant.equipmentSlot2}
            shieldBlockAnimation={Boolean(shieldBlockStates.equipmentSlot2)}
            shieldBlockVariant={shieldBlockVariant.equipmentSlot2}
            isExhaustedThisTurn={
              engagedMonsters.some(m => !monsterDefeatStates[m.id]) &&
              combatState.heroAttacksThisTurn.equipmentSlot2 &&
              extraAttackCharges <= 0 &&
              (!berserkerRageActive || Boolean(berserkerSlotUsed.equipmentSlot2)) &&
              (!amuletEffects.hasFlash || Boolean(flashSlotUsed.equipmentSlot2)) &&
              (!gambitExtraActive || (gambitSlotUsed.equipmentSlot2 ?? 0) >= gambitExtraPerSlot) &&
              (!(equipmentSlot2 as any)?.weaponExtraAttack || Boolean(weaponExtraAttackUsed.equipmentSlot2))
            }
            slotActionCount={slotActionCount2}
            isUnbreakable={unbreakableUntilWaterfall.equipmentSlot2}
            isStunFrozen={heroStunned}
            onDrop={(card) => {
              if (isWaterfallLocked || isDefeatAnimationPlaying || playerTargetingActive || fullBoardInteractionLocked || heroStunned) return;
              handleCardToSlot(card, 'slot-equipment-2');
            }}
            onDragStart={(equipment) => {
              if (isWaterfallLocked || isDefeatAnimationPlaying || playerTargetingActive || fullBoardInteractionLocked || heroStunned) return;
              setDraggedEquipment(equipment);
              setDraggedCard(null);
              setDraggedCardSource(equipment?.fromSlot ?? 'equipmentSlot2');
              startDragSession();
            }}
            onDragEnd={() => {
              setDraggedEquipment(null);
              setDraggedCardSource((current) => (current === 'equipmentSlot2' ? null : current));
            }}
            isDropTarget={equipmentSlot2DropAvailable}
            isCombatDropTarget={equipmentSlot2MonsterTarget}
            heroSkillHighlight={equipmentSlot2Highlight}
            heroSkillLabel={slotTargetingLabel}
            onClick={
              slotTargetingActive
                ? () => handleSlotTargetSelection('equipmentSlot2')
                : undefined
            }
            onCardClick={handleCardClick}
          />
          {showBlockButtons &&
            renderBlockButton('equipmentSlot2', 'Block (Right)', !canShieldBlock('equipmentSlot2') || (combatState.slotDurabilityUsedThisTurn?.equipmentSlot2 ?? 0) >= blockDurabilityPerSlot)}
        </>
      ),
    },
    {
      id: 'hero-row-backpack',
      dropZone: 'backpack',
      render: () => (
        <BackpackZone
          backpackCount={backpackItems.length}
          capacity={backpackCapacity}
          onDrop={(card) => {
            if (isWaterfallLocked || isDefeatAnimationPlaying || playerTargetingActive || fullBoardInteractionLocked) return;
            handleCardToSlot(card, 'slot-backpack');
          }}
          isDropTarget={
            !isWaterfallLocked &&
            !isDefeatAnimationPlaying &&
            !playerTargetingActive &&
            !fullBoardInteractionLocked &&
            !(draggedCardSource === 'amulet' && draggedCard && !isRecyclableFromHand(draggedCard)) &&
            (
              (draggedCard !== null &&
              !draggedEquipment &&
              (
                (backpackItems.length < backpackCapacity &&
                canCardGoToBackpack(draggedCard) &&
                !handCards.some(c => c.id === draggedCard.id))
                ||
                handCards.some(c => c.id === draggedCard.id)
                ||
                (draggingDungeonMonsterForPersuade && backpackItems.length < backpackCapacity)
                ||
                (draggedCardSource === 'amulet' && isRecyclableFromHand(draggedCard))
              ))
              ||
              (draggedEquipment && isPermRecycleEquipment(draggedEquipment as GameCardData))
            )
          }
          onOpenViewer={handleBackpackClick}
        />
      ),
    },
    {
      id: 'hero-row-class-deck',
      dropZone: 'other',
      innerClassName: 'bg-card-foreground/5 rounded-lg',
      render: () => (
        <ClassDeck
          classCards={classDeck}
          className="w-full h-full"
          deckName="Knight Deck"
          onCardSelect={handleCardClick}
        />
      ),
    },
  ];

  const remainingCardsCount = remainingDeck.length;

  const handleDeckClick = useCallback(() => {
    if (fullBoardInteractionLockedRef.current) return;
    setDeckViewerOpen(true);
  }, []);

  const handleGraveyardDropStable = useCallback((card: GameCardData) => {
    if (graveyardDropGuardRef.current.blocked) return;
    handleSellCard(card);
  }, [handleSellCard]);

  const handleShopMinimize = useCallback(() => setShopModalMinimized(true), [setShopModalMinimized]);
  const handleEventMinimize = useCallback(() => setEventModalMinimized(true), [setEventModalMinimized]);
  const handleGameOverMinimize = useCallback(() => setGameOverMinimized(true), []);

  const canDiscoverSkill = useMemo(() => {
    const ownedCount = (selectedHeroSkill ? 1 : 0) + extraHeroSkills.length;
    return allHeroSkills.length - ownedCount >= 3;
  }, [selectedHeroSkill, extraHeroSkills.length]);

  const discoverSkillDisabledReason = useMemo(() => {
    const ownedCount = (selectedHeroSkill ? 1 : 0) + extraHeroSkills.length;
    return allHeroSkills.length - ownedCount < 3
      ? '已学习太多技能，没有足够的未学技能可供选择。'
      : undefined;
  }, [selectedHeroSkill, extraHeroSkills.length]);

  const permanentSkillStacks = useMemo(() => ({
    '潮涌铸甲': bulwarkPassiveActive + bulwarkTempArmorStacks,
    '潮涌铸甲·瀑流': bulwarkPassiveActive,
    '潮涌铸甲·格挡': bulwarkTempArmorStacks,
  }), [bulwarkPassiveActive, bulwarkTempArmorStacks]);

  const heroCapacityLimits = useMemo(() => ({
    hand: effectiveHandLimit,
    backpack: backpackCapacity,
    amuletSlots: maxAmuletSlots,
    equipmentSlotLeft: equipmentSlotCapacity.equipmentSlot1 ?? 1,
    equipmentSlotRight: equipmentSlotCapacity.equipmentSlot2 ?? 1,
  }), [effectiveHandLimit, backpackCapacity, maxAmuletSlots, equipmentSlotCapacity.equipmentSlot1, equipmentSlotCapacity.equipmentSlot2]);
  const showMonsterAttackIndicator = Boolean(
    handLockedForMonsterPhase && engagedMonsters.length > 0,
  );
  const activeSwordMonsterId = combatState.pendingBlock?.monsterId ?? null;

  const updateSwordVectors = useCallback(() => {
    if (!showMonsterAttackIndicator) {
      setSwordVectors({});
      return;
    }

    const boardEl = boardRef.current;
    const heroEl = heroCellRef.current;
    if (!boardEl || !heroEl) {
      setSwordVectors({});
      return;
    }

    const boardRect = boardEl.getBoundingClientRect();
    const heroRect = heroEl.getBoundingClientRect();
    const heroCenter = {
      x: heroRect.left + heroRect.width / 2,
      y: heroRect.top + heroRect.height / 2,
    };

    const vectors: Record<string, SwordVector> = {};
    combatState.engagedMonsterIds.forEach(monsterId => {
      const monsterEl = monsterCellRefs.current[monsterId];
      if (!monsterEl) return;

      const monsterRect = monsterEl.getBoundingClientRect();
      const monsterCenter = {
        x: monsterRect.left + monsterRect.width / 2,
        y: monsterRect.top + monsterRect.height / 2,
      };

      const dx = heroCenter.x - monsterCenter.x;
      const dy = heroCenter.y - monsterCenter.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (!length) return;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      const midX = (monsterCenter.x + heroCenter.x) / 2 - boardRect.left;
      const midY = (monsterCenter.y + heroCenter.y) / 2 - boardRect.top;

      vectors[monsterId] = {
        left: midX,
        top: midY,
        angle,
        length,
      };
    });

    setSwordVectors(vectors);
  }, [combatState.engagedMonsterIds, showMonsterAttackIndicator, activeCards]);

  useEffect(() => {
    if (!showMonsterAttackIndicator) {
      setSwordVectors({});
      return;
    }

    updateSwordVectors();
    const handleResize = () => updateSwordVectors();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [showMonsterAttackIndicator, updateSwordVectors]);

  return (
    <div ref={gameSurfaceRef} className="h-full w-full bg-background flex flex-col relative overflow-hidden" style={{ ...gridStyleVars, ...((minimizedModalLocksBoard || gameOver) ? { pointerEvents: 'none' } : {}) } as React.CSSProperties}>
      {/* Header - Fixed height */}
      <div className="flex-shrink-0" ref={headerWrapperRef}>
        <GameHeader
          hp={hp}
          maxHp={maxHp}
          gold={gold}
          cardsRemaining={remainingCardsCount}
          turnCount={turnCount}
          shopLevel={shopLevel}
          persuadeLevel={persuadeLevel}
          persuadeCost={Math.max(0, PERSUADE_COST + persuadeCostModifier - persuadeTempDiscount)}
          persuadeTempDiscount={persuadeTempDiscount}
          totalWins={totalWins}
          deckFlyTargetRef={deckFlyTargetRef}
          onDeckClick={handleDeckClick}
          onNewGame={handleNewGame}
        />
      </div>
      
      {/* Main game area - Flexible height */}
      <div className={`flex-grow min-h-0 w-full px-2 relative z-10 ${isFlat ? 'py-0' : 'py-3 md:py-4'} md:px-4`}>
        <div className={`flex flex-col h-full ${isFlat ? 'gap-0' : 'gap-3'}`}>
          <div
            ref={boardRef}
            className="flex-1 min-h-0 relative flex justify-start lg:justify-center"
          >
            <div ref={gridWrapperRef} className="relative flex-1 w-full">
              {/* 3×7 Card Grid (6 dungeon columns + 1 utility column) */}
              <div 
                className="game-grid grid mx-auto h-full max-w-[1350px]"
                style={{ 
                  gridAutoRows: 'minmax(0, 1fr)'
                }}>
          {/* Row 1: Preview Row - DUNGEON_COLUMN_COUNT cards + DiceRoller */}
          {DUNGEON_COLUMNS.map((index) => {
            const card = previewCards[index];
            const isDroppingPreview = waterfallAnimation.droppingSlots.includes(index);
            const isDiscardingPreview = waterfallAnimation.discardSlot === index;
            const isDealingPreview = waterfallAnimation.dealingSlots.includes(index);
            const isDeckReturnDiscard =
              isDiscardingPreview && waterfallAnimation.discardDestination === 'deck';
            const flyVector = isDeckReturnDiscard
              ? (previewDeckReturnVectors[index] ?? DECK_RETURN_VECTOR_DEFAULT)
              : (previewGraveyardVectors[index] ?? GRAVEYARD_VECTOR_DEFAULT);
            const previewAnimationStyle: CSSProperties & Record<`--${string}`, string> = isDeckReturnDiscard
              ? {
                  '--deck-return-offset-x': `${flyVector.offsetX}px`,
                  '--deck-return-offset-y': `${flyVector.offsetY}px`,
                }
              : {
                  '--graveyard-offset-x': `${flyVector.offsetX}px`,
                  '--graveyard-offset-y': `${flyVector.offsetY}px`,
                };
            const previewAnimationClass = [
              isDroppingPreview ? 'animate-preview-drop' : '',
              isDiscardingPreview && !isDeckReturnDiscard ? 'animate-preview-graveyard' : '',
              isDiscardingPreview && isDeckReturnDiscard ? 'animate-preview-deck-return' : '',
              isDealingPreview ? 'animate-preview-deal' : '',
            ]
              .filter(Boolean)
              .join(' ');

            const previewStackedCards = previewCardStacks[index] ?? [];
            const hasPreviewStack = previewStackedCards.length > 0;
            const isPreviewAnimating = isDroppingPreview || isDiscardingPreview || isDealingPreview;

            return card ? (
              <div 
                key={`preview-${index}`}
                className={`opacity-60 ${cellWrapperClass}${hasPreviewStack ? ' relative overflow-visible' : ''}`}
                data-testid={`preview-card-${index}`}
                ref={el => setPreviewCellRef(index, el)}
              >
                <div 
                  className={`${cellInnerClass} ${hasPreviewStack ? 'relative' : ''} ${previewAnimationClass}`.trim()}
                  style={previewAnimationStyle}
                >
                  {hasPreviewStack && previewStackedCards.map((stackCard, sIdx) => {
                    if (isPreviewAnimating) {
                      return (
                        <div
                          key={stackCard.id}
                          className="absolute inset-0 pointer-events-none"
                          style={{ zIndex: -1, opacity: 0, padding: 'var(--dh-card-padding, 0.25rem)' }}
                        >
                          <GameCard card={stackCard} disableInteractions />
                        </div>
                      );
                    }
                    const offsetStep = 8;
                    const y = -(previewStackedCards.length - sIdx) * offsetStep;
                    return (
                      <div
                        key={stackCard.id}
                        className="absolute inset-0 rounded-md overflow-hidden pointer-events-none"
                        style={{
                          zIndex: 0,
                          transform: `translateY(${y}%)`,
                          opacity: 0.4 - sIdx * 0.1,
                          filter: 'brightness(0.6)',
                          padding: 'var(--dh-card-padding, 0.25rem)',
                        }}
                      >
                        <GameCard card={stackCard} disableInteractions />
                      </div>
                    );
                  })}
                  <GameCard
                    card={card}
                    className={hasPreviewStack ? 'relative z-[5]' : ''}
                    disableInteractions
                    onClick={() => handleCardClick(card)}
                  />
                  {hasPreviewStack && (
                    <div className="absolute top-[-4px] right-[-4px] z-40 bg-amber-500 text-white rounded-full w-5 h-5 flex items-center justify-center border-2 border-background shadow-md font-bold text-xs pointer-events-none">
                      {previewStackedCards.length + 1}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div 
                key={`preview-empty-${index}`} 
                className={cellWrapperClass}
                ref={el => setPreviewCellRef(index, el)}
              >
                <div 
                  className={cellInnerClass}
                  style={previewAnimationStyle}
                />
              </div>
            );
          })}
          
          {/* Row 1, last col: DiceRoller */}
          <div className={cellWrapperClass}>
            <div className={cellInnerClass}>
              <DiceRoller 
                onRoll={(value) => console.log('Rolled:', value)}
                className="w-full h-full"
                scaleMultiplier={stageScale}
              />
            </div>
          </div>

          {/* Row 2: Active Row - DUNGEON_COLUMN_COUNT cards + GraveyardZone */}
          {DUNGEON_COLUMNS.map((index) => {
            const card = activeCards[index];
            const colWidth = rageStripWidth;
            const isEngagedMonster = Boolean(card && card.type === 'monster' && isMonsterEngaged(card.id));
            const isResolvingCard = resolvingDungeonCardId === card?.id;
            const isEventPendingCell = isResolvingCard && eventPendingLocked;
            const isMonsterTurnLock =
              showMonsterAttackIndicator ||
              isWaterfallLocked ||
              isDefeatAnimationPlaying ||
              fullBoardInteractionLocked;
            const monsterTargetHighlight = Boolean(
              monsterTargetingActive &&
                card &&
                (card.type === 'monster' || card.type === 'building'),
            );
            const dungeonTargetHighlight =
              dungeonTargetingActive &&
              (pendingMagicAction?.effect === 'return-dungeon-bottom' ||
                pendingMagicAction?.effect === 'shuffle-dungeon' ||
                pendingMagicAction?.effect === 'dungeon-swap-select' ||
                pendingMagicAction?.effect === 'dungeon-preview-swap' ||
                pendingMagicAction?.effect === 'fate-swap');
            const monsterLayerValue =
              card && card.type === 'monster'
                ? Math.min(4, Math.max(card.currentLayer ?? card.hpLayers ?? card.fury ?? 0, 0))
                : 0;

            if (!card) {
              return (
                <div 
                  key={`active-empty-${index}`} 
                  className={cellWrapperClass}
                  ref={el => setActiveCellRef(index, el)}
                />
              );
            }

            const activeStackedCards = activeCardStacks[index] ?? [];
            const hasActiveStack = activeStackedCards.length > 0;

            const gameCardNode = (
              <>
                {hasActiveStack && activeStackedCards.map((stackCard, sIdx) => {
                  const offsetStep = 8;
                  const y = -(activeStackedCards.length - sIdx) * offsetStep;
                  return (
                    <div
                      key={stackCard.id}
                      className="absolute inset-0 rounded-md overflow-hidden pointer-events-none"
                      style={{
                        zIndex: 0,
                        transform: `translateY(${y}%)`,
                        opacity: 0.5 - sIdx * 0.1,
                        filter: 'brightness(0.7)',
                        padding: 'var(--dh-card-padding, 0.25rem)',
                      }}
                    >
                      <GameCard card={stackCard} disableInteractions />
                    </div>
                  );
                })}
                <GameCard
                  card={card}
                  onDragStart={
                    isMonsterTurnLock || playerTargetingActive ? undefined : handleDragStartFromDungeon
                  }
                  onDragEnd={handleDragEndFromDungeon}
                  onWeaponDrop={
                    playerTargetingActive || fullBoardInteractionLocked
                      ? undefined
                      : (weapon) => handleWeaponToMonster(weapon, card)
                  }
                  isWeaponDropTarget={
                    !playerTargetingActive &&
                    !fullBoardInteractionLocked &&
                    !handLockedForMonsterPhase &&
                    (draggedEquipment?.type === 'weapon' || draggedEquipment?.type === 'monster' || (draggedEquipment?.type === 'shield' && !!draggedEquipment?.shieldBashStunRate)) &&
                    (card.type === 'monster' || card.type === 'building')
                  }
                  bleedAnimation={Boolean(monsterBleedStates[card.id])}
                  healAnimation={Boolean(monsterHealStates[card.id])}
                  defeatAnimation={Boolean(monsterDefeatStates[card.id])}
                  className={`${hasActiveStack ? 'relative z-[5]' : ''} ${removingCards.has(card.id) ? 'animate-card-remove' : 'shadow-lg'} ${
                    (isMonsterTurnLock && !monsterTargetHighlight && !dungeonTargetHighlight) ||
                    (isResolvingCard && !isEventPendingCell)
                      ? 'opacity-60 pointer-events-none'
                      : ''
                  } ${
                    monsterTargetHighlight ? 'monster-target-highlight animate-pulse' : ''
                  } ${dungeonTargetHighlight ? 'dungeon-target-highlight animate-pulse' : ''}`.trim()}
                  isEngaged={isEngagedMonster}
                  onClick={() => {
                    if (isEventPendingCell) {
                      setEventModalMinimized(false);
                      return;
                    }
                    if (dungeonTargetingActive) {
                      handleDungeonCardSelection(card);
                      return;
                    }
                    if (
                      monsterTargetingActive &&
                      (card.type === 'monster' || card.type === 'building')
                    ) {
                      handleMonsterTargetSelection(card);
                      return;
                    }
                    if (isMonsterTurnLock || isResolvingCard) return;
                    handleCardClick(card);
                  }}
                />
                {hasActiveStack && (
                  <div className="absolute top-[-4px] right-[-4px] z-40 bg-amber-500 text-white rounded-full w-5 h-5 flex items-center justify-center border-2 border-background shadow-md font-bold text-xs pointer-events-none">
                    {activeStackedCards.length + 1}
                  </div>
                )}
              </>
            );

            const isMonster = card.type === 'monster';

            const rageBaseTranslate = isCompactViewport ? 1 : MONSTER_RAGE_BASE_TRANSLATE_PX;
            const monsterTranslateX = isMonster
              ? rageBaseTranslate +
                (monsterLayerValue > 0
                  ? Math.max(
                      (monsterLayerValue - 1) * colWidth + MONSTER_RAGE_TRANSLATE_ADJUST_PX,
                      0,
                    )
                  : 0)
              : 0;

            const activeCellWrapper = isMonster
              ? `${cellWrapperClass} relative overflow-visible`
              : hasActiveStack
                ? `${cellWrapperClass} relative overflow-visible`
                : cellWrapperClass;

            return (
              <div 
                key={`active-${index}`}
                ref={el => setActiveCellRef(index, el)}
                className={`${activeCellWrapper}${isEventPendingCell ? ' event-pending-cell' : ''}${card?.hasReleaseCharge ? ' fate-blade-charged' : ''}`}
                style={isEventPendingCell ? { pointerEvents: 'auto' } : undefined}
              >
                {isMonster && (
                  <div
                    className="absolute z-0 flex flex-row-reverse overflow-hidden rounded-md bg-destructive/10"
                    style={getMonsterRageOverlayStyle(card.id)}
                  >
                    {[1, 2, 3, 4].map((num) => {
                      const isActiveLayer = monsterLayerValue > 0 && num === monsterLayerValue;
                      const stripsToLeft = num - 1;
                      const stripOffsetPx = stripsToLeft * colWidth;
                      const furyColumnClasses = [
                        'monster-rage-column h-full flex items-center justify-center border-l border-border/20 font-mono font-bold transition-colors',
                        isActiveLayer
                          ? 'bg-destructive/80 text-destructive-foreground shadow-inner shadow-destructive/60'
                          : 'bg-transparent text-destructive/30 opacity-30',
                      ]
                        .filter(Boolean)
                        .join(' ');
                      return (
                        <div
                          key={num}
                          className={furyColumnClasses}
                          style={{ width: `${colWidth}px` }}
                          data-strip-offset={stripOffsetPx}
                        >
                          {num}
                        </div>
                      );
                    })}
                    <div className="flex-1 bg-background/50" />
                  </div>
                )}
                <div
                  ref={isMonster ? registerMonsterCellRef(card.id) : undefined}
                  className={`${cellInnerClass} relative z-20 transition-transform duration-300 ease-out`.trim()}
                  style={{
                    transform:
                      isMonster && monsterTranslateX > 0
                        ? `translateX(-${monsterTranslateX}px)`
                        : 'none',
                  }}
                >
                  {gameCardNode}
                  {isEventPendingCell && (
                    <div
                      className="absolute inset-0 z-30 flex items-center justify-center rounded-md cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEventModalMinimized(false);
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEventModalMinimized(false);
                      }}
                    >
                      <div className="absolute inset-0 rounded-md ring-2 ring-pink-500 animate-pulse" />
                      <div className="bg-pink-600/90 rounded-full px-2.5 py-1 flex items-center gap-1 shadow-lg">
                        <Calendar className="w-3 h-3 text-white" />
                        <span className="text-white text-xs font-bold">待处理</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          
          {/* Row 2, last col: GraveyardZone */}
          <div className={cellWrapperClass}>
            <div className={cellInnerClass} ref={setGraveyardRef}>
              <GraveyardZone
                onDrop={handleGraveyardDropStable}
                isDropTarget={graveyardDropEnabled}
                shouldHighlight={shouldHighlightGraveyard}
                discardedCards={discardedCards}
                onCardSelect={handleCardClick}
              />
            </div>
          </div>

          {/* Row 3: Hero Row - 6 slots (Amulet, Equipment×2, Hero, Backpack, ClassDeck) */}
          {heroRowSlots.map((slot, index) => {
            const innerClass = `${cellInnerClass} relative z-10 ${slot.innerClassName ?? ''}`.trim();
            return (
              <div
                key={slot.id}
                className={`${cellWrapperClass} ${slot.wrapperClassName ?? ''}`.trim()}
                ref={registerHeroRowCellRef(index)}
                {...getHeroRowMagicDropHandlers(slot.dropZone)}
              >
                <div className={innerClass} ref={slot.innerRef}>
                  {slot.render()}
                </div>
              </div>
            );
          })}
              </div>
              <div
                ref={heroFrameRef}
                className={`hero-row-frame ${isFlat ? HERO_GAP_VARIABLE_CLASS_FLAT : HERO_GAP_VARIABLE_CLASS}`}
                style={heroFrameOverlayStyle}
              />
            </div>
            {classDeckFlights.length > 0 && (
              <div className="pointer-events-none absolute inset-0 z-20">
                {classDeckFlights.map(flight => {
                  const cardWidth = gridCardSize?.width ?? 140;
                  const cardHeight = gridCardSize?.height ?? 210;
                  return (
                    <div
                      key={flight.id}
                      ref={el => {
                        if (el) classDeckFlightElementMapRef.current.set(flight.id, el);
                        else classDeckFlightElementMapRef.current.delete(flight.id);
                      }}
                      className="absolute class-flight-card"
                      style={{
                        width: cardWidth,
                        height: cardHeight,
                        opacity: 0,
                        willChange: 'transform, opacity',
                        contain: 'layout style',
                      }}
                    >
                      <GameCard card={flight.card} disableInteractions />
                    </div>
                  );
                })}
              </div>
            )}
            {showMonsterAttackIndicator &&
              Object.entries(swordVectors).map(([monsterId, vector]) => {
                const isActiveSword = activeSwordMonsterId === monsterId;
                return (
                  <div key={`sword-${monsterId}`} className="pointer-events-none absolute inset-0 z-30">
                    <div
                      className={`absolute flex items-center ${isActiveSword ? 'opacity-100 animate-pulse' : 'opacity-30'}`}
                      style={{
                        left: vector.left,
                        top: vector.top,
                        width: vector.length,
                        transform: `translate(-50%, -50%) rotate(${vector.angle}deg)`,
                        transformOrigin: 'center',
                      }}
                    >
                      <div
                        className={`w-full h-1 bg-gradient-to-r from-transparent rounded-full blur-[1px] ${
                          isActiveSword
                            ? 'via-destructive/70 to-destructive'
                            : 'via-destructive/20 to-destructive/20'
                        }`}
                      />
                      <Sword
                        className={`ml-2 w-6 h-6 transform rotate-90 ${
                          isActiveSword
                            ? 'text-destructive drop-shadow-[0_0_14px_rgba(239,68,68,0.9)]'
                            : 'text-destructive/40'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
            {heroSkillArrow && (
              <svg
                className="pointer-events-none absolute inset-0 z-40"
                width="100%"
                height="100%"
              >
                <defs>
                  <marker
                    id="hero-skill-arrowhead"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L8,4 L0,8 z" fill="rgba(139,92,246,0.95)" />
                  </marker>
                </defs>
                <line
                  x1={heroSkillArrow.start.x}
                  y1={heroSkillArrow.start.y}
                  x2={heroSkillArrow.end.x}
                  y2={heroSkillArrow.end.y}
                  stroke="rgba(139,92,246,0.85)"
                  strokeWidth={3}
                  strokeDasharray="6 4"
                  markerEnd="url(#hero-skill-arrowhead)"
                />
                <circle
                  cx={heroSkillArrow.start.x}
                  cy={heroSkillArrow.start.y}
                  r={4}
                  fill="rgba(139,92,246,0.95)"
                />
              </svg>
            )}
      </div>

      {/* Eternal Relics — between hero row frame and hand */}
      <EternalRelicBar
        relics={eternalRelics}
        onRelicClick={handleEternalRelicClick}
      />

      {/* Hand Display - Dedicated space */}
      <div ref={handAreaRef} className={`flex-shrink-0 relative w-full px-2 md:px-6 ${isFlat ? 'pb-0' : 'pb-4'}`}>
        <HandDisplay
          handCards={handCards}
          onPlayCard={handlePlayCardFromHand}
          onDragCardFromHand={handleDragCardFromHand}
          onDragEndFromHand={handleDragEndFromHand}
          maxHandSize={effectiveHandLimit}
          cardSize={gridCardSize} // Pass the measured size to HandDisplay
          disableAnimations={isWaterfallLocked || fullBoardInteractionLocked || handLockedForMonsterPhase}
          dimForCombatLock={handLockedForMonsterPhase}
          onCardClick={handleCardClick}
        />
      </div>

      {/* CombatPanel removed — End Hero Turn button lives in the top-right overlay below */}
      <GameLogPanel
        entries={gameLogEntries}
        onClear={clearGameLog}
        stageScale={stageScale}
      />

      {/* Discard flights: hand → graveyard / backpack */}
      {discardFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-30">
          {discardFlights.map(flight => {
            const cardWidth = gridCardSize?.width ?? 140;
            const cardHeight = gridCardSize?.height ?? 210;
            return (
              <div
                key={flight.id}
                ref={el => {
                  if (el) discardFlightElementMapRef.current.set(flight.id, el);
                  else discardFlightElementMapRef.current.delete(flight.id);
                }}
                className="absolute"
                style={{
                  width: cardWidth,
                  height: cardHeight,
                  opacity: 0,
                  willChange: 'transform, opacity',
                  contain: 'layout style',
                }}
              >
                <GameCard card={flight.card} disableInteractions />
              </div>
            );
          })}
        </div>
      )}

      {/* Steal card flights: hand → Goblin */}
      {stealCardFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[31]">
          {stealCardFlights.map(flight => {
            const cardWidth = gridCardSize?.width ?? 140;
            const cardHeight = gridCardSize?.height ?? 210;
            return (
              <div
                key={flight.id}
                ref={el => {
                  if (el) stealCardFlightElementMapRef.current.set(flight.id, el);
                  else stealCardFlightElementMapRef.current.delete(flight.id);
                }}
                className="absolute"
                style={{
                  width: cardWidth,
                  height: cardHeight,
                  opacity: 0,
                  willChange: 'transform, opacity',
                  contain: 'layout style',
                }}
              >
                <GameCard card={flight.card} disableInteractions />
              </div>
            );
          })}
        </div>
      )}

      {backpackHandFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-30">
          {backpackHandFlights.map(flight => {
            const cardWidth = gridCardSize?.width ?? 140;
            const cardHeight = gridCardSize?.height ?? 210;
            return (
              <div
                key={flight.id}
                ref={el => {
                  if (el) backpackFlightElementMapRef.current.set(flight.id, el);
                  else backpackFlightElementMapRef.current.delete(flight.id);
                }}
                className="absolute"
                style={{
                  width: cardWidth,
                  height: cardHeight,
                  opacity: 0,
                  willChange: 'transform, opacity',
                  contain: 'layout style',
                }}
              >
                <GameCard card={flight.card} disableInteractions />
              </div>
            );
          })}
        </div>
      )}

      {discardShockFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[35]">
          {discardShockFlights.map(flight => (
            <div
              key={flight.id}
              ref={el => {
                if (el) discardShockElementMapRef.current.set(flight.id, el);
                else discardShockElementMapRef.current.delete(flight.id);
              }}
              className="absolute rounded-full border-2 border-amber-300/90 bg-amber-500/20 shadow-[0_0_16px_rgba(251,191,36,0.9)] overflow-hidden ring-2 ring-yellow-200/40"
              style={{
                width: DISCARD_SHOCK_PROJECTILE_SIZE,
                height: DISCARD_SHOCK_PROJECTILE_SIZE,
                opacity: 0,
                willChange: 'transform, opacity',
                contain: 'layout style',
              }}
            >
              {flight.projectileImage ? (
                <img src={flight.projectileImage} alt="" className="h-full w-full object-cover" draggable={false} />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-600" />
              )}
            </div>
          ))}
        </div>
      )}

      {directedCombatFxFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[36]">
          {directedCombatFxFlights.map(flight => {
            const sz =
              flight.kind === 'shield-reflect'
                ? DIRECTED_REFLECT_PROJECTILE_SIZE
                : flight.kind === 'arcane-blade-spell'
                  ? DIRECTED_ARCANE_PROJECTILE_SIZE
                  : flight.kind === 'golem-layer-reflect'
                    ? DIRECTED_GOLEM_LAYER_PROJECTILE_SIZE
                    : DIRECTED_RETALIATION_PROJECTILE_SIZE;
            const isReflect = flight.kind === 'shield-reflect';
            const isArcane = flight.kind === 'arcane-blade-spell';
            const isGolemLayer = flight.kind === 'golem-layer-reflect';
            return (
              <div
                key={flight.id}
                ref={el => {
                  if (el) directedCombatFxElementMapRef.current.set(flight.id, el);
                  else directedCombatFxElementMapRef.current.delete(flight.id);
                }}
                className={
                  isGolemLayer
                    ? 'absolute rounded-full border-2 border-stone-500/95 bg-gradient-to-br from-stone-300/95 via-amber-700/90 to-stone-800/95 shadow-[0_0_20px_rgba(120,83,50,0.9)] ring-2 ring-amber-300/50'
                    : isArcane
                      ? 'absolute rounded-full border-2 border-purple-400/95 bg-gradient-to-br from-violet-300/95 via-purple-500/90 to-indigo-700/90 shadow-[0_0_20px_rgba(139,92,246,0.95)] ring-2 ring-purple-200/50'
                      : isReflect
                        ? 'absolute rounded-full border-2 border-amber-400/95 bg-gradient-to-br from-amber-200/95 via-yellow-400/90 to-orange-500/90 shadow-[0_0_18px_rgba(251,191,36,0.95)] ring-2 ring-amber-100/50'
                        : 'absolute rounded-full border-2 border-rose-800/95 bg-gradient-to-br from-rose-300/95 via-red-600/90 to-red-950/95 shadow-[0_0_22px_rgba(220,38,38,0.85)] ring-2 ring-rose-200/45'
                }
                style={{
                  width: sz,
                  height: sz,
                  opacity: 0,
                  willChange: 'transform, opacity',
                  contain: 'layout style',
                }}
              />
            );
          })}
        </div>
      )}

      {fateSwapFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[37]">
          {fateSwapFlights.map(flight => {
            const cardWidth = gridCardSize?.width ?? 140;
            const cardHeight = gridCardSize?.height ?? 210;
            return (
              <div
                key={flight.id}
                ref={el => {
                  if (el) fateSwapFlightElementMapRef.current.set(flight.id, el);
                  else fateSwapFlightElementMapRef.current.delete(flight.id);
                }}
                className="absolute fate-swap-flight-card"
                style={{
                  width: cardWidth,
                  height: cardHeight,
                  opacity: 0,
                  willChange: 'transform, opacity',
                  contain: 'layout style',
                }}
              >
                <GameCard card={flight.card} disableInteractions />
              </div>
            );
          })}
        </div>
      )}

      {graveyardStackFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[38]">
          {graveyardStackFlights.map(flight => {
            const cardWidth = gridCardSize?.width ?? 140;
            const cardHeight = gridCardSize?.height ?? 210;
            return (
              <div
                key={flight.id}
                ref={el => {
                  if (el) graveyardStackFlightElementMapRef.current.set(flight.id, el);
                  else graveyardStackFlightElementMapRef.current.delete(flight.id);
                }}
                className="absolute"
                style={{
                  width: cardWidth,
                  height: cardHeight,
                  opacity: 0,
                  willChange: 'transform, opacity',
                  contain: 'layout style',
                  filter: 'drop-shadow(0 0 8px rgba(139, 92, 246, 0.7))',
                }}
              >
                <GameCard card={flight.card} disableInteractions />
              </div>
            );
          })}
        </div>
      )}

      {/* Event-pending floating restore button */}
      {eventModalOpen && eventModalMinimized && (
        <div
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-pink-600/90 px-5 py-2.5 shadow-lg cursor-pointer select-none event-pending-restore-btn hover:bg-pink-600 transition-colors"
          style={{ pointerEvents: 'auto' }}
          onClick={() => setEventModalMinimized(false)}
          onTouchEnd={(e) => {
            e.preventDefault();
            setEventModalMinimized(false);
          }}
        >
          <Calendar className="w-4 h-4 text-white" />
          <span className="text-white text-sm font-semibold whitespace-nowrap">
            {currentEventCard?.name ?? '事件'} — 点击恢复
          </span>
        </div>
      )}

      {/* Shop-minimized floating restore button */}
      {shopModalOpen && shopModalMinimized && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-amber-600/90 px-5 py-2.5 shadow-lg cursor-pointer select-none hover:bg-amber-600 transition-colors ${
            eventModalOpen && eventModalMinimized ? 'bottom-32' : 'bottom-20'
          }`}
          style={{ pointerEvents: 'auto' }}
          onClick={() => setShopModalMinimized(false)}
          onTouchEnd={(e) => {
            e.preventDefault();
            setShopModalMinimized(false);
          }}
        >
          <ShoppingBag className="w-4 h-4 text-white" />
          <span className="text-white text-sm font-semibold whitespace-nowrap">
            商店 — 点击恢复
          </span>
        </div>
      )}

      {/* Game-over minimized floating restore button */}
      {gameOver && gameOverMinimized && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full px-5 py-2.5 shadow-lg cursor-pointer select-none transition-colors ${
            victory
              ? 'bg-emerald-600/90 hover:bg-emerald-600'
              : 'bg-red-700/90 hover:bg-red-700'
          } ${
            (eventModalOpen && eventModalMinimized && shopModalOpen && shopModalMinimized) ? 'bottom-44'
            : ((eventModalOpen && eventModalMinimized) || (shopModalOpen && shopModalMinimized)) ? 'bottom-32'
            : 'bottom-20'
          }`}
          style={{ pointerEvents: 'auto' }}
          onClick={() => setGameOverMinimized(false)}
          onTouchEnd={(e) => {
            e.preventDefault();
            setGameOverMinimized(false);
          }}
        >
          {victory
            ? <Trophy className="w-4 h-4 text-white" />
            : <Skull className="w-4 h-4 text-white" />
          }
          <span className="text-white text-sm font-semibold whitespace-nowrap">
            {victory ? '胜利' : '失败'} — 点击恢复
          </span>
        </div>
      )}

      <DeckPeekModal
        state={deckPeekState}
        onClose={() => {
          const needsResolve = deckPeekState?.mode === 'deck-judge-delete' || deckPeekState?.mode === 'dungeon-insight' || deckPeekState?.mode === 'fate-sight';
          setDeckPeekState(null);
          if (needsResolve) {
            deckJudgePeekCloseRef.current?.();
            deckJudgePeekCloseRef.current = null;
          }
        }}
      />

      <HandMagicUpgradeModal
        open={Boolean(handMagicUpgradeModal)}
        onClose={handleHandMagicUpgradeClose}
        handCards={handCards}
        sourceCardId={handMagicUpgradeModal?.sourceCardId ?? null}
        onUpgrade={handleHandMagicUpgradeSelect}
      />

      <MirrorCopyModal
        open={Boolean(mirrorCopyModal)}
        onClose={cancelMirrorCopy}
        equipmentSlot1={equipmentSlot1}
        equipmentSlot2={equipmentSlot2}
        amuletSlots={amuletSlots}
        handCards={handCards}
        onConfirm={resolveMirrorCopy}
      />

      <AmplifyModal
        open={Boolean(amplifyModal)}
        onClose={cancelAmplify}
        equipmentSlot1={equipmentSlot1}
        equipmentSlot2={equipmentSlot2}
        handCards={handCards}
        onConfirm={resolveAmplify}
      />

      <PermGrantModal
        open={Boolean(permGrantModal)}
        onClose={cancelPermGrant}
        handCards={handCards}
        sourceCardId={permGrantModal?.sourceCardId ?? null}
        sourceType={permGrantModal?.sourceType ?? 'magic'}
        onConfirm={resolvePermGrant}
      />

      <GameBoardModals
        overlayZoom={overlayZoom}
        deathWardPrompt={deathWardPrompt}
        onDeathWardConfirm={handleDeathWardConfirm}
        onDeathWardDecline={handleDeathWardDecline}
        daggerSelfDestructPrompt={daggerSelfDestructPrompt}
        onDaggerSelfDestructConfirm={handleDaggerSelfDestructConfirm}
        onDaggerSelfDestructDecline={handleDaggerSelfDestructDecline}
        wraithPassiveUnlockPopup={wraithPassiveUnlockPopup}
        onWraithPassiveUnlockChange={setWraithPassiveUnlockPopup}
        gameOver={gameOver}
        gameOverMinimized={gameOverMinimized}
        victory={victory}
        gold={gold}
        hp={hp}
        maxHp={maxHp}
        onRestart={handleNewGame}
        onGameOverMinimize={handleGameOverMinimize}
        monstersDefeated={monstersDefeated}
        totalDamageTaken={totalDamageTaken}
        totalHealed={totalHealed}
        stageScale={stageScale}
        deckViewerOpen={deckViewerOpen}
        onDeckViewerChange={setDeckViewerOpen}
        remainingDeck={remainingDeck}
        onCardSelect={handleCardClick}
        backpackViewerOpen={backpackViewerOpen}
        onBackpackViewerChange={setBackpackViewerOpen}
        backpackItems={backpackItems}
        backpackCapacity={backpackCapacity}
        permanentMagicRecycleBag={permanentMagicRecycleBag}
        discoverModalOpen={discoverModalOpen}
        discoverOptions={discoverOptions}
        discoverSourceLabel={discoverSourceLabel}
        onDiscoverSelect={handleDiscoverSelect}
        onDiscoverCancel={handleDiscoverCancel}
        graveyardDiscoverState={graveyardDiscoverState}
        onGraveyardDiscoverSelect={handleGraveyardDiscoverSelect}
        onGraveyardDiscoverCancel={handleGraveyardDiscoverCancel}
        ghostBladeExileCards={ghostBladeExileCards}
        onGhostBladeExileConfirm={handleGhostBladeExileConfirm}
        shopModalOpen={shopModalOpen}
        shopModalMinimized={shopModalMinimized}
        shopOfferings={shopOfferings}
        shopLevel={shopLevel}
        canDeleteCardInShop={canDeleteCardInShop}
        shopDeleteDisabledReason={shopDeleteDisabledReason}
        onShopDeleteRequest={handleShopDeleteRequest}
        onShopPurchase={handleShopPurchase}
        onShopClose={handleShopClose}
        onShopMinimize={handleShopMinimize}
        shopSourceEvent={shopSourceEvent?.name ?? undefined}
        shopHealUsed={shopHealUsed}
        onShopHealRequest={handleShopHealRequest}
        shopHealCost={SHOP_HEAL_COST}
        shopLevelUpCost={SHOP_LEVEL_UP_COST}
        shopLevelUpUsed={shopLevelUpUsed}
        onShopLevelUpRequest={handleShopLevelUpRequest}
        shopSkillDiscoverCost={SHOP_SKILL_DISCOVER_COST}
        shopSkillDiscoverUsed={shopSkillDiscoverUsed}
        canDiscoverSkill={canDiscoverSkill}
        discoverSkillDisabledReason={discoverSkillDisabledReason}
        onShopSkillDiscoverRequest={handleShopSkillDiscoverRequest}
        shopSkillSelectOpen={shopSkillSelectOpen}
        shopSkillOptions={shopSkillOptions}
        onShopSkillSelect={handleShopSkillSelect}
        eventTransformState={eventTransformState}
        deleteModalOpen={deleteModalOpen}
        onDeleteModalChange={handleDeleteModalOpenChange}
        handCards={handCards}
        equipmentCards={flatEquipmentCards}
        amuletCards={flatAmuletCards}
        onDeleteCardConfirm={handleDeleteCardConfirm}
        cardActionContext={cardActionContext}
        selectedCard={selectedCard}
        detailsModalOpen={detailsModalOpen}
        onDetailsModalChange={handleDetailsModalChange}
        currentTurn={turnCount}
        monsterRewardPreviewForModal={monsterRewardPreviewForModal}
        heroDetailsOpen={heroDetailsOpen}
        onHeroDetailsChange={setHeroDetailsOpen}
        heroVariant={heroVariant}
        heroDetailsStats={heroDetailsStats}
        heroDetailsSkills={heroDetailsSkills}
        permanentSkills={permanentSkills}
        permanentSkillStacks={permanentSkillStacks}
        heroMagicInfo={heroMagicUiState}
        heroCapacityLimits={heroCapacityLimits}
        activeMonsterReward={activeMonsterReward}
        onMonsterRewardSelect={handleMonsterRewardSelection}
        persuadeOpen={Boolean(persuadeState)}
        persuadeMonster={persuadeState?.monster ?? null}
        persuadeCost={(() => {
          let c = Math.max(0, PERSUADE_COST + persuadeCostModifier - (persuadeDiscountRef.current?.costReduction ?? 0));
          if (persuadeState?.monster && engine.getState().persuadeSameTargetCostHalve && engine.getState().lastPersuadeTargetId === persuadeState.monster.id) {
            c = Math.floor(c / 2);
          }
          return c;
        })()}
        persuadeThreshold={persuadeState?.threshold ?? 10}
        persuadeSuccessRate={persuadeState?.successRate ?? 50}
        persuadeTargetLabel={persuadeState?.targetSlot === 'backpack' ? '背包' : '装备栏'}
        persuadePhase={persuadeState?.phase ?? 'confirm'}
        persuadeDiceValue={persuadeState?.diceValue ?? null}
        persuadeSuccess={persuadeState?.success ?? null}
        persuadeRollKey={persuadeRollKey}
        persuadeLevel={persuadeLevel}
        onPersuadeConfirm={handlePersuadeConfirm}
        onPersuadeDiceResult={handlePersuadeDiceResult}
        onPersuadeClose={handlePersuadeClose}
        upgradeModalOpen={upgradeModalOpen}
        onUpgradeModalChange={setUpgradeModalOpen}
        equipmentSlot1={equipmentSlot1}
        equipmentSlot2={equipmentSlot2}
        amuletSlots={amuletSlots}
        onCardUpgrade={handleCardUpgrade}
        eventModalOpen={eventModalOpen}
        eventModalMinimized={eventModalMinimized}
        currentEventCard={currentEventCard}
        onEventChoice={handleEventChoice}
        eventChoiceStates={eventChoiceStates}
        onEventMinimize={handleEventMinimize}
        eventDiceModal={eventDiceModal}
        eventDiceRollKey={eventDiceRollKey}
        onDiceRollResult={handleDiceRollResult}
        onDiceModalClose={cancelDiceModal}
        magicChoiceModal={magicChoiceModal}
        onMagicChoice={handleMagicChoice}
        equipmentPrompt={equipmentPrompt}
        onEquipmentPromptSelect={handleEquipmentPromptSelection}
        onEquipmentPromptCancel={cancelEquipmentPrompt}
        heroMagicChoicePrompt={heroMagicChoicePrompt}
        onCancelHeroMagicAction={cancelHeroMagicAction}
        onHeroMagicChoice={handleHeroMagicChoice}
        potionChoiceDialogOpen={potionChoiceDialogOpen}
        onCancelPotionAction={cancelPotionAction}
        onPotionChoiceSelection={handlePotionChoiceSelection}
        showSkillSelection={showSkillSelection}
        onSkillSelection={handleSkillSelection}
        showCardDraft={showCardDraft}
        cardDraftPool={cardDraftPool}
        onCardDraftComplete={handleCardDraftComplete}
        classCardPreview={classCardPreviewIdRef.current ? (classDeck.find(c => c.id === classCardPreviewIdRef.current) ?? null) : null}
        isCombatPanelVisible={isCombatPanelVisible}
        combatCurrentTurn={combatState.currentTurn}
        headerHeight={headerHeight}
        endHeroTurnDisabled={endHeroTurnDisabled}
        onEndHeroTurn={endHeroTurn}
        undoCount={undoCount}
        fullBoardInteractionLocked={fullBoardInteractionLocked}
        onUndo={handleUndo}
      />

      {/* Eternal Relic Detail Modal */}
      {selectedEternalRelic && (
        <Dialog open={eternalRelicModalOpen} onOpenChange={setEternalRelicModalOpen}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-300">
                <img
                  src={selectedEternalRelic.image}
                  alt={selectedEternalRelic.name}
                  className="w-10 h-10 rounded-full border-2 border-amber-400/60 object-cover"
                />
                {selectedEternalRelic.name}
              </DialogTitle>
              <DialogDescription className="text-sm pt-2">
                {selectedEternalRelic.description}
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
