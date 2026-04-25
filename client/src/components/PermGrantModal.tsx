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
import { Infinity as InfinityIcon } from 'lucide-react';
import GameCard, { type GameCardData, cardHasPermFlag } from './GameCard';

type PermGrantSourceType =
  | 'potion' | 'magic'
  | 'transform-grant' | 'equipment-enchant' | 'essence-extract'
  | 'flank-grant' | 'transform-gold-grant'
  | 'flank-persuade-grant' | 'flank-stun-grant' | 'flank-damage-grant'
  | 'transform-draw-grant' | 'transform-heal-grant'
  | 'transform-recycle-grant'
  | 'amulet-perm-grant'
  | 'on-hand-stun-cap-grant'
  | 'on-hand-heal-grant';

interface PermGrantModalProps {
  open: boolean;
  onClose: () => void;
  handCards: GameCardData[];
  /** Currently equipped amulets — only used when sourceType is 'amulet-perm-grant'. */
  amuletSlots?: GameCardData[];
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
  amuletSlots,
  sourceCardId,
  sourceType,
  onConfirm,
}: PermGrantModalProps) {
  const { t } = useTranslation();
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const isEquipEnchant = sourceType === 'equipment-enchant';
  const isEssenceExtract = sourceType === 'essence-extract';
  const isFlankType = FLANK_GRANT_TYPES.has(sourceType);
  const isTransformType = TRANSFORM_GRANT_TYPES.has(sourceType);
  const isAmuletPermGrant = sourceType === 'amulet-perm-grant';
  const isOnHandStunCapGrant = sourceType === 'on-hand-stun-cap-grant';
  const isOnHandHealGrant = sourceType === 'on-hand-heal-grant';

  // For amulet-perm-grant, the candidate pool is the currently equipped amulets
  // (filtered to those that don't already have Perm 2 or stronger).
  const eligibleCards = isAmuletPermGrant
    ? (amuletSlots ?? []).filter(a => !a.recycleDelay || a.recycleDelay < 2)
    : handCards.filter(c => {
        if (c.id === sourceCardId) return false;
        if (isEquipEnchant) return c.type === 'weapon' || c.type === 'shield';
        if (isEssenceExtract) return true;
        if (isFlankType) return !c.flankEffect;
        if (isTransformType) return !c.transformBonus;
        // 翻转之契 option 5 — exclude cards that already carry an on-enter-hand
        // effect (would otherwise clobber existing keywords like 兵器谱/血誓回卷/查阅动作)
        if (isOnHandStunCapGrant) return !c.onEnterHandEffect;
        // 赋能神殿 「上手:回血1」: same exclusion — don't clobber existing
        // on-enter-hand keywords.
        if (isOnHandHealGrant) return !c.onEnterHandEffect;
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

  const sourceKeyMap: Record<string, string> = {
    'equipment-enchant': 'equipmentEnchant',
    'essence-extract': 'essenceExtract',
    'transform-grant': 'transformGrant',
    'flank-grant': 'flankGrant',
    'transform-gold-grant': 'transformGoldGrant',
    'flank-persuade-grant': 'flankPersuadeGrant',
    'flank-stun-grant': 'flankStunGrant',
    'flank-damage-grant': 'flankDamageGrant',
    'transform-draw-grant': 'transformDrawGrant',
    'transform-heal-grant': 'transformHealGrant',
    'transform-recycle-grant': 'transformRecycleGrant',
    'amulet-perm-grant': 'amuletPermGrant',
    'on-hand-stun-cap-grant': 'onHandStunCapGrant',
    'on-hand-heal-grant': 'onHandHealGrant',
  };
  const variantKey = sourceKeyMap[sourceType];
  const title = variantKey
    ? t(`modal.permGrant.title_${variantKey}`)
    : t('modal.permGrant.defaultTitle');
  const description = variantKey
    ? t(`modal.permGrant.desc_${variantKey}`)
    : t('modal.permGrant.defaultDescription');
  const emptyText = variantKey
    ? t(`modal.permGrant.empty_${variantKey}`)
    : t('modal.permGrant.defaultEmpty');
  const confirmText = variantKey
    ? t(`modal.permGrant.confirm_${variantKey}`)
    : t('modal.permGrant.defaultConfirm');

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      {/*
        Perm 赋予 / 装备附魔 / 精华萃取 / 蜕变赋灵 等永久铭刻弹窗：
        玩家选哪张卡铭刻是有后果的选择，外点 / ESC 误关会丢失这次永久升级机会。
        显式关闭路径："取消" / X / 确认按钮（赋予 / 铭刻 / 萃取 / 附魔...）。
      */}
      <DialogContent
        className="sm:max-w-lg max-h-[95vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
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
              {eligibleCards.length === 0 ? t('common.close') : t('common.cancel')}
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
