/**
 * Combat Rules — handles combat-related actions in the reducer.
 *
 * Covers: BEGIN_COMBAT, FINISH_COMBAT, CHECK_BATTLE_END, CHECK_DEATH,
 * APPLY_DAMAGE, HEAL, DEAL_DAMAGE_TO_MONSTER, PERFORM_SHIELD_BASH,
 * PERFORM_HERO_ATTACK, RESOLVE_BLOCK.
 *
 * Delegates heavy computation to existing pure functions in ../combat.ts
 * and ../rules/equipment-effects.ts.
 */

import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ReduceResult, SideEffect } from '../reducer';
import { applyPatch, noChange } from '../reducer';
import { nextInt, nextBool, shuffle as rngShuffle, pickRandom, nextId } from '../rng';
import type { GameCardData } from '@/components/GameCard';
import type { EquipmentSlotId, EquipmentSlotBonusState, ActiveRowSlots, EquipmentItem, AmuletItem, MonsterRewardOption } from '@/components/game-board/types';
import {
  beginCombatPatch,
  finishCombatPatch,
  computeHeal,
  computeMaxHp,
  computeDamage,
  computeOverkill,
  createBossCard,
  damageMonsterWithLayerOverflow,
  isMonsterDefeated,
  applyWraithHauntEffect,
} from '../combat';
import { applyMonsterRage } from '@/lib/monsterRage';
import { createEmptyAmuletEffects, STRENGTH_SELF_DAMAGE, initialCombatState, BASE_BACKPACK_CAPACITY, INITIAL_HP, HAND_LIMIT } from '../constants';
import { computeAmuletEffects } from '../equipment';
import { getEquipmentSlotsWithSuppressedTempAttack, isMonsterMagicImmuneByBuilding } from '../buildingAura';
import { flattenActiveRowSlots, isDamageableTarget, isRecyclableFromHand, applyAmplifyOnCreate } from '../helpers';
import { computeEquipmentBreakEffects, computeDurabilityLossEffects } from './equipment-effects';
import { createBugletCard, createMagicBoltCard, goblinImage, bugletImage } from '../deck';
import { addCardToBackpackPure } from '../cards';
import { generateMonsterRewardOptions, queueMonsterRewardPure } from '../monsters';

export function reduceCombatActions(state: GameState, action: GameAction): ReduceResult | null {
  switch (action.type) {
    case 'BEGIN_COMBAT':
      return reduceBeginCombat(state, action);
    case 'FINISH_COMBAT':
      return reduceFinishCombat(state);
    case 'CHECK_BATTLE_END':
      return reduceCheckBattleEnd(state);
    case 'HEAL':
      return reduceHeal(state, action);
    case 'APPLY_DAMAGE':
      return reduceApplyDamage(state, action);
    case 'DEAL_DAMAGE_TO_MONSTER':
      return reduceDealDamageToMonster(state, action);
    case 'MONSTER_DEFEATED':
      return reduceMonsterDefeated(state, action);
    case 'DECREMENT_FURY':
      return reduceDecrementFury(state, action);
    case 'EXECUTE_LAST_WORDS':
      return reduceExecuteLastWords(state, action);
    case 'APPLY_SHIELD_REFLECT':
      return reduceApplyShieldReflect(state, action);
    case 'APPLY_DRAGON_BREATH_RETALIATION':
      return reduceApplyDragonBreathRetaliation(state, action);
    case 'CHECK_DEATH':
      return reduceCheckDeath(state, action);
    case 'PERFORM_SHIELD_BASH':
      return reducePerformShieldBash(state, action);
    case 'PERFORM_HERO_ATTACK':
      return reducePerformHeroAttack(state, action);
    case 'RESOLVE_BLOCK':
      return reduceResolveBlock(state, action);
    case 'RESET_HERO_TURN_USAGE':
      return applyPatch(state, {
        combatState: {
          ...state.combatState,
          heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
          heroAttacksRemaining: 2,
          heroDamageThisTurn: {},
        },
      });
    case 'DISENGAGE_MONSTER': {
      const remaining = state.combatState.engagedMonsterIds.filter(id => id !== action.monsterId);
      return applyPatch(state, {
        combatState: remaining.length === 0
          ? { ...initialCombatState }
          : { ...state.combatState, engagedMonsterIds: remaining },
      });
    }

    case 'RESET_BERSERKER_SLOT':
      return applyPatch(state, { berserkerSlotUsed: {} });

    case 'SET_GAMBIT_STATE':
      return applyPatch(state, { gambitExtraPerSlot: action.extraPerSlot, gambitSlotUsed: {} });

    case 'SET_LIFESTEAL_SLOT':
      return applyPatch(state, { nextAttackLifestealSlot: action.slotId });

    case 'SET_HONOR_SWEEP_PENDING':
      return applyPatch(state, { honorSweepUpgradesPending: action.count });

    case 'SET_LAST_PLAYED_CATEGORY':
      return applyPatch(state, { lastPlayedCardCategory: action.category });

    case 'CLAMP_HP':
      return applyPatch(state, { hp: Math.min(action.maxHp, state.hp) });

    case 'INITIATE_WEAPON_ATTACK':
      return reduceInitiateWeaponAttack(state, action);

    case 'APPLY_HERO_KILL_EFFECTS':
      return reduceApplyHeroKillEffects(state, action);

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// BEGIN_COMBAT
// ---------------------------------------------------------------------------

function reduceBeginCombat(
  state: GameState,
  action: Extract<GameAction, { type: 'BEGIN_COMBAT' }>,
): ReduceResult {
  const monster = action.monster;
  if (monster.type === 'building') return noChange(state);

  let rng = state.rng;
  const pendingDefeatIds = new Set<string>();
  const newCombat = beginCombatPatch(
    state.combatState,
    monster,
    action.initiator,
    pendingDefeatIds,
  );

  const sideEffects: SideEffect[] = [
    { event: 'combat:started', payload: { monsterIds: newCombat.engagedMonsterIds } },
  ];

  const patch: Partial<GameState> = {
    combatState: newCombat,
    phase: newCombat.pendingBlock ? 'awaitingBlock' : 'playerInput',
  };

  // Reset slot flags if this is the first engaged monster
  const prevLiveIds = state.combatState.engagedMonsterIds;
  if (prevLiveIds.length === 0) {
    patch.berserkerSlotUsed = {};
    patch.flashSlotUsed = {};
    patch.gambitSlotUsed = {};
    patch.weaponExtraAttackUsed = {};
  }

  sideEffects.push({
    event: 'log:entry',
    payload: {
      type: 'combat',
      message: `与 ${monster.name} 进入战斗（HP: ${monster.hp ?? monster.value}${(monster.currentLayer ?? 1) > 1 ? ` ×${monster.currentLayer}层` : ''}）`,
    },
  });

  const enqueuedActions: GameAction[] = [];

  // Boss graveyard summon
  const alreadyEngaged = prevLiveIds.includes(monster.id);
  if (!alreadyEngaged && monster.bossEnrageGraveyardSummon && monster.bossEnrageGraveyardSummon > 0) {
    const summonCount = monster.bossEnrageGraveyardSummon;
    const graveyardCopy = [...state.discardedCards];
    const bossCol = state.activeCards.findIndex(c => c?.id === monster.id);
    const otherSlots = state.activeCards
      .map((_, i) => i)
      .filter(i => i !== bossCol && i >= 0 && i < state.activeCards.length);

    if (graveyardCopy.length > 0 && otherSlots.length > 0) {
      // Fixed split: up to 2 monsters + up to 2 non-monsters (capped by graveyard supply and free cells).
      const slotsAvailable = Math.min(summonCount, otherSlots.length);
      const monsterTarget = Math.min(2, slotsAvailable);
      const nonMonsterTarget = Math.min(2, slotsAvailable - monsterTarget);

      const graveyardMonsters = graveyardCopy.filter(c => c.type === 'monster');
      const graveyardOthers = graveyardCopy.filter(c => c.type !== 'monster');

      const rawMonsters: import('@/components/GameCard').GameCardData[] = [];
      const monstersToPick = Math.min(monsterTarget, graveyardMonsters.length);
      for (let i = 0; i < monstersToPick; i++) {
        let ri: number;
        [ri, rng] = nextInt(rng, 0, graveyardMonsters.length - 1);
        rawMonsters.push(graveyardMonsters.splice(ri, 1)[0]);
      }

      const rawNonMonsters: import('@/components/GameCard').GameCardData[] = [];
      const nonMonstersToPick = Math.min(nonMonsterTarget, graveyardOthers.length);
      for (let i = 0; i < nonMonstersToPick; i++) {
        let ri: number;
        [ri, rng] = nextInt(rng, 0, graveyardOthers.length - 1);
        rawNonMonsters.push(graveyardOthers.splice(ri, 1)[0]);
      }

      // Re-apply monster rage so summoned monsters scale to the current waterfall level.
      const isQuick = state.gameMode === 'quick';
      const summonedMonsterCards = rawMonsters.map(c => applyMonsterRage(c, state.turnCount, isQuick));
      const summonedNonMonsterCards = rawNonMonsters; // non-monsters unchanged
      const picked = [...summonedMonsterCards, ...summonedNonMonsterCards];

      if (picked.length === 0) return applyPatch(state, { ...patch, rng }, sideEffects, enqueuedActions);

      const pickedIds = new Set(picked.map(c => c.id));
      patch.discardedCards = state.discardedCards.filter(c => !pickedIds.has(c.id));

      const newActiveCards = [...state.activeCards] as typeof state.activeCards;
      const newStacks = { ...state.activeCardStacks };

      // Choose target cells: one cell per monster, plus one shared cell for both non-monsters.
      const cellsNeeded = summonedMonsterCards.length + (summonedNonMonsterCards.length > 0 ? 1 : 0);
      let shuffledOtherSlots: number[];
      [shuffledOtherSlots, rng] = rngShuffle(otherSlots, rng);
      const chosenSlots = shuffledOtherSlots.slice(0, cellsNeeded);

      // Helper: place a card on top of a slot, sinking any existing top into the stack.
      const placeOnTop = (slotIdx: number, card: import('@/components/GameCard').GameCardData) => {
        const existingTop = newActiveCards[slotIdx];
        if (existingTop != null) {
          newStacks[slotIdx] = [...(newStacks[slotIdx] ?? []), existingTop];
        }
        newActiveCards[slotIdx] = card;
      };

      // Place monsters: each on its own cell.
      for (let i = 0; i < summonedMonsterCards.length; i++) {
        placeOnTop(chosenSlots[i], summonedMonsterCards[i]);
      }

      // Place non-monsters: stack BOTH on the last chosen cell (2nd ends up as top).
      const stackSlot = summonedNonMonsterCards.length > 0 ? chosenSlots[summonedMonsterCards.length] : -1;
      for (let i = 0; i < summonedNonMonsterCards.length; i++) {
        placeOnTop(stackSlot, summonedNonMonsterCards[i]);
      }

      patch.activeCards = newActiveCards;
      patch.activeCardStacks = newStacks;

      const names = picked.map(c => `「${c.name}」`).join('、');
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'combat', message: `${monster.name} 亡灵召唤：从坟场召唤了 ${names} 到激活行！` },
      });
      sideEffects.push({ event: 'ui:banner', payload: { text: `${monster.name} 亡灵召唤！从坟场召唤了 ${picked.length} 张牌！` } });
      sideEffects.push({ event: 'combat:graveyardSummon', payload: { slots: chosenSlots, cards: picked } });

      // Force-engage every summoned monster so they enter combat immediately.
      const summonedMonsters = summonedMonsterCards.filter(c => !c.isStunned);
      if (summonedMonsters.length > 0) {
        for (const m of summonedMonsters) {
          sideEffects.push({
            event: 'combat:autoEngage',
            payload: { monsterId: m.id, monsterName: m.name },
          });
        }
        const enrageNames = summonedMonsters.map(m => m.name).join('、');
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'combat', message: `亡灵召唤：被召唤的怪物进入激怒状态！（${enrageNames}）` },
        });
      }
    }
  }

  patch.rng = rng;
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// FINISH_COMBAT
// ---------------------------------------------------------------------------

function reduceFinishCombat(state: GameState): ReduceResult {
  const patch = finishCombatPatch();
  const sideEffects: SideEffect[] = [
    { event: 'combat:finished', payload: { monsterIds: state.combatState.engagedMonsterIds } },
  ];
  return applyPatch(state, { ...patch, phase: 'playerInput' }, sideEffects);
}

// ---------------------------------------------------------------------------
// CHECK_BATTLE_END
// ---------------------------------------------------------------------------

function reduceCheckBattleEnd(state: GameState): ReduceResult {
  if (state.combatState.engagedMonsterIds.length === 0) {
    return {
      state,
      sideEffects: [],
      enqueuedActions: [{ type: 'FINISH_COMBAT' }],
    };
  }
  return noChange(state);
}

// ---------------------------------------------------------------------------
// HEAL
// ---------------------------------------------------------------------------

