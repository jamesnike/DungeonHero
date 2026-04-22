/**
 * Integration tests — full game flow cycles through the action pipeline.
 *
 * These tests exercise multi-action sequences to verify that enqueued
 * follow-up actions, side effects, and state transitions work together.
 */

import { describe, expect, it } from 'vitest';
import { drain, processStep } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeMonster(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5,
    hp: 10, maxHp: 10, attack: 5,
    ...overrides,
  };
}

function makeCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1', type: 'weapon' as const, name: 'Sword', value: 3,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Full combat turn cycle
// ---------------------------------------------------------------------------

describe('full combat turn cycle', () => {
  it('END_TURN → ADVANCE_MONSTER_TURN → awaitingBlock', () => {
    const monster = makeMonster();
    const state = makeState({
      activeCards: [monster, null, null, null, null],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
      },
    });

    const result = drain(state, [
      { type: 'END_TURN', heroTurnLayerLossIds: [] },
    ]);

    expect(result.state.combatState.currentTurn).toBe('monster');
    expect(result.state.phase).toBe('awaitingBlock');
    expect(result.state.combatState.pendingBlock).not.toBeNull();
    // Pipeline finishes without remaining actions; pausedForInput is
    // only true when the queue still has items when an input phase is hit.
    expect(result.stepsProcessed).toBe(2);
  });

  it('END_TURN with no engaged monsters returns to playerInput', () => {
    const state = makeState({
      activeCards: [null, null, null, null, null],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: [],
        currentTurn: 'hero',
      },
    });

    const result = drain(state, [
      { type: 'END_TURN', heroTurnLayerLossIds: [] },
    ]);

    expect(result.state.phase).toBe('playerInput');
    expect(result.pausedForInput).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Damage → death chain
// ---------------------------------------------------------------------------

describe('damage → death flow', () => {
  it('applying lethal damage sets gameOver', () => {
    const state = makeState({ hp: 3 });

    const result = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 10, source: 'monster' },
    ]);

    expect(result.state.hp).toBe(0);
    expect(result.state.gameOver).toBe(true);
  });

  it('multiple damage + heal in sequence resolves correctly', () => {
    const state = makeState({ hp: 20 });

    const result = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 8, source: 'monster' },
      { type: 'HEAL', amount: 3, source: 'potion' },
      { type: 'APPLY_DAMAGE', amount: 5, source: 'trap' },
    ]);

    expect(result.state.hp).toBe(10);
    expect(result.state.totalDamageTaken).toBe(13);
    expect(result.state.totalHealed).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Event lifecycle
// ---------------------------------------------------------------------------

