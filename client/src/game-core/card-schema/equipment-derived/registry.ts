/**
 * Equipment-Derived Effect Registry
 *
 * 4 个表面（attack / block / shield-reflect / durability-loss）的统一注册表 + Runner，
 * 把「装备超频」（永恒护符 `equip-overclock`）光环下「装备衍生效果额外触发 1+N 次」
 * 的逻辑从 25+ 处手写散落实现收敛到一个地方。
 *
 * 跟 `on-equip.ts` / `on-enter-hand.ts` / `on-upgrade.ts` 是同一架构家族——
 * 每个表面有一份 `Map<id, handler>`，runner 顺序调用所有注册的 handler，并自动
 * 在「装备超频」aura active 时再调用 N 次。
 *
 * 不在本注册表覆盖范围（沿用既有专用机制）：
 *   - `onEquipEffect` → `card-schema/on-equip.ts`（已自带 1+N wrapper）
 *   - 装备 `lastWords` → `equipment-effects.ts:applyOneEquipmentLastWordsIteration`
 *     （已在 `1 + lastWordsExtraTriggerCount + overclockExtra` 循环里）
 *   - 手牌 `onDiscardDamage` / `onEnterHand` / 护符 / 怪物 `enterEffect` /
 *     建筑 / row-level —— 设计上明确**不**在装备超频范围内
 *
 * 详细设计（含 replay-safety contract、handler 签名约定、迁移阶段）：
 *   `EQUIPMENT_OVERCLOCK_REGISTRY_PLAN.md`
 */

import type { GameState } from '../../types';
import type { GameAction } from '../../actions';
import type { SideEffect } from '../../reducer';
import type { GameCardData } from '@/components/GameCard';
import type {
  EquipmentSlotId,
  ActiveAmuletEffects,
} from '@/components/game-board/types';
import type { RngState } from '../../rng';
import { equipOverclockExtraTriggers } from '../../rules/equipment-overclock';

// ---------------------------------------------------------------------------
// Surface definitions & per-surface contexts
// ---------------------------------------------------------------------------

/**
 * The four equipment-derived surfaces governed by 装备超频. Adding a 5th
 * surface here is a deliberate design decision — see the plan doc.
 */
export type EquipmentDerivedSurface = 'attack' | 'block' | 'shield-reflect' | 'durability-loss';

/**
 * Hero attack surface — fired inside `reducePerformHeroAttack` after damage
 * computation but before durability tick. Migrated in PR-4a / PR-4b.
 */
export interface AttackCtx {
  targetMonster: GameCardData;
  /**
   * Mutable view of `targetMonster` after prior in-pipeline mutations
   * (swarm-corrode layer steal, etc.). Handlers may read but should mutate
   * via `ctx.surfaceCtx.workingMonster = next` to share with subsequent
   * handlers in the same iteration.
   */
  workingMonster: GameCardData;
  monsterDefeated: boolean;
  finalDamage: number;
  baseDamage: number;
  isCrit: boolean;
  /** Number of times this attack triggered an overkill effect (for lifesteal scaling). */
  overkillHitCount: number;
  weaponDestroyed: boolean;
  isMonsterEquip: boolean;
  isBuildingTarget: boolean;
  attackEffectiveLifesteal: number;
  amuletEffects: ActiveAmuletEffects;
  /**
   * Scratch field for `post-attack-spell-damage` handler (PR-4b). Iter 1 picks
   * a random target from the board and stores `{ id, damage }` here so iter
   * 2..N (overclock replays) can re-target the same monster with the same
   * damage number without re-rolling RNG. Mirrors the original inline loop's
   * "target captured at iter 1, reused on subsequent loops" semantic.
   *
   * The original's defensive "if first target died, re-pick from survivors"
   * branch is dead code in practice (iter-1 target is always alive when
   * captured) and is intentionally not re-implemented here.
   */
  postAttackSpellTarget?: { id: string; damage: number };
}

/**
 * Block surface — fired inside `reduceResolveBlock` after armor calculation
 * but before reflect dispatch. Migrated in PR-5.
 */
