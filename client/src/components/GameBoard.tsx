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
import { type LogEntry, type LogEntryType } from './GameLogPanel';
import GameLogContainer from './game-board/components/GameLogContainer';
import EternalRelicContainer from './game-board/components/EternalRelicContainer';
import FloatingPillsContainer from './game-board/components/FloatingPillsContainer';
import SwordOverlay from './game-board/components/SwordOverlay';
import { useSwordOverlay } from './game-board/hooks/useSwordOverlay';
import { useCombatAnimationTriggers } from './game-board/hooks/useCombatAnimationTriggers';
import { useDirectedCombatFx } from './game-board/hooks/useDirectedCombatFx';
import HandContainer from './game-board/components/HandContainer';
import { inFlightHandStore } from './game-board/in-flight-hand-store';
import { Swords, Undo2, Wrench, Dices, ShieldOff } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import AmuletSlot from './AmuletSlot';
import GraveyardZone from './GraveyardZone';
import VictoryDefeatModal from './VictoryDefeatModal';
import DeckViewerModal from './DeckViewerModal';
import EventChoiceModal, { type EventChoiceAvailability } from './EventChoiceModal';
import EventDiceModal from './EventDiceModal';
import EquipmentSelectModal from './EquipmentSelectModal';
import ClassDeck from './ClassDeck';
import HeroSkillSelection from './HeroSkillSelection';
import BackpackZone from './BackpackZone';
import BackpackViewerModal from './BackpackViewerModal';
import MonsterRewardModal from '@/components/MonsterRewardModal';
import MonsterPersuadeModal, { type PersuadePhase } from './MonsterPersuadeModal';
import HeroDetailsModal from './HeroDetailsModal';
import MagicChoiceModal from './MagicChoiceModal';
import { PreviewRow } from './game-board/components/PreviewRow';
import { ActiveRow, type ActiveRowInteractionState, type ActiveRowCallbacks } from './game-board/components/ActiveRow';
import { HeroRowSection } from './game-board/components/HeroRowSection';
import { NarrowSidebar } from './game-board/components/NarrowSidebar';
import FlightOverlayContainer, {
  type FlightOverlayHandle,
} from './game-board/components/FlightOverlayContainer';
import { InCellFlipOverlayLayer } from './game-board/components/InCellFlipOverlayLayer';
import { useInCellFlipAnimation } from './game-board/hooks/useInCellFlipAnimation';
import { DimensionWarpOverlayLayer } from './game-board/components/DimensionWarpOverlayLayer';
import { useDimensionWarpAnimation } from './game-board/hooks/useDimensionWarpAnimation';
import { MonsterSkillFloatOverlayLayer } from './game-board/components/MonsterSkillFloatOverlayLayer';
import { useMonsterSkillFloats } from './game-board/hooks/useMonsterSkillFloats';
import { StunReleasedGoldOverlayLayer } from './game-board/components/StunReleasedGoldOverlayLayer';
import { useStunReleasedGoldFx } from './game-board/hooks/useStunReleasedGoldFx';
import { useOverlayScale } from '@/hooks/use-overlay-scale';
import { useGameEngine, useShallowGameState, useDispatch, useGameEvent } from '@/hooks/useGameEngine';
import { useMultiplayerSync } from '@/hooks/useMultiplayerSync';
import { useCardOperations, type CardOperationsDeps } from '@/hooks/useCardOperations';
import { useCombatActions, type CombatActionsDeps } from '@/hooks/useCombatActions';
import { useCombatVisuals } from '@/hooks/useCombatVisuals';
import { useFlightState } from '@/hooks/useFlightState';
import { useShopHandlers, type ShopHandlersDeps } from '@/hooks/useShopHandlers';
import { useCardPlayHandlers, type CardPlayHandlersDeps } from '@/hooks/useCardPlayHandlers';
import { useHeroActions, type HeroActionsDeps } from '@/hooks/useHeroActions';
import { useEventSystem, type EventSystemDeps } from '@/hooks/useEventSystem';
import { createInitialGameState, computeReturnToDeckInsertion } from '@/game-core';
import { serializeGameState } from '@/game-core/persistence';
import type { MagicChoiceModalState, GameState } from '@/game-core/types';
// import { useToast } from '@/hooks/use-toast'; // Disabled toast notifications
import { ModalCallbacksProvider, type ModalCallbacks } from './game-board/contexts/ModalCallbacksContext';
import { ModalUIProvider, type ModalUIState } from './game-board/contexts/ModalUIContext';
import { ShopContainer } from './game-board/containers/ShopContainer';
import { EventContainer } from './game-board/containers/EventContainer';
import { CombatDiceContainer } from './game-board/containers/CombatDiceContainer';
import { HeroInfoContainer } from './game-board/containers/HeroInfoContainer';
import { DiscoverContainer } from './game-board/containers/DiscoverContainer';
import { CardViewerContainer } from './game-board/containers/CardViewerContainer';
import { RewardContainer } from './game-board/containers/RewardContainer';
import { GameFlowContainer } from './game-board/containers/GameFlowContainer';
import { CardStampsContainer } from './game-board/containers/CardStampsContainer';
import { CardStampsProvider } from './game-board/contexts/CardStampsContext';
import { MagicCardContainer } from './game-board/containers/MagicCardContainer';
import { BoardOverlayButtons } from './game-board/containers/BoardOverlayButtons';
import { UndoButtonContainer } from './game-board/containers/UndoButtonContainer';
import { GameModeSelectModal } from './game-board/components/GameModeSelectModal';
import { MultiplayerLobby } from './game-board/components/MultiplayerLobby';
import { MultiplayerBossAlert } from './game-board/components/MultiplayerBossAlert';
import { MultiplayerConnectionBadge } from './game-board/components/MultiplayerConnectionBadge';
import { MultiplayerOfflineOverlay } from './game-board/components/MultiplayerOfflineOverlay';
import { buildSharedDeck } from '@/lib/multiplayerSharedDeck';
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
import { reportGameStart, summarizePrevGame } from '@/lib/telemetry';
import { applyMonsterRage } from '@/lib/monsterRage';
import { getStartingRelics, hasEternalRelic, getEternalRelic, countEternalRelics, getRelicStackedSuffix } from '@/lib/eternalRelics';
import CardDetailsModal from './CardDetailsModal';
import CardUpgradeModal from './CardUpgradeModal';
import CardDraftModal from './CardDraftModal';
import DiscoverClassModal from './DiscoverClassModal';
import GraveyardExileModal from './GraveyardExileModal';
import CardDeletionModal from './CardDeletionModal';
import ShopModal, { type ShopOffering } from './ShopModal';
import ShopSkillSelectModal from './ShopSkillSelectModal';
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
  WaterfallAnimationState,
  WaterfallDiscardDestination,
} from './game-board/types';

