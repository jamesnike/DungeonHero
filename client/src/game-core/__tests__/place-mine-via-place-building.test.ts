/**
 * 「地雷」从手牌 / 背包打出 — 真实游戏拖动路径走 PLACE_BUILDING_IN_DUNGEON
 *
 * 背景 bug：`isHeroRowHighlightCard` 早期只承认 `building && eventChoices`
 * （命运之刃 / 增幅祭坛），不承认地雷（`building && mineDamage > 0`），
 * 导致玩家拖地雷到英雄行时根本不亮 → 放不下 → 表现为「无法从手牌打出」。
 *
 * 修复后：
 *   1) `isHeroRowHighlightCard` 多承认 `building && mineDamage > 0`
 *   2) `handleCardToHero` 命中 `card.type === 'building'` 分支后 dispatch
 *      `PLACE_BUILDING_IN_DUNGEON`（hand / backpack 两条路径都是这个）
 *   3) `reducePlaceBuildingInDungeon` 顶部新增 mine 分支，行为完全镜像
 *      `lay-mine` magic resolver / `reducePlayCard` 的 building+mineDamage 分支：
 *        - 候选池 = active row 空位 ∪ ghost building 格
 *        - fizzle 时**不进坟场**（consumed_no_grave 语义）
 *        - 落到 ghost 格时原 ghost 沉到 stack
 *        - emit `magic:layMine`
 *        - 不加命运之刃专用字段（hasReleaseCharge / _fateBladeLastSlot）
 *
 * 这套测试镜像 `play-mine-from-hand.test.ts` 的场景矩阵，但走真实游戏 UI
 * 的 PLACE_BUILDING_IN_DUNGEON action（不走 PLAY_CARD），覆盖 hook → reducer
 * 端到端语义。同时验证 hand vs backpack 两个 source 都走同一套 mine 语义。
 *
 * 注意：`PLACE_BUILDING_IN_DUNGEON` 不在 `pipeline.ts` 的 `isInputContinuation`
 * 白名单里——它是 hook 直接 dispatch 的"顶层 player action"，不会作为 follow-up
 * enqueue。`engine.dispatch` 通过 `_processAction` 直接 `reduce`，**不**经过
 * gate；只有它产生的 follow-ups（`APPLY_TRANSFORM_CATEGORY` / `DISCARD_OWNED_CARD`）
 * 会过 gate。所以测试用 `dispatchFull` helper 镜像这个流程，而不是 `drain([...])`，
 * 后者会在 fixture `phase: 'playerInput'` 下把入口 action 直接 strand 掉。
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { GameEngine } from '../index';
import { createInitialGameState } from '../state';
import { createRng } from '../rng';
import { initialCombatState } from '../constants';
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

/**
 * Mirror GameEngine.dispatch / _processAction:
 *   reduce(state, action) → prepend enqueuedActions to state.actionQueue → drain.
 * `_processAction` calls `reduce` DIRECTLY without the `isInputContinuation`
 * gate (only follow-ups are gated), so this is the right way to exercise the
 * "top-level" entry action under `phase: 'playerInput'` (real game state).
 */
function dispatchFull(state: GameState, action: GameAction): GameState {
  const r = reduce(state, action);
  let s = { ...r.state };
  if (r.enqueuedActions.length > 0) {
    s = { ...s, actionQueue: [...r.enqueuedActions, ...s.actionQueue] };
  }
  if (s.actionQueue.length > 0) {
    const dr = drain(s, s.actionQueue);
    s = { ...dr.state, actionQueue: dr.queue };
  }
  return s;
}

