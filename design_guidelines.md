# Design Guidelines: Card Crawl-Inspired Web Game

## Design Approach

**Reference-Based Strategy**: Drawing inspiration from Card Crawl's clean fantasy aesthetic and mobile card games like Hearthstone, Slay the Spire, and similar dungeon crawlers. The design prioritizes intuitive drag-and-drop interactions, clear visual hierarchy, and immediate gameplay feedback.

**Core Principle**: Every UI element serves the game—no decorative clutter. The interface should feel like a physical card table with tactile, satisfying interactions.

---

## Software Architecture

### State Management: GameEngine External Store

All core game state lives in a single `GameEngine` class (`client/src/game-core/index.ts`) — a pure TypeScript singleton that is framework-agnostic and does not depend on React. React components subscribe to it via `useSyncExternalStore`.

```
GameEngine (singleton)
├── _state: GameState          — ~100 fields (hp, gold, cards, combat, etc.)
├── setState(patch)            — merges partial updates, notifies subscribers
├── replaceState(full)         — full replacement (init, hydrate, undo)
├── getState() / getSnapshot() — current state (always fresh, no stale closures)
├── subscribe(callback)        — for useSyncExternalStore
└── on(event, handler)         — event bus for UI effects
```

**React bindings** (`client/src/hooks/useGameEngine.ts`):
- `useGameEngine()` — returns the engine singleton (stable across renders)
- `useGameState(selector)` — reactive state slice via `useSyncExternalStore`; re-renders only when the selected value changes by reference
- `useEngineSetter(key)` — creates a setter matching React's `useState` API (`setValue` or `setValue(prev => ...)`)
- `useGameEvent(event, handler)` — subscribe to engine events for UI effects

**Key design decisions**:
- `GameBoard.tsx` currently uses `useGameState(s => s)` (whole-state subscription) for simplicity. Individual child components can subscribe to narrow slices for performance.
- UI-only state (drag, animations, modal visibility, layout measurements) stays as local `useState` in components — it doesn't need persistence, undo, or external access.
- `engine.getState()` replaces the old pattern of maintaining `useRef` mirrors of state (e.g., `hpRef`, `goldRef`) for reading current values inside closures.

### Game Logic: Custom Hooks with depsRef Pattern

Game logic is extracted from `GameBoard.tsx` into 6 domain-specific custom hooks under `client/src/hooks/`. Each hook:
- Receives a `React.MutableRefObject<...Deps>` parameter (the "depsRef")
- Contains `useCallback` definitions for its domain
- Returns handler functions consumed by `GameBoard.tsx`

**Hook dependency layers** (lower layers are dependencies of higher layers):

| Layer | Hook | Lines | Domain |
|-------|------|-------|--------|
| 0 | `useCardOperations` | ~1,000 | Card/equipment/backpack primitives |
| 1 | `useCombatActions` | ~2,500 | Combat flow, attacks, damage, monster turns |
| 1 | `useShopHandlers` | ~700 | Shop, discover, rewards, card deletion |
| 2 | `useCardPlayHandlers` | ~2,700 | Playing cards from hand (skills, magic, potions) |
| 2 | `useHeroActions` | ~1,900 | Hero skills, magic, targeting handlers |
| 2 | `useEventSystem` | ~1,600 | Event choices, dice, transforms |

**The depsRef pattern** solves circular dependencies between hooks and `GameBoard.tsx`:

```typescript
// In GameBoard.tsx:
const cardOpsDepsRef = useRef<CardOperationsDeps>(null!);
const cardOps = useCardOperations(cardOpsDepsRef);
const { ensureCardInHand, addToGraveyard, ... } = cardOps;

// ... later, after ALL functions are defined:
cardOpsDepsRef.current = {
  addGameLog,
  triggerDiscardFlight,
  // ... other deps from GameBoard or other hooks
};
```

Each hook accesses dependencies via `depsRef.current.xxx` inside `useCallback` bodies. The ref is populated by `GameBoard.tsx` after all hooks run, ensuring stable references and preventing "used before declaration" errors. **Important**: Never read `depsRef.current` at the top level of a hook (outside callbacks) — it is `null` during the first render pass. Use optional chaining (`depsRef.current?.xxx`) if a top-level derived value is needed.

### Component Memoization

All significant child components are wrapped in `React.memo` to prevent unnecessary re-renders when parent state changes don't affect their props:

| Component | Memo | Notes |
|-----------|------|-------|
| `GameCard` | `memo` with custom `arePropsEqual` | Compares card fields individually |
| `HandDisplay` | `memo` | |
| `HeroCard` | `memo` | |
| `GraveyardZone` | `memo` | |
| `BackpackZone` | `memo` | |
| `ClassDeck` | `memo` | |
| `GameHeader` | `memo` | |
| `GameLogPanel` | `memo` | |
| `GameBoardModals` | `memo` | 23+ modals, huge savings when no modal is open |
| `StackedCardPile` | `memo` | |

Props passed to memoized children should be stable references (primitives, `useCallback`, `useMemo`). Avoid inline arrow functions and object literals in JSX props — extract them into `useCallback` / `useMemo` first.

### Game-Core Module (`client/src/game-core/`)

Pure TypeScript modules with zero React dependencies. Provides types, constants, helpers, and the `GameEngine` class:

