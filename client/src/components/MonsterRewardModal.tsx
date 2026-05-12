import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type MonsterRewardModalOption = {
  id: string;
  title: string;
  description: string;
  detail?: string;
};

interface MonsterRewardModalProps {
  open: boolean;
  monsterName: string;
  options: MonsterRewardModalOption[];
  onSelect: (optionId: string) => void;
  /**
   * Optional: outside-click / X / ESC fold handler. When provided, the dialog's
   * built-in dismiss gestures call this instead of staying open. Mirrors the
   * Shop/Event modal "fold to bottom pill" pattern.
   */
  onMinimize?: () => void;
}

export default function MonsterRewardModal({ open, monsterName, options, onSelect, onMinimize }: MonsterRewardModalProps) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && onMinimize) onMinimize();
      }}
    >
      <DialogContent className="sm:max-w-xl max-h-[95dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-400" />
            {t('modal.monsterReward.title')}
          </DialogTitle>
          <DialogDescription>{t('modal.monsterReward.subtitleAfterDefeat', { name: monsterName })}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-3">
          {options.map(option => (
            <Button
              key={option.id}
              variant="outline"
              className="h-auto w-full justify-start rounded-xl border-primary/40 bg-gradient-to-br from-purple-600/10 via-transparent to-amber-500/5 p-4 text-left hover:border-primary hover:bg-primary/5"
              onClick={() => onSelect(option.id)}
            >
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-base">{option.title}</span>
                  {option.detail && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-primary">
                      {option.detail}
                    </span>
                  )}
                </div>
                <span className="text-sm text-muted-foreground">{option.description}</span>
              </div>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
