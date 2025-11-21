import { Card } from '@/components/ui/card';
import { Shield, Sword, Backpack, Package } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { initMobileDrop, initMobileDrag } from '../utils/mobileDragDrop';

export type SlotType = 'equipment' | 'backpack';

interface EquipmentSlotProps {
  type: SlotType;
  slotId?: string;
  item?: { name: string; value: number; image?: string; type?: string; durability?: number; maxDurability?: number } | null;
  backpackCount?: number; // Number of items in backpack stack
  slotBonus?: number; // Bonus value for this equipment slot
  onDrop?: (card: any) => void;
  onDragStart?: (item: any) => void;
  onDragEnd?: () => void;
  isDropTarget?: boolean;
  onClick?: () => void;
}

export default function EquipmentSlot({ type, slotId, item, backpackCount = 0, slotBonus = 0, onDrop, onDragStart, onDragEnd, isDropTarget, onClick }: EquipmentSlotProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLDivElement>(null);
  
  // Set up mobile drop support for the slot
  useEffect(() => {
    if (!slotRef.current || !onDrop) return;
    
    const cleanup = initMobileDrop(
      slotRef.current,
      (dragData) => {
        if (dragData.type === 'card') {
          onDrop(dragData.data);
        }
      },
      ['card'] // Accept card drops
    );
    
    return cleanup;
  }, [onDrop]);
  
  // Set up mobile drag support for equipped items
  useEffect(() => {
    if (!itemRef.current || !item || type === 'backpack') return;
    
    const equipmentData = { ...item, fromSlot: slotId };
    const cleanup = initMobileDrag(
      itemRef.current,
      { type: 'equipment', data: equipmentData },
      () => onDragStart?.(equipmentData),
      () => onDragEnd?.()
    );
    
    return cleanup;
  }, [item, type, slotId, onDragStart, onDragEnd]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const cardData = e.dataTransfer.getData('card');
    if (cardData) {
      onDrop?.(JSON.parse(cardData));
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (item && type !== 'backpack') {
      const equipmentData = { ...item, fromSlot: slotId };
      e.dataTransfer.setData('equipment', JSON.stringify(equipmentData));
      onDragStart?.(equipmentData);
    }
  };

  const handleDragEnd = () => {
    onDragEnd?.();
  };

  const getIcon = () => {
    if (type === 'backpack') {
      return <Backpack className="w-8 h-8 text-muted-foreground" />;
    }
    // For equipment slots, show appropriate icon based on what's stored
    if (item?.type === 'shield') {
      return <Shield className="w-8 h-8 text-muted-foreground" />;
    } else if (item?.type === 'weapon') {
      return <Sword className="w-8 h-8 text-muted-foreground" />;
    }
    return <Package className="w-8 h-8 text-muted-foreground" />;
  };

  const getLabel = () => {
    if (type === 'backpack') return 'Backpack';
    return 'Equipment';
  };

  const testId = slotId || `slot-${type}`;

  // Determine bonus badge color based on the item type in the slot
  const getBonusColor = () => {
    if (!item) return 'bg-gray-500';
    if (item.type === 'weapon') return 'bg-red-500'; // Red for attack bonus
    if (item.type === 'shield') return 'bg-blue-500'; // Blue for defense bonus
    return 'bg-gray-500';
  };

  return (
    <div 
      ref={slotRef}
      className="relative"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ 
        width: 'clamp(80px, 12vw, 160px)', 
        height: 'clamp(112px, 16.8vw, 224px)' 
      }}
      data-testid={testId}
    >
      {/* Slot bonus badge - only show for equipment slots */}
      {type === 'equipment' && (
        <div className={`absolute -top-2 -right-2 z-30 ${getBonusColor()} text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg`}>
          <span className="font-mono font-bold text-sm">
            +{slotBonus}
          </span>
        </div>
      )}
      {item ? (
        <Card 
          ref={itemRef}
          draggable={type !== 'backpack'}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          className={`
            w-full h-full border-2 border-card-border shadow-md overflow-hidden 
            ${type === 'backpack' ? 'cursor-pointer hover-elevate active-elevate-2' : 'cursor-grab active:cursor-grabbing hover-elevate'}
          `}
          onClick={type === 'backpack' ? onClick : undefined}
          style={{
            // Shift the card to the right as durability decreases (visual feedback)
            transform: (item.durability && item.maxDurability && item.durability < item.maxDurability) 
              ? `translateX(${(item.maxDurability - item.durability) * 8}px)` 
              : undefined
          }}
        >
          <div className="h-full flex flex-col">
            <div className="relative h-[60%] bg-gradient-to-b from-muted to-card overflow-hidden">
              {/* Background durability numbers for visual tracking */}
              {item.durability && item.maxDurability && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="flex gap-2">
                    {[...Array(item.maxDurability)].map((_, i) => (
                      <div 
                        key={i} 
                        className={`text-5xl font-bold ${
                          i < item.durability
                            ? 'text-foreground/10' 
                            : 'text-muted/5'
                        }`}
                      >
                        {item.maxDurability - i}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {item.image && (
                <img 
                  src={item.image} 
                  alt={item.name}
                  className="w-full h-full object-cover relative z-10"
                  style={{ opacity: 0.9 }} // Slightly transparent to show durability numbers
                />
              )}
              
              {/* Value indicator */}
              <div className="absolute top-1 right-1 z-20">
                <div className="bg-background/80 backdrop-blur-sm rounded-full w-6 h-6 flex items-center justify-center">
                  <span className="font-mono font-bold text-xs" data-testid={`${testId}-value`}>
                    {item.value}
                  </span>
                </div>
              </div>
              
              {/* Durability indicator */}
              {item.durability && item.maxDurability && (
                <div className="absolute bottom-1 right-1 z-20">
                  <div className="bg-background/90 backdrop-blur-sm rounded px-2 py-1 flex items-center gap-1">
                    <Shield className="w-3 h-3 text-blue-500" />
                    <span className="font-mono font-bold text-xs" data-testid={`${testId}-durability`}>
                      {item.durability}/{item.maxDurability}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="h-[40%] p-2 flex flex-col items-center justify-center bg-card">
              <p className="text-xs font-medium text-center">{item.name}</p>
              {type === 'backpack' && backpackCount > 1 && (
                <p className="text-xs text-muted-foreground mt-1">+{backpackCount - 1} more</p>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <Card className={`
          w-full h-full border-2 border-dashed border-border
          flex flex-col items-center justify-center gap-2
          transition-all duration-200
          ${isDropTarget ? 'border-primary border-4 bg-primary/10' : 'bg-muted/30'}
        `}>
          {getIcon()}
          <span className="text-xs text-muted-foreground font-medium">{getLabel()}</span>
        </Card>
      )}
    </div>
  );
}