describe('event lifecycle', () => {
  it('START_EVENT → COMPLETE_EVENT → FINALIZE_EVENT clears event', () => {
    const eventCard = makeCard({ id: 'ev1', type: 'event' as const, name: 'Merchant' });
    const state = makeState();

    // Start event
    const startResult = reduce(state, {
      type: 'START_EVENT',
      card: eventCard as any,
    });
    expect(startResult.state.phase).toBe('event');
    expect(startResult.state.currentEventCard).toBeTruthy();

    // Complete event (clears modal state but keeps phase as 'event')
    const completeResult = reduce(startResult.state, { type: 'COMPLETE_EVENT' });
    expect(completeResult.state.currentEventCard).toBeNull();
    expect(completeResult.state.eventModalOpen).toBe(false);
    expect(completeResult.sideEffects.some(e => e.event === 'event:completed')).toBe(true);

    // Finalize event (transitions phase to 'playing')
    const finalizeResult = drain(completeResult.state, [
      { type: 'FINALIZE_EVENT' },
    ]);
    expect(finalizeResult.state.phase).toBe('playing');
    expect(finalizeResult.sideEffects.some(e => e.event === 'event:finalized')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Shop flow
// ---------------------------------------------------------------------------

describe('shop flow', () => {
  it('OPEN_SHOP → SHOP_HEAL → CLOSE_SHOP', () => {
    const cards = Array.from({ length: 20 }, (_, i) => ({
      id: `d${i}`, type: (['weapon', 'shield', 'magic', 'amulet', 'potion'] as const)[i % 5],
      name: `Card ${i}`, value: i + 1,
    }));
    const state = makeState({
      classDeck: cards,
      shopLevel: 0,
      hp: 10,
      gold: 20,
      shopHealUsed: false,
    });

    const result = drain(state, [
      { type: 'OPEN_SHOP' },
      { type: 'SHOP_HEAL' },
      { type: 'CLOSE_SHOP' },
    ]);

    expect(result.state.hp).toBe(15);
    expect(result.state.gold).toBe(15);
    expect(result.state.shopHealUsed).toBe(true);
    expect(result.state.shopModalOpen).toBe(false);
    expect(result.state.shopOfferings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Card draw → play → equip chain
// ---------------------------------------------------------------------------

describe('card draw → play → equip chain', () => {
  it('draws from backpack then plays card', () => {
    const weapon = makeCard({ id: 'w1', type: 'weapon' as const, name: 'Axe', value: 4 });
    const state = makeState({
      backpackItems: [weapon],
      handCards: [],
      equipmentSlot1: null,
      activeCards: [null, null, null, null, null],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: [],
      },
    });

    // Draw from backpack
    const drawResult = drain(state, [
      { type: 'DRAW_CARDS', count: 1, source: 'backpack' },
    ]);
    expect(drawResult.state.handCards.length).toBe(1);
    expect(drawResult.state.backpackItems.length).toBe(0);

    // Play the drawn weapon
    const playResult = drain(drawResult.state, [
      { type: 'PLAY_CARD', cardId: 'w1' },
    ]);
    expect(playResult.state.handCards.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ENQUEUE_ACTIONS chains
// ---------------------------------------------------------------------------

describe('ENQUEUE_ACTIONS chaining', () => {
  it('chains multiple damage actions through enqueue', () => {
    const state = makeState({ hp: 20 });

    const result = drain(state, [
      {
        type: 'ENQUEUE_ACTIONS',
        actions: [
          { type: 'APPLY_DAMAGE', amount: 2, source: 'a' },
          { type: 'APPLY_DAMAGE', amount: 3, source: 'b' },
          { type: 'HEAL', amount: 1, source: 'c' },
        ],
      },
    ]);

    expect(result.state.hp).toBe(16);
    expect(result.stepsProcessed).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// SET_GAME_FLAGS through pipeline
// ---------------------------------------------------------------------------

describe('SET_GAME_FLAGS in pipeline', () => {
  it('SET_GAME_FLAGS followed by game actions', () => {
    const state = makeState({ hp: 20, turnCount: 3 });

    const result = drain(state, [
      { type: 'SET_GAME_FLAGS', patch: { turnCount: 10 } },
      { type: 'APPLY_DAMAGE', amount: 5, source: 'test' },
    ]);

    expect(result.state.turnCount).toBe(10);
    expect(result.state.hp).toBe(15);
  });
});

describe('SET_PERSUADE_AMULET_BONUS in pipeline', () => {
  it('SET_PERSUADE_AMULET_BONUS followed by game actions', () => {
    const state = makeState({ hp: 20, persuadeAmuletBonus: 10 });

    const result = drain(state, [
      { type: 'SET_PERSUADE_AMULET_BONUS', bonus: 50 },
      { type: 'APPLY_DAMAGE', amount: 5, source: 'test' },
    ]);

    expect(result.state.persuadeAmuletBonus).toBe(50);
    expect(result.state.hp).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// Shop delete equipment
// ---------------------------------------------------------------------------

describe('shop delete equipment', () => {
  it('SHOP_DELETE_EQUIPMENT removes item and emits effects', () => {
    const weapon = makeCard({
      id: 'w1', type: 'weapon' as const, name: 'Iron Sword', value: 5,
      durability: 3, maxDurability: 3,
    });
    const state = makeState({
      equipmentSlot1: weapon as any,
    });

    const result = drain(state, [
      { type: 'SHOP_DELETE_EQUIPMENT', slotId: 'equipmentSlot1' },
    ]);

    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.sideEffects.some(e => e.event === 'equipment:disposed')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Multiple turn resets
// ---------------------------------------------------------------------------

describe('turn state management', () => {
  it('RESET_TURN_STATE → START_TURN both clear combat flags', () => {
    const state = makeState({
      berserkerSlotUsed: { equipmentSlot1: true } as any,
      extraAttackCharges: 5,
      doubleNextMagic: true,
    });

    const resetResult = drain(state, [
      { type: 'RESET_TURN_STATE' },
    ]);

    expect(resetResult.state.berserkerSlotUsed).toEqual({});
    expect(resetResult.state.extraAttackCharges).toBe(0);
    expect(resetResult.state.doubleNextMagic).toBe(false);

    const startResult = drain(resetResult.state, [
      { type: 'START_TURN' },
    ]);

    expect(startResult.state.phase).toBe('playerInput');
  });
});

// ---------------------------------------------------------------------------
// Side effect accumulation
// ---------------------------------------------------------------------------

describe('side effect accumulation', () => {
  it('accumulates side effects from multiple actions', () => {
    const state = makeState({ hp: 20 });

    const result = drain(state, [
      { type: 'APPLY_DAMAGE', amount: 3, source: 'a' },
      { type: 'HEAL', amount: 1, source: 'b' },
      { type: 'APPLY_DAMAGE', amount: 2, source: 'c' },
    ]);

    const events = result.sideEffects.map(e => e.event);
    expect(events.filter(e => e === 'combat:heroDamaged').length).toBe(2);
    expect(events.filter(e => e === 'combat:heroHealed').length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Event flip — 秘藏宝库
// ---------------------------------------------------------------------------

describe('秘藏宝库 event flip', () => {
  it('RESOLVE_EVENT_CHOICE → COMPLETE_EVENT → APPLY_CARD_FLIP replaces card in activeCards', () => {
    const vaultCard = makeCard({
      id: 'vault-1',
      type: 'event' as const,
      name: '秘藏宝库',
      eventChoices: [
        { text: '翻找黄金', effect: 'gold+20' },
      ],
      flipTarget: {
        toCard: {
          id: 'vault-1-flip',
          type: 'event' as const,
          name: '秘藏宝库（已开启）',
          value: 0,
          eventChoices: [
            { text: '翻阅卷轴', effect: 'drawHeroCards:3' },
          ],
        },
        destination: 'stay' as const,
        message: '秘藏宝库翻转为已开启状态！',
      },
    });

    const state = makeState({
      activeCards: [vaultCard as any, null, null, null, null],
      currentEventCard: vaultCard as any,
      eventModalOpen: true,
    });

    // Dispatch RESOLVE_EVENT_CHOICE
    const resolveResult = reduce(state, {
      type: 'RESOLVE_EVENT_CHOICE',
      choiceId: '0',
      choiceText: '翻找黄金',
      effectTokens: ['gold+20'],
      skipFlip: false,
    } as any);

    // Should have enqueued COMPLETE_EVENT
    expect(resolveResult.enqueuedActions.some(a => a.type === 'COMPLETE_EVENT')).toBe(true);

    // Drain pipeline to process COMPLETE_EVENT → APPLY_CARD_FLIP
    const pipelineResult = drain(resolveResult.state, resolveResult.enqueuedActions);

    // Card should be flipped
    expect(pipelineResult.state.activeCards[0]).not.toBeNull();
    expect(pipelineResult.state.activeCards[0]?.name).toBe('秘藏宝库（已开启）');
    expect(pipelineResult.state.currentEventCard).toBeNull();
    expect(pipelineResult.state.eventModalOpen).toBe(false);

    // Stay flips emit `card:flippedInCell` (in-cell flip animation),
    // not `event:cardTransformed` (which is reserved for non-stay flips).
    expect(pipelineResult.sideEffects.some(e => e.event === 'card:flippedInCell')).toBe(true);
    expect(pipelineResult.sideEffects.some(e => e.event === 'event:cardTransformed')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 药剂遗稿 — every option flips the event in-place (destination: 'stay').
// ---------------------------------------------------------------------------

describe('药剂遗稿 stay-flip', () => {
  it('flipToPaperAsh → COMPLETE_EVENT → APPLY_CARD_FLIP replaces the event card with 纸灰药剂 in-place', () => {
    const manuscript = makeCard({
      id: 'evt-药剂遗稿-1',
      type: 'event' as const,
      name: '药剂遗稿',
      value: 0,
      eventChoices: [
        { text: '翻转成「纸灰药剂」', effect: 'flipToPaperAsh' },
      ],
      // Static placeholder so the "翻转" badge shows; the actual flipTarget is
      // patched onto currentEventCard at choice resolution time.
      flipTarget: {
        toCard: { id: 'evt-药剂遗稿-1-flip-placeholder', type: 'magic' as const, name: '翻转结果由选项决定', value: 0 },
        destination: 'stay' as const,
      },
    });

    const state = makeState({
      activeCards: [null, manuscript as any, null, null, null],
      currentEventCard: manuscript as any,
      eventModalOpen: true,
    });

    const resolveResult = reduce(state, {
      type: 'RESOLVE_EVENT_CHOICE',
      choiceId: '0',
      choiceText: '翻转成「纸灰药剂」',
      effectTokens: ['flipToPaperAsh'],
      skipFlip: false,
    } as any);

    expect(resolveResult.enqueuedActions.some(a => a.type === 'COMPLETE_EVENT')).toBe(true);

    const pipelineResult = drain(resolveResult.state, resolveResult.enqueuedActions);

    // Slot 1 now holds 纸灰药剂; backpack is untouched.
    expect(pipelineResult.state.activeCards[1]?.name).toBe('纸灰药剂');
    expect(pipelineResult.state.activeCards[1]?.type).toBe('potion');
    expect(pipelineResult.state.backpackItems).toHaveLength(0);
    expect(pipelineResult.state.currentEventCard).toBeNull();
    expect(pipelineResult.state.eventModalOpen).toBe(false);

    // Stay flip → in-cell animation, NOT the legacy full-screen overlay.
    expect(pipelineResult.sideEffects.some(e => e.event === 'card:flippedInCell')).toBe(true);
    expect(pipelineResult.sideEffects.some(e => e.event === 'event:cardTransformed')).toBe(false);
  });

  it('external flipper (e.g. 乾坤一翻) on 药剂遗稿 with placeholder flipTarget rolls one of the visible eventChoices instead of flipping into the placeholder', () => {
    // 药剂遗稿 sitting in the active row carries the static placeholder
    // flipTarget (toCard.name === '翻转结果由选项决定'). External flippers like
    // 乾坤一翻 read this directly and enqueue APPLY_CARD_FLIP. Without the
    // random-roll interception in reduceApplyCardFlip we'd replace the slot with
    // the placeholder card itself, which is meaningless.
    const manuscript = makeCard({
      id: 'evt-药剂遗稿-rolled',
      type: 'event' as const,
      name: '药剂遗稿',
      value: 0,
      // Only the 3 visible options after pruneEventChoicesToThree.
      eventChoices: [
        { text: '翻转成「纸灰药剂」', effect: 'flipToPaperAsh' },
        { text: '翻转成「扩容药剂」', effect: 'flipToHandLimitPotion' },
        { text: '翻转成两张「升级卷轴」', effect: 'flipToTwoUpgradeScrolls' },
      ],
      flipTarget: {
        toCard: { id: 'evt-药剂遗稿-rolled-placeholder', type: 'magic' as const, name: '翻转结果由选项决定', value: 0 },
        destination: 'stay' as const,
      },
    });

    const state = makeState({
      activeCards: [null, null, null, manuscript as any, null],
      currentEventCard: null,
      activeCardStacks: {},
    });

    const result = reduce(state, { type: 'APPLY_CARD_FLIP', card: manuscript as any, cellIndex: 3 } as any);

    // Slot now holds one of the 3 rolled outcomes — never the placeholder.
    const placed = result.state.activeCards[3];
    expect(placed).not.toBeNull();
    expect(placed?.name).not.toBe('翻转结果由选项决定');
    const rolledNames = ['纸灰药剂', '扩容药剂', '升级卷轴'];
    expect(rolledNames).toContain(placed!.name);

    // Stay flip → in-cell animation; back-flip card carries the original 药剂遗稿.
    expect(result.sideEffects.some(e => e.event === 'card:flippedInCell')).toBe(true);
    expect((placed as any)._flipBackCard?.name).toBe('药剂遗稿');

    // RNG advanced (interception called pickRandom + nextId).
    expect(result.state.rng).not.toEqual(state.rng);
  });

  it('external flipper rolling flipToTwoUpgradeScrolls pushes a 2nd scroll into activeCardStacks at the same slot', () => {
    // We pin 药剂遗稿 to flipToTwoUpgradeScrolls by setting eventChoices to a
    // single-option pool; pickRandom over a 1-element array always picks index 0.
    const manuscript = makeCard({
      id: 'evt-药剂遗稿-rolled-two-scrolls',
      type: 'event' as const,
      name: '药剂遗稿',
      value: 0,
      eventChoices: [
        { text: '翻转成两张「升级卷轴」', effect: 'flipToTwoUpgradeScrolls' },
      ],
      flipTarget: {
        toCard: { id: 'placeholder', type: 'magic' as const, name: '翻转结果由选项决定', value: 0 },
        destination: 'stay' as const,
      },
    });

    const state = makeState({
      activeCards: [null, manuscript as any, null, null, null],
      activeCardStacks: {},
    });

    const result = reduce(state, { type: 'APPLY_CARD_FLIP', card: manuscript as any, cellIndex: 1 } as any);

    expect(result.state.activeCards[1]?.name).toBe('升级卷轴');
    const stack = result.state.activeCardStacks[1] ?? [];
    expect(stack).toHaveLength(1);
    expect((stack[0] as any).name).toBe('升级卷轴');
    expect((stack[0] as any).id).not.toBe(result.state.activeCards[1]?.id);
  });

  it('player choice path is unaffected: APPLY_CARD_FLIP carries a real (non-placeholder) toCard, so the random-roll branch is skipped', () => {
    // Mirrors the COMPLETE_EVENT path: cardForFlip carries the realized
    // flipTarget patched onto currentEventCard by applySimpleEffect.
    const realToCard = { id: 'real-pa', type: 'potion' as const, name: '纸灰药剂', value: 0, potionEffect: 'perm-spell-damage-2' as any };
    const cardForFlip = makeCard({
      id: 'evt-药剂遗稿-player-path',
      type: 'event' as const,
      name: '药剂遗稿',
      value: 0,
      eventChoices: [
        { text: '翻转成「纸灰药剂」', effect: 'flipToPaperAsh' },
      ],
      flipTarget: {
        toCard: realToCard as any,
        destination: 'stay' as const,
        message: '残页翻转，药香浮现…',
      },
    });

    const state = makeState({
      activeCards: [cardForFlip as any, null, null, null, null],
      activeCardStacks: {},
    });

    const rngBefore = state.rng;
    const result = reduce(state, { type: 'APPLY_CARD_FLIP', card: cardForFlip as any, cellIndex: 0 } as any);

    // Identity-checked toCard placed: the rolled-flip path would have generated a fresh id via nextId.
    expect(result.state.activeCards[0]?.id).toBe('real-pa');
    expect(result.state.activeCards[0]?.name).toBe('纸灰药剂');
    // No random roll → rng untouched
    expect(result.state.rng).toEqual(rngBefore);
  });

  it('flipToTwoUpgradeScrolls leaves the top scroll in the slot and the second scroll stacked beneath', () => {
    const manuscript = makeCard({
      id: 'evt-药剂遗稿-two-scrolls',
      type: 'event' as const,
      name: '药剂遗稿',
      value: 0,
      eventChoices: [
        { text: '翻转成两张「升级卷轴」', effect: 'flipToTwoUpgradeScrolls' },
      ],
      flipTarget: {
        toCard: { id: 'evt-药剂遗稿-two-scrolls-placeholder', type: 'magic' as const, name: '翻转结果由选项决定', value: 0 },
        destination: 'stay' as const,
      },
    });

    const state = makeState({
      activeCards: [null, null, manuscript as any, null, null],
      currentEventCard: manuscript as any,
      activeCardStacks: {},
      eventModalOpen: true,
    });

    const resolveResult = reduce(state, {
      type: 'RESOLVE_EVENT_CHOICE',
      choiceId: '0',
      choiceText: '翻转成两张「升级卷轴」',
      effectTokens: ['flipToTwoUpgradeScrolls'],
      skipFlip: false,
    } as any);

    const pipelineResult = drain(resolveResult.state, resolveResult.enqueuedActions);

    // Top of slot 2 → first 升级卷轴
    expect(pipelineResult.state.activeCards[2]?.name).toBe('升级卷轴');
    // Second scroll waiting beneath in the active stack
    const stack = pipelineResult.state.activeCardStacks[2] ?? [];
    expect(stack).toHaveLength(1);
    expect((stack[0] as any).name).toBe('升级卷轴');
    expect((stack[0] as any).id).not.toBe(pipelineResult.state.activeCards[2]?.id);
    // Backpack untouched
    expect(pipelineResult.state.backpackItems).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 永恒铭刻药 (grant-perm-2 potion) interactive flow
// ---------------------------------------------------------------------------

describe('永恒铭刻药 (grant-perm-2 potion) interactive flow', () => {
  it('opens permGrantModal and defers finalize until RESOLVE_PERM_GRANT applies recycleDelay', () => {
    const potion = {
      id: 'p-eternal-1',
      type: 'potion' as const,
      name: '永恒铭刻药',
      value: 6,
      potionEffect: 'grant-perm-2' as any,
      description: '选择一张没有 Perm 属性的手牌，赋予 Perm 3',
    };
    const blade = makeCard({ id: 'w-resonance', type: 'weapon' as const, name: '共鸣之刃', value: 4 });
    const filler = makeCard({ id: 'w-filler', type: 'weapon' as const, name: 'Filler', value: 2 });

    const state = makeState({
      phase: 'playerInput' as any,
      handCards: [potion, blade, filler] as any,
      activeCards: [null, null, null, null, null] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [] },
    });

    // Step 1: play the potion → must open the modal and keep pendingPotionAction
    const afterPlay = drain(state, [
      { type: 'PLAY_CARD', cardId: 'p-eternal-1' },
    ]);

    expect(afterPlay.state.permGrantModal).not.toBeNull();
    expect(afterPlay.state.permGrantModal?.sourceType).toBe('potion');
    expect(afterPlay.state.permGrantModal?.sourceCardId).toBe('p-eternal-1');
    expect((afterPlay.state.pendingPotionAction as any)?.card?.id).toBe('p-eternal-1');

    // Step 2: player picks the blade in the modal. RESOLVE_PERM_GRANT is a
    // direct player input that the engine reduces before draining (matching
    // GameEngine.dispatch in client/src/game-core/index.ts), so we mirror
    // that pattern here.
    const resolveResult = reduce(afterPlay.state, { type: 'RESOLVE_PERM_GRANT', targetCardId: 'w-resonance' } as any);
    const afterResolve = drain(resolveResult.state, resolveResult.enqueuedActions);

    const updatedBlade = afterResolve.state.handCards.find((c: any) => c.id === 'w-resonance') as any;
    expect(updatedBlade).toBeDefined();
    expect(updatedBlade.recycleDelay).toBe(3);
    expect(afterResolve.state.permGrantModal).toBeNull();
    expect(afterResolve.state.pendingPotionAction).toBeNull();
  });
});

describe('风暴箭雨 pipeline drain', () => {
  it('RESOLVE_MAGIC enqueued DEAL_DAMAGE_TO_MONSTER actions should drain in playerInput phase', () => {
    const stormCard = makeCard({
      id: 'storm-1',
      type: 'magic' as const,
      name: '风暴箭雨',
      value: 0,
      magicType: 'instant',
      magicEffect: '对激活行的每个怪物造成 3 点伤害。',
    });

    const state = makeState({
      phase: 'playerInput' as any,
      activeCards: [
        makeMonster({ id: 'm1', name: 'Goblin1', hp: 10, maxHp: 10, fury: 1, currentLayer: 1 }),
        makeMonster({ id: 'm2', name: 'Goblin2', hp: 10, maxHp: 10, fury: 1, currentLayer: 1 }),
        null, null, null,
      ] as any,
    });

    const result = reduce(state, {
      type: 'RESOLVE_MAGIC',
      cardId: stormCard.id,
      card: stormCard,
    } as any);

    // Should have enqueued DEAL_DAMAGE_TO_MONSTER for each monster + FINALIZE_MAGIC_CARD
    const dmgActions = result.enqueuedActions.filter(a => a.type === 'DEAL_DAMAGE_TO_MONSTER');
    expect(dmgActions.length).toBe(2);
    expect(result.enqueuedActions.some(a => a.type === 'FINALIZE_MAGIC_CARD')).toBe(true);

    // Phase should still be playerInput
    expect(result.state.phase).toBe('playerInput');

    // Drain pipeline — should NOT pause (damage is a follow-up, not user input)
    const pipelineResult = drain(result.state, result.enqueuedActions);

    expect(pipelineResult.pausedForInput).toBe(false);
    expect(pipelineResult.queue.length).toBe(0);
    expect(pipelineResult.stepsProcessed).toBeGreaterThanOrEqual(3);
  });
});
