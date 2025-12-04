import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
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
  const contentRef = useRef<HTMLDivElement>(null);
  const [overlayScale, setOverlayScale] = useState(1);
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const target = contentRef.current;
    if (!target) return;
    const baseWidth = 320;
    const minScale = 0.7;
    const maxScale = 1.15;
    const updateScale = () => {
      const width = target.getBoundingClientRect().width;
      if (!width) return;
      setOverlayScale(prev => {
        const next = clamp(width / baseWidth, minScale, maxScale);
        return Math.abs(prev - next) > 0.01 ? next : prev;
      });
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const renderSlot = (label: string, slotId: EquipmentSlotKey, item: GameCardData | null) => {
    const disabled = !item;
    return (
      <Button
        key={slotId}
        variant="outline"
        disabled={disabled}
        className={cn(
          'equipment-select__button flex-1 flex-col items-start gap-1 border-dashed text-left',
          disabled ? 'equipment-select__button--disabled' : 'equipment-select__button--active',
        )}
        onClick={() => !disabled && onSelect(slotId)}
      >
        <span className="equipment-select__label uppercase tracking-wide text-muted-foreground">{label}</span>
        {item ? (
          <>
            <span className="equipment-select__name font-semibold text-foreground">{item.name}</span>
            <span className="equipment-select__meta text-muted-foreground">
              {capitalize(item.type)} · {item.value ?? 0} power
            </span>
            {typeof item.durability === 'number' && typeof item.maxDurability === 'number' && (
              <span className="equipment-select__meta text-muted-foreground">
                Durability {item.durability}/{item.maxDurability}
              </span>
            )}
          </>
        ) : (
          <span className="equipment-select__empty text-muted-foreground">Empty slot</span>
        )}
      </Button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={value => !value && onCancel()}>
      <DialogContent
        ref={contentRef}
        className="sm:max-w-lg equipment-select"
        style={{ '--dh-overlay-scale': overlayScale.toString() } as CSSProperties}
      >
        <DialogHeader>
          <DialogTitle>{prompt}</DialogTitle>
          {subtext && <DialogDescription>{subtext}</DialogDescription>}
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex gap-3">
            {renderSlot('Left Slot', 'equipmentSlot1', leftItem)}
            {renderSlot('Right Slot', 'equipmentSlot2', rightItem)}
          </div>
          <Button variant="ghost" onClick={onCancel} className="equipment-select__cancel">
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

