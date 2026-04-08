/**
 * Building aura adjacency: 3 rows × 5 columns — preview (0), active dungeon (1), hero row (2).
 * Equipment occupies hero row columns 1 (左) and 3 (右)，与 GameBoard 地城列对齐。
 */

import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, EquipmentItem, EquipmentSlotId } from '@/components/game-board/types';
import { DUNGEON_COLUMN_COUNT } from './constants';

export const BUILDING_AURA_SUPPRESS_ADJACENT_TEMP_ATTACK = 'suppress-adjacent-temp-attack' as const;
export const BUILDING_AURA_ADJACENT_MAGIC_IMMUNE = 'adjacent-magic-immune' as const;
export type BuildingAuraId = typeof BUILDING_AURA_SUPPRESS_ADJACENT_TEMP_ATTACK | typeof BUILDING_AURA_ADJACENT_MAGIC_IMMUNE;

const BUILDING_ROW = 1;
const HERO_EQUIP_COL: Record<EquipmentSlotId, number> = {
  equipmentSlot1: 1,
  equipmentSlot2: 3,
};

/** 8 邻域（含斜向）内、属于英雄行且为左/右装备栏的格子 → 装备槽位 */
export function getAdjacentEquipmentSlotsForDungeonColumn(dungeonCol: number): EquipmentSlotId[] {
  const set = new Set<EquipmentSlotId>();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = BUILDING_ROW + dr;
      const nc = dungeonCol + dc;
      if (nr < 0 || nr > 2 || nc < 0 || nc > 4) continue;
      if (nr !== 2) continue;
      if (nc === HERO_EQUIP_COL.equipmentSlot1) set.add('equipmentSlot1');
      if (nc === HERO_EQUIP_COL.equipmentSlot2) set.add('equipmentSlot2');
    }
  }
  return [...set];
}

function isSuppressTempAttackAura(card: GameCardData | null | undefined): boolean {
  return (
    card?.type === 'building' &&
    card.buildingAura === BUILDING_AURA_SUPPRESS_ADJACENT_TEMP_ATTACK
  );
}

/**
 * 这些装备栏上的「临时攻击」数值应视为 0（仅 slotTempAttack，不含血怒等）。
 * 邻格有装备时才抑制该栏；若栏空则无需处理。
 */
export function getEquipmentSlotsWithSuppressedTempAttack(
  activeCards: ActiveRowSlots,
  equipmentSlot1: EquipmentItem | null,
  equipmentSlot2: EquipmentItem | null,
): Set<EquipmentSlotId> {
  const suppressed = new Set<EquipmentSlotId>();
  for (let d = 0; d < DUNGEON_COLUMN_COUNT; d++) {
    const card = activeCards[d];
    if (!isSuppressTempAttackAura(card)) continue;
    for (const slotId of getAdjacentEquipmentSlotsForDungeonColumn(d)) {
      const item = slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      if (item) suppressed.add(slotId);
    }
  }
  return suppressed;
}

function isAdjacentMagicImmuneAura(card: GameCardData | null | undefined): boolean {
  return (
    card?.type === 'building' &&
    card.buildingAura === BUILDING_AURA_ADJACENT_MAGIC_IMMUNE
  );
}

/**
 * 检查指定地城列中的怪物是否因相邻建筑光环而免疫玩家魔法伤害。
 * 仅检查同行（active row）左右相邻格。
 */
export function isMonsterMagicImmuneByBuilding(
  activeCards: ActiveRowSlots,
  monsterCol: number,
): boolean {
  const leftCol = monsterCol - 1;
  const rightCol = monsterCol + 1;
  if (leftCol >= 0 && isAdjacentMagicImmuneAura(activeCards[leftCol])) return true;
  if (rightCol < DUNGEON_COLUMN_COUNT && isAdjacentMagicImmuneAura(activeCards[rightCol])) return true;
  return false;
}
