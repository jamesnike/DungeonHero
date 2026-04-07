import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Infinity as InfinityIcon } from 'lucide-react';
import GameCard, { type GameCardData, cardHasPermFlag } from './GameCard';

interface PermGrantModalProps {
  open: boolean;
  onClose: () => void;
  handCards: GameCardData[];
  sourceCardId: string | null;
  onConfirm: (cardId: string) => void;
}

export default function PermGrantModal({
  open,
  onClose,
  handCards,
  sourceCardId,
  onConfirm,
}: PermGrantModalProps) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const eligibleCards = handCards.filter(
    c => c.id !== sourceCardId && !cardHasPermFlag(c),
  );

  const handleConfirm = () => {
    if (!selectedCardId) return;
    onConfirm(selectedCardId);
    setSelectedCardId(null);
  };

  const handleClose = () => {
    setSelectedCardId(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <InfinityIcon className="w-5 h-5 text-amber-500" />
            永恒铭刻
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            选择一张手牌赋予 Perm 2（被移除后经 2 次瀑流返回背包）
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          {eligibleCards.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              手牌中没有可赋予永恒属性的卡牌
            </div>
          ) : (
            <div className="upgrade-modal-card-grid">
              {eligibleCards.map(card => {
                const selected = card.id === selectedCardId;
                return (
                  <div
                    key={card.id}
                    className={`upgrade-modal-card-slot${selected ? ' upgrade-modal-card-slot--selected' : ''}`}
                    onClick={() => setSelectedCardId(prev => (prev === card.id ? null : card.id))}
                  >
                    <GameCard card={card} disableInteractions />
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={handleClose}>
              {eligibleCards.length === 0 ? '关闭' : '取消'}
            </Button>
            {eligibleCards.length > 0 && (
              <Button
                size="sm"
                disabled={!selectedCardId}
                onClick={handleConfirm}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                <InfinityIcon className="w-4 h-4 mr-1" />
                铭刻
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
