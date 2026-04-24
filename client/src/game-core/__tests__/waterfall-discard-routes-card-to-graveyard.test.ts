/**
 * Regression: cards/equipment pushed off the dungeon by waterfall must land
 * in `discardedCards` (or recycle bag) — even when the game is in the normal
 * `phase: 'playerInput'` state.
 *
 * Bug history: 血咒仪式 (`waterfallEffect: { type: 'boostRowMonsterAttack' }`)
 * was pushed out by waterfall, the +5 monster attack effect fired correctly,
 * but the event card itself never reached `discardedCards`. The user reported:
 * "血咒仪式 在 waterfall 时候被挤掉了，但是这张牌没去坟场".
 *
 * Root cause: `reduceApplyWaterfallDiscardEffects` calls
 * `sendToGraveyardUnlessFinal()` which enqueues
 * `{ type: 'DISCARD_OWNED_CARD', card, owner: 'dungeon' }`. But
 * `DISCARD_OWNED_CARD` was missing from `isInputContinuation` in
 * `pipeline.ts`. Because the in-game phase is `'playerInput'` (which IS in
 * `INPUT_PHASES`), drain paused on the `DISCARD_OWNED_CARD` and it was
 * stranded in `state.actionQueue` indefinitely. The card disappeared from
 * the preview row but never made it to the graveyard.
 *
 * The same hole affected:
 *   - DISCARD_ALL_HAND (诅咒骰局 destroyAllAmuletsAndDiscardHand)
 *   - DISPOSE_EQUIPMENT_CARD (贪婪 boss destroyAllEquipment)
 *   - REMOVE_PREVIEW_CARD_STACKS, ADD_CARD_TO_HAND (other waterfall enqueues)
 *
 * The pre-existing tests (`amulet-perm-routing-on-destroy.test.ts`,
 * `discard-all-hand.test.ts`) did NOT catch any of these because they use
 * `createInitialGameState()` (default `phase: 'idle'` — not in INPUT_PHASES),
 * so the gating never triggers in those test fixtures.
 *
 * Fix: add `DISCARD_OWNED_CARD`, `DISCARD_ALL_HAND`, `DISPOSE_EQUIPMENT_CARD`,
 * `REMOVE_PREVIEW_CARD_STACKS`, `ADD_CARD_TO_HAND` to `isInputContinuation`
 * in `pipeline.ts`.
 *
 * This test covers four representative waterfall-discard branches under
 * `phase: 'playerInput'` (the real in-game state):
 *   1. boostRowMonsterAttack (血咒仪式 — the actually reported card)
 *   2. no-waterfallEffect (the default `else` branch — same enqueue path)
 *   3. destroyAllAmuletsAndDiscardHand (诅咒骰局 — DISCARD_ALL_HAND path)
 *   4. destroyAllEquipment (贪婪 boss — DISPOSE_EQUIPMENT_CARD path)
 */

