import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowBigUpDash } from 'lucide-react';
import GameCard, { type GameCardData } from './GameCard';
import { isUpgradeableCard, isCardAtMaxUpgrade } from './CardUpgradeModal';

const MAX_SELECT = 2;

interface HandMagicUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  handCards: GameCardData[];
  sourceCardId: string | null;
  onUpgrade: (cardIds: string[]) => void;
}

export default function HandMagicUpgradeModal({
  open,
  onClose,
  handCards,
  sourceCardId,
  onUpgrade,
}: HandMagicUpgradeModalProps) {
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

  const upgradeableMagics = handCards.filter(
    c => c.id !== sourceCardId && c.type === 'magic' && isUpgradeableCard(c) && !isCardAtMaxUpgrade(c),
  );

  const toggleCard = (cardId: string) => {
    setSelectedCardIds(prev => {
      if (prev.includes(cardId)) return prev.filter(id => id !== cardId);
      if (prev.length >= MAX_SELECT) return prev;
      return [...prev, cardId];
    });
  };

  const handleConfirm = () => {
    if (selectedCardIds.length === 0) return;
    onUpgrade(selectedCardIds);
    setSelectedCardIds([]);
  };

  const handleClose = () => {
    setSelectedCardIds([]);
    onClose();
  };

  const effectiveMax = Math.min(MAX_SELECT, upgradeableMagics.length);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      {/*
        手牌魔法精炼弹窗（秘法精炼）：玩家选了卡才有意义，外点 / ESC 误关会丢失
        升级机会。和 CardUpgradeModal 同款保护，只允许"取消"按钮 / X / 确认 关闭。
      */}
      <DialogContent
        className="sm:max-w-lg max-h-[95vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <ArrowBigUpDash className="w-5 h-5 text-violet-500" />
            秘法精炼
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            选择手牌中至多 {effectiveMax} 张魔法牌进行升级（已选 {selectedCardIds.length}/{effectiveMax}）
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          {upgradeableMagics.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              手牌中没有可升级的魔法牌
            </div>
          ) : (
            <div className="upgrade-modal-card-grid">
              {upgradeableMagics.map(card => {
                const selected = selectedCardIds.includes(card.id);
                return (
                  <div
                    key={card.id}
                    className={`upgrade-modal-card-slot${selected ? ' upgrade-modal-card-slot--selected' : ''}`}
                    onClick={() => toggleCard(card.id)}
                  >
                    <GameCard card={card} disableInteractions />
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={handleClose}>
              {upgradeableMagics.length === 0 ? '关闭' : '取消'}
            </Button>
            {upgradeableMagics.length > 0 && (
              <Button
                size="sm"
                disabled={selectedCardIds.length === 0}
                onClick={handleConfirm}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                <ArrowBigUpDash className="w-4 h-4 mr-1" />
                升级（{selectedCardIds.length}）
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
