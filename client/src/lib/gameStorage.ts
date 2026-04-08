import type { GameCardData } from '@/components/GameCard';
import type { HeroVariant } from '@/lib/heroes';
import type { KnightCardData } from '@/lib/knightDeck';
import { sanitizeHeroMagicState, type HeroMagicState } from '@/lib/heroMagic';

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
  /** 战伤刻印：已造成伤害次数 streak 0–4 */
  classDamageDiscoverStreak?: number;
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
  defensiveStanceActive?: boolean;
  doubleNextMagic?: boolean;
  berserkerRageActive?: boolean;
  berserkerSlotUsed?: Record<string, boolean>;
  flashSlotUsed?: Record<string, boolean>;
  gambitExtraActive?: boolean;
  gambitExtraPerSlot?: number;
  gambitSlotUsed?: Record<string, number>;
  weaponExtraAttackUsed?: Record<string, boolean>;
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
  recycleBackpackProgress?: number;
  swapUpgradeProgress?: number;
  statSwapCardObtained?: boolean;
  persuadeLevel?: number;
  persuadeCostModifier?: number;
  lastPersuadeTargetId?: string | null;
  persuadeSameTargetCostHalve?: boolean;
  persuadeRaceBonus?: Record<string, number>;
  persuadeSuccessDurabilityBonus?: number;
  lastPlayedCardCategory?: string | null;
  magicCardsPlayedThisTurn?: number;
  previewCardStacks?: Record<number, GameCardData[]>;
  activeCardStacks?: Record<number, GameCardData[]>;
  waterfallDealBonus?: number;
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
    return {
      ...(parsed as PersistedGameState),
      heroMagicState: sanitizeHeroMagicState(parsed.heroMagicState),
    };
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

