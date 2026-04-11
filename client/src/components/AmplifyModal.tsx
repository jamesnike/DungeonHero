import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TrendingUp } from 'lucide-react';
import GameCard, { type GameCardData } from './GameCard';
import type { AmplifySelection } from '@/game-core/types';
import type { EquipmentSlotId } from '@/components/game-board/types';
import { isDamageMagic } from '@/game-core/helpers';

interface AmplifyModalProps {
  open: boolean;
  onClose: () => void;
  equipmentSlot1: GameCardData | null;
  equipmentSlot2: GameCardData | null;
  handCards: GameCardData[];
  onConfirm: (selection: AmplifySelection) => void;
}

type SelectionState =
  | { kind: 'equipment'; slotId: EquipmentSlotId }
  | { kind: 'hand'; cardId: string }
  | null;

function getAmplifyPreview(card: GameCardData): string {
  if (card.type === 'weapon') return `攻击力 ${card.value} → ${card.value + 1}`;
  if (card.type === 'shield') return `护甲 ${card.armorMax ?? card.value} → ${(card.armorMax ?? card.value) + 1}`;
  if (card.type === 'magic') {
    if (card.scalingDamage != null) return `叠刺基数 ${card.scalingDamage} → ${card.scalingDamage + 1}`;
    const bonus = (card.amplifyBonus ?? 0) + 1;
    return `伤害 +${bonus}`;
  }
  return '';
}

export default function AmplifyModal({
  open,
  onClose,
  equipmentSlot1,
  equipmentSlot2,
  handCards,
  onConfirm,
}: AmplifyModalProps) {
  const [selected, setSelected] = useState<SelectionState>(null);

  const equipmentEntries: { slotId: EquipmentSlotId; label: string; card: GameCardData }[] = [];
  if (equipmentSlot1 && (equipmentSlot1.type === 'weapon' || equipmentSlot1.type === 'shield')) {
    equipmentEntries.push({ slotId: 'equipmentSlot1', label: '左装备栏', card: equipmentSlot1 });
  }
  if (equipmentSlot2 && (equipmentSlot2.type === 'weapon' || equipmentSlot2.type === 'shield')) {
    equipmentEntries.push({ slotId: 'equipmentSlot2', label: '右装备栏', card: equipmentSlot2 });
  }

  const eligibleHandCards = handCards.filter(
    c => c.type === 'weapon' || c.type === 'shield' || isDamageMagic(c),
  );

  const pickEquipment = (slotId: EquipmentSlotId) => {
    setSelected(prev => (prev?.kind === 'equipment' && prev.slotId === slotId ? null : { kind: 'equipment', slotId }));
  };
  const pickHand = (cardId: string) => {
    setSelected(prev => (prev?.kind === 'hand' && prev.cardId === cardId ? null : { kind: 'hand', cardId }));
  };

  const handleConfirm = () => {
    if (!selected) return;
    onConfirm(selected);
    setSelected(null);
  };

  const handleClose = () => {
    setSelected(null);
    onClose();
  };

  const hasAny = equipmentEntries.length > 0 || eligibleHandCards.length > 0;

  const isSelected = (s: SelectionState): boolean => {
    if (!selected || !s) return false;
    if (selected.kind !== s.kind) return false;
    if (selected.kind === 'equipment' && s.kind === 'equipment') return selected.slotId === s.slotId;
    if (selected.kind === 'hand' && s.kind === 'hand') return selected.cardId === s.cardId;
    return false;
  };

  const selectedCard: GameCardData | null = (() => {
    if (!selected) return null;
    if (selected.kind === 'equipment') {
      return selected.slotId === 'equipmentSlot1' ? equipmentSlot1 : equipmentSlot2;
    }
    return eligibleHandCards.find(c => c.id === selected.cardId) ?? null;
  })();

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-500" />
            增幅
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            选择装备栏中的装备或手牌中的装备/伤害魔法，对其进行增幅
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          {!hasAny ? (
            <div className="text-center py-8 text-muted-foreground">没有可增幅的牌</div>
          ) : (
            <>
              {equipmentEntries.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">装备栏</div>
                  <div className="upgrade-modal-card-grid">
                    {equipmentEntries.map(({ slotId, label, card }) => (
                      <div key={slotId} className="space-y-1">
                        <div className="text-[10px] text-center text-muted-foreground">{label}</div>
                        <div
                          className={`upgrade-modal-card-slot${isSelected({ kind: 'equipment', slotId }) ? ' upgrade-modal-card-slot--selected' : ''}`}
                          onClick={() => pickEquipment(slotId)}
                        >
                          <GameCard card={card} disableInteractions />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {eligibleHandCards.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">手牌</div>
                  <div className="upgrade-modal-card-grid">
                    {eligibleHandCards.map(card => (
                      <div
                        key={card.id}
                        className={`upgrade-modal-card-slot${isSelected({ kind: 'hand', cardId: card.id }) ? ' upgrade-modal-card-slot--selected' : ''}`}
                        onClick={() => pickHand(card.id)}
                      >
                        <GameCard card={card} disableInteractions />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {selectedCard && (
            <div className="text-sm text-center text-amber-600 font-medium">
              增幅效果：{getAmplifyPreview(selectedCard)}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={handleClose}>
              {hasAny ? '取消' : '关闭'}
            </Button>
            {hasAny && (
              <Button
                size="sm"
                disabled={!selected}
                onClick={handleConfirm}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                <TrendingUp className="w-4 h-4 mr-1" />
                确认增幅
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
