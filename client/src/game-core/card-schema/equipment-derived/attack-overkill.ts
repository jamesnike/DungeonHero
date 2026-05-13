/**
 * Attack surface — overkill / post-attack handlers (PR-4b).
 *
 * 4 effects migrated from `combat.ts:reducePerformHeroAttack`:
 *
 *   1. `overkill-lifesteal` — gates on `overkillHitCount > 0` AND
 *      `attackEffectiveLifesteal > 0`. Each iter enqueues 1 HEAL of
 *      `lifesteal × hitCount`; first iter pushes log.
 *   2. `overkill-draw` — gates on `slotItem.overkillDraw` AND
 *      `overkillHitCount > 0`. Each iter pushes 1 `equipment:drawFromBackpack`
 *      side effect (no log; hook handles logging on receipt).
 *   3. `overkill-amplify-missile` — gates on `slotItem.overkillAmplifyMissile`
 *      AND `overkillHitCount > 0`. Each iter enqueues 1 AMPLIFY action;
 *      first iter pushes log.
 *   4. `post-attack-spell-damage` — gates on `slotItem.postAttackSpellDamage`.
 *      Iter 1 picks a random monster from the board and pushes side effect +
 *      log + DEAL_DAMAGE_TO_MONSTER + ensures engagement; iter 2..N re-targets
 *      the SAME monster (cached via `surfaceCtx.postAttackSpellTarget`) with
 *      a fresh DEAL_DAMAGE_TO_MONSTER + engagement check. No iter-2..N side
 *      effect / log emit.
 *
 * Same conventions as `attack-basic.ts`:
 *   - All handlers return `contributedToOverclock: false` — consumer
 *     (`reducePerformHeroAttack`) maintains an inline single-emit flag.
 *   - Handlers MUST be invoked at the original effect's call position via
 *     `runEquipmentDerivedHandlers('attack', ctx, { only: ['<id>'] })` to
 *     preserve enqueue order (e.g. overkill-lifesteal HEAL must drain BEFORE
 *     subsequent overkill effects' actions for some edge-case interactions).
 *
 * NOTE on engagement: `post-attack-spell-damage` enqueues `BEGIN_COMBAT`
 * inline (mirroring `combat.ts`'s `ensureMonsterEngagedLocal` helper) rather
 * than importing the helper, to keep the handler module free of `combat.ts`
 * imports (which would create a cycle via the registry barrel).
 * `BEGIN_COMBAT` reducer is idempotent for already-engaged monsters and a
 * no-op for buildings (see `monster-damage-engagement.mdc`).
 */

import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots } from '@/components/game-board/types';
import { flattenActiveRowSlots, isDamageableTarget } from '../../helpers';
import { pickRandom } from '../../rng';
import { registerEquipmentDerivedHandlers, type EquipmentDerivedHandler } from './registry';

// ---------------------------------------------------------------------------
// 1. overkill-lifesteal
// ---------------------------------------------------------------------------

const overkillLifestealHandler: EquipmentDerivedHandler<'attack'> = (ctx) => {
  const { surfaceCtx, isFirstIteration, sideEffects, enqueuedActions } = ctx;
  if (surfaceCtx.overkillHitCount <= 0) return { fired: false };
  if (surfaceCtx.attackEffectiveLifesteal <= 0) return { fired: false };

  const heal = surfaceCtx.attackEffectiveLifesteal * surfaceCtx.overkillHitCount;
  if (isFirstIteration) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'heal', message: `超杀吸血：恢复 ${heal} 生命` },
    });
  }
  enqueuedActions.push({ type: 'HEAL', amount: heal, source: 'overkill-lifesteal' });
  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// 2. overkill-draw
// ---------------------------------------------------------------------------
//
// Original pushes ONLY a side effect (no log, no enqueued action). Hook
// (`useCombatActions`) listens for `equipment:drawFromBackpack` and dispatches
// `DRAW_CARDS` itself. Replay model: each iter pushes a fresh side effect.

