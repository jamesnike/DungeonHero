# Game Core Migration Summary

## Overview

The game logic has been migrated from a React `useEffect`-chain architecture to a deterministic, testable game core built on the **action → reducer → pipeline** pattern. All state mutations now flow through `engine.dispatch(action)`.

## Architecture

```
React UI
  ├── useGameState(selector)      ← reactive reads via useSyncExternalStore
  ├── useDispatch()               ← sends GameAction to engine
  └── useGameEvent(event, handler)← subscribes to side effects
          │
          ▼
    GameEngine.dispatch(action)
          │
          ▼
    reduce(state, action) → ReduceResult { state, sideEffects, enqueuedActions }
          │
          ├─► State update (immutable patch)
          ├─► SideEffect[] → emitted via EventBus (animations, logs, banners)
          └─► enqueuedActions → prepended to pipeline queue (serial resolution)
```

## Action Types (140+ total)

### Turn Flow
- `START_TURN` — begin hero turn, reset per-turn flags, apply amulet bonuses
- `END_TURN` — end hero turn, transition to monster phase
- `ADVANCE_MONSTER_TURN` — process next monster in attack queue
- `APPLY_MONSTER_TURN_END_EFFECTS` — dragon regen, goblin steal, wraith enrage
- `ENTER_PLAYER_INPUT` — set phase to playerInput
- `RESET_TURN_STATE` — granular reset at waterfall/wave boundary

### Combat
- `BEGIN_COMBAT` — engage monster, boss graveyard summon logic
- `FINISH_COMBAT` — disengage all monsters, reset combat state
- `PERFORM_HERO_ATTACK` — comprehensive attack reducer (~1100 lines of logic)
- `RESOLVE_BLOCK` — monster attack resolution with shield/take choice
- `PERFORM_SHIELD_BASH` — shield stun attempt with dice roll
- `CHECK_BATTLE_END` — verify if combat should end
- `CHECK_DEATH` — check hero death conditions

### Damage / Heal
- `APPLY_DAMAGE` — damage hero (with tempShield, death ward, amulet effects)
- `HEAL` — heal hero (capped at max HP, with amulet effects)
- `DEAL_DAMAGE_TO_MONSTER` — damage monster with layer overflow

### Cards
- `PLAY_CARD` — remove from hand, apply flank effects, route by type
- `EQUIP_CARD` — equip weapon/shield to slot
- `RESOLVE_POTION` — apply potion effects (heal, shield, draw)
- `RESOLVE_MAGIC` — delegate magic resolution to UI
- `FINALIZE_CARD_PLAY` — post-play destination (graveyard, recycle, exile)
- `DRAW_CARDS` — draw from backpack, deck, or recycleBag
- `DISCARD_CARD` — move card to graveyard or recycle bag

### Dungeon
- `DRAW_DUNGEON_ROW` — draw cards into preview from remaining deck
- `TRIGGER_WATERFALL` — plan and apply waterfall drops
- `MONSTER_ENTERED_ROW` — apply on-enter effects for new monsters
- `CHECK_ELITE_GOLD_BUFF` — gold-threshold elite stat boosts
- `CHECK_HORDE_SWARM` — horde/swarm mechanics
- `ENFORCE_BACKPACK_CAPACITY` — move overflow to recycle bag
- `CHECK_WRAITH_PURIFICATION` — emit purification when all wraiths defeated

### Shop
- `OPEN_SHOP` — generate offerings from class deck, set modal state
- `CLOSE_SHOP` — clear offerings, close modals, emit log
- `PURCHASE` — buy card by cardId, add to backpack, remove from classDeck
- `SHOP_HEAL` — heal hero for gold
- `SHOP_LEVEL_UP` — increase shop level
- `SHOP_DELETE_EQUIPMENT` — remove equipment from slot
- `SHOP_DISCOVER` — start discover flow
- `SHOP_EQUIP_BOOST` — +1 permanent damage/shield to all equipment slots
- `SHOP_SKILL_DISCOVER` — deduct gold, set skill options, open selection modal
- `SHOP_SELECT_SKILL` — add skill to hero, apply stat bonuses
- `UPGRADE_CARD` — upgrade card across all zones (pure 300-line transform)
- `APPLY_MONSTER_REWARD` — apply pure monster reward (gold, maxHp, spellDamage, etc.)
- `DEQUEUE_MONSTER_REWARD` — pop next reward from queue when no active reward and no ghostBlade exile

