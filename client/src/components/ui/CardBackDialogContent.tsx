import * as React from 'react';
import { cn } from '@/lib/utils';
import { CARD_BACK_THEMES, type CardBackTheme, type CardBackVariant } from '@/lib/cardBackTheme';
import { DialogContent } from './dialog';

/**
 * 复刻 [`StackedCardPile.tsx` 的 DeckBack](../StackedCardPile.tsx) 卡背装饰：
 * 菱形格 overlay + 中央径向微光 + 四角 L + 1px 内方框线。
 *
 * 全部 `pointer-events-none + absolute inset-0`，不挡 close X / 滚动 / 点击。
 */
function CardBackFrameDecorations({ theme }: { theme: CardBackTheme }) {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 opacity-20 mix-blend-overlay rounded-[inherit]"
        aria-hidden
        style={{
          backgroundImage: `
            repeating-linear-gradient(45deg,  rgba(255,255,255,0.18) 0 1px, transparent 1px 12px),
            repeating-linear-gradient(-45deg, rgba(255,255,255,0.18) 0 1px, transparent 1px 12px)
          `,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(255,255,255,0.08) 0%, transparent 55%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        aria-hidden
        style={{ color: theme.ink }}
      >
        <div
          className="absolute top-1.5 left-1.5 w-3.5 h-3.5 rounded-tl-sm"
          style={{
            borderTop: '1.5px solid currentColor',
            borderLeft: '1.5px solid currentColor',
            opacity: 0.7,
          }}
        />
        <div
          className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-tr-sm"
          style={{
            borderTop: '1.5px solid currentColor',
            borderRight: '1.5px solid currentColor',
            opacity: 0.7,
          }}
        />
        <div
          className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 rounded-bl-sm"
          style={{
            borderBottom: '1.5px solid currentColor',
            borderLeft: '1.5px solid currentColor',
            opacity: 0.7,
          }}
        />
        <div
          className="absolute bottom-1.5 right-1.5 w-3.5 h-3.5 rounded-br-sm"
          style={{
            borderBottom: '1.5px solid currentColor',
            borderRight: '1.5px solid currentColor',
            opacity: 0.7,
          }}
        />
      </div>
      <div
        className={cn('pointer-events-none absolute inset-1.5 rounded-[inherit] border', theme.insetBorderClass)}
        aria-hidden
      />
    </>
  );
}

type CardBackDialogContentProps = React.ComponentPropsWithoutRef<typeof DialogContent> & {
  variant: CardBackVariant;
};

/**
 * `<DialogContent>` 的薄包装：把弹窗外框换成跟 cell 卡背同款风格。
 *
 * - `variant`: `bright`（专属/ClassDeck）/ `muted`（坟场/Graveyard）/
 *   `blue`（背包/Backpack）/ `indigo`（主牌堆/Deck，呼应 GameHeader sticker）。
 * - 复用同一个 [`CARD_BACK_THEMES`](@/lib/cardBackTheme) 调色板，避免色卡 drift。
 * - 完全透传 ref / contentMotion / overlayClassName / autoScale / onInteractOutside
 *   等所有 DialogContent 行为；用法跟原生 DialogContent 一致，只多一个 `variant`。
 *
 * 实现要点：
 * - `!bg-transparent !border-0`：用 important 干掉 shadcn 默认的 `bg-background`
 *   和 `border`，再用 inline `style` 套上调色板的渐变 + 4px 厚色边
 *   （inline style 优先级最高，无需操心 twMerge 边坑）。
 * - `overflow-hidden + relative`：让装饰层 `absolute inset-0 + rounded-[inherit]`
 *   能贴边裁圆角，跟外部 4px 厚边内沿严丝合缝。
 * - 装饰全部 `pointer-events-none`，X 关闭按钮（`<DialogContent>` 内置在 children
 *   之后渲染）的点击不受影响。
 */
export const CardBackDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  CardBackDialogContentProps
>(({ variant, className, style, children, ...rest }, ref) => {
  const theme = CARD_BACK_THEMES[variant];
  return (
    <DialogContent
      ref={ref}
      {...rest}
      className={cn('!bg-transparent !border-0 overflow-hidden relative', className)}
      style={{
        ...style,
        background: theme.bg,
        borderWidth: 4,
        borderStyle: 'solid',
        borderColor: theme.borderHex,
        boxShadow: `0 12px 28px ${theme.shadow}`,
      }}
    >
      <CardBackFrameDecorations theme={theme} />
      {children}
    </DialogContent>
  );
});
CardBackDialogContent.displayName = 'CardBackDialogContent';
