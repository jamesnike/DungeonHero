/**
 * Persistence Domain — serialization helpers for game state.
 */

import type { GameCardData, CurseEffectId } from '@/components/GameCard';
import type { PersistedGameState, PersistedShopOffering } from '@/lib/gameStorage';
import type { GameState } from './types';
import { sanitizeCardMetadata, sanitizeCardList, sanitizeSlotRow } from './helpers';
import { sanitizeHeroMagicState } from '@/lib/heroMagic';
import bloodCurseSealImage from '@assets/generated_images/card_curse_blood_seal.png';
import greedCurseImage from '@assets/generated_images/card_curse_greed.png';

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
    classMagicDiscoverStreak: state.classMagicDiscoverStreak,
    mirrorCopySummonStreak: state.mirrorCopySummonStreak,
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
    globalMineDamageBonus: state.globalMineDamageBonus,
    backpackCapacityModifier: state.backpackCapacityModifier,
    heroMagicState: sanitizeHeroMagicState(state.heroMagicState),
    turnDamageTaken: state.turnDamageTaken,
    berserkTurnBuff: {
      equipmentSlot1: state.berserkTurnBuff.equipmentSlot1 ?? 0,
      equipmentSlot2: state.berserkTurnBuff.equipmentSlot2 ?? 0,
    },
    extraAttackCharges: state.extraAttackCharges,
    slotExtraAttacks: { ...(state.slotExtraAttacks ?? { equipmentSlot1: 0, equipmentSlot2: 0 }) },
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
      slotDurabilityUsedThisTurn: { ...state.combatState.slotDurabilityUsedThisTurn },
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
    amuletAuraAppliedThisWave: state.amuletAuraAppliedThisWave,
    defensiveStanceActive: state.defensiveStanceActive,
    doubleNextMagic: state.doubleNextMagic,
    berserkerRageActive: state.berserkerRageActive,
    berserkerSlotUsed: state.berserkerSlotUsed,
    flashSlotUsed: state.flashSlotUsed,
    gambitExtraActive: state.gambitExtraActive,
    gambitExtraPerSlot: state.gambitExtraPerSlot,
    gambitSlotUsed: state.gambitSlotUsed,
    weaponExtraAttackUsed: state.weaponExtraAttackUsed,
    blockDurabilityPerSlot: state.blockDurabilityPerSlot,
    slotBattleSpiritBonus: state.slotBattleSpiritBonus,
    slotBattleSpiritUsed: state.slotBattleSpiritUsed,
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
    monsterKillUpgradeProgress: state.monsterKillUpgradeProgress,
    recycleBackpackProgress: state.recycleBackpackProgress,
    manualRecycleProgress: state.manualRecycleProgress,
    swapUpgradeProgress: state.swapUpgradeProgress,
    flipOverkillLifestealProgress: state.flipOverkillLifestealProgress,
    equipAmuletCapProgress: state.equipAmuletCapProgress,
    stunAttemptDiscoverProgress: state.stunAttemptDiscoverProgress,
    flipDebuffMonsterId: state.flipDebuffMonsterId,
    bugletAmuletObtained: state.bugletAmuletObtained,
    statSwapCardObtained: state.statSwapCardObtained,
    acquiredUniqueClassCardIds: [...(state.acquiredUniqueClassCardIds ?? [])],
    persuadeLevel: state.persuadeLevel,
    persuadeCostModifier: state.persuadeCostModifier,
    lastPersuadeTargetId: state.lastPersuadeTargetId,
    consecutivePersuadeCount: state.consecutivePersuadeCount,
    persuadeSameTargetCostHalve: state.persuadeSameTargetCostHalve,
    persuadeRaceBonus: state.persuadeRaceBonus,
    persuadeSuccessDurabilityBonus: state.persuadeSuccessDurabilityBonus,
    persuadeAmuletBonus: state.persuadeAmuletBonus,
    permanentPersuadeBonus: state.permanentPersuadeBonus,
    persuadeDiscount: state.persuadeDiscount ? { ...state.persuadeDiscount } : null,
    lastPlayedCardCategory: state.lastPlayedCardCategory,
    transformChainPrevCategory: state.transformChainPrevCategory,
    consecutiveTransformStreak: state.consecutiveTransformStreak,
    magicCardsPlayedThisTurn: state.magicCardsPlayedThisTurn,
    damageMagicPlayedThisTurn: state.damageMagicPlayedThisTurn,
    arcaneStormMagicCount: state.arcaneStormMagicCount,
    previewCardStacks: state.previewCardStacks,
    activeCardStacks: state.activeCardStacks,
    previewRevealedEarly: state.previewRevealedEarly,
    waterfallDealBonus: state.waterfallDealBonus,
    eternalRelics: state.eternalRelics.map(r => ({ ...r })),

    // --- Modal states ---
    discoverModalOpen: state.discoverModalOpen,
    discoverModalMinimized: state.discoverModalMinimized,
    discoverOptions: sanitizeCardList(state.discoverOptions),
    discoverSourceLabel: state.discoverSourceLabel,
    graveyardDiscoverMinimized: state.graveyardDiscoverMinimized,
    monsterRewardMinimized: state.monsterRewardMinimized,
    deleteModalOpen: state.deleteModalOpen,
    upgradeModalOpen: state.upgradeModalOpen,
    showCardDraft: state.showCardDraft,
    cardDraftPool: sanitizeCardList(state.cardDraftPool),
    shopModalOpen: state.shopModalOpen,
    shopModalMinimized: state.shopModalMinimized,
    shopOfferings: state.shopOfferings.map(o => ({ card: sanitizeCardMetadata(o.card) as GameCardData, price: o.price, sold: o.sold })),
    shopSourceEvent: state.shopSourceEvent,
    shopDeleteUsed: state.shopDeleteUsed,
    shopHealUsed: state.shopHealUsed,
    shopLevelUpUsed: state.shopLevelUpUsed,
    shopSkillDiscoverUsed: state.shopSkillDiscoverUsed,
    shopEquipAttackUsed: state.shopEquipAttackUsed,
    shopEquipArmorUsed: state.shopEquipArmorUsed,
    shopRefreshUsed: state.shopRefreshUsed,
    shopSkillOptions: state.shopSkillOptions,
    shopSkillSelectOpen: state.shopSkillSelectOpen,
    monsterRewardQueue: state.monsterRewardQueue as any,
    activeMonsterReward: state.activeMonsterReward as any,
    selectedMonsterRewards: state.selectedMonsterRewards as any,
    graveyardDiscoverState: state.graveyardDiscoverState ? sanitizeCardList(state.graveyardDiscoverState) : null,
    graveyardDiscoverDelivery: state.graveyardDiscoverDelivery,
    ghostBladeExileCards: state.ghostBladeExileCards ? sanitizeCardList(state.ghostBladeExileCards) : null,
    handMagicUpgradeModal: state.handMagicUpgradeModal,
    mirrorCopyModal: state.mirrorCopyModal,
    monsterFusionModal: state.monsterFusionModal,
    permGrantModal: state.permGrantModal,
    amplifyModal: state.amplifyModal,
    eventAmplifyHandPicker: state.eventAmplifyHandPicker,
    equipmentPrompt: state.equipmentPrompt,
    persuadeState: state.persuadeState as any,
    magicChoiceModal: state.magicChoiceModal as any,
    eventDiceModal: state.eventDiceModal as any,
    deathWardNotice: state.deathWardNotice,
    rng: state.rng ? { seed: state.rng.seed, state: state.rng.state } : undefined,
    amplifiedCardBonus: { ...state.amplifiedCardBonus },
    // 持久化是为了：刷新页面后撤销跨刷新点时，旧 cache 仍可命中、奖励不变。
    // 见 PersistedGameState.monsterRewardPreviewCache 的 JSDoc。
    monsterRewardPreviewCache: { ...state.monsterRewardPreviewCache },
    // 60s hero turn 倒计时起始时间戳。null 表示当前不在 hero combat turn。
    // 刷新页面后由 hydrateGameState 还原，让 HeroTurnTimer 继续从 wall-clock
    // 计算剩余时间——超时仍会自动结束玩家回合。
    playerTurnStartedAt: state.playerTurnStartedAt ?? null,
    // -----------------------------------------------------------------------
    // Multiplayer (phase 6)
    // -----------------------------------------------------------------------
    // multiplayerSession is the only "I am in a 2-player room" marker on
    // disk. On hydrate, GameBoard reads it and (a) re-attaches the
    // Realtime channel and (b) calls /api/mp/resume to backfill any
    // peer transfers that arrived while we were offline.
    multiplayerSession: state.multiplayerSession
      ? { ...state.multiplayerSession }
      : null,
    // pendingTransferOut + companion delta MUST be persisted so a tab
    // refresh during the POST in-flight window doesn't silently drop the
    // staged cards. On hydrate, useMultiplayerSync re-POSTs this batch.
    pendingTransferOut: state.pendingTransferOut
      ? state.pendingTransferOut.map(c => ({ ...c }))
      : null,
    pendingTransferOutSharedConsumed: state.pendingTransferOutSharedConsumed ?? null,
    sharedDeckConsumed: state.sharedDeckConsumed ?? 0,
    bossEncounterAlertShown: Boolean(state.bossEncounterAlertShown),
  };
}

