import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import DiceRoller from './DiceRoller';

interface CombatDiceModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  roll: number;
  threshold: number;
  success: boolean;
  /** Increment to trigger a new roll animation. */
  autoRollTrigger: number;
  /** Called when the dice animation finishes and the value is shown. */
  onRollResult?: (value: number) => void;
}

export default function CombatDiceModal({
  open,
  title,
  subtitle,
  roll,
  threshold,
  success,
  autoRollTrigger,
  onRollResult,
}: CombatDiceModalProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open}>
      {/*
        战斗骰窗口：reducer 已经决定了结果，UI 只是回放骰动画。
        但若在动画期间被外点 / ESC 关掉，上层等待 onRollResult 的流程会卡死
        （combat:weaponDiceRoll → 命中判定 → APPLY_HERO_KILL_EFFECTS）。
        所有显式关闭路径：动画播完后 reducer 自己 SET_COMBAT_DICE_MODAL(null)。
        onInteractOutside 同时覆盖 pointer 与 focus outside（比 onPointerDownOutside 更全）。
      */}
      <DialogContent
        className="sm:max-w-md max-h-[95vh] overflow-y-auto overflow-x-hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <DialogDescription>{subtitle ?? t('modal.combatDice.defaultSubtitle')}</DialogDescription>
        </DialogHeader>

        <div className="mt-2 grid gap-3 min-w-0">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 min-h-[220px]">
            <DiceRoller
              interactive={false}
              autoRollTrigger={autoRollTrigger}
              targetValue={roll}
              onRoll={onRollResult}
              className="min-h-[200px]"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-4 py-2 text-base text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">{t('modal.combatDice.rollResult')}</span>
              <span className="text-xs text-muted-foreground">{t('modal.combatDice.thresholdHint', { threshold })}</span>
            </div>
            <Badge
              variant="secondary"
              className={`text-2xl font-mono px-4 py-2 ${
                success
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                  : 'bg-rose-500/15 text-rose-300 border border-rose-500/40'
              }`}
            >
              {roll} — {success ? t('modal.combatDice.success') : t('modal.combatDice.fail')}
            </Badge>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
