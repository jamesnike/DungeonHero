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
  /**
   * 当前 pendingMagicAction 是否允许 Hero Cell 作为合法目标（单目标伤害 magic 自伤路径）。
   * GameBoard 用此 flag 给 hero-row-hero slot 加高亮 + 点击监听。
   */
  heroSelfTargetingActive: boolean;
  /**
   * 当前 pendingMagicAction 是否允许装备槽里的盾作为合法目标（armor 吃伤 + 溢出走自伤）。
   * 与 heroSelfTargetingActive 共享 allowsHeroTarget 这个底层 flag —— 两条路径都受控于
   * 「单目标伤害 magic 才允许选自己」的规则。
   * 装备槽组件用此 flag 给装有 type='shield' 且 armor>0 的槽位加高亮 + 点击监听。
   */
  shieldSlotTargetingActive: boolean;
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
  const magicMonsterTargeting = gs.pendingMagicAction?.step === 'monster-select';
  const monsterTargetingActive = heroSkillMonsterTargeting || Boolean(magicMonsterTargeting);

  // 单目标伤害 magic 在 setup 阶段会带 allowsHeroTarget: true，UI 用它决定是否高亮
  // Hero Cell 并允许点击触发自伤路径。仅在 monster-select step 下生效。
  const heroSelfTargetingActive = Boolean(
    magicMonsterTargeting
      && (gs.pendingMagicAction as { allowsHeroTarget?: boolean } | null)?.allowsHeroTarget,
  );
  // 同源条件：allowsHeroTarget=true 意味着这张单目标伤害 magic 也可以打装有盾的装备槽。
  // 装备槽组件再额外 gate 槽位本身（type==='shield' && armor>0）。
  const shieldSlotTargetingActive = heroSelfTargetingActive;

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
    heroSelfTargetingActive,
    shieldSlotTargetingActive,
  };
}
