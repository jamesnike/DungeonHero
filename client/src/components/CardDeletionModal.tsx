import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Backpack, Check, Hand, Recycle, Shield, Sparkles, Trash2 } from 'lucide-react';
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

export type CardDeletionSelection = { cardId: string; source: CardSource };

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
  selectionMode?: 'each' | 'batch';
  maxCount?: number;
  onBatchConfirm?: (selections: CardDeletionSelection[]) => void;
}

const sectionIconMap: Record<CardSource, typeof Backpack> = {
  hand: Hand,
  backpack: Backpack,
  recycleBag: Recycle,
  equipment: Shield,
  amulet: Sparkles,
};

const KEYWORD_LABEL_KEY: Record<CardActionKeyword, string> = {
  delete: 'modal.cardDeletion.keywordDelete',
  'discard-only': 'modal.cardDeletion.keywordDiscardOnly',
  'recycle-only': 'modal.cardDeletion.keywordRecycleOnly',
  'discard-recycle': 'modal.cardDeletion.keywordDiscardRecycle',
  'move-to': 'modal.cardDeletion.keywordMoveTo',
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
  selectionMode = 'each',
  maxCount,
  onBatchConfirm,
}: CardDeletionModalProps) {
  const { t } = useTranslation();
  const isBatch = selectionMode === 'batch' && !!onBatchConfirm;
  const batchMax = maxCount ?? requiredCount ?? 1;

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (open) {
      setSelectedKeys(new Set());
    }
  }, [open]);

  const headerTitle = title ?? t('modal.cardDeletion.defaultTitle');
  const headerDescription =
    description ?? t('modal.cardDeletion.defaultDescription');

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

  const keyOf = (source: CardSource, cardId: string) => `${source}:${cardId}`;

  const sourceLookup = useMemo(() => {
    const map = new Map<string, { card: GameCardData; source: CardSource }>();
    const add = (cards: GameCardData[], source: CardSource) => {
      for (const c of cards) map.set(keyOf(source, c.id), { card: c, source });
    };
    add(handCards, 'hand');
    add(backpackCards, 'backpack');
    add(recycleBagCards, 'recycleBag');
    add(equipmentCards, 'equipment');
    add(amuletCards, 'amulet');
    return map;
  }, [handCards, backpackCards, recycleBagCards, equipmentCards, amuletCards]);

  const handleCardClick = (cardId: string, source: CardSource) => {
    if (!isBatch) {
      onDeleteCard(cardId, source);
      return;
    }
    const k = keyOf(source, cardId);
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(k)) {
        next.delete(k);
      } else {
        if (next.size >= batchMax) return prev;
        next.add(k);
      }
      return next;
    });
  };

  const renderCardSection = (sectionTitle: string, cards: GameCardData[], source: CardSource) => {
    const Icon = sectionIconMap[source];
    const filtered = filterByKeyword(cards);
    const emptyText =
      source === 'hand'
        ? t('modal.cardDeletion.emptyHand')
        : source === 'backpack'
          ? t('modal.cardDeletion.emptyBackpack')
          : source === 'recycleBag'
            ? t('modal.cardDeletion.emptyRecycleBag')
            : source === 'equipment'
              ? t('modal.cardDeletion.emptyEquipment')
              : t('modal.cardDeletion.emptyAmulet');

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="w-4 h-4" />
          <span>
            {t('modal.cardDeletion.sectionCount', { name: sectionTitle, count: filtered.length })}
          </span>
        </div>
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filtered.map(card => {
              const k = keyOf(source, card.id);
              const isSelected = isBatch && selectedKeys.has(k);
              const reachedMax = isBatch && !isSelected && selectedKeys.size >= batchMax;
              return (
                <Card
                  key={`${source}-${card.id}`}
                  className={`relative flex gap-3 p-3 cursor-pointer border-border/60 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                    isSelected ? 'ring-2 ring-destructive bg-destructive/10' : ''
                  } ${reachedMax ? 'opacity-50' : ''}`}
                  onClick={() => handleCardClick(card.id, source)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleCardClick(card.id, source);
                    }
                  }}
                >
                  {isSelected && (
                    <div className="absolute top-1 left-1 rounded-full bg-destructive text-destructive-foreground p-0.5">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
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
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const showEquipment = !handOnly && (keyword !== 'delete' || true);
  const showAmulet = !handOnly && (keyword !== 'delete' || true);
  const showBackpack = !handOnly && keyword === 'delete';
  const showRecycleBag = !handOnly && keyword === 'delete';

  const confirmLabel = KEYWORD_LABEL_KEY[keyword] ? t(KEYWORD_LABEL_KEY[keyword]) : t('common.confirm');

  const handleBatchConfirm = () => {
    if (!onBatchConfirm) return;
    const selections: CardDeletionSelection[] = [];
    Array.from(selectedKeys).forEach(k => {
      const entry = sourceLookup.get(k);
      if (entry) selections.push({ cardId: entry.card.id, source: entry.source });
    });
    onBatchConfirm(selections);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next && isBatch) {
          if (onBatchConfirm) {
            onBatchConfirm([]);
            return;
          }
        }
        onOpenChange(next);
      }}
    >
      {/*
        卡牌删除/弃置/回收弹窗：
        - 'each' 模式：每点一张卡立即触发 onDeleteCard，flow 是被强制的（如 删除 N 张），
          外点 / ESC 误关会让 cardActionContext 卡住一个待处理状态。
        - 'batch' 模式：玩家自己累计选择，确认或取消时统一提交。
        外点 / ESC 全部禁掉，玩家只能用按钮（"取消" / 单卡点击 / 确认 / X）显式关闭。
        参考 CardUpgradeModal 的同款历史 bug 注释。
      */}
      <DialogContent
        className="max-w-2xl max-h-[calc(95vh/var(--dialog-zoom,1))] overflow-y-auto"
        overlayClassName="bg-black/30"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-destructive" />
            {headerTitle}
          </DialogTitle>
          <DialogDescription>
            {headerDescription}
            {keyword === 'discard-recycle' && (
              <span className="mt-2 block text-xs text-muted-foreground">
                {t('modal.cardDeletion.discardRecycleHint')}
              </span>
            )}
          </DialogDescription>
          {isBatch ? (
            <p className="text-xs text-muted-foreground">
              {t('modal.cardDeletion.batchSelected', { count: selectedKeys.size, max: batchMax })}
            </p>
          ) : (
            requiredCount !== undefined && remainingCount !== undefined && requiredCount > 1 && (
              <p className="text-xs text-muted-foreground">
                {t('modal.cardDeletion.needMoreSelections', { remaining: remainingCount, required: requiredCount })}
              </p>
            )
          )}
        </DialogHeader>

        <div className="space-y-6 py-2">
          {renderCardSection(t('common.section.hand'), handCards, 'hand')}
          {showEquipment && equipmentCards.length > 0 && renderCardSection(t('common.section.equipment'), equipmentCards, 'equipment')}
          {showAmulet && amuletCards.length > 0 && renderCardSection(t('common.section.amulet'), amuletCards, 'amulet')}
          {showBackpack && renderCardSection(t('common.section.backpack'), backpackCards, 'backpack')}
          {showRecycleBag && recycleBagCards.length > 0 && renderCardSection(t('common.section.recycleBag'), recycleBagCards, 'recycleBag')}
        </div>

        {isBatch && (
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => onBatchConfirm?.([])}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleBatchConfirm}
              disabled={selectedKeys.size === 0}
            >
              {confirmLabel}
              {selectedKeys.size > 0 ? `（${selectedKeys.size}）` : ''}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
