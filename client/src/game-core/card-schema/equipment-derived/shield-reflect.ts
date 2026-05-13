/**
 * Shield-reflect surface handlers (PR-3 migration).
 *
 * Two effects that previously lived inline in `reduceApplyShieldReflect`
 * (`combat.ts`) with hand-rolled `for (let i = 0; i < overclockExtraReflect; i++)`
 * loops. Now they're registered as handlers and the runner replays them
 * automatically:
 *
 *   1. `dragonBreathRetaliation` (`monster.dragonDamageRetaliation` field)
 *      - Original semantic: REPLAY (loop enqueues APPLY_DRAGON_BREATH_RETALIATION
 *        N extra times after the initial enqueue + float + side effect).
 *      - New semantic: handler enqueues 1 APPLY per iteration; gates float +
 *        `combat:dragonBreathRetaliation` side effect on `isFirstIteration`.
 *
 *   2. `bossRetaliation` (`monster.bossRetaliationDamage` field)
 *      - Original semantic: REPLAY (loop enqueues APPLY_DAMAGE N extra times
 *        after the initial enqueue + float + log).
 *      - New semantic: handler enqueues 1 APPLY_DAMAGE per iteration; gates
 *        float + log on `isFirstIteration`.
 *
 * SEMANTIC NOTE — `slotItem` is NOT meaningful for this surface.
 * Both effects are MONSTER traits (read off `monster.dragonDamageRetaliation` /
 * `monster.bossRetaliationDamage`), reacting to ANY shield reflecting at it.
 * The action itself (`APPLY_SHIELD_REFLECT`) doesn't carry a source slot —
 * the reflect could come from either equipmentSlot1 or equipmentSlot2. We
 * pass `monster` as `slotItem` (with sentinel `slotId: 'equipmentSlot1'`)
 * so handlers can use the registry uniformly; handlers MUST read traits
 * from `surfaceCtx.monster` instead.
 *
 * `contributedToOverclock: false` for both handlers — `reduceApplyShieldReflect`
 * emits its own `combat:equipOverclockTriggered` side effect inline (gated
 * on `overclockExtra > 0`, regardless of whether dragon/boss handlers fire),
 * because the core reflect damage multiplier (`damageTotal = damage × (1+N)`)
 * is itself an overclock contribution that always fires when overclock is
 * active. Letting the runner double-emit would produce duplicate notifications.
 */

import { registerEquipmentDerivedHandlers, type EquipmentDerivedHandler } from './registry';

// ---------------------------------------------------------------------------
// Handler 1: dragonBreathRetaliation
// ---------------------------------------------------------------------------

const dragonBreathRetaliationHandler: EquipmentDerivedHandler<'shield-reflect'> = (ctx) => {
  const { surfaceCtx, isFirstIteration, sideEffects, enqueuedActions } = ctx;
  const monster = surfaceCtx.monster;
  const dmg = monster.dragonDamageRetaliation ?? 0;
  if (dmg <= 0) return { fired: false };
  if (monster.isStunned) return { fired: false };

  // First iteration: emit the float + UI side effect (one-shot UX cues).
  if (isFirstIteration) {
    enqueuedActions.push({
      type: 'TRIGGER_MONSTER_SKILL_FLOAT',
      monsterId: monster.id,
      skillKey: 'reflect:dragonBreath',
    });
    sideEffects.push({
      event: 'combat:dragonBreathRetaliation',
      payload: { monsterId: monster.id, monsterName: monster.name, damage: dmg },
    });
  }

  // Every iteration: enqueue 1 retaliation. Total = (1 + overclockExtra).
  enqueuedActions.push({
    type: 'APPLY_DRAGON_BREATH_RETALIATION',
    monsterId: monster.id,
    monsterName: monster.name,
    damage: dmg,
  });

  // See module-level comment: inline emit owns overclock UX for this surface.
  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// Handler 2: bossRetaliation
// ---------------------------------------------------------------------------

const bossRetaliationHandler: EquipmentDerivedHandler<'shield-reflect'> = (ctx) => {
  const { surfaceCtx, isFirstIteration, sideEffects, enqueuedActions } = ctx;
  const monster = surfaceCtx.monster;
  const retDmg = monster.bossRetaliationDamage ?? 0;
  if (retDmg <= 0) return { fired: false };
  if (monster.isStunned) return { fired: false };

  if (isFirstIteration) {
    enqueuedActions.push({
      type: 'TRIGGER_MONSTER_SKILL_FLOAT',
      monsterId: monster.id,
      skillKey: 'reflect:bossRetaliation',
    });
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `${monster.name} 反噬：造成 ${retDmg} 点直接伤害！` },
    });
  }

  enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: retDmg, source: 'combat' });

  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
//
// Order matches the original `reduceApplyShieldReflect` flow (dragon-breath
// before boss-retaliation). Order doesn't actually matter functionally — the
// two handlers are independent (different monster traits, different action
// types enqueued, separate side effects).
registerEquipmentDerivedHandlers('shield-reflect', [
  { id: 'dragon-breath-retaliation', handler: dragonBreathRetaliationHandler },
  { id: 'boss-retaliation', handler: bossRetaliationHandler },
]);
