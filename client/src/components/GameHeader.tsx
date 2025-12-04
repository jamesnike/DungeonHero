import { Heart, Coins, Layers, Skull, ShoppingBag, Clock3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import HelpDialog from './HelpDialog';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

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
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerScale, setHeaderScale] = useState(1);
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const target = headerRef.current;
    if (!target) {
      return;
    }
    const BASE_WIDTH = 1180;
    const MIN_SCALE = 0.62;
    const MAX_SCALE = 1.35;
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    const updateScale = () => {
      const width = target.getBoundingClientRect().width;
      if (!width) return;
      setHeaderScale(prev => {
        const next = clamp(width / BASE_WIDTH, MIN_SCALE, MAX_SCALE);
        return Math.abs(prev - next) > 0.01 ? next : prev;
      });
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  const headerStyle = {
    '--dh-header-scale': headerScale.toString(),
  } as CSSProperties;

  return (
    <div
      ref={headerRef}
      className="game-header h-auto py-3 px-4 bg-card border-b border-card-border flex items-center justify-between gap-4"
      style={headerStyle}
    >
      <div className="game-header__group">
        <div className="game-header__stat" data-testid="header-hp">
          <Heart className="game-header__icon text-destructive" />
          <span className="game-header__value font-mono font-bold">
            {hp}/{maxHp}
          </span>
        </div>

        <div className="game-header__controls">
          <Button onClick={onNewGame} variant="outline" size="sm" data-testid="button-new-game" className="game-header__button">
            New Game
          </Button>
          <HelpDialog />
        </div>
      </div>

      <button 
        onClick={onDeckClick}
        className="game-header__deck hover-elevate active-elevate-2 rounded-md transition-all"
        data-testid="header-deck"
      >
        <Layers className="game-header__icon text-primary" />
        <Badge variant="outline" className="game-header__badge font-mono">
          {cardsRemaining}
        </Badge>
      </button>

      <div className="game-header__stat" data-testid="header-turn-count">
        <Clock3 className="game-header__icon text-muted-foreground" />
        <Badge variant="outline" className="game-header__badge font-mono">
          回合 {turnCount}
        </Badge>
      </div>

      <div className="game-header__stat" data-testid="stat-monsters-defeated">
        <Skull className="game-header__icon text-primary" />
        <Badge variant="outline" className="game-header__badge font-mono">
          {monstersDefeated}
        </Badge>
      </div>

      <div className="game-header__shop" data-testid="header-shop-level">
        <ShoppingBag className="game-header__icon text-amber-500" />
        <div className="game-header__shop-text leading-tight">
          <span className="game-header__shop-label uppercase tracking-wide text-muted-foreground">商店等级</span>
          <Badge variant="secondary" className="game-header__badge font-mono">
            Lv.{shopLevel}
          </Badge>
        </div>
      </div>

      <div className="game-header__stat" data-testid="header-gold">
        <Coins className="game-header__icon text-yellow-500" />
        <span className="game-header__value font-mono font-bold text-yellow-500">
          {gold}
        </span>
      </div>
    </div>
  );
}