- `index.ts` — `GameEngine` class, re-exports
- `types.ts` — `GameState` interface (~100 fields), event types
- `state.ts` — `createInitialGameState()` factory
- `constants.ts` — game balance constants, empty-state factories
- `helpers.ts` — pure utility functions (math, layout, card queries)
- `deck.ts` — deck creation, card image imports
- `persistence.ts` — serialization/deserialization for save/load
- `hero.ts`, `combat.ts`, `cards.ts`, `equipment.ts`, `events.ts`, `monsters.ts`, `waterfall.ts` — domain scaffolding

### File Structure Overview

```
client/src/
├── game-core/           — Pure TS game logic (no React)
│   ├── index.ts         — GameEngine class
│   ├── types.ts         — GameState, event types
│   ├── state.ts         — createInitialGameState()
│   ├── constants.ts     — Balance values, factories
│   ├── helpers.ts       — Pure utilities
│   ├── deck.ts          — Deck creation
│   └── persistence.ts   — Save/load serialization
├── hooks/
│   ├── useGameEngine.ts — React bindings for GameEngine
│   ├── useCardOperations.ts
│   ├── useCombatActions.ts
│   ├── useShopHandlers.ts
│   ├── useCardPlayHandlers.ts
│   ├── useHeroActions.ts
│   └── useEventSystem.ts
├── components/
│   ├── GameBoard.tsx    — Main orchestrator (~8,400 lines)
│   │                      State subscriptions, UI hooks,
│   │                      animation/flight/drag logic, JSX
│   ├── game-board/
│   │   ├── components/
│   │   │   └── GameBoardModals.tsx — All modal rendering
│   │   ├── types.ts     — UI-specific type definitions
│   │   └── constants.ts — Layout constants
│   ├── GameCard.tsx     — Card rendering (memo'd)
│   ├── HeroCard.tsx     — Hero rendering (memo'd)
│   ├── HandDisplay.tsx  — Hand fan layout (memo'd)
│   └── ...              — Other UI components (memo'd)
└── lib/
    ├── heroes.ts        — Hero variant definitions
    ├── heroSkills.ts    — Skill definitions
    ├── heroMagic.ts     — Magic system
    ├── knightDeck.ts    — Knight class deck
    └── gameStorage.ts   — LocalStorage persistence
```

---

## Mobile Performance

### CSS Performance Profile

A dedicated `@media (hover: none), (max-width: 768px)` block in `index.css` reduces GPU-heavy effects on mobile:

- **`mix-blend-mode`** → `normal` on combat overlays (bleed, heal, defeat, engaged monsters)
- **`filter: drop-shadow()`** → `none` on combat shapes, flight cards, preview animations
- **`backdrop-filter: blur()`** → removed (replaced with solid backgrounds)
- **`box-shadow`** → simplified (smaller blur radii) on target highlights
- **Loading screen blur** → reduced from 30px to 12px

### StackedCardPile Mobile Optimization

On mobile (`viewport < 768px`):
- Max layers reduced from 16 → 5 (saves ~66 DOM nodes across 3 piles)
- Framer Motion springs replaced with CSS `transform` + `transition` (eliminates spring physics engine overhead)
- Ground blur shadow layer removed
- Desktop rendering remains unchanged

### Rendering Best Practices

- `contain: layout style` on grid cells and flight elements
- `will-change: transform, opacity` on actively animated elements only
- `@media (prefers-reduced-motion: reduce)` hides decorative overlay shapes and disables animations
- Flight animations use `requestAnimationFrame` with direct `style.transform` mutation (bypasses React reconciliation)
- Card images in viewers use `loading="lazy"`, `decoding="async"`, `fetchPriority="low"`

---

## Card Authenticity & Lifecycle

- **Physical Card Rule**: Each card is unique and exists exactly once per run. Cards can only move between deck, preview row, active row, hero slots, backpack, equipment slots, and the graveyard—never duplicated or conjured.
- **Use vs. Discard**: When a card is consumed (e.g., weapon swing, shield block, potion drink, event resolution), it must travel to the graveyard with the same identity so players can audit its history.
- **Inventory Flow**: Backpack storage and equipment slots preserve the original card stats, durability, and id. Moving cards between zones reuses the same object; the graveyard is the authoritative log of retired cards.

---

## Typography

**Font Families** (via Google Fonts CDN):
- Primary: `Cinzel` (fantasy serif) - For card titles, hero name, headings
- Secondary: `Lato` (clean sans-serif) - For stats, numbers, UI labels
- Monospace: `Roboto Mono` - For HP counters, gold values

**Hierarchy**:
- Card Titles: Cinzel 600, 1.25rem (text-xl)
- Hero Name: Cinzel 700, 1.5rem (text-2xl)
- HP/Stats: Roboto Mono 700, 2rem (text-3xl) - Large, readable numbers
- UI Labels: Lato 500, 0.875rem (text-sm)
- Card Descriptions: Lato 400, 0.875rem (text-sm)
- Score/Gold: Roboto Mono 600, 1.125rem (text-lg)

---

## Layout System

**CSS Approach**: Tailwind CSS utilities + extensive custom CSS in `index.css`. Design tokens via CSS custom properties (`--dh-*` namespace) on `:root` / `.dark`.

