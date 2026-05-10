/**
 * CardStampBubble — small overlay shown on a card cell when other players
 * have left stamps for the same row signature.
 *
 * The "summary" view shows the most-used preset's emoji + total preset count
 * (e.g. `💀 7`) plus a `💬N` indicator if any freeform messages exist. Tapping
 * the bubble opens a Radix Popover breakdown listing all 6 preset rows with
 * counts plus up to 20 most-recent freeform messages.
 */

import { useMemo, useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  STAMP_DEFINITIONS,
  type CardStampEntry,
  type PresetStampId,
} from '@/lib/cardStamps';

interface CardStampBubbleProps {
  entry: CardStampEntry;
  className?: string;
}

function formatRelativeTime(iso: string, t: (key: string, defaultValue?: string, options?: Record<string, unknown>) => string): string {
  try {
    const date = new Date(iso).getTime();
    if (Number.isNaN(date)) return '';
    const delta = Date.now() - date;
    const seconds = Math.max(0, Math.floor(delta / 1000));
    if (seconds < 60) return t('cardStamps.relTime.justNow', '刚刚');
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t('cardStamps.relTime.minutes', '{{n}}分钟前', { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('cardStamps.relTime.hours', '{{n}}小时前', { n: hours });
    const days = Math.floor(hours / 24);
    if (days < 30) return t('cardStamps.relTime.days', '{{n}}天前', { n: days });
    return new Date(iso).toLocaleDateString();
  } catch {
    return '';
  }
}

export function CardStampBubble(props: CardStampBubbleProps) {
  const { entry, className } = props;
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const { topPresetEmoji, totalPresetCount, freeformCount } = useMemo(() => {
    let topId: PresetStampId | null = null;
    let topCount = 0;
    let total = 0;
    for (const def of STAMP_DEFINITIONS) {
      const c = entry.stampCounts[def.id] ?? 0;
      total += c;
      if (c > topCount) {
        topCount = c;
        topId = def.id;
      }
    }
    const top = topId ? STAMP_DEFINITIONS.find(d => d.id === topId) : null;
    return {
      topPresetEmoji: top?.emoji ?? null,
      totalPresetCount: total,
      freeformCount: entry.freeform.length,
    };
  }, [entry]);

  const hasPreset = totalPresetCount > 0;
  const hasFreeform = freeformCount > 0;
  if (!hasPreset && !hasFreeform) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            setOpen(o => !o);
          }}
          // Suppress drag-from-card interference: stamps are pure UI overlay.
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          className={cn(
            'pointer-events-auto absolute right-1 top-1 z-30',
            'flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5',
            'text-[10px] leading-none text-white shadow-md backdrop-blur-sm',
            'transition hover:bg-black/85 active:scale-95',
            className,
          )}
          aria-label={t('cardStamps.bubble.aria', '查看卡牌留言')}
        >
          {hasPreset && topPresetEmoji && (
            <span className="flex items-center gap-0.5">
              <span className="text-xs leading-none">{topPresetEmoji}</span>
              <span className="font-semibold">{totalPresetCount}</span>
            </span>
          )}
          {hasFreeform && (
            <span className="flex items-center gap-0.5">
              <span className="text-xs leading-none">💬</span>
              <span className="font-semibold">{freeformCount}</span>
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={6}
        className="w-72 p-3"
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
      >
        <div className="space-y-2">
          {/* Preset breakdown */}
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('cardStamps.breakdown.presetsHeader', '玩家评价')}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {STAMP_DEFINITIONS.map(def => {
                const c = entry.stampCounts[def.id] ?? 0;
                return (
                  <div
                    key={def.id}
                    className={cn(
                      'flex items-center gap-1 rounded px-1.5 py-1 text-xs',
                      c > 0 ? 'bg-accent/60' : 'opacity-50',
                    )}
                    title={t(def.i18nKey, def.labelZh)}
                  >
                    <span className="text-base leading-none">{def.emoji}</span>
                    <span className="font-semibold tabular-nums">{c}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Freeform list */}
          {hasFreeform && (
            <div>
              <div className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('cardStamps.breakdown.messagesHeader', '玩家留言')}
              </div>
              <ul className="max-h-48 overflow-y-auto pr-1">
                {entry.freeform.map(msg => (
                  <li key={msg.id} className="border-b border-border/40 py-1.5 text-xs last:border-b-0">
                    <div className="break-words leading-snug">{msg.message}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {formatRelativeTime(msg.createdAt, t)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
