import type { GameCardData } from '@/components/GameCard';
import type { HeroVariant } from '@/lib/heroes';
import type { KnightCardData } from '@/lib/knightDeck';

export const GAME_STATE_STORAGE_KEY = 'dungeonhero:game-state:v1';
const STORAGE_VERSION = 1 as const;

type BoardSlotSnapshot = Array<GameCardData | null>;

export interface SlotBonusSnapshot {
  damage: number;
  shield: number;
}

export interface EquipmentSlotBonusSnapshot {
  equipmentSlot1: SlotBonusSnapshot;
  equipmentSlot2: SlotBonusSnapshot;
}

export interface PersistedGameState {
  version: typeof STORAGE_VERSION;
  timestamp: number;
  hp: number;
  gold: number;
  monstersDefeated: number;
  cardsPlayed: number;
  totalDamageTaken: number;
  totalHealed: number;
  previewCards: BoardSlotSnapshot;
  activeCards: BoardSlotSnapshot;
  remainingDeck: GameCardData[];
  discardedCards: GameCardData[];
  handCards: GameCardData[];
  equipmentSlot1: GameCardData | null;
  equipmentSlot2: GameCardData | null;
  amuletSlots: GameCardData[];
  backpackItems: GameCardData[];
  canDrawFromBackpack: boolean;
  classDeck: GameCardData[];
  classCardsInHand: KnightCardData[];
  selectedHeroSkill: string | null;
  showSkillSelection: boolean;
  heroVariant: HeroVariant;
  permanentSkills: string[];
  equipmentSlotBonuses: EquipmentSlotBonusSnapshot;
  weaponMasterBonus: number;
  shieldMasterBonus: number;
  gameOver: boolean;
  victory: boolean;
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
    const parsed = JSON.parse(raw) as PersistedGameState;
    if (parsed.version !== STORAGE_VERSION) {
      return null;
    }
    return parsed;
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

