import { type GameCardData } from '@/components/GameCard';

// Import images for Knight cards
import swordImage from '@assets/generated_images/cute_cartoon_medieval_sword.png';
import axeImage from '@assets/generated_images/cute_cartoon_battle_axe.png';
import heavyShieldImage from '@assets/generated_images/simple_heavy_shield.png';
import skillScrollImage from '@assets/generated_images/chibi_skill_scroll.png';
import eventScrollImage from '@assets/generated_images/chibi_event_scroll.png';
import strengthAmuletImage from '@assets/generated_images/chibi_strength_amulet.png';
import guardianAmuletImage from '@assets/generated_images/chibi_guardian_amulet.png';

export interface KnightCardData extends GameCardData {
  classCard: true;
  description: string;
  knightEffect?: string;
  weaponBonus?: number;
  shieldBonus?: number;
  healOnKill?: number;
  damageReflect?: number;
  permanentBuff?: string;
  tempBuff?: string;
}

export function generateKnightDeck(): KnightCardData[] {
  const deck: KnightCardData[] = [];
  let id = 0;

  // === BALANCED 15-CARD KNIGHT DECK ===
  
  // === WEAPONS (5 cards) ===
  deck.push({
    id: `knight-${id++}`,
    type: 'weapon',
    name: 'Holy Blade',
    value: 6,
    image: swordImage,
    classCard: true,
    description: 'Heals 2 HP when defeating monster',
    healOnKill: 2,
    durability: 2,
    maxDurability: 2,
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'weapon',
    name: 'Champion Axe',
    value: 8,
    image: axeImage,
    classCard: true,
    description: 'Massive damage, single use',
    durability: 1,
    maxDurability: 1,
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'weapon',
    name: 'Vampire Blade',
    value: 4,
    image: swordImage,
    classCard: true,
    description: 'Heal 1 HP on each hit',
    knightEffect: 'healOnHit1',
    durability: 3,
    maxDurability: 3,
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'weapon',
    name: 'Swift Blade',
    value: 4,
    image: swordImage,
    classCard: true,
    description: 'Light weapon with 3 uses',
    durability: 3,
    maxDurability: 3,
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'weapon',
    name: 'Blessed Sword',
    value: 5,
    image: swordImage,
    classCard: true,
    description: 'Adds +2 to next attack',
    weaponBonus: 2,
    durability: 2,
    maxDurability: 2,
  });

  
  // === SHIELDS (4 cards) ===
  deck.push({
    id: `knight-${id++}`,
    type: 'shield',
    name: 'Tower Shield',
    value: 5,
    image: heavyShieldImage,
    classCard: true,
    description: 'Blocks all damage once',
    durability: 1,
    maxDurability: 1,
    knightEffect: 'fullBlock',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'shield',
    name: 'Reflective Shield',
    value: 4,
    image: heavyShieldImage,
    classCard: true,
    description: 'Deals 2 damage back',
    damageReflect: 2,
    durability: 2,
    maxDurability: 2,
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'shield',
    name: 'Knight\'s Shield',
    value: 3,
    image: heavyShieldImage,
    classCard: true,
    description: 'Reliable defense',
    durability: 3,
    maxDurability: 3,
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'shield',
    name: 'Fortress Shield',
    value: 6,
    image: heavyShieldImage,
    classCard: true,
    description: 'Heavy defense, single use',
    durability: 1,
    maxDurability: 1,
  });

  
  // === MAGIC CARDS (3 cards) ===
  deck.push({
    id: `knight-${id++}`,
    type: 'magic',
    name: 'Weapon Surge',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Next weapon attack +3 damage',
    magicType: 'instant',
    magicEffect: 'Next weapon +3',
    knightEffect: 'weaponSurge',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'magic',
    name: 'Shield Wall',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Block next 5 damage',
    magicType: 'instant',
    magicEffect: 'Temp shield 5',
    knightEffect: 'tempShield5',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'magic',
    name: 'Bloodthirsty',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Heal 2 HP when killing monsters',
    magicType: 'permanent',
    magicEffect: 'Lifesteal on kill',
    knightEffect: 'healOnMonsterKill',
  });

  // === EQUIPMENT/ARMOR CARDS (3 cards) ===
  deck.push({
    id: `knight-${id++}`,
    type: 'shield',
    name: 'Sturdy Armor',
    value: 2,
    image: heavyShieldImage,
    classCard: true,
    description: 'Reduces all damage by 1',
    durability: 4,
    maxDurability: 4,
    knightEffect: 'damageReduction1',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'amulet',
    name: 'Guardian\'s Blessing',
    value: 1,
    image: guardianAmuletImage,
    classCard: true,
    description: 'All shields get +1 defense',
    effect: 'defense',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'amulet',
    name: 'Weapon Master\'s Focus',
    value: 1,
    image: strengthAmuletImage,
    classCard: true,
    description: 'All weapons get +1 attack',
    effect: 'attack',
  });

  // Shuffle the deck
  return deck.sort(() => Math.random() - 0.5);
}

// Class card discovery events for the main deck
export function createKnightDiscoveryEvents(): GameCardData[] {
  const events: GameCardData[] = [];
  
  events.push({
    id: 'discovery-armory',
    type: 'event',
    name: 'Ancient Armory',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: 'Search for weapons (Draw 3 Knight cards)', effect: 'drawKnight3' },
      { text: 'Leave', effect: 'none' }
    ]
  });

  events.push({
    id: 'discovery-cache',
    type: 'event',
    name: 'Knight\'s Cache',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: 'Open cache (Draw and equip Knight card)', effect: 'equipKnight' },
      { text: 'Leave', effect: 'none' }
    ]
  });

  events.push({
    id: 'discovery-training',
    type: 'event',
    name: 'Training Ground',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: 'Train (Draw Knight skill, use immediately)', effect: 'useKnightSkill' },
      { text: 'Leave', effect: 'none' }
    ]
  });

  return events;
}