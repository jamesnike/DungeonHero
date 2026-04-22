import { memo, useMemo, useState, startTransition, type CSSProperties } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Eye } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface ClassDeckProps {
  classCards?: GameCardData[];
  className?: string;
  deckName?: string;
  onCardSelect?: (card: GameCardData) => void;
  compact?: boolean;
  compactStyle?: CSSProperties;
}

function ClassDeckComponent({
  classCards = [],
  className = '',
  deckName = 'Knight Deck',
  onCardSelect,
  compact = false,
  compactStyle,
}: ClassDeckProps) {
  const gameViewport = useGameViewport();
  const isFlat = gameViewport.width / gameViewport.height > FLAT_ASPECT_RATIO;
  const [viewerOpen, setViewerOpen] = useState(false);

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
      {compact ? (
        <button
          onClick={() => startTransition(() => setViewerOpen(true))}
          data-testid="class-deck-compact"
          className="relative flex flex-col items-center justify-center rounded-l-lg border border-r-0 border-indigo-400/30 bg-indigo-700/20 text-indigo-300/70 hover:bg-indigo-600/30 hover:border-indigo-400/50 transition-all duration-150"
          style={compactStyle}
        >
          <Shield className="w-4 h-4" />
          {classCards.length > 0 && (
            <span className="mt-0.5 px-1 rounded text-[10px] font-bold leading-none text-white bg-indigo-500/90 ring-1 ring-indigo-200/70 shadow-sm">
              {classCards.length}
            </span>
          )}
        </button>
      ) : (
        <Card 
          className={cn(
            // overflow-visible：让 StackedCardPile 的"一摞牌"溢出 cell 上沿（与 Graveyard / Backpack 同款）。
            'relative h-full w-full cursor-pointer overflow-visible border-2 border-card-border bg-gradient-to-br from-indigo-950/70 via-indigo-900/40 to-indigo-800/30 transition-transform duration-200 hover:scale-[1.01]',
            className
          )}
          onClick={() => startTransition(() => setViewerOpen(true))}
          data-testid="class-deck"
        >
          {isFlat ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-indigo-100">
              <span className="dh-deck-label font-semibold uppercase tracking-wide">{deckName}</span>
              <span className="font-mono font-bold text-lg">{classCards.length}</span>
            </div>
          ) : (
            <>
              <StackedCardPile 
                count={classCards.length} 
                className="rounded-xl"
                variant="bright"
                label={deckName}
              />
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-1 sm:p-3">
                <div className="flex items-center justify-between dh-deck-label uppercase tracking-wide text-indigo-100">
                  <span className="font-semibold flex items-center gap-1">
                    <Shield className="dh-icon-inline text-indigo-200" />
                    {deckName}
                  </span>
                  <Badge variant="outline" className="bg-black/30 text-white font-mono dh-deck-badge px-1.5 py-0.5">
                    {classCards.length}
                  </Badge>
                </div>
                <div className="flex items-center justify-end gap-1 text-indigo-100">
                  <Eye className="dh-icon-inline" />
                  <span className="dh-deck-badge font-medium">Browse</span>
                </div>
              </div>
            </>
          )}
        </Card>
      )}

      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent
          contentMotion="fade"
          className="w-[min(90vw,42rem)] max-h-[85vh] overflow-y-auto"
          data-testid="class-deck-viewer-modal"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-6 h-6" />
              {deckName} ({classCards.length} cards)
            </DialogTitle>
            <DialogDescription>
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
                    {cards.map((card, idx) => (
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
                        </div>
                        <p className="text-xs text-center font-medium truncate">{card.name}</p>
                        {card.skillEffect && (
                          <p className="text-xs text-center text-muted-foreground truncate">
                            {card.skillEffect}
                          </p>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default memo(ClassDeckComponent);