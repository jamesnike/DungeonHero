import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CardBackDialogContent } from '@/components/ui/CardBackDialogContent';
import {
  GameCardData,
  getMagicSubtypeBracketLabel,
  formatScalingSpellDamageLine,
  useArcaneStormDamage,
  useArcaneShieldStunGain,
  waterfallsUntilBackpackFromRecycle,
} from './GameCard';
import {
  EventPatternPreview,
  MagicSpellPreview,
  isEventCardType,
  isMagicSpellCardType,
} from './MagicNameFlankIcons';
import { Backpack, Waves } from 'lucide-react';
import { useDialogOriginAnchor } from '@/hooks/use-dialog-origin-anchor';

interface BackpackViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cards: GameCardData[];
  capacity?: number;
  recycleCards?: GameCardData[];
  onCardSelect?: (card: GameCardData) => void;
}

type RowVariant = 'default' | 'recycle';

interface BackpackRowProps {
  card: GameCardData;
  variant: RowVariant;
  arcaneStormDamage: number;
  arcaneShieldStunGain: number;
  onCardSelect?: (card: GameCardData) => void;
}

/**
 * Per-card row, memoised so re-renders of the modal (e.g. unrelated parent
 * state changes after the dialog has opened) don't recreate the card DOM.
 * Each row is ~12 DOM nodes (image + svg sticker + gradients + text); the
 * modal opens with N rows committed in a single React batch, so memoising
 * cuts the per-render cost dramatically once the initial mount is done.
 */
const BackpackRow = memo(function BackpackRow({
  card,
  variant,
  arcaneStormDamage,
  arcaneShieldStunGain,
  onCardSelect,
}: BackpackRowProps) {
  const { t } = useTranslation();
  const isMagic = isMagicSpellCardType(card.type);
  const isEvent = isEventCardType(card.type);
  return (
    <Card
      className={`flex items-center gap-3 p-3 border-card-border border-2 ${
        variant === 'recycle' ? 'bg-muted/30' : ''
      } ${onCardSelect ? 'cursor-pointer hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none' : ''}`.trim()}
      onClick={() => onCardSelect?.(card)}
      role={onCardSelect ? 'button' : undefined}
      tabIndex={onCardSelect ? 0 : undefined}
      onKeyDown={event => {
        if (!onCardSelect) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onCardSelect(card);
        }
      }}
    >
      <div className="relative h-16 w-12 overflow-hidden rounded-sm bg-gradient-to-b from-muted to-card">
        {isMagic ? (
          <MagicSpellPreview
            card={card}
            aspect="none"
            lazyImage
            className="absolute inset-0 h-full w-full rounded-sm"
          />
        ) : isEvent ? (
          <EventPatternPreview
            card={card}
            aspect="none"
            lazyImage
            className="absolute inset-0 h-full w-full rounded-sm"
          />
        ) : (
          card.image && (
            <img
              src={card.image}
              alt={card.name}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              className="h-full w-full object-cover"
            />
          )
        )}
        {!isMagic && !isEvent && (
          <Badge className="absolute top-1 right-1 text-[10px] px-1 py-0">
            {card.value}
          </Badge>
        )}
      </div>
      {variant === 'recycle' && (
        <div
          className="flex shrink-0 flex-col items-center justify-center gap-0.5 text-muted-foreground"
          title={t('modal.backpackViewer.waterfallTooltip', { count: waterfallsUntilBackpackFromRecycle(card) })}
        >
          <Waves className="h-4 w-4" aria-hidden />
          <span className="text-xs font-bold tabular-nums leading-none text-foreground">
            {waterfallsUntilBackpackFromRecycle(card)}
          </span>
        </div>
      )}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{card.name}</p>
          {variant === 'recycle' && (
            <Badge variant="secondary" className="text-[10px]">
              {t('modal.backpackViewer.recycleBagTag')}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground capitalize">
          {card.type}
          {card.type === 'magic' && card.magicType && (
            <span className="ml-1 text-muted-foreground/70">
              ({getMagicSubtypeBracketLabel(card)})
            </span>
          )}
          {card.type === 'hero-magic' && <span className="ml-1 text-muted-foreground/70">{t('modal.backpackViewer.heroMagicLabel')}</span>}
        </p>
        {card.scalingDamage != null ? (
          <p className="text-xs text-muted-foreground line-clamp-3">
            {formatScalingSpellDamageLine(card.scalingDamage)}
          </p>
        ) : card.magicEffect === 'arcane-storm-magic-count' ? (
          <p className="text-xs font-semibold text-muted-foreground line-clamp-3">
            {t('modal.backpackViewer.currentDamageHint', { damage: arcaneStormDamage + (card.amplifyBonus ?? 0) })}
          </p>
        ) : card.magicEffect === 'arcane-shield-stun-cap' ? (
          <p className="text-xs font-semibold text-muted-foreground line-clamp-3">
            {t('modal.backpackViewer.currentStunCapHint', { value: arcaneShieldStunGain })}
          </p>
        ) : (
          card.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {card.description}
            </p>
          )
        )}
      </div>
    </Card>
  );
});

