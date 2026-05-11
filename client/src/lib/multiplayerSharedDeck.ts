/**
 * Build the shared 36-card deck used by both players in a multiplayer room.
 *
 * The room HOST (player A) calls `buildSharedDeck(seed)` once when creating
 * the room; the resulting deck is uploaded to Supabase via
 * `/api/mp/create-room`. Player B downloads the same deck via
 * `/api/mp/join-room`. Both players then run `INIT_MULTIPLAYER_GAME` with
 * this exact card sequence, so:
 *
 *   - Their preview rows are deterministic slices: A=[0..3], B=[4..7]
 *   - Their `remainingDeck` is identical (cards [8..35]) at game start
 *   - Future waterfalls reveal the same shared cards in the same order
 *     on both sides (until a transferred prefix accumulates per side)
 *
 * The deck is constructed by:
 *   1. `createDeck('multiplayer', rng)` — pulls the same card pool single-
 *      player uses (knight class events get added on top, but those are
 *      per-player so they're explicitly NOT included here).
 *   2. Pruning event choices to 3 (matches single-player behavior).
 *   3. Shuffling with the seeded RNG.
 *   4. Quick-mode monster-balancing: 1 monster per non-overlapping 4-card
 *      chunk + leftover monsters in the back-18 zone. Mirrors the
 *      `reduceInitGame` quick-mode placement to keep gameplay parity.
 *   5. Boss-marking the last monster (so both players see the same final
 *      boss when the dungeon empties).
 *
 * Note: knight class events / knight-class deck are NOT included in the
 * shared deck — they're per-player content. Each player's
 * `INIT_MULTIPLAYER_GAME` reducer generates their own knight deck locally.
 */

import type { GameCardData } from '@/components/GameCard';
import {
  createDeck,
  pruneEventChoicesToThree,
} from '@/game-core/deck';
import { FINAL_MONSTER_MARK_DESCRIPTION } from '@/game-core/constants';
import { shuffle as rngShuffle, nextInt, createRng } from '@/game-core/rng';
import type { RngState } from '@/game-core/rng';

/**
 * Mirror of `bakeFinalBoss` from `rules/init.ts`. Kept as a private copy
 * because it's a tiny pure transform and the source isn't exported.
 *
 * If you change the boss-marking convention here, also update
 * `client/src/game-core/rules/init.ts:bakeFinalBoss`.
 */
function bakeFinalBoss(card: GameCardData): GameCardData {
  return {
    ...card,
    isFinalMonster: true,
    bossPhase: true,
    bossEnrageGraveyardSummon: 4,
    hasRevive: true,
    reviveUsed: false,
    name: `${card.name} (Boss)`,
    description: FINAL_MONSTER_MARK_DESCRIPTION,
  };
}

/**
 * Build the shared deck. Returns the deck and the seed it was generated
 * from (so the lobby can persist `shared_deck_seed` to Supabase for
 * future replay / determinism debugging).
 *
 * If `seed` is omitted, `Date.now()` is used. The lobby should always
 * provide one explicitly for reproducibility.
 */
export function buildSharedDeck(seed?: number): {
  deck: GameCardData[];
  seed: number;
} {
  const actualSeed = seed ?? Date.now();
  let rng: RngState = createRng(actualSeed);

  // 1. Construct the raw card pool. We use the 'multiplayer' branch but
  //    note that `createDeck` currently treats both single & multiplayer
  //    identically (both use the 36-card "quick" pool); the parameter is
  //    kept so future divergence (e.g. a 72-card multiplayer pool) is a
  //    one-line change.
  const [pool, rng2] = createDeck('multiplayer', rng);
  rng = rng2;

  // 2. Prune event choices to 3 (per-card RNG, mirrors `reduceInitGame`).
  for (let i = 0; i < pool.length; i++) {
    if (pool[i].type === 'event') {
      const [pruned, rngP] = pruneEventChoicesToThree(pool[i], rng);
      rng = rngP;
      pool[i] = pruned;
    }
  }

  // 3. Shuffle.
  let shuffled: GameCardData[];
  {
    const [s, r] = rngShuffle([...pool], rng);
    rng = r;
    shuffled = s;
  }

  // 4. Quick-mode monster placement. Verbatim port of the `isQuickMode`
  //    branch in `reduceInitGame` (init.ts ~L105–167). We don't share the
  //    code because the reducer's version is wrapped in a long function
  //    that consumes a partial state; copying a focused 60-line block is
  //    less risky than refactoring the reducer.
  const len = shuffled.length;
  const eliteMonsters = shuffled.filter(c => c.monsterSpecial);
  const nonEliteMonsters = shuffled.filter(
    c => c.type === 'monster' && !c.monsterSpecial,
  );
  const nonMonsters = shuffled.filter(c => c.type !== 'monster');

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

  for (
    let chunkIdx = 0;
    chunkIdx < numChunks && monsterIdx < monsters.length;
    chunkIdx++
  ) {
    const start = chunkIdx * 4;
    const [slotOff, rngS] = nextInt(rng, 0, 3);
    rng = rngS;
    result[start + slotOff] = monsters[monsterIdx++];
  }

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

  let arranged = result as GameCardData[];

  // 5. Push elites out of the first 16 cards (quick-mode rule).
  for (let i = 0; i < Math.min(16, arranged.length); i++) {
    if (arranged[i].monsterSpecial) {
      let swapTarget = -1;
      for (let k = 16; k < arranged.length; k++) {
        if (
          arranged[k].type === 'monster' &&
          !arranged[k].monsterSpecial
        ) {
          swapTarget = k;
          break;
        }
      }
      if (swapTarget >= 0) {
        const tmp = arranged[i];
        arranged[i] = arranged[swapTarget];
        arranged[swapTarget] = tmp;
      }
    }
  }

  // 6. Boss-mark the last monster (stable across A and B because the deck
  //    sequence is identical). Both players' INIT_MULTIPLAYER_GAME reducers
  //    will see the same boss when the deck empties.
  let lastMonsterIdx = -1;
  for (let i = arranged.length - 1; i >= 0; i--) {
    if (arranged[i].type === 'monster') {
      lastMonsterIdx = i;
      break;
    }
  }
  if (lastMonsterIdx >= 0) {
    arranged = arranged.map((card, i) =>
      i === lastMonsterIdx ? bakeFinalBoss(card) : card,
    );
  }

  return { deck: arranged, seed: actualSeed };
}
