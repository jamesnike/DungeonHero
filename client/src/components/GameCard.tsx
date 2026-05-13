import { useState, useEffect, useRef, memo, lazy, Suspense, type CSSProperties } from 'react';
import { useGameState } from '@/hooks/useGameEngine';
import { Card } from '@/components/ui/card';
import {
  Skull,
  Sword,
  Shield,
  Heart,
  Sparkles,
  Zap,
  Scroll,
  Infinity,
  Wand2,
  X,
  ArrowBigUpDash,
} from 'lucide-react';
import {
  initMobileDrag,
  initMobileDrop,
  setHtml5DragFallback,
  clearHtml5DragFallback,
  readHtml5DragData,
} from '../utils/mobileDragDrop';
import { useGameViewport } from '@/contexts/GameViewportContext';
import { FLAT_ASPECT_RATIO } from './game-board/constants';
import {
  CuteSticker,
  EventNameLeftGlyph,
  EventTitleBand,
  eventTitleSideSlotClass,
  MagicNameLeftGlyph,
  MagicTitleBand,
  tintForKey,
} from './MagicNameFlankIcons';
import { resolveMagicPatternKey } from '@/lib/magicPatternKey';
import { resolveEventPatternKey } from '@/lib/eventPatternKey';
import { getOnEnterHandShortLabel } from '@/game-core/card-schema/on-enter-hand';
import { STARTER_CARD_IDS, getStarterBaseId } from '@/game-core/deck';
import { computeDamageMagicDisplayPure, type DamageMagicDisplay } from '@/game-core/helpers';
import { computeMaxHp } from '@/game-core/rules/magic-effects';

const MonsterDeathLottie = lazy(() => import('@/components/effects/MonsterDeathLottie'));

const MAX_DURABILITY_DOTS = 4;
const BASE_CARD_WIDTH = 180;
const CARD_SCALE_MIN = 0.6;
const CARD_SCALE_MAX = 1.4;
/** 魔法标题：仅当标题区估出来不足约这么多个全角字宽时，才隐藏左侧纹样（与事件卡一致，无卷轴 PNG） */
const MAGIC_TITLE_MIN_CHARS_FOR_GLYPH = 7;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 与 eventTitleSideSlotClass 的 rem 档位一致；用实例缩放估侧栏占位 */
function boardTitleGlyphWouldCrowdName(
  cardWidthPx: number,
  isFlat: boolean,
  isCompact: boolean,
): boolean {
  if (cardWidthPx <= 0) return false;
  const raw = cardWidthPx / BASE_CARD_WIDTH;
  const inst = clamp(raw, CARD_SCALE_MIN, CARD_SCALE_MAX);
  const slotRem = isFlat ? 1.15 : isCompact ? 1.25 : 1.65;
  const slotPx = slotRem * 16 * inst;
  const gutterPx = 14;
  const titlePx = Math.max(0, cardWidthPx - 2 * slotPx - gutterPx);
  const titleFontPx = Math.max(7, 11.5 * inst);
  const cjkCharPx = titleFontPx * 1.0;
  return titlePx < MAGIC_TITLE_MIN_CHARS_FOR_GLYPH * cjkCharPx;
}

export type CardType =
  | 'monster'
  | 'weapon'
  | 'shield'
  | 'potion'
  | 'amulet'
  | 'magic'
  | 'hero-magic'
  | 'curse'
  | 'event'
  | 'building'
  | 'skill'
  | 'coin';

/**
 * Curse subtype — distinguishes the two curse cards. Curse cards have their
 * own top-level `type: 'curse'` (they are NOT magic cards). They cannot be
 * recycled, discarded to the graveyard, or removed by any forced-discard
 * effect. After being played they return to the player's backpack.
 */
export type CurseEffectId = 'blood-curse' | 'greed-curse' | 'frenzy-curse';

export type EquipmentCardStatModifier = {
  appliesTo: 'weapon' | 'shield' | 'monster';
  modifier: number;
  shieldModifier?: number;
  permanentShieldBonus?: number;
  /**
   * Number of equipped 闪光符 amulets. Display divides effective attack by `2^flashCount`,
   * matching combat resolution where each flash compounds independently.
   */
  flashCount?: number;
};

export type PotionEffectId =
  | 'heal-5'
  | 'heal-7'
  | 'repair-weapon-2'
  | 'repair-weapon-3'
  | 'boost-both-slots'
  | 'perm-both-slots-shield+1'
  | 'repair-choice'
  | 'draw-backpack-4'
  | 'discover-class-3'
  | 'discover-class-magic'
  | 'perm-spell-damage'
  | 'perm-backpack-size'
  | 'left-slot-durability-max+1'
  | 'right-slot-durability-max+1'
  | 'perm-spell-damage-2'
  | 'dice-backpack-expand'
  | 'dice-arcane-infusion'
  | 'heal-14'
  | 'discover-graveyard-magic'
  | 'perm-slot-damage+1'
  | 'perm-slot-damage+2'
  | 'perm-equipment-durability-max+1'
  | 'perm-equipment-durability-max+2'
  | 'perm-spell-damage+2'
  | 'perm-spell-lifesteal+1'
  | 'perm-spell-lifesteal+2'
  | 'perm-stun-cap+10'
  | 'perm-slot-capacity+1'
  | 'perm-hand-limit+1'
  | 'perm-hand-limit+2'
  | 'perm-backpack-size+2'
  | 'perm-backpack-size+3'
  | 'perm-backpack-size+5'
  | 'swap-slot-damage-shield'
  | 'spell-lifesteal+1-maxhp+6'
  | 'equip-swap'
  | 'hand-limit+1'
  | 'perm-waterfall-deal+1'
  | 'grant-perm-2'
  | 'perm-persuade-consecutive'
  | 'grant-lastwords-slot-temp-buff'
  | 'amulet-to-eternal-relic'
  | 'grant-amulet-end-turn-draw'
  | 'grant-eternal-relic-equip-overclock'
  | 'grant-eternal-relic-summon-frenzy'
  | 'perm-equip-empower'
  | 'transform-recycle-grant'
  | 'amplify-target-wide'
  | 'grant-weapon-stun-chance+40'
  | 'heal-12-draw-2';

export type AmuletEffectId =
  | 'heal'
  | 'balance'
  | 'life'
  | 'catapult'
  | 'flash'
  | 'strength'
  | 'dual-guard'
  | 'discard-zap'
  | 'flip-zap'
  | 'flip-gold'
  | 'recycle-forge'
  | 'lone-card'
  | 'equipment-salvage'
  | 'bloodrage-attack'
  | 'self-damage-draw'
  | 'persuade-on-temp-attack'
  | 'persuade-grant-recycle-fetch'
  | 'damage-class-discover'
  | 'magic-class-discover'
  | 'persuade-graveyard-stack'
  | 'stun-recycle-to-hand'
  | 'attack-persuade-discount'
  | 'card-gain-missile'
  | 'swap-upgrade'
  | 'stun-upgrade-cap'
  | 'recycle-backpack-expand'
  | 'dungeon-gold'
  | 'monster-kill-upgrade'
  | 'end-turn-draw'
  | 'stun-rate-boost'
  | 'armor-halve-endure'
  | 'monster-equip-buff'
  | 'lastwords-monster-debuff'
  | 'stun-gold'
  | 'flip-overkill-lifesteal'
  | 'equip-amulet-cap'
  | 'stun-attempt-discover'
  | 'persuade-on-flip'
  | 'delete-draw'
  | 'last-words-extra-trigger'
  | 'kill-cell-mine'
  | 'manual-recycle-draw'
  | 'mirror-copy-summon';

export type AmuletAuraBonus = {
  attack?: number;
  defense?: number;
  maxHp?: number;
};

export type HeroMagicId = 'holy-light' | 'berserker-rage' | 'monster-doom' | 'revive-blessing';

export type EventRequirement =
  | { type: 'equipment'; slot: 'left' | 'right'; message?: string }
  | { type: 'equipmentAny'; message?: string }
  | { type: 'amulet'; message?: string }
  | { type: 'hand'; min: number; message?: string }
  | { type: 'cardPool'; pools: Array<'hand' | 'backpack'>; min: number; message?: string }
  | { type: 'graveyard'; min: number; message?: string }
  | { type: 'gold'; min: number; message?: string }
  | { type: 'leftmostIsEnraged'; message?: string }
  | { type: 'shopLevel'; min: number; message?: string }
  | { type: 'persuadeLevel'; min: number; message?: string }
  | { type: 'handUpgraded'; min: number; message?: string }
  | { type: 'recycleBag'; min: number; message?: string }
  /**
   * 「右翼回响」option 1 — at least 1 hand card without `topOnRecycleRestore`.
   * Used to grey-out 选项 when no eligible hand card exists.
   */
  | { type: 'handForKeywordGrant'; keyword: 'topOnRecycleRestore' | 'onEnterHandEffect'; message?: string }
  /**
   * 「右翼回响」option 6 — at least 1 equipped item (slot1 or slot2) without
   * `onEquipEffect`. Used to grey-out 选项 when no eligible equipment exists.
   * Reserves are excluded by design.
   */
  | { type: 'equippedForOnEquipGrant'; message?: string };

export type EventEffectExpression = string | string[];

export interface EventDiceRange {
  id: string;
  range: [number, number];
  label: string;
  effect: EventEffectExpression;
  skipFlip?: boolean;
}

export interface EventChoiceDefinition {
  id?: string;
  text: string;
  effect?: EventEffectExpression;
  requires?: EventRequirement[];
  diceTable?: EventDiceRange[];
  hint?: string;
  requiresDisabledChoices?: string[];
  requiresDisabledReason?: string;
  skipFlip?: boolean;
}

export type CardFlipDestination = 'backpack' | 'hand' | 'graveyard' | 'stay';

export type CardFlipTarget = {
  toCard: GameCardData;
  destination?: CardFlipDestination;
  banner?: string;
  message?: string;
};

