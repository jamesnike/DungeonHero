/**
 * 「地雷」从手牌打出（building + mineDamage type）
 *
 * 入口：当地雷因「坟场召回」类卡效果从坟场（或其它来源）进入手牌之后，
 * 玩家可以把它当作普通手牌打出。
 *
 * 行为完全镜像 `lay-mine` magic resolver（rules/magic-effects.ts case 'lay-mine'）：
 *   - 候选池 = active row 空位 ∪ ghost building 格（uniform 随机抽 1 个）
 *   - 落到 ghost 格时，原 ghost 沉到 activeCardStacks[col] 末尾，新地雷成为顶层
 *   - 候选池为空（怪物/事件/非 ghost 建筑占满）→ fizzle，卡仍从手牌消耗
 *   - 卡本身（手牌的实例）成为 active row 上的地雷，**不进坟场也不进回收袋**
 *
 * 端到端覆盖路径：
 *   1) PLAY_CARD 全空 active row → 地雷落到某空 slot
 *   2) PLAY_CARD 部分有怪物 → 地雷只落到剩余空位
 *   3) PLAY_CARD 全怪物（无空位 / 无 ghost）→ fizzle
 *   4) PLAY_CARD 含 ghost building（增幅祭坛）→ 可能堆在 ghost 上（stack-on-top）
 *   5) PLAY_CARD 仅 ghost building 可选 → 必落在 ghost 上 + 原 ghost 沉到 stack
 *   6) PLAY_CARD 后卡牌不进坟场也不进回收袋（消耗语义）
 *   7) 落地后保留所有地雷字段（type / isGhost / mineDamage / id）
 *   8) 怪物瀑流落到「手牌打出的地雷」上 → 触发标准 mineDamage 流程
 */

import { describe, expect, it } from 'vitest';
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

