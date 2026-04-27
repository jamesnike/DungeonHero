/**
 * Shield Self-Damage — pure helper that lets the player aim a single-target
 * damage spell at their own equipped shield slot.
 *
 * Behaviour summary:
 * - The shield's effective armor (`armor` field, defaulting to base armor +
 *   permanent shield bonus + slotTempArmor when undefined) absorbs as much
 *   damage as it can.
 * - Any overflow is enqueued as `APPLY_DAMAGE { selfInflicted: true }` so that
 *   it flows through `reduceApplyDamage` (which drains `tempShield`, decrements
 *   `hp`, and triggers self-damage hooks like 血怒战符 / 复生赐福 /
 *   self-damage-draw / `totalDamageTaken`).
 * - When armor is depleted, durability is consumed via `computeDurabilityLossEffects`
 *   (or `computeEquipmentBreakEffects` if it was the last point), respecting
 *   `unbreakableNext` / `unbreakableUntilWaterfall`.
 * - **Block-only mechanics are skipped**: no `combat:shieldBlock` SFX, no
 *   `reflectHalfDamage` / `damageReflect`, no `dualGuardCount`, no
 *   `blockGrantTempArmorToOther`, no `shieldAutoEvolve`, no
 *   `shieldExtraBlocksPerDurability`, no `shieldPerfectBlockSaveChance`,
 *   no `bone-regen` / `swarmBugletShield`, no `bulwarkPassiveActive`.
 * - Crucially, `combatState.slotDurabilityUsedThisTurn[slot]` is NOT
 *   incremented, so this path is not capped by `blockDurabilityPerSlot +
 *   equipBlockDurabilityBonus + amuletBlockBonus + slotBattleSpiritBonus`.
 */

import type { GameCardData } from '@/components/GameCard';
import type { EquipmentSlotId, EquipmentItem } from '@/components/game-board/types';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { SideEffect } from '../reducer';
import {
  computeDurabilityLossEffects,
  computeEquipmentBreakEffects,
} from './equipment-effects';
import { computeAmuletEffectsForState, getEquipmentInSlot, getSlotBonus } from '../equipment';

export interface ShieldSelfDamageResult {
  patch: Partial<GameState>;
  sideEffects: SideEffect[];
  enqueuedActions: GameAction[];
  /** Diagnostic — how much damage the armor absorbed (clamped to current armor). */
  blocked: number;
  /** Diagnostic — how much damage spilled past the armor (enqueued as APPLY_DAMAGE). */
  overflow: number;
  /** Diagnostic — whether the armor was depleted to zero by this hit. */
  armorDepleted: boolean;
  /** Diagnostic — whether the equipment was destroyed (durability hit zero). */
  destroyed: boolean;
}

/**
 * Apply a "spell-damage hits one of my own shields" event to a slot.
 *
 * Caller is responsible for:
 *   1. Verifying the slot holds a `type === 'shield'` OR `type === 'monster'`
 *      item with `armor > 0`. Monster equipment can serve as both weapon and
 *      shield; when it has armor it is a valid self-damage target and is
 *      treated identically to a regular shield (no bone-regen / monster-shield
 *      auto-recovery / RESOLVE_BLOCK passive triggers).
 *   2. Wiring the result into the reducer's patch / sideEffects /
 *      enqueuedActions before returning.
 */
