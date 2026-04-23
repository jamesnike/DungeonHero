import React, { useCallback } from 'react';
import { useGameEngine, useShallowGameState, useDispatch, useGameEvent } from '@/hooks/useGameEngine';
import type { GameCardData, EventDiceRange, HeroMagicId } from '@/components/GameCard';
import type { LogEntryType } from '@/components/GameLogPanel';
import type {
  ActiveAmuletEffects,
  ActiveRowSlots,
  BlockTarget,
  CardActionKeyword,
  CombatInitiator,
  CombatState,
  DeathWardPromptState,
  EquipmentItem,
  EquipmentSlotBonusState,
  EquipmentSlotId,
  FlightSourceHint,
  MonsterRewardDrop,
  SlotPermanentBonus,
  SlotTempArmorState,
} from '@/components/game-board/types';
import type { HeroSkillId } from '@/lib/heroSkills';
import {
  INITIAL_HP,
  initialCombatState,
  createEmptyAmuletEffects,
} from '@/game-core/constants';
import {
  normalizeHeroEquipmentSlotFromDrag,
} from '@/game-core/helpers';
import { damageMonsterWithLayerOverflow } from '@/game-core/combat';

// ---------------------------------------------------------------------------
// UI-only animation constants (mirrored from GameBoard.tsx)
// ---------------------------------------------------------------------------
const COMBAT_BLOCK_TO_REFLECT_MS = 220;
// Keep in sync with GameBoard.tsx DEFEAT_ANIMATION_DURATION
// and the dh-card-death keyframe duration in client/src/index.css.
// 1400ms covers the Lottie explosion (~1.5s clipped) + the card grayscale/shrink/fade,
// and gates the monster reward modal until the animation finishes.
const DEFEAT_ANIMATION_DURATION = 1400;
// Defer the dagger self-destruct prompt until the swing/bleed/durability animations
// finish so the player can see the attack resolve before deciding whether to self-destruct.
// Mirrors COMBAT_ANIMATION_DURATION in useCombatAnimationTriggers.ts (1200ms).
const DAGGER_PROMPT_POST_ATTACK_DELAY_MS = 1200;

// ---------------------------------------------------------------------------
// Deps: external dependencies injected by GameBoard
// ---------------------------------------------------------------------------

export interface CombatActionsDeps {
  // --- Functions from useCardOperations (Layer 0) ---
  addToGraveyard: (card: GameCardData) => void;
  discardCardToGraveyard: (
    card: GameCardData | null | undefined,
    options?: { owner?: 'player' | 'dungeon'; forceGraveyard?: boolean; forceRecycleBag?: boolean },
  ) => void;
  disposeOwnedEquipmentCard: (card: GameCardData, options?: { isDestruction?: boolean; triggerLastWords?: boolean; fromSlotId?: EquipmentSlotId }) => void;
  addCardToBackpack: (
    card: GameCardData,
    options?: { toBottom?: boolean; pendingDungeonCardId?: string },
  ) => void;
  drawFromBackpackToHand: () => void;
  drawFromRecycleBagToHand: (count: number) => void;
  queueCardIntoHand: (card: GameCardData, sourceHint?: FlightSourceHint) => void;
  drawClassCardsToBackpack: (count: number, source: string, opts?: { excludeIds?: string[]; includeIds?: string[]; filter?: 'hero-magic' | 'weapon' | 'shield' | 'equipment' }) => void;
  triggerClassDeckFlight: (cards: GameCardData[]) => void;
  getEquipmentSlots: () => { id: EquipmentSlotId; item: EquipmentItem | null }[];
  calculateSlotArmorValue: (slotId: EquipmentSlotId) => number;
  setEquipmentSlotBonus: (
    slotId: EquipmentSlotId,
    bonusType: keyof SlotPermanentBonus,
    value: number | ((current: number) => number),
  ) => void;
  getEquipmentSlotBonus: (slotId: EquipmentSlotId, bonusType: keyof SlotPermanentBonus) => number;
  setEquipmentSlotById: (id: EquipmentSlotId, item: EquipmentItem | null) => void;
  clearEquipmentSlotWithPromote: (id: EquipmentSlotId) => void;
  isRecyclableFromHand: (card: GameCardData | null | undefined) => boolean;
  triggerEventTransform: (fromCard: GameCardData, toCard: GameCardData, message?: string) => Promise<void>;
  amuletEffects: ActiveAmuletEffects;
  attackBonus: number;
  defenseBonus: number;

  // --- Animation / UI callbacks from GameBoard ---
  addGameLog: (type: LogEntryType, message: string) => void;
  triggerHeroBleedAnimation: () => void;
  triggerMonsterBleedAnimation: (monsterId: string, delay?: number) => void;
  triggerMonsterHealAnimation: (monsterId: string, delay?: number) => void;
  triggerWeaponSwingAnimation: (slotId: EquipmentSlotId, delay?: number, opts?: { echoes?: number }) => void;
  triggerShieldBlockAnimation: (slotId: EquipmentSlotId) => void;
  tryStartShieldReflectDirectedFx: (slotId: EquipmentSlotId, monsterId: string) => void;
  tryStartBossRetaliationDirectedFx: (monsterId: string) => void;
  tryStartGolemLayerReflectFx: (monsterId: string) => void;
  tryStartArcaneBladeSpellFx: (slotId: EquipmentSlotId, monsterId: string) => void;
  tryStartDragonBreathFx: (monsterId: string, targetSlotId: EquipmentSlotId | 'hero') => void;
  tryStartMissileStormFx: (monsterId: string) => void;
  animSpeed: (ms: number) => number;

