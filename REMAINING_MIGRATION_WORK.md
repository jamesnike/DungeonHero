# Remaining Game-Core Migration Work

## Current Status (Post Rules-to-Reducers Migration)

- **200** GameAction interfaces defined, all with reducer implementations
- **11** reducer rule modules (turn, combat, cards, shop, dungeon, events, hero, ui-state, economy, init, waterfall)
- **281** game-core tests passing (incl. 13 RNG + 5 replay determinism tests)
- **0** `patchState` / `updateField` / `useEngineSetter` calls remaining
- **0** `SET_STATE` dispatches remaining — **action type fully removed from codebase**
- **0** `await` calls in hooks — **all async patterns eliminated**
- **0** `async` function signatures in hooks — **fully synchronous hook layer**
- **0** `Math.random()` in game-rule code — **all game RNG is seeded via Mulberry32 PRNG**
- **0** `Date.now()` for ID generation in game-rule code — **replaced with seeded `nextId`**
- **0** non-RNG `SET_GAME_FLAGS` remaining — **all converted to typed actions**
- **100** `SET_GAME_FLAGS` remaining — **all are RNG-only patches (`{ rng }` / `{ rng: var }`)**
- **40** `useEffect` hooks in GameBoard.tsx (all reclassified as UI-bridge or state-init)

---

## ~~Remaining Work Item 1: Convert 67 SET_STATE → Typed Actions~~ — COMPLETED

All 67 `SET_STATE` dispatches converted to typed actions. The `SET_STATE` action type has been removed from the codebase.

---

## ~~Remaining Work Item 2: Convert ~153 Hook Awaits → Pipeline Pause/Resume~~ — COMPLETED

All 153 `await` calls in hooks eliminated:
- **Phase 1**: Removed spurious async from `finalizePotionCard`/`resolveHeal`/`applyCardFlip` (~58 awaits)
- **Phase 2**: Converted animation awaits to fire-and-forget (~32 awaits)
- **Phase 3**: Converted dynamic imports to static imports (~4 awaits)
- **Phase 4**: Converted compound operations to reducer actions (~11 awaits)
- **Phase 5**: Converted interactive flows to `.then()` + `RESOLVE_*` reducer pipeline (~48 awaits)
- All `async` function signatures removed from hooks

---

## ~~Remaining Work Item 4: GameBoard.tsx useEffect Cleanup~~ — COMPLETED

Reduced from 45 to 40 `useEffect` hooks. All remaining effects are legitimate UI-bridge or state-init:

### Rule-driver effects migrated to reducer pipeline (5 removed):
- **DEQUEUE_MONSTER_REWARD** → `MONSTER_DEFEATED` and `APPLY_MONSTER_REWARD` enqueue it; `SET_GHOST_BLADE_EXILE_CARDS` enqueues when clearing
- **Waterfall trigger** → `postProcessActiveCards` in reducer.ts auto-enqueues `TRIGGER_WATERFALL` when >= 4 columns empty
- **Honor sweep upgrade gating** → `CHECK_HONOR_SWEEP_UPGRADES` dispatched after honor sweep kills and from `APPLY_MONSTER_REWARD`
- **Turn transition ref clear** → Converted to inline render-time code (defensive ref reset)
- **Wraith passive unlock popup** → Removed as dead code (ref was never set to true)

### Hybrid effects cleaned up (2 simplified):
- **Dungeon card slot-cleared tracking** → Moved to `postProcessActiveCards` in reducer.ts (auto-enqueues `REGISTER_DUNGEON_CARD_PROCESSED`)
- **Backpack-store animation tracking** → Simplified to UI-only ref cleanup (no longer calls `registerDungeonCardProcessed`)

### Reclassified as UI-bridge (kept as-is):
- **Graveyard discover resolver cleanup** → Defensive ref cleanup when state clears (primary cleanup is at call sites)

### Remaining 40 useEffects breakdown:
- **28** pure UI-bridge (resize, DOM, animation, ref sync, drag listeners, CSS vars, layout)
- **1** state-init (game load/hydrate on mount)
- **7** animation/presentation bookkeeping (waterfall sequence, tab visibility, hand delivery, drawPending delay)
- **2** ref sync (discardedCardsRef, handCardsRef)
- **2** desktop/mobile drag-drop hero row

### Other cleanup:
- **`beginDiscoverFlowAsync`** removed — was dead code (never called, only type-defined and passed as prop)

---

## ~~Remaining Work Item 3: Add Seeded RNG for Deterministic Replay~~ — COMPLETED

