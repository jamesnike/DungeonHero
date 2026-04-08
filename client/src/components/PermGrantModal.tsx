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
  sourceType: 'potion' | 'magic' | 'transform-grant' | 'equipment-enchant' | 'flank-grant' | 'transform-gold-grant';
  onConfirm: (cardId: string) => void;
}

export default function PermGrantModal({
  open,
  onClose,
  handCards,
  sourceCardId,
  sourceType,
  onConfirm,
}: PermGrantModalProps) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const isTransformGrant = sourceType === 'transform-grant';
  const isEquipEnchant = sourceType === 'equipment-enchant';
  const isFlankGrant = sourceType === 'flank-grant';
  const isTransformGoldGrant = sourceType === 'transform-gold-grant';

  const eligibleCards = handCards.filter(c => {
    if (c.id === sourceCardId) return false;
    if (isEquipEnchant) return c.type === 'weapon' || c.type === 'shield';
    if (isFlankGrant) return !c.flankEffect;
    if (isTransformGoldGrant) return !c.transformBonus;
    if (isTransformGrant) return !c.transformBonus;
    return !cardHasPermFlag(c);
  });

  const handleConfirm = () => {
    if (!selectedCardId) return;
    onConfirm(selectedCardId);
    setSelectedCardId(null);
  };

  const handleClose = () => {
    setSelectedCardId(null);
    onClose();
  };

  const titleMap: Record<string, string> = {
    'equipment-enchant': '装备附魔',
    'transform-grant': '蜕变赋灵',
    'flank-grant': '赋予侧击',
    'transform-gold-grant': '赋予转型',
  };
  const descMap: Record<string, string> = {
    'equipment-enchant': '选择一张手牌中的装备弃置，将其攻击/护甲值随机附魔到装备栏的一件装备上',
    'transform-grant': '选择一张手牌赋予「转型：随机获得坟场一张魔法卡」',
    'flank-grant': '选择一张手牌赋予「侧击：抽1张牌」（打出时处于手牌最左或最右位置时触发）',
    'transform-gold-grant': '选择一张手牌赋予「转型：+3金币」（打出前一张牌与本牌类型不同时触发）',
  };
  const emptyMap: Record<string, string> = {
    'equipment-enchant': '手牌中没有可弃置的装备卡',
    'flank-grant': '手牌中没有可赋予侧击效果的卡牌',
    'transform-gold-grant': '手牌中没有可赋予转型效果的卡牌',
    'transform-grant': '手牌中没有可赋予转型效果的卡牌',
  };
  const confirmMap: Record<string, string> = {
    'equipment-enchant': '附魔',
    'transform-grant': '赋灵',
    'flank-grant': '赋予',
    'transform-gold-grant': '赋予',
  };
  const title = titleMap[sourceType] ?? '永恒铭刻';
  const description = descMap[sourceType] ?? '选择一张手牌赋予 Perm 2（被移除后经 2 次瀑流返回背包）';
  const emptyText = emptyMap[sourceType] ?? '手牌中没有可赋予永恒属性的卡牌';
  const confirmText = confirmMap[sourceType] ?? '铭刻';

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <InfinityIcon className="w-5 h-5 text-amber-500" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          {eligibleCards.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {emptyText}
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
                {confirmText}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
