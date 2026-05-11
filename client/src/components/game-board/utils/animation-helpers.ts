import type { CSSProperties } from 'react';
import type { GraveyardVector, WaterfallAnimationState } from '../types';

const GRAVEYARD_VECTOR_DEFAULT: GraveyardVector = { offsetX: 60, offsetY: 160 };
const DECK_RETURN_VECTOR_DEFAULT: GraveyardVector = { offsetX: -72, offsetY: -188 };

export interface PreviewAnimationProps {
  style: CSSProperties & Record<`--${string}`, string>;
  className: string;
  isAnimating: boolean;
}

export function getPreviewAnimationProps(
  index: number,
  waterfallAnimation: WaterfallAnimationState,
  graveyardVectors: Record<number, GraveyardVector>,
  deckReturnVectors: Record<number, GraveyardVector>,
): PreviewAnimationProps {
  const isDroppingPreview = waterfallAnimation.droppingSlots.includes(index);
  const isDiscardingPreview = waterfallAnimation.discardSlot === index;
  const isDealingPreview = waterfallAnimation.dealingSlots.includes(index);
  const isDeckReturnDiscard =
    isDiscardingPreview && waterfallAnimation.discardDestination === 'deck';
  // Portal teleport: 双人模式下被挤掉的卡飞向「传送门」(坟场位置)。
  // primary 通过 (discardSlot, destination='portal') 表示；
  // extras 通过 portalSlots 列表表示。两者都用同一套 graveyard 向量 + portal 动画。
  const isPrimaryPortal =
    isDiscardingPreview && waterfallAnimation.discardDestination === 'portal';
  const isExtraPortal = waterfallAnimation.portalSlots.includes(index);
  const isPortalingPreview = isPrimaryPortal || isExtraPortal;
  // 当卡走 portal 路径时，传统 graveyard / deck-return 动画都不应触发。
  const isLegacyDiscarding =
    isDiscardingPreview && !isPrimaryPortal;

  const flyVector = isPortalingPreview
    ? (graveyardVectors[index] ?? GRAVEYARD_VECTOR_DEFAULT)
    : isDeckReturnDiscard
      ? (deckReturnVectors[index] ?? DECK_RETURN_VECTOR_DEFAULT)
      : (graveyardVectors[index] ?? GRAVEYARD_VECTOR_DEFAULT);

  const style: CSSProperties & Record<`--${string}`, string> =
    isDeckReturnDiscard && !isPortalingPreview
      ? {
          '--deck-return-offset-x': `${flyVector.offsetX}px`,
          '--deck-return-offset-y': `${flyVector.offsetY}px`,
        }
      : {
          '--graveyard-offset-x': `${flyVector.offsetX}px`,
          '--graveyard-offset-y': `${flyVector.offsetY}px`,
        };

  const className = [
    isDroppingPreview ? 'animate-preview-drop' : '',
    isPortalingPreview ? 'animate-preview-portal' : '',
    isLegacyDiscarding && !isDeckReturnDiscard ? 'animate-preview-graveyard' : '',
    isLegacyDiscarding && isDeckReturnDiscard ? 'animate-preview-deck-return' : '',
    isDealingPreview ? 'animate-preview-deal' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    style,
    className,
    isAnimating:
      isDroppingPreview || isDiscardingPreview || isPortalingPreview || isDealingPreview,
  };
}

export function getStackedCardStyle(
  stackLength: number,
  stackIndex: number,
  offsetStep: number = 8,
): CSSProperties {
  const y = -(stackLength - stackIndex) * offsetStep;
  return {
    zIndex: 0,
    transform: `translateY(${y}%)`,
    opacity: 0.4 - stackIndex * 0.1,
    filter: 'brightness(0.6)',
    padding: 'var(--dh-card-padding, 0.25rem)',
  };
}

export function getActiveStackedCardStyle(
  stackLength: number,
  stackIndex: number,
  offsetStep: number = 8,
): CSSProperties {
  const y = -(stackLength - stackIndex) * offsetStep;
  return {
    zIndex: 0,
    transform: `translateY(${y}%)`,
    opacity: 0.5 - stackIndex * 0.1,
    filter: 'brightness(0.7)',
    padding: 'var(--dh-card-padding, 0.25rem)',
  };
}
