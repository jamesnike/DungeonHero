import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  onConfirm,
  onDiceResult,
  onClose,
}: MonsterPersuadeModalProps) {
  if (!monster) return null;

  const canAfford = gold >= cost;
  const monsterAttack = monster.attack ?? monster.value;
  const monsterHp = monster.hp ?? monster.value;
  const monsterHpLayers = monster.hpLayers ?? monster.fury ?? 1;

  return (
    <Dialog open={open} onOpenChange={value => { if (!value && phase !== 'rolling') onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[95vh] overflow-y-auto persuade-modal">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Target className="w-5 h-5 text-amber-500" />
            劝降
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
                    <Coins className="w-4 h-4 text-amber-500" />
                    劝降费用
                  </span>
                  <Badge variant="secondary" className="text-base font-mono px-3 py-1">
                    {cost} 金币
                  </Badge>
                </div>

                <div className="flex items-center justify-between rounded border border-border px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Target className="w-4 h-4 text-sky-500" />
                    成功概率
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
                  <p>投掷 d20 骰子，掷出 <span className="font-mono font-semibold text-foreground">{threshold}</span> 或更高即劝降成功。</p>
                  <p className="mt-1">
                    成功后 {monster.name} 将进入{targetLabel}
                    {targetLabel === '背包' ? '' : '（装备）'}
                    ，血层转换为耐久（{monsterHpLayers}层 → {monsterHpLayers}耐久）。
                  </p>
                  <p className="mt-1 text-amber-600 dark:text-amber-400 font-medium">
                    怪物原有能力将转化为对应的装备效果。
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
                  {canAfford ? `确认劝降（${cost}金币）` : `金币不足（需要${cost}）`}
                </Button>
                <Button variant="outline" onClick={onClose}>
                  取消
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
                <span className="font-semibold text-foreground text-lg">掷骰结果</span>
                <Badge variant="secondary" className="text-2xl font-mono px-4 py-2">
                  {diceValue ?? '…'}
                </Badge>
              </div>

              <div className="flex items-center justify-between rounded border border-border/60 px-4 py-2 text-sm">
                <span>需要 ≥ {threshold}</span>
                {diceValue !== null && (
                  <span className={`font-semibold ${success ? 'text-emerald-500' : 'text-red-500'}`}>
                    {success ? '成功！' : '失败'}
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
                        劝降成功！
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {monster.name} 已加入{targetLabel}！
                        （{monsterAttack}攻 / {monsterHp}防 / {monsterHpLayers}耐久）
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="flex items-center justify-center gap-2 text-lg font-semibold text-red-500">
                        <X className="w-5 h-5" />
                        劝降失败
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {monster.name} 拒绝了你的劝降，{cost} 金币已消耗。
                      </p>
                    </div>
                  )}
                </div>
              )}

              {phase === 'result' && (
                <Button className="w-full" onClick={onClose}>
                  确定
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
