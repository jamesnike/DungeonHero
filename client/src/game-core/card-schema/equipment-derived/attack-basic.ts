/**
 * Attack surface — basic handlers (PR-4a).
 *
 * 7 effects migrated from `combat.ts:reducePerformHeroAttack`. Each was
 * previously implemented inline with a `for (let i = 0; i < overclockExtra;
 * i++)` loop. Here they're handler-based and the runner replays them
 * automatically.
 *
 * IMPORTANT — multi-call ordering preservation:
 *
 *   The original reducer calls these effects at very different points in the
 *   pipeline (heal-on-attack BEFORE damage; boss-retaliation INSIDE the damage
 *   block; heal-on-kill / dragon-breath / post-attack-hand-recycle AFTER
 *   damage; etc.). Their relative drain order matters because, e.g., if HEAL
 *   queues AFTER boss-retaliation APPLY_DAMAGE, the hero may die before
 *   healing kicks in and game outcomes diverge.
 *
 *   To preserve the original ordering exactly, the consumer (combat.ts) calls
 *   `runEquipmentDerivedHandlers('attack', ctx, { only: ['<id>'] })` at each
 *   handler's original call site, scoped to a single handler id. The registry
 *   `only` filter (added in PR-4a) makes this clean.
 *
 * `contributedToOverclock: false` for ALL handlers in this file — the consumer
 * (`reducePerformHeroAttack`) keeps an inline `overclockFiredThisAttack` flag
 * and emits exactly one `combat:equipOverclockTriggered` side effect at the
 * end of the reducer. The flag is set to true whenever a runner call reports
 * a fired handler AND `overclockExtra > 0`. This avoids N side-effect emits
 * (one per call site) which would spam the player's log.
 *
 * SCOPE — what's NOT in PR-4a (deferred to PR-4b):
 *
 *   - `overkill-lifesteal` (HEAL × overkillHitCount, replays N times)
 *   - `overkill-draw` (side effect, replays N times)
 *   - `overkill-amplify-missile` (AMPLIFY action, replays N times)
 *   - `post-attack-spell-damage` (DEAL_DAMAGE_TO_MONSTER with target re-pick)
 *
 * Permanently inline (NOT in any future PR — not subject to overclocking by design):
 *
 *   - `overkillRecycleToHand`, `onAttackAmplifyMissileGenerate`,
 *     `restoreDurabilityOnKill`, `weaponBonus`, `swarmCorrode`,
 *     `goblinStackHeal`, `daggerSelfDestructDiscover`, `ghostBladeExile`,
 *     `eliteDoubleAttack`, `persuadeBoostOnHit`, `onAttackEffect (steal-gold)`
 */

import type { GameCardData } from '@/components/GameCard';
import type { EquipmentItem } from '@/components/game-board/types';
import { registerEquipmentDerivedHandlers, type EquipmentDerivedHandler } from './registry';

// ---------------------------------------------------------------------------
// 1. heal-on-attack
// ---------------------------------------------------------------------------

const healOnAttackHandler: EquipmentDerivedHandler<'attack'> = (ctx) => {
  const { slotItem, isFirstIteration, sideEffects, enqueuedActions } = ctx;
  const amt = (slotItem as GameCardData).healOnAttack;
  if (!amt || amt <= 0) return { fired: false };

  if (isFirstIteration) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'heal', message: `${slotItem.name} 攻击恢复了 ${amt} 点生命` },
    });
  }
  enqueuedActions.push({ type: 'HEAL', amount: amt, source: 'heal-on-attack' });
  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// 2. draw-on-attack
// ---------------------------------------------------------------------------
//
// 「智者之刃」家族：每次攻击从背包抽 N 张牌。Goes through the standard
// DRAW_CARDS source: 'backpack' entry (per draw-cards-defaults-to-backpack rule).

const drawOnAttackHandler: EquipmentDerivedHandler<'attack'> = (ctx) => {
  const { slotItem, isFirstIteration, sideEffects, enqueuedActions } = ctx;
  const drawCount = (slotItem as GameCardData).drawOnAttack;
  if (!drawCount || drawCount <= 0) return { fired: false };

  if (isFirstIteration) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'magic', message: `${slotItem.name} 攻击：从背包抽 ${drawCount} 张牌！` },
    });
  }
  enqueuedActions.push({ type: 'DRAW_CARDS', count: drawCount, source: 'backpack' });
  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// 3. boss-retaliation-attack
// ---------------------------------------------------------------------------
//
// MONSTER trait — fires when hero damages a boss with `bossRetaliationDamage`.
// Reads from `surfaceCtx.workingMonster` (post-damage view). The same trait
// also fires on the shield-reflect surface (handled by `shield-reflect.ts`'s
// `boss-retaliation` handler) — they're separate call paths but read the
// same field.

const bossRetaliationAttackHandler: EquipmentDerivedHandler<'attack'> = (ctx) => {
  const { surfaceCtx, isFirstIteration, sideEffects, enqueuedActions } = ctx;
  if (surfaceCtx.isBuildingTarget) return { fired: false };
  if (surfaceCtx.finalDamage <= 0) return { fired: false };
  const m = surfaceCtx.workingMonster;
  const retDmg = m.bossRetaliationDamage ?? 0;
  if (retDmg <= 0) return { fired: false };
  if (m.isStunned) return { fired: false };

  if (isFirstIteration) {
    enqueuedActions.push({
      type: 'TRIGGER_MONSTER_SKILL_FLOAT',
      monsterId: m.id,
      skillKey: 'reflect:bossRetaliation',
    });
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `${surfaceCtx.targetMonster.name} 反噬：造成 ${retDmg} 点直接伤害！` },
    });
  }
  enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: retDmg, source: 'combat' });
  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// 4. heal-on-kill
