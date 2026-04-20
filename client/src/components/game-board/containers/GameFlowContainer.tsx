import { memo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { useShallowGameState, useDispatch } from '@/hooks/useGameEngine';
import { useModalCallbacks } from '../contexts/ModalCallbacksContext';
import { useModalUI } from '../contexts/ModalUIContext';

import VictoryDefeatModal from '@/components/VictoryDefeatModal';
import HeroSkillSelection from '@/components/HeroSkillSelection';
import CardDraftModal from '@/components/CardDraftModal';

import type { RngState } from '@/game-core/rng';

function GameFlowContainerInner() {
  const cb = useModalCallbacks();
  const ui = useModalUI();
  const dispatch = useDispatch();

  const gs = useShallowGameState(s => ({
    gameOver: s.gameOver,
    victory: s.victory,
    gold: s.gold,
    hp: s.hp,
    monstersDefeated: s.monstersDefeated,
    totalDamageTaken: s.totalDamageTaken,
    totalHealed: s.totalHealed,
    showSkillSelection: s.showSkillSelection,
    showCardDraft: s.showCardDraft,
    cardDraftPool: s.cardDraftPool,
    deathWardPrompt: s.deathWardPrompt,
    rng: s.rng,
  }));

  const handleRngUpdate = (nextRng: RngState) => {
    dispatch({ type: 'SET_GAME_FLAGS', patch: { rng: nextRng } });
  };

  return (
    <>
      {gs.deathWardPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" style={{ pointerEvents: 'auto' }}>
          <div className="w-full max-w-2xl space-y-6 rounded-lg bg-card p-10 text-center shadow-2xl max-h-[95vh] overflow-y-auto" style={{ zoom: ui.overlayZoom }}>
            <div className="space-y-1">
              <p className="text-lg font-semibold">命悬一线</p>
              <p className="text-sm text-muted-foreground">
                正在受到 {gs.deathWardPrompt.pendingDamage} 点致命伤害，是否打出{' '}
                {gs.deathWardPrompt.card.name}？
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
                onClick={cb.onDeathWardConfirm}
              >
                抵消伤害
              </button>
              <button
                className="rounded-md border border-border px-4 py-2"
                onClick={cb.onDeathWardDecline}
              >
                放弃
              </button>
            </div>
          </div>
        </div>
      )}

      {ui.daggerSelfDestructPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" style={{ pointerEvents: 'auto' }}>
          <div className="w-full max-w-2xl space-y-6 rounded-lg bg-card p-10 text-center shadow-2xl max-h-[95vh] overflow-y-auto" style={{ zoom: ui.overlayZoom }}>
            <div className="space-y-1">
              <p className="text-lg font-semibold">自毁</p>
              <p className="text-sm text-muted-foreground">
                是否自毁 {ui.daggerSelfDestructPrompt.weaponName}？毁坏后将发现{' '}
                {ui.daggerSelfDestructPrompt.remainingDurability} 张专属牌。
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                onClick={cb.onDaggerSelfDestructConfirm}
              >
                自毁（发现 {ui.daggerSelfDestructPrompt.remainingDurability} 张）
              </button>
              <button
                className="rounded-md border border-border px-4 py-2"
                onClick={cb.onDaggerSelfDestructDecline}
              >
                保留武器
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={ui.wraithPassiveUnlockPopup} onOpenChange={cb.onWraithPassiveUnlockChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-serif text-purple-300">永恒护符·幽魂净化</DialogTitle>
            <DialogDescription className="sr-only">永恒护符解锁</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              所有幽魂已被消灭！你获得了一个新的永恒护符：
            </p>
            <div className="rounded-xl border border-purple-500/40 bg-purple-500/10 p-4">
              <div className="text-lg font-semibold text-purple-300">永恒护符·幽魂净化</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                每当玩家回合结束时，将回收袋所有牌洗回背包（无次数限制）。
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              className="rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 transition-colors"
              onClick={() => cb.onWraithPassiveUnlockChange(false)}
            >
              知道了
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <VictoryDefeatModal
        open={gs.gameOver && !ui.gameOverMinimized}
        isVictory={gs.victory}
        gold={gs.gold}
        hpRemaining={gs.hp}
        onRestart={cb.onRestart}
        onMinimize={cb.onGameOverMinimize}
        monstersDefeated={gs.monstersDefeated}
        damageTaken={gs.totalDamageTaken}
        totalHealed={gs.totalHealed}
        scaleMultiplier={ui.stageScale}
      />

      <HeroSkillSelection
        isOpen={gs.showSkillSelection}
        onSelectSkill={cb.onSkillSelection}
        classCardPreview={ui.classCardPreview}
        rng={gs.rng}
        onRngUpdate={handleRngUpdate}
      />

      {gs.showCardDraft && (
        <CardDraftModal
          isOpen={gs.showCardDraft}
          pool={gs.cardDraftPool}
          totalRounds={6}
          choicesPerRound={3}
          onComplete={cb.onCardDraftComplete}
          classCardPreview={ui.classCardPreview}
          roundTypes={['potion','equipment','amulet','general','general','general']}
          rng={gs.rng}
          onRngUpdate={handleRngUpdate}
        />
      )}
    </>
  );
}

export const GameFlowContainer = memo(GameFlowContainerInner);
