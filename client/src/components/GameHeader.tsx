import { Heart, Coins, Layers, Waves, ShoppingBag, Trophy, Handshake } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import HelpDialog from './HelpDialog';
import { memo, useEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import { useGameViewport } from '@/contexts/GameViewportContext';
import { FLAT_ASPECT_RATIO } from './game-board/constants';

interface GameHeaderProps {
  hp: number;
  maxHp: number;
  gold: number;
  cardsRemaining: number;
  shopLevel: number;
  persuadeLevel: number;
  persuadeCost: number;
  persuadeTempDiscount?: number;
  turnCount: number;
  totalWins?: number;
  onDeckClick?: () => void;
  onNewGame?: () => void;
  /** 瀑流「回牌堆」挤掉动画飞向牌库计数按钮 */
  deckFlyTargetRef?: Ref<HTMLButtonElement | null>;
}

function GameHeaderInner({
  hp,
  maxHp,
  gold,
  cardsRemaining,
  shopLevel,
  persuadeLevel,
  persuadeCost,
  persuadeTempDiscount = 0,
  turnCount,
  totalWins = 0,
  onDeckClick,
  onNewGame,
  deckFlyTargetRef,
}: GameHeaderProps) {
  const gameViewport = useGameViewport();
  const isFlat = gameViewport.width / gameViewport.height > FLAT_ASPECT_RATIO;
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
    const MIN_SCALE = 0.42;
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
      className="game-header h-auto bg-card border-b border-card-border flex items-center justify-between"
      style={headerStyle}
      data-flat={isFlat || undefined}
    >
      <div className="game-header__group">
        <div className="game-header__trophy" data-testid="header-trophy">
          <Trophy className="game-header__icon text-yellow-500" />
          <span className="game-header__trophy-count font-mono font-bold">{totalWins}</span>
        </div>

        <div className="game-header__controls">
          <Button onClick={onNewGame} variant="outline" size="sm" data-testid="button-new-game" className="game-header__button">
            New Game
          </Button>
          <HelpDialog buttonClassName="game-header__button game-header__button--icon" />
          <div className="game-header__stat" data-testid="header-hp">
            <Heart className="game-header__icon text-destructive" />
            <span className="game-header__value font-mono font-bold">
              {hp}/{maxHp}
            </span>
          </div>
        </div>
      </div>

      <button
        ref={deckFlyTargetRef}
        onClick={onDeckClick}
        className="game-header__deck hover-elevate active-elevate-2 rounded-md transition-transform"
        data-testid="header-deck"
      >
        <Layers className="game-header__icon text-primary" />
        <Badge variant="outline" className="game-header__badge font-mono">
          {cardsRemaining}
        </Badge>
      </button>

      <div className="game-header__stat" data-testid="stat-waterfall-count">
        <Waves className="game-header__icon text-blue-500" />
        <Badge variant="outline" className="game-header__badge font-mono">
          {turnCount}
        </Badge>
      </div>

      <div className="game-header__shop" data-testid="header-shop-level">
        <ShoppingBag className="game-header__icon text-amber-500" />
        <Badge variant="secondary" className="game-header__badge font-mono">
          Lv.{shopLevel}
        </Badge>
      </div>

      <div className="game-header__shop" data-testid="header-persuade-level" title={`劝降等级 Lv.${persuadeLevel}（可劝降 ≤${persuadeLevel} 血层怪物）/ 费用 ${persuadeCost} 金${persuadeTempDiscount ? `（临时${persuadeTempDiscount > 0 ? '减免' : '加价'} ${Math.abs(persuadeTempDiscount)}）` : ''}`}>
        <Handshake className="game-header__icon text-purple-500" />
        <Badge variant="secondary" className="game-header__badge font-mono">
          Lv.{persuadeLevel}
          <span className={`game-header__badge-sep ${persuadeTempDiscount > 0 ? 'text-green-400' : persuadeTempDiscount < 0 ? 'text-red-400' : 'text-amber-500'}`}>{persuadeCost}g</span>
        </Badge>
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

export default memo(GameHeaderInner);
