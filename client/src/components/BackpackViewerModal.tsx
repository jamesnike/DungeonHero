import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GameCardData } from './GameCard';
import { Backpack } from 'lucide-react';

interface BackpackViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cards: GameCardData[];
  recycleCards?: GameCardData[];
  onCardSelect?: (card: GameCardData) => void;
}

export default function BackpackViewerModal({
  open,
  onOpenChange,
  cards,
  recycleCards = [],
  onCardSelect,
}: BackpackViewerModalProps) {
  const displayedCards = [...cards].sort((a, b) => a.name.localeCompare(b.name)); // Backpack is unordered
  const recycleBagCards = [...recycleCards].sort((a, b) => a.name.localeCompare(b.name));

  const renderCardRow = (card: GameCardData, variant: 'default' | 'recycle' = 'default') => (
    <Card
      key={card.id}
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
        {card.image && (
          <img
            src={card.image}
            alt={card.name}
            className="h-full w-full object-cover"
          />
        )}
        <Badge className="absolute top-1 right-1 text-[10px] px-1 py-0">
          {card.value}
        </Badge>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{card.name}</p>
          {variant === 'recycle' && (
            <Badge variant="secondary" className="text-[10px]">
              回收袋
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground capitalize">{card.type}</p>
        {card.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {card.description}
          </p>
        )}
      </div>
    </Card>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="backpack-viewer-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Backpack className="w-5 h-5" />
            背包 ({cards.length} 张)
          </DialogTitle>
          <DialogDescription>背包中的卡牌为无序存放，抽牌时会随机选择</DialogDescription>
        </DialogHeader>

        {displayedCards.length === 0 && recycleBagCards.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            背包里还没有任何卡牌
          </div>
        ) : (
          <div className="space-y-3">
            {displayedCards.length > 0 && (
              <div className="space-y-3">
                {displayedCards.map(card => renderCardRow(card))}
              </div>
            )}
            {recycleBagCards.length > 0 && (
              <div className="space-y-2 border-t border-border/40 pt-3">
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <div className="font-semibold text-foreground">
                    回收袋 ({recycleBagCards.length} 张)
                  </div>
                  <p>这些卡牌会在下一次瀑布开始时返回背包。</p>
                </div>
                {recycleBagCards.map(card => renderCardRow(card, 'recycle'))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