function reduceHeal(
  state: GameState,
  action: Extract<GameAction, { type: 'HEAL' }>,
): ReduceResult {
  if (!Number.isFinite(state.hp) || !Number.isFinite(action.amount)) {
    console.warn('[reduceHeal] NaN detected BEFORE heal computation:', {
      stateHp: state.hp, amount: action.amount, source: action.source,
      totalHealed: state.totalHealed, healAccumulator: state.healAccumulator,
    });
  }

  const amuletEffects = computeAmuletEffects(state.amuletSlots as GameCardData[]);
  const result = computeHeal(state, action.amount, amuletEffects);

  const sideEffects: SideEffect[] = [
    { event: 'combat:heroHealed', payload: { amount: result.actualHeal, source: action.source } },
  ];

  const safeHp = Number.isFinite(result.hp) ? result.hp : state.hp;
  const patch: Partial<GameState> = {
    hp: Number.isFinite(safeHp) ? safeHp : INITIAL_HP,
    totalHealed: Number.isFinite(result.totalHealed) ? result.totalHealed : 0,
    healAccumulator: Number.isFinite(result.healAccumulator) ? result.healAccumulator : 0,
  };
  if (result.equipmentSlotBonuses) {
    patch.equipmentSlotBonuses = result.equipmentSlotBonuses;
  }

  if (!Number.isFinite(result.hp)) {
    console.warn('[reduceHeal] NaN detected in heal result — sanitized:', {
      resultHp: result.hp, patchHp: patch.hp, source: action.source,
    });
  }

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// APPLY_DAMAGE
// ---------------------------------------------------------------------------

function reduceApplyDamage(
  state: GameState,
  action: Extract<GameAction, { type: 'APPLY_DAMAGE' }>,
): ReduceResult {
  const amuletEffects = computeAmuletEffects(state.amuletSlots as GameCardData[]);

  // Check for death ward cards in hand
  const hasDeathWardCard = (state.handCards as GameCardData[]).some(
    c => c.magicEffect === 'death-ward' || (c as any).knightEffect === 'death-ward',
  );

  const result = computeDamage(state, action.amount, amuletEffects, hasDeathWardCard, {
    selfInflicted: action.selfInflicted,
  });

  const sideEffects: SideEffect[] = [
    { event: 'combat:heroDamaged', payload: { damage: result.appliedDamage, source: action.source } },
  ];

  // Hero magic gauge charging tied to damage events:
  //   - holy-light (chargeSource: 'damage-taken') charges on any damage actually applied
  //   - revive-blessing (chargeSource: 'self-damage') charges only when selfInflicted
  if (result.appliedDamage > 0) {
    sideEffects.push({ event: 'combat:addMagicGauge', payload: { gaugeType: 'holy-light', amount: 1 } });
    if (action.selfInflicted) {
      sideEffects.push({ event: 'combat:addMagicGauge', payload: { gaugeType: 'revive-blessing', amount: 1 } });
    }
  }

  // Death ward triggered — pause for player decision
  if (result.needsDeathWard) {
    sideEffects.push({
      event: 'combat:deathWardPrompt',
      payload: { damage: action.amount, source: action.source },
    });
    return applyPatch(state, { phase: 'awaitingDeathWard' as GameState['phase'] }, sideEffects);
  }

  const safeHp = Number.isFinite(result.hp) ? result.hp : state.hp;
  const patch: Partial<GameState> = {
    hp: Number.isFinite(safeHp) ? safeHp : 0,
    tempShield: Number.isFinite(result.tempShield) ? result.tempShield : 0,
    totalDamageTaken: Number.isFinite(result.totalDamageTaken) ? result.totalDamageTaken : 0,
    turnDamageTaken: Number.isFinite(result.turnDamageTaken) ? result.turnDamageTaken : 0,
  };

  if (result.berserkTurnBuff) {
    patch.berserkTurnBuff = result.berserkTurnBuff;
  }

  if (result.gameOver) {
    patch.gameOver = true;
    patch.victory = false;
    sideEffects.push({ event: 'game:over', payload: { victory: false } });
  }

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// DEAL_DAMAGE_TO_MONSTER
//
// Comprehensive spell/skill damage resolution. Handles:
//   - Building magic immunity (curse monument aura)
//   - Spell damage reduction on monster
//   - Swarm buglet shield
//   - Max damage per hit clamping (via damageMonsterWithLayerOverflow)
//   - Overkill lifesteal (enqueues HEAL)
//   - Boss retaliation (enqueues APPLY_DAMAGE)
//   - Golem layer-loss reflect (enqueues APPLY_DAMAGE — no more setTimeout)
//   - Swarm-elite replacement (buglet spawn)
//   - Defeat detection (emits combat:monsterDefeated)
//   - Class damage discover streak counter
// ---------------------------------------------------------------------------

function reduceDealDamageToMonster(
  state: GameState,
  action: Extract<GameAction, { type: 'DEAL_DAMAGE_TO_MONSTER' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};
  let rng = state.rng;

  const activeCards = [...state.activeCards] as ActiveRowSlots;
  const idx = activeCards.findIndex(c => c?.id === action.monsterId);
  if (idx < 0) return noChange(state);

  const monster = activeCards[idx]!;

  // --- Building magic immunity ---
  if (action.isSpellDamage && monster.type === 'monster') {
    if (isMonsterMagicImmuneByBuilding(state.activeCards, state.activeCardStacks ?? {}, idx)) {
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'combat', message: `${monster.name} 受到诅咒碑光环保护，免疫魔法伤害！` },
      });
      return applyPatch(state, {}, sideEffects);
    }
  }

  // --- Spell damage reduction ---
  let effectiveDamage = action.damage;
  if (action.isSpellDamage && monster.spellDamageReduction && !monster.isStunned) {
    effectiveDamage = Math.max(1, Math.floor(effectiveDamage * (1 - monster.spellDamageReduction)));
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `${monster.name} 法术抗性：法术伤害减半（${action.damage} → ${effectiveDamage}）` },
    });
  }

  // --- Swarm buglet shield ---
  if (monster.swarmBugletShield && !monster.isStunned) {
    const hasBuglet = state.activeCards.some(c => c && c.isBuglet);
    if (hasBuglet) {
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'combat', message: `${monster.name} 虫盾共生：场上有小虫子，伤害被完全抵挡！` },
      });
      return applyPatch(state, {}, sideEffects);
    }
  }

  if (effectiveDamage <= 0) return noChange(state);

  // --- Building damage (delegate to separate handling) ---
  if (monster.type === 'building') {
    const updated = damageMonsterWithLayerOverflow(monster, effectiveDamage);
    activeCards[idx] = updated;
    sideEffects.push({
      event: 'combat:monsterDamaged',
      payload: { monsterId: action.monsterId, damage: effectiveDamage, remainingHp: updated.hp ?? 0 },
    });
    sideEffects.push({ event: 'combat:monsterBleed', payload: { monsterId: action.monsterId, delay: 0 } });
    if (isMonsterDefeated(updated)) {
      const { fromSlot: _fs, ...forGy } = updated as GameCardData & { fromSlot?: string };
      const graveyard = [...state.discardedCards as GameCardData[], forGy];
      activeCards[idx] = null;
      sideEffects.push({ event: 'combat:buildingDestroyed', payload: { buildingId: action.monsterId } });
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'combat', message: `「${monster.name}」已被毁坏。` },
      });
      return applyPatch(state, { activeCards: activeCards as GameState['activeCards'], discardedCards: graveyard }, sideEffects);
    }
    return applyPatch(state, { activeCards: activeCards as GameState['activeCards'] }, sideEffects);
  }

  // --- Max damage per hit log ---
  if (monster.maxDamagePerHit && effectiveDamage > monster.maxDamagePerHit && !monster.isStunned) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `${monster.name} 岩石护体：伤害上限 ${monster.maxDamagePerHit}（原始 ${effectiveDamage}）！` },
    });
  }

  // --- Class damage discover streak ---
  sideEffects.push({ event: 'combat:classDamageHit', payload: {} });
  const streak = (state.classDamageDiscoverStreak ?? 0) + 1;
  const hasDiscoverAmulet = (state.amuletSlots as GameCardData[]).some(
    s => s?.amuletEffect === 'damage-class-discover',
  );
  if (hasDiscoverAmulet) {
    const upgradeLevel = (state.amuletSlots as GameCardData[]).find(
      s => s?.amuletEffect === 'damage-class-discover',
    )?.upgradeLevel ?? 0;
    const threshold = upgradeLevel >= 1 ? 3 : 8;
    if (streak >= threshold) {
      patch.classDamageDiscoverStreak = 0;
      sideEffects.push({ event: 'combat:classDamageDiscoverTriggered', payload: { threshold } });
    } else {
      patch.classDamageDiscoverStreak = streak;
    }
  }

  // --- Apply damage ---
  const layersBefore = monster.currentLayer ?? monster.fury ?? 1;
  const updated = damageMonsterWithLayerOverflow(monster, effectiveDamage);
  activeCards[idx] = updated;
  patch.activeCards = activeCards as GameState['activeCards'];

  sideEffects.push({
    event: 'combat:monsterDamaged',
    payload: { monsterId: action.monsterId, damage: effectiveDamage, remainingHp: updated.hp ?? 0 },
  });
  sideEffects.push({ event: 'combat:monsterBleed', payload: { monsterId: action.monsterId, delay: 0 } });

  // --- Landed log message (only fires when damage actually applies; blocked
  // branches like swarmBugletShield / building immunity early-return above) ---
  if (action.landedLogMessage) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'magic', message: action.landedLogMessage },
    });
  }

  // --- Boss retaliation ---
  if (monster.bossRetaliationDamage && monster.bossRetaliationDamage > 0 && !monster.isStunned) {
    enqueuedActions.push({
      type: 'APPLY_DAMAGE',
      amount: monster.bossRetaliationDamage,
      source: 'combat',
    });
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `${monster.name} 反噬：造成 ${monster.bossRetaliationDamage} 点直接伤害！` },
    });
  }

  // --- Dragon breath retaliation (enqueued as sub-action for pipeline resolution) ---
  if (monster.dragonDamageRetaliation && monster.dragonDamageRetaliation > 0 && !monster.isStunned) {
    enqueuedActions.push({
      type: 'APPLY_DRAGON_BREATH_RETALIATION',
      monsterId: action.monsterId,
      monsterName: monster.name,
      damage: monster.dragonDamageRetaliation,
    });
    sideEffects.push({
      event: 'combat:dragonBreathRetaliation',
      payload: { monsterId: action.monsterId, monsterName: monster.name, damage: monster.dragonDamageRetaliation },
    });
  }

  // --- Overkill (always logged so the player can see it triggered, even when
  // no equipment/amulet effect benefits from it) ---
  const ae = computeAmuletEffects(state.amuletSlots as GameCardData[]);
  const effectiveLifesteal = (state.permanentSpellLifesteal ?? 0) + (ae.lifeOverkillBonus ?? 0);
  const overkill = computeOverkill(monster, effectiveDamage);
  if (overkill > 0) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `超杀！${action.source} 对 ${monster.name} 造成 ${overkill} 点超额伤害` },
    });
    if (effectiveLifesteal > 0) {
      enqueuedActions.push({ type: 'HEAL', amount: effectiveLifesteal, source: 'overkill-lifesteal' });
    }
  }

  // --- Defeat vs non-defeat ---
  const monsterDefeated = isMonsterDefeated(updated);

  if (monsterDefeated) {
    sideEffects.push({
      event: 'combat:monsterDefeated',
      payload: { monsterId: action.monsterId, monsterName: monster.name },
    });
    enqueuedActions.push({ type: 'MONSTER_DEFEATED', monsterId: action.monsterId });

    if (monster.monsterSpecial === 'bone-regen' && !monster.isStunned) {
      let regenRoll: number;
      [regenRoll, rng] = nextInt(rng, 1, 20);
      sideEffects.push({
        event: 'combat:boneRegenCheck',
        payload: {
          monsterId: action.monsterId, monsterName: monster.name,
          layersBefore, layersAfter: 0, forced: true,
          predeterminedRoll: regenRoll,
        },
      });
    }
  } else {
    const layersAfter = updated.currentLayer ?? 0;

    // Layer loss tracking
    if (layersAfter < layersBefore) {
      sideEffects.push({ event: 'combat:heroTurnLayerLoss', payload: { monsterId: action.monsterId } });
    }

    // Bleed effect log
    if (monster.bleedEffect && layersAfter < layersBefore && !monster.isStunned) {
      const newAttack = updated.attack ?? updated.value;
      const perLayer = parseInt((monster.bleedEffect ?? '').replace('attack+', ''), 10) || 0;
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'combat', message: `${monster.name} 触发流血：攻击力+${perLayer * (layersBefore - layersAfter)}，当前 ${newAttack}！` },
      });
      sideEffects.push({ event: 'ui:banner', payload: { text: `${monster.name} 流血！攻击力升至 ${newAttack}！` } });
    }

    // Dragon bleed destroy equipment
    if (monster.dragonBleedDestroy && layersAfter < layersBefore && layersAfter > 0 && !monster.isStunned) {
      sideEffects.push({
        event: 'combat:dragonBleedDestroy',
        payload: { monsterName: monster.name, layersRemaining: layersAfter },
      });
    }

    // Bone regen / wraith rebirth — pre-roll D20 in reducer (seeded RNG) and pass
    // the value through the side-effect payload. The UI dice modal animates to
    // this predetermined value; it is no longer a source of randomness.
    // Roll only when the hook would actually trigger the dice (matches the
    // gating in useCombatActions.ts) to avoid wasting RNG advancement.
    if (monster.monsterSpecial === 'bone-regen' && !monster.isStunned
      && layersAfter > 0 && layersAfter < layersBefore) {
      let regenRoll: number;
      [regenRoll, rng] = nextInt(rng, 1, 20);
      sideEffects.push({
        event: 'combat:boneRegenCheck',
        payload: {
          monsterId: action.monsterId, monsterName: monster.name,
          layersBefore, layersAfter, forced: false,
          predeterminedRoll: regenRoll,
        },
      });
    }
    if (monster.monsterSpecial === 'wraith-rebirth' && !monster.isStunned
      && layersAfter === 1 && layersBefore > 1) {
      let rebirthRoll: number;
      [rebirthRoll, rng] = nextInt(rng, 1, 20);
      sideEffects.push({
        event: 'combat:wraithRebirthCheck',
        payload: {
          monsterId: action.monsterId, monsterName: monster.name,
          maxLayers: monster.fury ?? monster.hpLayers ?? 1,
          layersBefore, layersAfter,
          predeterminedRoll: rebirthRoll,
        },
      });
    }

    // Golem layer-loss reflect — deterministic enqueue, no more setTimeout
    if (monster.golemLayerLossReflect && monster.golemLayerLossReflect > 0
      && layersAfter < layersBefore && !monster.isStunned) {
      const totalLostLayers = (monster.fury ?? monster.hpLayers ?? 1) - layersAfter;
      const reflectDmg = monster.golemLayerLossReflect * totalLostLayers;
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: reflectDmg, source: 'combat' });
      sideEffects.push({
        event: 'combat:golemReflect',
        payload: { monsterId: action.monsterId, monsterName: monster.name, damage: reflectDmg },
      });
      sideEffects.push({
        event: 'log:entry',
        payload: {
          type: 'combat',
          message: `${monster.name} 岩层反震：${monster.golemLayerLossReflect}×${totalLostLayers} 已损失血层，对英雄造成 ${reflectDmg} 点伤害！`,
        },
      });
      sideEffects.push({ event: 'ui:banner', payload: { text: `${monster.name} 岩层反震！受到 ${reflectDmg} 点伤害！` } });
    }

    // Swarm-elite — replace a random non-monster board card with buglet
    if (monster.monsterSpecial === 'swarm-elite' && !monster.isStunned) {
      const cards = patch.activeCards ?? activeCards;
      const candidates: number[] = [];
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        if (!c || c.type === 'monster') continue;
        candidates.push(i);
      }
      if (candidates.length > 0) {
        let targetIdx: number;
        [targetIdx, rng] = pickRandom(candidates, rng);
        const replaced = cards[targetIdx]!;
        const newCards = [...cards] as ActiveRowSlots;
        newCards[targetIdx] = applyAmplifyOnCreate(createBugletCard(), state.amplifiedCardBonus);
        patch.activeCards = newCards as GameState['activeCards'];
        sideEffects.push({ event: 'combat:addToGraveyard', payload: { card: replaced } });
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'combat', message: `${monster.name} 虫母：${replaced.name} 被小虫子替换！` },
        });
        sideEffects.push({ event: 'ui:banner', payload: { text: `${monster.name} 虫母：场上一张牌变成了小虫子！` } });
      }
    }
  }

  patch.rng = rng;
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// MONSTER_DEFEATED
//
// Comprehensive monster defeat resolution. Handles all rule outcomes that were
// previously gated behind setTimeout in the hook. Three branches:
//   A) Boss transform (isFinalMonster && !bossPhase) — replaces card with boss
//   B) Revive (hasRevive && !reviveUsed) — restores to 1 layer
//   C) Actual defeat — full cleanup, rewards, combat state, minion buff, etc.
// ---------------------------------------------------------------------------

