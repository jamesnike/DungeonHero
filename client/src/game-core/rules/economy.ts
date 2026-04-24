/**
 * Economy / Field Mutation Rules — handles typed field mutation actions.
 *
 * These actions replace SET_STATE bridge patches with typed, replayable actions
 * for gold, stats, equipment, amulets, card zones, and game flags.
 */

import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ReduceResult, SideEffect } from '../reducer';
import { applyPatch } from '../reducer';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, AmuletItem, EquipmentItem, EquipmentSlotId } from '@/components/game-board/types';
import type { KnightCardData } from '@/lib/knightDeck';
import { BASE_BACKPACK_CAPACITY } from '../constants';
import { markSkillUsedPure } from '../hero';
import { nextInt } from '../rng';
import { getEffectiveHandLimit, addCardToBackpackPure } from '../cards';
import { computeAmuletEffects } from '../equipment';
import { computeSpellDamagePure } from '../helpers';
import type { PendingMonsterEndDice } from '../types';

// 本地 ensureMonsterEngaged 副本，避免与 magic-effects.ts 形成循环依赖。
// 行为必须跟 magic-effects.ts:ensureMonsterEngaged 和 hero.ts:ensureEngaged 一致。
function ensureMonsterEngagedLocal(
  state: GameState,
  monster: GameCardData,
  enqueuedActions: GameAction[],
): void {
  if (!(state.combatState?.engagedMonsterIds ?? []).includes(monster.id)) {
    enqueuedActions.push({ type: 'BEGIN_COMBAT', monster, initiator: 'hero' });
  }
}

// Helper: 雷金护符 effect — for each stun event on a monster, grant +10×N gold
// (N = stun-gold amulet count) AND immediately remove that monster's stun.
// Per-monster trigger: callers MUST invoke once per stunned monster (multi-stun
// magics like 震慑领域 already loop per monster).
export function maybeEnqueueStunGold(
  state: GameState,
  enqueuedActions: GameAction[],
  sideEffects: SideEffect[],
  monsterId: string,
  monsterName: string,
): void {
  const ae = computeAmuletEffects(state.amuletSlots as GameCardData[]);
  if (ae.stunGoldCount <= 0) return;
  const n = ae.stunGoldCount;
  const goldGain = 10 * n;
  enqueuedActions.push({ type: 'MODIFY_GOLD', delta: goldGain, source: 'amulet-stun-gold' } as GameAction);
  enqueuedActions.push({ type: 'UPDATE_MONSTER_CARD', monsterId, patch: { isStunned: false } } as GameAction);
  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'amulet', message: `雷金护符：${monsterName} 被击晕，金币 +${goldGain}，移除击晕状态` },
  });
  // Non-blocking 视觉反馈：UI hook 监听此事件后，在该怪物卡上播放一次性
  // 「金币爆发 + 击晕释放」动画。和游戏 pipeline 完全解耦。
  sideEffects.push({
    event: 'combat:stunReleasedByGoldAmulet',
    payload: { monsterId, monsterName, goldDelta: goldGain },
  });
}

