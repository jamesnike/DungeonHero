/**
 * On-Equip Effect Definitions
 *
 * Registers all on-equip effects for weapon/shield cards.
 * Each handler receives slot-specific context and mutates patch/sideEffects/enqueuedActions.
 */

import type { OnEquipHandler } from '../on-equip';
import { registerOnEquipAll, registerOnEquipPrefix } from '../on-equip';
import type { EquipmentSlotId, ActiveRowSlots } from '@/components/game-board/types';
import { DURABILITY_CAP, clampMaxDurability } from '../../constants';
import { applySlotArmorBonusDelta, checkPersuadeOnTempAttack } from '../../equipment';
import type { GameCardData } from '@/components/GameCard';
import { nextInt } from '../../rng';
import { createMineBuilding } from '@/lib/knightDeck';

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

const gold4: OnEquipHandler = (_state, card, _slotId, _patch, sideEffects, enqueuedActions) => {
  enqueuedActions.push({ type: 'MODIFY_GOLD', delta: 4, source: 'on-equip' });
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：金币 +4！` } });
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

// 「右翼回响」option 6 — granted to a chosen equipment via
// `RESOLVE_EVENT_GRANT_EQUIP_PERSUADE_BONUS`. Mirrors `persuade-bonus-10` at +20.
// Reads the **current** patch value first so multiple +20 grants stack with
// concurrent +10 / +20 entries in the same equip step (matches +10 contract).
const persuadeBonus20: OnEquipHandler = (state, card, _slotId, patch, sideEffects) => {
  patch.persuadeAmuletBonus = ((patch.persuadeAmuletBonus ?? state.persuadeAmuletBonus) ?? 0) + 20;
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：下次劝降成功率 +20%` } });
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

// `draw-N` family — on-equip: 从背包抽 N 张牌。
// 走标准 `DRAW_CARDS source: 'backpack'` 入口（draw-cards-defaults-to-backpack 规则），
// 自动尊重「置顶」优先级、自动 emit `card:drawnToHand` 等下游事件。
const draw2: OnEquipHandler = (_state, card, _slotId, _patch, sideEffects, enqueuedActions) => {
  enqueuedActions.push({ type: 'DRAW_CARDS', count: 2, source: 'backpack' });
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：从背包抽 2 张牌！` } });
};

const draw3: OnEquipHandler = (_state, card, _slotId, _patch, sideEffects, enqueuedActions) => {
  enqueuedActions.push({ type: 'DRAW_CARDS', count: 3, source: 'backpack' });
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：从背包抽 3 张牌！` } });
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

// 「奥能裂变」outcome 4 — `spawn-mine:N` parameterized handler. Granted to a
// chosen main-slot equipment via `RESOLVE_EVENT_GRANT_ONEQUIP_SPAWN_MINE`.
// Triggers on every equip (PLAY_CARD / EQUIP_FROM_HAND / drag-to-slot — any
// path that runs `executeOnEquip`). Spawns N mines into random empty active-row
// slots, fizzling overflow when not enough empty slots exist (mirrors the
// `spawn-mine-empty` lastWords semantics in equipment-effects.ts and the
// `lay-mine` magic resolver in magic-effects.ts).
const spawnMine: OnEquipHandler = (state, card, _slotId, patch, sideEffects, _enqueuedActions) => {
  const effectId = (card as any).onEquipEffect as string;
  const amount = parseInt(effectId.replace('spawn-mine:', ''), 10) || 1;
  const baseActive = (patch.activeCards ?? state.activeCards) as (GameCardData | null)[];
  const emptyIdxs: number[] = [];
  for (let i = 0; i < baseActive.length; i++) {
    if (baseActive[i] === null) emptyIdxs.push(i);
  }
  if (emptyIdxs.length === 0) {
    sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：激活行已满，地雷未能放置。` } });
    return;
  }
  const placeCount = Math.min(amount, emptyIdxs.length);
  let rng = patch.rng ?? state.rng;
  const remaining = [...emptyIdxs];
  const chosenIdxs: number[] = [];
  for (let k = 0; k < placeCount; k++) {
    const [pickIdx, nextRng] = nextInt(rng, 0, remaining.length - 1);
    rng = nextRng;
    chosenIdxs.push(remaining[pickIdx]);
    remaining.splice(pickIdx, 1);
  }
  const newActive = [...baseActive];
  const placedMines: { idx: number; mineId: string }[] = [];
  for (const slotIdx of chosenIdxs) {
    const [mine, nextRng] = createMineBuilding(rng);
    rng = nextRng;
    newActive[slotIdx] = mine;
    placedMines.push({ idx: slotIdx, mineId: mine.id });
  }
  patch.activeCards = newActive as ActiveRowSlots;
  patch.rng = rng;
  const droppedCount = amount - placeCount;
  const droppedTag = droppedCount > 0 ? `；${droppedCount} 个因空位不足丢失` : '';
  sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 入场效果：在 ${placeCount} 个随机位置布下地雷${droppedTag}` } });
  sideEffects.push({ event: 'magic:layMine', payload: { slots: placedMines, droppedCount } });
};

registerOnEquipPrefix('spawn-mine:', spawnMine);

registerOnEquipAll([
  { id: 'temp-attack-2', handler: tempAttack2 },
  { id: 'temp-attack-3', handler: tempAttack3 },
  { id: 'all-temp-attack-2', handler: allTempAttack2 },
  { id: 'all-temp-attack-4', handler: allTempAttack4 },
  { id: 'all-temp-attack-6', handler: allTempAttack6 },
  { id: 'temp-armor-3', handler: tempArmor3 },
  { id: 'gold+4', handler: gold4 },
  { id: 'persuade-bonus-10', handler: persuadeBonus10 },
  { id: 'persuade-bonus-20', handler: persuadeBonus20 },
  { id: 'spell-lifesteal+1', handler: spellLifesteal1 },
  { id: 'stunCap+5', handler: stunCap5 },
  { id: 'stunCap+10', handler: stunCap10 },
  { id: 'perm-slot-damage+1', handler: permSlotDamage1 },
  { id: 'perm-slot-damage+2', handler: permSlotDamage2 },
  { id: 'heal-3', handler: heal3 },
  { id: 'heal-4', handler: heal4 },
  { id: 'heal-5', handler: heal5 },
  { id: 'draw-2', handler: draw2 },
  { id: 'draw-3', handler: draw3 },
  { id: 'other-slot-durability+1', handler: otherSlotDurability1 },
  { id: 'durability-max+1', handler: durabilityMax1 },
]);