// ---------------------------------------------------------------------------
// Legacy curse migration
// ---------------------------------------------------------------------------
//
// Curse cards historically lived as `type: 'magic'` with `isCurse: true` and
// `magicType: 'permanent'`. They are now their own `type: 'curse'` with a
// dedicated `curseEffect` discriminator and new artwork. Saved games from
// before the refactor contain the legacy shape; rewrite those entries on
// load so the engine treats them correctly going forward.

interface LegacyCurseCard extends GameCardData {
  isCurse?: boolean;
  knightEffect?: string;
}

const isLegacyCurseCard = (card: GameCardData | null | undefined): card is LegacyCurseCard => {
  if (!card) return false;
  if (card.type === 'curse') return false;
  const legacy = card as LegacyCurseCard;
  if (legacy.isCurse === true) return true;
  if (card.name === '血咒之印' || card.name === '贪婪诅咒') return true;
  return false;
};

const inferCurseEffect = (card: LegacyCurseCard): CurseEffectId => {
  if (card.knightEffect === 'greed-curse' || card.name === '贪婪诅咒') {
    return 'greed-curse';
  }
  return 'blood-curse';
};

const migrateCurseCard = (card: GameCardData): GameCardData => {
  if (!isLegacyCurseCard(card)) return card;
  const curseEffect = inferCurseEffect(card);
  const isGreed = curseEffect === 'greed-curse';
  const migrated: GameCardData = {
    ...card,
    type: 'curse',
    name: isGreed ? '贪婪诅咒' : '血咒之印',
    image: isGreed ? greedCurseImage : bloodCurseSealImage,
    description: isGreed
      ? '诅咒：使用时失去 3 金币，使用后回到背包；无法被回收或弃置。'
      : '诅咒：使用时失去 3 点生命，使用后回到背包；无法被回收或弃置。',
    curseEffect,
  };
  delete (migrated as LegacyCurseCard).isCurse;
  delete migrated.magicType;
  delete migrated.magicEffect;
  delete (migrated as LegacyCurseCard).knightEffect;
  return migrated;
};

