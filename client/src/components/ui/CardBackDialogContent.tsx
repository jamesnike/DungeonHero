import * as React from 'react';
import { cn } from '@/lib/utils';
import { CARD_BACK_THEMES, type CardBackTheme, type CardBackVariant } from '@/lib/cardBackTheme';
import { DialogContent } from './dialog';

/**
 * 复刻 [`StackedCardPile.tsx` 的 DeckBack](../StackedCardPile.tsx) 卡背装饰：
 * 菱形格 overlay + 中央径向微光 + 四角 L + 1px 内方框线。
 *
 * 全部 `pointer-events-none + absolute inset-0`，挂在外层 frame 上（不是滚动 body），
 * 这样滚动 body 的内容时装饰始终框住整个 modal viewport，不会跟着滚走。
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
  /**
   * 内层滚动 body 的 className。
   *
   * 历史上调用方把 `max-h-[85vh] overflow-y-auto` 直接写在 `<DialogContent>` 的
   * className 上，这会让 `DialogContent` 自己变成滚动容器——它的 absolute 装饰子
   * 就会被锚到「滚动内容区」而不是「可视 viewport」，结果一滚就跟着滚走，玩家只
   * 在最顶端能看到一截装饰。
   *
   * 把滚动从 frame 拆出来，写到这个 prop，由内层 body div 自己滚动。装饰挂在外层
   * frame 上，永远框住整个 modal 可视区域。
   */
  bodyClassName?: string;
};

/**
 * `<DialogContent>` 的薄包装：把弹窗外框换成跟 cell 卡背同款风格。
 *
 * - `variant`: `bright`（专属/ClassDeck）/ `muted`（坟场/Graveyard）/
 *   `blue`（背包/Backpack）/ `indigo`（主牌堆/Deck，呼应 GameHeader sticker）。
 * - 复用同一个 [`CARD_BACK_THEMES`](@/lib/cardBackTheme) 调色板，避免色卡 drift。
 * - 完全透传 ref / contentMotion / overlayClassName / autoScale / onInteractOutside
 *   等所有 DialogContent 行为；用法跟原生 DialogContent 一致，只多 `variant` 和
 *   `bodyClassName` 两个 prop。
 *
 * 实现要点：
 * - **不**在 outer className 里加 `position` 类（如 `relative`）——会跟 DialogContent
 *   自带的 `fixed` 冲突，twMerge 让 later 的赢，结果丢掉 viewport 居中定位，弹窗
 *   会偏到莫名其妙的位置。
 * - `!bg-transparent !border-0 !p-0`：用 important 干掉 shadcn 默认的 `bg-background` /
 *   `border` / `p-6`，再用 inline `style` 套上调色板的渐变 + 4px 厚色边
 *   （inline style 优先级最高，无需操心 twMerge 边坑）。`p-0` 让出空间给内层 body
 *   自己 padding。
 * - `overflow-hidden`：让装饰层贴边裁圆角，跟外部 4px 厚边内沿严丝合缝。outer 不
 *   滚动，scroll 都在 body 上。
 * - **outer 装饰 + inner 滚动**：装饰挂在 outer DialogContent（非滚动），内层 body
 *   div 单独 `overflow-y-auto`。这样滚动 body 内容时装饰始终框住整个 modal viewport。
 * - body 用 `relative grid gap-4 p-6` 复刻原 DialogContent 的内部布局（grid + gap
 *   + 内 padding），并用 `relative` 让它在 stacking 顺序上压在 absolute 装饰之上。
 * - 装饰全部 `pointer-events-none`，X 关闭按钮（`<DialogContent>` 内置在 children
 *   之后渲染，绝对定位 right-4 top-4）的点击不受影响。
 */
export const CardBackDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  CardBackDialogContentProps
>(({ variant, className, bodyClassName, style, children, ...rest }, ref) => {
  const theme = CARD_BACK_THEMES[variant];
  return (
    <DialogContent
      ref={ref}
      {...rest}
      className={cn('!bg-transparent !border-0 !p-0 overflow-hidden', className)}
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
      <div className={cn('relative grid gap-4 p-6', bodyClassName)}>
        {children}
      </div>
    </DialogContent>
  );
});
CardBackDialogContent.displayName = 'CardBackDialogContent';
