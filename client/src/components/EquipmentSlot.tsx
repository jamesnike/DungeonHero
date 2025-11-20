import { Card } from '@/components/ui/card';
import { Shield, Sword, Backpack } from 'lucide-react';

export type SlotType = 'weapon' | 'shield' | 'backpack';

interface EquipmentSlotProps {
  type: SlotType;
  item?: { name: string; value: number; image?: string } | null;
  onDrop?: (card: any) => void;
  isDropTarget?: boolean;
}

export default function EquipmentSlot({ type, item, onDrop, isDropTarget }: EquipmentSlotProps) {
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

  const getIcon = () => {
    switch (type) {
      case 'weapon':
        return <Sword className="w-8 h-8 text-muted-foreground" />;
      case 'shield':
        return <Shield className="w-8 h-8 text-muted-foreground" />;
      case 'backpack':
        return <Backpack className="w-8 h-8 text-muted-foreground" />;
    }
  };

  const getLabel = () => {
    switch (type) {
      case 'weapon':
        return 'Weapon';
      case 'shield':
        return 'Shield';
      case 'backpack':
        return 'Backpack';
    }
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="w-28 h-40"
      data-testid={`slot-${type}`}
    >
      {item ? (
        <Card className="w-full h-full border-2 border-card-border shadow-md overflow-hidden hover-elevate">
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
                  <span className="font-mono font-bold text-xs" data-testid={`slot-${type}-value`}>
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
