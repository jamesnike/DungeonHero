import { memo } from 'react';
import { useShallowGameState, useDispatch } from '@/hooks/useGameEngine';
import { Calendar, ShoppingBag, Trophy, Skull } from 'lucide-react';

interface FloatingPillsContainerProps {
  gameOverMinimized: boolean;
  setGameOverMinimized: (v: boolean) => void;
}

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
    gameOver,
    victory,
  } = useShallowGameState(s => ({
    eventModalOpen: s.eventModalOpen,
    eventModalMinimized: s.eventModalMinimized,
    currentEventCard: s.currentEventCard,
    shopModalOpen: s.shopModalOpen,
    shopModalMinimized: s.shopModalMinimized,
    gameOver: s.gameOver,
    victory: s.victory,
  }));

  return (
    <>
      {/* Event-pending floating restore button */}
      {eventModalOpen && eventModalMinimized && (
        <div
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-pink-600/90 px-5 py-2.5 shadow-lg cursor-pointer select-none event-pending-restore-btn hover:bg-pink-600 transition-colors"
          style={{ pointerEvents: 'auto' }}
          onClick={() => dispatch({ type: 'SET_EVENT_MODAL_MINIMIZED', minimized: false })}
          onTouchEnd={(e) => {
            e.preventDefault();
            dispatch({ type: 'SET_EVENT_MODAL_MINIMIZED', minimized: false });
          }}
        >
          <Calendar className="w-4 h-4 text-white" />
          <span className="text-white text-sm font-semibold whitespace-nowrap">
            {currentEventCard?.name ?? '事件'} — 点击恢复
          </span>
        </div>
      )}

      {/* Shop-minimized floating restore button */}
      {shopModalOpen && shopModalMinimized && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-amber-600/90 px-5 py-2.5 shadow-lg cursor-pointer select-none hover:bg-amber-600 transition-colors ${
            eventModalOpen && eventModalMinimized ? 'bottom-32' : 'bottom-20'
          }`}
          style={{ pointerEvents: 'auto' }}
          onClick={() => dispatch({ type: 'SET_SHOP_MODAL_MINIMIZED', minimized: false })}
          onTouchEnd={(e) => {
            e.preventDefault();
            dispatch({ type: 'SET_SHOP_MODAL_MINIMIZED', minimized: false });
          }}
        >
          <ShoppingBag className="w-4 h-4 text-white" />
          <span className="text-white text-sm font-semibold whitespace-nowrap">
            商店 — 点击恢复
          </span>
        </div>
      )}

      {/* Game-over minimized floating restore button */}
      {gameOver && gameOverMinimized && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full px-5 py-2.5 shadow-lg cursor-pointer select-none transition-colors ${
            victory
              ? 'bg-emerald-600/90 hover:bg-emerald-600'
              : 'bg-red-700/90 hover:bg-red-700'
          } ${
            (eventModalOpen && eventModalMinimized && shopModalOpen && shopModalMinimized) ? 'bottom-44'
            : ((eventModalOpen && eventModalMinimized) || (shopModalOpen && shopModalMinimized)) ? 'bottom-32'
            : 'bottom-20'
          }`}
          style={{ pointerEvents: 'auto' }}
          onClick={() => setGameOverMinimized(false)}
          onTouchEnd={(e) => {
            e.preventDefault();
            setGameOverMinimized(false);
          }}
        >
          {victory
            ? <Trophy className="w-4 h-4 text-white" />
            : <Skull className="w-4 h-4 text-white" />
          }
          <span className="text-white text-sm font-semibold whitespace-nowrap">
            {victory ? '胜利' : '失败'} — 点击恢复
          </span>
        </div>
      )}
    </>
  );
}

export default memo(FloatingPillsContainerInner);
