import { useState, useEffect } from 'react';
import GameHeader from './GameHeader';
import HeroCard from './HeroCard';
import GameCard, { type GameCardData } from './GameCard';
import EquipmentSlot, { type SlotType } from './EquipmentSlot';
import AmuletSlot from './AmuletSlot';
import GraveyardZone from './GraveyardZone';
import HandArea from './HandArea';
import VictoryDefeatModal from './VictoryDefeatModal';
import HelpDialog from './HelpDialog';
import DeckViewerModal from './DeckViewerModal';
import EventChoiceModal from './EventChoiceModal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

// Cute chibi-style monster images
import dragonImage from '@assets/generated_images/cute_chibi_dragon_monster.png';
import skeletonImage from '@assets/generated_images/cute_chibi_skeleton_monster.png';
import goblinImage from '@assets/generated_images/cute_chibi_goblin_monster.png';
import ogreImage from '@assets/generated_images/cute_chibi_ogre_monster.png';

// Cute cartoon weapon images
import swordImage from '@assets/generated_images/cute_cartoon_medieval_sword.png';
import axeImage from '@assets/generated_images/cute_cartoon_battle_axe.png';
import daggerImage from '@assets/generated_images/cute_cartoon_dagger.png';

// Cute cartoon shields (different tiers) - NEW Q-version style
import woodenShieldImage from '@assets/generated_images/chibi_wooden_shield.png';
import ironShieldImage from '@assets/generated_images/chibi_iron_shield.png';
import heavyShieldImage from '@assets/generated_images/chibi_heavy_shield.png';

// Cute cartoon potion and coin
import potionImage from '@assets/generated_images/cute_cartoon_healing_potion.png';
import coinImage from '@assets/generated_images/cute_cartoon_gold_coins.png';

// Hero image (chibi version)
import heroImage from '@assets/generated_images/chibi_hero_adventurer_character.png';

// Amulet images
import lifeAmuletImage from '@assets/generated_images/chibi_life_amulet.png';
import strengthAmuletImage from '@assets/generated_images/chibi_strength_amulet.png';
import guardianAmuletImage from '@assets/generated_images/chibi_guardian_amulet.png';

// Skill and Event images
import skillScrollImage from '@assets/generated_images/chibi_skill_scroll.png';
import eventScrollImage from '@assets/generated_images/chibi_event_scroll.png';

const INITIAL_HP = 20;
const SELLABLE_TYPES = ['potion', 'coin', 'weapon', 'shield', 'amulet', 'skill'] as const;
const DECK_SIZE = 64; // Updated: 54 + 6 skills + 4 events = 64

type EquipmentItem = { 
  name: string; 
  value: number; 
  image?: string; 
  type: 'weapon' | 'shield';
  durability?: number;
  maxDurability?: number;
};
type AmuletItem = { name: string; value: number; image?: string; type: 'amulet'; effect: 'health' | 'attack' | 'defense' };
type EquipmentSlotId = 'equipmentSlot1' | 'equipmentSlot2';

