import cardBackImage from '@assets/generated_images/card_back_design.png';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { memo, useMemo } from 'react';
import { useGameViewport } from '@/contexts/GameViewportContext';

type StackVariant = 'bright' | 'muted' | 'blue';

interface StackedCardPileProps {
  count: number;
  maxLayers?: number;
  className?: string;
  cardBackSrc?: string;
  emptyLabel?: string;
  variant?: StackVariant;
  label?: string;
  /**
   * 可选的次级计数（目前只有 Backpack 用：把回收袋张数显示在主 count 下方）。
   * 配合 `secondaryIcon` 一起，渲染成一个紫色小 chip。
   */
  secondaryCount?: number;
  /**
   * 次级 chip 前缀的图标（例如 lucide 的 `Recycle`）。可选。
   */
  secondaryIcon?: React.ComponentType<{ className?: string }>;
  /**
   * 次级 chip 的 hover title，可选。
   */
  secondaryTitle?: string;
}

/**
 * Card-back 视觉风格调色板：与 [`PreviewRow.tsx` 的 PreviewCardBack] 同一套设计语言
 * （类型暗调渐变 + cardBack 花纹叠 overlay + 四角 L + 1px 内方框线 + 中央 cartouche）。
 * Graveyard / Backpack 用 `muted`（slate 色），ClassDeck 用 `bright`（gold 色）。
 *
 * 不复用 PreviewRow 的 `CARD_TYPE_*` 表是因为 graveyard / backpack / 专属卡池 不属于
 * "卡牌类型" 维度，给它们独立的语义色更直白。
 */
const variantTheme: Record<StackVariant, {
  borderHex: string;            // 外 4px 厚边色（inline style 设，绕 twMerge 灰边坑）
  bg: string;                   // top card 的 body 渐变（CSS background）
  layerBg: string;              // 后面那些 stack layer 的更暗 / 偏色，对比 top card
  ink: string;                  // cartouche / corner L / 字色
  glow: string;                 // 字 textShadow 发光色
  insetBorderClass: string;     // 1px 内方框线（同位 PreviewRow 的 INSET）
  shadow: string;               // 投影色（动效阴影）
  countColor: string;           // 中央 count 文本色
}> = {
  // 相比原版 ~↓40% 饱和度（保持低饱和），明度回提到约原版的 90%
  bright: {
    borderHex: '#a16207',                                                   // yellow-700
    bg: 'linear-gradient(180deg, #3d2a14 0%, #6a4525 100%)',                // 旧 amber 去饱和、明度回提
    layerBg: 'linear-gradient(180deg, #221808 0%, #3d2a14 100%)',           // 更深
    ink: '#fde68a',                                                          // amber-200
    glow: 'rgba(251, 191, 36, 0.55)',                                        // amber-400
    insetBorderClass: 'border-amber-400/35',
    shadow: 'rgba(180, 83, 9, 0.45)',                                        // amber-700/45
    countColor: '#fef3c7',                                                   // amber-100
  },
  muted: {
    borderHex: '#475569',                                                   // slate-600
    bg: 'linear-gradient(180deg, #181d28 0%, #2a3040 100%)',                // 旧 slate 去饱和、明度回提
    layerBg: 'linear-gradient(180deg, #0c111c 0%, #181d28 100%)',           // 更深
    ink: '#cbd5e1',                                                          // slate-300
    glow: 'rgba(148, 163, 184, 0.55)',                                       // slate-400
    insetBorderClass: 'border-slate-400/30',
    shadow: 'rgba(15, 23, 42, 0.45)',                                        // slate-900/45
    countColor: '#e2e8f0',                                                   // slate-200
  },
  // 深蓝（Backpack 专用）
  blue: {
    borderHex: '#1d4ed8',                                                   // blue-700
    bg: 'linear-gradient(180deg, #1c2542 0%, #324068 100%)',                // 旧 blue 去饱和、明度回提
    layerBg: 'linear-gradient(180deg, #0f152a 0%, #1c2542 100%)',           // 更深
    ink: '#bfdbfe',                                                          // blue-200，cartouche / 四角 L 字色
    glow: 'rgba(96, 165, 250, 0.55)',                                        // blue-400
    insetBorderClass: 'border-blue-400/30',
    shadow: 'rgba(30, 58, 138, 0.45)',                                       // blue-900/45
    countColor: '#dbeafe',                                                   // blue-100
  },
};

const MOBILE_MAX_LAYERS = 5;
const MOBILE_WIDTH_THRESHOLD = 768;

/**
 * 单张 stack layer 的卡背：极简版本（只有"渐变底 + cardBack 花纹 overlay + 钻石格 + 1px 内框"）。
 * 不画四角 L 和中央 cartouche——那些保留给最上层的 [DeckBack 居中卡] 当焦点，避免堆叠时一片刺眼。
 */
