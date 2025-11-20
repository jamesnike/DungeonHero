import { Card } from '@/components/ui/card';
import { Shield, Sword, Backpack, Package } from 'lucide-react';

export type SlotType = 'equipment' | 'backpack';

interface EquipmentSlotProps {
  type: SlotType;
  slotId?: string;
  item?: { name: string; value: number; image?: string; type?: string } | null;
  onDrop?: (card: any) => void;
  onDragStart?: (item: any) => void;
  onDragEnd?: () => void;
  isDropTarget?: boolean;
  onClick?: () => void;
}

export default function EquipmentSlot({ type, slotId, item, onDrop, onDragStart, onDragEnd, isDropTarget, onClick }: EquipmentSlotProps) {
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

  return (
    <div 
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="w-32 h-44 md:w-40 md:h-56"
      data-testid={testId}
    >
      {item ? (
        <Card 
          draggable={type !== 'backpack'}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          className={`
            w-full h-full border-2 border-card-border shadow-md overflow-hidden 
            ${type === 'backpack' ? 'cursor-pointer hover-elevate active-elevate-2' : 'cursor-grab active:cursor-grabbing hover-elevate'}
          `}
          onClick={type === 'backpack' ? onClick : undefined}
        >
          <div className="h-full flex flex-col">
            <div className="relative h-[60%] bg-gradient-to-b from-muted to-card overflow-hidden">
              {item.image && (
                <img 
                  src={item.image} 
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute top-1 right-1">
                <div className="bg-background/80 backdrop-blur-sm rounded-full w-6 h-6 flex items-center justify-center">
                  <span className="font-mono font-bold text-xs" data-testid={`${testId}-value`}>
                    {item.value}
                  </span>
                </div>
              </div>
            </div>
            <div className="h-[40%] p-2 flex flex-col items-center justify-center bg-card">
              <p className="text-xs font-medium text-center">{item.name}</p>
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
