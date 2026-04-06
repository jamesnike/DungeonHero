import type { CSSProperties, ReactNode, Ref } from 'react';

import type {
  EquipmentCardStatModifier,
  EventDiceRange,
  GameCardData,
} from '../GameCard';
import type { HeroSkillId, HeroSkillDefinition } from '@/lib/heroSkills';
import type { ShopOffering } from '../ShopModal';
import type { LogEntry } from '../GameLogPanel';
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
  slotBlocksThisTurn: Record<EquipmentSlotId, boolean>;
};

export type EquipmentSlotId = 'equipmentSlot1' | 'equipmentSlot2';

export type FlightSourceHint = EquipmentSlotId | 'amulet';

export type EquipmentItem = GameCardData & {
  type: 'weapon' | 'shield' | 'monster';
  fromSlot?: EquipmentSlotId;
};

export type EquipmentRepairTarget = 'weapon' | 'shield' | 'monster';

export type AmuletItem = GameCardData & { type: 'amulet'; fromSlot?: 'amulet' };

export type DragOrigin = 'hand' | 'dungeon' | 'backpack' | 'amulet' | EquipmentSlotId;

export type ActiveRowSlots = Array<GameCardData | null>;

export type HeroRowDropType = 'event' | 'magic' | 'potion' | 'hero-magic' | 'building';

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

export type SlotTempArmorState = Record<EquipmentSlotId, number>;

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

export type CardActionKeyword = 'discard-recycle' | 'discard-only' | 'recycle-only' | 'delete' | 'move-to';

