/**
 * Equipment Effects — pure functions for equipment destruction ("last words"),
 * durability loss effects (bleed, dragon, wraith, swarm, golem), and revive logic.
 *
 * Shared by PERFORM_HERO_ATTACK and RESOLVE_BLOCK to eliminate duplication.
 */

import type { GameCardData } from '@/components/GameCard';
import { isPermRecycleEquipment } from '@/components/GameCard';
import type {
  EquipmentSlotId,
  EquipmentItem,
  EquipmentSlotBonusState,
  ActiveAmuletEffects,
  ActiveRowSlots,
} from '@/components/game-board/types';
import type { GameState } from '../types';
import type { SideEffect } from '../reducer';
import type { GameAction } from '../actions';
import { flattenActiveRowSlots, applyAmplifyOnCreate } from '../helpers';
import type { RngState } from '../rng';
import { nextBool, nextInt, pickRandom } from '../rng';
import { createBugletCard } from '../deck';
import { resetCardForGraveyard, getEffectiveHandLimit } from '../cards';
import { applySlotArmorBonusDelta, checkPersuadeOnTempAttack } from '../equipment';
import { createMineBuilding } from '@/lib/knightDeck';
import { applyGainMagicBolts, formatGainMagicBoltsDistribution } from '../events';
import type { MineCollision } from '../combat';
import { equipOverclockExtraTriggers } from './equipment-overclock';

// ---------------------------------------------------------------------------
// Perm-recycle routing — equipment that is destroyed but carries a Perm flag
// (永恒铭刻 sets `recycleDelay`, native `permEquipment: true`, etc.) must end
// up in the permanent magic recycle bag rather than vanishing or going to the
// graveyard. `permStripped` (set by 凡化咒) overrides everything and forces
// non-Perm routing — kept consistent with `cards.ts:reduceDisposeEquipmentCard`
// and `helpers.ts:getWaterfallPreviewDiscardDestination`.
// ---------------------------------------------------------------------------

