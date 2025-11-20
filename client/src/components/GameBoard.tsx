import { useState, useEffect } from 'react';
import GameHeader from './GameHeader';
import HeroCard from './HeroCard';
import GameCard, { type GameCardData } from './GameCard';
import EquipmentSlot, { type SlotType } from './EquipmentSlot';
import SellZone, { SELLABLE_TYPES } from './SellZone';
import VictoryDefeatModal from './VictoryDefeatModal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

import dragonImage from '@assets/generated_images/dragon_monster_card_art.png';
import skeletonImage from '@assets/generated_images/skeleton_warrior_card_art.png';
import swordImage from '@assets/generated_images/magical_sword_weapon_card.png';
import shieldImage from '@assets/generated_images/medieval_shield_card_art.png';
import potionImage from '@assets/generated_images/healing_potion_card_art.png';
import heroImage from '@assets/generated_images/hero_character_portrait.png';

const INITIAL_HP = 13;
const DECK_SIZE = 54;

function createDeck(): GameCardData[] {
  const deck: GameCardData[] = [];
  let id = 0;

  for (let i = 0; i < 12; i++) {
    deck.push({
      id: `monster-${id++}`,
      type: 'monster',
      name: i % 2 === 0 ? 'Dragon' : 'Skeleton',
      value: Math.floor(Math.random() * 6) + 3,
      image: i % 2 === 0 ? dragonImage : skeletonImage,
    });
  }

  for (let i = 0; i < 10; i++) {
    deck.push({
      id: `weapon-${id++}`,
      type: 'weapon',
      name: 'Sword',
      value: Math.floor(Math.random() * 4) + 2,
      image: swordImage,
    });
  }

  for (let i = 0; i < 10; i++) {
    deck.push({
      id: `shield-${id++}`,
      type: 'shield',
      name: 'Shield',
      value: Math.floor(Math.random() * 4) + 2,
      image: shieldImage,
    });
  }

  for (let i = 0; i < 8; i++) {
    deck.push({
      id: `potion-${id++}`,
      type: 'potion',
      name: 'Potion',
      value: Math.floor(Math.random() * 4) + 2,
      image: potionImage,
    });
  }

  for (let i = 0; i < 14; i++) {
    deck.push({
      id: `coin-${id++}`,
      type: 'coin',
      name: 'Gold',
      value: Math.floor(Math.random() * 3) + 1,
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
  };

  const handleCardToHero = (card: GameCardData) => {
    if (card.type === 'monster') {
      let damage = card.value;
      
      if (weaponSlot) {
        damage = Math.max(0, damage - weaponSlot.value);
      }
      if (shieldSlot) {
        damage = Math.max(0, damage - shieldSlot.value);
      }

      const newHp = Math.max(0, hp - damage);
      setHp(newHp);

      toast({
        title: damage > 0 ? 'Damage Taken!' : 'Attack Blocked!',
        description: damage > 0 ? `-${damage} HP` : 'Your equipment protected you!',
        variant: damage > 0 ? 'destructive' : 'default',
      });

      removeCard(card.id);

      if (newHp === 0) {
        setGameOver(true);
        setVictory(false);
      }
    } else if (card.type === 'potion') {
      const newHp = Math.min(INITIAL_HP, hp + card.value);
      setHp(newHp);
      toast({
        title: 'Healed!',
        description: `+${newHp - hp} HP`,
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
            isDropTarget={draggedCard?.type === 'potion'}
          />
        </div>

        <div className="flex gap-4 items-center justify-center">
          <SellZone
            onDrop={handleSellCard}
            isDropTarget={draggedCard !== null && SELLABLE_TYPES.includes(draggedCard.type)}
          />
          <Button onClick={initGame} variant="outline" data-testid="button-new-game">
            New Game
          </Button>
        </div>
      </div>

      <VictoryDefeatModal
        open={gameOver}
        isVictory={victory}
        gold={gold}
        hpRemaining={hp}
        onRestart={initGame}
      />
    </div>
  );
}
