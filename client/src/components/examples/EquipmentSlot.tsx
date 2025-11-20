import EquipmentSlot from '../EquipmentSlot';
import swordImage from '@assets/generated_images/magical_sword_weapon_card.png';
import shieldImage from '@assets/generated_images/medieval_shield_card_art.png';

export default function EquipmentSlotExample() {
  return (
    <div className="p-8 bg-background flex gap-4">
      <div>
        <h3 className="text-sm text-muted-foreground mb-2">Empty Slots</h3>
        <div className="flex gap-4">
          <EquipmentSlot type="weapon" />
          <EquipmentSlot type="shield" />
          <EquipmentSlot type="backpack" />
        </div>
      </div>
      <div>
        <h3 className="text-sm text-muted-foreground mb-2">Equipped Items</h3>
        <div className="flex gap-4">
          <EquipmentSlot 
            type="weapon" 
            item={{ name: 'Rune Sword', value: 5, image: swordImage }}
          />
          <EquipmentSlot 
            type="shield" 
            item={{ name: 'Iron Shield', value: 3, image: shieldImage }}
          />
        </div>
      </div>
    </div>
  );
}