**Game Board Structure** (top → bottom, flex column):
```
┌─────────────────────────────────────────────────────┐
│  Header: Wins | New Game | Help | HP | Deck | Turn  │  flex-shrink-0
│          | Shop | Gold                               │
├─────────────────────────────────────────────────────┤
│  6×3 Game Grid (.game-grid)                          │  flex-grow
│  ┌─────┬─────┬─────┬─────┬─────┬──────────┐        │
│  │ Prev│ Prev│ Prev│ Prev│ Prev│ Dice     │ Row 1  │
│  │  1  │  2  │  3  │  4  │  5  │ Roller   │        │
│  ├─────┼─────┼─────┼─────┼─────┼──────────┤        │
│  │ Act │ Act │ Act │ Act │ Act │ Graveyard│ Row 2  │
│  │  1  │  2  │  3  │  4  │  5  │ Zone     │        │
│  ├─────┼─────┼─────┼─────┼─────┼──────────┤        │
│  │Amul.│Equip│ HERO│Equip│Back │ Class    │ Row 3  │
│  │     │  1  │     │  2  │pack │ Deck     │        │
│  └─────┴─────┴─────┴─────┴─────┴──────────┘        │
├─────────────────────────────────────────────────────┤
│  Hand Display (fan layout)                           │  flex-shrink-0
└─────────────────────────────────────────────────────┘
```

**Grid CSS** (`index.css`):
```css
.game-grid {
  grid-template-columns: repeat(6, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: var(--dh-grid-gap-y) var(--dh-grid-gap-x);
}
```

**Card Sizing**: Cards use `w-full h-full` and are sized by their grid cell or hand layout container. A `BASE_CARD_WIDTH` (180px) and `BASE_HERO_WIDTH` (260px) reference constant drives `ResizeObserver`-based instance scaling (`--dh-card-instance-scale`) for typography and internal spacing — no fixed `w-*/h-*` classes.

**Container**:
- Max game-grid width: `max-w-[1350px]`, centered with `mx-auto`
- Viewport: `h-full w-full` flex column with `overflow-hidden`

---

## Component Library

### Core Game Elements

**1. Cards (Primary Interaction Element)**
- Dimensions: `w-full h-full` — sized by grid cell or hand layout, not fixed classes
- Scaling: `ResizeObserver` measures actual width → sets `--dh-card-instance-scale` (clamped 0.6–1.4) for internal typography and spacing
- Structure: Rounded corners, shadow, draggable with HTML5 drag + touch fallback
- Layout:
  - Card art area (top ~60%)
  - Title banner (Cinzel, centered)
  - Stats/description area (bottom)

**Card Types** (`CardType` union):
- `monster` — Skull icon (Lucide), HP badge
- `weapon` — Sword icon, damage value
- `shield` — Shield icon, defense value
- `potion` — Flask icon, healing value
- `coin` — Coins icon, gold value
- `amulet` — Gem icon, passive effect description
- `magic` / `hero-magic` — Spell icons (custom SVG stickers), mana/cost
- `skill` — Hero ability cards (discoverable, class-specific)
- `event` — Narrative encounter cards with choices

**2. Hero Card (Central Focus)**
- Size: `h-full w-full` in grid cell (row 3, col 3); internal scaling via `BASE_HERO_WIDTH = 260`
- HP Display: Large Roboto Mono numerals with heart icon
- Portrait area with hero art
- Status effects, equipment aura indicators

**3. Equipment & Inventory (Hero Row)**
- Integrated into grid row 3: Amulet | Equipment 1 | Hero | Equipment 2 | Backpack | Class Deck
- Empty slot: Dashed border, icon placeholder
- Filled slot: Renders the equipped card at cell size
- Backpack: `BackpackZone` with `StackedCardPile` visualization

**4. Drag Zones**
- Drop Target Highlight: Thicker border, subtle scale transform
- Valid Drop: Visual indicator (pulsing animation)
- Invalid Drop: Shake animation, red tint overlay
- Mobile: Touch drag fallback (`mobileDragDrop`) with clone element following finger

### UI Components

**Header Bar** (`GameHeader`):
- Fixed height, `flex-shrink-0`, horizontal flex with `justify-between`
- Left group: Trophy + total wins count, New Game button, Help button, HP display (Heart icon + Roboto Mono numerals)
- Right group: Deck counter (Layers + Badge), Waterfall turn counter (Waves + Badge), Shop level (ShoppingBag + Badge), Gold display (Coins + value)
- All stat values use Roboto Mono for readability

**Action Feedback**:
- Damage Numbers: Animated text that floats up (Roboto Mono 700)
- Heal Effect: Green glow pulse on HP display
- Gold Gained: Coin icon flies to header
- Card Destroy: Flight animation to graveyard pile

**Modals/Overlays** (`GameBoardModals` — 23+ modals):
- Victory/Defeat Screen: Centered overlay, rounded-2xl, stats summary, restart button
- Card draft, shop, skill selection, event choices, etc.
- Background: Backdrop dim (solid on mobile, blur on desktop)

**Buttons**:
- Primary (Restart, New Game): rounded-lg, Lato 600
- Secondary (Sell, Cancel): rounded-md, Lato 500
- Icon buttons: rounded-full

---

## Icons

**Library**: Lucide React (`lucide-react`) — SVG components, tree-shakeable. Custom inline SVGs for spell/magic sticker art (`MagicNameFlankIcons.tsx`).

**Common icon usage** (Lucide component names):
- Health: `Heart`
- Coins/Gold: `Coins`
- Weapons: `Sword`, `Swords`
- Shield: `Shield`
- Monster: `Skull`
- Deck: `Layers`
- Turn counter: `Waves`
- Shop: `ShoppingBag`
- Undo: `Undo2`
- Wrench/Forge: `Wrench`
- Wins: `Trophy`
- Calendar/Event: `Calendar`

