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
  /**
   * 「雷金护符」(amulet: stun-gold) just consumed a stun on this monster:
   * +`goldDelta` gold已 enqueue（未必已经入账）+ stun 标志同帧被清除。
   * UI 监听此事件在该怪物卡上播放一次性「金币爆发 + 击晕释放」动画
   * （非阻塞、纯视觉，与游戏逻辑流水线解耦）。
   *
   * 多怪物同时被击晕（震慑领域）→ 每只怪物独立 emit 一次。
   * N 件 stun-gold 护符叠加 → 只 emit 一次，但 `goldDelta = 10 * N`，
   * 用于动画显示「+10 / +20 / +30 G」。
   */
  'combat:stunReleasedByGoldAmulet': {
    monsterId: string;
    monsterName: string;
    goldDelta: number;
  };
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
   * Goblin "疗养" tier-2 skill: at end of monster turn, goblin rolls a
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
  'combat:mirrorCopySummonTriggered': { count: number; threshold: number };
  'combat:equipOverclockTriggered': {
    surface: 'onEquip' | 'lastWords' | 'attack' | 'block' | 'durability' | 'shieldReflect';
    count?: number; // ×N stacks fired this surface (default 1)
  };
  'combat:stunAttemptDiscoverTriggered': { threshold: number };
  'combat:buildingDestroyed': { buildingId: string };
  'combat:lastWordsDiscard': {
    cards: import('@/components/GameCard').GameCardData[];
    monsterName: string;
  };
  'combat:executeLastWords': { monster: import('@/components/GameCard').GameCardData };
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
  /**
   * 不灭守护 自动触发：reducer 在 reduceApplyDamage 检测到致死伤害时已经把
   * 卡片从手牌移到坟场、把伤害归零，并设置 deathWardNotice + phase=
   * 'awaitingDeathWardNotice'。这条事件仅用于 UI 通用反馈（log / 音效 / 浮字），
   * modal 弹窗本身由 deathWardNotice 状态字段驱动。
   */
  'combat:deathWardActivated': {
    cardName: string;
    blockedDamage: number;
    source: string;
  };
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
  /**
   * 触发「从坟场放逐 1 张卡」弹窗。复用 BEGIN_GHOST_BLADE_EXILE reducer +
   * GraveyardExileModal —— 不同 source 的差别仅在 banner / log 文案上（用 sourceLabel 拼）。
   *   - 'weapon': 武器攻击后（虚灵刀）
   *   - 'amulet': 受到伤害后（灵魂吞噬）
   */
  'combat:ghostBladeExile': { source: 'weapon' | 'amulet'; sourceLabel: string };
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
  /**
   * 「乾坤一翻」对 Preview Row 卡背使用后发出。Preview 格 cellIndex 对应的卡牌
   * 不再覆盖卡背，而是直接显示正面（state.previewRevealedEarly[cellIndex] = true）。
   * 卡牌数据没有变化（不是 transform，仅是揭示）。UI 可借此触发翻面动画或闪光。
   */
  'card:previewRevealedEarly': {
    cellIndex: number;
    card: import('@/components/GameCard').GameCardData;
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
  /**
   * Fired during waterfall when one or more cards in the recycle bag have hit
   * `_recycleWaits === 0` and have been moved back into the backpack.
   * UI uses this to play the green "recycle ring" animation on the Backpack cell.
   */
  'waterfall:recycleRestored': {
    count: number;
    cards: import('@/components/GameCard').GameCardData[];
  };
  /**
   * 「置顶」关键词触发：从回收袋洗回背包的卡里有 N 张带 `topOnRecycleRestore: true`，
   * 在同一 reducer 步骤里被 prepend 到 `backpackItems[0]`（背包第 1 格），让玩家立刻
   * 能在背包最显眼位置看到它。
   *
   * 这条 side effect 跟 `waterfall:recycleRestored` 配对发出 —— 第一阶段绿环动画在
   * BackpackZone 仍然播放（payload.cards 含全部 restored 包括置顶卡），第二阶段由本
   * event 驱动 banner / log。
   *
   * 注意事件名 `promotedToDeckTop` 是历史命名（最初置顶语义是「牌堆顶」），现已迁移
   * 到「背包顶」语义，但事件名因为没有任何 listener 暂未改名。
   */
  'card:promotedToDeckTop': {
    count: number;
    cards: import('@/components/GameCard').GameCardData[];
  };
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
  /**
   * 布雷术：在激活行随机空 slot 放下地雷（hellow ghost building，mineDamage: 5）。
   * payload.slots: 实际成功放置的地雷条目（idx + mineId）。
   * payload.droppedCount: 因空位不足而丢失的地雷数量（echo 时可能 > 0）。
   * 触发逻辑（怪物落到地雷格 → 5 点纯伤 + 地雷进坟场）由 reduceApplyWaterfallDrop
   * 处理，触发时另发 'combat:mineTriggered' 事件，跟本事件分开。
   */
  'magic:layMine': {
    slots: Array<{ idx: number; mineId: string }>;
    droppedCount: number;
  };
  /**
   * 地雷触发：怪物瀑流落到地雷 slot 时，地雷从下层触发对该怪物造成 mineDamage
   * 点纯伤害，随后地雷进坟场。
   * payload.slotIdx: 地雷所在 slot index。
   * payload.monsterId: 落到 slot 的怪物 id。
   * payload.damage: 实际造成的伤害（= 地雷的 mineDamage 字段）。
   * payload.mineId: 触发的地雷卡 id（用于动画 / 飞向坟场）。
   */
  'combat:mineTriggered': {
    slotIdx: number;
    monsterId: string;
    damage: number;
    mineId: string;
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
   * Monster skill triggered — drives the blocking floating-text animation
   * above the triggering monster card. While this float is on screen the
   * pipeline is hard-paused (phase 'awaitingSkillFloat'); the UI hook MUST
   * dispatch RELEASE_MONSTER_SKILL_FLOAT after the animation finishes or the
   * game permanently freezes.
   *
   * One emit per queued float entry (sequential, not batched). When multiple
   * skills fire in the same reducer step the queue is filled at trigger time
   * and the engine emits one event per entry as each RELEASE pops the head.
   */
  'ui:monsterSkillFloat': {
    floatId: string;
    monsterId: string;
    skillName: string;
    skillKey: import('./monsterSkillNames').MonsterSkillKey;
    kind: import('./monsterSkillNames').MonsterSkillKind;
    durationMs: number;
  };
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
  /**
   * Emitted when a discover selection is resolved (the player picked one of
   * the 3 candidates and it was cloned + placed into the player's pile).
   * `card` is the *cloned* card (with its fresh id) that landed in the
   * player's hand, backpack, or recycle bag. The `'hand'` destination is used
   * by the opening-hand 「专属感召」 perm-1 magic (delivery: 'hand-first');
   * its flight is driven separately via `card:queueToHand` with
   * `sourceHint: 'classDeck'`, so the listener for this event SKIPS the
   * class-deck → backpack flight when destination is `'hand'`.
   */
  'shop:classCardObtained': {
    card: import('@/components/GameCard').GameCardData;
    source: 'discover' | 'classDraw' | 'purchase';
    destination: 'hand' | 'backpack' | 'recycle-bag';
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
  'card:discoverRequested': {
    source: string;
    candidates: import('@/components/GameCard').GameCardData[];
    sourceLabel?: string;
    /**
     * Optional override for `BeginDiscoverAction.delivery`. When omitted,
     * the discover lands in backpack (existing behavior). 'hand-first'
     * tries hand → backpack → recycle bag — used by the starter
     * "发现一张专属牌（直接进手牌）" perm magic.
     */
    delivery?: 'backpack' | 'hand-first';
  };
  'card:cryptDeathwishSelect': { card: import('@/components/GameCard').GameCardData };
  'card:mirrorCopyRequested': { card: import('@/components/GameCard').GameCardData };
  /**
   * 魔物融合（knight:monster-fusion）— resolver 检测到候选 ≥2 张同种族怪物装备时
   * 发出，请求 hook 层打开 MonsterFusionModal 让玩家挑选 2/3 张要融合的卡。
   *
   * `card` 是触发的「魔物融合」magic 卡本身（用于在 RESOLVE/CANCEL 时通过
   * `pendingMagicAction.card` 访问）。
   */
  'card:monsterFusionRequested': { card: import('@/components/GameCard').GameCardData };
  'card:deckJudgeRequested': { card: import('@/components/GameCard').GameCardData };
  /**
   * 净册涌泉 (knight:cleanse-draw) — emitted from the magic resolver to ask
   * the hook layer to drive the hand-card delete + graveyard discover loop.
   *
   * The hook iterates `echoRemaining` times: open a hand-only delete picker
   * for 1 card, then call `requestGraveyardSelection(3, { delivery: 'hand-first' })`
   * to discover 1 graveyard card into hand. Empty hand on any iteration →
   * skip the delete picker for that iteration but still discover. After the
   * loop, the hook dispatches FINALIZE_MAGIC_CARD.
   */
  'card:cleanseDrawRequested': {
    card: import('@/components/GameCard').GameCardData;
    echoRemaining: number;
  };
  'card:graveyardDiscoverEquipAmulet': {
    card: import('@/components/GameCard').GameCardData;
    /** 法术回响 B 类：弹出几次（每次抽 3 张候选 + 选 1）。普通使用 = 1，回响 ×N = N。 */
    echoRemaining: number;
  };
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

  // Deck peek events — emitted by RESOLVE_DECK_JUDGE / 天眼审判 resolver
  'card:deckJudgePeekReady': {
    peekedCards: import('@/components/GameCard').GameCardData[];
    monsterCount: number;
    deleteCount: number;
    gains: Array<{ label: string; count: number }>;
    card: import('@/components/GameCard').GameCardData;
  };
  /**
   * 天眼审判：翻看主牌堆顶 4 张牌后弹出 peek 弹窗。若 peek 区域无怪物，
   * `persuadeBonusGranted` > 0 表示已经把对应数值加到 `state.persuadeAmuletBonus`。
   * 弹窗关闭时 hook 负责 dispatch FINALIZE_MAGIC_CARD 让卡正式 dispose。
   */
  'card:fateSightPeekReady': {
    peekedCards: import('@/components/GameCard').GameCardData[];
    monsterCount: number;
    persuadeBonusGranted: number;
    card: import('@/components/GameCard').GameCardData;
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
  /**
   * Multiplayer (phase 2+): the local waterfall finished computing its
   * post-discard payload; ship this to the peer via the network layer.
   *
   * Payload shape:
   *   - `cards` — the cards pushed out by waterfall that should land on
   *     the peer's deck top (already stripped of owner-specific runtime
   *     fields; safe to JSON-serialize). May be empty if everything was
   *     a final monster / non-transferable.
   *   - `previewDealt` — the cards we just dealt from our `remainingDeck`
   *     top to our own preview row this waterfall iteration. The peer
   *     uses these to **remove the same cards from their own deck by id**,
   *     keeping the shared suffix in sync. Cards in `previewDealt` that
   *     the peer doesn't have (e.g. cards previously transferred from
   *     the peer back to us) are silently skipped on the receiver side.
   *   - `seq` — local monotonic counter used by the network layer to
   *     dedupe / order; the server stamps its own seq on the persisted
   *     row, this is just a client-side ordering hint.
   *
   * Listeners (the `useMultiplayerSync` hook in phase 3) are responsible
   * for: (a) calling the network layer; (b) on success, dispatching
   * MULTIPLAYER_CLEAR_PENDING_TRANSFER. Failure → retry / queue locally.
   */
  'multiplayer:transferOut': {
    cards: import('@/components/GameCard').GameCardData[];
    previewDealt: import('@/components/GameCard').GameCardData[];
    seq: number;
  };
  /**
   * `multiplayer:bossEncountered` — the final monster (Boss) just
   * appeared in a multiplayer game's active row or preview row. Phase 6
   * does NOT support synchronous co-op boss fights, so the UI shows a
   * one-time alert ("Boss 战暂未支持双人，本场以单人结算") and the
   * underlying engine continues to reduce the encounter as solo. The
   * peer is unaffected — they finish their own deck independently.
   *
   * Payload:
   *   - `monsterId` — the boss card's id; useful for the alert copy if
   *     we ever want to show its name.
   *
   * Idempotent: the reducer fires this only once per game (gated on
   * `state.bossEncounterAlertShown` — set true after the first emission).
   */
  'multiplayer:bossEncountered': {
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
