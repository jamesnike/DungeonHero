import type { CSSProperties, ReactNode, Ref } from 'react';

import type {
  EquipmentCardStatModifier,
  EventDiceRange,
  GameCardData,
} from '../GameCard';
import type { HeroSkillId, HeroSkillDefinition } from '@/lib/heroSkills';
import type { ShopOffering } from '../ShopModal';
import type { LogEntry } from '../GameLogPanel';
import type { PersistedGameState } from '@/lib/gameStorage';

export type BlockTarget = EquipmentSlotId | 'hero';

export type CombatInitiator = 'hero' | 'monster';

export type CombatState = {
  engagedMonsterIds: string[];
  initiator: CombatInitiator | null;
  currentTurn: CombatInitiator;
  heroAttacksThisTurn: Record<EquipmentSlotId, boolean>;
  heroAttacksRemaining: number;
  heroDamageThisTurn: Record<string, number>;
  monsterAttackQueue: string[];
  pendingBlock: null | {
    monsterId: string;
    attackValue: number;
    monsterName: string;
    isFollowUpAttack?: boolean;
  };
};

export type EquipmentSlotId = 'equipmentSlot1' | 'equipmentSlot2';

export type EquipmentItem = GameCardData & {
  type: 'weapon' | 'shield' | 'monster';
  fromSlot?: EquipmentSlotId;
};

export type EquipmentRepairTarget = 'weapon' | 'shield' | 'monster';

export type AmuletItem = GameCardData & { type: 'amulet'; fromSlot?: 'amulet' };

export type DragOrigin = 'hand' | 'dungeon' | 'backpack' | 'amulet' | EquipmentSlotId;

export type ActiveRowSlots = Array<GameCardData | null>;

export type HeroRowDropType = 'event' | 'magic' | 'potion' | 'hero-magic';

export type GraveyardVector = { offsetX: number; offsetY: number };

export type PreviewAnimationStyle = CSSProperties & {
  '--graveyard-offset-x'?: string;
  '--graveyard-offset-y'?: string;
};

export type MonsterRageInset = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type SlotPermanentBonus = {
  damage: number;
  shield: number;
};

export type DeathWardPromptState = {
  card: GameCardData;
  source: 'hand' | 'backpack';
  pendingDamage: number;
  sourceType: 'combat' | 'general';
};

export type EquipmentSlotStatModifier = EquipmentCardStatModifier;

export type EquipmentSlotBonusState = Record<EquipmentSlotId, SlotPermanentBonus>;

export type EventDiceModalState = {
  title: string;
  subtitle?: string;
  entries: EventDiceRange[];
  rolledValue: number | null;
  highlightedId: string | null;
};

export type EquipmentPromptState = {
  prompt: string;
  subtext?: string;
};

export type EventTransformState = {
  fromCard: GameCardData;
  toCard: GameCardData;
  onComplete: () => void;
  message?: string;
};

export type CardActionContext = {
  mode: 'shop' | 'event';
  action: 'delete' | 'discard';
  requiredCount: number;
  remainingCount: number;
  title?: string;
  description?: string;
  handOnly?: boolean;
};

export type MonsterRewardEffect =
  | { type: 'slotBonus'; slotId: EquipmentSlotId; bonusType: keyof SlotPermanentBonus; amount: number }
  | { type: 'gold'; amount: number }
  | { type: 'heal'; amount: number }
  | { type: 'repair'; amount: number; targets: EquipmentRepairTarget[] }
  | { type: 'drawBackpack'; amount: number }
  | { type: 'discoverClass' }
  | { type: 'discoverGraveyard' }
  | { type: 'maxHp'; amount: number }
  | { type: 'spellDamage'; amount: number };

export type MonsterRewardOption = {
  id: string;
  title: string;
  description: string;
  detail?: string;
  effect: MonsterRewardEffect;
};

export type MonsterRewardDrop = {
  monsterName: string;
  options: MonsterRewardOption[];
};

export type DungeonDropAssignment = {
  previewIndex: number;
  card: GameCardData;
  slotIndex: number;
};

export type HeroFramePosition = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type HeroRowSlotConfig = {
  id: string;
  dropZone: 'backpack' | 'other';
  render: () => ReactNode;
  wrapperClassName?: string;
  innerClassName?: string;
  innerRef?: Ref<HTMLDivElement>;
};

export type PendingHeroSkillAction =
  | { skillId: HeroSkillId; type: 'slot' }
  | { skillId: HeroSkillId; type: 'monster'; baseDamage?: number };

export type HeroMagicActivationOrigin = 'gauge' | 'card';

export type PendingHeroMagicAction =
  | {
      id: 'holy-light';
      step: 'choice';
      origin: HeroMagicActivationOrigin;
      prompt: string;
    }
  | {
      id: 'holy-light';
      step: 'monster-select';
      origin: HeroMagicActivationOrigin;
      prompt: string;
    };