export function applyShieldSlotSelfDamage(
  state: GameState,
  slotId: EquipmentSlotId,
  rawDamage: number,
  source: string,
): ShieldSelfDamageResult {
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  const slotItem = getEquipmentInSlot(state, slotId);
  const damage = Math.max(0, Math.floor(Number.isFinite(rawDamage) ? rawDamage : 0));

  if (!slotItem || (slotItem.type !== 'shield' && slotItem.type !== 'monster') || damage <= 0) {
    if (damage > 0) {
      enqueuedActions.push({
        type: 'APPLY_DAMAGE',
        amount: damage,
        source,
        selfInflicted: true,
      });
    }
    return {
      patch,
      sideEffects,
      enqueuedActions,
      blocked: 0,
      overflow: damage,
      armorDepleted: false,
      destroyed: false,
    };
  }

  const isMonsterEquipShield = slotItem.type === 'monster';
  const baseArmorMax = isMonsterEquipShield
    ? (slotItem.hp ?? slotItem.value)
    : (slotItem.armorMax ?? slotItem.value);
  const slotShieldBonus = getSlotBonus(state, slotId, 'shield');
  const rawSlotTemp = state.slotTempArmor?.[slotId] ?? 0;

  // Single-counter armor model: storedCap = max(0, baseArmorMax + perm + temp).
  // Floor on FINAL sum so negative perm/temp reduce cap instead of being dropped.
  // No transient eliteBonus on this self-damage path (mirrors prior behaviour;
  // shield-self-damage doesn't honour gold-stealing elite armor doubling).
  const storedCap = Math.max(0, baseArmorMax + slotShieldBonus + rawSlotTemp);
  const currentArmor = Math.min(slotItem.armor ?? storedCap, storedCap);

  const blocked = Math.min(damage, currentArmor);
  const overflow = Math.max(0, damage - currentArmor);
  const armorDepleted = currentArmor > 0 && blocked >= currentArmor;
  const newArmorAfterBlock = Math.max(0, currentArmor - blocked);

  // Mirror the RESOLVE_BLOCK accounting: when armor isn't depleted, write back
  // the new current armor; when it is depleted, durability handling will reset
  // to a fresh cycle (next read defaults to cap).
  let workingShieldItem: GameCardData = { ...slotItem };
  if (!armorDepleted) {
    workingShieldItem = {
      ...slotItem,
      armor: newArmorAfterBlock,
    };
  } else {
    const { armor: _clearArmor, ...resetBase } = slotItem as GameCardData & { armor?: number };
    void _clearArmor;
    workingShieldItem = resetBase as GameCardData;
  }

  // Log the absorption regardless of overflow/durability outcome.
  if (blocked > 0) {
    const overflowSuffix = overflow > 0 ? `，溢出 ${overflow} 点扣血` : '';
    sideEffects.push({
      event: 'log:entry',
      payload: {
        type: 'magic',
        message: `${slotItem.name} 吃下 ${blocked} 点法术伤害（护甲 ${currentArmor}→${newArmorAfterBlock}）${overflowSuffix}`,
      },
    });
  }

  // Enqueue the overflow as a normal self-damage event so all the existing
  // hooks (tempShield → hp, 血怒战符 charging, 复生赐福, self-damage-draw amulet,
  // totalDamageTaken / turnDamageTaken bookkeeping) fire automatically.
  if (overflow > 0) {
    enqueuedActions.push({
      type: 'APPLY_DAMAGE',
      amount: overflow,
      source,
      selfInflicted: true,
    });
  }

  // Durability handling — only when armor was depleted.
  let destroyed = false;
  if (armorDepleted) {
    const isUnbreakableUntilWaterfall = Boolean((state.unbreakableUntilWaterfall ?? {})[slotId]);
    if (isUnbreakableUntilWaterfall) {
      // No durability change; just commit the armor reset (workingShieldItem
      // already had its armor / bonusDamaged stripped above).
      patch[slotId] = workingShieldItem as EquipmentItem;
    } else {
      const shieldDurability = slotItem.durability ?? 1;
      const ae = computeAmuletEffectsForState(state);

      if (shieldDurability <= 1 && !state.unbreakableNext) {
        // Last point of durability — equipment breaks. Run last-words / revive.
        destroyed = true;
        const breakResult = computeEquipmentBreakEffects(state, slotId, slotItem as GameCardData, ae);
        Object.assign(patch, breakResult.patch);
        patch.rng = breakResult.rng;
        sideEffects.push(...breakResult.sideEffects);
        enqueuedActions.push(...breakResult.enqueuedActions);
        if (breakResult.drawFromBackpack > 0) {
          sideEffects.push({
            event: 'equipment:drawFromBackpack',
            payload: { count: breakResult.drawFromBackpack },
          });
        }
        if (breakResult.classCardDraw > 0) {
          sideEffects.push({
            event: 'equipment:classCardDraw',
            payload: { count: breakResult.classCardDraw },
          });
        }
        if (breakResult.revived) {
          // Equipment was rescued — `breakResult.patch[slotId]` already holds
          // the revived item (durability 1, armor stripped); nothing else to do.
          destroyed = false;
        }
      } else {
        // Durability survives this hit — decrement and run loss-side effects.
        const nextDurability = shieldDurability <= 1 ? shieldDurability : shieldDurability - 1;
        const updatedDurability = state.unbreakableNext && shieldDurability <= 1
          ? shieldDurability
          : nextDurability;
        const durabilityActuallyLost = updatedDurability < shieldDurability;

        const { armor: _resetArmor, ...durabilityBase } = workingShieldItem as GameCardData & {
          armor?: number;
        };
        void _resetArmor;

        if (durabilityActuallyLost) {
          const durResult = computeDurabilityLossEffects(state, slotId, slotItem as GameCardData, updatedDurability);
          Object.assign(patch, durResult.patch);
          patch.rng = durResult.rng;
          sideEffects.push(...durResult.sideEffects);
          // Strip stale armor from the rebuilt item so the next armor cycle
          // picks up baseArmorMax + bonus afresh — same trick as RESOLVE_BLOCK.
          const { armor: _resetArmorAgain, ...durStripped } = durResult.updatedItem as GameCardData & {
            armor?: number;
          };
          void _resetArmorAgain;
          patch[slotId] = { ...durabilityBase, ...durStripped } as EquipmentItem;

          if (durResult.golemReflectDamage) {
            const reflectTargetId = durResult.golemReflectDamage.targetId;
            const reflectTarget = state.activeCards.find(
              (c): c is GameCardData => !!c && c.id === reflectTargetId,
            );
            if (
              reflectTarget &&
              !(state.combatState?.engagedMonsterIds ?? []).includes(reflectTargetId)
            ) {
              enqueuedActions.push({
                type: 'BEGIN_COMBAT',
                monster: reflectTarget,
                initiator: 'hero',
              });
            }
            enqueuedActions.push({
              type: 'DEAL_DAMAGE_TO_MONSTER',
              monsterId: durResult.golemReflectDamage.targetId,
              damage: durResult.golemReflectDamage.damage,
              source: 'golem-reflect',
            });
            sideEffects.push({
              event: 'combat:shieldReflect',
              payload: {
                slotId: durResult.golemReflectDamage.slotId,
                targetId: durResult.golemReflectDamage.targetId,
              },
            });
          }
        } else {
          patch[slotId] = { ...durabilityBase, durability: updatedDurability } as EquipmentItem;
        }

        if (shieldDurability <= 1 && state.unbreakableNext) {
          patch.unbreakableNext = false;
        }
      }
    }
  } else {
    // Armor partially consumed — write the working item back.
    patch[slotId] = workingShieldItem as EquipmentItem;
  }

  return {
    patch,
    sideEffects,
    enqueuedActions,
    blocked,
    overflow,
    armorDepleted,
    destroyed,
  };
}
