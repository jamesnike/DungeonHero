import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { GameCardData } from './GameCard';

type EquipmentSlotKey = 'equipmentSlot1' | 'equipmentSlot2';

interface EquipmentSelectModalProps {
  open: boolean;
  prompt: string;
  subtext?: string;
  leftItem: GameCardData | null;
  rightItem: GameCardData | null;
  onSelect: (slot: EquipmentSlotKey) => void;
  onCancel: () => void;
}

export default function EquipmentSelectModal({
  open,
  prompt,
  subtext,
  leftItem,
  rightItem,
  onSelect,
  onCancel,
}: EquipmentSelectModalProps) {
  const renderSlot = (label: string, slotId: EquipmentSlotKey, item: GameCardData | null) => {
    const disabled = !item;
    return (
      <Button
        key={slotId}
        variant="outline"
        disabled={disabled}
        className="flex-1 flex-col items-start gap-1 border-dashed text-left"
        onClick={() => !disabled && onSelect(slotId)}
      >
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        {item ? (
          <>
            <span className="font-semibold text-foreground">{item.name}</span>
            <span className="text-xs text-muted-foreground">
              {capitalize(item.type)} · {item.value ?? 0} power
            </span>
            {typeof item.durability === 'number' && typeof item.maxDurability === 'number' && (
              <span className="text-[11px] text-muted-foreground">
                Durability {item.durability}/{item.maxDurability}
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Empty slot</span>
        )}
      </Button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={value => !value && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{prompt}</DialogTitle>
          {subtext && <DialogDescription>{subtext}</DialogDescription>}
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex gap-3">
            {renderSlot('Left Slot', 'equipmentSlot1', leftItem)}
            {renderSlot('Right Slot', 'equipmentSlot2', rightItem)}
          </div>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function capitalize(text: string | undefined) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