function StackLayerBack({ src, theme }: { src: string; theme: typeof variantTheme[StackVariant] }) {
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[0.6rem]"
      style={{
        border: `2px solid ${theme.borderHex}`,
        background: theme.layerBg,
      }}
    >
      {/* 卡背容器：历史上贴过 cardBack PNG overlay，现已移除（与新的渐变底色 +
          类型色 emblem 视觉冲突）。保留这个 inset 容器是因为下面的钻石格纹理
          子层靠它做相对定位。 */}
      <div className="absolute inset-[2px] overflow-hidden rounded-[0.45rem]">
        <div
          className="absolute inset-0 pointer-events-none opacity-15 mix-blend-overlay"
          style={{
            backgroundImage: `
              repeating-linear-gradient(45deg,  rgba(255,255,255,0.18) 0 1px, transparent 1px 12px),
              repeating-linear-gradient(-45deg, rgba(255,255,255,0.18) 0 1px, transparent 1px 12px)
            `,
          }}
        />
      </div>
      <div
        className={`absolute pointer-events-none rounded-[0.4rem] inset-[3px] border ${theme.insetBorderClass}`}
        aria-hidden
      />
    </div>
  );
}

/**
 * 适配 Deck cell 较窄宽度的 cartouche——根据 label 字符数选 size/tracking 三档：
 *   - <= 4 字（中文居多，如 "战士牌组" / "墓地"）：大字 + 宽字距
 *   - 5–8 字 ("Backpack")：中字 + 中字距
 *   - >= 9 字 ("Graveyard" / 长 deckName)：小字 + 紧字距
 * 用 label 字数粗略代理"实际渲染宽度"，对中英文都基本成立（中文 1 字 ≈ 英文 ~1.6 字宽，
 * 但中文 label 普遍很短，所以该启发就够用了）。
 */
function DeckCartouche({
  label,
  count,
  theme,
  secondaryCount,
  secondaryIcon: SecondaryIcon,
  secondaryTitle,
}: {
  label: string;
  count: number;
  theme: typeof variantTheme[StackVariant];
  secondaryCount?: number;
  secondaryIcon?: React.ComponentType<{ className?: string }>;
  secondaryTitle?: string;
}) {
  const len = label.length;
  const sizing =
    len <= 4
      ? { text: 'text-lg sm:text-xl', tracking: 'tracking-[0.4em]', px: 'px-5 py-1.5 sm:px-7 sm:py-2', flourishW: 80 }
      : len <= 8
        ? { text: 'text-sm sm:text-base', tracking: 'tracking-[0.18em]', px: 'px-4 py-1 sm:px-5 sm:py-1.5', flourishW: 70 }
        : { text: 'text-xs sm:text-sm', tracking: 'tracking-[0.1em]', px: 'px-3 py-1 sm:px-4 sm:py-1.5', flourishW: 60 };

  const flourishLineEnd = sizing.flourishW * 0.395;
  const flourishLineStart = sizing.flourishW - flourishLineEnd;
  const flourishCenter = sizing.flourishW / 2;

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 select-none px-1"
      style={{ color: theme.ink }}
    >
      {/* 上 flourish */}
      <svg width={sizing.flourishW} height="10" viewBox={`0 0 ${sizing.flourishW} 10`} aria-hidden className="opacity-90">
        <line x1="0" y1="5" x2={flourishLineEnd} y2="5" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
        <line x1={flourishLineStart} y1="5" x2={sizing.flourishW} y2="5" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
        <path d={`M${flourishCenter} 1 L${flourishCenter + 4} 5 L${flourishCenter} 9 L${flourishCenter - 4} 5 Z`} fill="currentColor" />
      </svg>
      {/* 类型字底板（去掉了双线白边框，只保留半透明深色板提升对比） */}
      <div
        className={`relative ${sizing.px} rounded-[14px] max-w-full`}
        style={{
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(2px)',
        }}
      >
        <span
          className={`font-serif font-bold ${sizing.text} ${sizing.tracking} whitespace-nowrap block`}
          style={{
            textShadow: `0 0 8px ${theme.glow}, 0 1px 0 rgba(0,0,0,0.6)`,
          }}
        >
          {label}
        </span>
      </div>
      {/* count */}
      <p
        className="mt-0.5 font-serif font-bold text-sm sm:text-base tracking-widest"
        style={{ color: theme.countColor, textShadow: `0 1px 0 rgba(0,0,0,0.5)` }}
      >
        {count}
      </p>
      {typeof secondaryCount === 'number' && secondaryCount > 0 && (
        // 仅 icon + 数字，不加背景按钮 / 边框 —— 让它跟卡背中央 cartouche 的
        // count 数字视觉风格一致（同样 serif、同样 textShadow），只是颜色用紫
        // 调跟主 count 区分开。
        <span
          className="mt-0.5 inline-flex items-center gap-1 font-serif font-bold text-xs sm:text-sm tracking-widest"
          style={{
            color: '#ddd6fe', // violet-200，跟卡背深蓝底搭，跟主 count 的浅蓝错开
            textShadow: '0 1px 0 rgba(0,0,0,0.5)',
          }}
          title={secondaryTitle}
          data-testid="stacked-pile-secondary-chip"
        >
          {SecondaryIcon && <SecondaryIcon className="h-3 w-3" />}
          {secondaryCount}
        </span>
      )}
    </div>
  );
}

