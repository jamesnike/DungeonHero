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
import {
  createDeck,
  pruneEventChoicesToThree,
  createBugletCard,
  eventScrollImage,
  createStarterDiscoverClassToHandCard,
  createApprenticeBoltCard,
} from '../deck';
import { fillActiveRowSlots } from '../helpers';
import { shuffle as rngShuffle, nextInt } from '../rng';
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
  const initialTurnCount = isQuickMode ? 1 : INITIAL_TURN_COUNT;

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
      // Quick-mode monster layout:
      //   • Each non-overlapping 4-card chunk holds EXACTLY one monster.
      //   • Leftover monsters (count > number of chunks) are placed in random
      //     empty positions within the back 18 cards.
      //   • Non-monster cards fill the remaining slots in shuffled order.
      // Elites are pushed out of the first 16 cards by a later step.
      const len = deckWithClassEvents.length;
      let monsters: GameCardData[];
      {
        const [s, r] = rngShuffle([...eliteMonsters, ...nonEliteMonsters], rng);
        rng = r;
        monsters = s;
      }
      let nonMonstersShuffled: GameCardData[];
      {
        const [s, r] = rngShuffle(nonMonsters, rng);
        rng = r;
        nonMonstersShuffled = s;
      }

      const result: (GameCardData | null)[] = new Array(len).fill(null);
      const numChunks = Math.floor(len / 4);
      let monsterIdx = 0;

      for (let chunkIdx = 0; chunkIdx < numChunks && monsterIdx < monsters.length; chunkIdx++) {
        const start = chunkIdx * 4;
        const [slotOff, rngS] = nextInt(rng, 0, 3);
        rng = rngS;
        result[start + slotOff] = monsters[monsterIdx++];
      }

      // Snap back18Start to the next chunk boundary so leftover monsters can't
      // straddle the boundary into an "early" chunk (e.g. for a 36-card deck
      // back18Start = 18 sits inside chunk 4 [16-19]; without snapping, the
      // leftover landing at pos 18 or 19 would give chunk 4 two monsters).
      // Positions past `numChunks * 4` are outside any chunk and always safe.
      const rawBack18Start = Math.max(0, len - 18);
      const back18Start = Math.max(rawBack18Start, Math.ceil(rawBack18Start / 4) * 4);
      while (monsterIdx < monsters.length) {
        const emptySlots: number[] = [];
        for (let i = back18Start; i < len; i++) {
          if (result[i] === null) emptySlots.push(i);
        }
        if (emptySlots.length === 0) break;
        const [pickIdx, rngP] = nextInt(rng, 0, emptySlots.length - 1);
        rng = rngP;
        result[emptySlots[pickIdx]] = monsters[monsterIdx++];
      }
      while (monsterIdx < monsters.length) {
        const idx = result.findIndex(c => c === null);
        if (idx < 0) break;
        result[idx] = monsters[monsterIdx++];
      }

      let nmIdx = 0;
      for (let i = 0; i < len; i++) {
        if (result[i] === null) {
          result[i] = nonMonstersShuffled[nmIdx++] ?? null;
        }
      }

      deckWithClassEvents.splice(0, deckWithClassEvents.length, ...(result as GameCardData[]));
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

      // Ensure the early elite lands at index 16 or later (not in the first 16 cards)
      if (earlyElite && firstHalf.length > 16) {
        const eliteIdx = firstHalf.indexOf(earlyElite);
        if (eliteIdx >= 0 && eliteIdx < 16) {
          const [swapTarget, rngSw] = nextInt(rng, 16, firstHalf.length - 1);
          rng = rngSw;
          const tmp = firstHalf[eliteIdx];
          firstHalf[eliteIdx] = firstHalf[swapTarget];
          firstHalf[swapTarget] = tmp;
        }
      }

      deckWithClassEvents.splice(0, deckWithClassEvents.length, ...firstHalf, ...secondHalf);
    }
  }

  // --- Balance monster density per chunk (normal mode only) ---
  // 1-2 monsters per non-overlapping chunk. CHUNK must equal `dealRowBatch`'s
  // batch size (DUNGEON_COLUMN_COUNT) so the first batch lines up with one
  // chunk and per-row monster invariants are preserved as the deck is
  // consumed.
  // Quick mode skips this pass — its bespoke placement above (1 monster per
  // chunk + 1 leftover in back-18) is already optimal and any rebalance here
  // would either move the leftover out of the back-18 zone or push an extra
  // monster into the early chunks.
  if (!isQuickMode) {
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

  // --- Quick mode: push elites out of first 16 cards ---
  if (isQuickMode) {
    for (let i = 0; i < Math.min(16, deckWithClassEvents.length); i++) {
      if (deckWithClassEvents[i].monsterSpecial) {
        let swapTarget = -1;
        for (let k = 16; k < deckWithClassEvents.length; k++) {
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
  // Normal mode only — the front half is already monster-balanced by the chunk
  // pass above; we only need to make sure the deck doesn't run dry of monsters
  // near the end so the final waterfall(s) can still field a monster row.
  // Quick mode handles its own back-18 placement in the layout step above.
  if (!isQuickMode) {
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

  // --- Active row: fixed tutorial-style first row ---
  // Always start with [1 Buglet + 3 fixed Events] in random L→R order, on
  // top of the procedurally-generated dungeon (does NOT consume from
  // dealQueue, so the dungeon length effectively grows by 1 row).
  const fixedRowCards = buildFixedFirstActiveRow();
  let fixedRowShuffled: GameCardData[];
  [fixedRowShuffled, rng] = rngShuffle([...fixedRowCards], rng);
  const initialActive = fillActiveRowSlots(fixedRowShuffled).map((card) => {
    if (!card) return null;
    // applyMonsterRage is a no-op for non-monster types (events pass through
    // unchanged); the lone buglet still scales with `initialTurnCount`.
    return applyMonsterRage(card, initialTurnCount, isQuickMode);
  }) as ActiveRowSlots;

  // --- Active stack: stacking removed; active cells hold one card each. ---
  const initialActiveStacks: Record<number, GameCardData[]> = {};

  // --- Re-balance monster density in dealQueue after initial dealing ---
  // Normal mode: 1-2 monsters per chunk. CHUNK must match `dealRowBatch` batch
  // size (DUNGEON_COLUMN_COUNT) so each future waterfall preview row satisfies
  // the invariant.
  // Quick mode skips this pass for the same reason as the init-time chunk
  // pass: the bespoke placement is already optimal and rebalancing would
  // disturb the back-18 leftover monster.
  if (!isQuickMode) {
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

  // --- Starting hand: every run begins with one Perm-1 「专属感召」 ---
  // Replaces the now-removed `waterfall-discover` eternal relic. The card
  // discovers a class card (3-of-N) directly into hand on play; afterwards
  // it cycles through the recycle bag for 1 waterfall.
  const initialHand: GameCardData[] = [createStarterDiscoverClassToHandCard()];

  // --- Starting backpack: 学徒法弹 (Perm-1 magic) ---
  // Single opening Perm-1 magic seeded directly into the backpack at INIT_GAME:
  // 学徒法弹 (1 spell damage). Not part of `createStarterCardPool`, so never
  // appears in discover / grant events—only exists as an opening backpack card.
  // recycleDelay:1 means it cycles back from the recycle bag after 1 waterfall,
  // providing a low-floor opening tool on every run.
  const initialBackpack: GameCardData[] = [
    createApprenticeBoltCard(),
  ];

  // --- Build full initial state ---
  const newState: GameState = {
    ...createInitialGameState(),
    gameMode: mode,
    turnCount: initialTurnCount,
    heroVariant: newHero,
    heroClass: newHeroClass,
    handCards: initialHand,
    backpackItems: initialBackpack,
    previewCards: initialPreview,
    activeCards: initialActive,
    previewCardStacks: initialPreviewStacks,
    activeCardStacks: initialActiveStacks,
    remainingDeck: initialRemaining,
    classDeck: newClassDeck,
    eternalRelics,
    showSkillSelection: false,
    totalWins,
    rng,
  };

  return {
    state: newState,
    sideEffects: [{ event: 'game:started', payload: {} }],
    enqueuedActions: [],
  };
}

// ---------------------------------------------------------------------------
// Fixed opening row
// ---------------------------------------------------------------------------

/**
 * Build the deterministic first active row that every new game starts with:
 * one Buglet plus three event cards that hand out a tasting-menu of starter
 * pool rewards. The 6-round opening starter draft has been replaced by these
 * three events — they cover Equipment / Amulet→Potion / 2×Magic→Magic.
 *
 * Each event uses tokens defined in `events.ts:applySimpleEffect`:
 *   - `discoverStarterEquipment` / `discoverStarterPotion` /
 *     `discoverStarterAmulet` — discover-1-of-3 from the starter pool.
 *   - `discoverStarterMagic` — already exists; reused by the magic event.
 *   - `grantStarterMagicTwo` — direct grant of 2 random starter magics
 *     (no UI pick).
 *
 * Order along the row is randomized by the caller via `rngShuffle`.
 */
function buildFixedFirstActiveRow(): GameCardData[] {
  const equipmentEvent: GameCardData = {
    id: 'fixed-row-event-equipment',
    type: 'event',
    name: '装备发现',
    value: 0,
    image: eventScrollImage,
    description: '从起始背包卡池中发现一张装备（武器或盾牌），直接加入手牌。',
    shortDescription: '发现一张起始装备 → 进手牌',
    eventChoices: [
      {
        text: '发现一张起始装备',
        effect: 'discoverStarterEquipment',
        hint: '从起始背包候选装备池中三选一，直接进入手牌（手牌满则进背包）',
      },
    ],
  };

  const amuletThenPotionEvent: GameCardData = {
    id: 'fixed-row-event-amulet',
    type: 'event',
    name: '护符发现',
    value: 0,
    image: eventScrollImage,
    description: '发现一张起始护符，直接加入手牌。完成后翻转为「药水发现」。',
    shortDescription: '发现护符 → 进手牌 → 翻为「药水发现」',
    eventChoices: [
      {
        text: '发现一张起始护符',
        effect: 'discoverStarterAmulet',
        hint: '从起始背包候选护符池中三选一，直接进入手牌（手牌满则进背包）',
      },
    ],
    flipTarget: {
      toCard: {
        id: 'fixed-row-event-amulet-flip',
        type: 'event',
        name: '药水发现',
        value: 0,
        image: eventScrollImage,
        description: '从起始背包卡池中发现一张药水。',
        shortDescription: '发现一张起始药水',
        eventChoices: [
          {
            text: '发现一张药水',
            effect: 'discoverStarterPotion',
            hint: '从起始背包候选药水池中三选一',
          },
        ],
      },
      destination: 'stay',
      message: '护符发现翻转为「药水发现」！',
    },
  };

  const magicGrantThenDiscoverEvent: GameCardData = {
    id: 'fixed-row-event-magic',
    type: 'event',
    name: '魔法馈赠',
    value: 0,
    image: eventScrollImage,
    description: '获得 2 张起始背包的魔法卡。完成后翻转为「魔法发现」。',
    shortDescription: '获得 2 张起始魔法 → 翻为「魔法发现」',
    eventChoices: [
      {
        text: '获得 2 张起始魔法',
        effect: 'grantStarterMagicTwo',
        hint: '直接获得 2 张随机起始魔法（背包满则进入回收袋）',
      },
    ],
    flipTarget: {
      toCard: {
        id: 'fixed-row-event-magic-flip',
        type: 'event',
        name: '魔法发现',
        value: 0,
        image: eventScrollImage,
        description: '从起始背包卡池中发现一张魔法。',
        shortDescription: '发现一张起始魔法',
        eventChoices: [
          {
            text: '发现一张起始魔法',
            effect: 'discoverStarterMagic',
            hint: '从起始背包候选魔法池中三选一',
          },
        ],
      },
      destination: 'stay',
      message: '魔法馈赠翻转为「魔法发现」！',
    },
  };

  return [
    createBugletCard(),
    equipmentEvent,
    amuletThenPotionEvent,
    magicGrantThenDiscoverEvent,
  ];
}
