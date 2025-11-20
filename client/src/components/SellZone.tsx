import { Card } from '@/components/ui/card';
import { Coins, TrendingUp } from 'lucide-react';
import { type CardType } from './GameCard';

export const SELLABLE_TYPES: CardType[] = ['weapon', 'shield', 'potion', 'coin'];

interface SellZoneProps {
  onDrop?: (card: any) => void;
  isDropTarget?: boolean;
}

export default function SellZone({ onDrop, isDropTarget }: SellZoneProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    // Try to get card data first, then equipment data
    const cardData = e.dataTransfer.getData('card');
    const equipmentData = e.dataTransfer.getData('equipment');
    
    if (cardData) {
      onDrop?.(JSON.parse(cardData));
    } else if (equipmentData) {
      onDrop?.(JSON.parse(equipmentData));
    }
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="w-32 h-44 md:w-40 md:h-56"
      data-testid="sell-zone"
    >
      <Card className={`
        w-full h-full border-2 border-dashed
        flex flex-col items-center justify-center gap-2
        transition-all duration-200
        ${isDropTarget ? 'border-yellow-500 border-4 bg-yellow-500/10 scale-105' : 'border-border bg-muted/30'}
      `}>
        <div className={`
          w-12 h-12 rounded-full flex items-center justify-center
          transition-all duration-200
          ${isDropTarget ? 'bg-yellow-500/20' : 'bg-background/50'}
        `}>
          <Coins className={`w-6 h-6 ${isDropTarget ? 'text-yellow-500' : 'text-muted-foreground'}`} />
        </div>
        <div className="text-center">
          <p className="text-xs font-medium text-muted-foreground">Sell</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendingUp className="w-3 h-3 text-green-500" />
            <span className="text-xs text-green-500 font-mono">+Gold</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