export function shouldRouteEquipmentToPermRecycle(card: GameCardData): boolean {
  if (card.permStripped) return false;
  if (isPermRecycleEquipment(card)) return true;
  if (
    (card.type === 'weapon' || card.type === 'shield' || card.type === 'monster')
    && card.recycleDelay != null && card.recycleDelay > 0
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Mine damage boost — 「引雷阵锋」类武器累计耐久损失到 globalMineDamageBonus。
//
// 调用点：所有让装备 `durability` 下降的 reducer 路径（武器攻击 tick / 蓄能裂击 /
// 腐蚀甲壳 / 等价交换 等）。`computeDurabilityLossEffects` 已包好；其它直接
// 写 `patch[slotId].durability = newDur` 的路径手动调本 helper。
//
// 不变量：
// - `slotItem.mineDamageBoostPerDur` 未设 / 为 0 → no-op。
// - `durLost <= 0`（修复或 newDur > prevDur）→ no-op。
// - 已累加的 bonus 永久保留（修复武器耐久不会扣回）。
// - 同一 reduce 步骤里多次调用，会顺序累加到 `patch.globalMineDamageBonus`。
// ---------------------------------------------------------------------------

export function accumulateMineDamageBoost(
  state: GameState,
  slotItem: GameCardData,
  durLost: number,
  patch: Partial<GameState>,
  sideEffects: SideEffect[],
): void {
  const perDur = slotItem.mineDamageBoostPerDur ?? 0;
  if (perDur <= 0 || durLost <= 0) return;
  const inc = perDur * durLost;
  const prev = patch.globalMineDamageBonus ?? state.globalMineDamageBonus ?? 0;
  const next = prev + inc;
  patch.globalMineDamageBonus = next;
  sideEffects.push({
    event: 'log:entry',
    payload: {
      type: 'equip',
      message: `${slotItem.name} 雷震共鸣：耐久 -${durLost} → 全场地雷伤害 +${inc}（累计 +${next}）`,
    },
  });
  sideEffects.push({
    event: 'ui:banner',
    payload: { text: `${slotItem.name}：地雷伤害 +${inc}（累计 +${next}）` },
  });
}

// ---------------------------------------------------------------------------
// Mine collisions — process triggers + clear displaced mines
// ---------------------------------------------------------------------------
//
// 给定 `detectMineCollisionsAfterShuffle` 返回的碰撞列表，统一处理副作用：
//   - 入队 BEGIN_COMBAT（保证怪物激怒，跟 monster-damage-engagement.mdc 一致）
//   - 入队 DEAL_DAMAGE_TO_MONSTER（source: 'mine-trap'，伤害 = mineDamage +
//     globalMineDamageBonus，跟 waterfall 路径一致）
//   - 入队 ADD_TO_GRAVEYARD（地雷送进坟场）
//   - emit 'combat:mineTriggered'（触发 cell flash + 闪电爆炸动画）
//
// 镜像 rules/waterfall.ts 里的瀑流地雷触发逻辑（line ~1190）。所有走这条
// helper 的入口（每条 swap/shuffle 调用方）都得到统一行为，避免漏写动画 /
// 漏写 engagement / 漏算 globalMineDamageBonus。
export function processMineCollisions(
  collisions: MineCollision[],
  state: GameState,
  sideEffects: SideEffect[],
  enqueuedActions: GameAction[],
): void {
  if (collisions.length === 0) return;
  const globalBonus = state.globalMineDamageBonus ?? 0;
  for (const { slotIdx, mine, monster } of collisions) {
    const damage = (mine.mineDamage ?? 0) + globalBonus;
    enqueuedActions.push({ type: 'BEGIN_COMBAT', monster, initiator: 'hero' });
    enqueuedActions.push({
      type: 'DEAL_DAMAGE_TO_MONSTER',
      monsterId: monster.id,
      damage,
      source: 'mine-trap',
    });
    enqueuedActions.push({ type: 'ADD_TO_GRAVEYARD', card: mine });
    sideEffects.push({
      event: 'combat:mineTriggered',
      payload: {
        slotIdx,
        monsterId: monster.id,
        damage,
        mineId: mine.id,
      },
    });
  }
}

/**
 * 把已经触发过的地雷从 active row 里清掉（设为 null）—— 它已经被
 * `ADD_TO_GRAVEYARD` 路由进坟场了，不能继续留在场上。
 *
 * 仅适用于 active↔active swap 场景：地雷被 swap 到了 active row 别的格子。
 * active↔preview swap、active↔deck swap 等地雷被排挤到非 active 区域的
 * 情况，调用方需要自己清理对应区域（`previewCards` / `remainingDeck` 等）。
 */
export function clearTriggeredMineSlots(
  activeRow: ActiveRowSlots,
  collisions: MineCollision[],
): ActiveRowSlots {
  if (collisions.length === 0) return activeRow;
  const result = [...activeRow] as ActiveRowSlots;
  for (const { mine } of collisions) {
    const idx = result.findIndex(c => c?.id === mine.id);
    if (idx !== -1) {
      result[idx] = null;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Shared helper — pick a random card from the graveyard, EXCLUDING a given id.
//
// Used by the `graveyard-to-hand` last-words effect (Iron Shield, etc.) to
// guarantee that a destroyed equipment cannot be picked back from a graveyard
// state that may already contain a previously-discarded copy with the same
// effect, or where the engine momentarily staged the card in discardedCards.
//
// Returns null when the filtered pool is empty.
// ---------------------------------------------------------------------------

export function pickGraveyardCardExcluding(
  graveyard: readonly GameCardData[],
  excludeId: string,
  rng: RngState,
): { picked: GameCardData; idx: number; rng: RngState } | null {
  const eligibleIndices: number[] = [];
  for (let i = 0; i < graveyard.length; i++) {
    if (graveyard[i].id !== excludeId) eligibleIndices.push(i);
  }
  if (eligibleIndices.length === 0) return null;
  const [pickIdx, nextRng] = nextInt(rng, 0, eligibleIndices.length - 1);
  const idx = eligibleIndices[pickIdx];
  return { picked: graveyard[idx], idx, rng: nextRng };
}

// ---------------------------------------------------------------------------
// Variant of pickGraveyardCardExcluding that only considers `type === 'event'`
// graveyard cards. Used by the `graveyard-event-to-hand` last-words token
// (e.g. 「生长之盾」). Returns null when no eligible event card is present.
// ---------------------------------------------------------------------------

export function pickGraveyardEventCardExcluding(
  graveyard: readonly GameCardData[],
  excludeId: string,
  rng: RngState,
): { picked: GameCardData; idx: number; rng: RngState } | null {
  const eligibleIndices: number[] = [];
  for (let i = 0; i < graveyard.length; i++) {
    const c = graveyard[i];
    if (c.id !== excludeId && c.type === 'event') eligibleIndices.push(i);
  }
  if (eligibleIndices.length === 0) return null;
  const [pickIdx, nextRng] = nextInt(rng, 0, eligibleIndices.length - 1);
  const idx = eligibleIndices[pickIdx];
  return { picked: graveyard[idx], idx, rng: nextRng };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EquipmentBreakResult {
  patch: Partial<GameState>;
  sideEffects: SideEffect[];
  /** Follow-up actions to enqueue (e.g. DISPOSE_EQUIPMENT_CARD for graveyard-to-hand last words). */
  enqueuedActions: GameAction[];
  /** Number of cards to draw from backpack to hand */
  drawFromBackpack: number;
  /** Number of class cards to draw to backpack */
  classCardDraw: number;
  /** Whether the item was revived (durability set to 1) */
  revived: boolean;
  /** Whether the item was destroyed (slot cleared) */
  destroyed: boolean;
  /** If a wraith swap occurred, which slot got moved */
  wraithSwapTarget?: EquipmentSlotId;
  /** Updated RNG state after any random calls */
  rng: RngState;
}

export interface DurabilityLossResult {
  updatedItem: GameCardData;
  patch: Partial<GameState>;
  sideEffects: SideEffect[];
  /** Monster damage to deal from golem reflect */
  golemReflectDamage?: { targetId: string; damage: number; slotId: EquipmentSlotId };
  /** Updated RNG state after any random calls */
  rng: RngState;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function otherSlot(slotId: EquipmentSlotId): EquipmentSlotId {
  return slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
}

function getSlotItem(state: GameState, slotId: EquipmentSlotId): GameCardData | null {
  return slotId === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
}

function slotLabel(slotId: EquipmentSlotId): string {
  return slotId === 'equipmentSlot1' ? '左' : '右';
}

// Route a broken equipment to its final destination — recycle bag (Perm) or
// graveyard (non-Perm). Mutates `patch` / `enqueuedActions` in place. Per
// GAME_MECHANICS.md §7 "非永久装备损毁 | 弃置 | 坟场" — broken equipment
// must not silently disappear.
//
// `resetCardForGraveyard` (per `monster-graveyard-layer-reset.mdc` rule)
// refills weapon/shield durability and resets monster `currentLayer` to 1
// before the card lands in `discardedCards`, so a future graveyard-fetch
// (e.g. Iron Shield's `graveyard-to-hand` last-words) can recover a fresh
// copy. The Perm path defers cleanup to `reduceAddToRecycleBag`.
function routeBrokenSelfToGraveOrRecycle(
  state: GameState,
  slotItem: GameCardData,
  isPermRecycle: boolean,
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
): void {
  if (isPermRecycle) {
    const { fromSlot: _fsp, armor: _ap, reviveUsed: _rup,
      equipmentReviveUsed: _erup, wraithRebirthUsed: _wrup, ...rest } =
      slotItem as GameCardData & Record<string, unknown>;
    const cleaned: GameCardData = { ...(rest as GameCardData) };
    enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card: cleaned });
  } else {
    const cleaned = resetCardForGraveyard(slotItem);
    const currentGrave = (patch.discardedCards ?? state.discardedCards) as GameCardData[];
    patch.discardedCards = [...currentGrave, cleaned];
  }
}

// Clear an equipment slot in `patch`, promoting the topmost reserve item up
// into the slot if any reserve exists. Mutates `patch` in place — sets
// `patch[slotId]` to either the promoted item or null, and `patch[reserveKey]`
// to the trimmed reserve list when a promotion happens.
//
// Convention: reserve is a stack and `reserve[reserve.length - 1]` is the
// topmost / visually-uppermost item (matches `SACRIFICE_EQUIPMENT_SLOT`,
// `events.ts` removeCard, and most other promote sites). The pure helper
// `equipment.ts:clearSlotWithPromote` historically used reserve[0] (first)
// but is unused; this site is the canonical promote entry for break/destroy
// reducer paths.
//
// IMPORTANT: previously the break/destroy reducer paths just set
// `patch[slotId] = null` and emitted an `equipment:clearSlotWithPromote`
// side effect, expecting a UI-layer listener to do the promote via
// `clearEquipmentSlotWithPromote(slotId)`. That listener was never wired up
// in `GameBoard.tsx` (just `console.log`), so the topmost reserve card never
// promoted up — it stayed in `equipmentSlot{1,2}Reserve` while
// `EquipmentSlot.tsx` rendered the slot as empty (the reserve stack only
// renders when `gameCardData` is truthy). Result: reserve appeared to vanish
// when the main equipment broke. Per `game-core-architecture.mdc` (state
// mutations belong in reducers, not in side-effect listeners), the promote
// is now done here in the pure reducer patch.
export function clearSlotAndPromoteReserve(
  state: GameState,
  slotId: EquipmentSlotId,
  patch: Partial<GameState>,
): void {
  const reserveKey: 'equipmentSlot1Reserve' | 'equipmentSlot2Reserve' =
    slotId === 'equipmentSlot1' ? 'equipmentSlot1Reserve' : 'equipmentSlot2Reserve';
  // Read the latest reserve from `patch` if a previous step already wrote it,
  // otherwise from base state. This keeps the helper composable when the
  // caller has already partially mutated `patch`.
  const currentReserve =
    (patch[reserveKey] as EquipmentItem[] | undefined) ?? (state[reserveKey] as EquipmentItem[]);
  if (currentReserve && currentReserve.length > 0) {
    let promoted = currentReserve[currentReserve.length - 1];
    // 铁壁塔盾「完全格挡」一次性使用 — reserve → main promotion 算「重新装备」，
    // strip `_fullBlockUsed` 让 promoted 盾的特效刷新。Mirror SET_EQUIPMENT_SLOT.
    // Defensive：reserve item 通常不该有 _fullBlockUsed=true（reserve 不参战），
    // 但任何"main → reserve → main"链路都覆盖到。
    if ((promoted as GameCardData).knightEffect === 'fullBlock'
        && (promoted as GameCardData & { _fullBlockUsed?: boolean })._fullBlockUsed) {
      const { _fullBlockUsed: _drop, ...rest } = promoted as GameCardData & { _fullBlockUsed?: boolean };
      promoted = rest as EquipmentItem;
    }
    const rest = currentReserve.slice(0, -1);
    patch[slotId] = promoted as EquipmentItem;
    patch[reserveKey] = rest as EquipmentItem[];
  } else {
    patch[slotId] = null as unknown as EquipmentItem;
  }
}

// ---------------------------------------------------------------------------
// Internal helper — runs ONE iteration of the equipment "last words" trigger
// block (logs, monster debuff, gold/heal/draw/perm bonuses, slot temp buffs,
// maxHp grants, onDestroyEffect variants, monster-specific lastWords like
// wraithHaunt / wraithDeathHeal). Mutates `patch`, `sideEffects`, and
// `enqueuedActions` in place.
//
// Reads cumulative state via `patch.X ?? state.X` so it's safe to call multiple
// times — each iteration sees previous iterations' accumulations and adds on top.
//
// Shared by `computeEquipmentDisplacementLastWords` (顶替/弃装重铸/灵魂置换 等)
// and `computeEquipmentBreakEffects` (装备耐久归零自然销毁) — both wrap this
// helper in a `1 + amuletEffects.lastWordsExtraTriggerCount` loop so the
// 「墓园守卫」amulet uniformly amplifies any equipment lastWords resolution.
//
// Per-trigger amulet effects (e.g. 「绝响之符」`lastwords-monster-debuff` reducing
// active row monster attack, 「怀柔之印」`persuade-on-temp-attack` boosting
// persuade rate) re-fire on every iteration, matching how those amulets stack
// with manually-amplified lastWords (e.g. 墓语遗愿 already calls displacement
// 2× and the per-trigger effects already fire 2×).
// ---------------------------------------------------------------------------

interface OneLastWordsIterationResult {
  rng: RngState;
  drawFromBackpack: number;
  classCardDraw: number;
}

function applyOneEquipmentLastWordsIteration(
  state: GameState,
  slotId: EquipmentSlotId,
  slotItem: GameCardData,
  amuletEffects: ActiveAmuletEffects,
  patch: Partial<GameState>,
  sideEffects: SideEffect[],
  enqueuedActions: GameAction[],
  rngIn: RngState,
): OneLastWordsIterationResult {
  const isMonsterEquip = slotItem.type === 'monster';
  const otherSlotId = otherSlot(slotId);
  // Read otherItem from patch so a previous iteration's wraithDeathHeal /
  // wraithDeathHealSpread mutation (writes to patch[otherSlotId]) is visible
  // to subsequent iterations.
  const otherItem = (patch[otherSlotId] ?? getSlotItem(state, otherSlotId)) as GameCardData | null;
  let rng = rngIn;
  let drawFromBackpack = 0;
  let classCardDraw = 0;

  const hasLastWords = slotItem.onDestroyHeal || slotItem.onDestroyGold || slotItem.onDestroyDraw
    || slotItem.onDestroyClassDraw || slotItem.onDestroyPermanentDamage || slotItem.onDestroyPermanentShield
    || slotItem.onDestroyEffect || slotItem.lastWordsSlotTempBuff
    || (isMonsterEquip && (slotItem.lastWords || slotItem.wraithDeathHeal || slotItem.wraithDeathHealSpread
      || slotItem.skeletonLastWordsDiscard));

  if (hasLastWords) {
    sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${slotItem.name} 遗言触发！` } });
  }

  if (hasLastWords && amuletEffects.lastWordsMonsterDebuffCount > 0) {
    const debuffPerTrigger = amuletEffects.lastWordsMonsterDebuffCount;
    const baseActive = (patch.activeCards ?? state.activeCards) as ActiveRowSlots;
    const debuffedActive = baseActive.map(c => {
      if (!c || c.type !== 'monster') return c;
      const curAtk = c.attack ?? c.value;
      return { ...c, attack: Math.max(0, curAtk - debuffPerTrigger) };
    }) as ActiveRowSlots;
    patch.activeCards = debuffedActive;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'amulet', message: `绝响之符：${slotItem.name} 遗言触发，激活行所有怪物攻击力 -${debuffPerTrigger}！` },
    });
  }

  if (slotItem.onDestroyHeal) {
    sideEffects.push({
      event: 'equipment:lastWordsHeal',
      payload: { amount: slotItem.onDestroyHeal, itemName: slotItem.name },
    });
  }

  if (slotItem.onDestroyGold) {
    patch.gold = (patch.gold ?? state.gold ?? 0) + slotItem.onDestroyGold;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 遗言：获得了 ${slotItem.onDestroyGold} 金币` },
    });
  }

  if (slotItem.onDestroyDraw) {
    drawFromBackpack += slotItem.onDestroyDraw;
  }

  if (slotItem.onDestroyClassDraw) {
    classCardDraw += slotItem.onDestroyClassDraw;
  }

  if (slotItem.onDestroyPermanentDamage) {
    const bonuses = patch.equipmentSlotBonuses
      ? { ...(patch.equipmentSlotBonuses as EquipmentSlotBonusState) }
      : { ...state.equipmentSlotBonuses };
    const slotBonus = { ...bonuses[slotId] };
    slotBonus.damage += slotItem.onDestroyPermanentDamage;
    bonuses[slotId] = slotBonus;
    patch.equipmentSlotBonuses = bonuses as EquipmentSlotBonusState;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 遗言：该装备栏永久伤害 +${slotItem.onDestroyPermanentDamage}！` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！永久伤害 +${slotItem.onDestroyPermanentDamage}！` } });
  }

  if (slotItem.onDestroyPermanentShield) {
    const bonuses = patch.equipmentSlotBonuses
      ? { ...(patch.equipmentSlotBonuses as EquipmentSlotBonusState) }
      : { ...state.equipmentSlotBonuses };
    const slotBonus = { ...bonuses[slotId] };
    slotBonus.shield += slotItem.onDestroyPermanentShield;
    bonuses[slotId] = slotBonus;
    patch.equipmentSlotBonuses = bonuses as EquipmentSlotBonusState;
    applySlotArmorBonusDelta(state, slotId, slotItem.onDestroyPermanentShield, patch);
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 遗言：该装备栏永久护甲 +${slotItem.onDestroyPermanentShield}！` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！永久护甲 +${slotItem.onDestroyPermanentShield}！` } });
  }

  // 遗赠淬炼药 — slot-temp-buff-3-3 stacks on top of any onDestroyEffect via the
  // separate `lastWordsSlotTempBuff` counter, so it must fire independently and
  // multiply by the number of times the potion was applied. Legacy save-game
  // compat: equipment whose `onDestroyEffect` is literally 'slot-temp-buff-3-3'
  // (set by the old overwriting potion code) also counts as 1 stack.
  const tempBuffStacks = (slotItem.lastWordsSlotTempBuff ?? 0)
    + (slotItem.onDestroyEffect === 'slot-temp-buff-3-3' ? 1 : 0);
  if (tempBuffStacks > 0) {
    const buffAmount = 3 * tempBuffStacks;
    const tempAttack = patch.slotTempAttack ?? { ...(state.slotTempAttack ?? {}) };
    const tempArmor = patch.slotTempArmor ?? { ...(state.slotTempArmor ?? {}) };
    tempAttack[slotId] = (tempAttack[slotId] ?? 0) + buffAmount;
    tempArmor[slotId] = (tempArmor[slotId] ?? 0) + buffAmount;
    patch.slotTempAttack = tempAttack;
    patch.slotTempArmor = tempArmor;
    applySlotArmorBonusDelta(state, slotId, buffAmount, patch);
    const stackSuffix = tempBuffStacks > 1 ? `（×${tempBuffStacks}）` : '';
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 遗言：该装备栏 +${buffAmount}临时攻击 +${buffAmount}临时护甲！${stackSuffix}` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！该装备栏 +${buffAmount}临时攻击 +${buffAmount}临时护甲！${stackSuffix}` } });
    if (amuletEffects.persuadeOnTempAttackCount > 0) {
      const pBonus = amuletEffects.persuadeOnTempAttackBonus;
      patch.persuadeAmuletBonus = (patch.persuadeAmuletBonus ?? state.persuadeAmuletBonus ?? 0) + pBonus * 2 * tempBuffStacks;
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `怀柔之印：下次劝降率 +${pBonus * 2 * tempBuffStacks}%（临时攻击+临时护甲 ×${tempBuffStacks}）` },
      });
    }
  }

  // 附魔祭坛「遗言：生命值上限+4」: each stack adds +4 to permanent maxHp.
  // Stacks parallel to lastWordsSlotTempBuff. Does NOT heal current HP — only raises the cap.
  const maxHpStacks = slotItem.lastWordsMaxHpBoost ?? 0;
  if (maxHpStacks > 0) {
    const amount = 4 * maxHpStacks;
    patch.permanentMaxHpBonus = (patch.permanentMaxHpBonus ?? state.permanentMaxHpBonus ?? 0) + amount;
    const stackSuffix = maxHpStacks > 1 ? `（×${maxHpStacks}）` : '';
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 遗言：永久最大生命 +${amount}！${stackSuffix}` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！永久最大生命 +${amount}！${stackSuffix}` } });
  }

  // 「奥能裂变」outcome 1: 装备销毁时手牌 +N 张「魔弹」。每个 stack 累加 N。
  // 通过 applyGainMagicBolts 共享 helper（hand → backpack → recycle 溢出）。
  // 与 lastWordsSlotTempBuff / lastWordsMaxHpBoost 并存，跟其它 onDestroyEffect 也并存。
  const boltStacks = slotItem.lastWordsGainBolt ?? 0;
  if (boltStacks > 0) {
    // Build an effective state that includes any prior patches applied earlier
    // in this iteration (especially if the patch already modified handCards /
    // backpackItems / permanentMagicRecycleBag / rng — unlikely for last-words
    // but defensive). applyGainMagicBolts reads from state.handCards etc.
    const effectiveState: GameState = {
      ...state,
      handCards: (patch.handCards as GameCardData[] | undefined) ?? state.handCards,
      backpackItems: (patch.backpackItems as GameCardData[] | undefined) ?? state.backpackItems,
      permanentMagicRecycleBag:
        (patch.permanentMagicRecycleBag as GameCardData[] | undefined) ?? state.permanentMagicRecycleBag,
      rng: (patch.rng ?? rng ?? state.rng) as RngState,
    };
    const result = applyGainMagicBolts(effectiveState, boltStacks);
    if (result.patch.handCards) patch.handCards = result.patch.handCards;
    if (result.patch.backpackItems) patch.backpackItems = result.patch.backpackItems;
    if (result.patch.permanentMagicRecycleBag) patch.permanentMagicRecycleBag = result.patch.permanentMagicRecycleBag;
    if (result.patch.rng) {
      patch.rng = result.patch.rng;
      rng = result.patch.rng;
    }
    const dist = formatGainMagicBoltsDistribution(result);
    const stackSuffix = boltStacks > 1 ? `（×${boltStacks}）` : '';
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 遗言：获得 ${boltStacks} 张「魔弹」（${dist}）！${stackSuffix}` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！+${boltStacks} 「魔弹」（${dist}）！` } });
  }

  if (slotItem.onDestroyEffect && slotItem.onDestroyEffect !== 'slot-temp-buff-3-3') {
    if (slotItem.onDestroyEffect === 'slot-temp-armor-3') {
      const tempArmor = patch.slotTempArmor ?? { ...(state.slotTempArmor ?? {}) };
      tempArmor[slotId] = (tempArmor[slotId] ?? 0) + 3;
      patch.slotTempArmor = tempArmor;
      applySlotArmorBonusDelta(state, slotId, 3, patch);
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${slotItem.name} 遗言：该装备栏 +3临时护甲！` },
      });
      sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！该装备栏 +3临时护甲！` } });
      checkPersuadeOnTempAttack(state, patch, sideEffects);
    } else if (slotItem.onDestroyEffect === 'spawn-mine-empty') {
      // 殉雷遗盾 — 装备遗言：在 active row 的随机「空位 OR 含 ghost building 的
      // 格子」生成一个「地雷」幽灵建筑。
      //
      // - 地雷复用 createMineBuilding（5 点纯伤、ghost、踩到即触发 + 进坟场）。
      //   受「引雷阵锋」globalMineDamageBonus 加成（在 waterfall 的地雷触发分支处算）。
      // - 选位（uniform pool）：activeCards[i] === null 或 isGhost === true 的格
      //   都可选；二者合并成一个池子均匀随机抽。怪物 / 事件 / 非 ghost 建筑占
      //   用的格不算可用。
      // - 落到 ghost 格时：原 ghost 沉到 activeCardStacks[col] 末尾（next-to-pop
      //   位，跟殒雷符 reducer.ts:303-304 同款 stack-on-top 写法）。
      // - 全无可用位置 → fizzle + banner 提示「无可用位置」。
      // - 跟「墓园守卫」amulet（lastWordsExtraTriggerCount）协同：每次迭代独立
      //   尝试，每次成功生成 1 个；候选池每次重新计算（上一次推下去的 ghost 现在
      //   已不在顶层；上一次新地雷自身仍是 ghost，因此该 cell 仍可被选 + 再堆一层）。
      const baseActive = (patch.activeCards ?? state.activeCards) as ActiveRowSlots;
      const baseStacks = (patch.activeCardStacks ?? state.activeCardStacks) as Record<number, GameCardData[]>;
      const candidateIdxs: number[] = [];
      for (let i = 0; i < baseActive.length; i++) {
        const c = baseActive[i];
        if (c === null || c.isGhost === true) candidateIdxs.push(i);
      }
      if (candidateIdxs.length === 0) {
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：激活行无可用位置，地雷未能放置。` },
        });
        sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言：无可用位置！` } });
      } else {
        const [pickIdxIdx, rngAfterPick] = nextInt(rng, 0, candidateIdxs.length - 1);
        const slotIdx = candidateIdxs[pickIdxIdx];
        const [mine, rngAfterMine] = createMineBuilding(rngAfterPick);
        rng = rngAfterMine;
        const newActive = [...baseActive] as ActiveRowSlots;
        const existing = newActive[slotIdx];
        let stackedNote = '';
        if (existing) {
          // 候选池保证 existing 必为 ghost building；推到 stack 末尾 = next-to-pop。
          const newStacks = { ...baseStacks, [slotIdx]: [...(baseStacks[slotIdx] ?? []), existing] };
          patch.activeCardStacks = newStacks;
          stackedNote = `（堆于 ${existing.name} 上）`;
        }
        newActive[slotIdx] = mine;
        patch.activeCards = newActive as GameState['activeCards'];
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：在第 ${slotIdx + 1} 列布下了地雷！${stackedNote}` },
        });
        sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！布下地雷！` } });
      }
    } else if (slotItem.onDestroyEffect.startsWith('stunCap+')) {
      const amount = parseInt(slotItem.onDestroyEffect.replace('stunCap+', ''), 10) || 0;
      if (amount > 0) {
        const current = patch.stunCap ?? state.stunCap ?? 0;
        const next = Math.min(100, current + amount);
        if (next > current) patch.stunCap = next;
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：击晕上限 +${amount}%（当前 ${next}%）。` },
        });
        sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！击晕上限 +${amount}%！` } });
      }
    } else if (slotItem.onDestroyEffect.startsWith('allSlotTempArmor:')) {
      const amount = parseInt(slotItem.onDestroyEffect.replace('allSlotTempArmor:', ''), 10) || 0;
      if (amount > 0) {
        const tempArmor = patch.slotTempArmor ?? { ...(state.slotTempArmor ?? {}) };
        tempArmor.equipmentSlot1 = (tempArmor.equipmentSlot1 ?? 0) + amount;
        tempArmor.equipmentSlot2 = (tempArmor.equipmentSlot2 ?? 0) + amount;
        patch.slotTempArmor = tempArmor;
        applySlotArmorBonusDelta(state, 'equipmentSlot1', amount, patch);
        applySlotArmorBonusDelta(state, 'equipmentSlot2', amount, patch);
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：所有装备栏 +${amount}临时护甲！` },
        });
        sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言！所有装备栏 +${amount}临时护甲！` } });
        checkPersuadeOnTempAttack(state, patch, sideEffects);
        if (amuletEffects.persuadeOnTempAttackCount > 0) {
          const pBonus = amuletEffects.persuadeOnTempAttackBonus;
          patch.persuadeAmuletBonus = (patch.persuadeAmuletBonus ?? state.persuadeAmuletBonus ?? 0) + pBonus;
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'equip', message: `怀柔之印：下次劝降率 +${pBonus}%` },
          });
        }
      }
    } else if (slotItem.onDestroyEffect === 'graveyard-to-hand') {
      // Iron Shield: 遗言从坟场随机抽 1 张牌进手牌。手牌满时改路由到回收袋
      // （比照 RETURN_EQUIPMENT_TO_HAND 「装备回手（满则回收袋）」约定，
      //  rules/cards.ts:2046-2059）。回收袋路径不 emit `card:newCardGained`
      // —— 跟 DRAW_CLASS_TO_BACKPACK overflow 行为一致（card-gain-missile
      // 弹幕之符 不在「卡进回收袋」时触发）。
      const graveyard = (patch.discardedCards ?? state.discardedCards) as readonly GameCardData[];
      const pick = pickGraveyardCardExcluding(graveyard, slotItem.id, rng);
      if (pick) {
        rng = pick.rng;
        patch.discardedCards = graveyard.filter((_, i) => i !== pick.idx);
        const currentHand = (patch.handCards ?? state.handCards) as readonly GameCardData[];
        const handLimit = getEffectiveHandLimit(state);
        if (currentHand.length < handLimit) {
          patch.handCards = [...currentHand, pick.picked];
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'equip', message: `${slotItem.name} 遗言：从坟场获得了「${pick.picked.name}」！` },
          });
          sideEffects.push({ event: 'equipment:graveyardToHand', payload: { itemName: slotItem.name } });
          sideEffects.push({ event: 'card:newCardGained', payload: { count: 1, source: 'graveyard' } });
        } else {
          enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card: pick.picked });
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'equip', message: `${slotItem.name} 遗言：手牌已满，「${pick.picked.name}」进入回收袋！` },
          });
          sideEffects.push({ event: 'equipment:graveyardToHand', payload: { itemName: slotItem.name } });
        }
      } else {
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：坟场没有可用的牌。` },
        });
      }
    } else if (slotItem.onDestroyEffect === 'graveyard-event-to-hand') {
      // `onDestroyEventCount` 缺省 1（与基础卡 / Iron-Shield-style 单张抽取一致）；
      // 「生长之盾」L2 升级把此值提升为 3，循环抽取至坟场再无 Event 时停。
      // 手牌满时按可用空间逐张分流：先填满手牌，剩余的进入回收袋
      // （比照 graveyard-to-hand 的「手牌满则回收袋」约定）。
      const requested = Math.max(
        1,
        (slotItem as { onDestroyEventCount?: number }).onDestroyEventCount ?? 1,
      );
      const handLimit = getEffectiveHandLimit(state);
      const pickedToHand: GameCardData[] = [];
      const pickedToRecycle: GameCardData[] = [];
      for (let i = 0; i < requested; i++) {
        const graveyardSnapshot =
          (patch.discardedCards ?? state.discardedCards) as readonly GameCardData[];
        const result = pickGraveyardEventCardExcluding(graveyardSnapshot, slotItem.id, rng);
        if (!result) break;
        rng = result.rng;
        patch.discardedCards = graveyardSnapshot.filter((_, idx) => idx !== result.idx);
        const currentHand = (patch.handCards ?? state.handCards) as readonly GameCardData[];
        if (currentHand.length < handLimit) {
          patch.handCards = [...currentHand, result.picked];
          pickedToHand.push(result.picked);
        } else {
          enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card: result.picked });
          pickedToRecycle.push(result.picked);
        }
      }
      const totalPicked = pickedToHand.length + pickedToRecycle.length;
      if (totalPicked > 0) {
        const handNames = pickedToHand.map(c => `「${c.name}」`).join('、');
        const recycleNames = pickedToRecycle.map(c => `「${c.name}」`).join('、');
        let message: string;
        if (pickedToRecycle.length === 0) {
          message =
            pickedToHand.length === 1
              ? `${slotItem.name} 遗言：从坟场抽出 Event ${handNames}！`
              : `${slotItem.name} 遗言：从坟场抽出 ${pickedToHand.length} 张 Event ${handNames}！`;
        } else if (pickedToHand.length === 0) {
          message = `${slotItem.name} 遗言：手牌已满，${pickedToRecycle.length} 张 Event ${recycleNames} 进入回收袋！`;
        } else {
          message = `${slotItem.name} 遗言：${pickedToHand.length} 张 ${handNames} 入手牌，${pickedToRecycle.length} 张 ${recycleNames} 进入回收袋！`;
        }
        sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message } });
        sideEffects.push({ event: 'equipment:graveyardToHand', payload: { itemName: slotItem.name } });
        if (pickedToHand.length > 0) {
          sideEffects.push({ event: 'card:newCardGained', payload: { count: pickedToHand.length, source: 'graveyard' } });
        }
      } else {
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：坟场没有可用的 Event 牌。` },
        });
      }
    } else {
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${slotItem.name} 遗言：${slotItem.onDestroyEffect}` },
      });
    }
  }

  if (isMonsterEquip) {
    if (slotItem.lastWords === 'discard-hand-3') {
      enqueuedActions.push({
        type: 'TRIGGER_MONSTER_SKILL_FLOAT',
        monsterId: slotItem.id,
        skillKey: 'death:lastWords:discardHand',
      });
      drawFromBackpack += 3;
      sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言：抽取 3 张牌！` } });
    }

    if (slotItem.skeletonLastWordsDiscard) {
      enqueuedActions.push({
        type: 'TRIGGER_MONSTER_SKILL_FLOAT',
        monsterId: slotItem.id,
        skillKey: 'death:lastWords:skeleton',
      });
      drawFromBackpack += 1;
      sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 遗言：抽取 1 张牌！` } });
    }

    if (slotItem.lastWords?.startsWith('wraith-haunt')) {
      const hauntAmount = parseInt(slotItem.lastWords.replace('wraith-haunt-', ''), 10) || 2;
      if (otherItem) {
        enqueuedActions.push({
          type: 'TRIGGER_MONSTER_SKILL_FLOAT',
          monsterId: slotItem.id,
          skillKey: 'death:lastWords:wraithHaunt',
        });
        const bonuses = patch.equipmentSlotBonuses
          ? { ...(patch.equipmentSlotBonuses as EquipmentSlotBonusState) }
          : { ...state.equipmentSlotBonuses };
        const ob = { ...bonuses[otherSlotId] };
        ob.damage += hauntAmount;
        bonuses[otherSlotId] = ob;
        patch.equipmentSlotBonuses = bonuses as EquipmentSlotBonusState;
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 遗言：${otherItem.name} 获得临时攻击力 +${hauntAmount}！` },
        });
      }
    }

    if (slotItem.wraithDeathHeal || slotItem.wraithDeathHealSpread) {
      if (otherItem && otherItem.durability != null && otherItem.maxDurability != null) {
        const newDur = Math.min(otherItem.maxDurability, otherItem.durability + 1);
        let updatedOther = { ...otherItem } as EquipmentItem;
        if (newDur > otherItem.durability) {
          updatedOther = { ...updatedOther, durability: newDur };
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'equip', message: `${slotItem.name} 祝福：${otherItem.name} 耐久 +1！` },
          });
        }
        if (slotItem.wraithDeathHealSpread && !otherItem.wraithDeathHeal) {
          updatedOther = { ...updatedOther, wraithDeathHeal: 1 };
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'equip', message: `${slotItem.name} 传魂：${otherItem.name} 获得遗言「祝福」！` },
          });
        }
        patch[otherSlotId] = updatedOther as EquipmentItem;
      }
    }
  }

  return { rng, drawFromBackpack, classCardDraw };
}