export function reduceEconomyActions(
  state: GameState,
  action: GameAction,
): ReduceResult | null {
  switch (action.type) {
    case 'MODIFY_GOLD':
      return applyPatch(state, { gold: state.gold + action.delta });

    case 'MODIFY_STUN_CAP':
      return applyPatch(state, { stunCap: state.stunCap + action.delta });

    case 'MODIFY_SLOT_TEMP_ATTACK':
      return applyPatch(state, {
        slotTempAttack: {
          ...state.slotTempAttack,
          [action.slotId]: (state.slotTempAttack[action.slotId] ?? 0) + action.delta,
        },
      });

    case 'MODIFY_SLOT_TEMP_ARMOR':
      return applyPatch(state, {
        slotTempArmor: {
          ...state.slotTempArmor,
          [action.slotId]: (state.slotTempArmor[action.slotId] ?? 0) + action.delta,
        },
      });

    case 'SET_COMBAT_FLAG':
      return applyPatch(state, { [action.flag]: action.value } as Partial<GameState>);

    case 'MODIFY_PERMANENT_STAT':
      return applyPatch(state, {
        [action.stat]: (state[action.stat] as number) + action.delta,
      } as Partial<GameState>);

    case 'ADD_CARD_TO_HAND':
      return applyPatch(state, { handCards: [...state.handCards, action.card] });

    case 'ADD_CARDS_TO_HAND':
      return applyPatch(state, { handCards: [...state.handCards, ...action.cards] });

    case 'REMOVE_CARD_FROM_HAND':
      return applyPatch(state, { handCards: state.handCards.filter(c => c.id !== action.cardId) });

    case 'REMOVE_CARDS_FROM_HAND': {
      const removeSet = new Set(action.cardIds);
      return applyPatch(state, { handCards: state.handCards.filter(c => !removeSet.has(c.id)) });
    }

    case 'DISCARD_ALL_HAND': {
      // Curses cannot be discarded — they remain in hand. Every other hand
      // card is routed via DISCARD_OWNED_CARD so the standard pipeline picks
      // graveyard vs recycle-bag and fires APPLY_DISCARD_EFFECTS (onDiscardDraw,
      // onDiscardDamage, 弹射护符 / 弃能之符 procs, 永恒护符·弃牌生金, etc.).
      const discardable = state.handCards.filter(c => c.type !== 'curse');
      const kept = state.handCards.filter(c => c.type === 'curse');
      if (discardable.length === 0) return applyPatch(state, {});
      // Sort onDiscardDraw cards last so any draws they trigger don't get
      // interleaved with the discard chain — matches the prior hook ordering.
      const ordered = [...discardable].sort(
        (a, b) => (a.onDiscardDraw ? 1 : 0) - (b.onDiscardDraw ? 1 : 0),
      );
      const enqueuedActions: GameAction[] = ordered.map(card => ({
        type: 'DISCARD_OWNED_CARD',
        card,
        owner: 'player',
      }));
      return applyPatch(state, { handCards: kept }, [], enqueuedActions);
    }

    case 'UPDATE_HAND_CARDS':
      return applyPatch(state, { handCards: action.updater(state.handCards) });

    case 'UPDATE_MONSTER_CARD':
      return applyPatch(state, {
        activeCards: patchMonsterInActiveCards(state.activeCards, action.monsterId, action.patch),
      });

    case 'FLUSH_RECYCLE_TO_BACKPACK': {
      const capacity = BASE_BACKPACK_CAPACITY + (state.backpackCapacityModifier ?? 0);
      const available = Math.max(0, capacity - state.backpackItems.length);
      const toMove = state.permanentMagicRecycleBag.slice(0, available);
      const remaining = state.permanentMagicRecycleBag.slice(available);
      return applyPatch(state, {
        backpackItems: [...state.backpackItems, ...toMove],
        permanentMagicRecycleBag: remaining,
      });
    }

    case 'ADD_PERMANENT_MAGIC_TO_RECYCLE':
      return applyPatch(state, {
        permanentMagicRecycleBag: [...state.permanentMagicRecycleBag, action.card],
      });

    case 'REMOVE_PERMANENT_MAGIC_FROM_RECYCLE':
      return applyPatch(state, {
        permanentMagicRecycleBag: state.permanentMagicRecycleBag.filter(c => c.id !== action.cardId),
      });

    case 'SET_EQUIPMENT_SLOT':
      return applyPatch(state, { [action.slotId]: action.card } as Partial<GameState>);

    case 'MODIFY_EQUIPMENT_DURABILITY': {
      const equip = state[action.slotId];
      if (!equip) return applyPatch(state, {});
      return applyPatch(state, {
        [action.slotId]: {
          ...equip,
          durability: (equip.durability ?? 0) + action.delta,
        },
      } as Partial<GameState>);
    }

    case 'UPDATE_AMULET_SLOT': {
      const newSlots = [...state.amuletSlots];
      if (action.slotIndex >= 0 && action.slotIndex < newSlots.length && newSlots[action.slotIndex]) {
        newSlots[action.slotIndex] = { ...newSlots[action.slotIndex], ...action.patch } as AmuletItem;
      }
      return applyPatch(state, { amuletSlots: newSlots });
    }

    case 'MODIFY_MAX_AMULET_SLOTS':
      return applyPatch(state, { maxAmuletSlots: state.maxAmuletSlots + action.delta });

    case 'REMOVE_AMULET':
      return applyPatch(state, {
        amuletSlots: state.amuletSlots.filter(slot => slot?.id !== action.cardId),
      });

    // --- Card / Deck / Recycle state ---

    case 'SET_HAND_CARDS':
      return applyPatch(state, { handCards: action.cards });

    case 'ADD_CLASS_CARD_TO_HAND':
      return applyPatch(state, { classCardsInHand: [...state.classCardsInHand, action.card as KnightCardData] });

    case 'REMOVE_CLASS_CARD_FROM_HAND':
      return applyPatch(state, { classCardsInHand: state.classCardsInHand.filter(c => c.id !== action.cardId) });

    case 'SET_DISCARDED_CARDS':
      return applyPatch(state, { discardedCards: action.cards });

    case 'SET_MAGIC_RECYCLE_BAG':
      return applyPatch(state, { permanentMagicRecycleBag: action.bag });

    case 'SET_CLASS_DECK_AND_BACKPACK': {
      const patch: Partial<GameState> = {
        classDeck: action.classDeck,
        backpackItems: action.backpackItems,
      };
      if (action.permanentMagicRecycleBag !== undefined) {
        patch.permanentMagicRecycleBag = action.permanentMagicRecycleBag;
      }
      return applyPatch(state, patch);
    }

    case 'SET_BACKPACK_ITEMS':
      return applyPatch(state, { backpackItems: action.items });

    case 'UPDATE_GAME_LOG':
      return applyPatch(state, {
        gameLogEntries: [...state.gameLogEntries, action.entry],
      });

    // --- Equipment / Amulet state ---

    case 'SWAP_EQUIPMENT_SLOTS': {
      type SlotId = import('@/components/game-board/types').EquipmentSlotId;
      const left = state.equipmentSlot1;
      const right = state.equipmentSlot2;
      const leftAll = [left, ...state.equipmentSlot1Reserve].filter(Boolean) as EquipmentItem[];
      const rightAll = [right, ...state.equipmentSlot2Reserve].filter(Boolean) as EquipmentItem[];
      const cap1 = state.equipmentSlotCapacity.equipmentSlot1 ?? 1;
      const cap2 = state.equipmentSlotCapacity.equipmentSlot2 ?? 1;
      const swapCount = Math.min(cap1, cap2);

      const leftSwap = leftAll.slice(0, swapCount);
      const leftKeep = leftAll.slice(swapCount);
      const rightSwap = rightAll.slice(0, swapCount);
      const rightKeep = rightAll.slice(swapCount);

      const newLeft = [...rightSwap, ...leftKeep];
      const newRight = [...leftSwap, ...rightKeep];

      const [newLeft1, ...newLeft1Reserve] = newLeft.length > 0
        ? newLeft : [null as unknown as EquipmentItem];
      const [newRight1, ...newRight1Reserve] = newRight.length > 0
        ? newRight : [null as unknown as EquipmentItem];

      return applyPatch(state, {
        equipmentSlot1: newLeft1 ? { ...newLeft1, fromSlot: 'equipmentSlot1' as SlotId } : null,
        equipmentSlot2: newRight1 ? { ...newRight1, fromSlot: 'equipmentSlot2' as SlotId } : null,
        equipmentSlot1Reserve: (newLeft1Reserve ?? []).map(e => ({ ...e, fromSlot: 'equipmentSlot1' as SlotId })) as EquipmentItem[],
        equipmentSlot2Reserve: (newRight1Reserve ?? []).map(e => ({ ...e, fromSlot: 'equipmentSlot2' as SlotId })) as EquipmentItem[],
      });
    }

    case 'FILTER_EQUIPMENT_RESERVES':
      return applyPatch(state, {
        equipmentSlot1Reserve: state.equipmentSlot1Reserve.filter(c => c.id !== action.cardId),
        equipmentSlot2Reserve: state.equipmentSlot2Reserve.filter(c => c.id !== action.cardId),
      });

    case 'SET_AMULET_SLOTS':
      return applyPatch(state, { amuletSlots: action.slots as AmuletItem[] });

    case 'SET_RECYCLE_BACKPACK_PROGRESS':
      return applyPatch(state, { recycleBackpackProgress: action.progress });

    case 'REMOVE_PREVIEW_CARD_STACKS': {
      const next = { ...state.previewCardStacks };
      for (const idx of action.indices) {
        delete next[idx];
      }
      return applyPatch(state, { previewCardStacks: next });
    }

    case 'INCREMENT_TURN_COUNT':
      return applyPatch(state, { turnCount: state.turnCount + action.delta });

    case 'SET_HAND_LIMIT_BONUS':
      return applyPatch(state, { handLimitBonus: action.bonus });

    case 'SET_EQUIPMENT_SLOT_CAPACITY': {
      const prev = state.equipmentSlotCapacity;
      return applyPatch(state, {
        equipmentSlotCapacity: { ...prev, [action.slotId]: (prev[action.slotId] ?? 1) + action.delta },
      });
    }

    case 'SET_EQUIPMENT_RESERVE':
      return applyPatch(state, action.slotId === 'equipmentSlot1'
        ? { equipmentSlot1Reserve: action.items as EquipmentItem[] }
        : { equipmentSlot2Reserve: action.items as EquipmentItem[] }
      );

    case 'SET_EQUIPMENT_SLOT_BONUS': {
      const prev = state.equipmentSlotBonuses;
      return applyPatch(state, {
        equipmentSlotBonuses: {
          ...prev,
          [action.slotId]: {
            ...prev[action.slotId],
            [action.bonusType]: action.value,
          },
        },
      });
    }

    case 'SET_SLOT_ATTACK_BURST': {
      const prev = state.slotAttackBursts;
      return applyPatch(state, {
        slotAttackBursts: { ...prev, [action.slotId]: (prev[action.slotId] ?? 0) + action.amount },
      });
    }

    case 'CLEAR_BERSERK_BUFF':
      return applyPatch(state, { berserkTurnBuff: { equipmentSlot1: 0, equipmentSlot2: 0 } });

    case 'ADD_BERSERK_BUFF': {
      const prev = state.berserkTurnBuff;
      return applyPatch(state, {
        berserkTurnBuff: {
          equipmentSlot1: (prev.equipmentSlot1 ?? 0) + action.amount,
          equipmentSlot2: (prev.equipmentSlot2 ?? 0) + action.amount,
        },
      });
    }

    case 'RECORD_CLASS_DAMAGE_DISCOVER': {
      if (!action.increment) {
        return applyPatch(state, { classDamageDiscoverStreak: action.streak ?? 0 });
      }

      // Each equipped damage-class-discover amulet ticks the counter
      // independently (N amulets → +N progress per qualifying hit).
      const discoverAmulets = (state.amuletSlots as GameCardData[]).filter(
        s => s?.amuletEffect === 'damage-class-discover',
      );
      if (discoverAmulets.length === 0) return applyPatch(state, {});

      const anyUpgraded = discoverAmulets.some(a => (a.upgradeLevel ?? 0) >= 1);
      const threshold = anyUpgraded ? 3 : 8;
      const nextStreak = (state.classDamageDiscoverStreak ?? 0) + discoverAmulets.length;
      const sideEffects: SideEffect[] = [];

      if (nextStreak >= threshold) {
        sideEffects.push({ event: 'combat:classDamageDiscoverTriggered', payload: { threshold } });
        return applyPatch(state, { classDamageDiscoverStreak: 0 }, sideEffects);
      }
      return applyPatch(state, { classDamageDiscoverStreak: nextStreak });
    }

    case 'SET_PERSUADE_DISCOUNT':
      return applyPatch(state, { persuadeDiscount: action.discount });

    case 'SET_PERSUADE_AMULET_BONUS':
      return applyPatch(state, { persuadeAmuletBonus: action.bonus });

    case 'ADD_PERMANENT_SKILL':
      return applyPatch(state, {
        permanentSkills: [...state.permanentSkills, action.skill],
      });

    case 'UPDATE_HERO_MAGIC_ENTRY':
      return applyPatch(state, {
        heroMagicState: { ...state.heroMagicState, [action.magicId]: action.entry },
      });

    case 'SET_GAME_FLAGS':
      return applyPatch(state, action.patch as Partial<GameState>);

    case 'UPDATE_ACTIVE_CARDS':
      return applyPatch(state, { activeCards: action.updater(state.activeCards) });

    case 'UPDATE_DISCARDED_CARDS':
      return applyPatch(state, { discardedCards: action.updater(state.discardedCards) });

    case 'UPDATE_BACKPACK_ITEMS':
      return applyPatch(state, { backpackItems: action.updater(state.backpackItems) });

    case 'UPDATE_RECYCLE_BAG':
      return applyPatch(state, { permanentMagicRecycleBag: action.updater(state.permanentMagicRecycleBag) });

    case 'UPDATE_ETERNAL_RELICS':
      return applyPatch(state, { eternalRelics: action.updater(state.eternalRelics) });

    case 'UPDATE_CLASS_DECK':
      return applyPatch(state, { classDeck: action.updater(state.classDeck) });

    case 'UPDATE_REMAINING_DECK':
      return applyPatch(state, { remainingDeck: action.updater(state.remainingDeck) });

    case 'UPDATE_AMULET_SLOTS':
      return applyPatch(state, { amuletSlots: action.updater(state.amuletSlots) as AmuletItem[] });

    // --- Interactive continuations (RESOLVE_*) ---
    case 'RESOLVE_DICE':
      return reduceResolveDice(state, action);
    case 'ROLL_DICE_FOR_FLOW':
      return reduceRollDiceForFlow(state);
    case 'RESOLVE_EQUIPMENT_CHOICE':
      return reduceResolveEquipmentChoice(state, action);
    case 'RESOLVE_MAGIC_CHOICE':
      return reduceResolveMagicChoice(state, action);
    case 'RESOLVE_CARD_ACTION':
      return reduceResolveCardAction(state, action);
    case 'RESOLVE_GRAVEYARD_SELECTION':
      return reduceResolveGraveyardSelection(state, action);

    case 'MARK_SKILL_USED':
      return applyPatch(state, markSkillUsedPure(state, action.skillId));

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Interactive continuation handlers
// ---------------------------------------------------------------------------

function reduceRollDiceForFlow(state: GameState): ReduceResult {
  const [roll, nextRng] = nextInt(state.rng, 1, 20);
  return applyPatch(state, { rng: nextRng, lastFlowDiceRoll: roll }, [], []);
}

function reduceResolveDice(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_DICE' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const ctx = action.context ?? {};
  const flowId = ctx.flowId as string | undefined;

  sideEffects.push({
    event: 'interactive:diceResolved',
    payload: { value: action.value, outcomeId: action.outcomeId, context: ctx },
  });

  let newState = { ...state, phase: 'playerInput' as GameState['phase'] };

  switch (flowId) {
    case 'skeleton-restore': {
      const mId = ctx.monsterId as string;
      const mName = ctx.monsterName as string;
      if (action.outcomeId === 'restore') {
        newState = {
          ...newState,
          activeCards: newState.activeCards.map(c =>
            c?.id === mId
              ? { ...c, currentLayer: (c.currentLayer ?? 0) + 1, hp: c.maxHp ?? c.hp ?? 0 }
              : c,
          ) as typeof newState.activeCards,
        };
        enqueuedActions.push(
          { type: 'SET_HERO_SKILL_BANNER', message: `${mName} 恢复了 1 层血层！` } as GameAction,
          { type: 'UPDATE_GAME_LOG', entry: { id: Date.now(), type: 'combat' as any, message: `${mName} 的骸生了一层！`, timestamp: Date.now() } } as GameAction,
        );
      } else {
        enqueuedActions.push(
          { type: 'UPDATE_GAME_LOG', entry: { id: Date.now(), type: 'combat' as any, message: `${mName} 的再生尝试失败。`, timestamp: Date.now() } } as GameAction,
        );
      }
      break;
    }

    case 'wraith-rebirth': {
      const mId = ctx.monsterId as string;
      const mName = ctx.monsterName as string;
      const mFury = ctx.monsterFury as number;
      if (action.outcomeId === 'rebirth') {
        newState = {
          ...newState,
          activeCards: newState.activeCards.map(c =>
            c?.id === mId
              ? { ...c, currentLayer: mFury, hp: c.maxHp ?? c.hp ?? 0 }
              : c,
          ) as typeof newState.activeCards,
        };
        enqueuedActions.push(
          { type: 'SET_HERO_SKILL_BANNER', message: `${mName} 血层全部回满了！` } as GameAction,
          { type: 'UPDATE_GAME_LOG', entry: { id: Date.now(), type: 'combat' as any, message: `${mName} 的幽魂之力爆发，血层全部回满！`, timestamp: Date.now() } } as GameAction,
        );
      } else {
        enqueuedActions.push(
          { type: 'UPDATE_GAME_LOG', entry: { id: Date.now(), type: 'combat' as any, message: `${mName} 的重生尝试失败。`, timestamp: Date.now() } } as GameAction,
        );
      }
      break;
    }

    case 'repair-enrage-dice': {
      const card = ctx.card as GameCardData | undefined;
      const slotId = ctx.slotId as EquipmentSlotId | undefined;
      // monsterId may be undefined when the card was played with no monsters
      // on the board — the enrage outcome will degrade gracefully in
      // reduceResolveRepairEnrageDice (装备不获得耐久，仅记录失败日志).
      const monsterId = ctx.monsterId as string | undefined;
      const diceResultId = (action.outcomeId === 'repair' ? 'repair' : 'enrage') as 'repair' | 'enrage';
      if (card && slotId) {
        enqueuedActions.push({
          type: 'RESOLVE_REPAIR_ENRAGE_DICE',
          card,
          slotId,
          monsterId,
          diceResultId,
        } as GameAction);
      }
      break;
    }

    case 'repair-enrage': {
      const slotId = ctx.slotId as string;
      const mId = ctx.monsterId as string;
      const mName = ctx.monsterName as string;
      const oldLayers = ctx.monsterCurrentLayer as number;
      const mAtk = ctx.monsterAttack as number;
      if (action.outcomeId === 'repair') {
        const slotItem = slotId === 'equipmentSlot1' ? newState.equipmentSlot1 : newState.equipmentSlot2;
        if (slotItem && slotItem.durability != null && slotItem.maxDurability != null) {
          const newDur = Math.min(slotItem.maxDurability, slotItem.durability + 1);
          newState = {
            ...newState,
            [slotId]: { ...slotItem, durability: newDur },
          };
          enqueuedActions.push(
            { type: 'UPDATE_GAME_LOG', entry: { id: Date.now(), type: 'magic' as any, message: `锻造赌运：${slotItem.name} 耐久 +1（${slotItem.durability}→${newDur}）`, timestamp: Date.now() } } as GameAction,
          );
        }
      } else if (action.outcomeId === 'enrage') {
        if (oldLayers > 1) {
          newState = {
            ...newState,
            activeCards: newState.activeCards.map(c =>
              c?.id === mId
                ? { ...c, currentLayer: oldLayers - 1, hp: c.maxHp ?? c.hp ?? 0, attack: mAtk + 2, value: mAtk + 2 }
                : c,
            ) as typeof newState.activeCards,
          };
          enqueuedActions.push(
            { type: 'UPDATE_GAME_LOG', entry: { id: Date.now(), type: 'magic' as any, message: `锻造赌运失败：${mName} 失去 1 血层（${oldLayers}→${oldLayers - 1}）并激怒（攻击+2）！`, timestamp: Date.now() } } as GameAction,
          );
        } else {
          newState = {
            ...newState,
            activeCards: newState.activeCards.map(c =>
              c?.id === mId
                ? { ...c, attack: mAtk + 2, value: mAtk + 2 }
                : c,
            ) as typeof newState.activeCards,
          };
          enqueuedActions.push(
            { type: 'UPDATE_GAME_LOG', entry: { id: Date.now(), type: 'magic' as any, message: `锻造赌运失败：${mName} 已是最后血层，激怒（攻击+2）！`, timestamp: Date.now() } } as GameAction,
          );
        }
      }
      break;
    }

    case 'fortune-wheel': {
      // flowContext from the resolver only carries cardId, so fall back to
      // pendingMagicAction.card. Without this, card was undefined for every
      // fw-N branch — the bottom-of-block FINALIZE_MAGIC_CARD never fired
      // and the card silently vanished.
      const pendingCard = (newState.pendingMagicAction as any)?.card as GameCardData | undefined;
      const card = (ctx.card as GameCardData | undefined) ?? pendingCard;
      newState = { ...newState, pendingMagicAction: null, heroSkillBanner: null };
      // fw-delete is async — its hook (`card:fortuneWheelDelete`) dispatches
      // FINALIZE_MAGIC_CARD itself after the player picks a card. The other
      // branches are synchronous, so the reducer finalizes them.
      let finalizeFromReducer = true;
      switch (action.outcomeId) {
        case 'fw-discover': {
          sideEffects.push({
            event: 'card:fortuneWheelDiscover',
            payload: { card },
          });
          enqueuedActions.push(
            { type: 'UPDATE_GAME_LOG', entry: { id: Date.now(), type: 'magic' as any, message: '际遇轮盘：发现一张专属魔法卡（三选一）。', timestamp: Date.now() } } as GameAction,
          );
          break;
        }
        case 'fw-draw': {
          enqueuedActions.push(
            { type: 'DRAW_FROM_BACKPACK', count: 2, ignoreLimit: true } as GameAction,
            { type: 'SET_HERO_SKILL_BANNER', message: '际遇轮盘：从背包抽了牌。' } as GameAction,
          );
          break;
        }
        case 'fw-delete': {
          sideEffects.push({
            event: 'card:fortuneWheelDelete',
            payload: { card },
          });
          finalizeFromReducer = false;
          break;
        }
        case 'fw-persuade': {
          newState = { ...newState, persuadeDiscount: { costReduction: 0, rateBonus: 20 } };
          enqueuedActions.push(
            { type: 'SET_HERO_SKILL_BANNER', message: '际遇轮盘：下次劝降成功率 +20%。' } as GameAction,
            { type: 'UPDATE_GAME_LOG', entry: { id: Date.now(), type: 'magic' as any, message: '际遇轮盘：下次劝降成功率 +20%。', timestamp: Date.now() } } as GameAction,
          );
          break;
        }
        default:
          break;
      }
      if (card && finalizeFromReducer) {
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false } as GameAction);
      }
      break;
    }

    case 'chaos-dice': {
      // flowContext from the resolver only carries cardId, so fall back to
      // pendingMagicAction.card (set when the resolver fired). Without this
      // the card was lost: every chaos-N branch downstream relies on it.
      const pendingCard = (newState.pendingMagicAction as any)?.card as GameCardData | undefined;
      const card = (ctx.card as GameCardData | undefined) ?? pendingCard;
      newState = { ...newState, pendingMagicAction: null, heroSkillBanner: null };
      // chaos-1/2/3/5 are handled by hook listeners (they dispatch
      // FINALIZE_MAGIC_CARD themselves after their async/UI flow). Only
      // chaos-4 (synchronous lightning) is finalized here in the reducer.
      let finalizeFromReducer = false;
      switch (action.outcomeId) {
        case 'chaos-1': {
          sideEffects.push({
            event: 'card:chaosEquipReturn',
            payload: { card },
          });
          break;
        }
        case 'chaos-2': {
          sideEffects.push({
            event: 'card:chaosDiscover',
            payload: { card },
          });
          break;
        }
        case 'chaos-3': {
          sideEffects.push({
            event: 'card:chaosShop',
            payload: { card },
          });
          break;
        }
        case 'chaos-4': {
          const monsters = (newState.activeCards || [])
            .flat()
            .filter((c): c is GameCardData => !!c && c.type === 'monster' && (c.hp ?? 0) > 0);
          if (monsters.length > 0) {
            let rng = newState.rng;
            let idx: number;
            [idx, rng] = nextInt(rng, 0, monsters.length - 1);
            newState = { ...newState, rng };
            const target = monsters[idx];
            const lightningDmg = computeSpellDamagePure(newState, 3);
            ensureMonsterEngagedLocal(newState, target, enqueuedActions);
            enqueuedActions.push(
              { type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: target.id, damage: lightningDmg, source: 'chaos-lightning', isSpellDamage: true } as GameAction,
              { type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: target.id, damage: lightningDmg, source: 'chaos-lightning-2', isSpellDamage: true } as GameAction,
            );
            enqueuedActions.push(
              { type: 'SET_HERO_SKILL_BANNER', message: `${target.name} 被混沌雷击连续打中！（${lightningDmg} × 2）` } as GameAction,
            );
          } else {
            enqueuedActions.push(
              { type: 'SET_HERO_SKILL_BANNER', message: '没有怪物可以承受混沌雷击。' } as GameAction,
            );
          }
          finalizeFromReducer = true;
          break;
        }
        case 'chaos-5': {
          sideEffects.push({
            event: 'card:chaosDiscardDraw',
            payload: { card },
          });
          break;
        }
        default:
          break;
      }
      if (card && finalizeFromReducer) {
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: action.outcomeId === 'chaos-4' } as GameAction);
      }
      break;
    }

    case 'arcane-infusion': {
      const card = ctx.card as GameCardData | undefined;
      newState = { ...newState, pendingPotionAction: null };
      if (action.outcomeId === 'ai-left' || action.outcomeId === 'ai-right') {
        const slotId: EquipmentSlotId = action.outcomeId === 'ai-left' ? 'equipmentSlot1' : 'equipmentSlot2';
        const slotLabel = slotId === 'equipmentSlot1' ? '左' : '右';
        const curBonuses = newState.equipmentSlotBonuses[slotId] ?? { damage: 0, shield: 0 };
        const newDamage = curBonuses.damage * 2;
        const newShield = curBonuses.shield * 2;
        newState = {
          ...newState,
          equipmentSlotBonuses: {
            ...newState.equipmentSlotBonuses,
            [slotId]: { damage: newDamage, shield: newShield },
          },
        };
        if (curBonuses.damage === 0 && curBonuses.shield === 0) {
          enqueuedActions.push(
            { type: 'SET_HERO_SKILL_BANNER', message: `奥术灌注：${slotLabel}装备栏永久加成为 0，无变化。` } as GameAction,
          );
        } else {
          enqueuedActions.push(
            { type: 'SET_HERO_SKILL_BANNER', message: `奥术灌注：${slotLabel}装备栏永久攻击 ${curBonuses.damage}→${newDamage}、永久护甲 ${curBonuses.shield}→${newShield}！` } as GameAction,
          );
        }
      } else if (action.outcomeId === 'ai-spell') {
        const curSpell = newState.permanentSpellDamageBonus ?? 0;
        const curLifesteal = newState.permanentSpellLifesteal ?? 0;
        const newSpell = curSpell * 2;
        const newLifesteal = curLifesteal * 2;
        newState = {
          ...newState,
          permanentSpellDamageBonus: newSpell,
          permanentSpellLifesteal: newLifesteal,
        };
        if (curSpell === 0 && curLifesteal === 0) {
          enqueuedActions.push(
            { type: 'SET_HERO_SKILL_BANNER', message: '奥术灌注：永久法术伤害与超杀吸血均为 0，无变化。' } as GameAction,
          );
        } else {
          enqueuedActions.push(
            { type: 'SET_HERO_SKILL_BANNER', message: `奥术灌注：永久法术伤害 ${curSpell}→${newSpell}、超杀吸血 ${curLifesteal}→${newLifesteal}！` } as GameAction,
          );
        }
      }
      if (card) {
        enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card } as GameAction);
      }
      break;
    }

    case 'stun-domain': {
      const monsterIndex = ctx.monsterIndex as number;
      const monstersInfo = ctx.monsters as Array<{ id: string; name: string }>;
      const stunPctD = ctx.stunPct as number;
      const thresholdD = ctx.threshold as number;
      const stunResults = [...(ctx.stunResults as string[] ?? [])];
      const cardD = ctx.card as GameCardData | undefined;
      const curMonster = monstersInfo[monsterIndex];

      if (action.outcomeId === 'stun') {
        newState = {
          ...newState,
          activeCards: patchMonsterInActiveCards(newState.activeCards, curMonster.id, { isStunned: true }),
        };
        enqueuedActions.push(
          { type: 'UPDATE_GAME_LOG', entry: { id: Date.now(), type: 'combat' as any, message: `${curMonster.name} 被震慑领域击晕了！`, timestamp: Date.now() } } as GameAction,
        );
        stunResults.push(`${curMonster.name} 击晕`);
        maybeEnqueueStunGold(newState, enqueuedActions, sideEffects, curMonster.id, curMonster.name);
      } else {
        stunResults.push(`${curMonster.name} 未击晕`);
      }

      const nextIndex = monsterIndex + 1;
      if (nextIndex < monstersInfo.length) {
        const [sdRoll, sdRng] = nextInt(newState.rng, 1, 20);
        newState = { ...newState, rng: sdRng };
        sideEffects.push({
          event: 'ui:requestDice' as any,
          payload: {
            title: monstersInfo[nextIndex].name,
            subtitle: `震慑领域击晕判定（${stunPctD}%）`,
            entries: [
              { id: 'stun', range: [1, thresholdD], label: '击晕成功！', effect: 'none' },
              { id: 'miss', range: [thresholdD + 1, 20], label: '未击晕', effect: 'none' },
            ],
            flowContext: { ...ctx, monsterIndex: nextIndex, stunResults },
            predeterminedRoll: sdRoll,
          },
        });
      } else {
        const bannerText = `震慑领域：击晕上限 +5%。${stunResults.join('，')}。`;
        sideEffects.push({ event: 'ui:banner', payload: { text: bannerText } });
        if (cardD) {
          enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card: cardD, dealtDamage: false } as GameAction);
        }
      }
      break;
    }

    case 'stat-swap-stun': {
      const mId = ctx.targetMonsterId as string;
      const mName = ctx.targetMonsterName as string;
      const swapCard = ctx.card as GameCardData | undefined;
      if (action.outcomeId === 'stun') {
        newState = {
          ...newState,
          activeCards: patchMonsterInActiveCards(newState.activeCards, mId, { isStunned: true }),
        };
        enqueuedActions.push(
          { type: 'SET_HERO_SKILL_BANNER', message: `颠倒乾坤击晕了 ${mName}！` } as GameAction,
        );
        maybeEnqueueStunGold(newState, enqueuedActions, sideEffects, mId, mName);
      }
      if (swapCard) {
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card: swapCard, dealtDamage: false } as GameAction);
      }
      break;
    }

    case 'thunder-stun': {
      const mId = ctx.monsterId as string;
      const mName = ctx.monsterName as string;
      const hit = ctx.hit as number;
      const maxHits = ctx.maxHits as number;
      const stunPct = ctx.stunPct as number;
      const threshold = ctx.threshold as number;

      if (action.outcomeId === 'stun') {
        newState = {
          ...newState,
          activeCards: patchMonsterInActiveCards(newState.activeCards, mId, { isStunned: true }),
        };
        enqueuedActions.push(
          { type: 'SET_HERO_SKILL_BANNER', message: `雷震击：第${hit}击击晕成功！` } as GameAction,
          { type: 'UPDATE_GAME_LOG', entry: { id: Date.now(), type: 'combat' as any, message: `${mName} 被雷震击晕了！`, timestamp: Date.now() } } as GameAction,
        );
        maybeEnqueueStunGold(newState, enqueuedActions, sideEffects, mId, mName);
      } else if (hit < maxHits) {
        const [tsRoll, tsRng] = nextInt(newState.rng, 1, 20);
        newState = { ...newState, rng: tsRng };
        sideEffects.push({
          event: 'ui:requestDice' as any,
          payload: {
            title: mName,
            subtitle: `雷震击晕判定 第${hit + 1}击（${stunPct}%）`,
            entries: [
              { id: 'stun', range: [1, threshold], label: '击晕成功！', effect: 'none' },
              { id: 'miss', range: [threshold + 1, 20], label: '未击晕', effect: 'none' },
            ],
            flowContext: { ...ctx, hit: hit + 1 },
            predeterminedRoll: tsRoll,
          },
        });
      } else {
        enqueuedActions.push(
          { type: 'SET_HERO_SKILL_BANNER', message: `雷震击：未能击晕。` } as GameAction,
        );
      }
      break;
    }

    case 'goblin-heal':
    case 'goblin-steal': {
      // Pop the front entry from the queue; we already know it's our flow
      // because the flowId was set when the dice event was emitted.
      const queue = newState.pendingMonsterEndDiceQueue ?? [];
      const [flow, ...rest] = queue;
      if (!flow) break;

      if (flow.kind === 'goblin-heal' && flow.success) {
        const newLayer = Math.min(flow.maxLayers, flow.currentLayer + 1);
        if (newLayer > flow.currentLayer) {
          newState = {
            ...newState,
            activeCards: newState.activeCards.map(c =>
              c?.id === flow.goblinId
                ? { ...c, currentLayer: newLayer, hp: c.maxHp ?? c.hp ?? 0 }
                : c,
            ) as typeof newState.activeCards,
          };
          enqueuedActions.push(
            { type: 'UPDATE_GAME_LOG', entry: { id: Date.now(), type: 'combat' as any, message: `${flow.goblinName} 疗养：恢复了 1 血层！（${flow.currentLayer} → ${newLayer}）`, timestamp: Date.now() } } as GameAction,
            { type: 'SET_HERO_SKILL_BANNER', message: `${flow.goblinName} 疗养！恢复 1 血层！` } as GameAction,
          );
        }
      } else if (flow.kind === 'goblin-heal') {
        enqueuedActions.push(
          { type: 'UPDATE_GAME_LOG', entry: { id: Date.now(), type: 'combat' as any, message: `${flow.goblinName} 疗养判定失败。`, timestamp: Date.now() } } as GameAction,
        );
      }

      if (flow.kind === 'goblin-steal' && flow.success && flow.pickedItem) {
        // Apply the actual steal: remove picked item from equipment / amulets,
        // then stack the stolen card under the goblin so the existing
        // stack-pop mechanism can return it as a dungeon card on the goblin's
        // death. Amulet aura reversal is handled centrally by
        // `postProcessAmuletAura` in reducer.ts.
        const stolenCard = flow.pickedItem;
        let nextEquip1 = newState.equipmentSlot1;
        let nextEquip2 = newState.equipmentSlot2;
        let nextAmulets = newState.amuletSlots;

        if (flow.pickedSource === 'equip' && flow.pickedSlotId) {
          if (flow.pickedSlotId === 'equipmentSlot1') nextEquip1 = null;
          else nextEquip2 = null;
        } else if (flow.pickedSource === 'amulet') {
          nextAmulets = newState.amuletSlots.filter(a => a.id !== stolenCard.id) as AmuletItem[];
        }

        const prevStack = newState.activeCardStacks[flow.colIndex] ?? [];
        const nextStacks = {
          ...newState.activeCardStacks,
          [flow.colIndex]: [...prevStack, stolenCard],
        };

        newState = {
          ...newState,
          equipmentSlot1: nextEquip1,
          equipmentSlot2: nextEquip2,
          amuletSlots: nextAmulets,
          activeCardStacks: nextStacks,
        };

        const labelKind = flow.pickedSource === 'equip' ? '装备' : '护符';
        enqueuedActions.push(
          { type: 'UPDATE_GAME_LOG', entry: { id: Date.now(), type: 'combat' as any, message: `${flow.goblinName} 窃宝：偷走了${labelKind}「${stolenCard.name}」！`, timestamp: Date.now() } } as GameAction,
          { type: 'SET_HERO_SKILL_BANNER', message: `${flow.goblinName} 窃宝！偷走了「${stolenCard.name}」！` } as GameAction,
        );
        sideEffects.push({
          event: 'combat:goblinStealCard',
          payload: { monsterId: flow.goblinId, monsterName: flow.goblinName, card: stolenCard },
        });
      } else if (flow.kind === 'goblin-steal') {
        enqueuedActions.push(
          { type: 'UPDATE_GAME_LOG', entry: { id: Date.now(), type: 'combat' as any, message: `${flow.goblinName} 窃宝判定失败。`, timestamp: Date.now() } } as GameAction,
        );
      }

      // Drain the queue. If more dice remain, fire the next check event and
      // stay in `awaitingDice`. Otherwise clear the queue and enqueue
      // START_TURN so the hero turn finally begins.
      newState = { ...newState, pendingMonsterEndDiceQueue: rest };
      if (rest.length > 0) {
        emitGoblinDiceCheck(rest[0], sideEffects);
        newState = { ...newState, phase: 'awaitingDice' };
      } else {
        enqueuedActions.push({ type: 'START_TURN' } as GameAction);
      }
      break;
    }

    default:
      break;
  }

  return { state: newState, sideEffects, enqueuedActions };
}

