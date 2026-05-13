/**
 * Durability-loss surface handlers (PR-2 migration).
 *
 * 4 effects that previously lived inline in `computeDurabilityLossEffects`
 * (`equipment-effects.ts`) with hand-rolled `for (let i = 0; i < overclockExtra; i++)`
 * loops or `* (1 + overclockExtra)` multipliers. Now they're registered as
 * handlers and the runner replays them automatically:
 *
 *   1. `mineDamageBoost` (`mineDamageBoostPerDur` field)
 *      - Original semantic: REPLAY (loop calls `accumulateMineDamageBoost`).
 *      - New semantic: same — handler delegates to the existing helper.
 *      - Logs every iteration (matches original UX of N+1 banners).
 *
 *   2. `bleedAttackBonus` (`bleedEffect` field on monster equipment)
 *      - Original semantic: MULTIPLY (`bleedBonus = 3 * (1 + overclockExtra)`,
 *        single log).
 *      - New semantic: REPLAY adding +3 per iteration; log gated on
 *        `isFirstIteration` with anticipated final total to match original UX.
 *
 *   3. `wraithRebirth` (`monsterSpecial === 'wraith-rebirth'`)
 *      - Original semantic: EXTRA-ROLLS (1 base D2 + N rescue D2 in inline loop).
 *      - New semantic: REPLAY one roll per iteration, gated on
 *        `surfaceCtx.rebirthAlreadySucceeded`. Probability and RNG-consumption
 *        match: total success rate = 1 - 0.5^(1 + overclockExtra). Log gated
 *        on outcome (success / rescue / all-failed via `isLastIteration`).
 *      - `contributedToOverclock: false` when iter 1 succeeded with no rescue
 *        needed — matches original UX of NOT emitting the overclock banner
 *        when overclock didn't actually trigger.
 *
 *   4. `golemLayerLossReflect` (`golemLayerLossReflect` field on monster equip)
 *      - Original semantic: MULTIPLY (`reflectDmg = base * (1 + overclockExtra)`,
 *        single damage event, single log).
 *      - New semantic: target picked + damage pre-multiplied on
 *        `isFirstIteration`; subsequent iterations are no-op. Preserves single
 *        log/banner UX and single RNG consumption (target pick).
 *
 * NOT migrated (stay inline in computeDurabilityLossEffects):
 *   - `dragonBleedDestroy` (one-shot decision, not overclocked by design)
 *   - `swarm-elite` (one-shot replacement, not overclocked by design)
 *   - The skeletonReRevive triggered inside dragonBleedDestroy
 *
 * Bone-regen save (`monsterSpecial === 'bone-regen'` on monster equipment) is
 * NOT in this surface — it runs in the attack/block paths in `combat.ts`
 * BEFORE durability decrements (it's a save, not a loss reaction). Will be
 * covered in PR-4b (attack) / PR-5 (block).
 */

import { pickRandom, nextBool } from '../../rng';
import { flattenActiveRowSlots } from '../../helpers';
import { accumulateMineDamageBoost } from '../../rules/equipment-effects';
import {
  registerEquipmentDerivedHandlers,
  type EquipmentDerivedHandler,
} from './registry';
import type { GameCardData } from '@/components/GameCard';

// ---------------------------------------------------------------------------
// Handler 1: mineDamageBoost (引雷阵锋 — global mine damage scaling on durLost)
// ---------------------------------------------------------------------------

const mineDamageBoostHandler: EquipmentDerivedHandler<'durability-loss'> = (ctx) => {
  const { state, slotItem, surfaceCtx, patch, sideEffects } = ctx;
  const perDur = slotItem.mineDamageBoostPerDur ?? 0;
  if (perDur <= 0 || surfaceCtx.durLost <= 0) return { fired: false };

  // accumulateMineDamageBoost reads-then-writes patch.globalMineDamageBonus +
  // pushes 1 log + 1 banner. On overclock replay this naturally chains: iter 2
  // reads iter 1's patch value and accumulates further. Log/banner per iter
  // matches original UX (each call appends to side effects).
  accumulateMineDamageBoost(state, slotItem, surfaceCtx.durLost, patch, sideEffects);

  return { fired: true };
};