export default function BackpackViewerModal({
  open,
  onOpenChange,
  cards,
  capacity,
  recycleCards = [],
  onCardSelect,
}: BackpackViewerModalProps) {
  const { t } = useTranslation();
  const arcaneStormDamage = useArcaneStormDamage();
  const arcaneShieldStunGain = useArcaneShieldStunGain();

  // Sort once per cards/recycleCards change instead of on every render.
  const displayedCards = useMemo(
    () => [...cards].sort((a, b) => a.name.localeCompare(b.name)),
    [cards],
  );
  const recycleBagCards = useMemo(
    () => [...recycleCards].sort((a, b) => a.name.localeCompare(b.name)),
    [recycleCards],
  );

  // Two-step mount to keep the open click responsive.
  //
  // The previous version committed all N rows + the dialog frame in a single
  // React batch. With ~30 cards each producing ~12 DOM nodes (image + SVG
  // sticker + multiple gradient overlays), the browser had to lay out and
  // paint the entire list before the dialog became visible — this is the
  // "open the backpack feels laggy" symptom.
  //
  // Now: when `open` flips true we paint the dialog frame immediately
  // (header + scaffolding only, ~10 nodes) and defer the heavy list to the
  // next animation frame. The modal pops in instantly, then the list
  // streams in one frame later. Total wall-clock time is roughly the same,
  // but perceived latency drops to ~16ms.
  const [showContent, setShowContent] = useState(false);
  useEffect(() => {
    if (!open) {
      setShowContent(false);
      return;
    }
    if (typeof window === 'undefined') {
      setShowContent(true);
      return;
    }
    const id = window.requestAnimationFrame(() => setShowContent(true));
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const isEmpty = displayedCards.length === 0 && recycleBagCards.length === 0;
  const originRefCallback = useDialogOriginAnchor();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CardBackDialogContent
        ref={originRefCallback}
        variant="blue"
        className="w-[min(90vw,42rem)]"
        bodyClassName="max-h-[85vh] overflow-y-auto"
        contentMotion="origin"
        data-testid="backpack-viewer-modal"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Backpack className="w-5 h-5" />
            {capacity != null
              ? t('modal.backpackViewer.headerTitleWithCapacity', { count: cards.length, capacity })
              : t('modal.backpackViewer.headerTitle', { count: cards.length })}
          </DialogTitle>
          <DialogDescription className="text-white/70">{t('modal.backpackViewer.headerDescription')}</DialogDescription>
        </DialogHeader>

        {!showContent ? (
          <div className="py-8" aria-hidden />
        ) : isEmpty ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            {t('modal.backpackViewer.emptyShort')}
          </div>
        ) : (
          <div className="space-y-3">
            {displayedCards.length > 0 && (
              <div className="space-y-3">
                {displayedCards.map(card => (
                  <BackpackRow
                    key={card.id}
                    card={card}
                    variant="default"
                    arcaneStormDamage={arcaneStormDamage}
                    arcaneShieldStunGain={arcaneShieldStunGain}
                    onCardSelect={onCardSelect}
                  />
                ))}
              </div>
            )}
            {recycleBagCards.length > 0 && (
              <div className="space-y-2 border-t border-border/40 pt-3">
                <div className="flex flex-col gap-1 text-sm text-white/70">
                  <div className="font-semibold text-white">
                    {t('modal.backpackViewer.recycleSectionTitle', { count: recycleBagCards.length })}
                  </div>
                  <p>{t('modal.backpackViewer.recycleSectionHint')}</p>
                </div>
                {recycleBagCards.map(card => (
                  <BackpackRow
                    key={card.id}
                    card={card}
                    variant="recycle"
                    arcaneStormDamage={arcaneStormDamage}
                    arcaneShieldStunGain={arcaneShieldStunGain}
                    onCardSelect={onCardSelect}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </CardBackDialogContent>
    </Dialog>
  );
}
