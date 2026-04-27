/**
 * On-Equip Effect Definitions
 *
 * Registers all on-equip effects for weapon/shield cards.
 * Each handler receives slot-specific context and mutates patch/sideEffects/enqueuedActions.
 */

import type { OnEquipHandler } from '../on-equip';
import { registerOnEquipAll } from '../on-equip';
import type { EquipmentSlotId } from '@/components/game-board/types';
import { DURABILITY_CAP, clampMaxDurability } from '../../constants';
import { applySlotArmorBonusDelta, checkPersuadeOnTempAttack } from '../../equipment';

const otherSlot = (s: EquipmentSlotId): EquipmentSlotId =>
  s === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';

const defaultSlotState = { equipmentSlot1: 0, equipmentSlot2: 0 };

const tempAttack2: OnEquipHandler = (state, card, slotId, patch, sideEffects) => {
  const base = { ...(state.slotTempAttack ?? defaultSlotState), ...(patch.slotTempAttack ?? {}) };
  base[slotId] = (base[slotId] ?? 0) + 2;
  patch.slotTempAttack = base;
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：该装备栏临时攻击 +2！` } });
  checkPersuadeOnTempAttack(state, patch, sideEffects);
};

const tempAttack3: OnEquipHandler = (state, card, slotId, patch, sideEffects) => {
  const base = { ...(state.slotTempAttack ?? defaultSlotState), ...(patch.slotTempAttack ?? {}) };
  base[slotId] = (base[slotId] ?? 0) + 3;
  patch.slotTempAttack = base;
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：该装备栏临时攻击 +3！` } });
  checkPersuadeOnTempAttack(state, patch, sideEffects);
};

const gold6: OnEquipHandler = (_state, card, _slotId, _patch, sideEffects, enqueuedActions) => {
  enqueuedActions.push({ type: 'MODIFY_GOLD', delta: 6, source: 'on-equip' });
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：金币 +6！` } });
};

const allTempAttack2: OnEquipHandler = (state, card, _slotId, patch, sideEffects) => {
  const base = { ...(state.slotTempAttack ?? defaultSlotState), ...(patch.slotTempAttack ?? {}) };
  base.equipmentSlot1 = (base.equipmentSlot1 ?? 0) + 2;
  base.equipmentSlot2 = (base.equipmentSlot2 ?? 0) + 2;
  patch.slotTempAttack = base;
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：所有装备栏临时攻击 +2！` } });
  checkPersuadeOnTempAttack(state, patch, sideEffects);
};

const allTempAttack4: OnEquipHandler = (state, card, _slotId, patch, sideEffects) => {
  const base = { ...(state.slotTempAttack ?? defaultSlotState), ...(patch.slotTempAttack ?? {}) };
  base.equipmentSlot1 = (base.equipmentSlot1 ?? 0) + 4;
  base.equipmentSlot2 = (base.equipmentSlot2 ?? 0) + 4;
  patch.slotTempAttack = base;
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：所有装备栏临时攻击 +4！` } });
  checkPersuadeOnTempAttack(state, patch, sideEffects);
};

const allTempAttack6: OnEquipHandler = (state, card, _slotId, patch, sideEffects) => {
  const base = { ...(state.slotTempAttack ?? defaultSlotState), ...(patch.slotTempAttack ?? {}) };
  base.equipmentSlot1 = (base.equipmentSlot1 ?? 0) + 6;
  base.equipmentSlot2 = (base.equipmentSlot2 ?? 0) + 6;
  patch.slotTempAttack = base;
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：所有装备栏临时攻击 +6！` } });
  checkPersuadeOnTempAttack(state, patch, sideEffects);
};

const tempArmor3: OnEquipHandler = (state, card, slotId, patch, sideEffects) => {
  const base = { ...(state.slotTempArmor ?? defaultSlotState), ...(patch.slotTempArmor ?? {}) };
  base[slotId] = (base[slotId] ?? 0) + 3;
  patch.slotTempArmor = base;
  applySlotArmorBonusDelta(state, slotId, 3, patch);
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：该装备栏临时护甲 +3！` } });
  checkPersuadeOnTempAttack(state, patch, sideEffects);
};

const persuadeBonus10: OnEquipHandler = (state, card, _slotId, patch, sideEffects) => {
  patch.persuadeAmuletBonus = (state.persuadeAmuletBonus ?? 0) + 10;
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：下次劝降成功率 +10%` } });
};