function createDeck(): GameCardData[] {
  const deck: GameCardData[] = [];
  let id = 0;

  // Monster variety with attack/HP separation and layers
  const monsterTypes = [
    { 
      name: 'Dragon', 
      image: dragonImage, 
      minAttack: 3, maxAttack: 4,
      minHp: 5, maxHp: 7,
      minLayers: 2, maxLayers: 3
    },
    { 
      name: 'Skeleton', 
      image: skeletonImage, 
      minAttack: 1, maxAttack: 2,
      minHp: 2, maxHp: 4,
      minLayers: 1, maxLayers: 2
    },
    { 
      name: 'Goblin', 
      image: goblinImage, 
      minAttack: 1, maxAttack: 2,
      minHp: 2, maxHp: 3,
      minLayers: 1, maxLayers: 1
    },
    { 
      name: 'Ogre', 
      image: ogreImage, 
      minAttack: 2, maxAttack: 3,
      minHp: 4, maxHp: 6,
      minLayers: 2, maxLayers: 2
    },
  ];

  // 12 monsters total: 3 of each type
  for (let i = 0; i < 12; i++) {
    const monsterType = monsterTypes[i % monsterTypes.length];
    const attack = Math.floor(Math.random() * (monsterType.maxAttack - monsterType.minAttack + 1)) + monsterType.minAttack;
    const hp = Math.floor(Math.random() * (monsterType.maxHp - monsterType.minHp + 1)) + monsterType.minHp;
    const layers = Math.floor(Math.random() * (monsterType.maxLayers - monsterType.minLayers + 1)) + monsterType.minLayers;
    
    deck.push({
      id: `monster-${id++}`,
      type: 'monster',
      name: monsterType.name,
      value: attack, // Keep value for backwards compatibility
      attack: attack,
      hp: hp,
      maxHp: hp,
      hpLayers: layers,
      currentLayer: 1,
      image: monsterType.image,
    });
  }

  // Weapon variety with improved values (2-6 range)
  const weaponTypes = [
    { name: 'Sword', image: swordImage },
    { name: 'Axe', image: axeImage },
    { name: 'Dagger', image: daggerImage },
    { name: 'Mace', image: swordImage }, // Reuse sword
    { name: 'Spear', image: daggerImage }, // Reuse dagger
  ];
  
  for (let i = 0; i < 10; i++) {
    const weaponType = weaponTypes[i % weaponTypes.length];
    // Balanced weapon values: 2-6
    const value = Math.floor(Math.random() * 5) + 2;
    // Random durability 1-3
    const durability = Math.floor(Math.random() * 3) + 1;
    deck.push({
      id: `weapon-${id++}`,
      type: 'weapon',
      name: weaponType.name,
      value: value,
      image: weaponType.image,
      durability: durability,
      maxDurability: durability,
    });
  }

  // Shield variety (2-4 range for balance) with different images per value
  const shieldTypes = [
    { name: 'Wooden Shield', value: 2, image: woodenShieldImage },
    { name: 'Iron Shield', value: 3, image: ironShieldImage },
    { name: 'Heavy Shield', value: 4, image: heavyShieldImage },
  ];
  
  // 3-4 shields of each type (10 total)
  for (let i = 0; i < 10; i++) {
    const shieldType = shieldTypes[i % shieldTypes.length];
    // Random durability 1-3
    const durability = Math.floor(Math.random() * 3) + 1;
    deck.push({
      id: `shield-${id++}`,
      type: 'shield',
      name: shieldType.name,
      value: shieldType.value,
      image: shieldType.image,
      durability: durability,
      maxDurability: durability,
    });
  }

  // Potions (2-5 range, 12 total for balanced healing)
  const potionTypes = [
    'Health Potion', 'Healing Elixir', 'Restorative Brew'
  ];
  
  for (let i = 0; i < 12; i++) {
    const potionName = potionTypes[i % potionTypes.length];
    deck.push({
      id: `potion-${id++}`,
      type: 'potion',
      name: potionName,
      value: Math.floor(Math.random() * 4) + 2,
      image: potionImage,
    });
  }

  // Gold coins (5-10 range, 4 total - rare but valuable)
  for (let i = 0; i < 4; i++) {
    deck.push({
      id: `coin-${id++}`,
      type: 'coin',
      name: 'Gold',
      value: Math.floor(Math.random() * 6) + 5, // 5-10 gold
      image: coinImage,
    });
  }

  // Amulets (3 types, 2 of each = 6 total)
  const amuletTypes = [
    { name: 'Life Amulet', effect: 'health' as const, value: 5, image: lifeAmuletImage },
    { name: 'Strength Amulet', effect: 'attack' as const, value: 1, image: strengthAmuletImage },
    { name: 'Guardian Amulet', effect: 'defense' as const, value: 1, image: guardianAmuletImage },
  ];
  
  for (let i = 0; i < 6; i++) {
    const amuletType = amuletTypes[i % amuletTypes.length];
    deck.push({
      id: `amulet-${id++}`,
      type: 'amulet',
      name: amuletType.name,
      value: amuletType.value,
      image: amuletType.image,
      effect: amuletType.effect,
    });
  }

  // Skill cards (4 instant, 2 permanent = 6 total) 
  // Instant skills
  deck.push({
    id: `skill-${id++}`,
    type: 'skill',
    name: 'Healing Wave',
    value: 0,
    image: skillScrollImage,
    skillType: 'instant',
    skillEffect: 'Heal 5 HP'
  });
  
  deck.push({
    id: `skill-${id++}`,
    type: 'skill', 
    name: 'Lightning Strike',
    value: 0,
    image: skillScrollImage,
    skillType: 'instant',
    skillEffect: 'Deal 4 damage to any monster'
  });

  deck.push({
    id: `skill-${id++}`,
    type: 'skill',
    name: 'Shield Bash',
    value: 0,
    image: skillScrollImage,
    skillType: 'instant',
    skillEffect: 'Block next 3 damage'
  });

  deck.push({
    id: `skill-${id++}`,
    type: 'skill',
    name: 'Gold Rush',
    value: 0,
    image: skillScrollImage,
    skillType: 'instant',
    skillEffect: 'Gain 8 gold'
  });

  // Permanent skills
  deck.push({
    id: `skill-${id++}`,
    type: 'skill',
    name: 'Iron Skin',
    value: 0,
    image: skillScrollImage,
    skillType: 'permanent',
    skillEffect: 'Reduce all damage by 1'
  });

  deck.push({
    id: `skill-${id++}`,
    type: 'skill',
    name: 'Weapon Master',
    value: 0,
    image: skillScrollImage,
    skillType: 'permanent',
    skillEffect: 'All weapons +1 damage'
  });

  // Event cards (4 total)
  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: 'Mysterious Shrine',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: 'Pray (+3 Max HP)', effect: 'maxhp+3' },
      { text: 'Donate (Lose 5 Gold, Heal Full)', effect: 'gold-5,fullheal' },
      { text: 'Leave', effect: 'none' }
    ]
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: 'Wandering Merchant',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: 'Buy Potion (5 Gold for Heal 3)', effect: 'gold-5,heal+3' },
      { text: 'Buy Weapon (8 Gold for Random Weapon)', effect: 'gold-8,weapon' },
      { text: 'Decline', effect: 'none' }
    ]
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: 'Dark Altar',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: 'Sacrifice HP (Lose 3 HP, Gain 10 Gold)', effect: 'hp-3,gold+10' },
      { text: 'Sacrifice Gold (Lose 10 Gold, Heal 5 HP)', effect: 'gold-10,heal+5' },
      { text: 'Walk Away', effect: 'none' }
    ]
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: 'Ancient Tome',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: 'Read It (Take 2 Damage, Gain Permanent Skill)', effect: 'hp-2,permanentskill' },
      { text: 'Sell It (Gain 7 Gold)', effect: 'gold+7' },
      { text: 'Ignore It', effect: 'none' }
    ]
  });

  return deck.sort(() => Math.random() - 0.5);
}