export interface BlockCtx {
  monster: GameCardData;
  blockSlotId: EquipmentSlotId;
  isPerfectBlock: boolean;
  isFullBlockShield: boolean;
  isMonsterEquipShield: boolean;
  /** `slotItem.armor` cap = max(0, baseArmorMax + perm + temp). */
  storedCap: number;
  pendingBlockAttackValue: number;
  amuletEffects: ActiveAmuletEffects;
  /** Reflect damage decided by main block path (0 if no reflect). */
  reflectDmg: number;
  reflectSourceName: string;
  /**
   * Slot whose `damageReflect` / `reflectFullDamage` / `reflectHalfDamage` is
   * dispatching the reflect. Required for `combat:shieldReflect` side effect
   * payload. `null` when `reflectDmg === 0`.
   */
  reflectBlockSlotId: EquipmentSlotId | null;
  /**
   * Scratch field for `dragon-breath-shield-retaliation` handler (PR-5). Iter
   * 1 picks a random monster from the board (RNG-consuming) and stores its
   * id; iter 2..N re-target the same cached monster without re-rolling RNG.
   * Mirrors `attack-overkill.ts` `postAttackSpellTarget` pattern.
   */
  dragonBreathTarget?: { id: string };
}

/**
 * Shield-reflect dispatch surface — fired inside `reduceApplyShieldReflect`
 * before damage application. Migrated in PR-3.
 */
export interface ShieldReflectCtx {
  monster: GameCardData;
  /** Raw reflect damage (1×). Handlers that fire 1+N times will accumulate. */
  damageBase: number;
  sourceName: string;
  layersBefore: number;
}

/**
 * Durability-loss surface — fired inside `computeDurabilityLossEffects` after
 * `updatedItem` has had `newDurability` set but before armor strip / commit.
 * Migrated in PR-2.
 *
 * `updatedItem` is mutable — handlers may rewrite it (bleed bonus, wraith
 * rebirth refill, etc.) via `ctx.surfaceCtx.updatedItem = next`. Caller
 * (computeDurabilityLossEffects) reads the final value back from ctx after
 * runner returns.
 *
 * `rebirthAlreadySucceeded` is a scratch field for the wraith-rebirth handler
 * to encode its «extra rolls» semantic in a replay-safe way (handler returns
 * early on subsequent iterations once a previous iteration succeeded).
 */
export interface DurabilityLossCtx {
  prevDur: number;
  newDur: number;
  durLost: number;
  isMonsterEquip: boolean;
  otherSlotId: EquipmentSlotId;
  otherItem: GameCardData | null;
  /** Mutable across iterations. Handlers read-then-write via this field. */
  updatedItem: GameCardData;
  /** Output: golem-reflect damage decision (caller dispatches). */
  golemReflectDamage?: { targetId: string; damage: number; slotId: EquipmentSlotId };
  /** Scratch: handler-internal cross-iteration state (wraith-rebirth). */
  rebirthAlreadySucceeded?: boolean;
}

export type SurfaceCtxMap = {
  attack: AttackCtx;
  block: BlockCtx;
  'shield-reflect': ShieldReflectCtx;
  'durability-loss': DurabilityLossCtx;
};

// ---------------------------------------------------------------------------
// Generic handler context
// ---------------------------------------------------------------------------

/**
 * The full ctx passed to a handler. `surfaceCtx` is discriminated by `S`.
 */
export interface EquipmentDerivedCtx<S extends EquipmentDerivedSurface> {
  state: GameState;
  slotItem: GameCardData;
  slotId: EquipmentSlotId;

  // —— Shared accumulators (handlers write here) ——
  patch: Partial<GameState>;
  sideEffects: SideEffect[];
  enqueuedActions: GameAction[];

  /**
   * Carrying RNG. Handlers MUST read-then-write: `ctx.rng = nextInt(ctx.rng, ...)[1]`.
   * Runner threads this between iterations and between handlers.
   */
  rng: RngState;

  /** Surface tag for type narrowing. */
  surface: S;
  /** Surface-specific context (mutable for some fields — see per-surface notes). */
  surfaceCtx: SurfaceCtxMap[S];

  /**
   * `true` on the very first call of this handler within a runner invocation.
   * `false` on overclock replay iterations (1..N).
   *
   * Handlers MUST gate one-shot side effects on this flag:
   *   - log entries (`sideEffects.push({ event: 'log:entry', ... })`)
   *   - banners (`event: 'ui:banner'`)
   *   - counter / kill-counter advances
   *   - any «show this once» visual cue
   *
   * Effect actions that are inherently per-trigger
   * (`HEAL`, `DEAL_DAMAGE_TO_MONSTER`, `APPLY_DAMAGE`, etc.) and patch field
   * read-then-write accumulators (`patch.gold = (patch.gold ?? state.gold) + N`)
   * are safe to run every iteration — that IS the multiplier.
   */
  isFirstIteration: boolean;

  /**
   * `true` on the LAST call of this handler within a runner invocation.
   * For overclock=0: same iteration is both first AND last.
   * For overclock=N: iteration N (0-indexed) has `isLastIteration = true`.
   *
   * Handlers use this to flush «final state» logs (e.g. wraith-rebirth's
   * "all attempts failed" message that needs to know rolls are exhausted).
   */
  isLastIteration: boolean;

