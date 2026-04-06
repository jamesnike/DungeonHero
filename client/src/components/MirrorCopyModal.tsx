import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import GameCard, { type GameCardData } from './GameCard';
import type { MirrorCopySelection } from '@/game-core/types';
import type { EquipmentSlotId } from '@/components/game-board/types';

interface MirrorCopyModalProps {
  open: boolean;
  onClose: () => void;
  equipmentSlot1: GameCardData | null;
  equipmentSlot2: GameCardData | null;
  amuletSlots: GameCardData[];
  handCards: GameCardData[];
  onConfirm: (selection: MirrorCopySelection) => void;
}

type SelectionState =
  | { kind: 'equipment'; slotId: EquipmentSlotId }
  | { kind: 'amulet'; index: number }
  | { kind: 'hand'; cardId: string }
  | null;

export default function MirrorCopyModal({
  open,
  onClose,
  equipmentSlot1,
  equipmentSlot2,
  amuletSlots,
  handCards,
  onConfirm,
}: MirrorCopyModalProps) {
  const [selected, setSelected] = useState<SelectionState>(null);

  const equipmentEntries: { slotId: 'equipmentSlot1' | 'equipmentSlot2'; label: string; card: GameCardData }[] = [];
  if (equipmentSlot1) {
    equipmentEntries.push({ slotId: 'equipmentSlot1', label: '左装备栏', card: equipmentSlot1 });
  }
  if (equipmentSlot2) {
    equipmentEntries.push({ slotId: 'equipmentSlot2', label: '右装备栏', card: equipmentSlot2 });
  }

  const pickEquipment = (slotId: 'equipmentSlot1' | 'equipmentSlot2') => {
    setSelected(prev => (prev?.kind === 'equipment' && prev.slotId === slotId ? null : { kind: 'equipment', slotId }));
  };
  const pickAmulet = (index: number) => {
    setSelected(prev => (prev?.kind === 'amulet' && prev.index === index ? null : { kind: 'amulet', index }));
  };
  const pickHand = (cardId: string) => {
    setSelected(prev => (prev?.kind === 'hand' && prev.cardId === cardId ? null : { kind: 'hand', cardId }));
  };

  const handleConfirm = () => {
    if (!selected) return;
    if (selected.kind === 'equipment') {
      onConfirm({ kind: 'equipment', slotId: selected.slotId });
    } else if (selected.kind === 'amulet') {
      onConfirm({ kind: 'amulet', index: selected.index });
    } else {
      onConfirm({ kind: 'hand', cardId: selected.cardId });
    }
    setSelected(null);
  };

  const handleClose = () => {
    setSelected(null);
    onClose();
  };

  const hasAny =
    equipmentEntries.length > 0 || amuletSlots.length > 0 || handCards.length > 0;

  const isSelected = (s: SelectionState): boolean => {
    if (!selected || !s) return false;
    if (selected.kind !== s.kind) return false;
    if (selected.kind === 'equipment' && s.kind === 'equipment') return selected.slotId === s.slotId;
    if (selected.kind === 'amulet' && s.kind === 'amulet') return selected.index === s.index;
    if (selected.kind === 'hand' && s.kind === 'hand') return selected.cardId === s.cardId;
    return false;
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Copy className="w-5 h-5 text-violet-500" />
            镜影摹形
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            选择左/右装备栏、护符栏或手牌中的一张牌，化身为该牌的复制加入手牌
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          {!hasAny ? (
            <div className="text-center py-8 text-muted-foreground">没有可选的牌</div>
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

              {amuletSlots.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">护符栏</div>
                  <div className="upgrade-modal-card-grid">
                    {amuletSlots.map((card, index) => (
                      <div key={`${card.id}-${index}`} className="space-y-1">
                        <div className="text-[10px] text-center text-muted-foreground">
                          护符 {index + 1}
                        </div>
                        <div
                          className={`upgrade-modal-card-slot${isSelected({ kind: 'amulet', index }) ? ' upgrade-modal-card-slot--selected' : ''}`}
                          onClick={() => pickAmulet(index)}
                        >
                          <GameCard card={card} disableInteractions />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {handCards.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">手牌</div>
                  <div className="upgrade-modal-card-grid">
                    {handCards.map(card => (
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

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={handleClose}>
              {hasAny ? '取消' : '关闭'}
            </Button>
            {hasAny && (
              <Button
                size="sm"
                disabled={!selected}
                onClick={handleConfirm}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                <Copy className="w-4 h-4 mr-1" />
                确认复制
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
