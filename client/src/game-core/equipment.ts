/**
 * Equipment Domain — pure logic for equipment slot management,
 * durability, repairs, and amulet effects computation.
 */

import type { GameCardData } from '@/components/GameCard';
import type {
  EquipmentSlotId,
  EquipmentItem,
  AmuletItem,
  EquipmentSlotBonusState,
  SlotPermanentBonus,
  SlotTempArmorState,
  ActiveAmuletEffects,
  EquipmentRepairTarget,
} from '@/components/game-board/types';
import type { GameState } from './types';
import { MAX_AMULET_SLOTS, createEmptyAmuletEffects } from './constants';

// ---------------------------------------------------------------------------
// Slot read helpers
// ---------------------------------------------------------------------------

export function getEquipmentInSlot(state: GameState, slotId: EquipmentSlotId): GameCardData | null {
  return slotId === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
}

export function getEquipmentSlots(state: GameState): Array<{ id: EquipmentSlotId; item: EquipmentItem | null }> {
  return [
    { id: 'equipmentSlot1' as const, item: state.equipmentSlot1 as EquipmentItem | null },
    { id: 'equipmentSlot2' as const, item: state.equipmentSlot2 as EquipmentItem | null },
  ];
}

export function getSlotBonus(state: GameState, slotId: EquipmentSlotId, bonusType: keyof SlotPermanentBonus): number {
  return state.equipmentSlotBonuses[slotId]?.[bonusType] ?? 0;
}

// ---------------------------------------------------------------------------
// Slot armor cap & refill helpers (single-counter armor model)
//
// Model:
//   - `slotItem.armor` holds the current armor value (live, decreases on
//     damage, increases on add-perm/add-temp, refills to cap on layer break
//     and on equip).
//   - The armor cap is `baseArmorMax + slotPermShieldBonus + slotTempArmor`,
//     computed dynamically from current state. There is no separate
//     `armorBonusDamaged` counter — damage decrements `armor` directly, and
//     when temp/perm bonus changes the cap moves with it (with `armor` being
//     bumped on add and clamped on subtract).
//   - `slotItem.armor === undefined` means "fresh / at full cap" — readers
//     should default to `cap` when they see undefined. The reduce paths that
//     write damage always set a definite number.
// ---------------------------------------------------------------------------

function readSlotItemFromPatch(
  state: GameState,
  slotId: EquipmentSlotId,
  patch?: Partial<GameState>,
): GameCardData | null {
  if (patch && Object.prototype.hasOwnProperty.call(patch, slotId)) {
    return (patch as { [k in EquipmentSlotId]?: GameCardData | null })[slotId] ?? null;
  }
  return getEquipmentInSlot(state, slotId);
}

function readSlotShieldBonusFromPatch(
  state: GameState,
  slotId: EquipmentSlotId,
  patch?: Partial<GameState>,
): number {
  if (patch?.equipmentSlotBonuses?.[slotId]) {
    return patch.equipmentSlotBonuses[slotId]?.shield ?? 0;
  }
  return state.equipmentSlotBonuses[slotId]?.shield ?? 0;
}

function readSlotTempArmorFromPatch(
  state: GameState,
  slotId: EquipmentSlotId,
  patch?: Partial<GameState>,
): number {
  if (patch?.slotTempArmor) {
    return patch.slotTempArmor[slotId] ?? 0;
  }
  return state.slotTempArmor?.[slotId] ?? 0;
}

/**
 * Compute the armor cap (baseArmorMax + perm + temp) for a shield/monster
 * equipped in `slotId`. Reads from `patch` first if present, otherwise state.
 * Returns 0 if the slot is empty or holds a non-shield/non-monster.
 */
export function getSlotArmorCap(
  state: GameState,
  slotId: EquipmentSlotId,
  patch?: Partial<GameState>,
): number {
  const item = readSlotItemFromPatch(state, slotId, patch);
  if (!item || (item.type !== 'shield' && item.type !== 'monster')) return 0;
  const baseArmorMax = item.type === 'monster'
    ? (item.hp ?? item.value ?? 0)
    : (item.armorMax ?? item.value ?? 0);
  const perm = readSlotShieldBonusFromPatch(state, slotId, patch);
  const temp = readSlotTempArmorFromPatch(state, slotId, patch);
  return Math.max(0, baseArmorMax + perm + temp);
}

