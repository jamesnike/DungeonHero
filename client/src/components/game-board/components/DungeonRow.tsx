/**
 * DungeonRow — renders the active dungeon row (DUNGEON_COLUMN_COUNT cards + GraveyardZone).
 *
 * Handles monster rage overlays, engagement states, and targeting highlights.
 */

import { memo, useMemo } from 'react';
import GameCard from '@/components/GameCard';
import type { GameCardData, EquipmentCardStatModifier } from '@/components/GameCard';
import GraveyardZone from '@/components/GraveyardZone';
import { Calendar, ShieldOff } from 'lucide-react';
import type { ActiveRowSlots, CombatState, PendingMagicAction, EquipmentSlotId } from '../types';
import { DUNGEON_COLUMNS, MONSTER_RAGE_BASE_TRANSLATE_PX, MONSTER_RAGE_TRANSLATE_ADJUST_PX } from '../constants';
import { getColumnsWithCurseMonumentAura } from '@/game-core/buildingAura';

export interface DungeonRowProps {
  activeCards: ActiveRowSlots;
  activeCardStacks: Record<number, GameCardData[]>;
  combatState: CombatState;
  resolvingDungeonCardId: string | null;
  eventPendingLocked: boolean;
  pendingMagicAction: PendingMagicAction | null;
  monsterTargetingActive: boolean;
  dungeonTargetingActive: boolean;
  showMonsterAttackIndicator: boolean;
  isWaterfallLocked: boolean;
  isDefeatAnimationPlaying: boolean;
  fullBoardInteractionLocked: boolean;
  handLockedForMonsterPhase: boolean;
  draggedEquipment: GameCardData | null;
  playerTargetingActive: boolean;
  activeMonsterReward: unknown;
  monsterBleedStates: Record<string, boolean>;
  monsterHealStates: Record<string, boolean>;
  monsterDefeatStates: Record<string, boolean>;
  removingCards: Set<string>;
  rageStripWidth: number;
  isCompactViewport: boolean;
  cellWrapperClass: string;
  cellInnerClass: string;
  discardedCards: GameCardData[];
  graveyardDropEnabled: boolean;
  shouldHighlightGraveyard: boolean;
  isMonsterEngaged: (id: string) => boolean;
  getMonsterRageOverlayStyle: (id: string) => React.CSSProperties;
  registerMonsterCellRef: (id: string) => (el: HTMLDivElement | null) => void;
  setGraveyardRef: (el: HTMLDivElement | null) => void;
  onDragStartFromDungeon: (card: GameCardData) => void;
  onDragEndFromDungeon: () => void;
  onWeaponToMonster: (weapon: any, monster: GameCardData) => void;
  onSellCard: (card: any) => void;
  onCardClick: (card: GameCardData) => void;
  onMonsterTargetSelection: (card: GameCardData) => void;
  onDungeonCardSelection: (card: GameCardData) => void;
  onEventModalRestore: () => void;
}

