import type { GameCardData, EventDiceRange } from '@/components/GameCard';
import type { HeroVariant } from '@/lib/heroes';
import type { KnightCardData } from '@/lib/knightDeck';
import { sanitizeHeroMagicState, type HeroMagicState } from '@/lib/heroMagic';
import { migratePersistedState } from '@/game-core/persistence';
import type { HeroSkillDefinition } from '@/lib/heroSkills';

interface PersistedEternalRelic {
  id: string;
  name: string;
  description: string;
  image: string;
  amuletEffect?: string;
  amuletAuraBonus?: { attack?: number; defense?: number; maxHp?: number };
  upgradeLevel?: number;
}

export interface PersistedShopOffering {
  card: GameCardData;
  price: number;
  sold?: boolean;
}

export interface PersistedMonsterRewardOption {
  id: string;
  title: string;
  description: string;
  detail?: string;
  effect: Record<string, unknown>;
}

export interface PersistedMonsterRewardDrop {
  monsterName: string;
  options: PersistedMonsterRewardOption[];
  monsterInstanceId?: string;
}

export interface PersistedPersuadeState {
  monster: GameCardData;
  targetSlot: 'backpack';
  phase: string;
  threshold: number;
  successRate: number;
  diceValue: number | null;
  success: boolean | null;
}

export interface PersistedMagicChoiceModal {
  title: string;
  subtitle?: string;
  options: Array<{ id: string; label: string; description: string }>;
}

export interface PersistedEventDiceModal {
  title: string;
  subtitle?: string;
  entries: EventDiceRange[];
  rolledValue: number | null;
  highlightedId: string | null;
}

export interface PersistedDeathWardPrompt {
  card: GameCardData;
  source: 'hand' | 'backpack';
  pendingDamage: number;
  sourceType: 'combat' | 'general';
}

export const GAME_STATE_STORAGE_KEY = 'dungeonhero:game-state:v1';
const STORAGE_VERSION = 1 as const;

type BoardSlotSnapshot = Array<GameCardData | null>;

export interface SlotBonusSnapshot {
  damage: number;
  shield: number;
}

export interface EquipmentBuffSnapshot {
  equipmentSlot1: number;
  equipmentSlot2: number;
}

export interface EquipmentSlotBonusSnapshot {
  equipmentSlot1: SlotBonusSnapshot;
  equipmentSlot2: SlotBonusSnapshot;
}

export interface CombatStateSnapshot {
  engagedMonsterIds: string[];
  initiator: 'hero' | 'monster' | null;
  currentTurn: 'hero' | 'monster';
  heroAttacksThisTurn: Record<string, boolean>;
  heroAttacksRemaining: number;
  heroDamageThisTurn: Record<string, number>;
  monsterAttackQueue: string[];
  pendingBlock: null | {
    monsterId: string;
    attackValue: number;
    monsterName: string;
    isFollowUpAttack?: boolean;
  };
  slotBlocksThisTurn?: Record<string, boolean>;
  slotDurabilityUsedThisTurn?: Record<string, number>;
}

