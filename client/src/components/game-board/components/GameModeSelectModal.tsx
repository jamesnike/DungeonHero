import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Zap, Users, FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type GameMode = 'single' | 'multiplayer';
/**
 * Phase-3 dev-only side channel: "Local 2-Player (BroadcastChannel)" lets a
 * developer prototype the multiplayer flow on a single browser by opening
 * two tabs and picking opposite roles. Production builds (`!import.meta.env.DEV`)
 * never expose this option.
 */
export type LocalRolePick = 'local-A' | 'local-B';

interface GameModeSelectModalProps {
  open: boolean;
  onSelect: (mode: GameMode) => void;
  /** Phase-3 dev hook. Omitted in production. */
  onLocalRolePick?: (role: LocalRolePick) => void;
  onCancel: () => void;
}

export function GameModeSelectModal({ open, onSelect, onLocalRolePick, onCancel }: GameModeSelectModalProps) {
  const { t } = useTranslation();
  // Vite injects `import.meta.env.DEV === true` only in dev / vitest builds.
  // We branch on it (rather than feature-detecting BroadcastChannel) so
  // production users never accidentally see a debug entry.
  const showDevLocal2P = import.meta.env.DEV && typeof onLocalRolePick === 'function';
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      {/*
        游戏模式选择窗口（开局必选）：必须明确选 single / multiplayer 才能开始游戏。
        显式关闭路径：点其中一个模式按钮 / X（→ onCancel 回标题）。
        onInteractOutside 比 onPointerDownOutside 多覆盖 focus-outside 路径。

        两个模式共用同一套底层 deck 规则（36 张 / 1 monster/chunk）：
        - single        — 单人，行为与旧 'quick' 完全一致
        - multiplayer   — 双人异步，落地后会跳到 MultiplayerLobby（阶段 5）
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
            onClick={() => onSelect('single')}
          >
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-500">
              <Zap className="h-5 w-5" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-base font-bold text-amber-500">{t('modal.gameModeSelect.singleMode')}</span>
              <span className="text-sm text-muted-foreground leading-relaxed">
                {t('modal.gameModeSelect.singleModeDesc')}
              </span>
            </div>
          </button>

          <button
            className="group flex items-start gap-4 rounded-xl border-2 border-violet-500/30 bg-violet-500/5 p-5 text-left transition-all hover:border-violet-500/60 hover:bg-violet-500/10 active:scale-[0.98]"
            onClick={() => onSelect('multiplayer')}
          >
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 text-violet-500">
              <Users className="h-5 w-5" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-base font-bold text-violet-500">{t('modal.gameModeSelect.multiplayerMode')}</span>
              <span className="text-sm text-muted-foreground leading-relaxed">
                {t('modal.gameModeSelect.multiplayerModeDesc')}
              </span>
            </div>
          </button>

          {/*
            Dev-only Phase-3 entry point. Open this modal in two tabs of the
            same browser, pick role A in one and role B in the other, and the
            BroadcastChannel-backed `useMultiplayerSync` hook will forward
            transferOut/receive events between them so you can validate the
            shared-suffix deck mechanics end-to-end without any server.
          */}
          {showDevLocal2P && (
            <div className="mt-2 rounded-lg border border-dashed border-zinc-500/40 bg-zinc-500/5 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                <FlaskConical className="h-3.5 w-3.5" />
                <span>Dev · Local 2-Player (BroadcastChannel)</span>
              </div>
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
                  onClick={() => onLocalRolePick?.('local-A')}
                >
                  Open as Role A
                </button>
                <button
                  className="flex-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-medium text-sky-300 transition-colors hover:bg-sky-500/20"
                  onClick={() => onLocalRolePick?.('local-B')}
                >
                  Open as Role B
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                Open this same page in another tab and click the opposite role.
                Cards waterfalled in one tab will appear at the deck top of the
                other.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
