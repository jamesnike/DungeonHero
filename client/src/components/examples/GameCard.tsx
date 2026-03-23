import GameCard from '../GameCard';
import dragonImage from '@assets/generated_images/dragon_monster_card_art.png';
import swordImage from '@assets/generated_images/magical_sword_weapon_card.png';
import shieldImage from '@assets/generated_images/medieval_shield_card_art.png';
import potionImage from '@assets/generated_images/healing_potion_card_art.png';
import scrollImage from '@assets/generated_images/chibi_event_scroll.png';

export default function GameCardExample() {
  const cards = [
    { id: '1', type: 'monster' as const, name: 'Dragon', value: 8, image: dragonImage },
    { id: '2', type: 'weapon' as const, name: 'Rune Sword', value: 5, image: swordImage },
    { id: '3', type: 'shield' as const, name: 'Iron Shield', value: 3, image: shieldImage },
    { id: '4', type: 'potion' as const, name: 'Health Potion', value: 4, image: potionImage },
    {
      id: '5',
      type: 'event' as const,
      name: '封印卷轴（翻转示例）',
      value: 0,
      image: scrollImage,
      eventChoices: [{ text: '研读（无效果）', effect: 'none' }],
      flipTarget: {
        toCard: {
          id: 'flip-demo-potion',
          type: 'potion',
          name: '卷轴残渣',
          value: 0,
          image: potionImage,
          description: '使用时永久让法术伤害 +1。',
          potionEffect: 'perm-spell-damage',
        },
        destination: 'backpack',
        banner: '卷轴翻转成残渣药剂，已放入背包。',
      },
    },
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
