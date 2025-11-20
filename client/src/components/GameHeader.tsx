import { Heart, Coins, Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface GameHeaderProps {
  hp: number;
  maxHp: number;
  gold: number;
  cardsRemaining: number;
}

export default function GameHeader({ hp, maxHp, gold, cardsRemaining }: GameHeaderProps) {
  return (
    <div className="h-16 px-4 bg-card border-b border-card-border flex items-center justify-between">
      <div className="flex items-center gap-2" data-testid="header-hp">
        <Heart className="w-5 h-5 text-destructive" />
        <span className="font-mono text-xl font-bold">
          {hp}/{maxHp}
        </span>
      </div>

      <div className="flex items-center gap-2" data-testid="header-deck">
        <Layers className="w-5 h-5 text-primary" />
        <Badge variant="outline" className="font-mono text-base">
          {cardsRemaining}
        </Badge>
      </div>

      <div className="flex items-center gap-2" data-testid="header-gold">
        <Coins className="w-5 h-5 text-yellow-500" />
        <span className="font-mono text-xl font-bold text-yellow-500">
          {gold}
        </span>
      </div>
    </div>
  );
}
