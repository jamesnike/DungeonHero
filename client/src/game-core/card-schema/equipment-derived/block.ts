/**
 * Equipment-derived BLOCK surface handlers (PR-5).
 *
 * 6 effects migrated from `combat.ts:reduceResolveBlock`:
 *
 *   1. `dual-guard-armor` — perfect block + amulet `dualGuardCount > 0`. Each
 *      iter applies `+dualGuardCount` permanent shield bonus to the block
 *      slot. Iter 1 logs/banners with the aggregate (dualGuardCount × (1+N)).
 *
 *   2. `perfect-block-max-hp-gain` — perfect block + slot has
 *      `shieldPerfectBlockMaxHpGain > 0`. Each iter adds `gain` to
 *      `permanentMaxHpBonus`. Iter 1 logs/banners with aggregate.
 *
 *   3. `perfect-block-spawn-missiles` — perfect block + slot has
 *      `perfectBlockSpawnMissiles > 0`. Spawns `base × (1 + overclockExtra)`
 *      魔弹 cards into hand (capped by handLimit) ENTIRELY in iter 1 — this
 *      is an «aggregate» effect. Iter 2..N are no-ops returning
 *      `fired: true, contributedToOverclock: false`. RNG-consuming via
 *      `createMagicBoltCard`.
 *
 *   4. `block-grant-temp-armor-to-other` — slot has
 *      `blockGrantTempArmorToOther`. Each iter adds `grantBase` to
 *      `slotTempArmor[other]`. Iter 1 logs/banners + checks persuade.
 *
 *   5. `dragon-breath-shield-retaliation` — monster equip slot has
 *      `dragonDamageRetaliation > 0`. Iter 1 picks random board monster
 *      (RNG), enqueues 2-dmg `dragon-breath-reflect` + side fx + log +
 *      banner + ensures engagement. Caches target id in
 *      `surfaceCtx.dragonBreathTarget`. Iter 2..N re-target same cached
 *      monster, just enqueue another 2-dmg action.
 *
 *   6. `shield-reflect-on-block` — `surfaceCtx.reflectDmg > 0`. Each iter
 *      enqueues 1 DEAL_DAMAGE `shield-reflect` targeting the attacking
 *      monster. Iter 1 pushes side fx + log. Called at TWO callsites in
 *      `reduceResolveBlock` (followup-attack branch + non-followup branch),
 *      mutually exclusive per reducer call.
 *
 * Same `contributedToOverclock: false` convention as PR-3 / PR-4 — consumer
 * (`reduceResolveBlock`) maintains an inline `overclockFiredThisBlock` flag
 * for the single end-of-reducer `combat:equipOverclockTriggered` emit.
 *
 * Engagement (`BEGIN_COMBAT`) is enqueued inline (mirroring
 * `monster-damage-engagement.mdc`) rather than via combat.ts's
 * `ensureMonsterEngagedLocal` helper, to avoid a cycle through the registry
 * barrel.
 */

import type { GameCardData } from '@/components/GameCard';
import type {
  ActiveRowSlots,
  EquipmentSlotBonusState,
} from '@/components/game-board/types';
import { flattenActiveRowSlots, applyAmplifyOnCreate } from '../../helpers';
import { getSlotBonus, applySlotArmorBonusDelta, checkPersuadeOnTempAttack } from '../../equipment';
import { createMagicBoltCard } from '../../deck';
import { pickRandom } from '../../rng';
import { HAND_LIMIT } from '../../constants';
import { registerEquipmentDerivedHandlers, type EquipmentDerivedHandler } from './registry';

// ---------------------------------------------------------------------------
// 1. dual-guard-armor
// ---------------------------------------------------------------------------

const dualGuardArmorHandler: EquipmentDerivedHandler<'block'> = (ctx) => {
  const { state, surfaceCtx, isFirstIteration, sideEffects, patch, overclockExtra } = ctx;
  if (!surfaceCtx.isPerfectBlock) return { fired: false };
  const dualGuard = surfaceCtx.amuletEffects.dualGuardCount;
  if (dualGuard <= 0) return { fired: false };

  const slotId = surfaceCtx.blockSlotId;
  const bonuses = { ...((patch.equipmentSlotBonuses ?? state.equipmentSlotBonuses) as EquipmentSlotBonusState) };
  bonuses[slotId] = { ...bonuses[slotId], shield: bonuses[slotId].shield + dualGuard };
  patch.equipmentSlotBonuses = bonuses;
  applySlotArmorBonusDelta(state, slotId, dualGuard, patch);

  if (isFirstIteration) {
    const totalArmorGain = dualGuard * (1 + overclockExtra);
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `完美格挡！双守护圣盾使该栏永久护甲 +${totalArmorGain}` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `完美格挡！该装备栏永久护甲 +${totalArmorGain}！` } });
  }
  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// 2. perfect-block-max-hp-gain