/**
 * Read the current effective armor of the shield/monster in `slotId`,
 * defaulting `undefined` armor to the current cap. Returns 0 if no
 * shield/monster.
 */
export function getSlotCurrentArmor(
  state: GameState,
  slotId: EquipmentSlotId,
  patch?: Partial<GameState>,
): number {
  const item = readSlotItemFromPatch(state, slotId, patch);
  if (!item || (item.type !== 'shield' && item.type !== 'monster')) return 0;
  const cap = getSlotArmorCap(state, slotId, patch);
  if (item.armor === undefined) return cap;
  return Math.max(0, Math.min(item.armor, cap));
}

/**
 * Apply an immediate armor refill / clamp when the slot's armor cap changes
 * by `delta`. Call AFTER writing the cap-changing field into the patch.
 *
 * The cap can change for any of these reasons (helper is source-agnostic):
 *   - Permanent shield bonus added/removed (`equipmentSlotBonuses[slotId].shield`)
 *   - Temporary armor added/removed (`slotTempArmor[slotId]`)
 *   - Base armor bumped via amplify (`armorMax` for shield / `hp` for monster)
 *
 * Behavior:
 *   delta > 0 (cap grew)   → armor += delta, capped at the new cap
 *   delta < 0 (cap shrunk) → armor clamped to the new cap (never grows)
 *   delta === 0            → no-op
 *
 * If the slot is empty or holds a non-shield/non-monster, this is a no-op.
 * If `slotItem.armor` is undefined ("fresh / at full cap"), this is also a
 * no-op — the next read will see the new cap automatically.
 */
export function applySlotArmorBonusDelta(
  state: GameState,
  slotId: EquipmentSlotId,
  delta: number,
  patch: Partial<GameState>,
): void {
  if (delta === 0) return;
  const item = readSlotItemFromPatch(state, slotId, patch);
  if (!item || (item.type !== 'shield' && item.type !== 'monster')) return;
  if (item.armor === undefined) return;

  const newCap = getSlotArmorCap(state, slotId, patch);
  const newArmor = delta > 0
    ? Math.min(item.armor + delta, newCap)
    : Math.min(item.armor, newCap);

  if (newArmor === item.armor) return;
  (patch as { [k in EquipmentSlotId]?: GameCardData | null })[slotId] = { ...item, armor: newArmor };
}

/**
 * Refill the slot's shield/monster armor to the current cap. Call when a
 * shield/monster enters a slot (equip), or after a layer break where the
 * durability survived and the armor cycle should restart fresh.
 */
export function refillSlotArmorToCap(
  state: GameState,
  slotId: EquipmentSlotId,
  patch: Partial<GameState>,
): void {
  const item = readSlotItemFromPatch(state, slotId, patch);
  if (!item || (item.type !== 'shield' && item.type !== 'monster')) return;
  const newCap = getSlotArmorCap(state, slotId, patch);
  if (item.armor === newCap) return;
  (patch as { [k in EquipmentSlotId]?: GameCardData | null })[slotId] = { ...item, armor: newCap };
}

export function getSlotCapacity(state: GameState, slotId: EquipmentSlotId): number {
  return state.equipmentSlotCapacity[slotId] ?? 1;
}

export function getReserve(state: GameState, slotId: EquipmentSlotId): GameCardData[] {
  return slotId === 'equipmentSlot1' ? state.equipmentSlot1Reserve : state.equipmentSlot2Reserve;
}

// ---------------------------------------------------------------------------
// Slot write helpers
// ---------------------------------------------------------------------------

export function setEquipmentInSlot(
  state: GameState,
  slotId: EquipmentSlotId,
  item: GameCardData | null,
): Partial<GameState> {
  if (slotId === 'equipmentSlot1') return { equipmentSlot1: item as EquipmentItem | null };
  return { equipmentSlot2: item as EquipmentItem | null };
}

