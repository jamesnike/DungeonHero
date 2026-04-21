import { Heart, Coins, Layers, Waves, ShoppingBag, Trophy, Handshake } from 'lucide-react';
import HelpDialog from './HelpDialog';
import { memo, useEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import { useGameViewport } from '@/contexts/GameViewportContext';
import { useShallowGameState } from '@/hooks/useGameEngine';
import { FLAT_ASPECT_RATIO } from './game-board/constants';
import { PERSUADE_COST } from '@/game-core/constants';

interface GameHeaderProps {
  maxHp: number;
  persuadeTempDiscount?: number;
  onDeckClick?: () => void;
  onNewGame?: () => void;
  /** 瀑流「回牌堆」挤掉动画飞向牌库计数按钮 */
  deckFlyTargetRef?: Ref<HTMLButtonElement>;
}

function GameHeaderInner({
  maxHp,
  persuadeTempDiscount = 0,
  onDeckClick,
  onNewGame,
  deckFlyTargetRef,
}: GameHeaderProps) {
  const {
    hp, gold, turnCount, shopLevel,
    persuadeLevel, persuadeCostModifier, totalWins,
    remainingDeck,
  } = useShallowGameState(s => ({
    hp: s.hp, gold: s.gold, turnCount: s.turnCount, shopLevel: s.shopLevel,
    persuadeLevel: s.persuadeLevel, persuadeCostModifier: s.persuadeCostModifier,
    totalWins: s.totalWins, remainingDeck: s.remainingDeck,
  }));
  const cardsRemaining = remainingDeck.length;
  const persuadeCost = Math.max(0, PERSUADE_COST + persuadeCostModifier - persuadeTempDiscount);
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
      className="game-header h-auto bg-transparent flex items-center justify-between"
      style={headerStyle}
      data-flat={isFlat || undefined}
    >
      <div className="game-header__group">
        <div className="game-header__sticker-icon game-header__sticker-icon--trophy" data-testid="header-trophy">
          <Trophy />
          <span className="game-header__sticker-icon__num">{totalWins}</span>
        </div>

        <div className="game-header__controls">
          <button
            type="button"
            onClick={onNewGame}
            data-testid="button-new-game"
            className="game-header__sticker-button game-header__sticker-button--amber"
          >
            New Game
          </button>
          <HelpDialog buttonClassName="game-header__button game-header__button--icon" />
          <div className="game-header__sticker-icon game-header__sticker-icon--hp" data-testid="header-hp">
            <Heart />
            <span className="game-header__sticker-icon__num game-header__sticker-icon__num--small">
              {hp}/{maxHp}
            </span>
          </div>
        </div>
      </div>

      <button
        ref={deckFlyTargetRef}
        onClick={onDeckClick}
        type="button"
        className="game-header__sticker-icon game-header__sticker-icon--deck"
        data-testid="header-deck"
      >
        <Layers />
        <span className="game-header__sticker-icon__num">{cardsRemaining}</span>
      </button>

      <div className="game-header__sticker-icon game-header__sticker-icon--waterfall" data-testid="stat-waterfall-count">
        <Waves />
        <span className="game-header__sticker-icon__num">{turnCount}</span>
      </div>

      <div className="game-header__sticker-icon game-header__sticker-icon--shop" data-testid="header-shop-level">
        <ShoppingBag />
        <span className="game-header__sticker-icon__num">Lv{shopLevel}</span>
      </div>

      <div
        className="game-header__sticker-icon game-header__sticker-icon--persuade"
        data-testid="header-persuade-level"
        title={`劝降等级 Lv.${persuadeLevel}（可劝降 ≤${persuadeLevel} 血层怪物）/ 费用 ${persuadeCost} 金${persuadeTempDiscount ? `（临时${persuadeTempDiscount > 0 ? '减免' : '加价'} ${Math.abs(persuadeTempDiscount)}）` : ''}`}
      >
        <Handshake />
        <span className="game-header__sticker-icon__num game-header__sticker-icon__num--stack">
          <span>Lv{persuadeLevel}</span>
          <span
            className={
              persuadeTempDiscount > 0
                ? 'game-header__sticker-icon__num-cost--up'
                : persuadeTempDiscount < 0
                ? 'game-header__sticker-icon__num-cost--down'
                : ''
            }
          >
            {persuadeCost}g
          </span>
        </span>
      </div>

      <div className="game-header__sticker-icon game-header__sticker-icon--gold" data-testid="header-gold">
        <Coins />
        <span className="game-header__sticker-icon__num game-header__sticker-icon__num--small">
          {gold}
        </span>
      </div>
    </div>
  );
}

export default memo(GameHeaderInner);