### Implementation
- **Algorithm:** Mulberry32 (32-bit state, uniform float output)
- **Module:** `client/src/game-core/rng.ts` — pure functions: `createRng`, `nextRandom`, `nextInt`, `nextBool`, `shuffle`, `pickRandom`, `nextId`
- **State:** `rng: RngState` on `GameState` (seed + state fields)
- **Action:** `SEED_RNG` resets PRNG to a given seed (for new game / replay start)
- **Persistence:** Serialized/deserialized with game saves; old saves fallback to `createRng(Date.now())`

### Migration scope
| Layer | Files | Calls migrated |
|-------|-------|---------------|
| game-core domain helpers | 5 (helpers, cards, combat, monsters, shop) | ~22 |
| game-core reducer rules | 5 (combat, cards, turn, equipment-effects, dungeon) | ~33 |
| game-core deck/events | 2 (deck, events) | ~37 |
| hooks | 6 (eventSystem, cardPlay, shop, cardOps, hero, combat) | ~78 |
| components/lib game logic | 8 (GameBoard, utils, CardDraft, HeroSkill, heroes, knightDeck, relics) | ~64 |

### NOT migrated (~75 calls — visual-only, by design)
- `DiceRoller.tsx` — 3D animation spin/twist
- `StackedCardPile.tsx` — visual card jitter
- `GameBoard.tsx` — flight animation arcs/positions/durations
- `sidebar.tsx` — layout skeleton

### Tests
- 13 unit tests for PRNG module (determinism, range, distribution, shuffle, pickRandom, nextId)
- 5 replay tests (SEED_RNG, action sequence determinism, DRAW_CARDS determinism, OPEN_SHOP determinism)

---

## Remaining Promise Patterns (7 sites — intentional UI bridges)

These are `new Promise` constructors in hooks that serve as UI interaction bridges. They open a modal and resolve when the user makes a choice. They do NOT contain game rule logic — the rule logic is in the `.then()` callbacks or `RESOLVE_*` reducer handlers.

| File | Function | Pattern | Status |
|------|----------|---------|--------|
| `useEventSystem.ts` | `requestDiceOutcome` | Promise + resolver ref | Keep (UI bridge) |
| `useEventSystem.ts` | `requestMagicChoice` | Promise + resolver ref | Keep (UI bridge) |
| `useEventSystem.ts` | `requestEquipmentSelection` | Promise + resolver ref | Keep (UI bridge) |
| `useShopHandlers.ts` | `requestGraveyardSelection` | Promise + resolver ref | Keep (UI bridge) |
| `useShopHandlers.ts` | `triggerGhostBladeExile` | Promise + resolver ref | Keep (UI bridge) |
| `useShopHandlers.ts` | `requestCardAction` | Promise + resolver ref | Keep (UI bridge) |
| `useCardOperations.ts` | `triggerEventTransform` | Promise + onComplete | Keep (animation) |

These could be converted to a fully callback-based pattern in a future phase, but they are low priority since they don't contain rule logic.

---

## ~~Remaining Work Item 5: Rules-to-Reducers — Eliminate Rule Logic from Hooks and GameBoard~~ — COMPLETED

Converted "compute in hook, patch via SET_GAME_FLAGS" patterns to "dispatch typed action, let reducer compute result".

### Phase 0: Date.now() → nextId(rng)
- Replaced 7 `Date.now()` ID generation calls with seeded `nextId` in hooks (useCardPlayHandlers, useEventSystem, useShopHandlers)

### Phase 1A: Deduplicate generateMonsterRewardOptions
- Merged the 289-line GameBoard.tsx version into `game-core/monsters.ts` as a pure function accepting `(monster, state, rng)` → `[options[], rng]`
- Inlined 5 helper functions (`hasRepairableEquipment`, `isUpgradeableCard`, `isCardAtMaxUpgrade`, `slotLabel`, `bonusLabel`)

### Phase 1B: initGame → INIT_GAME reducer action
- Moved ~413 lines of deck construction, event pruning, monster balancing, hero selection, and deal queue building from GameBoard.tsx to `game-core/rules/init.ts`
- Added `classCardPreviewId: string | null` to `GameState`
- GameBoard.tsx `initGame` reduced to single dispatch + UI ref resets

### Phase 1C: Waterfall rule logic → reducer actions + pure functions
- Extracted `computeWaterfallDropPlan` (~175 lines of drop-assignment computation) to `game-core/rules/waterfall.ts`
- Extracted `reduceApplyWaterfallTurnReset` (~120 lines of per-turn state resets) as `WATERFALL_TURN_RESET` action
- Extracted `computeReturnToDeckInsertion` helper for returnToDeck discard effect

### Phase 2: Equipment/slot SET_GAME_FLAGS → 6 typed actions
- `SET_SLOT_ATTACK_BURST`, `CLEAR_BERSERK_BUFF`, `ADD_BERSERK_BUFF`
- `SET_EQUIPMENT_SLOT_CAPACITY`, `SET_EQUIPMENT_RESERVE`, `SET_EQUIPMENT_SLOT_BONUS`