export function setSlotBonusPure(
  state: GameState,
  slotId: EquipmentSlotId,
  bonusType: keyof SlotPermanentBonus,
  updater: (current: number) => number,
): Partial<GameState> {
  const current = state.equipmentSlotBonuses[slotId]?.[bonusType] ?? 0;
  const newValue = updater(current);
  return {
    equipmentSlotBonuses: {
      ...state.equipmentSlotBonuses,
      [slotId]: {
        ...state.equipmentSlotBonuses[slotId],
        [bonusType]: newValue,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Equipment operations
// ---------------------------------------------------------------------------

export function swapEquipmentSlotsPure(state: GameState): Partial<GameState> {
  return {
    equipmentSlot1: state.equipmentSlot2,
    equipmentSlot2: state.equipmentSlot1,
    equipmentSlot1Reserve: state.equipmentSlot2Reserve,
    equipmentSlot2Reserve: state.equipmentSlot1Reserve,
    equipmentSlotBonuses: {
      equipmentSlot1: state.equipmentSlotBonuses.equipmentSlot2,
      equipmentSlot2: state.equipmentSlotBonuses.equipmentSlot1,
    },
    slotTempArmor: {
      equipmentSlot1: state.slotTempArmor.equipmentSlot2 ?? 0,
      equipmentSlot2: state.slotTempArmor.equipmentSlot1 ?? 0,
    },
    slotTempAttack: {
      equipmentSlot1: state.slotTempAttack.equipmentSlot2 ?? 0,
      equipmentSlot2: state.slotTempAttack.equipmentSlot1 ?? 0,
    },
    slotAttackBursts: {
      equipmentSlot1: state.slotAttackBursts.equipmentSlot2 ?? 0,
      equipmentSlot2: state.slotAttackBursts.equipmentSlot1 ?? 0,
    },
    equipmentSlotCapacity: {
      ...state.equipmentSlotCapacity,
      equipmentSlot1: state.equipmentSlotCapacity.equipmentSlot2 ?? 1,
      equipmentSlot2: state.equipmentSlotCapacity.equipmentSlot1 ?? 1,
    },
  };
}

export function clearEquipmentSlotPure(
  state: GameState,
  slotId: EquipmentSlotId,
): Partial<GameState> {
  return setEquipmentInSlot(state, slotId, null);
}

/**
 * Clear a slot and promote the next reserve item if available.
 */
export function clearSlotWithPromote(
  state: GameState,
  slotId: EquipmentSlotId,
): Partial<GameState> {
  const reserve = getReserve(state, slotId);
  if (reserve.length > 0) {
    const [promoted, ...rest] = reserve;
    return {
      ...setEquipmentInSlot(state, slotId, promoted),
      ...(slotId === 'equipmentSlot1'
        ? { equipmentSlot1Reserve: rest as EquipmentItem[] }
        : { equipmentSlot2Reserve: rest as EquipmentItem[] }),
    };
  }
  return setEquipmentInSlot(state, slotId, null);
}

/**
 * Swap a reserve card to the top of a slot.
 */
export function swapReserveToTop(
  state: GameState,
  slotId: EquipmentSlotId,
  reserveIndex: number,
): Partial<GameState> {
  const current = getEquipmentInSlot(state, slotId);
  const reserve = [...getReserve(state, slotId)];
  if (reserveIndex < 0 || reserveIndex >= reserve.length) return {};

  const swapped = reserve[reserveIndex];
  reserve[reserveIndex] = current!;
  const newReserve = reserve.filter(Boolean);

  return {
    ...setEquipmentInSlot(state, slotId, swapped),
    ...(slotId === 'equipmentSlot1'
      ? { equipmentSlot1Reserve: newReserve as EquipmentItem[] }
      : { equipmentSlot2Reserve: newReserve as EquipmentItem[] }),
  };
}

// ---------------------------------------------------------------------------
// Durability
// ---------------------------------------------------------------------------

export function repairDurabilityPure(
  equipment: GameCardData,
  amount: number,
): GameCardData {
  if (!equipment.durability || !equipment.maxDurability) return equipment;
  const newDurability = Math.min(equipment.maxDurability, equipment.durability + amount);
  const result: GameCardData = { ...equipment, durability: newDurability };
  if (equipment.type === 'shield' && equipment.armorMax != null) {
    delete result.armor;
  }
  return result;
}

export function consumeDurabilityPure(
  equipment: GameCardData,
): { equipment: GameCardData; destroyed: boolean } {
  if (!equipment.durability) return { equipment, destroyed: false };
  const newDurability = equipment.durability - 1;
  if (newDurability <= 0) {
    return { equipment: { ...equipment, durability: 0 }, destroyed: true };
  }
  const result: GameCardData = { ...equipment, durability: newDurability };
  if (equipment.type === 'shield' && equipment.armorMax != null) {
    delete result.armor;
  }
  return { equipment: result, destroyed: false };
}

// ---------------------------------------------------------------------------
// Amulet effects computation (pure)
// ---------------------------------------------------------------------------

/**
 * Synthesise GameCardData stand-ins for eternal relics that carry an
 * `amuletEffect`. This lets `computeAmuletEffects` aggregate equipped amulets
 * and converted relics through the same switch — preserving the design
 * invariant that 「护符永铸药」(amulet → eternal relic) keeps the original
 * effect functioning identically. Also covers natively-granted relics like
 * 永恒护符·回合汲取 (`end-turn-draw`) granted by 回合汲取药.
 *
 * Source of truth: `design_guidelines.md` §「Amulet-to-Relic Conversion」
 * — "an amulet converted to a relic continues to function identically — its
 * effect is included in the same `amuletEffects` object that all game logic
 * reads."
 */
function relicAmuletEffectsToCards(
  eternalRelics: ReadonlyArray<{ amuletEffect?: any; amuletAuraBonus?: any; upgradeLevel?: any }> | undefined,
): GameCardData[] {
  if (!eternalRelics || eternalRelics.length === 0) return [];
  const result: GameCardData[] = [];
  for (const r of eternalRelics) {
    if (!r || !r.amuletEffect) continue;
    result.push({
      type: 'amulet',
      amuletEffect: r.amuletEffect,
      amuletAuraBonus: r.amuletAuraBonus,
      upgradeLevel: r.upgradeLevel,
    } as unknown as GameCardData);
  }
  return result;
}

/**
 * Canonical reducer-side aggregator: includes both equipped amulets AND
 * eternal relics that carry an `amuletEffect`. **Use this from any reducer
 * that gates behavior on amulet effects** (combat, magic, waterfall, etc.)
 * — using `computeAmuletEffects(state.amuletSlots)` directly will silently
 * drop converted-relic effects and is a known footgun. See:
 * `parallel-state-fields-consumer-audit.mdc`.
 */
export function computeAmuletEffectsForState(state: GameState): ActiveAmuletEffects {
  return computeAmuletEffects([
    ...(state.amuletSlots as GameCardData[]),
    ...relicAmuletEffectsToCards(state.eternalRelics as any),
  ]);
}

/**
 * 怀柔之印 (Mercy Seal) trigger helper.
 *
 * Card text: "每次获得一次临时攻击或临时护甲加成时，下次劝降率 +10%（强化后 +20%）"
 *
 * **Strict semantic**: only call this when the player **genuinely gains** a
 * temporary attack or temporary armor bonus. Do NOT call on:
 * - Aura re-application (Strength / Balance during waterfall — continuous, not a "gain")
 * - Stat swap (e.g. swap-slot-damage-shield — moves existing values, no net gain)
 * - Bonus consumption (e.g. persuade-bonus-to-temp-attack — converts the bonus, doesn't grant a new one in addition)
 * - Decrement / clamp on temp-armor expire
 *
 * The helper is **patch-aware**: it reads `patch.persuadeAmuletBonus ?? state.persuadeAmuletBonus`,
 * so it composes correctly when called multiple times within the same reducer
 * step (each call stacks on the running total).
 *
 * Idempotent for non-equipped: when 怀柔之印 is not equipped (or its derived
 * `persuadeOnTempAttackCount === 0`), this is a noop.
 */
export function checkPersuadeOnTempAttack(
  state: GameState,
  patch: Partial<GameState>,
  sideEffects: Array<{ event: 'log:entry'; payload: { type: 'equip'; message: string } } | any>,
): void {
  const ae = computeAmuletEffectsForState(state);
  if (ae.persuadeOnTempAttackCount <= 0) return;
  const pBonus = ae.persuadeOnTempAttackBonus;
  const prev = patch.persuadeAmuletBonus ?? state.persuadeAmuletBonus ?? 0;
  const next = prev + pBonus;
  patch.persuadeAmuletBonus = next;
  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'equip', message: `怀柔之印：下次劝降率 +${pBonus}%（累计 +${next}%）` },
  });
}

/**
 * Hook-side aggregator: same merge as `computeAmuletEffectsForState` but
 * accepts `(amuletSlots, eternalRelics)` directly so React selectors can
 * subscribe to the two slices independently.
 */
export function computeAmuletEffectsCombined(
  amuletSlots: GameCardData[],
  eternalRelics: ReadonlyArray<{ amuletEffect?: any; amuletAuraBonus?: any; upgradeLevel?: any }> | undefined,
): ActiveAmuletEffects {
  return computeAmuletEffects([
    ...(amuletSlots ?? []),
    ...relicAmuletEffectsToCards(eternalRelics),
  ]);
}

export function computeAmuletEffects(amuletSlots: GameCardData[]): ActiveAmuletEffects {
  const effects: ActiveAmuletEffects = createEmptyAmuletEffects();
  if (!Array.isArray(amuletSlots)) return effects;

  for (const amulet of amuletSlots) {
    if (!amulet) continue;
    const upgradeLevel = amulet.upgradeLevel ?? 0;

    if (amulet.amuletAuraBonus) {
      effects.aura.attack += amulet.amuletAuraBonus.attack ?? 0;
      effects.aura.defense += amulet.amuletAuraBonus.defense ?? 0;
      effects.aura.maxHp += amulet.amuletAuraBonus.maxHp ?? 0;
    }

    // Universal stacking rule: every equipped amulet contributes independently.
    // Each `case` below increments a counter (or sums a bonus). Consumers gate
    // on `count > 0` and either multiply a magnitude by `count` or fire `count`
    // independent triggers (see field doc on ActiveAmuletEffects).
    switch (amulet.amuletEffect) {
      case 'heal': effects.healCount += 1; break;
      case 'balance': effects.balanceCount += 1; break;
      case 'life': effects.lifeOverkillBonus += 3; break;
      case 'catapult': effects.catapultCount += 1; break;
      case 'flash':
        // Aura: each equipped 闪光符 grants +1 extra attack per slot per turn
        // AND subtracts 2 from `lifeOverkillBonus` (mirror of life amulet's
        // +3, sharing the same field so they naturally cancel and stack).
        effects.flashCount += 1;
        effects.lifeOverkillBonus -= 2;
        break;
      case 'strength': effects.strengthCount += 1; break;
      case 'dual-guard': effects.dualGuardCount += 1; break;
      case 'discard-zap': effects.discardShockCount += 1; break;
      case 'flip-zap': effects.flipZapCount += 1; break;
      case 'flip-gold': effects.flipGoldCount += 1; break;
      case 'recycle-forge': effects.recycleForgeCount += 1; break;
      case 'lone-card': effects.loneCardCount += 1; break;
      case 'equipment-salvage': effects.equipmentSalvageCount += 1; break;
      case 'bloodrage-attack': effects.bloodrageAttackCount += 1; break;
      case 'self-damage-draw': effects.selfDamageDrawCount += 1; break;
      case 'persuade-on-temp-attack':
        effects.persuadeOnTempAttackCount += 1;
        effects.persuadeOnTempAttackBonus += upgradeLevel >= 1 ? 20 : 10;
        break;
      case 'persuade-grant-recycle-fetch':
        effects.persuadeGrantRecycleFetchCount += 1;
        effects.persuadeGrantRecycleFetchTotal += upgradeLevel >= 1 ? 2 : 1;
        break;
      case 'damage-class-discover': effects.damageClassDiscoverCount += 1; break;
      case 'persuade-graveyard-stack': effects.persuadeGraveyardStackCount += 1; break;
      case 'stun-recycle-to-hand': effects.stunRecycleToHandCount += 1; break;
      case 'monster-kill-upgrade': effects.monsterKillUpgradeCount += 1; break;
      case 'kill-cell-mine': effects.killCellMineCount += 1; break;
      case 'attack-persuade-discount': effects.attackPersuadeDiscountCount += 1; break;
      case 'card-gain-missile': effects.cardGainMissileCount += 1; break;
      case 'swap-upgrade': effects.swapUpgradeCount += 1; break;
      case 'stun-upgrade-cap':
        effects.stunUpgradeCapCount += 1;
        effects.stunUpgradeCapBonus += upgradeLevel >= 1 ? 12 : 8;
        break;
      case 'recycle-backpack-expand': effects.recycleBackpackExpandCount += 1; break;
      case 'dungeon-gold': effects.dungeonGoldCount += 1; break;
      case 'waterfall-heal': effects.waterfallHealCount += 1; break;
      case 'armor-halve-endure': effects.armorHalveEndureCount += 1; break;
      case 'monster-equip-buff': effects.monsterEquipBuffCount += 1; break;
      case 'lastwords-monster-debuff': effects.lastWordsMonsterDebuffCount += 1; break;
      case 'stun-rate-boost': effects.stunRateBoost += 20; break;
      case 'end-turn-draw': effects.endTurnDrawCount += 1; break;
      case 'stun-gold': effects.stunGoldCount += 1; break;
      case 'delete-draw': effects.deleteDrawCount += 1; break;
      case 'last-words-extra-trigger': effects.lastWordsExtraTriggerCount += 1; break;
      case 'manual-recycle-draw': effects.manualRecycleDrawCount += 1; break;
      case 'mirror-copy-summon': effects.mirrorCopySummonCount += 1; break;
      case 'soul-devour': effects.soulDevourCount += 1; break;
      // The following amulets are checked via direct amuletSlots.find/filter(...)
      // in their reducers; no aggregated count needed. Cases are listed for
      // documentation / completeness so they are recognised registered effects.
      case 'flip-overkill-lifesteal':
      case 'equip-amulet-cap':
      case 'stun-attempt-discover':
      case 'persuade-on-flip':
        break;
    }

    // Slot value/effect aura contributions (when not already covered by amuletAuraBonus)
    if (typeof amulet.value === 'number' && amulet.effect) {
      const hasAura = amulet.amuletAuraBonus;
      if (amulet.effect === 'attack' && !(hasAura && typeof hasAura.attack === 'number')) {
        effects.aura.attack += amulet.value;
      }
      if (amulet.effect === 'defense' && !(hasAura && typeof hasAura.defense === 'number')) {
        effects.aura.defense += amulet.value;
      }
      if (amulet.effect === 'health' && !(hasAura && typeof hasAura.maxHp === 'number')) {
        effects.aura.maxHp += amulet.value;
      }
    }
  }

  return effects;
}

// ---------------------------------------------------------------------------
// Repairable equipment helpers
// ---------------------------------------------------------------------------

export function getRepairableSlots(
  state: GameState,
  allowedTypes: EquipmentRepairTarget[],
): Array<{ slotId: EquipmentSlotId; item: GameCardData }> {
  const result: Array<{ slotId: EquipmentSlotId; item: GameCardData }> = [];
  const slots: EquipmentSlotId[] = ['equipmentSlot1', 'equipmentSlot2'];

  for (const slotId of slots) {
    const item = getEquipmentInSlot(state, slotId);
    if (!item || !item.durability || !item.maxDurability) continue;
    if (item.durability >= item.maxDurability) continue;

    const typeMatch = allowedTypes.some(t => {
      if (t === 'monster') return item.type === 'monster';
      return item.type === t;
    });
    if (typeMatch) result.push({ slotId, item });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Amulet slot management
// ---------------------------------------------------------------------------

export function canEquipAmulet(state: GameState): boolean {
  return state.amuletSlots.length < (state.maxAmuletSlots ?? MAX_AMULET_SLOTS);
}

export function equipAmuletPure(
  state: GameState,
  amulet: GameCardData,
): Partial<GameState> | null {
  if (!canEquipAmulet(state)) return null;
  return { amuletSlots: [...state.amuletSlots, amulet as AmuletItem] };
}

export function removeAmuletPure(
  state: GameState,
  amuletId: string,
): Partial<GameState> {
  return {
    amuletSlots: state.amuletSlots.filter(a => a.id !== amuletId),
  };
}

export function removeAllAmuletsPure(state: GameState): { amulets: GameCardData[]; patch: Partial<GameState> } {
  const removed = [...state.amuletSlots];
  return {
    amulets: removed,
    patch: { amuletSlots: [] },
  };
}
