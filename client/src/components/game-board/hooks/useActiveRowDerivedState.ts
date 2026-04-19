import { useMemo } from 'react';
import { useShallowGameState } from '@/hooks/useGameEngine';
import { getColumnsWithCurseMonumentAura } from '@/game-core/buildingAura';

export interface ActiveRowDerivedState {
  monsterTargetingActive: boolean;
  dungeonTargetingActive: boolean;
  playerTargetingActive: boolean;
  showMonsterAttackIndicator: boolean;
  handLockedForMonsterPhase: boolean;
  heroStunned: boolean;
  eventPendingLocked: boolean;
  curseMonumentCols: Set<number>;
}

export function useActiveRowDerivedState(): ActiveRowDerivedState {
  const gs = useShallowGameState(s => ({
    pendingHeroSkillAction: s.pendingHeroSkillAction,
    pendingHeroMagicAction: s.pendingHeroMagicAction,
    pendingMagicAction: s.pendingMagicAction,
    pendingPotionAction: s.pendingPotionAction,
    combatState: s.combatState,
    heroStunned: s.heroStunned,
    eventModalOpen: s.eventModalOpen,
    eventModalMinimized: s.eventModalMinimized,
    currentEventCard: s.currentEventCard,
    activeCards: s.activeCards,
    activeCardStacks: s.activeCardStacks,
  }));

  const heroSkillTargeting = Boolean(gs.pendingHeroSkillAction);
  const heroMagicTargeting = Boolean(gs.pendingHeroMagicAction);
  const magicTargeting = Boolean(gs.pendingMagicAction);
  const potionTargeting = Boolean(gs.pendingPotionAction);

  const playerTargetingActive = heroSkillTargeting || heroMagicTargeting || magicTargeting || potionTargeting;

  const heroSkillMonsterTargeting = gs.pendingHeroSkillAction?.type === 'monster';
  const heroMagicMonsterTargeting = gs.pendingHeroMagicAction?.step === 'monster-select';
  const magicMonsterTargeting = gs.pendingMagicAction?.step === 'monster-select';
  const monsterTargetingActive = heroSkillMonsterTargeting || heroMagicMonsterTargeting || Boolean(magicMonsterTargeting);

  const dungeonTargetingActive = Boolean(gs.pendingMagicAction?.step === 'dungeon-select');

  const handLockedForMonsterPhase = useMemo(
    () =>
      gs.combatState.engagedMonsterIds.length > 0 &&
      (gs.combatState.currentTurn === 'monster' || Boolean(gs.combatState.pendingBlock)),
    [gs.combatState.engagedMonsterIds, gs.combatState.currentTurn, gs.combatState.pendingBlock],
  );

  const showMonsterAttackIndicator = Boolean(
    handLockedForMonsterPhase && gs.combatState.engagedMonsterIds.length > 0,
  );

  const eventPendingLocked = gs.eventModalMinimized && gs.eventModalOpen && !!gs.currentEventCard;

  const curseMonumentCols = useMemo(
    () => getColumnsWithCurseMonumentAura(gs.activeCards, gs.activeCardStacks),
    [gs.activeCards, gs.activeCardStacks],
  );

  return {
    monsterTargetingActive,
    dungeonTargetingActive,
    playerTargetingActive,
    showMonsterAttackIndicator,
    handLockedForMonsterPhase,
    heroStunned: gs.heroStunned,
    eventPendingLocked,
    curseMonumentCols,
  };
}
