import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Zap, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type GameMode = 'normal' | 'quick';

interface GameModeSelectModalProps {
  open: boolean;
  onSelect: (mode: GameMode) => void;
  onCancel: () => void;
}

export function GameModeSelectModal({ open, onSelect, onCancel }: GameModeSelectModalProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      {/*
        游戏模式选择窗口（开局必选）：必须明确选 quick / normal 才能开始游戏。
        显式关闭路径：点其中一个模式按钮 / X（→ onCancel 回标题）。
        onInteractOutside 比 onPointerDownOutside 多覆盖 focus-outside 路径。
      */}
      <DialogContent
        className="sm:max-w-lg"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-xl text-center">{t('modal.gameModeSelect.title')}</DialogTitle>
          <DialogDescription className="text-center">{t('modal.gameModeSelect.newAdventure')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <button
            className="group flex items-start gap-4 rounded-xl border-2 border-amber-500/30 bg-amber-500/5 p-5 text-left transition-all hover:border-amber-500/60 hover:bg-amber-500/10 active:scale-[0.98]"
            onClick={() => onSelect('quick')}
          >
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-500">
              <Zap className="h-5 w-5" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-base font-bold text-amber-500">{t('modal.gameModeSelect.quickMode')}</span>
              <span className="text-sm text-muted-foreground leading-relaxed">
                {t('modal.gameModeSelect.quickModeDesc')}
              </span>
            </div>
          </button>

          <button
            className="group flex items-start gap-4 rounded-xl border-2 border-sky-500/30 bg-sky-500/5 p-5 text-left transition-all hover:border-sky-500/60 hover:bg-sky-500/10 active:scale-[0.98]"
            onClick={() => onSelect('normal')}
          >
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/20 text-sky-500">
              <Shield className="h-5 w-5" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-base font-bold text-sky-500">{t('modal.gameModeSelect.normalMode')}</span>
              <span className="text-sm text-muted-foreground leading-relaxed">
                {t('modal.gameModeSelect.normalModeDesc')}
              </span>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