export interface PersistedGameState {
  version: typeof STORAGE_VERSION;
  timestamp: number;
  hp: number;
  gold: number;
  turnCount: number;
  monstersDefeated: number;
  shopLevel: number;
  cardsPlayed: number;
  recycleForgePlayCount?: number;
  /** 战伤刻印：已造成伤害次数 streak 0–9 */
  classDamageDiscoverStreak?: number;
  /** 咒纹刻印：已使用 magic 牌次数 streak 0–7 */
  classMagicDiscoverStreak?: number;
  totalDamageTaken: number;
  totalHealed: number;
  healAccumulator: number;
  previewCards: BoardSlotSnapshot;
  activeCards: BoardSlotSnapshot;
  remainingDeck: GameCardData[];
  discardedCards: GameCardData[];
  handCards: GameCardData[];
  equipmentSlot1: GameCardData | null;
  equipmentSlot2: GameCardData | null;
  equipmentSlot1Reserve?: GameCardData[];
  equipmentSlot2Reserve?: GameCardData[];
  equipmentSlotCapacity?: Record<string, number>;
  maxAmuletSlots?: number;
  amuletSlots: GameCardData[];
  backpackItems: GameCardData[];
  permanentMagicRecycleBag: GameCardData[];
  classDeck: GameCardData[];
  classCardsInHand: KnightCardData[];
  selectedHeroSkill: string | null;
  extraHeroSkills?: string[];
  showSkillSelection: boolean;
  heroVariant: HeroVariant;
  permanentSkills: string[];
  equipmentSlotBonuses: EquipmentSlotBonusSnapshot;
  weaponMasterBonus: number;
  shieldMasterBonus: number;
  gameOver: boolean;
  victory: boolean;
  permanentMaxHpBonus: number;
  permanentSpellDamageBonus: number;
  permanentSpellLifesteal: number;
  backpackCapacityModifier: number;
  heroMagicState: HeroMagicState;
  turnDamageTaken: number;
  berserkTurnBuff: EquipmentBuffSnapshot;
  extraAttackCharges: number;
  /** 兵器谱：本回合该装备栏额外攻击次数（独立于全局 extraAttackCharges） */
  slotExtraAttacks?: Record<string, number>;
  combatState?: CombatStateSnapshot;
  tempShield?: number;
  nextWeaponBonus?: number;
  nextShieldBonus?: number;
  slotAttackBursts?: EquipmentBuffSnapshot;
  /** 噬血砺锋：该槽下一次英雄攻击按造成伤害吸血 */
  nextAttackLifestealSlot?: 'equipmentSlot1' | 'equipmentSlot2' | null;
  vampiricNextAttack?: boolean;
  unbreakableNext?: boolean;
  unbreakableUntilWaterfall?: Record<string, boolean>;
  bulwarkPassiveActive?: number | boolean;
  bulwarkTempArmorStacks?: number;
  slotTempArmor?: Record<string, number>;
  slotTempAttack?: Record<string, number>;
  /** Whether amulet aura (strength/balance) is currently baked into slotTempAttack/slotTempArmor for this wave. Persisted so a reloaded save doesn't re-apply (and stack) the aura on the next START_TURN. */
  amuletAuraAppliedThisWave?: boolean;
  defensiveStanceActive?: boolean;
  doubleNextMagic?: boolean;
  berserkerRageActive?: boolean;
  berserkerSlotUsed?: Record<string, boolean>;
  flashSlotUsed?: Record<string, number | boolean>;
  gambitExtraActive?: boolean;
  gambitExtraPerSlot?: number;
  gambitSlotUsed?: Record<string, number>;
  weaponExtraAttackUsed?: Record<string, number>;
  blockDurabilityPerSlot?: number;
  slotBattleSpiritBonus?: Record<string, number>;
  slotBattleSpiritUsed?: Record<string, number>;
  heroSkillUsedThisWave?: boolean;
  /** 本波已用的额外英雄技能 id（商店发现等） */
  extraSkillsUsedThisWave?: string[];
  handLimitBonus?: number;
  drawPending?: boolean;
  waveDiscardCount?: number;
  wraithPassiveEnabled?: boolean;
  resolvingDungeonCardId?: string | null;
  currentEventCard?: GameCardData | null;
  eventModalOpen?: boolean;
  eventModalMinimized?: boolean;
  stunCap?: number;
  heroStunned?: boolean;
  monsterKillUpgradeProgress?: number;
  recycleBackpackProgress?: number;
  swapUpgradeProgress?: number;
  flipOverkillLifestealProgress?: number;
  equipAmuletCapProgress?: number;
  stunAttemptDiscoverProgress?: number;
  flipDebuffMonsterId?: string | null;
  bugletAmuletObtained?: boolean;
  statSwapCardObtained?: boolean;
  persuadeLevel?: number;
  persuadeCostModifier?: number;
  lastPersuadeTargetId?: string | null;
  consecutivePersuadeCount?: number;
  persuadeSameTargetCostHalve?: boolean;
  persuadeRaceBonus?: Record<string, number>;
  persuadeSuccessDurabilityBonus?: number;
  persuadeAmuletBonus?: number;
  permanentPersuadeBonus?: number;
  persuadeDiscount?: { costReduction: number; rateBonus: number } | null;
  lastPlayedCardCategory?: string | null;
  transformChainPrevCategory?: string | null;
  consecutiveTransformStreak?: number;
  magicCardsPlayedThisTurn?: number;
  damageMagicPlayedThisTurn?: number;
  previewCardStacks?: Record<number, GameCardData[]>;
  activeCardStacks?: Record<number, GameCardData[]>;
  waterfallDealBonus?: number;
  eternalRelics?: PersistedEternalRelic[];

