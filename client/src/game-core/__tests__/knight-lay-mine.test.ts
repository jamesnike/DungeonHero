/**
 * 布雷术 (knight:lay-mine) — Perm 2 (升级 → Perm 1) magic.
 *
 * Behavior:
 *   - PLAY_CARD: 在 active row 的随机空 slot 生成一个「地雷」幽灵建筑
 *     (type: 'building', isGhost: true, mineDamage: 5)。
 *   - Echo (A 类): 生成 echoMultiplier 个地雷在不同的随机空 slot；空位不
 *     够则丢弃多余的。
 *   - 全没空位时 fizzle：卡照常进回收袋，无地雷生成。
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

  it('原本就有 ghost building（如增幅祭坛）的 slot 不算空 → 地雷只去真空 slot', () => {
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
      // 4 个 slot 被各种东西占了，只有 slot 4 是真空
      activeCards: activeRowOf(altar, makeMonster('m1'), makeMonster('m2'), makeMonster('m3')),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const found = findMineInActive(result.state);
    expect(found).not.toBeNull();
    expect(found!.idx).toBe(4); // 唯一的真空位
    // 增幅祭坛仍在原位
    expect((result.state.activeCards as any[])[0]?.id).toBe('altar');
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
  it('全空 active row + echo → 生成 2 个地雷在 2 个不同的空 slot', () => {
    const card = makeCard();
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(),
      doubleNextMagic: true, // 触发 echo ×2
    } as any);
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const cards = result.state.activeCards as (GameCardData | null)[];
    const mineSlots = cards
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c?.type === 'building' && c?.name === '地雷');
    expect(mineSlots.length).toBe(2);
    // 两个地雷在不同的 slot
    expect(mineSlots[0].i).not.toBe(mineSlots[1].i);
    // 两个地雷有不同的 id
    expect(mineSlots[0].c?.id).not.toBe(mineSlots[1].c?.id);
  });

  it('只有 1 个空 slot + echo ×2 → 仅生成 1 个地雷，1 个被丢弃', () => {
    const card = makeCard();
    const monsters = [
      makeMonster('m0'), makeMonster('m1'), makeMonster('m2'), makeMonster('m3'),
    ];
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(...monsters), // slot 4 空
      doubleNextMagic: true,
    } as any);
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    const cards = result.state.activeCards as (GameCardData | null)[];
    const mineSlots = cards.filter(c => c?.type === 'building' && c?.name === '地雷');
    expect(mineSlots.length).toBe(1);
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