  // --- Async helpers ---
  requestDiceOutcome: (config: {
    title: string;
    subtitle?: string;
    entries: EventDiceRange[];
    flowContext?: Record<string, unknown>;
    predeterminedRoll?: number;
  }) => Promise<EventDiceRange | null>;
  addHeroMagicGauge: (id: HeroMagicId, amount: number) => void;
  triggerGhostBladeExile: () => Promise<void>;
  requestCardAction: (
    keyword: CardActionKeyword,
    count: number,
    options?: { title?: string; description?: string; handOnly?: boolean; moveToDestination?: 'recycle-bag' | 'graveyard' },
  ) => Promise<boolean>;
  requestCardActionBatch: (
    keyword: CardActionKeyword,
    maxCount: number,
    options?: { title?: string; description?: string; handOnly?: boolean; moveToDestination?: 'recycle-bag' | 'graveyard' },
  ) => Promise<number>;
  queueMonsterReward: (monster: GameCardData) => boolean;
  removeCard: (cardId: string, animate: boolean) => void;
  markDungeonCardPendingUse: (cardId: string) => void;
  pushUndoSnapshot: () => void;
  clearUndoStack: () => void;
  clearUndoStorage: () => void;
  isMonsterEngaged: (monsterId: string) => boolean;
  findDeathWardCard: () => { card: GameCardData; source: 'hand' | 'backpack' } | null;
  consumeCardFromHand: (card: GameCardData) => void;
  consumeClassCardFromHand: (cardId: string) => void;
  finalizeMagicCard: (card: GameCardData, opts?: { banner?: string; dealtDamage?: boolean }) => void;
  triggerDiscardFlight: (
    card: GameCardData,
    destination: 'graveyard' | 'recycle-bag',
    sourceHint?: FlightSourceHint,
  ) => Promise<void>;
  triggerStealCardFlight: (card: GameCardData, targetMonsterId: string) => Promise<void>;
  triggerGraveyardStackFlight: (targetCellIndex: number, cards: GameCardData[]) => void;
  dragonBleedDestroyEquipment: (monsterName: string, remainingLayers: number) => void;
  beginDiscoverFlow: (source: string, options?: { filter?: (card: GameCardData) => boolean; overridePool?: GameCardData[]; sourceLabel?: string; delivery?: 'backpack' | 'hand-first' }) => boolean;
  requestDaggerSelfDestruct: (weaponName: string, remainingDurability: number) => Promise<boolean>;
  discoverPotionCompletionRef: React.MutableRefObject<((payload: { banner: string }) => void) | null>;

  // --- Refs ---
  combatAsyncEpochRef: React.MutableRefObject<number>;
  pendingDefeatIdsRef: React.MutableRefObject<Set<string>>;
  pendingDungeonUseRef: React.MutableRefObject<Set<string>>;
  goblinStolenIdsRef: React.MutableRefObject<Set<string>>;
  heroTurnLayerLossIdsRef: React.MutableRefObject<Set<string>>;
  heroTookDamageThisMonsterTurnRef: React.MutableRefObject<boolean>;
  monsterBleedTimeoutsRef: React.MutableRefObject<Record<string, ReturnType<typeof setTimeout>[]>>;
  activeCardsLatestRef: React.MutableRefObject<ActiveRowSlots>;
  fullBoardInteractionLockedRef: React.MutableRefObject<boolean>;
  handLockedForMonsterPhaseRef: React.MutableRefObject<boolean>;
  heroStunnedRef: React.MutableRefObject<boolean>;
  suppressDeathWardRef: React.MutableRefObject<boolean>;
  selectedHeroSkillRef: React.MutableRefObject<string | null>;
  eternalRelicsRef: React.MutableRefObject<import('@/game-core/types').EternalRelic[]>;
  handCardsRef: React.MutableRefObject<GameCardData[]>;
  endHeroTurnGuardRef: React.MutableRefObject<boolean>;
  beginCombatRef: React.MutableRefObject<(monster: GameCardData, initiator: CombatInitiator) => void>;
  bulwarkTempArmorRef: React.MutableRefObject<number>;
  computePersuadeSuccessRate: (monster: GameCardData) => number;
  setPersuadeTempDiscount: React.Dispatch<React.SetStateAction<number>>;

  // --- Local React state setters (not engine state) ---
  setMonsterDefeatStates: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setMonsterBleedStates: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setHealing: React.Dispatch<React.SetStateAction<boolean>>;
  setTakingDamage: React.Dispatch<React.SetStateAction<boolean>>;

  // --- Local React state values ---
  selectedCard: GameCardData | null;