Icon sizing scales with `--dh-card-instance-scale` inside cards; header icons use standard Tailwind `w-*/h-*` classes.

---

## Animations

**Critical Interactions Only**:
- Card Drag: `transform transition-transform duration-150` - subtle lift and rotate
- Card Play: Slide and fade to destination (duration-300)
- Damage Dealt: Red flash overlay (duration-200)
- HP Change: Number count-up animation (duration-500)
- Victory/Defeat: Modal slide-in from top (duration-400)

**Flight Animations**: Card "flights" (e.g., card moving to graveyard, gold to header) use direct DOM manipulation via `requestAnimationFrame` — elements are positioned with `style.transform` and cleaned up on `animationend`. This avoids React reconciliation during high-frequency animations.

**Mobile Animation Policy**: On mobile viewports (`< 768px`), GPU-heavy CSS effects (`mix-blend-mode`, `filter: drop-shadow`, `backdrop-filter: blur`, complex `box-shadow`) are disabled or simplified via a dedicated media query block. Framer Motion spring animations in `StackedCardPile` are replaced with CSS transitions.

**Continuous animations** (combat overlays, glow effects, engaged-monster pulses) are present on desktop but simplified or disabled on mobile via the CSS performance profile (see Mobile Performance section).

---

## Images

**Card Artwork** (per card type):
- Monster Cards: Fantasy creature illustrations (dragons, goblins, skeletons)
- Weapon Cards: Medieval weapon renders (swords, axes, daggers)
- Shield Cards: Ornate shield designs
- Potion Cards: Colored liquid in bottles
- Hero Portrait: Fantasy character art (warrior/rogue aesthetic)

**Placement**: Each card has a dedicated art area occupying 60% of card height, positioned at top

**Style**: Painterly fantasy illustrations with slight vignette, consistent gothic/medieval tone matching Card Crawl's storybook aesthetic

**No Hero Image**: This is a game interface, not a landing page - gameplay occupies the full viewport

---

## Accessibility

- Card descriptions: aria-label with full card info
- Focus indicators: focus ring on interactive elements
- Touch targets: Minimum 44x44px for all buttons and interactive areas
- Touch drag: Mobile touch fallback creates a clone element that follows the finger
- `@media (prefers-reduced-motion: reduce)`: disables decorative animations and overlay shapes

---

## Key Design Differentiators

1. **Physical Card Feel**: Cards cast subtle shadows, rotate slightly when dragged
2. **Immediate Feedback**: Every action produces instant visual response
3. **Clean Battlefield**: Minimal chrome, maximum play space
4. **Tactical Clarity**: HP and resource values are always large and readable
5. **Mobile-First Gestures**: Optimized for thumb reach zones and one-handed play
6. **Framework-Agnostic Core**: All game state and logic lives in pure TypeScript (`game-core/`), enabling future portability (e.g., to Canvas/Pixi, native, or server-side simulation) without rewriting game rules
7. **Thin React Shell**: React is responsible only for rendering and UI interactions — it subscribes to the external `GameEngine` store and dispatches mutations back through hook handlers

---

## Block Durability Count (格挡耐久次数)

The Block Durability Count mechanic limits how many times shield durability can be consumed per equipment slot during a single monster turn. This prevents a single high-durability shield from absorbing unlimited hits in one monster turn.

### Concept

During a monster turn, each equipment slot can consume at most **N** durability points from its shield (default N = 1). Once the limit is reached, the shield in that slot is **disabled** for the rest of that monster turn — the hero must take damage to HP. The parameter N is tunable by card/event effects, similar to how extra attack charges work.

**Key distinction**: Only actual durability *consumption* counts toward this limit. Blocks where the shield's armor is not fully depleted (i.e., no durability point is lost) do **not** count. However, once the limit is reached, the shield is fully disabled regardless of its armor state.

### Data Model

| Field | Location | Type | Default | Purpose |
|-------|----------|------|---------|---------|
| `slotDurabilityUsedThisTurn` | `CombatState` | `Record<EquipmentSlotId, number>` | `{ equipmentSlot1: 0, equipmentSlot2: 0 }` | Tracks durability points consumed per slot this monster turn |
| `blockDurabilityPerSlot` | `GameState` | `number` | `1` | Maximum durability consumption per slot per monster turn (tunable) |

### When Durability Is "Consumed"

A durability point is consumed when **all** of these conditions are true:

1. The shield's armor is fully depleted by the monster's attack (`shieldArmorDepleted === true`)
2. The shield is not auto-evolved, not a full-block shield, and not under `unbreakableUntilWaterfall`
3. The durability loss is not prevented by a save mechanic (perfect block save chance, bone regen)

This covers two outcomes:
- **Shield destroyed** (durability was ≤ 1): durability consumed, shield breaks (may revive)
- **Shield survives** (durability > 1): durability decremented by 1, shield persists

### Reset Timing

