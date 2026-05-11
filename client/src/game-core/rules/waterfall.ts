/**
 * Waterfall Rules — pure game-rule logic extracted from GameBoard.tsx waterfall functions.
 *
 * Contains:
 * - computeWaterfallDropPlan: pure drop-assignment computation (called by reducer post-processing)
 * - reduceApplyWaterfallTurnReset: per-waterfall state resets (from applyWaterfallSideEffects)
 * - reduceApplyWaterfallEffects: eternal relic heals, amulet auras, recycle restore, wraith enrage, hero skill reset
 * - reduceApplyWaterfallDiscardEffects: waterfall discard effect switch (returnToDeck, goldLoss, damage, etc.)
 * - computeReturnToDeckInsertion: helper for returnToDeck discard effect
 */

import type { GameCardData } from '@/components/GameCard';
import { cardHasPermFlag } from '@/components/GameCard';
import type {
  ActiveRowSlots,
  DungeonDropAssignment,
  EquipmentItem,
  EquipmentSlotId,
  SlotPermanentBonus,
  WaterfallDiscardDestination,
} from '@/components/game-board/types';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ReduceResult, SideEffect } from '../reducer';
import { applyPatch, noChange } from '../reducer';
import type { RngState } from '../rng';
import { nextInt } from '../rng';
import { computeEquipmentDisplacementLastWords } from './equipment-effects';
import { applyMonsterRage } from '@/lib/monsterRage';
import {
  DUNGEON_COLUMN_COUNT,
  DUNGEON_COLUMNS,
  BALANCE_ATTACK_BONUS,
  BALANCE_ATTACK_PENALTY,
  BALANCE_SHIELD_BONUS,
  BALANCE_SHIELD_PENALTY,
  createEmptyActiveRow,
} from '../constants';
import {
  countActiveRowSlotsExcludeGhost,
  fillActiveRowSlots,
  flattenActiveRowSlots,
  getEmptyOrGhostColumns,
  getFilledPreviewColumns,
  getWaterfallPreviewDiscardDestination,
  applyAmplifyOnCreate,
} from '../helpers';
import { computeAmuletEffectsForState, applySlotArmorBonusDelta } from '../equipment';
import { maybeTriggerDeleteDrawForDestroy } from '../deleteDrawTrigger';
import { hasEternalRelic } from '@/lib/eternalRelics';
import { processRecycleBag, drawMultipleFromBackpack, pushRecycleRestoreSideEffects, applyMirrorCopySummonProgress } from '../cards';
import { resetHeroWavePure } from '../hero';
import { createBugletCard } from '../deck';

// ---------------------------------------------------------------------------
// Reducer entry point
// ---------------------------------------------------------------------------

