import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Swords, Minimize2, Maximize2 } from 'lucide-react';
import type { GameCardData } from './GameCard';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useGameViewport } from '@/contexts/GameViewportContext';

type EquipmentSlotId = 'equipmentSlot1' | 'equipmentSlot2';

interface CombatPanelProps {
  engagedMonsters: GameCardData[];
  isActive: boolean;
  currentTurn: 'hero' | 'monster';
  heroAttacksRemaining: number;
  heroAttacksThisTurn: Record<EquipmentSlotId, boolean>;
  pendingBlock: { monsterId: string; attackValue: number; monsterName: string } | null;
  monsterAttackQueue: string[];
  onEndHeroTurn: () => void;
  /** 弃牌雷击等序列进行中时禁用结束回合 */
  endHeroTurnDisabled?: boolean;
  equipmentSlot1: (GameCardData & { type: 'weapon' | 'shield' | 'monster' }) | null;
  equipmentSlot2: (GameCardData & { type: 'weapon' | 'shield' | 'monster' }) | null;
  stageScale?: number;
  onDragHandlePointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  isDragging?: boolean;
  minimized: boolean;
  onMinimizedChange: (minimized: boolean) => void;
}

const MEASURED_PANEL_MIN = 0.65;
const MEASURED_PANEL_MAX = 1.75;
const FINAL_PANEL_MIN = 0.65;
const FINAL_PANEL_MAX = 2.6;
const BASE_PANEL_WIDTH = 360;
const PANEL_BOOST_MULTIPLIER = 0.65;

