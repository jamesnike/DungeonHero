import React, { memo, type CSSProperties } from 'react';
import GameCard from '@/components/GameCard';
import type { GameCardData, EquipmentCardStatModifier } from '@/components/GameCard';
import { useGameState } from '@/hooks/useGameEngine';
import { useDispatch } from '@/hooks/useGameEngine';
import { ShieldOff, Calendar } from 'lucide-react';
import { DUNGEON_COLUMNS, MONSTER_RAGE_BASE_TRANSLATE_PX, MONSTER_RAGE_TRANSLATE_ADJUST_PX } from '../constants';
import { getActiveStackedCardStyle } from '../utils/animation-helpers';
import { useActiveRowDerivedState, type ActiveRowDerivedState } from '../hooks/useActiveRowDerivedState';

const EMPTY_ARRAY: GameCardData[] = [];

export interface ActiveRowInteractionState {
  isWaterfallLocked: boolean;
  isDefeatAnimationPlaying: boolean;
  fullBoardInteractionLocked: boolean;
  draggedEquipment: GameCardData | null;
  rageStripWidth: number;
  isCompactViewport: boolean;
  cellWrapperClass: string;
  cellInnerClass: string;
  monsterBleedStates: Record<string, number>;
  monsterHealStates: Record<string, number>;
  monsterDefeatStates: Record<string, boolean>;
  removingCards: Set<string>;
  pendingDungeonUseRef: React.MutableRefObject<Set<string>>;
}

export interface ActiveRowCallbacks {
  setActiveCellRef: (index: number, el: HTMLDivElement | null) => void;
  handleDragStartFromDungeon: (e: any) => void;
  handleDragEndFromDungeon: (e: any) => void;
  handleWeaponToMonster: (weapon: any, card: GameCardData) => void;
  handleMonsterTargetSelection: (card: GameCardData) => void;
  handleDungeonCardSelection: (card: GameCardData) => void;
  handleCardClick: (card: GameCardData) => void;
  getMonsterRageOverlayStyle: (monsterId: string) => CSSProperties;
  registerMonsterCellRef: (monsterId?: string) => (el: HTMLDivElement | null) => void;
}

interface ActiveCellProps {
  index: number;
  interaction: ActiveRowInteractionState;
  derived: ActiveRowDerivedState;
  callbacks: ActiveRowCallbacks;
}

