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