// ---------------------------------------------------------------------------
// Equipment displacement — fire "last words" only (no revive, no slot mutation)
//
// Used when equipment A is displaced from a slot by equipment B (slot capacity
// exceeded). Conceptually treated as A being destroyed, so its last-words
// effects fire — but the slot is NOT cleared (B is already there) and revive
// effects are intentionally skipped.
// ---------------------------------------------------------------------------

export interface DisplacementLastWordsResult {
  patch: Partial<GameState>;
  sideEffects: SideEffect[];
  enqueuedActions: GameAction[];
  drawFromBackpack: number;
  classCardDraw: number;
  rng: RngState;
}

/**
 * Compute the "last words" effects for a displaced equipment without applying
 * revive or modifying the source slot.
 *
 * - Triggers: onDestroyHeal/Gold/Draw/ClassDraw/PermanentDamage/PermanentShield/onDestroyEffect,
 *   monster-specific lastWords (wraith-haunt, wraithDeathHeal/Spread, skeletonLastWordsDiscard,
 *   discard-hand-3 draw).
 * - Does NOT: revive, swap slots, clear/promote any slot, or mutate the destroyed
 *   item's own slot (the displacing item B is already there).
 * - The "other slot" effects (wraith-haunt/wraithDeathHeal targeting the opposite
 *   equipment) still apply normally.
 */