export default function CombatPanel({
  engagedMonsters,
  isActive,
  currentTurn,
  heroAttacksRemaining,
  heroAttacksThisTurn,
  pendingBlock,
  monsterAttackQueue,
  onEndHeroTurn,
  endHeroTurnDisabled = false,
  equipmentSlot1,
  equipmentSlot2,
  stageScale = 1,
  onDragHandlePointerDown,
  isDragging = false,
  minimized,
  onMinimizedChange,
}: CombatPanelProps) {
  const gameViewport = useGameViewport();
  const [panelScale, setPanelScale] = useState(1);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isActive || engagedMonsters.length === 0) {
      return;
    }
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

    // Minimized strip is narrow; measuring it undervalues scale. Use same width heuristic as GameBoard combat wrapper.
    if (minimized) {
      const scaledMin = 135 * stageScale;
      const scaledMax = 170 * stageScale;
      const vwPart = (11 * stageScale * gameViewport.width) / 100;
      const targetWidth = Math.min(Math.max(scaledMin, vwPart), scaledMax);
      const next = clamp(targetWidth / BASE_PANEL_WIDTH, MEASURED_PANEL_MIN, MEASURED_PANEL_MAX);
      setPanelScale(prev => (Math.abs(prev - next) > 0.01 ? next : prev));
      return;
    }

    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const target = cardRef.current;
    if (!target) {
      return;
    }
    const updateScale = () => {
      const width = target.getBoundingClientRect().width;
      if (!width) return;
      setPanelScale(prev => {
        const next = clamp(width / BASE_PANEL_WIDTH, MEASURED_PANEL_MIN, MEASURED_PANEL_MAX);
        return Math.abs(prev - next) > 0.01 ? next : prev;
      });
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(target);
    return () => observer.disconnect();
  }, [isActive, engagedMonsters.length, minimized, stageScale, gameViewport.width]);

  if (!isActive || engagedMonsters.length === 0) {
    return null;
  }
  const currentAttackerId = pendingBlock?.monsterId ?? null;
  const currentAttacker =
    pendingBlock && engagedMonsters.find(mon => mon.id === pendingBlock.monsterId);

  const renderSlotStatus = (slotId: EquipmentSlotId, item: (GameCardData & { type: 'weapon' | 'shield' | 'monster' }) | null) => {
    const used = heroAttacksThisTurn[slotId];
    const label = slotId === 'equipmentSlot1' ? 'Left' : 'Right';
    const getSlotLabel = (slotItem: GameCardData & { type: 'weapon' | 'shield' | 'monster' }) => {
      if (slotItem.type === 'monster') {
        return `(${slotItem.attack ?? slotItem.value} dmg / ${slotItem.hp ?? slotItem.value} block)`;
      }
      return slotItem.type === 'weapon' ? `(${slotItem.value} dmg)` : `(${slotItem.value} block)`;
    };
    return (
      <div className="flex flex-col px-3 py-2 rounded-md border bg-background/50" key={slotId}>
        <span className="combat-panel__slot-label uppercase tracking-wide text-muted-foreground">
          {label} Slot
        </span>
        {item ? (
          <span className="combat-panel__slot-name font-semibold">
            {item.name} {getSlotLabel(item)}
          </span>
        ) : (
          <span className="combat-panel__slot-name text-muted-foreground">Empty</span>
        )}
        <span className={`combat-panel__slot-state font-medium ${used ? 'text-red-500' : 'text-green-500'}`}>
          {used ? 'Used this turn' : 'Ready'}
        </span>
      </div>
    );
  };

  const statusStylesForMonster = (monsterId: string) => {
    if (currentTurn !== 'monster') {
      return {
        badge: 'bg-primary/15 text-primary',
        card: 'border-border bg-background/80',
        label: 'Hero Turn',
      };
    }
    if (currentAttackerId === monsterId) {
      return {
        badge: 'bg-destructive/20 text-destructive',
        card: 'border-destructive bg-destructive/10 shadow-inner',
        label: 'Attacking',
      };
    }
    const queueIndex = monsterAttackQueue.indexOf(monsterId);
    if (queueIndex >= 0) {
      return {
        badge: 'bg-amber-100 text-amber-900',
        card: 'border-amber-200 bg-amber-50/30',
        label: `Queued #${queueIndex + 1}`,
      };
    }
    return {
      badge: 'bg-muted text-muted-foreground',
      card: 'border-border bg-muted/30',
      label: 'Waiting',
    };
  };

  const turnSummary =
    currentTurn === 'hero'
      ? `${engagedMonsters.length} monster${engagedMonsters.length === 1 ? '' : 's'} engaged`
      : pendingBlock
        ? `${pendingBlock.monsterName} attacking (${pendingBlock.attackValue})`
        : monsterAttackQueue.length > 0
          ? `${monsterAttackQueue.length} attack${monsterAttackQueue.length === 1 ? '' : 's'} queued`
          : 'Monsters regrouping';

  const rawCombinedScale = panelScale * stageScale;
  const boostedCombinedScale =
    rawCombinedScale > 1
      ? rawCombinedScale + (rawCombinedScale - 1) * PANEL_BOOST_MULTIPLIER
      : rawCombinedScale;
  const combinedPanelScale = Math.min(
    FINAL_PANEL_MAX,
    Math.max(FINAL_PANEL_MIN, boostedCombinedScale),
  );

  if (minimized) {
    return (
      <Card
        ref={cardRef}
        className={`relative z-10 border border-primary/25 bg-card/95 shadow-lg combat-panel${isDragging ? ' combat-panel--dragging' : ''}`}
        style={{ '--dh-combat-panel-scale': combinedPanelScale.toString() } as CSSProperties}
      >
        <div
          className={[
            'p-2 flex items-center gap-2',
            onDragHandlePointerDown && 'combat-panel__drag-handle',
            onDragHandlePointerDown && isDragging && 'combat-panel__drag-handle--active',
          ].filter(Boolean).join(' ')}
          onPointerDown={onDragHandlePointerDown}
          aria-grabbed={isDragging || undefined}
        >
          <button
            type="button"
            className="flex-shrink-0 rounded-md p-1 hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            onClick={() => onMinimizedChange(false)}
            title="Expand combat panel"
          >
            <Maximize2 className="combat-panel__icon" />
          </button>
          {currentTurn === 'hero' ? (
            <Button
              size="sm"
              className="combat-panel__button flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold shadow-md"
              disabled={endHeroTurnDisabled}
              onClick={(e) => { e.stopPropagation(); onEndHeroTurn(); }}
            >
              End Hero Turn
            </Button>
          ) : (
            <span className="combat-panel__summary text-muted-foreground truncate flex-1">
              {currentAttacker
                ? `${currentAttacker.name} attacking...`
                : 'Monsters turn'}
            </span>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card
      ref={cardRef}
      className={`relative z-10 w-full h-full border border-primary/25 bg-card/95 shadow-lg combat-panel${isDragging ? ' combat-panel--dragging' : ''}`}
      style={{ '--dh-combat-panel-scale': combinedPanelScale.toString() } as CSSProperties}
    >
      <div className="p-2 h-full flex flex-col gap-2">
        <div
          className={`combat-panel__drag-handle flex items-start justify-between gap-1.5${isDragging ? ' combat-panel__drag-handle--active' : ''}`}
          onPointerDown={onDragHandlePointerDown}
          aria-grabbed={isDragging}
        >
          <div className="space-y-0.5 flex-1 min-w-0">
            <p className="combat-panel__label uppercase tracking-wide text-muted-foreground">Combat</p>
            <p className="combat-panel__title font-semibold">
              {currentTurn === 'hero' ? 'Hero Turn' : 'Monsters Turn'}
            </p>
            <p className="combat-panel__summary text-muted-foreground line-clamp-2">{turnSummary}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              className="rounded-md p-1 hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
              onClick={() => onMinimizedChange(true)}
              title="Minimize combat panel"
            >
              <Minimize2 className="combat-panel__icon" />
            </button>
            <div className="combat-panel__icon-ring rounded-full bg-muted/60 flex items-center justify-center">
              {currentTurn === 'hero' ? (
                <Swords className="combat-panel__icon text-primary" />
              ) : (
                <Shield className="combat-panel__icon text-destructive" />
              )}
            </div>
          </div>
        </div>

        {pendingBlock && (
          <div className="combat-panel__alert rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-destructive">
            {pendingBlock.monsterName} will deal {pendingBlock.attackValue} damage. Choose a block target.
          </div>
        )}

        <div className="flex-1 overflow-y-auto rounded-md border bg-muted/40 p-1 space-y-1.5 max-h-[60vh]">
          {engagedMonsters.map((engaged) => {
            const status = statusStylesForMonster(engaged.id);
            const hp = engaged.hp ?? engaged.value;
            const maxHp = engaged.maxHp ?? hp;
            const fury = engaged.currentLayer ?? engaged.fury ?? 1;
            const attackValue = engaged.attack ?? engaged.value;
            return (
              <div
                key={engaged.id}
                className={`flex items-start gap-1 rounded-md border px-1.5 py-1 ${status.card}`}
              >
                <div className="combat-panel__thumb rounded-md overflow-hidden border border-border/40 bg-background flex-shrink-0">
                  {engaged.image ? (
                    <img src={engaged.image} alt={engaged.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center combat-panel__thumb-fallback text-muted-foreground">
                      Monster
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-0.5 min-w-0">
                  <div className="flex items-center justify-between gap-0.5">
                    <span className="combat-panel__list-name font-semibold truncate">{engaged.name}</span>
                    <span
                      className={`combat-panel__badge font-semibold px-1 py-0.5 rounded-full whitespace-nowrap ${status.badge}`}
                    >
                      {status.label}
                    </span>
                  </div>
                  <p className="combat-panel__stat text-muted-foreground">
                    HP {hp}/{maxHp} • Fury {fury}
                  </p>
                  <p className="combat-panel__stat text-muted-foreground">ATK {attackValue}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border/30 pt-1.5">
          {currentTurn === 'hero' ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-1">
                <span className="combat-panel__title font-semibold">
                  Attacks remaining: {heroAttacksRemaining}
                </span>
                <Button
                  size="sm"
                  className="px-2 py-1 combat-panel__button bg-amber-500 hover:bg-amber-600 text-white font-bold shadow-md"
                  disabled={endHeroTurnDisabled}
                  onClick={onEndHeroTurn}
                >
                  End Hero Turn
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {renderSlotStatus('equipmentSlot1', equipmentSlot1)}
                {renderSlotStatus('equipmentSlot2', equipmentSlot2)}
              </div>
            </div>
          ) : (
            <p className="combat-panel__footer-text text-muted-foreground">
              {currentAttacker
                ? `${currentAttacker.name} is attacking now.`
                : monsterAttackQueue.length > 0
                  ? 'Waiting for the next attacker...'
                  : 'Monsters are regrouping.'}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

