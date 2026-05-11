/**
 * 布雷术 (knight:lay-mine) — Perm 2 (升级 → Perm 1) magic.
 *
 * Behavior:
 *   - PLAY_CARD: 在 active row 的随机「空位 OR 含 ghost building 的格子」
 *     生成一个「地雷」幽灵建筑 (type: 'building', isGhost: true,
 *     mineDamage: 5)。空位 + ghost 格合并随机抽（uniform pool）。
 *   - 落到 ghost 格时：原 ghost 沉到 activeCardStacks[col] 末尾，新地雷成
 *     为顶层（stack-on-top 语义）。
 *   - Echo (A 类，allow_same_cell): 生成 echoMultiplier 个地雷；候选池不剔
 *     除已选 slot，所以多枚 echo 可堆在同一 cell。
 *   - 全无可用位置（怪物 / 事件 / 非 ghost 建筑占满）→ fizzle，卡照常进回
 *     收袋。
 *   - Waterfall trigger: 当怪物落到地雷 slot → 触发 5 点纯陷阱伤害（不受
 *     amplify / 法伤加成）+ 怪物激怒（monster-damage-engagement 不变量）+
 *     地雷进坟场（不塞回 activeCardStacks）。
 *   - 非怪物（事件 / 其它建筑）落到地雷 slot 时不触发，按普通 ghost
 *     building 同款被推到下层 stack。
 *   - 升级：lvl 0 recycleDelay = 2；lvl 1 recycleDelay = 1。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { GameEngine } from '../index';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots } from '@/components/game-board/types';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

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

function makeCard(idSuffix = 'lm', extras: Record<string, any> = {}): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic',
    name: '布雷术',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    knightEffect: 'lay-mine',
    recycleDelay: 2,
    maxUpgradeLevel: 1,
  } as GameCardData;
}

function makeMonster(id: string, hp = 50, attack = 0, extras: Record<string, any> = {}): GameCardData {
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
    ...extras,
  } as GameCardData;
}

function activeRowOf(...cards: (GameCardData | null)[]): ActiveRowSlots {
  const row: (GameCardData | null)[] = [null, null, null, null, null];
  for (let i = 0; i < cards.length && i < 5; i++) row[i] = cards[i];
  return row as unknown as ActiveRowSlots;
}

function findMineInActive(state: GameState): { idx: number; mine: GameCardData } | null {
  const cards = state.activeCards as (GameCardData | null)[];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (c && c.type === 'building' && c.name === '地雷' && (c as any).mineDamage) {
      return { idx: i, mine: c };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1) PLAY_CARD — spawns mine at empty slot
// ---------------------------------------------------------------------------

describe('布雷术 PLAY_CARD — 在随机空 slot 生成地雷', () => {
  it('全空 active row → 在某个空 slot 生成 1 个地雷', () => {
    const card = makeCard();
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const found = findMineInActive(result.state);
    expect(found).not.toBeNull();
    expect(found!.mine.isGhost).toBe(true);
    expect((found!.mine as any).mineDamage).toBe(5);
    expect(found!.mine.type).toBe('building');

    // 卡牌从手牌消失
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
  });

  it('部分填了怪物 → 地雷只会生成在剩下的空 slot', () => {
    const card = makeCard();
    const m1 = makeMonster('m1');
    const m2 = makeMonster('m2');
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(m1, m2),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const found = findMineInActive(result.state);
    expect(found).not.toBeNull();
    // 地雷必须落在原本空着的 slot 2-4 中的某个
    expect([2, 3, 4]).toContain(found!.idx);
    // 已有怪物的位置不能被覆盖
    expect((result.state.activeCards as any[])[0]?.id).toBe('m1');
    expect((result.state.activeCards as any[])[1]?.id).toBe('m2');
  });

  it('全 5 slot 都被怪物占了 → fizzle，无地雷生成，卡照样消耗', () => {
    const card = makeCard();
    const monsters = [
      makeMonster('m0'), makeMonster('m1'), makeMonster('m2'),
      makeMonster('m3'), makeMonster('m4'),
    ];
    const state = makeState({
      handCards: [card],
      activeCards: monsters as unknown as ActiveRowSlots,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(findMineInActive(result.state)).toBeNull();
    // 5 只怪物原封不动
    for (let i = 0; i < 5; i++) {
      expect((result.state.activeCards as any[])[i]?.id).toBe(`m${i}`);
    }
    // 卡仍然消耗了（不在手牌）
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
  });

  it('全场被 怪物 + 非 ghost 建筑 占满（无空位也无 ghost）→ fizzle', () => {
    const card = makeCard();
    const nonGhostBuilding = {
      id: 'wall',
      type: 'building' as const,
      name: 'NonGhostWall',
      value: 0,
      image: '',
      isGhost: false, // 关键：非 ghost
      hp: 1,
      maxHp: 1,
    } as GameCardData;
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(
        nonGhostBuilding,
        makeMonster('m1'), makeMonster('m2'), makeMonster('m3'), makeMonster('m4'),
      ),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(findMineInActive(result.state)).toBeNull();
    // 卡仍然消耗了
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
  });

  it('含 ghost building（如增幅祭坛）的 slot 也算可选 → 地雷可能落在该 slot 上面（stack-on-top）', () => {
    const card = makeCard();
    const altar = {
      id: 'altar',
      type: 'building' as const,
      name: '增幅祭坛',
      value: 0,
      image: '',
      isGhost: true,
      hp: 2,
      maxHp: 2,
    } as GameCardData;
    const state = makeState({
      handCards: [card],
      // 4 个 slot 被怪物 + ghost 占了，只有 slot 4 是空；候选池 = [0(ghost), 4(空)]
      activeCards: activeRowOf(altar, makeMonster('m1'), makeMonster('m2'), makeMonster('m3')),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const found = findMineInActive(result.state);
    expect(found).not.toBeNull();
    // 地雷可能在 slot 0（堆在 altar 上）或 slot 4（真空）
    expect([0, 4]).toContain(found!.idx);
    if (found!.idx === 0) {
      // 落在 altar 上：altar 应该被推到下层 stack；activeCards[0] 是新地雷。
      expect(result.state.activeCardStacks[0]).toBeDefined();
      expect(result.state.activeCardStacks[0]?.[0]?.id).toBe('altar');
    } else {
      // 落在 slot 4：altar 仍然在 slot 0 顶层
      expect((result.state.activeCards as any[])[0]?.id).toBe('altar');
      expect(result.state.activeCardStacks[0]).toBeUndefined();
    }
  });

  it('全场只有 ghost building（无空位）→ 地雷必落在 ghost 格上，原 ghost 进 stack', () => {
    const card = makeCard();
    const altar = {
      id: 'altar-only',
      type: 'building' as const,
      name: '增幅祭坛',
      value: 0,
      image: '',
      isGhost: true,
      hp: 2,
      maxHp: 2,
    } as GameCardData;
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(
        altar,
        makeMonster('m1'), makeMonster('m2'), makeMonster('m3'), makeMonster('m4'),
      ),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // 地雷必在 slot 0（唯一候选）
    const found = findMineInActive(result.state);
    expect(found).not.toBeNull();
    expect(found!.idx).toBe(0);
    // altar 沉到下层 stack
    expect(result.state.activeCardStacks[0]?.[0]?.id).toBe('altar-only');
  });
});

// ---------------------------------------------------------------------------
// 2) Mine card structure
// ---------------------------------------------------------------------------

describe('布雷术 — 生成的地雷字段正确', () => {
  it('地雷是 building + isGhost + mineDamage:5', () => {
    const card = makeCard();
    const state = makeState({ handCards: [card], activeCards: activeRowOf() });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const found = findMineInActive(result.state)!;
    expect(found.mine.type).toBe('building');
    expect(found.mine.isGhost).toBe(true);
    expect((found.mine as any).mineDamage).toBe(5);
    expect(found.mine.name).toBe('地雷');
    expect(found.mine.id).toMatch(/^mine-/);
  });
});

// ---------------------------------------------------------------------------
// 3) Waterfall trigger — monster lands on mine
// ---------------------------------------------------------------------------

describe('布雷术 — 怪物落到地雷 slot 触发陷阱伤害', () => {
  function makeMineBuildingFixture(id = 'mine-test'): GameCardData {
    return {
      id,
      type: 'building',
      name: '地雷',
      value: 0,
      image: '',
      isGhost: true,
      mineDamage: 5,
      hp: 1,
      maxHp: 1,
    } as GameCardData;
  }

  it('怪物瀑流落到地雷 slot → 5 点纯伤 + 怪物激怒 + 地雷进坟场', () => {
    const mine = makeMineBuildingFixture('mine-1');
    const monster = makeMonster('m-fall', 30, 3);

    const state = makeState({
      // 地雷已在 slot 2
      activeCards: activeRowOf(null, null, mine, null, null),
      previewCards: [null, null, monster, null, null] as unknown as ActiveRowSlots,
      pendingWaterfallPlan: {
        dropAssignments: [{ previewIndex: 2, card: monster, slotIndex: 2 }],
        resolvedDropCards: [monster],
        dropPreviewIndices: [2],
        dropTargetSlots: [2],
        discardCard: null,
        discardPreviewIndex: null,
        discardDestination: 'graveyard',
        nextPreviewCards: [],
        nextRemainingDeck: [],
        newPreviewStacks: {},
        shouldDeclareVictory: false,
        stuckFinalMonsters: [],
        rng: createRng(1),
      } as any,
    });

    const engine = new GameEngine(state);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });

    let mineTriggeredEvent: any = null;
    engine.on('combat:mineTriggered', (payload) => {
      mineTriggeredEvent = payload;
    });

    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });

    const finalState = engine.getState();

    // (1) 怪物在 slot 2，HP 减少 5
    const monsterInSlot = (finalState.activeCards as any[])[2];
    expect(monsterInSlot?.id).toBe('m-fall');
    expect(monsterInSlot?.hp).toBe(25);

    // (2) 怪物已激怒
    expect(finalState.combatState.engagedMonsterIds).toContain('m-fall');

    // (3) 地雷进坟场，不在 activeCardStacks
    expect(finalState.discardedCards.some(c => c.id === 'mine-1')).toBe(true);
    expect(finalState.activeCardStacks[2]).toBeUndefined();

    // (4) combat:mineTriggered 副作用发出
    expect(mineTriggeredEvent).not.toBeNull();
    expect(mineTriggeredEvent.slotIdx).toBe(2);
    expect(mineTriggeredEvent.monsterId).toBe('m-fall');
    expect(mineTriggeredEvent.damage).toBe(5);
    expect(mineTriggeredEvent.mineId).toBe('mine-1');
  });

  it('地雷 5 伤足以击杀怪物 → 地雷进坟场；怪物走标准 MONSTER_DEFEATED 流程（hp ≤ 0 或离场）', () => {
    const mine = makeMineBuildingFixture('mine-kill');
    const weakMonster = makeMonster('m-weak', 4, 1); // hp 4 < damage 5

    const state = makeState({
      activeCards: activeRowOf(null, null, mine, null, null),
      previewCards: [null, null, weakMonster, null, null] as unknown as ActiveRowSlots,
      pendingWaterfallPlan: {
        dropAssignments: [{ previewIndex: 2, card: weakMonster, slotIndex: 2 }],
        resolvedDropCards: [weakMonster],
        dropPreviewIndices: [2],
        dropTargetSlots: [2],
        discardCard: null,
        discardPreviewIndex: null,
        discardDestination: 'graveyard',
        nextPreviewCards: [],
        nextRemainingDeck: [],
        newPreviewStacks: {},
        shouldDeclareVictory: false,
        stuckFinalMonsters: [],
        rng: createRng(1),
      } as any,
    });

    const engine = new GameEngine(state);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });

    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });

    const finalState = engine.getState();
    // 地雷进坟场
    expect(finalState.discardedCards.some(c => c.id === 'mine-kill')).toBe(true);
    // 怪物已被打残（hp ≤ 0）—— 后续 MONSTER_DEFEATED 流程会进 reward queue / graveyard，
    // 此处不深入断言进入 discardedCards 那条路径（它依赖 reward 模态选择），
    // 只断言伤害已被打到「致死」状态。
    const monsterAfter = (finalState.activeCards as any[])[2] ?? null;
    if (monsterAfter && monsterAfter.id === 'm-weak') {
      expect((monsterAfter.hp ?? 0) <= 0 || monsterAfter.defeatProcessed === true).toBe(true);
    }
    // 不管走哪条 reward 流，怪物 m-weak 至少不会以「满血」状态留在场上
    const m = (finalState.activeCards as any[]).find(c => c?.id === 'm-weak');
    if (m) expect(m.hp ?? 0).toBeLessThanOrEqual(0);
  });

  it('非怪物（事件）落到地雷 slot → 地雷不触发，按普通 ghost 推到下层', () => {
    const mine = makeMineBuildingFixture('mine-evt');
    // 用事件卡来模拟「非怪物落下」
    const eventCard = {
      id: 'evt-1',
      type: 'event' as const,
      name: 'TestEvent',
      value: 0,
      image: '',
    } as GameCardData;

    const state = makeState({
      activeCards: activeRowOf(null, null, mine, null, null),
      previewCards: [null, null, eventCard, null, null] as unknown as ActiveRowSlots,
      pendingWaterfallPlan: {
        dropAssignments: [{ previewIndex: 2, card: eventCard, slotIndex: 2 }],
        resolvedDropCards: [eventCard],
        dropPreviewIndices: [2],
        dropTargetSlots: [2],
        discardCard: null,
        discardPreviewIndex: null,
        discardDestination: 'graveyard',
        nextPreviewCards: [],
        nextRemainingDeck: [],
        newPreviewStacks: {},
        shouldDeclareVictory: false,
        stuckFinalMonsters: [],
        rng: createRng(1),
      } as any,
    });

    const engine = new GameEngine(state);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });

    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });

    const finalState = engine.getState();
    // 事件在顶层
    expect((finalState.activeCards as any[])[2]?.id).toBe('evt-1');
    // 地雷被推到下层 stack（按 ghost building 同款）
    expect(finalState.activeCardStacks[2]).toBeDefined();
    expect(finalState.activeCardStacks[2]?.[0]?.id).toBe('mine-evt');
    // 地雷不在坟场
    expect(finalState.discardedCards.some(c => c.id === 'mine-evt')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3.5) Stacked mines — 同 cell 多枚地雷 × 怪物瀑流 → 依次连环爆炸
// ---------------------------------------------------------------------------

describe('布雷术 — 同 cell 堆叠地雷 × 怪物瀑流 连环爆炸', () => {
  function makeMineBuildingFixture(id: string): GameCardData {
    return {
      id,
      type: 'building',
      name: '地雷',
      value: 0,
      image: '',
      isGhost: true,
      mineDamage: 5,
      hp: 1,
      maxHp: 1,
    } as GameCardData;
  }

  function makeNonMineGhost(id: string, name = 'TestGhost'): GameCardData {
    return {
      id,
      type: 'building',
      name,
      value: 0,
      image: '',
      isGhost: true,
      hp: 1,
      maxHp: 1,
    } as GameCardData;
  }

  function makePlanForSlot(slotIndex: number, card: GameCardData) {
    const previewIndices = [0, 1, 2, 3, 4];
    const preview: (GameCardData | null)[] = [null, null, null, null, null];
    preview[slotIndex] = card;
    return {
      previewCards: preview as unknown as ActiveRowSlots,
      pendingWaterfallPlan: {
        dropAssignments: [{ previewIndex: slotIndex, card, slotIndex }],
        resolvedDropCards: [card],
        dropPreviewIndices: [slotIndex],
        dropTargetSlots: [slotIndex],
        discardCard: null,
        discardPreviewIndex: null,
        discardDestination: 'graveyard',
        nextPreviewCards: [],
        nextRemainingDeck: [],
        newPreviewStacks: {},
        shouldDeclareVictory: false,
        stuckFinalMonsters: [],
        rng: createRng(1),
      } as any,
    };
  }

  it('A: 顶层地雷 + stack 中 1 枚地雷 + 怪物瀑流 → 2 次 mineTriggered + 10 点伤 + 2 枚都进坟场，stack 清空', () => {
    const mineTop = makeMineBuildingFixture('mine-top');
    const mineBelow = makeMineBuildingFixture('mine-below');
    const monster = makeMonster('m-fall', 30, 0);

    const state = makeState({
      activeCards: activeRowOf(null, null, mineTop, null, null),
      activeCardStacks: { 2: [mineBelow] },
      ...makePlanForSlot(2, monster),
    });

    const engine = new GameEngine(state);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });

    const events: any[] = [];
    engine.on('combat:mineTriggered', (payload) => {
      events.push(payload);
    });

    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });
    const finalState = engine.getState();

    const monsterInSlot = (finalState.activeCards as any[])[2];
    expect(monsterInSlot?.id).toBe('m-fall');
    expect(monsterInSlot?.hp).toBe(20); // 30 - 5 - 5 = 20

    expect(finalState.combatState.engagedMonsterIds).toContain('m-fall');

    expect(finalState.discardedCards.some(c => c.id === 'mine-top')).toBe(true);
    expect(finalState.discardedCards.some(c => c.id === 'mine-below')).toBe(true);
    expect(finalState.activeCardStacks[2]).toBeUndefined();

    expect(events.length).toBe(2);
    expect(events.every(e => e.slotIdx === 2 && e.monsterId === 'm-fall' && e.damage === 5)).toBe(true);
    const mineIds = events.map(e => e.mineId).sort();
    expect(mineIds).toEqual(['mine-below', 'mine-top'].sort());
  });

  it('B: 顶层地雷 + stack 中 [non-mine-ghost, 地雷] + 怪物瀑流 → 2 次触发 + 10 点伤；non-mine ghost 保留在 stack', () => {
    const mineTop = makeMineBuildingFixture('mine-top');
    const ghostStay = makeNonMineGhost('altar-1', 'Altar');
    const mineBelow = makeMineBuildingFixture('mine-below');
    const monster = makeMonster('m-fall', 30, 0);

    const state = makeState({
      activeCards: activeRowOf(null, null, mineTop, null, null),
      // stack[bottom → next-to-pop] = [ghost, mineBelow]
      activeCardStacks: { 2: [ghostStay, mineBelow] },
      ...makePlanForSlot(2, monster),
    });

    const engine = new GameEngine(state);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });

    const events: any[] = [];
    engine.on('combat:mineTriggered', (payload) => {
      events.push(payload);
    });

    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });
    const finalState = engine.getState();

    expect((finalState.activeCards as any[])[2]?.hp).toBe(20); // 30 - 10
    expect(finalState.discardedCards.some(c => c.id === 'mine-top')).toBe(true);
    expect(finalState.discardedCards.some(c => c.id === 'mine-below')).toBe(true);
    // non-mine ghost 没进坟场
    expect(finalState.discardedCards.some(c => c.id === 'altar-1')).toBe(false);

    // stack 仅剩 ghost
    expect(finalState.activeCardStacks[2]).toEqual([ghostStay]);

    expect(events.length).toBe(2);
  });

  it('C: 顶层是 non-mine ghost + stack 中地雷 + 怪物瀑流 → 1 次触发 + 5 点伤；non-mine ghost 被推到 stack bottom，地雷进坟场', () => {
    const ghostTop = makeNonMineGhost('altar-top', 'Altar');
    const mineBelow = makeMineBuildingFixture('mine-below');
    const monster = makeMonster('m-fall', 30, 0);

    const state = makeState({
      activeCards: activeRowOf(null, null, ghostTop, null, null),
      activeCardStacks: { 2: [mineBelow] },
      ...makePlanForSlot(2, monster),
    });

    const engine = new GameEngine(state);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });

    const events: any[] = [];
    engine.on('combat:mineTriggered', (payload) => {
      events.push(payload);
    });

    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });
    const finalState = engine.getState();

    expect((finalState.activeCards as any[])[2]?.hp).toBe(25); // 30 - 5
    expect(finalState.discardedCards.some(c => c.id === 'mine-below')).toBe(true);
    expect(finalState.discardedCards.some(c => c.id === 'altar-top')).toBe(false);

    // non-mine ghost 被推回 stack（顶层 displaced 路径），mine 已被过滤
    expect(finalState.activeCardStacks[2]).toEqual([ghostTop]);

    expect(events.length).toBe(1);
    expect(events[0].mineId).toBe('mine-below');
  });

  it('D: 3 枚地雷堆叠（顶层 + stack 中 2 枚）+ 怪物瀑流 → 3 次触发 + 15 点伤 + 全进坟场', () => {
    const mineTop = makeMineBuildingFixture('mine-top');
    const mineMid = makeMineBuildingFixture('mine-mid');
    const mineBot = makeMineBuildingFixture('mine-bot');
    const monster = makeMonster('m-fall', 50, 0);

    const state = makeState({
      activeCards: activeRowOf(null, null, mineTop, null, null),
      // stack 顺序：bottom=mineBot, next-to-pop=mineMid
      activeCardStacks: { 2: [mineBot, mineMid] },
      ...makePlanForSlot(2, monster),
    });

    const engine = new GameEngine(state);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });

    const events: any[] = [];
    engine.on('combat:mineTriggered', (payload) => {
      events.push(payload);
    });

    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });
    const finalState = engine.getState();

    expect((finalState.activeCards as any[])[2]?.hp).toBe(35); // 50 - 15
    expect(finalState.discardedCards.some(c => c.id === 'mine-top')).toBe(true);
    expect(finalState.discardedCards.some(c => c.id === 'mine-mid')).toBe(true);
    expect(finalState.discardedCards.some(c => c.id === 'mine-bot')).toBe(true);
    expect(finalState.activeCardStacks[2]).toBeUndefined();

    expect(events.length).toBe(3);
    // 每次伤害都是 5
    expect(events.every(e => e.damage === 5)).toBe(true);
  });

  it('E: globalMineDamageBonus = 2 + 2 枚堆叠地雷 + 怪物瀑流 → 每枚都加 bonus（实际伤害 7×2=14）', () => {
    const mineTop = makeMineBuildingFixture('mine-top');
    const mineBelow = makeMineBuildingFixture('mine-below');
    const monster = makeMonster('m-fall', 30, 0);

    const state = makeState({
      globalMineDamageBonus: 2,
      activeCards: activeRowOf(null, null, mineTop, null, null),
      activeCardStacks: { 2: [mineBelow] },
      ...makePlanForSlot(2, monster),
    });

    const engine = new GameEngine(state);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });

    const events: any[] = [];
    engine.on('combat:mineTriggered', (payload) => {
      events.push(payload);
    });

    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });
    const finalState = engine.getState();

    expect((finalState.activeCards as any[])[2]?.hp).toBe(16); // 30 - 14
    expect(events.length).toBe(2);
    expect(events.every(e => e.damage === 7)).toBe(true); // 5 base + 2 global
  });

  it('F: 同 cell 堆叠地雷 + 非怪物（事件）落地 → 不触发任何地雷，按普通 ghost 推下去', () => {
    const mineTop = makeMineBuildingFixture('mine-top');
    const mineBelow = makeMineBuildingFixture('mine-below');
    const eventCard = {
      id: 'evt-1',
      type: 'event' as const,
      name: 'TestEvent',
      value: 0,
      image: '',
    } as GameCardData;

    const state = makeState({
      activeCards: activeRowOf(null, null, mineTop, null, null),
      activeCardStacks: { 2: [mineBelow] },
      ...makePlanForSlot(2, eventCard),
    });

    const engine = new GameEngine(state);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });

    const events: any[] = [];
    engine.on('combat:mineTriggered', (payload) => {
      events.push(payload);
    });

    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });
    const finalState = engine.getState();

    // 没触发任何地雷
    expect(events.length).toBe(0);
    // 两枚地雷都不进坟场
    expect(finalState.discardedCards.some(c => c.id === 'mine-top')).toBe(false);
    expect(finalState.discardedCards.some(c => c.id === 'mine-below')).toBe(false);
    // 顶层是事件
    expect((finalState.activeCards as any[])[2]?.id).toBe('evt-1');
    // mineTop 走 displaced 路径推到 stack bottom，stack 下面 mineBelow 仍在原位
    // ghostsDisplaced 用 [ghost, ...prev] prepend → mineTop 在 index 0，mineBelow 在 index 1
    expect(finalState.activeCardStacks[2]).toEqual([mineTop, mineBelow]);
  });
});

// ---------------------------------------------------------------------------
// 4) Pure damage — bypass spell damage bonuses & spell damage reduction
// ---------------------------------------------------------------------------

describe('布雷术 — 5 点伤害是纯陷阱伤害，不受 amplify / 法伤加成 / 法伤抗性影响', () => {
  function makeMineBuildingFixture(id = 'mine-pure'): GameCardData {
    return {
      id,
      type: 'building',
      name: '地雷',
      value: 0,
      image: '',
      isGhost: true,
      mineDamage: 5,
      hp: 1,
      maxHp: 1,
    } as GameCardData;
  }

  it('permanentSpellDamageBonus +3 → 地雷伤害仍为 5（不受加成）', () => {
    const mine = makeMineBuildingFixture('mine-bonus');
    const monster = makeMonster('m-bonus', 30, 0);

    const state = makeState({
      permanentSpellDamageBonus: 3, // 法伤加成 +3
      activeCards: activeRowOf(null, null, mine, null, null),
      previewCards: [null, null, monster, null, null] as unknown as ActiveRowSlots,
      pendingWaterfallPlan: {
        dropAssignments: [{ previewIndex: 2, card: monster, slotIndex: 2 }],
        resolvedDropCards: [monster],
        dropPreviewIndices: [2],
        dropTargetSlots: [2],
        discardCard: null,
        discardPreviewIndex: null,
        discardDestination: 'graveyard',
        nextPreviewCards: [],
        nextRemainingDeck: [],
        newPreviewStacks: {},
        shouldDeclareVictory: false,
        stuckFinalMonsters: [],
        rng: createRng(1),
      } as any,
    });

    const engine = new GameEngine(state);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });
    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });

    // 仍然只掉 5 HP（25 = 30 - 5），不是 8（30 - (5+3)）
    expect((engine.getState().activeCards as any[])[2]?.hp).toBe(25);
  });

  it('怪物 spellDamageReduction: 0.5 → 地雷仍为 5（非法术，不被减免）', () => {
    const mine = makeMineBuildingFixture('mine-resist');
    const resistantMonster = makeMonster('m-resist', 30, 0, {
      spellDamageReduction: 0.5,
    });

    const state = makeState({
      activeCards: activeRowOf(null, null, mine, null, null),
      previewCards: [null, null, resistantMonster, null, null] as unknown as ActiveRowSlots,
      pendingWaterfallPlan: {
        dropAssignments: [{ previewIndex: 2, card: resistantMonster, slotIndex: 2 }],
        resolvedDropCards: [resistantMonster],
        dropPreviewIndices: [2],
        dropTargetSlots: [2],
        discardCard: null,
        discardPreviewIndex: null,
        discardDestination: 'graveyard',
        nextPreviewCards: [],
        nextRemainingDeck: [],
        newPreviewStacks: {},
        shouldDeclareVictory: false,
        stuckFinalMonsters: [],
        rng: createRng(1),
      } as any,
    });

    const engine = new GameEngine(state);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });
    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });

    // 5 全打上，没被法伤抗性减半（25 = 30 - 5）；如果走法伤路径会变 27.5 → 28
    expect((engine.getState().activeCards as any[])[2]?.hp).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// 5) Echo — spawn echoMultiplier mines at distinct empty slots
// ---------------------------------------------------------------------------

describe('布雷术 Echo — 双倍下次魔法生成 2 个地雷', () => {
  it('全空 active row + echo → 生成 2 个地雷（可能落在不同 slot，也可能 allow_same_cell 堆叠在同 slot）', () => {
    const card = makeCard();
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(),
      doubleNextMagic: true, // 触发 echo ×2
    } as any);
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const cards = result.state.activeCards as (GameCardData | null)[];
    // 顶层可见的地雷 + stack 里堆叠的地雷之和 = 2
    const visibleMines = cards.filter(c => c?.type === 'building' && c?.name === '地雷');
    let stackedMineCount = 0;
    for (const stack of Object.values(result.state.activeCardStacks)) {
      stackedMineCount += stack.filter(c => c?.type === 'building' && c?.name === '地雷').length;
    }
    expect(visibleMines.length + stackedMineCount).toBe(2);

    // 总共 2 枚地雷且 id 互不相同
    const allMineIds = new Set<string>();
    for (const c of visibleMines) allMineIds.add(c!.id);
    for (const stack of Object.values(result.state.activeCardStacks)) {
      for (const c of stack) {
        if (c.type === 'building' && c.name === '地雷') allMineIds.add(c.id);
      }
    }
    expect(allMineIds.size).toBe(2);
  });

  it('只有 1 个空 slot + echo ×2（其它都怪物，无 ghost）→ 1 枚顶层 + 1 枚堆在自己上面（allow_same_cell）', () => {
    const card = makeCard();
    const monsters = [
      makeMonster('m0'), makeMonster('m1'), makeMonster('m2'), makeMonster('m3'),
    ];
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(...monsters), // slot 4 空，唯一候选
      doubleNextMagic: true,
    } as any);
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const cards = result.state.activeCards as (GameCardData | null)[];
    const visibleMineAt4 = cards[4];
    expect(visibleMineAt4?.type).toBe('building');
    expect(visibleMineAt4?.name).toBe('地雷');

    // stack[4] 应有 1 张被堆下去的地雷（第一枚，被第二枚替换）
    const stack4 = result.state.activeCardStacks[4] ?? [];
    expect(stack4.length).toBe(1);
    expect(stack4[0]?.type).toBe('building');
    expect(stack4[0]?.name).toBe('地雷');
    // 顶层地雷和堆叠地雷 id 不同
    expect(stack4[0]?.id).not.toBe(visibleMineAt4?.id);
  });

  it('全场都是怪物（无空位 + 无 ghost）+ echo ×2 → fizzle 0 枚地雷', () => {
    const card = makeCard();
    const monsters = [
      makeMonster('m0'), makeMonster('m1'), makeMonster('m2'),
      makeMonster('m3'), makeMonster('m4'),
    ];
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(...monsters),
      doubleNextMagic: true,
    } as any);
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const cards = result.state.activeCards as (GameCardData | null)[];
    const mineSlots = cards.filter(c => c?.type === 'building' && c?.name === '地雷');
    expect(mineSlots.length).toBe(0);
    // 没有 stack 写入
    let stackedMineCount = 0;
    for (const stack of Object.values(result.state.activeCardStacks)) {
      stackedMineCount += stack.filter(c => c?.type === 'building' && c?.name === '地雷').length;
    }
    expect(stackedMineCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6) Upgrade — recycleDelay 2 → 1
// ---------------------------------------------------------------------------

describe('布雷术 升级 — recycleDelay 2 → 1', () => {
  it('lvl 0 默认 recycleDelay = 2', () => {
    const card = makeCard();
    expect(card.recycleDelay).toBe(2);
  });

  it('UPGRADE_CARD 升到 lvl 1 → recycleDelay 变成 1', () => {
    const card = makeCard();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id } as GameAction);
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.recycleDelay).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 7) Card consumption — magic itself goes to recycle bag (PERM behavior)
// ---------------------------------------------------------------------------

describe('布雷术 — 卡牌使用后进回收袋（PERM）', () => {
  it('PLAY_CARD 后卡进回收袋（不在 hand / 不在 graveyard）', () => {
    const card = makeCard();
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === card.id)).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === card.id)).toBeUndefined();
  });
});
