/**
 * Hero Domain — pure logic for hero skills, magic, and potions.
 */

import type { GameCardData, HeroMagicId } from '@/components/GameCard';
import type {
  EquipmentSlotId,
  EquipmentSlotBonusState,
  PendingHeroSkillAction,
  PendingHeroMagicAction,
  PendingMagicAction,
  PendingPotionAction,
  ActiveAmuletEffects,
} from '@/components/game-board/types';
import type { HeroMagicState, HeroMagicRuntimeState } from '@/lib/heroMagic';
import type { HeroSkillId, HeroSkillDefinition } from '@/lib/heroSkills';
import type { GameState } from './types';
import { getHeroMagicDefinition } from '@/lib/heroMagic';
import { getHeroSkillById } from '@/lib/heroSkills';

// ---------------------------------------------------------------------------
// Hero magic gauge
// ---------------------------------------------------------------------------

export function updateHeroMagicById(
  magicState: HeroMagicState,
  id: HeroMagicId,
  updater: (current: HeroMagicRuntimeState) => HeroMagicRuntimeState,
): HeroMagicState {
  const current = magicState[id] ?? { id, unlocked: false, gauge: 0, usedThisWave: false };
  const next = updater(current);
  if (
    next.unlocked === current.unlocked &&
    next.gauge === current.gauge &&
    next.usedThisWave === current.usedThisWave
  ) {
    return magicState;
  }
  return { ...magicState, [id]: next };
}

export function addMagicGauge(
  magicState: HeroMagicState,
  id: HeroMagicId,
  amount: number,
): HeroMagicState {
  if (amount <= 0) return magicState;
  const definition = getHeroMagicDefinition(id);
  return updateHeroMagicById(magicState, id, current => {
    if (!current.unlocked) return current;
    const nextGauge = Math.min(definition.gaugeMax, current.gauge + amount);
    if (nextGauge === current.gauge) return current;
    return { ...current, gauge: nextGauge };
  });
}

export function resetMagicGauge(
  magicState: HeroMagicState,
  id: HeroMagicId,
): HeroMagicState {
  return updateHeroMagicById(magicState, id, current => ({
    ...current,
    gauge: 0,
  }));
}

export function unlockMagic(
  magicState: HeroMagicState,
  id: HeroMagicId,
): HeroMagicState {
  return updateHeroMagicById(magicState, id, current =>
    current.unlocked ? current : { ...current, unlocked: true, gauge: 0, usedThisWave: false },
  );
}

export function setMagicUsedThisWave(
  magicState: HeroMagicState,
  id: HeroMagicId,
): HeroMagicState {
  return updateHeroMagicById(magicState, id, current => ({
    ...current,
    usedThisWave: true,
  }));
}

export function resetAllMagicWaveFlags(
  magicState: HeroMagicState,
): HeroMagicState {
  const result = { ...magicState };
  for (const id of Object.keys(result) as HeroMagicId[]) {
    if (result[id].usedThisWave) {
      result[id] = { ...result[id], usedThisWave: false };
    }
  }
  return result;
}

export function isMagicGaugeFull(
  magicState: HeroMagicState,
  id: HeroMagicId,
): boolean {
  const state = magicState[id];
  if (!state?.unlocked) return false;
  const definition = getHeroMagicDefinition(id);
  return state.gauge >= definition.gaugeMax;
}

// ---------------------------------------------------------------------------
// Hero skill helpers
// ---------------------------------------------------------------------------

export function canUseHeroSkill(
  state: GameState,
  overrideSkillId?: HeroSkillId,
): boolean {
  const skillId = overrideSkillId ?? state.selectedHeroSkill;
  if (!skillId) return false;
  const def = getHeroSkillById(skillId as HeroSkillId);
  if (!def || def.type === 'passive') return false;

  if (overrideSkillId) {
    return !state.extraSkillsUsedThisWave.includes(overrideSkillId);
  }
  return !state.heroSkillUsedThisWave;
}

export function markSkillUsedPure(
  state: GameState,
  skillId: HeroSkillId,
): Partial<GameState> {
  if (skillId === state.selectedHeroSkill) {
    return { heroSkillUsedThisWave: true };
  }
  return {
    extraSkillsUsedThisWave: [...state.extraSkillsUsedThisWave, skillId],
  };
}

