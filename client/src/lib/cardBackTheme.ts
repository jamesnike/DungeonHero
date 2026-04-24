/**
 * 共享卡背调色板 —— Backpack / Graveyard / ClassDeck / 主牌堆 等所有
 * 「卡背」皮肤的唯一调色来源。
 *
 * 这套色板原本只服务 [`StackedCardPile`](../components/StackedCardPile.tsx)
 * 在棋盘上画的 cell 卡背；现在弹窗外框也共用，避免色卡 drift。
 */

export type CardBackVariant = 'bright' | 'muted' | 'blue' | 'indigo';

export interface CardBackTheme {
  /** 4px 厚边色（inline style 设，绕 twMerge 灰边坑）。 */
  borderHex: string;
  /** 主体渐变（CSS background）。 */
  bg: string;
  /** stack layer 的更暗渐变（StackedCardPile 后排卡用）。 */
  layerBg: string;
  /** cartouche / corner L / 字色。 */
  ink: string;
  /** 字 textShadow 发光色。 */
  glow: string;
  /** 1px 内方框线 Tailwind class。 */
  insetBorderClass: string;
  /** 投影色（动效 / 卡背阴影）。 */
  shadow: string;
  /** 中央 count 文本色。 */
  countColor: string;
}

export const CARD_BACK_THEMES: Record<CardBackVariant, CardBackTheme> = {
  // ClassDeck（专属牌组）— amber/gold，~↓40% 饱和度，明度回提到约原版的 90%
  bright: {
    borderHex: '#a16207', // yellow-700
    bg: 'linear-gradient(180deg, #3d2a14 0%, #6a4525 100%)',
    layerBg: 'linear-gradient(180deg, #221808 0%, #3d2a14 100%)',
    ink: '#fde68a', // amber-200
    glow: 'rgba(251, 191, 36, 0.55)', // amber-400
    insetBorderClass: 'border-amber-400/35',
    shadow: 'rgba(180, 83, 9, 0.45)', // amber-700/45
    countColor: '#fef3c7', // amber-100
  },
  // Graveyard — slate
  muted: {
    borderHex: '#475569', // slate-600
    bg: 'linear-gradient(180deg, #181d28 0%, #2a3040 100%)',
    layerBg: 'linear-gradient(180deg, #0c111c 0%, #181d28 100%)',
    ink: '#cbd5e1', // slate-300
    glow: 'rgba(148, 163, 184, 0.55)', // slate-400
    insetBorderClass: 'border-slate-400/30',
    shadow: 'rgba(15, 23, 42, 0.45)', // slate-900/45
    countColor: '#e2e8f0', // slate-200
  },
  // Backpack — 深蓝
  blue: {
    borderHex: '#1d4ed8', // blue-700
    bg: 'linear-gradient(180deg, #1c2542 0%, #324068 100%)',
    layerBg: 'linear-gradient(180deg, #0f152a 0%, #1c2542 100%)',
    ink: '#bfdbfe', // blue-200
    glow: 'rgba(96, 165, 250, 0.55)', // blue-400
    insetBorderClass: 'border-blue-400/30',
    shadow: 'rgba(30, 58, 138, 0.45)', // blue-900/45
    countColor: '#dbeafe', // blue-100
  },
  // 主牌堆 — 靛紫（呼应 GameHeader 的 #4f46e5 sticker）
  indigo: {
    borderHex: '#4338ca', // indigo-700
    bg: 'linear-gradient(180deg, #1e1b4b 0%, #3730a3 100%)', // indigo-950 → indigo-800
    layerBg: 'linear-gradient(180deg, #14122e 0%, #1e1b4b 100%)',
    ink: '#c7d2fe', // indigo-200
    glow: 'rgba(129, 140, 248, 0.55)', // indigo-400
    insetBorderClass: 'border-indigo-400/30',
    shadow: 'rgba(49, 46, 129, 0.45)', // indigo-900/45
    countColor: '#e0e7ff', // indigo-100
  },
};