function makeHandMine(id = 'hand-mine-1', mineDamage = 5): GameCardData {
  // 跟 createMineBuilding 输出结构一致；一张地雷被「坟场召回」拉回手牌时
  // 应当带着这套字段。
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
// 1) PLAY_CARD — places mine on empty slot
// ---------------------------------------------------------------------------

describe('地雷 PLAY_CARD — 全空 active row', () => {
  it('全空 active row → 在某空 slot 生成 1 个地雷，手牌消耗', () => {
    const card = makeHandMine();
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
    expect(found!.mine.name).toBe('地雷');

    // 卡牌从手牌消失
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
  });

  it('卡的 id 在 active row 上保留（不重新生成新地雷）', () => {
    const card = makeHandMine('preserve-id');
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const found = findMineInActive(result.state);
    expect(found!.mine.id).toBe('preserve-id');
  });
});

// ---------------------------------------------------------------------------
// 2) Monsters partially fill row — mine goes to remaining empty
// ---------------------------------------------------------------------------

describe('地雷 PLAY_CARD — 部分被怪物占用', () => {
  it('部分填了怪物 → 地雷只会生成在剩下的空 slot', () => {
    const card = makeHandMine();
    const m1 = makeMonster('m1');
    const m2 = makeMonster('m2');
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(m1, m2),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const found = findMineInActive(result.state);
    expect(found).not.toBeNull();
    expect([2, 3, 4]).toContain(found!.idx);
    // 已有怪物的位置不变
    expect((result.state.activeCards as any[])[0]?.id).toBe('m1');
    expect((result.state.activeCards as any[])[1]?.id).toBe('m2');
  });
});

// ---------------------------------------------------------------------------
// 3) Fizzle — full row of monsters, no candidates
// ---------------------------------------------------------------------------

describe('地雷 PLAY_CARD — fizzle 路径', () => {
  it('全 5 slot 都被怪物占了 → fizzle，无地雷生成，卡照样消耗', () => {
    const card = makeHandMine();
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
    // 卡也不在坟场 / 回收袋（consumed_no_grave 语义）
    expect(result.state.discardedCards.find(c => c.id === card.id)).toBeUndefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === card.id)).toBeUndefined();
  });

  it('全场被 怪物 + 非 ghost 建筑 占满（无空位也无 ghost）→ fizzle', () => {
    const card = makeHandMine();
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
});

// ---------------------------------------------------------------------------
// 4) Ghost building cells are valid candidates (stack-on-top)
// ---------------------------------------------------------------------------

describe('地雷 PLAY_CARD — ghost building 格也算候选', () => {
  it('含 ghost building（如增幅祭坛）的 slot 也算可选 → 地雷可能落在该 slot 上面', () => {
    const card = makeHandMine();
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
      // 落在 altar 上：altar 应该被推到下层 stack
      expect(result.state.activeCardStacks[0]).toBeDefined();
      expect(result.state.activeCardStacks[0]?.[0]?.id).toBe('altar');
    } else {
      // 落在 slot 4：altar 仍然在 slot 0 顶层
      expect((result.state.activeCards as any[])[0]?.id).toBe('altar');
      expect(result.state.activeCardStacks[0]).toBeUndefined();
    }
  });

  it('全场只有 ghost building（无空位）→ 地雷必落在 ghost 格上，原 ghost 进 stack', () => {
    const card = makeHandMine();
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
// 5) Consumption semantics — card not in graveyard / recycle bag
// ---------------------------------------------------------------------------

describe('地雷 PLAY_CARD — consumed_no_grave 语义', () => {
  it('成功放置后，卡不在手牌 / 坟场 / 回收袋', () => {
    const card = makeHandMine('consume-success');
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
    expect(result.state.discardedCards.find(c => c.id === card.id)).toBeUndefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === card.id)).toBeUndefined();
    // 同一 id 应当出现在 active row 上
    const found = findMineInActive(result.state);
    expect(found?.mine.id).toBe('consume-success');
  });

  it('Fizzle 后，卡也不在手牌 / 坟场 / 回收袋（彻底消失）', () => {
    const card = makeHandMine('consume-fizzle');
    const monsters = [
      makeMonster('m0'), makeMonster('m1'), makeMonster('m2'),
      makeMonster('m3'), makeMonster('m4'),
    ];
    const state = makeState({
      handCards: [card],
      activeCards: monsters as unknown as ActiveRowSlots,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
    expect(result.state.discardedCards.find(c => c.id === card.id)).toBeUndefined();
    expect(result.state.permanentMagicRecycleBag.find(c => c.id === card.id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6) Hand-only metadata stripped on placement
// ---------------------------------------------------------------------------

describe('地雷 PLAY_CARD — 手牌专用元数据剥离', () => {
  it('剥离 _recycleWaits / fromSlot 后落到 active row', () => {
    const card = {
      ...makeHandMine('strip-meta'),
      _recycleWaits: 2,
      fromSlot: 'equipmentSlot1',
    } as GameCardData & { _recycleWaits?: number; fromSlot?: string };
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const found = findMineInActive(result.state);
    expect(found).not.toBeNull();
    expect((found!.mine as any)._recycleWaits).toBeUndefined();
    expect((found!.mine as any).fromSlot).toBeUndefined();
    // 但 mineDamage / isGhost / 等关键字段保留
    expect((found!.mine as any).mineDamage).toBe(5);
    expect(found!.mine.isGhost).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7) Side effect: emits magic:layMine for UI consistency
// ---------------------------------------------------------------------------

describe('地雷 PLAY_CARD — emit magic:layMine 事件（UI 反馈）', () => {
  it('成功放置后 emit magic:layMine 事件，payload.slots 与 active row 一致', () => {
    const card = makeHandMine('emit-test');
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(),
    });
    const engine = new GameEngine(state);
    let layMinePayload: any = null;
    engine.on('magic:layMine', (payload) => {
      layMinePayload = payload;
    });
    engine.dispatch({ type: 'PLAY_CARD', cardId: card.id } as GameAction);

    expect(layMinePayload).not.toBeNull();
    expect(layMinePayload.slots).toHaveLength(1);
    expect(layMinePayload.slots[0].mineId).toBe('emit-test');
    expect(layMinePayload.droppedCount).toBe(0);
  });

  it('Fizzle 时不 emit magic:layMine 事件', () => {
    const card = makeHandMine('emit-fizzle');
    const monsters = [
      makeMonster('m0'), makeMonster('m1'), makeMonster('m2'),
      makeMonster('m3'), makeMonster('m4'),
    ];
    const state = makeState({
      handCards: [card],
      activeCards: monsters as unknown as ActiveRowSlots,
    });
    const engine = new GameEngine(state);
    let layMinePayload: any = null;
    engine.on('magic:layMine', (payload) => {
      layMinePayload = payload;
    });
    engine.dispatch({ type: 'PLAY_CARD', cardId: card.id } as GameAction);

    expect(layMinePayload).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8) Waterfall trigger — monster lands on hand-played mine
// ---------------------------------------------------------------------------

describe('地雷 PLAY_CARD — 落地后保持标准 mineDamage 触发语义', () => {
  it('怪物瀑流落到「手牌打出的地雷」slot → 5 点纯伤 + 怪物激怒 + 地雷进坟场', () => {
    // 先把地雷从手牌打到 slot 2
    const card = makeHandMine('mine-trap');
    const setupState = makeState({
      handCards: [card],
      activeCards: activeRowOf(makeMonster('block0'), makeMonster('block1'), null, makeMonster('block3'), makeMonster('block4')),
    });
    // 候选池只有 slot 2，确定性放到 slot 2
    const setupResult = drain(setupState, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const placedMine = (setupResult.state.activeCards as (GameCardData | null)[])[2];
    expect(placedMine?.id).toBe('mine-trap');

    // 然后让一只怪物瀑流落到 slot 2
    const monster = makeMonster('m-fall', 30, 3);
    const droppedState = {
      ...setupResult.state,
      activeCards: activeRowOf(makeMonster('block0'), makeMonster('block1'), placedMine, makeMonster('block3'), makeMonster('block4')) as ActiveRowSlots,
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
    };

    const engine = new GameEngine(droppedState);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });
    let mineTriggeredEvent: any = null;
    engine.on('combat:mineTriggered', (payload) => {
      mineTriggeredEvent = payload;
    });

    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' } as any);

    // 触发事件已发出
    expect(mineTriggeredEvent).not.toBeNull();
    expect(mineTriggeredEvent.mineId).toBe('mine-trap');

    // 怪物激怒
    const finalState = engine.getState();
    expect(finalState.combatState.engagedMonsterIds).toContain('m-fall');

    // 怪物受了 5 点伤害（30 → 25）
    const monsterAfter = (finalState.activeCards as (GameCardData | null)[])
      .find(c => c?.id === 'm-fall');
    expect(monsterAfter?.hp).toBe(25);

    // 地雷进坟场（不在 active row）
    const mineStillOnRow = (finalState.activeCards as (GameCardData | null)[])
      .some(c => c?.id === 'mine-trap');
    expect(mineStillOnRow).toBe(false);
    expect(finalState.discardedCards.some(c => c.id === 'mine-trap')).toBe(true);
  });
});
