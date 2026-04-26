import { memo, useMemo, useState, startTransition, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Eye } from 'lucide-react';
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CardBackDialogContent } from "@/components/ui/CardBackDialogContent";
import { GameCardData } from './GameCard';
import {
  EventPatternPreview,
  MagicSpellPreview,
  isEventCardType,
  isMagicSpellCardType,
} from './MagicNameFlankIcons';
import StackedCardPile from './StackedCardPile';
import { cn } from '@/lib/utils';
import { useGameViewport } from '@/contexts/GameViewportContext';
import { FLAT_ASPECT_RATIO } from './game-board/constants';
import { captureModalOriginFromEvent } from '@/lib/modalOriginAnchor';
import { useDialogOriginAnchor } from '@/hooks/use-dialog-origin-anchor';
import { getStarterBaseId } from '@/game-core/deck';

interface ClassDeckProps {
  classCards?: GameCardData[];
  className?: string;
  deckName?: string;
  onCardSelect?: (card: GameCardData) => void;
  compact?: boolean;
  compactStyle?: CSSProperties;
  /**
   * Base IDs of unique class cards already acquired this run. Used to
   * render a "已获得" overlay on the corresponding thumbnail in the viewer.
   * Optional so callers that don't care about the acquired state (e.g.
   * compact strip) can omit it.
   */
  acquiredUniqueClassCardIds?: readonly string[];
}

