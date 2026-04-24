import { memo, useEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Backpack as BackpackIcon, Recycle as RecycleIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StackedCardPile from './StackedCardPile';
import { initMobileDrop, type DragData } from '../utils/mobileDragDrop';
import { cn } from '@/lib/utils';
import { GameCardData } from './GameCard';
import { useGameViewport } from '@/contexts/GameViewportContext';
import { FLAT_ASPECT_RATIO } from './game-board/constants';
import { useGameEvent } from '@/hooks/useGameEngine';
import { captureModalOriginFromEvent } from '@/lib/modalOriginAnchor';

/**
 * 「回收袋洗入背包」绿色环旋转动画的持续时间（ms）。
 * 监听 `waterfall:recycleRestored` side effect 触发；动画期间在 cell 上叠一层
 * 半透明绿色圆环 + 旋转的 Recycle 图标。
 */
const RECYCLE_ANIM_DURATION_MS = 1400;

/**
 * 旋转的绿色 Recycle 环 overlay。pointer-events-none，不抢点击 / 拖拽。
 * 不传 `nonce` / `nonce === 0` 时不渲染——靠父级条件渲染控制显示时机。
 *
 * `mode='ring'`：完整圆环（用于非折叠 cell 模式，空间足）。
 * `mode='glow'`：仅旋转的 Recycle 图标 + 绿色光晕（用于 compact 折叠小条，空间窄）。
 */
function RecycleRestoreOverlay({
  nonce,
  mode,
}: {
  nonce: number;
  mode: 'ring' | 'glow';
}) {
  if (nonce === 0) return null;
  if (mode === 'glow') {
    return (
      <span
        key={`recycle-anim-${nonce}`}
        className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
        aria-hidden
      >
        <span
          className="absolute inset-0 rounded-l-lg"
          style={{
            boxShadow:
              '0 0 16px 4px rgba(34, 197, 94, 0.55), inset 0 0 12px 2px rgba(34, 197, 94, 0.35)',
            animation: `dh-recycle-pulse ${RECYCLE_ANIM_DURATION_MS}ms ease-out forwards`,
          }}
        />
        <RecycleIcon
          className="relative h-3.5 w-3.5 text-green-300 drop-shadow-[0_0_4px_rgba(34,197,94,0.9)] animate-spin"
          style={{ animationDuration: `${RECYCLE_ANIM_DURATION_MS}ms` }}
        />
      </span>
    );
  }
  return (
    <div
      key={`recycle-anim-${nonce}`}
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
      aria-hidden
    >
      {/* 绿色光晕背板（淡入淡出） */}
      <div
        className="absolute inset-0 rounded-xl"
        style={{
          boxShadow:
            '0 0 24px 6px rgba(34, 197, 94, 0.55), inset 0 0 18px 3px rgba(34, 197, 94, 0.30)',
          animation: `dh-recycle-pulse ${RECYCLE_ANIM_DURATION_MS}ms ease-out forwards`,
        }}
      />
      {/* 旋转的绿色环：用 conic-gradient 切出 ~70% 圆弧，剩下透明，旋转时形成"loader 环"视觉。
          顶部留缺口让它看起来在转，而不是单纯的纯色环。 */}
      <div
        className="absolute rounded-full animate-spin"
        style={{
          // 控制环大小：保持在 cell 内、留 6px 内边距
          inset: '6px',
          // conic-gradient 切环的常用技巧：用一个深绿环 + 一个透明到完全填充的渐变
          background:
            'conic-gradient(from 0deg, rgba(34,197,94,0) 0deg, rgba(34,197,94,0.95) 90deg, rgba(74,222,128,1) 270deg, rgba(34,197,94,0) 360deg)',
          // mask 出一个圆环（中间挖空）
          WebkitMask:
            'radial-gradient(circle, transparent 0, transparent calc(50% - 5px), #000 calc(50% - 4px), #000 50%, transparent calc(50% + 1px))',
          mask:
            'radial-gradient(circle, transparent 0, transparent calc(50% - 5px), #000 calc(50% - 4px), #000 50%, transparent calc(50% + 1px))',
          animationDuration: `${Math.round(RECYCLE_ANIM_DURATION_MS * 0.7)}ms`,
          animationIterationCount: '2',
          filter: 'drop-shadow(0 0 6px rgba(34, 197, 94, 0.7))',
        }}
      />
      {/* 中央 Recycle 图标，反向慢转一下，强化"循环"语义 */}
      <RecycleIcon
        className="relative h-7 w-7 text-green-200 drop-shadow-[0_0_8px_rgba(34,197,94,0.9)] animate-spin"
        style={{
          animationDuration: `${RECYCLE_ANIM_DURATION_MS}ms`,
          animationDirection: 'reverse',
        }}
      />
    </div>
  );
}

interface BackpackZoneProps {
  backpackCount: number;
  capacity: number;
  /**
   * 回收袋（permanentMagicRecycleBag）当前张数。展示在背包数下方的紫色小 chip 里，
   * 让玩家在不打开背包详情的情况下也能看到永久魔法 / 永恒护符的循环进度。
   */
  recycleCount?: number;
  onDrop?: (card: GameCardData) => void;
  isDropTarget?: boolean;
  onOpenViewer?: () => void;
  compact?: boolean;
  compactStyle?: CSSProperties;
  /**
   * Optional ref forwarded to the compact-mode button element so callers
   * (e.g. backpack→hand flight animation) can read its DOM rect when the
   * full-size hero-row backpack cell is not mounted (narrow layout).
   */
  compactCellRef?: Ref<HTMLButtonElement>;
}

function BackpackZoneInner({
  backpackCount,
  capacity,
  recycleCount = 0,
  onDrop,
  isDropTarget,
  onOpenViewer,
  compact = false,
  compactStyle,
  compactCellRef,
}: BackpackZoneProps) {
  const { t } = useTranslation();
  const gameViewport = useGameViewport();
  const isFlat = gameViewport.width / gameViewport.height > FLAT_ASPECT_RATIO;
  const dropRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef<HTMLButtonElement>(null);
  const [dragDepth, setDragDepth] = useState(0);
  const isOver = dragDepth > 0;
  // Touch devices (primary pointer = coarse). On touch, the wider invisible
  // `hitExtension` is disabled so the outer button never covers neighbouring
  // elements (e.g. the right equipment slot). Mouse-driven HTML5 drag keeps
  // the wider hit area for pointer precision.
  const [isTouchDevice] = useState(() =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );

  // 「回收袋 → 背包」动画：监听 reducer 发出的 waterfall:recycleRestored side effect。
  // 每次触发都换一个 nonce 让 React 重新挂载动画 div，从而即便短时间内连续两次
  // 也都能各自完整播完一轮（避免靠 boolean 切换导致的"丢动画"）。
  const [recycleAnimNonce, setRecycleAnimNonce] = useState(0);
  const recycleAnimTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useGameEvent('waterfall:recycleRestored', () => {
    setRecycleAnimNonce(n => n + 1);
    if (recycleAnimTimeoutRef.current) clearTimeout(recycleAnimTimeoutRef.current);
    recycleAnimTimeoutRef.current = setTimeout(() => {
      setRecycleAnimNonce(0);
      recycleAnimTimeoutRef.current = null;
    }, RECYCLE_ANIM_DURATION_MS);
  });
  useEffect(() => () => {
    if (recycleAnimTimeoutRef.current) clearTimeout(recycleAnimTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!dropRef.current || !onDrop) return;

    const cleanup = initMobileDrop(
      dropRef.current,
      (dragData) => {
        if (dragData.type === 'card') {
          onDrop(dragData.data as GameCardData);
        }
      },
      ['card']
    );

    return cleanup;
  }, [onDrop]);

  // Mobile drop registration. On touch the outer button has no hit-extension
  // (see `hitExtension` below), so it exactly matches the visible strip.
  useEffect(() => {
    if (!compact || !compactRef.current || !onDrop) return;
    const cleanup = initMobileDrop(
      compactRef.current,
      (dragData) => {
        if (dragData.type === 'card') {
          onDrop(dragData.data as GameCardData);
        }
      },
      ['card']
    );
    return cleanup;
  }, [compact, onDrop]);

  // Mobile: mirror onDragEnter/onDragLeave by tracking touch position over the
  // compact button so the scale-up "drop target" effect also works on touch.
  useEffect(() => {
    if (!compact || !isDropTarget) {
      setDragDepth(0);
      return;
    }

    let inside = false;
    const handleMobileMove = (e: Event) => {
      const detail = (e as CustomEvent).detail as DragData | undefined;
      if (!detail || detail.type !== 'card') return;
      const el = compactRef.current;
      if (!el) return;
      const cx = detail.clientX;
      const cy = detail.clientY;
      if (typeof cx !== 'number' || typeof cy !== 'number') return;
      const rect = el.getBoundingClientRect();
      const within = cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
      if (within !== inside) {
        inside = within;
        setDragDepth(within ? 1 : 0);
      }
    };
    const handleMobileEnd = () => {
      if (inside) {
        inside = false;
        setDragDepth(0);
      }
    };

    document.addEventListener('mobile-drag-move', handleMobileMove);
    document.addEventListener('mobile-drag-end', handleMobileEnd);
    return () => {
      document.removeEventListener('mobile-drag-move', handleMobileMove);
      document.removeEventListener('mobile-drag-end', handleMobileEnd);
    };
  }, [compact, isDropTarget]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (isDropTarget) {
      setDragDepth((prev) => prev + 1);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (isDropTarget && dragDepth === 0) {
      setDragDepth(1);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (isDropTarget) {
      setDragDepth((prev) => Math.max(0, prev - 1));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragDepth(0);
    const cardData = e.dataTransfer.getData('card');
    if (cardData) {
      onDrop?.(JSON.parse(cardData));
    }
  };

  /**
   * Capture this cell's screen rect so the viewer modal can grow its
   * open animation outward from here (transform-origin = cell center).
   * See `lib/modalOriginAnchor.ts` + `hooks/use-dialog-origin-anchor.ts`.
   */
  const handleOpenViewerClick = (e: React.MouseEvent<HTMLElement>) => {
    captureModalOriginFromEvent(e);
    onOpenViewer?.();
  };

  if (compact) {
    // The visible "strip" is intentionally narrow (so it sits flush against
    // the screen's right edge), but a narrow strip is hard to hit while
    // dragging. We expand the drop hit-area leftward by giving the outer
    // button a larger transparent width; the visible strip is rendered as
    // a right-aligned inner span so the look stays exactly the same.
    //
    // A small baseline extension (`HIT_EXTENSION_BASE`) is always applied so
    // the narrow visible strip is easier to click. While a drop-eligible card
    // is being dragged on a mouse device we widen further for drop precision.
    const stripWidth =
      typeof compactStyle?.width === 'number' ? compactStyle.width : 22;
    const stripHeight =
      typeof compactStyle?.height === 'number' ? compactStyle.height : 100;
    const HIT_EXTENSION_BASE = 12;
    const dragExtension = isDropTarget && !isTouchDevice
      ? Math.max(48, Math.round(stripHeight * 0.4))
      : 0;
    const hitExtension = Math.max(HIT_EXTENSION_BASE, dragExtension);
    const outerStyle: CSSProperties = {
      ...compactStyle,
      width: stripWidth + hitExtension,
    };
    const innerStyle: CSSProperties = { width: stripWidth, height: '100%' };

    return (
      <button
        ref={(el) => {
          compactRef.current = el;
          if (typeof compactCellRef === 'function') {
            compactCellRef(el);
          } else if (compactCellRef) {
            (compactCellRef as React.MutableRefObject<HTMLButtonElement | null>).current = el;
          }
        }}
        onClick={handleOpenViewerClick}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid="slot-backpack-compact"
        className="group relative flex items-stretch justify-end bg-transparent border-0 p-0 cursor-pointer"
        style={outerStyle}
      >
        <span
          className={cn(
            'flex flex-col items-center justify-center rounded-l-lg border border-r-0 transition-all duration-150',
            isDropTarget && isOver
              ? 'border-amber-300 bg-amber-500/30 text-white ring-2 ring-amber-400/60 scale-110'
              : isDropTarget
                ? 'border-primary/50 bg-amber-700/30 text-amber-200 animate-pulse'
                : 'border-amber-400/30 bg-amber-800/20 text-amber-200/80 group-hover:bg-amber-700/30 group-hover:border-amber-400/50'
          )}
          style={innerStyle}
        >
          <BackpackIcon className="w-4 h-4" />
          {backpackCount > 0 && (
            <span
              className="mt-0.5 px-1 rounded text-[10px] font-bold leading-none text-white bg-amber-500/90 ring-1 ring-amber-200/70 shadow-sm"
              title={t('cardBack.backpackTooltip', { count: backpackCount })}
            >
              {backpackCount}
            </span>
          )}
          {recycleCount > 0 && (
            // Compact 小条只有 ~22px 宽，加 Recycle 图标会把 chip 撑得比小条还宽、
            // 向左溢出盖住上面的黄色背包 chip。这里只保留数字，靠紫色色块跟黄色背包数字区分。
            <span
              className="mt-0.5 px-1 rounded text-[10px] font-bold leading-none text-white bg-violet-500/90 ring-1 ring-violet-200/70 shadow-sm"
              title={t('cardBack.recycleTooltip', { count: recycleCount })}
              data-testid="backpack-recycle-chip-compact"
            >
              {recycleCount}
            </span>
          )}
          <RecycleRestoreOverlay nonce={recycleAnimNonce} mode="glow" />
        </span>
      </button>
    );
  }

  return (
    <Card
      ref={dropRef}
      data-testid="slot-backpack"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleOpenViewerClick}
      className={cn(
        // overflow-visible：让 StackedCardPile 的"一摞牌"溢出 cell 上沿（与 Graveyard / ClassDeck 同款）。
        // 主色调：深蓝（blue 系）—— 配合 StackedCardPile variant="blue" 的深蓝卡背一起定调为"深海蓝"。
        'relative h-full w-full cursor-pointer overflow-visible border-2 border-dashed border-blue-400/50 bg-gradient-to-br from-blue-950/60 via-blue-900/35 to-indigo-900/20 transition-[border-color,background-color,transform] duration-200',
        isDropTarget && 'border-primary border-4 bg-primary/10 animate-pulse',
        isDropTarget && isOver && 'ring-4 ring-primary bg-primary/20 scale-[1.01]',
        !isDropTarget && 'hover:scale-[1.01]'
      )}
    >
      {isFlat ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/90">
          <span className="dh-hero-small font-semibold uppercase tracking-wide">{t('cardBack.cell.backpack')}</span>
          <span className="font-mono font-bold text-lg">{backpackCount}</span>
          {recycleCount > 0 && (
            <span
              className="mt-0.5 inline-flex items-center gap-[2px] rounded px-1 text-[10px] font-bold leading-none text-white bg-violet-500/90 ring-1 ring-violet-200/70 shadow-sm"
              title={t('cardBack.recycleTooltip', { count: recycleCount })}
              data-testid="backpack-recycle-chip-flat"
            >
              <RecycleIcon className="h-2.5 w-2.5" />
              {recycleCount}
            </span>
          )}
        </div>
      ) : (
        <>
          <StackedCardPile
            count={backpackCount}
            className="rounded-xl"
            label={t('cardBack.cell.backpack')}
            variant="blue"
            secondaryCount={recycleCount}
            secondaryIcon={RecycleIcon}
            secondaryTitle={recycleCount > 0 ? t('cardBack.recycleTooltip', { count: recycleCount }) : undefined}
          />
          {/*
            Mobile padding bump (p-1 → p-1.5) keeps the right-aligned chip column
            from kissing the rounded cell edge — combined with the shrunken
            badge font/padding below, the chips visibly sit inside the cell on
            small viewports. Desktop p-3 unchanged.
          */}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-1.5 sm:p-3 text-white/90">
            <div className="flex items-center justify-between dh-hero-small uppercase tracking-wide">
              <span className="font-semibold">{t('cardBack.cell.backpack')}</span>
              <div className="flex flex-col items-end gap-0.5">
                <Badge
                  className="bg-amber-500/90 text-white font-mono text-[9px] leading-none sm:dh-hero-chip px-1 py-0 sm:px-2 sm:py-0.5 ring-1 ring-amber-200/70 hover:bg-amber-500/90"
                  title={t('cardBack.backpackTooltip', { count: backpackCount })}
                >
                  {backpackCount}
                </Badge>
                {recycleCount > 0 && (
                  <Badge
                    className="bg-violet-500/90 text-white font-mono text-[9px] leading-none sm:dh-hero-chip px-1 py-0 sm:px-2 sm:py-0.5 ring-1 ring-violet-200/70 inline-flex items-center gap-0.5 sm:gap-1 hover:bg-violet-500/90"
                    title={t('cardBack.recycleTooltip', { count: recycleCount })}
                    data-testid="backpack-recycle-chip"
                  >
                    <RecycleIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    {recycleCount}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end dh-hero-chip font-medium">
              {t('cardBack.viewContents')}
            </div>
          </div>
        </>
      )}
      <RecycleRestoreOverlay nonce={recycleAnimNonce} mode="ring" />
    </Card>
  );
}

export default memo(BackpackZoneInner);
