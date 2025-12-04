import { Heart, Coins, Layers, Skull, ShoppingBag, Clock3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import HelpDialog from './HelpDialog';

interface GameHeaderProps {
  hp: number;
  maxHp: number;
  gold: number;
  cardsRemaining: number;
  monstersDefeated?: number;
  shopLevel: number;
  turnCount: number;
  onDeckClick?: () => void;
  onNewGame?: () => void;
}

export default function GameHeader({
  hp,
  maxHp,
  gold,
  cardsRemaining,
  monstersDefeated = 0,
  shopLevel,
  turnCount,
  onDeckClick,
  onNewGame,
}: GameHeaderProps) {
  return (
    <div className="h-auto py-3 px-4 lg:px-8 bg-card border-b border-card-border flex items-center justify-between flex-wrap gap-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3" data-testid="header-hp">
          <Heart className="w-6 h-6 lg:w-8 lg:h-8 text-destructive" />
          <span className="font-mono text-2xl lg:text-3xl font-bold">
            {hp}/{maxHp}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={onNewGame} variant="outline" size="sm" data-testid="button-new-game">
            New Game
          </Button>
          <HelpDialog />
        </div>
      </div>

      <button 
        onClick={onDeckClick}
        className="flex items-center gap-3 hover-elevate active-elevate-2 p-2 lg:p-3 rounded-md transition-all"
        data-testid="header-deck"
      >
        <Layers className="w-6 h-6 lg:w-8 lg:h-8 text-primary" />
        <Badge variant="outline" className="font-mono text-lg lg:text-xl px-3 py-1">
          {cardsRemaining}
        </Badge>
      </button>

      <div className="flex items-center gap-3" data-testid="header-turn-count">
        <Clock3 className="w-6 h-6 lg:w-8 lg:h-8 text-muted-foreground" />
        <Badge variant="outline" className="font-mono text-lg lg:text-xl px-3 py-1">
          回合 {turnCount}
        </Badge>
      </div>

      <div className="flex items-center gap-3" data-testid="stat-monsters-defeated">
        <Skull className="w-6 h-6 lg:w-8 lg:h-8 text-primary" />
        <Badge variant="outline" className="font-mono text-lg lg:text-xl px-3 py-1">
          {monstersDefeated}
        </Badge>
      </div>

      <div className="flex items-center gap-2" data-testid="header-shop-level">
        <ShoppingBag className="w-6 h-6 lg:w-8 lg:h-8 text-amber-500" />
        <div className="flex flex-col leading-tight">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">商店等级</span>
          <Badge variant="secondary" className="font-mono text-base lg:text-lg px-3 py-1">
            Lv.{shopLevel}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-3" data-testid="header-gold">
        <Coins className="w-6 h-6 lg:w-8 lg:h-8 text-yellow-500" />
        <span className="font-mono text-2xl lg:text-3xl font-bold text-yellow-500">
          {gold}
        </span>
      </div>
    </div>
  );
}