```
Hero Turn ──endHeroTurn──▶ Monster Turn Start
                              │
                              ▼
                    Reset slotDurabilityUsedThisTurn to {0, 0}
                              │
                              ▼
                       Monster Attacks
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
              Block with shield    Block with hero HP
                    │
              Armor depleted?
              ┌─────┴─────┐
              No          Yes (durability -1)
              │           │
              │     Increment count
              │           │
              │     count >= limit?
              │     ┌─────┴─────┐
              │     No          Yes
              │     │           │
              │     Shield OK   Shield DISABLED
              │     │           (must use hero HP)
              └─────┴───────────┘
                    │
              Next monster attack...
                    │
              All monsters done ──▶ Hero Turn
```

### Combat Logic (`useCombatActions.ts`)

**`resolveBlockChoice`**:
1. **Early guard**: Before processing a shield block, checks if `slotDurabilityUsedThisTurn[slotId] >= blockDurabilityPerSlot`. If so, the shield is treated as unavailable (the block attempt is rejected by the UI, but this is a safety net).
2. **Tracking**: A local `shieldDurabilityConsumed` flag is set to `true` when durability is actually consumed (shield destroyed or durability decremented). After block resolution, if the flag is true, `slotDurabilityUsedThisTurn[slotId]` is incremented via `setCombatState`.

**State resets**:
- `endHeroTurn`: Resets `slotDurabilityUsedThisTurn` to `{ 0, 0 }` when transitioning to monster turn
- `beginCombat` (fresh combat): Includes the field via `initialCombatState`
- `finishCombat`: Uses `initialCombatState` which includes the reset field
- `endHeroTurnPatch` (pure): Explicitly resets `slotDurabilityUsedThisTurn` in the new combat state

### UI

**Block buttons** (`GameBoard.tsx`):
- Block button for each slot is disabled when `slotDurabilityUsedThisTurn[slotId] >= blockDurabilityPerSlot`, in addition to the existing `canShieldBlock` check
- `renderBlockButton` shows "耐久用尽" text instead of damage value when the slot is disabled due to durability limit

**Slot action count overlay** (`EquipmentSlot.tsx`):
- When dragging equipment during combat, the slot cell behind the dragged card shows a number:
  - **Hero turn**: Remaining attack count for the slot (sum of base + extra attack sources)
  - **Monster turn**: Remaining block durability = `blockDurabilityPerSlot - slotDurabilityUsedThisTurn[slotId]`
  - **Count > 0**: Green number
  - **Count = 0**: Red X mark (same as existing exhausted overlay)

**CombatPanel** (`CombatPanel.tsx`):
- Accepts `slotDurabilityUsedThisTurn` and `blockDurabilityPerSlot` as props
- During monster turns, displays remaining block durability per slot with "耐久 N/M" or "耐久用尽" status

### Persistence

- `persistence.ts`: Snapshots `slotDurabilityUsedThisTurn` inside combat state and `blockDurabilityPerSlot` in game state
- `gameStorage.ts`: `CombatStateSnapshot` includes optional `slotDurabilityUsedThisTurn`; `PersistedGameState` includes optional `blockDurabilityPerSlot`
- Snapshot restore in `GameBoard.tsx`: Hydrates both fields with safe defaults (`{ equipmentSlot1: 0, equipmentSlot2: 0 }` and `1`) for backward compatibility

### Implementation Files

| File | Role |
|------|------|
| `components/game-board/types.ts` | `slotDurabilityUsedThisTurn` on `CombatState` |
| `game-core/types.ts` | `blockDurabilityPerSlot` on `GameState` |
| `game-core/constants.ts` | `initialCombatState` default |
| `components/game-board/constants.ts` | Duplicate `initialCombatState` default |
| `game-core/state.ts` | `blockDurabilityPerSlot: 1` in `initialState` |
| `game-core/combat.ts` | `beginCombatPatch`, `endHeroTurnPatch`, `finishCombatPatch` resets |
| `hooks/useCombatActions.ts` | `resolveBlockChoice` guard + counter, `endHeroTurn` / `beginCombat` resets |
| `components/GameBoard.tsx` | Block button disable logic, slot action count computation, snapshot restore |
| `components/EquipmentSlot.tsx` | `slotActionCount` overlay rendering |
| `components/CombatPanel.tsx` | Block durability status display (props) |
| `game-core/persistence.ts` | Snapshot serialization |
| `lib/gameStorage.ts` | Persistence types |

---

## Building Cards (建筑)

Building cards (`type: 'building'`) are persistent dungeon structures that remain on the board after placement. They are produced by event card flips (e.g., 破坏祭坛 → 破印祭坛, 命运骰盅 → 命运之刃, 诅咒骰局 → 诅咒碑) and occupy a slot in the active dungeon row.

### Properties

- **HP & Fury layers**: Buildings have `hp`, `maxHp`, and `fury` (layers) like monsters, but they do not attack the player.
- **Destroyable**: Buildings can be attacked by weapons (they are valid weapon drop targets alongside monsters). When their HP reaches 0, they are destroyed and sent to the graveyard.
- **Building Aura** (`buildingAura`): Some buildings have a passive aura effect that applies while the building is alive on the board. Aura is removed when the building is destroyed.
  - `'suppress-adjacent-temp-attack'` — Adjacent player equipment slots ignore temporary attack bonuses.
  - `'adjacent-magic-immune'` — Monsters adjacent to this building are immune to player magic damage.
