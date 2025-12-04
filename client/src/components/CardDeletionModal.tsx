import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Backpack, Hand, Trash2 } from 'lucide-react';
import type { GameCardData } from './GameCard';

type CardSource = 'hand' | 'backpack';

interface CardDeletionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handCards: GameCardData[];
  backpackCards: GameCardData[];
  onDeleteCard: (cardId: string, source: CardSource) => void;
  title?: string;
  description?: string;
  requiredCount?: number;
  remainingCount?: number;
}

const sectionIconMap: Record<CardSource, typeof Backpack> = {
  hand: Hand,
  backpack: Backpack,
};

export default function CardDeletionModal({
  open,
  onOpenChange,
  handCards,
  backpackCards,
  onDeleteCard,
  title,
  description,
  requiredCount,
  remainingCount,
}: CardDeletionModalProps) {
  const headerTitle = title ?? '选择要删除的卡牌';
  const headerDescription =
    description ?? '删除后该卡牌会被送入坟场，无法再回到手牌或背包。';
  const renderCardSection = (title: string, cards: GameCardData[], source: CardSource) => {
    const Icon = sectionIconMap[source];
    const emptyText =
      source === 'hand' ? '当前没有手牌可以删除。' : '背包里没有可以删除的卡牌。';

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="w-4 h-4" />
          <span>
            {title}（{cards.length} 张）
          </span>
        </div>
        {cards.length === 0 ? (
          <p className="text-xs text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cards.map(card => (
              <Card
                key={`${source}-${card.id}`}
                className="flex gap-3 p-3 cursor-pointer border-border/60 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => onDeleteCard(card.id, source)}
                role="button"
                tabIndex={0}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onDeleteCard(card.id, source);
                  }
                }}
              >
                <div className="relative h-16 w-12 overflow-hidden rounded-sm bg-muted">
                  {card.image && <img src={card.image} alt={card.name} className="h-full w-full object-cover" />}
                  <Badge className="absolute top-1 right-1 text-[10px] px-1 py-0" variant="secondary">
                    {card.type.toUpperCase()}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{card.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{card.type}</p>
                  {card.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{card.description}</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-destructive" />
            {headerTitle}
          </DialogTitle>
          <DialogDescription>{headerDescription}</DialogDescription>
          {requiredCount !== undefined && remainingCount !== undefined && requiredCount > 1 && (
            <p className="text-xs text-muted-foreground">
              还需选择 {remainingCount} / {requiredCount} 张卡牌
            </p>
          )}
        </DialogHeader>

        <div className="space-y-6 py-2">
          {renderCardSection('手牌', handCards, 'hand')}
          {renderCardSection('背包', backpackCards, 'backpack')}
        </div>
      </DialogContent>
    </Dialog>
  );
}