export function reduceWaterfallActions(state: GameState, action: GameAction): ReduceResult | null {
  switch (action.type) {
    case 'WATERFALL_TURN_RESET':
      return reduceApplyWaterfallTurnReset(state);
    case 'APPLY_WATERFALL_EFFECTS':
      return reduceApplyWaterfallEffects(state);
    case 'APPLY_WATERFALL_DISCARD_EFFECTS':
      return reduceApplyWaterfallDiscardEffects(state, action);
    case 'APPLY_WATERFALL_DROP':
      return reduceApplyWaterfallDrop(state);
    case 'APPLY_WATERFALL_DEAL':
      return reduceApplyWaterfallDeal(state);
    case 'COMPLETE_WATERFALL':
      return reduceCompleteWaterfall(state);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// computeWaterfallDropPlan — pure drop-assignment computation
// ---------------------------------------------------------------------------

export interface WaterfallDropPlan {
  dropAssignments: DungeonDropAssignment[];
  resolvedDropCards: GameCardData[];
  dropPreviewIndices: number[];
  dropTargetSlots: number[];
  discardCard: GameCardData | null;
  discardPreviewIndex: number | null;
  discardDestination: WaterfallDiscardDestination;
  nextPreviewCards: GameCardData[];
  nextRemainingDeck: GameCardData[];
  newPreviewStacks: Record<number, GameCardData[]>;
  shouldDeclareVictory: boolean;
  stuckFinalMonsters: GameCardData[];
  /**
   * Multiplayer-only: preview cards squeezed out beyond the primary
   * `discardCard` that need to also run their `waterfallEffect` locally
   * AND ship to the peer's deck top via `pendingTransferOut`.
   *
   * Always `[]` (or `undefined`) in single-player. In MP mode the trigger
   * threshold drops to `<= 2` active-row cards (vs. `<= 1` solo), which
   * leaves the preview row with multiple leftover cards after `dropAssignments`
   * — historically only the first leftover (the rightmost non-final-monster)
   * became `discardCard` and the rest were silently dropped. In MP we collect
   * those silently-dropped cards here so the network layer can transfer them.
   *
   * Each entry pairs with `extraDiscardPreviewIndices[i]`; the GameBoard
   * `handleWaterfallDiscardComplete` loop dispatches one
   * `APPLY_WATERFALL_DISCARD_EFFECTS` per entry, in order, after the primary
   * dispatch. Each invocation refreshes `nextRemainingDeck` from the live
   * `pendingWaterfallPlan` so chained mutations (e.g. `returnToDeck` inserting
   * back) compose correctly.
   */
  extraDiscardCards?: GameCardData[];
  extraDiscardPreviewIndices?: number[];
  /**
   * Multiplayer-only: cards that `reduceApplyWaterfallDiscardEffects` has
   * staged to ship to the peer. Accumulates as the discard reducer runs
   * once per discardCard (primary + each extra). The DEAL reducer reads
   * this buffer at the END of the waterfall and writes it atomically
   * alongside `pendingTransferOutPreviewDealt` to `state.pendingTransferOut`.
   *
   * Why this buffer exists:
   *   The hook (`useMultiplayerSync`) watches `state.pendingTransferOut`
   *   and `state.pendingTransferOutPreviewDealt` to decide when to POST a
   *   transfer batch to the server. There's a ~150ms gap between the
   *   discard-phase dispatches (which previously wrote to
   *   `state.pendingTransferOut` directly) and the deal-phase dispatch
   *   (which writes `state.pendingTransferOutPreviewDealt`). Without this
   *   buffer, the hook would observe an intermediate "cards staged but no
   *   previewDealt" state, fire a POST with `previewDealt=[]`, then fire
   *   AGAIN after deal completes — creating duplicate server rows that
   *   prepend the same cards to the peer's deck twice (deck corruption).
   *
   *   By keeping the staged cards on the (pure-state) plan instead of
   *   `state.pendingTransferOut`, the hook only ever sees the final
   *   atomic commit at the end of `reduceApplyWaterfallDeal`. One POST
   *   per waterfall, no duplicates.
   *
   * Single-player: always undefined / never read.
   */
  _shippedCardsBuffer?: GameCardData[];
  rng: RngState;
}

/**
 * Compute the complete waterfall drop plan from current game state.
 *
 * Returns null when no waterfall can proceed (no empty slots, no cards, or
 * cascade not ready). The caller must handle the cascade-retry case separately
 * before calling this function.
 */
export function computeWaterfallDropPlan(
  state: GameState,
  forceCascade: boolean,
): WaterfallDropPlan | null {
  const { activeCards, previewCards, remainingDeck, turnCount, waterfallDealBonus } = state;
  let rng = state.rng;

  const baseEmptyColumns = getEmptyOrGhostColumns(activeCards);

  if (forceCascade && baseEmptyColumns.length !== DUNGEON_COLUMN_COUNT) {
    return null;
  }

  const cascadeFullDrop = forceCascade && baseEmptyColumns.length === DUNGEON_COLUMN_COUNT;
  const emptyColumns = cascadeFullDrop ? DUNGEON_COLUMNS : baseEmptyColumns;

  if (emptyColumns.length === 0) return null;

  const previewIndices = getFilledPreviewColumns(previewCards);
  const filledPreviewCount = previewIndices.length;
  const emptyColumnSet = new Set(emptyColumns);

  let dropAssignments: DungeonDropAssignment[] = [];
  const unusedPreview = new Set(previewIndices);

  if (cascadeFullDrop) {
    dropAssignments = previewIndices
      .map(previewIndex => {
        const card = previewCards[previewIndex];
        return card ? { previewIndex, card, slotIndex: previewIndex } : null;
      })
      .filter((a): a is DungeonDropAssignment => Boolean(a));
    unusedPreview.clear();
  } else {
    for (const previewIndex of previewIndices) {
      if (!emptyColumnSet.has(previewIndex)) continue;
      const card = previewCards[previewIndex];
      if (!card) continue;
      dropAssignments.push({ previewIndex, card, slotIndex: previewIndex });
      unusedPreview.delete(previewIndex);
    }

    // Late game redirect: blocked cards fit into remaining empty active slots
    if (unusedPreview.size > 0 && filledPreviewCount < DUNGEON_COLUMN_COUNT) {
      const usedSlots = new Set(dropAssignments.map(a => a.slotIndex));
      const remainingEmpty = emptyColumns.filter(col => !usedSlots.has(col)).sort((a, b) => a - b);
      if (remainingEmpty.length >= unusedPreview.size) {
        const blockedIndices = Array.from(unusedPreview).sort((a, b) => a - b);
        let emptyIdx = 0;
        for (const previewIndex of blockedIndices) {
          const card = previewCards[previewIndex];
          if (!card) continue;
          dropAssignments.push({ previewIndex, card, slotIndex: remainingEmpty[emptyIdx] });
          unusedPreview.delete(previewIndex);
          emptyIdx++;
        }
      }
    }
  }

  if (dropAssignments.length === 0 && previewIndices.length === 0 && remainingDeck.length === 0) {
    return null;
  }

  const dropPreviewIndices = dropAssignments.map(pair => pair.previewIndex);
  const dropTargetSlots = dropAssignments.map(pair => pair.slotIndex);
  const spawnTurn = turnCount + 1;
  const resolvedDropCards = dropAssignments.map(pair =>
    applyMonsterRage(pair.card, spawnTurn),
  );

  // Discard selection: pick the rightmost blocked preview card that isn't a final monster
  const remainingPreviewOrdered = Array.from(unusedPreview).sort((a, b) => b - a);
  const discardPreviewIndex =
    remainingPreviewOrdered.find(idx => !previewCards[idx]?.isFinalMonster) ?? null;
  const rawDiscardCard =
    discardPreviewIndex !== null ? previewCards[discardPreviewIndex] : null;

  if (discardPreviewIndex !== null) {
    unusedPreview.delete(discardPreviewIndex);
  }

  // Force-drop any blocked final monster into an available slot
  for (const blockedIdx of Array.from(unusedPreview)) {
    const card = previewCards[blockedIdx];
    if (!card?.isFinalMonster) continue;
    const usedSlots = new Set([
      ...dropAssignments.map(a => a.slotIndex),
      ...activeCards.map((c, i) => (c ? i : -1)).filter(i => i >= 0),
    ]);
    for (let slot = 0; slot < DUNGEON_COLUMN_COUNT; slot++) {
      if (!usedSlots.has(slot)) {
        dropAssignments.push({ previewIndex: blockedIdx, card, slotIndex: slot });
        unusedPreview.delete(blockedIdx);
        break;
      }
    }
  }

  // Stuck final monsters that can't enter the row go back to the deck top
  const stuckFinalMonsters: GameCardData[] = [];
  for (const stuckIdx of Array.from(unusedPreview)) {
    const card = previewCards[stuckIdx];
    if (card?.isFinalMonster) {
      stuckFinalMonsters.push(card);
      unusedPreview.delete(stuckIdx);
    }
  }

  // Multiplayer-only: any preview card still in `unusedPreview` after
  // - drop assignment, - rightmost-non-final discardCard pick,
  // - force-drop of final monsters, - stuck-final-monster removal,
  // is a card that would have been silently dropped in single-player but
  // must be shipped to the peer in MP. The loop in GameBoard's
  // `handleWaterfallDiscardComplete` dispatches one APPLY_WATERFALL_DISCARD_EFFECTS
  // per entry so each card's waterfallEffect (damage, gold loss, etc.) fires
  // locally first and the card itself gets staged to `pendingTransferOut`.
  // (See user-confirmed semantic: "本地先触发效果，然后 2 张全部传给对手")
  //
  // Sorted ascending by previewIndex so the transfer order is deterministic
  // (left-to-right) — matters for reproducibility / replay.
  const extraDiscardCards: GameCardData[] = [];
  const extraDiscardPreviewIndices: number[] = [];
  if (state.multiplayerSession !== null && unusedPreview.size > 0) {
    const remaining = Array.from(unusedPreview).sort((a, b) => a - b);
    for (const idx of remaining) {
      const c = previewCards[idx];
      if (!c) continue;
      // Final monsters were already either force-dropped or marked stuck —
      // they should never reach here. Belt-and-suspenders skip in case the
      // logic above changes.
      if (c.isFinalMonster) continue;
      extraDiscardCards.push(c);
      extraDiscardPreviewIndices.push(idx);
    }
  }

  // Build next preview from deck (stuck finals go to deck top first)
  const effectiveDeck = [...stuckFinalMonsters, ...remainingDeck];
  const baseDealCount = Math.min(DUNGEON_COLUMN_COUNT, effectiveDeck.length);
  const nextPreviewCards = effectiveDeck.slice(0, baseDealCount);
  let nextRemainingDeck = effectiveDeck.slice(baseDealCount);

  // Stacking has been removed: every preview slot holds exactly one card.
  // Reserve the structure for downstream payload shape compatibility.
  const newPreviewStacks: Record<number, GameCardData[]> = {};
  void waterfallDealBonus;

  // Runtime guarantee: every freshly dealt preview row must satisfy the
  // monster invariant of 0–1 monsters per 4-card row. Init-time chunk
  // balancing handles this for the static deck, but card-effect deck
  // reordering / stacking-deletion can disturb that invariant — this is the
  // safety net. Rows with 0 monsters are allowed because the init layout
  // intentionally leaves a leftover monster in the back 18 cards.
  {
    const MIN_MONSTERS_PER_ROW = 0;
    const MAX_MONSTERS_PER_ROW = 1;
    const previewMonsterIndices: number[] = [];
    const previewNonMonsterIndices: number[] = [];
    for (let i = 0; i < nextPreviewCards.length; i++) {
      if (nextPreviewCards[i].type === 'monster') previewMonsterIndices.push(i);
      else previewNonMonsterIndices.push(i);
    }
    // Top-up: bring a monster from the remaining deck if preview is monster-empty
    while (previewMonsterIndices.length < MIN_MONSTERS_PER_ROW && previewNonMonsterIndices.length > 0) {
      const monsterDeckIdx = nextRemainingDeck.findIndex(c => c.type === 'monster');
      if (monsterDeckIdx < 0) break;
      const swapPreviewIdx = previewNonMonsterIndices.pop()!;
      const tmp = nextPreviewCards[swapPreviewIdx];
      nextPreviewCards[swapPreviewIdx] = nextRemainingDeck[monsterDeckIdx];
      nextRemainingDeck[monsterDeckIdx] = tmp;
      previewMonsterIndices.push(swapPreviewIdx);
    }
    // Cap: shed excess monsters back into the remaining deck
    while (previewMonsterIndices.length > MAX_MONSTERS_PER_ROW) {
      const nonMonsterDeckIdx = nextRemainingDeck.findIndex(c => c.type !== 'monster');
      if (nonMonsterDeckIdx < 0) break;
      const excessPreviewIdx = previewMonsterIndices.pop()!;
      const tmp = nextPreviewCards[excessPreviewIdx];
      nextPreviewCards[excessPreviewIdx] = nextRemainingDeck[nonMonsterDeckIdx];
      nextRemainingDeck[nonMonsterDeckIdx] = tmp;
    }
  }

  // Victory requires all three sources to be empty (ghost slots don't count as real cards):
  // - active row after drops, - new preview row, and - remaining deck.
  const postDropActive = [...activeCards] as ActiveRowSlots;
  for (const assignment of dropAssignments) {
    postDropActive[assignment.slotIndex] = assignment.card;
  }
  const postDropActiveRealCount = flattenActiveRowSlots(postDropActive).filter(
    c => !c.isGhost,
  ).length;
  const shouldDeclareVictory =
    nextPreviewCards.length === 0 &&
    effectiveDeck.length === 0 &&
    postDropActiveRealCount === 0;

  const planDiscardCard = cascadeFullDrop ? null : rawDiscardCard;
  const planDiscardPreviewIndex = cascadeFullDrop ? null : discardPreviewIndex;
  const discardDestination = getWaterfallPreviewDiscardDestination(planDiscardCard);

  return {
    dropAssignments,
    resolvedDropCards,
    dropPreviewIndices,
    dropTargetSlots,
    discardCard: planDiscardCard,
    discardPreviewIndex: planDiscardPreviewIndex,
    discardDestination,
    nextPreviewCards,
    nextRemainingDeck,
    newPreviewStacks,
    shouldDeclareVictory,
    stuckFinalMonsters,
    extraDiscardCards,
    extraDiscardPreviewIndices,
    rng,
  };
}

// ---------------------------------------------------------------------------
// APPLY_WATERFALL_EFFECTS — eternal relic heals, amulet auras, recycle, wraith enrage, hero reset
// ---------------------------------------------------------------------------

function reduceApplyWaterfallEffects(state: GameState): ReduceResult {
  const patch: Partial<GameState> = {};
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];

  const amuletEffects = computeAmuletEffectsForState(state);

  // Eternal relic: waterfall-heal. Note that the actual amount is multiplied
  // inside `applyHeal` based on `healCount` (compound 2^N rule). The display
  // string mirrors that math so the log tells the player the post-multiplier
  // amount that will actually land.
  if (hasEternalRelic(state.eternalRelics, 'waterfall-heal')) {
    const baseHeal = 4;
    const healMul = Math.pow(2, amuletEffects.healCount);
    const healAmount = baseHeal * healMul;
    const healSuffix = amuletEffects.healCount > 0
      ? `（治疗 ×${healMul}）`
      : '';
    enqueuedActions.push({ type: 'HEAL', amount: baseHeal, source: 'waterfall-heal-relic' });
    sideEffects.push({
      event: 'log:entry',
      payload: {
        type: 'skill',
        message: `永恒护符·潮涌回春：瀑布推进，恢复 ${healAmount} 点生命${healSuffix}`,
      },
    });
  }

  // Starter amulet: 潮愈之符 (`waterfall-heal`). 每件每次瀑流贡献 ⌊回收袋张数/4⌋ 点
  // 治疗（线性 ×N 叠加），合并后传给 `reduceHeal`，再由其内部 `computeHeal` 套
  // 治疗护符 (`heal`) 的 `2^healCount` 复合倍乘。与永恒护符·潮涌回春独立结算。
  //
  // 计算时点：必须在 `processRecycleBag` 之前读 `state.permanentMagicRecycleBag.length`，
  // 否则刚被洗回背包的卡缩水 → 玩家看到「回收袋里 4 张本该 +1，结果 +0」的语义错位。
  // 本块运行在下面 processRecycleBag 调用之前，state 是 input 快照 → 自然就是「洗回前」。
  if (amuletEffects.waterfallHealCount > 0) {
    const recycleBagSize = state.permanentMagicRecycleBag.length;
    const perAmuletHeal = Math.floor(recycleBagSize / 4);
    const baseHeal = perAmuletHeal * amuletEffects.waterfallHealCount;
    if (baseHeal > 0) {
      const healMul = Math.pow(2, amuletEffects.healCount);
      const healAmount = baseHeal * healMul;
      const healSuffix = amuletEffects.healCount > 0
        ? `（治疗 ×${healMul}）`
        : '';
      const stackSuffix = amuletEffects.waterfallHealCount > 1
        ? `（×${amuletEffects.waterfallHealCount}）`
        : '';
      enqueuedActions.push({ type: 'HEAL', amount: baseHeal, source: 'waterfall-heal-amulet' });
      sideEffects.push({
        event: 'log:entry',
        payload: {
          type: 'skill',
          message: `潮愈之符${stackSuffix}：回收袋 ${recycleBagSize} 张，恢复 ${healAmount} 点生命${healSuffix}`,
        },
      });
    }
  }

  // Eternal relic: waterfall-discover
  if (hasEternalRelic(state.eternalRelics, 'waterfall-discover')) {
    sideEffects.push({ event: 'waterfall:discoverPending', payload: {} });
  }

  // Eternal relic: missile-amplify-on-waterfall — amplify all 魔弹 cards by +1 each waterfall
  if (hasEternalRelic(state.eternalRelics, 'missile-amplify-on-waterfall')) {
    enqueuedActions.push({
      type: 'AMPLIFY_CARDS_BY_NAME',
      cardName: '魔弹',
      amount: 1,
      source: '永恒护符·瀑流增幅魔弹',
    });
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'magic', message: '永恒护符·瀑流增幅魔弹：所有「魔弹」永久增幅 +1' },
    });
  }

  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'turn', message: `══ 第 ${state.turnCount + 1} 波 ══` },
  });

  // Amulet aura re-application (strength, balance).
  // Apply directly to the patch (not via enqueuedActions) so the changes are
  // not skipped when the pipeline pauses for `playerInput` phase — see
  // `isInputContinuation` in pipeline.ts.
  if (amuletEffects.strengthCount > 0 || amuletEffects.balanceCount > 0) {
    const tempAttack = { ...state.slotTempAttack };
    const tempArmor = { ...state.slotTempArmor };
    if (amuletEffects.strengthCount > 0) {
      const n = amuletEffects.strengthCount;
      tempAttack.equipmentSlot1 = (tempAttack.equipmentSlot1 ?? 0) + 4 * n;
      tempAttack.equipmentSlot2 = (tempAttack.equipmentSlot2 ?? 0) + 4 * n;
      sideEffects.push({ event: 'log:entry', payload: { type: 'amulet', message: `力量护符（光环）：所有装备栏临时攻击 +${4 * n}` } });
    }
    if (amuletEffects.balanceCount > 0) {
      const n = amuletEffects.balanceCount;
      tempAttack.equipmentSlot1 = (tempAttack.equipmentSlot1 ?? 0) + BALANCE_ATTACK_BONUS * n;
      tempAttack.equipmentSlot2 = (tempAttack.equipmentSlot2 ?? 0) - BALANCE_ATTACK_PENALTY * n;
      tempArmor.equipmentSlot1 = (tempArmor.equipmentSlot1 ?? 0) - BALANCE_SHIELD_PENALTY * n;
      tempArmor.equipmentSlot2 = (tempArmor.equipmentSlot2 ?? 0) + BALANCE_SHIELD_BONUS * n;
      sideEffects.push({ event: 'log:entry', payload: { type: 'amulet', message: `均衡护符（光环）：左栏临时攻击+${BALANCE_ATTACK_BONUS * n}护甲-${BALANCE_SHIELD_PENALTY * n}，右栏临时护甲+${BALANCE_SHIELD_BONUS * n}攻击-${BALANCE_ATTACK_PENALTY * n}` } });
    }
    patch.slotTempAttack = tempAttack;
    patch.slotTempArmor = tempArmor;
    if (amuletEffects.balanceCount > 0) {
      const n = amuletEffects.balanceCount;
      applySlotArmorBonusDelta(state, 'equipmentSlot1', -BALANCE_SHIELD_PENALTY * n, patch);
      applySlotArmorBonusDelta(state, 'equipmentSlot2', BALANCE_SHIELD_BONUS * n, patch);
    }
  }

  // Mark aura as applied for this wave so START_TURN's safety-net re-apply
  // skips (otherwise strength/balance would stack each turn cycle). We always
  // set this — even when no strength/balance amulet is equipped — because
  // after this point slotTempAttack/Armor reflects the canonical aura state
  // for the wave; START_TURN should not touch it.
  patch.amuletAuraAppliedThisWave = true;

  // Lone card amulet: when backpack has exactly 1 item at waterfall time, every
  // equipped 孤注之符 independently triggers — fire N draws.
  if (amuletEffects.loneCardCount > 0 && state.backpackItems.length === 1) {
    const n = amuletEffects.loneCardCount;
    enqueuedActions.push({ type: 'DRAW_CLASS_TO_BACKPACK', count: n, filter: undefined });
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'amulet', message: `孤注之符：背包仅剩 1 张牌，获得 ${n} 张职业卡` },
    });
  }

  // Recycle bag tick: every waterfall decrements `_recycleWaits` for each card in
  // the bag. Ready cards (waits hit 0) return to the backpack; the rest stay in
  // the bag with the decremented counter. Always write the remaining-bag patch —
  // even when nothing is ready to restore — so the decrement is not lost.
  if (state.permanentMagicRecycleBag.length > 0) {
    const recycleResult = processRecycleBag(state);
    // Merge processRecycleBag patch (permanentMagicRecycleBag + backpackItems).
    // 「置顶」(`topOnRecycleRestore`) 卡也走 backpackItems —— 被 prepend 到
    // backpackItems[0]，所以 patch 里的 backpackItems 已经包含置顶卡。不要再
    // 手写 `patch.backpackItems = [...state.backpackItems, ...recycleResult.restored]`，
    // 那样会丢掉「置顶 → 第 1 格」的 prepend 顺序。
    Object.assign(patch, recycleResult.patch);
    if (recycleResult.restored.length > 0) {
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'waterfall', message: `回收袋恢复了 ${recycleResult.restored.length} 张牌到背包` },
      });
      // 通知 UI 播放 Backpack cell 的"绿色回收环"动画 + 「置顶」卡的二段反馈。
      // BackpackZone 通过 useGameEvent('waterfall:recycleRestored', ...) 监听并
      // 触发本地动画状态。
      pushRecycleRestoreSideEffects(sideEffects, recycleResult);
    }
  }

  // Wraith equipment enrage: when equipped wraith has wraithTurnEnrage,
  // engage all non-stunned monsters and grant +1 amulet slot
  let hasWraithEquipEnrage = false;
  for (const wsId of ['equipmentSlot1', 'equipmentSlot2'] as const) {
    const wItem = state[wsId];
    if (wItem && wItem.type === 'monster' && wItem.wraithTurnEnrage) {
      hasWraithEquipEnrage = true;
      break;
    }
  }
  if (hasWraithEquipEnrage) {
    const rowMonsterIds: string[] = [];
    for (const c of state.activeCards) {
      if (c && c.type === 'monster' && !c.isStunned) {
        rowMonsterIds.push(c.id);
        sideEffects.push({
          event: 'combat:autoEngage',
          payload: { monsterId: c.id, monsterName: c.name },
        });
      }
    }
    if (rowMonsterIds.length > 0) {
      // Float a `waterfall:wraithEnrage` skill name above each affected
      // monster — the trigger source is the equipped wraith but it isn't on
      // the active row, so we attribute the float to each enraged monster
      // (matches what the player sees being affected). One float per monster
      // = sequential animation.
      for (const mId of rowMonsterIds) {
        enqueuedActions.push({
          type: 'TRIGGER_MONSTER_SKILL_FLOAT',
          monsterId: mId,
          skillKey: 'waterfall:wraithEnrage',
        });
      }
      sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: '诅咒：瀑流时激活行所有怪物激怒！' } });
      sideEffects.push({ event: 'waterfall:wraithEnrage', payload: { monsterIds: rowMonsterIds } });
    }
    patch.maxAmuletSlots = (state.maxAmuletSlots ?? 3) + 1;
    sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: '诅咒：护符栏上限 +1！' } });
  }

  // Hero skill reset for new wave
  const heroResetPatch = resetHeroWavePure(state);
  Object.assign(patch, heroResetPatch);

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// APPLY_WATERFALL_DISCARD_EFFECTS — the big switch on discardCard.waterfallEffect.type
// ---------------------------------------------------------------------------

