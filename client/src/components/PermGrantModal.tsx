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
  | 'flank-grant' | 'flank-gold-grant'
  | 'flank-persuade-grant' | 'flank-stun-grant' | 'flank-damage-grant'
  | 'transform-draw-grant' | 'flank-heal-grant'
  | 'transform-recycle-grant'
  | 'amulet-perm-grant'
  | 'on-hand-stun-cap-grant'
  | 'on-hand-heal-grant'
  | 'on-hand-gold-grant'
  | 'on-hand-top-grant'
  | 'on-hand-temp-armor-grant'
  // 「奥能裂变」事件 outcomes 2 / 3 / 5 / 6 / 7 — 5 个新的 hand-card-targeting 赋能类型。
  | 'flank-gain-bolt-grant'
  | 'on-hand-add-bolt-bp-grant'
  | 'flank-spawn-mine-grant'
  | 'transform-mine-damage-grant'
  | 'transform-amplify-bolt-grant';

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
  // 唤回秘药·侧击（历史 sourceType 名 'transform-recycle-grant' 沿用，但触发条件
  // 已经改成侧击，eligibility 必须按 flankEffect 过滤）。
  'transform-recycle-grant',
  // 蜕变赋灵·侧击（历史 sourceType 名 'transform-grant' 沿用——保留 i18n key /
  // pending-magic-action effect / event 名兼容性——但触发条件已经改成侧击，
  // eligibility 必须按 flankEffect 过滤）。
  'transform-grant',
  // 附魔祭坛·侧击 +3 金币 / 赋能神殿·侧击 恢复 N HP（触发条件已从转型迁移为侧击；
  // 保留 transform-draw-grant 不动 = 还是转型）。
  'flank-gold-grant', 'flank-heal-grant',
  // 「奥能裂变」outcomes 2 / 5 — 新的两条侧击赋能（手牌 +1 魔弹 / 激活行生成地雷）。
  'flank-gain-bolt-grant', 'flank-spawn-mine-grant',
]);
const TRANSFORM_GRANT_TYPES = new Set<string>([
  'transform-draw-grant',
  // 「奥能裂变」outcomes 6 / 7 — 全场地雷伤害+2 / 魔弹增幅2次。
  'transform-mine-damage-grant', 'transform-amplify-bolt-grant',
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
  // 赋能神殿 「上手:金币+2」: same eligibility shape as on-hand-heal-grant.
  const isOnHandGoldGrant = sourceType === 'on-hand-gold-grant';
  // 「右翼回响」option 1 — grant 'topOnRecycleRestore' keyword.
  const isOnHandTopGrant = sourceType === 'on-hand-top-grant';
  // 「右翼回响」option 4 — grant 'on-enter-hand: random slot temp armor +1'.
  const isOnHandTempArmorGrant = sourceType === 'on-hand-temp-armor-grant';
  // 「奥能裂变」outcome 3 — grant 'on-enter-hand: 背包 +1 张「魔弹」'.
  const isOnHandAddBoltBackpackGrant = sourceType === 'on-hand-add-bolt-bp-grant';

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
        // 赋能神殿 「上手:金币+2」: mirror of heal — exclude cards already
        // carrying any on-enter-hand keyword to avoid clobbering it.
        if (isOnHandGoldGrant) return !c.onEnterHandEffect;
        // 「右翼回响」option 1 — exclude cards that already have 'topOnRecycleRestore'.
        if (isOnHandTopGrant) return !c.topOnRecycleRestore;
        // 「右翼回响」option 4 — exclude cards that already carry an on-enter-hand
        // effect (mirrors stun-cap / heal grant exclusion).
        if (isOnHandTempArmorGrant) return !c.onEnterHandEffect;
        // 「奥能裂变」outcome 3 — exclude cards that already carry an on-enter-hand
        // effect (mirrors stun-cap / heal / temp-armor grant exclusion).
        if (isOnHandAddBoltBackpackGrant) return !c.onEnterHandEffect;
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
    'flank-gold-grant': 'flankGoldGrant',
    'flank-persuade-grant': 'flankPersuadeGrant',
    'flank-stun-grant': 'flankStunGrant',
    'flank-damage-grant': 'flankDamageGrant',
    'transform-draw-grant': 'transformDrawGrant',
    'flank-heal-grant': 'flankHealGrant',
    'transform-recycle-grant': 'transformRecycleGrant',
    'amulet-perm-grant': 'amuletPermGrant',
    'on-hand-stun-cap-grant': 'onHandStunCapGrant',
    'on-hand-heal-grant': 'onHandHealGrant',
    'on-hand-gold-grant': 'onHandGoldGrant',
    'on-hand-top-grant': 'onHandTopGrant',
    'on-hand-temp-armor-grant': 'onHandTempArmorGrant',
    // 「奥能裂变」outcomes 2 / 3 / 5 / 6 / 7
    'flank-gain-bolt-grant': 'flankGainBoltGrant',
    'on-hand-add-bolt-bp-grant': 'onHandAddBoltBackpackGrant',
    'flank-spawn-mine-grant': 'flankSpawnMineGrant',
    'transform-mine-damage-grant': 'transformMineDamageGrant',
    'transform-amplify-bolt-grant': 'transformAmplifyBoltGrant',
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
      {/*
        Layout：flex 列 + 中间区滚动 + footer 固定。详见 CardDeletionModal 同款注释。
      */}
      <DialogContent
        className="sm:max-w-lg max-h-[95dvh] flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <InfinityIcon className="w-5 h-5 text-amber-500" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex-1 min-h-0 overflow-y-auto">
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
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border flex-shrink-0">
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
      </DialogContent>
    </Dialog>
  );
}