// ---------------------------------------------------------------------------
// Pending action setters
// ---------------------------------------------------------------------------

export function setPendingSkillAction(
  action: PendingHeroSkillAction | null,
): Partial<GameState> {
  return { pendingHeroSkillAction: action };
}

export function setPendingMagicActionPure(
  action: PendingMagicAction | null,
): Partial<GameState> {
  return { pendingMagicAction: action };
}

export function setPendingPotionActionPure(
  action: PendingPotionAction | null,
): Partial<GameState> {
  return { pendingPotionAction: action };
}

export function setPendingHeroMagicActionPure(
  action: PendingHeroMagicAction | null,
): Partial<GameState> {
  return { pendingHeroMagicAction: action };
}

// ---------------------------------------------------------------------------
// Spell damage computation
// ---------------------------------------------------------------------------

export function getSpellDamage(
  state: GameState,
  baseDamage: number,
  amuletEffects: ActiveAmuletEffects,
): number {
  const total = baseDamage + state.permanentSpellDamageBonus;
  return state.doubleNextMagic ? total * 2 : total;
}

// ---------------------------------------------------------------------------
// Recycle forge counter
// ---------------------------------------------------------------------------

export function tickRecycleForge(
  state: GameState,
  amuletEffects: ActiveAmuletEffects,
): Partial<GameState> | null {
  if (amuletEffects.recycleForgeCount <= 0) return null;
  const newCount = state.recycleForgePlayCount + amuletEffects.recycleForgeCount;
  if (newCount >= 3) {
    return { recycleForgePlayCount: 0 };
  }
  return { recycleForgePlayCount: newCount };
}

// ---------------------------------------------------------------------------
// Berserker rage
// ---------------------------------------------------------------------------

export function activateBerserkerRage(state: GameState): Partial<GameState> {
  return {
    berserkerRageActive: true,
    berserkerSlotUsed: {},
  };
}

export function deactivateBerserkerRage(): Partial<GameState> {
  return {
    berserkerRageActive: false,
    berserkerSlotUsed: {},
  };
}

// ---------------------------------------------------------------------------
// Wave reset (new dungeon wave)
// ---------------------------------------------------------------------------

export function resetHeroWavePure(state: GameState): Partial<GameState> {
  return {
    heroSkillUsedThisWave: false,
    extraSkillsUsedThisWave: [],
    pendingHeroSkillAction: null,
    pendingHeroMagicAction: null,
    heroSkillBanner: null,
    pendingMagicAction: null,
    pendingHandDiscardSelection: null,
    pendingPotionAction: null,
    heroMagicState: resetAllMagicWaveFlags(state.heroMagicState),
    berserkerRageActive: false,
    berserkerSlotUsed: {},
    flashSlotUsed: {},
    gambitExtraActive: false,
    gambitSlotUsed: {},
    unbreakableUntilWaterfall: { equipmentSlot1: false, equipmentSlot2: false },
    slotBattleSpiritBonus: {},
    slotBattleSpiritUsed: {},
  };
}

// ---------------------------------------------------------------------------
// Potion finalization helpers
// ---------------------------------------------------------------------------

export function finalizeMagicCardPure(
  state: GameState,
  card: GameCardData,
): Partial<GameState> {
  // 凡化咒已剥离 Perm — 即使 magicType 仍为 permanent 也按即时处理（进坟场）
  const isPermanent = card.magicType === 'permanent' && !card.permStripped;
  if (isPermanent) {
    const recycled = {
      ...card,
      _recycleWaits: (card.recycleDelay ?? 1) - 1,
      scalingDamage: card.scalingDamage ? card.scalingDamage + 1 : undefined,
    };
    return {
      permanentMagicRecycleBag: [...state.permanentMagicRecycleBag, recycled],
      cardsPlayed: state.cardsPlayed + 1,
    };
  }
  return {
    discardedCards: [...state.discardedCards, card],
    cardsPlayed: state.cardsPlayed + 1,
  };
}

export function finalizePotionCardPure(
  state: GameState,
  card: GameCardData,
): Partial<GameState> {
  if (card.flipTarget) {
    return { cardsPlayed: state.cardsPlayed + 1 };
  }
  return {
    discardedCards: [...state.discardedCards, card],
    cardsPlayed: state.cardsPlayed + 1,
  };
}
