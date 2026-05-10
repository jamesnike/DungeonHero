/**
 * 殒雷符 (kill-cell-mine amulet, unique) — Knight class amulet.
 *
 * Behavior:
 *   - 每击杀一只怪物，立即在该 cell 生成一个「地雷」幽灵建筑。
 *   - 地雷复用 createMineBuilding（5 点纯伤、ghost、踩到即触发 + 进坟场）。
 *   - 任何来源击杀都触发：武器 / magic / 反震 / 弃牌伤害 / 遗言伤害 / 地雷自己。
 *   - 「stack on top」：cell 在 mine 落下时已被占（stack-pop / swarm-buglet /
 *     瀑流后续）→ 地雷堆叠在上面，原 occupant 推入 activeCardStacks。
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

describe('殒雷符：单怪物击杀 → 该 cell 生成地雷', () => {
  it('PERFORM_HERO_ATTACK 杀怪 + 之后 UPDATE_ACTIVE_CARDS 清空 slot → 地雷生成', () => {
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

    // postProcessActiveCards step 3.5 应该检测到 defeatProcessed 离场 → 放地雷
    const after = r2.state;
    expect(isMine((after.activeCards as any[])[1])).toBe(true);
    expect((after.activeCards as any[])[1]?.mineDamage).toBe(5);
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

describe('殒雷符：cell 已有卡时，地雷堆叠在上面', () => {
  it('stack-pop：栈底有怪物 → 击杀栈顶 → 地雷堆叠在 stack-popped 怪物上', () => {
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

    // 地雷应该堆叠在 stackUnder 上
    expect(isMine((result.state.activeCards as any[])[1])).toBe(true);
    expect(result.state.activeCardStacks[1]).toBeDefined();
    expect(result.state.activeCardStacks[1].some(c => c.id === 'm-under')).toBe(true);
  });

  it('cell 被新卡填充 → 地雷堆叠在新卡上', () => {
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

    expect(isMine((result.state.activeCards as any[])[1])).toBe(true);
    // newMonster 被压入栈
    expect(result.state.activeCardStacks[1]?.some(c => c.id === 'm-new')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4) Multi-kill: AOE kills 2 monsters at different slots → 2 mines (one per slot)
// ---------------------------------------------------------------------------

describe('殒雷符：多怪物同时击杀', () => {
  it('两个怪物的 slot 同一帧清空 → 两个地雷', () => {
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

    expect(isMine((result.state.activeCards as any[])[0])).toBe(true);
    expect(isMine((result.state.activeCards as any[])[2])).toBe(true);
    // 中间的 slot 1 / slot 3 / slot 4 不受影响
    expect((result.state.activeCards as any[])[1]).toBeNull();
    expect((result.state.activeCards as any[])[3]).toBeNull();
    expect((result.state.activeCards as any[])[4]).toBeNull();
  });

  it('A 先清空，B 后清空（分两次 reduce）→ 各自生成一个地雷', () => {
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
    expect(isMine((state.activeCards as any[])[0])).toBe(true); // A 的 mine 还在
    expect(isMine((state.activeCards as any[])[2])).toBe(true);
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

describe('殒雷符 + 瀑流：生成的地雷在下一波瀑流可正常触发', () => {
  it('mine 生成后，怪物瀑流落到该 slot → 5 点纯伤 + mine 进坟场', () => {
    const dying = { ...makeMonster('m-d'), defeatProcessed: true };
    const amulet = makeAmulet();

    // Step 1: 触发 mine 生成
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
    const mineCard = (state.activeCards as any[])[2];
    expect(isMine(mineCard)).toBe(true);

    // Step 2: 配置瀑流：怪物落到 slot 2 → 应该触发 mine
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
    let mineEvent: any = null;
    engine.on('combat:mineTriggered', p => { mineEvent = p; });

    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });

    const finalState = engine.getState();
    expect(mineEvent?.damage).toBe(5);
    expect((finalState.activeCards as any[])[2]?.id).toBe('m-fall');
    expect((finalState.activeCards as any[])[2]?.hp).toBe(25);
    // mine 进坟场
    expect(finalState.discardedCards.some(c => isMine(c))).toBe(true);
  });

  it('生成的地雷与「引雷阵锋」globalMineDamageBonus 协同', () => {
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
    const mineCard = (state.activeCards as any[])[2];
    expect(isMine(mineCard)).toBe(true);

    // 让 mine 触发
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
    let mineEvent: any = null;
    engine.on('combat:mineTriggered', p => { mineEvent = p; });

    engine.dispatch({ type: 'APPLY_WATERFALL_DROP' });

    const finalState = engine.getState();
    // 5 (base) + 4 (globalMineDamageBonus) = 9 伤
    expect(mineEvent?.damage).toBe(9);
    expect((finalState.activeCards as any[])[2]?.hp).toBe(21); // 30 - 9
  });
});