function reduceMonsterDefeated(
  state: GameState,
  action: Extract<GameAction, { type: 'MONSTER_DEFEATED' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};
  let rng = state.rng;

  const activeCards = [...state.activeCards] as ActiveRowSlots;
  const idx = activeCards.findIndex(c => c?.id === action.monsterId);
  if (idx < 0) return noChange(state);

  const monster = activeCards[idx]!;

  // Re-entry guard: the monster card stays in activeCards for ~950ms while the
  // defeat animation plays. If two enqueue sites (e.g. a combo that both
  // drains a layer and deals damage in one play) both queue MONSTER_DEFEATED
  // for the same id, the second one would re-run Branch C and queue a second
  // reward drop with freshly-generated options. Skip the re-entry here.
  if (monster.defeatProcessed) return noChange(state);

  // ---- Branch A: Boss transform ----
  if (monster.isFinalMonster && !monster.bossPhase && !monster.isStunned) {
    const bossCard = applyAmplifyOnCreate(createBossCard(monster), state.amplifiedCardBonus);
    activeCards[idx] = bossCard;
    patch.activeCards = activeCards as GameState['activeCards'];

    // Remove from engaged (boss re-engages separately)
    const remaining = state.combatState.engagedMonsterIds.filter(id => id !== monster.id);
    patch.combatState = remaining.length === 0
      ? { ...initialCombatState }
      : { ...state.combatState, engagedMonsterIds: remaining };

    patch.heroSkillBanner = `${monster.name} 暴走变身！`;
    sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monster.name} 变身为 Boss！` } });
    sideEffects.push({ event: 'combat:bossTransform', payload: { monsterId: monster.id, originalMonster: monster, bossCard } });

    if (monster.lastWords) {
      sideEffects.push({ event: 'combat:executeLastWords', payload: { monster } });
    }

    patch.rng = rng;
    return applyPatch(state, patch, sideEffects);
  }

  // ---- Branch B: Revive ----
  if (monster.hasRevive && !monster.reviveUsed && !monster.isStunned) {
    const fullHp = monster.maxHp ?? monster.hp ?? monster.value ?? 0;
    const activateNoLayerCost = !!monster.skeletonNoLayerCost;
    const revived: GameCardData = {
      ...monster,
      currentLayer: 1,
      hp: fullHp,
      reviveUsed: true,
      ...(activateNoLayerCost ? { skeletonNoLayerCostActive: true } : {}),
    };
    activeCards[idx] = revived;
    patch.activeCards = activeCards as GameState['activeCards'];
    patch.heroSkillBanner = `${monster.name} 复生了！`;

    sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monster.name} 触发了复生，以 1 血层重新站了起来！` } });
    if (activateNoLayerCost) {
      sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monster.name} 不朽之骨：复生后攻击不再消耗血层！` } });
    }

    if (monster.lastWords) {
      sideEffects.push({ event: 'combat:executeLastWords', payload: { monster } });
    }
    if (monster.skeletonLastWordsDiscard && !monster.lastWords) {
      sideEffects.push({ event: 'combat:executeLastWords', payload: { monster: { ...monster, lastWords: 'discard-hand-1' } } });
    }

    patch.rng = rng;
    return applyPatch(state, patch, sideEffects);
  }

  // ---- Branch C: Actual defeat ----
  // Mark defeat-processed BEFORE any state mutation in this branch so the
  // re-entry guard above bails on any subsequent MONSTER_DEFEATED for this
  // monster while the card is still in `activeCards` waiting for the defeat
  // animation to finish.
  {
    const markedCards = [...activeCards] as ActiveRowSlots;
    markedCards[idx] = { ...monster, defeatProcessed: true } as GameCardData;
    patch.activeCards = markedCards as GameState['activeCards'];
  }

  sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monster.name} 被击败！` } });
  sideEffects.push({ event: 'combat:monsterDefeated', payload: { monsterId: monster.id, monsterName: monster.name } });

  // Execute last words (hook handles the async flow)
  if (monster.lastWords && !monster.isStunned) {
    sideEffects.push({ event: 'combat:executeLastWords', payload: { monster } });
  }
  if (monster.skeletonLastWordsDiscard && !monster.lastWords && !monster.isStunned) {
    sideEffects.push({ event: 'combat:executeLastWords', payload: { monster: { ...monster, lastWords: 'discard-hand-1' } } });
  }

  // Minion buff — search all zones for isMinionCard, apply +1/+1
  if (action.killedByMinion) {
    const hasMinionSkill = state.permanentSkills.includes('summon-minion')
      || state.selectedHeroSkill === 'summon-minion'
      || state.eternalRelics.some(r => r.id === 'summon-minion');

    if (hasMinionSkill) {
      const buffMinion = (card: GameCardData): GameCardData => ({
        ...card,
        attack: (card.attack ?? card.value) + 1,
        value: (card.attack ?? card.value) + 1,
        hp: (card.hp ?? 1) + 1,
        maxHp: (card.maxHp ?? card.hp ?? 1) + 1,
      });

      let found = false;
      const backpack = [...(state.backpackItems as GameCardData[])];
      const bpIdx = backpack.findIndex(c => c.isMinionCard);
      if (bpIdx !== -1) {
        backpack[bpIdx] = buffMinion(backpack[bpIdx]);
        patch.backpackItems = backpack;
        found = true;
      }
      if (!found) {
        const hand = [...(state.handCards as GameCardData[])];
        const hIdx = hand.findIndex(c => c.isMinionCard);
        if (hIdx !== -1) {
          hand[hIdx] = buffMinion(hand[hIdx]);
          patch.handCards = hand;
          found = true;
        }
      }
      if (!found && state.equipmentSlot1 && (state.equipmentSlot1 as GameCardData).isMinionCard) {
        patch.equipmentSlot1 = buffMinion(state.equipmentSlot1 as GameCardData) as typeof state.equipmentSlot1;
        found = true;
      }
      if (!found && state.equipmentSlot2 && (state.equipmentSlot2 as GameCardData).isMinionCard) {
        patch.equipmentSlot2 = buffMinion(state.equipmentSlot2 as GameCardData) as typeof state.equipmentSlot2;
        found = true;
      }
      if (!found) {
        const r1 = [...state.equipmentSlot1Reserve];
        const rIdx1 = r1.findIndex(c => (c as GameCardData).isMinionCard);
        if (rIdx1 !== -1) {
          r1[rIdx1] = buffMinion(r1[rIdx1] as GameCardData) as typeof r1[0];
          patch.equipmentSlot1Reserve = r1;
          found = true;
        }
      }
      if (!found) {
        const r2 = [...state.equipmentSlot2Reserve];
        const rIdx2 = r2.findIndex(c => (c as GameCardData).isMinionCard);
        if (rIdx2 !== -1) {
          r2[rIdx2] = buffMinion(r2[rIdx2] as GameCardData) as typeof r2[0];
          patch.equipmentSlot2Reserve = r2;
          found = true;
        }
      }
      if (found) {
        sideEffects.push({ event: 'log:entry', payload: { type: 'skill', message: '随从成长：攻击 +1、防御 +1' } });
      }
    }
  }

  // Wraith death heal — heal other monsters on the board
  if (monster.wraithDeathHeal && monster.wraithDeathHeal > 0 && !monster.isStunned) {
    const healAmt = monster.wraithDeathHeal;
    const cards = (patch.activeCards ?? activeCards) as ActiveRowSlots;
    const buffedNames: string[] = [];
    const healed = cards.map(c => {
      if (!c || c.id === monster.id || c.type !== 'monster') return c;
      const newHp = Math.min((c.hp ?? 0) + healAmt, (c.maxHp ?? c.hp ?? 0) + healAmt);
      const newMaxHp = Math.max(c.maxHp ?? 0, newHp);
      buffedNames.push(c.name);
      return { ...c, hp: newHp, maxHp: newMaxHp, tempHpBoost: (c.tempHpBoost ?? 0) + healAmt };
    }) as ActiveRowSlots;
    if (buffedNames.length > 0) {
      patch.activeCards = healed as GameState['activeCards'];
      patch.heroSkillBanner = `${monster.name} 怨灵祝福！同行怪物生命 +${healAmt}！`;
      sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monster.name} 怨灵祝福：${buffedNames.join('、')} 生命值 +${healAmt}！` } });
    }
  }

  // Wraith death heal spread
  if (monster.wraithDeathHealSpread && monster.wraithDeathHealSpread > 0 && !monster.isStunned) {
    const healAmt = monster.wraithDeathHealSpread;
    const cards = (patch.activeCards ?? activeCards) as ActiveRowSlots;
    const otherMonsters: { card: GameCardData; idx: number }[] = [];
    const healed = cards.map((c, i) => {
      if (!c || c.id === monster.id || c.type !== 'monster') return c;
      otherMonsters.push({ card: c, idx: i });
      const newHp = Math.min((c.hp ?? 0) + healAmt, (c.maxHp ?? c.hp ?? 0) + healAmt);
      const newMaxHp = Math.max(c.maxHp ?? 0, newHp);
      return { ...c, hp: newHp, maxHp: newMaxHp, tempHpBoost: (c.tempHpBoost ?? 0) + healAmt };
    }) as ActiveRowSlots;
    if (otherMonsters.length > 0) {
      let recipient: { card: GameCardData; idx: number };
      [recipient, rng] = pickRandom(otherMonsters, rng);
      const finalCards = (healed as (GameCardData | null)[]).map(c => {
        if (!c || c.id !== recipient.card.id) return c;
        return { ...c, wraithDeathHealSpread: healAmt };
      }) as ActiveRowSlots;
      patch.activeCards = finalCards as GameState['activeCards'];
      const names = otherMonsters.map(m => m.card.name);
      sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monster.name} 怨灵遗言：${names.join('、')} 生命值 +${healAmt}！` } });
      sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monster.name} 的遗言传递给了 ${recipient.card.name}！` } });
      patch.heroSkillBanner = `${monster.name} 怨灵遗言！同行怪物生命 +${healAmt}，遗言传递给 ${recipient.card.name}！`;
    }
  }

  // Buglet last-words heal — heal other buglets
  if (monster.bugletLastWordsHeal && !monster.isStunned) {
    const cards = (patch.activeCards ?? activeCards) as ActiveRowSlots;
    const healedNames: string[] = [];
    const next = cards.map(c => {
      if (!c || c.id === monster.id || !c.isBuglet || c.type !== 'monster') return c;
      const maxLayers = c.hpLayers ?? c.fury ?? 1;
      const curLayer = c.currentLayer ?? maxLayers;
      if (curLayer >= maxLayers) return c;
      healedNames.push(c.name);
      return { ...c, currentLayer: curLayer + 1 };
    }) as ActiveRowSlots;
    if (healedNames.length > 0) {
      patch.activeCards = next as GameState['activeCards'];
      sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monster.name} 虫群遗念：${healedNames.join('、')} 恢复了1血层！` } });
      patch.heroSkillBanner = `${monster.name} 虫群遗念！其他小虫子恢复1血层！`;
    }
  }

  // ---- Deferred rules (previously inside setTimeout) ----

  // Increment monstersDefeated
  patch.monstersDefeated = state.monstersDefeated + 1;

  // Skeleton re-revive: other skeletons with reviveUsed regain revive
  const reReviveCards = (patch.activeCards ?? activeCards) as ActiveRowSlots;
  let anyReRevived = false;
  const reRevivedCards = reReviveCards.map(c => {
    if (!c || c.id === monster.id || c.type !== 'monster') return c;
    if (c.monsterType === 'Skeleton' && c.skeletonReRevive && c.reviveUsed && !c.isStunned) {
      anyReRevived = true;
      sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${c.name} 亡骨轮回：同行怪物被击败，再次获得复生！` } });
      return { ...c, reviveUsed: false, skeletonNoLayerCostActive: false };
    }
    return c;
  }) as ActiveRowSlots;
  if (anyReRevived) {
    patch.activeCards = reRevivedCards as GameState['activeCards'];
    patch.heroSkillBanner = patch.heroSkillBanner ?? '亡骨轮回！再次获得复生！';
  }

  // Goblin trick card creation
  const latestMonster = ((patch.activeCards ?? activeCards) as ActiveRowSlots).find(c => c?.id === monster.id) ?? monster;
  const shouldFlipGoblin =
    latestMonster.monsterType === 'Goblin' &&
    !latestMonster.goblinHasStolen &&
    Boolean(latestMonster.goblinTrickCarrier);

  if (shouldFlipGoblin) {
    const goblinMagic: GameCardData = {
      id: `goblin-trick-${Date.now()}`,
      type: 'magic',
      name: '哥布林的戏法',
      value: 0,
      image: goblinImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：将所有其他手牌洗入背包，然后从背包抽取等量的牌。',
      description: '使用后将手中所有其他牌（包括非永久牌）洗入背包，再从背包随机抽取相同数量的新牌。',
    };
    patch.backpackItems = [...(patch.backpackItems ?? state.backpackItems) as GameCardData[], goblinMagic];
    sideEffects.push({ event: 'combat:goblinTrickCard', payload: { monster, card: goblinMagic } });
    sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monster.name} 没偷到金币，死后留下了「哥布林的戏法」！` } });
    patch.heroSkillBanner = `${monster.name} 留下了隐藏的「哥布林的戏法」！`;
  }

  // Buglet amulet 5% RNG
  let bugletDrop: boolean;
  [bugletDrop, rng] = nextBool(rng, 0.05);
  if (latestMonster.isBuglet && !state.bugletAmuletObtained && bugletDrop) {
    patch.bugletAmuletObtained = true;
    let bugletAmuletId: string;
    [bugletAmuletId, rng] = nextId(rng, 'buglet-amulet');
    const bugletAmulet: GameCardData = {
      id: bugletAmuletId,
      type: 'amulet',
      name: '虫蜕之冠',
      value: 0,
      image: bugletImage,
      amuletEffect: 'monster-kill-upgrade',
      description: '每击杀 5 个怪物，选择一张牌升级。',
    };
    patch.backpackItems = [...(patch.backpackItems ?? state.backpackItems) as GameCardData[], bugletAmulet];
    sideEffects.push({ event: 'combat:bugletAmuletDrop', payload: { monster, card: bugletAmulet } });
    sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monster.name} 死后蜕变为「虫蜕之冠」护符！` } });
    patch.heroSkillBanner = `${monster.name} 留下了「虫蜕之冠」！`;
  }

  // Monster-kill-upgrade counter
  const ae = computeAmuletEffects(state.amuletSlots as GameCardData[]);
  if (ae.hasMonsterKillUpgrade) {
    const killProgress = (state.monsterKillUpgradeProgress ?? 0) + 1;
    if (killProgress >= 5) {
      patch.monsterKillUpgradeProgress = 0;
      patch.upgradeModalOpen = true;
      patch.amuletSlots = (state.amuletSlots as GameCardData[]).map(slot =>
        slot?.amuletEffect === 'monster-kill-upgrade' ? { ...slot, _counterDisplay: '0/5' } : slot,
      ) as AmuletItem[];
      sideEffects.push({ event: 'log:entry', payload: { type: 'amulet', message: '虫蜕之冠：击杀 5 个怪物，可升级 1 张牌！' } });
      patch.heroSkillBanner = '虫蜕之冠发动：选择一张牌升级！';
    } else {
      patch.monsterKillUpgradeProgress = killProgress;
      patch.amuletSlots = (state.amuletSlots as GameCardData[]).map(slot =>
        slot?.amuletEffect === 'monster-kill-upgrade' ? { ...slot, _counterDisplay: `${killProgress}/5` } : slot,
      ) as AmuletItem[];
    }
  }

  // Reward queue or graveyard. Reuse the cached preview if present (so the
  // actual reward matches what the player saw on click and is stable across
  // undo/redo); otherwise fall back to fresh generation.
  let rewards: MonsterRewardOption[];
  const cachedRewards = state.monsterRewardPreviewCache[monster.id];
  if (cachedRewards) {
    rewards = cachedRewards;
    const { [monster.id]: _consumed, ...restCache } = state.monsterRewardPreviewCache;
    patch.monsterRewardPreviewCache = restCache;
  } else {
    const [generated, rngAfterRewards] = generateMonsterRewardOptions(monster, { ...state, ...patch } as GameState, rng);
    rng = rngAfterRewards;
    patch.rng = rng;
    rewards = generated;
  }
  if (rewards.length > 0) {
    const rewardState = { ...state, ...patch };
    const drop = { monsterInstanceId: monster.id, monsterName: monster.name, monsterCard: monster, options: rewards };
    const rewardPatch = queueMonsterRewardPure(rewardState, drop);
    Object.assign(patch, rewardPatch);
    sideEffects.push({ event: 'combat:monsterRewardQueued', payload: { monsterId: monster.id } });
    enqueuedActions.push({ type: 'DEQUEUE_MONSTER_REWARD' });
  } else {
    const graveyard = [...(patch.discardedCards ?? state.discardedCards) as GameCardData[]];
    const sanitized = { ...monster };
    delete (sanitized as any)._counterDisplay;
    delete (sanitized as any)._flipBackCard;
    graveyard.push(sanitized);
    patch.discardedCards = graveyard;
    sideEffects.push({ event: 'combat:removeAndGraveyard', payload: { monsterId: monster.id, monster } });
  }

  // Combat state cleanup — remove from engaged, clear pending block, etc.
  const combatState = patch.combatState ?? state.combatState;
  const remaining = combatState.engagedMonsterIds.filter(id => id !== monster.id);
  const { [monster.id]: _removedDamage, ...restDamage } = combatState.heroDamageThisTurn;
  const pendingBlock = combatState.pendingBlock?.monsterId === monster.id ? null : combatState.pendingBlock;
  const queue = combatState.monsterAttackQueue.filter(id => id !== monster.id);

  let combatEnded = false;
  if (remaining.length === 0) {
    combatEnded = true;
    patch.combatState = { ...initialCombatState };
  } else {
    patch.combatState = {
      ...combatState,
      engagedMonsterIds: remaining,
      heroDamageThisTurn: restDamage,
      pendingBlock,
      monsterAttackQueue: queue,
    };
  }

  // Combat-end effects
  if (combatEnded) {
    patch.heroStunned = false;
    patch.berserkerSlotUsed = {};
    patch.flashSlotUsed = {};
    patch.gambitSlotUsed = {};
    patch.weaponExtraAttackUsed = {};

    // Flush recycle bag to backpack
    const bag = (patch.permanentMagicRecycleBag ?? state.permanentMagicRecycleBag) as (GameCardData & { _recycleWaits?: number })[];
    if (bag.length > 0) {
      const readyCards: GameCardData[] = [];
      const stillWaiting: (GameCardData & { _recycleWaits?: number })[] = [];
      for (const card of bag) {
        const waits = (card._recycleWaits ?? 1) - 1;
        if (waits <= 0) {
          const { _recycleWaits, ...clean } = card;
          readyCards.push(clean as GameCardData);
        } else {
          stillWaiting.push({ ...card, _recycleWaits: waits });
        }
      }
      const currentBackpack = (patch.backpackItems ?? state.backpackItems) as GameCardData[];
      const cap = Math.max(1, BASE_BACKPACK_CAPACITY + (patch.backpackCapacityModifier ?? state.backpackCapacityModifier));
      const available = Math.max(0, cap - currentBackpack.length);
      const toRestore = readyCards.slice(0, available);
      const overflow = readyCards.slice(available);
      patch.permanentMagicRecycleBag = [...overflow, ...stillWaiting] as GameCardData[];
      if (toRestore.length > 0) {
        patch.backpackItems = [...currentBackpack, ...toRestore];
        sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `战斗结束，回收袋 ${toRestore.length} 张牌洗回背包：${toRestore.map(c => c.name).join('、')}` } });
      }
      if (overflow.length > 0) {
        sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `回收袋 ${overflow.length} 张牌因背包已满留在回收袋：${overflow.map(c => c.name).join('、')}` } });
      }
    }

    sideEffects.push({ event: 'combat:combatEnded', payload: {} });
  }

  patch.rng = rng;
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// DECREMENT_FURY
//
// Monster attack layer cost: currentLayer - 1, defeat if <= 0.
// Handles skeleton no-layer-cost, dragon no-layer-cost, bleed scaling,
// and emits side effects for bone-regen/wraith-rebirth dice.
// ---------------------------------------------------------------------------

function reduceDecrementFury(
  state: GameState,
  action: Extract<GameAction, { type: 'DECREMENT_FURY' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  let rng = state.rng;

  const activeCards = [...state.activeCards] as ActiveRowSlots;
  const idx = activeCards.findIndex(c => c?.id === action.monsterId);
  if (idx < 0) return noChange(state);

  const monster = activeCards[idx]!;

  if (monster.skeletonNoLayerCostActive) {
    sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monster.name} 不朽之骨：攻击不消耗血层！` } });
    return applyPatch(state, {}, sideEffects);
  }

  if (monster.dragonAttackNoLayerCost && monster.dragonNoLayerCostActive && !monster.isStunned) {
    sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monster.name} 龙鳞护体：上回合已掉血层，本次攻击不消耗血层！` } });
    return applyPatch(state, {}, sideEffects);
  }

  const currentLayer = monster.currentLayer ?? monster.hpLayers ?? monster.fury ?? 1;
  const nextLayer = currentLayer - 1;

  if (nextLayer <= 0) {
    enqueuedActions.push({ type: 'MONSTER_DEFEATED', monsterId: action.monsterId });
    if (monster.monsterSpecial === 'bone-regen') {
      let regenRoll: number;
      [regenRoll, rng] = nextInt(rng, 1, 20);
      sideEffects.push({
        event: 'combat:boneRegenCheck',
        payload: {
          monsterId: action.monsterId, monsterName: monster.name,
          layersBefore: currentLayer, layersAfter: 0, forced: true,
          predeterminedRoll: regenRoll,
        },
      });
    }
    return applyPatch(state, { rng }, sideEffects, enqueuedActions);
  }

  let updated: GameCardData;
  if (monster.bleedEffect?.startsWith('attack+')) {
    const perLayer = parseInt(monster.bleedEffect.replace('attack+', ''), 10) || 0;
    const newAttack = (monster.attack ?? monster.value) + perLayer;
    const newValue = monster.value + perLayer;
    updated = {
      ...monster,
      currentLayer: nextLayer,
      hp: monster.maxHp,
      attack: newAttack,
      value: newValue,
      specialAttackBoost: (monster.specialAttackBoost ?? 0) + perLayer,
      tempAttackBoost: (monster.tempAttackBoost ?? 0) + perLayer,
    };
    sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monster.name} 触发流血：攻击力+${perLayer}，当前 ${newAttack}！` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `${monster.name} 流血！攻击力升至 ${newAttack}！` } });
  } else {
    updated = { ...monster, currentLayer: nextLayer, hp: monster.maxHp };
  }

  activeCards[idx] = updated;

  // Pre-roll dice values from seeded RNG for the UI dice modal animation.
  // Roll only when the hook would actually trigger the dice (matches the
  // gating in useCombatActions.ts) to avoid wasting RNG advancement.
  if (monster.monsterSpecial === 'bone-regen'
    && nextLayer > 0 && nextLayer < currentLayer) {
    let regenRoll: number;
    [regenRoll, rng] = nextInt(rng, 1, 20);
    sideEffects.push({
      event: 'combat:boneRegenCheck',
      payload: {
        monsterId: action.monsterId, monsterName: monster.name,
        layersBefore: currentLayer, layersAfter: nextLayer, forced: false,
        predeterminedRoll: regenRoll,
      },
    });
  }
  if (monster.monsterSpecial === 'wraith-rebirth'
    && nextLayer === 1 && currentLayer > 1) {
    let rebirthRoll: number;
    [rebirthRoll, rng] = nextInt(rng, 1, 20);
    sideEffects.push({
      event: 'combat:wraithRebirthCheck',
      payload: {
        monsterId: action.monsterId, monsterName: monster.name,
        maxLayers: monster.fury ?? monster.hpLayers ?? 1,
        layersBefore: currentLayer, layersAfter: nextLayer,
        predeterminedRoll: rebirthRoll,
      },
    });
  }

  return applyPatch(state, { activeCards: activeCards as GameState['activeCards'], rng }, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// EXECUTE_LAST_WORDS
//
// Computes last-words targets and effects:
//   - discard-hand-N: selects random hand cards, emits discard targets
//   - wraith-haunt-N: applies shuffle + attack boost (pure via applyWraithHauntEffect)
// ---------------------------------------------------------------------------

function reduceExecuteLastWords(
  state: GameState,
  action: Extract<GameAction, { type: 'EXECUTE_LAST_WORDS' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};
  let rng = state.rng;
  const effect = action.lastWords;

  const monster = state.activeCards.find(c => c?.id === action.monsterId);
  const monsterName = monster?.name ?? 'Unknown';

  if (effect === 'discard-hand-3' || effect === 'discard-hand-1') {
    const maxDiscard = effect === 'discard-hand-1' ? 1 : 3;
    const fullHand = state.handCards as GameCardData[];
    // Curses are immune to forced discard.
    const currentHand = fullHand.filter(c => c.type !== 'curse');
    const discardCount = Math.min(maxDiscard, currentHand.length);

    if (discardCount <= 0) {
      sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monsterName} 的遗言：随机弃回手牌，但玩家没有可弃的手牌。` } });
      return applyPatch(state, {}, sideEffects);
    }

    const indices = Array.from({ length: currentHand.length }, (_, i) => i);
    let shuffledIndices: number[];
    [shuffledIndices, rng] = rngShuffle(indices, rng);
    const toDiscardIndices = shuffledIndices.slice(0, discardCount);
    const toDiscard = toDiscardIndices.map(i => currentHand[i]);
    const discardIds = new Set(toDiscard.map(c => c.id));
    patch.handCards = fullHand.filter(c => !discardIds.has(c.id));

    // Route each discarded card to recycleBag or graveyard
    const graveyard = [...(state.discardedCards as GameCardData[])];
    const recycleBag = [...(state.permanentMagicRecycleBag as (GameCardData & { _recycleWaits?: number })[])];
    for (const card of toDiscard) {
      if (isRecyclableFromHand(card)) {
        recycleBag.push({ ...card, _recycleWaits: card.recycleDelay ?? 2 } as any);
      } else {
        graveyard.push(card);
      }
    }
    patch.discardedCards = graveyard;
    patch.permanentMagicRecycleBag = recycleBag;
    patch.undoCount = 0;

    const names = toDiscard.map(c => c.name);
    sideEffects.push({
      event: 'combat:lastWordsDiscard',
      payload: { cards: toDiscard, monsterName },
    });
    sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monsterName} 的遗言：随机弃回了 ${discardCount} 张手牌（${names.join('、')}）` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `${monsterName} 的遗言：弃回了 ${names.join('、')}！` } });
  }

  if (effect.startsWith('wraith-haunt-')) {
    const atkBoost = parseInt(effect.replace('wraith-haunt-', ''), 10) || 2;
    const [shuffled, rngAfterWraith] = applyWraithHauntEffect(state.activeCards, action.monsterId, atkBoost, rng);
    patch.activeCards = shuffled as GameState['activeCards'];
    rng = rngAfterWraith;

    const otherMonsters = state.activeCards.filter(c => c && c.id !== action.monsterId && c.type === 'monster');
    const parts: string[] = [];
    if (otherMonsters.length > 0) parts.push(`同行怪物攻击力 +${atkBoost}`);
    parts.push('同行卡牌位置打乱');
    sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monsterName} 的遗言：${parts.join('，')}！` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `${monsterName} 的遗言：${parts.join('，')}！` } });
  }

  patch.rng = rng;
  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// APPLY_SHIELD_REFLECT
//
// Applies shield reflect damage to a monster using the expanded
// DEAL_DAMAGE_TO_MONSTER computation. Handles lifesteal, bleed, defeat,
// and returns boss retaliation intent as a side effect.
// ---------------------------------------------------------------------------

function reduceApplyShieldReflect(
  state: GameState,
  action: Extract<GameAction, { type: 'APPLY_SHIELD_REFLECT' }>,
): ReduceResult {
  if (action.damage <= 0) return noChange(state);

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  let rng = state.rng;

  const activeCards = [...state.activeCards] as ActiveRowSlots;
  const idx = activeCards.findIndex(c => c?.id === action.monsterId);
  if (idx < 0) return noChange(state);

  const monster = activeCards[idx]!;
  if (isMonsterDefeated(monster)) return noChange(state);

  const layersBefore = monster.currentLayer ?? monster.fury ?? 1;
  const updated = damageMonsterWithLayerOverflow(monster, action.damage);
  activeCards[idx] = updated;
  const layersAfter = updated.currentLayer ?? 0;

  sideEffects.push({ event: 'combat:monsterBleed', payload: { monsterId: action.monsterId, delay: 0 } });
  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'combat', message: `${action.sourceName} 反弹了 ${action.damage} 点伤害给 ${monster.name}` },
  });

  // Class damage discover hit
  sideEffects.push({ event: 'combat:classDamageHit', payload: {} });

  // Overkill (always logged, even when no effect benefits from it)
  const ae = computeAmuletEffects(state.amuletSlots as GameCardData[]);
  const effectiveLifesteal = (state.permanentSpellLifesteal ?? 0) + (ae.lifeOverkillBonus ?? 0);
  const overkill = computeOverkill(monster, action.damage);
  if (overkill > 0) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `超杀！${action.sourceName} 对 ${monster.name} 造成 ${overkill} 点超额伤害` },
    });
    if (effectiveLifesteal > 0) {
      enqueuedActions.push({ type: 'HEAL', amount: effectiveLifesteal, source: 'overkill-lifesteal' });
    }
  }

  const defeated = isMonsterDefeated(updated);

  if (defeated) {
    enqueuedActions.push({ type: 'MONSTER_DEFEATED', monsterId: action.monsterId });
    if (monster.monsterSpecial === 'bone-regen' && !monster.isStunned) {
      let regenRoll: number;
      [regenRoll, rng] = nextInt(rng, 1, 20);
      sideEffects.push({
        event: 'combat:boneRegenCheck',
        payload: {
          monsterId: action.monsterId, monsterName: monster.name,
          layersBefore, layersAfter: 0, forced: true,
          predeterminedRoll: regenRoll,
        },
      });
    }
  } else {
    if (layersAfter < layersBefore) {
      sideEffects.push({ event: 'combat:heroTurnLayerLoss', payload: { monsterId: action.monsterId } });

      if (monster.bleedEffect && !monster.isStunned) {
        const newAttack = updated.attack ?? updated.value;
        const perLayer = parseInt((monster.bleedEffect ?? '').replace('attack+', ''), 10) || 0;
        sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monster.name} 触发流血：攻击力+${perLayer * (layersBefore - layersAfter)}，当前 ${newAttack}！` } });
        sideEffects.push({ event: 'ui:banner', payload: { text: `${monster.name} 流血！攻击力升至 ${newAttack}！` } });
      }
      if (monster.dragonBleedDestroy && layersAfter > 0 && !monster.isStunned) {
        sideEffects.push({ event: 'combat:dragonBleedDestroy', payload: { monsterName: monster.name, layersRemaining: layersAfter } });
      }
      if (monster.monsterSpecial === 'bone-regen' && !monster.isStunned
        && layersAfter > 0 && layersAfter < layersBefore) {
        let regenRoll: number;
        [regenRoll, rng] = nextInt(rng, 1, 20);
        sideEffects.push({
          event: 'combat:boneRegenCheck',
          payload: {
            monsterId: action.monsterId, monsterName: monster.name,
            layersBefore, layersAfter, forced: false,
            predeterminedRoll: regenRoll,
          },
        });
      }
      if (monster.monsterSpecial === 'wraith-rebirth' && !monster.isStunned
        && layersAfter === 1 && layersBefore > 1) {
        let rebirthRoll: number;
        [rebirthRoll, rng] = nextInt(rng, 1, 20);
        sideEffects.push({
          event: 'combat:wraithRebirthCheck',
          payload: {
            monsterId: action.monsterId, monsterName: monster.name,
            maxLayers: monster.fury ?? monster.hpLayers ?? 1,
            layersBefore, layersAfter,
            predeterminedRoll: rebirthRoll,
          },
        });
      }
    }

    // Dragon breath retaliation from reflect damage (enqueued as sub-action)
    if (monster.dragonDamageRetaliation && monster.dragonDamageRetaliation > 0 && !monster.isStunned) {
      enqueuedActions.push({
        type: 'APPLY_DRAGON_BREATH_RETALIATION',
        monsterId: action.monsterId,
        monsterName: monster.name,
        damage: monster.dragonDamageRetaliation,
      });
      sideEffects.push({ event: 'combat:dragonBreathRetaliation', payload: { monsterId: action.monsterId, monsterName: monster.name, damage: monster.dragonDamageRetaliation } });
    }

    // Boss retaliation check
    const retDmg = monster.bossRetaliationDamage ?? 0;
    if (retDmg > 0 && !monster.isStunned) {
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: retDmg, source: 'combat' });
      sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monster.name} 反噬：造成 ${retDmg} 点直接伤害！` } });
    }
  }

  return applyPatch(state, { activeCards: activeCards as GameState['activeCards'], rng }, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// APPLY_DRAGON_BREATH_RETALIATION
//
// Dragon breath: pick a random shield slot (or hero if none), compute armor
// damage. Pure state change — animation is a side effect.
// ---------------------------------------------------------------------------

function reduceApplyDragonBreathRetaliation(
  state: GameState,
  action: Extract<GameAction, { type: 'APPLY_DRAGON_BREATH_RETALIATION' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};
  let rng = state.rng;
  const retDmg = action.damage;

  const slots: Array<{ slotId: EquipmentSlotId; item: GameCardData | null }> = [
    { slotId: 'equipmentSlot1', item: state.equipmentSlot1 as GameCardData | null },
    { slotId: 'equipmentSlot2', item: state.equipmentSlot2 as GameCardData | null },
  ];
  const validShields = slots.filter(
    s => s.item && (s.item.type === 'shield' || s.item.type === 'monster'),
  ) as Array<{ slotId: EquipmentSlotId; item: GameCardData }>;

  if (validShields.length > 0) {
    let target: { slotId: EquipmentSlotId; item: GameCardData };
    [target, rng] = pickRandom(validShields, rng);
    const { slotId, item } = target;

    sideEffects.push({ event: 'combat:dragonBreathFx', payload: { monsterId: action.monsterId, targetSlotId: slotId } });

    const isMonsterEquip = item.type === 'monster';
    const baseArmor = isMonsterEquip ? (item.hp ?? item.value) : (item.armorMax ?? item.value);
    const storedArmor = Math.min(item.armor ?? baseArmor, baseArmor);
    const newArmor = Math.max(0, storedArmor - retDmg);

    if (newArmor <= 0) {
      const { armor: _ca, armorBonusDamaged: _cb, ...resetBase } = item;
      patch[slotId] = resetBase as typeof state.equipmentSlot1;
    } else {
      patch[slotId] = { ...item, armor: newArmor } as typeof state.equipmentSlot1;
    }

    const slotLabel = slotId === 'equipmentSlot1' ? '左' : '右';
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `${action.monsterName} 龙息反击：对${slotLabel}装备 ${item.name} 造成 ${retDmg} 点护甲伤害（${storedArmor}→${newArmor}）` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `${action.monsterName} 龙息反击！${item.name} 护甲 -${Math.min(retDmg, storedArmor)}！` } });
  } else {
    sideEffects.push({ event: 'combat:dragonBreathFx', payload: { monsterId: action.monsterId, targetSlotId: 'hero' } });
    enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: retDmg, source: 'combat' });
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `${action.monsterName} 龙息反击：对玩家造成 ${retDmg} 点法术伤害！` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `${action.monsterName} 龙息反击！受到 ${retDmg} 点伤害！` } });
  }

  patch.rng = rng;
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// CHECK_DEATH
// ---------------------------------------------------------------------------

function reduceCheckDeath(
  state: GameState,
  action: Extract<GameAction, { type: 'CHECK_DEATH' }>,
): ReduceResult {
  const monster = state.activeCards.find(c => c?.id === action.targetId);
  if (!monster) return noChange(state);

  if (!isMonsterDefeated(monster)) return noChange(state);

  const sideEffects: SideEffect[] = [
    {
      event: 'combat:monsterDefeated',
      payload: { monsterId: monster.id, monsterName: monster.name },
    },
  ];

  // Remove from engaged list
  const newEngaged = state.combatState.engagedMonsterIds.filter(id => id !== monster.id);
  const newCombat = { ...state.combatState, engagedMonsterIds: newEngaged };

  // Clear pending block if it was this monster
  if (newCombat.pendingBlock?.monsterId === monster.id) {
    newCombat.pendingBlock = null;
  }

  // Remove from attack queue
  newCombat.monsterAttackQueue = newCombat.monsterAttackQueue.filter(id => id !== monster.id);

  const patch: Partial<GameState> = {
    combatState: newCombat,
    monstersDefeated: state.monstersDefeated + 1,
  };

  return applyPatch(state, patch, sideEffects, [{ type: 'CHECK_BATTLE_END' }]);
}

// ---------------------------------------------------------------------------
// PERFORM_SHIELD_BASH
// ---------------------------------------------------------------------------

function getSlotItem(state: GameState, slotId: EquipmentSlotId): GameCardData | null {
  return slotId === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
}

function getSlotBonus(state: GameState, slotId: EquipmentSlotId, type: 'damage' | 'shield'): number {
  return state.equipmentSlotBonuses?.[slotId]?.[type] ?? 0;
}

function reducePerformShieldBash(
  state: GameState,
  action: Extract<GameAction, { type: 'PERFORM_SHIELD_BASH' }>,
): ReduceResult {
  if (state.combatState.currentTurn !== 'hero') return noChange(state);

  const { slotId, targetMonsterId } = action;
  const slotItem = getSlotItem(state, slotId);
  if (!slotItem || slotItem.type !== 'shield' || !slotItem.shieldBashStunRate) return noChange(state);

  const targetMonster = state.activeCards.find(c => c?.id === targetMonsterId);
  if (!targetMonster || targetMonster.type !== 'monster') return noChange(state);

  const ae = computeAmuletEffects(state.amuletSlots as GameCardData[]);
  const baseArmorMax = slotItem.armorMax ?? slotItem.value ?? 0;
  const slotShieldBonus = getSlotBonus(state, slotId, 'shield');
  const permanentBonus = Math.max(0, slotShieldBonus);
  const rawSlotTemp = state.slotTempArmor?.[slotId] ?? 0;
  const armorValue = baseArmorMax + permanentBonus + rawSlotTemp;
  const bashStunChance = slotItem.shieldBashStunRate * armorValue + (ae.stunRateBoost ?? 0);
  const effectiveBashStun = state.stunCap > 0 ? Math.min(bashStunChance, state.stunCap) : bashStunChance;

  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};
  const enqueuedActions: GameAction[] = [];
  let rng = state.rng;

  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'combat', message: `使用 ${slotItem.name} 猛击 ${targetMonster.name}（不造成伤害，${effectiveBashStun}% 击晕）` },
  });
  sideEffects.push({ event: 'combat:weaponSwing', payload: { slotId, delay: 0, echoes: 1 } });

  // Consume attack count (unless unlimited)
  if (!slotItem.shieldBashUnlimited) {
    const newCombat = { ...state.combatState };
    newCombat.heroAttacksRemaining = newCombat.heroAttacksRemaining > 0
      ? Math.max(0, newCombat.heroAttacksRemaining - 1)
      : newCombat.heroAttacksRemaining;
    newCombat.heroAttacksThisTurn = { ...newCombat.heroAttacksThisTurn, [slotId]: true };
    patch.combatState = newCombat;
  }

  // Stun dice check
  if (effectiveBashStun > 0 && !targetMonster.isStunned) {
    const threshold = Math.round((effectiveBashStun / 100) * 20);
    if (threshold > 0) {
      let diceRoll: number;
      if (action.diceRoll != null) {
        diceRoll = action.diceRoll;
      } else {
        [diceRoll, rng] = nextInt(rng, 1, 20);
      }
      sideEffects.push({
        event: 'combat:diceRoll',
        payload: {
          title: targetMonster.name,
          subtitle: '盾击晕眩判定',
          roll: diceRoll,
          threshold,
          success: diceRoll <= threshold,
        },
      });

      // 眩学之符 (stun-attempt-discover): increment per stun-attempt dice roll
      const stunAttemptAmuletBash = (state.amuletSlots as GameCardData[]).find(
        s => s?.amuletEffect === 'stun-attempt-discover',
      );
      if (stunAttemptAmuletBash) {
        const stunAttemptThreshold = 6;
        const stunAttemptProgress = (state.stunAttemptDiscoverProgress ?? 0) + 1;
        if (stunAttemptProgress >= stunAttemptThreshold) {
          patch.stunAttemptDiscoverProgress = 0;
          sideEffects.push({ event: 'combat:stunAttemptDiscoverTriggered', payload: { threshold: stunAttemptThreshold } });
        } else {
          patch.stunAttemptDiscoverProgress = stunAttemptProgress;
        }
      }

      if (diceRoll <= threshold) {
        // Stun success — update monster
        const newActiveCards = [...state.activeCards] as typeof state.activeCards;
        const monsterIdx = newActiveCards.findIndex(c => c?.id === targetMonsterId);
        if (monsterIdx >= 0 && newActiveCards[monsterIdx]) {
          newActiveCards[monsterIdx] = { ...newActiveCards[monsterIdx]!, isStunned: true };
          patch.activeCards = newActiveCards;
        }

        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'combat', message: `${targetMonster.name} 被盾击晕了！下回合无法行动！` },
        });
        sideEffects.push({ event: 'ui:banner', payload: { text: `${targetMonster.name} 被盾击晕！` } });

        // Stun recycle to hand
        if (ae.hasStunRecycleToHand && state.permanentMagicRecycleBag.length > 0) {
          const bag = [...state.permanentMagicRecycleBag];
          const count = Math.min(2, bag.length);
          const pickedCards: GameCardData[] = [];
          for (let i = 0; i < count; i++) {
            let idx: number;
            [idx, rng] = nextInt(rng, 0, bag.length - 1);
            pickedCards.push(bag[idx]);
            bag.splice(idx, 1);
          }
          patch.permanentMagicRecycleBag = bag;
          patch.handCards = [...(state.handCards as GameCardData[]), ...pickedCards];
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'equip', message: `击晕回收：从回收袋取回「${pickedCards.map(c => c.name).join('」「')}」到手牌` },
          });
        }

        // Stun upgrade cap
        if (ae.hasStunUpgradeCap) {
          const nextCap = Math.min(100, state.stunCap + 5);
          patch.stunCap = nextCap;
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'amulet', message: `震慑之符：击晕成功，击晕上限 +5%（当前 ${nextCap}%）` },
          });
        }

        // Stun gold
        if (ae.hasStunGold) {
          enqueuedActions.push({ type: 'MODIFY_GOLD', delta: 10, source: 'amulet-stun-gold' });
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'amulet', message: `雷金护符：击晕成功，金币 +10` },
          });
        }
      }
    }
  }

  // Durability loss
  const weaponDurability = slotItem.durability ?? 1;
  if (weaponDurability <= 1) {
    const breakResult = computeEquipmentBreakEffects(state, slotId, slotItem, ae);
    Object.assign(patch, breakResult.patch);
    rng = breakResult.rng;
    sideEffects.push(...breakResult.sideEffects);
    enqueuedActions.push(...breakResult.enqueuedActions);
    if (breakResult.drawFromBackpack > 0) {
      sideEffects.push({ event: 'equipment:drawFromBackpack', payload: { count: breakResult.drawFromBackpack } });
    }
    if (breakResult.classCardDraw > 0) {
      sideEffects.push({ event: 'equipment:classCardDraw', payload: { count: breakResult.classCardDraw } });
    }
  } else {
    patch[slotId] = { ...slotItem, durability: weaponDurability - 1 } as EquipmentItem;
  }

  patch.rng = rng;
  return applyPatch(state, patch, sideEffects, enqueuedActions.length > 0 ? enqueuedActions : undefined);
}

// ---------------------------------------------------------------------------
// PERFORM_HERO_ATTACK
// ---------------------------------------------------------------------------

function reducePerformHeroAttack(
  state: GameState,
  action: Extract<GameAction, { type: 'PERFORM_HERO_ATTACK' }>,
): ReduceResult {
  const { slotId, targetMonsterId } = action;
  const targetMonster = state.activeCards.find(c => c?.id === targetMonsterId);
  if (!targetMonster) return noChange(state);

  const isBuildingTarget = targetMonster.type === 'building';
  const isBuildingNoEngaged = isBuildingTarget && state.combatState.engagedMonsterIds.length === 0;

  if (!isBuildingNoEngaged && state.combatState.currentTurn !== 'hero') return noChange(state);

  const slotItem = getSlotItem(state, slotId);
  if (!slotItem || (slotItem.type !== 'weapon' && slotItem.type !== 'monster')) return noChange(state);

  const ae = computeAmuletEffects(state.amuletSlots as GameCardData[]);
  const combatState = state.combatState;

  // --- Extra attack eligibility ---
  const slotAlreadyAttacked = combatState.heroAttacksThisTurn[slotId];
  const hasBaseAttack = combatState.heroAttacksRemaining > 0;
  const canUseBerserkerExtra = state.berserkerRageActive && slotAlreadyAttacked && !state.berserkerSlotUsed[slotId];
  const canUseFlashExtra = ae.hasFlash && slotAlreadyAttacked && !state.flashSlotUsed[slotId];
  const canUseGambitExtra = state.gambitExtraActive && slotAlreadyAttacked
    && (state.gambitSlotUsed[slotId] ?? 0) < state.gambitExtraPerSlot;
  const canUseWeaponExtra = !!(slotItem as GameCardData).weaponExtraAttack && slotAlreadyAttacked
    && (state.weaponExtraAttackUsed[slotId] ?? 0) < ((slotItem as GameCardData).weaponExtraAttack ?? 0);
  const battleSpiritBonus = (state.slotBattleSpiritBonus ?? {})[slotId] ?? 0;
  const canUseBattleSpiritExtra = battleSpiritBonus > 0 && slotAlreadyAttacked
    && ((state.slotBattleSpiritUsed ?? {})[slotId] ?? 0) < battleSpiritBonus;
  // 兵器谱 上手/主效果：本回合该装备栏额外攻击次数（独立于全局 extraAttackCharges）。
  const slotExtraAvailable = ((state.slotExtraAttacks ?? {})[slotId] ?? 0) > 0;
  const canUseSlotExtra = slotExtraAvailable && slotAlreadyAttacked;
  const needsExtraCharge = slotAlreadyAttacked || !hasBaseAttack;

  if (!isBuildingNoEngaged && needsExtraCharge && !canUseBerserkerExtra && !canUseFlashExtra
    && !canUseGambitExtra && !canUseWeaponExtra && !canUseBattleSpiritExtra && !canUseSlotExtra
    && state.extraAttackCharges <= 0) {
    return noChange(state);
  }
  if (!isBuildingNoEngaged && !needsExtraCharge && !hasBaseAttack) return noChange(state);

  const usingBerserkerExtra = !isBuildingNoEngaged && needsExtraCharge && canUseBerserkerExtra;
  const usingFlashExtra = !isBuildingNoEngaged && needsExtraCharge && !usingBerserkerExtra && canUseFlashExtra;
  const usingGambitExtra = !isBuildingNoEngaged && needsExtraCharge && !usingBerserkerExtra && !usingFlashExtra && canUseGambitExtra;
  const usingWeaponExtra = !isBuildingNoEngaged && needsExtraCharge && !usingBerserkerExtra && !usingFlashExtra && !usingGambitExtra && canUseWeaponExtra;
  const usingBattleSpiritExtra = !isBuildingNoEngaged && needsExtraCharge && !usingBerserkerExtra && !usingFlashExtra && !usingGambitExtra && !usingWeaponExtra && canUseBattleSpiritExtra;
  // 优先消耗该栏的 slotExtraAttacks，再考虑全局 extraAttackCharges。
  const usingSlotExtra = !isBuildingNoEngaged && needsExtraCharge && !usingBerserkerExtra && !usingFlashExtra && !usingGambitExtra && !usingWeaponExtra && !usingBattleSpiritExtra && canUseSlotExtra;
  const usingExtraCharge = !isBuildingNoEngaged && needsExtraCharge && !usingBerserkerExtra && !usingFlashExtra && !usingGambitExtra && !usingWeaponExtra && !usingBattleSpiritExtra && !usingSlotExtra && state.extraAttackCharges > 0;

  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};
  const enqueuedActions: GameAction[] = [];
  let rng = state.rng;
  const isMonsterEquip = slotItem.type === 'monster';
  const isMinionAttack = isMonsterEquip && !!(slotItem as GameCardData).isMinionCard;

  // --- Damage calculation ---
  const goblinGoldPowerActive = isMonsterEquip && (slotItem as GameCardData).eliteLowGoldPower && (state.gold ?? 0) >= 30;
  const rawWeaponValue = isMonsterEquip ? ((slotItem as GameCardData).attack ?? slotItem.value) : slotItem.value;
  const weaponValue = goblinGoldPowerActive ? rawWeaponValue * 2 : rawWeaponValue;
  const slotDamageBonus = getSlotBonus(state, slotId, 'damage');
  const appliedNextBonus = state.nextWeaponBonus ?? 0;
  const slotBurstBonus = state.slotAttackBursts?.[slotId] ?? 0;
  const tempAttackSuppressed = getEquipmentSlotsWithSuppressedTempAttack(
    state.activeCards,
    state.equipmentSlot1,
    state.equipmentSlot2,
  );
  let slotTempAttackBonus = state.slotTempAttack?.[slotId] ?? 0;
  if (tempAttackSuppressed.has(slotId)) slotTempAttackBonus = 0;
  const slotBerserkBonus = state.berserkTurnBuff?.[slotId] ?? 0;
  const baseDamage = Math.max(
    0,
    weaponValue + slotDamageBonus + slotBerserkBonus
      + appliedNextBonus + slotBurstBonus + slotTempAttackBonus,
  );

  // Crit check
  let isCrit = false;
  if ((slotItem as GameCardData).critChance) {
    const threshold = Math.round(((slotItem as GameCardData).critChance! / 100) * 20);
    let critRoll: number;
    [critRoll, rng] = nextInt(rng, 1, 20);
    isCrit = critRoll <= threshold;
    sideEffects.push({
      event: 'combat:diceRoll',
      payload: { title: slotItem.name, subtitle: '暴击判定', roll: critRoll, threshold, success: isCrit },
    });
  }
  if (isMonsterEquip && (slotItem as GameCardData).monsterSpecial === 'ogre-crit') {
    isCrit = true;
  }

  // Pre-roll stun for weapons with `doubleDamageOnStunned` so a stun landing
  // THIS attack can also enable damage doubling. The result is reused by the
  // post-damage stun block so we never roll twice.
  let preRolledStun: { roll: number; threshold: number; effectiveChance: number } | null = null;
  let preRolledStunSuccess = false;
  if ((slotItem as GameCardData).doubleDamageOnStunned && !targetMonster.isStunned) {
    const preStunChanceRaw = ((slotItem as GameCardData).weaponStunChance ?? 0) + (ae.stunRateBoost ?? 0);
    const preStunChance = state.stunCap > 0 ? Math.min(preStunChanceRaw, state.stunCap) : preStunChanceRaw;
    if (preStunChance > 0) {
      const preStunThreshold = Math.round((preStunChance / 100) * 20);
      if (preStunThreshold > 0) {
        let preStunRoll: number;
        [preStunRoll, rng] = nextInt(rng, 1, 20);
        preRolledStunSuccess = preStunRoll <= preStunThreshold;
        preRolledStun = { roll: preStunRoll, threshold: preStunThreshold, effectiveChance: preStunChance };
        sideEffects.push({
          event: 'combat:diceRoll',
          payload: { title: targetMonster.name, subtitle: '击晕判定', roll: preStunRoll, threshold: preStunThreshold, success: preRolledStunSuccess },
        });
      }
    }
  }

  const stunnedDoubleMultiplier = (slotItem as GameCardData).doubleDamageOnStunned
    && (targetMonster.isStunned || preRolledStunSuccess) ? 2 : 1;
  const preFinalDamage = (isCrit ? baseDamage * 2 : baseDamage) * stunnedDoubleMultiplier;
  const finalDamage = ae.hasFlash ? Math.max(0, Math.floor(preFinalDamage / 2)) : preFinalDamage;

  // --- Clear consumed bonuses ---
  if (appliedNextBonus > 0) patch.nextWeaponBonus = 0;
  if (slotBurstBonus > 0) {
    patch.slotAttackBursts = { ...(state.slotAttackBursts ?? {}), [slotId]: 0 };
  }

  // --- Logs ---
  if (goblinGoldPowerActive) {
    sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${slotItem.name} 贪婪强化：金币 ≥ 30，攻击力翻倍！` } });
  }
  if (isCrit) {
    sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `暴击！${slotItem.name} 造成双倍伤害！` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `暴击！双倍伤害！` } });
  }
  if (stunnedDoubleMultiplier > 1) {
    sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${slotItem.name} 对击晕目标造成双倍伤害！` } });
    sideEffects.push({ event: 'ui:banner', payload: { text: `击晕双击！双倍伤害！` } });
  }
  sideEffects.push({
    event: 'log:entry',
    payload: {
      type: 'combat',
      message: `使用 ${slotItem.name}(${slotItem.value}攻) 攻击 ${targetMonster.name}，伤害 ${finalDamage}${ae.hasFlash ? '（闪光减半）' : ''}`,
    },
  });
  sideEffects.push({ event: 'combat:weaponSwing', payload: { slotId, delay: 0, echoes: 2 } });

  // --- Heal on attack ---
  if ((slotItem as GameCardData).healOnAttack) {
    enqueuedActions.push({ type: 'HEAL', amount: (slotItem as GameCardData).healOnAttack!, source: 'heal-on-attack' });
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'heal', message: `${slotItem.name} 攻击恢复了 ${(slotItem as GameCardData).healOnAttack} 点生命` },
    });
  }

  // --- Debuff all monster attack ---
  if ((slotItem as GameCardData).onAttackDebuffAllMonsterAttack) {
    const debuff = (slotItem as GameCardData).onAttackDebuffAllMonsterAttack!;
    const newActiveCards = state.activeCards.map(c => {
      if (!c || c.type !== 'monster') return c;
      const curAtk = c.attack ?? c.value;
      return { ...c, attack: Math.max(0, curAtk - debuff) };
    }) as ActiveRowSlots;
    patch.activeCards = newActiveCards;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `${slotItem.name} 怒斩：所有怪物攻击力 -${debuff}！` },
    });
  }

  // --- Buff other slot ---
  const otherSlotId: EquipmentSlotId = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
  if ((slotItem as GameCardData).onAttackBuffOtherSlotTempAttack) {
    const atkBonus = (slotItem as GameCardData).onAttackBuffOtherSlotTempAttack!;
    patch.slotTempAttack = { ...(state.slotTempAttack ?? {}), [otherSlotId]: ((state.slotTempAttack ?? {})[otherSlotId] ?? 0) + atkBonus };
    const otherLabel = otherSlotId === 'equipmentSlot1' ? '左' : '右';
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 共鸣：${otherLabel}装备栏临时攻击 +${atkBonus}` },
    });
  }
  if ((slotItem as GameCardData).onAttackRepairOtherSlot) {
    const otherItem = getSlotItem(state, otherSlotId);
    if (otherItem && otherItem.durability != null && otherItem.maxDurability != null) {
      const repairAmt = (slotItem as GameCardData).onAttackRepairOtherSlot!;
      const newDur = Math.min(otherItem.maxDurability, otherItem.durability + repairAmt);
      if (newDur > otherItem.durability) {
        patch[otherSlotId] = { ...otherItem, durability: newDur } as EquipmentItem;
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'equip', message: `${slotItem.name} 共鸣：${otherItem.name} 耐久 +${newDur - otherItem.durability}` },
        });
      }
    }
  }

  // --- Amplify 魔弹 + spawn one ---
  // 在装备的 onAttackAmplifyMissileGenerate 触发时：
  //  1. 立刻生成一张「魔弹」（应用当前 amplifiedCardBonus map 的累计值），加入背包。
  //     魔弹是 magic 卡，对背包容量豁免（addCardToBackpackPure → isBackpackRestrictedCard），
  //     不会溢出到回收袋。
  //  2. 入队一个 AMPLIFY_CARDS_BY_NAME，amount=1。drain 阶段执行时，
  //     map 累计 +1，并对所有同名卡（含我们刚加进背包的那张）应用 +1。
  //     最终：新生成的魔弹 amplifyBonus = oldMap + 1，与其它现存「魔弹」一致。
  if ((slotItem as GameCardData).onAttackAmplifyMissileGenerate) {
    const [rawBolt, nextRng] = createMagicBoltCard(rng);
    rng = nextRng;
    patch.rng = rng;
    const bolt = applyAmplifyOnCreate(rawBolt, state.amplifiedCardBonus);
    const addPatch = addCardToBackpackPure(state, bolt);
    if (addPatch.backpackItems) patch.backpackItems = addPatch.backpackItems;
    if (addPatch.permanentMagicRecycleBag) patch.permanentMagicRecycleBag = addPatch.permanentMagicRecycleBag;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name}：所有「魔弹」+1 增幅，并将一张「魔弹」加入背包` },
    });
    enqueuedActions.push({ type: 'AMPLIFY_CARDS_BY_NAME', cardName: '魔弹', amount: 1, source: slotItem.name });
  }

  // --- Deal damage to monster ---
  let workingMonster = targetMonster;
  let monsterDefeated = false;
  let totalRecordedDamage = 0;
  let overkillHitCount = 0;
  const permanentSpellLifesteal = state.permanentSpellLifesteal ?? 0;
  const attackEffectiveLifesteal = permanentSpellLifesteal + (ae.lifeOverkillBonus ?? 0);
  const layersBeforeAttack = targetMonster.currentLayer ?? targetMonster.fury ?? 1;

  totalRecordedDamage += finalDamage;

  if (finalDamage > 0) {
    sideEffects.push({ event: 'combat:classDamageHit', payload: {} });
    const monsterHpBefore = workingMonster.hp ?? workingMonster.value;
    const layerBeforeHit = workingMonster.currentLayer ?? workingMonster.fury ?? 1;
    const updatedMonster = damageMonsterWithLayerOverflow(workingMonster, finalDamage, 1);

    sideEffects.push({ event: 'combat:monsterBleed', payload: { monsterId: targetMonsterId, delay: 0 } });

    // Boss retaliation
    if (!isBuildingTarget && workingMonster.bossRetaliationDamage && workingMonster.bossRetaliationDamage > 0 && !workingMonster.isStunned) {
      enqueuedActions.push({
        type: 'APPLY_DAMAGE',
        amount: workingMonster.bossRetaliationDamage,
        source: 'combat',
      });
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'combat', message: `${targetMonster.name} 反噬：造成 ${workingMonster.bossRetaliationDamage} 点直接伤害！` },
      });
    }

    // Overkill — compute first, log unconditionally so the player can see it
    // happened even when they have no overkill-triggering equipment/amulet.
    if (!isBuildingTarget) {
      const ok = computeOverkill(workingMonster, finalDamage);
      if (ok > 0) {
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'combat', message: `超杀！${slotItem.name} 对 ${targetMonster.name} 造成 ${ok} 点超额伤害` },
        });
        const hasOverkillEffect = attackEffectiveLifesteal > 0
          || (slotItem as GameCardData).overkillDraw
          || (slotItem as GameCardData).overkillRecycleToHand
          || (slotItem as GameCardData).overkillAmplifyMissile;
        if (hasOverkillEffect) overkillHitCount += 1;
      }
    }

    workingMonster = updatedMonster;
    const layerAfterHit = updatedMonster.currentLayer ?? 1;
    const remainingLayers = layerAfterHit;

    // Track layer loss
    if (layerAfterHit < layerBeforeHit) {
      sideEffects.push({ event: 'combat:heroTurnLayerLoss', payload: { monsterId: targetMonsterId } });
    }

    if (remainingLayers <= 0) {
      if (isBuildingTarget) {
        const { fromSlot: _bfs, ...buildingForGy } = targetMonster as GameCardData & { fromSlot?: string };
        const graveyard = [...(patch.discardedCards ?? state.discardedCards) as GameCardData[], buildingForGy];
        patch.discardedCards = graveyard;
        const buildingCards = (patch.activeCards ?? [...state.activeCards]) as ActiveRowSlots;
        const buildingIdx = buildingCards.findIndex(c => c?.id === targetMonster.id);
        if (buildingIdx >= 0) buildingCards[buildingIdx] = null;
        patch.activeCards = buildingCards;
        sideEffects.push({ event: 'combat:buildingDestroyed', payload: { buildingId: targetMonster.id } });
        sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `「${targetMonster.name}」已被毁坏。` } });
        monsterDefeated = true;
      } else if (targetMonster.hasRevive && !targetMonster.reviveUsed) {
        sideEffects.push({ event: 'combat:monsterDefeated', payload: { monsterId: targetMonster.id, monsterName: targetMonster.name } });
        workingMonster = {
          ...workingMonster,
          currentLayer: 1,
          hp: workingMonster.maxHp ?? workingMonster.hp ?? 0,
          reviveUsed: true,
          ...(targetMonster.skeletonNoLayerCost ? { skeletonNoLayerCostActive: true } : {}),
        };

        // Bone regen dice for revived monster
        if (targetMonster.monsterSpecial === 'bone-regen' && !targetMonster.isStunned) {
          let boneRoll: number;
          [boneRoll, rng] = nextInt(rng, 1, 20);
          sideEffects.push({
            event: 'combat:diceRoll',
            payload: { title: targetMonster.name, subtitle: '虚骨再生', roll: boneRoll, threshold: 8, success: boneRoll <= 8 },
          });
          if (boneRoll <= 8) {
            workingMonster = {
              ...workingMonster,
              currentLayer: (workingMonster.currentLayer ?? 0) + 1,
              hp: workingMonster.maxHp ?? workingMonster.hp ?? 0,
            };
            sideEffects.push({
              event: 'log:entry',
              payload: { type: 'combat', message: `${targetMonster.name} 的虚骨再生了一层！` },
            });
            sideEffects.push({ event: 'ui:banner', payload: { text: `${targetMonster.name} 恢复了 1 层血层！` } });
          }
        }
      } else {
        enqueuedActions.push({ type: 'APPLY_HERO_KILL_EFFECTS', monsterHpBefore });
        enqueuedActions.push({ type: 'MONSTER_DEFEATED', monsterId: targetMonster.id });
        sideEffects.push({ event: 'combat:monsterDefeated', payload: { monsterId: targetMonster.id, monsterName: targetMonster.name } });
        monsterDefeated = true;
      }
    }
  }

  // --- Swarm corrode (extra layer removal) ---
  if (!monsterDefeated && isMonsterEquip && (slotItem as GameCardData).swarmCorrode && !isBuildingTarget && targetMonster.type === 'monster') {
    const swarmLayersBefore = workingMonster.currentLayer ?? workingMonster.fury ?? 1;
    if (swarmLayersBefore > 1) {
      const swarmNewLayer = swarmLayersBefore - 1;
      workingMonster = {
        ...workingMonster,
        currentLayer: swarmNewLayer,
        hp: workingMonster.maxHp ?? workingMonster.hp ?? 0,
      };
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${slotItem.name} 虫蚀：${targetMonster.name} 立刻 -1 血层！（剩余 ${swarmNewLayer} 层）` },
      });
      sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 虫蚀！-1 血层！` } });
      sideEffects.push({ event: 'combat:heroTurnLayerLoss', payload: { monsterId: targetMonsterId } });
    } else if (swarmLayersBefore === 1) {
      workingMonster = { ...workingMonster, currentLayer: 0, hp: 0 };
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${slotItem.name} 虫蚀：${targetMonster.name} 最后 1 层被吞噬！` },
      });
      enqueuedActions.push({ type: 'APPLY_HERO_KILL_EFFECTS', monsterHpBefore: workingMonster.hp ?? 0 });
      enqueuedActions.push({ type: 'MONSTER_DEFEATED', monsterId: targetMonster.id });
      sideEffects.push({ event: 'combat:monsterDefeated', payload: { monsterId: targetMonster.id, monsterName: targetMonster.name } });
      monsterDefeated = true;
    }
  }

  // --- Overkill effects ---
  if (overkillHitCount > 0 && attackEffectiveLifesteal > 0) {
    enqueuedActions.push({ type: 'HEAL', amount: attackEffectiveLifesteal * overkillHitCount, source: 'overkill-lifesteal' });
    sideEffects.push({ event: 'log:entry', payload: { type: 'heal', message: `超杀吸血：恢复 ${attackEffectiveLifesteal * overkillHitCount} 生命` } });
  }
  if (overkillHitCount > 0 && (slotItem as GameCardData).overkillDraw) {
    const drawCount = (slotItem as GameCardData).overkillDraw! * overkillHitCount;
    sideEffects.push({ event: 'equipment:drawFromBackpack', payload: { count: drawCount, source: 'overkill' } });
  }
  if (overkillHitCount > 0 && (slotItem as GameCardData).overkillRecycleToHand) {
    const recycleCount = (slotItem as GameCardData).overkillRecycleToHand! * overkillHitCount;
    // Move up to recycleCount cards from the recycle bag into hand. Pick
    // randomly so the choice is non-deterministic in flavour. Cards keep no
    // _recycleWaits once they're back in hand. If hand is full, overflow
    // spills into the backpack (respecting backpack capacity is left to the
    // existing addCard pipeline elsewhere — here we just append, matching the
    // 击晕回收 pattern above).
    const bag = [
      ...((patch.permanentMagicRecycleBag ?? state.permanentMagicRecycleBag) as GameCardData[]),
    ];
    if (bag.length > 0) {
      const pickCount = Math.min(recycleCount, bag.length);
      const picked: GameCardData[] = [];
      for (let i = 0; i < pickCount; i++) {
        let idx: number;
        [idx, rng] = nextInt(rng, 0, bag.length - 1);
        const { _recycleWaits: _omit, ...clean } = bag[idx] as GameCardData & { _recycleWaits?: number };
        picked.push(clean as GameCardData);
        bag.splice(idx, 1);
      }
      patch.permanentMagicRecycleBag = bag;

      const handLimit = HAND_LIMIT + (state.handLimitBonus ?? 0);
      const currentHand = (patch.handCards ?? state.handCards) as GameCardData[];
      const handRoom = Math.max(0, handLimit - currentHand.length);
      const toHand = picked.slice(0, handRoom);
      const overflow = picked.slice(handRoom);

      if (toHand.length > 0) {
        patch.handCards = [...currentHand, ...toHand];
      }
      if (overflow.length > 0) {
        const currentBackpack = (patch.backpackItems ?? state.backpackItems) as GameCardData[];
        patch.backpackItems = [...currentBackpack, ...overflow];
      }

      sideEffects.push({
        event: 'log:entry',
        payload: {
          type: 'equip',
          message: overflow.length > 0
            ? `${slotItem.name} 超杀：从回收袋取回「${picked.map(c => c.name).join('」「')}」（${toHand.length} 入手，${overflow.length} 入背包）`
            : `${slotItem.name} 超杀：从回收袋取回「${picked.map(c => c.name).join('」「')}」到手牌`,
        },
      });
      sideEffects.push({ event: 'equipment:drawFromRecycleBag', payload: { count: toHand.length } });
    }
  }
  if (overkillHitCount > 0 && (slotItem as GameCardData).overkillAmplifyMissile) {
    const amplifyAmount = (slotItem as GameCardData).overkillAmplifyMissile! * overkillHitCount;
    enqueuedActions.push({ type: 'AMPLIFY_CARDS_BY_NAME', cardName: '魔弹', amount: amplifyAmount, source: slotItem.name });
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 超杀：所有「魔弹」+${amplifyAmount} 增幅` },
    });
  }

  // --- Discard empower lifesteal ---
  const discardEmpowerLifestealThisAttack = state.nextAttackLifestealSlot === slotId;
  if (discardEmpowerLifestealThisAttack) {
    const discardHpSum = Math.min(finalDamage, targetMonster.hp ?? targetMonster.value);
    if (discardHpSum > 0) {
      enqueuedActions.push({ type: 'HEAL', amount: discardHpSum, source: 'discard-empower-lifesteal' });
      sideEffects.push({ event: 'log:entry', payload: { type: 'heal', message: `弃牌赋能吸血：恢复 ${discardHpSum} 生命` } });
    }
    patch.nextAttackLifestealSlot = null as unknown as typeof state.nextAttackLifestealSlot;
  }

  // --- Strength self-damage ---
  if (ae.hasStrength) {
    enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: STRENGTH_SELF_DAMAGE, source: 'general', selfInflicted: true });
  }

  // --- Attack persuade discount ---
  if (ae.hasAttackPersuadeDiscount) {
    const existing = state.persuadeDiscount;
    const discountStep = 3;
    const newReduction = (existing?.costReduction ?? 0) + discountStep;
    patch.persuadeDiscount = {
      costReduction: newReduction,
      rateBonus: existing?.rateBonus ?? 0,
    };
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'amulet', message: `降服之符：攻击后下次劝降费用 -${discountStep}（累计 -${newReduction}）` },
    });
    sideEffects.push({ event: 'combat:persuadeDiscountUpdate', payload: { newReduction } });
  }

  // --- Combat state update ---
  const newCombat = { ...combatState };
  if (!isBuildingTarget && !newCombat.engagedMonsterIds.includes(targetMonsterId)) {
    newCombat.engagedMonsterIds = [...newCombat.engagedMonsterIds, targetMonsterId];
  }
  if (!isBuildingNoEngaged && !usingBerserkerExtra && !usingFlashExtra && !usingGambitExtra && !usingWeaponExtra && !usingExtraCharge) {
    newCombat.heroAttacksRemaining = newCombat.heroAttacksRemaining > 0
      ? Math.max(0, newCombat.heroAttacksRemaining - 1)
      : newCombat.heroAttacksRemaining;
  }
  if (!isBuildingNoEngaged) {
    newCombat.heroAttacksThisTurn = { ...newCombat.heroAttacksThisTurn, [slotId]: true };
  }
  newCombat.heroDamageThisTurn = {
    ...newCombat.heroDamageThisTurn,
    [targetMonsterId]: (newCombat.heroDamageThisTurn[targetMonsterId] || 0) + totalRecordedDamage,
  };
  patch.combatState = newCombat;

  // --- Bulwark passive ---
  if ((state.bulwarkPassiveActive ?? 0) > 0) {
    const tempGain = 2 * state.bulwarkPassiveActive!;
    patch.slotTempAttack = { ...(patch.slotTempAttack ?? state.slotTempAttack ?? {}), [slotId]: ((patch.slotTempAttack ?? state.slotTempAttack ?? {})[slotId] ?? 0) + tempGain };
    const label = slotId === 'equipmentSlot1' ? '左' : '右';
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'magic', message: `永恒护符·瀑流铸剑：${label}装备栏临时攻击 +${tempGain}` },
    });
  }

  // --- Consume extra charges ---
  if (usingExtraCharge) {
    patch.extraAttackCharges = state.extraAttackCharges - 1;
  }
  if (usingSlotExtra) {
    const cur = (state.slotExtraAttacks ?? { equipmentSlot1: 0, equipmentSlot2: 0 })[slotId] ?? 0;
    patch.slotExtraAttacks = {
      ...(state.slotExtraAttacks ?? { equipmentSlot1: 0, equipmentSlot2: 0 }),
      [slotId]: Math.max(0, cur - 1),
    };
  }
  if (usingBerserkerExtra) {
    patch.berserkerSlotUsed = { ...state.berserkerSlotUsed, [slotId]: true };
  }
  if (usingFlashExtra) {
    patch.flashSlotUsed = { ...state.flashSlotUsed, [slotId]: true };
  }
  if (usingGambitExtra) {
    patch.gambitSlotUsed = { ...state.gambitSlotUsed, [slotId]: (state.gambitSlotUsed[slotId] ?? 0) + 1 };
  }
  if (usingWeaponExtra) {
    patch.weaponExtraAttackUsed = { ...state.weaponExtraAttackUsed, [slotId]: (state.weaponExtraAttackUsed[slotId] ?? 0) + 1 };
  }
  if (usingBattleSpiritExtra) {
    patch.slotBattleSpiritUsed = { ...(state.slotBattleSpiritUsed ?? {}), [slotId]: ((state.slotBattleSpiritUsed ?? {})[slotId] ?? 0) + 1 };
  }

  // --- Goblin steal gold on attack ---
  if (isMonsterEquip && (slotItem as GameCardData).onAttackEffect?.startsWith('steal-gold-')) {
    const stealAmount = parseInt((slotItem as GameCardData).onAttackEffect!.replace('steal-gold-', ''), 10) || 0;
    if (stealAmount > 0) {
      patch.gold = (state.gold ?? 0) + stealAmount;
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${slotItem.name} 动手偷钱：获得 ${stealAmount} 金币！` },
      });
      sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 偷到了 ${stealAmount} 金币！` } });
      if ((slotItem as GameCardData).goblinStealScale) {
        const updatedAttack = ((slotItem as GameCardData).attack ?? slotItem.value) + stealAmount;
        const updatedHp = ((slotItem as GameCardData).hp ?? 0) + stealAmount;
        patch[slotId] = {
          ...(patch[slotId] ?? slotItem),
          attack: updatedAttack,
          value: updatedAttack,
          hp: updatedHp,
        } as EquipmentItem;
      }
    }
  }

  // --- Weapon durability ---
  let weaponDestroyed = false;
  const killRestoresDurability = monsterDefeated && (slotItem as GameCardData).restoreDurabilityOnKill && !!slotItem.maxDurability;
  if (!state.berserkerRageActive && !(state.unbreakableUntilWaterfall ?? {})[slotId] && !killRestoresDurability) {
    let skipDurabilityLoss = false;

    // Save chance dice
    const saveChance = (slotItem as GameCardData).weaponDurabilitySaveChance;
    if (saveChance && saveChance > 0 && !state.unbreakableNext) {
      const threshold = Math.round((saveChance / 100) * 20);
      let saveRoll: number;
      [saveRoll, rng] = nextInt(rng, 1, 20);
      sideEffects.push({
        event: 'combat:diceRoll',
        payload: { title: slotItem.name, subtitle: '耐久判定', roll: saveRoll, threshold, success: saveRoll <= threshold },
      });
      if (saveRoll <= threshold) {
        skipDurabilityLoss = true;
        sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${slotItem.name} 幸运地保住了耐久！` } });
      }
    }

    // Bone regen dice for equipment durability
    if (!skipDurabilityLoss && isMonsterEquip
      && ((slotItem as GameCardData).monsterSpecial === 'bone-regen' || (slotItem as GameCardData).monsterSpecial === 'skeleton-king')) {
      let boneRoll: number;
      [boneRoll, rng] = nextInt(rng, 1, 20);
      sideEffects.push({
        event: 'combat:diceRoll',
        payload: { title: slotItem.name, subtitle: '虚骨再生判定', roll: boneRoll, threshold: 8, success: boneRoll <= 8 },
      });
      if (boneRoll <= 8) {
        skipDurabilityLoss = true;
        sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${slotItem.name} 虚骨再生：幸运保住了耐久！` } });
        sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 虚骨再生！` } });
      }
    }

    if (!skipDurabilityLoss) {
      const weaponDurability = slotItem.durability ?? 1;
      if (weaponDurability <= 1 && !state.unbreakableNext) {
        weaponDestroyed = true;
        const breakResult = computeEquipmentBreakEffects(state, slotId, slotItem as GameCardData, ae);
        Object.assign(patch, breakResult.patch);
        rng = breakResult.rng;
        sideEffects.push(...breakResult.sideEffects);
        enqueuedActions.push(...breakResult.enqueuedActions);
        if (breakResult.drawFromBackpack > 0) {
          sideEffects.push({ event: 'equipment:drawFromBackpack', payload: { count: breakResult.drawFromBackpack } });
        }
        if (breakResult.classCardDraw > 0) {
          sideEffects.push({ event: 'equipment:classCardDraw', payload: { count: breakResult.classCardDraw } });
        }
        if (!breakResult.revived) {
          weaponDestroyed = true;
        } else {
          weaponDestroyed = false;
        }
      } else {
        const safeDurability = weaponDurability <= 1 ? weaponDurability : weaponDurability - 1;
        const updatedDurability = state.unbreakableNext && weaponDurability <= 1 ? weaponDurability : safeDurability;
        const durabilityActuallyLost = updatedDurability < weaponDurability;

        if (durabilityActuallyLost) {
          const durResult = computeDurabilityLossEffects(state, slotId, slotItem as GameCardData, updatedDurability);
          Object.assign(patch, durResult.patch);
          rng = durResult.rng;
          sideEffects.push(...durResult.sideEffects);
          patch[slotId] = durResult.updatedItem as EquipmentItem;

          if (durResult.golemReflectDamage) {
            enqueuedActions.push({
              type: 'DEAL_DAMAGE_TO_MONSTER',
              monsterId: durResult.golemReflectDamage.targetId,
              damage: durResult.golemReflectDamage.damage,
              source: 'golem-reflect',
            });
            sideEffects.push({
              event: 'combat:shieldReflect',
              payload: { slotId: durResult.golemReflectDamage.slotId, targetId: durResult.golemReflectDamage.targetId },
            });
          }
        } else {
          patch[slotId] = { ...slotItem, durability: updatedDurability } as EquipmentItem;
        }

        if (weaponDurability <= 1 && state.unbreakableNext) {
          patch.unbreakableNext = false;
        }
      }
    }
  }

  // --- Post-attack weapon bonuses ---
  const knightSlotItem = slotItem as GameCardData & { weaponBonus?: number; healOnKill?: number };
  if (knightSlotItem.weaponBonus) {
    const bonuses = patch.equipmentSlotBonuses
      ? { ...(patch.equipmentSlotBonuses as EquipmentSlotBonusState) }
      : { ...state.equipmentSlotBonuses };
    bonuses[slotId] = { ...bonuses[slotId], damage: bonuses[slotId].damage + knightSlotItem.weaponBonus };
    patch.equipmentSlotBonuses = bonuses as EquipmentSlotBonusState;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 永久伤害 +${knightSlotItem.weaponBonus}（该装备栏）` },
    });
  }
  if (monsterDefeated && knightSlotItem.healOnKill) {
    enqueuedActions.push({ type: 'HEAL', amount: knightSlotItem.healOnKill, source: 'heal-on-kill' });
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'heal', message: `${slotItem.name} 击杀回复 ${knightSlotItem.healOnKill} 点生命` },
    });
  }
  if (monsterDefeated && (slotItem as GameCardData).restoreDurabilityOnKill && slotItem.maxDurability) {
    patch[slotId] = { ...(patch[slotId] ?? slotItem), durability: slotItem.maxDurability } as EquipmentItem;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 击杀后耐久度回满！` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 耐久度回满！` } });
  }
  if (monsterDefeated && (slotItem as GameCardData).killGoldScaling) {
    const goldAmount = (slotItem as GameCardData).killGoldCounter ?? 2;
    patch.gold = (patch.gold ?? state.gold ?? 0) + goldAmount;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name} 赏金：击杀获得 ${goldAmount} 金币` },
    });
    if (!weaponDestroyed) {
      const currentItem = patch[slotId] ?? slotItem;
      patch[slotId] = {
        ...currentItem,
        killGoldCounter: goldAmount + 1,
      } as EquipmentItem;
    }
  }

  // --- Minion growth ---
  if (isMinionAttack && monsterDefeated && !weaponDestroyed
    && (state.eternalRelics?.some((r: any) => r.id === 'summon-minion') || state.selectedHeroSkill === 'summon-minion')) {
    const currentItem = (patch[slotId] ?? slotItem) as GameCardData;
    patch[slotId] = {
      ...currentItem,
      attack: (currentItem.attack ?? currentItem.value) + 1,
      value: (currentItem.attack ?? currentItem.value) + 1,
      hp: (currentItem.hp ?? 1) + 1,
      maxHp: (currentItem.maxHp ?? currentItem.hp ?? 1) + 1,
    } as EquipmentItem;
    sideEffects.push({ event: 'log:entry', payload: { type: 'skill', message: '随从成长：攻击 +1、防御 +1' } });
  }

  // --- Persuade boost on hit ---
  if (!monsterDefeated && targetMonster.type === 'monster' && (slotItem as GameCardData).persuadeBoostOnHit) {
    const isTargetElite = Boolean(targetMonster.monsterSpecial);
    const actualBoost = isTargetElite
      ? ((slotItem as GameCardData).persuadeBoostOnHitElite ?? Math.floor((slotItem as GameCardData).persuadeBoostOnHit! / 2))
      : (slotItem as GameCardData).persuadeBoostOnHit!;
    const newBonus = (state.persuadeAmuletBonus ?? 0) + actualBoost;
    patch.persuadeAmuletBonus = newBonus;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `${slotItem.name}：下次劝降概率 +${actualBoost}%（累计 +${newBonus}%）${isTargetElite ? '（精英减半）' : ''}` },
    });
  }

  // --- Update monster or handle defeat ---
  if (!monsterDefeated) {
    const monsterActiveCards = (patch.activeCards ?? [...state.activeCards]) as ActiveRowSlots;
    const monsterIdx = monsterActiveCards.findIndex(c => c?.id === targetMonsterId);
    if (monsterIdx >= 0) {
      monsterActiveCards[monsterIdx] = workingMonster;
      patch.activeCards = monsterActiveCards;
    }

    const layersAfterAttack = workingMonster.currentLayer ?? 0;

    // Monster reaction effects
    if (targetMonster.type === 'monster' && !targetMonster.isStunned) {
      // Bleed effect log
      if (targetMonster.bleedEffect && layersAfterAttack < layersBeforeAttack) {
        const newAttack = workingMonster.attack ?? workingMonster.value;
        const perLayer = parseInt((targetMonster.bleedEffect ?? '').replace('attack+', ''), 10) || 0;
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'combat', message: `${targetMonster.name} 触发流血：攻击力+${perLayer * (layersBeforeAttack - layersAfterAttack)}，当前 ${newAttack}！` },
        });
        sideEffects.push({ event: 'ui:banner', payload: { text: `${targetMonster.name} 流血！攻击力升至 ${newAttack}！` } });
      }

      // Dragon breath retaliation
      if (targetMonster.dragonDamageRetaliation && targetMonster.dragonDamageRetaliation > 0) {
        sideEffects.push({
          event: 'combat:dragonBreathRetaliation',
          payload: { monsterId: targetMonsterId, monsterName: targetMonster.name, damage: targetMonster.dragonDamageRetaliation },
        });
      }

      // Dragon bleed destroy equipment
      if (targetMonster.dragonBleedDestroy && layersAfterAttack < layersBeforeAttack && layersAfterAttack > 0) {
        sideEffects.push({
          event: 'combat:dragonBleedDestroy',
          payload: { monsterName: targetMonster.name, layersRemaining: layersAfterAttack },
        });
      }

      // Swarm elite — replace a board card with buglet
      if (targetMonster.monsterSpecial === 'swarm-elite') {
        const candidates: number[] = [];
        const cards = (patch.activeCards ?? state.activeCards) as ActiveRowSlots;
        for (let i = 0; i < cards.length; i++) {
          const c = cards[i];
          if (!c || c.type === 'monster') continue;
          candidates.push(i);
        }
        if (candidates.length > 0) {
          let targetIdx: number;
          [targetIdx, rng] = pickRandom(candidates, rng);
          const replaced = cards[targetIdx]!;
          const newCards = [...cards] as ActiveRowSlots;
          newCards[targetIdx] = applyAmplifyOnCreate(createBugletCard(), state.amplifiedCardBonus);
          patch.activeCards = newCards;
          sideEffects.push({ event: 'combat:addToGraveyard', payload: { card: replaced } });
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'combat', message: `${targetMonster.name} 虫母：${replaced.name} 被小虫子替换！` },
          });
          sideEffects.push({ event: 'ui:banner', payload: { text: `${targetMonster.name} 虫母：场上一张牌变成了小虫子！` } });
        }
      }

      // Weapon stun chance
      const weaponStunChance = preRolledStun
        ? preRolledStun.effectiveChance
        : ((slotItem as GameCardData).weaponStunChance ?? 0) + (ae.stunRateBoost ?? 0);
      const effectiveStunChance = preRolledStun
        ? preRolledStun.effectiveChance
        : (state.stunCap > 0 ? Math.min(weaponStunChance, state.stunCap) : weaponStunChance);
      if (effectiveStunChance > 0 && !workingMonster.isStunned) {
        const stunThreshold = preRolledStun ? preRolledStun.threshold : Math.round((effectiveStunChance / 100) * 20);
        if (stunThreshold > 0) {
          let stunRoll: number;
          if (preRolledStun) {
            // Reuse the pre-attack roll so we don't roll twice. Dice-roll
            // side effect was already emitted before damage calculation.
            stunRoll = preRolledStun.roll;
          } else {
            [stunRoll, rng] = nextInt(rng, 1, 20);
            sideEffects.push({
              event: 'combat:diceRoll',
              payload: { title: targetMonster.name, subtitle: '击晕判定', roll: stunRoll, threshold: stunThreshold, success: stunRoll <= stunThreshold },
            });
          }

          // 眩学之符 (stun-attempt-discover): increment per stun-attempt dice roll
          const stunAttemptAmuletWeapon = (state.amuletSlots as GameCardData[]).find(
            s => s?.amuletEffect === 'stun-attempt-discover',
          );
          if (stunAttemptAmuletWeapon) {
            const stunAttemptThresholdW = 6;
            const stunAttemptProgressW = (patch.stunAttemptDiscoverProgress ?? state.stunAttemptDiscoverProgress ?? 0) + 1;
            if (stunAttemptProgressW >= stunAttemptThresholdW) {
              patch.stunAttemptDiscoverProgress = 0;
              sideEffects.push({ event: 'combat:stunAttemptDiscoverTriggered', payload: { threshold: stunAttemptThresholdW } });
            } else {
              patch.stunAttemptDiscoverProgress = stunAttemptProgressW;
            }
          }

          if (stunRoll <= stunThreshold) {
            const stunCards = (patch.activeCards ?? [...state.activeCards]) as ActiveRowSlots;
            const stunIdx = stunCards.findIndex(c => c?.id === targetMonsterId);
            if (stunIdx >= 0 && stunCards[stunIdx]) {
              stunCards[stunIdx] = { ...stunCards[stunIdx]!, isStunned: true };
              patch.activeCards = stunCards;
            }
            sideEffects.push({
              event: 'log:entry',
              payload: { type: 'combat', message: `${targetMonster.name} 被击晕了！下回合无法行动！` },
            });
            sideEffects.push({ event: 'ui:banner', payload: { text: `${targetMonster.name} 被击晕！` } });

            // Stun recycle to hand
            if (ae.hasStunRecycleToHand && state.permanentMagicRecycleBag.length > 0) {
              const bag = [...state.permanentMagicRecycleBag];
              const count = Math.min(2, bag.length);
              const pickedCards: GameCardData[] = [];
              for (let i = 0; i < count; i++) {
                let idx: number;
                [idx, rng] = nextInt(rng, 0, bag.length - 1);
                pickedCards.push(bag[idx]);
                bag.splice(idx, 1);
              }
              patch.permanentMagicRecycleBag = bag;
              patch.handCards = [...(state.handCards as GameCardData[]), ...pickedCards];
              sideEffects.push({
                event: 'log:entry',
                payload: { type: 'equip', message: `击晕回收：从回收袋取回「${pickedCards.map(c => c.name).join('」「')}」到手牌` },
              });
            }

            // Stun upgrade cap
            if (ae.hasStunUpgradeCap) {
              const nextCap = Math.min(100, (patch.stunCap ?? state.stunCap) + 5);
              patch.stunCap = nextCap;
              sideEffects.push({
                event: 'log:entry',
                payload: { type: 'amulet', message: `震慑之符：击晕成功，击晕上限 +5%（当前 ${nextCap}%）` },
              });
            }

            // Stun gold
            if (ae.hasStunGold) {
              enqueuedActions.push({ type: 'MODIFY_GOLD', delta: 10, source: 'amulet-stun-gold' });
              sideEffects.push({
                event: 'log:entry',
                payload: { type: 'amulet', message: `雷金护符：击晕成功，金币 +10` },
              });
            }
          }
        }
      }
    }
  }

  // --- Goblin stack heal persuade (async in hooks, side effect here) ---
  if (!monsterDefeated && isMonsterEquip && (slotItem as GameCardData).goblinStackHeal && targetMonster.type === 'monster') {
    sideEffects.push({
      event: 'combat:goblinPersuadeAttempt',
      payload: { slotId, monsterId: targetMonsterId, monsterName: targetMonster.name, itemName: slotItem.name },
    });
  }

  // --- Dagger self-destruct discover (async UI flow) ---
  if ((slotItem as GameCardData).daggerSelfDestructDiscover && !weaponDestroyed) {
    // Use the post-attack durability (after the durability tick from this attack).
    // patch[slotId] is set when this attack consumed durability; if the durability
    // save kicked in (skipDurabilityLoss), patch[slotId] is unchanged so we fall
    // back to the original. Either way this reflects "remaining durability after
    // this attack" — i.e. how many discovers self-destruct will grant.
    const postAttackItem = (patch[slotId] ?? slotItem) as GameCardData;
    const remainingDurability = postAttackItem.durability ?? 1;
    sideEffects.push({
      event: 'combat:daggerSelfDestructPrompt',
      payload: { slotId, itemName: slotItem.name, durability: remainingDurability },
    });
  }

  // --- Ghost blade exile ---
  if ((slotItem as GameCardData).ghostBladeExile) {
    sideEffects.push({ event: 'combat:ghostBladeExile', payload: {} });
  }

  // --- Post-attack hand recycle ---
  if ((slotItem as GameCardData).postAttackHandRecycle) {
    sideEffects.push({ event: 'combat:postAttackHandRecycle', payload: { itemName: slotItem.name } });
  }

  // --- Post-attack spell damage ---
  if ((slotItem as GameCardData).postAttackSpellDamage) {
    const boardMonsters = flattenActiveRowSlots((patch.activeCards ?? state.activeCards) as ActiveRowSlots).filter(
      (c): c is GameCardData => isDamageableTarget(c),
    );
    if (boardMonsters.length > 0) {
      let target: GameCardData;
      [target, rng] = pickRandom(boardMonsters, rng);
      const spellDmg = Math.max(0, (slotItem as GameCardData).postAttackSpellDamage! + (state.permanentSpellDamageBonus ?? 0));
      sideEffects.push({ event: 'combat:arcaneBladeSpell', payload: { slotId, targetId: target.id } });
      enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: target.id, damage: spellDmg, source: 'arcane-blade-spell', isSpellDamage: true });
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'combat', message: `${slotItem.name} 附魔：对 ${target.name} 造成 ${spellDmg} 点法术伤害` },
      });
    }
  }

  // --- Elite double attack dice ---
  if (isMonsterEquip && (slotItem as GameCardData).eliteDoubleAttack && !monsterDefeated && targetMonster.type === 'monster') {
    let doubleRoll: number;
    [doubleRoll, rng] = nextInt(rng, 1, 20);
    sideEffects.push({
      event: 'combat:diceRoll',
      payload: { title: slotItem.name, subtitle: '连击判定', roll: doubleRoll, threshold: 10, success: doubleRoll <= 10 },
    });
    if (doubleRoll <= 10) {
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `${slotItem.name} 连击！可以再攻击一次！` },
      });
      sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 连击！额外攻击机会！` } });
      patch.extraAttackCharges = (patch.extraAttackCharges ?? state.extraAttackCharges) + 1;
    }
  }

  // Add magic gauge for berserker
  sideEffects.push({ event: 'combat:addMagicGauge', payload: { gaugeType: 'berserker-rage', amount: 1 } });

  patch.rng = rng;
  return applyPatch(state, patch, sideEffects, enqueuedActions.length > 0 ? enqueuedActions : undefined);
}

// ---------------------------------------------------------------------------
// RESOLVE_BLOCK
// ---------------------------------------------------------------------------

function reduceResolveBlock(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_BLOCK' }>,
): ReduceResult {
  const pendingBlock = state.combatState.pendingBlock;
  if (!pendingBlock) return noChange(state);

  const monster = state.activeCards.find(c => c?.id === pendingBlock.monsterId);
  if (!monster) {
    const newCombat = { ...state.combatState, pendingBlock: null };
    return applyPatch(state, { combatState: newCombat, phase: 'monsterTurn' }, [], [{ type: 'ADVANCE_MONSTER_TURN' }]);
  }

  const ae = computeAmuletEffects(state.amuletSlots as GameCardData[]);
  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};
  const enqueuedActions: GameAction[] = [];
  let rng = state.rng;

  // Ogre crit
  let remainingDamage = pendingBlock.attackValue;
  if (monster.monsterSpecial === 'ogre-crit') {
    let critRoll: number;
    [critRoll, rng] = nextInt(rng, 1, 20);
    sideEffects.push({
      event: 'combat:diceRoll',
      payload: { title: monster.name, subtitle: '暴击判定', roll: critRoll, threshold: 10, success: critRoll <= 10 },
    });
    if (critRoll <= 10) {
      remainingDamage *= 2;
      sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monster.name} 暴击！伤害翻倍为 ${remainingDamage}！` } });
      sideEffects.push({ event: 'ui:banner', payload: { text: `${monster.name} 暴击了！伤害翻倍！` } });
    }
  }

  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'monster', message: `${monster.name} 发动攻击（${remainingDamage}伤害）` },
  });

  let blockedWithShield = false;
  let shieldDurabilityConsumed = false;
  let reflectDmg = 0;
  let reflectSourceName = '';
  let reflectBlockSlotId: EquipmentSlotId | null = null;

  if (action.choice === 'shield' && action.slotId) {
    const blockSlotId = action.slotId;
    const slotItem = getSlotItem(state, blockSlotId);
    const equipBlockBonus = (slotItem as GameCardData)?.equipBlockDurabilityBonus ?? 0;
    const amuletBlockBonus = ae.hasArmorHalveEndure ? 1 : 0;
    const battleSpiritBlockBonus = (state.slotBattleSpiritBonus ?? {})[blockSlotId] ?? 0;
    const blockDurPerSlot = state.blockDurabilityPerSlot ?? 1;
    const durabilityLimitReached = (state.combatState.slotDurabilityUsedThisTurn[blockSlotId] ?? 0) >= (blockDurPerSlot + equipBlockBonus + amuletBlockBonus + battleSpiritBlockBonus);

    if (slotItem && (slotItem.type === 'shield' || slotItem.type === 'monster') && !durabilityLimitReached) {
      blockedWithShield = true;
      const knightShield = slotItem as GameCardData & { knightEffect?: string };
      const isFullBlockShield = knightShield.knightEffect === 'fullBlock';
      const isMonsterEquipShield = slotItem.type === 'monster';

      const slotShieldBonus = getSlotBonus(state, blockSlotId, 'shield');
      const permanentBonus = Math.max(0, slotShieldBonus);
      const rawSlotTemp = state.slotTempArmor?.[blockSlotId] ?? 0;
      const baseArmorMax = slotItem.armorMax ?? slotItem.value;
      const effectiveArmorMax = baseArmorMax + permanentBonus + rawSlotTemp;

      let shieldArmorDepleted = false;
      let workingShieldItem = { ...slotItem };

      sideEffects.push({ event: 'combat:shieldBlock', payload: { slotId: blockSlotId } });

      if (isMonsterEquipShield) {
        const rawBaseArmor = (slotItem as GameCardData).hp ?? slotItem.value;
        const monsterArmorMax = rawBaseArmor;
        const eliteBonus = ((slotItem as GameCardData).eliteLowGoldPower && (state.gold ?? 0) >= 30) ? monsterArmorMax : 0;
        const storedMonsterArmor = Math.min(slotItem.armor ?? monsterArmorMax, monsterArmorMax);
        const existingBonusDamaged = slotItem.armorBonusDamaged ?? 0;
        const monsterBonusTotal = eliteBonus + permanentBonus + rawSlotTemp;
        const monsterBonusRemaining = Math.max(0, monsterBonusTotal - existingBonusDamaged);
        const currentArmor = storedMonsterArmor + monsterBonusRemaining;
        const blocked = Math.min(remainingDamage, currentArmor);
        const golemArmorCap = (slotItem as GameCardData).maxDamagePerHit;
        const effectiveArmorDamage = golemArmorCap != null ? Math.min(blocked, golemArmorCap) : blocked;
        const newArmor = Math.max(0, currentArmor - effectiveArmorDamage);
        shieldArmorDepleted = newArmor <= 0 && effectiveArmorDamage > 0;
        remainingDamage = isFullBlockShield ? 0 : Math.max(0, remainingDamage - currentArmor);

        if (shieldArmorDepleted) {
          const { armor: _clearArmor, armorBonusDamaged: _clearBonusDmg, ...resetBase } = slotItem as any;
          workingShieldItem = resetBase;
        } else {
          const consumeFromBonus = Math.min(effectiveArmorDamage, monsterBonusRemaining);
          const consumeFromBase = effectiveArmorDamage - consumeFromBonus;
          const newBaseArmor = Math.max(0, storedMonsterArmor - consumeFromBase);
          const newBonusDamaged = existingBonusDamaged + consumeFromBonus;
          workingShieldItem = { ...slotItem, armor: newBaseArmor, armorBonusDamaged: newBonusDamaged > 0 ? newBonusDamaged : undefined };
        }

        if (golemArmorCap != null && blocked > golemArmorCap) {
          sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${slotItem.name} 岩石护体：护甲最多掉 ${golemArmorCap}！` } });
        }
        if (isFullBlockShield) {
          sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${slotItem.name} 完全格挡了 ${blocked} 点伤害！（护甲 ${currentArmor}→${newArmor}）` } });
          sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 完全格挡！` } });
        } else if (shieldArmorDepleted) {
          sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${slotItem.name} 格挡了 ${blocked} 点伤害（护甲击破！耐久 -1）` } });
        } else {
          sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${slotItem.name} 格挡了 ${blocked} 点伤害（护甲 ${currentArmor}→${newArmor}）` } });
        }
      } else {
        const storedBaseArmor = Math.min(slotItem.armor ?? baseArmorMax, baseArmorMax);
        const existingBonusDamaged = slotItem.armorBonusDamaged ?? 0;
        const bonusTotal = permanentBonus + rawSlotTemp;
        const bonusRemaining = Math.max(0, bonusTotal - existingBonusDamaged);
        const currentArmor = storedBaseArmor + bonusRemaining;
        const blocked = Math.min(remainingDamage, currentArmor);
        const newArmor = Math.max(0, currentArmor - remainingDamage);
        shieldArmorDepleted = newArmor <= 0 && remainingDamage > 0;
        remainingDamage = isFullBlockShield ? 0 : Math.max(0, remainingDamage - currentArmor);

        if (shieldArmorDepleted) {
          const { armor: _clearArmor, armorBonusDamaged: _clearBonusDmg, ...resetBase } = slotItem as any;
          workingShieldItem = resetBase;
        } else {
          const consumeFromBonus = Math.min(blocked, bonusRemaining);
          const consumeFromBase = blocked - consumeFromBonus;
          const newBaseArmor = Math.max(0, storedBaseArmor - consumeFromBase);
          const newBonusDamaged = existingBonusDamaged + consumeFromBonus;
          workingShieldItem = { ...slotItem, armor: newBaseArmor, armorBonusDamaged: newBonusDamaged > 0 ? newBonusDamaged : undefined };
        }

        if (isFullBlockShield) {
          sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${slotItem.name} 完全格挡了 ${blocked} 点伤害！（护甲 ${currentArmor}→${newArmor}）` } });
          sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 完全格挡！` } });
        } else if (shieldArmorDepleted) {
          sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${slotItem.name} 格挡了 ${blocked} 点伤害（护甲击破！耐久 -1）` } });
        } else {
          sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${slotItem.name} 格挡了 ${blocked} 点伤害（护甲 ${currentArmor}→${newArmor}）` } });
        }
      }

      // Reflect damage
      if ((slotItem as GameCardData).reflectHalfDamage) {
        const slotPermDmg = getSlotBonus(state, blockSlotId, 'damage');
        const slotTempAtk = state.slotTempAttack?.[blockSlotId] ?? 0;
        reflectDmg = Math.ceil(pendingBlock.attackValue / 2) + slotPermDmg + slotTempAtk;
        reflectSourceName = slotItem.name;
        reflectBlockSlotId = blockSlotId;
      } else if ((slotItem as GameCardData).damageReflect && (slotItem as GameCardData).damageReflect! > 0) {
        reflectDmg = (slotItem as GameCardData).damageReflect! + getSlotBonus(state, blockSlotId, 'damage');
        reflectSourceName = slotItem.name;
        reflectBlockSlotId = blockSlotId;
      }

      const isPerfectBlock = isFullBlockShield || remainingDamage === 0;

      // Dual guard: perfect block bonus
      if (isPerfectBlock && ae.hasDualGuard) {
        const bonuses = { ...state.equipmentSlotBonuses };
        bonuses[blockSlotId] = { ...bonuses[blockSlotId], shield: bonuses[blockSlotId].shield + 1 };
        patch.equipmentSlotBonuses = bonuses as EquipmentSlotBonusState;
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'combat', message: `完美格挡！双守护圣盾使该栏永久护甲 +1` },
        });
        sideEffects.push({ event: 'ui:banner', payload: { text: `完美格挡！该装备栏永久护甲 +1！` } });
      }

      // Block grant temp armor to other
      if ((slotItem as GameCardData).blockGrantTempArmorToOther) {
        const otherSlot: EquipmentSlotId = blockSlotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
        const grantAmount = isMonsterEquipShield
          ? ((slotItem as GameCardData).hp ?? slotItem.value) + permanentBonus
          : effectiveArmorMax;
        patch.slotTempArmor = { ...(state.slotTempArmor ?? {}), [otherSlot]: ((state.slotTempArmor ?? {})[otherSlot] ?? 0) + grantAmount };
        const otherSlotLabel = otherSlot === 'equipmentSlot1' ? '左' : '右';
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'combat', message: `${slotItem.name} 守望者链接：${otherSlotLabel}装备栏临时护甲 +${grantAmount}！` },
        });
        sideEffects.push({ event: 'ui:banner', payload: { text: `守望者链接！${otherSlotLabel}装备栏临时护甲 +${grantAmount}！` } });
        if (ae.hasPersuadeOnTempAttack) {
          const pBonus = ae.persuadeOnTempAttackBonus || 10;
          patch.persuadeAmuletBonus = (state.persuadeAmuletBonus ?? 0) + pBonus;
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'equip', message: `怀柔之印：下次劝降率 +${pBonus}%` },
          });
        }
      }

      // Dragon damage retaliation from shield
      if (isMonsterEquipShield && (slotItem as GameCardData).dragonDamageRetaliation && (slotItem as GameCardData).dragonDamageRetaliation! > 0) {
        const boardMonsters = flattenActiveRowSlots(state.activeCards as ActiveRowSlots).filter(
          (c): c is GameCardData => Boolean(c && c.type === 'monster'),
        );
        if (boardMonsters.length > 0) {
          let randomTarget: GameCardData;
          [randomTarget, rng] = pickRandom(boardMonsters, rng);
          sideEffects.push({ event: 'combat:shieldReflect', payload: { slotId: blockSlotId, targetId: randomTarget.id } });
          enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: randomTarget.id, damage: 2, source: 'dragon-breath-reflect' });
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'equip', message: `${slotItem.name} 龙息反击：对 ${randomTarget.name} 造成 2 点伤害！` },
          });
          sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 龙息反击！` } });
        }
      }

      // Shield auto-evolve
      let shieldAutoEvolved = false;
      let evolveBlockCount: number | undefined;
      if ((slotItem as GameCardData).shieldBlockAutoUpgradeCount) {
        evolveBlockCount = (((slotItem as any)._shieldBlockCount ?? 0) + 1);
        if ((evolveBlockCount ?? 0) >= (slotItem as GameCardData).shieldBlockAutoUpgradeCount!) {
          const newArmorMax = (slotItem.armorMax ?? slotItem.value) + 2;
          const { armor: _clearA, armorBonusDamaged: _clearB, ...shieldBase } = slotItem as any;
          const upgradedShield = {
            ...shieldBase,
            value: newArmorMax,
            armorMax: newArmorMax,
            durability: (slotItem.durability ?? 1) + 1,
            maxDurability: (slotItem.maxDurability ?? slotItem.durability ?? 1) + 1,
            _shieldBlockCount: 0,
          };
          patch[blockSlotId] = upgradedShield as EquipmentItem;
          shieldAutoEvolved = true;
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'equip', message: `${slotItem.name} 进化！护甲 +2，耐久 +1，耐久上限 +1！` },
          });
          sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 进化了！` } });
        } else {
          workingShieldItem = { ...workingShieldItem, _shieldBlockCount: evolveBlockCount } as typeof workingShieldItem;
        }
      }

      // Shield durability handling
      if (!shieldAutoEvolved && !(state.unbreakableUntilWaterfall ?? {})[blockSlotId] && shieldArmorDepleted) {
        let skipShieldDurabilityLoss = false;

        // Perfect block save dice
        if (isPerfectBlock && !state.unbreakableNext) {
          const saveChance = (slotItem as GameCardData).shieldPerfectBlockSaveChance;
          if (saveChance && saveChance > 0) {
            const threshold = Math.round((saveChance / 100) * 20);
            let saveRoll: number;
            [saveRoll, rng] = nextInt(rng, 1, 20);
            sideEffects.push({
              event: 'combat:diceRoll',
              payload: { title: slotItem.name, subtitle: '完美格挡 — 耐久判定', roll: saveRoll, threshold, success: saveRoll <= threshold },
            });
            if (saveRoll <= threshold) {
              skipShieldDurabilityLoss = true;
              sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${slotItem.name} 完美格挡，幸运保住了耐久！` } });
            }
          }
        }

        // Bone regen for shield
        if (!skipShieldDurabilityLoss && isMonsterEquipShield
          && ((slotItem as GameCardData).monsterSpecial === 'bone-regen' || (slotItem as GameCardData).monsterSpecial === 'skeleton-king')) {
          let boneRoll: number;
          [boneRoll, rng] = nextInt(rng, 1, 20);
          sideEffects.push({
            event: 'combat:diceRoll',
            payload: { title: slotItem.name, subtitle: '虚骨再生判定', roll: boneRoll, threshold: 8, success: boneRoll <= 8 },
          });
          if (boneRoll <= 8) {
            skipShieldDurabilityLoss = true;
            sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${slotItem.name} 虚骨再生：幸运保住了耐久！` } });
            sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 虚骨再生！` } });
          }
        }

        // Buglet shield
        if (!skipShieldDurabilityLoss && isMonsterEquipShield && (slotItem as GameCardData).swarmBugletShield) {
          const otherBugletSlotId: EquipmentSlotId = blockSlotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
          const otherBugletItem = getSlotItem(state, otherBugletSlotId);
          if (otherBugletItem && otherBugletItem.type === 'monster' && (otherBugletItem as GameCardData).isBuglet) {
            skipShieldDurabilityLoss = true;
            sideEffects.push({ event: 'log:entry', payload: { type: 'equip', message: `${slotItem.name} 虫盾共生：另一装备栏有小虫子，耐久不减！` } });
            sideEffects.push({ event: 'ui:banner', payload: { text: `${slotItem.name} 虫盾共生！` } });
          }
        }

        // Extra blocks per durability
        let extraBlockCounterPatch: Record<string, number> = {};
        const totalExtraBlocks = (slotItem as GameCardData).shieldExtraBlocksPerDurability ?? 0;
        if (!skipShieldDurabilityLoss && totalExtraBlocks > 0) {
          const counter = ((slotItem as any)._shieldDurabilityBlockCounter ?? 0) + 1;
          if (counter <= totalExtraBlocks) {
            skipShieldDurabilityLoss = true;
            const { armor: _resetA, armorBonusDamaged: _resetB, ...extraBase } = slotItem as any;
            const evolveCountExtra = evolveBlockCount !== undefined ? { _shieldBlockCount: evolveBlockCount } : {};
            patch[blockSlotId] = { ...extraBase, _shieldDurabilityBlockCounter: counter, ...evolveCountExtra } as EquipmentItem;
            sideEffects.push({
              event: 'log:entry',
              payload: { type: 'equip', message: `${slotItem.name} 额外格挡（${counter}/${totalExtraBlocks}），耐久未消耗！` },
            });
          } else {
            extraBlockCounterPatch = { _shieldDurabilityBlockCounter: 0 };
          }
        }

        if (!skipShieldDurabilityLoss) {
          const shieldDurability = slotItem.durability ?? 1;
          if (shieldDurability <= 1 && !state.unbreakableNext) {
            shieldDurabilityConsumed = true;
            const breakResult = computeEquipmentBreakEffects(state, blockSlotId, slotItem as GameCardData, ae);
            Object.assign(patch, breakResult.patch);
            rng = breakResult.rng;
            sideEffects.push(...breakResult.sideEffects);
            enqueuedActions.push(...breakResult.enqueuedActions);
            if (breakResult.drawFromBackpack > 0) {
              sideEffects.push({ event: 'equipment:drawFromBackpack', payload: { count: breakResult.drawFromBackpack } });
            }
            if (breakResult.classCardDraw > 0) {
              sideEffects.push({ event: 'equipment:classCardDraw', payload: { count: breakResult.classCardDraw } });
            }
            // Revive overwrites the slot with the original slotItem, dropping
            // the just-incremented auto-upgrade counter — re-apply it here.
            if (breakResult.revived && evolveBlockCount !== undefined) {
              const revivedItem = patch[blockSlotId] as EquipmentItem | null | undefined;
              if (revivedItem) {
                patch[blockSlotId] = { ...revivedItem, _shieldBlockCount: evolveBlockCount } as EquipmentItem;
              }
            }
          } else {
            const nextDurability = shieldDurability <= 1 ? shieldDurability : shieldDurability - 1;
            const updatedBlockDurability = state.unbreakableNext && shieldDurability <= 1 ? shieldDurability : nextDurability;
            const blockDurActuallyLost = updatedBlockDurability < shieldDurability;
            if (blockDurActuallyLost) shieldDurabilityConsumed = true;

            const { armor: _resetArmor, armorBonusDamaged: _resetBonusDmg, ...durabilityBase } = workingShieldItem as any;
            const evolveCountDur = evolveBlockCount !== undefined ? { _shieldBlockCount: evolveBlockCount } : {};

            if (blockDurActuallyLost) {
              const durResult = computeDurabilityLossEffects(state, blockSlotId, slotItem as GameCardData, updatedBlockDurability);
              Object.assign(patch, durResult.patch);
              rng = durResult.rng;
              sideEffects.push(...durResult.sideEffects);
              // When the shield's current-durability armor was just depleted, the next
              // durability cycle must start fresh so it picks up baseArmorMax + the full
              // permanent/temporary bonus again. computeDurabilityLossEffects rebuilds
              // updatedItem from the original slotItem, which still carries the now-stale
              // `armor` / `armorBonusDamaged` from the previous cycle — strip them here
              // so the bonus (incl. slotTempArmor) re-applies in full on the next block.
              const { armor: _resetArmorAgain, armorBonusDamaged: _resetBonusAgain, ...durStripped } = durResult.updatedItem as any;
              const mergedItem = { ...durabilityBase, ...durStripped, ...evolveCountDur, ...extraBlockCounterPatch };
              patch[blockSlotId] = mergedItem as EquipmentItem;

              if (durResult.golemReflectDamage) {
                enqueuedActions.push({
                  type: 'DEAL_DAMAGE_TO_MONSTER',
                  monsterId: durResult.golemReflectDamage.targetId,
                  damage: durResult.golemReflectDamage.damage,
                  source: 'golem-reflect',
                });
                sideEffects.push({
                  event: 'combat:shieldReflect',
                  payload: { slotId: durResult.golemReflectDamage.slotId, targetId: durResult.golemReflectDamage.targetId },
                });
              }
            } else {
              patch[blockSlotId] = { ...durabilityBase, durability: updatedBlockDurability, ...evolveCountDur, ...extraBlockCounterPatch } as EquipmentItem;
            }

            if (shieldDurability <= 1 && state.unbreakableNext) {
              patch.unbreakableNext = false;
            }
          }
        }
      } else if (!shieldAutoEvolved && !shieldArmorDepleted) {
        const evolveCountWork = evolveBlockCount !== undefined ? { _shieldBlockCount: evolveBlockCount } : {};
        patch[blockSlotId] = { ...workingShieldItem, ...evolveCountWork } as EquipmentItem;
      }
    }
  }

  // Update combat state: track block usage
  if (action.choice === 'shield' && action.slotId) {
    const usedSlotId = action.slotId;
    const newCombat = { ...(patch.combatState ?? state.combatState) };
    newCombat.slotBlocksThisTurn = { ...newCombat.slotBlocksThisTurn, [usedSlotId]: true };
    if (shieldDurabilityConsumed) {
      newCombat.slotDurabilityUsedThisTurn = {
        ...newCombat.slotDurabilityUsedThisTurn,
        [usedSlotId]: (newCombat.slotDurabilityUsedThisTurn[usedSlotId] ?? 0) + 1,
      };
    }
    patch.combatState = newCombat;
  }

  // Bulwark block temp armor
  if (blockedWithShield && (state.bulwarkPassiveActive ?? 0) > 0 && action.slotId) {
    const blockSlotId = action.slotId;
    const tempGain = 2 * state.bulwarkPassiveActive!;
    patch.slotTempArmor = { ...(patch.slotTempArmor ?? state.slotTempArmor ?? {}), [blockSlotId]: ((patch.slotTempArmor ?? state.slotTempArmor ?? {})[blockSlotId] ?? 0) + tempGain };
    const label = blockSlotId === 'equipmentSlot1' ? '左' : '右';
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'magic', message: `永恒护符·格挡铸甲：${label}装备栏临时护甲 +${tempGain}` },
    });
    if (ae.hasPersuadeOnTempAttack) {
      const pBonus = ae.persuadeOnTempAttackBonus || 10;
      patch.persuadeAmuletBonus = (patch.persuadeAmuletBonus ?? state.persuadeAmuletBonus ?? 0) + pBonus;
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'equip', message: `怀柔之印：下次劝降率 +${pBonus}%` },
      });
    }
  }

  // Swarm corrode on shield
  if (blockedWithShield && action.slotId && monster.swarmCorrode && !monster.isStunned) {
    const corrodeSlotId = action.slotId;
    const corrodeItem = getSlotItem(state, corrodeSlotId);
    if (corrodeItem && (corrodeItem.durability ?? 0) > 0) {
      const corrodedDur = (corrodeItem.durability ?? 1) - 1;
      if (corrodedDur <= 0) {
        const breakResult = computeEquipmentBreakEffects(state, corrodeSlotId, corrodeItem as GameCardData, ae);
        Object.assign(patch, breakResult.patch);
        rng = breakResult.rng;
        sideEffects.push(...breakResult.sideEffects);
        enqueuedActions.push(...breakResult.enqueuedActions);
        if (breakResult.drawFromBackpack > 0) {
          sideEffects.push({ event: 'equipment:drawFromBackpack', payload: { count: breakResult.drawFromBackpack } });
        }
        if (breakResult.classCardDraw > 0) {
          sideEffects.push({ event: 'equipment:classCardDraw', payload: { count: breakResult.classCardDraw } });
        }
        if (breakResult.revived) {
          sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monster.name} 腐蚀甲壳：${corrodeItem.name} 被腐蚀，但复生了！` } });
        } else {
          sideEffects.push({ event: 'log:entry', payload: { type: 'combat', message: `${monster.name} 腐蚀甲壳：${corrodeItem.name} 被腐蚀摧毁！` } });
          sideEffects.push({ event: 'ui:banner', payload: { text: `${monster.name} 腐蚀摧毁了 ${corrodeItem.name}！` } });
        }
      } else {
        patch[corrodeSlotId] = { ...corrodeItem, durability: corrodedDur } as EquipmentItem;
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'combat', message: `${monster.name} 腐蚀甲壳：${corrodeItem.name} 耐久 -1（${corrodeItem.durability} → ${corrodedDur}）` },
        });
      }
    }
  }

  // Apply remaining damage
  if (remainingDamage > 0) {
    enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: remainingDamage, source: 'combat' });
    sideEffects.push({ event: 'combat:heroTookDamageThisMonsterTurn', payload: {} });
  }

  // Monster steal gold
  if (monster.onAttackEffect?.startsWith('steal-gold-')) {
    const stealTarget = parseInt(monster.onAttackEffect.replace('steal-gold-', ''), 10) || 0;
    if (stealTarget > 0) {
      const actualStolen = Math.min(stealTarget, state.gold ?? 0);
      patch.gold = Math.max(0, (state.gold ?? 0) - stealTarget);
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'combat', message: `${monster.name} 动手偷走了 ${stealTarget} 金币！` },
      });
      sideEffects.push({ event: 'ui:banner', payload: { text: `${monster.name} 偷走了 ${stealTarget} 金币！` } });
      if (actualStolen > 0) {
        sideEffects.push({ event: 'combat:goblinStolen', payload: { monsterId: monster.id } });
        // Only the trick-carrier needs the 「stole gold」 mark — that mark blocks
        // 「哥布林的戏法」 from dropping on this goblin's death. Non-carriers don't
        // affect the drop check, so leave them alone.
        const isTrickCarrier = Boolean(monster.goblinTrickCarrier);
        const needsStatBuff = Boolean(monster.goblinStealScale);
        if (isTrickCarrier || needsStatBuff) {
          const monsterActiveCards = (patch.activeCards ?? [...state.activeCards]) as ActiveRowSlots;
          const monsterIdx = monsterActiveCards.findIndex(c => c?.id === monster.id);
          if (monsterIdx >= 0 && monsterActiveCards[monsterIdx]) {
            const m = monsterActiveCards[monsterIdx]!;
            let updated: GameCardData = m;
            if (needsStatBuff) {
              updated = {
                ...updated,
                attack: (m.attack ?? m.value) + actualStolen,
                value: m.value + actualStolen,
                hp: (m.hp ?? 0) + actualStolen,
                maxHp: (m.maxHp ?? 0) + actualStolen,
                tempAttackBoost: (m.tempAttackBoost ?? 0) + actualStolen,
                tempHpBoost: (m.tempHpBoost ?? 0) + actualStolen,
              };
            }
            if (isTrickCarrier) {
              updated = { ...updated, goblinHasStolen: true };
            }
            monsterActiveCards[monsterIdx] = updated;
            patch.activeCards = monsterActiveCards;
          }
          if (needsStatBuff) {
            sideEffects.push({
              event: 'log:entry',
              payload: { type: 'combat', message: `${monster.name} 贪婪强化：攻击力 +${actualStolen}，生命值 +${actualStolen}！` },
            });
          }
        }
      }
    }
  }

  // Monster steal card (Goblin 窃牌贼: pick a random hand card and stack it under self)
  if (monster.goblinStealCard) {
    const currentHand = (patch.handCards ?? state.handCards) as GameCardData[];
    const goblinColIndex = (patch.activeCards ?? state.activeCards).findIndex(c => c?.id === monster.id);
    if (currentHand.length > 0 && goblinColIndex >= 0) {
      let pickIdx: number;
      [pickIdx, rng] = nextInt(rng, 0, currentHand.length - 1);
      const stolenCard = currentHand[pickIdx];
      patch.handCards = currentHand.filter((_, i) => i !== pickIdx);
      const prevStacks = (patch.activeCardStacks ?? state.activeCardStacks) ?? {};
      patch.activeCardStacks = {
        ...prevStacks,
        [goblinColIndex]: [...(prevStacks[goblinColIndex] ?? []), stolenCard],
      };
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'combat', message: `${monster.name} 偷走了手牌「${stolenCard.name}」！` },
      });
      sideEffects.push({
        event: 'ui:banner',
        payload: { text: `${monster.name} 偷走了「${stolenCard.name}」！` },
      });
      sideEffects.push({
        event: 'combat:goblinStealCard',
        payload: { monsterId: monster.id, monsterName: monster.name, card: stolenCard },
      });
    }
  }

  // Monster double attack
  if (monster.eliteDoubleAttack && !pendingBlock.isFollowUpAttack) {
    let doubleRoll: number;
    [doubleRoll, rng] = nextInt(rng, 1, 20);
    sideEffects.push({
      event: 'combat:diceRoll',
      payload: { title: monster.name, subtitle: '连击判定', roll: doubleRoll, threshold: 14, success: doubleRoll <= 14 },
    });
    if (doubleRoll <= 14) {
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'combat', message: `${monster.name} 发动连击！再次攻击！` },
      });
      sideEffects.push({ event: 'ui:banner', payload: { text: `${monster.name} 连击！再来一次！` } });

      // Reflect before follow-up
      if (reflectDmg > 0 && reflectBlockSlotId) {
        enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster.id, damage: reflectDmg, source: 'shield-reflect' });
        sideEffects.push({ event: 'combat:shieldReflect', payload: { slotId: reflectBlockSlotId, targetId: monster.id } });
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'combat', message: `${reflectSourceName} 反射了 ${reflectDmg} 点伤害！` },
        });
      }

      // Set follow-up pending block
      const newCombat = { ...(patch.combatState ?? state.combatState) };
      newCombat.pendingBlock = {
        monsterId: monster.id,
        attackValue: monster.attack ?? monster.value,
        monsterName: monster.name,
        isFollowUpAttack: true,
      };
      patch.combatState = newCombat;
      patch.rng = rng;
      return applyPatch(state, patch, sideEffects, enqueuedActions.length > 0 ? enqueuedActions : undefined);
    }
  }

  enqueuedActions.push({ type: 'DECREMENT_FURY', monsterId: monster.id });

  // Shield refill on monster death
  if (blockedWithShield && action.slotId) {
    const refillItem = getSlotItem(state, action.slotId);
    if (refillItem && (refillItem as GameCardData).shieldRefillOnMonsterDeath && refillItem.maxDurability) {
      sideEffects.push({
        event: 'combat:checkShieldRefillOnMonsterDeath',
        payload: { slotId: action.slotId, monsterId: monster.id },
      });
    }
  }

  // Shield reflect damage (if not already done in follow-up)
  if (reflectDmg > 0 && reflectBlockSlotId) {
    enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster.id, damage: reflectDmg, source: 'shield-reflect' });
    sideEffects.push({ event: 'combat:shieldReflect', payload: { slotId: reflectBlockSlotId, targetId: monster.id } });
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `${reflectSourceName} 反射了 ${reflectDmg} 点伤害！` },
    });
  }

  // Ogre stun
  if (monster.ogreStun) {
    let stunRoll: number;
    [stunRoll, rng] = nextInt(rng, 1, 20);
    sideEffects.push({
      event: 'combat:diceRoll',
      payload: { title: monster.name, subtitle: '击晕判定', roll: stunRoll, threshold: 6, success: stunRoll <= 6 },
    });
    if (stunRoll <= 6) {
      patch.heroStunned = true;
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'combat', message: `${monster.name} 蛮力击晕！你的装备栏和护符栏被冻结了！` },
      });
      sideEffects.push({ event: 'ui:banner', payload: { text: `被 ${monster.name} 击晕了！装备栏和护符栏冻结！` } });
    }
  }

  // Clear pending block and advance
  const finalCombat = { ...(patch.combatState ?? state.combatState) };
  if (finalCombat.pendingBlock?.monsterId === pendingBlock.monsterId) {
    finalCombat.pendingBlock = null;
  }
  patch.combatState = finalCombat;
  patch.phase = 'monsterTurn';

  enqueuedActions.push({ type: 'ADVANCE_MONSTER_TURN' });

  patch.rng = rng;
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// INITIATE_WEAPON_ATTACK
//
// Eligibility gate for weapon-to-monster interactions. Decides whether to
// enqueue PERFORM_HERO_ATTACK, PERFORM_SHIELD_BASH, or BEGIN_COMBAT +
// attack. Replaces the imperative handleWeaponToMonster in the hook.
// ---------------------------------------------------------------------------

function reduceInitiateWeaponAttack(
  state: GameState,
  action: Extract<GameAction, { type: 'INITIATE_WEAPON_ATTACK' }>,
): ReduceResult {
  const { slotId, monsterId } = action;
  const monster = state.activeCards.find(c => c?.id === monsterId) as GameCardData | undefined;
  if (!monster) return noChange(state);

  const slotItem = getSlotItem(state, slotId);
  if (!slotItem) return noChange(state);

  const combat = state.combatState;
  const ae = computeAmuletEffects(state.amuletSlots as GameCardData[]);
  const enqueuedActions: GameAction[] = [];
  const alreadyEngaged = combat.engagedMonsterIds.includes(monsterId);

  // --- Shield bash path ---
  if (slotItem.type === 'shield' && slotItem.shieldBashStunRate) {
    if (monster.type === 'building') return noChange(state);

    if (!slotItem.shieldBashUnlimited) {
      const bashSlotAttacked = combat.heroAttacksThisTurn[slotId];
      const bashHasBase = combat.heroAttacksRemaining > 0;
      if (bashSlotAttacked || !bashHasBase) return noChange(state);
    } else {
      if ((slotItem.durability ?? 0) <= 0) return noChange(state);
    }

    if (!alreadyEngaged) {
      enqueuedActions.push({ type: 'BEGIN_COMBAT', monster, initiator: 'hero' });
    }
    enqueuedActions.push({ type: 'PERFORM_SHIELD_BASH', slotId, targetMonsterId: monsterId });
    return { state, sideEffects: [], enqueuedActions };
  }

  // --- Building direct attack (no extra-charge logic) ---
  if (monster.type === 'building') {
    enqueuedActions.push({ type: 'PERFORM_HERO_ATTACK', slotId, targetMonsterId: monsterId, isBuildingNoEngaged: combat.engagedMonsterIds.length === 0 });
    return { state, sideEffects: [], enqueuedActions };
  }

  // --- Weapon attack eligibility ---
  const slotAlreadyAttacked = combat.heroAttacksThisTurn[slotId];
  const hasBaseAttack = combat.heroAttacksRemaining > 0;
  const canUseBerserkerExtra = state.berserkerRageActive && slotAlreadyAttacked && !state.berserkerSlotUsed[slotId];
  const canUseFlashExtra = ae.hasFlash && slotAlreadyAttacked && !state.flashSlotUsed[slotId];
  const canUseGambitExtra = state.gambitExtraActive && slotAlreadyAttacked && (state.gambitSlotUsed[slotId] ?? 0) < state.gambitExtraPerSlot;
  const canUseWeaponExtra = !!(slotItem as GameCardData).weaponExtraAttack && slotAlreadyAttacked
    && (state.weaponExtraAttackUsed[slotId] ?? 0) < ((slotItem as GameCardData).weaponExtraAttack ?? 0);
  const battleSpiritBonus2 = (state.slotBattleSpiritBonus ?? {})[slotId] ?? 0;
  const canUseBattleSpiritExtra = battleSpiritBonus2 > 0 && slotAlreadyAttacked
    && ((state.slotBattleSpiritUsed ?? {})[slotId] ?? 0) < battleSpiritBonus2;
  // 兵器谱：本回合该装备栏额外攻击次数 > 0 且该栏已攻击过 → 允许追加攻击。
  const canUseSlotExtra = ((state.slotExtraAttacks ?? {})[slotId] ?? 0) > 0 && slotAlreadyAttacked;
  const needsExtraCharge = slotAlreadyAttacked || !hasBaseAttack;

  if (needsExtraCharge && !canUseBerserkerExtra && !canUseFlashExtra && !canUseGambitExtra && !canUseWeaponExtra && !canUseBattleSpiritExtra && !canUseSlotExtra && state.extraAttackCharges <= 0) {
    return noChange(state);
  }

  if (!alreadyEngaged) {
    enqueuedActions.push({ type: 'BEGIN_COMBAT', monster, initiator: 'hero' });
  }
  enqueuedActions.push({ type: 'PERFORM_HERO_ATTACK', slotId, targetMonsterId: monsterId, isBuildingNoEngaged: false });
  return { state, sideEffects: [], enqueuedActions };
}

// ---------------------------------------------------------------------------
// APPLY_HERO_KILL_EFFECTS
//
// Vampiric heal on monster kill. Enqueued directly by PERFORM_HERO_ATTACK
// when a monster is defeated.
// ---------------------------------------------------------------------------

function reduceApplyHeroKillEffects(
  state: GameState,
  action: Extract<GameAction, { type: 'APPLY_HERO_KILL_EFFECTS' }>,
): ReduceResult {
  if (!state.vampiricNextAttack) return noChange(state);

  const healAmount = Math.floor(action.monsterHpBefore / 2);
  const enqueuedActions: GameAction[] = [];
  if (healAmount > 0) {
    enqueuedActions.push({ type: 'HEAL', amount: healAmount, source: 'vampiric' });
  }
  return applyPatch(state, { vampiricNextAttack: false }, [], enqueuedActions);
}