// ---------------------------------------------------------------------------
//
// "knightSlotItem.healOnKill" — fires only when this attack defeated the
// monster. (Permission: subject to `monsterDefeated` flag in surfaceCtx.)

const healOnKillHandler: EquipmentDerivedHandler<'attack'> = (ctx) => {
  const { slotItem, surfaceCtx, isFirstIteration, sideEffects, enqueuedActions } = ctx;
  if (!surfaceCtx.monsterDefeated) return { fired: false };
  const amt = (slotItem as GameCardData & { healOnKill?: number }).healOnKill;
  if (!amt || amt <= 0) return { fired: false };

  if (isFirstIteration) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'heal', message: `${slotItem.name} 击杀回复 ${amt} 点生命` },
    });
  }
  enqueuedActions.push({ type: 'HEAL', amount: amt, source: 'heal-on-kill' });
  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// 5. kill-gold-scaling (MULTIPLY semantic — special)
// ---------------------------------------------------------------------------
//
// 赏金 family. Original semantic:
//   - On kill: gold += `slotItem.killGoldCounter ?? 2` (one shot)
//   - Counter increments by 1 (next kill pays +1 more)
//   - Overclock multiplies the gold delta: gold += amount × overclockExtra
//
// Replay model: each iter adds `goldAmount` to gold; only iter 1 writes the
// counter and pushes the log. Net result = (1 + N) × goldAmount, counter +1
// once, log once. Equivalent to original.

const killGoldScalingHandler: EquipmentDerivedHandler<'attack'> = (ctx) => {
  const { state, slotItem, slotId, surfaceCtx, isFirstIteration, sideEffects, patch } = ctx;
  if (!surfaceCtx.monsterDefeated) return { fired: false };
  if (!(slotItem as GameCardData).killGoldScaling) return { fired: false };

  const goldAmount = (slotItem as GameCardData).killGoldCounter ?? 2;
  patch.gold = (patch.gold ?? state.gold ?? 0) + goldAmount;

  if (isFirstIteration) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 赏金：击杀获得 ${goldAmount} 金币` },
    });
    if (!surfaceCtx.weaponDestroyed) {
      const currentItem = (patch[slotId] ?? slotItem) as GameCardData;
      patch[slotId] = {
        ...currentItem,
        killGoldCounter: goldAmount + 1,
      } as EquipmentItem;
    }
  }
  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// 6. dragon-breath-retaliation-attack
// ---------------------------------------------------------------------------
//
// MONSTER trait — fires when hero attacks a dragon with `dragonDamageRetaliation`
// AND the monster survives. Reads from `surfaceCtx.targetMonster` (stable
// reference). Same trait fires on shield-reflect surface separately.

const dragonBreathRetaliationAttackHandler: EquipmentDerivedHandler<'attack'> = (ctx) => {
  const { surfaceCtx, isFirstIteration, sideEffects, enqueuedActions } = ctx;
  if (surfaceCtx.monsterDefeated) return { fired: false };
  const t = surfaceCtx.targetMonster;
  if (t.type !== 'monster') return { fired: false };
  if (t.isStunned) return { fired: false };
  const dmg = t.dragonDamageRetaliation ?? 0;
  if (dmg <= 0) return { fired: false };

  if (isFirstIteration) {
    enqueuedActions.push({
      type: 'TRIGGER_MONSTER_SKILL_FLOAT',
      monsterId: t.id,
      skillKey: 'reflect:dragonBreath',
    });
    sideEffects.push({
      event: 'combat:dragonBreathRetaliation',
      payload: { monsterId: t.id, monsterName: t.name, damage: dmg },
    });
  }
  enqueuedActions.push({
    type: 'APPLY_DRAGON_BREATH_RETALIATION',
    monsterId: t.id,
    monsterName: t.name,
    damage: dmg,
  });
  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// 7. post-attack-hand-recycle
// ---------------------------------------------------------------------------
//
// Pure side-effect emit (no enqueued action). Hook listens for
// `combat:postAttackHandRecycle` and triggers the recycle UI. Each iter pushes
// one side effect → hook runs the flow N+1 times.

const postAttackHandRecycleHandler: EquipmentDerivedHandler<'attack'> = (ctx) => {
  const { slotItem, sideEffects } = ctx;
  if (!(slotItem as GameCardData).postAttackHandRecycle) return { fired: false };
  sideEffects.push({ event: 'combat:postAttackHandRecycle', payload: { itemName: slotItem.name } });
  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
//
// Order matches the original `reducePerformHeroAttack` call order. Order
// doesn't really matter when callers use `{ only: ['<id>'] }` filtering
// (each call only fires one handler), but registration order also affects
// the diagnostic `getRegisteredEquipmentDerivedHandlerIds('attack')`.

registerEquipmentDerivedHandlers('attack', [
  { id: 'heal-on-attack', handler: healOnAttackHandler },
  { id: 'draw-on-attack', handler: drawOnAttackHandler },
  { id: 'boss-retaliation-attack', handler: bossRetaliationAttackHandler },
  { id: 'heal-on-kill', handler: healOnKillHandler },
  { id: 'kill-gold-scaling', handler: killGoldScalingHandler },
  { id: 'dragon-breath-retaliation-attack', handler: dragonBreathRetaliationAttackHandler },
  { id: 'post-attack-hand-recycle', handler: postAttackHandRecycleHandler },
]);
