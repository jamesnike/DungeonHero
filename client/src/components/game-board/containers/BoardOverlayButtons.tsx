import { memo } from 'react';
import { Swords } from 'lucide-react';
import { useShallowGameState } from '@/hooks/useGameEngine';
import { HeroTurnTimer } from '@/components/HeroTurnTimer';
import { useModalCallbacks } from '../contexts/ModalCallbacksContext';
import { useModalUI } from '../contexts/ModalUIContext';

function BoardOverlayButtonsInner() {
  const cb = useModalCallbacks();
  const ui = useModalUI();

  const gs = useShallowGameState(s => ({
    combatState: s.combatState,
    gameOver: s.gameOver,
    showSkillSelection: s.showSkillSelection,
  }));

  const isCombatPanelVisible = gs.combatState.engagedMonsterIds.length > 0;
  const combatCurrentTurn = gs.combatState.currentTurn;

  if (!(isCombatPanelVisible && combatCurrentTurn === 'hero' && !gs.gameOver && !gs.showSkillSelection)) {
    return null;
  }

  return (
    <div
      className="absolute right-4 z-[9999] flex flex-col items-end gap-2"
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
      {/* 60s wall-clock 倒计时——可见性 / 重置由组件内部根据 playerTurnStartedAt
          自动判定，跟 End Hero Turn 按钮共享同一个「战斗中且 hero turn」窗口。
          归零时 onTimeout 走 onAutoEndHeroTurn：force close 所有 modal +
          dispatch FORCE_END_HERO_TURN（绕过 endHeroTurnGuardRef）。 */}
      <HeroTurnTimer onTimeout={cb.onAutoEndHeroTurn} />
    </div>
  );
}

export const BoardOverlayButtons = memo(BoardOverlayButtonsInner);
