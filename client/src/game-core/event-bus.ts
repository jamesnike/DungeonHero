export type GameEventMap = {
  'combat:started': { monsterIds: string[] };
  'combat:finished': { monsterIds: string[] };
  'combat:monsterDamaged': { monsterId: string; damage: number; remainingHp: number };
  'combat:monsterDefeated': { monsterId: string; monsterName: string };
  'combat:heroDamaged': { damage: number; source: string };
  'combat:heroHealed': { amount: number; source: string };
  'combat:weaponSwing': { slotId: string; delay?: number; echoes?: number; variant?: number };
  'combat:shieldBlock': { slotId: string; variant: number };
  'combat:shieldReflect': { monsterId: string; damage: number };
  'combat:bossRetaliation': { damage: number };
  'combat:monsterAttack': { monsterId: string; damage: number };
  'combat:stunApplied': { monsterId: string };
  'combat:monsterBleed': { monsterId: string; delay: number };
  'combat:dragonBleedDestroy': { monsterName: string; layersRemaining: number };
  'combat:boneRegenCheck': {
    monsterId: string; monsterName: string;
    layersBefore: number; layersAfter: number; forced: boolean;
    /** Pre-rolled D20 from reducer's seeded RNG; UI dice animates to this value. */
    predeterminedRoll: number;
  };
  'combat:wraithRebirthCheck': {
    monsterId: string; monsterName: string;
    maxLayers: number; layersBefore: number; layersAfter: number;
    /** Pre-rolled D20 from reducer's seeded RNG; UI dice animates to this value. */
    predeterminedRoll: number;
  };
  /**
   * Goblin "窃宝" elite skill: at end of monster turn, goblin rolls a single
   * D20 with success threshold = `min(stackCount * 5, 20)` (each stacked card
   * grants +25% steal chance, capped at 100%). Dice modal lets the player
   * watch the roll before the actual steal applies via `RESOLVE_DICE`.
   */
  'combat:goblinStealCheck': {
    monsterId: string;
    monsterName: string;
    stackCount: number;
    threshold: number;
    /** Pre-rolled D20 from reducer's seeded RNG; UI dice animates to this value. */
    predeterminedRoll: number;
    /** Pre-picked stolen item name (for modal subtitle). null when no candidates. */
    stolenItemName: string | null;
  };
  /**
   * Goblin "贼窝疗养" tier-2 skill: at end of monster turn, goblin rolls a
   * single D20 to heal 1 layer. Same `min(stackCount * 3, 20)` threshold as
   * 窃宝.
   */
  'combat:goblinHealCheck': {
    monsterId: string;
    monsterName: string;
    stackCount: number;
    threshold: number;
    /** Pre-rolled D20 from reducer's seeded RNG; UI dice animates to this value. */
    predeterminedRoll: number;
    currentLayer: number;
    maxLayers: number;
  };
  'combat:classDamageHit': {};
  'combat:classDamageDiscoverTriggered': { threshold: number };
  'combat:classMagicDiscoverTriggered': { threshold: number };
  'combat:stunAttemptDiscoverTriggered': { threshold: number };
  'combat:buildingDestroyed': { buildingId: string };
  'combat:lastWordsDiscard': {
    cards: import('@/components/GameCard').GameCardData[];
    monsterName: string;
  };
  'combat:executeLastWords': { monster: import('@/components/GameCard').GameCardData };
  'combat:bossTransform': {
    monsterId: string;
    originalMonster: import('@/components/GameCard').GameCardData;
    bossCard: import('@/components/GameCard').GameCardData;
  };
  'combat:dragonBreathFx': { monsterId: string; targetSlotId: string };
  'combat:golemReflect': {
    monsterId: string;
    monsterName: string;
    damage: number;
    /** When set, a shield slot absorbed the hit and the hero did not bleed. */
    hitSlotId?: 'equipmentSlot1' | 'equipmentSlot2' | null;
  };
  'combat:heroTurnLayerLoss': { monsterId: string };
  'combat:combatEnded': {};
  'combat:removeAndGraveyard': {
    monsterId: string;
    monster: import('@/components/GameCard').GameCardData;
  };
  'combat:addToGraveyard': { card: import('@/components/GameCard').GameCardData };
  'combat:monsterRewardQueued': { monsterId: string };
  'combat:goblinTrickCard': {
    monster: import('@/components/GameCard').GameCardData;
    card: import('@/components/GameCard').GameCardData;
  };
  'combat:bugletAmuletDrop': {
    monster: import('@/components/GameCard').GameCardData;
    card: import('@/components/GameCard').GameCardData;
  };
  'combat:graveyardSummon': {
    slots: number[];
    cards: import('@/components/GameCard').GameCardData[];
  };
  'combat:diceRoll': {
    title: string; subtitle: string;
    roll: number; threshold: number; success: boolean;
  };
  'combat:deathWardPrompt': { damage: number; source: string };
  'combat:dragonBreathRetaliation': {
    monsterId: string; monsterName: string; damage: number;
  };
  'combat:checkShieldRefillOnMonsterDeath': { slotId: string; monsterId: string };
  'combat:postAttackHandRecycle': { itemName: string };
  'combat:addMagicGauge': { gaugeType: string; amount: number };
  'combat:persuadeDiscountUpdate': { newReduction: number };
  'combat:goblinStealCard': {
    monsterId: string;
    monsterName: string;
    card: import('@/components/GameCard').GameCardData;
  };
  'combat:autoEngage': { monsterId: string; monsterName: string };
  'combat:goblinStolen': { target: unknown };
  'combat:goblinPersuadeAttempt': { slotId: string; monsterId: string; monsterName: string; itemName: string };
  'combat:daggerSelfDestructPrompt': { slotId: string; itemName: string; durability: number };
  'combat:ghostBladeExile': {};
  'combat:arcaneBladeSpell': { slotId: string; targetId: string };
  /** 魔弹风暴：序列化飞射动画，由 UI 按 delayMs 依次触发每一发射出 */
  'combat:missileStormSequence': {
    shots: Array<{ targetId: string; damage: number; delayMs: number }>;
  };
  /**
   * 魔弹风暴：单发魔弹已发射（由 FIRE_MISSILE_STORM_BOLT 在选定目标后发出）。
   * UI 监听此事件并按 boltIndex × stagger 间隔播放该发的飞射动画。
   * 与 combat:missileStormSequence 的区别：本事件在每一发"实际命中目标"时
   * 才发出，从而支持复生/重定向场景下的逐发动画。
   */
  'combat:missileStormBolt': {
    targetId: string;
    damage: number;
    boltIndex: number;
    totalBolts: number;
  };
  'combat:heroTookDamageThisMonsterTurn': {};
  'combat:wraithPurified': {};
  'equipment:drawFromBackpack': { count: number };
  'equipment:classCardDraw': { count: number };
  'equipment:drawFromRecycleBag': { count: number };
  'equipment:lastWordsHeal': { amount: number; itemName: string };
  'equipment:graveyardToHand': { itemName: string };

  'card:drawnToHand': { cardId: string; source: string };
  'card:discarded': { cardId: string; destination: 'graveyard' | 'recycleBag' };
  'card:addedToBackpack': { cardId: string };
  'card:played': { cardId: string; cardType: string };
  'card:flipped': { cardId: string; toCardId: string };
  'card:flippedInCell': {
    cellIndex: number;
    fromCard: import('@/components/GameCard').GameCardData;
    toCard: import('@/components/GameCard').GameCardData;
    message?: string;
  };

  'equipment:equipped': { slotId: string; cardId: string };
  'equipment:destroyed': { slotId: string; cardId: string };
  'equipment:repaired': { slotId: string; amount: number };
  'equipment:swapped': {};
  /**
   * 装备/护符栏满时被新装备顶替（displaced）出去。UI 监听此事件触发
   * 「装备栏 → 坟场 / 回收袋」的飞行动画。仅由 reduceDisposeEquipmentCard
   * 在 `triggerLastWords === true` 且确实落到 graveyard / recycle-bag 时发出
   * （残骸回收符把卡返回手牌的早返路径不会发出，因为那不是飞向坟场）。
   */
  'equipment:displaced': {
    card: import('@/components/GameCard').GameCardData;
    slotId: 'equipmentSlot1' | 'equipmentSlot2';
    destination: 'graveyard' | 'recycle-bag';
  };

  'waterfall:started': { sequenceId: number };
  'waterfall:dropPhase': { slots: number[] };
  'waterfall:discardPhase': { slot: number; destination: string };
  'waterfall:dealPhase': { slots: number[] };
  'waterfall:completed': { sequenceId: number };
  'waterfall:planReady': { plan: import('./rules/waterfall').WaterfallDropPlan };
  'waterfall:discoverPending': {};
  'waterfall:wraithEnrage': { monsterIds: string[] };
  'waterfall:classDrawn': { cards: import('@/components/GameCard').GameCardData[] };
  'waterfall:discardEffect': {
    cardName: string;
    effectType: string;
    updatedRemainingDeck: import('@/components/GameCard').GameCardData[];
  };

  'shop:opened': { offerings: unknown[] };
  'shop:purchased': { cardId: string; cost: number };
  'shop:closed': {};

  'event:started': { cardId: string };
  'event:choiceMade': { choiceId: string };
  'event:completed': { cardId: string };
  'event:finalized': {};
  'event:cardRemoved': {
    cardId: string;
    cellIndex: number;
    removed: boolean;
    /**
     * Snapshot of the card the reducer is removing. Provided so the hook
     * listener can drive a discard-flight animation BEFORE the React DOM
     * commit removes the slot's card element. Optional for backwards-compat
     * with any code path that may emit this event without the full snapshot.
     */
    card?: import('@/components/GameCard').GameCardData;
  };
  'event:diceRolled': { value: number };

  'hero:skillUsed': { skillId: string };
  'hero:skillRequiresTarget': { skillId: string; targetType: 'slot' | 'monster' };
  'hero:skillRequiresInteraction': { skillId: string; step: string };
  'hero:skillClassDeckDraw': { cards: Array<{ name: string }> };
  'hero:magicActivated': { magicId: string };
  'hero:magicCompleted': { magicId: string; origin: string };
  'hero:leveledUp': { stat: string; amount: number };
  'hero:magicGaugeAdded': { gaugeType: string; amount: number };
  'hero:magicGaugeFull': { gaugeType: string };
  'hero:sweepDamage': {
    monsterIds: string[];
    damage: number;
    staggerMs: number;
    isSpellDamage: boolean;
  };
  'hero:deckPeekRequest': {
    mode: string;
    peekedCards: import('@/components/GameCard').GameCardData[];
    gains: Array<{ label: string; count: number }>;
  };
  'hero:fateSwapFlight': {
    activeSlotIdx: number;
    oldCard: import('@/components/GameCard').GameCardData;
    newCard: import('@/components/GameCard').GameCardData;
  };
  /**
   * 维度扭曲 (Dimension Warp) — emitted from `reduceDungeonCardSelection`'s
   * `dungeon-preview-swap` case BEFORE the reducer applies the swap to state.
   * The hook captures both cell rects synchronously at listener time (DOM is
   * still pre-swap because React hasn't committed the patch yet) and paints a
   * 3D-flip + position-swap overlay on top of both cells. The cells underneath
   * are masked while the post-swap React render finishes.
   */
  'hero:dimensionWarp': {
    cellIndex: number;
    activeCard: import('@/components/GameCard').GameCardData;
    previewCard: import('@/components/GameCard').GameCardData;
  };
  /**
   * 乾坤挪移 / 命运挪移 — both cards are face-up active row cards that simply
   * trade slot positions. Hook captures both active cell rects and pushes two
   * arc-flight overlays into the existing `fateSwapFlights` RAF system (arc +
   * rotate + scale + fade — same visual vocabulary as 深层交织). No flip
   * because nothing is being revealed.
   *
   * Emitted from BOTH the schema-based resolver and the legacy magic-effects.ts
   * branch for each card (4 emit sites total: 乾坤挪移 ×2, 命运挪移 ×2).
   */
  'magic:activeRowSwap': {
    leftSlotIdx: number;
    rightSlotIdx: number;
    leftCard: import('@/components/GameCard').GameCardData;
    rightCard: import('@/components/GameCard').GameCardData;
  };
  /**
   * 迷宫回溯 (Labyrinth Retreat) — a single active row card flies along an
   * arc to the deck pile (deckFlyTargetRef). Reuses the same arc-flight RAF
   * loop with just one outbound flight and no inbound counterpart.
   *
   * Emitted from THREE sites: schema resolver auto-path (length===1), legacy
   * resolver auto-path, and the shared `return-dungeon-bottom` reducer case
   * in `rules/hero.ts` (player-pick + echo continuations).
   */
  'magic:returnToDeck': {
    slotIdx: number;
    card: import('@/components/GameCard').GameCardData;
  };
  'hero:cardRemoved': { cardId: string; animate: boolean };

  'monster:rewardOffered': { monsterId: string };
  'monster:rewardSelected': { rewardId: string };
  'monster:persuaded': { monsterId: string };

  'game:started': {};
  'game:over': { victory: boolean };
  'game:stateChanged': {};
  'game:undoPerformed': {};

  'log:entry': { type: string; message: string };

  // UI interaction requests — emitted by reducer sideEffects,
  // consumed by React to show modals/prompts
  'ui:requestDice': {
    title: string;
    subtitle?: string;
    entries: Array<{ id: string; range: [number, number]; label: string; effect: string }>;
    context?: Record<string, unknown>;
    /** Pre-rolled D20 from reducer's seeded RNG; UI dice animates to this value. */
    predeterminedRoll: number;
  };
  'ui:requestEquipmentChoice': {
    slots: string[];
    prompt: string;
    context?: Record<string, unknown>;
  };
  'ui:requestMagicChoice': {
    options: Array<{ id: string; label: string }>;
    prompt: string;
    context?: Record<string, unknown>;
  };
  'ui:requestCardAction': {
    actionType: string;
    candidates: Array<{ id: string; name: string }>;
    prompt: string;
    context?: Record<string, unknown>;
  };
  'ui:requestGraveyardSelection': {
    candidates: Array<{ id: string; name: string }>;
    maxSelect: number;
    prompt: string;
    context?: Record<string, unknown>;
  };
  'ui:banner': { text: string };
  /**
   * Pipeline drain hit MAX_STEPS — some actions remain in `state.actionQueue`
   * and will (best-effort) drain on the next dispatch. UI should warn the
   * player; reducer/test code can also check `PipelineResult.overflowed`.
   *
   * `headActionTypes` is a sample (first 5) of the action.type strings that
   * were left undrained, useful for diagnostic / bug-report screenshots.
   */
  'pipeline:overflow': {
    stepsProcessed: number;
    remainingQueueLength: number;
    headActionTypes: string[];
  };
  'ui:graveyardDiscover': {
    options: import('@/components/GameCard').GameCardData[];
    card: import('@/components/GameCard').GameCardData;
    source: string;
  };

  // Interactive continuation responses — emitted when RESOLVE_* actions are processed
  'interactive:diceResolved': {
    value: number;
    outcomeId: string | null;
    context: Record<string, unknown>;
  };
  'interactive:equipmentChoiceResolved': {
    slotId: string;
    context: Record<string, unknown>;
  };
  'interactive:magicChoiceResolved': {
    choiceId: string;
    context: Record<string, unknown>;
  };
  'interactive:cardActionResolved': {
    cardId: string;
    actionType: string;
    context: Record<string, unknown>;
  };
  'interactive:graveyardSelectionResolved': {
    cardIds: string[];
    context: Record<string, unknown>;
    card?: import('@/components/GameCard').GameCardData;
  };

  // Side effects emitted by reducer for card/potion/magic resolution
  'card:potionResolved': { card: import('@/components/GameCard').GameCardData };
  'card:potionRepair': { card: import('@/components/GameCard').GameCardData; amount: number };
  'card:magicResolved': { card: import('@/components/GameCard').GameCardData; target?: string };
  'hero:persuadeAttempt': { monsterId: string };
  'hero:sweep': { targetIds: string[] };
  'shop:discoverStarted': { source: string; pool: import('@/components/GameCard').GameCardData[]; sourceLabel?: string };
  'shop:discoverFallbackDraw': { source: string };
  'shop:skillSelected': { skillId: string; asyncOps: Array<{ kind: string; count?: number; cardKey?: string }> };
  'shop:deleteCardConfirmed': {
    card: import('@/components/GameCard').GameCardData;
    source: 'hand' | 'backpack' | 'recycleBag' | 'equipment' | 'amulet';
    destination: 'graveyard' | 'recycle-bag';
    context?: string;
  };
  'shop:graveyardDiscoverReady': {
    options: import('@/components/GameCard').GameCardData[];
    delivery: 'backpack' | 'hand-first';
  };
  'shop:ghostBladeExileReady': {
    options: import('@/components/GameCard').GameCardData[];
  };
  'shop:monsterRewardGrantStatSwap': {
    card: import('@/components/GameCard').GameCardData;
  };
  'equipment:clearSlotWithPromote': { slotId: string };
  'event:asyncEffectNeeded': { tokens: string[] };

  // Dice-flow card effects — emitted by RESOLVE_DICE handlers,
  // consumed by React hooks for complex UI interactions
  'card:fortuneWheelDiscover': { card?: import('@/components/GameCard').GameCardData };
  'card:fortuneWheelDelete': { card?: import('@/components/GameCard').GameCardData };
  'card:chaosEquipReturn': { card?: import('@/components/GameCard').GameCardData };
  'card:chaosDiscover': { card?: import('@/components/GameCard').GameCardData };
  'card:chaosShop': { card?: import('@/components/GameCard').GameCardData };
  'card:chaosDiscardDraw': { card?: import('@/components/GameCard').GameCardData };

  // Card-effect UI interactions
  'card:bloodGreedShop': { card: import('@/components/GameCard').GameCardData };
  'card:stormVolleyTransformed': { card: import('@/components/GameCard').GameCardData };
  'card:recallEquipmentSelect': { card: import('@/components/GameCard').GameCardData; options: Array<{ id: string; label: string; description: string; slotType: string }> };
  'card:graveyardRecalled': { cards: import('@/components/GameCard').GameCardData[] };
  'card:discoverRequested': { source: string; candidates: import('@/components/GameCard').GameCardData[]; sourceLabel?: string };
  'card:cryptDeathwishSelect': { card: import('@/components/GameCard').GameCardData };
  'card:classDrawRequested': { count: number; source: string };
  'card:mirrorCopyRequested': { card: import('@/components/GameCard').GameCardData };
  'card:deckJudgeRequested': { card: import('@/components/GameCard').GameCardData };
  'card:graveyardDiscoverEquipAmulet': { card: import('@/components/GameCard').GameCardData };
  'card:echoBagDiscover': { card: import('@/components/GameCard').GameCardData; discoverCount: number; drawCount: number };
  'card:stunWaveDice': { card: import('@/components/GameCard').GameCardData; monsters: Array<{ id: string; name: string }>; stunPct: number };
  'card:transformGrantModal': { card: import('@/components/GameCard').GameCardData };
  'card:potionDiscoverClassMagic': { card: import('@/components/GameCard').GameCardData };

  // Event-choice side effects — emitted by APPLY_EVENT_EFFECT for UI animations
  'event:cardTransformed': { fromCard: import('@/components/GameCard').GameCardData; toCard: import('@/components/GameCard').GameCardData; message: string; hasFlipGold: boolean };
  'event:curseCreated': { card: import('@/components/GameCard').GameCardData; isTransform: boolean };
  'event:classDeckDrawn': { cards: import('@/components/GameCard').GameCardData[]; source: string };
  'event:handToRecycleBag': { cards: import('@/components/GameCard').GameCardData[] };
  'event:backpackOverflow': { cards: import('@/components/GameCard').GameCardData[] };
  'event:randomHandDiscarded': { cards: import('@/components/GameCard').GameCardData[] };
  'event:handDiscardedForGold': { count: number; gold: number };
  'event:equipmentAutoDestroyed': { slotIds: string[]; lastWordsEffects: Array<{ type: string; value: number }> };
  'event:requestEventInteraction': { token: string; data: Record<string, unknown> };

  // UI animation triggers — emitted by reducer, consumed by hooks for animations
  'card:discardShock': { count: number };
  /** Emitted when a card flip resolves and the player has 弧能之符 amulets equipped.
   *  `count` = number of equipped amulets (each triggers an independent zap). */
  'card:flipShock': { count: number };
  'card:graveNova': { card?: import('@/components/GameCard').GameCardData };
  'card:queueToHand': { card: import('@/components/GameCard').GameCardData; sourceHint?: string };
  /**
   * 哥布林的戏法 — phase 1 complete. The reducer has already moved the
   * `shuffledCards` from hand into the backpack and earmarked `drawCardIds`
   * for the follow-up draw. The hook listener triggers the hand→backpack
   * discard flights for `shuffledCards`, awaits their completion, then
   * dispatches `GOBLIN_TRICK_DELIVER` with `drawCardIds` to start the
   * backpack→hand flights.
   */
  'card:goblinTrickShuffled': {
    shuffledCards: import('@/components/GameCard').GameCardData[];
    drawCardIds: string[];
  };
  'card:newCardGained': { count: number; source?: string };
  'card:playedFromHand': { card: import('@/components/GameCard').GameCardData };
  'card:drawnFromBackpack': { cards: import('@/components/GameCard').GameCardData[]; count: number };
  'card:restoredFromRecycleBag': { cardId: string };
  'card:equipped': { cardId: string; slotId: string };
  'card:deleted': { card: import('@/components/GameCard').GameCardData; source: string; destination: string; context?: string };
  'card:finalized': { cardId: string; destination: string };
  'card:potionPlayed': { card: import('@/components/GameCard').GameCardData; target?: string };
  'card:magicPlayed': { card: import('@/components/GameCard').GameCardData; target?: string };
  'card:equipmentSalvaged': { card: import('@/components/GameCard').GameCardData; slotHint?: string };

  // Class deck draws
  'cards:classDrawn': { cards: import('@/components/GameCard').GameCardData[] };

  // Finalization events — emitted after reducer disposes magic/potion cards
  'card:magicFinalized': { card: import('@/components/GameCard').GameCardData; dealtDamage: boolean };
  'card:potionFinalized': { card: import('@/components/GameCard').GameCardData };
  'card:potionFlipRequested': { card: import('@/components/GameCard').GameCardData };

  // Deck peek events — emitted by RESOLVE_DECK_JUDGE / RESOLVE_FATE_SIGHT
  'card:deckJudgePeekReady': {
    peekedCards: import('@/components/GameCard').GameCardData[];
    monsterCount: number;
    deleteCount: number;
    gains: Array<{ label: string; count: number }>;
    card: import('@/components/GameCard').GameCardData;
  };
  'card:fateSightPeekReady': {
    peekedCards: import('@/components/GameCard').GameCardData[];
    monsterCount: number;
    stunChance: number;
    targetMonsterName: string;
    card: import('@/components/GameCard').GameCardData;
    totalDamage: number;
    targetMonsterId: string;
    targetIsStunned: boolean;
    /** Pre-rolled D20 from reducer's seeded RNG (only valid when stun dice will be triggered). */
    predeterminedRoll: number;
  };
  'card:statSwapStunDice': {
    card: import('@/components/GameCard').GameCardData;
    targetMonsterId: string;
    targetMonsterName: string;
    effectiveFlankStun: number;
    /** Pre-rolled D20 from reducer's seeded RNG; UI dice animates to this value. */
    predeterminedRoll: number;
  };
  'card:repairEnrageDiceReady': {
    card: import('@/components/GameCard').GameCardData;
    slotId: string;
    monsterId: string;
  };
};

export type GameEventKey = keyof GameEventMap;

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler<any>>>();

  on<K extends GameEventKey>(event: K, handler: Handler<GameEventMap[K]>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  off<K extends GameEventKey>(event: K, handler: Handler<GameEventMap[K]>): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit<K extends GameEventKey>(event: K, payload: GameEventMap[K]): void {
    this.handlers.get(event)?.forEach(handler => {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Error in handler for "${event}":`, err);
      }
    });
  }

  removeAllListeners(): void {
    this.handlers.clear();
  }
}