/**
 * Emit the right `combat:goblin*Check` side effect for the given pending dice
 * flow. Hooks listen for these events and pop a dice modal animated to the
 * pre-rolled D20 value.
 */
function emitGoblinDiceCheck(flow: PendingMonsterEndDice, sideEffects: SideEffect[]): void {
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

function reduceResolveEquipmentChoice(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_EQUIPMENT_CHOICE' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const ctx = action.context ?? {};

  sideEffects.push({
    event: 'interactive:equipmentChoiceResolved',
    payload: { slotId: action.slotId, context: ctx },
  });

  return applyPatch(state, { phase: 'playerInput' as GameState['phase'] }, sideEffects);
}

function reduceResolveMagicChoice(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_MAGIC_CHOICE' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const ctx = action.context ?? {};

  sideEffects.push({
    event: 'interactive:magicChoiceResolved',
    payload: { choiceId: action.choiceId, context: ctx },
  });

  return applyPatch(state, { phase: 'playerInput' as GameState['phase'] }, sideEffects);
}

function reduceResolveCardAction(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_CARD_ACTION' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const ctx = action.context ?? {};

  sideEffects.push({
    event: 'interactive:cardActionResolved',
    payload: { cardId: action.cardId, actionType: action.actionType, context: ctx },
  });

  return applyPatch(state, { phase: 'playerInput' as GameState['phase'] }, sideEffects);
}

function reduceResolveGraveyardSelection(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_GRAVEYARD_SELECTION' }>,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const ctx = action.context ?? {};
  const cardId = action.cardIds[0];
  if (!cardId) {
    return applyPatch(state, { phase: 'playerInput' as GameState['phase'] }, sideEffects);
  }

  const rawSelected =
    (state.graveyardDiscoverState ?? []).find(c => c.id === cardId) ??
    state.discardedCards.find(c => c.id === cardId);

  if (!rawSelected) {
    return applyPatch(state, { phase: 'playerInput' as GameState['phase'] }, sideEffects);
  }

  // Monster cards in graveyard had their durability cleared by
  // resetMonsterForGraveyard. The hand/backpack add-helpers below
  // (addCardToHand / addCardToBackpackPure) re-prime them as monster
  // equipment via primeMonsterAsEquipment, matching the persuade flow.
  const selected: GameCardData = rawSelected;

  const patch: Partial<GameState> = {};
  patch.discardedCards = state.discardedCards.filter(c => c.id !== cardId);
  patch.graveyardDiscoverState = null;

  const delivery = (ctx.delivery as string) ?? state.graveyardDiscoverDelivery ?? 'backpack';
  const handLimit = getEffectiveHandLimit(state);
  const toHand =
    delivery === 'hand-first' &&
    state.handCards.length < handLimit &&
    !state.handCards.some(c => c.id === selected.id);

  if (toHand) {
    patch.handCards = [...state.handCards, selected];
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'event', message: `坟场发现：入手牌「${selected.name}」` },
    });
    patch.heroSkillBanner = `「${selected.name}」已加入手牌。`;
    sideEffects.push({
      event: 'card:queueToHand',
      payload: { card: selected, sourceHint: 'graveyard' },
    });
  } else {
    const bpPatch = addCardToBackpackPure({ ...state, ...patch } as GameState, selected);
    Object.assign(patch, bpPatch);
    const logMsg =
      delivery === 'hand-first'
        ? `坟场发现：手牌已满，「${selected.name}」进入背包`
        : `坟场发现：选入背包「${selected.name}」`;
    sideEffects.push({ event: 'log:entry', payload: { type: 'event', message: logMsg } });
    if (delivery === 'hand-first') {
      patch.heroSkillBanner = `手牌已满，「${selected.name}」已进入背包。`;
    }
    sideEffects.push({
      event: 'card:graveyardRecalled' as any,
      payload: { cards: [selected] },
    });
  }

  sideEffects.push({
    event: 'interactive:graveyardSelectionResolved',
    payload: { cardIds: action.cardIds, context: ctx, card: selected },
  });

  const pending = state.pendingPotionAction;
  if (pending && (pending as any).effect === 'discover-graveyard-magic') {
    patch.pendingPotionAction = null;
    enqueuedActions.push({ type: 'FINALIZE_POTION_CARD', card: (pending as any).card });
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

function patchMonsterInActiveCards(
  activeCards: ActiveRowSlots,
  monsterId: string,
  patch: Partial<GameCardData>,
): ActiveRowSlots {
  return activeCards.map(card => {
    if (!card || card.id !== monsterId) return card;
    return { ...card, ...patch };
  }) as ActiveRowSlots;
}