// ---------------------------------------------------------------------------
// Handler 2: bleedAttackBonus (流血 — +3 attack per durability loss)
// ---------------------------------------------------------------------------

const bleedAttackBonusHandler: EquipmentDerivedHandler<'durability-loss'> = (ctx) => {
  const { slotItem, surfaceCtx, isFirstIteration, overclockExtra, sideEffects } = ctx;
  if (!surfaceCtx.isMonsterEquip) return { fired: false };
  if (!slotItem.bleedEffect) return { fired: false };

  // Each iteration adds the per-trigger bonus (3) to attack/value/specialAttackBoost.
  // Cumulative across replays — overclock×N → final +3*(1+N) attack bonus.
  const item = surfaceCtx.updatedItem;
  const newAttack = (item.attack ?? item.value) + 3;
  const newSpecial = (item.specialAttackBoost ?? 0) + 3;
  surfaceCtx.updatedItem = {
    ...item,
    attack: newAttack,
    value: newAttack,
    specialAttackBoost: newSpecial,
  };

  // Log only once on first iteration with anticipated total — matches original
  // UX of one log line per durability loss event (not N+1 lines).
  if (isFirstIteration) {
    const totalBonus = 3 * (1 + overclockExtra);
    const baseAttack = slotItem.attack ?? slotItem.value;
    const finalAttack = baseAttack + totalBonus;
    sideEffects.push({
      event: 'log:entry',
      payload: {
        type: 'equip',
        message: `${slotItem.name} 流血：攻击力 +${totalBonus}！（当前 ${finalAttack}）`,
      },
    });
  }

  return { fired: true };
};

// ---------------------------------------------------------------------------
// Handler 3: wraithRebirth (重生 — D2 to refill durability when at 1)
// ---------------------------------------------------------------------------

