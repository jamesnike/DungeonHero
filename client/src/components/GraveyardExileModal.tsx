import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import GameCard, { type GameCardData } from './GameCard';

interface GraveyardExileModalProps {
  open: boolean;
  cards: GameCardData[];
  onConfirm: (selectedIds: string[]) => void;
}

export default function GraveyardExileModal({
  open,
  cards,
  onConfirm,
}: GraveyardExileModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleCard = useCallback((cardId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm(Array.from(selectedIds));
    setSelectedIds(new Set());
  }, [onConfirm, selectedIds]);

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-2xl max-h-[95vh] overflow-y-auto p-5 sm:p-8">
        <DialogHeader>
          <DialogTitle>虚灵刀 — 灵魂放逐</DialogTitle>
          <DialogDescription>
            从坟场中选择要移除出游戏的卡牌（可多选，也可不选）。被移除的卡牌将永久消失。
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {cards.map(card => {
            const isSelected = selectedIds.has(card.id);
            return (
              <button
                key={card.id}
                type="button"
                className={`group rounded-xl border p-1.5 sm:p-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
                  isSelected
                    ? 'border-red-500 bg-red-500/15 ring-2 ring-red-500/50'
                    : 'border-card-border/70 bg-card/40 hover:border-primary hover:bg-primary/5'
                }`}
                onClick={() => toggleCard(card.id)}
              >
                <div className="pointer-events-none aspect-[3/4.2] w-full">
                  <GameCard card={card} disableInteractions />
                </div>
                <span className={`mt-1.5 sm:mt-3 block text-center text-xs sm:text-sm font-semibold ${
                  isSelected ? 'text-red-400' : 'text-foreground group-hover:text-primary'
                }`}>
                  {isSelected ? '已选中 — 将被移除' : '点击选择'}
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            variant="default"
            onClick={handleConfirm}
          >
            {selectedIds.size > 0
              ? `确认移除 ${selectedIds.size} 张卡牌`
              : '不移除，跳过'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
