/**
 * CardStampPicker — anchored Radix Popover that lets the player pick one of
 * the 6 preset stamps OR send a freeform message (≤80 chars).
 *
 * Mounted by `CardStampsContainer`, which subscribes to `useCardStamps()`'s
 * `pickerState`. When offline (`!isOnline`), the picker still opens but all
 * submit affordances are disabled and an offline banner is shown — by design,
 * we never silently drop a player's stamp.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  MAX_FREEFORM_LEN,
  STAMP_DEFINITIONS,
  type PresetStampId,
  type StampId,
} from '@/lib/cardStamps';

interface CardStampPickerProps {
  open: boolean;
  /** The card cell that triggered the picker (used to compute popover anchor). */
  anchorEl: Element;
  isOnline: boolean;
  onSelect: (stampId: StampId, messageText?: string) => void;
  onClose: () => void;
}

interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function readAnchorRect(el: Element): AnchorRect {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    height: rect.height,
  };
}

export function CardStampPicker(props: CardStampPickerProps) {
  const { open, anchorEl, isOnline, onSelect, onClose } = props;
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Read anchor rect on open and on viewport resize/scroll while open.
  useLayoutEffect(() => {
    if (!open) {
      setAnchorRect(null);
      return;
    }
    setAnchorRect(readAnchorRect(anchorEl));

    const onChange = () => setAnchorRect(readAnchorRect(anchorEl));
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [open, anchorEl]);

  // Reset draft text every time the picker opens.
  useEffect(() => {
    if (open) {
      setText('');
    }
  }, [open]);

  const trimmedLen = text.trim().length;
  const canSubmitFreeform = isOnline && trimmedLen > 0 && trimmedLen <= MAX_FREEFORM_LEN;

  function handlePresetClick(id: PresetStampId) {
    if (!isOnline) return;
    onSelect(id);
    onClose();
  }

  function handleFreeformSubmit() {
    if (!canSubmitFreeform) return;
    onSelect('freeform', text);
    onClose();
  }

  if (!open || !anchorRect) return null;

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={isOpen => {
        if (!isOpen) onClose();
      }}
    >
      {/* Invisible anchor div pinned to the trigger cell. */}
      <PopoverPrimitive.Anchor asChild>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: anchorRect.top,
            left: anchorRect.left,
            width: anchorRect.width,
            height: anchorRect.height,
            pointerEvents: 'none',
          }}
        />
      </PopoverPrimitive.Anchor>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="top"
          align="center"
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            'z-[60] w-72 rounded-md border bg-popover p-3 text-popover-foreground shadow-md outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
          onClick={e => e.stopPropagation()}
          onPointerDownOutside={() => onClose()}
          onEscapeKeyDown={() => onClose()}
        >
          {/* Offline banner */}
          {!isOnline && (
            <div
              className="mb-2 rounded-sm bg-amber-100 px-2 py-1 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
              role="status"
            >
              {t('cardStamps.offlineBanner', '📡 当前离线，留言功能暂不可用')}
            </div>
          )}

          {/* Preset emoji grid (3×2) */}
          <div className="grid grid-cols-3 gap-1.5">
            {STAMP_DEFINITIONS.map(def => (
              <button
                key={def.id}
                type="button"
                disabled={!isOnline}
                onClick={() => handlePresetClick(def.id)}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded px-2 py-2 text-center transition',
                  'hover:bg-accent active:scale-95',
                  'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
                )}
                aria-label={t(def.i18nKey, def.labelZh)}
                title={t(def.i18nKey, def.labelZh)}
              >
                <span className="text-xl leading-none">{def.emoji}</span>
                <span className="text-[10px] leading-none text-muted-foreground">
                  {t(def.i18nKey, def.labelZh)}
                </span>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="my-2 h-px bg-border" />

          {/* Freeform input */}
          <div className="space-y-1.5">
            <Textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              maxLength={MAX_FREEFORM_LEN}
              disabled={!isOnline}
              placeholder={t('cardStamps.freeformPlaceholder', '或者输入留言...')}
              rows={2}
              className="resize-none text-sm"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleFreeformSubmit();
                }
              }}
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {trimmedLen}/{MAX_FREEFORM_LEN}
              </span>
              <Button
                type="button"
                size="sm"
                variant="default"
                disabled={!canSubmitFreeform}
                onClick={handleFreeformSubmit}
              >
                {t('cardStamps.send', '发送')}
              </Button>
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
