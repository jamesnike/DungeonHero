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
import { pickGraveyardCardExcluding } from './equipment-effects';
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
import { processRecycleBag, drawMultipleFromBackpack } from '../cards';
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
  const { activeCards, previewCards, remainingDeck, turnCount, gameMode, waterfallDealBonus } = state;
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
    applyMonsterRage(pair.card, spawnTurn, gameMode === 'quick'),
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
  // per-mode monster invariant. Init-time chunk balancing handles this for the
  // static deck, but card-effect deck reordering / stacking-deletion can
  // disturb that invariant — this is the safety net.
  //   • Normal mode: 1–2 monsters per row.
  //   • Quick  mode: 0–1 monsters per row (each 4-card row holds at most 1
  //                  monster; rows with 0 monsters are allowed because the
  //                  init layout intentionally leaves a leftover monster in
  //                  the back 18 cards).
  {
    const isQuickMode = state.gameMode === 'quick';
    const MIN_MONSTERS_PER_ROW = isQuickMode ? 0 : 1;
    const MAX_MONSTERS_PER_ROW = isQuickMode ? 1 : 2;
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

  // Starter amulet: 潮愈之符 (`waterfall-heal`). Linear ×N stacking — each equipped
  // amulet contributes a base heal of 4, summed before being passed to `reduceHeal`,
  // which then applies the compound 2^healCount multiplier (heal-amulet) inside
  // `computeHeal`, mirroring the relic above. 与永恒护符·潮涌回春独立结算（玩家
  // 可以同时持有两者，两笔治疗叠加）。
  if (amuletEffects.waterfallHealCount > 0) {
    const baseHeal = 4 * amuletEffects.waterfallHealCount;
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
        message: `潮愈之符${stackSuffix}：瀑布推进，恢复 ${healAmount} 点生命${healSuffix}`,
      },
    });
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
    patch.permanentMagicRecycleBag = recycleResult.remaining;
    if (recycleResult.restored.length > 0) {
      patch.backpackItems = [...state.backpackItems, ...recycleResult.restored];
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'waterfall', message: `回收袋恢复了 ${recycleResult.restored.length} 张牌到背包` },
      });
      // 通知 UI 播放 Backpack cell 的"绿色回收环"动画。
      // BackpackZone 通过 useGameEvent('waterfall:recycleRestored', ...) 监听并
      // 触发本地动画状态。
      sideEffects.push({
        event: 'waterfall:recycleRestored',
        payload: { count: recycleResult.restored.length, cards: recycleResult.restored },
      });
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

  // Handle the card itself going to graveyard or back to deck
  const sendToGraveyardUnlessFinal = () => {
    if (isFinalMonsterPrecursor) {
      sideEffects.push({ event: 'log:entry', payload: { type: 'waterfall', message: `${cardName}（最终之敌）被挤出，置于牌堆底以待决战` } });
      nextRemainingDeck = [...nextRemainingDeck, discardCard];
      sideEffects.push({ event: 'ui:banner', payload: { text: `${cardName} 隐入牌堆……终局之战尚未到来。` } });
    } else {
      enqueuedActions.push({ type: 'DISCARD_OWNED_CARD', card: discardCard, owner: 'dungeon' });
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
        nextRemainingDeck.splice(insertion.insertIndex, 0, discardCard);
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
        // This is complex — equipment destruction with last words.
        // We handle the state mutation parts and emit side effects for UI.
        // Equipment last words that require UI interaction (class deck draws, graveyard-to-hand)
        // are handled via enqueued actions.
        const destroyed: string[] = [];
        const destroyedCards: GameCardData[] = [];
        const revived: string[] = [];

        for (const slotId of ['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]) {
          const slotItem = state[slotId];
          if (slotItem) {
            const card = slotItem as GameCardData;
            // Process last words effects
            applyEquipDestroyLastWords(card, slotId, state, patch, sideEffects, enqueuedActions);

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
              applyEquipDestroyLastWords(r, slotId, state, patch, sideEffects, enqueuedActions);
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
          bugs.push(applyAmplifyOnCreate(createBugletCard(), state.amplifiedCardBonus));
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
          nextRemainingDeck = [...nextRemainingDeck, discardCard];
          sideEffects.push({ event: 'ui:banner', payload: { text: `${cardName} 隐入牌堆……终局之战尚未到来。` } });
        } else {
          enqueuedActions.push({ type: 'DISCARD_OWNED_CARD', card: discardCard, owner: 'dungeon' });
        }
        break;
    }
  } else {
    // No waterfall effect — just discard or return final monster
    if (isFinalMonsterPrecursor) {
      sideEffects.push({ event: 'log:entry', payload: { type: 'waterfall', message: `${cardName}（最终之敌）被挤出，置于牌堆底以待决战` } });
      nextRemainingDeck = [...nextRemainingDeck, discardCard];
      sideEffects.push({ event: 'ui:banner', payload: { text: `${cardName} 隐入牌堆……终局之战尚未到来。` } });
    } else {
      enqueuedActions.push({ type: 'DISCARD_OWNED_CARD', card: discardCard, owner: 'dungeon' });
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

  // Sync the updated remaining deck back into the pending plan so APPLY_WATERFALL_DEAL
  // uses the version that includes returnToDeck / swarmInfest modifications.
  if (state.pendingWaterfallPlan) {
    patch.pendingWaterfallPlan = { ...state.pendingWaterfallPlan, nextRemainingDeck };
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
// Helper: apply equipment destroy last-words effects within the reducer
// ---------------------------------------------------------------------------

export function applyEquipDestroyLastWords(
  card: GameCardData,
  slotId: EquipmentSlotId,
  state: GameState,
  patch: Partial<GameState>,
  sideEffects: SideEffect[],
  enqueuedActions: GameAction[],
): void {
  if (card.onDestroyHeal) {
    enqueuedActions.push({ type: 'HEAL', amount: card.onDestroyHeal, source: 'equip-destroy-heal' });
    sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 遗言：恢复了 ${card.onDestroyHeal} 点生命` } });
  }
  if (card.onDestroyGold) {
    enqueuedActions.push({ type: 'MODIFY_GOLD', delta: card.onDestroyGold, source: 'equipment-destroy-gold' });
    sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 遗言：获得了 ${card.onDestroyGold} 金币` } });
  }
  if (card.onDestroyDraw) {
    enqueuedActions.push({ type: 'DRAW_CARDS', count: card.onDestroyDraw, source: 'backpack' });
    sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 遗言：抽取了 ${card.onDestroyDraw} 张牌` } });
  }
  if (card.onDestroyClassDraw) {
    enqueuedActions.push({ type: 'DRAW_CLASS_TO_BACKPACK', count: card.onDestroyClassDraw });
    sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 遗言：获得专属卡` } });
  }
  if (card.onDestroyPermanentDamage) {
    const bonuses = (patch.equipmentSlotBonuses ?? state.equipmentSlotBonuses) as Record<EquipmentSlotId, SlotPermanentBonus>;
    if (!patch.equipmentSlotBonuses) {
      patch.equipmentSlotBonuses = { ...state.equipmentSlotBonuses };
    }
    const cur = bonuses[slotId];
    (patch.equipmentSlotBonuses as Record<EquipmentSlotId, SlotPermanentBonus>)[slotId] = {
      ...cur,
      damage: cur.damage + card.onDestroyPermanentDamage,
    };
    sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 遗言：该装备栏永久伤害 +${card.onDestroyPermanentDamage}！` } });
  }
  if (card.onDestroyPermanentShield) {
    const bonuses = (patch.equipmentSlotBonuses ?? state.equipmentSlotBonuses) as Record<EquipmentSlotId, SlotPermanentBonus>;
    if (!patch.equipmentSlotBonuses) {
      patch.equipmentSlotBonuses = { ...state.equipmentSlotBonuses };
    }
    const cur = bonuses[slotId];
    (patch.equipmentSlotBonuses as Record<EquipmentSlotId, SlotPermanentBonus>)[slotId] = {
      ...cur,
      shield: cur.shield + card.onDestroyPermanentShield,
    };
    applySlotArmorBonusDelta(state, slotId, card.onDestroyPermanentShield, patch);
    sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 遗言：该装备栏永久护甲 +${card.onDestroyPermanentShield}！` } });
  }
  if (card.onDestroyEffect === 'graveyard-to-hand') {
    // Use the latest patch.discardedCards if a previous iteration in the same
    // reduce already removed a picked card; defensively exclude `card` itself
    // so destroyed equipment can never re-pick its own staged copy.
    const pool = (patch.discardedCards ?? state.discardedCards) as readonly GameCardData[];
    const curRng = (patch.rng ?? state.rng) as RngState;
    const pick = pickGraveyardCardExcluding(pool, card.id, curRng);
    if (pick) {
      patch.rng = pick.rng;
      patch.discardedCards = pool.filter((_, i) => i !== pick.idx);
      enqueuedActions.push({ type: 'ADD_CARD_TO_HAND', card: pick.picked });
      sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 遗言：从坟场获得了「${pick.picked.name}」！` } });
      sideEffects.push({ event: 'card:newCardGained', payload: { count: 1, source: 'graveyard' } });
    } else {
      sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 遗言：坟场没有可用的牌。` } });
    }
  } else if (card.onDestroyEffect?.startsWith('stunCap+')) {
    const amount = parseInt(card.onDestroyEffect.replace('stunCap+', ''), 10) || 0;
    if (amount > 0) {
      const current = patch.stunCap ?? state.stunCap ?? 0;
      const next = Math.min(100, current + amount);
      if (next > current) patch.stunCap = next;
      sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 遗言：击晕上限 +${amount}%（当前 ${next}%）。` } });
      sideEffects.push({ event: 'ui:banner', payload: { text: `${card.name} 遗言！击晕上限 +${amount}%！` } });
    }
  } else if (card.onDestroyEffect?.startsWith('allSlotTempArmor:')) {
    const amount = parseInt(card.onDestroyEffect.replace('allSlotTempArmor:', ''), 10) || 0;
    if (amount > 0) {
      const tempArmor = patch.slotTempArmor ?? { ...(state.slotTempArmor ?? {}) };
      tempArmor.equipmentSlot1 = (tempArmor.equipmentSlot1 ?? 0) + amount;
      tempArmor.equipmentSlot2 = (tempArmor.equipmentSlot2 ?? 0) + amount;
      patch.slotTempArmor = tempArmor;
      applySlotArmorBonusDelta(state, 'equipmentSlot1', amount, patch);
      applySlotArmorBonusDelta(state, 'equipmentSlot2', amount, patch);
      sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 遗言：所有装备栏 +${amount}临时护甲！` } });
      sideEffects.push({ event: 'ui:banner', payload: { text: `${card.name} 遗言！所有装备栏 +${amount}临时护甲！` } });
      const amuletFx = computeAmuletEffectsForState(state);
      if (amuletFx.persuadeOnTempAttackCount > 0) {
        const pBonus = amuletFx.persuadeOnTempAttackBonus;
        patch.persuadeAmuletBonus = (patch.persuadeAmuletBonus ?? state.persuadeAmuletBonus ?? 0) + pBonus;
        sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `怀柔之印：下次劝降率 +${pBonus}%` } });
      }
    }
  } else if (card.onDestroyEffect) {
    sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${card.name} 遗言：${card.onDestroyEffect}` } });
  }
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

    plan.dropTargetSlots.forEach((slotIndex, idx) => {
      const card = plan.resolvedDropCards[idx];
      if (typeof slotIndex === 'number') {
        const existing = newActive[slotIndex];
        if (existing?.isGhost) {
          ghostsDisplaced.push({ slotIndex, ghost: existing });
        }
        newActive[slotIndex] = card ?? null;
      }
    });
    patch.activeCards = newActive;

    // Transfer preview stacks to active stacks; ghosts go to stack bottom
    const nextActiveStacks = { ...state.activeCardStacks };
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
    const isQuick = state.gameMode === 'quick';
    patch.previewCards = fillActiveRowSlots(
      plan.nextPreviewCards.map(c => applyMonsterRage(c, spawnTurn, isQuick)),
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
