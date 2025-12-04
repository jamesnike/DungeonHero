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
}: EventDiceModalProps) {
  return (
    <Dialog open={open} onOpenChange={value => !value && onClose?.()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <DialogDescription>{subtitle ?? 'Roll the d20 to determine your fate.'}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-4">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <DiceRoller
              interactive={false}
              autoRollTrigger={autoRollTrigger}
              onRoll={onRollResult}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-3 py-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Roll Result</span>
            <Badge variant="secondary" className="text-base font-mono px-3 py-1">
              {rolledValue ?? '…'}
            </Badge>
          </div>
          <div className="space-y-2">
            {entries.map(entry => {
              const highlighted = entry.id === resolvedEntryId;
              return (
                <div
                  key={entry.id}
                  className={`rounded border px-3 py-2 text-sm transition-all ${
                    highlighted
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-foreground">
                      {formatRange(entry.range)}
                    </span>
                    <span className="font-semibold text-foreground">{entry.label}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
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

