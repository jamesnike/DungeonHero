import GameCard from '../GameCard';
import dragonImage from '@assets/generated_images/dragon_monster_card_art.png';
import swordImage from '@assets/generated_images/magical_sword_weapon_card.png';
import shieldImage from '@assets/generated_images/medieval_shield_card_art.png';
import potionImage from '@assets/generated_images/healing_potion_card_art.png';

export default function GameCardExample() {
  const cards = [
    { id: '1', type: 'monster' as const, name: 'Dragon', value: 8, image: dragonImage },
    { id: '2', type: 'weapon' as const, name: 'Rune Sword', value: 5, image: swordImage },
    { id: '3', type: 'shield' as const, name: 'Iron Shield', value: 3, image: shieldImage },
    { id: '4', type: 'potion' as const, name: 'Health Potion', value: 4, image: potionImage },
  ];

  return (
    <div className="flex gap-4 flex-wrap p-8 bg-background">
      {cards.map(card => (
        <GameCard 
          key={card.id} 
          card={card}
          onDragStart={(c) => console.log('Dragging:', c.name)}
        />
      ))}
    </div>
  );
}