function DungeonRowInner({
  activeCards,
  activeCardStacks,
  combatState,
  resolvingDungeonCardId,
  eventPendingLocked,
  pendingMagicAction,
  monsterTargetingActive,
  dungeonTargetingActive,
  showMonsterAttackIndicator,
  isWaterfallLocked,
  isDefeatAnimationPlaying,
  fullBoardInteractionLocked,
  handLockedForMonsterPhase,
  draggedEquipment,
  playerTargetingActive,
  activeMonsterReward,
  monsterBleedStates,
  monsterHealStates,
  monsterDefeatStates,
  removingCards,
  rageStripWidth,
  isCompactViewport,
  cellWrapperClass,
  cellInnerClass,
  discardedCards,
  graveyardDropEnabled,
  shouldHighlightGraveyard,
  isMonsterEngaged,
  getMonsterRageOverlayStyle,
  registerMonsterCellRef,
  setGraveyardRef,
  onDragStartFromDungeon,
  onDragEndFromDungeon,
  onWeaponToMonster,
  onSellCard,
  onCardClick,
  onMonsterTargetSelection,
  onDungeonCardSelection,
  onEventModalRestore,
}: DungeonRowProps) {
  const isMonsterTurnLock =
    showMonsterAttackIndicator ||
    isWaterfallLocked ||
    isDefeatAnimationPlaying ||
    fullBoardInteractionLocked;

  const curseMonumentCols = useMemo(
    () => getColumnsWithCurseMonumentAura(activeCards, activeCardStacks),
    [activeCards, activeCardStacks],
  );

  return (
    <>
      {DUNGEON_COLUMNS.map((index) => {
        const card = activeCards[index];
        const colWidth = rageStripWidth;
        const isEngagedMonster = Boolean(
          card && card.type === 'monster' && isMonsterEngaged(card.id),
        );
        const isResolvingCard = resolvingDungeonCardId === card?.id;
        const isEventPendingCell = isResolvingCard && eventPendingLocked;
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
            ? Math.min(
                4,
                Math.max(card.currentLayer ?? card.hpLayers ?? card.fury ?? 0, 0),
              )
            : 0;

        if (!card) {
          return (
            <div key={`active-empty-${index}`} className={cellWrapperClass} />
          );
        }

        const isMonster = card.type === 'monster';
        const stackedCards = activeCardStacks[index] ?? [];
        const hasStack = stackedCards.length > 0;
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

        const activeCellWrapper = isMonster
          ? `${cellWrapperClass} relative overflow-visible`
          : hasStack
            ? `${cellWrapperClass} relative overflow-visible`
            : cellWrapperClass;

        return (
          <div
            key={`active-${index}`}
            className={`${activeCellWrapper}${isEventPendingCell ? ' event-pending-cell' : ''}${card?.hasReleaseCharge ? ' fate-blade-charged' : ''}`}
            style={isEventPendingCell ? { pointerEvents: 'auto' } : undefined}
          >
            {isMonster && (
              <div
                className="absolute z-0 flex flex-row-reverse overflow-hidden rounded-md bg-destructive/10"
                style={getMonsterRageOverlayStyle(card.id)}
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
                    >
                      {num}
                    </div>
                  );
                })}
                <div className="flex-1 bg-background/50" />
              </div>
            )}
            <div
              ref={isMonster ? registerMonsterCellRef(card.id) : undefined}
              className={`${cellInnerClass} relative z-20 transition-transform duration-300 ease-out`.trim()}
              style={{
                transform:
                  isMonster && monsterTranslateX > 0
                    ? `translateX(-${monsterTranslateX}px)`
                    : 'none',
              }}
            >
              {hasStack && (
                <div className="absolute inset-0 z-10 pointer-events-none">
                  {stackedCards.map((stackCard, sIdx) => {
                    const offsetStep = 8;
                    const y = -(stackedCards.length - sIdx) * offsetStep;
                    return (
                      <div
                        key={stackCard.id}
                        className="absolute inset-0 rounded-md overflow-hidden"
                        style={{
                          zIndex: sIdx,
                          transform: `translateY(${y}%)`,
                          opacity: 0.5 - sIdx * 0.1,
                          filter: 'brightness(0.7)',
                          padding: 'var(--dh-card-padding, 0.25rem)',
                        }}
                      >
                        <GameCard card={stackCard} disableInteractions />
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="relative" style={{ zIndex: hasStack ? stackedCards.length + 1 : undefined }}>
                <GameCard
                  card={card}
                  onDragStart={
                    isMonsterTurnLock || playerTargetingActive
                      ? undefined
                      : onDragStartFromDungeon
                  }
                  onDragEnd={onDragEndFromDungeon}
                  onWeaponDrop={
                    playerTargetingActive || fullBoardInteractionLocked
                      ? undefined
                      : (weapon) => onWeaponToMonster(weapon, card)
                  }
                  isWeaponDropTarget={
                    !playerTargetingActive &&
                    !fullBoardInteractionLocked &&
                    !handLockedForMonsterPhase &&
                    (draggedEquipment?.type === 'weapon' ||
                      draggedEquipment?.type === 'monster') &&
                    (card.type === 'monster' || card.type === 'building')
                  }
                  bleedAnimation={Boolean(monsterBleedStates[card.id])}
                  healAnimation={Boolean(monsterHealStates[card.id])}
                  defeatAnimation={Boolean(monsterDefeatStates[card.id])}
                  className={`${removingCards.has(card.id) ? 'animate-card-remove' : 'shadow-lg'} ${
                    (isMonsterTurnLock &&
                      !monsterTargetHighlight &&
                      !dungeonTargetHighlight) ||
                    (isResolvingCard && !isEventPendingCell)
                      ? 'opacity-60 pointer-events-none'
                      : ''
                  } ${
                    monsterTargetHighlight
                      ? 'monster-target-highlight animate-pulse'
                      : ''
                  } ${
                    dungeonTargetHighlight
                      ? 'dungeon-target-highlight animate-pulse'
                      : ''
                  }`.trim()}
                  isEngaged={isEngagedMonster}
                  onClick={() => {
                    if (isEventPendingCell) {
                      onEventModalRestore();
                      return;
                    }
                    if (dungeonTargetingActive) {
                      onDungeonCardSelection(card);
                      return;
                    }
                    if (
                      monsterTargetingActive &&
                      (card.type === 'monster' || card.type === 'building')
                    ) {
                      onMonsterTargetSelection(card);
                      return;
                    }
                    if (isMonsterTurnLock || isResolvingCard) return;
                    onCardClick(card);
                  }}
                />
              </div>
              {hasStack && (
                <div className="absolute top-[-8px] right-[-8px] z-40 bg-amber-500 text-white rounded-full w-6 h-6 flex items-center justify-center border-2 border-background shadow-md font-bold text-xs">
                  {stackedCards.length + 1}
                </div>
              )}
              {curseMonumentCols.has(index) && card.type === 'monster' && (
                <div
                  className="absolute bottom-[-4px] left-[-4px] z-40 bg-purple-700 text-white rounded-full w-6 h-6 flex items-center justify-center border-2 border-background shadow-md"
                  title="诅咒碑光环：免疫魔法伤害"
                >
                  <ShieldOff className="w-3.5 h-3.5" />
                </div>
              )}
              {isEventPendingCell && (
                <div
                  className="absolute inset-0 z-30 flex items-center justify-center rounded-md cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventModalRestore();
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEventModalRestore();
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
      })}

      {/* GraveyardZone in last column */}
      <div className={cellWrapperClass}>
        <div className={cellInnerClass} ref={setGraveyardRef}>
          <GraveyardZone
            onDrop={(card) => {
              if (
                isWaterfallLocked ||
                isDefeatAnimationPlaying ||
                playerTargetingActive ||
                fullBoardInteractionLocked ||
                activeMonsterReward
              )
                return;
              onSellCard(card);
            }}
            isDropTarget={graveyardDropEnabled}
            shouldHighlight={shouldHighlightGraveyard}
            discardedCards={discardedCards}
            onCardSelect={onCardClick}
          />
        </div>
      </div>
    </>
  );
}

export default memo(DungeonRowInner);