const spellLifesteal1: OnEquipHandler = (state, card, _slotId, patch, sideEffects) => {
  patch.permanentSpellLifesteal = (state.permanentSpellLifesteal ?? 0) + 1;
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：超杀吸血 +1！` } });
};

const stunCap5: OnEquipHandler = (state, card, _slotId, patch, sideEffects) => {
  patch.stunCap = Math.min(100, (patch.stunCap ?? state.stunCap) + 5);
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：击晕上限 +5%！` } });
};

const stunCap10: OnEquipHandler = (state, card, _slotId, patch, sideEffects) => {
  patch.stunCap = Math.min(100, (patch.stunCap ?? state.stunCap) + 10);
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：击晕上限 +10%！` } });
};

const permSlotDamage1: OnEquipHandler = (state, card, slotId, patch, sideEffects) => {
  const bonuses = { ...state.equipmentSlotBonuses };
  bonuses[slotId] = { ...bonuses[slotId], damage: bonuses[slotId].damage + 1 };
  patch.equipmentSlotBonuses = bonuses;
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：该装备栏永久攻击 +1！` } });
};

const permSlotDamage2: OnEquipHandler = (state, card, slotId, patch, sideEffects) => {
  const bonuses = { ...state.equipmentSlotBonuses };
  bonuses[slotId] = { ...bonuses[slotId], damage: bonuses[slotId].damage + 2 };
  patch.equipmentSlotBonuses = bonuses;
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：该装备栏永久攻击 +2！` } });
};

const heal3: OnEquipHandler = (_state, card, _slotId, _patch, sideEffects, enqueuedActions) => {
  enqueuedActions.push({ type: 'HEAL', amount: 3, source: 'on-equip' });
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：恢复了 3 点生命！` } });
};

const heal4: OnEquipHandler = (_state, card, _slotId, _patch, sideEffects, enqueuedActions) => {
  enqueuedActions.push({ type: 'HEAL', amount: 4, source: 'on-equip' });
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：恢复了 4 点生命！` } });
};

const heal5: OnEquipHandler = (_state, card, _slotId, _patch, sideEffects, enqueuedActions) => {
  enqueuedActions.push({ type: 'HEAL', amount: 5, source: 'on-equip' });
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：恢复了 5 点生命！` } });
};

const otherSlotDurability1: OnEquipHandler = (state, card, slotId, patch, sideEffects) => {
  const otherSlotId = otherSlot(slotId);
  const otherItem = otherSlotId === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
  if (otherItem && otherItem.durability != null && otherItem.maxDurability != null) {
    const newDur = Math.min(otherItem.maxDurability, otherItem.durability + 1);
    if (newDur > otherItem.durability) {
      patch[otherSlotId] = { ...otherItem, durability: newDur } as any;
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${card.name} 入场效果：${otherItem.name} 耐久 +1（${otherItem.durability} → ${newDur}）` },
      });
    }
  }
};

const durabilityMax1: OnEquipHandler = (state, card, slotId, patch, sideEffects) => {
  const currentItem = patch[slotId] ?? (slotId === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2);
  if (currentItem && (currentItem as any).maxDurability != null) {
    const prevMax = (currentItem as any).maxDurability as number;
    const newMax = clampMaxDurability(prevMax + 1);
    if (newMax > prevMax) {
      patch[slotId] = { ...currentItem, maxDurability: newMax } as any;
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${card.name} 入场效果：耐久度上限 +1（${prevMax} → ${newMax}）` },
      });
    } else {
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${card.name} 入场效果：耐久度已达上限 ${DURABILITY_CAP}，无法继续提升。` },
      });
    }
  }
};

registerOnEquipAll([
  { id: 'temp-attack-2', handler: tempAttack2 },
  { id: 'temp-attack-3', handler: tempAttack3 },
  { id: 'all-temp-attack-2', handler: allTempAttack2 },
  { id: 'all-temp-attack-4', handler: allTempAttack4 },
  { id: 'all-temp-attack-6', handler: allTempAttack6 },
  { id: 'temp-armor-3', handler: tempArmor3 },
  { id: 'gold+6', handler: gold6 },
  { id: 'persuade-bonus-10', handler: persuadeBonus10 },
  { id: 'spell-lifesteal+1', handler: spellLifesteal1 },
  { id: 'stunCap+5', handler: stunCap5 },
  { id: 'stunCap+10', handler: stunCap10 },
  { id: 'perm-slot-damage+1', handler: permSlotDamage1 },
  { id: 'perm-slot-damage+2', handler: permSlotDamage2 },
  { id: 'heal-3', handler: heal3 },
  { id: 'heal-4', handler: heal4 },
  { id: 'heal-5', handler: heal5 },
  { id: 'other-slot-durability+1', handler: otherSlotDurability1 },
  { id: 'durability-max+1', handler: durabilityMax1 },
]);
