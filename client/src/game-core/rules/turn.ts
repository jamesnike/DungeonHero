/**
 * Turn Rules — handles turn-flow actions in the reducer.
 *
 * Covers: START_TURN, END_TURN, ADVANCE_MONSTER_TURN,
 * APPLY_MONSTER_TURN_END_EFFECTS, ENTER_PLAYER_INPUT, RESET_TURN_STATE.
 *
 * Delegates heavy computation to the existing pure functions in combat.ts.
 */

import type { GameState, PendingMonsterEndDice } from '../types';
import type { GameAction } from '../actions';
import type { ReduceResult, SideEffect } from '../reducer';
import { applyPatch, noChange } from '../reducer';
import {
  endHeroTurnPatch,
  advanceMonsterTurnPatch,
  applyMonsterTurnEndEffects,
  finishCombatPatch,
} from '../combat';
import {
  initialCombatState,
  createEmptyEquipmentBuffState,
  BALANCE_ATTACK_BONUS,
  BALANCE_SHIELD_BONUS,
  BALANCE_ATTACK_PENALTY,
  BALANCE_SHIELD_PENALTY,
  BASE_BACKPACK_CAPACITY,
} from '../constants';
import { pushRecycleRestoreSideEffects } from '../cards';
import { computeAmuletEffectsForState, applySlotArmorBonusDelta } from '../equipment';
import { hasEternalRelic } from '@/lib/eternalRelics';
import type { RngState } from '../rng';
import { nextInt } from '../rng';
import type { GameCardData } from '@/components/GameCard';
import { cardHasPermFlag } from '@/components/GameCard';
import type { EquipmentItem, AmuletItem, EquipmentSlotId } from '@/components/game-board/types';

