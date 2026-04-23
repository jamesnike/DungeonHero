/**
 * Dungeon Rules — handles dungeon-row, monster enter effects,
 * elite gold buff, and horde swarm mechanics.
 */

import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots } from '@/components/game-board/types';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ReduceResult, SideEffect } from '../reducer';
import { applyPatch, noChange } from '../reducer';
import { applyLowGoldEliteBuff } from '../combat';
import { generateMonsterRewardOptions } from '../monsters';
import { computeAmuletEffects } from '../equipment';
import { HAND_LIMIT, BASE_BACKPACK_CAPACITY } from '../constants';
import { pickRandomHandCardsForDiscardPreferGraveyard, flattenActiveRowSlots, findSlotIndexByCardId } from '../helpers';
import { DUNGEON_COLUMN_COUNT, createEmptyActiveRow } from '../constants';
import { applyMonsterRage } from '@/lib/monsterRage';
import { getEternalRelic, hasEternalRelic } from '@/lib/eternalRelics';
import {
  planWaterfall,
  applyWaterfallDrop,
  incrementTurnCountForWaterfall,
  getWaterfallDiscardEffect,
  applyWaterfallEffect,
  waterfallResetsPure,
} from '../waterfall';

export function reduceDungeonActions(state: GameState, action: GameAction): ReduceResult | null {
  switch (action.type) {
    case 'MONSTER_ENTERED_ROW':
      return reduceMonsterEnteredRow(state, action);
    case 'CHECK_ELITE_GOLD_BUFF':
      return reduceCheckEliteGoldBuff(state);
    case 'CHECK_HORDE_SWARM':
      return reduceCheckHordeSwarm(state);
    case 'DRAW_DUNGEON_ROW':
      return reduceDrawDungeonRow(state);
    case 'TRIGGER_WATERFALL':
      return reduceTriggerWaterfall(state);
    case 'ENFORCE_BACKPACK_CAPACITY':
      return reduceEnforceBackpackCapacity(state);
    case 'CHECK_WRAITH_PURIFICATION':
      return reduceCheckWraithPurification(state);
    case 'REGISTER_DUNGEON_CARD_PROCESSED':
      return reduceRegisterDungeonCardProcessed(state, action);
    case 'PROCESS_AUTO_DRAWS':
      return reduceProcessAutoDraws(state);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// MONSTER_ENTERED_ROW — handle enter effects for a single monster
// ---------------------------------------------------------------------------

function reduceMonsterEnteredRow(
  state: GameState,
  action: Extract<GameAction, { type: 'MONSTER_ENTERED_ROW' }>,
): ReduceResult {
  const monster = state.activeCards[action.column];
  if (!monster || monster.id !== action.monsterId) return noChange(state);

  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};
  const enqueuedActions: GameAction[] = [];

  // Pre-generate reward preview so previews remain stable and match the actual
  // reward shown when the monster dies. Skip if already cached (defensive).
  if (monster.type === 'monster' && !state.monsterRewardPreviewCache[monster.id]) {
    const [options, rngAfterPreview] = generateMonsterRewardOptions(monster, state, state.rng);
    patch.rng = rngAfterPreview;
    patch.monsterRewardPreviewCache = {
      ...state.monsterRewardPreviewCache,
      [monster.id]: options,
    };
  }

  // Auto-engage enter effect
  if (monster.enterEffect === 'auto-engage') {
    enqueuedActions.push({
      type: 'TRIGGER_MONSTER_SKILL_FLOAT',
      monsterId: monster.id,
      skillKey: 'enter:auto-engage',
    });
    const rowMonsters = state.activeCards.filter(c => c && c.type === 'monster') as GameCardData[];
    const names = rowMonsters.map(m => m.name);
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'combat', message: `${monster.name} 入场：整行怪物进入激怒状态！（${names.join('、')}）` },
    });
    sideEffects.push({ event: 'ui:banner', payload: { text: `${monster.name} 入场！全体怪物激怒！` } });
    for (const m of rowMonsters) {
      sideEffects.push({
        event: 'combat:autoEngage',
        payload: { monsterId: m.id, monsterName: m.name },
      });
    }
  }

  // Ogre enter discard — discard 1 random hand card
  if (monster.ogreEnterDiscard && state.handCards.length > 0) {
    enqueuedActions.push({
      type: 'TRIGGER_MONSTER_SKILL_FLOAT',
      monsterId: monster.id,
      skillKey: 'enter:ogreEnterDiscard',
    });
    const [discardedCards, rngAfterDiscard] = pickRandomHandCardsForDiscardPreferGraveyard(state.handCards as GameCardData[], 1, patch.rng ?? state.rng);
    patch.rng = rngAfterDiscard;
    const discarded = discardedCards[0];
    if (discarded) {
      patch.handCards = (state.handCards as GameCardData[]).filter(c => c.id !== discarded.id);
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'combat', message: `${monster.name} 蛮力震慑：随机弃回了手牌「${discarded.name}」！` },
      });
      sideEffects.push({ event: 'ui:banner', payload: { text: `${monster.name} 震慑！弃回了「${discarded.name}」！` } });
      sideEffects.push({
        event: 'card:discarded',
        payload: { card: discarded, destination: 'graveyard' },
      });
    }
  }

  // After enter effects, check for horde swarm and elite gold buff
  enqueuedActions.push({ type: 'CHECK_HORDE_SWARM' });
  enqueuedActions.push({ type: 'CHECK_ELITE_GOLD_BUFF' });

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// CHECK_ELITE_GOLD_BUFF — buff/debuff elite monsters based on gold threshold
// ---------------------------------------------------------------------------