export interface GameCardData {
  id: string;
  type: CardType;
  name: string;
  value: number;
  image?: string;
  effect?: 'health' | 'attack' | 'defense'; // Legacy amulet bonuses
  amuletEffect?: AmuletEffectId;
  amuletAuraBonus?: AmuletAuraBonus;
  magicType?: 'instant' | 'permanent'; // For magic cards
  magicEffect?: string; // Description of magic effect
  heroMagicId?: HeroMagicId;
  heroMagicEffect?: string;
  skillType?: 'instant' | 'permanent'; // For class skills
  skillEffect?: string; // Description of skill effect
  eventChoices?: EventChoiceDefinition[]; // For event cards
  /** @deprecated Use `card.type === 'curse'` instead. Kept only for legacy reads — new curse cards no longer set this. */
  isCurse?: boolean;
  /** Identifies which curse card this is. Only set when `type === 'curse'`. */
  curseEffect?: CurseEffectId;
  // Monster-specific properties
  monsterType?: string; // Base type for rage lookup (Dragon, Skeleton, etc.)
  monsterSpecial?: string; // Special champion ability tag (ember-fury, bone-regen, etc.)
  monsterSpecialDesc?: string; // Elite ability description (preserved independently of `description`)
  specialAttackBoost?: number; // Cumulative attack boost from bleedEffect
  tempAttackBoost?: number; // Temporary attack boost, cleared at next waterfall
  tempHpBoost?: number; // Temporary HP/maxHP boost, cleared at next waterfall
  hasRevive?: boolean; // Monster revives once at 1 HP layer on first death
  reviveUsed?: boolean; // Whether the revive has already been consumed
  /**
   * Set by `reduceMonsterDefeated` once Branch C (actual defeat) has run.
   * The monster card stays in `activeCards` for ~950ms while the defeat
   * animation plays, so a second `MONSTER_DEFEATED` for the same id (e.g. a
   * combo move that drains layers AND deals damage in one play) would
   * otherwise re-run the entire defeat branch — duplicating reward
   * generation, monstersDefeated counter, buglet drops, etc. This flag
   * makes that second pass a no-op. It is naturally cleared when the card
   * is removed from `activeCards`.
   */
  defeatProcessed?: boolean;
  lastWords?: string; // Death trigger effect ID (fires on actual death, not revive)
  bleedEffect?: string; // Bleed keyword: triggers on every layer lost (e.g. 'attack+1', 'attack+3')
  eliteRegenHeroTurn?: boolean; // Elite dragon: restore 1 layer if hero turn ends without layer loss
  enterEffect?: string; // On-enter keyword: triggers when card enters the active dungeon row
  eliteDoubleAttack?: boolean; // Elite ogre: 50% chance to attack twice
  onAttackEffect?: string; // On-attack keyword: triggers every time this monster attacks (e.g. 'steal-gold-2')
  eliteLowGoldPower?: boolean; // Elite goblin: double attack & HP when player gold <= 10
  lowGoldBuffActive?: boolean; // Whether the low-gold buff is currently applied
  isBuglet?: boolean; // Swarm-spawned buglet token (prevents infinite spawn loops)
  swarmSpawn?: boolean; // Swarm race passive: spawn buglet when a dungeon card is processed
  attack?: number; // Monster attack value
  hp?: number; // Monster current HP
  maxHp?: number; // Monster original HP
  fury?: number; // Fury (formerly hpLayers) - number of rage layers
  hpLayers?: number; // Deprecated: kept for compatibility, aliases to fury
  currentLayer?: number; // Deprecated: kept for compatibility, mapped from fury
  rageTurn?: number; // Turn number used to calculate rage
  layerShift?: number; // Visual shift amount (0-4)
  waterfallEffect?: { type: string; amount: number; description: string };
  baseAttack?: number; // Original attack before waterfall upgrades
  baseHp?: number; // Original HP before waterfall upgrades
  // Equipment durability
  durability?: number; // Current durability for weapons/shields
  maxDurability?: number; // Maximum durability for weapons/shields
  armor?: number; // Current armor HP for shields (like monster hp)
  armorMax?: number; // Max armor HP per durability layer for shields (like monster maxHp)
  armorBonusDamaged?: number; // How much of the permanent shield bonus has been consumed by damage
  weaponDurabilitySaveChance?: number; // % chance to not consume durability on attack
  damageReflect?: number; // Damage reflected back to attacker when blocking
  shieldPerfectBlockSaveChance?: number; // % chance to save durability on perfect block
  shieldPerfectBlockArmorSaveChance?: number; // % chance to save armor (no armor deduction this block) on perfect block
  perfectBlockSpawnMissiles?: number; // 弹幕护盾: on perfect block, spawn N 魔弹 cards directly to hand (hand-full → silently skip)
  shieldPerfectBlockMaxHpGain?: number; // 砺心之盾: on perfect block, permanently raise hero maxHp by N (cap-only, does NOT heal current hp). Stacks per perfect block.
  shieldBashStunRate?: number; // Per-armor-point stun % when shield-bashing a monster (e.g. 5 → 5% × armor)
  shieldBashUnlimited?: boolean; // Shield bash has no per-turn limit; can bash as long as durability remains
  reflectHalfDamage?: boolean; // Reflect half of incoming attack damage back to attacker
  reflectFullDamage?: boolean; // Reflect full incoming attack damage back to attacker (takes precedence over reflectHalfDamage; e.g. 棘刺反盾 L2)
  // Class card properties
  classCard?: boolean; // Marks as a class card
  /**
   * 「唯一」标记：本局已有同 baseId 实例时，后续 sampling（discover / draw /
   *  shop refresh / event grant）全部过滤掉。语义见 `game-core/uniqueClass.ts`。
   *  目前只有 class deck 卡用，但字段提升到 `GameCardData` 上，让消费方
   *  （ClassDeck / CardDetailsModal 等）能在不窄化类型的前提下读取。
   */
  unique?: boolean;
  /**
   * 「不可复制」标记：`镜影摹形` (knight:mirror-copy) 弹窗不会把带此标记的
   * 卡列为候选。设计上挡住会导致「无限堆雪球」的卡：
   *   - 影摹召引符（amulet）：复制后两份累加 streak，每抽 6/4 张又产新「镜影摹形」
   *   - 专属感召（starter perm magic）：复制后能再发现一张专属卡进手牌
   *   - 回收灵焰（knight perm magic）：每复制一份，下一次回收/抽牌量翻倍
   *   - 洗册归川（knight perm magic）：背包→回收袋的结构性副作用复制一份会乱状态
   *   - 回收余韵（starter perm magic）：复制后回收袋洗回背包 + 抽牌量翻倍，
   *     跟回收灵焰同款雪球
   *
   * 渲染：`GameCard.tsx` 在 magic / equipment / potion / amulet 三个 keyword
   * 槽位画 `dh-card__keyword-tag--nocopy`「不可复制」标签（与「置顶」位置等同）。
   * 数据来源：`game-core/__tests__/non-copyable-deck-snapshot.test.ts` 锁住
   * exact set，新增 / 误删时 CI 立刻 fail。
   */
  nonCopyable?: boolean;
  knightEffect?: string; // Effect dispatch key (used by class cards and some main-deck magic)
  /** 损毁或强制弃置时进入回收袋，经 recycleDelay 次瀑流回背包（与永久法术共用回收区） */
  permEquipment?: boolean;
  description?: string; // Card effect description (shown in detail modal & tooltips — full text)
  /**
   * 卡面短描述：卡牌 UI 上展示的极简版描述（省略 corner case / 触发条件细节）。
   * 渲染优先级：shortDescription > description。
   * 详情弹窗（CardDetailsModal）与 hover tooltip 始终读取 `description` 完整版。
   */
  shortDescription?: string;
  /**
   * Event 卡专用：仅显示「特殊位置 / 状态触发条件」的简短文案。
   * 不写翻转结果、不写选项含义——那些归 eventChoices 自己说明。
   * 仅在 type === 'event' 时被卡面 UI 读取（CardDetailsModal / log 仍使用 description）。
   */
  specialTrigger?: string;
  potionEffect?: PotionEffectId;
  flipTarget?: CardFlipTarget;
  /**
   * 随机翻转候选池：处理后从此数组中按 RNG 随机挑一个作为最终 `flipTarget`。
   * 用于「奥能裂变」这类「50% 翻转为 X / 50% 翻转为 Y」的事件。
   * 优先级：本字段非空时 `reduceCompleteEvent` 会忽略静态 `flipTarget` 并用此随机选。
   * 仅在卡牌处理瞬间被消费一次，结果写入 patch 的 `flipTarget` 后正常走 APPLY_CARD_FLIP。
   */
  flipTargetCandidates?: CardFlipTarget[];
  flipCondition?: string;
  _flipBackCard?: GameCardData;
  scalingDamage?: number; // Self-scaling damage for permanent magic cards
  recycleDelay?: number; // Waterfalls to wait in recycle bag before restoring (default 1)
  /**
   * 「置顶」关键词：从回收袋洗回背包的瞬间（任意 recycle→backpack 路径——
   * waterfall 自动 -1 / 幽魂净化 / 回收余韵 / 回收灵焰 / 虚空置换 / 洗册归川 /
   * 通用 RESTORE_RECYCLE_BAG），自动 prepend 到 `backpackItems[0]`（背包第 1 格），
   * 让玩家立刻能在背包最显眼位置看到它。
   *
   * 容量语义：仍然占 backpack 容量配额——背包满时跟普通卡一样无法洗回，
   * 自然也不触发置顶（这一帧留在回收袋，下次瀑流再算）。
   *
   * 集中分流点：`game-core/cards.ts` `processRecycleBag`。所有 caller 应使用
   * `recycleResult.patch` 自动 merge backpackItems（含置顶卡 prepend），不要
   * 手写 `patch.backpackItems = [...state.backpackItems, ...recycleResult.restored]`，
   * 那样会丢掉「置顶 → 第 1 格」的 prepend 顺序。
   *
   * 视觉：第一阶段沿用 `waterfall:recycleRestored` 绿环动画（payload.cards 含全部
   * restored，包括置顶卡）；第二阶段 `card:promotedToDeckTop` side effect 给
   * banner / log 用（事件名是历史命名，当前语义=「置顶到背包顶」）。
   */
  topOnRecycleRestore?: boolean;
  /**
   * 凡化咒标记：表示此牌的 Perm 属性已被剥离。
   * 仍保留 magicType（用于法术效果路由），但 cardHasPermFlag、回收袋判定、UI 标识等都视为非 Perm。
   * 使用后进坟场而非回收袋；可被「永恒铭刻」/「永恒铭刻药」重新赋予 Perm（清除此标记）。
   */
  permStripped?: boolean;
  _recycleWaits?: number; // Internal: remaining waterfalls before this card leaves the recycle bag
  /**
   * Multiplayer-only marker: this card is **not** part of the synchronized
   * shared-suffix portion of `remainingDeck`. Set on:
   *
   *   1. Cards that arrived via `MULTIPLAYER_RECEIVE_TRANSFER` (the peer's
   *      waterfall pushed them onto our deck top).
   *   2. Waterfall discards that re-enter the deck (e.g. `returnToDeck` /
   *      `swarmInfest`) — they originated locally, so they must be marked
   *      excluded so the next peer-sync pass doesn't accidentally pretend
   *      they were drawn from the shared pool.
   *
   * Cards without this flag are part of the shared deck suffix and must be
   * counted toward shared-consume / shared-shrink invariants. Single-player
   * mode never sets this; safe to read as `false` everywhere outside the
   * multiplayer reducer paths.
   *
   * See `.cursor/plans/2-player_multiplayer_mode_*.plan.md` (Phase 2) for the
   * shared-suffix data model.
   */
  _excludedFromShared?: boolean;
  onDestroyHeal?: number; // Heal this amount when equipment is destroyed
  onDestroyGold?: number; // Gain this much gold when equipment is destroyed
  onEquipEffect?: string; // Trigger effect when this equipment is first equipped (入场)
  onDestroyEffect?: string; // General last-words effect when equipment is destroyed (遗言)
  /**
   * 遗赠淬炼药: number of times this potion has been applied to the equipment.
   * On destruction, fires `slot-temp-buff-3-3 × lastWordsSlotTempBuff` (each
   * stack contributes +3 temp attack and +3 temp armor to the slot). Stacks
   * ON TOP of any existing onDestroyEffect (e.g. Iron Shield's
   * graveyard-to-hand) without overwriting it, and accumulates across multiple
   * potion uses on the same equipment.
   */
  lastWordsSlotTempBuff?: number;
  /**
   * 附魔祭坛 「遗言：生命值上限+4」: number of stacks granted to this equipment.
   * On destruction (durability → 0), fires `+4 maxhpperm × lastWordsMaxHpBoost`
   * (each stack contributes +4 to permanent maxHp). Stacks across multiple grants
   * on the same equipment, parallel to `lastWordsSlotTempBuff`. Does NOT heal
   * current HP — only raises the cap.
   */
  lastWordsMaxHpBoost?: number;
  /**
   * 「奥能裂变」事件 outcome 1: 装备销毁时手牌 +N 张「魔弹」(满手 → 背包 → 回收袋 溢出顺序)。
   * 跟 `lastWordsSlotTempBuff` / `lastWordsMaxHpBoost` 一样，多次赋予可叠加（数字相加），
   * 跟其它 `onDestroyEffect` 并存（不互斥）。在 `equipment-effects.ts:applyOneEquipmentLastWordsIteration`
   * 触发，复用 `applyGainMagicBolts` helper（与 `gainBolts:N` event token 完全一致的语义）。
   */
  lastWordsGainBolt?: number;
  /** 上手关键词：当此卡进入手牌时（抽牌、坟场/回收袋/装备栏回手、卡牌翻面等）自动触发的效果 ID。 */
  onEnterHandEffect?: string;
  /** 内部标记：进入手牌时跳过 onEnterHandEffect 触发（用于克隆/复制/初始发牌等不应触发的来源）。 */
  _skipOnEnterHand?: boolean;
  /**
   * Display-only flag: 强制显示卡面右上角「翻转」徽章，即使 `flipTarget` 未设置。
   * 用于「会通过非标准管线翻转」的卡（如「增幅仪式」通过 useEventSystem.ts 的
   * `triggerEventTransform` 把自己变成「增幅祭坛」幽灵建筑——不走 APPLY_CARD_FLIP）。
   * 加 `flipTarget` 占位会让 乾坤一翻 / 万象齐转 / starterActiveRowFlip 误把它当成
   * 可翻转目标，所以用这个 display-only flag 让徽章显示但不污染翻转目标判定。
   */
  _showFlipBadge?: boolean;
  /** 翻转之契 option 6 — 该装备每次卡牌翻转时恢复 1 耐久。绑定在装备卡上，跟随装备进入 reserve / 主槽。 */
  _flipRepairBuff?: boolean;
  /** 「雷震淬刃药」标记：此武器被该药剂加强过；UI 在卡牌上显示「击晕 X%」keyword tag。仅作为来源标记，X 直接读 weaponStunChance 总值。 */
  _potionStunBonusApplied?: boolean;
  /**
   * 「生长之盾」类装备效果：每当发生一次卡牌翻转，且此卡当前装备在主槽中时，
   * 触发一次 AMPLIFY_CARDS_BY_NAME(cardName, +1)，所有同名副本累计共享 +1 攻击/护甲。
   * 仅在主槽（equipmentSlot1/2）触发，reserve/手牌/坟场等位置不触发。
   */
  amplifyOnFlip?: boolean;
  onDiscardDamage?: number; // Base spell damage dealt to random monster when discarded
  onDiscardDraw?: number; // Draw this many cards from backpack when discarded
  critChance?: number; // % chance to deal double damage on attack
  restoreDurabilityOnKill?: boolean; // Restore full durability when killing a monster
  healOnAttack?: number; // Heal this amount each time this weapon attacks
  drawOnAttack?: number; // Draw N cards from backpack each time this weapon attacks (mirrors healOnAttack semantics — fork attacks chain re-trigger; equip-overclock multiplies)
  onAttackBuffOtherSlotTempAttack?: number; // Give the OTHER equipment slot +N temp attack on each attack
  onAttackRepairOtherSlot?: number; // Restore N durability to the OTHER equipment slot on each attack
  onAttackDebuffAllMonsterAttack?: number; // Reduce ALL active row monsters' attack by N on each attack
  onAttackAmplifyMissileGenerate?: boolean; // After each attack: amplify '魔弹' +1 globally and add a (newly amplified) bolt to backpack (overflow → recycle bag)
  onAttackAmplifyMissileGenerateCount?: number; // Override # of bolts spawned per overkill (default 1; e.g. 魔弹连弩 L2 sets to 2)
  daggerSelfDestructDiscover?: boolean; // 匕首: after attack, optionally destroy weapon to discover class cards (1 per remaining durability)
  ghostBladeExile?: boolean; // 虚灵刀: after each attack, offer to exile cards from graveyard
  postAttackHandRecycle?: boolean; // After each attack, optionally move a hand card to recycle bag and draw one
  weaponExtraAttack?: number; // This weapon's slot gets N extra attacks per hero turn
  postAttackSpellDamage?: number; // After attacking, deal this much spell damage (boosted by spell damage bonus) to a random monster
  healOnKill?: number; // Heal this amount when this weapon kills a monster
  waterfallAttackBoost?: number; // Increase weapon's own attack by this amount each waterfall
  waterfallTempArmor?: number; // On each waterfall, grant this much temporary armor to the wearing slot
  killGoldScaling?: boolean; // Weapon gives increasing gold per kill (counter starts at 1, increments each kill)
  killGoldCounter?: number; // Current gold bonus for next kill with this weapon
  persuadeBoostOnHit?: number; // On any monster hit (including kill, including elite), add this % to the global persuadeAmuletBonus ("下次劝降率" buff)
  weaponStunChance?: number; // Flat stun % from weapon (uses max of this and hero stun, then capped by stunCap)
  doubleDamageOnStunned?: boolean; // Deal double damage when attacking stunned monsters
  overkillDraw?: number; // Draw this many cards from backpack on each overkill hit
  overkillRecycleToHand?: number; // Move this many cards from recycle bag to hand on each overkill hit
  overkillAmplifyMissile?: number; // On each overkill hit, amplify all 魔弹 cards by this amount
  onDestroyPermanentDamage?: number; // Add permanent damage to slot when this equipment is destroyed
  onDestroyPermanentShield?: number; // Add permanent armor to slot when this equipment is destroyed
  shieldBlockAutoUpgradeCount?: number; // Auto-upgrade shield after this many blocks
  _shieldBlockCount?: number; // Internal counter for blocks performed
  shieldExtraBlocksPerDurability?: number; // Extra armor-depleted blocks before losing 1 durability
  equipBlockDurabilityBonus?: number; // Per-equipment bonus to blockDurabilityPerSlot (how many durability can be consumed per monster turn)
  shieldRefillOnMonsterDeath?: boolean; // Restore 1 durability when the attacking monster dies after its attack (e.g. layer drop to 0)
  _shieldDurabilityBlockCounter?: number; // Runtime counter for extra-block durability tracking
  // 铁壁塔盾 fullBlock effect — one-time use per equip. Set to `true` after the
  // first attack > current armor triggers the "convert overflow to 0" behavior.
  // Stripped on equip (SET_EQUIPMENT_SLOT) so each fresh equip restores the
  // one use. See `combat.ts:reduceResolveBlock` and the `iron-tower-fullblock-one-time` test.
  _fullBlockUsed?: boolean;
  _counterDisplay?: string; // Dynamic counter text shown on card (e.g. "2/5")
  blockGrantTempArmorToOther?: boolean; // On block, grant temp armor equal to shield value to other slot
  onDestroyDraw?: number; // Draw this many cards from backpack when this equipment is destroyed
  onDestroyClassDraw?: number; // Draw this many class cards to backpack when this equipment is destroyed
  hasEquipmentRevive?: boolean; // Non-monster equipment has revive (first destruction → 1 durability)
  equipmentReviveUsed?: boolean; // Whether the equipment revive has been consumed
  isMinionCard?: boolean;
  // Boss monster properties
  isFinalMonster?: boolean; // Last monster in the deck — transforms into boss on defeat
  bossPhase?: boolean; // Monster has transformed into boss form
  bossRetaliationDamage?: number; // Direct damage to hero (ignoring shields) each time boss takes a hit
  bossLastStandAura?: boolean; // At 1 layer: ALL row monsters +5 atk & restore 1 layer per monster turn end
  bossLayerCap?: boolean; // (deprecated) Max 1 layer loss per hero turn
  bossEnrageGraveyardSummon?: number; // Boss: on enrage, pull N cards from graveyard and stack on other slots
  // Tier-3 waterfall upgrade abilities
  ogreStun?: boolean; // Ogre tier-1+: 20% chance to stun the player on attack (freezes equipment/amulet slots)
  ogreEnterDiscard?: boolean; // Ogre tier-3: randomly discard a player hand card on enter
  dragonAttackNoLayerCost?: boolean; // Dragon tier-1+: attacks don't consume blood layers (conditional on losing a layer last hero turn)
  dragonNoLayerCostActive?: boolean; // Set to true when dragon lost a layer during the previous hero turn, enabling no-layer-cost for next attack
  dragonDamageRetaliation?: number; // Dragon tier-2+: deal N magic damage to player each time this monster takes damage
  dragonBleedDestroy?: boolean; // Dragon tier-3: on layer loss, destroy equipment with durability > remaining layers
  eliteHealOtherMonster?: boolean; // Elite dragon: if hero turn ends without layer loss, heal 1 layer on another active row monster
  skeletonNoLayerCost?: boolean; // Skeleton tier-1+: after revive, attacks don't consume layers
  skeletonNoLayerCostActive?: boolean; // Set to true once skeleton revives with no-layer-cost ability
  skeletonLastWordsDiscard?: boolean; // Skeleton tier-2+: last words discard 1 player hand card
  skeletonReRevive?: boolean; // Skeleton tier-3: when another monster in active row is defeated and this skeleton already revived, regain revive
  wraithTurnAttack?: number; // Wraith tier-2 (legacy): +N attack at end of each monster turn
  wraithDeathHeal?: number; // Wraith tier-3 (legacy): on death, same-row monsters gain this much HP
  wraithAuraAttack?: number; // Wraith tier-1: +N attack to ALL active row monsters at end of monster turn
  wraithDeathHealSpread?: number; // Wraith tier-2: on death, same-row monsters +N HP and pass this last word to random monster
  wraithTurnEnrage?: boolean; // Wraith tier-3: enrage all active row monsters at end of monster turn
  wraithDestroyAmulet?: boolean; // Wraith tier-3: destroy a random amulet at end of monster turn
  goblinStealCard?: boolean; // Goblin tier-1+: steal a random hand card on attack, stacked under this monster
  stolenByGoblin?: boolean; // Card was stolen by a Goblin and stacked under it
  goblinStealScale?: boolean; // Goblin tier-3: +X atk/hp per X gold stolen
  goblinHasStolen?: boolean; // Tracks if this goblin successfully stole gold
  goblinStackHeal?: boolean; // Goblin tier-2: at end of monster turn, single D20 roll where threshold = min(stackCount * 3, 20); on success restore 1 layer
  goblinStealEquip?: boolean; // Goblin elite: at end of monster turn, single D20 roll where threshold = min(stackCount * 5, 20); on success steal 1 equipment or amulet
  swarmHordeRage?: boolean; // Swarm tier-1: when ≥3 monsters in active row, all get enraged +3 atk/hp
  swarmHordeBuffed?: boolean; // Tracks if this monster already received the horde buff
  swarmCorrode?: boolean; // Swarm tier-2: on attack, blocking shield loses 1 durability (doesn't count as block durability use)
  swarmBugletShield?: boolean; // Swarm tier-3: takes 0 damage when buglets exist on active row
  bugletLastWordsHeal?: boolean; // Buglet tier-1+: on death, restore 1 layer to all other buglets in active row
  antiMagicReflect?: number; // Golem base: damage dealt to player per magic card used
  spellDamageReduction?: number; // Golem tier-1: fraction of spell damage reduced (0.5 = 50%)
  maxDamagePerHit?: number; // Golem elite: max damage this monster can take per hit
  golemLayerLossReflect?: number; // Golem tier-2: deals coeff × lostLayers damage when losing a fury layer
  golemSpellGrowth?: number; // Golem tier-3: increase antiMagicReflect & golemLayerLossReflect each monster turn end
  /** 本局随机指定的一只哥布林；仅该实例死亡且未偷金时掉落「哥布林的戏法」 */
  goblinTrickCarrier?: boolean;
  wraithRebirthUsed?: boolean; // Wraith equipment: durability refill has been consumed
  /** 击晕状态：被击晕的怪物所有技能完全无效（攻击、被动、反应、遗言、复生、场地效果全部禁用），持续一个怪物回合后自动恢复 */
  isStunned?: boolean;
  /**
   * 召唤回合保护：被 Boss「亡灵召唤」(`bossEnrageGraveyardSummon`) 临时召唤进激活
   * 行的怪物必须跳过紧接着的那一次 monster 回合（玩家 END_TURN 后构造 attack queue
   * 时把它们排除掉）。`endHeroTurnPatch` 在排除后会自动剥离这个标记，所以下一次
   * 玩家结束回合时，这些怪物会正常参战。被击晕（`isStunned`）相互独立。
   */
  skipNextMonsterTurn?: boolean;
  /** 建筑光环 id：在场时生效，建筑被毁坏后消失 */
  buildingAura?: 'suppress-adjacent-temp-attack' | 'stacked-magic-immune';
  // Permanent event properties
  isPermanentEvent?: boolean; // Stays in dungeon after effect; recyclable like perm magic
  hasReleaseCharge?: boolean; // Gained on appearance or position change; consumed on effect use
  _fateBladeLastSlot?: number; // Internal: last known active row slot index for position tracking
  // Card upgrade properties
  upgradeLevel?: number; // Current upgrade level (0 = base, 1 = upgraded once, etc.)
  maxUpgradeLevel?: number; // Maximum number of upgrades allowed for this card
  /** 转型关键词：上一张使用的牌类型不同时触发额外效果（描述文字） */
  transformBonus?: string;
  /** 转型触发时执行的效果 ID（由蜕变赋灵等卡牌赋予） */
  transformEffect?: string;
  /** 侧击关键词：打出时为手牌最左/最右时触发的额外效果（描述文字） */
  flankEffect?: string;
  /** 侧击抽牌：打出时处于手牌最左/最右位置时抽取的卡牌数量 */
  flankDraw?: number;
  /** 侧击触发时执行的效果 ID（如 persuadeCost-1、stunCap+5、damage:5） */
  flankEffectId?: string;
  /** 事件堆叠驻留：处理后若 activeCardStacks 有下方牌，则消耗下方牌、事件不进坟场 */
  stayIfStacked?: boolean;
  /** 幽灵属性：不阻挡瀑流、不计入激活行剩余卡牌数；瀑流时垫在最下方 */
  isGhost?: boolean;
  /**
   * 地雷字段（仅 building + isGhost: true 时有意义）：
   * 当怪物瀑流落到本卡所在槽位时，地雷从下层触发对该怪物造成 mineDamage 点
   * 纯陷阱伤害（不受 amplify / spell-damage 加成），随后地雷进坟场。
   * 非怪物（事件 / 其它建筑等）落下时地雷不触发，按普通 ghost 同款被推到下层。
   * 触发时机由 rules/waterfall.ts 的 reduceApplyWaterfallDrop 处理。
   *
   * 注：实际触发伤害 = mineDamage + state.globalMineDamageBonus（「引雷阵锋」类
   * 武器累加的全局加成）。
   */
  mineDamage?: number;
  /**
   * 「引雷阵锋」类武器：每损失 1 点耐久，将 N 累加到 `state.globalMineDamageBonus`，
   * 让全场所有「地雷」实际伤害永久 +N（不撤销）。
   *
   * - 触发条件：本武器装在 equipmentSlot1/2 时耐久减少（攻击 / 腐蚀 / 蓄能裂击 /
   *   等价交换 等任意路径）。修复耐久不撤销已累加的 bonus。
   * - 升级缩放：lvl 0 → 2，lvl 1 → 2，lvl 2 → 3。
   * - 累加方向：仅自加，不会清零 / 重置；本武器损毁后已累加的 bonus 保留。
   * - 消费方：`rules/waterfall.ts` 的 `reduceApplyWaterfallDrop` 在地雷触发时读
   *   `mineDamage + globalMineDamageBonus` 计算实际伤害。
   */
  mineDamageBoostPerDur?: number;
  /** 增幅加成：每次增幅 +1，武器加攻击/护盾加护甲/伤害魔法加伤害 */
  amplifyBonus?: number;
  /** 增幅祭坛：发动时增幅目标卡牌的 ID */
  _amplifyTargetCardId?: string;
  /** 增幅祭坛：增幅目标卡牌的名称（用于卡面显示） */
  _amplifyTargetName?: string;
}

