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

  // === WEAPON ENHANCEMENT CARDS (12) ===
  
  // Weapons (6)
  deck.push({
    id: `knight-${id++}`,
    type: 'weapon',
    name: 'Blessed Sword',
    value: 5,
    image: swordImage,
    classCard: true,
    description: 'Adds +2 to next weapon attack',
    weaponBonus: 2,
    durability: 2,
    maxDurability: 2,
  });

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
    value: 7,
    image: axeImage,
    classCard: true,
    description: 'High damage, single use',
    durability: 1,
    maxDurability: 1,
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
    name: 'Executioner\'s Axe',
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
    name: 'Knight\'s Sword',
    value: 5,
    image: swordImage,
    classCard: true,
    description: 'Reliable weapon with 2 uses',
    durability: 2,
    maxDurability: 2,
  });

  // Weapon Enhancement Skills (4)
  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Sharpening Stone',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '+1 to all weapons this battle',
    skillType: 'instant',
    skillEffect: 'All weapons +1 damage',
    knightEffect: 'weaponBuff',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Dual Strike',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Attack twice with current weapon',
    skillType: 'instant',
    skillEffect: 'Double weapon attack',
    knightEffect: 'dualStrike',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Weapon Surge',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Next weapon attack +3 damage',
    skillType: 'instant',
    skillEffect: 'Next weapon +3',
    knightEffect: 'weaponSurge',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Battle Ready',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Draw and equip a weapon from deck',
    skillType: 'instant',
    skillEffect: 'Draw weapon',
    knightEffect: 'drawWeapon',
  });

  // Weapon Enhancement Amulet (1)
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

  // Weapon Enhancement Event (1)
  deck.push({
    id: `knight-${id++}`,
    type: 'event',
    name: 'Forge Enhancement',
    value: 0,
    image: eventScrollImage,
    classCard: true,
    description: 'Choose your enhancement',
    eventChoices: [
      { text: 'Upgrade weapon (+2 damage)', effect: 'weaponUpgrade' },
      { text: 'Take payment (Gain 3 gold)', effect: 'gold+3' },
      { text: 'Leave', effect: 'none' }
    ]
  });

  // === DEFENSIVE/SHIELD CARDS (12) ===
  
  // Shields (6)
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

  deck.push({
    id: `knight-${id++}`,
    type: 'shield',
    name: 'Guardian Shield',
    value: 4,
    image: heavyShieldImage,
    classCard: true,
    description: 'Solid defense',
    durability: 2,
    maxDurability: 2,
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'shield',
    name: 'Spiked Shield',
    value: 3,
    image: heavyShieldImage,
    classCard: true,
    description: 'Deals 1 damage back',
    damageReflect: 1,
    durability: 2,
    maxDurability: 2,
  });

  // Defensive Skills (4)
  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Shield Wall',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Next 3 shields get +2 defense',
    skillType: 'instant',
    skillEffect: 'Shield buff +2',
    knightEffect: 'shieldWall',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Defensive Stance',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Reduce all damage by 1 this turn',
    skillType: 'instant',
    skillEffect: 'Damage reduction',
    knightEffect: 'defensiveStance',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Iron Defense',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Block next 5 damage',
    skillType: 'instant',
    skillEffect: 'Temp shield 5',
    knightEffect: 'tempShield5',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Shield Bash',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Use shield to deal its defense as damage',
    skillType: 'instant',
    skillEffect: 'Shield becomes weapon',
    knightEffect: 'shieldBash',
  });

  // Defensive Amulet (1)
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

  // Defensive Event (1)
  deck.push({
    id: `knight-${id++}`,
    type: 'event',
    name: 'Armor Polish',
    value: 0,
    image: eventScrollImage,
    classCard: true,
    description: 'Maintain your defenses',
    eventChoices: [
      { text: 'Restore a shield', effect: 'restoreShield' },
      { text: 'Gain 2 shield value', effect: 'tempShield+2' },
      { text: 'Skip', effect: 'none' }
    ]
  });

  // === BLOOD KNIGHT CARDS (13) ===
  
  // Blood Weapons (3)
  deck.push({
    id: `knight-${id++}`,
    type: 'weapon',
    name: 'Life Drain Blade',
    value: 4,
    image: swordImage,
    classCard: true,
    description: 'Heal 2 HP on kill',
    healOnKill: 2,
    durability: 2,
    maxDurability: 2,
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'weapon',
    name: 'Blood Edge',
    value: 5,
    image: swordImage,
    classCard: true,
    description: 'Costs 2 HP to equip, high damage',
    knightEffect: 'bloodCost2',
    durability: 2,
    maxDurability: 2,
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'weapon',
    name: 'Vampire Blade',
    value: 3,
    image: swordImage,
    classCard: true,
    description: 'Heal 1 HP on hit',
    knightEffect: 'healOnHit1',
    durability: 3,
    maxDurability: 3,
  });

  // Blood Skills (7)
  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Blood Sacrifice',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Lose 3 HP, next attack +3',
    skillType: 'instant',
    skillEffect: 'HP -3, Attack +3',
    knightEffect: 'bloodSacrifice',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Berserker Rage',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '+1 damage per 2 HP missing',
    skillType: 'permanent',
    skillEffect: 'Berserker mode',
    knightEffect: 'berserkerRage',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Vampiric Strike',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Next attack heals half damage',
    skillType: 'instant',
    skillEffect: 'Lifesteal 50%',
    knightEffect: 'vampiricStrike',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Battle Frenzy',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Lower HP = higher damage',
    skillType: 'permanent',
    skillEffect: 'Frenzy mode',
    knightEffect: 'battleFrenzy',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Blood for Power',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Lose 5 HP, gain 10 gold',
    skillType: 'instant',
    skillEffect: 'HP to Gold',
    knightEffect: 'bloodForGold',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Crimson Shield',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Lose 2 HP, block next 6 damage',
    skillType: 'instant',
    skillEffect: 'Blood Shield',
    knightEffect: 'crimsonShield',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Life Transfer',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Convert 3 HP to 3 weapon damage',
    skillType: 'instant',
    skillEffect: 'HP to damage',
    knightEffect: 'lifeTransfer',
  });

  // Blood Amulet (1)
  deck.push({
    id: `knight-${id++}`,
    type: 'amulet',
    name: 'Crimson Amulet',
    value: 1,
    image: strengthAmuletImage,
    classCard: true,
    description: 'Heal 1 HP per monster killed',
    effect: 'attack',
    knightEffect: 'healOnMonsterKill',
  });

  // Blood Events (2)
  deck.push({
    id: `knight-${id++}`,
    type: 'event',
    name: 'Blood Pact',
    value: 0,
    image: eventScrollImage,
    classCard: true,
    description: 'Dark bargain for power',
    eventChoices: [
      { text: 'Sacrifice (Lose 5 HP, gain weapon)', effect: 'hp-5,powerWeapon' },
      { text: 'Refuse', effect: 'none' }
    ]
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'event',
    name: 'Blood Ritual',
    value: 0,
    image: eventScrollImage,
    classCard: true,
    description: 'Ancient blood magic',
    eventChoices: [
      { text: 'Offer blood (Lose 3 HP, draw 2 cards)', effect: 'hp-3,draw2' },
      { text: 'Offer gold (Lose 5 gold, heal 3)', effect: 'gold-5,heal+3' },
      { text: 'Leave', effect: 'none' }
    ]
  });

  // === DURABILITY/EQUIPMENT CARDS (13) ===
  
  // Equipment Items (4)
  deck.push({
    id: `knight-${id++}`,
    type: 'shield',
    name: 'Sturdy Armor',
    value: 1,
    image: heavyShieldImage,
    classCard: true,
    description: 'Reduces all damage by 1',
    durability: 3,
    maxDurability: 3,
    knightEffect: 'damageReduction1',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'shield',
    name: 'Reinforced Plate',
    value: 2,
    image: heavyShieldImage,
    classCard: true,
    description: 'Good defense, 4 uses',
    durability: 4,
    maxDurability: 4,
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'weapon',
    name: 'Durable Sword',
    value: 3,
    image: swordImage,
    classCard: true,
    description: '5 uses, reliable damage',
    durability: 5,
    maxDurability: 5,
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'weapon',
    name: 'Reinforced Mace',
    value: 4,
    image: axeImage,
    classCard: true,
    description: '4 uses, solid damage',
    durability: 4,
    maxDurability: 4,
  });

  // Durability Skills (6)
  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Reinforced Equipment',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Next equipment won\'t break',
    skillType: 'instant',
    skillEffect: 'Unbreakable next',
    knightEffect: 'reinforceNext',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Repair Kit',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Restore broken equipment',
    skillType: 'instant',
    skillEffect: 'Repair from graveyard',
    knightEffect: 'repairKit',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Spare Weapons',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Equip 2 weapons from backpack',
    skillType: 'instant',
    skillEffect: 'Double equip',
    knightEffect: 'spareWeapons',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Emergency Repair',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Restore 2 durability to equipment',
    skillType: 'instant',
    skillEffect: '+2 durability',
    knightEffect: 'emergencyRepair',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Salvage',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'Break equipment for 3 gold',
    skillType: 'instant',
    skillEffect: 'Equipment to gold',
    knightEffect: 'salvage',
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'skill',
    name: 'Field Maintenance',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: 'All equipment +1 durability',
    skillType: 'instant',
    skillEffect: 'Global repair',
    knightEffect: 'fieldMaintenance',
  });

  // Durability Amulet (1)
  deck.push({
    id: `knight-${id++}`,
    type: 'amulet',
    name: 'Blacksmith\'s Blessing',
    value: 0,
    image: guardianAmuletImage,
    classCard: true,
    description: '25% chance equipment doesn\'t break',
    effect: 'defense',
    knightEffect: 'durabilityChance',
  });

  // Durability Events (2)
  deck.push({
    id: `knight-${id++}`,
    type: 'event',
    name: 'Maintenance',
    value: 0,
    image: eventScrollImage,
    classCard: true,
    description: 'Equipment upkeep',
    eventChoices: [
      { text: 'Repair all equipment', effect: 'repairAll' },
      { text: 'Draw 2 class cards', effect: 'drawClass2' },
      { text: 'Skip', effect: 'none' }
    ]
  });

  deck.push({
    id: `knight-${id++}`,
    type: 'event',
    name: 'Smithy',
    value: 0,
    image: eventScrollImage,
    classCard: true,
    description: 'Visit the blacksmith',
    eventChoices: [
      { text: 'Upgrade weapon (+2 damage)', effect: 'weaponUpgrade2' },
      { text: 'Upgrade shield (+2 defense)', effect: 'shieldUpgrade2' },
      { text: 'Leave', effect: 'none' }
    ]
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