function reduceCheckEliteGoldBuff(state: GameState): ReduceResult {
  const isLowGold = state.gold <= 10;
  const result = applyLowGoldEliteBuff(state.activeCards, isLowGold);
  if (!result) return noChange(state);

  const sideEffects: SideEffect[] = [];
  for (const log of result.logs) {
    sideEffects.push({ event: 'log:entry', payload: { type: log.type, message: log.message } });
  }
  for (const banner of result.banners) {
    sideEffects.push({ event: 'ui:banner', payload: { text: banner } });
  }

  // Float over each elite that actually changed (compare attack/value before/after).
  const enqueuedActions: GameAction[] = [];
  for (let i = 0; i < state.activeCards.length; i++) {
    const before = state.activeCards[i];
    const after = result.activeCards[i];
    if (!before || !after) continue;
    if ((before.attack ?? before.value) === (after.attack ?? after.value)) continue;
    enqueuedActions.push({
      type: 'TRIGGER_MONSTER_SKILL_FLOAT',
      monsterId: after.id,
      skillKey: 'passive:lowGoldEliteBuff',
    });
  }

  return applyPatch(state, { activeCards: result.activeCards }, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// CHECK_HORDE_SWARM — buff all monsters when horde swarm is active and ≥3 monsters
// ---------------------------------------------------------------------------

function reduceCheckHordeSwarm(state: GameState): ReduceResult {
  const rowMonsterCount = state.activeCards.filter(c => c && c.type === 'monster').length;
  const hasHordeRageSwarm = state.activeCards.some(c => c && c.swarmHordeRage && !c.isStunned);
  if (!hasHordeRageSwarm || rowMonsterCount < 3) return noChange(state);

  const hasUnbuffed = state.activeCards.some(c => c && c.type === 'monster' && !c.swarmHordeBuffed);
  if (!hasUnbuffed) return noChange(state);

  const sideEffects: SideEffect[] = [];
  const next = state.activeCards.map(card => {
    if (!card || card.type !== 'monster' || card.swarmHordeBuffed) return card;
    return {
      ...card,
      attack: (card.attack ?? card.value) + 3,
      value: card.value + 3,
      hp: (card.hp ?? 0) + 3,
      maxHp: (card.maxHp ?? 0) + 3,
      swarmHordeBuffed: true,
    };
  }) as ActiveRowSlots;

  const swarmCard = state.activeCards.find(c => c && c.swarmHordeRage);
  const monsterNames = state.activeCards.filter(c => c && c.type === 'monster').map(c => c!.name);
  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'combat', message: `${swarmCard!.name} 虫群集结！激活行怪物≥3，所有怪物+3攻击+3血量！（${monsterNames.join('、')}）` },
  });
  sideEffects.push({ event: 'ui:banner', payload: { text: '虫群集结！全体怪物+3攻击+3血量！' } });

  // Engage all unbuffed monsters
  for (const card of state.activeCards) {
    if (card && card.type === 'monster') {
      sideEffects.push({
        event: 'combat:autoEngage',
        payload: { monsterId: card.id, monsterName: card.name },
      });
    }
  }

  // Single skill float, attributed to the swarm card driving the buff.
  const enqueuedActions: GameAction[] = swarmCard
    ? [{
        type: 'TRIGGER_MONSTER_SKILL_FLOAT',
        monsterId: swarmCard.id,
        skillKey: 'passive:swarmHordeRage',
      }]
    : [];

  return applyPatch(state, { activeCards: next }, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// DRAW_DUNGEON_ROW — fill empty dungeon slots from the remaining deck
// ---------------------------------------------------------------------------

function reduceDrawDungeonRow(state: GameState): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};
  const enqueuedActions: GameAction[] = [];

  // Find the single remaining non-ghost card to carry over
  const remaining = flattenActiveRowSlots(state.activeCards).filter(c => !c.isGhost);
  let carriedSlot: { card: GameCardData; index: number } | null = null;
  if (remaining.length === 1) {
    const onlyCard = remaining[0];
    carriedSlot = {
      card: onlyCard,
      index: findSlotIndexByCardId(state.activeCards, onlyCard.id),
    };
  }

  const occupiedSlots = carriedSlot ? 1 : 0;
  const availableSlots = DUNGEON_COLUMN_COUNT - occupiedSlots;
  const cardsToDraw = Math.min(availableSlots, state.remainingDeck.length);

  if (cardsToDraw === 0 && !carriedSlot) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'system', message: '胜利！地牢已被征服！' },
    });
    patch.victory = true;
    patch.gameOver = true;
    patch.activeCards = createEmptyActiveRow();
    patch.cardsPlayed = 0;
    patch.drawPending = false;
    return applyPatch(state, patch, sideEffects);
  }

  const newCards = state.remainingDeck.slice(0, cardsToDraw) as GameCardData[];
  if (newCards.length > 0) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'deck', message: `翻开 ${newCards.length} 张地牢牌：${newCards.map(c => c.name).join('、')}` },
    });
  }

  const nextSlots = createEmptyActiveRow();
  const drawSpawnTurn = state.turnCount;
  const isQuick = state.gameMode === 'quick';

  if (carriedSlot) {
    const targetIndex = carriedSlot.index >= 0 ? carriedSlot.index : 0;
    nextSlots[targetIndex] = carriedSlot.card;
  }

  let insertIndex = 0;
  const enteredMonsterActions: GameAction[] = [];
  for (let col = 0; col < DUNGEON_COLUMN_COUNT; col++) {
    if (!nextSlots[col] && insertIndex < newCards.length) {
      const card = applyMonsterRage(newCards[insertIndex++], drawSpawnTurn, isQuick);
      nextSlots[col] = card;
      if (card.type === 'monster' && (card.enterEffect || card.ogreEnterDiscard)) {
        enteredMonsterActions.push({ type: 'MONSTER_ENTERED_ROW', monsterId: card.id, column: col });
      }
    }
  }

  patch.activeCards = nextSlots;
  patch.cardsPlayed = 0;
  patch.drawPending = false;
  patch.remainingDeck = state.remainingDeck.slice(cardsToDraw);

  enqueuedActions.push(...enteredMonsterActions);
  enqueuedActions.push({ type: 'CHECK_ELITE_GOLD_BUFF' });

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// TRIGGER_WATERFALL — cascade cards from preview row to active row
// ---------------------------------------------------------------------------