import { describe, expect, it } from 'vitest';
import { GameEngine } from '../index';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { EquipmentItem } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe('Waterfall-discarded card lands in graveyard under phase=playerInput', () => {
  it('血咒仪式 (boostRowMonsterAttack) — card itself goes to discardedCards', () => {
    const bloodCurse: GameCardData = {
      id: 'evt-blood-curse-1',
      type: 'event',
      name: '血咒仪式',
      value: 0,
      waterfallEffect: { type: 'boostRowMonsterAttack', amount: 5 },
    } as GameCardData;

    const state = makeState({
      // Real in-game phase when waterfall animation finishes — this is what
      // amulet-perm-routing-on-destroy.test.ts missed by using 'idle'.
      phase: 'playerInput',
      activeCards: [null, null, null, null, null],
      discardedCards: [],
    });

    const engine = new GameEngine(state);

    engine.dispatch({
      type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
      discardCard: bloodCurse,
      nextRemainingDeck: [],
      discardPreviewIndex: 0,
    });

    const finalState = engine.getState();

    // The card must end up in discardedCards.
    expect(finalState.discardedCards.find(c => c.id === 'evt-blood-curse-1')).toBeDefined();

    // And the queue must NOT have a leftover DISCARD_OWNED_CARD or
    // ADD_TO_GRAVEYARD for this card.
    expect(
      finalState.actionQueue.some(a =>
        (a.type === 'DISCARD_OWNED_CARD' && (a as any).card?.id === 'evt-blood-curse-1') ||
        (a.type === 'ADD_TO_GRAVEYARD' && (a as any).card?.id === 'evt-blood-curse-1'),
      ),
    ).toBe(false);
  });

  it('诅咒骰局 (destroyAllAmuletsAndDiscardHand) — Perm 进回收袋；非 Perm 进坟场', () => {
    // Reducer fans out DISCARD_ALL_HAND → N x DISCARD_OWNED_CARD. Both
    // actions need to be in the whitelist for hand cards to actually reach
    // their destinations under playerInput. DISCARD_OWNED_CARD then routes
    // by isRecyclableFromHand: Perm → recycle bag, others → graveyard.
    const cursedDice: GameCardData = {
      id: 'evt-cursed-dice-1',
      type: 'event',
      name: '诅咒骰局',
      value: 0,
      waterfallEffect: { type: 'destroyAllAmuletsAndDiscardHand', amount: 0 },
    } as GameCardData;

    const handPotionPlain: GameCardData = {
      id: 'hand-potion-plain',
      type: 'potion',
      name: '生命药水',
      value: 5,
    } as GameCardData;

    // Perm via 永恒铭刻 (recycleDelay > 0) — goes to recycle bag, NOT graveyard.
    const handPotionPerm: GameCardData = {
      id: 'hand-potion-perm',
      type: 'potion',
      name: '永恒生命药水',
      value: 5,
      recycleDelay: 2,
    } as GameCardData;

    // permStripped 一票否决（凡化咒）：即使带 recycleDelay 也算非 Perm → 进坟场。
    const handPotionStripped: GameCardData = {
      id: 'hand-potion-stripped',
      type: 'potion',
      name: '凡化药水',
      value: 5,
      recycleDelay: 2,
      permStripped: true,
    } as GameCardData;

    const state = makeState({
      phase: 'playerInput',
      handCards: [handPotionPlain, handPotionPerm, handPotionStripped],
      activeCards: [null, null, null, null, null],
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const engine = new GameEngine(state);

    engine.dispatch({
      type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
      discardCard: cursedDice,
      nextRemainingDeck: [],
      discardPreviewIndex: 0,
    });

    const finalState = engine.getState();
    const graveIds = finalState.discardedCards.map(c => c.id);
    const recycleIds = finalState.permanentMagicRecycleBag.map(c => c.id);

    expect(graveIds, '事件卡本身').toContain('evt-cursed-dice-1');
    expect(graveIds, '普通药水进坟场').toContain('hand-potion-plain');
    expect(graveIds, 'Perm 药水不进坟场').not.toContain('hand-potion-perm');
    expect(recycleIds, 'Perm 药水进回收袋').toContain('hand-potion-perm');
    expect(graveIds, 'permStripped 药水进坟场').toContain('hand-potion-stripped');
    expect(recycleIds, 'permStripped 不进回收袋').not.toContain('hand-potion-stripped');
    expect(finalState.handCards).toHaveLength(0);

    expect(
      finalState.actionQueue.some(a =>
        a.type === 'DISCARD_OWNED_CARD' || a.type === 'DISCARD_ALL_HAND',
      ),
    ).toBe(false);
  });

  it('贪婪 boss (destroyAllEquipment) — Perm 装备进回收袋；普通装备进坟场', () => {
    // destroyAllEquipment branch enqueues DISPOSE_EQUIPMENT_CARD per slot.
    // DISPOSE_EQUIPMENT_CARD reducer routes by isPermRecycle: 永恒铭刻
    // (recycleDelay > 0) / native permEquipment → recycle bag, others → graveyard.
    const greedyBoss: GameCardData = {
      id: 'm-greedy-1',
      type: 'monster',
      name: '贪婪',
      monsterType: 'Boss' as any,
      value: 5,
      attack: 5,
      hp: 10,
      maxHp: 10,
      fury: 1,
      hpLayers: 1,
      currentLayer: 1,
      waterfallEffect: { type: 'destroyAllEquipment', amount: 0 },
    } as GameCardData;

    const swordPlain: GameCardData = {
      id: 'eq-sword-plain',
      type: 'weapon',
      name: '铁剑',
      value: 3,
      durability: 2,
      maxDurability: 2,
    } as GameCardData;

    // Perm via 永恒铭刻 (recycleDelay > 0) — goes to recycle bag.
    const shieldPerm: GameCardData = {
      id: 'eq-shield-perm',
      type: 'shield',
      name: '永恒木盾',
      value: 2,
      durability: 2,
      maxDurability: 2,
      recycleDelay: 2,
    } as GameCardData;

    const state = makeState({
      phase: 'playerInput',
      equipmentSlot1: swordPlain as EquipmentItem,
      equipmentSlot2: shieldPerm as EquipmentItem,
      activeCards: [null, null, null, null, null],
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const engine = new GameEngine(state);

    engine.dispatch({
      type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
      discardCard: greedyBoss,
      nextRemainingDeck: [],
      discardPreviewIndex: 0,
    });

    const finalState = engine.getState();
    const graveIds = finalState.discardedCards.map(c => c.id);
    const recycleIds = finalState.permanentMagicRecycleBag.map(c => c.id);

    expect(finalState.equipmentSlot1, 'slot1 cleared').toBeNull();
    expect(finalState.equipmentSlot2, 'slot2 cleared').toBeNull();
    expect(graveIds, '普通武器进坟场').toContain('eq-sword-plain');
    expect(recycleIds, '普通武器不进回收袋').not.toContain('eq-sword-plain');
    expect(recycleIds, 'Perm 盾进回收袋').toContain('eq-shield-perm');
    expect(graveIds, 'Perm 盾不进坟场').not.toContain('eq-shield-perm');
    expect(graveIds, 'boss itself in graveyard').toContain('m-greedy-1');

    expect(
      finalState.actionQueue.some(a =>
        a.type === 'DISPOSE_EQUIPMENT_CARD' || a.type === 'DISCARD_OWNED_CARD',
      ),
    ).toBe(false);
  });

  it('No waterfallEffect — default else branch also routes card to graveyard', () => {
    // Most monsters have no waterfallEffect — they go through the `else`
    // branch at the end of `reduceApplyWaterfallDiscardEffects`, which
    // ALSO enqueues `DISCARD_OWNED_CARD`. Same bug, same fix.
    const goblin: GameCardData = {
      id: 'm-goblin-1',
      type: 'monster',
      name: 'Goblin',
      monsterType: 'Goblin' as any,
      value: 3,
      attack: 3,
      hp: 4,
      maxHp: 4,
      fury: 1,
      hpLayers: 1,
      currentLayer: 1,
    } as GameCardData;

    const state = makeState({
      phase: 'playerInput',
      activeCards: [null, null, null, null, null],
      discardedCards: [],
    });

    const engine = new GameEngine(state);

    engine.dispatch({
      type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
      discardCard: goblin,
      nextRemainingDeck: [],
      discardPreviewIndex: 0,
    });

    const finalState = engine.getState();
    expect(finalState.discardedCards.find(c => c.id === 'm-goblin-1')).toBeDefined();
    expect(
      finalState.actionQueue.some(a =>
        (a.type === 'DISCARD_OWNED_CARD' && (a as any).card?.id === 'm-goblin-1') ||
        (a.type === 'ADD_TO_GRAVEYARD' && (a as any).card?.id === 'm-goblin-1'),
      ),
    ).toBe(false);
  });
});