function ClassDeckComponent({
  classCards = [],
  className = '',
  deckName,
  onCardSelect,
  compact = false,
  compactStyle,
  acquiredUniqueClassCardIds,
}: ClassDeckProps) {
  const { t } = useTranslation();
  const acquiredUniqueSet = useMemo(
    () => new Set(acquiredUniqueClassCardIds ?? []),
    [acquiredUniqueClassCardIds],
  );
  // 默认走 i18n（"骑士牌库" / "Knight Deck"）；caller 显式传 deckName 时
  // 覆盖（未来可能有其它职业牌库）。
  const resolvedDeckName = deckName ?? t('cardBack.cell.knightDeck');
  const gameViewport = useGameViewport();
  const isFlat = gameViewport.width / gameViewport.height > FLAT_ASPECT_RATIO;
  const [viewerOpen, setViewerOpen] = useState(false);
  const originRefCallback = useDialogOriginAnchor();

  /** Capture cell rect → modal grows from this position. */
  const handleOpenViewer = (e: React.MouseEvent<HTMLElement>) => {
    captureModalOriginFromEvent(e);
    startTransition(() => setViewerOpen(true));
  };

  const groupedCards = useMemo(() => {
    return classCards.reduce((acc, card) => {
      const type = card.skillType || card.type || 'other';
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(card);
      return acc;
    }, {} as Record<string, GameCardData[]>);
  }, [classCards]);
  
  return (
    <>
      {compact ? (() => {
        // Same pattern as Graveyard/Backpack compact buttons: visible strip
        // stays narrow and flush with the screen edge (right-aligned inner
        // span owns visuals), but the click hit-area is widened leftward via
        // a transparent outer button so the narrow strip is easier to click.
        const stripWidth =
          typeof compactStyle?.width === 'number' ? compactStyle.width : 22;
        const HIT_EXTENSION_BASE = 12;
        const outerStyle: CSSProperties = {
          ...compactStyle,
          width: stripWidth + HIT_EXTENSION_BASE,
        };
        const innerStyle: CSSProperties = { width: stripWidth, height: '100%' };
        return (
          <button
            onClick={handleOpenViewer}
            data-testid="class-deck-compact"
            className="group relative flex items-stretch justify-end bg-transparent border-0 p-0 cursor-pointer"
            style={outerStyle}
          >
            <span
              className="flex flex-col items-center justify-center rounded-l-lg border border-r-0 border-indigo-400/30 bg-indigo-700/20 text-indigo-300/70 group-hover:bg-indigo-600/30 group-hover:border-indigo-400/50 transition-all duration-150"
              style={innerStyle}
            >
              <Shield className="w-4 h-4" />
              {classCards.length > 0 && (
                <span className="mt-0.5 px-1 rounded text-[10px] font-bold leading-none text-white bg-indigo-500/90 ring-1 ring-indigo-200/70 shadow-sm">
                  {classCards.length}
                </span>
              )}
            </span>
          </button>
        );
      })() : (
        <Card 
          className={cn(
            // overflow-visible：让 StackedCardPile 的"一摞牌"溢出 cell 上沿（与 Graveyard / Backpack 同款）。
            'relative h-full w-full cursor-pointer overflow-visible border-2 border-card-border bg-gradient-to-br from-indigo-950/70 via-indigo-900/40 to-indigo-800/30 transition-transform duration-200 hover:scale-[1.01]',
            className
          )}
          onClick={handleOpenViewer}
          data-testid="class-deck"
        >
          {isFlat ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-indigo-100">
              <span className="dh-deck-label font-semibold uppercase tracking-wide">{resolvedDeckName}</span>
              <span className="font-mono font-bold text-lg">{classCards.length}</span>
            </div>
          ) : (
            <>
              <StackedCardPile 
                count={classCards.length} 
                className="rounded-xl"
                variant="bright"
                label={resolvedDeckName}
              />
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-1 sm:p-3">
                <div className="flex items-center justify-between dh-deck-label uppercase tracking-wide text-indigo-100">
                  <span className="font-semibold flex items-center gap-1">
                    <Shield className="dh-icon-inline text-indigo-200" />
                    {resolvedDeckName}
                  </span>
                  <Badge variant="outline" className="bg-black/30 text-white font-mono dh-deck-badge px-1.5 py-0.5">
                    {classCards.length}
                  </Badge>
                </div>
                <div className="flex items-center justify-end gap-1 text-indigo-100">
                  <Eye className="dh-icon-inline" />
                  <span className="dh-deck-badge font-medium">{t('cardBack.cell.browse')}</span>
                </div>
              </div>
            </>
          )}
        </Card>
      )}

      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <CardBackDialogContent
          ref={originRefCallback}
          variant="bright"
          contentMotion="origin"
          className="w-[min(90vw,42rem)]"
          bodyClassName="max-h-[85vh] overflow-y-auto"
          data-testid="class-deck-viewer-modal"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Shield className="w-6 h-6" />
              {resolvedDeckName} ({classCards.length} cards)
            </DialogTitle>
            <DialogDescription className="text-white/70">
              Class-specific template pool. Cards here can be discovered and obtained any number of times — drawing or buying never depletes the pool.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {classCards.length === 0 ? (
              <div className="text-center py-8">
                <Shield className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
                <p className="text-muted-foreground">No class cards yet</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Class cards will be added as you progress
                </p>
              </div>
            ) : (
              Object.entries(groupedCards).map(([type, cards]) => (
                <div key={type}>
                  <h3 className="font-semibold mb-2 capitalize flex items-center gap-2">
                    <Badge variant="secondary">
                      {type} ({cards.length})
                    </Badge>
                  </h3>
                  <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                    {cards.map((card, idx) => {
                      const isUnique = card.unique === true;
                      const isAcquired = isUnique && acquiredUniqueSet.has(getStarterBaseId(card.id));
                      return (
                        <Card
                          key={`${card.id}-${idx}`}
                          className={`p-2 border-2 border-card-border overflow-hidden ${onCardSelect ? 'cursor-pointer hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none' : ''}`.trim()}
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
                          data-testid={isUnique ? `class-deck-card-unique-${card.name}` : undefined}
                        >
                          <div className="relative aspect-square bg-gradient-to-b from-primary/10 to-primary/5 overflow-hidden rounded-sm mb-1 [content-visibility:auto]">
                            {isMagicSpellCardType(card.type) ? (
                              <MagicSpellPreview
                                card={card}
                                aspect="none"
                                lazyImage
                                className="absolute inset-0 h-full w-full rounded-sm"
                              />
                            ) : isEventCardType(card.type) ? (
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
                            {card.skillType && (
                              <Badge
                                variant="outline"
                                className="absolute top-0 left-0 text-xs px-1 py-0"
                              >
                                {card.skillType}
                              </Badge>
                            )}
                            {isUnique && (
                              <Badge
                                variant="outline"
                                className="absolute top-0 right-0 text-[10px] px-1 py-0 bg-amber-500/90 text-white border-amber-300 font-semibold"
                                data-testid="unique-badge"
                              >
                                {t('cardBack.unique.label', '唯一')}
                              </Badge>
                            )}
                            {isAcquired && (
                              <>
                                <div className="absolute inset-0 bg-black/55" aria-hidden />
                                <span
                                  className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold tracking-wider drop-shadow"
                                  data-testid="unique-acquired-overlay"
                                >
                                  {t('cardBack.unique.acquired', '已获得')}
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-xs text-center font-medium truncate">{card.name}</p>
                          {card.skillEffect && (
                            <p className="text-xs text-center text-muted-foreground truncate">
                              {card.skillEffect}
                            </p>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardBackDialogContent>
      </Dialog>
    </>
  );
}

export default memo(ClassDeckComponent);