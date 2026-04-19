/**
 * Init Rules — handles INIT_GAME action.
 *
 * Contains all pure game logic for initializing a new game: RNG setup,
 * hero selection, deck creation, monster distribution balancing,
 * deal-queue building, and class-deck generation.
 */

import type { GameState, EternalRelic, ActiveRowSlots } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { ReduceResult } from '../reducer';
import { createInitialGameState } from '../state';
import { createDeck, pruneEventChoicesToThree } from '../deck';
import { fillActiveRowSlots } from '../helpers';
import { shuffle as rngShuffle, nextInt, pickRandom } from '../rng';
import { INITIAL_TURN_COUNT, FINAL_MONSTER_MARK_DESCRIPTION } from '../constants';
import { DUNGEON_COLUMN_COUNT } from '@/components/game-board/constants';
import { getRandomHero } from '@/lib/heroes';
import { generateKnightDeck, createKnightDiscoveryEvents } from '@/lib/knightDeck';
import { applyMonsterRage } from '@/lib/monsterRage';
import type { RngState } from '../rng';

export function reduceInitGame(
  state: GameState,
  mode: 'normal' | 'quick',
  totalWins: number,
  eternalRelics: EternalRelic[],
): ReduceResult {
  let rng: RngState = state.rng;
  const isQuickMode = mode === 'quick';
  const initialTurnCount = isQuickMode ? 2 : INITIAL_TURN_COUNT;

  // --- Hero variant (first pick, used only for the SET_GAME_FLAGS patch in the old code) ---
  const [, rng1] = getRandomHero(rng);
  rng = rng1;

  // --- Deck creation ---
  const [newDeck, rng2] = createDeck(mode, rng);
  rng = rng2;
  for (let i = 0; i < newDeck.length; i++) {
    if (newDeck[i].type === 'event') {
      const [pruned, rngP] = pruneEventChoicesToThree(newDeck[i], rng);
      rng = rngP;
      newDeck[i] = pruned;
    }
  }

  // --- Knight discovery events ---
  const knightEvents = createKnightDiscoveryEvents();
  for (let i = 0; i < knightEvents.length; i++) {
    if (knightEvents[i].type === 'event') {
      const [pruned, rngP] = pruneEventChoicesToThree(knightEvents[i], rng);
      rng = rngP;
      knightEvents[i] = pruned;
    }
  }

  // --- Shuffle full deck ---
  const deckWithClassEvents: GameCardData[] = [];
  {
    const [shuffled, rngS] = rngShuffle([...newDeck, ...knightEvents], rng);
    rng = rngS;
    deckWithClassEvents.push(...shuffled);
  }

  // --- Balance monster distribution: 1 elite in first half, rest in second half ---
  {
    const halfSize = Math.floor(deckWithClassEvents.length / 2);
    const eliteMonsters = deckWithClassEvents.filter(c => c.monsterSpecial);
    const nonEliteMonsters = deckWithClassEvents.filter(c => c.type === 'monster' && !c.monsterSpecial);
    const nonMonsters = deckWithClassEvents.filter(c => c.type !== 'monster');

    if (isQuickMode) {
      const [shuffled, rngS] = rngShuffle([...deckWithClassEvents], rng);
      rng = rngS;
      deckWithClassEvents.splice(0, deckWithClassEvents.length, ...shuffled);
    } else {
      let earlyElite: typeof eliteMonsters[0] | null = null;
      const remainingElites = [...eliteMonsters];
      if (remainingElites.length > 0) {
        const [idx, rngE] = nextInt(rng, 0, remainingElites.length - 1);
        rng = rngE;
        earlyElite = remainingElites.splice(idx, 1)[0];
      }

      const totalMonsters = eliteMonsters.length + nonEliteMonsters.length;
      const firstHalfMonsterCount = Math.min(Math.floor(totalMonsters / 2), nonEliteMonsters.length);

      const firstHalf = [
        ...nonEliteMonsters.slice(0, firstHalfMonsterCount),
        ...nonMonsters.slice(0, halfSize - firstHalfMonsterCount - (earlyElite ? 1 : 0)),
        ...(earlyElite ? [earlyElite] : []),
      ];
      const secondHalf = [
        ...nonEliteMonsters.slice(firstHalfMonsterCount),
        ...remainingElites,
        ...nonMonsters.slice(halfSize - firstHalfMonsterCount - (earlyElite ? 1 : 0)),
      ];

      {
        const [s, r] = rngShuffle(firstHalf, rng);
        rng = r;
        firstHalf.splice(0, firstHalf.length, ...s);
      }
      {
        const [s, r] = rngShuffle(secondHalf, rng);
        rng = r;
        secondHalf.splice(0, secondHalf.length, ...s);
      }

      // Ensure the early elite lands in positions 12–29 (not in the first 12 cards)
      if (earlyElite && firstHalf.length > 12) {
        const eliteIdx = firstHalf.indexOf(earlyElite);
        if (eliteIdx >= 0 && eliteIdx < 12) {
          const [swapTarget, rngSw] = nextInt(rng, 12, firstHalf.length - 1);
          rng = rngSw;
          const tmp = firstHalf[eliteIdx];
          firstHalf[eliteIdx] = firstHalf[swapTarget];
          firstHalf[swapTarget] = tmp;
        }
      }

      deckWithClassEvents.splice(0, deckWithClassEvents.length, ...firstHalf, ...secondHalf);
    }
  }

  // --- Balance monster density: 1–2 monsters per non-overlapping chunk ---
  // CHUNK must equal `dealRowBatch`'s batch size (DUNGEON_COLUMN_COUNT) so the
  // first batch lines up with one chunk and per-row monster invariants
  // (≥1, ≤2 monsters) are preserved as the deck is consumed.
  {
    const MIN_MONSTERS = 1;
    const MAX_MONSTERS = 2;
    const CHUNK = DUNGEON_COLUMN_COUNT;
    for (let start = 0; start + CHUNK <= deckWithClassEvents.length; start += CHUNK) {
      const chunkEnd = start + CHUNK;
      const monsterIndices: number[] = [];
      const nonMonsterIndices: number[] = [];
      for (let j = start; j < chunkEnd; j++) {
        if (deckWithClassEvents[j].type === 'monster') monsterIndices.push(j);
        else nonMonsterIndices.push(j);
      }
      while (monsterIndices.length > MAX_MONSTERS) {
        const excessIdx = monsterIndices.pop()!;
        let swapTarget = -1;
        for (let k = chunkEnd; k < deckWithClassEvents.length; k++) {
          if (deckWithClassEvents[k].type !== 'monster') { swapTarget = k; break; }
        }
        if (swapTarget === -1) {
          for (let k = start - 1; k >= 0; k--) {
            if (deckWithClassEvents[k].type !== 'monster') { swapTarget = k; break; }
          }
        }
        if (swapTarget >= 0) {
          const tmp = deckWithClassEvents[excessIdx];
          deckWithClassEvents[excessIdx] = deckWithClassEvents[swapTarget];
          deckWithClassEvents[swapTarget] = tmp;
        } else {
          break;
        }
      }
      while (monsterIndices.length < MIN_MONSTERS) {
        const fillIdx = nonMonsterIndices.pop()!;
        if (fillIdx === undefined) break;
        let swapTarget = -1;
        for (let k = chunkEnd; k < deckWithClassEvents.length; k++) {
          if (deckWithClassEvents[k].type === 'monster') { swapTarget = k; break; }
        }
        if (swapTarget === -1) {
          for (let k = start - 1; k >= 0; k--) {
            if (deckWithClassEvents[k].type === 'monster') { swapTarget = k; break; }
          }
        }
        if (swapTarget >= 0) {
          const tmp = deckWithClassEvents[fillIdx];
          deckWithClassEvents[fillIdx] = deckWithClassEvents[swapTarget];
          deckWithClassEvents[swapTarget] = tmp;
          monsterIndices.push(fillIdx);
        } else {
          break;
        }
      }
    }
  }

  // --- Quick mode: push elites out of first 12 cards ---
  if (isQuickMode) {
    for (let i = 0; i < Math.min(12, deckWithClassEvents.length); i++) {
      if (deckWithClassEvents[i].monsterSpecial) {
        let swapTarget = -1;
        for (let k = 12; k < deckWithClassEvents.length; k++) {
          if (deckWithClassEvents[k].type === 'monster' && !deckWithClassEvents[k].monsterSpecial) {
            swapTarget = k;
            break;
          }
        }
        if (swapTarget >= 0) {
          const tmp = deckWithClassEvents[i];
          deckWithClassEvents[i] = deckWithClassEvents[swapTarget];
          deckWithClassEvents[swapTarget] = tmp;
        }
      }
    }
  }

  // --- Guarantee at least one monster in the back half of the deck ---
  // The front half is already monster-balanced by the chunk pass below; we only
  // need to make sure the deck doesn't run dry of monsters near the end so the
  // final waterfall(s) can still field a monster row.
  {
    const len = deckWithClassEvents.length;
    if (len >= 2) {
      const halfStart = Math.floor(len / 2);
      const hasMonsterInBackHalf = deckWithClassEvents
        .slice(halfStart)
        .some(c => c.type === 'monster');
      if (!hasMonsterInBackHalf) {
        let swapMonsterIdx = -1;
        for (let i = halfStart - 1; i >= 0; i--) {
          if (deckWithClassEvents[i].type === 'monster') {
            swapMonsterIdx = i;
            break;
          }
        }
        if (swapMonsterIdx >= 0) {
          const backRange = len - halfStart;
          const [targetOff, rngT] = nextInt(rng, 0, backRange - 1);
          rng = rngT;
          const targetIdx = halfStart + targetOff;
          const tmp = deckWithClassEvents[swapMonsterIdx];
          deckWithClassEvents[swapMonsterIdx] = deckWithClassEvents[targetIdx];
          deckWithClassEvents[targetIdx] = tmp;
        }
      }
    }
  }

  // --- Find last monster index for final-monster marking ---
  let lastMonsterDeckIndex = -1;
  for (let mi = deckWithClassEvents.length - 1; mi >= 0; mi -= 1) {
    if (deckWithClassEvents[mi].type === 'monster') {
      lastMonsterDeckIndex = mi;
      break;
    }
  }

  // --- Build deal queue ---
  const dealQueue = [...deckWithClassEvents];

  const ensureRowHasMonster = (row: GameCardData[], queue: GameCardData[]) => {
    if (row.some(c => c.type === 'monster')) return;
    const qMonsterIdx = queue.findIndex(c => c.type === 'monster');
    if (qMonsterIdx < 0) return;
    const [rowSwapIdx, rngR] = nextInt(rng, 0, row.length - 1);
    rng = rngR;
    const tmp = row[rowSwapIdx];
    row[rowSwapIdx] = queue[qMonsterIdx];
    queue[qMonsterIdx] = tmp;
  };

  // Deal a single row as one DUNGEON_COLUMN_COUNT-card batch from dealQueue.
  // Stacking has been removed, so the entire batch becomes the row's base
  // cards. Aligns each row with one CHUNK (=DUNGEON_COLUMN_COUNT), so the
  // monster-density balancing carries over to per-row composition
  // (≥1 and ≤2 monsters per row).
  const dealRowBatch = (): { row: GameCardData[] } => {
    const batch = dealQueue.splice(0, DUNGEON_COLUMN_COUNT);
    return { row: batch };
  };

  // --- Preview row: deal DUNGEON_COLUMN_COUNT cards ---
  const { row: previewRaw } = dealRowBatch();
  ensureRowHasMonster(previewRaw, dealQueue);
  const initialPreview = fillActiveRowSlots(previewRaw).map((card) => {
    if (!card) return null;
    const raged = applyMonsterRage(card, initialTurnCount + 1, isQuickMode);
    if (deckWithClassEvents.indexOf(card) === lastMonsterDeckIndex && raged.type === 'monster') {
      return { ...raged, isFinalMonster: true, description: FINAL_MONSTER_MARK_DESCRIPTION };
    }
    return raged;
  }) as ActiveRowSlots;

  // --- Preview stack: stacking removed; preview cells hold one card each. ---
  const initialPreviewStacks: Record<number, GameCardData[]> = {};

  // --- Active row: deal next DUNGEON_COLUMN_COUNT cards ---
  const { row: activeRaw } = dealRowBatch();
  ensureRowHasMonster(activeRaw, dealQueue);
  const initialActive = fillActiveRowSlots(activeRaw).map((card) => {
    if (!card) return null;
    const raged = applyMonsterRage(card, initialTurnCount, isQuickMode);
    if (deckWithClassEvents.indexOf(card) === lastMonsterDeckIndex && raged.type === 'monster') {
      return { ...raged, isFinalMonster: true, description: FINAL_MONSTER_MARK_DESCRIPTION };
    }
    return raged;
  }) as ActiveRowSlots;

  // --- Active stack: stacking removed; active cells hold one card each. ---
  const initialActiveStacks: Record<number, GameCardData[]> = {};

  // --- Re-balance monster density in dealQueue after initial dealing ---
  // CHUNK must match the `dealRowBatch` batch size (DUNGEON_COLUMN_COUNT) so
  // each future waterfall preview row also satisfies the 1-2 monster invariant.
  {
    const MIN_MONSTERS = 1;
    const MAX_MONSTERS = 2;
    const CHUNK = DUNGEON_COLUMN_COUNT;
    for (let start = 0; start + CHUNK <= dealQueue.length; start += CHUNK) {
      const chunkEnd = start + CHUNK;
      const monsterIndices: number[] = [];
      const nonMonsterIndices: number[] = [];
      for (let j = start; j < chunkEnd; j++) {
        if (dealQueue[j].type === 'monster') monsterIndices.push(j);
        else nonMonsterIndices.push(j);
      }
      while (monsterIndices.length > MAX_MONSTERS) {
        const excessIdx = monsterIndices.pop()!;
        let swapTarget = -1;
        for (let k = chunkEnd; k < dealQueue.length; k++) {
          if (dealQueue[k].type !== 'monster') { swapTarget = k; break; }
        }
        if (swapTarget === -1) {
          for (let k = start - 1; k >= 0; k--) {
            if (dealQueue[k].type !== 'monster') { swapTarget = k; break; }
          }
        }
        if (swapTarget >= 0) {
          const tmp = dealQueue[excessIdx];
          dealQueue[excessIdx] = dealQueue[swapTarget];
          dealQueue[swapTarget] = tmp;
        } else {
          break;
        }
      }
      while (monsterIndices.length < MIN_MONSTERS) {
        const fillIdx = nonMonsterIndices.pop()!;
        if (fillIdx === undefined) break;
        let swapTarget = -1;
        for (let k = chunkEnd; k < dealQueue.length; k++) {
          if (dealQueue[k].type === 'monster') { swapTarget = k; break; }
        }
        if (swapTarget === -1) {
          for (let k = start - 1; k >= 0; k--) {
            if (dealQueue[k].type === 'monster') { swapTarget = k; break; }
          }
        }
        if (swapTarget >= 0) {
          const tmp = dealQueue[fillIdx];
          dealQueue[fillIdx] = dealQueue[swapTarget];
          dealQueue[swapTarget] = tmp;
          monsterIndices.push(fillIdx);
        } else {
          break;
        }
      }
    }
  }

  // --- Mark final monster in remaining deck ---
  const initialRemaining = dealQueue.map((card) => {
    const origIdx = deckWithClassEvents.indexOf(card);
    if (origIdx === lastMonsterDeckIndex && card.type === 'monster') {
      return { ...card, isFinalMonster: true, description: FINAL_MONSTER_MARK_DESCRIPTION };
    }
    return card;
  });

  // --- Hero + class deck ---
  const [newHero, rng3] = getRandomHero(rng);
  rng = rng3;
  const newHeroClass = (newHero.classTitle ?? '').toLowerCase();
  let newClassDeck: GameCardData[];
  if (newHeroClass === 'knight') {
    const [deck, rng4] = generateKnightDeck(rng);
    rng = rng4;
    newClassDeck = deck;
  } else {
    newClassDeck = [];
  }

  let classCardPreviewId: string | null = null;
  if (newClassDeck.length > 0) {
    const [picked, rng5] = pickRandom(newClassDeck, rng);
    rng = rng5;
    classCardPreviewId = picked.id;
  }

  // --- Build full initial state ---
  const newState: GameState = {
    ...createInitialGameState(),
    gameMode: mode,
    turnCount: initialTurnCount,
    heroVariant: newHero,
    heroClass: newHeroClass,
    previewCards: initialPreview,
    activeCards: initialActive,
    previewCardStacks: initialPreviewStacks,
    activeCardStacks: initialActiveStacks,
    remainingDeck: initialRemaining,
    classDeck: newClassDeck,
    eternalRelics,
    showSkillSelection: true,
    totalWins,
    classCardPreviewId,
    rng,
  };

  return {
    state: newState,
    sideEffects: [{ event: 'game:started', payload: {} }],
    enqueuedActions: [],
  };
}
