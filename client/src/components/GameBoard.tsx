import { useState, useEffect } from 'react';
import GameHeader from './GameHeader';
import HeroCard from './HeroCard';
import GameCard, { type GameCardData } from './GameCard';
import EquipmentSlot, { type SlotType } from './EquipmentSlot';
import SellZone, { SELLABLE_TYPES } from './SellZone';
import VictoryDefeatModal from './VictoryDefeatModal';
import HelpDialog from './HelpDialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

import dragonImage from '@assets/generated_images/dragon_monster_card_art.png';
import skeletonImage from '@assets/generated_images/skeleton_warrior_card_art.png';
import swordImage from '@assets/generated_images/magical_sword_weapon_card.png';
import shieldImage from '@assets/generated_images/medieval_shield_card_art.png';
import potionImage from '@assets/generated_images/healing_potion_card_art.png';
import heroImage from '@assets/generated_images/hero_character_portrait.png';

const INITIAL_HP = 20;
const DECK_SIZE = 54;

function createDeck(): GameCardData[] {
  const deck: GameCardData[] = [];
  let id = 0;

  // Monster variety with balanced values (2-7 range)
  const monsterTypes = [
    { name: 'Dragon', image: dragonImage, minValue: 5, maxValue: 7 },
    { name: 'Skeleton', image: skeletonImage, minValue: 2, maxValue: 4 },
    { name: 'Goblin', image: skeletonImage, minValue: 2, maxValue: 3 },
    { name: 'Ogre', image: dragonImage, minValue: 4, maxValue: 6 },
  ];

  // 12 monsters total: 3 of each type
  for (let i = 0; i < 12; i++) {
    const monsterType = monsterTypes[i % monsterTypes.length];
    deck.push({
      id: `monster-${id++}`,
      type: 'monster',
      name: monsterType.name,
      value: Math.floor(Math.random() * (monsterType.maxValue - monsterType.minValue + 1)) + monsterType.minValue,
      image: monsterType.image,
    });
  }

  // Weapon variety with improved values (2-6 range)
  const weaponTypes = [
    'Sword', 'Axe', 'Dagger', 'Mace', 'Spear'
  ];
  
  for (let i = 0; i < 10; i++) {
    const weaponName = weaponTypes[i % weaponTypes.length];
    // Balanced weapon values: 2-6
    const value = Math.floor(Math.random() * 5) + 2;
    deck.push({
      id: `weapon-${id++}`,
      type: 'weapon',
      name: weaponName,
      value: value,
      image: swordImage,
    });
  }

  // Shield variety (2-4 range for balance)
  const shieldTypes = [
    'Iron Shield', 'Wooden Shield', 'Steel Shield', 'Buckler'
  ];
  
  for (let i = 0; i < 10; i++) {
    const shieldName = shieldTypes[i % shieldTypes.length];
    deck.push({
      id: `shield-${id++}`,
      type: 'shield',
      name: shieldName,
      value: Math.floor(Math.random() * 3) + 2,
      image: shieldImage,
    });
  }

  // Potions (2-5 range)
  const potionTypes = [
    'Health Potion', 'Healing Elixir', 'Restorative Brew'
  ];
  
  for (let i = 0; i < 8; i++) {
    const potionName = potionTypes[i % potionTypes.length];
    deck.push({
      id: `potion-${id++}`,
      type: 'potion',
      name: potionName,
      value: Math.floor(Math.random() * 4) + 2,
      image: potionImage,
    });
  }

  // Gold coins (1-4 range, more valuable)
  for (let i = 0; i < 14; i++) {
    deck.push({
      id: `coin-${id++}`,
      type: 'coin',
      name: 'Gold',
      value: Math.floor(Math.random() * 4) + 1,
    });
  }

  return deck.sort(() => Math.random() - 0.5);
}

