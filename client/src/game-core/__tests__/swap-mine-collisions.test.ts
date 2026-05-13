/**
 * Mine collisions on position-changing effects.
 *
 * 用户需求：「所有卡牌效果的换位置（乾坤挪移、维度扭曲、命运挪移、fate-swap），
 * 和 monster 效果的换位置（Wraith 的遗言）。只要换完后，monster 在地雷之上，
 * 都应该触发地雷」。
 *
 * 每条 swap/shuffle 路径，跑两个矩阵：
 *   - 正向：mine 原本在 slot i，monster 落到 slot i → 触发地雷（5 + globalBonus
 *     纯伤、地雷进坟场、怪物激怒、emit combat:mineTriggered）
 *   - 反向（净流退化）：偶数次 echo / mine ↔ empty / mine ↔ non-monster 等
 *     不会让 monster 落到地雷格 → 不触发
 *
 * 6 条路径覆盖：
 *   1. 乾坤挪移 (STARTER_CARD_IDS.dungeonSwap, auto leftmost-2)
 *   2. 命运挪移 (crossroads-left-swap, auto leftmost↔rightmost)
 *   3. 乾坤挪移 L2 (dungeon-swap-select, player picks 2nd card)
 *   4. 维度扭曲 (dungeon-preview-swap, active↔preview)
 *   5. 命运扭曲 / fate-swap (active↔deck)
 *   6. Wraith haunt (active row shuffle on monster death)
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { GameEngine } from '../index';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import { initialCombatState } from '../constants';
import { STARTER_CARD_IDS } from '../deck';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots } from '@/components/game-board/types';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as unknown as ActiveRowSlots,
    combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero' } as any,
    phase: 'playerInput' as any,
    rng: createRng(42),
    ...overrides,
  };
}

function activeRowOf(...cards: (GameCardData | null)[]): ActiveRowSlots {
  const row: (GameCardData | null)[] = [null, null, null, null, null];
  for (let i = 0; i < cards.length && i < 5; i++) row[i] = cards[i];
  return row as unknown as ActiveRowSlots;
}

function makeMine(id = 'mine-test', mineDamage = 5): GameCardData {
  return {
    id,
    type: 'building',
    name: '地雷',
    value: 0,
    image: '',
    isGhost: true,
    mineDamage,
    hp: 1,
    maxHp: 1,
  } as GameCardData;
}

function makeMonster(id: string, hp = 30, attack = 1): GameCardData {
  return {
    id,
    type: 'monster',
    name: `M${id}`,
    value: hp,
    image: '',
    hp,
    maxHp: hp,
    attack,
    currentLayer: 1,
    hpLayers: 1,
    fury: 1,
  } as GameCardData;
}

function makeEvent(id: string): GameCardData {
  return {
    id,
    type: 'event' as any,
    name: `Evt-${id}`,
    value: 0,
    image: '',
  } as GameCardData;
}

function makeStarterDungeonSwapCard(): GameCardData {
  return {
    id: STARTER_CARD_IDS.dungeonSwap,
    type: 'magic',
    name: '乾坤挪移',
    value: 0,
    image: '',
    magicType: 'permanent',
    description: 'test',
    recycleDelay: 2,
  } as GameCardData;
}

function makeCrossroadsCard(): GameCardData {
  return {
    id: 'crossroads-1',
    type: 'magic',
    name: '命运挪移',
    value: 0,
    image: '',
    magicType: 'instant',
    magicEffect: 'crossroads-left-swap',
    description: 'test',
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// 1. 乾坤挪移 (auto leftmost-2)
// ---------------------------------------------------------------------------

describe('乾坤挪移 (auto leftmost-2) — 地雷碰撞', () => {
  it('地雷在 slot 0、monster 在 slot 1 → swap → monster 落到 slot 0 mine 格 → 触发', () => {
    const card = makeStarterDungeonSwapCard();
    const mine = makeMine('mine-A', 5);
    const monster = makeMonster('m-A', 30, 1);

    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(mine, monster, null, null, null),
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    const after = result.state.activeCards as (GameCardData | null)[];
    // Monster ended at slot 0（地雷的原位）→ 触发后 monster 减 5
    expect(after[0]?.id).toBe('m-A');
    expect((after[0] as any)?.hp).toBe(25);
    // 地雷被消耗，已不在 active row（不会跑到 slot 1 留着）
    expect(after[1]).toBeNull();
    // 地雷进坟场
    expect(result.state.discardedCards.some(c => c.id === 'mine-A')).toBe(true);
    // 怪物已激怒（per monster-damage-engagement.mdc）
    expect(result.state.combatState.engagedMonsterIds).toContain('m-A');
  });

  it('两张 mine 互换（没有 monster 落地）→ 不触发', () => {
    const card = makeStarterDungeonSwapCard();
    const mine1 = makeMine('mine-B', 5);
    const mine2 = makeMine('mine-C', 5);

    // STARTER_CARD_IDS.dungeonSwap 找前两个非空 slot 互换：mine1 ↔ mine2
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(mine1, mine2, null, null, null),
    });
    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);
    const after = result.state.activeCards as (GameCardData | null)[];
    // 两张地雷互换位置 → 没有 monster 落地 → 没有触发
    expect(after[0]?.id).toBe('mine-C');
    expect(after[1]?.id).toBe('mine-B');
    expect(result.state.discardedCards.some(c => c.id === 'mine-B')).toBe(false);
    expect(result.state.discardedCards.some(c => c.id === 'mine-C')).toBe(false);
  });

  it('地雷 ↔ event card (不是怪物) → 不触发', () => {
    const card = makeStarterDungeonSwapCard();
    const mine = makeMine('mine-D', 5);
    const event = makeEvent('evt-D');

    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(mine, event, null, null, null),
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    const after = result.state.activeCards as (GameCardData | null)[];
    // event 落到 slot 0 — 不是怪物 → 不触发
    expect(after[0]?.id).toBe('evt-D');
    expect(after[1]?.id).toBe('mine-D');
    expect(result.state.discardedCards.some(c => c.id === 'mine-D')).toBe(false);
  });

  it('地雷伤害 + globalMineDamageBonus 一起算', () => {
    const card = makeStarterDungeonSwapCard();
    const mine = makeMine('mine-E', 5);
    const monster = makeMonster('m-E', 30, 1);

    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(mine, monster, null, null, null),
      globalMineDamageBonus: 4,
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    const after = result.state.activeCards as (GameCardData | null)[];
    // 5 (mineDamage) + 4 (globalBonus) = 9 伤
    expect((after[0] as any)?.hp).toBe(21);
  });
});

// ---------------------------------------------------------------------------
// 2. 命运挪移 (crossroads-left-swap, auto leftmost↔rightmost)
// ---------------------------------------------------------------------------

describe('命运挪移 (crossroads-left-swap, auto leftmost↔rightmost) — 地雷碰撞', () => {
  it('地雷在 slot 0、monster 在 slot 4 → swap → monster 落到 slot 0 → 触发', () => {
    const card = makeCrossroadsCard();
    const mine = makeMine('mine-CR-A', 5);
    const monster = makeMonster('m-CR-A', 30, 1);

    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(mine, null, null, null, monster),
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    const after = result.state.activeCards as (GameCardData | null)[];
    expect(after[0]?.id).toBe('m-CR-A');
    expect((after[0] as any)?.hp).toBe(25);
    expect(after[4]).toBeNull();
    expect(result.state.discardedCards.some(c => c.id === 'mine-CR-A')).toBe(true);
    expect(result.state.combatState.engagedMonsterIds).toContain('m-CR-A');
  });

  it('monster 在 slot 0、地雷在 slot 4 → swap → monster 落到 slot 4 mine 格 → 触发', () => {
    const card = makeCrossroadsCard();
    const monster = makeMonster('m-CR-B', 30, 1);
    const mine = makeMine('mine-CR-B', 5);

    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(monster, null, null, null, mine),
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    const after = result.state.activeCards as (GameCardData | null)[];
    expect(after[4]?.id).toBe('m-CR-B');
    expect((after[4] as any)?.hp).toBe(25);
    expect(after[0]).toBeNull();
    expect(result.state.discardedCards.some(c => c.id === 'mine-CR-B')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. 乾坤挪移 L2 (dungeon-swap-select, player picks 2nd card)
// ---------------------------------------------------------------------------

describe('乾坤挪移 L2 (dungeon-swap-select, player-pick) — 地雷碰撞', () => {
  it('mine 在 leftmost slot 0、monster 在玩家选的 slot 2 → swap → monster 到 slot 0 → 触发', () => {
    const mine = makeMine('mine-DSS-A', 5);
    const monster = makeMonster('m-DSS-A', 30, 1);
    const playedCard: GameCardData = {
      id: 'dss-card',
      type: 'magic',
      name: '乾坤挪移 L2',
      value: 0,
      image: '',
      magicType: 'permanent',
      upgradeLevel: 2,
    } as GameCardData;

    const state = makeState({
      activeCards: activeRowOf(mine, null, monster, null, null),
      pendingMagicAction: {
        card: playedCard,
        effect: 'dungeon-swap-select',
        step: 'dungeon-select',
        prompt: 'pick',
        leftIdx: 0,
      } as any,
    });

    const result = drain(state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'm-DSS-A', targetIndex: 2 } as GameAction,
    ]);

    const after = result.state.activeCards as (GameCardData | null)[];
    expect(after[0]?.id).toBe('m-DSS-A');
    expect((after[0] as any)?.hp).toBe(25);
    expect(after[2]).toBeNull();
    expect(result.state.discardedCards.some(c => c.id === 'mine-DSS-A')).toBe(true);
    expect(result.state.combatState.engagedMonsterIds).toContain('m-DSS-A');
  });

  it('mine 在玩家选的 slot 2、monster 在 leftmost slot 0 → swap → monster 落 slot 2 mine 格 → 触发', () => {
    const monster = makeMonster('m-DSS-B', 30, 1);
    const mine = makeMine('mine-DSS-B', 5);
    const playedCard: GameCardData = {
      id: 'dss-card-B',
      type: 'magic',
      name: '乾坤挪移 L2',
      value: 0,
      image: '',
      magicType: 'permanent',
      upgradeLevel: 2,
    } as GameCardData;

    const state = makeState({
      activeCards: activeRowOf(monster, null, mine, null, null),
      pendingMagicAction: {
        card: playedCard,
        effect: 'dungeon-swap-select',
        step: 'dungeon-select',
        prompt: 'pick',
        leftIdx: 0,
      } as any,
    });

    const result = drain(state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'mine-DSS-B', targetIndex: 2 } as GameAction,
    ]);

    const after = result.state.activeCards as (GameCardData | null)[];
    expect(after[2]?.id).toBe('m-DSS-B');
    expect((after[2] as any)?.hp).toBe(25);
    expect(after[0]).toBeNull();
    expect(result.state.discardedCards.some(c => c.id === 'mine-DSS-B')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. 维度扭曲 (dungeon-preview-swap, active↔preview)
// ---------------------------------------------------------------------------

describe('维度扭曲 (dungeon-preview-swap, active↔preview) — 地雷碰撞', () => {
  it('mine 在 active[2]、preview[2] 是 monster → swap → monster 落 active[2] mine 格 → 触发，且 preview[2] 不应该残留地雷', () => {
    const mine = makeMine('mine-PV-A', 5);
    const previewMonster = makeMonster('m-PV-A', 30, 1);
    const playedCard: GameCardData = {
      id: 'pv-card',
      type: 'magic',
      name: '维度扭曲',
      value: 0,
      image: '',
      magicType: 'permanent',
    } as GameCardData;

    const state = makeState({
      activeCards: activeRowOf(null, null, mine, null, null),
      previewCards: [null, null, previewMonster, null, null] as unknown as ActiveRowSlots,
      pendingMagicAction: {
        card: playedCard,
        effect: 'dungeon-preview-swap',
        step: 'dungeon-select',
        prompt: 'pick',
      } as any,
    });

    const result = drain(state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'mine-PV-A', targetIndex: 2 } as GameAction,
    ]);

    const after = result.state.activeCards as (GameCardData | null)[];
    const preview = result.state.previewCards as (GameCardData | null)[];

    expect(after[2]?.id).toBe('m-PV-A');
    expect((after[2] as any)?.hp).toBe(25);
    // mine 被触发 → 进坟场，不留在 preview 里
    expect(preview[2]).toBeNull();
    expect(result.state.discardedCards.some(c => c.id === 'mine-PV-A')).toBe(true);
    expect(result.state.combatState.engagedMonsterIds).toContain('m-PV-A');
  });

  it('mine 在 active、preview 是 event (非怪物) → swap → 不触发，地雷正常进 preview', () => {
    const mine = makeMine('mine-PV-B', 5);
    const previewEvent = makeEvent('evt-PV-B');
    const playedCard: GameCardData = {
      id: 'pv-card-B',
      type: 'magic',
      name: '维度扭曲',
      value: 0,
      image: '',
      magicType: 'permanent',
    } as GameCardData;

    const state = makeState({
      activeCards: activeRowOf(null, null, mine, null, null),
      previewCards: [null, null, previewEvent, null, null] as unknown as ActiveRowSlots,
      pendingMagicAction: {
        card: playedCard,
        effect: 'dungeon-preview-swap',
        step: 'dungeon-select',
        prompt: 'pick',
      } as any,
    });

    const result = drain(state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'mine-PV-B', targetIndex: 2 } as GameAction,
    ]);

    const after = result.state.activeCards as (GameCardData | null)[];
    const preview = result.state.previewCards as (GameCardData | null)[];

    // event 落到 active[2] — 不是怪物 → 不触发
    expect(after[2]?.id).toBe('evt-PV-B');
    expect(preview[2]?.id).toBe('mine-PV-B');
    expect(result.state.discardedCards.some(c => c.id === 'mine-PV-B')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. fate-swap (active↔deck)
// ---------------------------------------------------------------------------

describe('fate-swap (active↔deck) — 地雷碰撞', () => {
  it('mine 在 active[1]、牌堆顶有 monster → swap → monster 落 active[1] mine 格 → 触发，且 mine 不应进牌堆', () => {
    const mine = makeMine('mine-FS-A', 5);
    const deckMonster = makeMonster('m-FS-A', 30, 1);
    const playedCard: GameCardData = {
      id: 'fs-card',
      type: 'magic',
      name: '命运挪移（深）',
      value: 0,
      image: '',
      magicType: 'permanent',
    } as GameCardData;

    const state = makeState({
      activeCards: activeRowOf(null, mine, null, null, null),
      remainingDeck: [deckMonster] as any,
      pendingMagicAction: {
        card: playedCard,
        effect: 'fate-swap',
        step: 'dungeon-select',
        prompt: 'pick',
        deckDepth: 5,
      } as any,
    });

    const result = drain(state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'mine-FS-A', targetIndex: 1 } as GameAction,
    ]);

    const after = result.state.activeCards as (GameCardData | null)[];
    const deck = result.state.remainingDeck as GameCardData[];

    expect(after[1]?.id).toBe('m-FS-A');
    expect((after[1] as any)?.hp).toBe(25);
    // mine 被消耗 → 不留在牌堆
    expect(deck.some(c => c.id === 'mine-FS-A')).toBe(false);
    // mine 进坟场
    expect(result.state.discardedCards.some(c => c.id === 'mine-FS-A')).toBe(true);
    expect(result.state.combatState.engagedMonsterIds).toContain('m-FS-A');
  });

  it('mine 在 active[1]、牌堆顶是 event → swap → event 不是怪物 → 不触发，mine 正常进牌堆', () => {
    const mine = makeMine('mine-FS-B', 5);
    const deckEvent = makeEvent('evt-FS-B');
    const playedCard: GameCardData = {
      id: 'fs-card-B',
      type: 'magic',
      name: '命运挪移（深）',
      value: 0,
      image: '',
      magicType: 'permanent',
    } as GameCardData;

    const state = makeState({
      activeCards: activeRowOf(null, mine, null, null, null),
      remainingDeck: [deckEvent] as any,
      pendingMagicAction: {
        card: playedCard,
        effect: 'fate-swap',
        step: 'dungeon-select',
        prompt: 'pick',
        deckDepth: 5,
      } as any,
    });

    const result = drain(state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'mine-FS-B', targetIndex: 1 } as GameAction,
    ]);

    const after = result.state.activeCards as (GameCardData | null)[];
    const deck = result.state.remainingDeck as GameCardData[];

    expect(after[1]?.id).toBe('evt-FS-B');
    // mine 没触发 → 留在牌堆里
    expect(deck.some(c => c.id === 'mine-FS-B')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'mine-FS-B')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Wraith haunt (active row shuffle on monster death)
// ---------------------------------------------------------------------------

describe('Wraith haunt — 地雷碰撞（active row shuffle）', () => {
  it('Wraith 死亡触发 wraith-haunt-2 shuffle → 怪物落到地雷格 → 触发地雷', () => {
    // Setup: Wraith at slot 0, mine at slot 1, monster at slot 2.
    // Wraith dies → shuffle slot 1 + slot 2 (excluding wraith). Possible
    // outcomes: (mine, monster), (monster, mine). With seeded RNG we ensure
    // either swap or no-swap; ensure the final result is checked dynamically.
    const wraith = makeMonster('m-wraith-A', 1, 1);
    (wraith as any).lastWords = 'wraith-haunt-2';
    const mine = makeMine('mine-WH-A', 5);
    const otherMonster = makeMonster('m-other-A', 30, 1);

    // 用一颗能让 shuffle 实际换位的 seed。如果 seed 让 shuffle 返回原序，
    // applyWraithHauntEffect 内部会再 shuffle 一次保证至少换一次
    // (occupiedCards.length >= 2 && sameOrder check)。
    const state = makeState({
      activeCards: activeRowOf(wraith, mine, otherMonster, null, null),
      rng: createRng(7),
    });

    const engine = new GameEngine(state);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });
    let mineEvent: any = null;
    engine.on('combat:mineTriggered', payload => { mineEvent = payload; });

    engine.dispatch({ type: 'EXECUTE_LAST_WORDS', monsterId: 'm-wraith-A', lastWords: 'wraith-haunt-2' });

    const finalState = engine.getState();
    const after = finalState.activeCards as (GameCardData | null)[];

    // 不变量：shuffle 至少换了一次（per applyWraithHauntEffect 的 sameOrder 保护）。
    // 因此 mine 和 otherMonster 必然换位 → otherMonster 落 slot 1（地雷格）→ 触发。
    expect(after[1]?.id).toBe('m-other-A');
    expect((after[1] as any)?.hp).toBe(25);
    // wraith-haunt 给同行怪物 +2 攻击；同时已被地雷打过一次伤
    expect((after[1] as any)?.attack).toBeGreaterThanOrEqual(3);
    // mine 被消耗（被打过的，从坟场再找）
    expect(finalState.discardedCards.some(c => c.id === 'mine-WH-A')).toBe(true);
    // monster 已激怒
    expect(finalState.combatState.engagedMonsterIds).toContain('m-other-A');
    // emit 了 combat:mineTriggered
    expect(mineEvent).not.toBeNull();
    expect(mineEvent?.mineId).toBe('mine-WH-A');
    expect(mineEvent?.monsterId).toBe('m-other-A');
    expect(mineEvent?.damage).toBe(5);
  });

  it('Wraith haunt：地雷 + 多个怪物 + globalMineDamageBonus 一起算', () => {
    const wraith = makeMonster('m-wraith-B', 1, 1);
    (wraith as any).lastWords = 'wraith-haunt-2';
    const mine = makeMine('mine-WH-B', 5);
    const monster = makeMonster('m-other-B', 50, 1);

    const state = makeState({
      activeCards: activeRowOf(wraith, mine, monster, null, null),
      globalMineDamageBonus: 3, // 5 + 3 = 8 伤
      rng: createRng(7),
    });

    const engine = new GameEngine(state);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });
    let mineEvent: any = null;
    engine.on('combat:mineTriggered', payload => { mineEvent = payload; });

    engine.dispatch({ type: 'EXECUTE_LAST_WORDS', monsterId: 'm-wraith-B', lastWords: 'wraith-haunt-2' });

    const finalState = engine.getState();
    expect(mineEvent?.damage).toBe(8);
    // shuffle 必然让 monster 落 slot 1（mine 原位）
    const after = finalState.activeCards as (GameCardData | null)[];
    expect(after[1]?.id).toBe('m-other-B');
    expect((after[1] as any)?.hp).toBe(42); // 50 - 8
  });

  it('Wraith haunt：场上没有其它怪物 → mine 不被触发（即使 mine 因 shuffle 移动）', () => {
    // 只有一只 wraith + 一个地雷。wraith 死亡 → shuffle 只剩 mine（occupiedIndices 长度 1）
    // → applyWraithHauntEffect 不实际换位（occupiedCards.length 1）→ mine 不动 → 没碰撞
    const wraith = makeMonster('m-wraith-C', 1, 1);
    (wraith as any).lastWords = 'wraith-haunt-2';
    const mine = makeMine('mine-WH-C', 5);

    const state = makeState({
      activeCards: activeRowOf(wraith, mine, null, null, null),
      rng: createRng(7),
    });

    const engine = new GameEngine(state);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });
    let mineEvent: any = null;
    engine.on('combat:mineTriggered', payload => { mineEvent = payload; });

    engine.dispatch({ type: 'EXECUTE_LAST_WORDS', monsterId: 'm-wraith-C', lastWords: 'wraith-haunt-2' });

    const finalState = engine.getState();
    // mine 没被触发
    expect(mineEvent).toBeNull();
    expect(finalState.discardedCards.some(c => c.id === 'mine-WH-C')).toBe(false);
    // mine 仍在 active[1]（或被 shuffle 到 slot 0，反正没消失）
    const mineSomewhere = (finalState.activeCards as (GameCardData | null)[]).some(c => c?.id === 'mine-WH-C');
    expect(mineSomewhere).toBe(true);
  });

  // Regression: User-reported bug ("wraith 缠绕技能，也应该可以换 幽灵建筑 的位置")
  //
  // Repro scenario: wraith + 1 monster + 1 mine-on-top-of-mine stack.
  // With seed 13, the historical single-retry sameOrder check returned identity
  // both times → activeCards completely unchanged → 玩家看到「缠绕触发了但
  // monster 和 mine 的位置完全没动」。
  //
  // Fixed by changing applyWraithHauntEffect to loop until non-identity
  // (capped at MAX_SHUFFLE_RETRIES). With the fix, seed 13 now produces a
  // genuine swap on the second attempt.
  it('REGRESSION: wraith + monster + (mine over mine stack), seed 13 → 必须换位（之前 seed 13 会卡在 identity）', () => {
    const wraith = makeMonster('m-wraith-seed13', 1, 1);
    (wraith as any).lastWords = 'wraith-haunt-2';
    const monster = makeMonster('m-other-seed13', 50, 1);
    const topMine = makeMine('mine-top-seed13', 5);
    const bottomMine = makeMine('mine-bot-seed13', 5);

    const state = makeState({
      activeCards: activeRowOf(wraith, monster, topMine, null, null),
      activeCardStacks: { 2: [bottomMine] } as any,
      rng: createRng(13),
    });

    const engine = new GameEngine(state);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });

    engine.dispatch({ type: 'EXECUTE_LAST_WORDS', monsterId: 'm-wraith-seed13', lastWords: 'wraith-haunt-2' });

    const finalState = engine.getState();
    const after = finalState.activeCards as (GameCardData | null)[];

    // 不变量：monster 与 topMine 必然换位（之前 seed 13 会停留在原位）。
    // Monster 落到 slot 2（mine 原位）→ 触发 mine collision → topMine 被消耗
    // → slot 1 变 null（topMine 在 shuffled 里所在的位置）。
    expect(after[2]?.id).toBe('m-other-seed13');
    expect(after[1]).toBeNull();
    // 底层 bottomMine 留在 column 2 的 stack 里（swap 只动顶层卡，跟
    // 命运挪移 / 乾坤挪移 的设计保持一致）。
    expect((finalState.activeCardStacks as any)?.[2]?.[0]?.id).toBe('mine-bot-seed13');
    // topMine 因为 monster 落到它原位而被触发 → 进坟场
    expect(finalState.discardedCards.some(c => c.id === 'mine-top-seed13')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. 综合：多个地雷 + 多个怪物 swap → 多次触发
// ---------------------------------------------------------------------------

describe('多地雷 + 多怪物 综合 — 命运挪移', () => {
  it('mine 在 slot 0、mine 在 slot 4、中间 monster → leftmost↔rightmost swap 不让 monster 落地雷格 → 不触发', () => {
    const card = makeCrossroadsCard();
    const mineLeft = makeMine('mine-MULTI-L', 5);
    const monsterMid = makeMonster('m-MULTI', 30, 1);
    const mineRight = makeMine('mine-MULTI-R', 5);

    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(mineLeft, null, monsterMid, null, mineRight),
    });

    const result = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
    ]);

    const after = result.state.activeCards as (GameCardData | null)[];
    // leftmost(slot 0 mine) ↔ rightmost(slot 4 mine) → 两个 mine 互换位置
    // monster 没动，没人落到地雷格 → 不触发
    expect(after[2]?.id).toBe('m-MULTI');
    expect(after[0]?.id).toBe('mine-MULTI-R');
    expect(after[4]?.id).toBe('mine-MULTI-L');
    expect(result.state.discardedCards.some(c => c.id === 'mine-MULTI-L')).toBe(false);
    expect(result.state.discardedCards.some(c => c.id === 'mine-MULTI-R')).toBe(false);
  });
});