function reduceTriggerWaterfall(state: GameState): ReduceResult {
  const plan = planWaterfall(
    state.previewCards,
    state.activeCards,
    state.remainingDeck as GameCardData[],
  );
  if (!plan) return noChange(state);

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];

  // Apply drops from preview to active row
  const drops = plan.dropCards.map((card, i) => ({
    card,
    targetSlot: plan.dropTargetSlots[i],
  }));
  const newActiveCards = applyWaterfallDrop(state.activeCards, drops);

  // Build new preview row from deck
  const nextPreview = createEmptyActiveRow();
  for (let i = 0; i < plan.nextPreviewCards.length && i < DUNGEON_COLUMN_COUNT; i++) {
    nextPreview[i] = plan.nextPreviewCards[i];
  }

  const patch: Partial<GameState> = {
    activeCards: newActiveCards,
    previewCards: nextPreview,
    remainingDeck: plan.nextRemainingDeck,
    ...waterfallResetsPure(state),
    ...incrementTurnCountForWaterfall(state),
  };

  // Handle discarded preview card
  if (plan.discardCard) {
    const effect = getWaterfallDiscardEffect(plan.discardCard);
    if (effect) {
      const effectPatch = applyWaterfallEffect({ ...state, ...patch }, effect);
      Object.assign(patch, effectPatch);
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'waterfall', message: `${plan.discardCard.name} 溢出效果：${effect.description}` },
      });
    }
    sideEffects.push({
      event: 'waterfall:discardPhase',
      payload: { slot: plan.discardPreviewIndex!, destination: plan.discardDestination },
    });
  }

  // Victory check
  if (plan.shouldDeclareVictory) {
    patch.victory = true;
    patch.gameOver = true;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'system', message: '胜利！地牢已被征服！' },
    });
  }

  // Enqueue enter effects for newly dropped monsters
  for (const drop of drops) {
    if (drop.card.type === 'monster' && (drop.card.enterEffect || drop.card.ogreEnterDiscard)) {
      enqueuedActions.push({
        type: 'MONSTER_ENTERED_ROW',
        monsterId: drop.card.id,
        column: drop.targetSlot,
      });
    }
  }
  enqueuedActions.push({ type: 'CHECK_ELITE_GOLD_BUFF' });

  sideEffects.push({ event: 'waterfall:completed', payload: { sequenceId: state.turnCount } });

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// ENFORCE_BACKPACK_CAPACITY — discard overflow cards to recycle bag
// ---------------------------------------------------------------------------