export default function GameBoard() {
  const { toast } = useToast();
  const [hp, setHp] = useState(INITIAL_HP);
  const [gold, setGold] = useState(0);
  const [activeCards, setActiveCards] = useState<GameCardData[]>([]);
  const [remainingDeck, setRemainingDeck] = useState<GameCardData[]>([]);
  const [weaponSlot, setWeaponSlot] = useState<{ name: string; value: number; image?: string } | null>(null);
  const [shieldSlot, setShieldSlot] = useState<{ name: string; value: number; image?: string } | null>(null);
  const [backpackSlot, setBackpackSlot] = useState<{ name: string; value: number; image?: string } | null>(null);
  const [cardsPlayed, setCardsPlayed] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [victory, setVictory] = useState(false);
  const [draggedCard, setDraggedCard] = useState<GameCardData | null>(null);
  const [drawPending, setDrawPending] = useState(false);
  const [removingCards, setRemovingCards] = useState<Set<string>>(new Set());
  const [takingDamage, setTakingDamage] = useState(false);
  const [healing, setHealing] = useState(false);
  
  // Game statistics
  const [monstersDefeated, setMonstersDefeated] = useState(0);
  const [totalDamageTaken, setTotalDamageTaken] = useState(0);
  const [totalHealed, setTotalHealed] = useState(0);

  useEffect(() => {
    initGame();
  }, []);

  const initGame = () => {
    const newDeck = createDeck();
    setRemainingDeck(newDeck.slice(4));
    setActiveCards(newDeck.slice(0, 4));
    setHp(INITIAL_HP);
    setGold(0);
    setWeaponSlot(null);
    setShieldSlot(null);
    setBackpackSlot(null);
    setCardsPlayed(0);
    setGameOver(false);
    setVictory(false);
    setDrawPending(false);
    setMonstersDefeated(0);
    setTotalDamageTaken(0);
    setTotalHealed(0);
  };

  useEffect(() => {
    if (!drawPending) return;
    
    const timer = setTimeout(() => {
      setRemainingDeck(prevRemaining => {
        setActiveCards(prevActive => {
          const unplayedCard = prevActive.length === 1 ? prevActive[0] : null;
          const cardsToDraw = Math.min(3, prevRemaining.length);
          
          if (cardsToDraw === 0 && !unplayedCard) {
            setVictory(true);
            setGameOver(true);
            return prevActive;
          }

          const newCards = prevRemaining.slice(0, cardsToDraw);
          setCardsPlayed(0);
          setDrawPending(false);
          
          return unplayedCard ? [unplayedCard, ...newCards] : newCards;
        });
        
        return prevRemaining.slice(Math.min(3, prevRemaining.length));
      });
    }, 500);
    
    return () => clearTimeout(timer);
  }, [drawPending]);

  const removeCard = (cardId: string) => {
    // Add card to removing set for animation
    setRemovingCards(prev => new Set(prev).add(cardId));
    
    // Delay actual removal for animation
    setTimeout(() => {
      setActiveCards(prev => {
        const updated = prev.filter(c => c.id !== cardId);
        
        setCardsPlayed(count => {
          const newCount = count + 1;
          
          if (newCount >= 3 || updated.length === 0) {
            if (updated.length === 0) {
              setRemainingDeck(remaining => {
                if (remaining.length === 0) {
                  setVictory(true);
                  setGameOver(true);
                } else {
                  setDrawPending(true);
                }
                return remaining;
              });
            } else {
              setDrawPending(true);
            }
          }
          
          return newCount;
        });
        
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

  const handleCardToHero = (card: GameCardData) => {
    if (card.type === 'monster') {
      const monsterValue = card.value;
      let damageToPlayer = 0;
      
      if (weaponSlot) {
        // Player attacks with weapon
        if (weaponSlot.value >= monsterValue) {
          // Monster defeated, player takes no damage
          setMonstersDefeated(prev => prev + 1);
          toast({
            title: 'Monster Defeated!',
            description: `Your ${weaponSlot.name} (${weaponSlot.value}) destroyed the monster (${monsterValue})!`,
          });
          damageToPlayer = 0;
        } else {
          // Monster survives and counterattacks
          damageToPlayer = monsterValue - weaponSlot.value;
          toast({
            title: 'Monster Counterattack!',
            description: `Your ${weaponSlot.name} (${weaponSlot.value}) dealt damage, but the monster (${monsterValue}) fights back!`,
            variant: 'destructive',
          });
        }
        // Weapon is consumed after use
        setWeaponSlot(null);
      } else {
        // No weapon equipped - player takes full monster damage
        damageToPlayer = monsterValue;
      }

      // Apply shield damage reduction
      if (shieldSlot && damageToPlayer > 0) {
        const originalDamage = damageToPlayer;
        damageToPlayer = Math.max(0, damageToPlayer - shieldSlot.value);
        
        if (damageToPlayer === 0) {
          toast({
            title: 'Shield Blocked Attack!',
            description: `Your ${shieldSlot.name} (${shieldSlot.value}) blocked ${originalDamage} damage!`,
          });
        } else {
          toast({
            title: 'Shield Reduced Damage!',
            description: `Your ${shieldSlot.name} (${shieldSlot.value}) reduced damage from ${originalDamage} to ${damageToPlayer}!`,
          });
        }
      } else if (damageToPlayer > 0 && !weaponSlot) {
        toast({
          title: 'Damage Taken!',
          description: `Monster dealt ${damageToPlayer} damage!`,
          variant: 'destructive',
        });
      }

      // Apply damage to player
      const newHp = Math.max(0, hp - damageToPlayer);
      
      if (damageToPlayer > 0) {
        setTakingDamage(true);
        setTimeout(() => setTakingDamage(false), 200);
        setTotalDamageTaken(prev => prev + damageToPlayer);
      }
      
      setHp(newHp);

      removeCard(card.id);

      if (newHp === 0) {
        setGameOver(true);
        setVictory(false);
      }
    } else if (card.type === 'potion') {
      const newHp = Math.min(INITIAL_HP, hp + card.value);
      const healAmount = newHp - hp;
      
      setHealing(true);
      setTimeout(() => setHealing(false), 500);
      setTotalHealed(prev => prev + healAmount);
      
      setHp(newHp);
      toast({
        title: 'Healed!',
        description: `+${healAmount} HP`,
      });
      removeCard(card.id);
    } else if (card.type === 'coin') {
      setGold(prev => prev + card.value);
      toast({
        title: 'Gold Collected!',
        description: `+${card.value} Gold`,
      });
      removeCard(card.id);
    }
  };

  const handleCardToSlot = (card: GameCardData, slotType: SlotType) => {
    if (slotType === 'weapon' && card.type === 'weapon') {
      setWeaponSlot({ name: card.name, value: card.value, image: card.image });
      toast({ title: 'Weapon Equipped!' });
      removeCard(card.id);
    } else if (slotType === 'shield' && card.type === 'shield') {
      setShieldSlot({ name: card.name, value: card.value, image: card.image });
      toast({ title: 'Shield Equipped!' });
      removeCard(card.id);
    } else if (slotType === 'backpack' && (card.type === 'potion' || card.type === 'weapon' || card.type === 'shield')) {
      setBackpackSlot({ name: card.name, value: card.value, image: card.image });
      toast({ title: 'Item Stored!' });
      removeCard(card.id);
    }
  };

  const handleSellCard = (card: GameCardData) => {
    if (!SELLABLE_TYPES.includes(card.type)) {
      toast({
        title: 'Cannot Sell!',
        description: `You cannot sell ${card.type}s`,
        variant: 'destructive',
      });
      return;
    }
    
    const sellValue = card.value;
    setGold(prev => prev + sellValue);
    toast({
      title: 'Item Sold!',
      description: `+${sellValue} Gold`,
    });
    removeCard(card.id);
  };

  const handleBackpackClick = () => {
    if (!backpackSlot) return;
    
    const item = backpackSlot;
    
    // Handle different item types from backpack
    if (item.name.includes('Potion') || item.name.includes('Elixir') || item.name.includes('Brew')) {
      // Use potion
      const newHp = Math.min(INITIAL_HP, hp + item.value);
      const healAmount = newHp - hp;
      setHealing(true);
      setTimeout(() => setHealing(false), 500);
      setTotalHealed(prev => prev + healAmount);
      setHp(newHp);
      toast({
        title: 'Potion Used!',
        description: `+${healAmount} HP from backpack`,
      });
      setBackpackSlot(null);
    } else if (item.name.includes('Shield')) {
      // Equip shield from backpack
      if (shieldSlot) {
        toast({
          title: 'Cannot Equip!',
          description: 'Shield slot is already occupied',
          variant: 'destructive',
        });
      } else {
        setShieldSlot(item);
        setBackpackSlot(null);
        toast({
          title: 'Shield Equipped!',
          description: `Equipped ${item.name} from backpack`,
        });
      }
    } else if (item.name.includes('Sword') || item.name.includes('Axe') || item.name.includes('Dagger') || 
               item.name.includes('Mace') || item.name.includes('Spear')) {
      // Equip weapon from backpack
      if (weaponSlot) {
        toast({
          title: 'Cannot Equip!',
          description: 'Weapon slot is already occupied',
          variant: 'destructive',
        });
      } else {
        setWeaponSlot(item);
        setBackpackSlot(null);
        toast({
          title: 'Weapon Equipped!',
          description: `Equipped ${item.name} from backpack`,
        });
      }
    }
  };

  const getRemainingCards = () => {
    return remainingDeck.length + activeCards.length;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <GameHeader 
        hp={hp} 
        maxHp={INITIAL_HP} 
        gold={gold} 
        cardsRemaining={getRemainingCards()}
        monstersDefeated={monstersDefeated}
      />

      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-4 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-4 gap-4 w-full max-w-4xl">
          {/* Dungeon Row - Top */}
          {activeCards.concat(Array(4 - activeCards.length).fill(null)).slice(0, 4).map((card, index) => (
            card ? (
              <GameCard
                key={card.id}
                card={card}
                onDragStart={setDraggedCard}
                onDragEnd={() => setDraggedCard(null)}
                className={removingCards.has(card.id) ? 'animate-card-remove' : ''}
              />
            ) : (
              <div key={`empty-${index}`} className="w-32 h-44 md:w-40 md:h-56" />
            )
          ))}

          {/* Hero Row - Bottom */}
          <EquipmentSlot 
            type="weapon" 
            item={weaponSlot}
            onDrop={(card) => handleCardToSlot(card, 'weapon')}
            isDropTarget={draggedCard?.type === 'weapon'}
          />
          <HeroCard 
            hp={hp}
            maxHp={INITIAL_HP}
            onDrop={handleCardToHero}
            isDropTarget={draggedCard?.type === 'monster' || draggedCard?.type === 'potion' || draggedCard?.type === 'coin'}
            equippedWeapon={weaponSlot}
            equippedShield={shieldSlot}
            image={heroImage}
            takingDamage={takingDamage}
            healing={healing}
          />
          <EquipmentSlot 
            type="shield" 
            item={shieldSlot}
            onDrop={(card) => handleCardToSlot(card, 'shield')}
            isDropTarget={draggedCard?.type === 'shield'}
          />
          <EquipmentSlot 
            type="backpack" 
            item={backpackSlot}
            onDrop={(card) => handleCardToSlot(card, 'backpack')}
            isDropTarget={draggedCard?.type === 'potion' || draggedCard?.type === 'weapon' || draggedCard?.type === 'shield'}
            onClick={handleBackpackClick}
          />
        </div>

        <div className="flex gap-4 items-center justify-center flex-wrap">
          <SellZone
            onDrop={handleSellCard}
            isDropTarget={draggedCard !== null && SELLABLE_TYPES.includes(draggedCard.type)}
          />
          <div className="flex gap-2">
            <Button onClick={initGame} variant="outline" data-testid="button-new-game">
              New Game
            </Button>
            <HelpDialog />
          </div>
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
    </div>
  );
}
