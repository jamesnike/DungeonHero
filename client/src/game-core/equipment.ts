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
    delete result.armorBonusDamaged;
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
    delete result.armorBonusDamaged;
  }
  return { equipment: result, destroyed: false };
}

// ---------------------------------------------------------------------------
// Amulet effects computation (pure)
// ---------------------------------------------------------------------------

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

    switch (amulet.amuletEffect) {
      case 'heal': effects.hasHeal = true; break;
      case 'balance': effects.hasBalance = true; break;
      case 'life': effects.lifeOverkillBonus = 4; break;
      case 'catapult': effects.hasCatapult = true; break;
      case 'flash': effects.hasFlash = true; break;
      case 'strength': effects.hasStrength = true; break;
      case 'dual-guard': effects.hasDualGuard = true; break;
      case 'discard-zap': effects.hasDiscardShock = true; break;
      case 'flip-zap': effects.flipZapCount += 1; break;
      case 'flip-gold': effects.hasFlipGold = true; break;
      case 'recycle-forge': effects.hasRecycleForge = true; break;
      case 'lone-card': effects.hasLoneCard = true; break;
      case 'equipment-salvage': effects.hasEquipmentSalvage = true; break;
      case 'bloodrage-attack': effects.hasBloodrageAttack = true; break;
      case 'persuade-on-temp-attack':
        effects.hasPersuadeOnTempAttack = true;
        effects.persuadeOnTempAttackBonus = upgradeLevel >= 1 ? 20 : 10;
        break;
      case 'persuade-grant-recycle-fetch':
        effects.hasPersuadeGrantRecycleFetch = true;
        effects.persuadeGrantRecycleFetchCount = upgradeLevel >= 1 ? 2 : 1;
        break;
      case 'damage-class-discover': effects.hasDamageClassDiscover = true; break;
      case 'persuade-graveyard-stack': effects.hasPersuadeGraveyardStack = true; break;
      case 'stun-recycle-to-hand': effects.hasStunRecycleToHand = true; break;
      case 'monster-kill-upgrade': effects.hasMonsterKillUpgrade = true; break;
      case 'attack-persuade-discount': effects.hasAttackPersuadeDiscount = true; break;
      case 'card-gain-missile': effects.hasCardGainMissile = true; break;
      case 'swap-upgrade': effects.hasSwapUpgrade = true; break;
      case 'stun-upgrade-cap': effects.hasStunUpgradeCap = true; break;
      case 'recycle-backpack-expand': effects.hasRecycleBackpackExpand = true; break;
      case 'dungeon-gold': effects.hasDungeonGold = true; break;
      case 'armor-halve-endure': effects.hasArmorHalveEndure = true; break;
      case 'monster-equip-buff': effects.hasMonsterEquipBuff = true; break;
      case 'lastwords-monster-debuff': effects.hasLastWordsMonsterDebuff = true; break;
      case 'stun-rate-boost': effects.stunRateBoost += 20; break;
      case 'end-turn-draw': effects.hasEndTurnDraw = true; break;
      case 'stun-gold': effects.hasStunGold = true; break;
      // The following amulets are checked via direct amuletSlots.find(...) in
      // their reducers; no aggregated flag needed. Cases are listed for
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
