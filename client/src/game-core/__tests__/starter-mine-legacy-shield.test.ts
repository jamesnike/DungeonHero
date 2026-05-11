/**
 * 殉雷遗盾 (mineLegacyShield) — starter shield with last words: spawn a mine
 * at a random empty cell or ghost-occupied cell in the active row.
 *
 * Behavior:
 *   - 装备遗言：在 active row 的随机「空位 OR 含 ghost building 的格子」生成
 *     一个「地雷」幽灵建筑。
 *   - 地雷复用 createMineBuilding（5 点纯伤、ghost、踩到即触发 + 进坟场）。
 *   - 受「引雷阵锋」globalMineDamageBonus 加成（在 waterfall 触发分支处算）。
 *   - 选位（uniform pool）：空位 + ghost 格 合并随机抽；怪物 / 事件 / 非 ghost
 *     建筑占用的格不算可用。
 *   - 落到 ghost 格时：原 ghost 沉到 activeCardStacks[col] 末尾（next-to-pop
 *     位），新地雷成为顶层。
 *   - 全无可用位置 → fizzle + banner 提示，不生成。
 *   - 跟「墓园守卫」amulet 协同：N+1 次触发，每次都尝试生成 1 个，无可用位置即跳过。
 *
 * 触发路径：
 *   - computeEquipmentBreakEffects（耐久归零自然销毁）
 *   - computeEquipmentDisplacementLastWords（顶替 / 弃装重铸 / 灵魂置换）
 *   两者都走 applyOneEquipmentLastWordsIteration，handler 只写一份就两条路径都覆盖。
 */

import { describe, expect, it } from 'vitest';
import {
  computeEquipmentBreakEffects,
  computeEquipmentDisplacementLastWords,
} from '../rules/equipment-effects';
import { createInitialGameState } from '../state';
import { createStarterCardPool, STARTER_CARD_IDS } from '../deck';
import { createRng } from '../rng';
import { createEmptyAmuletEffects, initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import type { GameCardData } from '@/components/GameCard';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as unknown as ActiveRowSlots,
    combatState: { ...initialCombatState, currentTurn: 'hero' } as any,
    phase: 'playerInput' as any,
    rng: createRng(42),
    ...overrides,
  };
}

