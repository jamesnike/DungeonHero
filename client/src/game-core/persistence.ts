/**
 * Persistence Domain — serialization helpers for game state.
 */

import type { GameCardData } from '@/components/GameCard';
import type { PersistedGameState } from '@/lib/gameStorage';
import type { GameState } from './types';
import { sanitizeCardMetadata, sanitizeCardList, sanitizeSlotRow } from './helpers';
import { sanitizeHeroMagicState } from '@/lib/heroMagic';

// ---------------------------------------------------------------------------
// Serialize GameState → PersistedGameState
// ---------------------------------------------------------------------------

export function serializeGameState(state: GameState): PersistedGameState {
  return {
    version: 1,
    timestamp: Date.now(),
    hp: state.hp,
    gold: state.gold,
    turnCount: state.turnCount,
    monstersDefeated: state.monstersDefeated,
    shopLevel: state.shopLevel,
    cardsPlayed: state.cardsPlayed,
    recycleForgePlayCount: state.recycleForgePlayCount,
    classDamageDiscoverStreak: state.classDamageDiscoverStreak,
    totalDamageTaken: state.totalDamageTaken,
    totalHealed: state.totalHealed,
    healAccumulator: state.healAccumulator,
    previewCards: sanitizeSlotRow(state.previewCards),
    activeCards: sanitizeSlotRow(state.activeCards),
    remainingDeck: sanitizeCardList(state.remainingDeck),
    discardedCards: sanitizeCardList(state.discardedCards),
    handCards: sanitizeCardList(state.handCards),
    equipmentSlot1: state.equipmentSlot1
      ? (sanitizeCardMetadata(state.equipmentSlot1) as GameCardData)
      : null,
    equipmentSlot2: state.equipmentSlot2
      ? (sanitizeCardMetadata(state.equipmentSlot2) as GameCardData)
      : null,
    equipmentSlot1Reserve: sanitizeCardList(state.equipmentSlot1Reserve),
    equipmentSlot2Reserve: sanitizeCardList(state.equipmentSlot2Reserve),
    equipmentSlotCapacity: { ...state.equipmentSlotCapacity },
    maxAmuletSlots: state.maxAmuletSlots,
    amuletSlots: sanitizeCardList(state.amuletSlots),
    backpackItems: sanitizeCardList(state.backpackItems),
    permanentMagicRecycleBag: sanitizeCardList(state.permanentMagicRecycleBag),
    classDeck: sanitizeCardList(state.classDeck),
    classCardsInHand: sanitizeCardList(state.classCardsInHand as GameCardData[]) as any,
    selectedHeroSkill: state.selectedHeroSkill,
    extraHeroSkills: [...state.extraHeroSkills],
    showSkillSelection: state.showSkillSelection,
    heroVariant: state.heroVariant,
    permanentSkills: [...state.permanentSkills],
    equipmentSlotBonuses: {
      equipmentSlot1: { ...state.equipmentSlotBonuses.equipmentSlot1 },
      equipmentSlot2: { ...state.equipmentSlotBonuses.equipmentSlot2 },
    },
    weaponMasterBonus: state.weaponMasterBonus,
    shieldMasterBonus: state.shieldMasterBonus,
    gameOver: state.gameOver,
    victory: state.victory,
    permanentMaxHpBonus: state.permanentMaxHpBonus,
    permanentSpellDamageBonus: state.permanentSpellDamageBonus,
    permanentSpellLifesteal: state.permanentSpellLifesteal,
    backpackCapacityModifier: state.backpackCapacityModifier,
    heroMagicState: sanitizeHeroMagicState(state.heroMagicState),
    turnDamageTaken: state.turnDamageTaken,
    berserkTurnBuff: {
      equipmentSlot1: state.berserkTurnBuff.equipmentSlot1 ?? 0,
      equipmentSlot2: state.berserkTurnBuff.equipmentSlot2 ?? 0,
    },
    extraAttackCharges: state.extraAttackCharges,
    combatState: {
      engagedMonsterIds: state.combatState.engagedMonsterIds,
      initiator: state.combatState.initiator,
      currentTurn: state.combatState.currentTurn,
      heroAttacksThisTurn: { ...state.combatState.heroAttacksThisTurn },
      heroAttacksRemaining: state.combatState.heroAttacksRemaining,
      heroDamageThisTurn: { ...state.combatState.heroDamageThisTurn },
      monsterAttackQueue: [...state.combatState.monsterAttackQueue],
      pendingBlock: state.combatState.pendingBlock ? { ...state.combatState.pendingBlock } : null,
      slotBlocksThisTurn: { ...state.combatState.slotBlocksThisTurn },
    },
    tempShield: state.tempShield,
    nextWeaponBonus: state.nextWeaponBonus,
    nextShieldBonus: state.nextShieldBonus,
    slotAttackBursts: {
      equipmentSlot1: state.slotAttackBursts.equipmentSlot1 ?? 0,
      equipmentSlot2: state.slotAttackBursts.equipmentSlot2 ?? 0,
    },
    nextAttackLifestealSlot: state.nextAttackLifestealSlot,
    vampiricNextAttack: state.vampiricNextAttack,
    unbreakableNext: state.unbreakableNext,
    unbreakableUntilWaterfall: state.unbreakableUntilWaterfall,
    bulwarkPassiveActive: state.bulwarkPassiveActive,
    bulwarkTempArmorStacks: state.bulwarkTempArmorStacks,
    slotTempArmor: { ...state.slotTempArmor },
    slotTempAttack: { ...state.slotTempAttack },
    defensiveStanceActive: state.defensiveStanceActive,
    doubleNextMagic: state.doubleNextMagic,
    berserkerRageActive: state.berserkerRageActive,
    berserkerSlotUsed: state.berserkerSlotUsed,
    flashSlotUsed: state.flashSlotUsed,
    gambitExtraActive: state.gambitExtraActive,
    gambitExtraPerSlot: state.gambitExtraPerSlot,
    gambitSlotUsed: state.gambitSlotUsed,
    weaponExtraAttackUsed: state.weaponExtraAttackUsed,
    heroSkillUsedThisWave: state.heroSkillUsedThisWave,
    extraSkillsUsedThisWave: state.extraSkillsUsedThisWave,
    handLimitBonus: state.handLimitBonus,
    drawPending: state.drawPending,
    waveDiscardCount: state.waveDiscardCount,
    wraithPassiveEnabled: state.wraithPassiveEnabled,
    resolvingDungeonCardId: state.resolvingDungeonCardId,
    currentEventCard: state.currentEventCard,
    eventModalOpen: state.eventModalOpen,
    eventModalMinimized: state.eventModalMinimized,
    stunCap: state.stunCap,
    heroStunned: state.heroStunned,
    cardGainUpgradeProgress: state.cardGainUpgradeProgress,
    recycleBackpackProgress: state.recycleBackpackProgress,
    swapUpgradeProgress: state.swapUpgradeProgress,
    bugletAmuletObtained: state.bugletAmuletObtained,
    persuadeLevel: state.persuadeLevel,
    persuadeCostModifier: state.persuadeCostModifier,
    lastPersuadeTargetId: state.lastPersuadeTargetId,
    previewCardStacks: state.previewCardStacks,
    activeCardStacks: state.activeCardStacks,
    waterfallDealBonus: state.waterfallDealBonus,
  };
}

