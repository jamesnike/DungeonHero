import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import GameCard, { type GameCardData } from './GameCard';

interface DiscoverClassModalProps {
  open: boolean;
  cards: GameCardData[];
  onSelect: (cardId: string) => void;
  onCancel?: () => void;
  /**
   * Optional: outside-click / X / ESC fold handler. When provided, the dialog's
   * built-in dismiss gestures call this instead of staying open. Mirrors the
   * Shop/Event modal "fold to bottom pill" pattern.
   */
  onMinimize?: () => void;
  title?: string;
  description?: string;
}

export default function DiscoverClassModal({
  open,
  cards,
  onSelect,
  onCancel,
  onMinimize,
  title,
  description,
}: DiscoverClassModalProps) {
  const { t } = useTranslation();
  const headerTitle = title ?? t('modal.discoverClass.title');
  const headerDescription =
    description ?? t('modal.discoverClass.description');

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && onMinimize) onMinimize();
      }}
    >
      {/*
        Layout：flex 列 + 中间区滚动 + footer 固定（仅当有 onCancel 时）。
        详见 CardDeletionModal 同款注释。
      */}
      <DialogContent className="sm:max-w-2xl max-h-[95dvh] flex flex-col p-5 sm:p-8">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{headerTitle}</DialogTitle>
          <DialogDescription>{headerDescription}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 sm:gap-4 flex-1 min-h-0 overflow-y-auto">
          {cards.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground text-sm">
              {t('modal.discoverClass.empty')}
            </div>
          )}
          {cards.map(card => (
            <button
              key={card.id}
              type="button"
              className="group rounded-xl border border-card-border/70 bg-card/40 p-1.5 sm:p-3 transition hover:border-primary hover:bg-primary/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              onClick={() => onSelect(card.id)}
            >
              <div className="pointer-events-none aspect-[3/4.2] w-full">
                <GameCard card={card} disableInteractions />
              </div>
              <span className="mt-1.5 sm:mt-3 block text-center text-xs sm:text-sm font-semibold text-foreground group-hover:text-primary">
                {t('modal.discoverClass.pickThis')}
              </span>
            </button>
          ))}
        </div>

        {onCancel && (
          <div className="flex justify-center pt-2 flex-shrink-0">
            <button
              type="button"
              className="rounded-md border border-border px-5 py-2 text-sm text-muted-foreground hover:bg-muted/60 transition-colors"
              onClick={onCancel}
            >
              {t('modal.discoverClass.cancelNoPick')}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

