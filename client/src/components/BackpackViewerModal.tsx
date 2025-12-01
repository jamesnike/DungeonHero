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
  onCardSelect?: (card: GameCardData) => void;
}

export default function BackpackViewerModal({
  open,
  onOpenChange,
  cards,
  onCardSelect,
}: BackpackViewerModalProps) {
  const orderedCards = [...cards].reverse(); // Top of stack first

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="backpack-viewer-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Backpack className="w-5 h-5" />
            背包 ({cards.length} 张)
          </DialogTitle>
          <DialogDescription>从上到下展示背包中的所有卡牌</DialogDescription>
        </DialogHeader>

        {cards.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            背包里还没有任何卡牌
          </div>
        ) : (
          <div className="space-y-3">
            {orderedCards.map((card, index) => (
              <Card
                key={`${card.id}-${index}`}
                className={`flex items-center gap-3 p-3 border-card-border border-2 ${onCardSelect ? 'cursor-pointer hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none' : ''}`.trim()}
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
                    {index === 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        下一张可抽
                      </Badge>
                    )}
                    {index === orderedCards.length - 1 && (
                      <Badge variant="outline" className="text-[10px]">
                        背包底部
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
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

