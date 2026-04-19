import { Card } from '@/components/ui/card';
import { Shield, Sword, Backpack, Package, X } from 'lucide-react';
import React, { useCallback, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { initMobileDrop } from '../utils/mobileDragDrop';
import GameCard, { type GameCardData, type EquipmentCardStatModifier } from './GameCard';
import { useGameViewport } from '@/contexts/GameViewportContext';
import { FLAT_ASPECT_RATIO } from './game-board/constants';

const BASE_SLOT_WIDTH = 220;
const SLOT_SCALE_MIN = 0.7;
const SLOT_SCALE_MAX = 1.3;
const RESERVE_SWIPE_THRESHOLD = 40;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type SlotType = 'equipment' | 'backpack';

interface EquipmentSlotProps {
  type: SlotType;
  slotId?: string;
  item?: (GameCardData & { [key: string]: any }) | null;
  reserveItems?: (GameCardData & { [key: string]: any })[];
  slotCapacity?: number;
  onSwapToTop?: (reserveIndex: number) => void;
  statModifier?: EquipmentCardStatModifier | null;
  backpackCount?: number;
  scaleMultiplier?: number;
  permanentDamageBonus?: number;
  permanentShieldBonus?: number;
  tempAttackBonus?: number;
  tempShieldBonus?: number;
  onDrop?: (card: any) => void;
  onDragStart?: (item: any) => void;
  onDragEnd?: () => void;
  isDropTarget?: boolean;
  isCombatDropTarget?: boolean;
  onClick?: () => void;
  onCardClick?: (card: GameCardData) => void;
  heroSkillHighlight?: boolean;
  heroSkillLabel?: string;
  bleedAnimation?: boolean;
  weaponSwingAnimation?: boolean;
  shieldBlockAnimation?: boolean;
  weaponSwingVariant?: number;
  shieldBlockVariant?: number;
  isExhaustedThisTurn?: boolean;
  /** Remaining action count to show on the slot when dragging (attacks during hero turn, block durability during monster turn). null = don't show. */
  slotActionCount?: number | null;
  isUnbreakable?: boolean;
  isStunFrozen?: boolean;
}

export default function EquipmentSlot({
  type,
  slotId,
  item,
  reserveItems = [],
  slotCapacity = 1,
  onSwapToTop,
  statModifier,
  backpackCount = 0,
  scaleMultiplier = 1,
  permanentDamageBonus = 0,
  permanentShieldBonus = 0,
  tempAttackBonus = 0,
  tempShieldBonus = 0,
  onDrop,
  onDragStart,
  onDragEnd,
  isDropTarget,
  isCombatDropTarget,
  onClick,
  onCardClick,
  heroSkillHighlight = false,
  heroSkillLabel,
  bleedAnimation = false,
  weaponSwingAnimation = false,
  shieldBlockAnimation = false,
  weaponSwingVariant = 0,
  shieldBlockVariant = 0,
  isExhaustedThisTurn = false,
  slotActionCount = null,
  isUnbreakable = false,
  isStunFrozen = false,
}: EquipmentSlotProps) {
  const gameViewport = useGameViewport();
  const isCompact = gameViewport.width < 500;
  const isFlat = gameViewport.width / gameViewport.height > FLAT_ASPECT_RATIO;
  const [dragDepth, setDragDepth] = React.useState(0);
  const isOver = dragDepth > 0;
  const slotRef = useRef<HTMLDivElement>(null);
  const acceptsDrop = Boolean(isDropTarget || isCombatDropTarget);
  const [durabilityStripWidth, setDurabilityStripWidth] = React.useState(12);
  const [slotScale, setSlotScale] = React.useState(1);
  const [isCardDragging, setIsCardDragging] = React.useState(false);

  const wrappedOnDragStart = useCallback((card: any) => {
    setIsCardDragging(true);
    onDragStart?.(card);
  }, [onDragStart]);

  const wrappedOnDragEnd = useCallback(() => {
    setIsCardDragging(false);
    onDragEnd?.();
  }, [onDragEnd]);
  
  useEffect(() => {
    if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') {
      return;
    }
    const updateWidth = () => {
      const rootStyle = getComputedStyle(document.documentElement);
      const value = parseFloat(rootStyle.getPropertyValue('--dh-rage-strip-width'));
      if (!Number.isNaN(value) && value > 0) {
        setDurabilityStripWidth(value);
      }
    };
    updateWidth();
    const observer = new MutationObserver(updateWidth);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', updateWidth);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, []);
  
  // Set up mobile drop support for the slot
  useEffect(() => {
    if (!slotRef.current || !onDrop) return;
    
    const cleanup = initMobileDrop(
      slotRef.current,
      (dragData) => {
        if (dragData.type === 'card') {
          onDrop(dragData.data);
        }
      },
      ['card']
    );
    
    return cleanup;
  }, [onDrop]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const target = slotRef.current;
    if (!target) return;

    const updateScale = () => {
      const rect = target.getBoundingClientRect();
      if (!rect.width) {
        return;
      }
      setSlotScale(prev => {
        const next = clamp(rect.width / BASE_SLOT_WIDTH, SLOT_SCALE_MIN, SLOT_SCALE_MAX);
        return Math.abs(prev - next) > 0.01 ? next : prev;
      });
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (acceptsDrop) {
      setDragDepth(prev => prev + 1);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (acceptsDrop && dragDepth === 0) {
      setDragDepth(1);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (acceptsDrop) {
      setDragDepth(prev => Math.max(0, prev - 1));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragDepth(0);
    if (isStunFrozen) return;
    const cardData = e.dataTransfer.getData('card');
    if (cardData) {
      onDrop?.(JSON.parse(cardData));
    }
  };

  const getIcon = () => {
    if (type === 'backpack') {
      return <Backpack className="w-8 h-8 text-muted-foreground" />;
    }
    if (type === 'equipment') {
      return (
        <div className="flex items-center gap-2 text-muted-foreground/60">
          <Sword className="w-6 h-6" />
          <Shield className="w-6 h-6" />
        </div>
      );
    }
    
    return <Package className="w-8 h-8 text-muted-foreground" />;
  };

  const getLabel = () => {
    if (type === 'backpack') return 'Backpack';
    return 'Equipment';
  };

  const testId = slotId || `slot-${type}`;
  const formatBonus = (value: number) => (value >= 0 ? `+${value}` : `${value}`);

  // Prepare item as GameCardData (fromSlot lets GameCard cancel dragover so drops work on top of equipped gear)
  const gameCardData: GameCardData | null = item ? { ...item } : null;
  const equipmentDisplayCard: GameCardData | null =
    type === 'equipment' && gameCardData && slotId
      ? ({ ...gameCardData, fromSlot: slotId } as GameCardData)
      : gameCardData;

  const DURABILITY_SEGMENTS = 4;
  const colWidth = durabilityStripWidth || 12;
  const rawCurrentDurability = Math.max(gameCardData?.durability ?? 0, 0);
  const rawMaxDurability = Math.max(
    gameCardData?.maxDurability ?? gameCardData?.durability ?? 0,
    0,
  );
  const currentDurability = Math.min(DURABILITY_SEGMENTS, rawCurrentDurability);
  const maxDurability = Math.min(
    DURABILITY_SEGMENTS,
    Math.max(rawMaxDurability, currentDurability),
  );
  const handleClick = (e: React.MouseEvent) => {
    if (!onClick) return;
    e.stopPropagation();
    onClick();
  };

  const appliedSlotScale = clamp(
    slotScale * scaleMultiplier,
    SLOT_SCALE_MIN * Math.min(1, scaleMultiplier),
    SLOT_SCALE_MAX * Math.max(1, scaleMultiplier),
  );

  return (
    <div 
      ref={slotRef}
      className="relative h-full w-full overflow-visible" // Allow card to shift left outside bounds
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid={testId}
      onClick={onClick ? handleClick : undefined}
      style={{ '--dh-hero-instance-scale': appliedSlotScale.toString() } as CSSProperties}
    >
      {/* Drop-zone extension below the slot — extends the receive area downward
          so the upper half of a dragged card hovering past the bottom edge still equips. */}
      <div
        aria-hidden
        className="absolute left-0 right-0 top-full"
        style={{
          height: '20%',
          pointerEvents: acceptsDrop ? 'auto' : 'none',
          zIndex: 1,
        }}
      />
      {/* Permanent bonus header */}
      {type === 'equipment' && (
        <div
          className={`absolute left-1/2 z-30 flex items-center gap-1 sm:gap-2 rounded-full border border-border bg-background/95 dh-hero-chip font-bold tracking-wide text-muted-foreground shadow-lg whitespace-nowrap ${isFlat ? 'px-1.5 py-0 sm:px-2 sm:py-0' : 'px-2 py-0.5 sm:px-4 sm:py-1.5'}`}
          style={{ top: 'calc(-1 * var(--dh-grid-gap-y) / 2)', transform: 'translate(-50%, -50%)' }}
        >
          {tempAttackBonus !== 0 && (
            <>
              <span className={tempAttackBonus > 0 ? 'text-orange-400' : 'text-orange-400/60'}>{formatBonus(tempAttackBonus)}{!isCompact && ' ATK'}</span>
              <span className="text-muted-foreground/50">|</span>
            </>
          )}
          <span className="text-red-500">{formatBonus(permanentDamageBonus)}{!isCompact && ' DMG'}</span>
          <span className="text-muted-foreground/50">|</span>
          <span className="text-blue-500">{formatBonus(permanentShieldBonus)}{!isCompact && ' SHD'}</span>
          {tempShieldBonus !== 0 && (
            <>
              <span className="text-muted-foreground/50">|</span>
              <span className={tempShieldBonus > 0 ? 'text-cyan-400' : 'text-cyan-400/60'}>{formatBonus(tempShieldBonus)}{!isCompact && ' TMP'}</span>
            </>
          )}
        </div>
      )}

      {/* Durability Columns Background - Always render for equipment slots */}
      {type === 'equipment' && (
        <div
          className={`absolute inset-0 z-0 flex flex-row-reverse overflow-hidden rounded-md border-2 border-dashed border-border bg-muted/10 ${
            heroSkillHighlight ? 'ring-4 ring-amber-400 animate-pulse shadow-[0_0_16px_4px_rgba(245,158,11,0.4)]' : ''
          }`}
        >
          {Array.from({ length: DURABILITY_SEGMENTS }, (_, idx) => idx + 1).map((num) => {
            const isCurrent = currentDurability > 0 && num === currentDurability;
            const isWithinMax = maxDurability > 0 && num <= maxDurability;
            const columnClasses = [
              'durability-column h-full flex items-center justify-center border-l border-border/20 font-mono font-bold transition-colors',
              isCurrent
                ? 'bg-amber-300/80 text-amber-900 shadow-inner shadow-amber-500/40'
                : 'bg-muted/15 text-muted-foreground/60',
              !isWithinMax ? 'opacity-30' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div
                key={num}
                className={columnClasses}
                style={{ width: `${colWidth}px` }}
              >
                {num}
              </div>
            );
          })}
          {/* Fill the rest of the space */}
          <div className="flex-1 bg-background/50" />
        </div>
      )}
      
      {gameCardData ? (
        reserveItems.length > 0 ? (
          <div
            className="relative w-full h-full z-20 overflow-visible transition-transform duration-300 ease-out"
            style={{
              transform: type === 'equipment' && currentDurability
                ? `translateX(-${Math.min(DURABILITY_SEGMENTS, currentDurability) * colWidth}px)`
                : 'none',
            }}
          >
            {type === 'equipment' && (1 + reserveItems.length) < slotCapacity && (
              <div
                className={`absolute inset-0 rounded-lg border-dashed pointer-events-none transition-[border-color,border-width] duration-200 ${
                  acceptsDrop ? 'border-4 border-primary animate-pulse' : 'border-2 border-muted-foreground/25'
                }`}
                style={{ zIndex: 15, transform: `translateY(${28 + 10}%)` }}
              />
            )}
            {reserveItems.map((reserveCard, rIdx) => {
              const total = reserveItems.length + 1;
              const bottomY = -6;
              const topY = 28;
              const step = total <= 1 ? 0 : (topY - bottomY) / (total - 1);
              const y = bottomY + rIdx * step;
              return (
                <div
                  key={reserveCard.id}
                  className="absolute inset-0"
                  style={{ zIndex: 20 + rIdx, transform: `translateY(${y}%)`, touchAction: 'none' }}
                  onPointerDown={(e) => {
                    if (isStunFrozen) return;
                    e.preventDefault();
                    const el = e.currentTarget;
                    el.setPointerCapture(e.pointerId);
                    el.dataset.swipeStartY = String(e.clientY);
                    el.dataset.swipeBaseY = String(y);
                    el.style.transition = 'none';
                  }}
                  onPointerMove={(e) => {
                    const el = e.currentTarget;
                    if (!el.dataset.swipeStartY) return;
                    const dy = Math.max(0, e.clientY - parseFloat(el.dataset.swipeStartY));
                    const baseY = el.dataset.swipeBaseY ?? '0';
                    el.style.transform = `translateY(${baseY}%) translateY(${dy}px)`;
                  }}
                  onPointerUp={(e) => {
                    const el = e.currentTarget;
                    if (!el.dataset.swipeStartY) return;
                    const dy = e.clientY - parseFloat(el.dataset.swipeStartY);
                    const baseY = el.dataset.swipeBaseY ?? '0';
                    el.style.transition = 'transform 0.2s ease-out';
                    el.style.transform = `translateY(${baseY}%)`;
                    delete el.dataset.swipeStartY;
                    delete el.dataset.swipeBaseY;
                    if (dy > RESERVE_SWIPE_THRESHOLD) {
                      onSwapToTop?.(rIdx);
                    }
                  }}
                  onPointerCancel={(e) => {
                    const el = e.currentTarget;
                    const baseY = el.dataset.swipeBaseY ?? '0';
                    el.style.transition = 'transform 0.2s ease-out';
                    el.style.transform = `translateY(${baseY}%)`;
                    delete el.dataset.swipeStartY;
                    delete el.dataset.swipeBaseY;
                  }}
                >
              <GameCard
                card={{ ...reserveCard, fromSlot: slotId } as GameCardData}
                disableInteractions
                amuletDescriptionVariant="topThird"
                className={`shadow-md opacity-80 ${isStunFrozen ? 'pointer-events-none' : ''}`}
              />
                </div>
              );
            })}
            <div
              className={`absolute inset-0 ${
                heroSkillHighlight ? 'cursor-pointer' : ''
              }`}
              style={{
                zIndex: 20 + reserveItems.length,
                transform: 'translateY(28%)',
              }}
            >
              <GameCard
                card={equipmentDisplayCard!}
                equipmentStatModifier={statModifier}
                disableInteractions={isStunFrozen}
                onDragStart={(card) => wrappedOnDragStart({ ...card, fromSlot: slotId })}
                onDragEnd={wrappedOnDragEnd}
                onClick={onCardClick ? () => onCardClick(gameCardData!) : undefined}
                className="shadow-lg"
                bleedAnimation={bleedAnimation}
                weaponSwingAnimation={weaponSwingAnimation}
                weaponSwingVariant={weaponSwingVariant}
                shieldBlockAnimation={shieldBlockAnimation}
                shieldBlockVariant={shieldBlockVariant}
                showExhaustedOverlay={isExhaustedThisTurn}
              />
            </div>
          </div>
        ) : (
          <div 
            className={`w-full h-full relative z-20 transition-transform duration-300 ease-out ${
              heroSkillHighlight ? 'cursor-pointer' : ''
            }`}
            style={{
              transform:
                type === 'equipment' && currentDurability
                  ? `translateX(-${Math.min(DURABILITY_SEGMENTS, currentDurability) * colWidth}px)`
                  : 'none',
            }}
          >
            {type === 'equipment' && slotCapacity > 1 && (
              <div
                className={`absolute inset-0 rounded-lg border-dashed pointer-events-none transition-[border-color,border-width] duration-200 ${
                  acceptsDrop ? 'border-4 border-primary animate-pulse' : 'border-2 border-muted-foreground/25'
                }`}
                style={{ zIndex: 15, transform: 'translateY(28%)' }}
              />
            )}
            <GameCard 
              card={type === 'equipment' ? equipmentDisplayCard! : gameCardData!}
              equipmentStatModifier={statModifier}
              disableInteractions={isStunFrozen}
              onDragStart={(card) => wrappedOnDragStart({ ...card, fromSlot: slotId })}
              onDragEnd={wrappedOnDragEnd}
              onClick={type === 'backpack' ? onClick : onCardClick ? () => onCardClick(gameCardData!) : undefined}
              className={`${type === 'backpack' ? 'cursor-pointer' : ''} shadow-lg`}
              bleedAnimation={bleedAnimation}
              weaponSwingAnimation={weaponSwingAnimation}
              weaponSwingVariant={weaponSwingVariant}
              shieldBlockAnimation={shieldBlockAnimation}
              shieldBlockVariant={shieldBlockVariant}
              showExhaustedOverlay={isExhaustedThisTurn}
            />
            {type === 'backpack' && backpackCount > 1 && (
              <div className="absolute top-[-8px] left-[-8px] z-40 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center border-2 border-background shadow-md font-bold text-xs">
                {backpackCount}
              </div>
            )}
          </div>
        )
      ) : (
        <>
          {type === 'equipment' && slotCapacity > 1 && (
            <div
              className={`absolute inset-0 rounded-lg border-dashed pointer-events-none transition-[border-color,border-width] duration-200 ${
                acceptsDrop ? 'border-4 border-primary animate-pulse' : 'border-2 border-muted-foreground/25'
              }`}
              style={{ zIndex: 5, transform: 'translateY(28%)' }}
            />
          )}
          <Card className={`
            h-full w-full border-2 border-dashed border-border
            flex flex-col items-center justify-center gap-2
            transition-[border-color,background-color] duration-200 relative z-10
            ${
              acceptsDrop
                ? isCombatDropTarget
                  ? 'border-dashed border-destructive border-4 bg-destructive/10 animate-pulse'
                  : 'border-dashed border-primary border-4 bg-primary/10 animate-pulse'
                : 'bg-muted/30'
            }
            ${
              acceptsDrop && isOver
                ? isCombatDropTarget
                  ? 'scale-105 ring-4 ring-destructive bg-destructive/20'
                  : 'scale-105 ring-4 ring-primary bg-primary/20'
                : ''
            }
            ${heroSkillHighlight ? 'ring-4 ring-amber-400 animate-pulse cursor-pointer shadow-[0_0_16px_4px_rgba(245,158,11,0.4)]' : ''}
          `}>
            {getIcon()}
            <span className="dh-hero-chip text-muted-foreground font-medium">{getLabel()}</span>
          </Card>
        </>
      )}
      {heroSkillHighlight && heroSkillLabel && (
        <div
          className="absolute top-1/2 left-1/2 z-40 equip-slot-target-btn bg-amber-500 text-white font-bold py-2 rounded-full shadow-lg border-2 border-amber-300 cursor-pointer select-none whitespace-nowrap text-center"
          onClick={(e) => { e.stopPropagation(); onClick?.(); }}
          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onClick?.(); }}
        >
          {heroSkillLabel}
        </div>
      )}
      {isUnbreakable && gameCardData && (
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-40 bg-yellow-400/90 text-yellow-900 font-bold px-2 py-0.5 rounded-full shadow-md border border-yellow-500 text-xs whitespace-nowrap animate-pulse">
          涌泉满手
        </div>
      )}
      {isStunFrozen && type === 'equipment' && (
        <>
          <div className="absolute inset-0 z-[35] rounded-md bg-cyan-400/20 border-2 border-cyan-400/60 animate-pulse cursor-not-allowed" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 bg-cyan-600/90 text-white font-bold px-3 py-1 rounded-full shadow-lg border-2 border-cyan-300 text-xs whitespace-nowrap animate-pulse pointer-events-none">
            击晕冻结
          </div>
        </>
      )}
      {type === 'equipment' && gameCardData && acceptsDrop && (
        <div
          className={`pointer-events-none absolute inset-0 z-[25] rounded-md border-4 border-dashed transition-all duration-200 ${
            isCombatDropTarget
              ? 'border-destructive bg-destructive/10 animate-pulse'
              : 'border-primary bg-primary/10 animate-pulse'
          } ${acceptsDrop && isOver ? 'scale-[1.01]' : ''}`}
        />
      )}
      {isCardDragging && slotActionCount != null && (
        <div className="pointer-events-none absolute inset-0 z-[16] flex items-center justify-center rounded-md bg-black/10">
          {slotActionCount <= 0 ? (
            <X className="w-3/5 h-3/5 text-red-500/50 stroke-[3]" />
          ) : (
            <svg className="w-3/5 h-3/5 text-red-500/50" viewBox="0 0 24 24">
              <text x="12" y="12" textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize="20" fontWeight="800">
                {slotActionCount}
              </text>
            </svg>
          )}
        </div>
      )}
      {isExhaustedThisTurn && isCardDragging && slotActionCount == null && (
        <div className="pointer-events-none absolute inset-0 z-[16] flex items-center justify-center rounded-md bg-black/10">
          <X className="w-3/5 h-3/5 text-red-500/50 stroke-[3]" />
        </div>
      )}
    </div>
  );
}
