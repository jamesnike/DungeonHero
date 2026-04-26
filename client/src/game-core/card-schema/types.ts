/**
 * Card Schema Types — declarative card effect model.
 *
 * A card's behavior is described as an array of CardEffect objects.
 * The execution engine processes them sequentially, building up a
 * ReduceResult (patch + sideEffects + enqueuedActions).
 */

import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { SideEffect, ReduceResult } from '../reducer';
import type { GameCardData } from '@/components/GameCard';
import type { EquipmentSlotId, EquipmentRepairTarget } from '@/components/game-board/types';
import type { EternalRelicId } from '../types';

// ---------------------------------------------------------------------------
// Permanent stat keys that can be modified via 'modifyStat'
// ---------------------------------------------------------------------------

export type PermanentStat =
  | 'permanentSpellDamageBonus'
  | 'permanentMaxHpBonus'
  | 'permanentSpellLifesteal'
  | 'backpackCapacityModifier'
  | 'handLimitBonus'
  | 'waterfallDealBonus'
  | 'stunCap'
  | 'tempShield';

// ---------------------------------------------------------------------------
// CardEffect — discriminated union of all effect primitives
// ---------------------------------------------------------------------------

export type CardEffect =
  // --- State modification ---
  | { type: 'heal'; amount: number | 'cardValue' }
  | { type: 'shield'; amount: number | 'cardValue' }
  | { type: 'modifyStat'; stat: PermanentStat; delta: number }
  | { type: 'clampHp' }
  | { type: 'modifyGold'; delta: number }

  // --- Card zone manipulation ---
  | { type: 'draw'; count: number | 'cardValue'; source: 'backpack' | 'deck' }
  | { type: 'drawClassToBackpack'; count: number }
  | { type: 'enforceBackpackCapacity' }

  // --- Equipment ---
  | { type: 'boostSlotBonuses'; slots: ('left' | 'right' | 'both')[]; damage?: number; shield?: number }
  | { type: 'modifySlotDurabilityMax'; slot: 'left' | 'right'; delta: number }
  | { type: 'swapSlotDamageShield' }
  | { type: 'repairSlot'; allowedTypes: EquipmentRepairTarget[]; amount: number }
  | { type: 'modifySlotDurabilityMaxChoose'; delta: number }
  | { type: 'modifySlotDamageChoose'; delta: number }
  | { type: 'modifySlotCapacityChoose' }
  | { type: 'grantLastWordsSlotTempBuff' }
  | { type: 'grantWeaponStunChanceChoose'; amount: number }
  | { type: 'equipSwap' }

  // --- Eternal relics ---
  // `stackable: true` lets the same relic id be granted multiple times. Each
  // additional grant pushes another EternalRelic instance into
  // `state.eternalRelics`; consumers count occurrences and scale magnitude
  // linearly. When omitted, the second use hits dupeLogMsg/dupeBannerMsg.
  | { type: 'grantEternalRelic'; relicId: EternalRelicId; logMsg: string; bannerMsg: string; dupeLogMsg: string; dupeBannerMsg: string; stackable?: boolean }

  // --- Interactive / UI ---
  | { type: 'interactive'; promptType: string; config: Record<string, unknown> }
  | { type: 'diceRoll'; config: Record<string, unknown> }
  | { type: 'magicChoice'; config: Record<string, unknown> }
  | { type: 'discoverGraveyardMagic' }
  | { type: 'discoverClassMagic' }
  | { type: 'grantPerm2' }
  | { type: 'transformRecycleGrant' }
  | { type: 'amplifyTargetWide' }
  | { type: 'amuletToEternalRelic' }

  // --- Logging ---
  | { type: 'log'; logType: string; message: string }
  | { type: 'banner'; text: string }

  // --- Finalization ---
  | { type: 'finalize' }

  // --- Custom (escape hatch for complex effects not yet abstracted) ---
  | { type: 'custom'; handlerId: string; params?: Record<string, unknown> };

// ---------------------------------------------------------------------------
// MagicResolver — full-control resolver for complex magic effects
// ---------------------------------------------------------------------------

export type MagicResolver = (
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number,
  isEchoTriggered: boolean,
  /**
   * 第 8 参数历史上既被某些 resolver 用作"目标 ID"（如击中怪物 id），也被另一些
   * resolver 用作"侧击标记 (isFlank)"。为了兼容两类 resolver，统一签名上做兼容声明：
   *   - target: 目标 id（字符串）
   *   - isFlank: 侧击布尔
   * 实际语义由各 resolver 内部按需解释。
   */
  target?: string,
  isFlank?: boolean,
) => ReduceResult | null;

// ---------------------------------------------------------------------------
// CardDefinition — a registered card template
// ---------------------------------------------------------------------------

export interface CardDefinition {
  /** Unique key: 'potion:heal', 'potion:shield', 'magic:fireball', etc. */
  effectId: string;
  /** The declarative effects pipeline. Ignored when `resolver` is set. */
  effects: CardEffect[];
  /** Optional tags for querying: 'damage', 'healing', 'buff', etc. */
  tags?: string[];
  /**
   * Full-control resolver that bypasses the declarative effects pipeline.
   * Receives pre-processed state (echo/counter already applied) and returns
   * a ReduceResult directly. Used for complex interactive effects.
   */
  resolver?: MagicResolver;
}

// ---------------------------------------------------------------------------
// Execution context passed through the effect pipeline
// ---------------------------------------------------------------------------

export interface ExecutionContext {
  state: GameState;
  card: GameCardData;
  patch: Partial<GameState>;
  sideEffects: SideEffect[];
  enqueuedActions: GameAction[];
  /**
   * Set by interactive executors (e.g. those opening a modal / awaiting player
   * input) to signal that subsequent effects in the same definition must NOT
   * run. The engine breaks the effect loop when this flag is true. Without
   * this, a trailing `{ type: 'finalize' }` effect would prematurely finalize
   * the card before the player's interactive choice resolves, leaving the
   * pending action in a stale state.
   */
  halt?: boolean;
  /** Magic-specific context computed during pre-processing. */
  magic?: MagicContext;
}

/**
 * Context for magic card resolution, computed before individual effect lookup.
 */
export interface MagicContext {
  echoMultiplier: number;
  echoTag: string;
  isEchoTriggered: boolean;
}
