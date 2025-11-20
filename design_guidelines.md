# Design Guidelines: Card Crawl-Inspired Web Game

## Design Approach

**Reference-Based Strategy**: Drawing inspiration from Card Crawl's clean fantasy aesthetic and mobile card games like Hearthstone, Slay the Spire, and similar dungeon crawlers. The design prioritizes intuitive drag-and-drop interactions, clear visual hierarchy, and immediate gameplay feedback.

**Core Principle**: Every UI element serves the game—no decorative clutter. The interface should feel like a physical card table with tactile, satisfying interactions.

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

**Spacing Primitives**: Tailwind units of 2, 4, 8, 12, 16
- Card gaps: gap-4
- Section padding: p-4, p-8
- Icon margins: m-2
- Slot spacing: space-x-4, space-y-4

**Game Board Structure**:
```
[Header Bar: HP | Gold | Deck Counter] - h-16, px-4
[Equipment Slots Row] - h-20, gap-4
[Hero Card - Central Focus] - w-48 h-64
[Active Card Area - 4 Cards] - grid-cols-4, gap-4
[Backpack/Ability Slots] - h-20, gap-4
```

**Responsive Breakpoints**:
- Mobile (< 768px): Stack vertically, single-column cards
- Tablet (768px - 1024px): 2x2 card grid
- Desktop (> 1024px): Full 4-card horizontal layout

**Container**:
- Max-width: max-w-6xl
- Centered: mx-auto
- Viewport: min-h-screen with vertical centering

---

## Component Library

### Core Game Elements

**1. Cards (Primary Interaction Element)**
- Dimensions: w-32 h-44 (mobile), w-40 h-56 (desktop)
- Structure: Rounded corners (rounded-xl), shadow-lg
- Draggable state: Transform scale and rotation on grab
- Hit area: Entire card + 8px padding for easier dragging
- Layout: 
  - Card border (border-4)
  - Card art area (60% height)
  - Title banner (Cinzel, centered)
  - Stats/description area (bottom 30%)

**Card Types Visual Treatment**:
- Monster Cards: Corner skull icon (Font Awesome), HP in top-right
- Weapon/Shield Cards: Centered icon, damage/defense value
- Potion Cards: Flask icon, healing value in bright numerals
- Coin Cards: Gold coin icon, value
- Ability Cards: Special effect icon, mana/cost indicator

**2. Hero Card (Central Focus)**
- Size: w-48 h-64 (larger than other cards)
- HP Display: Large Roboto Mono numerals (text-5xl) with heart icon
- Portrait area: 70% of card
- Status effects row below portrait

**3. Equipment Slots**
- Empty slot: Dashed border (border-dashed, border-2), icon placeholder
- Filled slot: Card-style container, slightly smaller (w-28 h-40)
- Labels: "Weapon", "Shield", "Backpack" in Lato 500

**4. Drag Zones**
- Drop Target Highlight: Thicker border (border-4), subtle scale transform
- Valid Drop: Visual indicator (pulsing animation)
- Invalid Drop: Shake animation, red tint overlay

### UI Components

**Header Bar**:
- Fixed height: h-16
- Three-section grid: `grid grid-cols-3`
- Left: HP with heart icon (Heroicons)
- Center: Deck counter with card icon
- Right: Gold with coin icon (Font Awesome fa-coins)

**Action Feedback**:
- Damage Numbers: Animated text that floats up (Roboto Mono 700, text-2xl)
- Heal Effect: Green glow pulse on HP display
- Gold Gained: Coin icon flies to header
- Card Destroy: Card flips and fades out

**Modals/Overlays**:
- Victory/Defeat Screen: Centered overlay (max-w-md), rounded-2xl, p-8
- Content: Large title (Cinzel 700, text-4xl), stats summary, restart button
- Background: Backdrop blur and dim

**Buttons**:
- Primary (Restart, New Game): px-8 py-4, rounded-lg, Lato 600, text-lg
- Secondary (Sell): px-4 py-2, rounded-md, Lato 500, text-sm
- Icon buttons: w-12 h-12, rounded-full

**Score Display**:
- Position: Top-right corner
- Container: px-6 py-3, rounded-full
- Font: Roboto Mono 600, text-lg

---

## Icons

**Library**: Font Awesome (via CDN) + Heroicons for UI elements

**Icon Usage**:
- Health: `fa-heart` (Font Awesome)
- Coins: `fa-coins` (Font Awesome)
- Weapons: `fa-sword` (Font Awesome)
- Shield: `fa-shield` (Font Awesome)
- Potion: `fa-flask` (Font Awesome)
- Skull (Monster): `fa-skull` (Font Awesome)
- Settings: `cog-6-tooth` (Heroicons)
- Close: `x-mark` (Heroicons)

All game card icons: 2rem (text-2xl) for card corners, 3rem (text-5xl) for central displays

---

## Animations

**Critical Interactions Only**:
- Card Drag: `transform transition-transform duration-150` - subtle lift and rotate
- Card Play: Slide and fade to destination (duration-300)
- Damage Dealt: Red flash overlay (duration-200)
- HP Change: Number count-up animation (duration-500)
- Victory/Defeat: Modal slide-in from top (duration-400)

**No continuous animations** - preserve performance and battery for mobile

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

- All draggable cards: Keyboard controls (arrow keys to select, Enter to pick up, arrow keys to move, Enter to drop)
- HP and score: aria-live regions for screen reader updates
- Card descriptions: aria-label with full card info
- Focus indicators: 2px focus ring on all interactive elements
- Touch targets: Minimum 44x44px for all buttons and interactive areas
- High contrast mode support: Ensure text remains readable

---

## Key Design Differentiators

1. **Physical Card Feel**: Cards cast subtle shadows, rotate slightly when dragged
2. **Immediate Feedback**: Every action produces instant visual response
3. **Clean Battlefield**: Minimal chrome, maximum play space
4. **Tactical Clarity**: HP and resource values are always large and readable
5. **Mobile-First Gestures**: Optimized for thumb reach zones and one-handed play