/**
 * 居中"焦点卡背"：完整复刻 PreviewCardBack 的全套设计（4px 类型色边 + 类型色暗调渐变
 * + cardBack overlay + 钻石格纹理 + 中央光晕 + 四角 L + 中央 cartouche + 1px 内框）。
 * 中央 cartouche 显示 `label`（如 Graveyard / Backpack / 战士牌组），下面 count 数字。
 */
function DeckBack({
  label,
  count,
  src,
  theme,
  secondaryCount,
  secondaryIcon,
  secondaryTitle,
}: {
  label: string;
  count: number;
  src: string;
  theme: typeof variantTheme[StackVariant];
  secondaryCount?: number;
  secondaryIcon?: React.ComponentType<{ className?: string }>;
  secondaryTitle?: string;
}) {
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-2xl"
      style={{
        borderWidth: '4px',
        borderStyle: 'solid',
        borderColor: theme.borderHex,
        background: theme.bg,
        boxShadow: `0 6px 14px ${theme.shadow}`,
      }}
    >
      {/* 卡背容器：历史上贴过 cardBack PNG overlay，现已移除（与新的渐变底色 +
          类型色 emblem 视觉冲突）。保留这个 inset 容器是因为下面所有装饰子层
          （钻石格 / 中央光晕 / 四角 L / cartouche）都靠它做相对定位。 */}
      <div className="absolute inset-[6px] overflow-hidden rounded-xl">
        {/* 钻石格纹理 */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20 mix-blend-overlay"
          style={{
            backgroundImage: `
              repeating-linear-gradient(45deg,  rgba(255,255,255,0.18) 0 1px, transparent 1px 12px),
              repeating-linear-gradient(-45deg, rgba(255,255,255,0.18) 0 1px, transparent 1px 12px)
            `,
          }}
        />
        {/* 中央光晕（淡） */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at center, rgba(255,255,255,0.08) 0%, transparent 55%)`,
          }}
        />
        {/* 四角 L 装饰 */}
        <div className="absolute inset-0 pointer-events-none" style={{ color: theme.ink }} aria-hidden>
          <div
            className="absolute top-1 left-1 w-3.5 h-3.5 rounded-tl-sm"
            style={{ borderTop: '1.5px solid currentColor', borderLeft: '1.5px solid currentColor', opacity: 0.7 }}
          />
          <div
            className="absolute top-1 right-1 w-3.5 h-3.5 rounded-tr-sm"
            style={{ borderTop: '1.5px solid currentColor', borderRight: '1.5px solid currentColor', opacity: 0.7 }}
          />
          <div
            className="absolute bottom-1 left-1 w-3.5 h-3.5 rounded-bl-sm"
            style={{ borderBottom: '1.5px solid currentColor', borderLeft: '1.5px solid currentColor', opacity: 0.7 }}
          />
          <div
            className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-br-sm"
            style={{ borderBottom: '1.5px solid currentColor', borderRight: '1.5px solid currentColor', opacity: 0.7 }}
          />
        </div>
        {/* 中央 cartouche + count。
            Deck cell 比 Preview Row 窄一截，且 label 可能是 "Graveyard" / "Backpack" / 中文职业名等
            长度差很大的字串。这里**根据字数动态调字距/字号**，避免 cartouche 超出 cell 宽度。 */}
        <DeckCartouche
          label={label}
          count={count}
          theme={theme}
          secondaryCount={secondaryCount}
          secondaryIcon={secondaryIcon}
          secondaryTitle={secondaryTitle}
        />
      </div>
      {/* 1px 内方框线 */}
      <div
        className={`absolute pointer-events-none rounded-xl inset-[6px] border ${theme.insetBorderClass} z-30`}
        aria-hidden
      />
    </div>
  );
}

function StackedCardPileInner({
  count,
  maxLayers = 16,
  className,
  cardBackSrc = cardBackImage,
  emptyLabel = 'Empty',
  variant = 'muted',
  label,
  secondaryCount,
  secondaryIcon,
  secondaryTitle,
}: StackedCardPileProps) {
  const { width: vpWidth } = useGameViewport();
  const isMobile = vpWidth > 0 && vpWidth < MOBILE_WIDTH_THRESHOLD;
  const effectiveMaxLayers = isMobile ? Math.min(maxLayers, MOBILE_MAX_LAYERS) : maxLayers;

  const hasCards = count > 0;
  const layersToRender = hasCards ? Math.min(count, effectiveMaxLayers) : 0;
  const theme = variantTheme[variant];

  const layerConfigs = useMemo(() => {
    return Array.from({ length: layersToRender }, (_, idx) => {
      const depth = layersToRender - idx - 1;
      return {
        id: `stack-${idx}`,
        translateY: depth * 2.2,
        translateX: (Math.random() - 0.5) * Math.min(6, depth + 1),
        rotateZ: (Math.random() - 0.5) * 3,
        scale: 1 - depth * 0.02,
        opacity: hasCards ? 0.98 - depth * 0.04 : 0.3,
        brightness: 0.95 - depth * 0.03,
      };
    });
  }, [layersToRender, hasCards]);

  if (isMobile) {
    return (
      <div className={cn('relative h-full w-full overflow-visible', className)}>
        {layerConfigs.map((config, index) => (
          <div
            key={config.id}
            className="absolute inset-0"
            style={{
              zIndex: layersToRender - index,
              transform: `translate(${config.translateX}px, ${-config.translateY}px) rotate(${config.rotateZ}deg) scale(${config.scale})`,
              transition: 'transform 300ms ease-out',
              filter: `brightness(${config.brightness})`,
              opacity: config.opacity,
            }}
          >
            <StackLayerBack src={cardBackSrc} theme={theme} />
          </div>
        ))}

        {!hasCards && (
          <div className="absolute inset-0 flex items-center justify-center dh-deck-badge uppercase tracking-widest text-muted-foreground">
            {emptyLabel}
          </div>
        )}

        {hasCards && (
          <div
            className="absolute inset-0"
            style={{
              zIndex: layersToRender + 2,
              // 焦点卡和后面的 layer 一起向上抬升，让"一摞"整体溢出 cell 上沿，
              // 但 DeckBack 自身仍是 inset-0 满格大小（满足"顶层 = cell 尺寸"），
              // 只是被 transform 整体抬出 cell。父级 cell 是 overflow-visible，能露出来。
              transform: `translateY(${-layersToRender * 1.5}px)`,
              transition: 'transform 300ms ease-out',
            }}
          >
            <DeckBack
              label={label || 'Deck'}
              count={count}
              src={cardBackSrc}
              theme={theme}
              secondaryCount={secondaryCount}
              secondaryIcon={secondaryIcon}
              secondaryTitle={secondaryTitle}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('relative h-full w-full overflow-visible', className)}>
      {hasCards && (
        <motion.div
          className="absolute inset-x-8 bottom-1 h-6 rounded-full blur-xl"
          style={{ backgroundColor: theme.shadow }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        />
      )}
      {layerConfigs.map((config, index) => (
        <motion.div
          key={config.id}
          className="absolute inset-0"
          style={{ zIndex: layersToRender - index }}
          animate={{
            y: -config.translateY,
            x: config.translateX,
            rotateZ: config.rotateZ,
            scale: config.scale,
          }}
          transition={{ type: 'spring', stiffness: 160, damping: 20, mass: 0.7 }}
        >
          <motion.div
            className="h-full w-full"
            style={{
              filter: `brightness(${config.brightness})`,
              opacity: config.opacity,
            }}
            whileHover={{ y: -4, rotateZ: config.rotateZ * 1.5 }}
          >
            <StackLayerBack src={cardBackSrc} theme={theme} />
          </motion.div>
        </motion.div>
      ))}

      {!hasCards && (
        <div className="absolute inset-0 flex items-center justify-center dh-deck-badge uppercase tracking-widest text-muted-foreground">
          {emptyLabel}
        </div>
      )}

      {hasCards && (
        <motion.div
          className="absolute inset-0"
          style={{ zIndex: layersToRender + 2 }}
          // 焦点卡和后面的 layer 一起 spring 抬升，让"一摞牌"整体溢出 cell 上沿。
          // DeckBack 自身用 inset-0 保持和 cell 同尺寸（用户要求顶层 = cell 大小），
          // 只是被 motion transform 整体往上推；父级 cell 是 overflow-visible，能露出来。
          animate={{ y: -layersToRender * 1.5 }}
          transition={{ type: 'spring', stiffness: 140, damping: 18 }}
        >
          <DeckBack
            label={label || 'Deck'}
            count={count}
            src={cardBackSrc}
            theme={theme}
            secondaryCount={secondaryCount}
            secondaryIcon={secondaryIcon}
            secondaryTitle={secondaryTitle}
          />
        </motion.div>
      )}
    </div>
  );
}

export default memo(StackedCardPileInner);
