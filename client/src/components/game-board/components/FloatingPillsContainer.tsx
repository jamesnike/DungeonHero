import { memo, type ReactNode } from 'react';
import { useShallowGameState, useDispatch } from '@/hooks/useGameEngine';
import { Calendar, ShoppingBag, Trophy, Skull, Sparkles, Skull as SkullIcon, BookOpen } from 'lucide-react';
import type { GameAction } from '@/game-core/actions';

interface FloatingPillsContainerProps {
  gameOverMinimized: boolean;
  setGameOverMinimized: (v: boolean) => void;
}

interface PillSpec {
  /** Stable key for React. */
  key: string;
  /** Tailwind classes for the pill background + hover state. */
  bgClass: string;
  /** Icon node rendered on the left. */
  icon: ReactNode;
  /** Text shown to the right of the icon. */
  label: string;
  /** Click handler — restores the corresponding modal. */
  onRestore: () => void;
}

/** Distance from the bottom of the board to the restore pill. */
const PILL_BASE_BOTTOM_PX = 80;

function FloatingPillsContainerInner({
  gameOverMinimized,
  setGameOverMinimized,
}: FloatingPillsContainerProps) {
  const dispatch = useDispatch();
  const {
    eventModalOpen,
    eventModalMinimized,
    currentEventCard,
    shopModalOpen,
    shopModalMinimized,
    discoverModalOpen,
    discoverModalMinimized,
    discoverSourceLabel,
    graveyardDiscoverState,
    graveyardDiscoverMinimized,
    activeMonsterReward,
    monsterRewardMinimized,
    gameOver,
    victory,
  } = useShallowGameState(s => ({
    eventModalOpen: s.eventModalOpen,
    eventModalMinimized: s.eventModalMinimized,
    currentEventCard: s.currentEventCard,
    shopModalOpen: s.shopModalOpen,
    shopModalMinimized: s.shopModalMinimized,
    discoverModalOpen: s.discoverModalOpen,
    discoverModalMinimized: s.discoverModalMinimized,
    discoverSourceLabel: s.discoverSourceLabel,
    graveyardDiscoverState: s.graveyardDiscoverState,
    graveyardDiscoverMinimized: s.graveyardDiscoverMinimized,
    activeMonsterReward: s.activeMonsterReward,
    monsterRewardMinimized: s.monsterRewardMinimized,
    gameOver: s.gameOver,
    victory: s.victory,
  }));

  const dispatchSet = (action: GameAction) => () => dispatch(action);

  // Build pill list bottom-to-top, in display priority order.
  // Each entry only enters the array when its modal is currently folded.
  const pills: PillSpec[] = [];

  if (eventModalOpen && eventModalMinimized) {
    pills.push({
      key: 'event',
      bgClass: 'bg-pink-600/90 hover:bg-pink-600 event-pending-restore-btn',
      icon: <Calendar className="w-4 h-4 text-white" />,
      label: `${currentEventCard?.name ?? '事件'} — 点击恢复`,
      onRestore: dispatchSet({ type: 'SET_EVENT_MODAL_MINIMIZED', minimized: false }),
    });
  }

  if (shopModalOpen && shopModalMinimized) {
    pills.push({
      key: 'shop',
      bgClass: 'bg-amber-600/90 hover:bg-amber-600',
      icon: <ShoppingBag className="w-4 h-4 text-white" />,
      label: '商店 — 点击恢复',
      onRestore: dispatchSet({ type: 'SET_SHOP_MODAL_MINIMIZED', minimized: false }),
    });
  }

  if (discoverModalOpen && discoverModalMinimized) {
    pills.push({
      key: 'discover',
      bgClass: 'bg-purple-600/90 hover:bg-purple-600',
      icon: <BookOpen className="w-4 h-4 text-white" />,
      label: `${discoverSourceLabel ? `发现「${discoverSourceLabel}」` : '专属发现'} — 点击恢复`,
      onRestore: dispatchSet({ type: 'SET_DISCOVER_MODAL_MINIMIZED', minimized: false }),
    });
  }

  if (graveyardDiscoverState && graveyardDiscoverMinimized) {
    pills.push({
      key: 'graveyard',
      bgClass: 'bg-cyan-700/90 hover:bg-cyan-700',
      icon: <SkullIcon className="w-4 h-4 text-white" />,
      label: '坟场召回 — 点击恢复',
      onRestore: dispatchSet({ type: 'SET_GRAVEYARD_DISCOVER_MINIMIZED', minimized: false }),
    });
  }

  if (activeMonsterReward && monsterRewardMinimized) {
    pills.push({
      key: 'reward',
      bgClass: 'bg-yellow-600/90 hover:bg-yellow-600',
      icon: <Sparkles className="w-4 h-4 text-white" />,
      label: `战利品（${activeMonsterReward.monsterName}） — 点击恢复`,
      onRestore: dispatchSet({ type: 'SET_MONSTER_REWARD_MINIMIZED', minimized: false }),
    });
  }

  if (gameOver && gameOverMinimized) {
    pills.push({
      key: 'gameOver',
      bgClass: victory
        ? 'bg-emerald-600/90 hover:bg-emerald-600'
        : 'bg-red-700/90 hover:bg-red-700',
      icon: victory
        ? <Trophy className="w-4 h-4 text-white" />
        : <Skull className="w-4 h-4 text-white" />,
      label: `${victory ? '胜利' : '失败'} — 点击恢复`,
      onRestore: () => setGameOverMinimized(false),
    });
  }

  // 多个弹窗同时被缩小时，只显示最上层（数组最后一个）的恢复 pill。
  const topPill = pills.length > 0 ? pills[pills.length - 1] : null;

  if (!topPill) return null;

  return (
    <div
      key={topPill.key}
      className={`absolute left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full px-5 py-2.5 shadow-lg cursor-pointer select-none transition-colors ${topPill.bgClass}`}
      style={{
        pointerEvents: 'auto',
        bottom: `${PILL_BASE_BOTTOM_PX}px`,
      }}
      onClick={topPill.onRestore}
      onTouchEnd={(e) => {
        e.preventDefault();
        topPill.onRestore();
      }}
    >
      {topPill.icon}
      <span className="text-white text-sm font-semibold whitespace-nowrap">
        {topPill.label}
      </span>
    </div>
  );
}

export default memo(FloatingPillsContainerInner);
