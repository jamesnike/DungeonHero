/**
 * Turn Rules — handles turn-flow actions in the reducer.
 *
 * Covers: START_TURN, END_TURN, ADVANCE_MONSTER_TURN,
 * APPLY_MONSTER_TURN_END_EFFECTS, ENTER_PLAYER_INPUT, RESET_TURN_STATE.
 *
 * Delegates heavy computation to the existing pure functions in combat.ts.
 */

import type { GameState } from '../types';
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
} from '../constants';
import { computeAmuletEffects } from '../equipment';
import { computeAmuletAuraReversal } from '../helpers';
import type { RngState } from '../rng';
import { nextInt } from '../rng';
import type { GameCardData } from '@/components/GameCard';
import type { EquipmentItem, AmuletItem, EquipmentSlotId } from '@/components/game-board/types';

export function reduceTurnActions(state: GameState, action: GameAction): ReduceResult | null {
  switch (action.type) {
    case 'END_TURN':
      return reduceEndTurn(state, action);
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
  };

  // If combat ended (no engaged monsters), no need to advance
  if (result.combatState.engagedMonsterIds.length === 0) {
    return applyPatch(state, {
      ...patch,
      phase: 'playerInput',
    }, sideEffects);
  }

  // Enqueue the monster turn advancement
  return applyPatch(state, patch, sideEffects, [
    { type: 'ADVANCE_MONSTER_TURN' },
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
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `怨灵诅咒：摧毁了护符「${targetAmulet.name}」！` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `怨灵诅咒！护符「${targetAmulet.name}」被摧毁！` } });
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
      payload: { type: 'combat', message: `怨灵诅咒：激活行怪物被激怒！（${names.join('、')}）` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: '怨灵诅咒！全体怪物激怒！' } });
  }

  // Goblin "窃宝": for each successful 15% roll, pick one of the player's
  // currently-equipped equipment / amulet uniformly at random, remove it
  // (reversing amulet aura if applicable), and stack it under the goblin
  // (so the existing stack-pop mechanism returns it as a dungeon card on
  // the goblin's death).
  if (result.goblinStealTargets.length > 0) {
    let stealRng = patch.rng ?? result.rng;
    let curEquip1: EquipmentItem | null =
      (patch.equipmentSlot1 as EquipmentItem | null | undefined) ?? state.equipmentSlot1;
    let curEquip2: EquipmentItem | null =
      (patch.equipmentSlot2 as EquipmentItem | null | undefined) ?? state.equipmentSlot2;
    let curAmulets: AmuletItem[] =
      (patch.amuletSlots as AmuletItem[] | undefined) ?? state.amuletSlots;
    let curStacks: Record<number, GameCardData[]> =
      (patch.activeCardStacks as Record<number, GameCardData[]> | undefined) ?? state.activeCardStacks;
    let tempAttack = patch.slotTempAttack ?? state.slotTempAttack ?? { equipmentSlot1: 0, equipmentSlot2: 0 };
    let tempArmor = patch.slotTempArmor ?? state.slotTempArmor ?? { equipmentSlot1: 0, equipmentSlot2: 0 };
    let mutated = false;

    for (const steal of result.goblinStealTargets) {
      type Candidate =
        | { source: 'equip'; slotId: EquipmentSlotId; item: EquipmentItem }
        | { source: 'amulet'; item: AmuletItem };
      const candidates: Candidate[] = [];
      if (curEquip1) candidates.push({ source: 'equip', slotId: 'equipmentSlot1', item: curEquip1 });
      if (curEquip2) candidates.push({ source: 'equip', slotId: 'equipmentSlot2', item: curEquip2 });
      for (const a of curAmulets) {
        if (a) candidates.push({ source: 'amulet', item: a });
      }
      if (candidates.length === 0) break;

      let pickIdx: number;
      [pickIdx, stealRng] = nextInt(stealRng, 0, candidates.length - 1);
      const pick = candidates[pickIdx];

      if (pick.source === 'equip') {
        if (pick.slotId === 'equipmentSlot1') curEquip1 = null;
        else curEquip2 = null;
      } else {
        const reversal = computeAmuletAuraReversal([pick.item]);
        tempAttack = {
          equipmentSlot1: (tempAttack.equipmentSlot1 ?? 0) + reversal.tempAttackDelta.equipmentSlot1,
          equipmentSlot2: (tempAttack.equipmentSlot2 ?? 0) + reversal.tempAttackDelta.equipmentSlot2,
        };
        tempArmor = {
          equipmentSlot1: (tempArmor.equipmentSlot1 ?? 0) + reversal.tempArmorDelta.equipmentSlot1,
          equipmentSlot2: (tempArmor.equipmentSlot2 ?? 0) + reversal.tempArmorDelta.equipmentSlot2,
        };
        curAmulets = curAmulets.filter(a => a.id !== pick.item.id);
      }

      const stolenCard = pick.item as GameCardData;
      const prevStack = curStacks[steal.colIndex] ?? [];
      curStacks = { ...curStacks, [steal.colIndex]: [...prevStack, stolenCard] };
      mutated = true;

      const labelKind = pick.source === 'equip' ? '装备' : '护符';
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'combat', message: `${steal.goblinName} 窃宝：偷走了${labelKind}「${stolenCard.name}」！` },
      });
      sideEffects.push({
        event: 'ui:banner',
        payload: { text: `${steal.goblinName} 窃宝！偷走了「${stolenCard.name}」！` },
      });
      sideEffects.push({
        event: 'combat:goblinStealCard',
        payload: { monsterId: steal.goblinId, monsterName: steal.goblinName, card: stolenCard },
      });
    }

    if (mutated) {
      patch.equipmentSlot1 = curEquip1;
      patch.equipmentSlot2 = curEquip2;
      patch.amuletSlots = curAmulets;
      patch.activeCardStacks = curStacks;
      patch.slotTempAttack = tempAttack;
      patch.slotTempArmor = tempArmor;
      patch.rng = stealRng;
    }
  }

  // Enqueue START_TURN after monster turn-end effects
  return applyPatch(state, patch, sideEffects, [{ type: 'START_TURN' }]);
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
    const ae = computeAmuletEffects(state.amuletSlots as import('@/components/GameCard').GameCardData[]);
    let auraApplied = false;
    if (ae.hasStrength) {
      const tempAttack = { ...(state.slotTempAttack ?? {}) };
      tempAttack.equipmentSlot1 = (tempAttack.equipmentSlot1 ?? 0) + 4;
      tempAttack.equipmentSlot2 = (tempAttack.equipmentSlot2 ?? 0) + 4;
      patch.slotTempAttack = tempAttack;
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'amulet', message: '力量护符：所有装备栏临时攻击 +4！' },
      });
      auraApplied = true;
    }
    if (ae.hasBalance) {
      const tempAttack = patch.slotTempAttack
        ? { ...patch.slotTempAttack }
        : { ...(state.slotTempAttack ?? {}) };
      const tempArmor = { ...(state.slotTempArmor ?? {}) };
      tempAttack.equipmentSlot1 = (tempAttack.equipmentSlot1 ?? 0) + BALANCE_ATTACK_BONUS;
      tempAttack.equipmentSlot2 = (tempAttack.equipmentSlot2 ?? 0) - BALANCE_ATTACK_PENALTY;
      tempArmor.equipmentSlot1 = (tempArmor.equipmentSlot1 ?? 0) - BALANCE_SHIELD_PENALTY;
      tempArmor.equipmentSlot2 = (tempArmor.equipmentSlot2 ?? 0) + BALANCE_SHIELD_BONUS;
      patch.slotTempAttack = tempAttack;
      patch.slotTempArmor = tempArmor;
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'amulet', message: '均衡护符：左栏临时攻击+3护甲-1，右栏临时护甲+3攻击-1' },
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