  // --- Modal states (persisted so they survive page refresh) ---
  discoverModalOpen?: boolean;
  discoverModalMinimized?: boolean;
  discoverOptions?: GameCardData[];
  discoverSourceLabel?: string | null;
  graveyardDiscoverMinimized?: boolean;
  monsterRewardMinimized?: boolean;
  deleteModalOpen?: boolean;
  upgradeModalOpen?: boolean;
  showCardDraft?: boolean;
  cardDraftPool?: GameCardData[];
  shopModalOpen?: boolean;
  shopModalMinimized?: boolean;
  shopOfferings?: PersistedShopOffering[];
  shopSourceEvent?: GameCardData | null;
  shopDeleteUsed?: boolean;
  shopHealUsed?: boolean;
  shopLevelUpUsed?: boolean;
  shopSkillDiscoverUsed?: boolean;
  shopEquipAttackUsed?: boolean;
  shopEquipArmorUsed?: boolean;
  shopSkillOptions?: HeroSkillDefinition[];
  shopSkillSelectOpen?: boolean;
  monsterRewardQueue?: PersistedMonsterRewardDrop[];
  activeMonsterReward?: PersistedMonsterRewardDrop | null;
  selectedMonsterRewards?: PersistedMonsterRewardOption[] | null;
  graveyardDiscoverState?: GameCardData[] | null;
  graveyardDiscoverDelivery?: 'backpack' | 'hand-first';
  ghostBladeExileCards?: GameCardData[] | null;
  handMagicUpgradeModal?: { sourceCardId: string } | null;
  mirrorCopyModal?: { sourceCardId: string } | null;
  permGrantModal?: { sourceCardId: string; sourceType: string; meta?: Record<string, number> } | null;
  amplifyModal?: { sourceCardId: string } | null;
  eventAmplifyHandPicker?: { eventCardId: string; cellIdx: number } | null;
  equipmentPrompt?: { prompt: string; subtext?: string } | null;
  persuadeState?: PersistedPersuadeState | null;
  magicChoiceModal?: PersistedMagicChoiceModal | null;
  eventDiceModal?: PersistedEventDiceModal | null;
  deathWardPrompt?: PersistedDeathWardPrompt | null;
  rng?: { seed: number; state: number };
  /** 按卡名累计的增幅加成（增幅祭坛 / 增幅魔法）。 */
  amplifiedCardBonus?: Record<string, number>;
}

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const loadGameState = (): PersistedGameState | null => {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(GAME_STATE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PersistedGameState>;
    if (parsed.version !== STORAGE_VERSION) {
      return null;
    }
    const hydrated: PersistedGameState = {
      ...(parsed as PersistedGameState),
      heroMagicState: sanitizeHeroMagicState(parsed.heroMagicState),
    };
    return migratePersistedState(hydrated);
  } catch (error) {
    console.warn('[GameStorage] Failed to load state', error);
    return null;
  }
};

export const saveGameState = (state: PersistedGameState) => {
  if (!canUseStorage()) {
    return;
  }

  try {
    const payload: PersistedGameState = {
      ...state,
      version: STORAGE_VERSION,
      timestamp: Date.now(),
    };
    window.localStorage.setItem(GAME_STATE_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[GameStorage] Failed to save state', error);
  }
};

export const clearGameState = () => {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(GAME_STATE_STORAGE_KEY);
  } catch (error) {
    console.warn('[GameStorage] Failed to clear state', error);
  }
};

const UNDO_STACK_STORAGE_KEY = 'dungeonhero:undo-stack:v1';

export const saveUndoStack = (stack: unknown[]) => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(UNDO_STACK_STORAGE_KEY, JSON.stringify(stack));
  } catch (error) {
    console.warn('[GameStorage] Failed to save undo stack', error);
  }
};

export const loadUndoStack = (): unknown[] => {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(UNDO_STACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const clearUndoStorage = () => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(UNDO_STACK_STORAGE_KEY);
  } catch {
    // ignore
  }
};

const GAME_LOG_STORAGE_KEY = 'dungeonhero:game-log:v1';

export const saveGameLog = (entries: unknown[], nextId: number) => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(GAME_LOG_STORAGE_KEY, JSON.stringify({ entries, nextId }));
  } catch (error) {
    console.warn('[GameStorage] Failed to save game log', error);
  }
};

export const loadGameLog = (): { entries: unknown[]; nextId: number } | null => {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(GAME_LOG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.entries)) {
      return { entries: parsed.entries, nextId: parsed.nextId ?? parsed.entries.length };
    }
    return null;
  } catch {
    return null;
  }
};

export const clearGameLogStorage = () => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(GAME_LOG_STORAGE_KEY);
  } catch {
    // ignore
  }
};

const TOTAL_WINS_STORAGE_KEY = 'dungeonhero:total-wins';

export const getTotalWins = (): number => {
  if (!canUseStorage()) return 0;
  try {
    const raw = window.localStorage.getItem(TOTAL_WINS_STORAGE_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
};

export const incrementTotalWins = (): number => {
  const current = getTotalWins();
  const next = current + 1;
  if (!canUseStorage()) return next;
  try {
    window.localStorage.setItem(TOTAL_WINS_STORAGE_KEY, String(next));
  } catch {
    // ignore
  }
  return next;
};

