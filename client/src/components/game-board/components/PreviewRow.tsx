import React, { memo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import GameCard from '@/components/GameCard';
import type { CardType, GameCardData } from '@/components/GameCard';
import { Card } from '@/components/ui/card';
import { useGameState } from '@/hooks/useGameEngine';
import { DUNGEON_COLUMNS } from '../constants';
import type { GraveyardVector, WaterfallAnimationState, PendingMagicAction } from '../types';
import { getPreviewAnimationProps, getStackedCardStyle } from '../utils/animation-helpers';

const EMPTY_ARRAY: GameCardData[] = [];

// `CardType` → i18n key under `cardBack.type`. Two card types collapse to the
// same display label intentionally (`hero-magic` shows as "Magic" same as
// regular magic, since the back is supposed to leak only the broad category).
const CARD_TYPE_I18N_KEY: Partial<Record<CardType, string>> = {
  monster: 'monster',
  event: 'event',
  magic: 'magic',
  potion: 'potion',
  weapon: 'weapon',
  shield: 'shield',
  amulet: 'amulet',
  curse: 'curse',
  'hero-magic': 'heroMagic',
  building: 'building',
  skill: 'skill',
  coin: 'coin',
};

/**
 * 卡背边框颜色（hex）：与 [GameCard.tsx getCardBorderColor()] 的「基础类型 → tailwind 类」
 * 一对一对应的 hex 值。**用 inline style 设 borderColor 而不是 className**，是因为
 * shadcn `<Card>` 自带 `border-card-border` 这个非标准颜色 class，twMerge 不一定能
 * 识别它和 `border-red-900` 冲突，结果两个都进 className，CSS 源序决定谁赢——
 * 实测会被 `border-card-border` 盖掉，导致卡背边框比正面卡浅一截。
 *
 * **故意不读** card.classCard / card.bossPhase / card.isFinalMonster 这些会泄漏卡面
 * 信息的字段——卡背只透露最大类目。
 */
const CARD_TYPE_BORDER_HEX: Partial<Record<CardType, string>> = {
  monster: '#7f1d1d',     // red-900
  weapon: '#78350f',      // amber-900
  shield: '#1e3a8a',      // blue-900
  potion: '#065f46',      // emerald-800
  amulet: '#4c1d95',      // violet-900
  magic: '#164e63',       // cyan-900
  'hero-magic': '#881337',// rose-900
  event: '#6d28d9',       // violet-700
  building: '#57534e',    // stone-600
  curse: '#581c87',       // purple-900
  skill: '#ca8a04',       // yellow-600
  coin: '#eab308',        // yellow-500
};

/**
 * 内嵌方框线颜色：复刻 [GameCard.tsx insetFrameBorderClass + text-only inset]
 * 的「类型 → 内框边」对照表。配合 inset-[6px] 在外 border-4 内侧再描一圈
 * 半透明同色细线，让卡背的视觉层次和正面卡完全一致。
 */
const CARD_TYPE_INSET_BORDER: Partial<Record<CardType, string>> = {
  monster: 'border-red-300/30',
  building: 'border-red-300/30',
  weapon: 'border-amber-500/40',
  shield: 'border-blue-500/40',
  potion: 'border-emerald-500/40',
  amulet: 'border-violet-400/45',
  event: 'border-violet-400/45',
  magic: 'border-cyan-500/35',
  'hero-magic': 'border-rose-400/45',
  curse: 'border-purple-400/45',
  skill: 'border-yellow-500/40',
  coin: 'border-yellow-500/40',
};

/**
 * 卡背底色渐变（CSS background 字符串）：每种类型一对深色 → 更深色的同色系渐变。
 *
 * 用户反馈卡背"内部还是灰色的"——根因是 shadcn `<Card>` 的 `bg-card` 在 dark 模式下是
 * `hsl(0 0% 9%)`（接近黑灰），加上我之前那层重黑色径向 wash，整体读上去就是"灰"。
 * 这里把 `bg-card` 完全替换成"该类型的主题色暗调渐变"，让玩家一眼能从颜色识别类目，
 * 同时和正面卡（图像 + 标题色块都是同色系暖调）的视觉氛围保持一致。
 *
 * event / magic / hero-magic 三类正面是浅 tint 渐变，但卡背要和卡背图案花纹叠加，
 * 浅色会让花纹消失；所以这里全部统一走深色渐变，更"卡背"。
 */
// 相比原版 ~↓40% 饱和度（保持低饱和），明度回提到约原版的 90%（比上一版亮一档，但仍偏暗）
const CARD_TYPE_BG: Partial<Record<CardType, string>> = {
  monster:      'linear-gradient(180deg, #3d1818 0%, #6a2c2c 100%)',
  building:     'linear-gradient(180deg, #1f1c19 0%, #2e2a26 100%)',
  weapon:       'linear-gradient(180deg, #3d2410 0%, #6a4525 100%)',
  shield:       'linear-gradient(180deg, #1c2542 0%, #324068 100%)',
  potion:       'linear-gradient(180deg, #122a22 0%, #264a3a 100%)',
  amulet:       'linear-gradient(180deg, #281d50 0%, #463572 100%)',
  magic:        'linear-gradient(180deg, #173545 0%, #2a4d5c 100%)',
  'hero-magic': 'linear-gradient(180deg, #3d1825 0%, #6a2c40 100%)',
  event:        'linear-gradient(180deg, #281d50 0%, #4d3a92 100%)',
  curse:        'linear-gradient(180deg, #311a52 0%, #4d306b 100%)',
  skill:        'linear-gradient(180deg, #3d2a14 0%, #5d4525 100%)',
  coin:         'linear-gradient(180deg, #3d2a14 0%, #6a5025 100%)',
};

const DEFAULT_BG = 'linear-gradient(180deg, #1c1c20 0%, #2c2c30 100%)';

/**
 * 卡背中央徽章（cartouche）/ flourish / type label 的「主色 — 用 hex」。
 * 都是带"老羊皮纸 + 类型 tint"感觉的暖色调，配合卡背图案不刺眼。
 * 同时给 SVG `stroke` / `fill` 直接用，不再绕一层 tailwind className。
 */
const CARD_TYPE_ACCENT: Partial<Record<CardType, { ink: string; glow: string; wash: string }>> = {
  monster: { ink: '#fde68a', glow: 'rgba(248, 113, 113, 0.55)', wash: 'rgba(127, 29, 29, 0.55)' },
  building: { ink: '#fde68a', glow: 'rgba(168, 162, 158, 0.45)', wash: 'rgba(68, 64, 60, 0.5)' },
  weapon: { ink: '#fef3c7', glow: 'rgba(251, 191, 36, 0.55)', wash: 'rgba(120, 53, 15, 0.55)' },
  shield: { ink: '#bfdbfe', glow: 'rgba(59, 130, 246, 0.55)', wash: 'rgba(30, 58, 138, 0.55)' },
  potion: { ink: '#bbf7d0', glow: 'rgba(52, 211, 153, 0.55)', wash: 'rgba(6, 78, 59, 0.55)' },
  amulet: { ink: '#ddd6fe', glow: 'rgba(196, 181, 253, 0.6)', wash: 'rgba(76, 29, 149, 0.55)' },
  magic: { ink: '#a5f3fc', glow: 'rgba(103, 232, 249, 0.55)', wash: 'rgba(22, 78, 99, 0.55)' },
  'hero-magic': { ink: '#fecdd3', glow: 'rgba(244, 114, 182, 0.55)', wash: 'rgba(136, 19, 55, 0.55)' },
  event: { ink: '#ddd6fe', glow: 'rgba(167, 139, 250, 0.55)', wash: 'rgba(76, 29, 149, 0.55)' },
  curse: { ink: '#e9d5ff', glow: 'rgba(192, 132, 252, 0.55)', wash: 'rgba(88, 28, 135, 0.55)' },
  skill: { ink: '#fde68a', glow: 'rgba(250, 204, 21, 0.55)', wash: 'rgba(133, 77, 14, 0.55)' },
  coin: { ink: '#fef3c7', glow: 'rgba(250, 204, 21, 0.55)', wash: 'rgba(133, 77, 14, 0.55)' },
};

const DEFAULT_ACCENT = { ink: '#fde68a', glow: 'rgba(245, 158, 11, 0.5)', wash: 'rgba(0, 0, 0, 0.45)' };

/**
 * 中央卡牌"徽章"——上下小 flourish + 双线椭圆框 + 类型字。
 * 复用了 [`Preview Row` 卡背的中央内容区]，独立组件方便单测/调样式。
 */
function CardBackEmblem({ label, accent }: { label: string; accent: { ink: string; glow: string } }) {
  const len = label.length;
  // 字号 / 字距 / padding 都按 label 字数动态调档：
  // - CJK 短词（≤3 字，"怪物" / "事件"）：保留宽字距 + 大 ceiling，气场最足
  // - 拉丁中等词（4–6 字，"Magic" / "Potion" / "Weapon"）：收紧字距 + 中 ceiling
  // - 拉丁长词（≥7 字，"Monster" / "Building"）：再收紧 + 小 ceiling，
  //   保证窄 cell 上仍能完整显示在 cartouche 内不溢出。
  // 历史教训：旧版本用单档 `tracking: 0.45em` + `1.3em` 是按 CJK 2 字调的；
  // 切到英文后 7 字 × 0.45em 字距让 label 直接撑出 cartouche 边界、看不全。
  const sizing =
    len <= 3
      ? { baseSize: 'clamp(0.55rem, 11cqi, 1.4rem)', tracking: '0.45em', padX: '1.3em', labelScale: '1.3em' }
      : len <= 6
        ? { baseSize: 'clamp(0.5rem, 8.5cqi, 1.05rem)', tracking: '0.12em', padX: '0.85em', labelScale: '1.1em' }
        : { baseSize: 'clamp(0.45rem, 7cqi, 0.85rem)', tracking: '0.05em', padX: '0.6em', labelScale: '1em' };

  return (
    <div
      className="relative z-20 flex flex-col items-center select-none max-w-full px-1"
      style={{
        color: accent.ink,
        // 关键：用 cqi（container query inline size）随 PreviewCard 宽度流式缩放
        // 父 Card 设了 container-type: inline-size，cqi 就是 card 宽度的 1%
        // clamp 兜底：小屏不至于看不清，大屏不至于撑爆
        fontSize: sizing.baseSize,
        gap: '0.45em',
      }}
    >
      {/* 上方装饰线：两段细线 + 中央菱形 */}
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
      {/* 类型字底板（去掉了双线白边框，只保留半透明深色板提升对比） */}
      <div
        className="relative max-w-full"
        style={{
          padding: `0.4em ${sizing.padX}`,
          borderRadius: '1em',
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
            textShadow: `0 0 8px ${accent.glow}, 0 1px 0 rgba(0,0,0,0.6)`,
          }}
        >
          {label}
        </span>
      </div>
      {/* 下方装饰线：与上方对称 */}
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
    </div>
  );
}

interface PreviewCardBackProps {
  card: GameCardData;
  isStack?: boolean;
}

/**
 * 预览行卡背：复刻一张普通 GameCard 的外框（同样的 shadcn `<Card>` + border-4
 * + bg-card 背景），但内部所有具体内容（名字 / 攻击 / HP / 描述 / 立绘）
 * 都被替换为 `card_back_design.png` 卡背图案 + 中央中文类型胶囊。
 *
 * 边框颜色按 card.type 走，与正面同类型卡 100% 一致；这是有意保留的「类型」
 * 视觉信号——和中央 pill 一起完成用户要求的「只露类型」契约。
 */
export const PreviewCardBack = memo(function PreviewCardBack({ card, isStack = false }: PreviewCardBackProps) {
  const { t } = useTranslation();
  const labelKey = CARD_TYPE_I18N_KEY[card.type];
  const label = labelKey ? t(`cardBack.type.${labelKey}`) : t('cardBack.type.unknown');
  const borderHex = CARD_TYPE_BORDER_HEX[card.type] ?? '#3f3f46';
  const insetBorderClass = CARD_TYPE_INSET_BORDER[card.type] ?? 'border-white/20';
  const bg = CARD_TYPE_BG[card.type] ?? DEFAULT_BG;
  const accent = CARD_TYPE_ACCENT[card.type] ?? DEFAULT_ACCENT;

  return (
    <div
      className="dh-card-wrapper w-full h-full cursor-pointer transition-[transform,opacity,filter] duration-200 ease-out"
      data-testid={`preview-back-${card.type}`}
      aria-label={t('cardBack.ariaUnrevealed', { label })}
    >
      <Card
        className="relative w-full h-full overflow-hidden transition-shadow duration-200 shadow-lg hover:shadow-xl"
        style={{
          // borderColor / borderWidth via inline 是为了**绕开 shadcn `<Card>` 自带
          // `border-card-border`** —— 那个非标颜色 class 不一定会被 twMerge 识别成
          // 同 `border-{tailwind-color}` 冲突，导致 className 里两个都在，CSS 源序
          // 决定谁赢，结果灰色边把类型色边盖掉。inline style 有最高优先级，稳定。
          borderWidth: '4px',
          borderStyle: 'solid',
          borderColor: borderHex,
          // 卡 body 的底色：直接用类型色暗调渐变，替换掉 `bg-card` 的灰
          background: bg,
          // 让内部 emblem 用 cqi 单位随卡片实际宽度流式缩放
          containerType: 'inline-size',
        }}
      >
        {/* === 层 1：卡背容器 + 缩进 6px 让外圈底色露出 ===
            历史上这里贴过一张 cardBackImage PNG 当卡背图案，但与新的纯渐变
            类型底色 + 类型文字 emblem 视觉冲突，已移除。保留这个 6px inset
            容器是因为下面的 layer 2/3/4 都靠它做相对定位。 */}
        <div className="absolute inset-[6px] overflow-hidden rounded-sm">
          {/* === 层 2：钻石格纹理（很淡，只是印刷质感） === */}
          <div
            className="absolute inset-0 pointer-events-none opacity-20 mix-blend-overlay"
            style={{
              backgroundImage: `
                repeating-linear-gradient(45deg,  rgba(255,255,255,0.18) 0 1px, transparent 1px 12px),
                repeating-linear-gradient(-45deg, rgba(255,255,255,0.18) 0 1px, transparent 1px 12px)
              `,
            }}
          />
          {/* === 层 3：极轻的中央光晕，让 cartouche 浮起来 ===
              不再是重黑色 wash —— 用很淡的暖光高亮，避免把卡背洗灰。 */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at center, rgba(255,255,255,0.08) 0%, transparent 55%)`,
            }}
          />
          {/* === 层 4：四角 type-tint L 形装饰 === */}
          <div className="absolute inset-0 pointer-events-none" style={{ color: accent.ink }} aria-hidden>
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
          {/* === 层 5：中央徽章（带类型字）。stack 缩略卡背不画。 === */}
          {!isStack && (
            <div className="absolute inset-0 flex items-center justify-center">
              <CardBackEmblem label={label} accent={accent} />
            </div>
          )}
        </div>
        {/* === 层 6：内嵌方框线（与正面卡同位同色，盖在所有装饰之上） === */}
        <div
          className={`absolute pointer-events-none rounded-sm inset-[6px] border ${insetBorderClass} z-30`}
          aria-hidden
        />
      </Card>
    </div>
  );
});

interface PreviewCellProps {
  index: number;
  waterfallAnimation: WaterfallAnimationState;
  graveyardVectors: Record<number, GraveyardVector>;
  deckReturnVectors: Record<number, GraveyardVector>;
  cellWrapperClass: string;
  cellInnerClass: string;
  onCellRef: (index: number, el: HTMLDivElement | null) => void;
  /**
   * 「乾坤一翻」选择阶段需要的 pending 状态。仅当 effect === 'flip-active-card'
   * 且该 preview 格仍是卡背状态时，才允许点击和高亮。
   */
  pendingMagicAction: PendingMagicAction | null;
  onDungeonCardSelection?: (card: GameCardData) => void;
  /**
   * 打开 CardDetailsModal。仅在卡片已被「乾坤一翻」翻成正面（`revealedEarly === true`）
   * 且当前不在「乾坤一翻」选择阶段时挂上——卡背状态下保持不可点（玩家不应在卡未翻开时
   * 偷看真容）。
   */
  onCardClick?: (card: GameCardData) => void;
}

const PreviewCell = memo(function PreviewCell({
  index,
  waterfallAnimation,
  graveyardVectors,
  deckReturnVectors,
  cellWrapperClass,
  cellInnerClass,
  onCellRef,
  pendingMagicAction,
  onDungeonCardSelection,
  onCardClick,
}: PreviewCellProps) {
  const { t } = useTranslation();
  const card = useGameState(s => s.previewCards[index]);
  const stackedCards = useGameState(s => s.previewCardStacks[index] ?? EMPTY_ARRAY);
  const revealedEarly = useGameState(s => Boolean(s.previewRevealedEarly?.[index]));

  const { style: animStyle, className: animClass, isAnimating } =
    getPreviewAnimationProps(index, waterfallAnimation, graveyardVectors, deckReturnVectors);

  const hasStack = stackedCards.length > 0;
  const phase = waterfallAnimation.phase;

  // 防御 race condition：发牌时引擎更新 previewCards（新卡到位）和 GameBoard 本地
  // useState 更新 waterfallAnimation.phase（→ 'dealing'）来自两套不同的更新机制
  // （engine emitter / React useState）。在 React 18 里通常会 batch 进同一帧渲染，
  // 但实测中存在两者错开一帧的情况——会出现「previewCards 是新卡 + phase 还停在
  // 'discarding'/'dropping'」的瞬间，按下面的 phase 矩阵会渲染成正面 GameCard，
  // 把秘密泄露出去（用户能看到一瞬间真容再翻成卡背）。
  //
  // 解决：跟踪上一帧本格 card.id；只要这一帧 id 变了（含 null→新、旧→新），就强制
  // 本帧显示卡背，覆盖 phase / revealedEarly 的判定。下一帧 useEffect 把 ref 同步上，
  // 之后就走正常的 phase 判定。
  //
  // 不影响其他路径：
  //   - revealing 3D 翻面：card.id 不变 → 不触发 → 翻面正常播放
  //   - dropping / discarding：card.id 不变 → 不触发 → 正面正常显示
  //   - 乾坤一翻 (revealedEarly 翻 flag)：card.id 不变 → 不触发 → 正面正常显示
  const lastCardIdRef = useRef<string | null>(card?.id ?? null);
  const currentCardId = card?.id ?? null;
  const cardJustChanged = lastCardIdRef.current !== currentCardId;
  useEffect(() => {
    lastCardIdRef.current = currentCardId;
  }, [currentCardId]);

  // Phase → presentation:
  //   - idle / dealing  → render the card BACK (face-down)，**除非**该格被「乾坤一翻」翻过
  //   - revealing       → render 3D flipper (back → face animation)，已经被早翻的格直接显示正面
  //   - dropping / discarding → render the card FACE (already revealed, now flying out)
  //   - cardJustChanged → 强制 BACK，避免发牌瞬间的 race 泄露真容
  const showBack = cardJustChanged
    ? true
    : (phase === 'idle' || phase === 'dealing') && !revealedEarly;
  const showRevealAnimation = phase === 'revealing' && !revealedEarly && !cardJustChanged;

  // 「乾坤一翻」flip-active-card 选择阶段：未翻面的 preview 卡背可被选中，已翻面的不能
  const flipPickActive = pendingMagicAction?.effect === 'flip-active-card'
    && pendingMagicAction.step === 'dungeon-select';
  const previewSelectable = Boolean(flipPickActive && card && !revealedEarly);

  if (!card) {
    return (
      <div
        key={`preview-empty-${index}`}
        className={cellWrapperClass}
        ref={el => onCellRef(index, el)}
      >
        <div className={cellInnerClass} style={animStyle} />
      </div>
    );
  }

  // 「乾坤一翻」选择阶段：点击触发 dungeon 选择（高亮 + pulse）。
  // 否则若卡片已被翻成正面（revealedEarly），点击打开 CardDetailsModal。
  // 卡背状态下两者都不挂，玩家点不出任何东西——和卡未翻开时不应偷看真容的设计一致。
  const handlePreviewClick = previewSelectable && onDungeonCardSelection
    ? () => onDungeonCardSelection(card)
    : revealedEarly && onCardClick
      ? () => onCardClick(card)
      : undefined;
  const highlightClass = previewSelectable ? 'dungeon-target-highlight animate-pulse' : '';

  // The cell wrapper (animation transforms attach here so drop/graveyard/deal
  // motion still composes correctly with the inner rotateY flip).
  const cellChildren = showRevealAnimation ? (
    // 3D flip: starts at rotateY(180deg) (back visible) → rotateY(0deg) (face visible)
    <div className="dh-perspective relative w-full h-full">
      <div className="dh-preserve-3d animate-preview-reveal absolute inset-0">
        {/* Front face — visible at rotateY(0deg) */}
        <div className="absolute inset-0 dh-backface-hidden">
          <GameCard card={card} disableInteractions />
        </div>
        {/* Back face — visible at rotateY(180deg) */}
        <div
          className="absolute inset-0 dh-backface-hidden"
          style={{ transform: 'rotateY(180deg)' }}
        >
          <PreviewCardBack card={card} />
        </div>
      </div>
    </div>
  ) : showBack ? (
    // 卡背：可在「乾坤一翻」选择阶段点击。覆一层透明可点击层而不是改 PreviewCardBack
    // 的 onClick，是为了不污染 PreviewCardBack 的纯展示语义。
    previewSelectable ? (
      <div className="relative w-full h-full">
        <PreviewCardBack card={card} />
        <button
          type="button"
          aria-label={t('cardBack.ariaPickFlip')}
          className={`absolute inset-0 z-40 cursor-pointer rounded-md ${highlightClass}`.trim()}
          onClick={handlePreviewClick}
        />
      </div>
    ) : (
      <PreviewCardBack card={card} />
    )
  ) : (
    <GameCard
      card={card}
      className={`${hasStack ? 'relative z-[5] ' : ''}${highlightClass}`.trim()}
      disableInteractions={!previewSelectable}
      onClick={handlePreviewClick}
    />
  );

  return (
    <div
      key={`preview-${index}`}
      className={`relative z-[2] ${cellWrapperClass}${hasStack ? ' overflow-visible' : ''}`}
      data-testid={`preview-card-${index}`}
      ref={el => onCellRef(index, el)}
    >
      <div
        className={`${cellInnerClass} ${hasStack ? 'relative' : ''} ${animClass}`.trim()}
        style={animStyle}
      >
        {hasStack && stackedCards.map((stackCard, sIdx) => {
          // Hide stacked cards during ANY animation (existing behavior preserved
          // for drop/discard/deal; we treat reveal the same way so the flip
          // visual focuses on the main card).
          if (isAnimating || showRevealAnimation) {
            return (
              <div
                key={stackCard.id}
                className="absolute inset-0 pointer-events-none"
                style={{ zIndex: -1, opacity: 0, padding: 'var(--dh-card-padding, 0.25rem)' }}
              >
                <PreviewCardBack card={stackCard} isStack />
              </div>
            );
          }
          return (
            <div
              key={stackCard.id}
              className="absolute inset-0 rounded-md overflow-hidden pointer-events-none"
              style={getStackedCardStyle(stackedCards.length, sIdx)}
            >
              <PreviewCardBack card={stackCard} isStack />
            </div>
          );
        })}
        {cellChildren}
        {hasStack && (
          <div className="absolute top-[-4px] right-[-4px] z-40 bg-amber-500 text-white rounded-full w-5 h-5 flex items-center justify-center border-2 border-background shadow-md font-bold text-xs pointer-events-none">
            {stackedCards.length + 1}
          </div>
        )}
      </div>
    </div>
  );
});

interface PreviewRowProps {
  waterfallAnimation: WaterfallAnimationState;
  graveyardVectors: Record<number, GraveyardVector>;
  deckReturnVectors: Record<number, GraveyardVector>;
  cellWrapperClass: string;
  cellInnerClass: string;
  onCellRef: (index: number, el: HTMLDivElement | null) => void;
  /**
   * 打开 CardDetailsModal。仅在卡片已被「乾坤一翻」翻成正面（`previewRevealedEarly[index]`）
   * 时挂上；卡背状态下点击无响应。GameBoard 透传 `handleCardClick`。
   */
  onCardClick?: (card: GameCardData) => void;
  /**
   * 「乾坤一翻」专用：当 pendingMagicAction.effect === 'flip-active-card' 时，
   * 玩家可以选中预览行卡背进行翻面。GameBoard 把 useHeroActions 的
   * `handleDungeonCardSelection` 通过这个 prop 透传过来。
   */
  onDungeonCardSelection?: (card: GameCardData) => void;
}

export const PreviewRow = memo(function PreviewRow({
  waterfallAnimation,
  graveyardVectors,
  deckReturnVectors,
  cellWrapperClass,
  cellInnerClass,
  onCellRef,
  onCardClick,
  onDungeonCardSelection,
}: PreviewRowProps) {
  const pendingMagicAction = useGameState(s => s.pendingMagicAction);
  return (
    <>
      {DUNGEON_COLUMNS.map((index) => (
        <PreviewCell
          key={index}
          index={index}
          waterfallAnimation={waterfallAnimation}
          graveyardVectors={graveyardVectors}
          deckReturnVectors={deckReturnVectors}
          cellWrapperClass={cellWrapperClass}
          cellInnerClass={cellInnerClass}
          onCellRef={onCellRef}
          pendingMagicAction={pendingMagicAction}
          onCardClick={onCardClick}
          onDungeonCardSelection={onDungeonCardSelection}
        />
      ))}
    </>
  );
});

export default PreviewRow;
