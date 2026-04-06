import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Backpack, Hand, Recycle, Shield, Sparkles, Trash2 } from 'lucide-react';
import type { GameCardData } from './GameCard';
import type { CardActionKeyword } from './game-board/types';
import {
  EventPatternPreview,
  MagicSpellPreview,
  isEventCardType,
  isMagicSpellCardType,
} from './MagicNameFlankIcons';
import { isRecyclableFromHand } from '@/game-core/helpers';

export type CardSource = 'hand' | 'backpack' | 'recycleBag' | 'equipment' | 'amulet';

interface CardDeletionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handCards: GameCardData[];
  backpackCards: GameCardData[];
  recycleBagCards?: GameCardData[];
  equipmentCards?: GameCardData[];
  amuletCards?: GameCardData[];
  keyword?: CardActionKeyword;
  onDeleteCard: (cardId: string, source: CardSource) => void;
  title?: string;
  description?: string;
  requiredCount?: number;
  remainingCount?: number;
  handOnly?: boolean;
}

const sectionIconMap: Record<CardSource, typeof Backpack> = {
  hand: Hand,
  backpack: Backpack,
  recycleBag: Recycle,
  equipment: Shield,
  amulet: Sparkles,
};

export default function CardDeletionModal({
  open,
  onOpenChange,
  handCards,
  backpackCards,
  recycleBagCards = [],
  equipmentCards = [],
  amuletCards = [],
  keyword = 'delete',
  onDeleteCard,
  title,
  description,
  requiredCount,
  remainingCount,
  handOnly,
}: CardDeletionModalProps) {
  const headerTitle = title ?? '选择要删除的卡牌';
  const headerDescription =
    description ?? '删除后该卡牌会被送入坟场，无法再回到手牌或背包。';

  const filterByKeyword = (cards: GameCardData[]): GameCardData[] => {
    let next: GameCardData[];
    if (keyword === 'discard-only') next = cards.filter(c => !isRecyclableFromHand(c));
    else if (keyword === 'recycle-only') next = cards.filter(isRecyclableFromHand);
    else next = cards;
    if (keyword === 'discard-recycle') {
      return [...next].sort(
        (a, b) => Number(isRecyclableFromHand(a)) - Number(isRecyclableFromHand(b)),
      );
    }
    return next;
  };

  const renderCardSection = (sectionTitle: string, cards: GameCardData[], source: CardSource) => {
    const Icon = sectionIconMap[source];
    const filtered = filterByKeyword(cards);
    const emptyText =
      source === 'hand'
        ? '当前没有手牌可以选择。'
        : source === 'backpack'
          ? '背包里没有可以选择的卡牌。'
          : source === 'recycleBag'
            ? '回收袋里没有可以选择的卡牌。'
            : source === 'equipment'
              ? '装备栏没有可以选择的卡牌。'
              : '护符栏没有可以选择的卡牌。';

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="w-4 h-4" />
          <span>
            {sectionTitle}（{filtered.length} 张）
          </span>
        </div>
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filtered.map(card => (
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
                  {isMagicSpellCardType(card.type) ? (
                    <MagicSpellPreview card={card} aspect="none" className="absolute inset-0 h-full w-full rounded-sm" />
                  ) : isEventCardType(card.type) ? (
                    <EventPatternPreview card={card} aspect="none" className="absolute inset-0 h-full w-full rounded-sm" />
                  ) : (
                    card.image && <img src={card.image} alt={card.name} className="h-full w-full object-cover" />
                  )}
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

  const showEquipment = !handOnly && (keyword !== 'delete' || true);
  const showAmulet = !handOnly && (keyword !== 'delete' || true);
  const showBackpack = !handOnly && keyword === 'delete';
  const showRecycleBag = !handOnly && keyword === 'delete';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto" overlayClassName="bg-black/30">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-destructive" />
            {headerTitle}
          </DialogTitle>
          <DialogDescription>
            {headerDescription}
            {keyword === 'discard-recycle' && (
              <span className="mt-2 block text-xs text-muted-foreground">
                可弃置进坟场的牌会排在前面；Perm 类牌仍会进入回收袋。
              </span>
            )}
          </DialogDescription>
          {requiredCount !== undefined && remainingCount !== undefined && requiredCount > 1 && (
            <p className="text-xs text-muted-foreground">
              还需选择 {remainingCount} / {requiredCount} 张卡牌
            </p>
          )}
        </DialogHeader>

        <div className="space-y-6 py-2">
          {renderCardSection('手牌', handCards, 'hand')}
          {showEquipment && equipmentCards.length > 0 && renderCardSection('装备栏', equipmentCards, 'equipment')}
          {showAmulet && amuletCards.length > 0 && renderCardSection('护符栏', amuletCards, 'amulet')}
          {showBackpack && renderCardSection('背包', backpackCards, 'backpack')}
          {showRecycleBag && recycleBagCards.length > 0 && renderCardSection('回收袋', recycleBagCards, 'recycleBag')}
        </div>
      </DialogContent>
    </Dialog>
  );
}