function reduceApplyWaterfallDiscardEffects(
  state: GameState,
  action: Extract<GameAction, { type: 'APPLY_WATERFALL_DISCARD_EFFECTS' }>,
): ReduceResult {
  const { discardCard, discardPreviewIndex } = action;
  let { nextRemainingDeck } = action;
  const patch: Partial<GameState> = {};
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  let rng = state.rng;

  const cardName = discardCard.name;

  const logAndBanner = (logType: string, logMsg: string, bannerMsg: string) => {
    sideEffects.push({ event: 'log:entry', payload: { type: logType, message: logMsg } });
    sideEffects.push({ event: 'ui:banner', payload: { text: bannerMsg } });
  };

  // Helper: return final monster (Boss-from-start) to deck instead of graveyard.
  // The chosen final monster is born as a Boss at deck-init time (see
  // `bakeFinalBoss` in `init.ts`), so `isFinalMonster: true` AND
  // `bossPhase: true` co-exist; gate on `isFinalMonster` only.
  const isFinalMonsterPrecursor =
    discardCard.type === 'monster' && discardCard.isFinalMonster;

  // -----------------------------------------------------------------------
  // Multiplayer "portal teleport" short-circuit
  // -----------------------------------------------------------------------
  // In MP mode, the squeezed-out preview card is being TELEPORTED to the
  // peer's deck top via the portal animation rather than locally discarded.
  // Per design (user-confirmed):
  //   "因为是被传送，所以卡牌的'被挤掉'的效果都不触发，因为被传送了"
  //
  // Bypass ALL of:
  //   - waterfallEffect (returnToDeck / swarmInfest / damage / goldLoss /
  //     bonusDecay / turnBoost / boostRowMonsterAttack / destroyAllEquipment /
  //     spellDecay / destroyAllAmuletsAndDiscardHand)
  //   - DISCARD_OWNED_CARD enqueue (the card does NOT enter local
  //     discardedCards → onDiscardDamage / onDiscardDraw / amulet
  //     catapult / discard-zap linkages do NOT fire)
  //   - stacked preview cards at this slot are also teleported (not
  //     discarded), so we ship them too
  //
  // EXCEPTION: Boss precursor (`isFinalMonster: true`) still gets buried
  // at the bottom of local deck — synchronous co-op Boss is out of scope
  // and we don't want both players' Bosses to ping-pong via teleport.
  if (state.multiplayerSession !== null && !isFinalMonsterPrecursor) {
    const stripFields = (c: GameCardData): GameCardData => {
      const { fromSlot: _fs, _recycleWaits: _rw, _excludedFromShared: _ex, ...clean } =
        c as GameCardData & { fromSlot?: unknown };
      void _fs; void _rw; void _ex;
      return clean as GameCardData;
    };
    const teleportBuffer: GameCardData[] = [
      ...(state.pendingWaterfallPlan?._shippedCardsBuffer ?? []),
      stripFields(discardCard),
    ];

    sideEffects.push({
      event: 'log:entry',
      payload: {
        type: 'waterfall',
        message: `传送门吸走「${cardName}」(送往对手牌堆顶 · 被挤掉效果不触发)`,
      },
    });

    if (discardPreviewIndex != null) {
      const stacks = state.previewCardStacks[discardPreviewIndex];
      if (stacks && stacks.length > 0) {
        for (const stackCard of stacks) {
          teleportBuffer.push(stripFields(stackCard));
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'waterfall', message: `传送门一并吸走堆叠：「${stackCard.name}」` },
          });
        }
        enqueuedActions.push({ type: 'REMOVE_PREVIEW_CARD_STACKS', indices: [discardPreviewIndex] });
      }
    }

    if (state.pendingWaterfallPlan) {
      patch.pendingWaterfallPlan = {
        ...state.pendingWaterfallPlan,
        nextRemainingDeck,
        _shippedCardsBuffer: teleportBuffer,
      };
    }

    sideEffects.push({
      event: 'waterfall:discardEffect',
      payload: {
        cardName,
        effectType: 'mp-teleport',
        updatedRemainingDeck: nextRemainingDeck,
      },
    });

    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // Multiplayer helper: any card we insert back into the LOCAL remainingDeck
  // (final-monster bottom-burial / returnToDeck / swarmInfest bug spawns)
  // must be tagged `_excludedFromShared: true` so the next waterfall's
  // shared-consume counter doesn't double-count them as belonging to the
  // shared pool. Single-player passthrough.
  const tagLocalIfMultiplayer = <T extends GameCardData>(c: T): T => {
    if (state.multiplayerSession === null) return c;
    return { ...c, _excludedFromShared: true } as T;
  };

  // Multiplayer-only: cards that take the "graveyard" path (i.e. truly
  // leave the local deck/board, not returnToDeck/swarmInfest variants)
  // should ALSO be queued to ship to the peer's deck top. We append once
  // per discardCard regardless of how many switch branches funnel through
  // sendToGraveyardUnlessFinal, but `routedToTransferOut` guards against
  // double-tap if a future branch accidentally calls the helper twice.
  //
  // IMPORTANT: cards are staged to `plan._shippedCardsBuffer`, NOT to
  // `state.pendingTransferOut`. The DEAL reducer (run ~150ms later by
  // GameBoard's `queueWaterfallTimeout`) reads the buffer and atomically
  // commits it alongside `pendingTransferOutPreviewDealt`. This prevents
  // the hook from observing an intermediate "cards but no previewDealt"
  // state and double-POSTing. See `_shippedCardsBuffer` doc on
  // `WaterfallDropPlan` for the full rationale.
  let routedToTransferOut = false;
  // Local accumulator that mirrors what we'll merge into the plan's
  // `_shippedCardsBuffer` at the end. Starts from whatever the previous
  // discard dispatch left there (since each call to this reducer is one
  // dispatch in a chain — see GameBoard's primary + extras loop).
  let bufferAccum: GameCardData[] = [
    ...(state.pendingWaterfallPlan?._shippedCardsBuffer ?? []),
  ];
  const stageTransferOutIfMultiplayer = () => {
    if (routedToTransferOut) return;
    if (state.multiplayerSession === null) return;
    routedToTransferOut = true;
    // Strip per-instance runtime fields that don't make sense across the
    // network (fromSlot, _recycleWaits, etc.). The peer's reducer will
    // re-tag with `_excludedFromShared: true` on RECEIVE.
    const { fromSlot: _fs, _recycleWaits: _rw, _excludedFromShared: _ex, ...clean } =
      discardCard as GameCardData & { fromSlot?: unknown };
    void _fs; void _rw; void _ex;
    bufferAccum = [...bufferAccum, clean as GameCardData];
  };

  // Handle the card itself going to graveyard or back to deck
  const sendToGraveyardUnlessFinal = () => {
    if (isFinalMonsterPrecursor) {
      sideEffects.push({ event: 'log:entry', payload: { type: 'waterfall', message: `${cardName}（最终之敌）被挤出，置于牌堆底以待决战` } });
      nextRemainingDeck = [...nextRemainingDeck, tagLocalIfMultiplayer(discardCard)];
      sideEffects.push({ event: 'ui:banner', payload: { text: `${cardName} 隐入牌堆……终局之战尚未到来。` } });
    } else {
      enqueuedActions.push({ type: 'DISCARD_OWNED_CARD', card: discardCard, owner: 'dungeon' });
      // In multiplayer, this card also gets shipped to the peer's deck top.
      // (single-player: no-op.)
      stageTransferOutIfMultiplayer();
    }
  };

  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'waterfall', message: `瀑流挤掉：「${cardName}」（预览第 ${discardPreviewIndex != null ? String(discardPreviewIndex + 1) : '?'} 列 · ${discardCard.type}）` },
  });

  const wfx = discardCard.waterfallEffect;
  if (wfx && (discardCard.type === 'monster' || discardCard.type === 'event')) {
    switch (wfx.type) {
      case 'returnToDeck': {
        const isWraith = discardCard.type === 'monster' && discardCard.monsterType === 'Wraith';
        const insertion = computeReturnToDeckInsertion(nextRemainingDeck.length, isWraith, rng);
        rng = insertion.rng;
        nextRemainingDeck = [...nextRemainingDeck];
        nextRemainingDeck.splice(insertion.insertIndex, 0, tagLocalIfMultiplayer(discardCard));
        if (isWraith) {
          logAndBanner('waterfall', `${cardName} 化为幽影，随机回到剩余牌堆某处`, `${cardName} 化为幽影，消散在牌堆深处……`);
        } else {
          logAndBanner('waterfall', `${cardName} 化为幽影，置于牌堆底`, `${cardName} 化为幽影，置于牌堆底。`);
        }
        break;
      }
      case 'bonusDecay': {
        (['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]).forEach(slotId => {
          const bonuses = state.equipmentSlotBonuses[slotId];
          const newBonuses: SlotPermanentBonus = {
            damage: bonuses.damage - wfx.amount,
            shield: bonuses.shield - wfx.amount,
          };
          if (!patch.equipmentSlotBonuses) {
            patch.equipmentSlotBonuses = { ...state.equipmentSlotBonuses };
          }
          (patch.equipmentSlotBonuses as Record<EquipmentSlotId, SlotPermanentBonus>)[slotId] = newBonuses;
          applySlotArmorBonusDelta(state, slotId, -wfx.amount, patch);
        });
        patch.permanentSpellLifesteal = (state.permanentSpellLifesteal ?? 0) - wfx.amount;
        logAndBanner('waterfall', `${cardName} 诅咒削弱装备伤害/护甲与超杀吸血 -${wfx.amount}`, `${cardName} 的诅咒削弱了你的装备与超杀吸血！`);
        sendToGraveyardUnlessFinal();
        break;
      }
      case 'goldLoss': {
        patch.gold = Math.max(0, state.gold - wfx.amount);
        logAndBanner('waterfall', `${cardName} 偷走 ${wfx.amount} 金币`, `${cardName} 逃跑时偷走了 ${wfx.amount} 金币！`);
        sendToGraveyardUnlessFinal();
        break;
      }
      case 'damage': {
        enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: wfx.amount, source: 'waterfall-discard-damage' });
        logAndBanner('waterfall', `${cardName} 临死反扑，造成 ${wfx.amount} 点伤害`, `${cardName} 临死反扑，造成 ${wfx.amount} 点伤害！`);
        sendToGraveyardUnlessFinal();
        break;
      }
      case 'turnBoost': {
        patch.turnCount = state.turnCount + wfx.amount;
        // Reset temp attack/armor (zeroed, then amulet auras re-applied directly
        // in the patch — not via enqueuedActions — so the re-application is not
        // skipped when the pipeline pauses for `playerInput` phase.
        const tempAttack: Record<EquipmentSlotId, number> = { equipmentSlot1: 0, equipmentSlot2: 0 };
        const tempArmor: Record<EquipmentSlotId, number> = { equipmentSlot1: 0, equipmentSlot2: 0 };

        const amuletEffects = computeAmuletEffectsForState(state);
        if (amuletEffects.strengthCount > 0) {
          const sn = amuletEffects.strengthCount;
          tempAttack.equipmentSlot1 += 4 * sn;
          tempAttack.equipmentSlot2 += 4 * sn;
        }
        if (amuletEffects.balanceCount > 0) {
          const bn = amuletEffects.balanceCount;
          tempAttack.equipmentSlot1 += BALANCE_ATTACK_BONUS * bn;
          tempAttack.equipmentSlot2 -= BALANCE_ATTACK_PENALTY * bn;
          tempArmor.equipmentSlot1 -= BALANCE_SHIELD_PENALTY * bn;
          tempArmor.equipmentSlot2 += BALANCE_SHIELD_BONUS * bn;
        }
        const oldTempArmor = state.slotTempArmor ?? { equipmentSlot1: 0, equipmentSlot2: 0 };
        patch.slotTempAttack = tempAttack;
        patch.slotTempArmor = tempArmor;
        applySlotArmorBonusDelta(state, 'equipmentSlot1', tempArmor.equipmentSlot1 - (oldTempArmor.equipmentSlot1 ?? 0), patch);
        applySlotArmorBonusDelta(state, 'equipmentSlot2', tempArmor.equipmentSlot2 - (oldTempArmor.equipmentSlot2 ?? 0), patch);
        // turnBoost performs the same reset+reapply that
        // WATERFALL_TURN_RESET + APPLY_WATERFALL_EFFECTS do, so flag stays
        // true (aura is in temps) — START_TURN must not double-apply.
        patch.amuletAuraAppliedThisWave = true;

        // Clear monster temp boosts from active row
        const newActive = state.activeCards.map(c => {
          if (!c || c.type !== 'monster') return c;
          const tAtk = c.tempAttackBoost ?? 0;
          const tHp = c.tempHpBoost ?? 0;
          if (tAtk === 0 && tHp === 0) return c;
          return {
            ...c,
            attack: Math.max(1, (c.attack ?? c.value ?? 0) - tAtk),
            value: Math.max(1, (c.value ?? 0) - tAtk),
            maxHp: Math.max(1, (c.maxHp ?? 0) - tHp),
            hp: Math.min(c.hp ?? 0, Math.max(1, (c.maxHp ?? 0) - tHp)),
            specialAttackBoost: Math.max(0, (c.specialAttackBoost ?? 0) - tAtk),
            tempAttackBoost: 0,
            tempHpBoost: 0,
          };
        }) as ActiveRowSlots;
        patch.activeCards = newActive;

        patch.discardedCards = state.discardedCards.map(c => {
          if (c.type !== 'monster' || ((c.tempAttackBoost ?? 0) === 0 && (c.tempHpBoost ?? 0) === 0)) return c;
          return { ...c, tempAttackBoost: 0, tempHpBoost: 0 };
        });

        logAndBanner('waterfall', `${cardName} 龙息加速 waterfall +${wfx.amount}`, `${cardName} 的龙息加速了 waterfall 进程 +${wfx.amount}！`);
        sendToGraveyardUnlessFinal();
        break;
      }
      case 'boostRowMonsterAttack': {
        const boost = wfx.amount;
        const boosted: string[] = [];
        const newActiveForBoost = state.activeCards.map(card => {
          if (card?.type === 'monster') {
            boosted.push(card.name);
            return {
              ...card,
              attack: (card.attack ?? card.value ?? 0) + boost,
              value: (card.value ?? 0) + boost,
              tempAttackBoost: (card.tempAttackBoost ?? 0) + boost,
            };
          }
          return card;
        }) as ActiveRowSlots;
        patch.activeCards = newActiveForBoost;

        if (boosted.length > 0) {
          logAndBanner('waterfall', `${cardName} 被挤出，所有怪物攻击 +${boost}：${boosted.join('、')}`, `${cardName} 的血咒强化了所有怪物！攻击 +${boost}！`);
        } else {
          sideEffects.push({ event: 'log:entry', payload: { type: 'waterfall', message: `${cardName} 被挤出，但没有怪物可强化。` } });
        }
        sendToGraveyardUnlessFinal();
        break;
      }
      case 'destroyAllEquipment': {
        // 贪婪 boss 瀑流摧毁所有装备 —— 走 canonical 的
        // computeEquipmentDisplacementLastWords helper（同 reduceDisposeEquipmentCard /
        // reduceSacrificeEquipmentSlot）。覆盖全部 onDestroyEffect 变体
        // （spawn-mine-empty 殉雷遗盾 / slot-temp-armor-3 / graveyard-event-to-hand /
        // lastWordsSlotTempBuff / lastWordsMaxHpBoost / lastWordsGainBolt 等多层叠加）
        // + 怪物 lastWords + 「墓园守卫」多次触发 + 「绝响之符」per-trigger debuff
        // + 「装备超频」额外触发 + 「怀柔之印」persuade boost。
        //
        // 替代了已删除的残缺手写 applyEquipDestroyLastWords（仅支持 9 个分支，
        // 其它都 fizzle 到 log entry，参见 shared-effect-id-impact-check 规则）。
        const destroyed: string[] = [];
        const destroyedCards: GameCardData[] = [];
        const revived: string[] = [];

        const amuletFxForDestroy = computeAmuletEffectsForState(state);

        const fireLastWords = (card: GameCardData, slotId: EquipmentSlotId): void => {
          const lwResult = computeEquipmentDisplacementLastWords(state, slotId, card, amuletFxForDestroy, patch);
          // computeEquipmentDisplacementLastWords 返回 patch.rng 等累积写入；
          // 直接合并到当前 patch（已经在 enclosing reducer 里逐字段拼装）。
          Object.assign(patch, lwResult.patch);
          sideEffects.push(...lwResult.sideEffects);
          enqueuedActions.push(...lwResult.enqueuedActions);
          if (lwResult.drawFromBackpack > 0) {
            enqueuedActions.push({ type: 'DRAW_CARDS', count: lwResult.drawFromBackpack, source: 'backpack' });
          }
          if (lwResult.classCardDraw > 0) {
            enqueuedActions.push({ type: 'DRAW_CLASS_TO_BACKPACK', count: lwResult.classCardDraw });
          }
        };

        for (const slotId of ['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]) {
          const slotItem = state[slotId];
          if (slotItem) {
            const card = slotItem as GameCardData;
            fireLastWords(card, slotId);

            const isMonsterEquip = card.type === 'monster';
            const nativeRevive = isMonsterEquip && card.hasRevive && !card.reviveUsed;
            const equipRevive = card.hasEquipmentRevive && !card.equipmentReviveUsed;

            if (nativeRevive || equipRevive) {
              const revivedItem = nativeRevive
                ? { ...card, durability: 1, reviveUsed: true }
                : { ...card, durability: 1, equipmentReviveUsed: true };
              patch[slotId] = revivedItem as typeof slotItem;
              sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 复生！以 1 耐久复活！` } });
              revived.push(card.name);
            } else {
              destroyed.push(slotItem.name);
              destroyedCards.push(card);
              enqueuedActions.push({ type: 'DISPOSE_EQUIPMENT_CARD', card: { ...slotItem } as GameCardData, isDestruction: true });
              patch[slotId] = null;
            }
          }

          // Process reserves
          const reserveKey = slotId === 'equipmentSlot1' ? 'equipmentSlot1Reserve' : 'equipmentSlot2Reserve';
          const reserve = state[reserveKey] as GameCardData[];
          if (reserve && reserve.length > 0) {
            const survivedReserve: GameCardData[] = [];
            for (const r of reserve) {
              fireLastWords(r, slotId);
              const isMonsterR = r.type === 'monster';
              const nativeR = isMonsterR && r.hasRevive && !r.reviveUsed;
              const equipR = r.hasEquipmentRevive && !r.equipmentReviveUsed;
              if (nativeR || equipR) {
                const revivedR = nativeR
                  ? { ...r, durability: 1, reviveUsed: true }
                  : { ...r, durability: 1, equipmentReviveUsed: true };
                survivedReserve.push(revivedR);
                sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${r.name} 复生！以 1 耐久复活！` } });
                revived.push(r.name);
              } else {
                destroyed.push(r.name);
                destroyedCards.push(r);
                enqueuedActions.push({ type: 'DISPOSE_EQUIPMENT_CARD', card: { ...r }, isDestruction: true });
              }
            }
            patch[reserveKey] = survivedReserve as EquipmentItem[];
          }
        }

        if (destroyed.length > 0) {
          logAndBanner(
            'waterfall',
            `${cardName} 被挤出，破坏了所有装备：${destroyed.join('、')}${revived.length > 0 ? `（${revived.join('、')} 复生）` : ''}`,
            `${cardName} 的贪婪吞噬了你的所有装备！`,
          );
          // 招灵书印：贪婪 boss 瀑流摧毁所有装备 = 强制销毁。
          // 装备销毁不影响护符栏 → surviving = state.amuletSlots。
          maybeTriggerDeleteDrawForDestroy({
            destroyedCards,
            survivingAmuletSlots: state.amuletSlots as GameCardData[],
            sideEffects,
            enqueuedActions,
            reasonLabel: '瀑流摧毁装备',
          });
        } else {
          sideEffects.push({ event: 'log:entry', payload: { type: 'waterfall', message: `${cardName} 被挤出，但没有装备可破坏。` } });
        }
        sendToGraveyardUnlessFinal();
        break;
      }
      case 'swarmInfest': {
        const bugCount = wfx.amount;
        const bugs: GameCardData[] = [];
        for (let bi = 0; bi < bugCount; bi++) {
          bugs.push(tagLocalIfMultiplayer(applyAmplifyOnCreate(createBugletCard(), state.amplifiedCardBonus)));
        }
        nextRemainingDeck = [...bugs, ...nextRemainingDeck];
        logAndBanner('waterfall', `${cardName} 被挤出，${bugCount} 只小虫子涌入了牌堆顶！`, `${cardName} 被挤出！${bugCount} 只小虫子混入了牌堆！`);
        sendToGraveyardUnlessFinal();
        break;
      }
      case 'spellDecay': {
        const decayAmount = wfx.amount;
        patch.permanentSpellDamageBonus = (state.permanentSpellDamageBonus ?? 0) - decayAmount;
        logAndBanner('waterfall', `${cardName} 被挤出，永久法术伤害加成 -${decayAmount}`, `${cardName} 的反魔结界削弱了你的法术伤害！-${decayAmount}`);
        sendToGraveyardUnlessFinal();
        break;
      }
      case 'destroyAllAmuletsAndDiscardHand': {
        const removedAmulets = [...state.amuletSlots] as GameCardData[];
        if (removedAmulets.length > 0) {
          // Perm 护符（永恒铭刻 / native permEquipment / 凡化咒未剥离）→ 回收袋；
          // 普通护符 → 坟场。镜像 events.ts:removeAllAmulets 的契约，避免 Perm 护符
          // 因摧毁路径不同被错误送进坟场。
          for (const a of removedAmulets) {
            if (cardHasPermFlag(a)) {
              enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card: a });
            } else {
              enqueuedActions.push({ type: 'ADD_TO_GRAVEYARD', card: a });
            }
          }
          patch.amuletSlots = [];
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'waterfall', message: `${cardName} 被挤出，摧毁了 ${removedAmulets.length} 枚护符：${removedAmulets.map(a => a.name).join('、')}` },
          });
          // 招灵书印：诅咒骰局 强制销毁所有护符。所有护符清空 → surviving=0
          // → 通常不触发，但保留入口一致性。
          maybeTriggerDeleteDrawForDestroy({
            destroyedCards: removedAmulets,
            survivingAmuletSlots: patch.amuletSlots ?? [],
            sideEffects,
            enqueuedActions,
            reasonLabel: '幽魂瀑流摧毁护符',
          });
        }
        const handSnapshot = [...state.handCards] as GameCardData[];
        if (handSnapshot.length > 0) {
          enqueuedActions.push({ type: 'DISCARD_ALL_HAND' });
          sideEffects.push({ event: 'log:entry', payload: { type: 'waterfall', message: `${cardName} 被挤出，弃回了 ${handSnapshot.length} 张手牌` } });
        }
        if (removedAmulets.length > 0 || handSnapshot.length > 0) {
          sideEffects.push({ event: 'ui:banner', payload: { text: `${cardName} 被挤出：摧毁了所有护符，弃回了全部手牌！` } });
        } else {
          sideEffects.push({ event: 'log:entry', payload: { type: 'waterfall', message: `${cardName} 被挤出，但没有护符和手牌。` } });
        }
        sendToGraveyardUnlessFinal();
        break;
      }
      default:
        if (isFinalMonsterPrecursor) {
          sideEffects.push({ event: 'log:entry', payload: { type: 'waterfall', message: `${cardName}（最终之敌）被挤出，置于牌堆底以待决战` } });
          nextRemainingDeck = [...nextRemainingDeck, tagLocalIfMultiplayer(discardCard)];
          sideEffects.push({ event: 'ui:banner', payload: { text: `${cardName} 隐入牌堆……终局之战尚未到来。` } });
        } else {
          enqueuedActions.push({ type: 'DISCARD_OWNED_CARD', card: discardCard, owner: 'dungeon' });
          stageTransferOutIfMultiplayer();
        }
        break;
    }
  } else {
    // No waterfall effect — just discard or return final monster
    if (isFinalMonsterPrecursor) {
      sideEffects.push({ event: 'log:entry', payload: { type: 'waterfall', message: `${cardName}（最终之敌）被挤出，置于牌堆底以待决战` } });
      nextRemainingDeck = [...nextRemainingDeck, tagLocalIfMultiplayer(discardCard)];
      sideEffects.push({ event: 'ui:banner', payload: { text: `${cardName} 隐入牌堆……终局之战尚未到来。` } });
    } else {
      enqueuedActions.push({ type: 'DISCARD_OWNED_CARD', card: discardCard, owner: 'dungeon' });
      stageTransferOutIfMultiplayer();
    }
  }

  // Also discard stacked cards on the discarded preview slot
  if (discardPreviewIndex != null) {
    const discardedStacks = state.previewCardStacks[discardPreviewIndex];
    if (discardedStacks && discardedStacks.length > 0) {
      for (const stackCard of discardedStacks) {
        enqueuedActions.push({ type: 'DISCARD_OWNED_CARD', card: stackCard, owner: 'dungeon' });
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'waterfall', message: `瀑流挤掉堆叠：「${stackCard.name}」一并被挤出` },
        });
      }
      enqueuedActions.push({ type: 'REMOVE_PREVIEW_CARD_STACKS', indices: [discardPreviewIndex] });
    }
  }

  // Update RNG if it changed (returnToDeck for wraith)
  if (rng !== state.rng) {
    patch.rng = rng;
  }

  // Sync the updated remaining deck AND the multiplayer ship buffer back
  // into the pending plan so APPLY_WATERFALL_DEAL uses both the version
  // that includes returnToDeck / swarmInfest modifications AND any cards
  // staged for the peer this iteration. The buffer accumulates across
  // chained discard dispatches (primary + extras); deal commits it
  // atomically with previewDealt at the end.
  if (state.pendingWaterfallPlan) {
    patch.pendingWaterfallPlan = {
      ...state.pendingWaterfallPlan,
      nextRemainingDeck,
      _shippedCardsBuffer: bufferAccum,
    };
  }

  // Emit side effect with the updated remaining deck (legacy listeners)
  sideEffects.push({
    event: 'waterfall:discardEffect',
    payload: {
      cardName,
      effectType: wfx?.type ?? 'none',
      updatedRemainingDeck: nextRemainingDeck,
    },
  });

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// reduceApplyWaterfallTurnReset — per-waterfall pure state resets
// ---------------------------------------------------------------------------