### Events
- `START_EVENT` — set current event, transition to event phase
- `COMPLETE_EVENT` — clear event modal state, emit completion
- `FINALIZE_EVENT` — clear event, return to playing phase
- `GAIN_CLASS_DECK_BOTTOM_CARDS` — draw cards from class deck bottom to backpack
- `APPLY_EVENT_EFFECT` — apply a pure event effect token via `applySimpleEffect`

### Hero Skills
- `USE_HERO_SKILL` — activate hero skill (delegated to UI via side effect)
- `ADD_MAGIC_GAUGE` — increment magic gauge
- `PERSUADE_MONSTER` — pay gold, track consecutive attempts, transition to rolling phase
- `SWEEP` — sweep attack (delegated to UI via side effect)
- `RESET_HERO_WAVE` — reset hero skills, magic, berserker, gambit, flash for new wave

### Status
- `ADD_STATUS` / `REMOVE_STATUS` — status effect management

### Bridge / Meta
- `ENQUEUE_ACTIONS` — insert follow-up actions into pipeline
- `NO_OP` — no-op sentinel

## Rule Modules (8 files)

| Module | File | Handles |
|--------|------|---------|
| Turn | `rules/turn.ts` | START_TURN, END_TURN, ADVANCE_MONSTER_TURN, RESET_TURN_STATE |
| Combat | `rules/combat.ts` | BEGIN_COMBAT, FINISH_COMBAT, PERFORM_HERO_ATTACK, RESOLVE_BLOCK, PERFORM_SHIELD_BASH, HEAL, APPLY_DAMAGE, DEAL_DAMAGE_TO_MONSTER, CHECK_DEATH, CHECK_BATTLE_END |
| Cards | `rules/cards.ts` | PLAY_CARD, EQUIP_CARD, RESOLVE_POTION, RESOLVE_MAGIC, FINALIZE_CARD_PLAY, DRAW_CARDS, DISCARD_CARD |
| Dungeon | `rules/dungeon.ts` | DRAW_DUNGEON_ROW, TRIGGER_WATERFALL, MONSTER_ENTERED_ROW, CHECK_ELITE_GOLD_BUFF, CHECK_HORDE_SWARM, ENFORCE_BACKPACK_CAPACITY, CHECK_WRAITH_PURIFICATION |
| Shop | `rules/shop.ts` | OPEN_SHOP, CLOSE_SHOP, PURCHASE, SHOP_HEAL, SHOP_LEVEL_UP, SHOP_DELETE_EQUIPMENT, SHOP_DISCOVER, SHOP_EQUIP_BOOST, SHOP_SKILL_DISCOVER, SHOP_SELECT_SKILL, UPGRADE_CARD, APPLY_MONSTER_REWARD, DEQUEUE_MONSTER_REWARD |
| Events | `rules/events.ts` | START_EVENT, COMPLETE_EVENT, FINALIZE_EVENT, GAIN_CLASS_DECK_BOTTOM_CARDS, APPLY_EVENT_EFFECT |
| Hero | `rules/hero.ts` | USE_HERO_SKILL, ADD_MAGIC_GAUGE, PERSUADE_MONSTER, SWEEP, RESET_HERO_WAVE |
| Equipment Effects | `rules/equipment-effects.ts` | `computeEquipmentBreakEffects`, `computeDurabilityLossEffects` (shared pure functions) |

## Pure Function Modules (11 files)

| Module | Key Functions |
|--------|--------------|
| `combat.ts` | `computeDamage`, `computeHeal`, `computeMaxHp`, `damageMonsterWithLayerOverflow`, `applyMonsterTurnEndEffects` |
| `cards.ts` | `addCardToHand`, `drawFromDeck`, `processRecycleBag`, `discardCard` |
| `equipment.ts` | `computeAmuletEffects`, `computeEquipmentStats` |
| `shop.ts` | `openShopPure`, `closeShopPure`, `purchaseFromShopPure`, `shopHealPure`, `shopLevelUpPure`, `shopEquipBoostPure`, `shopSelectSkillPure`, `applyMonsterRewardPure`, `isPureMonsterReward` |
| `cardUpgrade.ts` | `upgradeCardPure` — 300-line pure card upgrade transform across all zones |
| `waterfall.ts` | `planWaterfallDrops`, `applyWaterfallResets` |
| `deck.ts` | `buildDeck`, `shuffleDeck` |
| `helpers.ts` | `flattenActiveRowSlots`, `isDamageableTarget`, `sanitizeCardMetadata`, `syncBuildingSlotsPure` |
| `hero.ts` | `resetHeroWavePure`, `markSkillUsedPure`, `resetAllMagicWaveFlags`, `activateBerserkerRage`, `deactivateBerserkerRage` |
| `monsters.ts` | `applyMonsterRage`, `applyLowGoldEliteBuff` |
| `buildingAura.ts` | `computeBuildingAura` |
| `events.ts` | `applySimpleEffect` (40+ pure event tokens), `gainClassDeckBottomCardsPure`, `isReducerHandledEventToken`, event choice evaluation helpers |

