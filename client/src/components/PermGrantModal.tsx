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

type PermGrantSourceType =
  | 'potion' | 'magic'
  | 'transform-grant' | 'equipment-enchant' | 'essence-extract'
  | 'flank-grant' | 'transform-gold-grant'
  | 'flank-persuade-grant' | 'flank-stun-grant' | 'flank-damage-grant'
  | 'transform-draw-grant' | 'transform-heal-grant'
  | 'transform-recycle-grant';

interface PermGrantModalProps {
  open: boolean;
  onClose: () => void;
  handCards: GameCardData[];
  sourceCardId: string | null;
  sourceType: PermGrantSourceType;
  onConfirm: (cardId: string) => void;
}

const FLANK_GRANT_TYPES = new Set<string>([
  'flank-grant', 'flank-persuade-grant', 'flank-stun-grant', 'flank-damage-grant',
]);
const TRANSFORM_GRANT_TYPES = new Set<string>([
  'transform-grant', 'transform-gold-grant', 'transform-draw-grant', 'transform-heal-grant',
  'transform-recycle-grant',
]);

export default function PermGrantModal({
  open,
  onClose,
  handCards,
  sourceCardId,
  sourceType,
  onConfirm,
}: PermGrantModalProps) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const isEquipEnchant = sourceType === 'equipment-enchant';
  const isEssenceExtract = sourceType === 'essence-extract';
  const isFlankType = FLANK_GRANT_TYPES.has(sourceType);
  const isTransformType = TRANSFORM_GRANT_TYPES.has(sourceType);

  const eligibleCards = handCards.filter(c => {
    if (c.id === sourceCardId) return false;
    if (isEquipEnchant) return c.type === 'weapon' || c.type === 'shield';
    if (isEssenceExtract) return true;
    if (isFlankType) return !c.flankEffect;
    if (isTransformType) return !c.transformBonus;
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
    'essence-extract': '精华萃取',
    'transform-grant': '蜕变赋灵',
    'flank-grant': '赋予侧击',
    'transform-gold-grant': '赋予转型',
    'flank-persuade-grant': '赋能神殿 · 侧击',
    'flank-stun-grant': '赋能神殿 · 侧击',
    'flank-damage-grant': '赋能神殿 · 侧击',
    'transform-draw-grant': '赋能神殿 · 转型',
    'transform-heal-grant': '赋能神殿 · 转型',
    'transform-recycle-grant': '唤回秘药',
  };
  const descMap: Record<string, string> = {
    'equipment-enchant': '选择一张手牌中的装备弃置，将其攻击/护甲值随机附魔到装备栏的一件装备上',
    'essence-extract': '移除一张手牌（从游戏中删除）。一次性魔法→左栏攻击+1；装备→右栏攻击+1；护符→右栏护甲+1；怪物/药水→左栏护甲+1',
    'transform-grant': '选择一张手牌赋予「转型：随机获得坟场一张魔法卡」',
    'flank-grant': '选择一张手牌赋予「侧击：抽1张牌」（打出时处于手牌最左或最右位置时触发）',
    'transform-gold-grant': '选择一张手牌赋予「转型：+3金币」（打出前一张牌与本牌类型不同时触发）',
    'flank-persuade-grant': '选择一张手牌赋予「侧击：劝降费用永久 -1」（任何类型的牌均可）',
    'flank-stun-grant': '选择一张手牌赋予「侧击：击晕上限 +5%」（任何类型的牌均可）',
    'flank-damage-grant': '选择一张手牌赋予「侧击：对随机怪物造成 5 点伤害」（任何类型的牌均可）',
    'transform-draw-grant': '选择一张手牌赋予「转型：抽 2 张牌」（任何类型的牌均可）',
    'transform-heal-grant': '选择一张手牌赋予「转型：恢复 2 HP」（任何类型的牌均可）',
    'transform-recycle-grant': '选择一张手牌赋予「转型：回收袋取回 1 张牌」',
  };
  const emptyMap: Record<string, string> = {
    'equipment-enchant': '手牌中没有可弃置的装备卡',
    'essence-extract': '手牌中没有可移除的卡牌',
    'flank-grant': '手牌中没有可赋予侧击效果的卡牌',
    'transform-gold-grant': '手牌中没有可赋予转型效果的卡牌',
    'transform-grant': '手牌中没有可赋予转型效果的卡牌',
    'flank-persuade-grant': '手牌中没有可赋予侧击效果的卡牌',
    'flank-stun-grant': '手牌中没有可赋予侧击效果的卡牌',
    'flank-damage-grant': '手牌中没有可赋予侧击效果的卡牌',
    'transform-draw-grant': '手牌中没有可赋予转型效果的卡牌',
    'transform-heal-grant': '手牌中没有可赋予转型效果的卡牌',
    'transform-recycle-grant': '手牌中没有可赋予转型效果的卡牌',
  };
  const confirmMap: Record<string, string> = {
    'equipment-enchant': '附魔',
    'essence-extract': '萃取',
    'transform-grant': '赋灵',
    'flank-grant': '赋予',
    'transform-gold-grant': '赋予',
    'flank-persuade-grant': '赋予',
    'flank-stun-grant': '赋予',
    'flank-damage-grant': '赋予',
    'transform-draw-grant': '赋予',
    'transform-heal-grant': '赋予',
    'transform-recycle-grant': '赋予',
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
