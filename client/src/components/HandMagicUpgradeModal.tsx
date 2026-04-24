import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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

const DEFAULT_MAX_SELECT = 2;

interface HandMagicUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  handCards: GameCardData[];
  sourceCardId: string | null;
  onUpgrade: (cardIds: string[]) => void;
  /** 法术回响 B 类：上限 = 2 * echoMultiplier，未传按 2 处理（普通使用）。 */
  maxSelect?: number;
}

export default function HandMagicUpgradeModal({
  open,
  onClose,
  handCards,
  sourceCardId,
  onUpgrade,
  maxSelect,
}: HandMagicUpgradeModalProps) {
  const { t } = useTranslation();
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

  const cap = Math.max(1, maxSelect ?? DEFAULT_MAX_SELECT);

  const upgradeableMagics = handCards.filter(
    c => c.id !== sourceCardId && c.type === 'magic' && isUpgradeableCard(c) && !isCardAtMaxUpgrade(c),
  );

  const toggleCard = (cardId: string) => {
    setSelectedCardIds(prev => {
      if (prev.includes(cardId)) return prev.filter(id => id !== cardId);
      if (prev.length >= cap) return prev;
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

  const effectiveMax = Math.min(cap, upgradeableMagics.length);

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
            {t('modal.handMagicUpgrade.title')}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t('modal.handMagicUpgrade.description', { max: effectiveMax, count: selectedCardIds.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          {upgradeableMagics.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('modal.handMagicUpgrade.empty')}
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
              {upgradeableMagics.length === 0 ? t('common.close') : t('common.cancel')}
            </Button>
            {upgradeableMagics.length > 0 && (
              <Button
                size="sm"
                disabled={selectedCardIds.length === 0}
                onClick={handleConfirm}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                <ArrowBigUpDash className="w-4 h-4 mr-1" />
                {t('modal.handMagicUpgrade.upgradeWithCount', { count: selectedCardIds.length })}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