## What Changed

### Removed
- **`GameEngine.setState()`** — deleted; all mutations flow through `dispatch`
- **Local `damageMonsterWithLayerOverflow`** in `useCombatActions.ts` — replaced with game-core import
- **Direct `engine.setState()` calls** in hooks — replaced with typed `dispatch(action)` calls

### Removed
- **`useEngineSetter`** — fully migrated and deleted
- **`patchState` / `updateField` helpers** — fully eliminated from all 7 hook/component files (0 remaining)
- **437 untyped SET_STATE dispatches** — fully eliminated; all converted to typed action types (SET_GAME_FLAGS, MODIFY_GOLD, MARK_SKILL_USED, etc.)

### Added (Pipeline Migration Phases 1-9 + SET_STATE Elimination + Final Typed Action Migration)
- **Animation-decoupled rules** — all rule logic executes before animation delays
- **Consolidated combat reducer** — `reduceMonsterDefeated` handles goblin/buglet/graveyard/recycle
- **Interactive pipeline framework** — `RESOLVE_*` actions with reducer handlers, `isInputContinuation`, `ui:request*` events, pipeline pause/resume on `awaitingDice`/`awaitingMagicTarget`/`awaitingEquipmentPrompt`/`awaitingDeleteChoice`/`awaitingDiscoverChoice`
- **28 typed field mutation actions** — MODIFY_GOLD, MODIFY_STUN_CAP, MODIFY_SLOT_TEMP_ATTACK/ARMOR, SET_COMBAT_FLAG, MODIFY_PERMANENT_STAT, UPDATE_HAND_CARDS, UPDATE_MONSTER_CARD, UPDATE_ACTIVE_CARDS, UPDATE_DISCARDED_CARDS, UPDATE_BACKPACK_ITEMS, UPDATE_RECYCLE_BAG, UPDATE_AMULET_SLOTS, UPDATE_ETERNAL_RELICS, UPDATE_CLASS_DECK, UPDATE_REMAINING_DECK, SET_EQUIPMENT_SLOT, MODIFY_EQUIPMENT_DURABILITY, UPDATE_AMULET_SLOT, MODIFY_MAX_AMULET_SLOTS, REMOVE_AMULET, ADD_PERMANENT_MAGIC_TO_RECYCLE, REMOVE_PERMANENT_MAGIC_FROM_RECYCLE, FLUSH_RECYCLE_TO_BACKPACK, RETURN_CARDS_TO_CLASS_DECK, UPDATE_GAME_LOG, SET_GAME_FLAGS
- **Economy reducer** — new `rules/economy.ts` handles all field mutation actions + RESOLVE_* continuation handlers
- **Reducer-handled hero skills** — `blood-draw`, `gold-discovery`, `vanguard-swap` in reducer
- **Reducer-handled magic effects** — 7 effects in reducer (`double-next-magic`, `bounty-spell-damage`, `arcane-shield-stun-cap`, `persuade-boost-draw`, `active-row-monster-attack-debuff`, `crossroads-left-swap`, `swap-backpack-recycle`)
- **Reducer-handled potion effects** — 20+ effects + 5 new effects (`perm-slot-damage+1/+2`, `perm-equipment-durability-max+1/+2`, `perm-slot-capacity+1`)
- **Expanded event DSL** — 73+ effect tokens, `RESOLVE_EVENT_CHOICE` DSL, `asyncEffectNeeded`
- **`useEffect` cleanup** — 3 redundant effects removed from `GameBoard.tsx`

### Preserved
- **`GameEngine.replaceState()`** — kept for game init, save/load hydration
- **`GameEngine.batch()`** — kept for batching multiple dispatch calls; now respects `_batchDepth` for dispatch too
- **React hooks** (`useCombatActions`, `useCardPlayHandlers`, etc.) — contain UI/animation orchestration and delegate to reducer for rule logic; complex interactive flows are handled via `useGameEvent` subscriptions

## Remaining Bridges & Migration Debt

