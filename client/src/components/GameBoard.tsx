import { useState, useEffect } from 'react';
import GameHeader from './GameHeader';
import HeroCard from './HeroCard';
import GameCard, { type GameCardData } from './GameCard';
import EquipmentSlot, { type SlotType } from './EquipmentSlot';
import GraveyardZone from './GraveyardZone';
import VictoryDefeatModal from './VictoryDefeatModal';
import HelpDialog from './HelpDialog';
import DeckViewerModal from './DeckViewerModal';
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

// Cute cartoon shield and potion
import shieldImage from '@assets/generated_images/cute_cartoon_medieval_shield.png';
import potionImage from '@assets/generated_images/cute_cartoon_healing_potion.png';
import coinImage from '@assets/generated_images/cute_cartoon_gold_coins.png';

// Hero image (keep original)
import heroImage from '@assets/generated_images/hero_character_portrait.png';

const INITIAL_HP = 20;
const SELLABLE_TYPES = ['potion', 'coin', 'weapon', 'shield'] as const;
const DECK_SIZE = 54;

type EquipmentItem = { name: string; value: number; image?: string; type: 'weapon' | 'shield' };
type EquipmentSlotId = 'equipmentSlot1' | 'equipmentSlot2';

function createDeck(): GameCardData[] {
  const deck: GameCardData[] = [];
  let id = 0;

  // Monster variety with balanced values (2-7 range)
  const monsterTypes = [
    { name: 'Dragon', image: dragonImage, minValue: 5, maxValue: 7 },
    { name: 'Skeleton', image: skeletonImage, minValue: 2, maxValue: 4 },
    { name: 'Goblin', image: goblinImage, minValue: 2, maxValue: 3 },
    { name: 'Ogre', image: ogreImage, minValue: 4, maxValue: 6 },
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
    deck.push({
      id: `weapon-${id++}`,
      type: 'weapon',
      name: weaponType.name,
      value: value,
      image: weaponType.image,
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
      image: coinImage,
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
  const [equipmentSlot1, setEquipmentSlot1] = useState<EquipmentItem | null>(null);
  const [equipmentSlot2, setEquipmentSlot2] = useState<EquipmentItem | null>(null);
  const [backpackSlot, setBackpackSlot] = useState<{ name: string; value: number; image?: string; type: 'weapon' | 'shield' | 'potion' } | null>(null);
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

  useEffect(() => {
    initGame();
  }, []);

  const initGame = () => {
    const newDeck = createDeck();
    setRemainingDeck(newDeck.slice(4));
    setActiveCards(newDeck.slice(0, 4));
    setHp(INITIAL_HP);
    setGold(0);
    setEquipmentSlot1(null);
    setEquipmentSlot2(null);
    setBackpackSlot(null);
    setCardsPlayed(0);
    setGameOver(false);
    setVictory(false);
    setDrawPending(false);
    setMonstersDefeated(0);
    setTotalDamageTaken(0);
    setTotalHealed(0);
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

  const addToGraveyard = (card: GameCardData) => {
    setDiscardedCards(prev => [...prev, card]);
  };

  const removeCard = (cardId: string) => {
    // Find the card to add to graveyard
    const cardToRemove = activeCards.find(c => c.id === cardId);
    if (cardToRemove) {
      addToGraveyard(cardToRemove);
    }
    
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

  const resolveMonsterEncounter = (monster: GameCardData) => {
    const monsterValue = monster.value;
    const weaponSlot = findWeaponSlot();
    let damageToPlayer = 0;

    if (weaponSlot) {
      // Attack with weapon
      if (weaponSlot.item.value >= monsterValue) {
        setMonstersDefeated(prev => prev + 1);
        toast({
          title: 'Monster Defeated!',
          description: `Your ${weaponSlot.item.name} (${weaponSlot.item.value}) destroyed the ${monster.name} (${monsterValue})!`
        });
      } else {
        damageToPlayer = monsterValue - weaponSlot.item.value;
        toast({
          title: 'Monster Counterattack!',
          description: `${weaponSlot.item.name} dealt damage, but ${monster.name} fights back!`,
          variant: 'destructive'
        });
      }
      clearEquipmentSlotById(weaponSlot.id);
    } else {
      damageToPlayer = monsterValue;
    }

    // Apply shield damage reduction (shield is consumed)
    if (damageToPlayer > 0) {
      const shieldSlot = findShieldSlot();
      if (shieldSlot) {
        const originalDamage = damageToPlayer;
        damageToPlayer = Math.max(0, damageToPlayer - shieldSlot.item.value);
        toast({
          title: damageToPlayer === 0 ? 'Shield Blocked Attack!' : 'Shield Reduced Damage!',
          description: `${shieldSlot.item.name} absorbed damage!${damageToPlayer > 0 ? ` ${originalDamage} → ${damageToPlayer}` : ''}`
        });
        // Shield is consumed after use
        clearEquipmentSlotById(shieldSlot.id);
      } else if (!weaponSlot) {
        toast({
          title: 'Damage Taken!',
          description: `Monster dealt ${damageToPlayer} damage!`,
          variant: 'destructive'
        });
      }
    }

    applyDamage(damageToPlayer);
    removeCard(monster.id);
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

  const applyCounterattackDamage = (damage: number) => {
    let remainingDamage = damage;
    const shieldSlot = findShieldSlot();
    
    if (shieldSlot && remainingDamage > 0) {
      const blocked = Math.min(shieldSlot.item.value, remainingDamage);
      remainingDamage -= blocked;
      toast({
        title: 'Shield Blocks Counterattack!',
        description: `${shieldSlot.item.name} absorbed ${blocked} damage!${remainingDamage > 0 ? ` ${damage} → ${remainingDamage}` : ''}`
      });
      clearEquipmentSlotById(shieldSlot.id);
    }
    
    if (remainingDamage > 0) {
      applyDamage(remainingDamage);
    }
  };

  const handleWeaponToMonster = (weapon: any, monster: GameCardData) => {
    const weaponValue = weapon.value;
    const monsterValue = monster.value;
    
    // Clear the weapon from its slot
    if (weapon.fromSlot) {
      clearEquipmentSlotById(weapon.fromSlot as EquipmentSlotId);
    }
    
    if (weaponValue >= monsterValue) {
      // Weapon defeats monster - remove it
      setMonstersDefeated(prev => prev + 1);
      toast({
        title: 'Monster Defeated!',
        description: `Your ${weapon.name} (${weaponValue}) destroyed the ${monster.name} (${monsterValue})!`
      });
      removeCard(monster.id);
    } else {
      // Monster survives - stays on the board, counterattacks
      const counterDamage = monsterValue - weaponValue;
      toast({
        title: 'Monster Survives!',
        description: `${weapon.name} weakened it, but ${monster.name} (${monsterValue - weaponValue} HP left) counterattacks for ${counterDamage} damage!`,
        variant: 'destructive'
      });
      
      // Apply counterattack damage (shield can still block)
      applyCounterattackDamage(counterDamage);
      // Monster stays in dungeon - player must deal with it again
    }
  };

  const handleCardToHero = (card: GameCardData) => {
    if (card.type === 'monster') {
      resolveMonsterEncounter(card);
    } else if (card.type === 'potion') {
      const newHp = Math.min(INITIAL_HP, hp + card.value);
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
    }
  };

  const handleCardToSlot = (card: GameCardData, slotId: string) => {
    if (slotId === 'slot-backpack' && (card.type === 'potion' || card.type === 'weapon' || card.type === 'shield')) {
      setBackpackSlot({ name: card.name, value: card.value, image: card.image, type: card.type });
      toast({ title: 'Item Stored!' });
      removeCard(card.id);
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
          // Shield blocks damage
          const monsterValue = card.value;
          const shieldValue = equippedItem.value;
          const damageToPlayer = Math.max(0, monsterValue - shieldValue);
          
          toast({
            title: damageToPlayer === 0 ? 'Shield Blocked!' : 'Shield Reduced Damage!',
            description: `${equippedItem.name} absorbed damage!${damageToPlayer > 0 ? ` ${monsterValue} → ${damageToPlayer}` : ''}`
          });
          
          // Shield is consumed
          clearEquipmentSlotById(equipSlot);
          
          // Apply remaining damage if any
          if (damageToPlayer > 0) {
            applyDamage(damageToPlayer);
          }
          
          // Remove monster
          removeCard(card.id);
        } else if (equippedItem.type === 'weapon') {
          // Weapon attacks monster
          handleWeaponToMonster({ ...equippedItem, fromSlot: equipSlot }, card);
        }
      } else if (card.type === 'weapon' || card.type === 'shield') {
        // Equip weapon or shield
        setEquipmentSlotById(equipSlot, { name: card.name, value: card.value, image: card.image, type: card.type });
        toast({ title: `${card.type === 'weapon' ? 'Weapon' : 'Shield'} Equipped!` });
        removeCard(card.id);
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
      // Item from dungeon - just remove it from active cards (already added to graveyard above)
      setActiveCards(prev => prev.filter(c => c.id !== item.id));
      setCardsPlayed(prev => prev + 1);
    }
  };

  const handleBackpackClick = () => {
    if (!backpackSlot) return;
    
    const item = backpackSlot;
    
    if (item.type === 'potion') {
      const newHp = Math.min(INITIAL_HP, hp + item.value);
      const healAmount = newHp - hp;
      setHealing(true);
      setTimeout(() => setHealing(false), 500);
      setTotalHealed(prev => prev + healAmount);
      setHp(newHp);
      toast({ title: 'Potion Used!', description: `+${healAmount} HP from backpack` });
      setBackpackSlot(null);
    } else if (item.type === 'shield') {
      const emptySlot = !equipmentSlot1 ? 'equipmentSlot1' : !equipmentSlot2 ? 'equipmentSlot2' : null;
      if (emptySlot) {
        setEquipmentSlotById(emptySlot, { name: item.name, value: item.value, image: item.image, type: 'shield' });
        toast({ title: 'Shield Equipped!', description: `${item.name} equipped from backpack` });
        setBackpackSlot(null);
      } else {
        toast({ title: 'Equipment Full!', description: 'Clear a slot first', variant: 'destructive' });
      }
    } else if (item.type === 'weapon') {
      const emptySlot = !equipmentSlot1 ? 'equipmentSlot1' : !equipmentSlot2 ? 'equipmentSlot2' : null;
      if (emptySlot) {
        setEquipmentSlotById(emptySlot, { name: item.name, value: item.value, image: item.image, type: 'weapon' });
        toast({ title: 'Weapon Equipped!', description: `${item.name} equipped from backpack` });
        setBackpackSlot(null);
      } else {
        toast({ title: 'Equipment Full!', description: 'Clear a slot first', variant: 'destructive' });
      }
    }
  };

  const getRemainingCards = () => {
    return remainingDeck.length + activeCards.length;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col relative">
      <GameHeader 
        hp={hp} 
        maxHp={INITIAL_HP} 
        gold={gold} 
        cardsRemaining={getRemainingCards()}
        monstersDefeated={monstersDefeated}
        onDeckClick={() => setDeckViewerOpen(true)}
      />
      
      {/* Graveyard in top right corner */}
      <div className="absolute top-4 right-4 z-10">
        <GraveyardZone
          onDrop={handleSellCard}
          isDropTarget={
            (draggedCard !== null && (SELLABLE_TYPES as readonly string[]).includes(draggedCard.type)) ||
            (draggedEquipment !== null && (SELLABLE_TYPES as readonly string[]).includes(draggedEquipment.type))
          }
          discardedCards={discardedCards}
        />
      </div>

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
                onWeaponDrop={(weapon) => handleWeaponToMonster(weapon, card)}
                isWeaponDropTarget={draggedEquipment?.type === 'weapon' && card.type === 'monster'}
                className={removingCards.has(card.id) ? 'animate-card-remove' : ''}
              />
            ) : (
              <div key={`empty-${index}`} className="w-32 h-44 md:w-40 md:h-56" />
            )
          ))}

          {/* Hero Row - Bottom */}
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
            maxHp={INITIAL_HP}
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
            item={backpackSlot}
            onDrop={(card) => handleCardToSlot(card, 'slot-backpack')}
            isDropTarget={draggedCard?.type === 'potion' || draggedCard?.type === 'weapon' || draggedCard?.type === 'shield'}
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
        remainingCards={[...activeCards, ...remainingDeck]}
      />
    </div>
  );
}