  /**
   * Total overclock extra triggers for this run (=
   * `equipOverclockExtraTriggers(state)`). Total iterations = `1 + overclockExtra`.
   *
   * Handlers that need to anticipate the FINAL aggregated value on
   * `isFirstIteration` (e.g. bleed logging "+9 (total)" rather than 3 separate
   * "+3" lines) can multiply by `(1 + overclockExtra)`.
   */
  overclockExtra: number;
}

export interface HandlerResult {
  /**
   * Did this handler do meaningful work in this iteration? Runner uses this
   * to decide whether to schedule overclock replay iterations.
   *
   * If `false` on `isFirstIteration === true` → handler is skipped entirely
   * (no replay). If `false` on a later iteration → that single iteration is
   * recorded but its result is otherwise discarded.
   */
  fired: boolean;

  /**
   * Did this iteration's work actually require overclock to fire? Used to
   * gate the `combat:equipOverclockTriggered` side effect — runner emits the
   * overclock surface side effect iff at least one handler iteration returned
   * `contributedToOverclock: true`.
   *
   * Default: `fired` itself. Most handlers (mine, bleed, golem) always
   * contribute to overclock when overclock is active and they fired. Wraith-
   * rebirth opts out (`false`) when its first roll succeeded with no rescue
   * needed — original UX only emits the overclock banner when overclock
   * actively rescued, not when overclock was idle.
   *
   * Note: runner additionally requires `overclockExtra > 0` before emitting
   * the side effect (this flag is irrelevant when no overclock is active).
   */
  contributedToOverclock?: boolean;
}

export type EquipmentDerivedHandler<S extends EquipmentDerivedSurface> = (
  ctx: EquipmentDerivedCtx<S>,
) => HandlerResult;

// ---------------------------------------------------------------------------
// Registry storage (per-surface typed Map)
// ---------------------------------------------------------------------------

type RegistryMap = {
  [S in EquipmentDerivedSurface]: Map<string, EquipmentDerivedHandler<S>>;
};

const registries: RegistryMap = {
  attack: new Map(),
  block: new Map(),
  'shield-reflect': new Map(),
  'durability-loss': new Map(),
};

function getRegistry<S extends EquipmentDerivedSurface>(
  surface: S,
): Map<string, EquipmentDerivedHandler<S>> {
  return registries[surface];
}

// ---------------------------------------------------------------------------
// Registration API
// ---------------------------------------------------------------------------

/**
 * Register a single equipment-derived handler.
 *
 * Insertion order is preserved — runner iterates handlers in registration
 * order. ORDER MATTERS for surfaces where handlers depend on prior mutations
 * (e.g. attack-surface: swarm-corrode must register before kill-gold-scaling
 * because swarm-corrode can flip `monsterDefeated`).
 */
export function registerEquipmentDerivedHandler<S extends EquipmentDerivedSurface>(
  surface: S,
  id: string,
  handler: EquipmentDerivedHandler<S>,
): void {
  getRegistry(surface).set(id, handler);
}

/**
 * Bulk register variant — preserves array order.
 */
export function registerEquipmentDerivedHandlers<S extends EquipmentDerivedSurface>(
  surface: S,
  entries: Array<{ id: string; handler: EquipmentDerivedHandler<S> }>,
): void {
  const reg = getRegistry(surface);
  for (const { id, handler } of entries) {
    reg.set(id, handler);
  }
}

/**
 * Test helper — clears all handlers for a surface. Production code never
 * calls this; tests use it in `beforeEach` to ensure isolation.
 */
export function __clearEquipmentDerivedHandlers(
  surface?: EquipmentDerivedSurface,
): void {
  if (surface) {
    getRegistry(surface).clear();
    return;
  }
  for (const s of ['attack', 'block', 'shield-reflect', 'durability-loss'] as const) {
    getRegistry(s).clear();
  }
}

/**
 * Diagnostic — returns the count of registered handlers for a surface.
 */
export function getEquipmentDerivedRegistrySize(
  surface: EquipmentDerivedSurface,
): number {
  return getRegistry(surface).size;
}

/**
 * Diagnostic — returns registered handler ids for a surface (in registration order).
 */