/** 叠伤永久法术：仅显示叠刺层数（随使用次数增加），不含永久法术加成 / 法术回响 */
export function formatScalingSpellDamageLine(scalingBase: number): string {
  return `当下 ${scalingBase} 点`;
}

export function useArcaneStormDamage(): number {
  // 与 resolveArcaneStorm 一致：读 arcaneStormMagicCount（不含奥术风暴自身）。
  // 该字段仅在「使用奥术风暴」与「瀑流」时清零，跨回合累计。
  const magicCount = useGameState(s => s.arcaneStormMagicCount);
  const spellBonus = useGameState(s => s.permanentSpellDamageBonus);
  return Math.max(0, magicCount + spellBonus);
}

/**
 * 奥术护盾 (arcane-shield-stun-cap) — 预测此刻打出该卡能加的击晕上限百分比。
 * 与 magic-effects.ts 的 resolver 保持一致：nonDamageCount = 本回合 magic 总数 − 造成伤害的 magic 数。
 * 不含 echo 倍率（resolve 时才知道），不应用 stunCap 100% 上限（与 arcaneStormDamage 风格一致，仅显示 raw gain）。
 */
export function useArcaneShieldStunGain(): number {
  const totalMagic = useGameState(s => s.magicCardsPlayedThisTurn);
  const damageMagic = useGameState(s => s.damageMagicPlayedThisTurn);
  return Math.max(0, totalMagic - damageMagic);
}

/**
 * 连环转律 (transformStreakStrike) — 预测此刻打出该卡造成的纯转型链伤害。
 * 不含 spell-damage 加成 / amplifyBonus / echo（与 card-schema/definitions/magic.ts
 * 的 `computePredictedTransformStreak` 保持一致的 raw streak 语义）。
 *
 *   prevChainCat == null            → { damage: 1, broken: false }（链空，本牌起头）
 *   prevChainCat === 'perm-magic'   → { damage: 0, broken: true }（同类型断链）
 *   else                            → { damage: prevStreak + 1, broken: false }
 */
function useTransformStreakDamage(): { damage: number; broken: boolean } {
  const prevChainCat = useGameState(s => s.transformChainPrevCategory);
  const prevStreak = useGameState(s => s.consecutiveTransformStreak);
  const curCat = 'perm-magic';
  if (prevChainCat == null) return { damage: 1, broken: false };
  if (prevChainCat === curCat) return { damage: 0, broken: true };
  return { damage: (prevStreak ?? 0) + 1, broken: false };
}

/**
 * 伤害 magic 卡（Group B/C/D）当下的展示。订阅 hp / gold 等用于 Group C
 * 的状态相关 base，pure 计算委托给 computeDamageMagicDisplayPure。
 */
function useDamageMagicDisplay(card: GameCardData): DamageMagicDisplay {
  const hp = useGameState(s => s.hp);
  const gold = useGameState(s => s.gold);
  const maxHp = useGameState(s => computeMaxHp(s));
  const stunCap = useGameState(s => s.stunCap ?? 0);
  const backpackCount = useGameState(s => s.backpackItems.length);
  const recycleBagCount = useGameState(s => s.permanentMagicRecycleBag.length);
  return computeDamageMagicDisplayPure(card, { hp, maxHp, gold, stunCap, backpackCount, recycleBagCount });
}

export function isPermRecycleEquipment(card: GameCardData | null | undefined): boolean {
  return Boolean(
    card && (card.type === 'weapon' || card.type === 'shield' || card.type === 'monster') && card.permEquipment,
  );
}

/**
 * UI-side guard: should this monster card be rendered using the equipment
 * layout rather than the active-row layout?
 *
 * The canonical signal is `durability != null` (set by
 * `primeMonsterAsEquipment` whenever a monster lands in
 * hand/backpack/recycle). We also accept `maxDurability` as a fallback so
 * the equipment layout is preserved even if `durability` was momentarily
 * zeroed before display.
 */
export function isMonsterEquipmentCard(card: GameCardData | null | undefined): boolean {
  return Boolean(
    card && card.type === 'monster' && (card.durability != null || card.maxDurability != null),
  );
}

/** 回收袋中卡牌：距离回到背包还需经历的瀑流次数（与 useCardOperations.restorePermanentMagicFromRecycleBag 一致） */
export function waterfallsUntilBackpackFromRecycle(card: GameCardData): number {
  return Math.max(card._recycleWaits ?? 0, 1);
}

/** 判断卡牌是否已有任何形式的 Perm 属性（永久魔法 / 永久装备 / 永驻事件 / 显式 recycleDelay） */
export function cardHasPermFlag(card: GameCardData): boolean {
  // 凡化咒已剥离 Perm 属性 — 即使 magicType 仍为 permanent 也视为非 Perm。
  if (card.permStripped) return false;
  if (card.magicType === 'permanent') return true;
  if (card.permEquipment) return true;
  if (card.isPermanentEvent) return true;
  if (card.recycleDelay != null && card.recycleDelay > 0) return true;
  return false;
}

/** 背包列表等：`永久` 或 `永久 2`（recycleDelay > 1 时带数字） */
export function getMagicSubtypeBracketLabel(card: GameCardData): string | null {
  if (isPermRecycleEquipment(card)) {
    const d = card.recycleDelay ?? 1;
    return d > 1 ? `永久装备 ${d}` : '永久装备';
  }
  if (card.type === 'amulet' && card.recycleDelay != null) {
    const d = card.recycleDelay;
    return d > 1 ? `Perm ${d}` : 'Perm 1';
  }
  if (card.recycleDelay != null && card.recycleDelay > 0 && card.type !== 'magic') {
    return `Perm ${card.recycleDelay}`;
  }
  if (card.type !== 'magic' || !card.magicType) return null;
  if (card.magicType === 'instant') {
    if (card.recycleDelay != null && card.recycleDelay > 0) return `Perm ${card.recycleDelay} 即时`;
    return '即时';
  }
  if (card.magicType === 'permanent') {
    if (card.permStripped) return '即时';
    const d = card.recycleDelay ?? 1;
    return d > 1 ? `永久 ${d}` : '永久';
  }
  return card.magicType;
}

export interface GameCardProps {
  card: GameCardData;
  onDragStart?: (card: GameCardData) => void;
  onDragEnd?: (event?: React.DragEvent) => void;
  onWeaponDrop?: (weapon: any) => void;
  isWeaponDropTarget?: boolean;
  className?: string;
  onClick?: () => void;
  /**
   * Right-click handler (desktop). Used by the card-stamp social feature on
   * cells in the active / preview row. The handler should call
   * `event.preventDefault()` to suppress the browser context menu.
   */
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  /**
   * Long-press handler (mobile). Fires after ~500ms of pointer-down on the
   * card without significant movement and without a drag start. Used by the
   * card-stamp social feature on cells in the active / preview row.
   */
  onLongPress?: (event: { clientX: number; clientY: number; target: Element }) => void;
  disableInteractions?: boolean;
  amuletDescriptionVariant?: 'default' | 'topThird';
  bleedAnimation?: boolean;
  healAnimation?: boolean;
  weaponSwingAnimation?: boolean;
  shieldBlockAnimation?: boolean;
  defeatAnimation?: boolean;
  isEngaged?: boolean;
  weaponSwingVariant?: number;
  shieldBlockVariant?: number;
  equipmentStatModifier?: EquipmentCardStatModifier | null;
  showExhaustedOverlay?: boolean;
}

function GameCardInner({
  card,
  onDragStart,
  onDragEnd,
  onWeaponDrop,
  isWeaponDropTarget,
  className = '',
  onClick,
  onContextMenu,
  onLongPress,
  disableInteractions = false,
  amuletDescriptionVariant = 'default',
  bleedAnimation = false,
  healAnimation = false,
  weaponSwingAnimation = false,
  shieldBlockAnimation = false,
  defeatAnimation = false,
  isEngaged = false,
  weaponSwingVariant = 0,
  shieldBlockVariant = 0,
  equipmentStatModifier = null,
  showExhaustedOverlay = false,
}: GameCardProps) {
  const gameViewport = useGameViewport();
  const isCompact = gameViewport.width < 500;
  const isFlat = gameViewport.width / gameViewport.height > FLAT_ASPECT_RATIO;
  const arcaneStormDamage = useArcaneStormDamage();
  const arcaneShieldStunGain = useArcaneShieldStunGain();
  const transformStreakPredict = useTransformStreakDamage();
  const damageMagicDisplay = useDamageMagicDisplay(card);
  const isTransformStreakStrike =
    card.type === 'magic'
    && getStarterBaseId(card.id) === STARTER_CARD_IDS.transformStreakStrike;
  const [isDragging, setIsDragging] = useState(false);
  const [cardScale, setCardScale] = useState(1);
  const [cardWidthPx, setCardWidthPx] = useState(BASE_CARD_WIDTH);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const durabilityCapacity = Math.max(card.maxDurability ?? card.durability ?? 0, 0);
  const totalDurabilityDots = Math.min(MAX_DURABILITY_DOTS, durabilityCapacity);
  const currentDurability = Math.min(
    totalDurabilityDots,
    Math.max(card.durability ?? 0, 0),
  );
  const engagedMonster = isEngaged && card.type === 'monster';
  const isPotionCard = card.type === 'potion';
  const isMagicLikeCard = card.type === 'magic' || card.type === 'hero-magic';
  const isEventCard = card.type === 'event';
  const isTitleBandCard = isMagicLikeCard || isEventCard;
  const isPermanentMagicCard = card.type === 'magic' && card.magicType === 'permanent' && !card.permStripped;
  const permRecycleWaterfalls = card.recycleDelay ?? 1;
  /** 永久法术：卡面始终显示 PERM + 瀑流计数（含 1）；永驻事件、永久装备仍仅在 >1 时显示数字 */
  const showPermMagicRecycleNumber = isPermanentMagicCard;
  const showPermEventRecycleNumber = Boolean(card.isPermanentEvent) && permRecycleWaterfalls > 1;
  const showPermEquipmentRecycleNumber = permRecycleWaterfalls > 1;
  /**
   * 标准布局卡牌（武器/护盾/怪物/建筑）右上角已被 HP/耐久点占用，
   * 把 Perm 标识移到名称旁内联显示（参考永久魔法的标识样式），避免被覆盖。
   */
  const hasStandardLayoutCornerStats =
    card.type === 'weapon' ||
    card.type === 'shield' ||
    card.type === 'monster' ||
    card.type === 'building';
  const inlinePermVariant: 'cyan' | 'amber' | null = (() => {
    if (!hasStandardLayoutCornerStats) return null;
    if ((card.type === 'weapon' || card.type === 'shield') && card.permEquipment) return 'cyan';
    if (card.recycleDelay != null && card.recycleDelay > 0) return 'amber';
    return null;
  })();
  const showInlinePermPill = inlinePermVariant !== null;
  const healingPotionEffects: PotionEffectId[] = ['heal-5', 'heal-7'];
  const isHealingPotion =
    isPotionCard && (!card.potionEffect || healingPotionEffects.includes(card.potionEffect));
  const potionDescription =
    isPotionCard && !isHealingPotion
      ? card.shortDescription ?? card.description ?? null
      : null;

  const isEquipmentCard = card.type === 'weapon' || card.type === 'shield' || (card.type === 'monster' && 'fromSlot' in card);
  const mobileDragType =
    isEquipmentCard && 'fromSlot' in card && (card as any)?.fromSlot ? 'equipment' : 'card';

  useEffect(() => {
    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') {
      return;
    }
    const target = cardRef.current;
    if (!target) {
      return;
    }

    let rafId: number | null = null;
    const updateScale = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const { width } = target.getBoundingClientRect();
        if (!width) return;
        setCardWidthPx(prevW => (Math.abs(prevW - width) > 0.5 ? width : prevW));
        setCardScale(prev => {
          const next = clamp(width / BASE_CARD_WIDTH, CARD_SCALE_MIN, CARD_SCALE_MAX);
          return Math.abs(prev - next) > 0.01 ? next : prev;
        });
      });
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(target);

    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  /** 魔法 / 事件标题条：极窄时只显示标题，避免左侧纹样挤占 */
  const hideTitleBandSideGlyph =
    isTitleBandCard && boardTitleGlyphWouldCrowdName(cardWidthPx, isFlat, isCompact);

  const cardRef2 = useRef(card);
  cardRef2.current = card;
  const onDragStartRef = useRef(onDragStart);
  onDragStartRef.current = onDragStart;
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;

  useEffect(() => {
    if (disableInteractions || !cardRef.current || (card.type === 'building' && !card.eventChoices)) return;

    const cleanup = initMobileDrag(
      cardRef.current,
      () => ({ type: mobileDragType, data: cardRef2.current }),
      () => {
        setIsDragging(true);
        onDragStartRef.current?.(cardRef2.current);
      },
      () => {
        setIsDragging(false);
        onDragEndRef.current?.();
      },
      // Long-press: opens the card-stamp picker on mobile. The desktop path
      // is React's `onContextMenu`; touch can't fire pointerdown reliably
      // because the drag init calls `e.preventDefault()` on touchstart, so
      // the long-press timer must live alongside the touch listeners
      // themselves. Always pass a wrapper that reads `onLongPressRef.current`
      // at fire time so a card transitioning from no-longpress to longpress
      // (or vice versa) doesn't need the touch listeners to re-mount.
      evt => onLongPressRef.current?.(evt),
    );
    
    return cleanup;
  }, [disableInteractions, mobileDragType, card.type]);

  // Enable mobile weapon drops when a monster card is a valid drop target
  useEffect(() => {
    if (disableInteractions || !cardRef.current) return;
    if ((card.type !== 'monster' && card.type !== 'building') || !onWeaponDrop) return;

    const cleanup = initMobileDrop(
      cardRef.current,
      dragData => {
        if (!isWeaponDropTarget) return;
        if (dragData.type !== 'equipment') return;
        onWeaponDrop?.(dragData.data);
      },
      ['equipment'],
    );

    return cleanup;
  }, [card, onWeaponDrop, disableInteractions, isWeaponDropTarget]);

  const handleDragStart = (e: React.DragEvent) => {
    if (disableInteractions) return;
    cancelLongPress();
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    const cardPayload = JSON.stringify(card);
    e.dataTransfer.setData('card', cardPayload);
    // Mirror into a module-level fallback for browsers that drop custom
    // dataTransfer MIME types (Samsung Internet on DeX). See mobileDragDrop.ts.
    setHtml5DragFallback('card', cardPayload);
    if ((card.type === 'weapon' || card.type === 'shield' || card.type === 'monster') && 'fromSlot' in card && (card as any).fromSlot) {
      const equipmentPayload = JSON.stringify(card);
      e.dataTransfer.setData('equipment', equipmentPayload);
      setHtml5DragFallback('equipment', equipmentPayload);
    }
    onDragStart?.(card);
  };

  const handleDragEnd = (e?: React.DragEvent) => {
    if (disableInteractions) return;
    setIsDragging(false);
    clearHtml5DragFallback();
    onDragEnd?.(e);
  };

  const equipmentSlotSurface =
    (card.type === 'weapon' || card.type === 'shield' || card.type === 'monster') &&
    'fromSlot' in card &&
    typeof (card as { fromSlot?: string }).fromSlot === 'string' &&
    (card as { fromSlot: string }).fromSlot.startsWith('slot-equipment');

  const handleDragOver = (e: React.DragEvent) => {
    if (disableInteractions) return;
    if (card.type === 'monster' || card.type === 'building' || equipmentSlotSurface) {
      e.preventDefault();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (disableInteractions) return;
    if (card.type === 'monster' || card.type === 'building') {
      e.preventDefault();
      const equipmentData = readHtml5DragData(e, 'equipment');
      if (equipmentData) {
        const weapon = JSON.parse(equipmentData);
        onWeaponDrop?.(weapon);
      }
    }
  };

  // ----- Long-press detection (mobile) for `onLongPress` callback -----
  // Used by the card-stamp social feature on the active / preview row. Fires
  // after `LONG_PRESS_MS` of pointer-down without significant movement and
  // without a drag-start. Cancelled by pointer-up / move > 8px / drag start.
  const LONG_PRESS_MS = 500;
  const LONG_PRESS_MOVE_TOLERANCE = 8;
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  const cancelLongPress = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  };

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onLongPress) return;
    if (disableInteractions) return;
    // Only primary button (mouse left or touch / pen).
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Skip mouse on desktop — desktop uses contextmenu (right click) instead.
    if (e.pointerType === 'mouse') return;

    const target = e.currentTarget;
    const clientX = e.clientX;
    const clientY = e.clientY;
    longPressOriginRef.current = { x: clientX, y: clientY, pointerId: e.pointerId };
    cancelLongPress();
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      const origin = longPressOriginRef.current;
      longPressOriginRef.current = null;
      if (!origin) return;
      onLongPress({ clientX: origin.x, clientY: origin.y, target });
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const origin = longPressOriginRef.current;
    if (!origin || origin.pointerId !== e.pointerId) return;
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE) {
      cancelLongPress();
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const origin = longPressOriginRef.current;
    if (origin && origin.pointerId === e.pointerId) {
      cancelLongPress();
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    handlePointerUp(e);
  };

  // Right-click context menu (desktop) → forward to caller and suppress
  // browser's native menu.
  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onContextMenu) return;
    if (disableInteractions) return;
    e.preventDefault();
    onContextMenu(e);
  };

  // Handle double tap for mobile devices
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (disableInteractions || !onClick) return;
    
    const touch = e.changedTouches[0];
    const currentTime = Date.now();
    const currentX = touch.clientX;
    const currentY = touch.clientY;
    
    if (lastTapRef.current) {
      const timeDiff = currentTime - lastTapRef.current.time;
      const xDiff = Math.abs(currentX - lastTapRef.current.x);
      const yDiff = Math.abs(currentY - lastTapRef.current.y);
      
      // Check if it's a double tap (within 300ms and 50px distance)
      if (timeDiff < 300 && xDiff < 50 && yDiff < 50) {
        e.preventDefault();
        onClick();
        lastTapRef.current = null; // Reset to prevent triple tap
        return;
      }
    }
    
    // Store this tap for potential double tap detection
    lastTapRef.current = { time: currentTime, x: currentX, y: currentY };
    
    // Clear the stored tap after a delay to prevent accidental double taps
    setTimeout(() => {
      lastTapRef.current = null;
    }, 300);
  };

  const getCardIcon = () => {
    switch (card.type) {
      case 'monster':
        return <Skull className="dh-card__icon text-destructive" />;
      case 'weapon':
        return <Sword className="dh-card__icon text-amber-500" />;
      case 'shield':
        return <Shield className="dh-card__icon text-blue-500" />;
      case 'potion':
        return <Heart className="dh-card__icon text-green-500" />;
      case 'amulet':
        return <Sparkles className="dh-card__icon text-purple-500" />;
      case 'magic':
        return <Zap className="dh-card__icon text-cyan-500" />;
      case 'hero-magic':
        return <Wand2 className="dh-card__icon text-rose-500" />;
      case 'event':
        return <Scroll className="dh-card__icon text-violet-700" />;
      case 'curse':
        return <Skull className="dh-card__icon text-rose-800" />;
    }
  };

  const getCardBorderColor = () => {
    // Class cards get golden border
    if (card.classCard) {
      return 'border-yellow-600 shadow-yellow-500/20';
    }
    
    switch (card.type) {
      case 'monster':
        if (card.bossPhase) return 'border-red-500 shadow-red-500/40 shadow-lg';
        if (card.isFinalMonster) return 'border-red-600 shadow-red-500/20';
        return 'border-red-900';
      case 'weapon':
        return 'border-amber-900';
      case 'shield':
        return 'border-blue-900';
      case 'potion':
        return 'border-emerald-800';
      case 'amulet':
        return 'border-violet-900';
      case 'magic':
        return 'border-cyan-900';
      case 'hero-magic':
        return 'border-rose-900';
      case 'event':
        return 'border-violet-700';
      case 'building':
        return 'border-stone-600';
      case 'curse':
        return 'border-rose-950 shadow-rose-900/30';
      default:
        return 'border-card-border';
    }
  };

