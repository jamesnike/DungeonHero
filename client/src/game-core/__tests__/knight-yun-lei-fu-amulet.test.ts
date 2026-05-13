/**
 * 殒雷符 (kill-cell-mine amulet, unique) — Knight class amulet.
 *
 * Behavior:
 *   - 每击杀一只怪物，立即在该 cell 生成 **2 个**「地雷」幽灵建筑。
 *   - 顶层为最新地雷；第一枚地雷 + cell 原 occupant 推入 activeCardStacks
 *     （顺序：原 stack → 原 occupant → 第一枚地雷 → 顶层最新地雷）。
 *   - 地雷复用 createMineBuilding（每个 5 点纯伤、ghost、踩到即触发 + 进坟场）。
 *   - 任何来源击杀都触发：武器 / magic / 反震 / 弃牌伤害 / 遗言伤害 / 地雷自己。
 *   - 「stack on top」：cell 在 mine 落下时已被占（stack-pop / swarm-buglet /
 *     瀑流后续）→ 2 个地雷堆叠在上面，原 occupant 推入 activeCardStacks。
 *   - 后续怪物落到该 cell 时，waterfall.ts 的「同 cell 堆叠地雷连环引爆」逻辑
 *     让 2 枚地雷依次触发，怪物连受 2 次纯陷阱伤害，2 枚地雷都进坟场。
 *   - 不触发：复生（branch A，monster 没真死）/ 建筑 / 事件 被清除（type 不是 monster）/
 *     没装备护符。
 *   - unique=true → 同时最多 1 张实例。
 *
 * 实现：reducer.ts postProcessActiveCards step 3.5。
 *   检测 `prev?.defeatProcessed === true && curr !== prev`。
 *   `defeatProcessed: true` 仅由 combat.ts:reduceMonsterDefeated branch B 设置。
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
import type { ActiveRowSlots, AmuletItem } from '@/components/game-board/types';
import type { GameCardData } from '@/components/GameCard';
import { generateKnightDeck } from '@/lib/knightDeck';
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

function makeAmulet(overrides: Partial<GameCardData> = {}): GameCardData {
  return {
    id: 'a-yunleifu',
    type: 'amulet',
    name: '殒雷符',
    value: 1,
    image: '',
    classCard: true,
    amuletEffect: 'kill-cell-mine',
    unique: true,
    ...overrides,
  } as GameCardData;
}

function makeMonster(id: string, overrides: Partial<GameCardData> = {}): GameCardData {
  return {
    id,
    type: 'monster',
    name: `M-${id}`,
    value: 5,
    image: '',
    hp: 5,
    maxHp: 5,
    attack: 1,
    fury: 1,
    currentLayer: 1,
    hpLayers: 1,
    ...overrides,
  } as GameCardData;
}

function activeRowOf(...cards: (GameCardData | null)[]): ActiveRowSlots {
  const row: (GameCardData | null)[] = [null, null, null, null, null];
  for (let i = 0; i < cards.length && i < 5; i++) row[i] = cards[i];
  return row as unknown as ActiveRowSlots;
}

function fillAmuletSlot(amulet: GameCardData): AmuletItem[] {
  return [amulet as AmuletItem, null, null, null, null] as AmuletItem[];
}

function isMine(card: GameCardData | null): boolean {
  return !!card && card.type === 'building' && card.name === '地雷' && (card as any).mineDamage === 5;
}

// ---------------------------------------------------------------------------
// 1) Single-monster kill — slot becomes empty → mine spawns
// ---------------------------------------------------------------------------

describe('殒雷符：单怪物击杀 → 该 cell 生成 2 个地雷', () => {
  it('PERFORM_HERO_ATTACK 杀怪 + 之后 UPDATE_ACTIVE_CARDS 清空 slot → 2 个地雷生成（顶层 + stack[0]）', () => {
    const target = makeMonster('m-kill', { hp: 1, maxHp: 1, fury: 1, currentLayer: 1, hpLayers: 1 });
    const blade: GameCardData = {
      id: 'w', type: 'weapon', name: 'Blade', value: 5, image: '',
      durability: 2, maxDurability: 2,
    };
    const amulet = makeAmulet();
    const state = makeState({
      equipmentSlot1: blade as any,
      activeCards: activeRowOf(null, target, null, null, null),
      amuletSlots: fillAmuletSlot(amulet),
      combatState: {
        ...initialCombatState,
        heroAttacksRemaining: 1,
        heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
        engagedMonsterIds: [target.id],
      } as any,
    });

    // Step 1: PERFORM_HERO_ATTACK → MONSTER_DEFEATED enqueued → defeatProcessed: true
    const r1 = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: target.id,
    });
    const afterKill = drain(r1.state, r1.enqueuedActions ?? []).state;

    const slot1 = (afterKill.activeCards as any[])[1];
    // 怪物被标记为 defeatProcessed 但还在 cell（动画期间）
    expect(slot1?.id).toBe('m-kill');
    expect(slot1?.defeatProcessed).toBe(true);
    // 此时还没生成地雷（cell 还有怪物）
    expect(isMine(slot1)).toBe(false);

    // Step 2: 模拟 removeCard hook：UPDATE_ACTIVE_CARDS 清空 slot
    const r2 = reduce(afterKill, {
      type: 'UPDATE_ACTIVE_CARDS',
      updater: prev => {
        const next = [...prev] as any;
        next[1] = null;
        return next;
      },
    });

    // postProcessActiveCards step 3.5 应该检测到 defeatProcessed 离场 → 放 2 个地雷
    const after = r2.state;
    // 顶层是最新地雷
    expect(isMine((after.activeCards as any[])[1])).toBe(true);
    expect((after.activeCards as any[])[1]?.mineDamage).toBe(5);
    // 第一枚地雷在 stack 里（next-to-pop = stack 末尾）
    const stack1 = after.activeCardStacks[1] ?? [];
    expect(stack1.length).toBe(1);
    expect(isMine(stack1[stack1.length - 1] as any)).toBe(true);
    expect((stack1[stack1.length - 1] as any)?.mineDamage).toBe(5);
    // 两枚地雷 id 必须不同（createMineBuilding 走 nextId，应该是确定性 unique 的）
    expect((after.activeCards as any[])[1]?.id).not.toBe(stack1[stack1.length - 1]?.id);
  });
});

// ---------------------------------------------------------------------------
// 2) No amulet → no mine
// ---------------------------------------------------------------------------

describe('殒雷符：未装备时不触发', () => {
  it('没装殒雷符 → kill 后 slot 清空，不生成地雷', () => {
    const target = makeMonster('m-noamu', { hp: 5, maxHp: 5 });
    const dyingMonster: GameCardData = { ...target, defeatProcessed: true };
    const state = makeState({
      activeCards: activeRowOf(null, dyingMonster, null, null, null),
      // no amulet
    });

    const result = reduce(state, {
      type: 'UPDATE_ACTIVE_CARDS',
      updater: prev => {
        const next = [...prev] as any;
        next[1] = null;
        return next;
      },
    });

    expect((result.state.activeCards as any[])[1]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3) Stack-on-top: when slot is occupied at clear-time, mine stacks on top
// ---------------------------------------------------------------------------

describe('殒雷符：cell 已有卡时，2 个地雷堆叠在上面', () => {
  it('cell 被新卡填充 → 顶层最新地雷，stack 含原 occupant + 第一枚地雷', () => {
    const dying = { ...makeMonster('m-old'), defeatProcessed: true };
    const newMonster = makeMonster('m-new');
    const amulet = makeAmulet();
    const state = makeState({
      activeCards: activeRowOf(null, dying, null, null, null),
      amuletSlots: fillAmuletSlot(amulet),
    });

    const result = reduce(state, {
      type: 'UPDATE_ACTIVE_CARDS',
      updater: prev => {
        const next = [...prev] as any;
        next[1] = newMonster;
        return next;
      },
    });

    // 顶层是最新地雷（mine2）
    expect(isMine((result.state.activeCards as any[])[1])).toBe(true);
    // newMonster 进入 stack；mine1 也进入 stack（位于 next-to-pop 即 stack 末尾）
    const stack = result.state.activeCardStacks[1] ?? [];
    expect(stack.length).toBe(2);
    // stack 顺序：[原 occupant=m-new, mine1]（mine1 在末尾，next-to-pop）
    expect(stack[0]?.id).toBe('m-new');
    expect(isMine(stack[1] as any)).toBe(true);
  });

  it('cell 已有 stack（栈底怪物）+ 顶层 stack-pop 替换 → 2 个地雷在最上层、原 stack 保留', () => {
    const dying = { ...makeMonster('m-top'), defeatProcessed: true };
    const stackUnder = makeMonster('m-under');
    const amulet = makeAmulet();
    const state = makeState({
      activeCards: activeRowOf(null, dying, null, null, null),
      activeCardStacks: { 1: [stackUnder] },
      amuletSlots: fillAmuletSlot(amulet),
    });

    // 模拟 stack-pop：top 卡被替换为 stack-popped 卡
    const result = reduce(state, {
      type: 'UPDATE_ACTIVE_CARDS',
      updater: prev => {
        const next = [...prev] as any;
        next[1] = stackUnder;
        return next;
      },
    });

    // 顶层最新地雷
    expect(isMine((result.state.activeCards as any[])[1])).toBe(true);
    // 原 occupant + 第一枚地雷都在 stack 里
    const stack = result.state.activeCardStacks[1] ?? [];
    expect(stack.some(c => c.id === 'm-under')).toBe(true);
    expect(stack.filter(c => isMine(c as any)).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4) Multi-kill: AOE kills 2 monsters at different slots → 2 mines (one per slot)
// ---------------------------------------------------------------------------

describe('殒雷符：多怪物同时击杀', () => {
  it('两个怪物的 slot 同一帧清空 → 各自生成 2 个地雷（顶层 + stack[0]）', () => {
    const dyingA = { ...makeMonster('m-a'), defeatProcessed: true };
    const dyingB = { ...makeMonster('m-b'), defeatProcessed: true };
    const amulet = makeAmulet();
    const state = makeState({
      activeCards: activeRowOf(dyingA, null, dyingB, null, null),
      amuletSlots: fillAmuletSlot(amulet),
    });

    // 同一 reduce 清空两个 slot
    const result = reduce(state, {
      type: 'UPDATE_ACTIVE_CARDS',
      updater: prev => {
        const next = [...prev] as any;
        next[0] = null;
        next[2] = null;
        return next;
      },
    });

    // Slot 0：顶层 + stack 末尾各一枚地雷
    expect(isMine((result.state.activeCards as any[])[0])).toBe(true);
    const stack0 = result.state.activeCardStacks[0] ?? [];
    expect(stack0.length).toBe(1);
    expect(isMine(stack0[0] as any)).toBe(true);

    // Slot 2：同样 2 枚
    expect(isMine((result.state.activeCards as any[])[2])).toBe(true);
    const stack2 = result.state.activeCardStacks[2] ?? [];
    expect(stack2.length).toBe(1);
    expect(isMine(stack2[0] as any)).toBe(true);

    // 中间的 slot 1 / slot 3 / slot 4 不受影响
    expect((result.state.activeCards as any[])[1]).toBeNull();
    expect((result.state.activeCards as any[])[3]).toBeNull();
    expect((result.state.activeCards as any[])[4]).toBeNull();
  });

  it('A 先清空，B 后清空（分两次 reduce）→ 各自生成 2 个地雷', () => {
    const dyingA = { ...makeMonster('m-a'), defeatProcessed: true };
    const dyingB = { ...makeMonster('m-b'), defeatProcessed: true };
    const amulet = makeAmulet();
    let state = makeState({
      activeCards: activeRowOf(dyingA, null, dyingB, null, null),
      amuletSlots: fillAmuletSlot(amulet),
    });

    // 先清 A
    state = reduce(state, {
      type: 'UPDATE_ACTIVE_CARDS',
      updater: prev => {
        const next = [...prev] as any;
        next[0] = null;
        return next;
      },
    }).state;
    expect(isMine((state.activeCards as any[])[0])).toBe(true);
    expect((state.activeCardStacks[0] ?? []).length).toBe(1);
    expect((state.activeCards as any[])[2]?.id).toBe('m-b'); // B 还在等

    // 再清 B
    state = reduce(state, {
      type: 'UPDATE_ACTIVE_CARDS',
      updater: prev => {
        const next = [...prev] as any;
        next[2] = null;
        return next;
      },
    }).state;
    expect(isMine((state.activeCards as any[])[0])).toBe(true); // A 的顶层 mine 还在
    expect((state.activeCardStacks[0] ?? []).length).toBe(1); // A 的 stack mine 也还在
    expect(isMine((state.activeCards as any[])[2])).toBe(true);
    expect((state.activeCardStacks[2] ?? []).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5) Building / event removal does NOT trigger
// ---------------------------------------------------------------------------

describe('殒雷符：非怪物清除不触发', () => {
  it('building 卡（非怪物）从 slot 清除 → 不生成地雷', () => {
    const building: GameCardData = {
      id: 'b-1', type: 'building', name: 'Some Building', value: 0, image: '',
      hp: 1, maxHp: 1,
    };
    // 注意：building 不会被标 defeatProcessed: true，但即使有，type !== 'monster' 仍跳过
    const amulet = makeAmulet();
    const state = makeState({
      activeCards: activeRowOf(building, null, null, null, null),
      amuletSlots: fillAmuletSlot(amulet),
    });

    const result = reduce(state, {
      type: 'UPDATE_ACTIVE_CARDS',
      updater: prev => {
        const next = [...prev] as any;
        next[0] = null;
        return next;
      },
    });

    expect((result.state.activeCards as any[])[0]).toBeNull();
  });

  it('怪物没有 defeatProcessed 标记（如玩家弃牌等魔法移除）→ 不生成地雷', () => {
    const monster = makeMonster('m-removed-no-defeat');
    // No defeatProcessed flag — typical for magic-removal / event-flip paths
    const amulet = makeAmulet();
    const state = makeState({
      activeCards: activeRowOf(monster, null, null, null, null),
      amuletSlots: fillAmuletSlot(amulet),
    });

    const result = reduce(state, {
      type: 'UPDATE_ACTIVE_CARDS',
      updater: prev => {
        const next = [...prev] as any;
        next[0] = null;
        return next;
      },
    });

    expect((result.state.activeCards as any[])[0]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6) defeatProcessed staying still (animation period) → no premature spawn
// ---------------------------------------------------------------------------

describe('殒雷符：动画期间不预先生成', () => {
  it('MONSTER_DEFEATED reduce 后，slot 仍是 dying monster → 不生成地雷', () => {
    const target = makeMonster('m-d', { hp: 1, maxHp: 1 });
    const blade: GameCardData = {
      id: 'w', type: 'weapon', name: 'Blade', value: 5, image: '',
      durability: 2, maxDurability: 2,
    };
    const amulet = makeAmulet();
    const state = makeState({
      equipmentSlot1: blade as any,
      activeCards: activeRowOf(target, null, null, null, null),
      amuletSlots: fillAmuletSlot(amulet),
      combatState: {
        ...initialCombatState,
        heroAttacksRemaining: 1,
        heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
        engagedMonsterIds: [target.id],
      } as any,
    });

    const r1 = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: target.id,
    });
    const afterKill = drain(r1.state, r1.enqueuedActions ?? []).state;

    // 怪物还在原 slot（带 defeatProcessed: true），还没被替换为 mine
    const slot0 = (afterKill.activeCards as any[])[0];
    expect(slot0?.id).toBe('m-d');
    expect(slot0?.defeatProcessed).toBe(true);
    expect(isMine(slot0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7) Card definition assertions
// ---------------------------------------------------------------------------

describe('殒雷符 卡牌定义', () => {
  it('在 generateKnightDeck 中可被找到，含 unique: true / amuletEffect: kill-cell-mine', () => {
    const [deck] = generateKnightDeck(createRng(123));
    const card = deck.find(c => c.name === '殒雷符');
    expect(card).toBeDefined();
    expect(card?.type).toBe('amulet');
    expect((card as any)?.unique).toBe(true);
    expect((card as any)?.amuletEffect).toBe('kill-cell-mine');
    expect((card as any)?.classCard).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8) Mine triggers correctly after spawning (combined with monster falling)
// ---------------------------------------------------------------------------

describe('殒雷符 + 瀑流：生成的 2 个地雷在下一波瀑流可连环触发', () => {
  it('2 个 mine 生成后，怪物瀑流落到该 slot → 连环引爆 2 次 5 伤（共 10）+ 2 mine 都进坟场', () => {
    const dying = { ...makeMonster('m-d'), defeatProcessed: true };
    const amulet = makeAmulet();

    // Step 1: 触发 2 个 mine 生成
    let state = makeState({
      activeCards: activeRowOf(null, null, dying, null, null),
      amuletSlots: fillAmuletSlot(amulet),
    });
    state = reduce(state, {
      type: 'UPDATE_ACTIVE_CARDS',
      updater: prev => {
        const next = [...prev] as any;
        next[2] = null;
        return next;
      },
    }).state;
    expect(isMine((state.activeCards as any[])[2])).toBe(true);
    expect((state.activeCardStacks[2] ?? []).length).toBe(1);
    expect(isMine(state.activeCardStacks[2][0] as any)).toBe(true);

    // Step 2: 配置瀑流：怪物落到 slot 2 → 应该连环触发 2 个 mine
    const fallMonster = makeMonster('m-fall', { hp: 30, maxHp: 30 });
    state = {
      ...state,
      previewCards: [null, null, fallMonster, null, null] as unknown as ActiveRowSlots,
      pendingWaterfallPlan: {
        dropAssignments: [{ previewIndex: 2, card: fallMonster, slotIndex: 2 }],
        resolvedDropCards: [fallMonster],
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

    const engine = new GameEngine(state);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });
    const mineEvents: any[] = [];
    engine.on('combat:mineTriggered', p => { mineEvents.push(p); });

    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });

    const finalState = engine.getState();
    // 2 个 mine 各发一次 combat:mineTriggered，每次 5 伤
    expect(mineEvents.length).toBe(2);
    expect(mineEvents[0]?.damage).toBe(5);
    expect(mineEvents[1]?.damage).toBe(5);
    // 怪物落到 slot 后受 5 + 5 = 10 伤；30 - 10 = 20
    expect((finalState.activeCards as any[])[2]?.id).toBe('m-fall');
    expect((finalState.activeCards as any[])[2]?.hp).toBe(20);
    // 2 个 mine 都进坟场
    expect(finalState.discardedCards.filter(c => isMine(c)).length).toBe(2);
  });

  it('生成的 2 个地雷与「引雷阵锋」globalMineDamageBonus 协同（每枚 +bonus）', () => {
    const dying = { ...makeMonster('m-d'), defeatProcessed: true };
    const amulet = makeAmulet();

    let state = makeState({
      activeCards: activeRowOf(null, null, dying, null, null),
      amuletSlots: fillAmuletSlot(amulet),
      globalMineDamageBonus: 4, // 假设之前用过引雷阵锋
    });
    state = reduce(state, {
      type: 'UPDATE_ACTIVE_CARDS',
      updater: prev => {
        const next = [...prev] as any;
        next[2] = null;
        return next;
      },
    }).state;
    expect(isMine((state.activeCards as any[])[2])).toBe(true);

    // 让 2 个 mine 都触发
    const fallMonster = makeMonster('m-fall', { hp: 30, maxHp: 30 });
    state = {
      ...state,
      previewCards: [null, null, fallMonster, null, null] as unknown as ActiveRowSlots,
      pendingWaterfallPlan: {
        dropAssignments: [{ previewIndex: 2, card: fallMonster, slotIndex: 2 }],
        resolvedDropCards: [fallMonster],
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

    const engine = new GameEngine(state);
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });
    const mineEvents: any[] = [];
    engine.on('combat:mineTriggered', p => { mineEvents.push(p); });

    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });

    const finalState = engine.getState();
    // 2 个 mine 各 5+4=9 伤；总共 18 伤；30 - 18 = 12
    expect(mineEvents.length).toBe(2);
    expect(mineEvents[0]?.damage).toBe(9);
    expect(mineEvents[1]?.damage).toBe(9);
    expect((finalState.activeCards as any[])[2]?.hp).toBe(12);
  });
});