export function computeEquipmentDisplacementLastWords(
  state: GameState,
  slotId: EquipmentSlotId,
  slotItem: GameCardData,
  amuletEffects: ActiveAmuletEffects,
  initialPatch: Partial<GameState> = {},
): DisplacementLastWordsResult {
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = { ...initialPatch };
  let rng = (initialPatch.rng ?? state.rng) as RngState;
  let drawFromBackpack = 0;
  let classCardDraw = 0;

  // 「墓园守卫」装备遗言多触发：base 1 次 + amuletEffects.lastWordsExtraTriggerCount 次。
  // 「装备超频」aura active 时 +1（与墓园守卫加法叠加）。
  // 每次迭代都通过 helper 在 patch 上累加（read-then-write `patch.X ?? state.X`），
  // 与 per-trigger amulet effects（绝响之符 / 怀柔之印）一起天然按次叠加。
  const overclockExtra = equipOverclockExtraTriggers(state);
  const totalTriggers = 1 + amuletEffects.lastWordsExtraTriggerCount + overclockExtra;
  for (let iter = 0; iter < totalTriggers; iter += 1) {
    const iterResult = applyOneEquipmentLastWordsIteration(
      state,
      slotId,
      slotItem,
      amuletEffects,
      patch,
      sideEffects,
      enqueuedActions,
      rng,
    );
    rng = iterResult.rng;
    drawFromBackpack += iterResult.drawFromBackpack;
    classCardDraw += iterResult.classCardDraw;
  }
  if (overclockExtra > 0) {
    sideEffects.push({
      event: 'combat:equipOverclockTriggered',
      payload: { surface: 'lastWords', count: overclockExtra },
    });
  }

  patch.rng = rng;

  return { patch, sideEffects, enqueuedActions, drawFromBackpack, classCardDraw, rng };
}