- **Event Choices**: Some buildings (e.g., 命运之刃) carry `eventChoices` that can be triggered by dragging to the hero zone, similar to event cards.
- **Release Charge** (`hasReleaseCharge`): Buildings that support event choices gain a release charge when placed or when their position changes.
- **Placement**: When played from hand or backpack, a building is placed into a random empty active row slot. If no empty slot exists, it is discarded to the graveyard.
- **Cannot be stored in backpack**: Buildings are restricted from backpack storage (`isBackpackRestrictedCard` returns true for buildings).

### Visual

- A "建筑" (Building) caption badge is displayed at the top-left corner of the card.
- HP is shown at the top-right with a heart icon (same as monsters).
- Fury layer dots are shown below the HP (if fury > 1).

---

## Ghost Mechanic (幽灵)

The Ghost mechanic (`isGhost: true` on `GameCardData`) makes a card transparent to the waterfall cascade system. Currently all building cards have the Ghost property.

### Behavior

1. **Does not block waterfall**: Ghost cards are excluded from the active row count when determining whether waterfall should trigger. If only ghost cards remain in the active row (no non-ghost cards), the game treats the row as effectively empty and triggers waterfall.

2. **Does not count as a remaining card**: The ghost-aware helper `countActiveRowSlotsExcludeGhost()` is used for waterfall threshold checks (`emptySlots >= 4`) and the "1 card remaining" waterfall trigger. Ghost cards are invisible to these checks.

3. **Slots treated as empty for drops**: The helper `getEmptyOrGhostColumns()` returns columns that are either truly empty or occupied only by a ghost card. During waterfall, preview cards can drop into ghost-occupied slots.

4. **Stacks underneath falling cards**: When a preview card drops into a slot occupied by a ghost card during waterfall, the ghost card is pushed to the **bottom** of `activeCardStacks` for that slot. The falling card becomes the new top card. The ghost building persists underneath and resurfaces only after all stacked cards above it are removed (LIFO stack order — ghost at index 0 is last to pop).

5. **Victory condition**: Ghost cards do not prevent victory. If the deck and preview are empty and only ghost buildings remain in the active row, the game declares victory.

### Visual

- Ghost cards display a small 👻 emoji badge next to the "建筑" label, with tooltip "幽灵：不阻挡瀑流，不计入剩余卡牌".

### Implementation

- **Type**: `isGhost?: boolean` on `GameCardData` (`GameCard.tsx`)
- **Helpers**: `countActiveRowSlotsExcludeGhost()` and `getEmptyOrGhostColumns()` in `helpers.ts` and `game-board/utils.ts`
- **Waterfall logic**: `GameBoard.tsx` uses the ghost-aware helpers for cascade threshold, empty column detection, and waterfall drop placement
- **Card data**: All building `flipTarget.toCard` definitions in `deck.ts` set `isGhost: true`

---

## Amplify Mechanic (增幅)

The Amplify mechanic allows the player to permanently boost a card's stats. The main deck contains an **instant** magic「增幅」that, when played, lets the player select a target and generates a **Perm 2 permanent magic** bound to that target. Each time the generated Perm 2 card is used, it applies one amplification to the bound target.

### Card Definition

- **Instant card**: `magic`, `magicType: 'instant'`, `magicEffect: 'amplify-card'`
  - Defined in: `deck.ts` → `createDeck()` magic pool (candidate 15 of 15)
  - One-time use: consumed after selecting a target (goes to graveyard)
- **Generated Perm 2 card**: `magic`, `magicType: 'permanent'`, `magicEffect: 'amplify-target'`, `recycleDelay: 2`
  - Created dynamically in `resolveAmplify()` with `_amplifyTargetCardId` and `_amplifyTargetName`
  - Added to backpack; reusable via Perm 2 recycle cycle

### Targeting

When the instant「增幅」is played, it opens `AmplifyModal` for target selection. Eligible targets:

| Source | Eligible types |
|--------|---------------|
| Equipment slots | Any equipped `weapon` or `shield` (including class-pool equipment) |
| Hand cards | `weapon`, `shield`, or any card passing `isDamageMagic()` (excluding the 增幅 card itself) |

The helper `isDamageMagic(card)` (`helpers.ts`) identifies damage-dealing magic cards. It returns `true` for:

- Cards with `scalingDamage` (叠刺 mechanic)
- Cards with `onDiscardDamage > 0`
- Knight class damage effects via `knightEffect`:
  `missile-bolt`, `armor-strike`, `missing-hp-smite`, `grave-nova`, `fate-sight`, `temp-attack-strike`, `weapon-sweep`, `overkill-upgrade`
- Main deck damage effects via `magicEffect`:
  `storm-volley-recycle`, `arcane-storm-magic-count`
- Cards matched by name:
  `风暴箭雨`, `点金裁决`, `混沌冲击`, `箭雨余韵`, `魔弹`, `雷震击`

### Effects

| Target type | Effect |
|-------------|--------|
| Weapon | `value` +1 (permanent attack increase) |
| Shield | `armorMax` +1, `value` +1 (permanent armor increase) |
| Damage magic with `scalingDamage` | `scalingDamage` +1 (叠刺 base increment) |
| Other damage magic | `amplifyBonus` +1 (flat damage bonus) |

All targets also receive `amplifyBonus` +1 for tracking purposes.

### amplifyBonus Application Points

The `amplifyBonus` field on `GameCardData` is read as `(card.amplifyBonus ?? 0)` and added to base damage in every damage calculation path for the supported spells:

