import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

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
              {capitalize(item.type)} · {t('modal.equipmentSelect.powerLabel', { value: item.value ?? 0 })}
            </span>
            {typeof item.durability === 'number' && typeof item.maxDurability === 'number' && (
              <span className="equipment-select__meta text-muted-foreground">
                {t('modal.equipmentSelect.durabilityLabel', { current: item.durability, max: item.maxDurability })}
              </span>
            )}
          </>
        ) : (
          <span className="equipment-select__empty text-muted-foreground">{t('modal.equipmentSelect.emptySlot')}</span>
        )}
      </Button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={value => !value && onCancel()}>
      {/*
        装备选择弹窗承载着"待解决的 Promise"（修复耐久、强化、出售等）。
        如果在玩家选择前被误关（外点遮罩、ESC、其他弹窗关闭时的 ghost click
        穿透），上游 await requestEquipmentSelection 仍会拿到 cancel，但叠加
        在下层的 CardUpgradeModal / 战利品队列等可能因此卡住或丢失状态。
        参考 CardUpgradeModal 的同款历史 bug 注释。
        这里只允许"Cancel" / X 两条显式路径关闭，禁掉 outside-click 与 ESC。
      */}
      <DialogContent
        className="sm:max-w-xl equipment-select"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{prompt}</DialogTitle>
          {subtext && <DialogDescription>{subtext}</DialogDescription>}
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex gap-3">
            {renderSlot(t('modal.equipmentSelect.leftSlot'), 'equipmentSlot1', leftItem)}
            {renderSlot(t('modal.equipmentSelect.rightSlot'), 'equipmentSlot2', rightItem)}
          </div>
          <Button variant="ghost" onClick={onCancel} className="equipment-select__cancel">
            {t('modal.equipmentSelect.cancel')}
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

