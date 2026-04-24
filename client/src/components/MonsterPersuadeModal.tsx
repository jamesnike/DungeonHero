import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import DiceRoller from './DiceRoller';
import GameCard, { type GameCardData } from './GameCard';
import { Coins, Target, Sparkles, X } from 'lucide-react';

export type PersuadePhase = 'confirm' | 'rolling' | 'result';

interface MonsterPersuadeModalProps {
  open: boolean;
  monster: GameCardData | null;
  gold: number;
  cost: number;
  threshold: number;
  successRate: number;
  targetLabel: string;
  phase: PersuadePhase;
  diceValue: number | null;
  success: boolean | null;
  autoRollTrigger: number;
  persuadeLevel: number;
  onConfirm: () => void;
  onDiceResult: (value: number) => void;
  onClose: () => void;
}

export default function MonsterPersuadeModal({
  open,
  monster,
  gold,
  cost,
  threshold,
  successRate,
  targetLabel,
  phase,
  diceValue,
  success,
  autoRollTrigger,
  persuadeLevel,
  onConfirm,
  onDiceResult,
  onClose,
}: MonsterPersuadeModalProps) {
  const { t } = useTranslation();
  if (!monster) return null;

  const canAfford = gold >= cost;
  const monsterAttack = monster.attack ?? monster.value;
  const monsterHp = monster.hp ?? monster.value;
  const monsterHpLayers = monster.hpLayers ?? monster.fury ?? 1;

  return (
    <Dialog open={open} onOpenChange={value => { if (!value && phase !== 'rolling') onClose(); }}>
      {/*
        劝降弹窗：
        - confirm 阶段：玩家必须明确点"确认劝降"或"取消"按钮
        - rolling 阶段：等骰动画结束，不可关闭（onOpenChange 已 guard）
        - result 阶段：必须点"确定"按钮收尾，让 reducer 完成 persuade flow 收束
        外点 / ESC 误关会让 pendingPersuade 状态卡住或丢失。
        显式关闭路径："确认劝降" / "取消" / "确定" / X。
      */}
      <DialogContent
        className="sm:max-w-md max-h-[95vh] overflow-y-auto persuade-modal"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Target className="w-5 h-5 text-amber-500" />
            {t('modal.monsterPersuade.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 grid gap-4">
          {/* Monster preview */}
          <div className="flex items-center justify-center">
            <div className="persuade-monster-preview">
              <GameCard card={monster} disableInteractions />
            </div>
          </div>

          {phase === 'confirm' && (
            <>
              {/* Cost & success rate info */}
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded border border-border px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="w-4 h-4 text-purple-500" />
                    {t('modal.monsterPersuade.levelLabel')}
                  </span>
                  <Badge variant="secondary" className="text-base font-mono px-3 py-1 text-purple-600">
                    Lv.{persuadeLevel}
                    <span className="text-xs text-muted-foreground ml-1">{t('modal.monsterPersuade.levelHint', { level: persuadeLevel })}</span>
                  </Badge>
                </div>

                <div className="flex items-center justify-between rounded border border-border px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Coins className="w-4 h-4 text-amber-500" />
                    {t('modal.monsterPersuade.costLabel')}
                  </span>
                  <Badge variant="secondary" className="text-base font-mono px-3 py-1">
                    {t('modal.monsterPersuade.goldUnit', { count: cost })}
                  </Badge>
                </div>

                <div className="flex items-center justify-between rounded border border-border px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Target className="w-4 h-4 text-sky-500" />
                    {t('modal.monsterPersuade.rateLabel')}
                  </span>
                  <Badge
                    variant="secondary"
                    className={`text-base font-mono px-3 py-1 ${
                      successRate >= 60
                        ? 'text-emerald-600'
                        : successRate >= 30
                          ? 'text-amber-600'
                          : 'text-red-500'
                    }`}
                  >
                    {Math.round(successRate)}%
                  </Badge>
                </div>

                <div className="rounded border border-border/60 bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                  <p>{t('modal.monsterPersuade.rollHint', { threshold })}</p>
                  {monster.isStunned && (
                    <p className="mt-1 text-yellow-600 dark:text-yellow-400 font-medium">
                      {t('modal.monsterPersuade.stunnedHint')}
                    </p>
                  )}
                  <p className="mt-1">
                    {t('modal.monsterPersuade.successHint', { name: monster.name, layers: monsterHpLayers })}
                  </p>
                  <p className="mt-1 text-amber-600 dark:text-amber-400 font-medium">
                    {t('modal.monsterPersuade.equipHint')}
                  </p>
                  <p className="mt-1 text-sky-600 dark:text-sky-400 font-medium">
                    {t('modal.monsterPersuade.rageReleaseHint')}
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  onClick={onConfirm}
                  disabled={!canAfford}
                >
                  <Coins className="w-4 h-4 mr-1" />
                  {canAfford
                    ? t('modal.monsterPersuade.confirmWithCost', { cost })
                    : t('modal.monsterPersuade.notEnoughGoldNeed', { cost })}
                </Button>
                <Button variant="outline" onClick={onClose}>
                  {t('common.cancel')}
                </Button>
              </div>
            </>
          )}

          {(phase === 'rolling' || phase === 'result') && (
            <>
              {/* Dice roller */}
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 min-h-[220px]">
                <DiceRoller
                  interactive={false}
                  autoRollTrigger={autoRollTrigger}
                  onRoll={onDiceResult}
                  className="min-h-[180px]"
                />
              </div>

              {/* Result display */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-4 py-3 text-base text-muted-foreground">
                <span className="font-semibold text-foreground text-lg">{t('modal.monsterPersuade.rollResult')}</span>
                <Badge variant="secondary" className="text-2xl font-mono px-4 py-2">
                  {diceValue ?? '…'}
                </Badge>
              </div>

              <div className="flex items-center justify-between rounded border border-border/60 px-4 py-2 text-sm">
                <span>{t('modal.monsterPersuade.needLabel', { threshold })}</span>
                {diceValue !== null && (
                  <span className={`font-semibold ${success ? 'text-emerald-500' : 'text-red-500'}`}>
                    {success ? t('modal.monsterPersuade.rollSuccess') : t('modal.monsterPersuade.rollFail')}
                  </span>
                )}
              </div>

              {phase === 'result' && (
                <div className={`rounded-lg border-2 p-4 text-center ${
                  success
                    ? 'border-emerald-500/50 bg-emerald-500/10'
                    : 'border-red-500/50 bg-red-500/10'
                }`}>
                  {success ? (
                    <div className="space-y-1">
                      <p className="flex items-center justify-center gap-2 text-lg font-semibold text-emerald-600">
                        <Sparkles className="w-5 h-5" />
                        {t('modal.monsterPersuade.persuadeSuccess')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t('modal.monsterPersuade.joinedTarget', {
                          name: monster.name,
                          target: targetLabel,
                          attack: monsterAttack,
                          hp: monsterHp,
                          layers: monsterHpLayers,
                        })}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="flex items-center justify-center gap-2 text-lg font-semibold text-red-500">
                        <X className="w-5 h-5" />
                        {t('modal.monsterPersuade.persuadeFail')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t('modal.monsterPersuade.refused', { name: monster.name, cost })}
                      </p>
                      <p className="text-xs text-sky-500 mt-1">
                        {t('modal.monsterPersuade.calmedDown', { name: monster.name })}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {phase === 'result' && (
                <Button className="w-full" onClick={onClose}>
                  {t('modal.monsterPersuade.ok')}
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