**Main deck magic** (`useCardPlayHandlers.ts`):
- 风暴箭雨 (`storm-volley-recycle`): `getSpellDamage(3 + ampBonus)`
- 点金裁决 (`blood-reckoning`): `getSpellDamage(gold + ampBonus)`
- 箭雨余韵 (echo): `getSpellDamage(magicCount + ampBonus)`
- 奥术风暴 (`arcane-storm-magic-count`): same pattern
- 雷震击 (`thunder-stun`): `stunDmgPerHit[level] + ampBonus`
- 混沌冲击 (`chaos-strike`): `getSpellDamage(3 + ampBonus)`

**Knight class magic** (`useCardPlayHandlers.ts` + `useHeroActions.ts`):
- 铠甲贯刺 (`armor-strike`): `getSpellDamage(scaledArmor + ampBonus)`
- 残血终焉 (`missing-hp-smite`): `getSpellDamage(scaledDmg + ampBonus)`
- 坟火新星 (`grave-nova`): `getSpellDamage(3 + ampBonus)` — `triggerGraveNova(card)` receives the card to read its bonus
- 天眼审判 (`fate-sight`): `getSpellDamage(baseDmg + ampBonus)` inside `resolveFateSight`
- 锋刃侧击 (`temp-attack-strike`): `getSpellDamage(tempAtk + ampBonus)`
- 利刃风暴 (`weapon-sweep`): `computeHonorSweepWaveDamage(slotId) + ampBonus`
- 淬炼冲击 (`overkill-upgrade`): `getSpellDamage(3 + ampBonus)`
- 魔力飞弹 (`missile-bolt`): `getSpellDamage(2 + ampBonus)`

### State & Persistence

- **`amplifyBonus?: number`** on `GameCardData` (`GameCard.tsx`) — cumulative bonus counter, persisted with the card across zones (hand → equipment → graveyard → recycle bag).
- **`amplifyModal: { sourceCardId: string } | null`** on `GameState` (`types.ts`) — modal open state, initialized to `null` in `createInitialGameState()`.

### Implementation Files

| File | Role |
|------|------|
| `game-core/helpers.ts` | `isDamageMagic()` — target eligibility check |
| `game-core/types.ts` | `AmplifySelection` type, `amplifyModal` state |
| `game-core/state.ts` | `amplifyModal: null` initialization |
| `game-core/deck.ts` | 增幅 card definition in magic pool |
| `components/AmplifyModal.tsx` | Target selection UI |
| `hooks/useCardPlayHandlers.ts` | `resolveAmplify`, `cancelAmplify`, `triggerGraveNova(card)`, damage application points |
| `hooks/useHeroActions.ts` | Knight effect damage application points, `applyWeaponSweepMagic` |
| `hooks/useCardOperations.ts` | Passes card to `triggerGraveNova(card)` on discard |
| `components/GameBoard.tsx` | Wires modal + handlers |

---

## Eternal Relics (永恒护符)

Eternal Relics are permanent passive items inspired by Slay the Spire's relic system. Unlike regular amulets (临时护符) which occupy limited amulet slots, eternal relics are always active and do not take up any slot. They are displayed as miniaturized circular icons between the Hero Row and the Hand Row.

### Design Principles

- **Passive-only**: All passive abilities in the game manifest as eternal relics. Hero skills are exclusively active.
- **Permanent**: Once acquired, a relic's effect lasts for the entire run. Relics cannot be removed or destroyed.
- **Non-slot**: Relics do not occupy amulet slots, equipment slots, or any other inventory space.

### Acquisition Sources

| Source | Timing | Details |
|--------|--------|---------|
| Starting relic | Game start | Every run begins with `waterfall-discover` (瀑流时发现一张专属卡) |
| Magic card「潮涌铸甲」 | During play | 2-choose-1: `bulwark-attack` (瀑流铸剑) or `bulwark-armor` (格挡铸甲). Stackable — playing the card again increases the stack count |
| Potion「护符永铸药」 | During play | Select an equipped amulet → remove it from the amulet slot → convert it to an eternal relic with the same image and effect |

### Data Model

**Type definitions** (`game-core/types.ts`):

```
EternalRelicId = 'waterfall-discover' | 'waterfall-heal' | 'vitality-well'
               | 'discard-profit' | 'heal-to-damage' | 'early-surge'
               | 'shield-wall' | 'summon-minion'
               | 'bulwark-attack' | 'bulwark-armor'
               | `amulet-eternal-${string}`     // dynamic IDs for amulet-converted relics

EternalRelic {
  id: EternalRelicId
  name: string
  description: string
  image: string
  initialMaxHpBonus?: number        // applied at game start
  initialGoldBonus?: number
  initialShopLevel?: number
  initialWaterfallBonus?: number
  initialClassCardDraw?: number
  initialSpellDamageBonus?: number
  amuletEffect?: AmuletEffectId     // when converted from an amulet
  amuletAuraBonus?: AmuletAuraBonus // aura stats carried from the original amulet
  upgradeLevel?: number             // upgrade level from the original amulet
}
```

**Game state** (`GameState`):
- `eternalRelics: EternalRelic[]` — initialized to `getStartingRelics()` (contains `waterfall-discover`)

### Relic Registry (`lib/eternalRelics.ts`)

All predefined relics are stored in `RELIC_REGISTRY`. Utility functions:

