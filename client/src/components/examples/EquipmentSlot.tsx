import EquipmentSlot from '../EquipmentSlot';
import swordImage from '@assets/generated_images/magical_sword_weapon_card.png';
import shieldImage from '@assets/generated_images/medieval_shield_card_art.png';

export default function EquipmentSlotExample() {
  return (
    <div className="p-8 bg-background flex gap-4">
      <div>
        <h3 className="text-sm text-muted-foreground mb-2">Empty Slots</h3>
        <div className="flex gap-4">
          <EquipmentSlot type="equipment" slotId="example-slot-weapon" />
          <EquipmentSlot type="equipment" slotId="example-slot-shield" />
          <EquipmentSlot type="backpack" slotId="example-slot-backpack" />
        </div>
      </div>
      <div>
        <h3 className="text-sm text-muted-foreground mb-2">Equipped Items</h3>
        <div className="flex gap-4">
          <EquipmentSlot 
            type="equipment" 
            slotId="example-equipped-weapon"
            item={{ id: 'example-weapon', type: 'weapon', name: 'Rune Sword', value: 5, image: swordImage }}
          />
          <EquipmentSlot 
            type="equipment" 
            slotId="example-equipped-shield"
            item={{ id: 'example-shield', type: 'shield', name: 'Iron Shield', value: 3, image: shieldImage }}
          />
        </div>
      </div>
    </div>
  );
}