const migrateCardList = (
  list: ReadonlyArray<GameCardData | null> | null | undefined,
): GameCardData[] | null | undefined => {
  if (list == null) return list as null | undefined;
  return list.map(c => (c ? migrateCurseCard(c) : c)) as GameCardData[];
};

const migrateSlotRow = (
  row: ReadonlyArray<GameCardData | null> | null | undefined,
): Array<GameCardData | null> | null | undefined => {
  if (row == null) return row as null | undefined;
  return row.map(c => (c ? migrateCurseCard(c) : c));
};

const migrateShopOfferings = (
  offerings: PersistedShopOffering[] | null | undefined,
): PersistedShopOffering[] | null | undefined => {
  if (offerings == null) return offerings;
  return offerings.map(o => ({ ...o, card: migrateCurseCard(o.card) }));
};

/**
 * Migrate legacy curse data in a persisted snapshot. Rewrites every card list
 * to the new `type: 'curse'` shape and relocates curses found in graveyard /
 * permanent magic recycle bag back into the backpack (their new resting
 * place after use).
 */
export function migratePersistedState(
  snapshot: PersistedGameState,
): PersistedGameState {
  const migrated: PersistedGameState = {
    ...snapshot,
    previewCards: migrateSlotRow(snapshot.previewCards) as PersistedGameState['previewCards'],
    activeCards: migrateSlotRow(snapshot.activeCards) as PersistedGameState['activeCards'],
    remainingDeck: migrateCardList(snapshot.remainingDeck) as PersistedGameState['remainingDeck'],
    discardedCards: migrateCardList(snapshot.discardedCards) as PersistedGameState['discardedCards'],
    handCards: migrateCardList(snapshot.handCards) as PersistedGameState['handCards'],
    equipmentSlot1: snapshot.equipmentSlot1 ? migrateCurseCard(snapshot.equipmentSlot1) : snapshot.equipmentSlot1,
    equipmentSlot2: snapshot.equipmentSlot2 ? migrateCurseCard(snapshot.equipmentSlot2) : snapshot.equipmentSlot2,
    equipmentSlot1Reserve: migrateCardList(snapshot.equipmentSlot1Reserve) as PersistedGameState['equipmentSlot1Reserve'],
    equipmentSlot2Reserve: migrateCardList(snapshot.equipmentSlot2Reserve) as PersistedGameState['equipmentSlot2Reserve'],
    amuletSlots: migrateCardList(snapshot.amuletSlots) as PersistedGameState['amuletSlots'],
    backpackItems: migrateCardList(snapshot.backpackItems) as PersistedGameState['backpackItems'],
    permanentMagicRecycleBag: migrateCardList(snapshot.permanentMagicRecycleBag) as PersistedGameState['permanentMagicRecycleBag'],
    classDeck: migrateCardList(snapshot.classDeck) as PersistedGameState['classDeck'],
    classCardsInHand: migrateCardList(snapshot.classCardsInHand as GameCardData[]) as PersistedGameState['classCardsInHand'],
    discoverOptions: migrateCardList(snapshot.discoverOptions) as PersistedGameState['discoverOptions'],
    cardDraftPool: migrateCardList(snapshot.cardDraftPool) as PersistedGameState['cardDraftPool'],
    shopOfferings: migrateShopOfferings(snapshot.shopOfferings) as PersistedGameState['shopOfferings'],
    graveyardDiscoverState: migrateCardList(snapshot.graveyardDiscoverState) as PersistedGameState['graveyardDiscoverState'],
    ghostBladeExileCards: migrateCardList(snapshot.ghostBladeExileCards) as PersistedGameState['ghostBladeExileCards'],
  };

  // Curses are no longer allowed to live in graveyard or permanent recycle bag.
  // Move any that were stranded there back into the backpack.
  const stranded: GameCardData[] = [];
  const stripCurses = (
    list: ReadonlyArray<GameCardData> | null | undefined,
  ): GameCardData[] | null | undefined => {
    if (list == null) return list;
    const kept: GameCardData[] = [];
    for (const card of list) {
      if (card && card.type === 'curse') {
        stranded.push(card);
      } else if (card) {
        kept.push(card);
      }
    }
    return kept;
  };
  migrated.discardedCards = stripCurses(migrated.discardedCards) as PersistedGameState['discardedCards'];
  migrated.permanentMagicRecycleBag = stripCurses(migrated.permanentMagicRecycleBag) as PersistedGameState['permanentMagicRecycleBag'];

  if (stranded.length > 0) {
    const backpack = (migrated.backpackItems ?? []) as GameCardData[];
    migrated.backpackItems = [...backpack, ...stranded];
  }

  return migrated;
}

