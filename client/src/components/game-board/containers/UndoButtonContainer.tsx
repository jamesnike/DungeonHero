import { memo } from 'react';
import { Undo2 } from 'lucide-react';
import { useShallowGameState } from '@/hooks/useGameEngine';

interface UndoButtonContainerProps {
  onUndo: () => void;
  stageScale: number;
  /**
   * 撤销按钮专用锁——只在「弹射 / 翻牌雷击」这种真在跑动画的硬锁下禁用，
   * **不**因 minimized modal 而禁用。撤销是把状态往回退、不是推进游戏，
   * 所以即使弹窗折叠也应允许玩家撤销回到弹窗出现之前。
   */
  fullBoardInteractionLocked: boolean;
}

function UndoButtonContainerInner({
  onUndo,
  stageScale,
  fullBoardInteractionLocked,
}: UndoButtonContainerProps) {
  const gs = useShallowGameState(s => ({
    showSkillSelection: s.showSkillSelection,
    undoCount: s.undoCount,
  }));

  if (gs.showSkillSelection) return null;

  return (
    <div
      className="flex-shrink-0 relative w-full pointer-events-none"
      style={{ height: 0 }}
    >
      <div
        className="absolute right-1 md:right-4 pointer-events-auto z-[9999]"
        style={{
          bottom: 0,
          transform: `translateY(50%) scale(${stageScale})`,
          transformOrigin: 'right center',
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onUndo(); }}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={gs.undoCount === 0 || fullBoardInteractionLocked}
          style={{ pointerEvents: fullBoardInteractionLocked ? 'none' : 'auto' }}
          className={`flex items-center gap-1 rounded-full px-3 py-1.5 shadow-lg transition-all select-none ${
            gs.undoCount > 0
              ? 'bg-slate-700/90 text-white hover:bg-slate-600 active:scale-95'
              : 'bg-slate-700/40 text-white/40 cursor-not-allowed'
          }`}
        >
          <Undo2 className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">撤销</span>
          {gs.undoCount > 0 && (
            <span className="bg-white/20 rounded-full px-1.5 py-0.5 text-[10px]">{gs.undoCount}</span>
          )}
        </button>
      </div>
    </div>
  );
}

export const UndoButtonContainer = memo(UndoButtonContainerInner);
