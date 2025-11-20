# Card Crawl Game

## Project Overview
A web-based card game inspired by the "Card Crawl" mobile game. Players must survive through a 54-card deck by strategically playing cards in a fantasy dungeon-crawling theme.

## Game Mechanics

### Core Rules
- **Deck**: 54 randomly shuffled cards (monsters, weapons, shields, potions, gold)
- **Grid Layout**: 2x4 grid
  - Top row (4 slots): Dungeon cards drawn from deck
  - Bottom row (4 slots): Hero card (center), weapon slot (left), shield slot (right), backpack (far right)
- **Turn Mechanic**: Player MUST play exactly 3 of 4 cards each turn
- **Card Carry-Over**: The 4th unplayed card carries over to the next hand
- **Victory**: Survive until all 54 cards are consumed
- **Defeat**: Hero HP reaches 0

### Card Types
1. **Monster**: Attack hero for damage (reduced by equipped shield)
2. **Weapon**: Equip in weapon slot or sell for gold
3. **Shield**: Equip in shield slot or sell for gold
4. **Potion**: Heal hero HP
5. **Gold/Coin**: Add to gold total

### Actions
- **Attack Monster**: Drag monster to hero card
  - **With Weapon**: If weapon value >= monster value, monster is defeated with no damage to player. Weapon is consumed.
  - **With Weapon (weak)**: If weapon value < monster value, monster counterattacks for (monster value - weapon value) damage. Shield can reduce this damage. Weapon is consumed.
  - **Without Weapon**: Player takes full monster value as damage. Shield can reduce damage.
- **Heal**: Drag potion to hero card
- **Collect Gold**: Drag coin to hero card
- **Equip**: Drag weapon/shield to respective equipment slot
- **Store Item**: Drag item to backpack (can only hold 1 item)
- **Sell**: Drag weapon/shield/potion/coin to sell zone for gold value

### State Management
- `remainingDeck`: Single source of truth for unconsumed cards
- `activeCards`: Current 4 cards displayed in dungeon row
- `cardsPlayed`: Counter tracking cards played this turn (resets after drawing)
- `drawPending`: Boolean flag preventing race conditions in card draw logic

### Technical Implementation
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS with fantasy gothic theme
- **Colors**: Deep purples (#2E1A47, #5B3C8B), blood red accents (#9A0707, #D63F2E)
- **Fonts**: Cinzel (titles), Lato (UI), Roboto Mono (stats)
- **Drag & Drop**: Native HTML5 drag-and-drop API

## Key Files
- `client/src/components/GameBoard.tsx`: Main game logic and state management
- `client/src/components/GameCard.tsx`: Card display component with animations
- `client/src/components/HeroCard.tsx`: Player character card with combat effects
- `client/src/components/EquipmentSlot.tsx`: Weapon/shield/backpack slots with click handlers
- `client/src/components/SellZone.tsx`: Selling interface
- `client/src/components/GameHeader.tsx`: HP/Gold/Cards remaining display
- `client/src/components/VictoryDefeatModal.tsx`: End game modal with statistics
- `client/src/components/HelpDialog.tsx`: Tutorial and game rules
- `client/src/index.css`: Custom animations (card-remove, damage-flash, heal-glow)
- `design_guidelines.md`: Design system and color palette

## Recent Changes (November 20, 2025)

### Animation & Visual Effects
- **Card Animations**: Smooth drag/lift effects with rotation and scale transitions
- **Combat Visual Feedback**: Damage flash (red) and healing glow (green) on hero card
- **Card Removal**: Fade-out animation with rotation when cards are consumed
- **Modal Animations**: Slide-in and fade-in effects for victory/defeat screens

### Game Balance & Card Diversity
- **Monster Balance**: 4 types with varied values (Dragon 5-7, Skeleton 2-4, Goblin 2-3, Ogre 4-6)
- **Weapon Variety**: 5 types (Sword, Axe, Dagger, Mace, Spear) with values 2-6
- **Shield Types**: 4 types with values 2-4 for balanced defense
- **Potion Variety**: 3 types with healing values 2-5
- **Gold Values**: Improved range 1-4 for better economy

### Enhanced Features
- **Backpack System**: Click to use/equip stored items (potions heal, weapons/shields equip)
- **Statistics Tracking**: Monsters defeated, damage taken, healing received
- **Victory Modal**: Displays comprehensive game statistics
- **Help System**: In-game tutorial explaining all mechanics and card types
- **Improved UI**: Enhanced sell zone with visual feedback

### Technical Improvements
- Fixed critical game loop bugs using `drawPending` flag
- Added `removingCards` state for animation synchronization
- Implemented proper state management for combat animations
- Removed redundant `deck` state (only `remainingDeck` tracked)

## Combat System
- **Weapon Usage**: Weapons are single-use items consumed when attacking monsters
- **Shield Mechanics**: Shields are permanent and reduce incoming damage from monster counterattacks
- **Damage Calculation**:
  - With weapon: damage = max(0, monster value - weapon value - shield value)
  - Without weapon: damage = max(0, monster value - shield value)
- **Victory Conditions**: Monster defeated when weapon value >= monster value

## Known Constraints
- Monsters cannot be sold (only weapon, shield, potion, coin)
- Backpack holds only 1 item at a time
- Shields are permanent but weapons are single-use
- Weapon is consumed after each combat (win or lose)