### `SET_STATE` — FULLY ELIMINATED
All 437 original `SET_STATE` dispatches have been converted to typed actions. The `SET_STATE` action type has been removed from the codebase.
- **Absolute-value resets** — `handCards: []`, `currentEventCard: null`, `phase` transitions
- **UI state** — `isHydrated`, `showCardDraft`, `cardDraftPool`, `drawPending`
These can be incrementally converted to typed actions as more specific action types are added.

### Complex UI-driven flows
Interactive flows now use the pipeline pause/resume pattern:
- Reducer sets `phase` to `awaiting*` and emits `ui:request*` event
- Pipeline pauses at `INPUT_PHASES`
- React shows modal/dice UI
- User responds → `dispatch(RESOLVE_*)` → reducer handles → pipeline resumes
- Existing `await`-based flow works alongside via Promise resolution

Still delegate to hooks for complex interactive parts:
- `card:potionResolved` / `card:magicResolved` — complex potion/magic resolution
- `hero:skillUsed` — interactive hero skills (graveyard-recall, stun-strike, etc.)
- `event:asyncEffectNeeded` — event tokens requiring UI interaction
- `interactive:*Resolved` events — continuation handlers in hooks

## Test Coverage

- **5 test files** with **259 tests total**
- `reducer.test.ts` — core reducer unit tests incl. shop actions, APPLY_EVENT_EFFECT, UPGRADE_CARD, APPLY_MONSTER_REWARD, DEQUEUE_MONSTER_REWARD, FINISH_COMBAT heroStunned reset, RESET_HERO_WAVE, PERSUADE_MONSTER, event DSL, hero skills, magic resolution
- `migrated-actions.test.ts` — unit tests for all migrated actions
- `integration.test.ts` — multi-action pipeline flow tests
- `pipeline.test.ts` — pipeline drain/step mechanics, input continuation
- `queue.test.ts` — action queue operations

## Completed Migration Phases

### Pipeline Migration (Phases 1-9)
1. **Phase 1** — Animation-decoupled rules: all rule logic executes before animation delays
2. **Phase 2** — Combat logic consolidated in reducer
3. **Phase 3** — Card economy in reducer
4. **Phase 4** — Interactive pipeline framework (`RESOLVE_*` actions, `isInputContinuation`)
5. **Phase 5** — Full combat pipeline
6. **Phase 6** — Card play pipeline (RESOLVE_POTION 20+ effects, RESOLVE_MAGIC 7+ effects)
7. **Phase 7** — Event system pipeline (73+ effect tokens)
8. **Phase 8** — Hero skills + shop pipeline
9. **Phase 9** — GameBoard.tsx `useEffect` cleanup

### SET_STATE Elimination (Phases 1-7)
1. **Phase 1** — Defined 28 new typed action types + reducer handlers in `rules/economy.ts`
2. **Phase 2** — Migrated ~170 high-frequency field sites (gold, stunCap, slotTempAttack/Armor, permanent stats, boolean flags)
3. **Phase 3** — Migrated ~125 complex card zone operations (handCards, activeCards, recycle bag, graveyard, amulet, equipment)
4. **Phase 4** — Wired interactive flows to pipeline pause/resume (dice, magic choice, equipment choice, card action, graveyard selection)
5. **Phase 5** — Decoupled 6 remaining animation-gated rule sites
6. **Phase 6** — Expanded reducer coverage (+3 magic, +1 hero skill, +5 potion effects)
7. **Phase 7** — Final cleanup: converted 38 more SET_STATE to typed actions, removed patchState/updateField helpers
8. **Final Migration** — Converted remaining 67 SET_STATE to typed actions (SET_GAME_FLAGS, SET_EQUIPMENT_SLOT, MARK_SKILL_USED); removed SET_STATE from action types, reducer, and tests

### Migration Statistics
- **patchState/updateField calls**: 437 → **0** (100% eliminated)
- **SET_STATE dispatches**: 437 → **0** (100% eliminated, action type removed)
- **Typed action types**: 59 → **141+** (including MARK_SKILL_USED)
- **Reducer rule modules**: 8 → **9** (+ `rules/economy.ts`)
- **Game-core tests**: 259 passing

## Next Steps

1. ~~**Convert remaining ~67 SET_STATE to typed actions**~~ — **DONE** ✓
2. **Add deterministic random** — replace `Math.random()` calls in reducers with seeded RNG for full replay support
3. **Action replay** — leverage `actionLog` for debugging and replay functionality
4. **Move remaining hook logic to reducer** — incrementally migrate complex interactive flows from hooks into reducer/pipeline