| Function | Purpose |
|----------|---------|
| `getEternalRelic(id)` | Look up a relic definition by ID |
| `getStartingRelics()` | Returns the starting relics array (`[waterfall-discover]`) |
| `hasEternalRelic(relics, id)` | Check if a relic is owned |
| `getSelectableRelics(exclude)` | Get all relics eligible for selection, excluding owned and card-only relics |
| `sampleRelics(count, exclude)` | Random sample from selectable relics |

**Card-only relics** (`CARD_ONLY_RELICS`): `bulwark-attack` and `bulwark-armor` are excluded from generic selection — they are only obtainable through the 潮涌铸甲 magic card.

### Amulet-to-Relic Conversion

The potion「护符永铸药」(`amulet-to-eternal-relic`) converts an equipped amulet into an eternal relic:

1. Player uses the potion → choice dialog shows all equipped amulets
2. Player selects one → amulet is removed from `amuletSlots`
3. A new `EternalRelic` is created with:
   - `id`: `` `amulet-eternal-${amuletEffect}` ``
   - `name`: `永恒护符·${amulet.name}`
   - `image`: same as the original amulet
   - `amuletEffect`, `amuletAuraBonus`, `upgradeLevel`: copied from the original amulet
4. The relic is appended to `eternalRelics`

### Effect Computation

The `amuletEffects` computation in `GameBoard.tsx` processes **both** amulet slots and eternal relics:

```
amuletEffects = useMemo(() => {
  state = createEmptyAmuletEffects();
  for (slot of amuletSlots)    → applyAmuletEffect(state, slot.amuletEffect, ...)
  for (relic of eternalRelics) → if (relic.amuletEffect) applyAmuletEffect(...)
  return state;
}, [amuletSlots, eternalRelics]);
```

This means an amulet converted to a relic continues to function identically — its effect is included in the same `amuletEffects` object that all game logic reads.

Non-amulet relic effects (e.g., `waterfall-heal`, `discard-profit`) are checked directly via `hasEternalRelic(eternalRelicsRef.current, 'relic-id')` at their respective trigger points.

### UI

**EternalRelicBar** (`components/EternalRelicBar.tsx`):
- Positioned between the Hero Row and Hand Row using `position: absolute; bottom: 0; transform: translateY(50%)`
- Zero height container (`height: 0`) — does not affect layout
- Each relic rendered as a 40×40px circular icon with amber border
- Hover: tooltip showing name + description
- Click: opens a detail dialog modal

**Detail Modal** (`GameBoard.tsx`):
- `selectedEternalRelic` / `eternalRelicModalOpen` state
- Displays relic name, image, and full description in a `Dialog` component

### Passive Effect Trigger Points

| Relic ID | Effect | Trigger location |
|----------|--------|-----------------|
| `waterfall-discover` | Discover a class card on waterfall | `GameBoard.tsx` → `applyWaterfallSideEffects` |
| `waterfall-heal` | Heal 4 HP on waterfall | `GameBoard.tsx` → `applyWaterfallSideEffects` |
| `discard-profit` | +2 gold per discard | `useCardOperations.ts` → discard handler |
| `heal-to-damage` | +1 permanent weapon damage per 5 HP healed | `useCombatActions.ts` → heal tracking |
| `summon-minion` | Spawn minion at game start; +1/+1 per kill | `useCombatActions.ts` → monster kill |
| `shield-wall` | Block weapon equip; thunder seal at start | `GameBoard.tsx` → `handleCardToSlot`, `handleCardDraftComplete` |
| `bulwark-attack` | +2 temp attack per weapon attack (stacks) | `useCombatActions.ts` → attack resolution |
| `bulwark-armor` | +2 temp armor per shield block (stacks) | `useCombatActions.ts` → block resolution |
| `amulet-eternal-*` | Same as the original amulet effect | `GameBoard.tsx` → `amuletEffects` computation |

### Persistence

- **Serialization** (`persistence.ts`): `eternalRelics` is serialized via `state.eternalRelics.map(r => ({ ...r }))` — all fields including `amuletEffect`, `amuletAuraBonus`, `upgradeLevel` are preserved
- **Persisted type** (`gameStorage.ts`): `PersistedEternalRelic` with `id`, `name`, `description`, `image`, optional `amuletEffect`, `amuletAuraBonus`, `upgradeLevel`
- **Hydration** (`GameBoard.tsx`): Falls back to `getStartingRelics()` for old saves without relics

### Implementation Files

| File | Role |
|------|------|
| `game-core/types.ts` | `EternalRelicId`, `EternalRelic` interface, `eternalRelics` on `GameState` |
| `game-core/state.ts` | `eternalRelics: []` initialization |
| `lib/eternalRelics.ts` | Relic registry, utility functions (`getEternalRelic`, `hasEternalRelic`, etc.) |
| `components/EternalRelicBar.tsx` | Relic icon bar UI |
| `components/GameBoard.tsx` | `amuletEffects` computation (includes relics), relic detail modal, waterfall side effects, starting relic initialization |
| `hooks/useCardPlayHandlers.ts` | 潮涌铸甲 relic grant, 护符永铸药 amulet-to-relic conversion |
| `hooks/useCardOperations.ts` | `discard-profit` relic check |
| `hooks/useCombatActions.ts` | `summon-minion`, `heal-to-damage`, `bulwark-attack`, `bulwark-armor` relic checks |
| `game-core/deck.ts` | 护符永铸药 potion card definition |
| `game-core/persistence.ts` | Relic serialization |
| `lib/gameStorage.ts` | `PersistedEternalRelic` type, persistence field |