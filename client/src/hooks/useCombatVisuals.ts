/**
 * useCombatVisuals — groups combat visual-feedback state
 * (bleed/heal animations, weapon swings, shield blocks, damage/healing indicators).
 *
 * Purely state management — no game logic, no subscriptions.
 */

import { useState } from 'react';
import type { EquipmentSlotId } from '@/components/game-board/types';

const INITIAL_SLOT_COUNTERS: Record<EquipmentSlotId, number> = {
  equipmentSlot1: 0,
  equipmentSlot2: 0,
};
const INITIAL_SLOT_VARIANTS: Record<EquipmentSlotId, 0 | 1> = {
  equipmentSlot1: 0,
  equipmentSlot2: 0,
};

export function useCombatVisuals() {
  const [takingDamage, setTakingDamage] = useState(false);
  const [healing, setHealing] = useState(false);
  const [heroBleedActive, setHeroBleedActive] = useState(false);
  const [monsterBleedStates, setMonsterBleedStates] = useState<Record<string, number>>({});
  const [monsterHealStates, setMonsterHealStates] = useState<Record<string, number>>({});
  const [monsterDefeatStates, setMonsterDefeatStates] = useState<Record<string, boolean>>({});
  // mineExplodeStates: keyed by active-row slot index (0..DUNGEON_COLUMN_COUNT-1).
  // Counter increments when 'combat:mineTriggered' fires for that slot, decrements
  // when the animation completes. Rendered in `ActiveRow.tsx` as a slot-indexed
  // overlay so the burst stays at the cell where the mine was, even though by
  // the time the animation runs the slot already contains the monster that
  // landed on the mine.
  const [mineExplodeStates, setMineExplodeStates] = useState<Record<number, number>>({});
  const [weaponSwingStates, setWeaponSwingStates] = useState<Record<EquipmentSlotId, number>>(INITIAL_SLOT_COUNTERS);
  const [shieldBlockStates, setShieldBlockStates] = useState<Record<EquipmentSlotId, number>>(INITIAL_SLOT_COUNTERS);
  const [weaponSwingVariant, setWeaponSwingVariant] = useState<Record<EquipmentSlotId, 0 | 1>>(INITIAL_SLOT_VARIANTS);
  const [shieldBlockVariant, setShieldBlockVariant] = useState<Record<EquipmentSlotId, 0 | 1>>(INITIAL_SLOT_VARIANTS);
  const [swordVectors, setSwordVectors] = useState<Record<string, { left: number; top: number; angle: number; length: number }>>({});

  return {
    takingDamage, setTakingDamage,
    healing, setHealing,
    heroBleedActive, setHeroBleedActive,
    monsterBleedStates, setMonsterBleedStates,
    monsterHealStates, setMonsterHealStates,
    monsterDefeatStates, setMonsterDefeatStates,
    mineExplodeStates, setMineExplodeStates,
    weaponSwingStates, setWeaponSwingStates,
    shieldBlockStates, setShieldBlockStates,
    weaponSwingVariant, setWeaponSwingVariant,
    shieldBlockVariant, setShieldBlockVariant,
    swordVectors, setSwordVectors,
  } as const;
}