const overkillDrawHandler: EquipmentDerivedHandler<'attack'> = (ctx) => {
  const { slotItem, surfaceCtx, sideEffects } = ctx;
  if (surfaceCtx.overkillHitCount <= 0) return { fired: false };
  const perOverkill = (slotItem as GameCardData).overkillDraw ?? 0;
  if (perOverkill <= 0) return { fired: false };
  const drawCount = perOverkill * surfaceCtx.overkillHitCount;

  sideEffects.push({
    event: 'equipment:drawFromBackpack',
    payload: { count: drawCount, source: 'overkill' },
  });
  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// 3. overkill-amplify-missile
// ---------------------------------------------------------------------------

const overkillAmplifyMissileHandler: EquipmentDerivedHandler<'attack'> = (ctx) => {
  const { slotItem, surfaceCtx, isFirstIteration, sideEffects, enqueuedActions } = ctx;
  if (surfaceCtx.overkillHitCount <= 0) return { fired: false };
  const perOverkill = (slotItem as GameCardData).overkillAmplifyMissile ?? 0;
  if (perOverkill <= 0) return { fired: false };
  const amount = perOverkill * surfaceCtx.overkillHitCount;

  if (isFirstIteration) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 超杀：所有「魔弹」+${amount} 增幅` },
    });
  }
  enqueuedActions.push({
    type: 'AMPLIFY_CARDS_BY_NAME',
    cardName: '魔弹',
    amount,
    source: slotItem.name,
  });
  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// 4. post-attack-spell-damage (奥术之刃)
// ---------------------------------------------------------------------------
//
// Iter 1 picks a random alive target on the board, ensures engagement,
// enqueues DEAL_DAMAGE_TO_MONSTER, pushes the `combat:arcaneBladeSpell` side
// effect + log. Caches `{ id, damage }` in `surfaceCtx.postAttackSpellTarget`.
//
// Iter 2..N re-uses the cached target — enqueues another DEAL_DAMAGE +
// ensures engagement (idempotent). No side effect / log on replay.
//
// Engagement is enqueued inline (BEGIN_COMBAT) rather than via combat.ts'
// `ensureMonsterEngagedLocal` helper, to keep this module free of cycles.

const postAttackSpellDamageHandler: EquipmentDerivedHandler<'attack'> = (ctx) => {
  const {
    state, slotItem, slotId, surfaceCtx, isFirstIteration,
    sideEffects, enqueuedActions, patch,
  } = ctx;
  const baseDmg = (slotItem as GameCardData).postAttackSpellDamage;
  if (!baseDmg) return { fired: false };

  if (isFirstIteration) {
    const boardMonsters = flattenActiveRowSlots(
      (patch.activeCards ?? state.activeCards) as ActiveRowSlots,
    ).filter((c): c is GameCardData => isDamageableTarget(c));
    if (boardMonsters.length === 0) return { fired: false };

    const [target, nextRng] = pickRandom(boardMonsters, ctx.rng);
    ctx.rng = nextRng;

    const spellDmg = Math.max(0, baseDmg + (state.permanentSpellDamageBonus ?? 0));

    sideEffects.push({
      event: 'combat:arcaneBladeSpell',
      payload: { slotId, targetId: target.id },
    });
    if (target.type === 'monster' && !(state.combatState?.engagedMonsterIds ?? []).includes(target.id)) {
      enqueuedActions.push({ type: 'BEGIN_COMBAT', monster: target, initiator: 'hero' });
    }
    enqueuedActions.push({
      type: 'DEAL_DAMAGE_TO_MONSTER',
      monsterId: target.id,
      damage: spellDmg,
      source: 'arcane-blade-spell',
      isSpellDamage: true,
    });
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `${slotItem.name} 附魔：对 ${target.name} 造成 ${spellDmg} 点法术伤害` },
    });

    surfaceCtx.postAttackSpellTarget = { id: target.id, damage: spellDmg };
    return { fired: true, contributedToOverclock: false };
  }

  // Replay iteration — re-target cached monster.
  const cached = surfaceCtx.postAttackSpellTarget;
  if (!cached) return { fired: false };

  // Find the monster on the live board (still there even if currentLayer
  // dropped — DEAL_DAMAGE_TO_MONSTER hasn't drained yet, so layers are
  // still pre-attack values from iter 1's perspective).
  const target = (state.activeCards as ActiveRowSlots).find(c => c?.id === cached.id) as GameCardData | undefined;
  if (target && target.type === 'monster' && !(state.combatState?.engagedMonsterIds ?? []).includes(cached.id)) {
    enqueuedActions.push({ type: 'BEGIN_COMBAT', monster: target, initiator: 'hero' });
  }
  enqueuedActions.push({
    type: 'DEAL_DAMAGE_TO_MONSTER',
    monsterId: cached.id,
    damage: cached.damage,
    source: 'arcane-blade-spell',
    isSpellDamage: true,
  });
  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

registerEquipmentDerivedHandlers('attack', [
  { id: 'overkill-lifesteal', handler: overkillLifestealHandler },
  { id: 'overkill-draw', handler: overkillDrawHandler },
  { id: 'overkill-amplify-missile', handler: overkillAmplifyMissileHandler },
  { id: 'post-attack-spell-damage', handler: postAttackSpellDamageHandler },
]);
