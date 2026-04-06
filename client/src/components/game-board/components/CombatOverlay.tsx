/**
 * CombatOverlay — renders the floating combat UI elements.
 *
 * Includes the "End Hero Turn" button, minimized modal restore buttons,
 * and the undo button.
 */

import { memo } from 'react';
import { Swords, Undo2, Calendar, ShoppingBag, Skull, Trophy } from 'lucide-react';
import type { GameCardData } from '@/components/GameCard';
import type { CombatState } from '../types';

export interface CombatOverlayProps {
  combatState: CombatState;
  gameOver: boolean;
  victory: boolean;
  showSkillSelection: boolean;
  isCombatPanelVisible: boolean;
  headerHeight: number;
  stageScale: number;
  undoCount: number;
  fullBoardInteractionLocked: boolean;
  endHeroTurnDisabled: boolean;
  eventModalOpen: boolean;
  eventModalMinimized: boolean;
  shopModalOpen: boolean;
  shopModalMinimized: boolean;
  gameOverMinimized: boolean;
  currentEventCard: GameCardData | null;
  onEndHeroTurn: () => void;
  onUndo: () => void;
  onEventModalRestore: () => void;
  onShopModalRestore: () => void;
  onGameOverRestore: () => void;
}

function CombatOverlayInner({
  combatState,
  gameOver,
  victory,
  showSkillSelection,
  isCombatPanelVisible,
  headerHeight,
  stageScale,
  undoCount,
  fullBoardInteractionLocked,
  endHeroTurnDisabled,
  eventModalOpen,
  eventModalMinimized,
  shopModalOpen,
  shopModalMinimized,
  gameOverMinimized,
  currentEventCard,
  onEndHeroTurn,
  onUndo,
  onEventModalRestore,
  onShopModalRestore,
  onGameOverRestore,
}: CombatOverlayProps) {
  return (
    <>
      {/* End Hero Turn button */}
      {isCombatPanelVisible &&
        combatState.currentTurn === 'hero' &&
        !gameOver &&
        !showSkillSelection && (
          <div
            className="absolute right-4 z-[9999]"
            style={{
              top: `${headerHeight + 8}px`,
              pointerEvents: 'none',
              transform: `scale(${stageScale})`,
              transformOrigin: 'top right',
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEndHeroTurn();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={endHeroTurnDisabled}
              style={{
                pointerEvents: endHeroTurnDisabled ? 'none' : 'auto',
              }}
              className={`end-hero-turn-btn flex items-center gap-2 rounded-full px-5 py-2.5 shadow-lg transition-all select-none font-bold ${
                !endHeroTurnDisabled
                  ? 'bg-amber-500 text-white hover:bg-amber-600 active:scale-95'
                  : 'bg-amber-500/40 text-white/40 cursor-not-allowed'
              }`}
            >
              <Swords className="w-5 h-5" />
              <span className="text-sm">End Hero Turn</span>
            </button>
          </div>
        )}

      {/* Event-pending floating restore button */}
      {eventModalOpen && eventModalMinimized && (
        <div
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-pink-600/90 px-5 py-2.5 shadow-lg cursor-pointer select-none event-pending-restore-btn hover:bg-pink-600 transition-colors"
          style={{ pointerEvents: 'auto' }}
          onClick={onEventModalRestore}
          onTouchEnd={(e) => {
            e.preventDefault();
            onEventModalRestore();
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
            eventModalOpen && eventModalMinimized
              ? 'bottom-32'
              : 'bottom-20'
          }`}
          style={{ pointerEvents: 'auto' }}
          onClick={onShopModalRestore}
          onTouchEnd={(e) => {
            e.preventDefault();
            onShopModalRestore();
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
            eventModalOpen &&
            eventModalMinimized &&
            shopModalOpen &&
            shopModalMinimized
              ? 'bottom-44'
              : (eventModalOpen && eventModalMinimized) ||
                  (shopModalOpen && shopModalMinimized)
                ? 'bottom-32'
                : 'bottom-20'
          }`}
          style={{ pointerEvents: 'auto' }}
          onClick={onGameOverRestore}
          onTouchEnd={(e) => {
            e.preventDefault();
            onGameOverRestore();
          }}
        >
          {victory ? (
            <Trophy className="w-4 h-4 text-white" />
          ) : (
            <Skull className="w-4 h-4 text-white" />
          )}
          <span className="text-white text-sm font-semibold whitespace-nowrap">
            {victory ? '胜利' : '失败'} — 点击恢复
          </span>
        </div>
      )}

      {/* Undo button */}
      <div
        className="absolute bottom-4 right-4 z-[9999] flex flex-col items-end"
        style={{ pointerEvents: 'none' }}
      >
        {!showSkillSelection && (
          <div
            style={{
              pointerEvents: 'none',
              transform: `scale(${stageScale})`,
              transformOrigin: 'bottom right',
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUndo();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={undoCount === 0 || fullBoardInteractionLocked}
              style={{
                pointerEvents: fullBoardInteractionLocked ? 'none' : 'auto',
              }}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2.5 shadow-lg transition-all select-none ${
                undoCount > 0
                  ? 'bg-slate-700/90 text-white hover:bg-slate-600 active:scale-95'
                  : 'bg-slate-700/40 text-white/40 cursor-not-allowed'
              }`}
            >
              <Undo2 className="w-4 h-4" />
              <span className="text-sm font-medium">撤销</span>
              {undoCount > 0 && (
                <span className="bg-white/20 rounded-full px-1.5 py-0.5 text-xs">
                  {undoCount}
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default memo(CombatOverlayInner);