// ---------------------------------------------------------------------------

const perfectBlockMaxHpGainHandler: EquipmentDerivedHandler<'block'> = (ctx) => {
  const { state, slotItem, surfaceCtx, isFirstIteration, sideEffects, patch, overclockExtra } = ctx;
  if (!surfaceCtx.isPerfectBlock) return { fired: false };
  const gain = (slotItem as GameCardData).shieldPerfectBlockMaxHpGain ?? 0;
  if (gain <= 0) return { fired: false };

  patch.permanentMaxHpBonus = (patch.permanentMaxHpBonus ?? state.permanentMaxHpBonus ?? 0) + gain;

  if (isFirstIteration) {
    const totalGain = gain * (1 + overclockExtra);
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 完美格挡：永久生命值上限 +${totalGain}！` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 完美格挡！生命值上限 +${totalGain}！` } });
  }
  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// 3. perfect-block-spawn-missiles
// ---------------------------------------------------------------------------
//
// Aggregate-only effect: the entire spawn happens in iter 1 (which knows the
// final count via overclockExtra). Iter 2..N are no-ops returning
// `fired: true` so the runner doesn't double-count, but the work is already
// done. This mirrors how the original code computed `perfectBlockSpawnCount`
// upfront before the spawn loop.

const perfectBlockSpawnMissilesHandler: EquipmentDerivedHandler<'block'> = (ctx) => {
  const { state, slotItem, surfaceCtx, isFirstIteration, sideEffects, patch, overclockExtra } = ctx;
  if (!surfaceCtx.isPerfectBlock) return { fired: false };
  const base = (slotItem as GameCardData).perfectBlockSpawnMissiles ?? 0;
  if (base <= 0) return { fired: false };

  if (!isFirstIteration) {
    return { fired: true, contributedToOverclock: false };
  }

  const totalCount = base * (1 + overclockExtra);
  const handLimit = HAND_LIMIT + (state.handLimitBonus ?? 0);
  const currentHand = (patch.handCards ?? state.handCards) as GameCardData[];
  const handRoom = Math.max(0, handLimit - currentHand.length);
  const actualCount = Math.min(totalCount, handRoom);

  if (actualCount > 0) {
    let rng = ctx.rng;
    const bolts: GameCardData[] = [];
    for (let i = 0; i < actualCount; i++) {
      const [rawBolt, nextRng] = createMagicBoltCard(rng);
      rng = nextRng;
      bolts.push(applyAmplifyOnCreate(rawBolt, state.amplifiedCardBonus));
    }
    ctx.rng = rng;
    patch.rng = rng;
    patch.handCards = [...currentHand, ...bolts];
    sideEffects.push({
      event: 'log:entry',
      payload: {
        type: 'equip',
        message: actualCount === totalCount
          ? `${slotItem.name} 完美格挡：获得 ${actualCount} 张「魔弹」加入手牌`
          : `${slotItem.name} 完美格挡：获得 ${actualCount} 张「魔弹」加入手牌（手牌已满，少入 ${totalCount - actualCount} 张）`,
      },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 完美格挡！获得 ${actualCount} 张「魔弹」` } });
  } else {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 完美格挡：手牌已满，「魔弹」未生成` },
    });
  }
  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// 4. block-grant-temp-armor-to-other
// ---------------------------------------------------------------------------

const blockGrantTempArmorToOtherHandler: EquipmentDerivedHandler<'block'> = (ctx) => {
  const { state, slotItem, surfaceCtx, isFirstIteration, sideEffects, patch, overclockExtra } = ctx;
  if (!(slotItem as GameCardData).blockGrantTempArmorToOther) return { fired: false };

  const slotId = surfaceCtx.blockSlotId;
  const otherSlot = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';

  // Single-counter armor model: monster equip grants base hp + perm; shield
  // grants storedCap (base + perm + temp). Floor on the FINAL sum so negative
  // perm doesn't get dropped individually.
  const slotShieldBonus = getSlotBonus(state, slotId, 'shield');
  const grantBase = surfaceCtx.isMonsterEquipShield
    ? Math.max(0, ((slotItem as GameCardData).hp ?? slotItem.value) + slotShieldBonus)
    : surfaceCtx.storedCap;

  const newTempArmor = { ...((patch.slotTempArmor ?? state.slotTempArmor ?? {})) };
  newTempArmor[otherSlot] = (newTempArmor[otherSlot] ?? 0) + grantBase;
  patch.slotTempArmor = newTempArmor;
  applySlotArmorBonusDelta(state, otherSlot, grantBase, patch);

  if (isFirstIteration) {
    const grantAmount = grantBase * (1 + overclockExtra);
    const otherSlotLabel = otherSlot === 'equipmentSlot1' ? '左' : '右';
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `${slotItem.name} 守望者链接：${otherSlotLabel}装备栏临时护甲 +${grantAmount}！` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `守望者链接！${otherSlotLabel}装备栏临时护甲 +${grantAmount}！` } });
    checkPersuadeOnTempAttack(state, patch, sideEffects);
  }
  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// 5. dragon-breath-shield-retaliation