export type CardActionContext = {
  mode: 'shop' | 'event';
  keyword: CardActionKeyword;
  requiredCount: number;
  remainingCount: number;
  title?: string;
  description?: string;
  handOnly?: boolean;
  moveToDestination?: 'recycle-bag' | 'graveyard';
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
  | { type: 'spellDamage'; amount: number }
  | { type: 'spellLifesteal'; amount: number }
  | { type: 'stunCap'; amount: number }
  | { type: 'backpackCapacity'; amount: number };

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
  /** Same as GameCardData.id; used to dedupe rewards when defeat fires twice (e.g. double discard-zap). */
  monsterInstanceId?: string;
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
    }
  | {
      id: 'revive-blessing';
      step: 'slot-select';
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
      echoMultiplier?: number;
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
      /** `shuffle-dungeon` 仅旧存档兼容，新逻辑一律置于牌堆底、不打乱牌堆 */
      effect: 'return-dungeon-bottom' | 'shuffle-dungeon';
      step: 'dungeon-select';
      prompt: string;
      echoRemaining?: number;
    }
  | {
      card: GameCardData;
      effect: 'dungeon-swap-select';
      step: 'dungeon-select';
      prompt: string;
      leftIdx: number;
    }
  | {
      card: GameCardData;
      effect: 'scaling-damage';
      step: 'monster-select';
      /** 刺击基数（未加永久法术加成、未乘回响） */
      pendingDamage: number;
      echoMultiplier?: number;
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
  | {
      card: GameCardData;
      effect: 'soul-swap';
      step: 'slot-select';
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'soul-swap';
      step: 'monster-select';
      slotId: EquipmentSlotId;
      slotDurability: number;
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'temp-armor';
      step: 'slot-select';
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'dungeon-preview-swap';
      step: 'dungeon-select';
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'dungeon-preview-swap';
      step: 'preview-select';
      selectedActiveSlot: number;
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'grant-revive';
      step: 'slot-select';
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'missile-bolt';
      step: 'monster-select';
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'stun-strike';
      step: 'monster-select';
      prompt: string;
      echoMultiplier?: number;
      data?: { baseDmg: number; stunPct: number };
    }
  | {
      card: GameCardData;
      effect: 'fate-swap';
      step: 'dungeon-select';
      prompt: string;
      deckDepth: number;
    }
  | {
      card: GameCardData;
      effect: 'fate-sight';
      step: 'monster-select';
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'honor-sweep';
      step: 'slot-select';
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'armor-stun-convert';
      step: 'slot-select';
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'overkill-upgrade';
      step: 'monster-select';
      prompt: string;
      data: Record<string, unknown>;
      echoRemaining?: number;
    }

/** 天眼审判：透视 + 击晕判定（关闭弹窗后掷骰） */
export type DeckPeekModalStateFateSight = {
  mode?: 'fate-sight';
  peekedCards: GameCardData[];
  monsterCount: number;
  stunChance: number;
  targetMonsterName: string;
};

/** 命数裁断等：仅翻看主牌堆顶，用于判定删牌数量 */
export type DeckPeekModalStateDeckJudge = {
  mode: 'deck-judge-delete';
  peekedCards: GameCardData[];
  monsterCount: number;
  /** 与 monsterCount 相同；展示「将删除 N 张」 */
  deleteCount: number;
};

/** 万象探知：翻看牌堆顶并根据类型获得增益 */
export type DeckPeekModalStateDungeonInsight = {
  mode: 'dungeon-insight';
  peekedCards: GameCardData[];
  gains: DungeonInsightGain[];
};

export type DungeonInsightGain = {
  label: string;
  count: number;
};

export type DeckPeekModalState = DeckPeekModalStateFateSight | DeckPeekModalStateDeckJudge | DeckPeekModalStateDungeonInsight;

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
    }
  | {
      card: GameCardData;
      effect: 'perm-slot-damage+1' | 'perm-slot-damage+2';
      step: 'slot-select';
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'perm-equipment-durability-max+1' | 'perm-equipment-durability-max+2';
      step: 'slot-select';
      prompt: string;
    }
  | {
      card: GameCardData;
      effect: 'perm-slot-capacity+1';
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

/** 深层交织：地城牌与牌堆牌双向交换飞行动画 */
export type FateSwapFlight = {
  id: string;
  card: GameCardData;
  start: Point;
  end: Point;
  startTime: number;
  duration: number;
  progress: number;
  arcHeight: number;
};

/** 护盾反弹 / Boss 反噬 / 奥术之刃附魔：纯表现用定向抛物线投射（伤害由结算逻辑另行应用） */
export type DirectedCombatFxFlight = {
  id: string;
  kind: 'shield-reflect' | 'boss-retaliation' | 'arcane-blade-spell';
  start: Point;
  end: Point;
  startTime: number;
  duration: number;
  progress: number;
  arcHeight: number;
};

/** 雷霆符印：从护符栏飞向目标怪物的投射物动画 */
export type DiscardShockFlight = {
  id: string;
  targetMonsterId: string;
  start: Point;
  end: Point;
  startTime: number;
  duration: number;
  progress: number;
  arcHeight: number;
  delivered?: boolean;
  damage: number;
  pulses: number;
  projectileImage?: string;
  showBanner: boolean;
};

/** Card flying from hand/board to graveyard or backpack (recycle bag). */
export type DiscardFlight = {
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
  lifeOverkillBonus: number;
  hasCatapult: boolean;
  hasFlash: boolean;
  hasStrength: boolean;
  hasDualGuard: boolean;
  hasDiscardShock: boolean;
  hasFlipGold: boolean;
  hasRecycleForge: boolean;
  hasLoneCard: boolean;
  hasEquipmentSalvage: boolean;
  hasBloodrageAttack: boolean;
  hasPersuadeOnTempAttack: boolean;
  hasPersuadeGrantRecycleFetch: boolean;
  hasDamageClassDiscover: boolean;
  hasPersuadeGraveyardStack: boolean;
  hasStunRecycleToHand: boolean;
  hasCardGainUpgrade: boolean;
  hasAttackPersuadeDiscount: boolean;
  hasCardGainMissile: boolean;
};

export type WaterfallPhase = 'idle' | 'dropping' | 'discarding' | 'dealing';

/** 预览区被挤掉的卡：弃置→坟场 / 回收→回收袋 / 回主牌堆（动画目标不同） */
export type WaterfallDiscardDestination = 'graveyard' | 'recycle-bag' | 'deck';

export type WaterfallAnimationState = {
  phase: WaterfallPhase;
  isActive: boolean;
  droppingSlots: number[];
  landingSlots: number[];
  discardSlot: number | null;
  /** 与 `discardSlot` 同时有效；决定飞向坟场还是牌库按钮 */
  discardDestination: WaterfallDiscardDestination;
  dealingSlots: number[];
  sequenceId: number | null;
};

export type WaterfallPlan = {
  dropCards: GameCardData[];
  dropPreviewIndices: number[];
  dropTargetSlots: number[];
  discardCard: GameCardData | null;
  discardPreviewIndex: number | null;
  /** 与 `handleWaterfallDiscardComplete` 路由一致，供挤掉动画选用 */
  discardDestination: WaterfallDiscardDestination;
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
  spellLifesteal: number;
  tempShield: number;
  permanentMaxHpBonus: number;
  stunCap: number;
};

export type HeroSkillSummary = {
  id: string;
  name: string;
  description: string;
};


