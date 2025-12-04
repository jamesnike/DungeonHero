import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import GameCard, { type GameCardData } from './GameCard';

interface DiscoverClassModalProps {
  open: boolean;
  cards: GameCardData[];
  onSelect: (cardId: string) => void;
  title?: string;
  description?: string;
}

export default function DiscoverClassModal({
  open,
  cards,
  onSelect,
  title,
  description,
}: DiscoverClassModalProps) {
  const headerTitle = title ?? '发现一张 Class Card';
  const headerDescription =
    description ?? '从三张候选卡中挑选一张，其余卡牌会放回 Class Deck。';

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{headerTitle}</DialogTitle>
          <DialogDescription>{headerDescription}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {cards.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground text-sm">
              暂无可发现的 Class Card
            </div>
          )}
          {cards.map(card => (
            <button
              key={card.id}
              type="button"
              className="group rounded-xl border border-card-border/70 bg-card/40 p-3 transition hover:border-primary hover:bg-primary/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              onClick={() => onSelect(card.id)}
            >
              <div className="pointer-events-none">
                <GameCard card={card} disableInteractions />
              </div>
              <span className="mt-3 block text-center text-sm font-semibold text-foreground group-hover:text-primary">
                选择这张卡
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

