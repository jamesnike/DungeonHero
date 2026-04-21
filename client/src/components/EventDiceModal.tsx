import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import DiceRoller from './DiceRoller';
import type { EventDiceRange, EventEffectExpression } from './GameCard';

interface EventDiceModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  entries: EventDiceRange[];
  rolledValue?: number | null;
  resolvedEntryId?: string | null;
  autoRollTrigger: number;
  onRollResult: (value: number) => void;
  onClose?: () => void;
  /**
   * Pre-rolled D20 from reducer's seeded RNG. When provided, the dice animation
   * will land on this value (UI is purely visual playback).
   */
  predeterminedRoll?: number | null;
}

export default function EventDiceModal({
  open,
  title,
  subtitle,
  entries,
  rolledValue,
  resolvedEntryId,
  autoRollTrigger,
  onRollResult,
  onClose,
  predeterminedRoll,
}: EventDiceModalProps) {
  return (
    <Dialog open={open} onOpenChange={value => !value && onClose?.()}>
      {/*
        事件骰窗口：reducer 的 seeded RNG 已决定结果，UI 只是回放骰动画。
        若动画期间被外点 / ESC 关掉，事件 flow 会卡住等不到 onRollResult，
        APPLY_EVENT_EFFECT 不会被触发，事件结算丢失。
        显式关闭路径：动画播完后由上层 dispatch SET_EVENT_DICE_MODAL(null)。
      */}
      <DialogContent
        className="sm:max-w-xl max-h-[95vh] overflow-y-auto overflow-x-hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <DialogDescription>{subtitle ?? 'Roll the d20 to determine your fate.'}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-4 min-w-0">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 min-h-[260px]">
            <DiceRoller
              interactive={false}
              autoRollTrigger={autoRollTrigger}
              onRoll={onRollResult}
              targetValue={predeterminedRoll ?? undefined}
              className="min-h-[220px]"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-4 py-3 text-base text-muted-foreground">
            <span className="font-semibold text-foreground text-lg">Roll Result</span>
            <Badge variant="secondary" className="text-2xl font-mono px-4 py-2">
              {rolledValue ?? '…'}
            </Badge>
          </div>
          <div className="space-y-2 min-w-0 overflow-hidden">
            {entries.map(entry => {
              const highlighted = entry.id === resolvedEntryId;
              return (
                <div
                  key={entry.id}
                  className={`rounded border px-3 py-2 text-sm transition-all min-w-0 overflow-hidden ${
                    highlighted
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="font-mono text-sm text-foreground shrink-0">
                      {formatRange(entry.range)}
                    </span>
                    <span className="font-semibold text-foreground break-words min-w-0">{entry.label}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 break-words">
                    {describeEffect(entry.effect)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatRange(range: [number, number]) {
  const [min, max] = range;
  return min === max ? `${min}` : `${min} – ${max}`;
}

function describeEffect(effect: EventEffectExpression): string {
  const tokens = Array.isArray(effect) ? effect : effect.split(',');
  return tokens
    .map(token => token.trim())
    .filter(Boolean)
    .map(token => {
      if (token.startsWith('heal+')) return `Heal ${token.replace('heal+', '')} HP`;
      if (token.startsWith('gold+')) return `Gain ${token.replace('gold+', '')} Gold`;
      if (token.startsWith('gold-')) return `Lose ${token.replace('gold-', '')} Gold`;
      if (token.startsWith('hp-')) return `Take ${token.replace('hp-', '')} damage`;
      if (token.startsWith('hp+')) return `Gain ${token.replace('hp+', '')} HP`;
      if (token.startsWith('maxhpperm+')) return `Permanent +${token.replace('maxhpperm+', '')} Max HP`;
      if (token === 'none') return 'No effect';
      return token;
    })
    .join(', ');
}