// Game-core: deck creation, card images, and constants
import {
  createDeck,
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
import bloodCurseSealImage from '@assets/generated_images/card_curse_blood_seal.png';
import cardBackImage from '@assets/generated_images/card_back_design.png';
import {
  INITIAL_HP,
  INITIAL_GOLD,
  INITIAL_TURN_COUNT,
  PERSUADE_COST,
  MIN_PERSUADE_COST,
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
  SHOP_HEAL_AMOUNT,
  MAX_SHOP_LEVEL,
  STRENGTH_SELF_DAMAGE,
  DEV_MODE,
  initialCombatState,
  initialWaterfallAnimationState,
  createEmptySlotBonusState,
  createEmptyEquipmentBuffState,
  createEmptyActiveRow,
  createEmptyAmuletEffects,
} from '@/game-core/constants';
import { computeAmuletEffectsCombined } from '@/game-core/equipment';
import {
  clamp,
  easeInOutCubic,
  formatRepairTargetLabel,
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
  isDamageableTarget,
  applyAmplifyOnCreate,
} from '@/game-core/helpers';
import { getEquipmentSlotsWithSuppressedTempAttack } from '@/game-core/buildingAura';
import type { RngState } from '@/game-core/rng';
import { nextRandom, nextInt, nextBool, shuffle as rngShuffle, pickRandom, nextId } from '@/game-core/rng';
import { pickGraveyardCardExcluding } from '@/game-core/rules/equipment-effects';

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
const DISCARD_SHOCK_FLIGHT_BASE_DURATION = 520;
const DISCARD_SHOCK_FLIGHT_VARIANCE = 140;
const DISCARD_SHOCK_ARC_MIN = 36;
const DISCARD_SHOCK_ARC_VARIANCE = 52;
const DISCARD_SHOCK_PROJECTILE_SIZE = 56;
/** 格挡动画与反弹动画之间的间隔（ms） */
const COMBAT_BLOCK_TO_REFLECT_MS = 220;
// Keep in sync with useCombatActions.ts DEFEAT_ANIMATION_DURATION
// and the dh-card-death keyframe duration in client/src/index.css.
// 1400ms covers the Lottie explosion (~1.5s clipped) + the card grayscale/shrink/fade,
// and gates the monster reward modal until the animation finishes.
const DEFEAT_ANIMATION_DURATION = 1400;

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
const WATERFALL_REVEAL_DURATION = 400;
// Extra hold AFTER the preview-row flip completes, before drop/discard/deal
// motion begins — gives players time to read what just got revealed.
const WATERFALL_REVEAL_HOLD_DURATION = 1000;

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
  const dispatch = useDispatch();

  const {
    hp,
    previewCards, activeCards, discardedCards, handCards,
    equipmentSlot1, equipmentSlot2,
    equipmentSlot1Reserve, equipmentSlot2Reserve,
    equipmentSlotCapacity,
    amuletSlots, maxAmuletSlots,
    backpackItems, backpackCapacityModifier,
    classDeck, acquiredUniqueClassCardIds,
    heroVariant, selectedHeroSkill,
    extraHeroSkills, extraSkillsUsedThisWave,
    permanentSkills, permanentMaxHpBonus, permanentSpellDamageBonus,
    permanentSpellLifesteal, stunCap, heroStunned, handLimitBonus,
    persuadeLevel, persuadeAmuletBonus, permanentPersuadeBonus, persuadeDiscount,
    heroMagicState,
    combatState,
    weaponMasterBonus, shieldMasterBonus,
    unbreakableUntilWaterfall,
    slotTempArmor, slotTempAttack,
    defensiveStanceActive,
    berserkTurnBuff, extraAttackCharges,
    slotExtraAttacks,
    heroSkillUsedThisWave, berserkerRageActive, berserkerSlotUsed,
    flashSlotUsed,
    gambitExtraActive, gambitExtraPerSlot, gambitSlotUsed,
    weaponExtraAttackUsed,
    blockDurabilityPerSlot,
    slotBattleSpiritBonus, slotBattleSpiritUsed: slotBattleSpiritUsedMap,
    pendingHeroSkillAction, pendingHeroMagicAction,
    pendingMagicAction, pendingPotionAction,
    activeMonsterReward, monsterRewardMinimized,
    shopModalOpen, shopModalMinimized,
    eventModalOpen, eventModalMinimized,
    discoverModalOpen, discoverModalMinimized,
    graveyardDiscoverState, graveyardDiscoverMinimized,
    gameOver, showSkillSelection, showCardDraft,
    isHydrated, heroSkillBanner,
    activeCardStacks,
    eternalRelics,
    permanentMagicRecycleBag,
  } = useShallowGameState(s => ({
    hp: s.hp,
    previewCards: s.previewCards, activeCards: s.activeCards,
    discardedCards: s.discardedCards, handCards: s.handCards,
    equipmentSlot1: s.equipmentSlot1, equipmentSlot2: s.equipmentSlot2,
    equipmentSlot1Reserve: s.equipmentSlot1Reserve, equipmentSlot2Reserve: s.equipmentSlot2Reserve,
    equipmentSlotCapacity: s.equipmentSlotCapacity,
    amuletSlots: s.amuletSlots, maxAmuletSlots: s.maxAmuletSlots,
    backpackItems: s.backpackItems,
    backpackCapacityModifier: s.backpackCapacityModifier,
    classDeck: s.classDeck,
    acquiredUniqueClassCardIds: s.acquiredUniqueClassCardIds,
    heroVariant: s.heroVariant, selectedHeroSkill: s.selectedHeroSkill,
    extraHeroSkills: s.extraHeroSkills, extraSkillsUsedThisWave: s.extraSkillsUsedThisWave,
    permanentSkills: s.permanentSkills, permanentMaxHpBonus: s.permanentMaxHpBonus,
    permanentSpellDamageBonus: s.permanentSpellDamageBonus,
    permanentSpellLifesteal: s.permanentSpellLifesteal, stunCap: s.stunCap,
    heroStunned: s.heroStunned, handLimitBonus: s.handLimitBonus,
    persuadeLevel: s.persuadeLevel, persuadeAmuletBonus: s.persuadeAmuletBonus,
    permanentPersuadeBonus: s.permanentPersuadeBonus, persuadeDiscount: s.persuadeDiscount,
    heroMagicState: s.heroMagicState,
    combatState: s.combatState,
    weaponMasterBonus: s.weaponMasterBonus, shieldMasterBonus: s.shieldMasterBonus,
    unbreakableUntilWaterfall: s.unbreakableUntilWaterfall,
   
    slotTempArmor: s.slotTempArmor, slotTempAttack: s.slotTempAttack,
    defensiveStanceActive: s.defensiveStanceActive,
    berserkTurnBuff: s.berserkTurnBuff, extraAttackCharges: s.extraAttackCharges,
    slotExtraAttacks: s.slotExtraAttacks,
    heroSkillUsedThisWave: s.heroSkillUsedThisWave, berserkerRageActive: s.berserkerRageActive,
    berserkerSlotUsed: s.berserkerSlotUsed, flashSlotUsed: s.flashSlotUsed,
    gambitExtraActive: s.gambitExtraActive, gambitExtraPerSlot: s.gambitExtraPerSlot,
    gambitSlotUsed: s.gambitSlotUsed, weaponExtraAttackUsed: s.weaponExtraAttackUsed,
    blockDurabilityPerSlot: s.blockDurabilityPerSlot,
    slotBattleSpiritBonus: s.slotBattleSpiritBonus, slotBattleSpiritUsed: s.slotBattleSpiritUsed,
    pendingHeroSkillAction: s.pendingHeroSkillAction, pendingHeroMagicAction: s.pendingHeroMagicAction,
    pendingMagicAction: s.pendingMagicAction, pendingPotionAction: s.pendingPotionAction,
    activeMonsterReward: s.activeMonsterReward, monsterRewardMinimized: s.monsterRewardMinimized,
    shopModalOpen: s.shopModalOpen, shopModalMinimized: s.shopModalMinimized,
    eventModalOpen: s.eventModalOpen, eventModalMinimized: s.eventModalMinimized,
    discoverModalOpen: s.discoverModalOpen, discoverModalMinimized: s.discoverModalMinimized,
    graveyardDiscoverState: s.graveyardDiscoverState, graveyardDiscoverMinimized: s.graveyardDiscoverMinimized,
    gameOver: s.gameOver, showSkillSelection: s.showSkillSelection,
    showCardDraft: s.showCardDraft,
    isHydrated: s.isHydrated, heroSkillBanner: s.heroSkillBanner,
    activeCardStacks: s.activeCardStacks,
    eternalRelics: s.eternalRelics,
    permanentMagicRecycleBag: s.permanentMagicRecycleBag,
  }));

  // -- State helpers -----------------------------------------------------------

  type GS = GameState;

  // hpRef/goldRef eliminated — use engine.getState().hp / .gold in closures
  //
  // Undo stack lives in the engine (see GameEngine.pushUndoCheckpoint).
  // Hydrate it once from localStorage on mount; persistence on subsequent
  // mutations is wired via `engine.subscribeUndo` further below, with the
  // actual `localStorage.setItem` deferred to a microtask so it never
  // blocks the user gesture that triggered the checkpoint.
  const undoHydratedRef = useRef(false);
  if (!undoHydratedRef.current) {
    undoHydratedRef.current = true;
    const persisted = (loadUndoStack() as any[])
      .filter((s: any) => s?.hp != null && s?.handCards) as GameState[];
    if (persisted.length > 0) engine.restoreUndoStack(persisted);
  }
  /** 每次 hydrate / 新开局递增；格挡等异步结算在 await 后若发现过期则立刻放弃，避免撤销后仍写入旧闭包数据 */
  const combatAsyncEpochRef = useRef(0);
  // amuletSlotsRef eliminated — use engine.getState().amuletSlots in closures

  // When slotTempArmor increases, repair shield base armor up to armorMax
  const prevSlotTempArmorRef = useRef(slotTempArmor);
  useLayoutEffect(() => {
    const prev = prevSlotTempArmorRef.current;
    for (const slotId of ['equipmentSlot1', 'equipmentSlot2'] as const) {
      const oldTemp = prev[slotId] ?? 0;
      const newTemp = slotTempArmor[slotId] ?? 0;
      if (newTemp > oldTemp) {
        const increase = newTemp - oldTemp;
        const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
        if (slotItem && (slotItem.type === 'shield' || slotItem.type === 'monster')) {
          const baseArmorMax = slotItem.type === 'monster'
            ? (slotItem.hp ?? slotItem.value)
            : (slotItem.armorMax ?? slotItem.value);
          const currentArmor = slotItem.armor ?? baseArmorMax;
          if (currentArmor < baseArmorMax) {
            const repair = Math.min(increase, baseArmorMax - currentArmor);
            dispatch({ type: 'SET_EQUIPMENT_SLOT', slotId, card: { ...slotItem, armor: currentArmor + repair } as EquipmentItem });
          }
        }
      }
    }
    prevSlotTempArmorRef.current = slotTempArmor;
  }, [slotTempArmor, equipmentSlot1, equipmentSlot2]);

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
  // Aggregated amulet effects. Delegates to the canonical aggregator in
  // `game-core/equipment.ts` so UI-side derivations match the reducer's view
  // exactly. Eternal relics that carry an `amuletEffect` are folded in via
  // `computeAmuletEffectsCombined` — see `parallel-state-fields-consumer-audit.mdc`
  // for why this merge must happen at every consumer (UI + reducer).
  const amuletEffects = useMemo<ActiveAmuletEffects>(
    () => computeAmuletEffectsCombined(amuletSlots as GameCardData[], eternalRelics),
    [amuletSlots, eternalRelics],
  );

  // Amulet counter display sync now runs automatically in reducer postProcessAmuletCounters

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
    drawClassCardsToBackpack,
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
    performHeroAttack,
    endHeroTurn,
    resolveBlockChoice,
    advanceMonsterTurn,
    handleMonsterTargetSelection,
    handleWeaponToMonster,
    recordClassDamageDiscoverHit,
    updateDamageDiscoverCounter,
    updateMagicDiscoverCounter,
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
    handleDiscoverFallback,
    handleDiscoverSelect,
    handleDiscoverCancel,
    handleShopPurchase,
    handleShopClose,
    handleShopDeleteRequest,
    handleShopHealRequest,
    handleShopLevelUpRequest,
    handleShopEquipAttackRequest,
    handleShopEquipArmorRequest,
    handleShopRefreshRequest,
    handleCardUpgrade,
    handleShopSkillDiscoverRequest,
    handleShopSkillSelect,
    requestGraveyardSelection,
    handleGraveyardDiscoverSelect,
    handleGraveyardDiscoverCancel,
    triggerGhostBladeExile,
    handleGhostBladeExileConfirm,
    requestCardAction,
    requestCardActionBatch,
    handleDeleteCardConfirm,
    handleBatchDeleteConfirm,
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

  // 不灭守护自动触发后，玩家点「知道了」按钮 → 清空 notice 状态 + 把 phase
  // 推回 playerInput 让 pipeline 继续 drain（reducer 内部完成所有清理）。
  const handleDismissDeathWardNotice = useCallback(() => {
    dispatch({ type: 'DISMISS_DEATH_WARD_NOTICE' });
  }, []);

  const handleUpgradeModalChange = useCallback((open: boolean) => {
    dispatch({ type: 'SET_UPGRADE_MODAL_OPEN', open: open, ...(open ? {} : { maxCount: undefined }) });
  }, []);

  const handleHandMagicUpgradeSelect = useCallback((cardIds: string[]) => {
    for (const cardId of cardIds) handleCardUpgrade(cardId);
    dispatch({ type: 'SET_HAND_MAGIC_UPGRADE_MODAL', payload: null });
  }, [handleCardUpgrade]);

  const handleHandMagicUpgradeClose = useCallback(() => {
    dispatch({ type: 'SET_HAND_MAGIC_UPGRADE_MODAL', payload: null });
  }, []);

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
    handleHeroMagicCard,
    handlePlayCardFromHand,
    isPermanentMagicCard,
    normalizeEventEffect,
    chaosStrikeHasOverkill,
    drawCardsFromBackpack,
    getRepairableEquipmentSlots,
    resolveStatSwap,
    resolveRepairEnrageDice,
    resolveMirrorCopy,
    cancelMirrorCopy,
    resolveMonsterFusion,
    cancelMonsterFusion,
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
    applyHonorSweepMagic,
    applyWeaponSweepMagic,
    honorSweepUpgradesPending,
    clearHonorSweepUpgrades,
  } = heroActions;

  // --- Layer 5: Event System ---
  const eventSystemDepsRef = useRef<EventSystemDeps>(null!);
  const eventSystem = useEventSystem(eventSystemDepsRef);
  const {
    startEventResolution,
    processPendingAutoDraws,
    enqueueAutoDraw,
    registerDungeonCardProcessed,
    unregisterProcessedCardId,
    clearAllProcessedCardIds,
    requestDiceOutcome,
    handleDiceRollResult,
    cancelDiceModal,
    requestMagicChoice,
    handleMagicChoice,
    requestEquipmentSelection,
    handleEquipmentPromptSelection,
    cancelEquipmentPrompt,
    handleEventAmplifyHandSelect,
    cancelEventAmplifyHandPicker,
    evaluateChoiceRequirements,
    eventChoiceStates,
    gainClassDeckBottomCards,
    finalizeEventResolution,
    completeCurrentEvent,
    handleEventChoice,
  } = eventSystem;

  const [backpackViewerOpen, setBackpackViewerOpen] = useState(false);
  const [heroDetailsOpen, setHeroDetailsOpen] = useState(false);
  const cardActionResolverRef = useRef<(() => void) | null>(null);
  const cardActionRemainingRef = useRef(0);
  const cardActionBatchResolverRef = useRef<
    ((selections: Array<{ cardId: string; source: 'hand' | 'backpack' | 'recycleBag' | 'equipment' | 'amulet' }>) => void) | null
  >(null);
  const deletingCardIdsRef = useRef(new Set<string>());
  const adjustShopLevel = useCallback((delta: number) => {
    if (!delta) return;
    dispatch({ type: 'ADJUST_SHOP_LEVEL', delta: Math.floor(delta) });
  }, [engine]);
  const onNewCardGainedRef = useRef<((count: number, source?: 'graveyard' | 'classPool') => void) | null>(null);
  const [persuadeTempDiscount, setPersuadeTempDiscount] = useState(0);
  const stagingCardsRef = useRef<GameCardData[]>([]);
  const pendingDiscardEffectsQueueRef = useRef<import('@/hooks/useCardOperations').PendingDiscardEffect[]>([]);
  const [gameOverMinimized, setGameOverMinimized] = useState(false);
  const [showGameModeSelect, setShowGameModeSelect] = useState(false);
  // Phase 5 lobby: opens after the user picks "multiplayer" in the mode
  // select modal. Mediates between the user and the Supabase create-/join-
  // room API. On success, dispatches INIT_MULTIPLAYER_GAME and closes.
  const [showMultiplayerLobby, setShowMultiplayerLobby] = useState(false);
  // Phase 6.2 boss alert: open when the waterfall reducer emits
  // `multiplayer:bossEncountered` (one-shot per game, gated server-side
  // by `state.bossEncounterAlertShown`). Purely advisory.
  const [showMultiplayerBossAlert, setShowMultiplayerBossAlert] = useState(false);
  const [draggedCard, setDraggedCard] = useState<GameCardData | null>(null);
  const [draggedCardSource, setDraggedCardSource] = useState<DragOrigin | null>(null);
  const [heroRowDropState, setHeroRowDropState] = useState<HeroRowDropType | null>(null);
  const [draggedEquipment, setDraggedEquipment] = useState<any | null>(null);
  const [isDragSessionActive, setIsDragSessionActive] = useState(false);
  const [removingCards, setRemovingCards] = useState<Set<string>>(new Set());
  const {
    takingDamage, setTakingDamage,
    healing, setHealing,
    heroBleedActive, setHeroBleedActive,
    monsterBleedStates, setMonsterBleedStates,
    monsterHealStates, setMonsterHealStates,
    monsterDefeatStates, setMonsterDefeatStates,
    mineExplodeStates, setMineExplodeStates,
    weaponSwingStates, setWeaponSwingStates,
    shieldBlockStates, setShieldBlockStates,
    weaponSwingVariant, setWeaponSwingVariant,
    shieldBlockVariant, setShieldBlockVariant,
  } = useCombatVisuals();
  const boardRef = useRef<HTMLDivElement>(null);
  const gameSurfaceRef = useRef<HTMLDivElement | null>(null);
  const headerWrapperRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(48);
  const gridWrapperRef = useRef<HTMLDivElement | null>(null);
  const combatAnims = useCombatAnimationTriggers({
    setHeroBleedActive,
    setMonsterBleedStates,
    setMonsterHealStates,
    setWeaponSwingStates,
    setShieldBlockStates,
    setWeaponSwingVariant,
    setShieldBlockVariant,
    setMineExplodeStates,
  }, animSpeed);
  const {
    triggerHeroBleedAnimation,
    triggerMonsterBleedAnimation,
    triggerMonsterHealAnimation,
    triggerWeaponSwingAnimation,
    triggerShieldBlockAnimation,
    triggerMineExplosionAnimation,
    animationDelayTimeoutsRef,
    heroBleedTimeoutRef,
    monsterBleedTimeoutsRef,
    monsterHealTimeoutsRef,
    weaponSwingTimeoutsRef,
    shieldBlockTimeoutsRef,
    mineExplodeTimeoutsRef,
  } = combatAnims;
  const heroCellRef = useRef<HTMLDivElement>(null);
  const heroRowCellRefs = useRef<Array<HTMLDivElement | null>>(Array(6).fill(null));
  const monsterCellRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const directedCombatFx = useDirectedCombatFx(
    { gameSurfaceRef, heroRowCellRefs, monsterCellRefs },
    animSpeed,
  );
  const {
    directedCombatFxFlights,
    directedCombatFxFlightsRef,
    directedCombatFxElementMapRef,
    directedCombatFxFlightAnimationRef,
    tryStartShieldReflectDirectedFx,
    tryStartBossRetaliationDirectedFx,
    tryStartGolemLayerReflectFx,
    tryStartArcaneBladeSpellFx,
    tryStartDragonBreathFx,
    tryStartMissileStormFx,
    setDirectedCombatFxFlights,
  } = directedCombatFx;

  const swordOverlay = useSwordOverlay({ boardRef, heroCellRef, monsterCellRefs });

  const [monsterRageInsets, setMonsterRageInsets] = useState<Record<string, MonsterRageInset>>({});
  const waterfallTimeoutsRef = useRef<number[]>([]);
  const waterfallLockRef = useRef(false);
  const pendingDungeonRemovalsRef = useRef(0);
  const pendingDungeonUseRef = useRef<Set<string>>(new Set());
  const waterfallDiscoverPendingRef = useRef(false);
  const waterfallSequenceRef = useRef(0);
  const lastWaterfallSequenceRef = useRef<number | null>(null);
  const previewCellRefs = useRef<Array<HTMLDivElement | null>>([]);
  const graveyardCellRef = useRef<HTMLDivElement | null>(null);
  const classDeckCellRef = useRef<HTMLDivElement | null>(null);
  // In narrow layout, the hero-row backpack cell is unmounted and the
  // backpack lives as a compact button in NarrowSidebar. This ref is wired
  // to that compact button so backpack→hand flight animations have a valid
  // source position when the full-size cell ref is null.
  const compactBackpackCellRef = useRef<HTMLButtonElement | null>(null);
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
  const { inCellFlips } = useInCellFlipAnimation(activeCellRefs);
  // 维度扭曲 (Dimension Warp) overlay choreography. Listens for the
  // `hero:dimensionWarp` side effect emitted from `reduceDungeonCardSelection`
  // and mounts a 2-card 3D-flip + position-swap overlay on top of the active
  // cell + the preview cell directly above it for ~1.15s.
  const { dimensionWarps } = useDimensionWarpAnimation(activeCellRefs, previewCellRefs);
  // Monster-skill float queue: drains state.pendingSkillFloats one entry at a
  // time, anchoring the floating text above the firing monster's cell. The
  // pipeline pause + dispatch guard (see game-core/index.ts) freeze every
  // other game action while the animation plays.
  const activeMonsterSkillFloat = useMonsterSkillFloats({ monsterCellRefs });
  // 雷金护符 (amulet: stun-gold) 的非阻塞视觉：每次击晕被该护符兑换成
  // 「+10×N 金币 + 立即解除击晕」时，在该怪物卡上播放一次性金币爆发动画。
  // 不阻塞 pipeline；多怪物同帧被击晕时多个 float 同时显示。
  const activeStunGoldFx = useStunReleasedGoldFx({ monsterCellRefs });
  const {
    discardShockInteractionLocked, setDiscardShockInteractionLocked,
    flipShockInteractionLocked, setFlipShockInteractionLocked,
  } = useFlightState();
  // Phase 3: BroadcastChannel-backed multiplayer sync. No-op when
  // `multiplayerSession === null` (single-player). When active, listens
  // for the engine's `multiplayer:transferOut` side effect and forwards
  // it to peer tab; conversely receives peer broadcasts and dispatches
  // RECEIVE_TRANSFER + SHARED_SHRINK. Phase 4+ swaps the underlying
  // transport for Supabase Realtime — this hook's API stays stable.
  // Returns the connection state machine which drives the badge + freeze
  // overlay (no-op / IDLE_STATE in single-player).
  const multiplayerConnection = useMultiplayerSync();
  // The 8 flight arrays now live in <FlightOverlayContainer>; we drive them
  // imperatively via this ref so flight setState calls don't re-render
  // GameBoard. See FlightOverlayContainer.tsx for rationale.
  const flightOverlayRef = useRef<FlightOverlayHandle>(null);
  const fateSwapFlightsRef = useRef<FateSwapFlight[]>([]);
  const fateSwapFlightAnimationRef = useRef<number | null>(null);
  const fateSwapFlightElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const graveyardStackFlightsRef = useRef<GraveyardStackFlight[]>([]);
  const graveyardStackFlightAnimationRef = useRef<number | null>(null);
  const graveyardStackFlightElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const backpackHandFlightsRef = useRef<BackpackHandFlight[]>([]);
  const backpackHandFlightAnimationRef = useRef<number | null>(null);
  const backpackFlightElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const discardShockFlightsRef = useRef<DiscardShockFlight[]>([]);
  const discardShockFlightAnimationRef = useRef<number | null>(null);
  const discardShockElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const discardFlightsRef = useRef<DiscardFlight[]>([]);
  const discardFlightAnimationRef = useRef<number | null>(null);
  const discardFlightElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const discardFlightResolveMapRef = useRef<Map<string, () => void>>(new Map());
  const stealCardFlightsRef = useRef<DiscardFlight[]>([]);
  const stealCardFlightAnimationRef = useRef<number | null>(null);
  const stealCardFlightElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const stealCardFlightResolveMapRef = useRef<Map<string, () => void>>(new Map());
  /** 多次弃牌雷击：排队，上一发飞行完全结束后再发下一发 */
  const discardShockProcQueueRef = useRef<{ showBanner: boolean }[]>([]);
  const discardShockSeqInFlightRef = useRef(false);
  const flushDiscardShockQueueRef = useRef<() => void>(() => {});
  const applyDiscardShockHitRef = useRef<(flight: DiscardShockFlight) => void>(() => {});
  // 弧能之符 (flip-zap): mirrors the discard-shock pipeline but triggered on every
  // APPLY_CARD_FLIP. Each equipped 弧能之符 amulet enqueues one independent zap.
  const flipShockFlightsRef = useRef<DiscardShockFlight[]>([]);
  const flipShockFlightAnimationRef = useRef<number | null>(null);
  const flipShockElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const flipShockProcQueueRef = useRef<{ showBanner: boolean }[]>([]);
  const flipShockSeqInFlightRef = useRef(false);
  const flushFlipShockQueueRef = useRef<() => void>(() => {});
  const applyFlipShockHitRef = useRef<(flight: DiscardShockFlight) => void>(() => {});
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
  const isNarrowLayout = gameViewport.width < 640;
  const isNarrowLayoutRef = useRef(isNarrowLayout);
  isNarrowLayoutRef.current = isNarrowLayout;
  useEffect(() => {
    if (isNarrowLayout) {
      heroRowCellRefs.current[HERO_ROW_BACKPACK_INDEX] = null;
      classDeckCellRef.current = null;
    }
  }, [isNarrowLayout]);
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
  const setClassDeckCellRef = useCallback((el: HTMLDivElement | null) => {
    classDeckCellRef.current = el;
  }, []);
  const updateHeroFramePosition = useCallback(() => {
    const container = gridWrapperRef.current;
    const firstCell = heroRowCellRefs.current[0];
    let lastCell: HTMLDivElement | null = null;
    for (let i = heroRowCellRefs.current.length - 1; i >= 0; i--) {
      if (heroRowCellRefs.current[i]) { lastCell = heroRowCellRefs.current[i]; break; }
    }
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

    if (isNarrowLayoutRef.current) {
      const previewCell = previewCellRefs.current[0];
      const activeCell = activeCellRefs.current[0];
      const heroCell = firstCell;
      if (previewCell && activeCell && heroCell) {
        const pRect = previewCell.getBoundingClientRect();
        const aRect = activeCell.getBoundingClientRect();
        const hRect = heroCell.getBoundingClientRect();
        setNarrowSidebarPositions({
          row1Y: pRect.top + pRect.height / 2,
          row2Y: aRect.top + aRect.height / 2,
          row3Y: hRect.top + hRect.height / 2,
        });
      }
    }
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

  // syncBuildingSlotsPure now runs automatically in reducer postProcessActiveCards

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
    gridCardSize?.height]);
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
    updatePreviewToGraveyardVector]);

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

    const wrapper = gridWrapperRef.current;
    let ro: ResizeObserver | undefined;
    if (wrapper) {
      ro = new ResizeObserver(handleResize);
      ro.observe(wrapper);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      ro?.disconnect();
    };
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
    (0);
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
  const [narrowSidebarPositions, setNarrowSidebarPositions] = useState<{ row1Y: number; row2Y: number; row3Y: number } | null>(null);

  const gameLogIdRef = useRef<number>(loadGameLog()?.nextId ?? 0);
  // Game log persistence is hot — every play / kill / amulet trigger / etc.
  // calls addGameLog, often a dozen times per gesture. The previous version
  // synchronously re-stringified the entire (unbounded) log array and wrote
  // it to localStorage on every entry, which scaled O(N) with log length and
  // dominated main-thread time after a long session.
  //
  // New strategy: dispatch is still synchronous (UI shows the entry
  // instantly), but the localStorage write is:
  //   1. coalesced: 500ms trailing debounce — N entries within the window
  //      collapse into one save;
  //   2. idle-deferred: the actual stringify + setItem runs inside
  //      requestIdleCallback so it never blocks user gestures or animations;
  //   3. fenced: a synchronous flush runs on `visibilitychange→hidden`
  //      and on unmount so we don't lose recent entries if the tab is
  //      closed mid-debounce.
  // Worst case data loss: the last <500ms of log entries if the browser
  // crashes outright (visibilitychange covers normal close / refresh).
  const gameLogSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameLogSaveIdleHandleRef = useRef<number | null>(null);
  const GAME_LOG_SAVE_DEBOUNCE_MS = 500;
  const performGameLogSave = useCallback(() => {
    saveGameLog(engine.getState().gameLogEntries, gameLogIdRef.current);
  }, [engine]);
  const cancelPendingGameLogSave = useCallback(() => {
    if (gameLogSaveTimerRef.current !== null) {
      clearTimeout(gameLogSaveTimerRef.current);
      gameLogSaveTimerRef.current = null;
    }
    if (gameLogSaveIdleHandleRef.current !== null) {
      if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(gameLogSaveIdleHandleRef.current);
      }
      gameLogSaveIdleHandleRef.current = null;
    }
  }, []);
  const flushGameLogSaveNow = useCallback(() => {
    cancelPendingGameLogSave();
    performGameLogSave();
  }, [cancelPendingGameLogSave, performGameLogSave]);
  const scheduleGameLogSave = useCallback(() => {
    if (gameLogSaveTimerRef.current !== null) return;
    gameLogSaveTimerRef.current = setTimeout(() => {
      gameLogSaveTimerRef.current = null;
      if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        gameLogSaveIdleHandleRef.current = window.requestIdleCallback(
          () => {
            gameLogSaveIdleHandleRef.current = null;
            performGameLogSave();
          },
          { timeout: 2000 },
        );
      } else {
        performGameLogSave();
      }
    }, GAME_LOG_SAVE_DEBOUNCE_MS);
  }, [performGameLogSave]);
  const addGameLog = useCallback((type: LogEntryType, message: string) => {
    const id = ++gameLogIdRef.current;
    const entry = { id, type, message, timestamp: Date.now() };
    dispatch({ type: 'UPDATE_GAME_LOG', entry });
    scheduleGameLogSave();
  }, [dispatch, scheduleGameLogSave]);
  const clearGameLog = useCallback(() => {
    // Cancel any pending debounced save first — otherwise it could fire
    // after we cleared storage and resurrect the just-cleared log.
    cancelPendingGameLogSave();
    dispatch({ type: 'SET_GAME_FLAGS', patch: { gameLogEntries: [] } });
    gameLogIdRef.current = 0;
    clearGameLogStorage();
  }, [cancelPendingGameLogSave, dispatch]);
  // Lifecycle flush: write any pending log entries to storage when the
  // tab is hidden (cover refresh / close / mobile background) and when
  // GameBoard unmounts.
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        flushGameLogSaveNow();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
      flushGameLogSaveNow();
    };
  }, [flushGameLogSaveNow]);

  useGameEvent('log:entry', ({ type, message }) => {
    addGameLog(type as LogEntryType, message);
  });

  useGameEvent('waterfall:discoverPending', () => {
    waterfallDiscoverPendingRef.current = true;
  });

  useGameEvent('waterfall:wraithEnrage', ({ monsterIds }) => {
    for (const mId of monsterIds) {
      if (!isMonsterEngaged(mId)) {
        const card = activeCards.find(c => c?.id === mId);
        if (card) beginCombat(card, 'monster');
      }
    }
  });

  useGameEvent('waterfall:classDrawn', ({ cards }) => {
    triggerClassDeckFlight(cards);
  });

  // Reducer computed a waterfall plan — wait for pending removal animations, then start
  useGameEvent('waterfall:planReady', () => {
    const tryStart = () => {
      if (pendingDungeonRemovalsRef.current > 0) {
        setTimeout(tryStart, 50);
        return;
      }
      startWaterfallAnimation();
    };
    tryStart();
  });

  // waterfall:discardEffect no longer needs UI-side handling.
  // The reducer syncs updatedRemainingDeck into pendingWaterfallPlan automatically.

  // --- Equipment event listeners ---

  useGameEvent('equipment:destroyed', ({ slotId, cardId }) => {
    console.log('[equipment:destroyed]', { slotId, cardId });
  });

  useGameEvent('equipment:clearSlotWithPromote', ({ slotId }) => {
    console.log('[equipment:clearSlotWithPromote]', { slotId });
  });

  useGameEvent('equipment:drawFromBackpack', ({ count }) => {
    for (let i = 0; i < count; i++) drawFromBackpackToHand();
  });

  useGameEvent('equipment:drawFromRecycleBag', ({ count }) => {
    // Reducer (rules/combat.ts overkillRecycleToHand block) already moves
    // the cards from the recycle bag straight into the hand (with backpack
    // overflow). This listener is UI-only: log it for now, future hook can
    // attach a flight animation here if desired.
    console.log('[equipment:drawFromRecycleBag]', { count });
  });

  useGameEvent('equipment:classCardDraw', ({ count }) => {
    drawClassCardsToBackpack(count, 'equipment-effect');
  });

  useGameEvent('equipment:repaired', ({ slotId, amount }) => {
    addGameLog('equip', `装备修复：槽位 ${slotId} 修复了 ${amount} 点耐久`);
  });

  useGameEvent('equipment:graveyardToHand', ({ itemName }) => {
    console.log('[equipment:graveyardToHand]', { itemName });
  });

  useGameEvent('equipment:lastWordsHeal', ({ amount, itemName }) => {
    healHero(amount);
    addGameLog('equip', `${itemName} 遗言：恢复了 ${amount} 点生命`);
  });

  // 装备栏被新装备顶替时，被挤掉的旧装备从原槽位飞向坟场 / 回收袋。
  // 触发源：reduceDisposeEquipmentCard（覆盖 PLAY_CARD 点击 / EQUIP_CARD /
  // GameBoard 拖拽与劝降的全部 displacement 路径）。
  useGameEvent('equipment:displaced', ({ card, slotId, destination }) => {
    void triggerDiscardFlight(card, destination, slotId);
  });

  // --- Game lifecycle event listeners ---

  useGameEvent('game:started', () => {
    console.log('[game:started]');
  });

  useGameEvent('game:over', ({ victory }) => {
    console.log('[game:over]', { victory });
  });

  // Phase 6.2: one-shot boss-encounter advisory. The reducer guarantees
  // this fires at most once per multiplayer game (gated on
  // `state.bossEncounterAlertShown`), so we just open the dialog. Closing
  // the dialog does NOT reset the flag — the reducer already set it to
  // `true` before the side effect was emitted. Solo games never see this.
  useGameEvent('multiplayer:bossEncountered', () => {
    setShowMultiplayerBossAlert(true);
  });

  // --- Additional combat event listeners ---

  useGameEvent('combat:wraithPurified', () => {
    addGameLog('combat', '亡灵已被净化！');
  });

  useGameEvent('combat:heroTookDamageThisMonsterTurn', () => {
    console.log('[combat:heroTookDamageThisMonsterTurn]');
  });

  useGameEvent('combat:monsterRewardQueued', ({ monsterId }) => {
    console.log('[combat:monsterRewardQueued]', { monsterId });
  });

  const discardedCardsRef = useRef<GameCardData[]>([]);
  const handCardsRef = useRef<GameCardData[]>([]);
  // isDraggingToHand / isDraggingFromDungeon removed (values were never read)
  // wraithPassiveEnabledRef eliminated — use engine.getState().wraithPassiveEnabled
  const [wraithPassiveUnlockPopup, setWraithPassiveUnlockPopup] = useState(false);
  // 杀掉最后一只 Wraith 时，reducer 会在同一次 drain 里入队两件事：
  //   1) DEQUEUE_MONSTER_REWARD → 打开战利品弹窗（MonsterRewardModal）
  //   2) CHECK_WRAITH_PURIFICATION → emit 'combat:wraithPurified' → 打开本弹窗
  // 两个 radix Dialog 同帧 open 时，幽魂弹窗叠在战利品弹窗上面。点击"知道了"
  // 关闭幽魂弹窗的瞬间，原始 click 事件（或触屏 ghost click）会穿透到下层，
  // 命中战利品 option 按钮（误选奖励）或 overlay（→ onPointerDownOutside →
  // MINIMIZE_ALL_MODALS），玩家观感就是"战利品弹窗被挤掉/消失了"。
  // 解决方案：把幽魂净化通知缓存为 pending，等所有 monsterReward 都消化完
  // （activeMonsterReward 变 null）再弹，保证两个弹窗永远不同时存在。
  const [wraithPassiveUnlockPending, setWraithPassiveUnlockPending] = useState(false);

  useGameEvent('combat:wraithPurified', () => {
    setWraithPassiveUnlockPending(true);
  });

  useEffect(() => {
    if (wraithPassiveUnlockPending && !activeMonsterReward) {
      setWraithPassiveUnlockPending(false);
      setWraithPassiveUnlockPopup(true);
    }
  }, [wraithPassiveUnlockPending, activeMonsterReward]);

  const eventChoiceProcessingRef = useRef(false);
  /**
   * 任何"折叠中"的弹窗都冻结主界面操作（与弃牌雷击共用 fullBoardInteractionLocked）。
   * 用同一条规则覆盖所有折叠态弹窗——Event / Shop / 专属发现 / 坟场召回 /
   * 战利品 / 失败结算——只要其中至少一个处于"open + minimized"，棋盘
   * （Dungeon、Hero Row、手牌、装备槽等）就完全 freeze，避免玩家在弹窗
   * 隐藏时继续推进游戏导致状态错乱。展开任意 pill 即可恢复操作。
   */
  const minimizedModalLocksBoard =
    (eventModalOpen && eventModalMinimized) ||
    (shopModalOpen && shopModalMinimized) ||
    (discoverModalOpen && discoverModalMinimized) ||
    (Boolean(graveyardDiscoverState) && graveyardDiscoverMinimized) ||
    (Boolean(activeMonsterReward) && monsterRewardMinimized) ||
    (gameOver && gameOverMinimized);
  const fullBoardInteractionLocked =
    discardShockInteractionLocked || flipShockInteractionLocked || minimizedModalLocksBoard;
  const fullBoardInteractionLockedRef = useRef(false);
  fullBoardInteractionLockedRef.current = fullBoardInteractionLocked;
  /**
   * 撤销专用锁：跟 fullBoardInteractionLocked 一样响应「弹射 / 翻牌雷击」这种
   * 真在跑动画的硬锁，但 **不**响应 minimizedModalLocksBoard。
   *
   * 原因：minimizedModalLocksBoard 的设计意图是「防止玩家在弹窗隐藏时继续推进游戏
   * 导致状态错乱」——但撤销是把状态往回退到 push snapshot 那一刻（通常是弹窗
   * 还没被 enqueue 之前），不是推进游戏，反而是修复"误开了弹窗想退回去"的
   * 唯一手段。所有 minimized modal 的 GameState 标志都会被 undo 整体回滚，
   * 撤销完弹窗 + pill 自然消失。
   */
  const undoInteractionLocked =
    discardShockInteractionLocked || flipShockInteractionLocked;
  const undoInteractionLockedRef = useRef(false);
  undoInteractionLockedRef.current = undoInteractionLocked;
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
  const selectedHeroSkillRef = useRef<string | null>(selectedHeroSkill);
  selectedHeroSkillRef.current = selectedHeroSkill;
  const eternalRelicsRef = useRef(eternalRelics);
  eternalRelicsRef.current = eternalRelics;
  const cardDraftPendingSkillRef = useRef<string | null>(null);
  const eventResolutionRef = useRef<{ cardId: string | null; source: 'dungeon' | 'hand' | null }>({ cardId: null, source: null });
  
  // Card Details Modal State
  const [selectedCard, setSelectedCard] = useState<GameCardData | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);

  // Eternal Relic detail modal
  const [selectedEternalRelic, setSelectedEternalRelic] = useState<import('@/game-core/types').EternalRelic | null>(null);
  const [selectedEternalRelicCount, setSelectedEternalRelicCount] = useState<number>(1);
  const [eternalRelicModalOpen, setEternalRelicModalOpen] = useState(false);
  const handleEternalRelicClick = useCallback((relic: import('@/game-core/types').EternalRelic, count: number) => {
    setSelectedEternalRelic(relic);
    setSelectedEternalRelicCount(count);
    setEternalRelicModalOpen(true);
  }, []);

  const bulwarkTempArmorRef = useRef(0);
  bulwarkTempArmorRef.current = engine.getState().bulwarkTempArmorStacks;
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
  const echoRemainingRef = useRef(0);
  const echoTotalRef = useRef(0);



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

      for (const timeouts of Object.values(mineExplodeTimeoutsRef.current)) {
        timeouts.forEach(id => clearTimeout(id));
      }
      mineExplodeTimeoutsRef.current = {};

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
      flightOverlayRef.current?.setDiscardShockFlights([]);
      discardShockElementMapRef.current.clear();
      discardShockProcQueueRef.current = [];
      discardShockSeqInFlightRef.current = false;

      if (flipShockFlightAnimationRef.current !== null) {
        cancelAnimationFrame(flipShockFlightAnimationRef.current);
        flipShockFlightAnimationRef.current = null;
      }
      for (const flight of flipShockFlightsRef.current) {
        if (!flight.delivered) {
          applyFlipShockHitRef.current(flight);
        }
      }
      flipShockFlightsRef.current = [];
      flightOverlayRef.current?.setFlipShockFlights([]);
      flipShockElementMapRef.current.clear();
      flipShockProcQueueRef.current = [];
      flipShockSeqInFlightRef.current = false;

      for (const flight of backpackHandFlightsRef.current) {
        if (!flight.delivered) {
          ensureCardInHand(flight.card);
        }
      }
      backpackHandFlightsRef.current = [];
      flightOverlayRef.current?.setBackpackHandFlights([]);
      inFlightHandStore.clear();

      classDeckFlightsRef.current = [];
      flightOverlayRef.current?.setClassDeckFlights([]);
      fateSwapFlightsRef.current = [];
      flightOverlayRef.current?.setFateSwapFlights([]);
      graveyardStackFlightsRef.current = [];
      flightOverlayRef.current?.setGraveyardStackFlights([]);

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
        // Reveal the slot before ensuring the card in hand, so the fallback
        // path mirrors the normal flight-complete path.
        inFlightHandStore.remove(card.id);
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
        dispatch({ type: 'UPDATE_HAND_CARDS', updater: prev => {
          if (prev.some(existingCard => existingCard.id === snapshot.id)) {
            return prev;
          }
          logBackpackDraw('hand-guard-reinsert', {
            cardId: snapshot.id,
            name: snapshot.name,
          });
          return [...prev, snapshot];
        } });
      }, HAND_DELIVERY_GUARD_DELAY);
      guards.set(snapshot.id, { card: snapshot, timeoutId });
      logBackpackDraw('hand-guard-scheduled', {
        cardId: snapshot.id,
        delay: HAND_DELIVERY_GUARD_DELAY,
        pending: guards.size,
      });
    },
    [],
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

  // --- Draw animation listeners (wire reducer side-effects → flight overlay) ---
  useGameEvent('card:drawnToHand', ({ cardId }) => {
    const card = engine.getState().handCards.find(c => c.id === cardId);
    if (card) queueCardIntoHand(card);
  });

  useGameEvent('card:queueToHand', ({ card, sourceHint }) => {
    queueCardIntoHand(card, sourceHint as FlightSourceHint | undefined);
  });

  useGameEvent('card:drawnFromBackpack', ({ cards }) => {
    for (const card of cards) queueCardIntoHand(card);
  });

  useGameEvent('card:restoredFromRecycleBag', ({ cardId }) => {
    const card = engine.getState().handCards.find(c => c.id === cardId);
    if (card) queueCardIntoHand(card);
  });

  // DEQUEUE_MONSTER_REWARD is now triggered by the reducer pipeline:
  // - MONSTER_DEFEATED enqueues it after queueing rewards
  // - APPLY_MONSTER_REWARD enqueues it after clearing activeMonsterReward
  // - SET_GHOST_BLADE_EXILE_CARDS enqueues it when clearing exile cards
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

  // UI-bridge: defensive ref cleanup when graveyard discover state clears
  // (primary cleanup is at the call sites in useShopHandlers)
  useEffect(() => {
    if (!graveyardDiscoverState) {
      graveyardDiscoverDeliveryRef.current = 'backpack';
      if (graveyardDiscoverResolverRef.current) {
        graveyardDiscoverResolverRef.current(null);
        graveyardDiscoverResolverRef.current = null;
      }
    }
  }, [graveyardDiscoverState]);

  // [turnCount] effect DELETED — handled by START_TURN reducer in game-core/rules/turn.ts

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

  const resetDragState = useCallback(() => {
    setDraggedCard(null);
    setDraggedEquipment(null);
    setDraggedCardSource(null);
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


  const getMonsterRewardsPreview = useCallback(
    (monster: GameCardData): MonsterRewardOption[] => {
      const cached = engine.getState().monsterRewardPreviewCache[monster.id];
      if (cached) return cached;
      // Cache miss (e.g. legacy save before the pre-generation fix). Generate
      // and cache via the reducer so it survives undo and matches the actual
      // reward when this monster dies.
      dispatch({ type: 'CACHE_MONSTER_REWARD_PREVIEW', monster });
      return engine.getState().monsterRewardPreviewCache[monster.id] ?? [];
    },
    [engine, dispatch],
  );

  const handleCardClick = useCallback(
    (card: GameCardData) => {
      if (fullBoardInteractionLockedRef.current) return;
      setSelectedCard(card);
      if (card.type === 'monster') {
        const preview = getMonsterRewardsPreview(card);
        dispatch({ type: 'SET_SELECTED_MONSTER_REWARDS', options: preview });
      } else {
        (null);
      }
      setDetailsModalOpen(true);
    },
    [getMonsterRewardsPreview],
  );

  const handleDetailsModalChange = useCallback((open: boolean) => {
    setDetailsModalOpen(open);
    if (!open) {
      (null);
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
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `${monster.name} 被弃牌雷击击中，受到 ${flight.damage} 点伤害。` });
      }
    },
    [addGameLog, dealDamageToMonster],
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
        flightOverlayRef.current?.setDiscardShockFlights(remaining);
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
      flightOverlayRef.current?.setDiscardShockFlights(discardShockFlightsRef.current);
      startDiscardShockFlightAnimation();
      return true;
    },
    [amuletSlots, startDiscardShockFlightAnimation],
  );

  // Directed combat FX (shield reflect, boss retaliation, etc.) now managed by useDirectedCombatFx hook

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
      (c): c is GameCardData => isDamageableTarget(c),
    );
    if (monsters.length === 0) {
      discardShockProcQueueRef.current = [];
      bumpLock();
      return;
    }

    const { showBanner } = queue.shift()!;
    let rng = engine.getState().rng;
    const [target, rng2] = pickRandom(monsters, rng); rng = rng2;
    dispatch({ type: 'SET_GAME_FLAGS', patch: { rng } });
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
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `${target.name} 被弃牌雷击击中，受到 ${dmg} 点伤害。` });
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
    tryStartDiscardShockFlight]);

  useLayoutEffect(() => {
    flushDiscardShockQueueRef.current = flushDiscardShockQueue;
  }, [flushDiscardShockQueue]);

  // ---------------------------------------------------------------------------
  // 弧能之符 (flip-zap) animation pipeline — mirrors the discard-shock pipeline
  // above, but is triggered by `card:flipShock` (one independent zap per equipped
  // 弧能之符 amulet, fired on every APPLY_CARD_FLIP). Damage is spell-damage and
  // scales with permanentSpellDamageBonus, just like discard-zap.
  // ---------------------------------------------------------------------------

  const applyFlipShockHit = useCallback(
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
      addGameLog('amulet', `弧能之符对 ${monster.name} 造成 ${flight.damage} 点法术伤害`);
      dealDamageToMonster(monster, flight.damage, { pulses: flight.pulses, isSpellDamage: true });
      if (flight.showBanner) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `${monster.name} 被弧能之符击中，受到 ${flight.damage} 点法术伤害。` });
      }
    },
    [addGameLog, dealDamageToMonster],
  );
  applyFlipShockHitRef.current = applyFlipShockHit;

  const syncFlipShockInteractionLock = useCallback(() => {
    const busy =
      flipShockProcQueueRef.current.length > 0 ||
      flipShockSeqInFlightRef.current ||
      flipShockFlightsRef.current.length > 0;
    setFlipShockInteractionLocked(busy);
  }, [setFlipShockInteractionLocked]);

  const syncFlipShockInteractionLockRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    syncFlipShockInteractionLockRef.current = syncFlipShockInteractionLock;
  }, [syncFlipShockInteractionLock]);

  const updateFlipShockFlightAnimation = useCallback(
    (timestamp: number) => {
      const flights = flipShockFlightsRef.current;
      if (!flights.length) {
        flipShockFlightAnimationRef.current = null;
        syncFlipShockInteractionLockRef.current();
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

        const el = flipShockElementMapRef.current.get(flight.id);
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

      toHit.forEach(f => applyFlipShockHit(f));

      if (hasCompleted) {
        const prevLen = flights.length;
        const remaining = flights.filter(f => f.progress < 1);
        flipShockFlightsRef.current = remaining;
        flightOverlayRef.current?.setFlipShockFlights(remaining);
        if (remaining.length < prevLen) {
          flipShockSeqInFlightRef.current = false;
          queueMicrotask(() => {
            flushFlipShockQueueRef.current();
            syncFlipShockInteractionLockRef.current();
          });
        }
      }

      if (hasActive && flipShockFlightsRef.current.length > 0) {
        flipShockFlightAnimationRef.current = window.requestAnimationFrame(updateFlipShockFlightAnimation);
      } else {
        flipShockFlightAnimationRef.current = null;
        syncFlipShockInteractionLockRef.current();
      }
    },
    [applyFlipShockHit],
  );

  const startFlipShockFlightAnimation = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (flipShockFlightAnimationRef.current !== null) return;
    flipShockFlightAnimationRef.current = window.requestAnimationFrame(updateFlipShockFlightAnimation);
  }, [updateFlipShockFlightAnimation]);

  const tryStartFlipShockFlight = useCallback(
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
      const zapAmulet = amuletSlots.find(a => a.amuletEffect === 'flip-zap');
      const flight: DiscardShockFlight = {
        id: `flip-shock-${targetMonsterId}-${baseTime}-${Math.random().toString(36).slice(2, 6)}`,
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
      flipShockFlightsRef.current = [...flipShockFlightsRef.current, flight];
      flightOverlayRef.current?.setFlipShockFlights(flipShockFlightsRef.current);
      startFlipShockFlightAnimation();
      return true;
    },
    [amuletSlots, startFlipShockFlightAnimation],
  );

  const flushFlipShockQueue = useCallback(() => {
    const bumpLock = () => {
      syncFlipShockInteractionLockRef.current();
    };
    if (flipShockSeqInFlightRef.current) {
      bumpLock();
      return;
    }
    const queue = flipShockProcQueueRef.current;
    if (queue.length === 0) {
      bumpLock();
      return;
    }

    if (!engine.getState().amuletSlots.some(s => s?.amuletEffect === 'flip-zap')) {
      flipShockProcQueueRef.current = [];
      bumpLock();
      return;
    }
    const monsters = flattenActiveRowSlots(activeCardsLatestRef.current).filter(
      (c): c is GameCardData => isDamageableTarget(c),
    );
    if (monsters.length === 0) {
      flipShockProcQueueRef.current = [];
      bumpLock();
      return;
    }

    const { showBanner } = queue.shift()!;
    let rng = engine.getState().rng;
    const [target, rng2] = pickRandom(monsters, rng); rng = rng2;
    dispatch({ type: 'SET_GAME_FLAGS', patch: { rng } });
    const dmg = Math.max(0, 3 + permanentSpellDamageBonus);

    flipShockSeqInFlightRef.current = true;
    const started = tryStartFlipShockFlight(target.id, dmg, 2, showBanner);
    if (!started) {
      flipShockSeqInFlightRef.current = false;
      if (dmg > 0 && !engagedMonsterIdsRef.current.includes(target.id)) {
        beginCombatRef.current(target, 'hero');
      }
      addGameLog('amulet', `弧能之符对 ${target.name} 造成 ${dmg} 点法术伤害`);
      dealDamageToMonster(target, dmg, { pulses: 2, isSpellDamage: true });
      if (showBanner) {
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `${target.name} 被弧能之符击中，受到 ${dmg} 点法术伤害。` });
      }
      queueMicrotask(() => {
        flushFlipShockQueueRef.current();
        syncFlipShockInteractionLockRef.current();
      });
    } else {
      bumpLock();
    }
  }, [
    addGameLog,
    dealDamageToMonster,
    engine,
    permanentSpellDamageBonus,
    tryStartFlipShockFlight,
  ]);

  useLayoutEffect(() => {
    flushFlipShockQueueRef.current = flushFlipShockQueue;
  }, [flushFlipShockQueue]);

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
          dispatch({ type: 'MODIFY_GOLD', delta: card.onDestroyGold!, source: 'equipment-destroy-gold' });
          addGameLog('equip', `${card.name} 遗言：获得了 ${card.onDestroyGold} 金币`);
        }
        if (card.onDestroyDraw) {
          for (let di = 0; di < card.onDestroyDraw; di++) drawFromBackpackToHand();
          addGameLog('equip', `${card.name} 遗言：抽取了 ${card.onDestroyDraw} 张牌`);
        }
        if (card.onDestroyClassDraw) {
          drawClassCardsToBackpack(card.onDestroyClassDraw, `${card.name}-遗言`);
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
          if (card.onDestroyEffect === 'graveyard-to-hand') {
            const graveyard = engine.getState().discardedCards;
            const pick = pickGraveyardCardExcluding(graveyard, card.id, engine.getState().rng);
            if (pick) {
              dispatch({ type: 'SET_GAME_FLAGS', patch: { rng: pick.rng } });
              dispatch({ type: 'UPDATE_DISCARDED_CARDS', updater: prev => prev.filter((_, i) => i !== pick.idx) });
              queueCardIntoHand(pick.picked, 'graveyard');
              addGameLog('equip', `${card.name} 遗言：从坟场获得了「${pick.picked.name}」！`);
              onNewCardGainedRef.current?.(1, 'graveyard');
            } else {
              addGameLog('equip', `${card.name} 遗言：坟场没有可用的牌。`);
            }
          } else {
            addGameLog('equip', `${card.name} 遗言：${card.onDestroyEffect}`);
          }
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
          addGameLog('combat', `${monsterName} 破甲：攻击「${item.name}」（耐久 ${dur} > 血层 ${remainingLayers}），但它复生了！`);
        } else {
          dispatch({ type: 'SET_EQUIPMENT_SLOT', slotId: slotId as 'equipmentSlot1' | 'equipmentSlot2', card: null });
          disposeOwnedEquipmentCard(card, { isDestruction: true });
          addGameLog('combat', `${monsterName} 破甲：破坏了「${item.name}」（耐久 ${dur} > 血层 ${remainingLayers}）！`);
          const skelOtherSlotId: EquipmentSlotId = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
          const skelOtherItem = skelOtherSlotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
          if (skelOtherItem && skelOtherItem.type === 'monster' && (skelOtherItem as GameCardData).skeletonReRevive
            && (!(skelOtherItem as GameCardData).hasRevive || (skelOtherItem as GameCardData).reviveUsed)) {
            setEquipmentSlotById(skelOtherSlotId, { ...skelOtherItem, hasRevive: true, reviveUsed: false } as EquipmentItem);
            addGameLog('equip', `${skelOtherItem.name} 轮回：获得了「复生」！`);
            dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `${skelOtherItem.name} 轮回！` });
          }
        }
        return true;
      }
      return false;
    };
    const d1 = destroySlot('equipmentSlot1', equipmentSlot1);
    const d2 = destroySlot('equipmentSlot2', equipmentSlot2);
    if (d1 || d2) {
      dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `${monsterName} 破甲！高耐久装备被破坏！` });
    }
  };

  const triggerDiscardShock = useCallback((count: number) => {
    if (count <= 0) return;
    const s = engine.getState();
    if (!s.amuletSlots.some(slot => slot?.amuletEffect === 'discard-zap')) {
      return;
    }
    const monsters = flattenActiveRowSlots(activeCardsLatestRef.current).filter(
      (c): c is GameCardData => isDamageableTarget(c),
    );
    if (monsters.length === 0) {
      return;
    }
    const showBanner =
      !s.pendingHeroSkillAction && !s.pendingMagicAction && !s.pendingPotionAction;
    for (let i = 0; i < count; i++) {
      discardShockProcQueueRef.current.push({ showBanner });
    }
    flushDiscardShockQueueRef.current();
    syncDiscardShockInteractionLockRef.current();
  }, [engine]);

  const triggerFlipShock = useCallback((count: number) => {
    if (count <= 0) return;
    const s = engine.getState();
    if (!s.amuletSlots.some(slot => slot?.amuletEffect === 'flip-zap')) {
      return;
    }
    const monsters = flattenActiveRowSlots(activeCardsLatestRef.current).filter(
      (c): c is GameCardData => isDamageableTarget(c),
    );
    if (monsters.length === 0) {
      return;
    }
    const showBanner =
      !s.pendingHeroSkillAction && !s.pendingMagicAction && !s.pendingPotionAction;
    for (let i = 0; i < count; i++) {
      flipShockProcQueueRef.current.push({ showBanner });
    }
    flushFlipShockQueueRef.current();
    syncFlipShockInteractionLockRef.current();
  }, [engine]);

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
    dispatch({ type: 'RESET_HERO_TURN_USAGE' });
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
 

  







  // [activeCards] animation bookkeeping — slot-cleared registration is now handled by
  // postProcessActiveCards in reducer.ts (enqueues REGISTER_DUNGEON_CARD_PROCESSED)
  useEffect(() => {
    const prevSlots = previousActiveCardsRef.current;
    const isInitialSetup = prevSlots.every(s => s === null);
    if (isInitialSetup && freshGameStartRef.current) {
      freshGameStartRef.current = false;
    }
    previousActiveCardsRef.current = activeCards;
  }, [activeCards]);

  // UI-bridge: track backpack-store animation completion and clear storingCardIds ref
  useEffect(() => {
    if (storingCardIdsRef.current.size === 0) return;
    const readyIds: string[] = [];
    storingCardIdsRef.current.forEach(cardId => {
      if (backpackItems.some(card => card.id === cardId)) {
        readyIds.push(cardId);
      }
    });
    readyIds.forEach(cardId => {
      storingCardIdsRef.current.delete(cardId);
      logBackpackDraw('backpack-store-ready', { cardId });
    });
  }, [backpackItems]);











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
      flightOverlayRef.current?.setClassDeckFlights(remaining);
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
    const classDeckCell = classDeckCellRef.current;
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
    flightOverlayRef.current?.setClassDeckFlights(classDeckFlightsRef.current);
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
      flightOverlayRef.current?.setFateSwapFlights(remaining);
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
      }];

    fateSwapFlightsRef.current = [...fateSwapFlightsRef.current, ...flights];
    flightOverlayRef.current?.setFateSwapFlights(fateSwapFlightsRef.current);
    startFateSwapFlightAnimation();
  }, [startFateSwapFlightAnimation]);

  // ---------------------------------------------------------------------------
  // 乾坤挪移 / 命运挪移 — two active-row cards trade slot positions.
  // Reuses the FateSwapFlight RAF system: two arc flights between the two
  // active cells, one in each direction, simultaneous. Cards are face-up
  // before AND after the swap, so we don't need a flip phase — the arc +
  // rotate + scale + fade vocabulary (same as 深层交织) carries the magic
  // intent. The cells underneath show post-swap state; the fade-in/fade-out
  // on the overlays masks the brief moment when both versions are visible.
  // ---------------------------------------------------------------------------
  const triggerActiveRowSwapFlight = useCallback((
    leftSlotIdx: number,
    rightSlotIdx: number,
    leftCard: GameCardData,
    rightCard: GameCardData,
  ) => {
    if (typeof window === 'undefined') return;
    const surfaceEl = gameSurfaceRef.current;
    const leftCell = activeCellRefs.current[leftSlotIdx];
    const rightCell = activeCellRefs.current[rightSlotIdx];
    if (!surfaceEl || !leftCell || !rightCell) return;

    const surfaceRect = surfaceEl.getBoundingClientRect();
    const leftRect = leftCell.getBoundingClientRect();
    const rightRect = rightCell.getBoundingClientRect();
    const leftCenter: Point = {
      x: leftRect.left + leftRect.width / 2 - surfaceRect.left,
      y: leftRect.top + leftRect.height / 2 - surfaceRect.top,
    };
    const rightCenter: Point = {
      x: rightRect.left + rightRect.width / 2 - surfaceRect.left,
      y: rightRect.top + rightRect.height / 2 - surfaceRect.top,
    };
    const baseTime = performance.now();
    const duration = animSpeed(FATE_SWAP_FLIGHT_DURATION);

    const flights: FateSwapFlight[] = [
      {
        id: `active-swap-l2r-${leftCard.id}-${baseTime}`,
        card: leftCard,
        start: leftCenter,
        end: rightCenter,
        startTime: baseTime,
        duration,
        progress: 0,
        arcHeight: FATE_SWAP_ARC_HEIGHT,
      },
      {
        id: `active-swap-r2l-${rightCard.id}-${baseTime}`,
        card: rightCard,
        start: rightCenter,
        end: leftCenter,
        startTime: baseTime,
        duration,
        progress: 0,
        arcHeight: FATE_SWAP_ARC_HEIGHT,
      },
    ];

    fateSwapFlightsRef.current = [...fateSwapFlightsRef.current, ...flights];
    flightOverlayRef.current?.setFateSwapFlights(fateSwapFlightsRef.current);
    startFateSwapFlightAnimation();
  }, [startFateSwapFlightAnimation]);

  // ---------------------------------------------------------------------------
  // 迷宫回溯 — single active-row card flies to the deck pile.
  // Same RAF system, only the outbound flight (no inbound counterpart).
  // ---------------------------------------------------------------------------
  const triggerReturnToDeckFlight = useCallback((slotIdx: number, card: GameCardData) => {
    if (typeof window === 'undefined') return;
    const surfaceEl = gameSurfaceRef.current;
    const activeCell = activeCellRefs.current[slotIdx];
    const deckEl = deckFlyTargetRef.current;
    if (!surfaceEl || !activeCell || !deckEl) return;

    const surfaceRect = surfaceEl.getBoundingClientRect();
    const cellRect = activeCell.getBoundingClientRect();
    const deckRect = deckEl.getBoundingClientRect();
    const cellCenter: Point = {
      x: cellRect.left + cellRect.width / 2 - surfaceRect.left,
      y: cellRect.top + cellRect.height / 2 - surfaceRect.top,
    };
    const deckCenter: Point = {
      x: deckRect.left + deckRect.width / 2 - surfaceRect.left,
      y: deckRect.top + deckRect.height / 2 - surfaceRect.top,
    };
    const baseTime = performance.now();
    const duration = animSpeed(FATE_SWAP_FLIGHT_DURATION);

    const flight: FateSwapFlight = {
      id: `return-deck-${card.id}-${baseTime}`,
      card,
      start: cellCenter,
      end: deckCenter,
      startTime: baseTime,
      duration,
      progress: 0,
      arcHeight: FATE_SWAP_ARC_HEIGHT,
    };

    fateSwapFlightsRef.current = [...fateSwapFlightsRef.current, flight];
    flightOverlayRef.current?.setFateSwapFlights(fateSwapFlightsRef.current);
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
      flightOverlayRef.current?.setGraveyardStackFlights(remaining);
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
    flightOverlayRef.current?.setGraveyardStackFlights(graveyardStackFlightsRef.current);
    startGraveyardStackFlightAnimation();
  }, [animSpeed, startGraveyardStackFlightAnimation]);

  const triggerGraveyardToBackpackFlight = useCallback((cards: GameCardData[]) => {
    if (!cards.length || typeof window === 'undefined') return;
    const surfaceEl = gameSurfaceRef.current;
    const graveyardEl = graveyardCellRef.current;
    const backpackCell = heroRowCellRefs.current[HERO_ROW_BACKPACK_INDEX];

    if (!surfaceEl || !graveyardEl || !backpackCell) return;

    const surfaceRect = surfaceEl.getBoundingClientRect();
    const graveyardRect = graveyardEl.getBoundingClientRect();
    const backpackRect = backpackCell.getBoundingClientRect();
    const baseTime = performance.now();

    const graveyardCenter: Point = {
      x: graveyardRect.left + graveyardRect.width / 2 - surfaceRect.left,
      y: graveyardRect.top + graveyardRect.height / 2 - surfaceRect.top,
    };
    const backpackCenter: Point = {
      x: backpackRect.left + backpackRect.width / 2 - surfaceRect.left,
      y: backpackRect.top + backpackRect.height / 2 - surfaceRect.top,
    };

    const flights: GraveyardStackFlight[] = cards.map((card, i) => ({
      id: `graveyard-backpack-${card.id}-${baseTime}`,
      card,
      start: {
        x: graveyardCenter.x + (Math.random() - 0.5) * 16,
        y: graveyardCenter.y + (Math.random() - 0.5) * 10,
      },
      end: {
        x: backpackCenter.x + (Math.random() - 0.5) * 12,
        y: backpackCenter.y + (Math.random() - 0.5) * 8,
      },
      startTime: baseTime + i * 120,
      duration: animSpeed(GRAVEYARD_STACK_FLIGHT_DURATION),
      progress: 0,
      arcHeight: GRAVEYARD_STACK_ARC_HEIGHT + Math.random() * 20,
    }));

    graveyardStackFlightsRef.current = [...graveyardStackFlightsRef.current, ...flights];
    flightOverlayRef.current?.setGraveyardStackFlights(graveyardStackFlightsRef.current);
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
        // Reveal the hand slot in the same render that ensures the card is
        // present — by removing the id from the in-flight store first, the
        // subsequent React render reads `inFlightCardIds.has(card.id) === false`
        // and paints the slot with `opacity: 1`, "landing" the card visually.
        inFlightHandStore.remove(card.id);
        ensureCardInHand(card);
      });
    }

    if (hasCompleted) {
      const remaining = flights.filter(f => f.progress < 1);
      backpackHandFlightsRef.current = remaining;
      flightOverlayRef.current?.setBackpackHandFlights(remaining);
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
      let sourceCell: HTMLElement | null = null;
      if (sourceHint === 'graveyard') {
        sourceCell = graveyardCellRef.current;
      } else if (sourceHint === 'equipmentSlot1') {
        sourceCell = heroRowCellRefs.current[HERO_ROW_EQUIPMENT_1_INDEX];
      } else if (sourceHint === 'equipmentSlot2') {
        sourceCell = heroRowCellRefs.current[HERO_ROW_EQUIPMENT_2_INDEX];
      } else if (sourceHint === 'amulet') {
        sourceCell = heroRowCellRefs.current[HERO_ROW_AMULET_INDEX];
      } else if (sourceHint === 'classDeck') {
        sourceCell = classDeckCellRef.current;
      } else {
        sourceCell = heroRowCellRefs.current[HERO_ROW_BACKPACK_INDEX]
          // Narrow layout: hero-row backpack cell is unmounted; fall back to
          // the compact backpack button rendered in NarrowSidebar so the
          // draw animation still flies from the visible backpack position.
          ?? compactBackpackCellRef.current;
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

      // Mark this card as in-flight in the external store BEFORE the engine
      // notifies React of the new handCards state. Because HandDisplay reads
      // both stores via `useSyncExternalStore`, the very first render of the
      // newly drawn card slot already sees `opacity: 0` — no flash.
      inFlightHandStore.add(card.id);

      backpackHandFlightsRef.current = [...backpackHandFlightsRef.current, flight];
      flightOverlayRef.current?.setBackpackHandFlights(backpackHandFlightsRef.current);
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
      flightOverlayRef.current?.setDiscardFlights(remaining);
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
    (
      card: GameCardData,
      destination: 'graveyard' | 'recycle-bag',
      // 当卡片在被挤掉的瞬间 DOM 已经被新卡顶替（例如 reducer 同步把
      // equipmentSlot1/amuletSlots 替换掉了），按 data-testid 查不到原卡。
      // 这时传入对应栏位的 hint，用栏位 cell 的 boundingRect 当起点，
      // 飞行方向仍然是「装备/护符栏 → 坟场」。
      sourceHint?: FlightSourceHint,
    ): Promise<void> => {
      if (typeof window === 'undefined') return Promise.resolve();
      const surfaceEl = gameSurfaceRef.current;
      const targetEl = destination === 'graveyard'
        ? graveyardCellRef.current
        : heroRowCellRefs.current[HERO_ROW_BACKPACK_INDEX];
      if (!surfaceEl || !targetEl) return Promise.resolve();

      const surfaceRect = surfaceEl.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();

      let hintRect: DOMRect | null = null;
      if (sourceHint === 'amulet') {
        hintRect = heroRowCellRefs.current[HERO_ROW_AMULET_INDEX]?.getBoundingClientRect() ?? null;
      } else if (sourceHint === 'equipmentSlot1') {
        hintRect = heroRowCellRefs.current[HERO_ROW_EQUIPMENT_1_INDEX]?.getBoundingClientRect() ?? null;
      } else if (sourceHint === 'equipmentSlot2') {
        hintRect = heroRowCellRefs.current[HERO_ROW_EQUIPMENT_2_INDEX]?.getBoundingClientRect() ?? null;
      } else if (sourceHint === 'graveyard') {
        hintRect = graveyardCellRef.current?.getBoundingClientRect() ?? null;
      } else if (sourceHint === 'hero') {
        hintRect = heroRowCellRefs.current[HERO_ROW_HERO_INDEX]?.getBoundingClientRect() ?? null;
      }

      const cardEl = hintRect
        ? null
        : (surfaceEl.querySelector(
            `[data-testid="card-${card.type}-${card.id}"]`,
          ) as HTMLElement | null);
      const sourceRect =
        hintRect
        ?? cardEl?.getBoundingClientRect()
        ?? handAreaRef.current?.getBoundingClientRect();
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
        flightOverlayRef.current?.setDiscardFlights(discardFlightsRef.current);
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
      flightOverlayRef.current?.setStealCardFlights(remaining);
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
        flightOverlayRef.current?.setStealCardFlights(stealCardFlightsRef.current);
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
    dispatch({ type: 'SET_HYDRATED' });
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

  // Game-state persistence — debounced + idle-deferred.
  //
  // Why: serializeGameState() + JSON.stringify(state) + localStorage.setItem
  // are all synchronous and block the main thread. Running them inside a
  // depless useEffect (which fires on every render) puts a heavy IO write
  // on the user-gesture render path, which manifests as drag-drop / animation
  // jank — particularly visible during long-running flight animations
  // (classDeckFlight, waterfall) where stutter is unmistakable.
  //
  // Strategy:
  //   1. The effect just *schedules* a flush via setTimeout (250ms debounce).
  //      The setTimeout body reads engine.getState() at flush time, so
  //      coalesced renders within the debounce window collapse into a
  //      single write of the latest state.
  //   2. The actual stringify + setItem runs inside requestIdleCallback,
  //      so the heavy IO never blocks user gestures or animations even
  //      when the debounce fires mid-interaction.
  //   3. On unmount we cancel both timers and synchronously flush so we
  //      don't lose the last snapshot (e.g. user navigates away mid-debounce
  //      or before the idle callback fires).
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistIdleHandleRef = useRef<number | null>(null);
  const PERSIST_DEBOUNCE_MS = 250;

  // Pure body: serialize + dedupe + write. Called either from rIC (idle) or
  // synchronously from the unmount path.
  const performPersistedGameStateSave = useCallback(() => {
    const state = engine.getState();
    if (!state.isHydrated || state.gameOver) return;
    const persistedState = serializeGameState(state);
    const inFlight = backpackHandFlightsRef.current;
    let stateToSave = persistedState;
    if (inFlight.length > 0) {
      const existingIds = new Set(persistedState.handCards.map(c => c.id));
      const missing = inFlight
        .filter(f => !f.delivered && !existingIds.has(f.card.id))
        .map(f => f.card);
      if (missing.length > 0) {
        stateToSave = {
          ...persistedState,
          handCards: [...persistedState.handCards, ...missing],
        };
      }
    }
    const serialized = JSON.stringify(stateToSave);
    if (lastPersistedStateRef.current === serialized) {
      return;
    }
    lastPersistedStateRef.current = serialized;
    saveGameState(stateToSave);
  }, [engine]);

  const cancelPendingPersist = useCallback(() => {
    if (persistTimerRef.current !== null) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (persistIdleHandleRef.current !== null) {
      if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(persistIdleHandleRef.current);
      }
      persistIdleHandleRef.current = null;
    }
  }, []);

  const flushPersistedGameState = useCallback(() => {
    persistTimerRef.current = null;
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      persistIdleHandleRef.current = window.requestIdleCallback(
        () => {
          persistIdleHandleRef.current = null;
          performPersistedGameStateSave();
        },
        { timeout: 1000 },
      );
    } else {
      performPersistedGameStateSave();
    }
  }, [performPersistedGameStateSave]);

  useEffect(() => {
    if (!isHydrated || gameOver) return;
    if (persistTimerRef.current !== null) return;
    persistTimerRef.current = setTimeout(flushPersistedGameState, PERSIST_DEBOUNCE_MS);
  });

  useEffect(() => {
    return () => {
      cancelPendingPersist();
      // Idle callbacks don't fire during page unload — flush sync to be safe.
      performPersistedGameStateSave();
    };
  }, [cancelPendingPersist, performPersistedGameStateSave]);

  useEffect(() => {
    if (!isHydrated || !gameOver) {
      return;
    }
    // Cancel any pending debounced persistence (timer + idle callback) so a
    // stale write doesn't resurrect game state after we've cleared it.
    cancelPendingPersist();
    clearGameState();
    lastPersistedStateRef.current = null;
  }, [gameOver, isHydrated, cancelPendingPersist]);

  useEffect(() => {
    if (!gameOver) {
      return;
    }
    clearAllBackpackHandFallbacks();
    backpackHandFlightsRef.current = [];
    backpackFlightElementMapRef.current.clear();
    flightOverlayRef.current?.setBackpackHandFlights([]);
    inFlightHandStore.clear();
    fateSwapFlightsRef.current = [];
    fateSwapFlightElementMapRef.current.clear();
    flightOverlayRef.current?.setFateSwapFlights([]);
    if (fateSwapFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(fateSwapFlightAnimationRef.current);
      fateSwapFlightAnimationRef.current = null;
    }
    graveyardStackFlightsRef.current = [];
    graveyardStackFlightElementMapRef.current.clear();
    flightOverlayRef.current?.setGraveyardStackFlights([]);
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
    flightOverlayRef.current?.setDiscardShockFlights([]);
    discardShockProcQueueRef.current = [];
    discardShockSeqInFlightRef.current = false;
    if (flipShockFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(flipShockFlightAnimationRef.current);
      flipShockFlightAnimationRef.current = null;
    }
    flipShockFlightsRef.current = [];
    flipShockElementMapRef.current.clear();
    flightOverlayRef.current?.setFlipShockFlights([]);
    flipShockProcQueueRef.current = [];
    flipShockSeqInFlightRef.current = false;
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

  // Monster turn advance effect DELETED — handled by END_TURN enqueue chain in game-core

  // Safety net: prune stale engaged IDs whose cards no longer exist on the board
  // and whose defeat timeout already fired (not in pendingDefeatIds).
  // Stale engaged IDs pruning now runs automatically in reducer postProcessActiveCards

  // Monster→hero transition effect DELETED — all logic (dragon regen, wraith enrage/aura/amulet destroy,
  // goblin stack heal/steal, stun clear, boss last stand) handled by APPLY_MONSTER_TURN_END_EFFECTS reducer
  // heroTurnLayerLossIdsRef is cleared at END_TURN in useCombatActions;
  // this useMemo-driven clear is a defensive reset when turn transitions to hero
  const prevTurnRef = useRef(combatState.currentTurn);
  if (prevTurnRef.current === 'monster' && combatState.currentTurn === 'hero') {
    heroTurnLayerLossIdsRef.current.clear();
  }
  prevTurnRef.current = combatState.currentTurn;

  // [gold] elite buff effect DELETED — handled by CHECK_ELITE_GOLD_BUFF reducer in game-core/rules/dungeon.ts

  const initGame = (mode: 'single' | 'multiplayer' = 'single') => {
    combatAsyncEpochRef.current += 1;
    clearAllHandDeliveryGuards();
    processedDungeonCardIdsRef.current.clear();
    clearAllProcessedCardIds();
    previousActiveCardsRef.current = createEmptyActiveRow();
    freshGameStartRef.current = true;

    dispatch({ type: 'INIT_GAME', mode, totalWins: getTotalWins(), eternalRelics: getStartingRelics() });

    // Reset UI-only state + refs (animations, flights, etc.)
    flightOverlayRef.current?.setBackpackHandFlights([]);
    backpackHandFlightsRef.current = [];
    backpackFlightElementMapRef.current.clear();
    inFlightHandStore.clear();
    if (typeof window !== 'undefined' && backpackHandFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(backpackHandFlightAnimationRef.current);
      backpackHandFlightAnimationRef.current = null;
    }
    flightOverlayRef.current?.setFateSwapFlights([]);
    fateSwapFlightsRef.current = [];
    fateSwapFlightElementMapRef.current.clear();
    if (typeof window !== 'undefined' && fateSwapFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(fateSwapFlightAnimationRef.current);
      fateSwapFlightAnimationRef.current = null;
    }
    flightOverlayRef.current?.setGraveyardStackFlights([]);
    graveyardStackFlightsRef.current = [];
    graveyardStackFlightElementMapRef.current.clear();
    if (typeof window !== 'undefined' && graveyardStackFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(graveyardStackFlightAnimationRef.current);
      graveyardStackFlightAnimationRef.current = null;
    }
    flightOverlayRef.current?.setDiscardShockFlights([]);
    discardShockFlightsRef.current = [];
    discardShockElementMapRef.current.clear();
    discardShockProcQueueRef.current = [];
    discardShockSeqInFlightRef.current = false;
    if (typeof window !== 'undefined' && discardShockFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(discardShockFlightAnimationRef.current);
      discardShockFlightAnimationRef.current = null;
    }
    flightOverlayRef.current?.setFlipShockFlights([]);
    flipShockFlightsRef.current = [];
    flipShockElementMapRef.current.clear();
    flipShockProcQueueRef.current = [];
    flipShockSeqInFlightRef.current = false;
    if (typeof window !== 'undefined' && flipShockFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(flipShockFlightAnimationRef.current);
      flipShockFlightAnimationRef.current = null;
    }
    clearAllBackpackHandFallbacks();
    setBackpackViewerOpen(false);
    ghostBladeExileResolverRef.current = null;
    monsterRewardQueuedInstanceIdsRef.current.clear();
    lastWaterfallSequenceRef.current = null;
    cardDraftPendingSkillRef.current = null;
    dispatch({ type: 'SET_PERSUADE_DISCOUNT', discount: null });
    dispatch({ type: 'SET_PERSUADE_AMULET_BONUS', bonus: 0 });
    setPersuadeTempDiscount(0);
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
    clearAllProcessedCardIds();
    previousActiveCardsRef.current = createEmptyActiveRow();
    lastWaterfallSequenceRef.current = null;
    suppressTurnAmuletReapplyRef.current = true;

    const savedForgeCount = snapshot.recycleForgePlayCount ?? 0;
    const savedDamageStreak = snapshot.classDamageDiscoverStreak ?? 0;
    const savedMagicStreak = snapshot.classMagicDiscoverStreak ?? 0;
    const restoredAmulets = mapAmulets(snapshot.amuletSlots).map(slot => {
      if (slot?.amuletEffect === 'recycle-forge') {
        return {
          ...slot,
          description: `每使用或弃回 5 张牌，回收袋洗回背包（所有牌剩余瀑流 -1），然后抽 2 张牌。(可超手牌上限) [${savedForgeCount % 5}/5]`,
        };
      }
      if (slot?.amuletEffect === 'damage-class-discover') {
        const threshold = (slot.upgradeLevel ?? 0) >= 1 ? 4 : 6;
        return { ...slot, _counterDisplay: `${savedDamageStreak}/${threshold}` };
      }
      if (slot?.amuletEffect === 'magic-class-discover') {
        return { ...slot, _counterDisplay: `${savedMagicStreak}/5` };
      }
      if (slot?.amuletEffect === 'monster-kill-upgrade') {
        const killProgress = snapshot.monsterKillUpgradeProgress ?? 0;
        return { ...slot, _counterDisplay: `${killProgress}/3` };
      }
      if (slot?.amuletEffect === 'swap-upgrade') {
        const swapProg = snapshot.swapUpgradeProgress ?? 0;
        return { ...slot, _counterDisplay: `${swapProg}/3` };
      }
      if (slot?.amuletEffect === 'recycle-backpack-expand') {
        const recycleProg = snapshot.recycleBackpackProgress ?? 0;
        const recycleThreshold = (slot.upgradeLevel ?? 0) >= 1 ? 6 : 8;
        return { ...slot, _counterDisplay: `${recycleProg}/${recycleThreshold}` };
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
      classMagicDiscoverStreak: snapshot.classMagicDiscoverStreak ?? 0,
      mirrorCopySummonStreak: snapshot.mirrorCopySummonStreak ?? 0,
      recycleBackpackProgress: snapshot.recycleBackpackProgress ?? 0,
      swapUpgradeProgress: snapshot.swapUpgradeProgress ?? 0,
      monsterKillUpgradeProgress: snapshot.monsterKillUpgradeProgress ?? 0,
      flipOverkillLifestealProgress: snapshot.flipOverkillLifestealProgress ?? 0,
      equipAmuletCapProgress: snapshot.equipAmuletCapProgress ?? 0,
      stunAttemptDiscoverProgress: snapshot.stunAttemptDiscoverProgress ?? 0,
      flipDebuffMonsterId: snapshot.flipDebuffMonsterId ?? null,
      bugletAmuletObtained: Boolean(snapshot.bugletAmuletObtained),
      acquiredUniqueClassCardIds: Array.isArray((snapshot as any).acquiredUniqueClassCardIds)
        ? ((snapshot as any).acquiredUniqueClassCardIds as string[])
        : [],
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
      slotExtraAttacks: snapshot.slotExtraAttacks
        ? { equipmentSlot1: snapshot.slotExtraAttacks.equipmentSlot1 ?? 0, equipmentSlot2: snapshot.slotExtraAttacks.equipmentSlot2 ?? 0 }
        : { equipmentSlot1: 0, equipmentSlot2: 0 },
      permanentMagicRecycleBag: Array.isArray(snapshot.permanentMagicRecycleBag) ? snapshot.permanentMagicRecycleBag.map(patchPersistedMainDeckWeaponImage) : [],
      classDeck: Array.isArray(snapshot.classDeck) ? snapshot.classDeck : [],
      classCardsInHand: Array.isArray(snapshot.classCardsInHand) ? snapshot.classCardsInHand : [],
      selectedHeroSkill: (snapshot.selectedHeroSkill ?? null) as HeroSkillId | null,
      extraHeroSkills: Array.isArray((snapshot as any).extraHeroSkills) ? (snapshot as any).extraHeroSkills : [],
      showSkillSelection: typeof snapshot.showSkillSelection === 'boolean' ? snapshot.showSkillSelection : true,
      heroVariant: snapshot.heroVariant ?? (() => { let rng = engine.getState().rng; const [h, r] = getRandomHero(rng); dispatch({ type: 'SET_GAME_FLAGS', patch: { rng: r } }); return h; })(),
      heroClass: ((snapshot.heroVariant?.classTitle ?? '') as string).toLowerCase(),
      permanentSkills: Array.isArray(snapshot.permanentSkills) ? snapshot.permanentSkills : [],
      wraithPassiveEnabled: Boolean(snapshot.wraithPassiveEnabled),
      permanentMaxHpBonus: snapshot.permanentMaxHpBonus ?? 0,
      permanentSpellDamageBonus: snapshot.permanentSpellDamageBonus ?? 0,
      permanentSpellLifesteal: snapshot.permanentSpellLifesteal ?? 0,
      globalMineDamageBonus: (snapshot as any).globalMineDamageBonus ?? 0,
      stunCap: snapshot.stunCap ?? 10,
      heroStunned: snapshot.heroStunned ?? false,
      persuadeLevel: snapshot.persuadeLevel ?? 1,
      persuadeCostModifier: snapshot.persuadeCostModifier ?? 0,
      lastPersuadeTargetId: snapshot.lastPersuadeTargetId ?? null,
      consecutivePersuadeCount: snapshot.consecutivePersuadeCount ?? 0,
      persuadeSameTargetCostHalve: snapshot.persuadeSameTargetCostHalve ?? false,
      persuadeRaceBonus: snapshot.persuadeRaceBonus ?? {},
      persuadeSuccessDurabilityBonus: snapshot.persuadeSuccessDurabilityBonus ?? 0,
      persuadeAmuletBonus: snapshot.persuadeAmuletBonus ?? 0,
      permanentPersuadeBonus: snapshot.permanentPersuadeBonus ?? 0,
      persuadeDiscount: snapshot.persuadeDiscount ?? null,
      lastPlayedCardCategory: snapshot.lastPlayedCardCategory ?? null,
      transformChainPrevCategory: snapshot.transformChainPrevCategory ?? null,
      consecutiveTransformStreak: snapshot.consecutiveTransformStreak ?? 0,
      magicCardsPlayedThisTurn: snapshot.magicCardsPlayedThisTurn ?? 0,
      arcaneStormMagicCount: snapshot.arcaneStormMagicCount ?? 0,
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
      flashSlotUsed: Object.fromEntries(
        Object.entries(snapshot.flashSlotUsed ?? {}).map(([k, v]) => [
          k,
          typeof v === 'number' ? v : (v ? 1 : 0),
        ]),
      ) as Record<string, number>,
      gambitExtraActive: snapshot.gambitExtraActive ?? false,
      gambitExtraPerSlot: snapshot.gambitExtraPerSlot ?? 1,
      gambitSlotUsed: snapshot.gambitSlotUsed ?? {},
      weaponExtraAttackUsed: snapshot.weaponExtraAttackUsed ?? {},
      blockDurabilityPerSlot: snapshot.blockDurabilityPerSlot ?? 1,
      slotBattleSpiritBonus: snapshot.slotBattleSpiritBonus ?? {},
      slotBattleSpiritUsed: snapshot.slotBattleSpiritUsed ?? {},
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
      // Default to true on load for legacy saves: their slotTempAttack /
      // slotTempArmor already include the aura contribution, so we must
      // suppress START_TURN's safety-net re-apply (otherwise it would
      // stack and reproduce the bug on the very first post-load turn).
      amuletAuraAppliedThisWave: snapshot.amuletAuraAppliedThisWave ?? true,
      statSwapCardObtained: Boolean((snapshot as any).statSwapCardObtained),
      doubleNextMagic: Boolean(snapshot.doubleNextMagic),
      defensiveStanceActive: Boolean(snapshot.defensiveStanceActive),
      previewCardStacks: snapshot.previewCardStacks ?? {},
      activeCardStacks: snapshot.activeCardStacks ?? {},
      previewRevealedEarly: Array.isArray(snapshot.previewRevealedEarly) && snapshot.previewRevealedEarly.length === DUNGEON_COLUMN_COUNT
        ? snapshot.previewRevealedEarly.map(Boolean)
        : Array.from({ length: DUNGEON_COLUMN_COUNT }, () => false),
      waterfallDealBonus: snapshot.waterfallDealBonus ?? 0,
      eternalRelics: Array.isArray(snapshot.eternalRelics) ? snapshot.eternalRelics as import('@/game-core/types').EternalRelic[] : getStartingRelics(),
      // RNG 必须从 snapshot 恢复，否则刷新后会用 createInitialGameState() 的
      // Date.now() 种子，跟撤销栈里旧 snapshot 的 RNG 不同步——会导致后续任何
      // 走 RNG 的逻辑（包括 monster reward 缓存未命中时的现场生成）跟撤销前
      // 不一致。
      rng: snapshot.rng
        ? { seed: snapshot.rng.seed, state: snapshot.rng.state }
        : engine.getState().rng,
      // 怪物奖励预览缓存也必须持久化恢复——这是「撤销重打拿到一样的奖励」的
      // 唯一保证（cache HIT 路径完全跳过 RNG）。
      monsterRewardPreviewCache: (snapshot.monsterRewardPreviewCache ?? {}) as import('@/game-core/types').GameState['monsterRewardPreviewCache'],
      undoCount: engine.getUndoCount(),
      isHydrated: true,
      totalWins: getTotalWins(),

      // --- Restore modal states ---
      discoverModalOpen: Boolean(snapshot.discoverModalOpen),
      discoverModalMinimized: Boolean(snapshot.discoverModalMinimized),
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
      shopEquipAttackUsed: Boolean(snapshot.shopEquipAttackUsed),
      shopEquipArmorUsed: Boolean(snapshot.shopEquipArmorUsed),
      shopRefreshUsed: Boolean(snapshot.shopRefreshUsed),
      shopSkillOptions: Array.isArray(snapshot.shopSkillOptions) ? snapshot.shopSkillOptions : [],
      shopSkillSelectOpen: Boolean(snapshot.shopSkillSelectOpen),
      monsterRewardQueue: Array.isArray(snapshot.monsterRewardQueue) ? snapshot.monsterRewardQueue as import('@/game-core/types').MonsterRewardDrop[] : [],
      activeMonsterReward: (snapshot.activeMonsterReward as import('@/game-core/types').MonsterRewardDrop | null) ?? null,
      monsterRewardMinimized: Boolean(snapshot.monsterRewardMinimized),
      selectedMonsterRewards: (snapshot.selectedMonsterRewards as import('@/game-core/types').MonsterRewardOption[] | null) ?? null,
      graveyardDiscoverState: snapshot.graveyardDiscoverState ?? null,
      graveyardDiscoverMinimized: Boolean(snapshot.graveyardDiscoverMinimized),
      graveyardDiscoverDelivery: snapshot.graveyardDiscoverDelivery ?? 'backpack',
      ghostBladeExileCards: snapshot.ghostBladeExileCards ?? null,
      handMagicUpgradeModal: snapshot.handMagicUpgradeModal ?? null,
      mirrorCopyModal: snapshot.mirrorCopyModal ?? null,
      monsterFusionModal: snapshot.monsterFusionModal ?? null,
      permGrantModal: (snapshot.permGrantModal as import('@/game-core/types').GameState['permGrantModal']) ?? null,
      amplifyModal: snapshot.amplifyModal ?? null,
      eventAmplifyHandPicker: snapshot.eventAmplifyHandPicker ?? null,
      persuadeState: (snapshot.persuadeState as import('@/game-core/types').PersuadeModalState | null) ?? null,
      deathWardNotice: (snapshot.deathWardNotice as import('@/game-core/types').DeathWardNoticeState | null) ?? null,
      gameLogEntries: (loadGameLog()?.entries ?? []) as import('@/components/GameLogPanel').LogEntry[],
      amplifiedCardBonus: snapshot.amplifiedCardBonus ?? {},
      // 60s hero turn 倒计时起始时间戳。null 表示当前不在 hero combat turn。
      // 还原后 HeroTurnTimer 仍能从 wall-clock 计算剩余时间——已经超时的回合
      // 在第一个 tick 就会自动结束。
      playerTurnStartedAt: snapshot.playerTurnStartedAt ?? null,
      // ---------------------------------------------------------------------
      // Multiplayer (phase 6): restore session pointer so useMultiplayerSync
      // re-attaches the Realtime channel. The transfer-resume backfill below
      // (in a follow-up effect after this dispatch) will replay any missed
      // transfers using `multiplayerSession.lastAppliedSeq`.
      // ---------------------------------------------------------------------
      multiplayerSession: snapshot.multiplayerSession ?? null,
      // Restoring pendingTransferOut + companion delta gives the
      // useMultiplayerSync hook everything it needs to re-POST any cards
      // that were staged but not ack'd by the server before the tab closed.
      pendingTransferOut: Array.isArray(snapshot.pendingTransferOut)
        ? snapshot.pendingTransferOut.map(c => patchPersistedMainDeckWeaponImage(c as GameCardData))
        : null,
      pendingTransferOutPreviewDealt: Array.isArray(snapshot.pendingTransferOutPreviewDealt)
        ? snapshot.pendingTransferOutPreviewDealt.map(c => patchPersistedMainDeckWeaponImage(c as GameCardData))
        : null,
      sharedDeckConsumed: snapshot.sharedDeckConsumed ?? 0,
      bossEncounterAlertShown: Boolean(snapshot.bossEncounterAlertShown),
    });

    // Stacking state (previewCardStacks, activeCardStacks) is hydrated via engine state

    if (snapshot.currentEventCard && snapshot.resolvingDungeonCardId) {
      eventResolutionRef.current = { cardId: snapshot.resolvingDungeonCardId, source: 'dungeon' };
    } else if (snapshot.currentEventCard) {
      eventResolutionRef.current = { cardId: null, source: 'hand' };
    } else {
      eventResolutionRef.current = { cardId: null, source: null };
    }

    // Reset UI-only animation states
    setHeroSkillArrow(null);
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
    for (const timeouts of Object.values(mineExplodeTimeoutsRef.current)) {
      timeouts.forEach(id => clearTimeout(id));
    }
    mineExplodeTimeoutsRef.current = {};

    setHeroBleedActive(false);
    setMonsterBleedStates({});
    setWeaponSwingStates({ equipmentSlot1: 0, equipmentSlot2: 0 });
    setShieldBlockStates({ equipmentSlot1: 0, equipmentSlot2: 0 });
    setMineExplodeStates({});
    setRemovingCards(new Set());
    setMonsterDefeatStates({});

    // Clear stale tracking refs
    storingCardIdsRef.current.clear();
    pendingDungeonUseRef.current.clear();
    pendingAutoDrawsRef.current = 0;
    skipNextEventAutoDrawRef.current = false;
    skipEventFlipRef.current = false;
    heroTurnLayerLossIdsRef.current.clear();
    pendingDefeatIdsRef.current.clear();
    goblinStolenIdsRef.current.clear();

    clearWaterfallTimeouts();
    waterfallTimeoutsRef.current = [];
    waterfallLockRef.current = false;
    waterfallDiscoverPendingRef.current = false;
    waterfallSequenceRef.current = 0;
    pendingDungeonRemovalsRef.current = 0;
    setWaterfallAnimation(initialWaterfallAnimationState);
    flightOverlayRef.current?.setClassDeckFlights([]);
    classDeckFlightsRef.current = [];
    classDeckFlightElementMapRef.current.clear();
    if (classDeckFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(classDeckFlightAnimationRef.current);
      classDeckFlightAnimationRef.current = null;
    }
    flightOverlayRef.current?.setFateSwapFlights([]);
    fateSwapFlightsRef.current = [];
    fateSwapFlightElementMapRef.current.clear();
    if (fateSwapFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(fateSwapFlightAnimationRef.current);
      fateSwapFlightAnimationRef.current = null;
    }
    flightOverlayRef.current?.setGraveyardStackFlights([]);
    graveyardStackFlightsRef.current = [];
    graveyardStackFlightElementMapRef.current.clear();
    if (graveyardStackFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(graveyardStackFlightAnimationRef.current);
      graveyardStackFlightAnimationRef.current = null;
    }
    flightOverlayRef.current?.setBackpackHandFlights([]);
    backpackHandFlightsRef.current = [];
    backpackFlightElementMapRef.current.clear();
    inFlightHandStore.clear();
    if (backpackHandFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(backpackHandFlightAnimationRef.current);
      backpackHandFlightAnimationRef.current = null;
    }
    flightOverlayRef.current?.setDiscardShockFlights([]);
    discardShockFlightsRef.current = [];
    discardShockElementMapRef.current.clear();
    discardShockProcQueueRef.current = [];
    discardShockSeqInFlightRef.current = false;
    if (discardShockFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(discardShockFlightAnimationRef.current);
      discardShockFlightAnimationRef.current = null;
    }
    flightOverlayRef.current?.setFlipShockFlights([]);
    flipShockFlightsRef.current = [];
    flipShockElementMapRef.current.clear();
    flipShockProcQueueRef.current = [];
    flipShockSeqInFlightRef.current = false;
    if (flipShockFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(flipShockFlightAnimationRef.current);
      flipShockFlightAnimationRef.current = null;
    }
    if (directedCombatFxFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(directedCombatFxFlightAnimationRef.current);
      directedCombatFxFlightAnimationRef.current = null;
    }
    directedCombatFxFlightsRef.current = [];
    setDirectedCombatFxFlights([]);
    directedCombatFxElementMapRef.current.clear();
    clearAllBackpackHandFallbacks();

    // If the hydrated state has a pendingWaterfallPlan, start the animation.
    // The plan is persisted in GameState, so it survives refresh.
    const hydratedState = engine.getState();
    if (hydratedState.pendingWaterfallPlan) {
      setTimeout(() => startWaterfallAnimation(), 300);
    }
  };

  // pushUndoSnapshot / clearUndoStack now thin-delegate to the engine. The
  // engine stores snapshots by reference (no JSON.parse(JSON.stringify) deep
  // clone — relies on the reducer-immutability invariant). Persistence to
  // localStorage is wired via `engine.subscribeUndo` in the effect below
  // and is **debounced + macrotask-deferred** so the heavy
  // `JSON.stringify(stack)` + `setItem` never blocks the user gesture or
  // the React commit/paint that follows it.
  const pushUndoSnapshot = useCallback(() => {
    engine.pushUndoCheckpoint();
  }, [engine]);

  const clearUndoStack = useCallback(() => {
    engine.clearUndoStack();
    clearUndoStorage();
  }, [engine]);

  // Subscribe to engine undo stack changes and persist to localStorage off
  // the critical path.
  //
  // History: an earlier version used `queueMicrotask`, but microtasks run
  // at the end of the same task — i.e. AFTER React commit but BEFORE
  // browser paint — so the ~30–100ms `JSON.stringify(10×GameState)` +
  // `localStorage.setItem` cost still landed inside the user-gesture frame
  // and made every "play a card" feel laggy. We need a true macrotask
  // (setTimeout) to yield the main thread back to the browser so it can
  // paint the post-action UI first; the persistence write then runs in a
  // later frame where a missed deadline isn't visible to the player.
  //
  // Additionally we debounce: a single "play a card" gesture often pushes
  // multiple checkpoints in a tight burst (defensive pushes from several
  // hooks), and rapid play sessions chain many gestures together — without
  // debouncing each push would re-stringify the entire stack. Coalescing
  // to one write per ~250ms idle window cuts that to a single IO.
  useEffect(() => {
    const SAVE_DEBOUNCE_MS = 250;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let latest: readonly GameState[] = engine.getUndoStack();

    const flush = () => {
      timer = null;
      // Cast to mutable for the storage signature; saveUndoStack only
      // stringifies the input.
      saveUndoStack(latest as unknown as unknown[]);
    };

    const unsubscribe = engine.subscribeUndo((stack) => {
      latest = stack;
      if (timer !== null) return;
      timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (timer !== null) {
        // Flush any pending stack on unmount so we don't lose checkpoints
        // captured right before navigation. This is synchronous but only
        // happens on teardown, not on the hot path.
        clearTimeout(timer);
        timer = null;
        saveUndoStack(latest as unknown as unknown[]);
      }
    };
  }, [engine]);

  // Card-gain amulet callbacks
  onNewCardGainedRef.current = (count: number, source?: 'graveyard' | 'classPool') => {
    // 弹幕之符：仅在「从坟场获得牌」时触发，专属卡池路径不触发。
    // 历史上曾包含 classPool（Heavy Shield onDestroyClassDraw / 黄金探秘 / 商店购买 等），
    // 现在按设计收紧到 graveyard-only。card:newCardGained 事件本身仍然在 classPool
    // 路径下被 emit（见 rules/cards.ts / shop.ts / waterfall.ts），只是这里不再消费它。
    if (amuletEffects.cardGainMissileCount > 0 && source === 'graveyard') {
      const boltsPerTrigger = amuletEffects.cardGainMissileCount * 2;
      let rng = engine.getState().rng;
      const bolts: GameCardData[] = [];
      const bonusMap = engine.getState().amplifiedCardBonus;
      for (let i = 0; i < boltsPerTrigger; i++) {
        const [bolt, rng2] = createMagicBoltCard(rng); rng = rng2;
        bolts.push(applyAmplifyOnCreate(bolt, bonusMap));
      }
      dispatch({ type: 'SET_GAME_FLAGS', patch: { rng } });
      dispatch({ type: 'UPDATE_HAND_CARDS', updater: prev => {
        if (prev.length >= effectiveHandLimit) {
          addGameLog('amulet', `弹幕之符：手牌已满，未生成「魔弹」`);
          return prev;
        }
        addGameLog('amulet', `弹幕之符：获得 ${boltsPerTrigger} 张「魔弹」`);
        return [...prev, ...bolts];
      } });
    }
  };

  // Populate cardOps deps ref (all function deps are now defined)
  cardOpsDepsRef.current = {
    addGameLog,
    triggerDiscardFlight,
    triggerDiscardShock,
    triggerFlipShock,
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
    if (engine.getUndoStack().length === 0) return;
    if (undoInteractionLockedRef.current) return;
    // popUndoCheckpoint replaces engine state in place and notifies state
    // listeners + the undo subscription (which schedules the microtask
    // localStorage rewrite). No need for an extra `saveUndoStack` here.
    const snapshot = engine.popUndoCheckpoint();
    if (!snapshot) return;

    // Cancel any in-progress waterfall animations
    clearWaterfallTimeouts();
    waterfallTimeoutsRef.current = [];
    waterfallLockRef.current = false;
    waterfallDiscoverPendingRef.current = false;
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
    for (const timeouts of Object.values(mineExplodeTimeoutsRef.current)) {
      timeouts.forEach(id => clearTimeout(id));
    }
    mineExplodeTimeoutsRef.current = {};
    setMineExplodeStates({});

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
    flightOverlayRef.current?.setDiscardShockFlights([]);
    discardShockProcQueueRef.current = [];
    discardShockSeqInFlightRef.current = false;
    setDiscardShockInteractionLocked(false);
    if (flipShockFlightAnimationRef.current !== null) {
      window.cancelAnimationFrame(flipShockFlightAnimationRef.current);
      flipShockFlightAnimationRef.current = null;
    }
    flipShockFlightsRef.current = [];
    flipShockElementMapRef.current.clear();
    flightOverlayRef.current?.setFlipShockFlights([]);
    flipShockProcQueueRef.current = [];
    flipShockSeqInFlightRef.current = false;
    setFlipShockInteractionLocked(false);

    // Reset visual animation states
    setHeroBleedActive(false);
    setMonsterBleedStates({});
    setWeaponSwingStates({ equipmentSlot1: 0, equipmentSlot2: 0 });
    setShieldBlockStates({ equipmentSlot1: 0, equipmentSlot2: 0 });
    setRemovingCards(new Set());
    setMonsterDefeatStates({});

    // Clear stale tracking refs
    storingCardIdsRef.current.clear();
    pendingDungeonUseRef.current.clear();
    processedDungeonCardIdsRef.current.clear();
    clearAllProcessedCardIds();
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
    // Dagger self-destruct prompt is purely a hook-side awaiter (the side
    // effect that opened it lives in the snapshot we just discarded). If we
    // undo while the prompt is open, resolve the awaiter as "declined" and
    // close the modal — otherwise it stays on screen forever and any later
    // confirm/decline click operates on a state that no longer exists.
    if (daggerSelfDestructResolverRef.current) {
      daggerSelfDestructResolverRef.current(false);
      daggerSelfDestructResolverRef.current = null;
    }
    setDaggerSelfDestructPrompt(null);

    // Engine state was already restored to `snapshot` by popUndoCheckpoint
    // above; no need for an explicit replaceState here. Continue with the
    // out-of-band side effects that mirror engine state into UI refs.

    // Sync game log localStorage with restored state
    const restoredLog = snapshot.gameLogEntries ?? [];
    gameLogIdRef.current = restoredLog.length > 0 ? Math.max(...restoredLog.map(e => e.id)) : 0;
    saveGameLog(restoredLog, gameLogIdRef.current);

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
          dispatch({ type: 'CLEAR_ACTIVE_MONSTER_REWARD' });
        };
      } else {
        graveyardDiscoverResolverRef.current = () => {};
      }
    }
    cardActionRemainingRef.current = snapshot.cardActionContext?.remainingCount ?? 0;
    deletingCardIdsRef.current.clear();

    // If the restored state has a pendingWaterfallPlan, resume animation.
    // The plan is part of GameState so it survives undo.
    if (engine.getState().pendingWaterfallPlan) {
      setTimeout(() => startWaterfallAnimation(), 100);
    }
  }, [engine, clearWaterfallTimeouts, syncMonsterRewardQueuedInstanceIdsRef]);

  const handleNewGame = () => {
    setShowGameModeSelect(true);
  };

  const handleGameModeSelect = (mode: 'single' | 'multiplayer') => {
    setShowGameModeSelect(false);
    if (mode === 'multiplayer') {
      // Phase 5: open the lobby. We do NOT yet clear state / dispatch INIT —
      // those happen in `handleMultiplayerLobbyReady` once both players are
      // matched. Cancelling the lobby returns the user to the mode select.
      setShowMultiplayerLobby(true);
      return;
    }
    // Telemetry: fire-and-forget BEFORE clearGameState() so we can read the previous run.
    // gameMode is not persisted to localStorage — must read from live engine state.
    reportGameStart(mode, summarizePrevGame(engine.getState()));
    clearGameState();
    lastPersistedStateRef.current = null;
    clearUndoStack();
    clearGameLog();
    setGameOverMinimized(false);
    initGame(mode);
    dispatch({ type: 'SET_HYDRATED' });
    // Skill modal removed — player starts with no default Hero Skill. We still
    // need the opening setup (base 2 hand draws + any eternal-relic opening
    // hooks like 召唤随从 / 雷盾心法) to fire so the run is playable.
    // `runOpeningSetup('')` is safe with an empty skill id: getHeroSkillById
    // returns null and all skill-bonus branches no-op.
    runOpeningSetup('');
  };

  /**
   * Phase 5: called by `MultiplayerLobby` after both players are matched
   * (either the room creator's Realtime subscription saw `status='playing'`
   * or the joiner finished `joinRoom()`).
   *
   * Bootstraps the multiplayer game in one shot:
   *   1. Reset persistence / undo / log (mirrors single-player init).
   *   2. Dispatch `INIT_MULTIPLAYER_GAME` with the server-supplied shared
   *      deck. Reducer slices preview from sharedDeck[role*4..role*4+3],
   *      sets remainingDeck to sharedDeck[8..N-1], generates per-player
   *      hero/class deck, and writes `multiplayerSession` so the
   *      Realtime/transfer hook picks up immediately.
   *   3. Mark hydrated + run opening setup so the UI shows the dealt hand.
   */
  const handleMultiplayerLobbyReady = (params: {
    sharedDeck: GameCardData[];
    role: 'A' | 'B';
    roomId: string;
    peerId: string;
  }) => {
    setShowMultiplayerLobby(false);
    reportGameStart('multiplayer', summarizePrevGame(engine.getState()));
    clearGameState();
    lastPersistedStateRef.current = null;
    clearUndoStack();
    clearGameLog();
    setGameOverMinimized(false);
    dispatch({
      type: 'INIT_MULTIPLAYER_GAME',
      sharedDeck: params.sharedDeck,
      role: params.role,
      roomId: params.roomId,
      peerId: params.peerId,
      totalWins: engine.getState().totalWins ?? 0,
      eternalRelics: engine.getState().eternalRelics ?? [],
    });
    dispatch({ type: 'SET_HYDRATED' });
    runOpeningSetup('');
  };

  /**
   * Dev-only entry point: open a multiplayer-mode game with a fixed
   * "local-test" room id and the picked role. The matching tab (other role)
   * connects to the same BroadcastChannel keyed by `dh-mp-local-test` and
   * they exchange transferOut events. NO server, NO persistence, NO
   * authentication — just the local mechanic verified end-to-end.
   *
   * To keep both tabs' decks IDENTICAL (so the transfer mechanics can be
   * verified visually), we use the same `INIT_MULTIPLAYER_GAME` reducer the
   * real Supabase lobby uses, with a deterministic `LOCAL_TEST_DECK_SEED`.
   * Both tabs build the same 36-card sharedDeck → A's preview =
   * sharedDeck[0..3], B's preview = sharedDeck[4..7], both share remainingDeck
   * = sharedDeck[8..35] (28 cards). Per-player content (hero, knight class
   * deck, eternal relics) is still rolled with each tab's own RNG, so those
   * differ — that's OK because they're never synced in MP.
   *
   * `LOCAL_TEST_DECK_SEED` is fixed (not Date.now()) so two tabs opened at
   * different moments still match. Refresh both tabs to start a "new" game
   * with the same 36 cards. If you want to test a different shuffle, change
   * the constant inline.
   */
  const handleLocalRolePick = (role: 'local-A' | 'local-B') => {
    const LOCAL_TEST_DECK_SEED = 0xDEADBEEF; // any fixed integer; both tabs use this

    setShowGameModeSelect(false);
    const myRole: 'A' | 'B' = role === 'local-A' ? 'A' : 'B';
    const peerRole: 'A' | 'B' = myRole === 'A' ? 'B' : 'A';

    reportGameStart('multiplayer', summarizePrevGame(engine.getState()));
    clearGameState();
    lastPersistedStateRef.current = null;
    clearUndoStack();
    clearGameLog();
    setGameOverMinimized(false);

    // Build the same 36-card shared deck on both sides via the deterministic
    // seed. Mirrors `MultiplayerLobby.createRoom` → server-supplied path,
    // but skips the network round-trip.
    const { deck: sharedDeck } = buildSharedDeck(LOCAL_TEST_DECK_SEED);

    dispatch({
      type: 'INIT_MULTIPLAYER_GAME',
      sharedDeck,
      role: myRole,
      roomId: 'local-test',
      peerId: `local-${peerRole}`,
      totalWins: engine.getState().totalWins ?? 0,
      eternalRelics: engine.getState().eternalRelics ?? [],
    });

    dispatch({ type: 'SET_HYDRATED' });
    // Skill modal removed — player starts with no default Hero Skill. We still
    // need the opening setup (base 2 hand draws + any eternal-relic opening
    // hooks like 召唤随从 / 雷盾心法) to fire so the run is playable.
    // `runOpeningSetup('')` is safe with an empty skill id: getHeroSkillById
    // returns null and all skill-bonus branches no-op.
    runOpeningSetup('');
  };

  // Handle skill selection — active skills set as hero skill, passive skills become eternal relics
  const handleSkillSelection = (skillId: string) => {
    engine.batch(() => {
      resetHeroSkillForNewWave();
      const definition = getHeroSkillById(skillId as HeroSkillId);
      const isPassive = definition?.type === 'passive';

      if (isPassive) {
        const relic = getEternalRelic(skillId as import('@/game-core/types').EternalRelicId);
        dispatch({ type: 'UPDATE_ETERNAL_RELICS', updater: prev => [...prev, relic] });
        addGameLog('system', `获得永恒护符：${relic.name}`);

        const initialBonus = relic.initialMaxHpBonus ?? 0;
        if (initialBonus) {
          addGameLog('system', `开局加成：最大生命 +${initialBonus}`);
          (INITIAL_HP + initialBonus);
        }
        const initialGold = relic.initialGoldBonus ?? 0;
        if (initialGold) {
          dispatch({ type: 'MODIFY_GOLD', delta: initialGold, source: 'relic-initial-gold' });
          addGameLog('gold', `开局加成：金币 +${initialGold}`);
        }
        const initialWaterfall = relic.initialWaterfallBonus ?? 0;
        if (initialWaterfall) {
          dispatch({ type: 'INCREMENT_TURN_COUNT', delta: initialWaterfall });
          addGameLog('system', `开局加成：瀑流回合 +${initialWaterfall}`);
        }
        const initialShopLv = relic.initialShopLevel;
        if (initialShopLv != null && initialShopLv > 0) {
          dispatch({ type: 'SET_SHOP_LEVEL', level: initialShopLv });
          addGameLog('shop', `开局加成：商店等级 ${Math.min(MAX_SHOP_LEVEL, initialShopLv)}`);
        }
        const initialSpellDmg = relic.initialSpellDamageBonus ?? 0;
        if (initialSpellDmg) {
          dispatch({ type: 'MODIFY_PERMANENT_STAT', stat: 'permanentSpellDamageBonus', delta: initialSpellDmg });
          addGameLog('skill', `开局加成：永久法术伤害 +${initialSpellDmg}`);
        }
      } else {
        dispatch({ type: 'SELECT_HERO_SKILL', skillId: skillId as HeroSkillId });
        addGameLog('system', `选择英雄技能：${definition?.name ?? skillId}`);

        const initialBonus = definition?.initialMaxHpBonus ?? 0;
        if (initialBonus) {
          addGameLog('system', `开局加成：最大生命 +${initialBonus}`);
          (INITIAL_HP + initialBonus);
        }
        const initialGold = definition?.initialGoldBonus ?? 0;
        if (initialGold) {
          dispatch({ type: 'MODIFY_GOLD', delta: initialGold, source: 'skill-initial-gold' });
          addGameLog('gold', `开局加成：金币 +${initialGold}`);
        }
        const initialWaterfall = definition?.initialWaterfallBonus ?? 0;
        if (initialWaterfall) {
          dispatch({ type: 'INCREMENT_TURN_COUNT', delta: initialWaterfall });
          addGameLog('system', `开局加成：瀑流回合 +${initialWaterfall}`);
        }
        const initialShopLv = definition?.initialShopLevel;
        if (initialShopLv != null && initialShopLv > 0) {
          dispatch({ type: 'SET_SHOP_LEVEL', level: initialShopLv });
          addGameLog('shop', `开局加成：商店等级 ${Math.min(MAX_SHOP_LEVEL, initialShopLv)}`);
        }
        const initialBackpackCap = definition?.initialBackpackCapacityBonus ?? 0;
        if (initialBackpackCap) {
          dispatch({ type: 'MODIFY_PERMANENT_STAT', stat: 'backpackCapacityModifier', delta: initialBackpackCap });
          addGameLog('skill', `开局加成：背包上限 +${initialBackpackCap}`);
        }
        const initialHandLimit = definition?.initialHandLimitBonus ?? 0;
        dispatch({ type: 'SET_HAND_LIMIT_BONUS', bonus: initialHandLimit });
        if (initialHandLimit) {
          addGameLog('skill', `开局加成：手牌上限 +${initialHandLimit}`);
        }
        const initialSpellDmg = definition?.initialSpellDamageBonus ?? 0;
        if (initialSpellDmg) {
          dispatch({ type: 'MODIFY_PERMANENT_STAT', stat: 'permanentSpellDamageBonus', delta: initialSpellDmg });
          addGameLog('skill', `开局加成：永久法术伤害 +${initialSpellDmg}`);
        }
      }

      dispatch({ type: 'SET_SHOW_SKILL_SELECTION', show: false });
    });

    // The 6-round starter draft modal has been replaced by the fixed
    // first-row events (装备发现 / 护符发现→药水发现 / 魔法馈赠→魔法发现).
    // Run the opening class-deck draws + initial hand fill immediately
    // after skill selection.
    runOpeningSetup(skillId);
  };

  // Kept for ModalCallbacksContext compatibility; the CardDraftModal it used
  // to back is no longer rendered (see GameFlowContainer). Becomes a no-op.
  const handleCardDraftComplete = (_picks: GameCardData[]) => {
    cardDraftPendingSkillRef.current = null;
  };

  // Opening class-deck draws + relic grants + delayed initial hand fill.
  //
  // Originally extracted from `handleCardDraftComplete` so it could run after
  // the legacy 3-choose-1 skill modal. The skill modal is no longer shown at
  // game start (player begins with no default Hero Skill), so this is now
  // invoked synchronously from `handleGameModeSelect` with `skillId === ''`.
  //
  // We read `eternalRelics` and `classDeck` from `engine.getState()` rather
  // than from React-render closure, because the synchronous fresh-game path
  // calls us BEFORE React has re-rendered with the post-INIT_GAME state — so
  // closure-captured values would still reflect the previous run.
  const runOpeningSetup = (skillId: string) => {
    const definition = skillId ? getHeroSkillById(skillId as HeroSkillId) : null;
    const liveState = engine.getState();
    const currentRelics = liveState.eternalRelics;
    const liveClassDeck = liveState.classDeck;

    let classDrawn: GameCardData[] = [];

    engine.batch(() => {
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
          description: '忠诚的小随从，可装备。每次用小随从击杀怪物，攻击 +1、防御 +1。',
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
        const thunderSeal = liveClassDeck.find(
          c => c.type === 'amulet' && (c as GameCardData).amuletEffect === 'discard-zap',
        );
        if (thunderSeal) {
          // Class deck is an infinite template — clone the seal into the
          // backpack via the canonical reducer (no consumption of the pool).
          drawClassCardsToBackpack(1, '雷盾心法', { includeIds: [thunderSeal.id] });
          addGameLog('skill', '雷盾心法：从职业牌堆获得「雷霆符印」。');
        }
      }

      // baseClassCards is now 0 — the unconditional "free 1 class card at
      // game start" has been removed. Players still receive class cards from
      // hero skills (e.g. 探索之心 → initialClassCardDraw: 3) and from any
      // eternal relic that grants `initialClassCardDraw`. The opening hand
      // 「专属感召」 perm-1 magic now provides on-demand class-card discovery
      // (see `createStarterDiscoverClassToHandCard` in `game-core/deck.ts`).
      const skillClassCards = (definition?.type === 'passive') ? 0 : (definition?.initialClassCardDraw ?? 0);
      const relicClassCards = currentRelics.reduce((sum, r) => sum + (r.initialClassCardDraw ?? 0), 0);
      const totalClassCards = skillClassCards + relicClassCards;
      const hasShieldWall = hasEternalRelic(currentRelics, 'shield-wall');
      const thunderSealIds = hasShieldWall
        ? liveClassDeck.filter(c => c.type === 'amulet' && (c as GameCardData).amuletEffect === 'discard-zap').map(c => c.id)
        : [];

      if (totalClassCards > 0) {
        const excludeIds = thunderSealIds.length > 0 ? thunderSealIds : undefined;
        drawClassCardsToBackpack(totalClassCards, '开场', excludeIds ? { excludeIds } : undefined);
      }
    });

    const baseHandCards = 2;
    const skillHandDraw = (definition?.type === 'passive') ? 0 : (definition?.initialHandDraw ?? 0);
    const totalHandCards = baseHandCards + skillHandDraw;
    const classFlightDelay = classDrawn.length > 0
      ? Math.round(CLASS_FLIGHT_BASE_DURATION * 0.6)
        + Math.max(0, classDrawn.length - 1) * CLASS_FLIGHT_STAGGER
      : 200;
    setTimeout(() => {
      engine.batch(() => {
        for (let i = 0; i < totalHandCards; i++) {
          drawFromBackpackToHand();
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

  // registerMonsterCellRef returns a STABLE ref callback per monsterId.
  // The previous curried-on-render version (`(id) => (el) => {...}`) created a
  // brand-new ref callback every GameBoard render, which:
  //   1. broke `activeRowCallbacks` memo (the `registerMonsterCellRef` dep
  //      changed every render);
  //   2. caused React to detach + reattach every monster cell ref each render
  //      (deleting and re-setting `monsterCellRefs.current[id]` constantly);
  //   3. cascaded re-renders into memoized `<ActiveCell>` / `<GameCard>`
  //      whenever GameBoard re-rendered for unrelated reasons (flight state,
  //      animation effects, etc).
  // We cache one callback per id in a Map and lazily evict when React
  // unmounts the cell (passes `el === null`).
  const monsterCellRefCallbackCache = useRef<Map<string, (el: HTMLDivElement | null) => void>>(
    new Map(),
  );
  const noopMonsterCellRef = useRef<(el: HTMLDivElement | null) => void>(() => {});
  const registerMonsterCellRef = useCallback(
    (monsterId?: string): ((el: HTMLDivElement | null) => void) => {
      if (!monsterId) return noopMonsterCellRef.current;
      const cache = monsterCellRefCallbackCache.current;
      let cb = cache.get(monsterId);
      if (!cb) {
        cb = (el: HTMLDivElement | null) => {
          if (el) {
            monsterCellRefs.current[monsterId] = el;
          } else {
            delete monsterCellRefs.current[monsterId];
            cache.delete(monsterId);
          }
        };
        cache.set(monsterId, cb);
      }
      return cb;
    },
    [],
  );
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

  // drawPending: thin animation bridge — 500ms delay then dispatch to reducer
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      if (!engine.getState().drawPending) return;
      timer = setTimeout(() => {
        timer = null;
        dispatch({ type: 'SET_DRAW_PENDING', value: false });
        engine.dispatch({ type: 'DRAW_DUNGEON_ROW' });
      }, 500);
    };
    check();
    const unsub = engine.subscribe(check);
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, [engine]);









  const createCurseCard = (_sourceCard?: GameCardData): GameCardData => {
    let rng = engine.getState().rng;
    const [id, rng2] = nextId(rng, 'curse'); rng = rng2;
    dispatch({ type: 'SET_GAME_FLAGS', patch: { rng } });
    return {
      id,
      type: 'curse',
      name: '血咒之印',
      value: 0,
      image: bloodCurseSealImage,
      description: '诅咒：使用时失去 3 点生命，使用后回到背包；无法被回收或弃置。',
      shortDescription: '使用时 -3 生命；用后回到背包',
      curseEffect: 'blood-curse',
    };
  };





  // Backpack capacity enforcement DELETED — handled by ENFORCE_BACKPACK_CAPACITY reducer

  // Wraith purification check DELETED — handled by CHECK_WRAITH_PURIFICATION reducer
  // Wraith passive unlock popup useEffect DELETED — pendingWraithPassiveUnlockRef was never set to true (dead code)

  // Honor sweep upgrade modal gating moved to reducer:
  // - CHECK_HONOR_SWEEP_UPGRADES action is dispatched after honorSweepUpgradesPending is set
  // - APPLY_MONSTER_REWARD enqueues CHECK_HONOR_SWEEP_UPGRADES when reward queue clears

  discardedCardsRef.current = discardedCards;
  useEffect(() => {
    discardedCardsRef.current = discardedCards;
  }, [discardedCards]);

  handCardsRef.current = handCards;
  useEffect(() => {
    handCardsRef.current = handCards;
  }, [handCards]);












  const resetWaterfallAnimation = () => {
    clearWaterfallTimeouts();
    setWaterfallAnimation(initialWaterfallAnimationState);
    waterfallLockRef.current = false;

    dispatch({ type: 'COMPLETE_WATERFALL' });

    if (waterfallDiscoverPendingRef.current) {
      waterfallDiscoverPendingRef.current = false;
      const started = beginDiscoverFlow('eternal-relic-waterfall', { sourceLabel: '永恒护符·探秘' });
      if (started) {
        addGameLog('skill', '永恒护符·探秘：瀑流推进，发现专属卡！');
      }
    }
  };

  const startWaterfallDeal = () => {
    const plan = engine.getState().pendingWaterfallPlan;
    if (!plan) {
      resetWaterfallAnimation();
      return;
    }

    if (plan.nextPreviewCards.length === 0) {
      // Delegate victory check + preview clear to the reducer
      dispatch({ type: 'APPLY_WATERFALL_DEAL' });
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

    // Delegate preview fill + deck update to the reducer
    dispatch({ type: 'APPLY_WATERFALL_DEAL' });

    logWaterfall('deal-start', {
      nextPreviewCount: plan.nextPreviewCards.length,
      shouldDeclareVictory: plan.shouldDeclareVictory,
    });

    queueWaterfallTimeout(() => {
      resetWaterfallAnimation();
    }, animSpeed(WATERFALL_DEAL_DURATION), 'deal-phase-complete');
  };

  const handleWaterfallDiscardComplete = () => {
    const plan = engine.getState().pendingWaterfallPlan;
    if (!plan) {
      resetWaterfallAnimation();
      return;
    }

    if (plan.discardCard) {
      dispatch({
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard: plan.discardCard,
        nextRemainingDeck: plan.nextRemainingDeck,
        discardPreviewIndex: plan.discardPreviewIndex,
      });
    }

    // Multiplayer-only: process any extra preview cards squeezed out beyond
    // the primary `discardCard`. Each runs its own waterfallEffect locally
    // (per user-confirmed semantic A: "本地先触发效果，然后 2 张全部传给对手")
    // and gets staged to `pendingTransferOut` for shipping to the peer via the
    // `multiplayer:transferOut` side effect emitted at the end of
    // APPLY_WATERFALL_DEAL.
    //
    // We pull `nextRemainingDeck` from the LIVE `pendingWaterfallPlan` for
    // each iteration (not from `plan.nextRemainingDeck` snapshot) because
    // the previous APPLY_WATERFALL_DISCARD_EFFECTS may have mutated the deck
    // (e.g. `returnToDeck` inserting the card back, `swarmInfest` prepending
    // bugs) and `reduceApplyWaterfallDiscardEffects` syncs those changes via
    // `patch.pendingWaterfallPlan = { ...plan, nextRemainingDeck }`.
    //
    // Single-player branch: plan.extraDiscardCards is `undefined` (or `[]`),
    // so the loop body never runs — zero overhead.
    const extras = plan.extraDiscardCards ?? [];
    const extraIndices = plan.extraDiscardPreviewIndices ?? [];
    for (let i = 0; i < extras.length; i++) {
      const live = engine.getState().pendingWaterfallPlan;
      dispatch({
        type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
        discardCard: extras[i],
        nextRemainingDeck: live?.nextRemainingDeck ?? plan.nextRemainingDeck,
        discardPreviewIndex: extraIndices[i] ?? null,
      });
    }

    logWaterfall('discard-complete', {
      discardedCardId: plan.discardCard?.id ?? null,
      extraDiscardedCount: extras.length,
    });

    setWaterfallAnimation(prev => ({
      ...prev,
      discardSlot: null,
      discardDestination: 'graveyard',
      isActive: true,
      sequenceId: prev.sequenceId,
    }));

    dispatch({ type: 'SET_PREVIEW_CARDS', payload: createEmptyActiveRow() });
    queueWaterfallTimeout(() => {
      startWaterfallDeal();
    }, 150, 'discard-to-deal-delay');
  };

  const handleWaterfallDropComplete = () => {
    const plan = engine.getState().pendingWaterfallPlan;
    if (!plan) {
      resetWaterfallAnimation();
      return;
    }

    logWaterfall('drop-complete', {
      dropTargetSlots: plan.dropTargetSlots,
      dropCards: plan.resolvedDropCards.map(card => card.id),
      discardPlanned: Boolean(plan.discardCard),
    });

    // Delegate all state mutations (activeCards, stacks, preview clear) to the reducer
    dispatch({ type: 'APPLY_WATERFALL_DROP' });

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
        startWaterfallDeal();
      }, 150, 'drop-to-deal-delay');
    }
  };

  // Start waterfall animation from the plan stored in engine state.
  // Called both when waterfall:planReady fires and on hydrate/undo recovery.
  const startWaterfallAnimation = () => {
    const plan = engine.getState().pendingWaterfallPlan;
    if (!plan) return;

    if (waterfallLockRef.current) {
      logWaterfall('trigger-blocked', { lock: waterfallLockRef.current });
      return;
    }
    waterfallLockRef.current = true;

    // UI effects for stuck final monsters
    for (const card of plan.stuckFinalMonsters) {
      addGameLog('waterfall', `${card.name}（最终之敌）无法入场，返回牌堆顶等待决战`);
      dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `${card.name} 隐入牌堆……终局之战尚未到来。` });
    }

    // UI effects for preview stacking
    for (const [idx, cards] of Object.entries(plan.newPreviewStacks)) {
      for (const bonusCard of cards) {
        addGameLog('waterfall', `瀑流堆叠：「${bonusCard.name}」堆叠在预览行第 ${Number(idx) + 1} 列`);
      }
    }

    logWaterfall('drop-plan', {
      dropCount: plan.dropAssignments.length,
      assignments: plan.dropAssignments.map(({ previewIndex, slotIndex }) => ({
        previewIndex,
        slotIndex,
      })),
    });

    const sequenceId = ++waterfallSequenceRef.current;

    // Dispatch turn reset + effects now (before animation)
    dispatch({ type: 'WATERFALL_TURN_RESET' });
    dispatch({ type: 'APPLY_WATERFALL_EFFECTS' });
    suppressTurnAmuletReapplyRef.current = true;

    logWaterfall('trigger', {
      dropCount: plan.resolvedDropCards.length,
      sequenceId,
      assignments: plan.dropAssignments.map(({ previewIndex, slotIndex }) => ({ previewIndex, slotIndex })),
    });

    // Preview-row reveal phase: cards are normally rendered face-down
    // (see PreviewRow.tsx). Before the actual drop/discard/deal motion runs,
    // we play a short flip animation that turns every non-empty preview cell
    // face-up so the player can see what's about to happen. The reveal is
    // purely visual — `previewCards` state is unchanged.
    const proceedWithWaterfall = () => {
      setWaterfallAnimation({
        phase: plan.resolvedDropCards.length > 0 ? 'dropping' : plan.discardCard ? 'discarding' : 'dealing',
        isActive: true,
        droppingSlots: plan.resolvedDropCards.length > 0 ? plan.dropPreviewIndices : [],
        landingSlots: [],
        discardSlot: plan.resolvedDropCards.length === 0 ? plan.discardPreviewIndex : null,
        discardDestination: plan.discardDestination,
        dealingSlots: [],
        sequenceId,
      });

      if (plan.resolvedDropCards.length > 0) {
        queueWaterfallTimeout(handleWaterfallDropComplete, animSpeed(WATERFALL_DROP_DURATION), 'drop-phase-timeout');
      } else if (plan.discardCard) {
        queueWaterfallTimeout(handleWaterfallDiscardComplete, animSpeed(WATERFALL_DISCARD_DURATION), 'discard-phase-timeout');
      } else {
        startWaterfallDeal();
      }
    };

    const hasFaceDownCards = engine.getState().previewCards.some(Boolean);
    if (hasFaceDownCards) {
      setWaterfallAnimation({
        phase: 'revealing',
        isActive: true,
        droppingSlots: [],
        landingSlots: [],
        discardSlot: null,
        discardDestination: 'graveyard',
        dealingSlots: [],
        sequenceId,
      });
      queueWaterfallTimeout(
        proceedWithWaterfall,
        animSpeed(WATERFALL_REVEAL_DURATION + WATERFALL_REVEAL_HOLD_DURATION),
        'reveal-phase-complete',
      );
    } else {
      proceedWithWaterfall();
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

    if (addToGraveyardAutomatically && cardToRemove) {
      discardCardToGraveyard(cardToRemove, { owner: 'dungeon' });
    }

    // REGISTER_DUNGEON_CARD_PROCESSED is now driven by the reducer's
    // postProcessActiveCards (slot-clear detection in step 4). It runs AFTER
    // the swarm-spawn step, so slots that get swarm-replaced by a Buglet are
    // automatically NOT counted as processed — matching the legacy
    // `willSwarmSpawn` skip behavior (no auto-draw, no dungeon-gold amulet).
    //
    // To honor `skipAutoDraw: true`, we pre-mark the card as processed via a
    // direct field patch (NOT via REGISTER_DUNGEON_CARD_PROCESSED, which
    // increments pendingAutoDrawCount). The reducer's slot-clear detection
    // then sees the id is already in the list and skips re-registration.
    if (cardToRemove && options?.skipAutoDraw) {
      const st = engine.getState();
      if (!st.processedDungeonCardIds.includes(cardToRemove.id)) {
        dispatch({
          type: 'SET_GAME_FLAGS',
          patch: { processedDungeonCardIds: [...st.processedDungeonCardIds, cardToRemove.id] },
        });
      }
    }

    // Add card to removing set for animation
    setRemovingCards(prev => new Set(prev).add(cardId));

    // Delay actual removal for animation
    setTimeout(() => {
      try {
      dispatch({ type: 'UPDATE_ACTIVE_CARDS', updater: prev => {
        const index = findSlotIndexByCardId(prev, cardId);
        if (index === -1) {
          return prev;
        }

        const updated = [...prev];

        // Swarm passive: if a Swarm monster is present elsewhere on the row
        // and the card being removed is not itself a Buglet, force the
        // slot-clear branch (skip stack-pop). The reducer's
        // postProcessActiveCards step 3 will then spawn a Buglet at the
        // cleared slot, leaving any stacked card intact at the top of
        // `activeCardStacks` — it pops up naturally after the Buglet is
        // later defeated. This matches the design intent (per
        // CARD_POOL_REFERENCE.md "每移除一张地城牌，在该位置生成一只小虫子")
        // that ANY dungeon-card removal triggers swarm spawn, including
        // stack-pop. Mirrors `reduceCompleteEvent` in rules/events.ts.
        const removedCard = prev[index];
        const swarmSourcePresent = !removedCard?.isBuglet && prev.some((c, i) =>
          c != null
          && i !== index
          && c.type === 'monster'
          && c.swarmSpawn === true
          && c.isBuglet !== true
          && c.isStunned !== true,
        );

        // Stack pop: if there are stacked cards below, promote the top one.
        // Read from engine state to avoid stale closure (e.g. Graveyard Amulet
        // adds stacks after removeCard is called).
        const stack = engine.getState().activeCardStacks[index];
        if (stack && stack.length > 0 && !swarmSourcePresent) {
          const nextCard = stack[stack.length - 1];
          updated[index] = nextCard;
          unregisterProcessedCardId(nextCard.id);
          const popStacks = { ...engine.getState().activeCardStacks };
          const remaining = stack.slice(0, -1);
          if (remaining.length === 0) {
            delete popStacks[index];
          } else {
            popStacks[index] = remaining;
          }
          dispatch({ type: 'SET_ACTIVE_CARD_STACKS', stacks: popStacks });
          addGameLog('system', `堆叠揭示：「${nextCard.name}」从第 ${index + 1} 列堆叠中浮现！`);

          // Stack-pop fills the slot (card→card, not card→null), so the
          // reducer's postProcessActiveCards slot-clear detection in step 4
          // won't enqueue REGISTER_DUNGEON_CARD_PROCESSED. Mirror the fix in
          // rules/events.ts COMPLETE_EVENT (see comment there) and explicitly
          // register the just-removed card so:
          //   • pendingAutoDrawCount bumps → backpack auto-draws to hand,
          //   • on-enter-hand effects (e.g. 三牌惊雷 上手) fire on the drawn
          //     card via postProcessHandEntries.
          // Skip when the caller asked for no auto-draw (e.g. event flows
          // that pre-mark the card themselves).
          if (
            !options?.skipAutoDraw
            && cardToRemove
            && !engine.getState().processedDungeonCardIds.includes(cardToRemove.id)
          ) {
            dispatch({
              type: 'REGISTER_DUNGEON_CARD_PROCESSED',
              cardId: cardToRemove.id,
              source: 'slot-cleared',
            });
          }
        } else {
          updated[index] = null;
        }

        // Waterfall trigger check is now handled by the reducer's post-processing
        // of UPDATE_ACTIVE_CARDS (computes plan + emits waterfall:planReady).
        // Victory check for empty row with no deck/preview is also kept here
        // as a fallback for the case where no waterfall plan can be computed.
        const remainingCount = countActiveRowSlotsExcludeGhost(updated);
        if (remainingCount === 0) {
          if (engine.getState().remainingDeck.length === 0 && countActiveRowSlots(engine.getState().previewCards) === 0) {
            addGameLog('system', '胜利！地牢已被征服！');
            dispatch({ type: 'SET_GAME_OVER', victory: true });
            dispatch({ type: 'SET_TOTAL_WINS', count: incrementTotalWins() });
          }
        }

        return updated;
      } });

      // Buglet engagement is driven by the reducer's `combat:autoEngage` side
      // effect (see useCombatActions). Horde rage banner + buffs are driven
      // by the enqueued CHECK_HORDE_SWARM action. No imperative follow-up
      // needed here.

      // Clear from removing set
      setRemovingCards(prev => {
        const next = new Set(prev);
        next.delete(cardId);
        return next;
      });
      } finally {
      pendingDungeonRemovalsRef.current = Math.max(0, pendingDungeonRemovalsRef.current - 1);
      logWaterfall('remove-complete', {
        cardId,
        pendingAfter: pendingDungeonRemovalsRef.current,
      });
      }
    }, 300);
    pendingDungeonRemovalsRef.current += 1;
    logWaterfall('remove-pending-increment', { pending: pendingDungeonRemovalsRef.current });
  };

  const markDungeonCardPendingUse = (cardId: string) => {
    pendingDungeonUseRef.current.add(cardId);
  };

  const removePendingDungeonCard = (cardId: string): boolean => {
    const wasPending = pendingDungeonUseRef.current.delete(cardId);
    const inActiveRow = activeCards.some(c => c?.id === cardId);
    if (wasPending || inActiveRow) {
      removeCard(cardId, false);
      return true;
    }
    return false;
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
    dispatch({ type: 'UPDATE_HAND_CARDS', updater: prev => {
      const next = prev.filter(c => c.id !== cardId);
      handCardsRef.current = next;
      return next;
    } });

    if (draggedFromHand) {
      setDraggedCard(null);
      setDraggedCardSource(current => (current === 'hand' ? null : current));
    }
    return true;
  };



  // Waterfall is triggered by the reducer (postProcessActiveCards computes plan + emits waterfall:planReady).
  // The UI listens for the event, waits for pending removal animations, then runs the animation sequence.

  function handleSellCard(item: any) {
    pushUndoSnapshot();
    const itemType = item.type as CardType;

    // Only allow selling defined card types
    if (!isSellableType(itemType) || item.type === 'curse') {
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

    // When the discarded card came from hand, remove it from hand BEFORE dispatching the
    // discard. Otherwise the engine's synchronous drain of APPLY_DISCARD_EFFECTS (e.g.
    // Catapult Amulet's enqueued DRAW_CARDS) would see the discarded card still in hand
    // and the hand-limit check could block the draw.
    if (fallbackOrigin === 'hand') {
      consumeCardFromHand(sellItem);
    }

    discardCardToGraveyard(sanitizedCard, { owner: 'player' });

    switch (fallbackOrigin) {
      case 'equipmentSlot1':
      case 'equipmentSlot2':
        clearEquipmentSlotWithPromote(fallbackOrigin);
        break;
      case 'amulet':
        // Aura reversal for the removed amulet is handled by the reducer's
        // postProcessAmuletAura middleware (triggered by REMOVE_AMULET).
        dispatch({ type: 'REMOVE_AMULET', cardId: sellItem.id });
        break;
      case 'hand':
        tickRecycleForge();
        break;
      case 'backpack':
        dispatch({ type: 'UPDATE_BACKPACK_ITEMS', updater: prev => prev.filter(c => c.id !== sellItem.id) });
        break;
      default:
      // Item from dungeon - use removeCard to properly trigger waterfall (don't add to graveyard again)
        removeCard(sellItem.id, false);
      dispatch({ type: 'MODIFY_PERMANENT_STAT', stat: 'cardsPlayed', delta: 1 });
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
    queueCardIntoHand,
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
    triggerMineExplosionAnimation,
    tryStartShieldReflectDirectedFx,
    tryStartBossRetaliationDirectedFx,
    tryStartGolemLayerReflectFx,
    tryStartArcaneBladeSpellFx,
    tryStartDragonBreathFx,
    tryStartMissileStormFx,
    animSpeed,
    requestDiceOutcome,
    addHeroMagicGauge,
    triggerGhostBladeExile,
    requestCardAction,
    requestCardActionBatch,
    queueMonsterReward,
    removeCard,
    markDungeonCardPendingUse,
    pushUndoSnapshot,
    clearUndoStack,
    clearUndoStorage,
    isMonsterEngaged,
    consumeCardFromHand,
    consumeClassCardFromHand,
    finalizeMagicCard,
    triggerDiscardFlight,
    triggerStealCardFlight,
    triggerGraveyardStackFlight,
    dragonBleedDestroyEquipment,
    beginDiscoverFlow,
    requestDaggerSelfDestruct,
    discoverPotionCompletionRef,
    combatAsyncEpochRef,
    pendingDefeatIdsRef,
    pendingDungeonUseRef,
    goblinStolenIdsRef,
    heroTurnLayerLossIdsRef,
    heroTookDamageThisMonsterTurnRef,
    monsterBleedTimeoutsRef,
    activeCardsLatestRef,
    fullBoardInteractionLockedRef,
    handLockedForMonsterPhaseRef,
    heroStunnedRef,
    selectedHeroSkillRef,
    eternalRelicsRef,
    handCardsRef,
    endHeroTurnGuardRef,
    beginCombatRef,
    bulwarkTempArmorRef,
    computePersuadeSuccessRate,
    setPersuadeTempDiscount,
    setMonsterDefeatStates,
    setMonsterBleedStates,
    setHealing,
    setTakingDamage,
    selectedCard,
    handleMagicMonsterSelection,
    handleHeroSkillMonsterSelection,
  };

  // Populate shopHandlers deps ref (all function deps are now defined)
  shopDepsRef.current = {
    addToGraveyard,
    addCardToBackpack,
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
    removePendingDungeonCard,
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
    cardActionBatchResolverRef,
    deletingCardIdsRef,
    monsterRewardQueuedInstanceIdsRef,
    discardedCardsRef,
    backpackHandFlightsRef,
    graveyardDiscoverResolverRef,
    graveyardDiscoverDeliveryRef,
    ghostBladeExileResolverRef,
    discoverPotionCompletionRef,
    onNewCardGainedRef,
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
    requestCardActionBatch,
    requestGraveyardSelection,
    beginDiscoverFlow,
    startShopFlow,
    generateShopOfferings,
    queueMonsterReward,
    addGameLog,
    pushUndoSnapshot,
    clearUndoStack,
    removeCard,
    removePendingDungeonCard,
    queueCardIntoHand,
    triggerDiscardFlight,
    triggerClassDeckFlight,
    triggerGraveNova,
    triggerGraveyardToBackpackFlight,
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
    echoRemainingRef,
    echoTotalRef,
    graveyardDiscoverResolverRef,
    graveyardDiscoverDeliveryRef,
    fullBoardInteractionLockedRef,
    handLockedForMonsterPhaseRef,
    setPersuadeTempDiscount,
    setDeckPeekState,
    openHandMagicUpgradeModal: (sourceCardId: string) => {
      dispatch({ type: 'SET_HAND_MAGIC_UPGRADE_MODAL', payload: { sourceCardId } });
    },
    openMirrorCopyModal: (sourceCardId: string) => {
      dispatch({ type: 'SET_MIRROR_COPY_MODAL', payload: { sourceCardId } });
    },
    openMonsterFusionModal: (sourceCardId: string) => {
      dispatch({ type: 'SET_MONSTER_FUSION_MODAL', payload: { sourceCardId } });
    },
    discoverPotionCompletionRef,
    deckJudgePeekCloseRef,
    getAttackBonus: () => attackBonus,
    applyHonorSweepMagic,
    applyWeaponSweepMagic,
    lastPlayedFlankRef,
    completeCurrentEvent,
  };

  // Populate heroActions deps ref (all function deps are now defined)
  heroActionsDepsRef.current = {
    discardCardToGraveyard,
    ensureCardInHand,
    queueCardIntoHand,
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
    requestCardActionBatch,
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
    resolveStatSwap,
    resolveRepairEnrageDice,
    addGameLog,
    pushUndoSnapshot,
    clearUndoStack,
    removeCard,
    removePendingDungeonCard,
    triggerClassDeckFlight,
    triggerFateSwapFlight,
    triggerActiveRowSwapFlight,
    triggerReturnToDeckFlight,
    clearAllBackpackHandFallbacks,
    setDeckPeekState,
    deckJudgePeekCloseRef,
    setHeroSkillArrow,
    setPersuadeRollKey,
    waterfallActive,
    fullBoardInteractionLockedRef,
    echoRemainingRef,
    echoTotalRef,
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
    handleMonsterDefeated,
    recordClassDamageDiscoverHit,
    requestCardAction,
    requestCardActionBatch,
    requestGraveyardSelection,
    startShopFlow,
    beginDiscoverFlow,
    handleDiscoverFallback,
    handleCardUpgrade,
    normalizeEventEffect,
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
    setPersuadeTempDiscount,
    discoverPotionCompletionRef,
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
        return;
      }
      if (spentCard.type === 'magic' || spentCard.type === 'hero-magic' || spentCard.type === 'curse') {
        // Routing handled exclusively by handleSkillCard / finalizeMagicCard
        // to avoid double graveyard/recycle-bag insertions.
        return;
      }
      if (spentCard.type === 'event') {
        addToGraveyard(spentCard);
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
        // Reducer 处理放置 / 命运之刃自伤 / 满位入坟 / transform 链。
        // Hook 已通过 consumeCardFromHand(card) 在前面消耗了来源。
        dispatch({ type: 'PLACE_BUILDING_IN_DUNGEON', card, source: 'hand' });
        resetDragState();
        return;
      }

      recordHandCardConsumption(card);

      tickRecycleForge();

      if (lastPlayedFlankRef.current && card.flankDraw) {
        for (let i = 0; i < card.flankDraw; i++) {
          drawFromBackpackToHand();
        }
        addGameLog('magic', `侧击效果：${card.name} 抽取 ${card.flankDraw} 张牌`);
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `侧击！${card.name} 抽取了 ${card.flankDraw} 张牌。` });
      }

      if (lastPlayedFlankRef.current && card.flankEffectId) {
        if (card.flankEffectId.startsWith('persuadeCost-')) {
          const amount = parseInt(card.flankEffectId.replace('persuadeCost-', ''), 10) || 1;
          const currentMod = engine.getState().persuadeCostModifier ?? 0;
          const currentCost = PERSUADE_COST + currentMod;
          if (currentCost <= MIN_PERSUADE_COST) {
            addGameLog('event', `劝降费用已达下限（${currentCost} 金币），无法再降低`);
            dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `侧击！${card.name} 劝降费用已达下限，无法再降低。` });
          } else {
            const actualAmount = Math.min(amount, currentCost - MIN_PERSUADE_COST);
            dispatch({ type: 'MODIFY_PERMANENT_STAT', stat: 'persuadeCostModifier', delta: -actualAmount });
            addGameLog('event', `侧击效果：${card.name} 劝降费用永久 -${actualAmount}`);
            dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `侧击！${card.name} 劝降费用永久 -${actualAmount}！` });
          }
        } else if (card.flankEffectId.startsWith('stunCap+')) {
          const amount = parseInt(card.flankEffectId.replace('stunCap+', ''), 10) || 5;
          dispatch({ type: 'MODIFY_STUN_CAP', delta: amount });
          addGameLog('event', `侧击效果：${card.name} 击晕上限 +${amount}%`);
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `侧击！${card.name} 击晕上限 +${amount}%！` });
        } else if (card.flankEffectId.startsWith('damage:')) {
          const amount = parseInt(card.flankEffectId.replace('damage:', ''), 10) || 5;
          const monsters = flattenActiveRowSlots(activeCardsLatestRef.current).filter(
            (c): c is GameCardData => isDamageableTarget(c),
          );
          if (monsters.length > 0) {
            let rng = engine.getState().rng;
            const [target, rng2] = pickRandom(monsters, rng); rng = rng2;
            dispatch({ type: 'SET_GAME_FLAGS', patch: { rng } });
            // 显式激怒目标：跟 discard-zap / flip-zap 风格一致，意图明确，
            // 不依赖 reduceDealDamageToMonster 的 universal engagement safety net。
            if (!isMonsterEngaged(target.id)) {
              beginCombat(target, 'hero');
            }
            dealDamageToMonster(target, amount);
            addGameLog('event', `侧击效果：${card.name} 对 ${target.name} 造成 ${amount} 点伤害`);
            dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `侧击！${card.name} 对 ${target.name} 造成了 ${amount} 点伤害！` });
          } else {
            addGameLog('event', `侧击效果：${card.name} 没有可攻击的怪物`);
            dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `侧击！但没有可攻击的怪物。` });
          }
        } else if (card.flankEffectId.startsWith('discard-recycle-to-hand:')) {
          // 唤回秘药·侧击：弃 1 张手牌·从回收袋随机取 N 张到手牌（互动式）。
          // 派单到 reducer 处理 modal/auto 分流，避免在 hook 里复制 reducer 逻辑。
          const count = parseInt(card.flankEffectId.replace('discard-recycle-to-hand:', ''), 10) || 1;
          dispatch({ type: 'TRIGGER_FLANK_DISCARD_RECYCLE', card, count });
        } else if (card.flankEffectId === 'graveyard-random-magic') {
          // 蜕变赋灵·侧击：失去 3 点生命，从坟场随机获得一张魔法卡。
          // 派单到 reducer，跟 reducePlayCard flank 分支共享同一份实现。
          dispatch({ type: 'TRIGGER_FLANK_GRAVEYARD_MAGIC', card });
        } else if (card.flankEffectId.startsWith('gold:')) {
          // 附魔祭坛·侧击：+N 金币。跟 reducePlayCard flank 分支保持一致。
          const amount = parseInt(card.flankEffectId.replace('gold:', ''), 10) || 3;
          dispatch({ type: 'MODIFY_GOLD', delta: amount, source: 'flank-gold' });
          addGameLog('gold', `侧击效果：${card.name} 获得 ${amount} 金币`);
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `侧击！${card.name} 获得 ${amount} 金币！` });
        } else if (card.flankEffectId.startsWith('heal:')) {
          // 赋能神殿·侧击：恢复 N HP。跟 reducePlayCard flank 分支保持一致。
          const amount = parseInt(card.flankEffectId.replace('heal:', ''), 10) || 2;
          dispatch({ type: 'HEAL', amount, source: 'flank-heal' });
          addGameLog('event', `侧击效果：${card.name} 恢复 ${amount} HP`);
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `侧击！${card.name} 恢复 ${amount} HP！` });
        }
      }

      if (card.type === 'monster') {
        resetDragState();
        return;
      } else if (card.type === 'potion') {
        stagingCardsRef.current = [...stagingCardsRef.current.filter(c => c.id !== card.id), card];
        dispatch({ type: 'RESOLVE_POTION', cardId: card.id, card } as any);
      } else if (card.type === 'magic' || card.type === 'hero-magic' || card.type === 'curse') {
        stagingCardsRef.current = [...stagingCardsRef.current.filter(c => c.id !== card.id), card];
        dispatch({ type: 'RESOLVE_MAGIC', cardId: card.id, card, isFlank: lastPlayedFlankRef.current } as any);
      } else if (card.type === 'event') {
        startEventResolution(null, 'hand');
        const cleanedCard = card.eventChoices
          ? { ...card, eventChoices: card.eventChoices.filter(c => c.effect !== 'crossroads-destroy-below') }
          : card;
        // SET_CURRENT_EVENT reducer auto-enqueues APPLY_TRANSFORM_CATEGORY.
        dispatch({ type: 'SET_CURRENT_EVENT', card: cleanedCard });
        eventChoiceProcessingRef.current = false;
        dispatch({ type: 'SET_EVENT_MODAL_OPEN', open: true });
        resetDragState();
        return;
      }

      // RESOLVE_POTION / RESOLVE_MAGIC reducers auto-enqueue APPLY_TRANSFORM_CATEGORY.
      // Other card types (monster) handled above via early-return.
    } else {
      if (isFromBackpack) {
        dispatch({ type: 'UPDATE_BACKPACK_ITEMS', updater: prev => prev.filter(c => c.id !== card.id) });

        if (card.type === 'building') {
          // Reducer 处理放置 / 满位入坟 / transform 链。
          // Hook 已通过上面的 UPDATE_BACKPACK_ITEMS 移除了来源。
          // 注意：从背包打出 building 不触发"命运之刃自伤"（与旧行为一致）。
          dispatch({ type: 'PLACE_BUILDING_IN_DUNGEON', card, source: 'backpack' });
          resetDragState();
          return;
        }

        if (card.type === 'potion') {
          stagingCardsRef.current = [...stagingCardsRef.current.filter(c => c.id !== card.id), card];
          dispatch({ type: 'RESOLVE_POTION', cardId: card.id, card } as any);
        } else if (card.type === 'magic' || card.type === 'hero-magic' || card.type === 'curse') {
          stagingCardsRef.current = [...stagingCardsRef.current.filter(c => c.id !== card.id), card];
          dispatch({ type: 'RESOLVE_MAGIC', cardId: card.id, card } as any);
        } else if (card.type === 'event') {
          startEventResolution(null, 'hand');
          const cleanedCard = card.eventChoices
            ? { ...card, eventChoices: card.eventChoices.filter(c => c.effect !== 'crossroads-destroy-below') }
            : card;
          // SET_CURRENT_EVENT reducer auto-enqueues APPLY_TRANSFORM_CATEGORY.
          dispatch({ type: 'SET_CURRENT_EVENT', card: cleanedCard });
          eventChoiceProcessingRef.current = false;
          dispatch({ type: 'SET_EVENT_MODAL_OPEN', open: true });
          resetDragState();
          return;
        }
        // RESOLVE_POTION / RESOLVE_MAGIC reducers auto-enqueue APPLY_TRANSFORM_CATEGORY.
        resetDragState();
        return;
      }
      // Purchasing from dungeon - auto-equip/use
      if (card.type === 'potion') {
        markDungeonCardPendingUse(card.id);
        stagingCardsRef.current = [...stagingCardsRef.current.filter(c => c.id !== card.id), card];
        // RESOLVE_POTION reducer auto-enqueues APPLY_TRANSFORM_CATEGORY.
        dispatch({ type: 'RESOLVE_POTION', cardId: card.id, card } as any);
      } else if (card.type === 'magic' || card.type === 'hero-magic' || card.type === 'curse') {
        markDungeonCardPendingUse(card.id);
        stagingCardsRef.current = [...stagingCardsRef.current.filter(c => c.id !== card.id), card];
        // RESOLVE_MAGIC reducer auto-enqueues APPLY_TRANSFORM_CATEGORY.
        dispatch({ type: 'RESOLVE_MAGIC', cardId: card.id, card } as any);
      } else if (card.type === 'event' || (card.type === 'building' && card.eventChoices)) {
        const freshBladeCard =
          (card.name === '命运之刃' || card.name === '增幅祭坛')
            ? activeCards.find(c => c?.id === card.id) ?? card
            : card;
        if (card.name === '命运之刃' && !freshBladeCard.hasReleaseCharge) {
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '命运之刃暂无释放次数。' });
          resetDragState();
          return;
        }
        if (card.name === '增幅祭坛' && !freshBladeCard.hasReleaseCharge) {
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '增幅祭坛暂无释放次数。' });
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
              dispatch({ type: 'UPDATE_ACTIVE_CARDS', updater: prev => {
                const next = [...prev] as ActiveRowSlots;
                next[targetIdx] = prev[currentIdx];
                next[currentIdx] = null;
                return next;
              } });
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
                }],
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
              destination: 'stay' as const,
              banner: '墓语密室翻转为「墓语回响」，留在地城原位！',
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
                magicType: 'instant' as const,
                magicEffect: 'crypt-deathwish',
                description: '即时魔法：选择一个装备，触发其遗言效果 2 次，抽 1 张牌。',
                shortDescription: '触发一件装备的遗言效果 2 次；抽 1 张',
              },
              destination: 'stay' as const,
              banner: '墓语密室翻转为「墓语遗愿」，留在地城原位！',
            };
            eventCard = {
              ...eventCard,
              flipTarget: altFlipTarget,
              eventChoices: [...eventCard.eventChoices],
            };
          }
        }
        startEventResolution(eventCard.id, 'dungeon');
        // SET_CURRENT_EVENT reducer auto-enqueues APPLY_TRANSFORM_CATEGORY.
        dispatch({ type: 'SET_CURRENT_EVENT', card: eventCard });
        eventChoiceProcessingRef.current = false;
        dispatch({ type: 'SET_EVENT_MODAL_OPEN', open: true });
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
          addGameLog('deck', `获得「${card.name}」→ 背包`);
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
    if (card.type === 'curse') return false;
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
    const persuadeState = engine.getState().persuadeState;
    if (!persuadeState) return;
    const success = value >= persuadeState.threshold;
    dispatch({ type: 'SET_PERSUADE_STATE', payload: { ...persuadeState, phase: 'result' as const, diceValue: value, success } });

    // Regardless of success or failure, un-engage the monster (remove enraged state)
    if (isMonsterEngaged(persuadeState.monster.id)) {
      dispatch({ type: 'DISENGAGE_MONSTER', monsterId: persuadeState.monster.id });
      addGameLog('combat', `${persuadeState.monster.name} 被劝降后恢复了平静（解除激怒）。`);
    }

    if (success) {
      const { monster, targetSlot } = persuadeState;
      const monsterAttack = monster.attack ?? monster.value;
      const monsterArmor = monster.hp ?? monster.value;
      const durabilityBonus = engine.getState().persuadeSuccessDurabilityBonus ?? 0;
      const monsterMaxDurability = (monster.hpLayers ?? monster.fury ?? 1) + durabilityBonus;
      const monsterStartDurability = Math.min(
        (monster.currentLayer ?? monster.hpLayers ?? monster.fury ?? 1) + durabilityBonus,
        monsterMaxDurability,
      );

      if (targetSlot === 'backpack') {
        const persuadedCard: GameCardData = {
          ...monster,
          durability: monsterStartDurability,
          maxDurability: monsterMaxDurability,
        };
        addCardToBackpack(persuadedCard, { pendingDungeonCardId: monster.id });
        removeCard(monster.id, false);
        addGameLog('combat', `劝降成功！${monster.name} 加入背包（${monsterAttack}攻 / ${monsterArmor}防 / ${monsterStartDurability}/${monsterMaxDurability}耐久）`);
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `劝降成功！${monster.name} 已加入背包！` });
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
            disposeOwnedEquipmentCard(reserve[0], { isDestruction: true, triggerLastWords: true, fromSlotId: equipSlot });
            addGameLog('equip', `卸下 ${reserve[0].name}`);
            const newReserve = reserve.slice(1);
            setEquipmentReserve(equipSlot, [...newReserve, equippedItem]);
          } else {
            disposeOwnedEquipmentCard(equippedItem, { isDestruction: true, triggerLastWords: true, fromSlotId: equipSlot });
            addGameLog('equip', `卸下 ${equippedItem.name}`);
          }
        }

        const equipCard: EquipmentItem = {
          ...monster,
          type: 'monster' as const,
          value: monsterAttack,
          attack: monsterAttack,
          hp: monsterArmor,
          durability: monsterStartDurability,
          maxDurability: monsterMaxDurability,
        } as EquipmentItem;
        setEquipmentSlotById(equipSlot, equipCard);
        removeCard(monster.id, false);
        addGameLog('combat', `劝降成功！装备 ${monster.name}（${monsterAttack}攻 / ${monsterArmor}防 / ${monsterStartDurability}/${monsterMaxDurability}耐久）`);
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `劝降成功！${monster.name} 已装备！` });

        const equipEmpowerStack = countEternalRelics(engine.getState().eternalRelics, 'equip-empower');
        if (equipEmpowerStack > 0) {
          const empowerBonus = 3 * equipEmpowerStack;
          dispatch({ type: 'MODIFY_SLOT_TEMP_ATTACK', slotId: equipSlot, delta: empowerBonus });
          dispatch({ type: 'MODIFY_SLOT_TEMP_ARMOR', slotId: equipSlot, delta: empowerBonus });
          const stackLabel = equipEmpowerStack > 1 ? `（叠加 ×${equipEmpowerStack}）` : '';
          addGameLog('equip', `铸锋药剂${stackLabel}：${monster.name} 装备时，该装备栏临时攻击 +${empowerBonus}，临时护甲 +${empowerBonus}！`);
        }

        if (amuletEffects.monsterEquipBuffCount > 0) {
          const bump = amuletEffects.monsterEquipBuffCount;
          setEquipmentSlotBonus(equipSlot, 'damage', cur => cur + bump);
          setEquipmentSlotBonus(equipSlot, 'shield', cur => cur + bump);
          addGameLog('amulet', `驯兽铸印：${monster.name} 装备栏永久攻击 +${bump}，永久护甲 +${bump}！`);
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `驯兽铸印：永久攻击 +${bump}，永久护甲 +${bump}！` });
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
            drawFromBackpackToHand();
          }
        }
      }

      if (amuletEffects.persuadeGraveyardStackCount > 0) {
        const monsterColIndex = findSlotIndexByCardId(activeCards, monster.id);
        if (monsterColIndex >= 0) {
          const graveyard = engine.getState().discardedCards;
          const graveyardCopy = [...graveyard];
          const picked: GameCardData[] = [];
          let rng = engine.getState().rng;
          const pickCount = 2 * amuletEffects.persuadeGraveyardStackCount;
          for (let i = 0; i < pickCount && graveyardCopy.length > 0; i++) {
            const [ri, rng2] = nextInt(rng, 0, graveyardCopy.length - 1); rng = rng2;
            picked.push(graveyardCopy.splice(ri, 1)[0]);
          }
          dispatch({ type: 'SET_GAME_FLAGS', patch: { rng } });
          if (picked.length > 0) {
            (graveyardCopy);
            const graveyardStacks = { ...engine.getState().activeCardStacks };
            graveyardStacks[monsterColIndex] = [...(graveyardStacks[monsterColIndex] ?? []), ...picked];
            dispatch({ type: 'SET_ACTIVE_CARD_STACKS', stacks: graveyardStacks });
            triggerGraveyardStackFlight(monsterColIndex, picked);
            const names = picked.map(c => `「${c.name}」`).join('、');
            addGameLog('amulet', `墓地回响符：${names}从墓地堆叠在第 ${monsterColIndex + 1} 列！`);
          }
        }
      }

    } else {
      addGameLog('combat', `劝降失败！${persuadeState.monster.name} 拒绝了劝降。（掷出 ${value}，需要 ≥${persuadeState.threshold}）`);
      dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `劝降失败！${persuadeState.monster.name} 不为所动。` });
    }

    if (amuletEffects.persuadeGrantRecycleFetchCount > 0) {
      const fetchCount = amuletEffects.persuadeGrantRecycleFetchTotal;
      let rng = engine.getState().rng;
      const bonusMap = engine.getState().amplifiedCardBonus;
      for (let fi = 0; fi < fetchCount; fi++) {
        const [card, rng2] = createPersuadeRecycleFetchMagicCard(rng); rng = rng2;
        queueCardIntoHand(applyAmplifyOnCreate(card as GameCardData, bonusMap));
      }
      dispatch({ type: 'SET_GAME_FLAGS', patch: { rng } });
      addGameLog('amulet', `劝降归袋符：${fetchCount} 张「归袋抽引」已加入手牌。`);
    }
  };

  const handlePersuadeClose = () => {
    dispatch({ type: 'SET_PERSUADE_STATE', payload: null });
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

      {
        const prev = engine.getState().amuletSlots;
        const alreadyEquipped = prev.some(slot => slot?.id === card.id);
        const filtered = prev.filter(slot => slot?.id !== card.id);
        const next = [...filtered];

        if (alreadyEquipped) {
          // Reorder: move existing amulet to top of stack
          const updated = [...next, { ...card, fromSlot: 'amulet' } as AmuletItem];
          dispatch({ type: 'UPDATE_AMULET_SLOTS', updater: () => updated.slice(-maxAmuletSlots) });
          resetDragState();
          return;
        }

        if (next.length >= maxAmuletSlots) {
          displacedAmulet = next.shift() ?? null;
        }

        const updated = [...next, { ...card, fromSlot: 'amulet' } as AmuletItem];
        dispatch({ type: 'UPDATE_AMULET_SLOTS', updater: () => updated.slice(-maxAmuletSlots) });
      }

      addGameLog('amulet', `装备护符：${card.name}`);
      if (card.amuletEffect === 'recycle-forge') {
        dispatch({ type: 'RESET_RECYCLE_FORGE_COUNT' });
      }
      if (card.amuletEffect === 'damage-class-discover') {
        const streak = engine.getState().classDamageDiscoverStreak ?? 0;
        const threshold = (card.upgradeLevel ?? 0) >= 1 ? 4 : 6;
        updateDamageDiscoverCounter(streak, threshold);
      }
      if (card.amuletEffect === 'magic-class-discover') {
        const streak = engine.getState().classMagicDiscoverStreak ?? 0;
        updateMagicDiscoverCounter(streak, 8);
      }
      if (card.amuletEffect === 'swap-upgrade') {
        const prog = engine.getState().swapUpgradeProgress ?? 0;
        dispatch({ type: 'UPDATE_AMULET_SLOTS', updater: prev => prev.map(slot => {
          if (slot?.amuletEffect !== 'swap-upgrade') return slot;
          return { ...slot, _counterDisplay: `${prog}/3` };
        }) });
      }
      if (card.amuletEffect === 'recycle-backpack-expand') {
        const prog = engine.getState().recycleBackpackProgress ?? 0;
        const recycleThreshold = (card.upgradeLevel ?? 0) >= 1 ? 6 : 8;
        dispatch({ type: 'UPDATE_AMULET_SLOTS', updater: prev => prev.map(slot => {
          if (slot?.amuletEffect !== 'recycle-backpack-expand') return slot;
          return { ...slot, _counterDisplay: `${prog}/${recycleThreshold}` };
        }) });
      }

      // Amulet aura (strength / balance) is now applied automatically by the
      // reducer's postProcessAmuletAura middleware whenever amuletSlots changes.
      // Do NOT dispatch MODIFY_SLOT_TEMP_ATTACK/ARMOR here — that would
      // double-apply on top of the middleware. Just emit the UI log lines.
      if (card.amuletEffect === 'balance') {
        addGameLog('amulet', '均衡护符生效：左栏临时攻击+3护甲-1，右栏临时护甲+3攻击-1');
      }
      if (card.amuletEffect === 'strength') {
        addGameLog('amulet', '力量护符生效：所有装备栏临时攻击 +4！');
      }

      if (displacedAmulet !== null) {
        const displaced = displacedAmulet as AmuletItem;
        // Aura reversal for displaced amulet is also handled by the middleware
        // (the post-state's amuletSlots no longer contains it, so the diff
        // produces a negative delta automatically).
        addGameLog('amulet', `卸下护符：${displaced.name}`);
        // 与装备被顶替的逻辑对齐：从护符栏飞向坟场。此时 dispatch 已经
        // 把这枚护符从 amuletSlots 移除（card-by-id 的 DOM 已不存在），
        // 所以走 'amulet' sourceHint，用护符栏 cell 的位置作为飞行起点。
        void triggerDiscardFlight(displaced, 'graveyard', 'amulet');
        discardCardToGraveyard(displaced, { owner: 'player' });
      }

      // Reducer enqueues APPLY_TRANSFORM_CATEGORY (thin marker — placement
      // bookkeeping above is unchanged).
      dispatch({ type: 'EQUIP_AMULET_FROM_HAND', card });

      if (isCardFromHand(card)) {
        if (!consumeCardFromHand(card)) {
          return;
        }
        tickRecycleForge();
      } else if (backpackItems.some(c => c.id === card.id)) {
        dispatch({ type: 'UPDATE_BACKPACK_ITEMS', updater: prev => prev.filter(c => c.id !== card.id) });
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
          addPermanentMagicToRecycleBag(card, { waitsOverride: 1 });
          applyDiscardSideEffects(card, 'player', { toRecycleBag: true });
          addGameLog('equip', `回收永久装备「${card.name}」至回收袋。`);
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `${card.name} 已回收至回收袋。` });
          tickRecycleForge();
        }
        resetDragState();
        return;
      }
      if (handCards.some(c => c.id === card.id)) {
        // Curses cannot be recycled or discarded — only played.
        if (card.type === 'curse') {
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `${card.name} 是诅咒，无法回收或弃置。` });
          resetDragState();
          return;
        }
        if (!consumeCardFromHand(card)) {
          resetDragState();
          return;
        }
        addGameLog('magic', `回收「${card.name}」至回收袋。`);
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `${card.name} 已回收至回收袋。` });
        discardCardToGraveyard(card, { owner: 'player', forceRecycleBag: true, waitsOverride: 1 });
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
        // Aura reversal for the recycled amulet is handled by the reducer's
        // postProcessAmuletAura middleware (triggered by REMOVE_AMULET).
        dispatch({ type: 'REMOVE_AMULET', cardId: card.id });
        addPermanentMagicToRecycleBag(card, { waitsOverride: 1 });
        applyDiscardSideEffects(card, 'player', { toRecycleBag: true });
        addGameLog('magic', `回收护符「${card.name}」至回收袋。`);
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `${card.name} 已回收至回收袋。` });
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
      addGameLog('deck', `获得「${card.name}」→ 背包`);
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
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: '永恒护符·雷盾心法：不能装备武器！' });
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
            disposeOwnedEquipmentCard(reserve[0], { isDestruction: true, triggerLastWords: true, fromSlotId: equipSlot });
            addGameLog('equip', `卸下 ${reserve[0].name}`);
            const newReserve = reserve.slice(1);
            setEquipmentReserve(equipSlot, equippedItem ? [...newReserve, equippedItem] : newReserve);
          } else {
            disposeOwnedEquipmentCard(equippedItem, { isDestruction: true, triggerLastWords: true, fromSlotId: equipSlot });
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

      // onEquipEffect（gold+4 / temp-attack-2|3 / temp-armor-3 / heal-3 / …）
      // 与 equip-empower 永恒护符的处理已下沉到 EQUIP_FROM_HAND reducer。
      // 见 game-core/rules/cards.ts → reduceEquipFromHand。

      if (isMonsterFromHand && amuletEffects.monsterEquipBuffCount > 0) {
        const bump = amuletEffects.monsterEquipBuffCount;
        setEquipmentSlotBonus(equipSlot, 'damage', cur => cur + bump);
        setEquipmentSlotBonus(equipSlot, 'shield', cur => cur + bump);
        addGameLog('amulet', `驯兽铸印：${equipCard.name} 装备栏永久攻击 +${bump}，永久护甲 +${bump}！`);
        dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `驯兽铸印：永久攻击 +${bump}，永久护甲 +${bump}！` });
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
          drawFromBackpackToHand();
        }
      }

      // Reducer 跑 onEquipEffect / equip-empower / APPLY_TRANSFORM_CATEGORY。
      // 槽位放置 / displacement / 怪物特定入场效果 仍由上面的 imperative
      // 代码处理（在 dispatch 之前已经完成 SET_EQUIPMENT_SLOT 等）。
      dispatch({ type: 'EQUIP_FROM_HAND', card, slotId: equipSlot });

      if (isCardFromHand(card)) {
        const handArr = handCardsRef.current;
        const flankIdx = handArr.findIndex(c => c.id === card.id);
        const isFlank = flankIdx >= 0 && (flankIdx === 0 || flankIdx === handArr.length - 1);
        lastPlayedFlankRef.current = isFlank;

        if (!consumeCardFromHand(card)) {
          return;
        }
        tickRecycleForge();

        if (isFlank && card.flankDraw) {
          for (let i = 0; i < card.flankDraw; i++) {
            drawFromBackpackToHand();
          }
          addGameLog('magic', `侧击效果：${card.name} 抽取 ${card.flankDraw} 张牌`);
          dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `侧击！${card.name} 抽取了 ${card.flankDraw} 张牌。` });
        }

        if (isFlank && card.flankEffectId) {
          if (card.flankEffectId.startsWith('persuadeCost-')) {
            const amount = parseInt(card.flankEffectId.replace('persuadeCost-', ''), 10) || 1;
            const currentMod = engine.getState().persuadeCostModifier ?? 0;
            const currentCost = PERSUADE_COST + currentMod;
            if (currentCost <= MIN_PERSUADE_COST) {
              addGameLog('event', `劝降费用已达下限（${currentCost} 金币），无法再降低`);
              dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `侧击！${card.name} 劝降费用已达下限，无法再降低。` });
            } else {
              const actualAmount = Math.min(amount, currentCost - MIN_PERSUADE_COST);
              dispatch({ type: 'MODIFY_PERMANENT_STAT', stat: 'persuadeCostModifier', delta: -actualAmount });
              addGameLog('event', `侧击效果：${card.name} 劝降费用永久 -${actualAmount}`);
              dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `侧击！${card.name} 劝降费用永久 -${actualAmount}！` });
            }
          } else if (card.flankEffectId.startsWith('stunCap+')) {
            const amount = parseInt(card.flankEffectId.replace('stunCap+', ''), 10) || 5;
            dispatch({ type: 'MODIFY_STUN_CAP', delta: amount });
            addGameLog('event', `侧击效果：${card.name} 击晕上限 +${amount}%`);
            dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `侧击！${card.name} 击晕上限 +${amount}%！` });
          } else if (card.flankEffectId.startsWith('damage:')) {
            const amount = parseInt(card.flankEffectId.replace('damage:', ''), 10) || 5;
            const monsters = flattenActiveRowSlots(activeCardsLatestRef.current).filter(
              (c): c is GameCardData => isDamageableTarget(c),
            );
            if (monsters.length > 0) {
              let rng = engine.getState().rng;
              const [target, rng2] = pickRandom(monsters, rng); rng = rng2;
              dispatch({ type: 'SET_GAME_FLAGS', patch: { rng } });
              // 显式激怒目标：跟 discard-zap / flip-zap 风格一致，意图明确，
              // 不依赖 reduceDealDamageToMonster 的 universal engagement safety net。
              if (!isMonsterEngaged(target.id)) {
                beginCombat(target, 'hero');
              }
              dealDamageToMonster(target, amount);
              addGameLog('event', `侧击效果：${card.name} 对 ${target.name} 造成 ${amount} 点伤害`);
              dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `侧击！${card.name} 对 ${target.name} 造成了 ${amount} 点伤害！` });
            } else {
              addGameLog('event', `侧击效果：${card.name} 没有可攻击的怪物`);
              dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `侧击！但没有可攻击的怪物。` });
            }
          } else if (card.flankEffectId.startsWith('discard-recycle-to-hand:')) {
            // 唤回秘药·侧击：弃 1 张手牌·从回收袋随机取 N 张到手牌（互动式）。
            // 派单到 reducer 处理 modal/auto 分流。
            const count = parseInt(card.flankEffectId.replace('discard-recycle-to-hand:', ''), 10) || 1;
            dispatch({ type: 'TRIGGER_FLANK_DISCARD_RECYCLE', card, count });
          } else if (card.flankEffectId === 'graveyard-random-magic') {
            // 蜕变赋灵·侧击：失去 3 点生命，从坟场随机获得一张魔法卡。
            // 派单到 reducer，跟 reducePlayCard flank 分支共享同一份实现。
            dispatch({ type: 'TRIGGER_FLANK_GRAVEYARD_MAGIC', card });
          } else if (card.flankEffectId.startsWith('gold:')) {
            // 附魔祭坛·侧击：+N 金币。跟 reducePlayCard flank 分支保持一致。
            const amount = parseInt(card.flankEffectId.replace('gold:', ''), 10) || 3;
            dispatch({ type: 'MODIFY_GOLD', delta: amount, source: 'flank-gold' });
            addGameLog('gold', `侧击效果：${card.name} 获得 ${amount} 金币`);
            dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `侧击！${card.name} 获得 ${amount} 金币！` });
          } else if (card.flankEffectId.startsWith('heal:')) {
            // 赋能神殿·侧击：恢复 N HP。跟 reducePlayCard flank 分支保持一致。
            const amount = parseInt(card.flankEffectId.replace('heal:', ''), 10) || 2;
            dispatch({ type: 'HEAL', amount, source: 'flank-heal' });
            addGameLog('event', `侧击效果：${card.name} 恢复 ${amount} HP`);
            dispatch({ type: 'SET_HERO_SKILL_BANNER', message: `侧击！${card.name} 恢复 ${amount} HP！` });
          }
        }
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
  const magicTargeting = Boolean(pendingMagicAction);
  const magicSlotTargeting = pendingMagicAction?.step === 'slot-select';
  const magicMonsterTargeting = pendingMagicAction?.step === 'monster-select';
  const magicDungeonTargeting = pendingMagicAction?.step === 'dungeon-select';
  // 单目标伤害 magic 自伤路径：在 monster-select 阶段，pending 上挂了 allowsHeroTarget=true，
  // 玩家可以点 Hero Cell 把伤害打到自己身上（触发血怒战符 / 力量护符 / 复生庇佑充能）。
  // 见 magic-effects.ts 的 14 张单目标伤害卡 setup 路径。
  const heroSelfTargetingActive = Boolean(
    magicMonsterTargeting
      && (pendingMagicAction as { allowsHeroTarget?: boolean } | null)?.allowsHeroTarget,
  );
  // 同源条件：当 hero self-target 激活时，装有 type='shield' 或 type='monster'
  // （怪物装备既可当武器也可当盾）且 armor>0 的装备槽也是合法目标
  // （armor 先吃伤、溢出走自伤）。两种装备共用 RESOLVE_BLOCK 同款 armor 公式，
  // 自伤路径都跳过 RESOLVE_BLOCK 专属机制（含 bone-regen / 怪物盾自动恢复）。
  const shieldSlot1IsValidSelfTarget = Boolean(
    heroSelfTargetingActive
      && (equipmentSlot1?.type === 'shield' || equipmentSlot1?.type === 'monster')
      && (equipmentSlot1?.armor ?? equipmentSlot1?.armorMax ?? equipmentSlot1?.value ?? 0) > 0,
  );
  const shieldSlot2IsValidSelfTarget = Boolean(
    heroSelfTargetingActive
      && (equipmentSlot2?.type === 'shield' || equipmentSlot2?.type === 'monster')
      && (equipmentSlot2?.armor ?? equipmentSlot2?.armorMax ?? equipmentSlot2?.value ?? 0) > 0,
  );
  const potionTargeting = Boolean(pendingPotionAction);
  const potionSlotTargeting = pendingPotionAction?.step === 'slot-select';
  const playerTargetingActive =
    heroSkillTargeting || heroMagicTargeting || magicTargeting || potionTargeting;
  const slotTargetingActive =
    heroSkillSlotTargeting || Boolean(heroMagicSlotTargeting) || Boolean(magicSlotTargeting) || Boolean(potionSlotTargeting);
  const monsterTargetingActive =
    heroSkillMonsterTargeting || Boolean(magicMonsterTargeting);
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
        !waterfallActive &&
        !pendingHeroMagicAction &&
        !pendingHeroSkillAction &&
        !pendingMagicAction &&
        !pendingPotionAction;
      const disabledReason =
        lockedReason ?? insufficientCharge ?? waterfallReason ?? busyReason;
      return {
        id,
        name: definition.name,
        gauge: status.gauge,
        gaugeMax: definition.gaugeMax,
        unlocked: status.unlocked,
        ready,
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
    waterfallActive]);

  const potionChoiceDialogOpen =
    pendingPotionAction?.effect === 'repair-choice' && pendingPotionAction.step === 'choice';

  const modalOverlayBlocksEndHeroTurn = (() => {
    if (gameOver || showSkillSelection || showCardDraft) return true;
    if (backpackViewerOpen || deckViewerOpen || detailsModalOpen || heroDetailsOpen) return true;
    if (shopModalOpen && !shopModalMinimized) return true;
    if (eventModalOpen && !eventModalMinimized) return true;
    if (Boolean(graveyardDiscoverState) || Boolean(activeMonsterReward)) return true;
    if (Boolean(daggerSelfDestructPrompt) || potionChoiceDialogOpen || Boolean(deckPeekState)) return true;
    const gs = engine.getState();
    return Boolean(gs.discoverModalOpen) ||
      Boolean(gs.ghostBladeExileCards) ||
      Boolean(gs.shopSkillSelectOpen) ||
      Boolean(gs.deleteModalOpen) ||
      Boolean(gs.upgradeModalOpen) ||
      Boolean(gs.handMagicUpgradeModal) ||
      Boolean(gs.mirrorCopyModal) ||
      Boolean(gs.monsterFusionModal) ||
      Boolean(gs.permGrantModal) ||
      Boolean(gs.amplifyModal) ||
      Boolean(gs.eventAmplifyHandPicker) ||
      Boolean(gs.eventDiceModal) ||
      Boolean(gs.magicChoiceModal) ||
      Boolean(gs.equipmentPrompt) ||
      Boolean(gs.eventTransformState) ||
      Boolean(gs.deathWardNotice);
  })();

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

    return infos;
  }, [showSkillSelection, extraHeroSkills, extraSkillsUsedThisWave, waterfallActive, playerTargetingActive, permanentSkills]);

  const isPotionSlotEligible = (slotId: EquipmentSlotId) => {
    if (!potionSlotTargeting || !pendingPotionAction || pendingPotionAction.step !== 'slot-select') {
      return false;
    }
    if (pendingPotionAction.effect === 'perm-slot-damage+1' ||
        pendingPotionAction.effect === 'perm-slot-damage+2' ||
        pendingPotionAction.effect === 'perm-slot-capacity+1' ||
        pendingPotionAction.effect === 'swap-slot-damage-shield') {
      return true;
    }
    const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
    if (!slotItem || !slotItem.type) {
      return false;
    }
    if (pendingPotionAction.effect === 'grant-weapon-stun-chance+40') {
      return slotItem.type === 'weapon' || slotItem.type === 'monster';
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
    if (pendingPotionAction.effect === 'grant-lastwords-slot-temp-buff') {
      return true;
    }
    const maxDurability = slotItem.maxDurability ?? slotItem.durability ?? 0;
    const currentDurability = slotItem.durability ?? maxDurability;
    return maxDurability > 0 && currentDurability < maxDurability;
  };

  const equipmentSlot1Highlight =
    slotTargetingActive && (!potionSlotTargeting || isPotionSlotEligible('equipmentSlot1'));
  const equipmentSlot2Highlight =
    slotTargetingActive && (!potionSlotTargeting || isPotionSlotEligible('equipmentSlot2'));

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
  const isSpellCard = card.type === 'magic' || card.type === 'hero-magic' || card.type === 'potion' || card.type === 'curse';
    if (
      (waterfallAnimation.isActive && !isSpellCard) ||
      targetingActive ||
      fullBoardInteractionLockedRef.current ||
      handLockedForMonsterPhaseRef.current
    )
      return;
    setDraggedCard(card);
    draggedCardRef.current = card;
    setDraggedCardSource('hand');
    startDragSession();
    // Card stays in hand until successfully dropped
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
    }

    const dropAccepted =
      insideHeroFrame === true &&
      draggedCardRef.current &&
      isHeroRowHighlightCard(draggedCardRef.current);

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
    setDraggedCard(card);
    draggedCardRef.current = card;
    setDraggedCardSource('dungeon');
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
    setHeroRowDropState(null);
  };

  const engagedMonsters = getEngagedMonsterCards();
  const isWaterfallLocked = waterfallActive;
  const isDefeatAnimationPlaying = Object.keys(monsterDefeatStates).length > 0;
  const eventPendingLocked = eventModalMinimized && eventModalOpen && !!engine.getState().currentEventCard;
  const pendingBlock = combatState.pendingBlock;
  const showBlockButtons = Boolean(pendingBlock);
  const inCombat = engagedMonsters.some(m => !monsterDefeatStates[m.id]);
  // Shared attack-count formula. When `combat` is null (non-combat / preview),
  // assumes a fresh hero turn: no slotAttacked, no *SlotUsed, hero has 1 base attack.
  const computeSlotAttackCount = (slotId: EquipmentSlotId, slotItem: GameCardData, combat: 'hero-turn' | null): number => {
    let count = 0;
    if (combat === 'hero-turn') {
      const slotAttacked = combatState.heroAttacksThisTurn[slotId];
      if (!slotAttacked && combatState.heroAttacksRemaining > 0) count += 1;
      count += extraAttackCharges;
      count += (slotExtraAttacks ?? {})[slotId] ?? 0;
      if (slotAttacked || count > 0) {
        if (berserkerRageActive && !berserkerSlotUsed[slotId]) count += 1;
        if (amuletEffects.flashCount > 0) {
          count += Math.max(0, amuletEffects.flashCount - (flashSlotUsed[slotId] ?? 0));
        }
        if (gambitExtraActive) count += Math.max(0, gambitExtraPerSlot - (gambitSlotUsed[slotId] ?? 0));
        if ((slotItem as any)?.weaponExtraAttack && !weaponExtraAttackUsed[slotId]) count += 1;
        const battleSpiritBonus = (slotBattleSpiritBonus ?? {})[slotId] ?? 0;
        const battleSpiritUsed = (slotBattleSpiritUsedMap ?? {})[slotId] ?? 0;
        if (battleSpiritBonus > 0) count += Math.max(0, battleSpiritBonus - battleSpiritUsed);
      }
      return count;
    }
    // Non-combat preview: assume fresh hero turn (1 base attack, all *SlotUsed = 0).
    count = 1;
    count += extraAttackCharges;
    count += (slotExtraAttacks ?? {})[slotId] ?? 0;
    if (berserkerRageActive) count += 1;
    if (amuletEffects.flashCount > 0) count += amuletEffects.flashCount;
    if (gambitExtraActive) count += gambitExtraPerSlot;
    if ((slotItem as any)?.weaponExtraAttack) count += 1;
    const battleSpiritBonus = (slotBattleSpiritBonus ?? {})[slotId] ?? 0;
    if (battleSpiritBonus > 0) count += battleSpiritBonus;
    return count;
  };
  const computeSlotBlockCount = (slotId: EquipmentSlotId, slotItem: GameCardData, combat: 'monster-turn' | null): number => {
    const equipBonus = (slotItem as any).equipBlockDurabilityBonus ?? 0;
    const amuletBonus = amuletEffects.armorHalveEndureCount;
    const battleSpiritBonus = (slotBattleSpiritBonus ?? {})[slotId] ?? 0;
    const used = combat === 'monster-turn' ? (combatState.slotDurabilityUsedThisTurn?.[slotId] ?? 0) : 0;
    return Math.max(0, blockDurabilityPerSlot + equipBonus + amuletBonus + battleSpiritBonus - used);
  };
  const computeSlotCounts = (slotId: EquipmentSlotId): { attack: number | null; block: number | null } => {
    const slotItem = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
    if (!slotItem) return { attack: null, block: null };

    if (inCombat) {
      // Preserve existing combat behavior exactly:
      // - hero turn: show attack count for ALL slot types
      // - monster turn: show block count only for shield/monster
      if (combatState.currentTurn === 'hero') {
        return { attack: computeSlotAttackCount(slotId, slotItem, 'hero-turn'), block: null };
      }
      if (combatState.currentTurn === 'monster' && (slotItem.type === 'shield' || slotItem.type === 'monster')) {
        return { attack: null, block: computeSlotBlockCount(slotId, slotItem, 'monster-turn') };
      }
      return { attack: null, block: null };
    }

    // Non-combat preview: branch by item type.
    if (slotItem.type === 'weapon') {
      return { attack: computeSlotAttackCount(slotId, slotItem, null), block: null };
    }
    if (slotItem.type === 'shield') {
      return { attack: null, block: computeSlotBlockCount(slotId, slotItem, null) };
    }
    if (slotItem.type === 'monster') {
      return {
        attack: computeSlotAttackCount(slotId, slotItem, null),
        block: computeSlotBlockCount(slotId, slotItem, null),
      };
    }
    return { attack: null, block: null };
  };
  const slotCounts1 = computeSlotCounts('equipmentSlot1');
  const slotCounts2 = computeSlotCounts('equipmentSlot2');
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
    // Use direct context values so the layout effect re-runs on the same
    // render that the viewport actually changes (the `viewportWidth` state
    // lags by one tick because it's derived via a regular useEffect).
    // Also include `isNarrowLayout` so transitions across the breakpoint
    // recompute narrow-sidebar positions immediately.
    gameViewport.width,
    gameViewport.height,
    isNarrowLayout,
    gridCardSize?.width,
    gridCardSize?.height]);

  // Per-cell ResizeObserver: the existing observer only watches the grid
  // wrapper, which catches viewport-driven reflows but can miss cases where
  // an individual hero/active/preview cell reflows without the wrapper
  // changing size (e.g. a sibling row growing/shrinking). Observing the
  // three cells used for narrow-sidebar positioning ensures the compact
  // buttons stay glued to their rows on every resize.
  useEffect(() => {
    if (typeof window === 'undefined' || !isNarrowLayout) return;
    const cells: HTMLElement[] = [];
    const previewCell = previewCellRefs.current[0];
    const activeCell = activeCellRefs.current[0];
    const heroCell = heroRowCellRefs.current[0];
    if (previewCell) cells.push(previewCell);
    if (activeCell) cells.push(activeCell);
    if (heroCell) cells.push(heroCell);
    if (cells.length === 0) return;

    const ro = new ResizeObserver(() => updateHeroFramePosition());
    cells.forEach(cell => ro.observe(cell));
    return () => ro.disconnect();
  }, [
    isNarrowLayout,
    updateHeroFramePosition,
    // Re-bind the observer if the rows that own these cells re-render with
    // new DOM nodes (e.g. when previewCards / activeCards change content).
    previewCards,
    activeCards,
    heroVariant,
  ]);
  const draggedCardIsSpell =
    draggedCard?.type === 'magic' || draggedCard?.type === 'hero-magic' || draggedCard?.type === 'potion' || draggedCard?.type === 'curse';
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
      ? ((isSellableType(draggedCard.type) && draggedCard.type !== 'curse' && !(draggedCard.type === 'monster' && !draggedCard.isMinionCard))
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
        // Narrow layout: the hero-row backpack cell is not rendered; the
        // backpack instead lives as a compact button in NarrowSidebar
        // overlaying the right side of the hero frame. Exclude that region
        // too so the backpack sidebar always wins over the hero-row drop
        // when the cursor is over the compact button.
        if (!insideBackpack && compactBackpackCellRef.current) {
          const compactRect = compactBackpackCellRef.current.getBoundingClientRect();
          insideBackpack = pointInsideRect(compactRect, clientX, clientY);
        }
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
      return;
    }

    setHeroRowFrameDropActive(false);

    const setFrameActive = (active: boolean) => {
      setHeroRowFrameDropActive(prev => {
        if (prev === active) return prev;
        return active;
      });
    };

    const handleWindowDragOver = (event: WindowEventMap['dragover']) => {
      lastGlobalDragPosRef.current = { x: event.clientX, y: event.clientY };
      const card = draggedCardRef.current;
      if (!card || !isHeroRowHighlightCard(card)) {
        heroFrameDropIntentRef.current = false;
        return;
      }
      const insideHeroFrame = isPointInsideHeroRowDropArea(event.clientX, event.clientY, card);
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
    const targetItem = target === 'equipmentSlot1' ? equipmentSlot1 : target === 'equipmentSlot2' ? equipmentSlot2 : null;
    const targetEquipBonus = (targetItem as any)?.equipBlockDurabilityBonus ?? 0;
    const targetAmuletBonus = amuletEffects.armorHalveEndureCount;
    const targetBattleSpiritBonus = target !== 'hero' ? ((slotBattleSpiritBonus ?? {})[target as EquipmentSlotId] ?? 0) : 0;
    const isDurabilityExhausted = target !== 'hero' &&
      (combatState.slotDurabilityUsedThisTurn?.[target as EquipmentSlotId] ?? 0) >= (blockDurabilityPerSlot + targetEquipBonus + targetAmuletBonus + targetBattleSpiritBonus);
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
  // curseMonumentCols moved to useActiveRowDerivedState
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const heroRowSlots: HeroRowSlotConfig[] = useMemo(() => [
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
              ((slotExtraAttacks ?? {}).equipmentSlot1 ?? 0) <= 0 &&
              (!berserkerRageActive || Boolean(berserkerSlotUsed.equipmentSlot1)) &&
              (amuletEffects.flashCount <= 0 || (flashSlotUsed.equipmentSlot1 ?? 0) >= amuletEffects.flashCount) &&
              (!gambitExtraActive || (gambitSlotUsed.equipmentSlot1 ?? 0) >= gambitExtraPerSlot) &&
              (!(equipmentSlot1 as any)?.weaponExtraAttack || Boolean(weaponExtraAttackUsed.equipmentSlot1))
            }
            slotAttackCount={slotCounts1.attack}
            slotBlockCount={slotCounts1.block}
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
            selfTargetActive={shieldSlot1IsValidSelfTarget && !fullBoardInteractionLocked}
            onSelfTargetClick={
              shieldSlot1IsValidSelfTarget && !fullBoardInteractionLocked
                ? () => handleMagicShieldSlotTarget('equipmentSlot1')
                : undefined
            }
          />
          {showBlockButtons &&
            renderBlockButton('equipmentSlot1', 'Block (Left)', !canShieldBlock('equipmentSlot1') || (combatState.slotDurabilityUsedThisTurn?.equipmentSlot1 ?? 0) >= (blockDurabilityPerSlot + ((equipmentSlot1 as any)?.equipBlockDurabilityBonus ?? 0) + amuletEffects.armorHalveEndureCount + ((slotBattleSpiritBonus ?? {}).equipmentSlot1 ?? 0)))}
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
            potionChoice={null}
            onPotionChoice={undefined}
            onPotionCancel={undefined}
            spellDamageBonus={permanentSpellDamageBonus}
            spellLifesteal={permanentSpellLifesteal}
            stunCap={stunCap}
            nextPersuadeBonus={
              persuadeAmuletBonus +
              (persuadeDiscount?.rateBonus ?? 0) +
              permanentPersuadeBonus +
              (persuadeLevel - 1) * 5
            }
            selfTargetActive={heroSelfTargetingActive}
            onHeroClick={
              heroSelfTargetingActive && !fullBoardInteractionLocked
                ? () => handleMagicHeroSelfTarget()
                : playerTargetingActive || fullBoardInteractionLocked
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
              ((slotExtraAttacks ?? {}).equipmentSlot2 ?? 0) <= 0 &&
              (!berserkerRageActive || Boolean(berserkerSlotUsed.equipmentSlot2)) &&
              (amuletEffects.flashCount <= 0 || (flashSlotUsed.equipmentSlot2 ?? 0) >= amuletEffects.flashCount) &&
              (!gambitExtraActive || (gambitSlotUsed.equipmentSlot2 ?? 0) >= gambitExtraPerSlot) &&
              (!(equipmentSlot2 as any)?.weaponExtraAttack || Boolean(weaponExtraAttackUsed.equipmentSlot2))
            }
            slotAttackCount={slotCounts2.attack}
            slotBlockCount={slotCounts2.block}
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
            selfTargetActive={shieldSlot2IsValidSelfTarget && !fullBoardInteractionLocked}
            onSelfTargetClick={
              shieldSlot2IsValidSelfTarget && !fullBoardInteractionLocked
                ? () => handleMagicShieldSlotTarget('equipmentSlot2')
                : undefined
            }
          />
          {showBlockButtons &&
            renderBlockButton('equipmentSlot2', 'Block (Right)', !canShieldBlock('equipmentSlot2') || (combatState.slotDurabilityUsedThisTurn?.equipmentSlot2 ?? 0) >= (blockDurabilityPerSlot + ((equipmentSlot2 as any)?.equipBlockDurabilityBonus ?? 0) + amuletEffects.armorHalveEndureCount + ((slotBattleSpiritBonus ?? {}).equipmentSlot2 ?? 0)))}
        </>
      ),
    },
    ...(!isNarrowLayout ? [{
      id: 'hero-row-backpack',
      dropZone: 'backpack' as const,
      render: () => (
        <BackpackZone
          backpackCount={backpackItems.length}
          recycleCount={permanentMagicRecycleBag.length}
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
            !(draggedCard?.type === 'curse') &&
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
    }] : [])], [
    hp, maxHp, amuletSlots, maxAmuletSlots, amuletEffects,
    equipmentSlot1, equipmentSlot2, equipmentSlot1Reserve, equipmentSlot2Reserve,
    equipmentSlotCapacity,
    equipmentSlot1StatModifier, equipmentSlot2StatModifier,
    equipmentSlot1Highlight, equipmentSlot2Highlight,
    equipmentSlot1DropAvailable, equipmentSlot2DropAvailable,
    equipmentSlot1MonsterTarget, equipmentSlot2MonsterTarget,
    backpackItems, backpackCapacity, permanentMagicRecycleBag, classDeck, handCards,
    heroVariant, heroStunned, combatState,
    permanentSpellDamageBonus, permanentSpellLifesteal, stunCap,
    persuadeLevel, persuadeAmuletBonus, permanentPersuadeBonus, persuadeDiscount,
    slotTempArmor, slotTempAttack, berserkTurnBuff, extraAttackCharges,
    slotExtraAttacks,
    berserkerRageActive, berserkerSlotUsed, flashSlotUsed,
    gambitExtraActive, gambitExtraPerSlot, gambitSlotUsed,
    weaponExtraAttackUsed, blockDurabilityPerSlot, unbreakableUntilWaterfall,
    engagedMonsters, stageScale,
    handLockedForMonsterPhase, fullBoardInteractionLocked,
    isWaterfallLocked, isDefeatAnimationPlaying, playerTargetingActive,
    heroSkillTargeting, slotTargetingActive, slotTargetingLabel,
    heroSkillPrompt, heroMagicUiState, heroSkillInfo, extraHeroSkillInfos,
    selectedHeroSkillDef, showBlockButtons,
    draggingDungeonMonsterForPersuade, heroCardDropHighlight,
    draggedCard, draggedCardSource, draggedEquipment,
    isNarrowLayout, takingDamage, healing, heroBleedActive,
    monsterDefeatStates, weaponSwingStates, weaponSwingVariant,
    shieldBlockStates, shieldBlockVariant,
    tempAttackSuppressedByBuildingAura,
    handleCardToSlot, handleCardClick, handleCardToHero,
    handleSlotTargetSelection, handleHeroSkillButtonClick, cancelHeroSkillAction,
    handleExtraHeroSkillButtonClick, handleHeroMagicTrigger,
    handleBackpackClick, swapEquipmentToTop, getEquipmentSlotBonus,
    renderBlockButton, canShieldBlock, canCardGoToBackpack,
    isRecyclableFromHand, isPermRecycleEquipment,
    heroSelfTargetingActive, handleMagicHeroSelfTarget,
    shieldSlot1IsValidSelfTarget, shieldSlot2IsValidSelfTarget, handleMagicShieldSlotTarget,
  ]);

  const handleDeckClick = useCallback(() => {
    if (fullBoardInteractionLockedRef.current) return;
    setDeckViewerOpen(true);
  }, []);

  const handleGraveyardDropStable = useCallback((card: GameCardData) => {
    if (graveyardDropGuardRef.current.blocked) return;
    handleSellCard(card);
  }, [handleSellCard]);

  // Outside-click / X / ESC on Shop or Event collapses every open foldable
  // modal at once (event / shop / discover / graveyard discover / reward).
  // Each one keeps its own bottom pill in FloatingPillsContainer for individual
  // restore. See MINIMIZE_ALL_MODALS in rules/ui-state.ts.
  const handleShopMinimize = useCallback(() => dispatch({ type: 'MINIMIZE_ALL_MODALS' }), []);
  const handleEventMinimize = useCallback(() => dispatch({ type: 'MINIMIZE_ALL_MODALS' }), []);
  const handleGameOverMinimize = useCallback(() => setGameOverMinimized(true), []);

 

 

  // Sword overlay state now managed by useSwordOverlay hook

  const activeRowInteraction = useMemo<ActiveRowInteractionState>(() => ({
    isWaterfallLocked,
    isDefeatAnimationPlaying,
    fullBoardInteractionLocked,
    draggedEquipment,
    rageStripWidth,
    isCompactViewport,
    cellWrapperClass,
    cellInnerClass,
    monsterBleedStates,
    monsterHealStates,
    monsterDefeatStates,
    mineExplodeStates,
    removingCards,
    pendingDungeonUseRef,
  }), [
    isWaterfallLocked, isDefeatAnimationPlaying,
    fullBoardInteractionLocked, draggedEquipment, rageStripWidth, isCompactViewport,
    cellWrapperClass, cellInnerClass,
    monsterBleedStates, monsterHealStates, monsterDefeatStates,
    mineExplodeStates,
    removingCards, pendingDungeonUseRef,
  ]);

  const activeRowCallbacks = useMemo<ActiveRowCallbacks>(() => ({
    setActiveCellRef,
    handleDragStartFromDungeon,
    handleDragEndFromDungeon,
    handleWeaponToMonster,
    handleMonsterTargetSelection,
    handleDungeonCardSelection,
    handleCardClick,
    getMonsterRageOverlayStyle,
    registerMonsterCellRef,
  }), [
    setActiveCellRef, handleDragStartFromDungeon, handleDragEndFromDungeon,
    handleWeaponToMonster, handleMonsterTargetSelection, handleDungeonCardSelection,
    handleCardClick, getMonsterRageOverlayStyle, registerMonsterCellRef,
  ]);

  /**
   * 40s 倒计时归零时调用：先关掉所有组件本地的 useState modal（这些不在引擎
   * state 里，FORCE_END_HERO_TURN reducer 看不见），然后 dispatch 一条
   * `FORCE_END_HERO_TURN` 让引擎清掉所有 modal/pending interaction +
   * enqueue END_TURN。
   *
   * 跟普通 endHeroTurn 的区别：跳过 `endHeroTurnGuardRef` 检查（玩家可能正在
   * 拖拽 / modal 折叠 / 动画中——超时强制结束不能被这些状态阻挡）。
   *
   * 不可撤销：跟手动 endHeroTurn 一样清空 undo 栈，让超时也是硬性 commit 点。
   */
  const handleAutoEndHeroTurn = useCallback(() => {
    // 1. 关掉所有组件本地 modal（引擎 reducer 看不见这些 useState）
    setBackpackViewerOpen(false);
    setDeckViewerOpen(false);
    setDeckPeekState(null);
    setDetailsModalOpen(false);
    setHeroDetailsOpen(false);
    setGameOverMinimized(false);

    // 2. 跟 endHeroTurn 一致地处理 layer-loss tracking（用于精英 regen 等逻辑）
    const heroTurnLayerLossIds = Array.from(heroTurnLayerLossIdsRef.current);
    heroTurnLayerLossIdsRef.current.clear();
    heroTookDamageThisMonsterTurnRef.current = false;

    // 3. 不可撤销：跟手动 endHeroTurn 一样清空 undo 栈。
    clearUndoStack();

    // 4. 让引擎统一收尾：清 pendingInteraction / 所有 modal state /
    //    phase → playerInput，再 enqueue END_TURN。
    dispatch({
      type: 'FORCE_END_HERO_TURN',
      heroTurnLayerLossIds,
    });
  }, [dispatch, clearUndoStack]);

  const modalCallbacks = useMemo<ModalCallbacks>(() => ({
    onCardSelect: handleCardClick,
    onShopPurchase: handleShopPurchase,
    onShopClose: handleShopClose,
    onShopMinimize: handleShopMinimize,
    onShopHealRequest: handleShopHealRequest,
    onShopLevelUpRequest: handleShopLevelUpRequest,
    onShopDeleteRequest: handleShopDeleteRequest,
    onShopSkillDiscoverRequest: handleShopSkillDiscoverRequest,
    onShopEquipAttackRequest: handleShopEquipAttackRequest,
    onShopEquipArmorRequest: handleShopEquipArmorRequest,
    onShopRefreshRequest: handleShopRefreshRequest,
    onShopSkillSelect: handleShopSkillSelect,
    onEventChoice: handleEventChoice,
    onEventMinimize: handleEventMinimize,
    onDiceRollResult: handleDiceRollResult,
    onDiceModalClose: cancelDiceModal,
    onMagicChoice: handleMagicChoice,
    onEquipmentPromptSelect: handleEquipmentPromptSelection,
    onEquipmentPromptCancel: cancelEquipmentPrompt,
    onDiscoverSelect: handleDiscoverSelect,
    onDiscoverCancel: handleDiscoverCancel,
    onGraveyardDiscoverSelect: handleGraveyardDiscoverSelect,
    onGraveyardDiscoverCancel: handleGraveyardDiscoverCancel,
    onGhostBladeExileConfirm: handleGhostBladeExileConfirm,
    onMonsterRewardSelect: handleMonsterRewardSelection,
    onPersuadeConfirm: handlePersuadeConfirm,
    onPersuadeDiceResult: handlePersuadeDiceResult,
    onPersuadeClose: handlePersuadeClose,
    onDeleteModalChange: handleDeleteModalOpenChange,
    onDeleteCardConfirm: handleDeleteCardConfirm,
    onBatchDeleteConfirm: handleBatchDeleteConfirm,
    onDetailsModalChange: handleDetailsModalChange,
    onHeroDetailsChange: setHeroDetailsOpen,
    onUpgradeModalChange: handleUpgradeModalChange,
    onCardUpgrade: handleCardUpgrade,
    onHandMagicUpgradeSelect: handleHandMagicUpgradeSelect,
    onHandMagicUpgradeClose: handleHandMagicUpgradeClose,
    onMirrorCopyConfirm: resolveMirrorCopy,
    onMirrorCopyCancel: cancelMirrorCopy,
    onMonsterFusionConfirm: resolveMonsterFusion,
    onMonsterFusionCancel: cancelMonsterFusion,
    onAmplifyConfirm: resolveAmplify,
    onAmplifyCancel: cancelAmplify,
    onEventAmplifyHandConfirm: handleEventAmplifyHandSelect,
    onEventAmplifyHandCancel: cancelEventAmplifyHandPicker,
    onPermGrantConfirm: resolvePermGrant,
    onPermGrantCancel: cancelPermGrant,
    onBackpackReorganizeConfirm: handleBackpackReorganizeConfirm,
    onHandDiscardSelectionConfirm: handleHandDiscardSelectionConfirm,
    onCancelHeroMagicAction: cancelHeroMagicAction,
    onCancelPotionAction: cancelPotionAction,
    onPotionChoiceSelection: handlePotionChoiceSelection,
    onDismissDeathWardNotice: handleDismissDeathWardNotice,
    onDaggerSelfDestructConfirm: handleDaggerSelfDestructConfirm,
    onDaggerSelfDestructDecline: handleDaggerSelfDestructDecline,
    onSkillSelection: handleSkillSelection,
    onCardDraftComplete: handleCardDraftComplete,
    onRestart: handleNewGame,
    onEndHeroTurn: endHeroTurn,
    onAutoEndHeroTurn: handleAutoEndHeroTurn,
    onUndo: handleUndo,
    onGameOverMinimize: handleGameOverMinimize,
    onWraithPassiveUnlockChange: setWraithPassiveUnlockPopup,
    onDeckViewerChange: setDeckViewerOpen,
    onBackpackViewerChange: setBackpackViewerOpen,
  }), [
    handleCardClick, handleShopPurchase, handleShopClose, handleShopMinimize,
    handleShopHealRequest, handleShopLevelUpRequest, handleShopDeleteRequest,
    handleShopSkillDiscoverRequest, handleShopEquipAttackRequest, handleShopEquipArmorRequest,
    handleShopRefreshRequest,
    handleShopSkillSelect, handleEventChoice, handleEventMinimize,
    handleDiceRollResult, cancelDiceModal, handleMagicChoice,
    handleEquipmentPromptSelection, cancelEquipmentPrompt,
    handleDiscoverSelect, handleDiscoverCancel,
    handleGraveyardDiscoverSelect, handleGraveyardDiscoverCancel, handleGhostBladeExileConfirm,
    handleMonsterRewardSelection, handlePersuadeConfirm, handlePersuadeDiceResult, handlePersuadeClose,
    handleDeleteModalOpenChange, handleDeleteCardConfirm, handleBatchDeleteConfirm, handleDetailsModalChange,
    handleUpgradeModalChange, handleCardUpgrade,
    handleHandMagicUpgradeSelect, handleHandMagicUpgradeClose,
    resolveMirrorCopy, cancelMirrorCopy, resolveMonsterFusion, cancelMonsterFusion, resolveAmplify, cancelAmplify,
    handleEventAmplifyHandSelect, cancelEventAmplifyHandPicker,
    resolvePermGrant, cancelPermGrant,
    handleBackpackReorganizeConfirm,
    handleHandDiscardSelectionConfirm,
    cancelHeroMagicAction, cancelPotionAction, handlePotionChoiceSelection,
    handleDismissDeathWardNotice,
    handleDaggerSelfDestructConfirm, handleDaggerSelfDestructDecline,
    handleSkillSelection, handleCardDraftComplete, handleNewGame,
    endHeroTurn, handleAutoEndHeroTurn, handleUndo, handleGameOverMinimize,
  ]);

  const modalUI = useMemo<ModalUIState>(() => ({
    selectedCard,
    detailsModalOpen,
    deckViewerOpen,
    backpackViewerOpen,
    heroDetailsOpen,
    gameOverMinimized,
    daggerSelfDestructPrompt,
    wraithPassiveUnlockPopup,
    eventDiceRollKey,
    persuadeRollKey,
    eventChoiceStates,
    overlayZoom,
    stageScale,
    headerHeight,
    heroMagicInfo: heroMagicUiState,
    endHeroTurnDisabled,
    fullBoardInteractionLocked,
    isDefeatAnimationPlaying,
  }), [
    selectedCard, detailsModalOpen, deckViewerOpen, backpackViewerOpen,
    heroDetailsOpen, gameOverMinimized, daggerSelfDestructPrompt, wraithPassiveUnlockPopup,
    eventDiceRollKey, persuadeRollKey, eventChoiceStates,
    overlayZoom, stageScale, headerHeight, classDeck,
    heroMagicUiState, endHeroTurnDisabled, fullBoardInteractionLocked,
    isDefeatAnimationPlaying,
  ]);

  return (
    <CardStampsProvider>
    <>
    <div ref={gameSurfaceRef} className="h-full w-full bg-background flex flex-col relative overflow-hidden" style={{ ...gridStyleVars, ...((minimizedModalLocksBoard || gameOver) ? { pointerEvents: 'none' } : {}) } as React.CSSProperties}>
      {/* === 桌布区域：覆盖 menu bar + 主游戏区，从屏幕顶到 hero row 蓝边下沿 === */}
      {/* wrapper 本身只负责布局（不带任何视觉），保持原大小 */}
      <div className="relative flex-grow flex flex-col min-h-0">
        {/* 桌布底色层：单独把视觉边缘往下伸 12px，不影响内部布局 */}
        <div
          className="pointer-events-none absolute"
          aria-hidden
          style={{
            zIndex: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: '-12px',
            background:
              'linear-gradient(180deg, #c9b078 0%, #b29560 28%, #8a6535 60%, #5e3f1f 88%, #382410 100%)',
            boxShadow:
              'inset 0 80px 100px -60px rgba(232, 204, 144, 0.22), inset 0 -140px 160px -80px rgba(38, 22, 8, 0.58), inset 0 -1px 0 rgba(38, 22, 8, 0.7)',
          }}
        />
        {/* 桌布纹理层：卡背 PNG 平铺 + 极低 opacity，只做花纹质感，不影响底色 */}
        <div
          className="pointer-events-none absolute"
          aria-hidden
          style={{
            zIndex: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: '-12px',
            // url() 必须给路径加引号 —— dev 时 Vite 解析成 /@fs/.../My Mac
            // (Shus-MacBook-Pro.local)/... 路径里有未转义的 ( ) 括号，
            // 不带引号会让浏览器 CSS url() 解析失败、整层 background 被丢弃，
            // 导致 dev 看不到 texture（prod hash 路径无特殊字符所以正常）。
            backgroundImage: `url("${cardBackImage}")`,
            backgroundRepeat: 'repeat',
            backgroundSize: '220px 220px',
            mixBlendMode: 'overlay',
            opacity: 0.18,
          }}
        />
        {/* 桌布顶部高光层：模拟桌布微反光 */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40"
          aria-hidden
          style={{
            zIndex: 0,
            background:
              'radial-gradient(ellipse at 50% -20%, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0) 60%)',
          }}
        />

        {/* === 桌布四周装饰：贴边浮雕宽滚边 + 四角铜雕花卷 === */}
        {/* 多层 inset box-shadow 拼出"亮-暗-金-暗-亮"的厚浮雕滚边（约 22px 宽） */}
        <div
          className="pointer-events-none absolute"
          aria-hidden
          style={{
            zIndex: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: '-12px',
            boxShadow: [
              'inset 0 0 0 2px rgba(255, 232, 178, 0.75)',
              'inset 0 0 0 9px rgba(82, 54, 26, 0.7)',
              'inset 0 0 0 13px rgba(196, 152, 88, 0.85)',
              'inset 0 0 0 20px rgba(82, 54, 26, 0.65)',
              'inset 0 0 0 22px rgba(255, 232, 178, 0.55)',
              'inset 0 0 0 23px rgba(70, 46, 22, 0.4)',
            ].join(', '),
          }}
        />
        {/* 四角铜雕卷草 —— 三层（投影/主线/高光）叠加做浮雕 */}
        {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => {
          const position =
            corner === 'tl' ? { top: 0, left: 0, transform: 'none' as const }
            : corner === 'tr' ? { top: 0, right: 0, transform: 'scaleX(-1)' as const }
            : corner === 'bl' ? { bottom: '-12px', left: 0, transform: 'scaleY(-1)' as const }
            : { bottom: '-12px', right: 0, transform: 'scale(-1, -1)' as const };

          const renderOrnament = (color: string, dx: number, dy: number, strokeScale = 1) => (
            <g transform={`translate(${dx}, ${dy})`} style={{ color }}>
              {/* 外层 L 形角线（更粗、更长） */}
              <path
                d="M0 56 L0 6 Q 0 0 6 0 L56 0"
                stroke="currentColor"
                strokeWidth={4 * strokeScale}
                fill="none"
                strokeLinecap="round"
              />
              {/* 第二层伴线 —— 中线 */}
              <path
                d="M10 56 L10 14 Q 10 10 14 10 L56 10"
                stroke="currentColor"
                strokeWidth={2 * strokeScale}
                fill="none"
                strokeLinecap="round"
                opacity="0.9"
              />
              {/* 第三层伴线 —— 内细线，加密层次 */}
              <path
                d="M16 56 L16 22 Q 16 20 18 20 L56 20"
                stroke="currentColor"
                strokeWidth={1 * strokeScale}
                fill="none"
                strokeLinecap="round"
                opacity="0.55"
              />
              {/* 主卷草（更粗） */}
              <path
                d="M4 4 Q 32 8 38 36 Q 42 64 70 70"
                stroke="currentColor"
                strokeWidth={2.8 * strokeScale}
                fill="none"
                strokeLinecap="round"
              />
              {/* 卷草小叶尖 */}
              <path
                d="M70 70 Q 88 66 94 52"
                stroke="currentColor"
                strokeWidth={2.2 * strokeScale}
                fill="none"
                strokeLinecap="round"
                opacity="0.95"
              />
              {/* 卷草上分支 */}
              <path
                d="M38 36 Q 52 42 58 56"
                stroke="currentColor"
                strokeWidth={1.7 * strokeScale}
                fill="none"
                strokeLinecap="round"
                opacity="0.85"
              />
              {/* 卷草下分支 —— 一片小卷叶 */}
              <path
                d="M58 56 Q 66 60 64 70"
                stroke="currentColor"
                strokeWidth={1.4 * strokeScale}
                fill="none"
                strokeLinecap="round"
                opacity="0.75"
              />
              {/* 节点珠粒 —— 大铆钉到小铆钉递减 */}
              <circle cx="4" cy="4" r={5.5 * strokeScale} fill="currentColor" />
              <circle cx="38" cy="36" r={3.2 * strokeScale} fill="currentColor" opacity="0.95" />
              <circle cx="70" cy="70" r={2.4 * strokeScale} fill="currentColor" opacity="0.9" />
              <circle cx="94" cy="52" r={1.6 * strokeScale} fill="currentColor" opacity="0.8" />
              <circle cx="58" cy="56" r={1.4 * strokeScale} fill="currentColor" opacity="0.75" />
              <circle cx="64" cy="70" r={1.1 * strokeScale} fill="currentColor" opacity="0.65" />
            </g>
          );

          return (
            <svg
              key={corner}
              className="pointer-events-none absolute"
              width="132"
              height="132"
              viewBox="0 0 132 132"
              aria-hidden
              style={{
                zIndex: 0,
                ...position,
                transformOrigin: 'center',
              }}
            >
              {/* 第 1 层：最深投影（右下偏移大）—— 桌布表面下的暗坑 */}
              {renderOrnament('rgba(8, 4, 0, 0.55)', 4, 4, 1.12)}
              {/* 第 2 层：浅投影（右下偏移小） */}
              {renderOrnament('rgba(20, 10, 2, 0.7)', 2, 2, 1.05)}
              {/* 第 3 层：主线（深棕） */}
              {renderOrnament('rgba(48, 26, 10, 1)', 0, 0, 1)}
              {/* 第 4 层：金色中调（左上微偏）—— 雕件主反光 */}
              {renderOrnament('rgba(196, 152, 88, 0.85)', -0.8, -0.8, 0.85)}
              {/* 第 5 层：最亮高光（左上偏更多）—— 凸边受光最强处 */}
              {renderOrnament('rgba(255, 232, 178, 0.85)', -1.6, -1.6, 0.7)}
            </svg>
          );
        })}

        {/* === 桌布下方区域：实木地板（俯视）=== */}
        {/* 紧接桌布视觉下沿（top: 100% + 12px），用一个足够大的固定高度
            视觉上"溢出"到 HandRow 那块，被外层 gameSurfaceRef 的 overflow-hidden 自然裁到屏幕底 */}
        <div
          className="pointer-events-none absolute"
          aria-hidden
          style={{
            zIndex: 0,
            top: 'calc(100% + 12px)',
            left: 0,
            right: 0,
            height: '600px',
            overflow: 'hidden',
          }}
        >
          {/* 1. 木地板底色：暖棕（核桃木/橡木），从上往下略微变深，模拟环境光衰减 */}
          <div
            className="absolute inset-0"
            aria-hidden
            style={{
              background:
                'linear-gradient(180deg, #7a5230 0%, #6b4423 35%, #5a3819 75%, #432710 100%)',
            }}
          />
          {/* 2. 横向板缝：每条板 110px 宽，板缝是一条很深的细线（模拟拼接缝） */}
          <div
            className="absolute inset-0"
            aria-hidden
            style={{
              backgroundImage:
                'repeating-linear-gradient(180deg, ' +
                'rgba(0, 0, 0, 0) 0px, ' +
                'rgba(0, 0, 0, 0) 106px, ' +
                'rgba(0, 0, 0, 0.55) 108px, ' +
                'rgba(0, 0, 0, 0.85) 110px, ' +
                'rgba(255, 220, 170, 0.18) 111px, ' +
                'rgba(0, 0, 0, 0) 113px)',
            }}
          />
          {/* 3. 板与板的色差：相邻板色调略不同（一深一浅交替），打破单调 */}
          <div
            className="absolute inset-0"
            aria-hidden
            style={{
              backgroundImage:
                'repeating-linear-gradient(180deg, ' +
                'rgba(255, 200, 150, 0.06) 0px, ' +
                'rgba(255, 200, 150, 0.06) 110px, ' +
                'rgba(0, 0, 0, 0.10) 110px, ' +
                'rgba(0, 0, 0, 0.10) 220px)',
            }}
          />
          {/* 4. 木纹竖向细线（密、细、不规则）：模拟木材自然纹理 */}
          <div
            className="absolute inset-0"
            aria-hidden
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, ' +
                'rgba(0, 0, 0, 0) 0px, ' +
                'rgba(50, 28, 10, 0.18) 1px, ' +
                'rgba(0, 0, 0, 0) 4px, ' +
                'rgba(0, 0, 0, 0) 9px, ' +
                'rgba(80, 50, 22, 0.14) 10px, ' +
                'rgba(0, 0, 0, 0) 13px, ' +
                'rgba(0, 0, 0, 0) 17px, ' +
                'rgba(110, 75, 35, 0.10) 18px, ' +
                'rgba(0, 0, 0, 0) 21px, ' +
                'rgba(0, 0, 0, 0) 27px, ' +
                'rgba(35, 18, 5, 0.16) 29px, ' +
                'rgba(0, 0, 0, 0) 32px, ' +
                'rgba(0, 0, 0, 0) 41px)',
            }}
          />
          {/* 5. 木纹长周期色块（更宽的浅/深色块，让木材看起来"有树纹流向"） */}
          <div
            className="absolute inset-0"
            aria-hidden
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, ' +
                'rgba(0, 0, 0, 0) 0px, ' +
                'rgba(255, 200, 145, 0.08) 60px, ' +
                'rgba(0, 0, 0, 0) 130px, ' +
                'rgba(0, 0, 0, 0.12) 200px, ' +
                'rgba(0, 0, 0, 0) 280px)',
            }}
          />
          {/* 6. 桌子投在地板上的阴影：顶部一条最深，向下迅速衰减 */}
          <div
            className="absolute inset-x-0 top-0"
            aria-hidden
            style={{
              height: '60px',
              background:
                'linear-gradient(180deg, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0.25) 40%, rgba(0, 0, 0, 0) 100%)',
            }}
          />
          {/* 7. 边缘 vignette：让两侧略暗，整体更有"室内俯视"感 */}
          <div
            className="absolute inset-0"
            aria-hidden
            style={{
              background:
                'radial-gradient(ellipse at 50% 30%, rgba(0, 0, 0, 0) 50%, rgba(0, 0, 0, 0.35) 100%)',
            }}
          />
        </div>

        {/* Header - Fixed height (透明背景，让桌布透出来) */}
        <div className="relative z-[1] flex-shrink-0" ref={headerWrapperRef}>
          <GameHeader
            maxHp={maxHp}
            persuadeTempDiscount={persuadeTempDiscount}
            deckFlyTargetRef={deckFlyTargetRef}
            onDeckClick={handleDeckClick}
            onNewGame={handleNewGame}
          />
        </div>

        {/* Main game area - Flexible height
            注意：top padding 主动设为 0（py-3/py-4 → pt-0），把 menu bar 与
            Preview Row 之间那截死空间吃掉，让 grid 整体能更靠上、更高一些。
            grid cell 高度 = 手牌卡尺寸（gridCardSize），所以 grid 拉高的同时
            手牌卡也会同步变大一点点 —— 即「手牌区视觉空间更充足」。
            bottom padding 保留，避免 hero-row 蓝边和 EternalRelics 撞在一起。 */}
        <div
          className={`flex-grow min-h-0 w-full px-2 relative z-[1] ${isFlat ? 'py-0' : 'pt-0 pb-3 md:pb-4'} md:px-4`}
        >
          <div className={`relative flex flex-col h-full ${isFlat ? 'gap-0' : 'gap-3'}`}>
          <div
            ref={boardRef}
            className="flex-1 min-h-0 relative flex justify-start lg:justify-center"
          >
            <div ref={gridWrapperRef} className="relative flex-1 w-full">
              {/* 3×N Card Grid (4 dungeon columns + optional utility column) */}
              <div 
                className={`game-grid ${isNarrowLayout ? 'game-grid-narrow' : ''} grid mx-auto h-full max-w-[1350px]`}
                style={{ 
                  gridAutoRows: 'minmax(0, 1fr)'
                }}>
          {/* Row 1: Preview Row - DUNGEON_COLUMN_COUNT cards + ClassDeck */}
          <PreviewRow
            waterfallAnimation={waterfallAnimation}
            graveyardVectors={previewGraveyardVectors}
            deckReturnVectors={previewDeckReturnVectors}
            cellWrapperClass={cellWrapperClass}
            cellInnerClass={cellInnerClass}
            onCellRef={setPreviewCellRef}
            onCardClick={handleCardClick}
            onDungeonCardSelection={handleDungeonCardSelection}
          />
          
          {/* Row 1, last col: ClassDeck (hidden in narrow layout) */}
          {!isNarrowLayout && (
            <div className={cellWrapperClass}>
              <div className={`${cellInnerClass} bg-card-foreground/5 rounded-lg`} ref={setClassDeckCellRef}>
                <ClassDeck
                  classCards={classDeck}
                  acquiredUniqueClassCardIds={acquiredUniqueClassCardIds}
                  className="w-full h-full"
                  onCardSelect={handleCardClick}
                />
              </div>
            </div>
          )}

          {/* Row 2: Active Row - DUNGEON_COLUMN_COUNT cards + GraveyardZone */}
          <ActiveRow
            interaction={activeRowInteraction}
            callbacks={activeRowCallbacks}
          />
          
          {/* Row 2, last col: GraveyardZone (hidden in narrow layout) */}
          {!isNarrowLayout && (
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
          )}

          {/* Row 3: Hero Row - 5 slots (Amulet, Equipment×2, Hero, Backpack); Backpack hidden in narrow layout */}
          <HeroRowSection
            heroRowSlots={heroRowSlots}
            cellWrapperClass={cellWrapperClass}
            cellInnerClass={cellInnerClass}
            registerHeroRowCellRef={registerHeroRowCellRef}
            getHeroRowMagicDropHandlers={getHeroRowMagicDropHandlers}
          />
              </div>

              <div
                ref={heroFrameRef}
                className={`hero-row-frame ${isFlat ? HERO_GAP_VARIABLE_CLASS_FLAT : HERO_GAP_VARIABLE_CLASS}`}
                style={heroFrameOverlayStyle}
              />
            </div>
            {/* classDeckFlights rendering moved to FlightOverlayContainer */}
            <SwordOverlay
              show={swordOverlay.showMonsterAttackIndicator}
              swordVectors={swordOverlay.swordVectors}
              activeSwordMonsterId={swordOverlay.activeSwordMonsterId}
            />
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
      </div>{/* === 桌布区域 end === */}

      {/* Eternal Relics — between hero row frame and hand */}
      <EternalRelicContainer
        onRelicClick={handleEternalRelicClick}
      />

      {/* Undo button — aligned with eternal relic bar at hero-row-frame bottom */}
      <UndoButtonContainer
        onUndo={handleUndo}
        stageScale={stageScale}
        fullBoardInteractionLocked={undoInteractionLocked}
      />

      {/* Hand Display - Dedicated space */}
      <HandContainer
        handAreaRef={handAreaRef}
        isFlat={isFlat}
        onPlayCard={handlePlayCardFromHand}
        onDragCardFromHand={handleDragCardFromHand}
        onDragEndFromHand={handleDragEndFromHand}
        onCardClick={handleCardClick}
        gridCardSize={gridCardSize ?? { width: 140, height: 210 }}
        isWaterfallLocked={isWaterfallLocked}
        fullBoardInteractionLocked={fullBoardInteractionLocked}
      />

      {/* CombatPanel removed — End Hero Turn button lives in the top-right overlay below */}
      <GameLogContainer
        onClear={clearGameLog}
        stageScale={stageScale}
      />

      <FlightOverlayContainer
        ref={flightOverlayRef}
        directedCombatFxFlights={directedCombatFxFlights}
        gridCardSize={gridCardSize ?? null}
        classDeckFlightElementMapRef={classDeckFlightElementMapRef}
        discardFlightElementMapRef={discardFlightElementMapRef}
        stealCardFlightElementMapRef={stealCardFlightElementMapRef}
        backpackFlightElementMapRef={backpackFlightElementMapRef}
        discardShockElementMapRef={discardShockElementMapRef}
        flipShockElementMapRef={flipShockElementMapRef}
        directedCombatFxElementMapRef={directedCombatFxElementMapRef}
        fateSwapFlightElementMapRef={fateSwapFlightElementMapRef}
        graveyardStackFlightElementMapRef={graveyardStackFlightElementMapRef}
      />

      <InCellFlipOverlayLayer inCellFlips={inCellFlips} />

      <MonsterSkillFloatOverlayLayer active={activeMonsterSkillFloat} />

      <StunReleasedGoldOverlayLayer active={activeStunGoldFx} />

      <DimensionWarpOverlayLayer dimensionWarps={dimensionWarps} />

      <FloatingPillsContainer
        gameOverMinimized={gameOverMinimized}
        setGameOverMinimized={setGameOverMinimized}
      />

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

      <GameModeSelectModal
        open={showGameModeSelect}
        onSelect={handleGameModeSelect}
        onLocalRolePick={import.meta.env.DEV ? handleLocalRolePick : undefined}
        onCancel={() => setShowGameModeSelect(false)}
      />

      <MultiplayerLobby
        open={showMultiplayerLobby}
        onCancel={() => {
          // Cancelling drops the user back to the mode select screen so
          // they can pick single instead.
          setShowMultiplayerLobby(false);
          setShowGameModeSelect(true);
        }}
        onReady={handleMultiplayerLobbyReady}
      />

      <MultiplayerBossAlert
        open={showMultiplayerBossAlert}
        onAcknowledge={() => setShowMultiplayerBossAlert(false)}
      />

      {/* Connection status badge — top-right, multiplayer only. Pure
          informational; doesn't gate input. */}
      {multiplayerConnection.phase !== 'idle' && (
        <div className="pointer-events-none fixed top-2 right-2 z-[60]">
          <MultiplayerConnectionBadge
            phase={multiplayerConnection.phase}
            retryAttempt={multiplayerConnection.retryAttempt}
          />
        </div>
      )}

      {/* Freeze overlay — fires when MP connection is disconnected or
          POST retries are exhausted. Captures all input behind it.
          Per spec: no auto-timeout — player either waits for reconnect
          or bails to single-player via the CTA. */}
      <MultiplayerOfflineOverlay
        phase={multiplayerConnection.phase}
        errorMessage={multiplayerConnection.errorMessage}
        onRetryNow={multiplayerConnection.retryNow}
        onStartNewSingleGame={() => handleGameModeSelect('single')}
      />

      <ModalCallbacksProvider value={modalCallbacks}>
        <ModalUIProvider value={modalUI}>
          <ShopContainer />
          <EventContainer />
          <CombatDiceContainer />
          <HeroInfoContainer />
          <DiscoverContainer />
          <CardViewerContainer />
          <RewardContainer />
          <GameFlowContainer />
          <MagicCardContainer />
          <BoardOverlayButtons />
        </ModalUIProvider>
      </ModalCallbacksProvider>

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
                <span className="flex items-center gap-1">
                  {selectedEternalRelic.name}
                  {selectedEternalRelicCount > 1 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
                      ×{selectedEternalRelicCount}
                    </span>
                  )}
                </span>
              </DialogTitle>
              <DialogDescription className="text-sm pt-2">
                {selectedEternalRelic.description}
              </DialogDescription>
              {(() => {
                const suffix = getRelicStackedSuffix(selectedEternalRelic.id, selectedEternalRelicCount);
                return suffix ? (
                  <p className="text-xs text-amber-200 mt-1 font-medium">{suffix}</p>
                ) : null;
              })()}
            </DialogHeader>
          </DialogContent>
        </Dialog>
      )}

      {/* Narrow layout: fixed sidebar strips flush with screen right edge */}
      {isNarrowLayout && narrowSidebarPositions && (
        <NarrowSidebar
          narrowSidebarPositions={narrowSidebarPositions}
          gridCardSize={gridCardSize ?? null}
          handleGraveyardDropStable={handleGraveyardDropStable}
          graveyardDropEnabled={graveyardDropEnabled}
          shouldHighlightGraveyard={shouldHighlightGraveyard}
          onCardSelect={handleCardClick}
          backpackCapacity={backpackCapacity}
          compactBackpackCellRef={compactBackpackCellRef}
          backpackDropEnabled={
            !isWaterfallLocked &&
            !isDefeatAnimationPlaying &&
            !playerTargetingActive &&
            !fullBoardInteractionLocked &&
            !(draggedCardSource === 'amulet' && draggedCard && !isRecyclableFromHand(draggedCard)) &&
            !(draggedCard?.type === 'curse') &&
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
          onBackpackDrop={(card) => {
            if (isWaterfallLocked || isDefeatAnimationPlaying || playerTargetingActive || fullBoardInteractionLocked) return;
            handleCardToSlot(card, 'slot-backpack');
          }}
          onBackpackOpenViewer={handleBackpackClick}
        />
      )}
    </div>
    <CardStampsContainer />
    </>
    </CardStampsProvider>
  );
}