function reduceEnforceBackpackCapacity(state: GameState): ReduceResult {
  const capacity = Math.max(1, BASE_BACKPACK_CAPACITY + (state.backpackCapacityModifier ?? 0));
  const backpack = state.backpackItems as GameCardData[];
  if (backpack.length <= capacity) return noChange(state);

  const kept = backpack.slice(0, capacity);
  const overflow = backpack.slice(capacity);
  const sideEffects: SideEffect[] = [];

  const recycleBag = [...(state.permanentMagicRecycleBag as GameCardData[])];
  for (const card of overflow) {
    recycleBag.push(card);
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'backpack', message: `背包溢出：「${card.name}」移入回收袋` },
    });
  }

  return applyPatch(state, {
    backpackItems: kept,
    permanentMagicRecycleBag: recycleBag,
  }, sideEffects);
}

// ---------------------------------------------------------------------------
// CHECK_WRAITH_PURIFICATION — after combat, check if wraith passive conditions met
// ---------------------------------------------------------------------------

function reduceCheckWraithPurification(state: GameState): ReduceResult {
  // Idempotent: only grant once
  if (hasEternalRelic(state.eternalRelics ?? [], 'wraith-purification')) {
    return noChange(state);
  }

  // Wraiths still standing in the active row count — but a card marked
  // `defeatProcessed` is in mid-removal and should be treated as gone so the
  // check fires immediately when the last wraith dies (not one defeat later).
  const isLiveWraith = (c: GameCardData | null | undefined) =>
    !!c && c.type === 'monster' && !c.defeatProcessed && c.monsterType === 'Wraith';

  const hasWraith =
    (state.activeCards as (GameCardData | null)[]).some(isLiveWraith) ||
    (state.previewCards as (GameCardData | null)[]).some(isLiveWraith) ||
    (state.remainingDeck as GameCardData[]).some(c => c?.monsterType === 'Wraith');

  if (hasWraith) return noChange(state);

  // All wraiths cleared — grant the eternal relic and notify UI.
  const relic = getEternalRelic('wraith-purification');
  const sideEffects: SideEffect[] = [
    { event: 'combat:wraithPurified', payload: {} },
    {
      event: 'log:entry',
      payload: { type: 'skill', message: '所有幽魂已被消灭！获得永恒护符·幽魂净化。' },
    },
    { event: 'ui:banner', payload: { text: '获得永恒护符·幽魂净化！' } },
  ];

  return applyPatch(state, {
    eternalRelics: [...(state.eternalRelics ?? []), relic],
    wraithPassiveEnabled: true,
  }, sideEffects);
}

