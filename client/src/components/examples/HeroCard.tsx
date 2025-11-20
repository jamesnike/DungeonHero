import { useState } from 'react';
import HeroCard from '../HeroCard';
import heroImage from '@assets/generated_images/hero_character_portrait.png';

export default function HeroCardExample() {
  const [hp, setHp] = useState(13);
  const maxHp = 13;

  return (
    <div className="p-8 bg-background flex gap-8">
      <div>
        <h3 className="text-sm text-muted-foreground mb-2">Full Health</h3>
        <HeroCard 
          hp={13} 
          maxHp={maxHp}
          image={heroImage}
          equippedWeapon={{ name: 'Sword', value: 5 }}
          equippedShield={{ name: 'Shield', value: 3 }}
        />
      </div>
      <div>
        <h3 className="text-sm text-muted-foreground mb-2">Low Health</h3>
        <HeroCard 
          hp={3} 
          maxHp={maxHp}
          image={heroImage}
        />
      </div>
    </div>
  );
}