  // --- Pending action state from GameBoard (for handleMonsterTargetSelection) ---
  handleMagicMonsterSelection: (monster: GameCardData) => void;
  handleHolyLightMonsterCleanse: (monster: GameCardData) => boolean;
  handleHeroSkillMonsterSelection: (monster: GameCardData) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCombatActions(depsRef: React.MutableRefObject<CombatActionsDeps>) {
  const engine = useGameEngine();
  const dispatch = useDispatch();
  const {
    permanentMaxHpBonus,
    permanentSkills,
    selectedHeroSkill,
    deathWardPrompt,
    pendingHeroSkillAction,
    pendingHeroMagicAction,
    pendingMagicAction,
  } = useShallowGameState(s => ({
    permanentMaxHpBonus: s.permanentMaxHpBonus,
    permanentSkills: s.permanentSkills,
    selectedHeroSkill: s.selectedHeroSkill,
    deathWardPrompt: s.deathWardPrompt,
    pendingHeroSkillAction: s.pendingHeroSkillAction,
    pendingHeroMagicAction: s.pendingHeroMagicAction,
    pendingMagicAction: s.pendingMagicAction,
  }));

  const shieldRefillPendingRef = React.useRef<Map<string, string>>(new Map());

  // Track in-flight waterfall so we can defer the dagger self-destruct prompt
  // (which would otherwise pop up in the middle of the waterfall animation
  // when the same attack both kills the row's last monster and triggers the cascade).
  const waterfallInProgressRef = React.useRef<boolean>(false);
  const waterfallCompletionResolversRef = React.useRef<Array<() => void>>([]);

  // -- State patch helper ------------------------------------------------------

  type GS = import('@/game-core/types').GameState;

  // ---------------------------------------------------------------------------
  // useGameEvent listeners — UI reactions to reducer side effects
  // ---------------------------------------------------------------------------

  useGameEvent('combat:monsterBleed', ({ monsterId, delay }) => {
    depsRef.current.triggerMonsterBleedAnimation(monsterId, delay);
  });

  useGameEvent('combat:monsterDefeated', ({ monsterId }) => {
    const d = depsRef.current;
    if (d.pendingDefeatIdsRef.current.has(monsterId)) return;
    d.pendingDefeatIdsRef.current.add(monsterId);
    const pendingTimeouts = d.monsterBleedTimeoutsRef.current[monsterId];
    if (pendingTimeouts?.length) {
      pendingTimeouts.forEach(timeout => clearTimeout(timeout));
      delete d.monsterBleedTimeoutsRef.current[monsterId];
    }
    d.setMonsterBleedStates(prev => {
      if (!prev[monsterId]) return prev;
      const next = { ...prev };
      delete next[monsterId];
      return next;
    });
    d.setMonsterDefeatStates(prev => ({ ...prev, [monsterId]: true }));
    const st = engine.getState();
    const stillOnBoard = st.activeCards.some(c => c?.id === monsterId);
    if (!stillOnBoard) {
      d.removeCard(monsterId, false);
    } else {
      d.markDungeonCardPendingUse(monsterId);
    }

    const pendingSlotId = shieldRefillPendingRef.current.get(monsterId);
    if (pendingSlotId) {
      shieldRefillPendingRef.current.delete(monsterId);
      dispatch({ type: 'MODIFY_EQUIPMENT_DURABILITY', slotId: pendingSlotId as EquipmentSlotId, delta: 1 });
    }

    setTimeout(() => {
      d.pendingDefeatIdsRef.current.delete(monsterId);
      d.goblinStolenIdsRef.current.delete(monsterId);
      d.setMonsterDefeatStates(prev => {
        const next = { ...prev };
        delete next[monsterId];
        return next;
      });
      // Atomic mirror: the engine-side gate flag added to keep the reward
      // modal from flashing must be cleared once the visual animation is
      // done, otherwise the modal would stay hidden forever.
      dispatch({ type: 'END_MONSTER_DEFEAT_ANIMATION', monsterId });
      // Safety net: ensure the monster id is never left in pendingDungeonUseRef
      // after the defeat animation finishes. The normal "claim reward" path
      // clears it via removePendingDungeonCard, and revive paths put the
      // monster back on the board — but if any other path (goblin steal +
      // stack-pop, exotic last-words flow, etc.) leaves the id behind, the
      // slot's `isResolvingCard` would stay true and apply
      // `pointer-events-none` to whatever card now occupies that slot
      // (e.g. the stolen card popped up from the goblin's stack).
      d.pendingDungeonUseRef.current.delete(monsterId);
    }, d.animSpeed(DEFEAT_ANIMATION_DURATION));
  });

  useGameEvent('combat:bossTransform', ({ originalMonster, bossCard }) => {
    depsRef.current.triggerEventTransform(originalMonster as GameCardData, bossCard as GameCardData, 'Boss 降临！');
  });

  useGameEvent('combat:lastWordsDiscard', ({ cards }) => {
    const d = depsRef.current;
    (cards as GameCardData[]).forEach(card => {
      d.triggerDiscardFlight(card, d.isRecyclableFromHand(card) ? 'recycle-bag' : 'graveyard');
    });
  });

  useGameEvent('combat:boneRegenCheck', ({ monsterId, monsterName, layersBefore, layersAfter, forced, predeterminedRoll }) => {
    if (!forced && (layersAfter <= 0 || layersAfter >= layersBefore)) return;
    depsRef.current.requestDiceOutcome({
      title: monsterName,
      subtitle: '骸生',
      entries: [
        { id: 'restore', range: [1, 8] as [number, number], label: '恢复 1 层血层', effect: 'none' },
        { id: 'fail', range: [9, 20] as [number, number], label: '再生失败', effect: 'none' },
      ],
      flowContext: { flowId: 'skeleton-restore', monsterId, monsterName },
      predeterminedRoll,
    } as any);
  });

  useGameEvent('combat:wraithRebirthCheck', ({ monsterId, monsterName, maxLayers, layersBefore, layersAfter, predeterminedRoll }) => {
    if (layersAfter !== 1 || layersBefore <= 1) return;
    depsRef.current.requestDiceOutcome({
      title: monsterName,
      subtitle: '重生',
      entries: [
        { id: 'rebirth', range: [1, 6] as [number, number], label: '血层全部回满！', effect: 'none' },
        { id: 'fail', range: [7, 20] as [number, number], label: '重生失败', effect: 'none' },
      ],
      flowContext: { flowId: 'wraith-rebirth', monsterId, monsterName, monsterFury: maxLayers },
      predeterminedRoll,
    } as any);
  });

  useGameEvent('combat:goblinStealCheck', ({ monsterId, monsterName, stackCount, threshold, predeterminedRoll, stolenItemName }) => {
    // Threshold can hit the 20-cap when stackCount >= 7 — clamp the entry
    // ranges so the dice modal never shows an empty "失败" segment.
    const successCap = Math.min(20, Math.max(0, threshold));
    const successPct = successCap * 5;
    const subtitle = stolenItemName
      ? `窃宝判定（${successPct}%）：欲偷「${stolenItemName}」`
      : `窃宝判定（${successPct}%）`;
    const entries: Array<{ id: string; range: [number, number]; label: string; effect: 'none' }> = [];
    if (successCap >= 1) {
      entries.push({
        id: 'steal',
        range: [1, successCap],
        label: stolenItemName ? `偷走「${stolenItemName}」！` : '窃宝成功！',
        effect: 'none',
      });
    }
    if (successCap < 20) {
      entries.push({
        id: 'fail',
        range: [Math.max(1, successCap + 1), 20],
        label: '窃宝失败',
        effect: 'none',
      });
    }
    depsRef.current.requestDiceOutcome({
      title: monsterName,
      subtitle,
      entries,
      flowContext: { flowId: 'goblin-steal', monsterId, monsterName, stackCount },
      predeterminedRoll,
    } as any);
  });

  useGameEvent('combat:goblinHealCheck', ({ monsterId, monsterName, stackCount, threshold, predeterminedRoll, currentLayer, maxLayers }) => {
    const successCap = Math.min(20, Math.max(0, threshold));
    const successPct = successCap * 5;
    const subtitle = `疗养判定（${successPct}%）：${currentLayer}/${maxLayers} 血层`;
    const entries: Array<{ id: string; range: [number, number]; label: string; effect: 'none' }> = [];
    if (successCap >= 1) {
      entries.push({
        id: 'heal',
        range: [1, successCap],
        label: '恢复 1 血层！',
        effect: 'none',
      });
    }
    if (successCap < 20) {
      entries.push({
        id: 'fail',
        range: [Math.max(1, successCap + 1), 20],
        label: '疗养失败',
        effect: 'none',
      });
    }
    depsRef.current.requestDiceOutcome({
      title: monsterName,
      subtitle,
      entries,
      flowContext: { flowId: 'goblin-heal', monsterId, monsterName, stackCount },
      predeterminedRoll,
    } as any);
  });

  useGameEvent('combat:dragonBleedDestroy', ({ monsterName, layersRemaining }) => {
    depsRef.current.dragonBleedDestroyEquipment(monsterName, layersRemaining);
  });

  useGameEvent('combat:buildingDestroyed', ({ buildingId }) => {
    depsRef.current.removeCard(buildingId, true);
  });

  useGameEvent('combat:golemReflect', ({ monsterId, hitSlotId }) => {
    depsRef.current.tryStartGolemLayerReflectFx(monsterId);
    // When a shield slot absorbed the hit, the hero did not actually bleed;
    // skipping the bleed animation avoids misleading red-flash feedback.
    if (hitSlotId == null) {
      depsRef.current.triggerHeroBleedAnimation();
    }
  });

  useGameEvent('combat:classDamageDiscoverTriggered', ({ threshold }) => {
    const st = engine.getState();
    const discoverAmulet = (st.amuletSlots as GameCardData[]).find(s => s?.amuletEffect === 'damage-class-discover');
    const amuletName = discoverAmulet?.name ?? '战痕之符';
    const started = depsRef.current.beginDiscoverFlow('damage-class-discover', { sourceLabel: amuletName });
    if (started) {
      depsRef.current.addGameLog('amulet', `${amuletName}：累计 ${threshold} 次造成伤害，发现专属牌！`);
    } else {
      depsRef.current.addGameLog('amulet', `${amuletName}：累计 ${threshold} 次造成伤害，但职业牌堆已空。`);
    }
    updateDamageDiscoverCounter(0, threshold);
  });

  useGameEvent('combat:classMagicDiscoverTriggered', ({ threshold }) => {
    const st = engine.getState();
    const discoverAmulet = (st.amuletSlots as GameCardData[]).find(s => s?.amuletEffect === 'magic-class-discover');
    const amuletName = discoverAmulet?.name ?? '咒纹刻印';
    const started = depsRef.current.beginDiscoverFlow('magic-class-discover', { sourceLabel: amuletName });
    if (started) {
      depsRef.current.addGameLog('amulet', `${amuletName}：累计 ${threshold} 张 magic 牌，发现专属牌！`);
    } else {
      depsRef.current.addGameLog('amulet', `${amuletName}：累计 ${threshold} 张 magic 牌，但职业牌堆已空。`);
    }
    updateMagicDiscoverCounter(0, threshold);
  });

  useGameEvent('combat:stunAttemptDiscoverTriggered', ({ threshold }) => {
    const st = engine.getState();
    const discoverAmulet = (st.amuletSlots as GameCardData[]).find(s => s?.amuletEffect === 'stun-attempt-discover');
    const amuletName = discoverAmulet?.name ?? '眩学之符';
    const started = depsRef.current.beginDiscoverFlow('stun-attempt-discover', { sourceLabel: amuletName });
    if (started) {
      depsRef.current.addGameLog('amulet', `${amuletName}：累计 ${threshold} 次击晕判定，发现专属牌！`);
    } else {
      depsRef.current.addGameLog('amulet', `${amuletName}：累计 ${threshold} 次击晕判定，但职业牌堆已空。`);
    }
  });

  useGameEvent('combat:heroTurnLayerLoss', ({ monsterId }) => {
    depsRef.current.heroTurnLayerLossIdsRef.current.add(monsterId);
  });

  useGameEvent('combat:removeAndGraveyard', ({ monsterId, monster }) => {
    const { fromSlot: _fs, ...forGy } = monster as GameCardData & { fromSlot?: string };
    depsRef.current.addToGraveyard(forGy);
    depsRef.current.removeCard(monsterId, false);
  });

  useGameEvent('combat:addToGraveyard', ({ card }) => {
    depsRef.current.addToGraveyard(card as GameCardData);
  });

  useGameEvent('combat:dragonBreathFx', ({ monsterId, targetSlotId }) => {
    depsRef.current.tryStartDragonBreathFx(monsterId, targetSlotId as EquipmentSlotId | 'hero');
  });

  useGameEvent('combat:goblinTrickCard', ({ monster, card }) => {
    depsRef.current.triggerEventTransform(monster as GameCardData, card as GameCardData, '哥布林的秘密！');
  });

  useGameEvent('combat:bugletAmuletDrop', ({ monster, card }) => {
    depsRef.current.triggerEventTransform(monster as GameCardData, card as GameCardData, '虫蜕之冠！');
  });

  useGameEvent('combat:graveyardSummon', ({ slots, cards }) => {
    const cardArr = cards as GameCardData[];
    for (let i = 0; i < slots.length; i++) {
      if (cardArr[i]) {
        depsRef.current.triggerGraveyardStackFlight(slots[i], [cardArr[i]]);
      }
    }
  });

  useGameEvent('combat:addMagicGauge', ({ gaugeType, amount }) => {
    depsRef.current.addHeroMagicGauge(gaugeType as HeroMagicId, amount);
  });

  useGameEvent('combat:persuadeDiscountUpdate', ({ newReduction }) => {
    depsRef.current.setPersuadeTempDiscount(newReduction);
  });

  useGameEvent('combat:autoEngage', ({ monsterId }) => {
    const st = engine.getState();
    const monster = st.activeCards.find(c => c?.id === monsterId) as GameCardData | undefined;
    if (monster && !depsRef.current.isMonsterEngaged(monsterId)) {
      beginCombat(monster, 'hero');
    }
  });

  useGameEvent('combat:checkShieldRefillOnMonsterDeath', ({ slotId, monsterId }) => {
    shieldRefillPendingRef.current.set(monsterId, slotId);
  });

  useGameEvent('combat:goblinStealCard', ({ monsterId, card }) => {
    depsRef.current.goblinStolenIdsRef.current.add(monsterId);
    void depsRef.current.triggerStealCardFlight(card as GameCardData, monsterId);
  });

  useGameEvent('combat:postAttackHandRecycle', async ({ itemName }) => {
    const d = depsRef.current;
    const hand = engine.getState().handCards as GameCardData[];
    const recyclable = hand.filter(c => d.isRecyclableFromHand(c));
    if (recyclable.length === 0) return;
    const ok = await d.requestCardAction('discard-recycle', 1, {
      title: itemName,
      description: '选择一张手牌放入回收袋，然后抽一张牌',
      moveToDestination: 'recycle-bag',
    });
    if (ok) {
      d.drawFromBackpackToHand();
    }
  });

  useGameEvent('combat:combatEnded', () => {
    shieldRefillPendingRef.current.clear();
  });

  // --- Combat animation event listeners (reducer-emitted, drive visual feedback) ---

  useGameEvent('combat:weaponSwing', ({ slotId, delay, echoes }) => {
    depsRef.current.triggerWeaponSwingAnimation(
      slotId as EquipmentSlotId,
      delay ?? 0,
      echoes ? { echoes } : undefined,
    );
  });

  useGameEvent('combat:shieldBlock', ({ slotId }) => {
    depsRef.current.triggerShieldBlockAnimation(slotId as EquipmentSlotId);
  });

  useGameEvent('combat:heroDamaged', ({ damage }) => {
    if (damage <= 0) return;
    depsRef.current.setTakingDamage(true);
    setTimeout(() => depsRef.current.setTakingDamage(false), 200);
    depsRef.current.triggerHeroBleedAnimation();
  });

  useGameEvent('combat:heroHealed', ({ amount }) => {
    if (amount <= 0) return;
    depsRef.current.setHealing(true);
    setTimeout(() => depsRef.current.setHealing(false), 1200);
  });

  // NOTE: 'combat:monsterAttack' previously triggered a rose-orb projectile
  // from the attacking monster to the hero (via tryStartBossRetaliationDirectedFx).
  // The visual was reused from the boss-retaliation ability and looked out of
  // place on every regular attack — removed per UX feedback. Special abilities
  // that should still show that orb (e.g. combat:dragonBreathRetaliation) are
  // handled by their own dedicated listeners below.
  // The 'combat:monsterAttack' event itself is still emitted by the reducer
  // (turn.ts) for any future consumer; we just no-op on the visual side.

  useGameEvent('combat:monsterDamaged', ({ monsterId, damage }) => {
    if (damage > 0) {
      depsRef.current.triggerMonsterBleedAnimation(monsterId);
    }
  });

  useGameEvent('combat:stunApplied', ({ monsterId }) => {
    depsRef.current.addGameLog('combat', `怪物被击晕了！`);
  });

  useGameEvent('combat:diceRoll', ({ title, subtitle, roll, threshold, success }) => {
    const resultText = success ? '成功' : '失败';
    depsRef.current.addGameLog(
      'combat',
      `${title}${subtitle ? ` - ${subtitle}` : ''}：掷骰 ${roll}（需 ≤${threshold}）— ${resultText}`,
    );
  });

  useGameEvent('combat:shieldReflect', ({ monsterId, damage }) => {
    if (damage > 0) {
      depsRef.current.triggerMonsterBleedAnimation(monsterId);
    }
  });

  useGameEvent('combat:dragonBreathRetaliation', ({ monsterId }) => {
    depsRef.current.tryStartBossRetaliationDirectedFx(monsterId);
    depsRef.current.triggerHeroBleedAnimation();
  });

  useGameEvent('combat:started', () => {
    depsRef.current.addGameLog('combat', `战斗开始！`);
  });

  useGameEvent('combat:finished', () => {
    depsRef.current.addGameLog('combat', `战斗结束。`);
  });

  // --- Combat UI flow event listeners (drive modals, refs, and async flows) ---

  useGameEvent('combat:deathWardPrompt', () => {
    // State-driven via deathWardPrompt field — UI reacts to state change automatically
  });

  useGameEvent('combat:executeLastWords', ({ monster }) => {
    const monsterCard = monster as GameCardData;
    depsRef.current.addGameLog('combat', `${monsterCard.name ?? '怪物'}发动了遗言效果！`);
  });

  useGameEvent('combat:classDamageHit', () => {
    const d = depsRef.current;
    if (d?.amuletEffects.damageClassDiscoverCount && d.amuletEffects.damageClassDiscoverCount > 0) {
      dispatch({ type: 'RECORD_CLASS_DAMAGE_DISCOVER', increment: true });
    }
  });

  useGameEvent('waterfall:started', () => {
    waterfallInProgressRef.current = true;
  });

  useGameEvent('waterfall:completed', () => {
    waterfallInProgressRef.current = false;
    const resolvers = waterfallCompletionResolversRef.current;
    waterfallCompletionResolversRef.current = [];
    for (const resolve of resolvers) resolve();
  });

  useGameEvent('combat:daggerSelfDestructPrompt', async ({ slotId, itemName, durability }) => {
    // Wait for the attack swing + monster bleed + durability tick animations to finish
    // so the player sees the attack resolve before being asked about self-destruct.
    await new Promise<void>(resolve => {
      window.setTimeout(resolve, depsRef.current.animSpeed(DAGGER_PROMPT_POST_ATTACK_DELAY_MS));
    });

    // If this same attack also triggered a waterfall (e.g. it killed the last
    // monster in the row), defer the prompt until the waterfall animation
    // sequence is fully done so the modal/discover doesn't overlap it.
    if (waterfallInProgressRef.current) {
      await new Promise<void>(resolve => {
        waterfallCompletionResolversRef.current.push(resolve);
      });
    }

    const confirmed = await depsRef.current.requestDaggerSelfDestruct(itemName, durability);
    if (!confirmed) return;

    const d = depsRef.current;

    const slots = d.getEquipmentSlots();
    const matchedSlot = slots.find(s => s.id === slotId);
    if (matchedSlot?.item) {
      d.disposeOwnedEquipmentCard(matchedSlot.item as GameCardData, { isDestruction: true });
      d.clearEquipmentSlotWithPromote(slotId as EquipmentSlotId);
    }

    d.addGameLog('equip', `${itemName} 自毁！发现 ${durability} 张专属牌。`);

    let remaining = durability;
    const startNextDiscover = () => {
      if (remaining <= 0) return;
      remaining--;

      if (remaining > 0) {
        d.discoverPotionCompletionRef.current = () => {
          startNextDiscover();
        };
      }

      d.beginDiscoverFlow('dagger-self-destruct', { sourceLabel: itemName });
    };

    startNextDiscover();
  });

  useGameEvent('combat:ghostBladeExile', () => {
    depsRef.current.triggerGhostBladeExile();
  });

  useGameEvent('combat:arcaneBladeSpell', ({ slotId, targetId }) => {
    depsRef.current.tryStartArcaneBladeSpellFx(slotId as EquipmentSlotId, targetId);
  });

  useGameEvent('combat:missileStormSequence', ({ shots }) => {
    if (!Array.isArray(shots) || shots.length === 0) return;
    for (const shot of shots) {
      const delay = depsRef.current.animSpeed(Math.max(0, shot.delayMs ?? 0));
      window.setTimeout(() => {
        depsRef.current.tryStartMissileStormFx(shot.targetId);
      }, delay);
    }
  });

  // 单发魔弹的飞射动画：每一发由 FIRE_MISSILE_STORM_BOLT 在选好目标后发出。
  // 由于全部 BOLT actions 在同一次 drain 中同步入队/出队，事件几乎同时到达；
  // 用 boltIndex × 180ms 的时间差让 FX 逐发播放出来，与原 missileStormSequence
  // 的视觉节奏一致，但因为目标是动态选定的所以支持复生/重定向的情形。
  const MISSILE_STORM_BOLT_STAGGER_MS = 180;
  useGameEvent('combat:missileStormBolt', ({ targetId, boltIndex }) => {
    const delay = depsRef.current.animSpeed(boltIndex * MISSILE_STORM_BOLT_STAGGER_MS);
    window.setTimeout(() => {
      depsRef.current.tryStartMissileStormFx(targetId);
    }, delay);
  });

  useGameEvent('combat:goblinPersuadeAttempt', ({ monsterName, itemName }) => {
    depsRef.current.addGameLog('combat', `${itemName}尝试说服 ${monsterName}！`);
  });

  useGameEvent('combat:goblinStolen', () => {
    depsRef.current.addGameLog('combat', `哥布林偷走了一张牌！`);
  });

  useGameEvent('combat:heroTookDamageThisMonsterTurn', () => {
    depsRef.current.heroTookDamageThisMonsterTurnRef.current = true;
  });

  useGameEvent('combat:wraithPurified', () => {
    depsRef.current.addGameLog('combat', `幽魂被净化了！`);
  });

  useGameEvent('combat:monsterRewardQueued', ({ monsterId }) => {
    depsRef.current.addGameLog('combat', `击败奖励已入队。`);
  });

  // ---------------------------------------------------------------------------

  const updateDamageDiscoverCounter = useCallback((displayCount: number, threshold: number) => {
    dispatch({ type: 'UPDATE_AMULET_SLOTS', updater: prev => prev.map(slot => {
      if (slot?.amuletEffect !== 'damage-class-discover') return slot;
      return { ...slot, _counterDisplay: `${displayCount}/${threshold}` };
    }) });
  }, [dispatch]);

  const updateMagicDiscoverCounter = useCallback((displayCount: number, threshold: number) => {
    dispatch({ type: 'UPDATE_AMULET_SLOTS', updater: prev => prev.map(slot => {
      if (slot?.amuletEffect !== 'magic-class-discover') return slot;
      return { ...slot, _counterDisplay: `${displayCount}/${threshold}` };
    }) });
  }, [dispatch]);

  const recordClassDamageDiscoverHit = useCallback(() => {
    const d = depsRef.current;
    if (!d?.amuletEffects.damageClassDiscoverCount || d.amuletEffects.damageClassDiscoverCount <= 0) return;
    dispatch({ type: 'RECORD_CLASS_DAMAGE_DISCOVER', increment: true });
  }, [dispatch]);

  // -- Derived values (duplicated from GameBoard for local use) ---------------
  // depsRef.current may be null during the first render pass (populated later
  // by GameBoard after all hooks run), so guard with optional chaining.

  const { amuletEffects, attackBonus, defenseBonus } = (() => {
    const d = depsRef.current;
    if (!d) return { amuletEffects: createEmptyAmuletEffects(), attackBonus: 0, defenseBonus: 0 };
    return {
      amuletEffects: d.amuletEffects,
      attackBonus: d.attackBonus,
      defenseBonus: d.defenseBonus,
    };
  })();

  const maxHp =
    INITIAL_HP +
    (depsRef.current?.amuletEffects?.aura?.maxHp ?? 0) +
    permanentMaxHpBonus +
    (permanentSkills.includes('Iron Will') ? 3 : 0) +
    (() => {
      const skillId = selectedHeroSkill;
      if (!skillId) return 0;
      try {
        const { getHeroSkillById } = require('@/lib/heroSkills');
        const def = getHeroSkillById(skillId as HeroSkillId);
        return def?.initialMaxHpBonus ?? 0;
      } catch {
        return 0;
      }
    })();

  // -- Berserker / Gambit helpers ---------------------------------------------

  const clearBerserkTurnBuff = useCallback(() => {
    dispatch({ type: 'CLEAR_BERSERK_BUFF' });
  }, [dispatch]);

  const addBerserkTurnBuff = useCallback((amount: number) => {
    if (!amount) return;
    dispatch({ type: 'ADD_BERSERK_BUFF', amount });
  }, [dispatch]);

  const grantExtraAttackCharges = useCallback((amount: number) => {
    if (amount <= 0) return;
    dispatch({ type: 'MODIFY_PERMANENT_STAT', stat: 'extraAttackCharges', delta: amount });
  }, [dispatch]);

  const consumeExtraAttackCharge = useCallback(() => {
    if (engine.getState().extraAttackCharges <= 0) return;
    dispatch({ type: 'MODIFY_PERMANENT_STAT', stat: 'extraAttackCharges', delta: -1 });
  }, [dispatch, engine]);

  // -- updateMonsterCard ------------------------------------------------------

  const updateMonsterCard = (monsterId: string, updater: (monster: GameCardData) => GameCardData) => {
    dispatch({ type: 'UPDATE_ACTIVE_CARDS', updater: prev => prev.map(card => (card?.id === monsterId ? updater(card) : card)) as ActiveRowSlots });
  };

  // -- executeLastWords — thin dispatch to EXECUTE_LAST_WORDS ----------------

  const executeLastWords = (monster: GameCardData) => {
    if (!monster.lastWords) return;
    dispatch({ type: 'EXECUTE_LAST_WORDS', monsterId: monster.id, lastWords: monster.lastWords });
  };

  // -- handleMonsterDefeated — thin dispatch to MONSTER_DEFEATED -------------

  const handleMonsterDefeated = (monster: GameCardData, opts?: { killedByMinion?: boolean }) => {
    dispatch({ type: 'MONSTER_DEFEATED', monsterId: monster.id, killedByMinion: opts?.killedByMinion });
  };

  // -- decrementMonsterFury — thin dispatch to DECREMENT_FURY ---------------

  const decrementMonsterFury = (monster: GameCardData) => {
    dispatch({ type: 'DECREMENT_FURY', monsterId: monster.id });
  };

  // -- dealDamageToMonster — thin dispatch to DEAL_DAMAGE_TO_MONSTER --------

  const dealDamageToMonster = (
    monster: GameCardData,
    damage: number,
    options?: { animationDelay?: number; pulses?: number; isSpellDamage?: boolean },
  ) => {
    dispatch({
      type: 'DEAL_DAMAGE_TO_MONSTER',
      monsterId: monster.id,
      damage,
      source: 'combat',
      isSpellDamage: options?.isSpellDamage,
    });
  };

  // -- Shield reflect / boss retaliation — thin dispatches -------------------

  const applyBossRetaliationDamage = (monsterName: string, retDmg: number) => {
    if (retDmg <= 0) return;
    dispatch({ type: 'APPLY_DAMAGE', amount: retDmg, source: 'combat' });
  };

  const applyShieldReflectDamage = (
    monsterSnapshot: GameCardData,
    baseReflectDamage: number,
    sourceName: string,
  ) => {
    if (baseReflectDamage <= 0) return;
    dispatch({
      type: 'APPLY_SHIELD_REFLECT',
      monsterId: monsterSnapshot.id,
      damage: baseReflectDamage,
      sourceName,
    });
  };

  const runShieldReflectBossRetaliationSequence = (
    m: GameCardData,
    rawReflectDmg: number,
    sourceName: string,
    slotId: EquipmentSlotId,
  ) => {
    if (rawReflectDmg <= 0) return;
    dispatch({
      type: 'APPLY_SHIELD_REFLECT',
      monsterId: m.id,
      damage: rawReflectDmg,
      sourceName,
    });
    const as = depsRef.current.animSpeed;
    setTimeout(() => {
      depsRef.current.tryStartShieldReflectDirectedFx(slotId, m.id);
    }, as(COMBAT_BLOCK_TO_REFLECT_MS));
  };

  // -- healHero ---------------------------------------------------------------

  // healHero — dispatches HEAL to reducer and returns actualHeal for callers
  const healHero = useCallback(
    (
      baseAmount: number,
      _options?: { healLogVariant?: 'default' | 'discard-empower-lifesteal' | 'overkill-lifesteal' },
    ) => {
      const hpBefore = engine.getState().hp;
      dispatch({ type: 'HEAL', amount: baseAmount, source: _options?.healLogVariant ?? 'default' });
      const hpAfter = engine.getState().hp;
      const actualHeal = hpAfter - hpBefore;
      if (actualHeal > 0) {
        depsRef.current.setHealing(true);
        setTimeout(() => depsRef.current.setHealing(false), 1200);
      }
      return actualHeal;
    },
    [engine, dispatch],
  );

  // -- applyDamage ------------------------------------------------------------

  // applyDamage — dispatches APPLY_DAMAGE to reducer and returns appliedDamage
  const applyDamage = useCallback(
    (damage: number, source: 'combat' | 'general' = 'general', opts?: { blockedWithShield?: boolean; selfInflicted?: boolean }) => {
      const hpBefore = engine.getState().hp;
      dispatch({ type: 'APPLY_DAMAGE', amount: damage, source, selfInflicted: opts?.selfInflicted });
      const hpAfter = engine.getState().hp;
      const appliedDamage = hpBefore - hpAfter;
      if (appliedDamage > 0) {
        depsRef.current.setTakingDamage(true);
        setTimeout(() => depsRef.current.setTakingDamage(false), 200);
        depsRef.current.triggerHeroBleedAnimation();
      }
      return appliedDamage;
    },
    [engine, dispatch],
  );

  // -- applyDragonBreathRetaliation -------------------------------------------

  const applyDragonBreathRetaliation = (
    monsterId: string,
    monsterName: string,
    retDmg: number,
  ) => {
    dispatch({
      type: 'APPLY_DRAGON_BREATH_RETALIATION',
      monsterId,
      monsterName,
      damage: retDmg,
    });
  };

  // -- getEngagedMonsterCards / getActiveCombatMonster / finishCombat ----------

  const getEngagedMonsterCards = (): GameCardData[] => {
    const st = engine.getState();
    return st.combatState.engagedMonsterIds
      .map(id => st.activeCards.find(card => card?.id === id))
      .filter((card): card is GameCardData => Boolean(card));
  };

  const getActiveCombatMonster = (): GameCardData | null => {
    const engaged = getEngagedMonsterCards();
    return engaged.length > 0 ? engaged[0] : null;
  };

  // finishCombat — pure dispatch; heroStunned reset + recycleBag flush handled by reducer
  const finishCombat = () => {
    dispatch({ type: 'FINISH_COMBAT' });
  };

  // -- beginCombat — delegates to BEGIN_COMBAT reducer -------------------------

  const beginCombat = (monster: GameCardData, initiator: CombatInitiator) => {
    dispatch({ type: 'BEGIN_COMBAT', monster, initiator });
  };

  // -- performHeroAttack — dispatches PERFORM_HERO_ATTACK to reducer ----------

  const performHeroAttack = (slotId: EquipmentSlotId, targetMonster: GameCardData) => {
    const isBuildingNoEngaged = targetMonster.type === 'building' && engine.getState().combatState.engagedMonsterIds.length === 0;
    depsRef.current.triggerWeaponSwingAnimation(slotId, 0, { echoes: 2 });
    depsRef.current.triggerMonsterBleedAnimation(targetMonster.id, 0);
    dispatch({
      type: 'PERFORM_HERO_ATTACK',
      slotId,
      targetMonsterId: targetMonster.id,
      isBuildingNoEngaged,
    });
  };

  // -- endHeroTurn ------------------------------------------------------------
  const endHeroTurn = () => {
    if (depsRef.current.endHeroTurnGuardRef.current) return;
    depsRef.current.pushUndoSnapshot();
    depsRef.current.heroTookDamageThisMonsterTurnRef.current = false;

    const heroTurnLayerLossIds = Array.from(depsRef.current.heroTurnLayerLossIdsRef.current);
    depsRef.current.heroTurnLayerLossIdsRef.current.clear();

    dispatch({
      type: 'END_TURN',
      heroTurnLayerLossIds,
    });
  };

  // -- resolveBlockChoice — dispatches RESOLVE_BLOCK to reducer ---------------

  const resolveBlockChoice = (target: BlockTarget) => {
    if (!engine.getState().combatState.pendingBlock) return;
    if (depsRef.current.fullBoardInteractionLockedRef.current) return;
    const choice: 'shield' | 'take' = target === 'hero' ? 'take' : 'shield';
    const slotId = target === 'hero' ? undefined : target;
    dispatch({ type: 'RESOLVE_BLOCK', choice, slotId });
  };

  // -- advanceMonsterTurn -----------------------------------------------------

  const advanceMonsterTurn = useCallback(() => {
    dispatch({ type: 'ADVANCE_MONSTER_TURN' });
  }, [dispatch]);

  // -- handleDeathWardConfirm / Decline ---------------------------------------

  const handleDeathWardConfirm = useCallback(() => {
    depsRef.current.pushUndoSnapshot();
    if (!deathWardPrompt) {
      return;
    }
    const { card, source } = deathWardPrompt;
    if (source === 'hand') {
      depsRef.current.consumeCardFromHand(card);
      depsRef.current.consumeClassCardFromHand(card.id);
    } else {
      dispatch({ type: 'UPDATE_BACKPACK_ITEMS', updater: prev => prev.filter(item => item.id !== card.id) });
    }
    const isPermanent = (card.upgradeLevel ?? 0) >= 1;
    if (isPermanent) {
      dispatch({ type: 'UPDATE_RECYCLE_BAG', updater: prev => [...prev, { ...card, _recycleWaits: card.recycleDelay ?? 2 }] });
      depsRef.current.finalizeMagicCard(card, { banner: '不灭守护发动，抵消了致命伤害！（将在回收袋中冷却）' });
    } else {
      depsRef.current.finalizeMagicCard(card, { banner: '命悬一线发动，抵消了致命伤害。' });
    }
    dispatch({ type: "SET_HERO_SKILL_BANNER", message: '命悬一线护佑了你。' });
    dispatch({ type: "SET_DEATH_WARD_PROMPT", payload: null });
  }, [
    deathWardPrompt,
    dispatch,
  ]);

  const handleDeathWardDecline = useCallback(() => {
    depsRef.current.pushUndoSnapshot();
    if (!deathWardPrompt) {
      return;
    }
    const { pendingDamage, sourceType } = deathWardPrompt;
    dispatch({ type: "SET_DEATH_WARD_PROMPT", payload: null });
    depsRef.current.suppressDeathWardRef.current = true;
    try {
      applyDamage(pendingDamage, sourceType);
    } finally {
      depsRef.current.suppressDeathWardRef.current = false;
    }
  }, [applyDamage, deathWardPrompt, dispatch]);

  // -- handleMonsterTargetSelection -------------------------------------------

  const handleMonsterTargetSelection = useCallback(
    (monster: GameCardData) => {
      if (pendingMagicAction?.step === 'monster-select') {
        depsRef.current.handleMagicMonsterSelection(monster);
        return;
      }
      if (pendingHeroMagicAction?.step === 'monster-select') {
        if (depsRef.current.handleHolyLightMonsterCleanse(monster)) {
          return;
        }
      }
      if (pendingHeroSkillAction?.type === 'monster') {
        depsRef.current.handleHeroSkillMonsterSelection(monster);
      }
    },
    [
      pendingHeroMagicAction,
      pendingHeroSkillAction,
      pendingMagicAction,
    ],
  );

  // -- performShieldBash — dispatches PERFORM_SHIELD_BASH to reducer ----------

  const performShieldBash = (slotId: EquipmentSlotId, targetMonster: GameCardData) => {
    const st = engine.getState();
    if (st.combatState.currentTurn !== 'hero') return;
    const slotItem = slotId === 'equipmentSlot1' ? st.equipmentSlot1 : st.equipmentSlot2;
    if (!slotItem || slotItem.type !== 'shield' || !slotItem.shieldBashStunRate) return;

    depsRef.current.triggerWeaponSwingAnimation(slotId, 0, { echoes: 1 });
    dispatch({ type: 'PERFORM_SHIELD_BASH', slotId, targetMonsterId: targetMonster.id });
  };

  // -- handleWeaponToMonster — thin dispatch to INITIATE_WEAPON_ATTACK ------

  function handleWeaponToMonster(weapon: any, monster: GameCardData) {
    if (depsRef.current.fullBoardInteractionLockedRef.current) return;
    if (depsRef.current.heroStunnedRef.current) return;
    if (depsRef.current.handLockedForMonsterPhaseRef.current) {
      dispatch({ type: "SET_HERO_SKILL_BANNER", message: '当前无法用武器攻击（怪物回合或需先格挡）。' });
      return;
    }
    depsRef.current.pushUndoSnapshot();
    const slotId = normalizeHeroEquipmentSlotFromDrag(weapon.fromSlot);
    if (!slotId) return;

    dispatch({ type: 'INITIATE_WEAPON_ATTACK', monsterId: monster.id, slotId });
  }

  // ---------------------------------------------------------------------------
  // Return bag
  // ---------------------------------------------------------------------------

  return {
    // Berserker / gambit helpers
    clearBerserkTurnBuff,
    addBerserkTurnBuff,
    grantExtraAttackCharges,
    consumeExtraAttackCharge,

    // Monster damage
    damageMonsterWithLayerOverflow,
    updateMonsterCard,
    executeLastWords,
    handleMonsterDefeated,
    decrementMonsterFury,
    dealDamageToMonster,

    // Shield reflect / boss retaliation
    applyBossRetaliationDamage,
    applyShieldReflectDamage,
    runShieldReflectBossRetaliationSequence,

    // Healing / damage
    healHero,
    applyDamage,

    // Combat flow
    getEngagedMonsterCards,
    getActiveCombatMonster,
    finishCombat,
    beginCombat,
    performHeroAttack,
    performShieldBash,
    endHeroTurn,
    resolveBlockChoice,
    advanceMonsterTurn,

    // Death ward
    handleDeathWardConfirm,
    handleDeathWardDecline,

    // Monster target / weapon to monster
    handleMonsterTargetSelection,
    handleWeaponToMonster,

    recordClassDamageDiscoverHit,
    updateDamageDiscoverCounter,
    updateMagicDiscoverCounter,
  };
}