// ---------------------------------------------------------------------------
// REGISTER_DUNGEON_CARD_PROCESSED — Phase 8B
// ---------------------------------------------------------------------------

function reduceRegisterDungeonCardProcessed(
  state: GameState,
  action: Extract<GameAction, { type: 'REGISTER_DUNGEON_CARD_PROCESSED' }>,
): ReduceResult {
  if (state.gameOver || state.victory) return noChange(state);
  if (state.processedDungeonCardIds.includes(action.cardId)) return noChange(state);

  const patch: Partial<GameState> = {
    processedDungeonCardIds: [...state.processedDungeonCardIds, action.cardId],
    pendingAutoDrawCount: state.pendingAutoDrawCount + 1,
  };

  const effects = computeAmuletEffects(state.amuletSlots);
  const sideEffects: SideEffect[] = [];

  if (effects.dungeonGoldCount > 0) {
    const n = effects.dungeonGoldCount;
    patch.gold = state.gold + n;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'amulet', message: `拾荒之符：处理地城牌，金币 +${n}` },
    });
  }

  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// PROCESS_AUTO_DRAWS — drains pendingAutoDrawCount by moving backpack → hand
// ---------------------------------------------------------------------------

function reduceProcessAutoDraws(state: GameState): ReduceResult {
  if (state.pendingAutoDrawCount <= 0) return noChange(state);

  let s = state;
  const sideEffects: SideEffect[] = [];
  let drawn = 0;

  while (drawn < s.pendingAutoDrawCount) {
    const liveHandLimit = HAND_LIMIT + (s.handLimitBonus ?? 0);
    if (s.handCards.length >= liveHandLimit) break;
    if (s.backpackItems.length === 0) break;

    const card = s.backpackItems[0];
    s = {
      ...s,
      handCards: [...s.handCards, card],
      backpackItems: s.backpackItems.slice(1),
    };
    sideEffects.push(
      { event: 'card:drawnToHand', payload: { cardId: card.id, source: 'backpack' } },
      { event: 'log:entry', payload: { type: 'deck', message: `自动抽牌：「${card.name}」→ 手牌` } },
    );
    drawn += 1;
  }

  s = { ...s, pendingAutoDrawCount: 0 };

  if (s === state && drawn === 0) return applyPatch(state, { pendingAutoDrawCount: 0 });
  return { state: s, sideEffects, enqueuedActions: [] };
}
