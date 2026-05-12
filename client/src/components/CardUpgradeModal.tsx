import { useEffect, useState } from 'react';
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

export type UpgradeableCardType = 'magic' | 'weapon' | 'shield' | 'potion' | 'amulet' | 'monster';

const UPGRADEABLE_TYPES: ReadonlySet<string> = new Set<UpgradeableCardType>([
  'magic',
  'weapon',
  'shield',
  'potion',
  'amulet',
  'monster',
]);

export function isUpgradeableCard(card: GameCardData): boolean {
  if (!UPGRADEABLE_TYPES.has(card.type)) return false;
  const maxLevel = card.maxUpgradeLevel ?? 0;
  return maxLevel > 0;
}

export function isCardAtMaxUpgrade(card: GameCardData): boolean {
  const current = card.upgradeLevel ?? 0;
  const max = card.maxUpgradeLevel ?? 0;
  return current >= max;
}

interface CardUpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handCards: GameCardData[];
  backpackItems: GameCardData[];
  equipmentSlot1: GameCardData | null;
  equipmentSlot2: GameCardData | null;
  amuletSlots: GameCardData[];
  onUpgrade: (cardId: string) => void;
  maxUpgrades?: number;
}

export default function CardUpgradeModal({
  open,
  onOpenChange,
  handCards,
  backpackItems,
  equipmentSlot1,
  equipmentSlot2,
  amuletSlots,
  onUpgrade,
  maxUpgrades,
}: CardUpgradeModalProps) {
  const { t } = useTranslation();
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [upgradesUsed, setUpgradesUsed] = useState(0);

  // 历史 bug：单次升级路径（'upgradeCard' 战利品 / 流转之符 / 虫蜕之冠 / 淬炼冲击 L0/L1
  // / `upgradeCardPure` 在 `state.upgradeModalMaxCount == null` 时直接 patch
  // `upgradeModalOpen=false`）会从 reducer 外部把模态关掉——**不**走 Dialog 的
  // `onOpenChange` → `handleClose`，因此本地 `upgradesUsed` / `selectedCardId` 不会被重置。
  //
  // 之后命运十字路口「选择两张牌升级」(`upgradeCard:2`) 重新打开模态时，
  // `maxUpgrades=2` 但 `upgradesUsed` 还是上一次单升级遗留的 1：
  //   remainingUpgrades = 2 - 1 = 1 → 描述显示「剩余 1 次」
  //   玩家点 1 张 → `upgradesUsed = 2 >= 2` → 模态立刻关掉，玩家少升级 1 张。
  //
  // 修法：每次 `open` 翻成 true 都强制重置一遍内部计数。无论上次是怎么关的（外部 patch /
  // 用户取消 / 完成升级），新的一次开模一定从 0 开始。
  useEffect(() => {
    if (open) {
      setUpgradesUsed(0);
      setSelectedCardId(null);
    }
  }, [open]);

  const remainingUpgrades = maxUpgrades != null ? maxUpgrades - upgradesUsed : Infinity;

  const upgradeableHand = handCards.filter(isUpgradeableCard);
  const upgradeableBackpack = backpackItems.filter(isUpgradeableCard);
  const upgradeableEquipment = [equipmentSlot1, equipmentSlot2]
    .filter((c): c is GameCardData => c != null && isUpgradeableCard(c));
  const upgradeableAmulets = amuletSlots.filter(isUpgradeableCard);

  const allCards = [...upgradeableHand, ...upgradeableBackpack, ...upgradeableEquipment, ...upgradeableAmulets];
  const hasUpgradeableCards = allCards.length > 0;

  const handleConfirm = () => {
    if (!selectedCardId) return;
    const target = allCards.find(c => c.id === selectedCardId);
    if (!target || isCardAtMaxUpgrade(target)) return;
    onUpgrade(selectedCardId);
    setSelectedCardId(null);
    const nextUsed = upgradesUsed + 1;
    setUpgradesUsed(nextUsed);
    if (maxUpgrades != null && nextUsed >= maxUpgrades) {
      onOpenChange(false);
      setUpgradesUsed(0);
    }
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedCardId(null);
      setUpgradesUsed(0);
    }
    onOpenChange(nextOpen);
  };

  const selectedCard = selectedCardId
    ? allCards.find(c => c.id === selectedCardId) ?? null
    : null;
  const selectedMaxed = selectedCard ? isCardAtMaxUpgrade(selectedCard) : false;

  const renderSection = (
    title: string,
    cards: GameCardData[],
  ) => {
    if (cards.length === 0) return null;
    return (
      <div>
        <div className="upgrade-modal-section-title">{title}</div>
        <div className="upgrade-modal-card-grid">
          {cards.map(card => {
            const maxed = isCardAtMaxUpgrade(card);
            const selected = card.id === selectedCardId;
            return (
              <div
                key={card.id}
                className={`upgrade-modal-card-slot${
                  selected ? ' upgrade-modal-card-slot--selected' : ''
                }${maxed ? ' upgrade-modal-card-slot--maxed' : ''}`}
                onClick={() => {
                  if (maxed) return;
                  setSelectedCardId(prev => (prev === card.id ? null : card.id));
                }}
              >
                <GameCard card={card} disableInteractions />
                {maxed && <div className="upgrade-modal-max-tag">{t('modal.cardUpgrade.maxedTag')}</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {/*
        升级弹窗有后果（玩家选哪张牌升级），不能因为误触遮罩或 ESC 而消失。
        历史 bug：淬炼冲击超杀时，本弹窗与战利品弹窗会同帧 open，战利品在上层；
        玩家点遮罩想 minimize 战利品，下层升级弹窗也被同次 click 触发
        onPointerDownOutside → onOpenChange(false) → SET_UPGRADE_MODAL_OPEN(false)
        + maxCount 清空，升级机会直接丢失。
        这里只允许"取消"按钮 / X 按钮 / 完成升级 三种显式路径关闭，
        阻断 outside-click 与 ESC 路径。
      */}
      {/*
        Layout：flex 列 + 中间区滚动 + footer 固定。详见 CardDeletionModal
        同款注释——避免 mobile 上 95vh 超出可视区 + 按钮被挤到滚动区下方。
      */}
      <DialogContent
        className="sm:max-w-lg max-h-[calc(95dvh/var(--dialog-zoom,1))] flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <ArrowBigUpDash className="w-5 h-5 text-emerald-500" />
            {t('modal.cardUpgrade.title')}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {maxUpgrades != null
              ? t('modal.cardUpgrade.subtitleWithRemaining', { count: remainingUpgrades })
              : t('modal.cardUpgrade.subtitleSingle')}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4 flex-1 min-h-0 overflow-y-auto">
          {!hasUpgradeableCards ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('modal.cardUpgrade.empty')}
            </div>
          ) : (
            <>
              {renderSection(t('common.section.hand'), upgradeableHand)}
              {renderSection(t('common.section.backpack'), upgradeableBackpack)}
              {renderSection(t('common.section.equipment'), upgradeableEquipment)}
              {renderSection(t('common.section.amulet'), upgradeableAmulets)}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleClose(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            disabled={!selectedCardId || selectedMaxed}
            onClick={handleConfirm}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <ArrowBigUpDash className="w-4 h-4 mr-1" />
            {t('modal.cardUpgrade.upgrade')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
