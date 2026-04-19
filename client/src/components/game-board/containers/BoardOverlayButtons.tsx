import { memo } from 'react';
import { Swords, Undo2 } from 'lucide-react';
import { useShallowGameState } from '@/hooks/useGameEngine';
import { useModalCallbacks } from '../contexts/ModalCallbacksContext';
import { useModalUI } from '../contexts/ModalUIContext';

function BoardOverlayButtonsInner() {
  const cb = useModalCallbacks();
  const ui = useModalUI();

  const gs = useShallowGameState(s => ({
    combatState: s.combatState,
    gameOver: s.gameOver,
    showSkillSelection: s.showSkillSelection,
    undoCount: s.undoCount,
  }));

  const isCombatPanelVisible = gs.combatState.engagedMonsterIds.length > 0;
  const combatCurrentTurn = gs.combatState.currentTurn;

  return (
    <>
      {isCombatPanelVisible && combatCurrentTurn === 'hero' && !gs.gameOver && !gs.showSkillSelection && (
        <div
          className="absolute right-4 z-[9999]"
          style={{
            top: `${ui.headerHeight + 8}px`,
            pointerEvents: 'none',
            transform: `scale(${ui.stageScale})`,
            transformOrigin: 'top right',
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); cb.onEndHeroTurn(); }}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={ui.endHeroTurnDisabled}
            style={{ pointerEvents: ui.endHeroTurnDisabled ? 'none' : 'auto' }}
            className={`end-hero-turn-btn flex items-center gap-2 rounded-full px-5 py-2.5 shadow-lg transition-all select-none font-bold ${
              !ui.endHeroTurnDisabled
                ? 'bg-amber-500 text-white hover:bg-amber-600 active:scale-95'
                : 'bg-amber-500/40 text-white/40 cursor-not-allowed'
            }`}
          >
            <Swords className="w-5 h-5" />
            <span className="text-sm">End Hero Turn</span>
          </button>
        </div>
      )}

      <div className="absolute bottom-4 right-4 z-[9999] flex flex-col items-end" style={{ pointerEvents: 'none' }}>
        {!gs.showSkillSelection && (
          <div
            style={{
              pointerEvents: 'none',
              transform: `scale(${ui.stageScale})`,
              transformOrigin: 'bottom right',
            }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); cb.onUndo(); }}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={gs.undoCount === 0 || ui.fullBoardInteractionLocked}
              style={{ pointerEvents: ui.fullBoardInteractionLocked ? 'none' : 'auto' }}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2.5 shadow-lg transition-all select-none ${
                gs.undoCount > 0
                  ? 'bg-slate-700/90 text-white hover:bg-slate-600 active:scale-95'
                  : 'bg-slate-700/40 text-white/40 cursor-not-allowed'
              }`}
            >
              <Undo2 className="w-4 h-4" />
              <span className="text-sm font-medium">撤销</span>
              {gs.undoCount > 0 && (
                <span className="bg-white/20 rounded-full px-1.5 py-0.5 text-xs">{gs.undoCount}</span>
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export const BoardOverlayButtons = memo(BoardOverlayButtonsInner);