// ---------------------------------------------------------------------------

const dragonBreathShieldRetaliationHandler: EquipmentDerivedHandler<'block'> = (ctx) => {
  const { state, slotItem, surfaceCtx, isFirstIteration, sideEffects, enqueuedActions, patch } = ctx;
  if (!surfaceCtx.isMonsterEquipShield) return { fired: false };
  const dragonAmount = (slotItem as GameCardData).dragonDamageRetaliation;
  if (!dragonAmount || dragonAmount <= 0) return { fired: false };

  const slotId = surfaceCtx.blockSlotId;

  if (isFirstIteration) {
    const boardMonsters = flattenActiveRowSlots(
      (patch.activeCards ?? state.activeCards) as ActiveRowSlots,
    ).filter((c): c is GameCardData => Boolean(c && c.type === 'monster'));
    if (boardMonsters.length === 0) return { fired: false };

    const [target, nextRng] = pickRandom(boardMonsters, ctx.rng);
    ctx.rng = nextRng;

    sideEffects.push({ event: 'combat:shieldReflect', payload: { slotId, targetId: target.id } });
    if (target.type === 'monster' && !(state.combatState?.engagedMonsterIds ?? []).includes(target.id)) {
      enqueuedActions.push({ type: 'BEGIN_COMBAT', monster: target, initiator: 'hero' });
    }
    enqueuedActions.push({
      type: 'DEAL_DAMAGE_TO_MONSTER',
      monsterId: target.id,
      damage: 2,
      source: 'dragon-breath-reflect',
    });
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 龙息：对 ${target.name} 造成 2 点伤害！` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 龙息！` } });

    surfaceCtx.dragonBreathTarget = { id: target.id };
    return { fired: true, contributedToOverclock: false };
  }

  // Replay iter — re-target the same cached monster.
  const cached = surfaceCtx.dragonBreathTarget;
  if (!cached) return { fired: false };
  const liveTarget = (state.activeCards as ActiveRowSlots).find(c => c?.id === cached.id) as GameCardData | undefined;
  if (liveTarget && liveTarget.type === 'monster' && !(state.combatState?.engagedMonsterIds ?? []).includes(cached.id)) {
    enqueuedActions.push({ type: 'BEGIN_COMBAT', monster: liveTarget, initiator: 'hero' });
  }
  enqueuedActions.push({
    type: 'DEAL_DAMAGE_TO_MONSTER',
    monsterId: cached.id,
    damage: 2,
    source: 'dragon-breath-reflect',
  });
  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// 6. shield-reflect-on-block
// ---------------------------------------------------------------------------
//
// Reflect damage targets the ATTACKING monster (`surfaceCtx.monster`), not a
// random board pick. Iter 1 pushes side fx + log; iter 2..N just enqueue more
// damage.

const shieldReflectOnBlockHandler: EquipmentDerivedHandler<'block'> = (ctx) => {
  const { surfaceCtx, isFirstIteration, sideEffects, enqueuedActions } = ctx;
  if (surfaceCtx.reflectDmg <= 0) return { fired: false };
  if (!surfaceCtx.reflectBlockSlotId) return { fired: false };

  const monster = surfaceCtx.monster;
  enqueuedActions.push({
    type: 'DEAL_DAMAGE_TO_MONSTER',
    monsterId: monster.id,
    damage: surfaceCtx.reflectDmg,
    source: 'shield-reflect',
  });

  if (isFirstIteration) {
    sideEffects.push({
      event: 'combat:shieldReflect',
      payload: { slotId: surfaceCtx.reflectBlockSlotId, targetId: monster.id },
    });
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `${surfaceCtx.reflectSourceName} 反射了 ${surfaceCtx.reflectDmg} 点伤害！` },
    });
  }
  return { fired: true, contributedToOverclock: false };
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

registerEquipmentDerivedHandlers('block', [
  { id: 'dual-guard-armor', handler: dualGuardArmorHandler },
  { id: 'perfect-block-max-hp-gain', handler: perfectBlockMaxHpGainHandler },
  { id: 'perfect-block-spawn-missiles', handler: perfectBlockSpawnMissilesHandler },
  { id: 'block-grant-temp-armor-to-other', handler: blockGrantTempArmorToOtherHandler },
  { id: 'dragon-breath-shield-retaliation', handler: dragonBreathShieldRetaliationHandler },
  { id: 'shield-reflect-on-block', handler: shieldReflectOnBlockHandler },
]);
