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
- **Attack (Monster→Hero)**: Drag monster to hero card
  - **With Weapon**: If weapon value >= monster value, monster is defeated. Weapon is consumed and added to graveyard.
  - **With Weapon (weak)**: If weapon value < monster value, monster counterattacks. Shield can reduce damage. Weapon is consumed and added to graveyard.
  - **Without Weapon**: Player takes full monster value as damage. Shield can reduce damage and is consumed.
- **Attack (Weapon→Monster)**: Drag equipped weapon from equipment slot to monster card in dungeon
  - If weapon >= monster: Monster defeated, both added to graveyard
  - If weapon < monster: **Monster survives and stays on board**, counterattacks player, only weapon added to graveyard
- **Attack (Monster→Weapon)**: Drag monster from dungeon to equipped weapon slot
  - Same as Weapon→Monster, triggers attack with equipped weapon
- **Defend (Monster→Shield)**: Drag monster from dungeon to equipped shield slot
  - Shield blocks damage and is consumed, both added to graveyard
- **Heal**: Drag potion to hero card, added to graveyard
- **Collect Gold**: Drag coin to hero card, added to graveyard
- **Equip**: Drag weapon/shield to two generic equipment slots
- **Store Item**: Drag item to backpack (can only hold 1 item)
- **Sell**: Drag weapon/shield/potion/coin to graveyard zone for gold value

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
- `client/src/components/GraveyardZone.tsx`: Graveyard interface showing discarded cards
- `client/src/components/GameHeader.tsx`: HP/Gold/Cards remaining display
- `client/src/components/VictoryDefeatModal.tsx`: End game modal with statistics
- `client/src/components/HelpDialog.tsx`: Tutorial and game rules
- `client/src/index.css`: Custom animations (card-remove, damage-flash, heal-glow)
- `design_guidelines.md`: Design system and color palette

## Recent Changes (November 20, 2025)

### Major Gameplay Updates
- **Monster Survival Mechanic**: When weapon value < monster value, monster now correctly survives and stays on the board instead of being removed
- **Monster→Equipment Interactions**: Players can drag monsters onto equipped weapon slots (triggers attack) or shield slots (triggers defense)
- **Two Generic Equipment Slots**: Replaced dedicated weapon/shield slots with two flexible equipment slots that accept both weapon and shield types
- **Graveyard System**: Replaced sell zone with graveyard in top-right corner with tombstone icon
  - Tracks all used/sold/discarded cards (monsters, weapons, shields, potions, coins)
  - Click to view complete history in modal
  - Weapons and shields automatically added when consumed in combat
  - All combat paths now properly track cards to graveyard

### Animation & Visual Effects
- **Card Animations**: Smooth drag/lift effects with rotation and scale transitions
- **Combat Visual Feedback**: Damage flash (red) and healing glow (green) on hero card
- **Card Removal**: Fade-out animation with rotation when cards are consumed
- **Modal Animations**: Slide-in and fade-in effects for victory/defeat screens
- **Responsive Sizing**: Cards and UI scale across breakpoints (w-20 to w-40 based on screen size)

### Game Balance & Card Diversity
- **Monster Balance**: 4 types with varied values (Dragon 5-7, Skeleton 2-4, Goblin 2-3, Ogre 4-6)
- **Weapon Variety**: 5 types (Sword, Axe, Dagger, Mace, Spear) with values 2-6
- **Shield Types**: 4 types with values 2-4 for balanced defense
- **Potion Variety**: 3 types with healing values 2-5
- **Gold Values**: Improved range 1-4 for better economy
- **Chibi/Q-version Images**: All card types now have cute chibi-style artwork

### Enhanced Features
- **Backpack System**: Click to use/equip stored items (potions heal, weapons/shields equip)
- **Statistics Tracking**: Monsters defeated, damage taken, healing received
- **Victory Modal**: Displays comprehensive game statistics
- **Help System**: Updated tutorial explaining Monster→Equipment mechanics and graveyard
- **Improved UI**: Responsive layout with proper breakpoints for mobile/tablet/desktop

### Technical Improvements
- Fixed critical game loop bugs using `drawPending` flag
- Added `removingCards` state for animation synchronization
- Implemented proper state management for combat animations
- Removed redundant `deck` state (only `remainingDeck` tracked)
- All combat paths now add cards to graveyard (weapons, shields, monsters)
- Equipment slots accept both weapons and shields dynamically

### Graveyard System Implementation
- **removeCard Function**: Enhanced with `addToGraveyardAutomatically` parameter (default: true)
  - `removeCard(id)`: Removes from dungeon AND adds to graveyard (for potions/coins)
  - `removeCard(id, false)`: Removes from dungeon WITHOUT adding to graveyard (for equipment/backpack/already-logged cards)
- **Equipping Items**: Weapons/shields/potions moved to equipment slots or backpack do NOT add to graveyard until consumed/used/sold
- **Combat Consumption**: All combat paths manually add cards to graveyard before calling removeCard(id, false) to prevent duplicates
- **Duplicate Prevention**: Flag system ensures each card appears in graveyard exactly once per use
- **Counterattack Shield Handling**: Shield consumed during counterattacks properly added to graveyard without duplicates

## Combat System
- **Weapon Usage**: Weapons are single-use items consumed when attacking monsters. Added to graveyard after use.
- **Shield Mechanics**: Shields are single-use and consumed when blocking damage. Added to graveyard after use.
- **Monster Survival**: When weapon value < monster value, the monster survives and remains in play. Player must deal with it again.
- **Damage Calculation**:
  - With weapon >= monster: Monster defeated, both added to graveyard
  - With weapon < monster: Monster survives, counterattacks for (monster - weapon) damage, weapon added to graveyard
  - Shield blocks: Damage reduced by shield value, shield consumed and added to graveyard
- **Victory Conditions**: Monster defeated when weapon value >= monster value

## Known Constraints
- Monsters cannot be sold (only weapon, shield, potion, coin can be sold)
- Backpack holds only 1 item at a time
- Both weapons and shields are single-use
- Weapons consumed after each combat (win or lose)
- Shields consumed when blocking any damage
- All consumed cards tracked in graveyard