function reduceApplyWaterfallTurnReset(state: GameState): ReduceResult {
  const patch: Partial<GameState> = {};
  const sideEffects: SideEffect[] = [];

  patch.turnCount = state.turnCount + 1;
  patch.magicCardsPlayedThisTurn = 0;
  patch.arcaneStormMagicCount = 0;

  // Reset temp attack/armor (zeroed before amulet auras re-apply in GameBoard)
  if (state.slotTempArmor.equipmentSlot1 !== 0 || state.slotTempArmor.equipmentSlot2 !== 0) {
    sideEffects.push({ event: 'log:entry', payload: { type: 'magic', message: '瀑流重置，所有临时护甲归零' } });
  }
  if (state.slotTempAttack.equipmentSlot1 !== 0 || state.slotTempAttack.equipmentSlot2 !== 0) {
    sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: '瀑流重置：所有临时攻击力归零' } });
  }
  patch.slotTempAttack = { equipmentSlot1: 0, equipmentSlot2: 0 };
  patch.slotTempArmor = { equipmentSlot1: 0, equipmentSlot2: 0 };
  // Temp slots zeroed → amulet aura no longer present. Cleared here so that
  // APPLY_WATERFALL_EFFECTS (next in the waterfall pipeline) can re-stamp
  // the aura and flip the flag back to true.
  patch.amuletAuraAppliedThisWave = false;

  // Single-counter armor model: when slotTempArmor expires, the cap drops by
  // exactly the temp amount (newCap = baseArmorMax + perm). Clamp the live
  // `armor` value down to the new cap if it exceeds it; armor never grows on
  // temp expiry.
  //
  // Examples (base=5, perm=4, temp=4 → oldCap=13, newCap=9):
  //   armor=13 (full)  → clamp to 9
  //   armor=10         → clamp to 9
  //   armor=6          → unchanged (under new cap)
  //   armor=undefined  → unchanged (next read defaults to newCap automatically)
  for (const slotId of ['equipmentSlot1', 'equipmentSlot2'] as const) {
    const item = state[slotId];
    if (!item) continue;
    if (item.type !== 'shield' && item.type !== 'monster') continue;
    const tempBeingLost = state.slotTempArmor[slotId] ?? 0;
    if (tempBeingLost === 0) continue;
    if (item.armor === undefined) continue; // at-cap; next read picks up newCap
    const baseArmorMax = item.type === 'monster'
      ? (item.hp ?? item.value ?? 0)
      : (item.armorMax ?? item.value ?? 0);
    const permBonus = state.equipmentSlotBonuses[slotId]?.shield ?? 0;
    const newCap = Math.max(0, baseArmorMax + permBonus);
    if (item.armor <= newCap) continue;
    patch[slotId] = { ...item, armor: newCap } as typeof state.equipmentSlot1;
  }

  // Clear monster temp boosts from active row
  const clearedNames: string[] = [];
  const newActive = state.activeCards.map(c => {
    if (!c || c.type !== 'monster') return c;
    const tAtk = c.tempAttackBoost ?? 0;
    const tHp = c.tempHpBoost ?? 0;
    if (tAtk === 0 && tHp === 0) return c;
    clearedNames.push(c.name);
    return {
      ...c,
      attack: Math.max(1, (c.attack ?? c.value ?? 0) - tAtk),
      value: Math.max(1, (c.value ?? 0) - tAtk),
      maxHp: Math.max(1, (c.maxHp ?? 0) - tHp),
      hp: Math.min(c.hp ?? 0, Math.max(1, (c.maxHp ?? 0) - tHp)),
      specialAttackBoost: Math.max(0, (c.specialAttackBoost ?? 0) - tAtk),
      tempAttackBoost: 0,
      tempHpBoost: 0,
    };
  }) as ActiveRowSlots;
  patch.activeCards = newActive;
  if (clearedNames.length > 0) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'waterfall', message: `瀑流重置：${clearedNames.join('、')} 的临时增益消散了` },
    });
  }

  // Clear temp boosts from graveyard monsters
  patch.discardedCards = state.discardedCards.map(c => {
    if (c.type !== 'monster' || ((c.tempAttackBoost ?? 0) === 0 && (c.tempHpBoost ?? 0) === 0)) return c;
    return { ...c, tempAttackBoost: 0, tempHpBoost: 0 };
  });

  // Clear 翻覆震慑 buff at every waterfall (option 4 — buff is "until next waterfall")
  if (state.flipDebuffMonsterId) {
    patch.flipDebuffMonsterId = null;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'event', message: '翻覆震慑：瀑流后效果消散' },
    });
  }

  // Equipment waterfall attack boosts
  for (const slotId of ['equipmentSlot1', 'equipmentSlot2'] as const) {
    const item = state[slotId];
    if (item?.waterfallAttackBoost) {
      const newValue = (item.value ?? 0) + item.waterfallAttackBoost;
      patch[slotId] = { ...item, value: newValue } as typeof item;
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${item.name} 瀑流强化：攻击力 +${item.waterfallAttackBoost}（${newValue}）` },
      });
    }
  }

  // Equipment waterfall temp armor grants
  for (const slotId of ['equipmentSlot1', 'equipmentSlot2'] as const) {
    const item = state[slotId];
    if (item?.waterfallTempArmor) {
      const fallback: GameState['slotTempArmor'] = state.slotTempArmor ?? { equipmentSlot1: 0, equipmentSlot2: 0 };
      const baseTempArmor: GameState['slotTempArmor'] = { ...(patch.slotTempArmor ?? fallback) };
      baseTempArmor[slotId] = (baseTempArmor[slotId] ?? 0) + item.waterfallTempArmor;
      patch.slotTempArmor = baseTempArmor;
      applySlotArmorBonusDelta(state, slotId, item.waterfallTempArmor, patch);
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${item.name} 瀑流强化：该装备栏临时护甲 +${item.waterfallTempArmor}` },
      });
    }
  }

  // Golem spell growth
  for (const slotId of ['equipmentSlot1', 'equipmentSlot2'] as const) {
    const item = (patch[slotId] ?? state[slotId]) as GameState['equipmentSlot1'];
    if (item && item.type === 'monster' && item.golemSpellGrowth && item.golemSpellGrowth > 0 && item.golemLayerLossReflect) {
      const newCoeff = item.golemLayerLossReflect + item.golemSpellGrowth;
      patch[slotId] = { ...item, golemLayerLossReflect: newCoeff } as typeof item;
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${item.name} 吞噬：瀑流强化，反震系数 +${item.golemSpellGrowth}（当前 ${newCoeff}）` },
      });
    }
  }

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// computeReturnToDeckInsertion — helper for returnToDeck waterfall discard
// ---------------------------------------------------------------------------

/**
 * Compute the insertion position when a card returns to the deck via waterfall discard.
 * Wraiths insert at a random position; other cards go to the bottom.
 */
export function computeReturnToDeckInsertion(
  deckLength: number,
  isWraith: boolean,
  rng: RngState,
): { insertIndex: number; rng: RngState } {
  if (isWraith) {
    const [insertIdx, rng2] = nextInt(rng, 0, deckLength);
    return { insertIndex: insertIdx, rng: rng2 };
  }
  return { insertIndex: deckLength, rng };
}

// ---------------------------------------------------------------------------
// APPLY_WATERFALL_DROP — move preview cards to active row per pendingWaterfallPlan
// ---------------------------------------------------------------------------

function reduceApplyWaterfallDrop(state: GameState): ReduceResult {
  const plan = state.pendingWaterfallPlan;
  if (!plan) return noChange(state);

  const patch: Partial<GameState> = {};
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];

  if (plan.dropTargetSlots.length > 0) {
    const newActive = [...state.activeCards] as ActiveRowSlots;
    const ghostsDisplaced: Array<{ slotIndex: number; ghost: GameCardData }> = [];
    // 「布雷术」/「殉雷遗盾」/「殒雷符」地雷触发：当怪物落到带 mineDamage 的
    // ghost building 上时，不走普通的 ghost-stack-bottom 路径，而是
    // (a) 对落下的怪物造成纯陷阱伤害，
    // (b) 让怪物激怒，
    // (c) 把地雷送进坟场（不塞回 activeCardStacks）。
    //
    // **同 cell 堆叠地雷连环引爆**（user-confirmed 语义）：当怪物落到的 cell
    // 同时存在多枚地雷（顶层 + activeCardStacks 任意位置），所有地雷依次爆炸、
    // 依次结算伤害，全部进坟场。Non-mine ghost / 普通卡 在 stack 中的位置保留
    // 不变（仅过滤掉触发了的地雷）。
    //
    // 触发顺序：顶层 → stack[len-1]（next-to-pop）→ ... → stack[0]（bottom）
    // 这样跟玩家直觉「从上往下连环引爆」一致，怪物先承受顶层伤害，然后一路
    // 往下结算（DEAL_DAMAGE_TO_MONSTER 入队顺序保证依次 reduce）。
    //
    // 非怪物（事件 / 其它建筑）落到地雷上时不触发，按普通 ghost 同款被推到下层
    // —— 跟用户确认过的语义一致（"踏踩"不是怪物不计数）。stack 中其它地雷也
    // 不触发（因为踩在它们头上的不是怪物）。
    const isMineCard = (c: GameCardData | null | undefined): boolean =>
      !!c && c.isGhost === true && (c.mineDamage ?? 0) > 0;

    const minesTriggered: Array<{
      slotIndex: number;
      mine: GameCardData;
      monster: GameCardData;
    }> = [];
    // 记录每个 slot 中"被触发"的 stack 地雷 id 集合，用于后续从 stack 中过滤
    const stackMinesByslot: Map<number, Set<string>> = new Map();

    plan.dropTargetSlots.forEach((slotIndex, idx) => {
      const card = plan.resolvedDropCards[idx];
      if (typeof slotIndex === 'number') {
        const existing = newActive[slotIndex];

        if (card && card.type === 'monster') {
          // 怪物落地 → 同 cell 所有地雷连环触发（顶层 + stack 任意位置）。
          // 顶层先 fire
          if (isMineCard(existing)) {
            minesTriggered.push({ slotIndex, mine: existing!, monster: card });
            // 不 push 进 ghostsDisplaced —— 地雷不入 stack，会进坟场
          } else if (existing?.isGhost) {
            ghostsDisplaced.push({ slotIndex, ghost: existing });
          }

          // Stack 中地雷依次 fire（next-to-pop → bottom）
          const stackForSlot = state.activeCardStacks[slotIndex] ?? [];
          if (stackForSlot.length > 0) {
            const triggeredStackIds = new Set<string>();
            for (let i = stackForSlot.length - 1; i >= 0; i--) {
              const c = stackForSlot[i];
              if (isMineCard(c)) {
                minesTriggered.push({ slotIndex, mine: c, monster: card });
                triggeredStackIds.add(c.id);
              }
            }
            if (triggeredStackIds.size > 0) {
              stackMinesByslot.set(slotIndex, triggeredStackIds);
            }
          }
        } else {
          // 非怪物落地：维持原行为（顶层 ghost 推下去，stack 内地雷不动）
          if (existing?.isGhost) {
            ghostsDisplaced.push({ slotIndex, ghost: existing });
          }
        }

        newActive[slotIndex] = card ?? null;
      }
    });
    patch.activeCards = newActive;

    // 地雷触发：先 BEGIN_COMBAT 让怪物进交战（满足 monster-damage-engagement
    // 不变量；reducer 入口 universal safety net 也兜底，但显式 enqueue 保证
    // BEGIN_COMBAT 排在 DEAL_DAMAGE_TO_MONSTER 之前，UI 顺序自然），再造成纯
    // 陷阱伤害（不带 isSpellDamage flag → 不走 amplify / 法伤加成），最后把地雷
    // 送进坟场（resetCardForGraveyard 由 reduceAddToGraveyard 内部处理）。
    //
    // 实际伤害 = mine.mineDamage + state.globalMineDamageBonus（「引雷阵锋」类
    // 武器累加的全场加成；持久化字段，详见 types.ts:GameState）。
    //
    // 同 monster 多枚地雷连环触发时：BEGIN_COMBAT 仅 enqueue 一次（reducer 对
    // 已 engaged 的怪物 idempotent，但仍避免冗余）；DEAL_DAMAGE_TO_MONSTER /
    // ADD_TO_GRAVEYARD / combat:mineTriggered 按地雷数量逐枚 enqueue —— drain
    // 顺序保证伤害「依次结算」。
    const mineGlobalBonus = state.globalMineDamageBonus ?? 0;
    const monstersBegun = new Set<string>();
    for (const { slotIndex, mine, monster } of minesTriggered) {
      if (!monstersBegun.has(monster.id)) {
        enqueuedActions.push({ type: 'BEGIN_COMBAT', monster, initiator: 'hero' });
        monstersBegun.add(monster.id);
      }
      const mineBaseDamage = mine.mineDamage ?? 0;
      const totalMineDamage = mineBaseDamage + mineGlobalBonus;
      enqueuedActions.push({
        type: 'DEAL_DAMAGE_TO_MONSTER',
        monsterId: monster.id,
        damage: totalMineDamage,
        source: 'mine-trap',
      });
      enqueuedActions.push({ type: 'ADD_TO_GRAVEYARD', card: mine });
      sideEffects.push({
        event: 'combat:mineTriggered',
        payload: {
          slotIdx: slotIndex,
          monsterId: monster.id,
          damage: totalMineDamage,
          mineId: mine.id,
        },
      });
    }

    // Transfer preview stacks to active stacks; ghosts go to stack bottom
    const nextActiveStacks = { ...state.activeCardStacks };
    // 先把已触发的 stack 地雷从原 stack 中过滤掉（同 cell 多枚连环引爆后，
    // stack 里只剩 non-mine 卡牌，按原顺序保留）
    for (const [slotIndex, triggeredIds] of stackMinesByslot) {
      const prev = nextActiveStacks[slotIndex] ?? [];
      const filtered = prev.filter(c => !triggeredIds.has(c.id));
      if (filtered.length > 0) {
        nextActiveStacks[slotIndex] = filtered;
      } else {
        delete nextActiveStacks[slotIndex];
      }
    }
    for (const { slotIndex, ghost } of ghostsDisplaced) {
      nextActiveStacks[slotIndex] = [ghost, ...(nextActiveStacks[slotIndex] ?? [])];
    }
    plan.dropPreviewIndices.forEach((previewIdx, i) => {
      const targetSlot = plan.dropTargetSlots[i];
      const stackForPreview = state.previewCardStacks[previewIdx];
      if (stackForPreview && stackForPreview.length > 0) {
        nextActiveStacks[targetSlot] = [...(nextActiveStacks[targetSlot] ?? []), ...stackForPreview];
      }
    });
    patch.activeCardStacks = nextActiveStacks;

    // Clear dropped preview cells and their stacks
    const nextPreview = [...state.previewCards] as ActiveRowSlots;
    for (const previewIdx of plan.dropPreviewIndices) {
      nextPreview[previewIdx] = null;
    }
    patch.previewCards = nextPreview;

    const nextPreviewStacks = { ...state.previewCardStacks };
    for (const previewIdx of plan.dropPreviewIndices) {
      delete nextPreviewStacks[previewIdx];
    }
    patch.previewCardStacks = nextPreviewStacks;

    // 「乾坤一翻」翻成正面的 preview 格如果跟随 drop 走了，必须复位 revealed 旗。
    // 否则下次该 index 出现新卡背时会被错误识别成"已翻面"。
    if (state.previewRevealedEarly?.some(Boolean)) {
      const nextRevealed = [...state.previewRevealedEarly];
      for (const previewIdx of plan.dropPreviewIndices) {
        nextRevealed[previewIdx] = false;
      }
      patch.previewRevealedEarly = nextRevealed;
    }

    // Enqueue enter effects for newly dropped monsters
    for (let i = 0; i < plan.resolvedDropCards.length; i++) {
      const card = plan.resolvedDropCards[i];
      const col = plan.dropTargetSlots[i];
      if (card.type === 'monster' && (card.enterEffect || card.ogreEnterDiscard)) {
        enqueuedActions.push({ type: 'MONSTER_ENTERED_ROW', monsterId: card.id, column: col });
      }
    }
    enqueuedActions.push({ type: 'CHECK_ELITE_GOLD_BUFF' });
  }

  // Eternal relic: waterfall-draw-2 — draw 2 cards from backpack every waterfall.
  //
  // Timing: 放在「怪物落到 active row 之后」，跟刚 patch 进去的 newActive 在同
  // 一 reduce step 里更新 handCards。理由：被抽到的卡如果带 onEnterHandEffect
  // （例：三牌惊雷"对 active row 全体怪造成 1 法术伤害"、嗜血誓约、生长之刃 等），
  // 触发时必须看到本波瀑流刚落下的怪物，否则 on-enter-hand 效果在 stale 的 active
  // row 上失效。`postProcessHandEntries`（reducer.ts ~L377）会在 reduce 后自动
  // 检测 handCards diff 并 enqueue TRIGGER_ON_ENTER_HAND，因为 patch.activeCards
  // 和 patch.handCards 在同一步写入，触发时 state.activeCards 已是 post-drop 状态。
  //
  // 副作用：边界情况里 `plan.resolvedDropCards.length === 0` 时 GameBoard 不会
  // dispatch APPLY_WATERFALL_DROP（直接走 deal/discard 分支），所以「无落怪的
  // 瀑流」这一波 relic 不触发。这是有意取舍：无落怪 = 没有"怪物落到 active row
  // 之后"这个时点，不强行补发；玩家在那一波损失 2 张。
  //
  // 来源固定 'backpack'：遵循 .cursor/rules/draw-cards-defaults-to-backpack.mdc。
  // 内联 drawMultipleFromBackpack（而不是 enqueue DRAW_CARDS）的目的：拿到实际
  // 抽到的卡的引用，把名字写进 log，跟其它「抽 N 张」效果实现一致。
  if (hasEternalRelic(state.eternalRelics, 'waterfall-draw-2')) {
    const drawState = { ...state, ...patch } as GameState;
    const drawResult = drawMultipleFromBackpack(drawState, 2);
    if (drawResult.cards.length > 0) {
      Object.assign(patch, drawResult.patch);
      for (const d of drawResult.cards) {
        sideEffects.push({
          event: 'card:drawnToHand',
          payload: { cardId: d.id, source: 'backpack' },
        });
      }
      const names = drawResult.cards.map(c => `「${c.name}」`).join('、');
      sideEffects.push({
        event: 'log:entry',
        payload: {
          type: 'waterfall',
          message: `永恒护符·瀑流汲取：从背包抽 ${drawResult.cards.length} 张牌（${names}）`,
        },
      });
      applyMirrorCopySummonProgress(state, patch, sideEffects, enqueuedActions, drawResult.cards.length);
    } else {
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'waterfall', message: '永恒护符·瀑流汲取：背包无可抽卡或手牌已满' },
      });
    }
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// APPLY_WATERFALL_DEAL — fill preview row from deck using the pending plan
// ---------------------------------------------------------------------------

function reduceApplyWaterfallDeal(state: GameState): ReduceResult {
  const plan = state.pendingWaterfallPlan;
  if (!plan) return noChange(state);

  const patch: Partial<GameState> = {};
  const sideEffects: SideEffect[] = [];

  if (plan.nextPreviewCards.length === 0) {
    patch.previewCards = createEmptyActiveRow();
    if (plan.shouldDeclareVictory) {
      patch.victory = true;
      patch.gameOver = true;
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'system', message: '胜利！地牢已被征服！' },
      });
    }
  } else {
    const spawnTurn = state.turnCount;
    patch.previewCards = fillActiveRowSlots(
      plan.nextPreviewCards.map(c => applyMonsterRage(c, spawnTurn)),
    );

    // Apply preview stacks from the plan
    if (Object.keys(plan.newPreviewStacks).length > 0) {
      patch.previewCardStacks = { ...state.previewCardStacks, ...plan.newPreviewStacks };
    }

    const dealCardNames = plan.nextPreviewCards.map(c => `「${c.name}」`).join('、');
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'waterfall', message: `发牌：${dealCardNames} 进入预览行` },
    });
  }

  // 整个 preview 行被新卡替换 / 清空 → 所有 previewRevealedEarly 旗复位为 false。
  // 新发的 preview 卡都是默认卡背状态。
  if (state.previewRevealedEarly?.some(Boolean)) {
    patch.previewRevealedEarly = state.previewRevealedEarly.map(() => false);
  }

  patch.remainingDeck = plan.nextRemainingDeck;

  // ---- Multiplayer: emit transferOut side effect ----
  // This is the LAST step of one waterfall iteration; by now `nextRemainingDeck`
  // already reflects all returnToDeck/swarmInfest re-insertions (each tagged
  // `_excludedFromShared: true` by `tagLocalIfMultiplayer` in the discard phase).
  //
  // Two payload arrays go to the peer:
  //   - `cards` (from state.pendingTransferOut) — squeezed-out preview cards
  //     to PREPEND on peer's deck top.
  //   - `previewDealt` (= plan.nextPreviewCards) — cards we just dealt from
  //     our deck top to our preview row; peer REMOVES these from their deck
  //     by id (silently skipping cards they don't have).
  //
  // We also bump `sharedDeckConsumed` — the cumulative count of shared
  // cards consumed locally — for stats / debugging only. The protocol no
  // longer uses this counter for sync logic.
  if (state.multiplayerSession !== null) {
    // Read ship cards from the plan's buffer (accumulated by chained
    // APPLY_WATERFALL_DISCARD_EFFECTS dispatches earlier in this waterfall
    // iteration). NOT from `state.pendingTransferOut` — that field is the
    // hook's "pending POST" inbox and may already contain stale cards from
    // a previous waterfall whose POST hasn't acked yet. We want to APPEND
    // this iteration's batch to it, not double-read it.
    const cardsToShip: GameCardData[] = [...(plan._shippedCardsBuffer ?? [])];
    // Strip per-iteration runtime fields from previewDealt so the wire
    // payload is JSON-clean. We send the cards' identity (id, type, name,
    // etc.) — the peer only needs ids to do removal, but keeping more
    // fields makes wire payloads self-describing for debugging.
    const previewDealtToShip: GameCardData[] = plan.nextPreviewCards.map(c => ({
      ...c,
    }));

    if (cardsToShip.length > 0 || previewDealtToShip.length > 0) {
      // Stats counter — count only "originally shared" cards (no
      // `_excludedFromShared` tag). Useful for resume math even though
      // not part of the active sync protocol.
      const newlyConsumedShared = previewDealtToShip.reduce(
        (acc, c) => acc + (c._excludedFromShared ? 0 : 1),
        0,
      );
      patch.sharedDeckConsumed = (state.sharedDeckConsumed ?? 0) + newlyConsumedShared;

      // ATOMIC COMMIT: write `pendingTransferOut` and
      // `pendingTransferOutPreviewDealt` together in one reducer step so
      // the hook never observes a half-committed staged batch. (Previously,
      // `reduceApplyWaterfallDiscardEffects` wrote `pendingTransferOut`
      // directly, which created a ~150ms intermediate state where the hook
      // would POST cards-only and then POST cards+preview, generating
      // duplicate server rows. Buffer-on-plan + atomic commit fixes this.)
      patch.pendingTransferOut = [
        ...(state.pendingTransferOut ?? []),
        ...cardsToShip,
      ];
      patch.pendingTransferOutPreviewDealt = [
        ...(state.pendingTransferOutPreviewDealt ?? []),
        ...previewDealtToShip,
      ];

      sideEffects.push({
        event: 'multiplayer:transferOut',
        payload: {
          cards: cardsToShip,
          previewDealt: previewDealtToShip,
          // Local hint seq — the network layer / server stamps the authoritative
          // seq when it persists the row. Using sharedDeckConsumed as a coarse
          // local ordering hint is OK for phase 3 BroadcastChannel; phase 4
          // upgrades to server-assigned seq.
          seq: (state.sharedDeckConsumed ?? 0) + newlyConsumedShared,
        },
      });
      // Note: `pendingTransferOut` is NOT cleared here. The hook is
      // responsible for dispatching MULTIPLAYER_CLEAR_PENDING_TRANSFER
      // after the network layer acks.
    }

    // ----- Phase 6.2 boss alert -----
    // If a Boss (final monster) just landed in the active row OR became
    // visible in the preview row, fire a one-shot advisory side effect so
    // the UI can show "Boss 战暂未支持双人，本场以单人结算". The underlying
    // combat continues to reduce as solo — this is a UX-only hint.
    //
    // Gated on `bossEncounterAlertShown` so we never re-fire (e.g. when
    // the boss is killed and another final-monster precursor surfaces, or
    // across multiple waterfalls that each redraw the same boss into preview).
    if (!state.bossEncounterAlertShown) {
      const newActiveRow = patch.activeCards ?? state.activeCards;
      const newPreviewRow = patch.previewCards ?? state.previewCards;
      const bossInRow = (
        [...newActiveRow, ...newPreviewRow] as Array<GameCardData | null>
      ).find(c => c?.isFinalMonster === true);
      if (bossInRow) {
        patch.bossEncounterAlertShown = true;
        sideEffects.push({
          event: 'multiplayer:bossEncountered',
          payload: { monsterId: bossInRow.id },
        });
      }
    }
  }

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// COMPLETE_WATERFALL — clear the pending plan after all phases are animated
// ---------------------------------------------------------------------------

function reduceCompleteWaterfall(state: GameState): ReduceResult {
  if (!state.pendingWaterfallPlan) return noChange(state);

  const cleared: GameState = { ...state, pendingWaterfallPlan: null };

  // Soft-lock guard: when the active row is still empty after the just-completed
  // waterfall but the preview row or remaining deck still has cards, recompute
  // and emit a follow-up plan inline so the UI starts another animation cycle.
  //
  // Why this is needed: the upstream `postProcessActiveCards` step-5 trigger
  // (reducer.ts) won't re-fire on subsequent player actions because its
  // early-return on `activeCards === prevState.activeCards` short-circuits
  // as long as the active row stays empty. Without this re-trigger, cards
  // stranded in the preview after a deal phase would never cascade into the
  // active row — the game soft-locks.
  //
  // Real triggers (reported by users):
  //   • 瀑流重置 (cascadeReset): preview row was empty + deck was empty when
  //     the player cleared the active row. The first waterfall refills the
  //     preview from the now-populated deck, but with no preview cards to
  //     drop into active, the active row stays empty → soft-lock.
  //   • 迷宫回溯 (return-dungeon-bottom): same shape when the active row
  //     held a single card and both preview & deck were empty.
  //
  // Termination: each re-trigger either drops cards into the active row
  // (countActive > 0 → condition fails next time) or computeWaterfallDropPlan
  // returns null (preview empty + deck empty + active empty → victory branch
  // already handled by reduceApplyWaterfallDeal's `shouldDeclareVictory`).
  if (
    !cleared.gameOver &&
    countActiveRowSlotsExcludeGhost(cleared.activeCards) === 0 &&
    (cleared.previewCards.some(c => !!c) || cleared.remainingDeck.length > 0)
  ) {
    const plan = computeWaterfallDropPlan(cleared, false);
    if (plan) {
      const next: GameState = { ...cleared, pendingWaterfallPlan: plan, rng: plan.rng };
      return {
        state: next,
        sideEffects: [{ event: 'waterfall:planReady', payload: { plan } }],
        enqueuedActions: [],
      };
    }
  }

  return { state: cleared, sideEffects: [], enqueuedActions: [] };
}