// ---------------------------------------------------------------------------
// Equipment break (durability reaches 0) — "last words" / revive / destroy
// ---------------------------------------------------------------------------

// IMPORTANT: `initialPatch` is required for any caller that has already written
// to `patch.handCards` / `patch.backpackItems` / `patch.permanentMagicRecycleBag` /
// `patch.discardedCards` / `patch.gold` / etc. BEFORE invoking this function in
// the same reduce step. Without it, the local `patch` starts empty and any field
// this function writes (salvage adds to hand, `graveyard-to-hand` last-words adds
// to hand, `lastWordsGainBolt` adds to hand/backpack/recycleBag, `routeBrokenSelfToGraveOrRecycle`
// adds to grave, `onDestroyGold` writes gold, etc.) will OVERWRITE the caller's
// prior writes when `Object.assign(outerPatch, breakResult.patch)` runs.
//
// Concrete bug this used to cause (now fixed): 噬魂猎刃 + 残骸回收符 + 同次攻击
// 武器破，超杀触发 `overkillRecycleToHand` 写了 `patch.handCards` 把 2 张回收
// 袋牌移到手；然后耐久 tick 调本函数，break 内部从空 patch 出发，salvage 写
// `patch.handCards = [...state.handCards, salvaged]`（没看到那 2 张超杀牌），
// 外层 `Object.assign` 覆盖回 `[salvaged]` —— 2 张超杀牌人间蒸发。
// 类似 bug 也存在于 PERFORM_SHIELD_BASH 的 `stunRecycleToHand` + 残骸回收符
// + 盾击同次破 组合。Mirrors `computeEquipmentDisplacementLastWords` which
// already accepts an `initialPatch`.
export function computeEquipmentBreakEffects(
  state: GameState,
  slotId: EquipmentSlotId,
  slotItem: GameCardData,
  amuletEffects: ActiveAmuletEffects,
  initialPatch: Partial<GameState> = {},
): EquipmentBreakResult {
  const isMonsterEquip = slotItem.type === 'monster';
  const otherSlotId = otherSlot(slotId);
  const otherItem = getSlotItem(state, otherSlotId);
  const effects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = { ...initialPatch };
  let rng = (initialPatch.rng ?? state.rng) as RngState;
  let drawFromBackpack = 0;
  let classCardDraw = 0;

  // 「墓园守卫」装备遗言多触发：base 1 次 + amuletEffects.lastWordsExtraTriggerCount 次。
  // 「装备超频」aura active 时 +1（与墓园守卫加法叠加）。
  // 每次迭代通过 helper 在 patch 上累加（read-then-write `patch.X ?? state.X`），
  // 与 per-trigger amulet effects（绝响之符 / 怀柔之印）一起天然按次叠加。
  const overclockExtraBreak = equipOverclockExtraTriggers(state);
  const totalTriggers = 1 + amuletEffects.lastWordsExtraTriggerCount + overclockExtraBreak;
  for (let iter = 0; iter < totalTriggers; iter += 1) {
    const iterResult = applyOneEquipmentLastWordsIteration(
      state,
      slotId,
      slotItem,
      amuletEffects,
      patch,
      effects,
      enqueuedActions,
      rng,
    );
    rng = iterResult.rng;
    drawFromBackpack += iterResult.drawFromBackpack;
    classCardDraw += iterResult.classCardDraw;
  }
  if (overclockExtraBreak > 0) {
    effects.push({
      event: 'combat:equipOverclockTriggered',
      payload: { surface: 'lastWords', count: overclockExtraBreak },
    });
  }

  // After the loop, refresh `otherItem` to reflect any wraithDeathHeal /
  // wraithDeathHealSpread / wraith-haunt mutations the helper applied to
  // patch[otherSlotId]. Downstream destroy/wraith-swap logic uses this updated
  // view so the swapped item carries the durability/buff updates.
  const otherItemAfterLastWords = (patch[otherSlotId] ?? getSlotItem(state, otherSlotId)) as GameCardData | null;
  void otherItemAfterLastWords; // available for downstream extension; not used yet


  // --- Revive check ---
  const nativeReviveAvailable = isMonsterEquip && slotItem.hasRevive && !slotItem.reviveUsed;
  const equipReviveAvailable = slotItem.hasEquipmentRevive && !slotItem.equipmentReviveUsed;
  const canRevive = nativeReviveAvailable || equipReviveAvailable;
  let revived = false;
  let destroyed = false;
  let wraithSwapTarget: EquipmentSlotId | undefined;

  if (canRevive) {
    revived = true;
    const reviveUpdate = nativeReviveAvailable
      ? { ...slotItem, durability: 1, reviveUsed: true }
      : { ...slotItem, durability: 1, equipmentReviveUsed: true };
    patch[slotId] = reviveUpdate as EquipmentItem;
    // Only the native (monster) revive counts as a monster-skill trigger.
    // `hasEquipmentRevive` is an equipment property (永恒铭刻 etc) and not
    // attributed to any monster.
    if (nativeReviveAvailable) {
      enqueuedActions.push({
        type: 'TRIGGER_MONSTER_SKILL_FLOAT',
        monsterId: slotItem.id,
        skillKey: 'death:revive',
      });
    }
    effects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 复生！以 1 耐久复活！` },
    });
    effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 复生了！` } });
  } else {
    destroyed = true;
    effects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 损坏了` },
    });
    effects.push({
      event: 'equipment:destroyed',
      payload: { slotId, cardId: slotItem.id },
    });

    // 引雷阵锋 / 雷震共鸣家族（mineDamageBoostPerDur > 0）：装备破坏时，
    // 把"被消耗的最后剩余耐久"也计入 globalMineDamageBonus。
    // 不在 revive 分支调用 —— revive 不算"耐久消耗"（数值 1 → 1）。
    const finalDurLost = Math.max(0, slotItem.durability ?? 0);
    if (finalDurLost > 0) {
      accumulateMineDamageBoost(state, slotItem, finalDurLost, patch, effects);
    }

    // 残骸回收符 (equipment-salvage amulet): for weapons/shields, return the broken
    // card to hand with maxDurability-N instead of being lost (N = number of
    // equipped salvage amulets — every amulet independently triggers a save,
    // and each save costs one durability point). If maxDur reaches 0 the card
    // is removed from the game entirely.
    //
    // Perm-priority rule: equipment carrying a Perm flag (永恒铭刻 etc.) must
    // route to the recycle bag. Salvage is SKIPPED for Perm equipment so the
    // card is not consumed (and not capable of vanishing via maxDur underflow).
    const isPermRecycle = shouldRouteEquipmentToPermRecycle(slotItem);
    const salvageCount = amuletEffects.equipmentSalvageCount;
    const canSalvage = !isPermRecycle
      && salvageCount > 0
      && (slotItem.type === 'weapon' || slotItem.type === 'shield');

    // Wraith swap (50% chance to move other slot's item to this slot) — monster-only,
    // mutually exclusive with salvage which only applies to weapon/shield.
    let wraithSwapSuccess = false;
    if (isMonsterEquip && slotItem.lastWords?.startsWith('wraith-haunt') && otherItem) {
      [wraithSwapSuccess, rng] = nextBool(rng);
    }

    if (canSalvage) {
      const newMaxDur = (slotItem.maxDurability ?? 1) - salvageCount;
      clearSlotAndPromoteReserve(state, slotId, patch);
      effects.push({ event: 'equipment:clearSlotWithPromote', payload: { slotId } });
      if (newMaxDur <= 0) {
        effects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `残骸回收符：${slotItem.name} 耐久上限归零，从游戏中移除！` },
        });
        effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 耐久上限归零，移除！` } });
      } else {
        const {
          fromSlot: _fs,
          armor: _a,
          reviveUsed: _ru,
          equipmentReviveUsed: _eru,
          wraithRebirthUsed: _wru,
          ...rest
        } = slotItem as GameCardData & Record<string, unknown>;
        const salvaged: GameCardData = { ...(rest as GameCardData), durability: 1, maxDurability: newMaxDur };
        patch.handCards = [...(patch.handCards ?? state.handCards), salvaged];
        effects.push({ event: 'card:equipmentSalvaged', payload: { card: salvaged, slotHint: slotId } });
        effects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `残骸回收符：${slotItem.name} 回到手牌（耐久 1/${newMaxDur}）！` },
        });
        effects.push({ event: 'ui:banner', payload: { text: `残骸回收！${slotItem.name} 回到手牌！` } });
      }
    } else if (wraithSwapSuccess && otherItem) {
      patch[slotId] = { ...otherItem, fromSlot: slotId } as EquipmentItem;
      // The OTHER slot lost its main to the swap — if its reserve has cards,
      // promote the topmost up to fill the now-empty other slot. Without this
      // promote, a reserve under the swapped-away item silently disappeared
      // visually (still in state, but EquipmentSlot.tsx won't render the
      // reserve stack when main is null).
      clearSlotAndPromoteReserve(state, otherSlotId, patch);
      wraithSwapTarget = otherSlotId;
      effects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `幽魂作祟：${otherItem.name} 被移到了${slotLabel(slotId)}装备栏！` },
      });
      effects.push({ event: 'equipment:clearSlotWithPromote', payload: { slotId: otherSlotId } });
      // The destroyed wraith equipment itself still needs to be routed —
      // its slot is now occupied by the swapped-in `otherItem`, but the
      // dying wraith card must enter the graveyard (or recycle bag if Perm)
      // exactly like any other broken equipment, otherwise it silently
      // disappears from the game.
      routeBrokenSelfToGraveOrRecycle(state, slotItem, isPermRecycle, patch, enqueuedActions);
    } else {
      clearSlotAndPromoteReserve(state, slotId, patch);
      effects.push({ event: 'equipment:clearSlotWithPromote', payload: { slotId } });
      // Route the broken equipment to its final destination:
      //   - Perm-flagged (永恒铭刻 / native permEquipment) → permanent magic
      //     recycle bag. MUST take priority — a Perm Iron Shield should come
      //     back via the recycle bag, not the graveyard. ADD_TO_RECYCLE_BAG
      //     handles its own metadata sanitization and durability normalization
      //     (see reduceAddToRecycleBag in cards.ts).
      //   - Otherwise (including graveyard-to-hand last-words case where the
      //     picked card was already moved to hand) → graveyard via
      //     resetCardForGraveyard, so weapons/shields come back at full
      //     durability and monster equipment resets to currentLayer = 1
      //     (per monster-graveyard-layer-reset rule).
      // Per GAME_MECHANICS.md §7: "非永久装备损毁 | 弃置 | 坟场".
      routeBrokenSelfToGraveOrRecycle(state, slotItem, isPermRecycle, patch, enqueuedActions);
    }

    // Skeleton re-revive on other slot
    const otherForReRevive = wraithSwapTarget ? null : getSlotItem(state, otherSlotId);
    if (otherForReRevive && otherForReRevive.type === 'monster' && otherForReRevive.skeletonReRevive
      && (!otherForReRevive.hasRevive || otherForReRevive.reviveUsed)) {
      const reRevivedOther = { ...otherForReRevive, hasRevive: true, reviveUsed: false };
      if (!patch[otherSlotId]) {
        patch[otherSlotId] = reRevivedOther as EquipmentItem;
      }
      effects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${otherForReRevive.name} 轮回：获得了「复生」！` },
      });
      effects.push({ event: 'ui:banner', payload: { text: `${otherForReRevive.name} 轮回！` } });
    }
  }

  // Mirror `computeEquipmentDisplacementLastWords`: thread the final rng back
  // into the returned patch so `Object.assign(outerPatch, breakResult.patch)`
  // picks up any internal rolls (wraith swap, salvage RNG via downstream paths).
  // Callers that read `breakResult.rng` separately keep working.
  patch.rng = rng;

  return { patch, sideEffects: effects, enqueuedActions, drawFromBackpack, classCardDraw, revived, destroyed, wraithSwapTarget, rng };
}

// ---------------------------------------------------------------------------
// Durability loss effects (when item loses durability but survives)
// ---------------------------------------------------------------------------

export function computeDurabilityLossEffects(
  state: GameState,
  slotId: EquipmentSlotId,
  slotItem: GameCardData,
  newDurability: number,
): DurabilityLossResult {
  const isMonsterEquip = slotItem.type === 'monster';
  const otherSlotId = otherSlot(slotId);
  const otherItem = getSlotItem(state, otherSlotId);
  const effects: SideEffect[] = [];
  const patch: Partial<GameState> = {};
  let rng = state.rng;
  let updatedItem = { ...slotItem, durability: newDurability };

  // 永恒护符·装备超频 aura (stackable): bag > 10 时耐久损耗的衍生效果额外触发 N 次
  // （N = count of equip-overclock relics held）。仅复制衍生效果
  // （mine boost / bleed / dragonBleedDestroy / wraith-rebirth / swarm-elite /
  // golemLayerLossReflect），不复制 durability -N 本身。
  const overclockExtra = equipOverclockExtraTriggers(state);
  let overclockFiredHere = false;

  // 「引雷阵锋」类武器：耐久减少 → 累加 globalMineDamageBonus（永久不撤销）。
  // 放在最早处理，确保所有路径（monster equip 走下面的 bleed/dragon/wraith 分支
  // 后 return；非 monster 直接 return）都不会漏触发。
  const prevDur = slotItem.durability ?? newDurability;
  const durLost = Math.max(0, prevDur - newDurability);
  if (durLost > 0) {
    accumulateMineDamageBoost(state, slotItem, durLost, patch, effects);
    if (overclockExtra > 0 && (slotItem.mineDamageBoostPerDur ?? 0) > 0) {
      // 装备超频 ×N：地雷加成再触发 N 次（相当于 durLost ×(1+N) 效果）。
      for (let i = 0; i < overclockExtra; i++) {
        accumulateMineDamageBoost(state, slotItem, durLost, patch, effects);
      }
      overclockFiredHere = true;
    }
  }

  if (!isMonsterEquip) {
    if (overclockFiredHere) {
      effects.push({
        event: 'combat:equipOverclockTriggered',
        payload: { surface: 'durability', count: overclockExtra },
      });
    }
    return { updatedItem, patch, sideEffects: effects, rng };
  }

  // Bleed effect: +3 attack on durability loss
  if (slotItem.bleedEffect) {
    const bleedBonus = 3 * (1 + overclockExtra);
    updatedItem = {
      ...updatedItem,
      attack: (updatedItem.attack ?? updatedItem.value) + bleedBonus,
      value: updatedItem.value + bleedBonus,
      specialAttackBoost: (updatedItem.specialAttackBoost ?? 0) + bleedBonus,
    };
    effects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 流血：攻击力 +${bleedBonus}！（当前 ${updatedItem.attack}）` },
    });
    if (overclockExtra > 0) overclockFiredHere = true;
  }

  // Dragon bleed destroy — destroy other slot if its durability > this item's remaining
  if (slotItem.dragonBleedDestroy && otherItem && (otherItem.durability ?? 0) > newDurability) {
    const card = otherItem as GameCardData;
    const isOtherMonster = card.type === 'monster';
    const nativeRevive = isOtherMonster && card.hasRevive && !card.reviveUsed;
    const equipRevive = card.hasEquipmentRevive && !card.equipmentReviveUsed;
    if (nativeRevive || equipRevive) {
      const revived = nativeRevive
        ? { ...card, durability: 1, reviveUsed: true }
        : { ...card, durability: 1, equipmentReviveUsed: true };
      patch[otherSlotId] = revived as EquipmentItem;
      effects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${slotItem.name} 破甲：「${otherItem.name}」（耐久 ${otherItem.durability} > ${newDurability}）复生了！` },
      });
    } else {
      clearSlotAndPromoteReserve(state, otherSlotId, patch);
      effects.push({ event: 'equipment:clearSlotWithPromote', payload: { slotId: otherSlotId } });
      effects.push({
        event: 'equipment:destroyed',
        payload: { slotId: otherSlotId, cardId: card.id },
      });
      effects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${slotItem.name} 破甲：破坏了「${otherItem.name}」（耐久 ${otherItem.durability} > ${newDurability}）！` },
      });
      // Skeleton re-revive on self when other destroyed
      if (slotItem.skeletonReRevive && (!slotItem.hasRevive || slotItem.reviveUsed)) {
        updatedItem = { ...updatedItem, hasRevive: true, reviveUsed: false };
        effects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 轮回：获得了「复生」！` },
        });
        effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 轮回！` } });
      }
    }
    effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 破甲！高耐久装备被破坏！` } });
  }

  // Wraith rebirth — 50% chance to refill durability when at 1
  if (slotItem.monsterSpecial === 'wraith-rebirth' && newDurability === 1 && !slotItem.wraithRebirthUsed) {
    // First roll: base 50%
    let [rebirthSuccess, nextRng] = nextBool(rng);
    rng = nextRng;
    let rescuedByOverclock = false;
    // 装备超频 ×N：每层在主 roll 失败时再额外摇一次。N 层 → 概率 1 - 0.5^(1+N)。
    if (overclockExtra > 0 && !rebirthSuccess) {
      for (let i = 0; i < overclockExtra && !rebirthSuccess; i++) {
        const [tryAgain, rng3] = nextBool(rng);
        rng = rng3;
        if (tryAgain) {
          rebirthSuccess = true;
          rescuedByOverclock = true;
        }
      }
      if (rescuedByOverclock) overclockFiredHere = true;
    }
    if (rebirthSuccess) {
      const maxDur = slotItem.maxDurability ?? (slotItem.durability ?? 1);
      updatedItem = { ...updatedItem, durability: maxDur, wraithRebirthUsed: true };
      effects.push({
        event: 'log:entry',
        payload: {
          type: 'equip',
          message: `${slotItem.name} 重生：耐久回满！（${maxDur}）${rescuedByOverclock ? ' — 装备超频补救' : ''}`,
        },
      });
      effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 重生！` } });
    } else {
      updatedItem = { ...updatedItem, wraithRebirthUsed: true };
      effects.push({
        event: 'log:entry',
        payload: {
          type: 'equip',
          message: overclockExtra > 0
            ? `${slotItem.name} 重生失败！（装备超频×${overclockExtra} 补救也未触发）`
            : `${slotItem.name} 重生失败！（50%）`,
        },
      });
    }
  }

  // Swarm elite — replace other slot with buglet
  if (slotItem.monsterSpecial === 'swarm-elite' && otherItem) {
    effects.push({
      event: 'equipment:destroyed',
      payload: { slotId: otherSlotId, cardId: otherItem.id },
    });
    const bugletEquip = applyAmplifyOnCreate(createBugletCard(), state.amplifiedCardBonus);
    const bugletAsEquip = { ...bugletEquip, durability: 1, maxDurability: 1 };
    patch[otherSlotId] = bugletAsEquip as EquipmentItem;
    effects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 虫母：${otherItem.name} 被替换为小虫子！` },
    });
    effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 虫母！` } });
  }

  // Golem layer loss reflect — damage random monster
  let golemReflectDamage: DurabilityLossResult['golemReflectDamage'];
  if (slotItem.golemLayerLossReflect && slotItem.golemLayerLossReflect > 0) {
    const maxDur = slotItem.maxDurability ?? (slotItem.durability ?? 1);
    const lostDur = maxDur - newDurability;
    if (lostDur > 0) {
      const baseReflectDmg = slotItem.golemLayerLossReflect * lostDur;
      const reflectDmg = baseReflectDmg * (1 + overclockExtra);
      if (overclockExtra > 0) overclockFiredHere = true;
      const monsterTargets = flattenActiveRowSlots(state.activeCards).filter(
        (c): c is GameCardData => Boolean(c && c.type === 'monster'),
      );
      if (monsterTargets.length > 0) {
        const [target, rng3] = pickRandom(monsterTargets, rng);
        rng = rng3;
        golemReflectDamage = { targetId: target.id, damage: reflectDmg, slotId };
        effects.push({
          event: 'log:entry',
          payload: {
            type: 'equip',
            message: `${slotItem.name} 反震：${slotItem.golemLayerLossReflect}×${lostDur}${overclockExtra > 0 ? `×${1 + overclockExtra}` : ''} = ${reflectDmg} 点伤害，命中 ${target.name}！`,
          },
        });
        effects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 反震！${reflectDmg} 伤害！` } });
      }
    }
  }

  // Monster/shield equipment armor refresh on durability tick (layer break):
  // Each durability point represents one "armor layer". When a layer is consumed
  // (durability ticks down via attacks, weapon strikes, or shield blocks), the
  // next layer must start with a fresh `armor` pool — same trick as
  // `combat.ts` shield-block path. Stripping `armor` here makes the next read
  // default to the current cap (baseArmorMax + perm + temp).
  // Preserve `durability` on the rebuilt item — wraith-rebirth above may have
  // refilled it to maxDurability, so we cannot blindly re-stamp `newDurability`.
  const preservedDurability = updatedItem.durability;
  const { armor: _strippedArmor, ...armorStrippedItem } = updatedItem as GameCardData & {
    armor?: number;
  };
  void _strippedArmor;
  updatedItem = { ...(armorStrippedItem as GameCardData), durability: preservedDurability ?? newDurability };

  if (overclockFiredHere) {
    effects.push({
      event: 'combat:equipOverclockTriggered',
      payload: { surface: 'durability', count: overclockExtra },
    });
  }

  return { updatedItem, patch, sideEffects: effects, golemReflectDamage, rng };
}