export default function GameBoard() {
  const { toast } = useToast();
  const [hp, setHp] = useState(INITIAL_HP);
  const [gold, setGold] = useState(0);
  const [previewCards, setPreviewCards] = useState<GameCardData[]>([]); // New state for preview row
  const [activeCards, setActiveCards] = useState<GameCardData[]>([]);
  const [remainingDeck, setRemainingDeck] = useState<GameCardData[]>([]);
  const [equipmentSlot1, setEquipmentSlot1] = useState<EquipmentItem | null>(null);
  const [equipmentSlot2, setEquipmentSlot2] = useState<EquipmentItem | null>(null);
  const [amuletSlot, setAmuletSlot] = useState<AmuletItem | null>(null);
  const [backpackItems, setBackpackItems] = useState<Array<{ name: string; value: number; image?: string; type: 'weapon' | 'shield' | 'potion' | 'skill' }>>([]);
  const [cardsPlayed, setCardsPlayed] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [victory, setVictory] = useState(false);
  const [draggedCard, setDraggedCard] = useState<GameCardData | null>(null);
  const [draggedEquipment, setDraggedEquipment] = useState<any | null>(null);
  const [drawPending, setDrawPending] = useState(false);
  const [removingCards, setRemovingCards] = useState<Set<string>>(new Set());
  const [takingDamage, setTakingDamage] = useState(false);
  const [healing, setHealing] = useState(false);
  
  // Game statistics
  const [monstersDefeated, setMonstersDefeated] = useState(0);
  const [totalDamageTaken, setTotalDamageTaken] = useState(0);
  const [totalHealed, setTotalHealed] = useState(0);
  const [deckViewerOpen, setDeckViewerOpen] = useState(false);
  const [discardedCards, setDiscardedCards] = useState<GameCardData[]>([]);
  const [handCards, setHandCards] = useState<GameCardData[]>([]); // Hand system - max 5 cards
  const [permanentSkills, setPermanentSkills] = useState<string[]>([]); // Track permanent skill effects
  const [tempShield, setTempShield] = useState(0); // Temporary shield from skills
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [currentEventCard, setCurrentEventCard] = useState<GameCardData | null>(null);

  // Calculate passive bonuses from amulet and permanent skills
  const getAmuletBonus = (type: 'health' | 'attack' | 'defense'): number => {
    if (amuletSlot?.effect === type) {
      return amuletSlot.value;
    }
    return 0;
  };

  // Function to damage a monster and update its HP layers
  const damageMonster = (monster: GameCardData, damage: number): GameCardData => {
    if (!monster.hp || !monster.maxHp || !monster.hpLayers) {
      // Fallback for old monsters
      return {
        ...monster,
        hp: Math.max(0, (monster.hp || monster.value) - damage),
        value: Math.max(0, (monster.hp || monster.value) - damage)
      };
    }

    const newHp = Math.max(0, monster.hp - damage);
    const hpPerLayer = monster.maxHp / monster.hpLayers;
    const currentLayer = Math.ceil(newHp / hpPerLayer) || 1;
    
    return {
      ...monster,
      hp: newHp,
      currentLayer: currentLayer,
      layerShift: (monster.hpLayers - currentLayer) // Shift increases as layers deplete
    };
  };

  const maxHp = INITIAL_HP + getAmuletBonus('health') + (permanentSkills.includes('Iron Will') ? 3 : 0);
  const attackBonus = getAmuletBonus('attack') + (permanentSkills.includes('Weapon Master') ? 1 : 0);
  const defenseBonus = getAmuletBonus('defense') + (permanentSkills.includes('Iron Skin') ? 1 : 0);

  useEffect(() => {
    initGame();
  }, []);

  const initGame = () => {
    const newDeck = createDeck();
    // Initialize with 10 cards total: 5 for preview, 5 for active
    setPreviewCards(newDeck.slice(0, 5));  // Top row (preview)
    setActiveCards(newDeck.slice(5, 10));  // Middle row (active)
    setRemainingDeck(newDeck.slice(10));    // Rest of deck
    setHp(INITIAL_HP);
    setGold(0);
    setEquipmentSlot1(null);
    setEquipmentSlot2(null);
    setAmuletSlot(null);
    // Add default Reshuffle skill to backpack
    setBackpackItems([{
      name: 'Reshuffle',
      value: 0,
      image: skillScrollImage,
      type: 'skill'
    }]);
    setCardsPlayed(0);
    setGameOver(false);
    setVictory(false);
    setDrawPending(false);
    setMonstersDefeated(0);
    setTotalDamageTaken(0);
    setTotalHealed(0);
    setDiscardedCards([]);
    setHandCards([]);
    setPermanentSkills([]);
    setTempShield(0);
    setEventModalOpen(false);
    setCurrentEventCard(null);
  };

  // Equipment slot helpers
  const getEquipmentSlots = (): { id: EquipmentSlotId; item: EquipmentItem | null }[] => {
    return [
      { id: 'equipmentSlot1', item: equipmentSlot1 },
      { id: 'equipmentSlot2', item: equipmentSlot2 }
    ];
  };

  const setEquipmentSlotById = (id: EquipmentSlotId, item: EquipmentItem | null) => {
    if (id === 'equipmentSlot1') setEquipmentSlot1(item);
    else setEquipmentSlot2(item);
  };

  const clearEquipmentSlotById = (id: EquipmentSlotId) => setEquipmentSlotById(id, null);

  const findWeaponSlot = (): { id: EquipmentSlotId; item: EquipmentItem } | null => {
    for (const slot of getEquipmentSlots()) {
      if (slot.item?.type === 'weapon') return slot as { id: EquipmentSlotId; item: EquipmentItem };
    }
    return null;
  };

  const findShieldSlot = (): { id: EquipmentSlotId; item: EquipmentItem } | null => {
    for (const slot of getEquipmentSlots()) {
      if (slot.item?.type === 'shield') return slot as { id: EquipmentSlotId; item: EquipmentItem };
    }
    return null;
  };

  useEffect(() => {
    if (!drawPending) return;
    
    const timer = setTimeout(() => {
      let unplayedCard: GameCardData | null = null;
      
      // First, capture the unplayed card
      setActiveCards(prev => {
        unplayedCard = prev.length === 1 ? prev[0] : null;
        return prev;
      });
      
      // Then update both deck and active cards
      setRemainingDeck(prevRemaining => {
        const cardsToDraw = Math.min(4, prevRemaining.length); // Draw 4 cards for 5-card hands
        
        if (cardsToDraw === 0 && !unplayedCard) {
          setVictory(true);
          setGameOver(true);
          setActiveCards([]);
          setCardsPlayed(0);
          setDrawPending(false);
          return prevRemaining;
        }

        const newCards = prevRemaining.slice(0, cardsToDraw);
        const nextHand = unplayedCard ? [unplayedCard, ...newCards] : newCards;
        
        setActiveCards(nextHand);
        setCardsPlayed(0);
        setDrawPending(false);
        
        return prevRemaining.slice(cardsToDraw); // Remove drawn cards from deck
      });
    }, 500);
    
    return () => clearTimeout(timer);
  }, [drawPending]);

  const addToGraveyard = (card: GameCardData) => {
    setDiscardedCards(prev => [...prev, card]);
  };

  // Waterfall mechanism - moves preview cards down and draws new ones
  const triggerWaterfall = () => {
    const stuckCard = activeCards[0]; // The one card that's stuck
    
    // Move preview cards down to active (4 cards from preview)
    setActiveCards(previewCards);
    
    // Draw 5 new cards for preview row
    const newPreviewCards = remainingDeck.slice(0, 5);
    if (newPreviewCards.length > 0) {
      setPreviewCards(newPreviewCards);
      setRemainingDeck(prev => prev.slice(5));
    } else {
      // No more cards in deck - clear preview
      setPreviewCards([]);
      if (remainingDeck.length === 0) {
        // Victory if no cards left
        setVictory(true);
        setGameOver(true);
      }
    }
    
    // Add stuck card to graveyard
    if (stuckCard) {
      addToGraveyard(stuckCard);
      toast({
        title: 'Cards Waterfall!',
        description: `${stuckCard.name} was discarded, new cards drop down!`
      });
    }
  };

  // Remove card from active cards (add to graveyard automatically)
  const removeCard = (cardId: string, addToGraveyardAutomatically: boolean = true) => {
    // Find the card to add to graveyard if needed
    if (addToGraveyardAutomatically) {
      const cardToRemove = activeCards.find(c => c.id === cardId);
      if (cardToRemove) {
        addToGraveyard(cardToRemove);
      }
    }
    
    // Add card to removing set for animation
    setRemovingCards(prev => new Set(prev).add(cardId));
    
    // Delay actual removal for animation
    setTimeout(() => {
      setActiveCards(prev => {
        const updated = prev.filter(c => c.id !== cardId);
        
        // Check if exactly 1 card remains - trigger waterfall
        if (updated.length === 1) {
          // Use setTimeout to trigger waterfall after this state update completes
          setTimeout(() => {
            triggerWaterfall();
          }, 100);
        } else if (updated.length === 0) {
          // Should not happen with waterfall mechanism, but handle it
          if (remainingDeck.length === 0 && previewCards.length === 0) {
            setVictory(true);
            setGameOver(true);
          }
        }
        
        return updated;
      });
      
      // Clear from removing set
      setRemovingCards(prev => {
        const next = new Set(prev);
        next.delete(cardId);
        return next;
      });
    }, 300);
  };

  const resolveMonsterEncounter = (monster: GameCardData) => {
    // Use monster's attack and HP if available, fall back to value for backwards compatibility
    const monsterAttack = monster.attack ?? monster.value;
    const monsterHp = monster.hp ?? monster.value;
    const weaponSlot = findWeaponSlot();
    let damageToPlayer = 0;
    let shieldAlreadyLogged = false;

    if (weaponSlot) {
      // Apply attack bonus from amulet
      const weaponDamage = weaponSlot.item.value + attackBonus;
      
      // Attack with weapon - damage the monster's HP
      if (weaponDamage >= monsterHp) {
        // Monster defeated
        setMonstersDefeated(prev => prev + 1);
        toast({
          title: 'Monster Defeated!',
          description: `Your ${weaponSlot.item.name} (${weaponDamage}${attackBonus > 0 ? ` +${attackBonus} bonus` : ''}) destroyed the ${monster.name} (HP: ${monsterHp})!`
        });
      } else {
        // Monster survives, counterattacks with its attack value
        damageToPlayer = monsterAttack;
        
        // Update monster HP and layers for persistent state
        const updatedMonster = damageMonster(monster, weaponDamage);
        
        toast({
          title: 'Monster Counterattack!',
          description: `${weaponSlot.item.name} dealt ${weaponDamage} damage, but ${monster.name} (${updatedMonster.hp}/${updatedMonster.maxHp} HP) counterattacks for ${monsterAttack} damage!`,
          variant: 'destructive'
        });
        
        // Update the monster in active cards with reduced HP
        setActiveCards(prev => prev.map(c => c.id === monster.id ? updatedMonster : c));
        
        // Decrement weapon durability instead of immediately removing
        const currentDurability = weaponSlot.item.durability ?? 1;
        if (currentDurability <= 1) {
          // Weapon breaks after this use
          addToGraveyard({ ...weaponSlot.item, id: `weapon-broken-${Date.now()}` });
          clearEquipmentSlotById(weaponSlot.id);
          toast({
            title: 'Weapon Broken!',
            description: `${weaponSlot.item.name} has broken!`,
            variant: 'destructive'
          });
        } else {
          // Weapon survives with reduced durability
          const updatedWeapon = { ...weaponSlot.item, durability: currentDurability - 1 };
          setEquipmentSlotById(weaponSlot.id, updatedWeapon);
          toast({
            title: 'Weapon Damaged',
            description: `${weaponSlot.item.name} has ${currentDurability - 1}/${weaponSlot.item.maxDurability || currentDurability} uses left`
          });
        }
        
        // Apply counterattack damage after updating cards
        if (damageToPlayer > 0) {
          applyCounterattackDamage(damageToPlayer);
        }
        return; // Exit early - monster survived
      }
      
      // Monster defeated - decrement weapon durability
      const currentDurability = weaponSlot.item.durability ?? 1;
      if (currentDurability <= 1) {
        // Weapon breaks after this use
        addToGraveyard({ ...weaponSlot.item, id: `weapon-broken-${Date.now()}` });
        clearEquipmentSlotById(weaponSlot.id);
        toast({
          title: 'Weapon Broken!',
          description: `${weaponSlot.item.name} has broken after defeating ${monster.name}!`,
          variant: 'destructive'
        });
      } else {
        // Weapon survives with reduced durability
        const updatedWeapon = { ...weaponSlot.item, durability: currentDurability - 1 };
        setEquipmentSlotById(weaponSlot.id, updatedWeapon);
      }
    } else {
      // No weapon - take full monster attack damage
      damageToPlayer = monsterAttack;
    }

    // Apply shield damage reduction (shield durability is reduced)
    if (damageToPlayer > 0) {
      const shieldSlot = findShieldSlot();
      if (shieldSlot) {
        const originalDamage = damageToPlayer;
        const shieldValue = shieldSlot.item.value + defenseBonus;
        damageToPlayer = Math.max(0, damageToPlayer - shieldValue);
        toast({
          title: damageToPlayer === 0 ? 'Shield Blocked Attack!' : 'Shield Reduced Damage!',
          description: `${shieldSlot.item.name} (${shieldValue}${defenseBonus > 0 ? ` +${defenseBonus} bonus` : ''}) absorbed damage!${damageToPlayer > 0 ? ` ${originalDamage} → ${damageToPlayer}` : ''}`
        });
        
        // Decrement shield durability
        const currentDurability = shieldSlot.item.durability ?? 1;
        if (currentDurability <= 1) {
          // Shield breaks after this use
          addToGraveyard({ ...shieldSlot.item, id: `shield-broken-${Date.now()}` });
          clearEquipmentSlotById(shieldSlot.id);
          toast({
            title: 'Shield Broken!',
            description: `${shieldSlot.item.name} has broken!`,
            variant: 'destructive'
          });
        } else {
          // Shield survives with reduced durability
          const updatedShield = { ...shieldSlot.item, durability: currentDurability - 1 };
          setEquipmentSlotById(shieldSlot.id, updatedShield);
          toast({
            title: 'Shield Damaged',
            description: `${shieldSlot.item.name} has ${currentDurability - 1}/${shieldSlot.item.maxDurability || currentDurability} uses left`
          });
        }
        shieldAlreadyLogged = true;
      } else if (!weaponSlot) {
        toast({
          title: 'Damage Taken!',
          description: `Monster dealt ${damageToPlayer} damage!`,
          variant: 'destructive'
        });
      }
    }

    applyDamage(damageToPlayer);
    // Add monster to graveyard and remove (don't auto-add to graveyard again)
    addToGraveyard(monster);
    removeCard(monster.id, false);
  };

  const applyDamage = (damage: number) => {
    if (damage > 0) {
      setTakingDamage(true);
      setTimeout(() => setTakingDamage(false), 200);
      setTotalDamageTaken(prev => prev + damage);
      const newHp = Math.max(0, hp - damage);
      setHp(newHp);
      if (newHp === 0) {
        setGameOver(true);
        setVictory(false);
      }
    }
  };

  // Apply counterattack damage and optionally add shield to graveyard
  const applyCounterattackDamage = (damage: number, alreadyLoggedShield: boolean = false) => {
    let remainingDamage = damage;
    const shieldSlot = findShieldSlot();
    
    if (shieldSlot && remainingDamage > 0) {
      const shieldValue = shieldSlot.item.value + defenseBonus;
      const blocked = Math.min(shieldValue, remainingDamage);
      remainingDamage -= blocked;
      toast({
        title: 'Shield Blocks Counterattack!',
        description: `${shieldSlot.item.name} (${shieldValue}${defenseBonus > 0 ? ` +${defenseBonus} bonus` : ''}) absorbed ${blocked} damage!${remainingDamage > 0 ? ` ${damage} → ${remainingDamage}` : ''}`
      });
      
      // Decrement shield durability
      const currentDurability = shieldSlot.item.durability ?? 1;
      if (currentDurability <= 1) {
        // Shield breaks after this use
        if (!alreadyLoggedShield) {
          addToGraveyard({ ...shieldSlot.item, id: `shield-counter-broken-${Date.now()}` });
        }
        clearEquipmentSlotById(shieldSlot.id);
        toast({
          title: 'Shield Broken!',
          description: `${shieldSlot.item.name} has broken!`,
          variant: 'destructive'
        });
      } else {
        // Shield survives with reduced durability
        const updatedShield = { ...shieldSlot.item, durability: currentDurability - 1 };
        setEquipmentSlotById(shieldSlot.id, updatedShield);
        toast({
          title: 'Shield Damaged',
          description: `${shieldSlot.item.name} has ${currentDurability - 1}/${shieldSlot.item.maxDurability || currentDurability} uses left`
        });
      }
    }
    
    if (remainingDamage > 0) {
      applyDamage(remainingDamage);
    }
  };

  const handleWeaponToMonster = (weapon: any, monster: GameCardData) => {
    const weaponDamage = weapon.value + attackBonus;
    const monsterHp = monster.hp ?? monster.value;
    const monsterAttack = monster.attack ?? monster.value;
    
    // Handle weapon durability
    const currentDurability = weapon.durability ?? 1;
    const weaponBreaks = currentDurability <= 1;
    
    if (weaponDamage >= monsterHp) {
      // Weapon defeats monster
      setMonstersDefeated(prev => prev + 1);
      toast({
        title: 'Monster Defeated!',
        description: `Your ${weapon.name} (${weaponDamage}${attackBonus > 0 ? ` +${attackBonus} bonus` : ''}) destroyed the ${monster.name} (HP: ${monsterHp})!`
      });
      addToGraveyard(monster);
      removeCard(monster.id, false);
      
      // Handle weapon durability after defeating monster
      if (weapon.fromSlot) {
        if (weaponBreaks) {
          // Weapon breaks
          addToGraveyard({ ...weapon, id: `weapon-direct-broken-${Date.now()}` });
          clearEquipmentSlotById(weapon.fromSlot as EquipmentSlotId);
          toast({
            title: 'Weapon Broken!',
            description: `${weapon.name} has broken after defeating ${monster.name}!`,
            variant: 'destructive'
          });
        } else {
          // Weapon survives with reduced durability
          const updatedWeapon = { ...weapon, durability: currentDurability - 1 };
          delete updatedWeapon.fromSlot; // Remove the fromSlot property before setting
          setEquipmentSlotById(weapon.fromSlot as EquipmentSlotId, updatedWeapon);
          toast({
            title: 'Weapon Damaged',
            description: `${weapon.name} has ${currentDurability - 1}/${weapon.maxDurability || currentDurability} uses left`
          });
        }
      }
    } else {
      // Monster survives - update its HP and layers
      const updatedMonster = damageMonster(monster, weaponDamage);
      
      toast({
        title: 'Monster Survives!',
        description: `${weapon.name} (${weaponDamage}${attackBonus > 0 ? ` +${attackBonus} bonus` : ''}) dealt ${weaponDamage} damage! ${monster.name} (${updatedMonster.hp}/${updatedMonster.maxHp} HP) counterattacks for ${monsterAttack} damage!`,
        variant: 'destructive'
      });
      
      // Update the monster in active cards with reduced HP
      setActiveCards(prev => prev.map(c => c.id === monster.id ? updatedMonster : c));
      
      // Handle weapon durability after failing to defeat monster
      if (weapon.fromSlot) {
        if (weaponBreaks) {
          // Weapon breaks
          addToGraveyard({ ...weapon, id: `weapon-direct-broken-${Date.now()}` });
          clearEquipmentSlotById(weapon.fromSlot as EquipmentSlotId);
          toast({
            title: 'Weapon Broken!',
            description: `${weapon.name} has broken!`,
            variant: 'destructive'
          });
        } else {
          // Weapon survives with reduced durability
          const updatedWeapon = { ...weapon, durability: currentDurability - 1 };
          delete updatedWeapon.fromSlot; // Remove the fromSlot property before setting
          setEquipmentSlotById(weapon.fromSlot as EquipmentSlotId, updatedWeapon);
          toast({
            title: 'Weapon Damaged',
            description: `${weapon.name} has ${currentDurability - 1}/${weapon.maxDurability || currentDurability} uses left`
          });
        }
      }
      
      // Apply counterattack damage using monster's attack value
      applyCounterattackDamage(monsterAttack);
      // Monster stays in dungeon - player must deal with it again
      // Do NOT remove the card or add to graveyard - monster survives!
    }
  };

  const handleCardToHero = (card: GameCardData) => {
    if (card.type === 'monster') {
      resolveMonsterEncounter(card);
    } else if (card.type === 'potion') {
      const newHp = Math.min(maxHp, hp + card.value);
      const healAmount = newHp - hp;
      setHealing(true);
      setTimeout(() => setHealing(false), 500);
      setTotalHealed(prev => prev + healAmount);
      setHp(newHp);
      toast({ title: 'Healed!', description: `+${healAmount} HP` });
      removeCard(card.id);
    } else if (card.type === 'coin') {
      setGold(prev => prev + card.value);
      toast({ title: 'Gold Collected!', description: `+${card.value} Gold` });
      removeCard(card.id);
    } else if (card.type === 'skill') {
      handleSkillCard(card);
    } else if (card.type === 'event') {
      setCurrentEventCard(card);
      setEventModalOpen(true);
      removeCard(card.id, false); // Don't add to graveyard yet
    }
  };

  const handleCardToSlot = (card: GameCardData, slotId: string) => {
    if (slotId === 'slot-amulet' && card.type === 'amulet') {
      setAmuletSlot({ 
        name: card.name, 
        value: card.value, 
        image: card.image, 
        type: 'amulet', 
        effect: card.effect! 
      });
      toast({ 
        title: 'Amulet Equipped!',
        description: `${card.name} provides passive bonuses`
      });
      removeCard(card.id, false); 
    } else if (slotId === 'slot-backpack' && (card.type === 'potion' || card.type === 'weapon' || card.type === 'shield')) {
      if (backpackItems.length >= 10) {
        toast({ title: 'Backpack Full!', description: 'Maximum 10 items', variant: 'destructive' });
        return;
      }
      // Preserve durability for weapons/shields in backpack
      const backpackItem: any = { 
        name: card.name, 
        value: card.value, 
        image: card.image, 
        type: card.type 
      };
      if (card.type === 'weapon' || card.type === 'shield') {
        backpackItem.durability = card.durability;
        backpackItem.maxDurability = card.maxDurability;
      }
      setBackpackItems(prev => [...prev, backpackItem]);
      toast({ title: 'Item Stored!', description: `${backpackItems.length + 1}/10 items in backpack` });
      removeCard(card.id, false); 
    } else if (slotId.startsWith('slot-equipment')) {
      const equipSlot: EquipmentSlotId = slotId === 'slot-equipment-1' ? 'equipmentSlot1' : 'equipmentSlot2';
      const equippedItem = equipSlot === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
      
      // Handle monster dropped on equipment slot
      if (card.type === 'monster') {
        if (!equippedItem) {
          toast({
            title: 'No Equipment!',
            description: 'Equip a weapon or shield first',
            variant: 'destructive'
          });
          return;
        }
        
        if (equippedItem.type === 'shield') {
          // Shield blocks damage - uses monster's attack value
          const monsterAttack = card.attack ?? card.value;
          const shieldValue = equippedItem.value + defenseBonus;
          const damageToPlayer = Math.max(0, monsterAttack - shieldValue);
          
          toast({
            title: damageToPlayer === 0 ? 'Shield Blocked!' : 'Shield Reduced Damage!',
            description: `${equippedItem.name} (${shieldValue}${defenseBonus > 0 ? ` +${defenseBonus} bonus` : ''}) absorbed damage from ${card.name}'s ${monsterAttack} attack!${damageToPlayer > 0 ? ` ${monsterAttack} → ${damageToPlayer}` : ''}`
          });
          
          // Decrement shield durability
          const currentDurability = equippedItem.durability ?? 1;
          if (currentDurability <= 1) {
            // Shield breaks after this use
            addToGraveyard({ ...equippedItem, id: `shield-direct-broken-${Date.now()}` });
            clearEquipmentSlotById(equipSlot);
            toast({
              title: 'Shield Broken!',
              description: `${equippedItem.name} has broken!`,
              variant: 'destructive'
            });
          } else {
            // Shield survives with reduced durability
            const updatedShield = { ...equippedItem, durability: currentDurability - 1 };
            setEquipmentSlotById(equipSlot, updatedShield);
            toast({
              title: 'Shield Damaged',
              description: `${equippedItem.name} has ${currentDurability - 1}/${equippedItem.maxDurability || currentDurability} uses left`
            });
          }
          
          // Add monster to graveyard
          addToGraveyard(card);
          
          // Apply remaining damage if any
          if (damageToPlayer > 0) {
            applyDamage(damageToPlayer);
          }
          
          // Remove monster (already added to graveyard above)
          removeCard(card.id, false);
        } else if (equippedItem.type === 'weapon') {
          // Weapon attacks monster - pass weapon with durability
          handleWeaponToMonster({ ...equippedItem, fromSlot: equipSlot }, card);
        }
      } else if (card.type === 'weapon' || card.type === 'shield') {
        // Equip weapon or shield (don't add to graveyard yet - only when consumed)
        // Preserve durability from the card
        setEquipmentSlotById(equipSlot, { 
          name: card.name, 
          value: card.value, 
          image: card.image, 
          type: card.type,
          durability: card.durability,
          maxDurability: card.maxDurability
        });
        toast({ 
          title: `${card.type === 'weapon' ? 'Weapon' : 'Shield'} Equipped!`,
          description: card.durability ? `${card.durability}/${card.maxDurability} uses` : undefined
        });
        removeCard(card.id, false);
      }
    }
  };

  const handleSellCard = (item: any) => {
    const itemType = item.type;
    
    // Only allow selling potions, coins, weapons, and shields (NOT monsters)
    if (!SELLABLE_TYPES.includes(itemType)) {
      toast({
        title: 'Cannot Sell!',
        description: `You cannot sell ${itemType}s!`,
        variant: 'destructive'
      });
      return;
    }
    
    const sellValue = item.value;
    setGold(prev => prev + sellValue);
    toast({
      title: 'Sold!',
      description: `+${sellValue} Gold from ${item.name}`,
    });

    // Add to graveyard
    const cardToGraveyard: GameCardData = {
      id: item.id || `sold-${Date.now()}`,
      type: item.type,
      name: item.name,
      value: item.value,
      image: item.image
    };
    addToGraveyard(cardToGraveyard);

    // If item came from equipment slot, clear it
    if (item.fromSlot) {
      clearEquipmentSlotById(item.fromSlot as EquipmentSlotId);
    } else {
      // Item from dungeon - use removeCard to properly trigger waterfall (don't add to graveyard again)
      removeCard(item.id, false);
      setCardsPlayed(prev => prev + 1);
    }
  };

  const handleSkillCard = (card: GameCardData) => {
    if (card.skillType === 'instant') {
      // Execute instant skill effect
      switch (card.name) {
        case 'Healing Wave':
          const healAmount = 5;
          const newHp = Math.min(maxHp, hp + healAmount);
          const actualHeal = newHp - hp;
          setHealing(true);
          setTimeout(() => setHealing(false), 500);
          setTotalHealed(prev => prev + actualHeal);
          setHp(newHp);
          toast({ title: 'Healing Wave!', description: `+${actualHeal} HP from skill` });
          break;
        case 'Lightning Strike':
          // Find a random monster to damage
          const monsters = activeCards.filter(c => c.type === 'monster');
          if (monsters.length > 0) {
            const target = monsters[Math.floor(Math.random() * monsters.length)];
            const damage = 4;
            const targetHp = target.hp ?? target.value;
            
            if (damage >= targetHp) {
              toast({ title: 'Lightning Strike!', description: `Destroyed ${target.name}!` });
              setMonstersDefeated(prev => prev + 1);
              addToGraveyard(target);
              removeCard(target.id, false);
            } else {
              // Monster survives with reduced HP
              const updatedMonster = damageMonster(target, damage);
              toast({ 
                title: 'Lightning Strike!', 
                description: `Dealt ${damage} damage to ${target.name} (${updatedMonster.hp}/${updatedMonster.maxHp} HP remaining)!` 
              });
              // Update the monster in active cards
              setActiveCards(prev => prev.map(c => c.id === target.id ? updatedMonster : c));
            }
          } else {
            toast({ title: 'No Target', description: 'No monsters to strike', variant: 'destructive' });
          }
          break;
        case 'Shield Bash':
          setTempShield(prev => prev + 3);
          toast({ title: 'Shield Bash!', description: 'Next 3 damage blocked!' });
          break;
        case 'Gold Rush':
          setGold(prev => prev + 8);
          toast({ title: 'Gold Rush!', description: '+8 Gold!' });
          break;
      }
      addToGraveyard(card);
      removeCard(card.id, false);
    } else if (card.skillType === 'permanent') {
      // Add permanent skill effect
      setPermanentSkills(prev => [...prev, card.skillEffect || card.name]);
      toast({ 
        title: 'Permanent Skill Acquired!', 
        description: `${card.name}: ${card.skillEffect}`
      });
      addToGraveyard(card);
      removeCard(card.id, false);
    }
  };

  const handleEventChoice = (choiceIndex: number) => {
    if (!currentEventCard || !currentEventCard.eventChoices) return;
    
    const choice = currentEventCard.eventChoices[choiceIndex];
    const effects = choice.effect.split(',');
    
    for (const effect of effects) {
      if (effect === 'none') continue;
      
      if (effect.startsWith('hp-')) {
        const damage = parseInt(effect.replace('hp-', ''));
        applyDamage(damage);
        toast({ title: 'Damage Taken', description: `-${damage} HP`, variant: 'destructive' });
      } else if (effect.startsWith('heal+')) {
        const healAmount = parseInt(effect.replace('heal+', ''));
        const newHp = Math.min(maxHp, hp + healAmount);
        const actualHeal = newHp - hp;
        setHealing(true);
        setTimeout(() => setHealing(false), 500);
        setTotalHealed(prev => prev + actualHeal);
        setHp(newHp);
        toast({ title: 'Healed!', description: `+${actualHeal} HP` });
      } else if (effect === 'fullheal') {
        const healAmount = maxHp - hp;
        setHealing(true);
        setTimeout(() => setHealing(false), 500);
        setTotalHealed(prev => prev + healAmount);
        setHp(maxHp);
        toast({ title: 'Full Heal!', description: `Restored to ${maxHp} HP` });
      } else if (effect.startsWith('gold-')) {
        const goldLost = parseInt(effect.replace('gold-', ''));
        if (gold >= goldLost) {
          setGold(prev => prev - goldLost);
          toast({ title: 'Gold Spent', description: `-${goldLost} Gold` });
        } else {
          toast({ title: 'Not Enough Gold!', variant: 'destructive' });
          setEventModalOpen(false);
          return;
        }
      } else if (effect.startsWith('gold+')) {
        const goldGain = parseInt(effect.replace('gold+', ''));
        setGold(prev => prev + goldGain);
        toast({ title: 'Gold Gained!', description: `+${goldGain} Gold` });
      } else if (effect.startsWith('maxhp+')) {
        const hpGain = parseInt(effect.replace('maxhp+', ''));
        // This would need a permanent max HP modifier
        toast({ title: 'Max HP Increased!', description: `+${hpGain} Max HP` });
      } else if (effect === 'weapon') {
        // Create a random weapon
        const weaponValue = Math.floor(Math.random() * 3) + 3; // 3-5 value
        toast({ title: 'Weapon Received!', description: `Got a weapon (${weaponValue} damage)` });
        // Would need to add weapon to inventory
      } else if (effect === 'permanentskill') {
        const randomSkill = ['Iron Skin', 'Weapon Master'][Math.floor(Math.random() * 2)];
        setPermanentSkills(prev => [...prev, randomSkill]);
        toast({ title: 'Skill Learned!', description: randomSkill });
      }
    }
    
    addToGraveyard(currentEventCard);
    setEventModalOpen(false);
    setCurrentEventCard(null);
  };

  const handleBackpackClick = () => {
    if (backpackItems.length === 0) return;
    
    const item = backpackItems[0]; // Use top item
    
    if (item.type === 'potion') {
      const newHp = Math.min(maxHp, hp + item.value);
      const healAmount = newHp - hp;
      setHealing(true);
      setTimeout(() => setHealing(false), 500);
      setTotalHealed(prev => prev + healAmount);
      setHp(newHp);
      toast({ title: 'Potion Used!', description: `+${healAmount} HP from backpack` });
      setBackpackItems(prev => prev.slice(1)); // Remove top item
    } else if (item.type === 'shield') {
      const emptySlot = !equipmentSlot1 ? 'equipmentSlot1' : !equipmentSlot2 ? 'equipmentSlot2' : null;
      if (emptySlot) {
        setEquipmentSlotById(emptySlot, { 
          name: item.name, 
          value: item.value, 
          image: item.image, 
          type: 'shield',
          durability: item.durability,
          maxDurability: item.maxDurability
        });
        toast({ 
          title: 'Shield Equipped!', 
          description: `${item.name} equipped from backpack${item.durability ? ` (${item.durability}/${item.maxDurability} uses)` : ''}` 
        });
        setBackpackItems(prev => prev.slice(1)); // Remove top item
      } else {
        toast({ title: 'Equipment Full!', description: 'Clear a slot first', variant: 'destructive' });
      }
    } else if (item.type === 'weapon') {
      const emptySlot = !equipmentSlot1 ? 'equipmentSlot1' : !equipmentSlot2 ? 'equipmentSlot2' : null;
      if (emptySlot) {
        setEquipmentSlotById(emptySlot, { 
          name: item.name, 
          value: item.value, 
          image: item.image, 
          type: 'weapon',
          durability: item.durability,
          maxDurability: item.maxDurability
        });
        toast({ 
          title: 'Weapon Equipped!', 
          description: `${item.name} equipped from backpack${item.durability ? ` (${item.durability}/${item.maxDurability} uses)` : ''}` 
        });
        setBackpackItems(prev => prev.slice(1)); // Remove top item
      } else {
        toast({ title: 'Equipment Full!', description: 'Clear a slot first', variant: 'destructive' });
      }
    } else if (item.type === 'skill' && item.name === 'Reshuffle') {
      // Reshuffle skill - costs 5 HP
      if (hp > 5) {
        applyDamage(5);
        toast({ title: 'Reshuffle!', description: 'Paid 5 HP to reshuffle the deck' });
        
        // Reshuffle the remaining deck
        setRemainingDeck(prev => [...prev].sort(() => Math.random() - 0.5));
        
        // Don't remove from backpack - Reshuffle can be used multiple times
      } else {
        toast({ title: 'Not Enough HP!', description: 'Need more than 5 HP to reshuffle', variant: 'destructive' });
      }
    }
  };

  const getRemainingCards = () => {
    return remainingDeck.length + previewCards.length + activeCards.length;
  };

  // Hand system handlers
  const handleDropToHand = (card: GameCardData) => {
    if (handCards.length >= 5) {
      toast({
        title: 'Hand Full!',
        description: 'Maximum 5 cards in hand',
        variant: 'destructive'
      });
      return;
    }
    
    // Add card to hand and use removeCard to properly trigger waterfall
    setHandCards(prev => [...prev, card]);
    removeCard(card.id, false); // Don't add to graveyard when saving to hand
    setCardsPlayed(prev => prev + 1); // Count it as played
    toast({
      title: 'Card Saved!',
      description: `${card.name} added to hand (${handCards.length + 1}/5)`
    });
  };

  const handleDragCardFromHand = (card: GameCardData) => {
    setDraggedCard(card);
    // Remove the card from hand when it's dragged out
    setHandCards(prev => prev.filter(c => c.id !== card.id));
  };

  const handleDragEndFromHand = () => {
    setDraggedCard(null);
  };

  return (
    <div className="h-screen bg-background flex flex-col relative overflow-hidden">
      <GameHeader 
        hp={hp} 
        maxHp={maxHp} 
        gold={gold} 
        cardsRemaining={getRemainingCards()}
        monstersDefeated={monstersDefeated}
        onDeckClick={() => setDeckViewerOpen(true)}
      />
      
      {/* Graveyard in top right corner - bigger size */}
      <div className="absolute top-16 right-4 z-10" style={{ transform: 'scale(1.2)' }}>
        <GraveyardZone
          onDrop={handleSellCard}
          isDropTarget={
            (draggedCard !== null && (SELLABLE_TYPES as readonly string[]).includes(draggedCard.type)) ||
            (draggedEquipment !== null && (SELLABLE_TYPES as readonly string[]).includes(draggedEquipment.type))
          }
          discardedCards={discardedCards}
        />
      </div>

      {/* Main game area - adjust padding for hand area at bottom */}
      <div className="flex-1 flex flex-col items-center justify-center" style={{ padding: '2vh 2vw', paddingBottom: 'calc(clamp(180px, 25vh, 320px) + 2vh)' }}>
        {/* 3×5 Card Grid */}
        <div className="grid grid-cols-5 w-full" style={{ 
          maxWidth: '95vw',
          gap: 'min(2vw, 20px)',
          gridTemplateRows: 'repeat(3, auto)'
        }}>
          {/* Row 1: Preview Row - 5 cards (non-interactive, 60% opacity) */}
          {previewCards.concat(Array(5 - previewCards.length).fill(null)).slice(0, 5).map((card, index) => (
            card ? (
              <div 
                key={card.id}
                className="opacity-60 pointer-events-none"
                style={{ 
                  width: 'clamp(100px, 15vw, 200px)', 
                  height: 'clamp(140px, 21vw, 280px)' 
                }}
                data-testid={`preview-card-${index}`}
              >
                <GameCard
                  card={card}
                  onDragStart={() => {}} // Disabled
                  onDragEnd={() => {}} // Disabled
                />
              </div>
            ) : (
              <div 
                key={`preview-empty-${index}`} 
                style={{ 
                  width: 'clamp(100px, 15vw, 200px)', 
                  height: 'clamp(140px, 21vw, 280px)' 
                }} 
              />
            )
          ))}

          {/* Row 2: Active Row - 5 cards (fully interactive) */}
          {activeCards.concat(Array(5 - activeCards.length).fill(null)).slice(0, 5).map((card, index) => (
            card ? (
              <GameCard
                key={card.id}
                card={card}
                onDragStart={setDraggedCard}
                onDragEnd={() => setDraggedCard(null)}
                onWeaponDrop={(weapon) => handleWeaponToMonster(weapon, card)}
                isWeaponDropTarget={draggedEquipment?.type === 'weapon' && card.type === 'monster'}
                className={removingCards.has(card.id) ? 'animate-card-remove' : ''}
              />
            ) : (
              <div key={`empty-${index}`} style={{ 
                width: 'clamp(100px, 15vw, 200px)', 
                height: 'clamp(140px, 21vw, 280px)' 
              }} />
            )
          ))}

          {/* Row 3: Hero Row - 5 slots (Amulet, Equipment×2, Hero, Backpack) */}
          <AmuletSlot
            amulet={amuletSlot}
            onDrop={(card) => handleCardToSlot(card, 'slot-amulet')}
            isDropTarget={draggedCard?.type === 'amulet'}
          />
          <EquipmentSlot 
            type="equipment" 
            slotId="slot-equipment-1"
            item={equipmentSlot1}
            onDrop={(card) => handleCardToSlot(card, 'slot-equipment-1')}
            onDragStart={(equipment) => {
              setDraggedEquipment(equipment);
              setDraggedCard(null);
            }}
            onDragEnd={() => setDraggedEquipment(null)}
            isDropTarget={draggedCard?.type === 'weapon' || draggedCard?.type === 'shield'}
          />
          <HeroCard 
            hp={hp}
            maxHp={maxHp}
            onDrop={handleCardToHero}
            isDropTarget={draggedCard?.type === 'monster' || draggedCard?.type === 'potion' || draggedCard?.type === 'coin'}
            equippedWeapon={findWeaponSlot()?.item || null}
            equippedShield={findShieldSlot()?.item || null}
            image={heroImage}
            takingDamage={takingDamage}
            healing={healing}
          />
          <EquipmentSlot 
            type="equipment"
            slotId="slot-equipment-2"
            item={equipmentSlot2}
            onDrop={(card) => handleCardToSlot(card, 'slot-equipment-2')}
            onDragStart={(equipment) => {
              setDraggedEquipment(equipment);
              setDraggedCard(null);
            }}
            onDragEnd={() => setDraggedEquipment(null)}
            isDropTarget={draggedCard?.type === 'weapon' || draggedCard?.type === 'shield'}
          />
          <EquipmentSlot 
            type="backpack" 
            slotId="slot-backpack"
            item={backpackItems[0] || null}
            backpackCount={backpackItems.length}
            onDrop={(card) => handleCardToSlot(card, 'slot-backpack')}
            isDropTarget={backpackItems.length < 10 && (draggedCard?.type === 'potion' || draggedCard?.type === 'weapon' || draggedCard?.type === 'shield')}
            onClick={handleBackpackClick}
          />
        </div>

        <div className="flex gap-2 items-center justify-center">
          <Button onClick={initGame} variant="outline" data-testid="button-new-game">
            New Game
          </Button>
          <HelpDialog />
        </div>
      </div>

      <VictoryDefeatModal
        open={gameOver}
        isVictory={victory}
        gold={gold}
        hpRemaining={hp}
        onRestart={initGame}
        monstersDefeated={monstersDefeated}
        damageTaken={totalDamageTaken}
        totalHealed={totalHealed}
      />
      
      <DeckViewerModal
        open={deckViewerOpen}
        onOpenChange={setDeckViewerOpen}
        remainingCards={[...previewCards, ...activeCards, ...remainingDeck]}
      />

      {/* Hand Area - fixed at bottom */}
      <HandArea
        handCards={handCards}
        onDropToHand={handleDropToHand}
        onDragCardFromHand={handleDragCardFromHand}
        onDragEndFromHand={handleDragEndFromHand}
        isDropTarget={draggedCard !== null && handCards.length < 5}
        maxHandSize={5}
      />

      {/* Event Choice Modal */}
      <EventChoiceModal
        open={eventModalOpen}
        eventCard={currentEventCard}
        onChoice={handleEventChoice}
      />
    </div>
  );
}