const ActiveCell = memo(function ActiveCell({
  index,
  interaction,
  derived,
  callbacks,
}: ActiveCellProps) {
  const card = useGameState(s => s.activeCards[index]);
  const stackedCards = useGameState(s => s.activeCardStacks[index] ?? EMPTY_ARRAY);
  const resolvingDungeonCardId = useGameState(s => s.resolvingDungeonCardId);
  const pendingMagicAction = useGameState(s => s.pendingMagicAction);
  const dispatch = useDispatch();

  const {
    isWaterfallLocked,
    isDefeatAnimationPlaying,
    fullBoardInteractionLocked,
    draggedEquipment,
    rageStripWidth,
    isCompactViewport,
    cellWrapperClass,
    cellInnerClass,
    monsterBleedStates,
    monsterHealStates,
    monsterDefeatStates,
    removingCards,
    pendingDungeonUseRef,
  } = interaction;

  const {
    monsterTargetingActive,
    dungeonTargetingActive,
    playerTargetingActive,
    showMonsterAttackIndicator,
    handLockedForMonsterPhase,
    heroStunned,
    eventPendingLocked,
    curseMonumentCols,
  } = derived;

  const colWidth = rageStripWidth;
  const isEngagedMonster = useGameState(s =>
    Boolean(card && card.type === 'monster' && s.combatState.engagedMonsterIds.includes(card.id)),
  );
  const isResolvingCard =
    resolvingDungeonCardId === card?.id ||
    (card != null && pendingDungeonUseRef.current.has(card.id));
  const isEventPendingCell =
    resolvingDungeonCardId === card?.id && eventPendingLocked;
  const isMonsterTurnLock =
    showMonsterAttackIndicator ||
    isWaterfallLocked ||
    isDefeatAnimationPlaying ||
    fullBoardInteractionLocked;
  const monsterTargetHighlight = Boolean(
    monsterTargetingActive &&
      card &&
      (card.type === 'monster' || card.type === 'building'),
  );
  const dungeonTargetHighlight =
    dungeonTargetingActive &&
    (pendingMagicAction?.effect === 'return-dungeon-bottom' ||
      pendingMagicAction?.effect === 'shuffle-dungeon' ||
      pendingMagicAction?.effect === 'dungeon-swap-select' ||
      pendingMagicAction?.effect === 'dungeon-preview-swap' ||
      pendingMagicAction?.effect === 'fate-swap' ||
      pendingMagicAction?.effect === 'flip-back-active' ||
      pendingMagicAction?.effect === 'flip-active-card' ||
      pendingMagicAction?.effect === 'deck-top-swap-gold');
  const monsterLayerValue =
    card && card.type === 'monster'
      ? Math.min(4, Math.max(card.currentLayer ?? card.hpLayers ?? card.fury ?? 0, 0))
      : 0;

  if (!card) {
    return (
      <div
        key={`active-empty-${index}`}
        className={cellWrapperClass}
        ref={el => callbacks.setActiveCellRef(index, el)}
      />
    );
  }

  const hasActiveStack = stackedCards.length > 0;
  const isMonster = card.type === 'monster';
  const rageBaseTranslate = isCompactViewport ? 1 : MONSTER_RAGE_BASE_TRANSLATE_PX;
  const monsterTranslateX = isMonster
    ? rageBaseTranslate +
      (monsterLayerValue > 0
        ? Math.max(
            (monsterLayerValue - 1) * colWidth + MONSTER_RAGE_TRANSLATE_ADJUST_PX,
            0,
          )
        : 0)
    : 0;

  const activeCellWrapper = isMonster || hasActiveStack
    ? `${cellWrapperClass} relative overflow-visible`
    : cellWrapperClass;

  return (
    <div
      key={`active-${index}`}
      ref={el => callbacks.setActiveCellRef(index, el)}
      className={`${activeCellWrapper}${isEventPendingCell ? ' event-pending-cell' : ''}${card?.hasReleaseCharge ? ' fate-blade-charged' : ''}`}
      style={isEventPendingCell ? { pointerEvents: 'auto' } : undefined}
    >
      {isMonster && (
        <div
          className="absolute z-0 flex flex-row-reverse overflow-hidden rounded-md bg-destructive/10"
          style={callbacks.getMonsterRageOverlayStyle(card.id)}
        >
          {[1, 2, 3, 4].map((num) => {
            const isActiveLayer = monsterLayerValue > 0 && num === monsterLayerValue;
            const furyColumnClasses = [
              'monster-rage-column h-full flex items-center justify-center border-l border-border/20 font-mono font-bold transition-colors',
              isActiveLayer
                ? 'bg-destructive/80 text-destructive-foreground shadow-inner shadow-destructive/60'
                : 'bg-transparent text-destructive/30 opacity-30',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div
                key={num}
                className={furyColumnClasses}
                style={{ width: `${colWidth}px` }}
                data-strip-offset={(num - 1) * colWidth}
              >
                {num}
              </div>
            );
          })}
          <div className="flex-1 bg-background/50" />
        </div>
      )}
      <div
        ref={isMonster ? callbacks.registerMonsterCellRef(card.id) : undefined}
        className={`${cellInnerClass} relative z-20 transition-transform duration-300 ease-out`.trim()}
        style={{
          transform:
            isMonster && monsterTranslateX > 0
              ? `translateX(-${monsterTranslateX}px)`
              : 'none',
        }}
      >
        {hasActiveStack && stackedCards.map((stackCard, sIdx) => (
          <div
            key={stackCard.id}
            className="absolute inset-0 rounded-md overflow-hidden pointer-events-none"
            style={getActiveStackedCardStyle(stackedCards.length, sIdx)}
          >
            <GameCard card={stackCard} disableInteractions />
          </div>
        ))}
        <GameCard
          card={card}
          onDragStart={
            isMonsterTurnLock || playerTargetingActive
              ? undefined
              : callbacks.handleDragStartFromDungeon
          }
          onDragEnd={callbacks.handleDragEndFromDungeon}
          onWeaponDrop={
            playerTargetingActive || fullBoardInteractionLocked || heroStunned
              ? undefined
              : (weapon: any) => callbacks.handleWeaponToMonster(weapon, card)
          }
          isWeaponDropTarget={
            !playerTargetingActive &&
            !fullBoardInteractionLocked &&
            !handLockedForMonsterPhase &&
            !heroStunned &&
            (draggedEquipment?.type === 'weapon' ||
              draggedEquipment?.type === 'monster' ||
              (draggedEquipment?.type === 'shield' &&
                !!draggedEquipment?.shieldBashStunRate)) &&
            (card.type === 'monster' || card.type === 'building')
          }
          bleedAnimation={Boolean(monsterBleedStates[card.id])}
          healAnimation={Boolean(monsterHealStates[card.id])}
          defeatAnimation={Boolean(monsterDefeatStates[card.id])}
          className={`${hasActiveStack ? 'relative z-[5]' : ''} ${removingCards.has(card.id) ? 'animate-card-remove' : 'shadow-lg'} ${
            (isMonsterTurnLock && !monsterTargetHighlight && !dungeonTargetHighlight) ||
            (isResolvingCard && !isEventPendingCell && !monsterTargetHighlight && !dungeonTargetHighlight)
              ? 'opacity-60 pointer-events-none'
              : ''
          } ${monsterTargetHighlight ? 'monster-target-highlight animate-pulse' : ''} ${dungeonTargetHighlight ? 'dungeon-target-highlight animate-pulse' : ''}`.trim()}
          isEngaged={isEngagedMonster}
          onClick={() => {
            if (
              monsterTargetingActive &&
              (card.type === 'monster' || card.type === 'building')
            ) {
              callbacks.handleMonsterTargetSelection(card);
              return;
            }
            if (dungeonTargetingActive) {
              callbacks.handleDungeonCardSelection(card);
              return;
            }
            if (isEventPendingCell) {
              dispatch({ type: 'SET_EVENT_MODAL_MINIMIZED', minimized: false });
              return;
            }
            if (isMonsterTurnLock || isResolvingCard) return;
            callbacks.handleCardClick(card);
          }}
        />
        {hasActiveStack && (
          <div className="absolute top-[-4px] right-[-4px] z-40 bg-amber-500 text-white rounded-full w-5 h-5 flex items-center justify-center border-2 border-background shadow-md font-bold text-xs pointer-events-none">
            {stackedCards.length + 1}
          </div>
        )}
        {curseMonumentCols.has(index) && card.type === 'monster' && (
          <div
            className="absolute bottom-[-4px] left-[-4px] z-40 bg-purple-700 text-white rounded-full w-5 h-5 flex items-center justify-center border-2 border-background shadow-md pointer-events-none"
            title="诅咒碑光环：免疫魔法伤害"
          >
            <ShieldOff className="w-3 h-3" />
          </div>
        )}
        {isEventPendingCell && (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center rounded-md cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: 'SET_EVENT_MODAL_MINIMIZED', minimized: false });
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dispatch({ type: 'SET_EVENT_MODAL_MINIMIZED', minimized: false });
            }}
          >
            <div className="absolute inset-0 rounded-md ring-2 ring-pink-500 animate-pulse" />
            <div className="bg-pink-600/90 rounded-full px-2.5 py-1 flex items-center gap-1 shadow-lg">
              <Calendar className="w-3 h-3 text-white" />
              <span className="text-white text-xs font-bold">待处理</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

interface ActiveRowProps {
  interaction: ActiveRowInteractionState;
  callbacks: ActiveRowCallbacks;
}

export const ActiveRow = memo(function ActiveRow({
  interaction,
  callbacks,
}: ActiveRowProps) {
  const derived = useActiveRowDerivedState();

  return (
    <>
      {DUNGEON_COLUMNS.map((index) => (
        <ActiveCell
          key={index}
          index={index}
          interaction={interaction}
          derived={derived}
          callbacks={callbacks}
        />
      ))}
    </>
  );
});

export default ActiveRow;