const formatAuraBonusText = (bonus?: AmuletAuraBonus | null) => {
  if (!bonus) {
    return null;
  }
  const parts: string[] = [];
  if (typeof bonus.attack === 'number' && bonus.attack !== 0) {
    parts.push(`攻击 +${bonus.attack}`);
  }
  if (typeof bonus.defense === 'number' && bonus.defense !== 0) {
    parts.push(`护甲 +${bonus.defense}`);
  }
  if (typeof bonus.maxHp === 'number' && bonus.maxHp !== 0) {
    parts.push(`最大生命 +${bonus.maxHp}`);
  }
  return parts.length > 0 ? parts.join(' / ') : null;
};

const amuletEffectText =
  card.type === 'amulet'
    ? card.shortDescription ||
      card.description ||
      formatAuraBonusText(card.amuletAuraBonus) ||
      (card.effect && typeof card.value === 'number' ? `+${card.value} ${card.effect}` : null)
    : null;

  const showAmuletOverlay =
    card.type === 'amulet' && amuletEffectText && amuletDescriptionVariant === 'topThird';

  // Calculate visual shift based on layer damage - DEPRECATED in favor of GameBoard visualization
  const getLayerShift = () => {
    return 0; // Handled by GameBoard wrapper now
  };

  const upgradeLevel = card.upgradeLevel ?? 0;
  const showUpgradeBadge = upgradeLevel > 0 && !(card.type === 'monster' && !isMonsterEquipmentCard(card));

  const showBleedOverlay = Boolean(bleedAnimation);
  const showHealOverlay = Boolean(healAnimation);
  const showWeaponSwing = Boolean(weaponSwingAnimation);
  const showShieldBlock = Boolean(shieldBlockAnimation);
  const showDefeatOverlay = Boolean(defeatAnimation);
  const showCombatOverlay = showBleedOverlay || showHealOverlay || showWeaponSwing || showShieldBlock || showDefeatOverlay;
  const isMagicCard = isMagicLikeCard;
  const magicPatternKey = isMagicLikeCard ? resolveMagicPatternKey(card) : null;
  const eventPatternKey = isEventCard ? resolveEventPatternKey(card) : null;
  const cardWatermarkKey = magicPatternKey || eventPatternKey;
  const isTextOnlyCard = isEventCard || isMagicCard;
  const isThemedImageCard = card.type === 'amulet' || card.type === 'potion' || card.type === 'curse';
  const cornerDecoClass =
    card.type === 'amulet'
      ? 'dh-card-deco--amulet'
      : card.type === 'potion'
        ? 'dh-card-deco--potion'
        : card.type === 'curse'
          ? 'dh-card-deco--curse'
          : card.type === 'monster' || card.type === 'building'
            ? 'dh-card-deco--monster'
            : card.type === 'weapon'
              ? 'dh-card-deco--weapon'
              : card.type === 'shield'
                ? 'dh-card-deco--shield'
                : '';
  const hasCornerDeco = Boolean(cornerDecoClass);
  const insetFrameBorderClass = (() => {
    if (!hasCornerDeco) return '';
    switch (card.type) {
      case 'monster':
      case 'building':
        return 'border-red-300/30';
      case 'weapon':
        return 'border-amber-500/40';
      case 'shield':
        return 'border-blue-500/40';
      case 'potion':
        return 'border-emerald-500/40';
      case 'amulet':
        return 'border-violet-400/45';
      case 'curse':
        return 'border-rose-700/40';
      default:
        return '';
    }
  })();
  const cardImageHeightClass = isThemedImageCard ? 'h-[60%]' : 'h-[65%]';
  const hasFlipTarget = Boolean(card.flipTarget) || Boolean(card._showFlipBadge);
  // `_flipBackCard` 字段长期挂在卡上（用于血誓回卷 / 乾坤一翻 / 万象齐转 /
  // 秘藏宝库回退 / 命运之刃回退等机制读取原卡），但这些机制都只针对 active row
  // 内的卡。一旦卡牌离开 active row（被拾取入手牌 / 装备 / 进背包 / 进墓地 /
  // 进回收袋），这个字段就再无消费方，"已翻转" badge 也就没有意义 —— 例如暗影
  // 之刺翻转后被玩家拿走，badge 不应该一直跟着它。所以 badge 只在卡牌仍在
  // active row 中时显示。
  const isInActiveRow = useGameState(s =>
    s.activeCards.some(c => c?.id === card.id),
  );
  const hasBeenFlipped = Boolean(card._flipBackCard) && !hasFlipTarget && isInActiveRow;

  const cardImageBackdropClass = (() => {
    if (isThemedImageCard) {
      if (card.type === 'amulet') return 'bg-violet-200/30';
      if (card.type === 'curse') return 'bg-gradient-to-b from-rose-950/30 to-zinc-900/40';
      return 'bg-emerald-200/30';
    }
    switch (card.type) {
      case 'monster':
      case 'building':
        return 'bg-red-50/45';
      case 'weapon':
        return 'bg-amber-200/30';
      case 'shield':
        return 'bg-blue-300/50';
      default:
        return 'bg-gradient-to-b from-muted to-card';
    }
  })();

  const cardTextAreaBgClass = (() => {
    switch (card.type) {
      case 'amulet':
        return 'bg-violet-200/30';
      case 'potion':
        return 'bg-emerald-200/30';
      case 'curse':
        return 'bg-gradient-to-b from-rose-950/25 to-zinc-900/30';
      case 'monster':
      case 'building':
        return 'bg-red-50/45';
      case 'weapon':
        return 'bg-amber-200/30';
      case 'shield':
        return 'bg-blue-300/50';
      default:
        return 'bg-card';
    }
  })();

  const cardImageWrapperClassName = [
    'relative',
    hasCornerDeco ? 'z-[1]' : '',
    cardImageHeightClass,
    isThemedImageCard
      ? 'overflow-hidden flex items-center justify-center'
      : 'overflow-hidden flex items-end justify-center',
    cardImageBackdropClass,
  ]
    .filter(Boolean)
    .join(' ');
  const cardImageClassName = isThemedImageCard
    ? 'select-none w-auto max-h-[80%] max-w-[80%] object-contain opacity-70'
    : 'select-none w-auto max-h-[82%] max-w-[82%] object-contain';

  const modSpacer = '';
  const flashCountForDisplay = equipmentStatModifier?.flashCount ?? 0;
  const isFlashHalveAttack =
    flashCountForDisplay > 0 &&
    (card.type === 'weapon' || card.type === 'monster') &&
    (equipmentStatModifier?.appliesTo === 'weapon' || equipmentStatModifier?.appliesTo === 'monster');
  const flashHalvedValue = isFlashHalveAttack
    ? Math.max(
        0,
        Math.floor((card.value + (equipmentStatModifier?.modifier ?? 0)) / Math.pow(2, flashCountForDisplay)),
      )
    : null;
  const equipmentStatModifierText =
    !isFlashHalveAttack &&
    equipmentStatModifier &&
    (card.type === 'weapon' || card.type === 'shield' || card.type === 'monster') &&
    equipmentStatModifier.appliesTo === card.type &&
    equipmentStatModifier.modifier !== 0
      ? `${equipmentStatModifier.modifier > 0 ? '+' : '-'}${modSpacer}${Math.abs(
          equipmentStatModifier.modifier,
        )}`
      : null;
  const equipmentShieldModifierText =
    equipmentStatModifier &&
    card.type === 'monster' &&
    equipmentStatModifier.appliesTo === 'monster' &&
    (equipmentStatModifier.shieldModifier ?? 0) !== 0
      ? `${(equipmentStatModifier.shieldModifier ?? 0) > 0 ? '+' : '-'}${modSpacer}${Math.abs(
          equipmentStatModifier.shieldModifier ?? 0,
        )}`
      : null;
  const equipmentStatModifierColor = 'text-emerald-600';
  const equipmentModifierNum =
    !isFlashHalveAttack &&
    equipmentStatModifier &&
    (card.type === 'weapon' || card.type === 'shield' || card.type === 'monster') &&
    equipmentStatModifier.appliesTo === card.type
      ? equipmentStatModifier.modifier
      : 0;
  const equipmentShieldModifierNum =
    equipmentStatModifier &&
    card.type === 'monster' &&
    equipmentStatModifier.appliesTo === 'monster'
      ? (equipmentStatModifier.shieldModifier ?? 0)
      : 0;

  const monsterAttackModifier = (() => {
    if (card.type !== 'monster') return 0;
    const current = card.attack ?? card.value;
    const boost = card.specialAttackBoost ?? 0;
    const baseBeforeEffects = card.lowGoldBuffActive
      ? Math.floor(current / 2) - boost
      : current - boost;
    return current - baseBeforeEffects;
  })();
  const monsterAttackBase = (card.attack ?? card.value) - monsterAttackModifier;

  const monsterHpModifier = (() => {
    if (card.type !== 'monster') return 0;
    const currentMax = card.maxHp ?? card.hp ?? 0;
    if (card.lowGoldBuffActive) return Math.floor(currentMax / 2);
    return 0;
  })();
  const monsterHpBase = Math.max(0, (card.hp ?? card.value) - monsterHpModifier);

  return (
    <div
      ref={cardRef}
      draggable={!disableInteractions && (card.type !== 'building' || Boolean(card.eventChoices))}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={onClick}
      onContextMenu={onContextMenu ? handleContextMenu : undefined}
      onPointerDown={onLongPress ? handlePointerDown : undefined}
      onPointerMove={onLongPress ? handlePointerMove : undefined}
      onPointerUp={onLongPress ? handlePointerUp : undefined}
      onPointerCancel={onLongPress ? handlePointerCancel : undefined}
      onTouchEnd={handleTouchEnd}
      className={`
        dh-card-wrapper
        w-full h-full
        cursor-pointer active:cursor-grabbing
        transition-[transform,opacity,filter] duration-200 ease-out
        touch-none
        ${isDragging 
          ? 'opacity-60' 
          : ''
        }
        ${(card.type === 'monster' || card.type === 'building') && isWeaponDropTarget ? 'scale-105' : ''}
        ${engagedMonster ? 'engaged-monster' : ''}
        ${className}
      `}
      style={{
        filter: isDragging ? 'brightness(1.1)' : 'none',
        // transform handled by GameBoard wrapper for fury sliding
        '--dh-card-instance-scale': cardScale.toString(),
      } as CSSProperties}
      data-engaged={engagedMonster ? 'true' : undefined}
      data-defeat={
        // Apply the defeat fade keyframe while EITHER:
        //  (a) the explosion overlay is mid-run (`showDefeatOverlay`), OR
        //  (b) the monster has been confirmed defeated by the reducer
        //      (`card.defeatProcessed`, set in combat.ts Branch C) and is
        //      still on the board waiting for the reward to be picked.
        // Branch (b) is what keeps the card visually "frozen as dead"
        // during the staging window between animation-end and reward-pick.
        // The CSS uses `forwards` fill, so once the keyframe finishes the
        // card sits at the final low-opacity / greyscale / shrunk state for
        // as long as the attribute is present.
        card.type === 'monster' && (showDefeatOverlay || Boolean(card.defeatProcessed))
          ? 'true'
          : undefined
      }
      data-testid={`card-${card.type}-${card.id}`}
    >
      {showBleedOverlay && card.type === 'monster' && (
        // Monster damage blood-splatter. Rendered OUTSIDE <Card> (which
        // has overflow-hidden) and outside the inner combat-overlay (which
        // has paint containment) so the drops can fly visibly past the
        // cell edge — the same architectural pattern HeroCard uses for
        // its own bleed/heal overlays. Reuses the shared `card-bleed-*`
        // CSS classes (HeroCard renders the identical structure).
        <div className="card-bleed-overlay" aria-hidden>
          <span className="combat-overlay__shape combat-overlay__shape--card-bleed-splash" />
          <span className="combat-overlay__shape combat-overlay__shape--card-bleed-drop" data-drop="1" />
          <span className="combat-overlay__shape combat-overlay__shape--card-bleed-drop" data-drop="2" />
          <span className="combat-overlay__shape combat-overlay__shape--card-bleed-drop" data-drop="3" />
          <span className="combat-overlay__shape combat-overlay__shape--card-bleed-drop" data-drop="4" />
          <span className="combat-overlay__shape combat-overlay__shape--card-bleed-drop" data-drop="5" />
          <span className="combat-overlay__shape combat-overlay__shape--card-bleed-drop" data-drop="6" />
          <span className="combat-overlay__shape combat-overlay__shape--card-bleed-drop" data-drop="7" />
          <span className="combat-overlay__shape combat-overlay__shape--card-bleed-drop" data-drop="8" />
          <span className="combat-overlay__shape combat-overlay__shape--card-bleed-drop" data-drop="9" />
          <span className="combat-overlay__shape combat-overlay__shape--card-bleed-drop" data-drop="10" />
          <span className="combat-overlay__shape combat-overlay__shape--card-bleed-drop" data-drop="11" />
          <span className="combat-overlay__shape combat-overlay__shape--card-bleed-drop" data-drop="12" />
          <span className="combat-overlay__shape combat-overlay__shape--card-bleed-drop" data-drop="13" />
          <span className="combat-overlay__shape combat-overlay__shape--card-bleed-drop" data-drop="14" />
          <span className="combat-overlay__shape combat-overlay__shape--card-bleed-drop" data-drop="15" />
          <span className="combat-overlay__shape combat-overlay__shape--card-bleed-drop" data-drop="16" />
          <span className="combat-overlay__shape combat-overlay__shape--card-bleed-drop" data-drop="17" />
          <span className="combat-overlay__shape combat-overlay__shape--card-bleed-drop" data-drop="18" />
        </div>
      )}
      <Card className={`
        w-full h-full border-4 ${getCardBorderColor()} overflow-hidden
        transition-shadow duration-200
        ${isDragging ? 'shadow-2xl' : 'shadow-lg hover:shadow-xl'}
        ${isEventCard ? 'shadow-violet-500/30 shadow-xl' : ''}
      `}>
        <div className="h-full flex flex-col relative">
          {hasFlipTarget && (
            <div className={`dh-card__flip-badge ${isCompact || isFlat ? 'dh-card__flip-badge--compact' : ''}`} title="处理后会翻面">
              翻转
            </div>
          )}
          {hasBeenFlipped && (
            <div className={`dh-card__flipped-badge ${isCompact || isFlat ? 'dh-card__flipped-badge--compact' : ''}`} title="此卡牌已翻转">
              <span className="dh-card__flipped-badge-icon" aria-hidden>↻</span>
              <span>已翻转</span>
            </div>
          )}

          {isTextOnlyCard ? (
            /* ========== EVENT / MAGIC: full-height text layout with decorative edges ========== */
            <div className={`h-full flex flex-col relative overflow-hidden ${
              isEventCard
                ? 'bg-gradient-to-b from-violet-50 to-violet-200/85'
                : card.type === 'hero-magic'
                  ? 'bg-gradient-to-b from-rose-50 to-rose-200/85'
                  : 'bg-gradient-to-b from-sky-50 to-cyan-100/90'
            }`}>
              {/* Decorative corner ornaments */}
              <div className={`absolute inset-0 pointer-events-none ${
                isEventCard ? 'dh-card-deco--event' : 'dh-card-deco--magic'
              }`} />

              {/* Outer inset frame (inside card, behind content) */}
              <div className={`absolute pointer-events-none rounded-sm ${
                isEventCard
                  ? `${isCompact ? 'inset-[3px]' : 'inset-[6px]'} border border-violet-400/45`
                  : card.type === 'hero-magic'
                    ? `${isCompact ? 'inset-[3px]' : 'inset-[6px]'} border border-rose-400/45`
                    : `${isCompact ? 'inset-[3px]' : 'inset-[6px]'} border border-cyan-500/35`
              }`} />

              {/* NOTE: Top type-label banner ("EVENT" / "MAGIC" / "HERO MAGIC") and the
                  divider that followed it have been removed for event/magic/hero-magic
                  text-only cards to maximize body space. The title row sits at the top
                  via `topAttached` on EventTitleBand / MagicTitleBand. The permanent ∞
                  badge has been relocated into the title band itself. */}

              {/* Card name (magic / hero-magic: fused band — wash + flanks + title) */}
              {isMagicLikeCard ? (
                <MagicTitleBand card={card} compact={isCompact} isFlat={isFlat} topAttached>
                  {hideTitleBandSideGlyph ? (
                    <h3
                      className={`dh-card__name relative z-20 isolate flex w-full min-w-0 items-center justify-center truncate bg-white/22 px-1.5 py-0 text-center font-serif font-bold leading-snug ${
                        card.type === 'hero-magic' ? 'text-rose-950' : 'text-cyan-950'
                      }`}
                      title={card.name}
                    >
                      {card.name}
                    </h3>
                  ) : (
                    <div className="flex min-h-[calc(1.3rem*var(--dh-card-instance-scale,1))] w-full min-w-0 flex-1 items-stretch sm:min-h-[calc(1.4rem*var(--dh-card-instance-scale,1))]">
                      <div
                        className={`relative z-0 flex shrink-0 items-center justify-center ${eventTitleSideSlotClass(isFlat, isCompact)}`}
                      >
                        <MagicNameLeftGlyph card={card} compact={isCompact} isFlat={isFlat} />
                      </div>
                      <h3
                        className={`dh-card__name relative z-20 isolate flex min-w-0 flex-1 items-center justify-center truncate border-x border-transparent bg-white/22 px-1 py-0 text-center font-serif font-bold leading-snug ${
                          card.type === 'hero-magic' ? 'text-rose-950' : 'text-cyan-950'
                        }`}
                        title={card.name}
                      >
                        {card.name}
                      </h3>
                      <div
                        className={`relative z-0 shrink-0 ${eventTitleSideSlotClass(isFlat, isCompact)}`}
                        aria-hidden
                      />
                    </div>
                  )}
                  {(isPermanentMagicCard || (card.type === 'magic' && !card.permStripped && card.recycleDelay != null && card.recycleDelay > 0)) && (
                    <span
                      className={`dh-card__caption pointer-events-none absolute right-0.5 top-1/2 z-30 flex -translate-y-1/2 items-center rounded-sm border font-bold uppercase tracking-wide shadow-sm ${
                        card.type === 'hero-magic'
                          ? 'border-rose-300/60 bg-rose-900/70 text-rose-50'
                          : 'border-cyan-300/60 bg-cyan-900/70 text-cyan-50'
                      } ${isCompact || isFlat ? 'gap-0 px-0.5 py-0' : 'gap-0.5 px-1 py-0.5'}`}
                      title="永久法术"
                    >
                      <Infinity className={isCompact || isFlat ? 'dh-icon-inline--compact' : 'dh-icon-inline'} />
                      {permRecycleWaterfalls > 1 && (
                        <span className="tabular-nums leading-none">{permRecycleWaterfalls}</span>
                      )}
                    </span>
                  )}
                </MagicTitleBand>
              ) : isEventCard ? (
                <EventTitleBand card={card} compact={isCompact} isFlat={isFlat} topAttached>
                  {hideTitleBandSideGlyph ? (
                    <div className="flex min-h-[calc(1.3rem*var(--dh-card-instance-scale,1))] w-full min-w-0 flex-1 items-stretch sm:min-h-[calc(1.4rem*var(--dh-card-instance-scale,1))]">
                      <h3
                        className="dh-card__name relative z-20 isolate flex w-full min-w-0 items-center justify-center truncate bg-white/22 px-1.5 py-0 text-center font-serif font-bold leading-snug text-violet-950"
                        title={card.name}
                      >
                        {card.name}
                      </h3>
                    </div>
                  ) : (
                    <div className="flex min-h-[calc(1.3rem*var(--dh-card-instance-scale,1))] w-full min-w-0 flex-1 items-stretch sm:min-h-[calc(1.4rem*var(--dh-card-instance-scale,1))]">
                      <div
                        className={`relative z-0 flex shrink-0 items-center justify-center ${eventTitleSideSlotClass(isFlat, isCompact)}`}
                      >
                        <EventNameLeftGlyph card={card} compact={isCompact} isFlat={isFlat} />
                      </div>
                      <h3
                        className="dh-card__name relative z-20 isolate flex min-w-0 flex-1 items-center justify-center truncate border-x border-transparent bg-white/22 px-1 py-0 text-center font-serif font-bold leading-snug text-violet-950"
                        title={card.name}
                      >
                        {card.name}
                      </h3>
                      <div
                        className={`relative z-0 shrink-0 ${eventTitleSideSlotClass(isFlat, isCompact)}`}
                        aria-hidden
                      />
                    </div>
                  )}
                  {card.isPermanentEvent && (
                    <span
                      className={`dh-card__caption pointer-events-none absolute right-0.5 top-1/2 z-30 flex -translate-y-1/2 items-center rounded-sm border border-violet-300/60 bg-violet-900/70 font-bold uppercase tracking-wide text-violet-50 shadow-sm ${isCompact || isFlat ? 'gap-0 px-0.5 py-0' : 'gap-0.5 px-1 py-0.5'}`}
                      title="永久事件"
                    >
                      <Infinity className={isCompact || isFlat ? 'dh-icon-inline--compact' : 'dh-icon-inline'} />
                      {permRecycleWaterfalls > 1 && (
                        <span className="tabular-nums leading-none">{permRecycleWaterfalls}</span>
                      )}
                    </span>
                  )}
                </EventTitleBand>
              ) : (
                <div
                  className={`relative z-10 flex items-center justify-center text-center ${
                    isCompact ? 'px-0.5 py-1 min-h-[1.85rem]' : 'px-2 py-1.5 min-h-[2.35rem]'
                  }`}
                >
                  <h3
                    className={`dh-card__name w-full truncate px-0.5 font-serif font-bold ${
                      isEventCard ? 'text-violet-950' : card.type === 'hero-magic' ? 'text-rose-950' : 'text-cyan-950'
                    }`}
                    title={card.name}
                  >
                    {card.name}
                  </h3>
                </div>
              )}

              {/* Thin separator (aligned with wide body column) */}
              <div
                className={`h-px ${isCompact ? 'mx-0.5' : 'mx-1'} ${
                  isTitleBandCard ? '-mt-1' : ''
                } ${
                  isEventCard
                    ? 'bg-gradient-to-r from-transparent via-violet-500/35 to-transparent'
                    : card.type === 'hero-magic'
                      ? 'bg-gradient-to-r from-transparent via-rose-500/35 to-transparent'
                      : 'bg-gradient-to-r from-transparent via-cyan-600/30 to-transparent'
                }`}
              />

              {/* Description / choices area - fills remaining space (tight horizontal inset vs card) */}
              <div
                className={`relative z-10 flex-1 min-h-0 overflow-y-auto ${
                  isCompact ? 'px-0' : 'px-0.5'
                } pt-1 pb-1.5`}
              >
                <div
                  className={`h-full min-h-0 relative overflow-hidden ${
                    isCompact ? 'px-0.5 py-1' : 'px-1 py-1'
                  } rounded-md border border-transparent ${
                    cardWatermarkKey ? 'bg-transparent' : 'bg-white/92'
                  }`}
                >
                  {cardWatermarkKey && (
                    <>
                      <div
                        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tintForKey(cardWatermarkKey)} opacity-[0.22]`}
                      />
                      <svg
                        className="dh-sticker-watermark pointer-events-none absolute inset-[-15%] h-[130%] w-[130%] opacity-[0.18]"
                        viewBox="0 0 32 32"
                        preserveAspectRatio="xMidYMid meet"
                        aria-hidden="true"
                      >
                        <CuteSticker k={cardWatermarkKey} />
                      </svg>
                    </>
                  )}
                  {isMagicLikeCard && (
                    <div className="dh-card__event-option relative z-10 w-full text-left leading-snug text-zinc-900">
                      {card.scalingDamage != null ? (
                        <>
                          <span className="block font-semibold text-cyan-950 dark:text-cyan-100">
                            {formatScalingSpellDamageLine(card.scalingDamage)}
                          </span>
                          {(card.shortDescription || card.description) && (
                            <span className="block text-zinc-700 dark:text-zinc-300">
                              {card.shortDescription || card.description}
                            </span>
                          )}
                        </>
                      ) : card.magicEffect === 'arcane-storm-magic-count' ? (
                        <span className="block font-semibold text-cyan-950 dark:text-cyan-100">
                          当下 {arcaneStormDamage + (card.amplifyBonus ?? 0)} 点
                        </span>
                      ) : card.magicEffect === 'arcane-shield-stun-cap' ? (
                        <span className="block font-semibold text-cyan-950 dark:text-cyan-100">
                          当下 击晕上限 +{arcaneShieldStunGain}%
                        </span>
                      ) : isTransformStreakStrike ? (
                        <span
                          className={
                            transformStreakPredict.broken
                              ? 'block font-semibold text-rose-700 dark:text-rose-300'
                              : 'block font-semibold text-cyan-950 dark:text-cyan-100'
                          }
                        >
                          {transformStreakPredict.broken
                            ? '断链 → 0 点'
                            : `当下 ${transformStreakPredict.damage} 点`}
                        </span>
                      ) : damageMagicDisplay?.mode === 'replace' ? (
                        <span className="block font-semibold text-cyan-950 dark:text-cyan-100">
                          {damageMagicDisplay.text}
                          {damageMagicDisplay.amplifyBonus > 0 && (
                            <span className="ml-1 text-fuchsia-700 dark:text-fuchsia-300">
                              (+{damageMagicDisplay.amplifyBonus})
                            </span>
                          )}
                        </span>
                      ) : damageMagicDisplay?.mode === 'suffix' ? (
                        <>
                          {card.shortDescription || card.description || card.magicEffect || card.heroMagicEffect}
                          {damageMagicDisplay.amplifyBonus > 0 && (
                            <span className="ml-1 font-semibold text-fuchsia-700 dark:text-fuchsia-300">
                              (+{damageMagicDisplay.amplifyBonus})
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          {card.shortDescription || card.description || card.magicEffect || card.heroMagicEffect}
                        </>
                      )}
                      {card.transformBonus && (
                        <span className="dh-card__keyword-tag dh-card__keyword-tag--elite inline-block mt-0.5">转型：{card.transformBonus}</span>
                      )}
                      {card.flankEffect && (
                        <span className="dh-card__keyword-tag dh-card__keyword-tag--elite inline-block mt-0.5">侧击：{card.flankEffect}</span>
                      )}
                      {(() => {
                        const onHandLabel = getOnEnterHandShortLabel(card);
                        return onHandLabel ? (
                          <span className="dh-card__keyword-tag dh-card__keyword-tag--onhand inline-block mt-0.5" title="上手：此牌进入手牌时自动触发效果">{onHandLabel}</span>
                        ) : null;
                      })()}
                      {card.topOnRecycleRestore && (
                        <span className="dh-card__keyword-tag dh-card__keyword-tag--top inline-block mt-0.5" title="置顶：从回收袋洗回时直接进入背包顶（第 1 格）">置顶</span>
                      )}
                      {card.nonCopyable && (
                        <span className="dh-card__keyword-tag dh-card__keyword-tag--nocopy inline-block mt-0.5" title="不可复制：「镜影摹形」无法选此卡为复制目标">不可复制</span>
                      )}
                    </div>
                  )}
                  {!isMagicLikeCard && card.transformBonus && (
                    <div className="relative z-10 w-full text-center mt-0.5">
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--elite inline-block">转型：{card.transformBonus}</span>
                    </div>
                  )}
                  {!isMagicLikeCard && card.flankEffect && (
                    <div className="relative z-10 w-full text-center mt-0.5">
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--elite inline-block">侧击：{card.flankEffect}</span>
                    </div>
                  )}
                  {isEventCard && (
                    <div className="relative z-10 w-full flex flex-col gap-1">
                      {card.specialTrigger && (
                        <div className="dh-card__event-option text-left break-words leading-snug text-violet-800/80 italic">
                          <span className="font-semibold not-italic">特殊触发：</span>{card.specialTrigger}
                        </div>
                      )}
                      {card.eventChoices?.map((choice, idx) =>
                        choice.diceTable?.length ? (
                          <div key={idx} className="flex flex-col gap-0.5">
                            <div className="dh-card__event-option text-left break-words leading-snug text-zinc-900">
                              <span className="text-amber-600 mr-0.5">🎲</span> 掷出不同结果：
                            </div>
                            {choice.diceTable.map(entry => (
                              <div
                                key={entry.id}
                                className="dh-card__event-option text-left break-words leading-snug text-zinc-900 pl-2"
                              >
                                <span className="text-violet-600 mr-0.5">◆</span> {entry.label}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div
                            key={idx}
                            className="dh-card__event-option text-left break-words leading-snug text-zinc-900"
                          >
                            <span className="text-violet-600 mr-0.5">◆</span> {choice.text}
                          </div>
                        )
                      )}
                      {card.waterfallEffect && (
                        <div className="dh-card__event-option text-left break-words leading-snug text-red-700/80 font-medium">
                          ⚠ {card.waterfallEffect.description}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom decorative bar */}
              <div className={`h-px mx-1 ${
                isEventCard
                  ? 'bg-gradient-to-r from-transparent via-violet-500/40 to-transparent'
                  : card.type === 'hero-magic'
                    ? 'bg-gradient-to-r from-transparent via-rose-500/40 to-transparent'
                    : 'bg-gradient-to-r from-transparent via-cyan-600/35 to-transparent'
              }`} />
              <div className={`relative z-10 flex items-center justify-center py-1 ${
                isEventCard
                  ? 'bg-violet-300/45'
                  : card.type === 'hero-magic'
                    ? 'bg-rose-300/45'
                    : 'bg-cyan-200/50'
              }`}>
                {getCardIcon()}
                {showUpgradeBadge && (
                  <div className="dh-card__upgrade-badge dh-card__upgrade-badge--magic" title={`已升级 ${upgradeLevel} 次`}>
                    <ArrowBigUpDash className="dh-card__upgrade-badge-icon" />
                    {upgradeLevel > 1 && (
                      <span className="dh-card__upgrade-badge-count">{upgradeLevel}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ========== STANDARD CARD LAYOUT (monsters, weapons, shields, potions, amulets) ========== */
            <>
              {hasCornerDeco && (
                <div
                  className={`absolute inset-0 pointer-events-none z-0 ${cornerDecoClass}`}
                  aria-hidden
                />
              )}
              {hasCornerDeco && insetFrameBorderClass && (
                <div
                  className={`absolute pointer-events-none rounded-sm ${
                    isCompact ? 'inset-[3px]' : 'inset-[6px]'
                  } border ${insetFrameBorderClass}`}
                  aria-hidden
                />
              )}
              {/* Image Area */}
              <div className={cardImageWrapperClassName}>
                {card.image && (
                  <img 
                    src={card.image} 
                    alt={card.name}
                    draggable={false}
                    className={cardImageClassName}
                  />
                )}
                {card.type === 'monster' && card.bossPhase && (
                  <div className="absolute inset-0 pointer-events-none border-2 border-red-500/50 rounded-sm bg-red-500/5" />
                )}
                {card.type === 'monster' && card.isStunned && (
                  <div className="dh-stun-overlay">
                    <svg className="dh-stun-overlay__icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                      <g className="dh-stun-overlay__spin">
                        {/* Spiral swirl */}
                        <path
                          d="M50 25 C60 25, 75 35, 75 50 C75 65, 60 75, 50 75 C35 75, 25 60, 30 48 C35 36, 48 35, 50 42 C52 49, 45 55, 42 50"
                          fill="none" stroke="#facc15" strokeWidth="4" strokeLinecap="round"
                        />
                        {/* Stars */}
                        <polygon points="20,18 22,12 24,18 30,20 24,22 22,28 20,22 14,20" fill="#fbbf24" />
                        <polygon points="76,22 78,16 80,22 86,24 80,26 78,32 76,26 70,24" fill="#fde68a" />
                        <polygon points="50,8 52,2 54,8 60,10 54,12 52,18 50,12 44,10" fill="#fbbf24" />
                        <polygon points="30,78 32,72 34,78 40,80 34,82 32,88 30,82 24,80" fill="#fde68a" />
                        <polygon points="72,72 74,66 76,72 82,74 76,76 74,82 72,76 66,74" fill="#fbbf24" />
                      </g>
                    </svg>
                  </div>
                )}
                {card.type === 'monster' && (card.isFinalMonster || card.bossPhase) && (
                  <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
                    <div className={`dh-card__caption text-center font-black tracking-widest text-white py-0.5 ${
                      card.bossPhase
                        ? 'bg-red-600/90'
                        : 'bg-red-600/70'
                    }`}>
                      {card.bossPhase ? 'BOSS' : '最终之敌'}
                    </div>
                  </div>
                )}
                {(card.type === 'weapon' || card.type === 'shield') && card.permEquipment && !showInlinePermPill && (
                  <div className="dh-card__overlay-tr z-10 pointer-events-none">
                    <span
                      className={`dh-card__caption flex items-center rounded-sm border border-cyan-300/50 bg-cyan-800/50 font-bold uppercase tracking-wide text-cyan-50 shadow-sm ${
                        isCompact ? 'gap-0 px-0.5 py-0' : 'gap-0.5 px-1 py-0.5'
                      }`}
                    >
                      <Infinity className="dh-icon-inline--compact shrink-0" aria-hidden />
                      <span className="tabular-nums leading-none">{permRecycleWaterfalls}</span>
                    </span>
                  </div>
                )}
                {card.type === 'amulet' && card.recycleDelay != null && (
                  <div className="dh-card__overlay-tr z-10 pointer-events-none">
                    <span
                      className={`dh-card__caption flex items-center rounded-sm border border-violet-300/50 bg-violet-800/60 font-bold uppercase tracking-wide text-violet-50 shadow-sm ${
                        isCompact ? 'gap-0 px-0.5 py-0' : 'gap-0.5 px-1 py-0.5'
                      }`}
                    >
                      <Infinity className="dh-icon-inline--compact shrink-0" aria-hidden />
                      <span className="tabular-nums leading-none">{permRecycleWaterfalls}</span>
                    </span>
                  </div>
                )}
                {card.type !== 'amulet' && !card.permEquipment && !isPermanentMagicCard && !card.isPermanentEvent && card.recycleDelay != null && card.recycleDelay > 0 && !showInlinePermPill && (
                  <div className="dh-card__overlay-tr z-10 pointer-events-none">
                    <span
                      className={`dh-card__caption flex items-center rounded-sm border border-amber-300/50 bg-amber-800/60 font-bold uppercase tracking-wide text-amber-50 shadow-sm ${
                        isCompact ? 'gap-0 px-0.5 py-0' : 'gap-0.5 px-1 py-0.5'
                      }`}
                    >
                      <Infinity className="dh-icon-inline--compact shrink-0" aria-hidden />
                      <span className="tabular-nums leading-none">{permRecycleWaterfalls}</span>
                    </span>
                  </div>
                )}
                {card.type === 'curse' && (
                  <div className="dh-card__overlay-tr z-10 pointer-events-none">
                    <span
                      className={`dh-card__caption flex items-center rounded-sm border border-rose-300/50 bg-rose-900/70 font-bold uppercase tracking-wide text-rose-50 shadow-sm ${
                        isCompact ? 'gap-0 px-0.5 py-0' : 'gap-0.5 px-1 py-0.5'
                      }`}
                      title="诅咒：无法被回收或弃置"
                    >
                      <Skull className="dh-icon-inline--compact shrink-0" aria-hidden />
                    </span>
                  </div>
                )}
                {showAmuletOverlay && (
                  <div className="dh-card__body-text absolute top-1.5 left-1.5 right-1.5 font-semibold text-black text-center px-1.5 py-0.5 tracking-wide pointer-events-none select-none drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]">
                    {amuletEffectText}
                    {card._counterDisplay && (
                      <span className="ml-1 font-bold text-amber-600">[{card._counterDisplay}]</span>
                    )}
                  </div>
                )}
                {showCombatOverlay && (
                  <div
                    className="combat-overlay"
                    data-swing-variant={showWeaponSwing ? weaponSwingVariant : undefined}
                    data-block-variant={showShieldBlock ? shieldBlockVariant : undefined}
                  >
                    {showBleedOverlay && card.type !== 'monster' && (
                      // Non-monster (equipment-slot etc.) damage keeps the
                      // original red blood-splatter CSS visual, scoped inside
                      // the card area. Monster damage now uses the same
                      // splatter as the hero — see `card-bleed-overlay`
                      // below, rendered as a sibling of <Card> so the spray
                      // can fly past the cell edge.
                      <>
                        <span className="combat-overlay__shape combat-overlay__shape--bleed" />
                        <span className="combat-overlay__shape combat-overlay__shape--bleed-drip" data-stagger="1" />
                        <span className="combat-overlay__shape combat-overlay__shape--bleed-ring" data-stagger="2" />
                      </>
                    )}
                    {showHealOverlay && (
                      <>
                        <span className="combat-overlay__shape combat-overlay__shape--heal" />
                        <span className="combat-overlay__shape combat-overlay__shape--heal-rise" data-stagger="1" />
                        <span className="combat-overlay__shape combat-overlay__shape--heal-ring" data-stagger="2" />
                      </>
                    )}
                    {showWeaponSwing && (
                      <>
                        <span className="combat-overlay__shape combat-overlay__shape--swing" />
                        <span className="combat-overlay__shape combat-overlay__shape--swing-echo" data-stagger="1" />
                        <span className="combat-overlay__shape combat-overlay__shape--swing-spark" data-stagger="2" />
                      </>
                    )}
                    {showShieldBlock && (
                      <>
                        <span className="combat-overlay__shape combat-overlay__shape--block" />
                        <span className="combat-overlay__shape combat-overlay__shape--block-ripple" data-stagger="1" />
                        <span className="combat-overlay__shape combat-overlay__shape--block-spark" data-stagger="2" />
                      </>
                    )}
                    {showDefeatOverlay && card.type === 'monster' && (
                      <Suspense fallback={null}>
                        <MonsterDeathLottie />
                      </Suspense>
                    )}
                  </div>
                )}

                {/* STAT OVERLAYS */}
                {card.type === 'monster' && (
                  <>
                    <div className="dh-card__overlay-tl">
                      <div className="relative group flex items-center">
                        {!isCompact && (
                          <div className="dh-card__icon-gap">
                            <Sword className={`dh-card__icon drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ${
                              monsterAttackModifier > 0 ? 'text-orange-500' : 'text-red-500'
                            }`} />
                          </div>
                        )}
                        <div className="flex items-baseline gap-0">
                          {flashHalvedValue != null ? (
                            <span className="dh-card__stat font-black text-purple-700 drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]">
                              {flashHalvedValue}
                            </span>
                          ) : isCompact ? (
                            <span className={`dh-card__stat font-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)] ${
                              (monsterAttackModifier > 0 || equipmentModifierNum !== 0) ? 'text-orange-600' : 'text-black'
                            }`}>
                              {monsterAttackBase + monsterAttackModifier + equipmentModifierNum}
                            </span>
                          ) : (
                            <>
                              <span className="dh-card__stat font-black text-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]">
                                {monsterAttackBase}
                              </span>
                              {monsterAttackModifier > 0 && (
                                <span className="dh-card__stat font-black text-orange-600 drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]">
                                  +{monsterAttackModifier}
                                </span>
                              )}
                              {equipmentStatModifierText && (
                                <span className={`dh-card__stat font-black ${equipmentStatModifierColor} drop-shadow-[0_0_6px_rgba(0,0,0,0.6)]`}>
                                  {equipmentStatModifierText}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="dh-card__overlay-tr flex flex-col items-end gap-0">
                      <div className="relative group flex items-center">
                        <div className="flex items-baseline gap-0 dh-card__icon-gap">
                          {(() => {
                            // Single-counter armor model. Two paths:
                            //   1. Equipped monster (isMonsterEquipmentCard): mirrors
                            //      shield rendering — show clamp(card.armor, cap)
                            //      where cap = max(0, baseHp + perm + temp). When
                            //      armor is undefined ("fresh / at full cap"), use
                            //      cap directly. This matches getSlotCurrentArmor
                            //      and the in-slot combat reads — so the displayed
                            //      number reflects the live armor remaining within
                            //      the current durability layer.
                            //   2. Row monster (not equipped): show baseHp +
                            //      modifiers as before — card.hp is already the
                            //      live HP for row monsters and lowGoldBuff is
                            //      reflected via monsterHpModifier.
                            // `equipmentShieldModifierNum` aggregates perm + temp +
                            // defense (see useCardOperations.ts).
                            if (isMonsterEquipmentCard(card)) {
                              const baseHp = card.hp ?? card.value ?? 0;
                              const cap = Math.max(0, baseHp + equipmentShieldModifierNum);
                              const currentArmor = card.armor === undefined
                                ? cap
                                : Math.max(0, Math.min(card.armor, cap));
                              const isDamaged = currentArmor < cap;
                              const isBoosted = equipmentShieldModifierNum > 0;
                              const colorClass = isDamaged
                                ? 'text-orange-500'
                                : isBoosted
                                  ? 'text-emerald-600'
                                  : 'text-black';
                              return (
                                <span className={`dh-card__stat font-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)] ${colorClass}`}>
                                  {currentArmor}
                                </span>
                              );
                            }
                            const totalHp = Math.max(
                              0,
                              monsterHpBase + monsterHpModifier + equipmentShieldModifierNum,
                            );
                            const isBoosted =
                              monsterHpModifier > 0 || equipmentShieldModifierNum !== 0;
                            return (
                              <span className={`dh-card__stat font-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)] ${
                                isBoosted ? 'text-emerald-600' : 'text-black'
                              }`}>
                                {totalHp}
                              </span>
                            );
                          })()}
                        </div>
                        {!isCompact && (
                          <div>
                            <Heart className={`dh-card__icon fill-red-500 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ${
                              monsterHpModifier > 0 || equipmentShieldModifierText ? 'text-emerald-500' : 'text-red-500'
                            }`} />
                          </div>
                        )}
                      </div>
                      {card.hpLayers && card.hpLayers > 1 && card.durability === undefined && (
                        <div className={`flex ${isCompact ? 'gap-px mt-0.5' : 'gap-0.5 mt-1'}`}>
                          {[...Array(card.hpLayers)].map((_, i) => (
                            <div 
                              key={i}
                              className={`${isCompact ? 'dh-card__layer-dot--compact' : 'dh-card__layer-dot'} rounded-full border border-black shadow-sm ${
                                i < (card.currentLayer || 1) ? 'bg-red-500' : 'bg-gray-400'
                              }`}
                            />
                          ))}
                        </div>
                      )}
                      {(card.durability !== undefined || card.maxDurability !== undefined) && totalDurabilityDots > 0 && (
                        <div className={`flex ${isCompact ? 'gap-px mt-0.5' : 'gap-0.5 mt-1'}`}>
                          {Array.from({ length: totalDurabilityDots }).map((_, i) => {
                            const dotValue = i + 1;
                            const isFilled = dotValue <= currentDurability;
                            return (
                              <div
                                key={dotValue}
                                className={`dh-card__durability-dot rounded-full border shadow-sm transition-colors ${
                                  isFilled
                                    ? 'bg-amber-400 border-amber-500 shadow-amber-500/40'
                                    : 'bg-slate-800/50 border-slate-600 opacity-50'
                                }`}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {card.lowGoldBuffActive && (
                      <div className="dh-card__lowgold-glow" />
                    )}
                  </>
                )}

                {card.type === 'building' && (
                  <>
                    <div className="dh-card__overlay-tl z-10 pointer-events-none flex items-center gap-0.5">
                      <span className="dh-card__caption rounded-sm border border-stone-500/60 bg-stone-700/75 px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-100">
                        建筑
                      </span>
                      {card.isGhost && (
                        <span className="rounded-sm border border-indigo-400/60 bg-indigo-900/70 px-0.5 py-0.5 text-[10px] leading-none text-indigo-200" title="幽灵：不阻挡瀑流，不计入剩余卡牌">
                          👻
                        </span>
                      )}
                    </div>
                    {card._amplifyTargetName && (
                      <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
                        <div className="bg-gradient-to-t from-black/80 to-transparent px-1 pb-0.5 pt-2">
                          <div className="flex items-center gap-0.5">
                            <span className="text-[9px] text-amber-300/80">🎯</span>
                            <span className="text-[9px] font-bold text-amber-200 truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                              {card._amplifyTargetName}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="dh-card__overlay-tr flex flex-col items-end gap-0">
                      <div className="relative group flex items-center">
                        <div className="flex items-baseline gap-0 dh-card__icon-gap">
                          <span className="dh-card__stat font-black text-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]">
                            {card.hp ?? card.value ?? 0}
                          </span>
                        </div>
                        {!isCompact && (
                          <div>
                            <Heart className="dh-card__icon fill-red-500 text-red-500 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" />
                          </div>
                        )}
                      </div>
                      {(() => {
                        const layerCount = Math.max(
                          1,
                          card.fury ?? card.hpLayers ?? card.currentLayer ?? 1,
                        );
                        const curLayer = Math.min(
                          layerCount,
                          Math.max(0, card.currentLayer ?? card.fury ?? layerCount),
                        );
                        if (layerCount <= 1) return null;
                        return (
                          <div className={`flex ${isCompact ? 'gap-px mt-0.5' : 'gap-0.5 mt-1'}`}>
                            {[...Array(layerCount)].map((_, i) => (
                              <div
                                key={i}
                                className={`${isCompact ? 'dh-card__layer-dot--compact' : 'dh-card__layer-dot'} rounded-full border border-black shadow-sm ${
                                  i < curLayer ? 'bg-stone-600' : 'bg-gray-400'
                                }`}
                              />
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </>
                )}

                {(card.type === 'weapon' || card.type === 'shield') && (
                  <>
                    <div className="dh-card__overlay-tl">
                      <div className="relative group flex items-center">
                        {!isCompact && (
                          <div className="dh-card__icon-gap">
                            {card.type === 'weapon' ? (
                              <Sword className="dh-card__icon text-amber-400 fill-amber-400 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" />
                            ) : (
                              <Shield className="dh-card__icon text-blue-400 fill-blue-400 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" />
                            )}
                          </div>
                        )}
                        <div className="flex items-baseline gap-0">
                          {(card.type === 'shield' && card.armorMax != null && card.armorMax > 0) ? (() => {
                            // Single-counter armor model: render one number Z = clamp(armor, cap)
                            // where cap = max(0, baseArmorMax + perm + temp). `permBonus` here
                            // already aggregates perm + temp + defense (see useCardOperations).
                            const baseArmorMax = card.armorMax!;
                            const permBonus = equipmentStatModifier?.permanentShieldBonus ?? 0;
                            const cap = Math.max(0, baseArmorMax + permBonus);
                            const currentArmor = card.armor === undefined
                              ? cap
                              : Math.max(0, Math.min(card.armor, cap));
                            const isDamaged = currentArmor < cap;
                            const isBoosted = permBonus > 0;
                            const colorClass = isDamaged
                              ? 'text-orange-500'
                              : isBoosted
                                ? 'text-emerald-600'
                                : 'text-cyan-600';
                            return (
                              <span className={`dh-card__stat font-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)] ${colorClass}`}>
                                {currentArmor}
                              </span>
                            );
                          })() : isCompact ? (
                            <span className={`dh-card__stat font-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)] ${
                              flashHalvedValue != null && card.type === 'weapon' ? 'text-purple-700'
                              : equipmentModifierNum !== 0 ? 'text-emerald-600'
                              : 'text-black'
                            }`}>
                              {flashHalvedValue != null && card.type === 'weapon'
                                ? flashHalvedValue
                                : card.value + equipmentModifierNum}
                            </span>
                          ) : (
                            <>
                              <span className={`dh-card__stat font-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)] ${flashHalvedValue != null && card.type === 'weapon' ? 'text-purple-700' : 'text-black'}`}>
                                {flashHalvedValue != null && card.type === 'weapon' ? flashHalvedValue : card.value}
                              </span>
                              {equipmentStatModifierText && (
                                <span className={`dh-card__stat font-black ${equipmentStatModifierColor} drop-shadow-[0_0_6px_rgba(0,0,0,0.6)] text-lg`}>
                                  {equipmentStatModifierText}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    {(card.durability !== undefined || card.maxDurability !== undefined) && totalDurabilityDots > 0 && (
                      <div className={`dh-card__overlay-tr flex flex-col items-end ${isCompact ? '' : 'dh-card__overlay-tr--lg'}`}>
                        <div className={`flex ${isCompact ? 'gap-px' : 'gap-0.5'}`}>
                          {Array.from({ length: totalDurabilityDots }).map((_, i) => {
                            const dotValue = i + 1;
                            const isFilled = dotValue <= currentDurability;
                            return (
                              <div
                                key={dotValue}
                                className={`dh-card__durability-dot rounded-full border shadow-sm transition-colors ${
                                  isFilled
                                    ? 'bg-amber-400 border-amber-500 shadow-amber-500/40'
                                    : 'bg-slate-800/50 border-slate-600 opacity-50'
                                }`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {isPotionCard && isHealingPotion && (
                  <div className="absolute bottom-2 w-full flex justify-center">
                    <div className="relative group flex items-center">
                      <span className="dh-card__stat font-black text-black drop-shadow-[0_0_6px_rgba(255,255,255,0.9)] mr-1">
                        +{card.value}
                      </span>
                      <Heart className="dh-card__icon text-green-500 fill-green-500 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" />
                    </div>
                  </div>
                )}
                {showUpgradeBadge && (
                  <div className="dh-card__upgrade-badge" title={`已升级 ${upgradeLevel} 次`}>
                    <ArrowBigUpDash className="dh-card__upgrade-badge-icon" />
                    {upgradeLevel > 1 && (
                      <span className="dh-card__upgrade-badge-count">{upgradeLevel}</span>
                    )}
                  </div>
                )}
              </div>
              
              {/* Text Area */}
              <div
                className={`flex-1 ${isCompact ? 'dh-card__text-area--compact' : 'dh-card__text-area'} flex flex-col items-center justify-start text-center overflow-hidden relative ${hasCornerDeco ? 'z-[1] ' : ''}${cardTextAreaBgClass}`}
              >
                {showInlinePermPill ? (
                  <div className={`flex w-full items-center justify-center gap-1 ${isCompact ? 'px-0' : 'px-1'}`}>
                    <span
                      className={`dh-card__caption flex items-center rounded-sm border font-bold uppercase tracking-wide shadow-sm shrink-0 ${
                        inlinePermVariant === 'cyan'
                          ? 'border-cyan-300/50 bg-cyan-800/50 text-cyan-50'
                          : 'border-amber-300/50 bg-amber-800/60 text-amber-50'
                      } ${isCompact ? 'gap-0 px-0.5 py-0' : 'gap-0.5 px-1 py-0.5'}`}
                    >
                      <Infinity className="dh-icon-inline--compact shrink-0" aria-hidden />
                      <span className="tabular-nums leading-none">{permRecycleWaterfalls}</span>
                    </span>
                    <h3
                      className={`dh-card__name font-serif font-semibold min-w-0 flex-1 truncate ${
                        isThemedImageCard ? 'text-gray-900' : ''
                      }`}
                      title={card.name}
                    >
                      {card.name}
                    </h3>
                  </div>
                ) : (
                  <h3 className={`dh-card__name font-serif font-semibold w-full truncate ${isCompact ? 'px-0' : 'px-1'} ${
                    isThemedImageCard ? 'text-gray-900' : ''
                  }`} title={card.name}>
                    {card.name}
                  </h3>
                )}

                {isMonsterEquipmentCard(card) && (card.onAttackEffect?.startsWith('steal-gold-') || card.eliteLowGoldPower || card.goblinStealScale || card.goblinStackHeal || card.goblinStealEquip || card.monsterSpecial === 'ogre-crit' || card.eliteDoubleAttack || card.hasRevive || card.hasEquipmentRevive || card.monsterSpecial === 'bone-regen' || card.lastWords || card.bleedEffect || card.eliteRegenHeroTurn || card.dragonDamageRetaliation || card.dragonBleedDestroy || card.skeletonLastWordsDiscard || card.skeletonReRevive || card.monsterSpecial === 'wraith-rebirth' || card.wraithDeathHeal || card.wraithDeathHealSpread || card.wraithTurnEnrage || card.swarmCorrode || card.swarmBugletShield || card.monsterSpecial === 'swarm-elite' || card.antiMagicReflect || card.spellDamageReduction || card.maxDamagePerHit || card.golemLayerLossReflect || card.golemSpellGrowth || card.onDestroyEffect || card.lastWordsSlotTempBuff || card.lastWordsMaxHpBoost || card.bossRetaliationDamage || card.bossLastStandAura || card.bossEnrageGraveyardSummon || card._potionStunBonusApplied) && (
                  <div className="dh-card__keyword-row">
                    {card.onAttackEffect?.startsWith('steal-gold-') && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--onattack" title="窃金：攻击时为Hero偷钱">窃金</span>
                    )}
                    {card.eliteLowGoldPower && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--enter" title="窘境：金币≥30时攻击力和护盾翻倍">窘境</span>
                    )}
                    {card.goblinStealScale && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--onattack" title="贪敛：每次窃金时，本装备攻击力 +N、生命值 +N（N = 窃金金额）">贪敛</span>
                    )}
                    {card.goblinStackHeal && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--onattack" title="劝降：攻击时免费劝降怪物">劝降</span>
                    )}
                    {card.goblinStealEquip && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--enter" title="精劝：多装备且下层有装备时劝降概率+30%">精劝</span>
                    )}
                    {card.monsterSpecial === 'ogre-crit' && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title="暴击：攻击伤害始终翻倍">暴击</span>
                    )}
                    {card.eliteDoubleAttack && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--elite" title="连击：50%概率可以再攻击一次">连击</span>
                    )}
                    {(card.hasRevive || card.hasEquipmentRevive) && (() => {
                      const allUsed = (!card.hasRevive || card.reviveUsed) && (!card.hasEquipmentRevive || card.equipmentReviveUsed);
                      return (
                        <span className={`dh-card__keyword-tag ${allUsed ? 'dh-card__keyword-tag--revive-used' : 'dh-card__keyword-tag--revive'}`}
                          title={allUsed ? '复生已触发' : '耐久耗完时以1耐久复生'}>
                          {allUsed ? '已复生' : '复生'}
                        </span>
                      );
                    })()}
                    {card.skeletonLastWordsDiscard && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title="骸弃：装备被毁坏时抽1张牌">骸弃</span>
                    )}
                    {card.skeletonReRevive && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--revive" title="轮回：另一装备被毁坏时获得复生">轮回</span>
                    )}
                    {card.monsterSpecial === 'bone-regen' && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--revive" title="骸生：每次失去耐久40%概率恢复">骸生</span>
                    )}
                    {card.lastWords === 'discard-hand-3' && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--enter" title="撕牌：抽 3 张牌">撕牌</span>
                    )}
                    {card.lastWords?.startsWith('wraith-haunt') && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title="缠绕：另一装备获得临时攻击">缠绕</span>
                    )}
                    {card.monsterSpecial === 'wraith-rebirth' && (
                      <span className={`dh-card__keyword-tag ${card.wraithRebirthUsed ? 'dh-card__keyword-tag--revive-used' : 'dh-card__keyword-tag--revive'}`}
                        title={card.wraithRebirthUsed ? '重生已触发' : '耐久第一次降到1时50%概率回满'}>
                        {card.wraithRebirthUsed ? '已重生' : '重生'}
                      </span>
                    )}
                    {card.wraithDeathHealSpread && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title="传魂：遗言+1耐久并传递遗言">传魂</span>
                    )}
                    {card.wraithDeathHeal != null && card.wraithDeathHeal > 0 && !card.wraithDeathHealSpread && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title="祝福：遗言另一装备耐久+1">祝福</span>
                    )}
                    {(card.onDestroyEffect === 'slot-temp-buff-3-3' || (card.lastWordsSlotTempBuff ?? 0) > 0) && (() => {
                      const stacks = (card.lastWordsSlotTempBuff ?? 0)
                        + (card.onDestroyEffect === 'slot-temp-buff-3-3' ? 1 : 0);
                      const amt = 3 * stacks;
                      return (
                        <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords"
                          title={`遗言：装备毁坏时该装备栏 +${amt}临时攻击 +${amt}临时护甲${stacks > 1 ? `（×${stacks} 层）` : ''}`}>
                          {stacks > 1 ? `遗言×${stacks}` : '遗言'}
                        </span>
                      );
                    })()}
                    {(card.lastWordsMaxHpBoost ?? 0) > 0 && (() => {
                      const stacks = card.lastWordsMaxHpBoost ?? 0;
                      const amt = 4 * stacks;
                      return (
                        <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords"
                          title={`遗言：装备毁坏时永久最大生命 +${amt}${stacks > 1 ? `（×${stacks} 层）` : ''}`}>
                          {stacks > 1 ? `遗言×${stacks}` : '遗言'}
                        </span>
                      );
                    })()}
                    {card.onDestroyEffect?.startsWith('stunCap+') && (() => {
                      const amt = parseInt(card.onDestroyEffect.replace('stunCap+', ''), 10) || 0;
                      return amt > 0 ? (
                        <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title={`遗言：装备毁坏时击晕上限 +${amt}%`}>遗言</span>
                      ) : null;
                    })()}
                    {card.onDestroyEffect?.startsWith('allSlotTempArmor:') && (() => {
                      const amt = parseInt(card.onDestroyEffect.replace('allSlotTempArmor:', ''), 10) || 0;
                      return amt > 0 ? (
                        <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title={`遗言：装备毁坏时所有装备栏 +${amt}临时护甲`}>遗言</span>
                      ) : null;
                    })()}
                    {card.wraithTurnEnrage && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title="诅咒：瀑流时激怒所有怪物+护符上限+1">诅咒</span>
                    )}
                    {card.bleedEffect && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title="狂怒：每失去1耐久攻击力+3">狂怒</span>
                    )}
                    {card.eliteRegenHeroTurn && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--revive" title="再生：怪物回合内未掉血则恢复1耐久">再生</span>
                    )}
                    {card.dragonDamageRetaliation != null && card.dragonDamageRetaliation > 0 && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--onattack" title="龙息：每格挡一次，对随机怪物造成2点伤害">龙息</span>
                    )}
                    {card.dragonBleedDestroy && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title="破甲：失去耐久时破坏所有高耐久装备">破甲</span>
                    )}
                    {card.swarmCorrode && card.durability != null && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title="腐蚀：攻击时立刻让目标-1血层">腐蚀</span>
                    )}
                    {card.swarmBugletShield && card.durability != null && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--revive" title="虫盾：另一装备是小虫子时格挡不掉耐久">虫盾</span>
                    )}
                    {card.monsterSpecial === 'swarm-elite' && card.durability != null && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--enter" title="虫母：掉耐久时将另一装备替换为小虫子">虫母</span>
                    )}
                    {card.antiMagicReflect != null && card.antiMagicReflect > 0 && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title={`反魔：玩家每使用一张法术牌，对玩家造成 ${card.antiMagicReflect} 点伤害`}>反魔</span>
                    )}
                    {card.spellDamageReduction != null && card.spellDamageReduction > 0 && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--revive" title={`抗性：受到的法术伤害减少 ${Math.round(card.spellDamageReduction * 100)}%`}>抗性</span>
                    )}
                    {card.maxDamagePerHit != null && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--elite" title={card.durability != null ? `护体：格挡时每次最多掉 ${card.maxDamagePerHit} 护甲` : `护体：每次最多受到 ${card.maxDamagePerHit} 点伤害`}>护体</span>
                    )}
                    {card.golemLayerLossReflect != null && card.golemLayerLossReflect > 0 && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title={card.durability != null ? `反震：掉耐久时对随机怪物造成 ${card.golemLayerLossReflect}×已损失耐久 伤害` : `反震：每次掉1血层，对玩家造成 ${card.golemLayerLossReflect}×已损失血层 点伤害`}>反震</span>
                    )}
                    {card.golemSpellGrowth != null && card.golemSpellGrowth > 0 && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title={card.durability != null ? `吞噬：每次瀑流时反震系数 +${card.golemSpellGrowth}` : `吞噬：每个怪物回合结束时，反魔伤害 +${card.golemSpellGrowth}，反震系数 +${card.golemSpellGrowth}`}>吞噬</span>
                    )}
                    {card.bossRetaliationDamage != null && card.bossRetaliationDamage > 0 && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title={`反噬：每次受到伤害，对英雄造成 ${card.bossRetaliationDamage} 点直接伤害（无视护盾）`}>反噬</span>
                    )}
                    {card.bossLastStandAura && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--onattack" title="暴走：血层为 1 时，每个怪物回合结束，激活行所有怪物 +5 攻击并恢复 1 血层">暴走</span>
                    )}
                    {card.bossEnrageGraveyardSummon != null && card.bossEnrageGraveyardSummon > 0 && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title={`召唤：被激怒时，从坟场取 ${card.bossEnrageGraveyardSummon} 张牌：2 怪物各占 1 个非 boss 格的顶层（进场时当前血层为 1），2 非怪物堆叠在另一个非 boss 格上；被召唤的怪物立即激怒`}>召唤</span>
                    )}
                  </div>
                )}
                {card.type === 'monster' && !isMonsterEquipmentCard(card) && (card.monsterSpecial || card.hasRevive || card.hasEquipmentRevive || card.lastWords || card.bleedEffect || card.enterEffect || card.onAttackEffect || card.ogreStun || card.eliteDoubleAttack || card.ogreEnterDiscard || card.dragonAttackNoLayerCost || card.dragonDamageRetaliation || card.dragonBleedDestroy || card.eliteHealOtherMonster || card.eliteRegenHeroTurn || card.eliteLowGoldPower || card.skeletonNoLayerCost || card.skeletonNoLayerCostActive || card.skeletonLastWordsDiscard || card.skeletonReRevive || card.wraithTurnAttack || card.wraithDeathHeal || card.wraithAuraAttack || card.wraithDeathHealSpread || card.wraithTurnEnrage || card.wraithDestroyAmulet || card.goblinStealCard || card.goblinStealScale || card.goblinStackHeal || card.goblinStealEquip || card.isStunned || card.swarmSpawn || card.isBuglet || card.bugletLastWordsHeal || card.swarmHordeRage || card.swarmCorrode || card.swarmBugletShield || card.antiMagicReflect || card.spellDamageReduction || card.maxDamagePerHit || card.golemLayerLossReflect || card.golemSpellGrowth || card.bossRetaliationDamage || card.bossLastStandAura || card.bossEnrageGraveyardSummon) && (
                  <div className="dh-card__keyword-row">
                    {card.swarmSpawn && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--enter" title="繁殖：每移除一张地城牌，在该位置生成小虫子">繁殖</span>
                    )}
                    {card.monsterSpecial === 'swarm-elite' && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title="虫母：每次受到伤害时，将激活行一张非怪物牌替换为小虫子">虫母</span>
                    )}
                    {card.isBuglet && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--onattack" title="衍生：由虫群生成的衍生怪物">衍生</span>
                    )}
                    {card.bugletLastWordsHeal && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title="遗念：死亡时，激活行其他所有小虫子恢复1血层">遗念</span>
                    )}
                    {card.swarmHordeRage && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--enter" title="集结：当激活行怪物≥3时，所有怪物被激怒，并+3攻击+3血量">集结</span>
                    )}
                    {card.swarmCorrode && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title="腐蚀：攻击时，格挡护盾立刻-1耐久度（不计入格挡耐久次数）">腐蚀</span>
                    )}
                    {card.swarmBugletShield && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--revive" title="虫盾：激活行有小虫子时，受到的伤害为0">虫盾</span>
                    )}
                    {(card.hasRevive || card.hasEquipmentRevive) && (() => {
                      const allUsed = (!card.hasRevive || card.reviveUsed) && (!card.hasEquipmentRevive || card.equipmentReviveUsed);
                      return (
                        <span className={`dh-card__keyword-tag ${allUsed ? 'dh-card__keyword-tag--revive-used' : 'dh-card__keyword-tag--revive'}`}
                          title={allUsed ? '复生已触发' : '首次死亡时以1血层复生'}>
                          {allUsed ? '已复生' : '复生'}
                        </span>
                      );
                    })()}
                    {card.lastWords === 'discard-hand-3' && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title="撕牌：死亡时随机弃回玩家3张手牌">撕牌</span>
                    )}
                    {card.lastWords?.startsWith('wraith-haunt') && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title="缠绕：死亡时同行其他怪物攻击力 +X，同行卡牌位置随机打乱">缠绕</span>
                    )}
                    {card.lastWords && card.lastWords !== 'discard-hand-3' && !card.lastWords.startsWith('wraith-haunt') && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title="散音：死亡时触发遗言效果">散音</span>
                    )}
                    {card.bleedEffect && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title={`狂怒：每失去一个血层，攻击力+${card.bleedEffect.replace('attack+', '')}`}>狂怒</span>
                    )}
                    {card.enterEffect && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--enter" title="开战：进入战斗行时，整行怪物自动激怒">开战</span>
                    )}
                    {card.onAttackEffect?.startsWith('steal-gold-') && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--onattack" title="窃金：攻击时偷取金币">窃金</span>
                    )}
                    {card.onAttackEffect && !card.onAttackEffect.startsWith('steal-gold-') && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--onattack" title="动手：每次攻击时触发">动手</span>
                    )}
                    {card.ogreStun && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--onattack" title="震晕：攻击时30%概率击晕玩家（装备栏和护符栏冻结一回合）">震晕</span>
                    )}
                    {card.eliteDoubleAttack && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--elite" title="连击：攻击时70%概率再攻击一次">连击</span>
                    )}
                    {card.monsterSpecial === 'ogre-crit' && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title="暴击：攻击伤害始终翻倍">暴击</span>
                    )}
                    {card.ogreEnterDiscard && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--enter" title="震慑：入场时随机弃回一张手牌">震慑</span>
                    )}
                    {card.dragonAttackNoLayerCost && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--revive" title="龙鳞：上回合掉过血层时，本次攻击不消耗血层">龙鳞</span>
                    )}
                    {card.dragonDamageRetaliation != null && card.dragonDamageRetaliation > 0 && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--onattack" title={`龙息：每受到一次伤害，对玩家造成 ${card.dragonDamageRetaliation} 点法术伤害`}>龙息</span>
                    )}
                    {card.dragonBleedDestroy && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title="破甲：失去血层时破坏高耐久装备">破甲</span>
                    )}
                    {card.eliteHealOtherMonster && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--revive" title="庇护：Hero回合未掉血层时，为激活行另一个怪物恢复1血层">庇护</span>
                    )}
                    {card.eliteRegenHeroTurn && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--revive" title="再生：Hero回合未掉血层时，自身恢复1血层">再生</span>
                    )}
                    {(card.skeletonNoLayerCost || card.skeletonNoLayerCostActive) && (
                      <span
                        className={`dh-card__keyword-tag ${card.skeletonNoLayerCostActive ? 'dh-card__keyword-tag--revive' : 'dh-card__keyword-tag--revive-used'}`}
                        title={card.skeletonNoLayerCostActive ? '无尽（已激活）：攻击不消耗血层' : '无尽：复生后，攻击不再消耗血层'}>
                        无尽
                      </span>
                    )}
                    {card.skeletonLastWordsDiscard && !card.lastWords && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title="骸弃：死亡时随机弃回玩家1张手牌">骸弃</span>
                    )}
                    {card.skeletonReRevive && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--revive" title="轮回：同行其他怪物被击败时，若已复生过，再次获得复生">轮回</span>
                    )}
                    {card.monsterSpecial === 'bone-regen' && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--revive" title="骸生：每次失去 1 血层时，40% 概率恢复 1 血层">骸生</span>
                    )}
                    {card.wraithTurnAttack != null && card.wraithTurnAttack > 0 && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title={`蓄积：每个怪物回合结束时攻击力 +${card.wraithTurnAttack}`}>蓄积</span>
                    )}
                    {card.wraithDeathHeal != null && card.wraithDeathHeal > 0 && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title={`祝福：死亡时同行怪物生命+${card.wraithDeathHeal}`}>祝福</span>
                    )}
                    {card.wraithAuraAttack != null && card.wraithAuraAttack > 0 && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title={`光环：每个怪物回合结束时，激活行所有怪物攻击力 +${card.wraithAuraAttack}（无需激怒）`}>光环</span>
                    )}
                    {card.wraithDeathHealSpread != null && card.wraithDeathHealSpread > 0 && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title={`传魂：死亡时同行怪物生命 +${card.wraithDeathHealSpread}，并传递此遗言`}>传魂</span>
                    )}
                    {card.wraithTurnEnrage && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--enter" title="诅咒：每个怪物回合结束时，使激活行所有怪物激怒">诅咒</span>
                    )}
                    {card.wraithDestroyAmulet && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title="碎符：每个怪物回合结束时，随机摧毁一个护符">碎符</span>
                    )}
                    {card.monsterSpecial === 'wraith-rebirth' && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--revive" title="重生：血层降至 1 时，30% 概率回满血层（可多次触发）">重生</span>
                    )}
                    {card.goblinStealCard && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--onattack" title="窃牌：攻击时偷走一张手牌">窃牌</span>
                    )}
                    {card.goblinStealScale && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--onattack" title="贪敛：偷到金币后攻击力和生命值同步增长">贪敛</span>
                    )}
                    {card.eliteLowGoldPower && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--elite" title="窘境：金币 ≤ 10 时攻击力和生命值翻倍">窘境</span>
                    )}
                    {card.goblinStackHeal && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--revive" title="疗养：回合结束掷骰，自身下方每有1张牌成功率 +15%（最高100%），成功则恢复1血层">疗养</span>
                    )}
                    {card.goblinStealEquip && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title="窃宝：回合结束掷骰，自身下方每有1张牌成功率 +25%（最高100%），成功则偷走1件装备或护符">窃宝</span>
                    )}
                    {card.antiMagicReflect != null && card.antiMagicReflect > 0 && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title={`反魔：玩家每使用一张法术牌，对玩家造成 ${card.antiMagicReflect} 点伤害`}>反魔</span>
                    )}
                    {card.spellDamageReduction != null && card.spellDamageReduction > 0 && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--revive" title={`抗性：受到的法术伤害减少 ${Math.round(card.spellDamageReduction * 100)}%`}>抗性</span>
                    )}
                    {card.maxDamagePerHit != null && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--elite" title={`护体：每次最多受到 ${card.maxDamagePerHit} 点伤害`}>护体</span>
                    )}
                    {card.golemLayerLossReflect != null && card.golemLayerLossReflect > 0 && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title={`反震：每次掉1血层，对玩家造成 ${card.golemLayerLossReflect}×已损失血层 点伤害`}>反震</span>
                    )}
                    {card.golemSpellGrowth != null && card.golemSpellGrowth > 0 && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title={`吞噬：每个怪物回合结束时，反魔伤害 +${card.golemSpellGrowth}，反震系数 +${card.golemSpellGrowth}`}>吞噬</span>
                    )}
                    {card.bossRetaliationDamage != null && card.bossRetaliationDamage > 0 && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--bleed" title={`反噬：每次受到伤害，对英雄造成 ${card.bossRetaliationDamage} 点直接伤害（无视护盾）`}>反噬</span>
                    )}
                    {card.bossLastStandAura && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--onattack" title="暴走：血层为 1 时，每个怪物回合结束，激活行所有怪物 +5 攻击并恢复 1 血层">暴走</span>
                    )}
                    {card.bossEnrageGraveyardSummon != null && card.bossEnrageGraveyardSummon > 0 && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title={`召唤：被激怒时，从坟场取 ${card.bossEnrageGraveyardSummon} 张牌：2 怪物各占 1 个非 boss 格的顶层（进场时当前血层为 1），2 非怪物堆叠在另一个非 boss 格上；被召唤的怪物立即激怒`}>召唤</span>
                    )}
                    {card._potionStunBonusApplied && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--stun" title={`雷震淬刃药：永久击晕率 ${card.weaponStunChance ?? 0}%`}>击晕 {card.weaponStunChance ?? 0}%</span>
                    )}
                    {card.isStunned && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--stun" title="晕眩：本回合无法行动">晕眩</span>
                    )}
                  </div>
                )}

                {(card.type === 'weapon' || card.type === 'shield') && (card.hasEquipmentRevive || card.onDestroyEffect || card.lastWordsSlotTempBuff || card.lastWordsMaxHpBoost || card.flankEffect || card.transformBonus || card._flipRepairBuff || !!card.onEnterHandEffect || card.topOnRecycleRestore || card.nonCopyable || (card.type === 'weapon' && card._potionStunBonusApplied)) && (
                  <div className="dh-card__keyword-row">
                    {card.hasEquipmentRevive && (
                      <span className={`dh-card__keyword-tag ${card.equipmentReviveUsed ? 'dh-card__keyword-tag--revive-used' : 'dh-card__keyword-tag--revive'}`}
                        title={card.equipmentReviveUsed ? '复生已触发' : '首次毁坏时以 1 耐久复生'}>
                        {card.equipmentReviveUsed ? '已复生' : '复生'}
                      </span>
                    )}
                    {(card.onDestroyEffect === 'slot-temp-buff-3-3' || (card.lastWordsSlotTempBuff ?? 0) > 0) && (() => {
                      const stacks = (card.lastWordsSlotTempBuff ?? 0)
                        + (card.onDestroyEffect === 'slot-temp-buff-3-3' ? 1 : 0);
                      const amt = 3 * stacks;
                      return (
                        <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords"
                          title={`遗言：装备毁坏时该装备栏 +${amt}临时攻击 +${amt}临时护甲${stacks > 1 ? `（×${stacks} 层）` : ''}`}>
                          {stacks > 1 ? `遗言×${stacks}` : '遗言'}
                        </span>
                      );
                    })()}
                    {(card.lastWordsMaxHpBoost ?? 0) > 0 && (() => {
                      const stacks = card.lastWordsMaxHpBoost ?? 0;
                      const amt = 4 * stacks;
                      return (
                        <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords"
                          title={`遗言：装备毁坏时永久最大生命 +${amt}${stacks > 1 ? `（×${stacks} 层）` : ''}`}>
                          {stacks > 1 ? `遗言×${stacks}` : '遗言'}
                        </span>
                      );
                    })()}
                    {card.onDestroyEffect?.startsWith('stunCap+') && (() => {
                      const amt = parseInt(card.onDestroyEffect.replace('stunCap+', ''), 10) || 0;
                      return amt > 0 ? (
                        <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title={`遗言：装备毁坏时击晕上限 +${amt}%`}>遗言</span>
                      ) : null;
                    })()}
                    {card.onDestroyEffect?.startsWith('allSlotTempArmor:') && (() => {
                      const amt = parseInt(card.onDestroyEffect.replace('allSlotTempArmor:', ''), 10) || 0;
                      return amt > 0 ? (
                        <span className="dh-card__keyword-tag dh-card__keyword-tag--lastwords" title={`遗言：装备毁坏时所有装备栏 +${amt}临时护甲`}>遗言</span>
                      ) : null;
                    })()}
                    {card.flankEffect && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--elite" title={`侧击：处于手牌最左/最右时触发 - ${card.flankEffect}`}>侧击：{card.flankEffect}</span>
                    )}
                    {card.transformBonus && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--elite" title={`转型：前一张牌类型不同时触发 - ${card.transformBonus}`}>转型：{card.transformBonus}</span>
                    )}
                    {card._flipRepairBuff && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--elite" title="熔铸耐久（翻转之契）：每次卡牌翻转时该装备恢复 1 耐久（不超过耐久上限）">熔铸</span>
                    )}
                    {(() => {
                      const onHandLabel = getOnEnterHandShortLabel(card);
                      return onHandLabel ? (
                        <span className="dh-card__keyword-tag dh-card__keyword-tag--onhand" title="上手：此牌进入手牌时自动触发效果">{onHandLabel}</span>
                      ) : null;
                    })()}
                    {card.topOnRecycleRestore && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--top" title="置顶：从回收袋洗回时直接进入背包顶（第 1 格）">置顶</span>
                    )}
                    {card.nonCopyable && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--nocopy" title="不可复制：「镜影摹形」无法选此卡为复制目标">不可复制</span>
                    )}
                    {card.type === 'weapon' && card._potionStunBonusApplied && (
                      <span className="dh-card__keyword-tag dh-card__keyword-tag--stun" title={`雷震淬刃药：永久击晕率 ${card.weaponStunChance ?? 0}%`}>击晕 {card.weaponStunChance ?? 0}%</span>
                    )}
                  </div>
                )}

                {(card.type === 'weapon' || card.type === 'shield') && (card.shortDescription || card.description) && (
                  <div className={`dh-card__body-text w-full text-gray-800 ${isCompact ? 'px-0' : 'px-1'} leading-tight`}>
                    {card.shortDescription || card.description}
                    {card.shieldBlockAutoUpgradeCount != null && (
                      <span className="ml-1 font-bold text-amber-600">
                        [{card._shieldBlockCount ?? 0}/{card.shieldBlockAutoUpgradeCount}]
                      </span>
                    )}
                  </div>
                )}

                {card.type === 'amulet' && amuletEffectText && !showAmuletOverlay && (
                  <div className={`dh-card__body-text w-full text-gray-800 ${isCompact ? 'px-0' : 'px-1'}`}>
                    {amuletEffectText}
                    {card._counterDisplay && (
                      <span className="ml-1 font-bold text-amber-600">[{card._counterDisplay}]</span>
                    )}
                  </div>
                )}
                {isPotionCard && potionDescription && (
                  <div className={`dh-card__body-text w-full text-gray-800 ${isCompact ? 'px-0' : 'px-1'}`}>
                    {potionDescription}
                  </div>
                )}

                {card.type === 'curse' && (card.shortDescription || card.description) && (
                  <div className={`dh-card__body-text w-full text-rose-100/95 ${isCompact ? 'px-0' : 'px-1'} leading-tight`}>
                    {card.shortDescription || card.description}
                  </div>
                )}

                {(card.type === 'potion' || card.type === 'amulet') && (!!card.onEnterHandEffect || !!card.topOnRecycleRestore || !!card.nonCopyable) && (() => {
                  const onHandLabel = getOnEnterHandShortLabel(card);
                  if (!onHandLabel && !card.topOnRecycleRestore && !card.nonCopyable) return null;
                  return (
                    <div className="dh-card__keyword-row">
                      {onHandLabel && (
                        <span className="dh-card__keyword-tag dh-card__keyword-tag--onhand" title="上手：此牌进入手牌时自动触发效果">{onHandLabel}</span>
                      )}
                      {card.topOnRecycleRestore && (
                        <span className="dh-card__keyword-tag dh-card__keyword-tag--top" title="置顶：从回收袋洗回时直接进入背包顶（第 1 格）">置顶</span>
                      )}
                      {card.nonCopyable && (
                        <span className="dh-card__keyword-tag dh-card__keyword-tag--nocopy" title="不可复制：「镜影摹形」无法选此卡为复制目标">不可复制</span>
                      )}
                    </div>
                  );
                })()}

                <div className="absolute bottom-1 right-1 flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
                  {getCardIcon()}
                </div>
              </div>
            </>
          )}
          {showExhaustedOverlay && isDragging && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/10 pointer-events-none">
              <X className="w-4/5 h-4/5 text-red-500/40 stroke-[3]" />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export function arePropsEqual(prev: GameCardProps, next: GameCardProps): boolean {
  if (prev.card !== next.card) {
    const a = prev.card;
    const b = next.card;
    if (
      a.id !== b.id ||
      a.name !== b.name ||
      a.attack !== b.attack ||
      a.hp !== b.hp ||
      a.value !== b.value ||
      a.durability !== b.durability ||
      a.maxDurability !== b.maxDurability ||
      a.armor !== b.armor ||
      a.armorMax !== b.armorMax ||
      a.armorBonusDamaged !== b.armorBonusDamaged ||
      a.currentLayer !== b.currentLayer ||
      a.hpLayers !== b.hpLayers ||
      a.fury !== b.fury ||
      a.image !== b.image ||
      a.type !== b.type ||
      a.permEquipment !== b.permEquipment ||
      a.recycleDelay !== b.recycleDelay ||
      a.description !== b.description ||
      a.shortDescription !== b.shortDescription ||
      a.magicEffect !== b.magicEffect ||
      a.scalingDamage !== b.scalingDamage ||
      a.transformBonus !== b.transformBonus ||
      a.transformEffect !== b.transformEffect ||
      a.flankEffect !== b.flankEffect ||
      a.flankDraw !== b.flankDraw ||
      a.flankEffectId !== b.flankEffectId ||
      a.specialAttackBoost !== b.specialAttackBoost ||
      a.tempAttackBoost !== b.tempAttackBoost ||
      a.tempHpBoost !== b.tempHpBoost ||
      a.maxHp !== b.maxHp ||
      a.hasRevive !== b.hasRevive ||
      a.reviveUsed !== b.reviveUsed ||
      a.bleedEffect !== b.bleedEffect ||
      a.onAttackEffect !== b.onAttackEffect ||
      a.lowGoldBuffActive !== b.lowGoldBuffActive ||
      a.ogreStun !== b.ogreStun ||
      a.ogreEnterDiscard !== b.ogreEnterDiscard ||
      a.dragonAttackNoLayerCost !== b.dragonAttackNoLayerCost ||
      a.dragonNoLayerCostActive !== b.dragonNoLayerCostActive ||
      a.dragonDamageRetaliation !== b.dragonDamageRetaliation ||
      a.dragonBleedDestroy !== b.dragonBleedDestroy ||
      a.eliteHealOtherMonster !== b.eliteHealOtherMonster ||
      a.skeletonNoLayerCost !== b.skeletonNoLayerCost ||
      a.skeletonNoLayerCostActive !== b.skeletonNoLayerCostActive ||
      a.skeletonLastWordsDiscard !== b.skeletonLastWordsDiscard ||
      a.skeletonReRevive !== b.skeletonReRevive ||
      a.wraithTurnAttack !== b.wraithTurnAttack ||
      a.wraithDeathHeal !== b.wraithDeathHeal ||
      a.wraithAuraAttack !== b.wraithAuraAttack ||
      a.wraithDeathHealSpread !== b.wraithDeathHealSpread ||
      a.wraithTurnEnrage !== b.wraithTurnEnrage ||
      a.wraithDestroyAmulet !== b.wraithDestroyAmulet ||
      a.goblinStealCard !== b.goblinStealCard ||
      a.goblinStealScale !== b.goblinStealScale ||
      a.goblinHasStolen !== b.goblinHasStolen ||
      a.goblinTrickCarrier !== b.goblinTrickCarrier ||
      a.goblinStackHeal !== b.goblinStackHeal ||
      a.goblinStealEquip !== b.goblinStealEquip ||
      a.hasReleaseCharge !== b.hasReleaseCharge ||
      a.isStunned !== b.isStunned ||
      a.wraithRebirthUsed !== b.wraithRebirthUsed ||
      a.eliteLowGoldPower !== b.eliteLowGoldPower ||
      a.eliteDoubleAttack !== b.eliteDoubleAttack ||
      a.eliteRegenHeroTurn !== b.eliteRegenHeroTurn ||
      a.enterEffect !== b.enterEffect ||
      a.monsterSpecial !== b.monsterSpecial ||
      a.upgradeLevel !== b.upgradeLevel ||
      a.swarmSpawn !== b.swarmSpawn ||
      a.isBuglet !== b.isBuglet ||
      a.bugletLastWordsHeal !== b.bugletLastWordsHeal ||
      a.swarmHordeRage !== b.swarmHordeRage ||
      a.swarmHordeBuffed !== b.swarmHordeBuffed ||
      a.swarmCorrode !== b.swarmCorrode ||
      a.swarmBugletShield !== b.swarmBugletShield ||
      // `defeatProcessed` flips between renders for two reasons:
      //   (1) kill: undefined → true (post-kill card is just
      //       `{ ...alive, defeatProcessed: true }` with no other field
      //       changes when fury > 1 and the monster is staging),
      //   (2) UNDO from staging state: true → undefined with NO other
      //       field changes — undo restores the original alive ref,
      //       which is identical except for this flag.
      // Without comparing `defeatProcessed` here, the memo returned true,
      // React skipped the re-render, and the `data-defeat="true"` attribute
      // (driven by `card.defeatProcessed` in GameCard render) stayed in the
      // DOM. The CSS `forwards` fill on `dh-card-death` then froze the
      // card grey for the rest of its life on the row.
      // See undo-at-staging-monster-no-gray.test.ts.
      a.defeatProcessed !== b.defeatProcessed ||
      a.hasEquipmentRevive !== b.hasEquipmentRevive ||
      a.equipmentReviveUsed !== b.equipmentReviveUsed ||
      a.lastWordsSlotTempBuff !== b.lastWordsSlotTempBuff ||
      a.lastWordsMaxHpBoost !== b.lastWordsMaxHpBoost ||
      a._shieldBlockCount !== b._shieldBlockCount ||
      a._counterDisplay !== b._counterDisplay ||
      a.magicType !== b.magicType ||
      a.isPermanentEvent !== b.isPermanentEvent ||
      a.isGhost !== b.isGhost ||
      a.amplifyBonus !== b.amplifyBonus ||
      a.onDiscardDraw !== b.onDiscardDraw ||
      a.potionEffect !== b.potionEffect ||
      a.amuletEffect !== b.amuletEffect ||
      a.onDestroyEffect !== b.onDestroyEffect ||
      a.onEnterHandEffect !== b.onEnterHandEffect ||
      a.topOnRecycleRestore !== b.topOnRecycleRestore ||
      a.nonCopyable !== b.nonCopyable ||
      a._flipRepairBuff !== b._flipRepairBuff ||
      a._potionStunBonusApplied !== b._potionStunBonusApplied ||
      a.weaponStunChance !== b.weaponStunChance ||
      a._potionStunBonusApplied !== b._potionStunBonusApplied ||
      a.weaponStunChance !== b.weaponStunChance ||
      a.bossPhase !== b.bossPhase ||
      a.bossRetaliationDamage !== b.bossRetaliationDamage ||
      a.bossLastStandAura !== b.bossLastStandAura ||
      a.bossEnrageGraveyardSummon !== b.bossEnrageGraveyardSummon
    ) {
      return false;
    }
  }
  return (
    prev.className === next.className &&
    prev.isWeaponDropTarget === next.isWeaponDropTarget &&
    prev.disableInteractions === next.disableInteractions &&
    prev.amuletDescriptionVariant === next.amuletDescriptionVariant &&
    prev.bleedAnimation === next.bleedAnimation &&
    prev.healAnimation === next.healAnimation &&
    prev.weaponSwingAnimation === next.weaponSwingAnimation &&
    prev.shieldBlockAnimation === next.shieldBlockAnimation &&
    prev.defeatAnimation === next.defeatAnimation &&
    prev.isEngaged === next.isEngaged &&
    prev.weaponSwingVariant === next.weaponSwingVariant &&
    prev.shieldBlockVariant === next.shieldBlockVariant &&
    prev.equipmentStatModifier === next.equipmentStatModifier &&
    prev.showExhaustedOverlay === next.showExhaustedOverlay
  );
}

const GameCard = memo(GameCardInner, arePropsEqual);
export default GameCard;