function makeMine(id = 'place-mine-1', mineDamage = 5): GameCardData {
  return {
    id,
    type: 'building',
    name: '地雷',
    value: 0,
    image: '',
    classCard: true,
    isGhost: true,
    mineDamage,
    hp: 1,
    maxHp: 1,
    description: '幽灵建筑：当怪物瀑流落到本格时，对该怪物造成 5 点纯伤害，地雷进入坟场。',
    shortDescription: '怪物落入：5 点纯伤后进坟场',
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
// 1) Hand source — full empty active row
// ---------------------------------------------------------------------------

describe('PLACE_BUILDING_IN_DUNGEON 地雷分支 — source: hand', () => {
  it('全空 active row → 在某空 slot 生成 1 个地雷', () => {
    const card = makeMine();
    const state = makeState({
      handCards: [],
      activeCards: activeRowOf(),
    });
    const finalState = dispatchFull(state, {
      type: 'PLACE_BUILDING_IN_DUNGEON', card, source: 'hand',
    } as GameAction);

    const found = findMineInActive(finalState);
    expect(found).not.toBeNull();
    expect(found!.mine.id).toBe('place-mine-1');
    expect(found!.mine.isGhost).toBe(true);
    expect((found!.mine as any).mineDamage).toBe(5);
    expect(found!.mine.type).toBe('building');
    expect(found!.mine.name).toBe('地雷');
  });

  it('部分填了怪物 → 地雷只在剩下的空 slot', () => {
    const card = makeMine();
    const m1 = makeMonster('m1');
    const m2 = makeMonster('m2');
    const state = makeState({
      handCards: [],
      activeCards: activeRowOf(m1, m2),
    });
    const finalState = dispatchFull(state, {
      type: 'PLACE_BUILDING_IN_DUNGEON', card, source: 'hand',
    } as GameAction);

    const found = findMineInActive(finalState);
    expect(found).not.toBeNull();
    expect([2, 3, 4]).toContain(found!.idx);
    // 已有怪物的位置不变
    expect((finalState.activeCards as any[])[0]?.id).toBe('m1');
    expect((finalState.activeCards as any[])[1]?.id).toBe('m2');
  });

  it('全 5 slot 都被怪物占了 → fizzle，无地雷生成，且不入坟场', () => {
    const card = makeMine();
    const monsters = [
      makeMonster('m0'), makeMonster('m1'), makeMonster('m2'),
      makeMonster('m3'), makeMonster('m4'),
    ];
    const state = makeState({
      handCards: [],
      activeCards: monsters as unknown as ActiveRowSlots,
    });
    const finalState = dispatchFull(state, {
      type: 'PLACE_BUILDING_IN_DUNGEON', card, source: 'hand',
    } as GameAction);

    expect(findMineInActive(finalState)).toBeNull();
    // 5 只怪物原封不动
    for (let i = 0; i < 5; i++) {
      expect((finalState.activeCards as any[])[i]?.id).toBe(`m${i}`);
    }
    // 关键：地雷 fizzle 不进坟场也不进回收袋（hook 已移除来源 = 净消耗）
    expect(finalState.discardedCards.find(c => c.id === card.id)).toBeUndefined();
    expect(finalState.permanentMagicRecycleBag.find(c => c.id === card.id)).toBeUndefined();
  });

  it('全场被怪物 + 非 ghost 建筑 占满 → fizzle，不进坟场', () => {
    const card = makeMine();
    const wall = {
      id: 'wall',
      type: 'building' as const,
      name: 'NonGhostWall',
      value: 0,
      image: '',
      isGhost: false,
      hp: 1,
      maxHp: 1,
    } as GameCardData;
    const state = makeState({
      handCards: [],
      activeCards: activeRowOf(
        wall,
        makeMonster('m1'), makeMonster('m2'), makeMonster('m3'), makeMonster('m4'),
      ),
    });
    const finalState = dispatchFull(state, {
      type: 'PLACE_BUILDING_IN_DUNGEON', card, source: 'hand',
    } as GameAction);
    expect(findMineInActive(finalState)).toBeNull();
    expect(finalState.discardedCards.find(c => c.id === card.id)).toBeUndefined();
    expect(finalState.permanentMagicRecycleBag.find(c => c.id === card.id)).toBeUndefined();
  });

  it('含 ghost building（增幅祭坛）的 slot 也算候选 → 可能堆在 ghost 上', () => {
    const card = makeMine();
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
      handCards: [],
      activeCards: activeRowOf(altar, makeMonster('m1'), makeMonster('m2'), makeMonster('m3')),
    });
    const finalState = dispatchFull(state, {
      type: 'PLACE_BUILDING_IN_DUNGEON', card, source: 'hand',
    } as GameAction);

    const found = findMineInActive(finalState);
    expect(found).not.toBeNull();
    expect([0, 4]).toContain(found!.idx);
    if (found!.idx === 0) {
      expect(finalState.activeCardStacks[0]).toBeDefined();
      expect(finalState.activeCardStacks[0]?.[0]?.id).toBe('altar');
    } else {
      expect((finalState.activeCards as any[])[0]?.id).toBe('altar');
      expect(finalState.activeCardStacks[0]).toBeUndefined();
    }
  });

  it('全场只有 ghost building（无空位）→ 必落在 ghost 格上，原 ghost 进 stack', () => {
    const card = makeMine();
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
      handCards: [],
      activeCards: activeRowOf(
        altar,
        makeMonster('m1'), makeMonster('m2'), makeMonster('m3'), makeMonster('m4'),
      ),
    });
    const finalState = dispatchFull(state, {
      type: 'PLACE_BUILDING_IN_DUNGEON', card, source: 'hand',
    } as GameAction);

    const found = findMineInActive(finalState);
    expect(found).not.toBeNull();
    expect(found!.idx).toBe(0);
    expect(finalState.activeCardStacks[0]?.[0]?.id).toBe('altar-only');
  });

  it('剥离 _recycleWaits / fromSlot 后落到 active row', () => {
    const card = {
      ...makeMine('strip-meta'),
      _recycleWaits: 2,
      fromSlot: 'equipmentSlot1',
    } as GameCardData & { _recycleWaits?: number; fromSlot?: string };
    const state = makeState({
      handCards: [],
      activeCards: activeRowOf(),
    });
    const finalState = dispatchFull(state, {
      type: 'PLACE_BUILDING_IN_DUNGEON', card, source: 'hand',
    } as GameAction);

    const found = findMineInActive(finalState);
    expect(found).not.toBeNull();
    expect((found!.mine as any)._recycleWaits).toBeUndefined();
    expect((found!.mine as any).fromSlot).toBeUndefined();
    expect((found!.mine as any).mineDamage).toBe(5);
    expect(found!.mine.isGhost).toBe(true);
  });

  it('放置后**不**带命运之刃专用字段 hasReleaseCharge / _fateBladeLastSlot', () => {
    const card = makeMine('no-fate-blade-fields');
    const state = makeState({
      handCards: [],
      activeCards: activeRowOf(),
    });
    const finalState = dispatchFull(state, {
      type: 'PLACE_BUILDING_IN_DUNGEON', card, source: 'hand',
    } as GameAction);

    const found = findMineInActive(finalState);
    expect(found).not.toBeNull();
    expect((found!.mine as any).hasReleaseCharge).toBeUndefined();
    expect((found!.mine as any)._fateBladeLastSlot).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2) Backpack source — same mine semantics, different log wording
// ---------------------------------------------------------------------------

describe('PLACE_BUILDING_IN_DUNGEON 地雷分支 — source: backpack', () => {
  it('从背包打出（hook 已 UPDATE_BACKPACK_ITEMS 移除）→ 同样走 mine 分支', () => {
    const card = makeMine('from-backpack-1');
    const state = makeState({
      handCards: [],
      backpackItems: [],
      activeCards: activeRowOf(),
    });
    const finalState = dispatchFull(state, {
      type: 'PLACE_BUILDING_IN_DUNGEON', card, source: 'backpack',
    } as GameAction);

    const found = findMineInActive(finalState);
    expect(found).not.toBeNull();
    expect(found!.mine.id).toBe('from-backpack-1');
    expect((found!.mine as any).mineDamage).toBe(5);
  });

  it('背包来源 + fizzle → 不进坟场', () => {
    const card = makeMine('from-backpack-fizzle');
    const monsters = [
      makeMonster('m0'), makeMonster('m1'), makeMonster('m2'),
      makeMonster('m3'), makeMonster('m4'),
    ];
    const state = makeState({
      handCards: [],
      backpackItems: [],
      activeCards: monsters as unknown as ActiveRowSlots,
    });
    const finalState = dispatchFull(state, {
      type: 'PLACE_BUILDING_IN_DUNGEON', card, source: 'backpack',
    } as GameAction);

    expect(findMineInActive(finalState)).toBeNull();
    expect(finalState.discardedCards.find(c => c.id === card.id)).toBeUndefined();
    expect(finalState.permanentMagicRecycleBag.find(c => c.id === card.id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3) Side effect: emits magic:layMine for UI consistency (uses GameEngine
// because we need to subscribe to the event bus)
// ---------------------------------------------------------------------------

describe('PLACE_BUILDING_IN_DUNGEON 地雷分支 — emit magic:layMine 事件', () => {
  it('成功放置后 emit magic:layMine 事件，payload.slots 与 active row 一致', () => {
    const card = makeMine('emit-test');
    const state = makeState({
      handCards: [],
      activeCards: activeRowOf(),
    });
    const engine = new GameEngine(state);
    let layMinePayload: any = null;
    engine.on('magic:layMine', (payload) => {
      layMinePayload = payload;
    });
    engine.dispatch({ type: 'PLACE_BUILDING_IN_DUNGEON', card, source: 'hand' } as GameAction);

    expect(layMinePayload).not.toBeNull();
    expect(layMinePayload.slots).toHaveLength(1);
    expect(layMinePayload.slots[0].mineId).toBe('emit-test');
    expect(layMinePayload.droppedCount).toBe(0);
  });

  it('Fizzle 时不 emit magic:layMine 事件', () => {
    const card = makeMine('emit-fizzle');
    const monsters = [
      makeMonster('m0'), makeMonster('m1'), makeMonster('m2'),
      makeMonster('m3'), makeMonster('m4'),
    ];
    const state = makeState({
      handCards: [],
      activeCards: monsters as unknown as ActiveRowSlots,
    });
    const engine = new GameEngine(state);
    let layMinePayload: any = null;
    engine.on('magic:layMine', (payload) => {
      layMinePayload = payload;
    });
    engine.dispatch({ type: 'PLACE_BUILDING_IN_DUNGEON', card, source: 'hand' } as GameAction);

    expect(layMinePayload).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4) Transform chain — APPLY_TRANSFORM_CATEGORY enqueued in both branches
// ---------------------------------------------------------------------------

describe('PLACE_BUILDING_IN_DUNGEON 地雷分支 — transform chain 仍触发', () => {
  it('成功放置时 transform chain 推进（与默认 building 分支一致）', () => {
    const card = makeMine('transform-success');
    const state = makeState({
      handCards: [],
      activeCards: activeRowOf(),
      lastPlayedCardCategory: 'event',
      transformChainPrevCategory: 'event',
    });
    const finalState = dispatchFull(state, {
      type: 'PLACE_BUILDING_IN_DUNGEON', card, source: 'hand',
    } as GameAction);
    // 地雷是 building → APPLY_TRANSFORM_CATEGORY 把 transformChainPrevCategory 推进到 'building'
    expect(finalState.transformChainPrevCategory).toBe('building');
  });

  it('Fizzle 时 transform chain 仍推进（卡照样消耗）', () => {
    const card = makeMine('transform-fizzle');
    const monsters = [
      makeMonster('m0'), makeMonster('m1'), makeMonster('m2'),
      makeMonster('m3'), makeMonster('m4'),
    ];
    const state = makeState({
      handCards: [],
      activeCards: monsters as unknown as ActiveRowSlots,
      lastPlayedCardCategory: 'event',
      transformChainPrevCategory: 'event',
    });
    const finalState = dispatchFull(state, {
      type: 'PLACE_BUILDING_IN_DUNGEON', card, source: 'hand',
    } as GameAction);
    expect(finalState.transformChainPrevCategory).toBe('building');
  });
});

// ---------------------------------------------------------------------------
// 5) Default building branch (命运之刃 / 增幅祭坛) unaffected by mine branch
// ---------------------------------------------------------------------------

describe('PLACE_BUILDING_IN_DUNGEON — 默认 building 分支不受 mine 分支影响', () => {
  it('命运之刃（无 mineDamage）仍走默认分支：放置 + hasReleaseCharge + 自伤 5', () => {
    const fateBlade: GameCardData = {
      id: 'fate-blade-test',
      type: 'building',
      name: '命运之刃',
      value: 0,
      image: '',
    } as GameCardData;
    const state = makeState({
      handCards: [],
      activeCards: activeRowOf(),
      hp: 20,
    });
    const finalState = dispatchFull(state, {
      type: 'PLACE_BUILDING_IN_DUNGEON', card: fateBlade, source: 'hand',
    } as GameAction);

    const placed = (finalState.activeCards as (GameCardData | null)[]).find(
      c => c?.id === 'fate-blade-test',
    );
    expect(placed).toBeDefined();
    expect((placed as any)?.hasReleaseCharge).toBe(true);
    expect(finalState.hp).toBe(15);
  });

  it('普通 building（无 mineDamage）满位时仍进坟场（mine 分支不能误吞）', () => {
    const wall: GameCardData = {
      id: 'wall-test',
      type: 'building',
      name: 'NonGhostWall',
      value: 0,
      image: '',
      isGhost: false,
    } as GameCardData;
    const state = makeState({
      handCards: [],
      activeCards: [
        makeMonster('m0'), makeMonster('m1'), makeMonster('m2'),
        makeMonster('m3'), makeMonster('m4'),
      ] as unknown as ActiveRowSlots,
    });
    const finalState = dispatchFull(state, {
      type: 'PLACE_BUILDING_IN_DUNGEON', card: wall, source: 'hand',
    } as GameAction);
    // 无 mineDamage → 走默认分支 → 没空位则进坟场
    expect(finalState.discardedCards.some(c => c.id === 'wall-test')).toBe(true);
  });
});