function makeShield(): GameCardData {
  // 跟 createStarterCardPool 里 殉雷遗盾 完全一致的 fixture
  return {
    id: 'shield-mine-legacy-test',
    type: 'shield',
    name: '殉雷遗盾',
    value: 3,
    image: '',
    durability: 1, // 即将损毁
    maxDurability: 2,
    armorMax: 3,
    onDestroyEffect: 'spawn-mine-empty',
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

function isMine(card: GameCardData | null | undefined): boolean {
  return !!card && card.type === 'building' && card.name === '地雷' && (card as any).mineDamage === 5;
}

// ---------------------------------------------------------------------------
// 1) Card definition assertions
// ---------------------------------------------------------------------------

describe('殉雷遗盾 — 卡牌定义', () => {
  it('createStarterCardPool 包含 殉雷遗盾，含正确属性', () => {
    const pool = createStarterCardPool();
    const card = pool.find(c => c.id === STARTER_CARD_IDS.mineLegacyShield);
    expect(card).toBeTruthy();
    expect(card?.type).toBe('shield');
    expect(card?.name).toBe('殉雷遗盾');
    expect(card?.value).toBe(3);
    expect(card?.armorMax).toBe(3);
    expect(card?.durability).toBe(2);
    expect(card?.maxDurability).toBe(2);
    expect((card as any)?.onDestroyEffect).toBe('spawn-mine-empty');
  });
});

// ---------------------------------------------------------------------------
// 2) Equipment break (durability=0) → mine spawn at empty cell
// ---------------------------------------------------------------------------

describe('殉雷遗盾 — 耐久归零销毁', () => {
  it('正常销毁 → 在 active row 的空 cell 生成 1 个地雷', () => {
    const shield = makeShield();
    const monster = makeMonster('m-1');
    const state = makeState({
      equipmentSlot1: shield as any,
      activeCards: activeRowOf(monster, null, null, null, null),
    });

    const result = computeEquipmentBreakEffects(state, 'equipmentSlot1', shield, createEmptyAmuletEffects());

    // 地雷应该出现在 slot 1, 2, 3, 或 4（空位之一）
    const nextActive = (result.patch.activeCards ?? state.activeCards) as any[];
    const mineCount = nextActive.filter(isMine).length;
    expect(mineCount).toBe(1);

    // slot 0 还是怪物，没被覆盖
    expect(nextActive[0]?.id).toBe('m-1');

    // banner 触发
    const banners = result.sideEffects.filter(s => s.event === 'ui:banner');
    expect(banners.some(b => (b.payload as any).text?.includes('布下地雷'))).toBe(true);
  });

  it('全空的 active row → 地雷出现在某一格', () => {
    const shield = makeShield();
    const state = makeState({
      equipmentSlot1: shield as any,
      activeCards: activeRowOf(null, null, null, null, null),
    });

    const result = computeEquipmentBreakEffects(state, 'equipmentSlot1', shield, createEmptyAmuletEffects());
    const nextActive = (result.patch.activeCards ?? state.activeCards) as any[];
    expect(nextActive.filter(isMine).length).toBe(1);
  });

  it('active row 全满（5 个怪物）→ fizzle，不生成地雷，仍然给 banner 提示', () => {
    const shield = makeShield();
    const state = makeState({
      equipmentSlot1: shield as any,
      activeCards: activeRowOf(
        makeMonster('m-1'),
        makeMonster('m-2'),
        makeMonster('m-3'),
        makeMonster('m-4'),
        makeMonster('m-5'),
      ),
    });

    const result = computeEquipmentBreakEffects(state, 'equipmentSlot1', shield, createEmptyAmuletEffects());

    // patch.activeCards 不一定被设置（因为没有变化），但任何情况下没有 mine 出现
    const nextActive = (result.patch.activeCards ?? state.activeCards) as any[];
    expect(nextActive.filter(isMine).length).toBe(0);

    // 仍然有 banner 提示「无可用位置」
    const banners = result.sideEffects.filter(s => s.event === 'ui:banner');
    expect(banners.some(b => (b.payload as any).text?.includes('无可用位置'))).toBe(true);
  });

  it('全场是 怪物 + 非 ghost 建筑（无空位 / 无 ghost）→ fizzle', () => {
    const shield = makeShield();
    const nonGhostBuilding: GameCardData = {
      id: 'wall',
      type: 'building',
      name: 'NonGhostWall',
      value: 0,
      image: '',
      isGhost: false, // 关键：非 ghost
      hp: 1,
      maxHp: 1,
    };
    const state = makeState({
      equipmentSlot1: shield as any,
      activeCards: activeRowOf(
        nonGhostBuilding,
        makeMonster('m-1'), makeMonster('m-2'), makeMonster('m-3'), makeMonster('m-4'),
      ),
    });

    const result = computeEquipmentBreakEffects(state, 'equipmentSlot1', shield, createEmptyAmuletEffects());
    const nextActive = (result.patch.activeCards ?? state.activeCards) as any[];
    expect(nextActive.filter(isMine).length).toBe(0);
    const banners = result.sideEffects.filter(s => s.event === 'ui:banner');
    expect(banners.some(b => (b.payload as any).text?.includes('无可用位置'))).toBe(true);
  });

  it('生成的地雷具备完整的 mine 属性（5 点 mineDamage、ghost、type=building）', () => {
    const shield = makeShield();
    const state = makeState({
      equipmentSlot1: shield as any,
      activeCards: activeRowOf(null, null, null, null, null),
    });

    const result = computeEquipmentBreakEffects(state, 'equipmentSlot1', shield, createEmptyAmuletEffects());
    const nextActive = (result.patch.activeCards ?? state.activeCards) as any[];
    const mine = nextActive.find(isMine);
    expect(mine).toBeTruthy();
    expect(mine?.type).toBe('building');
    expect(mine?.isGhost).toBe(true);
    expect(mine?.mineDamage).toBe(5);
    expect(mine?.name).toBe('地雷');
  });

  it('含 ghost building 的 slot 也算可选（uniform pool）→ 地雷可能落在 ghost 上面（stack-on-top）', () => {
    const shield = makeShield();
    const ghostBuilding: GameCardData = {
      id: 'g-1',
      type: 'building',
      name: 'Some Ghost',
      value: 0,
      image: '',
      isGhost: true,
      hp: 1,
      maxHp: 1,
    };
    const state = makeState({
      equipmentSlot1: shield as any,
      // 候选池 = [0(ghost), 1, 2, 3, 4]
      activeCards: activeRowOf(ghostBuilding, null, null, null, null),
    });

    const result = computeEquipmentBreakEffects(state, 'equipmentSlot1', shield, createEmptyAmuletEffects());
    const nextActive = (result.patch.activeCards ?? state.activeCards) as any[];

    // 总共 1 个地雷（顶层）
    expect(nextActive.filter(isMine).length).toBe(1);
    // 找到地雷所在 slot
    const mineIdx = nextActive.findIndex(isMine);
    expect([0, 1, 2, 3, 4]).toContain(mineIdx);
    if (mineIdx === 0) {
      // 落在 ghost 上：原 ghost 应被推到 activeCardStacks[0] 下层
      const stacks = (result.patch.activeCardStacks ?? state.activeCardStacks) as Record<number, GameCardData[]>;
      expect(stacks[0]?.[stacks[0].length - 1]?.id).toBe('g-1');
    } else {
      // 落在其它真空 slot：ghost 仍在原位，stack 没变
      expect(nextActive[0]?.id).toBe('g-1');
    }
  });

  it('全场只有 ghost building（无空位）→ 地雷必落在 ghost 格上，原 ghost 进 stack', () => {
    const shield = makeShield();
    const ghostBuilding: GameCardData = {
      id: 'g-only',
      type: 'building',
      name: 'Some Ghost',
      value: 0,
      image: '',
      isGhost: true,
      hp: 1,
      maxHp: 1,
    };
    const state = makeState({
      equipmentSlot1: shield as any,
      // 候选池只剩 slot 0
      activeCards: activeRowOf(
        ghostBuilding,
        makeMonster('m-1'), makeMonster('m-2'), makeMonster('m-3'), makeMonster('m-4'),
      ),
    });

    const result = computeEquipmentBreakEffects(state, 'equipmentSlot1', shield, createEmptyAmuletEffects());
    const nextActive = (result.patch.activeCards ?? state.activeCards) as any[];

    // 地雷必在 slot 0
    expect(isMine(nextActive[0])).toBe(true);
    // ghost 沉到下层 stack
    const stacks = (result.patch.activeCardStacks ?? state.activeCardStacks) as Record<number, GameCardData[]>;
    expect(stacks[0]?.[stacks[0].length - 1]?.id).toBe('g-only');
  });
});

// ---------------------------------------------------------------------------
// 3) Displacement (顶替) → mine spawn fires
// ---------------------------------------------------------------------------

describe('殉雷遗盾 — 顶替路径（computeEquipmentDisplacementLastWords）', () => {
  it('被另一件装备顶替 → 遗言触发 → 地雷生成', () => {
    const shield = makeShield();
    const state = makeState({
      equipmentSlot2: shield as any,
      activeCards: activeRowOf(null, null, null, null, null),
    });

    const result = computeEquipmentDisplacementLastWords(
      state,
      'equipmentSlot2',
      shield,
      createEmptyAmuletEffects(),
    );

    const nextActive = (result.patch.activeCards ?? state.activeCards) as any[];
    expect(nextActive.filter(isMine).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4) 墓园守卫 amulet (lastWordsExtraTriggerCount) — multi-spawn
// ---------------------------------------------------------------------------

describe('殉雷遗盾 — 跟「墓园守卫」amulet 协同', () => {
  it('lastWordsExtraTriggerCount=1 → 总共触发 2 次 → 在 2 个不同空位生成 2 个地雷', () => {
    const shield = makeShield();
    const state = makeState({
      equipmentSlot1: shield as any,
      activeCards: activeRowOf(null, null, null, null, null),
    });

    const aeWithStack = { ...createEmptyAmuletEffects(), lastWordsExtraTriggerCount: 1 };
    const result = computeEquipmentBreakEffects(state, 'equipmentSlot1', shield, aeWithStack);

    const nextActive = (result.patch.activeCards ?? state.activeCards) as any[];
    expect(nextActive.filter(isMine).length).toBe(2);
  });

  it('lastWordsExtraTriggerCount=2 → 触发 3 次：起始 2 个空位也能堆出 3 枚地雷（前一次的地雷自身是 ghost，第三次可堆叠）', () => {
    const shield = makeShield();
    // 只剩 2 个空位
    const state = makeState({
      equipmentSlot1: shield as any,
      activeCards: activeRowOf(
        makeMonster('m-1'),
        null,
        makeMonster('m-3'),
        null,
        makeMonster('m-5'),
      ),
    });

    const aeWithStack = { ...createEmptyAmuletEffects(), lastWordsExtraTriggerCount: 2 };
    const result = computeEquipmentBreakEffects(state, 'equipmentSlot1', shield, aeWithStack);

    const nextActive = (result.patch.activeCards ?? state.activeCards) as any[];
    const stacks = (result.patch.activeCardStacks ?? state.activeCardStacks) as Record<number, GameCardData[]>;

    // 总数 = 顶层地雷 + stack 中堆叠的地雷 = 3（每次触发都成功，allow_same_cell-like）
    const visibleMines = nextActive.filter(isMine).length;
    let stackedMines = 0;
    for (const s of Object.values(stacks)) {
      stackedMines += s.filter(isMine).length;
    }
    expect(visibleMines + stackedMines).toBe(3);

    // 每次都有可用位置，不应有「无可用位置」banner
    const banners = result.sideEffects.filter(s => s.event === 'ui:banner');
    const fizzleBanners = banners.filter(b => (b.payload as any).text?.includes('无可用位置'));
    expect(fizzleBanners.length).toBe(0);
  });

  it('lastWordsExtraTriggerCount=3 + 全场怪物（无空位 / 无 ghost）→ 4 次都 fizzle', () => {
    const shield = makeShield();
    const state = makeState({
      equipmentSlot1: shield as any,
      activeCards: activeRowOf(
        makeMonster('m-1'),
        makeMonster('m-2'),
        makeMonster('m-3'),
        makeMonster('m-4'),
        makeMonster('m-5'),
      ),
    });

    const aeWithStack = { ...createEmptyAmuletEffects(), lastWordsExtraTriggerCount: 3 };
    const result = computeEquipmentBreakEffects(state, 'equipmentSlot1', shield, aeWithStack);

    const nextActive = (result.patch.activeCards ?? state.activeCards) as any[];
    expect(nextActive.filter(isMine).length).toBe(0);
    const banners = result.sideEffects.filter(s => s.event === 'ui:banner');
    const fizzleBanners = banners.filter(b => (b.payload as any).text?.includes('无可用位置'));
    expect(fizzleBanners.length).toBe(4); // 4 = 1 base + 3 extra
  });
});

// ---------------------------------------------------------------------------
// 5) Other shields don't accidentally inherit this effect
// ---------------------------------------------------------------------------

describe('殉雷遗盾 — onDestroyEffect 不污染其它装备', () => {
  it('遗愿重盾（slot-temp-armor-3）触发原本的 +3 临时护甲，不生成地雷', () => {
    const shield: GameCardData = {
      id: 'legacy',
      type: 'shield',
      name: '遗愿重盾',
      value: 3,
      image: '',
      durability: 1,
      maxDurability: 2,
      armorMax: 3,
      onDestroyEffect: 'slot-temp-armor-3',
    } as GameCardData;
    const state = makeState({
      equipmentSlot1: shield as any,
      activeCards: activeRowOf(null, null, null, null, null),
    });

    const result = computeEquipmentBreakEffects(state, 'equipmentSlot1', shield, createEmptyAmuletEffects());
    const nextActive = (result.patch.activeCards ?? state.activeCards) as any[];

    expect(nextActive.filter(isMine).length).toBe(0);
    // 验证 +3 临时护甲实际触发
    expect(result.patch.slotTempArmor?.equipmentSlot1).toBe(3);
  });
});
