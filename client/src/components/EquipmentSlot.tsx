import { Card } from '@/components/ui/card';
import { Shield, Sword, Backpack, Package } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { initMobileDrop } from '../utils/mobileDragDrop';
import GameCard, { GameCardData } from './GameCard';

export type SlotType = 'equipment' | 'backpack';

interface EquipmentSlotProps {
  type: SlotType;
  slotId?: string;
  item?: (GameCardData & { [key: string]: any }) | null;
  backpackCount?: number; // Number of items in backpack stack
  permanentDamageBonus?: number; // Permanent damage bonus for this slot
  permanentShieldBonus?: number; // Permanent shield bonus for this slot
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
}

export default function EquipmentSlot({
  type,
  slotId,
  item,
  backpackCount = 0,
  permanentDamageBonus = 0,
  permanentShieldBonus = 0,
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
}: EquipmentSlotProps) {
  const [dragDepth, setDragDepth] = React.useState(0);
  const isOver = dragDepth > 0;
  const slotRef = useRef<HTMLDivElement>(null);
  const acceptsDrop = Boolean(isDropTarget || isCombatDropTarget);
  
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
      ['card'] // Accept card drops
    );
    
    return cleanup;
  }, [onDrop]);
  
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

  // Prepare item as GameCardData
  const gameCardData: GameCardData | null = item ? { ...item } : null;

  const DURABILITY_SEGMENTS = 4;
  const colWidth = 14; // Width of each durability column
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
    >
      {/* Permanent bonus header */}
      {type === 'equipment' && (
        <div className="absolute -top-7 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 sm:gap-2 rounded-full border border-border bg-background/95 px-2 py-0.5 sm:px-4 sm:py-1.5 text-[10px] sm:text-xs md:text-sm font-bold tracking-wide text-muted-foreground shadow-lg whitespace-nowrap">
          <span className="text-red-500">{formatBonus(permanentDamageBonus)} DMG</span>
          <span className="text-muted-foreground/50">|</span>
          <span className="text-blue-500">{formatBonus(permanentShieldBonus)} SHD</span>
        </div>
      )}

      {/* Durability Columns Background - Always render for equipment slots */}
      {type === 'equipment' && (
        <div
          className={`absolute inset-0 z-0 flex flex-row-reverse overflow-hidden rounded-md border-2 border-dashed border-border bg-muted/10 ${
            heroSkillHighlight ? 'ring-4 ring-amber-300 animate-pulse' : ''
          }`}
        >
          {Array.from({ length: DURABILITY_SEGMENTS }, (_, idx) => idx + 1).map((num) => {
            const isCurrent = currentDurability > 0 && num === currentDurability;
            const isWithinMax = maxDurability > 0 && num <= maxDurability;
            const columnClasses = [
              'h-full flex items-center justify-center border-l border-border/20 font-mono font-bold text-lg transition-all',
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
          <GameCard 
            card={gameCardData}
            onDragStart={(card) => onDragStart?.({ ...card, fromSlot: slotId })}
            onDragEnd={onDragEnd}
            onClick={type === 'backpack' ? onClick : onCardClick ? () => onCardClick(gameCardData) : undefined}
            className={`${type === 'backpack' ? 'cursor-pointer' : ''} shadow-lg`}
            bleedAnimation={bleedAnimation}
            weaponSwingAnimation={weaponSwingAnimation}
            weaponSwingVariant={weaponSwingVariant}
            shieldBlockAnimation={shieldBlockAnimation}
            shieldBlockVariant={shieldBlockVariant}
          />
          {/* Backpack count overlay */}
          {type === 'backpack' && backpackCount > 1 && (
            <div className="absolute top-[-8px] left-[-8px] z-40 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center border-2 border-background shadow-md font-bold text-xs">
              {backpackCount}
            </div>
          )}
        </div>
      ) : (
        <Card className={`
          h-full w-full border-2 border-dashed border-border
          flex flex-col items-center justify-center gap-2
          transition-all duration-200 relative z-10
          ${
            acceptsDrop
              ? isCombatDropTarget
                ? 'border-destructive border-4 bg-destructive/10 animate-pulse'
                : 'border-primary border-4 bg-primary/10 animate-pulse'
              : 'bg-muted/30'
          }
          ${
            acceptsDrop && isOver
              ? isCombatDropTarget
                ? 'scale-105 ring-4 ring-destructive bg-destructive/20'
                : 'scale-105 ring-4 ring-primary bg-primary/20'
              : ''
          }
          ${heroSkillHighlight ? 'ring-4 ring-amber-300 animate-pulse cursor-pointer' : ''}
        `}>
          {getIcon()}
          <span className="text-xs text-muted-foreground font-medium">{getLabel()}</span>
        </Card>
      )}
      {heroSkillHighlight && heroSkillLabel && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 bg-amber-200 text-amber-900 text-[11px] font-semibold px-3 py-1 rounded-full shadow">
          {heroSkillLabel}
        </div>
      )}
    </div>
  );
}
