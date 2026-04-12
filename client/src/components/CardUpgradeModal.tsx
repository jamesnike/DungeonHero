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
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [upgradesUsed, setUpgradesUsed] = useState(0);

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
                {maxed && <div className="upgrade-modal-max-tag">已满级</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <ArrowBigUpDash className="w-5 h-5 text-emerald-500" />
            卡牌升级
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {maxUpgrades != null
              ? `选择卡牌进行升级（剩余 ${remainingUpgrades} 次）`
              : '选择一张卡牌进行升级'}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          {!hasUpgradeableCards ? (
            <div className="text-center py-8 text-muted-foreground">
              没有可升级的卡牌
            </div>
          ) : (
            <>
              {renderSection('手牌', upgradeableHand)}
              {renderSection('背包', upgradeableBackpack)}
              {renderSection('装备栏', upgradeableEquipment)}
              {renderSection('护符栏', upgradeableAmulets)}
            </>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleClose(false)}
            >
              取消
            </Button>
            <Button
              size="sm"
              disabled={!selectedCardId || selectedMaxed}
              onClick={handleConfirm}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <ArrowBigUpDash className="w-4 h-4 mr-1" />
              升级
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
