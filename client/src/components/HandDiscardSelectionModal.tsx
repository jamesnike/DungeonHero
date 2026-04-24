import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import GameCard, { type GameCardData } from './GameCard';

/**
 * 选择手牌弃回弹窗（供 汰旧迎新 / 祭坛秘术 / 专属召唤 / 回响行囊 /
 * 噬血砺锋 复用）。
 *
 * 设计要点：
 * - 多选，必须选满 `requiredCount` 张才能确认；少一张都禁用按钮。
 * - 不可取消：模态点击外部 / ESC 不会关闭，玩家必须做出选择。
 *   （上层入口已经保证「可弃手牌 ≥ requiredCount」才会弹窗，
 *   不足 requiredCount 时走自动随机分支，不进这个组件。）
 * - 候选列表已由 reducer 端 (`getEligibleHandDiscardCards`) 排除掉源卡牌
 *   和诅咒卡牌，但这里再过滤一次以防 props 传错。
 */

interface HandDiscardSelectionModalProps {
  open: boolean;
  title: string;
  prompt: string;
  requiredCount: number;
  /** 已经过 reducer 端过滤的可弃手牌候选。 */
  eligibleHandCards: GameCardData[];
  onConfirm: (cardIds: string[]) => void;
}

export default function HandDiscardSelectionModal({
  open,
  title,
  prompt,
  requiredCount,
  eligibleHandCards,
  onConfirm,
}: HandDiscardSelectionModalProps) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) setSelectedIds([]);
  }, [open]);

  const eligibleIds = useMemo(() => new Set(eligibleHandCards.map(c => c.id)), [eligibleHandCards]);

  // 防御：如果手牌动态变化让已选卡牌不再可选，剔除它。
  useEffect(() => {
    setSelectedIds(prev => prev.filter(id => eligibleIds.has(id)));
  }, [eligibleIds]);

  const toggle = (cardId: string) => {
    setSelectedIds(prev => {
      if (prev.includes(cardId)) return prev.filter(id => id !== cardId);
      if (prev.length >= requiredCount) return prev;
      return [...prev, cardId];
    });
  };

  const handleConfirm = () => {
    if (selectedIds.length !== requiredCount) return;
    onConfirm(selectedIds);
  };

  // openChange 故意不接 onConfirm/取消——上层流程要求玩家必须做出选择。
  const handleOpenChange = (_open: boolean) => {
    /* no-op，禁止关闭 */
  };

  const remaining = requiredCount - selectedIds.length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-lg max-h-[95vh] overflow-y-auto"
        onEscapeKeyDown={e => e.preventDefault()}
        onPointerDownOutside={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-rose-500" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {prompt}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          <div className="text-xs text-muted-foreground">
            {t('modal.handDiscardSelection.remainingLabel')}{' '}
            <span className="font-semibold text-rose-500">{Math.max(0, remaining)}</span>
          </div>

          <div className="upgrade-modal-card-grid">
            {eligibleHandCards.map(card => {
              const isSelected = selectedIds.includes(card.id);
              const reachedCap = !isSelected && selectedIds.length >= requiredCount;
              return (
                <div
                  key={card.id}
                  className={`upgrade-modal-card-slot${isSelected ? ' upgrade-modal-card-slot--selected' : ''}`}
                  onClick={() => toggle(card.id)}
                  style={{
                    opacity: reachedCap ? 0.4 : 1,
                    cursor: reachedCap ? 'not-allowed' : 'pointer',
                  }}
                >
                  <GameCard card={card} disableInteractions />
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-2 border-t border-border">
            <Button
              size="sm"
              disabled={selectedIds.length !== requiredCount}
              onClick={handleConfirm}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {t('modal.handDiscardSelection.confirmDiscard')} {selectedIds.length}/{requiredCount}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