export function reduceTurnActions(state: GameState, action: GameAction): ReduceResult | null {
  switch (action.type) {
    case 'END_TURN':
      return reduceEndTurn(state, action);
    case 'FORCE_END_HERO_TURN':
      return reduceForceEndHeroTurn(state, action);
    case 'ADVANCE_MONSTER_TURN':
      return reduceAdvanceMonsterTurn(state);
    case 'APPLY_MONSTER_TURN_END_EFFECTS':
      return reduceMonsterTurnEndEffects(state);
    case 'START_TURN':
      return reduceStartTurn(state, action);
    case 'ENTER_PLAYER_INPUT':
      return applyPatch(state, { phase: 'playerInput' });
    case 'RESET_TURN_STATE':
      return reduceResetTurnState(state);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// END_TURN
// ---------------------------------------------------------------------------

function reduceEndTurn(
  state: GameState,
  action: Extract<GameAction, { type: 'END_TURN' }>,
): ReduceResult {
  const heroTurnLayerLossIds = new Set(action.heroTurnLayerLossIds);
  const result = endHeroTurnPatch(state, heroTurnLayerLossIds);

  const sideEffects: SideEffect[] = [];
  for (const log of result.logs) {
    sideEffects.push({ event: 'log:entry', payload: { type: log.type, message: log.message } });
  }

  const patch: Partial<GameState> = {
    combatState: result.combatState,
    activeCards: result.activeCards,
    berserkerSlotUsed: result.berserkerSlotUsed,
    flashSlotUsed: result.flashSlotUsed,
    gambitSlotUsed: result.gambitSlotUsed,
    weaponExtraAttackUsed: result.weaponExtraAttackUsed,
    rng: result.rng,
    phase: 'monsterTurn',
    // 英雄回合结束 ⇒ 清空 60s 倒计时；下一次 START_TURN 会重新设置。
    playerTurnStartedAt: null,
  };

  // Eternal relic·幽魂净化 — at every hero turn end, flush the recycle bag
  // back into the backpack (no usage limit). Cards that don't fit the backpack
  // capacity stay in the bag for next turn.
  if (hasEternalRelic(state.eternalRelics ?? [], 'wraith-purification')) {
    const bag = state.permanentMagicRecycleBag as (GameCardData & { _recycleWaits?: number })[];
    if (bag.length > 0) {
      const cleaned: GameCardData[] = bag.map(card => {
        const { _recycleWaits, ...rest } = card;
        return rest as GameCardData;
      });
      const capacity = Math.max(1, BASE_BACKPACK_CAPACITY + (state.backpackCapacityModifier ?? 0));
      const currentBackpack = state.backpackItems as GameCardData[];
      const available = Math.max(0, capacity - currentBackpack.length);
      const toRestore = cleaned.slice(0, available);
      const overflow = cleaned.slice(available);
      // 「置顶」关键词分流：toRestore 切两半，置顶 → backpackItems[0]（prepend），
      // 其余 → backpackItems 末尾（append）。两组都进背包，**不再**走 remainingDeck。
      // 这条路径不走 processRecycleBag（幽魂净化是「即时洗回，不递减 _recycleWaits」的特殊
      // 路径），所以手动复刻 cards.ts processRecycleBag 的分流逻辑。
      const restoredToBackpackTop: GameCardData[] = [];
      const restoredToBackpack: GameCardData[] = [];
      for (const c of toRestore) {
        if (c.topOnRecycleRestore) restoredToBackpackTop.push(c);
        else restoredToBackpack.push(c);
      }
      patch.backpackItems = [...restoredToBackpackTop, ...currentBackpack, ...restoredToBackpack];
      patch.permanentMagicRecycleBag = overflow as GameCardData[];
      if (toRestore.length > 0) {
        sideEffects.push({
          event: 'log:entry',
          payload: {
            type: 'skill',
            message: `幽魂净化：回合结束，回收袋 ${toRestore.length} 张牌洗回背包：${toRestore.map(c => c.name).join('、')}`,
          },
        });
        sideEffects.push({
          event: 'ui:banner',
          payload: { text: `幽魂净化：${toRestore.length} 张牌从回收袋洗回背包！` },
        });
        // 跟 waterfall 路径保持同样的 UI 通知：触发 BackpackZone 的绿色回收环动画 +
        // 「置顶」卡的二段反馈。同步参考：rules/waterfall.ts、rules/magic-effects.ts 的
        // STARTER_CARD_IDS.recycleDrawMagic、card-schema/definitions/magic.ts 的
        // starter:recycleDrawMagic、虚空置换 (void-swap)。
        pushRecycleRestoreSideEffects(sideEffects, {
          restored: toRestore,
          restoredToBackpackTop,
        });
      }
      if (overflow.length > 0) {
        sideEffects.push({
          event: 'log:entry',
          payload: {
            type: 'skill',
            message: `幽魂净化：背包已满，${overflow.length} 张牌留在回收袋等待。`,
          },
        });
      }
    }
  }

  // 「回合汲取」永恒护符（`end-turn-draw`，由 `回合汲取药` `grant-amulet-end-turn-draw`
  // 授予；也覆盖玩家通过 `护符永铸药` 把任意 `end-turn-draw` amulet 永铸进 eternalRelics
  // 的情况）：每次结束英雄回合时，按 N 件叠加从背包抽 N 张牌。
  //
  // Bug 历史：本逻辑在 1.2.2 还是 hook-side 实现（`useCombatActions.endHeroTurn`
  // 直接调 `drawFromBackpackToHand`），后来 `endHeroTurn` 迁移成 dispatch
  // `END_TURN` 给 reducer，旧 hook 的抽牌代码被删除但**没有**搬到 reducer 这边
  // → 玩家体感「永铸完了护符没效果」。补一条 enqueue 让它复活。
  //
  // 抽牌来源：背包（默认且唯一正确语义；见 `draw-cards-defaults-to-backpack.mdc`）。
  // 字段读取：`computeAmuletEffectsForState` 已合并 amuletSlots + eternalRelics
  // （见 `parallel-state-fields-consumer-audit.mdc`），所以装备形态 / 永铸形态
  // 走同一路径。
  const endTurnDrawActions: GameAction[] = [];
  const ae = computeAmuletEffectsForState(state);
  if (ae.endTurnDrawCount > 0) {
    endTurnDrawActions.push({
      type: 'DRAW_CARDS',
      count: ae.endTurnDrawCount,
      source: 'backpack',
    });
    sideEffects.push({
      event: 'log:entry',
      payload: {
        type: 'amulet',
        message: `回合汲取：结束英雄回合，从背包抽 ${ae.endTurnDrawCount} 张牌。`,
      },
    });
  }

  // Convert hero-turn-end skill triggers (elite regen, dragon heal-other) into
  // TRIGGER_MONSTER_SKILL_FLOAT actions. They go FIRST so the float queue
  // freezes the pipeline before any subsequent monster-turn advancement runs.
  const skillFloatActions: GameAction[] = result.skillFloats.map(f => ({
    type: 'TRIGGER_MONSTER_SKILL_FLOAT',
    monsterId: f.monsterId,
    skillKey: f.skillKey,
  }));

  // If combat ended (no engaged monsters), no need to advance.
  // Order: end-turn-draw first (跟 1.2.2 hook-side 行为一致，先抽再触发 float),
  // skill floats next (保证 awaitingSkillFloat 在任何后续 race 之前就位).
  if (result.combatState.engagedMonsterIds.length === 0) {
    const followUps = [...endTurnDrawActions, ...skillFloatActions];
    return applyPatch(state, {
      ...patch,
      phase: 'playerInput',
    }, sideEffects, followUps.length > 0 ? followUps : undefined);
  }

  // Enqueue the monster turn advancement (after any draw + skill float queued above)
  return applyPatch(state, patch, sideEffects, [
    ...endTurnDrawActions,
    ...skillFloatActions,
    { type: 'ADVANCE_MONSTER_TURN' },
  ]);
}

// ---------------------------------------------------------------------------
// FORCE_END_HERO_TURN — auto-end on 40s timer expiry
// ---------------------------------------------------------------------------

/**
 * 40s 倒计时归零时的强制收尾。
 *
 * 1. 清空所有引擎侧 modal / pending interaction 字段（不调 setter，直接 patch
 *    一次性归零，避免 N 条单独 dispatch 在管线里被 INPUT_PHASES gating 卡住）。
 * 2. 把 phase 推回 `playerInput`，保证后续 enqueue 的 `END_TURN` 能在
 *    pipeline drain 中走到。
 * 3. Enqueue 一条 `END_TURN` —— 由后续的 `reduceEndTurn` 完成正常的
 *    hero-turn 收尾（清 `playerTurnStartedAt`、推 monsterTurn 等）。
 *
 * 组件本地 useState 形式的 modal（`backpackViewerOpen` /
 * `heroSkillTargeting` / `magicTargeting` / `pendingPotionAction` 等）由
 * `useAutoEndHeroTurn` 在 dispatch 之前 close。
 */
function reduceForceEndHeroTurn(
  state: GameState,
  action: Extract<GameAction, { type: 'FORCE_END_HERO_TURN' }>,
): ReduceResult {
  const patch: Partial<GameState> = {
    // --- Pending interaction state machines ---
    pendingMagicAction: null,
    pendingPotionAction: null,
    pendingHeroSkillAction: null,
    pendingHeroMagicAction: null,
    pendingHandDiscardSelection: null,
    deathWardNotice: null,
    cardActionContext: null,
    equipmentPrompt: null,
    persuadeState: null,
    eventTransformState: null,
    // --- Modal state ---
    eventModalOpen: false,
    eventModalMinimized: false,
    eventDiceModal: null,
    magicChoiceModal: null,
    discoverModalOpen: false,
    discoverModalMinimized: false,
    discoverOptions: [],
    discoverSourceLabel: null,
    discoverDelivery: 'backpack',
    discoverPostInjectTopOnRecycleRestore: false,
    pendingClassDiscoverQueue: [],
    deleteModalOpen: false,
    upgradeModalOpen: false,
    upgradeModalMaxCount: undefined,
    handMagicUpgradeModal: null,
    mirrorCopyModal: null,
    monsterFusionModal: null,
    permGrantModal: null,
    amplifyModal: null,
    eventAmplifyHandPicker: null,
    graveyardDiscoverState: null,
    graveyardDiscoverMinimized: false,
    graveyardDiscoverDelivery: 'backpack',
    ghostBladeExileCards: null,
    shopModalOpen: false,
    shopModalMinimized: false,
    shopSkillSelectOpen: false,
    monsterRewardMinimized: false,
    // --- Phase ---
    // INPUT_PHASES gating: pipeline 只在 playerInput 等 INPUT 相位下 drain
    // 'isInputContinuation' 列表里的 action（END_TURN 在白名单里）。强制把
    // phase 推回 playerInput 让 enqueue 的 END_TURN 立刻被处理。
    phase: 'playerInput',
    // 防御性清空：END_TURN reducer 也会清，但这里直接清能让 FORCE_END
    // 单独 reduce 时也保证字段归零，不依赖后续 END_TURN drain。
    playerTurnStartedAt: null,
  };

  const sideEffects: SideEffect[] = [
    {
      event: 'log:entry',
      payload: { type: 'turn', message: '时间到，玩家回合已自动结束。' },
    },
    {
      event: 'ui:banner',
      payload: { text: '时间到，玩家回合已自动结束' },
    },
  ];

  return applyPatch(state, patch, sideEffects, [
    { type: 'END_TURN', heroTurnLayerLossIds: action.heroTurnLayerLossIds },
  ]);
}

// ---------------------------------------------------------------------------
// ADVANCE_MONSTER_TURN
// ---------------------------------------------------------------------------

function reduceAdvanceMonsterTurn(state: GameState): ReduceResult {
  const result = advanceMonsterTurnPatch(state.combatState, state.activeCards);
  const sideEffects: SideEffect[] = [];

  for (const skip of result.skippedMonsters) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `${skip.name} 被晕眩，跳过攻击。` },
    });
    sideEffects.push({
      event: 'combat:stunApplied',
      payload: { monsterId: skip.id },
    });
  }

  const newCombat = result.combatState;

  // Switched back to hero turn — enqueue monster turn-end effects then start turn
  if (newCombat.currentTurn === 'hero' && state.combatState.currentTurn === 'monster') {
    return applyPatch(state, { combatState: newCombat }, sideEffects, [
      { type: 'APPLY_MONSTER_TURN_END_EFFECTS' },
    ]);
  }

  // Monster has a pending block — wait for player input (RESOLVE_BLOCK)
  if (newCombat.pendingBlock) {
    sideEffects.push({
      event: 'combat:monsterAttack',
      payload: {
        monsterId: newCombat.pendingBlock.monsterId,
        damage: newCombat.pendingBlock.attackValue,
      },
    });
    return applyPatch(
      state,
      { combatState: newCombat, phase: 'awaitingBlock' },
      sideEffects,
    );
  }

  return applyPatch(state, { combatState: newCombat }, sideEffects);
}