export function getRegisteredEquipmentDerivedHandlerIds(
  surface: EquipmentDerivedSurface,
): string[] {
  return Array.from(getRegistry(surface).keys());
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface RunResult {
  /** True if any handler returned `fired: true` on its first iteration. */
  fired: boolean;
  /** Final RNG state (callers MUST use this; runner does not write it back). */
  rng: RngState;
  /** Number of distinct handlers that fired (counts first iteration only). */
  firedHandlerCount: number;
  /** Overclock extra count actually applied (`equipOverclockExtraTriggers(state)`). */
  overclockExtra: number;
}

/**
 * Optional runner config — primarily used by the `attack` surface where the
 * reducer's enqueue ordering is significant (HEAL must drain before subsequent
 * APPLY_DAMAGE actions, etc.). Callers split the surface into multiple
 * `runEquipmentDerivedHandlers` invocations at the original effect's call site,
 * each scoped to a single handler id via `only`. See `attack-basic.ts` /
 * `attack-overkill.ts` (PR-4) for usage.
 */
export interface RunnerOptions {
  /**
   * If provided, only handlers whose id is in this list will fire. Order
   * follows the order of registered ids (NOT the order of this array) — the
   * runner still iterates the registry's insertion order.
   */
  only?: string[];
}

/**
 * Run all registered handlers for a surface.
 *
 *   1. For each handler (filtered by `options.only` when given), call once
 *      with `isFirstIteration: true`.
 *   2. If that call returns `fired: true`, call it `overclockExtra` more times
 *      with `isFirstIteration: false` (where `overclockExtra` =
 *      `equipOverclockExtraTriggers(state)`).
 *   3. Once any handler has fired and overclock is active, push exactly one
 *      `combat:equipOverclockTriggered` side effect for the surface.
 *
 * The base ctx is mutated in place (sideEffects / enqueuedActions / patch /
 * surfaceCtx are shared across iterations and handlers). RNG threads through
 * via the returned `rng` field — caller must update its local copy with
 * `result.rng`.
 */
export function runEquipmentDerivedHandlers<S extends EquipmentDerivedSurface>(
  surface: S,
  baseCtx: Omit<EquipmentDerivedCtx<S>, 'isFirstIteration' | 'isLastIteration' | 'overclockExtra'>,
  options?: RunnerOptions,
): RunResult {
  const handlers = getRegistry(surface);
  const overclockExtra = equipOverclockExtraTriggers(baseCtx.state);
  const totalIterations = 1 + overclockExtra;
  let anyFired = false;
  let anyContributed = false;
  let firedCount = 0;
  let rng = baseCtx.rng;
  const onlySet = options?.only ? new Set(options.only) : null;

  // `Map.forEach` (vs `for..of handlers.values()`) avoids needing
  // `--downlevelIteration` and matches the iteration style used by the sibling
  // `on-equip.ts` / `on-enter-hand.ts` registries.
  handlers.forEach((handler, id) => {
    if (onlySet && !onlySet.has(id)) return;
    // Mandatory first call.
    const ctxFirst: EquipmentDerivedCtx<S> = {
      ...baseCtx,
      rng,
      isFirstIteration: true,
      isLastIteration: totalIterations === 1,
      overclockExtra,
    };
    const r1 = handler(ctxFirst);
    rng = ctxFirst.rng;
    if (!r1.fired) return;

    anyFired = true;
    firedCount += 1;
    if ((r1.contributedToOverclock ?? r1.fired) && overclockExtra > 0) {
      anyContributed = true;
    }

    for (let i = 0; i < overclockExtra; i++) {
      const ctxN: EquipmentDerivedCtx<S> = {
        ...baseCtx,
        rng,
        isFirstIteration: false,
        isLastIteration: i === overclockExtra - 1,
        overclockExtra,
      };
      const rN = handler(ctxN);
      rng = ctxN.rng;
      if ((rN.contributedToOverclock ?? rN.fired) && overclockExtra > 0) {
        anyContributed = true;
      }
    }
  });

  if (anyContributed) {
    baseCtx.sideEffects.push({
      event: 'combat:equipOverclockTriggered',
      payload: { surface: surfaceLabel(surface), count: overclockExtra },
    });
  }

  return { fired: anyFired, rng, firedHandlerCount: firedCount, overclockExtra };
}

/**
 * Map our internal surface key to the side-effect payload string. Mirrors
 * the existing payload literals in `combat.ts` / `equipment-effects.ts` so
 * `combat:equipOverclockTriggered` consumers (UI hooks that throttle log
 * entries) keep seeing the same payload shape.
 *
 * Also see `event-bus.ts` `'combat:equipOverclockTriggered'` payload type:
 *   surface: 'onEquip' | 'lastWords' | 'attack' | 'block' | 'durability' | 'shieldReflect'
 */
function surfaceLabel(
  surface: EquipmentDerivedSurface,
): 'attack' | 'block' | 'durability' | 'shieldReflect' {
  switch (surface) {
    case 'attack': return 'attack';
    case 'block': return 'block';
    case 'durability-loss': return 'durability';
    case 'shield-reflect': return 'shieldReflect';
  }
}