### Phase 3: Card/deck UPDATE_* → 5 typed actions
- `ADD_CARD_TO_HAND`, `ADD_CARDS_TO_HAND`, `REMOVE_CARD_FROM_HAND`, `REMOVE_CARDS_FROM_HAND`, `DISCARD_ALL_HAND`

### Phase 4: Combat/persuade SET_GAME_FLAGS → 5 typed actions
- `RESET_HERO_TURN_USAGE`, `DISENGAGE_MONSTER`, `RECORD_CLASS_DAMAGE_DISCOVER`
- `SET_PERSUADE_DISCOUNT`, `SET_PERSUADE_AMULET_BONUS`

### Phase 5: Event/shop SET_GAME_FLAGS → 7 typed actions
- `ADJUST_SHOP_LEVEL`, `SET_SHOP_LEVEL`, `SET_CURRENT_EVENT`, `SET_ACTIVE_CARD_STACKS`
- `CLEAR_ACTIVE_MONSTER_REWARD`, `ADD_PERMANENT_SKILL`, `UPDATE_HERO_MAGIC_ENTRY`

### Phase 6: Cleanup
- Deleted deprecated `getRandomInt` function from `game-core/helpers.ts`
- Replaced final `getRandomInt` usage with seeded `nextInt` in `useCardPlayHandlers.ts`

---

## ~~Remaining Work Item 6: Eliminate Non-RNG SET_GAME_FLAGS~~ — COMPLETED

Replaced all 74 non-RNG `SET_GAME_FLAGS` dispatches with 34 new typed actions across 4 phases.

### Phase 1: UI/phase/meta flags → 12 typed actions (27 call sites)
- `SET_PHASE`, `SET_UNDO_COUNT`, `SET_HYDRATED`, `SET_DRAW_PENDING`
- `SET_SHOW_SKILL_SELECTION`, `SET_SHOW_CARD_DRAFT`, `SET_CARD_DRAFT_POOL`
- `SET_TOTAL_WINS`, `SET_SELECTED_MONSTER_REWARDS`, `SET_RESOLVING_DUNGEON_CARD`
- `RESET_RECYCLE_FORGE_COUNT`, `SELECT_HERO_SKILL`

### Phase 2: Card/deck/recycle → 7 typed actions (18 call sites)
- `SET_HAND_CARDS`, `ADD_CLASS_CARD_TO_HAND`, `REMOVE_CLASS_CARD_FROM_HAND`
- `SET_DISCARDED_CARDS`, `SET_MAGIC_RECYCLE_BAG`, `SET_CLASS_DECK_AND_BACKPACK`, `SET_BACKPACK_ITEMS`
- Also updated `RETURN_CARDS_TO_CLASS_DECK` reducer to shuffle with rng internally

### Phase 3: Equipment/amulet → 4 typed actions (9 call sites)
- `SWAP_EQUIPMENT_SLOTS`, `FILTER_EQUIPMENT_RESERVES`, `SET_AMULET_SLOTS`, `SET_RECYCLE_BACKPACK_PROGRESS`

### Phase 4: Combat/hero/shop/game → 11 typed actions (20 call sites)
- `RESET_BERSERKER_SLOT`, `SET_GAMBIT_STATE`, `SET_LIFESTEAL_SLOT`, `SET_HONOR_SWEEP_PENDING`
- `SET_LAST_PLAYED_CATEGORY`, `CLAMP_HP`, `OPEN_SHOP_MODAL`, `ENQUEUE_MONSTER_REWARD`
- `REMOVE_PREVIEW_CARD_STACKS`, `INCREMENT_TURN_COUNT`, `SET_HAND_LIMIT_BONUS`

### Remaining SET_GAME_FLAGS (100 calls — all RNG-only)
All remaining `SET_GAME_FLAGS` dispatches are exclusively `{ rng }` or `{ rng: variable }` patterns where hooks consume rng externally and sync it back. Future work could move rng consumption into reducers to eliminate these.

---

## Priority Order

```
1. SET_STATE → Typed Actions (Item 1)                      — COMPLETED
2. Hook Awaits → Pipeline Pause/Resume (Item 2)            — COMPLETED
3. GameBoard useEffect cleanup (Item 4)                     — COMPLETED
4. Seeded RNG (Item 3)                                      — COMPLETED
5. Rules-to-Reducers — Hooks & GameBoard cleanup (Item 5)   — COMPLETED
6. Non-RNG SET_GAME_FLAGS → Typed Actions (Item 6)          — COMPLETED
```

All 6 migration work items are complete. The game-core is now fully deterministic, replayable, and rules-driven through typed actions and reducers. The only remaining `SET_GAME_FLAGS` calls (100) are RNG-only state sync patches.