// ---------------------------------------------------------------------------
// APPLY_MONSTER_TURN_END_EFFECTS
// ---------------------------------------------------------------------------

function reduceMonsterTurnEndEffects(state: GameState): ReduceResult {
  const result = applyMonsterTurnEndEffects(
    state.activeCards,
    state.combatState.engagedMonsterIds,
    state.rng,
    {
      heroTookDamageThisMonsterTurn: false, // TODO: track via state field
      equipmentSlot1: state.equipmentSlot1,
      equipmentSlot2: state.equipmentSlot2,
      activeCardStacks: state.activeCardStacks,
    },
  );

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  // Convert pure-helper-collected skill floats into actions queued at the
  // FRONT of follow-up enqueuedActions. Pushing them first guarantees the
  // pipeline pauses on `phase=awaitingSkillFloat` BEFORE the dice modal
  // (and any later START_TURN flow) can race ahead. The UI also has a
  // `pendingSkillFloats.length > 0` guard on modal open as a belt-and-braces
  // safety net for the `combat:goblinHealCheck` side-effect that fires
  // synchronously from this same reducer step.
  for (const f of result.skillFloats) {
    enqueuedActions.push({
      type: 'TRIGGER_MONSTER_SKILL_FLOAT',
      monsterId: f.monsterId,
      skillKey: f.skillKey,
    });
  }
  for (const log of result.logs) {
    sideEffects.push({ event: 'log:entry', payload: { type: log.type, message: log.message } });
  }
  for (const banner of result.banners) {
    sideEffects.push({ event: 'ui:banner', payload: { text: banner } });
  }

  const patch: Partial<GameState> = {
    activeCards: result.activeCards,
    berserkerSlotUsed: {},
    flashSlotUsed: {},
    rng: result.rng,
  };

  // Apply dragon regen equipment changes
  for (const regen of result.dragonRegenEffects) {
    if (regen.success) {
      const otherItem = regen.otherSlotId === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
      if (otherItem) {
        patch[regen.otherSlotId] = { ...otherItem, durability: regen.newDurability } as GameState['equipmentSlot1'];
      }
    }
  }

  // Wraith destroy amulet
  if (result.wraithDestroyAmulet && state.amuletSlots.length > 0) {
    const [targetIdx, nextRng] = nextInt(state.rng, 0, state.amuletSlots.length - 1);
    patch.rng = nextRng;
    const targetAmulet = state.amuletSlots[targetIdx];
    patch.amuletSlots = state.amuletSlots.filter(a => a.id !== targetAmulet.id);
    // Perm-flagged amulets (附魔祭坛 加 Perm 2 / 凡化咒未剥离) must route to the
    // permanent magic recycle bag instead of vanishing — mirrors the destruction
    // routing for Perm-tagged equipment in `equipment-effects.ts` and
    // `cards.ts:reduceDisposeEquipmentCard`. Non-Perm amulets keep the original
    // "vanish on wraith curse" behavior (no graveyard entry).
    if (cardHasPermFlag(targetAmulet)) {
      enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card: targetAmulet });
    }
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `诅咒：摧毁了护符「${targetAmulet.name}」！` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `诅咒！护符「${targetAmulet.name}」被摧毁！` } });
    sideEffects.push({ event: 'equipment:destroyed', payload: { slotId: `amulet-${targetAmulet.id}`, cardId: targetAmulet.id } });
  }

  // Wraith enrage: emit side effects for beginCombat calls
  if (result.monstersToEngage.length > 0) {
    for (const m of result.monstersToEngage) {
      sideEffects.push({ event: 'combat:autoEngage', payload: { monsterId: m.id, monsterName: m.name } });
    }
    const names = result.monstersToEngage.map(m => m.name);
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `诅咒：激活行怪物被激怒！（${names.join('、')}）` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: '诅咒！全体怪物激怒！' } });
  }

  // Build the goblin dice queue (疗养 + 窃宝). Each entry is a single D20
  // roll with success threshold = `min(stackCount * 3, 20)` — the actual
  // heal / steal application is deferred to RESOLVE_DICE so the player sees a
  // dice modal for each goblin before the outcome lands.
  const diceQueue: PendingMonsterEndDice[] = [];

  for (const heal of result.goblinStackHealDice) {
    diceQueue.push({
      kind: 'goblin-heal',
      goblinId: heal.goblinId,
      goblinName: heal.goblinName,
      colIndex: heal.colIndex,
      stackCount: heal.stackCount,
      predeterminedRoll: heal.predeterminedRoll,
      threshold: heal.threshold,
      success: heal.success,
      currentLayer: heal.currentLayer,
      maxLayers: heal.maxLayers,
    });
  }

  // Pre-pick the would-be stolen item NOW (before the player sees the dice)
  // so the displayed subtitle ("将偷走 …") matches what RESOLVE_DICE actually
  // applies. We use a separate seeded-RNG cursor so successive goblins don't
  // double-pick the same equipment / amulet within this single turn.
  if (result.goblinStealDice.length > 0) {
    let pickRng = patch.rng ?? result.rng;
    let curEquip1: EquipmentItem | null =
      (patch.equipmentSlot1 as EquipmentItem | null | undefined) ?? state.equipmentSlot1;
    let curEquip2: EquipmentItem | null =
      (patch.equipmentSlot2 as EquipmentItem | null | undefined) ?? state.equipmentSlot2;
    let curAmulets: AmuletItem[] =
      (patch.amuletSlots as AmuletItem[] | undefined) ?? state.amuletSlots;
    let pickRngAdvanced = false;

    for (const steal of result.goblinStealDice) {
      type Candidate =
        | { source: 'equip'; slotId: EquipmentSlotId; item: EquipmentItem }
        | { source: 'amulet'; item: AmuletItem };
      const candidates: Candidate[] = [];
      if (curEquip1) candidates.push({ source: 'equip', slotId: 'equipmentSlot1', item: curEquip1 });
      if (curEquip2) candidates.push({ source: 'equip', slotId: 'equipmentSlot2', item: curEquip2 });
      for (const a of curAmulets) {
        if (a) candidates.push({ source: 'amulet', item: a });
      }

      let pickedSource: 'equip' | 'amulet' | null = null;
      let pickedSlotId: EquipmentSlotId | null = null;
      let pickedItem: GameCardData | null = null;

      // Only advance the pick-RNG when there's actually something to pick.
      // Otherwise we'd waste an RNG step on every empty-loadout turn and
      // desynchronize replays vs. the previous behavior.
      if (steal.success && candidates.length > 0) {
        let pickIdx: number;
        [pickIdx, pickRng] = nextInt(pickRng, 0, candidates.length - 1);
        pickRngAdvanced = true;
        const pick = candidates[pickIdx];
        pickedSource = pick.source;
        pickedItem = pick.item as GameCardData;
        if (pick.source === 'equip') {
          pickedSlotId = pick.slotId;
          if (pick.slotId === 'equipmentSlot1') curEquip1 = null;
          else curEquip2 = null;
        } else {
          curAmulets = curAmulets.filter(a => a.id !== pick.item.id);
        }
      }

      diceQueue.push({
        kind: 'goblin-steal',
        goblinId: steal.goblinId,
        goblinName: steal.goblinName,
        colIndex: steal.colIndex,
        stackCount: steal.stackCount,
        predeterminedRoll: steal.predeterminedRoll,
        threshold: steal.threshold,
        success: steal.success,
        pickedSource,
        pickedSlotId,
        pickedItem,
      });
    }

    if (pickRngAdvanced) {
      patch.rng = pickRng;
    }
  }

  // No dice flows? Fall through to the normal START_TURN enqueue.
  // Wraith-destroyed Perm amulet (`enqueuedActions` may already contain
  // ADD_TO_RECYCLE_BAG) MUST resolve before START_TURN so the recycle bag
  // is populated before the new turn's draw / waterfall logic runs.
  if (diceQueue.length === 0) {
    return applyPatch(state, patch, sideEffects, [...enqueuedActions, { type: 'START_TURN' }]);
  }

  // Stash the queue and emit the first dice event. The pipeline parks at
  // `awaitingDice` until `RESOLVE_DICE` fires (in `economy.ts`), which pops
  // the front entry, applies its effect, then either emits the next dice
  // event or finally enqueues `START_TURN` once the queue is drained.
  // Any ADD_TO_RECYCLE_BAG from wraith curse runs before the dice flow so the
  // recycle bag reflects reality before goblin steal/heal dice resolve.
  patch.pendingMonsterEndDiceQueue = diceQueue;
  patch.phase = 'awaitingDice';
  emitGoblinDiceCheck(diceQueue[0], sideEffects);
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

