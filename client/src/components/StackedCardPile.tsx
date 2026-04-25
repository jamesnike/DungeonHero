import cardBackImage from '@assets/generated_images/card_back_design.png';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { memo, useMemo } from 'react';
import { useGameViewport } from '@/contexts/GameViewportContext';
import { CARD_BACK_THEMES, type CardBackVariant, type CardBackTheme } from '@/lib/cardBackTheme';

type StackVariant = CardBackVariant;

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
  secondaryIcon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
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
 *
 * 调色板已抽到 [`@/lib/cardBackTheme`](../lib/cardBackTheme.ts)，
 * 让弹窗外框（`CardBackDialogContent`）能复用同一套颜色。
 */
const variantTheme = CARD_BACK_THEMES;
type VariantTheme = CardBackTheme;

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
 * Deck cell 中央 cartouche —— 跟 [`PreviewRow.tsx CardBackEmblem`] 一样用
 * cqi（container query inline size）+ em 相对单位做**真正的流式缩放**：cell
 * 越宽字越大，cell 越窄字越小。父级 `DeckBack` 的根 div 设了
 * `containerType: 'inline-size'`，所以 `cqi` 在这里 = 1% × cell 宽度。
 *
 * label 字数仍然影响一档"基准字号"——长 label（"Knight Deck" / "Graveyard"）
 * 用更小的 clamp 上限，避免在大 cell 上撑出 cartouche；短 label（"背包"
 * "墓地"）允许长得更大。tracking 也按字数微调。
 *
 * 历史：以前是 `text-lg sm:text-xl` 这种**只在 640px 切一档**的离散尺寸，
 * 玩家在不同屏幕上感知不到字真的随 cell 大小变。改成 cqi 之后从手机到大
 * 屏 cell 字号是连续平滑的。
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
  secondaryIcon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  secondaryTitle?: string;
}) {
  const len = label.length;
  // baseSize = 整个 cartouche 的"em 锚"。下面 label / count / flourish / 间距
  // 全部用 em 相对它，所以只要这一档随 cell 宽度变，整个 cartouche 就跟着等比缩放。
  // clamp 三参数：min（手机迷你 cell 不至于看不清）/ ideal（cqi 流式）/ max（大屏不至于撑爆）。
  //
  // 四档：
  //   ≤2 字（"背包" / "坟场"）—— 宽字距、最大字号，cartouche 显眼
  //   3–4 字（"骑士牌库"）—— 字距大幅收紧，否则 4 字 × 0.4em tracking 会把 cartouche 撑爆
  //   5–7 字（备用：中文带后缀 / 短英文）—— 进一步收紧
  //   ≥8 字（"Backpack" 8 / "Graveyard" 9 / "Knight Deck" 11）—— 最紧档，确保窄 cell 也能完整渲染
  // padX / tracking / labelScale 三个维度一起作用，不只压字号。
  const sizing =
    len <= 2
      ? { baseSize: 'clamp(0.7rem, 13cqi, 1.5rem)', tracking: '0.4em', padX: '1em', labelScale: '1em' }
      : len <= 4
        ? { baseSize: 'clamp(0.55rem, 10cqi, 1.2rem)', tracking: '0.1em', padX: '0.65em', labelScale: '0.95em' }
        : len <= 7
          ? { baseSize: 'clamp(0.5rem, 9cqi, 1.05rem)', tracking: '0.08em', padX: '0.6em', labelScale: '0.92em' }
          : { baseSize: 'clamp(0.4rem, 6.5cqi, 0.78rem)', tracking: '0.04em', padX: '0.5em', labelScale: '0.88em' };

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center select-none px-1"
      style={{
        color: theme.ink,
        fontSize: sizing.baseSize,
        gap: '0.45em',
      }}
    >
      {/* 上 flourish —— 宽度用 em 相对 baseSize，所以也跟着流式缩放 */}
      <svg
        viewBox="0 0 84 10"
        aria-hidden
        className="opacity-90"
        style={{ width: '5.6em', height: 'auto', display: 'block' }}
      >
        <line x1="0" y1="5" x2="33" y2="5" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
        <line x1="51" y1="5" x2="84" y2="5" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
        <path d="M42 1 L46 5 L42 9 L38 5 Z" fill="currentColor" />
      </svg>
      {/* 类型字底板：padding / radius 也用 em，让底板随字号一起缩放 */}
      <div
        className="relative max-w-full"
        style={{
          padding: `0.35em ${sizing.padX}`,
          borderRadius: '0.9em',
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(2px)',
        }}
      >
        <span
          className="font-serif font-bold whitespace-nowrap block"
          style={{
            fontSize: sizing.labelScale,
            lineHeight: 1,
            letterSpacing: sizing.tracking,
            textShadow: `0 0 8px ${theme.glow}, 0 1px 0 rgba(0,0,0,0.6)`,
          }}
        >
          {label}
        </span>
      </div>
      {/* count —— 用 em 跟 label 一起缩放（约 0.95× label） */}
      <p
        className="font-serif font-bold"
        style={{
          fontSize: '0.95em',
          letterSpacing: '0.1em',
          marginTop: '0.1em',
          color: theme.countColor,
          textShadow: `0 1px 0 rgba(0,0,0,0.5)`,
        }}
      >
        {count}
      </p>
      {typeof secondaryCount === 'number' && secondaryCount > 0 && (
        // 仅 icon + 数字，不加背景按钮 / 边框 —— 让它跟卡背中央 cartouche 的
        // count 数字视觉风格一致（同样 serif、同样 textShadow），只是颜色用紫
        // 调跟主 count 区分开。字号也走 em，跟着流式缩放。
        <span
          className="inline-flex items-center font-serif font-bold"
          style={{
            fontSize: '0.7em',
            letterSpacing: '0.1em',
            gap: '0.3em',
            marginTop: '0.15em',
            color: '#ddd6fe', // violet-200，跟卡背深蓝底搭，跟主 count 的浅蓝错开
            textShadow: '0 1px 0 rgba(0,0,0,0.5)',
          }}
          title={secondaryTitle}
          data-testid="stacked-pile-secondary-chip"
        >
          {SecondaryIcon && (
            // 用 inline style + em 让 icon 跟字一起流式缩放
            // （tailwind h-3/w-3 是死的 12px，会跟周围 em 字号脱节）
            <SecondaryIcon style={{ width: '1em', height: '1em' }} />
          )}
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
  secondaryIcon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
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
        // 让 DeckCartouche 内的 cqi 单位以 cell 宽度为基准做流式缩放——跟
        // PreviewRow.PreviewCardBack 同款 container query 模式。没有这一行
        // cqi 会回退到视口（vi），cartouche 字号就跟 cell 宽度脱节了。
        containerType: 'inline-size',
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