export type PendingMagicAction =
  | {
      card: GameCardData;
      effect: 'armor-strike';
      step: 'slot-select';
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'armor-strike';
      step: 'monster-select';
      slotId: EquipmentSlotId;
      pendingDamage: number;
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'blood-reckoning';
      step: 'monster-select';
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'missing-hp-smite';
      step: 'monster-select';
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'eternal-repair';
      step: 'slot-select';
      prompt: string;
      echoRemaining?: number;
    }
  | {
      card: GameCardData;
      effect: 'weapon-burst';
      step: 'slot-select';
      prompt: string;
      echoMultiplier?: number;
    }
  | {
      card: GameCardData;
      effect: 'repair-one';
      step: 'slot-select';
      prompt: string;
      echoMultiplier?: number;
    }
  | {
      card: GameCardData;
      effect: 'shuffle-dungeon';
      step: 'dungeon-select';
      prompt: string;
      echoRemaining?: number;
    }
  | {
      card: GameCardData;
      effect: 'scaling-damage';
      step: 'monster-select';
      pendingDamage: number;
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'chaos-strike';
      step: 'monster-select';
      prompt: string;
      data: Record<string, unknown>;
      echoRemaining?: number;
    }
export type PendingPotionAction =
  | {
      card: GameCardData;
      effect: 'repair-equipment';
      amount: number;
      allowedTypes: EquipmentRepairTarget[];
      step: 'slot-select';
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'repair-choice';
      step: 'choice';
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'repair-choice-repair';
      amount: number;
      allowedTypes: EquipmentRepairTarget[];
      step: 'slot-select';
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'repair-choice-upgrade';
      allowedTypes: EquipmentRepairTarget[];
      step: 'slot-select';
      prompt: string;
    };

export type HeroSkillArrowState = {
  start: { x: number; y: number };
  end: { x: number; y: number };
};

export type GridMetrics = {
  gapX: number;
  gapY: number;
  padding: number;
  cardFontScale: number;
  cardStatScale: number;
  cardIconScale: number;
  cardDotSize: number;
  heroFontScale: number;
};

export type SwordVector = { left: number; top: number; angle: number; length: number };

export type Point = { x: number; y: number };

export type ClassDeckFlight = {
  id: string;
  card: GameCardData;
  start: Point;
  end: Point;
  startTime: number;
  duration: number;
  progress: number;
  arcHeight: number;
};

export type BackpackHandFlight = {
  id: string;
  card: GameCardData;
  start: Point;
  end: Point;
  startTime: number;
  duration: number;
  progress: number;
  arcHeight: number;
  delivered?: boolean;
};

export type PendingHandInsertion = {
  card: GameCardData;
  attempts: number;
  source: string;
};

export type BackpackDrawRequest = {
  reason: string;
  avoidCardIds?: string[];
};

export type AmuletAuraTotals = {
  attack: number;
  defense: number;
  maxHp: number;
};

export type ActiveAmuletEffects = {
  aura: AmuletAuraTotals;
  hasHeal: boolean;
  hasBalance: boolean;
  hasLife: boolean;
  hasGuardian: boolean;
  hasFlash: boolean;
  hasStrength: boolean;
  hasDualGuard: boolean;
  hasDiscardShock: boolean;
  hasFlipGold: boolean;
};

export type WaterfallPhase = 'idle' | 'dropping' | 'discarding' | 'dealing';

export type WaterfallAnimationState = {
  phase: WaterfallPhase;
  isActive: boolean;
  droppingSlots: number[];
  landingSlots: number[];
  discardSlot: number | null;
  dealingSlots: number[];
  sequenceId: number | null;
};

export type WaterfallPlan = {
  dropCards: GameCardData[];
  dropPreviewIndices: number[];
  dropTargetSlots: number[];
  discardCard: GameCardData | null;
  discardPreviewIndex: number | null;
  nextPreviewCards: GameCardData[];
  nextRemainingDeck: GameCardData[];
  shouldDeclareVictory: boolean;
};

export type MonsterRewardPreview = {
  id: string;
  title: string;
  description: string;
  detail?: string;
};

export type HeroStatsSummary = {
  hp: number;
  maxHp: number;
  gold: number;
  attackBonus: number;
  defenseBonus: number;
  spellDamageBonus: number;
  tempShield: number;
  permanentMaxHpBonus: number;
};

export type HeroSkillSummary = {
  id: string;
  name: string;
  description: string;
};

export type UndoTransientState = {
  monsterRewardQueue: MonsterRewardDrop[];
  activeMonsterReward: MonsterRewardDrop | null;
  selectedMonsterRewards: MonsterRewardOption[] | null;
  pendingMagicAction: PendingMagicAction | null;
  pendingPotionAction: PendingPotionAction | null;
  pendingHeroSkillAction: PendingHeroSkillAction | null;
  pendingHeroMagicAction: PendingHeroMagicAction | null;
  shopModalOpen: boolean;
  shopModalMinimized: boolean;
  shopOfferings: ShopOffering[];
  shopSourceEvent: GameCardData | null;
  shopDeleteUsed: boolean;
  shopHealUsed: boolean;
  shopLevelUpUsed: boolean;
  shopSkillDiscoverUsed: boolean;
  shopSkillSelectOpen: boolean;
  shopSkillOptions: HeroSkillDefinition[];
  discoverModalOpen: boolean;
  discoverOptions: GameCardData[];
  deleteModalOpen: boolean;
  deathWardPrompt: DeathWardPromptState | null;
  equipmentPrompt: EquipmentPromptState | null;
  graveyardDiscoverState: GameCardData[] | null;
  cardActionContext: CardActionContext | null;
  gameLogEntries: LogEntry[];
  monsterRewardPreviewCache: Record<string, MonsterRewardOption[]>;
};

export type UndoSnapshot = {
  gameState: PersistedGameState;
  transient: UndoTransientState;
};