/**
 * Push the right `combat:goblin*Check` side effect for the given pending dice
 * flow. Used to trigger the initial dice modal at end of monster turn.
 * (`economy.ts` has its own local copy for chaining subsequent dice in the
 * queue — kept duplicated to avoid circular imports between rule modules.)
 */
function emitGoblinDiceCheck(
  flow: PendingMonsterEndDice,
  sideEffects: SideEffect[],
): void {
  if (flow.kind === 'goblin-steal') {
    sideEffects.push({
      event: 'combat:goblinStealCheck',
      payload: {
        monsterId: flow.goblinId,
        monsterName: flow.goblinName,
        stackCount: flow.stackCount,
        threshold: flow.threshold,
        predeterminedRoll: flow.predeterminedRoll,
        stolenItemName: flow.pickedItem?.name ?? null,
      },
    });
  } else {
    sideEffects.push({
      event: 'combat:goblinHealCheck',
      payload: {
        monsterId: flow.goblinId,
        monsterName: flow.goblinName,
        stackCount: flow.stackCount,
        threshold: flow.threshold,
        predeterminedRoll: flow.predeterminedRoll,
        currentLayer: flow.currentLayer,
        maxLayers: flow.maxLayers,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// START_TURN — hero turn begins (after monster turn-end effects)
// ---------------------------------------------------------------------------

function reduceStartTurn(
  state: GameState,
  action: Extract<GameAction, { type: 'START_TURN' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];

  const patch: Partial<GameState> = {
    turnDamageTaken: 0,
    berserkTurnBuff: createEmptyEquipmentBuffState(),
    extraAttackCharges: 0,
    slotExtraAttacks: { equipmentSlot1: 0, equipmentSlot2: 0 },
    berserkerRageActive: false,
    berserkerSlotUsed: {},
    flashSlotUsed: {},
    gambitExtraActive: false,
    gambitSlotUsed: {},
    weaponExtraAttackUsed: {},
    slotBattleSpiritUsed: {},
    doubleNextMagic: false,
    magicCardsPlayedThisTurn: 0,
    damageMagicPlayedThisTurn: 0,
    phase: 'playerInput',
    // 战斗回合中刷新 60s 倒计时（HeroTurnTimer）。START_TURN 仅在 reduceEndTurn
    // 检测到「还有 engaged monster」时才会被 enqueue，所以这里必然处于战斗中。
    playerTurnStartedAt: Date.now(),
  };

  // Apply strength/balance amulet temp bonuses at turn start.
  //
  // SAFETY-NET ONLY: the canonical aura application happens in the waterfall
  // pipeline (APPLY_WATERFALL_EFFECTS / turnBoost discard), which sets
  // `amuletAuraAppliedThisWave = true`. We skip here when the flag is true
  // to avoid stacking — otherwise balance would go from +3/-1 to +6/-2 (and
  // strength from +4/+4 to +8/+8) on every monster→hero turn transition.
  // This branch only fires in edge cases where the flag is still false (e.g.
  // brand-new game before the first waterfall has touched the temp slots).
  if (!action.suppressAmuletReapply && !state.amuletAuraAppliedThisWave) {
    const ae = computeAmuletEffectsForState(state);
    let auraApplied = false;
    if (ae.strengthCount > 0) {
      const n = ae.strengthCount;
      const tempAttack = { ...(state.slotTempAttack ?? {}) };
      tempAttack.equipmentSlot1 = (tempAttack.equipmentSlot1 ?? 0) + 4 * n;
      tempAttack.equipmentSlot2 = (tempAttack.equipmentSlot2 ?? 0) + 4 * n;
      patch.slotTempAttack = tempAttack;
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'amulet', message: `力量护符：所有装备栏临时攻击 +${4 * n}！` },
      });
      auraApplied = true;
    }
    if (ae.balanceCount > 0) {
      const n = ae.balanceCount;
      const tempAttack = patch.slotTempAttack
        ? { ...patch.slotTempAttack }
        : { ...(state.slotTempAttack ?? {}) };
      const tempArmor = { ...(state.slotTempArmor ?? {}) };
      tempAttack.equipmentSlot1 = (tempAttack.equipmentSlot1 ?? 0) + BALANCE_ATTACK_BONUS * n;
      tempAttack.equipmentSlot2 = (tempAttack.equipmentSlot2 ?? 0) - BALANCE_ATTACK_PENALTY * n;
      tempArmor.equipmentSlot1 = (tempArmor.equipmentSlot1 ?? 0) - BALANCE_SHIELD_PENALTY * n;
      tempArmor.equipmentSlot2 = (tempArmor.equipmentSlot2 ?? 0) + BALANCE_SHIELD_BONUS * n;
      patch.slotTempAttack = tempAttack;
      patch.slotTempArmor = tempArmor;
      applySlotArmorBonusDelta(state, 'equipmentSlot1', -BALANCE_SHIELD_PENALTY * n, patch);
      applySlotArmorBonusDelta(state, 'equipmentSlot2', BALANCE_SHIELD_BONUS * n, patch);
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'amulet', message: `均衡护符：左栏临时攻击+${BALANCE_ATTACK_BONUS * n}护甲-${BALANCE_SHIELD_PENALTY * n}，右栏临时护甲+${BALANCE_SHIELD_BONUS * n}攻击-${BALANCE_ATTACK_PENALTY * n}` },
      });
      auraApplied = true;
    }
    if (auraApplied) {
      patch.amuletAuraAppliedThisWave = true;
    }
  }

  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'turn', message: `回合 ${state.turnCount} — 英雄行动阶段` },
  });

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// RESET_TURN_STATE — granular reset (used at waterfall / wave boundary)
// ---------------------------------------------------------------------------

function reduceResetTurnState(state: GameState): ReduceResult {
  return applyPatch(state, {
    turnDamageTaken: 0,
    berserkTurnBuff: createEmptyEquipmentBuffState(),
    extraAttackCharges: 0,
    slotExtraAttacks: { equipmentSlot1: 0, equipmentSlot2: 0 },
    berserkerRageActive: false,
    berserkerSlotUsed: {},
    flashSlotUsed: {},
    gambitExtraActive: false,
    gambitSlotUsed: {},
    weaponExtraAttackUsed: {},
    slotBattleSpiritUsed: {},
    doubleNextMagic: false,
    magicCardsPlayedThisTurn: 0,
    damageMagicPlayedThisTurn: 0,
  });
}