const wraithRebirthHandler: EquipmentDerivedHandler<'durability-loss'> = (ctx) => {
  const {
    slotItem,
    surfaceCtx,
    isFirstIteration,
    isLastIteration,
    overclockExtra,
    sideEffects,
  } = ctx;
  if (!surfaceCtx.isMonsterEquip) return { fired: false };
  if (slotItem.monsterSpecial !== 'wraith-rebirth') return { fired: false };
  if (surfaceCtx.newDur !== 1) return { fired: false };
  if (slotItem.wraithRebirthUsed) return { fired: false };

  // If a previous iteration already succeeded, this iteration is a no-op
  // (still "fired" so the runner counts it consistently and we don't try
  // to log "all failed" later).
  if (surfaceCtx.rebirthAlreadySucceeded) {
    return { fired: true, contributedToOverclock: false };
  }

  // Roll one D2 (50% success).
  const [success, nextRng] = nextBool(ctx.rng);
  ctx.rng = nextRng;

  if (success) {
    surfaceCtx.rebirthAlreadySucceeded = true;
    const item = surfaceCtx.updatedItem;
    const maxDur = slotItem.maxDurability ?? (slotItem.durability ?? 1);
    surfaceCtx.updatedItem = {
      ...item,
      durability: maxDur,
      wraithRebirthUsed: true,
    };
    const rescuedByOverclock = !isFirstIteration;
    sideEffects.push({
      event: 'log:entry',
      payload: {
        type: 'equip',
        message: `${slotItem.name} 重生：耐久回满！（${maxDur}）${rescuedByOverclock ? ' — 装备超频补救' : ''}`,
      },
    });
    sideEffects.push({
      event: 'ui:banner',
      payload: { text: `${slotItem.name} 重生！` },
    });
    // Match original UX: only count as "overclock contribution" when overclock
    // actually rescued. First-roll success doesn't contribute (overclock was
    // never tested).
    return { fired: true, contributedToOverclock: rescuedByOverclock };
  }

  // Failed this iteration. If this is the last iteration AND no prior iter
  // rescued, mark wraithRebirthUsed and log the final failure.
  if (isLastIteration && !surfaceCtx.rebirthAlreadySucceeded) {
    surfaceCtx.updatedItem = {
      ...surfaceCtx.updatedItem,
      wraithRebirthUsed: true,
    };
    sideEffects.push({
      event: 'log:entry',
      payload: {
        type: 'equip',
        message: overclockExtra > 0
          ? `${slotItem.name} 重生失败！（装备超频×${overclockExtra} 补救也未触发）`
          : `${slotItem.name} 重生失败！（50%）`,
      },
    });
  }

  // Failed iteration consumed RNG but didn't rescue → no overclock contribution.
  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// Handler 4: golemLayerLossReflect (反震 — random monster damage scales with lostDur)
// ---------------------------------------------------------------------------

const golemLayerLossReflectHandler: EquipmentDerivedHandler<'durability-loss'> = (ctx) => {
  const {
    state,
    slotItem,
    slotId,
    surfaceCtx,
    isFirstIteration,
    overclockExtra,
    sideEffects,
  } = ctx;
  if (!surfaceCtx.isMonsterEquip) return { fired: false };
  const reflectPerLayer = slotItem.golemLayerLossReflect ?? 0;
  if (reflectPerLayer <= 0) return { fired: false };

  const maxDur = slotItem.maxDurability ?? (slotItem.durability ?? 1);
  const lostDur = maxDur - surfaceCtx.newDur;
  if (lostDur <= 0) return { fired: false };

  // Pre-multiply on first iteration (matches original MULTIPLY semantic with
  // single RNG consumption + single log/banner). Subsequent iterations no-op.
  if (!isFirstIteration) {
    return { fired: true };
  }

  const monsterTargets = flattenActiveRowSlots(state.activeCards).filter(
    (c): c is GameCardData => Boolean(c && c.type === 'monster'),
  );
  if (monsterTargets.length === 0) return { fired: false };

  const [target, nextRng] = pickRandom(monsterTargets, ctx.rng);
  ctx.rng = nextRng;

  const baseReflectDmg = reflectPerLayer * lostDur;
  const totalReflectDmg = baseReflectDmg * (1 + overclockExtra);
  surfaceCtx.golemReflectDamage = {
    targetId: target.id,
    damage: totalReflectDmg,
    slotId,
  };

  sideEffects.push({
    event: 'log:entry',
    payload: {
      type: 'equip',
      message: `${slotItem.name} 反震：${reflectPerLayer}×${lostDur}${overclockExtra > 0 ? `×${1 + overclockExtra}` : ''} = ${totalReflectDmg} 点伤害，命中 ${target.name}！`,
    },
  });
  sideEffects.push({
    event: 'ui:banner',
    payload: { text: `${slotItem.name} 反震！${totalReflectDmg} 伤害！` },
  });

  return { fired: true };
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
//
// Order matches the original `computeDurabilityLossEffects` flow:
//   mine → bleed → wraith → golem
//
// (Original order interleaved non-overclocked dragon-bleed-destroy and
// swarm-elite between bleed/wraith and wraith/golem; those stay inline in
// computeDurabilityLossEffects after the runner returns. Reordering is safe —
// none of the 4 overclocked handlers depend on dragon/swarm output, and
// dragon-bleed-destroy reads `newDurability` (not the wraith-refilled
// updatedItem.durability) so wraith-before-dragon doesn't change its branch.)
registerEquipmentDerivedHandlers('durability-loss', [
  { id: 'mine-damage-boost', handler: mineDamageBoostHandler },
  { id: 'bleed-attack-bonus', handler: bleedAttackBonusHandler },
  { id: 'wraith-rebirth', handler: wraithRebirthHandler },
  { id: 'golem-layer-loss-reflect', handler: golemLayerLossReflectHandler },
]);
