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
  // CHUNK must equal `dealRowBatch`'s batch size (6 = 5 row slots + 1 stack
  // card). Otherwise the first batch can straddle two chunks and pull in an
  // extra monster from the next chunk's head, exceeding the per-row monster
  // cap (regression observed on quick mode where CHUNK was 5).
  {
    const MIN_MONSTERS = 1;
    const MAX_MONSTERS = 2;
    const CHUNK = 6;
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

  // --- Guarantee at least one monster among the last 3 cards ---
  {
    const len = deckWithClassEvents.length;
    if (len >= 3) {
      const tail = deckWithClassEvents.slice(len - 3);
      const hasMonsterInTail = tail.some(c => c.type === 'monster');
      if (!hasMonsterInTail) {
        let swapIdx = -1;
        for (let i = len - 4; i >= 0; i--) {
          if (deckWithClassEvents[i].type === 'monster') {
            swapIdx = i;
            break;
          }
        }
        if (swapIdx >= 0) {
          const [targetOff, rngT] = nextInt(rng, 0, 2);
          rng = rngT;
          const targetIdx = len - 1 - targetOff;
          const tmp = deckWithClassEvents[swapIdx];
          deckWithClassEvents[swapIdx] = deckWithClassEvents[targetIdx];
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

  // Deal a single row as one 6-card batch from dealQueue:
  //   - 1 non-monster from the batch becomes the stack card
  //   - the remaining 5 become the row's base cards
  // Aligns each row with one CHUNK (=6 in normal mode), so monster-density
  // balancing carries over to per-row composition (≤2 monsters per row).
  // If the batch happens to be all monsters, swap one with a non-monster
  // from the rest of the queue so the row can still have a stack card.
  const dealRowBatch = (): { row: GameCardData[]; stackCard: GameCardData | null } => {
    const batch = dealQueue.splice(0, 6);
    let stackBatchIdx = batch.findIndex(c => c.type !== 'monster');

    if (stackBatchIdx < 0 && batch.length > 0) {
      const queueNonMonsterIdx = dealQueue.findIndex(c => c.type !== 'monster');
      if (queueNonMonsterIdx >= 0) {
        const [batchIdx, rngB] = nextInt(rng, 0, batch.length - 1);
        rng = rngB;
        const tmp = batch[batchIdx];
        batch[batchIdx] = dealQueue[queueNonMonsterIdx];
        dealQueue[queueNonMonsterIdx] = tmp;
        stackBatchIdx = batchIdx;
      }
    }

    let stackCard: GameCardData | null = null;
    if (stackBatchIdx >= 0) {
      stackCard = batch.splice(stackBatchIdx, 1)[0];
    }
    return { row: batch, stackCard };
  };

  // --- Preview row: deal 6 cards (5 base + 1 stack) ---
  const { row: previewRaw, stackCard: previewStackCard } = dealRowBatch();
  ensureRowHasMonster(previewRaw, dealQueue);
  const initialPreview = fillActiveRowSlots(previewRaw).map((card) => {
    if (!card) return null;
    const raged = applyMonsterRage(card, initialTurnCount + 1, isQuickMode);
    if (deckWithClassEvents.indexOf(card) === lastMonsterDeckIndex && raged.type === 'monster') {
      return { ...raged, isFinalMonster: true, description: FINAL_MONSTER_MARK_DESCRIPTION };
    }
    return raged;
  }) as ActiveRowSlots;

  // --- Preview stack: place stack card on a random non-monster preview cell ---
  const initialPreviewStacks: Record<number, GameCardData[]> = {};
  if (previewStackCard) {
    const nonMonsterPreviewIndices = initialPreview
      .map((c, i) => (c && c.type !== 'monster' ? i : -1))
      .filter(i => i >= 0);
    if (nonMonsterPreviewIndices.length > 0) {
      const [picked, rngP] = pickRandom(nonMonsterPreviewIndices, rng);
      rng = rngP;
      initialPreviewStacks[picked] = [applyMonsterRage(previewStackCard, initialTurnCount + 1, isQuickMode)];
    }
  }

  // --- Active row: deal next 6 cards (5 base + 1 stack) ---
  const { row: activeRaw, stackCard: activeStackCard } = dealRowBatch();
  ensureRowHasMonster(activeRaw, dealQueue);
  const initialActive = fillActiveRowSlots(activeRaw).map((card) => {
    if (!card) return null;
    const raged = applyMonsterRage(card, initialTurnCount, isQuickMode);
    if (deckWithClassEvents.indexOf(card) === lastMonsterDeckIndex && raged.type === 'monster') {
      return { ...raged, isFinalMonster: true, description: FINAL_MONSTER_MARK_DESCRIPTION };
    }
    return raged;
  }) as ActiveRowSlots;

  // --- Active stack: place stack card on a random non-monster active cell ---
  const initialActiveStacks: Record<number, GameCardData[]> = {};
  if (activeStackCard) {
    const nonMonsterActiveIndices = initialActive
      .map((c, i) => (c && c.type !== 'monster' ? i : -1))
      .filter(i => i >= 0);
    if (nonMonsterActiveIndices.length > 0) {
      const [picked, rngP] = pickRandom(nonMonsterActiveIndices, rng);
      rng = rngP;
      initialActiveStacks[picked] = [applyMonsterRage(activeStackCard, initialTurnCount, isQuickMode)];
    }
  }

  // --- Re-balance monster density in dealQueue after initial dealing ---
  // CHUNK must match the `dealRowBatch` batch size (6) for the same reason
  // as the pre-deal balancing above.
  {
    const MIN_MONSTERS = 1;
    const MAX_MONSTERS = 2;
    const CHUNK = 6;
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
